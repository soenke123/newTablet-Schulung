-- ══════════════════════════════════════════════════════════════
-- Migration 0105 — Kingdoms of Mathoria: Loch in der Mitte füllen
-- ══════════════════════════════════════════════════════════════
-- Bug (Sönke, Testspiele): weil 0102 jedem Volk exakt gleich viele
-- Startfelder gibt, geht das nicht mehr randscharf für jedes
-- Vieleck auf — an der Stelle, wo mehrere Völker aufeinandertreffen,
-- bleiben je nach Team-Zahl 1-3 Kacheln übrig, die zu KEINEM Volk
-- passen. 0093 kannte dafür kein Feld ("kein neutrales Feld bleibt
-- übrig") — diese Kacheln fehlten also einfach in `tiles`, und die
-- Karte zeigte ein echtes Loch (kein Sechseck gezeichnet) mitten im
-- Spielfeld.
--
-- Betroffen sind team_count 4 (1 Kachel), 5 und 6 (je 3) sowie 8
-- (2) — ermittelt per Nachbarschafts-Flutung über die bestehenden
-- Layouts (0102): jede fehlende Zelle, deren Lücken-Nachbarn nie den
-- Rand des belegten Bereichs verlassen, ist ein echtes Innenloch,
-- keine Außenkante des Vielecks. team_count 2/3/7 haben keins.
--
-- ── Fix: neutrale Kacheln statt Löcher ─────────────────────────
-- Die Lücken bekommen slot -1 ("neutral", kein Volk, keine Burg).
-- clash_room_start übernimmt Slots ohnehin roh als owner_team — eine
-- neutrale Kachel entsteht ohne jede Änderung dort. Erobern
-- funktioniert ebenso automatisch: clash_submit_answer sucht ein
-- Nachbarfeld mit `owner_team <> team_index`, und -1 erfüllt das
-- genauso wie ein fremdes Volk. Zwei Stellen mussten trotzdem
-- angefasst werden, weil sie bisher jeden `owner_team`-Wert für ein
-- Volk hielten:
--   • clash_submit_answer: die Sieg-Prüfung zählte
--     `count(distinct owner_team)` — mit einer liegen gebliebenen
--     neutralen Kachel wäre das Spiel nie zu Ende gegangen (Sieger-
--     Team + „-1" = 2 „Völker"). Jetzt zählt nur owner_team >= 0,
--     und die winner_team-Auswahl filtert -1 ebenso aus (sonst hätte
--     eine übrig gebliebene neutrale Kachel als „Sieger" gewinnen
--     können, siehe Kommentar dort).
--   • clash_maybe_advance_phase: derselbe Fehler beim Zeitlimit-Ende
--     (Sieger = meiste Felder) — ohne Filter hätte „neutral" mit
--     genug offenen Feldern das Spiel gewinnen können.
-- Der Client (tool.js) bekommt seinen eigenen Fix in derselben
-- Änderung: die Symbol-Schicht überspringt Volk -1 (keine Burg,
-- keine Einheit) — die graue Kachel kommt weiterhin aus dem
-- normalen Sechseck-Durchlauf, `fStroke(-1)` fällt schon auf ein
-- neutrales Grau zurück.
--
-- ⚠️ Grundlage für clash_submit_answer ist 0103 (die höchste
-- bestehende Fassung), für clash_maybe_advance_phase 0094 (dort
-- nie wieder neu definiert) — Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP — Layout-Updates sind ein guarded `update … where not
-- exists(...)`, Funktionen laufen über `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_layouts — Löcher als neutrale Kacheln (slot -1) auffüllen
-- ─────────────────────────────────────────────────────────────
-- Jede Zeile einzeln und mit Existenz-Check (statt den ganzen
-- `tiles`-Blob neu einzuspielen): ein erneuter Lauf hängt nichts
-- doppelt an.

update clash_layouts
   set tiles = tiles || '[{"r":5,"c":5,"slot":-1}]'::jsonb
 where team_count = 4
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 5
   );

update clash_layouts
   set tiles = tiles || '[{"r":5,"c":4,"slot":-1}]'::jsonb
 where team_count = 5
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 4
   );
update clash_layouts
   set tiles = tiles || '[{"r":5,"c":5,"slot":-1}]'::jsonb
 where team_count = 5
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 5
   );
update clash_layouts
   set tiles = tiles || '[{"r":6,"c":5,"slot":-1}]'::jsonb
 where team_count = 5
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 6 and (e->>'c')::int = 5
   );

update clash_layouts
   set tiles = tiles || '[{"r":5,"c":4,"slot":-1}]'::jsonb
 where team_count = 6
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 4
   );
update clash_layouts
   set tiles = tiles || '[{"r":5,"c":5,"slot":-1}]'::jsonb
 where team_count = 6
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 5
   );
update clash_layouts
   set tiles = tiles || '[{"r":5,"c":6,"slot":-1}]'::jsonb
 where team_count = 6
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 6
   );

update clash_layouts
   set tiles = tiles || '[{"r":5,"c":4,"slot":-1}]'::jsonb
 where team_count = 8
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 4
   );
update clash_layouts
   set tiles = tiles || '[{"r":5,"c":5,"slot":-1}]'::jsonb
 where team_count = 8
   and not exists (
     select 1 from jsonb_array_elements(tiles) e
      where (e->>'r')::int = 5 and (e->>'c')::int = 5
   );

comment on column clash_layouts.tiles is
  'Jede gültige Zelle des Spielfelds mit ihrem Start-Slot. 0..team_count-1 gehört einem Volk, '
  '-1 ist neutral (kein Volk, keine Burg, aber erobert wird es wie ein fremdes Feld — 0105). '
  'Bis 0105 galt „kein neutrales Feld bleibt übrig"; das ließ bei manchen Team-Zahlen ein '
  'ungezeichnetes Loch in der Mitte, wo die gleich großen Vielecke nicht randscharf aufgingen.';

comment on column clash_tiles.owner_team is
  'Volk-Slot (0..team_count-1) oder -1 für neutral (0105) — ein Feld ohne Volk, das noch '
  'niemand erobert hat. Zählt bei der Sieg-Prüfung nicht als „lebendes Volk" mit.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_submit_answer — Sieg-Prüfung ignoriert neutrale Kacheln
-- ─────────────────────────────────────────────────────────────
-- Unverändert gegenüber 0103, bis auf die zwei markierten Stellen.
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
        -- Gewöhnliches Feld (auch ein neutrales) ODER das letzte Leben
        -- einer Burg: der Besitzer wechselt.
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
  -- 0105: owner_team >= 0 — eine liegen gebliebene neutrale Kachel
  -- (-1) zählt nicht als „Volk", sonst ginge das Spiel nie zu Ende
  -- (Sieger-Team + „neutral" wären zwei Zeilen), und die winner_team-
  -- Auswahl könnte sonst die neutrale Kachel selbst als Sieger ziehen.
  if v_taken then
    select count(distinct owner_team) into v_alive_n
      from clash_tiles where room_id = v_room.id and owner_team >= 0;
    if v_alive_n <= 1 then
      update clash_boards
         set phase = 'ended', ended_at = now(),
             winner_team = (select owner_team from clash_tiles
                              where room_id = v_room.id and owner_team >= 0 limit 1)
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
  'eine neue Aufgabe. `captured`/`castle_hit` wie seit 0100. Seit 0105 zählen neutrale Kacheln '
  '(owner_team -1) nicht als „Volk" bei der Sieg-Prüfung, sind aber als Eroberungsziel erlaubt.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_maybe_advance_phase — Zeitlimit-Sieger ignoriert Neutral
-- ─────────────────────────────────────────────────────────────
-- Unverändert gegenüber 0094, bis auf `and owner_team >= 0` in der
-- winner_team-Unterabfrage: ohne den Filter hätte „neutral" mit
-- genug offenen Feldern das Zeitlimit-Ende gewinnen können.
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
              and t.owner_team >= 0
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
  'erklärten Unentschiedens. Seit 0105 zählen neutrale Kacheln (owner_team -1) dabei nicht mit.';
