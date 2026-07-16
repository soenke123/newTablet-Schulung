-- ══════════════════════════════════════════════════════════════
-- Migration 0031 — Cheat-Caps für Offline-Batching lockern
-- ══════════════════════════════════════════════════════════════
-- Die Delta-Caps aus Migration 0016 waren so eng gesetzt, dass
-- legitime Offline-Batches (mehrere Sessions ohne erfolgreichen
-- Sync) den sync_game_state-Delta-Cap sprengen. Sobald das einmal
-- passiert, ist der Push für dieses Game DAUERHAFT blockiert:
-- Marker bleibt _pending, Delta wächst mit jeder weiteren Session,
-- jeder Hub-Boot loggt +1 cheat_flags-Eintrag.
--
-- Mit dem neuen coinsx3-Multiplier (max 69 Coins/Session bei
-- Vollendet + Perfect) reichen bereits 5 Offline-Runden für einen
-- >300er Delta. Bei Schulnutzung praktisch garantiert.
--
-- Erhöhung (~3×) auf realistische Offline-Puffer:
--   coins:  300 → 1000  (~14 Sessions × 69 = 966)
--   points: 100 → 300   (~30 Sessions × 10)
--   rounds:  10 → 30    (~30 Sessions × 1)
--   growth:  30 → 60    (nach Ausgewachsen ohnehin capped)
--
-- Cheat-Erkennung bleibt scharf gegen "starte mit 500k Coins"-
-- DevTools-Injection (absolute Range 1M unverändert). Nur die
-- realistische Nutzungs-Grauzone wird toleriert.
--
-- Basis: Migration 0016 (Original-Funktion).
-- ══════════════════════════════════════════════════════════════

create or replace function sync_game_state(
  p_game_id        text,
  p_points         int,
  p_rounds_played  int,
  p_creature       text,
  p_growth         int,
  p_coins          int
) returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id      uuid := auth.uid();
  v_session      record;
  v_game         record;
  v_coins_total  int;
  v_old          record;
  v_delta_p      int;
  v_delta_g      int;
  v_delta_c      int;
  v_delta_r      int;
  v_since_ms     int;
  MAX_POINTS_DELTA  constant int := 300;
  MAX_ROUNDS_DELTA  constant int := 30;
  MAX_GROWTH_DELTA  constant int := 60;
  MAX_COINS_DELTA   constant int := 1000;
  MIN_INTERVAL_MS   constant int := 1000;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_points is null or p_rounds_played is null
     or p_growth is null or p_coins is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if p_points        < 0 or p_points        > 100000
  or p_rounds_played < 0 or p_rounds_played > 100000
  or p_growth        < 0 or p_growth        > 100000
  or p_coins         < 0 or p_coins         > 1000000 then
    return jsonb_build_object('ok', false, 'error', 'value_out_of_range');
  end if;

  if p_creature is not null and length(p_creature) > 32 then
    return jsonb_build_object('ok', false, 'error', 'creature_too_long');
  end if;

  select id, season, active into v_game
  from games where id = p_game_id and active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;

  select id, status, season into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;
  if v_game.season > v_session.season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  select points, rounds_played, growth, coins, updated_at
    into v_old
    from game_state
   where user_id = v_user_id and game_id = p_game_id;

  if found then
    v_since_ms := (extract(epoch from (now() - v_old.updated_at)) * 1000)::int;
    if v_since_ms < MIN_INTERVAL_MS then
      insert into cheat_flags(user_id, game_id, reason, detail)
      values (v_user_id, p_game_id, 'rate_limit',
              jsonb_build_object(
                'since_ms',        v_since_ms,
                'min_interval_ms', MIN_INTERVAL_MS
              ));
      return jsonb_build_object('ok', false, 'error', 'rate_limit');
    end if;

    v_delta_p := p_points        - v_old.points;
    v_delta_r := p_rounds_played - v_old.rounds_played;
    v_delta_g := p_growth        - v_old.growth;
    v_delta_c := p_coins         - v_old.coins;

    if v_delta_p > MAX_POINTS_DELTA
       or v_delta_r > MAX_ROUNDS_DELTA
       or v_delta_g > MAX_GROWTH_DELTA
       or v_delta_c > MAX_COINS_DELTA then
      insert into cheat_flags(user_id, game_id, reason, detail)
      values (v_user_id, p_game_id, 'delta_cap',
              jsonb_build_object(
                'delta_points', v_delta_p,
                'delta_rounds', v_delta_r,
                'delta_growth', v_delta_g,
                'delta_coins',  v_delta_c,
                'caps', jsonb_build_object(
                  'points', MAX_POINTS_DELTA,
                  'rounds', MAX_ROUNDS_DELTA,
                  'growth', MAX_GROWTH_DELTA,
                  'coins',  MAX_COINS_DELTA
                )
              ));
      return jsonb_build_object('ok', false, 'error', 'delta_cap');
    end if;
  else
    if p_points > MAX_POINTS_DELTA
       or p_rounds_played > MAX_ROUNDS_DELTA
       or p_growth > MAX_GROWTH_DELTA
       or p_coins > MAX_COINS_DELTA then
      insert into cheat_flags(user_id, game_id, reason, detail)
      values (v_user_id, p_game_id, 'first_submit_cap',
              jsonb_build_object(
                'points', p_points,
                'rounds', p_rounds_played,
                'growth', p_growth,
                'coins',  p_coins,
                'caps', jsonb_build_object(
                  'points', MAX_POINTS_DELTA,
                  'rounds', MAX_ROUNDS_DELTA,
                  'growth', MAX_GROWTH_DELTA,
                  'coins',  MAX_COINS_DELTA
                )
              ));
      return jsonb_build_object('ok', false, 'error', 'first_submit_cap');
    end if;
  end if;

  insert into game_state (
    user_id, game_id, points, rounds_played, creature, growth, coins, updated_at
  ) values (
    v_user_id, p_game_id, p_points, p_rounds_played, p_creature, p_growth, p_coins, now()
  )
  on conflict (user_id, game_id) do update set
    points        = excluded.points,
    rounds_played = excluded.rounds_played,
    creature      = excluded.creature,
    growth        = excluded.growth,
    coins         = excluded.coins,
    updated_at    = now();

  select coalesce(sum(coins), 0)::int into v_coins_total
  from game_state where user_id = v_user_id;

  insert into wallets (user_id, coins, updated_at)
  values (v_user_id, v_coins_total, now())
  on conflict (user_id) do update set
    coins      = v_coins_total,
    updated_at = now();

  return jsonb_build_object('ok', true, 'coins_total', v_coins_total);
end;
$$;

revoke all on function sync_game_state(text, int, int, text, int, int) from public;
grant execute on function sync_game_state(text, int, int, text, int, int) to authenticated;
