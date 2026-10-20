-- ══════════════════════════════════════════════════════════════
-- Migration 0215 — Grants für die Vercel Functions (api/) festschreiben
-- ══════════════════════════════════════════════════════════════
-- Supabase gibt ab dem 30.10.2026 neuen Tabellen in "public" keine
-- Data-API-Rechte mehr automatisch. Bestehende Tabellen behalten ihre
-- Rechte — aber wer das Schema aus den Migrationen neu aufbaut (neues
-- Projekt, Preview-Branch, db reset), bekommt nur noch, was hier steht.
--
-- Das Frontend greift nie direkt auf Tabellen zu, nur über RPCs mit
-- security definer (laufen als Besitzer, brauchen keine Grants).
-- Direkt per .from(...) arbeiten nur die Functions in api/ mit dem
-- service_role-Key. Deren Tabellen bekommen hier ausdrücklich ihre
-- Rechte, damit ein Neuaufbau nicht mit "permission denied" endet.
-- Ändert am laufenden Projekt nichts (Grants sind idempotent).
--
-- REGEL FÜR NEUE TABELLEN: Liest oder schreibt api/ eine neue Tabelle
-- direkt, gehört in dieselbe Migration
--   grant select, insert, update, delete on <tabelle> to service_role;
-- (bei identity/serial zusätzlich usage, select auf die Sequence).
-- Keine Grants an anon/authenticated nur „weil die Mail es sagt“ —
-- Zugriff für Nutzer läuft über RPCs.
-- ══════════════════════════════════════════════════════════════

-- Stammdaten: signup, admin_create_school, admin_move_user_school,
-- admin_promote_user, admin_delete_cluster, admin_delete_user …
grant select, insert, update, delete on profiles to service_role;
grant select, insert, update, delete on schools  to service_role;
grant select, insert, update, delete on clusters to service_role;

-- Rate-Limit-Logs: signup.js, skill_join.js
grant select, insert, update, delete on signup_attempts     to service_role;
grant select, insert, update, delete on skill_join_attempts to service_role;
grant usage, select on sequence signup_attempts_id_seq     to service_role;
grant usage, select on sequence skill_join_attempts_id_seq to service_role;

-- Fortschritt löschen: PROGRESS_TABLES in api/_utils.js
grant select, insert, update, delete on game_state                   to service_role;
grant select, insert, update, delete on wallets                      to service_role;
grant select, insert, update, delete on user_collectibles            to service_role;
grant select, insert, update, delete on user_unlocked_games          to service_role;
grant select, insert, update, delete on game_highscores              to service_role;
grant select, insert, update, delete on user_legi_grants             to service_role;
grant select, insert, update, delete on cluster_bonus_grants         to service_role;
grant select, insert, update, delete on user_bonbon_milestone_grants to service_role;
grant select, insert, update, delete on bonbon_daily_claims          to service_role;
grant select, insert, update, delete on user_legi_task_gifts         to service_role;
