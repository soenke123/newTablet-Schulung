-- ═══════════════════════════════════════════════════════════════
-- 0140 · Myth of Wordisland — der Beutel im Auswahl-Modus
-- ═══════════════════════════════════════════════════════════════
-- Ein Fehler aus 0139, gefunden beim Einbauen des Rundenzählers am
-- 10.09.2026: im Auswahl-Modus leerte sich der Beutel NIE. Der
-- Rundenzähler stand deshalb auf ewig auf „noch 30 von 30" — und
-- weil er da stand, sah es aus, als zählte er gar nicht.
--
-- Die Rechnung, die dahinter steckt (alle drei Zeilen aus 0139):
--
--   richtig, auf Anhieb   verbraucht 1 Kopie, legt 0 zurück   → −1
--   richtig, mit Hilfe    verbraucht 1 Kopie, legt 1 zurück   →  0
--   falsch                verbraucht 1 Kopie, legt 2 zurück   → +1
--
-- Und im Auswahl-Modus ist JEDE richtige Antwort eine „mit Hilfe" —
-- das ist keine Härte, sondern die Wahrheit über diesen Modus (0139).
-- Nur: damit ist dort die mittlere Zeile die einzige, die es gibt,
-- und ihre Bilanz ist null. Nachgerechnet in pglite: 120 richtige
-- Antworten, 30 Wörter, 90 Kopien — vorher wie nachher.
--
-- Die Rückgabe hat einen guten Grund, aber einen anderen: wer sich
-- vertippt und das Wort dann unter acht wiedererkennt, soll es
-- wiedersehen. Das ist eine AUSNAHME im Tippen. Im Auswahl-Modus ist
-- die Hilfe der Modus selbst, und sie ist dort schon bezahlt — mit
-- einem Punkt statt drei. Zweimal denselben Rabatt zu verlangen
-- macht aus der Runde eine Endlosschleife.
--
-- Geändert wird deshalb genau EINE Zeile in wi_solo_answer. Alles
-- andere ist wörtlich 0139 (die höchste bestehende Fassung — wer
-- diese Funktion später anfasst, nimmt DIESE hier als Vorlage;
-- Regel: feedback_shop_state_merge_regressions).
--
-- Was sich NICHT ändert:
--   · Punkte. +3 / +1 / −3 / −1 bleiben, wie sie sind.
--   · Der Tipp-Modus. Dort wirft „mit Hilfe" weiter eine Kopie
--     zurück, und das soll so sein.
--   · Der Fehler im Auswahl-Modus. Er verbraucht 1 und legt 1
--     zurück — er verlängert die Runde nicht, er verkürzt sie nur
--     nicht.
-- ═══════════════════════════════════════════════════════════════

create or replace function wi_solo_answer(p_token text, p_input text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l      wi_solo_learners;
  v_sets   uuid[];
  v_grade  text;
  v_stage  text;
  v_mode   text;
  v_helped boolean;
  v_ok     boolean := false;
  v_result text;
  v_sol    text;
  v_item   uuid;
  v_dir    text;
  v_gdir   text;
  v_before int;
  v_after  int;
  v_delta  int;
  v_gegen  int := 0;
  v_extra  int;
  v_offen  int;
  v_pts    int;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_l.current_item is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_l.lock_until is not null and v_l.lock_until > now() then
    return jsonb_build_object('ok', false, 'error', 'too_fast',
                              'locked_for', ceil(extract(epoch from v_l.lock_until - now()))::int);
  end if;

  v_item  := v_l.current_item;
  v_dir   := v_l.current_dir;
  v_gdir  := case when v_l.current_dir = 'de_en' then 'en_de' else 'de_en' end;
  v_stage := v_l.current_stage;
  v_mode  := coalesce(v_l.settings->>'mode', 'type');
  v_sets  := wi_solo_chosen(v_l.id);
  v_grade := vocab_grade(v_item, v_dir, p_input);

  -- In einer Auswahl gibt es kein „fast": was nicht die Lösung ist,
  -- ist daneben. Sonst löste ein Schreibweisen-Ablenker eine zweite
  -- Auswahl aus, und das Kind käme nie heraus. (Wie 0131.)
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
  -- Fehler, kein Wachsen, keine Sperre, kein Zähler und auch kein
  -- Griff in den Beutel — die Antwort ist offen, und gezählt wird
  -- ein Vorkommen des Wortes und nicht ein Tastendruck.
  if v_result in ('spell', 'choice') then
    update wi_solo_learners
       set current_stage   = v_result,
           current_options = case when v_result = 'spell'
                                  then vocab_spellings(
                                         (vocab_answers(v_item, v_dir))[1],
                                         btrim(coalesce(p_input, '')))
                                  else vocab_choices(v_sets, v_item, v_dir, 8)
                             end,
           last_seen_at    = now()
     where id = v_l.id;

    select * into v_l from wi_solo_learners where id = v_l.id;
    return jsonb_build_object('ok', true, 'result', v_result,
                              'task', wi_solo_task_json(v_l));
  end if;

  -- Entschieden. Die Lösung wird JETZT gelesen — nach wi_solo_next
  -- steht in current_item das nächste Wort, und das Gerät bekäme
  -- die Auflösung einer Frage, die es noch nicht gesehen hat.
  if not v_ok then
    v_sol := (vocab_answers(v_item, v_dir))[1];
  end if;

  -- „Mit Hilfe" ist jede richtige Antwort, die nicht auf die
  -- getippte Frage kam — der Vertipper mit Schreibweisen-Auswahl
  -- ebenso wie das Wiedererkennen unter acht. Im Auswahl-Modus ist
  -- also JEDE richtige Antwort eine mit Hilfe, und das ist keine
  -- Härte, sondern die Wahrheit über diesen Modus.
  v_helped := (v_stage <> 'type');

  if v_ok then
    v_delta := case when v_helped then 1 else 3 end;
    -- ⚠️ DIE EINE ZEILE, DIE 0140 ausmacht.
    -- Eine Kopie zurück in den Beutel bekommt nur, wer die Hilfe im
    -- TIPP-Modus gebraucht hat — dort ist sie die Ausnahme und heißt
    -- „das siehst du wieder". Im Auswahl-Modus ist die Hilfe der
    -- Modus, sie ist mit einem Punkt statt drei bereits bezahlt, und
    -- eine zweite Rechnung dafür hielte die Runde für immer offen.
    v_extra := case when v_helped and v_mode <> 'choice' then 1 else 0 end;
  else
    v_delta := case when v_mode = 'choice' then -1 else -3 end;
    v_gegen := v_delta;
    v_extra := case when v_mode = 'choice' then  1 else  2 end;
  end if;

  -- Was vor dieser Antwort im Beutel lag. Muss VOR wi_solo_points
  -- gelesen werden: gleich steht dort ein neuer Termin, und mit ihm
  -- ein anderes Kontingent.
  select b.offen into v_offen
    from wi_solo_bag_open(v_l.id, v_item) b
   where b.dir = v_dir;

  select stage into v_before from wi_solo_stages(v_l.id, v_item);

  perform wi_solo_points(v_l.id, v_item, v_dir, v_delta, true);
  if v_gegen <> 0 then
    -- Der Fehler kostet das Tier eine ganze Stufe, nicht nur die
    -- gefragte Richtung. Ohne diese Zeile sähe ein Kind, das in
    -- seiner starken Richtung danebengreift, überhaupt nichts
    -- passieren — und die Stufe ist das Minimum, nicht der Schnitt.
    perform wi_solo_points(v_l.id, v_item, v_gdir, v_gegen, false);
  end if;
  perform wi_solo_tally(v_l.id, v_item, v_dir, v_ok, v_helped);
  perform wi_solo_bag(v_l.id, v_item, v_dir,
                      greatest(0, coalesce(v_offen, 1) - 1) + v_extra);

  select stage  into v_after from wi_solo_stages(v_l.id, v_item);
  select points into v_pts   from wi_solo_progress
   where learner_id = v_l.id and item_id = v_item and dir = v_dir;

  if v_ok then
    update wi_solo_learners
       set correct_count = correct_count + 1,
           wrong_run     = 0,
           lock_until    = null
     where id = v_l.id;
  else
    -- Wachsende Sperre gegen schnelles Durchraten (Muster aus 0124).
    update wi_solo_learners
       set wrong_count = wrong_count + 1,
           wrong_run   = wrong_run + 1,
           lock_until  = now() + make_interval(secs => least(2 * (wrong_run + 1), 10))
     where id = v_l.id;
  end if;

  perform wi_solo_next(v_l.id);
  select * into v_l from wi_solo_learners where id = v_l.id;

  return jsonb_build_object(
    'ok', true,
    'result',     v_result,
    'solution',   v_sol,
    'item',       v_item,
    'dir',        v_dir,
    'helped',     v_helped,
    'delta',      v_delta,
    'points',     coalesce(v_pts, 0),
    'level_before', v_before,
    'level_after',  v_after,
    'locked_for', greatest(0, ceil(extract(epoch from
                    coalesce(v_l.lock_until, now()) - now()))::int),
    'task',       wi_solo_task_json(v_l));
end;
$$;

revoke all on function wi_solo_answer(text, text) from public;
grant execute on function wi_solo_answer(text, text) to anon, authenticated;
