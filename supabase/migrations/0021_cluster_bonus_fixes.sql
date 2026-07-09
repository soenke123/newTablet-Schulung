-- ══════════════════════════════════════════════════════════════
-- Migration 0021 — Cluster-Bonus-Fixes
-- ══════════════════════════════════════════════════════════════
-- Zwei Fixes zu Migration 0020, damit der Bonus auch beim
-- Signup ausgeschüttet wird (nicht nur bei Admin-Zuweisung):
--
--   1) Execute-Grant für service_role explizit setzen.
--      Signup läuft aus einer Vercel-Function mit service_role-JWT;
--      ohne dieses Grant wirft der RPC-Aufruf "permission denied".
--
--   2) apply_cluster_bonus neu definieren mit robusterer Auth-
--      Prüfung. `null;` als NoOp in PL/pgSQL ist zwar syntaktisch
--      erlaubt, aber wir schreiben's als sauberen Kommentar-Zweig,
--      damit es keine Interpretationsspielräume gibt.
-- ══════════════════════════════════════════════════════════════

-- 1) Grants nachziehen (idempotent)
grant execute on function random_baby_from_season(int) to service_role;
grant execute on function apply_cluster_bonus(uuid)     to service_role;

-- 2) apply_cluster_bonus neu erstellen — nur Auth-Zweig geändert,
--    Rest identisch zu Migration 0020.
create or replace function apply_cluster_bonus(p_user_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_caller     uuid := auth.uid();
  v_is_admin   boolean;
  v_cluster_id uuid;
  v_bonus      record;
  v_season     int;
  v_game       record;
  v_baby       text;
  v_games_unlocked int := 0;
  v_babies_placed  int := 0;
  v_existing_creature text;
  v_current_shop  jsonb;
  v_current_coins int;
begin
  -- 1) Autorisierung
  if v_caller is not null then
    -- Authenticated Kontext: nur Admins dürfen für andere User Bonus auslösen.
    select is_admin into v_is_admin from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;
  -- v_caller is null → service_role Kontext (Vercel-Function): erlaubt,
  -- keine weitere Prüfung nötig — service_role hat volle Rechte.

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  -- 2) Cluster des Users
  select cluster_id into v_cluster_id from profiles where id = p_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_cluster');
  end if;

  -- 3) Aktiver Bonus für diesen Cluster
  select * into v_bonus
  from cluster_bonus
  where cluster_id = v_cluster_id and active = true;
  if not found then
    return jsonb_build_object('ok', true, 'skipped', 'no_active_bonus');
  end if;

  -- 4) Schon gewährt?
  if exists (select 1 from cluster_bonus_grants
             where user_id = p_user_id and cluster_id = v_cluster_id) then
    return jsonb_build_object('ok', true, 'skipped', 'already_granted');
  end if;

  -- 5) Grant eintragen. ON CONFLICT DO NOTHING schützt gegen Race,
  --    RETURNING liefert nichts wenn Konflikt → dann ebenfalls skip.
  begin
    insert into cluster_bonus_grants (user_id, cluster_id, granted_at)
    values (p_user_id, v_cluster_id, now());
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'skipped', 'race_already_granted');
  end;

  -- 6) Pro Season: Spiele freischalten + Baby-Monster verteilen
  foreach v_season in array v_bonus.seasons loop
    for v_game in
      select id from games
      where season = v_season and active = true
    loop
      -- 6a) Freischaltung (idempotent)
      insert into user_unlocked_games (user_id, game_id, unlocked_at)
      values (p_user_id, v_game.id, now())
      on conflict (user_id, game_id) do nothing;
      if found then
        v_games_unlocked := v_games_unlocked + 1;
      end if;

      -- 6b) Baby-Monster nur setzen wenn Slot leer.
      select creature into v_existing_creature
      from game_state where user_id = p_user_id and game_id = v_game.id;

      if v_existing_creature is null then
        v_baby := random_baby_from_season(v_season);
        insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
        values (p_user_id, v_game.id, 0, 0, v_baby, 0, 0, now())
        on conflict (user_id, game_id) do update set
          creature   = coalesce(game_state.creature, excluded.creature),
          updated_at = now();
        v_babies_placed := v_babies_placed + 1;
      end if;
    end loop;
  end loop;

  -- 7) Startcoins auf shop_state.bankedCoins addieren.
  if v_bonus.startup_coins > 0 then
    select value into v_current_shop
    from user_collectibles
    where user_id = p_user_id and key = 'shop_state';

    v_current_coins := coalesce((v_current_shop->>'bankedCoins')::int, 0);

    insert into user_collectibles (user_id, key, value, updated_at)
    values (
      p_user_id,
      'shop_state',
      jsonb_set(
        coalesce(v_current_shop, '{}'::jsonb),
        '{bankedCoins}',
        to_jsonb(v_current_coins + v_bonus.startup_coins)
      ),
      now()
    )
    on conflict (user_id, key) do update set
      value      = jsonb_set(
                     coalesce(user_collectibles.value, '{}'::jsonb),
                     '{bankedCoins}',
                     to_jsonb(coalesce((user_collectibles.value->>'bankedCoins')::int, 0) + v_bonus.startup_coins)
                   ),
      updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'cluster_id', v_cluster_id,
    'coins_added', v_bonus.startup_coins,
    'games_unlocked', v_games_unlocked,
    'babies_placed', v_babies_placed,
    'seasons', v_bonus.seasons
  );
end;
$$;

-- Grants nochmal nachziehen für die neu erstellte Function
revoke all on function apply_cluster_bonus(uuid) from public;
grant execute on function apply_cluster_bonus(uuid) to authenticated;
grant execute on function apply_cluster_bonus(uuid) to service_role;
