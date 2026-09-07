-- ══════════════════════════════════════════════════════════════
-- Migration 0133 — Myth of Wordisland: die Lobby von Kingdoms
-- ══════════════════════════════════════════════════════════════
-- Sönkes Vorgabe (2026-09-07): „Ich hätte in der Lobby gerne die UI
-- von Kingdoms of Mathoria — wie ich die Teams wähle (es sind nur
-- sechs) und wie man die Modi einstellt. Auch die Lobby bei den
-- Schülern soll so aussehen."
--
-- Das meiste davon ist Oberfläche und steht in tool.js/tool.css.
-- Drei Sachen kann eine Oberfläche aber nicht erfinden:
--
--   1) WELCHE Völker mitspielen. Bisher gab es nur eine ZAHL
--      (team_count 2..6), und die Völker ergaben sich still aus der
--      Reihenfolge: drei Völker hießen immer Toast-Ritter, Robo-Enten
--      und Brokkoli-Giraffen. In der Kingdoms-Lobby klickt die
--      Lehrkraft die Wappen selbst an. Dafür braucht es dieselbe
--      Übersetzungstabelle wie dort (0097): factions[slot] = Volk.
--
--   2) WER im eigenen Volk sitzt. Die Wartetafel am Tablet zeigt in
--      Kingdoms das eigene Volk groß und mit den Namen der Gruppe
--      (0098). wi_view kannte bisher nur die eigene Zahl.
--
--   3) WER GERADE DA IST. Am Pult stehen die Namen in den Spalten;
--      wer nicht online ist, gehört erkennbar dazu — bei Wordisland
--      ANDERS als bei Kingdoms: dort bekommt ein abwesendes Kind beim
--      Start kein Team, hier verteilt wi_room_start ausnahmslos alle
--      Teilnehmer des Raums. Die Oberfläche sagt deshalb „gerade
--      nicht am Tablet", nicht „spielt nicht mit".
--
-- ── Slot ≠ Volk ───────────────────────────────────────────────
-- Ab hier gilt in Wordisland dieselbe Trennung wie in Kingdoms:
--   · SLOT   0..team_count-1 — steht in wi_players.team_index und
--            wi_tiles.owner_team. Daran ändert sich NICHTS.
--   · VOLK   0..5 — Name, Farbe, Bild. Steht in factions.
-- Der Server rechnet weiter ausschließlich in Slots; die Übersetzung
-- passiert im Gerät. Deshalb bleiben wi_tiles, wi_teams_json und
-- wi_own_string unangetastet.
--
-- `factions` darf nirgends ohne `team_count` gesetzt werden — zwei
-- Felder, eine Wahrheit (Länge der Liste = Zahl der Völker).
--
-- Kein DROP — Idempotenz per pg_catalog-Prüfung und `create or
-- replace` (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_boards.factions
-- ─────────────────────────────────────────────────────────────
-- Der Vorgabewert deckt sich mit team_count = 4: die ersten vier
-- Völker, aufsteigend. Bestehende Räume bekommen genau das, was sie
-- vorher schon anzeigten (Volk = Slot) — ein Raum, der zwischen zwei
-- Runden migriert wird, sieht danach unverändert aus.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute
     where attrelid = 'public.wi_boards'::regclass
       and attname  = 'factions'
       and not attisdropped
  ) then
    alter table wi_boards
      add column factions jsonb not null default '[0, 1, 2, 3]'::jsonb;

    update wi_boards
       set factions = (select coalesce(jsonb_agg(i order by i), '[0, 1]'::jsonb)
                         from generate_series(0, team_count - 1) as i);
  end if;
end $$;

comment on column wi_boards.factions is
  'Welche Völker mitspielen, als sortierte Liste ihrer Indizes 0..5: factions[slot] = Volk. '
  'Die Länge ist team_count — beides wird immer zusammen gesetzt.';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname  = 'wi_boards_factions_len_ck'
       and conrelid = 'public.wi_boards'::regclass
  ) then
    alter table wi_boards
      add constraint wi_boards_factions_len_ck
      check (jsonb_typeof(factions) = 'array'
             and jsonb_array_length(factions) between 2 and 6);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) wi_normalize_factions — die eine Stelle, die prüft
-- ─────────────────────────────────────────────────────────────
-- Wortgleich zu clash_normalize_factions (0097), nur bis 5 statt bis
-- 7. Eigene Funktion statt Aufruf der fremden, aus demselben Grund
-- wie bei wi_is_neighbor: ein Werkzeug, das eine Funktion eines
-- anderen Spiels braucht, lässt sich ohne dieses nicht ausliefern.
--
-- NULL heißt „unbrauchbar" — der Aufrufer macht daraus seine übliche
-- {ok:false}-Antwort, statt dass eine SQL-Ausnahme durch die
-- RPC-Schicht schlägt.
create or replace function wi_normalize_factions(p_factions jsonb)
  returns jsonb
  immutable
  set search_path = public
  language sql
as $$
  select case
    when p_factions is null or jsonb_typeof(p_factions) <> 'array' then null
    -- `(e #>> '{}')` ist der Rohtext des JSON-Werts: bei einer 3 also
    -- '3', bei 3.5 eben '3.5'. Der Ausdruck erledigt damit Bruchzahlen,
    -- negative Werte und alles über 5 in einem Zug.
    when exists (
      select 1 from jsonb_array_elements(p_factions) e
       where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-5]$'
    ) then null
    else (
      select case when count(*) between 2 and 6
                  then jsonb_agg(v order by v)
                  else null end
        from (
          select distinct (e #>> '{}')::int as v
            from jsonb_array_elements(p_factions) e
        ) x
    )
  end;
$$;

revoke all on function wi_normalize_factions(jsonb) from public;

comment on function wi_normalize_factions(jsonb) is
  'Prüft und vereinheitlicht eine Völker-Auswahl: ganze Zahlen 0..5, ohne Wiederholung, '
  '2 bis 6 Stück, aufsteigend sortiert. NULL heißt „unbrauchbar".';


-- ─────────────────────────────────────────────────────────────
-- 3) wi_seat_assign — die Aufstellung nach Sitzplatz
-- ─────────────────────────────────────────────────────────────
-- Stand bis jetzt zweimal wörtlich in wi_room_start und (mit
-- random() statt seat) in wi_room_shuffle. Jetzt braucht es eine
-- dritte Stelle — beim Ändern der Völker-Zahl muss neu verteilt
-- werden, sonst bleibt ein Kind in Slot 3 sitzen, den es nicht mehr
-- gibt, und sein Volk taucht in keiner Spalte mehr auf.
--
-- Drei Kopien derselben Verteilung wären zwei zu viel, also eine
-- Funktion — und wi_room_start ruft sie ab hier ebenfalls auf.
-- Zwei getrennte Anweisungen und bewusst KEIN datenänderndes WITH:
-- Löschung und Einfügung teilen sich dort denselben Schnappschuss,
-- und die eingefügte Zeile träfe auf ihren eigenen, gerade erst
-- gelöschten Vorgänger im Primärschlüssel.
create or replace function wi_seat_assign(p_room uuid, p_teams int)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
begin
  delete from wi_players where room_id = p_room;

  insert into wi_players (participant_id, room_id, team_index)
  select p.id, p_room, (dense_rank() over (order by p.seat) - 1)::int % p_teams
    from skill_participants p
   where p.room_id = p_room;
end;
$$;

comment on function wi_seat_assign(uuid, int) is
  'Verteilt alle Teilnehmer eines Raums reihum auf die Slots 0..p_teams-1, nach Sitzplatz '
  'sortiert. Setzt Serien, Punkte und laufende Aufgaben zurück — eine neue Aufstellung ist '
  'ein neuer Anfang.';


-- ─────────────────────────────────────────────────────────────
-- 4) wi_room_set_factions — die neue Lobby-Bedienung
-- ─────────────────────────────────────────────────────────────
-- Der Zwilling von clash_room_set_factions. Eigene RPC statt eines
-- weiteren Parameters an wi_room_setup: ein zusätzlicher Parameter
-- wäre eine zweite Funktion mit anderer Signatur (die alte bliebe
-- stehen, PostgREST fände bei einem Aufruf ohne p_factions zwei
-- Kandidaten und lehnte beide ab).
--
-- Gibt die bereinigte Liste zurück, damit das Gerät sofort die
-- Reihenfolge sieht, die der Server tatsächlich gespeichert hat,
-- statt sie nachzubilden.
create or replace function wi_room_set_factions(p_code text, p_factions jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
  v_b    wi_boards;
  v_norm jsonb;
  v_n    int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_b from wi_boards where room_id = v_room;
  -- Nach dem Start liegt das Land der Völker auf der Karte. Ein Volk
  -- zu entfernen hieße, sein Land herrenlos stehenzulassen.
  if v_b.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  v_norm := wi_normalize_factions(p_factions);
  if v_norm is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_factions');
  end if;
  v_n := jsonb_array_length(v_norm);

  update wi_boards
     set factions = v_norm,
         team_count = v_n
   where room_id = v_room;

  -- Nur bei geänderter Zahl neu verteilen: wer nur ein Volk gegen ein
  -- anderes tauscht („lieber die Katzen als die Enten"), soll nicht
  -- die ganze Klasse neu gemischt bekommen — die Kinder stehen dann
  -- plötzlich in einer anderen Gruppe, ohne dass jemand etwas
  -- gemischt hätte.
  if v_n <> v_b.team_count then
    perform wi_seat_assign(v_room, v_n);
  end if;

  return jsonb_build_object('ok', true, 'factions', v_norm, 'team_count', v_n);
end;
$$;

revoke all on function wi_room_set_factions(text, jsonb) from public;
grant execute on function wi_room_set_factions(text, jsonb) to authenticated;

comment on function wi_room_set_factions(text, jsonb) is
  'Setzt, welche Völker mitspielen (Wappenreihe der Lobby). Nur in der Lobby. Zieht team_count '
  'mit und verteilt die Klasse neu, wenn sich die Zahl der Völker geändert hat.';


-- ─────────────────────────────────────────────────────────────
-- 5) wi_room_start — dieselbe Runde, nur mit dem Helfer
-- ─────────────────────────────────────────────────────────────
-- Unverändert bis auf die Aufstellung, die jetzt aus wi_seat_assign
-- kommt statt aus einer wörtlichen Kopie.
create or replace function wi_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := wi_owned_room(p_code);
  v_b      wi_boards;
  v_people int;
  v_n      int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from wi_boards where room_id = v_room;

  if not exists (select 1 from wi_room_sets where room_id = v_room) then
    return jsonb_build_object('ok', false, 'error', 'no_sets');
  end if;

  select count(*) into v_people from skill_participants where room_id = v_room;

  -- Alte Aufstellung weg: eine neue Runde ist eine neue Insel und
  -- eine neue Verteilung. Die Wiedervorlage (vocab_progress) bleibt
  -- — was ein Kind kann, kann es auch in der zweiten Runde.
  perform wi_seat_assign(v_room, v_b.team_count);

  v_n := wi_build_island(v_room, v_b.team_count, v_people, v_b.duration_secs);

  update wi_boards
     set phase = 'countdown',
         countdown_ends_at = now() + interval '5 seconds',
         started_at = null, ends_at = null, ended_at = null, winner_team = null,
         seed = (floor(random() * 1000000))::int,
         presenter_seen_at = now()
   where room_id = v_room;

  return jsonb_build_object('ok', true, 'tiles', v_n);
end;
$$;

revoke all on function wi_room_start(text) from public;
grant execute on function wi_room_start(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) wi_room_get — die Lobby am Pult
-- ─────────────────────────────────────────────────────────────
-- Neu: `factions` (welche Völker) und je Kind, ob es gerade am
-- Tablet ist. Dieselben 90 Sekunden wie in Kingdoms
-- (clash_preview_teams, 0113): der Poller meldet sich alle drei bis
-- vier Sekunden, ein Fenster von anderthalb Minuten überlebt damit
-- eine Handvoll ausgefallener Abrufe, ohne dass ein Kind, das das
-- Gerät weglegt, minutenlang als anwesend gilt.
create or replace function wi_room_get(p_code text, p_full boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := wi_owned_room(p_code);
  v_b      wi_boards;
  v_online int;
  v_total  int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_b := wi_maybe_advance(v_room);

  select count(*) filter (where p.last_seen_at > now() - interval '90 seconds'),
         count(*)
    into v_online, v_total
    from skill_participants p where p.room_id = v_room;

  return jsonb_build_object(
    'ok',      true,
    'role',    'presenter',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'direction', v_b.direction,
    'teams',   wi_teams_json(v_room, v_b.team_count),
    'team_count', v_b.team_count,
    'factions',   v_b.factions,
    'duration',   v_b.duration_secs,
    'radius',     v_b.radius,
    'seed',       v_b.seed,
    'map_key', v_room::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room) else null end,
    'own',     wi_own_string(v_room),
    'ends_at', v_b.ends_at,
    'countdown_ends_at', v_b.countdown_ends_at,
    'winner_team', v_b.winner_team,
    'online_count', v_online,
    'room_total',   v_total,
    'sets', coalesce((select jsonb_agg(set_id) from wi_room_sets where room_id = v_room), '[]'::jsonb),
    -- Die Aufstellung sieht nur das Pult, und nur mit Namen: sie
    -- ist zum Vorlesen da („Tablet 7, du bist bei den
    -- Socken-Piraten"), nicht zum Bewerten.
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seat', p.seat,
               'name', coalesce(p.name, 'Tablet ' || p.seat),
               'team', w.team_index,
               'online', p.last_seen_at > now() - interval '90 seconds',
               'correct', coalesce(w.correct_count, 0),
               'wrong',   coalesce(w.wrong_count, 0)) order by p.seat)
        from skill_participants p
        left join wi_players w on w.participant_id = p.id
       where p.room_id = v_room), '[]'::jsonb)
  );
end;
$$;

revoke all on function wi_room_get(text, boolean) from public;
grant execute on function wi_room_get(text, boolean) to authenticated;

comment on function wi_room_get(text, boolean) is
  'Beamer-Ansicht von Myth of Wordisland. Seit 0133 zusätzlich factions (welche Völker), '
  'online_count/room_total und je Kind, ob es gerade am Tablet ist.';


-- ─────────────────────────────────────────────────────────────
-- 7) wi_view — die Wartetafel am Tablet
-- ─────────────────────────────────────────────────────────────
-- Neu: `factions`, `team_count` und `my_team_members` — die Namen
-- der eigenen Gruppe, wie in Kingdoms (0098). Wer „du" ist, sagt der
-- Server (`me`) und nicht ein Namensvergleich im Gerät: in einer
-- Klasse mit zwei „Lena" wäre der schlicht falsch.
--
-- Die Namen der ANDEREN Völker bekommt das Tablet weiterhin nicht.
-- Es zeigt von ihnen nur Bild, Name und Kopfzahl — mehr braucht ein
-- Kind vor dem Start nicht, und weniger Daten am Gerät ist hier die
-- billigere Entscheidung.
create or replace function wi_view(p_token text, p_full boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_room   skill_rooms;
  v_b      wi_boards;
  v_pl     wi_players;
  v_my     jsonb := '[]'::jsonb;
  v_online int;
  v_total  int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  -- Muss VOR der Zählung stehen, sonst zählt sich der Aufrufer bei
  -- einem gerade abgelaufenen Fenster selbst nicht als anwesend.
  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  v_b := wi_ensure_board(v_room.id);
  v_b := wi_maybe_advance(v_room.id);

  if v_b.phase in ('countdown', 'running') then
    v_pl := wi_ensure_player(v_p.id, v_room.id, v_b.team_count);
    if v_pl.current_item is null and v_b.phase = 'running' then
      perform wi_next_task(v_p.id, v_room.id);
      select * into v_pl from wi_players where participant_id = v_p.id;
    end if;
  else
    -- Außerhalb der Arena: Einzelübung. Die Aufgabe kommt aus
    -- denselben Units, der Fortschritt läuft in dieselbe
    -- Wiedervorlage — nur passiert auf der Karte nichts.
    --
    -- ⚠️ Platzhalter. Das Alleine-Lernen bekommt eine eigene
    -- Metapher; bis dahin ist das hier eine Übungsstrecke ohne
    -- Bild und tut ehrlich so, als wäre es keine.
    v_pl := wi_ensure_player(v_p.id, v_room.id, v_b.team_count);
    if v_pl.current_item is null then
      perform wi_next_task(v_p.id, v_room.id);
      select * into v_pl from wi_players where participant_id = v_p.id;
    end if;
  end if;

  select count(*) filter (where p.last_seen_at > now() - interval '90 seconds'),
         count(*)
    into v_online, v_total
    from skill_participants p where p.room_id = v_room.id;

  -- Nach Sitzplatz sortiert, damit die Reihenfolge zwischen zwei
  -- Abrufen nicht springt.
  select coalesce(jsonb_agg(jsonb_build_object(
           'name',   coalesce(p.name, 'Tablet ' || p.seat),
           'me',     p.id = v_p.id,
           'online', p.last_seen_at > now() - interval '90 seconds')
         order by p.seat), '[]'::jsonb)
    into v_my
    from wi_players w
    join skill_participants p on p.id = w.participant_id
   where w.room_id = v_room.id and w.team_index = v_pl.team_index;

  return jsonb_build_object(
    'ok',      true,
    'role',    'participant',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'teams',   wi_teams_json(v_room.id, v_b.team_count),
    'team_count', v_b.team_count,
    'factions',   v_b.factions,
    'map_key', v_b.room_id::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room.id) else null end,
    'own',     wi_own_string(v_room.id),
    'ends_at', v_b.ends_at,
    'countdown_ends_at', v_b.countdown_ends_at,
    'winner_team',     v_b.winner_team,
    'my_team_members', v_my,
    'online_count',    v_online,
    'room_total',      v_total,
    'me', jsonb_build_object(
            'seat',    v_p.seat,
            'name',    coalesce(v_p.name, 'Tablet ' || v_p.seat),
            'team',    v_pl.team_index,
            'streak',  v_pl.streak,
            'picks',   v_pl.picks,
            'correct', v_pl.correct_count,
            'wrong',   v_pl.wrong_count,
            'locked_for', greatest(0, ceil(extract(epoch from
                            coalesce(v_pl.lock_until, now()) - now()))::int),
            'task',    wi_task_json(v_pl))
  );
end;
$$;

revoke all on function wi_view(text, boolean) from public;
grant execute on function wi_view(text, boolean) to anon, authenticated;

comment on function wi_view(text, boolean) is
  'Tablet-Ansicht von Myth of Wordisland. Seit 0133 zusätzlich my_team_members (die eigene '
  'Gruppe mit Namen), factions, team_count und online_count/room_total für die Wartetafel.';
