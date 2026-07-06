/* ══════════════════════════════════════════════════════════════
   admin/app.js — Admin-Panel-Logik
   ══════════════════════════════════════════════════════════════
   Zugriff nur mit is_admin=true. Schreibt direkt gegen Supabase
   REST-API mit dem JWT des Admins — die RLS-Policies
   (clusters_admin_write, profiles_admin_update) erlauben nur
   dann Writes, wenn is_admin() true zurückgibt.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const bootMask = document.getElementById('bootMask');
let currentSchoolId = null;
let clusterCache    = [];   // {id, name, season, opens_at, closes_at, member_count}
let userCache       = [];   // profiles rows

// ─── REST helper ──────────────────────────────────────────────
async function api(method, path, body) {
  const token = window.__accessToken;
  if (!token) throw new Error('kein Access-Token');
  const url = `${window.SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: window.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Prefer']       = 'return=representation';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    let err = text;
    try { err = JSON.parse(text).message || text; } catch {}
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return text ? JSON.parse(text) : null;
}

// ─── Boot ─────────────────────────────────────────────────────
(async function boot() {
  await (window.waitForSession?.() ?? Promise.resolve());
  const s = window.getSessionUser?.();

  if (!s) {
    console.log('[admin] kein Login → Landing');
    location.replace('../index.html');
    return;
  }
  if (!s.is_admin) {
    console.warn('[admin] kein Admin → Landing');
    location.replace('../index.html');
    return;
  }

  currentSchoolId = s.school_id;
  document.getElementById('userPillName').textContent = s.display_name || s.account_name;
  document.getElementById('brandSchool').textContent  = await schoolLabel(s.school_id);
  document.getElementById('userPill').hidden          = false;
  document.getElementById('tabnav').hidden            = false;
  document.getElementById('content').hidden           = false;

  wireUserMenu();
  wireTabs();
  wireClusterForm();
  wireClusterEditModal();
  wireUserFilters();

  // Cluster ZUERST — renderUsers braucht clusterCache für die Dropdown-Options.
  await loadClusters();
  await loadUsers();

  bootMask.classList.add('hidden');
  setTimeout(() => bootMask.remove(), 250);
})().catch(e => {
  console.error('[admin] Boot-Fehler:', e);
  bootMask.textContent = 'Fehler beim Laden: ' + e.message;
});

async function schoolLabel(schoolId) {
  try {
    const rows = await api('GET', `schools?select=name&id=eq.${schoolId}`);
    return rows[0]?.name || '';
  } catch { return ''; }
}

// ─── User-Menü ────────────────────────────────────────────────
function wireUserMenu() {
  const btn  = document.getElementById('userPillBtn');
  const menu = document.getElementById('userPillMenu');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', () => menu.hidden = true);
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    window.clearLocalGameState?.();
    await window.supabaseClient?.auth?.signOut();
    location.replace('../index.html');
  });
}

// ─── Tabs ────────────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById('panel-clusters').hidden = target !== 'clusters';
      document.getElementById('panel-users').hidden    = target !== 'users';
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   Cluster-Tab
   ══════════════════════════════════════════════════════════════ */

function wireClusterForm() {
  document.getElementById('clusterForm').addEventListener('submit', async e => {
    e.preventDefault();
    const feedback = document.getElementById('clFeedback');
    const btn      = document.getElementById('clSubmit');
    feedback.className = 'form-feedback';
    feedback.textContent = '';

    const name    = document.getElementById('clName').value.trim();
    const season  = parseInt(document.getElementById('clSeason').value, 10);
    const opensAt = document.getElementById('clOpens').value;
    const closesAt= document.getElementById('clCloses').value;

    if (!name)   { feedback.textContent = 'Name fehlt.'; feedback.classList.add('error'); return; }
    if (!season || season < 1) { feedback.textContent = 'Season ungültig.'; feedback.classList.add('error'); return; }

    btn.disabled = true;
    try {
      await api('POST', 'clusters', {
        school_id: currentSchoolId,
        name,
        season,
        opens_at:  toIso(opensAt),
        closes_at: toIso(closesAt)
      });
      feedback.textContent = 'Cluster angelegt.';
      feedback.classList.add('ok');
      e.target.reset();
      document.getElementById('clSeason').value = '1';
      await loadClusters();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadClusters() {
  const tbody = document.getElementById('clusterTbody');
  try {
    const rows = await api('GET',
      `clusters?select=id,name,season,opens_at,closes_at`
      + `&school_id=eq.${currentSchoolId}`
      + `&order=season.desc,opens_at.desc.nullslast`);
    clusterCache = rows;

    // Member-Count separat: alle User dieser Schule holen und pro cluster_id zählen
    const members = await api('GET',
      `profiles?select=cluster_id&school_id=eq.${currentSchoolId}`);
    const counts = {};
    for (const m of members) if (m.cluster_id) counts[m.cluster_id] = (counts[m.cluster_id] || 0) + 1;

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">Noch keine Cluster.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(c => renderClusterRow(c, counts[c.id] || 0)).join('');
    tbody.querySelectorAll('.js-cluster-edit').forEach(btn => {
      btn.addEventListener('click', () => openClusterEdit(btn.dataset.id));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderClusterRow(c, memberCount) {
  const now = Date.now();
  const opens  = c.opens_at  ? new Date(c.opens_at).getTime()  : null;
  const closes = c.closes_at ? new Date(c.closes_at).getTime() : null;
  let statusBadge = '<span class="badge open">offen</span>';
  if (opens  && now < opens)  statusBadge = '<span class="badge closed">geplant</span>';
  if (closes && now > closes) statusBadge = '<span class="badge closed">vorbei</span>';
  if (!opens && !closes)      statusBadge = '<span class="badge open">unbegrenzt</span>';
  return `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${c.season}</td>
      <td>${fmtDT(c.opens_at)}</td>
      <td>${fmtDT(c.closes_at)}</td>
      <td>${statusBadge}</td>
      <td>${memberCount}</td>
      <td><button class="btn small js-cluster-edit" data-id="${c.id}">Bearbeiten</button></td>
    </tr>`;
}

// ─── Cluster-Edit-Modal ──────────────────────────────────────
let editingClusterId = null;

function wireClusterEditModal() {
  const overlay = document.getElementById('clusterEditModal');
  const close   = document.getElementById('clusterEditClose');
  const form    = document.getElementById('clusterEditForm');

  const doClose = () => { overlay.hidden = true; editingClusterId = null; };
  close.addEventListener('click', doClose);
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!editingClusterId) return;
    const feedback = document.getElementById('edClFeedback');
    const btn      = document.getElementById('edClSubmit');
    feedback.className = 'form-feedback';
    feedback.textContent = '';

    const patch = {
      name:      document.getElementById('edClName').value.trim(),
      season:    parseInt(document.getElementById('edClSeason').value, 10),
      opens_at:  toIso(document.getElementById('edClOpens').value),
      closes_at: toIso(document.getElementById('edClCloses').value)
    };
    if (!patch.name) { feedback.textContent = 'Name fehlt.'; feedback.classList.add('error'); return; }
    if (!patch.season || patch.season < 1) { feedback.textContent = 'Season ungültig.'; feedback.classList.add('error'); return; }

    btn.disabled = true;
    try {
      await api('PATCH', `clusters?id=eq.${editingClusterId}`, patch);
      doClose();
      await loadClusters();
      renderUsers();  // Cluster-Namen/Seasons in User-Dropdown aktualisieren
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
}

function openClusterEdit(id) {
  const c = clusterCache.find(x => x.id === id);
  if (!c) return;
  editingClusterId = id;
  document.getElementById('edClName').value    = c.name;
  document.getElementById('edClSeason').value  = c.season;
  document.getElementById('edClOpens').value   = isoToLocalInput(c.opens_at);
  document.getElementById('edClCloses').value  = isoToLocalInput(c.closes_at);
  document.getElementById('edClFeedback').textContent = '';
  document.getElementById('clusterEditModal').hidden = false;
}

/* ══════════════════════════════════════════════════════════════
   User-Tab
   ══════════════════════════════════════════════════════════════ */

function wireUserFilters() {
  document.getElementById('userStatusFilter').addEventListener('change', renderUsers);
  document.getElementById('userSearch').addEventListener('input', renderUsers);
  document.getElementById('userReload').addEventListener('click', loadUsers);
}

async function loadUsers() {
  const tbody = document.getElementById('userTbody');
  try {
    const rows = await api('GET',
      `profiles?select=id,account_name,display_name,display_name_locked,status,cluster_id,is_admin`
      + `&school_id=eq.${currentSchoolId}`
      + `&order=status.asc,account_name.asc`);
    userCache = rows;
    renderUsers();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderUsers() {
  const tbody  = document.getElementById('userTbody');
  const status = document.getElementById('userStatusFilter').value;
  const q      = document.getElementById('userSearch').value.trim().toLowerCase();

  let rows = userCache;
  if (status !== 'all') rows = rows.filter(r => r.status === status);
  if (q) rows = rows.filter(r =>
    r.account_name.toLowerCase().includes(q) ||
    (r.display_name || '').toLowerCase().includes(q));

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Keine User passen zum Filter.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(renderUserRow).join('');

  // Handler nach dem Rendern anbringen
  tbody.querySelectorAll('.js-cluster-select').forEach(sel => {
    sel.addEventListener('change', () => setUserCluster(sel.dataset.userId, sel.value || null));
  });
  tbody.querySelectorAll('.js-activate').forEach(btn => {
    btn.addEventListener('click', () => activateUser(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-lock-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleNameLock(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-rename').forEach(btn => {
    btn.addEventListener('click', () => renameUser(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-pw-reset').forEach(btn => {
    btn.addEventListener('click', () => resetPassword(btn.dataset.userId));
  });
}

function renderUserRow(u) {
  const clusterOptions = ['<option value="">— kein Cluster —</option>']
    .concat(clusterCache.map(c =>
      `<option value="${c.id}" ${c.id === u.cluster_id ? 'selected' : ''}>${escapeHtml(c.name)} · S${c.season}</option>`
    )).join('');

  let statusBadge = `<span class="badge ${u.status}">${u.status}</span>`;
  if (u.is_admin) statusBadge += ' <span class="badge admin">admin</span>';

  const activateBtn = u.status === 'pending'
    ? `<button class="btn small primary js-activate" data-user-id="${u.id}">Freischalten</button>`
    : '';
  const lockBtn   = `<button class="btn small js-lock-toggle" data-user-id="${u.id}">${u.display_name_locked ? '🔒 Entsperren' : '🔓 Sperren'}</button>`;
  const renameBtn = `<button class="btn small js-rename"      data-user-id="${u.id}">Umbenennen</button>`;
  const pwBtn     = `<button class="btn small js-pw-reset"    data-user-id="${u.id}">Passwort</button>`;

  return `
    <tr>
      <td>${escapeHtml(u.account_name)}</td>
      <td>${escapeHtml(u.display_name || '—')}</td>
      <td>${statusBadge}</td>
      <td>
        <select class="js-cluster-select" data-user-id="${u.id}">${clusterOptions}</select>
      </td>
      <td>${u.display_name_locked ? '🔒 gesperrt' : '—'}</td>
      <td><div class="actions">${activateBtn}${renameBtn}${lockBtn}${pwBtn}</div></td>
    </tr>`;
}

async function setUserCluster(userId, clusterId) {
  try {
    await api('PATCH', `profiles?id=eq.${userId}`, { cluster_id: clusterId });
    // Lokal aktualisieren, kein Full-Reload
    const u = userCache.find(x => x.id === userId);
    if (u) u.cluster_id = clusterId;
    // Cluster-Member-Count neu ziehen — Card zeigt es an
    loadClusters();
  } catch (err) {
    alert('Cluster-Zuweisung fehlgeschlagen: ' + err.message);
    renderUsers();
  }
}

async function activateUser(userId) {
  try {
    await api('PATCH', `profiles?id=eq.${userId}`, { status: 'active' });
    const u = userCache.find(x => x.id === userId);
    if (u) u.status = 'active';
    renderUsers();
  } catch (err) {
    alert('Freischalten fehlgeschlagen: ' + err.message);
  }
}

async function toggleNameLock(userId) {
  const u = userCache.find(x => x.id === userId);
  if (!u) return;
  const next = !u.display_name_locked;
  try {
    await api('PATCH', `profiles?id=eq.${userId}`, { display_name_locked: next });
    u.display_name_locked = next;
    renderUsers();
  } catch (err) {
    alert('Lock-Toggle fehlgeschlagen: ' + err.message);
  }
}

async function renameUser(userId) {
  const u = userCache.find(x => x.id === userId);
  if (!u) return;
  const next = prompt(`Neuer Anzeigename für "${u.account_name}":`, u.display_name || '');
  if (next === null) return;
  const trimmed = next.trim();
  if (trimmed.length < 2 || trimmed.length > 24) {
    alert('Name muss 2–24 Zeichen haben.');
    return;
  }
  try {
    await api('PATCH', `profiles?id=eq.${userId}`, { display_name: trimmed });
    u.display_name = trimmed;
    renderUsers();
  } catch (err) {
    alert('Umbenennen fehlgeschlagen: ' + err.message);
  }
}

async function resetPassword(userId) {
  const u = userCache.find(x => x.id === userId);
  if (!u) return;
  const pw = prompt(`Neues Passwort für "${u.account_name}" (mind. 8 Zeichen):`);
  if (pw === null) return;
  if (pw.length < 8) {
    alert('Passwort zu kurz (mind. 8 Zeichen).');
    return;
  }
  try {
    const token = window.__accessToken;
    const res = await fetch('/api/admin_reset_password', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: userId, new_password: pw })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    alert(`Passwort für ${u.account_name} gesetzt.`);
  } catch (err) {
    alert('Passwort-Reset fehlgeschlagen: ' + err.message);
  }
}

/* ─── Utilities ─────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

// datetime-local ↔ ISO: Input erwartet "YYYY-MM-DDTHH:MM" in Ortszeit.
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
       + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(localVal) {
  return localVal ? new Date(localVal).toISOString() : null;
}
