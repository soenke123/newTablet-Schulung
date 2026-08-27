-- ══════════════════════════════════════════════════════════════
-- Migration 0125 — Kingdoms of Mathoria: die Team-Serie schützt,
--                   statt zu erobern
-- ══════════════════════════════════════════════════════════════
-- Zwei Beobachtungen aus der Klasse, die zusammengehören:
--
--   (1) Die Einzel-Serie zündete bei 7 (0123, davor 12) — immer noch
--       zu selten, um das Spiel zu prägen. Sie geht auf 4 herunter.
--       An der Belohnung ändert sich nichts: zwei selbst gewählte
--       Felder (im Ruinen-Modus zwei Punkte).
--
--   (2) Die Team-Serie war die schlechtere Kopie der Einzel-Serie:
--       dieselbe Mechanik (Schwelle → Felder), nur mit einer Zahl, die
--       kaum je zustande kam, weil EIN Fehlversuch irgendeines Kindes
--       den geteilten Zähler auf null setzt. Zwölf fehlerfreie
--       Antworten am Stück schafft eine Gruppe von acht praktisch nie —
--       und wenn doch, bekam sie fünf Felder geschenkt, was die Runde
--       an einer Stelle kippte, die niemand kommen sah.
--
--       Sönkes Neufassung: die Team-Serie ist keine Schwelle mehr,
--       sondern ein ZUSTAND. Das Volk mit der längsten laufenden Serie
--       ist „on fire" — und on fire heißt: geschützt.
--
-- ── Was „geschützt" genau bedeutet ─────────────────────────────
-- Erobert wird in diesem Spiel nicht gezielt, sondern zufällig: eine
-- richtige Antwort nimmt IRGENDEIN angrenzendes fremdes Feld
-- (clash_capture_random). Genau diese Auslosung bekommt jetzt eine
-- Rangfolge:
--
--   • Alle nicht geschützten Nachbarfelder sind gleich wahrscheinlich
--     — untereinander ändert sich nichts.
--   • Ein Feld des geschützten Volkes wird nur gezogen, wenn es KEINE
--     andere Möglichkeit gibt (das geschützte Volk ist der einzige
--     Nachbar). „Geringste Priorität", nicht „unverwundbar".
--   • Neutrale Kacheln (owner_team -1, siehe 0105) sind nie geschützt.
--
-- Nicht betroffen ist der manuelle Pick aus der Einzel-Serie
-- (clash_capture_specific): wer sich ein Feld AUSSUCHT, hat es sich
-- verdient und darf sich das gegnerische Bollwerk vornehmen. Ebenso
-- wenig betroffen ist das Schrumpfen im Ruinen-Modus
-- (clash_shrink_board): dort trifft es per Regel das GRÖSSTE lebende
-- Volk, das ist keine Auslosung, sondern ein Ausgleich — und der soll
-- den Marktführer auch dann erreichen, wenn er gerade eine Serie hat.
--
-- ── Wer ist on fire? ───────────────────────────────────────────
-- clash_fire_teams(room): die Völker mit der HÖCHSTEN laufenden
-- Team-Serie, sofern diese mindestens fire_min (3) beträgt.
--
--   • Mindestwert 3, damit nicht beim Anpfiff alle acht Völker mit
--     Serie 0 gleichauf „on fire" sind — das wäre ein Zustand, der
--     nichts unterscheidet. Drei ist zugleich die Zahl, ab der die
--     Abzeichen im Client ohnehin schon glühen (.cm-pstreak--hot).
--   • Gleichstand schützt ALLE Gleichauf-Völker. Kein künstlicher
--     Stichentscheid: die Serie ist verdient, und in der Auslosung
--     löst der Rückfall den Fall „alle geschützt" von selbst auf.
--   • Nur Völker, die noch mindestens eine Kachel haben. Ein
--     ausgeschiedenes Volk rechnet im Ruinen-Modus weiter, seine Serie
--     wächst — es hätte die Flamme sonst dauerhaft gepachtet, ohne
--     dass es etwas zu schützen gäbe.
--
-- ── Der Zustandswechsel als Ereignis ───────────────────────────
-- clash_team_streaks.on_fire hält fest, wer die Flamme gerade hat.
-- Nicht als Wahrheit — die ist clash_fire_teams —, sondern als
-- Gedächtnis: nur so lässt sich der ÜBERGANG erkennen und als
-- 'team_fire' melden („Ihr habt die Flamme!"). Die Meldung ist auf
-- eine je 20 Sekunden und Volk gedrosselt: in einer Klasse wechselt
-- die längste Serie sonst im Sekundentakt, und ein Wimpel, der
-- ununterbrochen wedelt, sagt nichts mehr.
--
-- ⚠️ Grundlage der neu deklarierten Funktionen ist jeweils die höchste
-- bestehende Fassung (per grep bestätigt): clash_submit → 0124,
-- clash_view → 0124, clash_room_get → 0109, clash_capture_random →
-- 0106. Alle werden Wort für Wort übernommen, geändert ist nur, was
-- unten je Abschnitt steht. Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_team_streaks.on_fire — das Gedächtnis für den Übergang
-- ─────────────────────────────────────────────────────────────
alter table clash_team_streaks
  add column if not exists on_fire boolean not null default false;

comment on column clash_team_streaks.on_fire is
  'Hatte dieses Volk beim letzten Abgleich die Flamme (0125)? KEINE Wahrheit — die berechnet '
  'clash_fire_teams jedes Mal neu —, sondern nur das Gedächtnis, an dem clash_refresh_fire den '
  'Übergang „jetzt neu on fire" erkennt und daraus ein team_fire-Ereignis macht.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_streak_goals — vier statt sieben, plus die Flammen-Grenze
-- ─────────────────────────────────────────────────────────────
-- Weiterhin die EINE Quelle für alle Zahlen der Serien-Regeln — der
-- Client zeigt sie im Countdown-Bildschirm an („4 richtige in Folge …"),
-- und zwei Orte für dieselbe Zahl driften (Anlass war 0123).
--
-- `team` ist weg: es gibt keine Team-Schwelle mehr. Ein Client, der
-- den Schlüssel noch liest, bekommt null und behält seinen eigenen
-- Notnagelwert — er zeigt dann ein Ziel an, das nie zündet. Deshalb
-- gehören Migration und tool.js-Fassung zusammen ausgerollt.
--
-- ⚠️ 0123/0124 NIE NACH DIESER MIGRATION ERNEUT EINSPIELEN. Ihre
-- Fassung von clash_submit liest `greatest((v_goals->>'team')::int, 1)`
-- — ohne den Schlüssel wird daraus GREATEST(NULL, 1) = 1, und die
-- Team-Schwelle zündete dann bei JEDER richtigen Antwort fünf Felder.
-- Wer eine ältere Fassung zurückholen muss, holt clash_streak_goals
-- mit zurück.
create or replace function clash_streak_goals()
  returns jsonb
  language sql
  immutable
as $$
  select jsonb_build_object(
    'solo',        4,   -- richtige Antworten in Folge für den Einzel-Bonus
    'solo_reward', 2,   -- … so viele Felder darf man sich dann aussuchen
    'fire_min',    3    -- ab dieser Team-Serie kann ein Volk die Flamme haben
  );
$$;

comment on function clash_streak_goals() is
  'Die Zahlen der Serien-Regeln, an einem Ort (0123, neu gefasst in 0125): solo = eigene Serie '
  'für den Bonus (4), solo_reward = wie viele Felder er bringt (2), fire_min = ab welcher '
  'Team-Serie ein Volk „on fire" und damit geschützt sein kann (3). Eine Team-SCHWELLE gibt es '
  'seit 0125 nicht mehr — die Team-Serie belohnt keinen Sprung, sondern hält einen Zustand.';

grant execute on function clash_streak_goals() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) clash_fire_teams — wer hat die Flamme?
-- ─────────────────────────────────────────────────────────────
-- Reine Berechnung, kein Zustand: aus den laufenden Serien und dem
-- Spielfeld. Deshalb `stable` und ohne Seiteneffekt — sie wird sowohl
-- bei jeder Eroberung als auch in beiden Ansichten gerufen.
create or replace function clash_fire_teams(p_room uuid)
  returns int[]
  security definer
  set search_path = public
  language sql
  stable
as $$
  with lebend as (
    -- Nur Völker mit Land. Ein ausgeschiedenes Volk sammelt im
    -- Ruinen-Modus weiter Serien, hätte also sonst die Flamme auf
    -- Dauer — und schützen ließe sich an ihm nichts.
    select ts.team_index, ts.streak
      from clash_team_streaks ts
     where ts.room_id = p_room
       and ts.team_index >= 0
       and exists (select 1 from clash_tiles t
                    where t.room_id = p_room and t.owner_team = ts.team_index)
  ),
  spitze as (select max(streak) as m from lebend)
  select coalesce(array_agg(l.team_index order by l.team_index), '{}'::int[])
    from lebend l, spitze s
   where s.m >= greatest((clash_streak_goals()->>'fire_min')::int, 1)
     and l.streak = s.m;
$$;

comment on function clash_fire_teams(uuid) is
  'Die geschützten Völker (0125): alle noch lebenden Völker mit der höchsten laufenden '
  'Team-Serie, sofern diese mindestens fire_min beträgt. Leeres Array heißt „niemand ist on '
  'fire" — dann lost clash_capture_random wie vor 0125. Gleichstand schützt alle Gleichauf-Völker.';

grant execute on function clash_fire_teams(uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) clash_refresh_fire — Flagge nachführen, Übergang melden
-- ─────────────────────────────────────────────────────────────
create or replace function clash_refresh_fire(p_room uuid)
  returns int[]
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_fire int[] := clash_fire_teams(p_room);
  v_row  record;
  v_on   boolean;
begin
  for v_row in
    select team_index, streak, on_fire
      from clash_team_streaks
     where room_id = p_room
     order by team_index
  loop
    v_on := v_row.team_index = any(v_fire);
    if v_on is distinct from v_row.on_fire then
      update clash_team_streaks
         set on_fire = v_on
       where room_id = p_room and team_index = v_row.team_index;

      -- Gemeldet wird nur das Anzünden, nicht das Verlöschen: „ihr
      -- seid die Flamme los" wäre eine Nachricht, die niemand
      -- gebrauchen kann — und der Zustand steht ohnehin dauerhaft auf
      -- dem Bildschirm. Die Drossel verhindert das Wimpel-Wedeln bei
      -- einem Kopf-an-Kopf-Rennen zweier Völker.
      if v_on and not exists (
           select 1 from clash_team_events
            where room_id = p_room
              and team_index = v_row.team_index
              and kind = 'team_fire'
              and created_at > now() - interval '20 seconds')
      then
        perform clash_team_event_insert(p_room, v_row.team_index, 'team_fire',
          jsonb_build_object('streak', v_row.streak));
      end if;
    end if;
  end loop;

  return v_fire;
end;
$$;

revoke all on function clash_refresh_fire(uuid) from public;

comment on function clash_refresh_fire(uuid) is
  'Führt clash_team_streaks.on_fire dem aktuellen Stand nach und trägt für jedes NEU geschützte '
  'Volk ein team_fire-Ereignis ein (höchstens eins je 20 s und Volk). Gibt die geschützten Völker '
  'zurück. Interner Helfer aus 0125 — wird nur aus clash_submit gerufen.';


-- ─────────────────────────────────────────────────────────────
-- 5) clash_capture_random — die Auslosung mit Rangfolge
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0106, Wort für Wort. Neu ist ausschließlich die zweite
-- Auslosungs-Runde: die erste lässt die geschützten Völker aus, die
-- zweite läuft nur, wenn die erste leer ausging.
--
-- Warum zwei getrennte Schleifen und nicht eine Sortierung? Die
-- `for update … skip locked`-Auswahl darf nur EINE Zeile anfassen; ein
-- „nimm das beste von allen" müsste die Kandidaten erst sammeln und
-- dann sperren — zwei Abfragen, zwischen denen sich das Feld ändern
-- kann. Zwei Läufe mit demselben Muster sind hier das einfachere und
-- das sicherere.
create or replace function clash_capture_random(p_room uuid, p_team int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_tr   int;
  v_tc   int;
  i      int;
  v_fire int[] := clash_fire_teams(p_room);   -- 0125
begin
  -- Erste Wahl: alles außer den Feldern der geschützten Völker. Die
  -- drei Anläufe sind wie seit 0106 der Umgang mit `skip locked` —
  -- eine gerade gesperrte Zeile ist kein „kein Feld da".
  for i in 1..3 loop
    v_tr := null; v_tc := null;
    select t.r, t.c
      into v_tr, v_tc
      from clash_tiles t
     where t.room_id = p_room
       and t.owner_team <> p_team
       and not (t.owner_team = any(v_fire))     -- 0125
       and exists (
         select 1 from clash_tiles m
          where m.room_id = t.room_id
            and m.owner_team = p_team
            and clash_is_neighbor(m.r, m.c, t.r, t.c)
       )
     order by random()
     limit 1
       for update of t skip locked;
    exit when v_tr is not null;
  end loop;

  -- Zweite Wahl (0125): jetzt zählt auch das geschützte Volk. Das ist
  -- der Fall „keine andere Option" — sonst könnte ein Volk, das nur an
  -- die Flamme grenzt, überhaupt nicht mehr erobern, und die Runde
  -- stünde still. Der Rückfall löst zugleich den Gleichstand auf, bei
  -- dem ALLE Völker geschützt sind.
  if v_tr is null and array_length(v_fire, 1) is not null then
    for i in 1..3 loop
      v_tr := null; v_tc := null;
      select t.r, t.c
        into v_tr, v_tc
        from clash_tiles t
       where t.room_id = p_room
         and t.owner_team <> p_team
         and exists (
           select 1 from clash_tiles m
            where m.room_id = t.room_id
              and m.owner_team = p_team
              and clash_is_neighbor(m.r, m.c, t.r, t.c)
         )
       order by random()
       limit 1
         for update of t skip locked;
      exit when v_tr is not null;
    end loop;
  end if;

  if v_tr is null then
    return jsonb_build_object('captured', null, 'castle_hit', null);
  end if;

  return clash_capture_apply(p_room, p_team, v_tr, v_tc);
end;
$$;

revoke all on function clash_capture_random(uuid, int) from public;

comment on function clash_capture_random(uuid, int) is
  'Lost ein angrenzendes fremdes Feld aus und wendet die Eroberung an (0106). Seit 0125 in zwei '
  'Runden: zuerst ohne die Felder der geschützten Völker (clash_fire_teams), und nur wenn dabei '
  'nichts übrig bleibt, mit ihnen. Alle nicht geschützten Felder sind untereinander gleich '
  'wahrscheinlich — geschützt heißt „zuletzt", nicht „nie".';


-- ─────────────────────────────────────────────────────────────
-- 6) clash_submit — Serie 4, Team-Bonus raus, Flamme rein
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0124, Wort für Wort. Geändert:
--   • v_goal_team fällt weg, dafür v_solo_reward aus clash_streak_goals
--   • der ganze Team-Schwellen-Block (5 Felder / 5 Ruinen-Punkte)
--     entfällt — an seiner Stelle steht clash_refresh_fire
--   • der Rückgabewert trägt fire_teams
create or replace function clash_submit(p_token text, p_answer text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p               skill_participants;
  v_room            skill_rooms;
  v_board           clash_boards;
  v_player          clash_players;
  v_correct         boolean;
  v_retry           boolean := false;   -- erster Fehlversuch: Aufgabe bleibt stehen
  v_advance         boolean := false;   -- neue Aufgabe ziehen?
  v_ruined          boolean := false;   -- Volk hat keine Kachel mehr
  v_tr              int;
  v_tc              int;
  v_tprev           int;
  v_castle          boolean := false;
  v_taken           boolean := false;   -- Besitzer hat gewechselt
  v_hit_hp          int := null;        -- Burg getroffen, aber nicht gefallen
  v_cap_res         jsonb;
  v_goals           jsonb := clash_streak_goals();          -- 0123
  v_goal_solo       int;                                    -- 0123
  v_solo_reward     int;                                    -- 0125
  v_streak_old      int;
  v_solo_fire       boolean := false;
  v_pending_add     int := 0;
  v_team_streak_old int;
  v_team_streak_new int;
  v_team_streak_out int;
  v_fire            int[] := '{}'::int[];                   -- 0125
  v_ruin_add        int := 0;
  v_ruin_old        int;
  v_ruin_new        int := null;
  v_shrunk          jsonb := '[]'::jsonb;
  v_shr             jsonb;
  v_steps           int;
  v_reveal          text := null;       -- 0110: die Lösung der GESCHEITERTEN Aufgabe
  v_new_q           jsonb := null;
  i                 int;
  v_lock            jsonb := clash_answer_lock();            -- 0124
  v_fast_ms         int;                                     -- 0124
  v_free            int;                                     -- 0124
  v_cap_s           int;                                     -- 0124
  v_is_choice       boolean := false;    -- 0124: Auswahlaufgabe ⇒ nur ein Versuch
  v_fast            boolean := false;    -- 0124: Antwort kam ohne Hinsehen
  v_fw              int := 0;            -- 0124: neuer Stand von fast_wrong
  v_lock_s          int := 0;            -- 0124: Sperre für die nächste Eingabe
  v_lock_ms         int := 0;            -- 0124: dasselbe in ms, für den Client
  v_wait_ms         int;                 -- 0124: Restsperre bei einem zu frühen Tipp
begin
  v_goal_solo   := greatest((v_goals->>'solo')::int, 1);
  v_solo_reward := greatest((v_goals->>'solo_reward')::int, 1);   -- 0125
  v_fast_ms     := greatest((v_lock->>'fast_ms')::int, 0);     -- 0124
  v_free        := greatest((v_lock->>'free')::int, 0);        -- 0124
  v_cap_s       := greatest((v_lock->>'cap_s')::int, 0);       -- 0124

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

  -- 0124: Die Sperre. Steht bewusst VOR jedem Zustandswechsel — ein
  -- Tipp während der Sperre ist kein Fehlversuch, sondern gar keine
  -- Antwort. Zählte er, würde ungeduldiges Tippen die Sperre selbst
  -- verlängern, und das Kind käme nie wieder heraus.
  if v_player.locked_until is not null and v_player.locked_until > now() then
    v_wait_ms := ceil(extract(epoch from (v_player.locked_until - now())) * 1000)::int;
    return jsonb_build_object('ok', false, 'error', 'locked', 'wait_ms', greatest(v_wait_ms, 0));
  end if;

  -- Fällige Auto-Picks (0106) zuerst auflösen — sonst könnte diese
  -- Antwort auf einem Kartenbild landen, das der Server selbst gleich
  -- noch ändert. Räumt bei einem inzwischen ausgeschiedenen Volk
  -- zugleich die offenen Picks weg (die Schleife dort bricht ab,
  -- wenn keine eigene Kachel mehr da ist).
  perform clash_expire_pending_picks(v_p.id);
  select * into v_player from clash_players where participant_id = v_p.id;

  -- 0108: KEIN Abbruch. Ein Volk ohne Kachel spielt weiter, seine
  -- Antworten zählen für die Endwertung und lassen das Spielfeld
  -- schrumpfen.
  v_ruined := not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  );

  -- Randfall: keine laufende Frage (sollte durch clash_ensure_player/
  -- clash_room_start nicht vorkommen) — dann erst eine ziehen, ohne
  -- die abgegebene Antwort zu werten.
  if v_player.current_q is null then
    v_new_q := clash_new_question(v_board.pool);
    -- 0124: q_shown_at gehört zu current_q — die beiden dürfen nie
    -- auseinanderlaufen, sonst misst die 2-Sekunden-Grenze die Zeit
    -- einer längst beantworteten Aufgabe.
    update clash_players set current_q = v_new_q, wrong_attempt = false, q_shown_at = now()
     where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'correct', null,
      'question', clash_q_public(v_new_q));
  end if;

  v_correct := clash_answer_matches(v_player.current_q, p_answer);

  -- 0124: Auswahlaufgabe? Geprüft wird `mode`, nicht `input` — an
  -- genau diesem Feld entscheidet auch clash_answer_matches, ob eine
  -- Kachel geliefert worden sein muss. Zwei Entscheidungen über
  -- dieselbe Sache gehören an dasselbe Feld. (Der Generator setzt
  -- input='choice' immer zusammen mit mode='mc', siehe 0119 — aber
  -- `input` beschreibt die Tastatur, `mode` die Aufgabe.)
  v_is_choice := v_player.current_q->>'mode' = 'mc';

  -- 0124: „schnell" heißt: weniger als FAST_MS nach dem Ziehen der
  -- Aufgabe. NULL (Zeile aus der Zeit vor dieser Migration) gilt
  -- ausdrücklich als langsam — im Zweifel für das Kind.
  v_fast := v_player.q_shown_at is not null
            and now() < v_player.q_shown_at + make_interval(secs => v_fast_ms / 1000.0);

  if v_correct then
    v_advance := true;

    -- Erobern kann nur, wer noch ein Gebiet hat, an das sich etwas
    -- anschließen ließe. Welches Feld es trifft, entscheidet seit 0125
    -- die Rangfolge in clash_capture_random: das geschützte Volk
    -- zuletzt.
    if not v_ruined then
      v_cap_res := clash_capture_random(v_room.id, v_player.team_index);
      if (v_cap_res->'captured') is not null then
        v_taken  := true;
        v_tr     := (v_cap_res->'captured'->>'r')::int;
        v_tc     := (v_cap_res->'captured'->>'c')::int;
        v_tprev  := (v_cap_res->'captured'->>'prev_owner')::int;
        v_castle := (v_cap_res->'captured'->>'castle')::boolean;
      elsif (v_cap_res->'castle_hit') is not null then
        v_tr     := (v_cap_res->'castle_hit'->>'r')::int;
        v_tc     := (v_cap_res->'castle_hit'->>'c')::int;
        v_tprev  := (v_cap_res->'castle_hit'->>'owner')::int;
        v_hit_hp := (v_cap_res->'castle_hit'->>'hp')::int;
      end if;
    end if;

    -- Individuelle Serie: jedes Vielfache von v_goal_solo (0106: 10,
    -- 0108: 12, 0123: 7, 0125: 4). Ein ausgeschiedenes Volk kann
    -- nichts aussuchen — bei ihm werden aus den Feldern Ruinen-Punkte.
    v_streak_old := coalesce(v_player.streak, 0);
    if floor((v_streak_old + 1)::numeric / v_goal_solo) > floor(v_streak_old::numeric / v_goal_solo) then
      v_solo_fire := true;
      if v_ruined then
        v_ruin_add := v_ruin_add + v_solo_reward;
      else
        v_pending_add := v_solo_reward;
      end if;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1, wrong_attempt = false,
           pending_picks = pending_picks + v_pending_add,
           pick_deadline = case when v_pending_add > 0 then now() + interval '6 seconds'
                                 else pick_deadline end
     where participant_id = v_p.id;

    -- Gefeiert wird die Serie in beiden Fällen: „on fire" ist eine
    -- Nachricht an die Gruppe, keine Quittung über eroberte Felder.
    if v_solo_fire then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'individual_fire',
        jsonb_build_object('name', skill_seat_name(v_p.name, v_p.seat), 'streak', v_streak_old + 1));
    end if;

    -- Geteilte Team-Serie (0106) — unabhängig von den Einzel-Serien.
    -- Die Zeile sollte durch clash_room_start/den Backfill schon
    -- existieren; Insert ist nur ein Sicherheitsnetz.
    --
    -- 0125: Sie zahlt nichts mehr aus. Ihr einziger Zweck ist der
    -- Vergleich mit den anderen Völkern (clash_fire_teams) — wer vorn
    -- liegt, ist geschützt. Der Block, der hier bis 0124 bei jedem
    -- Vielfachen fünf Felder verschenkte, ist ersatzlos weg.
    select streak, ruin_points into v_team_streak_old, v_ruin_old
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index
      for update;
    if v_team_streak_old is null then
      insert into clash_team_streaks (room_id, team_index, streak)
      values (v_room.id, v_player.team_index, 0)
      on conflict (room_id, team_index) do nothing;
      v_team_streak_old := 0;
      v_ruin_old := 0;
    end if;
    v_team_streak_new := v_team_streak_old + 1;
    update clash_team_streaks set streak = v_team_streak_new
     where room_id = v_room.id and team_index = v_player.team_index;
    v_team_streak_out := v_team_streak_new;

    -- 0108: Ruinen-Punkte. Die Schwelle wird EINMAL geprüft, nicht je
    -- Teilbetrag — sonst zählte eine Antwort, die zugleich eine
    -- Einzel-Serie abschließt, zweimal gegen dieselbe Zehnerstufe. Die
    -- Schleife ist Vorsorge: heute liegt v_ruin_add bei höchstens 3
    -- (1 + solo_reward), überspringt also nie mehr als eine Stufe.
    if v_ruined then
      v_ruin_add := v_ruin_add + 1;
      v_ruin_old := coalesce(v_ruin_old, 0);
      v_ruin_new := v_ruin_old + v_ruin_add;
      update clash_team_streaks set ruin_points = v_ruin_new
       where room_id = v_room.id and team_index = v_player.team_index;

      v_steps := floor(v_ruin_new / 10.0)::int - floor(v_ruin_old / 10.0)::int;
      for i in 1..greatest(v_steps, 0) loop
        v_shr := clash_shrink_board(v_room.id, v_player.team_index);
        v_shrunk := v_shrunk || jsonb_build_array(v_shr);
        exit when not coalesce((v_shr->>'shrunk')::boolean, false);
      end loop;
    end if;

  elsif not coalesce(v_player.wrong_attempt, false) and not v_is_choice then
    -- Erster Fehlversuch zu dieser Aufgabe: nur „nochmal versuchen",
    -- die Aufgabe bleibt stehen. Streak bricht trotzdem sofort — das
    -- war schon vor 0101 so, und die Team-Serie folgt seit 0106
    -- exakt derselben Regel.
    --
    -- 0124: nur noch bei TIPP-Aufgaben. Bei sechs Kacheln war der
    -- zweite Versuch kein Vertipper-Ausgleich, sondern ein zweites Los
    -- — er hat die Blindtrefferquote von 1/6 auf 1/3 verdoppelt und
    -- damit das Raten überhaupt erst lohnend gemacht. Wer eine Zahl
    -- eintippt, kann sich dagegen wirklich vertippen und behält ihn.
    v_retry := true;
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = true
     where participant_id = v_p.id;
    update clash_team_streaks set streak = 0
     where room_id = v_room.id and team_index = v_player.team_index;
    select streak into v_team_streak_out
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index;

  else
    -- Zweiter Fehlversuch in Folge: jetzt wird aufgelöst. current_q ist
    -- noch die gescheiterte Aufgabe — die Lösung merken, BEVOR sie
    -- gleich von der neuen überschrieben wird.
    v_advance := true;
    v_reveal := v_player.current_q->>'answer';
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = false
     where participant_id = v_p.id;
    update clash_team_streaks set streak = 0
     where room_id = v_room.id and team_index = v_player.team_index;
    select streak into v_team_streak_out
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index;
  end if;

  -- 0125: Die Flamme kann bei JEDEM Ausgang wandern — eine richtige
  -- Antwort kann das eigene Volk nach vorn bringen, eine falsche es
  -- die Führung kosten. Deshalb steht der Abgleich hinter allen drei
  -- Zweigen und nicht in einem davon.
  --
  -- Er läuft NACH der Eroberung oben, nicht davor: geschützt ist, wer
  -- die Serie schon hatte, als die Antwort abgegeben wurde. Sonst
  -- schützte eine Antwort das eigene Volk noch im selben Augenblick,
  -- in dem sie ein fremdes trifft.
  v_fire := clash_refresh_fire(v_room.id);

  -- ── 0124: Zähler und Sperre ──────────────────────────────────
  -- In EINEM Block statt verteilt auf die drei Zweige darüber: die
  -- Regel ist eine einzige („falsch ohne Hinsehen"), und drei Kopien
  -- davon würden beim nächsten Nachjustieren auseinanderlaufen.
  if not v_fast then
    -- Eine bedachte Antwort löscht den Zähler — richtig oder falsch.
    -- Das ist der Ausweg, und er heißt: hinsehen.
    v_fw := 0;
  elsif v_correct then
    -- Schnell UND richtig lässt den Zähler stehen (weder + noch −).
    -- Ohne diese Zeile bekäme ein Ratender nach jedem Zufallstreffer
    -- seine Freiversuche zurück, und die Sperre käme nie über 1 s
    -- hinaus. Wer ehrlich schnell ist, steht ohnehin bei 0 — der
    -- Zähler wächst ausschließlich an Fehlern.
    v_fw := coalesce(v_player.fast_wrong, 0);
  else
    v_fw := coalesce(v_player.fast_wrong, 0) + 1;
  end if;

  -- Die ersten v_free schnellen Fehler sind frei, danach eine Sekunde
  -- je weiterem, gedeckelt bei v_cap_s.
  v_lock_s := least(greatest(v_fw - v_free, 0), v_cap_s);
  if v_correct then
    v_lock_s := 0;   -- eine richtige Antwort hält niemanden auf
  end if;
  v_lock_ms := v_lock_s * 1000;

  update clash_players
     set fast_wrong   = v_fw,
         locked_until = case when v_lock_s > 0 then now() + make_interval(secs => v_lock_s)
                             else null end
   where participant_id = v_p.id;

  if v_advance then
    v_new_q := clash_new_question(v_board.pool);
    -- 0124: Die 2-Sekunden-Uhr der neuen Aufgabe läuft erst ab dem
    -- Moment, in dem wieder getippt werden DARF — sonst wäre sie
    -- während einer 5-Sekunden-Sperre längst abgelaufen, und die
    -- nächste Blindantwort danach würde als „bedacht" gelten und den
    -- Zähler zurücksetzen. Genau davon lebte das Spammen.
    --
    -- Der Retry-Zweig (Tipp-Aufgaben) zieht keine neue Aufgabe und
    -- behält deshalb seinen alten Zeitstempel: die Frage stand ja
    -- schon da, ein zweiter Versuch darf nicht wieder als „ohne
    -- Hinsehen" zählen.
    update clash_players
       set current_q  = v_new_q,
           q_shown_at = now() + make_interval(secs => v_lock_s)
     where participant_id = v_p.id;
  end if;

  -- Nur ein echter Besitzerwechsel kann ein Volk ausgelöscht haben.
  -- Das Schrumpfen kann es per Konstruktion nicht (Burgen sind tabu,
  -- und unter fünf Kacheln fällt niemand), deshalb steht hier
  -- weiterhin nur v_taken.
  if v_taken then
    perform clash_check_win(v_room.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'retry', v_retry,
    -- 0124: Wie lange die Eingabe jetzt zu bleibt (0 = offen). Der
    -- Client dreht daraus seinen Ladekreis; er muss die Regel dahinter
    -- nicht kennen, nur die Zahl.
    'lock_ms', v_lock_ms,
    'eliminated', v_ruined,
    'reveal', case when v_reveal is not null
                 then jsonb_build_object('text', v_reveal)
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
    'team_streak', v_team_streak_out,
    -- 0123: mit jeder Antwort mitgeschickt, damit „3/4" auch dann
    -- stimmt, wenn der nächste Takt noch aussteht (der eigene
    -- Broadcast schließt den Absender aus).
    'streak_goals', v_goals,
    -- 0125: aus demselben Grund. Die eigene Antwort kann die Flamme
    -- gerade weitergereicht haben — der Schild am eigenen Kopf muss
    -- das sofort zeigen, nicht erst acht Sekunden später.
    'fire_teams', to_jsonb(v_fire),
    'ruin', case when v_ruin_new is null then null
                 else jsonb_build_object('points', v_ruin_new,
                                         'to_next', 10 - (v_ruin_new % 10)) end,
    'shrunk', v_shrunk,
    'board', clash_shrink_state(v_room.id),
    'pending_picks', (select pending_picks from clash_players where participant_id = v_p.id),
    'pick_deadline', (select pick_deadline from clash_players where participant_id = v_p.id),
    'question', case when v_advance then clash_q_public(v_new_q) else null end
  );
end;
$$;

revoke all on function clash_submit(text, text) from public;
grant execute on function clash_submit(text, text) to anon, authenticated;

comment on function clash_submit(text, text) is
  'Nimmt eine Antwort entgegen, wertet sie und erobert bei Erfolg ein Feld. Seit 0101 zwei '
  'Versuche je Aufgabe — seit 0124 aber nur noch bei TIPP-Aufgaben. Seit 0124 die Antwort-Sperre '
  'gegen blindes Raten (clash_answer_lock). Seit 0125: Einzel-Serie alle 4 richtigen (2 Felder '
  'zum Aussuchen), und die Team-Serie zahlt nichts mehr aus — sie entscheidet nur noch, welches '
  'Volk „on fire" und damit vor der Eroberungs-Auslosung geschützt ist (clash_refresh_fire, '
  'clash_capture_random). fire_teams steht in der Antwort.';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_view — fire_teams durchreichen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0124, Wort für Wort. Neu sind zwei Schlüssel:
-- fire_teams (wer ist geschützt) und fire_streak (die führende Serie,
-- an der das hängt).
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
  v_correct      jsonb;
  v_my_members   jsonb := '[]'::jsonb;
  v_tiles        jsonb;
  v_online_count int;
  v_room_total   int;
  v_team_streak  int := null;
  v_ruin         int := null;
  v_events       jsonb := '[]'::jsonb;
  v_lock_ms      int := 0;                -- 0124: Restsperre in ms
  v_fire         int[] := '{}'::int[];    -- 0125: die geschützten Völker
  v_fire_streak  int := 0;                -- 0125: ihre Serie
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
    perform clash_expire_pending_picks(v_p.id);   -- 0106
    select * into v_player from clash_players where participant_id = v_p.id;
    v_my_team := v_player.team_index;
    if v_board.phase = 'running' then
      v_alive := exists (
        select 1 from clash_tiles where room_id = v_room.id and owner_team = v_my_team
      );
      -- 0108: die Aufgabe hängt NICHT an v_alive. Ein ausgeschiedenes
      -- Volk spielt weiter — ohne Aufgabe stünde sein Spielbildschirm
      -- leer da. Nur wer gar kein Volk hat (kam nach dem Start dazu und
      -- wurde noch nicht gelost), bekommt keine.
      -- 0110: durch clash_q_public — `answer` wäre hier die Lösung
      -- selbst und stünde im Netzwerk-Protokoll jedes Tablets.
      if v_my_team is not null then
        v_question := clash_q_public(v_player.current_q);
        -- 0124: Restsperre. Nur hier, in der laufenden Phase — in
        -- Lobby und Countdown gibt es nichts zu sperren. Das ist der
        -- Weg, auf dem ein neu geladenes Tablet von einer Sperre
        -- erfährt, die es selbst nicht mehr kennt.
        if v_player.locked_until is not null and v_player.locked_until > now() then
          v_lock_ms := greatest(
            ceil(extract(epoch from (v_player.locked_until - now())) * 1000)::int, 0);
        end if;
      end if;
    end if;
  end if;

  -- 0125: Wer ist geschützt? Gilt für die ganze Runde, nicht nur fürs
  -- eigene Volk — die Völker-Reihe auf dem Tablet zeigt die Flamme bei
  -- allen an, damit sichtbar ist, wen man gerade NICHT trifft.
  if v_board.phase = 'running' then
    v_fire := clash_fire_teams(v_room.id);
    if array_length(v_fire, 1) is not null then
      select coalesce(max(streak), 0) into v_fire_streak
        from clash_team_streaks
       where room_id = v_room.id and team_index = any(v_fire);
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

      -- Team-Serie + Ereignisse (0106), Ruinen-Punkte (0108) — nur ab
      -- dem Start, nur fürs eigene Team.
      select streak, ruin_points into v_team_streak, v_ruin
        from clash_team_streaks where room_id = v_room.id and team_index = v_my_team;

      select coalesce(jsonb_agg(
               jsonb_build_object('id', id, 'kind', kind, 'payload', payload) order by id), '[]'::jsonb)
        into v_events
        from clash_team_events
       where room_id = v_room.id and team_index = v_my_team;
    end if;
  end if;

  v_tiles := clash_tiles_json(v_room.id);

  v_correct := clash_team_correct(v_room.id);

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
    'team_correct_counts', v_correct,
    'team_streak', v_team_streak,
    'streak_goals', clash_streak_goals(),   -- 0123
    'fire_teams', to_jsonb(v_fire),         -- 0125
    'fire_streak', v_fire_streak,           -- 0125
    'ruin', jsonb_build_object('points',  coalesce(v_ruin, 0),
                               'to_next', 10 - (coalesce(v_ruin, 0) % 10)),
    'board', clash_shrink_state(v_room.id),
    'my_team_members', v_my_members,
    'my_team_events', v_events,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'me', jsonb_build_object(
      'team',    v_my_team,
      'alive',   v_alive,
      'streak',  coalesce(v_player.streak, 0),
      'question', v_question,
      'seat',    v_p.seat,
      'name',    skill_seat_name(v_p.name, v_p.seat),
      'pending_picks', coalesce(v_player.pending_picks, 0),
      'pick_deadline', v_player.pick_deadline,
      'lock_ms', v_lock_ms   -- 0124
    )
  );
end;
$$;

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;

comment on function clash_view(text) is
  'Teilnehmer-Ansicht von Kingdoms of Mathoria. Seit 0098 my_team_members und me.name, seit 0099 '
  'team_correct_counts, seit 0100 Burg-Leben, seit 0106 team_streak/my_team_events/pending_picks, '
  'seit 0108 Ruinen-Modus, seit 0110 me.question durch clash_q_public, seit 0123 streak_goals, '
  'seit 0124 me.lock_ms. Seit 0125 fire_teams/fire_streak — welche Völker gerade on fire und '
  'damit vor der Eroberungs-Auslosung geschützt sind.';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_room_get — Flamme und Serien für den Beamer
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0109, Wort für Wort. Neu sind zwei Schlüssel: fire_teams
-- (welches Panel leuchtet) und team_streaks (die laufende Serie je
-- Volk — auf dem Beamer sieht die Klasse damit, wie knapp das Rennen
-- um die Flamme gerade ist).
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
  v_ruin   jsonb := '{}'::jsonb;
  v_streaks jsonb := '{}'::jsonb;         -- 0125
  v_fire   int[] := '{}'::int[];          -- 0125
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

  -- 0108: Ruinen-Stand je Volk. Nur Völker, die schon Punkte haben —
  -- ein lebendes Volk sammelt keine, seine Null stünde nur im Weg.
  select coalesce(jsonb_object_agg(team_index,
           jsonb_build_object('points', ruin_points, 'to_next', 10 - (ruin_points % 10))),
         '{}'::jsonb)
    into v_ruin
    from clash_team_streaks
   where room_id = v_room.id and ruin_points > 0;

  -- 0125: laufende Team-Serie je Volk, und wer davon geschützt ist.
  -- Hier ALLE Völker (auch die mit Serie 0), anders als bei den
  -- Ruinen-Punkten: die Zahl steht auf dem Beamer neben jedem Panel,
  -- und eine Lücke sähe dort aus wie ein Fehler, nicht wie eine Null.
  select coalesce(jsonb_object_agg(team_index, streak), '{}'::jsonb)
    into v_streaks
    from clash_team_streaks
   where room_id = v_room.id and team_index >= 0;

  if v_board.phase = 'running' then
    v_fire := clash_fire_teams(v_room.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'pool', v_board.pool,
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
    'team_events', v_events,
    'ruin', v_ruin,
    'team_streaks', v_streaks,              -- 0125
    'fire_teams', to_jsonb(v_fire),         -- 0125
    'streak_goals', clash_streak_goals(),   -- 0125 (für den Countdown-Text)
    'board', clash_shrink_state(v_room.id)
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-/Lehrkraft-Ansicht von Kingdoms of Mathoria. Seit 0096 team_members, seit 0099 '
  'team_correct_counts, seit 0107 team_events, seit 0108 ruin/board, seit 0109 pool. Seit 0125 '
  'team_streaks (laufende Serie je Volk), fire_teams (wer ist geschützt) und streak_goals (die '
  'Zahlen für den Regel-Hinweis im Countdown).';


-- ─────────────────────────────────────────────────────────────
-- 9) Nachlauf: laufende Räume nicht mit einer alten Flagge stehen lassen
-- ─────────────────────────────────────────────────────────────
-- on_fire startet für alle bestehenden Zeilen auf false (Vorgabewert
-- der Spalte). Das ist genau richtig: der erste clash_refresh_fire in
-- einer laufenden Partie zündet dann für das führende Volk ein
-- team_fire-Ereignis — ein Zustand, der ohnehin ab jetzt gilt, wird
-- einmal angesagt. Kein Backfill nötig.
