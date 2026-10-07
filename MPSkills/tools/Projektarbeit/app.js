'use strict';
/* ════════════════════════════════════════════════════════════
   PROJEKTARBEIT — app.js   ·   die Oberfläche
   ════════════════════════════════════════════════════════════
   Drei Ansichten, je nachdem, wer schaut:

     Lehrkraft, Übersicht   Lobby + Gruppen. Personen per Drag & Drop
                            (oder Antippen → Ziel antippen) zu Gruppen
                            ziehen, Planungsräume eröffnen, rote Zahl
                            = offene Anträge. Rechts die Klassenliste
                            (ein- und ausblendbar): Einwilligungen und
                            wer heute woanders lernt.
     Lehrkraft, im Raum     der Planungsraum einer Gruppe. Zurück über
                            den Reiter „Gruppen-Übersicht" der Raumseite
                            (PA.hostTabs) — im Schaufenster über
                            „← Übersicht".
     Schüler                ohne Planungsraum: Wartekarte (Lobby bzw.
                            die eigene Gruppe). Mit: der Planungsraum.

   Der Planungsraum hat sechs Reiter: Projektziel, Arbeit (Board mit
   vier Spalten), Stunden (Protokoll), Anträge, Team und
   „Projektarbeit & Regeln".

   Anträge (0201) heißen immer: „wir wollen an diesem Tag außerhalb des
   Schulgeländes lernen" — mit Datum, wer dabei ist, Ort und was dort
   passiert. Offen und abgelehnt darf die Gruppe ändern (abgelehnt =
   überarbeiten und neu abschicken), genehmigt ist fest. Am Reiter
   steht, wie es um den nächsten Antrag (heute oder später) steht.
   Im Team trägt die Lehrkraft die Einwilligungen ein (Stufe 1/2).

   Alles, was den Server betrifft, steckt in bridge.js (PA). Hier wird
   nur gezeichnet und PA.put / PA.del / PA.act aufgerufen.
   ════════════════════════════════════════════════════════════ */

/* ── Helfer ──────────────────────────────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoOf(new Date());
const parseD = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const deDay = s => { const d = parseD(s); return d ? `${WD[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : '—'; };
const deShort = s => { const d = parseD(s); return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.` : '—'; };
const deAt = t => { if (!t) return ''; const d = new Date(t); return isNaN(d) ? '' :
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. · ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`; };
const fmtH = h => { const n = +h || 0; return (Math.round(n * 10) / 10).toLocaleString('de-DE') + ' Std.'; };
const isPhone = () => window.matchMedia('(max-width:640px)').matches;

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
const AVC = ['#1d5955', '#ca5a1c', '#2b6694', '#7a3f6d', '#2d7a4d', '#8a5a1a', '#53407e', '#a0442f'];
function avatar(p, size) {
  const cls = `av s${size}`;
  if (!p) return `<span class="${cls}" style="background:var(--line);color:var(--ink-3)">?</span>`;
  const t = String(p.name || '?').trim();
  const ini = (t.slice(0, 1).toUpperCase() + t.slice(1, 2).toLowerCase()).trim() || '?';
  return `<span class="${cls}" style="background:${AVC[hash(String(p.id) + t) % AVC.length]}" title="${esc(t)}">${esc(ini)}</span>`;
}

function toast(msg) {
  const t = $('#toast'); $('#toastT').textContent = msg;
  t.classList.add('show'); clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}
window.toast = toast;

let confirmCb = null, promptCb = null;
function ask(title, text, cb, okLabel) {
  $('#cfTitle').textContent = title; $('#cfText').textContent = text;
  $('#cfOk').textContent = okLabel || 'Ja, machen';
  confirmCb = cb; show('mConfirm');
}
function promptText(title, value, cb) {
  $('#prTitle').textContent = title; $('#prIn').value = value || '';
  promptCb = cb; show('mPrompt');
  setTimeout(() => $('#prIn').select(), 40);
}
function show(id) { $('#' + id).hidden = false; }
function hide(id) { $('#' + id).hidden = true; }

/* Das Projektziel ist HTML aus dem Editor — und es stammt von
   Mitschülern. Vor dem Anzeigen bleibt nur, was der Editor selbst
   erzeugt: ein paar Auszeichnungen, keine Attribute. */
const SAFE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'P', 'UL', 'OL', 'LI', 'BR', 'DIV', 'SPAN']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'MATH', 'LINK', 'META', 'FORM', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'VIDEO', 'AUDIO']);
function cleanHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
  (function walk(n) {
    Array.from(n.childNodes).forEach(c => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) { c.remove(); return; }
      const tag = c.tagName.toUpperCase();
      if (DROP_TAGS.has(tag)) { c.remove(); return; }
      walk(c);
      if (!SAFE_TAGS.has(tag)) { c.replaceWith(...Array.from(c.childNodes)); return; }
      Array.from(c.attributes).forEach(a => c.removeAttribute(a.name));
    });
  })(doc.body);
  return doc.body.innerHTML;
}
const safeImg = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);

/* ── Zustand der Oberfläche ──────────────────────────────── */
let tab = 'goal';
let picked = null;          // Übersicht: angetippte Person (Tablet ohne Ziehen)
let editTask = null;        // Aufgabe im Dialog (id oder null = neu)
let tkWho = [], tkColor = 'yellow';
let editReq = null;
let rqWho = [];
let showList = (() => { try { return localStorage.getItem('pa_clist') !== '0'; } catch (e) { return true; } })();
let editLog = null;
let reqFilter = 'all';
let phoneCol = 'doing';
let goalTimer = null, goalDirty = false;
let lastMode = null, lastGroup = null;

const COLS = [
  { k: 'todo',    nm: 'Zu erledigen', c: 'var(--st-todo)',  hint: 'Was ansteht. Kleine Schritte — eine Karte, eine Stunde.' },
  { k: 'blocked', nm: 'Blockiert',    c: 'var(--st-block)', hint: 'Hängt fest. Schreibt dazu, was fehlt.' },
  { k: 'doing',   nm: 'In Arbeit',    c: 'var(--st-doing)', hint: 'Daran arbeitet gerade jemand.' },
  { k: 'done',    nm: 'Fertig',       c: 'var(--st-done)',  hint: 'Geschafft!' }
];
const COLORS = { yellow: '#fdf3a8', blue: '#cbe7f7', green: '#cdebd2', pink: '#f8d4e0', lilac: '#dfd8f3' };
// Einwilligung der Eltern, das Schulgelände zu verlassen (0201).
const CONSENT = [
  { n: 0, mark: '✗',  short: 'keine',   nm: 'Keine Einwilligung' },
  { n: 1, mark: '✓',  short: 'Stufe 1', nm: 'Stufe 1 · in Kleingruppen, z. B. zu jemandem nach Hause' },
  { n: 2, mark: '✓✓', short: 'Stufe 2', nm: 'Stufe 2 · auch an fremde Orte' }
];
const consentOf = p => { const n = +((p && p.consent) || 0); return CONSENT[n] || CONSENT[0]; };
const cmark = (p, cyc) => {
  const c = consentOf(p);
  return cyc
    ? `<button class="cmark c${c.n}" data-cyc="${esc(p.id)}" title="${esc(c.nm)} — antippen zum Ändern" aria-label="Einwilligung von ${esc(p.name)}: ${esc(c.nm)}">${c.mark}</button>`
    : `<span class="cmark c${c.n}" title="${esc(c.nm)}">${c.mark}</span>`;
};
const REQ_ST = {
  open:     { nm: 'offen',      cls: 'bg-open', ic: '•' },
  approved: { nm: 'genehmigt',  cls: 'bg-ok',   ic: '✓' },
  rejected: { nm: 'abgelehnt',  cls: 'bg-no',   ic: '✗' }
};
const reqSt = r => REQ_ST[(r && r.status) || 'open'] || REQ_ST.open;
const PIN = '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>';
// Der nächste Antrag: heute oder später, der früheste zuerst.
function nextReq() {
  const t = todayIso();
  return PA.list('request').filter(r => r.date && r.date >= t)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.at || '').localeCompare(String(b.at || '')))[0] || null;
}
const ICO = {
  compass: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/></svg>',
  pen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  block: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>'
};

/* ── Wer schaut, und worauf? ─────────────────────────────── */
const V = () => PA.view() || {};
function mode() {
  if (!PA.ready) return 'loading';
  if (PA.owner) return PA.focus ? 'plan' : 'overview';
  const g = V().group;
  return g && g.plan_open ? 'plan' : 'wait';
}
const group   = () => V().group || (PA.owner && PA.focus && findG(PA.focus)) || null;
const members = () => (group() && group().members) || [];
const meId    = () => (PA.me && PA.me.id) || null;
const person  = id => members().find(m => m.id === id) || (V().people || []).find(p => p.id === id) || null;
const gTitle  = (g, mem) => (g && g.name) || (mem && mem[0] && mem[0].name) || 'Einzelarbeit';
const goalObj = () => Object.assign({ title: '', text: '', images: [], locked: false }, PA.get('goal', 'main') || {});
const canWrite = () => !PA.ro;
const canEditGoal = () => canWrite() && (PA.owner || !goalObj().locked);

/* ════════════════════════════════════════════════════════════
   ZEICHNEN
   ════════════════════════════════════════════════════════════ */
let needRender = false;
PA.render = function () {
  if (DRAG && DRAG.started) { needRender = true; return; }
  renderAll();
};

function renderAll() {
  const m = mode();
  const v = V();
  // Gruppe weg (Lehrkraft hat sie aufgelöst): zurück zur Übersicht.
  if (PA.owner && PA.focus && PA.viewFor === PA.focus && !v.group) { PA.setFocus(null); renderAll(); return; }
  const gid = group() ? group().id : null;
  if (m !== lastMode || (m === 'plan' && gid && gid !== lastGroup)) {
    if (m === 'plan' && lastMode !== 'plan') tab = PA.owner && (findG(PA.focus) || {}).open_requests ? 'requests' : 'goal';
    lastMode = m; lastGroup = gid; editLog = null;
  }
  document.body.classList.toggle('inplan', m === 'plan');

  $('#roBar').hidden = !PA.ro;
  $('#tabbar').hidden = m !== 'plan';
  $('#btnBack').hidden = !(PA.owner && m === 'plan') || PA.hostTabs;
  // Nur umschalten, was sich ändert: eine Ansicht kurz zu verstecken
  // nähme dem Feld, in dem gerade jemand schreibt, den Fokus.
  const want = m === 'plan' ? tab : m;
  $$('main .view').forEach(s => { const on = s.id === 'view-' + want; if (s.hidden === on) s.hidden = !on; });

  renderHeader(m);
  renderMenu(m);
  if (m === 'overview') renderOverview();
  else if (m === 'wait') renderWait();
  else if (m === 'plan') {
    renderCounts();
    renderGoal(); renderWork(); renderHours(); renderRequests(); renderTeam();
    $('#rulesBox').innerHTML = rulesHtml();
    go(tab);
  }
  firstKey();
}

const findG = id => (V().groups || []).find(g => g.id === id) || null;

function renderHeader(m) {
  const v = V();
  const pill = $('#headPill');
  if (m === 'overview') {
    $('#brandEyebrow').textContent = 'Projektarbeit · Übersicht';
    $('#brandName').textContent = (v.room && v.room.title) || 'Projektarbeit';
    const open = (v.groups || []).reduce((a, g) => a + (g.open_requests || 0), 0);
    pill.hidden = false;
    pill.innerHTML = `<div><div class="lbl">Im Raum</div><div class="val">${(v.people || []).length} Personen</div></div>
      <div class="pill-div"></div>
      <div><div class="lbl">Offene Anträge</div><div class="val${open ? ' alarm' : ''}">${open}</div></div>`;
  } else if (m === 'plan') {
    const g = group(), gm = members();
    $('#brandEyebrow').textContent = 'Planungsraum · ' + gTitle(g, gm);
    $('#brandName').textContent = goalObj().title || gTitle(g, gm);
    const tasks = PA.list('task');
    pill.hidden = !tasks.length;
    pill.innerHTML = `<div><div class="lbl">Fertig</div><div class="val">${tasks.filter(t => t.col === 'done').length} / ${tasks.length}</div></div>
      <div class="pill-div"></div>
      <div><div class="lbl">Team</div><div class="val" style="display:flex;gap:3px">${gm.map(p => avatar(p, 20)).join('')}</div></div>`;
  } else {
    $('#brandEyebrow').textContent = 'Projektarbeit';
    $('#brandName').textContent = (v.room && v.room.title) || 'Projektarbeit';
    pill.hidden = true;
  }
}

function renderMenu(m) {
  const me = PA.me || {};
  $('#meName').textContent = PA.owner ? PA.ownerName() : (me.name || '');
  $('#meRole').textContent = PA.owner ? 'Raum-Besitzer'
    : me.blocked ? 'stillgelegt'
    : group() ? gTitle(group(), members()) : 'in der Lobby';
  $('#miKeyTxt').textContent = PA.owner ? 'Codes zeigen' : 'Code zeigen';
  $('#miKey').hidden = !(PA.owner || me.key);
  $('#miRules').hidden = !PA.owner;
}

function renderCounts() {
  const tasks = PA.list('task'), logs = PA.list('log'), reqs = PA.list('request');
  const open = reqs.filter(r => (r.status || 'open') === 'open').length;
  $('#cntWork').textContent = tasks.filter(t => t.col !== 'done').length;
  $('#cntHours').textContent = logs.length;
  const c = $('#cntReq');
  c.textContent = open;
  c.classList.toggle('red', open > 0);
  // Schüler: Zahl nur, solange es überhaupt Anträge gibt — wichtiger ist
  // der Stand des nächsten.
  c.hidden = !PA.owner && !reqs.length;
  const nx = nextReq(), pill = $('#reqNext');
  pill.hidden = !nx;
  if (nx) {
    const st = reqSt(nx);
    pill.className = 'nextreq ' + st.cls;
    pill.textContent = `${nx.date === todayIso() ? 'heute' : deShort(nx.date)} · ${st.nm}`;
    pill.title = `Nächster Antrag: ${deDay(nx.date)} — ${st.nm}`;
  }
  $('#cntTeam').textContent = members().length;
}

/* ── Erstes Öffnen: den persönlichen Code zeigen ─────────── */
function firstKey() {
  const me = PA.me;
  if (PA.owner || PA.demo || !me || !me.key || me.blocked) return;
  const k = 'pa_keyseen_' + me.key;
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { /* dann eben jedes Mal */ }
  $('#keyBig').textContent = PA.fmtKey(me.key);
  show('mKey');
}

/* ════════════════════════════════════════════════════════════
   ÜBERSICHT (Lehrkraft)
   ════════════════════════════════════════════════════════════ */
function pchip(p, withPlan) {
  return `<div class="pchip${picked === p.id ? ' picked' : ''}${p.blocked ? ' blk' : ''}" data-drag="p:${esc(p.id)}" data-drop="p:${esc(p.id)}">
    ${avatar(p, 26)}<span class="nm">${esc(p.name)}</span>
    <span class="dot${p.online ? ' on' : ''}" title="${p.online ? 'gerade da' : 'nicht da'}"></span>
    ${withPlan ? `<button class="planbtn" data-plan-p="${esc(p.id)}" title="Planungsraum für ${esc(p.name)} eröffnen (Einzelarbeit)" aria-label="Planungsraum für ${esc(p.name)} eröffnen">${ICO.compass}</button>` : ''}
  </div>`;
}

function renderOverview() {
  const v = V();
  const people = v.people || [];
  const groups = (v.groups || []).slice().sort((a, b) =>
    (a.no === 0) - (b.no === 0) || (a.no - b.no) || gTitle(a, []).localeCompare(gTitle(b, [])));
  const lobby = people.filter(p => !p.group);
  const openReq = groups.reduce((a, g) => a + (g.open_requests || 0), 0);

  $('#lobbyCnt').textContent = lobby.length;
  $('#lobbyList').innerHTML = lobby.length ? lobby.map(p => pchip(p, true)).join('')
    : `<div class="lobby-empty">${people.length ? 'Alle sind in einer Gruppe.' : 'Noch niemand da. Wer mit dem Raum-Code beitritt, erscheint hier.'}</div>`;

  $('#ovStats').innerHTML =
    `<span class="stat">Personen <b>${people.length}</b></span>
     <span class="stat">Gruppen <b>${groups.filter(g => g.no !== 0).length}</b></span>
     <span class="stat">Einzelarbeiten <b>${groups.filter(g => g.no === 0).length}</b></span>
     ${openReq ? `<span class="badge bg-no">${openReq} offene${openReq === 1 ? 'r' : ''} Antrag${openReq === 1 ? '' : 'e'}</span>` : ''}
     <button class="btn sm" data-clist aria-pressed="${showList}">${showList ? 'Klassenliste ausblenden' : 'Klassenliste zeigen'}</button>`;

  $('#groupGrid').innerHTML = groups.map(g => {
    const mem = people.filter(p => p.group === g.id);
    const solo = g.no === 0;
    const t = g.tasks || {};
    const title = gTitle(g, mem);
    const tr = g.today_requests || [];
    const today = tr.some(r => r.status === 'approved') ? '<span class="badge bg-grey">heute am anderen Ort</span>'
      : tr.some(r => r.status === 'open') ? '<span class="badge bg-open">Antrag für heute</span>'
      : tr.length ? '<span class="badge bg-no">Antrag für heute abgelehnt</span>' : '';
    return `<div class="gcard${g.plan_open ? ' plan' : ''}${g.open_requests ? ' hasreq' : ''}${solo ? ' solo' : ''}" data-drop="g:${esc(g.id)}">
      ${g.open_requests ? `<span class="reqbadge" title="${g.open_requests} offene${g.open_requests === 1 ? 'r' : ''} Antrag${g.open_requests === 1 ? '' : 'e'}">${g.open_requests}</span>` : ''}
      <div class="g-head">
        <div style="min-width:0">
          <button class="g-name" data-rename="${esc(g.id)}" title="Umbenennen">${esc(title)}</button>
          <div class="g-sub">${solo ? 'Einzelarbeit' : `${mem.length} ${mem.length === 1 ? 'Person' : 'Personen'}`}${g.title ? ` · <i>„${esc(g.title)}“</i>` : ''}</div>
          ${today ? `<div style="margin-top:5px">${today}</div>` : ''}
        </div>
        <div class="g-acts">
          <button class="btn ghost icon" data-gdel="${esc(g.id)}" title="Gruppe auflösen" aria-label="Gruppe auflösen">${ICO.trash}</button>
        </div>
      </div>
      <div class="g-members">${mem.length ? mem.map(p => pchip(p, false)).join('') : '<div class="g-empty">Gerade niemand drin — Personen hierher ziehen.</div>'}</div>
      <div class="g-foot">
        ${g.plan_open ? `
          <div class="minicols" title="Board: zu erledigen · blockiert · in Arbeit · fertig">
            ${COLS.map(c => `<span><i style="background:${c.c}"></i>${t[c.k] || 0}</span>`).join('')}
          </div>
          <span class="stat" title="Stundeneinträge heute">heute ${g.logs_today || 0}/${mem.length}</span>
          <button class="btn primary sm go" data-open="${esc(g.id)}">Planungsraum ${ICO.arrow}</button>`
        : `<span style="font-size:11.5px;color:var(--ink-3)">Noch kein Planungsraum</span>
          <button class="btn sm go" data-plan-g="${esc(g.id)}">${ICO.compass} Planungsraum eröffnen</button>`}
      </div>
    </div>`;
  }).join('') + `<div class="ghint">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0"/></svg>
      <span><b>Neue Gruppe:</b> eine Person aus der Lobby auf eine andere ziehen.<br>Am Tablet: Person antippen, dann das Ziel antippen.</span>
    </div>`;

  renderClassList(people, groups);

  // Ausgewählte Person verschwunden? Dann Auswahl weg.
  if (picked && !people.some(p => p.id === picked)) setPick(null);
}

/* Wer lernt heute woanders? Aus den Anträgen, die für heute gestellt
   sind (pa_room_get: today_requests). Steht niemand auf dem Antrag
   (alte Anträge), gilt er für die ganze Gruppe. Genehmigt schlägt
   offen schlägt abgelehnt. */
function todayStatus(people, groups) {
  const rank = { approved: 3, open: 2, rejected: 1 };
  const out = {};
  groups.forEach(g => (g.today_requests || []).forEach(r => {
    const ids = r.who && r.who.length ? r.who : people.filter(p => p.group === g.id).map(p => p.id);
    ids.forEach(id => {
      if (!out[id] || rank[r.status] > rank[out[id].status]) out[id] = { status: r.status, place: r.place || '' };
    });
  }));
  return out;
}

const TODAY_LBL = {
  approved: 'Lernen heute am anderen Ort',
  open:     'Antrag (für heute) wurde gestellt',
  rejected: 'Gestellter Antrag (für heute) wurde abgelehnt'
};

function renderClassList(people, groups) {
  $('#view-overview .ov').classList.toggle('withlist', showList);
  $('#classList').hidden = !showList;
  if (!showList) return;
  const st = todayStatus(people, groups);
  const list = people.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  const away = list.filter(p => st[p.id] && st[p.id].status === 'approved').length;
  $('#clistCnt').textContent = people.length;
  $('#clistSum').innerHTML = `Heute, ${esc(deDay(todayIso()))}` + (away ? ` · <b>${away}</b> am anderen Ort` : '');
  $('#clistBody').innerHTML = list.length ? list.map(p => {
    const t = st[p.id];
    const g = findG(p.group);
    const cls = !t ? '' : t.status === 'approved' ? ' away' : ' pend';
    return `<div class="crow${cls}">
      ${cmark(p, true)}
      <div class="cn"><b>${esc(p.name)}</b><small>${g ? esc(gTitle(g, people.filter(x => x.group === g.id))) : 'Lobby'}</small>
        ${t ? `<span class="ctag">${esc(TODAY_LBL[t.status])}${t.status === 'approved' && t.place ? ' · ' + esc(t.place) : ''}</span>` : ''}</div>
    </div>`;
  }).join('') : '<div class="lobby-empty">Noch niemand da.</div>';
}

function setPick(id) {
  picked = id;
  const p = id && person(id);
  $('#pickBar').hidden = !p;
  if (p) $('#pickTxt').textContent = `${p.name} ausgewählt — jetzt Gruppe, Person oder Lobby antippen.`;
  $$('.pchip').forEach(c => c.classList.toggle('picked', c.dataset.drag === 'p:' + id));
}

async function assign(pid, target) {
  setPick(null);
  const p = person(pid); if (!p) return;
  let args = null;
  if (target === 'lobby') { if (!p.group) return; args = { p_participant: pid }; }
  else if (target.startsWith('g:')) { const g = target.slice(2); if (p.group === g) return; args = { p_participant: pid, p_group: g }; }
  else if (target.startsWith('p:')) {
    const w = target.slice(2); if (w === pid) return;
    const wp = person(w); if (wp && wp.group && wp.group === p.group) return;
    args = { p_participant: pid, p_with: w };
  }
  if (args) await PA.act('pa_room_assign', args);
}

async function openPlan(args) {
  const r = await PA.act('pa_room_plan', args);
  if (r && r.group) { tab = 'goal'; PA.setFocus(r.group); renderAll(); }
}

/* ════════════════════════════════════════════════════════════
   WARTEN (Schüler ohne Planungsraum)
   ════════════════════════════════════════════════════════════ */
function renderWait() {
  const g = group(), gm = members();
  const me = PA.me || {};
  $('#waitBox').innerHTML = g ? `
      <div class="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9.5" r="2.6"/><path d="M16 15.2A5.6 5.6 0 0 1 21.5 20"/></svg></div>
      <div class="eyebrow" style="margin-bottom:6px">Du bist eingeteilt</div>
      <h3>${esc(gTitle(g, gm))}</h3>
      <p>Deine Lehrkraft eröffnet gleich euren <b>Planungsraum</b>. Bis dahin: Lest euch die Regeln unten durch und überlegt gemeinsam, was euer Projekt werden soll.</p>
      <div class="mates">${gm.map(p => `<span class="mate">${avatar(p, 26)}${esc(p.name)}${p.me ? ' <span class="metag">du</span>' : ''}</span>`).join('')}</div>`
    : `
      <div class="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-7h6v7"/></svg></div>
      <div class="eyebrow" style="margin-bottom:6px">Lobby</div>
      <h3>Hallo ${esc(me.name || '')}!</h3>
      <p>Du bist im Raum. Deine Lehrkraft teilt jetzt die <b>Gruppen</b> ein — sobald du dran bist, erscheint hier deine Gruppe und danach euer Planungsraum.</p>`;
  $('#waitBox').insertAdjacentHTML('beforeend', me.key
    ? `<p style="margin-top:16px;font-size:12.5px">Dein persönlicher Code: <b class="mkey">${esc(PA.fmtKey(me.key))}</b> — damit kommst du auf jedem Gerät zurück.</p>` : '');
  $('#waitRules').innerHTML = rulesHtml();
}

/* ════════════════════════════════════════════════════════════
   PROJEKTZIEL
   ════════════════════════════════════════════════════════════ */
function renderGoal() {
  const g = goalObj();
  const ok = canEditGoal();
  const ti = $('#goalTitle'), r = $('#goalRte');
  if (document.activeElement !== ti && !goalDirty) ti.value = g.title || '';
  if (document.activeElement !== r && !goalDirty) r.innerHTML = cleanHtml(g.text);
  ti.disabled = !ok;
  r.contentEditable = ok ? 'true' : 'false';
  document.body.classList.toggle('goallock', !ok);
  $('#goalNote').hidden = !g.locked || PA.owner;
  const lb = $('#goalLockBtn');
  lb.hidden = !PA.owner;
  lb.innerHTML = g.locked ? '🔓 Projektziel öffnen' : '🔒 Projektziel fixieren';
  if (!goalDirty) $('#goalSaved').textContent = g.locked ? 'fixiert' : 'gespeichert';

  const imgs = (g.images || []).filter(safeImg);
  $('#goalImgs').innerHTML = imgs.map((src, i) =>
    `<div class="ishell"><img src="${src}" alt="Bild ${i + 1}">
      ${ok ? `<button class="x" data-img="${i}" aria-label="Bild entfernen"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}</div>`).join('')
    + (imgs.length < 5 && ok
      ? `<button class="iadd" id="goalAdd">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 5"/><circle cx="8.5" cy="8.5" r="1.4"/></svg>
          <span>Bild hinzufügen<br>${imgs.length}/5</span></button>`
      : (imgs.length ? '' : '<p class="hint" style="grid-column:1/-1">Noch keine Bilder.</p>'));
}

function goalChanged() {
  if (!canEditGoal()) return;
  goalDirty = true;
  $('#goalSaved').textContent = 'speichert …';
  clearTimeout(goalTimer);
  goalTimer = setTimeout(saveGoal, 1200);
}
function saveGoal() {
  clearTimeout(goalTimer);
  if (!goalDirty) return;
  goalDirty = false;
  const g = goalObj();
  PA.put('goal', 'main', Object.assign({}, g, {
    title: $('#goalTitle').value.trim().slice(0, 80),
    text: cleanHtml($('#goalRte').innerHTML)
  }));
  $('#goalSaved').textContent = 'gespeichert';
  renderHeader(mode());
}

function shrinkImg(file, max, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      const sc = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * sc); h = Math.round(h * sc);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => toast('⚠ Bild konnte nicht gelesen werden');
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

/* ════════════════════════════════════════════════════════════
   ARBEIT (Board)
   ════════════════════════════════════════════════════════════ */
function postit(t) {
  const who = (t.who || []).map(person).filter(Boolean);
  const blk = t.col === 'blocked';
  return `<div class="postit pi-${esc(COLORS[t.color] ? t.color : 'yellow')}" data-drag="t:${esc(t.id)}" tabindex="0" role="button" aria-label="${esc(t.title)}">
    ${blk ? `<span class="pi-flag" title="blockiert">${ICO.block}</span>` : ''}
    <div class="pi-title">${esc(t.title || 'Ohne Titel')}</div>
    ${t.text ? `<div class="pi-text">${esc(t.text)}</div>` : ''}
    ${blk && t.note ? `<div class="pi-note">${esc(t.note)}</div>` : ''}
    <div class="pi-foot">
      <span class="pi-who">${who.length ? who.map(p => avatar(p, 22)).join('') : '<span class="pi-free">noch frei</span>'}</span>
      ${who.length ? `<span style="margin-left:4px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(who.map(p => p.name).join(' + '))}</span>` : ''}
    </div>
  </div>`;
}

function renderWork() {
  const tasks = PA.list('task').sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title)));
  const by = k => tasks.filter(t => (COLS.some(c => c.k === t.col) ? t.col : 'todo') === k);
  const done = by('done').length, blk = by('blocked').length;
  $('#workStats').innerHTML = tasks.length
    ? `<span class="stat">Fertig <b>${done}/${tasks.length}</b></span>${blk ? `<span class="badge bg-block">${blk} blockiert</span>` : ''}
       <button class="btn primary needs-write" data-newtask="todo">${ICO.plus} Aufgabe</button>`
    : `<button class="btn primary needs-write" data-newtask="todo">${ICO.plus} Erste Aufgabe</button>`;

  $('#colPick').innerHTML = COLS.map(c => `<button data-pcol="${c.k}" data-drop="col:${c.k}" aria-pressed="${phoneCol === c.k}">
      <span class="col-dot" style="background:${c.c};width:8px;height:8px;border-radius:99px"></span>${c.nm} <b>${by(c.k).length}</b></button>`).join('');

  $('#board').innerHTML = COLS.map(c => {
    const list = by(c.k);
    return `<div class="col${phoneCol === c.k ? ' on' : ''}" data-k="${c.k}">
      <div class="col-h"><span class="col-dot" style="background:${c.c}"></span><span class="nm">${c.nm}</span><span class="n">${list.length}</span></div>
      <div class="col-hint">${c.hint}</div>
      <div class="drop" data-drop="col:${c.k}">
        ${list.map(postit).join('')}
        ${c.k === 'todo' ? `<button class="addcard needs-write" data-newtask="todo">${ICO.plus} Aufgabe hinzufügen</button>`
          : (list.length ? '' : '<div class="empty">Hierher ziehen</div>')}
      </div>
    </div>`;
  }).join('');
}

function openTask(id, col) {
  const t = id ? PA.get('task', id) : null;
  if (id && !t) return;
  editTask = id || null;
  $('#tkTitle').textContent = t ? 'Aufgabe' : 'Neue Aufgabe';
  $('#tkName').value = t ? t.title || '' : '';
  $('#tkText').value = t ? t.text || '' : '';
  $('#tkCol').value = t ? (t.col || 'todo') : (col || 'todo');
  $('#tkNote').value = t ? t.note || '' : '';
  tkWho = t ? (t.who || []).slice() : (meId() && members().some(m => m.id === meId()) ? [meId()] : []);
  tkColor = t && COLORS[t.color] ? t.color : 'yellow';
  $('#tkDel').hidden = !t;
  renderTaskForm();
  const ro = !canWrite();
  ['#tkName', '#tkText', '#tkCol', '#tkNote'].forEach(s => { $(s).disabled = ro; });
  show('mTask');
  if (!ro && !t) setTimeout(() => $('#tkName').focus(), 60);
}
function renderTaskForm() {
  $('#tkWho').innerHTML = members().map(m => `<button type="button" data-who="${esc(m.id)}" aria-pressed="${tkWho.includes(m.id)}">${avatar(m, 22)}${esc(m.name)}</button>`).join('')
    || '<span class="hint">Noch niemand in der Gruppe.</span>';
  $('#tkColor').innerHTML = Object.keys(COLORS).map(k => `<button type="button" data-color="${k}" aria-checked="${tkColor === k}" title="${k}" style="background:${COLORS[k]}"></button>`).join('');
  $('#tkNoteF').hidden = $('#tkCol').value !== 'blocked';
}
function saveTask() {
  if (!canWrite()) return;
  const title = $('#tkName').value.trim();
  if (!title) { toast('Bitte kurz sagen, was zu tun ist.'); $('#tkName').focus(); return; }
  const old = editTask ? PA.get('task', editTask) : null;
  const col = $('#tkCol').value;
  const data = Object.assign({}, old || {}, {
    title: title.slice(0, 120), text: $('#tkText').value.trim().slice(0, 1500),
    who: tkWho.filter(id => members().some(m => m.id === id)),
    col, color: tkColor, note: col === 'blocked' ? $('#tkNote').value.trim().slice(0, 400) : (old && old.note) || '',
    order: old && old.col === col ? old.order : Date.now()
  });
  PA.put('task', editTask || PA.newId('t'), data);
  hide('mTask');
  renderAll();
}
function moveTask(id, col) {
  const t = PA.get('task', id);
  if (!t || t.col === col || !canWrite()) return;
  PA.put('task', id, Object.assign({}, t, { col, order: Date.now() }));
  renderAll();
  if (col === 'blocked' && !t.note) {
    openTask(id);
    setTimeout(() => $('#tkNote').focus(), 80);
    toast('Schreibt kurz dazu, was blockiert.');
  }
}

/* ════════════════════════════════════════════════════════════
   STUNDEN
   ════════════════════════════════════════════════════════════ */
function renderHours() {
  const logs = PA.list('log').sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at || '').localeCompare(String(a.at || '')));
  const gm = members();
  const today = todayIso();
  const doneToday = new Set(logs.filter(l => l.date === today).map(l => l.by));
  const myIn = gm.some(m => m.id === meId());

  $('#todayBar').innerHTML = `<b style="font-size:13px">Heute, ${esc(deDay(today))}</b>
    <span class="who">${gm.map(m => `<span class="${doneToday.has(m.id) ? '' : 'miss'}">${avatar(m, 26)}</span>`).join('')}</span>
    <span style="font-size:12.5px;color:var(--ink-2)">${gm.filter(m => doneToday.has(m.id)).length} von ${gm.length} eingetragen</span>
    ${myIn && !doneToday.has(meId()) && !PA.owner ? '<span class="badge bg-open" style="margin-left:auto">Dein Eintrag fehlt noch</span>' : ''}`;

  // Formular: nur für Mitglieder der Gruppe
  $('#hForm').hidden = PA.owner || !myIn;
  $('#view-hours .hgrid').classList.toggle('noform', $('#hForm').hidden);
  if (!editLog && document.activeElement && !$('#hForm').contains(document.activeElement)) {
    if (!$('#hDate').value) $('#hDate').value = today;
  }
  $('#hFormEyebrow').textContent = editLog ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
  $('#hSave').lastChild.textContent = editLog ? ' Speichern' : ' Eintragen';
  $('#hCancel').hidden = !editLog;

  const sums = {};
  logs.forEach(l => { sums[l.by] = (sums[l.by] || 0) + (+l.hours || 0); });
  $('#hSums').innerHTML = gm.map(m => `<span class="sumchip">${avatar(m, 26)}<span>${esc(m.name)}</span><b>${esc(fmtH(sums[m.id] || 0))}</b></span>`).join('');

  if (!logs.length) {
    $('#hList').innerHTML = `<div class="nothing" style="padding:34px 20px"><h3>Noch keine Einträge</h3>
      <p>Am Ende der Stunde trägt jede Person ein, was sie gemacht hat.</p></div>`;
    return;
  }
  const days = [];
  logs.forEach(l => { let d = days.find(x => x.date === l.date); if (!d) days.push(d = { date: l.date, list: [] }); d.list.push(l); });
  $('#hList').innerHTML = days.map(d => `
    <div class="dayh"><h4>${esc(deDay(d.date))}</h4><span>${d.list.length} ${d.list.length === 1 ? 'Eintrag' : 'Einträge'} · ${esc(fmtH(d.list.reduce((a, l) => a + (+l.hours || 0), 0)))}</span></div>
    ${d.list.map(l => {
      const p = person(l.by) || { id: l.by || 'x', name: l.byName || '?' };
      const mine = l.by && l.by === meId();
      return `<div class="entry${mine ? ' mine' : ''}">
        ${avatar(p, 30)}
        <div class="body">
          <div class="top"><b>${esc(p.name || l.byName)}</b>${l.hours ? `<span class="h">${esc(fmtH(l.hours))}</span>` : ''}
            ${(mine || PA.owner) && canWrite() ? `<span class="acts">
              ${mine ? `<button class="btn ghost icon" data-logedit="${esc(l.id)}" title="Bearbeiten" aria-label="Bearbeiten">${ICO.pen}</button>` : ''}
              <button class="btn ghost icon" data-logdel="${esc(l.id)}" title="Löschen" aria-label="Löschen">${ICO.trash}</button></span>` : ''}
          </div>
          <p>${esc(l.text)}</p>
          ${l.next ? `<div class="nx"><b>Nächstes</b>${esc(l.next)}</div>` : ''}
        </div>
      </div>`;
    }).join('')}`).join('');
}

function saveLog() {
  if (!canWrite()) return;
  const text = $('#hText').value.trim();
  if (!text) { toast('Was hast du gemacht? Ein Satz reicht.'); $('#hText').focus(); return; }
  const old = editLog ? PA.get('log', editLog) : null;
  PA.put('log', editLog || PA.newId('l'), Object.assign({}, old || {}, {
    date: $('#hDate').value || todayIso(),
    hours: +$('#hHours').value || 1,
    text: text.slice(0, 1500),
    next: $('#hNext').value.trim().slice(0, 600),
    by: meId(), byName: (PA.me && PA.me.name) || ''
  }));
  resetLogForm();
  toast(old ? 'Eintrag gespeichert' : 'Eingetragen — danke!');
  renderAll();
}
function resetLogForm() {
  editLog = null;
  $('#hText').value = ''; $('#hNext').value = '';
  $('#hDate').value = todayIso(); $('#hHours').value = '1';
}
function editLogEntry(id) {
  const l = PA.get('log', id); if (!l) return;
  editLog = id;
  $('#hDate').value = l.date || todayIso();
  $('#hHours').value = String(l.hours || 1);
  $('#hText').value = l.text || '';
  $('#hNext').value = l.next || '';
  renderHours();
  $('#hText').focus();
}

/* ════════════════════════════════════════════════════════════
   ANTRÄGE
   ════════════════════════════════════════════════════════════ */
function renderRequests() {
  const all = PA.list('request');
  const today = todayIso();
  const isOpen = r => (r.status || 'open') === 'open';
  const open = all.filter(isOpen);
  // Anstehende zuerst (der nächste oben), danach die vergangenen, neueste zuerst.
  const up = r => r.date && r.date >= today;
  const list = all.filter(r => reqFilter === 'all' || (reqFilter === 'open' ? isOpen(r) : !isOpen(r)))
    .sort((a, b) => (up(b) - up(a))
      || (up(a) ? String(a.date).localeCompare(String(b.date)) : String(b.date || '').localeCompare(String(a.date || '')))
      || String(b.at || '').localeCompare(String(a.at || '')));
  const myIn = members().some(m => m.id === meId());
  const nx = nextReq();
  $('#btnNewReq').hidden = PA.owner || !myIn;

  $('#reqFilt').innerHTML = all.length ? [['all', 'Alle', all.length], ['open', 'Offen', open.length], ['done', 'Entschieden', all.length - open.length]]
    .map(([k, nm, n]) => `<button data-rf="${k}" aria-pressed="${reqFilter === k}">${nm} · ${n}</button>`).join('') : '';

  if (!list.length) {
    $('#reqList').innerHTML = `<div class="nothing" style="padding:36px 20px">
      <div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PIN}</svg></div>
      <h3>${all.length ? 'Nichts in dieser Auswahl' : 'Noch keine Anträge'}</h3>
      <p>${PA.owner ? 'Wenn die Gruppe außerhalb der Schule lernen möchte, steht der Antrag hier — und in der Übersicht erscheint eine rote Zahl an der Gruppe.'
        : 'Ihr wollt an einem Tag außerhalb des Schulgeländes lernen? Oben rechts „Antrag stellen“.'}</p></div>`;
    return;
  }
  $('#reqList').innerHTML = list.map(r => {
    const st = r.status || 'open';
    const rs = reqSt(r);
    const legacy = !r.date && !r.place;
    const who = (r.who || []).map(id => person(id) || { id, name: '?' });
    const noConsent = who.filter(p => p.name !== '?' && !+(p.consent || 0));
    const past = r.date && r.date < today;
    let foot = '';
    if (st === 'open' && PA.owner) {
      foot = `<div class="req-f">
        <textarea data-answer="${esc(r.id)}" maxlength="1000" placeholder="Antwort an die Gruppe (freiwillig)"></textarea>
        <button class="btn danger" data-decide="rejected" data-id="${esc(r.id)}">Ablehnen</button>
        <button class="btn ok" data-decide="approved" data-id="${esc(r.id)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> Genehmigen</button>
      </div>`;
    } else if (st !== 'open' && PA.owner) {
      foot = `<div class="req-f" style="justify-content:flex-end"><button class="btn ghost sm" data-reopen="${esc(r.id)}">Entscheidung zurücknehmen</button></div>`;
    } else if (myIn && canWrite() && st === 'open') {
      foot = `<div class="req-f" style="justify-content:flex-end">
        <span class="hint" style="margin:0 auto 0 0">Wartet auf die Lehrkraft — ihr könnt ihn noch ändern.</span>
        <button class="btn sm" data-reqedit="${esc(r.id)}">${ICO.pen} Bearbeiten</button>
        <button class="btn sm danger" data-reqdel="${esc(r.id)}">Zurückziehen</button></div>`;
    } else if (myIn && canWrite() && st === 'rejected') {
      foot = `<div class="req-f" style="justify-content:flex-end">
        <span class="hint" style="margin:0 auto 0 0">Abgelehnt — verbessert ihn und schickt ihn noch einmal ab.</span>
        <button class="btn sm danger" data-reqdel="${esc(r.id)}">Löschen</button>
        <button class="btn sm mark" data-reqedit="${esc(r.id)}">${ICO.pen} Überarbeiten &amp; neu abschicken</button></div>`;
    } else if (st === 'approved') {
      foot = `<div class="req-f"><span class="hint" style="margin:0">🔒 Genehmigt — der Antrag kann nicht mehr bearbeitet oder gelöscht werden.</span></div>`;
    }
    const resent = r.sentAt && r.at && Math.abs(new Date(r.sentAt) - new Date(r.at)) > 60000;
    return `<div class="req${st === 'open' ? ' open' : ''}${past ? ' past' : ''}${nx && nx.id === r.id ? ' next' : ''}">
      <div class="req-h">
        <span class="req-ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${PIN}</svg></span>
        <div class="req-t">
          ${r.date ? `<div class="req-day">${nx && nx.id === r.id ? '<span class="metag">nächster</span> ' : ''}${r.date === today ? 'Heute, ' : ''}${esc(deDay(r.date))}</div>` : ''}
          <h4>${esc(legacy ? (r.title || 'Antrag') : (r.place || 'Ohne Ort'))}</h4>
          <div class="m">gestellt am ${esc(deAt(r.at) || '—')} von ${esc(r.byName || '?')}${resent
            ? ` · zuletzt ${st === 'open' && r.prevDecision ? 'neu abgeschickt' : 'geändert'} am ${esc(deAt(r.sentAt))}${r.sentByName ? ' von ' + esc(r.sentByName) : ''}` : ''}</div>
        </div>
        <span class="badge ${rs.cls}">${rs.nm}</span>
      </div>
      ${legacy ? (r.text ? `<div class="req-b">${esc(r.text)}</div>` : '') : `
      <div class="req-b rows">
        <div class="req-row"><span class="k">Wer</span><span class="req-who">${who.length ? who.map(p =>
          `<span class="mate">${avatar(p, 22)}${esc(p.name)} ${cmark(p, false)}</span>`).join('') : '—'}</span></div>
        <div class="req-row"><span class="k">Was</span><span>${esc(r.activity || '—')}</span></div>
        ${noConsent.length && st !== 'approved' ? `<div class="req-warn">⚠ Ohne Einwilligung: ${esc(noConsent.map(p => p.name).join(', '))}</div>` : ''}
      </div>`}
      ${st === 'open' && r.prevDecision ? `<div class="req-d prev"><span class="k">Vorher abgelehnt, weil</span>${esc(r.prevDecision)}</div>` : ''}
      ${st !== 'open' ? `<div class="req-d ${st === 'approved' ? 'ok' : 'no'}"><span class="k">Antwort der Lehrkraft${r.decidedAt ? ' · ' + esc(deAt(r.decidedAt)) : ''}</span>${esc(r.decision || (st === 'approved' ? 'Genehmigt.' : 'Abgelehnt.'))}</div>` : ''}
      ${foot}
    </div>`;
  }).join('');
}

function openReq(id) {
  const r = id ? PA.get('request', id) : null;
  if (r && r.status === 'approved') { toast(PA.msg('decided')); return; }
  editReq = id || null;
  const rejected = r && r.status === 'rejected';
  $('#rqTitle').textContent = !r ? 'Antrag stellen' : rejected ? 'Antrag überarbeiten' : 'Antrag bearbeiten';
  $('#rqDate').min = todayIso();
  $('#rqDate').value = r && r.date && r.date >= todayIso() ? r.date : (r ? '' : todayIso());
  rqWho = r ? (r.who || []).slice() : (meId() ? [meId()] : []);
  $('#rqPlace').value = r ? r.place || '' : '';
  $('#rqAct').value = r ? r.activity || r.text || '' : '';
  $('#rqPrev').hidden = !rejected;
  if (rejected) $('#rqPrev').innerHTML = `<b>Abgelehnt:</b> ${esc(r.decision || 'ohne Begründung')}`;
  $('#rqSave').textContent = !r ? 'Antrag abschicken' : rejected ? 'Neu abschicken' : 'Speichern';
  renderReqWho();
  show('mReq');
  setTimeout(() => $(r ? '#rqPlace' : '#rqDate').focus(), 60);
}
function renderReqWho() {
  const gm = members();
  $('#rqWho').innerHTML = gm.map(m => `<button type="button" data-rqwho="${esc(m.id)}" aria-pressed="${rqWho.includes(m.id)}">${avatar(m, 22)}${esc(m.name)} ${cmark(m, false)}</button>`).join('')
    || '<span class="hint">Noch niemand in der Gruppe.</span>';
  const miss = gm.filter(m => rqWho.includes(m.id) && !+(m.consent || 0));
  $('#rqWhoHint').innerHTML = miss.length
    ? `⚠ Für ${esc(miss.map(m => m.name).join(', '))} liegt noch <b>keine Einwilligung</b> vor.`
    : 'Tippt alle an, die mitkommen. ✓ = Stufe 1 (Kleingruppe, z. B. zu jemandem nach Hause), ✓✓ = Stufe 2 (auch fremde Orte).';
}
function saveReq() {
  if (!canWrite()) return;
  const date = $('#rqDate').value;
  if (!date) { toast('An welchem Tag? Bitte ein Datum eintragen.'); $('#rqDate').focus(); return; }
  if (date < todayIso()) { toast(PA.msg('date_past')); $('#rqDate').focus(); return; }
  const who = rqWho.filter(id => members().some(m => m.id === id));
  if (!who.length) { toast('Wer ist dabei? Bitte mindestens eine Person antippen.'); return; }
  const place = $('#rqPlace').value.trim();
  if (!place) { toast(PA.msg('place_missing')); $('#rqPlace').focus(); return; }
  const activity = $('#rqAct').value.trim();
  if (!activity) { toast('Was wollt ihr dort machen? Ein, zwei Sätze reichen.'); $('#rqAct').focus(); return; }
  const old = editReq ? PA.get('request', editReq) : null;
  const data = Object.assign({}, old || {}, {
    date, who, place: place.slice(0, 120), activity: activity.slice(0, 2000), status: 'open',
    by: old ? old.by : meId(), byName: old ? old.byName : ((PA.me && PA.me.name) || ''),
    sentAt: new Date().toISOString(), sentByName: (PA.me && PA.me.name) || ''
  });
  // Was der Server ohnehin neu setzt — und die alten Felder (vor 0201).
  ['decision', 'decidedAt', 'type', 'title', 'text'].forEach(k => delete data[k]);
  if (old && old.status === 'rejected') data.prevDecision = old.decision || 'Abgelehnt.';
  PA.put('request', editReq || PA.newId('r'), data);
  hide('mReq');
  toast(!old ? 'Antrag ist bei der Lehrkraft' : old.status === 'rejected' ? 'Antrag neu abgeschickt' : 'Antrag geändert');
  reqFilter = 'all';
  renderAll();
}
function decide(id, status) {
  const r = PA.get('request', id); if (!r) return;
  const box = document.querySelector(`[data-answer="${CSS.escape(id)}"]`);
  PA.put('request', id, Object.assign({}, r, { status, decision: box ? box.value.trim().slice(0, 1000) : '' }));
  toast(status === 'approved' ? 'Genehmigt' : 'Abgelehnt');
  renderAll();
}

/* ════════════════════════════════════════════════════════════
   TEAM
   ════════════════════════════════════════════════════════════ */
function renderTeam() {
  const gm = members();
  $('#teamTitle').textContent = gm.length === 1 ? 'Einzelarbeit' : gTitle(group(), gm);
  $('#teamGrid').innerHTML = gm.map(m => {
    const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.label === m.id;
    const c = consentOf(m);
    const consent = PA.owner
      ? `<div class="cseg" role="group" aria-label="Einwilligung von ${esc(m.name)}">${CONSENT.map(k =>
          `<button type="button" class="c${k.n}" data-consent="${esc(m.id)}:${k.n}" aria-pressed="${c.n === k.n}" title="${esc(k.nm)}">${k.mark} ${k.short}</button>`).join('')}</div>`
      : `<div class="cread c${c.n}">${cmark(m, false)}<span>${esc(c.nm)}</span></div>`;
    return `<div class="mcard${m.me ? ' me' : ''}">
      <div class="mtop">${avatar(m, 52)}
        <div style="flex:1;min-width:0">
          <div class="mname">${esc(m.name)}${m.me ? ' <span class="metag">du</span>' : ''}<span class="dot${m.online ? ' on' : ''}" title="${m.online ? 'gerade da' : 'nicht da'}"></span></div>
          <input type="text" class="mlabel" data-label="${esc(m.id)}" value="${esc(focused ? document.activeElement.value : (m.label || ''))}" maxlength="40" placeholder="+ Aufgabe im Team" aria-label="Label" ${canWrite() ? '' : 'disabled'}>
        </div>
      </div>
      <div class="mconsent"><span class="fl">Einwilligung: Schulgelände verlassen</span>${consent}</div>
      ${PA.owner ? `<div class="mfoot"><span style="font-size:11px;color:var(--ink-3)">Code</span>
        <b class="mkey">${esc(PA.fmtKey(m.key))}</b>
        <button class="btn ghost sm" data-rekey="${esc(m.id)}" style="margin-left:auto">neu</button></div>` : ''}
    </div>`;
  }).join('') || `<div class="nothing" style="grid-column:1/-1;padding:28px"><h3>Gerade niemand in dieser Gruppe</h3>
      <p>In der Übersicht Personen auf die Gruppe ziehen.</p></div>`;
}

/* ════════════════════════════════════════════════════════════
   PROJEKTARBEIT & REGELN
   ════════════════════════════════════════════════════════════ */
function rulesHtml() {
  const extra = String((V().room && V().room.rules) || '').trim();
  const ic = p => `<div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg></div>`;
  return `
  <div class="ex-hero">
    <div class="eyebrow" style="color:#ffc78a">Projektarbeit</div>
    <h2>Gemeinsam ein Ziel erreichen — Schritt für Schritt.</h2>
    <p>In der Projektarbeit plant ihr selbst: Ihr legt ein Ziel fest, zerlegt es in Aufgaben, arbeitet sie ab und haltet fest, wer was beigetragen hat. Die Lehrkraft begleitet euch — und entscheidet über eure Anträge.</p>
    <div class="cycle">
      <div class="cyc"><div class="n">1</div><h4>Ziel festlegen</h4><p>Was soll am Ende entstehen, für wen, bis wann? → Reiter <b>Projektziel</b>.</p></div>
      <div class="cyc"><div class="n">2</div><h4>Planen</h4><p>Das Ziel in kleine Aufgaben zerlegen und verteilen. → <b>Arbeit</b>.</p></div>
      <div class="cyc"><div class="n">3</div><h4>Arbeiten &amp; festhalten</h4><p>Karten weiterschieben, jede Stunde eintragen. → <b>Stunden</b>.</p></div>
      <div class="cyc"><div class="n">4</div><h4>Ergebnis zeigen</h4><p>Präsentieren, was ihr geschafft habt — und was ihr gelernt habt.</p></div>
    </div>
  </div>

  ${extra ? `<div class="panel pad teacherrules" style="margin-bottom:17px">
    <div class="eyebrow">Gilt in diesem Kurs</div>
    <h3 style="font-size:19px;margin-top:3px">Regeln eurer Lehrkraft</h3>
    <div class="txt">${esc(extra)}</div></div>` : ''}

  <div class="cards3">
    <div class="excard">${ic('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9.5" r="2.6"/><path d="M16 15.2A5.6 5.6 0 0 1 21.5 20"/>')}
      <h3>Gemeinsam verantwortlich</h3>
      <p>Das Projekt gehört der <b>ganzen Gruppe</b>. Jede Person arbeitet mit, niemand ruht sich aus — und niemand macht alles allein.</p>
      <ul><li>Aufgaben fair verteilen</li><li>Einander helfen, wenn jemand festhängt</li><li>Entscheidungen gemeinsam treffen</li></ul></div>
    <div class="excard alt">${ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}
      <h3>Jede Stunde dokumentieren</h3>
      <p>Am Ende <b>jeder Stunde</b> trägt jede Person im Stundenprotokoll ein, was sie gemacht hat und was als Nächstes kommt. Ehrlich und in eigenen Worten.</p></div>
    <div class="excard">${ic('<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="10" rx="1.5"/>')}
      <h3>Board aktuell halten</h3>
      <p>Was ihr anfangt, kommt nach <b>In Arbeit</b>; was fertig ist, nach <b>Fertig</b>. Hängt etwas fest: nach <b>Blockiert</b> — mit einem Satz, was fehlt.</p></div>
  </div>
  <div class="cards3">
    <div class="excard alt">${ic('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>')}
      <h3>Lernen am anderen Ort</h3>
      <p>Ihr wollt für euer Projekt das <b>Schulgelände verlassen</b> — in die Bibliothek, zu jemandem nach Hause, zu einem Betrieb? Das geht nur mit einem <b>genehmigten Antrag</b>: Tag, wer mitkommt, wohin, was ihr dort macht. Und nur, wenn eure Eltern eingewilligt haben (Stufe 1: in Kleingruppen, z. B. zu jemandem nach Hause · Stufe 2: auch an fremde Orte).</p></div>
    <div class="excard">${ic('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M8 7h8M8 11h6"/>')}
      <h3>Quellen &amp; Urheberrecht</h3>
      <p>Was ihr aus Büchern, dem Internet oder von KI übernehmt, kennzeichnet ihr mit <b>Quelle</b>. Bilder nur, wenn ihr sie benutzen dürft — am besten eigene.</p></div>
    <div class="excard alt">${ic('<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M11 18h2"/>')}
      <h3>Fair &amp; sicher</h3>
      <p>Freundlich bleiben, auch bei Streit. Keine Fotos oder Namen von anderen ohne deren Erlaubnis. Euren <b>persönlichen Code</b> gebt ihr niemandem.</p></div>
  </div>

  <div class="checks">
    <div class="panel pad"><div class="eyebrow">Zu Beginn jeder Stunde</div>
      <h3 style="font-size:17px;margin-top:3px">Kurz abstimmen (5 Minuten)</h3>
      <ol><li>Board anschauen: Wo stehen wir?</li><li>Wer macht heute was? Karten verteilen.</li><li>Hängt etwas? → Blockiert. Müsst ihr raus? → Antrag.</li></ol></div>
    <div class="panel pad"><div class="eyebrow">Am Ende jeder Stunde</div>
      <h3 style="font-size:17px;margin-top:3px">Festhalten (5 Minuten)</h3>
      <ol><li>Karten auf den richtigen Stand schieben.</li><li>Jede Person: Eintrag im Stundenprotokoll.</li><li>Material wegräumen, Tablets laden.</li></ol></div>
  </div>
  ${PA.owner ? `<p style="margin-top:16px"><button class="btn" data-editrules="1">${ICO.pen} Regeln für diesen Kurs ergänzen</button></p>` : ''}`;
}

/* ════════════════════════════════════════════════════════════
   CODES (Lehrkraft)
   ════════════════════════════════════════════════════════════ */
function renderCodes() {
  const v = V();
  const inPlan = mode() === 'plan';
  const list = inPlan ? members() : (v.people || []);
  $('#codesTitle').textContent = inPlan ? 'Codes dieser Gruppe' : 'Persönliche Codes';
  const gname = p => { const g = findG(p.group); return g ? gTitle(g, (v.people || []).filter(x => x.group === g.id)) : 'Lobby'; };
  $('#codesList').innerHTML = list.length ? list.map(p => `
    <div class="rowline"><div class="who">${esc(p.name)}<small>${esc(inPlan ? (p.label || '') : gname(p))}</small></div>
      <b class="mkey">${p.key ? esc(PA.fmtKey(p.key)) : '<span style="color:var(--ink-3);font-weight:500">noch keiner</span>'}</b>
      <div class="acts"><button class="btn ghost sm" data-rekey="${esc(p.id)}">neu</button></div></div>`).join('')
    : '<p style="color:var(--ink-3);font-size:13px">Noch niemand im Raum.</p>';
}

/* ════════════════════════════════════════════════════════════
   ZIEHEN & ABLEGEN
   ════════════════════════════════════════════════════════════
   Ein eigener Zeiger-Mechanismus statt HTML5-Drag&Drop: der läuft
   auf Tablets nicht zuverlässig. Maus: ziehen ab 6 px. Finger:
   kurz halten (300 ms), dann ziehen — ein schneller Wisch scrollt
   weiter wie gewohnt. Ein Tipp ohne Ziehen ist ein Tipp:
     Person → auswählen (dann das Ziel antippen)
     Karte  → öffnen
   Ziele tragen data-drop: lobby · g:<id> · p:<id> · col:<spalte>. */
let DRAG = null;

function dropAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const t = el && el.closest('[data-drop]');
  if (!t || !DRAG) return null;
  const d = t.dataset.drop;
  if (DRAG.kind === 'p' && (d === 'lobby' || d.startsWith('g:') || (d.startsWith('p:') && d !== 'p:' + DRAG.id))) return t;
  if (DRAG.kind === 't' && d.startsWith('col:')) return t;
  return null;
}

function startDrag(x, y) {
  const D = DRAG;
  D.started = true;
  const r = D.src.getBoundingClientRect();
  const g = D.src.cloneNode(true);
  g.classList.add('dragghost'); g.classList.remove('picked');
  g.style.width = r.width + 'px';
  D.dx = x - r.left; D.dy = y - r.top;
  g.style.left = (x - D.dx) + 'px'; g.style.top = (y - D.dy) + 'px';
  document.body.appendChild(g);
  D.ghost = g;
  D.src.classList.add('drag');
  document.body.classList.add('dragging');
  if (navigator.vibrate && D.touch) { try { navigator.vibrate(12); } catch (e) { /* egal */ } }
}

function moveDrag(x, y) {
  const D = DRAG;
  D.ghost.style.left = (x - D.dx) + 'px'; D.ghost.style.top = (y - D.dy) + 'px';
  const t = dropAt(x, y);
  if (t !== D.over) {
    if (D.over) D.over.classList.remove('over');
    D.over = t;
    if (t) t.classList.add('over');
  }
  // Am Handy: über einer Spaltenwahl kurz verweilen schaltet die Spalte um.
  if (DRAG.kind === 't' && t && t.dataset.pcol && t.dataset.pcol !== phoneCol) {
    clearTimeout(D.colT);
    D.colT = setTimeout(() => { phoneCol = t.dataset.pcol; $$('#board .col').forEach(c => c.classList.toggle('on', c.dataset.k === phoneCol));
      $$('#colPick [data-pcol]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pcol === phoneCol)); }, 450);
  }
}

function endDrag(cancel) {
  const D = DRAG; DRAG = null;
  if (!D) return;
  clearTimeout(D.timer); clearTimeout(D.colT);
  if (!D.started) return;
  if (D.ghost) D.ghost.remove();
  if (D.over) D.over.classList.remove('over');
  D.src.classList.remove('drag');
  document.body.classList.remove('dragging');
  const target = !cancel && D.over ? D.over.dataset.drop : null;
  if (target) {
    if (D.kind === 'p') assign(D.id, target);
    else if (D.kind === 't') moveTask(D.id, target.slice(4));
  }
  if (needRender) { needRender = false; renderAll(); }
}

function tap(D) {
  if (D.kind === 't') { openTask(D.id); return; }
  if (D.kind === 'p') {
    if (picked && picked !== D.id) { assign(picked, 'p:' + D.id); return; }
    setPick(picked === D.id ? null : D.id);
  }
}

document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const src = e.target.closest('[data-drag]');
  if (!src || PA.ro) return;
  const b = e.target.closest('button, input, textarea, select, a');
  if (b && b !== src && src.contains(b)) return;
  const [kind, ...rest] = src.dataset.drag.split(':');
  if (kind === 'p' && !PA.owner) return;
  DRAG = { src, kind, id: rest.join(':'), x0: e.clientX, y0: e.clientY, pid: e.pointerId,
           touch: e.pointerType !== 'mouse', started: false, over: null };
  if (DRAG.touch) {
    const D = DRAG;
    D.timer = setTimeout(() => { if (DRAG === D && !D.started) startDrag(D.x0, D.y0); }, 300);
  }
});
window.addEventListener('pointermove', e => {
  const D = DRAG;
  if (!D || e.pointerId !== D.pid) return;
  if (!D.started) {
    const dist = Math.hypot(e.clientX - D.x0, e.clientY - D.y0);
    if (D.touch) { if (dist > 10) { clearTimeout(D.timer); DRAG = null; } return; }
    if (dist < 6) return;
    startDrag(e.clientX, e.clientY);
  }
  moveDrag(e.clientX, e.clientY);
});
window.addEventListener('pointerup', e => {
  const D = DRAG;
  if (!D || e.pointerId !== D.pid) return;
  if (D.started) { endDrag(false); return; }
  clearTimeout(D.timer);
  DRAG = null;
  tap(D);
});
window.addEventListener('pointercancel', () => endDrag(true));
// Während des Ziehens mit dem Finger: nicht scrollen, kein Kontextmenü.
document.addEventListener('touchmove', e => { if (DRAG && DRAG.started) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (DRAG) e.preventDefault(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (DRAG) endDrag(true);
    if (picked) setPick(null);
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.postit[data-drag]')) {
    e.preventDefault(); openTask(e.target.dataset.drag.slice(2));
  }
});

/* ════════════════════════════════════════════════════════════
   NAVIGATION + EREIGNISSE
   ════════════════════════════════════════════════════════════ */
function go(v) {
  if (goalDirty && v !== 'goal') saveGoal();
  tab = v;
  $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.view === v));
  ['goal', 'work', 'hours', 'requests', 'team', 'rules'].forEach(k => { const el = $('#view-' + k); if (el.hidden !== (k !== v)) el.hidden = k !== v; });
}

function wire() {
  $$('.tab').forEach(t => t.addEventListener('click', () => { go(t.dataset.view); window.scrollTo({ top: 0 }); }));

  $('#btnBack').addEventListener('click', () => { if (goalDirty) saveGoal(); PA.setFocus(null); renderAll(); });

  // Menü
  $('#btnMenu').addEventListener('click', e => { e.stopPropagation(); $('#menuPop').hidden = !$('#menuPop').hidden; });
  document.addEventListener('click', e => { if (!e.target.closest('.menu')) $('#menuPop').hidden = true; });
  $('#miKey').addEventListener('click', () => {
    $('#menuPop').hidden = true;
    if (PA.owner) { renderCodes(); show('mCodes'); return; }
    $('#keyBig').textContent = PA.fmtKey(PA.me && PA.me.key); show('mKey');
  });
  $('#miRules').addEventListener('click', () => { $('#menuPop').hidden = true; openRules(); });
  $('#miPrint').addEventListener('click', () => { $('#menuPop').hidden = true; window.print(); });

  // Dialoge schließen
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-close]');
    if (c) { hide(c.dataset.close); return; }
    if (e.target.classList && e.target.classList.contains('scrim') && e.target.id !== 'mKey') hide(e.target.id);
  });
  $('#cfOk').addEventListener('click', () => { hide('mConfirm'); const cb = confirmCb; confirmCb = null; if (cb) cb(); });
  $('#prOk').addEventListener('click', () => { hide('mPrompt'); const cb = promptCb; promptCb = null; if (cb) cb($('#prIn').value); });
  $('#prIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#prOk').click(); });

  // Klicks im Inhalt
  document.addEventListener('click', async e => {
    const t = e.target;
    let b;
    // Übersicht
    if ((b = t.closest('[data-plan-p]'))) { e.stopPropagation(); setPick(null); openPlan({ p_participant: b.dataset.planP }); return; }
    if ((b = t.closest('[data-plan-g]'))) { openPlan({ p_group: b.dataset.planG }); return; }
    if ((b = t.closest('[data-open]'))) { tab = (findG(b.dataset.open) || {}).open_requests ? 'requests' : 'goal'; PA.setFocus(b.dataset.open); renderAll(); return; }
    if ((b = t.closest('[data-rename]'))) {
      const g = findG(b.dataset.rename); if (!g) return;
      promptText('Gruppe umbenennen', g.name || gTitle(g, (V().people || []).filter(p => p.group === g.id)),
        val => PA.act('pa_room_group_rename', { p_group: g.id, p_name: val }));
      return;
    }
    if ((b = t.closest('[data-gdel]'))) {
      const g = findG(b.dataset.gdel); if (!g) return;
      ask('Gruppe auflösen?', g.plan_open
        ? 'Alle kommen zurück in die Lobby. Der Planungsraum mit Projektziel, Board, Stunden und Anträgen wird gelöscht — das lässt sich nicht rückgängig machen.'
        : 'Alle kommen zurück in die Lobby.',
        () => PA.act('pa_room_group_delete', { p_group: g.id }), 'Auflösen');
      return;
    }
    if (picked && !t.closest('button') && (b = t.closest('[data-drop]')) && !t.closest('[data-drag]')) {
      const d = b.dataset.drop;
      if (d === 'lobby' || d.startsWith('g:')) { assign(picked, d); return; }
    }
    // Board
    if ((b = t.closest('[data-newtask]'))) { openTask(null, b.dataset.newtask); return; }
    if ((b = t.closest('[data-pcol]'))) {
      phoneCol = b.dataset.pcol; renderWork(); return;
    }
    if ((b = t.closest('[data-who]'))) {
      if (!canWrite()) return;
      const id = b.dataset.who;
      tkWho = tkWho.includes(id) ? tkWho.filter(x => x !== id) : tkWho.concat(id);
      renderTaskForm(); return;
    }
    if ((b = t.closest('[data-color]'))) { if (!canWrite()) return; tkColor = b.dataset.color; renderTaskForm(); return; }
    // Antrag: wer ist dabei
    if ((b = t.closest('[data-rqwho]'))) {
      const id = b.dataset.rqwho;
      rqWho = rqWho.includes(id) ? rqWho.filter(x => x !== id) : rqWho.concat(id);
      renderReqWho(); return;
    }
    // Einwilligung (nur Lehrkraft): im Team gezielt, in der Klassenliste reihum
    if ((b = t.closest('[data-consent]'))) {
      if (!PA.owner) return;
      const [id, n] = b.dataset.consent.split(':');
      setConsent(id, +n); return;
    }
    if ((b = t.closest('[data-cyc]'))) {
      if (!PA.owner) return;
      const p = person(b.dataset.cyc); if (!p) return;
      setConsent(p.id, ((+p.consent || 0) + 1) % 3, true); return;
    }
    if ((b = t.closest('[data-clist]'))) {
      showList = !showList;
      try { localStorage.setItem('pa_clist', showList ? '1' : '0'); } catch (e) { /* egal */ }
      renderOverview(); return;
    }
    // Projektziel
    if ((b = t.closest('#goalAdd'))) { $('#goalImgInput').click(); return; }
    if ((b = t.closest('[data-img]'))) {
      if (!canEditGoal()) return;
      const g = goalObj(); const imgs = (g.images || []).filter(safeImg);
      imgs.splice(+b.dataset.img, 1);
      if (goalDirty) saveGoal();
      PA.put('goal', 'main', Object.assign({}, goalObj(), { images: imgs }));
      renderGoal(); return;
    }
    // Stunden
    if ((b = t.closest('[data-logedit]'))) { editLogEntry(b.dataset.logedit); return; }
    if ((b = t.closest('[data-logdel]'))) {
      const id = b.dataset.logdel;
      ask('Eintrag löschen?', 'Der Eintrag verschwindet aus dem Stundenprotokoll.', () => { PA.del('log', id); if (editLog === id) resetLogForm(); renderAll(); }, 'Löschen');
      return;
    }
    // Anträge
    if ((b = t.closest('[data-rf]'))) { reqFilter = b.dataset.rf; renderRequests(); return; }
    if ((b = t.closest('[data-decide]'))) { decide(b.dataset.id, b.dataset.decide); return; }
    if ((b = t.closest('[data-reqedit]'))) { openReq(b.dataset.reqedit); return; }
    if ((b = t.closest('[data-reqdel]'))) {
      const id = b.dataset.reqdel;
      ask('Antrag zurückziehen?', 'Der Antrag wird gelöscht. Die Lehrkraft sieht ihn dann nicht mehr.', () => { PA.del('request', id); renderAll(); }, 'Zurückziehen');
      return;
    }
    if ((b = t.closest('[data-reopen]'))) {
      const r = PA.get('request', b.dataset.reopen); if (!r) return;
      const d = Object.assign({}, r, { status: 'open' }); delete d.decision; delete d.decidedAt;
      PA.put('request', r.id, d); renderAll(); return;
    }
    // Team / Codes
    if ((b = t.closest('[data-rekey]'))) {
      const id = b.dataset.rekey, p = person(id);
      ask('Neuen Code vergeben?', `Der bisherige Code von ${p ? p.name : 'dieser Person'} gilt dann nicht mehr.`, async () => {
        const r = await PA.act('pa_room_rekey', { p_participant: id });
        if (r && r.key) toast(`Neuer Code: ${PA.fmtKey(r.key)}`);
        setTimeout(() => { if (!$('#mCodes').hidden) renderCodes(); }, 600);
      }, 'Neuer Code');
      return;
    }
    if ((b = t.closest('[data-editrules]'))) { openRules(); return; }
  });

  $('#pickCancel').addEventListener('click', () => setPick(null));

  // Projektziel
  $('#goalTitle').addEventListener('input', goalChanged);
  $('#goalTitle').addEventListener('blur', saveGoal);
  $('#goalRte').addEventListener('input', goalChanged);
  $('#goalRte').addEventListener('blur', saveGoal);
  $('#goalRte').addEventListener('paste', e => {
    // Nur Text einfügen — fremde Formatierung und Bilder bleiben draußen.
    e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, txt);
  });
  $('#rteBar').addEventListener('mousedown', e => e.preventDefault());
  $('#rteBar').addEventListener('click', e => {
    const b = e.target.closest('button[data-cmd]'); if (!b || !canEditGoal()) return;
    $('#goalRte').focus();
    document.execCommand(b.dataset.cmd, false, b.dataset.val ? '<' + b.dataset.val + '>' : null);
    goalChanged();
  });
  $('#goalLockBtn').addEventListener('click', () => {
    if (!PA.owner) return;
    if (goalDirty) saveGoal();
    const g = goalObj();
    PA.put('goal', 'main', Object.assign({}, g, { locked: !g.locked }));
    toast(g.locked ? 'Projektziel ist wieder offen' : 'Projektziel fixiert');
    renderAll();
  });
  $('#goalImgInput').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!canEditGoal()) return;
    files.forEach(f => shrinkImg(f, 1100, url => {
      const g = goalObj(); const imgs = (g.images || []).filter(safeImg);
      if (imgs.length >= 5) { toast('Höchstens 5 Bilder'); return; }
      if (goalDirty) saveGoal();
      PA.put('goal', 'main', Object.assign({}, goalObj(), { images: imgs.concat(url) }));
      renderGoal();
    }));
  });

  // Aufgabe
  $('#tkSave').addEventListener('click', saveTask);
  $('#tkName').addEventListener('keydown', e => { if (e.key === 'Enter') saveTask(); });
  $('#tkCol').addEventListener('change', renderTaskForm);
  $('#tkDel').addEventListener('click', () => {
    const id = editTask; if (!id) return;
    ask('Aufgabe löschen?', 'Die Karte verschwindet vom Board.', () => { hide('mTask'); PA.del('task', id); renderAll(); }, 'Löschen');
  });

  // Stunden
  $('#hSave').addEventListener('click', saveLog);
  $('#hCancel').addEventListener('click', () => { resetLogForm(); renderHours(); });

  // Antrag
  $('#btnNewReq').addEventListener('click', () => openReq(null));
  $('#rqSave').addEventListener('click', saveReq);

  // Team: Label
  document.addEventListener('change', e => {
    const inp = e.target.closest('[data-label]'); if (!inp || !canWrite()) return;
    PA.act(PA.owner ? 'pa_room_member_update' : 'pa_member_update', { p_participant: inp.dataset.label, p_label: inp.value.trim() });
  });

  // Regeln
  $('#rulesSave').addEventListener('click', async () => {
    const r = await PA.act('pa_room_rules', { p_rules: $('#rulesIn').value });
    if (r) { hide('mRules'); toast('Regeln gespeichert'); }
  });

  // Ungespeichertes Projektziel nicht verlieren.
  window.addEventListener('pagehide', () => { if (goalDirty) saveGoal(); });
}

async function setConsent(id, n, say) {
  // Sofort zeigen, der Server bestätigt mit dem nächsten Takt.
  [V().people || [], members()].forEach(list => list.forEach(p => { if (p.id === id) p.consent = n; }));
  renderAll();
  const r = await PA.act('pa_room_consent', { p_participant: id, p_level: n });
  if (r && say) { const p = person(id); toast(`${p ? p.name : 'Einwilligung'}: ${CONSENT[n].nm}`); }
}

function openRules() {
  $('#rulesIn').value = (V().room && V().room.rules) || '';
  show('mRules');
  setTimeout(() => $('#rulesIn').focus(), 60);
}

/* ── Start ───────────────────────────────────────────────── */
wire();
$('#hDate').value = todayIso();
PA.start();
