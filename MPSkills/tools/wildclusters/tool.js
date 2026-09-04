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

   Eine Nachricht geht hin (wc:cmd) und drei kommen zurück (wc:event:
   ready · world · clusters), dazu zwei Bitten: world-pick und note.
   Mehr ist es nicht.

   ── Drei Welten, und jede Person hat ihre eigenen ─────────────
   Drei, damit es eine Wahl gibt und trotzdem nicht vierzig. Und
   für JEDE PERSON ANDERE: wer neben sich schaut, sieht ein anderes
   Ökosystem, und die Frage „welche Gruppen hast du gebildet?" ist
   nicht mit Abschreiben zu beantworten.

   Gerechnet werden sie aus Raumcode + Sitzplatz. Nicht gespeichert,
   sondern gerechnet — das ist der Unterschied zwischen
   „funktioniert sofort" und „funktioniert, sobald jemand einmal
   etwas geschrieben hat": dieselbe Person bekommt auf jedem Gerät
   und nach jedem Neuladen dieselben drei Zahlen, ohne dass irgendwer
   sie irgendwo ablegen müsste. Und die Lehrkraft muss dafür nichts
   tun — ein neuer Raum ist ein neuer Satz Welten, das ist die ganze
   Bedienung.

   Vergleichbar bleibt es trotzdem — über den Beamer: „Stand der
   Klasse" zeigt jede Person mit ihren drei Welten, und ein Tipp
   legt genau die auf, die sie gerade ansieht. Solange sie
   aufgelegt ist, folgt die Leinwand ihr: wechselt das Kind die Welt
   oder zieht es eine Gruppe, ist das vorne beim nächsten Takt zu
   sehen.

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
  const V = '?v=20260904b';

  /* Was eine Raumphase für die Karte bedeutet. Die Zahl links kennt der
     Server (skill_tools.limits.phases = 3), alles rechts davon nur
     dieses Werkzeug.

     `wc` ist die Phase der Anwendung und zählt ab 0 — sie meint das
     Fenster in der Aufzeichnung (Tag 1–5 bzw. Tag 6–10) und nicht den
     Abschnitt der Stunde. Phase 2 und 3 zeigen dieselben fünf Tage:
     die Auflösung nimmt der Karte nichts weg, sie gibt nur den Blick
     frei. */
  const PHASES = {
    1: { wc: 0, mask: { w: true, a: true }, freeSeed: false,
         name: 'Gruppieren',
         hint: 'Tag 1–5 · verdeckte Sicht · Signale zu Gruppen ziehen' },
    2: { wc: 1, mask: { w: true, a: true }, freeSeed: false,
         name: 'Nachzügler',
         hint: 'Tag 6–10 · fünf Fremde sind dazugekommen' },
    /* mask: null heißt nicht „frei", sondern „steht im Raum-Zustand". Die
       Auflösung ist der einzige Abschnitt, in dem die Lehrkraft die beiden
       Schleier einzeln hebt — der Knopf auf dem Tablet bleibt auch hier
       gesperrt, sonst deckt das erste Kind alles auf, bevor die Frage
       gestellt ist. */
    3: { wc: 1, mask: null, freeSeed: true,
         name: 'Auflösung',
         hint: 'die Lehrkraft deckt auf · eigene Welten erlaubt' }
  };

  /* Die Knöpfe am Pult — vier für drei Phasen.
     Die Auflösung besteht aus zwei Handgriffen, und die stehen hier als
     eigene Schritte („3a Welt auflösen", „3b Tiere aufdecken") statt in einer
     zweiten Reihe darunter: es ist derselbe Ablauf, und wer ihn vorne
     abarbeitet, sucht die Fortsetzung dort, wo eben noch die Phase stand.

     Ein Schritt mit `veil` schaltet den Schleier UND, falls nötig, die Phase.
     Umgekehrt nehmen 1 und 2 beide Schleier wieder zurück — sonst käme man
     nach einem Rücksprung in eine Auflösung, die schon aufgelöst ist. */
  const STEPS = [
    { id: '1', phase: 1, label: '1 Gruppieren',
      title: 'Tag 1–5 · verdeckte Sicht · Signale zu Gruppen ziehen' },
    { id: '2', phase: 2, label: '2 Nachzügler',
      title: 'Tag 6–10 · fünf Fremde sind dazugekommen' },
    { id: '3a', phase: 3, veil: 'rw', label: '3a Welt auflösen',
      title: 'Die Landschaft wird sichtbar — die Tiere bleiben Nummern' },
    { id: '3b', phase: 3, veil: 'ra', label: '3b Tiere aufdecken',
      title: 'Die Tiere bekommen ihr Bild — die Nummer bleibt daneben stehen' }
  ];

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
  /* Beamer: wessen Sicht gerade vorne läuft (Beitrags-ID) — und zwar
     fortlaufend, nicht als einmaliger Abzug. Wer beobachtet wird, zieht
     weiter Gruppen und wechselt Welten, und genau das soll vorne zu sehen
     sein. Der Poller liefert alle drei Sekunden neue Beiträge; push() nimmt
     daraus jedes Mal den aktuellen Stand. */
  let watchEid = null;
  /* Und was zuletzt in den Rahmen ging, als jemandem zugesehen wurde. Daran
     hängt der Unterschied zwischen „das kam gerade von uns" und „die Lehrkraft
     hat selbst eine Kachel gezogen" — siehe handle(). */
  let sentGroups = '';
  /* Wessen Welt am Pult steht, nachdem die Lehrkraft darin selbst gearbeitet
     hat. Das Zusehen ist damit beendet (sonst überführe der nächste Poll ihre
     Arbeit), die Welt bleibt aber die des Kindes — und der Streifen oben sagt
     das auch. */
  let takeover = null;
  /* Der Rahmen meldet nach jedem Weltaufbau, was auf der neuen Welt liegt.
     Das ist sein Bericht und keine Handlung — in Phase 2 schiebt die Anwendung
     die Nachzügler von sich aus zu einem Haufen zusammen, und ohne diesen
     Riegel sähe genau das aus wie „die Lehrkraft hat gezogen". */
  let rebase = false;
  let onFs = null;              // Beamer: Vollbild kam oder ging

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

  /* Die drei Welten einer Person: Raumcode + Sitzplatz. Sechsstellig, weil
     die Zahl vorgelesen und abgetippt wird („macht mal Welt 482917 auf") —
     dieselbe Länge, die die Anwendung selbst würfelt.

     Der Sitzplatz macht sie persönlich, der Raumcode sorgt dafür, dass
     Sitzplatz 3 in zwei Klassen nicht dieselbe Welt bekommt. Einen Knopf zum
     Neuwürfeln gibt es bewusst nicht: ein neuer Raum ist ein neuer Satz
     Welten, und ein Knopf, der der halben Klasse mitten in der Stunde die
     Arbeitsgrundlage wegzieht, ist ein Fehler, der auf sein Auftreten
     wartet. */
  function seedsFor(code, seat) {
    const stem = String(code || '') + '|platz' + Number(seat || 0);
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
    const seat = v && v.me ? v.me.seat : 0;
    return seedsFor(v && v.room ? v.room.code : '', seat);
  }

  function phaseOf(v) {
    const n = Number(v && v.state ? v.state.phase : 1);
    return PHASES[n] ? n : 1;
  }

  /* Was gerade verdeckt ist — zwei Schleier, Landschaft und Tiere.
     In Phase 1 und 2 steht das fest. In der Auflösung kommt es aus dem
     Raum-Zustand: `rw` heißt „die Welt ist aufgedeckt", `ra` „die Tiere
     sind es". Beide fehlen anfangs, und das ist richtig — die Auflösung
     beginnt mit demselben Bild wie Phase 2, und erst der Griff der
     Lehrkraft ans Pult macht daraus ein Ereignis. */
  function maskOf(v) {
    const p = PHASES[phaseOf(v)];
    if (p.mask) return p.mask;
    const d = (v && v.state && v.state.data) || {};
    return { w: !d.rw, a: !d.ra };
  }

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
    /* `ws` sind die drei eigenen Welten in ihrer Reihenfolge. Sie stehen mit
       im Beitrag, obwohl sie sich aus Raumcode + Sitzplatz zurückrechnen
       ließen: der Beamer hat den Sitzplatz der Verfasserin nicht — ein
       Beitrag trägt einen Namen, keine Nummer. „Welt II" wäre sonst nicht zu
       sagen, nur „Welt 482917". */
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

  /* Eine Gruppierung als Zeichenkette, die nur ihre Einteilung meint: welche
     Signale liegen zusammen. Ohne Farbe und ohne Reihenfolge — beides kann
     sich unterwegs ändern, ohne dass jemand etwas anders gruppiert hätte. */
  function groupsKey(list) {
    return (list || [])
      .map(g => ((g && (g.m || g.members)) || []).slice().sort((a, b) => a - b).join('.'))
      .sort()
      .join('|');
  }

  /** Der Beitrag, dessen Sicht gerade vorne läuft — oder null. */
  function watched() {
    if (!watchEid || !view) return null;
    const e = (view.entries || []).find(x => x.id === watchEid);
    const pay = e && e.payload;
    if (!pay || pay.cur == null) return null;
    return {
      who: e.author || 'jemand',
      cur: Number(pay.cur),
      groups: (pay.w && pay.w[String(pay.cur)]) || []
    };
  }

  /**
   * Den aktuellen Stand in den Rahmen schicken.
   *
   * Zwei Entscheidungen fallen hier, und beide am Zustand statt am
   * Aufrufer — „schick die Gruppen mit" ist keine Absicht, die man an einer
   * Stelle vergessen kann, sondern eine Eigenschaft der Lage:
   *
   * 1. Wer beobachtet wird, gibt die Welt vor. Der Poller bringt alle drei
   *    Sekunden seinen neuesten Beitrag, und der geht hier weiter: wechselt
   *    das Kind die Welt oder zieht es eine Gruppe, folgt die Leinwand.
   * 2. Sonst geht eine Gruppierung NUR mit, wenn im Rahmen eine andere Welt
   *    steht als die gewünschte — dann wird sie ohnehin neu gebaut. Läge sie
   *    in jedem Takt bei, würfe der Poller alle drei Sekunden weg, was gerade
   *    gezogen wurde.
   */
  function push() {
    if (!bridgeReady || !view) return;
    const p = PHASES[phaseOf(view)];
    const watch = isPresenter() ? watched() : null;
    const want = watch ? watch.cur : (isPresenter() ? (deskSeed || worlds[0]) : (seed || worlds[0]));
    const wechsel = String(want) !== String(frameSeed);

    const cmd = {
      seed: want,
      worlds: worlds,
      phase: free ? null : p.wc,
      masked: free ? null : maskOf(view),
      locks: {
        // Im freien Modus darf die Lehrkraft alles: eigener Seed, Phase
        // von Hand, offene Sicht. Nichts davon verlässt ihr Gerät.
        seed: free ? false : !p.freeSeed,
        advance: !free,
        view: !free,
        brand: true,
        /* Die beiden hängen an der ROLLE und nicht an der Phase: das kleine
           „i" erklärt Tasten (auf einem Tablet gibt es keine), und die
           Kontrollanzeige nennt Arten und Merkmalswerte — also die Lösung.
           Beides gehört ans Pult und bleibt dort in jeder Phase. */
        info: !isPresenter(),
        details: !isPresenter()
      },
      // Der Streifen in der Kopfzeile des Rahmens. Nur die Lehrkraft bekommt
      // ihn; auf einem Tablet gibt es nichts zu melden.
      note: isPresenter() ? noteOf(watch) : null
    };
    if (watch) cmd.groups = watch.groups;
    else if (wechsel) cmd.groups = store[String(want)] || [];
    if (cmd.groups) sentGroups = groupsKey(cmd.groups);

    /* Zweimal denselben Befehl zu schicken kostet nichts, aber es macht die
       Ursachensuche schwer: was im Rahmen passiert, soll auf eine Änderung
       hier zurückzuführen sein. Beim Beobachten trägt der Vergleich
       zusätzlich die Arbeit: die Gruppen stehen mit im Schlüssel, ein
       unveränderter Stand wird also gar nicht erst geschickt — und ein
       veränderter kommt durch, ohne dass irgendwer ihn vergleichen müsste. */
    const key = JSON.stringify(cmd);
    if (!wechsel && key === lastCmd) return;
    lastCmd = key;
    post(cmd);
  }

  /** Eine andere Welt aufmachen — mit dem, was dort zuletzt lag. */
  function pick(nextSeed) {
    const n = Number(nextSeed);
    if (!n) return;
    if (isPresenter()) {
      // Selbst eine Welt zu wählen heißt: nicht mehr jemandem zusehen.
      // Beides gleichzeitig wäre ein Bild, das gleich wieder wegspringt.
      watchEid = null;
      takeover = null;
      deskSeed = n;
      push();
      paintDesk();
      return;
    }
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

    /* Die beiden Knöpfe im Streifen oben rechts. Sie stecken im Rahmen (dort
       ist die Zeile), entscheiden aber nichts — was „aufhören" und „Vollbild
       verlassen" bedeuten, weiß nur diese Seite. */
    if (m.event === 'note') {
      if (m.action === 'stop') {
        watchEid = null;
        takeover = null;
        free = false;
        // „Zurück zur eigenen Welt" heißt wörtlich das: auf dem Pult stand
        // bis eben die Welt eines Kindes, und die gehört nicht der Lehrkraft.
        if (worlds.length && worlds.map(String).indexOf(String(deskSeed)) < 0) {
          deskSeed = worlds[0];
        }
        lastCmd = '';
        push();
        paintDesk();
      } else if (m.action === 'exit') {
        toggleFull();
      }
      return;
    }

    if (m.event === 'world') {
      frameSeed = Number(m.seed);
      // Gleich darauf kommt sein Bericht über die neue Welt — der ist der neue
      // Vergleichsmaßstab und nicht die Arbeit von jemandem.
      rebase = true;
      if (isPresenter()) { deskSeed = frameSeed; paintDesk(); }
      else { seed = frameSeed; touched[String(seed)] = Date.now(); saveLocal(); }
      return;
    }

    if (m.event === 'clusters') {
      // Am Beamer ist die Karte ein Notizblock: dort wird gezeigt und
      // ausprobiert, nicht gearbeitet. Was die Lehrkraft dort zieht,
      // gehört niemandem und wird nirgends gespeichert.
      if (isPresenter()) {
        if (rebase) { rebase = false; sentGroups = groupsKey(m.groups); return; }
        /* Ein Notizblock, auf dem man auch schreiben kann. Wer beim Zusehen
           selbst eine Kachel zieht, übernimmt: das Zusehen hört auf, die Welt
           des Kindes bleibt stehen. Vorher lief die Arbeit ins Leere — beim
           nächsten Poll legte push() die Gruppierung des Kindes wieder auf,
           und vorne sprang alles zurück.

           Erkannt wird es am Vergleich mit dem, was zuletzt hineingegangen
           ist: der Rahmen meldet jede aufgelegte Gruppierung zurück, und die
           soll natürlich nichts auslösen. */
        if (watchEid && groupsKey(m.groups) !== sentGroups) {
          const w = watched();
          takeover = w ? w.who : null;
          watchEid = null;
          deskSeed = Number(m.seed) || deskSeed;
          lastCmd = '';
          push();
          paintDesk();
        }
        return;
      }
      rebase = false;
      if (ctx && ctx.preview) return;
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
    // Im Vollbild misst niemand: dort füllt der Rahmen den Kasten, und der
    // Kasten den Bildschirm (CSS, mit !important gegen genau diese Zeile).
    if (isFull()) { frame.style.height = ''; return; }
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  /* ══════════════════════════════════════════════════════════
     Das Steuerpult (nur Beamer)
     ══════════════════════════════════════════════════════════ */

  const $ = (id) => root && root.querySelector('#' + id);

  /* Eine Zeile, und in ihr alles, was während der Stunde gedrückt wird: links
     die vier Schritte, rechts die drei Werkzeuge.

     Vorher standen hier vier Reihen — Phase, Aufdecken, Welt, Werkzeuge —,
     und drei davon waren Auskunft statt Bedienung: die drei Welten der
     Lehrkraft samt ihren Seeds stehen ohnehin in der Kopfzeile des Rahmens,
     und die Hinweistexte daneben las nach dem ersten Mal niemand mehr. Was
     eine Leinwand braucht, ist eine Reihe Knöpfe, die man aus fünf Metern
     Entfernung noch trifft — und darüber die Karte. */
  function deskHTML() {
    return `
    <div class="wl-desk" id="wlDesk">
      <div class="wl-row">
        <div class="wl-seg" id="wlPhases"></div>
        <div class="wl-seg wl-seg--end">
          <button type="button" class="wl-btn wl-ghost" id="wlList" aria-expanded="false">Stand der Klasse</button>
          <button type="button" class="wl-btn wl-ghost" id="wlFree" aria-pressed="false">Freier Modus</button>
          <button type="button" class="wl-btn wl-ghost" id="wlFull" aria-pressed="false">⛶ Vollbild</button>
          <a class="wl-btn wl-ghost" id="wlSheet" hidden target="_blank" rel="noopener">Arbeitsblatt</a>
        </div>
      </div>
      <div class="wl-list" id="wlPeople" hidden></div>
    </div>`;
  }

  function paintDesk() {
    if (!isPresenter() || !root || !view) return;
    const phase = phaseOf(view);
    const d = (view.state && view.state.data) || {};

    const segs = $('wlPhases');
    if (segs) {
      segs.innerHTML = STEPS.map(s => {
        // Ein Schritt der Auflösung ist gedrückt, wenn SEIN Schleier oben ist —
        // nicht schon dann, wenn die Phase läuft. Dass sie läuft, sagt der
        // Rahmen darum (aria-current).
        const on = s.veil ? (phase === 3 && !!d[s.veil]) : (phase === s.phase);
        const now = phase === s.phase;
        return `<button type="button" class="wl-btn wl-seg-btn" data-step="${s.id}"
                  title="${esc(s.title)}"
                  ${now ? 'aria-current="step"' : ''}
                  aria-pressed="${on ? 'true' : 'false'}">${esc(s.label)}</button>`;
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
    const full = $('wlFull');
    if (full) full.setAttribute('aria-pressed', isFull() ? 'true' : 'false');

    paintPeople();
  }

  const isFull = () =>
    !!(document.fullscreenElement && root && document.fullscreenElement === root.querySelector('.wl-host'));

  /* Was gerade vorne läuft, in einem Satz. Er geht als `note` in den Rahmen
     und steht dort in der Kopfzeile hinter dem kleinen „i" — nicht mehr als
     Kasten unten links über der Karte, wo er genau auf dem Abspielknopf lag.

     Er meldet sich, wenn das, was vorne läuft, nicht die eigene Welt der
     Lehrkraft ist: beim Zusehen, nach einer Übernahme und im freien Modus.
     Der freie Modus MUSS auffallen — sonst schaltet jemand die Phase um und
     wundert sich, dass die Klasse folgt (oder eben nicht). Im Vollbild steht
     er immer, denn dort trägt er auch den Ausgang: Esc kennt nicht jede
     Fernbedienung. */
  function noteOf(watch) {
    let text = '';
    let kind = '';
    let stop = false;

    if (watch) {
      text = 'Ansicht von ' + watch.who + ' — folgt live';
      kind = 'watch';
      stop = true;
    } else if (takeover) {
      text = 'Welt von ' + takeover + ' — Sie ziehen selbst';
      kind = 'own';
      stop = true;
    } else if (free) {
      text = 'Freier Modus — die Klasse sieht davon nichts.';
      kind = 'free';
      stop = true;
    } else if (isFull()) {
      const i = worlds.map(String).indexOf(String(deskSeed));
      text = (i >= 0 ? ['Welt I', 'Welt II', 'Welt III'][i] : 'Welt') + ' · ' + (deskSeed || '…');
    }

    return { text: text, kind: kind, stop: stop, exit: isFull() };
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

      const on = r.id === watchEid;
      return `<button type="button" class="wl-person" data-eid="${esc(r.id)}"
                      ${r.cur ? '' : 'disabled'} aria-pressed="${on ? 'true' : 'false'}"
                      title="${esc(r.who)}s aktuelle Sicht auf die Leinwand">
        <span class="wl-who">${esc(r.who)}</span>
        <span class="wl-worlds">${worldsHTML || '<span class="wl-none">noch nichts</span>'}</span>
        <span class="wl-go" aria-hidden="true">${on ? '👁' : '▸'}</span>
      </button>`;
    }).join('');
  }

  async function onDeskClick(e) {
    const btn = e.target.closest ? e.target.closest('button, a') : null;
    if (!btn) return;

    /* Ein Schritt der Stunde. Vier Knöpfe für drei Phasen: „3a" und „3b"
       schalten die Auflösung ein UND heben ihren Schleier.

       Erst der Schleier, dann die Phase. Andersherum stünde die Klasse für
       einen Augenblick in Phase 3 mit noch nicht gesetztem Schleier — sichtbar
       wäre das nur als Zucken, aber genau an dieser Stelle sieht ein Zucken
       aus wie eine versehentliche Auflösung.

       Gesendet werden immer BEIDE Schalter: skill_room_set_state ersetzt
       `data` als Ganzes (coalesce, kein Merge) — wer nur einen schickt,
       löscht den anderen. */
    if (btn.dataset.step) {
      const step = STEPS.find(s => s.id === btn.dataset.step);
      if (!step) return;
      const phase = phaseOf(view);
      const d = (view.state && view.state.data) || {};
      let data = null;

      if (step.veil) {
        data = { rw: !!d.rw, ra: !!d.ra };
        // In der Auflösung ist der Knopf ein Schalter, von außerhalb ist er
        // der Weg hinein — und dann ist „aufdecken" gemeint, nicht „umschalten".
        data[step.veil] = phase === step.phase ? !data[step.veil] : true;
      } else if (d.rw || d.ra) {
        // Zurück in Phase 1 oder 2: die Schleier fallen wieder. Sonst wäre die
        // nächste Auflösung schon aufgelöst, bevor jemand sie eröffnet hat.
        data = { rw: false, ra: false };
      }

      if (data) {
        const res = await ctx.actions.setData(data);
        if (!res.ok) { ctx.toast(ctx.errText(res.error)); return; }
      }
      if (phase !== step.phase) {
        const res = await ctx.actions.setPhase(step.phase);
        if (!res.ok) { ctx.toast(ctx.errText(res.error)); return; }
      }
      ctx.refresh();
      return;
    }

    if (btn.dataset.eid) {
      /* Jemandem zusehen. Der Tipp merkt sich die Beitrags-ID, den Rest macht
         push() — bei jedem Poll aufs Neue, damit die Leinwand mitgeht, wenn
         das Kind die Welt wechselt oder eine Gruppe zieht. Ein zweiter Tipp
         auf dieselbe Zeile hört wieder auf.

         Gemerkt wird die ID und nicht der Name: zwei Tablets ohne Namen
         heißen beide „User 3", sobald eines den Raum verlassen und ein neues
         denselben Platz bekommen hat. */
      watchEid = (watchEid === btn.dataset.eid) ? null : btn.dataset.eid;
      if (watchEid) free = false;
      takeover = null;
      lastCmd = '';
      push();
      paintDesk();
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
      if (free) { watchEid = null; takeover = null; }   // eins von beidem, siehe pick()
      lastCmd = '';
      push();
      paintDesk();
      return;
    }

    if (btn.id === 'wlFull') { toggleFull(); return; }
  }

  /* Vollbild: nur noch die Karte. Für den Beamer ist das der Normalfall —
     Kopfzeile, Werkzeugleiste und Seitenfuß sind dort nichts als Wand, die
     keine Karte zeigt. Das Pult fährt hoch und bleibt an einem Fingerbreit
     greifbar (tool.css), denn die Phase weiterzuschalten ist genau das, was
     auf der Leinwand ansteht.
     Genommen wird der ganze Kasten und nicht der Rahmen selbst: das Pult
     gehört uns und läge sonst außerhalb des Bildes. */
  function toggleFull() {
    const host = root && root.querySelector('.wl-host');
    if (!host) return;
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (host.requestFullscreen) {
      // Abgelehnt wird das nur ohne Geste — hier kommt es aus einem Klick.
      host.requestFullscreen().catch(() => ctx && ctx.toast('Vollbild geht auf diesem Gerät nicht.'));
    } else if (ctx) {
      ctx.toast('Vollbild geht auf diesem Gerät nicht.');
    }
  }

  function wireDesk() {
    const desk = $('wlDesk');
    if (desk) desk.addEventListener('click', onDeskClick);
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
      watchEid = null;
      takeover = null;
      sentGroups = '';
      rebase = false;
      store = Object.create(null);
      touched = Object.create(null);
      seed = null;

      const pres = ctx.role === 'presenter';
      root.innerHTML =
        '<div class="wl-host">'
        + (pres ? deskHTML() : '')
        + '<div class="wl-stage">'
        +   '<iframe class="wl-frame" src="tools/wildclusters/index.html' + V + '" '
        +           'title="Wild Clusters" loading="eager"></iframe>'
        + '</div>'
        + '</div>';

      frame = root.querySelector('.wl-frame');
      if (pres) {
        wireDesk();
        // Esc verlässt das Vollbild an jedem Knopf vorbei — der Knopf und der
        // Streifen im Rahmen müssen das trotzdem mitbekommen. Der Streifen
        // trägt den Ausgang, also muss er kommen und gehen wie das Vollbild.
        onFs = () => { paintDesk(); push(); fit(); };
        document.addEventListener('fullscreenchange', onFs);
      }

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
      // Erst raus aus dem Vollbild, dann den Rest abräumen: ein Vollbild ohne
      // Inhalt ist ein schwarzer Bildschirm, den niemand mehr wegbekommt.
      if (isFull() && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) { /* egal */ } }
      if (onMsg) window.removeEventListener('message', onMsg);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onFs) document.removeEventListener('fullscreenchange', onFs);
      onMsg = null;
      onResize = null;
      onFs = null;
      document.body.classList.remove('tool-fill');
      frame = null;
      root = null;
      ctx = null;
      view = null;
      bridgeReady = false;
    }
  });
})();
