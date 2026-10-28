/* ══════════════════════════════════════════════════════════════
   avatars.js — Katalog + Unlock-/NEW-Ableitung für Profilbilder
   ══════════════════════════════════════════════════════════════
   Wird auf Landing (index.html), GameHub und profil.html geladen.

   Zwei Welten (AVATAR_WORLDS), im Picker links umschaltbar:
     gamehub   → Eier + Kreaturen aus dem GameHub (Ordner avatare/)
     mpskills  → Bilder aus einzelnen Skills (Ordner „avatare MPSkills/<Skill>/“),
                 je Skill eine Gruppe. Wie man sie freischaltet, regelt jeder
                 Skill selbst — siehe MPS_UNLOCKERS unten.

   NEUER SKILL MIT AVATAREN:
     1) Bilder nach „avatare MPSkills/<Ordner>/“ legen (256×256, *_avatar.png)
     2) Gruppe in MPS_GROUPS eintragen (id 'mps_<skill-id>', folder, label)
     3) Bilder in MPS_CATALOG eintragen
     4) Freischalt-Regel: entscheidet der Server (Sieg o. Ä.), schreibt er
        in mps_avatar_unlocks (Migration 0214, Beispiel Kingdoms of Mathoria)
        — der Client lädt das mit loadMpskillsUnlocks(). Reine Client-Regeln
        gehen in MPS_UNLOCKERS. Den Satz für den Picker in MPS_GROUPS.hint.

   Bild-Katalog:
     Eier              → group 'egg',  immer freigeschaltet
     Normal-Kreaturen  → group 'normal'
     Rar-Kreaturen     → group 'rar'
     Epic-Kreaturen    → group 'epic'
     Legi-Kreaturen    → group 'legi'

     Jede Kreatur hat mehrere Stufen (baby / mid / adult / vollendet)
     mit unterschiedlichen Nummern (Ente hat 2 statt 3, Schnecken-
     drache hat 5 statt 4 Bilder).

   Unlock-Regel:
     - Alle Eier: immer verfügbar
     - Kreatur X, Stufe N: verfügbar wenn seenCreatures[X_internal] >= N-1
       (getGrowthStage in creatures.js liefert 0-indizierte Stufen,
        Dateinamen sind 1-indiziert → daher N-1).

   Quelle für Unlocks: shopData.seenCreatures aus dem GameHub-
   localStorage (`lernwelt_shop_v1`, base64 + Prüfsummen-Format).
   Diese Datei kann das Format eigenständig lesen — die Landing und
   profil.html brauchen den GameHub-Code nicht.

   Öffentliche API:
     window.AVATARS
     window.AVATAR_WORLDS               — [{id, label}] linke Leiste im Picker
     window.AVATAR_GROUPS               — [{id, world, label}] in Tab-Reihenfolge
     window.DEFAULT_AVATAR_ID           — 'default'
     window.loadMpskillsUnlocks()       — Promise; holt mps_my_avatars() vom Server
     window.getAvatarById(id)
     window.getPickerTiles(group, unlockedSet) — Kacheln für den Picker:
                                          [{base, gold|null, both, show}] (Gold ohne eigene Kachel)
     window.getAvatarUrl(id, basePath)
     window.getSeenCreatures()          — {creatureId: maxStageIdx}
     window.computeUnlockedAvatarIds()  — Set<avatarId>
     window.getUnlockTimestamps()       — {avatarId: unixMs}
     window.refreshUnlockTimestamps(unlockedSet) — merged new unlocks in
     window.getNewAvatarIds(seenAtISO)  — Set<avatarId> (neu seit seenAtISO)
     window.hasAnyNewAvatars(seenAtISO) — bool
     window.getNewAvatarWorlds(seenAtISO) — {gamehub, mpskills}
     window.applyNewAvatarDot(el, seenAtISO) — .new-dot: rot GameHub, blau (.is-mps) nur MPSkills
     Event 'lernwelt:avatars-loaded'    — MPSkills-Freischaltungen sind da
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const DEFAULT_AVATAR_ID = 'default';
  const SHOP_KEY          = 'lernwelt_shop_v1';   // muss zu creatures.js passen
  const GAME_STATE_KEY    = 'lernwelt_v3';        // muss zu creatures.js:STORAGE_KEY passen
  const UNLOCKS_KEY       = 'lernwelt_avatar_unlocks';

  const AVATAR_WORLDS = [
    { id: 'gamehub',  label: 'GameHub'  },
    { id: 'mpskills', label: 'MPSkills' }
  ];

  /* MPSkills: eine Gruppe je Skill. id = 'mps_' + Skill-id aus
     MPSkills/tools.js, folder = Unterordner von „avatare MPSkills/“
     (so geschrieben, wie er auf der Platte heißt). */
  const MPS_GROUPS = [
    { id: 'mps_knowledgestack', skill: 'knowledgestack', folder: 'KnowlegeStack',        label: 'Knowledge Stack', gold: true,
      hint: 'Spiel ein Quiz bis zum Ende — dann bekommst du das Wesen, mit dem du gespielt hast. Wer Platz 1 holt, bekommt es zusätzlich in Gold. Das klappt nur, wenn du beim Spielen angemeldet bist.' },
    { id: 'mps_wordisland',     skill: 'wordisland',     folder: 'Wordisland',           label: 'Wordisland' },
    { id: 'mps_clash-of-math',  skill: 'clash-of-math',  folder: 'Kingdoms of Mathoria', label: 'Kingdoms of Mathoria',
      hint: 'Gewinne mit deinem Team eine Partie — dann bekommst du das Bild deines Volkes. Das klappt nur, wenn du beim Spielen angemeldet bist.' },
    { id: 'mps_wildclusters',   skill: 'wildclusters',   folder: 'Wildclusters',         label: 'Wild Clusters',
      hint: 'Sobald eure Lehrkraft die Auflösung (Phase 3) startet, bekommst du alle Tiere. Das klappt nur, wenn du angemeldet bist.' },
    { id: 'mps_balance',        skill: 'balance',        folder: 'Balance of Nature',    label: 'Balance of Nature',
      hint: 'Spiel ein Szenario, das deine Lehrkraft mit der Klasse teilt — dann bekommst du die Figuren, die darin vorkommen. Das klappt nur, wenn du angemeldet bist.' },
    { id: 'mps_derby',          skill: 'derby',          folder: 'Definitions Derby',    label: 'Definitions Derby',
      hint: 'Lass auf der Insel deine Wesen schlüpfen und wachsen — jede Form, die eines deiner Wesen erreicht, kannst du als Profilbild nehmen. Das klappt nur, wenn du angemeldet bist.' }
  ];

  const AVATAR_GROUPS = [
    { id: 'egg',    world: 'gamehub', label: 'Eier'   },
    { id: 'normal', world: 'gamehub', label: 'Normal' },
    { id: 'rar',    world: 'gamehub', label: 'Rar'    },
    { id: 'epic',   world: 'gamehub', label: 'Epic'   },
    { id: 'legi',   world: 'gamehub', label: 'Legi'   },
    ...MPS_GROUPS.map(g => ({ id: g.id, world: 'mpskills', label: g.label, hint: g.hint || '' }))
  ];

  /* ─── Katalog ─────────────────────────────────────────────────
     Kreatur-IDs müssen exakt zu shopData.seenCreatures-Keys passen
     (siehe GameHub/creatures.js RARE/EPIC/LEGENDARY_CREATURES).
     Stufe = 1-indiziert wie im Dateinamen; getGrowthStage() im Hub
     liefert 0-indiziert → beim Unlock-Check auf N-1 vergleichen.
     Label = Kreatur-Name (der Anzeige-Kontext im Picker macht die Stufe klar). */
  const AVATARS = [
    // ─── Eier (immer freigeschaltet) ─────────────────────────
    { id: 'default', group: 'egg', file: 'ei_avatar default.png', label: 'Sprenkelei' },
    { id: 'ei1',     group: 'egg', file: 'ei_avatar (1).png',     label: 'Wachtelei' },
    { id: 'ei2',     group: 'egg', file: 'ei_avatar (2).png',     label: 'Flickenei' },
    { id: 'ei3',     group: 'egg', file: 'ei_avatar (3).png',     label: 'Herbstei' },
    { id: 'ei4',     group: 'egg', file: 'ei_avatar (4).png',     label: 'Osterei' },
    { id: 'ei5',     group: 'egg', file: 'ei_avatar (5).png',     label: 'Kristallei' },

    // ─── Normal ──────────────────────────────────────────────
    { id: 'snail_1',  group: 'normal', creature: 'snail', stage: 1, file: 'Schnecke1_avatar.png', label: 'Schnecke Baby' },
    { id: 'snail_3',  group: 'normal', creature: 'snail', stage: 3, file: 'Schnecke3_avatar.png', label: 'Schnecke Jung' },
    { id: 'snail_5',  group: 'normal', creature: 'snail', stage: 5, file: 'Schnecke5_avatar.png', label: 'Schnecke Groß' },
    { id: 'snail_6',  group: 'normal', creature: 'snail', stage: 6, file: 'Schnecke6_avatar.png', label: 'Schnecke Vollendet' },

    { id: 'fish_1',   group: 'normal', creature: 'fish',  stage: 1, file: 'Fisch1_avatar.png', label: 'Fisch Baby' },
    { id: 'fish_3',   group: 'normal', creature: 'fish',  stage: 3, file: 'Fisch3_avatar.png', label: 'Fisch Jung' },
    { id: 'fish_5',   group: 'normal', creature: 'fish',  stage: 5, file: 'Fisch5_avatar.png', label: 'Fisch Groß' },
    { id: 'fish_6',   group: 'normal', creature: 'fish',  stage: 6, file: 'Fisch6_avatar.png', label: 'Fisch Vollendet' },

    { id: 'huhn_1',   group: 'normal', creature: 'chicken', stage: 1, file: 'huhn1_avatar.png', label: 'Huhn Baby' },
    { id: 'huhn_4',   group: 'normal', creature: 'chicken', stage: 4, file: 'huhn4_avatar.png', label: 'Huhn Jung' },
    { id: 'huhn_5',   group: 'normal', creature: 'chicken', stage: 5, file: 'huhn5_avatar.png', label: 'Huhn Groß' },
    { id: 'huhn_6',   group: 'normal', creature: 'chicken', stage: 6, file: 'Huhn6_avatar.png', label: 'Huhn Vollendet' },

    { id: 'sal_1',    group: 'normal', creature: 'salamander', stage: 1, file: 'Salamander1_avatar.png', label: 'Salamander Baby' },
    { id: 'sal_4',    group: 'normal', creature: 'salamander', stage: 4, file: 'Salamander4_avatar.png', label: 'Salamander Jung' },
    { id: 'sal_5',    group: 'normal', creature: 'salamander', stage: 5, file: 'Salamander5_avatar.png', label: 'Salamander Groß' },
    { id: 'sal_6',    group: 'normal', creature: 'salamander', stage: 6, file: 'Salamander6_avatar.png', label: 'Salamander Vollendet' },

    { id: 'eule_1',   group: 'normal', creature: 'falkeneule', stage: 1, file: 'Falkeneule1_avatar.png', label: 'Falkeneule Baby' },
    { id: 'eule_3',   group: 'normal', creature: 'falkeneule', stage: 3, file: 'Falkeneule3_avatar.png', label: 'Falkeneule Jung' },
    { id: 'eule_5',   group: 'normal', creature: 'falkeneule', stage: 5, file: 'Falkeneule5_avatar.png', label: 'Falkeneule Groß' },
    { id: 'eule_6',   group: 'normal', creature: 'falkeneule', stage: 6, file: 'Falkeneule6_avatar.png', label: 'Falkeneule Vollendet' },

    { id: 'trice_1',  group: 'normal', creature: 'triceratops', stage: 1, file: 'Triceratops1_avatar.png', label: 'Triceratops Baby' },
    { id: 'trice_3',  group: 'normal', creature: 'triceratops', stage: 3, file: 'Triceratops3_avatar.png', label: 'Triceratops Jung' },
    { id: 'trice_5',  group: 'normal', creature: 'triceratops', stage: 5, file: 'Triceratops5_avatar.png', label: 'Triceratops Groß' },
    { id: 'trice_6',  group: 'normal', creature: 'triceratops', stage: 6, file: 'Triceratops6_avatar.png', label: 'Triceratops Vollendet' },

    { id: 'dragon_1', group: 'normal', creature: 'dragon', stage: 1, file: 'drache1_avatar.png', label: 'Drache Baby' },
    { id: 'dragon_3', group: 'normal', creature: 'dragon', stage: 3, file: 'drache3_avatar.png', label: 'Drache Jung' },
    { id: 'dragon_5', group: 'normal', creature: 'dragon', stage: 5, file: 'drache5_avatar.png', label: 'Drache Groß' },
    { id: 'dragon_6', group: 'normal', creature: 'dragon', stage: 6, file: 'Drache6_avatar.png', label: 'Drache Vollendet' },

    { id: 'frosch_1', group: 'normal', creature: 'frosch', stage: 1, file: 'Frosch1_avatar.png', label: 'Frosch Baby' },
    { id: 'frosch_3', group: 'normal', creature: 'frosch', stage: 3, file: 'Frosch3_avatar.png', label: 'Frosch Jung' },
    { id: 'frosch_5', group: 'normal', creature: 'frosch', stage: 5, file: 'Frosch5_avatar.png', label: 'Frosch Groß' },
    { id: 'frosch_6', group: 'normal', creature: 'frosch', stage: 6, file: 'Frosch6_avatar.png', label: 'Frosch Vollendet' },

    { id: 'pinguin_1',group: 'normal', creature: 'pinguin', stage: 1, file: 'Pinguin1_avatar.png', label: 'Pinguin Baby' },
    { id: 'pinguin_3',group: 'normal', creature: 'pinguin', stage: 3, file: 'Pinguin3_avatar.png', label: 'Pinguin Jung' },
    { id: 'pinguin_5',group: 'normal', creature: 'pinguin', stage: 5, file: 'Pinguin5_avatar.png', label: 'Pinguin Groß' },
    { id: 'pinguin_6',group: 'normal', creature: 'pinguin', stage: 6, file: 'Pinguin6_avatar.png', label: 'Pinguin Vollendet' },

    { id: 'raptor_1', group: 'normal', creature: 'raptor', stage: 1, file: 'Raptor1_avatar.png', label: 'Raptor Baby' },
    { id: 'raptor_4', group: 'normal', creature: 'raptor', stage: 4, file: 'Raptor4_avatar.png', label: 'Raptor Jung' },
    { id: 'raptor_5', group: 'normal', creature: 'raptor', stage: 5, file: 'Raptor5_avatar.png', label: 'Raptor Groß' },
    { id: 'raptor_6', group: 'normal', creature: 'raptor', stage: 6, file: 'Raptor6_avatar.png', label: 'Raptor Vollendet' },

    // ─── Rar ─────────────────────────────────────────────────
    { id: 'biene_1',  group: 'rar', creature: 'biene', stage: 1, file: 'Biene1_avatar.png', label: 'Biene Baby' },
    { id: 'biene_3',  group: 'rar', creature: 'biene', stage: 3, file: 'Biene3_avatar.png', label: 'Biene Jung' },
    { id: 'biene_5',  group: 'rar', creature: 'biene', stage: 5, file: 'Biene5_avatar.png', label: 'Biene Groß' },
    { id: 'biene_6',  group: 'rar', creature: 'biene', stage: 6, file: 'Biene6_avatar.png', label: 'Biene Vollendet' },

    { id: 'okto_1',   group: 'rar', creature: 'oktopus', stage: 1, file: 'Oktopus1_avatar.png', label: 'Oktopus Baby' },
    { id: 'okto_3',   group: 'rar', creature: 'oktopus', stage: 3, file: 'Oktopus3_avatar.png', label: 'Oktopus Jung' },
    { id: 'okto_5',   group: 'rar', creature: 'oktopus', stage: 5, file: 'Oktopus5_avatar.png', label: 'Oktopus Groß' },
    { id: 'okto_6',   group: 'rar', creature: 'oktopus', stage: 6, file: 'Oktopus6_avatar.png', label: 'Oktopus Vollendet' },

    { id: 'ente_1',   group: 'rar', creature: 'ente', stage: 1, file: 'Ente1_avatar.png', label: 'Ente Baby' },
    { id: 'ente_2',   group: 'rar', creature: 'ente', stage: 2, file: 'Ente2_avatar.png', label: 'Ente Jung' },
    { id: 'ente_5',   group: 'rar', creature: 'ente', stage: 5, file: 'Ente5_avatar.png', label: 'Ente Groß' },
    { id: 'ente_6',   group: 'rar', creature: 'ente', stage: 6, file: 'Ente6_avatar.png', label: 'Ente Vollendet' },

    // ─── Epic ────────────────────────────────────────────────
    { id: 'sd_1',     group: 'epic', creature: 'snaildragon', stage: 1, file: 'Schneckendrache1_avatar.png', label: 'Schneckendrache Baby' },
    { id: 'sd_2',     group: 'epic', creature: 'snaildragon', stage: 2, file: 'Schneckendrache2_avatar.png', label: 'Schneckendrache Jung' },
    { id: 'sd_4',     group: 'epic', creature: 'snaildragon', stage: 4, file: 'Schneckendrache4_avatar.png', label: 'Schneckendrache Mittel' },
    { id: 'sd_5',     group: 'epic', creature: 'snaildragon', stage: 5, file: 'Schneckendrache5_avatar.png', label: 'Schneckendrache Groß' },
    { id: 'sd_6',     group: 'epic', creature: 'snaildragon', stage: 6, file: 'Schneckendrache6_avatar.png', label: 'Schneckendrache Vollendet' },

    { id: 'butt_1',   group: 'epic', creature: 'butterfly', stage: 1, file: 'Schmetterling1_avatar.png', label: 'Schmetterling Baby' },
    { id: 'butt_3',   group: 'epic', creature: 'butterfly', stage: 3, file: 'Schmetterling3_avatar.png', label: 'Schmetterling Jung' },
    { id: 'butt_5',   group: 'epic', creature: 'butterfly', stage: 5, file: 'Schmetterling5_avatar.png', label: 'Schmetterling Groß' },
    { id: 'butt_6',   group: 'epic', creature: 'butterfly', stage: 6, file: 'Schmetterling6_avatar.png', label: 'Schmetterling Vollendet' },

    { id: 'turtle_1', group: 'epic', creature: 'turtle', stage: 1, file: 'Schildkröte1_avatar.png', label: 'Schildkröte Baby' },
    { id: 'turtle_3', group: 'epic', creature: 'turtle', stage: 3, file: 'Schildkröte3_avatar.png', label: 'Schildkröte Jung' },
    { id: 'turtle_5', group: 'epic', creature: 'turtle', stage: 5, file: 'Schildkröte5_avatar.png', label: 'Schildkröte Groß' },
    { id: 'turtle_6', group: 'epic', creature: 'turtle', stage: 6, file: 'Schildkröte6_avatar.png', label: 'Schildkröte Vollendet' },

    { id: 'cham_1',   group: 'epic', creature: 'chamaeleon', stage: 1, file: 'Chamäleon1_avatar.png', label: 'Chamäleon Baby' },
    { id: 'cham_3',   group: 'epic', creature: 'chamaeleon', stage: 3, file: 'Chamäleon3_avatar.png', label: 'Chamäleon Jung' },
    { id: 'cham_5',   group: 'epic', creature: 'chamaeleon', stage: 5, file: 'Chamäleon5_avatar.png', label: 'Chamäleon Groß' },
    { id: 'cham_6',   group: 'epic', creature: 'chamaeleon', stage: 6, file: 'Chamäleon6_avatar.png', label: 'Chamäleon Vollendet' },

    // ─── Legi ────────────────────────────────────────────────
    { id: 'ai_1',     group: 'legi', creature: 'robot', stage: 1, file: 'AI1_avatar.png', label: 'Atari-1337 Baby' },
    { id: 'ai_3',     group: 'legi', creature: 'robot', stage: 3, file: 'AI3_avatar.png', label: 'Atari-1337 Jung' },
    { id: 'ai_5',     group: 'legi', creature: 'robot', stage: 5, file: 'AI5_avatar.png', label: 'Atari-1337 Groß' },
    { id: 'ai_6',     group: 'legi', creature: 'robot', stage: 6, file: 'AI6_avatar.png', label: 'Atari-1337 Vollendet' },

    { id: 'pfau_1',   group: 'legi', creature: 'pfau', stage: 1, file: 'Pfau1_avatar.png', label: 'Pfau Baby' },
    { id: 'pfau_2',   group: 'legi', creature: 'pfau', stage: 2, file: 'Pfau2_avatar.png', label: 'Pfau Jung' },
    { id: 'pfau_5',   group: 'legi', creature: 'pfau', stage: 5, file: 'Pfau5_avatar.png', label: 'Pfau Groß' },
    { id: 'pfau_6',   group: 'legi', creature: 'pfau', stage: 6, file: 'Pfau6_avatar.png', label: 'Pfau Vollendet' },

    { id: 'cd_1',     group: 'legi', creature: 'chinDrache', stage: 1, file: 'chinDrache1_avatar.png', label: 'Chin. Drache Baby' },
    { id: 'cd_3',     group: 'legi', creature: 'chinDrache', stage: 3, file: 'chinDrache3_avatar.png', label: 'Chin. Drache Jung' },
    { id: 'cd_5',     group: 'legi', creature: 'chinDrache', stage: 5, file: 'chinDrache5_avatar.png', label: 'Chin. Drache Groß' },
    { id: 'cd_6',     group: 'legi', creature: 'chinDrache', stage: 6, file: 'ChinDrache6_avatar.png', label: 'Chin. Drache Vollendet' },

    { id: 'st_1',     group: 'legi', creature: 'schnabeltier', stage: 1, file: 'Schnabeltier1_avatar.png', label: 'Schnabeltier Baby' },
    { id: 'st_2',     group: 'legi', creature: 'schnabeltier', stage: 2, file: 'Schnabeltier2_avatar.png', label: 'Schnabeltier Jung' },
    { id: 'st_5',     group: 'legi', creature: 'schnabeltier', stage: 5, file: 'Schnabeltier5_avatar.png', label: 'Schnabeltier Groß' },
    { id: 'st_6',     group: 'legi', creature: 'schnabeltier', stage: 6, file: 'Schnabeltier6_avatar.png', label: 'Schnabeltier Vollendet' },

    // ─── Season 3 – Normal ───────────────────────────────────
    { id: 'krabbe_1', group: 'normal', creature: 'krabbe', stage: 1, file: 'Krabbe1_avatar.png', label: 'Krabbe Baby' },
    { id: 'krabbe_2', group: 'normal', creature: 'krabbe', stage: 2, file: 'Krabbe2_avatar.png', label: 'Krabbe Klein' },
    { id: 'krabbe_5', group: 'normal', creature: 'krabbe', stage: 5, file: 'Krabbe5_avatar.png', label: 'Krabbe Groß' },
    { id: 'krabbe_6', group: 'normal', creature: 'krabbe', stage: 6, file: 'Krabbe6_avatar.png', label: 'Krabbe Vollendet' },

    { id: 'hai_1',    group: 'normal', creature: 'hai', stage: 1, file: 'Hai1_avatar.png', label: 'Hai Baby' },
    { id: 'hai_3',    group: 'normal', creature: 'hai', stage: 3, file: 'Hai3_avatar.png', label: 'Hai Jung' },
    { id: 'hai_5',    group: 'normal', creature: 'hai', stage: 5, file: 'Hai5_avatar.png', label: 'Hai Groß' },
    { id: 'hai_6',    group: 'normal', creature: 'hai', stage: 6, file: 'Hai6_avatar.png', label: 'Hai Vollendet' },

    // ─── Season 3 – Rar ──────────────────────────────────────
    { id: 'lib_1',    group: 'rar', creature: 'libelle', stage: 1, file: 'Liebelle1_avatar.png', label: 'Libelle Baby' },
    { id: 'lib_3',    group: 'rar', creature: 'libelle', stage: 3, file: 'Liebelle3_avatar.png', label: 'Libelle Jung' },
    { id: 'lib_5',    group: 'rar', creature: 'libelle', stage: 5, file: 'Liebelle5_avatar.png', label: 'Libelle Groß' },
    { id: 'lib_6',    group: 'rar', creature: 'libelle', stage: 6, file: 'Liebelle6_avatar.png', label: 'Libelle Vollendet' },

    // ─── Season 3 – Epic ─────────────────────────────────────
    { id: 'hippo_1',  group: 'epic', creature: 'hippogreif', stage: 1, file: 'Hypogreif1_avatar.png', label: 'Hippogreif Baby' },
    { id: 'hippo_3',  group: 'epic', creature: 'hippogreif', stage: 3, file: 'Hypogreif3_avatar.png', label: 'Hippogreif Jung' },
    { id: 'hippo_5',  group: 'epic', creature: 'hippogreif', stage: 5, file: 'Hypogreif5_avatar.png', label: 'Hippogreif Groß' },
    { id: 'hippo_6',  group: 'epic', creature: 'hippogreif', stage: 6, file: 'Hypogreif6_avatar.png', label: 'Hippogreif Vollendet' },

    // ─── Season 3 – Legi (pro-Stage Avatar, alle 6 Stufen) ───
    { id: 'ehk_1',    group: 'legi', creature: 'einhornkatze', stage: 1, file: 'Einhornkatze1_avatar.png', label: 'Einhornkatze Baby' },
    { id: 'ehk_2',    group: 'legi', creature: 'einhornkatze', stage: 2, file: 'Einhornkatze2_avatar.png', label: 'Einhornkatze Klein' },
    { id: 'ehk_3',    group: 'legi', creature: 'einhornkatze', stage: 3, file: 'Einhornkatze3_avatar.png', label: 'Einhornkatze Jung' },
    { id: 'ehk_4',    group: 'legi', creature: 'einhornkatze', stage: 4, file: 'Einhornkatze4_avatar.png', label: 'Einhornkatze Ausgewachsen' },
    { id: 'ehk_5',       group: 'legi', creature: 'einhornkatze', stage: 5, variant: 'rainbow', file: 'Einhornkatze5_avatar.png',      label: 'Einhornkatze Groß (Regenbogen)' },
    { id: 'ehk_5_light', group: 'legi', creature: 'einhornkatze', stage: 5, variant: 'light',   file: 'Einhornkatze5Light_avatar.png', label: 'Einhornkatze Groß (Licht)' },
    { id: 'ehk_5_dark',  group: 'legi', creature: 'einhornkatze', stage: 5, variant: 'dark',    file: 'Einhornkatze5Dark_avatar.png',  label: 'Einhornkatze Groß (Nacht)' },
    { id: 'ehk_6',       group: 'legi', creature: 'einhornkatze', stage: 6, variant: 'rainbow', file: 'Einhornkatze6_avatar.png',      label: 'Einhornkatze Vollendet (Regenbogen)' },
    { id: 'ehk_6_light', group: 'legi', creature: 'einhornkatze', stage: 6, variant: 'light',   file: 'Einhornkatze6Light_avatar.png', label: 'Einhornkatze Vollendet (Licht)' },
    { id: 'ehk_6_dark',  group: 'legi', creature: 'einhornkatze', stage: 6, variant: 'dark',    file: 'Einhornkatze6Dark_avatar.png',  label: 'Einhornkatze Vollendet (Nacht)' }
  ];

  /* ─── MPSkills-Katalog ────────────────────────────────────────
     [id-Endung, Dateiname, Anzeigename] je Gruppe. Die volle id ist
     '<gruppe>_<endung>' — darf sich nie mehr ändern, sie steht in
     profiles.avatar_id. */
  const MPS_CATALOG = {
    mps_knowledgestack: [
      ['puddl',   '00_Puddl_avatar.png',   'Puddl'],
      ['spark',   '01_Spark_avatar.png',   'Spark'],
      ['plop',    '02_Plop_avatar.png',    'Plop'],
      ['bubbles', '03_Bubbles_avatar.png', 'Bubbles'],
      ['snooze',  '04_Snooze_avatar.png',  'Snooze'],
      ['beep',    '05_Beep_avatar.png',    'Beep'],
      ['chompy',  '06_Chompy_avatar.png',  'Chompy'],
      ['nubi',    '07_Nubi_avatar.png',    'Nubi'],
      ['zorp',    '08_Zorp_avatar.png',    'Zorp'],
      ['lotti',   '09_Lotti_avatar.png',   'Lotti'],
      ['grumbl',  '10_Grumbl_avatar.png',  'Grumbl'],
      ['mochi',   '11_Mochi_avatar.png',   'Mochi'],
      ['sprout',  '12_Sprout_avatar.png',  'Sprout'],
      ['bzz',     '13_Bzz_avatar.png',     'Bzz'],
      ['crunch',  '14_Crunch_avatar.png',  'Crunch'],
      ['tiki',    '15_Tiki_avatar.png',    'Tiki'],
      ['clawdy',  '16_Clawdy_avatar.png',  'Clawdy'],
      ['mimi',    '17_Mimi_avatar.png',    'Mimi'],
      ['fuzz',    '18_Fuzz_avatar.png',    'Fuzz'],
      ['snip',    '19_Snip_avatar.png',    'Snip'],
      ['boomer',  '20_Boomer_avatar.png',  'Boomer'],
      ['pebbl',   '21_Pebbl_avatar.png',   'Pebbl'],
      ['glitch',  '22_Glitch_avatar.png',  'Glitch'],
      ['cacti',   '23_Cacti_avatar.png',   'Cacti'],
      ['nacho',   '24_Nacho_avatar.png',   'Nacho'],
      ['pips',    '25_Pips_avatar.png',    'Pips'],
      ['waddl',   '26_Waddl_avatar.png',   'Waddl'],
      ['yoyo',    '27_Yoyo_avatar.png',    'Yoyo'],
      ['turbo',   '28_Turbo_avatar.png',   'Turbo'],
      ['lumi',    '29_Lumi_avatar.png',    'Lumi'],
      ['umbra',   '30_Umbra_avatar.png',   'Umbra'],
      ['grimjaw', '31_Grimjaw_avatar.png', 'Grimjaw'],
      ['astris',  '32_Astris_avatar.png',  'Astris'],
      ['arcana',  '33_Arcana_avatar.png',  'Arcana'],
      ['zephyr',  '34_Zephyr_avatar.png',  'Zephyr'],
      ['spindle', '35_Spindle_avatar.png', 'Spindle'],
      ['prisma',  '36_Prisma_avatar.png',  'Prisma'],
      ['plato',   '37_Plato_avatar.png',   'Plato'],
      ['kruemel', '38_Krümel_avatar.png',  'Krümel'],
      ['howl',    '39_Howl_avatar.png',    'Howl']
    ],
    // Namen der Völker wie TEAMS in tools/wordisland/tool.js, Stufe = Bildstufe der Figur
    mps_wordisland: [
      ['blue_1',    'blue 1 crew_avatar.png',    'Robo-Enten Stufe 1'],
      ['blue_4',    'blue 4 crew_avatar.png',    'Robo-Enten Stufe 4'],
      ['green_1',   'green 1 crew_avatar.png',   'Brokkoli-Giraffen Stufe 1'],
      ['green_4',   'green 4 crew_avatar.png',   'Brokkoli-Giraffen Stufe 4'],
      ['lila_1',    'lila 1 crew_avatar.png',    'Kosmische Katzen Stufe 1'],
      ['lila_4',    'lila 4 crew_avatar.png',    'Kosmische Katzen Stufe 4'],
      ['magenta_1', 'magenta 1 crew_avatar.png', 'Spuk-Einhorn Stufe 1'],
      ['magenta_4', 'magenta 4 crew_avatar.png', 'Spuk-Einhorn Stufe 4'],
      ['red_1',     'red 1 crew_avatar.png',     'Toast-Ritter Stufe 1'],
      ['red_4',     'red 4 crew_avatar.png',     'Toast-Ritter Stufe 4'],
      ['rosa_1',    'rosa 1 crew_avatar.png',    'Wolken-Piraten Stufe 1'],
      ['rosa_4',    'rosa 4 crew_avatar.png',    'Wolken-Piraten Stufe 4'],
      ['tuerkis_1', 'türkis 1 crew_avatar.png',  'Okto-Pferdchen Stufe 1'],
      ['tuerkis_4', 'türkis 4 crew_avatar.png',  'Okto-Pferdchen Stufe 4'],
      ['yellow_1',  'yellow 1 crew_avatar.png',  'Mal-Hasen Stufe 1'],
      ['yellow_4',  'yellow 4 crew_avatar.png',  'Mal-Hasen Stufe 4']
    ],
    // Namen der Völker wie FACTION_LABEL in tools/clash-of-math/tool.js
    'mps_clash-of-math': [
      ['blue',    'blue units_avatar.png',    'Robo-Enten'],
      ['green',   'green units_avatar.png',   'Brokkoli-Giraffen'],
      ['lila',    'lila units_avatar.png',    'Kosmische Katzen'],
      ['magenta', 'magenta units_avatar.png', 'Spuk-Einhorn'],
      ['red',     'red units_avatar.png',     'Toast-Ritter'],
      ['rosa',    'rosa units_avatar.png',    'Wolkenvogel-Piraten'],
      ['tuerkis', 'türkis units_avatar.png',  'Okto-Pferdchen'],
      ['yellow',  'yellow units_avatar.png',  'Mal-Hasen']
    ],
    mps_wildclusters: [
      ['barsch',     'Barsch_avatar.png',     'Barsch'],
      ['bussard',    'Busard_avatar.png',     'Bussard'],
      ['dachs',      'Dachs_avatar.png',      'Dachs'],
      ['ente',       'Ente_avatar.png',       'Ente'],
      ['fledermaus', 'Fledermaus_avatar.png', 'Fledermaus'],
      ['fuchs',      'Fuchs_avatar.png',      'Fuchs'],
      ['hecht',      'Hecht_avatar.png',      'Hecht'],
      ['igel',       'Igel_avatar.png',       'Igel'],
      ['kaninchen',  'Kaninchen_avatar.png',  'Kaninchen'],
      ['reh',        'Reh_avatar.png',        'Reh']
    ],
    mps_balance: [
      ['adler',      'adler_f_fliegend_avatar.png',   'Adler'],
      ['hirsch',     'hirsch_m_stehend_avatar.png',   'Hirsch'],
      ['wolf',       'wolf_m_stehend_avatar.png',     'Wolf'],
      ['laufvogel',  'laufvogel_m_gehend_avatar.png', 'Laufvogel'],
      ['jagdwild_1', 'jagdwild_1_avatar.png',         'Wildjägerin'],
      ['jagdwild_4', 'jagdwild_4_avatar.png',         'Wildjägerin'],
      ['jagdwild_6', 'jagdwild_6_avatar.png',         'Wildjägerin'],
      ['jagdwolf_1', 'jagdwolf_1_avatar.png',         'Wolfsjäger'],
      ['jagdwolf_3', 'jagdwolf_3_avatar.png',         'Wolfsjäger'],
      ['jagdwolf_4', 'jagdwolf_4_avatar.png',         'Wolfsjägerin'],
      ['sammeln_3',  'sammeln_3_avatar.png',          'Sammler'],
      ['villager',   'villager_11_avatar.png',        'Dorfbewohner']
    ],
    // Definitions Derby: jede Form der Insel-Wesen ab Baby (Endung = Name in
    // tools/DefinitionsDerby/wesen/, Porträts von Sönke). Frei wird eine Form,
    // sobald eines deiner Wesen sie erreicht (Migration 0236).
    mps_derby: [
      ['baby',    'baby_avatar.png',    'Flauschling'],
      ['k_a',     'k_a_avatar.png',     'Drachling'],
      ['k_b',     'k_b_avatar.png',     'Blattwicht'],
      ['m_a_a',   'm_a_a_avatar.png',   'Federkiemer'],
      ['m_a_b',   'm_a_b_avatar.png',   'Schildkrötchen'],
      ['m_b_a',   'm_b_a_avatar.png',   'Pummelvogel'],
      ['m_b_b',   'm_b_b_avatar.png',   'Blattmolch'],
      ['m_b_c',   'm_b_c_avatar.png',   'Wurzelwicht'],
      ['g_a_a_a', 'g_a_a_a_avatar.png', 'Stachelechse'],
      ['g_a_a_b', 'g_a_a_b_avatar.png', 'Wellendrache'],
      ['g_a_b_a', 'g_a_b_a_avatar.png', 'Moosschildkröte'],
      ['g_a_b_b', 'g_a_b_b_avatar.png', 'Riffschildkröte'],
      ['g_b_a_a', 'g_b_a_a_avatar.png', 'Federfalke'],
      ['g_b_a_b', 'g_b_a_b_avatar.png', 'Blattfee'],
      ['g_b_b_a', 'g_b_b_a_avatar.png', 'Rankenschlange'],
      ['g_b_b_b', 'g_b_b_b_avatar.png', 'Laubsaurier'],
      ['g_b_c',   'g_b_c_avatar.png',   'Buschgeist'],
      ['f_a_a_a', 'f_a_a_a_avatar.png', 'Baumrücken'],
      ['f_a_a_b', 'f_a_a_b_avatar.png', 'Seedrache'],
      ['f_a_b_a', 'f_a_b_a_avatar.png', 'Waldschildkröte'],
      ['f_a_b_b', 'f_a_b_b_avatar.png', 'Korallenschildkröte'],
      ['f_b_a_a', 'f_b_a_a_avatar.png', 'Kronenvogel'],
      ['f_b_a_b', 'f_b_a_b_avatar.png', 'Waldfee'],
      ['f_b_b_a', 'f_b_b_a_avatar.png', 'Blütenschlange'],
      ['f_b_b_b', 'f_b_b_b_avatar.png', 'Baumsaurier'],
      ['f_b_c',   'f_b_c_avatar.png',   'Baumriese']
    ]
  };
  /* Gruppen mit gold: true haben zu jedem Bild eine goldene Fassung
     (<id>_gold, Datei *_gold_avatar.png). Sie ist ein eigener Eintrag
     (goldOf → Grundbild, Grundbild.goldId → Gold), im Picker aber keine
     eigene Kachel: das Dreieck an der Kachel schaltet um. */
  for (const g of MPS_GROUPS) {
    for (const [key, file, label] of (MPS_CATALOG[g.id] || [])) {
      const base = { id: `${g.id}_${key}`, group: g.id, world: 'mpskills', skill: g.skill, folder: g.folder, file, label };
      AVATARS.push(base);
      if (!g.gold) continue;
      base.goldId = `${base.id}_gold`;
      AVATARS.push({ ...base, id: base.goldId, goldId: undefined, goldOf: base.id,
                     file: file.replace(/_avatar\.png$/, '_gold_avatar.png'), label: `${label} Gold` });
    }
  }
  for (const a of AVATARS) if (!a.world) a.world = 'gamehub';

  const _byId = new Map(AVATARS.map(a => [a.id, a]));

  function getAvatarById(id) {
    return _byId.get(id) || _byId.get(DEFAULT_AVATAR_ID);
  }
  /* Kacheln einer Gruppe: je Grundbild eine, wenn das Grundbild oder
     seine Gold-Fassung frei ist. show = was die Kachel zuerst zeigt:
     Gold, wenn es gerade gewählt ist (current), neu ist (newSet) oder
     nur Gold frei ist. */
  function getPickerTiles(group, unlockedSet, current, newSet) {
    const tiles = [];
    for (const a of AVATARS) {
      if (a.group !== group || a.goldOf) continue;
      const hasBase = unlockedSet.has(a.id);
      const gold = a.goldId && unlockedSet.has(a.goldId) ? _byId.get(a.goldId) : null;
      if (!hasBase && !gold) continue;
      const showGold = !!gold && (!hasBase || current === gold.id ||
        (current !== a.id && !!newSet && newSet.has(gold.id)));
      tiles.push({ base: a, gold, both: hasBase && !!gold, show: showGold ? gold : a });
    }
    return tiles;
  }
  function getAvatarUrl(id, basePath = '') {
    const entry = getAvatarById(id);
    const parts = entry.folder ? ['avatare MPSkills', entry.folder, entry.file] : ['avatare', entry.file];
    return basePath + parts.map(encodeURIComponent).join('/');
  }

  /* ─── shopData-Reader (base64 + Prüfsummen-Format) ────────────
     Muss zum Format in GameHub/creatures.js:895 passen. Wir lesen
     nur — auf Landing/profil.html wird nichts geschrieben. */
  function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }
  function loadShopRaw() {
    try {
      const raw = localStorage.getItem(SHOP_KEY);
      if (!raw) return {};
      let parsed;
      try {
        parsed = JSON.parse(atob(raw));
      } catch {
        parsed = JSON.parse(raw);
        return parsed || {};
      }
      if (parsed && typeof parsed === 'object' && 'h' in parsed && 'd' in parsed) {
        if (parsed.h !== hashString(JSON.stringify(parsed.d))) return {};
        return parsed.d;
      }
      return parsed || {};
    } catch { return {}; }
  }

  function getSeenCreatures() {
    return loadShopRaw().seenCreatures || {};
  }

  /* Liest die einmalig gewählte Einhornkatzen-Variante aus dem
     GameHub-localStorage. Wird über loadServerState (creatures.js)
     serverseitig in game_state[game16].variant gecacht. Für Landing/
     profil.html: wenn nicht vorhanden → null (keine Variant-Avatare
     freigeschaltet, aber auch keine Regression, weil vor Task 4 gar
     keine Stage-≥5-Katze existiert).

     WICHTIG: lernwelt_v3 ist base64+Prüfsummen-Format (siehe
     saveStorage in creatures.js). Deshalb dasselbe Read-Pattern wie
     loadShopRaw benutzen, nicht plain JSON.parse. */
  function loadGameStateRaw() {
    try {
      const raw = localStorage.getItem(GAME_STATE_KEY);
      if (!raw) return {};
      let parsed;
      try {
        parsed = JSON.parse(atob(raw));
      } catch {
        parsed = JSON.parse(raw);
        return parsed || {};
      }
      if (parsed && typeof parsed === 'object' && 'h' in parsed && 'd' in parsed) {
        if (parsed.h !== hashString(JSON.stringify(parsed.d))) return {};
        return parsed.d;
      }
      return parsed || {};
    } catch { return {}; }
  }
  function getKatzeVariant() {
    const data = loadGameStateRaw();
    const v = data && data.game16 && data.game16.variant;
    return (v === 'rainbow' || v === 'light' || v === 'dark') ? v : null;
  }

  /* ─── Unlock-Ableitung ───────────────────────────────────────
     Eier sind immer freigeschaltet. Für Kreaturen-Avatare:
     seenCreatures speichert 0-indizierten Stage-Index (siehe
     getGrowthStage in creatures.js). Bild-Stage im Katalog ist
     1-indiziert (Dateiname). Freigeschaltet wenn seen >= stage-1.

     Einhornkatze Stage ≥5: variant-scoped. Nur der Avatar der eigenen
     Variante wird freigeschaltet — die anderen zwei nie. Wenn variant
     noch nicht gewählt ist (Task 4 nicht durch): kein Stage-≥5-Avatar. */
  /* ─── MPSkills-Freischaltung ──────────────────────────────────
     Zwei Quellen:
       1) Server: mps_avatar_unlocks (0214), z. B. Sieg in Kingdoms of
          Mathoria. Kommt über loadMpskillsUnlocks() in _mpsOwned
          (id → Zeitpunkt in ms). Bis das geladen ist, ist dort nichts frei.
       2) Client-Regeln je Skill: MPS_UNLOCKERS[skill](avatar) → bool. */
  const _mpsOwned = new Map();
  const MPS_UNLOCKERS = {
    // knowledgestack: (a) => …,
  };
  function isMpskillsUnlocked(a) {
    if (_mpsOwned.has(a.id)) return true;
    const rule = MPS_UNLOCKERS[a.skill];
    try { return !!(rule && rule(a)); } catch { return false; }
  }
  let _mpsLoading = null;
  function loadMpskillsUnlocks() {
    if (!_mpsLoading) {
      _mpsLoading = _fetchMpskillsUnlocks().finally(() => {
        _mpsLoading = null;
        window.dispatchEvent(new CustomEvent('lernwelt:avatars-loaded'));
      });
    }
    return _mpsLoading;
  }
  async function _fetchMpskillsUnlocks() {
    if (!window.__accessToken || !window.SUPABASE_URL) { _mpsOwned.clear(); return; }
    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/mps_my_avatars`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.__accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: '{}'
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) return;
      _mpsOwned.clear();
      for (const x of body.avatars || []) {
        if (_byId.has(x.id)) _mpsOwned.set(x.id, new Date(x.at).getTime() || 0);
      }
    } catch (e) { console.warn('[avatars] mps_my_avatars:', e.message); }
  }

  function computeUnlockedAvatarIds() {
    const seen = getSeenCreatures();
    const variant = getKatzeVariant();
    const unlocked = new Set();
    for (const a of AVATARS) {
      if (a.world === 'mpskills') { if (isMpskillsUnlocked(a)) unlocked.add(a.id); continue; }
      if (a.group === 'egg') { unlocked.add(a.id); continue; }
      const maxIdx = seen[a.creature];
      if (typeof maxIdx !== 'number' || maxIdx < (a.stage - 1)) continue;

      // Einhornkatze Stage ≥5: variant-scoped Filter.
      if (a.creature === 'einhornkatze' && a.stage >= 5) {
        if (!variant || a.variant !== variant) continue;
      }

      unlocked.add(a.id);
    }
    return unlocked;
  }

  /* ─── Unlock-Timestamps ──────────────────────────────────────
     Merkt sich pro Avatar wann er zum ersten Mal unlocked wurde.
     Vergleich gegen Server-Timestamp profiles.avatars_seen_at
     produziert die "NEU"-Badges.

     Quelle der Wahrheit:
       1. shopData.avatarUnlocks (server-persistent, cross-device)
       2. lernwelt_avatar_unlocks (localStorage, Legacy-Fallback)
     Wir lesen aus (1) primär, (2) als Fallback für Uralt-Clients.

     WICHTIG (Bug-Fix): refreshUnlockTimestamps stempelt fehlende
     Einträge nur noch mit 0 ("unbekannt, backdatiert"), NIEMALS
     mit now(). Ein echtes now()-Stempeln passiert ausschließlich
     bei tatsächlich neuen Unlocks — und zwar dort, wo wir das
     zuverlässig wissen (updateSeenCreatures in script.js).
     Damit fällt das "alle Avatare blinken NEU nach Login"-Symptom
     weg, das durch clearLocalGameState() (leeres UNLOCKS_KEY) +
     now()-Stempeln beim nächsten Boot entstand. */
  function getUnlockTimestamps() {
    // shopData.avatarUnlocks ist die primäre Quelle (server-sync);
    // Legacy-localStorage bleibt als Fallback für Alt-Daten und
    // wird mit shopData-Werten überschrieben, wo beide vorhanden.
    const shop = loadShopRaw();
    const shopStamps = shop.avatarUnlocks || {};
    let legacy = {};
    try {
      const raw = localStorage.getItem(UNLOCKS_KEY);
      legacy = raw ? JSON.parse(raw) : {};
    } catch {}
    const mps = {};
    for (const [id, ts] of _mpsOwned) mps[id] = ts;
    return { ...legacy, ...shopStamps, ...mps };
  }
  function saveUnlockTimestamps(obj) {
    // Mirror in Legacy-Key — Landing/profil.html sollen dieselbe
    // Sicht bekommen wie GameHub, auch ohne loadShopRaw-Sync-Runde.
    try { localStorage.setItem(UNLOCKS_KEY, JSON.stringify(obj)); } catch {}
  }

  // Legacy-Kompatibilität — der alte 0-Backdate hatte keinen praktischen
  // Effekt auf die NEW-Berechnung (0 > cutoff ist immer false, identisch zu
  // undefined), konnte aber via Legacy-Key-Write die Sync-Reihenfolge mit
  // shopData durcheinanderbringen. Jetzt: no-op, gibt nur die stamps zurück.
  function refreshUnlockTimestamps(unlockedSet) {
    return getUnlockTimestamps();
  }

  // Gemeinsame Basis, damit hasAnyNewAvatars und getNewAvatarIds NIE
  // divergieren können (identische stamps + cutoff → identisches Ergebnis).
  // Optional: debug-Logs via localStorage.setItem('lernwelt_debug_new', '1').
  function _computeNewAvatarSet(seenAtISO) {
    const stamps = getUnlockTimestamps();
    const cutoff = seenAtISO ? new Date(seenAtISO).getTime() : 0;
    const news = new Set();
    for (const id in stamps) {
      if (stamps[id] > cutoff) news.add(id);
    }
    try {
      if (localStorage.getItem('lernwelt_debug_new') === '1') {
        // Alle stamps sortiert nach Zeitpunkt (jüngste zuerst), inkl. Vergleich
        // zum cutoff — damit man in einem Blick sieht welcher Stempel warum
        // nicht als NEW zählt.
        const entries = Object.entries(stamps).map(([id, ts]) => ({
          id,
          ts,
          isoTs: ts > 0 ? new Date(Number(ts)).toISOString() : '(0/backdated)',
          isNew: ts > cutoff,
          delta_ms: Number(ts) - cutoff
        })).sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));

        console.log('[NEW] context', {
          cutoff_iso: seenAtISO,
          cutoff_ms: cutoff,
          stampsCount: entries.length,
          newCount: news.size,
          news: Array.from(news)
        });
        console.log('[NEW] stamps (sorted)', entries);
        console.log('[NEW] seenCreatures', getSeenCreatures());
        console.log('[NEW] katzeVariant', getKatzeVariant());
        console.log('[NEW] unlockedIds', Array.from(computeUnlockedAvatarIds()));
      }
    } catch (e) {}
    return news;
  }

  function getNewAvatarIds(seenAtISO)  { return _computeNewAvatarSet(seenAtISO); }
  // Für den Punkt am Profilbild: rot = GameHub, blau = nur MPSkills.
  function getNewAvatarWorlds(seenAtISO) {
    const out = { gamehub: false, mpskills: false };
    for (const id of _computeNewAvatarSet(seenAtISO)) {
      const a = _byId.get(id);
      if (a) out[a.world] = true;
    }
    return out;
  }
  // Setzt einen .new-dot passend: versteckt, rot oder blau (.is-mps).
  function applyNewAvatarDot(el, seenAtISO) {
    if (!el) return;
    const w = getNewAvatarWorlds(seenAtISO);
    el.hidden = !(w.gamehub || w.mpskills);
    el.classList.toggle('is-mps', !w.gamehub && w.mpskills);
  }
  function hasAnyNewAvatars(seenAtISO) { return _computeNewAvatarSet(seenAtISO).size > 0; }

  // Export
  window.DEFAULT_AVATAR_ID       = DEFAULT_AVATAR_ID;
  window.AVATAR_WORLDS           = AVATAR_WORLDS;
  window.AVATAR_GROUPS           = AVATAR_GROUPS;
  window.AVATARS                 = AVATARS;
  window.getAvatarById           = getAvatarById;
  window.getPickerTiles          = getPickerTiles;
  window.loadMpskillsUnlocks     = loadMpskillsUnlocks;
  window.getAvatarUrl            = getAvatarUrl;
  window.getSeenCreatures        = getSeenCreatures;
  window.computeUnlockedAvatarIds = computeUnlockedAvatarIds;
  window.getUnlockTimestamps     = getUnlockTimestamps;
  window.refreshUnlockTimestamps = refreshUnlockTimestamps;
  window.getNewAvatarIds         = getNewAvatarIds;
  window.hasAnyNewAvatars        = hasAnyNewAvatars;
  window.getNewAvatarWorlds      = getNewAvatarWorlds;
  window.applyNewAvatarDot       = applyNewAvatarDot;

  // MPSkills-Freischaltungen von selbst laden, sobald die Anmeldung
  // steht (und nach jedem Wechsel) — Seiten hören auf
  // 'lernwelt:avatars-loaded' und zeichnen ihren Punkt neu.
  Promise.resolve(window.waitForSession?.()).then(loadMpskillsUnlocks, () => {});
  window.addEventListener('lernwelt:session-changed', () => { loadMpskillsUnlocks(); });
})();
