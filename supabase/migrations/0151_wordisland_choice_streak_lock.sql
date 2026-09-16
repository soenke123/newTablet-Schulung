-- ══════════════════════════════════════════════════════════════
-- Migration 0151 — Myth of Wordisland: Serie im Auswahl-Modus
--                  und die Sperre von Mathoria
-- ══════════════════════════════════════════════════════════════
-- Sönke, 16.09.2026:
--   „Wenn die Lehrkraft ‚nur auswählen' auswählt, gibt es gerade
--    keine Streaks … das soll so nicht. Hier brauchen wir auch eine
--    Streak (alle 5 wählen und alle 20 2 wählen) analog zum Tippen.
--    Wichtig ist, dass wir hier auch den Spamschutz von Mathoria
--    übernehmen … die Sekundenabstände müssen bei Vokabeln vielleicht
--    runtergesetzt werden."
--
-- Zwei Dinge, die zusammengehören: die Serie ist die BELOHNUNG des
-- Auswahl-Modus, und sie ist zugleich der Grund, warum er einen
-- Riegel gegen blindes Tippen braucht. Ohne Riegel wäre die Serie
-- eine Einladung; ohne Serie wäre der Modus ein Spiel ohne Lauf.
--
-- ══ 1) Warum es im Auswahl-Modus keine Serie gab ═══════════════
-- In wi_answer steht seit 0131 diese Bedingung:
--
--     if v_stage = 'type' and v_b.mode = 'type' then streak + 1
--     else                                          streak = 0
--
-- Sie meint „nur SOFORT richtig zählt" — eine Antwort, die erst über
-- die acht Vorschläge gefunden wurde, ist keine Serie. Richtig
-- gedacht, aber falsch geschrieben: im Auswahl-Modus IST die Auswahl
-- die Aufgabe. Dort steht `mode = 'choice'`, die Bedingung ist nie
-- wahr, und die Serie stand für die ganze Runde auf null. Das
-- Abzeichen war unsichtbar, eine freie Feldwahl gab es nie.
--
-- Jetzt zählt die Serie in BEIDEN Modi die erste und einzige
-- Antwort auf eine Aufgabe:
--
--     tippen:    getippt und auf Anhieb richtig   (v_stage = 'type')
--     auswählen: die erste angetippte Kachel stimmt
--
-- Im Auswahl-Modus gibt es keine zweite Stufe — wer danebengreift,
-- bekommt das nächste Wort. „Erste Antwort richtig" ist dort also
-- dasselbe wie „richtig", und genau darum darf die Zeile so
-- kurz sein.
--
-- ══ 2) Der Takt ist im Auswahl-Modus länger ════════════════════
-- Fünf statt drei, zwanzig statt zwölf — Sönkes Zahlen, und sie
-- haben einen Grund: eine Auswahl aus acht Wörtern trifft man auch
-- mit halbem Wissen, ein getipptes Wort nicht. Derselbe Takt hieße,
-- dass der bequemere Modus schneller Felder verteilt.
--
-- Die vier Zahlen stehen ab hier an EINEM Ort (wi_streak_goals),
-- nicht in einer Fallunterscheidung mitten in wi_answer. Das ist das
-- Muster von clash_streak_goals (Kingdoms, 0123) und es hat dort
-- denselben Zweck: die Zahlen wollen in einer Klasse nachjustiert
-- werden, und das Gerät zeigt sie an („4/6"). Zwei Orte driften.
-- wi_view und wi_answer geben sie deshalb mit aus.
--
-- ══ 3) Der Spamschutz von Mathoria ═════════════════════════════
-- Bisher hatte Wordisland eine Sperre, die an der Zahl der Fehler
-- hing: 2 s, 4 s, 6 s … bis 10 s, gelöscht von jeder richtigen
-- Antwort. Die ist ab hier weg, und das ist der zweite große
-- Eingriff dieser Migration.
--
-- Sie misst nämlich die falsche Sache. Ein falsch beantwortetes
-- Vokabelwort ist der NORMALFALL — das Wort ist noch nicht gelernt,
-- dafür übt man ja. Wer eine Unit zum ersten Mal sieht, liegt in der
-- Hälfte der Fälle daneben und saß dann zehn Sekunden vor einem
-- gesperrten Feld. (In Kingdoms ist eine falsche Antwort etwas
-- anderes: dort war die Rechnung zu machen und ist misslungen.)
--
-- Mathoria misst seit 0124 nicht „falsch", sondern „falsch OHNE
-- hinzusehen", und genau das übernehmen wir:
--
--   fast_wrong +1   bei einer entschiedenen falschen Antwort, die
--                   weniger als fast_ms nach dem Erscheinen der
--                   Aufgabe kam
--   fast_wrong → 0  bei JEDER bedachten Antwort — richtig oder
--                   falsch. Hinsehen ist der Ausweg.
--   Sperre       = (fast_wrong − free) Sekunden, gedeckelt bei cap_s
--
-- ⚠️ Eine SCHNELLE RICHTIGE Antwort setzt den Zähler nicht zurück
--    (sie lässt ihn stehen). Sonst holt sich ein Ratender nach jedem
--    Zufallstreffer seine Freiversuche zurück. Wer ehrlich schnell
--    ist, steht ohnehin bei 0 — der Zähler wächst nur an Fehlern.
--
-- ── Die drei Zahlen für Vokabeln ──────────────────────────────
--   fast_ms = 1200   (Mathoria: 2000)
--   free    = 2      (wie Mathoria — die zwei Vertipper)
--   cap_s   = 5      (Wordisland bisher: 10)
--
-- fast_ms geht RUNTER, weil eine Vokabel keine Rechnung ist: das
-- Wort ist da oder es ist nicht da. Wer es kann, tippt die Kachel in
-- gut einer Sekunde — bei 2000 ms wäre der schnelle, ehrliche
-- Treffer schon „ohne Hinsehen", und ein einzelner Ausrutscher
-- startete den Zähler. 1200 ms liegt unter jedem Lesen von acht
-- Vorschlägen und über jedem Reflex.
--
-- cap_s geht ebenfalls runter (10 → 5): die Sperre soll den
-- Ratenden ausbremsen, nicht ein Kind aus der Runde nehmen. Fünf
-- Sekunden sind in einer 10-Minuten-Arena schon eine Ewigkeit.
--
-- Was dabei herauskommt, im Auswahl-Modus mit acht Kacheln:
--
--                        | vorher | nachher | wer die Unit kann
--   ein erobertes Feld   | ~50 s  |  ~20 s  |  ~4 s
--   ein ehrlicher Fehler |   2 s  |    0 s  |    —
--
-- Raten bleibt fünfmal langsamer als Können, und die Serie (und
-- damit die freie Feldwahl) ist mit Raten überhaupt nicht zu haben:
-- fünf Zufallstreffer in Folge sind einer von 32768.
--
-- ── Wo die Uhr steht ──────────────────────────────────────────
-- wi_players.q_shown_at ist der Zeitpunkt, an dem die AKTUELLE
-- Eingabe erschienen ist — nicht der, an dem das Wort gezogen wurde.
-- Der Unterschied zählt im Tipp-Modus: wer tippt, danebenliegt und
-- die acht Vorschläge bekommt, sieht eine neue Eingabe, und ihre Uhr
-- beginnt neu. Ohne das wäre im Tipp-Modus jede Antwort „bedacht"
-- (das Tippen hat ja gedauert) und die Sperre führe nie.
--
-- Gesetzt wird q_shown_at deshalb an genau drei Stellen:
--   • wi_next_task            — ein neues Wort steht da
--   • wi_answer, Zwischenstufe — dieselbe Aufgabe, neue Eingabe
--   • wi_answer, nach der Sperre — die Uhr der nächsten Aufgabe läuft
--     erst ab dem Moment, in dem wieder getippt werden DARF. Sonst
--     wäre sie während einer 5-Sekunden-Sperre längst abgelaufen und
--     die nächste Blindantwort zählte als bedacht. Genau davon lebt
--     das Spammen (Mathoria 0124, dieselbe Falle).
--
-- Beides steht am SERVER und nicht im Gerät: ein Riegel, den ein
-- Neuladen öffnet, ist keiner. Der Client bekommt nur `locked_for`
-- und zeigt seinen Hinweis — wi_view reicht es seit 0146 durch, und
-- die Fehlermeldung `too_fast` kennt er schon.
--
-- ══ Was NICHT dazugehört ═══════════════════════════════════════
-- wi_solo_answer (die eigene Insel) behält seine Sperre unverändert.
-- Dort spielt niemand gegen jemanden; wer dort spammt, verliert nur
-- seine eigenen Echsen-Stufen. Die Zahl ist ein Schutz gegen das
-- Durchklicken, kein Wettkampfriegel — und eine Änderung an
-- wi_solo_answer ist eine Änderung am Karteikasten.
--
-- wi_players.wrong_run bleibt stehen und wird weiter gezählt; er
-- trägt nur die Sperre nicht mehr. Die Spalte ist die Chronik der
-- Fehler in Folge, und der Kommentar sagt das ab hier auch.
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements). Grundlage
-- der neu deklarierten Funktionen ist jeweils die HÖCHSTE bestehende
-- Fassung (Regel: feedback_shop_state_merge_regressions):
--   wi_answer        → 0149
--   wi_next_task     → 0131
--   wi_view          → 0146
--   wi_room_to_lobby → 0134
--
-- ⚠️ Fehlt diese Migration, ist nichts kaputt: das Gerät zeigt „x/3"
-- (sein Rückfallwert), im Auswahl-Modus bleibt die Serie bei null und
-- die alte Fehler-Sperre greift weiter
-- (feedback_missing_migration_looks_like_network).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Zwei Spalten an wi_players
-- ─────────────────────────────────────────────────────────────
alter table wi_players
  add column if not exists q_shown_at timestamptz default now();
alter table wi_players
  add column if not exists fast_wrong int not null default 0;

-- Eine Runde kann gerade laufen. Ohne Backfill stünde q_shown_at dort
-- auf NULL; wi_answer behandelt NULL ausdrücklich als „langsam"
-- (im Zweifel für das Kind), der Backfill gibt der laufenden Aufgabe
-- zusätzlich eine echte Startzeit.
update wi_players set q_shown_at = now() where q_shown_at is null;

comment on column wi_players.q_shown_at is
  'Wann die laufende EINGABE erschienen ist — das gezogene Wort, oder im Tipp-Modus die acht '
  'Vorschläge danach. Grundlage der fast_ms-Grenze in wi_answer (0151): schneller als das und '
  'falsch = geraten. NULL gilt als „langsam".';
comment on column wi_players.fast_wrong is
  'Wie viele schnelle Fehlversuche in Folge (0151, Muster aus Kingdoms 0124). Wächst nur bei '
  'falsch UND schneller als fast_ms, wird von JEDER bedachten Antwort auf 0 gesetzt — eine '
  'schnelle richtige Antwort lässt ihn absichtlich stehen.';
comment on column wi_players.wrong_run is
  'Fehler in Folge. Seit 0151 nur noch Chronik — die Antwortsperre hängt an fast_wrong.';


-- ─────────────────────────────────────────────────────────────
-- 2) wi_streak_goals — der Takt, an einem Ort
-- ─────────────────────────────────────────────────────────────
-- `step` = jede wievielte sofort richtige Antwort eine freie Wahl
-- bringt, `big` = jede wievielte deren zwei. `big` MUSS ein
-- Vielfaches von `step` sein, sonst fiele der große Schlag auf eine
-- Antwort, die gar keine Wahl bringt (12 = 4 × 3, 20 = 4 × 5 — in
-- beiden Modi jede VIERTE Serie, das ist die eigentliche Regel).
create or replace function wi_streak_goals(p_mode text)
  returns jsonb
  immutable
  set search_path = public
  language sql
as $$
  select case when p_mode = 'choice'
              then jsonb_build_object('step', 5, 'big', 20)
              else jsonb_build_object('step', 3, 'big', 12)
         end;
$$;

comment on function wi_streak_goals(text) is
  'Der Serien-Takt je Modus (0151): tippen 3/12, auswählen 5/20 — step = jede wievielte sofort '
  'richtige Antwort eine freie Feldwahl bringt, big = jede wievielte deren zwei. Einzige Quelle; '
  'wi_answer rechnet dagegen, wi_view und wi_answer geben sie ans Gerät weiter.';

revoke all on function wi_streak_goals(text) from public;
grant execute on function wi_streak_goals(text) to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) wi_answer_lock — die drei Zahlen der Sperre
-- ─────────────────────────────────────────────────────────────
-- Zwilling von clash_answer_lock (0124), mit den Vokabel-Zahlen.
-- Nachjustieren heißt hier: `cap_s` hoch, wenn Raten immer noch
-- lohnt; `free` hoch, wenn ehrliche Kinder die Sperre sehen;
-- `fast_ms` hoch, wenn selbst blindes Tippen darunter durchrutscht.
create or replace function wi_answer_lock()
  returns jsonb
  immutable
  set search_path = public
  language sql
as $$
  select jsonb_build_object('fast_ms', 1200, 'free', 2, 'cap_s', 5);
$$;

comment on function wi_answer_lock() is
  'Die drei Zahlen der Antwort-Sperre (0151): fast_ms = ab wann eine Antwort als „ohne Hinsehen" '
  'gilt (1200 ms — eine Vokabel ist keine Rechnung), free = wie viele schnelle Fehlversuche frei '
  'sind, cap_s = längste Sperre in Sekunden. Einzige Quelle — wi_answer rechnet dagegen.';

revoke all on function wi_answer_lock() from public;
grant execute on function wi_answer_lock() to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) wi_next_task — die Uhr der neuen Aufgabe
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0131, Wort für Wort. Neu ist eine Zeile im UPDATE.
-- Der frühe Ausgang („keine Units", „keine Wörter mehr") setzt
-- q_shown_at bewusst NICHT: dort steht gar keine Aufgabe, also gibt
-- es auch nichts zu messen.
create or replace function wi_next_task(p_participant uuid, p_room uuid)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_sets  uuid[];
  v_dir   text;
  v_mode  text;
  v_next  record;
  v_opts  text[] := '{}';
begin
  select array_agg(set_id) into v_sets from wi_room_sets where room_id = p_room;
  if v_sets is null then
    update wi_players set current_item = null where participant_id = p_participant;
    return;
  end if;

  select direction, mode into v_dir, v_mode from wi_boards where room_id = p_room;

  select * into v_next from vocab_pick_next(p_participant, v_sets, coalesce(v_dir, 'mixed'));
  if v_next.item_id is null then
    update wi_players set current_item = null where participant_id = p_participant;
    return;
  end if;

  -- Im reinen Auswahl-Modus steht die Auswahl schon in der Aufgabe;
  -- getippt wird gar nicht erst.
  if v_mode = 'choice' then
    v_opts := vocab_choices(v_sets, v_next.item_id, v_next.dir, 8);
  end if;

  update wi_players
     set current_item    = v_next.item_id,
         current_dir     = v_next.dir,
         current_stage   = case when v_mode = 'choice' then 'choice' else 'type' end,
         current_options = v_opts,
         q_shown_at      = now()          -- 0151
   where participant_id = p_participant;
end;
$$;

comment on function wi_next_task(uuid, uuid) is
  'Zieht das nächste Wort und stellt die Aufgabe. Setzt seit 0151 auch q_shown_at — die Uhr, '
  'gegen die die Sperre „zu schnell und falsch" misst.';


-- ─────────────────────────────────────────────────────────────
-- 5) wi_answer — Serie in beiden Modi, Sperre nach Tempo
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0149, Wort für Wort. Geändert sind sechs mit „0151"
-- markierte Stellen: die drei Zahlen-Blöcke am Anfang, das Messen
-- des Tempos, q_shown_at in der Zwischenstufe, die Serien-Bedingung,
-- der Takt aus wi_streak_goals, der Sperr-Block anstelle der alten
-- Fehler-Sperre und q_shown_at nach der Sperre.
create or replace function wi_answer(p_token text, p_input text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_b      wi_boards;
  v_pl     wi_players;
  v_sets   uuid[];
  v_grade  text;
  v_stage  text;
  v_ok     boolean := false;
  v_result text;
  v_tile   jsonb := null;
  v_solo   boolean;
  v_sol    text;
  v_goals  jsonb;                   -- 0151: Takt dieses Modus
  v_step   int;                     -- 0151
  v_big    int;                     -- 0151
  v_lock   jsonb := wi_answer_lock();  -- 0151
  v_fast_ms int;                    -- 0151
  v_free   int;                     -- 0151
  v_cap_s  int;                     -- 0151
  v_fast   boolean := false;        -- 0151: Antwort kam ohne Hinsehen
  v_fw     int := 0;                -- 0151: neuer Stand von fast_wrong
  v_lock_s int := 0;                -- 0151: Sperre für die nächste Eingabe
  v_first  boolean;                 -- 0151: erste Antwort auf diese Aufgabe?
begin
  v_fast_ms := greatest((v_lock->>'fast_ms')::int, 0);   -- 0151
  v_free    := greatest((v_lock->>'free')::int, 0);      -- 0151
  v_cap_s   := greatest((v_lock->>'cap_s')::int, 0);     -- 0151

  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  v_b := wi_maybe_advance(v_p.room_id);
  if v_b.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_solo := (v_b.phase <> 'running');

  -- 0151: Der Takt hängt am Modus und steht in genau einer Funktion.
  v_goals := wi_streak_goals(v_b.mode);
  v_step  := greatest((v_goals->>'step')::int, 1);
  v_big   := greatest((v_goals->>'big')::int, 1);

  select * into v_pl from wi_players where participant_id = v_p.id;
  if v_pl.participant_id is null or v_pl.current_item is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_pl.lock_until is not null and v_pl.lock_until > now() then
    return jsonb_build_object('ok', false, 'error', 'too_fast',
                              'locked_for', ceil(extract(epoch from v_pl.lock_until - now()))::int);
  end if;

  -- 0151: Wie lange stand die Eingabe da? Gemessen VOR jedem
  -- Zustandswechsel, denn gleich wird v_pl neu gelesen. NULL (Zeile
  -- aus der Zeit vor dieser Migration) gilt als langsam.
  v_fast := v_pl.q_shown_at is not null
            and now() < v_pl.q_shown_at + make_interval(secs => v_fast_ms / 1000.0);

  select array_agg(set_id) into v_sets from wi_room_sets where room_id = v_p.room_id;
  v_stage := v_pl.current_stage;
  v_grade := vocab_grade(v_pl.current_item, v_pl.current_dir, p_input);

  -- In einer Auswahl gibt es kein „fast": was nicht die Lösung ist,
  -- ist daneben. Ohne diese Zeile würde ein Schreibweisen-Ablenker
  -- (der der Lösung naturgemäß ähnelt) eine zweite Auswahl
  -- auslösen, und das Kind käme nie heraus.
  if v_stage <> 'type' then
    v_ok := (v_grade = 'exact');
    v_result := case when v_ok then 'correct' else 'wrong' end;
  elsif v_grade = 'exact' then
    v_ok := true;
    v_result := 'correct';
  elsif v_grade = 'near' then
    v_result := 'spell';
  else
    v_result := 'choice';
  end if;

  -- Zwischenstufe: dieselbe Vokabel, jetzt mit Auswahl. Kein
  -- Fehler, kein Feld, keine Sperre — die Antwort ist noch offen.
  --
  -- 0151: Aber eine NEUE Eingabe, also eine neue Uhr. Ohne diese
  -- Zeile hätte die Blindauswahl danach immer das Tippen davor als
  -- Bedenkzeit angerechnet bekommen, und die Sperre führe im
  -- Tipp-Modus nie.
  if v_result in ('spell', 'choice') then
    update wi_players
       set current_stage   = v_result,
           current_options = case when v_result = 'spell'
                                  then vocab_spellings(
                                         (vocab_answers(v_pl.current_item, v_pl.current_dir))[1],
                                         btrim(coalesce(p_input, '')))
                                  else vocab_choices(v_sets, v_pl.current_item, v_pl.current_dir, 8)
                             end,
           q_shown_at      = now()                        -- 0151
     where participant_id = v_p.id;

    select * into v_pl from wi_players where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'result', v_result,
                              'task', wi_task_json(v_pl),
                              'streak', v_pl.streak, 'picks', v_pl.picks,
                              'streak_goals', v_goals);       -- 0151
  end if;

  -- Entschieden. Die Lösung wird JETZT gelesen — nach wi_next_task
  -- steht in current_item das nächste Wort, und der Client bekäme
  -- die Auflösung einer Frage, die er noch gar nicht gesehen hat.
  if not v_ok then
    v_sol := (vocab_answers(v_pl.current_item, v_pl.current_dir))[1];
  end if;

  -- Erst der Karteikasten, dann die Karte.
  perform vocab_record(v_p.id, v_pl.current_item, v_pl.current_dir, v_ok);

  if v_ok then
    -- 0151: Die Serie zählt in BEIDEN Modi die erste und einzige
    -- Antwort auf eine Aufgabe.
    --   tippen     — getippt und auf Anhieb richtig (v_stage = 'type').
    --                Wer erst über Schreibweisen oder Vorschläge
    --                hingefunden hat, fängt wieder bei null an.
    --   auswählen  — die erste angetippte Kachel stimmt. Eine zweite
    --                Stufe gibt es dort nicht: wer danebengreift,
    --                bekommt das nächste Wort. „Erste Antwort
    --                richtig" ist dort also dasselbe wie „richtig".
    -- Bis 0149 stand hier nur der erste Fall, und im Auswahl-Modus
    -- blieb die Serie damit für die ganze Runde auf null.
    v_first := (v_b.mode = 'choice') or (v_b.mode = 'type' and v_stage = 'type');
    if v_first then
      update wi_players set streak = streak + 1 where participant_id = v_p.id;
    else
      update wi_players set streak = 0, picks = 0 where participant_id = v_p.id;
    end if;

    update wi_players
       set correct_count = correct_count + 1,
           wrong_run = 0
     where participant_id = v_p.id;
    select * into v_pl from wi_players where participant_id = v_p.id;

    if not v_solo then
      -- Jede v_step-te richtige in Folge wird nicht gewürfelt,
      -- sondern gezeigt: sie bringt eine freie Wahl, die Antworten
      -- dazwischen wieder ein zufälliges Nachbarfeld (0148). Und
      -- jede VIERTE dieser Serien zählt doppelt (0149) — das ist
      -- v_big. Beide Zahlen kommen seit 0151 aus wi_streak_goals
      -- und hängen am Modus: tippen 3/12, auswählen 5/20.
      --
      -- ⚠️ `streak > 0` gehört zwingend dazu: eine Antwort, die erst
      -- über die Auswahl gefunden wurde, SETZT die Serie auf null
      -- (ein paar Zeilen weiter oben) — und 0 % irgendwas ist
      -- ebenfalls 0. Ohne die Bedingung schenkte ausgerechnet die
      -- Antwort mit Hilfe eine freie Wahl, und die Serie wäre mit
      -- Raten zu haben. Im Prüfstand aufgefallen, nicht im Betrieb.
      --
      -- Der Deckel ist SECHS wie überall seit 0146 (Arena schenkt
      -- drei auf einmal) und gilt auch für den doppelten Schritt.
      if v_pl.streak > 0 and v_pl.streak % v_step = 0 then
        update wi_players
           set picks = least(picks + case when v_pl.streak % v_big = 0 then 2 else 1 end, 6)
         where participant_id = v_p.id;
      else
        v_tile := wi_take_tile(v_p.room_id, v_pl.team_index);
      end if;
    end if;
  else
    update wi_players
       set wrong_count = wrong_count + 1,
           wrong_run   = wrong_run + 1,
           streak      = 0,
           picks       = 0
     where participant_id = v_p.id;
  end if;

  -- ── 0151: Zähler und Sperre ──────────────────────────────────
  -- In EINEM Block statt verteilt auf die Zweige darüber: die Regel
  -- ist eine einzige („falsch ohne Hinsehen"), und zwei Kopien davon
  -- liefen beim nächsten Nachjustieren auseinander.
  --
  -- Bis 0149 hing die Sperre an wrong_run und wuchs mit JEDEM
  -- Fehler (2 s, 4 s … 10 s). Bei Vokabeln misst das die falsche
  -- Sache: ein unbekanntes Wort falsch zu beantworten ist der
  -- Normalfall des Übens, kein Verstoß. Siehe Kopf der Migration.
  if not v_fast then
    -- Eine bedachte Antwort löscht den Zähler — richtig oder falsch.
    -- Das ist der Ausweg, und er heißt: hinsehen.
    v_fw := 0;
  elsif v_ok then
    -- Schnell UND richtig lässt den Zähler stehen (weder + noch −):
    -- sonst bekäme ein Ratender nach jedem Zufallstreffer seine
    -- Freiversuche zurück. Wer ehrlich schnell ist, steht ohnehin
    -- bei 0 — der Zähler wächst ausschließlich an Fehlern.
    v_fw := coalesce(v_pl.fast_wrong, 0);
  else
    v_fw := coalesce(v_pl.fast_wrong, 0) + 1;
  end if;

  v_lock_s := least(greatest(v_fw - v_free, 0), v_cap_s);
  if v_ok then
    v_lock_s := 0;   -- eine richtige Antwort hält niemanden auf
  end if;

  update wi_players
     set fast_wrong = v_fw,
         lock_until = case when v_lock_s > 0 then now() + make_interval(secs => v_lock_s)
                           else null end
   where participant_id = v_p.id;

  perform wi_next_task(v_p.id, v_p.room_id);

  -- 0151: Die Uhr der NEUEN Aufgabe läuft erst ab dem Moment, in dem
  -- wieder geantwortet werden darf. Ohne diese Zeile wäre sie während
  -- einer 5-Sekunden-Sperre längst abgelaufen, die nächste
  -- Blindantwort danach zählte als „bedacht" und setzte den Zähler
  -- zurück. Genau davon lebt das Spammen (Mathoria 0124).
  if v_lock_s > 0 then
    update wi_players
       set q_shown_at = now() + make_interval(secs => v_lock_s)
     where participant_id = v_p.id;
  end if;

  select * into v_pl from wi_players where participant_id = v_p.id;

  return jsonb_build_object(
    'ok', true,
    'result', v_result,
    'solution', v_sol,
    'tile',   v_tile,
    'streak', v_pl.streak,
    'picks',  v_pl.picks,
    'streak_goals', v_goals,                                  -- 0151
    'locked_for', greatest(0, ceil(extract(epoch from
                    coalesce(v_pl.lock_until, now()) - now()))::int),
    'task',   wi_task_json(v_pl));
end;
$$;

comment on function wi_answer(text, text) is
  'Der ganze Antwortweg. Die Serie zählt seit 0151 in BEIDEN Modi die erste Antwort auf eine '
  'Aufgabe; jede step-te richtige in Folge bringt eine freie Feldwahl, jede big-te deren zwei '
  '(wi_streak_goals: tippen 3/12, auswählen 5/20), alle anderen ein zufälliges Nachbarfeld. '
  'Die Antwortsperre misst seit 0151 nicht mehr „falsch", sondern „falsch ohne hinzusehen" '
  '(wi_answer_lock, Muster aus Kingdoms 0124).';

revoke all on function wi_answer(text, text) from public;
grant execute on function wi_answer(text, text) to anon, authenticated;

comment on column wi_players.picks is
  'Freie Feldwahl. Wächst mit jeder step-ten sofort richtigen Antwort in Folge um eins, mit jeder '
  'big-ten um zwei (wi_streak_goals, 0151), und fällt mit der Serie auf 0. Die Arena schenkt drei '
  'auf einmal — Deckel sechs seit 0146.';


-- ─────────────────────────────────────────────────────────────
-- 6) wi_view — den Takt ans Gerät durchreichen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0146, Wort für Wort. Neu ist genau ein Schlüssel:
-- `streak_goals`. Er ist der Grund, warum das Abzeichen im
-- Auswahl-Modus „4/5" schreiben kann, ohne die Zahl abzuschreiben —
-- und warum ein Nachjustieren in wi_streak_goals im Gerät ankommt,
-- ohne dass jemand eine zweite Datei anfasst.
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
   where w.room_id = v_room.id and w.team_index = v_pl.team_index;

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
  'streak_goals — der Serien-Takt des eingestellten Modus, damit das Abzeichen im Gerät '
  'nicht raten muss.';


-- ─────────────────────────────────────────────────────────────
-- 7) wi_room_to_lobby — fast_wrong gehört zur Runde
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0134, Wort für Wort. Neu ist eine Zeile: der Zähler der
-- schnellen Fehlversuche ist Rundenzustand wie Serie und Sperre. Ohne
-- sie startete ein Kind die nächste Runde mit vier gesammelten
-- Blindversuchen und säße nach dem ersten Vertipper in einer
-- 2-Sekunden-Sperre, die aus der vorigen Runde stammt.
create or replace function wi_room_to_lobby(p_code text)
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

  -- Eine laufende Runde wird nicht „zurückgeklappt". Dafür gibt es
  -- wi_room_end, und den Weg soll die Lehrkraft bewusst gehen — sonst
  -- verschwindet eine Arena, in der dreißig Kinder gerade tippen,
  -- hinter einem Fehlgriff.
  if v_b.phase in ('countdown', 'running') then
    return jsonb_build_object('ok', false, 'error', 'round_running');
  end if;

  update wi_boards
     set phase             = 'lobby',
         countdown_ends_at = null,
         ends_at           = null,
         started_at        = null,
         ended_at          = null,
         winner_team       = null,
         presenter_seen_at = now()
   where room_id = v_room;

  delete from wi_tiles where room_id = v_room;

  update wi_players
     set current_item    = null,
         current_options = '{}',
         current_dir     = null,
         current_stage   = 'type',
         streak          = 0,
         picks           = 0,
         wrong_run       = 0,
         fast_wrong      = 0,          -- 0151
         lock_until      = null
   where room_id = v_room;

  return jsonb_build_object('ok', true, 'phase', 'lobby');
end;
$$;

revoke all on function wi_room_to_lobby(text) from public;
grant execute on function wi_room_to_lobby(text) to authenticated;

comment on function wi_room_to_lobby(text) is
  'Bringt einen Raum aus der Auswertung zurück in die Lobby: Insel weg, Aufstellung bleibt, '
  'Einstellungen wieder änderbar. Eine laufende Runde lehnt sie ab (round_running). Räumt seit '
  '0151 auch fast_wrong weg — der Zähler gehört zur Runde.';
