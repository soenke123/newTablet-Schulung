-- ══════════════════════════════════════════════════════════════
-- Migration 0257 — How to Fachbegriffe: Kistenturm, weniger
--                  zerstörende Items, mehr Maxi/Mini und Möwen
-- ══════════════════════════════════════════════════════════════
-- Sönke 02.11.2026:
--   „Zerstörende Items kommen beim Kistenturm zu oft. Wind und Bus
--    müssen seltener kommen, große und kleine Kisten häufiger und
--    Klauen auch! Die Schüler erreichen das Ende nicht.“
--
-- ── Gewichte je Platzgruppe (Erster · vordere · hintere · Letzter) ──
--            0249        →  0257
--   bonus    3 3 1 0        3 3 1 0
--   stein    3 2 1 0        3 2 1 0
--   moewe    0 3 2 0        0 4 4 0
--   moewe3   0 0 2 3        0 1 3 5
--   maxi     1 2 2 0        2 4 4 0
--   mini     0 1 2 0        0 3 4 0
--   eis      1 2 2 0        1 2 2 0
--   sturm    0 2 3 3        0 1 1 1   (Wind)
--   tea      0 0 2 2        0 0 2 2   (Platz 3 weiter 5)
--   boom     0 0 2 3        0 0 1 2
--   bus      0 1 2 3        0 0 1 1
--   kuddel   1 1 2 2        1 1 2 2
-- Anteil Sturm + Bus + Boom: vordere Hälfte 18 % → 5 %, hintere 30 % →
-- 12 %, Letzter 56 % → 31 %. Beim Letzten bleiben Möwe, Mini, Maxi und
-- Eis draußen (Entscheidung 0249); er klaut dafür mit 3 Möwen.
--
-- Nur dd_storm_draw. Idempotent.
-- ══════════════════════════════════════════════════════════════

-- Ziehung nach Platz (Gewichte 0257, sonst wie 0249)
create or replace function dd_storm_draw(p_room uuid, p_team int)
  returns text
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b  dd_storm_boards;
  v_rk int;
  v_n  int;
  v_g  int;
  v_r  numeric := random();
  v_it text;
begin
  select * into v_b from dd_storm_boards where room_id = p_room;
  select r.rk, r.n into v_rk, v_n from dd_storm_ranks(p_room) r where r.team = p_team;
  if v_rk is null then return null; end if;
  v_g := case when v_rk = 1 then 1 when v_rk = v_n then 4
              when (v_rk - 1)::numeric / greatest(v_n - 1, 1) < 0.5 then 2 else 3 end;
  with w as (
    select x.it,
           case when x.it = 'tea' and v_rk = 3 then 5
                else (array[x.w1, x.w2, x.w3, x.w4])[v_g] end::numeric as w
      from (values
        ('bonus',  3, 3, 1, 0), ('stein', 3, 2, 1, 0), ('moewe', 0, 4, 4, 0), ('moewe3', 0, 1, 3, 5),
        ('maxi',   2, 4, 4, 0), ('mini',  0, 3, 4, 0), ('eis',   1, 2, 2, 0), ('sturm',  0, 1, 1, 1),
        ('tea',    0, 0, 2, 2), ('boom',  0, 0, 1, 2), ('bus',   0, 0, 1, 1), ('kuddel', 1, 1, 2, 2)
      ) x(it, w1, w2, w3, w4)
     where not (v_b.items_off ? x.it)
       -- Teatime trifft die ersten beiden Teams — nie das eigene.
       and not (x.it = 'tea' and v_rk <= 2 and v_n > 2)
       and not (v_n < 2 and x.it in ('moewe', 'moewe3', 'mini', 'tea', 'eis'))
  ), c as (
    select it, sum(w) over (order by it) as cum, sum(w) over () as tot from w where w > 0
  )
  select it into v_it from c where cum > v_r * tot order by cum limit 1;
  return v_it;
end;
$$;
revoke all on function dd_storm_draw(uuid, int) from public, anon, authenticated;
