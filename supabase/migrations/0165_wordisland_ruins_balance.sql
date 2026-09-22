-- ══════════════════════════════════════════════════════════════
-- Migration 0165 — Wordisland: Ruinen fallen schneller, und es
--                   sind mehr davon
-- ══════════════════════════════════════════════════════════════
-- Sönke, 22.09.2026, nach dem Durchgang im Raum: „Gebe alle Ruinen
-- ein Herz weniger, sodass sie schneller einnehmbar sind. Und es
-- sollen auf so einer größeren Karte mehr Ruinen sein. Doppelt so
-- viele."
--
-- Dahinter steht der offene Punkt aus 0146 („Balance auf echten
-- Inseln"): ein Lichttempel kostete FÜNF Treffer, und ein Treffer
-- kostet eine freie Wahl, also drei richtige Antworten in Folge.
-- In einer 10-Minuten-Runde fiel damit gut möglich gar keine große
-- Ruine — das, worum gekämpft werden soll, war unerreichbar.
--
--   Ruine             Leben alt → neu   Herzen alt → neu
--   ──────────────────────────────────────────────────────
--   Klo                  2 → 1              1 → 0
--   Torbogen             3 → 2              2 → 1
--   Arena                4 → 3              3 → 2
--   Lichttempel          5 → 4              4 → 3
--   Schattentempel       5 → 4              4 → 3
--
-- ── Ein Klo mit NULL Herzen ist kein Fehler ───────────────────
-- `hearts` ist seit 0146 nicht „Leben", sondern „Treffer, die noch
-- abzutragen sind, BEVOR der nächste das Feld nimmt". Null heißt
-- also: eine einzige freie Wahl nimmt es ein. Erreichbar bleibt es
-- trotzdem nur über die Serie — das hängt an `t.ruin_kind is null`
-- in wi_border und nicht an den Herzen. Sönkes Entscheid
-- (AskUserQuestion, 22.09.2026): „Alle fünf −1, Klo auf 0."
--
-- Sichtbare Folge: ein Klo wird nie „aufgedeckt und dann erobert",
-- sondern in EINEM Zug genommen. Das Gerät setzt `revealed` dabei
-- mit (wi_pick_tile, Zweig b) — es steht also nie ein eingefärbter
-- Sockel ohne Gebäude da.
--
-- ── „Doppelt so viele" heißt: doppelte DICHTE ─────────────────
-- Die Zahl hing bisher nur schwach an der Inselgröße (drei bis fünf
-- kleine Orte, immer genau drei große). Jetzt wächst sie mit den
-- Feldern, und auf der Insel, über die Sönke gesprochen hat (rund
-- 430 Felder), sind es doppelt so viele wie vorher:
--
--   Felder   große Orte (je Art)   Tore/Klos (je Art)   gesamt
--   ───────────────────────────────────────────────────────────
--      100          1                    4                11
--      430          2                    8                22   (vorher 11)
--      900          2                   12                30
--
-- Auf kleinen Inseln bleibt es nahe am alten Stand: dort ist nicht
-- die Zahl das Problem, sondern der Platz — bei fünfzehn Orten auf
-- hundert Feldern steht jeder zweite Schritt auf einer Ruine.
-- Deshalb eine Dichte (~ein Ort je zwanzig Felder) mit Deckel, und
-- keine Verdopplung der Formel.
--
-- ── Zwei große Orte derselben Art ─────────────────────────────
-- Ab 320 Feldern liegen zwei Arenen, zwei Licht- und zwei
-- Schattentempel auf der Insel. Das ist Absicht und nicht nur mehr
-- vom Gleichen: mit genau einem Lichttempel entscheidet das Volk,
-- das ihn zuerst erreicht, die Frage für die ganze Runde — mit
-- zweien bleibt sie offen. Die Platzierung kennt den Unterschied
-- nicht, sie sucht einfach zweimal.
--
-- ── Laufende Räume ────────────────────────────────────────────
-- Eine Insel wird beim Rundenstart gebaut; die neue ANZAHL gilt
-- also ab der nächsten Runde. Die HERZEN einer schon stehenden
-- Ruine werden hier gedeckelt — sonst stünde mitten in der Stunde
-- ein Tempel mit vier Herzen da, während die Lobby drei verspricht.
-- Gedeckelt wird nur nach unten (`least`): ein Ort, an dem schon
-- jemand Treffer abgetragen hat, bekommt sie nicht zurück.
--
-- ⚠️ Fehlt diese Migration, rechnet der Server mit den Zahlen von
-- 0146 weiter und das Gerät zeigt die neuen an. Der Prüfstand
-- uitest.js liest beide Dateien und vergleicht sie — er liest dabei
-- die HÖCHSTE Migration, die wi_ruin_def deklariert, also diese.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) wi_ruin_def — dieselbe eine Stelle, neue Zahlen
-- ─────────────────────────────────────────────────────────────
-- Die Funktion behält ihre Signatur und ihre Aufgabe. Wer sie
-- später ändert, ändert DIESE Fassung (Regel:
-- feedback_shop_state_merge_regressions — nie aus der alten
-- Migration kopieren).
create or replace function wi_ruin_def(p_kind text)
  returns table (hearts_full int, value int, big boolean)
  immutable
  set search_path = public
  language sql
as $$
  select d.hearts_full, d.value, d.big
    from (values
      ('klo',      0,  5, false),
      ('tor',      1, 10, false),
      ('arena',    2,  4, true),
      ('licht',    3,  5, true),
      ('schatten', 3,  5, true)
    ) as d(kind, hearts_full, value, big)
   where d.kind = p_kind;
$$;

comment on function wi_ruin_def(text) is
  'Leben (als Herzen), Wertigkeit und Klasse einer Ruine. Die EINE Stelle, an der die Balance steht. 0165: je ein Herz weniger.';

revoke all on function wi_ruin_def(text) from public;
grant execute on function wi_ruin_def(text) to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) wi_build_island — dieselbe Insel, mehr Orte
-- ─────────────────────────────────────────────────────────────
-- Wörtlich die Fassung aus 0146 (Umriss, Landeplätze, Rückgabe),
-- NUR der Block „Die Orte" ist ersetzt. Sie steht hier vollständig
-- und nicht als Verweis: eine Funktion, die man beim Lesen erst aus
-- zwei Migrationen zusammensetzen muss, wird beim nächsten Mal
-- falsch zusammengesetzt.
create or replace function wi_build_island(p_room uuid, p_teams int, p_people int, p_secs int)
  returns int
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  c_per_kid  constant real := 1.6;
  c_area     constant real := 1.78;
  v_target int;
  v_R      int;
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

  v_target := greatest(80, least(900,
                (greatest(p_people, 4) * c_per_kid * (p_secs / 60.0))::int));
  v_R      := greatest(6, least(20, ceil(sqrt(v_target / c_area))::int));
  v_cols   := 2 * v_R + 2;
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

  -- ── Wie viele Orte? (0165) ──────────────────────────────────
  -- Beide Zahlen hängen an den FELDERN und nicht an einer Stufe:
  -- eine Insel für 8 Kinder und eine für 28 sind nicht dasselbe
  -- Spiel, und „ein Ort je zwanzig Felder" bleibt in beiden gleich
  -- dicht. Die Deckel oben und unten sind der Platz, nicht die
  -- Balance — siehe Kopf dieser Datei.
  v_big   := 1 + least(1, (v_n / 320)::int);
  v_small := greatest(4, least(12, (v_n / 40.0 - 3)::int));

  -- ── Die Großen, innen ───────────────────────────────────────
  -- Drei Anläufe mit immer weicheren Bedingungen. Auf einer kleinen
  -- Insel (R = 6, inneres Drittel also ein Kreis von knapp drei
  -- Feldern) passen drei Orte mit vier Feldern Abstand gerade eben;
  -- geht es nicht auf, rücken sie zusammen, statt dass eine Fähigkeit
  -- in dieser Runde fehlt.
  --
  -- ⚠️ Die Runden liegen AUSSEN und die Arten innen: so bekommt
  -- jede Art ihren ersten Platz unter den strengen Bedingungen,
  -- bevor die zweite Arena einen Tempel verdrängt.
  for j in 1 .. v_big loop
    foreach v_kind in array array['schatten', 'licht', 'arena'] loop
      if not wi_place_ruin(p_room, v_kind, 0.45 * v_R, 4.0, 2.0) then
        if not wi_place_ruin(p_room, v_kind, 0.60 * v_R, 2.5, 2.0) then
          perform wi_place_ruin(p_room, v_kind, null, 2.5, 1.5);
        end if;
      end if;
    end loop;
  end loop;

  -- ── Tore und Klos, gestreut ─────────────────────────────────
  -- Drei Felder Abstand: ohne ihn liegen bei Zufall regelmäßig drei
  -- Ruinen nebeneinander, und dann entscheidet eine einzige Ecke das
  -- Spiel.
  --
  -- ⚠️ Der zweite Anlauf (0165) ist der Preis für die größere Zahl:
  -- mit acht Toren und acht Klos ist der Mindestabstand von drei
  -- Feldern irgendwann nicht mehr zu haben, und das alte
  -- `exit when not …` hätte dann einfach still weniger Orte gebaut.
  -- Erst wenn auch mit zwei Feldern Abstand nichts mehr frei ist,
  -- ist die Insel wirklich voll.
  foreach v_kind in array array['tor', 'klo'] loop
    for i in 1 .. v_small loop
      if not wi_place_ruin(p_room, v_kind, null, 3.0, 2.0) then
        exit when not wi_place_ruin(p_room, v_kind, null, 2.0, 1.5);
      end if;
    end loop;
  end loop;

  update wi_boards set radius = v_R where room_id = p_room;
  return v_n;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3) Laufende Inseln: die Herzen deckeln
-- ─────────────────────────────────────────────────────────────
-- Nur nach unten. Ein Tempel, an dem schon zweimal jemand
-- angeklopft hat, steht bei zwei Herzen und bleibt dort — er
-- bekommt durch diese Migration keinen Schutz zurück.
update wi_tiles t
   set hearts = (select d.hearts_full from wi_ruin_def(t.ruin_kind) d)
 where t.ruin_kind is not null
   and t.hearts > (select d.hearts_full from wi_ruin_def(t.ruin_kind) d);
