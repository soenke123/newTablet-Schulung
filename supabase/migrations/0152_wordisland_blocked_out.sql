-- ═══════════════════════════════════════════════════════════════
-- 0152 — Stillgelegte Tablets sind in Wordisland keine Mitspieler
-- ═══════════════════════════════════════════════════════════════
-- Sönkes Meldung: „Der Lehrer soll Schüler auch stilllegen können,
-- genau wie bei Mathoria, sodass sie nicht mehr in der Teamaufteilung
-- aufgeteilt werden."
--
-- Das Stilllegen selbst gibt es längst und für alle Werkzeuge
-- (skill_participants.blocked, 0081; der Knopf sitzt im Fach
-- „Onboarding" unter „Teilnehmer verwalten"). Was fehlt, ist die
-- Folge im SPIEL: Wordisland verteilt bis jetzt ausdrücklich ALLE
-- Teilnehmer eines Raums auf die Völker (das ist der bewusste
-- Unterschied zu Kingdoms — „Abwesende bekommen hier trotzdem ein
-- Volk", 0133). Ein stillgelegtes Tablet zählt damit als Volksmitglied,
-- das nie antwortet: die Lobby liest seinen Namen vor, die Kopfzahl
-- der Spalte lügt, und die Insel wird für ein Kind mehr gebaut.
--
-- Kingdoms macht es seit 0113 anders und richtig: clash_preview_teams
-- filtert `not p.blocked`, und weil dort die Aufstellung BERECHNET
-- wird, wirkt das Stilllegen sofort. In Wordisland steht die
-- Aufstellung in einer Tabelle (wi_players) — sie soll ja über die
-- Lobby hinweg stehenbleiben. Darum hier zwei Griffe statt einem:
--
--   1. VERTEILEN überspringt Stillgelegte (wi_seat_assign,
--      wi_room_shuffle, wi_ensure_player). Wer beim Start gesperrt
--      ist, bekommt gar keine Zeile.
--   2. LESEN überspringt sie ebenfalls (wi_teams_json, wi_view,
--      und am Pult tragen sie ein eigenes Merkmal). Damit wirkt ein
--      Stilllegen MITTEN in der Lobby sofort, ohne dass jemand neu
--      mischen müsste.
--
-- Die Zeile in wi_players bleibt dabei absichtlich stehen. Stilllegen
-- ist umkehrbar („Jederzeit umkehrbar" steht wörtlich am Knopf), und
-- wer freigegeben wird, soll in sein altes Volk zurückkommen und nicht
-- in ein zufälliges neues.
--
-- ⚠️ Kein `blocked`-Riegel in wi_answer, und das ist Absicht und
-- Gleichstand mit Kingdoms: clash_answer prüft es ebenfalls nicht.
-- Das Gerät hängt sich beim Stilllegen selbst aus (skill_sig liefert
-- 'blocked', j.js baut das Werkzeug ab) — und wer beim Start gesperrt
-- war, hat keine wi_players-Zeile und läuft in wi_answer ohnehin in
-- 'not_found'. Ein zweiter Riegel hieße, wi_answer (250 Zeilen aus
-- 0151) für drei Zeilen abzuschreiben; der Preis ist höher als der
-- Gewinn.


-- ─────────────────────────────────────────────────────────────
-- 1) wi_seat_assign — die Aufstellung nach Sitzplatz
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0133, Wort für Wort. Neu ist eine Zeile in der
-- where-Bedingung.
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
   where p.room_id = p_room
     and not p.blocked;                      -- 0152
end;
$$;

comment on function wi_seat_assign(uuid, int) is
  'Verteilt alle Teilnehmer eines Raums reihum auf die Slots 0..p_teams-1, nach Sitzplatz '
  'sortiert. Setzt Serien, Punkte und laufende Aufgaben zurück — eine neue Aufstellung ist '
  'ein neuer Anfang. Seit 0152 ohne stillgelegte Tablets (blocked, 0081).';


-- ─────────────────────────────────────────────────────────────
-- 2) wi_room_shuffle — neu gemischt von Hand
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0131, Wort für Wort. Dieselbe eine Zeile. (Die Funktion
-- hat ihre eigene Kopie der Verteilung, weil sie mit random() statt
-- nach seat ordnet — 0133 hat nur die zwei IDENTISCHEN Kopien zu
-- wi_seat_assign zusammengeführt.)
create or replace function wi_room_shuffle(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
  v_b    wi_boards;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from wi_boards where room_id = v_room;
  if v_b.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  delete from wi_players where room_id = v_room;
  insert into wi_players (participant_id, room_id, team_index)
  select p.id, v_room, (row_number() over (order by random()) - 1)::int % v_b.team_count
    from skill_participants p
   where p.room_id = v_room
     and not p.blocked;                      -- 0152

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function wi_room_shuffle(text) from public;
grant execute on function wi_room_shuffle(text) to authenticated;

comment on function wi_room_shuffle(text) is
  'Würfelt die Aufstellung neu. Nur in der Lobby, nur der Raum-Besitzer. Seit 0152 ohne '
  'stillgelegte Tablets.';


-- ─────────────────────────────────────────────────────────────
-- 3) wi_ensure_player — der Nachzügler
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0131, Wort für Wort. Zwei Änderungen:
--
--   · Ein stillgelegtes Tablet bekommt keine Zeile. Erreichbar ist
--     der Fall über wi_view, und der bekommt gleich darunter seinen
--     eigenen Riegel — die Zeile hier ist der Gürtel zum Hosenträger
--     und kostet nichts.
--   · Das KLEINSTE Volk wird ohne Stillgelegte gezählt. Sonst gälte
--     ein Volk mit drei gesperrten Tablets als voll, und der
--     Nachzügler landete ausgerechnet dort, wo real niemand spielt —
--     genau das Gegenteil dessen, wofür die Regel da ist.
create or replace function wi_ensure_player(p_participant uuid, p_room uuid, p_teams int)
  returns wi_players
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_p wi_players;
  v_t int;
begin
  select * into v_p from wi_players where participant_id = p_participant;
  if v_p.participant_id is not null then
    return v_p;
  end if;

  -- 0152: Stillgelegte spielen nicht mit, also brauchen sie auch
  -- kein Volk. Die leere Zeile kommt zurück; der Aufrufer prüft.
  if exists (select 1 from skill_participants sp
              where sp.id = p_participant and sp.blocked) then
    return v_p;
  end if;

  select coalesce((
    select t.team_index
      from generate_series(0, p_teams - 1) as t(team_index)
      left join wi_players w on w.room_id = p_room and w.team_index = t.team_index
      left join skill_participants sp on sp.id = w.participant_id
                                     and not sp.blocked      -- 0152
     group by t.team_index
     order by count(sp.id), t.team_index
     limit 1
  ), 0) into v_t;

  insert into wi_players (participant_id, room_id, team_index)
  values (p_participant, p_room, v_t)
  on conflict (participant_id) do nothing;

  select * into v_p from wi_players where participant_id = p_participant;
  return v_p;
end;
$$;

comment on function wi_ensure_player(uuid, uuid, int) is
  'Legt die Spieler-Zeile eines Nachzüglers im KLEINSTEN lebenden Volk an (Muster aus '
  'Kingdoms 0121/0128). Seit 0152: stillgelegte Tablets bekommen keine Zeile und zählen '
  'auch nicht mit, wenn das kleinste Volk gesucht wird.';


-- ─────────────────────────────────────────────────────────────
-- 4) wi_teams_json — die Kopfzahl einer Spalte
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0146, Wort für Wort. Neu ist der join in der
-- Kopfzahl-Unterabfrage: „4 Kinder" soll heißen, dass vier Kinder
-- antworten können.
create or replace function wi_teams_json(p_room uuid, p_teams int)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select coalesce(jsonb_agg(x order by (x->>'i')::int), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'i',      t.i,
               'tiles',  coalesce(f.n, 0),
               'ruins',  coalesce(f.rv, 0),
               'score',  coalesce(f.n, 0) + coalesce(f.rv, 0),
               'people', coalesce(p.n, 0)
             ) as x
        from generate_series(0, p_teams - 1) as t(i)
        left join (
          select owner_team, count(*) n,
                 sum(case when ruin_kind is null then 0 else ruin_value - 1 end) rv
            from wi_tiles where room_id = p_room and owner_team is not null
           group by owner_team
        ) f on f.owner_team = t.i
        left join (
          select w.team_index, count(*) n
            from wi_players w
            join skill_participants sp on sp.id = w.participant_id   -- 0152
           where w.room_id = p_room
             and not sp.blocked                                      -- 0152
           group by w.team_index
        ) p on p.team_index = t.i
    ) s;
$$;

comment on function wi_teams_json(uuid, int) is
  'Felder, Ruinenwert, Punktzahl und Kopfzahl je Volk. Seit 0152 zählt die Kopfzahl nur '
  'Tablets, die auch spielen dürfen.';


-- ─────────────────────────────────────────────────────────────
-- 5) wi_room_start — die Insel für die, die spielen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0133, Wort für Wort. Neu ist die Bedingung an v_people.
-- Die Inselgröße folgt aus Kinderzahl und Dauer (1,6 Felder je Kind
-- und Minute); ein stillgelegtes Tablet, das mitgezählt wird, macht
-- die Insel größer, ohne dass jemand darauf landet.
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

  select count(*) into v_people
    from skill_participants
   where room_id = v_room
     and not blocked;                        -- 0152

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

comment on function wi_room_start(text) is
  'Startet eine Runde: Aufstellung neu, Insel neu, Countdown. Seit 0152 zählen stillgelegte '
  'Tablets weder für die Aufstellung noch für die Inselgröße.';


-- ─────────────────────────────────────────────────────────────
-- 6) wi_room_get — am Pult stehen sie DA, nur woanders
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0146, Wort für Wort. Neu ist ein Schlüssel je Kind:
-- `blocked`.
--
-- Bewusst NICHT herausgefiltert: die Lehrkraft hat gerade selbst
-- stillgelegt, und eine Liste, aus der jemand spurlos verschwindet,
-- sieht aus wie ein Fehler. Das Gerät stellt sie stattdessen in eine
-- eigene Zeile unter der Aufstellung („Stillgelegt — sie spielen
-- nicht mit"). Aus demselben Grund bleiben online_count und
-- room_total die Zahlen des RAUMS: dort steht, wer da ist, nicht wer
-- mitspielt.
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
    'ruins',   wi_ruin_string(v_room),
    'hearts',  wi_heart_string(v_room),
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
               'blocked', p.blocked,                                  -- 0152
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
  'Beamer-Ansicht von Myth of Wordisland. Seit 0152 trägt jedes Kind zusätzlich `blocked` — '
  'stillgelegte Tablets stehen am Pult weiter da, aber in einer eigenen Zeile.';


-- ─────────────────────────────────────────────────────────────
-- 7) wi_view — das gesperrte Tablet und die eigene Gruppe
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0151, Wort für Wort. Zwei mit „0152" markierte Stellen:
--
--   · Ein stillgelegtes Tablet bekommt 'blocked' zurück, denselben
--     Fehlercode wie aus der generischen Schicht (0081) — lib/tool.js
--     kennt den Satz dazu schon. Ohne diesen Riegel liefe hier
--     wi_ensure_player und wi_next_task, und ein Kind, das gerade
--     freigegeben wird, fände eine Aufgabe vor, die während der
--     Sperre gezogen wurde.
--   · my_team_members lässt Stillgelegte weg. Die Wartetafel am
--     Tablet ist die einzige Auskunft „wer gehört zu mir" — und wer
--     gesperrt ist, gehört gerade zu niemandem.
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

  -- 0152: gleicher Code wie in skill_view — das Gerät kennt den Satz.
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
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
   where w.room_id = v_room.id
     and w.team_index = v_pl.team_index
     and not p.blocked;                      -- 0152

  return jsonb_build_object(
    'ok',      true,
    'role',    'participant',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'streak_goals', wi_streak_goals(v_b.mode),   -- 0151
    'teams',   wi_teams_json(v_room.id, v_b.team_count),
    'team_count', v_b.team_count,
    'factions',   v_b.factions,
    'map_key', v_b.room_id::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room.id) else null end,
    'own',     wi_own_string(v_room.id),
    'ruins',   wi_ruin_string(v_room.id),
    'hearts',  wi_heart_string(v_room.id),
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
            'shadow_pick', v_pl.shadow_pick,
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
  'Teilnehmer-Ansicht von Wordisland. Seit 0146 ruins/hearts/shadow_pick, seit 0151 '
  'streak_goals, seit 0152 ein Riegel für stillgelegte Tablets (Fehler „blocked" wie in '
  'skill_view) und eine eigene Gruppe ohne sie.';
