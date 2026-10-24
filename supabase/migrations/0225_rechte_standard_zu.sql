-- ══════════════════════════════════════════════════════════════
-- Migration 0225 — Neue Funktionen sind standardmäßig zu
-- ══════════════════════════════════════════════════════════════
-- Postgres erlaubt jede neue Funktion erst einmal allen (PUBLIC),
-- Supabase gibt anon/authenticated zusätzlich Standardrechte. Die
-- Migrationen schließen das bisher von Hand mit
--   revoke all on function … from public;  grant execute … to …;
-- Wo das fehlte, war eine interne Hilfsfunktion von außen über
-- /rest/v1/rpc/… aufrufbar. So bei:
--   ks_ensure_board(uuid), ks_ensure_player(uuid, uuid),
--   ks_owned_room(text)   (0174/0175, security definer, kein revoke)
--   clash_fire_teams(uuid) (0125/0126, ausdrücklich an anon vergeben)
-- Geringes Risiko (man braucht UUIDs), aber es ist genau der Fehler,
-- der bei einer heikleren Funktion teuer würde.
--
-- Ab jetzt:
--   1) Standardrechte: neue Funktionen in public darf niemand außer
--      dem Besitzer ausführen. Eine neue RPC braucht ein
--      ausdrückliches `grant execute … to anon/authenticated`.
--      ACHTUNG auch für Hilfsfunktionen, die eine Policy oder eine
--      security-INVOKER-Funktion aufruft — die laufen mit den Rechten
--      des Aufrufers und brauchen deshalb ebenfalls ein grant.
--   2) Die vier internen Funktionen oben sind zu. Alle Aufrufer sind
--      security definer und laufen als Besitzer — sie brauchen das
--      Recht nicht (geprüft über alle Funktionsrümpfe der Kette).
--
-- Wächter: supabase/tests/0225_rechte_waechter.mjs hält fest, welche
-- Tabellen, Spalten und security-definer-Funktionen anon und
-- authenticated erreichen. Jede neue Freigabe muss dort bewusst
-- eingetragen werden, sonst wird der Prüfstand rot.
-- ══════════════════════════════════════════════════════════════

-- 1) Standardrechte für künftige Funktionen (Rolle, die die
--    Migrationen ausführt = Besitzer der Funktionen).
--    Das Recht für PUBLIC ist ein GLOBALER Standard von Postgres; ein
--    „in schema public“ kann ihn nicht wegnehmen (Postgres-Doku zu
--    ALTER DEFAULT PRIVILEGES). Deshalb zwei Zeilen. Die globale gilt
--    auch für Funktionen, die diese Rolle in anderen Schemas anlegt —
--    wer später eine Erweiterung einspielt, deren Funktionen Nutzer
--    direkt brauchen, vergibt das Recht dort ausdrücklich.
alter default privileges
  revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- 2) Interne Helfer schließen
revoke all on function ks_ensure_board(uuid)        from public, anon, authenticated;
revoke all on function ks_ensure_player(uuid, uuid) from public, anon, authenticated;
revoke all on function ks_owned_room(text)          from public, anon, authenticated;
revoke all on function clash_fire_teams(uuid)       from public, anon, authenticated;
