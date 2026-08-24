-- ══════════════════════════════════════════════════════════════
-- Migration 0107 — Kingdoms of Mathoria: Serien-Ereignisse für den Beamer
-- ══════════════════════════════════════════════════════════════
-- 0106 hat die Serien-Boni gebaut und dabei bewusst einen Schnitt
-- gemacht: „clash_room_get bleibt in dieser Migration unangetastet
-- (Beamer-Ansicht zeigt noch keine Fire-Events — Scope-Cut für v1)".
-- Genau der wird hier nachgeholt, weil die Effekt-Runde (UI 18) am
-- Beamer zwei Dinge zeigen soll:
--
--   • Team-Serie  → das Panel des Volkes am Bildschirmrand leuchtet
--                   acht Sekunden
--   • Einzel-Serie → der NAME des Kindes in der Namensliste dieses
--                   Panels leuchtet acht Sekunden
--
-- Beides sind Ereignisse, keine Zustände: der Server kennt nur den
-- Augenblick des Auslösens (clash_team_events, 0106), die acht
-- Sekunden gehören dem Client.
--
-- ── Warum ALLE Völker, anders als bei clash_view ────────────────
-- clash_view (Tablet) liefert bewusst nur die Ereignisse des EIGENEN
-- Volkes: „<Name> ist on fire" ist eine Nachricht an die eigene
-- Gruppe, kein Aushang. Der Beamer ist der Aushang — dort stehen alle
-- Völker nebeneinander, und ein Panel, das als einziges nie leuchten
-- könnte, wäre eine stille Falschaussage. Deshalb hier ohne Filter
-- auf ein Team, dafür MIT team_index an jedem Eintrag.
--
-- ── Warum eine flache Liste statt {team: [...]} ─────────────────
-- Der Client vergleicht nur „id > zuletzt gesehene id" und schlägt
-- das Volk am Eintrag nach. Eine nach Team gruppierte Struktur müsste
-- er dafür erst wieder flach machen — und die Reihenfolge zwischen
-- den Gruppen wäre nicht definiert.
--
-- Gedeckelt auf die 40 jüngsten Einträge im ganzen Raum: 0106 trimmt
-- je Team auf 20, bei acht Völkern wären das sonst bis zu 160 Zeilen
-- in JEDER Beamer-Antwort, von denen den Client nur die paar seit
-- seinem letzten Abruf interessieren.
--
-- ⚠️ Grundlage ist die HÖCHSTE bestehende Fassung von clash_room_get
-- (per grep bestätigt: 0100 — 0101/0103 fassen clash_submit_answer an,
-- 0104 clash_room_shuffle_teams/clash_sig_of, 0105 clash_tiles_json und
-- clash_check_win, 0106 clash_view/clash_sig_of, keine davon
-- clash_room_get). Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP, keine neue Tabelle, kein neuer Grant nötig
-- (`create or replace function` behält Rechte an der bestehenden OID).
-- Auch clash_sig_of bleibt unangetastet: es enthält seit 0106 bereits
-- `max(id) from clash_team_events` — der Beamer-Poll bemerkt ein neues
-- Ereignis also schon.
-- ══════════════════════════════════════════════════════════════

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
  v_events jsonb := '[]'::jsonb;
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

  v_tiles := clash_tiles_json(v_room.id);

  select coalesce(jsonb_object_agg(owner_team, cnt), '{}'::jsonb)
    into v_status
    from (
      select owner_team, count(*) as cnt
        from clash_tiles where room_id = v_room.id
       group by owner_team
    ) t;

  v_correct := clash_team_correct(v_room.id);

  -- 0107: die jüngsten Serien-Ereignisse aller Völker. Aufsteigend nach
  -- id ausgeliefert (der Client vergleicht gegen die höchste bereits
  -- gezeigte), aber absteigend AUSGEWÄHLT — sonst schnitte das Limit
  -- die neuen weg statt der alten. `team` statt `team_index`, weil der
  -- Beamer-Client sie nirgends nach Slots gruppiert; er schlägt das
  -- Volk am einzelnen Eintrag nach.
  select coalesce(jsonb_agg(
           jsonb_build_object('id', e.id, 'team', e.team_index,
                              'kind', e.kind, 'payload', e.payload)
           order by e.id), '[]'::jsonb)
    into v_events
    from (
      select id, team_index, kind, payload
        from clash_team_events
       where room_id = v_room.id
       order by id desc
       limit 40
    ) e;

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
    'team_correct_counts', v_correct,
    'team_events', v_events
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms of Mathoria. Seit 0096 team_members, seit 0097 factions und '
  'offline_members, seit 0099 team_correct_counts, seit 0100 tragen Burgkacheln ihre '
  'verbliebenen Leben als `hp` (Kachelliste aus clash_tiles_json). Seit 0107 zusätzlich '
  'team_events: die 40 jüngsten Serien-Ereignisse ALLER Völker (anders als clash_view, das nur '
  'die des eigenen Volkes liefert) — der Beamer lässt daraufhin das Panel des Volkes bzw. den '
  'Namen des Kindes acht Sekunden leuchten.';
