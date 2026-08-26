-- ══════════════════════════════════════════════════════════════
-- Migration 0114 — Kingdoms of Mathoria: Zahlensysteme
-- ══════════════════════════════════════════════════════════════
-- Die dritte Oberkategorie neben Grundrechenarten (0109) und
-- Bruchrechnung (0110): Binär und Hexadezimal, je in beide Richtungen,
-- Werte bis 255. Dazu eine Art, die niemand anklickt:
--
--   Bin ↔ Hex (0 … FFF) kommt von selbst dazu, sobald Binär UND
--   Hexadezimal im Pool stehen und auf DERSELBEN Einstellung
--   (beide „tippen" oder beide „auswählen").
--
-- Das ist der eigentlich neue Gedanke dieser Migration: eine
-- Aufgabenart, die keine Wahl der Lehrkraft ist, sondern eine FOLGE aus
-- zwei Wahlen. Sie steht deshalb nicht in `clash_boards.pool` — dort
-- steht nur, was jemand angeklickt hat — sondern wird bei jeder Ziehung
-- neu abgeleitet (clash_task_types.derived + .requires).
--
-- ── Was hier grundsätzlich dazukommt ───────────────────────────
-- Bis 0110 war eine Antwort ein WERT: „6/8" und „3/4" sind dasselbe,
-- „007" und „7" auch. Bei Zahlensystemen ist die Antwort eine
-- ZIFFERNFOLGE — „FF" ist keine Zahl, die ein Bruch tragen könnte, und
-- „11" ist binär etwas anderes als dezimal. Deshalb bekommt der Katalog
-- ein `answer_kind`:
--
--   'number'  Wertvergleich wie bisher (Brüche, Addition)
--   'digits'  normalisierter Textvergleich (clash_num_norm)
--
-- Normalisiert heißt: Leerzeichen weg, Großbuchstaben, führende Nullen
-- weg. Sönkes Vorgabe: „0011 0011" und „11 0011" sind BEIDE richtig.
-- Die Vierergruppen setzt das Programm, nicht das Kind.
--
-- ── Die Tastatur ───────────────────────────────────────────────
-- Sönkes Vorgabe: eine Tastatur mit den Ziffern 0…F, ohne + und −, und
-- die Ziffern, die die Zielbasis nicht kennt, sind AUSGEGRAUT statt
-- weggenommen. Das Raster steht damit still, nur die Beschaltung
-- wechselt — dieselbe Zusage wie in 0110 („die Tastatur springt nicht
-- von Frage zu Frage").
--
-- Neu ist nur, dass die Beschaltung jetzt an der FRAGE hängt
-- (`digits`, `ops`, `maxlen`) statt an einer Tabelle im Client: bei
-- „(173)₁₀ = (▢)₂" sind nur 0 und 1 hell, bei „(1010 1111)₂ = (▢)₁₆"
-- alle sechzehn. Das LAYOUT bleibt weiterhin Sache des Raums
-- (clash_pool_input).
--
-- ── Warum keine Erweiterung von input_mode ─────────────────────
-- clash_task_types.input_mode trägt seit 0109 ein
-- `check (input_mode in ('natural','fraction'))`. Es zu weiten hieße es
-- zu droppen. Stattdessen: neue Spalte `keypad` mit eigenem Check,
-- input_mode bleibt als toter Buchstabe stehen — dasselbe Muster wie
-- current_a/current_b in 0110. clash_pool_input liest
-- coalesce(keypad, input_mode), damit die fünf Altzeilen auch ohne
-- Backfill nie ins Leere zeigen.
--
-- ⚠️ Neu deklariert werden clash_normalize_pool (Basis 0109),
-- clash_task_catalog (Basis 0111), clash_pool_input, clash_new_question
-- und clash_answer_matches (Basis jeweils 0110) — jede aus ihrer
-- HÖCHSTEN bestehenden Fassung (Regel:
-- feedback_shop_state_merge_regressions).
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- Seed mit `on conflict … do update` (Regel:
-- feedback_stale_reference_data_do_nothing).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Vier neue Spalten am Katalog
-- ─────────────────────────────────────────────────────────────
-- `add column if not exists` genügt für alle vier: es sind reine
-- Referenzdaten, die der Seed weiter unten ohnehin für jede Zeile setzt.
-- Es gibt nichts, was ein zweiter Lauf einer Lehrkraft wegnehmen könnte
-- (anders als bei clash_boards.pool in 0109).
alter table clash_task_types add column if not exists keypad      text;
alter table clash_task_types add column if not exists derived     boolean not null default false;
alter table clash_task_types add column if not exists requires    text[]  not null default '{}';
alter table clash_task_types add column if not exists answer_kind text    not null default 'number';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname  = 'clash_task_types_keypad_ck'
       and conrelid = 'public.clash_task_types'::regclass
  ) then
    alter table clash_task_types
      add constraint clash_task_types_keypad_ck
      check (keypad is null or keypad in ('natural', 'fraction', 'numsys'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname  = 'clash_task_types_answer_kind_ck'
       and conrelid = 'public.clash_task_types'::regclass
  ) then
    alter table clash_task_types
      add constraint clash_task_types_answer_kind_ck
      check (answer_kind in ('number', 'digits'));
  end if;
end $$;

comment on column clash_task_types.keypad is
  'Tastatur-Layout dieser Art: natural · fraction · numsys. Löst input_mode ab (dessen Check '
  'kennt nur die ersten beiden). clash_pool_input liest coalesce(keypad, input_mode).';
comment on column clash_task_types.input_mode is
  'Tot seit 0114 — abgelöst durch keypad. Bleibt stehen, weil hier nichts gedroppt wird.';
comment on column clash_task_types.derived is
  'true = die Lehrkraft kann diese Art nicht wählen; sie ergibt sich aus anderen (siehe requires). '
  'Steht nie in clash_boards.pool, wird bei jeder Ziehung neu abgeleitet.';
comment on column clash_task_types.requires is
  'Nur bei derived: die Schlüssel, die ALLE im Pool stehen müssen, und zwar mit DEMSELBEN Wert. '
  'Diese Art erbt dann genau diesen Wert (free/mc).';
comment on column clash_task_types.answer_kind is
  'number = die Antwort ist ein Wert (6/8 = 3/4). digits = die Antwort ist eine Ziffernfolge und '
  'wird über clash_num_norm verglichen (führende Nullen und Vierergruppen zählen nicht).';

-- Die fünf Zeilen aus 0109/0110 bekommen ihr Layout in der neuen Spalte.
-- Gezielte Updates statt eines vollständigen Seeds: sonst müsste hier
-- jede andere Spalte mitgeschleppt und bei jeder späteren Änderung
-- nachgezogen werden (dieselbe Überlegung wie in 0111).
update clash_task_types set keypad = 'natural'  where key = 'add100';
update clash_task_types set keypad = 'fraction' where key in
  ('frac_addsub', 'frac_muldiv', 'frac_reduce', 'frac_compare');


-- ─────────────────────────────────────────────────────────────
-- 2) Zahlen-Handwerkszeug
-- ─────────────────────────────────────────────────────────────
-- Alles neue Funktionen. Das Bruch-Handwerkszeug aus 0110
-- (clash_frac_*, clash_parse_answer, clash_q_choices) wird nicht
-- angefasst — die Bruchaufgaben bleiben Wort für Wort, was sie sind.

-- Eine Zahl als Ziffernfolge zur Basis 2 … 16. Ohne führende Nullen:
-- die Minimalform ist die, die das Kind tippt, und die Vierergruppen
-- kommen erst bei der Anzeige dazu.
--
-- Selbst gerechnet statt to_hex()/to_bin(): to_bin() gibt es erst ab
-- PostgreSQL 17, und zwei verschiedene Wege für zwei Basen wären zwei
-- Stellen, an denen dasselbe schiefgehen kann.
create or replace function clash_num_text(p_val int, p_base int)
  returns text
  language plpgsql
  immutable
as $$
declare
  v      int  := abs(coalesce(p_val, 0));
  s      text := '';
  digits text := '0123456789ABCDEF';
begin
  if p_base is null or p_base < 2 or p_base > 16 then
    return null;
  end if;
  if v = 0 then
    return '0';
  end if;
  while v > 0 loop
    s := substr(digits, (v % p_base) + 1, 1) || s;
    v := v / p_base;   -- Ganzzahldivision
  end loop;
  return s;
end;
$$;

revoke all on function clash_num_text(int, int) from public;

comment on function clash_num_text(int, int) is
  'Zahl → Ziffernfolge zur Basis 2…16, Großbuchstaben, ohne führende Nullen.';


-- Der Rückweg. NULL bei allem, was keine Ziffernfolge dieser Basis ist
-- — der Aufrufer wertet das als „keine Antwort", nicht als Fehler.
create or replace function clash_num_val(p_text text, p_base int)
  returns int
  language plpgsql
  immutable
as $$
declare
  s      text   := upper(replace(btrim(coalesce(p_text, '')), ' ', ''));
  v      bigint := 0;
  i      int;
  d      int;
  digits text   := '0123456789ABCDEF';
begin
  if p_base is null or p_base < 2 or p_base > 16 then
    return null;
  end if;
  -- Der Längenriegel ist kein Geschmack, sondern der Schutz vor einer
  -- Eingabe, die den int sprengt und die ganze RPC mit einer Ausnahme
  -- abbrechen ließe.
  if s = '' or length(s) > 16 then
    return null;
  end if;
  for i in 1..length(s) loop
    d := position(substr(s, i, 1) in substr(digits, 1, p_base)) - 1;
    if d < 0 then
      return null;
    end if;
    v := v * p_base + d;
    if v > 2147483647 then
      return null;
    end if;
  end loop;
  return v::int;
end;
$$;

revoke all on function clash_num_val(text, int) from public;

comment on function clash_num_val(text, int) is
  'Ziffernfolge → Zahl, zur Basis 2…16. NULL, wenn ein Zeichen nicht zur Basis gehört oder die '
  'Folge zu lang ist.';


-- Vierergruppen von RECHTS: „110011" wird „11 0011". Sönkes Vorgabe —
-- die Lücke setzt das Programm.
--
-- Greift praktisch nur bei Binärzahlen: dezimal geht es hier bis 4095
-- und hexadezimal bis FFF, beides höchstens vier Stellen.
create or replace function clash_num_group(p_digits text)
  returns text
  language plpgsql
  immutable
as $$
declare
  s    text := replace(coalesce(p_digits, ''), ' ', '');
  out  text;
  n    int;
  at   int;
begin
  n := length(s);
  if n <= 4 then
    return s;
  end if;
  -- Die erste Gruppe ist die kurze: 12 Stellen werden 4·4·4, 6 Stellen
  -- werden 2·4 — von rechts gezählt, wie die Stellenwerte selbst.
  at  := n % 4;
  if at = 0 then at := 4; end if;
  out := substr(s, 1, at);
  while at < n loop
    out := out || ' ' || substr(s, at + 1, 4);
    at  := at + 4;
  end loop;
  return out;
end;
$$;

revoke all on function clash_num_group(text) from public;

comment on function clash_num_group(text) is
  'Ziffernfolge in Vierergruppen von rechts („11 0011"). Nur Anzeige — die gespeicherte Antwort '
  'trägt nie ein Leerzeichen.';


-- Die EINE Stelle, die entscheidet, wann zwei Schreibweisen dieselbe
-- Antwort sind: für den Vergleich in clash_answer_matches UND für die
-- Entdopplung der Kacheln in clash_num_choices. Zwei Listen, die
-- auseinanderlaufen können, gibt es hier nicht.
--
-- Leerzeichen weg (die Vierergruppen sind Anzeige), Großbuchstaben
-- (ein „ff" ist dasselbe wie „FF"), führende Nullen weg (Sönkes
-- Vorgabe: „0011 0011" und „11 0011" sind beide richtig). Die einzelne
-- Null bleibt stehen — sie ist eine Antwort, kein Vorzeichen.
create or replace function clash_num_norm(p_text text)
  returns text
  language plpgsql
  immutable
as $$
declare
  s text := upper(replace(btrim(coalesce(p_text, '')), ' ', ''));
begin
  if s = '' or length(s) > 16 or s !~ '^[0-9A-F]+$' then
    return null;
  end if;
  return coalesce(nullif(ltrim(s, '0'), ''), '0');
end;
$$;

revoke all on function clash_num_norm(text) from public;

comment on function clash_num_norm(text) is
  'Normalform einer Ziffernfolge: ohne Leerzeichen, groß, ohne führende Nullen. NULL, wenn es '
  'keine Ziffernfolge ist. Entscheidet über Richtig/Falsch und über doppelte Kacheln.';


-- Die erlaubten Zeichen einer Basis — genau das, was die Tastatur hell
-- lässt.
create or replace function clash_num_digits(p_base int)
  returns text
  language sql
  immutable
as $$
  select substr('0123456789ABCDEF', 1, greatest(coalesce(p_base, 10), 2));
$$;

revoke all on function clash_num_digits(int) from public;


-- ── Drei Fehlerquellen als Funktion ────────────────────────────
-- Die falschen Kacheln sind typische FEHLER, keine Zufallszahlen
-- (dieselbe Regel wie bei den Brüchen in 0110). Drei davon kommen
-- mehrfach vor und stehen deshalb hier.

-- Ein einzelnes Bit gekippt — der Verleser beim Umrechnen.
--
-- Gekippt wird nur INNERHALB der Stellen, die die Zahl schon hat. Ein
-- Bit darüber zu setzen macht aus einer vierstelligen Antwort eine
-- achtstellige Kachel, und die ist dann nicht mehr falsch, sondern
-- offensichtlich falsch.
--
-- ⚠️ plpgsql und nicht SQL: in einem CASE-Ausdruck stünde random() in
-- der Bedingung UND im Ergebnis, würde zweimal ausgewertet, und die
-- geprüfte Zahl wäre eine andere als die zurückgegebene.
create or replace function clash_num_flip(p_val int)
  returns int
  language plpgsql
as $$
declare
  w int := length(clash_num_text(p_val, 2));
  v int := p_val # (1 << (floor(random() * greatest(w, 1))::int));
begin
  -- Eine glatte 0 zwischen lauter Umrechnungen ist auf einen Blick als
  -- falsch zu erkennen und nimmt der Auswahl eine echte Kachel.
  if v = 0 then
    return p_val + 1;
  end if;
  return v;
end;
$$;

revoke all on function clash_num_flip(int) from public;

-- Die Halbbytes in umgekehrter Reihenfolge gelesen — der häufigste
-- Fehler beim Gruppieren.
--
-- ⚠️ Über die HEX-SCHREIBWEISE und nicht über den Wert. Ein
-- Bit-Tausch am 12-Bit-Wort macht aus 0x75 die Zahl 0x570: dieselbe
-- Verwechslung, aber zwei Stellen mehr, und damit eine Kachel, die
-- niemand mehr prüfen muss. Über die Schreibweise wird daraus 0x57 —
-- gleich lang, gleich plausibel, trotzdem falsch.
create or replace function clash_num_nibswap(p_val int)
  returns int
  language sql
  immutable
as $$
  select clash_num_val(reverse(clash_num_text(p_val, 16)), 16);
$$;

revoke all on function clash_num_nibswap(int) from public;

-- Das LETZTE Halbbyte rückwärts gelesen — der Halbbyte-Fehler für
-- Aufgaben, die binär geantwortet werden.
--
-- ⚠️ Warum nicht auch dort clash_num_nibswap: der Tausch ist in der
-- Hex-Schreibweise längentreu, in der Binär-Schreibweise nicht. Aus
-- 0x17 („1 0111", fünf Stellen) wird 0x71 („111 0001", sieben) — und
-- zwei Stellen mehr sind wieder der Wink, den es nicht geben soll. Die
-- oberen Bits bleiben hier unangetastet, die Stellenzahl damit auch.
create or replace function clash_num_lownibrev(p_val int)
  returns int
  language sql
  immutable
as $$
  select (p_val - (p_val & 15))
       + ( ((p_val & 1) << 3) | ((p_val & 2) << 1)
         | ((p_val & 4) >> 1) | ((p_val & 8) >> 3) );
$$;

revoke all on function clash_num_lownibrev(int) from public;

-- Eine Hexzahl mit dem Stellenwert 10 gelesen: „AF" wird 10·10 + 15 =
-- 115 statt 175. Der Klassiker bei hex → dez, und deshalb eine Kachel,
-- die genau danach aussieht.
create or replace function clash_num_misread(p_text text, p_as int)
  returns int
  language plpgsql
  immutable
as $$
declare
  s text   := upper(replace(btrim(coalesce(p_text, '')), ' ', ''));
  v bigint := 0;
  i int;
  d int;
begin
  if s = '' or length(s) > 12 then
    return null;
  end if;
  for i in 1..length(s) loop
    d := position(substr(s, i, 1) in '0123456789ABCDEF') - 1;
    if d < 0 then
      return null;
    end if;
    v := v * coalesce(p_as, 10) + d;
    if v > 2147483647 then
      return null;
    end if;
  end loop;
  return v::int;
end;
$$;

revoke all on function clash_num_misread(text, int) from public;

-- Die Buchstabenziffern als Alphabet-Position gezählt: A = 1 statt 10,
-- F = 6 statt 15. Der zweite Klassiker bei hex → dez — wer weiß, dass
-- Buchstaben Ziffern sind, aber nicht, WELCHE. „AF" wird damit
-- 1·16 + 6 = 22.
create or replace function clash_num_letterval(p_text text)
  returns int
  language plpgsql
  immutable
as $$
declare
  s text   := upper(replace(btrim(coalesce(p_text, '')), ' ', ''));
  v bigint := 0;
  i int;
  d int;
begin
  if s = '' or length(s) > 12 then
    return null;
  end if;
  for i in 1..length(s) loop
    d := position(substr(s, i, 1) in '0123456789ABCDEF') - 1;
    if d < 0 then
      return null;
    end if;
    if d >= 10 then
      d := d - 9;      -- A → 1, B → 2, … F → 6
    end if;
    v := v * 16 + d;
    if v > 2147483647 then
      return null;
    end if;
  end loop;
  return v::int;
end;
$$;

revoke all on function clash_num_letterval(text) from public;

-- Eine DEZIMALE Fehler-Kachel nur dann, wenn sie so viele Stellen hat
-- wie die Lösung — sonst NULL, und clash_num_choices füllt mit einem
-- Nachbarwert nach.
--
-- ⚠️ Das ist der Ersatz für das Auffüllen mit führenden Nullen, das
-- clash_num_choices bei Basis 2 und 16 macht: „008" schreibt niemand,
-- also muss die Kachel hier von sich aus passen. Es trifft vor allem
-- den Halbbyte-Tausch — aus 0x90 (144) wird 0x09, und eine einstellige
-- Kachel neben lauter dreistelligen ist keine Verwechslung mehr,
-- sondern ein Wink.
create or replace function clash_num_dec(p_cand int, p_ref int)
  returns text
  language sql
  immutable
as $$
  select case when p_cand is not null and p_cand >= 0
               and length(p_cand::text) = length(p_ref::text)
              then p_cand::text end;
$$;

revoke all on function clash_num_dec(int, int) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Die Kacheln für Ziffernfolgen
-- ─────────────────────────────────────────────────────────────
-- Zwilling von clash_q_choices (0110), aber für Ziffernfolgen:
-- entdoppelt über clash_num_norm statt über den Bruchwert, füllt mit
-- Nachbarn IN DER ZIELBASIS auf statt mit Nachbarbrüchen.
--
-- Bewusst eine eigene Funktion und keine Überladung: clash_q_choices
-- bleibt damit unangetastet, und die Bruchaufgaben können von dieser
-- Migration gar nicht betroffen sein.
--
-- Die Vierergruppen kommen hier drauf, nicht beim Generator — dann
-- tragen ALLE Kacheln dieselbe Schreibweise, auch die aufgefüllten.
create or replace function clash_num_choices(p_answer text, p_distract jsonb,
                                             p_count int, p_base int, p_width int)
  returns jsonb
  language plpgsql
as $$
declare
  v_txt  text[] := array[p_answer];
  v_keys text[] := array[clash_num_norm(p_answer)];
  d      text;
  k      text;
  cand   text;
  v_val  int;
  i      int := 1;
  delta  int;
begin
  for d in
    select value
      from jsonb_array_elements_text(coalesce(p_distract, '[]'::jsonb))
     where value is not null
     order by random()
  loop
    exit when array_length(v_txt, 1) >= p_count;
    -- Zu lang für die Zielbasis: eine Kachel mit mehr Stellen als die
    -- feste Breite ließe sich ohne Rechnen ausschließen.
    continue when p_base <> 10 and length(replace(d, ' ', '')) > p_width;
    k := clash_num_norm(d);
    if k is not null and not (k = any(v_keys)) then
      v_txt  := v_txt  || d;
      v_keys := v_keys || k;
    end if;
  end loop;

  -- Auffüllen, falls Fehler-Kacheln zusammengefallen sind: Nachbarwerte
  -- der richtigen Antwort, abwechselnd darüber und darunter. Negative
  -- gibt es hier nicht — eine Zahl unter null hat in keinem dieser
  -- Zahlensysteme eine Schreibweise.
  v_val := clash_num_val(p_answer, p_base);
  if v_val is not null then
    while array_length(v_txt, 1) < p_count and i <= 60 loop
      delta := case when i % 2 = 1 then (i + 1) / 2 else -(i / 2) end;
      cand  := case when v_val + delta >= 0
                    then clash_num_text(v_val + delta, p_base) end;
      -- Derselbe Riegel wie oben: ein Nachbarwert kann über die feste
      -- Breite hinauslaufen (4095 + 1 hat dreizehn Bit statt zwölf).
      if p_base <> 10 and cand is not null and length(cand) > p_width then
        cand := null;
      end if;
      k := clash_num_norm(cand);
      if k is not null and not (k = any(v_keys)) then
        v_txt  := v_txt  || cand;
        v_keys := v_keys || k;
      end if;
      i := i + 1;
    end loop;
  end if;

  /* ⚠️ Alle Kacheln auf DIESELBE Stellenzahl bringen, mit führenden
     Nullen aufgefüllt auf die feste Breite der Zielbasis.

     Ohne das ist die Stellenzahl selbst die Antwort: „1001 0000" hat
     acht Stellen, sein gedrehtes Halbbyte-Gegenstück „1001" nur vier,
     und wer zählen kann, muss nicht rechnen. Alle Fehler dieser
     Aufgabenwelt (Bits gekippt, Halbbytes gedreht, eine Stelle
     verrutscht) verschieben die Länge — sie einzeln abzufangen hieße,
     die guten Fehler wegzuwerfen.

     ⚠️ Die Breite ist die der AUFGABENART (ein Byte hat acht Stellen,
     0…FFF drei), nicht die der längsten Kachel. Sonst hinge sie am
     Zufall: eine einzige dreistellige Kachel gäbe allen anderen eine
     führende Null, und die eine ohne wäre wieder die auffällige.

     Für DEZIMAL wird nicht aufgefüllt — „008" schreibt niemand. Dort
     achten die Generatoren selbst darauf, keine Kachel mit anderer
     Stellenzahl anzubieten (clash_num_dec).

     Die AUFGABE bleibt davon unberührt: sie steht in der Minimalform da
     („11 0011", Sönkes Vorgabe), und die getippte Antwort darf beides
     sein (clash_num_norm). */
  if p_base <> 10 then
    select array_agg(lpad(t, p_width, '0')) into v_txt from unnest(v_txt) t;
  end if;

  select array_agg(clash_num_group(t) order by random()) into v_txt from unnest(v_txt) t;
  return to_jsonb(v_txt);
end;
$$;

revoke all on function clash_num_choices(text, jsonb, int, int, int) from public;

comment on function clash_num_choices(text, jsonb, int, int, int) is
  'Antwortkacheln für Zahlensystem-Aufgaben: richtige Antwort + typische Fehler, entdoppelt über '
  'clash_num_norm und in Vierergruppen gesetzt. Aufgefüllt mit Nachbarwerten in der Zielbasis.';


-- ─────────────────────────────────────────────────────────────
-- 4) Die Generatoren
-- ─────────────────────────────────────────────────────────────
-- Form wie die Bruch-Generatoren aus 0110, plus fünf Felder, die
-- Zahlensysteme brauchen:
--
--   base_from  die Basis, in der die Aufgabe dasteht
--   base_to    die Basis, in der geantwortet wird (steht als Index am
--              Eingabefeld)
--   digits     welche Zeichen die Tastatur hell lässt
--   maxlen     wie viele Stellen eingetippt werden dürfen — die volle
--              Breite der Zielbasis, damit führende Nullen möglich
--              sind, aber nicht endlos
--   ops        welche Zusatztasten gelten (hier: keine — kein ±, kein
--              a/b). Leeres Array, nicht fehlend: „keine" ist etwas
--              anderes als „nicht gesagt".
--
-- Der Aufgabentext trägt seine Basis als Index mit: „(11 0011)_2". Aus
-- dem „_2" macht der Client die tiefgestellte Ziffer — der Server
-- braucht dafür kein zweites Anzeigeformat, genau wie beim Bruchstrich
-- in 0110.

-- Ein Baustein für alle drei: aus Wert, Quell- und Zielbasis wird der
-- gemeinsame Teil der Antwort. Die Fehler-Kacheln hängt der Generator
-- selbst an, sie sind je Richtung andere.
create or replace function clash_num_shell(p_val int, p_from int, p_to int, p_width int)
  returns jsonb
  language sql
as $$
  select jsonb_build_object(
    'text',      '(' || clash_num_group(clash_num_text(p_val, p_from)) || ')_' || p_from::text,
    'answer',    clash_num_text(p_val, p_to),
    'answer_n',  null,
    'answer_d',  null,
    'base_from', p_from,
    'base_to',   p_to,
    'digits',    clash_num_digits(p_to),
    'ops',       '[]'::jsonb,
    -- Die feste Stellenzahl der Zielbasis (ein Byte hat acht Stellen,
    -- 0…FFF drei). Sie ist zugleich die Tipp-Grenze und die Breite, auf
    -- die clash_num_choices die Kacheln auffüllt. Dezimal hat keine
    -- feste Breite — dort sind vier Stellen einfach die Obergrenze.
    'maxlen',    case when p_to = 10 then 4 else p_width end
  );
$$;

revoke all on function clash_num_shell(int, int, int, int) from public;


-- Binär ↔ Dezimal, 5 … 255.
-- Untergrenze 5: unter vier stünde „(11)_2 = (▢)_10" da, und das ist
-- keine Aufgabe, sondern eine Vokabel.
create or replace function clash_gen_num_bin()
  returns jsonb
  language plpgsql
as $$
declare
  v     int := 5 + floor(random() * 251)::int;   -- 5..255
  v_dez boolean := random() < 0.5;               -- dez → bin?
  b     text := clash_num_text(v, 2);
begin
  if v_dez then
    return clash_num_shell(v, 10, 2, 8) || jsonb_build_object(
      'distract', jsonb_build_array(
        -- rückwärts gelesen, MIT den führenden Nullen: wer 1000 0000
        -- von hinten liest, schreibt 0000 0001 hin und nicht "1".
        -- Abgeschnitten stünde eine einstellige Kachel neben sieben
        -- achtstelligen — wieder ein Wink statt einer Verwechslung.
        -- clash_num_norm macht daraus beim Vergleich ohnehin dasselbe.
        reverse(b),
        -- ein Bit verlesen (zweimal, meist zwei verschiedene)
        clash_num_text(clash_num_flip(v), 2),
        clash_num_text(clash_num_flip(v), 2),
        -- das letzte Halbbyte rückwärts gelesen
        clash_num_text(clash_num_lownibrev(v), 2),
        -- eins daneben. `least(…, 255)` hält die Kachel auf acht Stellen:
        -- eine neunstellige stäche unter acht achtstelligen sofort
        -- hervor, ohne dass jemand rechnen müsste. Bei v = 255 fällt sie
        -- mit der Lösung zusammen und clash_num_choices füllt nach.
        clash_num_text(least(v + 1, 255), 2),
        clash_num_text(greatest(v - 1, 0), 2))
    );
  end if;

  return clash_num_shell(v, 2, 10, 8) || jsonb_build_object(
    'distract', jsonb_build_array(
      -- Stellenwerte um eins verschoben — die Verdopplung/Halbierung
      -- ist der Fehler, wenn beim Zählen der Potenzen eine ausfällt
      -- Dezimal wird NICHT mit Nullen aufgefüllt — jede Kachel muss
      -- deshalb von sich aus so viele Stellen haben wie die Lösung
      -- (clash_num_dec, sonst fällt sie weg und wird nachgefüllt).
      clash_num_dec(v * 2, v),
      clash_num_dec(v / 2, v),
      -- von der falschen Seite gelesen
      clash_num_dec(coalesce(clash_num_val(reverse(b), 2), v + 3), v),
      -- ein Bit verlesen
      clash_num_dec(clash_num_flip(v), v),
      -- die Halbbytes vertauscht
      clash_num_dec(clash_num_nibswap(v), v),
      clash_num_dec(v + 1, v))
  );
end;
$$;

revoke all on function clash_gen_num_bin() from public;


-- Hexadezimal ↔ Dezimal, 5 … 255.
create or replace function clash_gen_num_hex()
  returns jsonb
  language plpgsql
as $$
declare
  v     int := 5 + floor(random() * 251)::int;   -- 5..255
  v_dez boolean := random() < 0.5;               -- dez → hex?
  h     text := clash_num_text(v, 16);
begin
  if v_dez then
    return clash_num_shell(v, 10, 16, 2) || jsonb_build_object(
      'distract', jsonb_build_array(
        -- die Dezimalziffern einfach übernommen: 173 → „173". Sieht wie
        -- eine Hexzahl aus, ist aber gar keine Umrechnung — und genau
        -- das passiert, wenn jemand die Aufgabe nicht als Umrechnung
        -- liest.
        case when v < 100 then v::text end,
        -- die Halbbytes vertauscht
        clash_num_text(clash_num_nibswap(v), 16),
        -- eine Hexziffer daneben, unten und oben — gedeckelt, damit
        -- keine Kachel dreistellig wird, wo die Lösung zweistellig ist
        clash_num_text(least(v + 1, 255), 16),
        clash_num_text(least(v + 16, 255), 16),
        clash_num_text(greatest(v - 16, 0), 16),
        clash_num_text(greatest(v - 1, 0), 16))
    );
  end if;

  return clash_num_shell(v, 16, 10, 8) || jsonb_build_object(
    'distract', jsonb_build_array(
      -- mit Stellenwert 10 gerechnet: AF → 10·10 + 15 = 115
      clash_num_dec(coalesce(clash_num_misread(h, 10), v + 7), v),
      -- die Buchstaben als Alphabet-Position gezählt: AF → 1·16 + 6 = 22
      clash_num_dec(coalesce(clash_num_letterval(h), v + 3), v),
      -- Auch hier: gleiche Stellenzahl wie die Lösung, sonst weglassen.
      clash_num_dec(v + 16, v),
      clash_num_dec(greatest(v - 16, 0), v),
      clash_num_dec(clash_num_nibswap(v), v),
      clash_num_dec(v + 1, v))
  );
end;
$$;

revoke all on function clash_gen_num_hex() from public;


-- Binär ↔ Hexadezimal, 16 … 4095. Die abgeleitete Art: sie kommt nur
-- dran, wenn Binär und Hexadezimal beide im Pool stehen und gleich
-- eingestellt sind — den Umweg über dezimal hat die Klasse dann schon
-- geübt.
--
-- Untergrenze 16, damit immer mindestens zwei Halbbytes im Spiel sind:
-- darunter wäre die „Umrechnung" ein einzelnes Zeichen.
create or replace function clash_gen_num_binhex()
  returns jsonb
  language plpgsql
as $$
declare
  v     int := 16 + floor(random() * 4080)::int;   -- 16..4095
  v_bin boolean := random() < 0.5;                 -- bin → hex?
  b     text := clash_num_text(v, 2);
begin
  if v_bin then
    return clash_num_shell(v, 2, 16, 3) || jsonb_build_object(
      'distract', jsonb_build_array(
        -- Halbbytes vertauscht
        clash_num_text(clash_num_nibswap(v), 16),
        -- die Bits von der falschen Seite gruppiert: eine Stelle
        -- verschoben, und jedes Halbbyte stimmt nicht mehr.
        -- `& 4095` schneidet dabei auf zwölf Bit zurück — das ist genau
        -- das, was beim Verrutschen passiert, und die Kachel bleibt in
        -- derselben Stellenzahl wie die Lösung.
        clash_num_text((v * 2) & 4095, 16),
        clash_num_text(v / 2, 16),
        -- ein Halbbyte daneben
        clash_num_text(least(v + 16, 4095), 16),
        clash_num_text(greatest(v - 16, 0), 16),
        clash_num_text(least(v + 1, 4095), 16))
    );
  end if;

  return clash_num_shell(v, 16, 2, 12) || jsonb_build_object(
    'distract', jsonb_build_array(
      -- das letzte Halbbyte rückwärts gelesen
      clash_num_text(clash_num_lownibrev(v), 2),
      -- eine Stelle verrutscht, auf zwölf Bit zurückgeschnitten
      clash_num_text((v * 2) & 4095, 2),
      clash_num_text(v / 2, 2),
      -- ein Bit verlesen
      clash_num_text(clash_num_flip(v), 2),
      -- rückwärts gelesen, mit den führenden Nullen (siehe oben)
      reverse(b),
      clash_num_text(least(v + 1, 4095), 2))
  );
end;
$$;

revoke all on function clash_gen_num_binhex() from public;


-- ─────────────────────────────────────────────────────────────
-- 5) Die drei Katalogzeilen
-- ─────────────────────────────────────────────────────────────
-- Nur der neue Block. Die fünf bestehenden Zeilen sind oben in Abschnitt
-- 1 gezielt ergänzt worden.
--
-- Die Beispiele stehen genau so da, wie die Aufgabe gleich auf dem
-- Telefon steht — ein Beispiel, das anders aussieht als die Aufgabe,
-- wäre eine zweite Wahrheit (dieselbe Überlegung wie in 0112).
insert into clash_task_types
  (key, group_key, group_label, label, short_label, example,
   sort_group, sort_item, allows_free, allows_mc, input_mode, keypad,
   choice_count, strict_reduced, derived, requires, answer_kind)
values
  ('num_bin',    'numsys', 'Zahlensysteme', 'Binär (0–255)',
   'bin ↔ dez', '(1011 0011)₂ = (▢)₁₀',
   3, 1, true, true, 'natural', 'numsys', 6, false, false, '{}', 'digits'),

  ('num_hex',    'numsys', 'Zahlensysteme', 'Hexadezimal (0–255)',
   'dez ↔ hex', '(173)₁₀ = (▢)₁₆',
   3, 2, true, true, 'natural', 'numsys', 6, false, false, '{}', 'digits'),

  -- Die abgeleitete Art. allows_free/allows_mc stehen auf true, weil sie
  -- beides KANN — welches von beidem gilt, erbt sie von den beiden
  -- Arten, aus denen sie folgt.
  ('num_binhex', 'numsys', 'Zahlensysteme', 'Bin ↔ Hex (0–FFF)',
   'bin ↔ hex', '(1010 1111)₂ = (▢)₁₆',
   3, 3, true, true, 'natural', 'numsys', 6, false, true,
   '{num_bin,num_hex}', 'digits')
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
  answer_kind    = excluded.answer_kind;


-- ─────────────────────────────────────────────────────────────
-- 6) clash_normalize_pool — Neu-Deklaration auf Basis 0109:201
-- ─────────────────────────────────────────────────────────────
-- Eine Bedingung mehr: abgeleitete Arten darf niemand in den Pool
-- schreiben. Sie stehen dort nie — sie folgen aus dem, was drinsteht.
-- Ohne diese Zeile könnte ein Client „num_binhex" von Hand setzen und
-- hätte damit eine Art im Spiel, die die Lobby gar nicht anbietet.
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
          or e.value not in ('free', 'mc')
          or (e.value = 'free' and not t.allows_free)
          or (e.value = 'mc'   and not t.allows_mc)
    ) then null
    else p_pool
  end;
$$;

revoke all on function clash_normalize_pool(jsonb) from public;

comment on function clash_normalize_pool(jsonb) is
  'Prüft einen Aufgabenpool: flaches Objekt, jeder Schlüssel in clash_task_types und NICHT '
  'abgeleitet, jeder Wert „free" oder „mc" und von der Aufgabenart erlaubt. Der leere Pool ist '
  'gültig (Zwischenstand beim Umsortieren) — die Startsperre sitzt in clash_room_start.';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_task_catalog — Neu-Deklaration auf Basis 0111:70
-- ─────────────────────────────────────────────────────────────
-- Drei Felder mehr je Unterkategorie. `derived` und `requires` braucht
-- der Client, um die Bin↔Hex-Zeile erst dann zu zeigen, wenn ihre
-- Bedingung erfüllt ist — Sönkes Vorgabe: „wenn beides drin ist".
--
-- Die Bedingung wird BEWUSST im Client ausgewertet und nicht hier: der
-- Katalog ist statisch und wird einmal geholt, die Auswahl ändert sich
-- bei jedem Klick. Käme die Antwort vom Server, müsste die Tabelle nach
-- jedem Klick nachladen.
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
                       'requires', to_jsonb(t.requires)
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
  'Der Aufgaben-Katalog für die Auswahl-Tabelle in der Lobby, fertig gruppiert und sortiert. '
  'Seit 0111 mit „short", seit 0114 mit „derived"/„requires" (abgeleitete Arten, die der Client '
  'erst zeigt, wenn ihre Bedingung erfüllt ist) und „keypad". Statisch — einmal beim Öffnen der '
  'Auswahl holen, nicht im Poll-Takt.';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_pool_input — Neu-Deklaration auf Basis 0110:604
-- ─────────────────────────────────────────────────────────────
-- Vier Rückgaben statt zwei. Die Regel selbst ist unverändert: das
-- Layout gehört dem RAUM, nicht der Frage — sonst spränge die Tastatur
-- mitten im Spiel.
--
--   natural   nur Ziffern
--   fraction  Ziffern + − + a/b
--   numsys    Ziffern + A…F
--   mixed     alles davon — der Raum, in dem Brüche UND Zahlensysteme
--             frei getippt werden
--
-- „mixed" ist kein Kompromiss, sondern die Fortsetzung derselben Idee:
-- alle Tasten, die der Raum je braucht, stehen von Anfang an da, und
-- je Aufgabe grauen die aus, die gerade nichts zu suchen haben. Der
-- Daumen findet die 7 immer an derselben Stelle.
create or replace function clash_pool_input(p_pool jsonb)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  with k as (
    select distinct coalesce(t.keypad, t.input_mode) as kp
      from jsonb_each_text(coalesce(p_pool, '{}'::jsonb)) e
      join clash_task_types t on t.key = e.key
     where e.value = 'free'
  )
  select case
    when exists (select 1 from k where kp = 'fraction')
     and exists (select 1 from k where kp = 'numsys')   then 'mixed'
    when exists (select 1 from k where kp = 'numsys')   then 'numsys'
    when exists (select 1 from k where kp = 'fraction') then 'fraction'
    else 'natural'
  end;
$$;

revoke all on function clash_pool_input(jsonb) from public;

comment on function clash_pool_input(jsonb) is
  'Das Tipp-Layout für ALLE freien Aufgaben eines Raums: natural · fraction · numsys · mixed. '
  'Bewusst am Pool und nicht an der Frage — sonst spränge die Tastatur mitten im Spiel. Welche '
  'ZIFFERN eine einzelne Aufgabe zulässt, steht dagegen an der Frage (question.digits).';


-- ─────────────────────────────────────────────────────────────
-- 9) clash_new_question — Neu-Deklaration auf Basis 0110:632
-- ─────────────────────────────────────────────────────────────
-- Drei Änderungen:
--   a) die Ziehung kennt jetzt ABGELEITETE Arten
--   b) drei neue Generatoren im case
--   c) die Kacheln kommen je nach answer_kind aus clash_q_choices
--      (Brüche) oder clash_num_choices (Ziffernfolgen)
--
-- Alles andere Wort für Wort wie in 0110.
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
  -- Gleichverteilt über die AKTIVEN Unterkategorien — und über die
  -- abgeleiteten, deren Bedingung gerade erfüllt ist.
  --
  -- Die Bedingung ist EINE Zeile: alle Schlüssel aus `requires` stehen
  -- im Pool (count = array_length) und tragen denselben Wert
  -- (count(distinct value) = 1). Das ist genau Sönkes „beide gleich
  -- eingestellt", ohne Sonderfallkette — und eine künftige abgeleitete
  -- Art kostet damit weiterhin nur eine Katalogzeile.
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
  -- Spielbildschirm. clash_room_start lässt einen leeren Pool gar nicht
  -- erst starten, hierher kommt man nur über einen Raum, dessen Pool
  -- nachträglich unbrauchbar geworden ist.
  if v_key is null then
    v_key  := 'add100';
    v_mode := 'free';
  end if;

  select * into v_type from clash_task_types where key = v_key;

  v_mode := coalesce(v_mode, 'free');
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
             when 'num_bin'      then clash_gen_num_bin()
             when 'num_hex'      then clash_gen_num_hex()
             when 'num_binhex'   then clash_gen_num_binhex()
             else clash_gen_add100()
           end;

  if v_mode = 'mc' then
    if coalesce(v_type.answer_kind, 'number') = 'digits' then
      v_choices := clash_num_choices(v_gen->>'answer', v_gen->'distract',
                                     coalesce(v_type.choice_count, 6),
                                     coalesce((v_gen->>'base_to')::int, 10),
                                     coalesce((v_gen->>'maxlen')::int, 8));
    else
      v_choices := coalesce(
        v_gen->'choices_fixed',
        clash_q_choices(v_gen->>'answer', v_gen->'distract',
                        coalesce(v_type.choice_count, 6),
                        coalesce(v_type.strict_reduced, false)));
    end if;
    v_input := 'choice';
  else
    v_input := clash_pool_input(p_pool);
  end if;

  return jsonb_build_object(
    'type',      v_key,
    'mode',      v_mode,
    'input',     v_input,
    'kind',      coalesce(v_type.answer_kind, 'number'),
    'text',      v_gen->>'text',
    'eq',        coalesce((v_gen->>'eq')::boolean, true),
    'choices',   v_choices,
    'answer',    v_gen->>'answer',
    'answer_n',  v_gen->'answer_n',
    'answer_d',  v_gen->'answer_d',
    'strict',    coalesce(v_type.strict_reduced, false),
    -- Die Felder der Zahlensysteme. Bei Brüchen und Addition stehen sie
    -- auf null — der Client liest daraus „keine Einschränkung" und
    -- lässt die Tasten hell, also genau das Verhalten von 0110.
    'base_from', v_gen->'base_from',
    'base_to',   v_gen->'base_to',
    'maxlen',    v_gen->'maxlen',
    -- Welche ZUSATZTASTEN gelten. Wie `digits` steht das Feld immer da,
    -- nie auf null: die Tastatur zeigt seit 2026-08-26 auch Zeichen, die
    -- heute keine Aufgabenart kann (Komma, Hochzahl — Sönkes Vorgabe
    -- „Du kannst auch schon die Zeichen zeigen"). Sie sind ausgegraut,
    -- solange sie hier nicht genannt werden; fehlte das Feld, wären sie
    -- bedienbar und jede damit getippte Antwort falsch.
    --
    -- Bei Zahlen-Antworten sind es „sign" und „frac", weil
    -- clash_parse_answer genau die zwei Formen liest („-7" und „7/8").
    -- Auch bei der Addition: wer auf 37 + 48 die Antwort „170/2"
    -- schreibt, hat richtig gerechnet, und clash_answer_matches gibt ihm
    -- recht.
    'ops',       coalesce(v_gen->'ops', '["sign", "frac"]'::jsonb),
    -- `digits` steht dagegen IMMER da. In einem Raum, in dem Brüche und
    -- Zahlensysteme zusammen frei getippt werden (Layout „mixed"),
    -- liegen A…F auf der Tastatur — und ein „A" im Zähler eines Bruchs
    -- ist keine Antwort, sondern ein Vertipper. Bei einer Aufgabe, die
    -- mit Zehnerziffern rechnet, grauen sie deshalb aus. In einem
    -- reinen Bruch- oder Additionsraum ändert das nichts: dort gibt es
    -- keine Taste, die dadurch dunkel würde.
    'digits',    coalesce(v_gen->'digits', to_jsonb('0123456789'::text))
  );
end;
$$;

revoke all on function clash_new_question(jsonb) from public;

comment on function clash_new_question(jsonb) is
  'Zieht eine Aufgabe aus dem Pool des Raums: gleichverteilt über die aktiven Unterkategorien und '
  'über die abgeleiteten, deren requires vollzählig und mit demselben Wert im Pool stehen (0114). '
  'Enthält die LÖSUNG — was an ein Gerät geht, muss durch clash_q_public.';


-- ─────────────────────────────────────────────────────────────
-- 10) clash_answer_matches — Neu-Deklaration auf Basis 0110:742
-- ─────────────────────────────────────────────────────────────
-- Ein Zweig davor, alles andere unverändert.
--
-- Bei Ziffernfolgen entscheidet die Normalform: „0011 0011", „11 0011"
-- und „110011" sind dieselbe Antwort (Sönkes Vorgabe). Das gilt auch
-- für die Auswahl-Kacheln — sie werden in Vierergruppen ausgeliefert,
-- die gespeicherte Lösung trägt keine Leerzeichen, und ohne die
-- Normalform wäre jede angetippte Kachel falsch.
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
begin
  if p_q is null or v = '' then
    return false;
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
  'Prüft eine Antwort gegen die gespeicherte Aufgabe. Ziffernfolgen (0114): Normalform, führende '
  'Nullen und Vierergruppen zählen nicht. Auswahl: die Kachel muss ausgeliefert worden sein. '
  'Kürzen: Endform exakt. Sonst: gleicher Wert (6/8 = 3/4).';
