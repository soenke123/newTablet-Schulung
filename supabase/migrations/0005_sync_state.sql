-- ══════════════════════════════════════════════════════════════
-- Migration 0005 — Client-Sync-RPC + game_state.coins-Spalte
-- ══════════════════════════════════════════════════════════════
-- Für Arbeitsschritt 4b/4c: Multi-Device-State-Sync client-
-- autoritativ. Frontend rechnet Coins/Growth/Kreatur mit voller
-- Bonus-Logik weiter, DB spiegelt den Snapshot für Persistenz +
-- Gerätewechsel.
--
-- Cheat-Prävention über eine strenge submit_game_result-RPC ist
-- als späterer Arbeitsschritt vorgesehen (nach Shop-DB-Migration).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- game_state.coins — Per-Game-Coins-Spalte
-- ─────────────────────────────────────────────────────────────
-- Das Frontend speichert Coins pro Spiel (Nester + Shop-Summe).
-- wallets.coins bleibt als redundanter Gesamtstand (= SUM(coins)),
-- wird von sync_game_state konsistent nachgezogen.
alter table game_state
  add column if not exists coins int not null default 0 check (coins >= 0);


-- ─────────────────────────────────────────────────────────────
-- sync_game_state(...) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Nimmt einen vollständigen State-Snapshot des Clients und
-- persistiert ihn (upsert). wallets.coins wird als SUM neu
-- berechnet, damit der Gesamtstand konsistent bleibt.
--
-- Keine Cheat-Erkennung, nur Sabotage-Schutz:
--   - eingeloggter User
--   - Game existiert & aktiv
--   - Game-Season ≤ User-Season
--   - Zahlen ≥ 0, in Plausibilitätsgrenzen
--
-- Return:
--   { ok: true, coins_total }
--   { ok: false, error: '...' }
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
