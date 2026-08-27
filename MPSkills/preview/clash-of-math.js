/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/clash-of-math.js   ·   Schaufenster Mathoria
   ══════════════════════════════════════════════════════════════
   Viertes Drehbuch nach wordcloud, neurolab und caesar. Bis hierher
   war Kingdoms of Mathoria die einzige Kachel ohne Standbild und ohne
   Vorstellung: sie sagte nur ihren Namen und einen Satz, während die
   drei anderen zeigten, was an der Wand entsteht. Genau das war die
   Lücke — bei einem Skill, den man zu acht spielt, ist „wie sieht das
   aus" die erste Frage überhaupt.

   ── Warum die BEAMER-Rolle ────────────────────────────────────
   Das Werkzeug hat zwei Ansichten, und nur eine davon passt in eine
   Auslage:

   · Der Spielbildschirm des Kindes (`.cm-play`) ist `position:fixed`
     auf dem sichtbaren Bereich — er VERDECKT die Seite, das ist im
     Unterricht seine Aufgabe. In einem Kasten mitten auf der
     Landingpage legte er sich über das ganze Schaufenster samt
     Schließen-Knopf.
   · Die Beamer-Ansicht ist ein gewöhnlicher Block und zeigt
     obendrein das, worum es geht: das Königreich, die acht Völker an
     den Rändern, die Gebiete, die sich verschieben.

   Der Beamer ist damit nicht der Kompromiss, sondern die richtige
   Wahl: wer hier steht, ist eine Lehrkraft und überlegt, was ihre
   Klasse an der Wand sieht.

   ── Warum ein eigener erfundener Server ───────────────────────
   Dieses Werkzeug sitzt NICHT auf der generischen Inhaltsschicht
   (Migration 0093: eigene Tabellen, eigene clash_*-RPCs). Die
   gefälschten Verben aus lib/preview.js (upsert/vote/hide/…) laufen
   deshalb ins Leere — es ruft keines davon. Was es ruft, ist
   ausschließlich `ctx.actions.call(fn, args)`.

   Also liegt hier unten ein kleiner Spielstand: ein Spielfeld, acht
   Völker, ein paar Zahlen. Er meldet sich über `server(fn, args)` an
   (siehe fakeActions in lib/preview.js) und beantwortet genau die
   Aufrufe, die die Beamer-Ansicht macht. Kein Netz, kein Raum,
   keine Anmeldung — und trotzdem läuft die ECHTE tool.js, nicht ein
   Nachbau, der beim nächsten Umbau still veraltet.

   Der Spielstand ist absichtlich der KLEINE Bruder von
   tools/clash-of-math/vorschau.html. Jene Seite ist die Werkbank für
   den Ausbau und kann alles (beide Rollen, alle Phasen, Aufgabenpool,
   Ruinen, Serien-Boni). Hier braucht es davon nichts: eine laufende
   Partie, dreißig Eroberungen, fertig. Was fehlt, fehlt bewusst.

   ── Warum das Drehbuch nicht klickt ───────────────────────────
   Die anderen drei Drehbücher bedienen das Werkzeug mit echten
   Klick-Ereignissen — bei ihnen IST die Bedienung das, was man zeigen
   will. Auf dem Beamer gibt es während einer Partie nichts zu
   bedienen: er zeigt nur an, gerechnet wird auf den Tablets. Das
   Drehbuch ändert deshalb den Spielstand selbst und stupst das
   Werkzeug mit `api.refresh()` an — dasselbe update(view), das im
   Raum der Seiten-Poller ruft.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  /* ═══════════════════════════════════════════════════════════
     Das Spielfeld
     ═══════════════════════════════════════════════════════════
     Dieselbe Rechnung wie in vorschau.html (und dahinter dieselbe
     wie in clash_layouts): ein runder Klumpen aus dem Sechseck-
     Raster, je Volk eine Burg auf einem Kreis um die Mitte, jede
     übrige Kachel gehört der nächstgelegenen Burg.

     Nachgebaut und nicht vereinfacht — ein Spielfeld aus geraden
     Streifen sähe aus wie ein Balkendiagramm und nicht wie eine
     Landkarte. */
  const SQ3 = Math.sqrt(3);
  const hexUnit = (r, c) => ({
    x: (c + 0.5) * SQ3 + (r % 2 === 1 ? SQ3 / 2 : 0),
    y: (r + 0.5) * 1.5
  });
  const HEX_DIRS_EVEN = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  const HEX_DIRS_ODD  = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
  const dirsFor = r => (r % 2 === 1 ? HEX_DIRS_ODD : HEX_DIRS_EVEN);

  /* `squeeze` staucht den Ausschnitt senkrecht. In vorschau.html steht
     dafür fest 1,15 — das ergibt einen fast runden Klumpen, und der ist
     dort richtig, weil eine Werkbank keine Seitenverhältnisse hat.

     Hier schon: das Spielfeld sitzt zwischen den beiden Völker-Spalten
     und bekommt eine Fläche, die doppelt so breit wie hoch ist. Ein
     runder Klumpen darin wird über die HÖHE eingepasst (renderHexMap
     nimmt EINEN Maßstab für beide Richtungen, damit die Sechsecke
     regelmäßig bleiben) — links und rechts stünde dann je ein Viertel
     der Fläche leer. Ein breiter geschnittenes Königreich füllt sie,
     ohne dass irgendwo eine Kachel verzerrt wird. */
  function buildBoard(rows, cols, radius, teams, squeeze) {
    const mid = { x: (cols / 2) * SQ3, y: (rows / 2) * 1.5 };
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = hexUnit(r, c);
        if (Math.hypot(u.x - mid.x, (u.y - mid.y) * squeeze) <= radius) cells.push({ r: r, c: c, u: u });
      }
    }
    const castles = [];
    for (let t = 0; t < teams; t++) {
      const a = (Math.PI * 2 * t) / teams - Math.PI / 2;
      /* Die Burgen stehen auf einer ELLIPSE und nicht auf einem Kreis:
         derselbe `squeeze` wie beim Ausschnitt oben. Ein Kreis läge bei
         einem breiten Königreich oben und unten außerhalb, und die
         Suche nach der nächstgelegenen Kachel drängte dann mehrere
         Burgen in dieselbe Randreihe — zwei Völker mit einer
         gemeinsamen Grenze und keinem Land dahinter. */
      const tx = mid.x + Math.cos(a) * (radius * 0.71);
      const ty = mid.y + Math.sin(a) * (radius / squeeze * 0.68);
      let best = null, bd = Infinity;
      cells.forEach(cell => {
        if (castles.indexOf(cell) >= 0) return;
        const d = Math.hypot(cell.u.x - tx, cell.u.y - ty);
        if (d < bd) { bd = d; best = cell; }
      });
      if (best) castles.push(best);
    }
    return cells.map(cell => {
      let team = 0, bd = Infinity;
      castles.forEach((k, t) => {
        const d = Math.hypot(cell.u.x - k.u.x, cell.u.y - k.u.y);
        if (d < bd) { bd = d; team = t; }
      });
      // `hp` nur an Burgen, wie clash_tiles_json es liefert (0100).
      const isCastle = castles.indexOf(cell) >= 0;
      return { r: cell.r, c: cell.c, team: team, castle: isCastle, hp: isCastle ? 3 : null };
    });
  }

  /* ═══════════════════════════════════════════════════════════
     Der erfundene Spielstand
     ═══════════════════════════════════════════════════════════
     Acht Völker, weil genau das die Zahl ist, die auf der Kachel
     steht — „bis zu acht Teams" darf man in der Auslage auch sehen.
     Sie füllen die beiden Völker-Spalten links und rechts vollständig
     (fillRosters verteilt gerade/ungerade), und das Spielfeld hat
     dabei noch genug Kacheln, dass jedes Volk ein Gebiet hat und
     nicht nur seine Burg: rund 70 Kacheln, also neun je Volk. Weniger
     wäre eine Partie, die nach fünf Zügen entschieden ist. */
  const ROWS = 11, COLS = 17, RADIUS = 11, SQUEEZE = 1.9, TEAMS = 8;

  // Namen für die Völker-Spalten. Erfunden, aber kurz — lange Namen
  // brechen in der Spalte um und die Spalte ist die Vorgabe, nach der
  // sich die Kartenbreite richtet.
  const NAMES = [
    ['Lena', 'Jonas', 'Mia'], ['Emil', 'Sofia', 'Noah'],
    ['Paul', 'Nele', 'Finn'], ['Anton', 'Frieda', 'Theo'],
    ['Ida', 'Ben', 'Romy'],   ['Luca', 'Jara', 'Milan'],
    ['Marie', 'Ole', 'Nina'], ['Karl', 'Wilma', 'Rasmus']
  ];

  let tiles = [];
  let correct = {};
  let streaks = {};        // 0125: laufende Serie je Volk — daraus die Flamme
  let teamEvents = [];
  let nextEventId = 1;
  let matchEnd = 0;

  /* 0125: Wer ist geschützt? Dieselbe Regel wie im Server
     (clash_fire_teams): die lebenden Völker mit der höchsten Serie,
     sofern die mindestens 3 beträgt. Sie steht hier nachgebaut und
     nicht abgefragt, weil die Auslage keinen Server hat — und sie
     steht bewusst KURZ: eine Auslage, die eine Spielregel nur
     ungefähr zeigt, wirbt für ein anderes Spiel. */
  function fireTeamsOf(tileCounts) {
    let max = 0;
    for (let i = 0; i < TEAMS; i++) {
      if ((tileCounts[i] || 0) > 0) max = Math.max(max, streaks[i] || 0);
    }
    if (max < 3) return [];
    const out = [];
    for (let i = 0; i < TEAMS; i++) {
      if ((tileCounts[i] || 0) > 0 && (streaks[i] || 0) === max) out.push(i);
    }
    return out;
  }

  /* Ein neuer Durchgang bekommt ein neues Königreich. Das steht in
     view() und nicht in play(), weil lib/preview.js genau dort seinen
     Schnitt macht: `cur.view = show.view()` läuft einmal beim Öffnen
     und einmal zwischen zwei Durchgängen — beide Male ist „von vorn"
     die richtige Antwort, und beim zweiten Mal blendet die Bühne
     dabei ab (fade), sodass das Zurücksetzen nicht als Zucken
     durchschlägt. */
  function reset() {
    tiles = buildBoard(ROWS, COLS, RADIUS, TEAMS, SQUEEZE);
    correct = {};
    // Kein Volk startet bei null: die Partie läuft schon eine Weile,
    // und eine Reihe aus lauter Nullen sähe aus, als rechne niemand.
    for (let i = 0; i < TEAMS; i++) correct[i] = 6 + Math.floor(Math.random() * 22);
    // Die Serien dagegen schon: die Flamme soll in der Auslage
    // ENTSTEHEN, nicht von Anfang an dastehen — sonst sieht es aus wie
    // eine Auszeichnung und nicht wie etwas, das man sich holt.
    streaks = {};
    teamEvents = [];
    nextEventId = 1;
    /* EINMAL gesetzt und danach stehengelassen: der Ring oben rechts
       merkt sich die größte Restzeit, die er für DIESES Rundenende
       gesehen hat (siehe startMatchTimer in tool.js). Ein bei jedem
       Abruf frisch gerechnetes Ende setzte diesen Nenner ständig neu,
       und der Ring stünde für immer auf „voll". */
    matchEnd = Date.now() + 3 * 60 * 1000;
  }
  reset();

  /* ─── Eine Eroberung ────────────────────────────────────────
     Dieselbe Regel wie clash_capture_random: ein beliebiges fremdes
     Feld, das an das eigene Gebiet grenzt. Eine Burg kostet drei
     Treffer und wechselt erst beim letzten das Volk (0100) — deshalb
     sind Burgen hier ausdrücklich KEINE Ausnahme: sonst wären die
     drei Herzen darunter ein Bild, das sich nie ändert. */
  function captureFor(team) {
    const mine = new Set();
    tiles.forEach(t => { if (t.team === team) mine.add(t.r + ',' + t.c); });
    if (!mine.size) return null;

    const border = tiles.filter(t => {
      if (t.team === team) return false;
      return dirsFor(t.r).some(d => mine.has((t.r + d[0]) + ',' + (t.c + d[1])));
    });
    if (!border.length) return null;

    const t = border[Math.floor(Math.random() * border.length)];
    if (t.castle && (t.hp == null ? 3 : t.hp) > 1) {
      t.hp = (t.hp == null ? 3 : t.hp) - 1;
      return t;
    }
    t.team = team;
    if (t.castle) t.hp = 3;
    return t;
  }

  // Wer als Nächstes dran ist. Gewichtet nach Gebietsgröße, aber
  // andersherum als man denkt: das KLEINERE Volk greift öfter an.
  // Ohne das reißt ein Volk nach zehn Zügen die halbe Karte an sich,
  // und die Auslage zeigte eine Partie, die schon entschieden ist.
  function nextAttacker() {
    const counts = {};
    tiles.forEach(t => { if (t.team >= 0) counts[t.team] = (counts[t.team] || 0) + 1; });
    const alive = Object.keys(counts).map(Number);
    if (!alive.length) return null;
    const most = Math.max.apply(null, alive.map(s => counts[s]));
    const pool = [];
    alive.forEach(s => {
      const weight = Math.max(1, most - counts[s] + 2);
      for (let i = 0; i < weight; i++) pool.push(s);
    });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ═══════════════════════════════════════════════════════════
     Der erfundene Server
     ═══════════════════════════════════════════════════════════
     Genau die zwei Aufrufe, die die Beamer-Ansicht während einer
     laufenden Partie macht (Signatur, dann Ansicht — siehe tick in
     tool.js) — plus die zwei des Zeit-Auswahlfelds,
     denn das ist der einzige Knopf, den ein Besucher hier bedienen
     kann, und ein Knopf, der in eine Fehlermeldung führt, ist
     schlechter als keiner.

     Alles Übrige antwortet wie ein Server, der die Funktion nicht
     kennt: `{ ok: false }`. Das Werkzeug biegt dann an seinem
     gewohnten Zweig ab, statt über `undefined` zu stolpern. */
  function counts() {
    const out = {};
    tiles.forEach(t => { out[t.team] = (out[t.team] || 0) + 1; });
    return out;
  }

  function roomGet() {
    const c = counts();
    const members = {};
    for (let i = 0; i < TEAMS; i++) members[i] = NAMES[i % NAMES.length];
    return {
      ok: true,
      phase: 'running',
      team_count: TEAMS,
      // Alle acht Völker, jedes auf seinem eigenen Slot: die Auslage
      // zeigt die volle Besetzung, sonst hieße „bis zu acht" hier vier.
      factions: [0, 1, 2, 3, 4, 5, 6, 7],
      countdown_ends_at: null,
      match_ends_at: new Date(matchEnd).toISOString(),
      winner_team: null,
      // Kein Realtime-Kanal in der Auslage: ohne Schlüssel hängt sich
      // ensureChannel gar nicht erst an supabaseClient.
      broadcast_key: null,
      rows: ROWS, cols: COLS,
      tiles: tiles.map(t => ({ r: t.r, c: t.c, team: t.team, castle: t.castle, hp: t.hp })),
      teams: c,
      team_tile_counts: c,
      team_correct_counts: correct,
      team_members: members,
      offline_members: [],
      team_events: teamEvents.slice(-20),
      // 0125: Serie je Volk und die daraus folgende Flamme. Sie ist
      // die auffälligste Neuerung des Spiels — eine Auslage ohne sie
      // zeigte den Stand von vorgestern.
      team_streaks: streaks,
      fire_teams: fireTeamsOf(c),
      // Kein Ruinen-Modus in der Auslage (0108): dafür müsste erst ein
      // Volk ausscheiden, und dreißig Züge reichen dafür nicht.
      ruin: {},
      board: { tiles: tiles.length, initial_tiles: tiles.length, removed: 0,
               max_removals: Math.floor(tiles.length / 2),
               floor_reached: false, shrinkable: true },
      online_count: 24, room_total: 24
    };
  }

  function server(fn, args) {
    switch (fn) {
      case 'clash_room_sig':
        // Kacheln, Leben, Serien-Ereignisse — dieselben drei Dinge, aus
        // denen der Server seine Signatur baut. Ohne die Ereignis-Nummer
        // löste ein Serien-Banner keinen Takt aus, weil sich dabei keine
        // Kachel ändert.
        return { ok: true, sig: tiles.map(t => t.team + '' + (t.hp == null ? '' : t.hp)).join('') +
                                ':' + nextEventId };
      case 'clash_room_get':
        return roomGet();
      case 'clash_room_set_match_timer': {
        const s = parseInt(args.p_seconds, 10) || 0;
        matchEnd = s > 0 ? Date.now() + s * 1000 : 0;
        return { ok: true };
      }
      case 'clash_room_clear_match_timer':
        matchEnd = 0;
        return { ok: true };
      default:
        return { ok: false, error: 'unknown_fn' };
    }
  }

  /* Die Werkzeug-Schnittstelle verlangt bei jedem update() eine view.
     Die Beamer-Ansicht sieht sie nie an — ihr ganzer Stand kommt aus
     clash_room_get —, sie muss trotzdem die Form haben, die auch aus
     skill_room_get käme. Nebenbei ist das der Ort, an dem ein neuer
     Durchgang sein Königreich bekommt (siehe reset). */
  function view() {
    reset();
    return {
      role: ROLE,
      room: { title: 'Kingdoms of Mathoria', settings: {} },
      state: { phase: 1, data: {} },
      limits: {},
      me: { may_write: true },
      entries: []
    };
  }

  /* ═══════════════════════════════════════════════════════════
     Das Drehbuch
     ═══════════════════════════════════════════════════════════
     Eine laufende Partie, von der man den einen Vorgang sieht, der
     sie ausmacht: irgendwo im Raum rechnet jemand richtig, und auf
     der Karte kippt ein Feld die Farbe. Dreißig Mal, aus wechselnden
     Richtungen, dazu die Zahlen in den Völker-Spalten, die
     mitwandern.

     Der Takt (760 ms) ist mit Absicht langsamer als im Unterricht —
     dort feuert eine Klasse mit 24 Kindern mehrere Eroberungen pro
     Sekunde. Was da wirklich passiert, kann man auf einem Beamer aus
     zehn Metern verfolgen; in einem Kasten von 700 px wäre es
     Flimmern. */
  async function play(api) {
    // Die Karte steht erst, wenn der erste Takt des Werkzeugs durch
    // ist (es holt sich seinen Stand selbst, siehe tick in tool.js).
    if (!await api.waitFor('.cm-frame--board', 5000)) return;
    if (!await api.wait(1000)) return;

    for (let i = 0; i < 30; i++) {
      const team = nextAttacker();
      if (team == null) break;
      captureFor(team);

      /* Die Serie des Volkes (0125). Wer gerade erobert, hat richtig
         gerechnet — seine Serie wächst. Damit die Flamme wandert und
         nicht bei einem Volk klebt, reißt hin und wieder die Serie
         eines anderen ab; im Spiel besorgt das ein Fehlversuch.
         Das team_fire-Ereignis wird nur dann ausgelöst, wenn die
         Flamme wirklich übergeht — auf dem Beamer ist genau das die
         Ankündigung, die die Auslage zeigen soll. */
      const fireBefore = fireTeamsOf(counts());
      streaks[team] = (streaks[team] || 0) + 1;
      if (i % 4 === 3) {
        const other = Math.floor(Math.random() * TEAMS);
        if (other !== team) streaks[other] = 0;
      }
      fireTeamsOf(counts()).forEach(slot => {
        if (fireBefore.indexOf(slot) < 0) {
          teamEvents.push({ id: nextEventId++, team: slot, kind: 'team_fire',
                            payload: { streak: streaks[slot] || 0 } });
        }
      });

      // Wer erobert, hat gerechnet — und zwar mehr als einmal, sonst
      // stünde die zweite Zahl in der Spalte still, während die erste
      // wächst.
      correct[team] = (correct[team] || 0) + 1 + Math.floor(Math.random() * 2);

      if (!api.refresh()) return;
      if (!await api.wait(760)) return;
    }

    // Einen Moment auf dem Ergebnis stehen bleiben, bevor die Bühne
    // abblendet und ein neues Königreich aufbaut.
    await api.wait(1600);
  }

  /* ═══════════════════════════════════════════════════════════
     Das Standbild für die Kachel
     ═══════════════════════════════════════════════════════════
     Ein leichter Nachbau, aus demselben Grund wie bei der Wolke: das
     Werkzeug misst seine Karte aus dem Platz, den es bekommt, und in
     einer Kachel hat es nichts zu messen — es bekäme seine
     Mindesthöhe und stellte 60 Sechsecke auf 260 px.

     Nachgebildet ist deshalb nur, was in dieser Größe trägt: das
     Pergament im Goldrahmen, ein kleineres Königreich aus sechs
     Völkern, die Burgen als Wappen darauf — und unten die Aufgabe.
     Genau in der Reihenfolge ist der Skill zu erklären: es gibt eine
     Rechenaufgabe, und wer sie hat, nimmt ein Feld.

     Die Bewegung beim Darüberfahren ist dieser eine Vorgang: die
     Aufgabe kippt auf ihre Lösung, und das Grenzfeld daneben wechselt
     die Farbe. Beides zusammen, weil eines ohne das andere nur die
     halbe Regel zeigt.

     ⚠️ Die Farben stehen im style-Attribut, die REGELN im
     Stylesheet — dieselbe Aufteilung wie beim Wolken-Standbild und
     aus demselben Grund: eine Inline-Angabe schlüge jede Regel, und
     die Hover-Bewegung käme nie zustande.

     aria-hidden: für eine Vorlesestimme ist das ein Bild. */

  // Dieselben acht Farben wie in tool.js (FACTION_STROKE) — hier die
  // ersten sechs. Nicht importiert, weil tool.js beim Zeichnen der
  // Kachel noch gar nicht geladen ist (lib/preview.js holt es erst,
  // wenn jemand eine Kachel öffnet).
  const TILE_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];

  const VB = { w: 320, h: 186 };
  const BOX = { x: 20, y: 14, w: 280, h: 128 };   // Platz für die Karte

  // Eine kleine Burg: Sockel, zwei Türme mit Zinnen, ein Tor. Als
  // Pfad und nicht als das Sprite des Volkes — ein PNG von 200 px
  // wäre hier 14 px hoch und nur noch ein Fleck.
  function castleGlyph(x, y, s) {
    const p = (a, b) => (x + a * s).toFixed(1) + ',' + (y + b * s).toFixed(1);
    return '<path class="kmp-castle" d="M' + p(-1, 0.55) + ' L' + p(-1, -0.35) +
      ' L' + p(-0.62, -0.35) + ' L' + p(-0.62, -0.75) + ' L' + p(-0.24, -0.75) +
      ' L' + p(-0.24, -0.35) + ' L' + p(0.24, -0.35) + ' L' + p(0.24, -0.75) +
      ' L' + p(0.62, -0.75) + ' L' + p(0.62, -0.35) + ' L' + p(1, -0.35) +
      ' L' + p(1, 0.55) + ' Z"></path>' +
      '<rect class="kmp-gate" x="' + (x - 0.26 * s).toFixed(1) + '" y="' + (y + 0.05 * s).toFixed(1) +
      '" width="' + (0.52 * s).toFixed(1) + '" height="' + (0.5 * s).toFixed(1) + '" rx="' + (0.24 * s).toFixed(1) + '"></rect>';
  }

  function tile() {
    /* Kleineres Feld als in der Vorstellung: sechs Völker auf rund
       35 Kacheln. Acht wären hier je vier Sechsecke, und vier
       Sechsecke lesen sich nicht als Land — die Kachel soll zeigen,
       dass es um GEBIETE geht, nicht um Spielsteine. Die volle
       Besetzung gibt es hinter dem Klick. */
    const board = buildBoard(9, 13, 7.5, 6, 2.1);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    board.forEach(t => {
      const u = hexUnit(t.r, t.c);
      if (u.x < minX) minX = u.x;
      if (u.x > maxX) maxX = u.x;
      if (u.y < minY) minY = u.y;
      if (u.y > maxY) maxY = u.y;
    });
    minX -= SQ3 / 2; maxX += SQ3 / 2;
    minY -= 1; maxY += 1;

    const scale = Math.min(BOX.w / (maxX - minX), BOX.h / (maxY - minY));
    const offX = BOX.x + (BOX.w - (maxX - minX) * scale) / 2;
    const offY = BOX.y + (BOX.h - (maxY - minY) * scale) / 2;
    const center = t => {
      const u = hexUnit(t.r, t.c);
      return { x: (u.x - minX) * scale + offX, y: (u.y - minY) * scale + offY };
    };

    /* Welches Feld beim Darüberfahren kippt: ein Grenzfeld des zweiten
       Volkes, das an das erste stößt. Gesucht und nicht festgenagelt —
       welche Kachel das ist, hängt an der Rechnung oben, und eine hier
       eingetragene Zeile/Spalte wäre beim nächsten Anfassen der Radien
       still falsch.

       Von den Kandidaten der mittigste: am Rand der Kachel steht die
       eine Kachel, die sich ändert, genau dort, wo niemand hinsieht. */
    const owner = new Map(board.map(t => [t.r + ',' + t.c, t.team]));
    const mid = { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 };
    let flip = null, flipD = Infinity;
    board.forEach(t => {
      if (t.team !== 1 || t.castle) return;
      if (!dirsFor(t.r).some(d => owner.get((t.r + d[0]) + ',' + (t.c + d[1])) === 0)) return;
      const p = center(t);
      const d = Math.hypot(p.x - mid.x, p.y - mid.y);
      if (d < flipD) { flipD = d; flip = t; }
    });

    let poly = '', ring = '';
    board.forEach(t => {
      const p = center(t);
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i - Math.PI / 6;
        pts.push((p.x + (scale - 1.4) * Math.cos(a)).toFixed(1) + ',' +
                 (p.y + (scale - 1.4) * Math.sin(a)).toFixed(1));
      }
      // Zwei Farben am selben Sechseck, umgeschaltet wird nur, WELCHE
      // gilt — genau wie beim Wolken-Standbild (--f0/--f1).
      const isFlip = flip && t.r === flip.r && t.c === flip.c;
      poly += '<polygon class="kmp-hex' + (isFlip ? ' kmp-hex--flip' : '') +
        '" points="' + pts.join(' ') + '" style="--raw:' + TILE_COLORS[t.team] +
        (isFlip ? ';--raw1:' + TILE_COLORS[0] : '') + '"></polygon>';
      /* Der goldene Ring um das eroberte Feld — dasselbe Zeichen, das
         im Spiel über einer Eroberung aufgeht (.cm-fx in tool.css).
         Ohne ihn ändert unter fünfunddreißig Sechsecken eines die
         Farbe, und wer nicht gerade dorthin sieht, merkt es nicht.
         Er liegt ZULETZT im Dokument, also über allen Flächen — SVG
         malt in Reihenfolge. */
      if (isFlip) ring = '<polygon class="kmp-ring" points="' + pts.join(' ') + '"></polygon>';
    });
    poly += ring;

    let castles = '';
    board.forEach(t => {
      if (!t.castle) return;
      const p = center(t);
      castles += castleGlyph(p.x, p.y - scale * 0.1, scale * 0.5);
    });

    /* Die Aufgabe. Ein Bruch und nicht „37 + 48": die Kachel soll auch
       sagen, dass hier nicht nur Kopfrechnen der fünften Klasse
       liegt. Zwei Zeilen übereinander, eine davon durchsichtig — die
       Aufgabe WIRD zur Lösung, sie wandert nicht. */
    const cy = VB.h - 22;
    const chip =
      '<rect class="kmp-chip" x="' + (VB.w / 2 - 62) + '" y="' + (cy - 15) + '" width="124" height="30" rx="15"></rect>' +
      '<text class="kmp-task kmp-s0" x="' + VB.w / 2 + '" y="' + cy + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="15">3/4 + 1/8</text>' +
      '<text class="kmp-task kmp-s1" x="' + VB.w / 2 + '" y="' + cy + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="15">7/8 ✓</text>';

    return '<div class="tprev tprev--km" aria-hidden="true">' +
      '<svg class="kmp" viewBox="0 0 ' + VB.w + ' ' + VB.h + '" preserveAspectRatio="xMidYMid meet">' +
        // Das Pergament im Goldrahmen — die Kulisse des Spiels, in
        // drei Rechtecken statt in einem Bild (siehe .cm-frame--board).
        '<rect class="kmp-parch" x="3" y="3" width="' + (VB.w - 6) + '" height="' + (VB.h - 6) + '" rx="14"/>' +
        '<rect class="kmp-gold"  x="3" y="3" width="' + (VB.w - 6) + '" height="' + (VB.h - 6) + '" rx="14"/>' +
        '<rect class="kmp-night" x="8" y="8" width="' + (VB.w - 16) + '" height="' + (VB.h - 16) + '" rx="10"/>' +
        poly + castles + chip +
      '</svg>' +
    '</div>';
  }

  window.MPPreview.register('clash-of-math', {
    role: ROLE,
    view, play, tile, server,

    /* Wie NeuroLab: das hier ist keine Tafel, sondern eine ganze
       Anwendung. Die beiden Völker-Spalten stehen links und rechts
       neben dem Spielfeld und sind je 178 px breit (--cm-roster-w) —
       im Regelmaß von 820 px bliebe für das Königreich in der Mitte
       kaum mehr als die Mindestbreite. */
    wide: true,

    /* Abblenden zwischen zwei Durchgängen: das neue Königreich färbt
       auf einen Schlag dreißig Kacheln um, und das sähe mitten in der
       Bewegung nach Fehler aus statt nach Anfang. Genau der Fall, für
       den es die Blende gibt. */
    fade: true,

    blurb: `
      <p>Ein Königreich aus Sechsecken, aufgeteilt unter <strong>bis zu acht Teams</strong>.
         Jedes Team hat eine Burg und ein Gebiet — und jede richtig gelöste Aufgabe nimmt
         ein Nachbarfeld eines anderen Reichs ein. Die Klasse rechnet auf den Tablets,
         an der Wand verschieben sich die Grenzen.</p>
      <p>Gerechnet wird gegen die Uhr, nicht gegen ein Aufgabenblatt: Wer schneller im Kopf
         ist, wächst schneller. <strong>Das Team mit den schnellsten Köpfen gewinnt</strong> —
         entweder es hat am Ende der Runde das meiste Land, oder es nimmt einer anderen Burg
         das dritte Leben. Ein ausgeschiedenes Team spielt weiter und lässt Felder versinken.</p>
      <p>Der Aufgabenpool reicht über mehrere Jahrgänge und wird vor dem Start zusammengestellt:
         <strong>Grundrechenarten, Bruchrechnung, Terme und Gleichungen, Analysis</strong> — dazu
         die <strong>Zahlensysteme der Informatik</strong> (Binär, Hexadezimal und die Umrechnung
         zwischen beiden). Je Aufgabenart lässt sich wählen, ob getippt oder aus Kacheln
         ausgewählt wird; dieselbe Runde geht damit vom Kopfrechnen bis zur Oberstufe.</p>
      <p>Hier läuft eine erfundene Partie mit acht Völkern. Im Unterricht steht dieses Bild am
         Beamer, und jedes Kind hat auf seinem Tablet die nächste Aufgabe.</p>`
  });
})();
