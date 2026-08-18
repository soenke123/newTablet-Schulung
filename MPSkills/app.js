/* ══════════════════════════════════════════════════════════════
   MPSkills — app.js  ·  Landingpage
   ══════════════════════════════════════════════════════════════
   Die Seite kennt drei Ansichten:

     1. nicht angemeldet          — Code · Zugang · zwei Auskünfte
     2. angemeldet ohne Rechte    ┐ stehen vorerst noch so da, wie sie
     3. angemeldet mit Rechten    ┘ waren; Umbau als eigener Schritt.

   Ansicht 1 ist auf EINEN Weg hin gebaut: jemand steht vor einer
   Tafel, auf der ein Code steht. Alles andere ist seltener und
   steht deshalb weiter unten (Zugang) oder hinter einem Knopf
   (die beiden Auskünfte).

   Drei Dinge, die hier bewusst so sind:

   1) Es wird session.js aus dem Repo-Root wiederverwendet, mit
      demselben storageKey. Eine Lehrkraft, die in der Schulung
      angemeldet ist, ist hier automatisch mit angemeldet — ein
      Konto, zwei Bereiche. Anonyme Teilnehmer haben gar keine
      Auth-Session und sind davon nicht betroffen.

   2) Die Kontoanlage schickt context='mpskills' an /api/signup.
      Das ist der einzige Unterschied zur Anmeldung auf der
      Schulungs-Landing — und er entscheidet, dass dieses Konto NIE
      in einen Kurs kommt und sofort auf 'pending' steht
      (Migration 0077 + api/signup.js). Registrieren IST damit der
      Antrag; ein zweiter Klick wäre nur eine Wiederholung.

   3) Anmelden und Registrieren stehen IN der Seite und nicht mehr
      in zwei Modals. Ein Dialog, der sich über die Erklärung
      schiebt, warum man ihn ausfüllt, nimmt genau die Erklärung
      weg — und die beiden Wege („habe ich schon ein Konto?")
      lassen sich nebeneinander in einem Blick vergleichen,
      hintereinander nicht.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));

/* ─── Toast ───────────────────────────────────────────── */
let toastTimer = null;
function toast(message, kind) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (kind === 'error' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

/* ─── Schulliste ──────────────────────────────────────── */
// Gleiche Quelle wie auf der Schulungs-Landing: schools ist für anon
// lesbar (0002). Fallback auf MPS, damit die Anmeldung auch dann geht,
// wenn die Liste nicht kommt.
let schoolsCache = null;
async function loadSchools() {
  if (schoolsCache) return schoolsCache;
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/schools?select=slug,name&active=eq.true&order=name`,
      {
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
          Accept: 'application/json'
        }
      }
    );
    if (!res.ok) throw new Error(`schools ${res.status}`);
    schoolsCache = await res.json();
  } catch (e) {
    console.warn('[mpskills] Schulliste laden fehlgeschlagen:', e.message);
    schoolsCache = [{ slug: 'mps', name: 'MPS' }];
  }
  if (!schoolsCache.length) schoolsCache = [{ slug: 'mps', name: 'MPS' }];
  return schoolsCache;
}

// Beide Auswahlfelder auf einmal, und nur beim ersten Aufklappen:
// die Liste ist ein Netzaufruf, und solange der Zugang zugeklappt
// ist, braucht ihn niemand.
let schoolsFilled = false;
async function fillSchoolSelects() {
  if (schoolsFilled) return;
  const schools = await loadSchools();
  const html = schools
    .map(s => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`)
    .join('');
  for (const id of ['loginSchool', 'regSchool']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  schoolsFilled = true;
}

/* ══════════════════════════════════════════════════════════
   1. Der Code von der Tafel
   ══════════════════════════════════════════════════════════
   Das Feld steht statisch im HTML — es ist die Hauptsache der
   Seite und soll nicht auf ein Skript warten müssen. Hier steht
   nur die Verdrahtung und die Liste der Räume, in denen dieses
   Gerät schon war. */
function wireJoinForm() {
  const input = document.getElementById('hubCode');
  const form  = document.getElementById('hubCodeForm');
  if (!input || !form) return;

  input.addEventListener('input', () => {
    input.value = window.MPRoom.normalizeCode(input.value).slice(0, 6);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = window.MPRoom.normalizeCode(input.value);
    if (!window.MPRoom.isCode(code)) {
      toast('Der Code besteht aus 6 Zeichen — Buchstaben und Ziffern.', 'error');
      input.focus();
      return;
    }
    location.href = 'j.html#' + code;
  });
}

function renderMyRooms() {
  const el = document.getElementById('joinMine');
  if (!el) return;
  const mine = (window.MPRoom?.list() || []);
  el.innerHTML = mine.length ? `
    <div class="joincard-mine">
      <span class="joincard-mine-h">Zuletzt auf diesem Gerät</span>
      ${mine.slice(0, 4).map(r => `
        <a class="minichip" href="j.html#${esc(r.code)}">
          <span>${esc(r.room?.tool_icon || '🧩')}</span>
          ${esc(r.room?.title || r.code)}
        </a>`).join('')}
    </div>` : '';
}

/* ══════════════════════════════════════════════════════════
   2. Zugang für Lehrkräfte
   ══════════════════════════════════════════════════════════ */
function accessOpen() {
  return document.getElementById('accessPanel')?.hidden === false;
}

// which: 'login' | 'register' | undefined
// Der Sprung zum Feld ist der Punkt: wer in der Ecke oben rechts auf
// „Registrieren" drückt, meint die rechte Spalte und nicht „irgendwo
// hier unten steht ein Formular".
async function openAccess(which) {
  const panel  = document.getElementById('accessPanel');
  const toggle = document.getElementById('accessToggle');
  if (!panel) return;

  panel.hidden = false;
  toggle?.setAttribute('aria-expanded', 'true');
  if (toggle) toggle.textContent = 'Zugang bekommen';

  await fillSchoolSelects();

  const first = which === 'register' ? 'regAccount'
              : which === 'login'    ? 'loginAccount'
              : null;
  const target = document.getElementById(first || 'accessPanel');
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (first) setTimeout(() => document.getElementById(first)?.focus(), 260);
}

function closeAccess() {
  const panel  = document.getElementById('accessPanel');
  const toggle = document.getElementById('accessToggle');
  if (panel) panel.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

/* ══════════════════════════════════════════════════════════
   3. Die beiden Auskünfte
   ══════════════════════════════════════════════════════════
   Inhalt steht im HTML, nicht hier — es ist Text, den jemand
   lesen und ändern soll, und der gehört dorthin, wo er zu sehen
   ist. */
function openInfo(which) {
  const id = which === 'privacy' ? 'privacyModal' : 'aboutModal';
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function closeInfos() {
  for (const id of ['privacyModal', 'aboutModal']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}

/* ══════════════════════════════════════════════════════════
   Werkzeug-Kacheln (Provisorium)
   ══════════════════════════════════════════════════════════
   Für Gäste ist die Liste weg — sie beantwortet keine Frage, die
   ein Gast hat, und schob den Code-Kasten nach unten. Für
   Lehrkräfte und Admins steht sie vorerst weiter da: sie hält den
   Weg „Testraum anlegen" offen, den es sonst nirgends gibt (in
   lehrer.html entstehen nur echte Räume). Beim Umbau der Ansicht 3
   gehört beides an einen Ort.

   Quelle ist skill_tools (Migration 0078), NICHT tools.js. Dort
   steht nur das ready-Flag — siehe Kopfkommentar in tools.js. */
let toolsCache = null;
let toolsError = null;

async function loadTools() {
  if (toolsCache) return toolsCache;
  const token = window.__accessToken || window.SUPABASE_ANON_KEY;
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/skill_tools`
      + '?select=id,title,blurb,icon,folder,multi_room,active,sort_order'
      + '&order=sort_order.asc',
      {
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      }
    );
    if (!res.ok) throw new Error(`skill_tools ${res.status}: ${(await res.text()).slice(0, 160)}`);
    toolsCache = await res.json();
    toolsError = null;
  } catch (e) {
    console.warn('[mpskills] Werkzeugliste laden fehlgeschlagen:', e.message);
    toolsCache = null;
    toolsError = e.message;
  }
  return toolsCache;
}

function isReady(toolId) {
  return !!(window.TOOLS_OVERLAY?.[toolId]?.ready);
}

function toolCard(t) {
  const ready = isReady(t.id);
  const badges = [
    ready ? '' : '<span class="tag tag--soon">Werkzeug in Vorbereitung</span>',
    t.active ? '' : '<span class="tag tag--off">Abgeschaltet</span>'
  ].filter(Boolean).join('');

  // Ein abgeschaltetes Werkzeug bekommt keine neuen Räume mehr
  // (Entscheidung 17.08.2026) — die Knöpfe wären dann eine Einladung
  // in eine Fehlermeldung.
  const off = t.active ? '' : ' disabled title="Dieses Werkzeug ist abgeschaltet."';

  return `<article class="tile${ready ? '' : ' tile--soon'}">
      <div class="tile-head">
        <span class="tile-ic">${esc(t.icon || '🧩')}</span>
        <h3>${esc(t.title)}</h3>
      </div>
      ${badges ? `<div class="tile-tags">${badges}</div>` : ''}
      <p class="tile-blurb">${esc(t.blurb || '')}</p>
      <div class="tile-foot">
        <button type="button" class="btn btn--sm" data-act="test" data-tool="${esc(t.id)}"${off}>Testen</button>
        <button type="button" class="btn btn--sm btn--primary" data-act="open" data-tool="${esc(t.id)}"${off}>Für eine Klasse öffnen</button>
      </div>
      ${ready ? '' : '<p class="tile-note">Der Raum funktioniert schon — das Werkzeug darin kommt noch.</p>'}
    </article>`;
}

/* „Testen" legt sofort einen Raum an — es gibt bewusst keinen
   Solo-Modus, damit der Test dasselbe zeigt wie der Ernstfall. Ein
   vorhandener Testraum wird dabei wiederverwendet (Server-Regel in
   Migration 0079), sonst sammelte jeder Klick einen weiteren an.

   „Für eine Klasse öffnen" fragt nach Titel und Namen — das gehört
   auf die Raumseite und nicht in ein zweites Formular hier. */
function wireToolButtons() {
  document.querySelectorAll('#toolsHost button[data-act]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tool = btn.dataset.tool;
      if (btn.dataset.act === 'open') {
        location.href = 'lehrer.html?new=' + encodeURIComponent(tool);
        return;
      }
      btn.disabled = true;
      const before = btn.textContent;
      btn.textContent = 'Einen Moment …';
      try {
        /* Der Testraum entsteht ohne Dialog — also holt er sich die
           Vorgaben des Werkzeugs selbst. Sonst stünde im Testraum
           einer Wortwolke eine Wolke ohne Frage, und der Test zeigte
           genau das nicht, was er zeigen soll.

           Schlägt das Laden fehl, wird der Raum trotzdem angelegt:
           ein Testraum mit Rückfall-Einstellungen ist besser als ein
           Knopf, der nichts tut. */
        let settings = {};
        try {
          const impl = await MPTool.load(tool, (window.__toolFolders || {})[tool]);
          settings = MPTool.defaultSettings(impl);
        } catch (e) {
          console.warn('[mpskills] Vorgaben des Werkzeugs:', e.message);
        }

        const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/skill_room_create`, {
          method: 'POST',
          headers: {
            apikey: window.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${window.__accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ p_tool_id: tool, p_is_test: true, p_settings: settings })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const r = await res.json();
        if (!r.ok) {
          toast(r.error === 'tool_inactive'
            ? 'Dieses Werkzeug ist abgeschaltet — neue Räume gibt es dafür nicht.'
            : 'Testraum ließ sich nicht anlegen (' + r.error + ').', 'error');
          btn.disabled = false;
          btn.textContent = before;
          return;
        }
        location.href = 'lehrer.html#' + r.code;
      } catch (e) {
        console.error('[mpskills] Testraum:', e);
        toast('Testraum ließ sich nicht anlegen: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = before;
      }
    });
  });
}

async function renderTools() {
  const host = document.getElementById('toolsHost');
  if (!host) return;
  const tools = await loadTools();

  if (!tools) {
    // Häufigster Fall beim Ausrollen: Migration 0078 ist noch nicht
    // gelaufen. Für Admins die technische Ursache mit dazu, für alle
    // anderen nur die Aussage.
    const s = window.getSessionUser?.();
    const tech = (s?.is_admin || s?.is_superadmin) && toolsError
      ? `<br><span class="tile-note">Technisch: ${esc(toolsError)} — läuft Migration 0078 schon?</span>`
      : '';
    host.innerHTML = `<div class="tools"><h2 class="tools-title">Werkzeuge</h2>
      <p class="tools-empty">Die Werkzeugliste ist gerade nicht erreichbar.${tech}</p></div>`;
    return;
  }

  if (tools.length === 0) {
    host.innerHTML = `<div class="tools"><h2 class="tools-title">Werkzeuge</h2>
      <p class="tools-empty">Hier ist noch nichts eingetragen.</p></div>`;
    return;
  }

  host.innerHTML = `<div class="tools">
      <h2 class="tools-title">Werkzeuge <span class="tools-count">${tools.length}</span></h2>
      <div class="tile-grid">${tools.map(toolCard).join('')}</div>
    </div>`;

  // Wo das Frontend eines Werkzeugs liegt. Braucht nur der
  // Testraum-Knopf, um die Vorgaben des Werkzeugs zu holen — der
  // Ordner steht neben der ID, damit ein Werkzeug umbenannt werden
  // kann, ohne dass Räume ihre tool_id verlieren (0078).
  window.__toolFolders = Object.fromEntries(tools.map(t => [t.id, t.folder]));

  wireToolButtons();
}

/* ══════════════════════════════════════════════════════════
   Rollenweiche
   ══════════════════════════════════════════════════════════
   Ein Ort, an dem entschieden wird, was die Seite zeigt. */
function roleOf(s) {
  if (!s)                              return 'guest';
  if (s.is_admin || s.is_superadmin)   return 'admin';
  if (s.teacher_status === 'approved') return 'teacher';
  if (s.teacher_status === 'pending')  return 'pending';
  if (s.teacher_status === 'rejected') return 'rejected';
  return 'noRole';
}

function renderState() {
  const host = document.getElementById('stateHost');
  const s    = window.getSessionUser?.() ?? null;
  const role = roleOf(s);
  const acts = (role === 'teacher' || role === 'admin');

  // Die Kopfzeile pflegt sich seit lib/userbar.js selbst — sie hängt
  // am selben session-changed-Event wie diese Funktion.

  // Der Code-Kasten entfällt für Lehrkräfte und Admins: sie kommen
  // über „Meine Räume" an dieselben Räume, von der anderen Seite.
  const join = document.getElementById('joinCard');
  if (join) join.hidden = acts;
  if (!acts) renderMyRooms();

  // Der Zugang gilt nur Gästen. Wer angemeldet ist, sieht statt der
  // beiden Formulare seinen Zustand — das ist dieselbe Frage, eine
  // Stufe weiter.
  const access = document.getElementById('accessSection');
  if (access) access.hidden = (role !== 'guest');
  if (role !== 'guest') closeAccess();

  // Kacheln nur für die, die damit etwas anfangen können.
  // Absichtlich nicht awaited: die Rollenweiche darf nicht auf das
  // Netz warten.
  const toolsHost = document.getElementById('toolsHost');
  if (acts) renderTools();
  else if (toolsHost) toolsHost.innerHTML = '';

  /* ─── Ansicht 1: Gast ───────────────────────────────────
     Der ganze Inhalt steht statisch im HTML. Hier bleibt nichts
     zu tun — und genau das ist der Punkt der Umstellung. */
  if (role === 'guest') {
    host.innerHTML = '';
    return;
  }

  /* ─── Ansichten 2 und 3 ─────────────────────────────────
     Stand wie bisher. Der Umbau ist ein eigener Schritt. */
  if (role === 'admin') {
    host.innerHTML = `
      <div class="state state--ok">
        <h2><span class="ic">🛡️</span> Du bist Admin</h2>
        <p>
          Als Admin darfst du hier alles sehen und testen, ohne eigene Freischaltung.
          Anträge von Lehrkräften bearbeitest du im
          <a href="../admin/index.html">Admin-Panel</a> unter „Lehrkräfte".
        </p>
      </div>`;
    return;
  }

  if (role === 'teacher') {
    host.innerHTML = `
      <div class="state state--ok">
        <h2><span class="ic">✓</span> Du bist freigeschaltet</h2>
        <p>
          Wähle unten ein Werkzeug: <strong>Testen</strong> macht dir einen eigenen Raum zum
          Ausprobieren, <strong>Für eine Klasse öffnen</strong> einen mit Titel und Code.
          Alles Weitere steht unter <a href="lehrer.html">Meine Räume</a>.
        </p>
      </div>`;
    return;
  }

  if (role === 'pending') {
    host.innerHTML = `
      <div class="state state--wait">
        <h2><span class="ic">⏳</span> Dein Zugang ist beantragt</h2>
        <p>
          Ein Admin schaltet dich frei — das passiert nicht automatisch. Wenn es dauert,
          sprich die Person an, die dir diese Seite gezeigt hat.
        </p>
        <p class="hint">
          In der Tablet-Schulung ist dein Konto davon unberührt: dort bist du ein
          gewöhnlicher Zugang und kannst ganz normal an einer Schulung teilnehmen.
        </p>
      </div>`;
    return;
  }

  if (role === 'rejected') {
    host.innerHTML = `
      <div class="state state--no">
        <h2><span class="ic">✕</span> Dein Antrag wurde abgelehnt</h2>
        <p>
          Für MPSkills bist du nicht freigeschaltet. Wenn das ein Missverständnis ist,
          sprich mit der Schulleitung oder der Schulung — danach kannst du erneut beantragen.
        </p>
        <div class="actions">
          <button type="button" class="btn" id="ctaRequest">Erneut beantragen</button>
        </div>
      </div>`;
    document.getElementById('ctaRequest').addEventListener('click', requestRole);
    return;
  }

  // noRole — angemeldeter Schulungs-Account ohne Lehrkraft-Bezug.
  host.innerHTML = `
    <div class="state state--invite">
      <h2><span class="ic">🔑</span> Du brauchst noch den Zugang</h2>
      <p>
        Du bist angemeldet, aber für MPSkills noch nicht freigeschaltet. Wenn du an dieser
        Schule unterrichtest, beantrage den Zugang — ein Admin schaltet dich dann frei.
      </p>
      <div class="actions">
        <button type="button" class="btn btn--primary" id="ctaRequest">Zugang beantragen</button>
      </div>
      <p class="hint">
        Bist du Schülerin oder Schüler? Dann brauchst du hier nichts zu beantragen —
        du bekommst von deiner Lehrkraft einen Code.
      </p>
    </div>`;
  document.getElementById('ctaRequest').addEventListener('click', requestRole);
}

/* ─── Zugang beantragen ───────────────────────────────── */
// RPC request_teacher_role (0077). Es gibt keine Policy, die einen User
// sein eigenes Profil schreiben lässt — deshalb eine RPC und kein PATCH.
async function requestRole() {
  const btn = document.getElementById('ctaRequest');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/request_teacher_role`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.__accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
    if (!res.ok) throw new Error(`rpc ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'unbekannt');

    // Lokalen Session-Cache nachziehen, damit die Seite sofort den
    // Warte-Zustand zeigt. Ein Reload würde denselben Wert liefern.
    const s = window.getSessionUser?.();
    if (s) s.teacher_status = data.status;
    renderState();
    toast('Antrag gestellt. Ein Admin schaltet dich frei.');
  } catch (e) {
    console.error('[mpskills] request_teacher_role:', e);
    if (btn) btn.disabled = false;
    toast('Antrag fehlgeschlagen: ' + e.message, 'error');
  }
}

/* ─── Anmelden ────────────────────────────────────────── */
async function doLogin(e) {
  e.preventDefault();
  const errBox = document.getElementById('loginError');
  errBox.hidden = true;

  if (!window.supabaseClient) {
    errBox.textContent = 'Verbindung nicht bereit. Bitte Seite neu laden.';
    errBox.hidden = false;
    return;
  }

  const slug     = document.getElementById('loginSchool').value;
  const account  = document.getElementById('loginAccount').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!account || !password) return;

  const email = `${account}@${slug}.${window.FAKE_EMAIL_DOMAIN}`;
  const btn = document.getElementById('loginSubmit');
  btn.disabled = true;
  try {
    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      errBox.textContent = 'Anmeldung fehlgeschlagen. Accountname, Schule oder Passwort stimmt nicht.';
      errBox.hidden = false;
      return;
    }
    // renderState läuft über das session-changed-Event und räumt den
    // Zugang selbst weg.
  } catch (ex) {
    errBox.textContent = 'Fehler bei der Anmeldung: ' + (ex?.message ?? ex);
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ─── Konto anlegen ───────────────────────────────────── */
const SIGNUP_ERRORS = {
  account_name_invalid: 'Accountname ist ungültig. 2–20 Zeichen, nur a-z, 0-9, . _ -.',
  account_name_blocked: 'Dieser Accountname ist nicht erlaubt.',
  account_name_taken:   'Dieser Accountname ist in dieser Schule schon vergeben.',
  display_name_invalid: 'Anzeigename ist ungültig. 2–24 Zeichen.',
  display_name_blocked: 'Dieser Anzeigename ist nicht erlaubt.',
  school_required:      'Bitte eine Schule auswählen.',
  school_unknown:       'Diese Schule ist nicht bekannt.',
  context_invalid:      'Interner Fehler beim Anmelde-Kontext. Bitte Seite neu laden.',
  rate_limit:           'Zu viele Versuche. Bitte später erneut probieren.',
  server_misconfigured: 'Server-Konfiguration fehlt. Bitte an die Schulung wenden.',
  profile_create_failed:'Konto konnte nicht angelegt werden. Bitte später erneut versuchen.',
  blacklist_check_failed:'Server-Prüfung fehlgeschlagen. Bitte später erneut.'
};

async function doRegister(e) {
  e.preventDefault();
  const errBox = document.getElementById('registerError');
  const okBox  = document.getElementById('registerSuccess');
  const btn    = document.getElementById('registerSubmit');
  errBox.hidden = true;
  okBox.hidden  = true;

  const school_slug  = document.getElementById('regSchool').value;
  const account_name = document.getElementById('regAccount').value.trim().toLowerCase();
  const display_name = document.getElementById('regDisplayName').value.trim();
  const password     = document.getElementById('regPassword').value;
  const password2    = document.getElementById('regPassword2').value;

  if (password !== password2) {
    errBox.textContent = 'Die beiden Passwörter stimmen nicht überein.';
    errBox.hidden = false;
    return;
  }

  btn.disabled = true;
  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // context='mpskills' — der eine Unterschied zur Schulungs-Anmeldung.
      body: JSON.stringify({
        school_slug, account_name, display_name, password,
        context: 'mpskills'
      })
    });

    let body = null;
    const raw = await res.text();
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { _raw: raw }; }

    if (!res.ok || !body?.ok) {
      const mapped = SIGNUP_ERRORS[body?.error]
        || (body?.error === 'password_policy' ? (body.message || 'Passwort erfüllt die Anforderungen nicht.') : null);
      errBox.textContent = mapped
        || `Anmeldung fehlgeschlagen (HTTP ${res.status}${body?.error ? ' · ' + body.error : ''}).`;
      errBox.hidden = false;
      btn.disabled = false;
      return;
    }

    okBox.textContent = 'Konto angelegt. Du wirst angemeldet — ein Admin schaltet dich für MPSkills frei.';
    okBox.hidden = false;

    const { error: loginErr } = await window.supabaseClient.auth.signInWithPassword({
      email: body.email, password
    });
    if (loginErr) {
      errBox.textContent = 'Konto angelegt, aber die Anmeldung schlug fehl: ' + loginErr.message;
      errBox.hidden = false;
      btn.disabled = false;
    }
    // Bei Erfolg übernimmt session-changed → renderState: der Zugang
    // klappt weg, an seiner Stelle steht der Warte-Zustand.
  } catch (ex) {
    console.error('[mpskills] signup:', ex);
    errBox.textContent = 'Netzwerkfehler: ' + (ex?.message ?? ex);
    errBox.hidden = false;
    btn.disabled = false;
  }
}

/* ─── Verdrahtung ─────────────────────────────────────── */
wireJoinForm();

document.getElementById('accessToggle').addEventListener('click', () => {
  if (accessOpen()) closeAccess(); else openAccess();
});
document.getElementById('loginForm').addEventListener('submit', doLogin);
document.getElementById('registerForm').addEventListener('submit', doRegister);

document.getElementById('infobar').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-info]');
  if (btn) openInfo(btn.dataset.info);
});

// Klick auf den dunklen Grund schließt — aber nur dort, nicht im Kasten.
for (const id of ['privacyModal', 'aboutModal']) {
  const el = document.getElementById(id);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-close]')) closeInfos();
  });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInfos(); });

window.addEventListener('lernwelt:session-changed', renderState);
window.addEventListener('lernwelt:no-profile', () => {
  toast('Zu diesem Zugang gibt es kein Profil mehr. Bitte neu anmelden.', 'error');
});

(async function boot() {
  // Die Ecke oben rechts schickt Gäste in denselben Kasten, in dem
  // die Erklärung steht — und nicht in ein Modal daneben.
  window.MPUserBar?.mount({
    onLogin:    () => openAccess('login'),
    onRegister: () => openAccess('register')
  });
  renderMyRooms();
  await (window.waitForSession?.() ?? Promise.resolve());
  renderState();
})();
