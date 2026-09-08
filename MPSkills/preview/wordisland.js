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
     Ein leichter Nachbau, keine laufende Anwendung — aber seit dem
     Umbau der Karte (08.09.2026) einer im RICHTIGEN Kleid: Relief
     und Tonstufen-Nebel. Die Kachel wirbt sonst mit einer Optik,
     die es im Raum nicht mehr gibt, und das fällt genau dann auf,
     wenn jemand zum ersten Mal draufklickt.

     Was hier NICHT nachgebaut wird, sind die Filter: kein
     Wolkenrand, keine Rauschschlieren, keine Brandung. In einer
     320 px breiten Kachel mit 250 Feldern ist eine Kachelkante
     einen Pixel breit — die Sechseckstufen im Nebelrand sieht
     dort niemand, drei Turbulenzen je Aufruf der Startseite
     bezahlt aber jeder. Was bleibt, ist das, was aus zwei Metern
     trägt: einfarbig tiefes Wasser, Land mit Höhe, eine helle
     Nebelmasse, die zum Rand hin durchsichtig wird, und die
     Lichtpunkte der besonderen Orte.

     Die Zahlen (Höhen, Töne, Farben) sind dieselben wie in
     tools/wordisland/tool.js. Wer sie dort dreht, sollte sie hier
     mitdrehen — sonst wirbt die Kachel für eine andere Insel.  */
  const TEAM_FILL = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];
  const LAND = { sand: '#e3cf9c', gras: '#7fae5c', wald: '#4a8449', fels: '#9aa6ac' };
  const SEA_DEEP = '#052131';
  const FOG_BODY = '#e4eef5';
  /* Zieltöne von außen nach innen — und daraus die Deckung der
     gestapelten Schichten: von .55 auf .82 zu kommen kostet nicht
     .82, sondern .60. Dieselbe Rechnung wie stufenDeckung() im
     Werkzeug. */
  const FOG_TOENE = [.55, .82, 1];

  const hx = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return rgb([0, 1, 2].map(i => A[i] + (B[i] - A[i]) * t)); };
  const shade = (h, amt) => rgb(hx(h).map(c => c * (1 + amt)));

  function tileHTML() {
    const w = buildIsland(20260907);
    /* Ein Standbild mitten im Spiel — und zwar in der zweiten
       Hälfte. Bei zehn eroberten Feldern wäre die Kachel eine
       weiße Fläche mit vier bunten Punkten; die Karte hat aber
       nur dann etwas zu zeigen, wenn Land UND Nebel darauf sind. */
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
    /* Ein Drittel erobert. Die Zahlen sind nachgezählt und nicht
       geschätzt: die Völker fressen sich zur Mitte vor, und ab
       etwa der Hälfte ist der Nebel nur noch ein Ring — dann hat er
       keinen Kern mehr, und die Tonstufen zeigen genau das, was
       sie ausmacht, nicht mehr. Bei einem Drittel bleiben 99 Felder
       Nebel mit 30 im zweiten Ring und einem geschlossenen Kern. */
    [14, 11, 13, 9].forEach((n, i) => grow(i, n));

    /* Abstand zum Wasser (Breitensuche von der Küste) — daraus
       Strand und Höhe, genau wie im Werkzeug. */
    for (const t of w.cells) t.rand = 1e9;
    let front = w.cells.filter(t => neighbors(t.r, t.c).some(([nr, nc]) => !w.isLand(nr, nc)));
    front.forEach(t => { t.rand = 1; });
    while (front.length) {
      const next = [];
      for (const t of front) for (const [nr, nc] of neighbors(t.r, t.c)) {
        const n = w.at.get(nr + '/' + nc);
        if (n && n.rand > t.rand + 1) { n.rand = t.rand + 1; next.push(n); }
      }
      front = next;
    }
    for (const t of w.cells) {
      const x = cxOf(t.r, t.c), y = cyOf(t.r);
      const n1 = (Math.sin(x * .62) + Math.sin(y * .71) + Math.sin((x + y) * .43)) / 3;
      t.boden = t.rand <= 1 ? 'sand'
              : (t.rand === 2 && n1 > .05) ? 'sand'
              : n1 > .34 ? 'wald'
              : 'gras';
    }

    /* Nebeltiefe: 1 = Randfeld (mindestens ein Nachbar ist nicht
       verhüllt — auch das offene Meer zählt). */
    const fog = w.cells.filter(t => t.own === '.');
    const drin = new Set(fog);
    const tiefe = new Map();
    let f2 = fog.filter(t => neighbors(t.r, t.c).some(([nr, nc]) => {
      const n = w.at.get(nr + '/' + nc); return !n || !drin.has(n);
    }));
    f2.forEach(t => tiefe.set(t, 1));
    while (f2.length) {
      const next = [];
      for (const t of f2) for (const [nr, nc] of neighbors(t.r, t.c)) {
        const n = w.at.get(nr + '/' + nc);
        if (!n || !drin.has(n) || tiefe.has(n)) continue;
        tiefe.set(n, tiefe.get(t) + 1); next.push(n);
      }
      f2 = next;
    }

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
    const hexPath = (x, y, s) =>
      hex.map(([dx, dy], i) => (i ? 'L' : 'M') + (x + dx * s).toFixed(2) + ' ' + (y + dy * s).toFixed(2)).join('') + 'Z';

    /* Die Säulen, von hinten nach vorn — sonst steht eine hintere
       Säule vor einer vorderen. */
    const cellsSvg = w.cells.slice().sort((a, b) => (a.r - b.r) || (a.c - b.c)).map(t => {
      const x = cxOf(t.r, t.c), y0 = cyOf(t.r);
      const on = t.own !== '.';
      const stufe = t.boden === 'sand' ? .20 : t.rand === 2 ? .40 : .56;
      const h = on ? stufe : .10;
      const y = y0 - h + .1;
      const deck = on
        ? mix(LAND[t.boden], TEAM_FILL[+t.own], .5 * (t.boden === 'sand' ? .62 : 1))
        : LAND[t.boden];
      const seite = on ? shade(deck, -.45) : shade(LAND[t.boden], -.5);
      /* Die Seitenfläche: der untere Rand des Sechsecks, um die
         Höhe nach unten verlängert (Ecken 2, 1, 0). */
      const p = [2, 1, 0].map(i => [x + hex[i][0], y + hex[i][1]]);
      const side = 'M' + p.map(([a, b]) => `${a.toFixed(2)} ${b.toFixed(2)}`).join('L')
        + 'L' + p.slice().reverse().map(([a, b]) => `${a.toFixed(2)} ${(b + h + .06).toFixed(2)}`).join('L') + 'Z';
      return `<path d="${side}" fill="${seite}"/>`
           + `<path d="${hexPath(x, y, 1)}" fill="${deck}" stroke="rgba(0,0,0,.16)" stroke-width=".015"/>`;
    }).join('');

    /* Der Nebel in drei gestapelten Schichten: die unterste deckt
       alles, jede weitere nur noch, was tiefer liegt. Am Rand
       schimmert dadurch das Land durch. */
    let vor = 0;
    const fogSvg = FOG_TOENE.map((ton, i) => {
      const deck = vor >= 1 ? 1 : (ton - vor) / (1 - vor);
      vor = ton;
      const d = fog.filter(t => i === 0 || (tiefe.get(t) || 99) > i)
        .map(t => hexPath(cxOf(t.r, t.c), cyOf(t.r), 1.06)).join('');
      return `<path d="${d}" fill="${FOG_BODY}" opacity="${deck.toFixed(2)}"/>`;
    }).join('');

    const ruinSvg = w.cells.filter(t => t.ruin > 0).map(t =>
      `<circle cx="${cxOf(t.r, t.c).toFixed(2)}" cy="${cyOf(t.r).toFixed(2)}"
               r="${(0.16 + 0.06 * t.ruin).toFixed(2)}" fill="#ffbe2e" opacity=".75"/>`).join('');

    return `
      <div class="tprev tprev--wi">
        <svg viewBox="${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)}
                      ${(maxX - minX + 2 * pad).toFixed(2)} ${(maxY - minY + 2 * pad).toFixed(2)}"
             preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect x="${(minX - pad - 4).toFixed(2)}" y="${(minY - pad - 4).toFixed(2)}"
                width="${(maxX - minX + 2 * pad + 8).toFixed(2)}"
                height="${(maxY - minY + 2 * pad + 8).toFixed(2)}" fill="${SEA_DEEP}"/>
          ${cellsSvg}${fogSvg}${ruinSvg}
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
