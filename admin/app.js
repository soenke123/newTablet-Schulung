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
let isVolladmin     = false;  // is_superadmin? — schaltet School-Switcher + Admins-Tab frei
let ownSchoolId     = null;   // Schule des Admins (für Schuladmin-Fallback bei Switcher-Reset)
let allSchools      = [];     // [{id, slug, name, active}], nur für Volladmin gefüllt
let clusterCache    = [];     // {id, name, season, opens_at, closes_at, bonus?}
let gamesBySeason   = null;   // { 1: ['game1', ...], 2: [...] }, lazy geladen
let gameTitleById   = null;   // { game1: 'Zahlenduell', ... }, lazy geladen aus games-Tabelle
let userCache       = [];     // profiles rows (angereichert mit progress-Daten wenn geladen)
let adminCache      = [];     // profiles rows aller Admins (Volladmin-Reiter)
let teacherCache    = [];     // profiles rows mit teacher_status <> 'none' (MPSkills-Reiter)
let progressLoaded  = false;  // game_state/wallets/user_collectibles einmal nachgeladen?
let startupLoaded   = false;  // user_game_saves (game18) einmal nachgeladen?

// UI-State — überlebt Session-Reload für konsistente Ansicht
const uiState = loadUiState();

function loadUiState() {
  const fallback = { view: 'admin', progressSrc: 'hub', sort: { key: 'created_at', dir: 'desc' } };
  try {
    const raw = sessionStorage.getItem('admin_ui_state');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // Alte View-Namen abfangen (Migration nach Account-View-Wegfall)
    if (parsed.view !== 'admin' && parsed.view !== 'progress') parsed.view = 'admin';
    if (parsed.progressSrc !== 'hub' && parsed.progressSrc !== 'startup') parsed.progressSrc = 'hub';
    return parsed;
  } catch(e) { return fallback; }
}

// Welche Spalten-Definition gerade gilt. Die Fortschritts-Ansicht hat zwei
// Datenquellen (Hub-Sammelstand vs. Startup-Story-Spielstand); alles andere
// hängt allein an uiState.view.
function viewKey() {
  if (uiState.view === 'progress' && uiState.progressSrc === 'startup') return 'startup';
  return uiState.view;
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
  'robot', 'pfau', 'chinDrache', 'schnabeltier', 'einhornkatze'
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
// 23514 = check_violation: mehrere Constraints möglich, wir müssen den
// Constraint-Namen prüfen (steckt in err.message oder err.details).
function humanizeClusterError(err) {
  if (err.pgCode === '23P01') return 'Zeitfenster überschneidet sich mit einem anderen Kurs. Bitte anderes Fenster wählen.';
  if (err.pgCode === '23514') {
    const hay = `${err.message || ''} ${err.details || ''}`.toLowerCase();
    if (hay.includes('bonbon_target')) return 'Bonbon-Ziel fehlt (Pflicht ab Season 3).';
    return 'Ungültiges Zeitfenster (Start vor Ende, max. 7 Tage).';
  }
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
  if (!s.is_admin && !s.is_superadmin) {
    console.warn('[admin] kein Admin → Landing');
    location.replace('../index.html');
    return;
  }

  isVolladmin      = !!s.is_superadmin;
  ownSchoolId      = s.school_id;
  currentSchoolId  = s.school_id;
  currentUserId    = s.id;
  document.getElementById('userPillName').textContent = s.display_name || s.account_name;
  document.getElementById('userPill').hidden          = false;
  document.getElementById('tabnav').hidden            = false;
  document.getElementById('content').hidden           = false;

  if (isVolladmin) {
    document.getElementById('tabAdmins').hidden = false;
  }

  wireUserMenu();
  wireTabs();
  wireClusterForm();
  wireClusterEditModal();
  wireClusterDeleteModal();
  wireClusterBonusModal();
  wireClusterGamesModal();
  wireUserFilters();
  wireViewSwitch();
  wireProgressSourceSwitch();
  wireBulkBar();
  wireDeleteModal();
  wireDetailModal();
  wireDashboard();
  wireSchoolSwitcher();
  wireSchoolCreateModal();
  wireRoleChangeModal();
  wireMoveSchoolModal();
  wireAdminsTab();
  wireTeachersTab();

  await initSchoolSwitcher();  // lädt alle Schulen (nur Volladmin) und rendert Header-Label

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
    // Konsistent mit Landing/Hub: Last-Chance-Push für Highscores.
    // Admins spielen zwar praktisch keine Schüler-Games, aber der Aufruf
    // kostet nichts und hält alle Logout-Pfade uniform.
    await window.pushLocalHighscoresToServer?.().catch(() => {});
    window.clearLocalGameState?.();
    await window.supabaseClient?.auth?.signOut();
    location.replace('../index.html');
  });
}

// ─── Tabs ────────────────────────────────────────────────────
const TAB_PANELS = ['dashboard', 'clusters', 'users', 'teachers', 'admins'];

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
      if (target === 'admins') {
        loadAdmins();
      }
      if (target === 'teachers') {
        loadTeachers();
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   Cluster-Tab
   ══════════════════════════════════════════════════════════════ */

function wireClusterForm() {
  // Bonbon-Ziel-Feld ist S3-Pflichtfeld. Toggle bei Season-Wechsel.
  const seasonInput = document.getElementById('clSeason');
  const bonbonWrap  = document.getElementById('clBonbonTargetWrap');
  const bonbonInput = document.getElementById('clBonbonTarget');
  const toggleBonbon = () => {
    const isS3 = parseInt(seasonInput.value, 10) >= 3;
    bonbonWrap.hidden = !isS3;
    bonbonInput.required = isS3;
    if (!isS3) bonbonInput.value = '';
  };
  seasonInput.addEventListener('input', toggleBonbon);
  toggleBonbon();

  document.getElementById('clusterForm').addEventListener('submit', async e => {
    e.preventDefault();
    const feedback = document.getElementById('clFeedback');
    const btn      = document.getElementById('clSubmit');
    feedback.className = 'form-feedback';
    feedback.textContent = '';

    const name    = document.getElementById('clName').value.trim();
    const season  = parseInt(seasonInput.value, 10);
    const opensAt = document.getElementById('clOpens').value;
    const closesAt= document.getElementById('clCloses').value;
    const bonbonTarget = bonbonInput.value ? parseInt(bonbonInput.value, 10) : null;

    if (!name)   { feedback.textContent = 'Name fehlt.'; feedback.classList.add('error'); return; }
    if (!season || season < 1) { feedback.textContent = 'Season ungültig.'; feedback.classList.add('error'); return; }
    if (season >= 3 && (!bonbonTarget || bonbonTarget < 1)) {
      feedback.textContent = 'Bonbon-Ziel fehlt (Pflicht ab Season 3).';
      feedback.classList.add('error');
      return;
    }
    const winErr = validateClusterWindow(opensAt, closesAt);
    if (winErr) { feedback.textContent = winErr; feedback.classList.add('error'); return; }

    btn.disabled = true;
    try {
      await api('POST', 'clusters', {
        school_id: currentSchoolId, name, season,
        opens_at: toIso(opensAt), closes_at: toIso(closesAt),
        bonbon_target: season >= 3 ? bonbonTarget : null
      });
      feedback.textContent = 'Cluster angelegt.';
      feedback.classList.add('ok');
      e.target.reset();
      seasonInput.value = '1';
      toggleBonbon();
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
      `clusters?select=id,name,season,opens_at,closes_at,bonbon_target,bonbons_unlocked_at`
      + `&school_id=eq.${currentSchoolId}`
      + `&order=season.desc,opens_at.desc.nullslast`);
    clusterCache = rows;

    const members = await api('GET',
      `profiles?select=cluster_id&school_id=eq.${currentSchoolId}`);
    const counts = {};
    for (const m of members) if (m.cluster_id) counts[m.cluster_id] = (counts[m.cluster_id] || 0) + 1;

    // Bonus-Konfig pro Cluster mitziehen — für Badge in der Zeile
    // und um beim Modal-Open den Zustand kennen. Fehler tolerieren
    // (Migration 0020 evtl. noch nicht deployed).
    try {
      const clusterIds = rows.map(r => r.id);
      if (clusterIds.length > 0) {
        const filter = `in.(${clusterIds.join(',')})`;
        const bonuses = await api('GET',
          `cluster_bonus?select=cluster_id,active,startup_coins,seasons&cluster_id=${filter}`);
        const byId = {};
        for (const b of bonuses) byId[b.cluster_id] = b;
        for (const c of rows) c.bonus = byId[c.id] || null;
      }
    } catch (e) {
      console.warn('[admin] cluster_bonus laden fehlgeschlagen:', e.message);
    }

    // Bonbon-Summen pro S3-Cluster in einem Rutsch (RPC aggregiert
    // über alle Schul-Cluster). Fehler tolerieren, wenn Migration
    // 0032 noch nicht deployed ist.
    try {
      const res = await api('POST', 'rpc/admin_cluster_bonbon_totals', {});
      if (res?.ok) {
        const byId = {};
        for (const t of res.clusters || []) byId[t.cluster_id] = t.collected;
        for (const c of rows) if (c.season >= 3) c.bonbons_collected = byId[c.id] ?? 0;
      }
    } catch (e) {
      console.warn('[admin] admin_cluster_bonbon_totals fehlgeschlagen:', e.message);
    }

    // Freischaltungen pro Cluster (Migration 0070) für die "Offen"-Spalte.
    // Fehler tolerieren, falls 0070 noch nicht deployed ist.
    try {
      const clusterIds = rows.map(r => r.id);
      if (clusterIds.length > 0) {
        const open = await api('GET',
          `cluster_unlocked_games?select=cluster_id,game_id&cluster_id=in.(${clusterIds.join(',')})`);
        const byId = {};
        for (const o of open) byId[o.cluster_id] = (byId[o.cluster_id] || 0) + 1;
        for (const c of rows) c.games_open = byId[c.id] || 0;
      }
      await ensureGamesBySeason();
    } catch (e) {
      console.warn('[admin] cluster_unlocked_games laden fehlgeschlagen:', e.message);
    }

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">Noch keine Cluster.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(c => renderClusterRow(c, counts[c.id] || 0)).join('');
      tbody.querySelectorAll('.js-cluster-edit').forEach(btn => {
        btn.addEventListener('click', () => openClusterEdit(btn.dataset.id));
      });
      tbody.querySelectorAll('.js-cluster-games').forEach(btn => {
        btn.addEventListener('click', () => openClusterGames(btn.dataset.id));
      });
      tbody.querySelectorAll('.js-cluster-bonus').forEach(btn => {
        btn.addEventListener('click', () => openClusterBonus(btn.dataset.id));
      });
      tbody.querySelectorAll('.js-cluster-delete').forEach(btn => {
        btn.addEventListener('click', () => openClusterDelete(btn.dataset.id, counts[btn.dataset.id] || 0));
      });
    }

    // Bulk-Cluster-Dropdown aktuell halten
    refreshBulkClusterOptions();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty">Fehler: ${escapeHtml(err.message)}</td></tr>`;
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

  // Starthilfe-Label: "•" wenn nicht konfiguriert, "★ aktiv"/"gehemmt" sonst.
  let bonusLabel = 'Starthilfe';
  if (c.bonus) {
    bonusLabel = c.bonus.active ? '★ Starthilfe' : 'Starthilfe (aus)';
  }

  let bonbonsCell = '—';
  if (c.season >= 3 && c.bonbon_target) {
    const collected = c.bonbons_collected ?? 0;
    if (c.bonbons_unlocked_at) {
      bonbonsCell = `<span class="badge open">🌈 freigeschaltet</span><br><small>${collected} / ${c.bonbon_target}</small>`;
    } else {
      const pct = Math.min(100, Math.round(collected / c.bonbon_target * 100));
      bonbonsCell = `🍬 ${collected} / ${c.bonbon_target} <small>(${pct}%)</small>`;
    }
  }

  // Freischaltungen (Migration 0070). Nenner sind alle aktiven Spiele bis
  // einschließlich der Kurs-Season — was darüber liegt, sieht der Kurs
  // ohnehin nicht, und ein Bruch, dessen Nenner nie erreichbar ist,
  // sähe dauerhaft nach Rückstand aus.
  let openCell = '—';
  if (typeof c.games_open === 'number') {
    let total = 0;
    for (const s of Object.keys(gamesBySeason || {})) {
      if (Number(s) <= c.season) total += gamesBySeason[s].length;
    }
    openCell = total > 0 ? `${c.games_open} / ${total}` : String(c.games_open);
    if (c.games_open === 0) openCell = `<span class="badge closed">${openCell}</span>`;
  }

  return `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${c.season}</td>
      <td>${fmtDT(c.opens_at)}</td>
      <td>${fmtDT(c.closes_at)}</td>
      <td>${statusBadge}</td>
      <td>${memberCount}</td>
      <td>${openCell}</td>
      <td>${bonbonsCell}</td>
      <td>
        <button class="btn small js-cluster-edit"   data-id="${c.id}">Bearbeiten</button>
        <button class="btn small js-cluster-games"  data-id="${c.id}">Spiele</button>
        <button class="btn small js-cluster-bonus"  data-id="${c.id}">${bonusLabel}</button>
        <button class="btn small danger js-cluster-delete" data-id="${c.id}">Löschen</button>
      </td>
    </tr>`;
}

/* ─── Spiele-Freischaltung pro Kurs (Migration 0070) ──────────
   Dient dem Vorbereiten: eine Stunde einrichten, bevor der Kurs da
   ist. Während der Stunde schaltet die Lehrkraft direkt auf der
   Hub-Kachel — dort, wo sie das Spiel auch sieht.               */
let gamesClusterId = null;

function wireClusterGamesModal() {
  const overlay = document.getElementById('clusterGamesModal');
  const close   = document.getElementById('clusterGamesClose');
  if (!overlay || !close) return;
  const doClose = () => { overlay.hidden = true; gamesClusterId = null; };
  close.addEventListener('click', doClose);
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });
}

async function openClusterGames(clusterId) {
  const cluster = clusterCache.find(c => c.id === clusterId);
  if (!cluster) return;
  gamesClusterId = clusterId;
  document.getElementById('clusterGamesTitle').textContent =
    `Spiele freischalten — ${cluster.name}`;
  document.getElementById('clusterGamesModal').hidden = false;
  await renderClusterGamesBody();
}

async function renderClusterGamesBody() {
  const body = document.getElementById('clusterGamesBody');
  if (!body || !gamesClusterId) return;
  body.innerHTML = '<p class="empty">Lade …</p>';

  const cluster = clusterCache.find(c => c.id === gamesClusterId);
  try {
    await ensureGamesBySeason();
    const rows = await api('GET',
      `cluster_unlocked_games?select=game_id&cluster_id=eq.${gamesClusterId}`);
    const open = new Set(rows.map(r => r.game_id));

    // Seasons oberhalb der Kurs-Season bleiben draußen: sie wären für
    // den Kurs unsichtbar, ein Schalter dafür verspräche etwas, das
    // erst nach einer Season-Änderung eintritt.
    const seasons = Object.keys(gamesBySeason)
      .map(Number)
      .filter(s => s <= cluster.season)
      .sort((a, b) => a - b);

    if (seasons.length === 0) {
      body.innerHTML = '<p class="empty">Für diese Season sind keine Spiele hinterlegt.</p>';
      return;
    }

    body.innerHTML = seasons.map(s => `
      <div class="card">
        <h4>Season ${s}
          <button class="btn small js-cg-all" data-season="${s}" data-open="1">alle freischalten</button>
          <button class="btn small js-cg-all" data-season="${s}" data-open="0">alle sperren</button>
        </h4>
        <div class="cg-list">
          ${gamesBySeason[s].map(id => `
            <label class="cg-item">
              <input type="checkbox" class="js-cg-one" data-game="${id}" ${open.has(id) ? 'checked' : ''} />
              <span>${escapeHtml(gameTitle(id))}${id === 'game16' ? ' <em>(eröffnet das Bonbon-Sammeln)</em>' : ''}</span>
            </label>`).join('')}
        </div>
      </div>`).join('');

    body.querySelectorAll('.js-cg-one').forEach(cb => {
      cb.addEventListener('change', async () => {
        // Rückfrage nur beim Sperren: Freischalten ist mit einem
        // zweiten Klick zurückgenommen, Sperren fällt mitten in eine
        // laufende Stunde und trifft den ganzen Kurs auf einmal.
        if (!cb.checked && !confirm(
          `„${gameTitle(cb.dataset.game)}" für diesen Kurs sperren?\n\n` +
          `Das Spiel ist danach nicht mehr startbar. Monster, Wachstum und ` +
          `Münzen bleiben erhalten.`
        )) {
          cb.checked = true;
          return;
        }
        cb.disabled = true;
        let res = null, err = null;
        try {
          res = await api('POST', 'rpc/set_cluster_game_access', {
            p_cluster_id: gamesClusterId, p_game_id: cb.dataset.game, p_open: cb.checked
          });
        } catch (e) { err = e.message; }
        cb.disabled = false;
        if (!res?.ok) {
          // Zurückspringen statt einen Zustand stehen zu lassen, den
          // der Server nicht kennt.
          cb.checked = !cb.checked;
          alert(`Konnte nicht schalten: ${err ?? res?.error ?? 'unbekannt'}`);
          return;
        }
        loadClusters();
      });
    });

    body.querySelectorAll('.js-cg-all').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wantOpen = btn.dataset.open === '1';
        if (!wantOpen && !confirm(
          `Alle Spiele der Season ${btn.dataset.season} für diesen Kurs sperren?\n\n` +
          `Die Spiele sind danach nicht mehr startbar. Monster, Wachstum und ` +
          `Münzen bleiben erhalten.`
        )) return;
        body.querySelectorAll('button, input').forEach(el => el.disabled = true);
        let res = null, err = null;
        try {
          res = await api('POST', 'rpc/set_cluster_season_access', {
            p_cluster_id: gamesClusterId,
            p_season: Number(btn.dataset.season),
            p_open: wantOpen
          });
        } catch (e) { err = e.message; }
        if (!res?.ok) {
          body.querySelectorAll('button, input').forEach(el => el.disabled = false);
          alert(`Konnte nicht schalten: ${err ?? res?.error ?? 'unbekannt'}`);
          return;
        }
        await renderClusterGamesBody();
        loadClusters();
      });
    });
  } catch (err) {
    body.innerHTML = `<p class="empty">Fehler: ${escapeHtml(err.message)}</p>`;
  }
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

  // Bonbon-Ziel-Feld toggeln, wenn Season editiert wird.
  const seasonInput  = document.getElementById('edClSeason');
  const bonbonWrap   = document.getElementById('edClBonbonTargetWrap');
  const bonbonInput  = document.getElementById('edClBonbonTarget');
  const toggleBonbon = () => {
    const isS3 = parseInt(seasonInput.value, 10) >= 3;
    bonbonWrap.hidden = !isS3;
    bonbonInput.required = isS3;
  };
  seasonInput.addEventListener('input', toggleBonbon);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!editingClusterId) return;
    const feedback = document.getElementById('edClFeedback');
    const btn      = document.getElementById('edClSubmit');
    feedback.className = 'form-feedback';
    feedback.textContent = '';

    const opensLocal  = document.getElementById('edClOpens').value;
    const closesLocal = document.getElementById('edClCloses').value;
    const bonbonTarget = bonbonInput.value ? parseInt(bonbonInput.value, 10) : null;
    const patch = {
      name:      document.getElementById('edClName').value.trim(),
      season:    parseInt(seasonInput.value, 10),
      opens_at:  toIso(opensLocal),
      closes_at: toIso(closesLocal),
      bonbon_target: null
    };
    if (!patch.name) { feedback.textContent = 'Name fehlt.'; feedback.classList.add('error'); return; }
    if (!patch.season || patch.season < 1) { feedback.textContent = 'Season ungültig.'; feedback.classList.add('error'); return; }
    if (patch.season >= 3) {
      if (!bonbonTarget || bonbonTarget < 1) {
        feedback.textContent = 'Bonbon-Ziel fehlt (Pflicht ab Season 3).';
        feedback.classList.add('error');
        return;
      }
      patch.bonbon_target = bonbonTarget;
    }
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
  const bonbonWrap = document.getElementById('edClBonbonTargetWrap');
  const bonbonInp  = document.getElementById('edClBonbonTarget');
  const isS3 = c.season >= 3;
  bonbonWrap.hidden = !isS3;
  bonbonInp.required = isS3;
  bonbonInp.value = c.bonbon_target ?? '';
  document.getElementById('edClFeedback').textContent = '';
  document.getElementById('clusterEditModal').hidden = false;
}

// ─── Cluster-Starthilfe-Modal ────────────────────────────────
// Konfiguriert cluster_bonus (Row existiert nur wenn konfiguriert).
// Deaktivieren ohne Löschen ist bewusst: die Grants bleiben bestehen,
// aber neue Anmeldungen bekommen nichts mehr.
let bonusClusterId = null;

// cluster_managed=false (Migration 0072) filtert Spiele heraus, die dem
// Kurs-Schalter nicht gehören — heute nur das Easter-Egg game1337. Es
// steht in `games`, aber nicht in GAMES_CONFIG: es erschließt sich über
// die Atari-Zahlenreihe, nicht über eine Freischaltung der Lehrkraft.
// Der Filter sitzt hier und nicht in den drei Aufrufern, damit es keine
// Liste gibt, in der es doch wieder auftaucht.
async function ensureGamesBySeason() {
  if (gamesBySeason) return gamesBySeason;
  const rows = await api('GET',
    `games?select=id,season,title&active=eq.true&cluster_managed=eq.true&order=season.asc`);
  gamesBySeason = {};
  gameTitleById = {};
  for (const g of rows) {
    if (!gamesBySeason[g.season]) gamesBySeason[g.season] = [];
    gamesBySeason[g.season].push(g.id);
    if (g.title) gameTitleById[g.id] = g.title;
  }
  return gamesBySeason;
}

// Liefert den Spielnamen zu einer game-ID, Fallback auf die ID selbst.
// Nutzt gameTitleById, das per ensureGamesBySeason() befüllt wird.
function gameTitle(gameId) {
  return (gameTitleById && gameTitleById[gameId]) || gameId;
}

function wireClusterBonusModal() {
  const overlay = document.getElementById('clusterBonusModal');
  const close   = document.getElementById('clusterBonusClose');
  const cancel  = document.getElementById('cbCancel');
  const form    = document.getElementById('clusterBonusForm');

  const doClose = () => { overlay.hidden = true; bonusClusterId = null; };
  close.addEventListener('click', doClose);
  cancel.addEventListener('click', doClose);
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!bonusClusterId) return;
    const feedback = document.getElementById('cbFeedback');
    const btn      = document.getElementById('cbSubmit');
    feedback.className = 'form-feedback';
    feedback.textContent = '';

    const active = document.getElementById('cbActive').checked;
    const coins  = parseInt(document.getElementById('cbCoins').value, 10) || 0;
    const seasons = Array.from(
      document.querySelectorAll('#cbSeasonList input[type="checkbox"]:checked')
    ).map(cb => parseInt(cb.value, 10)).sort((a, b) => a - b);

    if (coins < 0 || coins > 10000) {
      feedback.textContent = 'Startcoins: 0 bis 10000.';
      feedback.classList.add('error');
      return;
    }

    btn.disabled = true;
    try {
      // Upsert via PostgREST: on_conflict + Prefer resolution=merge-duplicates.
      // Der api()-Helper setzt nur return=representation — wir müssen den
      // Merge-Modus selbst nachlegen, sonst wirft PostgREST 23505.
      const token = window.__accessToken;
      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/cluster_bonus?on_conflict=cluster_id`,
        {
          method: 'POST',
          headers: {
            apikey: window.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation,resolution=merge-duplicates',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            cluster_id: bonusClusterId,
            active,
            startup_coins: coins,
            seasons
          })
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      doClose();
      await loadClusters();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function openClusterBonus(id) {
  const c = clusterCache.find(x => x.id === id);
  if (!c) return;
  bonusClusterId = id;

  // Formular mit Cluster-Werten füllen. Ohne Bonus-Row: Defaults.
  const b = c.bonus || { active: false, startup_coins: 0, seasons: [] };
  document.getElementById('cbActive').checked = !!b.active;
  document.getElementById('cbCoins').value    = b.startup_coins ?? 0;
  document.getElementById('cbFeedback').textContent = '';

  // Season-Liste dynamisch aufbauen.
  const list = document.getElementById('cbSeasonList');
  list.innerHTML = '<div class="cb-seasons__loading">Lade Spielübersicht…</div>';
  try {
    const bySeason = await ensureGamesBySeason();
    const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);
    if (seasons.length === 0) {
      list.innerHTML = '<div class="empty">Keine aktiven Spiele gefunden.</div>';
    } else {
      const preselected = new Set(b.seasons || []);
      list.innerHTML = seasons.map(s => {
        const checked = preselected.has(s) ? 'checked' : '';
        const count = bySeason[s].length;
        return `
          <label class="cb-season">
            <input type="checkbox" value="${s}" ${checked} />
            <span><strong>Season ${s}</strong> — ${count} Spiel${count === 1 ? '' : 'e'} werden freigeschaltet, je ein Baby-Monster.</span>
          </label>`;
      }).join('');
    }
  } catch (err) {
    list.innerHTML = `<div class="empty">Fehler: ${escapeHtml(err.message)}</div>`;
  }

  document.getElementById('clusterBonusModal').hidden = false;
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
    startupLoaded  = false;
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
      switchEl.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      clampSortToView();
      saveUiState();
      syncProgressSourceUI();
      await ensureViewData();
      renderUsers();
    });
  });
  syncProgressSourceUI();
}

// Die zweite Umschaltung — nur in der Fortschritts-Ansicht sichtbar.
function wireProgressSourceSwitch() {
  const switchEl = document.getElementById('progressSourceSwitch');
  switchEl.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.src === uiState.progressSrc);
    b.addEventListener('click', async () => {
      uiState.progressSrc = b.dataset.src;
      switchEl.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      // Die Sortierung zeigt sonst auf eine Spalte, die es hier nicht gibt.
      clampSortToView();
      saveUiState();
      await ensureViewData();
      renderUsers();
    });
  });
}

function syncProgressSourceUI() {
  document.getElementById('progressSourceLabel').hidden = uiState.view !== 'progress';
}

// Sortier-Schlüssel auf die Spalten der aktuellen Ansicht begrenzen.
function clampSortToView() {
  const cols = VIEW_COLUMNS[viewKey()] || VIEW_COLUMNS.admin;
  if (cols.some(c => c.key === uiState.sort.key)) return;
  uiState.sort = { key: 'account_name', dir: 'asc' };
}

// Lädt die Daten nach, die die aktuelle Ansicht braucht — jeweils einmal.
async function ensureViewData() {
  if (uiState.view !== 'progress') return;
  if (viewKey() === 'startup') {
    if (!startupLoaded) await loadStartupData();
  } else if (!progressLoaded) {
    await loadProgressData();
  }
}

async function loadUsers() {
  const tbody = document.getElementById('userTbody');
  try {
    const rows = await api('GET',
      `profiles?select=id,account_name,display_name,display_name_locked,status,cluster_id,is_admin,is_superadmin,avatar_id,created_at`
      + `&school_id=eq.${currentSchoolId}`);
    userCache = rows;

    // Bei aktiver Progress-View direkt mitziehen
    await ensureViewData();

    renderUsers();
  } catch (err) {
    tbody.innerHTML = `<tr><td class="empty">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Lädt Coins/Kristalle/Kreaturen/Legies/last-active und mergt in userCache.
async function loadProgressData() {
  try {
    const [wallets, gameStates, shopStates] = await Promise.all([
      api('GET', `wallets?select=user_id,coins,bonbons,updated_at`),
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
        bonbons:      w?.bonbons ?? 0,
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

/* ══════════════════════════════════════════════════════════════
   Startup Story (game18) — Spielstand-Auswertung
   ══════════════════════════════════════════════════════════════
   Der Spielstand liegt als opaker Blob in user_game_saves
   (Migration 0061). Was er BEDEUTET — Phase, Serverkapazität,
   Trend, Watchtime-Faktor, Techtree-Fortschritt — steht
   ausschließlich in den Spiel-Modulen und ändert sich mit jedem
   Balance-Pass. Statt diese Formeln hier nachzubauen, lädt das
   Panel die Module nach und setzt ihnen den Blob als
   `RT3.state.current` vor; gerechnet wird dann mit denselben
   Gettern, die auch im Spiel rechnen.

   ⚠️ Nur LESENDE Getter aufrufen. setTrendMod, pushSparkSample,
      markSeen & Co. schreiben in `current` — und weil
      Object.assign die verschachtelten Objekte per Referenz
      übernimmt, landete das im geladenen Blob.
   ⚠️ Die fünf Module sind reine Definitions-Module: kein
      DOM-Zugriff beim Laden, keine Timer. Nur techtree.js hängt
      sich an `state:changed` — ein Ereignis, das hier nie feuert. */

const SS_GAME_ID = 'game18';
const SS_ENGINE_FILES = [
  'namespace.js', 'bus.js', 'ledger.js', 'state.js', 'techtree.js', 'events.js'
].map(f => `../GameHub/S3 Startup Story/js/${f}?v=20260812`);

let ssEnginePromise = null;
function ensureStartupEngine() {
  if (ssEnginePromise) return ssEnginePromise;
  // Streng nacheinander — state.js braucht bus.js, techtree.js braucht beides.
  ssEnginePromise = SS_ENGINE_FILES.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload  = resolve;
    el.onerror = () => reject(new Error('Spiel-Modul nicht ladbar: ' + src));
    document.head.appendChild(el);
  })), Promise.resolve());
  return ssEnginePromise;
}

// Spielstände der aktuellen Schule nachladen und auswerten.
// ⚠️ Der ganze Blob, keine Feldauswahl: die Getter lesen quer durch den
// State, und ein vergessenes Feld fiele nicht als Fehler auf, sondern als
// stillschweigend falsche Zahl.
async function loadStartupData() {
  try {
    await ensureStartupEngine();
    const ids = userCache.map(u => u.id);
    const rows = [];
    // Die RLS-Policy ugs_admin_select_all ist NICHT schul-gebunden — ohne
    // Filter zöge ein Schuladmin die Spielstände aller Schulen. In Häppchen,
    // damit die URL nicht über das Header-Limit des Gateways wächst.
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      if (!chunk.length) break;
      rows.push(...await api('GET',
        `user_game_saves?select=user_id,save,save_version,rev,updated_at`
        + `&game_id=eq.${SS_GAME_ID}&user_id=in.(${chunk.join(',')})`));
    }

    const byUser = {};
    for (const r of rows) byUser[r.user_id] = r;
    for (const u of userCache) {
      const row = byUser[u.id];
      u._ss = row ? analyzeStartupSave(row) : null;
    }
    startupLoaded = true;
  } catch (err) {
    console.warn('[admin] loadStartupData failed:', err.message);
    showToast('Startup-Story-Spielstände konnten nicht geladen werden: ' + err.message, 'error');
  }
}

/* Blob in die Engine legen. `RT3.state.current` ist EIN Objekt, das jede
   Auswertung neu überschreibt — wer später noch rechnen will (Detail-Modal),
   muss den Stand vorher zurückholen. Erst die Vorgaben des Spiels, dann der
   Blob darüber: ein alter Stand kennt neue Felder nicht, die Getter lesen
   sie trotzdem. */
function ssApply(blob) {
  const S = window.RT3.state;
  S.resetCurrent();
  Object.assign(S.current, blob || {});
  return S;
}

// Ein Spielstand → die Kennzahlen, die Tabelle und Detail-Modal zeigen.
function analyzeStartupSave(row) {
  const RT = window.RT3;
  const S  = ssApply(row.save);

  const farms  = S.instancesByType('farm');
  const fills  = S.farmFills();
  const fillBy = {};
  for (const f of fills) fillBy[f.instanceId] = f;

  let wtPerSec = 0, upkeepDue = 0;
  for (const f of farms) {
    wtPerSec += S.watchtimePerSec(f);
    if (S.farmUpkeepDue(f)) upkeepDue++;
  }

  // Techtree: was der Spielstand von den 57 Nodes hat. Sichtbarkeit nach
  // Phase spielt hier bewusst keine Rolle — gefragt ist der Anteil am
  // ganzen Baum, nicht am gerade erreichbaren Teil.
  const NODES = RT.techtree.NODES;
  const tt = S.current.techtree || {};
  const tree = { total: 0, done: 0, running: 0, darkTotal: 0, darkDone: 0, whiteTotal: 0, whiteDone: 0,
                 byTab: {}, doneNames: [], darkNames: [], whiteNames: [], runningNames: [] };
  for (const id of Object.keys(NODES)) {
    const def = NODES[id];
    const st  = tt[id] && tt[id].status;
    const tab = tree.byTab[def.tab] || (tree.byTab[def.tab] = { total: 0, done: 0 });
    tree.total++; tab.total++;
    if (def.darkPattern) tree.darkTotal++;
    if (def.networkK)    tree.whiteTotal++;
    if (st === 'done') {
      tree.done++; tab.done++;
      tree.doneNames.push(def.name);
      if (def.darkPattern) { tree.darkDone++;  tree.darkNames.push(def.name);  }
      if (def.networkK)    { tree.whiteDone++; tree.whiteNames.push(def.name); }
    } else if (st === 'in_progress' || st === 'ready') {
      tree.running++;
      tree.runningNames.push(def.name);
    }
  }

  const buildings = {};
  for (const b of (S.current.placedBuildings || [])) buildings[b.id] = (buildings[b.id] || 0) + 1;

  return {
    // ⚠️ Der rohe Blob, NICHT S.current — das Objekt gehört der Engine und
    // trägt beim nächsten Aufruf den Stand des nächsten Users.
    blob: row.save || {},
    updatedAt:   row.updated_at,
    saveVersion: row.save_version,
    rev:         row.rev,
    phase:       S.currentPhase(),
    users:       Math.floor(S.current.users || 0),
    usersPeak:   Math.floor(S.current.usersPeak || 0),
    money:       Math.floor(S.current.money || 0),
    watchtime:   Math.floor(S.current.watchtime || 0),
    metadata:    Math.floor(S.current.metadata || 0),
    models:      Math.floor(S.current.models || 0),
    // Trend ist eine Momentaufnahme: die befristeten Modifikatoren sind seit
    // dem letzten Speichern weiter abgeklungen. Der Ruhewert daneben ist der
    // stabile Teil und deshalb die aussagekräftigere Zahl.
    trend:       S.trendValue(),
    trendBase:   S.trendBaseValue(),
    network:     S.networkEffect(),
    capacity:    S.serverCapacityTotal(),
    programm:    S.programmCapacity(),
    freeCap:     S.freeUserCapacity(),
    upkeepTier:  S.serverUpkeepTier(),
    upkeepDue,
    wtMult:      S.watchtimeMult(),
    wtPerSec,
    farms:       farms.map(f => ({
      instanceId: f.instanceId,
      stufe:      S.tierStufe(f.state.tierId),
      tier:       S.tierById(f.state.tierId),
      cap:        S.farmCapacity(f),
      fill:       fillBy[f.instanceId] || { users: 0, programm: 0, models: 0 },
      stacks:     f.state.stacks || 0,
      upkeep:     f.state.upkeepCycles || 0,
      due:        S.farmUpkeepDue(f),
      speed:      S.farmSpeedFactor(f)
    })),
    buildings,
    tiles: (S.current.ownedTiles || []).length,
    tree
  };
}

// Zahlen wie im Spiel: bis 999.999 vollständig, darüber gekürzt.
function ssNum(n)   { return window.RT3?.ledger?.fmt.num(n) ?? String(Math.round(n || 0)); }
function ssMoney(n) { return window.RT3?.ledger?.fmt.money(n) ?? String(Math.round(n || 0)) + ' €'; }
function ssTrend(v) {
  const n = Math.round((v || 0) * 10) / 10;
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1).replace('.', ',');
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
    { label: '🍬 Bonbons',   key: 'bonbons'         },
    { label: 'Kreaturen',    key: 'creatures'       },
    { label: 'Legies',       key: 'legendaries'     },
    { label: 'Zuletzt aktiv',key: 'lastActive'      },
    { label: 'Aktion',       key: null              }
  ],
  // Startup Story (game18) — jede Spalte kommt aus dem Spielstand-Blob.
  startup: [
    { label: 'Account',      key: 'account_name'    },
    { label: 'Anzeigename',  key: 'display_name'    },
    { label: 'Phase',        key: 'ss_phase'        },
    { label: '👥 User',      key: 'ss_users'        },
    { label: '📈 Peak',      key: 'ss_peak'         },
    { label: '💰 Geld',      key: 'ss_money'        },
    { label: '⏳ Watchtime', key: 'ss_watchtime'    },
    { label: '⭐ Trend',     key: 'ss_trend'        },
    { label: '🖥️ Server',    key: 'ss_capacity'     },
    { label: '🧠 KI',        key: 'ss_models'       },
    { label: '🧩 Techtree',  key: 'ss_tree'         },
    { label: '🔴 Dark',      key: 'ss_dark'         },
    { label: 'Zuletzt',      key: 'ss_updated'      },
    { label: 'Aktion',       key: null              }
  ]
};

function renderUsers() {
  const thead  = document.getElementById('userThead');
  const tbody  = document.getElementById('userTbody');
  const status = document.getElementById('userStatusFilter').value;
  const q      = document.getElementById('userSearch').value.trim().toLowerCase();
  const cols   = VIEW_COLUMNS[viewKey()] || VIEW_COLUMNS.admin;

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
  tbody.querySelectorAll('.js-reset-progress').forEach(btn => {
    btn.addEventListener('click', () => resetUserProgress(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-detail').forEach(btn => {
    btn.addEventListener('click', () => openUserDetail(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-ss-detail').forEach(btn => {
    btn.addEventListener('click', () => openStartupDetail(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-role-change').forEach(btn => {
    btn.addEventListener('click', () => openRoleChange(btn.dataset.userId));
  });
  tbody.querySelectorAll('.js-move-school').forEach(btn => {
    btn.addEventListener('click', () => openMoveSchool(btn.dataset.userId));
  });

  // Zeilen-Dropdown öffnen/schließen. Klick außerhalb schließt via document-Handler unten.
  tbody.querySelectorAll('.js-row-actions-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleRowActionsMenu(btn);
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
      case 'bonbons':     return u._progress?.bonbons     ?? 0;
      case 'kristalle':   return u._progress?.kristalle   ?? 0;
      case 'creatures':   return u._progress?.creatures   ?? 0;
      case 'legendaries': return u._progress?.legendaries ?? 0;
      case 'lastActive':  return u._progress?.lastActive  ?? '';
      // Startup Story — ohne Spielstand ans Ende der Zahlen-Sortierung (-1).
      case 'ss_phase':     return u._ss ? u._ss.phase      : -1;
      case 'ss_users':     return u._ss ? u._ss.users      : -1;
      case 'ss_peak':      return u._ss ? u._ss.usersPeak  : -1;
      case 'ss_money':     return u._ss ? u._ss.money      : -1;
      case 'ss_watchtime': return u._ss ? u._ss.watchtime  : -1;
      case 'ss_trend':     return u._ss ? u._ss.trend      : -999;
      case 'ss_capacity':  return u._ss ? u._ss.capacity   : -1;
      case 'ss_models':    return u._ss ? u._ss.models     : -1;
      case 'ss_tree':      return u._ss ? u._ss.tree.done  : -1;
      case 'ss_dark':      return u._ss ? u._ss.tree.darkDone : -1;
      case 'ss_updated':   return u._ss ? u._ss.updatedAt  : '';
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

// Ein Volladmin ist für Schuladmins tabu — sie dürfen ihn weder umbenennen,
// noch Passwort/Cluster/Rolle ändern. Serverseitig durch RLS + API-Guards
// abgesichert; das Frontend graut die UI-Elemente aus, damit der Schuladmin
// nicht ins Leere klickt und einen Server-Fehler kassiert.
function isProtectedFromCaller(u) {
  return u.is_superadmin && !isVolladmin;
}

function renderCell(u, col) {
  const isSelf     = u.id === currentUserId;
  const isProtected = isProtectedFromCaller(u);
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
      badge += ' ' + roleBadge(u);
      return `<td>${badge}</td>`;
    }
    case 'cluster': {
      const opts = ['<option value="">— kein Cluster —</option>']
        .concat(clusterCache.map(c =>
          `<option value="${c.id}" ${c.id === u.cluster_id ? 'selected' : ''}>${escapeHtml(c.name)} · S${c.season}</option>`
        )).join('');
      // Admins dürfen sich selbst einem Cluster zuordnen (Beobachter-Modus:
      // Backend filtert Admin-Accounts aus Leaderboards/Bonbon-Pool/Legi-Grants).
      const disabled = isProtected ? 'disabled' : '';
      const title    = isProtected ? 'title="Volladmin kann nur von einem Volladmin geändert werden"' : '';
      return `<td><select class="js-cluster-select" data-user-id="${u.id}" ${disabled} ${title}>${opts}</select></td>`;
    }
    case 'created_at':
      return `<td>${fmtDT(u.created_at)}</td>`;
    case 'display_name_locked':
      return `<td>${u.display_name_locked ? '🔒 gesperrt' : '—'}</td>`;
    case 'is_admin':
      return `<td>${roleBadge(u)}</td>`;
    // Progress-Metriken
    case 'coins':
      return `<td><span class="metric"><span class="metric-icon">🪙</span>${u._progress?.coins ?? '—'}</span></td>`;
    case 'bonbons':
      return `<td><span class="metric"><span class="metric-icon">🍬</span>${u._progress?.bonbons ?? '—'}</span></td>`;
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
    // Startup-Story-Metriken. Ohne Spielstand bleibt die ganze Zeile leer —
    // „hat noch nie gespielt" ist etwas anderes als „steht bei 0".
    case 'ss_phase': {
      if (!u._ss) return ssEmpty();
      const p = u._ss.phase;
      return `<td><span class="ss-phase ss-phase--${p}">Phase ${p}</span></td>`;
    }
    case 'ss_users':
      return u._ss ? `<td class="num">${ssNum(u._ss.users)}</td>` : ssEmpty();
    case 'ss_peak':
      return u._ss ? `<td class="num">${ssNum(u._ss.usersPeak)}</td>` : ssEmpty();
    case 'ss_money':
      return u._ss ? `<td class="num">${ssMoney(u._ss.money)}</td>` : ssEmpty();
    case 'ss_watchtime':
      return u._ss ? `<td class="num">${ssNum(u._ss.watchtime)}${
        u._ss.wtMult > 1 ? `<span class="ss-sub">×${u._ss.wtMult.toFixed(2).replace('.', ',')}</span>` : ''
      }</td>` : ssEmpty();
    case 'ss_trend': {
      if (!u._ss) return ssEmpty();
      const t = u._ss.trend;
      const cls = t > 0 ? 'ss-up' : t < 0 ? 'ss-down' : '';
      // Der Ruhewert darunter ist der Teil, der nicht abklingt.
      return `<td class="num"><span class="${cls}">${ssTrend(t)}</span>`
           + `<span class="ss-sub" title="Ruhewert: Grundinteresse + Netzwerkeffekt − Dark-Pattern-Schuld">`
           + `Ruhe ${ssTrend(u._ss.trendBase)}</span></td>`;
    }
    case 'ss_capacity': {
      if (!u._ss) return ssEmpty();
      const s = u._ss;
      const warn = s.upkeepDue > 0
        ? `<span class="ss-warn" title="${s.upkeepDue} Farm(en) unversorgt — gedrosselt">🔌 ${s.upkeepDue}</span>` : '';
      return `<td class="num">${ssNum(s.capacity)}`
           + `<span class="ss-sub">${s.farms.length} Farm${s.farms.length === 1 ? '' : 'en'} · ${s.upkeepTier.name} ${warn}</span></td>`;
    }
    case 'ss_models': {
      if (!u._ss) return ssEmpty();
      if (u._ss.phase < 3) return '<td class="num ss-muted">—</td>';
      return `<td class="num">🧠 ${ssNum(u._ss.models)}<span class="ss-sub">🗃️ ${ssNum(u._ss.metadata)}</span></td>`;
    }
    case 'ss_tree': {
      if (!u._ss) return ssEmpty();
      const t = u._ss.tree;
      const pct = t.total ? Math.round(t.done / t.total * 100) : 0;
      const running = t.running ? `<span class="ss-sub">${t.running} in Arbeit</span>` : '';
      return `<td class="num" title="${escapeHtml(Object.keys(t.byTab).map(k => `${k}: ${t.byTab[k].done}/${t.byTab[k].total}`).join(' · '))}">`
           + `<div class="ss-bar"><span style="width:${pct}%"></span></div>`
           + `${t.done}/${t.total} · ${pct} %${running}</td>`;
    }
    case 'ss_dark': {
      if (!u._ss) return ssEmpty();
      const t = u._ss.tree;
      return `<td class="num"><span class="${t.darkDone ? 'ss-down' : ''}">${t.darkDone}/${t.darkTotal}</span>`
           + `<span class="ss-sub" title="Vertrauens-Features">🌱 ${t.whiteDone}/${t.whiteTotal}</span></td>`;
    }
    case 'ss_updated':
      return u._ss ? `<td>${fmtRelative(u._ss.updatedAt)}</td>` : ssEmpty();
    default: {
      // Erst Spezial-Spalten (nicht-Aktion), dann View-basierte Aktion.
      if (col.label === 'Avatar')     return `<td>${renderAvatarThumb(u.avatar_id)}</td>`;
      if (viewKey() === 'admin')      return renderAdminActions(u);
      if (viewKey() === 'startup')    return renderStartupActions(u);
      if (viewKey() === 'progress')   return renderProgressActions(u);
      return '<td>—</td>';
    }
  }
}

// „Noch nie gespielt" — eine leere Zelle, kein 0-Wert.
function ssEmpty() { return '<td class="ss-muted">—</td>'; }

function renderAdminActions(u) {
  const isSelf     = u.id === currentUserId;
  const isProtected = isProtectedFromCaller(u);
  const lockLabel  = u.display_name_locked ? '🔒 Entsperren' : '🔓 Sperren';
  // Volladmins darf nur ein Volladmin anfassen; sonst alle Buttons ausgraut.
  const roleDisabled  = isSelf || isProtected;
  const editDisabled  = isSelf || isProtected;   // Umbenennen, Lock-Toggle, PW-Reset
  const resetDisabled = !canResetTarget(u);
  const resetTitle    = resetDisabled ? 'title="Volladmin nur self; Schuladmin darf nur ein Volladmin resetten."' : '';
  // Admins löschen ist tabu (Rollen-Änderung erst → dann löschen).
  const isAdminRow = u.is_admin || u.is_superadmin;
  const protectedTitle = isProtected ? 'title="Nur ein Volladmin kann einen Volladmin ändern"' : '';
  const moveBtn = isVolladmin
    ? `<button type="button" class="js-move-school" data-user-id="${u.id}">In andere Schule verschieben</button>`
    : '';
  return `<td>
    <div class="row-actions" data-user-id="${u.id}">
      <button type="button" class="row-actions__btn js-row-actions-btn">Aktionen</button>
      <div class="row-actions__menu" hidden>
        <button type="button" class="js-rename"       data-user-id="${u.id}" ${editDisabled ? 'disabled' : ''} ${protectedTitle}>Umbenennen</button>
        <button type="button" class="js-pw-reset"     data-user-id="${u.id}" ${editDisabled ? 'disabled' : ''} ${protectedTitle}>Passwort setzen</button>
        <button type="button" class="js-lock-toggle"  data-user-id="${u.id}" ${editDisabled ? 'disabled' : ''} ${protectedTitle}>${lockLabel}</button>
        <button type="button" class="js-role-change"  data-user-id="${u.id}" ${roleDisabled ? 'disabled' : ''} ${protectedTitle}>Rolle ändern</button>
        <button type="button" class="js-reset-progress" data-user-id="${u.id}" ${resetDisabled ? 'disabled' : ''} ${resetTitle}>Fortschritt zurücksetzen</button>
        ${moveBtn}
        <hr />
        <button type="button" class="danger js-delete" data-user-id="${u.id}" ${(isSelf || isAdminRow) ? 'disabled' : ''}>Löschen</button>
      </div>
    </div>
  </td>`;
}

// Reset-Regeln:
//   - Sich selbst darf jeder Admin resetten (zum Testen).
//   - Fremde Volladmins: niemand (auch andere Volladmins nicht).
//   - Fremde Schuladmins: nur Volladmin-Caller.
//   - Fremde Schüler: alle Admins, Schul-Iso über RLS/Backend.
function canResetTarget(u) {
  if (u.id === currentUserId) return true;
  if (u.is_superadmin)        return false;
  if (u.is_admin)             return isVolladmin;
  return true;
}

// Rendert den passenden Rollen-Badge für einen User-Row.
function roleBadge(u) {
  if (u.is_superadmin) return '<span class="badge volladmin">Volladmin</span>';
  if (u.is_admin)      return '<span class="badge schuladmin">Schuladmin</span>';
  return '<span class="badge">Schüler</span>';
}
function renderProgressActions(u) {
  return `<td><div class="actions">
    <button class="btn small js-detail" data-user-id="${u.id}">Details</button>
  </div></td>`;
}

function renderStartupActions(u) {
  return `<td><div class="actions">
    <button class="btn small js-ss-detail" data-user-id="${u.id}" ${u._ss ? '' : 'disabled'}>Details</button>
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
  const u = userCache.find(x => x.id === userId);
  const isAdminTarget = !!(u && (u.is_admin || u.is_superadmin));
  // Admin-Beobachter behalten ihren Status (typischerweise 'active').
  // Nur Schüler-Accounts wechseln zwischen 'pending' und 'active'.
  const patch = { cluster_id: clusterId };
  if (!isAdminTarget) patch.status = clusterId ? 'active' : 'pending';
  try {
    await api('PATCH', `profiles?id=eq.${userId}`, patch);
    if (u) {
      u.cluster_id = clusterId;
      if (!isAdminTarget) u.status = patch.status;
    }
    renderUsers();
    loadClusters();
    // Starthilfe ausschütten (idempotent — schadet nicht, wenn Cluster
    // keinen Bonus hat oder User bereits Grant besitzt). Für Admins
    // liefert die RPC skipped='target_is_admin' zurück.
    if (clusterId && !isAdminTarget) applyBonusForUser(userId);
  } catch (err) {
    showToast('Cluster-Zuweisung fehlgeschlagen: ' + err.message, 'error');
    renderUsers();
  }
}

// Ruft apply_cluster_bonus für einen User als best-effort auf.
// Idempotent per DB-Design; Fehler nur loggen, User-Facing-Toast nur
// bei tatsächlichem Grant (damit stumme Skips nicht nerven).
async function applyBonusForUser(userId) {
  try {
    const result = await api('POST', 'rpc/apply_cluster_bonus', { p_user_id: userId });
    if (result?.granted) {
      const parts = [];
      if (result.coins_added)    parts.push(`+${result.coins_added} 🪙`);
      if (result.babies_placed)  parts.push(`${result.babies_placed} Baby-Monster`);
      if (result.games_unlocked) parts.push(`${result.games_unlocked} Spiele frei`);
      showToast('Starthilfe: ' + (parts.join(', ') || 'ausgeschüttet'));
    }
  } catch (err) {
    console.warn('[admin] apply_cluster_bonus fehlgeschlagen:', err.message);
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

// Setzt einen Account auf Frisch-Zustand zurück (alles außer Account-Name,
// Passwort, Rolle, Cluster, Schule). Bestätigung durch Tippen des Accountnamens.
// Self-Reset ist erlaubt und triggert danach einen Full-Reload, damit der
// lokale localStorage-State mit dem gewipten Server-State wieder gleichzieht.
async function resetUserProgress(userId) {
  // userCache oder adminCache — Reset ist aus beiden Tabs erreichbar.
  const u = userCache.find(x => x.id === userId) || adminCache.find(x => x.id === userId);
  if (!u) return;
  if (!canResetTarget(u)) {
    showToast('Für diese Rolle ist der Reset nicht erlaubt.', 'error');
    return;
  }
  const isSelf = u.id === currentUserId;
  const targetLabel = isSelf ? 'DEINEN Fortschritt' : `Fortschritt von „${u.display_name || u.account_name}"`;
  const answer = prompt(
    `${targetLabel} komplett zurücksetzen?\n\n` +
    `Alle Coins, Kristalle, Kreaturen, Nester, Highscores und Meilensteine werden gelöscht.\n` +
    `Cluster-Starthilfe wird bei einem Cluster automatisch neu ausgeschüttet.\n\n` +
    `Zum Bestätigen den Accountnamen tippen: ${u.account_name}`,
    ''
  );
  if (answer === null) return;
  if (answer.trim() !== u.account_name) {
    showToast('Accountname stimmt nicht — abgebrochen.', 'error');
    return;
  }
  try {
    const token = window.__accessToken;
    const res = await fetch('/api/admin_reset_user_progress', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);

    if (isSelf) {
      // Server-State ist weg — lokaler Cache in localStorage ist jetzt Fake.
      // Sauberer Neuanfang durch clearLocalGameState + Reload.
      window.clearLocalGameState?.();
      showToast('Dein Fortschritt wurde zurückgesetzt — lade neu …');
      setTimeout(() => location.reload(), 800);
      return;
    }

    // Progress-Cache invalidieren → beim nächsten Render 0-Werte anzeigen.
    if (u._progress) {
      u._progress.coins       = 0;
      u._progress.kristalle   = 0;
      u._progress.creatures   = 0;
      u._progress.legendaries = 0;
      u._progress.lastActive  = null;
    }
    progressLoaded = false;  // erzwinge Reload beim nächsten Progress-View
    renderUsers();

    const parts = [`${u.account_name} zurückgesetzt`];
    const bonus = body.bonus_applied;
    if (bonus?.granted) {
      const sub = [];
      if (bonus.coins_added)    sub.push(`+${bonus.coins_added} 🪙`);
      if (bonus.babies_placed)  sub.push(`${bonus.babies_placed} Baby-Monster`);
      if (bonus.games_unlocked) sub.push(`${bonus.games_unlocked} Spiele frei`);
      if (sub.length > 0) parts.push(`Starthilfe: ${sub.join(', ')}`);
    }
    showToast(parts.join(' · '));
  } catch (err) {
    showToast('Zurücksetzen fehlgeschlagen: ' + err.message, 'error');
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

// Rolle serverseitig setzen. Aufgerufen aus dem Rollen-Modal.
// Aktualisiert userCache + adminCache je nach Vorher/Nachher-Zustand,
// damit die Ansichten sofort stimmen.
async function applyRoleChange(userId, role) {
  const token = window.__accessToken;
  const res = await fetch('/api/admin_promote_user', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, role })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);

  const flags = body.flags || { is_admin: false, is_superadmin: false };
  const u = userCache.find(x => x.id === userId);
  if (u) { u.is_admin = flags.is_admin; u.is_superadmin = flags.is_superadmin; }
  const au = adminCache.find(x => x.id === userId);
  if (au) { au.is_admin = flags.is_admin; au.is_superadmin = flags.is_superadmin; }
  // Wenn Ex-Admin: aus adminCache raus. Wenn Neu-Admin: nachladen.
  if (!flags.is_admin && !flags.is_superadmin) {
    adminCache = adminCache.filter(x => x.id !== userId);
  } else if (!au) {
    // war vorher kein Admin — bei Bedarf beim nächsten Admins-Tab-Load frisch ziehen
  }
  return body;
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
    // Starthilfe für alle betroffenen User (idempotent). Parallel, ohne
    // auf einzelne Fehler zu warten — Bulk-Toast läuft schon.
    if (clusterId) {
      Promise.all(ids.map(uid =>
        api('POST', 'rpc/apply_cluster_bonus', { p_user_id: uid }).catch(e => {
          console.warn('[admin] bulk bonus fail', uid, e.message);
          return null;
        })
      )).then(results => {
        const granted = results.filter(r => r?.granted).length;
        const failed  = results.filter(r => r === null).length;
        if (granted > 0) showToast(`Starthilfe: ${granted} User haben Bonus erhalten.`);
        if (failed > 0)  showToast(`Starthilfe: ${failed} User fehlgeschlagen (siehe Konsole).`);
      });
    }
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
  // Admins können nicht gelöscht werden — vorher Rolle auf Schüler ändern.
  const adminIds = ids.filter(id => {
    const u = userCache.find(x => x.id === id);
    return u && (u.is_admin || u.is_superadmin);
  });
  if (adminIds.length > 0) {
    showToast(`${adminIds.length === 1 ? 'Ein Admin' : `${adminIds.length} Admins`} in der Auswahl. Rolle zuerst auf Schüler:in ändern, dann löschen.`, 'error');
    ids = ids.filter(id => !adminIds.includes(id));
  }
  if (ids.length === 0) return;

  deleteTargetIds = ids;
  const users = ids.map(id => userCache.find(u => u.id === id)).filter(Boolean);
  const adminCount = 0;  // Admins bereits ausgefiltert
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
    // Spielnamen-Lookup sicherstellen — sonst zeigen wir die ID.
    await ensureGamesBySeason().catch(() => {});

    const gsRows = gameStates.length === 0
      ? '<tr><td colspan="7" class="empty">Noch keine Spielrunden.</td></tr>'
      : gameStates.map(gs => `
          <tr>
            <td>${escapeHtml(gameTitle(gs.game_id))}</td>
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

/* ─── Startup-Story-Detail ───────────────────────────────────── */

function openStartupDetail(userId) {
  const u = userCache.find(x => x.id === userId);
  if (!u || !u._ss) return;
  const s = u._ss;
  const S = ssApply(s.blob);   // Stand zurückholen — siehe ssApply()
  const c = S.current;

  document.getElementById('userDetailTitle').textContent =
    `${u.display_name || u.account_name} · 🚀 ${c.player?.platformName || 'Startup Story'}`;
  document.getElementById('userDetailModal').hidden = false;

  const tile = (label, value, sub) =>
    `<div class="ss-tile"><span class="ss-tile__label">${label}</span>`
    + `<strong>${value}</strong>${sub ? `<span class="ss-tile__sub">${sub}</span>` : ''}</div>`;

  const tiles = [
    tile('Phase', `Phase ${s.phase}`, `Grid ${20 + s.tiles} Felder`),
    tile('👥 User', ssNum(s.users), `Peak ${ssNum(s.usersPeak)}`),
    tile('💰 Geld', ssMoney(s.money), null),
    tile('⏳ Watchtime', ssNum(s.watchtime),
         `${ssNum(Math.round(s.wtPerSec))}/s · ×${s.wtMult.toFixed(2).replace('.', ',')}`),
    tile('⭐ Trend', ssTrend(s.trend), `Ruhewert ${ssTrend(s.trendBase)} · 🌐 ${ssTrend(s.network)}`),
    tile('🖥️ Server', ssNum(s.capacity),
         `${ssNum(s.freeCap)} frei · Code ${ssNum(s.programm)} · Tarif ${s.upkeepTier.name}`),
    s.phase >= 3 ? tile('🧠 Modelle', ssNum(s.models),
         `🗃️ ${ssNum(s.metadata)} · Abdeckung ${(S.modelCoverage() * 100).toFixed(1).replace('.', ',')} %`) : '',
    tile('🧩 Techtree', `${s.tree.done}/${s.tree.total}`,
         `🔴 ${s.tree.darkDone}/${s.tree.darkTotal} · 🌱 ${s.tree.whiteDone}/${s.tree.whiteTotal}`)
  ].join('');

  // Trend-Aufschlüsselung — dieselbe Liste wie im Trend-Modal des Spiels.
  // activeTrendMods() enthält Grundinteresse, Ruhewert-Posten (permanent)
  // und die befristeten Modifikatoren bereits zusammen.
  const trendRows = S.activeTrendMods().map(m => {
    const art = m.network ? 'dauerhaft, wächst mit der Plattform'
              : m.permanent ? 'dauerhaft'
              : m.fading ? 'klingt ab' : 'befristet';
    return `<tr><td>${escapeHtml(m.label)}</td><td class="num">${ssTrend(m.value)}</td><td>${art}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="empty">keine Posten</td></tr>';

  const farmRows = s.farms.length === 0
    ? '<tr><td colspan="7" class="empty">Noch keine Serverfarm.</td></tr>'
    : s.farms.map(f => `
        <tr>
          <td>${f.tier ? f.tier.icon : ''} Stufe ${f.stufe}</td>
          <td class="num">${ssNum(f.cap)}</td>
          <td class="num">${ssNum(f.fill.users)}</td>
          <td class="num">${ssNum(f.fill.programm)}</td>
          <td class="num">${ssNum(f.fill.models)}</td>
          <td class="num">${f.stacks}/5</td>
          <td>${f.due ? `<span class="ss-warn">🔌 ${f.upkeep} Zyklen · ${Math.round(f.speed * 100)} %</span>`
                      : `${f.upkeep} Zyklen`}</td>
        </tr>`).join('');

  // Werbeagenturen, Marketing-Center und KI-Labore: was gerade läuft.
  const runRows = [];
  for (const b of S.instancesByType('werbe')) {
    const d = b.state.deal;
    runRows.push(`<tr><td>📢 Werbeagentur</td><td>${d
      ? `${escapeHtml(S.adTypeById(d.typeId)?.name || d.typeId)} · ${Math.round((d.intensity || 0) * 100)} % · `
        + `Zyklus ${d.cycle || 0}/${window.RT3.state.AD_CYCLES_MAX}${d.autoRenew ? ' ↻' : ''}`
      : '<span class="ss-muted">kein Deal</span>'}</td>
      <td class="num">${ssMoney(b.state.moneyReady || 0)}</td></tr>`);
  }
  for (const b of S.instancesByType('marketing')) {
    const a = b.state.active;
    runRows.push(`<tr><td>📣 Marketing-Center</td><td>${a
      ? escapeHtml(S.campaignById(a.campaignId)?.name || a.campaignId)
      : '<span class="ss-muted">keine Kampagne</span>'}</td>
      <td class="num">${a && a.prSlot ? 'Platz ' + a.prSlot : ssNum(b.state.ready || 0) + ' User'}</td></tr>`);
  }
  for (const b of S.instancesByType('kilabor')) {
    const conv = b.state.conv;
    runRows.push(`<tr><td>🧪 KI-Labor</td><td>${conv
      ? escapeHtml(S.convTypeById(conv.typeId)?.name || conv.typeId)
      : '<span class="ss-muted">idle</span>'}</td>
      <td class="num">${ssNum(b.state.modelsReady || 0)} 🧠</td></tr>`);
  }
  const runTable = runRows.length === 0 ? '' : `
    <h4 class="ss-h4">Konverter &amp; Kampagnen</h4>
    <table class="dtable"><thead><tr><th>Gebäude</th><th>Läuft</th><th>Wartet</th></tr></thead>
    <tbody>${runRows.join('')}</tbody></table>`;

  const tabLabel = { entwicklung: 'Entwicklung', marketing: 'Marketing', werbung: 'Werbung', ki: 'KI' };
  const treeBars = Object.keys(s.tree.byTab).map(k => {
    const t = s.tree.byTab[k];
    const pct = t.total ? Math.round(t.done / t.total * 100) : 0;
    return `<div class="ss-treebar"><span class="ss-treebar__label">${tabLabel[k] || k}</span>
      <div class="ss-bar"><span style="width:${pct}%"></span></div>
      <span class="ss-treebar__num">${t.done}/${t.total}</span></div>`;
  }).join('');

  const nameList = (title, names, cls) => names.length
    ? `<p class="ss-list"><strong>${title}</strong> <span class="${cls || ''}">${names.map(escapeHtml).join(' · ')}</span></p>`
    : '';

  const buildingSummary = Object.keys(s.buildings)
    .map(id => `${id} ×${s.buildings[id]}`).join(' · ');

  document.getElementById('userDetailBody').innerHTML = `
    <div class="ss-tiles">${tiles}</div>
    <p class="ss-meta">Gebäude: ${escapeHtml(buildingSummary)} · Entwicklungs-Plätze ${S.devSlotsTotal()}
       · Kampagnenplätze ${S.prSlotsUsed().length}/${S.prSlotsTotal()}
       · gespeichert ${fmtDT(s.updatedAt)} (rev ${s.rev}, Format ${s.saveVersion})</p>

    <h4 class="ss-h4">Serverfarmen</h4>
    <table class="dtable"><thead><tr>
      <th>Stufe</th><th>Kapazität</th><th>User</th><th>Code</th><th>Modelle</th><th>Stapel</th><th>Versorgung</th>
    </tr></thead><tbody>${farmRows}</tbody></table>

    ${runTable}

    <h4 class="ss-h4">Techtree</h4>
    ${treeBars}
    ${nameList('In Arbeit:', s.tree.runningNames)}
    ${nameList('🔴 Dark Patterns:', s.tree.darkNames, 'ss-down')}
    ${nameList('🌱 Vertrauens-Features:', s.tree.whiteNames, 'ss-up')}

    <h4 class="ss-h4">Trend-Aufschlüsselung</h4>
    <table class="dtable"><thead><tr><th>Posten</th><th>Wert</th><th>Art</th></tr></thead>
    <tbody>${trendRows}</tbody></table>
    <p class="ss-meta">⚠️ Befristete Posten klingen weiter ab, seit zuletzt gespeichert wurde —
       die Momentaufnahme ist also der Stand von jetzt, nicht der vom Spielende.</p>`;
}

/* ─── Utilities ─────────────────────────────────────────────── */

// escapeHtml lebt in session.js als window.escapeHtml.

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

/* ══════════════════════════════════════════════════════════════
   School-Switcher (Header-Dropdown)
   ══════════════════════════════════════════════════════════════ */

async function initSchoolSwitcher() {
  const wrap = document.getElementById('schoolSwitcher');
  const btn  = document.getElementById('schoolSwitcherBtn');
  const chev = document.getElementById('schoolSwitcherChev');
  wrap.hidden = false;

  if (isVolladmin) {
    try {
      allSchools = await api('GET', 'schools?select=id,slug,name,active&order=name.asc');
    } catch (err) {
      console.warn('[admin] Schulliste laden fehlgeschlagen:', err.message);
      allSchools = [];
    }
    btn.disabled = false;
    chev.hidden  = false;
    renderSchoolSwitcherMenu();
  } else {
    // Schuladmin sieht nur seine Schule als Label, keine Interaktion.
    allSchools = [];
    btn.disabled = true;
  }
  await updateSchoolSwitcherLabel();
}

async function updateSchoolSwitcherLabel() {
  const label = document.getElementById('schoolSwitcherLabel');
  if (isVolladmin && allSchools.length > 0) {
    const s = allSchools.find(x => x.id === currentSchoolId);
    label.textContent = s ? s.name : '(unbekannte Schule)';
  } else {
    label.textContent = await schoolLabel(currentSchoolId);
  }
}

function renderSchoolSwitcherMenu() {
  const list = document.getElementById('schoolSwitcherList');
  if (allSchools.length === 0) {
    list.innerHTML = '<div style="padding:8px;color:var(--a-muted);font-size:12px;">Keine Schulen</div>';
    return;
  }
  list.innerHTML = allSchools.map(s => `
    <button type="button" class="${s.id === currentSchoolId ? 'active' : ''}"
            data-school-id="${s.id}">
      ${escapeHtml(s.name)}${!s.active ? ' <small>(inaktiv)</small>' : ''}
    </button>
  `).join('');
  list.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.schoolId;
      document.getElementById('schoolSwitcherMenu').hidden = true;
      if (id === currentSchoolId) return;
      switchSchool(id);
    });
  });
}

function wireSchoolSwitcher() {
  const btn  = document.getElementById('schoolSwitcherBtn');
  const menu = document.getElementById('schoolSwitcherMenu');
  const addBtn = document.getElementById('schoolAddBtn');

  btn.addEventListener('click', e => {
    if (btn.disabled) return;
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', () => menu.hidden = true);
  menu.addEventListener('click', e => e.stopPropagation());

  addBtn.addEventListener('click', () => {
    menu.hidden = true;
    openSchoolCreate();
  });
}

async function switchSchool(newSchoolId) {
  currentSchoolId = newSchoolId;
  await updateSchoolSwitcherLabel();
  renderSchoolSwitcherMenu();

  // Alles neu laden. Caches wegwerfen, User-Auswahl fallen lassen.
  clusterCache = [];
  userCache = [];
  selectedIds.clear();
  progressLoaded = false;
  startupLoaded  = false;
  dashboardLoaded = false;

  await loadClusters();
  await loadUsers();
  loadDashboard(currentSchoolId);  // fire-and-forget
  showToast(`Kontext: ${document.getElementById('schoolSwitcherLabel').textContent}`);
}

/* ══════════════════════════════════════════════════════════════
   Schule-Anlegen-Modal
   ══════════════════════════════════════════════════════════════ */

function wireSchoolCreateModal() {
  const overlay = document.getElementById('schoolCreateModal');
  const close   = document.getElementById('schoolCreateClose');
  const form    = document.getElementById('schoolCreateForm');

  const doClose = () => { overlay.hidden = true; };
  close.addEventListener('click', doClose);
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });

  // Auto-Slug aus Namen: leerzeichen → hyphen, lowercase, restliche removed.
  const nameInp = document.getElementById('scName');
  const slugInp = document.getElementById('scSlug');
  let slugTouched = false;
  slugInp.addEventListener('input', () => { slugTouched = true; });
  nameInp.addEventListener('input', () => {
    if (slugTouched) return;
    slugInp.value = nameInp.value
      .toLowerCase()
      .replace(/[äöüß]/g, m => ({ä:'ae',ö:'oe',ü:'ue',ß:'ss'})[m])
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fb  = document.getElementById('scFeedback');
    const btn = document.getElementById('scSubmit');
    fb.className = 'form-feedback';
    fb.textContent = '';
    btn.disabled = true;
    try {
      const token = window.__accessToken;
      const res = await fetch('/api/admin_create_school', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInp.value.trim(),
          slug: slugInp.value.trim()
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);

      allSchools.push(body.school);
      allSchools.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      renderSchoolSwitcherMenu();
      overlay.hidden = true;
      form.reset();
      slugTouched = false;
      showToast(`Schule „${body.school.name}" angelegt.`);
    } catch (err) {
      fb.textContent = err.message;
      fb.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
}

function openSchoolCreate() {
  const overlay = document.getElementById('schoolCreateModal');
  document.getElementById('scName').value = '';
  document.getElementById('scSlug').value = '';
  document.getElementById('scFeedback').textContent = '';
  overlay.hidden = false;
  setTimeout(() => document.getElementById('scName').focus(), 30);
}

/* ══════════════════════════════════════════════════════════════
   Rolle-Ändern-Modal
   ══════════════════════════════════════════════════════════════ */

let roleChangeTargetId = null;

function wireRoleChangeModal() {
  const overlay = document.getElementById('roleChangeModal');
  const close   = document.getElementById('roleChangeClose');
  const form    = document.getElementById('roleChangeForm');

  const doClose = () => { overlay.hidden = true; roleChangeTargetId = null; };
  close.addEventListener('click', doClose);
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!roleChangeTargetId) return;
    const fb  = document.getElementById('rcFeedback');
    const btn = document.getElementById('rcSubmit');
    fb.className = 'form-feedback';
    fb.textContent = '';
    btn.disabled = true;
    try {
      const role = document.getElementById('rcRole').value;
      await applyRoleChange(roleChangeTargetId, role);
      overlay.hidden = true;
      roleChangeTargetId = null;
      renderUsers();
      if (adminCache.length > 0 || role !== 'student') {
        // Admins-Tab live halten
        renderAdmins();
      }
      showToast(`Rolle gesetzt: ${role}`);
    } catch (err) {
      fb.textContent = err.message;
      fb.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
}

function openRoleChange(userId) {
  // Ziel kann aus userCache oder adminCache kommen (letzterer für Admin-Tab).
  const u = userCache.find(x => x.id === userId) || adminCache.find(x => x.id === userId);
  if (!u) return;
  roleChangeTargetId = userId;

  const currentRole = u.is_superadmin ? 'volladmin' : (u.is_admin ? 'schuladmin' : 'student');
  document.getElementById('roleChangeTitle').textContent =
    `Rolle für „${u.display_name || u.account_name}" ändern`;

  const roleSel = document.getElementById('rcRole');
  const vollOpt = document.getElementById('rcVolladminOption');
  vollOpt.hidden   = !isVolladmin;
  vollOpt.disabled = !isVolladmin;
  roleSel.value = currentRole;

  document.getElementById('rcFeedback').textContent = '';
  document.getElementById('roleChangeModal').hidden = false;
}

/* ══════════════════════════════════════════════════════════════
   User-Schule-Verschieben-Modal (Volladmin)
   ══════════════════════════════════════════════════════════════ */

let moveSchoolTargetId = null;

function wireMoveSchoolModal() {
  const overlay = document.getElementById('moveSchoolModal');
  const close   = document.getElementById('moveSchoolClose');
  const form    = document.getElementById('moveSchoolForm');

  const doClose = () => { overlay.hidden = true; moveSchoolTargetId = null; };
  close.addEventListener('click', doClose);
  overlay.addEventListener('click', e => { if (e.target === overlay) doClose(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!moveSchoolTargetId) return;
    const fb  = document.getElementById('msFeedback');
    const btn = document.getElementById('msSubmit');
    fb.className = 'form-feedback';
    fb.textContent = '';
    btn.disabled = true;
    try {
      const targetSchoolId = document.getElementById('msTargetSchool').value;
      const token = window.__accessToken;
      const res = await fetch('/api/admin_move_user_school', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: moveSchoolTargetId, target_school_id: targetSchoolId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);

      // Aus User-Ansicht der aktuellen Schule entfernen
      userCache = userCache.filter(x => x.id !== moveSchoolTargetId);
      // Admin-Cache aktualisieren, falls betroffen
      const au = adminCache.find(x => x.id === moveSchoolTargetId);
      if (au) { au.school_id = targetSchoolId; au.cluster_id = null; }
      overlay.hidden = true;
      moveSchoolTargetId = null;
      renderUsers();
      renderAdmins();
      showToast(`Verschoben nach „${body.moved_to?.school_name || 'Ziel-Schule'}".`);
    } catch (err) {
      fb.textContent = err.message;
      fb.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
}

function openMoveSchool(userId) {
  if (!isVolladmin) return;
  const u = userCache.find(x => x.id === userId) || adminCache.find(x => x.id === userId);
  if (!u) return;
  moveSchoolTargetId = userId;
  document.getElementById('moveSchoolTitle').textContent =
    `„${u.display_name || u.account_name}" in andere Schule verschieben`;

  const sel = document.getElementById('msTargetSchool');
  sel.innerHTML = allSchools
    .filter(s => s.id !== u.school_id)
    .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join('');
  if (sel.options.length === 0) {
    sel.innerHTML = '<option value="">— keine andere Schule verfügbar —</option>';
    sel.disabled = true;
  } else {
    sel.disabled = false;
  }

  document.getElementById('msFeedback').textContent = '';
  document.getElementById('moveSchoolModal').hidden = false;
}

/* ══════════════════════════════════════════════════════════════
   Admins-Tab (Volladmin-only Übersicht aller Admins)
   ══════════════════════════════════════════════════════════════ */

function wireAdminsTab() {
  const search = document.getElementById('adminSearch');
  const reload = document.getElementById('adminReload');
  if (!search || !reload) return;  // Tab-Elemente sind für Schuladmin nicht relevant
  search.addEventListener('input', renderAdmins);
  reload.addEventListener('click', loadAdmins);
}

async function loadAdmins() {
  if (!isVolladmin) return;
  const tbody = document.getElementById('adminTbody');
  try {
    const rows = await api('GET',
      `profiles?select=id,account_name,display_name,school_id,cluster_id,is_admin,is_superadmin`
      + `&or=(is_admin.eq.true,is_superadmin.eq.true)`
      + `&order=is_superadmin.desc,account_name.asc`);
    adminCache = rows;
    renderAdmins();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderAdmins() {
  const tbody = document.getElementById('adminTbody');
  if (!tbody) return;
  const q = (document.getElementById('adminSearch')?.value || '').trim().toLowerCase();

  const schoolById = {};
  for (const s of allSchools) schoolById[s.id] = s.name;
  const clusterById = {};
  for (const c of clusterCache) clusterById[c.id] = `${c.name} · S${c.season}`;

  let rows = adminCache.slice();
  if (q) rows = rows.filter(r =>
    (r.account_name || '').toLowerCase().includes(q) ||
    (r.display_name || '').toLowerCase().includes(q) ||
    (schoolById[r.school_id] || '').toLowerCase().includes(q));

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Keine Admins gefunden.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(u => {
    const isSelf = u.id === currentUserId;
    const resetDisabled = !canResetTarget(u);
    return `<tr>
      <td>${escapeHtml(u.account_name)}</td>
      <td>${escapeHtml(u.display_name || '—')}</td>
      <td>${roleBadge(u)}</td>
      <td>${escapeHtml(schoolById[u.school_id] || '—')}</td>
      <td>${escapeHtml(clusterById[u.cluster_id] || '—')}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="row-actions__btn js-row-actions-btn">Aktionen</button>
          <div class="row-actions__menu" hidden>
            <button type="button" class="js-role-change" data-user-id="${u.id}" ${isSelf ? 'disabled' : ''}>Rolle ändern</button>
            <button type="button" class="js-move-school" data-user-id="${u.id}">In andere Schule verschieben</button>
            <button type="button" class="js-reset-progress" data-user-id="${u.id}" ${resetDisabled ? 'disabled' : ''}>Fortschritt zurücksetzen</button>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.js-row-actions-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleRowActionsMenu(btn);
    });
  });
  tbody.querySelectorAll('.js-role-change').forEach(b => {
    b.addEventListener('click', () => openRoleChange(b.dataset.userId));
  });
  tbody.querySelectorAll('.js-move-school').forEach(b => {
    b.addEventListener('click', () => openMoveSchool(b.dataset.userId));
  });
  tbody.querySelectorAll('.js-reset-progress').forEach(b => {
    b.addEventListener('click', () => resetUserProgress(b.dataset.userId));
  });
}

// Öffnet/schließt das Aktionen-Menü einer Row. Menu ist per CSS
// position:fixed — Position muss beim Öffnen dynamisch aus der
// Button-Rect kommen, sonst clippt es in der table-wrap-Overflow.
function toggleRowActionsMenu(btn) {
  const menu = btn.nextElementSibling;
  const wasOpen = !menu.hidden;
  document.querySelectorAll('.row-actions__menu').forEach(m => { m.hidden = true; });
  if (wasOpen) return;

  const rect = btn.getBoundingClientRect();
  menu.hidden = false;
  const menuW = Math.max(menu.offsetWidth, 200);
  const menuH = menu.offsetHeight;
  // Rechts-alignen — Menü-rechter-Rand am Button-rechten-Rand.
  let left = rect.right - menuW;
  if (left < 8) left = 8;
  let top = rect.bottom + 4;
  // Wenn unten kein Platz mehr ist → nach oben klappen.
  if (top + menuH > window.innerHeight - 8) {
    top = Math.max(8, rect.top - menuH - 4);
  }
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';
}

/* ══════════════════════════════════════════════════════════════
   Lehrkräfte-Tab (MPSkills, Migration 0077)
   ══════════════════════════════════════════════════════════════
   Freischaltung der Lehrkraft-Rolle. Sichtbar für Schuladmin UND
   Volladmin — der Schuladmin sieht durch profiles_select_own (0053)
   nur die eigene Schule, ohne dass hier gefiltert werden müsste.

   Geschrieben wird per PATCH auf profiles, wie bei der
   Cluster-Zuweisung und display_name_locked: die Policy
   profiles_admin_update deckt das ab. Die drei Zeitstempel setzt
   der Trigger profiles_teacher_stamp_trg — teacher_decided_by darf
   nicht aus dem Browser kommen.
   ══════════════════════════════════════════════════════════════ */

const TEACHER_STATUS_LABEL = {
  pending:  'Ausstehend',
  approved: 'Freigeschaltet',
  rejected: 'Abgelehnt'
};

function wireTeachersTab() {
  document.getElementById('teacherSearch')?.addEventListener('input', renderTeachers);
  document.getElementById('teacherStatusFilter')?.addEventListener('change', renderTeachers);
  document.getElementById('teacherReload')?.addEventListener('click', loadTeachers);
}

async function loadTeachers() {
  const tbody = document.getElementById('teacherTbody');
  if (!tbody) return;
  try {
    // teacher_status=neq.none: die Tabelle zeigt nur, wer mit der Rolle
    // überhaupt zu tun hat. Alle anderen stehen im User-Tab.
    // Sortierung: älteste Anträge zuerst — wer am längsten wartet, oben.
    teacherCache = await api('GET',
      'profiles?select=id,account_name,display_name,school_id,cluster_id,status,is_admin,is_superadmin,'
      + 'teacher_status,teacher_requested_at,teacher_decided_at'
      + '&teacher_status=neq.none'
      + '&order=teacher_requested_at.asc.nullslast,account_name.asc');
    renderTeachers();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function teacherStatusBadge(st) {
  const cls = st === 'approved' ? 'active' : st === 'pending' ? 'pending' : 'closed';
  return `<span class="badge ${cls}">${TEACHER_STATUS_LABEL[st] || escapeHtml(st)}</span>`;
}

// „vor 3 Tagen" statt Datum: bei einem offenen Antrag ist die Wartezeit
// die Information, nicht der Kalendertag.
function teacherWaited(iso) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0)  return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}

function renderTeachers() {
  const tbody = document.getElementById('teacherTbody');
  const thead = document.getElementById('teacherThead');
  if (!tbody || !thead) return;

  const q      = (document.getElementById('teacherSearch')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('teacherStatusFilter')?.value || 'pending';

  // Schul-Spalte nur für den Volladmin: für einen Schuladmin stünde in
  // jeder Zeile derselbe Wert. allSchools ist für ihn ohnehin leer
  // (siehe initSchoolSwitcher).
  const showSchool = isVolladmin;
  const schoolById = {};
  for (const s of allSchools) schoolById[s.id] = s.name;

  thead.innerHTML = '<tr>'
    + '<th>Account</th>'
    + '<th>Anzeigename</th>'
    + (showSchool ? '<th>Schule</th>' : '')
    + '<th>Beantragt</th>'
    + '<th>MPSkills</th>'
    + '<th>Schulung</th>'
    + '<th>Aktion</th>'
    + '</tr>';
  const cols = showSchool ? 7 : 6;

  let rows = teacherCache.slice();
  if (filter !== 'all') rows = rows.filter(r => r.teacher_status === filter);
  if (q) rows = rows.filter(r =>
    (r.account_name || '').toLowerCase().includes(q) ||
    (r.display_name || '').toLowerCase().includes(q) ||
    (schoolById[r.school_id] || '').toLowerCase().includes(q));

  if (rows.length === 0) {
    const msg = filter === 'pending'
      ? 'Keine offenen Anträge.'
      : 'Keine Einträge für diesen Filter.';
    tbody.innerHTML = `<tr><td colspan="${cols}" class="empty">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(u => {
    const st = u.teacher_status;
    // Was auf der Schulungsseite gilt — bewusst mit angezeigt, damit
    // sichtbar bleibt, dass die beiden Rollen nichts miteinander zu tun
    // haben: eine freigeschaltete Lehrkraft ist dort weiter pending.
    const schulung = `<span class="badge ${u.status}">${u.status}</span>`
                   + (u.is_admin || u.is_superadmin ? ' ' + roleBadge(u) : '');

    let actions = '';
    if (st === 'pending' || st === 'rejected') {
      actions += `<button class="btn small js-teacher-approve" data-user-id="${u.id}">Freischalten</button>`;
    }
    if (st === 'pending') {
      actions += `<button class="btn small js-teacher-reject" data-user-id="${u.id}">Ablehnen</button>`;
    }
    if (st === 'approved') {
      actions += `<button class="btn small danger js-teacher-revoke" data-user-id="${u.id}">Rolle entziehen</button>`;
    }
    if (st === 'rejected') {
      actions += `<button class="btn small js-teacher-clear" data-user-id="${u.id}">Antrag entfernen</button>`;
    }

    return `<tr>
      <td>${escapeHtml(u.account_name)}</td>
      <td>${escapeHtml(u.display_name || '—')}</td>
      ${showSchool ? `<td>${escapeHtml(schoolById[u.school_id] || '—')}</td>` : ''}
      <td>${teacherWaited(u.teacher_requested_at)}</td>
      <td>${teacherStatusBadge(st)}</td>
      <td>${schulung}</td>
      <td><div class="actions">${actions}</div></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.js-teacher-approve').forEach(b =>
    b.addEventListener('click', () => setTeacherStatus(b.dataset.userId, 'approved')));
  tbody.querySelectorAll('.js-teacher-reject').forEach(b =>
    b.addEventListener('click', () => setTeacherStatus(b.dataset.userId, 'rejected')));
  tbody.querySelectorAll('.js-teacher-revoke').forEach(b =>
    b.addEventListener('click', () => setTeacherStatus(b.dataset.userId, 'rejected')));
  tbody.querySelectorAll('.js-teacher-clear').forEach(b =>
    b.addEventListener('click', () => setTeacherStatus(b.dataset.userId, 'none')));
}

async function setTeacherStatus(userId, status) {
  const u = teacherCache.find(r => r.id === userId);
  const label = u ? (u.display_name || u.account_name) : 'Diese Lehrkraft';

  // Entziehen ist der einzige Schritt, der jemandem etwas wegnimmt, das
  // er schon benutzt — die Räume bleiben, aber neue lassen sich nicht
  // mehr aufmachen. Deshalb hier eine Rückfrage und sonst keine.
  if (status === 'rejected' && u?.teacher_status === 'approved') {
    const ok = confirm(`${label} die Lehrkraft-Rolle entziehen?\n\n`
      + 'Bestehende Räume bleiben bis zu ihrem Ablauf nutzbar, neue lassen sich nicht mehr anlegen.');
    if (!ok) return;
  }

  try {
    await api('PATCH', `profiles?id=eq.${userId}`, { teacher_status: status });
    // Lokal nachziehen statt neu laden: bei Filter „Ausstehend" verschwindet
    // die Zeile dadurch sofort aus der Liste, und genau das ist die
    // Rückmeldung, dass es geklappt hat.
    if (u) {
      u.teacher_status = status;
      if (status === 'none') teacherCache = teacherCache.filter(r => r.id !== userId);
    }
    renderTeachers();
    const msg = {
      approved: `${label} ist für MPSkills freigeschaltet.`,
      rejected: `${label}: Antrag abgelehnt.`,
      none:     `${label}: Antrag entfernt.`
    }[status] || 'Status gesetzt.';
    showToast(msg);
  } catch (err) {
    showToast('Änderung fehlgeschlagen: ' + err.message, 'error');
  }
}
