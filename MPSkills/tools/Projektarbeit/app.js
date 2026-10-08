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

   Der Planungsraum hat die Reiter Team, Projektziel (mit Fertig-Datum
   due), To-dos (Board mit vier Spalten, je Karte eine Zeitschätzung est
   in Schulstunden, frei eingetippt), Dokumentation (Protokoll, intern
   „log"/„hours"), Experten, Anträge (dezent gerahmt) und Lehrkraft-
   Kommentare. Den Reiter „Projektarbeit & Regeln" gibt es nicht mehr —
   die Regeln stehen nur noch auf der Wartekarte.
   Jeder Reiter hat oben EINEN Erklärsatz; der Rest steht in den
   Erklär-Kacheln (guideBox(), Icons, keine Emojis). Jede Person klappt
   sie je Reiter ein und aus (Knopf links; gemerkt im Gerät,
   pa_guide_<reiter>). Eingeklappt stehen sie in der Kopfzeile neben der
   Überschrift (Titel, darunter kleine Kacheln mit Icon und Überschrift),
   ausgeklappt unter Überschrift und Satz (guidePlace()).
   Dokumentation: neuer Eintrag über „+ Eintrag" oben rechts (wie
   „+ To-do"), das Formular steht im Dialog mLog.

   Zeitbalken (To-dos): Die Gruppe trägt ein, wie viele Schulstunden
   sie bis zum Ende hat. Das steht als eigenes Objekt task/„budget"
   ({ budget: true, hours }) neben den Karten — als Teil des Ziels wäre
   es nach dem Fixieren gesperrt. todos() lässt es weg. Der Balken
   füllt sich mit den geschätzten Stunden der To-dos, gefärbt nach
   Spalte (nicht nach Zettelfarbe).
   Experten: ebenfalls task-Objekte, mit expert: true (Name, topic,
   phone, mail und contacts = [{ id, date, how, text, byName }]) —
   so braucht es keine neue Art auf dem Server, und die Übersicht
   zählt sie nicht mit (sie haben keine Spalte). todos() lässt sie
   weg. Ein To-do kann auf einen Experten zeigen (task.xpId/
   xpName): „Frau Petersen kontaktieren".
   Dokumentation: ohne Stundenumfang (es wird nicht erfasst, wer wie
   viel gemacht hat), dafür „an welchem To-do" (log.task/taskTitle).
   Fotos (0206): bis zu drei je Eintrag (log.photos, data-URLs, im
   Gerät verkleinert). Die Lehrkraft löscht sie direkt am Eintrag — und
   soll es, sobald Personen darauf zu sehen sind. Export und Backups
   enthalten keine Fotos.

   Anträge (0201) heißen immer: „wir wollen an diesem Tag außerhalb des
   Schulgeländes lernen" — mit Datum, wer dabei ist, Ziel mit Adresse
   (place) und einem Text (activity) mit WEG und VERKEHRSMITTEL und
   BEGRÜNDUNG (neue Anträge starten mit diesen beiden Überschriften). Offen und abgelehnt darf die Gruppe ändern (abgelehnt =
   überarbeiten und neu abschicken), genehmigt ist fest. Am Reiter
   steht, wie es um den nächsten Antrag (heute oder später) steht.
   Im Team trägt die Lehrkraft die Einwilligungen ein (Stufe 1/2) —
   die Haken (✓/✓✓) sehen Schüler nur dort, nicht bei den Anträgen.

   Stunden (0202): Ein Eintrag sagt, WER dabei war (who) — eine oder
   mehrere Personen der Gruppe; wer einträgt, muss nicht dabei sein.
   Wer fehlt, wird nicht ausgewählt und taucht an dem Tag nicht auf.
   Je Tag stehen die Einträge untereinander: „Mia und Leon: …".

   Lehrkraft-Kommentare (0205): ein eigener Reiter mit Zetteln der
   Lehrkräfte nebeneinander (Name der Lehrkraft dran). Schüler haken ab
   und fragen darunter nach; Lehrkräfte heften an, antworten, löschen.
   Die Zettel kommen mit der Gruppe (group.notes) und gehen nicht über
   PA.put, sondern über einzelne Aufrufe (PA.act).

   Weitere Lehrkräfte (0205): „Lehrkraft einladen" im Menü — gleiche
   Rechte wie der Besitzer; nur löschen kann den Raum der Besitzer.

   Lehrkraft (0202): Exportieren / Importieren / Backups im Menü — in
   der Übersicht für die ganze Klasse, im Planungsraum für dieses eine
   Projekt (wie Scrum Werkstatt, 0198).

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

let confirmCb = null;
function ask(title, text, cb, okLabel) {
  $('#cfTitle').textContent = title; $('#cfText').textContent = text;
  $('#cfOk').textContent = okLabel || 'Ja, machen';
  confirmCb = cb; show('mConfirm');
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
let tab = 'team';
let picked = null;          // Übersicht: angetippte Person (Tablet ohne Ziehen)
let editTask = null;        // Aufgabe im Dialog (id oder null = neu)
let tkWho = [], tkColor = 'yellow', tkXp = '';
let editXp = null;          // Experte im Dialog (id oder null = neu)
let ctXp = null, ctId = null, ctHow = 'call';   // Kontakt im Dialog
let editReq = null;
let rqWho = [];
let showList = (() => { try { return localStorage.getItem('pa_clist') !== '0'; } catch (e) { return true; } })();
let editLog = null;
let hTask = null;           // Dokumentation: gewähltes To-do (id, '' = etwas anderes, null = nichts gewählt)
let tdOpen = false;         // … Auswahlliste offen?
let hWho = null;            // Stundeneintrag: wer war dabei (null = noch nicht gewählt → ich)
let hPhotos = [];           // … Fotos (data-URLs, höchstens 3)
let reqFilter = 'all';
let phoneCol = 'doing';
let goalTimer = null, goalDirty = false;
let lastMode = null, lastGroup = null;
let noteColor = 'yellow';
let noteFilter = 'all';     // Kommentare: 'all' | 'open' | 'done'
const askDraft = {};        // Nachfrage, die gerade jemand tippt (je Zettel)

const COLS = [
  { k: 'todo',    nm: 'Zu erledigen', c: 'var(--k-todo)',  hint: 'Was ansteht. Kleine Schritte, Zeit geschätzt.' },
  { k: 'blocked', nm: 'Blockiert',    c: 'var(--k-block)', hint: 'Hängt fest. Schreibt dazu, was fehlt.' },
  { k: 'doing',   nm: 'In Arbeit',    c: 'var(--k-doing)', hint: 'Daran arbeitet gerade jemand.' },
  { k: 'done',    nm: 'Fertig',       c: 'var(--k-done)',  hint: 'Geschafft!' }
];
const colOf = t => (COLS.some(c => c.k === t.col) ? t.col : 'todo');
// Die Karten — ohne das Zeitbudget, das als task/budget daneben liegt.
const todos = () => PA.list('task').filter(t => !t.budget && t.expert !== true);
// Die Experten — task-Objekte mit expert: true (siehe oben).
const experts = () => PA.list('task').filter(t => t.expert === true)
  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
const expertOf = id => { const x = id ? PA.get('task', id) : null; return x && x.expert === true ? x : null; };
const CONTACT = { call: 'Telefonat', mail: 'E-Mail', meet: 'Treffen', other: 'Sonstiges' };
const budgetHours = () => { const b = PA.get('task', 'budget'); return b && b.budget ? Math.max(0, +b.hours || 0) : 0; };
// Zeitschätzung eines To-dos in Schulstunden (0 = keine Schätzung), frei eingetippt.
const fmtEst = h => (h === 0.5 ? '½' : (Math.round(h * 10) / 10).toLocaleString('de-DE')) + ' Std.';
const readEst = v => Math.max(0, Math.min(99, Math.round((parseFloat(String(v || '').replace(',', '.')) || 0) * 10) / 10));
// Text eines Antrags: diese beiden Teile gehören hinein.
const RQ_WAY = 'WEG und VERKEHRSMITTEL:', RQ_WHY = 'BEGRÜNDUNG:';
const RQ_TEMPLATE = RQ_WAY + '\n\n\n' + RQ_WHY + '\n';
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
  block: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
  clock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  phone: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  mail: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  expert: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="4"/><path d="M3 20.5a7 7 0 0 1 11.2-5.6"/><path d="M17.5 13.5l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z"/></svg>',
  unlock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.2"/></svg>'
};
// Linien-Icons (24er Raster) für die Erklär-Kacheln.
const GI = {
  split: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.6 4.5L21 15"/><path d="M21 20v-5h-5"/>',
  move: '<path d="M4 12h14M13 6l6 6-6 6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  people: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9.5" r="2.6"/><path d="M16 15.2A5.6 5.6 0 0 1 21.5 20"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  sign: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 17c1.5-2 2.5-2 3 0s1.5 2 3 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M8 7h8M8 11h6"/>',
  form: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/><path d="M9.5 9.5l2 2 3.5-3.5"/>',
  plus: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  expert: '<circle cx="10" cy="8" r="4"/><path d="M3 20.5a7 7 0 0 1 11.2-5.6"/><path d="M17.5 13.5l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M5 3L2 6M19 3l3 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7.5 12.5l3 3 6-6.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'
};
const gIco = (k, n) => `<span class="gi">${n ? `<i>${n}</i>` : ''}<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${GI[k]}</svg></span>`;
// Eine Erklärung als Reihe kurzer Kacheln: [Icon, Titel, Satz, 'alarm'?]
// Das Wichtigste im Satz steht fett. 'alarm' = hervorgehoben, ohne Nummer.
const guide = steps => steps.map(([k, t, txt, cls], i) =>
  `<div class="gstep${cls ? ' ' + cls : ''}">${gIco(k, cls ? '' : i + 1)}<div><b>${t}</b><span>${txt}</span></div></div>`).join('');
// Ein- und ausklappbar, je Reiter gemerkt (Standard: ausgeklappt).
const guideOpen = k => { try { return localStorage.getItem('pa_guide_' + k) !== '0'; } catch (e) { return true; } };
// Eingeklappt steht die Box IN der Kopfzeile neben der Überschrift
// (Titel, darunter die kleinen Kacheln); ausgeklappt springt sie unter
// Überschrift und Erklärsatz. Der Knopf zum Klappen steht links.
function guideBox(id, k, title, steps) {
  const el = $('#' + id);
  el.dataset.g = k;
  el.classList.toggle('min', !guideOpen(k));
  el.innerHTML = `<div class="gb-h"><button type="button" class="gb-tg" data-gtoggle="${k}" aria-controls="${id}"></button>
      <span class="gb-t">${title}</span></div>
    <div class="guide">${guide(steps)}</div>`;
  guideBtn(el);
  guidePlace(el);
}
function guidePlace(el) {
  const head = el.closest('.view') && el.closest('.view').querySelector('.shead');
  if (!head) return;
  if (el.classList.contains('min')) {
    const after = head.firstElementChild;          // Eyebrow, Überschrift, Satz
    if (after.nextElementSibling !== el) head.insertBefore(el, after.nextElementSibling);
  } else if (head.nextElementSibling !== el) head.after(el);
}
function guideBtn(el) {
  const open = !el.classList.contains('min');
  const b = el.querySelector('.gb-tg');
  b.setAttribute('aria-expanded', open);
  b.title = open ? 'Erklärung einklappen' : 'Erklärung ausklappen';
  b.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>${open ? 'einklappen' : 'ausklappen'}`;
}
function toggleGuide(k) {
  const el = document.querySelector(`.gbox[data-g="${k}"]`); if (!el) return;
  el.classList.toggle('min');
  try { localStorage.setItem('pa_guide_' + k, el.classList.contains('min') ? '0' : '1'); } catch (e) { /* egal */ }
  guideBtn(el);
  guidePlace(el);
}

// Stundeneintrag: wer war dabei. Einträge von vor 0202 kennen nur den Schreiber.
const logWho = l => Array.isArray(l.who) ? l.who : (l.by ? [l.by] : []);
const logPeople = l => logWho(l).map((id, i) => person(id)
  || { id, name: (Array.isArray(l.whoNames) && l.whoNames[i]) || (id === l.by && l.byName) || '?' });
const andList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1];
const canEditLog = l => canWrite() && !PA.owner && !!meId() && (l.by === meId() || logWho(l).includes(meId()));

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
const goalObj = () => Object.assign({ title: '', text: '', due: '', images: [], locked: false }, PA.get('goal', 'main') || {});
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
    if (m === 'plan' && lastMode !== 'plan') tab = PA.owner && (findG(PA.focus) || {}).open_requests ? 'requests' : 'team';
    lastMode = m; lastGroup = gid; editLog = null; hide('mLog');
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
    renderGoal(); renderWork(); renderHours(); renderRequests(); renderTeam(); renderNotes(); renderExperts();
    renderGuides();
    go(tab);
  }
  firstKey();
}

const findG = id => (V().groups || []).find(g => g.id === id) || null;

// Die Erklärungen über den Reitern ändern sich nie (nur je nach Rolle).
function renderGuides() {
  if ($('#workGuide').firstChild) return;
  const T = PA.owner;
  guideBox('teamGuide', 'team', 'Kurz erklärt', T ? [
    ['pen', 'Teamname', 'Den <b>Teamnamen</b> gibt sich die Gruppe selbst — ihr seht ihn auch in der Übersicht.'],
    ['sign', 'Einwilligung', 'Je Person die <b>Stufe</b> antippen, die vorliegt: Stufe 1 = in Kleingruppen, Stufe 2 = auch fremde Orte.'],
    ['key', 'Codes', 'Vergessen? Hier steht der <b>persönliche Code</b> jeder Person. „neu“ vergibt einen neuen.']
  ] : [
    ['pen', 'Teamname', 'Gebt euch oben einen <b>Teamnamen</b> — so heißt ihr überall, auch bei der Lehrkraft.'],
    ['sign', 'Einwilligung', 'Ob ihr das <b>Schulgelände verlassen</b> dürft, trägt die <b>Lehrkraft</b> ein.'],
    ['key', 'Persönlicher Code', 'Damit kommt ihr auf <b>jedem Gerät</b> zurück (Menü oben rechts). <b>Nicht weitergeben.</b>']
  ]);
  guideBox('goalGuide', 'goal', 'Diese Fragen solltet ihr beantworten', [
    ['target', 'Konkretes Ziel', 'Woran erkennt ihr, dass ihr euer <b>Ziel erreicht</b> habt?'],
    ['box', 'Konkretes Produkt', 'Was haltet ihr <b>am Ende in der Hand</b>? (abgleichen oder verbessern)'],
    ['people', 'Für wen?', 'Wer hat etwas von eurem <b>Ergebnis</b>?'],
    ['cal', 'Bis wann?', 'Tragt unten ein, <b>wann</b> das Projekt <b>fertig</b> sein soll.']
  ]);
  guideBox('workGuide', 'work', 'So plant ihr', [
    ['split', 'Zerlegen', 'Teilt euer Projekt vom Start bis zum Ende in <b>kleine Arbeitsschritte</b> — alle, die ihr erwartet.'],
    ['clock', 'Zeit planen', 'Tragt ein, wie viele <b>Schulstunden</b> ihr bis zum Ende habt, und schätzt bei <b>jedem To-do</b> die Stunden. Der Balken zeigt, ob alles passt.'],
    ['move', 'Weiterschieben', 'Angefangen → <b>In Arbeit</b>. Erledigt → <b>Fertig</b>. Hängt etwas? → <b>Blockiert</b>.'],
    ['refresh', 'Anpassen', 'To-dos dürft ihr <b>jederzeit ändern</b> und in kleinere Aufgaben aufteilen.']
  ]);
  guideBox('hoursGuide', 'hours', 'So dokumentiert ihr', [
    ['cal', 'Jeder Arbeitstag', '<b>Ein Eintrag</b> mit dem <b>Datum</b> des Tages — gern mehrere nebeneinander.'],
    ['people', 'Wer war da?', 'Antippen, <b>wer dabei war</b>. Wer fehlt, bleibt weg und steht beim Tag unter „fehlte“.'],
    ['pen', 'Woran gearbeitet?', '<b>To-do auswählen</b> und kurz schreiben, <b>was ihr geschafft</b> habt.'],
    T ? ['camera', 'Fotos löschen', 'Fotos könnt ihr am Eintrag <b>löschen</b> — und solltet es, sobald <b>Personen</b> oder andere <b>personenbezogene Daten</b> darauf zu sehen sind.']
      : ['camera', 'Fotos', 'Bis zu <b>3 Fotos</b> je Eintrag, z. B. von einer <b>Exkursion</b>. Personen nur <b>mit ihrer Erlaubnis</b>.']
  ]);
  guideBox('expGuide', 'experts', 'So arbeitet ihr mit Experten', [
    ['bulb', 'Warum Experten?', 'Menschen, die durch ihren <b>Beruf</b> oder ihr <b>Hobby</b> viel Erfahrung mit euren Arbeitsschritten haben. So vermeidet ihr Fehler und <b>lernt von Profis</b>.'],
    ['expert', 'Experten notieren', 'Tragt mögliche Experten ein: <b>Name</b>, <b>Telefon</b> oder <b>E-Mail</b> und <b>wofür</b> sie Experten sind.'],
    ['link', 'Als To-do planen', 'Kontakt aufnehmen ist ein Arbeitsschritt: <b>„Als To-do“</b> antippen — oder beim To-do einen Experten wählen.'],
    ['phone', 'Kontakt festhalten', 'Jedes <b>Telefonat</b>, jede <b>Mail</b>, jedes <b>Treffen</b> mit Datum eintragen — dazu die <b>wichtigsten Infos</b>.']
  ]);
  guideBox('reqGuide', 'requests', '<span class="gb-big">'
    + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + GI.check + '</svg>Checkliste</span>'
    + '<span class="gb-sub">Wir genehmigen nur, wenn alle fünf Punkte erfüllt sind.</span>', [
    ['sign', 'Einverständniserklärung', 'Die <b>unterschriebene Erklärung</b> ist abgegeben.'],
    ['book', 'Logbuch aktuell', '<b>To-dos und Dokumentation</b> sind auf dem neuesten Stand — sonst können wir nicht beurteilen, ob der Antrag sinnvoll ist.'],
    ['form', 'Antrag vollständig', '<b>Datum</b>, <b>wer mitfährt</b>, <b>Ziel mit Adresse</b>, <b>Weg und Verkehrsmittel</b>, <b>Begründung</b>.'],
    ['inbox', 'Genehmigung abwarten', 'Erst wenn der Antrag auf <b>„genehmigt“</b> steht, dürft ihr los. Kommentar der Lehrkraft: <b>unbedingt beachten</b>.'],
    ['plus', 'Jeder Termin = neuer Antrag', 'Für <b>jeden Tag</b> stellt ihr einen <b>eigenen Antrag</b>.'],
    ['alarm', 'Spätestens Vortag, 18 Uhr', 'Am besten schon am <b>Ende der vorherigen mPS-Stunde</b> abschicken — spätestens am <b>Abend vor der Exkursion um 18 Uhr</b>.', 'alarm']
  ]);
  guideBox('notesGuide', 'notes', 'Kurz erklärt', T ? [
    ['pen', 'Anheften', 'Hinweis schreiben, Farbe wählen, <b>anheften</b> — die Gruppe sieht ihn sofort.'],
    ['check', 'Abhaken', 'Die Gruppe <b>hakt ab</b>, was erledigt ist.'],
    ['chat', 'Antworten', 'Nachfragen stehen <b>unter dem Zettel</b> — dort antworten.']
  ] : [
    ['inbox', 'Lesen', 'Eure Lehrkräfte heften hier <b>Hinweise</b> zu eurem Projekt an.'],
    ['check', 'Abhaken', 'Erledigt? <b>Abhaken</b> — die Lehrkraft sieht es.'],
    ['chat', 'Nachfragen', 'Unklar? Direkt <b>unter dem Zettel</b> nachfragen.']
  ]);
}

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
    const tasks = todos();
    const due = goalObj().due;
    pill.hidden = !tasks.length && !due;
    pill.innerHTML = `${due ? `<div><div class="lbl">Fertig bis</div><div class="val">${esc(deShort(due))}</div></div>
      <div class="pill-div"></div>` : ''}<div><div class="lbl">To-dos fertig</div><div class="val">${tasks.filter(t => t.col === 'done').length} / ${tasks.length}</div></div>
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
  $('#meRole').textContent = PA.owner ? (teachers && !teachers.is_owner ? 'Lehrkraft · eingeladen' : 'Raum-Besitzer')
    : me.blocked ? 'stillgelegt'
    : group() ? gTitle(group(), members()) : 'in der Lobby';
  $('#miKeyTxt').textContent = PA.owner ? 'Codes zeigen' : 'Code zeigen';
  $('#miKey').hidden = !(PA.owner || me.key);
  $('#miRules').hidden = !PA.owner;
  $('#miTeachers').hidden = !PA.owner || m === 'loading';
  if (PA.owner && !teachers && !teachersTried) loadTeachers();
  // Export / Import / Backups: nur die Lehrkraft (0202). In der Übersicht
  // für die ganze Klasse, im Planungsraum für dieses Projekt.
  const inPlan = m === 'plan';
  $('#miExport').hidden = $('#miImport').hidden = $('#miBackups').hidden = !PA.owner || m === 'loading';
  $('#miExportTxt').textContent = inPlan ? 'Projekt exportieren' : 'Ganze Klasse exportieren';
  $('#miImportTxt').textContent = inPlan ? 'Projekt importieren' : 'Projekte importieren';
}

function renderCounts() {
  const tasks = todos(), logs = PA.list('log'), reqs = PA.list('request');
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
  $('#cntExp').textContent = experts().length;
  const openNotes = notes().filter(n => !n.done).length;
  const cn = $('#cntNotes');
  cn.textContent = openNotes;
  cn.classList.toggle('red', openNotes > 0 && !PA.owner);
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
    `${openReq ? `<span class="badge bg-no">${openReq} offene${openReq === 1 ? 'r' : ''} Antrag${openReq === 1 ? '' : 'e'}</span>` : ''}
     <button class="btn sm" data-clist aria-pressed="${showList}">${showList ? 'Klassenliste ausblenden' : 'Klassenliste zeigen'}</button>
     ${notifyBtn()}`;
  if (!notify && !notifyTried) loadNotify();

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
          <div class="g-name"${solo ? '' : ' title="Den Teamnamen gibt sich die Gruppe selbst (Reiter Team)."'}>${esc(title)}</div>
          ${solo ? (g.title ? `<div class="g-sub"><i>„${esc(g.title)}“</i></div>` : '')
            : `<div class="g-sub">${mem.length} ${mem.length === 1 ? 'Person' : 'Personen'}${g.title ? ` · <i>„${esc(g.title)}“</i>` : ''}</div>`}
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
  renderClassTeachers();
}

/* Ganz unten in der Klassenliste: wer als Lehrkraft im Raum ist (gleiche
   Rechte, 0205). Der Besitzer kann Eingeladene hier austragen. */
function renderClassTeachers() {
  const box = $('#clistTeachers');
  if (!teachers) { box.innerHTML = ''; if (!teachersTried) loadTeachers(); return; }
  const list = teachers.teachers || [];
  const kick = !!teachers.is_owner && canWrite();
  box.innerHTML = `<div class="clist-th"><h4>Lehrkräfte im Raum</h4><span class="cnt n">${list.length}</span>
      <button class="btn ghost sm" data-tinvite>${ICO.plus} Einladen</button></div>
    ${list.map(t => `<div class="crow">${avatar({ id: t.id, name: t.name }, 26)}
      <div class="cn"><b>${esc(t.name)}${t.me ? ' <span class="metag">du</span>' : ''}</b><small>${t.owner ? 'Raum-Besitzer' : 'eingeladen · gleiche Rechte'}</small></div>
      ${kick && !t.owner ? `<button class="btn ghost icon" data-tdel="${esc(t.id)}" title="${esc(t.name)} austragen" aria-label="${esc(t.name)} austragen">${ICO.trash}</button>` : ''}
    </div>`).join('')}`;
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
  if (r && r.group) { tab = 'team'; PA.setFocus(r.group); renderAll(); }
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
  const du = $('#goalDue');
  if (document.activeElement !== du && !goalDirty) du.value = /^\d{4}-\d{2}-\d{2}$/.test(g.due || '') ? g.due : '';
  du.disabled = !ok;
  renderDueHint(du.value);
  ti.disabled = !ok;
  r.contentEditable = ok ? 'true' : 'false';
  document.body.classList.toggle('goallock', !ok);
  $('#goalNote').hidden = !g.locked || PA.owner;
  const lb = $('#goalLockBtn');
  lb.hidden = !PA.owner;
  lb.innerHTML = g.locked ? ICO.unlock + ' Projektziel öffnen' : ICO.lock + ' Projektziel fixieren';
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

// Unter dem Fertig-Datum: wie viel Zeit noch bleibt.
function renderDueHint(due) {
  const el = $('#goalDueHint');
  const d = parseD(due);
  if (!d) { el.className = 'duehint'; el.textContent = 'Noch kein Datum'; return; }
  const days = Math.round((d - parseD(todayIso())) / 864e5);
  el.className = 'duehint' + (days < 0 ? ' late' : days <= 14 ? ' soon' : '');
  el.innerHTML = ICO.clock + ' ' + esc(days < 0 ? `seit ${-days} ${-days === 1 ? 'Tag' : 'Tagen'} vorbei`
    : days === 0 ? 'heute' : days < 14 ? `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}` : `noch ${Math.round(days / 7)} Wochen`);
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
    due: $('#goalDue').value || '',
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
    ${t.xpId ? `<div class="pi-xp" title="Experte">${ICO.phone}${esc((expertOf(t.xpId) || {}).name || t.xpName || 'Experte')}</div>` : ''}
    <div class="pi-foot">
      <span class="pi-who">${who.length ? who.map(p => avatar(p, 22)).join('') : '<span class="pi-free">noch frei</span>'}</span>
      ${who.length ? `<span style="margin-left:4px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(who.map(p => p.name).join(' + '))}</span>` : ''}
      ${+t.est ? `<span class="pi-est" title="geschätzte Zeit">${ICO.clock}${esc(fmtEst(+t.est))}</span>` : ''}
    </div>
  </div>`;
}

function renderWork() {
  const tasks = todos().sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title)));
  const by = k => tasks.filter(t => colOf(t) === k);
  const done = by('done').length, blk = by('blocked').length;
  renderBudget(tasks);
  $('#workStats').innerHTML = tasks.length
    ? `<span class="stat">Fertig <b>${done}/${tasks.length}</b></span>${blk ? `<span class="badge bg-block">${blk} blockiert</span>` : ''}
       <button class="btn primary needs-write" data-newtask="todo">${ICO.plus} To-do</button>`
    : `<button class="btn primary needs-write" data-newtask="todo">${ICO.plus} Erstes To-do</button>`;

  $('#colPick').innerHTML = COLS.map(c => `<button data-pcol="${c.k}" data-drop="col:${c.k}" aria-pressed="${phoneCol === c.k}">
      <span class="col-dot" style="background:${c.c};width:8px;height:8px;border-radius:99px"></span>${c.nm} <b>${by(c.k).length}</b></button>`).join('');

  $('#board').innerHTML = COLS.map(c => {
    const list = by(c.k);
    return `<div class="col${phoneCol === c.k ? ' on' : ''}" data-k="${c.k}">
      <div class="col-h"><span class="col-dot" style="background:${c.c}"></span><span class="nm">${c.nm}</span><span class="n">${list.length}</span></div>
      <div class="col-hint">${c.hint}</div>
      <div class="drop" data-drop="col:${c.k}">
        ${list.map(postit).join('')}
        ${c.k === 'todo' ? `<button class="addcard needs-write" data-newtask="todo">${ICO.plus} To-do hinzufügen</button>`
          : (list.length ? '' : '<div class="empty">Hierher ziehen</div>')}
      </div>
    </div>`;
  }).join('');
}

// Der Zeitbalken: Stunden bis zum Ende, gefüllt mit den Schätzungen der To-dos.
function renderBudget(tasks) {
  const box = $('#budget');
  const inp = box.querySelector('#budIn');
  const typing = inp && document.activeElement === inp;
  const total = budgetHours();
  const sum = k => tasks.filter(t => colOf(t) === k).reduce((a, t) => a + (+t.est || 0), 0);
  const parts = [['done', 'fertig'], ['doing', 'in Arbeit'], ['blocked', 'blockiert'], ['todo', 'zu erledigen']].map(([k, nm]) => ({ k, nm, h: sum(k) }));
  const planned = parts.reduce((a, p) => a + p.h, 0);
  const noEst = tasks.filter(t => !+t.est).length;
  const scale = Math.max(total, planned) || 1;
  const due = goalObj().due;
  const pct = h => (h / scale * 100).toFixed(2) + '%';
  let msg = '';
  if (!total) msg = `<div class="bud-msg info">${ICO.warn} Zählt im IServ-Kalender, wie viele Schulstunden ihr ${due ? 'bis zum ' + esc(deShort(due)) : 'bis zum Ende'} habt, und tragt sie oben ein.</div>`;
  else if (planned > total) msg = `<div class="bud-msg bad">${ICO.warn} Ihr habt ${esc(fmtH(planned - total))} mehr verplant, als ihr Zeit habt. Streicht oder verkleinert To-dos.</div>`;
  else if (noEst) msg = `<div class="bud-msg info">${ICO.clock} ${noEst === 1 ? 'Ein To-do hat' : noEst + ' To-dos haben'} noch keine Zeitschätzung.</div>`;
  const html = `
    <div class="bud-in"><label for="budIn">Wie viele Schulstunden habt ihr bis zum Ende?</label>
      <div class="row"><input type="number" id="budIn" min="0" max="400" step="1" inputmode="numeric" placeholder="?" ${canWrite() ? '' : 'disabled'}><span>Std.</span></div>
      <small>${due ? 'Fertig bis ' + esc(deDay(due)) : 'Fertig-Datum steht im Reiter Projektziel'}</small></div>
    <div class="bud-main">
    <div class="bud-sum">verplant <b>${esc(fmtH(planned))}</b>${total ? ` von <b>${esc(fmtH(total))}</b>` : ''}</div>
    <div class="bar${total && planned > total ? ' bad' : ''}" role="img" aria-label="${esc(`verplant ${fmtH(planned)} von ${fmtH(total)}`)}">
      ${parts.filter(p => p.h).map(p => `<span class="b-${p.k}" style="width:${pct(p.h)}" title="${esc(p.nm + ': ' + fmtH(p.h))}">${p.h / scale > .07 ? esc(fmtH(p.h)) : ''}</span>`).join('')}
      ${total && planned > total ? `<i class="b-mark" style="left:${pct(total)}" title="eure Zeit endet hier"></i>` : ''}
    </div>
    <div class="bud-leg">${parts.map(p => `<span><i class="k-${p.k}"></i>${p.nm} ${esc(fmtH(p.h))}</span>`).join('')}
      ${total ? `<span><i class="free"></i>frei ${esc(fmtH(Math.max(0, total - planned)))}</span>` : ''}</div>
    ${msg}</div>`;
  if (typing) {
    // Beim Tippen nur den Balken neu zeichnen, nicht das Feld.
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    ['.bud-sum', '.bar', '.bud-leg'].forEach(sel => { box.querySelector(sel).outerHTML = tmp.querySelector(sel).outerHTML; });
    const m = box.querySelector('.bud-msg'), nm = tmp.querySelector('.bud-msg');
    if (m) m.remove(); if (nm) box.querySelector('.bud-main').appendChild(nm);
    return;
  }
  box.innerHTML = html;
  box.querySelector('#budIn').value = total || '';
}
function saveBudget() {
  if (!canWrite()) return;
  const v = $('#budIn').value.trim();
  const hours = Math.max(0, Math.min(400, Math.round(+v || 0)));
  if (hours === budgetHours()) return;
  PA.put('task', 'budget', { budget: true, hours });
  renderAll();
}

function openTask(id, col, xp) {
  const t = id ? PA.get('task', id) : null;
  if (id && (!t || t.budget || t.expert === true)) return;
  editTask = id || null;
  $('#tkTitle').textContent = t ? 'To-do' : 'Neues To-do';
  $('#tkName').value = t ? t.title || '' : '';
  $('#tkText').value = t ? t.text || '' : '';
  $('#tkCol').value = t ? (t.col || 'todo') : (col || 'todo');
  $('#tkNote').value = t ? t.note || '' : '';
  tkWho = t ? (t.who || []).slice() : (meId() && members().some(m => m.id === meId()) ? [meId()] : []);
  tkColor = t && COLORS[t.color] ? t.color : 'yellow';
  $('#tkEst').value = t && +t.est ? +t.est : '';
  tkXp = t ? (expertOf(t.xpId) ? t.xpId : '') : (expertOf(xp) ? xp : '');
  if (!t && tkXp) $('#tkName').value = (expertOf(tkXp).name || 'Experten') + ' kontaktieren';
  $('#tkDel').hidden = !t;
  renderTaskForm();
  const ro = !canWrite();
  ['#tkName', '#tkText', '#tkEst', '#tkCol', '#tkNote'].forEach(s => { $(s).disabled = ro; });
  show('mTask');
  if (!ro && !t) setTimeout(() => $('#tkName').focus(), 60);
}
function renderTaskForm() {
  $('#tkWho').innerHTML = members().map(m => `<button type="button" data-who="${esc(m.id)}" aria-pressed="${tkWho.includes(m.id)}">${avatar(m, 22)}${esc(m.name)}</button>`).join('')
    || '<span class="hint">Noch niemand in der Gruppe.</span>';
  $('#tkColor').innerHTML = Object.keys(COLORS).map(k => `<button type="button" data-color="${k}" aria-checked="${tkColor === k}" title="${k}" style="background:${COLORS[k]}"></button>`).join('');
  $('#tkNoteF').hidden = $('#tkCol').value !== 'blocked';
  // Experte: nur, wenn die Gruppe schon welche eingetragen hat.
  const xs = experts();
  $('#tkXpF').hidden = !xs.length;
  $('#tkXp').innerHTML = xs.length ? `<button type="button" data-tkxp="" aria-pressed="${!tkXp}">keiner</button>` + xs.map(x =>
    `<button type="button" data-tkxp="${esc(x.id)}" aria-pressed="${tkXp === x.id}">${esc(x.name || 'Ohne Namen')}</button>`).join('') : '';
  const x = expertOf(tkXp);
  $('#tkXpInfo').innerHTML = x ? `<div class="xpinfo">${x.topic ? `<span>${esc(x.topic)}</span>` : ''}${xpReach(x)}</div>` : '';
}
// Telefon und Mail als Links (antippen = anrufen bzw. Mail schreiben).
function xpReach(x) {
  const tel = String(x.phone || '').replace(/[^\d+]/g, '');
  return (x.phone ? `<a href="tel:${esc(tel)}">${ICO.phone}${esc(x.phone)}</a>` : '')
    + (x.mail ? `<a href="mailto:${esc(x.mail)}">${ICO.mail}${esc(x.mail)}</a>` : '');
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
    col, color: tkColor, est: readEst($('#tkEst').value), note: col === 'blocked' ? $('#tkNote').value.trim().slice(0, 400) : (old && old.note) || '',
    order: old && old.col === col ? old.order : Date.now()
  });
  const xp = expertOf(tkXp);
  data.xpId = xp ? tkXp : '';
  data.xpName = xp ? String(xp.name || '').slice(0, 80) : '';
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
  const inToday = new Set(logs.filter(l => l.date === today).flatMap(logWho));
  const myIn = gm.some(m => m.id === meId());

  $('#todayBar').innerHTML = `<b style="font-size:13px">Heute, ${esc(deDay(today))}</b>
    <span class="who">${gm.map(m => `<span class="${inToday.has(m.id) ? '' : 'miss'}">${avatar(m, 26)}</span>`).join('')}</span>
    <span style="font-size:12.5px;color:var(--ink-2)">${gm.filter(m => inToday.has(m.id)).length} von ${gm.length} in einem Eintrag</span>
    ${myIn && !inToday.has(meId()) && !PA.owner ? '<span class="badge bg-open" style="margin-left:auto">Du stehst heute noch in keinem Eintrag</span>' : ''}`;

  // „+ Eintrag" oben rechts wie „+ To-do" — nur für Mitglieder der Gruppe.
  // Das Formular steht im Dialog mLog.
  $('#hoursStats').innerHTML = (logs.length ? `<span class="stat">Einträge <b>${logs.length}</b></span>` : '')
    + (!PA.owner && myIn ? `<button class="btn primary needs-write" data-newlog="1">${ICO.plus} Eintrag</button>` : '');
  if (!$('#mLog').hidden) renderLogForm();

  // Lehrkraft: Hinweis, solange Fotos in der Dokumentation liegen.
  const nPh = logs.reduce((a, l) => a + logPhotos(l).length, 0);
  const pn = $('#hPhotoNote');
  pn.hidden = !PA.owner || !nPh;
  if (PA.owner && nPh) pn.innerHTML = `${ICO.warn}<span><b>${nPh} ${nPh === 1 ? 'Foto' : 'Fotos'}</b> in der Dokumentation. Sind Personen oder andere personenbezogene Daten darauf zu sehen, löscht die Fotos (× am Foto), sobald sie nicht mehr gebraucht werden.</span>`;

  if (!logs.length) {
    $('#hList').innerHTML = `<div class="nothing" style="padding:34px 20px"><h3>Noch keine Einträge</h3>
      <p>Am Ende des Arbeitstags haltet ihr fest, wer was gemacht hat.</p></div>`;
    return;
  }
  const days = [];
  logs.forEach(l => { let d = days.find(x => x.date === l.date); if (!d) days.push(d = { date: l.date, list: [] }); d.list.push(l); });
  $('#hList').innerHTML = days.map(d => {
    // Wer an dem Tag in mindestens einem Eintrag steht — wer fehlte, steht nicht da.
    const seen = new Map();
    d.list.slice().reverse().forEach(l => logPeople(l).forEach(p => { if (!seen.has(p.id)) seen.set(p.id, p.name); }));
    // Wer aus der Gruppe in keinem Eintrag steht, hat gefehlt (oder ist noch nicht eingetragen).
    const away = gm.filter(m => !seen.has(m.id)).map(m => m.name);
    return `
    <div class="dayh"><h4>${esc(deDay(d.date))}</h4><span class="present">dabei: ${esc(andList([...seen.values()]))}</span>${away.length
      ? `<span class="absent" title="steht an diesem Tag in keinem Eintrag">fehlte: ${esc(andList(away))}</span>` : ''}</div>
    <div class="daygrid">${d.list.slice().reverse().map(l => {
      const ps = logPeople(l);
      const mine = !!meId() && logWho(l).includes(meId());
      const edit = canEditLog(l);
      const byOther = l.byName && !logWho(l).includes(l.by);
      return `<div class="entry${mine ? ' mine' : ''}">
        <span class="avs">${ps.map(p => avatar(p, 30)).join('')}</span>
        <div class="body">
          <div class="top"><b>${esc(andList(ps.map(p => p.name)) || '?')}</b>
            ${edit || (PA.owner && canWrite()) ? `<span class="acts">
              ${edit ? `<button class="btn ghost icon" data-logedit="${esc(l.id)}" title="Bearbeiten" aria-label="Bearbeiten">${ICO.pen}</button>` : ''}
              <button class="btn ghost icon" data-logdel="${esc(l.id)}" title="Löschen" aria-label="Löschen">${ICO.trash}</button></span>` : ''}
          </div>
          ${todoChip(l)}
          <p>${esc(l.text)}</p>
          ${l.next ? `<div class="nx"><b>Nächstes</b>${esc(l.next)}</div>` : ''}
          ${photosHtml(l)}
          ${byOther ? `<div class="by">eingetragen von ${esc(l.byName)}</div>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
  }).join('');
}

// Am Eintrag: an welchem To-do — Farbe nach der Spalte, in der es jetzt steht.
function todoChip(l) {
  if (!l.task) return '';
  const t = PA.get('task', l.task);
  const k = t && !t.budget && t.expert !== true ? colOf(t) : 'none';
  const nm = (t && t.title) || l.taskTitle || 'gelöschtes To-do';
  return `<div class="etodo" title="${esc(t ? (COLS.find(c => c.k === k) || {}).nm || '' : 'nicht mehr auf dem Board')}"><i class="kdot k-${k}"></i><span>${esc(nm)}</span></div>`;
}
// Auswahl „An welchem To-do?": In Arbeit oben, dann der Rest, farbig nach Spalte.
function renderTodoPick() {
  const box = $('#hTodo');
  const list = todos();
  const order = ['doing', 'todo', 'blocked', 'done'];
  const cur = hTask ? PA.get('task', hTask) : null;
  const label = hTask === '' ? '<span class="nm">Etwas anderes (kein To-do)</span>'
    : cur ? `<i class="kdot k-${colOf(cur)}"></i><span class="nm">${esc(cur.title || 'Ohne Titel')}</span>`
    : `<span class="nm ph">${list.length ? 'To-do auswählen …' : 'Noch keine To-dos'}</span>`;
  box.innerHTML = `<button type="button" class="tdbtn" data-tdopen aria-haspopup="listbox" aria-expanded="${tdOpen}">${label}
      <svg width="12" height="8" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 1l4 4 4-4"/></svg></button>
    ${tdOpen ? `<div class="tdlist" role="listbox">${order.map(k => {
      const its = list.filter(t => colOf(t) === k).sort((a, b) => (a.order || 0) - (b.order || 0));
      if (!its.length) return '';
      return `<div class="tdgrp">${esc(COLS.find(c => c.k === k).nm)}</div>` + its.map(t =>
        `<button type="button" class="tdopt" role="option" data-k="${k}" data-tdopt="${esc(t.id)}" aria-selected="${hTask === t.id}"><i class="kdot k-${k}"></i>${esc(t.title || 'Ohne Titel')}${+t.est ? `<small>${esc(fmtEst(+t.est))}</small>` : ''}</button>`).join('');
    }).join('')}<div class="tdgrp">Sonst</div><button type="button" class="tdopt" role="option" data-tdopt="" aria-selected="${hTask === ''}"><i class="kdot k-none"></i>Etwas anderes (kein To-do)</button></div>` : ''}`;
}

// Fotos am Eintrag (0206): höchstens drei, nur sichere data-URLs.
const logPhotos = l => (Array.isArray(l.photos) ? l.photos : []).filter(safeImg).slice(0, 3);
function photosHtml(l) {
  const ph = logPhotos(l);
  if (!ph.length) return '';
  const del = PA.owner && canWrite();
  return `<div class="ephotos">${ph.map((src, i) => `<div class="eph"><img src="${src}" alt="Foto ${i + 1}" data-zoom="${esc(l.id)}:${i}" loading="lazy">
    ${del ? `<button class="x" data-phdel="${esc(l.id)}:${i}" title="Foto löschen" aria-label="Foto löschen">${ICO.trash}</button>` : ''}</div>`).join('')}</div>`;
}
function renderLogPhotos() {
  $('#hPhotos').innerHTML = hPhotos.map((src, i) => `<div class="ishell"><img src="${src}" alt="Foto ${i + 1}">
      <button type="button" class="x" data-hpx="${i}" aria-label="Foto entfernen"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join('')
    + (hPhotos.length < 3 ? `<button type="button" class="iadd" data-hpadd>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GI.camera}</svg>
        <span>Foto<br>${hPhotos.length}/3</span></button>` : '');
}
// Fotos fürs Speichern verkleinern: lange Seite höchstens 1000 px, JPEG —
// und kleiner, bis eins unter ~200 KB bleibt (drei passen in einen Eintrag).
function shrinkPhoto(file, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      let url = '';
      for (const [max, q] of [[1000, 0.68], [860, 0.6], [720, 0.55], [600, 0.5]]) {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        url = cv.toDataURL('image/jpeg', q);
        if (url.length <= 200000) break;
      }
      cb(url);
    };
    img.onerror = () => toast('⚠ Foto konnte nicht gelesen werden');
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

function renderLogWho() {
  const gm = members();
  if (hWho === null && meId()) hWho = [meId()];
  $('#hWho').innerHTML = gm.map(m => `<button type="button" data-hwho="${esc(m.id)}" aria-pressed="${(hWho || []).includes(m.id)}">${avatar(m, 22)}${esc(m.name)}</button>`).join('')
    || '<span class="hint">Noch niemand in der Gruppe.</span>';
}

// Der Dialog: Kopf und Knopf nach „neu" oder „bearbeiten", dazu die Auswahlen.
function renderLogForm() {
  if (!editLog && !$('#hDate').value) $('#hDate').value = todayIso();
  $('#hFormTitle').textContent = editLog ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
  $('#hSave').lastChild.textContent = editLog ? ' Speichern' : ' Eintragen';
  renderLogWho(); renderTodoPick(); renderLogPhotos();
}
// Neuer Eintrag: ein angefangener Entwurf bleibt erhalten; kam man aus
// „bearbeiten", fängt das Formular leer an.
function openLog() {
  if (!canWrite() || PA.owner) return;
  if (editLog) resetLogForm();
  renderLogForm();
  show('mLog');
  setTimeout(() => $('#hText').focus(), 60);
}
function closeLog() {
  hide('mLog');
  if (editLog) resetLogForm();
}

function saveLog() {
  if (!canWrite()) return;
  const text = $('#hText').value.trim();
  if (!text) { toast('Was wurde gemacht? Ein Satz reicht.'); $('#hText').focus(); return; }
  const who = (hWho || []).filter(id => members().some(m => m.id === id));
  if (!who.length) { toast('Wer war dabei? Bitte mindestens eine Person antippen.'); return; }
  if (hTask === null) { toast('An welchem To-do habt ihr gearbeitet? Bitte auswählen.'); tdOpen = true; renderTodoPick(); return; }
  const old = editLog ? PA.get('log', editLog) : null;
  const tk = hTask ? PA.get('task', hTask) : null;
  const data = Object.assign({}, old || {}, {
    date: $('#hDate').value || todayIso(),
    task: tk ? hTask : '', taskTitle: tk ? String(tk.title || '').slice(0, 120) : '',
    text: text.slice(0, 1500),
    next: $('#hNext').value.trim().slice(0, 600),
    who, whoNames: who.map(id => (person(id) || {}).name || '')
  });
  delete data.hours;   // wird nicht mehr erfasst
  const ph = hPhotos.filter(safeImg).slice(0, 3);
  if (ph.length) data.photos = ph; else delete data.photos;
  if (!old) { data.by = meId(); data.byName = (PA.me && PA.me.name) || ''; }
  PA.put('log', editLog || PA.newId('l'), data);
  resetLogForm();
  hide('mLog');
  toast(old ? 'Eintrag gespeichert' : 'Eingetragen — danke!');
  renderAll();
}
function resetLogForm() {
  editLog = null;
  hWho = null; hTask = null; tdOpen = false; hPhotos = [];
  $('#hText').value = ''; $('#hNext').value = '';
  $('#hDate').value = todayIso();
}
function editLogEntry(id) {
  const l = PA.get('log', id); if (!l) return;
  editLog = id;
  hWho = logWho(l).slice();
  hPhotos = logPhotos(l);
  $('#hDate').value = l.date || todayIso();
  hTask = l.task && PA.get('task', l.task) ? l.task : (l.task === '' ? '' : null);
  tdOpen = false;
  $('#hText').value = l.text || '';
  $('#hNext').value = l.next || '';
  renderLogForm();
  show('mLog');
  setTimeout(() => $('#hText').focus(), 60);
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
        : 'Ihr wollt an einem Tag außerhalb der Schule arbeiten? Geht die Checkliste durch, dann oben rechts „Antrag stellen“.'}</p></div>`;
    return;
  }
  $('#reqList').innerHTML = list.map(r => {
    const st = r.status || 'open';
    const rs = reqSt(r);
    const legacy = !r.date && !r.place;
    const who = (r.who || []).map(id => person(id) || { id, name: '?' });
    // Die Haken der Einwilligung sehen Schüler im Team, nicht hier.
    const noConsent = PA.owner ? who.filter(p => p.name !== '?' && !+(p.consent || 0)) : [];
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
      foot = `<div class="req-f"><span class="hint" style="margin:0;display:flex;gap:6px;align-items:center">${ICO.lock} Genehmigt — der Antrag kann nicht mehr bearbeitet oder gelöscht werden.</span></div>`;
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
          `<span class="mate">${avatar(p, 22)}${esc(p.name)}${PA.owner ? ' ' + cmark(p, false) : ''}</span>`).join('') : '—'}</span></div>
        <div class="req-row"><span class="k">Plan</span><span class="req-plan">${esc(r.activity || '—')}</span></div>
        ${noConsent.length && st !== 'approved' ? `<div class="req-warn">${ICO.warn} Ohne Einwilligung: ${esc(noConsent.map(p => p.name).join(', '))}</div>` : ''}
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
  $('#rqAct').value = r ? r.activity || r.text || '' : RQ_TEMPLATE;
  $('#rqPrev').hidden = !rejected;
  if (rejected) $('#rqPrev').innerHTML = `<b>Abgelehnt:</b> ${esc(r.decision || 'ohne Begründung')}`;
  $('#rqSave').textContent = !r ? 'Antrag abschicken' : rejected ? 'Neu abschicken' : 'Speichern';
  renderReqWho();
  show('mReq');
  setTimeout(() => $(r ? '#rqAct' : '#rqDate').focus(), 60);
}
function renderReqWho() {
  const gm = members();
  // Ohne Haken: die Einwilligungen stehen im Reiter Team.
  $('#rqWho').innerHTML = gm.map(m => `<button type="button" data-rqwho="${esc(m.id)}" aria-pressed="${rqWho.includes(m.id)}">${avatar(m, 22)}${esc(m.name)}</button>`).join('')
    || '<span class="hint">Noch niemand in der Gruppe.</span>';
  const miss = gm.filter(m => rqWho.includes(m.id) && !+(m.consent || 0));
  const hint = $('#rqWhoHint');
  hint.classList.toggle('warn', miss.length > 0);
  hint.innerHTML = miss.length
    ? `${ICO.warn}<span>Für ${esc(miss.map(m => m.name).join(', '))} liegt noch <b>keine Einwilligung</b> vor.</span>`
    : 'Tippt alle an, die mitfahren.';
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
  // Stehen die beiden Überschriften noch drin, muss unter jeder etwas stehen.
  const way = sectionOf(activity, RQ_WAY, RQ_WHY), why = sectionOf(activity, RQ_WHY, RQ_WAY);
  if (!activity || activity === RQ_TEMPLATE.trim()) { toast('Wie kommt ihr dahin — und warum? Bitte ausfüllen.'); $('#rqAct').focus(); return; }
  if (way === '') { toast('Bitte WEG und VERKEHRSMITTEL eintragen.'); $('#rqAct').focus(); return; }
  if (why === '') { toast('Bitte die BEGRÜNDUNG eintragen: Warum ist die Exkursion nötig?'); $('#rqAct').focus(); return; }
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
// Text unter einer Überschrift im Antrag (bis zur anderen); null, wenn sie fehlt.
function sectionOf(text, head, other) {
  const i = text.toUpperCase().indexOf(head.toUpperCase());
  if (i < 0) return null;
  const rest = text.slice(i + head.length);
  const j = rest.toUpperCase().indexOf(other.toUpperCase());
  return (j < 0 ? rest : rest.slice(0, j)).trim();
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
  const g = group();
  $('#teamTitle').textContent = gm.length === 1 && !(g && g.name) ? 'Einzelarbeit' : gTitle(g, gm);
  // Den Teamnamen geben sich die Schüler selbst; die Lehrkraft sieht ihn nur.
  const nameIn = $('#teamNameIn');
  $('#teamNameF').hidden = PA.owner || !g;
  if (document.activeElement !== nameIn) nameIn.value = (g && g.name) || '';
  nameIn.disabled = !canWrite();
  $('#teamGrid').innerHTML = gm.map(m => {
    const c = consentOf(m);
    const consent = PA.owner
      ? `<div class="cseg" role="group" aria-label="Einwilligung von ${esc(m.name)}">${CONSENT.map(k =>
          `<button type="button" class="c${k.n}" data-consent="${esc(m.id)}:${k.n}" aria-pressed="${c.n === k.n}" title="${esc(k.nm)}">${k.mark} ${k.short}</button>`).join('')}</div>`
      : `<div class="cread c${c.n}">${cmark(m, false)}<span>${esc(c.nm)}</span></div>`;
    return `<div class="mcard${m.me ? ' me' : ''}">
      <div class="mtop">${avatar(m, 52)}
        <div style="flex:1;min-width:0">
          <div class="mname">${esc(m.name)}${m.me ? ' <span class="metag">du</span>' : ''}<span class="dot${m.online ? ' on' : ''}" title="${m.online ? 'gerade da' : 'nicht da'}"></span></div>
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
   LEHRKRAFT-KOMMENTARE (0205)
   ════════════════════════════════════════════════════════════ */
const notes = () => ((group() && group().notes) || []).slice()
  .sort((a, b) => (a.done - b.done) || String(b.at || '').localeCompare(String(a.at || '')));
const noteFn = fn => (PA.owner ? 'pa_room_note_' : 'pa_note_') + fn;

function renderNotes() {
  const all = notes();
  const open = all.filter(n => !n.done).length;
  $('#noteForm').hidden = !PA.owner;
  $('#notesSub').innerHTML = PA.owner
    ? 'Kommentare an diese Gruppe — jede Lehrkraft des Raums sieht und schreibt hier.'
    : 'Hinweise eurer Lehrkräfte zu eurem Projekt.';
  $('#noteColors').innerHTML = Object.keys(COLORS).map(c =>
    `<button type="button" data-ncolor="${c}" style="background:${COLORS[c]}" aria-pressed="${noteColor === c}" aria-label="Farbe ${c}"></button>`).join('');
  $('#notesStats').innerHTML = all.length
    ? `<span class="stat">Offen <b>${open}</b> · erledigt <b>${all.length - open}</b></span>` : '';
  $('#noteFilt').innerHTML = all.length > 1 ? [['all', 'Alle'], ['open', 'Offen'], ['done', 'Erledigt']].map(([k, nm]) =>
    `<button class="btn sm${noteFilter === k ? ' primary' : ' ghost'}" data-nf="${k}">${nm}</button>`).join('') : '';
  const list = all.filter(n => noteFilter === 'all' || (noteFilter === 'done') === !!n.done);
  $('#noteGrid').innerHTML = list.map(noteHtml).join('') || (all.length
    ? `<div class="nothing" style="grid-column:1/-1;padding:24px"><h3>${noteFilter === 'open' ? 'Alles abgehakt' : 'Noch nichts abgehakt'}</h3></div>`
    : `<div class="nothing" style="grid-column:1/-1;padding:28px"><h3>Noch keine Kommentare</h3>
        <p>${PA.owner ? 'Oben einen Hinweis schreiben und anheften — die Gruppe sieht ihn sofort.' : 'Sobald eure Lehrkraft euch einen Hinweis gibt, hängt er hier.'}</p></div>`);
}

function noteHtml(n) {
  const col = COLORS[n.color] ? n.color : 'yellow';
  const reps = (Array.isArray(n.replies) ? n.replies : []).map(r => {
    const mine = PA.owner || (!r.teacher && r.by && r.by === meId());
    return `<div class="n-rep${r.teacher ? ' t' : ''}"><b>${esc(r.name || '?')} <i>· ${esc(deAt(r.at))}</i></b><span>${esc(r.text)}</span>
      ${mine && canWrite() ? `<button class="rx" data-nrdel="${esc(n.id)}:${esc(r.id)}" title="Löschen" aria-label="Löschen">${ICO.trash}</button>` : ''}</div>`;
  }).join('');
  return `<div class="note pi-${col}${n.done ? ' done' : ''}">
    ${PA.owner ? `<button class="n-x" data-ndel="${esc(n.id)}" title="Kommentar löschen" aria-label="Kommentar löschen">${ICO.trash}</button>` : ''}
    <div class="n-head">${avatar({ id: n.author || n.authorName, name: n.authorName }, 22)}<span>${esc(n.authorName || 'Lehrkraft')}</span><span class="when">${esc(deAt(n.at))}</span></div>
    <div class="n-text">${esc(n.text)}</div>
    ${reps ? `<div class="n-reps">${reps}</div>` : ''}
    ${canWrite() ? `<form class="n-ask" data-nask="${esc(n.id)}"><input type="text" maxlength="600" data-naskin="${esc(n.id)}" value="${esc(askDraft[n.id] || '')}"
        placeholder="${PA.owner ? 'Antworten …' : 'Nachfrage stellen …'}" aria-label="${PA.owner ? 'Antworten' : 'Nachfrage stellen'}">
      <button class="btn sm" type="submit" aria-label="Senden">${ICO.arrow}</button></form>` : ''}
    <label class="n-done"><input type="checkbox" data-ndone="${esc(n.id)}"${n.done ? ' checked' : ''}${canWrite() ? '' : ' disabled'}>
      ${n.done ? 'Erledigt' : 'Abhaken, wenn erledigt'}${n.done && n.doneBy ? ` <small>· ${esc(n.doneBy)}, ${esc(deAt(n.doneAt))}</small>` : ''}</label>
  </div>`;
}

async function addNote() {
  const txt = $('#noteIn').value.trim();
  if (!txt) { $('#noteIn').focus(); return; }
  const r = await PA.act('pa_room_note_add', { p_group: PA.focus, p_text: txt, p_color: noteColor });
  if (r) { $('#noteIn').value = ''; toast('Kommentar angeheftet'); }
}

async function sendAsk(id) {
  const txt = String(askDraft[id] || '').trim();
  if (!txt) return;
  const r = await PA.act(noteFn('reply'), { p_note: id, p_text: txt });
  if (r) { delete askDraft[id]; if (document.activeElement) document.activeElement.blur(); }
}

/* ── Weitere Lehrkräfte (0205) ───────────────────────────────
   Gezielt einladen: Name suchen, antippen — die Lehrkraft ist sofort
   mit denselben Rechten im Raum. Austragen kann jede Lehrkraft jede
   eingeladene (auch sich selbst); den Besitzer niemand. */
let teachers = null, teachersTried = false, tSearchTimer = null, tSearchSeq = 0;

async function loadTeachers() {
  teachersTried = true;
  const r = await PA.call('pa_room_teachers_get', {});
  if (r && r.ok) { teachers = r; renderMenu(mode()); if (!$('#mTeachers').hidden) renderTeachers(); if (showList && mode() === 'overview') renderClassTeachers(); }
  return r;
}

function renderTeachers() {
  const list = (teachers && teachers.teachers) || [];
  $('#tList').innerHTML = list.map(t => `<div class="tline">${avatar({ id: t.id, name: t.name }, 30)}
      <div class="who">${esc(t.name)}${t.me ? ' <span class="metag">du</span>' : ''}<small>${t.owner ? 'hat den Raum eröffnet' : 'eingeladen'}</small></div>
      ${t.owner ? '' : `<button class="btn ghost sm" data-tdel="${esc(t.id)}">${t.me ? 'Raum verlassen' : 'Austragen'}</button>`}
    </div>`).join('');
}

async function openTeachers() {
  $('#tSearch').value = ''; $('#tRes').innerHTML = '';
  renderTeachers();
  show('mTeachers');
  const r = await loadTeachers();
  if (!r || !r.ok) { hide('mTeachers'); toast(PA.msg(r && r.error === 'fn_missing' ? 'fn_missing' : r && r.error)); return; }
  setTimeout(() => $('#tSearch').focus(), 60);
}

async function searchTeachers() {
  const q = $('#tSearch').value.trim();
  const seq = ++tSearchSeq;
  if (q.length < 2) { $('#tRes').innerHTML = q ? '<p class="hint">Mindestens zwei Buchstaben.</p>' : ''; return; }
  const r = await PA.call('pa_room_teacher_search', { p_q: q });
  if (seq !== tSearchSeq) return;
  if (!r || !r.ok) { $('#tRes').innerHTML = `<p class="hint">${esc(PA.msg(r && r.error))}</p>`; return; }
  $('#tRes').innerHTML = (r.teachers || []).map(t => `<div class="tline">${avatar({ id: t.id, name: t.name }, 30)}
      <div class="who">${esc(t.name)}${t.account && t.account !== t.name ? `<small>${esc(t.account)}</small>` : ''}</div>
      <button class="btn primary sm" data-tadd="${esc(t.id)}" data-name="${esc(t.name)}">Einladen</button></div>`).join('')
    || '<p class="hint">Keine Lehrkraft gefunden — oder sie ist schon im Raum.</p>';
}

async function addTeacher(id, name) {
  const r = await PA.act('pa_room_teacher_add', { p_user: id });
  if (!r) return;
  toast(`${name} ist jetzt Lehrkraft in diesem Raum.`);
  $('#tSearch').value = ''; $('#tRes').innerHTML = '';
  loadTeachers();
}

function removeTeacher(id) {
  const t = ((teachers && teachers.teachers) || []).find(x => x.id === id);
  if (!t) return;
  hide('mTeachers');
  ask(t.me ? 'Raum verlassen?' : `${t.name} austragen?`, t.me
    ? 'Du bist dann keine Lehrkraft mehr in diesem Raum und siehst ihn nicht mehr. Eine andere Lehrkraft des Raums kann dich wieder einladen.'
    : `${t.name} sieht den Raum danach nicht mehr. Kommentare und Entscheidungen bleiben stehen.`,
    async () => {
      const r = await PA.act('pa_room_teacher_remove', { p_user: t.me ? null : id });
      if (!r) return;
      if (t.me) {
        toast('Du hast den Raum verlassen.');
        if (!PA.demo) setTimeout(() => { try { window.parent.location.href = new URL('../../index.html', location.href).href; } catch (e) { /* bleibt */ } }, 900);
        return;
      }
      toast(`${t.name} ist ausgetragen.`);
      loadTeachers();
    }, t.me ? 'Verlassen' : 'Austragen');
}

/* ════════════════════════════════════════════════════════════
   EXPERTEN
   ════════════════════════════════════════════════════════════ */
function renderExperts() {
  const xs = experts();
  const met = xs.filter(x => (x.contacts || []).length).length;
  $('#expStats').innerHTML = (xs.length ? `<span class="stat">Kontakt mit <b>${met}/${xs.length}</b></span>` : '')
    + `<button class="btn primary needs-write" data-newxp="1">${ICO.plus} Experte</button>`;
  const all = todos();
  $('#expGrid').innerHTML = xs.map(x => {
    const cons = (x.contacts || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const linked = all.filter(t => t.xpId === x.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    return `<div class="xcard">
      <div class="xtop"><span class="xav">${ICO.expert}</span>
        <div style="min-width:0;flex:1"><div class="xname">${esc(x.name || 'Ohne Namen')}</div>
          ${x.topic ? `<div class="xtopic">Experte für: ${esc(x.topic)}</div>` : ''}
          <span class="xstate${cons.length ? ' on' : ''}">${cons.length ? `${cons.length} Kontakt${cons.length > 1 ? 'e' : ''}` : 'noch kein Kontakt'}</span></div>
        <button class="btn ghost sm needs-write" data-editxp="${esc(x.id)}" aria-label="${esc(x.name)} bearbeiten">${ICO.pen}</button></div>
      <div class="xreach">${xpReach(x) || '<span>Noch keine Telefonnummer oder Mail</span>'}</div>
      ${linked.length ? `<div class="xsec"><span class="fl">To-dos</span><div class="xtodos">${linked.map(t =>
        `<button type="button" class="xtodo" data-opentask="${esc(t.id)}"><i class="kdot k-${colOf(t)}"></i>${esc(t.title || 'Ohne Titel')}<small>${esc(COLS.find(c => c.k === colOf(t)).nm)}</small></button>`).join('')}</div></div>` : ''}
      <div class="xsec"><span class="fl">Kontakte &amp; Infos</span>
        ${cons.length ? `<div class="xcons">${cons.map(c => `<div class="xcon" data-editct="${esc(x.id)}:${esc(c.id)}" role="button" tabindex="0">
          <div class="h">${esc(deDay(c.date))} · ${esc(CONTACT[c.how] || CONTACT.other)}${c.byName ? `<span class="by">${esc(c.byName)}</span>` : ''}</div>
          ${c.text ? `<p>${esc(c.text)}</p>` : ''}</div>`).join('')}</div>`
          : '<div class="xnone">Noch nichts notiert. Nach jedem Telefonat, jeder Mail, jedem Treffen hier eintragen.</div>'}</div>
      <div class="xacts">
        <button class="btn sm primary needs-write" data-newct="${esc(x.id)}">${ICO.plus} Kontakt eintragen</button>
        ${linked.some(t => colOf(t) !== 'done') ? '' : `<button class="btn sm needs-write" data-xptask="${esc(x.id)}">${ICO.plus} Als To-do</button>`}
      </div>
    </div>`;
  }).join('') + `<button class="xadd needs-write" data-newxp="1">${ICO.expert}${xs.length ? 'Weiteren Experten eintragen' : 'Ersten Experten eintragen'}</button>`;
}

function openExpert(id) {
  const x = id ? expertOf(id) : null;
  if (id && !x) return;
  editXp = id || null;
  $('#xpTitle').textContent = x ? 'Experte' : 'Neuer Experte';
  $('#xpName').value = x ? x.name || '' : '';
  $('#xpTopic').value = x ? x.topic || '' : '';
  $('#xpPhone').value = x ? x.phone || '' : '';
  $('#xpMail').value = x ? x.mail || '' : '';
  $('#xpDel').hidden = !x;
  const ro = !canWrite();
  ['#xpName', '#xpTopic', '#xpPhone', '#xpMail'].forEach(s => { $(s).disabled = ro; });
  show('mExpert');
  if (!ro) setTimeout(() => $('#xpName').focus(), 60);
}
function saveExpert() {
  if (!canWrite()) return;
  const name = $('#xpName').value.trim();
  if (!name) { toast('Wie heißt die Person?'); $('#xpName').focus(); return; }
  const old = editXp ? expertOf(editXp) : null;
  const data = Object.assign({ contacts: [] }, old || {}, {
    expert: true, name: name.slice(0, 80), topic: $('#xpTopic').value.trim().slice(0, 160),
    phone: $('#xpPhone').value.trim().slice(0, 40), mail: $('#xpMail').value.trim().slice(0, 120)
  });
  const id = editXp || PA.newId('x');
  PA.put('task', id, data);
  // Verknüpfte To-dos tragen den Namen mit (falls der Experte gelöscht wird).
  if (old && old.name !== data.name) todos().filter(t => t.xpId === id)
    .forEach(t => PA.put('task', t.id, Object.assign({}, t, { xpName: data.name })));
  hide('mExpert');
  toast(old ? 'Gespeichert' : `${data.name} ist eingetragen`);
  renderAll();
}

function openContact(xid, cid) {
  const x = expertOf(xid); if (!x) return;
  const c = cid ? (x.contacts || []).find(k => k.id === cid) : null;
  if (cid && !c) return;
  ctXp = xid; ctId = c ? c.id : null;
  ctHow = c && CONTACT[c.how] ? c.how : 'call';
  $('#ctTitle').textContent = `${c ? 'Kontakt' : 'Kontakt eintragen'} · ${x.name || 'Experte'}`;
  $('#ctDate').value = (c && c.date) || todayIso();
  $('#ctText').value = c ? c.text || '' : '';
  $('#ctDel').hidden = !c;
  renderContactKind();
  const ro = !canWrite();
  ['#ctDate', '#ctText'].forEach(s => { $(s).disabled = ro; });
  show('mContact');
  if (!ro && !c) setTimeout(() => $('#ctText').focus(), 60);
}
function renderContactKind() {
  $('#ctKind').innerHTML = Object.entries(CONTACT).map(([k, nm]) =>
    `<button type="button" data-cthow="${k}" aria-pressed="${ctHow === k}">${nm}</button>`).join('');
}
function saveContact() {
  if (!canWrite()) return;
  const x = expertOf(ctXp); if (!x) { hide('mContact'); return; }
  const text = $('#ctText').value.trim();
  if (!text) { toast('Was habt ihr erfahren oder gefragt? Ein Satz reicht.'); $('#ctText').focus(); return; }
  const list = (x.contacts || []).slice();
  const i = ctId ? list.findIndex(k => k.id === ctId) : -1;
  const c = Object.assign({}, i >= 0 ? list[i] : { id: PA.newId('c'), byName: PA.owner ? 'Lehrkraft' : ((PA.me && PA.me.name) || '') }, {
    date: $('#ctDate').value || todayIso(), how: ctHow, text: text.slice(0, 2000)
  });
  if (i >= 0) list[i] = c; else list.push(c);
  PA.put('task', ctXp, Object.assign({}, x, { contacts: list.slice(-60) }));
  hide('mContact');
  toast('Kontakt eingetragen');
  renderAll();
}

/* ════════════════════════════════════════════════════════════
   PROJEKTARBEIT & REGELN (nur noch auf der Wartekarte)
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
      <div class="cyc"><div class="n">2</div><h4>Planen</h4><p>Das Projekt in kleine To-dos zerlegen, Zeit schätzen, verteilen. → <b>To-dos</b>.</p></div>
      <div class="cyc"><div class="n">3</div><h4>Arbeiten &amp; festhalten</h4><p>Karten weiterschieben, jeden Arbeitstag eintragen. → <b>Dokumentation</b>.</p></div>
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
      <h3>Jeden Arbeitstag dokumentieren</h3>
      <p>Am Ende <b>jedes Arbeitstags</b> haltet ihr in der Dokumentation fest, wer was gemacht hat und was als Nächstes kommt. Ein Eintrag kann für mehrere gelten. Ehrlich und in eigenen Worten.</p></div>
    <div class="excard">${ic('<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="10" rx="1.5"/>')}
      <h3>To-dos aktuell halten</h3>
      <p>Was ihr anfangt, kommt nach <b>In Arbeit</b>; was fertig ist, nach <b>Fertig</b>. Hängt etwas fest: nach <b>Blockiert</b> — mit einem Satz, was fehlt.</p></div>
  </div>
  <div class="cards3">
    <div class="excard alt">${ic('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>')}
      <h3>Lernen am anderen Ort</h3>
      <p>Ihr wollt für euer Projekt das <b>Schulgelände verlassen</b> — in die Bibliothek, zu jemandem nach Hause, zu einem Betrieb? Das geht nur mit einem <b>genehmigten Antrag</b>: Datum, wer mitfährt, Ziel mit Adresse, Weg und Verkehrsmittel, Begründung. Und nur, wenn eure Eltern eingewilligt haben (Stufe 1: in Kleingruppen, z. B. zu jemandem nach Hause · Stufe 2: auch an fremde Orte).</p></div>
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
      <ol><li>To-dos anschauen: Wo stehen wir?</li><li>Wer macht heute was? Karten verteilen.</li><li>Hängt etwas? → Blockiert. Müsst ihr raus? → Antrag.</li></ol></div>
    <div class="panel pad"><div class="eyebrow">Am Ende jeder Stunde</div>
      <h3 style="font-size:17px;margin-top:3px">Festhalten (5 Minuten)</h3>
      <ol><li>Karten auf den richtigen Stand schieben.</li><li>Dokumentation: Wer hat was gemacht?</li><li>Material wegräumen, Tablets laden.</li></ol></div>
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
    <div class="rowline"><div class="who">${esc(p.name)}${inPlan ? '' : `<small>${esc(gname(p))}</small>`}</div>
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
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.xcon[data-editct]')) {
    e.preventDefault(); const [xid, cid] = e.target.dataset.editct.split(':'); openContact(xid, cid);
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
  ['goal', 'work', 'hours', 'requests', 'team', 'notes', 'experts'].forEach(k => { const el = $('#view-' + k); if (el.hidden !== (k !== v)) el.hidden = k !== v; });
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
  $('#miTeachers').addEventListener('click', () => { $('#menuPop').hidden = true; openTeachers(); });
  $('#tSearch').addEventListener('input', () => { clearTimeout(tSearchTimer); tSearchTimer = setTimeout(searchTeachers, 250); });
  // Kommentare
  $('#noteAdd').addEventListener('click', addNote);
  document.addEventListener('input', e => { const id = e.target.dataset && e.target.dataset.naskin; if (id) askDraft[id] = e.target.value; });
  document.addEventListener('submit', e => {
    const f = e.target.closest && e.target.closest('[data-nask]');
    if (!f) return;
    e.preventDefault(); sendAsk(f.dataset.nask);
  });
  document.addEventListener('change', e => {
    const id = e.target.dataset && e.target.dataset.ndone;
    if (!id) return;
    if (!canWrite()) { e.target.checked = !e.target.checked; return; }
    PA.act(noteFn('done'), { p_note: id, p_done: e.target.checked });
  });
  $('#miPrint').addEventListener('click', () => { $('#menuPop').hidden = true; window.print(); });
  $('#miExport').addEventListener('click', () => { $('#menuPop').hidden = true; exportFile(); });
  $('#miImport').addEventListener('click', () => { $('#menuPop').hidden = true; $('#importFile').click(); });
  $('#miBackups').addEventListener('click', () => { $('#menuPop').hidden = true; openBackups(); });
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      let d = null;
      try { d = JSON.parse(fr.result); } catch (err) { /* unten */ }
      importData(d);
    };
    fr.readAsText(f);
  });

  // Dialoge schließen
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-close]');
    if (c) { if (c.dataset.close === 'mLog') closeLog(); else hide(c.dataset.close); return; }
    if (e.target.classList && e.target.classList.contains('scrim') && e.target.id !== 'mKey') {
      if (e.target.id === 'mLog') closeLog(); else hide(e.target.id);
    }
  });
  $('#cfOk').addEventListener('click', () => { hide('mConfirm'); const cb = confirmCb; confirmCb = null; if (cb) cb(); });

  // Klicks im Inhalt
  document.addEventListener('click', async e => {
    const t = e.target;
    let b;
    // Erklär-Kacheln ein- und ausklappen (eingeklappt: Kachel antippen klappt aus)
    if ((b = t.closest('[data-gtoggle]'))) { toggleGuide(b.dataset.gtoggle); return; }
    if ((b = t.closest('.gbox.min .gstep'))) { toggleGuide(b.closest('.gbox').dataset.g); return; }
    // Übersicht
    if ((b = t.closest('[data-plan-p]'))) { e.stopPropagation(); setPick(null); openPlan({ p_participant: b.dataset.planP }); return; }
    if ((b = t.closest('[data-plan-g]'))) { openPlan({ p_group: b.dataset.planG }); return; }
    if ((b = t.closest('[data-open]'))) { tab = (findG(b.dataset.open) || {}).open_requests ? 'requests' : 'team'; PA.setFocus(b.dataset.open); renderAll(); return; }
    if ((b = t.closest('[data-gdel]'))) {
      const g = findG(b.dataset.gdel); if (!g) return;
      ask('Gruppe auflösen?', g.plan_open
        ? 'Alle kommen zurück in die Lobby. Der Planungsraum mit Projektziel, To-dos, Dokumentation und Anträgen wird gelöscht — das lässt sich nicht rückgängig machen.'
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
    // Experten
    if ((b = t.closest('[data-newxp]'))) { openExpert(null); return; }
    if ((b = t.closest('[data-editxp]'))) { openExpert(b.dataset.editxp); return; }
    if ((b = t.closest('[data-newct]'))) { openContact(b.dataset.newct, null); return; }
    if ((b = t.closest('[data-editct]'))) { const [xid, cid] = b.dataset.editct.split(':'); openContact(xid, cid); return; }
    if ((b = t.closest('[data-cthow]'))) { if (!canWrite()) return; ctHow = b.dataset.cthow; renderContactKind(); return; }
    if ((b = t.closest('[data-xptask]'))) { openTask(null, 'todo', b.dataset.xptask); return; }
    if ((b = t.closest('[data-opentask]'))) { openTask(b.dataset.opentask); return; }
    if ((b = t.closest('[data-tkxp]'))) {
      if (!canWrite()) return;
      const prev = expertOf(tkXp), name = $('#tkName').value.trim();
      tkXp = b.dataset.tkxp;
      // „… kontaktieren" mitziehen, solange der Titel noch der vorgeschlagene ist.
      const x = expertOf(tkXp);
      if (!name || (prev && name === (prev.name || 'Experten') + ' kontaktieren'))
        $('#tkName').value = x ? (x.name || 'Experten') + ' kontaktieren' : (prev ? '' : name);
      renderTaskForm(); return;
    }
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
    if ((b = t.closest('[data-tdopen]'))) { tdOpen = !tdOpen; renderTodoPick(); return; }
    if ((b = t.closest('[data-tdopt]'))) { hTask = b.dataset.tdopt; tdOpen = false; renderTodoPick(); return; }
    if (tdOpen && !t.closest('#hTodo')) { tdOpen = false; renderTodoPick(); }
    // Antrag: wer ist dabei
    if ((b = t.closest('[data-rqwho]'))) {
      const id = b.dataset.rqwho;
      rqWho = rqWho.includes(id) ? rqWho.filter(x => x !== id) : rqWho.concat(id);
      renderReqWho(); return;
    }
    // Stunden: wer war dabei
    if ((b = t.closest('[data-hwho]'))) {
      const id = b.dataset.hwho;
      const cur = hWho || [];
      hWho = cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id);
      renderLogWho(); return;
    }
    // Backups (Lehrkraft)
    if ((b = t.closest('[data-bk]'))) { backupAction(b.dataset.bk, b.dataset.id); return; }
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
    if ((b = t.closest('[data-notify]'))) { openNotify(); return; }
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
    if ((b = t.closest('[data-newlog]'))) { openLog(); return; }
    if ((b = t.closest('[data-logedit]'))) { editLogEntry(b.dataset.logedit); return; }
    if ((b = t.closest('[data-hpadd]'))) { $('#hPhotoIn').click(); return; }
    if ((b = t.closest('[data-hpx]'))) { hPhotos.splice(+b.dataset.hpx, 1); renderLogPhotos(); return; }
    if ((b = t.closest('[data-zoom]'))) {
      const [lid, i] = b.dataset.zoom.split(':');
      const src = logPhotos(PA.get('log', lid) || {})[+i];
      if (src) { $('#phBig').src = src; show('mPhoto'); }
      return;
    }
    if ((b = t.closest('[data-phdel]'))) {
      if (!PA.owner) return;
      const [lid, i] = b.dataset.phdel.split(':');
      ask('Foto löschen?', 'Das Foto verschwindet aus der Dokumentation — für alle und auch auf dem Server. Der Eintrag selbst bleibt.', () => {
        const l = PA.get('log', lid); if (!l) return;
        const ph = logPhotos(l); ph.splice(+i, 1);
        const d = Object.assign({}, l, { photos: ph });
        if (!ph.length) delete d.photos;
        PA.put('log', lid, d);
        toast('Foto gelöscht'); renderAll();
      }, 'Löschen');
      return;
    }
    if ((b = t.closest('[data-logdel]'))) {
      const id = b.dataset.logdel;
      ask('Eintrag löschen?', 'Der Eintrag verschwindet aus der Dokumentation.', () => { PA.del('log', id); if (editLog === id) resetLogForm(); renderAll(); }, 'Löschen');
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
    // Kommentare
    if ((b = t.closest('[data-ncolor]'))) { noteColor = b.dataset.ncolor; renderNotes(); return; }
    if ((b = t.closest('[data-nf]'))) { noteFilter = b.dataset.nf; renderNotes(); return; }
    if ((b = t.closest('[data-ndel]'))) {
      const id = b.dataset.ndel;
      ask('Kommentar löschen?', 'Der Zettel verschwindet für die Gruppe und alle Lehrkräfte — mit den Nachfragen darunter.',
        () => PA.act('pa_room_note_delete', { p_note: id }), 'Löschen');
      return;
    }
    if ((b = t.closest('[data-nrdel]'))) {
      const [nid, rid] = b.dataset.nrdel.split(':');
      ask('Nachricht löschen?', 'Sie verschwindet unter dem Kommentar.', () => PA.act(noteFn('reply_delete'), { p_note: nid, p_reply: rid }), 'Löschen');
      return;
    }
    // Lehrkräfte
    if ((b = t.closest('[data-tadd]'))) { addTeacher(b.dataset.tadd, b.dataset.name); return; }
    if ((b = t.closest('[data-tdel]'))) { removeTeacher(b.dataset.tdel); return; }
    if ((b = t.closest('[data-tinvite]'))) { openTeachers(); return; }
  });

  $('#pickCancel').addEventListener('click', () => setPick(null));

  // Projektziel
  $('#goalTitle').addEventListener('input', goalChanged);
  // Zeitbalken: Stunden bis zum Ende
  document.addEventListener('change', e => { if (e.target.id === 'budIn') saveBudget(); });
  document.addEventListener('keydown', e => { if (e.target.id === 'budIn' && e.key === 'Enter') e.target.blur(); });
  $('#goalDue').addEventListener('change', () => { renderDueHint($('#goalDue').value); goalChanged(); saveGoal(); });
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
  $('#tkEst').addEventListener('keydown', e => { if (e.key === 'Enter') saveTask(); });
  $('#tkCol').addEventListener('change', renderTaskForm);
  $('#tkDel').addEventListener('click', () => {
    const id = editTask; if (!id) return;
    ask('To-do löschen?', 'Die Karte verschwindet aus der To-do-Übersicht.', () => { hide('mTask'); PA.del('task', id); renderAll(); }, 'Löschen');
  });

  // Experten
  $('#xpSave').addEventListener('click', saveExpert);
  $('#xpName').addEventListener('keydown', e => { if (e.key === 'Enter') saveExpert(); });
  $('#xpDel').addEventListener('click', () => {
    const id = editXp, x = expertOf(id); if (!x) return;
    ask(`${x.name || 'Experten'} löschen?`, 'Die Kontakte und Infos zu dieser Person gehen verloren. To-dos bleiben stehen.', () => {
      hide('mExpert'); PA.del('task', id); renderAll();
    }, 'Löschen');
  });
  $('#ctSave').addEventListener('click', saveContact);
  $('#ctDel').addEventListener('click', () => {
    const x = expertOf(ctXp), id = ctId; if (!x || !id) return;
    ask('Kontakt löschen?', 'Der Eintrag mit den Infos verschwindet.', () => {
      hide('mContact');
      PA.put('task', x.id, Object.assign({}, x, { contacts: (x.contacts || []).filter(k => k.id !== id) }));
      renderAll();
    }, 'Löschen');
  });

  // Stunden
  $('#hSave').addEventListener('click', saveLog);
  $('#hPhotoIn').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!canWrite()) return;
    if (files.length > 3 - hPhotos.length) toast('Höchstens 3 Fotos je Eintrag');
    files.slice(0, Math.max(0, 3 - hPhotos.length)).forEach(f => shrinkPhoto(f, url => {
      if (hPhotos.length >= 3) return;
      hPhotos.push(url); renderLogPhotos();
    }));
  });
  $('#hCancel').addEventListener('click', closeLog);

  // Antrag
  $('#btnNewReq').addEventListener('click', () => openReq(null));
  $('#rqSave').addEventListener('click', saveReq);

  // Team: Name (nur Schüler)
  $('#teamNameIn').addEventListener('change', e => {
    if (PA.owner || !canWrite()) return;
    PA.act('pa_group_rename', { p_name: e.target.value.trim() });
  });
  $('#teamNameIn').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

  // Regeln
  $('#rulesSave').addEventListener('click', async () => {
    const r = await PA.act('pa_room_rules', { p_rules: $('#rulesIn').value });
    if (r) { hide('mRules'); toast('Regeln gespeichert'); }
  });

  // Mail bei neuen Anträgen
  $('#ntSave').addEventListener('click', async () => {
    const mail = $('#ntMail').value.trim();
    if (!mail) { toast('Bitte deine IServ-Adresse eintragen.'); return; }
    const on = $('#ntOn').checked;
    const changed = !notify || mail.toLowerCase() !== (notify.email || '');
    if (await saveNotify({ p_email: mail, p_on: on }, changed ? null : (on ? 'Mails für diesen Raum sind an.' : 'Mails für diesen Raum sind aus.'))) {
      hide('mNotify');
    }
  });
  $('#ntMail').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ntSave').click(); });
  $('#ntResend').addEventListener('click', () => saveNotify({ p_resend: true }, 'Bestätigungsmail ist noch einmal unterwegs.'));
  $('#ntDel').addEventListener('click', () => {
    hide('mNotify');
    ask('Adresse entfernen?', 'Danach kommen in keinem Raum mehr Mails über Anträge. Wieder eintragen geht jederzeit.', async () => {
      await saveNotify({ p_email: '' }, 'Adresse entfernt — keine Mails mehr.');
    }, 'Entfernen');
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

/* ── Mail bei neuen Anträgen (0203) ──────────────────────────
   Die Adresse gilt je Lehrkraft (einmal eintragen, per Link aus der
   ersten Mail bestätigen), der Haken je Raum. Nur @mps-ki.de — die
   Mails bleiben in IServ. Verschickt wird 5 Minuten gebündelt. */
let notify = null, notifyLoading = false, notifyTried = false;

function notifyBtn() {
  const n = notify;
  const on = n && n.enabled && n.email;
  const lbl = !n ? 'Mail bei Anträgen'
    : on && n.verified ? 'Mail bei Anträgen: an'
    : on ? 'Mail: Bestätigung offen'
    : 'Mail bei Anträgen: aus';
  return `<button class="btn sm${on && n.verified ? ' primary' : ''}" data-notify title="Eine Mail bekommen, wenn eine Gruppe einen Antrag stellt">${on ? '🔔' : '🔕'} ${lbl}</button>`;
}

async function loadNotify() {
  if (notifyLoading) return;
  notifyLoading = notifyTried = true;
  const r = await PA.call('pa_room_notify_get', {});
  notifyLoading = false;
  // Fehlt die Migration, bleibt der Knopf einfach neutral.
  if (r && r.ok) { notify = r; if (mode() === 'overview') renderOverview(); }
}

function renderNotify() {
  const n = notify || {};
  const st = $('#ntState');
  if (!n.email) {
    st.className = 'nt-state';
    st.textContent = 'Noch keine Adresse eingetragen.';
  } else if (n.verified) {
    st.className = 'nt-state ok';
    st.textContent = `✓ ${n.email} ist bestätigt.`;
  } else {
    st.className = 'nt-state wait';
    st.textContent = `Bestätigung offen: Wir haben an ${n.email} eine Mail mit einem Link geschickt. Erst nach dem Klick darauf kommen Mails.`;
  }
  $('#ntResend').hidden = !(n.email && !n.verified);
  $('#ntDel').hidden = !n.email;
}

async function openNotify() {
  if (!notify) await loadNotify();
  if (!notify) { toast(PA.msg('fn_missing_mail')); return; }
  $('#ntMail').value = notify.email || '';
  $('#ntOn').checked = !!notify.enabled || !notify.email;
  renderNotify();
  show('mNotify');
  if (!notify.email) setTimeout(() => $('#ntMail').focus(), 60);
}

async function saveNotify(args, say) {
  const r = await PA.call('pa_room_notify_set', args);
  if (!r || !r.ok) { toast(PA.msg(r && r.error)); return false; }
  const wasMail = notify && notify.email;
  notify = r;
  renderNotify();
  renderOverview();
  if (say) toast(say);
  else if (r.email && !r.verified && r.email !== wasMail) toast(`Bestätigungsmail an ${r.email} ist unterwegs.`);
  return true;
}

function openRules() {
  $('#rulesIn').value = (V().room && V().room.rules) || '';
  show('mRules');
  setTimeout(() => $('#rulesIn').focus(), 60);
}

/* ════════════════════════════════════════════════════════════
   EXPORT · IMPORT · BACKUPS (Lehrkraft, 0202)
   ════════════════════════════════════════════════════════════
   Eine Datei: { format: 'projektarbeit', version: 1, projects: [ … ] }.
   Im Planungsraum: dieses eine Projekt. In der Übersicht: alle. */
const fileBase = s => String(s || 'projekt').replace(/[^a-z0-9äöüß ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'projekt';
const fmtAt = t => new Date(t).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function downloadJson(data, base) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

async function exportFile() {
  if (!PA.owner) return;
  const inPlan = mode() === 'plan';
  const res = await PA.call('pa_room_export', { p_group: inPlan ? PA.focus : null });
  if (!res || !res.ok) { toast(PA.msg(res && res.error)); return; }
  const name = inPlan ? (goalObj().title || gTitle(group(), members())) : ((V().room && V().room.title) || 'klasse');
  downloadJson(res.data, 'projektarbeit-' + fileBase(name) + '-' + todayIso());
  toast(inPlan ? 'Projekt exportiert' : `${res.data.projects.length} Projekte exportiert`);
}

function importData(d) {
  if (!PA.owner) return;
  const projects = d && d.format === 'projektarbeit' && Array.isArray(d.projects)
    ? d.projects.filter(p => p && Array.isArray(p.items)) : null;
  if (!projects || !projects.length) { toast('⚠ Das ist keine Datei aus der Projektarbeit.'); return; }
  if (mode() === 'plan') {
    // In einen Planungsraum passt genau ein Projekt — bei einer Klassen-
    // Datei das mit derselben Gruppe.
    const p = projects.length === 1 ? projects[0] : projects.find(x => x.group === PA.focus);
    if (!p) { toast('Die Datei enthält mehrere Projekte — bitte in der Gruppen-Übersicht importieren.'); return; }
    const nm = gTitle(group(), members());
    ask('Projekt ersetzen?', `Projektziel, To-dos, Dokumentation und Anträge von „${nm}“ werden durch die Datei${p.name ? ' („' + p.name + '“)' : ''} ersetzt. Die Mitglieder der Gruppe bleiben. Vorher entsteht ein Backup des jetzigen Stands.`,
      () => runImport([p], PA.focus), 'Ersetzen');
    return;
  }
  const known = new Set((V().groups || []).map(g => g.id));
  const hit = projects.filter(p => known.has(p.group)).length;
  ask(`${projects.length === 1 ? 'Projekt' : projects.length + ' Projekte'} importieren?`,
    (hit ? `${hit} ${hit === 1 ? 'Gruppe bekommt' : 'Gruppen bekommen'} den Stand aus der Datei (ihr jetziger Inhalt wird ersetzt). ` : '')
    + (projects.length - hit ? `${projects.length - hit} ${projects.length - hit === 1 ? 'Projekt wird eine neue Gruppe' : 'Projekte werden neue Gruppen'} — noch ohne Mitglieder; zieht die Personen dann hinein. ` : '')
    + 'Alle anderen Gruppen bleiben, wie sie sind. Vorher entsteht ein Backup.',
    () => runImport(projects, null), 'Importieren');
}

async function runImport(projects, target) {
  const slim = projects.map(p => ({ group: p.group || null, name: p.name || '', items: p.items }));
  const r = await PA.act('pa_room_import', { p_projects: slim, p_target: target });
  if (r) toast(target ? 'Projekt eingespielt' : `Eingespielt${r.created ? ` · ${r.created} neue ${r.created === 1 ? 'Gruppe' : 'Gruppen'}` : ''}`);
}

async function openBackups() {
  if (!PA.owner) return;
  const inPlan = mode() === 'plan';
  $('#backupScope').innerHTML = inPlan
    ? `„Einspielen“ holt hier nur <b>dieses Projekt</b> (${esc(gTitle(group(), members()))}) aus dem Backup zurück.`
    : '„Einspielen“ setzt <b>alle Projekte</b> aus dem Backup zurück. Eine inzwischen aufgelöste Gruppe kommt als neue Gruppe (ohne Mitglieder) wieder; Gruppen, die später entstanden sind, bleiben unberührt.';
  $('#backupList').innerHTML = '<p style="color:var(--ink-3);font-size:13px">Lädt …</p>';
  show('mBackup');
  const res = await PA.call('pa_room_backups', {});
  const list = res && res.ok ? res.backups : null;
  $('#backupList').innerHTML = list === null
    ? `<p style="color:var(--ink-3);font-size:13px">⚠ ${esc(PA.msg(res && res.error))}</p>`
    : list.length ? list.map(b => `
      <div class="rowline"><div class="who">${esc(fmtAt(b.at))}
          <small>${b.kind === 'auto' ? 'automatisch (wöchentlich)' : 'vor Änderung'} · ${b.projects} ${b.projects === 1 ? 'Projekt' : 'Projekte'}, ${b.items} Einträge</small></div>
        <div class="acts">
          <button class="btn sm" data-bk="dl" data-id="${esc(b.id)}">Herunterladen</button>
          <button class="btn sm" data-bk="restore" data-id="${esc(b.id)}">Einspielen</button>
        </div></div>`).join('')
    : '<p style="color:var(--ink-3);font-size:13px">Noch kein Backup. Das erste entsteht, sobald ein Planungsraum Inhalt hat und im Raum gearbeitet wird.</p>';
}

async function backupAction(act, id) {
  if (!PA.owner) return;
  if (act === 'dl') {
    const r = await PA.call('pa_room_backup_get', { p_id: id });
    if (!r || !r.ok) { toast(PA.msg(r && r.error)); return; }
    downloadJson(r.data, 'projektarbeit-backup-' + isoOf(new Date(r.at)));
    return;
  }
  const inPlan = mode() === 'plan';
  hide('mBackup');
  ask('Dieses Backup einspielen?', inPlan
    ? `Projektziel, To-dos, Dokumentation und Anträge von „${gTitle(group(), members())}“ werden durch den Stand aus dem Backup ersetzt. Vorher entsteht ein Backup des jetzigen Stands.`
    : 'Alle Projekte aus dem Backup werden auf dessen Stand zurückgesetzt. Vorher entsteht ein Backup des jetzigen Stands.',
    async () => {
      const r = await PA.act('pa_room_backup_restore', { p_id: id, p_group: inPlan ? PA.focus : null });
      if (r) toast('Backup eingespielt');
    }, 'Einspielen');
}

/* ── Start ───────────────────────────────────────────────── */
wire();
$('#hDate').value = todayIso();
resetLogForm();
PA.start();
