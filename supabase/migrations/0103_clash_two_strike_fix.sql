-- ══════════════════════════════════════════════════════════════
-- Migration 0103 — Kingdoms of Mathoria: erster Fehlversuch warf
-- ══════════════════════════════════════════════════════════════
-- 0101 hat die zwei Versuche je Aufgabe eingeführt, aber der erste
-- Fehlversuch kam nie beim Kind an: statt „versuch's nochmal" stand
-- da „Keine Verbindung".
--
-- ── Warum ───────────────────────────────────────────────────────
-- Die neue Aufgabe lag in einer record-Variablen, und der Rückgabe-
-- Ausdruck las sie auch dann:
--
--   'question', case when v_advance
--                 then jsonb_build_object('a', v_q.a, 'b', v_q.b)
--                 else null end
--
-- PL/pgSQL reicht Variablen als Parameter in das SQL hinein — sie
-- werden gebunden, BEVOR das CASE entscheidet, welcher Zweig gilt.
-- Beim ersten Fehlversuch ist v_advance false, v_q also nie
-- zugewiesen, und Postgres wirft
--   record "v_q" is not assigned yet
-- Die Fehlermeldung fiel dem Kind als Netzfehler vor die Füße, weil
-- lib/tool.js jeden geworfenen Aufruf zu `network` macht.
--
-- Merksatz für record-Variablen in Rückgabe-Ausdrücken: ein SQL-CASE
-- schützt nicht davor, dass die Variable gelesen wird. Entweder
-- skalar und vorbelegt (hier) oder das jsonb vor dem `return` in
-- einer eigenen Variablen zusammenbauen.
--
-- ── Fix ─────────────────────────────────────────────────────────
-- v_q (record) → v_qa/v_qb (int, initial null). Skalare dürfen
-- unbelegt gelesen werden; sie sind dann schlicht NULL, und der
-- else-Zweig wirft sie ohnehin weg.
--
-- ⚠️ Grundlage ist 0101 (die höchste bestehende Fassung von
-- clash_submit_answer — 0102 betrifft nur clash_layouts), sonst
-- fielen die zwei Versuche oder die drei Burgleben wieder weg.
-- Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP — `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

-- Sicherheitsnetz: falls 0101 in einer Umgebung nur teilweise lief.
alter table clash_players
  add column if not exists wrong_attempt boolean not null default false;


create or replace function clash_submit_answer(p_token text, p_answer int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p        skill_participants;
  v_room     skill_rooms;
  v_board    clash_boards;
  v_player   clash_players;
  v_correct  boolean;
  v_retry    boolean := false;   -- erster Fehlversuch: Aufgabe bleibt stehen
  v_advance  boolean := false;   -- neue Aufgabe ziehen?
  v_tr       int;
  v_tc       int;
  v_tprev    int;
  v_castle   boolean := false;
  v_hp       int;
  v_taken    boolean := false;   -- Besitzer hat gewechselt
  v_hit_hp   int := null;        -- Burg getroffen, aber nicht gefallen
  v_alive_n  int;
  v_reveal_a int;
  v_reveal_b int;
  -- Skalar statt record (0103): wird im Rückgabe-Ausdruck auch dann
  -- gelesen, wenn keine neue Aufgabe gezogen wurde.
  v_qa       int := null;
  v_qb       int := null;
  i          int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_running', 'phase', v_board.phase);
  end if;

  perform clash_ensure_player(v_p.id, v_room.id);
  select * into v_player from clash_players where participant_id = v_p.id;
  if v_player.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  ) then
    return jsonb_build_object('ok', false, 'error', 'team_eliminated');
  end if;

  -- Randfall: keine laufende Frage (sollte durch clash_ensure_player/
  -- clash_room_start nicht vorkommen) — dann erst eine ziehen, ohne
  -- die abgegebene Zahl zu werten.
  if v_player.current_a is null then
    select q.a, q.b into v_qa, v_qb from clash_new_question() q;
    update clash_players set current_a = v_qa, current_b = v_qb, wrong_attempt = false
     where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'correct', null,
      'question', jsonb_build_object('a', v_qa, 'b', v_qb));
  end if;

  v_correct := (p_answer = v_player.current_a + v_player.current_b);

  if v_correct then
    v_advance := true;

    for i in 1..3 loop
      v_tr := null; v_tc := null; v_tprev := null; v_castle := false; v_hp := null;
      select t.r, t.c, t.owner_team, t.is_castle, t.castle_hp
        into v_tr, v_tc, v_tprev, v_castle, v_hp
        from clash_tiles t
       where t.room_id = v_room.id
         and t.owner_team <> v_player.team_index
         and exists (
           select 1 from clash_tiles m
            where m.room_id = t.room_id
              and m.owner_team = v_player.team_index
              and clash_is_neighbor(m.r, m.c, t.r, t.c)
         )
       order by random()
       limit 1
         for update of t skip locked;
      exit when v_tr is not null;
    end loop;

    if v_tr is not null then
      if v_castle and coalesce(v_hp, 3) > 1 then
        -- Angeschlagen, aber noch nicht gefallen. `updated_at` wird
        -- mitgesetzt, damit clash_sig_of den Treffer sieht.
        update clash_tiles
           set castle_hp = castle_hp - 1, updated_at = now()
         where room_id = v_room.id and r = v_tr and c = v_tc;
        v_hit_hp := coalesce(v_hp, 3) - 1;
      else
        -- Gewöhnliches Feld ODER das letzte Leben einer Burg: der
        -- Besitzer wechselt.
        update clash_tiles
           set owner_team = v_player.team_index,
               castle_hp  = 3,
               updated_at = now()
         where room_id = v_room.id and r = v_tr and c = v_tc;
        v_taken := true;
      end if;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1, wrong_attempt = false
     where participant_id = v_p.id;

  elsif not coalesce(v_player.wrong_attempt, false) then
    -- Erster Fehlversuch zu dieser Aufgabe: nur „nochmal versuchen",
    -- die Aufgabe bleibt stehen. Streak bricht trotzdem sofort — das
    -- war schon vor 0101 so.
    v_retry := true;
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = true
     where participant_id = v_p.id;

  else
    -- Zweiter Fehlversuch in Folge: jetzt wird aufgelöst. current_a/
    -- current_b sind noch die der gescheiterten Aufgabe — merken,
    -- BEVOR sie gleich von der neuen überschrieben werden.
    v_advance := true;
    v_reveal_a := v_player.current_a;
    v_reveal_b := v_player.current_b;
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = false
     where participant_id = v_p.id;
  end if;

  if v_advance then
    select q.a, q.b into v_qa, v_qb from clash_new_question() q;
    update clash_players set current_a = v_qa, current_b = v_qb
     where participant_id = v_p.id;
  end if;

  -- Nur ein echter Besitzerwechsel kann ein Volk ausgelöscht haben.
  if v_taken then
    select count(distinct owner_team) into v_alive_n
      from clash_tiles where room_id = v_room.id;
    if v_alive_n <= 1 then
      update clash_boards
         set phase = 'ended', ended_at = now(),
             winner_team = (select owner_team from clash_tiles
                              where room_id = v_room.id limit 1)
       where room_id = v_room.id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'retry', v_retry,
    'reveal', case when v_reveal_a is not null
                 then jsonb_build_object('a', v_reveal_a, 'b', v_reveal_b,
                                         'sum', v_reveal_a + v_reveal_b)
                 else null end,
    'captured', case when v_taken
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'prev_owner', v_tprev,
                                         'castle', v_castle, 'hp', 3)
                 else null end,
    'castle_hit', case when v_hit_hp is not null
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'hp', v_hit_hp,
                                         'owner', v_tprev)
                 else null end,
    'streak', (select streak from clash_players where participant_id = v_p.id),
    'question', case when v_advance
                 then jsonb_build_object('a', v_qa, 'b', v_qb)
                 else null end
  );
end;
$$;

revoke all on function clash_submit_answer(text, int) from public;
grant execute on function clash_submit_answer(text, int) to anon, authenticated;

comment on function clash_submit_answer(text, int) is
  'Eine Antwort abgeben. Seit 0101 zwei Versuche je Aufgabe: der erste Fehlversuch liefert nur '
  '`retry:true` (Aufgabe bleibt stehen), erst der zweite liefert `reveal:{a,b,sum}` und zieht '
  'eine neue Aufgabe. 0103 macht die Aufgaben-Variable skalar — als record warf der erste '
  'Fehlversuch „record not assigned yet". `captured`/`castle_hit` wie seit 0100.';
