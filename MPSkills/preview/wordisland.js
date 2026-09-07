/* ══════════════════════════════════════════════════════════════
   MPSkills — Schaufenster „Myth of Wordisland"
   ══════════════════════════════════════════════════════════════
   Kachel-Standbild und Drehbuch für die Auslage auf der Landing.

   ── Ein erfundener Server, das ECHTE Werkzeug ─────────────────
   Wordisland sitzt nicht auf der generischen Inhaltsschicht — es
   hat eigene Tabellen und eigene RPC-Namen (0130/0131). Die
   gefälschten Verben aus lib/preview.js (upsert/vote/…) laufen
   hier deshalb ins Leere; stattdessen beantwortet `server(fn,
   args)` genau die Aufrufe, die die Beamer-Ansicht macht:
   wi_room_get, wi_sets_list, wi_hard_words. Dasselbe Muster wie
   bei Kingdoms of Mathoria.

   Der Gewinn ist derselbe: es läuft die echte tools/wordisland/
   tool.js und kein Nachbau, der beim nächsten Umbau still
   veraltet.

   ── Warum die Insel gewürfelt, aber immer gleich ist ──────────
   Die Formel ist dieselbe wie im Server (sternförmiger Umriss aus
   drei Wellen), der Zufall darunter ist aber ein fester Startwert.
   Eine Auslage, die bei jedem Aufruf anders aussieht, ist keine
   Auslage — und das Standbild der Kachel muss ohnehin stabil
   sein, sonst flackert die Startseite bei jedem Laden.

   ── Was das Drehbuch NICHT zeigt ──────────────────────────────
   Die Tablet-Seite. Die Auslage steht auf der Beamer-Rolle, und
   dort ist die Insel die ganze Geschichte: Felder fallen, Grenzen
   verschieben sich, die Uhr läuft. Wer tippt, sieht man ohnehin
   nicht — das passiert an dreißig Geräten gleichzeitig.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';
  const TEAMS = 4;
  const R = 9;

  /* ─── Fester Zufall ─────────────────────────────────────────
     Zwei Zeilen statt einer Bibliothek: derselbe Startwert, dieselbe
     Insel — heute, morgen und auf jedem Gerät. */
  function rngFrom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const cxOf = (r, c) => c + 0.5 * (((r % 2) + 2) % 2);
  const cyOf = r => r * 0.8660254;

  function neighbors(r, c) {
    const odd = (((r % 2) + 2) % 2) === 1;
    const d = odd ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
                  : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    return d.map(([dr, dc]) => [r + dr, c + dc]);
  }

  /* Wortgleich zur Insel-Erzeugung in Migration 0131: Umriss aus
     drei Wellen, Landeplätze nach Winkel an der Küste, Ruinen mit
     Mindestabstand. Wenn sich dort etwas ändert, ändert es sich
     hier mit — sonst zeigt die Auslage eine Insel, die es im Raum
     nicht gibt. */
  function buildIsland(seed) {
    const rnd = rngFrom(seed);
    const p1 = rnd() * 6.2832, p2 = rnd() * 6.2832, p3 = rnd() * 6.2832;
    const cols = 2 * R + 2;
    const rows = Math.ceil(2 * R / 0.8660254) + 1;
    const cx = R + 0.5, cy = (rows - 1) / 2;

    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = cxOf(r, c) - cx, y = (r - cy) * 0.8660254;
        const d = Math.hypot(x, y), a = Math.atan2(y, x);
        const edge = R * (0.70 + 0.13 * Math.sin(a + p1)
                               + 0.09 * Math.sin(2 * a + p2)
                               + 0.05 * Math.sin(3 * a + p3));
        if (d <= edge) cells.push({ r, c, d, a, ruin: 0, home: -1, own: '.' });
      }
    }
    cells.sort((A, B) => (A.r - B.r) || (A.c - B.c));
    const at = new Map(cells.map(t => [t.r + '/' + t.c, t]));
    const isLand = (r, c) => at.has(r + '/' + c);
    const coastal = t => neighbors(t.r, t.c).some(([nr, nc]) => !isLand(nr, nc));

    for (let k = 0; k < TEAMS; k++) {
      const want = 6.2832 * k / TEAMS + p1;
      let best = null, bestD = Infinity;
      for (const t of cells) {
        if (t.home >= 0 || !coastal(t)) continue;
        const diff = Math.abs(Math.atan2(Math.sin(t.a - want), Math.cos(t.a - want)));
        if (diff < bestD) { bestD = diff; best = t; }
      }
      if (best) { best.home = k; best.own = String(k); }
    }

    const ruins = [];
    for (let i = 0; i < 10; i++) {
      const free = cells.filter(t => t.home < 0 && !t.ruin && ruins.every(s =>
        Math.hypot(cxOf(s.r, s.c) - cxOf(t.r, t.c), (s.r - t.r) * 0.8660254) >= 3));
      if (!free.length) break;
      const t = free[Math.floor(rnd() * free.length)];
      t.ruin = t.d < 0.30 * R ? 3 : t.d < 0.62 * R ? 2 : 1;
      ruins.push(t);
    }

    return { cells, at, isLand };
  }

  let world = buildIsland(20260907);
  let startedAt = Date.now();

  const ownString = () => world.cells.map(t => t.own).join('');
  const mapArray  = () => world.cells.map(t => [t.r, t.c, t.ruin, t.home >= 0 ? 1 : 0]);

  function scores() {
    const out = [];
    for (let i = 0; i < TEAMS; i++) {
      const mine = world.cells.filter(t => t.own === String(i));
      out.push({
        i,
        tiles: mine.length,
        ruins: mine.reduce((s, t) => s + t.ruin, 0),
        score: mine.length + mine.reduce((s, t) => s + t.ruin, 0),
        people: [7, 6, 6, 7][i]
      });
    }
    return out;
  }

  /* Ein Zug: das Volk nimmt ein Nachbarfeld. Nebel zuerst, sonst
     fremdes Land — dieselbe Regel wie im Server, weil die Auslage
     sonst etwas zeigt, das im Raum nicht passiert. */
  function advance(team) {
    const mine = world.cells.filter(t => t.own === String(team));
    if (!mine.length) return false;
    const border = new Map();
    for (const m of mine) {
      for (const [nr, nc] of neighbors(m.r, m.c)) {
        const t = world.at.get(nr + '/' + nc);
        if (t && t.own !== String(team)) border.set(nr + '/' + nc, t);
      }
    }
    const cand = [...border.values()];
    const fog = cand.filter(t => t.own === '.');
    const pool = fog.length ? fog : cand.filter(t => t.home < 0);
    if (!pool.length) return false;
    // Zielstrebig statt zufällig: das Drehbuch soll den Zug zur
    // Inselmitte zeigen, um den es im Spiel geht.
    pool.sort((a, b) => (b.ruin - a.ruin) || (a.d - b.d));
    const pick = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
    pick.own = String(team);
    return true;
  }

  function reset() {
    world = buildIsland(20260907);
    startedAt = Date.now();
  }

  /* ═══════════════════════════════════════════════════════════
     Der erfundene Server
     ═══════════════════════════════════════════════════════════ */
  function server(fn, args) {
    switch (fn) {
      case 'wi_room_get':
        return {
          ok: true, role: ROLE, phase: 'running', mode: 'type', direction: 'mixed',
          teams: scores(), team_count: TEAMS,
          // Seit 0133 übersetzt das Werkzeug Slot → Volk. Die Auslage
          // zeigt die ersten vier Völker, also genau die Zuordnung von
          // vorher — und das Standbild darunter (TEAM_FILL) stimmt
          // ohne weiteres Zutun damit überein.
          factions: [0, 1, 2, 3],
          duration: 600, radius: R, seed: 1,
          map_key: 'preview:' + startedAt,
          map: (args && args.p_full) ? mapArray() : null,
          own: ownString(),
          ends_at: new Date(startedAt + 600000).toISOString(),
          countdown_ends_at: null, winner_team: null, sets: [], people: []
        };

      // Die Lobby steht in der Auslage nie offen; das Werkzeug fragt
      // die Listen aber beim Aufbau. Eine ehrliche kleine Antwort ist
      // billiger als ein Sonderfall in tool.js.
      case 'wi_sets_list':
        return { ok: true, chosen: [], sets: [
          { id: 'p1', title: 'Schule',  count: 30, level: '5/6', mine: '0' },
          { id: 'p2', title: 'Zuhause', count: 30, level: '5/6', mine: '0' },
          { id: 'p3', title: 'Essen',   count: 30, level: '5/6', mine: '0' }
        ] };

      case 'wi_hard_words':
        return { ok: true, words: [] };

      default:
        return { ok: false, error: 'not_allowed' };
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Kachel-Standbild
     ═══════════════════════════════════════════════════════════
     Ein leichter Nachbau, keine laufende Anwendung: dieselbe
     Insel, ein paar Felder schon in Farbe, die Lichtpunkte an. In
     einer 320 px breiten Kachel muss das aus zwei Metern noch als
     „Insel im Nebel" lesbar sein — mehr soll es nicht.          */
  const TEAM_FILL = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

  function tileHTML() {
    const w = buildIsland(20260907);
    // Ein Standbild mitten im Spiel: jedes Volk hat sich ein Stück
    // vorgearbeitet, der größte Teil liegt noch im Nebel.
    const grow = (team, n) => {
      for (let i = 0; i < n; i++) {
        const mine = w.cells.filter(t => t.own === String(team));
        const cand = [];
        for (const m of mine) {
          for (const [nr, nc] of neighbors(m.r, m.c)) {
            const t = w.at.get(nr + '/' + nc);
            if (t && t.own === '.') cand.push(t);
          }
        }
        if (!cand.length) return;
        cand.sort((a, b) => (b.ruin - a.ruin) || (a.d - b.d));
        cand[0].own = String(team);
      }
    };
    [9, 7, 8, 5].forEach((n, i) => grow(i, n));

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const t of w.cells) {
      minX = Math.min(minX, cxOf(t.r, t.c)); maxX = Math.max(maxX, cxOf(t.r, t.c));
      minY = Math.min(minY, cyOf(t.r));      maxY = Math.max(maxY, cyOf(t.r));
    }
    const pad = 1;
    const hex = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (30 + 60 * k);
      hex.push([Math.cos(a) / Math.sqrt(3), Math.sin(a) / Math.sqrt(3)]);
    }

    const cellsSvg = w.cells.map(t => {
      const x = cxOf(t.r, t.c), y = cyOf(t.r);
      const fill = t.own === '.' ? '#3c5766' : TEAM_FILL[+t.own];
      return `<polygon points="${hex.map(([dx, dy]) => `${(x + dx).toFixed(2)},${(y + dy).toFixed(2)}`).join(' ')}"
                       fill="${fill}" stroke="rgba(0,0,0,.18)" stroke-width=".03"/>`;
    }).join('');

    const ruinSvg = w.cells.filter(t => t.ruin > 0).map(t =>
      `<circle cx="${cxOf(t.r, t.c).toFixed(2)}" cy="${cyOf(t.r).toFixed(2)}"
               r="${(0.13 + 0.05 * t.ruin).toFixed(2)}" fill="#ffcf4d" opacity=".8"/>`).join('');

    return `
      <div class="tprev tprev--wi">
        <svg viewBox="${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)}
                      ${(maxX - minX + 2 * pad).toFixed(2)} ${(maxY - minY + 2 * pad).toFixed(2)}"
             preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          ${cellsSvg}${ruinSvg}
        </svg>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     Die Vorstellung
     ═══════════════════════════════════════════════════════════ */
  function view() {
    reset();
    return {
      role: ROLE,
      room: { title: 'Myth of Wordisland', settings: {} },
      state: { phase: 1, data: {} },
      limits: {},
      me: { may_write: true },
      entries: []
    };
  }

  async function play(api) {
    // Das Werkzeug holt seinen Stand selbst (tick in tool.js) — erst
    // wenn die Karte steht, hat das Drehbuch etwas zu bewegen.
    if (!await api.waitFor('.wi-map .wi-cell', 5000)) return;
    if (!await api.wait(900)) return;

    for (let i = 0; i < 60; i++) {
      // Reihum, aber nicht gleichmäßig: ein Volk, das gerade läuft,
      // zieht mehrere Felder hintereinander — genau so sieht eine
      // Serie am Beamer aus.
      const team = i % TEAMS;
      const zug = 1 + (i % 3 === 0 ? 1 : 0);
      for (let k = 0; k < zug; k++) advance(team);
      api.refresh();
      if (!await api.wait(420)) return;
    }

    if (!await api.wait(1200)) return;
    reset();
    api.refresh();
    await api.wait(900);
  }

  window.MPPreview.register('wordisland', {
    role: ROLE,
    view, play, tile: tileHTML, server,

    /* Breitere Bühne wie bei Kingdoms: die Völkerleiste steht über
       der Karte, und im Regelmaß rutschen bei vier Völkern zwei
       davon in eine zweite Zeile — dann bleibt für die Insel kaum
       mehr als ein Streifen. */
    wide: true,

    /* Abblenden zwischen zwei Durchgängen: beim Zurücksetzen fallen
       sechzig Felder auf einen Schlag in den Nebel zurück, und das
       sähe mitten in der Bewegung nach Fehler aus statt nach
       Anfang. */
    fade: true,

    blurb: `
      <p>Zwei bis sechs Völker landen mit ihren Schiffen rundum an einer
         <strong>vernebelten Insel</strong>. Jede gekonnte Vokabel lüftet ein Feld am
         eigenen Rand — die Klasse tippt auf den Tablets, an der Wand wächst das Land.</p>
      <p>Wer <strong>drei richtige in Folge</strong> hat, würfelt nicht mehr, sondern zeigt
         selbst, wohin es geht — und steuert auf die Lichtpunkte zu, die von Anfang an
         durch den Nebel schimmern. Dort liegen <strong>Ruinen</strong>: sie zählen extra,
         sind zur Inselmitte hin wertvoller und wechseln mit dem Feld den Besitzer.
         Ist der Nebel weg, hört das Spiel nicht auf — dann nimmt man sich Land.</p>
      <p>Getippt wird mit Hilfe statt mit rotem Stift: Wer <em>fast</em> richtig schreibt,
         bekommt die <strong>Schreibweisen desselben Wortes</strong> zur Auswahl — die eigene
         Fassung mitten darunter. Wer daneben liegt, bekommt acht Wörter. So trennt sich
         „kann ich, schreib ich falsch“ von „kenn ich nicht“, und hinterher zeigt das Pult,
         welche Wörter der Klasse am häufigsten durchgegangen sind.</p>
      <p>Die Vokabeln kommen aus <strong>mitgelieferten Units</strong> oder aus einer eigenen
         Liste, die in zwei Minuten eingefügt ist: eine Zeile je Wortpaar.</p>`
  });
})();
