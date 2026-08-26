-- ═══════════════════════════════════════════════════════════════
-- 0116 · Kingdoms of Mathoria — zwei Nachbesserungen an 0115
-- ═══════════════════════════════════════════════════════════════
--
-- 1) DER FEHLER, DER JEDE TERM-AUFGABE UMBRACHTE
--
--    In clash_term_parse (0115) stehen zwei Zeilen, die einen
--    Textbaustein an ein text[] anhängen:
--
--        tok2 := tok2 || '*';        -- implizites Mal
--        tok2 := tok2 || '~';        -- unäres Minus
--
--    Die Zeichenkette hat dort keinen Typ. Postgres löst `||` deshalb
--    zu `anyarray || anyarray` auf, hält '*' für die Schreibweise
--    eines ARRAYS und bricht ab:
--
--        ERROR: malformed array literal: "*"
--
--    Es trifft ausnahmslos jeden echten Term — „2x" ist ein implizites
--    Mal, „-4(x-3)" ein unäres Minus. Im Spiel sah es so aus:
--
--        Auswahlkacheln   die Lehrkraft kann den Raum nicht starten
--                         (clash_new_question → clash_term_choices)
--        Antwort tippen    der Raum startet, aber jede abgeschickte
--                         Antwort endet in „keine Verbindung zum
--                         Server" (clash_submit → clash_answer_matches)
--
--    Was ohne implizites Mal auskommt („x", „a+b"), lief durch — daher
--    Sönkes „bei MANCHEN Aufgaben".
--
--    ⚠️ Merksatz für alle künftigen Migrationen: ein Textbaustein, der
--    an ein Array angehängt wird, braucht seinen Typ. `arr || 'x'` ist
--    zweideutig, `arr || 'x'::text` nicht. Bei einer VARIABLEN (`arr ||
--    ch`, `ch text`) stellt sich die Frage nicht — nur das nackte
--    Literal ist gefährlich, und genau das rutscht durch jede
--    Sichtprüfung.
--
-- 2) DIE BINOMISCHEN FORMELN NUR NOCH IN EINE RICHTUNG
--
--    Sönke am 26.08.2026: „Die Aufgabe ‚Schreibe als Produkt‘ will ich
--    nicht. Nur ausklammern." Die Faktorisier-Richtung fällt damit weg;
--    gezogen wird ab jetzt immer die Ausmultiplizier-Richtung:
--
--        (2x+5)^2   →   4x^2+20x+25
--
--    Geändert wird nur der Würfel (clash_bin_draw). Der Bauplan
--    darunter (clash_bin_shell) kann weiterhin beides und bleibt
--    unangetastet — wer die andere Richtung eines Tages doch will,
--    ändert eine Zeile statt einer Funktion.
--
--    Damit trägt keine Antwort mehr eine Klammer, und die Klammertasten
--    verschwinden aus `keys`.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_term_parse — Neu-Deklaration auf Basis 0115:390
-- ─────────────────────────────────────────────────────────────
-- Wort für Wort wie in 0115, bis auf die zwei `::text` in Abschnitt b).
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
    --
    -- ⚠️ Das `::text` ist der ganze Sinn dieser Migration. Ohne den Typ
    -- hält Postgres '*' für ein Array und bricht ab (siehe Kopf).
    if prev is not null
       and (prev like '#%' or prev ~ '^[a-z]$' or prev = ')')
       and (t    like '#%' or t    ~ '^[a-z]$' or t    = '(') then
      tok2 := tok2 || '*'::text;
    end if;
    if t = '-' and (prev is null or prev in ('(', '+', '-', '*', '^', '~')) then
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
  'Eingabe ist eine falsche Antwort, kein Fehler. Seit 0116 gilt das auch wirklich: bis dahin warf '
  'das implizite Mal „malformed array literal" (fehlendes ::text am Literal).';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_bin_draw — nur noch ausmultiplizieren
-- ─────────────────────────────────────────────────────────────
-- Neu-Deklaration auf Basis 0115:1069. Eine Zeile anders: die Richtung
-- wird nicht mehr gewürfelt.
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

  -- Immer die Ausmultiplizier-Richtung (Sönke, 26.08.2026). Die
  -- Faktorisier-Richtung von clash_bin_shell wird dadurch nicht mehr
  -- gezogen — sie bleibt dort stehen und ist eine Zeile weit weg,
  -- falls sie doch einmal gebraucht wird.
  return clash_bin_shell(p_kind, true, ma, va, mb, vb);
end;
$$;

revoke all on function clash_bin_draw(int) from public;

comment on function clash_bin_draw(int) is
  'Würfelt die beiden Seiten einer binomischen Formel: halb reine Buchstaben ((a+b)²), halb mit '
  'Zahlen ((2x+5)²). Seit 0116 nur noch die Ausmultiplizier-Richtung.';


-- ─────────────────────────────────────────────────────────────
-- 3) Die Klammertasten fallen weg
-- ─────────────────────────────────────────────────────────────
-- Ohne die Faktorisier-Richtung trägt keine Antwort mehr eine Klammer.
-- Eine Taste, die in ihrer Aufgabenart nie gebraucht wird, ist ein
-- falscher Hinweis — sie sagt „hier könnte eine Klammer stehen".
--
-- Als UPDATE und nicht als Neu-Seed mit `on conflict do nothing`: die
-- fünf Zeilen stehen schon in der Datenbank, und ein `do nothing` käme
-- dort nie an (Regel: feedback_stale_reference_data_do_nothing).
update clash_task_types
   set keys = '{sign,plus,exp,vars}'
 where key in ('bin1', 'bin2', 'bin3');
