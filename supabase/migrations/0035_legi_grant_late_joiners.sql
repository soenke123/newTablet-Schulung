-- ══════════════════════════════════════════════════════════════
-- Migration 0035 — Legi-Grant für Späteinsteiger
-- ══════════════════════════════════════════════════════════════
-- Problem: user_legi_grants wird nur von check_and_grant_cluster_legi
-- angelegt, das seinerseits nur von add_bonbons aufgerufen wird. Wenn
-- ein Admin einen User in einen Cluster einträgt, dessen Legi bereits
-- freigeschaltet ist (bonbons_unlocked_at is not null), fehlt dem User
-- der Grant. claim_cluster_legi returned dann {ok:false,error:'no_grant'},
-- die Kreatur landet nie in game_state.game16.creature — im Hub bleibt
-- die Regenbogen-Kachel stehen, im Buch der Monster taucht die Kreatur
-- nie auf.
--
-- Fix:
--   1) Helper ensure_legi_grant(p_user_id, p_cluster_id) — legt Grant
--      an, wenn cluster.bonbons_unlocked_at gesetzt ist.
--   2) apply_cluster_bonus ruft ensure_legi_grant DIREKT nach dem
--      cluster_id-Lookup auf. Damit greift der Grant auch für Cluster,
--      die keine aktive Starthilfe konfiguriert haben (früher wäre die
--      Funktion vorher mit 'no_active_bonus' abgebrochen).
--   3) Einmaliger Backfill: alle aktiven User in bereits unlocked
--      Clustern bekommen den fehlenden Grant nachträglich.
--
-- Basis: Migration 0029 (aktuellster apply_cluster_bonus). Nicht aus
-- 0021/0020 kopieren — verlöre den bonus_coins_granted-Fix.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Helper: ensure_legi_grant
-- ─────────────────────────────────────────────────────────────
-- Idempotent per (user, cluster). Gibt true zurück, wenn tatsächlich
-- eine neue Zeile angelegt wurde (für Diagnose in apply_cluster_bonus).
create or replace function ensure_legi_grant(p_user_id uuid, p_cluster_id uuid)
  returns boolean
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_unlocked_at timestamptz;
  v_inserted    int;
begin
  if p_user_id is null or p_cluster_id is null then
    return false;
  end if;

  select bonbons_unlocked_at into v_unlocked_at
    from clusters where id = p_cluster_id;
  if v_unlocked_at is null then
    return false;
  end if;

  insert into user_legi_grants (user_id, cluster_id, granted_at)
  values (p_user_id, p_cluster_id, now())
  on conflict (user_id, cluster_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

revoke all on function ensure_legi_grant(uuid, uuid) from public;
grant execute on function ensure_legi_grant(uuid, uuid) to service_role;
-- authenticated bekommt bewusst KEINEN direkten Zugriff — der Aufruf
-- läuft ausschließlich über apply_cluster_bonus / interne Migrationen.


-- ─────────────────────────────────────────────────────────────
-- 2) apply_cluster_bonus — Grant vor der Starthilfe-Ausschüttung
-- ─────────────────────────────────────────────────────────────
-- Identisch zu Migration 0029 bis auf:
--   • v_legi_granted-Variable
--   • ensure_legi_grant-Aufruf direkt nach cluster_id-Lookup
--   • legi_granted im Return-JSON aller Zweige, damit Signup/Admin
--     im Log sehen, ob der Grant frisch angelegt wurde
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
  v_legi_granted  boolean := false;
begin
  if v_caller is not null then
    select is_admin into v_is_admin from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  select cluster_id into v_cluster_id from profiles where id = p_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_cluster');
  end if;

  -- Späteinsteiger-Hook: wenn der Cluster bereits Legi-unlocked ist,
  -- Grant vergeben. Muss VOR dem cluster_bonus-Check laufen — Cluster
  -- ohne konfigurierte Starthilfe würden sonst hier abbrechen und
  -- der Grant ausbleiben.
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
      select id from games
      where season = v_season and active = true
    loop
      insert into user_unlocked_games (user_id, game_id, unlocked_at)
      values (p_user_id, v_game.id, now())
      on conflict (user_id, game_id) do nothing;
      if found then
        v_games_unlocked := v_games_unlocked + 1;
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

  -- Startcoins auf shop_state.bankedCoins UND wallets.bonus_coins_granted
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
-- 3) Backfill für bestehende Späteinsteiger
-- ─────────────────────────────────────────────────────────────
-- Jeder aktive User in einem Cluster mit gesetztem bonbons_unlocked_at
-- bekommt den fehlenden Grant. granted_at wird auf den Unlock-Zeitpunkt
-- des Clusters gesetzt — semantisch näher an "Grant hätte damals passieren
-- sollen" als now(). Idempotent per PK-Konflikt.
insert into user_legi_grants (user_id, cluster_id, granted_at)
select p.id, c.id, c.bonbons_unlocked_at
from profiles p
join clusters c on c.id = p.cluster_id
where c.bonbons_unlocked_at is not null
  and p.status = 'active'
on conflict (user_id, cluster_id) do nothing;
