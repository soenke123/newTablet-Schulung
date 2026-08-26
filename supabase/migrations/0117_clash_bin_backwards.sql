-- ═══════════════════════════════════════════════════════════════
-- 0117 · Kingdoms of Mathoria — „binom rückwärts"
-- ═══════════════════════════════════════════════════════════════
--
-- Sönke am 26.08.2026: „Die binomischen Formeln gibt es gerade nur in
-- die eine Richtung. Ich will, dass man sie auch rückwärts rechnen
-- soll. Wenn so eine Aufgabe drankommt, steht (genau wie bei kürzen und
-- klammere aus) darüber ‚binom rückwärts‘."
--
-- Das ist die Rücknahme von 0116 (2) — dort fiel die Faktorisier-
-- Richtung heraus, weil sie „Schreibe als Produkt" hieß und in dieser
-- Fassung nicht gewollt war. Zurück kommt sie unter dem Namen, den
-- Sönke ihr gibt:
--
--     ausmultiplizieren   (2x+5)^2            →  4x^2+20x+25
--     binom rückwärts     4x^2+20x+25         →  (2x+5)^2
--
-- Der Bauplan (clash_bin_shell) konnte beides schon immer — 0116 hat
-- nur den Würfel darüber festgestellt. Es sind deshalb drei kleine
-- Änderungen und keine neue Aufgabenart:
--
--   1. clash_bin_shell   „als Produkt" → „binom rückwärts"
--   2. clash_bin_draw    die Richtung wird wieder gewürfelt
--   3. die Klammertasten kommen zurück — aber je FRAGE und nicht je
--      Aufgabenart (siehe 4 unten), damit sie in der Ausmultiplizier-
--      Richtung weiterhin fehlen. Der Gedanke aus 0116 gilt ja: eine
--      Taste, die in dieser Aufgabe nie gebraucht wird, ist ein
--      falscher Hinweis. Er galt nur für die falsche Ebene.
--   4. clash_new_question liest `keys` bevorzugt aus dem GENERATOR
--      (v_gen->'keys') und erst dann aus der Aufgabenart.
--
-- Der Client braucht dafür nichts: er hat die Klammern schon gesetzt,
-- als 0115 beide Richtungen zog, und die Anweisung trennt er seit heute
-- selbst vom Aufgabentext ab (splitPrompt in tool.js — daher „genau wie
-- bei kürzen").
--
-- ⚠️ Eigene Migration statt Korrekturen in 0115/0116: beide sind
-- eingespielt (Regel: feedback_stale_reference_data_do_nothing). Jede
-- Funktion wird auf Grundlage ihrer HÖCHSTEN bestehenden Fassung neu
-- deklariert (Regel: feedback_shop_state_merge_regressions).
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_bin_shell — Neu-Deklaration auf Basis 0115:954
-- ─────────────────────────────────────────────────────────────
-- Wort für Wort wie in 0115, mit zwei Änderungen ganz am Ende:
--   · der Anweisungstext heißt „binom rückwärts"
--   · beide Rückgaben tragen ihre eigenen `keys`
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
      -- Keine Klammertaste: die Antwort ist eine Summe (0116). Die
      -- Klammer steht in der AUFGABE, nicht in dem, was zu tippen ist.
      'keys',     to_jsonb(array['sign', 'plus', 'exp', 'vars']::text[]),
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
    -- Die Anweisung muss dastehen: ohne sie wäre die Aufgabe
    -- „a^2+2ab+b^2 = ▢" mit sich selbst zu beantworten. Sie heißt seit
    -- 0117 „binom rückwärts" (Sönkes Wort) und steht wie „kürze" (0112)
    -- mit Leerzeichen abgesetzt davor — der Client trennt daran und
    -- setzt sie klein und mittig über die Aufgabe.
    'text',     'binom rückwärts ' || expd,
    'answer',   fact,
    'answer_n', null, 'answer_d', null,
    'var',      null,
    'form',     'factored',
    'maxlen',   24,
    -- Hier gehören die Klammern auf die Tastatur: sie SIND die Antwort.
    'keys',     to_jsonb(array['sign', 'plus', 'exp', 'paren', 'vars']::text[]),
    'distract', dis);
end;
$$;

revoke all on function clash_bin_shell(int, boolean, int, text, int, text) from public;

comment on function clash_bin_shell(int, boolean, int, text, int, text) is
  'Baut eine binomische Aufgabe in beide Richtungen: p_expand = true fragt die ausmultiplizierte '
  'Form zu einem Produkt, false das Produkt zu einer Summe („binom rückwärts", 0117). Bringt seit '
  '0117 seine eigenen `keys` mit — die Klammertaste gibt es nur in der Rückwärts-Richtung.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_bin_draw — die Richtung wird wieder gewürfelt
-- ─────────────────────────────────────────────────────────────
-- Neu-Deklaration auf Basis 0116:237. Eine Zeile anders — dieselbe, die
-- 0116 festgestellt hat.
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

  -- Beide Richtungen zu gleichen Teilen (Sönke, 26.08.2026): die Hälfte
  -- der Aufgaben multipliziert aus, die andere Hälfte kommt als „binom
  -- rückwärts". Wer die Formel nur in eine Richtung kann, kann sie nicht.
  return clash_bin_shell(p_kind, random() < 0.5, ma, va, mb, vb);
end;
$$;

revoke all on function clash_bin_draw(int) from public;

comment on function clash_bin_draw(int) is
  'Würfelt die beiden Seiten einer binomischen Formel: halb reine Buchstaben ((a+b)²), halb mit '
  'Zahlen ((2x+5)²) — und seit 0117 wieder die Richtung, je zur Hälfte ausmultiplizieren und '
  '„binom rückwärts".';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_new_question — Neu-Deklaration auf Basis 0115:1187
-- ─────────────────────────────────────────────────────────────
-- Eine Zeile anders: `ops` kommt zuerst aus dem Generator und erst dann
-- aus der Aufgabenart. Alles andere Wort für Wort wie in 0115.
--
-- Warum überhaupt: die Zusatztasten hingen bisher an der AUFGABENART,
-- und das reicht genau so lange, wie eine Aufgabenart immer dieselbe
-- Gestalt fragt. Die binomischen Formeln tun das seit heute nicht mehr
-- — dieselbe Unterkategorie fragt einmal eine Summe und einmal ein
-- Produkt. Eine Klammertaste, die in der Summen-Richtung mitläuft, wäre
-- der falsche Hinweis, den 0116 zu Recht ausgebaut hat.
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
    -- Welche ZUSATZTASTEN gelten. Seit 0117 zuerst aus dem GENERATOR:
    -- die binomischen Formeln fragen in zwei Gestalten, und die
    -- Klammertaste gehört nur zu einer davon. Fehlt sie dort (alle
    -- anderen Aufgabenarten), bleibt es bei `keys` der Aufgabenart
    -- (0115) mit Rückfall auf ops.
    --
    -- `nullif(…, 'null'::jsonb)`, weil coalesce das SQL-NULL vom
    -- JSON-null nicht trennt: ein Generator, der 'keys' ausdrücklich auf
    -- null setzt, käme sonst mit einer leeren Tastenliste durch
    -- (Regel: project_atari_number_merge_bug).
    'ops',       coalesce(nullif(v_gen->'keys', 'null'::jsonb),
                          to_jsonb(coalesce(v_type.keys, v_type.ops, '{}'::text[]))),
    -- `digits` steht dagegen IMMER da (0114).
    'digits',    coalesce(v_gen->'digits', to_jsonb('0123456789'::text))
  );
end;
$$;

revoke all on function clash_new_question(jsonb) from public;

comment on function clash_new_question(jsonb) is
  'Zieht eine Aufgabe aus dem Pool des Raums: gleichverteilt über die aktiven Unterkategorien und '
  'über die abgeleiteten, deren requires vollzählig und mit demselben Wert im Pool stehen (0114). '
  'Seit 0115 mit Term-Aufgaben (kind = term, Felder var/form), seit 0117 mit Zusatztasten aus dem '
  'Generator. Enthält die LÖSUNG — was an ein Gerät geht, muss durch clash_q_public.';


-- ─────────────────────────────────────────────────────────────
-- 4) Der Rückfall der drei Katalogzeilen
-- ─────────────────────────────────────────────────────────────
-- `keys` der Aufgabenart greift bei bin1/2/3 nicht mehr — der Generator
-- bringt seine eigenen mit. Die Spalte steht trotzdem wieder auf dem
-- Stand von 0115 (mit 'paren'): sie ist der Rückfall, falls die Frage
-- einmal ohne `keys` ankommt, und sie soll dann die Richtung zulassen,
-- die mehr Tasten braucht — eine Taste zu viel ist ein Hinweis, eine
-- fehlende ist eine Sackgasse.
--
-- UPDATE und kein Neu-Seed mit `on conflict do nothing`: die Zeilen
-- stehen längst in der Datenbank (Regel:
-- feedback_stale_reference_data_do_nothing).
update clash_task_types
   set keys = '{sign,plus,exp,paren,vars}'
 where key in ('bin1', 'bin2', 'bin3');


-- ─────────────────────────────────────────────────────────────
-- 5) Die Beispiele in der Auswahl-Tabelle
-- ─────────────────────────────────────────────────────────────
-- Die Lehrkraft soll in der Tabelle sehen, was gleich auf den Tablets
-- steht (dieselbe Überlegung wie in 0112). Seit heute stehen dort zwei
-- Gestalten, und das Beispiel sagt das mit — sonst wählt jemand „1.
-- Binomische Formel" und ist überrascht, dass die Hälfte der Aufgaben
-- andersherum steht.
update clash_task_types
   set example = '(a + b)² = a² + 2ab + b² · auch rückwärts'
 where key = 'bin1';
update clash_task_types
   set example = '(a − b)² = a² − 2ab + b² · auch rückwärts'
 where key = 'bin2';
update clash_task_types
   set example = '(a + b)(a − b) = a² − b² · auch rückwärts'
 where key = 'bin3';
