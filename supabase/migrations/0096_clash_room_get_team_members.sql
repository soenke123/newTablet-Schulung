-- ══════════════════════════════════════════════════════════════
-- Migration 0096 — Kingdoms of Mathoria: wer gehört zu welchem Volk?
-- ══════════════════════════════════════════════════════════════
-- Die Beamer-Ansicht zeigt seit dem Gestaltungs-Durchgang je Volk ein
-- Panel am Bildschirmrand: Wappenbild, Volksname, Feldzahl — und neu
-- die Namen der Schülerinnen und Schüler, die zu diesem Volk gehören.
-- `clash_room_get` lieferte bisher nur ZAHLEN je Team (`teams`,
-- `team_tile_counts`), keine Namen; die kommen jetzt als
-- `team_members` dazu.
--
-- ── Nur die Beamer-Ansicht ─────────────────────────────────────
-- `clash_view` (Teilnehmer) bleibt unangetastet. Die Namensliste ist
-- für die Lehrkraft gedacht, die ohnehin die Teilnehmerliste des
-- Raums sieht (skill_room_get/skill_people_json) — auf die Tablets
-- der Klasse gehört sie nicht, solange niemand danach gefragt hat.
--
-- ── Zwei Quellen, je nach Phase ────────────────────────────────
-- In der Lobby ist die Team-Zuordnung eine VORSCHAU und steht
-- nirgends gespeichert (clash_preview_teams, seit 0094 zusätzlich auf
-- „online" gefiltert). Ab dem Start ist sie in clash_players
-- festgeschrieben. Dieselbe Weiche, die `teams` schon benutzt —
-- deshalb hier ausdrücklich zwei Zweige statt eines schlauen
-- Ausdrucks, der beide Fälle zugleich treffen will.
--
-- ⚠️ `clash_room_get` wird hier NEU DEKLARIERT. Grundlage ist die
-- Fassung aus 0094 (die höchste bestehende), nicht die aus 0093 —
-- sonst fielen die dortigen Zusätze (match_ends_at, online_count,
-- room_total) wieder weg. Regel: feedback_shop_state_merge_regressions.
--
-- Der Anzeigename kommt aus skill_seat_name(name, seat) (0084) — der
-- einzigen Stelle im System, an der diese Zeichenkette gebildet wird,
-- damit Beamer und Tablet garantiert dasselbe zeigen.
--
-- Kein DROP — `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
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
  v_members jsonb;
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
    'team_members', v_members,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'team_tile_counts', v_status
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms of Mathoria. Seit 0096 zusätzlich team_members: '
  '{team_index: [Anzeigename, …]} — in der Lobby aus der Vorschau (nur online), '
  'ab dem Start aus clash_players. Nur für die Lehrkraft; clash_view (Teilnehmer) '
  'bekommt die Namensliste bewusst nicht.';
