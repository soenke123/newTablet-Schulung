---
name: Hub-State-Mutation immer via saveGameData
description: Änderungen an einem Spielplatz (creature/growth) im Hub müssen saveGameData nutzen, nicht saveAllData — sonst kein Server-Sync
type: feedback
---

Änderungen an `allData[gameId]` (`creature`, `growth`, `coins`, etc.) im Hub (`GameHub/script.js`) müssen über `saveGameData(gameId, allData[gameId])` gespeichert werden, NICHT über `saveAllData(allData)`.

**Why:** `saveAllData` schreibt nur in localStorage. `saveGameData` schreibt lokal PLUS setzt den `_pending[gameId]`-Dirty-Marker und triggert bei aktiver Session sofort `syncGameStateToServer` — der einzige Weg wie Zustandsänderungen auf den Supabase-Server kommen. Vorheriger Bug: „Stein der Vollendung" hat `growth = GROWTH_S6` gesetzt, aber saveAllData verwendet → nach Reload/Cross-Device war die Änderung weg. Gleiches Problem bei releaseCreature und applyBackupSwap.

**How to apply:** In jedem Hub-Code der `allData[gameId].xxx = ...` schreibt, danach `saveGameData(gameId, allData[gameId])` aufrufen. `saveAllData` nur für Batch-Migrationen oder Fälle wo Server-Sync explizit unerwünscht ist (kaum ein Fall). Kommentar-Marker im Code: `// saveGameData statt saveAllData: triggert Server-Sync via sync_game_state.`
