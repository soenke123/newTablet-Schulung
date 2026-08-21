-- ══════════════════════════════════════════════════════════════
-- Migration 0094 — Clash of Math: vier Fixes aus dem ersten
-- Feature-Feedback (siehe Plan „Clash of Math — Fixes")
-- ══════════════════════════════════════════════════════════════
-- (1) Rundenende auf Zeit: die Lehrkraft kann während phase='running'
--     einen Countdown setzen (5s Test oder 1..5 Minuten) — läuft er
--     ab, endet die Runde und gewinnt, wer die meisten Felder besitzt
--     (statt wie bisher nur über Elimination bis auf ein Team).
--     Neue Spalte clash_boards.match_ends_at, zwei neue RPCs
--     (set/clear), clash_maybe_advance_phase bekommt einen zweiten
--     Übergang, clash_sig_of nimmt die Spalte mit auf (sonst
--     propagiert ein gesetzter/gelöschter Timer erst beim nächsten
--     Feldwechsel).
--
-- (2)+(3) sind reine Frontend-Änderungen (tool.js/tool.css: Beamer-
--     Karte füllt den Platz statt einer festen Kartenbreite;
--     Eingabefeld behält beim Absenden den Fokus) — hier nichts zu
--     tun.
--
-- (4) Team-Zugehörigkeit hängt an „online" statt an „im Raum
--     zugeordnet": wer beim Start nicht online ist (siehe ONLINE_
--     WINDOW aus 0079, dieselben 90 Sekunden), bekommt kein Team.
--     Kommt jemand während der laufenden Runde neu dazu, wird
--     zufällig ein noch lebendes Team gelost — bestehende Zeilen in
--     clash_players werden NIE angefasst, ein nur kurz weg gewesenes
--     Gerät (Verbindung weg, Missklick) landet über clash_ensure_
--     player's Früh-Rückgabe („existiert schon") von selbst wieder
--     im selben Team. Dafür reicht es, `clash_preview_teams` auf
--     online gefilterte Teilnehmer zu beschränken — sowohl die
--     Lobby-Vorschau als auch die Start-Zuordnung laufen über diese
--     eine Funktion (0093-Kopfkommentar „EINE Formel für beides").
--
--     Nebenbei behoben: `clash_sig` fasste last_seen_at bisher NIE
--     an (nur clash_view tat das) — ein Tablet, das durchgehend in
--     der Lobby wartet, ohne dass sich die Signatur ändert, hätte
--     nach 90s fälschlich als offline gegolten, weil clash_view dann
--     nie erneut gerufen wird. Gleiche Drosselung wie überall (0079).
--
-- Kein DROP — Idempotenz per `add column if not exists` und
-- `create or replace function` (Regel:
-- feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Neue Spalte
-- ─────────────────────────────────────────────────────────────
alter table clash_boards add column if not exists match_ends_at timestamptz;

comment on column clash_boards.match_ends_at is
  'Von der Lehrkraft gesetztes Rundenende (5s Test oder 1..5 Minuten), nur während phase=running. '
  'Läuft die Zeit ab, endet die Runde per clash_maybe_advance_phase — Sieger ist, wer zu dem '
  'Zeitpunkt die meisten Felder besitzt (Ties werden zufällig entschieden, wie die Eroberung selbst).';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_preview_teams — jetzt nur noch online zählt
-- ─────────────────────────────────────────────────────────────
-- Dieselbe 90-Sekunden-Schwelle wie skill_people_json (0079):
-- die dortige Begründung gilt unverändert (Poll alle paar Sekunden,
-- last_seen-Drosselung höchstens jede Minute — 90s übersteht beides,
-- ohne ein zugeklapptes Tablet minutenlang als da gelten zu lassen).
create or replace function clash_preview_teams(p_room uuid)
  returns table(participant_id uuid, team_index int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p.id, ((dense_rank() over (order by p.seat))::int - 1) % b.team_count
    from skill_participants p
    join clash_boards b on b.room_id = p.room_id
   where p.room_id = p_room
     and p.last_seen_at > now() - interval '90 seconds';
$$;

comment on function clash_preview_teams(uuid) is
  'Team-Index je ONLINE-Teilnehmer nach Sitzplatz-Reihenfolge (last_seen_at < 90s, wie 0079). '
  'Wer nicht online ist, taucht hier nicht auf und bekommt beim Start (clash_room_start liest '
  'exakt diese Funktion) folgerichtig kein Team. Vor dem Start eine reine Vorschau, beim Start '
  'die Quelle für die endgültige clash_players-Zuordnung.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_ensure_player — Spätzugang lost statt zu rechnen
-- ─────────────────────────────────────────────────────────────
-- In der Lobby entsteht bewusst KEINE Zeile (dort gibt es noch
-- keine Teams, nur die Vorschau) — erst ab countdown/running, und
-- dann zufällig unter den Teams, die noch Felder besitzen (ein
-- totes Team zu verstärken hätte keinen Sinn). Wer schon eine Zeile
-- hat, bekommt sie NIE ersetzt (früher Ausstieg oben) — das ist der
-- ganze Mechanismus hinter „kurz weg gewesen, gleiches Team wieder".
create or replace function clash_ensure_player(p_participant uuid, p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_phase text;
  v_team  int;
  v_q     record;
begin
  if exists (select 1 from clash_players where participant_id = p_participant) then
    return;
  end if;

  select phase into v_phase from clash_boards where room_id = p_room;
  if v_phase is null or v_phase = 'lobby' then
    return;
  end if;

  select owner_team into v_team
    from clash_tiles
   where room_id = p_room
   group by owner_team
   order by random()
   limit 1;

  if v_team is null then
    return;
  end if;

  select * into v_q from clash_new_question();

  insert into clash_players (participant_id, team_index, current_a, current_b)
  values (p_participant, v_team, v_q.a, v_q.b)
  on conflict (participant_id) do nothing;
end;
$$;

comment on function clash_ensure_player(uuid, uuid) is
  'Legt eine clash_players-Zeile nur an, wenn noch keine existiert (das ist der Wiedererkennungs-'
  'Mechanismus für kurze Aussetzer). Neuzugänge während countdown/running werden zufällig einem '
  'noch lebenden Team zugelost — NICHT über die Sitzplatz-Formel, die gilt nur für den Start.';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_maybe_advance_phase — zweiter Übergang: Zeit abgelaufen
-- ─────────────────────────────────────────────────────────────
create or replace function clash_maybe_advance_phase(p_room uuid)
  returns void
  security definer
  set search_path = public
  language sql
as $$
  update clash_boards
     set phase = 'running'
   where room_id = p_room
     and phase = 'countdown'
     and countdown_ends_at is not null
     and now() >= countdown_ends_at;

  update clash_boards b
     set phase       = 'ended',
         ended_at    = now(),
         match_ends_at = null,
         winner_team = (
           select owner_team from clash_tiles t
            where t.room_id = b.room_id
            group by owner_team
            order by count(*) desc, random()
            limit 1
         )
   where b.room_id = p_room
     and b.phase = 'running'
     and b.match_ends_at is not null
     and now() >= b.match_ends_at;
$$;

comment on function clash_maybe_advance_phase(uuid) is
  'Lazy Phasenübergänge, kein Cron: countdown→running (0093, unverändert) UND running→ended, wenn '
  'match_ends_at abgelaufen ist. Sieger im Zeit-Fall ist das Team mit den meisten Feldern; bei '
  'Gleichstand entscheidet order by … random() (wie die Eroberung selbst) statt eines nirgends '
  'erklärten Unentschiedens.';


-- ─────────────────────────────────────────────────────────────
-- 5) clash_sig_of — Timer + online-Zahl gehören in die Signatur
-- ─────────────────────────────────────────────────────────────
-- Ohne match_ends_at hier würde ein gesetzter/gelöschter Timer erst
-- beim nächsten Feldwechsel bei den anderen Geräten ankommen — der
-- Broadcast (tool.js) deckt das meistens ab, der Sicherheits-Poll
-- (alle 8s) braucht dafür aber die Signatur. Die online-Zahl (aus
-- derselben clash_preview_teams) macht Teamwechsel durch Online-/
-- Offline-Übergänge ebenso sichtbar, ohne dass sich sonst etwas
-- geändert haben müsste.
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
    (select coalesce(winner_team, -1) from clash_boards where room_id = p_room),
    (select count(*) from clash_tiles where room_id = p_room),
    (select coalesce(extract(epoch from max(updated_at))::bigint, 0)
       from clash_tiles where room_id = p_room),
    (select count(*) from skill_participants where room_id = p_room),
    (select count(*) from clash_preview_teams(p_room)),
    (select coalesce(extract(epoch from match_ends_at)::bigint, 0)
       from clash_boards where room_id = p_room)
  );
$$;


-- ─────────────────────────────────────────────────────────────
-- 6) clash_view — match_ends_at + Online-Zahlen für die Lobby
-- ─────────────────────────────────────────────────────────────
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle
         )), '[]'::jsonb)
    into v_tiles
    from clash_tiles where room_id = v_room.id;

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'me', jsonb_build_object(
      'team',    v_my_team,
      'alive',   v_alive,
      'streak',  coalesce(v_player.streak, 0),
      'question', v_question,
      'seat',    v_p.seat,
      'name',    coalesce(v_p.name, 'Tablet ' || v_p.seat)
    )
  );
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 7) clash_sig — fasst last_seen_at jetzt selbst an
-- ─────────────────────────────────────────────────────────────
create or replace function clash_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  perform clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);

  -- Ohne diese Zeile bliebe last_seen_at stehen, sobald sich die
  -- Signatur eine Weile nicht ändert (typisch: Lobby, niemand tippt) —
  -- clash_sig allein löste vorher NIE ein clash_view aus, und ein
  -- durchgehend offenes Tablet wäre nach 90s fälschlich „nicht
  -- online" gewesen. Gleiche Drosselung wie überall (0079).
  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  return jsonb_build_object('ok', true, 'sig', clash_sig_of(v_room.id));
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 8) clash_room_get — dieselben zwei Ergänzungen für den Beamer
-- ─────────────────────────────────────────────────────────────
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

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'team_tile_counts', v_status
  );
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 9) clash_room_start / clash_room_reset — match_ends_at mit leeren
-- ─────────────────────────────────────────────────────────────
create or replace function clash_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_room   skill_rooms;
  v_board  clash_boards;
  v_layout clash_layouts;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id for update;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'already_started');
  end if;

  select * into v_layout from clash_layouts where team_count = v_board.team_count;
  if v_layout.team_count is null then
    return jsonb_build_object('ok', false, 'error', 'layout_missing');
  end if;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );

  insert into clash_tiles (room_id, r, c, owner_team, is_castle)
  select v_room.id, (t->>'r')::int, (t->>'c')::int, (t->>'slot')::int, false
    from jsonb_array_elements(v_layout.tiles) t;

  update clash_tiles ct
     set is_castle = true
    from jsonb_array_elements(v_layout.castles) cst
   where ct.room_id = v_room.id
     and ct.r = (cst->>'r')::int
     and ct.c = (cst->>'c')::int;

  -- clash_preview_teams liest hier NUR die online Teilnehmer (siehe
  -- Abschnitt 2 oben) — wer nicht online ist, bekommt keine Zeile
  -- und damit kein Team, bis er/sie online kommt (dann greift
  -- clash_ensure_player, Abschnitt 3).
  insert into clash_players (participant_id, team_index, current_a, current_b)
  select pt.participant_id, pt.team_index, q.a, q.b
    from clash_preview_teams(v_room.id) pt, lateral clash_new_question() q;

  update clash_boards
     set phase             = 'countdown',
         started_at        = now(),
         countdown_ends_at = now() + interval '5 seconds',
         match_ends_at     = null,
         grid_rows         = v_layout.rows,
         grid_cols         = v_layout.cols,
         winner_team       = null,
         ended_at          = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true);
end;
$$;


create or replace function clash_room_reset(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );

  update clash_boards
     set phase = 'lobby', started_at = null, countdown_ends_at = null,
         ended_at = null, winner_team = null, match_ends_at = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 10) Neue RPCs: Rundenende-Timer setzen/abbrechen
-- ─────────────────────────────────────────────────────────────
-- Sinnvolle Obergrenze statt einer festen Werteliste (5s/1..5 Min):
-- das sind die Knöpfe, die tool.js anbietet, aber die Validierung
-- hier soll nicht jedes Mal mitwandern, wenn die Oberfläche einen
-- weiteren Knopf bekommt. 30 Minuten sind die Grenze nach oben.
create or replace function clash_room_set_match_timer(p_code text, p_seconds int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_ends  timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_seconds is null or p_seconds < 5 or p_seconds > 1800 then
    return jsonb_build_object('ok', false, 'error', 'invalid_seconds');
  end if;

  update clash_boards
     set match_ends_at = now() + make_interval(secs => p_seconds)
   where room_id = v_room.id
  returning match_ends_at into v_ends;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true, 'match_ends_at', v_ends);
end;
$$;

revoke all on function clash_room_set_match_timer(text, int) from public;
grant execute on function clash_room_set_match_timer(text, int) to authenticated;


create or replace function clash_room_clear_match_timer(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform clash_maybe_advance_phase(v_room.id);

  update clash_boards set match_ends_at = null where room_id = v_room.id;
  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function clash_room_clear_match_timer(text) from public;
grant execute on function clash_room_clear_match_timer(text) to authenticated;
