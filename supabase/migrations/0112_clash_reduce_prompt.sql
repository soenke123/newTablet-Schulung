-- ══════════════════════════════════════════════════════════════
-- 0112 — „kürze" vor die Kürzen-Aufgabe
-- ══════════════════════════════════════════════════════════════
-- Eine Kürzen-Aufgabe stand bisher als nackter Bruch da: „12/18 = ▢".
-- Jede andere Aufgabenart trägt ihre Anweisung im Text („3/4 + 1/8"
-- sagt durch das Pluszeichen, was zu tun ist) — beim Kürzen fehlte sie,
-- und ein einzelner Bruch beantwortet die Frage nicht, was mit ihm
-- geschehen soll.
--
-- Also steht das Wort jetzt davor: „kürze 12/18 = ▢". Der Client
-- braucht dafür nichts: mathHTML() stapelt jedes WORT, das wie ein
-- Bruch aussieht, und lässt alles andere Text sein.
--
-- ⚠️ Eigene Migration statt einer Korrektur in 0110: 0110 ist bereits
-- eingespielt (Regel: feedback_stale_reference_data_do_nothing).
-- clash_gen_frac_reduce wird auf Grundlage der HÖCHSTEN bestehenden
-- Fassung (0110) neu deklariert (Regel:
-- feedback_shop_state_merge_regressions).
--
-- Nur der Anzeigetext ändert sich. `answer`, `answer_n`, `answer_d` und
-- die Fehler-Kacheln bleiben Wort für Wort, was sie waren — die
-- Bewertung in clash_answer_matches liest ohnehin nie den Text.
--
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_gen_frac_reduce — Neu-Deklaration auf Basis 0110:418
-- ─────────────────────────────────────────────────────────────
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
    -- Die einzige Änderung gegenüber 0110: das Wort davor. Es steht mit
    -- Leerzeichen abgesetzt, weil der Client am Leerzeichen trennt —
    -- „kürze12/18" wäre ein einziges Wort und käme ungestapelt durch.
    'text',     'kürze ' || clash_frac_text(n * k, d * k),
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


-- ─────────────────────────────────────────────────────────────
-- 2) Das Beispiel in der Auswahl-Tabelle zieht mit
-- ─────────────────────────────────────────────────────────────
-- Die Lehrkraft soll in der Tabelle sehen, was gleich auf den Tablets
-- steht — ein Beispiel, das anders aussieht als die Aufgabe, wäre eine
-- zweite Wahrheit.
update clash_task_types
   set example = 'kürze 12/18'
 where key = 'frac_reduce';
