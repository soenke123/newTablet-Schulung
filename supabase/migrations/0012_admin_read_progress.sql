-- ══════════════════════════════════════════════════════════════
-- Migration 0012 — Admin darf Fortschritts-Daten anderer User lesen
-- ══════════════════════════════════════════════════════════════
-- Für den Admin-Panel-User-Tab („Fortschritt"-Ansicht) müssen
-- Admins game_state / wallets / user_collectibles / user_unlocked_games
-- ALLER User ihrer Schule lesen können. Aktuell haben diese Tabellen
-- nur eine "user_id = auth.uid()"-Policy → Admin sieht nichts.
--
-- Wir ergänzen zusätzliche SELECT-Policies mit is_admin()-Bedingung.
-- Die bestehenden Policies bleiben unverändert — jeder User sieht
-- weiterhin seine eigenen Daten wie gehabt.
--
-- Hinweis: Schul-Isolation wird aktuell NICHT über RLS erzwungen
-- (profiles_select_own erlaubt Admins bereits alle Profile).
-- Solange nur eine Schule läuft, ist das ok. Mehrschul-Härtung
-- kommt in eigener Migration wenn zweiter Mandant kommt.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- game_state
-- ─────────────────────────────────────────────────────────────
create policy gs_select_admin on game_state
  for select using (is_admin());


-- ─────────────────────────────────────────────────────────────
-- wallets
-- ─────────────────────────────────────────────────────────────
create policy wallets_select_admin on wallets
  for select using (is_admin());


-- ─────────────────────────────────────────────────────────────
-- user_collectibles
-- ─────────────────────────────────────────────────────────────
create policy uc_select_admin on user_collectibles
  for select using (is_admin());


-- ─────────────────────────────────────────────────────────────
-- user_unlocked_games
-- ─────────────────────────────────────────────────────────────
create policy uug_select_admin on user_unlocked_games
  for select using (is_admin());
