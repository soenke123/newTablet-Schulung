-- ═══════════════════════════════════════════════════════════════
-- 0142 · Myth of Wordisland — die Tiere bekommen ihren Namen zurück
-- ═══════════════════════════════════════════════════════════════
-- Sönke, 10.09.2026: „Ich würde gerne, dass alle Echsen auf dem Feld
-- ‚personalisiert' sind. Dh ich kann sie anklicken und sehe dann
-- daneben die Vokabel und auch alle States von dieser. […] Des
-- Weiteren würde ich gerne am Rand die Unit-Liste haben […]. Jede
-- Unit hat das i an der Seite. Klickt man da drauf, werden die Echsen
-- dieser Unit gehighlightet und ich sehe die Statistik dieser Unit
-- […] einmal für die ganze Unit und dann für alle Vokabeln dieser
-- Unit. Also ich sehe da eine saubere Vokabelliste."
--
-- Auf der Insel steht ein Tier je Vokabel — aber welches Tier zu
-- welchem Wort gehört, weiß bisher nur der Server. Das Gerät bekommt
-- in `words_list` nur `i` (Wort-Id) und `s` (Stufe): genug, um die
-- Herde aufzustellen, zu wenig, um über eines von ihnen Auskunft zu
-- geben. Und die Unit, zu der ein Wort gehört, steht überhaupt
-- nirgends im Browser.
--
-- Diese Migration liefert die beiden fehlenden Stücke:
--
--   1) words_list bekommt `u` — die Unit des Wortes. Damit kann das
--      Gerät die Tiere einer Unit hervorheben und die Tiere
--      abgewählter Units blass zeichnen, ohne irgendetwas zu holen.
--   2) wi_solo_unit(p_token, p_set) — eine Unit vollständig: Kopf,
--      Gesamtzahlen, Wortliste mit Text und Chronik je Richtung.
--
-- Warum EINE Funktion für beides (Unit-Übersicht und das Kärtchen an
-- der angetippten Echse): das Gerät kennt aus (1) die Unit jedes
-- Wortes. Tippt jemand ein Tier an, holt es dessen Unit — und hat
-- damit auch gleich alle Nachbarn im Haus. Ein zweiter Aufruf „gib
-- mir dieses eine Wort" wäre eine zweite Funktion für dieselbe
-- Auskunft, und beim Durchtippen einer Insel der teurere Weg.
--
-- Die Zahlenform ist ABSICHTLICH dieselbe wie in wi_solo_task_json:
--
--     { "en_de": [clean, helped, seen, wrong], "de_en": [ … ] }
--
-- Das „i" im Übungskasten zeichnet daraus schon eine Tabelle (0138,
-- vier Spalten seit 0139). Dieselbe Form heißt: derselbe Zeichner,
-- und keine zweite Wahrheit darüber, was „mit Hilfe" bedeutet.
--
-- ── Was hier steht ────────────────────────────────────────────
--   1) wi_solo_view — words_list trägt jetzt die Unit mit
--   2) wi_solo_unit — eine Unit vollständig
--
-- Was sich NICHT ändert:
--   · Keine neue Tabelle, keine neue Spalte. Alles, was hier
--     ausgegeben wird, steht seit 0130/0136/0138/0139 in der
--     Datenbank — es kam nur nie am Gerät an.
--   · Punkte (`points`) bleiben drin. Was hier herausgeht, sind
--     VORKOMMEN und nicht das Konto: die drei Kästchen mit dem
--     Punktestand sind am 10.09.2026 aus dem Übungskasten geflogen,
--     weil sie niemand verstand. Sie kommen nicht als Liste zurück.
--   · Der Beutel, die Runde, der Balken (0139–0141).
--
-- Ein Gerät mit älterer Fassung des Werkzeugs bekommt in words_list
-- ein Feld mehr, das es nicht liest. Ein Werkzeug an einer älteren
-- Datenbank bekommt words_list ohne `u` und sagt das auch — es färbt
-- dann nichts blass, statt zu raten.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_solo_view — welches Wort gehört zu welcher Unit
-- ─────────────────────────────────────────────────────────────
-- Rumpf wörtlich aus 0136 (höchste bestehende Fassung; Regel:
-- feedback_shop_state_merge_regressions), erweitert um den Join auf
-- vocab_items und das Feld `u`.
--
-- `i`/`s`/`u` statt `item_id`/`stage`/`set_id` aus demselben Grund
-- wie 2026-09-08: bei 800 Wörtern ist der Name der Spalte die Hälfte
-- der Übertragung.
--
-- Der Join ist ein INNER JOIN und kein LEFT: wi_solo_stages zählt
-- ohnehin über vocab_items, ein Wort ohne Zeile dort gibt es nicht.
create or replace function wi_solo_view(p_token text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l wi_solo_learners;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update wi_solo_learners set last_seen_at = now() where id = v_l.id;

  return (wi_solo_open(p_token)) || jsonb_build_object(
    'ok', true,
    'words_list', coalesce((
      select jsonb_agg(jsonb_build_object('i', s.item_id, 's', s.stage, 'u', i.set_id))
        from wi_solo_stages(v_l.id) s
        join vocab_items i on i.id = s.item_id), '[]'::jsonb),
    'due', (select count(*) from wi_solo_due(v_l.id)));
end;
$$;

revoke all on function wi_solo_view(text) from public;
grant execute on function wi_solo_view(text) to anon, authenticated;

comment on function wi_solo_view(text) is
  'Die ganze Insel in einem Aufruf: Kopf, Units, und je Wort Id, Stufe und Unit. '
  'Seit 0142 trägt words_list das Feld u — daran hängen die Unit-Leiste und das '
  'Kärtchen an der angetippten Echse.';


-- ─────────────────────────────────────────────────────────────
-- 2) wi_solo_unit — eine Unit vollständig
-- ─────────────────────────────────────────────────────────────
-- Der Riegel steht vor der Arbeit: gefragt werden darf nur nach einer
-- Unit, die diesem Kind gehört (wi_solo_sets). Eine fremde Unit ist
-- `not_found` und nicht `not_allowed` — wer sie nicht hat, soll auch
-- nicht erfahren, dass es sie gibt.
--
-- `stage` kommt aus wi_solo_stages und wird NICHT hier nachgerechnet:
-- „Minimum beider Richtungen durch drei" hat genau eine Definition,
-- und die steht seit 0139 dort. Zwei Stellen wären zwei Wahrheiten,
-- sobald jemand an der Formel dreht.
--
-- Wörter ohne jede Chronik kommen mit `st: {}` — das Gerät liest eine
-- fehlende Richtung als vier Nullen, genau wie beim „i" im
-- Übungskasten. Eine ausgeschriebene Null je Richtung wäre bei 800
-- Wörtern nur Luft in der Leitung.
create or replace function wi_solo_unit(p_token text, p_set uuid)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l     wi_solo_learners;
  v_set   jsonb;
  v_words jsonb;
  v_total jsonb;
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not exists (select 1 from wi_solo_sets ss
                  where ss.learner_id = v_l.id and ss.set_id = p_set) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select jsonb_build_object(
           'id', s.id, 'title', s.title, 'level', s.level, 'theme', s.theme,
           'count', (select count(*) from vocab_items i where i.set_id = s.id))
    into v_set
    from vocab_sets s
   where s.id = p_set;

  -- Die Wortliste. Ein Aufruf von wi_solo_stages für die ganze Insel
  -- und nicht einer je Wort: die Funktion gruppiert selbst, und
  -- vierzigmal dasselbe zu fragen kostet vierzigmal.
  with st as (
    select item_id, stage from wi_solo_stages(v_l.id)
  ),
  w as (
    select i.id, i.term, i.translation, i.sort_order,
           coalesce(st.stage, 0) as stage,
           coalesce((
             select jsonb_object_agg(p.dir,
                      jsonb_build_array(p.clean, p.helped, p.seen, p.wrong))
               from wi_solo_progress p
              where p.learner_id = v_l.id and p.item_id = i.id), '{}'::jsonb) as stats
      from vocab_items i
      left join st on st.item_id = i.id
     where i.set_id = p_set
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'i', w.id, 't', w.term, 'x', w.translation,
           's', w.stage, 'st', w.stats)
         order by w.sort_order, w.term), '[]'::jsonb)
    into v_words
    from w;

  -- Die Summe der Unit je Richtung. Gerechnet und nicht aus der
  -- Liste addiert: der Client soll die Gesamtzahl nicht aus dem
  -- zusammenzählen müssen, was er gerade anzeigt — sonst stimmt sie
  -- nicht mehr, sobald irgendwo gefiltert wird.
  select coalesce(jsonb_object_agg(d.dir,
           jsonb_build_array(d.clean, d.helped, d.seen, d.wrong)), '{}'::jsonb)
    into v_total
    from (
      select p.dir,
             sum(p.clean)::int  as clean,
             sum(p.helped)::int as helped,
             sum(p.seen)::int   as seen,
             sum(p.wrong)::int  as wrong
        from wi_solo_progress p
        join vocab_items i on i.id = p.item_id
       where p.learner_id = v_l.id and i.set_id = p_set
       group by p.dir) d;

  return jsonb_build_object(
    'ok', true, 'set', v_set, 'total', v_total, 'words', v_words);
end;
$$;

revoke all on function wi_solo_unit(text, uuid) from public;
grant execute on function wi_solo_unit(text, uuid) to anon, authenticated;

comment on function wi_solo_unit(text, uuid) is
  'Eine Unit der eigenen Insel: Kopf, Gesamtzahlen je Richtung und die Wortliste '
  'mit Text, Stufe und Chronik. Zahlenform wie wi_solo_task_json.stats — '
  '[richtig, mit Hilfe, gesamt, falsch] je Richtung. Bedient die Unit-Übersicht '
  'und das Kärtchen an der angetippten Echse.';
