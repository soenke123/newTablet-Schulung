/* ══════════════════════════════════════════════════════════════
   MPSkills — j.js   ·   Beitritt und Raum aus Schülersicht
   ══════════════════════════════════════════════════════════════
   Ziel des QR-Codes: j.html#K7F2QM. Der Code steht im Hash und
   nicht im Query-String — so landet er nicht in Server-Logs.

   Vier Zustände, eine Seite:
     ask   — kein Code da: Feld zum Abtippen (der Rückfallweg für
             Geräte ohne Kamera)
     door  — Code geprüft, Raum gefunden: Titel, Werkzeug, Name
     room  — drin: wer ist da
     gone  — Raum weg, abgelaufen oder gelöscht

   In dieser Ausbaustufe kann ein Raum genau eine Sache: zeigen,
   wer da ist. Das Werkzeug selbst (Wortwolke, Abstimmung) kommt
   in Stufe 4 und hängt sich dann in denselben Raum.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
const host = () => document.getElementById('joinHost');

let poller = null;   // läuft nur im Zustand 'room'

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
  server_misconfigured: 'Der Server ist nicht richtig eingerichtet. Bitte der Lehrkraft Bescheid sagen.'
};
const errText = (code) => ERRORS[code] || 'Etwas hat nicht geklappt. Bitte noch einmal versuchen.';

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
function renderRoom(code, token) {
  if (poller) { poller.stop(); poller = null; }

  host().innerHTML = `
    <div class="card card--room">
      <div class="room-head">
        <div>
          <div class="door-tool"><span class="door-ic" id="rTip">🧩</span><span id="rTool"></span></div>
          <h1 class="join-h" id="rTitle">…</h1>
        </div>
        <code class="code-chip">${esc(code)}</code>
      </div>
      <p class="join-sub" id="rMe"></p>
      <div class="msg msg--warn" id="rWarn" hidden></div>

      <div class="soon" id="rSoon">
        <strong>Du bist drin.</strong> Das Werkzeug selbst kommt in der nächsten
        Ausbaustufe — bis dahin zeigt der Raum, wer da ist.
      </div>

      <h2 class="card-h">Wer ist da? <span class="card-h-note" id="rCount"></span></h2>
      <ul class="people" id="rPeople"></ul>

      <p class="join-foot">
        <button type="button" class="btn--link" id="leaveBtn">Diesen Raum von diesem Gerät entfernen</button>
      </p>
    </div>`;

  document.getElementById('leaveBtn').addEventListener('click', () => {
    if (!confirm('Der Raum verschwindet nur von diesem Gerät. Um wieder mitzumachen, '
               + 'brauchst du den Code erneut. Fortfahren?')) return;
    MPRoom.forget(code);
    if (poller) { poller.stop(); poller = null; }
    history.replaceState(null, '', location.pathname);
    renderAsk('');
    toast('Raum von diesem Gerät entfernt.');
  });

  poller = MPRoom.poll({
    sig:  () => MPRoom.sig(token),
    view: () => MPRoom.view(token),
    onChange: paintRoom,
    onError: (err) => {
      // 'room_gone' und 'unknown_token' sind keine Netzfehler,
      // sondern das Ende dieses Raums — mit einer klaren Meldung
      // statt eines stehengebliebenen Bildschirms.
      if (err === 'room_gone' || err === 'unknown_token') {
        if (poller) { poller.stop(); poller = null; }
        MPRoom.forget(code);
        renderGone(err);
      }
      // Alles andere ist mit hoher Wahrscheinlichkeit das WLAN.
      // Der Poller versucht es in drei Sekunden von selbst wieder.
    }
  });
}

function paintRoom(data) {
  const r = data.room, me = data.me;
  document.getElementById('rTitle').textContent = r.title;
  document.getElementById('rTool').textContent  = r.tool_title || '';
  document.getElementById('rTip').textContent   = r.tool_icon  || '🧩';
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
}

/* ─── Zustand: weg ────────────────────────────────────────── */
function renderGone(reason) {
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
