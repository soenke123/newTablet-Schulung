/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/socialhub.js   ·   Schaufenster für YourSozialNet
   ══════════════════════════════════════════════════════════════
   Im Modal läuft die ECHTE App im Rahmen (tools/SocialHub/tool.js
   baut im Schaufenster index.html?demo=1). Dann geht kein Aufruf an
   den Server: js/demo.js spielt ihn mit den Beispieldaten des Skills
   (dummy/, Stichtag gestern) – ein Schüler in seinem eigenen Netzwerk
   „Liky“, Gründer und Admin @du. Nichts wird gespeichert.

   Drehbuch, die Geschichte des Skills in einem Durchgang:
   Feed ansehen → ein Foto liken → Kommentare öffnen und schreiben →
   in den Adminbereich: dasselbe Like steht per SQL in der Tabelle
   likes → Klassendiagramm der Tabellen → zurück in die App.

   Das Standbild für die Kachel (tile()) ist ein leichter Nachbau:
   links ein Handy mit einer Foto-Karte, rechts die Tabelle likes.
   Beim Darüberfahren wird das Herz rot, die Zahl springt hoch und in
   der Tabelle erscheint die neue Zeile – App und Datenbank sind eins.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'participant';

  function view() {
    return { role: ROLE, room: { title: 'YourSozialNet', code: 'DEMO', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  const C0 = '.card[data-i="0"] ';

  async function play(api) {
    if (!await api.waitFor(C0 + '[data-act="like"]', 15000)) return;
    api.caption('Das eigene soziale Netzwerk: Fotos, Likes, Kommentare');
    if (!await api.wait(3500)) return;

    // Liken: Knopf antippen → Auswahl Herz · Daumen · Lustig
    api.caption('Liken – mit Herz, Daumen oder Smiley');
    if (api.click(C0 + '.r-like:not(.liked)')) {
      if (!await api.wait(900)) return;
      api.click(C0 + '[data-react="heart"]');
    }
    if (!await api.wait(2200)) return;

    // Kommentieren
    api.caption('Kommentieren');
    api.click(C0 + '[data-act="comments"]');
    if (!await api.waitFor('.c-form input', 4000)) return;
    if (!await api.wait(1500)) return;
    if (!await api.type('.c-form input', 'Wie schön! 😍')) return;
    if (!await api.wait(500)) return;
    api.click('.c-form button');
    if (!await api.wait(2200)) return;
    api.click('.sheet [data-close]');
    if (!await api.wait(900)) return;

    // Adminbereich: was eben passiert ist, steht in der Datenbank
    api.caption('Adminbereich: dahinter steckt eine echte Datenbank');
    api.click('[data-view="admin"]');
    if (!await api.waitFor('#dbRun', 6000)) return;
    if (!await api.waitFor('.db-tables *', 6000)) return;
    if (!await api.wait(1200)) return;
    api.caption('Mit SQL nachsehen: Wer hat was geliked?');
    if (!await api.type('.ed-ta', "SELECT u.username, l.kind, l.created_at\nFROM likes l JOIN users u ON u.id = l.user_id\nORDER BY l.created_at DESC\nLIMIT 5;")) return;
    if (!await api.wait(700)) return;
    api.click('#dbRun');
    if (!await api.wait(5000)) return;

    api.caption('Die Tabellen des Netzwerks als Klassendiagramm');
    api.click('[data-at="diagram"]');
    if (!await api.wait(5000)) return;

    api.caption('');
    api.click('[data-view="app"]');
    await api.wait(1500);
  }

  /* ── Standbild ───────────────────────────────────────────── */
  const ROWS = [['17', '42', 'heart'], ['23', '42', 'laugh'], ['8', '42', 'thumb']];

  function tile() {
    const row = (r, y, cls) => `<g class="${cls}">
        <text x="200" y="${y}" class="shp-mono">${r[0]}</text>
        <text x="236" y="${y}" class="shp-mono">${r[1]}</text>
        <text x="272" y="${y}" class="shp-mono shp-mono--k">'${r[2]}'</text>
      </g>`;
    return `<div class="tprev tprev--sh" aria-hidden="true">
      <svg class="shp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        <defs><linearGradient id="shpSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4c1d95"/><stop offset=".55" stop-color="#db2777"/><stop offset="1" stop-color="#f59e0b"/>
        </linearGradient></defs>
        <!-- Handy mit einer Foto-Karte -->
        <rect x="40" y="8" width="104" height="174" rx="16" class="shp-phone"/>
        <rect x="46" y="14" width="92" height="162" rx="11" class="shp-screen"/>
        <rect x="46" y="14" width="92" height="162" rx="11" fill="url(#shpSky)"/>
        <path d="M46 132 L72 104 L90 120 L110 92 L138 128 L138 165 Q138 176 127 176 L57 176 Q46 176 46 165 Z" class="shp-hill"/>
        <circle cx="116" cy="44" r="10" class="shp-sun"/>
        <rect x="76" y="19" width="32" height="5" rx="2.5" class="shp-notch"/>
        <circle cx="56" cy="152" r="5.5" class="shp-av"/>
        <text x="65" y="155" class="shp-user">@mila.foto</text>
        <text x="52" y="167" class="shp-desc">Sonnenuntergang am See</text>
        <g class="shp-heart">
          <path d="M126 108 c0 -6 -8 -8 -9 -2 c-1 -6 -9 -4 -9 2 c0 5 9 10 9 10 s9 -5 9 -10z" class="shp-h0"/>
          <path d="M126 108 c0 -6 -8 -8 -9 -2 c-1 -6 -9 -4 -9 2 c0 5 9 10 9 10 s9 -5 9 -10z" class="shp-h1"/>
        </g>
        <text x="117" y="129" text-anchor="middle" class="shp-n shp-n0">41</text>
        <text x="117" y="129" text-anchor="middle" class="shp-n shp-n1">42</text>
        <path d="M110 138 h14 v9 h-9 l-4 3 v-3 h-1 z" class="shp-chat"/>
        <text x="117" y="158" text-anchor="middle" class="shp-n">7</text>

        <!-- Verbindung: der Klick landet in der Datenbank -->
        <path d="M150 96 C166 96 170 90 184 90" class="shp-link"/>
        <path d="M181 86 l5 4 -5 4" class="shp-link"/>

        <!-- Tabelle likes -->
        <rect x="190" y="30" width="140" height="132" rx="10" class="shp-card"/>
        <text x="200" y="48" class="shp-head">likes</text>
        <text x="320" y="48" text-anchor="end" class="shp-small">SQL</text>
        <rect x="190" y="56" width="140" height="18" class="shp-th"/>
        <text x="200" y="68" class="shp-col">user_id</text>
        <text x="236" y="68" class="shp-col">photo_id</text>
        <text x="272" y="68" class="shp-col">kind</text>
        ${ROWS.map((r, i) => row(r, 90 + i * 19, 'shp-row')).join('')}
        <rect x="192" y="${90 + 3 * 19 - 13}" width="136" height="18" rx="4" class="shp-newbg"/>
        ${row(['1', '42', 'heart'], 90 + 3 * 19, 'shp-new')}
      </svg>
    </div>`;
  }

  window.MPPreview.register('socialhub', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Ein <strong>eigenes soziales Netzwerk</strong> im Stil von TikTok und Instagram: Jede
         Person erstellt ihr Netzwerk mit Name, Logo und Farben, postet Fotos, liked, folgt und
         kommentiert – auf Wunsch auch alle zusammen im <strong>Klassen-Netz</strong>.</p>
      <p>Dann der Blick hinter die Kulissen: Im <strong>Adminbereich</strong> liegt die echte
         Datenbank (users, photos, likes, comments, tags …). Mit SQL wird abgefragt und geändert,
         ein Klassendiagramm zeigt die Tabellen. Die Lehrkraft entscheidet, welche Tabellen es gibt,
         und füllt sie auf Knopfdruck mit Beispieldaten.</p>
      <p>Für die Einheit „Was weiß die Plattform über dich?“: Tracking, Werbung mit Zielgruppen und
         die Aufdeckung, was gespeichert wurde. Skript und Lösungsheft „Datenbanksysteme“ gibt es als
         Arbeitsmaterial. Der Skill ist noch in der <strong>Beta</strong>.</p>`
  });
})();
