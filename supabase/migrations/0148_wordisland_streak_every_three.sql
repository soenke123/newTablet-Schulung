-- ══════════════════════════════════════════════════════════════
-- Migration 0148 — Myth of Wordisland: eine Serie sind DREI
-- ══════════════════════════════════════════════════════════════
-- Sönke nach dem ersten Durchgang im Raum (14.09.2026):
--   „Eine Streak ist alle 3 richtige. Also zuerst 3, dann 6 und so
--    weiter. Gerade habe ich bei allem > 3 eine Streak, so soll das
--    nicht."
--
-- ── Was bisher passierte ──────────────────────────────────────
-- 0131 schreibt in wi_answer:
--
--     if v_pl.streak >= 3 then
--       update wi_players set picks = least(picks + 1, 3) ...
--     else
--       v_tile := wi_take_tile(...);
--     end if;
--
-- Das ist eine SCHWELLE und keine Zählung: ab der dritten richtigen
-- Antwort bringt jede weitere eine freie Wahl, bis die Serie reißt.
-- Wer zehnmal am Stück richtig liegt, bekommt acht Wahlen — und
-- damit fällt jede Ruine der Insel, ohne dass die Serie je neu
-- anfangen müsste. Genau das meint „bei allem > 3".
--
-- Ab hier ist die Serie ein TAKT: jede dritte richtige Antwort
-- bringt eine Wahl (3, 6, 9, …), die beiden dazwischen wieder den
-- Zufallsgriff. Eine Zeile, `v_pl.streak % 3 = 0` — und weil an
-- dieser Stelle die Serie gerade um eins gewachsen und mindestens 1
-- ist, kann die Null nicht mitgemeint sein.
--
-- ⚠️ Der Rest der Serien-Regel bleibt, wie er ist: gezählt werden
-- nur SOFORT richtige Antworten im Tipp-Modus, alles andere setzt
-- die Serie (und die offenen Wahlen) auf null. Die Schwelle 3 steht
-- damit weiter an genau dieser einen Stelle im Server; im Gerät ist
-- sie STREAK_GOAL und wird von uitest.js gegen diese Datei geprüft.
--
-- ── Der zweite Fehler in derselben Zeile ──────────────────────
-- `least(picks + 1, 3)` ist seit 0146 zu klein. Dort hat die Arena
-- drei Wahlen auf einmal geschenkt und der Deckel ist auf SECHS
-- gestiegen (wi_players_picks_check, wi_ruin_capture). Wer mit vier
-- offenen Wahlen aus der Arena kommt und dann richtig antwortet,
-- verliert bei `least(4 + 1, 3)` zwei davon — die Belohnung für eine
-- richtige Antwort war ein Abzug. Hier steht jetzt dieselbe Sechs
-- wie überall sonst.
--
-- ── Nur wi_answer, sonst nichts ───────────────────────────────
-- Keine Tabelle, keine Prüfregel, kein neues Feld. Die Funktion
-- steht vollständig da (create or replace, kein DROP — Regel
-- feedback_supabase_no_drop_statements) und ist wörtlich die aus
-- 0131, damit man sie beim Lesen nicht aus zwei Migrationen
-- zusammensetzen muss.
--
-- ⚠️ Fehlt diese Migration, ist das Spiel nicht kaputt, sondern
-- großzügig: das Gerät zeigt dann „4/6", während der Server schon
-- bei 4 eine Wahl gutschreibt. Alt, nicht kaputt
-- (feedback_missing_migration_looks_like_network).
-- ══════════════════════════════════════════════════════════════


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
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  v_b := wi_maybe_advance(v_p.room_id);
  if v_b.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_solo := (v_b.phase <> 'running');

  select * into v_pl from wi_players where participant_id = v_p.id;
  if v_pl.participant_id is null or v_pl.current_item is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_pl.lock_until is not null and v_pl.lock_until > now() then
    return jsonb_build_object('ok', false, 'error', 'too_fast',
                              'locked_for', ceil(extract(epoch from v_pl.lock_until - now()))::int);
  end if;

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
  if v_result in ('spell', 'choice') then
    update wi_players
       set current_stage   = v_result,
           current_options = case when v_result = 'spell'
                                  then vocab_spellings(
                                         (vocab_answers(v_pl.current_item, v_pl.current_dir))[1],
                                         btrim(coalesce(p_input, '')))
                                  else vocab_choices(v_sets, v_pl.current_item, v_pl.current_dir, 8)
                             end
     where participant_id = v_p.id;

    select * into v_pl from wi_players where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'result', v_result,
                              'task', wi_task_json(v_pl),
                              'streak', v_pl.streak, 'picks', v_pl.picks);
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
    -- Serie nur bei sofort richtig; alles andere setzt sie auf null.
    if v_stage = 'type' and v_b.mode = 'type' then
      update wi_players set streak = streak + 1 where participant_id = v_p.id;
    else
      update wi_players set streak = 0, picks = 0 where participant_id = v_p.id;
    end if;

    update wi_players
       set correct_count = correct_count + 1,
           wrong_run = 0, lock_until = null
     where participant_id = v_p.id;
    select * into v_pl from wi_players where participant_id = v_p.id;

    if not v_solo then
      -- JEDE DRITTE richtige in Folge wird nicht gewürfelt, sondern
      -- gezeigt: 3, 6, 9 … bringen eine freie Wahl, die beiden
      -- Antworten dazwischen wieder ein zufälliges Nachbarfeld.
      -- Vorher stand hier `>= 3` — eine Schwelle statt eines Taktes,
      -- und damit brachte ab der dritten JEDE Antwort eine Wahl.
      --
      -- ⚠️ `streak > 0` gehört zwingend dazu: eine Antwort, die erst
      -- über die Auswahl gefunden wurde, SETZT die Serie auf null
      -- (ein paar Zeilen weiter oben) — und 0 % 3 ist ebenfalls 0.
      -- Ohne die Bedingung schenkte ausgerechnet die Antwort mit
      -- Hilfe eine freie Wahl, und die Serie wäre mit Raten zu haben.
      -- Im Prüfstand aufgefallen, nicht im Betrieb.
      --
      -- Der Deckel ist SECHS wie überall seit 0146 (Arena schenkt
      -- drei auf einmal). Mit der alten Drei nahm eine richtige
      -- Antwort einem Kind mit vier offenen Wahlen zwei davon weg.
      if v_pl.streak > 0 and v_pl.streak % 3 = 0 then
        update wi_players set picks = least(picks + 1, 6) where participant_id = v_p.id;
      else
        v_tile := wi_take_tile(v_p.room_id, v_pl.team_index);
      end if;
    end if;
  else
    -- Wachsende Sperre gegen schnelles Durchraten (Muster aus 0124).
    update wi_players
       set wrong_count = wrong_count + 1,
           wrong_run   = wrong_run + 1,
           streak      = 0,
           picks       = 0,
           lock_until  = now() + make_interval(secs => least(2 * (wrong_run + 1), 10))
     where participant_id = v_p.id;
  end if;

  perform wi_next_task(v_p.id, v_p.room_id);
  select * into v_pl from wi_players where participant_id = v_p.id;

  return jsonb_build_object(
    'ok', true,
    'result', v_result,
    'solution', v_sol,
    'tile',   v_tile,
    'streak', v_pl.streak,
    'picks',  v_pl.picks,
    'locked_for', greatest(0, ceil(extract(epoch from
                    coalesce(v_pl.lock_until, now()) - now()))::int),
    'task',   wi_task_json(v_pl));
end;
$$;

comment on function wi_answer(text, text) is
  'Der ganze Antwortweg. Jede DRITTE sofort richtige Antwort in Folge (3, 6, 9 …) bringt '
  'eine freie Feldwahl, alle anderen ein zufälliges Nachbarfeld. Seit 0148.';

revoke all on function wi_answer(text, text) from public;
grant execute on function wi_answer(text, text) to anon, authenticated;

comment on column wi_players.picks is
  'Freie Feldwahl. Wächst mit JEDER DRITTEN sofort richtigen Antwort in Folge (0148) und '
  'fällt mit der Serie auf 0. Die Arena schenkt drei auf einmal — Deckel sechs seit 0146.';
