-- ══════════════════════════════════════════════════════════════
-- Migration 0124 — Kingdoms of Mathoria: Raten lohnt sich nicht mehr
-- ══════════════════════════════════════════════════════════════
-- Sönkes Beobachtung aus der Klasse: bei den Auswahlaufgaben war
-- SPAMMEN die beste Strategie. Der Grund steckte in zwei Regeln, die
-- einzeln je gut gemeint waren und zusammen ein Schlupfloch ergaben:
--
--   • Zwei Versuche je Aufgabe (0101) — bei sechs Kacheln trifft
--     blindes Tippen damit 1/6 + 5/6·1/5 = 1/3 der Aufgaben, bei den
--     drei Vergleichskacheln (< = >) sogar 2/3.
--   • Ein Fehlversuch kostete NUR die Serie. Keine Zeit, keine Sperre.
--
-- Ein Tipp kostet einen Roundtrip (~1 s), ein Feld also ~3 s. Wer
-- rechnet, braucht ~20 s. Raten war sechsmal schneller als Können —
-- und Kinder finden so etwas in der ersten Viertelstunde.
--
-- ── Zwei Änderungen, die zusammengehören ───────────────────────
--
-- (D) Auswahlaufgaben haben nur noch EINEN Versuch. Der zweite ergibt
--     dort keinen Sinn: einen Vertipper gibt es beim Tippen, nicht beim
--     Antippen einer von sechs Kacheln — er war in Wahrheit ein zweites
--     Los. Tipp-Aufgaben behalten ihren zweiten Versuch unverändert
--     (Sönkes Entscheidung: „Tipp bleibt definitiv der second try"),
--     denn dort ist ein Zahlendreher echt. Statt des zweiten Loses gibt
--     es sofort die Lösung zu sehen — didaktisch der bessere Tausch.
--
-- (B) Eine Sperre, die mit dem Verhalten wächst. Sie misst nicht
--     „falsch", sondern „falsch OHNE hinzusehen":
--
--       Zähler +1   bei einer falschen Antwort, die weniger als
--                   FAST_MS (2 s) nach Erscheinen der Aufgabe kam
--       Zähler → 0  bei JEDER Antwort, die länger gebraucht hat —
--                   richtig oder falsch. Nachdenken löscht die Sperre.
--       Sperre      = (Zähler − FREE) Sekunden, gedeckelt bei CAP_S
--                     (FREE = 2, CAP_S = 5)
--
--     Die ersten beiden schnellen Fehler sind also frei (Vertipper),
--     der dritte kostet 1 s, der vierte 2 s … bis 5 s. Wer eine Aufgabe
--     liest und sich irrt, sieht die Sperre NIE.
--
-- ⚠️ Eine richtige SCHNELLE Antwort setzt den Zähler NICHT zurück.
--    Das ist kein Versehen: sonst holt sich ein Spammer nach jedem
--    Zufallstreffer seine zwei Freiversuche zurück und landet wieder
--    bei ~10 s pro Feld. Wer bei „< = >" ehrlich in 1 s die richtige
--    Kachel trifft, steht ohnehin bei 0 — der Zähler wächst nur an
--    FEHLERN.
--
-- Was dabei herauskommt (Erwartungswert je erobertem Feld):
--
--                    | vorher | nachher | wer rechnet
--   6 Kacheln        |  ~3 s  |  ~34 s  |    ~20 s
--   3 Kacheln (< = >)|  ~1 s  |  ~17 s  |    ~10 s
--
-- In beiden Fällen ist Rechnen schneller als Raten. Genau das war das
-- Ziel — nicht, das Raten zu bestrafen, sondern es langsamer zu machen
-- als den ehrlichen Weg.
--
-- ── Warum das alles auf dem SERVER steht ───────────────────────
-- Die 2 s werden gegen clash_players.q_shown_at gemessen, nicht gegen
-- eine Uhr im Tablet, und die Sperre steht in clash_players.
-- locked_until. Beides im Client wäre mit einem Reload weg — und ein
-- Riegel, den ein Neuladen öffnet, ist keiner. Der Client bekommt nur
-- die Restzeit (lock_ms) und zeigt seinen Ladekreis.
--
-- Ein Tipp WÄHREND der Sperre zählt ausdrücklich nicht als
-- Fehlversuch: clash_submit weist ihn mit error='locked' ab, bevor
-- irgendein Zustand angefasst wird. Sonst würde die Sperre sich selbst
-- verlängern, und ein ungeduldiges Kind käme nie wieder heraus.
--
-- ── q_shown_at ohne Anfassen der großen Funktionen ─────────────
-- current_q wird an drei Stellen geschrieben: clash_room_start (0118),
-- clash_ensure_player (0121) und clash_submit (hier). Die ersten
-- beiden sind INSERTs — sie bekommen den Zeitstempel durch den
-- Spaltendefault `now()` geschenkt, ohne dass zwei große Funktionen
-- Wort für Wort neu deklariert werden müssen (jede Neudeklaration ist
-- eine Gelegenheit, einen Zwischen-Fix zu verlieren). Nur der UPDATE in
-- clash_submit setzt ihn ausdrücklich.
--
-- Randfall Start: clash_room_start legt die Zeilen in der
-- countdown-Phase an, also ~5 s bevor geantwortet werden darf. Die
-- erste Antwort ist damit immer „langsam" — harmlos, der Zähler steht
-- da ohnehin auf 0.
--
-- ⚠️ Grundlage der neu deklarierten Funktionen ist jeweils die höchste
-- bestehende Fassung (per grep bestätigt): clash_submit → 0123,
-- clash_view → 0123. Beide sind Wort für Wort übernommen; geändert
-- sind nur die unten markierten Stellen (Regel:
-- feedback_shop_state_merge_regressions).
--
-- clash_submit_answer (der Weiterreicher aus 0110) bleibt unangetastet
-- — er ruft clash_submit auf und erbt alles.
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Drei Spalten an clash_players
-- ─────────────────────────────────────────────────────────────
alter table clash_players
  add column if not exists q_shown_at   timestamptz default now();
alter table clash_players
  add column if not exists fast_wrong   int not null default 0;
alter table clash_players
  add column if not exists locked_until timestamptz;

-- Bestehende Zeilen (ein Raum kann gerade laufen): ohne Backfill wäre
-- q_shown_at dort NULL. clash_submit behandelt NULL vorsichtshalber als
-- „langsam" — der Backfill sorgt zusätzlich dafür, dass die laufende
-- Aufgabe ab jetzt eine echte Startzeit hat.
update clash_players set q_shown_at = now() where q_shown_at is null;

comment on column clash_players.q_shown_at is
  'Wann die laufende Aufgabe (current_q) gezogen wurde. Grundlage für die 2-Sekunden-Grenze in '
  'clash_submit (0124): schneller als das + falsch = geraten. Kommt bei INSERTs aus dem '
  'Spaltendefault, bei clash_submit ausdrücklich gesetzt. NULL gilt als „langsam".';
comment on column clash_players.fast_wrong is
  'Wie viele schnelle Fehlversuche in Folge (0124). Wächst nur bei falsch UND schneller als '
  'FAST_MS, wird von JEDER bedachten Antwort auf 0 gesetzt — eine richtige schnelle Antwort '
  'lässt ihn absichtlich stehen (siehe Kopf der Migration).';
comment on column clash_players.locked_until is
  'Bis wann die Eingabe gesperrt ist (0124). Der Client zeigt dazu einen Ladekreis; der Server '
  'weist frühere Antworten mit error=locked ab, ohne sie als Fehlversuch zu werten.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_answer_lock — die drei Zahlen, an einem Ort
-- ─────────────────────────────────────────────────────────────
-- Derselbe Gedanke wie clash_streak_goals (0123): eine Stellschraube,
-- die in einer Klasse nachjustiert werden will, darf nicht an zwei
-- Orten stehen. Nachjustieren heißt hier: `cap_s` hoch, wenn Raten
-- immer noch lohnt; `free` hoch, wenn ehrliche Kinder die Sperre sehen.
create or replace function clash_answer_lock()
  returns jsonb
  language sql
  immutable
as $$
  select jsonb_build_object('fast_ms', 2000, 'free', 2, 'cap_s', 5);
$$;

comment on function clash_answer_lock() is
  'Die drei Zahlen der Antwort-Sperre (0124): fast_ms = ab wann eine Antwort als „ohne Hinsehen" '
  'gilt, free = wie viele schnelle Fehlversuche frei sind (Vertipper), cap_s = längste Sperre in '
  'Sekunden. Einzige Quelle — clash_submit rechnet gegen diese Werte.';

grant execute on function clash_answer_lock() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) clash_submit — ein Versuch bei Auswahl, Sperre bei Raten
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0123, Wort für Wort. Geändert sind fünf Stellen, alle mit
-- „0124" markiert: neue Variablen, die Sperr-Prüfung vor jedem
-- Zustandswechsel, q_shown_at beim Ziehen einer Aufgabe, die
-- Retry-Bedingung (nur noch Tipp-Aufgaben), die Zähler-Fortschreibung
-- und lock_ms im Rückgabeobjekt.
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
  v_fire_res        jsonb;
  v_goals           jsonb := clash_streak_goals();          -- 0123
  v_goal_solo       int;                                    -- 0123
  v_goal_team       int;                                    -- 0123
  v_streak_old      int;
  v_solo_fire       boolean := false;
  v_pending_add     int := 0;
  v_team_streak_old int;
  v_team_streak_new int;
  v_team_streak_out int;
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
  v_goal_solo := greatest((v_goals->>'solo')::int, 1);
  v_goal_team := greatest((v_goals->>'team')::int, 1);
  v_fast_ms   := greatest((v_lock->>'fast_ms')::int, 0);     -- 0124
  v_free      := greatest((v_lock->>'free')::int, 0);        -- 0124
  v_cap_s     := greatest((v_lock->>'cap_s')::int, 0);       -- 0124

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
    -- anschließen ließe.
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

    -- Individuelle Serie: seit 0123 jedes Vielfache von v_goal_solo
    -- (0106: 10, 0108: 12, 0123: 7). Ein ausgeschiedenes Volk kann
    -- nichts aussuchen — bei ihm werden aus den zwei Feldern zwei
    -- Ruinen-Punkte.
    v_streak_old := coalesce(v_player.streak, 0);
    if floor((v_streak_old + 1)::numeric / v_goal_solo) > floor(v_streak_old::numeric / v_goal_solo) then
      v_solo_fire := true;
      if v_ruined then
        v_ruin_add := v_ruin_add + 2;
      else
        v_pending_add := 2;
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

    -- Team-Serie: seit 0123 jedes Vielfache von v_goal_team (war 20).
    if floor(v_team_streak_new::numeric / v_goal_team) > floor(v_team_streak_old::numeric / v_goal_team) then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'team_fire',
        jsonb_build_object('streak', v_team_streak_new));
      if v_ruined then
        v_ruin_add := v_ruin_add + 5;
      else
        -- Seit 0108 fünf Felder statt sieben.
        for i in 1..5 loop
          exit when not exists (
            select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
          );
          v_fire_res := clash_capture_random(v_room.id, v_player.team_index);
          exit when (v_fire_res->'captured') is null and (v_fire_res->'castle_hit') is null;
          if (v_fire_res->'captured') is not null and clash_check_win(v_room.id) then
            exit;
          end if;
        end loop;
      end if;
    end if;

    -- 0108: Ruinen-Punkte. Die Schwelle wird EINMAL geprüft, nicht je
    -- Teilbetrag — sonst zählte eine Antwort, die zugleich eine
    -- Einzel- und eine Team-Serie abschließt, dreimal gegen dieselbe
    -- Zehnerstufe. Die Schleife ist Vorsorge: heute liegt v_ruin_add
    -- bei höchstens 8 (1+2+5), überspringt also nie mehr als eine
    -- Stufe.
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
    -- 0123: mit jeder Antwort mitgeschickt, damit „3/7" und das
    -- „nur noch 2"-Banner auch dann stimmen, wenn der nächste Takt
    -- noch aussteht (der eigene Broadcast schließt den Absender aus).
    'streak_goals', v_goals,
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
  'Versuche je Aufgabe — seit 0124 aber nur noch bei TIPP-Aufgaben; eine Auswahlaufgabe hat einen '
  'Versuch und löst danach auf (der zweite war dort ein zweites Los, kein Vertipper-Ausgleich). '
  'Seit 0123 die Serien-Schwellen aus clash_streak_goals(). Seit 0124 zusätzlich die '
  'Antwort-Sperre gegen blindes Raten: eine falsche Antwort binnen fast_ms nach dem Erscheinen '
  'der Aufgabe erhöht clash_players.fast_wrong, jede bedachte Antwort setzt ihn auf 0, und ab dem '
  'free+1-ten schnellen Fehler bleibt die Eingabe (fast_wrong − free) Sekunden zu, höchstens '
  'cap_s (clash_answer_lock). Ein Tipp während der Sperre wird mit error=locked + wait_ms '
  'abgewiesen und zählt NICHT als Fehlversuch.';

-- ─────────────────────────────────────────────────────────────
-- 4) clash_view — die Restsperre durchreichen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0123, Wort für Wort. Neu ist genau ein Schlüssel:
-- me.lock_ms. Er ist der Grund, warum die Sperre ein Reload übersteht
-- — das frisch geladene Tablet fragt clash_view und bekommt die
-- Restzeit, statt mit offener Tastatur dazustehen.
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
  'seit 0108 Ruinen-Modus, seit 0110 me.question durch clash_q_public, seit 0123 streak_goals. '
  'Seit 0124 me.lock_ms — die Restzeit der Antwort-Sperre, damit ein Reload sie nicht öffnet.';
