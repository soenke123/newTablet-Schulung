/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Wild Clusters"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Ein unbekanntes Ökosystem von oben. Die Tiere haben keine Namen,
   sichtbar ist nur ihre Bewegung über fünf Tage — und die Klasse
   entscheidet, wer zusammengehört. Unüberwachtes Lernen, bevor das
   Wort fällt.

   ── Warum ein <iframe> wie bei NeuroLab ───────────────────────
   Wild Clusters ist eine gewachsene, allein lauffähige Anwendung:
   eigene Seite, eigener Kopf, dreißig Dateien unter js/, ein
   Stylesheet, das auf `body` und `html` geht und die Seite in
   Kopfzeile · Karte · Zeitleiste teilt. Hineinkopiert nähme es der
   MPSkills-Seite ihren Bau, und die Logik spricht das Dokument
   direkt an. Der Rahmen isoliert beides vollständig.

   ── Und warum es hier trotzdem mehr zu tun gibt ───────────────
   NeuroLab teilt nichts: dort hat update() nichts zu tun. Hier
   steuert der Raum wirklich etwas — die Lehrkraft schaltet die
   Phase, und das muss auf jedem Tablet ankommen. Dafür gibt es in
   der Anwendung eine Brücke (js/ui/bridge.js), die genau dann
   aufwacht, wenn sie in einem Rahmen steckt. Diese Datei ist ihr
   Gegenüber: sie übersetzt den Raum-Zustand in einen Befehl und
   das, was zurückkommt, in einen Beitrag.

   Zwei Nachrichten gehen hin (wc:cmd) und drei zurück (wc:event:
   ready · world · clusters, dazu world-pick als Bitte). Mehr ist es
   nicht.

   ── Drei Welten, und jede Person hat ihre eigenen ─────────────
   Drei, damit es eine Wahl gibt und trotzdem nicht vierzig. Und
   für JEDE PERSON ANDERE: wer neben sich schaut, sieht ein anderes
   Ökosystem, und die Frage „welche Gruppen hast du gebildet?" ist
   nicht mit Abschreiben zu beantworten.

   Gerechnet werden sie aus Raumcode + Sitzplatz + einem Salz
   (`skill_room_state.data.salt`, gesetzt beim Würfeln der
   Lehrkraft). Nicht gespeichert, sondern gerechnet — das ist der
   Unterschied zwischen „funktioniert sofort" und „funktioniert,
   sobald jemand einmal etwas geschrieben hat": dieselbe Person
   bekommt auf jedem Gerät und nach jedem Neuladen dieselben drei
   Zahlen, ohne dass irgendwer sie irgendwo ablegen müsste.

   Vergleichbar bleibt es trotzdem — über den Beamer: „Stand der
   Klasse" zeigt jede Person mit ihren drei Welten, und ein Tipp
   legt genau die auf, die sie gerade ansieht.

   ── Die Gruppierung gehört zur Welt ───────────────────────────
   Ein Cluster ist eine Menge Kachelnummern, und hinter der „17"
   steckt in einer anderen Welt ein anderes Tier. Bewahrt wird
   deshalb je Welt getrennt (payload.w, Schlüssel ist der Seed) —
   wer zwischen den drei Welten hin und her wechselt, findet seine
   Arbeit jedes Mal wieder vor.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Der Stempel gehört an die Rahmen-URL und nicht nur an die Dateien
     darin: index.html zöge sich sonst aus dem Cache, und ein Gerät,
     das Wild Clusters schon einmal geladen hat, bekäme eine alte Seite
     mit neuen Skripten — genau der Fall, in dem ein <script>-Tag fehlt,
     den niemand vermisst, bis die Brücke schweigt. Dieselbe Überlegung
     wie beim ?v= in lib/tool.js. */
  const V = '?v=20260903a';

  /* Was eine Raumphase für die Karte bedeutet. Die Zahl links kennt der
     Server (skill_tools.limits.phases = 3), alles rechts davon nur
     dieses Werkzeug.

     `wc` ist die Phase der Anwendung und zählt ab 0 — sie meint das
     Fenster in der Aufzeichnung (Tag 1–5 bzw. Tag 6–10) und nicht den
     Abschnitt der Stunde. Phase 2 und 3 zeigen dieselben fünf Tage:
     die Auflösung nimmt der Karte nichts weg, sie gibt nur den Blick
     frei. */
  const PHASES = {
    1: { wc: 0, masked: true, freeSeed: false,
         name: 'Gruppieren',
         hint: 'Tag 1–5 · verdeckte Sicht · Signale zu Gruppen ziehen' },
    2: { wc: 1, masked: true, freeSeed: false,
         name: 'Nachzügler',
         hint: 'Tag 6–10 · fünf Fremde sind dazugekommen' },
    3: { wc: 1, masked: null, freeSeed: true,
         name: 'Auflösung',
         hint: 'Landschaft und Tiere sichtbar · eigene Welten erlaubt' }
  };

  // Mehr als fünf Welten je Person gehen nicht in den payload (4 KB,
  // durchgesetzt von skill_check_payload). Drei gehören dem Raum, zwei
  // Plätze bleiben für selbst gewählte Seeds aus der Auflösungsphase.
  const MAX_WORLDS = 5;

  let root = null;
  let ctx = null;
  let frame = null;
  let onResize = null;
  let onMsg = null;

  let view = null;
  let bridgeReady = false;
  let worlds = [];
  let seed = null;              // die Welt, die gelten SOLL
  /* Und die, die im Rahmen tatsächlich steht. Zwei Angaben und nicht eine:
     ob eine gespeicherte Gruppierung mitgeschickt werden muss, ist genau die
     Frage, ob sich die beiden unterscheiden — und die soll nicht davon
     abhängen, welche Stelle im Code gerade ruft. */
  let frameSeed = null;
  let store = Object.create(null);   // Seed → Gruppierung
  let touched = Object.create(null); // Seed → wann zuletzt angefasst
  let restored = false;         // Bestand vom Server schon eingelesen?
  let myEntry = null;           // eigene Beitrags-ID
  let saveTimer = 0;
  let lastErr = '';
  let lastCmd = '';
  let free = false;             // Beamer: freier Modus
  let listOpen = false;         // Beamer: Stand der Klasse aufgeklappt
  let deskSeed = null;          // Beamer: welche Welt vorne steht

  const isPresenter = () => ctx && ctx.role === 'presenter';
  const esc = (s) => (ctx ? ctx.esc(s) : String(s == null ? '' : s));

  /* ══════════════════════════════════════════════════════════
     Die drei Welten
     ══════════════════════════════════════════════════════════ */

  /* FNV-1a mit Schlussmischung. Nicht kryptografisch und muss es nicht
     sein — verlangt ist nur, dass dieselbe Person überall dieselben drei
     Zahlen bekommt und zwei Personen selten dieselbe.

     Die Mischung am Ende (Murmur3-Finalizer) ist aber nicht Zierde: in
     FNV-1a hängen die UNTEREN Bits fast nur linear an der Eingabe, weil
     die Multiplikation Bits nur nach oben trägt — und `% 900000` liest
     genau diese unteren Bits. Ohne sie war messbar, dass zwei Welten
     desselben Platzes nach dem Würfeln denselben Abstand zueinander
     behielten. Auf der Leinwand fällt so etwas irgendwann jemandem auf,
     und dann sieht ein Zufall aus wie ein System. */
  function hash32(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  /* Die drei Welten einer Person: Raumcode + Sitzplatz + Salz.
     Sechsstellig, weil die Zahl vorgelesen und abgetippt wird
     („macht mal Welt 482917 auf") — dieselbe Länge, die die Anwendung
     selbst würfelt.

     Der Sitzplatz macht sie persönlich, das Salz erlaubt der Lehrkraft
     einen kompletten Neuanfang, und der Raumcode sorgt dafür, dass
     Sitzplatz 3 in zwei Klassen nicht dieselbe Welt bekommt. */
  function seedsFor(code, seat, salt) {
    const stem = String(code || '') + '|' + String(salt || 0) + '|platz' + Number(seat || 0);
    const out = [];
    let extra = 0;
    while (out.length < 3) {
      const n = 100000 + (hash32(stem + '|welt' + out.length + '|' + extra) % 900000);
      if (out.indexOf(n) < 0) out.push(n); else extra++;
    }
    return out;
  }

  /* Der Beamer sitzt auf keinem Platz. Er bekommt trotzdem drei eigene
     Welten (Platz 0) — die Lehrkraft soll etwas zum Vorführen haben,
     das niemandem gehört. Was ein einzelnes Kind sieht, holt sie über
     „Stand der Klasse". */
  function worldsOf(v) {
    const data = (v && v.state && v.state.data) || {};
    const seat = v && v.me ? v.me.seat : 0;
    return seedsFor(v && v.room ? v.room.code : '', seat, data.salt);
  }

  function phaseOf(v) {
    const n = Number(v && v.state ? v.state.phase : 1);
    return PHASES[n] ? n : 1;
  }

  /* Neue Welten für alle: nicht drei Zahlen, sondern ein neues Salz.
     Jede Person rechnet daraus ihre eigenen drei — der Raum trägt eine
     Zahl statt einer Liste je Teilnehmer, und wer erst morgen dazukommt,
     bekommt trotzdem Welten aus demselben Durchgang.

     Math.random ist hier richtig: ein Neuanfang SOLL keinem Muster
     folgen. Reproduzierbar ist er danach über das Salz. */
  const rollSalt = () => Date.now() % 100000 + Math.floor(Math.random() * 1000) * 100000;

  /* ══════════════════════════════════════════════════════════
     Der Bestand auf dem Gerät
     ══════════════════════════════════════════════════════════
     sessionStorage und nicht localStorage: ein Klassensatz-Tablet
     wechselt die Person, und die Gruppierung von gestern gehört
     jemand anderem. Was über die Sitzung hinaus bleiben soll, steht
     im Beitrag auf dem Server — der hängt am Token und damit an der
     richtigen Person. */

  const roomKey = () => 'wl:' + ((view && view.room && view.room.code) || 'raum');

  function loadLocal() {
    try {
      const raw = sessionStorage.getItem(roomKey() + ':store');
      const obj = raw ? JSON.parse(raw) : null;
      if (obj && typeof obj === 'object') store = obj;
      const s = sessionStorage.getItem(roomKey() + ':seed');
      if (s) seed = Number(s);
    } catch (e) { /* gesperrter Speicher: dann eben ohne */ }
  }

  function saveLocal() {
    try {
      sessionStorage.setItem(roomKey() + ':store', JSON.stringify(store));
      if (seed) sessionStorage.setItem(roomKey() + ':seed', String(seed));
    } catch (e) { /* voll oder gesperrt - der Server hat es ohnehin */ }
  }

  /* ══════════════════════════════════════════════════════════
     Der Beitrag auf dem Server
     ══════════════════════════════════════════════════════════ */

  function mine(v) {
    const list = (v && v.entries) || [];
    for (const e of list) if (e.is_mine && e.kind === 'gruppierung') return e;
    return null;
  }

  /* Einmal beim Aufsetzen: was auf dem Server liegt, in den Bestand.
     Vorhandenes wird NICHT überschrieben — was hier im Gerät steht,
     stammt aus dieser Sitzung und ist damit das Neuere (typisch: das
     WLAN war weg, gespeichert wurde noch nicht). Der Server gewinnt
     genau dort, wo das Gerät nichts hat, und das ist der Fall, für den
     er da ist: zweites Gerät, neu geladen, neuer Tag. */
  function absorb(entry) {
    const w = (entry && entry.payload && entry.payload.w) || {};
    for (const key of Object.keys(w)) {
      if (!store[key] && Array.isArray(w[key])) store[key] = w[key];
    }
    const cur = entry && entry.payload ? Number(entry.payload.cur) : 0;
    if (!seed && cur > 0) seed = cur;
    restored = true;
    saveLocal();
  }

  function scheduleSave() {
    if (isPresenter() || (ctx && ctx.preview)) return;
    if (saveTimer) clearTimeout(saveTimer);
    // Gebremst, weil beim Aufräumen einer Liste zehn Gruppen in zwanzig
    // Sekunden entstehen — jede einzeln zu senden hieße zwanzig Aufrufe
    // für einen Stand, der am Ende ohnehin nur einmal gilt.
    saveTimer = setTimeout(save, 1500);
  }

  function trimmed() {
    const keys = Object.keys(store);
    if (keys.length <= MAX_WORLDS) return store;
    const own = worlds.map(String);
    keys.sort((a, b) => {
      const ra = own.indexOf(a) >= 0 ? 1 : 0;
      const rb = own.indexOf(b) >= 0 ? 1 : 0;
      if (ra !== rb) return rb - ra;               // die eigenen drei zuerst
      return (touched[b] || 0) - (touched[a] || 0); // dann die zuletzt benutzten
    });
    const out = {};
    for (const k of keys.slice(0, MAX_WORLDS)) out[k] = store[k];
    return out;
  }

  async function save() {
    saveTimer = 0;
    if (!ctx || isPresenter() || ctx.preview) return;
    // Festhalten: gespeichert wird auch beim Verlassen, und dabei räumt
    // unmount() gleich danach ctx weg.
    const c = ctx;
    /* `ws` sind die drei eigenen Welten in ihrer Reihenfolge. Sie stehen
       mit im Beitrag, obwohl sie sich aus Code + Sitzplatz + Salz
       zurückrechnen ließen: der Beamer soll „Welt II" sagen können, ohne
       die Rechnung jedes Kindes nachzuvollziehen — und nach einem
       Würfeln der Lehrkraft käme dabei ohnehin das Falsche heraus, weil
       das Salz von heute nichts über den Beitrag von gestern sagt. */
    const payload = { cur: seed || null, phase: phaseOf(view), ws: worlds, w: trimmed() };
    const res = await c.actions.upsert(payload, myEntry, 'gruppierung');
    if (res.ok) {
      if (res.id) myEntry = res.id;
      lastErr = '';
      return;
    }
    /* Ein Kontingent von genau einem Beitrag heißt: der zweite ist immer
       eine Änderung des ersten. Kommt hier trotzdem „voll", fehlt uns nur
       seine ID — typisch auf einem zweiten Gerät, das noch keine Ansicht
       mit dem eigenen Beitrag gesehen hat. Nachladen holt sie, und der
       nächste Zug speichert. Eine Meldung wäre hier eine Fehlermeldung
       für einen Zustand, der sich von selbst löst. */
    if (res.error === 'quota_exceeded') { c.refresh(); return; }
    // Ohne Verbindung sagt die Seite das schon selbst (die Leiste aus
    // lib/room.js), und alle 1,5 Sekunden dieselbe Meldung liest
    // niemand. Alles andere ist eine echte Absage und gehört gesagt -
    // aber auch nur einmal je Art.
    if (res.error === 'network') return;
    if (res.error === lastErr) return;
    lastErr = res.error;
    c.toast(c.errText(res.error));
  }

  /* ══════════════════════════════════════════════════════════
     Der Befehl in den Rahmen
     ══════════════════════════════════════════════════════════ */

  function post(cmd) {
    if (!frame || !frame.contentWindow) return;
    cmd.type = 'wc:cmd';
    try { frame.contentWindow.postMessage(cmd, location.origin); } catch (e) { /* zu */ }
  }

  /**
   * Den aktuellen Stand in den Rahmen schicken.
   *
   * Die eine Entscheidung, die hier fällt: eine Gruppierung geht NUR
   * mit, wenn im Rahmen eine andere Welt steht als die gewünschte —
   * dann wird sie ohnehin neu gebaut und muss neu aufgelegt werden.
   * Läge sie in jedem Takt bei, würfe der Poller alle drei Sekunden
   * weg, was gerade gezogen wurde.
   *
   * Bewusst am Zustand entschieden und nicht am Aufrufer: „schick die
   * Gruppen mit" ist keine Absicht, die man an einer Stelle vergessen
   * kann, sondern eine Eigenschaft der Lage.
   */
  function push() {
    if (!bridgeReady || !view) return;
    const p = PHASES[phaseOf(view)];
    const want = isPresenter() ? (deskSeed || worlds[0]) : (seed || worlds[0]);
    const wechsel = String(want) !== String(frameSeed);

    const cmd = {
      seed: want,
      worlds: worlds,
      phase: free ? null : p.wc,
      masked: free ? null : p.masked,
      locks: {
        // Im freien Modus darf die Lehrkraft alles: eigener Seed, Phase
        // von Hand, offene Sicht. Nichts davon verlässt ihr Gerät.
        seed: free ? false : !p.freeSeed,
        advance: !free,
        brand: true
      }
    };
    if (wechsel) cmd.groups = store[String(want)] || [];

    // Zweimal denselben Befehl zu schicken kostet nichts, aber es macht
    // die Ursachensuche schwer: was im Rahmen passiert, soll auf eine
    // Änderung hier zurückzuführen sein.
    const key = JSON.stringify(cmd);
    if (!wechsel && key === lastCmd) return;
    lastCmd = key;
    post(cmd);
  }

  /** Eine andere Welt aufmachen — mit dem, was dort zuletzt lag. */
  function pick(nextSeed) {
    const n = Number(nextSeed);
    if (!n) return;
    if (isPresenter()) { deskSeed = n; push(); paintDesk(); return; }
    seed = n;
    touched[String(n)] = Date.now();
    saveLocal();
    push();
  }

  /* ══════════════════════════════════════════════════════════
     Nachrichten aus dem Rahmen
     ══════════════════════════════════════════════════════════ */

  function handle(e) {
    if (!frame || e.source !== frame.contentWindow) return;
    if (e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.type !== 'wc:event') return;

    if (m.event === 'ready') {
      bridgeReady = true;
      // Der Rahmen hat noch keine Welt (siehe WC_EMBEDDED in bridge.js) -
      // dieser Befehl ist der, der sie baut.
      frameSeed = null;
      push();
      return;
    }

    if (m.event === 'world-pick') { pick(m.seed); return; }

    if (m.event === 'world') {
      frameSeed = Number(m.seed);
      if (isPresenter()) { deskSeed = frameSeed; paintDesk(); }
      else { seed = frameSeed; touched[String(seed)] = Date.now(); saveLocal(); }
      return;
    }

    if (m.event === 'clusters') {
      // Am Beamer ist die Karte ein Notizblock: dort wird gezeigt und
      // ausprobiert, nicht gearbeitet. Was die Lehrkraft dort zieht,
      // gehört niemandem und wird nirgends gespeichert.
      if (isPresenter() || (ctx && ctx.preview)) return;
      const key = String(m.seed);
      store[key] = m.groups || [];
      touched[key] = Date.now();
      saveLocal();
      scheduleSave();
    }
  }

  /* ══════════════════════════════════════════════════════════
     Der Rahmen und seine Höhe
     ══════════════════════════════════════════════════════════
     Wörtlich dieselbe Rechnung wie in tools/NeuroLab/tool.js und
     tools/wordcloud/tool.js: der Rahmen soll bis an die untere
     Bildschirmkante reichen und keinen Punkt weiter. Gemessen und
     nicht gerechnet — über dem Rahmen stehen je nach Rolle und
     Breite unterschiedlich hohe Leisten. */

  const GAP = 12;
  const MIN = 420;

  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight
             + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fit() {
    if (!frame) return;
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  /* ══════════════════════════════════════════════════════════
     Das Steuerpult (nur Beamer)
     ══════════════════════════════════════════════════════════ */

  const $ = (id) => root && root.querySelector('#' + id);

  function deskHTML() {
    return `
    <div class="wl-desk" id="wlDesk">
      <div class="wl-row">
        <span class="wl-label">Phase</span>
        <div class="wl-seg" id="wlPhases"></div>
        <span class="wl-hint" id="wlPhaseHint"></span>
      </div>
      <div class="wl-row">
        <span class="wl-label">Welt</span>
        <div class="wl-seg" id="wlWorlds"></div>
        <span class="wl-hint">Ihre eigenen — jedes Kind hat andere.</span>
        <button type="button" class="wl-btn wl-ghost" id="wlRoll">⟳ neue Welten für alle</button>
      </div>
      <div class="wl-row wl-row--end">
        <button type="button" class="wl-btn wl-ghost" id="wlList" aria-expanded="false">Stand der Klasse</button>
        <button type="button" class="wl-btn wl-ghost" id="wlFree" aria-pressed="false">Freier Modus</button>
        <a class="wl-btn wl-ghost" id="wlSheet" hidden target="_blank" rel="noopener">Arbeitsblatt</a>
      </div>
      <p class="wl-free" id="wlFreeNote" hidden>
        Freier Modus: eigene Welt, eigene Phase, offene Sicht — <strong>die Klasse sieht davon nichts.</strong>
      </p>
      <div class="wl-list" id="wlPeople" hidden></div>
    </div>`;
  }

  function paintDesk() {
    if (!isPresenter() || !root || !view) return;
    const phase = phaseOf(view);

    const segs = $('wlPhases');
    if (segs) {
      segs.innerHTML = Object.keys(PHASES).map(n => {
        const on = Number(n) === phase;
        return `<button type="button" class="wl-btn wl-seg-btn" data-phase="${n}"
                  aria-pressed="${on ? 'true' : 'false'}">${n} ${esc(PHASES[n].name)}</button>`;
      }).join('');
    }
    const hint = $('wlPhaseHint');
    if (hint) hint.textContent = PHASES[phase].hint;

    const box = $('wlWorlds');
    if (box) {
      const ROMAN = ['I', 'II', 'III'];
      box.innerHTML = worlds.map((s, i) => {
        const on = String(s) === String(deskSeed);
        return `<button type="button" class="wl-btn wl-seg-btn" data-seed="${s}"
                  aria-pressed="${on ? 'true' : 'false'}">${ROMAN[i] || (i + 1)} · ${s}</button>`;
      }).join('');
    }

    const sheet = $('wlSheet');
    const url = view.limits && view.limits.worksheet_url;
    if (sheet) {
      sheet.hidden = !url;
      if (url) sheet.href = url;
    }

    const free_ = $('wlFree');
    if (free_) free_.setAttribute('aria-pressed', free ? 'true' : 'false');
    const note = $('wlFreeNote');
    if (note) note.hidden = !free;

    paintPeople();
  }

  /* Der Stand der Klasse. EINE Zeile je Person, und darin ihre drei
     Welten nebeneinander:

       Mia    Welt I (2 Cluster) · Welt II (4, gerade hier) · Welt III (–)

     Nicht eine Zeile je Welt: gesucht ist „wie weit ist Mia", und das
     ist eine Zeile. Die drei Zahlen daneben beantworten nebenbei, ob
     jemand sich durch alle drei geklickt hat, ohne irgendwo anzufangen.

     Ein Tipp auf die Zeile legt die Welt auf, die diese Person GERADE
     ansieht — samt ihrer Gruppen. Das ist der Fall, für den die Liste
     da ist: vorne steht dann genau das, was sie vor sich hat. */
  function paintPeople() {
    const box = $('wlPeople');
    if (!box) return;
    box.hidden = !listOpen;
    if (!listOpen) return;

    const rows = (view.entries || [])
      .filter(e => e.kind === 'gruppierung' && e.payload)
      .map(e => {
        const w = e.payload.w || {};
        // `ws` sind die drei eigenen Welten in ihrer Reihenfolge, und nur
        // daraus wird „Welt II". Fehlt die Angabe, bleibt die Reihenfolge,
        // in der die Welten bearbeitet wurden — die Nummer stimmt dann
        // vielleicht nicht, aber die Zeile steht.
        const list = Array.isArray(e.payload.ws) && e.payload.ws.length
          ? e.payload.ws.map(String) : Object.keys(w);
        const cur = e.payload.cur != null ? String(e.payload.cur) : null;
        // Eine selbst eingetippte Welt aus der Auflösungsphase gehört
        // nicht zu den drei, ist aber das, was die Person gerade ansieht.
        if (cur && list.indexOf(cur) < 0) list.push(cur);
        return { id: e.id, who: e.author, cur: cur, list: list, w: w };
      });

    if (!rows.length) {
      box.innerHTML = '<p class="wl-empty">Noch hat niemand gruppiert.</p>';
      return;
    }

    rows.sort((a, b) => String(a.who).localeCompare(String(b.who), 'de'));

    const ROMAN = ['I', 'II', 'III'];
    box.innerHTML = rows.map(r => {
      const worldsHTML = r.list.map((s, i) => {
        const n = (r.w[s] || []).length;
        const here = s === r.cur;
        const name = i < ROMAN.length ? 'Welt ' + ROMAN[i] : 'eigene Welt';
        const zahl = n === 0 ? '–' : n + (n === 1 ? ' Cluster' : ' Cluster');
        return `<span class="wl-w${here ? ' wl-w--here' : ''}" title="Seed ${esc(s)}">`
          + `${esc(name)} <b>(${esc(zahl)}${here ? ', gerade hier' : ''})</b></span>`;
      }).join('');

      return `<button type="button" class="wl-person" data-eid="${esc(r.id)}"
                      ${r.cur ? '' : 'disabled'}
                      title="${esc(r.who)}s aktuelle Sicht auf die Leinwand">
        <span class="wl-who">${esc(r.who)}</span>
        <span class="wl-worlds">${worldsHTML || '<span class="wl-none">noch nichts</span>'}</span>
        <span class="wl-go" aria-hidden="true">▸</span>
      </button>`;
    }).join('');
  }

  function wireDesk() {
    const desk = $('wlDesk');
    if (!desk) return;

    desk.addEventListener('click', async (e) => {
      const btn = e.target.closest ? e.target.closest('button, a') : null;
      if (!btn) return;

      if (btn.dataset.phase) {
        const res = await ctx.actions.setPhase(Number(btn.dataset.phase));
        if (!res.ok) { ctx.toast(ctx.errText(res.error)); return; }
        ctx.refresh();
        return;
      }

      if (btn.dataset.seed) { pick(btn.dataset.seed); return; }

      if (btn.dataset.eid) {
        /* Die aktuelle Sicht einer Person vorne auflegen: ihre laufende
           Welt und die Gruppen, die sie darin gebildet hat. Beides in
           EINEM Befehl, sonst stünde für einen Moment eine leere Liste
           da und die Gruppen fielen sichtbar hinterher hinein.

           Gesucht wird über die Beitrags-ID und nicht über den Namen:
           zwei Tablets ohne Namen heißen beide „User 3", sobald eines
           den Raum verlassen und ein neues denselben Platz bekommen
           hat. */
        const entry = (view.entries || []).find(x => x.id === btn.dataset.eid);
        const pay = entry ? entry.payload : null;
        if (!pay || pay.cur == null) return;
        deskSeed = Number(pay.cur);
        const p = PHASES[phaseOf(view)];
        post({
          seed: deskSeed,
          worlds: worlds,
          phase: free ? null : p.wc,
          masked: free ? null : p.masked,
          locks: { seed: !free, advance: !free, brand: true },
          groups: (pay.w && pay.w[String(pay.cur)]) || []
        });
        // Der nächste push() soll nicht denken, er habe das schon
        // geschickt - er kennt die Gruppen darin nicht.
        lastCmd = '';
        paintDesk();
        return;
      }

      if (btn.id === 'wlRoll') {
        const ok = await ctx.confirm(
          'Neue Welten für alle?\n\n'
          + 'Jede Person bekommt drei neue, wieder für sie allein. Die Klasse '
          + 'verliert damit die Welt, in der sie gerade arbeitet — die '
          + 'Gruppierungen bleiben gespeichert, aber die alten Welten sind '
          + 'nicht mehr zu erreichen.');
        if (!ok) return;
        const res = await ctx.actions.setData({ salt: rollSalt() });
        if (!res.ok) { ctx.toast(ctx.errText(res.error)); return; }
        deskSeed = null;
        ctx.refresh();
        return;
      }

      if (btn.id === 'wlList') {
        listOpen = !listOpen;
        btn.setAttribute('aria-expanded', listOpen ? 'true' : 'false');
        paintPeople();
        fit();
        return;
      }

      if (btn.id === 'wlFree') {
        free = !free;
        lastCmd = '';
        paintDesk();
        push();
        return;
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     Schnittstelle nach außen
     ══════════════════════════════════════════════════════════ */

  window.MPTool.register('wildclusters', {

    /* Nichts abzufragen. Die Leitfrage dieses Skills ist die Karte
       selbst, die drei Welten kommen aus dem Raumcode, und die Phase
       schaltet die Lehrkraft im Raum und nicht beim Anlegen.

       Die leere Liste ist trotzdem eine Angabe: lehrer.js unterscheidet
       daran „dieser Skill hat keine Einstellungen" von „die
       Einstellungen sind noch nicht geladen". */
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      bridgeReady = false;
      restored = false;
      myEntry = null;
      lastCmd = '';
      lastErr = '';
      free = false;
      listOpen = false;
      deskSeed = null;
      store = Object.create(null);
      touched = Object.create(null);
      seed = null;

      root.innerHTML =
        '<div class="wl-host">'
        + (ctx.role === 'presenter' ? deskHTML() : '')
        + '<iframe class="wl-frame" src="tools/wildclusters/index.html' + V + '" '
        +         'title="Wild Clusters" loading="eager"></iframe>'
        + '</div>';

      frame = root.querySelector('.wl-frame');
      if (ctx.role === 'presenter') wireDesk();

      /* Der Rahmen reicht bis an die untere Kante, also darf darunter
         nichts mehr stehen — sonst schöbe der Seitenfuß ihn beim
         Scrollen nach oben und der gemessene Platz stimmte nicht mehr.
         Dieselbe Regel wie bei NeuroLab und der Wortwolke. */
      if (!ctx.preview) document.body.classList.add('tool-fill');

      onMsg = handle;
      window.addEventListener('message', onMsg);
      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    update(v) {
      view = v;
      if (!restored) {
        // Erst das Gerät, dann der Server: was hier liegt, ist aus
        // dieser Sitzung (siehe absorb). Am Beamer gibt es beides nicht -
        // dort ist die Karte ein Notizblock und kein Arbeitsplatz.
        if (!isPresenter()) {
          loadLocal();
          const e = mine(v);
          if (e) { myEntry = e.id; absorb(e); }
        }
        restored = true;
      } else {
        const e = mine(v);
        if (e && !myEntry) myEntry = e.id;
      }

      worlds = worldsOf(v);
      // Eine Welt, die es nicht mehr gibt (die Lehrkraft hat gewürfelt),
      // ist keine Welt, in der man weiterarbeiten kann.
      if (!seed || (!PHASES[phaseOf(v)].freeSeed && worlds.map(String).indexOf(String(seed)) < 0)) {
        seed = worlds[0];
      }
      /* Am Beamer wird nur eingesprungen, wenn noch gar nichts steht.
         Nicht „liegt außerhalb der eigenen drei" wie beim Tablet: dort
         steht regelmäßig die Welt eines Kindes oder eine selbst
         eingetippte, und der Poller dürfte sie nicht alle drei Sekunden
         wegziehen. */
      if (isPresenter() && !deskSeed) deskSeed = worlds[0];

      push();
      paintDesk();
    },

    unmount() {
      // Was noch nicht durch ist, geht jetzt raus - ein Tipp auf
      // „Zurück" darf die letzten anderthalb Sekunden nicht kosten.
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; save(); }
      if (onMsg) window.removeEventListener('message', onMsg);
      if (onResize) window.removeEventListener('resize', onResize);
      onMsg = null;
      onResize = null;
      document.body.classList.remove('tool-fill');
      frame = null;
      root = null;
      ctx = null;
      view = null;
      bridgeReady = false;
    }
  });
})();
