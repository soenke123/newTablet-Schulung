/* ══════════════════════════════════════════════════════════════
   MPSkills — lehrer.js   ·   Raumverwaltung und Beamer-Ansicht
   ══════════════════════════════════════════════════════════════
   Zwei Ansichten, eine Seite — der Hash entscheidet:
     lehrer.html          Liste aller eigenen Räume
     lehrer.html#K7F2QM   der Raum, groß, für den Beamer

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
     · Der QR-Code wird genau einmal gezeichnet und nicht bei
       jedem Poll neu — er ändert sich nie, und ein flackernder
       QR-Code lässt sich nicht scannen.

   Seit Stufe 4 hängt im Beamer das WERKZEUG mit drin. Diese Datei
   weiß davon nur, wo es hingehört und wann es neue Daten bekommt;
   was es tut, geht sie nichts an (siehe lib/tool.js).
   ══════════════════════════════════════════════════════════════ */

'use strict';

const esc  = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
const host = () => document.getElementById('lehrerHost');

let poller  = null;
let qrDrawn = null;   // für welchen Code der QR schon im DOM steht
let tool    = null;   // geladenes Werkzeug-Modul, solange eines montiert ist
// Das Laden ist asynchron, der Poller nicht: ohne diesen Riegel käme
// der nächste Takt, während noch geladen wird, fände tool === null und
// montierte ein zweites Mal — doppeltes DOM, doppelte Listener.
let toolBusy = false;

/* ─── Toast ───────────────────────────────────────────────── */
let toastTimer = null;
function toast(message, kind) {
  const el = document.getElementById('toast');
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
  tool_unknown:      'Dieses Werkzeug gibt es nicht.',
  tool_inactive:     'Dieses Werkzeug ist abgeschaltet — neue Räume gibt es dafür nicht.',
  title_too_long:    'Der Titel ist zu lang (höchstens 60 Zeichen).',
  single_room_only:  'Von diesem Werkzeug ist nur ein Raum gleichzeitig möglich.',
  code_collision:    'Es ließ sich gerade kein freier Code finden. Bitte noch einmal.',
  no_profile:        'Zu deinem Zugang fehlt das Profil.'
};
const errText = (e, data) =>
  e === 'room_limit'
    ? `Du hast schon ${data?.live ?? ''} von ${data?.max ?? ''} Räumen dieses Werkzeugs. `
      + 'Lösche einen, den du nicht mehr brauchst.'
    : (ERRORS[e] || 'Das hat nicht geklappt.');

/* ══════════════════════════════════════════════════════════
   Liste
   ══════════════════════════════════════════════════════════ */
/* ─── Werkzeug ────────────────────────────────────────────── */
// Einmal montieren, danach nur noch füttern. Welches Werkzeug es ist,
// steht im Raum — diese Datei kennt keinen einzigen Werkzeugnamen.
async function mountTool(code, view) {
  const id = view.room?.tool_id;
  const box = document.getElementById('bTool');
  if (!id || tool || toolBusy || !box) return;
  toolBusy = true;

  box.innerHTML = '<p class="booting">Werkzeug wird geladen …</p>';

  let impl;
  try {
    impl = await MPTool.load(id, view.room.tool_folder);
  } catch (e) {
    // Der Raum funktioniert weiter: Code, QR und Teilnehmerliste
    // stehen. Nur der Inhalt fehlt — also sagen, statt abzuräumen.
    console.error('[mpskills] Werkzeug laden:', e);
    box.innerHTML = `<div class="msg msg--err">Dieses Werkzeug lässt sich gerade nicht laden.
      Der Raum und der Code funktionieren trotzdem.</div>`;
    return;
  } finally {
    toolBusy = false;
  }

  // Während geladen wurde, kann die Ansicht gewechselt haben (zurück
  // zur Raumliste, anderer Raum). Dann gibt es diesen Kasten nicht
  // mehr, und montiert würde in ein Element außerhalb des Dokuments.
  if (document.getElementById('bTool') !== box) return;

  const ctx = MPTool.makeCtx({
    // trpc statt einer festgehaltenen Kopie: der Access-Token wird bei
    // JEDEM Aufruf frisch gelesen, sonst wäre er nach einer Stunde tot
    // — und diese Ansicht steht eine Doppelstunde offen.
    actions: MPTool.presenterActions(code, trpc),
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

async function renderList() {
  if (poller) { poller.stop(); poller = null; }
  unmountTool();
  qrDrawn = null;
  document.body.classList.remove('beamer');
  document.title = 'Meine Räume · MPSkills';
  host().innerHTML = '<p class="booting">Räume werden geladen …</p>';

  let data;
  try {
    data = await trpc('skill_rooms_list', {});
  } catch (e) {
    host().innerHTML = `<div class="card"><div class="msg msg--err">Räume konnten nicht geladen
      werden: ${esc(e.message)}</div></div>`;
    return;
  }
  if (!data.ok) {
    host().innerHTML = `<div class="card"><div class="msg msg--err">${esc(errText(data.error))}</div>
      <p><a href="index.html">Zurück zu MPSkills</a></p></div>`;
    return;
  }

  window.__tools = data.tools || {};
  const rooms = data.rooms || [];
  const live  = rooms.filter(r => !r.is_test);
  const tests = rooms.filter(r =>  r.is_test);

  host().innerHTML = `
    <div class="page-head">
      <div>
        <h1>Meine Räume</h1>
        <p class="page-sub">Ein Raum gehört dir. Er läuft ab, wenn 60 Tage lang niemand
        mehr darin war.</p>
      </div>
      <button type="button" class="btn btn--primary" id="newBtn">+ Neuer Raum</button>
    </div>

    ${rooms.length === 0 ? `
      <div class="card card--empty">
        <p><strong>Noch kein Raum.</strong> Leg einen an — du bekommst einen Code und einen
        QR-Code, und die Klasse ist in 30 Sekunden drin.</p>
      </div>` : ''}

    ${live.length ? `<div class="roomgrid">${live.map(roomCard).join('')}</div>` : ''}

    ${tests.length ? `
      <h2 class="section-h">Testräume <span class="card-h-note">zählen nicht gegen dein
        Raum-Kontingent</span></h2>
      <div class="roomgrid">${tests.map(roomCard).join('')}</div>` : ''}

    ${quotaBlock(data.tools)}
  `;

  document.getElementById('newBtn').addEventListener('click', () => openNew());
  wireRoomCards();
}

function roomCard(r) {
  const closed = !r.join_open;
  return `
    <article class="roomcard${r.expired ? ' roomcard--dead' : ''}" data-code="${esc(r.code)}">
      <div class="roomcard-top">
        <span class="roomcard-ic">${esc(r.tool_icon || '🧩')}</span>
        <div class="roomcard-id">
          <h3>${esc(r.title)}</h3>
          <span>${esc(r.tool_title || r.tool_id)}${r.is_test ? ' · Testraum' : ''}</span>
        </div>
        <code class="code-chip">${esc(r.code)}</code>
      </div>

      <div class="roomcard-meta">
        <span class="meta-people"><strong>${r.people}</strong> ${r.people === 1 ? 'Teilnehmer' : 'Teilnehmer'}</span>
        ${r.online ? `<span class="meta-on">${r.online} gerade da</span>` : ''}
        ${closed ? '<span class="meta-closed">Beitritt zu</span>' : ''}
        <span class="meta-until">${esc(r.expired ? 'abgelaufen' : MPRoom.untilText(r.expires_at))}</span>
      </div>

      <div class="roomcard-foot">
        <a class="btn btn--sm btn--primary" href="#${esc(r.code)}">Beamer</a>
        <button type="button" class="btn btn--sm" data-act="toggle" data-open="${closed ? '1' : '0'}">
          ${closed ? 'Beitritt öffnen' : 'Beitritt schließen'}
        </button>
        <button type="button" class="btn btn--sm btn--danger" data-act="delete">Löschen</button>
      </div>
    </article>`;
}

// „Wortwolke 2 von 5" — die Liste ist der Ort, an dem eine
// erreichte Obergrenze erklärt werden muss, nicht der Fehlerdialog
// beim Anlegen.
function quotaBlock(tools) {
  const rows = Object.entries(tools || {})
    .filter(([, t]) => t.live > 0)
    .map(([, t]) => `<li><span>${esc(t.icon || '')} ${esc(t.title)}</span>
        <strong class="${t.live >= t.max_rooms ? 'quota-full' : ''}">${t.live} von ${t.max_rooms}</strong></li>`);
  if (!rows.length) return '';
  return `<div class="card card--quota">
      <h2 class="card-h">Raum-Kontingent</h2>
      <ul class="quota">${rows.join('')}</ul>
      <p class="rule">Abgelaufene Räume und Testräume zählen nicht mit.</p>
    </div>`;
}

function wireRoomCards() {
  host().querySelectorAll('.roomcard').forEach(card => {
    const code = card.dataset.code;
    card.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        btn.disabled = true;
        try {
          if (act === 'toggle') {
            const open = btn.dataset.open === '1';
            const r = await trpc('skill_room_set_open', { p_code: code, p_open: open });
            if (!r.ok) { toast(errText(r.error, r), 'error'); btn.disabled = false; return; }
            toast(open ? 'Beitritt geöffnet.' : 'Beitritt geschlossen.');
            renderList();
          } else if (act === 'delete') {
            // Löschen heißt löschen: Raum, Teilnehmer und alles,
            // was daran hängt. Deshalb die Rückfrage — es ist der
            // einzige Schritt hier, der nicht rückgängig zu machen ist.
            if (!confirm(`Raum wirklich löschen?\n\nAlles darin ist weg — auch für die Klasse. `
                       + `Der Code ${code} funktioniert danach nicht mehr.`)) {
              btn.disabled = false; return;
            }
            const r = await trpc('skill_room_delete', { p_code: code });
            if (!r.ok) { toast(errText(r.error, r), 'error'); btn.disabled = false; return; }
            toast('Raum gelöscht.');
            renderList();
          }
        } catch (e) {
          toast('Fehler: ' + e.message, 'error');
          btn.disabled = false;
        }
      });
    });
  });
}

/* ══════════════════════════════════════════════════════════
   Neuer Raum
   ══════════════════════════════════════════════════════════ */
/* Die zusätzlichen Felder des gewählten Werkzeugs.

   Sie stehen NICHT in dieser Datei und nicht in der Datenbank,
   sondern im Werkzeug selbst (settingsFields in tools/<x>/tool.js).
   Der Grund ist derselbe wie bei allem anderen hier: was die Frage
   einer Wortwolke ist, weiß die Wortwolke — und ein Dialog, der jede
   Werkzeug-Eigenheit kennen müsste, wäre bei jedem neuen Werkzeug zu
   ändern. Genau das soll ab Stufe 6 nicht mehr nötig sein.

   Deshalb wird das Modul hier geladen, obwohl auf dieser Seite noch
   gar nichts davon läuft. MPTool.load merkt sich, was schon da ist;
   ein zweiter Aufruf kostet nichts. */
async function renderToolFields(toolId) {
  const box = document.getElementById('newToolFields');
  const t   = (window.__tools || {})[toolId];
  box.innerHTML = '';
  if (!t) return;

  let impl = null;
  try {
    impl = await MPTool.load(toolId, t.folder);
  } catch (e) {
    // Kein Grund, das Anlegen zu verhindern: der Raum entsteht auch
    // ohne die Zusatzangaben, das Werkzeug fällt dann auf seine
    // Vorgaben zurück. Aber sagen muss man es.
    console.warn('[mpskills] settingsFields:', e.message);
    box.innerHTML = `<p class="rule">Die Einstellungen dieses Werkzeugs lassen sich gerade nicht
      laden — der Raum entsteht trotzdem.</p>`;
    return;
  }

  // Das Auswahlfeld kann sich geändert haben, während geladen wurde.
  if (document.getElementById('newTool').value !== toolId) return;

  const fields = (impl && impl.settingsFields) || [];
  box.innerHTML = fields.map(f => `
    <label class="field">${esc(f.label)}
      <input type="text" data-setting="${esc(f.key)}"
             maxlength="${Number(f.maxlength) || 140}"
             placeholder="${esc(f.placeholder || '')}"
             value="${esc(f.default || '')}"
             ${f.required ? 'required' : ''} />
      ${f.hint ? `<span class="rule">${esc(f.hint)}</span>` : ''}
    </label>`).join('');
}

function readToolSettings() {
  const out = {};
  document.querySelectorAll('#newToolFields [data-setting]').forEach(el => {
    const v = String(el.value || '').trim();
    if (v) out[el.dataset.setting] = v;
  });
  return out;
}

function openNew(preselect) {
  const sel = document.getElementById('newTool');
  const tools = window.__tools || {};
  const usable = Object.entries(tools).filter(([, t]) => t.active);

  if (!usable.length) {
    toast('Es ist gerade kein Werkzeug verfügbar.', 'error');
    return;
  }

  sel.innerHTML = usable.map(([id, t]) => {
    const full = !t.multi_room ? t.live >= 1 : t.live >= t.max_rooms;
    return `<option value="${esc(id)}"${full ? ' disabled' : ''}>`
         + `${esc(t.icon || '')} ${esc(t.title)}${full ? ' — Kontingent voll' : ''}</option>`;
  }).join('');

  document.getElementById('newError').hidden = true;
  document.getElementById('newForm').reset();
  document.getElementById('newAskNames').checked = true;
  // Erst NACH dem reset vorwählen — reset setzt das Auswahlfeld
  // sonst wieder auf den ersten Eintrag zurück.
  if (preselect) sel.value = preselect;
  document.getElementById('newSubmit').disabled = false;
  document.getElementById('newModal').hidden = false;
  renderToolFields(sel.value);
  setTimeout(() => document.getElementById('newRoomTitle').focus(), 50);
}

async function submitNew(e) {
  e.preventDefault();
  const errBox = document.getElementById('newError');
  const btn    = document.getElementById('newSubmit');
  errBox.hidden = true;

  // Pflichtfelder des Werkzeugs. Der Server nimmt settings ungeprüft
  // entgegen (er kennt die Bedeutung nicht), also ist das hier die
  // einzige Stelle, an der eine fehlende Frage auffällt — und besser
  // hier als am Beamer vor der Klasse.
  const missing = [...document.querySelectorAll('#newToolFields [data-setting][required]')]
    .find(el => !String(el.value || '').trim());
  if (missing) {
    errBox.textContent = 'Da fehlt noch etwas: ' +
      (missing.closest('label')?.firstChild?.textContent || '').trim();
    errBox.hidden = false;
    missing.focus();
    return;
  }

  btn.disabled = true;
  try {
    const r = await trpc('skill_room_create', {
      p_tool_id:   document.getElementById('newTool').value,
      p_title:     document.getElementById('newRoomTitle').value.trim(),
      p_ask_names: document.getElementById('newAskNames').checked,
      p_settings:  readToolSettings(),
      p_is_test:   false
    });
    if (!r.ok) {
      errBox.textContent = errText(r.error, r);
      errBox.hidden = false;
      btn.disabled = false;
      return;
    }
    document.getElementById('newModal').hidden = true;
    // Direkt in die Beamer-Ansicht: der nächste Schritt nach
    // „Raum anlegen" ist immer „Code zeigen".
    location.hash = r.code;
  } catch (ex) {
    errBox.textContent = 'Fehler: ' + ex.message;
    errBox.hidden = false;
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════
   Beamer-Ansicht
   ══════════════════════════════════════════════════════════ */
/* Die Tür (QR + Code) soll die Bühne nicht dauerhaft besetzen, sobald
   die Klasse drin ist — und sie muss trotzdem jederzeit
   zurückkommen, wenn jemand zu spät kommt. Also ein Umschalter,
   den die Lehrkraft bedient, und KEINE Automatik: ein Fenster, das
   von selbst zuklappt, während noch jemand scannt, ist schlimmer als
   eins, das zu lange offen steht.

   Die Wahl liegt im sessionStorage und je Code: auf einem geteilten
   Lehrer-Tablet soll sie mit dem Tab verschwinden. */
const doorKey  = (code) => 'mpskills_door_' + code;
const doorOpen = (code) => {
  try { return sessionStorage.getItem(doorKey(code)) !== '0'; } catch (e) { return true; }
};
function setDoor(code, on) {
  try { sessionStorage.setItem(doorKey(code), on ? '1' : '0'); } catch (e) {}
  const main = document.getElementById('bDoor');
  const btn  = document.getElementById('bDoorBtn');
  if (main) main.hidden = !on;
  if (btn)  btn.textContent = on ? 'Code ausblenden' : 'Code zeigen';
  // Die Wolke rechnet ihre Höhe aus dem, was über ihr steht — klappt
  // die Tür weg, hat sie plötzlich mehr Platz und muss neu einpassen.
  window.dispatchEvent(new Event('resize'));
}

function renderBeamer(code) {
  if (poller) { poller.stop(); poller = null; }
  unmountTool();
  qrDrawn = null;
  document.body.classList.add('beamer');

  host().innerHTML = `
    <div class="beam">
      <div class="beam-head">
        <a class="btn btn--sm" href="lehrer.html" id="backBtn">‹ Meine Räume</a>
        <div class="beam-id">
          <strong id="bTitle">…</strong>
          <span id="bToolName"></span>
        </div>
        <div class="beam-head__right">
          <span class="beam-count">Drin: <strong id="bCount">–</strong> <span id="bOnline"></span></span>
          <button type="button" class="btn btn--sm" id="bDoorBtn">Code ausblenden</button>
          <button type="button" class="btn btn--sm" id="bToggle">…</button>
          <button type="button" class="btn btn--sm" id="fsBtn">Vollbild</button>
        </div>
      </div>

      <div class="msg msg--err" id="bErr" hidden></div>

      <div class="beam-main" id="bDoor">
        <div class="beam-qr" id="bQr"><div class="qr-wait">QR wird erzeugt …</div></div>
        <div class="beam-code">
          <p class="beam-label">Code von der Tafel</p>
          <div class="bigcode" id="bCode">${esc(code)}</div>
          <p class="beam-url" id="bUrl"></p>
          <p class="beam-hint">Scannen — oder auf <strong>mpskills</strong> den Code eintippen.</p>
          <ul class="namestrip" id="bNames"></ul>
        </div>
      </div>

      <!-- Hier hängt sich das Werkzeug ein. -->
      <div class="beam-tool" id="bTool"></div>
    </div>`;

  document.getElementById('fsBtn').addEventListener('click', toggleFullscreen);
  document.getElementById('bDoorBtn').addEventListener('click', () => setDoor(code, !doorOpen(code)));
  setDoor(code, doorOpen(code));
  document.getElementById('bToggle').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const open = btn.dataset.open === '1';
    btn.disabled = true;
    try {
      const r = await trpc('skill_room_set_open', { p_code: code, p_open: open });
      if (!r.ok) { toast(errText(r.error, r), 'error'); return; }
      poller && poller.invalidate();
      poller && poller.refresh();
    } catch (e) {
      toast('Fehler: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  poller = MPRoom.poll({
    sig:  () => trpc('skill_room_sig', { p_code: code }),
    view: () => trpc('skill_room_get', { p_code: code }),
    onChange: (data) => paintBeamer(code, data),
    onError: (err) => {
      if (err === 'not_found') {
        if (poller) { poller.stop(); poller = null; }
        unmountTool();
        host().innerHTML = `<div class="card"><div class="msg msg--err">Diesen Raum gibt es nicht
          (mehr) — oder er gehört nicht dir.</div>
          <p><a href="lehrer.html">Zurück zu meinen Räumen</a></p></div>`;
        document.body.classList.remove('beamer');
        return;
      }
      // Netzfehler: die Anzeige bleibt stehen. Ein leerer Beamer
      // mitten in der Stunde wäre schlimmer als ein Bild, das ein
      // paar Sekunden alt ist.
      const box = document.getElementById('bErr');
      if (box) {
        box.textContent = 'Keine Verbindung — die Anzeige ist vielleicht nicht aktuell.';
        box.hidden = false;
      }
    }
  });
}

function paintBeamer(code, data) {
  const r = data.room;
  const box = document.getElementById('bErr');
  if (box) box.hidden = true;

  document.getElementById('bTitle').textContent    = r.title;
  document.getElementById('bToolName').textContent = (r.tool_icon || '') + ' ' + (r.tool_title || '');
  document.title = r.title + ' · MPSkills';

  const url = MPRoom.joinUrl(code);
  document.getElementById('bUrl').textContent = url.replace(/^https?:\/\//, '');

  // Genau einmal zeichnen. Der QR-Code ändert sich nie, und etwas,
  // das gescannt werden soll, darf nicht alle drei Sekunden neu
  // aufgebaut werden.
  if (qrDrawn !== code) {
    try {
      // Ruhezone 4 Module — das ist der Normwert und keine Zierde:
      // ein Lesegerät findet die Suchmarkierungen nur, wenn um den
      // Code herum genug Weiß steht. Am Beamer, schräg und aus zehn
      // Metern, ist das der Unterschied zwischen „geht sofort" und
      // „geht bei manchen nicht".
      document.getElementById('bQr').innerHTML = MPQR.svg(url, { title: 'Code ' + code });
      qrDrawn = code;
    } catch (e) {
      document.getElementById('bQr').innerHTML =
        `<div class="qr-wait">QR-Code ließ sich nicht erzeugen.<br>Der Code funktioniert trotzdem.</div>`;
      console.error('[mpskills] QR:', e);
    }
  }

  const people = data.people || [];
  const online = people.filter(p => p.online).length;
  document.getElementById('bCount').textContent  = String(people.length);
  document.getElementById('bOnline').textContent = online === people.length ? '' : `(${online} gerade da)`;

  const tg = document.getElementById('bToggle');
  tg.dataset.open  = r.join_open ? '0' : '1';
  tg.textContent   = r.join_open ? 'Beitritt schließen' : 'Beitritt öffnen';
  tg.classList.toggle('btn--primary', !r.join_open);

  document.getElementById('bNames').innerHTML = people.map(p => `
    <li class="chip${p.online ? ' chip--on' : ''}">${esc(p.name)}</li>`).join('')
    || '<li class="chip chip--wait">Noch niemand da — der Code steht bereit.</li>';

  // Beim ersten Durchlauf montieren (vorher kennen wir das Werkzeug
  // nicht), danach nur noch durchreichen.
  if (!tool) mountTool(code, data);
  else tool.update(data);
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
  }
}

/* ══════════════════════════════════════════════════════════
   Weiche + Start
   ══════════════════════════════════════════════════════════ */
function route() {
  const code = MPRoom.normalizeCode(location.hash.replace(/^#/, ''));
  if (MPRoom.isCode(code)) { renderBeamer(code); return Promise.resolve(); }
  return renderList();
}

document.getElementById('newClose').addEventListener('click',
  () => { document.getElementById('newModal').hidden = true; });
document.getElementById('newForm').addEventListener('submit', submitNew);
// Anderes Werkzeug = andere Zusatzfelder.
document.getElementById('newTool').addEventListener('change',
  (ev) => renderToolFields(ev.target.value));
document.getElementById('newModal').addEventListener('click', (e) => {
  if (e.target.id === 'newModal') document.getElementById('newModal').hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('newModal').hidden = true;
});
window.addEventListener('hashchange', route);

(async function boot() {
  await (window.waitForSession?.() ?? Promise.resolve());
  const s = window.getSessionUser?.();

  if (!s) {
    host().innerHTML = `<div class="card card--join">
        <h1 class="join-h">Bitte anmelden</h1>
        <p class="join-sub">Räume verwaltet nur, wer als Lehrkraft angemeldet ist.</p>
        <a class="btn btn--primary btn--wide" href="index.html">Zur Anmeldung</a>
      </div>`;
    return;
  }

  const isAdmin   = s.is_admin || s.is_superadmin;
  const isTeacher = s.teacher_status === 'approved';
  document.getElementById('userBar').hidden = false;
  document.getElementById('userName').textContent = s.display_name || s.account_name;
  const pill = document.getElementById('userRole');
  if (isAdmin)        { pill.textContent = 'Admin';     pill.hidden = false; }
  else if (isTeacher) { pill.textContent = 'Lehrkraft'; pill.hidden = false; }

  if (!isAdmin && !isTeacher) {
    host().innerHTML = `<div class="card card--join">
        <h1 class="join-h">Noch nicht freigeschaltet</h1>
        <p class="join-sub">Für MPSkills bist du noch nicht als Lehrkraft freigeschaltet.</p>
        <a class="btn btn--primary btn--wide" href="index.html">Zurück zu MPSkills</a>
      </div>`;
    return;
  }

  await route();

  // Von der Kachel „Für eine Klasse öffnen" auf der Landing kommt
  // ?new=<tool>. Der Dialog gehört hierher und nicht dorthin: die
  // Obergrenzen und die Werkzeugliste stehen in der Antwort von
  // skill_rooms_list, die nur diese Seite holt.
  const wanted = new URLSearchParams(location.search).get('new');
  if (wanted && !MPRoom.isCode(MPRoom.normalizeCode(location.hash.replace(/^#/, '')))) {
    history.replaceState(null, '', location.pathname);
    openNew(wanted);
  }
})();
