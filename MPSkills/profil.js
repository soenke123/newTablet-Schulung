/* ══════════════════════════════════════════════════════════════
   MPSkills — profil.js
   ══════════════════════════════════════════════════════════════
   Das Gegenstück zu profil.html der Tablet-Schulung, auf das
   zugeschnitten, was hier gilt. Weg sind Kurs und Season — MPSkills
   kennt beides nicht, eine Lehrkraft hängt in keinem Kurs (0053).
   Dafür steht hier der Zustand der Lehrkraft-Rolle, und zwar mit
   Datum: „wartet auf Freischaltung" ist ohne „seit wann" eine
   Auskunft, auf die niemand reagieren kann.

   Drei Dinge kann die Seite:
     1) zeigen, wer man ist und was die Rolle gerade sagt
     2) das Profilbild wechseln (derselbe Katalog wie die Schulung)
     3) das Passwort ändern

   Was sie bewusst NICHT kann: die Lehrkraft-Rolle beantragen. Der
   Knopf steht auf der Landing, mitten in der Erklärung, warum man
   ihn drückt — hier stünde er ohne diesen Zusammenhang, und zwei
   Knöpfe für denselben RPC an zwei Orten laufen irgendwann
   auseinander. Von hier führt ein Link dorthin.

   Zum Avatar-Katalog: ../avatars.js leitet die freigeschalteten
   Bilder aus dem GameHub-Spielstand im localStorage ab. Eine
   Lehrkraft, die nie gespielt hat, bekommt deshalb die Eier — das
   ist der immer freigeschaltete Sockel des Katalogs und kein
   Fehler. Reiter werden nur für Gruppen gezeigt, in denen wirklich
   etwas liegt; bleibt nur einer übrig, entfällt die Reiterleiste.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* ─── Toast ───────────────────────────────────────────── */
let toastTimer = null;
function toast(message, kind) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (kind === 'error' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

const host = () => document.getElementById('profHost');

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ─── Der Zustand der Lehrkraft-Rolle ─────────────────────────
   Vier Zustände aus profiles.teacher_status (0077) plus der
   Sonderfall Admin: Admins sind implizit Lehrkräfte (can_teach()),
   ohne dass ihr teacher_status je etwas anderes als 'none' sagt.
   Stünde hier nur das Feld, läse ein Admin „keine Rolle" und
   könnte trotzdem alles — also steht die Wahrheit da und nicht
   der Spaltenwert. */
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

/* ─── Seite ───────────────────────────────────────────── */
function render(s) {
  const role = roleState(s);
  const avatarSrc = window.getAvatarUrl
    ? window.getAvatarUrl(s.avatar_id || window.DEFAULT_AVATAR_ID, '../')
    : '';

  host().innerHTML = `
    <div class="page-head">
      <div>
        <h1>Profil</h1>
        <p class="page-sub">Dein Konto gilt für MPSkills und die Tablet-Schulung gleichermaßen.</p>
      </div>
    </div>

    <section class="card">
      <div class="prof-head">
        <div class="prof-avcol">
          <button type="button" class="prof-av" id="avBtn" aria-label="Profilbild ändern">
            <img id="avImg" src="${esc(avatarSrc)}" alt="Profilbild" />
          </button>
          <button type="button" class="btn btn--sm" id="avChange">Bild ändern</button>
        </div>

        <dl class="prof-info">
          <dt>Anzeigename</dt><dd>${esc(s.display_name || '–')}</dd>
          <dt>Accountname</dt><dd>${esc(s.account_name || '–')}</dd>
          <dt>Schule</dt>     <dd>${esc(s.school_name || '–')}</dd>
          <dt>MPSkills</dt>   <dd><span class="prof-badge prof-badge--${role.cls}">${esc(role.label)}</span></dd>
        </dl>
      </div>
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

  document.getElementById('avBtn').addEventListener('click', openPicker);
  document.getElementById('avChange').addEventListener('click', openPicker);
  document.getElementById('pwForm').addEventListener('submit', changePassword);
}

function renderGuest() {
  host().innerHTML = `
    <div class="card card--join">
      <h1 class="join-h">Nicht angemeldet</h1>
      <p class="join-sub">Ein Profil gibt es nur mit Konto. Schülerinnen und Schüler brauchen hier keines —
        ihr kommt über den Code eurer Lehrkraft in den Raum.</p>
      <a class="btn btn--primary btn--wide" href="index.html">Zur Anmeldung</a>
    </div>`;
}

/* ─── Profilbild ──────────────────────────────────────────────
   Gespeichert wird über den RPC update_avatar_id — derselbe Weg
   wie in der Schulung, und der einzige: es gibt keine Policy, die
   einen User sein eigenes Profil schreiben lässt (0002/0053).
   Direkter fetch statt SDK-Builder, konsistent mit dem Rest des
   Projekts (die SDK hatte cross-tab-Lock-Probleme). */
let unlockedSet = new Set();
let groupsWithContent = [];
let currentGroup = 'egg';
let currentAvatarId = 'default';

function recomputeUnlocks() {
  unlockedSet = window.computeUnlockedAvatarIds
    ? window.computeUnlockedAvatarIds()
    : new Set(['default']);
  groupsWithContent = (window.AVATAR_GROUPS || []).filter(
    g => (window.AVATARS || []).some(a => a.group === g.id && unlockedSet.has(a.id))
  );
  if (!groupsWithContent.some(g => g.id === currentGroup)) {
    currentGroup = groupsWithContent[0]?.id || 'egg';
  }
}

function openPicker() {
  recomputeUnlocks();
  // Am eigenen Bild anfangen — wer nur die Stufe wechseln will,
  // sucht sonst erst die Gruppe, in der er schon steht.
  const own = (window.AVATARS || []).find(a => a.id === currentAvatarId);
  if (own && groupsWithContent.some(g => g.id === own.group)) currentGroup = own.group;
  renderTabs();
  renderGrid();
  document.getElementById('pickerModal').hidden = false;
}
function closePicker() {
  document.getElementById('pickerModal').hidden = true;
}

function renderTabs() {
  const el = document.getElementById('pickerTabs');
  // Ein einzelner Reiter ist keine Wahl, sondern eine Überschrift —
  // dann lieber keiner.
  el.hidden = groupsWithContent.length < 2;
  el.innerHTML = groupsWithContent.map(g =>
    `<button type="button" class="picker-tab${g.id === currentGroup ? ' on' : ''}" data-g="${esc(g.id)}">${esc(g.label)}</button>`
  ).join('');
  el.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => {
    currentGroup = b.dataset.g;
    renderTabs();
    renderGrid();
  }));
}

function renderGrid() {
  const el = document.getElementById('pickerGrid');
  const items = (window.AVATARS || [])
    .filter(a => a.group === currentGroup && unlockedSet.has(a.id));

  if (!items.length) {
    el.innerHTML = `<p class="tools-empty">Hier ist noch nichts freigeschaltet.</p>`;
    return;
  }

  el.innerHTML = items.map(a => `
    <button type="button" class="picker-tile${a.id === currentAvatarId ? ' on' : ''}" data-a="${esc(a.id)}">
      <img src="${esc(window.getAvatarUrl(a.id, '../'))}" alt="" />
      <span>${esc(a.label)}</span>
    </button>`).join('');

  el.querySelectorAll('[data-a]').forEach(b =>
    b.addEventListener('click', () => selectAvatar(b.dataset.a)));
}

async function selectAvatar(id) {
  if (id === currentAvatarId) { closePicker(); return; }
  if (!unlockedSet.has(id)) return;

  const prev = currentAvatarId;
  currentAvatarId = id;
  document.getElementById('avImg').src = window.getAvatarUrl(id, '../');
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
    document.getElementById('avImg').src = window.getAvatarUrl(prev, '../');
    renderGrid();
    toast('Speichern fehlgeschlagen. Bitte erneut versuchen.', 'error');
  }
}

/* ─── Passwort ────────────────────────────────────────────────
   Dieselbe Regel wie beim Anlegen des Kontos (api/signup.js):
   mindestens 8 Zeichen, Buchstabe und Zahl. Sie steht hier noch
   einmal, weil auth.updateUser sie nicht kennt — Supabase prüft
   nur seine eigene Mindestlänge, und eine Regel, die beim Anlegen
   gilt und beim Ändern nicht, ist keine Regel. */
function pwMsg(el, text) {
  const e = document.getElementById('pwErr');
  const o = document.getElementById('pwOk');
  e.hidden = true; o.hidden = true;
  const t = el === 'err' ? e : o;
  t.textContent = text;
  t.hidden = false;
}

async function changePassword(ev) {
  ev.preventDefault();
  const p1 = document.getElementById('pwNew').value;
  const p2 = document.getElementById('pwNew2').value;
  const btn = document.getElementById('pwSubmit');

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
    document.getElementById('pwForm').reset();
    pwMsg('ok', 'Passwort geändert. Beim nächsten Anmelden gilt das neue.');
  } catch (e) {
    pwMsg('err', 'Speichern fehlgeschlagen: ' + (e?.message || 'unbekannt'));
  } finally {
    btn.disabled = false;
    btn.textContent = before;
  }
}

/* ─── Verdrahtung ─────────────────────────────────────── */
document.getElementById('pickerClose').addEventListener('click', closePicker);
document.getElementById('pickerModal').addEventListener('click', (e) => {
  if (e.target.id === 'pickerModal') closePicker();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePicker();
});

// Meldet sich jemand in einem anderen Tab ab, steht hier sonst ein
// Profil, das niemandem mehr gehört.
window.addEventListener('lernwelt:session-changed', () => {
  const s = window.getSessionUser?.();
  if (!s) { closePicker(); renderGuest(); return; }
  currentAvatarId = s.avatar_id || window.DEFAULT_AVATAR_ID;
  render(s);
});

(async function boot() {
  window.MPUserBar?.mount();
  await (window.waitForSession?.() ?? Promise.resolve());
  const s = window.getSessionUser?.();
  if (!s) { renderGuest(); return; }
  currentAvatarId = s.avatar_id || window.DEFAULT_AVATAR_ID;
  render(s);
})();
