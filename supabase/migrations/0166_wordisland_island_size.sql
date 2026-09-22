-- ══════════════════════════════════════════════════════════════
-- Migration 0166 — Wordisland: die Insel wird aus dem NEBEL-ANTEIL
--                   gerechnet (und ist damit deutlich kleiner)
-- ══════════════════════════════════════════════════════════════
-- Sönke, 22.09.2026, nach einer Testrunde mit 22 Kindern über zehn
-- Minuten: „die Karte war zu groß … es geht ja eigentlich darum,
-- dass die Karte sich durch die Ruinen verändert und man die
-- einnehmen will."
--
-- ⚠️ Diese Migration ersetzt eine frühere Fassung von 0166, die die
-- Inseln um 20 % VERGRÖSSERT hätte (Sönkes erste Ansage, bevor die
-- Rechnung dahinter besprochen war). Sie wurde nie eingespielt. Wer
-- sie doch eingespielt hat, merkt es am Migrations-Check: die Zeile
-- 0166 sucht nach `c_nebel` und meldet sonst FEHLT.
--
-- ── Was die Zahl in Wahrheit einstellt ────────────────────────
-- Jede richtige Antwort nimmt genau EIN Feld (erst Nebel, dann
-- fremdes Land). In einer Runde fallen also
--
--     Antworten = Kinder × Antworten-je-Minute × Minuten
--
-- und der Nebel ist weg, sobald davon so viele gegeben sind, wie die
-- Insel Felder hat. Setzt man die alte Formel (1,6 × Kinder ×
-- Minuten) ein, kürzen sich Kinder UND Minuten vollständig heraus:
--
--     Anteil „Erkunden" = 1,6 ÷ Antworten-je-Minute
--
-- Die Inselgröße stellt also nicht ein, wie groß die Karte ist,
-- sondern WIE LANGE eine Runde aus Nebel besteht. Genau deshalb
-- funktioniert dieselbe Formel für acht wie für dreißig Kinder — und
-- genau deshalb steht die Zahl ab jetzt als das da, was sie ist:
--
--     c_per_kid = c_antworten × c_nebel
--
-- ── Warum 1,6 daneben lag ─────────────────────────────────────
-- 1,6 war 0131 aus „vier Antworten je Kind und Minute" gerechnet,
-- also 40 % Erkunden. Die vier sind zu optimistisch: bei 22 Kindern
-- × 10 Minuten fielen auf 400 Feldern
--
--   Antworten/min │ Antworten │ Nebel weg nach
--   ──────────────┼───────────┼────────────────
--        4        │    880    │  45 % der Zeit
--        3        │    660    │  61 %
--        2        │    440    │  91 %   ← so sah die Testrunde aus
--
-- Bei zwei Antworten je Minute bestand die ganze Runde aus Nebel; zum
-- Streit um Ruinen kam es nie. Sönkes Entscheid (22.09.2026): **ein
-- Drittel erkunden, zwei Drittel kämpfen.**
--
--     c_antworten = 2.0   ← die einzige GESCHÄTZTE Zahl hier
--     c_nebel     = 1/3   ← Sönkes Entscheidung
--     c_per_kid   = 0.667 Felder je Kind und Minute  (vorher 1,6)
--
-- ⚠️ `c_antworten` ist die Zahl, die nachgemessen gehört (richtige
-- Antworten ÷ Kinder ÷ gespielte Minuten, siehe wi_players.
-- correct_count). Stellt sich heraus, dass es drei sind, wird HIER
-- eine 3 hingeschrieben und sonst nichts — der Nebel-Anteil bleibt
-- davon unberührt. Das ist der ganze Zweck der Aufteilung.
--
--   Kinder × Minuten   Felder vorher   Felder jetzt
--   ─────────────────────────────────────────────────
--   22 × 10                400             146
--   24 × 20                712 (Deckel)    320
--    8 × 10                145              80 (Boden)
--   30 × 10                480             200
--
-- ── Der Radius ist jetzt gebrochen ────────────────────────────
-- `v_R` war eine ganze Zahl (ceil) — bei R = 9 sind das zwei
-- Zehntel Fläche Unterschied zum Nachbarn, also mehr, als die
-- Einstellung selbst ausmacht, und die Insel lag regelmäßig 20 %
-- über dem Ziel. Ohne Aufrundung trifft die Rechnung ihr Ziel, und
-- „Felder je Kind und Minute" stimmt auch wirklich.
-- Nach außen unsichtbar: `wi_boards.radius` ist int und wird
-- gerundet; gelesen wird die Spalte nur zur Auskunft, kein Gerät
-- rechnet damit.
--
-- ── Zwei große Orte schon ab 140 Feldern ──────────────────────
-- 0165 gibt es jede große Art zweimal, sobald die Insel 320 Felder
-- hat — das war auf die ALTEN Größen gerechnet. Mit der neuen
-- Formel käme eine Schulklasse dort nie mehr hin, und damit wäre
-- 0165s eigene Begründung ausgehebelt: „mit genau einem Lichttempel
-- entscheidet das Volk, das ihn zuerst erreicht, die ganze Runde."
-- Die Schwelle wandert deshalb mit der Insel: 320 → 140. Eine
-- Klassenrunde (146 Felder) trägt damit wieder zwei Arenen, zwei
-- Licht- und zwei Schattentempel.
-- Die kleinen Orte brauchen nichts: ihre Untergrenze von je vier
-- greift jetzt fast immer, das sind acht Tore/Klos auf 146 Feldern.
--
-- ── Was sich NICHT ändert ─────────────────────────────────────
-- Die Zahl der Völker geht weiterhin NICHT in die Größe ein (nur in
-- den Mindestabstand der Landeplätze, `v_min`). Zwei Völker
-- bekommen dieselbe Insel wie acht: ein Volk ist keine
-- Arbeitsmenge, es sind dieselben Kinder in anderen Gruppen.
--
-- Wörtlich die Fassung aus 0165 (Umriss, Landeplätze, Orte,
-- Rückgabe), geändert sind nur der Kopf der Rechnung und die eine
-- Schwelle bei den großen Orten. Sie steht hier vollständig und
-- nicht als Verweis (Regel: feedback_shop_state_merge_regressions).
-- ══════════════════════════════════════════════════════════════

create or replace function wi_build_island(p_room uuid, p_teams int, p_people int, p_secs int)
  returns int
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  -- Wie viele richtige Antworten ein Kind in der Minute schafft.
  -- GESCHÄTZT — nachmessen und hier ändern (siehe Kopf).
  c_antworten constant real := 2.0;
  -- Welcher Anteil der Runde dem Aufdecken gehört. Sönkes Entscheid.
  c_nebel     constant real := 1.0 / 3.0;
  -- Felder je Kind und Minute. Nicht mehr geraten, sondern aus den
  -- beiden Zahlen darüber gerechnet.
  c_per_kid   constant real := c_antworten * c_nebel;
  -- Aus dem Umriss folgt empirisch: Felder ≈ 1.78 · R².
  c_area      constant real := 1.78;
  v_target int;
  -- ⚠️ real und nicht int: die Aufrundung auf ganze Ringe wäre
  -- gröber als die Einstellung, die sie tragen soll (siehe Kopf).
  v_R      real;
  v_rows   int;
  v_cols   int;
  v_cx     real;
  v_cy     real;
  v_p1     real := random() * 6.2832;
  v_p2     real := random() * 6.2832;
  v_p3     real := random() * 6.2832;
  v_n      int;
  v_small  int;
  v_big    int;
  v_min    real;
  v_kind   text;
  i        int;
  j        int;
  k        int;
  v_ang    real;
  v_home   record;
begin
  delete from wi_tiles where room_id = p_room;

  -- Der Boden von 80 Feldern ist keine Balance, sondern Optik: eine
  -- Insel aus vierzig Sechsecken sieht am Beamer nicht nach Insel
  -- aus. Er greift jetzt öfter (bis rund 120 Kind-Minuten) — dort
  -- ist die Runde ohnehin so kurz, dass der Nebel-Anteil nicht die
  -- Frage ist. Der Deckel greift praktisch nie mehr.
  v_target := greatest(80, least(900,
                (greatest(p_people, 4) * c_per_kid * (p_secs / 60.0))::int));
  v_R      := least(22.0, greatest(6.0, sqrt(v_target / c_area)));
  v_cols   := ceil(2 * v_R)::int + 2;
  v_rows   := ceil(2 * v_R / 0.8660254)::int + 1;
  v_cx     := v_R + 0.5;
  v_cy     := (v_rows - 1) / 2.0;

  insert into wi_tiles (room_id, r, c, state, dist)
  select p_room, g.r, g.c, 'fog', g.d
    from (
      select rr as r, cc as c,
             sqrt(power(cc + 0.5 * (rr % 2) - v_cx, 2)
                + power((rr - v_cy) * 0.8660254, 2)) as d,
             atan2((rr - v_cy) * 0.8660254, cc + 0.5 * (rr % 2) - v_cx) as a
        from generate_series(0, v_rows - 1) as rr,
             generate_series(0, v_cols - 1) as cc
    ) g
   where g.d <= v_R * (0.70 + 0.13 * sin(g.a + v_p1)
                            + 0.09 * sin(2 * g.a + v_p2)
                            + 0.05 * sin(3 * g.a + v_p3));

  select count(*) into v_n from wi_tiles where room_id = p_room;

  -- Die Landeplätze: für jedes Volk eine Richtung, und darin das
  -- Küstenfeld, dessen WINKEL am besten passt (Begründung in 0131).
  -- HIER und nur hier geht die Zahl der Völker ein.
  v_min := 1.10 * v_R * sin(pi() / p_teams);

  for k in 0 .. p_teams - 1 loop
    v_ang := 6.2832 * k / p_teams + v_p1;

    for i in 1 .. 2 loop
      select t.r, t.c into v_home
        from wi_tiles t
        cross join lateral (select (t.c + 0.5 * (t.r % 2) - v_cx) as x,
                                   ((t.r - v_cy) * 0.8660254)     as y) g
       where t.room_id = p_room
         and not t.is_home
         and exists (select 1 from wi_neighbors(t.r, t.c) n
                      where not exists (select 1 from wi_tiles w
                                         where w.room_id = p_room
                                           and w.r = n.r and w.c = n.c))
         and (i = 2 or not exists (
               select 1 from wi_tiles h
                where h.room_id = p_room and h.is_home
                  and wi_tile_gap(h.r, h.c, t.r, t.c) < v_min))
       order by abs(atan2(sin(atan2(g.y, g.x) - v_ang),
                          cos(atan2(g.y, g.x) - v_ang)))
       limit 1;
      exit when v_home.r is not null;
    end loop;

    update wi_tiles
       set is_home = true, state = 'open', owner_team = k
     where room_id = p_room and r = v_home.r and c = v_home.c;
  end loop;

  -- ── Wie viele Orte? (0165, Schwelle nachgezogen) ────────────
  -- Beide Zahlen hängen an den FELDERN und nicht an einer Stufe.
  -- Die 140 ersetzen die 320 aus 0165 — dieselbe Aussage („ab einer
  -- richtigen Klassenrunde gibt es jede große Art zweimal"), nur auf
  -- die neuen Größen gerechnet.
  v_big   := 1 + least(1, (v_n / 140)::int);
  v_small := greatest(4, least(12, (v_n / 40.0 - 3)::int));

  -- ── Die Großen, innen ───────────────────────────────────────
  -- ⚠️ Die Klammern und das ::real sind kein Schmuck: p_maxdist ist
  -- `real` (0146), und mit gebrochenem v_R ergibt `0.45 * v_R`
  -- double precision — von dort nach real gibt es KEINE stille
  -- Umwandlung. Ohne den Zusatz findet Postgres die Funktion nicht
  -- und die Insel bekommt überhaupt keine Orte.
  --
  -- ⚠️ Die Runden liegen AUSSEN und die Arten innen: so bekommt
  -- jede Art ihren ersten Platz unter den strengen Bedingungen,
  -- bevor die zweite Arena einen Tempel verdrängt.
  for j in 1 .. v_big loop
    foreach v_kind in array array['schatten', 'licht', 'arena'] loop
      if not wi_place_ruin(p_room, v_kind, (0.45 * v_R)::real, 4.0, 2.0) then
        if not wi_place_ruin(p_room, v_kind, (0.60 * v_R)::real, 2.5, 2.0) then
          perform wi_place_ruin(p_room, v_kind, null, 2.5, 1.5);
        end if;
      end if;
    end loop;
  end loop;

  -- ── Tore und Klos, gestreut ─────────────────────────────────
  -- Drei Felder Abstand, im zweiten Anlauf zwei: ohne ihn liegen bei
  -- Zufall regelmäßig drei Ruinen nebeneinander, und dann entscheidet
  -- eine einzige Ecke das Spiel.
  foreach v_kind in array array['tor', 'klo'] loop
    for i in 1 .. v_small loop
      if not wi_place_ruin(p_room, v_kind, null, 3.0, 2.0) then
        exit when not wi_place_ruin(p_room, v_kind, null, 2.0, 1.5);
      end if;
    end loop;
  end loop;

  -- Gerundet: die Spalte ist int und trägt eine Auskunft, keine
  -- Rechnung.
  update wi_boards set radius = round(v_R)::int where room_id = p_room;
  return v_n;
end;
$$;

comment on function wi_build_island(uuid, int, int, int) is
  'Baut die Insel einer Runde. 0166: Größe = Antworten-je-Minute × Nebel-Anteil (ein Drittel), Radius gebrochen, zwei große Orte ab 140 Feldern.';
