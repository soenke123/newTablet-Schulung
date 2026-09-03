/**
 * Die Bruecke nach draussen - wenn Wild Clusters in einem MPSkills-Raum
 * steckt.
 *
 * Dort laeuft es in einem <iframe>: die Seite drumherum (MPSkills, Rolle
 * Schueler oder Beamer) sagt, welche Welt und welche Phase gerade gelten, und
 * bekommt zurueck, was hier passiert. Diese Datei ist die einzige, die davon
 * weiss - der Rest der Anwendung kennt nur seine eigene, oeffentliche
 * Schnittstelle (WILDCLUSTERS).
 *
 * ── Sie schlaeft, wenn niemand da ist ─────────────────────────────────────
 * Ohne Rahmen (Doppelklick auf index.html) ist window.parent === window, und
 * dann passiert hier gar nichts: kein Listener, kein DOM, keine Sperre. Das
 * ist die ganze Absicherung dagegen, dass der Raum die Anwendung veraendert -
 * Wild Clusters bleibt eine Datei, die man auch allein oeffnen kann.
 *
 * ── Wer entscheidet was ───────────────────────────────────────────────────
 * Die Bruecke entscheidet NICHTS. Ein Tipp auf eine der drei Welten wird nach
 * oben gemeldet ('world-pick') und nicht selbst ausgefuehrt - erst die Seite
 * weiss, ob es zu dieser Welt schon eine gespeicherte Gruppierung gibt, und
 * die muss mit demselben Befehl hereinkommen, mit dem die Welt gebaut wird.
 * Sonst baute die Karte zuerst leer auf und die Arbeit von vorhin fiele
 * sichtbar hinterher hinein.
 *
 * ── Was gesperrt wird, wird zweimal gesperrt ──────────────────────────────
 * Ein Knopf, den man wegnimmt, ist noch keine Sperre: dieselbe Wirkung haengt
 * an einer Taste (V, S, N) und beim "Naechster Tag"-Knopf an einer Bedingung,
 * die der Abspieler bei JEDEM Bild neu auswertet. Deshalb: Knopf disabled,
 * Taste in der Capture-Phase geschluckt, und der Knopf, der sich selbst
 * wieder einblendet, per CSS-Klasse am body aus dem Weg geraeumt.
 */
(function (global) {
  'use strict';

  // Kein Rahmen, kein Gegenueber: schlafen.
  if (!global.parent || global.parent === global) return;

  /* Sofort, noch vor DOMContentLoaded: app.js baut ohne dieses Flag beim Start
     seine eigene Welt - und die waere im Raum immer die falsche. Zehn Tage
     Tierleben zu rechnen, um sie eine Zehntelsekunde spaeter wegzuwerfen,
     kostet auf einem Tablet mehrere Sekunden, in denen nichts geht.
     Diese Datei steht deshalb NACH app.js in index.html: dessen ready() haengt
     sich nur an, ausgefuehrt wird es erst, wenn das Dokument steht. */
  global.WC_EMBEDDED = true;

  var ORIGIN = global.location.origin;

  var WC = null;              // WILDCLUSTERS, sobald es steht
  var ready = false;
  var busy = false;           // zwischen "baue Welt" und "Welt steht"
  var pendingGroups = null;   // was nach dem Aufbau aufgelegt wird
  var pendingPhase = null;
  /* undefined heisst "war nicht gemeint", null heisst "gib die Sicht frei" -
     und das ist kein Feinschliff: die Aufloesungsphase schickt genau die null,
     und mit ihr faellt die Sperre aus Phase 1 und 2. Waeren beide Faelle
     dasselbe, bliebe der Knopf nach einem Weltwechsel in Phase 3 tot. */
  var pendingMasked;
  var lastSeed = null;
  var maskedLock = null;      // true/false = erzwungen, null = frei
  var worldsBox = null;
  var shownWorlds = '';

  /* ─── nach oben ─────────────────────────────────────────────────────── */

  function send(event, data) {
    var msg = { type: 'wc:event', event: event };
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) msg[k] = data[k];
    try { global.parent.postMessage(msg, ORIGIN); } catch (e) { /* zu */ }
  }

  /* ─── von oben ──────────────────────────────────────────────────────── */

  // Befehle, die vor dem Aufbau eintreffen. Die Seite laedt den Rahmen und
  // schickt sofort ihren Stand; die Anwendung rechnet zu dem Zeitpunkt noch an
  // ihrer ersten Welt. Wegwerfen waere der Fall, in dem ein Tablet in Phase 1
  // stehenbleibt, obwohl die Klasse schon in Phase 2 ist.
  var queue = [];

  global.addEventListener('message', function (e) {
    // Nur vom eigenen Rahmen und aus demselben Ursprung. Die Herkunftspruefung
    // ist die billigste Sicherung, die es gibt, und die einzige, die auch
    // dann noch gilt, wenn diese Seite eines Tages woanders eingebettet wird.
    if (e.source !== global.parent || e.origin !== ORIGIN) return;
    var cmd = e.data;
    if (!cmd || cmd.type !== 'wc:cmd') return;
    if (!ready) { queue.push(cmd); return; }
    apply(cmd);
  });

  function apply(cmd) {
    if (cmd.locks) applyLocks(cmd.locks);
    if (cmd.worlds) renderWorlds(cmd.worlds, cmd.seed);

    // Eine Gruppierung kommt nur mit, wenn sie auch aufgelegt werden soll -
    // die Seite schickt sie beim Weltwechsel und wenn am Beamer eine fremde
    // Arbeit gezeigt wird, sonst nie. Waere sie in jedem Takt dabei, loeschte
    // der Poller alle drei Sekunden, was gerade gezogen wurde.
    if (cmd.groups) pendingGroups = cmd.groups;

    var wantSeed = cmd.seed != null ? String(cmd.seed) : null;
    if (wantSeed && wantSeed !== String(lastSeed)) {
      pendingPhase = cmd.phase != null ? cmd.phase : null;
      pendingMasked = cmd.masked;
      busy = true;
      WC.rebuild(wantSeed);
      return;   // der Rest passiert, wenn die Welt steht
    }

    if (cmd.masked !== undefined) enforceMasked(cmd.masked);
    if (cmd.phase != null && cmd.phase !== WC.phase) WC.setPhase(cmd.phase);
    if (pendingGroups) { WC.applyGroups(pendingGroups); pendingGroups = null; }
  }

  /* ─── Die drei Welten in der Kopfzeile ──────────────────────────────────
     Sie ersetzen Seed-Feld und "Neue Welt": in einem Raum soll niemand in
     seiner eigenen Welt landen, ueber die dann keiner mitreden kann. Der Seed
     steht trotzdem lesbar daneben - er ist die Adresse, unter der die Lehrkraft
     genau diese Welt vorne aufmachen kann.                                  */

  function renderWorlds(list, current) {
    var key = list.join(',') + '|' + current;
    if (key === shownWorlds) return;    // nichts Neues, nichts anfassen
    shownWorlds = key;

    var controls = document.querySelector('.controls');
    if (!controls) return;

    if (!worldsBox) {
      worldsBox = document.createElement('div');
      worldsBox.className = 'worlds';
      worldsBox.id = 'wcWorlds';
      worldsBox.setAttribute('role', 'group');
      worldsBox.setAttribute('aria-label', 'Welt');
      controls.insertBefore(worldsBox, controls.firstChild);
      worldsBox.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button[data-seed]') : null;
        if (!btn) return;
        send('world-pick', { seed: btn.getAttribute('data-seed') });
      });
    }

    var ROMAN = ['I', 'II', 'III', 'IV', 'V'];
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var on = String(list[i]) === String(current);
      html += '<button type="button" class="btn btn-toggle world-btn" data-seed="' + list[i] + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + (ROMAN[i] || (i + 1)) + '</button>';
    }
    html += '<span class="worlds-seed">Welt ' + (current != null ? current : '…') + '</span>';
    worldsBox.innerHTML = html;
  }

  /* ─── Sperren ──────────────────────────────────────────────────────── */

  function applyLocks(locks) {
    var body = document.body;
    // Der Knopf in die naechste Phase blendet sich bei jedem Bild selbst wieder
    // ein (updateAdvanceBtn haengt an der Zeit). Gegen einen Schreiber, der
    // zwanzigmal in der Sekunde laeuft, hilft nur eine Regel, die staerker ist
    // als sein Attribut - deshalb eine Klasse am body und display:none im CSS.
    body.classList.toggle('wc-no-advance', !!locks.advance);
    body.classList.toggle('wc-no-brand', !!locks.brand);
    body.classList.toggle('wc-no-seed', !!locks.seed);

    var seedInput = document.getElementById('seedInput');
    if (seedInput) seedInput.disabled = !!locks.seed;
    var generateBtn = document.getElementById('generateBtn');
    if (generateBtn) generateBtn.disabled = !!locks.seed;
  }

  /**
   * Verdeckte Sicht erzwingen (true), offene erzwingen (false) oder freigeben
   * (null). Erzwungen heisst: der Knopf ist tot UND die Taste V wirkt nicht -
   * sonst ist die Sperre nur eine Empfehlung, und in Phase 1 stuende die halbe
   * Klasse vor der Landschaft, die sie gerade nicht sehen soll.
   */
  function enforceMasked(flag) {
    maskedLock = (flag === true || flag === false) ? flag : null;
    var btn = document.getElementById('viewModeBtn');
    if (btn) btn.disabled = maskedLock !== null;
    if (maskedLock !== null && WC.masked !== maskedLock) WC.setMaskedView(maskedLock);
  }

  // Die Taste in der Capture-Phase abfangen: der Zuhoerer der Anwendung haengt
  // am window, ein spaeter angemeldeter zweiter kaeme dort nie vor ihm dran.
  global.addEventListener('keydown', function (e) {
    if (maskedLock === null || !e.key) return;
    if (e.key.toLowerCase() === 'v') { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ─── Anschluss ────────────────────────────────────────────────────── */

  function attach() {
    WC = global.WILDCLUSTERS;
    if (!WC) { global.setTimeout(attach, 30); return; }

    WC.setWorldHook(function (seed) {
      lastSeed = seed;
      // Erst der Stand, den der Befehl verlangt hat, dann die Meldung. Ein
      // Zuhoerer oben soll nie eine halb umgestellte Welt sehen.
      if (pendingMasked !== undefined) { enforceMasked(pendingMasked); pendingMasked = undefined; }
      if (pendingPhase != null) { WC.setPhase(pendingPhase); pendingPhase = null; }
      if (pendingGroups) { WC.applyGroups(pendingGroups); pendingGroups = null; }
      busy = false;
      if (worldsBox) renderWorlds(worldsList(), seed);
      send('world', { seed: seed });
      send('clusters', { seed: seed, phase: WC.phase, groups: WC.signals.groups() });
    });

    WC.setClusterHook(function (groups) {
      // Waehrend eines Aufbaus meldet die Signalliste zwischendurch eine leere
      // Gruppierung (sie baut sich fuer die neue Welt neu auf). Nach oben
      // durchgelassen sieht das aus wie "die Person hat alles aufgeloest" -
      // und der naechste Speichervorgang loeschte ihre Arbeit.
      if (busy || !lastSeed) return;
      send('clusters', { seed: lastSeed, phase: WC.phase, groups: groups });
    });

    ready = true;
    send('ready', {});
    while (queue.length) apply(queue.shift());
  }

  // Die Liste, die gerade in der Kopfzeile steht - fuer den Fall, dass nur der
  // Seed sich geaendert hat und niemand die Welten noch einmal mitgeschickt hat.
  function worldsList() {
    var out = [];
    var btns = worldsBox ? worldsBox.querySelectorAll('button[data-seed]') : [];
    for (var i = 0; i < btns.length; i++) out.push(btns[i].getAttribute('data-seed'));
    return out;
  }

  attach();
})(typeof window !== 'undefined' ? window : globalThis);
