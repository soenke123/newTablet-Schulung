-- ══════════════════════════════════════════════════════════════
-- Migration 0110 — Kingdoms of Mathoria: die Fragen-Pipeline
-- ══════════════════════════════════════════════════════════════
-- 0109 hat den Katalog und die Wahl gebracht, hier kommen die Aufgaben.
--
-- ── Was sich grundsätzlich ändert ──────────────────────────────
-- Bisher WAR die Aufgabe zwei Zahlen (clash_players.current_a/current_b)
-- und die Prüfung eine Zeile: `p_answer = a + b`. Beides trägt keine
-- Bruchrechnung. Ab hier ist die Aufgabe ein jsonb-Objekt
-- (clash_players.current_q) und die Antwort ein TEXT — „7/8" ist keine
-- Zahl, und „-3/4" erst recht nicht.
--
--   {"type":"frac_addsub", "mode":"free", "input":"fraction",
--    "text":"3/4 + 1/8", "eq":true,
--    "answer":"7/8", "answer_n":7, "answer_d":8, "strict":false}
--
-- current_a/current_b bleiben als Spalten stehen (kein DROP), werden
-- aber nicht mehr geschrieben oder gelesen.
--
-- ── Die Lösung darf das Gerät nicht erreichen ──────────────────
-- Bei „37 + 48" war die Lösung ohnehin sichtbar — das Kind soll sie ja
-- ausrechnen. `answer` ist aber die Lösung SELBST. Deshalb läuft jede
-- Frage, die an einen Client geht, durch clash_q_public(); das ist die
-- einzige Stelle, die entscheidet, was ein Gerät sehen darf. Eine
-- Funktion, nicht zwei Stellen mit derselben Streichliste, die
-- auseinanderlaufen können.
--
-- ── Kopfrechnen, nicht Zettelrechnen ───────────────────────────
-- Sönkes Vorgabe für die Brüche: 6. Klasse, im Kopf lösbar, auch beim
-- Kürzen — gleichnamig machen ja, aber nur mit einfachen Schritten.
-- Deshalb ziehen die Generatoren die Nenner NICHT frei, sondern aus
-- einer festen Paarliste mit kgV ≤ 24. „3/7 + 4/9" (kgV 63) kann so
-- gar nicht erst entstehen. Negative Ergebnisse sind ausdrücklich
-- erlaubt.
--
-- ── Falsche Kacheln sind keine Zufallszahlen ───────────────────
-- Die fünf falschen Antworten einer Auswahl-Aufgabe sind die
-- TYPISCHEN Fehler: Zähler und Nenner addiert, nur einen Nenner
-- erweitert, bei der Division nicht gestürzt. Sechs zufällige Brüche
-- wären zwar auch sechs Kacheln, aber die richtige stäche unter ihnen
-- sofort hervor.
--
-- ⚠️ Und: die Kacheln werden nach WERT entdoppelt, nicht nach Text —
-- sonst stünden 3/4 und 6/8 nebeneinander und beide wären richtig.
-- Beim Kürzen ist es umgekehrt (dort nach Text), denn dort IST die
-- ungekürzte Schreibweise die falsche Antwort.
--
-- ── Warum clash_submit und nicht eine zweite Überladung ────────
-- Die neue Einreiche-RPC heißt clash_submit(text, text). Zwei
-- Funktionen clash_submit_answer(text,int) und (text,text) müsste
-- PostgREST anhand des JSON-Typs auflösen — das ist eine Wette. Die
-- alte Signatur bleibt bestehen und reicht nur noch durch, damit ein
-- Tablet mit altem, gecachtem tool.js während des Deploys weiterspielt.
--
-- ⚠️ Neu deklariert werden clash_view, clash_room_start und
-- clash_ensure_player — jeweils auf Grundlage der HÖCHSTEN bestehenden
-- Fassung (clash_view/clash_room_start: 0108, clash_ensure_player:
-- 0094), sonst fielen deren Zusätze wieder weg.
-- Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_players.current_q
-- ─────────────────────────────────────────────────────────────
alter table clash_players add column if not exists current_q jsonb;

comment on column clash_players.current_q is
  'Die laufende Aufgabe als Objekt (siehe clash_new_question). NULL = keine. Löst current_a/'
  'current_b ab; die beiden sind ab 0110 tot und bleiben nur stehen, weil hier nichts gedroppt '
  'wird.';
comment on column clash_players.current_a is
  'Tot seit 0110 (die Aufgabe steht in current_q). Wird nicht mehr geschrieben.';
comment on column clash_players.current_b is
  'Tot seit 0110 (die Aufgabe steht in current_q). Wird nicht mehr geschrieben.';


-- ─────────────────────────────────────────────────────────────
-- 2) Bruch-Handwerkszeug
-- ─────────────────────────────────────────────────────────────

-- Kürzen und Vorzeichen ordnen: das Minus wandert in den Zähler, der
-- Nenner ist immer positiv. Damit ist die Darstellung eines Wertes
-- eindeutig, und der Vergleich zweier Brüche wird ein Kreuzprodukt
-- ohne Fallunterscheidung.
create or replace function clash_frac_norm(p_n int, p_d int)
  returns int[]
  language sql
  immutable
as $$
  select case
    when p_d is null or p_d = 0 or p_n is null then null
    when p_n = 0 then array[0, 1]
    -- Die Division steht nur im else-Zweig: bei p_n = 0 wäre g ebenfalls
    -- 0, und CASE wertet den nicht gewählten Zweig nicht aus.
    else array[ x.sn / x.g, x.sd / x.g ]
  end
  from (select
          case when p_d < 0 then -p_n else p_n end as sn,
          abs(p_d)                                 as sd,
          gcd(abs(p_n), abs(p_d))                  as g
       ) x;
$$;

revoke all on function clash_frac_norm(int, int) from public;

comment on function clash_frac_norm(int, int) is
  'Kürzt einen Bruch und legt das Vorzeichen in den Zähler: {Zähler, Nenner}, Nenner > 0. '
  'NULL bei Nenner 0.';


-- Schreibt einen Bruch SO AUF, WIE ER ÜBERGEBEN WIRD — ohne zu kürzen.
-- Das ist Absicht: die falschen Kacheln beim Kürzen leben davon, dass
-- „6/8" als 6/8 dasteht und nicht still zu 3/4 wird.
create or replace function clash_frac_text(p_n int, p_d int)
  returns text
  language sql
  immutable
as $$
  select case
    when p_n is null or p_d is null or p_d = 0 then null
    when p_n = 0        then '0'
    when abs(p_d) = 1   then (case when p_d < 0 then -p_n else p_n end)::text
    else (case when p_d < 0 then -p_n else p_n end)::text || '/' || abs(p_d)::text
  end;
$$;

revoke all on function clash_frac_text(int, int) from public;

comment on function clash_frac_text(int, int) is
  'Bruch als Text, UNGEKÜRZT übernommen. Nenner 1 wird zur ganzen Zahl, Zähler 0 zu „0".';


-- Was das Kind getippt (oder angetippt) hat, als Zahlenpaar. Liefert
-- roh UND gekürzt: der Unterschied zwischen beiden ist genau das, was
-- „Kürzen" prüft.
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
  -- Die Längenbegrenzung ist kein Geschmack, sondern der Schutz vor
  -- einer Zahl, die den int sprengt und die ganze RPC mit einer
  -- Ausnahme abbrechen ließe.
  if s ~ '^-?[0-9]{1,4}$' then
    n := s::int;
    d := 1;
  elsif s ~ '^-?[0-9]{1,4}/[0-9]{1,4}$' then
    n := split_part(s, '/', 1)::int;
    d := split_part(s, '/', 2)::int;
    if d = 0 then
      return null;
    end if;
  else
    return null;
  end if;

  f := clash_frac_norm(n, d);
  return jsonb_build_object('raw_n', n, 'raw_d', d, 'n', f[1], 'd', f[2]);
end;
$$;

revoke all on function clash_parse_answer(text) from public;

comment on function clash_parse_answer(text) is
  'Liest „7", „-7", „7/8" oder „-7/8" als {raw_n, raw_d, n, d} (roh und gekürzt). NULL, wenn es '
  'keine lesbare Zahl ist — der Aufrufer wertet das als falsche Antwort, nicht als Fehler.';


-- Der Vergleichsschlüssel einer Antwortkachel. Er entscheidet, wann
-- zwei Kacheln „dieselbe" Antwort sind:
--   normal  nach dem WERT  — 3/4 und 6/8 dürfen nicht nebeneinander
--                            stehen, sie wären beide richtig
--   strict  nach dem TEXT  — beim Kürzen IST 6/8 die falsche Antwort
--                            zu 3/4 und gehört als Kachel dazu
create or replace function clash_choice_key(p_text text, p_strict boolean)
  returns text
  language plpgsql
  immutable
as $$
declare
  a jsonb;
begin
  if p_text is null then
    return null;
  end if;
  if coalesce(p_strict, false) then
    return btrim(p_text);
  end if;
  a := clash_parse_answer(p_text);
  if a is null then
    return btrim(p_text);   -- „<", „=", „>" — Zeichen sind ihr eigener Schlüssel
  end if;
  return (a->>'n') || '/' || (a->>'d');
end;
$$;

revoke all on function clash_choice_key(text, boolean) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Die Generatoren — einer je Aufgabenart
-- ─────────────────────────────────────────────────────────────
-- Jeder liefert dieselbe Form:
--   text        die fertig gesetzte Aufgabe
--   answer      die richtige Antwort als Text
--   answer_n/_d dieselbe als Zahlenpaar (für den Wertvergleich)
--   distract    typische FEHLER, aus denen die Kacheln entstehen
--   eq          false = die Aufgabe steht ohne „= [ ]" da (Vergleichen)
--   choices_fixed  feste Kacheln in fester Reihenfolge (Vergleichen)
--
-- Was daraus eine freie oder eine Auswahl-Aufgabe wird, entscheidet
-- clash_new_question — kein Generator weiß davon. Eine neue
-- Aufgabenart ist deshalb später eine Funktion hier plus eine Zeile in
-- clash_task_types.

-- Der Bestand seit 0093, jetzt als Katalog-Eintrag.
create or replace function clash_gen_add100()
  returns jsonb
  language plpgsql
as $$
declare
  a int;
  b int;
  s int;
begin
  a := 1 + floor(random() * 99)::int;
  b := 1 + floor(random() * (100 - a))::int;
  s := a + b;
  return jsonb_build_object(
    'text',     a::text || ' + ' || b::text,
    'answer',   s::text,
    'answer_n', s,
    'answer_d', 1,
    -- Nachbarzahlen und der klassische Zehner-Verrutscher. Bewusst
    -- keine negativen Kacheln: sie wären bei einer Summe zweier
    -- positiver Zahlen auf einen Blick als falsch zu erkennen.
    'distract', jsonb_build_array(
      (s + 10)::text, (case when s > 10 then s - 10 else s + 20 end)::text,
      (s + 1)::text,  (case when s > 1  then s - 1  else s + 2  end)::text,
      (s + 9)::text,  abs(a - b)::text)
  );
end;
$$;

revoke all on function clash_gen_add100() from public;


-- Die zulässigen Nennerpaare. EINE Liste für Addition/Subtraktion und
-- fürs Vergleichen, weil beide dieselbe Frage stellen („was ist hier
-- der gemeinsame Nenner?") und dieselbe Grenze brauchen.
-- Alle Paare: Nenner aus {2,3,4,5,6,8,10,12}, kgV ≤ 24.
-- „2,2" fehlt mit Absicht — bei Nenner 2 gibt es nur 1/2, die Aufgabe
-- wäre immer dieselbe.
create or replace function clash_frac_pairs()
  returns text[]
  language sql
  immutable
as $$
  select array[
    -- gleichnamig
    '3,3','4,4','5,5','6,6','8,8','10,10','12,12',
    -- ein Nenner ist Vielfaches des anderen: nur EINE Seite erweitern
    '2,4','2,6','2,8','2,10','2,12','3,6','3,12','4,8','4,12','5,10','6,12',
    -- kleines kgV: beide Seiten erweitern, aber im Kopf
    '2,3','3,4','2,5','4,6','3,8','6,8','4,10','8,12'
  ];
$$;

revoke all on function clash_frac_pairs() from public;


-- Ein gekürzter echter Bruch zu gegebenem Nenner: Zähler 1..d-1 mit
-- ggT(Zähler, Nenner) = 1. Damit steht in der Aufgabe nie „2/4", wo
-- „1/2" gemeint ist.
create or replace function clash_frac_num(p_d int)
  returns int
  language sql
as $$
  select g.n from generate_series(1, greatest(p_d - 1, 1)) as g(n)
   where gcd(g.n, p_d) = 1
   order by random()
   limit 1;
$$;

revoke all on function clash_frac_num(int) from public;


create or replace function clash_gen_frac_addsub()
  returns jsonb
  language plpgsql
as $$
declare
  v_pairs text[] := clash_frac_pairs();
  v_pair  text;
  d1 int; d2 int; n1 int; n2 int; sw int;
  v_plus boolean;
  v_l   int;
  f     int[];
  v_alt int[];   -- das Ergebnis der ANDEREN Rechenart, als Fehler-Kachel
  an int; ad int;
begin
  v_pair := v_pairs[1 + floor(random() * array_length(v_pairs, 1))::int];
  d1 := split_part(v_pair, ',', 1)::int;
  d2 := split_part(v_pair, ',', 2)::int;
  -- Die Liste steht aufsteigend da — ohne diesen Tausch stünde der
  -- größere Nenner immer rechts, und das ist ein Muster, das Kinder
  -- schneller lernen als das Rechnen.
  if random() < 0.5 then sw := d1; d1 := d2; d2 := sw; end if;

  n1 := clash_frac_num(d1);
  n2 := clash_frac_num(d2);
  v_plus := random() < 0.5;
  v_l := (d1 * d2) / gcd(d1, d2);

  if v_plus then
    f     := clash_frac_norm(n1 * d2 + n2 * d1, d1 * d2);
    v_alt := clash_frac_norm(n1 * d2 - n2 * d1, d1 * d2);
  else
    f     := clash_frac_norm(n1 * d2 - n2 * d1, d1 * d2);
    v_alt := clash_frac_norm(n1 * d2 + n2 * d1, d1 * d2);
  end if;
  an := f[1]; ad := f[2];

  return jsonb_build_object(
    'text', clash_frac_text(n1, d1)
            || (case when v_plus then ' + ' else ' − ' end)
            || clash_frac_text(n2, d2),
    'answer',   clash_frac_text(an, ad),
    'answer_n', an,
    'answer_d', ad,
    'distract', jsonb_build_array(
      -- Zähler und Nenner einzeln verrechnet — der Klassiker
      clash_frac_text(case when v_plus then n1 + n2 else n1 - n2 end, d1 + d2),
      -- gleichnamig gemacht, aber die Zähler nicht mit erweitert
      clash_frac_text(case when v_plus then n1 + n2 else n1 - n2 end, v_l),
      -- die andere Rechenart gerechnet
      clash_frac_text(v_alt[1], v_alt[2]),
      -- multipliziert statt addiert
      clash_frac_text(n1 * n2, d1 * d2),
      clash_frac_text(an + 1, ad),
      clash_frac_text(an - 1, ad))
  );
end;
$$;

revoke all on function clash_gen_frac_addsub() from public;


create or replace function clash_gen_frac_muldiv()
  returns jsonb
  language plpgsql
as $$
declare
  n1 int; d1 int; n2 int; d2 int;
  v_mul boolean;
  f int[];
  an int; ad int;
begin
  -- Echte Brüche mit einstelligen Zahlen. Das Ergebnis einer
  -- Multiplikation ist damit höchstens 8·8/9·9 — im Kopf zu kürzen.
  d1 := 2 + floor(random() * 8)::int;    -- 2..9
  n1 := clash_frac_num(d1);
  d2 := 2 + floor(random() * 8)::int;
  n2 := clash_frac_num(d2);
  v_mul := random() < 0.5;

  if v_mul then
    f := clash_frac_norm(n1 * n2, d1 * d2);
  else
    f := clash_frac_norm(n1 * d2, d1 * n2);
  end if;
  an := f[1]; ad := f[2];

  return jsonb_build_object(
    'text', clash_frac_text(n1, d1)
            || (case when v_mul then ' · ' else ' : ' end)
            || clash_frac_text(n2, d2),
    'answer',   clash_frac_text(an, ad),
    'answer_n', an,
    'answer_d', ad,
    'distract', case when v_mul then jsonb_build_array(
        -- über Kreuz statt geradeaus
        clash_frac_text(n1 * d2, d1 * n2),
        -- nur die Zähler multipliziert
        clash_frac_text(n1 * n2, d1),
        -- Nenner addiert statt multipliziert
        clash_frac_text(n1 * n2, d1 + d2),
        clash_frac_text(ad, an),
        clash_frac_text(an + 1, ad),
        clash_frac_text(an - 1, ad))
      else jsonb_build_array(
        -- nicht gestürzt, einfach durchmultipliziert
        clash_frac_text(n1 * n2, d1 * d2),
        -- das Ergebnis selbst gestürzt
        clash_frac_text(ad, an),
        -- nur den zweiten Zähler beachtet
        clash_frac_text(n1 * d2, d1),
        clash_frac_text(n1 + n2, d1 + d2),
        clash_frac_text(an + 1, ad),
        clash_frac_text(an - 1, ad))
      end
  );
end;
$$;

revoke all on function clash_gen_frac_muldiv() from public;


create or replace function clash_gen_frac_reduce()
  returns jsonb
  language plpgsql
as $$
declare
  v_dens int[] := array[2,3,4,5,6,8,10,12];
  d int; n int; k int; p int;
begin
  d := v_dens[1 + floor(random() * array_length(v_dens, 1))::int];
  n := clash_frac_num(d);
  k := 2 + floor(random() * 5)::int;   -- 2..6, größter Nenner damit 72

  -- Ein echter Teiler von k, falls es einen gibt: „mit 2 gekürzt, wo 4
  -- nötig gewesen wäre" ist der häufigste Fehler beim Kürzen. Bei
  -- k ∈ {2,3,5} gibt es keinen — dann fällt die Kachel weg und wird
  -- von clash_q_choices aufgefüllt.
  select g.v into p from generate_series(2, k - 1) as g(v)
   where k % g.v = 0 order by random() limit 1;

  return jsonb_build_object(
    'text',     clash_frac_text(n * k, d * k),
    'answer',   clash_frac_text(n, d),
    'answer_n', n,
    'answer_d', d,
    'distract', jsonb_build_array(
      case when p is not null then clash_frac_text(n * k / p, d * k / p) end,
      clash_frac_text(n, d * k),      -- nur den Zähler gekürzt
      clash_frac_text(n * k, d),      -- nur den Nenner gekürzt
      clash_frac_text(d, n),          -- vertauscht
      clash_frac_text(n + 1, d),
      clash_frac_text(case when n > 1 then n - 1 else n + 2 end, d))
  );
end;
$$;

revoke all on function clash_gen_frac_reduce() from public;


create or replace function clash_gen_frac_compare()
  returns jsonb
  language plpgsql
as $$
declare
  v_pairs text[] := clash_frac_pairs();
  v_pair text;
  d1 int; d2 int; n1 int; n2 int; sw int; k int;
  v_cmp int;
  v_ans text;
begin
  if random() < 0.25 then
    -- Ein Viertel der Aufgaben ist ein erweiterter Zwilling: 1/2 ▢ 3/6.
    -- Ohne diesen Fall käme „=" fast nie vor — und genau dieser Fall
    -- ist der eigentliche Sinn der Übung.
    d1 := (array[2,3,4,5,6])[1 + floor(random() * 5)::int];
    n1 := clash_frac_num(d1);
    k  := 2 + floor(random() * 3)::int;   -- 2..4
    d2 := d1 * k;
    n2 := n1 * k;
    if random() < 0.5 then
      sw := d1; d1 := d2; d2 := sw;
      sw := n1; n1 := n2; n2 := sw;
    end if;
  else
    v_pair := v_pairs[1 + floor(random() * array_length(v_pairs, 1))::int];
    d1 := split_part(v_pair, ',', 1)::int;
    d2 := split_part(v_pair, ',', 2)::int;
    if random() < 0.5 then sw := d1; d1 := d2; d2 := sw; end if;
    n1 := clash_frac_num(d1);
    n2 := clash_frac_num(d2);
  end if;

  -- Beide Nenner sind positiv, deshalb reicht das Kreuzprodukt.
  v_cmp := n1 * d2 - n2 * d1;
  v_ans := case when v_cmp < 0 then '<' when v_cmp > 0 then '>' else '=' end;

  return jsonb_build_object(
    'text', clash_frac_text(n1, d1) || ' ▢ ' || clash_frac_text(n2, d2),
    'answer', v_ans,
    -- Kein Zahlenpaar: „<" ist keine Zahl. Der Wertvergleich in
    -- clash_answer_matches greift hier nicht — die Art kann ohnehin nur
    -- Auswahl (allows_free = false in clash_task_types).
    'answer_n', null,
    'answer_d', null,
    -- Feste Kacheln in fester Reihenfolge. Gemischt wären < = > eine
    -- Denksportaufgabe für sich.
    'choices_fixed', jsonb_build_array('<', '=', '>'),
    -- Die Aufgabe steht ohne „= [ ]" da: „3/4 ▢ 2/3 = <" liest sich
    -- nicht.
    'eq', false,
    'distract', jsonb_build_array()
  );
end;
$$;

revoke all on function clash_gen_frac_compare() from public;


-- ─────────────────────────────────────────────────────────────
-- 4) Aus einer Antwort und typischen Fehlern werden Kacheln
-- ─────────────────────────────────────────────────────────────
create or replace function clash_q_choices(p_answer text, p_distract jsonb,
                                           p_count int, p_strict boolean)
  returns jsonb
  language plpgsql
as $$
declare
  v_txt  text[] := array[p_answer];
  v_keys text[] := array[clash_choice_key(p_answer, p_strict)];
  d    text;
  k    text;
  a    jsonb;
  an   int;
  ad   int;
  i       int := 1;
  delta   int;
  cand    text;
  v_nozero boolean := false;
begin
  a := clash_parse_answer(p_answer);
  if a is not null then
    an := (a->>'n')::int;
    ad := (a->>'d')::int;
    -- Eine glatte „0" zwischen lauter Brüchen ist auf einen Blick als
    -- falsch zu erkennen und nimmt der Auswahl eine echte Kachel. Sie
    -- darf nur dastehen, wenn die richtige Antwort selbst 0 ist (dann
    -- ist sie kein Ausreißer, sondern die Lösung) oder wenn die Aufgabe
    -- ohnehin mit ganzen Zahlen rechnet.
    v_nozero := (ad > 1 and an <> 0);
  end if;

  -- Die Fehler-Kacheln in zufälliger Reihenfolge, damit bei mehr
  -- Vorschlägen als Plätzen nicht immer dieselben vorne stehen.
  for d in
    select value
      from jsonb_array_elements_text(coalesce(p_distract, '[]'::jsonb))
     where value is not null
     order by random()
  loop
    exit when array_length(v_txt, 1) >= p_count;
    continue when v_nozero and btrim(d) = '0';
    k := clash_choice_key(d, p_strict);
    if k is not null and not (k = any(v_keys)) then
      v_txt  := v_txt  || d;
      v_keys := v_keys || k;
    end if;
  end loop;

  -- Auffüllen, falls Fehler-Kacheln zusammengefallen oder verworfen
  -- wurden: Nachbarn der richtigen Antwort, abwechselnd darüber und
  -- darunter.
  if a is not null then
    while array_length(v_txt, 1) < p_count and i <= 60 loop
      delta := case when i % 2 = 1 then (i + 1) / 2 else -(i / 2) end;
      cand := clash_frac_text(an + delta, ad);
      if v_nozero and an + delta = 0 then
        cand := null;
      end if;
      k := clash_choice_key(cand, p_strict);
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

revoke all on function clash_q_choices(text, jsonb, int, boolean) from public;

comment on function clash_q_choices(text, jsonb, int, boolean) is
  'Baut die Antwortkacheln: richtige Antwort + typische Fehler, entdoppelt und gemischt. '
  'Entdoppelt nach WERT (3/4 = 6/8 wäre zweimal richtig), beim Kürzen nach TEXT (dort ist die '
  'ungekürzte Schreibweise die falsche Antwort).';


-- ─────────────────────────────────────────────────────────────
-- 5) Das Tipp-Layout gehört dem RAUM, nicht der Frage
-- ─────────────────────────────────────────────────────────────
-- Sönkes Vorgabe: die Tastatur soll nicht bei jeder Frage ihr Layout
-- wechseln. Also entscheidet der Pool einmal für alle Tippaufgaben —
-- ist irgendein Bruchtyp frei zu tippen, haben auch die reinen
-- Additionsaufgaben dieses Raums ± und a/b.
create or replace function clash_pool_input(p_pool jsonb)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case when exists (
    select 1
      from jsonb_each_text(coalesce(p_pool, '{}'::jsonb)) e
      join clash_task_types t on t.key = e.key
     where e.value = 'free' and t.input_mode = 'fraction'
  ) then 'fraction' else 'natural' end;
$$;

revoke all on function clash_pool_input(jsonb) from public;

comment on function clash_pool_input(jsonb) is
  'Das Tipp-Layout für ALLE freien Aufgaben eines Raums: „fraction", sobald eine frei zu tippende '
  'Bruch-Aufgabenart im Pool steht, sonst „natural". Bewusst am Pool und nicht an der Frage — '
  'sonst spränge die Tastatur mitten im Spiel.';


-- ─────────────────────────────────────────────────────────────
-- 6) clash_new_question — eine Aufgabe aus dem Pool
-- ─────────────────────────────────────────────────────────────
-- Die Fassung ohne Argument (0093) bleibt bestehen und wird von
-- niemandem mehr gerufen.
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
  v_choices jsonb := null;
  v_input   text;
begin
  -- Gleichverteilt über die AKTIVEN Unterkategorien. Der Join wirft
  -- Schlüssel weg, die es im Katalog nicht (mehr) gibt — ein Pool, der
  -- eine später entfernte Art nennt, spielt dann eben ohne sie weiter,
  -- statt gar keine Aufgabe zu liefern.
  select e.key into v_key
    from jsonb_each_text(coalesce(p_pool, '{}'::jsonb)) e
    join clash_task_types t on t.key = e.key
   where e.value in ('free', 'mc')
   order by random()
   limit 1;

  -- Notnagel: lieber die Aufgabe von gestern als ein leerer
  -- Spielbildschirm. clash_room_start lässt einen leeren Pool gar nicht
  -- erst starten, hierher kommt man nur über einen Raum, dessen Pool
  -- nachträglich unbrauchbar geworden ist.
  if v_key is null then
    v_key := 'add100';
  end if;

  select * into v_type from clash_task_types where key = v_key;

  v_mode := coalesce(p_pool->>v_key, 'free');
  if v_mode = 'free' and not coalesce(v_type.allows_free, true) then v_mode := 'mc';   end if;
  if v_mode = 'mc'   and not coalesce(v_type.allows_mc,   true) then v_mode := 'free'; end if;

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
             else clash_gen_add100()
           end;

  if v_mode = 'mc' then
    v_choices := coalesce(
      v_gen->'choices_fixed',
      clash_q_choices(v_gen->>'answer', v_gen->'distract',
                      coalesce(v_type.choice_count, 6),
                      coalesce(v_type.strict_reduced, false)));
    v_input := 'choice';
  else
    v_input := clash_pool_input(p_pool);
  end if;

  return jsonb_build_object(
    'type',     v_key,
    'mode',     v_mode,
    'input',    v_input,
    'text',     v_gen->>'text',
    'eq',       coalesce((v_gen->>'eq')::boolean, true),
    'choices',  v_choices,
    'answer',   v_gen->>'answer',
    'answer_n', v_gen->'answer_n',
    'answer_d', v_gen->'answer_d',
    'strict',   coalesce(v_type.strict_reduced, false)
  );
end;
$$;

revoke all on function clash_new_question(jsonb) from public;

comment on function clash_new_question(jsonb) is
  'Zieht eine Aufgabe aus dem Pool des Raums: gleichverteilt über die aktiven Unterkategorien, '
  'dann der Generator der Art. Enthält die LÖSUNG — was an ein Gerät geht, muss durch '
  'clash_q_public.';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_q_public — was ein Gerät sehen darf
-- ─────────────────────────────────────────────────────────────
create or replace function clash_q_public(p_q jsonb)
  returns jsonb
  language sql
  immutable
as $$
  select case when p_q is null then null
              else p_q - 'answer' - 'answer_n' - 'answer_d' - 'strict' - 'distract'
         end;
$$;

revoke all on function clash_q_public(jsonb) from public;

comment on function clash_q_public(jsonb) is
  'Streicht die Lösung aus einer Aufgabe. Die EINZIGE Stelle, die entscheidet, was ein Client von '
  'einer Frage sieht — clash_view und clash_submit rufen beide hier durch, damit die Liste nicht '
  'an zwei Orten auseinanderläuft.';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_answer_matches — stimmt die Antwort?
-- ─────────────────────────────────────────────────────────────
create or replace function clash_answer_matches(p_q jsonb, p_answer text)
  returns boolean
  language plpgsql
  immutable
as $$
declare
  v text := btrim(coalesce(p_answer, ''));
  a jsonb;
begin
  if p_q is null or v = '' then
    return false;
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
  'Prüft eine Antwort gegen die gespeicherte Aufgabe. Auswahl: die Kachel muss ausgeliefert worden '
  'sein und die richtige sein. Kürzen: Endform exakt. Sonst: gleicher Wert (6/8 = 3/4).';


-- ─────────────────────────────────────────────────────────────
-- 9) clash_ensure_player — Spätzugänge bekommen eine echte Aufgabe
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0094. Einzige Änderung: current_q statt current_a/b, und
-- der Pool des Raums kommt dafür dazu.
create or replace function clash_ensure_player(p_participant uuid, p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_phase text;
  v_pool  jsonb;
  v_team  int;
begin
  if exists (select 1 from clash_players where participant_id = p_participant) then
    return;
  end if;

  select phase, pool into v_phase, v_pool from clash_boards where room_id = p_room;
  if v_phase is null or v_phase = 'lobby' then
    return;
  end if;

  select owner_team into v_team
    from clash_tiles
   where room_id = p_room
   group by owner_team
   order by random()
   limit 1;

  if v_team is null then
    return;
  end if;

  insert into clash_players (participant_id, team_index, current_q)
  values (p_participant, v_team, clash_new_question(v_pool))
  on conflict (participant_id) do nothing;
end;
$$;

revoke all on function clash_ensure_player(uuid, uuid) from public;

comment on function clash_ensure_player(uuid, uuid) is
  'Legt eine clash_players-Zeile nur an, wenn noch keine existiert (das ist der Wiedererkennungs-'
  'Mechanismus für kurze Aussetzer). Neuzugänge während countdown/running werden zufällig einem '
  'noch lebenden Team zugelost — NICHT über die Sitzplatz-Formel, die gilt nur für den Start. '
  'Seit 0110 mit einer Aufgabe aus dem Pool des Raums.';


-- ─────────────────────────────────────────────────────────────
-- 10) clash_submit — eine Antwort abgeben
-- ─────────────────────────────────────────────────────────────
-- Grundlage: clash_submit_answer aus 0108, Wort für Wort — bis auf die
-- Frage selbst. Erobern, Serien, Ruinen-Modus und Sieg-Prüfung bleiben
-- unangetastet; hier ändert sich NUR, was eine Aufgabe ist und wie eine
-- Antwort geprüft wird.
create or replace function clash_submit(p_token text, p_answer text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p               skill_participants;
  v_room            skill_rooms;
  v_board           clash_boards;
  v_player          clash_players;
  v_correct         boolean;
  v_retry           boolean := false;   -- erster Fehlversuch: Aufgabe bleibt stehen
  v_advance         boolean := false;   -- neue Aufgabe ziehen?
  v_ruined          boolean := false;   -- Volk hat keine Kachel mehr
  v_tr              int;
  v_tc              int;
  v_tprev           int;
  v_castle          boolean := false;
  v_taken           boolean := false;   -- Besitzer hat gewechselt
  v_hit_hp          int := null;        -- Burg getroffen, aber nicht gefallen
  v_cap_res         jsonb;
  v_fire_res        jsonb;
  v_streak_old      int;
  v_solo_fire       boolean := false;
  v_pending_add     int := 0;
  v_team_streak_old int;
  v_team_streak_new int;
  v_team_streak_out int;
  v_ruin_add        int := 0;
  v_ruin_old        int;
  v_ruin_new        int := null;
  v_shrunk          jsonb := '[]'::jsonb;
  v_shr             jsonb;
  v_steps           int;
  v_reveal          text := null;       -- 0110: die Lösung der GESCHEITERTEN Aufgabe
  v_new_q           jsonb := null;
  i                 int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_running', 'phase', v_board.phase);
  end if;

  perform clash_ensure_player(v_p.id, v_room.id);
  select * into v_player from clash_players where participant_id = v_p.id;
  if v_player.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Fällige Auto-Picks (0106) zuerst auflösen — sonst könnte diese
  -- Antwort auf einem Kartenbild landen, das der Server selbst gleich
  -- noch ändert. Räumt bei einem inzwischen ausgeschiedenen Volk
  -- zugleich die offenen Picks weg (die Schleife dort bricht ab,
  -- wenn keine eigene Kachel mehr da ist).
  perform clash_expire_pending_picks(v_p.id);
  select * into v_player from clash_players where participant_id = v_p.id;

  -- 0108: KEIN Abbruch. Ein Volk ohne Kachel spielt weiter, seine
  -- Antworten zählen für die Endwertung und lassen das Spielfeld
  -- schrumpfen.
  v_ruined := not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  );

  -- Randfall: keine laufende Frage (sollte durch clash_ensure_player/
  -- clash_room_start nicht vorkommen) — dann erst eine ziehen, ohne
  -- die abgegebene Antwort zu werten.
  if v_player.current_q is null then
    v_new_q := clash_new_question(v_board.pool);
    update clash_players set current_q = v_new_q, wrong_attempt = false
     where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'correct', null,
      'question', clash_q_public(v_new_q));
  end if;

  v_correct := clash_answer_matches(v_player.current_q, p_answer);

  if v_correct then
    v_advance := true;

    -- Erobern kann nur, wer noch ein Gebiet hat, an das sich etwas
    -- anschließen ließe.
    if not v_ruined then
      v_cap_res := clash_capture_random(v_room.id, v_player.team_index);
      if (v_cap_res->'captured') is not null then
        v_taken  := true;
        v_tr     := (v_cap_res->'captured'->>'r')::int;
        v_tc     := (v_cap_res->'captured'->>'c')::int;
        v_tprev  := (v_cap_res->'captured'->>'prev_owner')::int;
        v_castle := (v_cap_res->'captured'->>'castle')::boolean;
      elsif (v_cap_res->'castle_hit') is not null then
        v_tr     := (v_cap_res->'castle_hit'->>'r')::int;
        v_tc     := (v_cap_res->'castle_hit'->>'c')::int;
        v_tprev  := (v_cap_res->'castle_hit'->>'owner')::int;
        v_hit_hp := (v_cap_res->'castle_hit'->>'hp')::int;
      end if;
    end if;

    -- Individuelle Serie: seit 0108 jedes Vielfache von 12 (war 10).
    -- Ein ausgeschiedenes Volk kann nichts aussuchen — bei ihm werden
    -- aus den zwei Feldern zwei Ruinen-Punkte.
    v_streak_old := coalesce(v_player.streak, 0);
    if floor((v_streak_old + 1) / 12.0) > floor(v_streak_old / 12.0) then
      v_solo_fire := true;
      if v_ruined then
        v_ruin_add := v_ruin_add + 2;
      else
        v_pending_add := 2;
      end if;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1, wrong_attempt = false,
           pending_picks = pending_picks + v_pending_add,
           pick_deadline = case when v_pending_add > 0 then now() + interval '6 seconds'
                                 else pick_deadline end
     where participant_id = v_p.id;

    -- Gefeiert wird die Serie in beiden Fällen: „on fire" ist eine
    -- Nachricht an die Gruppe, keine Quittung über eroberte Felder.
    if v_solo_fire then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'individual_fire',
        jsonb_build_object('name', skill_seat_name(v_p.name, v_p.seat), 'streak', v_streak_old + 1));
    end if;

    -- Geteilte Team-Serie (0106) — unabhängig von den Einzel-Serien.
    -- Die Zeile sollte durch clash_room_start/den Backfill schon
    -- existieren; Insert ist nur ein Sicherheitsnetz.
    select streak, ruin_points into v_team_streak_old, v_ruin_old
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index
      for update;
    if v_team_streak_old is null then
      insert into clash_team_streaks (room_id, team_index, streak)
      values (v_room.id, v_player.team_index, 0)
      on conflict (room_id, team_index) do nothing;
      v_team_streak_old := 0;
      v_ruin_old := 0;
    end if;
    v_team_streak_new := v_team_streak_old + 1;
    update clash_team_streaks set streak = v_team_streak_new
     where room_id = v_room.id and team_index = v_player.team_index;
    v_team_streak_out := v_team_streak_new;

    if floor(v_team_streak_new / 20.0) > floor(v_team_streak_old / 20.0) then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'team_fire',
        jsonb_build_object('streak', v_team_streak_new));
      if v_ruined then
        v_ruin_add := v_ruin_add + 5;
      else
        -- Seit 0108 fünf Felder statt sieben.
        for i in 1..5 loop
          exit when not exists (
            select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
          );
          v_fire_res := clash_capture_random(v_room.id, v_player.team_index);
          exit when (v_fire_res->'captured') is null and (v_fire_res->'castle_hit') is null;
          if (v_fire_res->'captured') is not null and clash_check_win(v_room.id) then
            exit;
          end if;
        end loop;
      end if;
    end if;

    -- 0108: Ruinen-Punkte. Die Schwelle wird EINMAL geprüft, nicht je
    -- Teilbetrag — sonst zählte eine Antwort, die zugleich eine
    -- Einzel- und eine Team-Serie abschließt, dreimal gegen dieselbe
    -- Zehnerstufe. Die Schleife ist Vorsorge: heute liegt v_ruin_add
    -- bei höchstens 8 (1+2+5), überspringt also nie mehr als eine
    -- Stufe.
    if v_ruined then
      v_ruin_add := v_ruin_add + 1;
      v_ruin_old := coalesce(v_ruin_old, 0);
      v_ruin_new := v_ruin_old + v_ruin_add;
      update clash_team_streaks set ruin_points = v_ruin_new
       where room_id = v_room.id and team_index = v_player.team_index;

      v_steps := floor(v_ruin_new / 10.0)::int - floor(v_ruin_old / 10.0)::int;
      for i in 1..greatest(v_steps, 0) loop
        v_shr := clash_shrink_board(v_room.id, v_player.team_index);
        v_shrunk := v_shrunk || jsonb_build_array(v_shr);
        exit when not coalesce((v_shr->>'shrunk')::boolean, false);
      end loop;
    end if;

  elsif not coalesce(v_player.wrong_attempt, false) then
    -- Erster Fehlversuch zu dieser Aufgabe: nur „nochmal versuchen",
    -- die Aufgabe bleibt stehen. Streak bricht trotzdem sofort — das
    -- war schon vor 0101 so, und die Team-Serie folgt seit 0106
    -- exakt derselben Regel.
    v_retry := true;
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = true
     where participant_id = v_p.id;
    update clash_team_streaks set streak = 0
     where room_id = v_room.id and team_index = v_player.team_index;
    select streak into v_team_streak_out
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index;

  else
    -- Zweiter Fehlversuch in Folge: jetzt wird aufgelöst. current_q ist
    -- noch die gescheiterte Aufgabe — die Lösung merken, BEVOR sie
    -- gleich von der neuen überschrieben wird.
    v_advance := true;
    v_reveal := v_player.current_q->>'answer';
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = false
     where participant_id = v_p.id;
    update clash_team_streaks set streak = 0
     where room_id = v_room.id and team_index = v_player.team_index;
    select streak into v_team_streak_out
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index;
  end if;

  if v_advance then
    v_new_q := clash_new_question(v_board.pool);
    update clash_players set current_q = v_new_q where participant_id = v_p.id;
  end if;

  -- Nur ein echter Besitzerwechsel kann ein Volk ausgelöscht haben.
  -- Das Schrumpfen kann es per Konstruktion nicht (Burgen sind tabu,
  -- und unter fünf Kacheln fällt niemand), deshalb steht hier
  -- weiterhin nur v_taken.
  if v_taken then
    perform clash_check_win(v_room.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'retry', v_retry,
    'eliminated', v_ruined,
    'reveal', case when v_reveal is not null
                 then jsonb_build_object('text', v_reveal)
                 else null end,
    'captured', case when v_taken
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'prev_owner', v_tprev,
                                         'castle', v_castle, 'hp', 3)
                 else null end,
    'castle_hit', case when v_hit_hp is not null
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'hp', v_hit_hp,
                                         'owner', v_tprev)
                 else null end,
    'streak', (select streak from clash_players where participant_id = v_p.id),
    'team_streak', v_team_streak_out,
    'ruin', case when v_ruin_new is null then null
                 else jsonb_build_object('points', v_ruin_new,
                                         'to_next', 10 - (v_ruin_new % 10)) end,
    'shrunk', v_shrunk,
    'board', clash_shrink_state(v_room.id),
    'pending_picks', (select pending_picks from clash_players where participant_id = v_p.id),
    'pick_deadline', (select pick_deadline from clash_players where participant_id = v_p.id),
    'question', case when v_advance then clash_q_public(v_new_q) else null end
  );
end;
$$;

revoke all on function clash_submit(text, text) from public;
grant execute on function clash_submit(text, text) to anon, authenticated;

comment on function clash_submit(text, text) is
  'Eine Antwort abgeben — die Aufgabe kommt seit 0110 aus dem Aufgabenpool des Raums, die Antwort '
  'ist Text („7/8", „-3/4", „<"). Erobern, Serien-Boni (0106) und Ruinen-Modus (0108) unverändert. '
  'Löst clash_submit_answer ab, das nur noch durchreicht.';


-- Der alte Name bleibt bestehen und reicht durch. Ein Tablet, das noch
-- das gecachte tool.js von vorhin geladen hat, spielt damit während des
-- Deploys weiter — es kann nur keine Bruchantwort schicken, und das
-- muss es auch nicht: dort läuft noch das alte Spiel.
create or replace function clash_submit_answer(p_token text, p_answer int)
  returns jsonb
  security definer
  set search_path = public
  language sql
as $$
  select clash_submit(p_token, p_answer::text);
$$;

revoke all on function clash_submit_answer(text, int) from public;
grant execute on function clash_submit_answer(text, int) to anon, authenticated;

comment on function clash_submit_answer(text, int) is
  'Weiterreicher an clash_submit seit 0110 — nur noch für Geräte, die den alten Client gecacht '
  'haben. Neue Aufrufe gehen an clash_submit(text, text).';


-- ─────────────────────────────────────────────────────────────
-- 11) clash_view — die Aufgabe ohne ihre Lösung
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0108. Eine Zeile ändert sich (v_question), alles andere
-- steht unverändert da.
create or replace function clash_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p            skill_participants;
  v_room         skill_rooms;
  v_board        clash_boards;
  v_player       clash_players;
  v_my_team      int;
  v_alive        boolean := true;
  v_question     jsonb := null;
  v_teams        jsonb;
  v_correct      jsonb;
  v_my_members   jsonb := '[]'::jsonb;
  v_tiles        jsonb;
  v_online_count int;
  v_room_total   int;
  v_team_streak  int := null;
  v_ruin         int := null;
  v_events       jsonb := '[]'::jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  -- Muss VOR clash_preview_teams laufen, sonst zählt sich der
  -- aufrufende Teilnehmer bei einem gerade erst abgelaufenen
  -- 1-Minuten-Fenster selbst noch nicht als online.
  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  if v_board.phase = 'lobby' then
    select team_index into v_my_team
      from clash_preview_teams(v_room.id)
     where participant_id = v_p.id;
  else
    perform clash_ensure_player(v_p.id, v_room.id);
    perform clash_expire_pending_picks(v_p.id);   -- 0106
    select * into v_player from clash_players where participant_id = v_p.id;
    v_my_team := v_player.team_index;
    if v_board.phase = 'running' then
      v_alive := exists (
        select 1 from clash_tiles where room_id = v_room.id and owner_team = v_my_team
      );
      -- 0108: die Aufgabe hängt NICHT an v_alive. Ein ausgeschiedenes
      -- Volk spielt weiter — ohne Aufgabe stünde sein Spielbildschirm
      -- leer da. Nur wer gar kein Volk hat (kam nach dem Start dazu und
      -- wurde noch nicht gelost), bekommt keine.
      -- 0110: durch clash_q_public — `answer` wäre hier die Lösung
      -- selbst und stünde im Netzwerk-Protokoll jedes Tablets.
      if v_my_team is not null then
        v_question := clash_q_public(v_player.current_q);
      end if;
    end if;
  end if;

  -- Die eigene Gruppe, sortiert nach Sitzplatz, damit die Reihenfolge
  -- zwischen zwei Abrufen nicht springt. Ohne eigenes Volk (nicht
  -- online, noch keine Zuordnung) bleibt die Liste leer.
  if v_my_team is not null then
    if v_board.phase = 'lobby' then
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_preview_teams(v_room.id) t
        join skill_participants p on p.id = t.participant_id
       where t.team_index = v_my_team;
    else
      -- clash_players trägt keine room_id — der Join über den
      -- Teilnehmer grenzt auf diesen Raum ein.
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_players pl
        join skill_participants p on p.id = pl.participant_id
       where p.room_id = v_room.id and pl.team_index = v_my_team;

      -- Team-Serie + Ereignisse (0106), Ruinen-Punkte (0108) — nur ab
      -- dem Start, nur fürs eigene Team.
      select streak, ruin_points into v_team_streak, v_ruin
        from clash_team_streaks where room_id = v_room.id and team_index = v_my_team;

      select coalesce(jsonb_agg(
               jsonb_build_object('id', id, 'kind', kind, 'payload', payload) order by id), '[]'::jsonb)
        into v_events
        from clash_team_events
       where room_id = v_room.id and team_index = v_my_team;
    end if;
  end if;

  v_tiles := clash_tiles_json(v_room.id);

  v_correct := clash_team_correct(v_room.id);

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_correct_counts', v_correct,
    'team_streak', v_team_streak,
    'ruin', jsonb_build_object('points',  coalesce(v_ruin, 0),
                               'to_next', 10 - (coalesce(v_ruin, 0) % 10)),
    'board', clash_shrink_state(v_room.id),
    'my_team_members', v_my_members,
    'my_team_events', v_events,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'me', jsonb_build_object(
      'team',    v_my_team,
      'alive',   v_alive,
      'streak',  coalesce(v_player.streak, 0),
      'question', v_question,
      'seat',    v_p.seat,
      'name',    skill_seat_name(v_p.name, v_p.seat),
      'pending_picks', coalesce(v_player.pending_picks, 0),
      'pick_deadline', v_player.pick_deadline
    )
  );
end;
$$;

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;

comment on function clash_view(text) is
  'Teilnehmer-Ansicht von Kingdoms of Mathoria. Seit 0098 my_team_members und me.name, seit 0099 '
  'team_correct_counts, seit 0100 Burg-Leben, seit 0106 team_streak/my_team_events/pending_picks, '
  'seit 0108 Ruinen-Modus. Seit 0110 ist me.question ein Objekt aus dem Aufgabenpool — durch '
  'clash_q_public, ohne die Lösung.';


-- ─────────────────────────────────────────────────────────────
-- 12) clash_room_start — kein Start ohne Aufgaben
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0108. Zwei Änderungen: der Pool wird geprüft, und die
-- erste Aufgabe jedes Kindes kommt aus ihm.
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
  -- Der leere Pool ist beim Speichern erlaubt (Zwischenstand beim
  -- Umsortieren, siehe clash_normalize_pool) — hier ist er das Ende.
  v_pool := clash_normalize_pool(v_board.pool);
  if v_pool is null or v_pool = '{}'::jsonb then
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
  'aus dem Pool. Seit 0110 Abbruch mit pool_empty, wenn keine Aufgabenart gewählt ist.';
