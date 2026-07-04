-- ══════════════════════════════════════════════════════════════
-- Migration 0004 — Zentrale RPCs (Cheat-Prävention)
-- ══════════════════════════════════════════════════════════════
-- Alle Schreib-Operationen auf game_state/wallets/user_unlocked_games
-- laufen ausschließlich über diese Functions. Sie sind SECURITY
-- DEFINER (laufen mit den Rechten des Owners = postgres) und
-- umgehen damit die RLS-Blockade für direktes Schreiben.
--
-- Jede Function prüft selbst:
--   - Ist der User eingeloggt? (auth.uid() is not null)
--   - Sind die Inputs plausibel?
--   - Ist die Season des Games erlaubt für diesen User?
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- unlock_game(game_id, password) -> jsonb
-- ─────────────────────────────────────────────────────────────
-- Prüft ein Klartext-Passwort gegen games.password_hash (SHA-256).
-- Bei Erfolg: Insert in user_unlocked_games.
--
-- Rückgabe:
--   { ok: true, already_unlocked?: true }
--   { ok: false, error: 'not_authenticated' | 'game_not_found'
--                     | 'no_password'      | 'wrong_password' }
create or replace function unlock_game(p_game_id text, p_password text)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_user_id      uuid := auth.uid();
  v_stored_hash  text;
  v_input_hash   text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select password_hash into v_stored_hash
  from games
  where id = p_game_id and active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;

  if v_stored_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_password');
  end if;

  v_input_hash := encode(digest(p_password, 'sha256'), 'hex');

  if v_input_hash <> v_stored_hash then
    return jsonb_build_object('ok', false, 'error', 'wrong_password');
  end if;

  insert into user_unlocked_games (user_id, game_id)
  values (v_user_id, p_game_id)
  on conflict (user_id, game_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function unlock_game(text, text) from public;
grant execute on function unlock_game(text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- update_display_name(new_name) -> jsonb
-- ─────────────────────────────────────────────────────────────
-- Ändert den display_name des eigenen Profils, mit Prüfungen:
--   - Lock (display_name_locked = true) blockiert
--   - Länge 2–24 Zeichen
--   - Nur druckbare Zeichen (keine Steuerzeichen)
--   - Schimpfwort-Blacklist
--
-- Rückgabe:
--   { ok: true, display_name: '...' }
--   { ok: false, error: '...' }
create or replace function update_display_name(p_new_name text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id  uuid := auth.uid();
  v_locked   boolean;
  v_trimmed  text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_trimmed := btrim(p_new_name);

  if length(v_trimmed) < 2 or length(v_trimmed) > 24 then
    return jsonb_build_object('ok', false, 'error', 'invalid_length');
  end if;

  if v_trimmed ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'error', 'invalid_chars');
  end if;

  if contains_blacklisted_word(v_trimmed) then
    return jsonb_build_object('ok', false, 'error', 'blacklisted');
  end if;

  select display_name_locked into v_locked
  from profiles where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if v_locked then
    return jsonb_build_object('ok', false, 'error', 'name_locked');
  end if;

  update profiles set display_name = v_trimmed where id = v_user_id;

  return jsonb_build_object('ok', true, 'display_name', v_trimmed);
end;
$$;

revoke all on function update_display_name(text) from public;
grant execute on function update_display_name(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- submit_game_result(game_id, correct, max_rounds) -> jsonb
-- ─────────────────────────────────────────────────────────────
-- Cheat-Preventing-Kern. Frontend schickt nur "korrekt/max", die
-- Belohnungen (coins/growth/creature) rechnet die DB selbst.
--
-- Regeln (bewusst konservativ, feinschliff kommt beim Frontend-Anbinden):
--   - points     += correct
--   - growth     += correct           (1 Wachstumspunkt pro richtiger Antwort)
--   - coins      += correct           (1 Coin pro richtige Antwort)
--   - rounds_played += 1
--   - creature: einmalig beim ersten Durchgang, basierend auf Score-Quote
--
-- Rückgabe:
--   { ok: true, points, growth, creature, coins, coins_delta, growth_delta }
--   { ok: false, error: '...' }
create or replace function submit_game_result(
  p_game_id     text,
  p_correct     int,
  p_max_rounds  int
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id       uuid := auth.uid();
  v_session       record;
  v_game          record;
  v_existing      record;
  v_creature      text;
  v_growth_delta  int;
  v_coins_delta   int;
  v_new_points    int;
  v_new_growth    int;
  v_new_coins     int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Input-Sanity
  if p_correct is null or p_max_rounds is null
     or p_correct < 0 or p_max_rounds <= 0
     or p_correct > p_max_rounds
     or p_max_rounds > 100 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Game existiert und ist aktiv?
  select id, season, active
    into v_game
  from games
  where id = p_game_id and active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;

  -- Session-Info (Cluster/Season) des Users
  select id, status, season
    into v_session
  from user_session
  where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  -- Season-Zugriff: Game-Season darf User-Season nicht übersteigen
  if v_game.season > v_session.season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  -- Bisheriger Stand
  select points, rounds_played, creature, growth
    into v_existing
  from game_state
  where user_id = v_user_id and game_id = p_game_id;

  -- Kreatur einmalig bestimmen (nur wenn noch keine gesetzt)
  if v_existing.creature is null then
    v_creature := case
      when p_correct * 10 <= p_max_rounds * 2 then 'snail'
      when p_correct * 10 <= p_max_rounds * 4 then 'fish'
      when p_correct * 10 <= p_max_rounds * 6 then 'chicken'
      when p_correct * 10 <= p_max_rounds * 7 then 'salamander'
      when p_correct * 10 <= p_max_rounds * 8 then 'falkeneule'
      when p_correct * 10 <= p_max_rounds * 9 then 'triceratops'
      else 'dragon'
    end;
  else
    v_creature := v_existing.creature;
  end if;

  v_growth_delta := p_correct;
  v_coins_delta  := p_correct;

  -- Upsert game_state
  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, updated_at)
  values (
    v_user_id, p_game_id,
    coalesce(v_existing.points, 0) + p_correct,
    coalesce(v_existing.rounds_played, 0) + 1,
    v_creature,
    coalesce(v_existing.growth, 0) + v_growth_delta,
    now()
  )
  on conflict (user_id, game_id) do update set
    points        = excluded.points,
    rounds_played = excluded.rounds_played,
    creature      = excluded.creature,
    growth        = excluded.growth,
    updated_at    = now()
  returning points, growth into v_new_points, v_new_growth;

  -- Upsert wallets
  insert into wallets (user_id, coins, updated_at)
  values (v_user_id, v_coins_delta, now())
  on conflict (user_id) do update set
    coins      = wallets.coins + v_coins_delta,
    updated_at = now()
  returning coins into v_new_coins;

  return jsonb_build_object(
    'ok',           true,
    'points',       v_new_points,
    'growth',       v_new_growth,
    'creature',     v_creature,
    'coins',        v_new_coins,
    'coins_delta',  v_coins_delta,
    'growth_delta', v_growth_delta
  );
end;
$$;

revoke all on function submit_game_result(text, int, int) from public;
grant execute on function submit_game_result(text, int, int) to authenticated;
