-- ═══════════════════════════════════════════════════════════════
-- 0153 — „Diese Wörter" heißt: die Wörter DIESER Runde
-- ═══════════════════════════════════════════════════════════════
-- Sönkes Meldung: „Am Ende einer Runde steht ‚Diese Wörter sind der
-- Klasse am häufigsten durchgegangen' — hier stehen seit Tagen die
-- gleichen Worte."
--
-- Das stimmt, und der Grund steht in 0131: wi_hard_words summiert
-- vocab_progress über ALLE Teilnehmer des Raums. vocab_progress ist
-- der Karteikasten, er lebt so lange wie der Raum, und ein Raum lebt
-- 60 Tage. Wer am Montag „Wednesday" dreimal gerissen hat, steht am
-- Freitag immer noch oben — auch wenn das Wort in der Freitagsrunde
-- gar nicht drankam. Nach ein paar Stunden ist die Liste eine
-- Chronik des Raums und keine Auswertung der Runde mehr.
--
-- Nachrechnen lässt sich das NICHT. `wrong` ist eine Summe ohne
-- Zeitachse: ein Wort, das Montag danebenging und Dienstag saß, trägt
-- weiter seine 1, und `updated_at` steht dann auf Dienstag. Ein
-- Filter „seit Rundenbeginn" würde also Fehler von heute verstecken
-- und Fehler von vorgestern als heutige ausgeben. Es braucht eine
-- eigene Zählung.
--
-- Deshalb: eine Strichliste je Runde (wi_round_words), die beim Start
-- geleert wird. Der Karteikasten bleibt unangetastet — er entscheidet,
-- wann ein Wort wiederkommt, und das soll über Runden hinweg gelten.
-- Zwei Zahlen mit zwei Aufgaben, und darum zwei Tabellen (dieselbe
-- Trennung wie wi_solo_record ↔ wi_solo_tally in 0138).
--
-- Gezählt wird nur die ARENA. Zwischen zwei Runden üben die Kinder am
-- Tablet weiter (wi_answer, v_solo) — das ist wertvoll, aber es ist
-- nicht die Runde, die gerade auf dem Beamer ausgewertet wird.
--
-- Nebenbei behoben: `limit 20` stand in 0131 in der inneren Abfrage
-- OHNE order by. Bei mehr als zwanzig gerissenen Wörtern kamen also
-- zwanzig BELIEBIGE heraus, die danach untereinander sortiert wurden —
-- die Überschrift „am häufigsten" war dann schlicht falsch.


-- ─────────────────────────────────────────────────────────────
-- 1) wi_round_words — die Strichliste einer Runde
-- ─────────────────────────────────────────────────────────────
-- Ohne participant_id, und das ist keine Sparsamkeit, sondern
-- dieselbe Entscheidung wie in 0131: die Liste ist da, um die nächste
-- Stunde zu planen, nicht um jemanden zu finden. Wer was gerissen
-- hat, steht am Pult ohnehin nicht.
create table if not exists wi_round_words (
  room_id uuid not null references skill_rooms(id) on delete cascade,
  item_id uuid not null references vocab_items(id) on delete cascade,
  seen    int  not null default 0,
  wrong   int  not null default 0,
  primary key (room_id, item_id)
);

comment on table wi_round_words is
  'Strichliste der LAUFENDEN Arena-Runde: wie oft ein Wort drankam und wie oft es danebenging. '
  'Wird von wi_room_start geleert. Keine Namen — die Liste plant die nächste Stunde.';
comment on column wi_round_words.seen is
  'Vorkommen, nicht Tastendrücke: eine Aufgabe zählt einmal, auch wenn nach dem Tippen noch '
  'eine Auswahl kam.';

alter table wi_round_words enable row level security;
grant select, insert, update, delete on wi_round_words to service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) wi_round_tally — ein Strich
-- ─────────────────────────────────────────────────────────────
-- Eigene Funktion statt drei Zeilen in wi_answer: die Strichliste
-- bekommt später vielleicht eine zweite Quelle (die Arena schenkt
-- Felder, ohne dass jemand tippt), und dann soll es eine Stelle sein,
-- die man ändert.
create or replace function wi_round_tally(p_room uuid, p_item uuid, p_ok boolean)
  returns void
  volatile
  set search_path = public
  language sql
as $$
  insert into wi_round_words (room_id, item_id, seen, wrong)
  values (p_room, p_item, 1, case when p_ok then 0 else 1 end)
  on conflict (room_id, item_id) do update set
    seen  = wi_round_words.seen + 1,
    wrong = wi_round_words.wrong + case when p_ok then 0 else 1 end;
$$;

-- Innere Tür: gerufen wird sie ausschließlich aus wi_answer (security
-- definer). Von außen hat hier niemand etwas zu suchen — sonst könnte
-- ein Gerät die Auswertung seiner Klasse vollschreiben.
revoke all on function wi_round_tally(uuid, uuid, boolean) from public;

comment on function wi_round_tally(uuid, uuid, boolean) is
  'Verbucht eine entschiedene Antwort in der Strichliste der laufenden Runde.';


-- ─────────────────────────────────────────────────────────────
-- 3) wi_hard_words — die Auswertung liest die Strichliste
-- ─────────────────────────────────────────────────────────────
-- `scope` fährt mit, damit das Gerät die beiden Fälle unterscheiden
-- kann: eine Liste über die ganze Runde und eine Liste über den
-- ganzen Raum sehen gleich aus, sagen aber Verschiedenes. Fehlt diese
-- Migration, fehlt der Schlüssel — und das Gerät schreibt einen Satz
-- darunter statt still etwas anderes zu behaupten
-- (feedback_missing_migration_looks_like_network).
create or replace function wi_hard_words(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'scope', 'round', 'words', coalesce((
    select jsonb_agg(jsonb_build_object(
             'term',  t.term,
             'trans', t.translation,
             'wrong', t.wrong,
             'seen',  t.seen)
           order by t.wrong desc, t.term)
      from (
        -- Der Deckel gehört ZUR Sortierung: ohne order by an dieser
        -- Stelle nähme `limit` zwanzig beliebige Zeilen, und die
        -- Überschrift „am häufigsten" wäre geraten (Fehler aus 0131).
        select i.term, i.translation, rw.wrong, rw.seen
          from wi_round_words rw
          join vocab_items i on i.id = rw.item_id
         where rw.room_id = v_room
           and rw.wrong > 0
         order by rw.wrong desc, i.term
         limit 20
      ) t
  ), '[]'::jsonb));
end;
$$;

revoke all on function wi_hard_words(text) from public;
grant execute on function wi_hard_words(text) to authenticated;

comment on function wi_hard_words(text) is
  'Die Wörter, die in der LAUFENDEN Runde am häufigsten danebengingen — seit 0153 aus '
  'wi_round_words statt aus dem Karteikasten des ganzen Raums. Ohne Namen. `scope` sagt dem '
  'Gerät, worüber gezählt wurde.';


-- ─────────────────────────────────────────────────────────────
-- 4) wi_room_start — eine neue Runde ist eine leere Liste
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Grundlage ist 0152 und nicht 0133: dort ist gerade erst die
-- Bedingung `not blocked` an v_people dazugekommen. Wer hier die
-- ältere Fassung abschreibt, nimmt sie wieder weg
-- (feedback_shop_state_merge_regressions).
--
-- Geleert wird beim START und nicht beim Rückweg in die Lobby: die
-- Auswertung steht in Phase 'ended' auf dem Beamer, und sie soll die
-- Runde zeigen, die gerade zu Ende ist.
create or replace function wi_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := wi_owned_room(p_code);
  v_b      wi_boards;
  v_people int;
  v_n      int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from wi_boards where room_id = v_room;

  if not exists (select 1 from wi_room_sets where room_id = v_room) then
    return jsonb_build_object('ok', false, 'error', 'no_sets');
  end if;

  select count(*) into v_people
    from skill_participants
   where room_id = v_room
     and not blocked;                        -- 0152

  -- Alte Aufstellung weg: eine neue Runde ist eine neue Insel und
  -- eine neue Verteilung. Die Wiedervorlage (vocab_progress) bleibt
  -- — was ein Kind kann, kann es auch in der zweiten Runde.
  perform wi_seat_assign(v_room, v_b.team_count);

  -- 0153: die Strichliste dagegen gehört der Runde und nur ihr.
  delete from wi_round_words where room_id = v_room;

  v_n := wi_build_island(v_room, v_b.team_count, v_people, v_b.duration_secs);

  update wi_boards
     set phase = 'countdown',
         countdown_ends_at = now() + interval '5 seconds',
         started_at = null, ends_at = null, ended_at = null, winner_team = null,
         seed = (floor(random() * 1000000))::int,
         presenter_seen_at = now()
   where room_id = v_room;

  return jsonb_build_object('ok', true, 'tiles', v_n);
end;
$$;

revoke all on function wi_room_start(text) from public;
grant execute on function wi_room_start(text) to authenticated;

comment on function wi_room_start(text) is
  'Startet eine Runde: Aufstellung neu, Insel neu, Strichliste leer, Countdown. Seit 0152 '
  'zählen stillgelegte Tablets weder für die Aufstellung noch für die Inselgröße, seit 0153 '
  'beginnt die Wörter-Auswertung bei null.';


-- ─────────────────────────────────────────────────────────────
-- 5) wi_answer — ein Strich je entschiedener Antwort
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0151, Wort für Wort. Neu ist genau eine Zeile, direkt
-- neben vocab_record — an derselben Stelle, an der eine Antwort
-- entschieden ist.
--
-- Zwei Dinge fallen damit von selbst richtig aus:
--   · Die Zwischenstufen ('spell'/'choice' im Tipp-Modus) kommen hier
--     nie an, sie kehren weiter oben um. Ein Wort zählt also EINMAL
--     je Aufgabe, egal wie oft dafür getippt wurde — dieselbe Regel
--     wie in 0138.
--   · `not v_solo` heißt „die Arena läuft". Das Üben zwischen zwei
--     Runden geht in den Karteikasten, aber nicht in die Auswertung
--     der Runde.
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

  -- 0153: und die Strichliste der Runde. Nur in der Arena — das Üben
  -- zwischen zwei Runden ist keine Runde.
  if not v_solo then
    perform wi_round_tally(v_p.room_id, v_pl.current_item, v_ok);
  end if;

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
  -- Normalfall des Übens, kein Verstoß. Siehe Kopf von 0151.
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
  '(wi_answer_lock, Muster aus Kingdoms 0124). Seit 0153 geht jede entschiedene Antwort in '
  'der Arena zusätzlich in die Strichliste der Runde (wi_round_tally).';

revoke all on function wi_answer(text, text) from public;
grant execute on function wi_answer(text, text) to anon, authenticated;
