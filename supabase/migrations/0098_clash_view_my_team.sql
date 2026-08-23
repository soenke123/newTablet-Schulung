-- ══════════════════════════════════════════════════════════════
-- Migration 0098 — Kingdoms of Mathoria: das eigene Volk auf dem Tablet
-- ══════════════════════════════════════════════════════════════
-- Die Warte-Ansicht des Teilnehmers zeigt bisher nur eine Zeile
-- („Dein vorläufiges Team: Toast-Ritter") und daneben Zahlen-Chips für
-- alle Völker. Sie soll stattdessen dasselbe zeigen, was die Klasse auf
-- dem Beamer sieht — aber nur für DAS EIGENE Volk: Gruppenbild, Name,
-- Kopfzahl und die Namen der Kinder, die dazugehören. Die anderen
-- Völker bleiben eine schlichte Liste aus Einheit und Zahl.
--
-- ── Warum das 0096 nicht widerspricht ──────────────────────────
-- 0096 hat die Namensliste ausdrücklich NUR an die Lehrkraft gegeben,
-- mit der Begründung „auf die Tablets der Klasse gehört sie nicht,
-- solange niemand danach gefragt hat". Danach ist jetzt gefragt — und
-- zwar genau in dem Umfang, den ein Kind ohnehin sieht, sobald der
-- Beamer läuft: die eigene Gruppe. Die Namen der ANDEREN Völker gehen
-- weiterhin nicht ans Tablet, `teams` liefert davon nur die Zahl.
--
-- ── my_team_members ist eine Liste aus Objekten ────────────────
-- {name, me} statt bloßer Zeichenketten: das Tablet hebt den eigenen
-- Eintrag hervor, und ein Vergleich über den Namen wäre in einer Klasse
-- mit zwei „Lena" schlicht falsch. Die Zuordnung kommt aus der
-- Teilnehmer-Id, die das Tablet nie zu sehen bekommt.
--
-- ── Zwei Quellen, je nach Phase ────────────────────────────────
-- Wie in 0096: in der Lobby ist die Zuordnung eine Vorschau
-- (clash_preview_teams, nur online), ab dem Start steht sie in
-- clash_players. Die Liste wird auch nach dem Start gefüllt, obwohl
-- heute nur die Lobby sie anzeigt — sie kostet nichts und der
-- Spielbildschirm darf sie später ohne neue Migration benutzen.
--
-- ── Nebenbei: me.name kam aus der falschen Quelle ──────────────
-- clash_view baute den Anzeigenamen selbst („Tablet 3"), während der
-- Rest des Systems skill_seat_name benutzt („User 3", 0084 — die
-- EINZIGE Stelle, an der diese Zeichenkette gebildet werden soll). In
-- einem anonymen Raum hieß dasselbe Kind auf dem Beamer „User 3" und
-- auf dem eigenen Tablet „Tablet 3". Hier zieht me.name auf
-- skill_seat_name nach, damit beide Ansichten dasselbe sagen.
--
-- ⚠️ `clash_view` wird NEU DEKLARIERT. Grundlage ist die Fassung aus
-- 0097 (die höchste bestehende) — sonst fielen `factions` und damit
-- die Volk-Zuordnung wieder weg.
-- Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP — `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

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
  'Teilnehmer-Ansicht von Kingdoms of Mathoria. Seit 0098 zusätzlich my_team_members: '
  '[{name, me}, …] — die Kinder im EIGENEN Volk (Lobby: Vorschau, nur online; ab dem '
  'Start aus clash_players). Die Namen der anderen Völker bleiben auf dem Beamer, das '
  'Tablet bekommt davon nur die Zahl aus `teams`. me.name kommt seit 0098 aus '
  'skill_seat_name (0084) statt aus einem eigenen „Tablet <seat>".';
