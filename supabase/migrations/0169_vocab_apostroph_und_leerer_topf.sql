-- ══════════════════════════════════════════════════════════════
-- Migration 0169 — Der Apostroph, die Klammer und der leere Topf
-- ══════════════════════════════════════════════════════════════
-- Drei Meldungen von Sönke (23.09.2026), zwei davon hängen am
-- selben Ende:
--
--   1  „I'm ist immer falsch bei mir, weil ich das falsche `
--       mache … auch im sollte hier ok sein."
--   2  „I'd like (I would like) — eigentlich sollte hier beides
--       ok sein. Aber man kann das nicht simpel auf ‚in Klammern
--       ist auch ok' machen, da häufig auch in den Klammern was
--       anderes ergänzendes steht."
--   3  Man soll NULL Vokabellisten wählen können.
--
-- ── 1) Der Apostroph ──────────────────────────────────────────
-- Nachgezählt im Lehrwerk: Green Line 1 und 2 schreiben ihre
-- Kurzformen mit dem typografischen ’ (U+2019) — „I’d like to …",
-- „we’re", „doesn’t". Auf der Tablet-Tastatur kommt aber ein ' oder
-- (bei gedrückter Taste) ein ` oder ´ heraus. `vocab_norm` hat
-- Apostrophe bisher in KEINER Fassung angefasst: „i'd like" und
-- „i’d like" sind damit zwei verschiedene Zeichenketten, der
-- Levenshtein-Abstand ist 1, und das Kind landet in der
-- Schreibweisen-Auswahl statt bei „richtig". Genau Sönkes Befund.
--
-- Alle Apostroph-Zeichen fallen ab jetzt WEG (nicht: werden
-- vereinheitlicht). Das ist die zweite Hälfte seiner Ansage —
-- „auch im sollte hier ok sein": wer „im", „dont" oder „its"
-- tippt, hat das Wort gewusst und nicht den Apostroph verfehlt.
-- Preis: „were" gilt auch für „we’re". Der ist es wert; ein
-- Apostroph ist auf keinem Tablet eine Vokabelfrage.
--
-- ── 2) Die Klammer ────────────────────────────────────────────
-- Sönke hat recht, dass „in Klammern ist auch ok" nicht geht.
-- Nachgezählt in 0160 + 0163 (1800 Wortpaare): 47 × „(pl)",
-- 13 × „(sich)", 11 × „(no pl)", dazu „(bei Uhrzeitangaben)",
-- „(brit. Währungseinheit)", „(nicht für Personen)". Das sind
-- AUSKÜNFTE über das Wort. Wer sie als Antwort gelten ließe,
-- erklärte „bei Uhrzeitangaben" zu einer richtigen Vokabel.
--
-- Die Notation trennt die zwei Fälle aber selbst, und zwar mit
-- einem Zeichen: das Gleichheitszeichen. Es steht in genau SECHS
-- Einträgen des ganzen Lehrwerks, und alle sechs sind echte
-- Zweitfassungen desselben Wortes:
--
--   I’d like to … (= I would like to)      TV (= television)
--   that’s (= that is)                     PE (= Physical Education)
--   we’re (= we are)                       RE (= Religious Education)
--
-- Regel also: `(= X)` ist eine zweite gültige Antwort, jede andere
-- Klammer bleibt eine Auskunft und fällt weg wie bisher. Nichts
-- geraten, nichts an Wortlängen gemessen — gelesen wird, was im
-- Buch steht.
--
-- Getragen wird das von `vocab_forms(text)`: sie macht aus EINER
-- gespeicherten Antwort die Liste ihrer gültigen Vergleichsformen.
-- `vocab_norm` bleibt, was sie war (EINE Form, für Vergleiche und
-- Sortierungen); wer mehrere Lesarten braucht, nimmt vocab_forms.
--
-- ⚠️ Damit hat eine Vokabel mehr als eine richtige Antwort, und
-- deshalb müssen BEIDE Ablenker-Erzeuger mitziehen (Regel:
-- feedback_free_constant_double_answer). Ein Ablenker „television"
-- neben der Lösung „TV (= television)" wäre eine zweite richtige
-- Kachel — das Kind hätte recht und bekäme unrecht. Verglichen
-- wird ab jetzt auf ÜBERSCHNEIDUNG der Formen (`&&`), nicht auf
-- Gleichheit der einen Normalform.
--
-- Angewachsene Klammern („gym(nasium)") brauchen hier nichts: der
-- Umwandler schreibt ihre zweite Lesart seit dem 20.09.2026 als
-- eigene Fassung nach `alt_term` (0160 Zeile „Turnhalle"), und
-- alt_term läuft ohnehin durch vocab_forms.
--
-- ── 3) Der leere Topf ─────────────────────────────────────────
-- Auf der eigenen Insel ließ sich die letzte Station nicht
-- abwählen, und der Grund stand im Server: `wi_solo_chosen` las
-- „nichts gewählt" als „alles". Das war am ersten Tag richtig
-- (ohne einen Klick übt man auf allem) und macht das Umschalten
-- unnötig umständlich, sobald jemand von Unit 3 auf Unit 7 will.
--
-- Unterschieden wird ab jetzt am SCHLÜSSEL und nicht an der Länge:
-- `settings` ohne 'sets' heißt „noch nie gewählt" = alles;
-- `settings.sets = []` heißt „nichts gewählt" = nichts. Die
-- Voreinstellung (`settings` ist '{}') bleibt damit unverändert.
--
-- Kein DROP — Idempotenz per `create or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) vocab_norm — Apostrophe fallen weg
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0159 (der höchsten bestehenden Fassung — wer diese
-- Funktion später anfasst, nimmt DIESE hier als Vorlage). Geändert
-- ist genau die Zeichenklasse in Schritt 3: fünf Apostroph-Zeichen
-- kommen dazu ('  ‘  ’  `  ´).
--
-- Die Reihenfolge der vier Schritte bleibt, wie sie ist, und sie
-- ist Absicht: erst die Klammern weg, dann der Artikel (sonst
-- stünde „(der) Hund" mit einer Klammer da, wo der Artikel-Ausdruck
-- einen Wortanfang erwartet), dann die Satzzeichen, dann die
-- Leerzeichen zusammen.
--
-- An dieser Funktion hängt weiterhin kein Index (geprüft: nur
-- Rümpfe und ein `order by`), ein Neuaufbau entfällt.
create or replace function vocab_norm(p_s text)
  returns text
  immutable
  set search_path = public
  language sql
as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 btrim(replace(lower(coalesce(p_s, '')), 'ß', 'ss')),
                 '\([^)]*\)', ' ', 'g'),
               '^(to|the|a|an|der|die|das|den|dem|ein|eine|einen)\s+', ''),
             '[.,;:!?"()„“”…''‘’`´]', '', 'g'),
           '\s+', ' ', 'g'));
$$;

comment on function vocab_norm(text) is
  'Vergleichsform einer Antwort. Artikel, „to", Satzzeichen, Auslassungspunkte, '
  'Apostrophe und Klammerzusätze fallen weg, ß wird ss, Umlaute bleiben. '
  'EINE Form — mehrere Lesarten eines Eintrags liefert vocab_forms.';


-- ─────────────────────────────────────────────────────────────
-- 2) vocab_forms — alle gültigen Lesarten EINER Antwort
-- ─────────────────────────────────────────────────────────────
-- Immer dabei: die Normalform (Klammern weg). Dazu je eine Form
-- für jeden Klammerausdruck, der mit `=` anfängt — siehe Kopf.
--
-- Das `=` wird mit weggeschnitten, bevor normalisiert wird: es
-- steht in keiner Satzzeichen-Liste von vocab_norm, und wer es
-- stehen ließe, bekäme „= i would like to" als Vergleichsform
-- heraus — eine Zeichenkette, die kein Kind je tippt.
create or replace function vocab_forms(p_s text)
  returns text[]
  immutable
  set search_path = public
  language sql
as $$
  select array(
    select distinct f
      from (
        select vocab_norm(p_s)
        union all
        select vocab_norm(t.m[1])
          from regexp_matches(coalesce(p_s, ''), '\(\s*=\s*([^)]+)\)', 'g') as t(m)
      ) k(f)
     where f is not null and f <> '');
$$;

comment on function vocab_forms(text) is
  'Die gültigen Vergleichsformen EINER gespeicherten Antwort: die Normalform, '
  'dazu der Inhalt jedes Klammerausdrucks der Form „(= …)" als eigene Fassung. '
  'Jede andere Klammer ist eine Auskunft über das Wort und keine zweite Antwort.';


-- ─────────────────────────────────────────────────────────────
-- 3) vocab_grade — geprüft wird gegen jede Lesart
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0130 §7. Geändert ist die innere Schleife: statt
-- EINER Normalform je Antwort läuft sie jetzt über deren Formen.
--
-- Die Toleranz für „fast" hängt weiterhin an der Länge DER
-- LÖSUNG, und jetzt an der Länge der jeweiligen FORM — das ist
-- dieselbe Regel, nur genauer: „TV" (2 Zeichen, Toleranz 0) und
-- „television" (10 Zeichen, Toleranz 2) sind zwei verschieden
-- lange Lösungen desselben Eintrags, und jede bekommt ihre eigene
-- Milde. Eine gemeinsame Toleranz aus der längsten Form wäre für
-- die kurze viel zu gnädig: „TV" hätte dann zwei freie Zeichen und
-- jedes Zwei-Buchstaben-Wort wäre richtig.
create or replace function vocab_grade(p_item uuid, p_dir text, p_input text)
  returns text
  stable
  set search_path = public
  language plpgsql
as $$
declare
  v_ans  text[];
  v_in   text := vocab_norm(p_input);
  v_a    text;
  v_na   text;
  v_tol  int;
  v_near boolean := false;
begin
  v_ans := vocab_answers(p_item, p_dir);
  if v_ans is null or v_in = '' then
    return 'miss';
  end if;

  foreach v_a in array v_ans loop
    foreach v_na in array vocab_forms(v_a) loop
      if v_na = v_in then
        return 'exact';
      end if;
      v_tol := case when length(v_na) >= 8 then 2
                    when length(v_na) >= 4 then 1
                    else 0 end;
      if vocab_lev(v_na, v_in) <= v_tol then
        v_near := true;
      end if;
    end loop;
  end loop;

  return case when v_near then 'near' else 'miss' end;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4) vocab_spellings — kein Ablenker, der in Wahrheit stimmt
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0130 §8. Geändert ist EINE Zeile im Aussieben:
-- verglichen wird auf Überschneidung der Formen statt auf
-- Gleichheit der Normalform. Die vier Fehler-Muster (Dreher,
-- doppelter Konsonant, ie/ei, stummes e) bleiben unverändert.
create or replace function vocab_spellings(p_correct text, p_typed text)
  returns text[]
  immutable
  set search_path = public
  language plpgsql
as $$
declare
  v_w    text := btrim(coalesce(p_correct, ''));
  v_t    text := btrim(coalesce(p_typed, ''));
  v_len  int  := length(v_w);
  v_cand text[] := array[]::text[];
  v_out  text[] := array[]::text[];
  v_c    text;
  i      int;
  v_ch   text;
begin
  if v_w = '' then
    return array[]::text[];
  end if;

  -- Die eigene Fassung zuerst in den Topf: sie ist der lehrreichste
  -- Ablenker, weil das Kind sie wiedererkennt.
  if v_t <> '' then
    v_cand := v_cand || v_t;
  end if;

  -- Buchstabendreher in der Wortmitte
  if v_len >= 4 then
    i := greatest(2, (v_len / 2)::int);
    v_cand := v_cand || (substr(v_w, 1, i - 1) || substr(v_w, i + 1, 1)
                         || substr(v_w, i, 1) || substr(v_w, i + 2));
  end if;

  -- Doppelter Konsonant: der erste, der noch keiner ist
  for i in 2 .. greatest(v_len - 1, 1) loop
    v_ch := substr(v_w, i, 1);
    if v_ch ~ '[bcdfgklmnprstz]'
       and substr(v_w, i + 1, 1) <> v_ch
       and substr(v_w, i - 1, 1) <> v_ch then
      v_cand := v_cand || (substr(v_w, 1, i) || v_ch || substr(v_w, i + 1));
      exit;
    end if;
  end loop;

  -- ie/ei vertauscht — der Klassiker in beiden Sprachen
  if position('ie' in lower(v_w)) > 0 then
    v_cand := v_cand || regexp_replace(v_w, 'ie', 'ei');
  elsif position('ei' in lower(v_w)) > 0 then
    v_cand := v_cand || regexp_replace(v_w, 'ei', 'ie');
  end if;

  -- Stummes e am Ende: weg, wenn eines da ist, sonst dran
  if v_len >= 4 and right(v_w, 1) = 'e' then
    v_cand := v_cand || substr(v_w, 1, v_len - 1);
  elsif v_len >= 3 then
    v_cand := v_cand || (v_w || 'e');
  end if;

  -- Aussieben: leer, doppelt oder in Wahrheit richtig. „In Wahrheit
  -- richtig" heißt seit 0169: trifft IRGENDEINE Lesart der Lösung.
  foreach v_c in array v_cand loop
    if v_c is not null and btrim(v_c) <> ''
       and not (vocab_forms(v_c) && vocab_forms(v_w))
       and not (v_out @> array[v_c])
       and coalesce(array_length(v_out, 1), 0) < 3 then
      v_out := v_out || v_c;
    end if;
  end loop;

  -- Die Lösung dazu, dann fest durchmischt: die richtige Fassung
  -- darf nicht immer an derselben Stelle stehen, sonst lernt die
  -- Klasse die Position statt das Wort.
  v_out := v_out || v_w;
  return (select array_agg(x order by md5(x || v_w))
            from unnest(v_out) as t(x));
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5) vocab_choices — dieselbe Sicherung bei den acht Wörtern
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0130 §9, eine Zeile geändert. Der Fall, gegen den sie
-- steht: in derselben Unit stehen „TV (= television)" und
-- „Fernsehen → television". Bisher verglich die Bedingung nur die
-- Normalformen („tv" ≠ „television") und ließe beide Kacheln zu.
--
-- Das `distinct on (vocab_norm(w))` bleibt: es entdoppelt die
-- Ablenker untereinander, und dafür ist die eine Normalform genau
-- richtig.
create or replace function vocab_choices(p_sets uuid[], p_item uuid, p_dir text, p_n int)
  returns text[]
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_right text;
  v_out   text[];
begin
  v_right := (vocab_answers(p_item, p_dir))[1];
  if v_right is null then
    return array[]::text[];
  end if;

  -- Das `limit` gehört IN die Unterabfrage. Steht es außen, begrenzt
  -- es die eine Zeile, die array_agg ohnehin liefert — und die
  -- Auswahl käme mit allen Wörtern der Unit heraus.
  select coalesce(array_agg(w), array[]::text[]) into v_out
    from (
      select w
        from (
          select distinct on (vocab_norm(w)) w
            from (
              select case when p_dir = 'en_de' then i.term else i.translation end as w
                from vocab_items i
               where i.set_id = any(p_sets)
                 and i.id <> p_item
            ) c
           where not (vocab_forms(c.w) && vocab_forms(v_right))
           order by vocab_norm(w), random()
        ) u
       order by random()
       limit greatest(p_n - 1, 1)
    ) d;

  v_out := v_out || v_right;
  return (select array_agg(x order by md5(x || v_right))
            from unnest(v_out) as t(x));
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 6) wi_solo_chosen — „nichts gewählt" heißt nichts
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0136 §9, umgestellt auf die Unterscheidung am
-- SCHLÜSSEL. Drei Zustände statt zweier:
--
--   settings hat kein 'sets'   → alles Freigespielte (erster Tag)
--   settings.sets = []         → nichts (bewusst leer geräumt)
--   settings.sets = [a, b]     → a und b, geschnitten aufs
--                                Freigespielte
--
-- Der Schnitt bleibt die Sicherung: eine Station, die nicht in
-- wi_solo_sets steht, kommt hier nie heraus. Verglichen wird
-- weiterhin als TEXT und nicht als uuid — ein Cast, der bei einem
-- einzigen krummen Eintrag die ganze Übung mit einer Fehlermeldung
-- beendet, ist der falsche Ort für Strenge.
create or replace function wi_solo_chosen(p_learner uuid)
  returns uuid[]
  stable
  set search_path = public
  language sql
as $$
  select case
    when (select coalesce(l.settings, '{}'::jsonb) ? 'sets'
            from wi_solo_learners l where l.id = p_learner)
    then array(
           select ss.set_id
             from wi_solo_sets ss
             join wi_solo_learners l on l.id = ss.learner_id
            where ss.learner_id = p_learner
              and coalesce(l.settings->'sets', '[]'::jsonb) ? ss.set_id::text)
    else array(select set_id from wi_solo_sets where learner_id = p_learner)
  end;
$$;

comment on function wi_solo_chosen(uuid) is
  'Die Stationen, auf denen gerade geübt wird — die Auswahl geschnitten auf das Freigespielte. '
  'Seit 0169 am SCHLÜSSEL unterschieden: kein ''sets'' in settings = alles Freigespielte, '
  'sets = [] = nichts. Der Schnitt ist die Sicherung.';


-- ── Was bisher [] hieß, hieß „alles" ──────────────────────────
-- Eine Migration darf die BEDEUTUNG eines gespeicherten Wertes
-- nicht still umdeuten. Wer heute mit `sets: []` dasteht, hat
-- damit „alles" gemeint (anders ging es nicht) und bekäme ab der
-- nächsten Zeile eine leere Insel, ohne etwas getan zu haben.
-- Also einmal aufräumen: leeres Array raus, der Schlüssel fällt
-- weg, und damit gilt wieder „alles".
--
-- Entstanden ist der Zustand nie durchs Gerät — dort ließ sich die
-- letzte Station ja gerade nicht abwählen —, sondern in
-- wi_solo_settings: sind ALLE geschickten Stationen fremd, schreibt
-- sie ein leeres Array. Nach 0161 (die drei Testlisten sind weg)
-- ist das kein theoretischer Fall.
--
-- ⚠️ Ein zweiter Lauf dieser Migration würde eine dann bewusst
-- leere Auswahl wieder auf „alles" stellen. Supabase spielt jede
-- Datei genau einmal ein; wer sie von Hand wiederholt, sollte
-- diesen Block auslassen.
update wi_solo_learners
   set settings = settings - 'sets'
 where settings ? 'sets'
   and jsonb_typeof(settings->'sets') = 'array'
   and jsonb_array_length(settings->'sets') = 0;


-- ─────────────────────────────────────────────────────────────
-- 7) wi_solo_next — ein leerer Topf dreht die Runde nicht weiter
-- ─────────────────────────────────────────────────────────────
-- Rumpf aus 0141 §3 (die höchste bestehende Fassung), ein Ausgang
-- davor. Ohne ihn zählt jeder Griff an den Übungsknopf bei leerer
-- Auswahl eine Runde hoch: „Beutel leer → neu mischen" ist die
-- richtige Antwort auf „alles durchgearbeitet" und die falsche auf
-- „es ist gar nichts drin". Wer dann eine Station wieder anschaltet,
-- fände sich in Runde 14 wieder, ohne ein Wort geübt zu haben.
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

  -- Nichts gewählt: aufräumen und gehen. Die Aufgabe wird
  -- weggenommen (sonst stünde das Wort der letzten Auswahl noch da),
  -- die Runde bleibt stehen.
  if coalesce(array_length(wi_solo_chosen(p_learner), 1), 0) = 0 then
    update wi_solo_learners
       set current_item = null, current_dir = null,
           current_stage = null, current_options = '{}'
     where id = p_learner;
    return;
  end if;

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
