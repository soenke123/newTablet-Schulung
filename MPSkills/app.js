/* ══════════════════════════════════════════════════════════════
   MPSkills — app.js  (Stufe 1: Rolle)
   ══════════════════════════════════════════════════════════════
   Diese Seite kann in Stufe 1 genau eine Sache: die Lehrkraft-Rolle.
   Anmelden, Konto anlegen, Rolle beantragen, Zustand anzeigen.
   Werkzeuge, Räume, Codes und QR kommen in Stufe 2/3.

   Zwei Dinge, die hier bewusst so sind:

   1) Es wird session.js aus dem Repo-Root wiederverwendet, mit
      demselben storageKey. Eine Lehrkraft, die in der Schulung
      angemeldet ist, ist hier automatisch mit angemeldet — ein
      Konto, zwei Bereiche. Anonyme Teilnehmer (ab Stufe 3) haben
      gar keine Auth-Session und sind davon nicht betroffen.

   2) Die Kontoanlage schickt context='mpskills' an /api/signup.
      Das ist der einzige Unterschied zur Anmeldung auf der
      Schulungs-Landing — und er entscheidet, dass dieses Konto
      NIE in einen Kurs kommt (Migration 0077 + api/signup.js).
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

async function fillSchoolSelect(selectEl) {
  const schools = await loadSchools();
  selectEl.innerHTML = schools
    .map(s => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`)
    .join('');
}

/* ─── Modals ──────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).hidden = false;
}
function closeModal(id) {
  document.getElementById(id).hidden = true;
}

async function openLogin() {
  document.getElementById('loginError').hidden = true;
  await fillSchoolSelect(document.getElementById('loginSchool'));
  openModal('loginModal');
  setTimeout(() => document.getElementById('loginAccount').focus(), 50);
}

async function openRegister() {
  document.getElementById('registerError').hidden = true;
  document.getElementById('registerSuccess').hidden = true;
  document.getElementById('registerSubmit').disabled = false;
  document.getElementById('registerForm').reset();
  await fillSchoolSelect(document.getElementById('regSchool'));
  openModal('registerModal');
  setTimeout(() => document.getElementById('regAccount').focus(), 50);
}

/* ─── Rollenweiche ────────────────────────────────────── */
// Ein Ort, an dem entschieden wird, was die Seite zeigt. Ab Stufe 2
// hängen hier die Werkzeug-Kacheln dran, deshalb schon jetzt als
// eigene Funktion mit einem einzigen Rückgabewert je Zustand.
function roleOf(s) {
  if (!s)                              return 'guest';
  if (s.is_admin || s.is_superadmin)   return 'admin';
  if (s.teacher_status === 'approved') return 'teacher';
  if (s.teacher_status === 'pending')  return 'pending';
  if (s.teacher_status === 'rejected') return 'rejected';
  return 'noRole';
}

const SOON = '<div class="soon"><strong>Ausbaustufe 1 von 7.</strong> '
  + 'Die Werkzeuge selbst, die Räume und der QR-Code kommen als Nächstes. '
  + 'Was hier schon steht, ist die Rolle — und die zählt: ohne sie kann niemand einen Raum aufmachen.</div>';

function renderState() {
  const host = document.getElementById('stateHost');
  const s    = window.getSessionUser?.() ?? null;
  const role = roleOf(s);

  // Kopfzeile
  document.getElementById('guestBar').hidden = role !== 'guest';
  document.getElementById('userBar').hidden  = role === 'guest';
  if (s) {
    document.getElementById('userName').textContent = s.display_name || s.account_name;
    const pill = document.getElementById('userRole');
    if (role === 'admin')        { pill.textContent = 'Admin';     pill.hidden = false; }
    else if (role === 'teacher') { pill.textContent = 'Lehrkraft'; pill.hidden = false; }
    else                         { pill.hidden = true; }
  }

  if (role === 'guest') {
    host.innerHTML = `
      <div class="state state--invite">
        <h2><span class="ic">🔑</span> Für Lehrkräfte</h2>
        <p>
          Melde dich an, um die Werkzeuge zu sehen und für eine Klasse freizuschalten.
          Du brauchst dafür einmal die Freischaltung durch die Schulleitung oder die Schulung.
        </p>
        <div class="actions">
          <button type="button" class="btn btn--primary" id="ctaRegister">Konto als Lehrkraft</button>
          <button type="button" class="btn" id="ctaLogin">Ich habe schon ein Konto</button>
        </div>
        <p class="hint">
          <strong>Für Schülerinnen und Schüler:</strong> Ihr braucht hier kein Konto.
          Ihr bekommt von der Lehrkraft einen Code oder einen QR-Code — das Feld dafür
          entsteht in der nächsten Ausbaustufe.
        </p>
      </div>`;
    document.getElementById('ctaLogin').addEventListener('click', openLogin);
    document.getElementById('ctaRegister').addEventListener('click', openRegister);
    return;
  }

  if (role === 'admin') {
    host.innerHTML = `
      <div class="state state--ok">
        <h2><span class="ic">🛡️</span> Du bist Admin</h2>
        <p>
          Als Admin darfst du hier alles sehen und testen, ohne eigene Freischaltung.
          Anträge von Lehrkräften bearbeitest du im
          <a href="../admin/index.html">Admin-Panel</a> unter „Lehrkräfte".
        </p>
        ${SOON}
      </div>`;
    return;
  }

  if (role === 'teacher') {
    host.innerHTML = `
      <div class="state state--ok">
        <h2><span class="ic">✓</span> Du bist freigeschaltet</h2>
        <p>Du kannst Werkzeuge für deine Klassen freischalten, sobald es welche gibt.</p>
        ${SOON}
      </div>`;
    return;
  }

  if (role === 'pending') {
    host.innerHTML = `
      <div class="state state--wait">
        <h2><span class="ic">⏳</span> Deine Freischaltung ist beantragt</h2>
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
      <h2><span class="ic">🔑</span> Du brauchst die Lehrkraft-Rolle</h2>
      <p>
        Du bist angemeldet, aber für MPSkills noch nicht freigeschaltet. Wenn du an dieser
        Schule unterrichtest, beantrage die Rolle — ein Admin schaltet dich dann frei.
      </p>
      <div class="actions">
        <button type="button" class="btn btn--primary" id="ctaRequest">Lehrkraft-Rolle beantragen</button>
      </div>
      <p class="hint">
        Bist du Schülerin oder Schüler? Dann brauchst du hier nichts zu beantragen —
        du bekommst von deiner Lehrkraft einen Code.
      </p>
    </div>`;
  document.getElementById('ctaRequest').addEventListener('click', requestRole);
}

/* ─── Rolle beantragen ────────────────────────────────── */
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
    closeModal('loginModal');
    // renderState läuft über das session-changed-Event.
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
      return;
    }
    setTimeout(() => closeModal('registerModal'), 1400);
  } catch (ex) {
    console.error('[mpskills] signup:', ex);
    errBox.textContent = 'Netzwerkfehler: ' + (ex?.message ?? ex);
    errBox.hidden = false;
    btn.disabled = false;
  }
}

/* ─── Abmelden ────────────────────────────────────────── */
// Gleicher Ablauf wie auf der Schulungs-Landing: erst die Highscores
// aus dem localStorage retten, dann den Spielstand des Geräts räumen,
// dann abmelden. Wer hier abmeldet, ist danach auch in der Schulung
// abgemeldet — ein Konto, ein Cookie.
async function doLogout() {
  await window.pushLocalHighscoresToServer?.().catch(() => {});
  window.clearLocalGameState?.();
  await window.supabaseClient?.auth?.signOut();
}

/* ─── Verdrahtung ─────────────────────────────────────── */
document.getElementById('loginBtn').addEventListener('click', openLogin);
document.getElementById('logoutBtn').addEventListener('click', doLogout);
document.getElementById('loginClose').addEventListener('click', () => closeModal('loginModal'));
document.getElementById('registerClose').addEventListener('click', () => closeModal('registerModal'));
document.getElementById('loginForm').addEventListener('submit', doLogin);
document.getElementById('registerForm').addEventListener('submit', doRegister);
document.getElementById('toRegister').addEventListener('click', () => {
  closeModal('loginModal');
  openRegister();
});
document.getElementById('toLogin').addEventListener('click', () => {
  closeModal('registerModal');
  openLogin();
});
// Klick auf den dunklen Grund schließt — aber nur dort, nicht im Kasten.
for (const id of ['loginModal', 'registerModal']) {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) closeModal(id);
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal('loginModal'); closeModal('registerModal'); }
});

window.addEventListener('lernwelt:session-changed', renderState);
window.addEventListener('lernwelt:no-profile', () => {
  toast('Zu diesem Zugang gibt es kein Profil mehr. Bitte neu anmelden.', 'error');
});

(async function boot() {
  await (window.waitForSession?.() ?? Promise.resolve());
  renderState();
})();
