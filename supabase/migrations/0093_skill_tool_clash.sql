-- ══════════════════════════════════════════════════════════════
-- Migration 0093 — Clash of Math: vierter Skill, erstes Team-Spiel
-- ══════════════════════════════════════════════════════════════
-- Ein Team-gegen-Team-Territoriumsspiel auf einer sechseckigen Karte:
-- jedes Team startet mit einer Burg + 10 zusammenhängenden Feldern,
-- Additionsaufgaben bis 100 erobern ein zufälliges Nachbarfeld eines
-- anderen Teams, ein Team verliert bei 0 Feldern.
--
-- Grundgerüst-Umfang (siehe Plan „Clash of Math — Grundgerüst"):
-- Team-Zuordnung, Board-Erzeugung, Start-Countdown, einfache
-- Addition, Eroberung, Elimination, Sieg. Fraktionsgrafiken,
-- Burg-Leben, weitere Aufgabentypen, Streak-Fähigkeiten, Zeitlimit
-- und der Umgang mit ausgeschiedenen Teams sind bewusst NICHT Teil
-- dieser Migration — die kommen einzeln in der Feature-Runde.
--
-- ── Warum eigene Tabellen statt der generischen Inhaltsschicht ──
-- skill_room_state/_entries/_votes (0080/0086/0087) sind ein
-- Beitrag/Zustimmungs-Modell für Post-it-artige Werkzeuge. Ein
-- Team-Territorium mit Fragen, Streaks und Elimination passt
-- strukturell nicht hinein — dieselbe Überlegung wie bei Reality
-- Check (eigene board_*-Tabellen statt einer Erweiterung der
-- Wortwolken-Schicht). `limits` bleibt leer.
--
-- ── Das Sicherheitsmodell gilt unverändert (0079) ──────────────
-- Anon fasst keine Tabelle direkt an; alles läuft über benannte
-- security-definer-Funktionen, die zuerst den Token bzw. Code
-- auflösen. Interne Helfer (clash_ensure_board, clash_ensure_player,
-- clash_preview_teams, clash_new_question, clash_maybe_advance_phase,
-- clash_sig_of, clash_is_neighbor) bekommen keinen Grant an anon/
-- authenticated — sie laufen aus den öffentlichen Funktionen dieser
-- Datei heraus unter deren security-definer-Kontext, genau wie
-- skill_touch/skill_room_json/skill_people_json in 0079.
--
-- ── Die Geometrie ist NICHT zur Laufzeit gerechnet ─────────────
-- Ein Board für team_count 2..8 sieht für dieselbe Zahl immer
-- gleich aus (deterministischer Algorithmus, keine Laufzeit-
-- Zufälligkeit in der Form). Statt Trigonometrie/Point-in-Polygon
-- in Postgres oder im Client neu zu rechnen, sind die 7 Layouts
-- EINMALIG offline erzeugt (Node-Skript, das die Hex-Geometrie aus
-- dem Prototyp — MPSkills/tools/chalsh of Math/clash of Math
-- prototyp.html — übernimmt, aber statt „Burg + BFS auf 10 Felder
-- mit neutralem Rest" die GESAMTE gültige Fläche unter den Teams
-- verteilt, per gleichzeitiger Voronoi-artiger Flutung von allen
-- Burgen aus — kein neutrales Feld bleibt übrig) und liegen hier als
-- Konstante in `clash_layouts`. Jedes Gerät sieht dadurch exakt
-- dasselbe Board, ohne dass Client oder Server je Geometrie rechnen.
--
-- ── Team-Zuordnung: Vorschau vor dem Start, fest danach ────────
-- Dieselbe Formel überall: Teilnehmer nach skill_participants.seat
-- sortiert, (dense_rank()-1) % team_count. Vor dem Start (lobby) ist
-- das eine reine Vorschau (clash_preview_teams, nichts gespeichert);
-- ändert die Lehrkraft die Team-Zahl, verschiebt sich die Vorschau
-- live mit. Beim Start wird genau dieselbe Formel einmalig in
-- clash_players festgeschrieben. Spätere Beitritte (nach dem Start)
-- bekommen ihre Zuordnung lazy über clash_ensure_player — dieselbe
-- Formel, jetzt mit dem eingefrorenen team_count.
--
-- ── Kein eliminated-Flag ────────────────────────────────────────
-- Ob ein Team noch im Spiel ist, ergibt sich daraus, ob es noch
-- Zeilen in clash_tiles besitzt — spart eine Spalte, die sonst aus
-- dem Tritt geraten könnte.
--
-- ── Echtzeit ist Aufgabe des Frontends ─────────────────────────
-- Diese Migration liefert nur billige Signatur + volle Ansicht
-- (clash_sig/clash_view, clash_room_sig/clash_room_get) — wie überall
-- in MPSkills. Der schnelle Weg (Realtime Broadcast als „jetzt
-- nachfragen"-Signal, nicht als Wahrheit) lebt vollständig im Client
-- (tools/clash-of-math/tool.js) und braucht keinen Baustein hier.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check bzw.
-- `create table/function if not exists`/`or replace`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) skill_tools-Zeile
-- ─────────────────────────────────────────────────────────────
-- Erstes Tool im neuen Fach „Mathematik" — sort_order 50 stellt den
-- Abschnitt hinter „Fächerübergreifend" (10/20) und „Informatik"
-- (30/40). folder = id (kein Tippfehler/Dreher wie bei NeuroLab/
-- Cäsar): der Ordner ist von Anfang an sauber benannt.
insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('clash-of-math', 'Clash of Math',
   'Teams erobern gemeinsam ein Spielfeld: richtige Kopfrechenaufgaben nehmen ein Nachbarfeld eines anderen Teams ein.',
   '⚔️', 'clash-of-math', 'Mathematik', true,
   '{}'::jsonb, true, 50)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;
-- max_participants/max_rooms bewusst NICHT im do-update (0078-Regel):
-- eine von Hand hochgesetzte Obergrenze soll ein erneuter Lauf nicht
-- zurückdrehen.


-- ─────────────────────────────────────────────────────────────
-- 2) clash_layouts — statische Board-Geometrie, nie zur Laufzeit
--    verändert
-- ─────────────────────────────────────────────────────────────
create table if not exists clash_layouts (
  team_count int primary key check (team_count between 2 and 8),
  rows       int not null,
  cols       int not null,
  tiles      jsonb not null,   -- [{r,c,slot}, …] — JEDE gültige Zelle, kein neutraler Rest
  castles    jsonb not null    -- [{slot,r,c}, …] — eine Burg-Zelle je Slot
);

comment on table clash_layouts is
  'Statische Board-Layouts je Team-Zahl (2..8), einmalig offline erzeugt (siehe Kopfkommentar). '
  'Nie zur Laufzeit verändert, kein Bezug zu einem Raum.';
comment on column clash_layouts.tiles is
  'Jede gültige Zelle des Spielfelds mit ihrem Start-Slot (0..team_count-1). Kein neutrales Feld '
  'bleibt übrig — „Freie Felder gibt es nicht".';

alter table clash_layouts enable row level security;
-- Keine Policies, kein Grant an anon/authenticated: reine Referenzdaten,
-- ausschließlich intern über clash_room_start gelesen. Ein Client hat
-- keinen Grund, sie direkt abzufragen — er bekommt sein Board über
-- clash_view/clash_room_get.
grant select on clash_layouts to service_role;

insert into clash_layouts (team_count, rows, cols, tiles, castles) values
  (2, 11, 11, '[{"r":3,"c":3,"slot":0},{"r":3,"c":4,"slot":0},{"r":3,"c":6,"slot":1},{"r":3,"c":7,"slot":1},{"r":4,"c":3,"slot":0},{"r":4,"c":4,"slot":0},{"r":4,"c":5,"slot":1},{"r":4,"c":6,"slot":1},{"r":4,"c":7,"slot":1},{"r":5,"c":3,"slot":0},{"r":5,"c":4,"slot":0},{"r":5,"c":5,"slot":0},{"r":5,"c":6,"slot":1},{"r":5,"c":7,"slot":1},{"r":6,"c":3,"slot":0},{"r":6,"c":4,"slot":0},{"r":6,"c":5,"slot":0},{"r":6,"c":6,"slot":1},{"r":6,"c":7,"slot":1},{"r":7,"c":3,"slot":0},{"r":7,"c":4,"slot":0},{"r":7,"c":5,"slot":1},{"r":7,"c":6,"slot":1},{"r":7,"c":7,"slot":1}]'::jsonb, '[{"slot":0,"r":5,"c":3},{"slot":1,"r":5,"c":7}]'::jsonb),
  (3, 11, 11, '[{"r":1,"c":5,"slot":0},{"r":2,"c":4,"slot":0},{"r":2,"c":5,"slot":0},{"r":2,"c":6,"slot":0},{"r":3,"c":4,"slot":0},{"r":3,"c":5,"slot":0},{"r":3,"c":6,"slot":0},{"r":4,"c":4,"slot":0},{"r":4,"c":5,"slot":0},{"r":4,"c":6,"slot":0},{"r":4,"c":7,"slot":1},{"r":5,"c":3,"slot":2},{"r":5,"c":4,"slot":2},{"r":5,"c":5,"slot":2},{"r":5,"c":6,"slot":1},{"r":5,"c":7,"slot":1},{"r":6,"c":2,"slot":2},{"r":6,"c":3,"slot":2},{"r":6,"c":4,"slot":2},{"r":6,"c":5,"slot":2},{"r":6,"c":6,"slot":1},{"r":6,"c":7,"slot":1},{"r":6,"c":8,"slot":1},{"r":7,"c":2,"slot":2},{"r":7,"c":3,"slot":2},{"r":7,"c":4,"slot":2},{"r":7,"c":5,"slot":1},{"r":7,"c":6,"slot":1},{"r":7,"c":7,"slot":1},{"r":7,"c":8,"slot":1}]'::jsonb, '[{"slot":0,"r":2,"c":5},{"slot":1,"r":7,"c":8},{"slot":2,"r":7,"c":2}]'::jsonb),
  (4, 11, 11, '[{"r":2,"c":2,"slot":3},{"r":2,"c":3,"slot":3},{"r":2,"c":4,"slot":3},{"r":2,"c":5,"slot":0},{"r":2,"c":6,"slot":0},{"r":2,"c":7,"slot":0},{"r":2,"c":8,"slot":0},{"r":3,"c":2,"slot":3},{"r":3,"c":3,"slot":3},{"r":3,"c":4,"slot":3},{"r":3,"c":5,"slot":3},{"r":3,"c":6,"slot":0},{"r":3,"c":7,"slot":0},{"r":3,"c":8,"slot":0},{"r":4,"c":2,"slot":3},{"r":4,"c":3,"slot":3},{"r":4,"c":4,"slot":3},{"r":4,"c":5,"slot":0},{"r":4,"c":6,"slot":0},{"r":4,"c":7,"slot":0},{"r":4,"c":8,"slot":0},{"r":5,"c":2,"slot":3},{"r":5,"c":3,"slot":3},{"r":5,"c":4,"slot":2},{"r":5,"c":6,"slot":1},{"r":5,"c":7,"slot":0},{"r":5,"c":8,"slot":1},{"r":6,"c":2,"slot":2},{"r":6,"c":3,"slot":2},{"r":6,"c":4,"slot":2},{"r":6,"c":5,"slot":2},{"r":6,"c":6,"slot":1},{"r":6,"c":7,"slot":1},{"r":6,"c":8,"slot":1},{"r":7,"c":2,"slot":2},{"r":7,"c":3,"slot":2},{"r":7,"c":4,"slot":2},{"r":7,"c":5,"slot":1},{"r":7,"c":6,"slot":1},{"r":7,"c":7,"slot":1},{"r":7,"c":8,"slot":1},{"r":8,"c":2,"slot":2},{"r":8,"c":3,"slot":2},{"r":8,"c":4,"slot":2},{"r":8,"c":5,"slot":2},{"r":8,"c":6,"slot":1},{"r":8,"c":7,"slot":1},{"r":8,"c":8,"slot":1}]'::jsonb, '[{"slot":0,"r":3,"c":7},{"slot":1,"r":7,"c":7},{"slot":2,"r":7,"c":3},{"slot":3,"r":3,"c":3}]'::jsonb),
  (5, 11, 11, '[{"r":1,"c":4,"slot":0},{"r":1,"c":5,"slot":0},{"r":2,"c":3,"slot":0},{"r":2,"c":4,"slot":0},{"r":2,"c":5,"slot":0},{"r":2,"c":6,"slot":0},{"r":2,"c":7,"slot":1},{"r":3,"c":2,"slot":4},{"r":3,"c":3,"slot":4},{"r":3,"c":4,"slot":0},{"r":3,"c":5,"slot":0},{"r":3,"c":6,"slot":0},{"r":3,"c":7,"slot":1},{"r":3,"c":8,"slot":1},{"r":4,"c":1,"slot":4},{"r":4,"c":2,"slot":4},{"r":4,"c":3,"slot":4},{"r":4,"c":4,"slot":4},{"r":4,"c":5,"slot":0},{"r":4,"c":6,"slot":1},{"r":4,"c":7,"slot":1},{"r":4,"c":8,"slot":1},{"r":4,"c":9,"slot":1},{"r":5,"c":1,"slot":4},{"r":5,"c":2,"slot":4},{"r":5,"c":3,"slot":4},{"r":5,"c":6,"slot":2},{"r":5,"c":7,"slot":1},{"r":5,"c":8,"slot":1},{"r":5,"c":9,"slot":1},{"r":6,"c":2,"slot":4},{"r":6,"c":3,"slot":3},{"r":6,"c":4,"slot":3},{"r":6,"c":6,"slot":3},{"r":6,"c":7,"slot":2},{"r":6,"c":8,"slot":2},{"r":7,"c":2,"slot":3},{"r":7,"c":3,"slot":3},{"r":7,"c":4,"slot":3},{"r":7,"c":5,"slot":3},{"r":7,"c":6,"slot":2},{"r":7,"c":7,"slot":2},{"r":7,"c":8,"slot":2},{"r":8,"c":2,"slot":3},{"r":8,"c":3,"slot":3},{"r":8,"c":4,"slot":3},{"r":8,"c":5,"slot":2},{"r":8,"c":6,"slot":2},{"r":8,"c":7,"slot":2},{"r":8,"c":8,"slot":2}]'::jsonb, '[{"slot":0,"r":2,"c":5},{"slot":1,"r":4,"c":8},{"slot":2,"r":8,"c":7},{"slot":3,"r":8,"c":3},{"slot":4,"r":4,"c":2}]'::jsonb),
  (6, 11, 11, '[{"r":1,"c":4,"slot":5},{"r":1,"c":5,"slot":5},{"r":2,"c":2,"slot":4},{"r":2,"c":3,"slot":4},{"r":2,"c":4,"slot":5},{"r":2,"c":5,"slot":5},{"r":2,"c":6,"slot":5},{"r":2,"c":8,"slot":0},{"r":3,"c":1,"slot":4},{"r":3,"c":2,"slot":4},{"r":3,"c":3,"slot":4},{"r":3,"c":4,"slot":5},{"r":3,"c":5,"slot":5},{"r":3,"c":6,"slot":5},{"r":3,"c":7,"slot":0},{"r":3,"c":8,"slot":0},{"r":3,"c":9,"slot":0},{"r":4,"c":1,"slot":4},{"r":4,"c":2,"slot":4},{"r":4,"c":3,"slot":4},{"r":4,"c":4,"slot":5},{"r":4,"c":5,"slot":5},{"r":4,"c":6,"slot":0},{"r":4,"c":7,"slot":0},{"r":4,"c":8,"slot":0},{"r":4,"c":9,"slot":0},{"r":5,"c":1,"slot":3},{"r":5,"c":2,"slot":4},{"r":5,"c":3,"slot":4},{"r":5,"c":7,"slot":0},{"r":5,"c":8,"slot":0},{"r":5,"c":9,"slot":1},{"r":6,"c":1,"slot":3},{"r":6,"c":2,"slot":3},{"r":6,"c":3,"slot":3},{"r":6,"c":4,"slot":3},{"r":6,"c":5,"slot":2},{"r":6,"c":6,"slot":1},{"r":6,"c":7,"slot":1},{"r":6,"c":8,"slot":1},{"r":6,"c":9,"slot":1},{"r":7,"c":1,"slot":3},{"r":7,"c":2,"slot":3},{"r":7,"c":3,"slot":3},{"r":7,"c":4,"slot":2},{"r":7,"c":5,"slot":2},{"r":7,"c":6,"slot":2},{"r":7,"c":7,"slot":1},{"r":7,"c":8,"slot":1},{"r":7,"c":9,"slot":1},{"r":8,"c":2,"slot":3},{"r":8,"c":3,"slot":3},{"r":8,"c":4,"slot":2},{"r":8,"c":5,"slot":2},{"r":8,"c":6,"slot":2},{"r":8,"c":7,"slot":1},{"r":8,"c":8,"slot":1},{"r":9,"c":4,"slot":2},{"r":9,"c":5,"slot":2},{"r":9,"c":6,"slot":2}]'::jsonb, '[{"slot":0,"r":3,"c":8},{"slot":1,"r":7,"c":8},{"slot":2,"r":8,"c":5},{"slot":3,"r":7,"c":2},{"slot":4,"r":3,"c":2},{"slot":5,"r":2,"c":5}]'::jsonb),
  (7, 11, 11, '[{"r":1,"c":4,"slot":0},{"r":1,"c":5,"slot":0},{"r":1,"c":6,"slot":0},{"r":2,"c":2,"slot":6},{"r":2,"c":3,"slot":6},{"r":2,"c":4,"slot":0},{"r":2,"c":5,"slot":0},{"r":2,"c":6,"slot":0},{"r":2,"c":7,"slot":1},{"r":2,"c":8,"slot":1},{"r":3,"c":2,"slot":6},{"r":3,"c":3,"slot":6},{"r":3,"c":4,"slot":6},{"r":3,"c":5,"slot":0},{"r":3,"c":6,"slot":1},{"r":3,"c":7,"slot":1},{"r":3,"c":8,"slot":1},{"r":4,"c":1,"slot":6},{"r":4,"c":2,"slot":6},{"r":4,"c":3,"slot":6},{"r":4,"c":4,"slot":6},{"r":4,"c":5,"slot":0},{"r":4,"c":6,"slot":0},{"r":4,"c":7,"slot":1},{"r":4,"c":8,"slot":1},{"r":4,"c":9,"slot":1},{"r":5,"c":1,"slot":5},{"r":5,"c":2,"slot":5},{"r":5,"c":3,"slot":5},{"r":5,"c":4,"slot":5},{"r":5,"c":5,"slot":3},{"r":5,"c":6,"slot":1},{"r":5,"c":7,"slot":2},{"r":5,"c":8,"slot":2},{"r":5,"c":9,"slot":2},{"r":6,"c":1,"slot":5},{"r":6,"c":2,"slot":5},{"r":6,"c":3,"slot":5},{"r":6,"c":4,"slot":5},{"r":6,"c":5,"slot":4},{"r":6,"c":6,"slot":3},{"r":6,"c":7,"slot":2},{"r":6,"c":8,"slot":2},{"r":6,"c":9,"slot":2},{"r":7,"c":2,"slot":5},{"r":7,"c":3,"slot":4},{"r":7,"c":4,"slot":4},{"r":7,"c":5,"slot":3},{"r":7,"c":6,"slot":3},{"r":7,"c":7,"slot":2},{"r":7,"c":8,"slot":2},{"r":8,"c":2,"slot":4},{"r":8,"c":3,"slot":4},{"r":8,"c":4,"slot":4},{"r":8,"c":5,"slot":3},{"r":8,"c":6,"slot":3},{"r":8,"c":7,"slot":3},{"r":8,"c":8,"slot":2},{"r":9,"c":3,"slot":4},{"r":9,"c":4,"slot":4},{"r":9,"c":5,"slot":4},{"r":9,"c":6,"slot":3},{"r":9,"c":7,"slot":3}]'::jsonb, '[{"slot":0,"r":2,"c":5},{"slot":1,"r":3,"c":7},{"slot":2,"r":6,"c":8},{"slot":3,"r":8,"c":6},{"slot":4,"r":8,"c":4},{"slot":5,"r":6,"c":2},{"slot":6,"r":3,"c":3}]'::jsonb),
  (8, 11, 11, '[{"r":1,"c":3,"slot":6},{"r":1,"c":4,"slot":6},{"r":1,"c":5,"slot":6},{"r":1,"c":6,"slot":7},{"r":2,"c":3,"slot":6},{"r":2,"c":4,"slot":6},{"r":2,"c":5,"slot":7},{"r":2,"c":6,"slot":7},{"r":2,"c":7,"slot":7},{"r":3,"c":1,"slot":5},{"r":3,"c":2,"slot":5},{"r":3,"c":3,"slot":7},{"r":3,"c":4,"slot":7},{"r":3,"c":5,"slot":7},{"r":3,"c":6,"slot":7},{"r":3,"c":7,"slot":0},{"r":3,"c":8,"slot":0},{"r":3,"c":9,"slot":0},{"r":4,"c":1,"slot":5},{"r":4,"c":2,"slot":5},{"r":4,"c":3,"slot":6},{"r":4,"c":4,"slot":6},{"r":4,"c":5,"slot":5},{"r":4,"c":6,"slot":6},{"r":4,"c":7,"slot":0},{"r":4,"c":8,"slot":0},{"r":4,"c":9,"slot":0},{"r":5,"c":1,"slot":4},{"r":5,"c":2,"slot":5},{"r":5,"c":3,"slot":5},{"r":5,"c":6,"slot":0},{"r":5,"c":7,"slot":1},{"r":5,"c":8,"slot":0},{"r":5,"c":9,"slot":1},{"r":6,"c":1,"slot":4},{"r":6,"c":2,"slot":4},{"r":6,"c":3,"slot":4},{"r":6,"c":4,"slot":5},{"r":6,"c":5,"slot":3},{"r":6,"c":6,"slot":2},{"r":6,"c":7,"slot":1},{"r":6,"c":8,"slot":1},{"r":6,"c":9,"slot":1},{"r":7,"c":1,"slot":4},{"r":7,"c":2,"slot":4},{"r":7,"c":3,"slot":4},{"r":7,"c":4,"slot":3},{"r":7,"c":5,"slot":3},{"r":7,"c":6,"slot":2},{"r":7,"c":7,"slot":1},{"r":7,"c":8,"slot":1},{"r":7,"c":9,"slot":1},{"r":8,"c":2,"slot":4},{"r":8,"c":3,"slot":3},{"r":8,"c":4,"slot":3},{"r":8,"c":5,"slot":3},{"r":8,"c":6,"slot":2},{"r":8,"c":7,"slot":2},{"r":8,"c":8,"slot":2},{"r":9,"c":3,"slot":3},{"r":9,"c":4,"slot":3},{"r":9,"c":5,"slot":2},{"r":9,"c":6,"slot":2},{"r":9,"c":7,"slot":2}]'::jsonb, '[{"slot":0,"r":4,"c":8},{"slot":1,"r":6,"c":8},{"slot":2,"r":8,"c":6},{"slot":3,"r":8,"c":4},{"slot":4,"r":6,"c":2},{"slot":5,"r":4,"c":2},{"slot":6,"r":2,"c":4},{"slot":7,"r":2,"c":6}]'::jsonb)
on conflict (team_count) do nothing;


-- ─────────────────────────────────────────────────────────────
-- 3) clash_boards — 1 Zeile je Raum
-- ─────────────────────────────────────────────────────────────
create table if not exists clash_boards (
  room_id            uuid primary key references skill_rooms(id) on delete cascade,
  team_count         int  not null default 4 check (team_count between 2 and 8),
  phase              text not null default 'lobby'
                       check (phase in ('lobby', 'countdown', 'running', 'ended')),
  grid_rows          int,
  grid_cols          int,
  countdown_ends_at  timestamptz,
  started_at         timestamptz,
  ended_at           timestamptz,
  winner_team        int,
  -- Eigener Zufallswert für den Realtime-Kanal — NICHT der 6-stellige
  -- Beitritts-Code. Derselbe Trennungsgedanke wie beim Teilnehmer-
  -- Token: ein erratbarer Kanalname ließe fremde Klassen mitlesen.
  broadcast_key      text not null default encode(gen_random_bytes(18), 'hex'),
  created_at         timestamptz not null default now()
);

comment on table clash_boards is
  'Spielzustand je Raum: Team-Zahl (änderbar solange phase=lobby), Phase, Countdown, Sieger. '
  'Wird lazy angelegt (clash_ensure_board) beim ersten Aufruf von clash_view/clash_room_get.';
comment on column clash_boards.phase is
  'lobby (Team-Zahl änderbar) → countdown (5s, Board schon erzeugt) → running → ended. '
  'Übergang countdown→running läuft lazy über clash_maybe_advance_phase, kein Cron nötig.';
comment on column clash_boards.broadcast_key is
  'Topic des Realtime-Broadcast-Kanals dieses Boards. Kommt nur in clash_view/clash_room_get '
  'heraus — nie der 6-stellige Raum-Code, sonst wäre der Kanal so leicht zu erraten wie der Code.';

alter table clash_boards enable row level security;
grant select, insert, update, delete on clash_boards to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) clash_players — 1 Zeile je Teilnehmer, ab dem Start bzw. ab
--    dem ersten Kontakt eines Spätzugangs
-- ─────────────────────────────────────────────────────────────
create table if not exists clash_players (
  participant_id  uuid primary key references skill_participants(id) on delete cascade,
  team_index      int  not null,
  streak          int  not null default 0,
  correct_count   int  not null default 0,
  wrong_count     int  not null default 0,
  -- Die laufende Aufgabe. Bei einfacher Addition ist daran nichts
  -- geheim zu halten (der Schüler soll a+b ja sehen und ausrechnen)
  -- — die Anti-Cheat-Frage ist nur, dass der Client nie selbst
  -- behaupten darf „richtig", sondern die Zahl einschicken muss.
  current_a       int,
  current_b       int
);

comment on table clash_players is
  'Team-Zuordnung + laufende Aufgabe + Streak je Teilnehmer. Entsteht bulk beim Start '
  '(clash_room_start) oder lazy bei einem späteren Beitritt (clash_ensure_player).';

alter table clash_players enable row level security;
grant select, insert, update, delete on clash_players to service_role;


-- ─────────────────────────────────────────────────────────────
-- 5) clash_tiles — eine Zeile je Feld, NICHT ein jsonb-Blob
-- ─────────────────────────────────────────────────────────────
-- Bei bis zu 150 Teilnehmern, die im Sekundentakt Antworten abgeben,
-- wäre ein einzelnes jsonb-Feld am Board (Read-Modify-Write auf
-- einer Zeile) ein serieller Flaschenhals genau dann, wenn das Spiel
-- am hektischsten ist. Zeilenweise Updates mit „bei Kollision
-- anderen Kandidaten nehmen" (siehe clash_submit_answer) skalieren
-- deutlich besser.
create table if not exists clash_tiles (
  room_id     uuid not null references skill_rooms(id) on delete cascade,
  r           int  not null,
  c           int  not null,
  owner_team  int  not null,
  is_castle   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (room_id, r, c)
);

comment on table clash_tiles is
  'Ein Feld, ein Besitzer-Team. Kein eliminated-Flag am Team — ob eines noch im Spiel ist, '
  'ergibt sich daraus, ob es hier noch Zeilen besitzt.';

alter table clash_tiles enable row level security;
grant select, insert, update, delete on clash_tiles to service_role;


-- ─────────────────────────────────────────────────────────────
-- 6) Interne Helfer
-- ─────────────────────────────────────────────────────────────

-- Hex-Nachbarschaft, wortgleich zur Vorlage im Prototyp (Reihen
-- versetzt, gerade/ungerade Zeile hat unterschiedliche Richtungen).
-- immutable: hängt nur von den vier Zahlen ab.
create or replace function clash_is_neighbor(p_r1 int, p_c1 int, p_r2 int, p_c2 int)
  returns boolean
  language sql
  immutable
as $$
  select case when p_r1 % 2 = 1 then
    (p_r2, p_c2) in ((p_r1-1,p_c1), (p_r1-1,p_c1+1), (p_r1,p_c1-1),
                     (p_r1,p_c1+1), (p_r1+1,p_c1),   (p_r1+1,p_c1+1))
  else
    (p_r2, p_c2) in ((p_r1-1,p_c1-1), (p_r1-1,p_c1), (p_r1,p_c1-1),
                     (p_r1,p_c1+1),   (p_r1+1,p_c1-1), (p_r1+1,p_c1))
  end;
$$;

revoke all on function clash_is_neighbor(int, int, int, int) from public;


-- Team-Vorschau/-Zuordnung nach Sitzplatznummer — EINE Formel für
-- die Onboarding-Vorschau (phase=lobby) UND die endgültige
-- Festschreibung beim Start, damit beide garantiert übereinstimmen.
create or replace function clash_preview_teams(p_room uuid)
  returns table(participant_id uuid, team_index int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p.id, ((dense_rank() over (order by p.seat))::int - 1) % b.team_count
    from skill_participants p
    join clash_boards b on b.room_id = p.room_id
   where p.room_id = p_room;
$$;

revoke all on function clash_preview_teams(uuid) from public;

comment on function clash_preview_teams(uuid) is
  'Team-Index je Teilnehmer nach Sitzplatz-Reihenfolge. Vor dem Start eine reine Vorschau '
  '(nichts gespeichert), beim Start die Quelle für die endgültige clash_players-Zuordnung.';


-- Eine neue Additionsaufgabe bis 100. a in 1..99, b so gewählt, dass
-- a+b<=100 bleibt.
create or replace function clash_new_question()
  returns table(a int, b int)
  language sql
as $$
  select x.a, 1 + floor(random() * (100 - x.a))::int
    from (select 1 + floor(random() * 99)::int as a) x;
$$;

revoke all on function clash_new_question() from public;


-- Board lazy anlegen, statt die generische Raum-Anlage um
-- Clash-Wissen zu erweitern (skill_room_create bleibt unangetastet).
create or replace function clash_ensure_board(p_room uuid)
  returns clash_boards
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_board clash_boards;
begin
  select * into v_board from clash_boards where room_id = p_room;
  if v_board.room_id is not null then
    return v_board;
  end if;

  insert into clash_boards (room_id) values (p_room)
  on conflict (room_id) do nothing;

  select * into v_board from clash_boards where room_id = p_room;
  return v_board;
end;
$$;

revoke all on function clash_ensure_board(uuid) from public;


-- clash_players-Zeile für einen Teilnehmer nachziehen, der erst NACH
-- dem Start (oder während des Countdowns) dazustößt. Dieselbe Formel
-- wie die Vorschau, jetzt mit dem eingefrorenen team_count.
create or replace function clash_ensure_player(p_participant uuid, p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_team int;
  v_q    record;
begin
  if exists (select 1 from clash_players where participant_id = p_participant) then
    return;
  end if;

  select team_index into v_team
    from clash_preview_teams(p_room)
   where participant_id = p_participant;

  if v_team is null then
    return;
  end if;

  select * into v_q from clash_new_question();

  insert into clash_players (participant_id, team_index, current_a, current_b)
  values (p_participant, v_team, v_q.a, v_q.b)
  on conflict (participant_id) do nothing;
end;
$$;

revoke all on function clash_ensure_player(uuid, uuid) from public;


-- Lazy Phasenübergang, kein Hintergrundjob — dasselbe Muster wie
-- skill_cleanup_maybe(): der Wechsel passiert beim nächsten Zugriff.
create or replace function clash_maybe_advance_phase(p_room uuid)
  returns void
  security definer
  set search_path = public
  language sql
as $$
  update clash_boards
     set phase = 'running'
   where room_id = p_room
     and phase = 'countdown'
     and countdown_ends_at is not null
     and now() >= countdown_ends_at;
$$;

revoke all on function clash_maybe_advance_phase(uuid) from public;


-- Billige Signatur. count(*) an clash_tiles ändert sich nie (das
-- Board wird einmal beim Start angelegt und nie um Felder verkürzt/
-- verlängert) — max(updated_at) ist deshalb der Teil, der jede
-- Eroberung meldet.
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
    (select coalesce(winner_team, -1) from clash_boards where room_id = p_room),
    (select count(*) from clash_tiles where room_id = p_room),
    (select coalesce(extract(epoch from max(updated_at))::bigint, 0)
       from clash_tiles where room_id = p_room),
    (select count(*) from skill_participants where room_id = p_room)
  );
$$;

revoke all on function clash_sig_of(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 7) Teilnehmer (Token)
-- ─────────────────────────────────────────────────────────────
create or replace function clash_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p        skill_participants;
  v_room     skill_rooms;
  v_board    clash_boards;
  v_player   clash_players;
  v_my_team  int;
  v_alive    boolean := true;
  v_question jsonb := null;
  v_teams    jsonb;
  v_tiles    jsonb;
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

  if v_board.phase = 'lobby' then
    select team_index into v_my_team
      from clash_preview_teams(v_room.id)
     where participant_id = v_p.id;
  else
    perform clash_ensure_player(v_p.id, v_room.id);
    select * into v_player from clash_players where participant_id = v_p.id;
    v_my_team := v_player.team_index;
    if v_board.phase = 'running' then
      v_alive := exists (
        select 1 from clash_tiles where room_id = v_room.id and owner_team = v_my_team
      );
      if v_alive then
        v_question := jsonb_build_object('a', v_player.current_a, 'b', v_player.current_b);
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle
         )), '[]'::jsonb)
    into v_tiles
    from clash_tiles where room_id = v_room.id;

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'countdown_ends_at', v_board.countdown_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'me', jsonb_build_object(
      'team',    v_my_team,
      'alive',   v_alive,
      'streak',  coalesce(v_player.streak, 0),
      'question', v_question,
      'seat',    v_p.seat,
      'name',    coalesce(v_p.name, 'Tablet ' || v_p.seat)
    )
  );
end;
$$;

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;


create or replace function clash_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  perform clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);

  return jsonb_build_object('ok', true, 'sig', clash_sig_of(v_room.id));
end;
$$;

revoke all on function clash_sig(text) from public;
grant execute on function clash_sig(text) to anon, authenticated;


-- Die Kernaktion. Bis zu 3 Versuche, ein Kandidatenfeld zu sperren:
-- ORDER BY random() LIMIT 1 FOR UPDATE SKIP LOCKED übergeht Zeilen,
-- die gerade ein paralleler Aufruf für ein anderes Team sperrt, statt
-- zu blockieren — bei einer ganzen Klasse, die gleichzeitig abgibt,
-- soll ein Treffer nicht auf einen Lock warten müssen.
create or replace function clash_submit_answer(p_token text, p_answer int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p       skill_participants;
  v_room    skill_rooms;
  v_board   clash_boards;
  v_player  clash_players;
  v_correct boolean;
  v_tr      int;
  v_tc      int;
  v_tprev   int;
  v_alive_n int;
  v_q       record;
  i         int;
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

  if not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  ) then
    return jsonb_build_object('ok', false, 'error', 'team_eliminated');
  end if;

  -- Randfall: keine laufende Frage (sollte durch clash_ensure_player/
  -- clash_room_start nicht vorkommen) — dann erst eine ziehen, ohne
  -- die abgegebene Zahl zu werten.
  if v_player.current_a is null then
    select * into v_q from clash_new_question();
    update clash_players set current_a = v_q.a, current_b = v_q.b
     where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'correct', null,
      'question', jsonb_build_object('a', v_q.a, 'b', v_q.b));
  end if;

  v_correct := (p_answer = v_player.current_a + v_player.current_b);

  if v_correct then
    for i in 1..3 loop
      v_tr := null; v_tc := null; v_tprev := null;
      select t.r, t.c, t.owner_team into v_tr, v_tc, v_tprev
        from clash_tiles t
       where t.room_id = v_room.id
         and t.owner_team <> v_player.team_index
         and exists (
           select 1 from clash_tiles m
            where m.room_id = t.room_id
              and m.owner_team = v_player.team_index
              and clash_is_neighbor(m.r, m.c, t.r, t.c)
         )
       order by random()
       limit 1
         for update of t skip locked;
      exit when v_tr is not null;
    end loop;

    if v_tr is not null then
      update clash_tiles
         set owner_team = v_player.team_index, updated_at = now()
       where room_id = v_room.id and r = v_tr and c = v_tc;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1
     where participant_id = v_p.id;
  else
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1
     where participant_id = v_p.id;
  end if;

  select * into v_q from clash_new_question();
  update clash_players set current_a = v_q.a, current_b = v_q.b
   where participant_id = v_p.id;

  if v_correct and v_tr is not null then
    select count(distinct owner_team) into v_alive_n
      from clash_tiles where room_id = v_room.id;
    if v_alive_n <= 1 then
      update clash_boards
         set phase = 'ended', ended_at = now(),
             winner_team = (select owner_team from clash_tiles
                              where room_id = v_room.id limit 1)
       where room_id = v_room.id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'captured', case when v_correct and v_tr is not null
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'prev_owner', v_tprev)
                 else null end,
    'streak', (select streak from clash_players where participant_id = v_p.id),
    'question', jsonb_build_object('a', v_q.a, 'b', v_q.b)
  );
end;
$$;

revoke all on function clash_submit_answer(text, int) from public;
grant execute on function clash_submit_answer(text, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) Lehrkraft (Code, angemeldet, Raumbesitz geprüft)
-- ─────────────────────────────────────────────────────────────
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
  perform skill_touch(v_room.id);

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'r', r, 'c', c, 'team', owner_team, 'castle', is_castle
         )), '[]'::jsonb)
    into v_tiles
    from clash_tiles where room_id = v_room.id;

  select coalesce(jsonb_object_agg(owner_team, cnt), '{}'::jsonb)
    into v_status
    from (
      select owner_team, count(*) as cnt
        from clash_tiles where room_id = v_room.id
       group by owner_team
    ) t;

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'countdown_ends_at', v_board.countdown_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_tile_counts', v_status
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;


create or replace function clash_room_sig(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
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

  perform clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);

  return jsonb_build_object('ok', true, 'sig', clash_sig_of(v_room.id));
end;
$$;

revoke all on function clash_room_sig(text) from public;
grant execute on function clash_room_sig(text) to authenticated;


create or replace function clash_room_set_team_count(p_code text, p_team_count int)
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

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_team_count is null or p_team_count < 2 or p_team_count > 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_team_count');
  end if;

  update clash_boards set team_count = p_team_count where room_id = v_room.id;
  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true, 'team_count', p_team_count);
end;
$$;

revoke all on function clash_room_set_team_count(text, int) from public;
grant execute on function clash_room_set_team_count(text, int) to authenticated;


-- Board erzeugen + Team-Zuordnung festschreiben + Countdown starten.
-- Löscht zur Sicherheit erst eventuelle Reste eines vorherigen
-- Durchlaufs (normalerweise längst durch clash_room_reset weg).
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

  select * into v_layout from clash_layouts where team_count = v_board.team_count;
  if v_layout.team_count is null then
    return jsonb_build_object('ok', false, 'error', 'layout_missing');
  end if;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );

  insert into clash_tiles (room_id, r, c, owner_team, is_castle)
  select v_room.id, (t->>'r')::int, (t->>'c')::int, (t->>'slot')::int, false
    from jsonb_array_elements(v_layout.tiles) t;

  update clash_tiles ct
     set is_castle = true
    from jsonb_array_elements(v_layout.castles) cst
   where ct.room_id = v_room.id
     and ct.r = (cst->>'r')::int
     and ct.c = (cst->>'c')::int;

  insert into clash_players (participant_id, team_index, current_a, current_b)
  select pt.participant_id, pt.team_index, q.a, q.b
    from clash_preview_teams(v_room.id) pt, lateral clash_new_question() q;

  update clash_boards
     set phase             = 'countdown',
         started_at        = now(),
         countdown_ends_at = now() + interval '5 seconds',
         grid_rows         = v_layout.rows,
         grid_cols         = v_layout.cols,
         winner_team       = null,
         ended_at          = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function clash_room_start(text) from public;
grant execute on function clash_room_start(text) to authenticated;


-- Für einen zweiten Durchlauf im selben Raum: Board weg, Zurück auf
-- lobby. Team-Zahl bleibt stehen (das ist die Einstellung, nicht der
-- Spielstand).
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

  update clash_boards
     set phase = 'lobby', started_at = null, countdown_ends_at = null,
         ended_at = null, winner_team = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function clash_room_reset(text) from public;
grant execute on function clash_room_reset(text) to authenticated;
