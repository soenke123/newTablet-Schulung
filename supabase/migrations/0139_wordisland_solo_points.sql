-- ══════════════════════════════════════════════════════════════
-- Migration 0139 — Wordisland Solo: Punkte, Rückschritt, Beutel
-- ══════════════════════════════════════════════════════════════
-- Drei Entscheidungen von Sönke (10.09.2026), die zusammengehören,
-- weil jede für sich die anderen kaputt machen würde.
--
-- ── 1) Eine Währung statt zweier Wahrheiten ───────────────────
-- Bis hierher war das Fach (`box` 0..4) zugleich die Stufe des
-- Tiers, und „mit Hilfe" zählte wie „gekonnt": wer aus acht
-- Vorschlägen das richtige Wort anklickte, ließ sein Tier wachsen.
-- Genau das soll aufhören — aber nicht dadurch, dass Hilfe GAR
-- nichts zählt: dann wäre der Modus „nur auswählen" ein Spiel ohne
-- Fortschritt, und für ein Kind, das noch nicht tippen mag, ist er
-- der einzige Weg hinein.
--
-- Also zählt Hilfe ein Drittel. Aus dem Fach wird ein Punktekonto
-- je Richtung, 0..12:
--
--     auf Anhieb getippt   +3
--     mit Hilfe            +1
--     falsch               −3   (im Auswahl-Modus nur −1)
--
--     Stufe einer Richtung = Punkte / 3
--     Stufe des Tiers      = die schwächere der beiden Richtungen
--
-- Drei Antworten mit Hilfe sind damit eine gekonnte. Die Regel
-- „beide Richtungen" aus 0136 bleibt unangetastet, sie rechnet nur
-- in einer feineren Einheit.
--
-- ── 2) Ein Fehler kostet eine Stufe — in BEIDEN Richtungen ────
-- „−3 auf die gefragte Richtung" täte es nicht: die Stufe ist das
-- Minimum, und wer in der starken Richtung danebengreift, sähe an
-- seinem Tier nichts passieren. Der Abzug trifft deshalb beide
-- Konten. −3 in beiden heißt: das Tier fällt um genau eine Stufe,
-- und man muss sie in beiden Richtungen neu holen.
--
-- Abgezogen wird PUNKTGENAU und nicht auf die Stufengrenze
-- abgerundet: wer bei 7 steht (Stufe 2 plus ein mühsames Drittel),
-- landet bei 4 und nicht bei 3. Der Unterschied ist klein und fällt
-- immer auf die freundliche Seite.
--
-- Im Auswahl-Modus sind Gewinn und Verlust gleich groß (+1/−1). Er
-- ist der sanfte Modus; Raten lohnt dort nicht, kostet aber auch
-- nicht die Arbeit von Wochen.
--
-- ── 3) Der Beutel ─────────────────────────────────────────────
-- Bis hierher entschied der Karteikasten, OB ein Wort drankommt:
-- erst was fällig ist, dann was neu ist, dann der Rest. Das ist für
-- „jeden Tag zehn Minuten" gebaut. Sönke will aber auch „ich setz
-- mich hin und gehe die Unit durch" — und dabei sollen die sicheren
-- Wörter mitlaufen, die wackligen nur öfter.
--
-- Deshalb entscheidet der Karteikasten jetzt nicht mehr OB, sondern
-- WIE OFT. Eine RUNDE ist ein Beutel, in dem jedes Wort-Richtungs-
-- Paar der gewählten Units mindestens einmal liegt:
--
--     Ei / noch nie dran            3 Kopien
--     geschlüpft, gewachsen         2 Kopien
--     ausgewachsen, funkelnd        1 Kopie
--     Termin überschritten         +1 Kopie
--
-- Gezogen wird zufällig aus dem, was noch im Beutel liegt. Ist er
-- leer, wird neu gemischt — alle Wörter einmal durch, dann von
-- vorn. Wer stolpert, wirft sein Wort zurück in den Beutel (mit
-- Hilfe +1, falsch +2, im Auswahl-Modus +1): es kommt in dieser
-- Sitzung wieder, aber nicht sofort.
--
-- Die Termine (10 min / 1 / 3 / 7 / 21 Tage) bleiben und tun weiter
-- das, wofür sie gebaut sind — sie steuern über die „+1 überfällig"-
-- Zeile, was am nächsten Tag Vorfahrt hat. Innerhalb einer Sitzung
-- ist es ein Durchgang, zwischen zwei Tagen ein Karteikasten.
--
-- Der Rundenstand wird LAZY geführt: eine Fortschrittszeile merkt
-- sich, in welcher Runde sie zuletzt bedient wurde. Steht dort eine
-- ältere Runde, gilt das volle Kontingent. So kostet das Mischen
-- kein einziges UPDATE — bei 800 Wörtern ist das der Unterschied
-- zwischen „unmerklich" und „das Tablet hängt kurz".
--
-- ── Was hier steht ────────────────────────────────────────────
--   1  points / pass_no / pass_left      die neuen Spalten
--   2  wi_solo_wieder · wi_solo_stages   Stufe aus Punkten
--   3  wi_solo_points · _tally · _record buchen
--   4  wi_solo_dirs · _soll · _bag_open · _bag · _pass   der Beutel
--   5  wi_solo_pick_next · wi_solo_next  ziehen
--   6  wi_solo_task_json                 was das Gerät sieht
--   7  wi_solo_answer                    der ganze Antwortweg
--
-- Kein DROP — Idempotenz per `if not exists`, `or replace` und
-- DO-Block (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die neuen Spalten
-- ─────────────────────────────────────────────────────────────
-- `box` bleibt stehen und wird weiter mitgeschrieben, aber sie ist
-- ab hier ein SPIEGEL (points / 3) und nicht mehr die Wahrheit. Wer
-- sie liest, liest nichts Falsches; wer sie schreibt, schreibt ins
-- Leere. Gelöscht wird sie nicht — eine Spalte wegzunehmen ist in
-- Supabase ein destruktiver Eingriff, und ihr Nutzen als
-- Rückfallebene überwiegt.
alter table wi_solo_progress add column if not exists points    int not null default 0;
alter table wi_solo_progress add column if not exists pass_no   int not null default 0;
alter table wi_solo_progress add column if not exists pass_left int not null default 0;
alter table wi_solo_learners add column if not exists pass_no   int not null default 1;

comment on column wi_solo_progress.points is
  'Punktekonto dieser Richtung, 0..12. richtig +3, mit Hilfe +1, falsch −3 (Auswahl-Modus −1). '
  'Stufe = points / 3. Die EINE Wahrheit — box ist nur noch ihr Spiegel.';
comment on column wi_solo_progress.box is
  'Spiegel von points/3. Wird mitgeschrieben, aber nirgends mehr gelesen (seit 0139).';
comment on column wi_solo_progress.pass_no is
  'In welcher Runde diese Zeile zuletzt bedient wurde. Ältere Runde = volles Kontingent, '
  'ohne dass beim Mischen eine Zeile angefasst werden müsste.';
comment on column wi_solo_progress.pass_left is
  'Wie viele Kopien in DIESER Runde noch im Beutel liegen.';
comment on column wi_solo_learners.pass_no is
  'Die laufende Runde. Zählt hoch, wenn der Beutel leer ist.';

-- Der Bestand: ein Fach war drei Punkte wert. `where points = 0`
-- macht die Zeile idempotent — beim zweiten Lauf ist nichts mehr
-- umzurechnen, und wer inzwischen geübt hat, wird nicht
-- zurückgesetzt.
update wi_solo_progress
   set points = least(greatest(box, 0), 4) * 3
 where points = 0 and box > 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wi_solo_progress_points_range') then
    alter table wi_solo_progress
      add constraint wi_solo_progress_points_range check (points between 0 and 12);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) Stufe und Wiedervorlage
-- ─────────────────────────────────────────────────────────────
-- Die Abstände standen bis 0136 als Array mitten in wi_solo_record.
-- Sie stehen jetzt für sich, weil zwei Stellen sie brauchen (die
-- gefragte Richtung und die Gegenrichtung beim Fehler) — und eine
-- Zahlenreihe, die an zwei Stellen steht, ist nach der nächsten
-- Nachbesserung zwei Zahlenreihen.
create or replace function wi_solo_wieder(p_stufe int)
  returns interval
  immutable
  set search_path = public
  language sql
as $$
  select (array[
    interval '10 minutes', interval '1 day', interval '3 days',
    interval '7 days',     interval '21 days'
  ])[least(greatest(p_stufe, 0), 4) + 1];
$$;

comment on function wi_solo_wieder(int) is
  'Wann ein Wort dieser Stufe wieder fällig ist. Steuert seit 0139 nur noch, wie viele '
  'Kopien es im Beutel bekommt — nicht mehr, ob es drankommt.';


-- Die EINE Definition der Tierstufe, jetzt auf Punkten. Dass
-- min(a,b)/3 dasselbe ist wie min(a/3, b/3), gilt für die
-- Ganzzahl-Division uneingeschränkt — die Reihenfolge ist also
-- Geschmack und nicht Rechnung.
create or replace function wi_solo_stages(p_learner uuid, p_item uuid default null)
  returns table (item_id uuid, stage int)
  stable
  set search_path = public
  language sql
as $$
  select i.id,
         (least(
           coalesce(max(p.points) filter (where p.dir = 'de_en'), 0),
           coalesce(max(p.points) filter (where p.dir = 'en_de'), 0)
         ) / 3)::int
    from wi_solo_sets s
    join vocab_items i on i.set_id = s.set_id
    left join wi_solo_progress p
           on p.learner_id = s.learner_id and p.item_id = i.id
   where s.learner_id = p_learner
     and (p_item is null or i.id = p_item)
   group by i.id;
$$;

comment on function wi_solo_stages(uuid, uuid) is
  'Stufe 0..4 je Wort: das Minimum beider Richtungen, gerechnet aus dem Punktekonto. '
  'Ein Wort schlüpft erst, wenn es in beide Richtungen saß. Einzige Definition dieser Regel.';


-- ─────────────────────────────────────────────────────────────
-- 3) Buchen
-- ─────────────────────────────────────────────────────────────
-- wi_solo_points ist der Karteikasten und sonst nichts: Konto,
-- Termin, Spiegel. Es zählt ausdrücklich KEIN Vorkommen mit — das
-- ist Sache der Chronik (wi_solo_tally), und zwar seit 0138 aus
-- gutem Grund: die beiden haben verschiedene Gründe, sich zu
-- ändern.
--
-- p_create trennt die gefragte Richtung von der Gegenrichtung. Ein
-- Fehler zieht beiden Konten Punkte ab, aber die Gegenrichtung
-- bekommt davon KEINE Zeile: ein Wort, das in dieser Richtung nie
-- dran war, steht bei null und bliebe bei null — die Zeile wäre nur
-- ein Termin, der es fälschlich als „überfällig" in den Beutel
-- brächte.
create or replace function wi_solo_points(
  p_learner uuid,
  p_item    uuid,
  p_dir     text,
  p_delta   int,
  p_create  boolean
)
  returns void
  volatile
  set search_path = public
  language sql
as $$
  update wi_solo_progress
     set points     = least(greatest(points + p_delta, 0), 12),
         box        = least(greatest(points + p_delta, 0), 12) / 3,
         due_at     = now() + wi_solo_wieder(least(greatest(points + p_delta, 0), 12) / 3),
         updated_at = now()
   where learner_id = p_learner and item_id = p_item and dir = p_dir;

  insert into wi_solo_progress (learner_id, item_id, dir, points, box, due_at,
                                seen, wrong, clean, helped, pass_no, pass_left, updated_at)
  select p_learner, p_item, p_dir,
         least(greatest(p_delta, 0), 12),
         least(greatest(p_delta, 0), 12) / 3,
         now() + wi_solo_wieder(least(greatest(p_delta, 0), 12) / 3),
         0, 0, 0, 0, 0, 0, now()
   where p_create
     and not exists (select 1 from wi_solo_progress
                      where learner_id = p_learner and item_id = p_item and dir = p_dir);
$$;

comment on function wi_solo_points(uuid, uuid, text, int, boolean) is
  'Punktekonto einer Richtung ändern (Deckel 0..12), Termin neu setzen, box spiegeln. '
  'p_create=false rührt eine fehlende Zeile nicht an — für die Gegenrichtung beim Fehler.';


-- Die Chronik. Neu gegenüber 0138: sie führt jetzt AUCH `seen` und
-- `wrong`, die bis hierher in wi_solo_record steckten. Damit steht
-- alles, was gezählt wird, an einer Stelle — und wi_solo_points
-- muss nicht wissen, ob eine Antwort richtig war, sondern nur, wie
-- viele Punkte sie wert ist.
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
     set seen   = seen   + 1,
         clean  = clean  + case when p_ok and not p_helped then 1 else 0 end,
         helped = helped + case when p_ok and     p_helped then 1 else 0 end,
         wrong  = wrong  + case when p_ok then 0 else 1 end
   where learner_id = p_learner
     and item_id    = p_item
     and dir        = p_dir;
$$;

comment on function wi_solo_tally(uuid, uuid, text, boolean, boolean) is
  'Chronik einer Vokabel je Richtung: seen, clean, helped, wrong. Ein Vorkommen zählt EINMAL, '
  'egal wie viele Zwischenstufen es hatte. Ändert nichts am Karteikasten.';


-- Die alte Fassung aus 0136 wird zum Durchreicher. Sie schriebe
-- sonst weiter in `box` und damit an der neuen Währung vorbei —
-- eine Funktion, die still das Falsche tut, ist schlimmer als eine,
-- die es nicht mehr gibt.
create or replace function wi_solo_record(
  p_learner uuid,
  p_item    uuid,
  p_dir     text,
  p_ok      boolean
)
  returns void
  volatile
  set search_path = public
  language sql
as $$
  select wi_solo_points(p_learner, p_item, p_dir, case when p_ok then 3 else -3 end, true);
  select wi_solo_tally(p_learner, p_item, p_dir, p_ok, false);
$$;

comment on function wi_solo_record(uuid, uuid, text, boolean) is
  'Alter Weg aus 0136, seit 0139 nur noch Durchreicher auf wi_solo_points + wi_solo_tally. '
  'Der Antwortweg ruft die beiden direkt — er kennt die Zwischenstufen und den Modus.';


-- ─────────────────────────────────────────────────────────────
-- 4) Der Beutel
-- ─────────────────────────────────────────────────────────────
-- Welche Richtungen überhaupt im Beutel liegen, entscheidet die
-- Einstellung. Stand bis 0136 zweimal wörtlich in wi_solo_pick_next
-- (einmal für „mixed", einmal für den Rest) und ist hier eine
-- Funktion, weil der Beutel sie an drei Stellen braucht.
create or replace function wi_solo_dirs(p_learner uuid)
  returns text[]
  stable
  set search_path = public
  language sql
as $$
  select case when coalesce(
                  (select l.settings->>'dir' from wi_solo_learners l where l.id = p_learner),
                  'mixed') = 'mixed'
              then array['de_en', 'en_de']
              else array[(select l.settings->>'dir' from wi_solo_learners l
                           where l.id = p_learner)]
         end;
$$;


-- Wie oft ein Wort-Richtungs-Paar in einer Runde liegt. Die ganze
-- Gewichtung des Werkzeugs steht in diesen zwei Zeilen — sie sollen
-- deshalb ohne Kontext lesbar sein.
create or replace function wi_solo_soll(p_stufe int, p_faellig boolean)
  returns int
  immutable
  set search_path = public
  language sql
as $$
  select (case when p_stufe <= 0 then 3
               when p_stufe <= 2 then 2
               else 1 end)
       + (case when p_faellig then 1 else 0 end);
$$;

comment on function wi_solo_soll(int, boolean) is
  'Kopien im Beutel: Ei 3, geschlüpft/gewachsen 2, ausgewachsen/funkelnd 1, überfällig +1. '
  'Jedes Wort liegt mindestens einmal drin — deshalb deckt eine Runde immer die ganze Unit ab.';


-- Was gerade noch im Beutel liegt. Eine Zeile je Wort-Richtungs-
-- Paar der gewählten Units, auch für Wörter ohne Fortschrittszeile:
-- die sind der Normalfall am ersten Tag, und ein Beutel, in dem die
-- neuen Wörter fehlen, wäre der Karteikasten mit anderem Namen.
--
-- Die drei teuren Auskünfte (gewählte Units, Richtungen, laufende
-- Runde) stehen in einem CTE. Ohne ihn führte Postgres sie unter
-- Umständen je Zeile aus — bei 800 Wörtern achthundertmal.
create or replace function wi_solo_bag_open(p_learner uuid, p_item uuid default null)
  returns table (item_id uuid, dir text, offen int)
  stable
  set search_path = public
  language sql
as $$
  with s as (
    select wi_solo_chosen(p_learner) as sets,
           wi_solo_dirs(p_learner)   as dirs,
           (select l.pass_no from wi_solo_learners l where l.id = p_learner) as pno
  )
  select i.id, d.dir,
         (case
            when p.learner_id is null then 3
            when p.pass_no is distinct from s.pno
              then wi_solo_soll((p.points / 3)::int, p.due_at <= now())
            else p.pass_left
          end)::int
    from s
    cross join lateral unnest(s.dirs) as d(dir)
    cross join vocab_items i
    left join wi_solo_progress p
           on p.learner_id = p_learner and p.item_id = i.id and p.dir = d.dir
   where i.set_id = any(s.sets)
     and (p_item is null or i.id = p_item);
$$;


-- Eine gezogene Kopie verbuchen. Gesetzt wird der Rest, nicht
-- gerechnet: was vor der Antwort im Beutel lag, weiß nur der
-- Antwortweg — nach wi_solo_points steht dort schon der neue Termin
-- und damit womöglich ein anderes Kontingent.
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
$$;


-- Der Stand der Runde, wie ihn das Gerät zeigt. Gezählt werden
-- WÖRTER und nicht Kopien oder Richtungen: „noch 34 von 118" muss
-- sich mit dem decken, was auf der Insel steht. Ein Wort ist durch,
-- wenn keine seiner Richtungen mehr im Beutel liegt.
create or replace function wi_solo_pass(p_learner uuid)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select jsonb_build_object(
           'no',     (select l.pass_no from wi_solo_learners l where l.id = p_learner),
           'offen',  count(distinct b.item_id) filter (where b.offen > 0),
           'gesamt', count(distinct b.item_id))
    from wi_solo_bag_open(p_learner, null) b;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5) Ziehen
-- ─────────────────────────────────────────────────────────────
-- Zufällig aus allem, was noch im Beutel liegt — keine Sortierung
-- nach Termin mehr, keine Vorfahrt für Fälliges. Beides steckt
-- jetzt in der ANZAHL der Kopien, und das ist der ganze Umbau.
--
-- Die einzige Ausnahme ist das gerade beantwortete Wort: es wird
-- nach hinten sortiert, damit ein Rückwurf nicht sofort wieder
-- dasselbe Wort bringt (und bei „gemischt" nicht dasselbe Wort in
-- der Gegenrichtung direkt hinterher). Ist nichts anderes mehr da,
-- kommt es trotzdem — ein leerer Bildschirm wäre die schlechtere
-- Antwort.
create or replace function wi_solo_pick_next(p_learner uuid)
  returns table (item_id uuid, dir text)
  volatile
  set search_path = public
  language sql
as $$
  select b.item_id, b.dir
    from wi_solo_bag_open(p_learner, null) b
   where b.offen > 0
   order by (b.item_id = (select l.current_item from wi_solo_learners l
                           where l.id = p_learner))::int nulls first,
            random()
   limit 1;
$$;


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
    update wi_solo_learners set pass_no = pass_no + 1 where id = p_learner;
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
-- 6) Was das Gerät sieht
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0138 plus zwei Felder. Beide fahren mit, statt einen
-- eigenen Ruf zu bekommen: sie ändern sich mit JEDER Antwort, und
-- ein zweiter Weg zum Server wäre ein Ladekreisel für vier Zahlen,
-- die ohnehin unterwegs waren.
--
--   pts   Punktekonto beider Richtungen. Daraus zeichnet das Gerät
--         die drei Kästchen bis zur nächsten Stufe — ohne dass ein
--         Kind je das Wort „Drittel" lesen muss.
--   pass  { no, offen, gesamt } — der Stand der Runde.
--
-- stats bekommt eine vierte Zahl: `wrong`. Bis 0138 rechnete das
-- Gerät „falsch = gesamt − richtig − mit Hilfe", und das war für
-- alles, was vor 0138 geübt wurde, zu hoch (clean/helped starteten
-- dort bei null). Jetzt steht die Zahl selbst da, und was in der
-- Summe fehlt, ist ehrlich unbekannt.
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
                     'pass',    wi_solo_pass(p_l.id),
                     'stats',   coalesce((
                                  select jsonb_object_agg(
                                           p.dir,
                                           jsonb_build_array(p.clean, p.helped, p.seen, p.wrong))
                                    from wi_solo_progress p
                                   where p.learner_id = p_l.id
                                     and p.item_id    = p_l.current_item),
                                '{}'::jsonb),
                     'pts',     coalesce((
                                  select jsonb_object_agg(p.dir, p.points)
                                    from wi_solo_progress p
                                   where p.learner_id = p_l.id
                                     and p.item_id    = p_l.current_item),
                                '{}'::jsonb))
         end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 7) Der Antwortweg
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0138 (der höchsten bestehenden Fassung — wer diese
-- Funktion später anfasst, nimmt DIESE hier als Vorlage). Die
-- dreistufige Prüfung ist unverändert: exact → richtig, near →
-- Schreibweisen, miss → acht Wörter. Geprüft wird hier und nie im
-- Gerät.
--
-- Neu ist, was danach passiert. Drei Zahlen entscheiden alles, und
-- sie stehen bewusst zusammen an einer Stelle:
--
--   v_delta   Punkte für die gefragte Richtung
--   v_gegen   Punkte für die andere (nur beim Fehler)
--   v_extra   Kopien zurück in den Beutel
--
-- ⚠️ Der Modus muss aus den EINSTELLUNGEN kommen und nicht aus
-- current_stage. Im Tipp-Modus steht bei einer entschiedenen
-- Antwort ebenfalls 'spell' oder 'choice' — wer daran den Modus
-- ablesen wollte, machte aus jedem Vertipper eine Auswahl-Runde und
-- verschenkte zwei Drittel des Abzugs.
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
    v_extra := case when v_helped then 1 else 0 end;
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
