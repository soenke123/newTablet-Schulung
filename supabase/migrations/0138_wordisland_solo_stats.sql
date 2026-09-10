-- ═════════════════════════════════════════════════════════════
-- 0138 — Was zu einer Vokabel gezählt wird
-- ═════════════════════════════════════════════════════════════
-- Sönkes Vorgabe (10.09.2026): „ich hätte gerne eine Übersicht, wie
-- oft eine Vokabel schon gespielt wurde … zwei Zeilen, vier Spalten,
-- oben en→de, unten de→en; die Spalten richtig, mit Hilfe und
-- insgesamt."
--
-- Zwei davon gibt es seit 0136: `seen` ist „insgesamt", `wrong` ist
-- die Gegenprobe. Was FEHLT, ist die Unterscheidung, die das Ganze
-- erst zu einer Auskunft macht: ein Wort, das beim ersten Tippen
-- sitzt, ist etwas anderes als eines, das erst aus acht Vorschlägen
-- wiedererkannt wird. Beide zählten bisher als „richtig".
--
--   clean   auf Anhieb getippt      (current_stage war 'type')
--   helped  erst mit Auswahl        (Schreibweisen oder acht Wörter)
--   wrong   auch dann nicht         (seit 0136)
--   seen    = clean + helped + wrong
--
-- Die vierte Zahl steht bewusst NICHT in der Tabelle im Gerät: sie
-- ergibt sich, und drei Spalten liest man auf einen Blick.
--
-- ⚠️ Die Unterscheidung ist nur INNERHALB von wi_solo_answer zu
-- treffen — nur dort ist bekannt, ob die Antwort auf die getippte
-- Frage oder auf eine Auswahl kam. Deshalb wird die Funktion hier
-- neu geschrieben; ihr Rumpf ist der aus 0136 plus EINE Zeile.
--
-- Enthalten:
--   1  wi_solo_progress.clean / .helped
--   2  wi_solo_tally      — die beiden Zähler führen
--   3  wi_solo_task_json  — die Zahlen ans Gerät (kein eigener Ruf)
--   4  wi_solo_answer     — ruft den Zähler
-- ═════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die beiden Zähler
-- ─────────────────────────────────────────────────────────────
-- Rückwirkend sind sie null, und das ist richtig so: was vor dieser
-- Migration geübt wurde, lässt sich nicht nachträglich aufteilen.
-- Eine geratene Verteilung wäre schlimmer als eine ehrliche Null —
-- die Tabelle behauptete dann etwas, das nie gemessen wurde.
alter table wi_solo_progress add column if not exists clean  int not null default 0;
alter table wi_solo_progress add column if not exists helped int not null default 0;

comment on column wi_solo_progress.clean is
  'Wie oft dieses Wort in dieser Richtung auf Anhieb getippt wurde.';
comment on column wi_solo_progress.helped is
  'Wie oft es erst über eine Auswahl (Schreibweisen oder acht Wörter) saß.';


-- ─────────────────────────────────────────────────────────────
-- 2) wi_solo_tally — die Zähler führen
-- ─────────────────────────────────────────────────────────────
-- Getrennt von wi_solo_record, und zwar absichtlich: record ist der
-- KARTEIKASTEN (Fach, Wiedervorlage) und entscheidet, wann ein Wort
-- wiederkommt. Der Zähler hier ist eine reine Chronik und entscheidet
-- gar nichts. Zusammengelegt hätte man eine Funktion, die zwei Gründe
-- hat, sich zu ändern.
--
-- Aufgerufen NACH wi_solo_record: die Zeile ist dann sicher da, und
-- ein `update` ohne Treffer wäre stillschweigend keins.
create or replace function wi_solo_tally(
  p_learner uuid,
  p_item    uuid,
  p_dir     text,
  p_ok      boolean,
  p_helped  boolean
)
  returns void
  volatile
  set search_path = public
  language sql
as $$
  update wi_solo_progress
     set clean  = clean  + case when p_ok and not p_helped then 1 else 0 end,
         helped = helped + case when p_ok and     p_helped then 1 else 0 end
   where learner_id = p_learner
     and item_id    = p_item
     and dir        = p_dir;
$$;

comment on function wi_solo_tally(uuid, uuid, text, boolean, boolean) is
  'Chronik einer Vokabel je Richtung. Ändert nichts am Karteikasten.';

revoke all on function wi_solo_tally(uuid, uuid, text, boolean, boolean) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) wi_solo_task_json — die Zahlen fahren mit
-- ─────────────────────────────────────────────────────────────
-- Kein eigener Aufruf für die Übersicht. Sie hängt an genau einem
-- Wort — dem gefragten —, und das Gerät hat es ohnehin gerade in der
-- Hand. Ein zweiter Weg zum Server hieße: Ladekreisel für drei
-- Zahlen, die schon unterwegs waren.
--
-- Form: { "de_en": [clean, helped, seen], "en_de": [...] }. Eine
-- Richtung, die noch nie dran war, FEHLT — das Gerät liest sie als
-- drei Nullen. Ein Array und kein Objekt, weil die Reihenfolge der
-- drei Zahlen die Reihenfolge der drei Spalten IST.
create or replace function wi_solo_task_json(p_l wi_solo_learners)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select case when p_l.current_item is null then 'null'::jsonb
              else jsonb_build_object(
                     'item',    p_l.current_item,
                     'prompt',  vocab_prompt(p_l.current_item, p_l.current_dir),
                     'dir',     p_l.current_dir,
                     'stage',   p_l.current_stage,
                     'level',   (select stage from wi_solo_stages(p_l.id, p_l.current_item)),
                     'options', to_jsonb(p_l.current_options),
                     'stats',   coalesce((
                                  select jsonb_object_agg(
                                           p.dir,
                                           jsonb_build_array(p.clean, p.helped, p.seen))
                                    from wi_solo_progress p
                                   where p.learner_id = p_l.id
                                     and p.item_id    = p_l.current_item),
                                '{}'::jsonb))
         end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4) wi_solo_answer — unverändert bis auf eine Zeile
-- ─────────────────────────────────────────────────────────────
-- Rumpf wörtlich aus 0136 (der höchsten bestehenden Fassung — wer
-- diese Funktion später anfasst, nimmt DIESE hier als Vorlage und
-- nicht 0136). Neu ist allein der Aufruf von wi_solo_tally, und er
-- steht direkt neben wi_solo_record: beide beschreiben dasselbe
-- Ereignis, und wer eines von beiden verschiebt, soll über das
-- andere stolpern.
--
-- `v_stage` ist dabei der Zustand VOR dieser Antwort: 'type' heißt
-- „hat getippt", alles andere heißt „hat eine Auswahl bekommen".
-- Deshalb wird er ganz oben in eine Variable gelesen und nicht
-- unten aus v_l — dort steht dann längst der nächste Zustand.
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
  v_ok     boolean := false;
  v_result text;
  v_sol    text;
  v_item   uuid;
  v_dir    text;
  v_before int;
  v_after  int;
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
  v_stage := v_l.current_stage;
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
  -- Fehler, kein Wachsen, keine Sperre — die Antwort ist offen.
  -- Und ausdrücklich auch kein Zähler: gezählt wird ein Vorkommen
  -- des Wortes und nicht ein Tastendruck.
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

  select stage into v_before from wi_solo_stages(v_l.id, v_item);
  perform wi_solo_record(v_l.id, v_item, v_dir, v_ok);
  perform wi_solo_tally(v_l.id, v_item, v_dir, v_ok, v_stage <> 'type');
  select stage into v_after  from wi_solo_stages(v_l.id, v_item);

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
    'level_before', v_before,
    'level_after',  v_after,
    'locked_for', greatest(0, ceil(extract(epoch from
                    coalesce(v_l.lock_until, now()) - now()))::int),
    'task',       wi_solo_task_json(v_l));
end;
$$;

revoke all on function wi_solo_answer(text, text) from public;
grant execute on function wi_solo_answer(text, text) to anon, authenticated;
