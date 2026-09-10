-- ═══════════════════════════════════════════════════════════════
-- 0141 · Myth of Wordisland — der Balken der Runde
-- ═══════════════════════════════════════════════════════════════
-- Sönke, 10.09.2026: „lass doch einen % balken oben hinmachen statt
-- der 30 von 30, die versteht man ja nicht. lieber einen % balken,
-- der dann bei jeder Vokabel etwas hoch geht."
--
-- Der zweite Halbsatz ist der eigentliche Auftrag, und er ist der
-- Grund für diese Migration. „Noch 30 von 30" zählt WÖRTER, und ein
-- Wort verlässt den Beutel erst nach seiner letzten Kopie — bei
-- „gemischt" also nach sechs Antworten. Eine Anzeige, die fünf von
-- sechs Antworten lang stillsteht, sieht kaputt aus, egal ob sie in
-- Zahlen oder als Balken danebensteht. Der Balken muss deshalb
-- KOPIEN zählen, nicht Wörter.
--
-- Kopien lassen sich aber nicht rückwirkend ausrechnen. Wie viele in
-- einer Runde überhaupt drinlagen, weiß nachher niemand mehr: die
-- Stufe eines Wortes ändert sich mitten in der Runde, und mit ihr
-- sein Kontingent (wi_solo_soll). Wer das Soll später neu ausrechnet,
-- bekommt einen Nenner, der wandert — und einen Balken, der bei einem
-- Fehler ZURÜCKGEHT. Also wird die eine Zahl, die sonst verloren
-- geht, mitgeschrieben:
--
--   wi_solo_learners.pass_done   gezogene Kopien in DIESER Runde
--
-- Der Anteil ist dann erledigt / (erledigt + offen). Beide Zahlen
-- stehen fest, wenn sie gebraucht werden, und die Rechnung hat eine
-- Eigenschaft, die sie erst brauchbar macht: sie steigt bei JEDER
-- Antwort, auch bei einer falschen.
--
--   richtig   erledigt +1, offen −1   →  steigt deutlich
--   Auswahl   erledigt +1, offen −1   →  steigt deutlich (seit 0140)
--   falsch    erledigt +1, offen +1   →  steigt ein wenig
--
-- Der Fehler verlängert die Runde, aber er nimmt nichts zurück, was
-- schon getan wurde. Das ist die ehrlichere Auskunft — und die
-- freundlichere: ein Balken, der beim Danebengreifen schrumpft,
-- bestraft zweimal.
--
-- Geändert werden vier Funktionen, jede um wenige Zeilen. Alles
-- andere ist wörtlich die höchste bestehende Fassung (0139 bzw. 0136
-- für die Einstellungen; Regel: feedback_shop_state_merge_regressions).
--
-- Was sich NICHT ändert:
--   · Der Beutel. Kontingente, Ziehen, Rundenwechsel — unberührt.
--   · Punkte, Stufen, Chronik.
--   · `offen`/`gesamt` in wi_solo_pass. Sie bleiben Wörter und
--     bleiben drin: die Zahl auf der Insel muss sich weiter mit
--     ihnen decken, und ein Gerät mit älterer Fassung des Werkzeugs
--     zeigt damit weiter „noch 30 von 30".
--
-- Wer mitten in einer Runde auf diese Migration trifft, startet mit
-- pass_done = 0 und sieht seinen Balken einmal bei 0 % beginnen,
-- obwohl er schon geübt hat. Das heilt mit dem nächsten
-- Rundenwechsel von selbst und ist die einzige Alternative zu einer
-- geratenen Zahl.
-- ═══════════════════════════════════════════════════════════════

alter table wi_solo_learners add column if not exists pass_done int not null default 0;

comment on column wi_solo_learners.pass_done is
  'Gezogene Kopien in der laufenden Runde. Zähler des Fortschrittsbalkens; '
  'Nenner ist pass_done + die noch offenen Kopien. Wird bei jedem Rundenwechsel '
  'und bei jeder Änderung an Units oder Richtung auf 0 gesetzt.';


-- ─────────────────────────────────────────────────────────────
-- 1) Ziehen wird gezählt
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0139, plus die zweite Anweisung. Sie steht hier und
-- nicht im Antwortweg, weil DIESE Funktion die Stelle ist, an der
-- eine Kopie den Beutel verlässt — genau einmal je gewerteter
-- Antwort. Wer später einen zweiten Weg zum Ziehen baut, zählt
-- damit automatisch mit.
create or replace function wi_solo_bag(
  p_learner uuid,
  p_item    uuid,
  p_dir     text,
  p_left    int
)
  returns void
  volatile
  set search_path = public
  language sql
as $$
  update wi_solo_progress
     set pass_no   = (select l.pass_no from wi_solo_learners l where l.id = p_learner),
         pass_left = greatest(0, p_left)
   where learner_id = p_learner and item_id = p_item and dir = p_dir;

  update wi_solo_learners
     set pass_done = pass_done + 1
   where id = p_learner;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2) Der Stand der Runde
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0139, drei Felder mehr:
--
--   kopien    was noch im Beutel liegt (Kopien, nicht Wörter)
--   erledigt  was in dieser Runde schon herausgezogen wurde
--   pct       der Anteil in Prozent, auf eine Stelle genau
--
-- Die eine Stelle hinter dem Komma ist kein Zierrat: eine Runde über
-- eine Unit hat gut 180 Kopien, eine einzelne Antwort ist also ein
-- halbes Prozent. Auf ganze Prozent gerundet stünde der Balken bei
-- jeder zweiten Antwort still — und das ist genau der Fehler, den
-- diese Migration behebt. Das Gerät zeichnet den Balken mit dem
-- Nachkommawert und schreibt die Zahl daneben gerundet hin.
--
-- `pct` ist null, solange gar nichts gewählt ist (Nenner 0). Das
-- Gerät zeigt den Balken dann nicht — 0 % wäre eine Behauptung über
-- eine Runde, die es nicht gibt.
create or replace function wi_solo_pass(p_learner uuid)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  with b as (
    select b.item_id, greatest(0, b.offen) as offen
      from wi_solo_bag_open(p_learner, null) b
  ),
  a as (
    select count(distinct item_id) filter (where offen > 0) as offen_w,
           count(distinct item_id)                          as gesamt_w,
           coalesce(sum(offen), 0)::int                     as kopien
      from b
  )
  select jsonb_build_object(
           'no',       l.pass_no,
           'offen',    a.offen_w,
           'gesamt',   a.gesamt_w,
           'kopien',   a.kopien,
           'erledigt', l.pass_done,
           'pct',      round(100.0 * l.pass_done
                             / nullif(l.pass_done + a.kopien, 0), 1))
    from a, wi_solo_learners l
   where l.id = p_learner;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3) Neue Runde, neuer Balken
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0139. Geändert ist die eine Zeile, die die Runde
-- weiterdreht: der Zähler gehört zur Runde und geht mit ihr auf null.
create or replace function wi_solo_next(p_learner uuid)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_next record;
  v_mode text;
  v_opts text[] := '{}';
begin
  select coalesce(l.settings->>'mode', 'type') into v_mode
    from wi_solo_learners l where l.id = p_learner;

  select * into v_next from wi_solo_pick_next(p_learner);

  -- Beutel leer: neu mischen. Kein einziges UPDATE auf den
  -- Fortschrittszeilen — die Runde steht am Lernenden, und jede
  -- Zeile mit einer älteren Runde gilt automatisch als voll.
  if v_next.item_id is null then
    update wi_solo_learners
       set pass_no = pass_no + 1, pass_done = 0
     where id = p_learner;
    select * into v_next from wi_solo_pick_next(p_learner);
  end if;

  -- Zwei Zuweisungen statt einer im CASE: eine record-Variable in
  -- einem CASE-Zweig, der nicht gewählt wird, wirft trotzdem
  -- „record not assigned yet" (Regel: feedback_plpgsql_record_in_case).
  if v_next.item_id is null then
    update wi_solo_learners
       set current_item = null, current_dir = null,
           current_stage = null, current_options = '{}'
     where id = p_learner;
    return;
  end if;

  if v_mode = 'choice' then
    v_opts := vocab_choices(wi_solo_chosen(p_learner), v_next.item_id, v_next.dir, 8);
  end if;

  update wi_solo_learners
     set current_item    = v_next.item_id,
         current_dir     = v_next.dir,
         current_stage   = case when v_mode = 'choice' then 'choice' else 'type' end,
         current_options = v_opts
   where id = p_learner;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4) Andere Units, anderer Beutel
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0136. Wer die Units oder die Richtung wechselt, übt ab
-- jetzt an einem anderen Beutel — und die Kopien, die er aus dem
-- alten gezogen hat, sagen über den neuen nichts. Ohne diese Zeile
-- stünde der Balken beim Wechsel auf eine frische Unit sofort bei
-- einem Drittel.
--
-- Der MODUS (tippen ↔ auswählen) setzt bewusst nichts zurück: er
-- ändert nur, wie gefragt wird, und nicht, was im Beutel liegt.
create or replace function wi_solo_settings(
  p_token text,
  p_sets  uuid[] default null,
  p_dir   text   default null,
  p_mode  text   default null
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_l    wi_solo_learners;
  v_new  jsonb;
  v_keep uuid[];
begin
  v_l := wi_solo_resolve(p_token);
  if v_l.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_dir is not null and p_dir not in ('de_en', 'en_de', 'mixed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_mode is not null and p_mode not in ('type', 'choice') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_new := v_l.settings;

  if p_sets is not null then
    -- Fremde Units fallen still heraus statt den Aufruf abzulehnen:
    -- eine Unit kann zwischen dem Aufbau des Menüs und dem Tippen
    -- gelöscht worden sein, und dann soll der Rest trotzdem gelten.
    select array_agg(s) into v_keep
      from unnest(p_sets) s
     where s in (select set_id from wi_solo_sets where learner_id = v_l.id);
    v_new := v_new || jsonb_build_object('sets',
               coalesce(to_jsonb(v_keep), '[]'::jsonb));
  end if;
  if p_dir  is not null then v_new := v_new || jsonb_build_object('dir',  p_dir);  end if;
  if p_mode is not null then v_new := v_new || jsonb_build_object('mode', p_mode); end if;

  -- Die laufende Aufgabe fällt weg. Sonst steht nach dem Abwählen
  -- von Unit 3 noch ein Wort aus Unit 3 auf dem Schirm, und die
  -- Antwort darauf zählt.
  update wi_solo_learners
     set settings        = v_new,
         current_item    = null,
         current_dir     = null,
         current_stage   = null,
         current_options = '{}',
         pass_done       = case when p_sets is not null or p_dir is not null
                                then 0 else pass_done end,
         last_seen_at    = now()
   where id = v_l.id;

  return jsonb_build_object('ok', true, 'settings', v_new);
end;
$$;

revoke all on function wi_solo_settings(text, uuid[], text, text) from public;
grant execute on function wi_solo_settings(text, uuid[], text, text) to anon, authenticated;
