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
 *
 * Umgekehrt gibt es eine Sperre ganz OHNE Knopf: die Kontrollanzeige (D)
 * haengt nur an der Taste. Auf einem Tablet der Klasse nennt sie Arten und
 * Merkmalswerte - also die Loesung. Sie bleibt deshalb der Ansicht der
 * Lehrkraft vorbehalten, genau wie das kleine "i" in der Kopfzeile.
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
  /* Zwischen "ein Aufbau hat angefangen" und "die Welt steht". Gesetzt wird es
     an ZWEI Stellen, und die zweite ist die, die gefehlt hat: hier, wenn wir
     den Aufbau selbst anstossen - und im buildHook, wenn die Seite von sich
     aus baut ("Neue Welt", Seed-Feld, beide sitzen in ihr drin).
     Woran das hing: mitten im Aufbau meldet die Signalliste eine leere
     Gruppierung (setSimulation -> publishColors), und lastSeed zeigt zu diesem
     Zeitpunkt noch auf die Welt, die gerade noch dastand. Nach oben
     durchgelassen sah das aus wie "die Person hat in Welt I alles aufgeloest" -
     und der naechste Speichervorgang loeschte ihre Arbeit. Auf dem Geraet und
     auf dem Server. */
  var busy = false;
  /* Waehrend ein Befehl von oben ausgefuehrt wird. Was die Anwendung dabei an
     Gruppierung meldet, ist die Folge dieses Befehls und keine Handlung - und
     nach oben durchgelassen sieht es genau danach aus. Der Fall, an dem es
     auffiel: ein Wechsel in Phase 2 schiebt die Nachzuegler von selbst zu
     einem Haufen zusammen und meldet das, noch bevor die mitgeschickte
     Gruppierung aufgelegt ist. */
  var applying = false;
  var pendingGroups = null;   // was nach dem Aufbau aufgelegt wird
  var pendingPhase = null;
  /* undefined heisst "war nicht gemeint", null heisst "gib die Sicht frei" -
     und das ist kein Feinschliff: die Aufloesungsphase schickt genau die null,
     und mit ihr faellt die Sperre aus Phase 1 und 2. Waeren beide Faelle
     dasselbe, bliebe der Knopf nach einem Weltwechsel in Phase 3 tot. */
  var pendingMasked;
  var lastSeed = null;
  /* null = frei (der Knopf gehoert wieder dem Geraet), sonst {w:bool, a:bool}
     fuer Landschaft und Tiere getrennt. Getrennt, weil die Aufloesungsphase
     genau das braucht: erst die Welt aufdecken und die Tiere noch als Nummern
     stehen lassen - oder umgekehrt. */
  var maskedLock = null;
  /* Die Kontrollanzeige (Taste D) gehoert dem Entwickeln und der Lehrkraft,
     nicht der Klasse: sie nennt Arten, Zustaende und Merkmalswerte - also die
     Loesung der Aufgabe im Klartext. Sie haengt an keinem Knopf, deshalb ist
     die geschluckte Taste hier die ganze Sperre. */
  var noDetails = false;
  var worldsBox = null;
  var shownWorlds = '';
  var noteBox = null;
  var shownNote = '';
  var fullBtn = null;
  var shownFull = null;

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
    applying = true;
    try { applyNow(cmd); } finally { applying = false; }
  }

  function applyNow(cmd) {
    if (cmd.locks) applyLocks(cmd.locks);
    if (cmd.worlds) renderWorlds(cmd.worlds, cmd.seed);
    if ('full' in cmd) renderFull(!!cmd.full);
    if ('note' in cmd) renderNote(cmd.note);

    // Eine Gruppierung kommt nur mit, wenn sie auch aufgelegt werden soll -
    // die Seite schickt sie beim Weltwechsel und wenn am Beamer eine fremde
    // Arbeit gezeigt wird, sonst nie. Waere sie in jedem Takt dabei, loeschte
    // der Poller alle drei Sekunden, was gerade gezogen wurde.
    if (cmd.groups) pendingGroups = cmd.groups;

    var wantSeed = cmd.seed != null ? String(cmd.seed) : null;
    if (wantSeed && wantSeed !== String(lastSeed)) {
      pendingPhase = cmd.phase != null ? cmd.phase : null;
      pendingMasked = cmd.masked;
      /* Der Schleier VOR dem Aufbau und nicht erst danach. Ein Weltaufbau ist
         zweistufig (Bild, dann zehn Tage Tierleben) und dauert auf einem
         Tablet mehrere Sekunden - wer erst im worldHook verdeckt, zeigt die
         Landschaft genau so lange. Nach dem Aufbau wird es trotzdem noch
         einmal gesetzt (pendingMasked): der Aufbau selbst kann daran nichts
         aendern, aber verlassen wollen wir uns darauf nicht. */
      if (cmd.masked !== undefined) enforceMasked(cmd.masked);
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

  /* ─── Vollbild ──────────────────────────────────────────────────────────
     Ganz rechts in derselben Zeile wie die drei Welten - und auf JEDEM
     Geraet, nicht nur am Pult. Er stand vorher im Steuerpult der Lehrkraft,
     und das faehrt im Vollbild nach oben weg: wer vorne ohne Maus sitzt, kam
     nur mit Esc wieder heraus, und Esc kennt nicht jede Fernbedienung.

     Gedrueckt wird er hier, entschieden wird oben ('full'): das Vollbild
     nimmt den ganzen Kasten - Pult UND Rahmen -, und den kennt nur die Seite.
     Ob es gerade an ist, kommt mit jedem Befehl herein (cmd.full); von innen
     ist das nicht zu sehen, denn das Vollbild-Element liegt ausserhalb dieses
     Dokuments.

     Das Klicken traegt weit genug: die Nutzergeste eines gleichherkuenftigen
     Rahmens gilt auch im Fenster darueber, sonst lehnte requestFullscreen()
     dort ab. Nur der Weg hinaus braucht sie ohnehin nicht.                 */

  function renderFull(on) {
    if (!fullBtn) {
      var controls = document.querySelector('.controls');
      if (!controls) return;
      fullBtn = document.createElement('button');
      fullBtn.type = 'button';
      fullBtn.id = 'wcFull';
      fullBtn.className = 'btn btn-toggle full-btn';
      controls.appendChild(fullBtn);
      fullBtn.addEventListener('click', function () { send('full', {}); });
    }
    if (on === shownFull) return;
    shownFull = on;
    fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fullBtn.textContent = on ? '⛶ Vollbild beenden' : '⛶ Vollbild';
    fullBtn.title = on ? 'Vollbild verlassen' : 'Nur noch die Karte';
  }

  /* ─── Was gerade vorne laeuft ───────────────────────────────────────────
     Ein Streifen fuer die Lehrkraft, und zwar IN DER KOPFZEILE hinter dem
     kleinen „i" - nicht als Kasten ueber der Karte. Dort lag er frueher unten
     links und damit genau auf dem Abspielknopf; und eine Zeile, die sagt „Sie
     sehen gerade Mias Welt", gehoert ohnehin zu den anderen Angaben ueber die
     Ansicht und nicht mitten ins Bild.

     Er steht im Rahmen und nicht darum herum, obwohl die Seite ihn schickt:
     nur hier gibt es die Zeile, in der er stehen soll. Sein Knopf entscheidet
     deshalb auch nichts, er meldet nur nach oben ('note') - was „aufhoeren"
     bedeutet, weiss nur die Seite.

     Den Ausgang aus dem Vollbild trug er frueher mit. Der steht jetzt als
     eigener Knopf daneben (renderFull) und gilt fuer alle - zwei ⛶ in
     derselben Zeile waeren einer zu viel.                                   */

  function renderNote(note) {
    var text = note && note.text ? String(note.text) : '';
    var stop = !!(note && note.stop);
    var kind = (note && note.kind) || '';
    var key = text + '|' + kind + '|' + (stop ? 1 : 0);
    if (key === shownNote) return;
    shownNote = key;

    // Auf einem Tablet kommt hier immer "nichts" an. Dafuer muss kein Knoten
    // entstehen, der dann sein Leben lang leer in der Kopfzeile haengt.
    if (!noteBox && !text) return;

    var controls = document.querySelector('.controls');
    if (!controls) return;

    if (!noteBox) {
      noteBox = document.createElement('div');
      // Hinter das „i" - dort stehen in dieser Zeile die Auskuenfte ueber die
      // Ansicht -, aber VOR den Vollbild-Knopf: der bleibt ganz rechts.
      controls.insertBefore(noteBox, fullBtn);
      noteBox.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button[data-note]') : null;
        if (b) send('note', { action: b.getAttribute('data-note') });
      });
    }

    noteBox.className = 'wc-note' + (kind ? ' wc-note--' + kind : '');
    noteBox.hidden = !text;
    noteBox.innerHTML = '<span class="wc-note-text"></span>'
      + (stop ? '<button type="button" class="wc-note-x" data-note="stop"'
        + ' title="zurück zur eigenen Welt">✕</button>' : '');
    // textContent und nicht in das HTML hinein: in dem Streifen steht ein
    // Name, und den hat jemand selbst eingegeben.
    noteBox.querySelector('.wc-note-text').textContent = text;
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
    // Der Sichtknopf kennt zwei Stellungen, die Lehrkraft schaltet vier
    // (nichts, Welt, Tiere, beides). Ein Knopf, der den Zustand nicht mehr
    // benennen kann, gehoert nicht auf ein Tablet - im Raum sagt die
    // Aufloesung, was zu sehen ist, und nicht mehr das Geraet.
    body.classList.toggle('wc-no-view', !!locks.view);
    // Das kleine „i" erklaert Tasten. Auf einem Tablet ist keine davon zu
    // druecken, und was dort zu tun ist, sagt die Lehrkraft - der Knopf
    // bleibt deshalb ihrer Ansicht vorbehalten.
    body.classList.toggle('wc-no-info', !!locks.info);
    if (locks.info) {
      var box = document.getElementById('infoBox');
      var btn0 = document.getElementById('infoBtn');
      if (box) box.hidden = true;
      if (btn0) btn0.setAttribute('aria-expanded', 'false');
    }

    noDetails = !!locks.details;
    // Ein Befehl kann eintreffen, waehrend die Anzeige offen steht (die
    // Lehrkraft schaut vor der Stunde nach, die Klasse kommt herein).
    // Wegnehmen heisst dann auch: zumachen, was schon offen ist.
    if (noDetails && WC) WC.hideDetails();

    var seedInput = document.getElementById('seedInput');
    if (seedInput) seedInput.disabled = !!locks.seed;
    var generateBtn = document.getElementById('generateBtn');
    if (generateBtn) generateBtn.disabled = !!locks.seed;
  }

  /**
   * Die Sicht erzwingen oder freigeben.
   *
   * Angenommen wird dreierlei: null gibt den Knopf wieder frei, ein Wahrheits-
   * wert schaltet beide Haelften zusammen (verdeckt/offen), und ein Objekt
   * {w, a} setzt Landschaft und Tiere getrennt - das ist die Aufloesungsphase,
   * in der die Lehrkraft erst das eine und dann das andere aufdeckt.
   *
   * Erzwungen heisst: der Knopf ist tot UND die Taste V wirkt nicht - sonst
   * ist die Sperre nur eine Empfehlung, und in Phase 1 stuende die halbe
   * Klasse vor der Landschaft, die sie gerade nicht sehen soll.
   */
  function enforceMasked(spec) {
    if (spec === true || spec === false) maskedLock = { w: spec, a: spec };
    else if (spec && typeof spec === 'object') maskedLock = { w: !!spec.w, a: !!spec.a };
    else maskedLock = null;

    var btn = document.getElementById('viewModeBtn');
    if (btn) btn.disabled = maskedLock !== null;
    if (!maskedLock) return;
    if (WC.maskedWorld !== maskedLock.w || WC.maskedAnimals !== maskedLock.a) {
      WC.setMaskedParts(maskedLock.w, maskedLock.a);
    }
  }

  // Die Taste in der Capture-Phase abfangen: der Zuhoerer der Anwendung haengt
  // am window, ein spaeter angemeldeter zweiter kaeme dort nie vor ihm dran.
  global.addEventListener('keydown', function (e) {
    if (!e.key) return;
    var key = e.key.toLowerCase();
    if (maskedLock !== null && key === 'v') { e.stopPropagation(); e.preventDefault(); }
    if (noDetails && key === 'd') { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ─── Anschluss ────────────────────────────────────────────────────── */

  function attach() {
    WC = global.WILDCLUSTERS;
    if (!WC) { global.setTimeout(attach, 30); return; }

    /* Ein Aufbau faengt an - egal wer ihn angestossen hat. Ab hier gehoert
       alles, was die Signalliste meldet, dem Aufbau und nicht einem Menschen;
       aufgehoben wird die Sperre im worldHook, wenn die neue Welt steht. */
    WC.setBuildHook(function () { busy = true; });

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
      // Dasselbe gilt fuer alles, was ein Befehl von oben ausloest (applying).
      if (busy || applying || !lastSeed) return;
      send('clusters', { seed: lastSeed, phase: WC.phase, groups: groups });
    });

    /* Vor dem ersten Befehl, nicht erst mit ihm: an ihm haengt die Stelle,
       an der der Streifen eingehaengt wird (insertBefore). Wer ihn erst
       durch cmd.full entstehen liesse, haette bei einem Befehl mit `note`
       und ohne `full` die Reihenfolge vertauscht - einmal, und dann fuer
       den Rest der Stunde. */
    renderFull(false);

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
