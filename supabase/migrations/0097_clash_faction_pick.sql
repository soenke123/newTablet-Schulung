-- ══════════════════════════════════════════════════════════════
-- Migration 0097 — Kingdoms of Mathoria: WELCHE Völker spielen mit?
-- ══════════════════════════════════════════════════════════════
-- Bisher war die Lobby-Einstellung eine ZAHL: `team_count` (2..8), und
-- das Volk ergab sich still aus dem Slot-Index — Slot 0 waren immer die
-- Toast-Ritter, Slot 1 immer die Robo-Enten. Wer drei Völker wollte,
-- bekam zwangsläufig die ersten drei.
--
-- Jetzt wählt die Lehrkraft eine MENGE: acht Wappen nebeneinander, die
-- man an- und abschaltet. Damit zerfällt die stillschweigende Gleichung
-- „Volk = Slot": ein Board mit den Brokkoli-Giraffen und dem
-- Spuk-Einhorn hat die Slots 0 und 1, aber die Völker 2 und 6.
--
-- ── Warum trotzdem team_count bleibt ───────────────────────────
-- Die Spielfeld-Geometrie (clash_layouts, 0093) hängt an der ANZAHL,
-- nicht an der Identität — genauso clash_preview_teams (`% team_count`)
-- und clash_players.team_index. Diese ganze Maschinerie rechnet weiter
-- in Slots 0..n-1 und bleibt unangetastet. `factions` ist eine reine
-- ÜBERSETZUNGSTABELLE obendrauf: factions[slot] = Volk. team_count ist
-- ab hier abgeleitet (= Länge von factions) und wird von jeder RPC, die
-- factions schreibt, mitgezogen. Zwei Felder, eine Wahrheit — deshalb
-- darf `factions` nirgends ohne `team_count` gesetzt werden.
--
-- ── Sortiert, nicht in Klick-Reihenfolge ───────────────────────
-- clash_normalize_factions sortiert aufsteigend. Ein Volk landet damit
-- reproduzierbar an derselben Stelle, und beim An-/Abwählen in der
-- Lobby springen die Spalten nicht durcheinander — die Karten sitzen
-- immer in der Reihenfolge der acht Völker.
--
-- ── Was der Client davon braucht ───────────────────────────────
-- `factions` kommt in BEIDE Ansichten: clash_room_get (Beamer) und
-- clash_view (Teilnehmer). Ohne das zweite stünde auf dem Tablet „Dein
-- Team: Gelb", während der Beamer „Mal-Hasen" sagt — die Farbe eines
-- Slots ist ohne die Übersetzung schlicht nicht mehr bestimmbar.
-- Und `clash_sig_of` bekommt factions dazu: ein Tausch bei gleicher
-- Anzahl (Rot raus, Rosa rein) ändert team_count nicht, muss aber auf
-- den Tablets ankommen.
--
-- ── Wer nicht online ist, steht unten ──────────────────────────
-- clash_room_get lieferte bisher nur die ZAHLEN online_count/room_total.
-- Die neue Lobby zeigt die Nicht-Online mit Namen in einer eigenen Reihe
-- unter den Völkern — also `offline_members`. Bewusst als Komplement zu
-- clash_preview_teams formuliert (`not in`), nicht mit einer zweiten
-- Kopie der 90-Sekunden-Grenze: was nicht in einem Team steht, steht
-- unten. Diese Eigenschaft soll gelten, egal wie sich die Grenze mal
-- ändert.
--
-- ⚠️ Neu deklariert werden clash_sig_of + clash_room_start +
-- clash_room_set_team_count (Grundlage: 0094), clash_view (0094) und
-- clash_room_get (0096) — jeweils die HÖCHSTE bestehende Fassung, sonst
-- fielen deren Zusätze wieder weg.
-- Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP — `add column if not exists`, `create or replace`, und die
-- Prüfbedingung über einen DO-Block mit pg_catalog-Abfrage
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_boards.factions
-- ─────────────────────────────────────────────────────────────
-- Die Voreinstellung ist nicht mehr „die ersten vier": Brokkoli-
-- Giraffen (2), Mal-Hasen (3), Kosmische Katzen (4), Spuk-Einhorn (6).
--
-- Der Rückfüllung der Bestandsräume MUSS die Neuanlage-Prüfung
-- vorausgehen: liefe sie bei einem zweiten Durchlauf der Migration
-- erneut, überschriebe sie die Wahl einer Lehrkraft mit 0..n-1. Deshalb
-- der DO-Block statt `add column if not exists` + nacktem `update`.
do $$
declare
  v_fresh boolean;
begin
  select not exists (
    select 1 from pg_catalog.pg_attribute
     where attrelid = 'public.clash_boards'::regclass
       and attname  = 'factions'
       and not attisdropped
  ) into v_fresh;

  if v_fresh then
    alter table clash_boards
      add column factions jsonb not null default '[2, 3, 4, 6]'::jsonb;

    -- Bestandsräume haben bis hier nach der alten Gleichung gespielt:
    -- Volk = Slot. Genau das wird als ihre Wahl festgeschrieben, damit
    -- eine laufende Lobby durch die Migration nicht die Völker wechselt.
    update clash_boards
       set factions = (
             select jsonb_agg(i order by i)
               from generate_series(0, team_count - 1) i
           );
  end if;
end $$;

comment on column clash_boards.factions is
  'Welche Völker spielen mit, als sortierte Liste ihrer Indizes 0..7: factions[slot] = Volk. '
  'Länge = team_count (die beiden werden immer gemeinsam gesetzt). Bis 0097 gab es die Spalte '
  'nicht und es galt still Volk = Slot-Index.';

-- Bewusst nur die grobe Form (Feld, Länge). Dass die Elemente ganze
-- Zahlen 0..7 ohne Wiederholung sind, prüft clash_normalize_factions —
-- eine Stelle, die auch gleich sortiert und vereinheitlicht, statt
-- zweier Regelwerke, die auseinanderlaufen können.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname   = 'clash_boards_factions_len_ck'
       and conrelid  = 'public.clash_boards'::regclass
  ) then
    alter table clash_boards
      add constraint clash_boards_factions_len_ck
      check (jsonb_typeof(factions) = 'array'
             and jsonb_array_length(factions) between 2 and 8);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) clash_normalize_factions — die eine Stelle, die prüft
-- ─────────────────────────────────────────────────────────────
-- Gibt die bereinigte Liste zurück (Duplikate raus, aufsteigend
-- sortiert) oder NULL, wenn die Eingabe nichts taugt. NULL statt einer
-- Ausnahme, damit der Aufrufer sie in seine übliche
-- {ok:false,error:…}-Antwort übersetzen kann, statt dass eine
-- SQL-Ausnahme durch die RPC-Schicht schlägt.
create or replace function clash_normalize_factions(p_factions jsonb)
  returns jsonb
  language sql
  immutable
as $$
  select case
    when p_factions is null or jsonb_typeof(p_factions) <> 'array' then null
    -- Der reguläre Ausdruck erledigt Bruchzahlen, negative Werte und
    -- alles über 7 in einem Zug — `(e #>> '{}')` ist der Rohtext des
    -- JSON-Werts, bei einer 3 also '3', bei 3.5 eben '3.5'.
    when exists (
      select 1 from jsonb_array_elements(p_factions) e
       where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-7]$'
    ) then null
    else (
      select case when count(*) between 2 and 8
                  then jsonb_agg(v order by v)
                  else null end
        from (
          select distinct (e #>> '{}')::int as v
            from jsonb_array_elements(p_factions) e
        ) x
    )
  end;
$$;

revoke all on function clash_normalize_factions(jsonb) from public;

comment on function clash_normalize_factions(jsonb) is
  'Prüft und vereinheitlicht eine Völker-Auswahl: ganze Zahlen 0..7, ohne Wiederholung, '
  '2 bis 8 Stück, aufsteigend sortiert. NULL heißt „unbrauchbar" — der Aufrufer macht daraus '
  'invalid_factions.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_room_set_factions — die neue Lobby-Bedienung
-- ─────────────────────────────────────────────────────────────
-- Ersetzt clash_room_set_team_count als das, was die Oberfläche
-- aufruft. Gibt die bereinigte Liste zurück, damit der Client sofort
-- die Reihenfolge sieht, die der Server tatsächlich gespeichert hat,
-- statt sie nachzubilden.
create or replace function clash_room_set_factions(p_code text, p_factions jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_norm  jsonb;
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

  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  v_norm := clash_normalize_factions(p_factions);
  if v_norm is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_factions');
  end if;

  update clash_boards
     set factions   = v_norm,
         team_count = jsonb_array_length(v_norm)
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true,
    'factions', v_norm,
    'team_count', jsonb_array_length(v_norm));
end;
$$;

revoke all on function clash_room_set_factions(text, jsonb) from public;
grant execute on function clash_room_set_factions(text, jsonb) to authenticated;

comment on function clash_room_set_factions(text, jsonb) is
  'Setzt, WELCHE Völker mitspielen (Liste von 0..7, 2..8 Stück) — und team_count gleich mit. '
  'Nur in phase=lobby. Löst clash_room_set_team_count als Lobby-Bedienung ab.';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_room_set_team_count — bleibt, zieht factions jetzt nach
-- ─────────────────────────────────────────────────────────────
-- Die Oberfläche ruft sie ab 0097 nicht mehr auf. Sie bleibt trotzdem
-- bestehen und wird korrekt gehalten, weil ein Tablet mit alt
-- zwischengespeichertem tool.js sie noch aufrufen kann — und dann darf
-- sie nicht team_count und factions auseinanderlaufen lassen (das wäre
-- ein Board mit vier Slots und zwei bekannten Völkern).
--
-- Kleiner werden heißt: die hinteren Völker fallen weg. Größer werden
-- heißt: die noch nicht gewählten kommen in ihrer Reihenfolge dazu.
-- Beides hält die bisherige Auswahl so weit wie möglich fest.
create or replace function clash_room_set_team_count(p_code text, p_team_count int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_norm  jsonb;
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

  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_team_count is null or p_team_count < 2 or p_team_count > 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_team_count');
  end if;

  -- Die bereits gewählten Völker zuerst (`ord = 0`), dann die übrigen
  -- als Auffüllung — und davon die ersten p_team_count. Innerhalb
  -- beider Gruppen aufsteigend, weil factions ohnehin sortiert ist.
  select jsonb_agg(v order by v)
    into v_norm
    from (
      select u.v from (
        select (f #>> '{}')::int as v, 0 as ord
          from jsonb_array_elements(v_board.factions) f
        union all
        select i, 1
          from generate_series(0, 7) i
         where not exists (
           select 1 from jsonb_array_elements(v_board.factions) g
            where (g #>> '{}')::int = i
         )
      ) u
      order by u.ord, u.v
      limit p_team_count
    ) k;

  update clash_boards
     set factions   = v_norm,
         team_count = p_team_count
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true, 'team_count', p_team_count, 'factions', v_norm);
end;
$$;

revoke all on function clash_room_set_team_count(text, int) from public;
grant execute on function clash_room_set_team_count(text, int) to authenticated;

comment on function clash_room_set_team_count(text, int) is
  'Alt-Weg: setzt nur die ANZAHL und füllt factions passend auf/kürzt sie. Seit 0097 ruft die '
  'Oberfläche clash_room_set_factions auf; diese Fassung existiert für Tablets mit alt '
  'zwischengespeichertem tool.js, damit team_count und factions nicht auseinanderlaufen.';


-- ─────────────────────────────────────────────────────────────
-- 5) clash_sig_of — Völkertausch muss ankommen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0094. Neu ist nur die factions-Zeile: Rot raus / Rosa rein
-- lässt team_count unverändert, muss die Tablets aber neu zeichnen
-- lassen.
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
       from clash_boards where room_id = p_room)
  );
$$;

revoke all on function clash_sig_of(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 6) clash_view — factions für den Teilnehmer
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0094. Einziger Zusatz ist `factions` in der Antwort —
-- ohne sie kann das Tablet dem eigenen Slot kein Volk und keine Farbe
-- zuordnen. Die Namensliste (team_members) bekommt der Teilnehmer
-- weiterhin bewusst NICHT (siehe 0096).
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
    'factions', v_board.factions,
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

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) clash_room_get — factions + offline_members
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0096 (die höchste bestehende Fassung — nicht 0094, sonst
-- fiele team_members wieder weg).
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
    'team_tile_counts', v_status
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms of Mathoria. Seit 0096 team_members, seit 0097 zusätzlich '
  'factions (welche Völker auf welchem Slot) und offline_members (im Raum, aber in keinem Team — '
  'die Lobby zeigt sie in einer eigenen Reihe unter den Völkern).';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_room_start — Anzahl aus factions statt aus team_count
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0094. Der Start sucht das Layout weiterhin über die
-- ANZAHL — liest sie jetzt aber aus `factions` und schreibt team_count
-- vorsichtshalber darauf fest. Das ist der Riegel gegen einen
-- Bestandsraum, dessen beide Felder aus welchem Grund auch immer
-- auseinandergelaufen sind: ein Board mit vier Slots, aber nur zwei
-- bekannten Völkern, hätte zwei Fraktionen ohne Bild und ohne Namen
-- auf dem Feld. Die Völkerliste ist ab hier die Wahrheit.
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
  v_count  int;
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

  v_count := jsonb_array_length(v_board.factions);

  select * into v_layout from clash_layouts where team_count = v_count;
  if v_layout.team_count is null then
    return jsonb_build_object('ok', false, 'error', 'layout_missing');
  end if;

  -- Muss VOR clash_preview_teams greifen: die Vorschau rechnet
  -- `% b.team_count` und würde sonst auf einen veralteten Wert verteilen.
  update clash_boards set team_count = v_count where room_id = v_room.id;

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

  -- clash_preview_teams liest hier NUR die online Teilnehmer (0094) —
  -- wer nicht online ist, bekommt keine Zeile und damit kein Team, bis
  -- er/sie online kommt (dann greift clash_ensure_player).
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

revoke all on function clash_room_start(text) from public;
grant execute on function clash_room_start(text) to authenticated;
