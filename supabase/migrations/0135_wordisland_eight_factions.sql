-- ══════════════════════════════════════════════════════════════
-- Migration 0135 — Myth of Wordisland: acht Völker statt sechs
-- ══════════════════════════════════════════════════════════════
-- Sönke, 2026-09-09: „bitte ergänze aber die letzten 2 Völker ich
-- hätte gerne 8 völker."
--
-- Die Bilder für die beiden gibt es längst — Wolken-Piraten (rosa)
-- und Spuk-Einhorn (magenta) standen von Anfang an im Sprite-Ordner
-- und in der Flotte des Showrooms. Was fehlte, war die Erlaubnis in
-- der Datenbank: 0131 hat die Zahl der Völker bei SECHS gedeckelt,
-- 0133 hat denselben Deckel noch zweimal in die Völker-Auswahl
-- geschrieben. Ohne diese Migration kann die Wappenreihe die beiden
-- neuen zwar ZEIGEN, aber kein Klick darauf käme durch: der Server
-- gäbe für jede Auswahl mit sieben oder acht Völkern ein stures
-- {ok:false} zurück, und das sähe aus wie ein Netzproblem.
--
-- ── Drei Stellen, und alle drei müssen mit ────────────────────
--   1. wi_boards.team_count      (0131)  check 2..6  → 2..8
--   2. wi_boards_factions_len_ck (0133)  Länge 2..6  → 2..8
--   3. wi_normalize_factions     (0133)  Ziffern 0-5 → 0-7
--                                        und Anzahl 2..6 → 2..8
-- Wird eine vergessen, ist das Ergebnis dasselbe wie gar nichts zu
-- tun: die Prüfung, die als Erste greift, lehnt ab.
--
-- ── Was NICHT geändert werden muss ────────────────────────────
-- wi_build_island rechnet die Landeplätze schon für beliebig viele
-- Völker: die Zielrichtungen sind `6.2832 * k / p_teams`, der
-- Mindestabstand `1.10 * R * sin(pi / p_teams)` — beides wird mit
-- acht enger, und für den Fall, dass die Küste keinen Platz mehr
-- hergibt, gibt es dort schon einen zweiten Durchgang OHNE
-- Mindestabstand („lieber ein enger Nachbar als gar kein
-- Landeplatz"). Auch wi_ensure_player, wi_teams_json und
-- wi_seat_assign zählen über p_teams und nicht gegen eine feste
-- Sechs.
--
-- ── Was das für die Klasse heißt ──────────────────────────────
-- Acht Völker sind eine Ansage, keine bloße Möglichkeit: bei 24
-- Kindern sind das Dreiergruppen. Das ist gewollt (kleine Gruppen
-- reden mehr), aber es ist auch die Grenze — die Inselgröße hängt
-- an der Zahl der KINDER und nicht an der Zahl der Völker, acht
-- Landeplätze auf einer Insel für zwölf Kinder liegen dicht
-- beieinander. Der Deckel steht deshalb bei acht und nicht höher.
--
-- ⚠️ Die beiden `drop constraint` unten sind KEINE Idempotenz-
-- Krücken (dafür gilt weiter: DO-Block + pg_catalog-Check, siehe
-- feedback_supabase_no_drop_statements) — sie SIND der Umbau: eine
-- Prüfregel lässt sich in Postgres nicht ändern, nur ersetzen. Es
-- geht dabei kein Datensatz verloren; die neue Regel ist die alte
-- mit einer größeren Zahl und lässt jede bestehende Zeile durch.
-- Dasselbe Muster wie in 0108 (clash_team_events_kind_check).
--
-- Sonst kein DROP — die Funktion per `create or replace`.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) team_count darf bis acht
-- ─────────────────────────────────────────────────────────────
-- Der Check heißt so, wie Postgres ihn beim `check (…)` in der
-- Spaltendefinition von 0131 getauft hat. Entschieden wird an der
-- DEFINITION und nicht am Namen: nur so tut ein zweiter Lauf dieser
-- Migration nichts mehr, und nur so bleibt der Name derselbe, unter
-- dem eine spätere Migration ihn wiederfindet.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
   where c.conname  = 'wi_boards_team_count_check'
     and c.conrelid = 'public.wi_boards'::regclass;

  if v_def is not null and position('8' in v_def) = 0 then
    alter table wi_boards drop constraint wi_boards_team_count_check;
    v_def := null;
  end if;

  if v_def is null then
    alter table wi_boards
      add constraint wi_boards_team_count_check
      check (team_count between 2 and 8);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) Die Völker-Liste darf acht Einträge haben
-- ─────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_catalog.pg_constraint c
   where c.conname  = 'wi_boards_factions_len_ck'
     and c.conrelid = 'public.wi_boards'::regclass;

  if v_def is not null and position('8' in v_def) = 0 then
    alter table wi_boards drop constraint wi_boards_factions_len_ck;
    v_def := null;
  end if;

  if v_def is null then
    alter table wi_boards
      add constraint wi_boards_factions_len_ck
      check (jsonb_typeof(factions) = 'array'
             and jsonb_array_length(factions) between 2 and 8);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 3) wi_normalize_factions — die eine Stelle, die prüft
-- ─────────────────────────────────────────────────────────────
-- Wortgleich zu 0133, mit zwei geänderten Zahlen. Sie steht hier
-- vollständig und nicht als Verweis: eine Funktion, die man beim
-- Lesen erst aus zwei Migrationen zusammensetzen muss, wird beim
-- nächsten Mal falsch zusammengesetzt.
--
-- NULL heißt „unbrauchbar" — der Aufrufer macht daraus seine
-- übliche {ok:false}-Antwort, statt dass eine SQL-Ausnahme durch die
-- RPC-Schicht schlägt.
create or replace function wi_normalize_factions(p_factions jsonb)
  returns jsonb
  immutable
  set search_path = public
  language sql
as $$
  select case
    when p_factions is null or jsonb_typeof(p_factions) <> 'array' then null
    -- `(e #>> '{}')` ist der Rohtext des JSON-Werts: bei einer 3 also
    -- '3', bei 3.5 eben '3.5'. Der Ausdruck erledigt damit Bruchzahlen,
    -- negative Werte und alles über 7 in einem Zug.
    when exists (
      select 1 from jsonb_array_elements(p_factions) e
       where jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-7]$'
    ) then null
    else (
      select case when count(*) between 2 and 8
                  then jsonb_agg(v order by v)
                  else null end
        from (
          select distinct (e #>> '{}')::int as v
            from jsonb_array_elements(p_factions) e
        ) x
    )
  end;
$$;

comment on function wi_normalize_factions(jsonb) is
  'Prüft und ordnet die Völker-Auswahl: Ganzzahlen 0..7, ohne Doppelte, aufsteigend, '
  'zwei bis acht Stück. NULL heißt unbrauchbar. Seit 0135 acht statt sechs.';
