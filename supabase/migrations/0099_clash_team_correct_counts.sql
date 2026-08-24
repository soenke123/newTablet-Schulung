-- ══════════════════════════════════════════════════════════════
-- Migration 0099 — Kingdoms of Mathoria: richtige Antworten je Volk
-- ══════════════════════════════════════════════════════════════
-- Die Zahl gibt es längst: clash_players.correct_count zählt seit 0093
-- jede richtige Antwort mit. Sie kam bisher nur nie aus der Datenbank
-- heraus — weder der Beamer noch das Tablet bekamen sie zu sehen.
--
-- Gebraucht wird sie an zwei Stellen:
--   · WÄHREND der Runde in den Völker-Spalten am Beamer-Rand (und in
--     der winzigen Völker-Reihe am Tablet): die Feldzahl allein sagt,
--     wer gerade vorn liegt, aber nicht, wer fleißig gerechnet hat.
--   · AM ENDE auf dem Siegerbild: unter jedem Volk stehen Platz und
--     richtige Antworten.
--
-- ── Warum eine Summe je Volk und keine Liste je Kind ───────────
-- Auf dem Beamer hängt die Zahl an der Gruppe, nicht am einzelnen
-- Kind — eine Rangliste einzelner Kinder vor der ganzen Klasse ist
-- eine andere Entscheidung, die niemand getroffen hat. Wer die eigene
-- Serie sehen will, sieht sie am Tablet (me.streak).
--
-- ── Auch für das Tablet, nicht nur für den Beamer ──────────────
-- Anders als die NAMEN der anderen Völker (0096/0098: bleiben am
-- Beamer) ist die Zahl der richtigen Antworten eine reine Spielstands-
-- Angabe wie die Feldzahl in `teams` — sie steht am Beamer ohnehin für
-- alle sichtbar an der Wand.
--
-- ── clash_sig_of muss mitzählen ────────────────────────────────
-- Eine richtige Antwort, die KEIN Feld erobert (Grenze schon voll,
-- Nachbar gehört einem selbst), ändert an clash_tiles nichts. Ohne die
-- Summe in der Signatur bliebe die Zahl in der Spalte bis zum nächsten
-- Feldwechsel stehen — sichtbar falsch neben einem Kind, das gerade
-- gerechnet hat. Die Summe ist ein billiges count/sum über den Raum,
-- und die Signatur wird ohnehin bei jedem Takt gebildet.
--
-- ⚠️ `clash_room_get` wird NEU DEKLARIERT — Grundlage ist 0097 (die
-- höchste bestehende Fassung), `clash_view` auf Grundlage von 0098,
-- `clash_sig_of` auf Grundlage von 0097. Sonst fielen team_members,
-- factions, offline_members oder my_team_members wieder weg.
-- Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP — `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die Summe je Volk — an EINER Stelle
-- ─────────────────────────────────────────────────────────────
-- clash_players trägt keine room_id (0093) — der Join über den
-- Teilnehmer grenzt auf diesen Raum ein. Vor dem Start ist die Tabelle
-- leer, dann kommt '{}' zurück und die Oberfläche zeigt überall 0.
create or replace function clash_team_correct(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    from (
      select pl.team_index, sum(pl.correct_count)::int as cnt
        from clash_players pl
        join skill_participants p on p.id = pl.participant_id
       where p.room_id = p_room
       group by pl.team_index
    ) t;
$$;

revoke all on function clash_team_correct(uuid) from public;

comment on function clash_team_correct(uuid) is
  'Richtige Antworten je Team-Slot als {slot: anzahl} (Summe über clash_players.correct_count). '
  'Quelle für team_correct_counts in clash_room_get und clash_view (0099).';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_sig_of — richtige Antworten ohne Eroberung sichtbar machen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0097. Neu ist nur die letzte Zeile.
create or replace function clash_sig_of(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select concat_ws('.',
    (select phase from clash_boards where room_id = p_room),
    (select team_count from clash_boards where room_id = p_room),
    (select factions::text from clash_boards where room_id = p_room),
    (select coalesce(winner_team, -1) from clash_boards where room_id = p_room),
    (select count(*) from clash_tiles where room_id = p_room),
    (select coalesce(extract(epoch from max(updated_at))::bigint, 0)
       from clash_tiles where room_id = p_room),
    (select count(*) from skill_participants where room_id = p_room),
    (select count(*) from clash_preview_teams(p_room)),
    (select coalesce(extract(epoch from match_ends_at)::bigint, 0)
       from clash_boards where room_id = p_room),
    (select coalesce(sum(pl.correct_count), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room)
  );
$$;

revoke all on function clash_sig_of(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) clash_room_get — team_correct_counts für den Beamer
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0097 (die höchste bestehende Fassung). Einziger Zusatz
-- ist team_correct_counts.
create or replace function clash_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_teams jsonb;
  v_tiles jsonb;
  v_status jsonb;
  v_correct jsonb;
  v_members jsonb;
  v_offline jsonb;
  v_online_count int;
  v_room_total   int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;
  perform skill_touch(v_room.id);

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  -- Namen je Team. Sortiert nach Sitzplatz, damit die Reihenfolge
  -- zwischen zwei Abrufen nicht springt.
  if v_board.phase = 'lobby' then
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select t.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_preview_teams(v_room.id) t
          join skill_participants p on p.id = t.participant_id
         group by t.team_index
      ) x;
  else
    -- clash_players trägt keine room_id — der Join über den
    -- Teilnehmer grenzt auf diesen Raum ein.
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select pl.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_players pl
          join skill_participants p on p.id = pl.participant_id
         where p.room_id = v_room.id
         group by pl.team_index
      ) x;
  end if;

  -- Wer im Raum ist, aber in keinem Team steht. Bewusst als Komplement
  -- zu clash_preview_teams statt mit einer eigenen Kopie der
  -- 90-Sekunden-Grenze: „nicht in einem Team ⇒ steht unten" soll auch
  -- dann noch gelten, wenn sich die Grenze einmal ändert.
  select coalesce(jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat), '[]'::jsonb)
    into v_offline
    from skill_participants p
   where p.room_id = v_room.id
     and p.id not in (select participant_id from clash_preview_teams(v_room.id));

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle
         )), '[]'::jsonb)
    into v_tiles
    from clash_tiles where room_id = v_room.id;

  select coalesce(jsonb_object_agg(owner_team, cnt), '{}'::jsonb)
    into v_status
    from (
      select owner_team, count(*) as cnt
        from clash_tiles where room_id = v_room.id
       group by owner_team
    ) t;

  v_correct := clash_team_correct(v_room.id);

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_members', v_members,
    'offline_members', v_offline,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'team_tile_counts', v_status,
    'team_correct_counts', v_correct
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms of Mathoria. Seit 0096 team_members, seit 0097 factions und '
  'offline_members, seit 0099 team_correct_counts (richtige Antworten je Volk — in den '
  'Völker-Spalten während der Runde und auf dem Siegerbild danach).';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_view — team_correct_counts für das Tablet
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0098 (die höchste bestehende Fassung — sonst fiele
-- my_team_members wieder weg). Einziger Zusatz ist
-- team_correct_counts.
create or replace function clash_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p            skill_participants;
  v_room         skill_rooms;
  v_board        clash_boards;
  v_player       clash_players;
  v_my_team      int;
  v_alive        boolean := true;
  v_question     jsonb := null;
  v_teams        jsonb;
  v_correct      jsonb;
  v_my_members   jsonb := '[]'::jsonb;
  v_tiles        jsonb;
  v_online_count int;
  v_room_total   int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  -- Muss VOR clash_preview_teams laufen, sonst zählt sich der
  -- aufrufende Teilnehmer bei einem gerade erst abgelaufenen
  -- 1-Minuten-Fenster selbst noch nicht als online.
  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  if v_board.phase = 'lobby' then
    select team_index into v_my_team
      from clash_preview_teams(v_room.id)
     where participant_id = v_p.id;
  else
    perform clash_ensure_player(v_p.id, v_room.id);
    select * into v_player from clash_players where participant_id = v_p.id;
    v_my_team := v_player.team_index;
    if v_board.phase = 'running' then
      v_alive := exists (
        select 1 from clash_tiles where room_id = v_room.id and owner_team = v_my_team
      );
      if v_alive then
        v_question := jsonb_build_object('a', v_player.current_a, 'b', v_player.current_b);
      end if;
    end if;
  end if;

  -- Die eigene Gruppe, sortiert nach Sitzplatz, damit die Reihenfolge
  -- zwischen zwei Abrufen nicht springt. Ohne eigenes Volk (nicht
  -- online, noch keine Zuordnung) bleibt die Liste leer.
  if v_my_team is not null then
    if v_board.phase = 'lobby' then
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_preview_teams(v_room.id) t
        join skill_participants p on p.id = t.participant_id
       where t.team_index = v_my_team;
    else
      -- clash_players trägt keine room_id — der Join über den
      -- Teilnehmer grenzt auf diesen Raum ein.
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_players pl
        join skill_participants p on p.id = pl.participant_id
       where p.room_id = v_room.id and pl.team_index = v_my_team;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle
         )), '[]'::jsonb)
    into v_tiles
    from clash_tiles where room_id = v_room.id;

  v_correct := clash_team_correct(v_room.id);

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_correct_counts', v_correct,
    'my_team_members', v_my_members,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'me', jsonb_build_object(
      'team',    v_my_team,
      'alive',   v_alive,
      'streak',  coalesce(v_player.streak, 0),
      'question', v_question,
      'seat',    v_p.seat,
      'name',    skill_seat_name(v_p.name, v_p.seat)
    )
  );
end;
$$;

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;

comment on function clash_view(text) is
  'Teilnehmer-Ansicht von Kingdoms of Mathoria. Seit 0098 my_team_members ([{name, me}, …] — '
  'die Kinder im EIGENEN Volk) und me.name aus skill_seat_name (0084). Seit 0099 zusätzlich '
  'team_correct_counts: richtige Antworten je Volk, dieselbe Spielstands-Angabe wie die '
  'Feldzahl in `teams` — die NAMEN der anderen Völker bleiben weiterhin am Beamer.';
