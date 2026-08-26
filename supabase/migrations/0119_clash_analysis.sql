-- ═══════════════════════════════════════════════════════════════
-- 0119 · Kingdoms of Mathoria — Oberkategorie „Analysis"
-- ═══════════════════════════════════════════════════════════════
--
-- Sönke am 26.08.2026: „Noch eine neue Oberkategorie: Analysis, mit
-- Ableitungen bilden und Stammfunktionen bilden. Wir bleiben bei
-- Polynomen bis maximal hoch 4. Es steht da immer eine Funktion
-- f(x)=…, und darunter steht entweder f'(x)=[] bzw. F(x)=[]. Auch die
-- Funktionsnamen g und h sind möglich, und als Variable kann auch a
-- oder b kommen. Vor den Variablen stehen ganze Zahlen, Kommazahlen
-- (max. 1 Nachkommastelle) oder leichte Brüche (maximal bis Achtel).
-- Der User gibt dann die Stammfkt oder Ableitung ein."
--
-- Abgestimmt dazu:
--   · f darf bis Grad 4 gehen — F wird dann eben Grad 5.
--   · „+ C" wird NICHT verlangt. Wer eine beliebige Konstante
--     dazuschreibt (auch „+5"), hat trotzdem recht.
--   · Beide Modi: tippen und Antwortkacheln.
--
-- ── Warum das nicht mit der Polynom-Schicht aus 0115 geht ──────────
--
-- Dort ist ein Polynom {Monom: Koeffizient} mit GANZZAHLIGEM
-- Koeffizienten (`value::bigint`). Die Stammfunktion von x² ist ⅓x³ —
-- Drittel sind in keiner Dezimaldarstellung exakt, und „ungefähr
-- gleich" ist als Antwortprüfung keine Option.
--
-- Statt die vorhandene Schicht umzubauen (und damit „Terme und
-- Gleichungen" anzufassen, das seit 0115/0116/0117 läuft), bekommt
-- Analysis eine eigene Darstellung, die die alte WIEDERVERWENDET:
--
--     ein rationales Polynom  =  {"p": <ganzzahliges Polynom>, "d": N}
--
-- also ein gemeinsamer Nenner vor der ganzen Klammer. ⅓x³+2x ist
-- {"p": {"x3": 1, "x1": 6}, "d": 3}. Damit rechnen clash_poly_add und
-- clash_poly_mul aus 0115 unverändert weiter, und der Vergleich zweier
-- Brüche ist wie überall in diesem Werkzeug ein Kreuzprodukt.
--
-- ── Was NICHT dazukommt ───────────────────────────────────────────
--
-- Kein neuer `compare_as`-Wert: dessen CHECK müsste dafür erweitert
-- werden, und Erweitern hieße nach Hausregel eine neue Spalte. Die
-- Analysis-Aufgaben tragen `kind = 'term'` wie die anderen Term-Arten
-- (der Client braucht davon nur den Term-Puffer in der Eingabe) und
-- unterscheiden sich über `form` — ein freies Feld an der FRAGE.
--
-- ⚠️ Überlauf: die alten Grenzen (Zahl bis 6 Stellen, Hochzahl bis 4)
-- lassen rechnerisch 10^24 zu und damit mehr, als ein bigint trägt.
-- Hier wird deshalb VOR jeder Multiplikation in `numeric` geschätzt und
-- lieber NULL zurückgegeben — ein Parser gibt NULL zurück, er wirft
-- nicht (eine Ausnahme mitten in clash_submit sieht im Spiel aus wie
-- „keine Verbindung").
--
-- ⚠️ `arr || 'x'::text` mit ausdrücklichem Typ, sonst „malformed array
-- literal" (Regel: feedback_plpgsql_array_append_literal).
--
-- Jede Funktion auf Grundlage ihrer HÖCHSTEN Fassung neu deklariert;
-- Referenzdaten mit `do update set`; kein DROP.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Rationale Polynome: bauen und aufräumen
-- ─────────────────────────────────────────────────────────────
-- Die einzige Stelle, an der ein rationales Polynom entsteht. Sie legt
-- drei Dinge fest, damit der Vergleich zweier Objekte mit „=" die ganze
-- Wahrheit sagt:
--   · der Nenner ist positiv (das Vorzeichen sitzt im Zähler),
--   · gekürzt wird mit dem ggT ALLER Koeffizienten und des Nenners,
--   · die Null ist {"p": {}, "d": 1} und nichts anderes.
create or replace function clash_rat_make(p_p jsonb, p_d bigint)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  v_p   jsonb  := coalesce(p_p, '{}'::jsonb);
  v_d   bigint := p_d;
  v_g   bigint;
  v_max numeric := 0;
  rec   record;
begin
  if p_p is null or v_d is null or v_d = 0 then
    return null;
  end if;

  if v_d < 0 then
    v_p := clash_poly_add('{}'::jsonb, v_p, -1);
    v_d := -v_d;
  end if;

  -- clash_poly_add wirft die Monome mit Koeffizient 0 hinaus — das ist
  -- die einzige Stelle, an der ein Polynom aufgeräumt wird, und deshalb
  -- läuft auch hier alles durch sie hindurch.
  v_p := clash_poly_norm(v_p);

  if v_p = '{}'::jsonb then
    return jsonb_build_object('p', '{}'::jsonb, 'd', 1);
  end if;

  v_g := v_d;
  for rec in select value::bigint as c from jsonb_each_text(v_p) loop
    v_g := gcd(v_g, abs(rec.c));
    exit when v_g = 1;
  end loop;

  if v_g > 1 then
    select jsonb_object_agg(key, value::bigint / v_g) into v_p from jsonb_each_text(v_p);
    v_d := v_d / v_g;
  end if;

  select max(abs(value::numeric)) into v_max from jsonb_each_text(v_p);
  if v_max > 1e12 or v_d > 1e12 then
    return null;   -- zu groß für weiteres Rechnen; NULL heißt „keine Antwort"
  end if;

  return jsonb_build_object('p', v_p, 'd', v_d);
end;
$$;

revoke all on function clash_rat_make(jsonb, bigint) from public;

comment on function clash_rat_make(jsonb, bigint) is
  'Baut ein rationales Polynom {"p": Polynom, "d": Nenner}: Nenner positiv, mit dem ggT aller '
  'Koeffizienten gekürzt, die Null als {"p":{},"d":1}. NULL, wenn der Nenner 0 ist oder die '
  'Zahlen zu groß werden.';


-- Wie groß die Zahlen in einem rationalen Polynom sind — in `numeric`,
-- damit die Schätzung selbst nicht überlaufen kann.
create or replace function clash_rpoly_big(p_a jsonb)
  returns numeric
  language sql
  immutable
as $$
  select greatest(
    coalesce((p_a->>'d')::numeric, 1),
    coalesce((select max(abs(value::numeric)) from jsonb_each_text(p_a->'p')), 1));
$$;

revoke all on function clash_rpoly_big(jsonb) from public;


-- Ein rationales Polynom aus EINEM Monom: n/d · var^e.
-- Der Monom-Schlüssel ist bei einer einzelnen Variablen schon sortiert
-- („x3"), deshalb braucht es hier nichts aus der Monom-Werkzeugkiste.
create or replace function clash_rpoly_mono(p_n bigint, p_d bigint, p_var text, p_e int)
  returns jsonb
  language sql
  immutable
as $$
  select clash_rat_make(
    case when coalesce(p_n, 0) = 0 then '{}'::jsonb
         when coalesce(p_e, 0) = 0 then jsonb_build_object('', p_n)
         else jsonb_build_object(p_var || p_e::text, p_n) end,
    p_d);
$$;

revoke all on function clash_rpoly_mono(bigint, bigint, text, int) from public;


create or replace function clash_rpoly_num(p_n bigint, p_d bigint)
  returns jsonb
  language sql
  immutable
as $$
  select clash_rpoly_mono(p_n, p_d, '', 0);
$$;

revoke all on function clash_rpoly_num(bigint, bigint) from public;


-- ─────────────────────────────────────────────────────────────
-- 2) Rechnen mit rationalen Polynomen
-- ─────────────────────────────────────────────────────────────
create or replace function clash_rpoly_add(p_a jsonb, p_b jsonb, p_sign int default 1)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  da bigint;
  db bigint;
begin
  if p_a is null or p_b is null then return null; end if;
  da := (p_a->>'d')::bigint;
  db := (p_b->>'d')::bigint;
  -- Vor dem Rechnen schätzen, nicht danach: clash_poly_mul würde bei
  -- einem Überlauf eine Ausnahme werfen, und die käme im Spiel als
  -- „keine Verbindung" an.
  if da::numeric * db::numeric > 1e12
     or clash_rpoly_big(p_a) * db::numeric + clash_rpoly_big(p_b) * da::numeric > 1e12 then
    return null;
  end if;
  return clash_rat_make(
    clash_poly_add(clash_poly_mul(p_a->'p', clash_poly_num(db)),
                   clash_poly_mul(p_b->'p', clash_poly_num(da)),
                   coalesce(p_sign, 1)),
    da * db);
end;
$$;

revoke all on function clash_rpoly_add(jsonb, jsonb, int) from public;


create or replace function clash_rpoly_mul(p_a jsonb, p_b jsonb)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  na int;
  nb int;
begin
  if p_a is null or p_b is null then return null; end if;
  select count(*) into na from jsonb_object_keys(p_a->'p');
  select count(*) into nb from jsonb_object_keys(p_b->'p');
  if clash_rpoly_big(p_a) * clash_rpoly_big(p_b) * greatest(least(na, nb), 1) > 1e12 then
    return null;
  end if;
  return clash_rat_make(clash_poly_mul(p_a->'p', p_b->'p'),
                        (p_a->>'d')::bigint * (p_b->>'d')::bigint);
end;
$$;

revoke all on function clash_rpoly_mul(jsonb, jsonb) from public;


-- Geteilt wird nur durch eine ZAHL. „x/(x+1)" ist kein Polynom mehr und
-- damit keine Aufgabe dieser Welt — NULL, also eine falsche Antwort.
create or replace function clash_rpoly_div(p_a jsonb, p_b jsonb)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  k bigint;
begin
  if p_a is null or p_b is null then return null; end if;
  k := clash_poly_const(p_b->'p');
  if k is null or k = 0 then
    return null;
  end if;
  -- a / (k/db) = a · db/k
  if clash_rpoly_big(p_a) * (p_b->>'d')::numeric > 1e12 then
    return null;
  end if;
  return clash_rat_make(clash_poly_mul(p_a->'p', clash_poly_num((p_b->>'d')::bigint)),
                        (p_a->>'d')::bigint * k);
end;
$$;

revoke all on function clash_rpoly_div(jsonb, jsonb) from public;


create or replace function clash_rpoly_pow(p_a jsonb, p_n int)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  r jsonb;
  i int;
  n int;
begin
  if p_a is null or p_n is null or p_n < 0 or p_n > 5 then
    return null;
  end if;
  select count(*) into n from jsonb_object_keys(p_a->'p');
  if power(clash_rpoly_big(p_a) * greatest(n, 1), p_n) > 1e12 then
    return null;
  end if;
  r := clash_rpoly_num(1, 1);
  for i in 1 .. p_n loop
    r := clash_rpoly_mul(r, p_a);
    if r is null then return null; end if;
  end loop;
  return r;
end;
$$;

revoke all on function clash_rpoly_pow(jsonb, int) from public;


-- Gleich? Über Kreuz, wie bei den Brüchen: P₁·d₂ = P₂·d₁. Beide Nenner
-- sind positiv (clash_rat_make), deshalb ohne Fallunterscheidung.
-- Da beide Seiten gekürzt sind, wäre auch p_a = p_b richtig — das
-- Kreuzprodukt steht hier, weil es auch dann noch stimmt, wenn eine
-- Seite einmal ungekürzt hereinkommt.
create or replace function clash_rpoly_eq(p_a jsonb, p_b jsonb)
  returns boolean
  language sql
  immutable
as $$
  select p_a is not null and p_b is not null
     and clash_poly_mul(p_a->'p', clash_poly_num((p_b->>'d')::bigint))
       = clash_poly_mul(p_b->'p', clash_poly_num((p_a->>'d')::bigint));
$$;

revoke all on function clash_rpoly_eq(jsonb, jsonb) from public;


-- Das konstante Glied wegnehmen. Das ist die ganze „+ C"-Regel:
-- Stammfunktionen werden ohne ihre Konstante verglichen, und damit ist
-- „x^2+3x", „x^2+3x+5" und „x^2+3x-7" dieselbe richtige Antwort —
-- „x^2+7x" aber nicht.
create or replace function clash_rpoly_drop_const(p_a jsonb)
  returns jsonb
  language sql
  immutable
as $$
  select case when p_a is null then null
              else clash_rat_make(coalesce(p_a->'p', '{}'::jsonb) - '',
                                  (p_a->>'d')::bigint) end;
$$;

revoke all on function clash_rpoly_drop_const(jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Ein Term mit Brüchen und Kommazahlen lesen
-- ─────────────────────────────────────────────────────────────
-- Rang der Operatoren. Wie clash_term_prec (0115:356), nur mit dem
-- Schrägstrich neben dem Mal.
create or replace function clash_rterm_prec(p_op text)
  returns int
  language sql
  immutable
as $$
  select case p_op
    when '+' then 1
    when '-' then 1
    when '*' then 2
    when '/' then 2
    when '~' then 3   -- das einstellige Minus
    when '^' then 4
    else 0
  end;
$$;

revoke all on function clash_rterm_prec(text) from public;


-- Bauart wie clash_term_parse (Fassung 0116:60): derselbe iterative
-- Shunting-Yard, dieselbe Regel „bei jedem Fehler NULL, niemals eine
-- Ausnahme". Vier Unterschiede:
--
--   · auf dem Stapel liegen rationale Polynome statt ganzzahliger,
--   · „/" ist ein Operator (der Teiler muss eine Zahl sein),
--   · eine Zahl darf ein Komma tragen: „0,5" ist 1/2,
--   · Hochzahlen bis 5, weil die Stammfunktion einer Aufgabe vierten
--     Grades eine fünften Grades ist.
--
-- ⚠️ „1/3x^3" wird als (1/3)·x³ gelesen und nicht als 1/(3x³). Das ist
-- die Schreibweise, die die Bruchtaste erzeugt: erst der Bruch, dann
-- geht es dahinter weiter. Ein Nenner mit Variablen wäre in dieser
-- Aufgabenwelt ohnehin kein Polynom.
create or replace function clash_rterm_parse(p_text text)
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

  -- Schreibweisen, die dasselbe meinen (wie in 0115/0116), plus der
  -- Punkt als Dezimaltrennzeichen: auf einer echten Tastatur liegt er
  -- auf dem Ziffernblock, und gemeint ist dasselbe Komma.
  s := replace(s, '−', '-');
  s := replace(s, '–', '-');
  s := replace(s, '·', '*');
  s := replace(s, '×', '*');
  s := replace(s, '²', '^2');
  s := replace(s, '³', '^3');
  s := replace(s, ' ', '');
  s := replace(s, '.', ',');

  if s !~ '^[0-9a-z+*/^(),-]+$' then return null; end if;
  -- Nur a, b, c, x, y sind Variablen. Der Funktionsname (f, g, h) und
  -- der Strich stehen in der AUFGABE, nie in der Antwort.
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
      if length(num) > 5 then return null; end if;
      -- Nachkommastellen: höchstens zwei, und es müssen welche folgen —
      -- „3," ist keine Zahl.
      if i <= n and substr(s, i, 1) = ',' then
        i := i + 1;
        num := num || ',';
        while i <= n and substr(s, i, 1) ~ '[0-9]' loop
          num := num || substr(s, i, 1);
          i := i + 1;
        end loop;
        if length(split_part(num, ',', 2)) not between 1 and 2 then return null; end if;
      end if;
      tok := tok || ('#' || num);
    elsif ch = ',' then
      return null;                       -- ein Komma ohne Zahl davor
    else
      tok := tok || ch;
      i := i + 1;
    end if;
  end loop;
  if array_length(tok, 1) > 60 then return null; end if;

  -- b) ergänzen
  prev := null;
  foreach t in array tok loop
    if t = '+' and (prev is null or prev in ('(', '+', '-', '*', '/', '^', '~')) then
      continue;
    end if;
    -- Implizites Mal: „2x", „3(x+4)", „1/3x^3"
    --
    -- ⚠️ Das `::text` ist kein Schmuck: ohne den Typ hält Postgres '*'
    -- für ein Array und bricht mit „malformed array literal" ab
    -- (Regel: feedback_plpgsql_array_append_literal).
    if prev is not null
       and (prev like '#%' or prev ~ '^[a-z]$' or prev = ')')
       and (t    like '#%' or t    ~ '^[a-z]$' or t    = '(') then
      tok2 := tok2 || '*'::text;
    end if;
    if t = '-' and (prev is null or prev in ('(', '+', '-', '*', '/', '^', '~')) then
      tok2 := tok2 || '~'::text;
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
        if array_length(ops, 1) is null then return null; end if;
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
        -- obere Operator stehen.
        exit when not (clash_rterm_prec(top) > clash_rterm_prec(t)
                       or (clash_rterm_prec(top) = clash_rterm_prec(t)
                           and t not in ('^', '~')));
        rpn := rpn || top;
        ops := ops[1 : array_length(ops, 1) - 1];
      end loop;
      ops := ops || t;
    end if;
  end loop;
  while array_length(ops, 1) is not null loop
    if ops[array_length(ops, 1)] = '(' then return null; end if;
    rpn := rpn || ops[array_length(ops, 1)];
    ops := ops[1 : array_length(ops, 1) - 1];
  end loop;

  -- d) ausrechnen
  foreach t in array rpn loop
    if t like '#%' then
      num := substr(t, 2);
      if position(',' in num) > 0 then
        a := clash_rpoly_num(replace(num, ',', '')::bigint,
                             power(10, length(split_part(num, ',', 2)))::bigint);
      else
        a := clash_rpoly_num(num::bigint, 1);
      end if;
      st := st || a;
    elsif t ~ '^[a-z]$' then
      st := st || clash_rpoly_mono(1, 1, t, 1);
    elsif t = '~' then
      if coalesce(array_length(st, 1), 0) < 1 then return null; end if;
      st[array_length(st, 1)] :=
        clash_rpoly_add(clash_rpoly_num(0, 1), st[array_length(st, 1)], -1);
      if st[array_length(st, 1)] is null then return null; end if;
    else
      if coalesce(array_length(st, 1), 0) < 2 then return null; end if;
      b  := st[array_length(st, 1)];
      a  := st[array_length(st, 1) - 1];
      st := st[1 : array_length(st, 1) - 2];
      if t = '+' then
        st := st || clash_rpoly_add(a, b, 1);
      elsif t = '-' then
        st := st || clash_rpoly_add(a, b, -1);
      elsif t = '*' then
        st := st || clash_rpoly_mul(a, b);
      elsif t = '/' then
        st := st || clash_rpoly_div(a, b);
      elsif t = '^' then
        -- Die Hochzahl muss eine ganze Zahl sein: „x^0,5" ist kein
        -- Polynom.
        if b is null or (b->>'d')::bigint <> 1 then return null; end if;
        e := clash_poly_const(b->'p');
        if e is null or e < 0 or e > 5 then return null; end if;
        st := st || clash_rpoly_pow(a, e::int);
      else
        return null;
      end if;
      if st[array_length(st, 1)] is null then return null; end if;
    end if;
  end loop;

  if coalesce(array_length(st, 1), 0) <> 1 then return null; end if;
  return st[1];
end;
$$;

revoke all on function clash_rterm_parse(text) from public;

comment on function clash_rterm_parse(text) is
  'Liest einen Term mit Brüchen und Kommazahlen als rationales Polynom: „1/3x^3+0,5x" wird '
  '{"p":{"x3":2,"x1":3},"d":6}. NULL bei jedem Fehler — eine unleserliche Eingabe ist eine '
  'falsche Antwort, kein Absturz.';


-- ─────────────────────────────────────────────────────────────
-- 4) Ein rationales Polynom aufschreiben
-- ─────────────────────────────────────────────────────────────
-- Der Stil bestimmt nur, wie die Koeffizienten DASTEHEN, nie ihren
-- Wert: „0,5x" und „1/2x" sind für die Prüfung dasselbe. Er wird je
-- Aufgabe einmal gewürfelt, damit die gegebene Funktion und die Antwort
-- zusammen aussehen.
--
-- Der Rückfall ist eingebaut und wichtig: bei style = 'dec' und der
-- Stammfunktion von 0,5x² (nämlich ⅙x³) gibt es keine Kommazahl mit
-- zwei Stellen — dieses eine Glied steht dann als Bruch da, der Rest
-- weiter mit Komma.
create or replace function clash_rterm_render(p_a jsonb, p_style text default 'frac')
  returns text
  language plpgsql
  immutable
as $$
declare
  r    text := '';
  body text;
  head text;
  c    bigint;
  dd   bigint;
  g    bigint;
  m    bigint;
  d0   bigint;
  rec  record;
begin
  if p_a is null then return null; end if;
  if coalesce(p_a->'p', '{}'::jsonb) = '{}'::jsonb then return '0'; end if;

  d0 := (p_a->>'d')::bigint;

  for rec in
    select key as k, value::bigint as c
      from jsonb_each_text(p_a->'p')
     order by clash_mono_deg(key) desc, clash_mono_sort(key) asc
  loop
    -- Je Glied für sich kürzen: der gemeinsame Nenner steht vor der
    -- ganzen Klammer, aufgeschrieben wird aber jeder Koeffizient einzeln.
    g  := gcd(abs(rec.c), d0);
    c  := rec.c / g;
    dd := d0 / g;
    m  := abs(c);
    body := clash_mono_text(rec.k);

    if r = '' then
      r := case when c < 0 then '-' else '' end;
    else
      r := r || case when c < 0 then '-' else '+' end;
    end if;

    if dd = 1 then
      -- Die 1 vor einer Variablen schreibt niemand hin — vor nichts
      -- dagegen schon: die Konstante 1 ist „1".
      head := case when m = 1 and body <> '' then '' else m::text end;
    elsif p_style = 'dec' and 10 % dd = 0 then
      head := clash_dec_text(m * (10 / dd), 1);
    elsif p_style = 'dec' and 100 % dd = 0 then
      head := clash_dec_text(m * (100 / dd), 2);
    else
      head := m::text || '/' || dd::text;
    end if;

    r := r || head || body;
  end loop;

  return r;
end;
$$;

revoke all on function clash_rterm_render(jsonb, text) from public;


-- Die EINE Stelle, die entscheidet, wann zwei Analysis-Terme dasselbe
-- sind — für die Entdopplung der Kacheln. Fest auf Bruchschreibweise,
-- sonst wären „0,5x" und „1/2x" zwei Schlüssel für denselben Wert.
create or replace function clash_rterm_norm(p_text text)
  returns text
  language sql
  immutable
as $$
  select clash_rterm_render(clash_rterm_parse(p_text), 'frac');
$$;

revoke all on function clash_rterm_norm(text) from public;


-- ─────────────────────────────────────────────────────────────
-- 5) Die Kacheln für Analysis
-- ─────────────────────────────────────────────────────────────
-- Zwilling von clash_term_choices (0115:637), entdoppelt über
-- clash_rterm_norm. Aufgefüllt wird über das Glied mit dem KLEINSTEN
-- Grad: eine falsche Konstante ist ein Fehler, den man machen kann, ein
-- verschobener Leitkoeffizient einer, den niemand macht.
create or replace function clash_rterm_choices(p_answer text, p_distract jsonb,
                                               p_count int, p_style text)
  returns jsonb
  language plpgsql
as $$
declare
  v_txt  text[] := array[p_answer];
  v_keys text[] := array[clash_rterm_norm(p_answer)];
  v_ans  jsonb  := clash_rterm_parse(p_answer);
  d      text;
  k      text;
  cand   text;
  rec    record;
  i      int := 1;
  delta  int;
begin
  if v_keys[1] is null then
    -- Eine Antwort, die der eigene Parser nicht liest, ist ein Fehler im
    -- Generator. Lieber eine Kachel als eine Ausnahme im Spiel.
    return to_jsonb(v_txt);
  end if;

  for d in
    select value
      from jsonb_array_elements_text(coalesce(p_distract, '[]'::jsonb))
     where value is not null
     order by random()
  loop
    exit when array_length(v_txt, 1) >= p_count;
    k := clash_rterm_norm(d);
    if k is not null and not (k = any(v_keys)) then
      v_txt  := v_txt  || d;
      v_keys := v_keys || k;
    end if;
  end loop;

  if v_ans is not null and v_ans->'p' <> '{}'::jsonb then
    select key as k into rec
      from jsonb_each_text(v_ans->'p')
     order by clash_mono_deg(key) asc, key asc
     limit 1;
    while coalesce(array_length(v_txt, 1), 0) < p_count and i <= 40 loop
      delta := case when i % 2 = 1 then (i + 1) / 2 else -(i / 2) end;
      -- delta ganze Einheiten auf dieses Glied: der gemeinsame Nenner
      -- steht vor allem, deshalb delta · d im Zähler.
      cand  := clash_rterm_render(
                 clash_rat_make(
                   clash_poly_add(v_ans->'p',
                                  jsonb_build_object(rec.k, delta * (v_ans->>'d')::bigint), 1),
                   (v_ans->>'d')::bigint),
                 p_style);
      k := clash_rterm_norm(cand);
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

revoke all on function clash_rterm_choices(text, jsonb, int, text) from public;


-- ─────────────────────────────────────────────────────────────
-- 6) Der Generator
-- ─────────────────────────────────────────────────────────────
-- Einer für beide Richtungen: gezogen werden die Koeffizienten von f,
-- und daraus lassen sich f, f' und F unmittelbar hinschreiben —
--
--     f  = Σ  cₖ/dₖ · v^k
--     f' = Σ  k·cₖ/dₖ · v^(k-1)
--     F  = Σ  cₖ/(dₖ·(k+1)) · v^(k+1)
--
-- Es braucht also kein symbolisches Ableiten und kein Aufleiten; die
-- drei Polynome entstehen nebeneinander aus derselben Ziehung. Die
-- Ablenker ebenso: jeder ist EINE veränderte Zeile in dieser Summe.
create or replace function clash_gen_analysis(p_deriv boolean)
  returns jsonb
  language plpgsql
as $$
declare
  v_names text[] := array['f', 'g', 'h'];
  v_vars  text[] := array['x', 'a', 'b'];
  v_name  text   := v_names[1 + floor(random() * 3)::int];
  v_var   text   := v_vars[1 + floor(random() * 3)::int];
  v_style text;
  v_deg   int    := 1 + floor(random() * 4)::int;    -- 1..4
  cn      bigint[];                                  -- Zähler je Grad, ab Grad 0
  cd      bigint[];                                  -- Nenner  je Grad
  k       int;
  den     bigint;
  v_left  int;
  v_f     jsonb := clash_rpoly_num(0, 1);
  v_d1    jsonb := clash_rpoly_num(0, 1);
  v_ff    jsonb := clash_rpoly_num(0, 1);
  -- die Ablenker-Summen, jede ein anderer Fehler
  x_keep  jsonb := clash_rpoly_num(0, 1);   -- Hochzahl nicht gesenkt/erhöht
  x_fac   jsonb := clash_rpoly_num(0, 1);   -- Faktor vergessen
  x_konst jsonb := clash_rpoly_num(0, 1);   -- durch k statt k+1 geteilt
  v_ans   jsonb;
  v_txt   text;
  v_given text;
  v_dis   jsonb;
begin
  -- Wie die Koeffizienten dastehen. Ganze Zahlen sind der Regelfall;
  -- Kommazahlen und Brüche kommen je zu einem Viertel.
  v_style := case when random() < 0.5 then 'int'
                  when random() < 0.5 then 'dec'
                  else 'frac' end;

  -- Erst alles auf null, dann werden einzelne Stellen besetzt: so steht
  -- der Grad im Index und nicht in der Reihenfolge des Ziehens.
  cn := array_fill(0::bigint, array[v_deg + 1]);
  cd := array_fill(1::bigint, array[v_deg + 1]);

  -- Von oben nach unten. Das Leitglied steht immer da, von den anderen
  -- kommen höchstens zwei dazu.
  --
  -- Warum die Deckelung: ein volles Polynom vierten Grades mit
  -- Bruch-Koeffizienten hat als Stammfunktion fünf Glieder und wird
  -- knapp vierzig Zeichen lang — das ist auf einem Tablet keine Aufgabe
  -- mehr, sondern eine Tipp-Übung. Drei Glieder zeigen dieselbe Regel.
  --
  -- Die Lücken sind dabei kein Verzicht, sondern der interessantere
  -- Fall: wer Stellen abzählt statt die Regel anzuwenden, fällt genau an
  -- einem fehlenden x² auf.
  v_left := 2;
  for k in reverse v_deg .. 0 loop
    if k < v_deg then
      exit when v_left = 0;
      continue when random() < 0.4;     -- diese Stelle bleibt leer
      v_left := v_left - 1;
    end if;

    if v_style = 'int' then
      cn[k + 1] := clash_rnd_int(1, 9);
      cd[k + 1] := 1;
    elsif v_style = 'dec' then
      -- 0,1 bis 4,9 — und nie ein glattes Vielfaches von 10, sonst wäre
      -- es keine Kommazahl.
      cn[k + 1] := case when clash_rnd_int(1, 49) % 10 = 0 then 15
                        else clash_rnd_int(1, 49) end;
      cd[k + 1] := 10;
    else
      den := (array[2, 3, 4, 5, 6, 7, 8])[1 + floor(random() * 7)::int];
      cn[k + 1] := clash_rnd_int(1, 3 * den - 1);
      cd[k + 1] := den;
    end if;

    if random() < 0.35 then
      cn[k + 1] := -cn[k + 1];
    end if;
  end loop;

  for k in 0 .. v_deg loop
    v_f  := clash_rpoly_add(v_f,  clash_rpoly_mono(cn[k + 1], cd[k + 1], v_var, k));
    v_ff := clash_rpoly_add(v_ff, clash_rpoly_mono(cn[k + 1], cd[k + 1] * (k + 1), v_var, k + 1));
    if k >= 1 then
      v_d1 := clash_rpoly_add(v_d1, clash_rpoly_mono(cn[k + 1] * k, cd[k + 1], v_var, k - 1));
    end if;

    if p_deriv then
      -- Hochzahl nicht gesenkt (k·cₖ·v^k) und Faktor vergessen (cₖ·v^(k-1)).
      if k >= 1 then
        x_keep := clash_rpoly_add(x_keep, clash_rpoly_mono(cn[k + 1] * k, cd[k + 1], v_var, k));
        x_fac  := clash_rpoly_add(x_fac,  clash_rpoly_mono(cn[k + 1], cd[k + 1], v_var, k - 1));
      end if;
    else
      -- Hochzahl nicht erhöht (cₖ/(k+1)·v^k) und durch k statt k+1
      -- geteilt (beim konstanten Glied bleibt es bei 1).
      x_keep  := clash_rpoly_add(x_keep,
                   clash_rpoly_mono(cn[k + 1], cd[k + 1] * (k + 1), v_var, k));
      x_konst := clash_rpoly_add(x_konst,
                   clash_rpoly_mono(cn[k + 1], cd[k + 1] * greatest(k, 1), v_var, k + 1));
    end if;
  end loop;

  v_ans   := case when p_deriv then v_d1 else v_ff end;
  v_given := v_name || '(' || v_var || ')=' || clash_rterm_render(v_f, v_style);
  v_txt   := case when p_deriv then v_name || '''(' || v_var || ')'
                  else upper(v_name) || '(' || v_var || ')' end;

  -- Typische Fehler. Vertauscht: wer aufleiten soll, leitet ab (und
  -- umgekehrt) — das ist bei diesem Aufgabenpaar DER Fehler.
  v_dis := jsonb_build_array(
    clash_rterm_render(x_keep, v_style),
    clash_rterm_render(case when p_deriv then x_fac else x_konst end, v_style),
    clash_rterm_render(case when p_deriv then v_ff else v_d1 end, v_style),
    clash_rterm_render(v_f, v_style),
    -- Vorzeichen des ganzen Terms verdreht
    clash_rterm_render(clash_rpoly_add(clash_rpoly_num(0, 1), v_ans, -1), v_style),
    -- ein Glied daneben
    clash_rterm_render(clash_rpoly_add(v_ans, clash_rpoly_mono(1, 1, v_var, 1)), v_style),
    /* ⚠️ Der letzte Ablenker darf sich bei der STAMMFUNKTION nicht in
       der Konstanten unterscheiden: die ist nach der „+ C"-Regel frei,
       und die Kachel wäre eine zweite richtige Antwort. Ein Kind, das
       sie anklickt, bekäme einen Punkt für eine falsche Rechnung —
       und die Kachel daneben ebenfalls.

       Bei der Ableitung ist genau dieselbe Kachel dagegen ein guter
       Ablenker: „die Konstante mitgeschleppt" ist DER Fehler beim
       Ableiten, und dort zählt sie mit. */
    clash_rterm_render(
      case when p_deriv then clash_rpoly_add(v_ans, clash_rpoly_num(1, 1))
           else clash_rpoly_add(v_ans, clash_rpoly_mono(1, 1, v_var, v_deg + 1)) end,
      v_style));

  return jsonb_build_object(
    'text',     v_txt,
    'given',    v_given,
    'answer',   clash_rterm_render(v_ans, v_style),
    'answer_n', null,
    'answer_d', null,
    'var',      null,      -- NICHT die Variable: das Feld setzt beim
                           -- Client „x = ▢" vor die Eingabe, und hier
                           -- steht schon „f'(x) =" davor.
    'form',     case when p_deriv then 'deriv' else 'antider' end,
    'style',    v_style,
    'maxlen',   36,
    'keys',     to_jsonb(array['sign', 'plus', 'dec', 'frac', 'exp', 'vars']),
    'distract', v_dis);
end;
$$;

revoke all on function clash_gen_analysis(boolean) from public;

comment on function clash_gen_analysis(boolean) is
  'Zieht eine Analysis-Aufgabe: ein Polynom bis Grad 4 mit ganzzahligen, Komma- oder '
  'Bruch-Koeffizienten; gefragt ist die Ableitung (p_deriv) oder eine Stammfunktion.';


create or replace function clash_gen_ana_deriv()
  returns jsonb language sql as $$ select clash_gen_analysis(true); $$;

create or replace function clash_gen_ana_int()
  returns jsonb language sql as $$ select clash_gen_analysis(false); $$;

revoke all on function clash_gen_ana_deriv() from public;
revoke all on function clash_gen_ana_int() from public;


-- ─────────────────────────────────────────────────────────────
-- 7) Die Katalogzeilen
-- ─────────────────────────────────────────────────────────────
insert into clash_task_types
  (key, group_key, group_label, label, short_label, example,
   sort_group, sort_item, allows_free, allows_mc, input_mode, keypad,
   choice_count, strict_reduced, derived, requires, answer_kind, ops,
   compare_as, keys, flag)
values
  ('ana_deriv', 'ana', 'Analysis', 'Ableitungen bilden',
   'f ′', 'f(x)=3x²+2x → f''(x)',
   5, 1, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'term', '{sign,plus,dec,frac,exp,vars}', false),

  ('ana_int',   'ana', 'Analysis', 'Stammfunktionen bilden',
   '∫', 'f(x)=x²+4x → F(x)',
   5, 2, true, true, 'natural', 'natural', 6, false, false, '{}', 'number', '{}',
   'term', '{sign,plus,dec,frac,exp,vars}', false)

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
-- 8) clash_answer_matches — Neu-Deklaration auf Basis 0115:1339
-- ─────────────────────────────────────────────────────────────
-- Ein Zweig mehr, ganz vorn im Term-Teil. Alles andere Wort für Wort
-- wie in 0115.
create or replace function clash_answer_matches(p_q jsonb, p_answer text)
  returns boolean
  language plpgsql
  immutable
as $$
declare
  v  text := btrim(coalesce(p_answer, ''));
  a  jsonb;
  p  jsonb;
  rp jsonb;
  ra jsonb;
begin
  if p_q is null or v = '' then
    return false;
  end if;

  if p_q->>'kind' = 'term' then
    if p_q->>'mode' = 'mc'
       and not (coalesce(p_q->'choices', '[]'::jsonb) @> to_jsonb(v)) then
      return false;
    end if;

    -- Analysis (0119): eigene Zahlenwelt, weil hier Brüche als
    -- Koeffizienten stehen (∫x² = ⅓x³).
    if p_q->>'form' in ('deriv', 'antider') then
      rp := clash_rterm_parse(v);
      if rp is null then
        return false;
      end if;
      ra := clash_rterm_parse(p_q->>'answer');
      if p_q->>'form' = 'antider' then
        -- „+ C": die Konstante ist frei. Auf BEIDEN Seiten weggenommen,
        -- dann ist „x^2+3x", „x^2+3x+5" und „x^2+3x-7" dieselbe
        -- richtige Antwort — „x^2+7x" aber nicht.
        rp := clash_rpoly_drop_const(rp);
        ra := clash_rpoly_drop_const(ra);
      end if;
      return clash_rpoly_eq(rp, ra);
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
  'der Wert als Polynom. Analysis (0119): rationale Koeffizienten, und bei Stammfunktionen ist '
  'die Konstante frei.';


-- ─────────────────────────────────────────────────────────────
-- 9) clash_new_question — Neu-Deklaration auf Basis 0118
-- ─────────────────────────────────────────────────────────────
-- Drei Änderungen: zwei Zweige im CASE, die Kacheln der Analysis-Arten
-- und das neue Feld `given` in der Rückgabe.
--
-- ⚠️ `given` ist die AUFGABE und keine Lösung — clash_q_public (0110)
-- streicht nur lösungstragende Felder und muss deshalb nicht angefasst
-- werden. Nachgesehen: die Streichliste ist answer/answer_n/answer_d/
-- strict/distract, und keines davon kommt hier dazu.
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
             when 'ana_deriv'    then clash_gen_ana_deriv()
             when 'ana_int'      then clash_gen_ana_int()
             else clash_gen_addsub(100, 100, 1, v_neg, v_rat)
           end;

  if v_mode = 'mc' then
    if v_kind = 'digits' then
      v_choices := clash_num_choices(v_gen->>'answer', v_gen->'distract',
                                     coalesce(v_type.choice_count, 6),
                                     coalesce((v_gen->>'base_to')::int, 10),
                                     coalesce((v_gen->>'maxlen')::int, 8));
    elsif v_kind = 'term' then
      if v_gen->>'form' in ('deriv', 'antider') then
        -- 0119: eigene Entdopplung, weil hier Brüche im Spiel sind
        v_choices := clash_rterm_choices(v_gen->>'answer', v_gen->'distract',
                                         coalesce(v_type.choice_count, 6),
                                         coalesce(v_gen->>'style', 'frac'));
      else
        v_choices := clash_term_choices(v_gen->>'answer', v_gen->'distract',
                                        coalesce(v_type.choice_count, 6));
      end if;
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
    -- 0119: die gegebene Funktion. Sie steht als eigene Zeile ÜBER der
    -- Eingabe, weil „f(x)=3x^2+2x" und „f'(x)=▢" zwei Aussagen sind und
    -- nicht eine.
    'given',     v_gen->'given',
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
  'Seit 0118 werden Schalterzeilen übersprungen; seit 0119 trägt eine Frage bei Bedarf die '
  'gegebene Funktion in `given`.';
