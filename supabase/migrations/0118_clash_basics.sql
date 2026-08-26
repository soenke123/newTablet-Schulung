-- ═══════════════════════════════════════════════════════════════
-- 0118 · Kingdoms of Mathoria — Grundrechenarten
-- ═══════════════════════════════════════════════════════════════
--
-- Sönke am 26.08.2026: „In der Hauptkategorie Grundrechenarten neue
-- Unterkategorien
--   a) Addition/Subtraktion bis 100 (Erweiterung der vorhandenen)
--   b) Addition/Subtraktion bis 10 000
--   c) Mult und Div (großes 1x1, also bis 20x20)
--   d) Quadratzahlen (bis 20)
--   e) »Ganze Zahlen aktivieren« — dann sind a), b) und c) auch mit
--      negativen Zahlen möglich
--   f) »Rationale Zahlen aktivieren« — dann werden a), b) und c) um
--      Kommazahlen erweitert, dafür kleinerer Zahlenraum.
-- Wenn e) aktiviert ist, kann trotzdem noch 15*13 kommen, also es
-- ERWEITERT die Aufgaben. e) und f) sind kumulativ, dann ist 1,5*-1,1
-- möglich."
--
-- Die Gruppe „basics" hatte bis heute genau EINE Art (add100, reine
-- Addition bis 100) — die dünnste von allen vier Gruppen.
--
-- Das Neue an dieser Migration ist nicht die Rechnerei, sondern der
-- SCHALTER. Bisher kennt der Pool je Aufgabenart drei Zustände
-- (aus / tippen / auswählen) und sonst nichts; es gibt in der ganzen
-- Aufgabenwelt keine einzige Option. e) und f) sind aber keine
-- Aufgabenarten — sie werden nie gezogen, sie verändern andere.
--
-- Modelliert als Katalogzeile mit `flag = true` und dem Pool-Wert 'on':
--
--   {"add100":"free", "muldiv20":"mc", "neg_on":"on"}
--
-- Warum im Pool und nicht als eigene Spalte auf clash_boards: die Wahl
-- der Lehrkraft bleibt an EINER Stelle, es braucht keine zweite RPC und
-- keinen zweiten Weg in die Ansicht. Bezahlt wird das mit drei Stellen,
-- die den neuen Wert kennen müssen — clash_normalize_pool, die Ziehung
-- und die Startsperre. Die stehen alle unten.
--
-- Kommazahlen ziehen zwei weitere Dinge nach sich:
--   · clash_parse_answer muss „12,5" lesen können (und fünf Stellen,
--     denn „10000" fiele heute schon durch).
--   · die Antwortkacheln brauchen einen eigenen Auffüller: der von
--     clash_q_choices schreibt Nachbarn als BRUCH („25/2"), und neben
--     „12,5" wäre das die Antwort in Verkleidung.
--
-- Gerechnet wird durchgehend mit SKALIERTEN GANZZAHLEN (Wert × 10^n),
-- nie mit Gleitkomma. 0,1 + 0,2 ist in double nicht 0,3, und der
-- Vergleich am Ende ist exakt.
--
-- ⚠️ Jede Funktion wird auf Grundlage ihrer HÖCHSTEN bestehenden
-- Fassung neu deklariert (Regel: feedback_shop_state_merge_regressions).
-- Referenzdaten mit `on conflict … do update set`, nie `do nothing`
-- (Regel: feedback_stale_reference_data_do_nothing).
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Der Schalter als Katalogzeile
-- ─────────────────────────────────────────────────────────────
alter table clash_task_types
  add column if not exists flag boolean not null default false;

comment on column clash_task_types.flag is
  'true = diese Zeile ist keine Aufgabenart, sondern ein SCHALTER. Sie wird nie gezogen, ihr '
  'Wert im Pool ist "on" statt "free"/"mc", und die Generatoren der eigenen Gruppe lesen sie. '
  'Seit 0118 (Ganze Zahlen / Rationale Zahlen in den Grundrechenarten).';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_normalize_pool — Neu-Deklaration auf Basis 0114:887
-- ─────────────────────────────────────────────────────────────
-- Eine Zeile wird zu zweien: Schalterzeilen tragen 'on', alle anderen
-- weiterhin 'free' oder 'mc'. Beides ist streng — ein Client, der
-- „add100":"on" schickt, bekommt den ganzen Pool zurückgewiesen, genau
-- wie bei einer abgeleiteten Art.
create or replace function clash_normalize_pool(p_pool jsonb)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case
    when p_pool is null or jsonb_typeof(p_pool) <> 'object' then null
    when exists (
      select 1
        from jsonb_each_text(p_pool) e
        left join clash_task_types t on t.key = e.key
       where t.key is null
          or t.derived
          or (t.flag     and e.value <> 'on')
          or (not t.flag and e.value not in ('free', 'mc'))
          or (e.value = 'free' and not t.allows_free)
          or (e.value = 'mc'   and not t.allows_mc)
    ) then null
    else p_pool
  end;
$$;

revoke all on function clash_normalize_pool(jsonb) from public;

comment on function clash_normalize_pool(jsonb) is
  'Prüft einen Aufgabenpool: flaches Objekt, jeder Schlüssel in clash_task_types und NICHT '
  'abgeleitet, jeder Wert „free"/„mc" (bzw. „on" bei Schaltern, 0118) und von der Aufgabenart '
  'erlaubt. Der leere Pool ist gültig (Zwischenstand beim Umsortieren) — die Startsperre sitzt '
  'in clash_room_start.';


-- ─────────────────────────────────────────────────────────────
-- 3) Ein Pool aus lauter Schaltern ist kein Pool
-- ─────────────────────────────────────────────────────────────
-- clash_room_start prüfte bisher auf das leere Objekt. Ein Pool, in dem
-- NUR Schalter stehen, ist nicht leer, hat aber nichts zu ziehen — das
-- Spiel liefe in den Notnagel von clash_new_question und sähe für die
-- Lehrkraft so aus, als hätte ihre Auswahl funktioniert.
create or replace function clash_pool_has_task(p_pool jsonb)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select exists (
    select 1
      from jsonb_each_text(coalesce(p_pool, '{}'::jsonb)) e
      join clash_task_types t on t.key = e.key
     where not t.flag
       and not t.derived
       and e.value in ('free', 'mc')
  );
$$;

revoke all on function clash_pool_has_task(jsonb) from public;

comment on function clash_pool_has_task(jsonb) is
  'Steht im Pool mindestens eine ZIEHBARE Aufgabenart? Schalter (flag) und abgeleitete Arten '
  'zählen nicht — die eine ist keine Aufgabe, die andere folgt nur aus anderen.';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_task_catalog — Neu-Deklaration auf Basis 0114:929
-- ─────────────────────────────────────────────────────────────
-- Ein Feld mehr je Unterkategorie: `flag`. Der Client zeichnet damit
-- statt des Dreier-Segments zwei Knöpfe (aus / an) und nimmt die Zeile
-- aus den Sammelknöpfen heraus — „alle tippen" darf keinen Schalter
-- umlegen.
create or replace function clash_task_catalog(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'groups', coalesce((
      select jsonb_agg(x.g order by x.g_sort, x.g_key)
        from (
          select t.group_key as g_key,
                 min(t.sort_group) as g_sort,
                 jsonb_build_object(
                   'key',   t.group_key,
                   'label', min(t.group_label),
                   'items', jsonb_agg(
                     jsonb_build_object(
                       'key',      t.key,
                       'label',    t.label,
                       'short',    t.short_label,
                       'example',  t.example,
                       'free',     t.allows_free,
                       'mc',       t.allows_mc,
                       'choices',  t.choice_count,
                       'keypad',   coalesce(t.keypad, t.input_mode),
                       'derived',  t.derived,
                       'requires', to_jsonb(t.requires),
                       'flag',     t.flag
                     ) order by t.sort_item, t.key)
                 ) as g
            from clash_task_types t
           group by t.group_key
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function clash_task_catalog(text) from public;
grant execute on function clash_task_catalog(text) to authenticated;

comment on function clash_task_catalog(text) is
  'Der Aufgabenkatalog für die Lehrkraft, fertig gruppiert und sortiert. Seit 0114 mit '
  'derived/requires, seit 0118 mit flag (Schalterzeilen).';


-- ─────────────────────────────────────────────────────────────
-- 5) Kommazahlen: schreiben und lesen
-- ─────────────────────────────────────────────────────────────
-- Eine skalierte Ganzzahl als deutsche Kommazahl. Endnullen fallen weg:
-- „3,40" und „3,4" sind derselbe Wert, aber die Kacheln vergleichen sich
-- über den TEXT — es darf nur eine Schreibweise geben.
create or replace function clash_dec_text(p_v bigint, p_places int)
  returns text
  language plpgsql
  immutable
as $$
declare
  v_p    int    := greatest(coalesce(p_places, 0), 0);
  v_unit bigint;
  v_frac text;
begin
  if p_v is null then
    return null;
  end if;
  if v_p = 0 then
    return p_v::text;
  end if;

  v_unit := power(10, v_p)::bigint;
  v_frac := lpad((abs(p_v) % v_unit)::text, v_p, '0');
  v_frac := rtrim(v_frac, '0');

  return case when p_v < 0 then '-' else '' end
      || (abs(p_v) / v_unit)::text
      || case when v_frac = '' then '' else ',' || v_frac end;
end;
$$;

revoke all on function clash_dec_text(bigint, int) from public;

comment on function clash_dec_text(bigint, int) is
  'Skalierte Ganzzahl → deutsche Kommazahl: (1250, 2) → „12,5". Endnullen fallen weg, damit es '
  'je Wert genau EINE Schreibweise gibt (die Kacheln vergleichen sich über den Text).';


-- Ein Operand, wie er in der Aufgabe steht. Negative Zahlen bekommen
-- Klammern: „12 + (-5)" und „12 - (-5)" sind lesbar, „12 + -5" ist es
-- nicht. Der Client setzt daraus „12 + (−5)" mit typografischem Minus.
create or replace function clash_dec_paren(p_v bigint, p_places int)
  returns text
  language sql
  immutable
as $$
  select case when p_v < 0 then '(' || clash_dec_text(p_v, p_places) || ')'
              else clash_dec_text(p_v, p_places) end;
$$;

revoke all on function clash_dec_paren(bigint, int) from public;


-- ─────────────────────────────────────────────────────────────
-- 6) clash_parse_answer — Neu-Deklaration auf Basis 0110:139
-- ─────────────────────────────────────────────────────────────
-- Zwei Erweiterungen, beide additiv:
--   · die Kommazahl „12,5" als drittes Muster. Sie wird sofort zum
--     Bruch 125/10 — dann trägt der vorhandene Kreuzprodukt-Vergleich in
--     clash_answer_matches sie ohne eine einzige Änderung, und „12,5"
--     und „25/2" sind derselbe Wert. Genau so soll es sein.
--   · fünf statt vier Vorkommastellen. „10000" fiele in der alten
--     Fassung durch, und b) heißt „bis 10 000".
-- Die Längenbegrenzung bleibt, was sie war: der Schutz vor einer Zahl,
-- die den int sprengt und die ganze RPC mit einer Ausnahme abbrechen
-- ließe. 5 Vorkomma- plus 2 Nachkommastellen sind 9 999 999 — das passt.
create or replace function clash_parse_answer(p_text text)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  s text := btrim(coalesce(p_text, ''));
  n int;
  d int;
  f int[];
begin
  if s ~ '^-?[0-9]{1,5}$' then
    n := s::int;
    d := 1;
  elsif s ~ '^-?[0-9]{1,5}/[0-9]{1,4}$' then
    n := split_part(s, '/', 1)::int;
    d := split_part(s, '/', 2)::int;
    if d = 0 then
      return null;
    end if;
  elsif s ~ '^-?[0-9]{1,5},[0-9]{1,2}$' then
    -- „-12,50" → -1250/100. replace() vor dem Cast, damit das Vorzeichen
    -- mitkommt: '-' || '1250' wäre bei „-0,5" falsch (-05 = -5).
    d := power(10, length(split_part(s, ',', 2)))::int;
    n := replace(s, ',', '')::int;
  else
    return null;
  end if;

  f := clash_frac_norm(n, d);
  return jsonb_build_object('raw_n', n, 'raw_d', d, 'n', f[1], 'd', f[2]);
end;
$$;

revoke all on function clash_parse_answer(text) from public;

comment on function clash_parse_answer(text) is
  'Liest „7", „-7", „7/8", „-7/8" und seit 0118 „12,5" als {raw_n, raw_d, n, d} (roh und '
  'gekürzt). Die Kommazahl wird zum Bruch — damit trägt der vorhandene Wertvergleich sie mit. '
  'NULL, wenn es keine Zahl in dieser Form ist.';


-- ─────────────────────────────────────────────────────────────
-- 7) Antwortkacheln für Kommazahlen
-- ─────────────────────────────────────────────────────────────
-- Warum nicht clash_q_choices: dessen Auffüller schreibt Nachbarn mit
-- clash_frac_text. Neben „12,5" stünde dann „25/2" — derselbe Wert in
-- anderer Schrift, also eine zweite richtige Kachel. Und die Nachbarn
-- liegen dort eine GANZE Zahl auseinander; bei Kommazahlen gehört der
-- Nachbar an die letzte Stelle.
--
-- Entdoppelt wird wie überall nach WERT (clash_choice_key), nicht nach
-- Text: eine Regel, nicht zwei.
create or replace function clash_dec_choices(p_answer text, p_distract jsonb,
                                             p_count int, p_places int)
  returns jsonb
  language plpgsql
as $$
declare
  v_txt   text[] := array[p_answer];
  v_keys  text[] := array[clash_choice_key(p_answer, false)];
  v_p     int    := greatest(coalesce(p_places, 0), 0);
  v_unit  bigint := power(10, greatest(coalesce(p_places, 0), 0))::bigint;
  v_scale bigint;
  a       jsonb;
  d       text;
  k       text;
  cand    text;
  i       int := 1;
  delta   bigint;
begin
  for d in
    select value
      from jsonb_array_elements_text(coalesce(p_distract, '[]'::jsonb))
     where value is not null
     order by random()
  loop
    exit when array_length(v_txt, 1) >= p_count;
    k := clash_choice_key(d, false);
    if k is not null and not (k = any(v_keys)) then
      v_txt  := v_txt  || d;
      v_keys := v_keys || k;
    end if;
  end loop;

  -- Auffüllen mit Nachbarn an der letzten Stelle: bei zwei
  -- Nachkommastellen ist der Nachbar von 12,50 die 12,51 und nicht 13,50.
  a := clash_parse_answer(p_answer);
  if a is not null and (a->>'n')::bigint * v_unit % (a->>'d')::bigint = 0 then
    v_scale := (a->>'n')::bigint * v_unit / (a->>'d')::bigint;
    while array_length(v_txt, 1) < p_count and i <= 60 loop
      delta := case when i % 2 = 1 then (i + 1) / 2 else -(i / 2) end;
      cand  := clash_dec_text(v_scale + delta, v_p);
      k     := clash_choice_key(cand, false);
      if k is not null and not (k = any(v_keys)) then
        v_txt  := v_txt  || cand;
        v_keys := v_keys || k;
      end if;
      i := i + 1;
    end loop;
  end if;

  select array_agg(t order by random()) into v_txt from unnest(v_txt) t;
  return to_jsonb(v_txt);
end;
$$;

revoke all on function clash_dec_choices(text, jsonb, int, int) from public;

comment on function clash_dec_choices(text, jsonb, int, int) is
  'Antwortkacheln für Aufgaben mit Kommazahlen: richtige Antwort + typische Fehler, entdoppelt '
  'nach Wert, aufgefüllt mit Nachbarn an der letzten Stelle. Alles in derselben Schreibweise '
  'wie die Antwort (clash_dec_text) — sonst stünde derselbe Wert zweimal da.';


-- ─────────────────────────────────────────────────────────────
-- 8) Ein Würfel für ganze Zahlen
-- ─────────────────────────────────────────────────────────────
create or replace function clash_rnd_int(p_lo bigint, p_hi bigint)
  returns bigint
  language sql
as $$
  select case when p_hi <= p_lo then p_lo
              else p_lo + floor(random() * (p_hi - p_lo + 1))::bigint end;
$$;

revoke all on function clash_rnd_int(bigint, bigint) from public;


-- Welche Zusatztasten die Grundrechenarten brauchen. Sie hängen an den
-- SCHALTERN und nicht an der einzelnen Ziehung: sonst käme das
-- Vorzeichen zwischen zwei Aufgaben und ginge wieder, und das Kind
-- suchte eine Taste, die es eben noch gab.
create or replace function clash_basics_keys(p_neg boolean, p_rat boolean)
  returns jsonb
  language sql
  immutable
as $$
  select to_jsonb(
    (case when coalesce(p_neg, false) then array['sign'] else '{}'::text[] end) ||
    (case when coalesce(p_rat, false) then array['dec']  else '{}'::text[] end));
$$;

revoke all on function clash_basics_keys(boolean, boolean) from public;


-- ─────────────────────────────────────────────────────────────
-- 9) a) und b) — Addition und Subtraktion
-- ─────────────────────────────────────────────────────────────
-- Eine Funktion für beide Zahlenräume, weil sie sich nur in drei Zahlen
-- unterscheiden:
--   a)  clash_gen_addsub(  100,  100, 1, …)   ganzzahlig bis 100,
--                                             mit Komma bis 100,0
--   b)  clash_gen_addsub(10000, 1000, 2, …)   ganzzahlig bis 10 000,
--                                             mit Komma bis 1000,00
--
-- Gezogen wird IMMER a + c; ob „a + b" oder „a - b" dasteht, entscheidet
-- sich erst beim Aufschreiben (b := -c). Das spart die zweite
-- Zahlenraum-Rechnung: die Grenzen gelten für a, c und die Summe, und
-- die Subtraktion erbt sie.
--
-- Der Bereich für c wird ausgerechnet und nicht erwürfelt-und-verworfen:
-- eine Ablehnungsschleife in einer Funktion, die pro Spielzug einmal
-- läuft, ist eine Wette auf den Zufall.
create or replace function clash_gen_addsub(p_int_max int, p_dec_max int, p_places int,
                                            p_neg boolean, p_rat boolean)
  returns jsonb
  language plpgsql
as $$
declare
  -- ⚠️ Die Reihenfolge im DECLARE trägt: v_unit und v_lim rechnen mit
  -- v_p, und PL/pgSQL wertet die Vorbelegungen von oben nach unten aus.
  v_rat  boolean := coalesce(p_rat, false) and random() < 0.5;
  v_p    int     := case when v_rat then p_places else 0 end;
  v_unit bigint  := power(10, v_p)::bigint;
  v_lim  bigint  := (case when v_rat then p_dec_max else p_int_max end)::bigint * v_unit;
  v_plus boolean := random() < 0.5;
  a      bigint;
  c      bigint;
  b      bigint;
  s      bigint;
  lo     bigint;
  hi     bigint;
begin
  if coalesce(p_neg, false) and random() < 0.4 then
    -- Mit negativen Zahlen: a irgendwo im Zahlenraum, c so, dass die
    -- Summe drinbleibt. Beide Grenzen zugleich — deshalb greatest/least.
    a := clash_rnd_int(-v_lim, v_lim);
    if a = 0 then a := v_unit; end if;
    lo := greatest(-v_lim, -v_lim - a);
    hi := least(v_lim, v_lim - a);
    c  := clash_rnd_int(lo, hi);
    if c = 0 then c := case when hi > 0 then v_unit else -v_unit end; end if;
  elsif v_plus then
    a := clash_rnd_int(1, v_lim - 1);
    c := clash_rnd_int(1, v_lim - a);
  else
    -- Ohne negative Zahlen muss die Subtraktion aufgehen: c ist negativ
    -- und höchstens so groß wie a, das Ergebnis bleibt bei mindestens 1.
    a := clash_rnd_int(2, v_lim);
    c := -clash_rnd_int(1, a - 1);
  end if;

  s := a + c;
  b := case when v_plus then c else -c end;

  return jsonb_build_object(
    'text',     clash_dec_text(a, v_p)
                || case when v_plus then ' + ' else ' - ' end
                || clash_dec_paren(b, v_p),
    'answer',   clash_dec_text(s, v_p),
    'answer_n', s,
    'answer_d', v_unit,
    'places',   v_p,
    'keys',     clash_basics_keys(p_neg, p_rat),
    -- Typische Fehler, keine Zufallszahlen: der Zehner verrutscht, die
    -- Nachbarzahl, der klassische Übertrag (neun statt zehn), die
    -- verwechselte Rechenart und das übersehene Vorzeichen.
    'distract', jsonb_build_array(
      clash_dec_text(s + 10 * v_unit, v_p),
      clash_dec_text(s - 10 * v_unit, v_p),
      clash_dec_text(s + v_unit, v_p),
      clash_dec_text(s - v_unit, v_p),
      clash_dec_text(s + 9 * v_unit, v_p),
      clash_dec_text(a - c, v_p),
      clash_dec_text(abs(a) + abs(c), v_p))
  );
end;
$$;

revoke all on function clash_gen_addsub(int, int, int, boolean, boolean) from public;

comment on function clash_gen_addsub(int, int, int, boolean, boolean) is
  'Addition und Subtraktion in einem Zahlenraum. p_int_max gilt ganzzahlig, p_dec_max mit '
  'p_places Nachkommastellen. p_neg lässt negative Zahlen zu, p_rat Kommazahlen — beide '
  'ERWEITERN nur, der ganzzahlige positive Fall kommt weiterhin vor.';


-- ─────────────────────────────────────────────────────────────
-- 10) c) — das große Einmaleins, mal und geteilt
-- ─────────────────────────────────────────────────────────────
-- Die Division ist die Umkehraufgabe und geht deshalb immer auf:
-- gewürfelt werden die beiden Faktoren, aufgeschrieben wird das Produkt
-- geteilt durch den einen.
--
-- Mit Kommazahlen ist es dasselbe Einmaleins um eine Stelle verschoben
-- (Sönkes Vorgabe: „von 0,1*0,1 bis 2,0*2,0"). Die Faktoren haben dann
-- eine Nachkommastelle, das Produkt zwei — und bei der Division hat das
-- ERGEBNIS wieder eine. Deshalb trägt jede der beiden Richtungen ihre
-- eigene Stellenzahl.
create or replace function clash_gen_muldiv(p_neg boolean, p_rat boolean)
  returns jsonb
  language plpgsql
as $$
declare
  v_rat  boolean := coalesce(p_rat, false) and random() < 0.5;
  v_fp   int     := case when v_rat then 1 else 0 end;      -- Stellen der Faktoren
  v_fu   bigint  := case when v_rat then 10 else 1 end;     -- eine ganze Einheit
  v_mul  boolean := random() < 0.5;
  x      bigint  := clash_rnd_int(1, 20);   -- in Einheiten der letzten Stelle
  y      bigint  := clash_rnd_int(1, 20);
  v_prod bigint;
  v_ap   int;
  v_au   bigint;
  s      bigint;
  v_text text;
begin
  -- Das Vorzeichen sitzt am ERSTEN Faktor, wenn es geht: „-16 · 4" ist
  -- Sönkes eigenes Beispiel und braucht keine Klammer.
  if coalesce(p_neg, false) and random() < 0.4 then
    if random() < 0.5 then x := -x; else y := -y; end if;
  end if;

  v_prod := x * y;                                   -- Stellen: 2 * v_fp

  if v_mul then
    v_ap := 2 * v_fp;
    s    := v_prod;
    v_text := clash_dec_text(x, v_fp) || ' · ' || clash_dec_paren(y, v_fp);
  else
    v_ap := v_fp;
    s    := y;
    v_text := clash_dec_text(v_prod, 2 * v_fp) || ' : ' || clash_dec_paren(x, v_fp);
  end if;
  v_au := power(10, v_ap)::bigint;

  return jsonb_build_object(
    'text',     v_text,
    'answer',   clash_dec_text(s, v_ap),
    'answer_n', s,
    'answer_d', v_au,
    'places',   v_ap,
    'keys',     clash_basics_keys(p_neg, p_rat),
    -- Typische Fehler: ein Schritt der Reihe daneben, ein Verzähler beim
    -- Zusammenzählen, die verwechselte Rechenart, das übersehene
    -- Vorzeichen — und beim Teilen der Divisor selbst.
    'distract', case when v_mul then jsonb_build_array(
        clash_dec_text(v_prod + abs(x) * v_fu, v_ap),   -- eine Reihe zu weit
        clash_dec_text(v_prod - abs(x) * v_fu, v_ap),   -- eine Reihe zu kurz
        clash_dec_text(v_prod + abs(y) * v_fu, v_ap),
        clash_dec_text(v_prod - abs(y) * v_fu, v_ap),
        clash_dec_text(-v_prod, v_ap),                  -- Vorzeichen übersehen
        clash_dec_text((x + y) * v_fu, v_ap),           -- addiert statt malgenommen
        clash_dec_text(abs(v_prod), v_ap))
      else jsonb_build_array(
        clash_dec_text(x, v_ap),                        -- der Divisor statt des Ergebnisses
        clash_dec_text(s + 1, v_ap),                    -- Nachbar an der letzten Stelle
        clash_dec_text(s - 1, v_ap),
        clash_dec_text(-s, v_ap),                       -- Vorzeichen übersehen
        clash_dec_text(x + y, v_ap),                    -- addiert statt geteilt
        clash_dec_text(abs(s), v_ap),
        clash_dec_text(s * 2, v_ap))
      end
  );
end;
$$;

revoke all on function clash_gen_muldiv(boolean, boolean) from public;

comment on function clash_gen_muldiv(boolean, boolean) is
  'Das große Einmaleins bis 20·20 und die Umkehraufgabe dazu (die Division geht immer auf). '
  'Mit p_rat dasselbe Einmaleins um eine Stelle verschoben: 0,1·0,1 bis 2,0·2,0.';


-- ─────────────────────────────────────────────────────────────
-- 11) d) — Quadratzahlen bis 20
-- ─────────────────────────────────────────────────────────────
-- Beide Richtungen, wie bei Binär/Hex: mal 17^2, mal √289. Von den
-- Schaltern unberührt — Sönkes Vorgabe nennt für e) und f) ausdrücklich
-- nur a), b) und c).
create or replace function clash_gen_square()
  returns jsonb
  language plpgsql
as $$
declare
  n   bigint  := clash_rnd_int(2, 20);
  q   bigint  := n * n;
  fwd boolean := random() < 0.5;
begin
  if fwd then
    return jsonb_build_object(
      'text',     n::text || '^2',
      'answer',   q::text,
      'answer_n', q,
      'answer_d', 1,
      'places',   0,
      'keys',     to_jsonb('{}'::text[]),
      -- Mal zwei statt hoch zwei, die Nachbarquadrate, ein Verzähler.
      'distract', jsonb_build_array(
        (2 * n)::text,
        ((n + 1) * (n + 1))::text,
        ((n - 1) * (n - 1))::text,
        (q + n)::text,
        (q - n)::text,
        (q + 1)::text,
        (q - 1)::text));
  end if;

  return jsonb_build_object(
    'text',     '√' || q::text,
    'answer',   n::text,
    'answer_n', n,
    'answer_d', 1,
    'places',   0,
    'keys',     to_jsonb('{}'::text[]),
    -- Halbiert statt gewurzelt, Nachbarn, und die Zahl unter der Wurzel.
    'distract', jsonb_build_array(
      (q / 2)::text,
      (n + 1)::text,
      (n - 1)::text,
      (n + 2)::text,
      (n * 2)::text,
      q::text,
      (n * n * n)::text));
end;
$$;

revoke all on function clash_gen_square() from public;

comment on function clash_gen_square() is
  'Quadratzahlen bis 20, in beide Richtungen: 17^2 = ▢ und √289 = ▢.';


-- ─────────────────────────────────────────────────────────────
-- 12) Die Katalogzeilen
-- ─────────────────────────────────────────────────────────────
-- `add100` behält seinen Schlüssel, obwohl die Art jetzt auch
-- subtrahiert: ein Umbenennen würde jeden gespeicherten Pool ungültig
-- machen, denn clash_normalize_pool weist bei einem unbekannten
-- Schlüssel den GANZEN Pool zurück — die Lehrkraft fände ihre Auswahl
-- leer vor.
--
-- Die Schalterzeilen tragen allows_free = allows_mc = false: sie kennen
-- keinen Modus, und damit greift auch die vorhandene Prüfung in
-- clash_normalize_pool, falls doch jemand 'free' schickt.
insert into clash_task_types
  (key, group_key, group_label, label, short_label, example,
   sort_group, sort_item, allows_free, allows_mc, input_mode, keypad,
   choice_count, strict_reduced, derived, requires, answer_kind, ops,
   compare_as, keys, flag)
values
  ('add100',    'basics', 'Grundrechenarten', 'Addition/Subtraktion bis 100',
   '+ −', '37 + 48',
   1, 1, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'number', '{}', false),

  ('addsub10k', 'basics', 'Grundrechenarten', 'Addition/Subtraktion bis 10 000',
   '+ −', '4380 + 2745',
   1, 2, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'number', '{}', false),

  ('muldiv20',  'basics', 'Grundrechenarten', 'Mal und Geteilt (bis 20 · 20)',
   '· :', '13 · 17',
   1, 3, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'number', '{}', false),

  ('square20',  'basics', 'Grundrechenarten', 'Quadratzahlen (bis 20)',
   'n²', '17² · √289',
   1, 4, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'number', '{}', false),

  ('neg_on',    'basics', 'Grundrechenarten', 'Ganze Zahlen',
   '±', '12 − 40 = −28',
   1, 8, false, false, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'number', '{}', true),

  ('rat_on',    'basics', 'Grundrechenarten', 'Rationale Zahlen',
   '0,5', '1,5 · 1,1',
   1, 9, false, false, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'number', '{}', true)

on conflict (key) do update set
  group_key      = excluded.group_key,
  group_label    = excluded.group_label,
  label          = excluded.label,
  short_label    = excluded.short_label,
  example        = excluded.example,
  sort_group     = excluded.sort_group,
  sort_item      = excluded.sort_item,
  allows_free    = excluded.allows_free,
  allows_mc      = excluded.allows_mc,
  input_mode     = excluded.input_mode,
  keypad         = excluded.keypad,
  choice_count   = excluded.choice_count,
  strict_reduced = excluded.strict_reduced,
  derived        = excluded.derived,
  requires       = excluded.requires,
  answer_kind    = excluded.answer_kind,
  ops            = excluded.ops,
  compare_as     = excluded.compare_as,
  keys           = excluded.keys,
  flag           = excluded.flag;


-- ─────────────────────────────────────────────────────────────
-- 13) clash_new_question — Neu-Deklaration auf Basis 0117:234
-- ─────────────────────────────────────────────────────────────
-- Vier Änderungen, alles andere Wort für Wort wie in 0117:
--   · die Ziehung überspringt Schalterzeilen (`and not t.flag`)
--   · die beiden Schalter werden vor dem CASE gelesen
--   · vier neue Zweige im CASE
--   · die Kacheln kommen bei Kommazahlen aus clash_dec_choices
create or replace function clash_new_question(p_pool jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_key     text;
  v_type    clash_task_types;
  v_gen     jsonb;
  v_mode    text;
  v_kind    text;
  v_choices jsonb := null;
  v_input   text;
  v_neg     boolean;
  v_rat     boolean;
begin
  -- Gleichverteilt über die AKTIVEN Unterkategorien — und über die
  -- abgeleiteten, deren Bedingung gerade erfüllt ist. Schalter stehen
  -- zwar im Pool, sind aber keine Aufgabe (0118).
  with chosen as (
    select e.key, e.value
      from jsonb_each_text(coalesce(p_pool, '{}'::jsonb)) e
      join clash_task_types t on t.key = e.key and not t.derived and not t.flag
     where e.value in ('free', 'mc')
  ), extra as (
    select t.key,
           (select min(c.value) from chosen c where c.key = any(t.requires)) as value
      from clash_task_types t
     where t.derived
       and array_length(t.requires, 1) is not null
       and (select count(*) from chosen c where c.key = any(t.requires))
         = array_length(t.requires, 1)
       and (select count(distinct c.value) from chosen c where c.key = any(t.requires)) = 1
  )
  select c.key, c.value into v_key, v_mode
    from (select key, value from chosen
          union all
          select key, value from extra) c
   order by random()
   limit 1;

  -- Notnagel: lieber die Aufgabe von gestern als ein leerer
  -- Spielbildschirm.
  if v_key is null then
    v_key  := 'add100';
    v_mode := 'free';
  end if;

  select * into v_type from clash_task_types where key = v_key;

  v_mode := coalesce(v_mode, 'free');
  if v_mode = 'free' and not coalesce(v_type.allows_free, true) then v_mode := 'mc';   end if;
  if v_mode = 'mc'   and not coalesce(v_type.allows_mc,   true) then v_mode := 'free'; end if;

  v_kind := coalesce(v_type.compare_as, v_type.answer_kind, 'number');

  -- Die beiden Schalter der Grundrechenarten (0118). Sie erweitern die
  -- Aufgaben, sie ersetzen sie nicht — deshalb sind sie nur Argumente
  -- und keine eigenen Zweige.
  v_neg := (p_pool->>'neg_on') = 'on';
  v_rat := (p_pool->>'rat_on') = 'on';

  -- Nur jsonb im CASE, keine record-Variablen: PL/pgSQL wirft „record
  -- not assigned yet" auch für den Zweig, der gar nicht gewählt wird —
  -- und im Spiel sähe das aus wie „keine Verbindung"
  -- (Regel: feedback_plpgsql_record_in_case).
  v_gen := case v_key
             when 'add100'       then clash_gen_addsub(100, 100, 1, v_neg, v_rat)
             when 'addsub10k'    then clash_gen_addsub(10000, 1000, 2, v_neg, v_rat)
             when 'muldiv20'     then clash_gen_muldiv(v_neg, v_rat)
             when 'square20'     then clash_gen_square()
             when 'frac_addsub'  then clash_gen_frac_addsub()
             when 'frac_muldiv'  then clash_gen_frac_muldiv()
             when 'frac_reduce'  then clash_gen_frac_reduce()
             when 'frac_compare' then clash_gen_frac_compare()
             when 'num_bin'      then clash_gen_num_bin()
             when 'num_hex'      then clash_gen_num_hex()
             when 'num_binhex'   then clash_gen_num_binhex()
             when 'eq_solve'     then clash_gen_eq_solve()
             when 'term_expand'  then clash_gen_term_expand()
             when 'bin1'         then clash_gen_bin1()
             when 'bin2'         then clash_gen_bin2()
             when 'bin3'         then clash_gen_bin3()
             else clash_gen_addsub(100, 100, 1, v_neg, v_rat)
           end;

  if v_mode = 'mc' then
    if v_kind = 'digits' then
      v_choices := clash_num_choices(v_gen->>'answer', v_gen->'distract',
                                     coalesce(v_type.choice_count, 6),
                                     coalesce((v_gen->>'base_to')::int, 10),
                                     coalesce((v_gen->>'maxlen')::int, 8));
    elsif v_kind = 'term' then
      v_choices := clash_term_choices(v_gen->>'answer', v_gen->'distract',
                                      coalesce(v_type.choice_count, 6));
    elsif coalesce((v_gen->>'places')::int, 0) > 0 then
      -- 0118: Nachbarn an der letzten Stelle, Schreibweise mit Komma.
      v_choices := clash_dec_choices(v_gen->>'answer', v_gen->'distract',
                                     coalesce(v_type.choice_count, 6),
                                     (v_gen->>'places')::int);
    else
      v_choices := coalesce(
        v_gen->'choices_fixed',
        clash_q_choices(v_gen->>'answer', v_gen->'distract',
                        coalesce(v_type.choice_count, 6),
                        coalesce(v_type.strict_reduced, false)));
    end if;
    v_input := 'choice';
  else
    -- Das Tipp-Layout der AUFGABENART, nicht des Raums (0114).
    v_input := coalesce(v_type.keypad, v_type.input_mode, 'natural');
  end if;

  return jsonb_build_object(
    'type',      v_key,
    'mode',      v_mode,
    'input',     v_input,
    'kind',      v_kind,
    'text',      v_gen->>'text',
    'eq',        coalesce((v_gen->>'eq')::boolean, true),
    'choices',   v_choices,
    'answer',    v_gen->>'answer',
    'answer_n',  v_gen->'answer_n',
    'answer_d',  v_gen->'answer_d',
    'strict',    coalesce(v_type.strict_reduced, false),
    'base_from', v_gen->'base_from',
    'base_to',   v_gen->'base_to',
    'maxlen',    v_gen->'maxlen',
    'var',       v_gen->'var',
    'form',      v_gen->'form',
    'ops',       coalesce(nullif(v_gen->'keys', 'null'::jsonb),
                          to_jsonb(coalesce(v_type.keys, v_type.ops, '{}'::text[]))),
    'digits',    coalesce(v_gen->'digits', to_jsonb('0123456789'::text))
  );
end;
$$;

revoke all on function clash_new_question(jsonb) from public;

comment on function clash_new_question(jsonb) is
  'Zieht eine Aufgabe aus dem Pool und setzt sie fertig: Text, Modus, Tastenfreigabe, Kacheln. '
  'Seit 0118 werden Schalterzeilen übersprungen und den Generatoren der Grundrechenarten als '
  'Argument mitgegeben.';


-- ─────────────────────────────────────────────────────────────
-- 14) clash_room_start — Neu-Deklaration auf Basis 0110:1333
-- ─────────────────────────────────────────────────────────────
-- Eine Zeile anders: die Startsperre fragt clash_pool_has_task statt auf
-- das leere Objekt zu prüfen. Alles andere Wort für Wort wie in 0110.
create or replace function clash_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_room   skill_rooms;
  v_board  clash_boards;
  v_layout clash_layouts;
  v_count  int;
  v_pool   jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id for update;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'already_started');
  end if;

  -- 0110: Ohne Aufgaben gibt es kein Spiel. Der Abbruch steht hier und
  -- nicht erst in clash_new_question, weil eine Runde, die mit einer
  -- Ersatzaufgabe anfängt, für die Lehrkraft aussieht, als hätte ihre
  -- Auswahl funktioniert.
  -- 0118: „leer" heißt seither „keine ZIEHBARE Art" — ein Pool aus
  -- lauter Schaltern ist nicht das leere Objekt, hat aber nichts zu
  -- ziehen.
  v_pool := clash_normalize_pool(v_board.pool);
  if v_pool is null or not clash_pool_has_task(v_pool) then
    return jsonb_build_object('ok', false, 'error', 'pool_empty');
  end if;

  v_count := jsonb_array_length(v_board.factions);

  select * into v_layout from clash_layouts where team_count = v_count;
  if v_layout.team_count is null then
    return jsonb_build_object('ok', false, 'error', 'layout_missing');
  end if;

  -- Muss VOR clash_preview_teams greifen: die Vorschau rechnet
  -- `% b.team_count` und würde sonst auf einen veralteten Wert verteilen.
  update clash_boards set team_count = v_count where room_id = v_room.id;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );
  delete from clash_team_streaks where room_id = v_room.id;   -- 0106
  delete from clash_team_events  where room_id = v_room.id;   -- 0108

  insert into clash_tiles (room_id, r, c, owner_team, is_castle)
  select v_room.id, (t->>'r')::int, (t->>'c')::int, (t->>'slot')::int, false
    from jsonb_array_elements(v_layout.tiles) t;

  update clash_tiles ct
     set is_castle = true
    from jsonb_array_elements(v_layout.castles) cst
   where ct.room_id = v_room.id
     and ct.r = (cst->>'r')::int
     and ct.c = (cst->>'c')::int;

  -- clash_preview_teams liest hier NUR die online Teilnehmer (0094) —
  -- wer nicht online ist, bekommt keine Zeile und damit kein Team, bis
  -- er/sie online kommt (dann greift clash_ensure_player).
  -- clash_new_question ist volatile, wird also je Zeile neu ausgewertet:
  -- niemand bekommt die Aufgabe des Nachbarn.
  insert into clash_players (participant_id, team_index, current_q)
  select pt.participant_id, pt.team_index, clash_new_question(v_pool)
    from clash_preview_teams(v_room.id) pt;

  -- 0106: geteilte Team-Serie startet bei 0 für jedes Volk, unabhängig
  -- davon, ob im ersten Moment schon ein Spieler zugeordnet ist.
  insert into clash_team_streaks (room_id, team_index, streak)
  select v_room.id, gs.team_index, 0
    from generate_series(0, v_count - 1) as gs(team_index);

  update clash_boards
     set phase             = 'countdown',
         started_at        = now(),
         countdown_ends_at = now() + interval '5 seconds',
         match_ends_at     = null,
         grid_rows         = v_layout.rows,
         grid_cols         = v_layout.cols,
         initial_tiles     = jsonb_array_length(v_layout.tiles),   -- 0108
         winner_team       = null,
         ended_at          = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function clash_room_start(text) is
  'Startet die Runde: Board aus clash_layouts, Teams nach Sitzplatz, je Kind eine erste Aufgabe '
  'aus dem Pool. Seit 0110 Abbruch mit pool_empty, wenn keine Aufgabenart gewählt ist; seit 0118 '
  'zählen Schalterzeilen dabei nicht mit.';
