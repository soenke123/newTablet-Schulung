-- ══════════════════════════════════════════════════════════════
-- Migration 0007 — Cluster-Zeitfenster härten
-- ══════════════════════════════════════════════════════════════
-- 1) opens_at und closes_at werden NOT NULL — jeder Cluster hat
--    ein konkretes Anmeldefenster.
-- 2) Fenster ist maximal 7 Tage groß (Check).
-- 3) Innerhalb einer Schule dürfen sich Fenster nicht überschneiden
--    (Exclusion Constraint über tstzrange).
--
-- Backfill: bestehende Cluster mit NULL bekommen created_at als
-- opens_at und created_at + 7d als closes_at. Damit kollidieren sie
-- untereinander nicht (created_at ist pro Row eindeutig).
-- Falls es echte Overlaps zwischen bereits gefüllten Zeitfenstern
-- gibt, schlägt der EXCLUDE beim Add fehl — dann muss der Admin
-- die Testdaten aufräumen.
-- ══════════════════════════════════════════════════════════════

-- btree_gist braucht Postgres für gemischte GiST-Indexe
-- (school_id uuid mit = + tstzrange mit &&).
create extension if not exists btree_gist;

-- Backfill NULLs mit stabilen, kollisionsfreien Werten.
update clusters set
  opens_at  = coalesce(opens_at,  created_at),
  closes_at = coalesce(closes_at, coalesce(opens_at, created_at) + interval '7 days')
where opens_at is null or closes_at is null;

-- NOT NULL erzwingen.
alter table clusters
  alter column opens_at  set not null,
  alter column closes_at set not null;

-- Alten Check droppen (heißt in 0001 auto-generiert clusters_check).
-- Wir ersetzen ihn durch einen strikteren mit Max-Dauer.
alter table clusters drop constraint if exists clusters_check;

alter table clusters
  add constraint clusters_window_valid
  check (
    opens_at < closes_at
    and closes_at - opens_at <= interval '7 days'
  );

-- Kein Overlap innerhalb einer Schule. '[)' = halboffen, damit
-- back-to-back-Cluster (closes_at von A = opens_at von B) erlaubt sind.
alter table clusters
  add constraint clusters_no_overlap
  exclude using gist (
    school_id                              with =,
    tstzrange(opens_at, closes_at, '[)')   with &&
  );

comment on constraint clusters_window_valid on clusters is
  'Zeitfenster muss gültig sein (opens_at < closes_at) und darf max. 7 Tage groß sein.';
comment on constraint clusters_no_overlap on clusters is
  'Pro Schule dürfen sich Anmelde-Zeitfenster nicht überschneiden.';
