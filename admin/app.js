/* ══════════════════════════════════════════════════════════════
   admin/app.js — Admin-Panel-Logik
   ══════════════════════════════════════════════════════════════
   Zugriff nur mit is_admin=true. Schreibt direkt gegen Supabase
   REST-API mit dem JWT des Admins — die RLS-Policies
   (clusters_admin_write, profiles_admin_update, *_select_admin)
   erlauben Writes/Reads nur wenn is_admin() true zurückgibt.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const bootMask = document.getElementById('bootMask');
let currentSchoolId = null;
let currentUserId   = null;   // eingeloggter Admin — für Self-Delete-Schutz
let clusterCache    = [];     // {id, name, season, opens_at, closes_at}
let userCache       = [];     // profiles rows (angereichert mit progress-Daten wenn geladen)
let progressLoaded  = false;  // game_state/wallets/user_collectibles einmal nachgeladen?

// UI-State — überlebt Session-Reload für konsistente Ansicht
const uiState = loadUiState();

function loadUiState() {
  const fallback = { view: 'admin', sort: { key: 'created_at', dir: 'desc' } };
  try {
    const raw = sessionStorage.getItem('admin_ui_state');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // Alte View-Namen abfangen (Migration nach Account-View-Wegfall)
    if (parsed.view !== 'admin' && parsed.view !== 'progress') parsed.view = 'admin';
    return parsed;
  } catch(e) { return fallback; }
}
function saveUiState() {
  try { sessionStorage.setItem('admin_ui_state', JSON.stringify(uiState)); } catch(e) {}
}

// Auswahl-Set für Bulk-Aktionen
const selectedIds = new Set();

// Legendary-Kreaturen (spiegelt LEGENDARY_CREATURES in GameHub/creatures.js:436).
// Wenn dort ergänzt wird → hier nachziehen. Bewusst duplizierte Wahrheit,
// damit der Admin-Panel ohne GameHub-Import laufen kann.
const LEGENDARY_CREATURES = new Set([
  'robot', 'pfau', 'chinDrache', 'schnabeltier'
]);

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
    let msg = text, code = null, details = null;
    try {
      const parsed = JSON.parse(text);
      msg     = parsed.message || text;
      code    = parsed.code    || null;
      details = parsed.details || null;
    } catch {}
    const e = new Error(`HTTP ${res.status}: ${msg}`);
    e.status  = res.status;
    e.pgCode  = code;
    e.details = details;
    throw e;
  }
  return text ? JSON.parse(text) : null;
}

// Postgres-Fehler → deutsche Klartext-Meldung für den Admin.
function humanizeClusterError(err) {
  if (err.pgCode === '23P01') return 'Zeitfenster überschneidet sich mit einem anderen Kurs. Bitte anderes Fenster wählen.';
  if (err.pgCode === '23514') return 'Ungültiges Zeitfenster (Start vor Ende, max. 7 Tage).';
  if (err.pgCode === '23502') return 'Öffnungs- und Schließzeit sind Pflicht.';
  return err.message;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function validateClusterWindow(opensAt, closesAt) {
  if (!opensAt || !closesAt)   return 'Öffnungs- und Schließzeit sind Pflicht.';
  const o = new Date(opensAt).getTime();
  const c = new Date(closesAt).getTime();
  if (!isFinite(o) || !isFinite(c)) return 'Zeitwerte ungültig.';
  if (o >= c)                  return 'Öffnungszeit muss vor Schließzeit liegen.';
  if (c - o > WEEK_MS)         return 'Anmeldefenster darf maximal 7 Tage groß sein.';
  return null;
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
  currentUserId   = s.id;
  document.getElementById('userPillName').textContent = s.display_name || s.account_name;
  document.getElementById('brandSchool').textContent  = await schoolLabel(s.school_id);
  document.getElementById('userPill').hidden          = false;
  document.getElementById('tabnav').hidden            = false;
  document.getElementById('content').hidden           = false;

  wireUserMenu();
  wireTabs();
  wireClusterForm();
  wireClusterEditModal();
  wireClusterDeleteModal();
  wireUserFilters();
  wireViewSwitch();
  wireBulkBar();
  wireDeleteModal();
  wireDetailModal();
  wireDashboard();

  await loadClusters();  // erst Cluster (User-Dropdowns brauchen sie)
  await loadUsers();
  loadDashboard(currentSchoolId);  // fire-and-forget — Dashboard ist default-Tab

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
const TAB_PANELS = ['dashboard', 'clusters', 'users'];

function wireTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      for (const p of TAB_PANELS) {
        document.getElementById(`panel-${p}`).hidden = target !== p;
      }
      // Dashboard lädt beim ersten Öffnen — Cluster & User haben ihren
      // eigenen initialen Load in init().
      if (target === 'dashboard' && !dashboardLoaded) {
        loadDashboard(currentSchoolId);
      }
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
    const winErr = validateClusterWindow(opensAt, closesAt);
    if (winErr) { feedback.textContent = winErr; feedback.classList.add('error'); return; }

    btn.disabled = true;
    try {
      await api('POST', 'clusters', {
        school_id: currentSchoolId, name, season,
        opens_at: toIso(opensAt), closes_at: toIso(closesAt)
      });
      feedback.textContent = 'Cluster angelegt.';
      feedback.classList.add('ok');
      e.target.reset();
      document.getElementById('clSeason').value = '1';
      await loadClusters();
    } catch (err) {
      feedback.textContent = humanizeClusterError(err);
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

    const members = await api('GET',
      `profiles?select=cluster_id&school_id=eq.${currentSchoolId}`);
    const counts = {};
    for (const m of members) if (m.cluster_id) counts[m.cluster_id] = (counts[m.cluster_id] || 0) + 1;

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">Noch keine Cluster.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(c => renderClusterRow(c, counts[c.id] || 0)).join('');
      tbody.querySelectorAll('.js-cluster-edit').forEach(btn => {
        btn.addEventListener('click', () => openClusterEdit(btn.dataset.id));
      });
      tbody.querySelectorAll('.js-cluster-delete').forEach(btn => {
        btn.addEventListener('click', () => openClusterDelete(btn.dataset.id, counts[btn.dataset.id] || 0));
      });
    }

    // Bulk-Cluster-Dropdown aktuell halten
    refreshBulkClusterOptions();
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
      <td>
        <button class="btn small js-cluster-edit"   data-id="${c.id}">Bearbeiten</button>
        <button class="btn small danger js-cluster-delete" data-id="${c.id}">Löschen</button>
      </td>
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

    const opensLocal  = document.getElementById('edClOpens').value;
    const closesLocal = document.getElementById('edClCloses').value;
    const patch = {
      name:      document.getElementById('edClName').value.trim(),
      season:    parseInt(document.getElementById('edClSeason').value, 10),
      opens_at:  toIso(opensLocal),
      closes_at: toIso(closesLocal)
    };
    if (!patch.name) { feedback.textContent = 'Name fehlt.'; feedback.classList.add('error'); return; }
    if (!patch.season || patch.season < 1) { feedback.textContent = 'Season ungültig.'; feedback.classList.add('error'); return; }
    const winErr = validateClusterWindow(opensLocal, closesLocal);
    if (winErr) { feedback.textContent = winErr; feedback.classList.add('error'); return; }

    btn.disabled = true;
    try {
      await api('PATCH', `clusters?id=eq.${editingClusterId}`, patch);
      doClose();
      await loadClusters();
      renderUsers();
    } catch (err) {
      feedback.textContent = humanizeClusterError(err);
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

// ─── Cluster-Delete-Modal ────────────────────────────────────
// State: welches Cluster + wie viele Mitglieder. Der Modus (nur Cluster
// vs. Cluster+User) kommt aus dem Radio-Button. Bei 0 Mitgliedern wird
// das Options-Modal übersprungen und direkt gelöscht (delete_users=false
// ist da eh äquivalent). Bei „Cluster+Userdaten" und >20 Mitgliedern
// verlangen wir eine Text-Confirmation wie beim Bulk-User-Delete.
let clusterDeleteState = null;

function wireClusterDeleteModal() {
  const overlay = document.getElementById('clusterDeleteModal');
  const close   = document.getElementById('clusterDeleteClose');
  const cancel  = document.getElementById('clusterDeleteCancelBtn');
  const confirm = document.getElementById('clusterDeleteConfirmBtn');
  const input   = document.getElementById('clusterDeleteConfirmInput');
  const radios  = overlay.querySelectorAll('input[name="clDelMode"]');

  const doClose = () => {
    overlay.hidden = true;
    clusterDeleteState = null;
    radios.forEach(r => { r.checked = false; });
    overlay.querySelectorAll('.cluster-delete-option').forEach(o => o.classList.remove('selected'));
    document.getElementById('clusterDeleteConfirmLabel').hidden = true;
    input.value = '';
    input.dataset.expected = '';
    confirm.disabled = true;
    document.getElementById('clusterDeleteFeedback').textContent = '';
    document.getElementById('clusterDeleteFeedback').className   = 'form-feedback';
  };
  close.addEventListener('click', doClose);
  cancel.addEventListener('click', doClose);
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });

  radios.forEach(r => r.addEventListener('change', () => {
    overlay.querySelectorAll('.cluster-delete-option').forEach(o => o.classList.remove('selected'));
    r.closest('.cluster-delete-option').classList.add('selected');
    updateClusterDeleteConfirmState();
  }));
  input.addEventListener('input', updateClusterDeleteConfirmState);

  confirm.addEventListener('click', confirmClusterDelete);
}

function updateClusterDeleteConfirmState() {
  if (!clusterDeleteState) return;
  const overlay = document.getElementById('clusterDeleteModal');
  const confirm = document.getElementById('clusterDeleteConfirmBtn');
  const label   = document.getElementById('clusterDeleteConfirmLabel');
  const input   = document.getElementById('clusterDeleteConfirmInput');
  const mode    = overlay.querySelector('input[name="clDelMode"]:checked')?.value;
  if (!mode) { confirm.disabled = true; label.hidden = true; return; }

  const memberCount = clusterDeleteState.memberCount;
  const needsTextConfirm = mode === 'cluster_and_users' && memberCount > 20;
  if (needsTextConfirm) {
    const expected = `Ja alle ${memberCount} SuS unwiderruflich löschen`;
    label.hidden = false;
    input.placeholder = expected;
    input.dataset.expected = expected;
    confirm.disabled = input.value !== expected;
  } else {
    label.hidden = true;
    input.dataset.expected = '';
    input.value = '';
    confirm.disabled = false;
  }
}

function openClusterDelete(clusterId, memberCount) {
  const c = clusterCache.find(x => x.id === clusterId);
  if (!c) return;

  // Leerer Cluster → kein Options-Modal, einfacher Confirm
  if (memberCount === 0) {
    if (!window.confirm(`Cluster „${c.name}" wirklich löschen?`)) return;
    performClusterDelete(clusterId, false).catch(err =>
      showToast('Löschen fehlgeschlagen: ' + err.message, 'error'));
    return;
  }

  clusterDeleteState = { clusterId, memberCount, clusterName: c.name };
  document.getElementById('clusterDeleteTitle').textContent = `Cluster „${c.name}" löschen?`;
  document.getElementById('clusterDeleteInfo').textContent =
    memberCount === 1
      ? '1 Schüler:in ist diesem Cluster zugewiesen.'
      : `${memberCount} Schüler:innen sind diesem Cluster zugewiesen.`;
  updateClusterDeleteConfirmState();
  document.getElementById('clusterDeleteModal').hidden = false;
}

async function confirmClusterDelete() {
  if (!clusterDeleteState) return;
  const overlay = document.getElementById('clusterDeleteModal');
  const mode    = overlay.querySelector('input[name="clDelMode"]:checked')?.value;
  if (!mode) return;
  const deleteUsers = mode === 'cluster_and_users';

  const fb  = document.getElementById('clusterDeleteFeedback');
  const btn = document.getElementById('clusterDeleteConfirmBtn');
  fb.className = 'form-feedback';
  fb.textContent = 'Lösche …';
  btn.disabled = true;
  try {
    const body = await performClusterDelete(clusterDeleteState.clusterId, deleteUsers);
    overlay.hidden = true;
    const users = body.users_deleted ?? 0;
    const failCount = (body.failed || []).length;
    if (deleteUsers) {
      if (failCount > 0) {
        showToast(`Cluster gelöscht. ${users} User entfernt, ${failCount} fehlgeschlagen.`, 'error');
      } else if (users > 0) {
        showToast(`Cluster + ${users} User gelöscht.`);
      } else {
        showToast('Cluster gelöscht.');
      }
    } else {
      showToast('Cluster gelöscht.');
    }
    clusterDeleteState = null;
  } catch (err) {
    fb.textContent = 'Fehler: ' + err.message;
    fb.classList.add('error');
    btn.disabled = false;
  }
}

async function performClusterDelete(clusterId, deleteUsers) {
  const token = window.__accessToken;
  const res = await fetch('/api/admin_delete_cluster', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cluster_id: clusterId, delete_users: deleteUsers })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) throw new Error(body?.error || `HTTP ${res.status}`);

  // Cluster-Cache anpassen und Tabellen neu laden.
  // Bei delete_users=true kann es Teilfehler geben (body.failed) — dann sind
  // manche Profile noch da. Ein Full-Reload der User ist einfacher und sicher.
  clusterCache = clusterCache.filter(c => c.id !== clusterId);
  if (deleteUsers) {
    await loadUsers();  // frisch aus DB, cluster_id ist per FK schon null
  } else {
    for (const u of userCache) if (u.cluster_id === clusterId) u.cluster_id = null;
  }
  await loadClusters();
  renderUsers();
  return body;
}

/* ══════════════════════════════════════════════════════════════
   Dashboard-Tab
   ══════════════════════════════════════════════════════════════
   Alle Aggregation-Functions nehmen schoolId als Argument. Aktuell
   läuft nur eine Schule → nur ein school-panel. Wenn später ein
   Super-Admin (mehrschulen-fähig) kommt, loopen wir hier über alle
   Schulen und rendern eine Section pro Schule + eine Total-Section.
   ══════════════════════════════════════════════════════════════ */

let dashboardLoaded = false;
const ACTIVE_THRESHOLD_DAYS   = 14;  // Cluster gilt als "regelmäßig aktiv" wenn ≥1 User in dieser Zeit aktiv war
const PENDING_ALARM_DAYS      = 7;   // Pending seit >7d → Aufmerksamkeit
const CLUSTER_DEAD_DAYS       = 30;  // Cluster ohne Aktivität >30d, aber mit Mitgliedern → verwaist
const CLUSTER_OPENING_WINDOW  = 48 * 3600 * 1000;  // Cluster öffnet in <48h → Info

function wireDashboard() {
  document.getElementById('dashReload').addEventListener('click', async () => {
    dashboardLoaded = false;
    await loadDashboard(currentSchoolId);
  });
}

async function loadDashboard(schoolId) {
  const container = document.getElementById('dashboardContent');
  container.innerHTML = '<p class="empty">Lade …</p>';
  try {
    const data = await fetchDashboardData(schoolId);
    const agg  = aggregateDashboard(data);
    container.innerHTML = renderDashboard(agg, data.schoolName);
    dashboardLoaded = true;
  } catch (err) {
    console.error('[dashboard]', err);
    container.innerHTML = `<p class="empty">Fehler: ${escapeHtml(err.message)}</p>`;
  }
}

async function fetchDashboardData(schoolId) {
  // Alle Queries parallel. Wir lesen roh, aggregieren clientseitig
  // (Datenmenge ist mit einer Schule überschaubar; für Skalierung
  // später eine RPC dashboard_stats(school_id) empfehlenswert).
  const cheatSince = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [profiles, clusters, gameStates, wallets, shopStates, school, cheatFlags] = await Promise.all([
    api('GET',
      `profiles?select=id,account_name,status,cluster_id,created_at,last_login_at`
      + `&school_id=eq.${schoolId}`),
    api('GET',
      `clusters?select=id,name,opens_at,closes_at`
      + `&school_id=eq.${schoolId}`),
    api('GET', `game_state?select=user_id,updated_at`),
    api('GET', `wallets?select=user_id,coins,updated_at`),
    api('GET', `user_collectibles?select=user_id,value,updated_at&key=eq.shop_state`),
    api('GET', `schools?select=name&id=eq.${schoolId}`),
    api('GET',
      `cheat_flags?select=user_id,game_id,reason,detail,created_at`
      + `&created_at=gte.${encodeURIComponent(cheatSince)}`
      + `&order=created_at.desc&limit=200`)
  ]);

  // Auf Schul-User filtern — game_state/wallets/user_collectibles sind aktuell
  // nicht per RLS auf die eigene Schule beschränkt (siehe Migration 0012-Kommentar).
  const schoolUserIds = new Set(profiles.map(p => p.id));
  return {
    profiles,
    clusters,
    gameStates: gameStates.filter(g => schoolUserIds.has(g.user_id)),
    wallets:    wallets.filter(w => schoolUserIds.has(w.user_id)),
    shopStates: shopStates.filter(s => schoolUserIds.has(s.user_id)),
    cheatFlags: cheatFlags.filter(f => schoolUserIds.has(f.user_id)),
    schoolName: school[0]?.name || ''
  };
}

function aggregateDashboard(d) {
  const now = Date.now();
  const activeMs  = ACTIVE_THRESHOLD_DAYS * 86400_000;
  const pendingMs = PENDING_ALARM_DAYS   * 86400_000;
  const deadMs    = CLUSTER_DEAD_DAYS    * 86400_000;

  // Pro-User last_active_at aus allen Signal-Quellen
  const lastActiveByUser = new Map();
  const bump = (uid, ts) => {
    if (!uid || !ts) return;
    const t = Date.parse(ts);
    if (Number.isNaN(t)) return;
    const cur = lastActiveByUser.get(uid) || 0;
    if (t > cur) lastActiveByUser.set(uid, t);
  };
  for (const p of d.profiles) bump(p.id, p.last_login_at);
  for (const g of d.gameStates) bump(g.user_id, g.updated_at);
  for (const w of d.wallets)    bump(w.user_id, w.updated_at);
  for (const s of d.shopStates) bump(s.user_id, s.updated_at);

  // Kernzahlen
  const total = d.profiles.length;
  const active = d.profiles.filter(p => p.status === 'active').length;
  const pending = d.profiles.filter(p => p.status === 'pending').length;
  const pendingOld = d.profiles.filter(p =>
    p.status === 'pending' && p.created_at && (now - Date.parse(p.created_at) > pendingMs)
  ).length;
  const activeNoCluster = d.profiles.filter(p => p.status === 'active' && !p.cluster_id).length;

  // "Regelmäßig aktive" Cluster
  const membersByCluster = new Map();
  for (const p of d.profiles) {
    if (!p.cluster_id) continue;
    const arr = membersByCluster.get(p.cluster_id) || [];
    arr.push(p.id);
    membersByCluster.set(p.cluster_id, arr);
  }
  const activeClusterIds = new Set();
  const deadClusters = [];
  for (const c of d.clusters) {
    const members = membersByCluster.get(c.id) || [];
    if (members.length === 0) continue;
    const anyRecent = members.some(uid => (lastActiveByUser.get(uid) || 0) > now - activeMs);
    if (anyRecent) activeClusterIds.add(c.id);
    const anyIn30d = members.some(uid => (lastActiveByUser.get(uid) || 0) > now - deadMs);
    if (!anyIn30d) deadClusters.push({ cluster: c, memberCount: members.length });
  }

  // Coins & Kristalle gesamt
  const walletByUser = new Map(d.wallets.map(w => [w.user_id, w.coins || 0]));
  const shopByUser   = new Map(d.shopStates.map(s => [s.user_id, s.value || {}]));
  let totalCoins = 0, totalKristalle = 0;
  for (const p of d.profiles) {
    const wc     = walletByUser.get(p.id) || 0;
    const shop   = shopByUser.get(p.id) || {};
    const banked = Number(shop.bankedCoins) || 0;
    const spent  = Number(shop.spentCoins)  || 0;
    totalCoins    += Math.max(0, wc + banked - spent);
    totalKristalle += Number(shop.kristalle) || 0;
  }

  // Aktivitäts-Chart: letzte 7 Tage, distinct User mit ≥1 Signal an dem Tag
  const days = [];
  const dayKey = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  for (let i = 6; i >= 0; i--) {
    const t = now - i * 86400_000;
    days.push({ key: dayKey(t), label: new Date(t).toLocaleDateString('de-DE', { weekday: 'short' }), users: new Set() });
  }
  const dayIndex = new Map(days.map((d, i) => [d.key, i]));
  const addSignal = (uid, ts) => {
    if (!uid || !ts) return;
    const t = Date.parse(ts);
    if (Number.isNaN(t)) return;
    const k = dayKey(t);
    const idx = dayIndex.get(k);
    if (idx !== undefined) days[idx].users.add(uid);
  };
  for (const p of d.profiles) addSignal(p.id, p.last_login_at);
  for (const g of d.gameStates) addSignal(g.user_id, g.updated_at);
  for (const w of d.wallets)    addSignal(w.user_id, w.updated_at);
  for (const s of d.shopStates) addSignal(s.user_id, s.updated_at);
  const activityByDay = days.map(d => ({ label: d.label, count: d.users.size }));
  const activityMax = Math.max(1, ...activityByDay.map(x => x.count));

  // Cheat-Flags der letzten 7 Tage, nach User gruppiert
  const cheatByUser = new Map();
  for (const f of (d.cheatFlags || [])) {
    const arr = cheatByUser.get(f.user_id) || [];
    arr.push(f);
    cheatByUser.set(f.user_id, arr);
  }
  const cheatUserCount = cheatByUser.size;
  const cheatFlagTotal = (d.cheatFlags || []).length;

  // Aufmerksamkeits-Liste (sortiert nach Dringlichkeit)
  const attention = [];
  if (cheatUserCount > 0) {
    const accountByUser = new Map(d.profiles.map(p => [p.id, p.account_name]));
    const names = [...cheatByUser.keys()]
      .map(uid => accountByUser.get(uid))
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    attention.push({
      level: 'danger',
      icon: '🚨',
      title: `${cheatFlagTotal} auffällige Submits (${cheatUserCount} User, 7 Tage)`,
      sub: names ? `Betroffen: ${names}${cheatUserCount > 3 ? ' …' : ''}` : 'Cheat-Versuche wurden geblockt.'
    });
  }
  if (pendingOld > 0) {
    attention.push({
      level: 'warn',
      icon: '⏳',
      title: `${pendingOld} User pending seit >${PENDING_ALARM_DAYS} Tagen`,
      sub: 'Freischalten oder löschen im User-Tab.'
    });
  }
  if (activeNoCluster > 0) {
    attention.push({
      level: 'warn',
      icon: '🎯',
      title: `${activeNoCluster} aktive User ohne Cluster`,
      sub: 'Können sich nicht einloggen. Cluster im User-Tab zuweisen.'
    });
  }
  for (const dc of deadClusters) {
    attention.push({
      level: 'info',
      icon: '💤',
      title: `Cluster „${dc.cluster.name}" — 0 Aktivität in >${CLUSTER_DEAD_DAYS}d`,
      sub: `${dc.memberCount} Mitglieder, aber keiner war aktiv. Löschen oder ignorieren.`
    });
  }
  for (const c of d.clusters) {
    if (!c.opens_at) continue;
    const opens = Date.parse(c.opens_at);
    if (Number.isNaN(opens)) continue;
    const delta = opens - now;
    if (delta > 0 && delta < CLUSTER_OPENING_WINDOW) {
      const h = Math.round(delta / 3600_000);
      attention.push({
        level: 'info',
        icon: '📅',
        title: `Cluster „${c.name}" öffnet in ${h} Stunden`,
        sub: 'Anmeldungen werden ab dann möglich.'
      });
    }
  }

  return {
    active, total, pending, pendingOld, activeNoCluster,
    activeClusters: activeClusterIds.size,
    totalClusters: d.clusters.length,
    totalCoins, totalKristalle,
    activityByDay, activityMax,
    attention
  };
}

function renderDashboard(a, schoolName) {
  const fmtNum = (n) => n.toLocaleString('de-DE');

  const pendingValueClass = a.pendingOld > 0 ? 'dash-card__value dash-card__value--warn' : 'dash-card__value';
  const pendingSub = a.pendingOld > 0
    ? `⚠ ${a.pendingOld} seit >${PENDING_ALARM_DAYS} Tagen`
    : (a.pending > 0 ? 'neu, unter Schwelle' : 'keine offenen');

  const cards = `
    <div class="dash-cards">
      <div class="dash-card">
        <span class="dash-card__label">Aktive User</span>
        <span class="dash-card__value">${a.active}</span>
        <span class="dash-card__sub">von ${a.total} gesamt</span>
      </div>
      <div class="dash-card">
        <span class="dash-card__label">Pending</span>
        <span class="${pendingValueClass}">${a.pending}</span>
        <span class="dash-card__sub">${escapeHtml(pendingSub)}</span>
      </div>
      <div class="dash-card">
        <span class="dash-card__label">Regelmäßig aktive Cluster</span>
        <span class="dash-card__value">${a.activeClusters} / ${a.totalClusters}</span>
        <span class="dash-card__sub">≥1 User in letzten ${ACTIVE_THRESHOLD_DAYS}d aktiv</span>
      </div>
      <div class="dash-card">
        <span class="dash-card__label">Coins & Kristalle</span>
        <span class="dash-card__value">${fmtNum(a.totalCoins)} 🪙</span>
        <span class="dash-card__sub">${fmtNum(a.totalKristalle)} 💎 · Summe verfügbar</span>
      </div>
    </div>`;

  const activityRows = a.activityByDay.map((d, i) => {
    const pct = Math.round((d.count / a.activityMax) * 100);
    const today = i === a.activityByDay.length - 1;
    return `
      <div class="activity-row${today ? ' today' : ''}">
        <span class="activity-row__label">${escapeHtml(d.label)}</span>
        <div class="activity-row__bar"><div class="activity-row__bar-fill" style="width:${pct}%;"></div></div>
        <span class="activity-row__value">${d.count}</span>
      </div>`;
  }).join('');

  const attentionHtml = a.attention.length === 0
    ? '<div class="attention-empty">Nichts zu tun. Alles läuft.</div>'
    : a.attention.map(x => `
        <div class="attention-item attention-item--${x.level}">
          <span class="attention-item__icon">${x.icon}</span>
          <div class="attention-item__body">
            <strong>${escapeHtml(x.title)}</strong>
            <small>${escapeHtml(x.sub)}</small>
          </div>
        </div>`).join('');

  return `
    <section class="school-panel" data-school-id="${escapeHtml(currentSchoolId)}">
      ${schoolName ? `<h3 class="school-panel-title">${escapeHtml(schoolName)}</h3>` : ''}
      ${cards}
      <div class="dash-row">
        <div class="card">
          <h3>Aktivität (letzte 7 Tage)</h3>
          <div class="activity-chart">${activityRows}</div>
        </div>
        <div class="card">
          <h3>Braucht Aufmerksamkeit</h3>
          <div class="attention-list">${attentionHtml}</div>
        </div>
      </div>
    </section>
  `;
}

/* ══════════════════════════════════════════════════════════════
   User-Tab
   ══════════════════════════════════════════════════════════════ */

function wireUserFilters() {
  document.getElementById('userStatusFilter').addEventListener('change', renderUsers);
  document.getElementById('userSearch').addEventListener('input', renderUsers);
  document.getElementById('userReload').addEventListener('click', async () => {
    progressLoaded = false;  // erzwinge Neuladen der Progress-Daten
    await loadUsers();
  });
}

function wireViewSwitch() {
  const switchEl = document.getElementById('userViewSwitch');
  // Initialen aktiven Button aus uiState setzen
  switchEl.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === uiState.view);
    b.addEventListener('click', async () => {
      uiState.view = b.dataset.view;
      saveUiState();
      switchEl.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      // Fortschritts-Daten erst on-demand
      if (uiState.view === 'progress' && !progressLoaded) {
        await loadProgressData();
      }
      renderUsers();
    });
  });
}

async function loadUsers() {
  const tbody = document.getElementById('userTbody');
  try {
    const rows = await api('GET',
      `profiles?select=id,account_name,display_name,display_name_locked,status,cluster_id,is_admin,avatar_id,created_at`
      + `&school_id=eq.${currentSchoolId}`);
    userCache = rows;

    // Bei aktiver Progress-View direkt mitziehen
    if (uiState.view === 'progress' && !progressLoaded) {
      await loadProgressData();
    }

    renderUsers();
  } catch (err) {
    tbody.innerHTML = `<tr><td class="empty">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Lädt Coins/Kristalle/Kreaturen/Legies/last-active und mergt in userCache.
async function loadProgressData() {
  try {
    const [wallets, gameStates, shopStates] = await Promise.all([
      api('GET', `wallets?select=user_id,coins,updated_at`),
      api('GET', `game_state?select=user_id,creature,updated_at`),
      api('GET', `user_collectibles?select=user_id,value&key=eq.shop_state`)
    ]);

    // wallets → user_id → {coins, updated_at}
    const wByUser = {};
    for (const w of wallets) wByUser[w.user_id] = w;

    // game_state pro User aggregieren
    const gsByUser = {};
    for (const gs of gameStates) {
      const b = gsByUser[gs.user_id] || (gsByUser[gs.user_id] = { creatures: new Set(), legendaries: 0, lastActive: null });
      if (gs.creature) {
        b.creatures.add(gs.creature);
        if (LEGENDARY_CREATURES.has(gs.creature)) b.legendaries++;
      }
      if (gs.updated_at && (!b.lastActive || gs.updated_at > b.lastActive)) b.lastActive = gs.updated_at;
    }

    // shop_state → Nester-Kreaturen mit einrechnen + Kristalle
    const scByUser = {};
    for (const sc of shopStates) {
      const state = sc.value || {};
      scByUser[sc.user_id] = state;
      const nests = Array.isArray(state.nests) ? state.nests : [];
      for (const n of nests) {
        const c = n?.hatched?.creature;
        if (!c) continue;
        const b = gsByUser[sc.user_id] || (gsByUser[sc.user_id] = { creatures: new Set(), legendaries: 0, lastActive: null });
        if (!b.creatures.has(c)) {
          b.creatures.add(c);
          if (LEGENDARY_CREATURES.has(c)) b.legendaries++;
        }
      }
    }

    // In userCache mergen.
    // Verfügbare Coins = wallets.coins (Summe der game_state.coins)
    //                  + bankedCoins (aus geschlüpften Nestern eingezahlt)
    //                  − spentCoins  (im Shop ausgegeben).
    // wallets.coins allein zeigt nur "je verdient" ohne Ausgaben — falsch für die Balance.
    for (const u of userCache) {
      const w  = wByUser[u.id];
      const gs = gsByUser[u.id];
      const sc = scByUser[u.id] || {};
      const walletCoins = w?.coins ?? 0;
      const banked      = Number(sc.bankedCoins) || 0;
      const spent       = Number(sc.spentCoins)  || 0;
      const available   = Math.max(0, walletCoins + banked - spent);
      u._progress = {
        coins:        available,
        kristalle:    sc.kristalle ?? 0,
        creatures:    gs ? gs.creatures.size : 0,
        legendaries:  gs ? gs.legendaries    : 0,
        lastActive:   gs?.lastActive || w?.updated_at || null
      };
    }
    progressLoaded = true;
  } catch (err) {
    console.warn('[admin] loadProgressData failed:', err.message);
    showToast('Fortschritts-Daten konnten nicht geladen werden: ' + err.message, 'error');
  }
}

// ─── Rendern ─────────────────────────────────────────────────
// Spalten-Definitionen je View. label = th-Text, key = data-sort-key (null = nicht sortierbar).
const VIEW_COLUMNS = {
  admin: [
    { label: 'Account',      key: 'account_name'    },
    { label: 'Anzeigename',  key: 'display_name'    },
    { label: 'Status',       key: 'status'          },
    { label: 'Cluster',      key: 'cluster'         },
    { label: 'Rolle',        key: 'is_admin'        },
    { label: 'Avatar',       key: null              },
    { label: 'Erstellt',     key: 'created_at'      },
    { label: 'Aktion',       key: null              }
  ],
  progress: [
    { label: 'Account',      key: 'account_name'    },
    { label: 'Anzeigename',  key: 'display_name'    },
    { label: '🪙 Coins',     key: 'coins'           },
    { label: '💎 Kristalle', key: 'kristalle'       },
    { label: 'Kreaturen',    key: 'creatures'       },
    { label: 'Legies',       key: 'legendaries'     },
    { label: 'Zuletzt aktiv',key: 'lastActive'      },
    { label: 'Aktion',       key: null              }
  ]
};

function renderUsers() {
  const thead  = document.getElementById('userThead');
  const tbody  = document.getElementById('userTbody');
  const status = document.getElementById('userStatusFilter').value;
  const q      = document.getElementById('userSearch').value.trim().toLowerCase();
  const cols   = VIEW_COLUMNS[uiState.view] || VIEW_COLUMNS.admin;

  // Header
  const selectableIds = userCache.filter(u => u.id !== currentUserId).map(u => u.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const headerHtml = `
    <tr>
      <th class="col-select">
        <input type="checkbox" id="selectAllCheckbox" ${allSelected ? 'checked' : ''}
               title="Alle sichtbaren auswählen" />
      </th>
      ${cols.map(c => renderTh(c)).join('')}
    </tr>`;
  thead.innerHTML = headerHtml;

  // Filter + Sortieren
  let rows = userCache.slice();
  if (status !== 'all') rows = rows.filter(r => r.status === status);
  if (q) rows = rows.filter(r =>
    (r.account_name || '').toLowerCase().includes(q) ||
    (r.display_name || '').toLowerCase().includes(q));
  rows = sortRows(rows, uiState.sort);

  const colspan = cols.length + 1;
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty">Keine User passen zum Filter.</td></tr>`;
    updateBulkBar();
    return;
  }

  tbody.innerHTML = rows.map(u => renderUserRow(u, cols)).join('');

  // Handler
  tbody.querySelectorAll('.js-row-select').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(cb.dataset.userId);
      else            selectedIds.delete(cb.dataset.userId);
      cb.closest('tr').classList.toggle('row-selected', cb.checked);
      updateBulkBar();
      // Header-Checkbox konsistent halten
      const cb2 = document.getElementById('selectAllCheckbox');
      const sel = userCache.filter(u => u.id !== currentUserId).map(u => u.id);
      cb2.checked = sel.length > 0 && sel.every(id => selectedIds.has(id));
    });
  });
  tbody.querySelectorAll('.js-cluster-select').forEach(sel => {
    sel.addEventListener('change', () => setUserCluster(sel.dataset.userId, sel.value || null));
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
  tbody.querySelectorAll('.js-delete').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal([btn.dataset.userId]));
  });
  tbody.querySelectorAll('.js-detail').forEach(btn => {
    btn.addEventListener('click', () => openUserDetail(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-admin-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleAdminFlag(btn.dataset.userId));
  });

  // Zeilen-Dropdown öffnen/schließen. Klick außerhalb schließt via document-Handler unten.
  tbody.querySelectorAll('.js-row-actions-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const wasOpen = !menu.hidden;
      // Alle anderen schließen
      document.querySelectorAll('.row-actions__menu').forEach(m => m.hidden = true);
      menu.hidden = wasOpen;
    });
  });

  // Select-All
  document.getElementById('selectAllCheckbox').addEventListener('change', e => {
    const target = e.target.checked;
    for (const u of userCache) {
      if (u.id === currentUserId) continue;
      if (target) selectedIds.add(u.id);
      else        selectedIds.delete(u.id);
    }
    renderUsers();
  });

  updateBulkBar();
}

function renderTh(col) {
  if (!col.key) return `<th>${col.label}</th>`;
  const isSorted = uiState.sort.key === col.key;
  const ind = isSorted ? (uiState.sort.dir === 'asc' ? '▲' : '▼') : '';
  return `<th data-sort-key="${col.key}" class="${isSorted ? 'sorted' : ''}">
    ${col.label}<span class="sort-ind">${ind}</span>
  </th>`;
}

function sortRows(rows, sort) {
  const { key, dir } = sort;
  const factor = dir === 'asc' ? 1 : -1;
  const getVal = (u) => {
    switch (key) {
      case 'cluster': {
        const c = clusterCache.find(x => x.id === u.cluster_id);
        return c ? `${c.name} S${c.season}` : '';
      }
      case 'coins':       return u._progress?.coins       ?? 0;
      case 'kristalle':   return u._progress?.kristalle   ?? 0;
      case 'creatures':   return u._progress?.creatures   ?? 0;
      case 'legendaries': return u._progress?.legendaries ?? 0;
      case 'lastActive':  return u._progress?.lastActive  ?? '';
      case 'display_name_locked': return u.display_name_locked ? 1 : 0;
      case 'is_admin':    return u.is_admin ? 1 : 0;
      default:            return u[key] ?? '';
    }
  };
  return rows.sort((a, b) => {
    const va = getVal(a), vb = getVal(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
    return String(va).localeCompare(String(vb), 'de', { numeric: true }) * factor;
  });
}

function renderUserRow(u, cols) {
  const isSelf = u.id === currentUserId;
  const checked = selectedIds.has(u.id);
  const cells = cols.map(col => renderCell(u, col)).join('');
  const selectCell = `<td class="col-select">
    <input type="checkbox" class="js-row-select" data-user-id="${u.id}"
           ${checked ? 'checked' : ''} ${isSelf ? 'disabled title="Eigenen Account nicht wählbar"' : ''} />
  </td>`;
  return `<tr class="${checked ? 'row-selected' : ''}">${selectCell}${cells}</tr>`;
}

function renderCell(u, col) {
  switch (col.key) {
    case 'account_name':
      return `<td>${escapeHtml(u.account_name)}</td>`;
    case 'display_name': {
      const name = escapeHtml(u.display_name || '—');
      const lock = u.display_name_locked
        ? '<span class="name-lock-icon" title="Anzeigename gesperrt">🔒</span>'
        : '';
      return `<td>${name}${lock}</td>`;
    }
    case 'status': {
      let badge = `<span class="badge ${u.status}">${u.status}</span>`;
      if (u.is_admin) badge += ' <span class="badge admin">admin</span>';
      return `<td>${badge}</td>`;
    }
    case 'cluster': {
      const opts = ['<option value="">— kein Cluster —</option>']
        .concat(clusterCache.map(c =>
          `<option value="${c.id}" ${c.id === u.cluster_id ? 'selected' : ''}>${escapeHtml(c.name)} · S${c.season}</option>`
        )).join('');
      return `<td><select class="js-cluster-select" data-user-id="${u.id}">${opts}</select></td>`;
    }
    case 'created_at':
      return `<td>${fmtDT(u.created_at)}</td>`;
    case 'display_name_locked':
      return `<td>${u.display_name_locked ? '🔒 gesperrt' : '—'}</td>`;
    case 'is_admin':
      return `<td>${u.is_admin ? '<span class="badge admin">admin</span>' : '<span class="badge">schüler</span>'}</td>`;
    // Progress-Metriken
    case 'coins':
      return `<td><span class="metric"><span class="metric-icon">🪙</span>${u._progress?.coins ?? '—'}</span></td>`;
    case 'kristalle':
      return `<td><span class="metric"><span class="metric-icon">💎</span>${u._progress?.kristalle ?? '—'}</span></td>`;
    case 'creatures':
      return `<td><span class="metric">${u._progress?.creatures ?? '—'}</span></td>`;
    case 'legendaries': {
      const n = u._progress?.legendaries ?? 0;
      return `<td><span class="metric ${n > 0 ? 'metric-legendary' : ''}">✨ ${u._progress?.legendaries ?? '—'}</span></td>`;
    }
    case 'lastActive':
      return `<td>${u._progress?.lastActive ? fmtRelative(u._progress.lastActive) : '—'}</td>`;
    default: {
      // Erst Spezial-Spalten (nicht-Aktion), dann View-basierte Aktion.
      if (col.label === 'Avatar')      return `<td>${renderAvatarThumb(u.avatar_id)}</td>`;
      if (uiState.view === 'admin')    return renderAdminActions(u);
      if (uiState.view === 'progress') return renderProgressActions(u);
      return '<td>—</td>';
    }
  }
}

function renderAdminActions(u) {
  const isSelf = u.id === currentUserId;
  const lockLabel  = u.display_name_locked ? '🔒 Entsperren' : '🔓 Sperren';
  const adminLabel = u.is_admin ? 'Admin entziehen' : 'Zum Admin machen';
  return `<td>
    <div class="row-actions" data-user-id="${u.id}">
      <button type="button" class="row-actions__btn js-row-actions-btn">Aktionen</button>
      <div class="row-actions__menu" hidden>
        <button type="button" class="js-rename"       data-user-id="${u.id}">Umbenennen</button>
        <button type="button" class="js-pw-reset"     data-user-id="${u.id}">Passwort setzen</button>
        <button type="button" class="js-lock-toggle"  data-user-id="${u.id}">${lockLabel}</button>
        <button type="button" class="js-admin-toggle" data-user-id="${u.id}" ${isSelf ? 'disabled' : ''}>${adminLabel}</button>
        <hr />
        <button type="button" class="danger js-delete" data-user-id="${u.id}" ${isSelf ? 'disabled' : ''}>Löschen</button>
      </div>
    </div>
  </td>`;
}
function renderProgressActions(u) {
  return `<td><div class="actions">
    <button class="btn small js-detail" data-user-id="${u.id}">Details</button>
  </div></td>`;
}

function renderAvatarThumb(avatarId) {
  if (!avatarId) return '—';
  // getAvatarUrl hängt selbst 'avatare/<file>' an → basePath ist der Ordner DAVOR.
  // admin/ → '../' ergibt '../avatare/<file>'.
  const url = window.getAvatarUrl?.(avatarId, '../');
  if (!url) return escapeHtml(avatarId);
  return `<img class="avatar-thumb" src="${url}" alt="${escapeHtml(avatarId)}" />`;
}

// ─── Sort-Handler (Klick auf Spaltenkopf) ────────────────────
document.addEventListener('click', e => {
  const th = e.target.closest('th[data-sort-key]');
  if (!th) return;
  const key = th.dataset.sortKey;
  if (uiState.sort.key === key) {
    uiState.sort.dir = uiState.sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    uiState.sort.key = key;
    uiState.sort.dir = 'asc';
  }
  saveUiState();
  renderUsers();
});

// ─── Row-Actions-Dropdown: außerhalb klicken schließt ────────
document.addEventListener('click', e => {
  if (e.target.closest('.row-actions')) return;
  document.querySelectorAll('.row-actions__menu').forEach(m => m.hidden = true);
});

/* ─── User-Aktionen (unverändert aus alter Version) ─── */

async function setUserCluster(userId, clusterId) {
  const nextStatus = clusterId ? 'active' : 'pending';
  try {
    await api('PATCH', `profiles?id=eq.${userId}`, {
      cluster_id: clusterId,
      status:     nextStatus
    });
    const u = userCache.find(x => x.id === userId);
    if (u) { u.cluster_id = clusterId; u.status = nextStatus; }
    renderUsers();
    loadClusters();
  } catch (err) {
    showToast('Cluster-Zuweisung fehlgeschlagen: ' + err.message, 'error');
    renderUsers();
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
    showToast('Lock-Toggle fehlgeschlagen: ' + err.message, 'error');
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
    showToast('Umbenennen fehlgeschlagen: ' + err.message, 'error');
  }
}

async function resetPassword(userId) {
  const u = userCache.find(x => x.id === userId);
  if (!u) return;
  const pw = prompt(`Neues Passwort für "${u.account_name}" (mind. 8 Zeichen):`);
  if (pw === null) return;
  if (pw.length < 8) { alert('Passwort zu kurz (mind. 8 Zeichen).'); return; }
  try {
    const token = window.__accessToken;
    const res = await fetch('/api/admin_reset_password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, new_password: pw })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    showToast(`Passwort für ${u.account_name} gesetzt.`);
  } catch (err) {
    showToast('Passwort-Reset fehlgeschlagen: ' + err.message, 'error');
  }
}

async function toggleAdminFlag(userId) {
  const u = userCache.find(x => x.id === userId);
  if (!u) return;
  const next = !u.is_admin;
  const label = next ? 'zum Admin machen' : 'Admin-Rechte entziehen';
  if (!confirm(`"${u.account_name}" wirklich ${label}?`)) return;
  try {
    await api('PATCH', `profiles?id=eq.${userId}`, { is_admin: next });
    u.is_admin = next;
    renderUsers();
    showToast(next ? `${u.account_name} ist jetzt Admin.` : `${u.account_name} ist kein Admin mehr.`);
  } catch (err) {
    showToast('Admin-Toggle fehlgeschlagen: ' + err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════
   Bulk-Bar
   ══════════════════════════════════════════════════════════════ */

function wireBulkBar() {
  document.getElementById('bulkClearBtn').addEventListener('click', () => {
    selectedIds.clear();
    renderUsers();
  });
  document.getElementById('bulkAssignBtn').addEventListener('click', bulkAssignCluster);
  document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
    openDeleteModal(Array.from(selectedIds));
  });
}

function updateBulkBar() {
  const n = selectedIds.size;
  const bar = document.getElementById('bulkBar');
  bar.hidden = n === 0;
  document.getElementById('bulkCount').textContent = n;
}

function refreshBulkClusterOptions() {
  const sel = document.getElementById('bulkClusterSelect');
  const current = sel.value;
  sel.innerHTML = '<option value="">— kein Cluster —</option>' +
    clusterCache.map(c => `<option value="${c.id}">${escapeHtml(c.name)} · S${c.season}</option>`).join('');
  sel.value = current;
}

async function bulkAssignCluster() {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  const clusterId = document.getElementById('bulkClusterSelect').value || null;
  const nextStatus = clusterId ? 'active' : 'pending';
  const btn = document.getElementById('bulkAssignBtn');
  const fb  = document.getElementById('bulkFeedback');
  fb.className = 'form-feedback';
  fb.textContent = '';
  btn.disabled = true;
  try {
    // PostgREST kann id=in.(uuid1,uuid2,...) → ein PATCH für alle
    await api('PATCH',
      `profiles?id=in.(${ids.join(',')})`,
      { cluster_id: clusterId, status: nextStatus });
    for (const u of userCache) {
      if (selectedIds.has(u.id)) { u.cluster_id = clusterId; u.status = nextStatus; }
    }
    const label = clusterCache.find(c => c.id === clusterId)?.name || 'kein Cluster';
    showToast(`${ids.length} User → ${label}`);
    selectedIds.clear();
    renderUsers();
    loadClusters();  // Member-Counts neu
  } catch (err) {
    fb.textContent = 'Fehler: ' + err.message;
    fb.classList.add('error');
  } finally {
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   Delete-Modal (einzeln + Bulk)
   ══════════════════════════════════════════════════════════════ */

let deleteTargetIds = [];

function wireDeleteModal() {
  const modal = document.getElementById('deleteModal');
  document.getElementById('deleteClose').addEventListener('click', closeDeleteModal);
  document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeDeleteModal(); });

  const confirmInput = document.getElementById('deleteConfirmInput');
  const confirmBtn   = document.getElementById('deleteConfirmBtn');
  confirmInput.addEventListener('input', () => {
    const need = confirmInput.dataset.expected || '';
    confirmBtn.disabled = confirmInput.value !== need;
  });

  confirmBtn.addEventListener('click', confirmDelete);
}

function openDeleteModal(ids) {
  // Self-Delete verhindern (Bulk-Bar deaktiviert eigene Checkbox — hier zur Sicherheit filtern)
  ids = ids.filter(id => id !== currentUserId);
  if (ids.length === 0) return;

  deleteTargetIds = ids;
  const users = ids.map(id => userCache.find(u => u.id === id)).filter(Boolean);
  const adminCount = users.filter(u => u.is_admin).length;
  const n = users.length;

  const title = n === 1 ? `User „${users[0].account_name}" löschen?` : `${n} User löschen?`;
  document.getElementById('deleteTitle').textContent = title;

  const list = n === 1
    ? ''
    : `<details><summary>${n} Accounts anzeigen</summary><ul>${
        users.map(u => `<li>${escapeHtml(u.account_name)}${u.is_admin ? ' <span class="badge admin">admin</span>' : ''}</li>`).join('')
      }</ul></details>`;

  const adminWarn = adminCount > 0
    ? `<div class="delete-warn">⚠ ${adminCount === 1 ? 'Ein Admin-Account' : `${adminCount} Admin-Accounts`} in dieser Auswahl. Nach dem Löschen können sich diese Personen nicht mehr anmelden.</div>`
    : '';

  document.getElementById('deleteBody').innerHTML = `
    <p>Diese Aktion ist <strong>nicht rückgängig zu machen</strong>. Alle Kreaturen, Coins, Nester und Fortschritte werden gelöscht.</p>
    ${adminWarn}
    ${list}
  `;

  // Textbestätigung nur bei >20
  const confirmLabel = document.getElementById('deleteConfirmLabel');
  const confirmInput = document.getElementById('deleteConfirmInput');
  const confirmBtn   = document.getElementById('deleteConfirmBtn');
  if (n > 20) {
    const expected = `Ja alle ${n} SuS unwiderruflich löschen`;
    confirmInput.value = '';
    confirmInput.placeholder = expected;
    confirmInput.dataset.expected = expected;
    confirmLabel.hidden = false;
    confirmBtn.disabled = true;
  } else {
    confirmLabel.hidden = true;
    confirmInput.dataset.expected = '';
    confirmBtn.disabled = false;
  }
  document.getElementById('deleteFeedback').textContent = '';
  document.getElementById('deleteFeedback').className   = 'form-feedback';
  document.getElementById('deleteModal').hidden = false;
}

function closeDeleteModal() {
  document.getElementById('deleteModal').hidden = true;
  deleteTargetIds = [];
}

async function confirmDelete() {
  if (deleteTargetIds.length === 0) return;
  const btn = document.getElementById('deleteConfirmBtn');
  const fb  = document.getElementById('deleteFeedback');
  fb.className = 'form-feedback';
  fb.textContent = 'Lösche …';
  btn.disabled = true;
  try {
    const token = window.__accessToken;
    const res = await fetch('/api/admin_delete_user', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: deleteTargetIds })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.error || `HTTP ${res.status}`);

    // Aus userCache + Auswahl entfernen
    const removed = new Set(deleteTargetIds);
    userCache = userCache.filter(u => !removed.has(u.id));
    for (const id of removed) selectedIds.delete(id);
    closeDeleteModal();
    renderUsers();
    loadClusters();  // Member-Counts neu

    const failCount = (body.failed || []).length;
    const successCount = body.deleted ?? (deleteTargetIds.length - failCount);
    if (failCount > 0) {
      showToast(`${successCount} gelöscht, ${failCount} fehlgeschlagen.`, 'error');
    } else {
      showToast(`${successCount === 1 ? '1 User' : `${successCount} User`} gelöscht.`);
    }
  } catch (err) {
    fb.textContent = 'Fehler: ' + err.message;
    fb.classList.add('error');
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   User-Detail-Modal (Progress-View)
   ══════════════════════════════════════════════════════════════ */

function wireDetailModal() {
  const modal = document.getElementById('userDetailModal');
  document.getElementById('userDetailClose').addEventListener('click', () => modal.hidden = true);
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
}

async function openUserDetail(userId) {
  const u = userCache.find(x => x.id === userId);
  if (!u) return;
  document.getElementById('userDetailTitle').textContent =
    `${u.display_name || u.account_name} · Fortschritt`;
  const body = document.getElementById('userDetailBody');
  body.innerHTML = '<p style="color:var(--a-muted);">Lade …</p>';
  document.getElementById('userDetailModal').hidden = false;

  try {
    const [gameStates, shopStates] = await Promise.all([
      api('GET', `game_state?select=game_id,creature,growth,points,rounds_played,coins,updated_at&user_id=eq.${userId}&order=updated_at.desc`),
      api('GET', `user_collectibles?select=value&user_id=eq.${userId}&key=eq.shop_state`)
    ]);

    const gsRows = gameStates.length === 0
      ? '<tr><td colspan="7" class="empty">Noch keine Spielrunden.</td></tr>'
      : gameStates.map(gs => `
          <tr>
            <td>${escapeHtml(gs.game_id)}</td>
            <td>${gs.creature ? (LEGENDARY_CREATURES.has(gs.creature) ? '<span class="metric-legendary">✨ ' + escapeHtml(gs.creature) + '</span>' : escapeHtml(gs.creature)) : '—'}</td>
            <td>${gs.growth ?? 0}</td>
            <td>${gs.points ?? 0}</td>
            <td>${gs.rounds_played ?? 0}</td>
            <td>${gs.coins ?? 0}</td>
            <td>${fmtDT(gs.updated_at)}</td>
          </tr>`).join('');

    const shop = shopStates[0]?.value || {};
    const nestCount = Array.isArray(shop.nests) ? shop.nests.length : 0;
    const shopSummary = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;font-size:13px;">
        <span>🪙 <strong>${u._progress?.coins ?? 0}</strong> Coins</span>
        <span>💎 <strong>${shop.kristalle ?? 0}</strong> Kristalle</span>
        <span>🏛 <strong>${shop.bankedCoins ?? 0}</strong> Bank</span>
        <span>🥚 <strong>${nestCount}</strong> Nester</span>
        <span>📜 <strong>${(shop.purchased || []).length}</strong> Einkäufe</span>
      </div>`;

    body.innerHTML = shopSummary + `
      <table class="dtable">
        <thead><tr>
          <th>Spiel</th><th>Kreatur</th><th>Growth</th><th>Punkte</th><th>Runden</th><th>Coins</th><th>Zuletzt</th>
        </tr></thead>
        <tbody>${gsRows}</tbody>
      </table>`;
  } catch (err) {
    body.innerHTML = `<p style="color:var(--a-danger);">Fehler: ${escapeHtml(err.message)}</p>`;
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

function fmtRelative(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1)   return 'gerade eben';
  if (min < 60)  return `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `vor ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30)    return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
  return fmtDT(iso);
}

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

function showToast(message, kind) {
  const el = document.createElement('div');
  el.className = 'admin-toast' + (kind === 'error' ? ' error' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 250ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 3000);
}
