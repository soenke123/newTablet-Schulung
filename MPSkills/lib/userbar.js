/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/userbar.js  ·  die Ecke oben rechts
   ══════════════════════════════════════════════════════════════
   Ein Modul für alle MPSkills-Seiten mit Kopfzeile. Vorher stand
   auf jeder Seite eine eigene, halb ausgebaute Fassung: die Landing
   konnte an-/abmelden, „Meine Räume" saß als eigener Knopf daneben,
   und auf lehrer.html stand nur der Name ohne jede Handlung. Drei
   Orte, an denen dasselbe hätte stehen sollen — also einer.

   „Meine Räume" ist am 18.08.2026 wieder aus dem Menü geflogen: die
   Räume stehen seither als Reiter auf der Landing, und das Wortmark
   links führt schon dorthin. Ein Menüpunkt, der auf dieselbe Seite
   zeigt wie der Knopf daneben, ist kein Weg, sondern ein zweiter
   Name für einen.

   Vorbild ist bewusst die Tablet-Schulung (index.html, .auth-bar):
   Avatar · Name · Pfeil, dahinter ein Menü. Es ist dasselbe Konto,
   und wer aus der Schulung kommt, soll die Ecke wiedererkennen.
   Übernommen ist das Verhalten, NICHT die Optik — dort Gold auf
   Braun, hier Tinte und Teal (siehe Kopf von style.css).

   Wer was im Menü sieht:
     Profil          — alle Angemeldeten
     Admin-Bereich   — Admin
     Tablet-Schulung — alle (ein Konto, zwei Bereiche)
     Abmelden        — alle Angemeldeten

   Zum Avatar: die Bilder und die Freischalt-Logik stehen in
   ../avatars.js und hängen am Spielstand des GameHubs. Eine
   Lehrkraft, die nie gespielt hat, hat deshalb genau die Eier —
   das ist kein Fehler, sondern die Untergrenze des Katalogs, und
   getAvatarById() fällt für alles Unbekannte auf 'default' zurück.
   Fehlt avatars.js ganz, zeigt die Ecke die Initiale statt eines
   toten Bildes.
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;'));

  // Was die Seite tun soll, wenn ein Gast auf „Einloggen" drückt.
  // Auf der Landing sind das die Modals, überall sonst gibt es keine
  // — dort führt der Weg zur Landing, wo sie stehen.
  let opts = {};

  function roleOf(s) {
    if (!s)                              return 'guest';
    if (s.is_admin || s.is_superadmin)   return 'admin';
    if (s.teacher_status === 'approved') return 'teacher';
    if (s.teacher_status === 'pending')  return 'pending';
    if (s.teacher_status === 'rejected') return 'rejected';
    return 'noRole';
  }

  function avatarHTML(s) {
    const name = s.display_name || s.account_name || '?';
    // basePath '../' — die MPSkills-Seiten liegen eine Ebene unter
    // dem Ordner avatare/.
    if (window.getAvatarUrl) {
      return `<img src="${esc(window.getAvatarUrl(s.avatar_id || window.DEFAULT_AVATAR_ID, '../'))}" alt="" />`;
    }
    return `<span class="ub-initial">${esc(name.trim().charAt(0).toUpperCase())}</span>`;
  }

  function render() {
    const host = document.getElementById('userbarHost');
    if (!host) return;

    const s    = window.getSessionUser?.() ?? null;
    const role = roleOf(s);

    if (role === 'guest') {
      host.innerHTML = `
        <div class="ub ub--guest">
          <button type="button" class="btn btn--ghost btn--sm" data-ub="login">Einloggen</button>
          <button type="button" class="btn btn--primary btn--sm" data-ub="register">Registrieren</button>
        </div>`;
      return;
    }

    // Die Rolle steht als Pille neben dem Namen — aber nur, wenn sie
    // etwas erlaubt. „Wartet auf Freischaltung" gehört ins Profil und
    // nicht in eine Ecke, in der sonst nur Zustände stehen, die man
    // gerade benutzt.
    const pill = role === 'admin'   ? '<span class="ub-role">Admin</span>'
               : role === 'teacher' ? '<span class="ub-role">Lehrkraft</span>'
               : '';

    host.innerHTML = `
      <div class="ub">
        <button type="button" class="ub-btn" data-ub="toggle"
                aria-haspopup="true" aria-expanded="false">
          <span class="ub-av">${avatarHTML(s)}</span>
          <span class="ub-name">${esc(s.display_name || s.account_name)}</span>
          ${pill}
          <span class="ub-caret" aria-hidden="true">▼</span>
        </button>
        <div class="ub-menu" data-ub-menu hidden>
          <a href="profil.html">Profil</a>
          ${role === 'admin' ? '<a class="ub-admin" href="../admin/index.html">Admin-Bereich</a>' : ''}
          <a href="../index.html">Tablet-Schulung</a>
          <button type="button" data-ub="logout">Abmelden</button>
        </div>
      </div>`;
  }

  function menuEl() { return document.querySelector('[data-ub-menu]'); }

  function closeMenu() {
    const m = menuEl();
    if (m) m.hidden = true;
    document.querySelector('[data-ub="toggle"]')?.setAttribute('aria-expanded', 'false');
  }

  /* Gleicher Ablauf wie auf der Schulungs-Landing: erst die
     Highscores aus dem localStorage retten, dann den Spielstand des
     Geräts räumen, dann abmelden. Wer hier abmeldet, ist danach auch
     in der Schulung abgemeldet — ein Konto, ein Cookie. */
  async function logout() {
    await window.pushLocalHighscoresToServer?.().catch(() => {});
    window.clearLocalGameState?.();
    await window.supabaseClient?.auth?.signOut();
  }

  function mount(options = {}) {
    opts = options;
    render();

    // Delegiert am document, nicht an den Knöpfen: render() ersetzt
    // das ganze Innere bei jedem Session-Wechsel, und Listener an
    // ersetzten Knoten wären danach weg.
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest?.('[data-ub]');
      if (!trigger) { closeMenu(); return; }

      switch (trigger.dataset.ub) {
        case 'toggle': {
          const m = menuEl();
          if (!m) return;
          m.hidden = !m.hidden;
          trigger.setAttribute('aria-expanded', String(!m.hidden));
          break;
        }
        case 'login':
          closeMenu();
          if (opts.onLogin) opts.onLogin();
          else location.href = 'index.html';
          break;
        case 'register':
          closeMenu();
          if (opts.onRegister) opts.onRegister();
          else location.href = 'index.html';
          break;
        case 'logout':
          closeMenu();
          logout();
          break;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    window.addEventListener('lernwelt:session-changed', () => { closeMenu(); render(); });

    // Der Aufruf oben zeichnet den Gast-Zustand — beim Laden ist die
    // Session noch nicht da. Normalerweise holt das Ereignis das
    // nach; diese Zeile ist für den Fall, dass es schon durch war,
    // bevor der Listener stand. Sonst stünde für eine angemeldete
    // Lehrkraft dauerhaft „Einloggen" in der Ecke.
    (window.waitForSession?.() ?? Promise.resolve()).then(render).catch(() => {});
  }

  window.MPUserBar = { mount, render, roleOf };
})();
