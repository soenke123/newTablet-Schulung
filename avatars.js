/* ══════════════════════════════════════════════════════════════
   avatars.js — Katalog aller Profilbilder
   ══════════════════════════════════════════════════════════════
   Wird von Landing (index.html), GameHub und profil.html geladen.

   Schema:
     AVATARS: Array<{ id, group, file, label, locked? }>
       id     — Server-Wert (profiles.avatar_id), stabil
       group  — Kategorie fürs Picker-Tab ('egg' | 'creature' | ...)
       file   — Dateiname relativ zu /avatare/
       label  — Anzeige-Text im Picker
       locked — optional: true → im Picker sichtbar aber grau, nicht wählbar
                (Freischaltung via user_unlocked-System kommt später)

   Öffentliche API:
     window.AVATARS
     window.AVATAR_GROUPS  — {id, label} in Tab-Reihenfolge
     window.getAvatarById(id)         → Eintrag oder Default
     window.getAvatarUrl(id, basePath?) → URL zum <img src>
     window.DEFAULT_AVATAR_ID         → 'default'

   Neue Avatare einfach unten am Array anhängen. Neue Gruppe →
   in AVATAR_GROUPS ergänzen.
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const DEFAULT_AVATAR_ID = 'default';

  // Tab-Reihenfolge im Picker. Neue Gruppen hier ergänzen.
  const AVATAR_GROUPS = [
    { id: 'egg', label: 'Eier' }
    // { id: 'creature', label: 'Kreaturen' }   ← kommt später
  ];

  const AVATARS = [
    { id: 'default', group: 'egg', file: 'ei_avatar default.png', label: 'Ei (Start)' },
    { id: 'ei1',     group: 'egg', file: 'ei_avatar (1).png',     label: 'Ei 1' },
    { id: 'ei2',     group: 'egg', file: 'ei_avatar (2).png',     label: 'Ei 2' },
    { id: 'ei3',     group: 'egg', file: 'ei_avatar (3).png',     label: 'Ei 3' },
    { id: 'ei4',     group: 'egg', file: 'ei_avatar (4).png',     label: 'Ei 4' },
    { id: 'ei5',     group: 'egg', file: 'ei_avatar (5).png',     label: 'Ei 5' }
  ];

  const _byId = new Map(AVATARS.map(a => [a.id, a]));

  function getAvatarById(id) {
    return _byId.get(id) || _byId.get(DEFAULT_AVATAR_ID);
  }

  // basePath: '' auf Landing (Root), '../' im GameHub, '' auf profil.html.
  // Filename mit Space/Klammern wird via encodeURIComponent sauber gequotet,
  // die Slashes bleiben aber Slashes.
  function getAvatarUrl(id, basePath = '') {
    const entry = getAvatarById(id);
    return `${basePath}avatare/${encodeURIComponent(entry.file)}`;
  }

  window.DEFAULT_AVATAR_ID = DEFAULT_AVATAR_ID;
  window.AVATAR_GROUPS     = AVATAR_GROUPS;
  window.AVATARS           = AVATARS;
  window.getAvatarById     = getAvatarById;
  window.getAvatarUrl      = getAvatarUrl;
})();
