-- ═══════════════════════════════════════════════════════════════
-- 0120 · Kingdoms of Mathoria — Nachbesserungen (Sönke, 26.08.2026)
-- ═══════════════════════════════════════════════════════════════
--
-- Drei der sechs Punkte betreffen die Datenbank; die anderen drei
-- (Formelsatz der aufgelösten Antwort, Abstand des Ableitungsstrichs,
-- „F(x) =" über den Antwortkacheln) stehen in tool.js/tool.css:
--
--   3. „Nutze bei den Analysis-Aufgaben zu ca. 70 % x als Variable.
--      Gerade sind mir das zu oft a und b."
--   5. „Bei den Grundrechenarten hast du die Anzahl der Inputs
--      limitiert. Wenn ich Addition mit Dezimalzahlen kombiniere,
--      brauche ich mehr als 5 Inputs. Erweitere erlaubte Inputs auf 10."
--   6. „Im Aufgabenauswahlmodal versteht man nicht, was die
--      Erweiterungen Ganze Zahlen und Rationale Zahlen bringen. Hier
--      müsste ein Satz darüber stehen."
--
-- Zu 5) Warum das überhaupt eine Migration ist: die Feldlänge steht
-- nicht im Client, sondern an der AUFGABE (`maxlen`). Der Client nimmt
-- ohne diese Angabe vier Stellen an — das war die Länge, für die es
-- gedacht war (Zähler und Nenner eines Bruchs). Die Grundrechenarten
-- aus 0118 schicken bis heute keine, und „1000,00" passt in vier
-- Stellen nicht. Zehn ist mit Absicht großzügiger als die längste
-- vorkommende Antwort (8 Zeichen: fünf Vorkomma-, Komma, zwei
-- Nachkommastellen) — es ist eine Notbremse gegen Zahlen, die den int
-- sprengen, und kein Rechenschritt.
--
-- Zu 6) Der Satz gehört in den KATALOG und nicht in den Client: dort
-- steht schon alles andere, was die Lehrkraft in dieser Liste liest
-- (Name, Kurzzeichen, Beispiel), und der nächste Erklärsatz soll wieder
-- nur eine Migration kosten. Neue Spalte `note`, ausgegeben von
-- clash_task_catalog; der Client setzt sie über die ERSTE Schalterzeile
-- einer Gruppe.
--
-- ⚠️ Jede Funktion wird auf Grundlage ihrer HÖCHSTEN bestehenden
-- Fassung neu deklariert (Regel: feedback_shop_state_merge_regressions):
-- clash_task_catalog und die drei Generatoren der Grundrechenarten aus
-- 0118, clash_gen_analysis aus 0119.
-- Referenzdaten mit `update`/`do update`, nie `do nothing`
-- (Regel: feedback_stale_reference_data_do_nothing).
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Ein Erklärsatz je Katalogzeile
-- ─────────────────────────────────────────────────────────────
alter table clash_task_types
  add column if not exists note text;

comment on column clash_task_types.note is
  'Ein Satz für die Lehrkraft im Aufgaben-Fenster — dort, wo der Name allein nicht sagt, was '
  'die Zeile bewirkt. Der Client zeigt ihn ÜBER der Zeile. Seit 0120 (die beiden Schalter der '
  'Grundrechenarten); leer bei allen Aufgabenarten, deren Beispiel für sich spricht.';


-- Der Satz steht an neg_on, der ersten der beiden Schalterzeilen: er
-- gilt für den ganzen Block darunter, und an jeder Zeile stünde er
-- zweimal.
update clash_task_types
   set note = 'Erweitern die Grundrechenaufgaben durch größere Zahlenräume: '
              'negative Zahlen bzw. Kommazahlen kommen dazu, die bisherigen Aufgaben bleiben.'
 where key = 'neg_on';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_task_catalog — Neu-Deklaration auf Basis 0118:147
-- ─────────────────────────────────────────────────────────────
-- Ein Feld mehr je Unterkategorie: `note`. Alles andere Wort für Wort
-- wie in 0118.
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
                       'note',     t.note,
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
  'derived/requires, seit 0118 mit flag (Schalterzeilen), seit 0120 mit note (Erklärsatz).';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_gen_addsub — Neu-Deklaration auf Basis 0118:440
-- ─────────────────────────────────────────────────────────────
-- Eine Zeile mehr im Rückgabeobjekt: `maxlen`. Alles andere unverändert.
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
    -- 0120: „1000,00" braucht sieben Stellen; ohne Angabe nähme der
    -- Client vier an (die Länge eines Bruchzählers).
    'maxlen',   10,
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
-- 4) clash_gen_muldiv — Neu-Deklaration auf Basis 0118:526
-- ─────────────────────────────────────────────────────────────
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
    'maxlen',   10,                                  -- 0120, siehe clash_gen_addsub
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
-- 5) clash_gen_square — Neu-Deklaration auf Basis 0118:606
-- ─────────────────────────────────────────────────────────────
-- Die Quadratzahlen kämen mit vier Stellen aus (400 ist die größte
-- Antwort). Sie bekommen dieselbe Zehn trotzdem: eine Zahl, die für die
-- ganze Kategorie gilt, ist leichter richtig zu halten als drei.
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
      'maxlen',   10,
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
    'maxlen',   10,
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
-- 6) clash_gen_analysis — Neu-Deklaration auf Basis 0119:730
-- ─────────────────────────────────────────────────────────────
-- Eine Zeile anders: die Variable. Sie wurde bisher gleichverteilt aus
-- x, a und b gezogen — in einer Reihe von zehn Aufgaben stand damit
-- sieben Mal etwas anderes als x da, und Analysis wird nun einmal mit x
-- geschrieben. a und b bleiben trotzdem (zu je 15 %): wer sie nie sieht,
-- hält die Regel für eine Regel über den Buchstaben x.
create or replace function clash_gen_analysis(p_deriv boolean)
  returns jsonb
  language plpgsql
as $$
declare
  v_names text[] := array['f', 'g', 'h'];
  -- ⚠️ Reihenfolge im DECLARE: v_var liest v_vars.
  v_vars  text[] := array['a', 'b'];                 -- die selteneren
  v_name  text   := v_names[1 + floor(random() * 3)::int];
  v_var   text   := case when random() < 0.7 then 'x'
                         else v_vars[1 + floor(random() * 2)::int] end;
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
  'Bruch-Koeffizienten; gefragt ist die Ableitung (p_deriv) oder eine Stammfunktion. '
  'Die Variable ist seit 0120 zu 70 % x.';
