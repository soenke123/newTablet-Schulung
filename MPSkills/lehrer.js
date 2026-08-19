/* ══════════════════════════════════════════════════════════════
   MPSkills — lehrer.js   ·   Die Raumseite (drei Reiter)
   ══════════════════════════════════════════════════════════════
   Der Hash entscheidet:
     lehrer.html#K7F2QM   ein bestehender Raum
     lehrer.html?new=x    ein Raum, den es noch nicht gibt
     lehrer.html          nichts von beidem — weiter zur Landing

   ── Warum drei Reiter (Umbau 18.08.2026) ──────────────────────
   Vorher stand alles untereinander auf einer Seite: Kopfzeile,
   dann QR und Code in voller Breite, dann das Werkzeug. Der
   QR-Code nahm damit dauerhaft den halben Beamer, und das
   Werkzeug — die eigentliche Stunde — bekam den Rest. Der
   Umschalter „Code ausblenden" war die Notlösung dafür und hat
   das Grundproblem nur verschoben.

   Jetzt hat jede der drei Fragen ihr eigenes Fach:

     1 Einstellungen  Wie heißt der Raum, mit oder ohne Namen,
                      und was will das Werkzeug wissen. Ist der
                      Raum noch nicht angelegt, ist das das
                      einzige offene Fach — der Anlege-Dialog von
                      früher ist genau dieses Fach und deshalb
                      ersatzlos weg.
     2 Onboarding     QR, Code, Adresse, wer schon da ist,
                      Beitritt auf/zu, Teilnehmer verwalten.
     3 <Werkzeug>     Die Bühne. Darüber nichts als die
                      MPSkills-Kopfzeile und die Reiterleiste
                      mit dem Code.

   Für Nachzügler hängt im dritten Fach eine Tür am rechten
   Bildschirmrand: ein Griff mit QR-Zeichen, der den Code
   ausfährt, ohne dass die Klasse ihre Ansicht verliert. Genau
   dafür — nicht als zweite Anzeige des Onboardings.

   ── Die Beamer-Ansicht ist die Seite mit den härtesten
      Anforderungen im ganzen Projekt ──────────────────────────
   Sie steht eine Doppelstunde offen, während 28 Tablets daran
   hängen, und niemand lädt sie neu, während die Klasse zusieht.
   Daraus folgt dreierlei:

     · Der Access-Token wird bei JEDEM Aufruf frisch aus
       window.__accessToken gelesen und nie in einer Closure
       festgehalten. Nach 60 Minuten erneuert das SDK ihn im
       Hintergrund (session.js reicht ihn seit Stufe 3 durch) —
       eine festgehaltene Kopie wäre ab da tot.
     · Ein Netzfehler räumt die Anzeige nicht ab. Was zuletzt da
       war, bleibt stehen; der Poller versucht es weiter.
     · Der QR-Code wird je Ziel genau einmal gezeichnet und nicht
       bei jedem Poll — er ändert sich nie, und ein flackernder
       QR-Code lässt sich nicht scannen.

   Was das Werkzeug im dritten Fach tut, geht diese Datei nichts
   an; sie weiß nur, wo es hingehört und wann es neue Daten
   bekommt (siehe lib/tool.js).
   ══════════════════════════════════════════════════════════════ */

'use strict';

const esc  = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
const host = () => document.getElementById('lehrerHost');
const $    = (id) => document.getElementById(id);

let poller   = null;
let tool     = null;   // geladenes Werkzeug-Modul, solange eines montiert ist
// Das Laden ist asynchron, der Poller nicht: ohne diesen Riegel käme
// der nächste Takt, während noch geladen wird, fände tool === null und
// montierte ein zweites Mal — doppeltes DOM, doppelte Listener.
let toolBusy = false;

/* Alles, was die Seite über ihren Raum weiß. Eine Ablage statt
   sieben Modulvariablen: route() räumt sie in einem Rutsch auf, und
   beim Lesen ist ohne Suchen klar, woher ein Wert kommt. */
const S = {
  code:    null,   // null = der Raum wird gerade erst angelegt
  view:    null,   // letzte vollständige Antwort von skill_room_get
  pane:    'set',
  tools:   {},     // nur im Anlege-Modus: was zur Auswahl steht
  toolId:  null,   // im Anlege-Modus das gewählte, sonst das des Raums
  fields:  [],     // settingsFields des Werkzeugs
  groups:  {},     // Feldschlüssel → [{id, text}] für Listenfelder
  counts:  { people: 0, entries: 0 },   // woran die Sperren hängen
  setStale: false, // Sperren haben sich geändert, Fach 1 muss neu gezeichnet werden
  qrDrawn: {}      // Ziel-Element-ID → Code, für den dort schon ein QR steht
};

/* ─── Toast ───────────────────────────────────────────────── */
let toastTimer = null;
function toast(message, kind) {
  const el = $('toast');
  el.textContent = message;
  el.className = 'toast show' + (kind === 'error' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

/* ─── Serveraufruf ────────────────────────────────────────── */
// Bewusst kein zwischengespeicherter Token: siehe Kopfkommentar.
async function trpc(fn, args) {
  const token = window.__accessToken;
  if (!token) throw new Error('nicht angemeldet');
  const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: window.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(args || {})
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const ERRORS = {
  not_authenticated: 'Du bist nicht angemeldet.',
  not_a_teacher:     'Dein Konto ist für MPSkills nicht freigeschaltet.',
  not_found:         'Diesen Raum gibt es nicht (mehr).',
  tool_unknown:      'Diesen Skill gibt es nicht.',
  tool_inactive:     'Dieser Skill ist abgeschaltet — neue Räume gibt es dafür nicht.',
  title_required:    'Der Raum braucht einen Titel.',
  title_too_long:    'Der Titel ist zu lang (höchstens 60 Zeichen).',
  single_room_only:  'Von diesem Skill ist nur ein Raum gleichzeitig möglich.',
  code_collision:    'Es ließ sich gerade kein freier Code finden. Bitte noch einmal.',
  no_profile:        'Zu deinem Zugang fehlt das Profil.',
  not_deletable:     'Das kannst du nicht löschen — blende es aus, wenn es stören soll.',
  not_editable:      'Das lässt sich nicht mehr ändern, nur löschen und neu schreiben.',
  phase_invalid:     'Diese Phase gibt es bei diesem Skill nicht.',
  payload_too_big:   'Das ist zu viel auf einmal.',
  invalid_input:     'Damit stimmt etwas nicht.',
  // Die beiden Sperren aus Migration 0084. Sie sind keine Fehler,
  // sondern eine Auskunft — deshalb sagen sie auch, warum.
  has_participants:  'Das geht nicht mehr: es sind schon Leute im Raum. '
                   + 'Wer beigetreten ist, hat seinen Namen unter der Ansage abgegeben, die damals galt.',
  has_entries:       'Das geht nicht mehr: im Raum steht schon etwas. '
                   + 'Sonst antworten die Beiträge auf eine andere Frage als die, die oben steht.',
  // Die gruppenfeine Sperre aus 0086. Sie trifft genau eine Frage,
  // nicht das ganze Formular — deshalb sagt sie auch das.
  group_has_entries: 'Darunter liegen schon Beiträge. Solange die dastehen, bleibt die Frage, '
                   + 'wie sie ist — sonst antworten sie auf etwas anderes.',
  groups_required:   'Mindestens eine Frage muss stehen bleiben.',
  groups_invalid:    'Mit den Fragen stimmt etwas nicht.',
  too_many_groups:   'Mehr Fragen gehen in einem Raum nicht.'
};
const errText = (e, data) =>
  e === 'room_limit'
    ? `Du hast schon ${data?.live ?? ''} von ${data?.max ?? ''} Räumen dieses Skills. `
      + 'Lösche einen, den du nicht mehr brauchst.'
    : (ERRORS[e] || 'Das hat nicht geklappt.');


/* ══════════════════════════════════════════════════════════
   Die Reiterleiste und ihre drei Fächer
   ══════════════════════════════════════════════════════════ */
/* Welches Fach zuletzt offen war, liegt je Code im sessionStorage:
   auf einem geteilten Lehrer-Tablet soll die Wahl mit dem Tab
   verschwinden, wie schon bei der alten Tür und beim Kurs-Wähler
   im Reality-Check-Board.

   Vorgabe ist das Onboarding und nicht das Werkzeug: wer einen Raum
   aufmacht, will als Erstes den Code zeigen. Wer mitten in der
   Stunde neu lädt, findet sein Fach von vorhin wieder. */
const paneKey = (code) => 'mpskills_pane_' + code;

function readPane(code) {
  try {
    const v = sessionStorage.getItem(paneKey(code));
    return (v === 'set' || v === 'onb' || v === 'tool') ? v : 'onb';
  } catch (e) { return 'onb'; }
}

function showPane(which) {
  S.pane = which;
  if (S.code) { try { sessionStorage.setItem(paneKey(S.code), which); } catch (e) {} }

  /* Beim Betreten des ersten Fachs neu zeichnen, wenn sich inzwischen
     eine Sperre geändert hat (jemand ist beigetreten, der erste
     Beitrag steht da). NICHT sofort beim Poll: das Fach kann offen
     sein und jemand darin tippen — ein Neuaufbau kostete das
     Getippte. */
  if (which === 'set' && S.setStale) { S.setStale = false; renderSettings(); }

  document.querySelectorAll('.rtab').forEach(b => {
    const on = b.dataset.pane === which;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  for (const [id, key] of [['paneSet', 'set'], ['paneOnb', 'onb'], ['paneTool', 'tool']]) {
    const el = $(id);
    if (el) el.hidden = (key !== which);
  }

  // Die Tür am Rand gehört dem Werkzeug-Fach. Im Onboarding steht der
  // Code ohnehin groß da, in den Einstellungen hat er nichts zu suchen.
  const fly = $('qrFly');
  if (fly) {
    fly.hidden = (which !== 'tool' || !S.code);
    if (which !== 'tool') closeFly();
  }
  document.body.classList.toggle('pane-tool', which === 'tool');

  /* Ein ausgeblendetes Fach hat keine Maße. Das Werkzeug rechnet
     seine Fläche aber aus dem, was über ihm steht — es muss also
     nachmessen, sobald es wieder sichtbar ist. Dasselbe Signal wie
     früher beim Ein- und Ausklappen der Tür. */
  if (which === 'tool') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

/* Das Gerüst. Steht für beide Fälle — bestehender Raum wie neuer —,
   nur dass im Anlege-Modus die Fächer 2 und 3 noch zu sind: es gibt
   ja noch keinen Code zu zeigen und keinen Raum, in dem etwas
   stattfindet. */
function renderShell() {
  const creating = !S.code;
  const t = S.view?.room;
  const toolLabel = t
    ? `${t.tool_icon || '🧩'} ${t.tool_title || 'Skill'}`
    : (S.tools[S.toolId]
        ? `${S.tools[S.toolId].icon || '🧩'} ${S.tools[S.toolId].title}`
        : 'Skill');

  /* „beamer" ist der Marker für „hier schaut eine Klasse drauf" — die
     Werkzeuge hängen ihre Beamer-Feinheiten daran (mehr Schrift, keine
     Berührungs-Kleinigkeiten, siehe tools/wordcloud/tool.css). Er
     gehört der ganzen Lehrerseite und nicht nur dem dritten Fach:
     auch der Code im Onboarding wird aus der letzten Reihe gelesen. */
  document.body.classList.add('roomview', 'beamer');

  host().innerHTML = `
    <nav class="rtabs" aria-label="Raum">
      <div class="rtabs-tabs" role="tablist">
        <button type="button" class="rtab" role="tab" data-pane="set" aria-selected="false">
          <span class="rtab-n">1</span><span class="rtab-t">Einstellungen</span></button>
        <button type="button" class="rtab" role="tab" data-pane="onb" aria-selected="false"
                ${creating ? 'disabled title="Erst den Raum anlegen."' : ''}>
          <span class="rtab-n">2</span><span class="rtab-t">Onboarding</span></button>
        <button type="button" class="rtab" role="tab" data-pane="tool" aria-selected="false"
                ${creating ? 'disabled title="Erst den Raum anlegen."' : ''}>
          <span class="rtab-n">3</span><span class="rtab-t" id="rtToolName">${esc(toolLabel)}</span></button>
      </div>
      <div class="rtabs-side">
        ${creating ? '' : `<code class="rtabs-code" id="rtCode" title="Code dieses Raums">${esc(S.code)}</code>`}
        <button type="button" class="rtabs-fs" id="fsBtn" title="Vollbild" aria-label="Vollbild">⛶</button>
      </div>
    </nav>

    <div class="msg msg--err rpane-err" id="bErr" hidden></div>

    <section class="rpane rpane--form" id="paneSet" role="tabpanel" hidden></section>
    <section class="rpane" id="paneOnb" role="tabpanel" hidden></section>
    <section class="rpane rpane--tool" id="paneTool" role="tabpanel" hidden>
      <div class="beam-tool" id="bTool"></div>
    </section>

    ${creating ? '' : flyHTML()}`;

  document.querySelectorAll('.rtab').forEach(b => {
    b.addEventListener('click', () => { if (!b.disabled) showPane(b.dataset.pane); });
  });
  $('fsBtn').addEventListener('click', toggleFullscreen);
  if (!creating) wireFly();
}


/* ══════════════════════════════════════════════════════════
   Fach 1 — Einstellungen
   ══════════════════════════════════════════════════════════
   Dasselbe Formular für „neuer Raum" und „bestehender Raum". Der
   Unterschied ist nur, was noch änderbar ist — und das entscheidet
   der Server (Migration 0084), nicht diese Datei:

     Titel      immer
     Namen      nur, solange niemand beigetreten ist
     Skill-
     Angaben    nur, solange kein Beitrag da ist

   Gesperrte Felder bleiben SICHTBAR und werden nur unbedienbar.
   Ein verschwundenes Feld beantwortet die Frage „wo ist die Frage
   hin?" nicht — ein graues mit einer Zeile Begründung schon.

   ── Zwei Blöcke, sonst nichts (19.08.2026) ─────────────────────
   Das Fach stand vorher als eine lange Spalte da, und unter jedem
   Feld hing ein Satz, der erklärte, was das Feld ohnehin sagt.
   Bei drei Feldern liest man den ersten und überspringt den Rest,
   und das Wenige, das wirklich erklärt werden muss, geht darin
   unter. Jetzt gilt:

     · Oben, in EINEM Rahmen: Titel · Skill · Namensabfrage. Das
       sind die allgemeinen Angaben zum Raum, und dass sie
       zusammengehören, sagt der Rahmen — es steht nirgends.
     · Darunter, ohne Rahmen: was der Skill selbst wissen will.
       Hier kann sich noch etwas ändern, oben nicht mehr.

   Erklärungstexte gibt es keine. Die einzige Ausnahme sind die
   Begründungen unter gesperrten Feldern: die stehen nur da, wenn
   etwas nicht mehr geht, und beantworten dann die einzige Frage,
   die in dem Moment offen ist. */

/* ── Was das Skill wissen will ────────────────────────────────
   Drei Feldarten, und alle drei stehen hier und nicht im Skill:
   ein Werkzeug beschreibt, WAS es braucht, diese Datei weiß, wie
   ein Formularfeld aussieht.

     text   ein Wert. Die Urform.
     list   mehrere gleichartige Werte mit „+"-Knopf — bei WordPool
            die Fragen. Jeder Eintrag trägt eine id, die ihn
            überlebt: daran hängen die Beiträge (Migration 0086),
            und daran hängt, ob er noch änderbar ist.
     quota  eine Zahl oder nichts. Leer ist keine fehlende Angabe,
            sondern die Antwort „unbegrenzt" — deshalb steht sie im
            Platzhalter und nicht in einem Erklärungssatz. */

// Die Grenzen, die für dieses Skill gelten. Beim bestehenden Raum
// kommen sie aus der Ansicht (dort schon mit Raum-Überschreibung),
// beim neuen aus der Werkzeug-Liste.
const toolLimits = () => S.view?.limits || S.tools[S.toolId]?.limits || {};

/* Wie viele Beiträge liegen unter jeder Gruppe? Aus der Antwort der
   Lehrkraft-Ansicht gezählt (sie enthält auch die ausgeblendeten,
   0080) — ein eigener Aufruf dafür wäre eine zweite Quelle für
   dieselbe Auskunft. */
function groupCounts() {
  const fld = toolLimits().group_field;
  const out = {};
  if (!fld) return out;
  for (const e of (S.view?.entries || [])) {
    const g = e.payload?.[fld];
    if (g) out[g] = (out[g] || 0) + 1;
  }
  return out;
}

// Kurz, unverwechselbar und ohne Zähler: eine id, die aus der
// Position käme, würde beim Löschen eines Eintrags von einem anderen
// geerbt — und mit ihr dessen Beiträge.
const newGroupId = () =>
  'q' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

function listRowHTML(f, item, locked, n) {
  return `
    <div class="listrow${locked ? ' is-locked' : ''}" data-row="${esc(f.key)}">
      <span class="listrow-n">${n}</span>
      <input type="text" data-setting-item="${esc(f.key)}" data-gid="${esc(item.id)}" data-req
             maxlength="${Number(f.maxlength) || 140}"
             placeholder="${esc(f.placeholder || '')}"
             value="${esc(item.text || '')}" ${locked ? 'disabled' : ''}
             aria-label="${esc(f.itemLabel || f.label)} ${n}" />
      <button type="button" class="listrow-del" data-del="${esc(item.id)}"
              ${locked ? 'disabled' : ''}
              title="${locked ? 'Darunter liegen schon Beiträge.' : 'Entfernen'}"
              aria-label="${esc(f.itemLabel || f.label)} ${n} entfernen">✕</button>
    </div>`;
}

function listHTML(f) {
  const counts = groupCounts();
  const items  = S.groups[f.key] || [];
  const max    = Number(f.max) || 7;
  const anyLocked = items.some(it => counts[it.id] > 0);

  return `
    <div class="field field--list" data-list="${esc(f.key)}">
      <span class="field-l">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</span>
      <div class="listrows" id="rows_${esc(f.key)}">
        ${items.map((it, i) => listRowHTML(f, it, counts[it.id] > 0, i + 1)).join('')}
      </div>
      <button type="button" class="listadd" data-add="${esc(f.key)}"
              ${items.length >= max ? 'disabled' : ''}>
        ${esc(f.addLabel || '+ ' + (f.itemLabel || 'Eintrag'))}
      </button>
      ${items.length >= max
        ? `<p class="lockline">Mehr als ${max} ${esc(f.label)} gehen in einem Raum nicht.</p>` : ''}
      ${anyLocked
        ? '<p class="lockline">Wo schon Zettel liegen, bleibt die Frage stehen.</p>' : ''}
    </div>`;
}

function toolFieldsHTML(locked) {
  if (!S.fields.length) return '';
  const cur = S.view?.room?.settings || {};

  return S.fields.map(f => {
    if (f.type === 'list') return listHTML(f);

    if (f.type === 'quota') {
      const v = Number(cur[f.key]) || 0;
      return `
    <label class="field field--quota">${esc(f.label)}
      <input type="number" data-setting-num="${esc(f.key)}"
             min="${Number(f.min) || 1}" max="${Number(f.max) || 100}" step="1"
             placeholder="${esc(f.unlimitedLabel || 'unbegrenzt')}"
             value="${v > 0 ? v : ''}" />
    </label>`;
    }

    const val = cur[f.key] != null ? cur[f.key] : (S.code ? '' : (f.default || ''));
    return `
    <label class="field">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}
      <input type="text" data-setting="${esc(f.key)}" ${f.required ? 'data-req' : ''}
             maxlength="${Number(f.maxlength) || 140}"
             placeholder="${esc(f.placeholder || '')}"
             value="${esc(val)}"
             ${locked ? 'disabled' : ''} />
    </label>`;
  }).join('');
}

/* Die Listen liegen in S.groups und nicht im DOM: eine Zeile, die
   gerade hinzugefügt wurde, hat noch keinen gespeicherten Wert, und
   beim Neuzeichnen (Sperre dazugekommen) darf sie trotzdem nicht
   verschwinden. Aufgefüllt wird aus den Einstellungen des Raums —
   oder mit einer leeren Zeile, denn eine Liste ohne Zeile hat kein
   Feld, in das man tippen könnte. */
function seedGroups() {
  S.groups = {};
  const cur = S.view?.room?.settings || {};
  for (const f of S.fields) {
    if (f.type !== 'list') continue;
    const raw = Array.isArray(cur[f.key]) ? cur[f.key] : [];
    const items = raw
      .filter(it => it && it.id)
      .map(it => ({ id: String(it.id), text: String(it.text || '') }));
    S.groups[f.key] = items.length ? items : [{ id: newGroupId(), text: '' }];
  }
}

// Was gerade in den Feldern steht, zurück in S.groups — vor jedem
// Neuzeichnen der Liste, sonst wäre das Getippte weg.
function harvestGroups() {
  for (const f of S.fields) {
    if (f.type !== 'list') continue;
    const items = S.groups[f.key] || [];
    document.querySelectorAll(`[data-setting-item="${f.key}"]`).forEach(el => {
      const it = items.find(x => x.id === el.dataset.gid);
      if (it && !el.disabled) it.text = String(el.value || '');
    });
  }
}

function redrawList(key) {
  const f = S.fields.find(x => x.key === key);
  const box = document.querySelector(`[data-list="${key}"]`);
  if (!f || !box) return;
  harvestGroups();
  box.outerHTML = listHTML(f);
  updateGo();
}

function renderSettings() {
  const pane = $('paneSet');
  const creating = !S.code;
  const room = S.view?.room;

  // Was gerade im Formular steht, retten: diese Funktion wird auch
  // aufgerufen, während jemand tippt (eine Sperre ist dazugekommen,
  // der Server hat eine Änderung abgelehnt).
  harvestGroups();

  const lockNames = !creating && S.counts.people  > 0;
  /* Die harte Sperre aus 0084 gilt nur noch für einfache Felder.
     Listen sind je Eintrag gesperrt (dort, wo Beiträge liegen), und
     das Kontingent ist nie gesperrt — es zu erhöhen, weil die Klasse
     mehr braucht, ist genau der Fall, für den es die Einstellung
     gibt. Durchgesetzt wird beides ohnehin serverseitig (0086). */
  const lockTool  = !creating && S.counts.entries > 0;
  const anyLocked = lockTool && S.fields.some(f => !f.type || f.type === 'text');

  const askNames = room ? room.ask_names !== false : true;

  // Im Anlege-Modus ist der Skill die erste Frage — außer die Kachel
  // auf der Landing hat sie schon beantwortet. Danach ist es keine
  // Frage mehr: der Skill macht den Raum aus, ihn zu tauschen hieße,
  // einen neuen anzulegen.
  const usable = Object.entries(S.tools).filter(([, t]) => t.active);
  const toolBlock = creating
    ? `<label class="field">Skill <span class="req">*</span>
         <select id="setTool" data-req>
           ${usable.map(([id, t]) => {
             const full = !t.multi_room ? t.live >= 1 : t.live >= t.max_rooms;
             return `<option value="${esc(id)}"${full ? ' disabled' : ''}${id === S.toolId ? ' selected' : ''}>`
                  + `${esc(t.icon || '')} ${esc(t.title)}${full ? ' — Kontingent voll' : ''}</option>`;
           }).join('')}
         </select>
       </label>`
    : `<div class="field field--static">Skill
         <strong>${esc((room?.tool_icon || '') + ' ' + (room?.tool_title || ''))}</strong>
       </div>`;

  /* Zwei Knöpfe in einer Zeile statt zweier untereinanderstehender
     Auswahlpunkte: es sind zwei Antworten auf eine Frage, und die
     geltende erkennt man an der Füllung. Radios bleiben es
     trotzdem — Tastatur und Vorlesegerät bekommen damit ohne
     Zusatzarbeit die Gruppe, die sie brauchen (und readAskNames
     liest weiter dieselbe Stelle). */
  const seg = (val, id, label) => `
    <input type="radio" name="askNames" id="${id}" value="${val}"
           ${(val === '1') === askNames ? 'checked' : ''} ${lockNames ? 'disabled' : ''} />
    <label for="${id}">${label}</label>`;

  pane.innerHTML = `
    <div class="card card--form">
      <h1 class="pane-h">${creating ? 'Neuer Raum' : 'Einstellungen'}</h1>

      <div class="msg msg--err" id="setError" hidden></div>

      <form id="setForm" novalidate>
        <div class="setbox">
          <div class="setrow">
            <label class="field">Titel <span class="req">*</span>
              <input type="text" id="setTitle" data-req maxlength="60" placeholder="9b Deutsch"
                     value="${esc(room?.title || '')}" />
            </label>
            ${toolBlock}
          </div>

          <div class="setfield${lockNames ? ' is-locked' : ''}">
            <span class="setfield-l" id="askNamesL">Sollen User Namen angeben?</span>
            <div class="seg2" role="radiogroup" aria-labelledby="askNamesL">
              ${seg('1', 'askYes', 'Ja, mit Namen')}
              ${seg('0', 'askNo',  'Nein, anonym')}
            </div>
            ${lockNames ? `<p class="lockline">Nicht mehr änderbar: es ${S.counts.people === 1
              ? 'ist schon jemand' : `sind schon ${S.counts.people} Leute`} im Raum.</p>` : ''}
          </div>
        </div>

        <div id="setToolFields">
          ${S.fields.length ? '' : '<p class="booting">Einstellungen werden geladen …</p>'}
          ${toolFieldsHTML(lockTool)}
        </div>
        ${anyLocked ? `<p class="lockline">Nicht mehr änderbar: im Raum ${S.counts.entries === 1
          ? 'steht schon ein Beitrag' : `stehen schon ${S.counts.entries} Beiträge`}.</p>` : ''}

        <div class="actions actions--go">
          <button type="submit" class="btn btn--primary" id="setGo">${creating
            ? 'Raum anlegen und weiter →' : 'Weiter →'}</button>
          ${creating ? '<a class="btn" href="index.html">Abbrechen</a>' : ''}
        </div>
      </form>
    </div>`;

  const form = $('setForm');
  form.addEventListener('submit', creating ? submitCreate : submitUpdate);
  form.addEventListener('input',  updateGo);

  /* Delegiert am Formular und nicht an den Knöpfen: redrawList
     ersetzt den ganzen Kasten, Listener an seinen Kindern wären
     danach weg. */
  form.addEventListener('click', (ev) => {
    const add = ev.target.closest('button[data-add]');
    if (add) {
      const key = add.dataset.add;
      const f   = S.fields.find(x => x.key === key);
      harvestGroups();
      if ((S.groups[key] || []).length >= (Number(f?.max) || 7)) return;
      S.groups[key] = (S.groups[key] || []).concat([{ id: newGroupId(), text: '' }]);
      redrawList(key);
      // In das neue Feld springen: wer „+ Frage" drückt, will tippen.
      const rows = document.querySelectorAll(`[data-setting-item="${key}"]`);
      rows[rows.length - 1]?.focus();
      return;
    }

    const del = ev.target.closest('button[data-del]');
    if (!del || del.disabled) return;
    const key = del.closest('[data-list]')?.dataset.list;
    if (!key) return;
    harvestGroups();
    const rest = (S.groups[key] || []).filter(it => it.id !== del.dataset.del);
    // Die letzte Zeile bleibt: eine Liste ohne Zeile hätte kein Feld,
    // in das man tippen könnte, und der Server nähme sie auch nicht.
    S.groups[key] = rest.length ? rest : [{ id: newGroupId(), text: '' }];
    redrawList(key);
  });

  if (creating) {
    $('setTool').addEventListener('change', async (ev) => {
      S.toolId = ev.target.value;
      $('rtToolName').textContent =
        `${S.tools[S.toolId]?.icon || '🧩'} ${S.tools[S.toolId]?.title || 'Skill'}`;
      await loadFields();
      $('setToolFields').innerHTML = toolFieldsHTML(false) || '';
      updateGo();
    });
  }
  /* Sind alle Werkzeuge voll, sind alle Einträge gesperrt und der
     Browser wählt keinen aus — dann steht in S.toolId noch einer, den
     das Formular gar nicht anbietet. Lieber ehrlich leer: der Knopf
     bleibt grau, und in der Liste steht bei jedem, warum. */
  if (creating && $('setTool').value !== S.toolId) S.toolId = $('setTool').value || null;

  updateGo();
  if (creating) setTimeout(() => $('setTitle')?.focus(), 60);
}

/* Der Knopf wird erst brauchbar, wenn alles Pflichtige dasteht.
   Gesperrte Felder zählen nicht mit: sie sind ausgefüllt, nur eben
   nicht mehr von hier aus. */
function updateGo() {
  const go = $('setGo');
  if (!go) return;
  const missing = [...document.querySelectorAll('#paneSet [data-req]')]
    .some(el => !el.disabled && !String(el.value || '').trim());
  go.disabled = missing;
}

/* Was am Ende in skill_rooms.settings landet. Drei Feldarten, drei
   Formen — und die Listen kommen aus S.groups und nicht aus dem DOM,
   damit ein gesperrter (und damit disabled) Eintrag nicht verloren
   geht: er steht weiter im Raum, er ist nur nicht mehr zu ändern. */
function readSettings() {
  const out = {};

  document.querySelectorAll('#setToolFields [data-setting]').forEach(el => {
    const v = String(el.value || '').trim();
    if (v) out[el.dataset.setting] = v;
  });

  document.querySelectorAll('#setToolFields [data-setting-num]').forEach(el => {
    const f = S.fields.find(x => x.key === el.dataset.settingNum) || {};
    const n = parseInt(String(el.value || '').trim(), 10);
    // Leer, 0 oder Unsinn heißt „unbegrenzt", und das ist eine
    // Antwort und keine fehlende Angabe.
    out[el.dataset.settingNum] = (isFinite(n) && n > 0)
      ? Math.min(Number(f.max) || 100, Math.max(Number(f.min) || 1, n))
      : 0;
  });

  harvestGroups();
  for (const f of S.fields) {
    if (f.type !== 'list') continue;
    const items = (S.groups[f.key] || [])
      .map(it => ({ id: it.id, text: String(it.text || '').trim() }))
      .filter(it => it.text);
    if (items.length) out[f.key] = items;
  }

  return out;
}

const readAskNames = () =>
  document.querySelector('#paneSet input[name="askNames"]:checked')?.value !== '0';

/* Die zusätzlichen Felder des Werkzeugs stehen NICHT in dieser Datei
   und nicht in der Datenbank, sondern im Werkzeug selbst
   (settingsFields in tools/<x>/tool.js). Was die Fragen eines
   WordPools sind, weiß der WordPool — ein Formular, das jede
   Werkzeug-Eigenheit kennen müsste, wäre bei jedem neuen Werkzeug zu
   ändern. Deshalb wird das Modul hier geladen, auch wenn auf dieser
   Seite noch gar nichts davon läuft; MPTool.load merkt sich, was
   schon da ist. */
async function loadFields() {
  S.fields = [];
  const id = S.toolId;
  if (!id) return;
  const folder = S.view?.room?.tool_folder || S.tools[id]?.folder;
  try {
    const impl = await MPTool.load(id, folder);
    // Während geladen wurde, kann ein anderes Werkzeug gewählt sein.
    if (S.toolId !== id) return;
    S.fields = (impl && impl.settingsFields) || [];
  } catch (e) {
    // Kein Grund, das Anlegen zu verhindern: der Raum entsteht auch
    // ohne die Zusatzangaben, das Werkzeug fällt dann auf seine
    // Vorgaben zurück. Aber sagen muss man es.
    console.warn('[mpskills] settingsFields:', e.message);
  }
  seedGroups();
}

async function submitCreate(e) {
  e.preventDefault();
  const errBox = $('setError');
  const btn    = $('setGo');
  errBox.hidden = true;
  btn.disabled = true;

  try {
    const r = await trpc('skill_room_create', {
      p_tool_id:   S.toolId,
      p_title:     $('setTitle').value.trim(),
      p_ask_names: readAskNames(),
      p_settings:  readSettings(),
      p_is_test:   false
    });
    if (!r.ok) {
      errBox.textContent = errText(r.error, r);
      errBox.hidden = false;
      btn.disabled = false;
      return;
    }
    // Der nächste Schritt nach „Raum anlegen" ist immer „Code zeigen".
    try { sessionStorage.setItem(paneKey(r.code), 'onb'); } catch (ex) {}
    // ?new aus der Adresse nehmen, sonst legte ein Neuladen einen
    // zweiten Raum an.
    history.replaceState(null, '', location.pathname);
    location.hash = r.code;
  } catch (ex) {
    errBox.textContent = 'Fehler: ' + ex.message;
    errBox.hidden = false;
    btn.disabled = false;
  }
}

/* Im bestehenden Raum ist „Weiter" zugleich „Speichern": wer etwas
   geändert hat, will es behalten, und wer nichts geändert hat, will
   einfach weiter. Zwei Knöpfe nebeneinander, von denen einer meistens
   grau ist, wären eine Frage mehr als nötig. */
async function submitUpdate(e) {
  e.preventDefault();
  const errBox = $('setError');
  const btn    = $('setGo');
  const room   = S.view?.room || {};
  errBox.hidden = true;

  const patch = {};
  const title = $('setTitle').value.trim();
  if (title !== room.title) patch.p_title = title;

  if (S.counts.people === 0) {
    const ask = readAskNames();
    if (ask !== (room.ask_names !== false)) patch.p_ask_names = ask;
  }
  /* Die Einstellungen gehen IMMER mit, wenn sie sich unterscheiden —
     seit 0086 entscheidet der Server je Frage, was noch geht. Vorher
     hielt diese Zeile sie schon beim ersten Beitrag im Raum zurück;
     damit ließe sich keine Frage mehr ergänzen und kein Kontingent
     mehr erhöhen. */
  if (S.fields.length) {
    const st = readSettings();
    if (JSON.stringify(st) !== JSON.stringify(room.settings || {})) patch.p_settings = st;
  }

  if (!Object.keys(patch).length) { showPane('onb'); return; }

  btn.disabled = true;
  try {
    const r = await trpc('skill_room_update', Object.assign({ p_code: S.code }, patch));
    if (!r.ok) {
      /* Der Server kennt den Stand besser als dieses Fenster: nach
         einer Absage die genannte Zahl übernehmen und das Formular neu
         zeichnen, damit es nicht weiter etwas anbietet, das es nicht
         mehr gibt. Die Meldung wird danach gesetzt — der Neuaufbau
         ersetzt den Kasten, in dem sie steht. */
      if (r.error === 'has_participants') S.counts.people  = r.people  || 1;
      if (r.error === 'has_entries')      S.counts.entries = r.entries || 1;
      // Bei group_has_entries reicht das Neuzeichnen: die Sperre je
      // Frage kommt aus derselben Antwort, die der Poller ohnehin
      // holt — hier ist nur die eigene Sicht ein paar Sekunden alt.
      renderSettings();
      const box = $('setError');
      box.textContent = errText(r.error, r);
      box.hidden = false;
      return;
    }
    // Den neuen Stand gleich übernehmen: der Poller holt ihn zwar in
    // drei Sekunden, aber bis dahin vergliche ein zweites „Weiter"
    // gegen den alten Titel und schickte ihn noch einmal.
    if (r.room && S.view) S.view.room = Object.assign({}, S.view.room, r.room);
    btn.disabled = false;
    toast('Gespeichert.');
    poller && poller.invalidate();
    poller && poller.refresh();
    showPane('onb');
  } catch (ex) {
    errBox.textContent = 'Fehler: ' + ex.message;
    errBox.hidden = false;
    btn.disabled = false;
  }
}

/* Woran die Sperren hängen, steht in der Antwort der Lehrkraft-Ansicht
   schon drin: sie bekommt die vollständige Teilnehmerliste und alle
   Beiträge, auch die ausgeblendeten (0080). Ein eigener Aufruf dafür
   wäre eine zweite Quelle für dieselbe Auskunft. */
function countsFrom(view) {
  return {
    people:  (view?.people  || []).length,
    entries: (view?.entries || []).length
  };
}


/* ══════════════════════════════════════════════════════════
   Fach 2 — Onboarding
   ══════════════════════════════════════════════════════════
   Was früher die halbe Seite besetzt hat und jetzt ein eigenes
   Fach ist: die Tür in den Raum, groß genug für die letzte Reihe. */
function renderOnboarding() {
  $('paneOnb').innerHTML = `
    <div class="onb-bar">
      <span class="beam-count">Drin: <strong id="bCount">–</strong> <span id="bOnline"></span></span>
      <button type="button" class="btn btn--sm" id="bToggle">…</button>
    </div>

    <div class="beam-main">
      <div class="beam-qr" id="bQr"><div class="qr-wait">QR wird erzeugt …</div></div>
      <div class="beam-code">
        <p class="beam-label">Code von der Tafel</p>
        <div class="bigcode" id="bCode">${esc(S.code)}</div>
        <p class="beam-url" id="bUrl"></p>
        <p class="beam-hint">Scannen — oder auf <strong>mpskills</strong> den Code eintippen.</p>
        <ul class="namestrip" id="bNames"></ul>
      </div>
    </div>

    <!-- Teilnehmer-Moderation. Zugeklappt, und zwar mit Absicht: der
         Knopf, mit dem man jemanden stilllegt, soll nicht neben dem
         liegen, den man ständig drückt. Wer ihn braucht, sucht ihn
         in dem Moment auch. -->
    <details class="modbox" id="bMod">
      <summary>Teilnehmer verwalten <span class="card-h-note" id="bModCount"></span></summary>
      <ul class="modlist" id="bModList"></ul>
      <p class="rule">Stilllegen nimmt einem Gerät Lesen, Schreiben und Zustimmen —
      die schon geschriebenen Beiträge bleiben stehen. Jederzeit umkehrbar.</p>
    </details>`;

  // Delegiert und nicht je Zeile: die Liste wird bei jedem Poll neu
  // gezeichnet, und Listener an ihren Kindern wären damit jedes Mal weg.
  $('bModList').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-block]');
    if (!b) return;
    const on = b.dataset.block === '1';
    b.disabled = true;
    try {
      const r = await trpc('skill_room_set_blocked', {
        p_code: S.code, p_participant: b.dataset.id, p_blocked: on
      });
      if (!r.ok) { toast(errText(r.error, r), 'error'); b.disabled = false; return; }
      toast(on ? 'Gerät stillgelegt.' : 'Wieder freigegeben.');
      poller && poller.invalidate();
      poller && poller.refresh();
    } catch (e) {
      toast('Fehler: ' + e.message, 'error');
      b.disabled = false;
    }
  });

  $('bToggle').addEventListener('click', (ev) => toggleJoin(ev.currentTarget));
}

async function toggleJoin(btn) {
  const open = btn.dataset.open === '1';
  btn.disabled = true;
  try {
    const r = await trpc('skill_room_set_open', { p_code: S.code, p_open: open });
    if (!r.ok) { toast(errText(r.error, r), 'error'); return; }
    poller && poller.invalidate();
    poller && poller.refresh();
  } catch (e) {
    toast('Fehler: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* Genau einmal je Ziel zeichnen. Der QR-Code ändert sich nie, und
   etwas, das gescannt werden soll, darf nicht alle drei Sekunden neu
   aufgebaut werden.

   Ruhezone 4 Module — das ist der Normwert und keine Zierde: ein
   Lesegerät findet die Suchmarkierungen nur, wenn um den Code herum
   genug Weiß steht. Am Beamer, schräg und aus zehn Metern, ist das
   der Unterschied zwischen „geht sofort" und „geht bei manchen
   nicht". */
function drawQr(targetId, url) {
  const el = $(targetId);
  if (!el || S.qrDrawn[targetId] === S.code) return;
  try {
    el.innerHTML = MPQR.svg(url, { title: 'Code ' + S.code });
    S.qrDrawn[targetId] = S.code;
  } catch (e) {
    el.innerHTML = `<div class="qr-wait">QR-Code ließ sich nicht erzeugen.<br>Der Code
      funktioniert trotzdem.</div>`;
    console.error('[mpskills] QR:', e);
  }
}


/* ══════════════════════════════════════════════════════════
   Die Tür am Rand
   ══════════════════════════════════════════════════════════
   Für die, die zu spät kommen. Ein Griff am rechten Bildschirmrand,
   der den Code ausfährt — ohne dass die Klasse ihre Ansicht
   verliert, und ohne dass jemand dafür das Fach wechseln muss.

   Bewusst klein und bewusst OHNE Automatik: ein Fenster, das von
   selbst zuklappt, während noch jemand scannt, ist schlimmer als
   eins, das zu lange offen steht.

   Zu geht es dafür überall: ein Griff, den man zum Ausfahren gedrückt
   hat, ist danach ein 42 px breiter Streifen neben einem 250 px
   breiten Kasten — wer ihn wieder wegräumen will, zielt auf das, was
   er sieht. Also schließt ein Klick irgendwo auf dem Kasten. */
function flyHTML() {
  return `
    <aside class="qrfly" id="qrFly" hidden>
      <button type="button" class="qrfly-grip" id="qrFlyGrip"
              aria-expanded="false" aria-label="Code für Nachzügler zeigen"
              title="Code für Nachzügler">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zM14 3h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5z"/>
          <path d="M14 14h3v3h-3v-3zm5 0h2v2h-2v-2zm-5 5h2v2h-2v-2zm3 0h4v2h-4v-2zm2-3h2v2h-2v-2z"/>
        </svg>
      </button>
      <div class="qrfly-body" id="qrFlyBody" title="Zum Einfahren klicken">
        <div class="qrfly-qr" id="flyQr"></div>
        <div class="qrfly-code">${esc(S.code)}</div>
        <p class="qrfly-url" id="flyUrl"></p>
        <button type="button" class="btn btn--sm" id="flyToggle">…</button>
      </div>
    </aside>`;
}

const flyOpen  = () => $('qrFly')?.classList.contains('open');
function closeFly() {
  const f = $('qrFly');
  if (!f) return;
  f.classList.remove('open');
  $('qrFlyGrip')?.setAttribute('aria-expanded', 'false');
}

function wireFly() {
  $('qrFlyGrip').addEventListener('click', () => {
    const f = $('qrFly');
    const on = !f.classList.contains('open');
    f.classList.toggle('open', on);
    $('qrFlyGrip').setAttribute('aria-expanded', String(on));
    // Erst beim ersten Ausfahren zeichnen: ein QR-Code, den niemand
    // sieht, muss auch nicht gebaut werden.
    if (on) drawQr('flyQr', MPRoom.joinUrl(S.code));
  });
  // Ein Klick auf den ausgefahrenen Kasten fährt ihn wieder ein —
  // zwei Ausnahmen, beide aus demselben Grund: dort ist der Klick
  // schon vergeben. Der Beitritts-Knopf macht seine eigene Sache,
  // und der Code ist `user-select: all`, also zum Markieren da; führe
  // der Kasten dabei weg, wäre die Markierung mit weg.
  $('qrFlyBody').addEventListener('click', (ev) => {
    if (ev.target.closest('button, .qrfly-code')) return;
    closeFly();
  });
  $('flyToggle').addEventListener('click', (ev) => toggleJoin(ev.currentTarget));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && flyOpen()) closeFly();
  });
}


/* ══════════════════════════════════════════════════════════
   Fach 3 — das Werkzeug
   ══════════════════════════════════════════════════════════ */
// Einmal montieren, danach nur noch füttern. Welches Werkzeug es ist,
// steht im Raum — diese Datei kennt keinen einzigen Werkzeugnamen.
async function mountTool(view) {
  const id  = view.room?.tool_id;
  const box = $('bTool');
  if (!id || tool || toolBusy || !box) return;
  toolBusy = true;

  box.innerHTML = '<p class="booting">Skill wird geladen …</p>';

  let impl;
  try {
    impl = await MPTool.load(id, view.room.tool_folder);
  } catch (e) {
    // Der Raum funktioniert weiter: Code, QR und Teilnehmerliste
    // stehen. Nur der Inhalt fehlt — also sagen, statt abzuräumen.
    console.error('[mpskills] Werkzeug laden:', e);
    box.innerHTML = `<div class="msg msg--err">Dieser Skill lässt sich gerade nicht laden.
      Der Raum und der Code funktionieren trotzdem.</div>`;
    return;
  } finally {
    toolBusy = false;
  }

  // Während geladen wurde, kann die Ansicht gewechselt haben (anderer
  // Raum, zurück zur Landing). Dann gibt es diesen Kasten nicht mehr,
  // und montiert würde in ein Element außerhalb des Dokuments.
  if ($('bTool') !== box) return;

  const ctx = MPTool.makeCtx({
    // trpc statt einer festgehaltenen Kopie: der Access-Token wird bei
    // JEDEM Aufruf frisch gelesen, sonst wäre er nach einer Stunde tot
    // — und diese Ansicht steht eine Doppelstunde offen.
    actions: MPTool.presenterActions(S.code, trpc),
    title:   view.room.title,
    toast:   (m, err) => toast(m, err ? 'error' : ''),
    refresh: () => { poller && poller.invalidate(); poller && poller.refresh(); }
  });

  box.innerHTML = '';
  tool = impl;
  tool.mount(box, ctx);
  tool.update(view);
}

function unmountTool() {
  if (tool) {
    try { tool.unmount(); } catch (e) { console.warn('[mpskills] unmount:', e.message); }
    tool = null;
  }
}


/* ══════════════════════════════════════════════════════════
   Der Raum
   ══════════════════════════════════════════════════════════ */
async function renderRoom(code) {
  stop();
  S.code = code;
  S.view = null;
  S.qrDrawn = {};

  host().innerHTML = '<main class="wrap"><p class="booting">Raum wird geladen …</p></main>';

  // Zwei Auskünfte vor dem ersten Zeichnen: was im Raum schon steht
  // (daran hängen die Sperren im ersten Fach) und welche Zusatzfelder
  // das Werkzeug hat. Beides einmalig — der Poller danach holt nur
  // noch den laufenden Zustand.
  let first;
  try {
    first = await trpc('skill_room_get', { p_code: code });
  } catch (e) {
    host().innerHTML = `<main class="wrap"><div class="card"><div class="msg msg--err">Der Raum
      ließ sich nicht laden: ${esc(e.message)}</div>
      <p><a href="index.html">Zurück zu meinen Räumen</a></p></div></main>`;
    return;
  }
  if (!first.ok) {
    host().innerHTML = `<main class="wrap"><div class="card"><div class="msg msg--err">${
      esc(errText(first.error, first))}</div>
      <p><a href="index.html">Zurück zu meinen Räumen</a></p></div></main>`;
    return;
  }

  S.view   = first;
  S.toolId = first.room.tool_id;
  S.counts = countsFrom(first);
  await loadFields();

  renderShell();
  renderSettings();
  renderOnboarding();
  showPane(readPane(code));
  paintRoom(first);

  poller = MPRoom.poll({
    sig:  () => trpc('skill_room_sig', { p_code: code }),
    view: () => trpc('skill_room_get', { p_code: code }),
    onChange: (data) => paintRoom(data),
    onError: (err) => {
      if (err === 'not_found') {
        stop();
        host().innerHTML = `<main class="wrap"><div class="card"><div class="msg msg--err">Diesen
          Raum gibt es nicht (mehr) — oder er gehört nicht dir.</div>
          <p><a href="index.html">Zurück zu meinen Räumen</a></p></div></main>`;
        return;
      }
      // Netzfehler: die Anzeige bleibt stehen. Ein leerer Beamer
      // mitten in der Stunde wäre schlimmer als ein Bild, das ein
      // paar Sekunden alt ist. Die Leiste oben sagt, dass es hakt —
      // hier steht nur, was es für DIESE Ansicht bedeutet.
      const box = $('bErr');
      if (box) {
        box.textContent = 'Keine Verbindung — die Anzeige ist vielleicht nicht aktuell.';
        box.hidden = false;
      }
    },
    onNet: MPRoom.showNet
  });
}

function paintRoom(data) {
  S.view = data;
  const r = data.room;
  const box = $('bErr');
  if (box) box.hidden = true;

  document.title = r.title + ' · MPSkills';
  $('rtToolName').textContent = `${r.tool_icon || '🧩'} ${r.tool_title || 'Skill'}`;

  const url = MPRoom.joinUrl(S.code);
  $('bUrl').textContent  = url.replace(/^https?:\/\//, '');
  const flyUrl = $('flyUrl');
  if (flyUrl) flyUrl.textContent = url.replace(/^https?:\/\//, '');
  drawQr('bQr', url);

  const people = data.people || [];
  const online = people.filter(p => p.online).length;

  /* Die beiden Zahlen, an denen die Sperren im ersten Fach hängen,
     stehen ohnehin in dieser Antwort — dafür braucht es keinen
     zweiten Aufruf. Gemerkt wird nur, DASS sich etwas geändert hat;
     gezeichnet wird beim nächsten Betreten des Fachs. */
  const nEntries = (data.entries || []).length;
  if ((S.counts.people === 0) !== (people.length === 0)
   || (S.counts.entries === 0) !== (nEntries === 0)) S.setStale = true;
  S.counts = { people: people.length, entries: nEntries };

  $('bCount').textContent  = String(people.length);
  $('bOnline').textContent = online === people.length ? '' : `(${online} gerade da)`;

  // Derselbe Umschalter an zwei Stellen — im Onboarding und in der
  // Tür am Rand. Beide zeigen denselben Zustand, sonst stünde auf dem
  // einen „schließen", während der andere schon zu ist.
  for (const id of ['bToggle', 'flyToggle']) {
    const tg = $(id);
    if (!tg) continue;
    tg.dataset.open = r.join_open ? '0' : '1';
    tg.textContent  = r.join_open ? 'Beitritt schließen' : 'Beitritt öffnen';
    tg.classList.toggle('btn--primary', !r.join_open);
  }

  $('bNames').innerHTML = people.map(p => `
    <li class="chip${p.online ? ' chip--on' : ''}${p.blocked ? ' chip--blocked' : ''}"
        >${p.blocked ? '🔇 ' : ''}${esc(p.name)}</li>`).join('')
    || '<li class="chip chip--wait">Noch niemand da — der Code steht bereit.</li>';

  const blocked = people.filter(p => p.blocked).length;
  $('bModCount').textContent = blocked ? `${blocked} stillgelegt` : `${people.length}`;
  $('bModList').innerHTML = people.length
    ? people.map(p => `
        <li class="modrow${p.blocked ? ' modrow--blocked' : ''}">
          <span class="dot${p.online ? ' dot--on' : ''}" aria-hidden="true"></span>
          <span class="modrow-name">${esc(p.name)}</span>
          ${p.blocked ? '<span class="modrow-tag">stillgelegt</span>' : ''}
          <button type="button" class="btn btn--sm${p.blocked ? '' : ' btn--danger'}"
                  data-id="${esc(p.id)}" data-block="${p.blocked ? '0' : '1'}">
            ${p.blocked ? 'Freigeben' : 'Stilllegen'}
          </button>
        </li>`).join('')
    : '<li class="modrow modrow--empty">Noch niemand da.</li>';

  // Beim ersten Durchlauf montieren (vorher kennen wir das Werkzeug
  // nicht), danach nur noch durchreichen.
  if (!tool) mountTool(data);
  else tool.update(data);
}


/* ══════════════════════════════════════════════════════════
   Der Raum, den es noch nicht gibt
   ══════════════════════════════════════════════════════════
   Dieselbe Seite, nur mit zwei zugesperrten Fächern. Es gibt hier
   bewusst KEINEN Dialog mehr: was er gefragt hat, ist Fach 1, und
   dort steht es nach dem Anlegen weiter. Ein Formular, das nach dem
   Abschicken verschwindet, ist genau das, was beim ersten Raum
   gefehlt hat.

   Die Landing schickt auf zwei Wegen hierher: von der Kachel mit dem
   Werkzeug in der Adresse (?new=wordcloud), vom Knopf über der
   Raumliste ohne (?new) — dann ist das Werkzeug die erste Frage im
   Formular statt schon beantwortet. */
async function renderNew() {
  stop();
  S.code = null;
  S.view = null;

  // has() und nicht get(): „?new" ohne Wert heißt „Formular auf,
  // Werkzeug offen". Ohne ?new gibt es auf dieser Seite nichts zu
  // sehen — replace statt href, sonst führte „zurück" wieder hierher.
  const params = new URLSearchParams(location.search);
  if (!params.has('new')) { location.replace('index.html'); return; }

  document.title = 'Neuer Raum · MPSkills';
  host().innerHTML = '<main class="wrap"><p class="booting">Einen Moment …</p></main>';

  let data;
  try {
    data = await trpc('skill_rooms_list', {});
  } catch (e) {
    host().innerHTML = `<main class="wrap"><div class="card"><div class="msg msg--err">Die
      Skills ließen sich nicht laden: ${esc(e.message)}</div>
      <p><a href="index.html">Zurück zu MPSkills</a></p></div></main>`;
    return;
  }
  if (!data.ok) {
    host().innerHTML = `<main class="wrap"><div class="card"><div class="msg msg--err">${
      esc(errText(data.error))}</div>
      <p><a href="index.html">Zurück zu MPSkills</a></p></div></main>`;
    return;
  }

  S.tools = data.tools || {};
  const usable = Object.keys(S.tools).filter(id => S.tools[id].active);
  if (!usable.length) {
    host().innerHTML = `<main class="wrap"><div class="card"><div class="msg msg--warn">Es ist
      gerade kein Skill verfügbar.</div>
      <p><a href="index.html">Zurück zu MPSkills</a></p></div></main>`;
    return;
  }

  /* Vorgewählt wird ein Werkzeug, das auch geht: ein volles Kontingent
     steht zwar mit in der Liste (mit Grund, sonst fragt man sich, wo es
     hin ist), aber als Vorauswahl wäre es ein Formular, das von
     vornherein nicht abzuschicken ist. Sind ALLE voll, bleibt die
     Auswahl leer und der Knopf grau — die Liste sagt dann selbst, warum. */
  const isFull = (id) => {
    const t = S.tools[id];
    return t.multi_room ? t.live >= t.max_rooms : t.live >= 1;
  };
  const wanted = params.get('new');
  S.toolId = (wanted && S.tools[wanted]?.active && !isFull(wanted))
    ? wanted
    : (usable.find(id => !isFull(id)) || usable[0]);

  await loadFields();
  renderShell();
  renderSettings();
  showPane('set');
}


/* ══════════════════════════════════════════════════════════
   Weiche + Start
   ══════════════════════════════════════════════════════════ */
/* Alles zurück auf Anfang. „roomview" fliegt hier raus und wird von
   renderShell wieder gesetzt: so tragen die Fehlerbilder (Raum weg,
   nicht angemeldet) die Klasse nicht weiter mit sich herum — sie
   blendet den Seitenfuß aus und geben ihn nicht wieder her. */
function stop() {
  if (poller) { poller.stop(); poller = null; }
  unmountTool();
  document.body.classList.remove('roomview', 'beamer', 'pane-tool');
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
  }
}

function route() {
  const code = MPRoom.normalizeCode(location.hash.replace(/^#/, ''));
  if (MPRoom.isCode(code)) return renderRoom(code);
  return renderNew();
}

window.addEventListener('hashchange', route);

(async function boot() {
  // Die Ecke oben rechts steht auf jeder MPSkills-Seite (lib/userbar.js).
  // Sie zeichnet sich selbst, sobald die Session da ist — hier gibt es
  // keine Anmelde-Modals, ein Gast wird auf die Landing geschickt.
  window.MPUserBar?.mount();
  await (window.waitForSession?.() ?? Promise.resolve());
  const s = window.getSessionUser?.();

  if (!s) {
    host().innerHTML = `<main class="wrap wrap--narrow"><div class="card card--join">
        <h1 class="join-h">Bitte anmelden</h1>
        <p class="join-sub">Räume verwaltet nur, wer als Lehrkraft angemeldet ist.</p>
        <a class="btn btn--primary btn--wide" href="index.html">Zur Anmeldung</a>
      </div></main>`;
    return;
  }

  const isAdmin   = s.is_admin || s.is_superadmin;
  const isTeacher = s.teacher_status === 'approved';

  if (!isAdmin && !isTeacher) {
    host().innerHTML = `<main class="wrap wrap--narrow"><div class="card card--join">
        <h1 class="join-h">Noch nicht freigeschaltet</h1>
        <p class="join-sub">Für MPSkills bist du noch nicht als Lehrkraft freigeschaltet.</p>
        <a class="btn btn--primary btn--wide" href="index.html">Zurück zu MPSkills</a>
      </div></main>`;
    return;
  }

  await route();
})();
