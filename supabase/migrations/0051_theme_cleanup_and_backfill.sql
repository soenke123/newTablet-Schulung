-- ══════════════════════════════════════════════════════════════
-- Migration 0051 — Themes säubern + aus seenCreatures rekonstruieren
-- ══════════════════════════════════════════════════════════════
-- Bug: In der Übergangsphase zu Migration 0050 hat der Legacy-
-- Backfill aus localStorage (lernwelt_theme_unlock_order) Cross-
-- Account-Contamination verursacht — der Key ist browser-weit,
-- nicht per-User. Sobald sich in einem Browser jemals ein Account
-- mit gemaxeden Legis eingeloggt hatte, blieben die Theme-IDs im
-- localStorage. Der nächste Login (anderer Account) hat sie in
-- sein sd.unlockedThemes reingemergt und zum Server gepusht.
--
-- Fix:
--   1) sd.unlockedThemes bei allen Usern auf leeren Array setzen
--      (wischt kontaminierte Themes weg).
--   2) sd.activeTheme auf null setzen — falls das kontaminierte
--      Wahl war, resolved der Client beim Boot auf 'default'.
--   3) Rekonstruiere unlockedThemes aus sd.seenCreatures[creature]
--      >= 5 (= Kreatur war je auf max Stage). Für die 3 Katzen-
--      Themes zusätzlich variant-Match aus user_legi_path.
--
-- Der Client-Live-Check füllt aktuell besessene Themes beim
-- nächsten Boot ohnehin nach — die seenCreatures-Rekonstruktion
-- rettet zusätzlich User, die je eine Legi hatten und sie
-- inzwischen freigelassen haben.
--
-- Basis: Migration 0050 (Theme-Felder in shop_state).
-- ══════════════════════════════════════════════════════════════


update user_collectibles uc
set    value = value
       || jsonb_build_object(
         'activeTheme',    null,
         'unlockedThemes', (
           select coalesce(jsonb_agg(theme_id order by theme_id), '[]'::jsonb)
           from (
             -- ── Klassische Legendaries: Kreatur je auf max Stage (5) gesehen
             select 'pfau'::text as theme_id
             where coalesce(((uc.value->'seenCreatures')->>'pfau')::int, -1) >= 5
             union all
             select 'atari'
             where coalesce(((uc.value->'seenCreatures')->>'robot')::int, -1) >= 5
             union all
             select 'chindrache'
             where coalesce(((uc.value->'seenCreatures')->>'chinDrache')::int, -1) >= 5
             union all
             select 'schnabeltier'
             where coalesce(((uc.value->'seenCreatures')->>'schnabeltier')::int, -1) >= 5

             -- ── Einhornkatze-Themes: max Stage + passende Variante
             --    (variant liegt in user_legi_path pro (user, cluster);
             --     mehrere Cluster-Läufe = mehrere Varianten möglich,
             --     alle jeweils zutreffenden Themes werden freigeschaltet)
             union all
             select 'overvolt'
             where coalesce(((uc.value->'seenCreatures')->>'einhornkatze')::int, -1) >= 5
               and exists (
                 select 1 from user_legi_path ulp
                 where ulp.user_id = uc.user_id and ulp.variant = 'dark'
               )
             union all
             select 'solaris'
             where coalesce(((uc.value->'seenCreatures')->>'einhornkatze')::int, -1) >= 5
               and exists (
                 select 1 from user_legi_path ulp
                 where ulp.user_id = uc.user_id and ulp.variant = 'light'
               )
             union all
             select 'bubblegum'
             where coalesce(((uc.value->'seenCreatures')->>'einhornkatze')::int, -1) >= 5
               and exists (
                 select 1 from user_legi_path ulp
                 where ulp.user_id = uc.user_id and ulp.variant = 'rainbow'
               )
           ) x
         )
       ),
       updated_at = now()
where  key = 'shop_state';
