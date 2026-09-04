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
   ready · world · clusters), dazu drei Bitten: world-pick, note und
   full. Mehr ist es nicht.

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
   Arbeit jedes Mal wieder vor. Für die Lehrkraft gilt das genauso:
   sie hat drei eigene Welten (Platz 0), und was sie darin aufbaut,
   steht nach einem Blick in Welt II noch da. Nur gespeichert wird
   es nicht — am Pult bleibt es im Gerät.

   Bewahrt werden aber NUR diese drei (`remember`). Ein selbst
   eingetippter Seed — auf dem Tablet erst, wenn die Auflösung durch
   ist (`freeSeedAllowed`), am Pult schon in Phase 3 und im freien
   Modus — lässt sich genauso gruppieren, aber die Arbeit
   gilt nur, solange er aufliegt. Er ist ein Ausflug und keine
   vierte Welt; hätte jeder abgetippte Seed Anspruch auf einen
   Platz, ständen die drei, um die es geht, zwischen beliebig
   vielen davon.

   ── Die Einführung ────────────────────────────────────────────
   Einmal beim Betreten, nicht je Welt: erst die Lage („x Tiere
   tragen einen Sender, welche Art das ist, weiß niemand mehr"),
   dann vier Karten, die die vier Bereiche der Oberfläche zeigen.
   Sie gehört der Klasse — am Pult erklärt die Lehrkraft.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Der Stempel gehört an die Rahmen-URL und nicht nur an die Dateien
     darin: index.html zöge sich sonst aus dem Cache, und ein Gerät,
     das Wild Clusters schon einmal geladen hat, bekäme eine alte Seite
     mit neuen Skripten — genau der Fall, in dem ein <script>-Tag fehlt,
     den niemand vermisst, bis die Brücke schweigt. Dieselbe Überlegung
     wie beim ?v= in lib/tool.js. */
  const V = '?v=20260904f';

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
         hint: 'die Lehrkraft deckt auf · eigene Welten, sobald alles offen ist' }
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

  /* Bewahrt werden die drei Welten des Raums und sonst nichts (siehe
     `remember`). Mehr Plätze braucht der Bestand deshalb nicht — und
     nebenbei räumt die Grenze auf, wenn jemand den Sitzplatz wechselt und
     damit drei neue Welten bekommt: die alten Schlüssel fallen beim
     nächsten Speichern hinten heraus. Der payload ist auf 4 KB begrenzt
     (skill_check_payload). */
  const MAX_WORLDS = 3;

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
  /* Die Einführung: -1 ist zu, 0..n die Karte, die gerade aufliegt. */
  let introStep = -1;
  /* Wie viele Tiere in Phase 1 einen Sender tragen. Kommt mit dem
     `world`-Ereignis herein — von außen ist der Bestand nicht zu sehen. */
  let agentCount = 0;

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

  /**
   * Darf hier ein eigener Seed ins Feld?
   *
   * Auf einem Tablet **erst, wenn die Auflösung durch ist** — beide Schalter
   * der Lehrkraft oben, Landschaft *und* Tiere sichtbar. Vorher steht der
   * Aufgabe nichts im Weg als die Neugier: „Neue Welt" ist einen Fingerbreit
   * von den drei Welt-Knöpfen entfernt, und wer ihn in Phase 3a drückt, hat
   * seine Gruppierung nicht mehr vor sich, sondern eine fremde leere Welt.
   * Der Ausflug in einen selbst gewürfelten Seed ist das, was NACH der
   * Auflösung Spaß macht, und vorher nur ein Weg, sich die Stunde
   * wegzuklicken.
   *
   * Am Pult gilt das nicht: dort ist der eigene Seed das Werkzeug zum
   * Vorführen, und die Lehrkraft entscheidet ohnehin, wann was offen ist.
   */
  function freeSeedAllowed(v) {
    if (!PHASES[phaseOf(v)].freeSeed) return false;
    if (isPresenter()) return true;
    const d = (v && v.state && v.state.data) || {};
    return !!(d.rw && d.ra);
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

  /**
   * Eine Gruppierung in den Bestand — wenn sie zu einer Welt gehört, die
   * bewahrt wird.
   *
   * **Bewahrt werden genau die drei Welten des Raums.** Sie sind die
   * Arbeitsgrundlage der Stunde: wer zwischen ihnen hin und her wechselt,
   * findet seine Arbeit jedes Mal wieder vor, auf jedem Gerät und nach
   * jedem Neuladen.
   *
   * **Ein selbst eingetippter Seed gehört nicht dazu** (Auflösungsphase,
   * `freeSeed`, und am Pult der freie Modus). Gruppieren lässt er sich —
   * die Karte kann alles, was sie sonst auch kann —, aber die Arbeit gilt
   * nur, solange die Welt aufliegt. Sonst hätte jeder abgetippte Seed
   * Anspruch auf einen Platz im Beitrag, und die drei, um die es geht,
   * ständen zwischen beliebig vielen Ausflügen.
   *
   * Und dieselbe Regel gilt am Pult: die Lehrkraft hat ihre eigenen drei
   * Welten (Platz 0), und in denen bleibt stehen, was sie gebaut hat. Was
   * sie in der Welt eines Kindes zieht, gehört dem Notizblock.
   *
   * @returns true, wenn die Gruppierung aufgenommen wurde.
   */
  function remember(key, groups) {
    if (worlds.map(String).indexOf(String(key)) < 0) return false;
    store[String(key)] = groups || [];
    touched[String(key)] = Date.now();
    return true;
  }

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

  /**
   * Der Rahmen hat eine Welt gebaut, ohne dass wir es waren — und weiß nichts
   * von der Arbeit, die zu ihr gehört.
   *
   * Das Seed-Feld und „Neue Welt" liegen IM Rahmen (siehe `freeSeedAllowed`,
   * am Pult zusätzlich im freien Modus). Wer eine seiner drei Welten so wieder
   * aufmacht, hat nicht auf einen der drei Knöpfe getippt: es ging kein Befehl
   * von hier hinein, also auch keine Gruppierung — und der Bericht, der gleich
   * darauf kommt, meldet eine leere Welt. Ohne diesen Riegel schriebe genau
   * diese Leere die Arbeit im Bestand tot (`remember`), und zwar endgültig:
   * auf dem Gerät, auf dem Server und in jeder Welt, die man danach noch
   * aufmacht.
   *
   * Auflegen statt überschreiben also. Der Rahmen meldet das nicht zurück
   * (`applying` in bridge.js hält seinen Bericht an), und das ist richtig so —
   * es ist ja unser eigener Stand, der da hineingeht.
   *
   * @returns true, wenn etwas aufgelegt wurde (dann ist der Bericht erledigt).
   */
  function restore(m) {
    const kept = store[String(m.seed)];
    if (!kept || !kept.length) return false;
    // Kam die Welt doch über einen Befehl von hier, liegt die Arbeit längst
    // drauf und der Bericht sagt genau das. Dann gibt es nichts zu tun.
    if (groupsKey(kept) === groupsKey(m.groups)) return false;
    sentGroups = groupsKey(kept);
    post({ seed: Number(m.seed), groups: kept });
    return true;
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
        seed: free ? false : !freeSeedAllowed(view),
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
      note: isPresenter() ? noteOf(watch) : null,
      /* Ob das Vollbild an ist. Der Rahmen kann es nicht selbst sehen — das
         Vollbild-Element ist der Kasten hier draußen, in seinem eigenen
         Dokument steht nichts davon. Ohne diese Angabe könnte sein Knopf den
         Zustand nicht benennen, und wer mit Esc herausgeht, hinterließe einen
         Knopf, der weiter „Vollbild beenden" sagt. */
      full: isFull(),
      /* Das Fragezeichen in derselben Zeile: der Weg zurück in die
         Einführung. Es gibt ihn genau dort, wo es die Einführung gibt — am
         Pult erklärt die Lehrkraft, und im Schaufenster gibt es niemanden,
         dem etwas zu erklären wäre. */
      help: !isPresenter() && !(ctx && ctx.preview)
    };
    /* Eine LEERE Gruppierung wird nicht mitgeschickt, und das ist kein
       Sparen: ein Weltwechsel baut die Welt ohnehin neu auf, und dabei
       liegt nichts. Ein mitgeschicktes `[]` löschte stattdessen etwas —
       in Phase 2 schiebt die Anwendung beim Aufbau die Nachzügler von
       selbst zu einem Haufen zusammen, und `applyGroups([])` räumte
       genau den wieder weg. Beim Zusehen ist das anders: dort IST die
       leere Liste der Stand des Kindes und gehört aufgelegt. */
    if (watch) cmd.groups = watch.groups;
    else if (wechsel) {
      const kept = store[String(want)];
      if (kept && kept.length) cmd.groups = kept;
    }
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

    /* Der Vollbild-Knopf ganz rechts in der Kopfzeile des Rahmens — auf jedem
       Gerät, nicht nur am Pult. Er steckt dort, weil dort die Zeile ist,
       entscheidet aber nichts: das Vollbild nimmt den ganzen Kasten (Pult UND
       Rahmen), und den kennt nur diese Seite. */
    if (m.event === 'full') { toggleFull(); return; }

    /* Das Fragezeichen daneben. Es kennt keine Phase: die Lage steht in Phase 2
       genauso wie in Phase 1, und ein Knopf, der je nach Abschnitt der Stunde
       nichts tut, sieht aus wie ein kaputter. */
    if (m.event === 'help') { if ($('wlIntro')) openIntro(); return; }

    /* Der Knopf im Streifen oben rechts. Er steckt ebenfalls im Rahmen und
       meldet nur — was „aufhören" bedeutet, weiß nur diese Seite. */
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
      }
      return;
    }

    if (m.event === 'world') {
      frameSeed = Number(m.seed);
      // Der Bestand der ersten Phase. Er ändert sich über alle drei Welten
      // hinweg kaum (36–40), aber „40 Tiere" in einer Welt mit 37 wäre eine
      // Zahl, die ein Kind nachzählen kann.
      if (m.n) agentCount = Number(m.n);
      // Gleich darauf kommt sein Bericht über die neue Welt — der ist der neue
      // Vergleichsmaßstab und nicht die Arbeit von jemandem.
      rebase = true;
      if (isPresenter()) { deskSeed = frameSeed; paintDesk(); }
      else { seed = frameSeed; touched[String(seed)] = Date.now(); saveLocal(); maybeIntro(); }
      return;
    }

    if (m.event === 'clusters') {
      /* Der Bericht direkt nach einem Aufbau. Er ist keine Handlung, aber sehr
         wohl ein Stand — und der kann zweierlei sein: das, was die Anwendung
         beim Aufbau selbst gebildet hat (in Phase 2 der Haufen der
         Nachzügler), oder eine leere Welt, weil der Rahmen sie ohne uns gebaut
         hat. Im zweiten Fall liegt die Arbeit hier und gehört wieder
         aufgelegt, nicht überschrieben (siehe `restore`). */
      const erster = rebase;
      rebase = false;
      // Beim Zusehen nicht: was dort steht, ist die Arbeit des Kindes, und
      // unser Bestand hat in seiner Welt nichts zu suchen.
      if (erster && !watchEid && restore(m)) return;

      /* Am Beamer ist die Karte ein Notizblock — aber einer, der zwischen
         zwei Welten nicht verschwindet. Auch die Lehrkraft hat drei eigene
         Welten (Platz 0), und wer darin etwas aufgebaut hat, um es zu
         zeigen, will es nach einem Blick in Welt II wiederfinden. Bewahrt
         wird das nur hier im Gerät: gespeichert wird am Pult nichts (save()
         und saveLocal() bleiben der Klasse vorbehalten), und was `remember`
         aufnimmt, sind ohnehin nur die eigenen drei. */
      if (isPresenter()) {
        if (erster) {
          sentGroups = groupsKey(m.groups);
          if (!watchEid) remember(m.seed, m.groups);
          return;
        }
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
        /* Beim Zusehen meldet der Rahmen nur zurück, was von uns hereinging —
           das ist die Arbeit des Kindes und gehört ihm. Nach einer Übernahme
           steht `watchEid` schon auf null, und ab da zählt es wieder. */
        if (!watchEid) remember(m.seed, m.groups);
        return;
      }
      if (ctx && ctx.preview) return;
      // Ein selbst eingetippter Seed wird nicht bewahrt - dann gibt es auch
      // nichts zu speichern.
      if (!remember(m.seed, m.groups)) return;
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
     die vier Schritte, rechts die drei Werkzeuge (Stand der Klasse · freier
     Modus · Arbeitsblatt).

     Das Vollbild steht nicht mehr dabei, sondern eine Zeile tiefer und ganz
     rechts — in der Kopfzeile des Rahmens neben den drei Welten, und dort für
     jeden. Zwei Gründe: im Vollbild fährt genau dieses Pult nach oben weg,
     der Ausgang lag also im Weggefahrenen; und ein Kind, das eine Karte
     ansieht, will sie genauso groß haben wie die Leinwand vorne.

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
          <button type="button" class="wl-btn wl-ghost" id="wlSheet">Arbeitsblatt</button>
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

    const free_ = $('wlFree');
    if (free_) free_.setAttribute('aria-pressed', free ? 'true' : 'false');

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
     wundert sich, dass die Klasse folgt (oder eben nicht).

     Sonst schweigt er. Er trug früher auch den Ausgang aus dem Vollbild und
     dazu die laufende Welt; beides steht jetzt in derselben Zeile ohnehin da
     — der Vollbild-Knopf ganz rechts, die Welt in den drei Knöpfen daneben. */
  function noteOf(watch) {
    if (watch) {
      return { text: 'Ansicht von ' + watch.who + ' — folgt live', kind: 'watch', stop: true };
    }
    if (takeover) {
      return { text: 'Welt von ' + takeover + ' — Sie ziehen selbst', kind: 'own', stop: true };
    }
    if (free) {
      return { text: 'Freier Modus — die Klasse sieht davon nichts.', kind: 'free', stop: true };
    }
    return { text: '', kind: '', stop: false };
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

    /* Das Arbeitsblatt. Der Knopf steht schon, die Adresse noch nicht: sie
       kommt aus `limits.worksheet_url` und wird nachgereicht, sobald das
       Blatt unter Dokumente/ liegt (siehe Migration 0129). Bis dahin sagt er
       das auch — ein Knopf, der auf ein Tippen hin nichts tut, sieht aus wie
       ein kaputter, und das ausgerechnet vor der Klasse. */
    if (btn.id === 'wlSheet') {
      const url = view && view.limits && view.limits.worksheet_url;
      if (url) window.open(url, '_blank', 'noopener');
      else ctx.toast('Das Arbeitsblatt kommt noch.');
      return;
    }
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
     Die Einführung (nur Klasse, nur Phase 1)
     ══════════════════════════════════════════════════════════
     Fünf Karten: erst die Lage, dann die vier Bereiche der
     Oberfläche. Sie kommt EINMAL beim Betreten und nicht je Welt —
     wer zwischen Welt I und II wechselt, wechselt die Aufgabe nicht.

     Sie liegt IM Kasten (`.wl-host`) und nicht über der Seite: das
     Vollbild nimmt genau diesen Kasten, und ein `position: fixed`
     außerhalb davon wäre darin unsichtbar. Ein Kind, das die Karte
     groß gemacht hat, bekäme dann eine Einführung, die es nicht
     sieht, und einen Rahmen, der auf nichts mehr reagiert.

     Am Pult gibt es sie nicht: dort erklärt die Lehrkraft, und ihre
     Ansicht ist die Leinwand. Im Schaufenster (`ctx.preview`)
     ebenfalls nicht — dort soll man das Werkzeug sehen und nicht
     einen Kasten davor.                                          */

  const introKey = () => roomKey() + ':intro1';

  function introSeen() {
    try { return sessionStorage.getItem(introKey()) === '1'; }
    catch (e) { return false; }   /* gesperrter Speicher: dann eben jedes Mal */
  }

  /* Die vier Bereiche als EIN Bild, viermal — jedes Mal ein anderer Teil
     hell. Vier verschiedene Zeichnungen zeigten vier Dinge; dieselbe
     Zeichnung mit wandernder Markierung zeigt, WO sie stehen, und das ist
     die Frage, die ein Kind vor dem ersten Griff hat. */
  function chrome(hi, extra) {
    const g = (id, body) => `<g class="wl-part${id === hi ? ' wl-on' : ''}">${body}</g>`;
    return `<svg class="wl-art" viewBox="0 0 320 180" aria-hidden="true">
      <rect class="wl-bg" x="4" y="4" width="312" height="172" rx="11"/>
      ${g('head', `
        <rect class="wl-box" x="12" y="12" width="296" height="26" rx="7"/>
        <rect class="wl-d" x="20" y="18" width="19" height="14" rx="4"/>
        <rect class="wl-d" x="43" y="18" width="19" height="14" rx="4"/>
        <rect class="wl-d" x="66" y="18" width="19" height="14" rx="4"/>
        <text class="wl-t" x="29.5" y="28.5">I</text>
        <text class="wl-t" x="52.5" y="28.5">II</text>
        <text class="wl-t" x="75.5" y="28.5">III</text>`)}
      ${g('stage', `
        <rect class="wl-box" x="12" y="44" width="222" height="94" rx="7"/>
        <path class="wl-tr" d="M34,122 C56,88 52,64 78,54 C104,44 116,72 108,96"/>
        <path class="wl-tr" d="M152,126 C178,118 192,90 180,68 C170,50 142,54 138,74"/>
        <circle class="wl-dot" cx="108" cy="96" r="4"/>
        <circle class="wl-dot" cx="138" cy="74" r="4"/>`)}
      ${g('play', `
        <rect class="wl-box" x="12" y="144" width="296" height="24" rx="7"/>
        <path class="wl-d" d="M22,150 l11,6 -11,6 z"/>
        <rect class="wl-d" x="44" y="154.5" width="176" height="3" rx="1.5"/>
        <rect class="wl-d" x="79" y="161" width="1.5" height="4" rx=".7"/>
        <rect class="wl-d" x="114" y="161" width="1.5" height="4" rx=".7"/>
        <rect class="wl-d" x="149" y="161" width="1.5" height="4" rx=".7"/>
        <rect class="wl-d" x="184" y="161" width="1.5" height="4" rx=".7"/>
        <circle class="wl-dot" cx="97" cy="156" r="5.5"/>
        <rect class="wl-d" x="238" y="150" width="20" height="12" rx="4"/>
        <rect class="wl-d" x="261" y="150" width="20" height="12" rx="4"/>
        <rect class="wl-d" x="284" y="150" width="20" height="12" rx="4"/>`)}
      ${g('side', `
        <rect class="wl-box" x="240" y="44" width="68" height="94" rx="7"/>
        <rect class="wl-d" x="248" y="52" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="267" y="52" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="286" y="52" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="248" y="71" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="267" y="71" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="286" y="71" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="248" y="118" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="267" y="118" width="15" height="15" rx="4"/>
        <rect class="wl-d" x="286" y="118" width="15" height="15" rx="4"/>
        ${extra || ''}`)}
    </svg>`;
  }

  /* Die eine Kachel, die gerade nach oben gezogen wird. „Zieh eine Kachel auf
     eine andere" ist der einzige Handgriff der ganzen Aufgabe, und ein Bild
     davon sagt ihn schneller als die Zeile darunter.

     Nach OBEN, weil das die Richtung ist, die es wirklich ist: die Cluster
     sammeln sich oben in der Liste, die freien Kacheln stehen darunter. Die
     Lücke zwischen den beiden Reihen im Bild ist genau diese Trennung. */
  const DRAG_EXTRA = `
    <rect class="wl-drag" x="250" y="88" width="15" height="15" rx="4"/>
    <path class="wl-arrowhead" d="M257.5,105 l-6,9 12,0 z"/>`;

  /* Die Lage. Nicht die Oberfläche, sondern die Frage: eine Nachtkarte
     mit drei Spuren, drei Nummern und keinem einzigen Tiernamen. */
  const NIGHT_ART = `<svg class="wl-art wl-art--night" viewBox="0 0 320 180" aria-hidden="true">
    <rect class="wl-night" x="4" y="4" width="312" height="172" rx="11"/>
    <text class="wl-qm" x="160" y="128">?</text>
    <path class="wl-s1" d="M38,148 C74,116 60,74 100,58 C134,45 148,80 132,106 C121,124 92,124 86,106"/>
    <path class="wl-s2" d="M208,152 C240,142 260,110 248,82 C238,56 202,60 198,86 C195,106 216,114 226,102"/>
    <path class="wl-s3" d="M118,152 C136,150 142,132 156,134 C168,136 168,146 162,148"/>
    <circle class="wl-p1" cx="86" cy="106" r="5"/>
    <circle class="wl-p2" cx="226" cy="102" r="5"/>
    <circle class="wl-p3" cx="162" cy="148" r="5"/>
    <text class="wl-num" x="86" y="94">07</text>
    <text class="wl-num" x="226" y="90">23</text>
    <text class="wl-num" x="162" y="136">11</text>
  </svg>`;

  function introCards() {
    // Ohne die Zahl geht es auch: sie kommt aus dem Rahmen, und ein Satz,
    // der auf sie wartet, wäre ein Kasten, der nie aufgeht.
    const tiere = agentCount > 0
      ? '<b>' + agentCount + ' Tiere</b>' : '<b>Die Tiere hier</b>';
    return [
      { kicker: 'Die Lage', title: 'Wer läuft da?', art: NIGHT_ART, html:
        `<ul class="wl-facts">
          <li>${tiere} tragen einen Sender. Welche Art zu welchem Sender gehört,
              weiß niemand mehr — die Liste ist weg.</li>
          <li>Die Sender haben <b>5 Tage</b> aufgezeichnet: jeden Weg, jede Pause,
              Tag und Nacht.</li>
          <li><b>Finde Regelmäßigkeiten.</b> Welche Tiere gehören zusammen? Und in
              was für einer Welt leben sie?</li>
          <li>Was du herausfindest, hältst du auf dem <b>Arbeitsblatt</b> fest.</li>
        </ul>` },
      /* „In jedem leben andere Tiere" stand hier zuerst, und das war falsch
         herum: es klang nach drei Biomen mit je eigenem Tierbestand. Es sind
         überall DIESELBEN Arten — anders sind nur die Landschaft und die
         einzelnen Tiere. Genau darauf beruht die Aufgabe, und wer das für
         drei getrennte Rätsel hält, fängt dreimal von vorne an. */
      { kicker: 'Oben', title: 'Drei Welten, dieselben Tiere', art: chrome('head'), html:
        `<p>Oben wechselst du zwischen <b>I</b>, <b>II</b> und <b>III</b>. Überall leben
         <b>dieselben Tierarten</b> — anders sind nur die Landschaft und die einzelnen
         Tiere darin.</p>
         <p><b>Arbeite in einer Welt.</b> Die anderen beiden sind zum Stöbern: dort
         siehst du dieselben Arten noch einmal, in einer anderen Gegend. Was du
         gruppiert hast, steht beim Zurückkommen noch da.</p>` },
      { kicker: 'In der Mitte', title: 'Die Karte', art: chrome('stage'), html:
        `<p>Hier laufen die Tiere, jedes mit seiner eigenen Spur. <b>Ziehen</b>
         verschiebt, <b>zwei Finger</b> zoomen. Tippst du ein Tier an, leuchtet
         seine Spur auf.</p>` },
      { kicker: 'Unten', title: 'Die fünf Tage', art: chrome('play'), html:
        `<p><b>▶</b> spielt die Aufzeichnung ab, <b>1× · 5× · 25×</b> ist das Tempo.
         Am Regler springst du zu jeder Stunde — die Striche sind die Tage.</p>` },
      { kicker: 'Rechts', title: 'Die Signale', art: chrome('side', DRAG_EXTRA), html:
        `<p>Ein Sender ist eine <b>Kachel mit Nummer</b>. <b>Zieh eine Kachel auf eine
         andere</b> — schon sind die beiden eine Gruppe. Nach unten herausziehen
         löst sie wieder.</p>
         <p class="wl-tip">Mit dem Finger: kurz gedrückt halten, dann geht es in
         jede Richtung.</p>` }
    ];
  }

  function introHTML() {
    return `
    <div class="wl-intro" id="wlIntro" hidden>
      <div class="wl-i-card" role="dialog" aria-modal="true" aria-labelledby="wlIntroTitle">
        <button type="button" class="wl-i-x" data-intro="close"
                aria-label="Einführung schließen">✕</button>
        <div class="wl-i-art"></div>
        <div class="wl-i-body">
          <p class="wl-i-kicker"></p>
          <h2 class="wl-i-title" id="wlIntroTitle"></h2>
          <div class="wl-i-text"></div>
        </div>
        <div class="wl-i-foot">
          <div class="wl-i-dots" aria-hidden="true"></div>
          <button type="button" class="wl-btn" data-intro="back" hidden>Zurück</button>
          <button type="button" class="wl-btn wl-i-go" data-intro="next">Weiter</button>
        </div>
      </div>
    </div>`;
  }

  function paintIntro() {
    const box = $('wlIntro');
    if (!box) return;
    box.hidden = introStep < 0;
    if (introStep < 0) return;

    const cards = introCards();
    const i = Math.min(introStep, cards.length - 1);
    const c = cards[i];
    const last = cards.length - 1;

    box.querySelector('.wl-i-art').innerHTML = c.art;
    // „Oben · 1 von 4": die Lage ist kein Schritt der Führung, sondern
    // die Aufgabe — sie bekommt deshalb keine Nummer.
    box.querySelector('.wl-i-kicker').textContent =
      i === 0 ? c.kicker : c.kicker + ' · ' + i + ' von ' + last;
    box.querySelector('.wl-i-title').textContent = c.title;
    box.querySelector('.wl-i-text').innerHTML = c.html;
    box.querySelector('.wl-i-dots').innerHTML = cards
      .map((_, k) => `<span class="wl-i-dot${k === i ? ' wl-on' : ''}"></span>`).join('');

    box.querySelector('[data-intro="back"]').hidden = i === 0;
    box.querySelector('[data-intro="next"]').textContent =
      i === last ? 'Los geht’s' : 'Weiter';
  }

  function openIntro() {
    introStep = 0;
    paintIntro();
    const go = $('wlIntro') && $('wlIntro').querySelector('.wl-i-go');
    // preventScroll: der Kasten steht am unteren Ende einer langen Seite,
    // und ein Sprung dorthin sähe aus, als wäre die Seite verrutscht.
    if (go) { try { go.focus({ preventScroll: true }); } catch (e) { go.focus(); } }
  }

  function closeIntro() {
    introStep = -1;
    try { sessionStorage.setItem(introKey(), '1'); } catch (e) { /* egal */ }
    paintIntro();
  }

  /**
   * Aufgemacht wird sie erst, wenn wirklich eine Welt dasteht (`frameSeed`).
   * Vorher rechnet der Rahmen mehrere Sekunden an zehn Tagen Tierleben — eine
   * Einführung über einer leeren Fläche erklärt eine Oberfläche, die es noch
   * nicht gibt, und die Zahl der Sender wäre auch noch nicht bekannt.
   */
  function maybeIntro() {
    if (!root || !view || introStep >= 0) return;
    if (isPresenter() || (ctx && ctx.preview)) return;
    if (phaseOf(view) !== 1) return;      // 2 und 3 bekommen ihre eigene
    if (frameSeed == null || introSeen()) return;
    openIntro();
  }

  function onIntroClick(e) {
    const btn = e.target.closest ? e.target.closest('button[data-intro]') : null;
    if (!btn) return;
    const what = btn.dataset.intro;
    if (what === 'close') { closeIntro(); return; }
    if (what === 'back') { introStep = Math.max(0, introStep - 1); paintIntro(); return; }
    if (introStep >= introCards().length - 1) { closeIntro(); return; }
    introStep++;
    paintIntro();
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
      introStep = -1;
      agentCount = 0;
      store = Object.create(null);
      touched = Object.create(null);
      seed = null;
      /* Auch die Weltliste, obwohl update() sie gleich wieder setzt: an ihr
         hängt seit `remember`, was bewahrt wird — und eine Liste aus dem
         vorigen Raum nähme die falschen drei auf. */
      worlds = [];

      const pres = ctx.role === 'presenter';
      root.innerHTML =
        '<div class="wl-host">'
        + (pres ? deskHTML() : '')
        + '<div class="wl-stage">'
        +   '<iframe class="wl-frame" src="tools/wildclusters/index.html' + V + '" '
        +           'title="Wild Clusters" loading="eager"></iframe>'
        + '</div>'
        /* Im Kasten und nicht über der Seite: das Vollbild nimmt genau
           diesen Kasten mit, ein `position: fixed` daneben wäre darin
           unsichtbar — und der Rahmen darunter unbedienbar. */
        + (pres ? '' : introHTML())
        + '</div>';

      frame = root.querySelector('.wl-frame');
      if (pres) wireDesk();
      else {
        const intro = $('wlIntro');
        if (intro) intro.addEventListener('click', onIntroClick);
      }
      /* Esc verlässt das Vollbild an jedem Knopf vorbei, und auf einem Tablet
         tut es die Wischgeste von oben. Der Knopf im Rahmen muss das trotzdem
         mitbekommen — er kann den Zustand nicht selbst sehen. Deshalb für
         jede Rolle: seit das Vollbild im Rahmen sitzt, hat auch die Klasse
         einen Weg hinein. */
      onFs = () => { paintDesk(); push(); fit(); };
      document.addEventListener('fullscreenchange', onFs);

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
      // Vor dem Einlesen: an der Weltliste hängt, was bewahrt wird.
      worlds = worldsOf(v);

      if (!restored) {
        // Erst das Gerät, dann der Server: was hier liegt, ist aus
        // dieser Sitzung (siehe absorb). Am Beamer gibt es beides nicht -
        // dort ist die Karte ein Notizblock und kein Arbeitsplatz.
        if (!isPresenter()) {
          loadLocal();
          const e = mine(v);
          if (e) { myEntry = e.id; absorb(e); }
        }
        /* Beides bringt mit, was irgendwann einmal aufgenommen wurde — aus
           einer früheren Fassung also auch einen selbst eingetippten Seed,
           oder die Welten eines anderen Sitzplatzes. Gestutzt wird deshalb
           beim Aufsetzen, und nicht erst beim Speichern (trimmed): sonst
           legte push() eine Arbeit auf, die es nicht mehr geben soll. */
        const eigene = worlds.map(String);
        for (const k of Object.keys(store)) {
          if (eigene.indexOf(k) < 0) { delete store[k]; delete touched[k]; }
        }
        restored = true;
      } else {
        const e = mine(v);
        if (e && !myEntry) myEntry = e.id;
      }

      /* Eine Welt außerhalb der eigenen drei ist nur so lange in Ordnung, wie
         ein eigener Seed überhaupt erlaubt ist. Nimmt die Lehrkraft einen
         Schleier zurück (aus 3b nach 3a oder in Phase 1/2), holt das die Klasse
         auch aus ihrem Ausflug zurück an die Arbeit — mit ihrer Gruppierung,
         denn der Wechsel geht über push() und der bringt sie mit. */
      if (!seed || (!freeSeedAllowed(v) && worlds.map(String).indexOf(String(seed)) < 0)) {
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
      maybeIntro();
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
