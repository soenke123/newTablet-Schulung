/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/profilemodal.js  ·  Profil als Fenster
   ══════════════════════════════════════════════════════════════
   Vorher war das Profil eine eigene Seite (profil.html). Wer in der
   Lobby eines Skills stand und dort sein neues Profilbild ansehen
   wollte, musste den Raum verlassen. Jetzt öffnet „Profil“ im Menü
   (lib/userbar.js) ein Fenster über der aktuellen Seite: Raum,
   Lobby und iframe bleiben, wie sie sind.

   Alles, was das Profil kann, steht nur hier:
     1) zeigen, wer man ist und was die Lehrkraft-Rolle gerade sagt
     2) Anzeigenamen ändern (RPC update_display_name, Migration 0004)
     3) Profilbild wählen (Katalog aus ../avatars.js, beide Welten)
     4) Passwort ändern

   profil.html bleibt als Adresse bestehen (Lesezeichen, installierte
   Web-App) und zeichnet denselben Inhalt per MPProfile.renderPage()
   in die Seite statt in ein Fenster.

   Die Lehrkraft-Rolle beantragen kann man hier bewusst nicht — der
   Knopf steht auf der Landing, mitten in der Erklärung, warum man
   ihn drückt. Von hier führt ein Link dorthin.

   Pfade: die Datei liegt in MPSkills/lib/, Bilder und Links werden
   aber relativ zur SEITE aufgelöst, die sie einbindet. Alle
   MPSkills-Seiten liegen direkt in MPSkills/ — nur dann stimmen
   '../' (Bilder) und 'index.html' (Landing).
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const $ = (id) => document.getElementById(id);

  /* ─── Toast ─────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(message, kind) {
    let el = $('profToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'profToast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'toast prof-toast show' + (kind === 'error' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast prof-toast'; }, 4000);
  }

  function fmtDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /* ─── Der Zustand der Lehrkraft-Rolle ───────────────────────
     Vier Zustände aus profiles.teacher_status (0077) plus der
     Sonderfall Admin: Admins sind implizit Lehrkräfte (can_teach()),
     ohne dass ihr teacher_status je etwas anderes als 'none' sagt.
     Stünde hier nur das Feld, läse ein Admin „keine Rolle" und
     könnte trotzdem alles — also steht die Wahrheit da und nicht
     der Spaltenwert. „Wartet" ohne „seit wann" ist eine Auskunft,
     auf die niemand reagieren kann, darum die Daten. */
  function roleState(s) {
    if (s.is_admin || s.is_superadmin) {
      return {
        cls:   'ok',
        label: 'Admin',
        text:  'Als Admin darfst du alle Skills öffnen und testen, ohne eigene Freischaltung. '
             + 'Anträge anderer Lehrkräfte bearbeitest du im <a href="../admin/index.html">Admin-Panel</a> unter „Lehrkräfte".'
      };
    }
    switch (s.teacher_status) {
      case 'approved': {
        const d = fmtDate(s.teacher_decided_at);
        return {
          cls: 'ok', label: 'Freigeschaltet',
          text: (d ? `Seit dem ${d} f` : 'F')
              + 'reigeschaltet. Du kannst Skills für deine Klassen öffnen — '
              + 'deine Räume stehen auf der <a href="index.html">MPSkills-Startseite</a>.'
        };
      }
      case 'pending': {
        const d = fmtDate(s.teacher_requested_at);
        return {
          cls: 'wait', label: 'Beantragt',
          text: (d ? `Beantragt am ${d}. ` : '')
              + 'Ein Admin schaltet dich frei — das passiert nicht automatisch. '
              + 'Wenn es dauert, sprich die Person an, die dir MPSkills gezeigt hat.'
        };
      }
      case 'rejected': {
        const d = fmtDate(s.teacher_decided_at);
        return {
          cls: 'no', label: 'Abgelehnt',
          text: (d ? `Am ${d} abgelehnt. ` : '')
              + 'Wenn das ein Missverständnis ist, sprich mit der Schulleitung oder der Schulung — '
              + 'danach kannst du auf der <a href="index.html">Startseite</a> erneut beantragen.'
        };
      }
      default:
        return {
          cls: 'none', label: 'Keine Rolle',
          text: 'Du hast die Lehrkraft-Rolle noch nicht beantragt. Wenn du an dieser Schule '
              + 'unterrichtest, kannst du sie auf der <a href="index.html">Startseite</a> beantragen.'
        };
    }
  }

  /* ─── Inhalt ────────────────────────────────────────────────
     Fenster und Seite zeigen denselben Inhalt; nur der Rahmen
     (Überschrift, Schließen) ist verschieden. */
  function bodyHTML(s) {
    const role = roleState(s);
    const avatarSrc = window.getAvatarUrl
      ? window.getAvatarUrl(s.avatar_id || window.DEFAULT_AVATAR_ID, '../')
      : '';
    return `
      <section class="card">
        <div class="prof-head">
          <div class="prof-avcol">
            <button type="button" class="prof-av" id="avBtn" aria-label="Profilbild ändern">
              <img id="avImg" src="${esc(avatarSrc)}" alt="Profilbild" />
            </button>
            <button type="button" class="btn btn--sm" id="avChange">Bild ändern</button>
          </div>

          <dl class="prof-info">
            <dt>Anzeigename</dt>
            <dd id="nameRow">
              <span id="nameShown">${esc(s.display_name || '–')}</span>
              <button type="button" class="btn btn--sm" id="nameEdit">Ändern</button>
            </dd>
            <dt>Accountname</dt><dd>${esc(s.account_name || '–')}</dd>
            <dt>Schule</dt>     <dd>${esc(s.school_name || '–')}</dd>
            <dt>MPSkills</dt>   <dd><span class="prof-badge prof-badge--${role.cls}">${esc(role.label)}</span></dd>
          </dl>
        </div>
        <form class="prof-form prof-nameform" id="nameForm" autocomplete="off" novalidate hidden>
          <div class="msg msg--err" id="nameErr" hidden></div>
          <label class="field">Neuer Anzeigename
            <input type="text" id="nameInput" maxlength="24" autocomplete="off" required />
            <span class="rule">2 bis 24 Zeichen. So sehen dich andere im Raum.</span>
          </label>
          <div class="actions">
            <button type="submit" class="btn btn--primary" id="nameSave">Speichern</button>
            <button type="button" class="btn" id="nameCancel">Abbrechen</button>
          </div>
        </form>
        <p class="prof-note">${role.text}</p>
      </section>

      <section class="card">
        <h2 class="card-h">Passwort ändern</h2>
        <form class="prof-form" id="pwForm" autocomplete="off" novalidate>
          <div class="msg msg--err" id="pwErr" hidden></div>
          <div class="msg msg--ok"  id="pwOk"  hidden></div>
          <label class="field">Neues Passwort
            <input type="password" id="pwNew" autocomplete="new-password" required />
            <span class="rule">Mindestens 8 Zeichen, mit Buchstabe und Zahl.</span>
          </label>
          <label class="field">Neues Passwort wiederholen
            <input type="password" id="pwNew2" autocomplete="new-password" required />
          </label>
          <div class="actions">
            <button type="submit" class="btn btn--primary" id="pwSubmit">Passwort speichern</button>
          </div>
        </form>
      </section>`;
  }

  const GUEST_HTML = `
    <div class="card card--join">
      <h1 class="join-h">Nicht angemeldet</h1>
      <p class="join-sub">Ein Profil gibt es nur mit Konto. Schülerinnen und Schüler brauchen hier keines —
        ihr kommt über den Code eurer Lehrkraft in den Raum.</p>
      <a class="btn btn--primary btn--wide" href="index.html">Zur Anmeldung</a>
    </div>`;

  /* Zeichnet den Inhalt in `container` und hängt die Knöpfe an.
     Gerufen bei jedem (Neu-)Zeichnen — die Knoten sind danach neu. */
  function fill(container, s) {
    shownSig = sigOf(s);
    if (!s) { container.innerHTML = GUEST_HTML; return; }
    currentAvatarId = s.avatar_id || window.DEFAULT_AVATAR_ID;
    container.innerHTML = bodyHTML(s);
    $('avBtn').addEventListener('click', openPicker);
    $('avChange').addEventListener('click', openPicker);
    $('nameEdit').addEventListener('click', openNameForm);
    $('nameCancel').addEventListener('click', closeNameForm);
    $('nameForm').addEventListener('submit', saveName);
    $('pwForm').addEventListener('submit', changePassword);
  }

  /* ─── Fenster ───────────────────────────────────────────────
     Wird beim ersten Öffnen gebaut und bleibt danach im DOM
     (hidden). z-index über .qrfly und Toast: das Fenster kommt aus
     der Lobby und muss über deren schwebenden Teilen liegen. */
  let modalEl = null;
  let lastFocus = null;

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.className = 'overlay prof-overlay';
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div class="modal modal--wide prof-modal" role="dialog" aria-modal="true" aria-labelledby="profTitle">
        <button type="button" class="modal-close" id="profClose" aria-label="Schließen">×</button>
        <h2 id="profTitle">Profil</h2>
        <p class="sub">Dein Konto gilt für MPSkills und die Tablet-Schulung gleichermaßen.</p>
        <div id="profModalBody"></div>
      </div>`;
    document.body.appendChild(modalEl);
    $('profClose').addEventListener('click', close);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });
    return modalEl;
  }

  function isOpen() { return !!modalEl && !modalEl.hidden; }

  async function open() {
    ensureModal();
    lastFocus = document.activeElement;
    modalEl.hidden = false;
    document.documentElement.classList.add('prof-open');
    await (window.waitForSession?.() ?? Promise.resolve());
    if (!isOpen()) return;
    fill($('profModalBody'), window.getSessionUser?.() ?? null);
    $('profClose').focus();
    window.loadMpskillsUnlocks?.();
  }

  function close() {
    if (!modalEl || modalEl.hidden) return;
    closePicker();
    modalEl.hidden = true;
    document.documentElement.classList.remove('prof-open');
    try { lastFocus?.focus?.(); } catch (e) { /* egal */ }
  }

  /* ─── Anzeigename ───────────────────────────────────────────
     Gespeichert wird über update_display_name (0004): Länge 2–24,
     keine Steuerzeichen, Schimpfwort-Blacklist, und eine Sperre
     (display_name_locked), die ein Admin setzen kann. Die
     Fehlercodes des RPC sind keine Sätze — hier stehen die Sätze. */
  const NAME_ERRORS = {
    not_authenticated: 'Du bist nicht angemeldet. Bitte melde dich neu an.',
    invalid_length:    'Der Name braucht 2 bis 24 Zeichen.',
    invalid_chars:     'Im Namen sind Sonderzeichen, die nicht erlaubt sind.',
    blacklisted:       'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.',
    name_locked:       'Dein Name wurde gesperrt und kann nicht geändert werden. Sprich mit deiner Lehrkraft.',
    no_profile:        'Zu deinem Zugang fehlt das Profil.'
  };

  function nameMsg(text) {
    const e = $('nameErr');
    e.textContent = text || '';
    e.hidden = !text;
  }

  function openNameForm() {
    const s = window.getSessionUser?.();
    $('nameInput').value = s?.display_name || '';
    nameMsg('');
    $('nameForm').hidden = false;
    $('nameRow').hidden = true;
    $('nameInput').focus();
    $('nameInput').select();
  }
  function closeNameForm() {
    $('nameForm').hidden = true;
    $('nameRow').hidden = false;
    nameMsg('');
  }

  async function saveName(ev) {
    ev.preventDefault();
    const name = $('nameInput').value.trim();
    if (name.length < 2 || name.length > 24) { nameMsg(NAME_ERRORS.invalid_length); return; }
    const s = window.getSessionUser?.();
    if (name === s?.display_name) { closeNameForm(); return; }

    const btn = $('nameSave');
    btn.disabled = true;
    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/update_display_name`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.__accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ p_new_name: name })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        nameMsg(NAME_ERRORS[body?.error] || 'Speichern fehlgeschlagen. Bitte erneut versuchen.');
        return;
      }
      const saved = body.display_name || name;
      if (window.__session) window.__session.display_name = saved;
      $('nameShown').textContent = saved;
      closeNameForm();
      window.MPUserBar?.render();
      toast('Name geändert.');
    } catch (e) {
      console.warn('[mpskills] Name speichern:', e.message);
      nameMsg('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      btn.disabled = false;
    }
  }

  /* ─── Profilbild ────────────────────────────────────────────
     Gespeichert wird über den RPC update_avatar_id — derselbe Weg
     wie in der Schulung, und der einzige: es gibt keine Policy, die
     einen User sein eigenes Profil schreiben lässt (0002/0053).
     Direkter fetch statt SDK-Builder, konsistent mit dem Rest des
     Projekts (die SDK hatte cross-tab-Lock-Probleme).

     Reiter: GameHub zeigt nur Gruppen mit Inhalt (wer nie gespielt
     hat, hat die Eier — der immer freigeschaltete Sockel des
     Katalogs, kein Fehler); MPSkills zeigt immer alle Skills — der
     Reiter sagt dort, WO es etwas zu holen gibt. */
  let unlockedSet = new Set();
  let groupsWithContent = [];
  let currentWorld = 'gamehub';
  let currentGroup = 'egg';
  let currentAvatarId = 'default';
  // Neue Bilder als Schnappschuss beim Öffnen: die NEU-Sticker bleiben
  // stehen, solange der Picker offen ist, auch wenn „gesehen“ schon
  // gespeichert ist.
  let pickerNewSet = new Set();
  let pickerEl = null;

  function ensurePicker() {
    if (pickerEl) return pickerEl;
    pickerEl = document.createElement('div');
    pickerEl.className = 'overlay prof-overlay prof-overlay--picker';
    pickerEl.hidden = true;
    pickerEl.innerHTML = `
      <div class="modal picker" role="dialog" aria-modal="true" aria-labelledby="pickerTitle">
        <div class="picker-head">
          <h2 id="pickerTitle">Profilbild wählen</h2>
          <button type="button" class="modal-close" id="pickerClose" aria-label="Schließen">×</button>
        </div>
        <div class="picker-body">
          <nav class="picker-worlds" id="pickerWorlds" aria-label="Bereich"></nav>
          <div class="picker-main">
            <div class="picker-tabs" id="pickerTabs"></div>
            <div class="picker-grid" id="pickerGrid"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(pickerEl);
    $('pickerClose').addEventListener('click', closePicker);
    pickerEl.addEventListener('click', (e) => { if (e.target === pickerEl) closePicker(); });
    return pickerEl;
  }

  function recomputeUnlocks() {
    unlockedSet = window.computeUnlockedAvatarIds
      ? window.computeUnlockedAvatarIds()
      : new Set(['default']);
    groupsWithContent = (window.AVATAR_GROUPS || []).filter(g =>
      (g.world || 'gamehub') === currentWorld && (currentWorld === 'mpskills' ||
        (window.AVATARS || []).some(a => a.group === g.id && unlockedSet.has(a.id))));
    if (!groupsWithContent.some(g => g.id === currentGroup)) {
      currentGroup = groupsWithContent[0]?.id || 'egg';
    }
  }

  function openPicker() {
    ensurePicker();
    // Am eigenen Bild anfangen — wer nur die Stufe wechseln will,
    // sucht sonst erst die Gruppe, in der er schon steht.
    const own = (window.AVATARS || []).find(a => a.id === currentAvatarId);
    currentWorld = own?.world || 'gamehub';
    if (own) currentGroup = own.group;
    const s = window.getSessionUser?.();
    pickerNewSet = window.getNewAvatarIds ? window.getNewAvatarIds(s?.avatars_seen_at) : new Set();
    // Gibt es Neues, dort anfangen.
    const firstNew = (window.AVATARS || []).find(a => pickerNewSet.has(a.id));
    if (firstNew) { currentWorld = firstNew.world; currentGroup = firstNew.group; }
    tileShow.clear();
    recomputeUnlocks();
    renderWorlds();
    renderTabs();
    renderGrid();
    pickerEl.hidden = false;
    if (pickerNewSet.size) markSeen();
  }

  /* Öffnen des Pickers = gesehen. Der Punkt an der Ecke oben rechts
     verschwindet sofort, der Server (mark_avatars_seen) merkt es
     sich für die anderen Seiten. */
  function markSeen() {
    if (window.__session) window.__session.avatars_seen_at = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('lernwelt:avatars-seen'));
    if (!window.__accessToken) return;
    fetch(`${window.SUPABASE_URL}/rest/v1/rpc/mark_avatars_seen`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.__accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    }).catch(e => console.warn('[mpskills] mark_avatars_seen:', e.message));
  }

  function closePicker() {
    if (pickerEl) pickerEl.hidden = true;
  }

  const WORLD_ICONS = { gamehub: '../avatare/ei_avatar%20default.png', mpskills: 'icons/favicon-64.png' };
  function renderWorlds() {
    const el = $('pickerWorlds');
    el.innerHTML = (window.AVATAR_WORLDS || []).map(w => `
      <button type="button" class="picker-world${w.id === currentWorld ? ' on' : ''}" data-w="${esc(w.id)}">
        <img src="${esc(WORLD_ICONS[w.id] || '')}" alt="" /><span>${esc(w.label)}</span>
      </button>`).join('');
    el.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.w === currentWorld) return;
      currentWorld = b.dataset.w;
      recomputeUnlocks();
      renderWorlds();
      renderTabs();
      renderGrid();
    }));
  }

  function renderTabs() {
    const el = $('pickerTabs');
    // Ein einzelner Reiter ist keine Wahl, sondern eine Überschrift —
    // dann lieber keiner.
    el.hidden = groupsWithContent.length < 2;
    // „x/alle“ nur bei MPSkills — im GameHub verriete die Gesamtzahl
    // die noch geheimen Kreaturen.
    const count = (g) => {
      if (g.world !== 'mpskills') return '';
      // Gold-Fassungen zählen nicht extra — sie hängen am Grundbild.
      const all = (window.AVATARS || []).filter(a => a.group === g.id && !a.goldOf);
      const have = all.filter(a => unlockedSet.has(a.id) || unlockedSet.has(a.goldId)).length;
      return ` <span class="tab-count">${have}/${all.length}</span>`;
    };
    el.innerHTML = groupsWithContent.map(g =>
      `<button type="button" class="picker-tab${g.id === currentGroup ? ' on' : ''}" data-g="${esc(g.id)}">${esc(g.label)}${count(g)}</button>`
    ).join('');
    el.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
      currentGroup = b.dataset.g;
      renderTabs();
      renderGrid();
    }));
  }

  function renderGrid() {
    const el = $('pickerGrid');
    const tiles = window.getPickerTiles
      ? window.getPickerTiles(currentGroup, unlockedSet, currentAvatarId, pickerNewSet)
      : [];

    if (!tiles.length) {
      const g = (window.AVATAR_GROUPS || []).find(x => x.id === currentGroup);
      el.innerHTML = currentWorld === 'mpskills'
        ? `<p class="tools-empty">Noch nichts freigeschaltet. ${g?.hint ? esc(g.hint) : `In <strong>${esc(g?.label || 'diesem Skill')}</strong> kannst du Avatare freischalten — sie erscheinen dann hier.`}</p>`
        : `<p class="tools-empty">Hier ist noch nichts freigeschaltet.</p>`;
      return;
    }

    // Gibt es ein Bild auch in Gold, schaltet das Dreieck unten an der
    // Kachel zwischen beiden um; angetippt wird, was die Kachel zeigt.
    el.innerHTML = tiles.map(t => {
      const a = shownOf(t);
      const isNew = pickerNewSet.has(t.base.id) || (t.gold && pickerNewSet.has(t.gold.id));
      const on = currentAvatarId === t.base.id || (t.gold && currentAvatarId === t.gold.id);
      return `
      <button type="button" class="picker-tile${on ? ' on' : ''}${a.goldOf ? ' is-gold' : ''}${a.world === 'mpskills' ? ' is-mps' : ''}" data-a="${esc(a.id)}">
        ${isNew ? '<span class="tile-new">NEU</span>' : ''}
        <img src="${esc(window.getAvatarUrl(a.id, '../'))}" alt="" />
        <span>${esc(a.label)}</span>
        ${t.both ? `<span class="tile-flip" role="button" tabindex="0" data-flip="${esc(t.base.id)}"
          title="${a.goldOf ? 'Normal zeigen' : 'Gold zeigen'}" aria-label="${a.goldOf ? 'Normal zeigen' : 'Gold zeigen'}"></span>` : ''}
      </button>`;
    }).join('');

    el.querySelectorAll('[data-a]').forEach(b =>
      b.addEventListener('click', () => selectAvatar(b.dataset.a)));
    el.querySelectorAll('[data-flip]').forEach(f => {
      const flip = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const t = tiles.find(x => x.base.id === f.dataset.flip);
        tileShow.set(t.base.id, shownOf(t).goldOf ? t.base.id : t.gold.id);
        renderGrid();
      };
      f.addEventListener('click', flip);
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') flip(e); });
    });
  }

  // Was eine Kachel mit Gold-Fassung gerade zeigt (umgeschaltet per Dreieck).
  const tileShow = new Map();
  function shownOf(t) {
    const id = tileShow.get(t.base.id);
    if (id === t.base.id && t.both) return t.base;
    if (t.gold && id === t.gold.id) return t.gold;
    return t.show;
  }

  async function selectAvatar(id) {
    if (id === currentAvatarId) { closePicker(); return; }
    if (!unlockedSet.has(id)) return;

    const prev = currentAvatarId;
    currentAvatarId = id;
    const img = $('avImg');
    if (img) img.src = window.getAvatarUrl(id, '../');
    renderGrid();

    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/update_avatar_id`, {
        method: 'POST',
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.__accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ p_new_id: id })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error || `HTTP ${res.status}`);

      // Session lokal nachziehen, damit die Ecke oben rechts das neue
      // Bild sofort zeigt — sonst stünde dort bis zum nächsten Laden
      // das alte.
      if (window.__session) window.__session.avatar_id = id;
      window.MPUserBar?.render();
      closePicker();
    } catch (e) {
      console.warn('[mpskills] Profilbild speichern:', e.message);
      currentAvatarId = prev;
      const img2 = $('avImg');
      if (img2) img2.src = window.getAvatarUrl(prev, '../');
      renderGrid();
      toast('Speichern fehlgeschlagen. Bitte erneut versuchen.', 'error');
    }
  }

  /* ─── Passwort ──────────────────────────────────────────────
     Dieselbe Regel wie beim Anlegen des Kontos (api/signup.js):
     mindestens 8 Zeichen, Buchstabe und Zahl. Sie steht hier noch
     einmal, weil auth.updateUser sie nicht kennt — Supabase prüft
     nur seine eigene Mindestlänge, und eine Regel, die beim Anlegen
     gilt und beim Ändern nicht, ist keine Regel. */
  function pwMsg(kind, text) {
    const e = $('pwErr');
    const o = $('pwOk');
    e.hidden = true; o.hidden = true;
    const t = kind === 'err' ? e : o;
    t.textContent = text;
    t.hidden = false;
  }

  async function changePassword(ev) {
    ev.preventDefault();
    const p1 = $('pwNew').value;
    const p2 = $('pwNew2').value;
    const btn = $('pwSubmit');

    if (p1.length < 8 || !/[A-Za-zÄÖÜäöüß]/.test(p1) || !/[0-9]/.test(p1)) {
      pwMsg('err', 'Das Passwort braucht mindestens 8 Zeichen, einen Buchstaben und eine Zahl.');
      return;
    }
    if (p1 !== p2) {
      pwMsg('err', 'Die beiden Passwörter stimmen nicht überein.');
      return;
    }

    btn.disabled = true;
    const before = btn.textContent;
    btn.textContent = 'Speichere …';
    try {
      const { error } = await window.supabaseClient.auth.updateUser({ password: p1 });
      if (error) throw error;
      $('pwForm').reset();
      pwMsg('ok', 'Passwort geändert. Beim nächsten Anmelden gilt das neue.');
    } catch (e) {
      pwMsg('err', 'Speichern fehlgeschlagen: ' + (e?.message || 'unbekannt'));
    } finally {
      btn.disabled = false;
      btn.textContent = before;
    }
  }

  /* ─── Seite (profil.html) ─────────────────────────────────── */
  let pageHost = null;

  function renderPage(host) {
    pageHost = host;
    host.innerHTML = '<div id="profPageBody"></div>';
    const s = window.getSessionUser?.() ?? null;
    fill($('profPageBody'), s);
    if (s) window.loadMpskillsUnlocks?.();
  }

  /* ─── Verdrahtung ───────────────────────────────────────── */
  // Escape schließt zuerst den Picker, dann das Profil — nie beides
  // auf einmal, sonst ist ein Tippfehler im Picker ein Rauswurf.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (pickerEl && !pickerEl.hidden) { closePicker(); e.stopPropagation(); return; }
    if (isOpen()) close();
  });

  // Meldet sich jemand in einem anderen Tab ab, steht hier sonst ein
  // Profil, das niemandem mehr gehört.
  // Nur neu zeichnen, wenn sich etwas ändert, das hier zu sehen ist —
  // Token-Erneuerungen feuern das Ereignis auch, und ein halb
  // getipptes Passwort soll dabei nicht verschwinden.
  let shownSig = '';
  const sigOf = (s) => s ? [s.id, s.display_name, s.avatar_id, s.teacher_status,
    s.is_admin, s.is_superadmin, s.school_name].join('|') : '';
  window.addEventListener('lernwelt:session-changed', () => {
    const s = window.getSessionUser?.() ?? null;
    const sig = sigOf(s);
    if (sig === shownSig) return;
    shownSig = sig;
    if (!s) closePicker();
    if (isOpen()) fill($('profModalBody'), s);
    else if (pageHost && $('profPageBody')) fill($('profPageBody'), s);
  });

  window.MPProfile = { open, close, isOpen, renderPage };
})();
