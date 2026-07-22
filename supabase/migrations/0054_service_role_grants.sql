-- ══════════════════════════════════════════════════════════════
-- Migration 0054 — service_role-Grants für Admin-APIs
-- ══════════════════════════════════════════════════════════════
-- Migration 0002 grantet nur `select, insert` an service_role auf
-- profiles. Meine neuen APIs (`admin_promote_user`,
-- `admin_move_user_school`) machen aber `UPDATE profiles` via
-- service_role → landen bei `permission denied for table profiles`,
-- weil PostgREST die aktuelle Role auf service_role setzt und diese
-- keine UPDATE-Berechtigung hat.
--
-- Zusätzlich: Punkt 4 der User-Rückmeldung — beim Promoten eines
-- normalen Users zum Admin sollen Fortschrittsdaten gelöscht werden.
-- Dafür brauchen wir service_role-DELETE auf allen betroffenen
-- Fortschritts-Tabellen.
--
-- Idempotent: GRANT ist idempotent von Haus aus.
-- ══════════════════════════════════════════════════════════════


-- profiles: update für Rollen-Wechsel und Schul-Verschiebung
grant update, delete on profiles to service_role;


-- Fortschritts-Tabellen: delete für den Reset beim Admin-Werden
grant delete on wallets                       to service_role;
grant delete on game_state                    to service_role;
grant delete on user_collectibles             to service_role;
grant delete on user_unlocked_games           to service_role;
grant delete on game_highscores               to service_role;
grant delete on user_legi_grants              to service_role;
grant delete on cluster_bonus_grants          to service_role;
grant delete on user_bonbon_milestone_grants  to service_role;
grant delete on bonbon_daily_claims           to service_role;
grant delete on user_legi_task_gifts          to service_role;

-- SELECT ebenfalls durchgängig — die API prüft vor dem Delete
grant select on wallets                       to service_role;
grant select on game_state                    to service_role;
grant select on user_collectibles             to service_role;
grant select on user_unlocked_games           to service_role;
grant select on game_highscores               to service_role;
grant select on user_legi_grants              to service_role;
grant select on cluster_bonus_grants          to service_role;
grant select on user_bonbon_milestone_grants  to service_role;
grant select on bonbon_daily_claims           to service_role;
grant select on user_legi_task_gifts          to service_role;
