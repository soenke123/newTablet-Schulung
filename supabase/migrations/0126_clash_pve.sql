-- ═══════════════════════════════════════════════════════════════
-- 0126 · Kingdoms of Mathoria — PvE: die Klasse gegen den Computer
-- ═══════════════════════════════════════════════════════════════
--
-- Bisher ist Kingdoms of Mathoria ausschließlich PvP: 2–8 Völker, die
-- Kinder nach Sitzplatz darauf verteilt, alle erobern sich gegenseitig
-- das Feld. Der kooperative Gegenentwurf fehlte — eine Klasse, die
-- GEMEINSAM gegen einen Gegner spielt.
--
-- Der PvE-Modus steckt alle Kinder in EIN Volk und stellt ihnen einen
-- Computer gegenüber. Die Lehrkraft schaltet in der Lobby um und stellt
-- eine von sieben Stufen ein.
--
-- ── Das Tempo-Problem und seine Lösung ─────────────────────────
-- Ein Computer-Gegner braucht eine Antwortgeschwindigkeit, und „alle
-- 2 Sekunden" geht nicht: `7+5` und eine Stammfunktion sind nicht
-- dieselbe Aufgabe, und 8 Kinder sind nicht 28 Kinder.
--
-- Auch das naheliegende Gegenmittel — den Takt an das GEMESSENE Tempo
-- der Klasse zu koppeln — ist falsch: bei einem festen Verhältnis kann
-- eine gute Klasse dem Gegner nie davonlaufen, weil er in genau dem Maß
-- mitzieht, in dem sie besser wird. Das bestraft die Anstrengung.
--
-- Stattdessen besteht der Gegner aus GENAU SO VIELEN simulierten Bots,
-- wie Kinder im Klassen-Volk sind. Jeder Bot hat einen eigenen Takt:
--
--     Sekunden je Bot-Antwort = pace_secs(Pool) × Zeitfaktor(Stufe)
--
-- `pace_secs` ist die Richtzeit der Aufgabenart (was ein starkes Kind
-- für EINE Aufgabe braucht, clash_task_types.pace_secs), der Zeitfaktor
-- kommt aus der Stufe (Stufe 1 = dreifache Zeit, Stufe 7 = 1,3-fache).
-- Damit skaliert der Gegner von selbst mit Klassengröße UND
-- Aufgabenschwierigkeit, sein Takt steht aber fest — eine schnelle
-- Klasse zieht wirklich davon.
--
-- Getroffen wird nicht jedes Mal: die Quote läuft von 60 % (Stufe 1)
-- bis 95 % (Stufe 7). Zehn Treffer in Folge geben dem Bot zwei
-- zusätzliche Felder, wie die Serie eines Kindes.
--
-- ── Drei Regler, drei getrennte Stellen ────────────────────────
--   1. Tempo  → clash_ai_levels().time_factor
--   2. Quote  → clash_ai_levels().quote
--   3. Fläche → clash_pve_tiles() + clash_pve_layout()
-- Eine Nachbesserung nach der ersten echten Stunde fasst genau eine
-- dieser drei an — kein Client-Anfassen, kein Cache-Stempel.
--
-- ── Die Ramp: der Gegner wächst mit dem eigenen Erfolg ─────────
-- Fläche und Burgen stehen für die ganze Partie fest (ai_level), Tempo
-- und Quote nicht: die Partie beginnt IMMER bei Stufe 1 (ai_stage), und
-- jede erstmals gehaltene eigene Burg hebt sie um eins, gedeckelt bei
-- ai_level. Eine Ratsche — erobert der Computer die Burg zurück, wird
-- er nicht wieder schlechter. Wer schnell vorprescht, bekommt einen
-- ernsteren Gegner; wer langsam vorgeht, hat länger Ruhe.
--
-- Als Gegengewicht bekommt die Klasse je zusätzlicher Burg eine
-- „Rüstung": ihre Felder halten dann einen Treffer mehr aus
-- (clash_tiles.armor_hits), gedeckelt bei +3. Ein Randfeld-Test ist
-- dafür nicht nötig — der Computer kann per Nachbarschaftsregel ohnehin
-- nur Grenzfelder angreifen, jedes angreifbare Klassenfeld IST eins.
--
-- ── Die Fläche wird erzeugt, nicht nachgeschlagen ──────────────
-- clash_layouts (0093) hat sieben feste Geometrien mit festen
-- Kachelzahlen. Die PvE-Regel braucht 9 × 7 = 63 Größen (8–16 Felder
-- für die Klasse, mal Stufe für den Gegner); die als Referenzdaten
-- abzulegen wären ~200 KB erzeugtes JSON.
--
-- Der Grund, aus dem 0093 die Geometrie NICHT zur Laufzeit rechnet
-- (0093:34 ff.: „Jedes Gerät sieht dadurch exakt dasselbe Board"),
-- greift hier nicht: gerechnet wird EINMAL beim Start, auf dem Server,
-- und das Ergebnis steht in clash_tiles. Alle Geräte lesen weiterhin
-- nur diese eine Wahrheit; Client-Geometrie gibt es nach wie vor keine.
--
-- ── Kein Cron ──────────────────────────────────────────────────
-- clash_ai_tick läuft lazy aus jedem eingehenden RPC (clash_submit,
-- clash_view, clash_room_get) — dasselbe Muster wie
-- clash_maybe_advance_phase (0093) und clash_expire_pending_picks
-- (0106). Ein Advisory-Lock sorgt dafür, dass 28 gleichzeitig pollende
-- Tablets den Takt trotzdem nur einmal auslösen.
--
-- ── Zwei Völker, nicht acht ────────────────────────────────────
-- PvE hat IMMER genau team_count = 2: Slot 0 ist die Klasse, Slot 1 der
-- Computer. Die erzeugte Geometrie hat zwar level+1 Regionen (damit der
-- Gegner mehrere Burgen und ein zusammenhängendes Hinterland hat), aber
-- alle Regionen ≥ 1 landen als owner_team = 1 im Feld.
--
-- ⚠️ Neu deklariert werden clash_preview_teams (0113), clash_room_start
-- (0118), clash_room_reset (0108), clash_fire_teams (0125),
-- clash_tiles_json (0100), clash_sig_of (0109), clash_capture_apply
-- (0106), clash_submit/clash_view/clash_room_get (0125) — jeweils die
-- HÖCHSTE bestehende Fassung (Regel:
-- feedback_shop_state_merge_regressions).
--
-- Kein DROP: `add column if not exists`, `create table if not exists`,
-- `create or replace` (Regel: feedback_supabase_no_drop_statements).
-- DO-Blöcke braucht es hier nicht — es gibt keine Rückfüllung, die bei
-- einem zweiten Lauf eine Einstellung der Lehrkraft überschreiben
-- könnte: die Vorgabewerte ('pvp', Stufe 3) sind für alle
-- Bestandsräume genau richtig.
--
-- Client-Anpassung: ja (tool.js/tool.css) ⇒ Cache-Stempel.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_task_types.pace_secs — was eine Aufgabe kostet
-- ─────────────────────────────────────────────────────────────
-- Sekunden, die ein STARKES Kind für eine Aufgabe dieser Art braucht.
-- Nicht der Durchschnitt der Klasse, sondern die Obergrenze dessen, was
-- gut geht — der Bot soll ein ernstzunehmender Gegner sein, kein
-- Mitläufer.
--
-- Der Vorgabewert 10 ist bewusst mittelhoch: eine Aufgabenart, die
-- später dazukommt und hier vergessen wird, macht den Bot langsam und
-- damit harmlos, nicht unschlagbar.
alter table clash_task_types
  add column if not exists pace_secs numeric not null default 10;

comment on column clash_task_types.pace_secs is
  'Richtzeit in Sekunden, die ein starkes Kind für EINE Aufgabe dieser Art braucht (0126). '
  'Grundlage des Bot-Takts im PvE: Sekunden je Bot-Antwort = pace_secs × Zeitfaktor der Stufe. '
  'Auswahlaufgaben (Pool-Wert „mc") zählen mit 60 % davon, siehe clash_ai_pace. Schalterzeilen '
  '(flag) tragen 0 und werden nie eingerechnet.';

-- Die Werte selbst. Ausdrücklich `update` und nicht `on conflict do
-- nothing` bei den Seed-Inserts der Vorgänger-Migrationen: die Zeilen
-- existieren längst, ein `do nothing` käme nie in der Datenbank an
-- (Regel: feedback_stale_reference_data_do_nothing).
update clash_task_types set pace_secs = v.p
  from (values
    ('add100',        3),
    ('square20',      3),
    ('muldiv20',      3),
    ('addsub10k',     6),
    ('frac_compare',  4),
    ('frac_reduce',   6),
    ('frac_muldiv',  12),
    ('frac_addsub',  12),
    ('num_bin',      10),
    ('num_hex',      10),
    ('num_binhex',    8),
    ('bin1',         12),
    ('bin2',         12),
    ('bin3',         12),
    ('eq_solve',     15),
    ('term_expand',  15),
    ('ana_deriv',    20),
    ('ana_int',      25)
  ) as v(k, p)
 where clash_task_types.key = v.k;

-- Schalter sind keine Aufgaben (0118) und dürfen den Mittelwert des
-- Pools nicht verwässern.
update clash_task_types set pace_secs = 0 where flag;


-- ─────────────────────────────────────────────────────────────
-- 2) clash_boards — Modus, Stufe, Ramp, eingefrorener Takt
-- ─────────────────────────────────────────────────────────────
alter table clash_boards
  add column if not exists mode text not null default 'pvp'
    check (mode in ('pvp', 'pve'));

alter table clash_boards
  add column if not exists ai_level int not null default 3
    check (ai_level between 1 and 7);

alter table clash_boards
  add column if not exists ai_stage int not null default 1
    check (ai_stage between 1 and 7);

alter table clash_boards add column if not exists ai_slot      int;
alter table clash_boards add column if not exists ai_pace_secs numeric;
alter table clash_boards add column if not exists ai_ticked_at timestamptz;

comment on column clash_boards.mode is
  'pvp (2–8 Völker gegeneinander) oder pve (alle Kinder in Slot 0, der Computer in Slot 1). '
  'Nur in phase=lobby änderbar (clash_room_set_mode, 0126).';
comment on column clash_boards.ai_level is
  'Eingestellte Schwierigkeit 1–7. Legt die FLÄCHE fest: der Computer bekommt ai_level Burgen '
  'und das ai_level-fache der Klassenfläche. Fest für die ganze Partie.';
comment on column clash_boards.ai_stage is
  'Die Ramp: Tempo und Quote des Computers. Beginnt IMMER bei 1 und steigt um eins je erstmals '
  'gehaltener Klassen-Burg, gedeckelt bei ai_level. Fällt nie zurück (Ratsche) — erobert der '
  'Computer eine Burg zurück, bleibt er so gut, wie er geworden ist.';
comment on column clash_boards.ai_slot is
  'Slot des Computers (im PvE immer 1), null im PvP. Der Client macht daran seinen Graufilter '
  'fest — eine Zahl statt einer zweiten Kopie der Modus-Regel im Frontend.';
comment on column clash_boards.ai_pace_secs is
  'Beim Start aus dem Aufgabenpool eingefrorene Richtzeit (clash_ai_pace). Der Pool ist ab dem '
  'Start ohnehin fest; einmal rechnen statt bei jedem Takt.';
comment on column clash_boards.ai_ticked_at is
  'Wann clash_ai_tick zuletzt gelaufen ist. Mindestabstand 500 ms, damit 28 gleichzeitig pollende '
  'Tablets den Takt nicht 28-mal auslösen.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_tiles.armor_hits — die Rüstung als Trefferzähler
-- ─────────────────────────────────────────────────────────────
-- Nicht „wie viel Rüstung hat dieses Feld", sondern „wie oft wurde es
-- schon getroffen". Die Rüstungsstärke selbst hängt an den Burgen der
-- Klasse und ändert sich mitten in der Partie (clash_ai_armor) — stünde
-- sie je Feld, müsste jede Burg-Eroberung Dutzende Zeilen nachziehen.
-- So ist es eine Zahl gegen eine berechnete Schwelle.
alter table clash_tiles
  add column if not exists armor_hits int not null default 0;

comment on column clash_tiles.armor_hits is
  'Wie oft die Rüstung dieses Feldes schon getroffen wurde (0126, nur PvE). Der Besitzer wechselt '
  'erst, wenn armor_hits die aktuelle Rüstung der Klasse erreicht hat (clash_ai_armor). Wird bei '
  'jedem Besitzerwechsel auf 0 gesetzt (clash_capture_apply).';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_ai_bots — ein Bot je Kind
-- ─────────────────────────────────────────────────────────────
-- Warum überhaupt Zeilen und nicht ein Zähler am Board? Weil die Bots
-- eigene Takte und eigene Serien haben sollen. Ein einzelner Gegner mit
-- N-fachem Tempo würde in gleichmäßigen Wellen zuschlagen; N Bots mit
-- je ±10 % Streuung erzeugen dasselbe Mittel, aber ein unregelmäßiges,
-- lebendiges Muster — und die Namensliste auf dem Beamer bekommt etwas
-- zu zeigen.
create table if not exists clash_ai_bots (
  room_id       uuid not null references skill_rooms(id) on delete cascade,
  bot_no        int  not null,
  next_at       timestamptz not null default now(),
  streak        int  not null default 0,
  correct_count int  not null default 0,
  primary key (room_id, bot_no)
);

comment on table clash_ai_bots is
  'Die simulierten Gegner einer PvE-Partie, einer je anwesendem Kind (0126). next_at ist der '
  'nächste fällige Antwortzeitpunkt, streak die laufende Trefferserie (alle 10 gibt es zwei '
  'Bonusfelder). Wird von clash_ai_tick angelegt, nachgeführt und abgebaut.';

alter table clash_ai_bots enable row level security;

-- Ohne diesen Grant scheitert jede Änderung über die API mit
-- „permission denied for table clash_ai_bots", auch als service_role
-- (Regel: feedback_service_role_needs_explicit_grants).
grant select, insert, update, delete on clash_ai_bots to service_role;


-- ─────────────────────────────────────────────────────────────
-- 5) clash_ai_levels — Tempo und Quote, an einem Ort
-- ─────────────────────────────────────────────────────────────
-- Nach dem Muster von clash_streak_goals (0123/0125): die Zahlen stehen
-- EINMAL hier und werden an den Client durchgereicht, damit die Lobby
-- die Stufen beschreiben kann, ohne sie zu doppeln.
--
-- Beide Reihen laufen linear zwischen den beiden Ankern, die die
-- Einschätzung vorgibt:
--   Stufe 1 — dreifache Zeit eines starken Kindes, 60 % richtig
--   Stufe 7 — 1,3-fache Zeit,                      95 % richtig
--
-- Die Streuung von ±10 % sitzt bewusst NICHT in dieser Tabelle,
-- sondern als eigener Schlüssel: sie ist keine Eigenschaft der Stufe,
-- sondern der Bots.
create or replace function clash_ai_levels()
  returns jsonb
  language sql
  immutable
as $$
  select jsonb_build_object(
    -- Vielfaches der Kind-Richtzeit, Index 0 = Stufe 1
    'time_factor', jsonb_build_array(3.00, 2.72, 2.43, 2.15, 1.87, 1.58, 1.30),
    -- Trefferquote je Antwort
    'quote',       jsonb_build_array(0.60, 0.66, 0.72, 0.78, 0.83, 0.89, 0.95),
    -- ± dieser Anteil auf den Takt jedes einzelnen Bots
    'variance',    0.10,
    -- Treffer in Folge für den Bot-Bonus …
    'bot_streak',  10,
    -- … und wie viele Felder er bringt
    'bot_reward',  2,
    -- Obergrenze der Rüstung, die die Klasse durch Burgen bekommt
    'armor_cap',   3
  );
$$;

comment on function clash_ai_levels() is
  'Die Zahlen des Computer-Gegners, an einem Ort (0126): time_factor und quote je Stufe 1–7 '
  '(Index 0 = Stufe 1), variance als Streuung des einzelnen Bot-Takts, bot_streak/bot_reward für '
  'die Serie des Bots, armor_cap als Deckel der Klassen-Rüstung. Wird an beide Ansichten '
  'durchgereicht, damit die Lobby die Stufen beschreiben kann, ohne die Zahlen zu doppeln.';

grant execute on function clash_ai_levels() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) clash_pve_tiles — wie groß ist die Klassenfläche?
-- ─────────────────────────────────────────────────────────────
-- 8 Felder bis 12 Kinder, dann linear steigend, 16 ab 24 Kindern.
-- `round(n · 2/3)` trifft beide Anker exakt (12 → 8, 24 → 16); die
-- Klammern davor und danach halten die Ränder.
--
-- Warum überhaupt mit der Klasse mitwachsen: die Fläche ist der Vorrat,
-- aus dem sich beide Seiten bedienen. Bei 28 Kindern auf 8 Feldern wäre
-- die Partie vorbei, bevor die hinteren Tische ihre erste Aufgabe
-- gelesen haben.
create or replace function clash_pve_tiles(p_players int)
  returns int
  language sql
  immutable
as $$
  select least(16, greatest(8, round(coalesce(p_players, 0) * 2.0 / 3.0)::int));
$$;

comment on function clash_pve_tiles(int) is
  'Startfelder des Klassen-Volks im PvE (0126): 8 bis 12 Kinder, linear bis 16 bei 24 Kindern, '
  'darüber gleichbleibend. Der Computer bekommt das ai_level-fache davon.';

grant execute on function clash_pve_tiles(int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) clash_pve_layout — das Feld, beim Start erzeugt
-- ─────────────────────────────────────────────────────────────
-- Liefert {rows, cols, tiles: [{r,c,slot,castle}]} für p_level+1
-- gleich große Regionen zu je p_tiles Kacheln. Region 0 ist die Klasse,
-- 1..p_level sind die Gebiete des Computers (die beim Einspielen zu
-- einem Volk verschmelzen).
--
-- Der Ablauf ist derselbe wie beim Offline-Skript von 0093, nur
-- parametrisch:
--   1. eine Hex-INSEL statt eines Rechtecks (Zellen innerhalb eines
--      Kreises) — der Rand bleibt frei und das Feld sieht gewachsen aus
--      statt zugeschnitten;
--   2. die Saatpunkte gleichmäßig auf einem Kreis, mit zufälligem
--      Startwinkel: jede Runde eine andere Ausrichtung, aber immer
--      dieselbe Fairness;
--   3. reihum fluten, jede Region nimmt die freie Nachbarzelle, die
--      ihrer eigenen Burg am nächsten liegt.
--
-- Die Nachbarschaft kommt aus denselben sechs Versätzen, die
-- clash_is_neighbor (0093:235) prüft — Erzeugung und Spiel können damit
-- nicht auseinanderlaufen. Nachgerechnet statt aufgerufen wird sie nur,
-- weil die Flutung den Nachbarn braucht und nicht bloß ein Ja/Nein.
create or replace function clash_pve_layout(p_tiles int, p_level int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_regions int := least(greatest(coalesce(p_level, 1), 1), 7) + 1;
  v_need    int := greatest(coalesce(p_tiles, 8), 1);
  v_total   int;
  v_rad     double precision;
  v_rows    int;
  v_cols    int;
  v_cx      double precision;
  v_cy      double precision;
  v_n       int;
  v_r       int[];
  v_c       int[];
  v_px      double precision[];
  v_py      double precision[];
  v_own     int[];
  v_idx     int[];
  v_nb      int[];
  v_seed    int[] := '{}'::int[];
  v_cnt     int[] := '{}'::int[];
  v_phi     double precision := random() * 2 * pi();
  v_x       double precision;
  v_y       double precision;
  v_d       double precision;
  v_bestd   double precision;
  v_best    int;
  v_j       int;
  v_nr      int;
  v_nc      int;
  v_full    boolean;
  v_moved   boolean;
  v_tiles   jsonb := '[]'::jsonb;
  r int; c int; i int; k int; g int;
  -- Die sechs Nachbarn im odd-r-Versatzgitter, nach Zeilen-Parität
  -- getrennt — Wort für Wort die beiden Zeilen aus clash_is_neighbor.
  v_or      int[] := array[-1, -1,  0,  0,  1,  1];
  v_oc_odd  int[] := array[ 0,  1, -1,  1,  0,  1];
  v_oc_even int[] := array[-1,  0, -1,  1, -1,  0];
begin
  v_total := v_need * v_regions;

  -- Der Radius wird aus der gewünschten Fläche geschätzt (eine Zelle
  -- belegt 1 × 0,866 Flächeneinheiten, und die Insel soll etwa 30 %
  -- größer sein als der Inhalt, damit der Rand ausfranst statt exakt zu
  -- schließen). Geschätzt, nicht gerechnet: die Schleife zieht nach,
  -- falls es doch nicht reicht. Sie endet garantiert, weil der Radius
  -- in jedem Durchlauf wächst.
  v_rad := sqrt(v_total::double precision * 0.36);

  loop
    v_rows := greatest(3, (ceil(2 * v_rad / 0.866) + 1)::int);
    v_cols := greatest(3, (ceil(2 * v_rad) + 2)::int);
    v_cy   := (v_rows - 1) * 0.866 / 2;
    v_cx   := (v_cols - 1) / 2.0 + 0.25;   -- +0,25 = mittlerer Zeilenversatz

    v_n   := 0;
    v_r   := '{}'::int[];
    v_c   := '{}'::int[];
    v_px  := '{}'::double precision[];
    v_py  := '{}'::double precision[];
    v_idx := array_fill(0, array[v_rows * v_cols]);

    for r in 0 .. v_rows - 1 loop
      for c in 0 .. v_cols - 1 loop
        v_x := c + case when r % 2 = 1 then 0.5 else 0.0 end;
        v_y := r * 0.866;
        if sqrt((v_x - v_cx) ^ 2 + (v_y - v_cy) ^ 2) <= v_rad + 0.5 then
          v_n := v_n + 1;
          v_r[v_n]  := r;
          v_c[v_n]  := c;
          v_px[v_n] := v_x;
          v_py[v_n] := v_y;
          -- Rückweg Koordinate → Zellindex, damit die Nachbarschaft
          -- unten in O(6) statt in O(n) je Zelle steht.
          v_idx[r * v_cols + c + 1] := v_n;
        end if;
      end loop;
    end loop;

    exit when v_n >= v_total;
    v_rad := v_rad + 0.5;
  end loop;

  -- Nachbarn einmal vorrechnen: flaches Feld, sechs Plätze je Zelle,
  -- 0 heißt „da ist nichts".
  v_nb := array_fill(0, array[v_n * 6]);
  for i in 1 .. v_n loop
    for k in 1 .. 6 loop
      v_nr := v_r[i] + v_or[k];
      v_nc := v_c[i] + case when v_r[i] % 2 = 1 then v_oc_odd[k] else v_oc_even[k] end;
      if v_nr >= 0 and v_nr < v_rows and v_nc >= 0 and v_nc < v_cols then
        v_nb[(i - 1) * 6 + k] := v_idx[v_nr * v_cols + v_nc + 1];
      end if;
    end loop;
  end loop;

  -- Saatpunkte: gleichmäßig auf einem Kreis um die Mitte. Der
  -- Startwinkel ist zufällig, die Abstände sind es nicht — zwei Völker
  -- stehen sich immer gegenüber, acht immer im Achteck.
  v_own := array_fill(-1, array[v_n]);
  for g in 0 .. v_regions - 1 loop
    v_x := v_cx + 0.55 * v_rad * cos(v_phi + 2 * pi() * g / v_regions);
    v_y := v_cy + 0.55 * v_rad * sin(v_phi + 2 * pi() * g / v_regions);

    v_best := null; v_bestd := null;
    for i in 1 .. v_n loop
      if v_own[i] <> -1 then continue; end if;
      v_d := (v_px[i] - v_x) ^ 2 + (v_py[i] - v_y) ^ 2;
      if v_bestd is null or v_d < v_bestd then
        v_best := i; v_bestd := v_d;
      end if;
    end loop;

    v_own[v_best] := g;
    v_seed := v_seed || v_best::int;
    v_cnt  := v_cnt  || 1::int;
  end loop;

  -- Reihum fluten. „Am nächsten zur eigenen Burg" statt „irgendein
  -- Nachbar" hält die Gebiete rund; ohne das wüchsen sie in Schläuchen
  -- an der Küste entlang und die Grenzen lägen an unmöglichen Stellen.
  loop
    v_moved := false;
    v_full  := true;

    for g in 0 .. v_regions - 1 loop
      if v_cnt[g + 1] >= v_need then continue; end if;
      v_full := false;

      v_best := null; v_bestd := null;
      for i in 1 .. v_n loop
        if v_own[i] <> g then continue; end if;
        for k in 1 .. 6 loop
          v_j := v_nb[(i - 1) * 6 + k];
          if v_j = 0 then continue; end if;
          if v_own[v_j] <> -1 then continue; end if;
          v_d := (v_px[v_j] - v_px[v_seed[g + 1]]) ^ 2
               + (v_py[v_j] - v_py[v_seed[g + 1]]) ^ 2;
          -- Gleichstand nach (r, c), damit dasselbe Feld bei gleicher
          -- Ausgangslage immer gleich ausgeht.
          if v_bestd is null
             or v_d < v_bestd
             or (v_d = v_bestd and row(v_r[v_j], v_c[v_j]) < row(v_r[v_best], v_c[v_best]))
          then
            v_best := v_j; v_bestd := v_d;
          end if;
        end loop;
      end loop;

      if v_best is not null then
        v_own[v_best] := g;
        v_cnt[g + 1]  := v_cnt[g + 1] + 1;
        v_moved := true;
      end if;
    end loop;

    -- Eingekesselt heißt fertig: lieber eine Region, die ein Feld zu
    -- klein ist, als eine Endlosschleife.
    exit when v_full or not v_moved;
  end loop;

  -- Nicht vergebene Zellen kommen gar nicht erst ins Feld. Der äußere
  -- Rand bleibt Loch — kein owner_team = -1 nötig, die neutralen
  -- Kacheln aus 0105 bleiben ein PvP-Phänomen.
  for i in 1 .. v_n loop
    if v_own[i] >= 0 then
      v_tiles := v_tiles || jsonb_build_array(jsonb_build_object(
        'r', v_r[i], 'c', v_c[i], 'slot', v_own[i],
        'castle', v_seed[v_own[i] + 1] = i));
    end if;
  end loop;

  return jsonb_build_object('rows', v_rows, 'cols', v_cols, 'tiles', v_tiles);
end;
$$;

revoke all on function clash_pve_layout(int, int) from public;

comment on function clash_pve_layout(int, int) is
  'Erzeugt die PvE-Geometrie: p_level+1 gleich große, zusammenhängende Regionen zu je p_tiles '
  'Kacheln auf einer Hex-Insel, je eine Burg im Zentrum. Region 0 = Klasse. Liefert '
  '{rows, cols, tiles:[{r,c,slot,castle}]}. Wird EINMAL beim Start gerufen (clash_room_start); '
  'das Ergebnis steht danach in clash_tiles und ist für alle Geräte dieselbe Wahrheit.';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_ai_pace — was eine Aufgabe aus DIESEM Pool kostet
-- ─────────────────────────────────────────────────────────────
-- Der Mittelwert über die gewählten Aufgabenarten, Auswahlaufgaben mit
-- 60 % gewichtet (sechs Kacheln lesen geht schneller als eine Zahl
-- eintippen — dieselbe Annahme, die auch die Kinder betrifft).
--
-- Abgeleitete Arten (`derived`, z. B. num_binhex) stehen nie im Pool;
-- sie kommen über ihre Grundarten ins Spiel und werden hier über deren
-- Richtzeiten mitgemittelt. Der Mittelwert ist ohnehin eine Schätzung —
-- eine Sonderbehandlung dafür wäre Genauigkeit an der falschen Stelle.
create or replace function clash_ai_pace(p_pool jsonb)
  returns numeric
  security definer
  set search_path = public
  language sql
  stable
as $$
  select greatest(coalesce(
    (select avg(t.pace_secs * case when e.value = 'mc' then 0.6 else 1.0 end)
       from jsonb_each_text(coalesce(p_pool, '{}'::jsonb)) e
       join clash_task_types t on t.key = e.key
      where not t.flag),
    10), 1);
$$;

revoke all on function clash_ai_pace(jsonb) from public;

comment on function clash_ai_pace(jsonb) is
  'Mittlere Richtzeit der Aufgaben eines Pools in Sekunden (0126), Auswahlaufgaben mit 60 % '
  'gewichtet, Schalterzeilen ausgenommen. Wird in clash_room_start einmal ausgewertet und in '
  'clash_boards.ai_pace_secs eingefroren.';


-- ─────────────────────────────────────────────────────────────
-- 9) clash_ai_armor — die Rüstung der Klasse
-- ─────────────────────────────────────────────────────────────
-- Eine Burg gehört zum Start dazu und zählt deshalb nicht: die Rüstung
-- ist die Belohnung fürs Erobern, nicht fürs Dabeisein. Gedeckelt bei
-- armor_cap, sonst würde die Schlussphase einer gewonnenen Partie zäh.
create or replace function clash_ai_armor(p_room uuid)
  returns int
  security definer
  set search_path = public
  language sql
  stable
as $$
  select least(
    greatest((select count(*)::int
                from clash_tiles
               where room_id = p_room and owner_team = 0 and is_castle) - 1, 0),
    greatest((clash_ai_levels()->>'armor_cap')::int, 0));
$$;

revoke all on function clash_ai_armor(uuid) from public;

comment on function clash_ai_armor(uuid) is
  'Wie viele Extra-Treffer die Felder des Klassen-Volks im PvE aushalten (0126): eigene Burgen '
  'minus die Startburg, gedeckelt bei armor_cap. Gilt für ALLE Klassenfelder — ein Randfeld-Test '
  'ist unnötig, weil der Computer per Nachbarschaftsregel ohnehin nur Grenzfelder erreicht.';


-- ─────────────────────────────────────────────────────────────
-- 10) clash_ai_capture — der Angriff eines Bots
-- ─────────────────────────────────────────────────────────────
-- Das Gegenstück zu clash_capture_random (0125), aber mit umgekehrter
-- Blickrichtung: der Computer greift nur die Klasse an, und er trifft
-- lieber dort, wo er schon einmal getroffen hat.
--
-- Das `order by (armor_hits > 0) desc` ist keine Taktik, sondern
-- Lesbarkeit: bröselte die Rüstung überall gleichzeitig, sähe die
-- Klasse zwanzig angeknackste Felder und verstünde nicht, warum keines
-- fällt. So bricht sichtbar eines nach dem anderen.
create or replace function clash_ai_capture(p_room uuid, p_armor int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_tr     int;
  v_tc     int;
  v_castle boolean;
  v_hits   int;
  i        int;
begin
  -- Drei Anläufe wie seit 0106: eine gerade gesperrte Zeile ist kein
  -- „kein Feld da".
  for i in 1..3 loop
    v_tr := null; v_tc := null;
    select t.r, t.c, t.is_castle, t.armor_hits
      into v_tr, v_tc, v_castle, v_hits
      from clash_tiles t
     where t.room_id = p_room
       and t.owner_team = 0
       and exists (
         select 1 from clash_tiles m
          where m.room_id = t.room_id
            and m.owner_team = 1
            and clash_is_neighbor(m.r, m.c, t.r, t.c)
       )
     order by (t.armor_hits > 0) desc, random()
     limit 1
       for update of t skip locked;
    exit when v_tr is not null;
  end loop;

  if v_tr is null then
    return jsonb_build_object('captured', null, 'castle_hit', null, 'armor_hit', null);
  end if;

  -- Burgen haben ihre eigenen drei Leben (0100) und bekommen keine
  -- Rüstung obendrauf — sonst hätte die letzte Burg einer Klasse mit
  -- vier Burgen sieben Leben und das Ende zöge sich.
  if not v_castle and coalesce(v_hits, 0) < coalesce(p_armor, 0) then
    update clash_tiles
       set armor_hits = coalesce(armor_hits, 0) + 1, updated_at = now()
     where room_id = p_room and r = v_tr and c = v_tc;

    return jsonb_build_object(
      'captured', null, 'castle_hit', null,
      'armor_hit', jsonb_build_object('r', v_tr, 'c', v_tc,
                                      'left', coalesce(p_armor, 0) - coalesce(v_hits, 0) - 1));
  end if;

  return clash_capture_apply(p_room, 1, v_tr, v_tc) || jsonb_build_object('armor_hit', null);
end;
$$;

revoke all on function clash_ai_capture(uuid, int) from public;

comment on function clash_ai_capture(uuid, int) is
  'Ein Angriff des Computers im PvE (0126): lost ein an ihn grenzendes Feld der Klasse aus, '
  'bereits angeknackste bevorzugt. Nicht-Burg-Felder mit Rüstung sammeln einen Treffer '
  '(armor_hits) statt den Besitzer zu wechseln; sonst gilt clash_capture_apply wie immer.';


-- ─────────────────────────────────────────────────────────────
-- 11) clash_ai_tick — der Herzschlag, ohne Cron
-- ─────────────────────────────────────────────────────────────
-- Läuft aus jedem eingehenden RPC (clash_submit, clash_view,
-- clash_room_get) — dasselbe Lazy-Muster wie clash_maybe_advance_phase
-- (0093) und clash_expire_pending_picks (0106). Eine Klasse pollt alle
-- 8 Sekunden je Gerät; bei 28 Geräten kommt also etwa dreimal pro
-- Sekunde jemand vorbei, und das genügt für einen Takt, dessen
-- kürzestes Intervall bei ~2 Sekunden liegt.
--
-- pg_try_advisory_xact_lock statt einer Sperre auf der Board-Zeile:
-- `try` überspringt, `for update` würde 28 Anfragen hintereinander
-- aufreihen und die Antwortzeit aller Tablets an den Takt koppeln.
create or replace function clash_ai_tick(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_board   clash_boards;
  v_lv      jsonb := clash_ai_levels();
  v_var     double precision;
  v_stage   int;
  v_factor  numeric;
  v_quote   double precision;
  v_beat    double precision;
  v_kids    int;
  v_castles int;
  v_armor   int;
  v_goal    int;
  v_reward  int;
  v_bot     record;
  v_next    timestamptz;
  v_streak  int;
  v_correct int;
  v_moves   int;
  j         int;
begin
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.room_id is null then return; end if;
  if v_board.mode <> 'pve' or v_board.phase <> 'running' then return; end if;

  -- Billiger Vorabtest, bevor überhaupt um die Sperre gebeten wird.
  if v_board.ai_ticked_at is not null
     and v_board.ai_ticked_at > now() - interval '500 milliseconds' then
    return;
  end if;

  if not pg_try_advisory_xact_lock(hashtext(p_room::text)) then
    return;
  end if;

  -- Zweite Lesung NACH der Sperre: wer sie eben noch hielt, hat
  -- inzwischen festgeschrieben, und in READ COMMITTED sieht dieses
  -- frische SELECT dessen ai_ticked_at. Ohne die Wiederholung liefe der
  -- Takt bei zwei fast gleichzeitigen Anfragen doppelt.
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.mode <> 'pve' or v_board.phase <> 'running' then return; end if;
  if v_board.ai_ticked_at is not null
     and v_board.ai_ticked_at > now() - interval '500 milliseconds' then
    return;
  end if;

  -- ── Die Ramp ────────────────────────────────────────────────
  -- greatest(…, ai_stage) ist die Ratsche: eine zurückeroberte Burg
  -- senkt die Stufe nicht wieder.
  select count(*)::int into v_castles
    from clash_tiles where room_id = p_room and owner_team = 0 and is_castle;

  v_stage := least(v_board.ai_level, greatest(v_board.ai_stage, greatest(v_castles, 1)));
  if v_stage <> v_board.ai_stage then
    update clash_boards set ai_stage = v_stage where room_id = p_room;
  end if;

  v_factor := (v_lv->'time_factor'->>(v_stage - 1))::numeric;
  v_quote  := (v_lv->'quote'->>(v_stage - 1))::double precision;
  v_var    := coalesce((v_lv->>'variance')::double precision, 0.1);
  v_goal   := greatest(coalesce((v_lv->>'bot_streak')::int, 10), 1);
  v_reward := greatest(coalesce((v_lv->>'bot_reward')::int, 2), 0);

  v_beat := greatest(coalesce(v_board.ai_pace_secs, 10) * coalesce(v_factor, 2), 1)::double precision;

  -- ── So viele Bots wie Kinder ────────────────────────────────
  -- Dieselbe Anwesenheitsgrenze wie 0079/0113/0121. Mindestens einer,
  -- damit eine Partie nicht stillsteht, während gerade alle Tablets im
  -- Sperrbildschirm sind.
  select count(*)::int into v_kids
    from clash_players pl
    join skill_participants p on p.id = pl.participant_id
   where p.room_id = p_room
     and pl.team_index = 0
     and p.left_at is null
     and not p.blocked
     and p.last_seen_at > now() - interval '90 seconds';
  v_kids := greatest(coalesce(v_kids, 0), 1);

  insert into clash_ai_bots (room_id, bot_no, next_at)
  select p_room, g, now() + make_interval(secs => v_beat)
    from generate_series(1, v_kids) g
   on conflict (room_id, bot_no) do nothing;

  delete from clash_ai_bots where room_id = p_room and bot_no > v_kids;

  -- ── Die fälligen Bots ───────────────────────────────────────
  for v_bot in
    select * from clash_ai_bots
     where room_id = p_room and next_at <= now()
     order by bot_no
       for update skip locked
  loop
    v_next    := v_bot.next_at;
    v_streak  := v_bot.streak;
    v_correct := v_bot.correct_count;

    -- Aufholen begrenzen. Wenn ein Raum eine Minute lang niemanden
    -- hatte, der pollt (Pause, Netz weg), stünden sonst zwölf Züge je
    -- Bot an und das halbe Feld fiele in einem einzigen Takt. Der
    -- Rückstand verfällt bewusst: der Computer spielt weiter, er holt
    -- nicht nach.
    if v_next < now() - make_interval(secs => v_beat * 3) then
      v_next := now() - make_interval(secs => v_beat * 0.5);
    end if;

    v_moves := 0;
    while v_next <= now() and v_moves < 2 loop
      v_armor := clash_ai_armor(p_room);

      if random() < v_quote then
        perform clash_ai_capture(p_room, v_armor);
        v_streak  := v_streak + 1;
        v_correct := v_correct + 1;

        -- Die Serie des Bots — dieselbe Idee wie die Einzel-Serie eines
        -- Kindes (0125), nur ohne Auswahl: der Computer sucht sich
        -- nichts aus, er nimmt.
        if v_streak % v_goal = 0 then
          for j in 1 .. v_reward loop
            perform clash_ai_capture(p_room, v_armor);
          end loop;
          perform clash_team_event_insert(p_room, 1, 'individual_fire',
            jsonb_build_object('name', 'Bot ' || v_bot.bot_no, 'streak', v_streak));
        end if;
      else
        v_streak := 0;
      end if;

      v_moves := v_moves + 1;
      -- ±variance je EINZELNEM Zug, nicht je Bot: sonst wäre ein Bot
      -- dauerhaft der schnelle und einer dauerhaft der lahme, und das
      -- Muster auf dem Feld wiederholte sich.
      v_next := v_next + make_interval(
        secs => v_beat * (1 - v_var + random() * 2 * v_var));
    end loop;

    update clash_ai_bots
       set next_at = v_next, streak = v_streak, correct_count = v_correct
     where room_id = p_room and bot_no = v_bot.bot_no;
  end loop;

  perform clash_check_win(p_room);

  update clash_boards set ai_ticked_at = now() where room_id = p_room;
end;
$$;

revoke all on function clash_ai_tick(uuid) from public;

comment on function clash_ai_tick(uuid) is
  'Der Takt des Computer-Gegners (0126). Kein Cron: läuft lazy aus clash_submit/clash_view/'
  'clash_room_get, höchstens alle 500 ms und durch pg_try_advisory_xact_lock nie doppelt. Gleicht '
  'die Bot-Zahl den anwesenden Kindern an, führt die Ramp (ai_stage) nach und lässt jeden fälligen '
  'Bot bis zu zwei Züge machen. Steigt im PvP auf der ersten Zeile aus.';


-- ─────────────────────────────────────────────────────────────
-- 12) clash_room_set_mode — die Lobby-Bedienung
-- ─────────────────────────────────────────────────────────────
-- Zwilling von clash_room_set_pool (0109) und clash_room_set_factions
-- (0097): Besitzprüfung, nur in der Lobby, Rückgabe im selben Format.
--
-- p_faction ist das Volk der KLASSE. Das Volk des Computers wird nicht
-- gewählt, sondern beim Start gezogen (clash_room_start) — „immer ein
-- anderes Team" war die Vorgabe, und eine Wahl dafür wäre eine Frage,
-- auf die niemand eine Meinung hat.
create or replace function clash_room_set_mode(p_code text, p_mode text,
                                              p_level int default null,
                                              p_faction int default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_room   skill_rooms;
  v_board  clash_boards;
  v_mode   text;
  v_level  int;
  v_class  int;
  v_ai     int;
  v_facs   jsonb;
  v_count  int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  v_mode := lower(btrim(coalesce(p_mode, '')));
  if v_mode not in ('pvp', 'pve') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;

  v_level := least(greatest(coalesce(p_level, v_board.ai_level), 1), 7);
  v_facs  := v_board.factions;
  v_count := v_board.team_count;

  if v_mode = 'pve' then
    -- Slot 0 ist die Klasse, Slot 1 der Computer. Das zweite Volk ist
    -- hier nur ein Platzhalter, damit die Längenprüfung der Spalte
    -- (2..8, siehe 0097) erfüllt ist; gezogen wird es beim Start.
    v_class := coalesce(p_faction, (v_board.factions->>0)::int, 0);
    if v_class < 0 or v_class > 7 then
      return jsonb_build_object('ok', false, 'error', 'invalid_factions');
    end if;

    select f into v_ai
      from generate_series(0, 7) f
     where f <> v_class
     order by random()
     limit 1;

    -- Bewusst NICHT durch clash_normalize_factions: die sortiert
    -- aufsteigend, und dann läge das Volk der Klasse mal auf Slot 0 und
    -- mal auf Slot 1. Im PvE ist die Reihenfolge eine Bedeutung, keine
    -- Darstellung.
    v_facs  := jsonb_build_array(v_class, v_ai);
    v_count := 2;
  end if;

  update clash_boards
     set mode       = v_mode,
         ai_level   = v_level,
         ai_stage   = 1,
         ai_slot    = case when v_mode = 'pve' then 1 else null end,
         factions   = v_facs,
         team_count = v_count
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true, 'mode', v_mode, 'ai_level', v_level,
                            'factions', v_facs, 'team_count', v_count);
end;
$$;

revoke all on function clash_room_set_mode(text, text, int, int) from public;
grant execute on function clash_room_set_mode(text, text, int, int) to authenticated;

comment on function clash_room_set_mode(text, text, int, int) is
  'Lobby-Bedienung für den PvE-Modus (0126): Modus (pvp/pve), Stufe 1–7 und das Volk der Klasse. '
  'Im PvE werden factions auf [Klassen-Volk, Platzhalter] und team_count auf 2 gesetzt; das Volk '
  'des Computers zieht clash_room_start für jede Runde neu. Nur in phase=lobby, nur Raum-Besitzer.';


-- ─────────────────────────────────────────────────────────────
-- 13) clash_preview_teams — im PvE gibt es nur ein Volk
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0113, Wort für Wort. Neu ist ausschließlich das CASE um
-- den Modulo: im PvE gehören alle Anwesenden zu Slot 0. Die Fensterung
-- bleibt trotzdem stehen — sie ist im PvP die Verteilung und kostet im
-- PvE nichts.
create or replace function clash_preview_teams(p_room uuid)
  returns table(participant_id uuid, team_index int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p.id,
         case when b.mode = 'pve' then 0
              else ((dense_rank() over (
                      order by
                        case when b.shuffle_seed is null then p.seat end,
                        case when b.shuffle_seed is not null
                             then md5(p.id::text || b.shuffle_seed::text) end
                    ))::int - 1) % b.team_count
         end
    from skill_participants p
    join clash_boards b on b.room_id = p.room_id
   where p.room_id = p_room
     and p.last_seen_at > now() - interval '90 seconds'
     and not p.blocked;
$$;

revoke all on function clash_preview_teams(uuid) from public;

comment on function clash_preview_teams(uuid) is
  'Team-Index je ANWESENDEM Teilnehmer (last_seen_at < 90s wie 0079, und nicht blocked) nach '
  'Sitzplatz- oder Schuffel-Reihenfolge (0104/0113). Seit 0126: im PvE-Modus gehören alle zu '
  'Slot 0 — der Computer hat keine Teilnehmer. Vor dem Start eine reine Vorschau, beim Start die '
  'Quelle für die endgültige clash_players-Zuordnung.';


-- ─────────────────────────────────────────────────────────────
-- 14) clash_tiles_json — die Rüstungstreffer mitliefern
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0100. `dmg` heißt bewusst nicht `armor_hits`: der Client
-- zeichnet daraus einen Riss und muss nicht wissen, woher der kommt.
create or replace function clash_tiles_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle,
           'hp', case when is_castle then castle_hp else null end,
           'dmg', coalesce(armor_hits, 0)
         )), '[]'::jsonb)
    from clash_tiles where room_id = p_room;
$$;

comment on function clash_tiles_json(uuid) is
  'Das Spielfeld als JSON. Seit 0100 mit Burg-Leben (hp), seit 0126 mit dmg = Zahl der '
  'Rüstungstreffer (0 = unversehrt) für den Riss auf der Kachel.';


-- ─────────────────────────────────────────────────────────────
-- 15) clash_capture_apply — Rüstung fällt mit dem Besitzer
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0106, eine Zuweisung mehr. Ein erobertes Feld startet
-- unversehrt — sonst behielte die Klasse die Vorarbeit des Computers,
-- wenn sie ein Feld zurückholt, und umgekehrt.
create or replace function clash_capture_apply(p_room uuid, p_team int, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_tprev  int;
  v_castle boolean;
  v_hp     int;
begin
  select owner_team, is_castle, castle_hp
    into v_tprev, v_castle, v_hp
    from clash_tiles
   where room_id = p_room and r = p_r and c = p_c
     for update;

  if v_tprev is null then
    return jsonb_build_object('captured', null, 'castle_hit', null);
  end if;

  if v_castle and coalesce(v_hp, 3) > 1 then
    update clash_tiles
       set castle_hp = castle_hp - 1, updated_at = now()
     where room_id = p_room and r = p_r and c = p_c;
    return jsonb_build_object('captured', null,
      'castle_hit', jsonb_build_object('r', p_r, 'c', p_c, 'hp', coalesce(v_hp, 3) - 1, 'owner', v_tprev));
  end if;

  update clash_tiles
     set owner_team = p_team, castle_hp = 3, armor_hits = 0, updated_at = now()
   where room_id = p_room and r = p_r and c = p_c;

  return jsonb_build_object(
    'captured', jsonb_build_object('r', p_r, 'c', p_c, 'prev_owner', v_tprev, 'castle', v_castle, 'hp', 3),
    'castle_hit', null);
end;
$$;

revoke all on function clash_capture_apply(uuid, int, int, int) from public;

comment on function clash_capture_apply(uuid, int, int, int) is
  'Wendet eine Eroberung auf ein bereits geprüftes Feld an (0106): Burgen verlieren erst ein '
  'Leben, alle anderen Felder wechseln sofort den Besitzer. Seit 0126 setzt der Besitzerwechsel '
  'armor_hits zurück — die Rüstung gehört zum Besitzer, nicht zum Feld.';


-- ─────────────────────────────────────────────────────────────
-- 16) clash_fire_teams — im PvE ist der Schild aus
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0125. Der „on fire"-Schild schützt das führende Volk vor
-- der Eroberungs-Auslosung — bei zwei Völkern, von denen eines der
-- Computer ist, wäre er entweder wirkungslos (die Klasse schützt sich
-- vor sich selbst) oder absurd (der Computer wird unangreifbar).
--
-- Das leere Array genügt als Abschaltung: clash_capture_random findet
-- damit nichts zu übergehen, und im Client ist isProtected() überall
-- falsch, ohne dass dort ein einziger Sonderfall nötig wäre.
create or replace function clash_fire_teams(p_room uuid)
  returns int[]
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case
    when (select mode from clash_boards where room_id = p_room) = 'pve'
      then '{}'::int[]
    else coalesce((
      with lebend as (
        select ts.team_index, ts.streak
          from clash_team_streaks ts
         where ts.room_id = p_room
           and ts.team_index >= 0
           and exists (select 1 from clash_tiles t
                        where t.room_id = p_room and t.owner_team = ts.team_index)
      ),
      spitze as (select max(streak) as m from lebend)
      select array_agg(l.team_index order by l.team_index)
        from lebend l, spitze s
       where s.m >= greatest((clash_streak_goals()->>'fire_min')::int, 1)
         and l.streak = s.m
    ), '{}'::int[])
  end;
$$;

comment on function clash_fire_teams(uuid) is
  'Die geschützten Völker (0125): alle noch lebenden Völker mit der höchsten laufenden '
  'Team-Serie, sofern diese mindestens fire_min beträgt. Seit 0126 im PvE immer leer — der Schild '
  'ist dort aus, und das leere Array schaltet ihn serverseitig wie clientseitig ab, ohne einen '
  'zweiten Codepfad.';

grant execute on function clash_fire_teams(uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 17) clash_sig_of — Ramp und Rüstung in die Signatur
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0109, drei Zeilen mehr.
--
-- Der wichtige Teil ist sum(armor_hits): ein reiner Rüstungstreffer
-- ändert zwar clash_tiles.updated_at — aber nur dieser eine Zähler, und
-- die Signatur nimmt bereits max(updated_at), das dabei ohnehin
-- weiterläuft. Verlassen möchte man sich darauf nicht: fällt die
-- Zeitauflösung mal ungünstig oder wird updated_at später einmal anders
-- gesetzt, bliebe der Riss auf dem Tablet unsichtbar. Die Summe ist
-- billig und macht die Sache eindeutig.
create or replace function clash_sig_of(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select concat_ws('.',
    (select phase from clash_boards where room_id = p_room),
    (select team_count from clash_boards where room_id = p_room),
    (select factions::text from clash_boards where room_id = p_room),
    (select pool::text from clash_boards where room_id = p_room),
    (select coalesce(winner_team, -1) from clash_boards where room_id = p_room),
    (select count(*) from clash_tiles where room_id = p_room),
    (select coalesce(extract(epoch from max(updated_at))::bigint, 0)
       from clash_tiles where room_id = p_room),
    (select count(*) from skill_participants where room_id = p_room),
    (select count(*) from clash_preview_teams(p_room)),
    (select coalesce(shuffle_seed::text, '') from clash_boards where room_id = p_room),
    (select coalesce(extract(epoch from match_ends_at)::bigint, 0)
       from clash_boards where room_id = p_room),
    (select coalesce(sum(pl.correct_count), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    -- 0106: Team-Serien-Vektor, Summe offener Picks, jüngstes Team-Ereignis.
    (select coalesce(string_agg(team_index::text || ':' || streak::text, ',' order by team_index), '')
       from clash_team_streaks where room_id = p_room),
    (select coalesce(sum(pl.pending_picks), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    (select coalesce(max(id), 0) from clash_team_events where room_id = p_room),
    -- 0108: Ruinen-Punkte aller Völker.
    (select coalesce(sum(ruin_points), 0) from clash_team_streaks where room_id = p_room),
    -- 0126: Modus, eingestellte Stufe, Ramp-Stufe, Rüstungstreffer, Bot-Zahl.
    (select mode || ':' || ai_level::text || ':' || ai_stage::text
       from clash_boards where room_id = p_room),
    (select coalesce(sum(armor_hits), 0) from clash_tiles where room_id = p_room),
    (select count(*) from clash_ai_bots where room_id = p_room)
  );
$$;

comment on function clash_sig_of(uuid) is
  'Billige Signatur des Raumzustands für den 8-Sekunden-Takt. Seit 0126 mit mode/ai_level/'
  'ai_stage, der Summe der Rüstungstreffer und der Bot-Zahl — ohne die käme ein Rüstungstreffer '
  'oder ein Stufenaufstieg nicht zuverlässig auf den Tablets an.';


-- ─────────────────────────────────────────────────────────────
-- 18) clash_room_start — im PvE wird das Feld erzeugt
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0118, Wort für Wort. Neu ist der PvE-Zweig:
--   • Geometrie aus clash_pve_layout statt aus clash_layouts,
--   • alle Regionen ≥ 1 landen als owner_team = 1 (ein Gegner, mehrere
--     Burgen),
--   • team_count = 2, factions = [Klasse, frisch gezogenes Volk],
--   • der Bot-Zustand wird geleert und der Takt eingefroren.
create or replace function clash_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_room    skill_rooms;
  v_board   clash_boards;
  v_layout  clash_layouts;
  v_count   int;
  v_pool    jsonb;
  v_pve     jsonb := null;        -- 0126: erzeugte Geometrie
  v_players int;
  v_class   int;
  v_ai      int;
  v_rows    int;
  v_cols    int;
  v_ntiles  int;
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

  -- 0110/0118: Ohne ziehbare Aufgabenart gibt es kein Spiel.
  v_pool := clash_normalize_pool(v_board.pool);
  if v_pool is null or not clash_pool_has_task(v_pool) then
    return jsonb_build_object('ok', false, 'error', 'pool_empty');
  end if;

  if v_board.mode = 'pve' then
    -- Das Volk der Klasse steht seit clash_room_set_mode auf Slot 0.
    -- Das des Computers wird JEDE Runde neu gezogen — auf dem Feld ist
    -- er ohnehin schwarzgrau, aber die Silhouette wechselt.
    v_class := coalesce((v_board.factions->>0)::int, 0);
    select f into v_ai
      from generate_series(0, 7) f
     where f <> v_class
     order by random()
     limit 1;

    -- Gezählt wird, wer beim Start da ist — dieselbe Menge, die gleich
    -- ihre clash_players-Zeile bekommt.
    select count(*)::int into v_players from clash_preview_teams(v_room.id);

    v_pve   := clash_pve_layout(clash_pve_tiles(v_players), v_board.ai_level);
    v_rows  := (v_pve->>'rows')::int;
    v_cols  := (v_pve->>'cols')::int;
    v_ntiles := jsonb_array_length(v_pve->'tiles');
    v_count := 2;

    -- Muss VOR clash_preview_teams greifen (siehe 0118) — hier zählt
    -- allerdings nur, dass mode/team_count schon stimmen.
    update clash_boards
       set team_count = 2,
           factions   = jsonb_build_array(v_class, v_ai)
     where room_id = v_room.id;
  else
    v_count := jsonb_array_length(v_board.factions);

    select * into v_layout from clash_layouts where team_count = v_count;
    if v_layout.team_count is null then
      return jsonb_build_object('ok', false, 'error', 'layout_missing');
    end if;

    v_rows   := v_layout.rows;
    v_cols   := v_layout.cols;
    v_ntiles := jsonb_array_length(v_layout.tiles);

    update clash_boards set team_count = v_count where room_id = v_room.id;
  end if;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );
  delete from clash_team_streaks where room_id = v_room.id;   -- 0106
  delete from clash_team_events  where room_id = v_room.id;   -- 0108
  delete from clash_ai_bots      where room_id = v_room.id;   -- 0126

  if v_board.mode = 'pve' then
    -- Slot 0 bleibt die Klasse, alles darüber wird EIN Gegner. Die
    -- Burgen kommen direkt aus dem Generator mit (je Region eine).
    insert into clash_tiles (room_id, r, c, owner_team, is_castle)
    select v_room.id, (t->>'r')::int, (t->>'c')::int,
           case when (t->>'slot')::int = 0 then 0 else 1 end,
           coalesce((t->>'castle')::boolean, false)
      from jsonb_array_elements(v_pve->'tiles') t;
  else
    insert into clash_tiles (room_id, r, c, owner_team, is_castle)
    select v_room.id, (t->>'r')::int, (t->>'c')::int, (t->>'slot')::int, false
      from jsonb_array_elements(v_layout.tiles) t;

    update clash_tiles ct
       set is_castle = true
      from jsonb_array_elements(v_layout.castles) cst
     where ct.room_id = v_room.id
       and ct.r = (cst->>'r')::int
       and ct.c = (cst->>'c')::int;
  end if;

  -- clash_preview_teams liest hier NUR die online Teilnehmer (0094) und
  -- liefert im PvE für alle die 0 (0126).
  insert into clash_players (participant_id, team_index, current_q)
  select pt.participant_id, pt.team_index, clash_new_question(v_pool)
    from clash_preview_teams(v_room.id) pt;

  -- 0106: geteilte Team-Serie startet bei 0 für jedes Volk. Im PvE sind
  -- das zwei Zeilen; die des Computers bleibt bei 0 stehen (er hat
  -- keine Team-Serie, und der Schild ist dort aus).
  insert into clash_team_streaks (room_id, team_index, streak)
  select v_room.id, gs.team_index, 0
    from generate_series(0, v_count - 1) as gs(team_index);

  update clash_boards
     set phase             = 'countdown',
         started_at        = now(),
         countdown_ends_at = now() + interval '5 seconds',
         match_ends_at     = null,
         grid_rows         = v_rows,
         grid_cols         = v_cols,
         initial_tiles     = v_ntiles,                          -- 0108
         winner_team       = null,
         ended_at          = null,
         -- 0126: Die Ramp beginnt IMMER bei 1, egal wie hoch die Stufe
         -- eingestellt ist. Der Takt wird jetzt eingefroren, weil der
         -- Pool ab hier fest ist.
         ai_stage          = 1,
         ai_slot           = case when v_board.mode = 'pve' then 1 else null end,
         ai_pace_secs      = case when v_board.mode = 'pve' then clash_ai_pace(v_pool) else null end,
         ai_ticked_at      = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function clash_room_start(text) is
  'Startet die Runde: Board, Teams nach Sitzplatz, je Kind eine erste Aufgabe aus dem Pool. Im '
  'PvP kommt die Geometrie aus clash_layouts, im PvE (0126) aus clash_pve_layout — dort ist Slot 0 '
  'die Klasse, alle übrigen Regionen werden zu owner_team 1 verschmolzen, das Volk des Computers '
  'wird für jede Runde neu gezogen und der Bot-Takt aus dem Pool eingefroren.';


-- ─────────────────────────────────────────────────────────────
-- 19) clash_room_reset — auch die Bots zurück auf null
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0108. Modus und Stufe bleiben ausdrücklich stehen: das
-- Zurücksetzen führt in die Lobby, und die Lehrkraft will dieselbe
-- Partie in der Regel noch einmal spielen, nicht neu einstellen.
create or replace function clash_room_reset(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );
  delete from clash_team_streaks where room_id = v_room.id;   -- 0106
  delete from clash_team_events  where room_id = v_room.id;   -- 0108
  delete from clash_ai_bots      where room_id = v_room.id;   -- 0126

  update clash_boards
     set phase = 'lobby', started_at = null, countdown_ends_at = null,
         ended_at = null, winner_team = null, match_ends_at = null,
         initial_tiles = null,                                 -- 0108
         ai_stage = 1, ai_pace_secs = null, ai_ticked_at = null -- 0126
   where room_id = v_room.id;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

comment on function clash_room_reset(text) is
  'Setzt die Runde in die Lobby zurück (0108). Seit 0126 werden auch die Bots und die Ramp '
  'geleert; Modus, Stufe und Volkswahl bleiben stehen — zurückgesetzt wird die Partie, nicht die '
  'Einstellung.';


-- ─────────────────────────────────────────────────────────────
-- 20) clash_submit — den Takt anstoßen, den Stand mitschicken
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0125, Wort für Wort. Geändert sind zwei Stellen: der Takt
-- des Computers läuft am Ende mit, und der Rückgabewert trägt einen
-- ai-Block.
--
-- Warum der Takt NACH der eigenen Eroberung steht: die Antwort des
-- Kindes soll das Feld sehen, das sie vorgefunden hat. Liefe der
-- Computer vorher, könnte eine richtige Antwort auf ein Feld treffen,
-- das der Server im selben Aufruf gerade weggenommen hat — für das Kind
-- sähe das aus, als hätte seine Antwort nichts bewirkt.
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
  v_goals           jsonb := clash_streak_goals();          -- 0123
  v_goal_solo       int;                                    -- 0123
  v_solo_reward     int;                                    -- 0125
  v_streak_old      int;
  v_solo_fire       boolean := false;
  v_pending_add     int := 0;
  v_team_streak_old int;
  v_team_streak_new int;
  v_team_streak_out int;
  v_fire            int[] := '{}'::int[];                   -- 0125
  v_ruin_add        int := 0;
  v_ruin_old        int;
  v_ruin_new        int := null;
  v_shrunk          jsonb := '[]'::jsonb;
  v_shr             jsonb;
  v_steps           int;
  v_reveal          text := null;       -- 0110: die Lösung der GESCHEITERTEN Aufgabe
  v_new_q           jsonb := null;
  i                 int;
  v_lock            jsonb := clash_answer_lock();            -- 0124
  v_fast_ms         int;                                     -- 0124
  v_free            int;                                     -- 0124
  v_cap_s           int;                                     -- 0124
  v_is_choice       boolean := false;    -- 0124: Auswahlaufgabe ⇒ nur ein Versuch
  v_fast            boolean := false;    -- 0124: Antwort kam ohne Hinsehen
  v_fw              int := 0;            -- 0124: neuer Stand von fast_wrong
  v_lock_s          int := 0;            -- 0124: Sperre für die nächste Eingabe
  v_lock_ms         int := 0;            -- 0124: dasselbe in ms, für den Client
  v_wait_ms         int;                 -- 0124: Restsperre bei einem zu frühen Tipp
  v_ai              jsonb := null;       -- 0126: Stand des Computer-Gegners
begin
  v_goal_solo   := greatest((v_goals->>'solo')::int, 1);
  v_solo_reward := greatest((v_goals->>'solo_reward')::int, 1);   -- 0125
  v_fast_ms     := greatest((v_lock->>'fast_ms')::int, 0);     -- 0124
  v_free        := greatest((v_lock->>'free')::int, 0);        -- 0124
  v_cap_s       := greatest((v_lock->>'cap_s')::int, 0);       -- 0124

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

  -- 0124: Die Sperre. Steht bewusst VOR jedem Zustandswechsel — ein
  -- Tipp während der Sperre ist kein Fehlversuch, sondern gar keine
  -- Antwort. Zählte er, würde ungeduldiges Tippen die Sperre selbst
  -- verlängern, und das Kind käme nie wieder heraus.
  if v_player.locked_until is not null and v_player.locked_until > now() then
    v_wait_ms := ceil(extract(epoch from (v_player.locked_until - now())) * 1000)::int;
    return jsonb_build_object('ok', false, 'error', 'locked', 'wait_ms', greatest(v_wait_ms, 0));
  end if;

  -- Fällige Auto-Picks (0106) zuerst auflösen — sonst könnte diese
  -- Antwort auf einem Kartenbild landen, das der Server selbst gleich
  -- noch ändert.
  perform clash_expire_pending_picks(v_p.id);
  select * into v_player from clash_players where participant_id = v_p.id;

  -- 0108: KEIN Abbruch. Ein Volk ohne Kachel spielt weiter, seine
  -- Antworten zählen für die Endwertung und lassen das Spielfeld
  -- schrumpfen.
  v_ruined := not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  );

  -- Randfall: keine laufende Frage — dann erst eine ziehen, ohne die
  -- abgegebene Antwort zu werten.
  if v_player.current_q is null then
    v_new_q := clash_new_question(v_board.pool);
    update clash_players set current_q = v_new_q, wrong_attempt = false, q_shown_at = now()
     where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'correct', null,
      'question', clash_q_public(v_new_q));
  end if;

  v_correct := clash_answer_matches(v_player.current_q, p_answer);

  -- 0124: Auswahlaufgabe? Geprüft wird `mode`, nicht `input`.
  v_is_choice := v_player.current_q->>'mode' = 'mc';

  -- 0124: „schnell" heißt: weniger als FAST_MS nach dem Ziehen der
  -- Aufgabe. NULL gilt ausdrücklich als langsam — im Zweifel für das Kind.
  v_fast := v_player.q_shown_at is not null
            and now() < v_player.q_shown_at + make_interval(secs => v_fast_ms / 1000.0);

  if v_correct then
    v_advance := true;

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

    -- Individuelle Serie: jedes Vielfache von v_goal_solo (0125: 4).
    v_streak_old := coalesce(v_player.streak, 0);
    if floor((v_streak_old + 1)::numeric / v_goal_solo) > floor(v_streak_old::numeric / v_goal_solo) then
      v_solo_fire := true;
      if v_ruined then
        v_ruin_add := v_ruin_add + v_solo_reward;
      else
        v_pending_add := v_solo_reward;
      end if;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1, wrong_attempt = false,
           pending_picks = pending_picks + v_pending_add,
           pick_deadline = case when v_pending_add > 0 then now() + interval '6 seconds'
                                 else pick_deadline end
     where participant_id = v_p.id;

    if v_solo_fire then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'individual_fire',
        jsonb_build_object('name', skill_seat_name(v_p.name, v_p.seat), 'streak', v_streak_old + 1));
    end if;

    -- Geteilte Team-Serie (0106). Seit 0125 zahlt sie nichts mehr aus;
    -- ihr Zweck ist der Vergleich mit den anderen Völkern.
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

    -- 0108: Ruinen-Punkte. Die Schwelle wird EINMAL geprüft.
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

  elsif not coalesce(v_player.wrong_attempt, false) and not v_is_choice then
    -- Erster Fehlversuch zu dieser Aufgabe: nur „nochmal versuchen".
    -- 0124: nur noch bei TIPP-Aufgaben.
    v_retry := true;
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = true
     where participant_id = v_p.id;
    update clash_team_streaks set streak = 0
     where room_id = v_room.id and team_index = v_player.team_index;
    select streak into v_team_streak_out
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index;

  else
    -- Zweiter Fehlversuch in Folge: jetzt wird aufgelöst.
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

  -- 0125: Die Flamme kann bei JEDEM Ausgang wandern. Im PvE gibt
  -- clash_fire_teams ein leeres Array zurück, der Abgleich läuft dann
  -- ins Leere statt in einen Sonderfall.
  v_fire := clash_refresh_fire(v_room.id);

  -- ── 0124: Zähler und Sperre ──────────────────────────────────
  if not v_fast then
    v_fw := 0;
  elsif v_correct then
    v_fw := coalesce(v_player.fast_wrong, 0);
  else
    v_fw := coalesce(v_player.fast_wrong, 0) + 1;
  end if;

  v_lock_s := least(greatest(v_fw - v_free, 0), v_cap_s);
  if v_correct then
    v_lock_s := 0;   -- eine richtige Antwort hält niemanden auf
  end if;
  v_lock_ms := v_lock_s * 1000;

  update clash_players
     set fast_wrong   = v_fw,
         locked_until = case when v_lock_s > 0 then now() + make_interval(secs => v_lock_s)
                             else null end
   where participant_id = v_p.id;

  if v_advance then
    v_new_q := clash_new_question(v_board.pool);
    update clash_players
       set current_q  = v_new_q,
           q_shown_at = now() + make_interval(secs => v_lock_s)
     where participant_id = v_p.id;
  end if;

  if v_taken then
    perform clash_check_win(v_room.id);
  end if;

  -- 0126: Jetzt ist der Computer dran. Steht bewusst hinter der
  -- Sieg-Prüfung: eine Partie, die diese Antwort gewonnen hat, ist
  -- vorbei, und clash_ai_tick steigt bei phase <> 'running' aus.
  if v_board.mode = 'pve' then
    perform clash_ai_tick(v_room.id);
    select jsonb_build_object(
             'level', b.ai_level,
             'stage', b.ai_stage,
             'armor', clash_ai_armor(v_room.id),
             'bots',  (select count(*) from clash_ai_bots where room_id = v_room.id))
      into v_ai
      from clash_boards b where b.room_id = v_room.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'retry', v_retry,
    'lock_ms', v_lock_ms,
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
    'streak_goals', v_goals,
    'fire_teams', to_jsonb(v_fire),
    -- 0126: Modus und KI-Stand mit jeder Antwort, aus demselben Grund
    -- wie streak_goals: die eigene Antwort kann gerade die zweite Burg
    -- geholt und damit Rüstung und Gegnerstufe verändert haben — das
    -- muss sofort am eigenen Kopf stehen, nicht acht Sekunden später.
    'mode', v_board.mode,
    'ai_slot', v_board.ai_slot,
    'ai', v_ai,
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
  'Nimmt eine Antwort entgegen, wertet sie und erobert bei Erfolg ein Feld (0101/0124/0125). Seit '
  '0126 stößt sie am Ende den Takt des Computer-Gegners an (clash_ai_tick, nur im PvE) und liefert '
  'mode/ai_slot/ai mit — Stufe, Rüstung und Bot-Zahl stehen damit sofort auf dem eigenen Tablet.';


-- ─────────────────────────────────────────────────────────────
-- 21) clash_view — Modus, KI-Stand, Takt
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0125, Wort für Wort. Neu: clash_ai_tick vor dem Lesen (der
-- Poll der Tablets ist der Herzschlag des Gegners) und drei Schlüssel
-- im Rückgabewert.
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
  v_lock_ms      int := 0;                -- 0124: Restsperre in ms
  v_fire         int[] := '{}'::int[];    -- 0125: die geschützten Völker
  v_fire_streak  int := 0;                -- 0125: ihre Serie
  v_ai           jsonb := null;           -- 0126: Stand des Computer-Gegners
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

  -- 0126: Der Takt des Computers. Steht VOR dem Lesen des Boards, damit
  -- diese Ansicht den Stand zeigt, den sie selbst gerade erzeugt hat —
  -- sonst hinkte jedes Tablet dem Gegner um einen Poll hinterher.
  perform clash_ai_tick(v_room.id);

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
      -- 0108: die Aufgabe hängt NICHT an v_alive.
      if v_my_team is not null then
        v_question := clash_q_public(v_player.current_q);
        if v_player.locked_until is not null and v_player.locked_until > now() then
          v_lock_ms := greatest(
            ceil(extract(epoch from (v_player.locked_until - now())) * 1000)::int, 0);
        end if;
      end if;
    end if;
  end if;

  -- 0125: Wer ist geschützt? Im PvE ist die Liste immer leer.
  if v_board.phase = 'running' then
    v_fire := clash_fire_teams(v_room.id);
    if array_length(v_fire, 1) is not null then
      select coalesce(max(streak), 0) into v_fire_streak
        from clash_team_streaks
       where room_id = v_room.id and team_index = any(v_fire);
    end if;
  end if;

  -- Die eigene Gruppe, sortiert nach Sitzplatz.
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
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_players pl
        join skill_participants p on p.id = pl.participant_id
       where p.room_id = v_room.id and pl.team_index = v_my_team;

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

  -- 0126: Stufe, Rüstung und Bot-Zahl. Auch in der Lobby gefüllt, damit
  -- die Stufenwahl der Lehrkraft auf den Tablets ankommt, bevor es
  -- losgeht.
  if v_board.mode = 'pve' then
    v_ai := jsonb_build_object(
      'level', v_board.ai_level,
      'stage', v_board.ai_stage,
      'armor', clash_ai_armor(v_room.id),
      'bots',  (select count(*) from clash_ai_bots where room_id = v_room.id));
  end if;

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
    'streak_goals', clash_streak_goals(),   -- 0123
    'fire_teams', to_jsonb(v_fire),         -- 0125
    'fire_streak', v_fire_streak,           -- 0125
    'mode', v_board.mode,                   -- 0126
    'ai_slot', v_board.ai_slot,             -- 0126
    'ai', v_ai,                             -- 0126
    'ai_levels', clash_ai_levels(),         -- 0126
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
      'pick_deadline', v_player.pick_deadline,
      'lock_ms', v_lock_ms   -- 0124
    )
  );
end;
$$;

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;

comment on function clash_view(text) is
  'Teilnehmer-Ansicht von Kingdoms of Mathoria (0098–0125). Seit 0126: stößt clash_ai_tick an — '
  'der 8-Sekunden-Poll der Tablets IST der Herzschlag des Computer-Gegners — und liefert '
  'mode/ai_slot/ai/ai_levels für Graufilter, Rüstungsanzeige und Stufentext.';


-- ─────────────────────────────────────────────────────────────
-- 22) clash_room_get — Bots als Mannschaft des Gegners
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0125, Wort für Wort. Neu: der Takt, der ai-Block und die
-- Bot-Namen.
--
-- Die Namen kommen im SELBEN Feld wie die Kindernamen (team_members).
-- Damit braucht der Beamer-Client keinen zweiten Zweig: das Panel des
-- Gegners rendert seine Mannschaft wie jedes andere, sie heißt nur
-- „Bot 1 … Bot N" und ist grau.
create or replace function clash_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_teams jsonb;
  v_tiles jsonb;
  v_status jsonb;
  v_correct jsonb;
  v_members jsonb;
  v_offline jsonb;
  v_events jsonb := '[]'::jsonb;
  v_ruin   jsonb := '{}'::jsonb;
  v_streaks jsonb := '{}'::jsonb;         -- 0125
  v_fire   int[] := '{}'::int[];          -- 0125
  v_ai     jsonb := null;                 -- 0126
  v_bots   jsonb := '[]'::jsonb;          -- 0126
  v_names  jsonb := '[]'::jsonb;          -- 0126
  v_online_count int;
  v_room_total   int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  perform clash_ai_tick(v_room.id);                       -- 0126
  select * into v_board from clash_boards where room_id = v_room.id;
  perform skill_touch(v_room.id);

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  -- Namen je Team. Sortiert nach Sitzplatz.
  if v_board.phase = 'lobby' then
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select t.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_preview_teams(v_room.id) t
          join skill_participants p on p.id = t.participant_id
         group by t.team_index
      ) x;
  else
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select pl.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_players pl
          join skill_participants p on p.id = pl.participant_id
         where p.room_id = v_room.id
         group by pl.team_index
      ) x;
  end if;

  -- Wer im Raum ist, aber in keinem Team steht.
  select coalesce(jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat), '[]'::jsonb)
    into v_offline
    from skill_participants p
   where p.room_id = v_room.id
     and p.id not in (select participant_id from clash_preview_teams(v_room.id));

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  v_tiles := clash_tiles_json(v_room.id);

  select coalesce(jsonb_object_agg(owner_team, cnt), '{}'::jsonb)
    into v_status
    from (
      select owner_team, count(*) as cnt
        from clash_tiles where room_id = v_room.id
       group by owner_team
    ) t;

  v_correct := clash_team_correct(v_room.id);

  -- 0107: die jüngsten Serien-Ereignisse aller Völker.
  select coalesce(jsonb_agg(
           jsonb_build_object('id', e.id, 'team', e.team_index,
                              'kind', e.kind, 'payload', e.payload)
           order by e.id), '[]'::jsonb)
    into v_events
    from (
      select id, team_index, kind, payload
        from clash_team_events
       where room_id = v_room.id
       order by id desc
       limit 40
    ) e;

  -- 0108: Ruinen-Stand je Volk.
  select coalesce(jsonb_object_agg(team_index,
           jsonb_build_object('points', ruin_points, 'to_next', 10 - (ruin_points % 10))),
         '{}'::jsonb)
    into v_ruin
    from clash_team_streaks
   where room_id = v_room.id and ruin_points > 0;

  -- 0125: laufende Team-Serie je Volk.
  select coalesce(jsonb_object_agg(team_index, streak), '{}'::jsonb)
    into v_streaks
    from clash_team_streaks
   where room_id = v_room.id and team_index >= 0;

  if v_board.phase = 'running' then
    v_fire := clash_fire_teams(v_room.id);
  end if;

  -- 0126: der Gegner. Die Namensliste geht in team_members[ai_slot] —
  -- dasselbe Feld, dieselbe Darstellung, nur andere Namen.
  if v_board.mode = 'pve' then
    select coalesce(jsonb_agg('Bot ' || bot_no order by bot_no), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('no', bot_no, 'streak', streak,
                                                 'correct', correct_count)
                              order by bot_no), '[]'::jsonb)
      into v_names, v_bots
      from clash_ai_bots where room_id = v_room.id;

    v_ai := jsonb_build_object(
      'level', v_board.ai_level,
      'stage', v_board.ai_stage,
      'armor', clash_ai_armor(v_room.id),
      'bots',  jsonb_array_length(v_bots));

    if jsonb_array_length(v_names) > 0 then
      v_members := coalesce(v_members, '{}'::jsonb)
                   || jsonb_build_object(coalesce(v_board.ai_slot, 1)::text, v_names);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'pool', v_board.pool,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_members', v_members,
    'offline_members', v_offline,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'team_tile_counts', v_status,
    'team_correct_counts', v_correct,
    'team_events', v_events,
    'ruin', v_ruin,
    'team_streaks', v_streaks,              -- 0125
    'fire_teams', to_jsonb(v_fire),         -- 0125
    'streak_goals', clash_streak_goals(),   -- 0125 (für den Countdown-Text)
    'mode', v_board.mode,                   -- 0126
    'ai_slot', v_board.ai_slot,             -- 0126
    'ai', v_ai,                             -- 0126
    'ai_bots', v_bots,                      -- 0126
    'ai_levels', clash_ai_levels(),         -- 0126 (für die Stufenwahl)
    'board', clash_shrink_state(v_room.id)
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-/Lehrkraft-Ansicht von Kingdoms of Mathoria (0096–0125). Seit 0126: stößt clash_ai_tick '
  'an, liefert mode/ai_slot/ai/ai_bots/ai_levels und trägt die Bot-Namen als team_members des '
  'Gegner-Slots ein — der Beamer rendert die Mannschaft des Computers damit ohne eigenen Zweig.';
