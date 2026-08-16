-- ══════════════════════════════════════════════════════════════
-- Migration 0073 — kein Baby-Monster für das Easter-Egg
-- ══════════════════════════════════════════════════════════════
-- Die Cluster-Starthilfe verteilt "alle Spiele der Season" und legt
-- zu jedem ein Baby-Monster. Die Spieleliste kommt aus `games`, und
-- darin steht seit jeher auch `game1337` — das Easter-Egg hinter
-- 1337.html. Jeder Season-1-User bekam damit ein Monster für eine
-- Kachel, die es im Hub gar nicht gibt: unsichtbar in Galerie und
-- Grid (game1337 steht nicht in GAMES_CONFIG), aber in der
-- Monster-Rangliste mitgezählt.
--
-- 0072 hat für genau diese Frage schon ein Merkmal eingeführt:
-- games.cluster_managed. Die Starthilfe liest es ab jetzt mit —
-- damit gibt es weiterhin eine Antwort auf "gehört dieses Spiel zum
-- Kursbetrieb?" und nicht zwei.
--
-- Reihenfolge in dieser Datei:
--   1) apply_cluster_bonus() — Neuauflage auf Basis 0053
--   2) Altbestand: die bereits verteilten Phantom-Monster
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) apply_cluster_bonus() — Neuauflage auf Basis 0053
-- ─────────────────────────────────────────────────────────────
-- Einzige Änderung gegenüber 0053: `and cluster_managed` in der
-- Spiele-Schleife. Damit fällt game1337 aus beidem heraus — aus der
-- Freischaltung (user_unlocked_games) wie aus dem Baby-Monster.
-- Alles andere ist unverändert übernommen: der Admin-Guard aus 0053,
-- der game16-Übersprung aus 0048, die Startcoins nach bankedCoins
-- und der ensure_legi_grant-Aufruf.
create or replace function apply_cluster_bonus(p_user_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_caller     uuid := auth.uid();
  v_is_admin   boolean;
  v_target     record;
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
  v_legi_granted  boolean := false;
begin
  if v_caller is not null then
    select is_admin or is_superadmin into v_is_admin
      from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  -- GUARD 0053: Admin/Superadmin bekommt keinen Cluster-Bonus.
  -- Er darf einem Cluster zugewiesen sein, um zu beobachten, aber
  -- kriegt weder Startcoins noch Baby-Monster.
  select cluster_id, is_admin, is_superadmin into v_target
    from profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  if coalesce(v_target.is_admin, false) or coalesce(v_target.is_superadmin, false) then
    return jsonb_build_object('ok', true, 'skipped', 'target_is_admin');
  end if;

  v_cluster_id := v_target.cluster_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_cluster');
  end if;

  v_legi_granted := ensure_legi_grant(p_user_id, v_cluster_id);

  select * into v_bonus
  from cluster_bonus
  where cluster_id = v_cluster_id and active = true;
  if not found then
    return jsonb_build_object(
      'ok', true, 'skipped', 'no_active_bonus',
      'legi_granted', v_legi_granted
    );
  end if;

  if exists (select 1 from cluster_bonus_grants
             where user_id = p_user_id and cluster_id = v_cluster_id) then
    return jsonb_build_object(
      'ok', true, 'skipped', 'already_granted',
      'legi_granted', v_legi_granted
    );
  end if;

  begin
    insert into cluster_bonus_grants (user_id, cluster_id, granted_at)
    values (p_user_id, v_cluster_id, now());
  exception when unique_violation then
    return jsonb_build_object(
      'ok', true, 'skipped', 'race_already_granted',
      'legi_granted', v_legi_granted
    );
  end;

  foreach v_season in array v_bonus.seasons loop
    for v_game in
      -- FIX 0073: cluster_managed = false (game1337) bleibt draußen.
      -- Ein Easter-Egg ist kein Kursinhalt und bekommt deshalb weder
      -- eine Freischaltung noch ein Monster.
      select id from games
      where season = v_season and active = true and cluster_managed = true
    loop
      insert into user_unlocked_games (user_id, game_id, unlocked_at)
      values (p_user_id, v_game.id, now())
      on conflict (user_id, game_id) do nothing;
      if found then
        v_games_unlocked := v_games_unlocked + 1;
      end if;

      -- game16 (Einhornkatze/Legi-Trainer) NICHT mit Zufalls-Baby
      -- befüllen (Regel aus Migration 0048).
      if v_game.id = 'game16' then
        continue;
      end if;

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

    insert into wallets (user_id, coins, bonus_coins_granted, updated_at)
    values (p_user_id, 0, v_bonus.startup_coins, now())
    on conflict (user_id) do update set
      bonus_coins_granted = wallets.bonus_coins_granted + v_bonus.startup_coins,
      updated_at          = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'cluster_id', v_cluster_id,
    'coins_added', v_bonus.startup_coins,
    'games_unlocked', v_games_unlocked,
    'babies_placed', v_babies_placed,
    'seasons', v_bonus.seasons,
    'legi_granted', v_legi_granted
  );
end;
$$;

revoke all on function apply_cluster_bonus(uuid) from public;
grant execute on function apply_cluster_bonus(uuid) to authenticated;
grant execute on function apply_cluster_bonus(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) Altbestand — die schon verteilten Phantom-Monster
-- ─────────────────────────────────────────────────────────────
-- Die Funktion oben verhindert nur neue. Die bereits verteilten
-- stehen weiter in der Rangliste, und dort ist das Monster ja auch
-- das einzige, was von ihnen sichtbar ist.
--
-- Nachweis, dass hier nichts Erspieltes wegfällt: 1337.html schreibt
-- ausschließlich in den Shop-Blob (saveShopData für atariSolved und
-- den Avatar) und ruft nie saveGameData('game1337'). Ein game_state
-- für game1337 kann also nur aus der Starthilfe stammen.
--
-- Die vier Nullbedingungen sind trotzdem gesetzt: fiele die Annahme
-- irgendwann, bliebe eine Zeile mit Punkten, Runden, Wachstum oder
-- Münzen stehen, statt still gelöscht zu werden. Zurückgeholt werden
-- kann eine gelöschte Zeile nicht.
--
-- Kein Aufräumen in user_unlocked_games: die Zeilen dort sind seit
-- 0070 bedeutungslos, aber auch harmlos — und sie sind der Beleg
-- dafür, wo die Starthilfe schon einmal gelaufen ist.
delete from game_state
 where game_id       = 'game1337'
   and coalesce(points, 0)        = 0
   and coalesce(rounds_played, 0) = 0
   and coalesce(growth, 0)        = 0
   and coalesce(coins, 0)         = 0;
