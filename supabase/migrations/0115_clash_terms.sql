-- ══════════════════════════════════════════════════════════════
-- Migration 0115 — Kingdoms of Mathoria: Terme und Gleichungen
-- ══════════════════════════════════════════════════════════════
-- Die vierte Oberkategorie, zwischen Bruchrechnung (0110) und
-- Zahlensystemen (0114) — und damit die Klassenstufen 7 bis 9:
--
--   Nach x auflösen        2x = 8y − 2x + 16   →   x = 2y + 4
--   Klammern auflösen      3(x + 4)            →   3x + 12
--   1./2./3. binomische Formel, je in BEIDE Richtungen
--
-- ── Was hier grundsätzlich dazukommt ───────────────────────────
-- Bis 0110 war eine Antwort ein WERT: „6/8" und „3/4" sind dasselbe.
-- Seit 0114 kann sie auch eine ZIFFERNFOLGE sein: „0011 0011" und
-- „11 0011" sind dasselbe. Ab hier kann sie ein POLYNOM sein:
--
--   a² + 2ab + b²   und   2ba + b² + a²   und   (a+b)²
--
-- sind dieselbe Sache — und trotzdem sind nicht alle drei dieselbe
-- Antwort. Bei „Klammern auflösen" ist die FORM die Aufgabe, genau wie
-- beim Kürzen (strict_reduced, 0110). Es braucht deshalb zweierlei:
--
--   1. einen Vergleich, der die Schreibweise wegrechnet
--      (clash_term_norm — der Zwilling von clash_num_norm)
--   2. eine Formbedingung je FRAGE (`form`), weil dieselbe
--      Aufgabenart in beide Richtungen fragt: ausmultiplizieren
--      verlangt eine Antwort OHNE Klammer, faktorisieren eine MIT.
--
-- ── Warum ein richtiger Parser und keine Textregel ─────────────
-- Der naheliegende Weg wäre, die Antwort als Zeichenkette zu
-- normalisieren (Leerzeichen weg, Summanden sortieren). Das trägt
-- genau so lange, bis jemand „2ba" statt „2ab" schreibt oder eine
-- Klammer stehen lässt. Ein Polynom ist dagegen ein Ding, das man
-- ausrechnen kann:
--
--   Polynom = jsonb-Objekt {Monom: Koeffizient}
--   4x² + 20x + 25  →  {"x2": 4, "x1": 20, "": 25}
--
-- Zwei Antworten sind gleich, wenn ihre Objekte gleich sind. Der
-- Parser ist iterativ (Shunting-Yard mit Stapel-Arrays), nicht
-- rekursiv: PL/pgSQL kann Rekursion, aber ein Parser, der seinen
-- Lesezeiger durch drei Ebenen reichen muss, ist hier die schlechtere
-- Wette als eine Schleife über eine Token-Liste.
--
-- Der Parser gibt bei JEDEM Fehler NULL zurück und wirft nie. Eine
-- Ausnahme mitten in clash_submit sähe im Spiel aus wie „keine
-- Verbindung" (dieselbe Überlegung wie bei den record-Variablen im
-- CASE, 0101/0103) — eine unverständliche Eingabe ist aber einfach
-- eine falsche Antwort.
--
-- ── Zwei neue Katalogspalten, kein DROP ────────────────────────
-- `answer_kind` trägt seit 0114 ein check (… in ('number','digits')),
-- `ops` ein check (ops <@ array[…]) ohne 'plus'. Beide zu weiten hieße
-- sie zu droppen. Also dasselbe Muster wie keypad/input_mode in 0114:
-- neue Spalte mit eigenem Check, die alte bleibt als toter Buchstabe
-- stehen, gelesen wird überall coalesce(neu, alt).
--
-- ── Die Tastatur bekommt genau eine Taste ──────────────────────
-- Zum Tippen von „a^2+2ab+b^2" fehlt heute das Pluszeichen. Es teilt
-- sich im Client den Platz mit dem Minus, so wie „(" und ")" sich seit
-- 0114 einen teilen. Kein neues Tastaturlayout: die Term-Arten stehen
-- auf keypad = 'natural' und nennen 'plus' in `keys`. Bei allen
-- bestehenden Aufgabenarten steht es nicht drin, dort bleibt die Taste
-- ausgegraut — dieselbe Mechanik, die bei einer Binäraufgabe die 2…9
-- abschaltet.
--
-- ⚠️ Das Antwort-Polynom wird NICHT in der Frage gespeichert, sondern
-- bei der Prüfung aus `answer` neu geparst. clash_q_public (0110) ist
-- eine Streichliste (`p_q - 'answer' - …`) — ein neues Lösungsfeld
-- müsste dort eingetragen werden, und ein vergessener Eintrag wäre die
-- Lösung auf dem Tablet.
--
-- ⚠️ Neu deklariert werden clash_new_question und clash_answer_matches,
-- beide auf Grundlage der HÖCHSTEN bestehenden Fassung (0114)
-- (Regel: feedback_shop_state_merge_regressions).
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- Seed mit `on conflict … do update` (Regel:
-- feedback_stale_reference_data_do_nothing).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Zwei neue Katalogspalten
-- ─────────────────────────────────────────────────────────────
alter table clash_task_types add column if not exists compare_as text;
alter table clash_task_types add column if not exists keys       text[];

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname  = 'clash_task_types_compare_as_ck'
       and conrelid = 'public.clash_task_types'::regclass
  ) then
    alter table clash_task_types
      add constraint clash_task_types_compare_as_ck
      check (compare_as is null or compare_as in ('number', 'digits', 'term'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname  = 'clash_task_types_keys_ck'
       and conrelid = 'public.clash_task_types'::regclass
  ) then
    alter table clash_task_types
      add constraint clash_task_types_keys_ck
      check (keys is null or
             keys <@ array['sign', 'plus', 'dec', 'frac', 'exp', 'paren', 'vars']);
  end if;
end $$;

comment on column clash_task_types.compare_as is
  'Wie eine Antwort verglichen wird: number = Wert (6/8 = 3/4) · digits = Ziffernfolge '
  '(clash_num_norm) · term = Polynom (clash_term_norm). Löst answer_kind ab (dessen Check kennt '
  'die ersten beiden) — gelesen wird coalesce(compare_as, answer_kind, ''number'').';
comment on column clash_task_types.answer_kind is
  'Tot seit 0115 — abgelöst durch compare_as. Bleibt stehen, weil hier nichts gedroppt wird.';
comment on column clash_task_types.keys is
  'Welche ZUSATZTASTEN diese Aufgabenart braucht: sign · plus · dec · frac · exp · paren · vars. '
  'Löst ops ab (dessen Check kennt ''plus'' nicht) — gelesen wird coalesce(keys, ops, ''{}''). '
  'Alles, was nicht hier steht, ist bei ihren Aufgaben ausgegraut.';
comment on column clash_task_types.ops is
  'Tot seit 0115 — abgelöst durch keys. Bleibt stehen, weil hier nichts gedroppt wird.';

-- Die Zahlensysteme rücken eine Stelle weiter: „Terme und Gleichungen"
-- gehört zwischen Bruchrechnung und Zahlensysteme (Sönkes Vorgabe).
-- Ein gezieltes UPDATE statt eines vollständigen Seeds — sonst müsste
-- hier jede andere Spalte der drei Zeilen mitgeschleppt werden.
update clash_task_types set sort_group = 4 where group_key = 'numsys';


-- ─────────────────────────────────────────────────────────────
-- 2) Das Term-Handwerkszeug
-- ─────────────────────────────────────────────────────────────
-- Alles neu. Das Bruch-Handwerkszeug (0110) und das Zahlen-Handwerkszeug
-- (0114) werden nicht angefasst.
--
-- Ein MONOM ist eine Zeichenkette aus Variable und Exponent, alphabetisch
-- sortiert: „a2b1" ist a²b, „" (leer) ist die Konstante. Ein POLYNOM ist
-- ein jsonb-Objekt {Monom: Koeffizient}; Koeffizient 0 kommt darin nie
-- vor, das leere Objekt ist die Null.
--
-- Die Sortierung im Monom-Schlüssel ist der ganze Trick: sie macht
-- „ab" und „ba" zu derselben Zeichenkette, bevor irgendwer vergleicht.

-- Zwei Monome multiplizieren: Exponenten je Variable addieren.
create or replace function clash_mono_mul(p_a text, p_b text)
  returns text
  language sql
  immutable
as $$
  with m as (
    select regexp_matches(coalesce(p_a, '') || coalesce(p_b, ''),
                          '([a-z])([0-9]+)', 'g') as g
  ), parts as (
    select g[1] as v, g[2]::int as e from m
  ), sums as (
    select v, sum(e) as e from parts group by v
  )
  select coalesce(string_agg(v || e::text, '' order by v), '') from sums;
$$;

revoke all on function clash_mono_mul(text, text) from public;

-- Der Grad eines Monoms (Summe der Exponenten) — er sortiert die
-- Normalform: erst x², dann x, dann die Zahl.
create or replace function clash_mono_deg(p_key text)
  returns int
  language sql
  immutable
as $$
  with m as (
    select regexp_matches(coalesce(p_key, ''), '([a-z])([0-9]+)', 'g') as g
  )
  select coalesce(sum((g[2])::int), 0)::int from m;
$$;

revoke all on function clash_mono_deg(text) from public;

/* Der Sortierschlüssel eines Monoms — er allein entscheidet, in welcher
   Reihenfolge die Summanden dastehen, und das ist keine Kleinigkeit:
   clash_term_render setzt damit nicht nur den Vergleichsschlüssel,
   sondern auch die ANTWORTKACHELN. „2ab+a^2+b^2" wäre richtig und
   sähe trotzdem falsch aus.

   Gewollt ist die Schulbuch-Reihenfolge a² · 2ab · b²: Variablen
   alphabetisch aufsteigend, ihre Exponenten aber absteigend. Deshalb
   steht im Schlüssel 99 − Exponent:

     a2    → „a97"          a97    <  a98b98  <  b97
     a1b1  → „a98b98"
     b2    → „b97"                                          */
create or replace function clash_mono_sort(p_key text)
  returns text
  language sql
  immutable
as $$
  with m as (
    select regexp_matches(coalesce(p_key, ''), '([a-z])([0-9]+)', 'g') as g
  ), parts as (
    select g[1] as v, g[2]::int as e from m
  )
  select coalesce(string_agg(v || lpad(greatest(99 - e, 0)::text, 2, '0'),
                             '' order by v), '')
    from parts;
$$;

revoke all on function clash_mono_sort(text) from public;

-- Ein Monom als Text: „a2b1" wird „a^2b". Der Exponent 1 steht nicht da.
create or replace function clash_mono_text(p_key text)
  returns text
  language sql
  immutable
as $$
  with m as (
    select regexp_matches(coalesce(p_key, ''), '([a-z])([0-9]+)', 'g') as g
  ), parts as (
    select g[1] as v, g[2]::int as e from m
  )
  select coalesce(string_agg(v || case when e = 1 then '' else '^' || e::text end,
                             '' order by v), '')
    from parts;
$$;

revoke all on function clash_mono_text(text) from public;


-- Addieren (p_sign = -1 subtrahiert). Nullen fallen dabei heraus — das
-- ist die einzige Stelle, an der ein Polynom aufgeräumt wird, und
-- deshalb läuft alles andere hier durch.
create or replace function clash_poly_add(p_a jsonb, p_b jsonb, p_sign int default 1)
  returns jsonb
  language sql
  immutable
as $$
  with e as (
    select key, value::bigint as v
      from jsonb_each_text(coalesce(p_a, '{}'::jsonb))
    union all
    select key, coalesce(p_sign, 1)::bigint * value::bigint
      from jsonb_each_text(coalesce(p_b, '{}'::jsonb))
  ), s as (
    select key, sum(v) as v from e group by key having sum(v) <> 0
  )
  select coalesce(jsonb_object_agg(key, v), '{}'::jsonb) from s;
$$;

revoke all on function clash_poly_add(jsonb, jsonb, int) from public;

-- Aufräumen ohne zu rechnen: „addiere die Null" wirft die Monome mit
-- Koeffizient 0 hinaus. Die Generatoren bauen ihre Polynome von Hand
-- mit jsonb_build_object und brauchen das.
create or replace function clash_poly_norm(p jsonb)
  returns jsonb
  language sql
  immutable
as $$
  select clash_poly_add(p, '{}'::jsonb, 1);
$$;

revoke all on function clash_poly_norm(jsonb) from public;

create or replace function clash_poly_mul(p_a jsonb, p_b jsonb)
  returns jsonb
  language sql
  immutable
as $$
  with e as (
    select clash_mono_mul(a.key, b.key) as key,
           a.value::bigint * b.value::bigint as v
      from jsonb_each_text(coalesce(p_a, '{}'::jsonb)) a,
           jsonb_each_text(coalesce(p_b, '{}'::jsonb)) b
  ), s as (
    select key, sum(v) as v from e group by key having sum(v) <> 0
  )
  select coalesce(jsonb_object_agg(key, v), '{}'::jsonb) from s;
$$;

revoke all on function clash_poly_mul(jsonb, jsonb) from public;

-- Eine Zahl als Polynom. Die Null ist das leere Objekt und nicht
-- {"": 0} — sonst gäbe es zwei Schreibweisen für dieselbe Null und der
-- Vergleich zweier Objekte wäre nicht mehr die ganze Wahrheit.
create or replace function clash_poly_num(p_v bigint)
  returns jsonb
  language sql
  immutable
as $$
  select case when coalesce(p_v, 0) = 0 then '{}'::jsonb
              else jsonb_build_object('', p_v) end;
$$;

revoke all on function clash_poly_num(bigint) from public;

-- Der Wert eines Polynoms, wenn es eine reine Zahl ist — sonst NULL.
-- Nur der Exponent braucht das: „a^b" ist keine Aufgabe dieser Welt.
create or replace function clash_poly_const(p jsonb)
  returns bigint
  language sql
  immutable
as $$
  select case
    when p is null then null
    when p = '{}'::jsonb then 0::bigint
    when (select count(*) from jsonb_object_keys(p)) = 1 and p->'' is not null
      then (p->>'')::bigint
    else null
  end;
$$;

revoke all on function clash_poly_const(jsonb) from public;

create or replace function clash_poly_pow(p jsonb, p_n int)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  r jsonb := clash_poly_num(1);
  i int;
begin
  if p_n is null or p_n < 0 or p_n > 4 then
    return null;
  end if;
  for i in 1 .. p_n loop
    r := clash_poly_mul(r, p);
  end loop;
  return r;
end;
$$;

revoke all on function clash_poly_pow(jsonb, int) from public;

-- Steht diese Variable im Polynom? Die Monom-Schlüssel tragen nur
-- Kleinbuchstaben und Ziffern, deshalb ist ein Teilstring-Vergleich
-- hier eindeutig.
create or replace function clash_poly_has_var(p jsonb, p_var text)
  returns boolean
  language sql
  immutable
as $$
  select coalesce(p_var, '') <> '' and exists (
    select 1 from jsonb_object_keys(coalesce(p, '{}'::jsonb)) k
     where k like '%' || p_var || '%');
$$;

revoke all on function clash_poly_has_var(jsonb, text) from public;


-- Der Rang eines Operators. Das unäre Minus („~") steht über dem Mal
-- und unter der Hochzahl: „-a^2" ist −(a²) und nicht (−a)².
create or replace function clash_term_prec(p_op text)
  returns int
  language sql
  immutable
as $$
  select case p_op
           when '+' then 1
           when '-' then 1
           when '*' then 2
           when '~' then 3
           when '^' then 4
           else 0
         end;
$$;

revoke all on function clash_term_prec(text) from public;


/* Der Parser. Text → Polynom, oder NULL.

   Drei Durchgänge über dieselbe Zeichenkette:
     a) zerlegen        „2x+5"      → {#2, x, +, #5}
     b) ergänzen        implizites Mal („2x" ist 2·x) und das unäre
                        Minus („-a" ist ~a)
     c) umstellen       Shunting-Yard in umgekehrte polnische Notation,
                        dann mit einem Stapel ausrechnen

   Die Zahlen tragen im Token ein „#" vor sich: sonst wäre die Ziffer 2
   nicht von einem Operator zu unterscheiden, sobald jemand Tokens
   vergleicht.

   Erlaubt sind genau die Zeichen, die auf der Tastatur liegen — die
   fünf Variablen a, b, c, x, y und die Ziffern. Ein „d" ist deshalb
   kein unbekanntes Symbol, sondern eine falsche Antwort. */
create or replace function clash_term_parse(p_text text)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  s     text;
  n     int;
  i     int;
  ch    text;
  num   text;
  tok   text[] := '{}';
  tok2  text[] := '{}';
  rpn   text[] := '{}';
  ops   text[] := '{}';
  st    jsonb[] := '{}';
  prev  text;
  t     text;
  top   text;
  a     jsonb;
  b     jsonb;
  e     bigint;
begin
  s := lower(btrim(coalesce(p_text, '')));
  if s = '' or length(s) > 60 then
    return null;
  end if;

  -- Schreibweisen einsammeln, die dasselbe meinen: das typografische
  -- Minus (der Client zeigt es an), Mal in drei Fassungen, die
  -- hochgestellte Zwei und Drei.
  s := replace(s, '−', '-');
  s := replace(s, '–', '-');
  s := replace(s, '·', '*');
  s := replace(s, '×', '*');
  s := replace(s, '²', '^2');
  s := replace(s, '³', '^3');
  s := replace(s, ' ', '');

  if s !~ '^[0-9a-z+*^()-]+$' then return null; end if;
  -- Nur a, b, c, x, y sind Variablen. Alles andere zwischen d und z ist
  -- ein Vertipper (oder ein Wort — „kuerze" käme sonst als Produkt
  -- durch).
  if s ~ '[d-wz]' then return null; end if;

  -- a) zerlegen
  n := length(s);
  i := 1;
  while i <= n loop
    ch := substr(s, i, 1);
    if ch ~ '[0-9]' then
      num := '';
      while i <= n and substr(s, i, 1) ~ '[0-9]' loop
        num := num || substr(s, i, 1);
        i := i + 1;
      end loop;
      if length(num) > 6 then return null; end if;
      tok := tok || ('#' || num);
    else
      tok := tok || ch;
      i := i + 1;
    end if;
  end loop;
  if array_length(tok, 1) > 60 then return null; end if;

  -- b) ergänzen
  prev := null;
  foreach t in array tok loop
    -- Ein Vorzeichen-Plus am Anfang oder nach einer Klammer trägt keine
    -- Bedeutung („+a" ist a) und fiele sonst als Operator ohne linke
    -- Seite auf die Nase.
    if t = '+' and (prev is null or prev in ('(', '+', '-', '*', '^', '~')) then
      continue;
    end if;
    -- Implizites Mal: „2x", „3(x+4)", „(a+b)(a-b)", „x^2y"
    if prev is not null
       and (prev like '#%' or prev ~ '^[a-z]$' or prev = ')')
       and (t    like '#%' or t    ~ '^[a-z]$' or t    = '(') then
      tok2 := tok2 || '*';
    end if;
    if t = '-' and (prev is null or prev in ('(', '+', '-', '*', '^', '~')) then
      tok2 := tok2 || '~';
    else
      tok2 := tok2 || t;
    end if;
    prev := tok2[array_length(tok2, 1)];
  end loop;
  if array_length(tok2, 1) is null then return null; end if;

  -- c) umstellen
  foreach t in array tok2 loop
    if t like '#%' or t ~ '^[a-z]$' then
      rpn := rpn || t;
    elsif t = '(' then
      ops := ops || t;
    elsif t = ')' then
      loop
        if array_length(ops, 1) is null then return null; end if;   -- Klammer zu viel
        exit when ops[array_length(ops, 1)] = '(';
        rpn := rpn || ops[array_length(ops, 1)];
        ops := ops[1 : array_length(ops, 1) - 1];
      end loop;
      ops := ops[1 : array_length(ops, 1) - 1];
    else
      loop
        exit when array_length(ops, 1) is null;
        top := ops[array_length(ops, 1)];
        exit when top = '(';
        -- „^" und „~" binden nach rechts: bei gleichem Rang bleibt der
        -- obere Operator stehen. Sonst wäre „a^2^3" (a²)³.
        exit when not (clash_term_prec(top) > clash_term_prec(t)
                       or (clash_term_prec(top) = clash_term_prec(t)
                           and t not in ('^', '~')));
        rpn := rpn || top;
        ops := ops[1 : array_length(ops, 1) - 1];
      end loop;
      ops := ops || t;
    end if;
  end loop;
  while array_length(ops, 1) is not null loop
    if ops[array_length(ops, 1)] = '(' then return null; end if;     -- Klammer offen
    rpn := rpn || ops[array_length(ops, 1)];
    ops := ops[1 : array_length(ops, 1) - 1];
  end loop;

  -- ausrechnen
  foreach t in array rpn loop
    if t like '#%' then
      st := st || clash_poly_num(substr(t, 2)::bigint);
    elsif t ~ '^[a-z]$' then
      st := st || jsonb_build_object(t || '1', 1);
    elsif t = '~' then
      if coalesce(array_length(st, 1), 0) < 1 then return null; end if;
      st[array_length(st, 1)] := clash_poly_add('{}'::jsonb, st[array_length(st, 1)], -1);
    else
      if coalesce(array_length(st, 1), 0) < 2 then return null; end if;
      b  := st[array_length(st, 1)];
      a  := st[array_length(st, 1) - 1];
      st := st[1 : array_length(st, 1) - 2];
      if t = '+' then
        st := st || clash_poly_add(a, b, 1);
      elsif t = '-' then
        st := st || clash_poly_add(a, b, -1);
      elsif t = '*' then
        st := st || clash_poly_mul(a, b);
      elsif t = '^' then
        e := clash_poly_const(b);
        if e is null or e < 0 or e > 4 then return null; end if;
        st := st || clash_poly_pow(a, e::int);
      else
        return null;
      end if;
    end if;
  end loop;

  if coalesce(array_length(st, 1), 0) <> 1 then return null; end if;
  return st[1];
end;
$$;

revoke all on function clash_term_parse(text) from public;

comment on function clash_term_parse(text) is
  'Term → Polynom {Monom: Koeffizient}. NULL bei jedem Syntaxfehler, bei einer fremden Variablen, '
  'bei einem Exponenten über 4 und bei mehr als 60 Zeichen. Wirft nie — eine unverständliche '
  'Eingabe ist eine falsche Antwort, kein Fehler.';


-- Polynom → Normalform-Text: nach Grad absteigend, dann alphabetisch.
-- „a^2+2ab+b^2". Diese Zeichenkette ist der Vergleichsschlüssel und
-- zugleich das, was die Auffüll-Kacheln tragen.
create or replace function clash_term_render(p jsonb)
  returns text
  language plpgsql
  immutable
as $$
declare
  r    text := '';
  body text;
  c    bigint;
  rec  record;
begin
  if p is null then return null; end if;
  if p = '{}'::jsonb then return '0'; end if;
  for rec in
    select key as k, value::bigint as c
      from jsonb_each_text(p)
     order by clash_mono_deg(key) desc, clash_mono_sort(key) asc
  loop
    c    := rec.c;
    body := clash_mono_text(rec.k);
    if r = '' then
      r := case when c < 0 then '-' else '' end;
    else
      r := r || case when c < 0 then '-' else '+' end;
    end if;
    -- Die 1 vor einer Variablen schreibt niemand hin — vor nichts
    -- dagegen schon: die Konstante 1 ist „1".
    if abs(c) <> 1 or body = '' then
      r := r || abs(c)::text;
    end if;
    r := r || body;
  end loop;
  return r;
end;
$$;

revoke all on function clash_term_render(jsonb) from public;


-- Die EINE Stelle, die entscheidet, wann zwei Terme dasselbe sind —
-- für den Vergleich in clash_answer_matches UND für die Entdopplung
-- der Kacheln in clash_term_choices. Zwei Regelwerke, die auseinander-
-- laufen können, gibt es hier nicht (dieselbe Bauart wie
-- clash_num_norm in 0114).
create or replace function clash_term_norm(p_text text)
  returns text
  language sql
  immutable
as $$
  select clash_term_render(clash_term_parse(p_text));
$$;

revoke all on function clash_term_norm(text) from public;

comment on function clash_term_norm(text) is
  'Normalform eines Terms: „(a+b)^2", „2ba+b²+a²" und „a^2+2ab+b^2" ergeben dieselbe Zeichenkette. '
  'NULL, wenn es kein Term ist. Entscheidet über Richtig/Falsch und über doppelte Kacheln.';


-- ─────────────────────────────────────────────────────────────
-- 3) Die Kacheln für Terme
-- ─────────────────────────────────────────────────────────────
-- Zwilling von clash_num_choices (0114): entdoppelt über
-- clash_term_norm statt über den Wert.
--
-- ⚠️ Die Entdopplung über die Normalform streicht in der
-- Faktorisier-Richtung eine Kachel, die die ausmultiplizierte Form der
-- Lösung trägt. Das ist genau richtig: das ist die Aufgabe selbst,
-- nicht ein Fehler.
--
-- Aufgefüllt wird nur, wenn die Antwort KEINE Klammer trägt. Bei einer
-- faktorisierten Lösung wäre eine aufgefüllte Kachel eine ausmultipli-
-- zierte Summe zwischen lauter Produkten — sie wäre auszuschließen,
-- ohne zu rechnen. Die Generatoren liefern dort deshalb sieben
-- Fehler-Kacheln statt sechs; das Auffüllen ist die Notbremse für den
-- Fall, dass mehrere zusammenfallen.
create or replace function clash_term_choices(p_answer text, p_distract jsonb, p_count int)
  returns jsonb
  language plpgsql
as $$
declare
  v_txt  text[] := array[p_answer];
  v_keys text[] := array[clash_term_norm(p_answer)];
  v_ans  jsonb  := clash_term_parse(p_answer);
  d      text;
  k      text;
  cand   text;
  rec    record;
  i      int := 1;
  delta  int;
begin
  if v_keys[1] is null then
    -- Eine Antwort, die der eigene Parser nicht liest, ist ein Fehler
    -- im Generator. Lieber eine Kachel als eine Ausnahme im Spiel.
    return to_jsonb(v_txt);
  end if;

  for d in
    select value
      from jsonb_array_elements_text(coalesce(p_distract, '[]'::jsonb))
     where value is not null
     order by random()
  loop
    exit when array_length(v_txt, 1) >= p_count;
    k := clash_term_norm(d);
    if k is not null and not (k = any(v_keys)) then
      v_txt  := v_txt  || d;
      v_keys := v_keys || k;
    end if;
  end loop;

  -- Notbremse: einen Koeffizienten der richtigen Antwort verschieben.
  -- Genommen wird das Monom mit dem KLEINSTEN Grad — bei „4x^2+20x+25"
  -- ist das die 25, und eine falsche Konstante ist ein Fehler, den man
  -- machen kann. Ein verschobener Leitkoeffizient wäre einer, den
  -- niemand macht.
  if position('(' in p_answer) = 0 and v_ans is not null and v_ans <> '{}'::jsonb then
    select key as k into rec
      from jsonb_each_text(v_ans)
     order by clash_mono_deg(key) asc, key asc
     limit 1;
    while coalesce(array_length(v_txt, 1), 0) < p_count and i <= 40 loop
      delta := case when i % 2 = 1 then (i + 1) / 2 else -(i / 2) end;
      cand  := clash_term_render(
                 clash_poly_add(v_ans, jsonb_build_object(rec.k, delta), 1));
      k     := clash_term_norm(cand);
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

revoke all on function clash_term_choices(text, jsonb, int) from public;

comment on function clash_term_choices(text, jsonb, int) is
  'Antwortkacheln für Term-Aufgaben: richtige Antwort + typische Fehler, entdoppelt über '
  'clash_term_norm. Aufgefüllt wird nur bei klammerfreien Antworten — sonst stünde eine Summe '
  'zwischen lauter Produkten.';


-- ─────────────────────────────────────────────────────────────
-- 4) Die Generatoren
-- ─────────────────────────────────────────────────────────────
-- Form wie die Zahlensystem-Generatoren (0114). Zusätzliche Felder:
--
--   form    was für eine Antwort verlangt ist:
--             'expanded'  ohne Klammer (ausmultiplizieren)
--             'factored'  mit Klammer (als Produkt schreiben)
--             'solved'    ohne die gesuchte Variable (nach x auflösen)
--   var     die gesuchte Variable — sie steht im Eingabefeld vor dem
--           Gleichheitszeichen („x = ▢") und ist zugleich das, was in
--           der Antwort NICHT mehr vorkommen darf
--   maxlen  wie viele Zeichen eingetippt werden dürfen
--
-- Der Aufgabentext trägt Hochzahlen als „^2" — daraus macht der Client
-- die hochgestellte Ziffer, genau wie aus dem „_2" der Zahlensysteme
-- (0114) die tiefgestellte. Ein Term steht dabei IMMER ohne
-- Leerzeichen da: der Client trennt am Leerzeichen, und „3 (x + 4)"
-- wären vier Stücke statt eines Terms.

-- Eine Seite einer binomischen Formel: „2x", „x", „5", „-3y".
create or replace function clash_term_side(p_m int, p_var text)
  returns text
  language sql
  immutable
as $$
  select case when coalesce(p_var, '') = ''
              then p_m::text
              else clash_term_render(clash_poly_norm(
                     jsonb_build_object(p_var || '1', p_m))) end;
$$;

revoke all on function clash_term_side(int, text) from public;

-- Dieselbe Seite als Polynom.
create or replace function clash_term_side_poly(p_m int, p_var text)
  returns jsonb
  language sql
  immutable
as $$
  select case when coalesce(p_var, '') = ''
              then clash_poly_num(p_m)
              else clash_poly_norm(jsonb_build_object(p_var || '1', p_m)) end;
$$;

revoke all on function clash_term_side_poly(int, text) from public;


-- ── Nach x auflösen ────────────────────────────────────────────
-- Rückwärts gebaut, damit die Lösung ganzzahlig IST und nicht gehofft
-- wird (Sönkes Vorgabe: „die Ergebnisse sind immer ganzzahlig"):
--
--   Lösung würfeln       R = c₁·v + c₀
--   Abstand würfeln      d ∈ {1,2,3,4}
--   Gleichung bauen      p·x + A = q·x + B   mit p − q = d
--                        und B − A = d·R
--
-- Dann ist x = (B − A)/(p − q) = R, ohne dass irgendwo geteilt werden
-- müsste. c₁ ist oft 0 — dann steht eine gewöhnliche Gleichung mit
-- einer Unbekannten da und die Antwort ist eine Zahl.
create or replace function clash_gen_eq_solve()
  returns jsonb
  language plpgsql
as $$
declare
  v_vars  text[] := array['y', 'a', 'b'];
  v       text   := v_vars[1 + floor(random() * 3)::int];
  c1      int    := case when random() < 0.4 then 0
                         else (array[-3,-2,-1,1,2,3])[1 + floor(random() * 6)::int] end;
  c0      int    := -12 + floor(random() * 25)::int;    -- -12 .. 12
  d       int    := 1 + floor(random() * 4)::int;       -- 1 .. 4
  q       int    := -3 + floor(random() * 7)::int;      -- -3 .. 3
  p       int    := 0;
  a1      int    := -3 + floor(random() * 7)::int;
  a0      int    := -12 + floor(random() * 25)::int;
  b1      int;
  b0      int;
  v_res   jsonb;
  v_lhs   jsonb;
  v_rhs   jsonb;
begin
  -- ⚠️ Die Lösung x = 0 ist verboten. Nicht, weil sie falsch wäre,
  -- sondern weil an ihr die Fehler-Kacheln zusammenfallen: „das
  -- Vorzeichen gedreht", „nicht geteilt" und „die Teile vertauscht"
  -- sind bei der Null allesamt wieder die Null, und es blieben drei
  -- Kacheln statt sechs stehen.
  if c1 = 0 and c0 = 0 then
    c0 := 3 + floor(random() * 10)::int;
  end if;

  p  := q + d;
  b1 := a1 + d * c1;
  b0 := a0 + d * c0;

  v_res := clash_poly_norm(jsonb_build_object(v || '1', c1, '', c0));
  v_lhs := clash_poly_norm(jsonb_build_object('x1', p, v || '1', a1, '', a0));
  v_rhs := clash_poly_norm(jsonb_build_object('x1', q, v || '1', b1, '', b0));

  return jsonb_build_object(
    'text',     clash_term_render(v_lhs) || '=' || clash_term_render(v_rhs),
    'answer',   clash_term_render(v_res),
    'answer_n', null,
    'answer_d', null,
    'var',      'x',
    'form',     'solved',
    -- Das Gleichheitszeichen steht im Eingabefeld („x = ▢"), nicht
    -- zwischen Aufgabe und Feld — sonst stünde in der Zeile zweimal
    -- eines.
    'eq',       false,
    'maxlen',   24,
    'distract', jsonb_build_array(
      -- das Vorzeichen der Zahl gedreht — der häufigste Fehler beim
      -- Hinübertragen
      clash_term_render(clash_poly_norm(jsonb_build_object(v || '1',  c1, '', -c0))),
      -- am Ende nicht geteilt: die ganze Lösung trägt noch das d
      case when d > 1 then
        clash_term_render(clash_poly_norm(
          jsonb_build_object(v || '1', c1 * d, '', c0 * d))) end,
      -- die beiden Teile vertauscht
      case when c1 <> c0 then
        clash_term_render(clash_poly_norm(
          jsonb_build_object(v || '1', c0, '', c1))) end,
      -- alles negativ (Seiten verwechselt)
      clash_term_render(clash_poly_norm(jsonb_build_object(v || '1', -c1, '', -c0))),
      -- daneben. Vier Nachbarn statt zwei: bei c₀ = 0 fallen „Vorzeichen
      -- gedreht" und „alles negativ" mit der Lösung zusammen, und dann
      -- sind die Nachbarn alles, was die sechste Kachel noch füllt.
      clash_term_render(clash_poly_norm(jsonb_build_object(v || '1', c1, '', c0 + 1))),
      clash_term_render(clash_poly_norm(jsonb_build_object(v || '1', c1, '', c0 - 1))),
      clash_term_render(clash_poly_norm(jsonb_build_object(v || '1', c1, '', c0 + 2))),
      clash_term_render(clash_poly_norm(jsonb_build_object(v || '1', c1, '', c0 - 2))),
      -- die Variable vergessen
      case when c1 <> 0 then clash_term_render(clash_poly_num(c0)) end)
  );
end;
$$;

revoke all on function clash_gen_eq_solve() from public;


-- ── Klammern auflösen ──────────────────────────────────────────
-- Drei Gestalten, alle vom selben Bauplan k·(m·v ± n):
--   k > 1, v aus der Klammer heraus multipliziert   3(2x+5)
--   k = die Variable selbst                          x(3x+7)
--   k negativ                                       -4(x-3)
create or replace function clash_gen_term_expand()
  returns jsonb
  language plpgsql
as $$
declare
  v_vars text[] := array['x', 'a', 'y'];
  v      text   := v_vars[1 + floor(random() * 3)::int];
  shape  int    := 1 + floor(random() * 3)::int;   -- 1..3
  k      int    := 2 + floor(random() * 8)::int;   -- 2..9
  m      int    := 1 + floor(random() * 4)::int;   -- 1..4
  n      int    := 2 + floor(random() * 11)::int;  -- 2..12
  sg     int    := case when random() < 0.4 then -1 else 1 end;
  v_out  jsonb;                                    -- der Faktor vor der Klammer
  v_in   jsonb;                                    -- die Klammer
  v_lead text;                                     -- wie der Faktor dasteht
begin
  if shape = 3 then k := -k; end if;

  if shape = 2 then
    -- die Variable multipliziert die Klammer: x(3x+7)
    v_out  := clash_poly_norm(jsonb_build_object(v || '1', 1));
    v_lead := v;
  else
    v_out  := clash_poly_num(k);
    v_lead := case when k = 1 then '' when k = -1 then '-' else k::text end;
  end if;

  v_in := clash_poly_norm(jsonb_build_object(v || '1', m, '', sg * n));

  return jsonb_build_object(
    -- Das Anweisungswort steht davor und mit Leerzeichen abgesetzt, wie
    -- „kürze" seit 0112: der Client trennt am Leerzeichen und setzt
    -- Wörter klein in Serifenschrift, den Term daneben groß.
    'text',     'Klammern auflösen ' || v_lead || '(' || clash_term_render(v_in) || ')',
    'answer',   clash_term_render(clash_poly_mul(v_out, v_in)),
    'answer_n', null,
    'answer_d', null,
    'var',      null,
    'form',     'expanded',
    'maxlen',   24,
    'distract', jsonb_build_array(
      -- nur den vorderen Summanden multipliziert: 3(2x+5) → 6x+5
      clash_term_render(clash_poly_add(
        clash_poly_mul(v_out, clash_poly_norm(jsonb_build_object(v || '1', m))),
        clash_poly_num(sg * n), 1)),
      -- nur den hinteren: 3(2x+5) → 2x+15
      clash_term_render(clash_poly_add(
        clash_poly_norm(jsonb_build_object(v || '1', m)),
        clash_poly_mul(v_out, clash_poly_num(sg * n)), 1)),
      -- das Vorzeichen in der Klammer übersehen
      clash_term_render(clash_poly_mul(v_out,
        clash_poly_norm(jsonb_build_object(v || '1', m, '', -sg * n)))),
      -- den Faktor addiert statt multipliziert
      clash_term_render(clash_poly_add(v_out, v_in, 1)),
      -- eins daneben
      clash_term_render(clash_poly_add(
        clash_poly_mul(v_out, v_in), clash_poly_num(1), 1)),
      clash_term_render(clash_poly_add(
        clash_poly_mul(v_out, v_in), clash_poly_num(1), -1)),
      -- das Vorzeichen des Faktors übersehen
      clash_term_render(clash_poly_mul(
        clash_poly_add('{}'::jsonb, v_out, -1), v_in)))
  );
end;
$$;

revoke all on function clash_gen_term_expand() from public;


-- ── Die binomischen Formeln ────────────────────────────────────
-- Ein Bauplan für alle drei und für beide Richtungen. Die Seiten sind
-- je zur Hälfte reine Buchstaben („(a+b)²") und zur Hälfte mit Zahlen
-- („(2x+5)²") — Sönkes Vorgabe „erst a/b, dann mit Zahlen", gemischt
-- gezogen statt in zwei Unterkategorien getrennt.
--
--   p_kind 1   (A+B)² = A² + 2AB + B²
--   p_kind 2   (A−B)² = A² − 2AB + B²
--   p_kind 3   (A+B)(A−B) = A² − B²
--
-- Die Fehler-Kacheln sind die Fehler aus dem Klassenzimmer: das
-- Mittelglied fehlt, die 2 im Mittelglied fehlt, ein Vorzeichen kippt,
-- der Koeffizient wird nicht mitquadriert.
-- A² + mid·AB ± B², fertig gesetzt. Alle Fehler-Kacheln der
-- Ausmultiplizier-Richtung sind Zahlenpaare in diesem Bauplan — als
-- einzelne clash_poly_add-Ketten hingeschrieben wären sie neunmal
-- dieselbe Zeile mit je zwei anderen Vorzeichen, und ein falsches davon
-- fiele niemandem auf.
create or replace function clash_bin_mix(p_a2 jsonb, p_ab jsonb, p_b2 jsonb,
                                         p_mid int, p_bs int)
  returns text
  language sql
  immutable
as $$
  select clash_term_render(
    clash_poly_add(
      clash_poly_add(p_a2, clash_poly_mul(clash_poly_num(p_mid), p_ab), 1),
      p_b2, p_bs));
$$;

revoke all on function clash_bin_mix(jsonb, jsonb, jsonb, int, int) from public;

create or replace function clash_bin_shell(p_kind int, p_expand boolean,
                                           p_ma int, p_va text,
                                           p_mb int, p_vb text)
  returns jsonb
  language plpgsql
as $$
declare
  ta    text  := clash_term_side(p_ma, p_va);
  tb    text  := clash_term_side(p_mb, p_vb);
  pa    jsonb := clash_term_side_poly(p_ma, p_va);
  pb    jsonb := clash_term_side_poly(p_mb, p_vb);
  a2    jsonb := clash_poly_mul(pa, pa);
  b2    jsonb := clash_poly_mul(pb, pb);
  ab    jsonb := clash_poly_mul(pa, pb);
  -- A² mit dem einfachen statt dem quadrierten Koeffizienten — der
  -- Fehler „(2x+5)² = 2x²+…". Bei einer reinen Variablen ist es
  -- dasselbe wie a2, dann fällt die Kachel als Doppelte heraus.
  a2w   jsonb := case when coalesce(p_va, '') = '' then clash_poly_num(p_ma * p_ma)
                      else clash_poly_norm(jsonb_build_object(p_va || '2', p_ma)) end;
  -- das Mittelglied mit Vorzeichen: +2AB bei der ersten, −2AB bei der
  -- zweiten Formel
  sg    int   := case when p_kind = 2 then -1 else 1 end;
  fact  text;
  expd  text;
  dis   jsonb;
begin
  -- Wie die faktorisierte Form dasteht.
  fact := case p_kind
            when 3 then '(' || ta || '+' || tb || ')(' || ta || '-' || tb || ')'
            when 2 then '(' || ta || '-' || tb || ')^2'
            else        '(' || ta || '+' || tb || ')^2'
          end;

  -- … und die ausmultiplizierte.
  if p_kind = 3 then
    expd := clash_term_render(clash_poly_add(a2, b2, -1));
  else
    expd := clash_term_render(clash_poly_add(
              clash_poly_add(a2, clash_poly_mul(clash_poly_num(2 * sg), ab), 1),
              b2, 1));
  end if;

  if p_expand then
    /* Ausmultiplizieren: die Aufgabe ist das Produkt, gefragt ist die
       Summe.

       Die Fehler sind für alle drei Formeln DIESELBEN — es sind genau
       die Verwechslungen der drei untereinander plus die zwei Fehler,
       die man beim Anwenden macht (die 2 vergessen, ein Vorzeichen
       kippen). Sie deshalb je Formel anders zusammenzustellen wäre nicht
       nur mehr Arbeit, es wäre auch ein Wink: wer merkt, dass bei der
       dritten Formel nie ein Mittelglied unter den Kacheln steht,
       braucht sie nicht mehr zu rechnen.

       Die richtige Antwort ist selbst eine dieser Kombinationen und
       fällt in clash_term_choices über die Normalform heraus. */
    dis := jsonb_build_array(
      clash_bin_mix(a2, ab, b2,  0,  1),   -- Mittelglied fehlt
      clash_bin_mix(a2, ab, b2,  0, -1),   -- … und das Schlussglied negativ
      clash_bin_mix(a2, ab, b2,  2,  1),   -- als 1. Formel gerechnet
      clash_bin_mix(a2, ab, b2, -2,  1),   -- als 2. Formel gerechnet
      clash_bin_mix(a2, ab, b2,  1,  1),   -- die 2 im Mittelglied vergessen
      clash_bin_mix(a2, ab, b2, -1,  1),
      clash_bin_mix(a2, ab, b2,  2, -1),   -- Schlussglied mit falschem Vorzeichen
      clash_bin_mix(a2, ab, b2, -2, -1),
      -- den Koeffizienten nicht mitquadriert: (2x+5)² → 2x²+20x+25.
      -- a2w ist A² mit dem einfachen statt dem quadrierten Koeffizienten.
      case when p_ma not in (1, -1) and coalesce(p_va, '') <> '' then
        clash_bin_mix(a2w, ab, b2,
                      case when p_kind = 3 then  0 else 2 * sg end,
                      case when p_kind = 3 then -1 else 1      end) end,
      -- gar nicht quadriert, sondern verdoppelt
      clash_term_render(clash_poly_mul(clash_poly_num(2), clash_poly_add(pa, pb, sg))));

    return jsonb_build_object(
      'text',     fact,
      'answer',   expd,
      'answer_n', null, 'answer_d', null,
      'var',      null,
      'form',     'expanded',
      'maxlen',   24,
      'distract', dis);
  end if;

  -- faktorisieren: die Aufgabe ist die Summe, gefragt ist das Produkt.
  -- Alle Kacheln tragen deshalb selbst eine Klammer — eine Summe
  -- zwischen lauter Produkten wäre auszuschließen, ohne zu rechnen.
  dis := jsonb_build_array(
    case when p_kind <> 1 then '(' || ta || '+' || tb || ')^2' end,
    case when p_kind <> 2 then '(' || ta || '-' || tb || ')^2' end,
    case when p_kind <> 3 then '(' || ta || '+' || tb || ')(' || ta || '-' || tb || ')' end,
    '(' || ta || '+' || tb || ')^3',
    '(' || clash_term_side(p_ma + 1, p_va) || '+' || tb || ')^2',
    '(' || ta || '+' || clash_term_side(p_mb + 1, p_vb) || ')^2',
    '(' || ta || '-' || clash_term_side(p_mb + 1, p_vb) || ')^2',
    '(' || clash_term_side(p_ma + 1, p_va) || '-' || tb || ')^2');

  return jsonb_build_object(
    -- „als Produkt" muss dastehen: ohne die Anweisung wäre die
    -- Aufgabe „a^2+2ab+b^2 = ▢" mit sich selbst zu beantworten.
    'text',     'als Produkt ' || expd,
    'answer',   fact,
    'answer_n', null, 'answer_d', null,
    'var',      null,
    'form',     'factored',
    'maxlen',   24,
    'distract', dis);
end;
$$;

revoke all on function clash_bin_shell(int, boolean, int, text, int, text) from public;


-- Die drei Wrapper. Sie würfeln nur die Gestalt der beiden Seiten und
-- die Richtung — was daraus wird, steht im Bauplan darüber.
create or replace function clash_bin_draw(p_kind int)
  returns jsonb
  language plpgsql
as $$
declare
  v_a   text[] := array['a', 'x', 'a', 'x', 'y'];
  va    text   := v_a[1 + floor(random() * 5)::int];
  vb    text;
  ma    int    := 1;
  mb    int;
  pure  boolean := random() < 0.5;   -- reine Buchstabenform?
begin
  if pure then
    -- zweite Variable, immer eine andere als die erste
    vb := case va when 'a' then 'b' when 'x' then 'y' else 'x' end;
    ma := case when random() < 0.75 then 1 else 2 end;
    mb := case when random() < 0.75 then 1 else 2 end;
  else
    -- Zahl hinten, Koeffizient vorn
    vb := '';
    ma := 1 + floor(random() * 3)::int;    -- 1..3
    mb := 2 + floor(random() * 8)::int;    -- 2..9
  end if;

  return clash_bin_shell(p_kind, random() < 0.5, ma, va, mb, vb);
end;
$$;

revoke all on function clash_bin_draw(int) from public;

create or replace function clash_gen_bin1() returns jsonb language sql as $$ select clash_bin_draw(1); $$;
create or replace function clash_gen_bin2() returns jsonb language sql as $$ select clash_bin_draw(2); $$;
create or replace function clash_gen_bin3() returns jsonb language sql as $$ select clash_bin_draw(3); $$;

revoke all on function clash_gen_bin1() from public;
revoke all on function clash_gen_bin2() from public;
revoke all on function clash_gen_bin3() from public;


-- ─────────────────────────────────────────────────────────────
-- 5) Die fünf Katalogzeilen
-- ─────────────────────────────────────────────────────────────
-- Die Beispiele stehen so da, wie die Aufgabe gleich auf dem Telefon
-- steht (dieselbe Überlegung wie in 0112/0114) — nur mit den echten
-- hoch- und tiefgestellten Zeichen, weil die Auswahl-Tabelle keinen
-- Formelsatz hat.
--
-- `keys` folgt aus dem Generator, nicht aus dem Gefühl:
--   eq_solve     Zahlen, Variablen, + und −. Keine Hochzahl: die
--                Lösung einer linearen Gleichung ist linear.
--   term_expand  dazu die Hochzahl — x(3x+7) wird 3x²+7x.
--   bin1/2/3     dazu die Klammern: in der Faktorisier-Richtung IST
--                die Klammer die Antwort.
-- Der Bruchstrich fehlt überall: in dieser Aufgabenwelt wird nicht
-- geteilt (Sönkes Vorgabe „die Ergebnisse sind immer ganzzahlig").
insert into clash_task_types
  (key, group_key, group_label, label, short_label, example,
   sort_group, sort_item, allows_free, allows_mc, input_mode, keypad,
   choice_count, strict_reduced, derived, requires, answer_kind, ops,
   compare_as, keys)
values
  ('eq_solve',    'terms', 'Terme und Gleichungen', 'Nach x auflösen',
   'x =', '2x = 8y − 2x + 16',
   3, 1, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'term', '{sign,plus,vars}'),

  ('term_expand', 'terms', 'Terme und Gleichungen', 'Klammern auflösen',
   '( ) auf', '3(x + 4)',
   3, 2, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'term', '{sign,plus,exp,vars}'),

  ('bin1',        'terms', 'Terme und Gleichungen', '1. Binomische Formel',
   '(a+b)²', '(a + b)² = a² + 2ab + b²',
   3, 3, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'term', '{sign,plus,exp,paren,vars}'),

  ('bin2',        'terms', 'Terme und Gleichungen', '2. Binomische Formel',
   '(a−b)²', '(a − b)² = a² − 2ab + b²',
   3, 4, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'term', '{sign,plus,exp,paren,vars}'),

  ('bin3',        'terms', 'Terme und Gleichungen', '3. Binomische Formel',
   '(a+b)(a−b)', '(a + b)(a − b) = a² − b²',
   3, 5, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'term', '{sign,plus,exp,paren,vars}')
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
  keys           = excluded.keys;


-- ─────────────────────────────────────────────────────────────
-- 6) clash_new_question — Neu-Deklaration auf Basis 0114:1015
-- ─────────────────────────────────────────────────────────────
-- Vier Änderungen:
--   a) fünf neue Generatoren im case
--   b) die Vergleichsart kommt aus compare_as (Rückfall answer_kind),
--      die Kacheln bei 'term' aus clash_term_choices
--   c) die Zusatztasten aus keys (Rückfall ops)
--   d) zwei neue Felder in der Frage: `var` und `form`
--
-- Alles andere Wort für Wort wie in 0114.
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
begin
  -- Gleichverteilt über die AKTIVEN Unterkategorien — und über die
  -- abgeleiteten, deren Bedingung gerade erfüllt ist.
  with chosen as (
    select e.key, e.value
      from jsonb_each_text(coalesce(p_pool, '{}'::jsonb)) e
      join clash_task_types t on t.key = e.key and not t.derived
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

  -- Nur jsonb im CASE, keine record-Variablen: PL/pgSQL wirft „record
  -- not assigned yet" auch für den Zweig, der gar nicht gewählt wird —
  -- und im Spiel sähe das aus wie „keine Verbindung"
  -- (Regel: feedback_plpgsql_record_in_case).
  v_gen := case v_key
             when 'add100'       then clash_gen_add100()
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
             else clash_gen_add100()
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
    -- Die Felder der Zahlensysteme (0114). Bei Brüchen und Addition
    -- stehen sie auf null; der Client liest daraus „gibt es hier nicht".
    'base_from', v_gen->'base_from',
    'base_to',   v_gen->'base_to',
    'maxlen',    v_gen->'maxlen',
    -- Die Felder der Terme (0115). `var` steht im Eingabefeld vor dem
    -- Gleichheitszeichen, `form` sagt, welche GESTALT die Antwort haben
    -- muss — beides ist keine Lösung, beides darf ans Gerät.
    'var',       v_gen->'var',
    'form',      v_gen->'form',
    -- Welche ZUSATZTASTEN gelten. Seit 0115 aus `keys` (der Check von
    -- `ops` kennt 'plus' nicht), mit Rückfall auf ops.
    'ops',       to_jsonb(coalesce(v_type.keys, v_type.ops, '{}'::text[])),
    -- `digits` steht dagegen IMMER da (0114).
    'digits',    coalesce(v_gen->'digits', to_jsonb('0123456789'::text))
  );
end;
$$;

revoke all on function clash_new_question(jsonb) from public;

comment on function clash_new_question(jsonb) is
  'Zieht eine Aufgabe aus dem Pool des Raums: gleichverteilt über die aktiven Unterkategorien und '
  'über die abgeleiteten, deren requires vollzählig und mit demselben Wert im Pool stehen (0114). '
  'Seit 0115 mit Term-Aufgaben (kind = term, Felder var/form). Enthält die LÖSUNG — was an ein '
  'Gerät geht, muss durch clash_q_public.';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_answer_matches — Neu-Deklaration auf Basis 0114:1176
-- ─────────────────────────────────────────────────────────────
-- Ein Zweig davor, alles andere unverändert.
--
-- Bei Termen entscheidet zweierlei, und zwar in dieser Reihenfolge:
--
--   1. die GESTALT (`form`). „a^2+2ab+b^2" ist auf die Frage „als
--      Produkt: a^2+2ab+b^2" keine Antwort, sondern die Frage.
--   2. der WERT als Polynom. „2ba+b^2+a^2" ist dieselbe Antwort wie
--      „a^2+2ab+b^2", und „(b+a)^2" ist dieselbe wie „(a+b)^2".
--
-- ⚠️ Die Prüfung „stand die Kachel überhaupt auf dem Bildschirm?" bleibt
-- ein EXAKTER Vergleich gegen das Ausgelieferte. Sie ist der Riegel
-- gegen Raten am Client vorbei und darf gerade nicht großzügig sein.
create or replace function clash_answer_matches(p_q jsonb, p_answer text)
  returns boolean
  language plpgsql
  immutable
as $$
declare
  v text := btrim(coalesce(p_answer, ''));
  a jsonb;
  p jsonb;
begin
  if p_q is null or v = '' then
    return false;
  end if;

  if p_q->>'kind' = 'term' then
    if p_q->>'mode' = 'mc'
       and not (coalesce(p_q->'choices', '[]'::jsonb) @> to_jsonb(v)) then
      return false;
    end if;

    -- Die Gestalt. Sie hängt an der einzelnen FRAGE und nicht an der
    -- Aufgabenart: dieselbe binomische Formel fragt in beide
    -- Richtungen.
    if p_q->>'form' = 'expanded' and position('(' in v) > 0 then
      return false;
    end if;
    if p_q->>'form' = 'factored' and position('(' in v) = 0 then
      return false;
    end if;

    p := clash_term_parse(v);
    if p is null then
      return false;
    end if;
    -- Nach x auflösen: eine Antwort, in der das x noch steht, ist
    -- nicht aufgelöst — auch wenn sie stimmt.
    if p_q->>'form' = 'solved' and clash_poly_has_var(p, p_q->>'var') then
      return false;
    end if;

    return p = clash_term_parse(p_q->>'answer');
  end if;

  if p_q->>'kind' = 'digits' then
    if p_q->>'mode' = 'mc'
       and not (coalesce(p_q->'choices', '[]'::jsonb) @> to_jsonb(v)) then
      return false;
    end if;
    return clash_num_norm(v) is not null
       and clash_num_norm(v) = clash_num_norm(p_q->>'answer');
  end if;

  if p_q->>'mode' = 'mc' then
    -- Erst prüfen, ob die Kachel überhaupt auf dem Bildschirm stand:
    -- sonst könnte man am Client vorbei jede beliebige Zeichenkette
    -- einreichen und so lange raten, bis eine passt.
    if not (coalesce(p_q->'choices', '[]'::jsonb) @> to_jsonb(v)) then
      return false;
    end if;
    return v = (p_q->>'answer');
  end if;

  a := clash_parse_answer(v);
  if a is null or p_q->>'answer_n' is null then
    return false;
  end if;

  if coalesce((p_q->>'strict')::boolean, false) then
    -- Kürzen: die ENDFORM ist die Aufgabe. „6/8" ist hier falsch,
    -- obwohl es denselben Wert hat.
    return (a->>'raw_n')::int = (p_q->>'answer_n')::int
       and (a->>'raw_d')::int = (p_q->>'answer_d')::int;
  end if;

  -- Sonst zählt der Wert: wer 3/4 + 0 als 6/8 hinschreibt, hat richtig
  -- gerechnet. Beide Nenner sind positiv (clash_frac_norm), deshalb
  -- reicht das Kreuzprodukt ohne Fallunterscheidung.
  return (a->>'n')::int * (p_q->>'answer_d')::int
       = (p_q->>'answer_n')::int * (a->>'d')::int;
end;
$$;

revoke all on function clash_answer_matches(jsonb, text) from public;

comment on function clash_answer_matches(jsonb, text) is
  'Prüft eine Antwort gegen die gespeicherte Aufgabe. Terme (0115): erst die Gestalt (form), dann '
  'das Polynom — „2ba+b^2+a^2" = „a^2+2ab+b^2". Ziffernfolgen (0114): Normalform. Auswahl: die '
  'Kachel muss ausgeliefert worden sein. Kürzen: Endform exakt. Sonst: gleicher Wert (6/8 = 3/4).';
