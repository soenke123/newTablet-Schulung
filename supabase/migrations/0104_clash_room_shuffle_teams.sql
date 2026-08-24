-- ═══════════════════════════════════════════════════════════════
-- Kingdoms of Mathoria: Schuffel-Knopf für die Lehrkraft-Lobby
-- ═══════════════════════════════════════════════════════════════
-- Bisher ergab sich die Team-Vorschau (clash_preview_teams) starr aus
-- der Sitzplatz-Reihenfolge (`order by p.seat`). Wer zuerst kam, kam
-- ins erste Volk — freundlich zu Geschwisterkindern und Cliquen, aber
-- genau deshalb wünscht sich die Lehrkraft manchmal das Gegenteil:
-- einen Klick, der die Klasse neu durchmischt.
--
-- Der Zufall wohnt in EINER neuen Spalte am Board (shuffle_seed), nicht
-- an den Teilnehmern selbst: ein neuer Seed dreht die ganze Vorschau
-- auf einmal um, ohne 30 Zeilen einzeln anzufassen. NULL heißt „noch
-- nie gemischt" — dann bleibt es exakt bei der alten Sitzplatz-Formel
-- (kein Verhaltensbruch für Bestandsräume). Erst ab dem ersten Klick
-- entscheidet ein Hash aus Teilnehmer-Id + Seed die Reihenfolge, was
-- bei jedem weiteren Klick (neuer Seed) wieder komplett anders mischt.
--
-- clash_ensure_player (Spätzugang) ruft dieselbe clash_preview_teams
-- auf und braucht deshalb keine eigene Anpassung — EINE Formel, wie
-- der Kommentar dort schon festhält.

-- ─────────────────────────────────────────────────────────────
-- 1) clash_boards.shuffle_seed
-- ─────────────────────────────────────────────────────────────
alter table clash_boards
  add column if not exists shuffle_seed double precision;

comment on column clash_boards.shuffle_seed is
  'NULL = ungemischt, Vorschau folgt der Sitzplatz-Reihenfolge. Gesetzt durch '
  'clash_room_shuffle_teams; jeder Klick schreibt einen neuen Zufallswert und dreht damit '
  'die Vorschau (clash_preview_teams) komplett neu.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_preview_teams — Formel um den Seed erweitert
-- ─────────────────────────────────────────────────────────────
-- Zwei CASE-Sortierschlüssel statt einem gemeinsamen: ist shuffle_seed
-- NULL, tragen alle Zeilen im zweiten Schlüssel NULL (Gleichstand) und
-- der erste (p.seat, numerisch) entscheidet unverändert. Ist er
-- gesetzt, ist umgekehrt der erste Schlüssel für alle gleich (NULL)
-- und der md5-Hash aus Teilnehmer-Id + Seed entscheidet. Eine
-- gemeinsame Text-Sortierspalte hätte die numerische Sitzplatz-Ordnung
-- kaputtgemacht ('10' vor '2').
create or replace function clash_preview_teams(p_room uuid)
  returns table(participant_id uuid, team_index int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p.id,
         ((dense_rank() over (
            order by
              case when b.shuffle_seed is null then p.seat end,
              case when b.shuffle_seed is not null
                   then md5(p.id::text || b.shuffle_seed::text) end
          ))::int - 1) % b.team_count
    from skill_participants p
    join clash_boards b on b.room_id = p.room_id
   where p.room_id = p_room;
$$;

revoke all on function clash_preview_teams(uuid) from public;

comment on function clash_preview_teams(uuid) is
  'Team-Index je Teilnehmer nach Sitzplatz-Reihenfolge, oder — sobald shuffle_seed gesetzt '
  'ist (clash_room_shuffle_teams) — nach einer daraus gehashten Zufallsreihenfolge. Vor dem '
  'Start eine reine Vorschau (nichts gespeichert), beim Start die Quelle für die endgültige '
  'clash_players-Zuordnung.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_room_shuffle_teams — der Knopf selbst
-- ─────────────────────────────────────────────────────────────
-- Nur in phase=lobby, nur der Raum-Besitzer (dieselbe Prüfung wie
-- clash_room_set_factions/clash_room_start). Setzt lediglich den Seed
-- neu; die eigentliche Umverteilung übernimmt clash_preview_teams
-- beim nächsten Abruf.
create or replace function clash_room_shuffle_teams(p_code text)
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

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  update clash_boards
     set shuffle_seed = random()
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function clash_room_shuffle_teams(text) from public;
grant execute on function clash_room_shuffle_teams(text) to authenticated;

comment on function clash_room_shuffle_teams(text) is
  'Würfelt die Team-Vorschau der Lobby neu (setzt clash_boards.shuffle_seed neu). '
  'Nur in phase=lobby, nur der Raum-Besitzer.';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_sig_of — shuffle_seed ins Sicherheitsnetz aufnehmen
-- ─────────────────────────────────────────────────────────────
-- Ohne diese Zeile würde ein gemischtes Team zwar sofort per Broadcast
-- bei allen ankommen (nudge() in tool.js), aber ein verpasster
-- Broadcast hätte keinen zweiten Weg zurück: die Vorschau-ANZAHL
-- (`count(*) from clash_preview_teams`) ändert sich beim Mischen
-- nicht, nur die Zuordnung. Neuester Stand vor dieser Migration: 0099
-- (Basis für diese Kopie, nicht 0093/0094/0097 — siehe Projektregel
-- „shop_state_merge nie aus alter Migration kopieren", hier
-- entsprechend für clash_sig_of).
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
    (select coalesce(shuffle_seed::text, '') from clash_boards where room_id = p_room),
    (select coalesce(extract(epoch from match_ends_at)::bigint, 0)
       from clash_boards where room_id = p_room),
    (select coalesce(sum(pl.correct_count), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room)
  );
$$;

revoke all on function clash_sig_of(uuid) from public;
