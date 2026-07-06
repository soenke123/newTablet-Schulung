-- ══════════════════════════════════════════════════════════════
-- Migration 0006 — Admin-Grants nachziehen
-- ══════════════════════════════════════════════════════════════
-- Die RLS-Policies in 0002 erlauben Admins Writes auf clusters
-- und profiles. Aber Postgres prüft ZUERST die role-level GRANTs
-- — ohne die kommt die RLS gar nicht zum Zug und der Client
-- kriegt 403 zurück ("permission denied").
--
-- Wir gewähren INSERT/UPDATE auf Table-Level für `authenticated`.
-- Die RLS-Policies `clusters_admin_write` und
-- `profiles_admin_update` blocken weiterhin alle Nicht-Admins.
-- ══════════════════════════════════════════════════════════════

grant insert, update on clusters to authenticated;
grant update           on profiles to authenticated;
