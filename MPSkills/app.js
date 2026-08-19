/* ══════════════════════════════════════════════════════════════
   MPSkills — app.js  ·  Landingpage
   ══════════════════════════════════════════════════════════════
   Die Seite kennt drei Ansichten:

     1. nicht angemeldet          — Code · Zugang · zwei Auskünfte
     2. angemeldet ohne Rechte    — der Zustand des Antrags
     3. angemeldet mit Rechten    — Gruß · Meine Räume · Alle Skills

   Ansicht 1 ist auf EINEN Weg hin gebaut: jemand steht vor einer
   Tafel, auf der ein Code steht. Alles andere ist seltener und
   steht deshalb weiter unten (Zugang) oder hinter einem Knopf
   (die beiden Auskünfte).

   Drei Dinge, die hier bewusst so sind:

   1) Es wird session.js aus dem Repo-Root wiederverwendet, mit
      demselben storageKey. Eine Lehrkraft, die in der Schulung
      angemeldet ist, ist hier automatisch mit angemeldet — ein
      Konto, zwei Bereiche. Anonyme Teilnehmer haben gar keine
      Auth-Session und sind davon nicht betroffen.

   2) Die Kontoanlage schickt context='mpskills' an /api/signup.
      Das ist der einzige Unterschied zur Anmeldung auf der
      Schulungs-Landing — und er entscheidet, dass dieses Konto NIE
      in einen Kurs kommt und sofort auf 'pending' steht
      (Migration 0077 + api/signup.js). Registrieren IST damit der
      Antrag; ein zweiter Klick wäre nur eine Wiederholung.

   3) Anmelden und Registrieren stehen IN der Seite und nicht mehr
      in zwei Modals. Ein Dialog, der sich über die Erklärung
      schiebt, warum man ihn ausfüllt, nimmt genau die Erklärung
      weg — und die beiden Wege („habe ich schon ein Konto?")
      lassen sich nebeneinander in einem Blick vergleichen,
      hintereinander nicht.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));

/* ─── Toast ───────────────────────────────────────────── */
let toastTimer = null;
function toast(message, kind) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (kind === 'error' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

/* ─── Schulliste ──────────────────────────────────────── */
// Gleiche Quelle wie auf der Schulungs-Landing: schools ist für anon
// lesbar (0002). Fallback auf MPS, damit die Anmeldung auch dann geht,
// wenn die Liste nicht kommt.
let schoolsCache = null;
async function loadSchools() {
  if (schoolsCache) return schoolsCache;
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/schools?select=slug,name&active=eq.true&order=name`,
      {
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
          Accept: 'application/json'
        }
      }
    );
    if (!res.ok) throw new Error(`schools ${res.status}`);
    schoolsCache = await res.json();
  } catch (e) {
    console.warn('[mpskills] Schulliste laden fehlgeschlagen:', e.message);
    schoolsCache = [{ slug: 'mps', name: 'MPS' }];
  }
  if (!schoolsCache.length) schoolsCache = [{ slug: 'mps', name: 'MPS' }];
  return schoolsCache;
}

// Beide Auswahlfelder auf einmal, und nur beim ersten Aufklappen:
// die Liste ist ein Netzaufruf, und solange der Zugang zugeklappt
// ist, braucht ihn niemand.
let schoolsFilled = false;
async function fillSchoolSelects() {
  if (schoolsFilled) return;
  const schools = await loadSchools();
  const html = schools
    .map(s => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`)
    .join('');
  for (const id of ['loginSchool', 'regSchool']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  schoolsFilled = true;
}

/* ══════════════════════════════════════════════════════════
   1. Der Code von der Tafel
   ══════════════════════════════════════════════════════════
   Das Feld steht statisch im HTML — es ist die Hauptsache der
   Seite und soll nicht auf ein Skript warten müssen. Hier steht
   nur die Verdrahtung; die besuchten Räume haben seit dem
   19.08.2026 einen eigenen Abschnitt (weiter unten). */
function wireJoinForm() {
  const input = document.getElementById('hubCode');
  const form  = document.getElementById('hubCodeForm');
  if (!input || !form) return;

  input.addEventListener('input', () => {
    input.value = window.MPRoom.normalizeCode(input.value).slice(0, 6);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = window.MPRoom.normalizeCode(input.value);
    if (!window.MPRoom.isCode(code)) {
      toast('Der Code besteht aus 6 Zeichen — Buchstaben und Ziffern.', 'error');
      input.focus();
      return;
    }
    location.href = 'j.html#' + code;
  });
}

/* ══════════════════════════════════════════════════════════
   Besuchte Räume
   ══════════════════════════════════════════════════════════
   Räume, in denen man als TEILNEHMER:IN war — nicht die eigenen.
   Die stehen für Lehrkräfte eine Ebene höher unter „Meine Räume"
   und können sich nicht überschneiden: wer einen Raum eröffnet,
   ist darin kein Teilnehmer.

   ── Zwei Quellen, und das ist Absicht ─────────────────────────
   Ohne Anmeldung gibt es nur den Gerätespeicher — es gibt kein
   Konto, an dem etwas hängen könnte.

   Mit Anmeldung fragt die Seite den Server (skill_my_rooms). Das
   ist mehr als eine Bequemlichkeit: die Liste steht damit auch auf
   dem zweiten Gerät, sie trägt den aktuellen Titel statt dem vom
   Beitrittstag — und sie ist beim Abmelden von selbst weg, weil
   die Quelle wegfällt und nicht, weil jemand ans Aufräumen gedacht
   hat.

   Antwortet der Server, hat ER recht, auch mit leerer Liste: dann
   sind die Räume verlassen, abgelaufen oder gelöscht, und die
   eigenen Einträge im Gerätespeicher werden nachgezogen. Kommt gar
   keine Antwort, bleibt stehen, was das Gerät weiß — eine Liste,
   die beim ersten Netzhusten verschwindet, ist schlimmer als eine,
   die einen Tag alt ist. */
function visitedEl() {
  return {
    section: document.getElementById('visitedSection'),
    grid:    document.getElementById('visitedGrid')
  };
}

/* Der Abschnitt steht im HTML unter dem Code-Kasten und wird für
   Lehrkräfte ans Ende von „Meine Räume" gehängt — damit steht er
   dort unter der eigenen Raumliste und über dem Code-Kasten, der
   für diese Rolle hinter #stateHost rutscht.

   Verschoben und nicht verdoppelt, wie schon der Code-Kasten:
   derselbe Knoten behält seinen Inhalt und seine Listener.

   ⚠️ Zwei Regeln, an denen der Knoten sonst stirbt: der Umzug INS
   Fach muss nach jedem innerHTML an #paneRooms laufen (das Fach
   schreibt sich beim Laden komplett neu), und der Umzug ZURÜCK
   muss vor jedem innerHTML an #stateHost laufen — sonst räumt das
   Abmelden den Abschnitt mitsamt dem Fach weg, in dem er gerade
   hängt. Deshalb sagt der Aufrufer, wohin, statt dass die Funktion
   sich am vorhandenen DOM orientiert. */
function placeVisited(intoPane) {
  const { section } = visitedEl();
  if (!section) return;
  const pane = intoPane ? document.getElementById('paneRooms') : null;
  if (pane) { pane.appendChild(section); return; }
  const pitch = document.getElementById('pitch');
  if (pitch) pitch.insertAdjacentElement('afterend', section);
}

// Ort und Inhalt in einem Griff. Getrennt zu haben wäre die
// Einladung, ihn zu füllen, bevor er steht — und dann stünde er für
// einen Moment sichtbar an der falschen Stelle.
function showVisited(intoPane) {
  placeVisited(intoPane);
  renderVisited();
}

/* Eine Kachel. Der Link liegt als gestreckter Überzug darüber
   (wie .tile-peek bei den Skill-Kacheln) statt als <a> um alles:
   ein Knopf in einem Link wäre ungültig, und das Menü in der Ecke
   ist einer.

   Hinter dem Titel steht in Klammern, WEM der Raum gehört (0090).
   Das ist die Angabe, die zwei besuchte Räume auseinanderhält: ein
   Titel wie „Einstieg" steht in der zweiten Klasse genauso da, der
   Name der Lehrkraft nicht. Er steht im Titel und nicht in der
   Fußzeile, weil er zum Namen des Raums gehört — „Einstieg (Frau
   Meyer)" ist eine Angabe, keine zwei.

   Fehlt er, fällt er weg: Einträge, die vor 0090 im Gerät gelandet
   sind, kennen ihn nicht, und ein leeres Klammerpaar wäre die
   schlechtere Auskunft als keine. */
function visitedTile(v) {
  const seen = v.seen ? window.MPRoom.agoText(v.seen) : '';
  const bits = [esc(v.tool_title || ''), esc(seen)].filter(Boolean);
  const by   = v.owner ? ` <span class="vtile-by">(${esc(v.owner)})</span>` : '';
  return `<article class="vtile" data-code="${esc(v.code)}">
      <a class="vtile-a" href="j.html#${esc(v.code)}"
         aria-label="${esc(v.title)}${v.owner ? ' von ' + esc(v.owner) : ''} öffnen"></a>
      <span class="vtile-ic" aria-hidden="true">${esc(v.tool_icon || '🧩')}</span>
      <div class="vtile-txt">
        <strong>${esc(v.title)}${by}</strong>
        <span class="vtile-meta">${bits.join(' · ')}</span>
      </div>
      <div class="rowmenu">
        <button type="button" class="rowmenu-btn" data-rowmenu aria-haspopup="true"
                aria-expanded="false" aria-label="Mehr zu diesem Raum"
                title="Mehr zu diesem Raum">⋮</button>
        <div class="rowmenu-pop" hidden>
          <button type="button" class="rowmenu-danger" data-act="leave">Raum verlassen</button>
        </div>
      </div>
    </article>`;
}

/* Was die Rückfrage sagen muss, hängt an der Anmeldung: ohne Konto
   ist es dieses Gerät, mit Konto sind es alle. Beides Mal gilt der
   Satz, der die eigentliche Sorge beantwortet — die Zettel bleiben
   stehen. Wortgleich zu j.js, damit derselbe Knopf nicht zwei
   Versprechen gibt. */
async function leaveRoom(code, btn) {
  const everywhere = !!(window.isLoggedIn && window.isLoggedIn());
  if (!confirm(
    (everywhere
      ? 'Der Raum verschwindet aus deiner Liste — auf allen deinen Geräten. '
      : 'Der Raum verschwindet von diesem Gerät. ')
    + 'Was du geschrieben hast, bleibt für die Klasse stehen. Mit dem Code kommst '
    + 'du jederzeit zurück.\n\nFortfahren?')) return;

  closeRowMenus();
  btn.disabled = true;
  await window.MPRoom.leave(code);
  toast('Raum verlassen.');
  renderVisited();
}

async function renderVisited() {
  const { section, grid } = visitedEl();
  if (!section || !grid) return;

  // Der Gerätespeicher ist seit lib/room.js nach Anmeldung
  // getrennt: hier kommt nur an, was zur Person am Gerät gehört.
  const local = (window.MPRoom?.list() || []).map(r => ({
    code: r.code,
    title: r.room?.title || r.code,
    owner: r.room?.owner_name || '',
    tool_title: r.room?.tool_title || '',
    tool_icon: r.room?.tool_icon || '',
    seen: r.seen_at || r.saved_at || 0
  }));

  let rooms = local;

  if (window.isLoggedIn?.()) {
    try {
      const data = await window.MPRoom.rpc('skill_my_rooms', {});
      if (data?.ok) {
        rooms = (data.rooms || []).map(r => ({
          code: r.room?.code,
          title: r.room?.title || r.room?.code,
          owner: r.room?.owner_name || '',
          tool_title: r.room?.tool_title || '',
          tool_icon: r.room?.tool_icon || '',
          seen: new Date(r.last_seen_at || r.joined_at).getTime()
        })).filter(r => r.code);

        /* Was der Server nicht mehr nennt, gehört auch nicht mehr
           ins Gerät: verlassen, abgelaufen oder gelöscht. Sonst
           fände route() in j.html einen Token wieder, den es
           serverseitig nicht mehr gibt. */
        const live = new Set(rooms.map(r => r.code));
        for (const r of local) if (!live.has(r.code)) window.MPRoom.forget(r.code);
      }
    } catch (e) {
      // Kein Netz: es bleibt beim letzten Stand des Geräts.
      console.warn('[mpskills] skill_my_rooms:', e.message);
    }
  }

  rooms.sort((a, b) => (b.seen || 0) - (a.seen || 0));
  section.hidden = !rooms.length;
  grid.innerHTML = rooms.map(visitedTile).join('');
}

/* ══════════════════════════════════════════════════════════
   2. Zugang für Lehrkräfte
   ══════════════════════════════════════════════════════════ */
function accessOpen() {
  return document.getElementById('accessPanel')?.hidden === false;
}

/* Wer sich HIER anmeldet, hat vorher „Zugang bekommen" gedrückt und
   in einem Kasten getippt, über dem steht, wofür. Danach noch einen
   Knopf „Zugang beantragen" zu verlangen, fragt dasselbe ein zweites
   Mal. Also stellt die Seite den Antrag selbst.

   Das Merkmal ist der WEG, nicht die Anmeldung: wer schon angemeldet
   ankommt (etwa mit einem Schulungs-Konto, weil ein Kind das Tablet
   vorher benutzt hat), bekommt weiter den Knopf. Sonst stellte ein
   Seitenaufruf einen Antrag, den niemand gestellt hat.

   Nur aus 'none' heraus — 'rejected' bleibt beim Knopf. Da hat ein
   Admin entschieden; diese Entscheidung darf nicht nebenbei
   umgestoßen werden, ohne dass der Grund überhaupt gelesen wurde. */
let requestAfterLogin = false;
let requesting = false;

async function openAccess() {
  const panel  = document.getElementById('accessPanel');
  const toggle = document.getElementById('accessToggle');
  if (!panel) return;

  // Beide Spalten müssen hier stehen, bevor der Kasten aufgeht —
  // eine davon kann gerade im Modal sein.
  closeAuth();

  panel.hidden = false;
  toggle?.setAttribute('aria-expanded', 'true');
  await fillSchoolSelects();
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeAccess() {
  const panel  = document.getElementById('accessPanel');
  const toggle = document.getElementById('accessToggle');
  if (panel) panel.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
}

/* ─── Dieselben Formulare als Modal ───────────────────────────
   Die Knöpfe oben rechts meinen genau eines von beidem. Sie
   bekommen deshalb ein eigenes Fenster statt eines Sprungs an eine
   Stelle weiter unten — ein Sprung beantwortet die Frage „wo soll
   ich jetzt tippen?" erst, nachdem man gesucht hat.

   Verschoben, nicht verdoppelt: die Spalte wird als DOM-Knoten ins
   Modal gehängt und beim Schließen zurück in ihr Fach. Ein zweiter
   Satz Felder wäre ein zweiter Satz IDs, Fehlerkästen und
   Absende-Handler — und die erste Regel, die sich ändert, würde nur
   an einem der beiden Orte nachgezogen. */
let authWhich = null;

const colEl  = (w) => document.getElementById(w === 'register' ? 'colRegister'  : 'colLogin');
const slotEl = (w) => document.getElementById(w === 'register' ? 'slotRegister' : 'slotLogin');

// Die Spalte zurück in ihr Fach. Muss VOR jedem Wechsel und bei
// jedem Schließen laufen, sonst bliebe im Kasten ein Loch.
function homeAuth() {
  if (!authWhich) return;
  const slot = slotEl(authWhich);
  slot.appendChild(colEl(authWhich));
  slot.classList.remove('is-away');
  authWhich = null;
}

async function openAuth(which) {
  // Ein offener Zugangs-Kasten und ein Modal mit derselben Spalte
  // schlössen sich gegenseitig aus — der Knoten kann nur an einem
  // Ort sein. Also gehört er in diesem Moment dem Modal.
  homeAuth();
  closeAccess();

  authWhich = which;
  const slot = slotEl(which);
  slot.classList.add('is-away');
  document.getElementById('authBody').appendChild(colEl(which));

  document.getElementById('authSwitch').innerHTML = which === 'register'
    ? 'Schon ein Konto? <button type="button" class="btn--link" data-auth="login">Anmelden</button>'
    : 'Noch kein Konto? <button type="button" class="btn--link" data-auth="register">Konto anlegen</button>';

  // Die Schulliste VOR dem Aufmachen, nicht danach: sonst steht das
  // Formular offen, während das Auswahlfeld noch leer ist — und wer
  // schnell tippt, meldet sich mit einer Schule an, die keine ist.
  await fillSchoolSelects();
  document.getElementById('authModal').hidden = false;
  setTimeout(() => {
    document.getElementById(which === 'register' ? 'regAccount' : 'loginAccount')?.focus();
  }, 60);
}

function closeAuth() {
  const el = document.getElementById('authModal');
  if (el) el.hidden = true;
  homeAuth();
}

/* ══════════════════════════════════════════════════════════
   3. Die beiden Auskünfte
   ══════════════════════════════════════════════════════════
   Inhalt steht im HTML, nicht hier — es ist Text, den jemand
   lesen und ändern soll, und der gehört dorthin, wo er zu sehen
   ist. */
function openInfo(which) {
  const id = which === 'privacy' ? 'privacyModal' : 'aboutModal';
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function closeInfos() {
  for (const id of ['privacyModal', 'aboutModal']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}

/* ══════════════════════════════════════════════════════════
   Serveraufruf
   ══════════════════════════════════════════════════════════
   Wie in lehrer.js bewusst OHNE zwischengespeicherten Token: das
   SDK erneuert ihn nach 60 Minuten, und eine festgehaltene Kopie
   wäre ab da tot. */
async function rpc(fn, args) {
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

/* ══════════════════════════════════════════════════════════
   Reiter „Meine Räume"
   ══════════════════════════════════════════════════════════
   Das ist seit 18.08.2026 der EINZIGE Ort, an dem die eigenen
   Räume stehen — die zweite Liste unter lehrer.html ist weg.
   Zwei Listen derselben Sache sind zwei Listen, die auseinander
   laufen, und die zweite war nur über einen Link am Fuß der
   ersten erreichbar.

   Eine Zeile je Raum: ein Klick führt in die Beamer-Ansicht,
   alles Weitere steht hinter den drei Punkten am rechten Rand.
   Dort und nicht als Knopfreihe in der Zeile, weil die Zeile
   sonst mehr Bedienung als Auskunft wäre — gedrückt wird hier in
   99 von 100 Fällen der Raum selbst.

   Wo vorher der Code stand, steht jetzt dieses Menü. Der Code
   gehört an die Tafel und damit in die Beamer-Ansicht; in einer
   Übersicht beantwortet er keine Frage, die man hier hat.

   Testräume stehen mit in der Liste, nur ausgewiesen: auf der
   Landing sind sie kein eigenes Kapitel, sondern einer von
   wenigen Räumen. */
const ROOM_ERRORS = {
  not_authenticated: 'Du bist nicht angemeldet.',
  not_a_teacher:     'Dein Konto ist für MPSkills nicht freigeschaltet.',
  not_found:         'Diesen Raum gibt es nicht (mehr).',
  no_profile:        'Zu deinem Zugang fehlt das Profil.'
};

function roomRow(r) {
  // Jedes Stück einzeln maskiert, weil die Restlaufzeit als
  // einziges eine eigene Auszeichnung tragen kann.
  const bits = [esc(r.tool_title || r.tool_id)];
  if (r.is_test) bits.push('Testraum');

  // Die Anwesenden gehören zur Personenzahl und stehen deshalb in
  // derselben Angabe — sonst schöbe sich die Restlaufzeit zwischen
  // zwei Zahlen, die dasselbe zählen.
  bits.push(`${r.people} ${r.people === 1 ? 'Person' : 'Personen'}`
    + (r.online ? ` (${r.online} gerade da)` : ''));

  /* Die Restlaufzeit steht an JEDER Zeile und nicht erst, wenn es
     eng wird: ein Raum, der still abläuft, ist die eine Sache, die
     diese Liste rechtzeitig sagen muss — „verlängern" geht nur
     vorher leicht. Ab acht Tagen wird sie eingefärbt, dann ist sie
     ein Hinweis und keine Angabe mehr; das Gegenmittel steht in
     derselben Zeile hinter den drei Punkten. */
  const left = new Date(r.expires_at).getTime() - Date.now();
  const soon = r.expired || (isFinite(left) && left < 8 * 86400000);
  const until = esc(r.expired ? 'abgelaufen' : window.MPRoom.untilText(r.expires_at));
  bits.push(soon ? `<span class="roomlist-soon">${until}</span>` : until);

  if (!r.join_open) bits.push('Beitritt zu');

  return `<li class="roomlist-row${r.expired ? ' roomlist-row--dead' : ''}" data-code="${esc(r.code)}">
      <a class="roomlist-a" href="lehrer.html#${esc(r.code)}">
        <span class="roomlist-ic">${esc(r.tool_icon || '🧩')}</span>
        <span class="roomlist-txt">
          <strong>${esc(r.title)}</strong>
          <span>${bits.join(' · ')}</span>
        </span>
      </a>
      <div class="rowmenu">
        <button type="button" class="rowmenu-btn" data-rowmenu aria-haspopup="true"
                aria-expanded="false" aria-label="Raum bearbeiten" title="Raum bearbeiten">⋮</button>
        <div class="rowmenu-pop" hidden>
          <button type="button" data-act="toggle" data-open="${r.join_open ? '0' : '1'}">
            ${r.join_open ? 'Beitritt schließen' : 'Beitritt öffnen'}</button>
          <!-- Verlängern steht auch bei abgelaufenen Räumen da: zwischen
               Ablauf und Aufräum-Lauf liegt bis zu ein Tag, und genau in
               dem Fenster ist „den hätte ich doch noch gebraucht" der
               wahrscheinlichste Grund, hier zu klicken. -->
          <button type="button" data-act="extend">${r.expired ? 'Zurückholen' : 'Verlängern'}</button>
          <button type="button" class="rowmenu-danger" data-act="delete">Löschen</button>
        </div>
      </div>
    </li>`;
}

/* Ein offenes Menü zu, sobald irgendwo anders hingefasst wird.
   Sonst stünden nach drei Klicks drei Menüs offen. */
function closeRowMenus(except) {
  document.querySelectorAll('.rowmenu').forEach(m => {
    if (m === except) return;
    const pop = m.querySelector('.rowmenu-pop');
    if (pop) pop.hidden = true;
    m.querySelector('.rowmenu-btn')?.setAttribute('aria-expanded', 'false');
  });
}

async function roomAction(code, act, btn) {
  if (act === 'delete') {
    // Der einzige Schritt hier, der nicht rückgängig zu machen ist.
    if (!confirm(`Raum wirklich löschen?\n\nAlles darin ist weg — auch für die Klasse. `
               + `Der Code ${code} funktioniert danach nicht mehr.`)) return;
  }

  closeRowMenus();
  btn.disabled = true;
  try {
    let r;
    if (act === 'toggle') {
      r = await rpc('skill_room_set_open', { p_code: code, p_open: btn.dataset.open === '1' });
    } else if (act === 'extend') {
      r = await rpc('skill_room_extend', { p_code: code });
    } else {
      r = await rpc('skill_room_delete', { p_code: code });
    }
    if (!r?.ok) {
      toast(ROOM_ERRORS[r?.error] || 'Das hat nicht geklappt.', 'error');
      btn.disabled = false;
      return;
    }
    toast(act === 'toggle'  ? (btn.dataset.open === '1' ? 'Beitritt geöffnet.' : 'Beitritt geschlossen.')
        : act === 'extend'  ? (r.revived ? 'Raum zurückgeholt — er läuft wieder 30 Tage.'
                                         : 'Verlängert: ' + window.MPRoom.untilText(r.expires_at) + '.')
        : 'Raum gelöscht.');
    renderRooms();
  } catch (e) {
    console.error('[mpskills] Raum bearbeiten:', e);
    toast('Fehler: ' + e.message, 'error');
    btn.disabled = false;
  }
}

async function renderRooms() {
  const pane = document.getElementById('paneRooms');
  if (!pane) return;

  /* ⚠️ Die besuchten Räume hängen am Ende dieses Fachs, und jeder
     der vier Ausgänge unten schreibt es komplett neu. Wird der
     Abschnitt nicht vorher herausgeholt, ist er nach dem ersten
     „Beitritt schließen" weg — denn dann findet ihn auch
     placeVisited() nicht mehr. Rein kommt er an jedem Ausgang
     wieder, mit showVisited(true). */
  placeVisited(false);

  let data;
  try {
    data = await rpc('skill_rooms_list', {});
  } catch (e) {
    console.warn('[mpskills] skill_rooms_list:', e.message);
    pane.innerHTML = `<div class="card"><div class="msg msg--err">Deine Räume ließen sich
      gerade nicht laden.</div>
      <p class="rule">${esc(e.message)}</p></div>`;
    showVisited(true);
    return;
  }
  if (!data?.ok) {
    pane.innerHTML = `<div class="card"><div class="msg msg--err">Deine Räume ließen sich
      nicht laden (${esc(data?.error || 'unbekannt')}).</div></div>`;
    showVisited(true);
    return;
  }

  const rooms = data.rooms || [];

  /* „+ Raum eröffnen" führt nach lehrer.html?new — dort steht seit
     dem Umbau vom 18.08.2026 kein Dialog mehr, sondern das erste
     Fach der Raumseite („Einstellungen"). OHNE Werkzeug in der
     Adresse: dann ist es dort die erste Frage. Von einer Kachel aus
     ist es schon beantwortet, von hier aus noch nicht.

     Ein Link und kein Knopf: das ist ein Ortswechsel, und er soll
     sich in einem zweiten Reiter öffnen lassen. */
  if (!rooms.length) {
    pane.innerHTML = `<div class="card card--empty">
        <p><strong>Noch kein Raum.</strong> Eröffne einen — du bekommst einen Code und einen
        QR-Code, und die Klasse ist in 30 Sekunden drin.</p>
        <div class="actions">
          <a class="btn btn--primary" href="lehrer.html?new">+ Raum eröffnen</a>
          <button type="button" class="btn" data-tab="tools">Erst die Skills ansehen</button>
        </div>
      </div>`;
    showVisited(true);
    return;
  }

  // Die erreichte Obergrenze gehört dorthin, wo die Räume stehen, und
  // nicht erst in die Fehlermeldung beim Anlegen. Aber nur dann: eine
  // Dauerzeile „2 von 5" beantwortet keine Frage.
  const full = Object.values(data.tools || {})
    .filter(t => t.live >= (t.multi_room ? t.max_rooms : 1))
    .map(t => `${esc(t.icon || '')} ${esc(t.title)}: ${t.live} von ${t.multi_room ? t.max_rooms : 1}`);

  pane.innerHTML = `
      <div class="pane-head">
        <p class="pane-head-note">Ein Raum läuft ab, wenn 30 Tage lang niemand mehr darin
          war — verlängern kannst du ihn über die drei Punkte.</p>
        <a class="btn btn--primary" href="lehrer.html?new">+ Raum eröffnen</a>
      </div>
      <div class="card">
        <ul class="roomlist">${rooms.map(roomRow).join('')}</ul>
      </div>
      ${full.length ? `<p class="pane-foot pane-foot--warn">${full.join(' · ')} Räumen belegt —
        für einen neuen musst du erst einen löschen. Abgelaufene Räume und Testräume
        zählen nicht mit.</p>` : ''}`;

  // Ein Listener an der Liste statt an jeder Zeile. Die Liste wird bei
  // jeder Änderung komplett neu geschrieben, ein Listener je Zeile wäre
  // damit ohnehin jedes Mal weg.
  pane.querySelector('.roomlist').addEventListener('click', (e) => {
    const mBtn = e.target.closest('.rowmenu-btn');
    if (mBtn) {
      const menu = mBtn.closest('.rowmenu');
      const pop  = menu.querySelector('.rowmenu-pop');
      closeRowMenus(menu);
      pop.hidden = !pop.hidden;
      mBtn.setAttribute('aria-expanded', String(!pop.hidden));
      return;
    }
    const aBtn = e.target.closest('.rowmenu-pop button[data-act]');
    if (aBtn) roomAction(aBtn.closest('.roomlist-row').dataset.code, aBtn.dataset.act, aBtn);
  });

  // Unter die eigenen Räume und damit über den Code-Kasten, der für
  // diese Rolle hinter #stateHost steht. Zuerst, was mir gehört —
  // dann, wo ich zu Gast war.
  showVisited(true);
}

/* ══════════════════════════════════════════════════════════
   Reiter „Alle Skills"
   ══════════════════════════════════════════════════════════
   Für Gäste gibt es die Liste nicht — sie beantwortet keine Frage,
   die ein Gast hat, und schob den Code-Kasten nach unten.

   Quelle ist skill_tools (Migration 0078), NICHT tools.js. Dort
   steht nur das ready-Flag — siehe Kopfkommentar in tools.js. */
let toolsCache = null;
let toolsError = null;

// folder mit dabei: das Schaufenster lädt das Werkzeug über
// MPTool.load(id, folder), und der Ordner darf sich von der ID
// unterscheiden (0078) — genau dafür gibt es die Spalte.
const TOOL_COLS = 'id,title,blurb,icon,folder,multi_room,active,sort_order';

async function fetchTools(cols) {
  const token = window.__accessToken || window.SUPABASE_ANON_KEY;
  const res = await fetch(
    `${window.SUPABASE_URL}/rest/v1/skill_tools?select=${cols}&order=sort_order.asc`,
    {
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    }
  );
  if (!res.ok) throw new Error(`skill_tools ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function loadTools() {
  if (toolsCache) return toolsCache;
  try {
    /* Mit `subject` (Migration 0089) und bei Fehlschlag noch einmal
       ohne. Das Frontend kann vor der Migration ausgeliefert sein —
       dann antwortet PostgREST auf die unbekannte Spalte mit 400,
       und ohne diesen zweiten Anlauf wäre nicht die Gruppierung weg,
       sondern die ganze Skill-Liste. Fällt sie zurück, steht alles
       in einem Abschnitt, und das ist genau der Stand von vorher. */
    try {
      toolsCache = await fetchTools(TOOL_COLS + ',subject');
    } catch (e) {
      console.warn('[mpskills] skill_tools ohne subject (Migration 0089 noch nicht gelaufen?):', e.message);
      toolsCache = await fetchTools(TOOL_COLS);
    }
    toolsError = null;
  } catch (e) {
    console.warn('[mpskills] Werkzeugliste laden fehlgeschlagen:', e.message);
    toolsCache = null;
    toolsError = e.message;
  }
  return toolsCache;
}

function isReady(toolId) {
  return !!(window.TOOLS_OVERLAY?.[toolId]?.ready);
}

/* Eine Kachel sagt, wie ein Skill heißt und wozu er da ist — was
   dabei an der Wand entsteht, sagt sie nicht. Genau das ist aber
   die Frage von jemandem, der überlegt, ob er damit eine Stunde
   macht. Also steht darüber ein Standbild, und dahinter liegt die
   ganze Kachel als Knopf, der die laufende Vorschau öffnet.

   Nur für Skills, für die ein Drehbuch ausgeliefert ist
   (preview/<id>.js). Ein „in Vorbereitung" hat noch nichts zu
   zeigen, und ein Knopf, hinter dem ein leerer Kasten aufgeht,
   ist schlechter als keiner. */
function previewOf(t) {
  return (isReady(t.id) && window.MPPreview?.has(t.id)) ? window.MPPreview : null;
}

function toolCard(t) {
  const ready = isReady(t.id);
  const badges = [
    ready ? '' : '<span class="tag tag--soon">Skill in Vorbereitung</span>',
    t.active ? '' : '<span class="tag tag--off">Abgeschaltet</span>'
  ].filter(Boolean).join('');

  // Ein abgeschalteter Skill bekommt keine neuen Räume mehr
  // (Entscheidung 17.08.2026) — der Knopf wäre dann eine Einladung
  // in eine Fehlermeldung.
  const off = t.active ? '' : ' disabled title="Dieser Skill ist abgeschaltet."';

  const pv    = previewOf(t);
  const still = pv ? pv.tileHTML(t.id) : '';
  const peek  = pv
    ? `<button type="button" class="tile-peek" data-act="peek" data-tool="${esc(t.id)}"
               aria-label="${esc(t.title)} in Aktion ansehen"></button>`
    : '';

  return `<article class="tile${ready ? '' : ' tile--soon'}${pv ? ' tile--peek' : ''}">
      ${peek}
      ${still}
      <div class="tile-head">
        <span class="tile-ic">${esc(t.icon || '🧩')}</span>
        <h3>${esc(t.title)}</h3>
      </div>
      ${badges ? `<div class="tile-tags">${badges}</div>` : ''}
      <p class="tile-blurb">${esc(t.blurb || '')}</p>
      <div class="tile-foot">
        <button type="button" class="btn btn--sm btn--primary" data-act="open" data-tool="${esc(t.id)}"${off}>+ Raum öffnen</button>
      </div>
      ${ready ? '' : '<p class="tile-note">Der Raum funktioniert schon — der Skill darin kommt noch.</p>'}
    </article>`;
}

/* „+ Raum öffnen" fragt nach Titel und Namen — das gehört auf die
   Raumseite (lehrer.html?new = Fach 1) und nicht in ein zweites
   Formular hier.

   Der „Testen"-Knopf ist weg (18.08.2026): seit die Raumseite den
   Anlege-Dialog ersetzt hat, ist ein Raum ohnehin in zwei Klicks da
   und jederzeit wieder löschbar — ein zweiter Weg, der dasselbe tut
   und dabei einen unsichtbaren Sonderraum anlegt, beantwortete keine
   Frage mehr. Serverseitig bleibt is_test bestehen (0079); es wird
   von hier nur nicht mehr angefordert. */
const newRoomHref = id => 'lehrer.html?new=' + encodeURIComponent(id);

function wireToolButtons() {
  document.querySelectorAll('#paneTools button[data-act="open"]').forEach(btn => {
    btn.addEventListener('click', () => { location.href = newRoomHref(btn.dataset.tool); });
  });

  // Die Kachel selbst öffnet das Schaufenster. Der Titel kommt aus
  // der Registry und nicht aus dem Drehbuch: wie ein Skill heißt,
  // entscheidet die Datenbank (0078), nicht das ausgelieferte
  // Frontend.
  document.querySelectorAll('#paneTools button[data-act="peek"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = (toolsCache || []).find(x => x.id === btn.dataset.tool);
      if (t) window.MPPreview?.open({ id: t.id, title: t.title, folder: t.folder });
    });
  });
}

/* Der Knopf im Schaufenster führt dorthin, wo auch der auf der
   Kachel hinführt. Delegiert, weil das Modal fest im HTML steht
   und beim Öffnen nur gefüllt wird. */
document.addEventListener('click', ev => {
  const b = ev.target.closest('#pvOpen');
  if (b && b.dataset.tool) location.href = newRoomHref(b.dataset.tool);
});

async function renderTools() {
  const host = document.getElementById('paneTools');
  if (!host) return;
  const tools = await loadTools();

  if (!tools) {
    // Häufigster Fall beim Ausrollen: Migration 0078 ist noch nicht
    // gelaufen. Für Admins die technische Ursache mit dazu, für alle
    // anderen nur die Aussage.
    const s = window.getSessionUser?.();
    const tech = (s?.is_admin || s?.is_superadmin) && toolsError
      ? `<br><span class="tile-note">Technisch: ${esc(toolsError)} — läuft Migration 0078 schon?</span>`
      : '';
    host.innerHTML = `<p class="tools-empty">Die Skill-Liste ist gerade nicht
      erreichbar.${tech}</p>`;
    return;
  }

  if (tools.length === 0) {
    host.innerHTML = '<p class="tools-empty">Hier ist noch nichts eingetragen.</p>';
    return;
  }

  /* Nach Fach gruppiert (Migration 0089). Ein Gitter ohne
     Überschriften trug zwei Kacheln gut; sobald ein Skill dabei ist,
     der nur in einem Fach etwas zu suchen hat, ist die Reihenfolge
     allein keine Auskunft mehr — „warum steht das hier?" beantwortet
     nur eine Beschriftung.

     Die Reihenfolge der Abschnitte folgt dem kleinsten sort_order
     darin. Damit ordnet dieselbe Zahl beide Ebenen, und ein Fach
     nach vorn zu holen heißt, seinem ersten Skill eine kleinere
     Zahl zu geben (siehe Kopf von 0089).

     Ein EINZIGER Abschnitt bekommt keine Überschrift: dann ist sie
     keine Gliederung, sondern eine Zeile, die dasselbe sagt wie der
     Reiter darüber. Das ist zugleich der Rückfall für den Fall, dass
     die Migration noch nicht gelaufen ist — dort fehlt subject an
     jeder Zeile. */
  const groups = new Map();
  tools.forEach((t, i) => {
    const key = (t.subject || '').trim() || 'Skills';
    if (!groups.has(key)) groups.set(key, { name: key, rank: i, items: [] });
    groups.get(key).items.push(t);
  });

  const secs = [...groups.values()].sort((a, b) => a.rank - b.rank);
  host.innerHTML = secs.map(s =>
    (secs.length > 1 ? `<h3 class="tools-sec">${esc(s.name)}</h3>` : '')
    + `<div class="tile-grid">${s.items.map(toolCard).join('')}</div>`
  ).join('');
  wireToolButtons();
}

/* ══════════════════════════════════════════════════════════
   Rollenweiche
   ══════════════════════════════════════════════════════════
   Ein Ort, an dem entschieden wird, was die Seite zeigt. */
/* ─── Reiter ──────────────────────────────────────────────────
   „Meine Räume" steht offen, weil das die Frage beim Öffnen der
   Seite ist: läuft noch was, und wo ist der Code dazu. Das
   Sortiment schaut man seltener an — und wenn, dann absichtlich.

   Die Wahl liegt in einer Variablen und nicht im sessionStorage:
   sie soll den Klick auf einen Raum nicht überleben. Wer zurück
   auf die Landing kommt, fragt wieder als Erstes nach den Räumen. */
let activeTab = 'rooms';

function showTab(which) {
  activeTab = which;
  document.querySelectorAll('#stateHost .tab').forEach(b => {
    const on = b.dataset.tab === which;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  for (const [id, key] of [['paneRooms', 'rooms'], ['paneTools', 'tools']]) {
    const el = document.getElementById(id);
    if (el) el.hidden = (key !== which);
  }

  /* Der Code-Kasten steht unter „Meine Räume" und nur dort: er ist
     der Weg IN einen fremden Raum, und das ist eine Frage derselben
     Art wie „wo sind meine". Im Sortiment beantwortet er keine —
     wer sich ansieht, was es gibt, tippt gerade keinen Code ab. */
  const join = document.getElementById('joinCard');
  if (join) join.hidden = (which !== 'rooms');

  // Der Satz gehört zum Kasten und geht mit ihm — ein Versprechen,
  // das unter einer Liste von Skills allein stehen bliebe, wäre
  // eine Behauptung ohne Gegenüber.
  const pitch = document.getElementById('pitch');
  if (pitch) pitch.hidden = (which !== 'rooms');
}

function roleOf(s) {
  if (!s)                              return 'guest';
  if (s.is_admin || s.is_superadmin)   return 'admin';
  if (s.teacher_status === 'approved') return 'teacher';
  if (s.teacher_status === 'pending')  return 'pending';
  if (s.teacher_status === 'rejected') return 'rejected';
  return 'noRole';
}

function renderState() {
  const host = document.getElementById('stateHost');
  const s    = window.getSessionUser?.() ?? null;
  const role = roleOf(s);
  const acts = (role === 'teacher' || role === 'admin');

  // Die Fahne gilt genau dem einen Fall, für den sie gesetzt wurde.
  // Wer sich anmeldet und schon freigeschaltet ist (oder schon
  // wartet), hat nichts zu beantragen.
  if (role !== 'noRole') requestAfterLogin = false;

  // Die Kopfzeile pflegt sich seit lib/userbar.js selbst — sie hängt
  // am selben session-changed-Event wie diese Funktion.

  // Der Code-Kasten bleibt für alle da — auch eine Lehrkraft will
  // vielleicht mal in den Raum einer Kolleg:in als Teilnehmer:in
  // hinein. Für Lehrkräfte/Admins rutscht dieselbe Box aber HINTER
  // die eigene Raumliste: das ist dort die seltenere der beiden
  // Fragen, „Meine Räume" bleibt der Normalweg. Bewegt statt
  // verdoppelt — derselbe DOM-Knoten behält seine Listener.
  //
  // Sichtbar ist er dort nur unter „Meine Räume"; im Reiter „Alle
  // Skills" nimmt ihn showTab() wieder weg (Begründung dort).
  const join = document.getElementById('joinCard');
  if (join) {
    join.hidden = false;
    if (acts) host.insertAdjacentElement('afterend', join);
    else      host.insertAdjacentElement('beforebegin', join);

    // Der Satz wandert mit. Sonst bliebe er für eine Lehrkraft dort
    // stehen, wo der Kasten NICHT mehr ist — mitten zwischen Gruß
    // und Reiterleiste, und dann steht ein Versprechen über einer
    // Raumliste, die es längst eingelöst hat.
    const pitch = document.getElementById('pitch');
    if (pitch) {
      pitch.hidden = false;
      join.insertAdjacentElement('afterend', pitch);
    }
  }

  /* Der Abschnitt geht AUSNAHMSLOS erst nach Hause, auch für eine
     Lehrkraft: unten in dieser Funktion wird #stateHost neu
     geschrieben, und was in diesem Moment noch im alten Fach hängt,
     wäre danach weg.

     Gefüllt wird er hier aber nur für die Rollen, bei denen er auch
     hier stehen bleibt. Für eine Lehrkraft macht das renderRooms(),
     sobald das Fach steht — sonst könnte er sichtbar werden, bevor
     er an seinem Platz ist. */
  placeVisited(false);
  if (!acts) renderVisited();

  // Der Zugang gilt nur Gästen. Wer angemeldet ist, sieht statt der
  // beiden Formulare seinen Zustand — das ist dieselbe Frage, eine
  // Stufe weiter.
  const access = document.getElementById('accessSection');
  if (role !== 'guest') {
    // Erst das Modal schließen, DANN den Kasten verstecken: closeAuth
    // hängt die Spalte in ihr Fach zurück, und das Fach steht im
    // Kasten. Andersherum bliebe ein Formular im Nichts hängen und
    // wäre nach dem Abmelden verschwunden.
    closeAuth();
    closeAccess();
  }
  if (access) access.hidden = (role !== 'guest');

  /* ─── Ansicht 1: Gast ───────────────────────────────────
     Der ganze Inhalt steht statisch im HTML. Hier bleibt nichts
     zu tun — und genau das ist der Punkt der Umstellung. */
  if (role === 'guest') {
    host.innerHTML = '';
    return;
  }

  /* ─── Ansicht 3: Lehrkraft und Admin ────────────────────
     Kurzer Gruß, dann zwei Reiter. Der Gruß erklärt nichts mehr —
     wer hier steht, ist eingerichtet und will an die Arbeit; die
     Erklärung steht für alle unten hinter „Was kann diese Seite?".

     Für den Admin dieselbe Seite mit einem Satz mehr: er hat
     keinen Zugang beantragt, sondern hat ihn qua Amt, und die
     Anträge der anderen liegen woanders. */
  if (acts) {
    const name = (s?.display_name || s?.account_name || '').trim();
    host.innerHTML = `
      <section class="welcome">
        <h1>Hallo${name ? ' ' + esc(name) : ''}!</h1>
        <p>
          Du hast Zugriff auf alle Skills. Öffne einen für eine Klasse — den Code und den
          QR-Code dazu bekommst du sofort.
          ${role === 'admin'
            ? 'Anträge von Lehrkräften bearbeitest du im <a href="../admin/index.html">Admin-Panel</a> unter „Lehrkräfte".'
            : ''}
        </p>
      </section>

      <div class="tabs" role="tablist">
        <button type="button" class="tab" role="tab" data-tab="rooms"
                aria-controls="paneRooms" aria-selected="false">Meine Räume</button>
        <button type="button" class="tab" role="tab" data-tab="tools"
                aria-controls="paneTools" aria-selected="false">Alle <span class="tab-accent">Skills</span></button>
      </div>

      <div class="tabpane" id="paneRooms" role="tabpanel">
        <p class="booting">Räume werden geladen …</p>
      </div>
      <div class="tabpane" id="paneTools" role="tabpanel" hidden>
        <p class="booting">Skills werden geladen …</p>
      </div>`;

    showTab(activeTab);
    // Beide Reiter werden gefüllt, auch der verdeckte: sonst
    // wartete man beim Umschalten auf das Netz, und das ist genau
    // der Moment, in dem man etwas sucht.
    renderRooms();
    renderTools();
    return;
  }

  if (role === 'pending') {
    host.innerHTML = `
      <div class="state state--wait">
        <h2><span class="ic">⏳</span> Dein Zugang ist beantragt</h2>
        <p>
          Ein Admin schaltet dich frei — das passiert nicht automatisch. Wenn es dauert,
          sprich die Person an, die dir diese Seite gezeigt hat.
        </p>
        <p class="hint">
          In der Tablet-Schulung ist dein Konto davon unberührt: dort bist du ein
          gewöhnlicher Zugang und kannst ganz normal an einer Schulung teilnehmen.
        </p>
      </div>`;
    return;
  }

  if (role === 'rejected') {
    host.innerHTML = `
      <div class="state state--no">
        <h2><span class="ic">✕</span> Dein Antrag wurde abgelehnt</h2>
        <p>
          Für MPSkills bist du nicht freigeschaltet. Wenn das ein Missverständnis ist,
          sprich mit der Schulleitung oder der Schulung — danach kannst du erneut beantragen.
        </p>
        <div class="actions">
          <button type="button" class="btn" id="ctaRequest">Erneut beantragen</button>
        </div>
      </div>`;
    document.getElementById('ctaRequest').addEventListener('click', requestRole);
    return;
  }

  // noRole — angemeldeter Schulungs-Account ohne Lehrkraft-Bezug.

  // Kam die Anmeldung gerade aus dem Zugangs-Kasten, ist der Antrag
  // schon gestellt worden — die Seite zeigt so lange denselben
  // Warte-Zustand, in dem sie gleich stehen bleibt. Schlägt der RPC
  // fehl, fällt sie auf den Knopf darunter zurück.
  if (requestAfterLogin) {
    requestAfterLogin = false;
    host.innerHTML = `
      <div class="state state--wait">
        <h2><span class="ic">⏳</span> Dein Zugang wird beantragt …</h2>
      </div>`;
    requestRole();
    return;
  }

  host.innerHTML = `
    <div class="state state--invite">
      <h2><span class="ic">🔑</span> Du brauchst noch den Zugang</h2>
      <p>
        Du bist angemeldet, aber für MPSkills noch nicht freigeschaltet. Wenn du an dieser
        Schule unterrichtest, beantrage den Zugang — ein Admin schaltet dich dann frei.
      </p>
      <div class="actions">
        <button type="button" class="btn btn--primary" id="ctaRequest">Zugang beantragen</button>
      </div>
      <p class="hint">
        Bist du Schülerin oder Schüler? Dann brauchst du hier nichts zu beantragen —
        du bekommst von deiner Lehrkraft einen Code.
      </p>
    </div>`;
  document.getElementById('ctaRequest').addEventListener('click', requestRole);
}

/* ─── Zugang beantragen ───────────────────────────────── */
// RPC request_teacher_role (0077). Es gibt keine Policy, die einen User
// sein eigenes Profil schreiben lässt — deshalb eine RPC und kein PATCH.
// Wird aus zwei Richtungen gerufen: vom Knopf, und von der
// Rollenweiche direkt nach einer Anmeldung im Zugangs-Kasten. Beim
// zweiten Weg gibt es keinen Knopf — deshalb ist er überall optional.
async function requestRole() {
  if (requesting) return;
  requesting = true;
  const btn = document.getElementById('ctaRequest');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/request_teacher_role`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.__accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
    if (!res.ok) throw new Error(`rpc ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'unbekannt');

    // Lokalen Session-Cache nachziehen, damit die Seite sofort den
    // Warte-Zustand zeigt. Ein Reload würde denselben Wert liefern.
    const s = window.getSessionUser?.();
    if (s) s.teacher_status = data.status;
    requesting = false;
    renderState();
    toast('Antrag gestellt. Ein Admin schaltet dich frei.');
  } catch (e) {
    console.error('[mpskills] request_teacher_role:', e);
    requesting = false;
    if (btn) btn.disabled = false;
    toast('Antrag fehlgeschlagen: ' + e.message, 'error');
    // Ohne Knopf lief der Aufruf automatisch — dann muss die Seite
    // neu gezeichnet werden, sonst bliebe „wird beantragt …" stehen
    // und niemand käme mehr an den Antrag heran.
    if (!btn) renderState();
  }
}

/* ─── Anmelden ────────────────────────────────────────── */
async function doLogin(e) {
  e.preventDefault();
  const errBox = document.getElementById('loginError');
  errBox.hidden = true;

  if (!window.supabaseClient) {
    errBox.textContent = 'Verbindung nicht bereit. Bitte Seite neu laden.';
    errBox.hidden = false;
    return;
  }

  const slug     = document.getElementById('loginSchool').value;
  const account  = document.getElementById('loginAccount').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!account || !password) return;

  // Ohne Schule wird aus der Fake-Mail „name@.fake" — Supabase weist
  // das ab, und die Meldung darunter behauptete dann, das Passwort
  // stimme nicht. Kann passieren, solange die Schulliste noch lädt.
  if (!slug) {
    errBox.textContent = 'Die Schulliste ist noch nicht geladen. Einen Moment, dann noch einmal.';
    errBox.hidden = false;
    fillSchoolSelects();
    return;
  }

  const email = `${account}@${slug}.${window.FAKE_EMAIL_DOMAIN}`;
  const btn = document.getElementById('loginSubmit');
  btn.disabled = true;
  try {
    // VOR dem Anmelden setzen: das session-changed-Event kann durch
    // sein, bevor await zurückkehrt — dann liefe renderState an einer
    // Fahne vorbei, die erst danach gesetzt wird.
    requestAfterLogin = true;
    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      requestAfterLogin = false;
      errBox.textContent = 'Anmeldung fehlgeschlagen. Accountname, Schule oder Passwort stimmt nicht.';
      errBox.hidden = false;
      return;
    }
    // renderState läuft über das session-changed-Event, räumt den
    // Zugang weg und stellt den Antrag, falls noch keiner vorliegt.
  } catch (ex) {
    errBox.textContent = 'Fehler bei der Anmeldung: ' + (ex?.message ?? ex);
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ─── Konto anlegen ───────────────────────────────────── */
const SIGNUP_ERRORS = {
  account_name_invalid: 'Accountname ist ungültig. 2–20 Zeichen, nur a-z, 0-9, . _ -.',
  account_name_blocked: 'Dieser Accountname ist nicht erlaubt.',
  account_name_taken:   'Dieser Accountname ist in dieser Schule schon vergeben.',
  display_name_invalid: 'Anzeigename ist ungültig. 2–24 Zeichen.',
  display_name_blocked: 'Dieser Anzeigename ist nicht erlaubt.',
  school_required:      'Bitte eine Schule auswählen.',
  school_unknown:       'Diese Schule ist nicht bekannt.',
  context_invalid:      'Interner Fehler beim Anmelde-Kontext. Bitte Seite neu laden.',
  rate_limit:           'Zu viele Versuche. Bitte später erneut probieren.',
  server_misconfigured: 'Server-Konfiguration fehlt. Bitte an die Schulung wenden.',
  profile_create_failed:'Konto konnte nicht angelegt werden. Bitte später erneut versuchen.',
  blacklist_check_failed:'Server-Prüfung fehlgeschlagen. Bitte später erneut.'
};

async function doRegister(e) {
  e.preventDefault();
  const errBox = document.getElementById('registerError');
  const okBox  = document.getElementById('registerSuccess');
  const btn    = document.getElementById('registerSubmit');
  errBox.hidden = true;
  okBox.hidden  = true;

  const school_slug  = document.getElementById('regSchool').value;
  const account_name = document.getElementById('regAccount').value.trim().toLowerCase();
  const display_name = document.getElementById('regDisplayName').value.trim();
  const password     = document.getElementById('regPassword').value;
  const password2    = document.getElementById('regPassword2').value;

  if (password !== password2) {
    errBox.textContent = 'Die beiden Passwörter stimmen nicht überein.';
    errBox.hidden = false;
    return;
  }

  btn.disabled = true;
  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // context='mpskills' — der eine Unterschied zur Schulungs-Anmeldung.
      body: JSON.stringify({
        school_slug, account_name, display_name, password,
        context: 'mpskills'
      })
    });

    let body = null;
    const raw = await res.text();
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { _raw: raw }; }

    if (!res.ok || !body?.ok) {
      const mapped = SIGNUP_ERRORS[body?.error]
        || (body?.error === 'password_policy' ? (body.message || 'Passwort erfüllt die Anforderungen nicht.') : null);
      errBox.textContent = mapped
        || `Anmeldung fehlgeschlagen (HTTP ${res.status}${body?.error ? ' · ' + body.error : ''}).`;
      errBox.hidden = false;
      btn.disabled = false;
      return;
    }

    okBox.textContent = 'Konto angelegt. Du wirst angemeldet — ein Admin schaltet dich für MPSkills frei.';
    okBox.hidden = false;

    const { error: loginErr } = await window.supabaseClient.auth.signInWithPassword({
      email: body.email, password
    });
    if (loginErr) {
      errBox.textContent = 'Konto angelegt, aber die Anmeldung schlug fehl: ' + loginErr.message;
      errBox.hidden = false;
      btn.disabled = false;
    }
    // Bei Erfolg übernimmt session-changed → renderState: der Zugang
    // klappt weg, an seiner Stelle steht der Warte-Zustand.
  } catch (ex) {
    console.error('[mpskills] signup:', ex);
    errBox.textContent = 'Netzwerkfehler: ' + (ex?.message ?? ex);
    errBox.hidden = false;
    btn.disabled = false;
  }
}

/* ─── Verdrahtung ─────────────────────────────────────── */
wireJoinForm();

document.getElementById('accessToggle').addEventListener('click', () => {
  if (accessOpen()) closeAccess(); else openAccess();
});
document.getElementById('loginForm').addEventListener('submit', doLogin);
document.getElementById('registerForm').addEventListener('submit', doRegister);

// Ein Listener am Kasten statt an jedem Reiter — EINMAL, außerhalb
// von renderState: der Kasten bleibt stehen, sein Inhalt wird
// ersetzt, und ein Listener je Durchlauf summierte sich. Delegiert
// erwischt er zugleich den zweiten Umschalter, der im leeren
// Raum-Zustand steht und beim Verdrahten noch nicht existierte.
document.getElementById('stateHost').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) showTab(btn.dataset.tab);
});

document.getElementById('infobar').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-info]');
  if (btn) openInfo(btn.dataset.info);
});

// Klick auf den dunklen Grund schließt — aber nur dort, nicht im Kasten.
for (const id of ['privacyModal', 'aboutModal', 'authModal']) {
  const el = document.getElementById(id);
  el.addEventListener('click', (e) => {
    if (e.target !== el && !e.target.closest('[data-close]')) return;
    if (id === 'authModal') closeAuth(); else closeInfos();
  });
}

// Der Wechsel zwischen den beiden Wegen IM Modal. Delegiert, weil die
// Zeile bei jedem Öffnen neu geschrieben wird.
document.getElementById('authModal').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-auth]');
  if (btn) openAuth(btn.dataset.auth);
});

/* Ein Listener am Gitter statt an jeder Kachel — es wird bei jeder
   Änderung neu geschrieben. Am Gitter und nicht am Abschnitt, weil
   der Abschnitt zwischen zwei Orten hin- und herwandert; der
   Listener wandert dabei mit, das Gitter bleibt sein Anker.

   Dieselben Klassen wie in der Raumliste der Lehrkraft: damit
   greifen closeRowMenus(), der Schließer am document (gleich
   darunter) und Escape hier ohne eine Zeile mehr. */
document.getElementById('visitedGrid').addEventListener('click', (e) => {
  const mBtn = e.target.closest('.rowmenu-btn');
  if (mBtn) {
    const menu = mBtn.closest('.rowmenu');
    const pop  = menu.querySelector('.rowmenu-pop');
    closeRowMenus(menu);
    pop.hidden = !pop.hidden;
    mBtn.setAttribute('aria-expanded', String(!pop.hidden));
    return;
  }
  const aBtn = e.target.closest('.rowmenu-pop button[data-act="leave"]');
  if (aBtn) leaveRoom(aBtn.closest('.vtile').dataset.code, aBtn);
});

// Irgendwo anders hingefasst: das offene Zeilen-Menü zu. Am document
// und nicht an der Liste — geklickt wird ja gerade daneben.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.rowmenu')) closeRowMenus();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeInfos();
  closeAuth();
  closeRowMenus();
});

window.addEventListener('lernwelt:session-changed', renderState);
window.addEventListener('lernwelt:no-profile', () => {
  toast('Zu diesem Zugang gibt es kein Profil mehr. Bitte neu anmelden.', 'error');
});

(async function boot() {
  // Die Ecke oben rechts bekommt ein eigenes Fenster mit genau dem
  // Formular, das der Knopf verspricht.
  window.MPUserBar?.mount({
    onLogin:    () => openAuth('login'),
    onRegister: () => openAuth('register')
  });
  /* Die besuchten Räume werden bewusst NICHT vor der Session
     gezeichnet, obwohl sie im Gerät stehen und sofort da sein
     könnten: welche davon jemandem gehören, hängt seit der
     Trennung in lib/room.js an der Anmeldung. Vorher gezeichnet,
     blitzten einem Angemeldeten für einen Moment die anonymen
     Räume des Geräts auf. */
  await (window.waitForSession?.() ?? Promise.resolve());
  renderState();
})();
