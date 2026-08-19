/* ══════════════════════════════════════════════════════════════
   MPSkills — j.js   ·   Beitritt und Raum aus Schülersicht
   ══════════════════════════════════════════════════════════════
   Ziel des QR-Codes: j.html#K7F2QM. Der Code steht im Hash und
   nicht im Query-String — so landet er nicht in Server-Logs.

   Vier Zustände, eine Seite:
     ask   — kein Code da: Feld zum Abtippen (der Rückfallweg für
             Geräte ohne Kamera)
     door  — Code geprüft, Raum gefunden: Titel, Werkzeug, Name
     room  — drin: zwei Reiter, siehe unten
     gone  — Raum weg, abgelaufen oder gelöscht

   Seit Stufe 4 hängt im Zustand 'room' das WERKZEUG mit drin —
   die Wolke, die Abstimmung, was auch immer der Raum führt. Diese
   Datei weiß davon nichts weiter, als wo es hingehört und wann es
   neue Daten bekommt: sie lädt das Modul über lib/tool.js, ruft
   mount() einmal und update() bei jeder Änderung.

   ── Zwei Reiter im Raum (Umbau 18.08.2026) ────────────────────
   Vorher stand die Raumkarte dauerhaft über dem Werkzeug und nahm
   ihm auf einem Tablet ein Viertel der Höhe — für eine Auskunft,
   die man einmal liest. Jetzt sind es zwei Fächer, und offen ist
   von Anfang an das Werkzeug: dafür ist man hier.

     Raum       wer ist da, wie heiße ich, der Code (falls der
                Nachbar ihn braucht), Raum vom Gerät entfernen
     <Werkzeug> die ganze Fläche

   Dieselbe Aufteilung wie auf der Lehrerseite, nur ohne das erste
   Fach: Einstellungen gehören der Lehrkraft, und die Tür am Rand
   gibt es hier auch nicht — wer drin ist, muss nicht mehr rein.

   Die Aufteilung ist Absicht. Was hier steht (Beitritt, Token,
   Poller, Fehlerbilder) gilt für JEDES Werkzeug und darf sich
   nicht je Werkzeug wiederholen; was das Werkzeug tut, geht diese
   Datei nichts an.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
const host = () => document.getElementById('joinHost');
const toolHost = () => document.getElementById('toolHost');
const tabHost  = () => document.getElementById('tabHost');
const mainWrap = () => document.getElementById('mainWrap');

let poller = null;   // läuft nur im Zustand 'room'
let tool   = null;   // geladenes Werkzeug-Modul, solange eines montiert ist
// Welches Fach offen ist — und zugleich der Marker „wir sind in einem
// Raum". null heißt: Code eintippen, Tür oder Ende.
let jPane  = null;
let qrDone = null;   // für welchen Code der kleine QR schon im DOM steht
// Das Laden ist asynchron, der Poller nicht: ohne diesen Riegel käme
// der nächste Takt, während noch geladen wird, fände tool === null und
// montierte ein zweites Mal — doppeltes DOM, doppelte Listener.
let toolBusy = false;
// Steht gerade die Sperrmeldung statt des Raums? Siehe showBlocked().
let blockedShown = false;

/* ─── Toast ───────────────────────────────────────────────── */
let toastTimer = null;
function toast(message, kind) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (kind === 'error' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

/* ─── Fehlertexte ─────────────────────────────────────────── */
// Ein Schüler soll lesen, was los ist, und nicht, was schiefging.
const ERRORS = {
  not_found:     'Diesen Code gibt es nicht. Schau noch einmal auf die Tafel.',
  code_invalid:  'Der Code besteht aus 6 Zeichen — Buchstaben und Ziffern.',
  room_expired:  'Dieser Raum ist abgelaufen.',
  room_gone:     'Diesen Raum gibt es nicht mehr.',
  unknown_token: 'Dieser Raum gehört nicht mehr zu diesem Gerät.',
  join_closed:   'Die Lehrkraft hat den Beitritt geschlossen.',
  room_full:     'Dieser Raum ist voll.',
  name_required: 'Bitte trag deinen Namen ein.',
  name_invalid:  'Der Name geht so nicht. Buchstaben, Ziffern und Leerzeichen, höchstens 24 Zeichen.',
  name_blocked:  'Diesen Namen bitte nicht.',
  name_too_long: 'Der Name ist zu lang — höchstens 24 Zeichen.',
  rate_limit:    'Zu viele Versuche von diesem Netz. Bitte warte einen Moment.',
  text_blocked:  'Solche Wörter bitte nicht. Schreib es anders.',
  blocked:       'Deine Lehrkraft hat dieses Tablet gerade stillgelegt.',
  server_misconfigured: 'Der Server ist nicht richtig eingerichtet. Bitte der Lehrkraft Bescheid sagen.'
};
const errText = (code) => ERRORS[code] || 'Etwas hat nicht geklappt. Bitte noch einmal versuchen.';

/* ─── Die zwei Fächer ─────────────────────────────────────── */
/* Das Werkzeug hängt in #toolHost und damit AUSSERHALB der schmalen
   Spalte — die Raumkarte darf schmal bleiben (sie ist eine Auskunft),
   eine Wolke nicht. Umgeschaltet wird deshalb zwischen zwei Kästen,
   die auf der Seite nebeneinanderstehen, und nicht innerhalb eines. */
function showJPane(which) {
  jPane = which;
  document.querySelectorAll('#tabHost .rtab').forEach(b => {
    const on = b.dataset.pane === which;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  mainWrap().hidden = (which !== 'room');
  toolHost().hidden = (which !== 'tool');
  document.body.classList.toggle('pane-tool', which === 'tool');

  // Ein ausgeblendetes Fach hat keine Maße; das Werkzeug rechnet seine
  // Fläche aber aus dem, was über ihm steht. Also nachmessen lassen,
  // sobald es wieder sichtbar ist.
  if (which === 'tool') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function renderTabs(code, room) {
  tabHost().innerHTML = `
    <nav class="rtabs" aria-label="Raum">
      <div class="rtabs-tabs" role="tablist">
        <button type="button" class="rtab" role="tab" data-pane="room" aria-selected="false">
          <span class="rtab-t">Raum</span></button>
        <button type="button" class="rtab" role="tab" data-pane="tool" aria-selected="false">
          <span class="rtab-t" id="jToolName">${esc((room?.tool_icon || '🧩') + ' '
            + (room?.tool_title || 'Skill'))}</span></button>
      </div>
      <div class="rtabs-side">
        <code class="rtabs-code">${esc(code)}</code>
      </div>
    </nav>`;
  tabHost().querySelectorAll('.rtab').forEach(b => {
    b.addEventListener('click', () => showJPane(b.dataset.pane));
  });
}

/* Verlassen wir den Raum, muss die Leiste weg und die schmale Spalte
   zurück — sonst stünden über der Code-Eingabe zwei Reiter, die ins
   Leere zeigen. */
function clearTabs() {
  jPane = null;
  qrDone = null;
  tabHost().innerHTML = '';
  mainWrap().hidden = false;
  document.body.classList.remove('roomview', 'pane-tool');
}

/* ─── Werkzeug ────────────────────────────────────────────── */
// Einmal montieren, danach nur noch füttern. Welches Werkzeug es ist,
// steht im Raum — diese Datei kennt keinen einzigen Werkzeugnamen.
async function mountTool(view, token) {
  const id = view.room?.tool_id;
  if (!id || tool || toolBusy) return;
  toolBusy = true;

  const box = toolHost();
  box.innerHTML = '<p class="booting">Skill wird geladen …</p>';

  let impl;
  try {
    impl = await window.MPTool.load(id, view.room.tool_folder);
  } catch (e) {
    // Kein Weltuntergang: der Raum funktioniert, die Teilnehmerliste
    // steht, nur der Skill fehlt. Also sagen, was los ist, statt die
    // Seite abzuräumen.
    console.error('[mpskills] Skill laden:', e);
    box.innerHTML = `<div class="card"><div class="msg msg--err">Dieser Skill lässt sich gerade
      nicht laden. Sag deiner Lehrkraft Bescheid.</div>
      <button type="button" class="btn" onclick="location.reload()">Noch einmal</button></div>`;
    return;
  } finally {
    toolBusy = false;
  }

  // Während geladen wurde, kann der Raum verlassen worden sein
  // (Hash-Wechsel, „Raum entfernen"). Dann darf der Kasten nicht wieder
  // gefüllt werden. Gefragt wird nach jPane und nicht danach, ob der
  // Kasten sichtbar ist: sichtbar ist er auch dann nicht, wenn gerade
  // nur das andere Fach offen steht.
  if (jPane === null) return;

  const ctx = window.MPTool.makeCtx({
    actions: window.MPTool.participantActions(token),
    title:   view.room.title,
    toast:   (m, err) => toast(m, err ? 'error' : ''),
    // Nach einer eigenen Änderung nicht bis zum nächsten Takt warten:
    // invalidate() vergisst die gemerkte Signatur, refresh() holt sofort.
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
  const box = toolHost();
  if (box) { box.innerHTML = ''; box.hidden = true; }
}

/* ─── Zustand: Code abtippen ──────────────────────────────── */
// Sechs Einzelfelder statt eines langen: das ist auf einem Tablet
// leichter zu treffen, macht die Länge sichtbar und zeigt sofort,
// an welcher Stelle noch etwas fehlt.
function renderAsk(prefill, errorMsg) {
  const mine = MPRoom.list();
  host().innerHTML = `
    <div class="card card--join">
      <h1 class="join-h">Code von der Tafel</h1>
      <p class="join-sub">Deine Lehrkraft zeigt einen Code aus 6 Zeichen.</p>
      ${errorMsg ? `<div class="msg msg--err">${esc(errorMsg)}</div>` : ''}
      <form id="codeForm" novalidate>
        <div class="codebox" id="codeBox">
          ${[0,1,2,3,4,5].map(i => `
            <input class="codecell" type="text" inputmode="latin"
                   autocapitalize="characters" autocomplete="off" spellcheck="false"
                   maxlength="1" aria-label="Zeichen ${i+1}" data-i="${i}" />`).join('')}
        </div>
        <button type="submit" class="btn btn--primary btn--wide" id="codeGo">Weiter</button>
      </form>
    </div>
    ${mine.length ? `
      <div class="card">
        <h2 class="card-h">Meine Räume <span class="card-h-note">auf diesem Gerät</span></h2>
        <ul class="roomlist">
          ${mine.map(r => `
            <li>
              <a href="#${esc(r.code)}" class="roomlist-a">
                <span class="roomlist-ic">${esc(r.room?.tool_icon || '🧩')}</span>
                <span class="roomlist-txt">
                  <strong>${esc(r.room?.title || r.code)}</strong>
                  <span>${esc(r.room?.tool_title || '')} · als ${esc(r.name || '—')}</span>
                </span>
                <code class="roomlist-code">${esc(r.code)}</code>
              </a>
            </li>`).join('')}
        </ul>
      </div>` : ''}
  `;

  const cells = [...document.querySelectorAll('.codecell')];

  // Eingabe über alle sechs Felder hinweg wie EIN Feld behandeln.
  cells.forEach((cell, i) => {
    cell.addEventListener('input', () => {
      const v = MPRoom.normalizeCode(cell.value);
      if (v.length > 1) {
        // Eingefügter oder schnell getippter Code: auf die Felder verteilen.
        spread(v, i);
        return;
      }
      cell.value = v;
      if (v && i < 5) cells[i + 1].focus();
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !cell.value && i > 0) { cells[i-1].focus(); e.preventDefault(); }
      if (e.key === 'ArrowLeft'  && i > 0) { cells[i-1].focus(); e.preventDefault(); }
      if (e.key === 'ArrowRight' && i < 5) { cells[i+1].focus(); e.preventDefault(); }
    });
    cell.addEventListener('paste', (e) => {
      const t = (e.clipboardData || window.clipboardData).getData('text');
      if (t) { e.preventDefault(); spread(MPRoom.normalizeCode(t), i); }
    });
  });

  function spread(text, from) {
    for (let k = 0; k < text.length && from + k < 6; k++) cells[from + k].value = text[k];
    const next = Math.min(from + text.length, 5);
    cells[next].focus();
    // Sechs volle Felder = fertig getippt, also gleich weiter. Ohne
    // requestSubmit (ältere Safari-Versionen) den Knopf drücken —
    // form.submit() würde das submit-Ereignis überspringen und die
    // Seite wirklich abschicken.
    if (readCode().length === 6) {
      const form = document.getElementById('codeForm');
      if (form.requestSubmit) form.requestSubmit();
      else document.getElementById('codeGo').click();
    }
  }
  function readCode() { return cells.map(c => c.value).join('').toUpperCase(); }

  if (prefill) spread(MPRoom.normalizeCode(prefill), 0);
  else setTimeout(() => cells[0].focus(), 60);

  document.getElementById('codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = readCode();
    if (!MPRoom.isCode(code)) { renderAsk(code, ERRORS.code_invalid); return; }
    // Steht derselbe Code schon im Hash, feuert hashchange nicht —
    // das passiert genau dann, wenn ein Versuch fehlgeschlagen ist
    // und jemand es noch einmal probiert. Ohne diesen Zweig wäre
    // der „Weiter"-Knopf an der Stelle tot.
    if (location.hash.replace(/^#/, '').toUpperCase() === code) route();
    else location.hash = code;
  });
}

/* ─── Zustand: die Tür ────────────────────────────────────── */
async function renderDoor(code) {
  host().innerHTML = '<p class="booting">Raum wird gesucht …</p>';

  let info;
  try {
    info = await MPRoom.peek(code);
  } catch (e) {
    host().innerHTML = `<div class="card"><div class="msg msg--err">Keine Verbindung. ${esc(e.message)}</div>
      <button type="button" class="btn" onclick="location.reload()">Noch einmal</button></div>`;
    return;
  }

  if (!info.ok) {
    renderAsk(code, errText(info.error));
    return;
  }

  const full   = info.full && info.join_open;
  const closed = !info.join_open;

  host().innerHTML = `
    <div class="card card--join">
      <div class="door-tool">
        <span class="door-ic">${esc(info.tool_icon || '🧩')}</span>
        <span>${esc(info.tool_title || '')}</span>
      </div>
      <h1 class="join-h">${esc(info.title)}</h1>
      <p class="join-sub">${esc(info.people)} ${info.people === 1 ? 'Person ist' : 'Personen sind'} schon da.</p>

      <div class="msg msg--err" id="joinError" hidden></div>

      ${closed ? `
        <div class="msg msg--warn">Die Lehrkraft hat den Beitritt gerade geschlossen.
          Wenn sie ihn wieder öffnet, probier es noch einmal.</div>
        <button type="button" class="btn btn--wide" id="againBtn">Noch einmal versuchen</button>
      ` : full ? `
        <div class="msg msg--warn">Dieser Raum ist voll.</div>
        <button type="button" class="btn btn--wide" id="againBtn">Noch einmal versuchen</button>
      ` : `
        <form id="joinForm" novalidate>
          ${info.ask_names ? `
            <label class="field">Dein Name
              <input type="text" id="joinName" maxlength="24" autocomplete="given-name"
                     enterkeyhint="go" required />
              <span class="rule">Den sieht die Klasse.</span>
            </label>` : `
            <p class="anon-note">In diesem Raum bleibt ihr anonym — du brauchst keinen Namen
            einzutragen.</p>`}
          <button type="submit" class="btn btn--primary btn--wide" id="joinGo">Mitmachen</button>
        </form>
        <!-- Der Hinweis steht VOR dem Beitritt, nicht irgendwo im Fuß:
             wer gleich seinen Namen eintippt, soll in dem Moment wissen,
             wer ihn sieht und wie lange er bleibt. Kurz, mit dem
             Ausführlichen einen Klick entfernt. -->
        <p class="privacy-note">
          ${info.ask_names
            ? 'Dein Name und was du schreibst sind für alle im Raum sichtbar.'
            : 'Dieser Raum ist anonym — du heißt hier nur „Tablet …".'}
          Nach 30 Tagen ohne Aktivität wird alles automatisch gelöscht.
          <a href="index.html#privacy">Mehr dazu</a>
        </p>
      `}
      <p class="join-foot"><button type="button" class="btn--link" id="otherCode">Anderen Code eingeben</button></p>
    </div>`;

  document.getElementById('otherCode').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    renderAsk('');
  });
  const again = document.getElementById('againBtn');
  if (again) again.addEventListener('click', () => renderDoor(code));

  const form = document.getElementById('joinForm');
  if (!form) return;

  const nameInput = document.getElementById('joinName');
  if (nameInput) setTimeout(() => nameInput.focus(), 60);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('joinError');
    const btn    = document.getElementById('joinGo');
    errBox.hidden = true;

    const name = nameInput ? nameInput.value.trim() : '';
    if (info.ask_names && !name) {
      errBox.textContent = ERRORS.name_required;
      errBox.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Einen Moment …';
    try {
      const res = await MPRoom.join(code, name);
      if (!res.ok) {
        errBox.textContent = errText(res.error);
        errBox.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Mitmachen';
        return;
      }
      MPRoom.remember({
        code, token: res.token, name: res.name, seat: res.seat, room: res.room
      });
      renderRoom(code, res.token);
    } catch (ex) {
      errBox.textContent = 'Keine Verbindung: ' + (ex.message || ex);
      errBox.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Mitmachen';
    }
  });
}

/* ─── Zustand: im Raum ────────────────────────────────────── */
/* ─── Zustand: stillgelegt ────────────────────────────────────
   Die Lehrkraft hat dieses Tablet gesperrt. Der Poller läuft dabei
   ABSICHTLICH weiter: eine Sperre ist umkehrbar, und wenn sie
   aufgehoben wird, soll der Raum von selbst zurückkommen — ein
   Schüler, der erst die Seite neu laden muss, sitzt sonst weiter
   draußen, obwohl er längst wieder darf.

   Bewusst ohne Begründung im Text: warum gesperrt wurde, klärt sich
   im Klassenraum und nicht auf dem Bildschirm. */
function showBlocked() {
  if (blockedShown) return;
  blockedShown = true;
  unmountTool();
  // Die Reiter gehören zu einem Raum, in dem man mitmachen darf. Wer
  // stillgelegt ist, hat nichts zu wechseln — und soll den Satz lesen,
  // statt daneben auf ein leeres Werkzeug zu tippen.
  clearTabs();
  host().innerHTML = `
    <div class="card card--join">
      <h1 class="join-h">Kurze Pause</h1>
      <p class="join-sub">${esc(ERRORS.blocked)}</p>
      <p class="rule">Sobald sie es wieder freigibt, geht es hier von allein weiter —
      du musst nichts tun.</p>
    </div>`;
}

function renderRoom(code, token) {
  if (poller) { poller.stop(); poller = null; }
  unmountTool();
  blockedShown = false;

  // „Zuletzt besucht" ist jetzt, und nicht der Tag des Beitritts —
  // die Kachel auf der Landing lebt davon.
  MPRoom.touch(code);

  /* Das Fach „Raum": alles, was man einmal liest und danach nur noch
     selten braucht. Die Teilnehmerliste steht deshalb wieder offen da
     und nicht mehr zugeklappt — sie nimmt hier niemandem etwas weg. */
  document.body.classList.add('roomview');
  renderTabs(code, MPRoom.get(code)?.room || null);
  host().innerHTML = `
    <div class="card card--room">
      <!-- Ohne Code-Chip: der Code steht seit dem Umbau in der
           Reiterleiste und damit auf beiden Fächern. Zweimal
           dasselbe auf einem Bildschirm ist eine Frage zu viel. -->
      <div class="room-head">
        <div>
          <div class="door-tool"><span class="door-ic" id="rTip">🧩</span><span id="rTool"></span></div>
          <h1 class="join-h" id="rTitle">…</h1>
        </div>
      </div>
      <p class="join-sub" id="rMe"></p>
      <div class="msg msg--warn" id="rWarn" hidden></div>

      <h2 class="card-h">Wer ist da? <span class="card-h-note" id="rCount"></span></h2>
      <ul class="people" id="rPeople"></ul>

      <!-- Der Code steht hier klein mit dabei, samt QR: wenn der
           Nachbar nicht hereinkommt, ist das Gerät in der Hand näher
           als die Tafel vorn. Gezeichnet wird er erst, wenn dieses
           Fach zum ersten Mal geöffnet wird. -->
      <details class="qrbox" id="jQrBox">
        <summary>Jemanden dazuholen</summary>
        <div class="qrbox-in">
          <div class="qrbox-qr" id="jQr"></div>
          <div>
            <div class="bigcode bigcode--sm">${esc(code)}</div>
            <p class="beam-url" id="jUrl"></p>
          </div>
        </div>
      </details>

      <!-- Heißt genauso wie der Eintrag hinter den drei Punkten auf
           der Landing: eine Sache, ein Name. Was dabei genau
           passiert, sagt die Rückfrage — und das ist mit und ohne
           Anmeldung nicht dasselbe. -->
      <p class="join-foot">
        <button type="button" class="btn--link" id="leaveBtn">Diesen Raum verlassen</button>
      </p>
    </div>`;

  const url = MPRoom.joinUrl(code);
  document.getElementById('jUrl').textContent = url.replace(/^https?:\/\//, '');
  document.getElementById('jQrBox').addEventListener('toggle', (ev) => {
    if (!ev.target.open || qrDone === code) return;
    try {
      document.getElementById('jQr').innerHTML = MPQR.svg(url, { title: 'Code ' + code });
      qrDone = code;
    } catch (e) {
      document.getElementById('jQr').innerHTML =
        '<div class="qr-wait">Der Code oben funktioniert trotzdem.</div>';
      console.error('[mpskills] QR:', e);
    }
  });

  /* Deine Zettel bleiben stehen — das ist die Frage, die bei einem
     Knopf namens „verlassen" zuerst kommt, und die Antwort ist
     dieselbe wie beim Ausblenden: hier verschwindet eine Liste,
     kein Inhalt. Der Rückweg ist der Code, mehr braucht es nicht. */
  document.getElementById('leaveBtn').addEventListener('click', async () => {
    const everywhere = !!(window.isLoggedIn && window.isLoggedIn());
    if (!confirm(
      (everywhere
        ? 'Der Raum verschwindet aus deiner Liste — auf allen deinen Geräten. '
        : 'Der Raum verschwindet von diesem Gerät. ')
      + 'Was du geschrieben hast, bleibt für die Klasse stehen. Mit dem Code kommst '
      + 'du jederzeit zurück.\n\nFortfahren?')) return;

    if (poller) { poller.stop(); poller = null; }
    unmountTool();
    clearTabs();
    await MPRoom.leave(code);
    history.replaceState(null, '', location.pathname);
    renderAsk('');
    toast('Raum verlassen.');
  });

  /* Offen ist das Werkzeug und nicht der Raum: wer hier ankommt, ist
     gerade beigetreten oder kommt zurück — beides heißt „ich will
     mitmachen", nicht „wer ist da". Das Werkzeug lädt noch, der Kasten
     sagt das solange. */
  toolHost().innerHTML = '<p class="booting">Raum wird geladen …</p>';
  showJPane('tool');

  poller = MPRoom.poll({
    sig:  () => MPRoom.sig(token),
    view: () => MPRoom.view(token),
    onChange: (data) => paintRoom(data, token),
    onError: (err) => {
      // 'room_gone' und 'unknown_token' sind keine Netzfehler,
      // sondern das Ende dieses Raums — mit einer klaren Meldung
      // statt eines stehengebliebenen Bildschirms.
      if (err === 'room_gone' || err === 'unknown_token') {
        if (poller) { poller.stop(); poller = null; }
        unmountTool();
        MPRoom.forget(code);
        renderGone(err);
        return;
      }
      // 'blocked' ist das Gegenteil eines Endes: der Poller läuft
      // weiter, damit das Aufheben von selbst ankommt.
      if (err === 'blocked') { showBlocked(); return; }
      // Alles andere ist mit hoher Wahrscheinlichkeit das WLAN.
      // Der Poller versucht es in drei Sekunden von selbst wieder und
      // meldet sich über onNet, wenn es länger dauert.
    },
    onNet: MPRoom.showNet
  });
}

function paintRoom(data, token) {
  /* Die Sperre ist aufgehoben — es kommen wieder Daten. Der Raum wird
     komplett neu aufgebaut, weil showBlocked() sein DOM ersetzt hat;
     renderRoom startet dabei auch den Poller neu, was hier drin
     genau richtig ist: der alte hat seine Arbeit getan.

     Muss die ERSTE Zeile sein — alles darunter greift auf Elemente
     zu, die es während der Sperre nicht gibt. */
  if (blockedShown) {
    blockedShown = false;
    renderRoom(data.room.code, token);
    return;
  }

  const r = data.room, me = data.me;
  // Die Abschrift im Gerät ist vom Beitrittstag. Hier steht der
  // aktuelle Stand — also wird sie nachgeführt, damit die Kacheln
  // auf der Landing auch ohne Anmeldung stimmen (Titel, und seit
  // 0090 der Name der Lehrkraft).
  MPRoom.snapshot(r.code, r);
  document.getElementById('rTitle').textContent = r.title;
  document.getElementById('rTool').textContent  = r.tool_title || '';
  document.getElementById('rTip').textContent   = r.tool_icon  || '🧩';
  // Der Reiter trug bis hierher, was im Gerätespeicher stand — das
  // kann von gestern sein. Ab jetzt steht der Name des Skills drauf,
  // den der Server nennt.
  const tabName = document.getElementById('jToolName');
  if (tabName) tabName.textContent = `${r.tool_icon || '🧩'} ${r.tool_title || 'Skill'}`;
  document.getElementById('rMe').textContent    = `Du bist dabei als ${me.name}.`;
  document.title = r.title + ' · MPSkills';

  const warn = document.getElementById('rWarn');
  if (!r.join_open) {
    warn.textContent = 'Der Beitritt ist geschlossen — du bist drin und bleibst drin.';
    warn.hidden = false;
  } else {
    warn.hidden = true;
  }

  const people = data.people || [];
  const online = people.filter(p => p.online).length;
  document.getElementById('rCount').textContent = `${online} von ${people.length} gerade da`;
  document.getElementById('rPeople').innerHTML = people.map(p => `
    <li class="person${p.online ? ' person--on' : ''}${p.is_me ? ' person--me' : ''}">
      <span class="dot" aria-hidden="true"></span>
      <span>${esc(p.name)}</span>
      ${p.is_me ? '<span class="person-tag">du</span>' : ''}
    </li>`).join('');

  // Beim ersten Durchlauf montieren (vorher kennen wir das Werkzeug
  // nicht), danach nur noch durchreichen.
  if (!tool) mountTool(data, token);
  else tool.update(data);
}

/* ─── Zustand: weg ────────────────────────────────────────── */
function renderGone(reason) {
  unmountTool();
  clearTabs();
  host().innerHTML = `
    <div class="card card--join">
      <h1 class="join-h">Der Raum ist zu Ende</h1>
      <p class="join-sub">${esc(errText(reason))}</p>
      <button type="button" class="btn btn--primary btn--wide" id="backBtn">Anderen Code eingeben</button>
    </div>`;
  document.getElementById('backBtn').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    renderAsk('');
  });
}

/* ─── Weiche ──────────────────────────────────────────────── */
// Der Hash entscheidet: kein Code → Eingabefeld. Code, den dieses
// Gerät schon kennt → direkt hinein (kein zweiter Beitritt, kein
// zweiter Platz). Sonst die Tür.
async function route() {
  if (poller) { poller.stop(); poller = null; }
  // Jeder Zustandswechsel außer „im Raum bleiben" nimmt das Werkzeug
  // mit. renderRoom montiert es gleich wieder — auch das ist richtig:
  // ein anderer Code ist ein anderer Raum und womöglich ein anderes
  // Werkzeug.
  unmountTool();
  clearTabs();

  const code = MPRoom.normalizeCode(location.hash.replace(/^#/, ''));
  if (!code) { renderAsk(''); return; }
  if (!MPRoom.isCode(code)) { renderAsk(code, ERRORS.code_invalid); return; }

  const known = MPRoom.get(code);
  if (known) { renderRoom(code, known.token); return; }

  // Angemeldet und auf einem zweiten Gerät? Dann hängt der
  // Teilnehmer an der User-ID und wird wiedergefunden, statt einen
  // zweiten Platz zu belegen.
  if (window.isLoggedIn && window.isLoggedIn()) {
    try {
      const mine = await MPRoom.rpc('skill_my_rooms', {});
      const hit = (mine?.rooms || []).find(r => r.room?.code === code);
      if (hit) {
        MPRoom.remember({ code, token: hit.token, name: hit.name, seat: hit.seat, room: hit.room });
        renderRoom(code, hit.token);
        return;
      }
    } catch (e) {
      console.warn('[mpskills] skill_my_rooms:', e.message);
    }
  }

  renderDoor(code);
}

window.addEventListener('hashchange', route);

/* ─── Start ───────────────────────────────────────────────── */
(async function boot() {
  // Auf die Sitzung warten, aber nicht ewig: ein Teilnehmer
  // braucht kein Konto, und waitForSession löst sich spätestens
  // nach drei Sekunden von selbst auf.
  await (window.waitForSession?.() ?? Promise.resolve());

  const s = window.getSessionUser?.();
  if (s) {
    document.getElementById('whoBar').hidden = false;
    document.getElementById('whoName').textContent = s.display_name || s.account_name;
  }
  route();
})();
