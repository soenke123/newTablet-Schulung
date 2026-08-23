/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Kingdoms of Mathoria" (intern: clash-of-math)
   ══════════════════════════════════════════════════════════════
   Hieß bis Migration 0095 „Clash of Math" — nur der Anzeigename hat
   sich geändert (siehe 0095). Ordner, tools.js-Eintrag und alle
   clash_*-RPC-Namen bleiben bewusst 'clash-of-math': der technische
   Schlüssel zieht nicht mit, das wäre eine eigene Aufräum-Migration.

   Vierter Skill, erster im Fach „Mathematik", und der erste, der
   NICHT über die generische Inhaltsschicht (0080/0086/0087) läuft —
   Clash of Math bringt eigene Tabellen und eigene RPC-Namen mit
   (Migration 0093). Wie jedes Werkzeug EIN Modul für beide Rollen
   (ctx.role unterscheidet Teilnehmer/Beamer), aber weil die
   generischen Verben (upsert/vote/…) hier keine Rolle spielen,
   benutzt dieses Werkzeug ausschließlich `ctx.actions.call(fn, args)`
   — den generischen Durchreich-Baustein aus lib/tool.js, der Token
   bzw. Code automatisch mitgibt, ohne dass lib/tool.js einen
   Clash-RPC-Namen kennen müsste.

   ── Eigener Takt statt der Seiten-Aktualisierung ───────────────
   Der Aufrufer (j.js/lehrer.js) pollt bereits die GENERISCHEN RPCs
   (skill_view/skill_room_get) und ruft update(view) bei jeder
   Änderung — aber solange Clash nichts an der generischen Schicht
   anfasst, ändert sich deren Signatur während einer laufenden Runde
   kaum. Dieses Werkzeug führt deshalb SEINEN EIGENEN, unabhängigen
   Takt: eine billige Signatur (clash_sig/clash_room_sig) alle paar
   Sekunden als Sicherheitsnetz, plus einen Realtime-Broadcast-Kanal
   als schnellen Weg — jede erfolgreiche Eroberung sendet ein „jetzt
   nachfragen"-Signal an alle im selben Raum, OHNE dass der Inhalt des
   Broadcasts selbst als Wahrheit gilt (das bleibt ausschließlich die
   RPC-Antwort). Ein verpasstes oder gefälschtes Broadcast-Event kostet
   höchstens einen überflüssigen Abruf, nie einen falschen Spielstand.

   ── Grundgerüst-Umfang ──────────────────────────────────────────
   Team-Zuordnung (Vorschau vor dem Start), Board-Erzeugung, 5s-
   Countdown, einfache Addition bis 100, Eroberung, Elimination
   (Zuschauer-Platzhalter), Sieg. Platzhalterfarben statt der acht
   Fraktionsbilder im Ordner — die kommen mit Sönkes Ausbau-Punkt 1.

   ── Fixes aus dem ersten Feature-Feedback (Migration 0094) ──────
   (1) Rundenende auf Zeit (5s Test / 1..5 Min, siehe cmTimerSet/
       cmTimerRun) — Sieger ist dann, wer die meisten Felder besitzt.
   (2) Die Beamer-Karte füllt den freien Platz (fitPresenterMap,
       body.tool-fill) statt an einer festen Breite zu stehen — der
       Teilnehmer behält seine begrenzte Karte in der Seite.
   (3) Die Tastatur bleibt beim Antworten offen (onSubmit fokussiert
       das Feld direkt nach dem Absenden erneut).
   (4) Team-Zuordnung hängt an „online" (last_seen_at < 90s, wie
       0079) statt an „dem Raum zugeordnet" — reine Server-Änderung
       (0094), hier nichts Neues außer den online_count/room_total-
       Feldern in der Lobby-Anzeige.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const TEAM_NAMES  = ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Türkis', 'Magenta', 'Rosa'];
  const TEAM_FILL   = ['rgba(239,68,68,.75)', 'rgba(59,130,246,.75)', 'rgba(16,185,129,.75)',
                       'rgba(245,158,11,.75)', 'rgba(168,85,247,.75)', 'rgba(6,182,212,.75)',
                       'rgba(217,70,160,.75)', 'rgba(244,114,182,.75)'];
  const TEAM_STROKE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b',
                       '#a855f7', '#06b6d4', '#d946a0', '#f472b6'];

  const teamName  = i => TEAM_NAMES[i] ?? ('Team ' + (i + 1));
  const teamFill  = i => TEAM_FILL[i]  ?? '#9994';
  const teamStroke = i => TEAM_STROKE[i] ?? '#999';

  /* ── Kingdoms of Mathoria: Fraktionsgrafiken (Beamer) ─────────────
     Reihenfolge deckungsgleich mit TEAM_NAMES/TEAM_STROKE — Team-
     Index 0..7 ist zugleich der Index in diesen Listen. ASSET_DIR ist
     absichtlich der volle Pfad ab MPSkills/ (nicht „sprites/…"): ein
     in tool.js gebautes <img src> wird relativ zur SEITE aufgelöst
     (lehrer.html/j.html liegen in MPSkills/), nicht relativ zu
     tool.js selbst — anders als url(...) in tool.css, das relativ zur
     Stylesheet-Datei auflöst. */
  const ASSET_DIR = 'tools/clash-of-math/sprites/';
  const FACTION_CASTLE = ['red carstle.png', 'blue carstle.png', 'green carstle.png', 'yellow carstle.png',
                           'lila carstle.png', 'türkis carstle.png', 'magenta carstle.png', 'rosa carstle.png'];
  const FACTION_UNIT   = ['red units.png', 'blue units.png', 'green units.png', 'yellow units.png',
                           'lila units.png', 'türkis units.png', 'magenta units.png', 'rosa units.png'];
  // Der Name des Volkes. Er hat die Farbbezeichnung („Rot", „Blau")
  // als Anzeigename abgelöst: das Panel TRÄGT die Farbe, sie muss
  // nicht auch noch danebenstehen.
  const FACTION_LABEL  = ['Toast-Ritter', 'Robo-Enten', 'Brokkoli-Giraffen', 'Mal-Hasen',
                           'Kosmische Katzen', 'Okto-Pferdchen', 'Spuk-Einhorn', 'Wolkenvogel-Piraten'];
  const esrc = name => encodeURI(ASSET_DIR + name);
  const factionLabel = i => FACTION_LABEL[i] ?? '';

  let root = null, ctx = null, role = null;
  let els = {};
  let pollTimer = null, countdownTimer = null, matchTimerHandle = null, resizeObs = null, onWinResize = null;
  let channel = null, channelKey = null;
  let lastSig = null, lastView = null, busy = false, destroyed = false;
  let submitting = false;
  let matchEndsAtMs = 0, matchPeakMs = 1;

  const MAP_GAP = 12, MAP_MIN = 260, MAP_MAX = 2000;
  // Grenzen für die Völker-Spalten. Ihre Breite ergibt sich sonst aus
  // dem, was das Spielfeld übrig lässt (siehe fitPresenterMap) — unter
  // ROSTER_MIN wären die Namen nicht mehr lesbar, über ROSTER_MAX
  // sähen die Panels aufgeblasen aus.
  const ROSTER_MIN = 168, ROSTER_MAX = 430;

  // Höhe der Figuren, in Vielfachen des Sechseck-Radius. Sie stehen
  // mit den Füßen auf dem Kachel-Mittelpunkt und ragen deshalb über
  // ihre Kachel hinaus — die Burg deutlich, damit sie als Hauptstadt
  // liest, die Einheiten knapp, damit sie das Feld nicht zustellen.
  const CASTLE_H = 2.22;
  const UNIT_H   = 1.28;
  // Die Burg rutscht um diesen Anteil IHRER EIGENEN Höhe nach unten,
  // sitzt also tiefer in ihrer Kachel statt nur darauf zu stehen.
  // Der Wert geht als `--drop` ins style-Attribut; die Verschiebung
  // rechnet tool.css daraus. Er steht bewusst nur hier, weil die
  // Kopffreiheit unten davon abhängt.
  const CASTLE_DROP = 0.20;
  // Was die Burg nach dem Absacken noch über den Kachel-Mittelpunkt
  // ragt — genau so viel Platz muss boardExtent über der obersten
  // Kachelreihe frei lassen, sonst wird sie oben abgeschnitten.
  const CASTLE_HEADROOM = CASTLE_H * (1 - CASTLE_DROP);

  /* ─── Hex-Zeichnen ──────────────────────────────────────────
     Dieselbe Geometrie wie im Prototyp (versetzte Reihen, spitze
     Hexagone) — hier aber ein einmaliges Zeichnen je Aktualisierung
     statt einer requestAnimationFrame-Schleife: das Board ändert
     sich höchstens ein paarmal pro Sekunde, nicht 60×. */
  function paintBoard(canvas, view, opts) {
    if (!canvas || !view || !view.rows || !view.cols) return;
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, rect.width, rect.height);

    const rows = view.rows, cols = view.cols;
    const hexRadius = Math.min(
      rect.width  / ((cols + 0.5) * Math.sqrt(3)),
      rect.height / ((rows + 0.5) * 1.5)
    );
    const hexWidth  = Math.sqrt(3) * hexRadius;
    const hexHeight = 2 * hexRadius;
    const center = (r, c) => {
      const xOff = (r % 2 === 1) ? hexWidth / 2 : 0;
      return {
        x: (c + 0.5) * hexWidth + xOff + (rect.width  - cols * hexWidth) / 2,
        y: (r + 0.5) * (hexHeight * 0.75) + (rect.height - rows * hexHeight * 0.75) / 2
      };
    };

    const mine = opts && opts.highlightTeam;
    (view.tiles || []).forEach(t => {
      const p = center(t.r, t.c);
      const isMine = (mine != null && t.team === mine);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - (Math.PI / 6);
        const hx = p.x + (hexRadius - 1.5) * Math.cos(angle);
        const hy = p.y + (hexRadius - 1.5) * Math.sin(angle);
        if (i === 0) g.moveTo(hx, hy); else g.lineTo(hx, hy);
      }
      g.closePath();
      g.fillStyle = teamFill(t.team);
      g.fill();
      g.lineWidth = t.castle ? 3 : (isMine ? 2.5 : 1);
      g.strokeStyle = isMine ? '#ffffff' : teamStroke(t.team);
      g.stroke();
      if (t.castle) {
        g.font = Math.max(10, Math.round(hexRadius * 0.9)) + 'px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('🏰', p.x, p.y);
      }
    });
  }

  /* ─── Beamer: Kingdoms of Mathoria — echte Fraktionsgrafiken ────
     Ersetzt paintBoard() (Canvas, Platzhalterfarben) NUR für die
     Lehrkraft-Rolle durch DOM/SVG: Sechsecke + Territoriumsgrenze
     als <svg>, Burg + ein paar wandernde Einheiten je Fraktion als
     <img> im Icon-Layer darüber. Der Teilnehmer behält vorerst
     paintBoard() (eigene Runde, siehe Kopfkommentar der Datei).

     Zwei Lehren aus dem Showroom (MPSkills/tools/clash-of-math/
     showroom.html, dort ausführlich dokumentiert):
     (1) Zentrierung (translate(-50%,-100%), unten-mittig) und
         Wander-Animation dürfen NICHT beide auf derselben
         `transform`-Eigenschaft desselben Elements sitzen — eine
         CSS-Animation ersetzt `transform` komplett, statt sich mit
         dem statischen Wert zu kombinieren. Deshalb zwei
         verschachtelte Elemente: cm-sprite (Position, statisch) und
         cm-spriteinner (Animation).
     (2) Die Territoriumsgrenze kommt aus den echten Nachbarschafts-
         kanten (Winkel zum Nachbar-Kachelmittelpunkt), nicht aus
         einer angenommenen Reihenfolge der Nachbar-Richtungen. */
  function computeBorderSegments(tiles, centerFn, hexR) {
    const ownerMap = new Map();
    tiles.forEach(t => ownerMap.set(t.r + ',' + t.c, t.team));
    const dirsEven = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    const dirsOdd  = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
    const segsByTeam = {};
    tiles.forEach(t => {
      const dirs = (t.r % 2 === 1) ? dirsOdd : dirsEven;
      const p = centerFn(t.r, t.c);
      dirs.forEach(d => {
        const nr = t.r + d[0], nc = t.c + d[1];
        const neighborTeam = ownerMap.get(nr + ',' + nc);
        if (neighborTeam === t.team) return;
        const np = centerFn(nr, nc);
        const angleDeg = Math.atan2(np.y - p.y, np.x - p.x) * 180 / Math.PI;
        let edgeIdx = Math.round(angleDeg / 60);
        edgeIdx = ((edgeIdx % 6) + 6) % 6;
        const a1 = Math.PI / 3 * edgeIdx - Math.PI / 6;
        const a2 = Math.PI / 3 * (edgeIdx + 1) - Math.PI / 6;
        const v1 = { x: p.x + hexR * Math.cos(a1), y: p.y + hexR * Math.sin(a1) };
        const v2 = { x: p.x + hexR * Math.cos(a2), y: p.y + hexR * Math.sin(a2) };
        (segsByTeam[t.team] = segsByTeam[t.team] || []).push([v1, v2]);
      });
    });
    return segsByTeam;
  }

  function borderLayerHTML(segsByTeam) {
    let out = '';
    Object.keys(segsByTeam).forEach(team => {
      const d = segsByTeam[team].map(s =>
        'M' + s[0].x.toFixed(1) + ',' + s[0].y.toFixed(1) + ' L' + s[1].x.toFixed(1) + ',' + s[1].y.toFixed(1)
      ).join(' ');
      const raw = teamStroke(parseInt(team, 10));
      out += '<path class="cm-border" d="' + d + '" style="--raw:' + raw + '"></path>';
      out += '<path class="cm-border cm-border--inner" d="' + d + '" style="--raw:' + raw + '"></path>';
    });
    return out;
  }

  /* ─── Ausdehnung des Spielfelds, in Vielfachen von hexR ──────────
     Die Layouts aus clash_layouts (0093) füllen ihr rows×cols-Raster
     nie ganz aus — sie sind aus einem Vieleck geschnitten, je nach
     Team-Zahl mit unterschiedlich viel Luft am Rand. Wer auf das
     ganze Raster mittet, verschenkt diese Luft doppelt: das Feld
     sitzt außermittig UND bleibt kleiner als nötig.

     Das Ergebnis dient zwei Zwecken: `renderPresenterMap` passt das
     Feld darauf ein, und `fitPresenterMap` holt sich daraus das
     Seitenverhältnis — die Karte ist deshalb NICHT mehr quadratisch,
     sondern so breit wie das Feld es will. Ein breites Feld nimmt
     damit die volle Höhe UND die volle Breite ein, statt an der
     kürzeren Seite eines Quadrats zu verhungern.

     Oben ist mehr Platz nötig als unten: die Burg ist 1,55·hexR hoch
     und steht mit den Füßen auf dem Kachel-Mittelpunkt, ragt also
     über ihre Kachel hinaus (der Volksname darüber darf bewusst ein
     Stück über den Kartenrand ragen — so auch im Showroom). */
  const SQ3 = Math.sqrt(3);
  const hexUnit = (r, c) => ({
    x: (c + 0.5) * SQ3 + (r % 2 === 1 ? SQ3 / 2 : 0),
    y: (r + 0.5) * 1.5
  });

  function boardExtent(tiles) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    tiles.forEach(t => {
      const u = hexUnit(t.r, t.c);
      if (u.x < minX) minX = u.x;
      if (u.x > maxX) maxX = u.x;
      if (u.y < minY) minY = u.y;
      if (u.y > maxY) maxY = u.y;
    });
    minX -= SQ3 / 2; maxX += SQ3 / 2;   // halbe Kachelbreite links/rechts
    minY -= CASTLE_HEADROOM;             // Kopffreiheit für die Burg
    maxY += 1.0;                         // halbe Kachelhöhe unten
    return {
      minX: minX, minY: minY,
      spanX: Math.max(0.001, maxX - minX),
      spanY: Math.max(0.001, maxY - minY)
    };
  }

  function groundGlowHTML(p, size, raw) {
    return '<div class="cm-groundglow" style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + size + 'px;height:' + (size * 0.55) + 'px;--raw:' + raw + '"></div>';
  }

  function renderPresenterMap(view) {
    if (!view || !view.rows || !view.cols || !els.mapWrap || !els.hexsvg || !els.icons) return;
    const W = els.mapWrap.clientWidth, H = els.mapWrap.clientHeight;
    if (W < 10 || H < 10) return;
    const tiles = view.tiles || [];
    if (!tiles.length) { els.hexsvg.innerHTML = ''; els.icons.innerHTML = ''; return; }
    const gap = 2.5;

    /* ─── Auf die BELEGTEN Felder einpassen, nicht auf das Raster ──
       Die Spielfelder aus clash_layouts (0093) füllen ihr rows×cols-
       Raster nie ganz aus — sie sind aus einem Vieleck geschnitten,
       je nach Team-Zahl mit unterschiedlich viel Luft an den Rändern.
       Wer auf das ganze Raster mittet, verschenkt diese Luft doppelt:
       das Feld sitzt außermittig UND bleibt kleiner als nötig. Deshalb
       erst das Umfassungsrechteck der tatsächlichen Kacheln in
       Einheiten von hexR bestimmen, dann darauf einpassen.

       Oben ist mehr Platz nötig als unten: die Burg ist 1,55·hexR hoch
       und steht mit den Füßen auf dem Kachel-Mittelpunkt, ragt also
       über ihre Kachel hinaus (der Teamname darüber darf bewusst ein
       Stück über den Kartenrand ragen — so auch im Showroom). */
    const ext = boardExtent(tiles);
    const hexR = Math.min(W / ext.spanX, H / ext.spanY);
    const offX = (W - ext.spanX * hexR) / 2, offY = (H - ext.spanY * hexR) / 2;
    const center = (r, c) => {
      const u = hexUnit(r, c);
      return { x: (u.x - ext.minX) * hexR + offX, y: (u.y - ext.minY) * hexR + offY };
    };

    let poly = '';
    tiles.forEach(t => {
      const p = center(t.r, t.c);
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i - Math.PI / 6;
        pts.push((p.x + (hexR - gap) * Math.cos(a)).toFixed(1) + ',' + (p.y + (hexR - gap) * Math.sin(a)).toFixed(1));
      }
      poly += '<polygon class="cm-hex" points="' + pts.join(' ') + '" style="--raw:' + teamStroke(t.team) + '"></polygon>';
    });
    const segs = computeBorderSegments(tiles, center, hexR - Math.min(gap, 1));
    els.hexsvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    els.hexsvg.innerHTML = poly + borderLayerHTML(segs);

    const byTeam = {};
    tiles.forEach(t => (byTeam[t.team] = byTeam[t.team] || []).push(t));
    let icons = '';
    Object.keys(byTeam).forEach(teamKey => {
      const team = parseInt(teamKey, 10);
      const teamTiles = byTeam[teamKey];
      const raw = teamStroke(team);
      const castleTile = teamTiles.find(t => t.castle);
      if (castleTile) {
        const p = center(castleTile.r, castleTile.c);
        const h = hexR * CASTLE_H, glow = hexR * 1.7;
        const z = 1000 + castleTile.r * 10 + 9;
        icons += groundGlowHTML(p, glow, raw);
        icons += '<div class="cm-sprite" style="left:' + p.x + 'px;top:' + p.y + 'px;height:' + h + 'px;' +
          '--drop:' + (CASTLE_DROP * 100) + '%;z-index:' + z + '">' +
          '<div class="cm-spriteinner cm-spriteinner--castle"><img src="' + esrc(FACTION_CASTLE[team] || FACTION_CASTLE[0]) + '" alt=""></div></div>';
        // KEINE Beschriftung über der Burg. Der Showroom hatte dort die
        // Farbbezeichnung („Rot", „Türkis") — die ist weg, seit das
        // Volk „Toast-Ritter" heißt und die Farbe allein die
        // Zugehörigkeit trägt. Der Volksname an ihrer Stelle ist
        // ausprobiert und wieder verworfen: bei acht Völkern stehen
        // die Burgen so dicht, dass „Spuk-Einhorn" und
        // „Wolkenvogel-Piraten" ineinanderlaufen. Identifiziert wird
        // ein Gebiet ohnehin doppelt — über die Farbe der Umrandung
        // und über dieselben Figuren, die auf dem Panel am Rand
        // stehen. Und was hier nicht steht, verdeckt keine Figur.
      }
      // Nicht jedes eroberte Feld bekommt eine eigene Einheit (bei 40+
      // Feldern wäre das nur noch Gewusel) — eine kleine, über das
      // Gebiet verteilte Auswahl reicht, um „lebendig" zu wirken.
      const others = teamTiles.filter(t => !t.castle).sort((a, b) => (a.r - b.r) || (a.c - b.c));
      const unitCount = Math.min(3, others.length);
      for (let k = 0; k < unitCount; k++) {
        const idx = Math.floor((k + 0.5) * others.length / unitCount);
        const t = others[idx];
        const p = center(t.r, t.c);
        const h = hexR * UNIT_H, glow = hexR * 0.94;
        icons += groundGlowHTML(p, glow, raw);
        icons += '<div class="cm-sprite" style="left:' + p.x + 'px;top:' + p.y + 'px;height:' + h + 'px;z-index:' + (1000 + t.r * 10 + 5) + '">' +
          '<div class="cm-spriteinner cm-spriteinner--unit" style="animation-delay:' + (k * 0.5) + 's"><img src="' + esrc(FACTION_UNIT[team] || FACTION_UNIT[0]) + '" alt=""></div></div>';
      }
    });
    els.icons.innerHTML = icons;
  }

  /* ─── Beamer: Karte nimmt den ganzen freien Platz ───────────
     „Volles Bild" statt einer festen Kartenbreite, wie beim
     Teilnehmer — anders als NeuroLab/Cäsar aber kein Vollbild-
     Fenster mit Zoom/Pan, sondern ein möglichst großes Quadrat
     (Höhe UND Breite ausnutzen, nicht nur eine Achse). Dieselbe
     spaceBelow()-Rechnung wie dort — jetzt ein viertes Mal im
     Projekt (siehe MEMORY „spaceBelow() steht jetzt dreimal"). */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fitPresenterMap() {
    if (role !== 'presenter' || !els.boardWrap || !els.mapWrap) return;
    if (els.boardWrap.classList.contains('cm-hide')) return; // unsichtbar hat keine verlässlichen Maße
    const top = els.boardWrap.getBoundingClientRect().top;
    const h = Math.max(MAP_MIN, window.innerHeight - top - spaceBelow(els.boardWrap) - MAP_GAP);
    els.boardWrap.style.height = h + 'px';

    // Höhe: alles abziehen, was im Rahmen ÜBER und UNTER der Arena
    // steht (Kopfzeile, Timer-Leiste) plus die Polsterung von Kulisse
    // und Rahmen — sonst wächst die Karte über den Bildschirm hinaus.
    const padOf = el => {
      if (!el) return 0;
      const cs = getComputedStyle(el);
      return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
             (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    };
    const chrome = (els.boardTop ? els.boardTop.offsetHeight : 0) +
                   (els.timerBar ? els.timerBar.offsetHeight : 0) +
                   padOf(els.boardWrap) + padOf(els.frame);
    const availH = Math.max(160, h - chrome - MAP_GAP);

    /* ─── Breite: die VÖLKER-SPALTEN geben nach, nicht das Feld ────
       Drei Dinge sollen gleichzeitig gelten, und lange schienen sie
       sich zu widersprechen: die Spalten kleben am Bildschirmrand,
       der Spalt zwischen Spalte und Pergament ist schmal, und das
       Spielfeld füllt das Pergament ganz aus.

       Der Denkfehler der vorigen Anläufe war, dafür am RAHMEN zu
       drehen (mal auf volle Breite, mal auf Feldbreite geschrumpft) —
       beides lässt zwangsläufig irgendwo Luft, weil das Spielfeld
       sein Seitenverhältnis behalten muss und auf einem 16:9-Schirm
       immer die HÖHE zuerst ausgeht.

       Die Stellschraube ist stattdessen die SPALTENBREITE: erst das
       Feld auf die volle Höhe bringen (daraus folgt seine Breite),
       dann den Rest hälftig auf die beiden Spalten verteilen. Die
       Spalten sitzen dadurch weiter außen, das Pergament dazwischen
       ist exakt so breit wie das Feld — und die Panels bekommen
       nebenbei mehr Platz für die Namen. */
    const stageCS = getComputedStyle(els.boardWrap);
    const stagePadX = (parseFloat(stageCS.paddingLeft) || 0) + (parseFloat(stageCS.paddingRight) || 0);
    const innerW = els.boardWrap.clientWidth - stagePadX;
    const gapPx = parseFloat(stageCS.columnGap) || 0;
    let framePadX = 0;
    if (els.frame) {
      const fcs = getComputedStyle(els.frame);
      framePadX = (parseFloat(fcs.paddingLeft) || 0) + (parseFloat(fcs.paddingRight) || 0) +
                  (parseFloat(fcs.borderLeftWidth) || 0) + (parseFloat(fcs.borderRightWidth) || 0);
    }

    const tiles = (lastView && lastView.tiles) || [];
    const ratio = tiles.length ? (function () {
      const e = boardExtent(tiles);
      return e.spanX / e.spanY;
    })() : 1;

    // 1) Höhe ausreizen — daraus folgt die Breite des Felds.
    let mh = availH, mw = mh * ratio;
    // 2) Deckel: die Spalten dürfen dabei nicht unter ihre Mindest-
    //    breite gedrückt werden (schmaler Bildschirm, sehr breites
    //    Feld). Dann gibt ausnahmsweise doch das Feld nach.
    const maxMw = innerW - 2 * ROSTER_MIN - 2 * gapPx - framePadX;
    if (mw > maxMw) { mw = Math.max(160, maxMw); mh = mw / ratio; }
    mw = Math.max(160, Math.min(mw, MAP_MAX));
    mh = Math.max(160, Math.min(mh, MAP_MAX));

    // 3) Was übrig bleibt, gehört zu gleichen Teilen den Spalten.
    let rosterW = Math.floor((innerW - mw - 2 * gapPx - framePadX) / 2);
    rosterW = Math.max(ROSTER_MIN, Math.min(ROSTER_MAX, rosterW));
    if (els.rosterLeft)  els.rosterLeft.style.width  = rosterW + 'px';
    if (els.rosterRight) els.rosterRight.style.width = rosterW + 'px';

    els.mapWrap.style.width  = mw + 'px';
    els.mapWrap.style.height = mh + 'px';

    if (els.hexsvg && els.icons) renderPresenterMap(lastView);
  }

  /* ─── Rundenende-Timer (Anzeige) ─────────────────────────────
     Eigenständig von der 5s-Start-Countdown-Anzeige (startCountdown),
     die nur während phase='countdown' läuft — dieser Timer läuft nur
     während phase='running' und mit match_ends_at gesetzt. Die
     tatsächliche Phase kommt weiterhin ausschließlich vom Server
     (clash_maybe_advance_phase); hier wird nur mitgezählt. */
  function fmtMMSS(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function startMatchTimer(endsAtIso) {
    const endsAt = new Date(endsAtIso).getTime();
    // Neues Rundenende ⇒ neuer Nenner für den Ring (siehe renderRing).
    // Dasselbe Ende ⇒ weiterlaufen lassen, sonst würde der Ring bei
    // jedem Takt (8s Poll bzw. Broadcast) wieder auf „voll" springen.
    if (endsAt !== matchEndsAtMs) {
      matchEndsAtMs = endsAt;
      matchPeakMs = Math.max(1, endsAt - Date.now());
    }
    if (matchTimerHandle) return; // läuft schon, nur das Ende war neu
    const step = () => {
      const leftMs = matchEndsAtMs - Date.now();
      const txt = fmtMMSS(leftMs / 1000);
      if (role === 'presenter') {
        if (els.ring) els.ring.classList.remove('cm-hide');
        renderRing(leftMs / matchPeakMs, txt);
      }
      if (els.timeLeftP) { els.timeLeftP.textContent = '⏱ ' + txt; els.timeLeftP.classList.remove('cm-hide'); }
      if (leftMs <= 0) { stopMatchTimer(); tick(true); }
    };
    step();
    matchTimerHandle = setInterval(step, 500);
  }
  function stopMatchTimer() {
    if (matchTimerHandle) clearInterval(matchTimerHandle);
    matchTimerHandle = null;
    matchEndsAtMs = 0;
    if (els.ring) els.ring.classList.add('cm-hide');
    if (els.timeLeftP) els.timeLeftP.classList.add('cm-hide');
  }

  /* ─── Eigener Takt ──────────────────────────────────────────
     sig zuerst (billig), volle Ansicht nur bei Änderung — dasselbe
     Muster wie MPRoom.poll, nur unabhängig davon getaktet. */
  async function tick(force) {
    if (destroyed || busy) return;
    if (!force && document.hidden) return;
    busy = true;
    try {
      const sigFn = role === 'presenter' ? 'clash_room_sig' : 'clash_sig';
      const s = await ctx.actions.call(sigFn, {});
      if (destroyed) return;
      if (!s || !s.ok) return; // Netzfehler/room_gone: beim nächsten Takt erneut versuchen
      if (s.sig === lastSig && !force) return;

      const viewFn = role === 'presenter' ? 'clash_room_get' : 'clash_view';
      const v = await ctx.actions.call(viewFn, {});
      if (destroyed || !v || !v.ok) return;
      lastSig = s.sig;
      applyView(v);
    } finally {
      busy = false;
    }
  }

  function applyView(v) {
    lastView = v;
    ensureChannel(v.broadcast_key);
    if (role === 'presenter') renderPresenter(v); else renderParticipant(v);
  }

  /* ─── Broadcast: Signal, nicht Wahrheit ─────────────────────
     `self:false`, weil die eigene Antwort schon aus der RPC selbst
     kommt — ein zweiter Abruf für die eigene Aktion wäre doppelte
     Arbeit. Empfangen wird das Event nur als Anstoß, sofort
     nachzufragen; sein Inhalt wird nirgends gelesen. */
  function ensureChannel(key) {
    if (!key || !window.supabaseClient || channelKey === key) return;
    if (channel) {
      try { window.supabaseClient.removeChannel(channel); } catch (e) { /* egal */ }
    }
    channelKey = key;
    channel = window.supabaseClient.channel('clash:' + key, {
      config: { broadcast: { self: false } }
    });
    channel.on('broadcast', { event: 'move' }, () => tick(true));
    channel.subscribe();
  }

  function nudge() {
    if (!channel) return;
    try { channel.send({ type: 'broadcast', event: 'move', payload: {} }); }
    catch (e) { /* egal — der Sicherheits-Poll holt es nach */ }
  }

  /* ─── Countdown ─────────────────────────────────────────────
     Eigene 1s-Anzeige aus countdown_ends_at; sobald die Zeit um ist,
     wird nicht selbst umgeschaltet, sondern tick(true) angestoßen —
     die tatsächliche Phase kommt vom Server (clash_maybe_advance_phase). */
  function startCountdown(endsAtIso) {
    stopCountdown();
    const endsAt = new Date(endsAtIso).getTime();
    const step = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (els.countNum)  els.countNum.textContent  = String(left);
      if (els.countNumP) els.countNumP.textContent = String(left);
      if (left <= 0) { stopCountdown(); tick(true); }
    };
    step();
    countdownTimer = setInterval(step, 250);
  }
  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  /* ─── Team-Übersicht (Lobby) ─────────────────────────────────
     `teams` ist {team_index: anzahl} — als Objekt, weil jsonb_object_agg
     die Schlüssel als Zeichenketten liefert. */
  function rosterHTML(teams, teamCount, myTeam) {
    let out = '';
    for (let i = 0; i < teamCount; i++) {
      const n = (teams && teams[String(i)]) || 0;
      const mine = (myTeam === i) ? ' cm-rchip--mine' : '';
      out += `<span class="cm-rchip${mine}">` +
        `<span class="cm-dot" style="background:${teamStroke(i)}"></span>` +
        `${ctx.esc(teamName(i))} · ${n}</span>`;
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     Teilnehmer
     ══════════════════════════════════════════════════════════ */
  function buildParticipantDOM() {
    root.innerHTML =
      '<div class="cm-host">' +
        '<div class="cm-pane" id="cmLobby">' +
          '<p class="cm-lead">Dein vorläufiges Team: <b id="cmMyTeamName">…</b></p>' +
          '<div class="cm-roster" id="cmRoster"></div>' +
          '<p class="cm-hint" id="cmOnlineHint"></p>' +
          '<p class="cm-hint">Sobald deine Lehrkraft startet, geht es los.</p>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmCountdown">' +
          '<div class="cm-countdown">' +
            '<div class="cm-count" id="cmCountNum">5</div>' +
            '<p class="cm-hint">Gleich geht’s los …</p>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmGame">' +
          '<div class="cm-topbar">' +
            '<span class="cm-teampill" id="cmTeamPill"></span>' +
            '<span class="cm-streak" id="cmStreak">🔥 0</span>' +
            '<span class="cm-timeleft cm-hide" id="cmTimeLeftP"></span>' +
          '</div>' +
          '<div class="cm-mapwrap cm-mapwrap--sm"><canvas id="cmMiniMap"></canvas></div>' +
          '<div class="cm-question">' +
            '<div class="cm-q" id="cmQ">? + ? =</div>' +
            '<form id="cmForm" class="cm-form">' +
              '<input id="cmAnswer" type="number" inputmode="numeric" autocomplete="off" placeholder="Antwort" required>' +
              '<button type="submit">Absenden</button>' +
            '</form>' +
            '<div class="cm-feedback" id="cmFeedback"></div>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmOut">' +
          '<p class="cm-lead">Dein Team ist ausgeschieden.</p>' +
          '<p class="cm-hint">Du siehst weiter zu, wie es weitergeht.</p>' +
          '<div class="cm-mapwrap cm-mapwrap--sm"><canvas id="cmMiniMap2"></canvas></div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmEnded">' +
          '<div class="cm-result" id="cmResult"></div>' +
        '</div>' +
      '</div>';

    els = {
      lobby: root.querySelector('#cmLobby'),
      countdown: root.querySelector('#cmCountdown'),
      countNum: root.querySelector('#cmCountNum'),
      game: root.querySelector('#cmGame'),
      teamPill: root.querySelector('#cmTeamPill'),
      streak: root.querySelector('#cmStreak'),
      map: root.querySelector('#cmMiniMap'),
      q: root.querySelector('#cmQ'),
      form: root.querySelector('#cmForm'),
      answer: root.querySelector('#cmAnswer'),
      feedback: root.querySelector('#cmFeedback'),
      out: root.querySelector('#cmOut'),
      map2: root.querySelector('#cmMiniMap2'),
      ended: root.querySelector('#cmEnded'),
      result: root.querySelector('#cmResult'),
      myTeamName: root.querySelector('#cmMyTeamName'),
      roster: root.querySelector('#cmRoster'),
      onlineHint: root.querySelector('#cmOnlineHint'),
      timeLeftP: root.querySelector('#cmTimeLeftP')
    };

    els.form.addEventListener('submit', onSubmit);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const val = parseInt(els.answer.value, 10);
    if (!Number.isFinite(val)) return;
    submitting = true;
    els.answer.value = '';
    // Tastatur soll offen bleiben: manche virtuellen Tastaturen
    // schließen sich sonst, wenn das Feld per Enter/„Los" abgeschickt
    // und der Wert danach programmatisch geleert wird. Direkt danach
    // erneut fokussieren hält die Klasse im Frage-Antwort-Takt, ohne
    // dass jemand die Tastatur wieder von Hand öffnen muss.
    els.answer.focus({ preventScroll: true });
    const r = await ctx.actions.call('clash_submit_answer', { p_answer: val });
    submitting = false;
    els.answer.focus({ preventScroll: true });
    if (!r || !r.ok) {
      els.feedback.textContent = ctx.errText((r && r.error) || 'network');
      els.feedback.className = 'cm-feedback cm-feedback--warn';
      if (r && r.error === 'team_eliminated') tick(true);
      return;
    }
    if (r.correct === true) {
      els.feedback.textContent = r.captured ? '✅ Feld erobert!' : '✅ Richtig!';
      els.feedback.className = 'cm-feedback cm-feedback--ok';
      // Eigene Antwort ist Wahrheit — lokal patchen statt auf den
      // nächsten Takt zu warten, und die anderen anstoßen.
      if (lastView && r.captured) {
        const t = (lastView.tiles || []).find(x => x.r === r.captured.r && x.c === r.captured.c);
        if (t) t.team = lastView.me.team;
        paintBoard(els.map, lastView, { highlightTeam: lastView.me.team });
      }
      nudge();
    } else if (r.correct === false) {
      els.feedback.textContent = '❌ Leider nicht.';
      els.feedback.className = 'cm-feedback cm-feedback--warn';
    } else {
      els.feedback.textContent = '';
    }
    if (r.streak != null && els.streak) els.streak.textContent = '🔥 ' + r.streak;
    if (r.question && els.q) els.q.textContent = r.question.a + ' + ' + r.question.b + ' = ?';
  }

  function renderParticipant(v) {
    const teamCount = v.team_count;
    const myTeam = v.me.team;

    if (v.phase === 'lobby') {
      show('lobby');
      // myTeam ist für den Aufrufer selbst praktisch immer gesetzt
      // (wer clash_view gerade aufruft, ist per Definition online) —
      // die Prüfung ist trotzdem defensiv statt „Team NaN" anzuzeigen.
      if (myTeam == null) {
        els.myTeamName.textContent = '…';
      } else {
        els.myTeamName.textContent = teamName(myTeam);
        els.myTeamName.style.color = teamStroke(myTeam);
      }
      els.roster.innerHTML = rosterHTML(v.teams, teamCount, myTeam);
      if (els.onlineHint) {
        els.onlineHint.textContent = (v.online_count != null && v.room_total != null && v.room_total > v.online_count)
          ? `${v.online_count} von ${v.room_total} im Raum sind bereit (online).`
          : '';
      }
      return;
    }
    if (v.phase === 'countdown') {
      show('countdown');
      startCountdown(v.countdown_ends_at);
      return;
    }
    stopCountdown();
    stopMatchTimer();
    if (v.phase === 'ended') {
      show('ended');
      const won = v.winner_team === myTeam;
      els.result.innerHTML =
        `<b style="color:${teamStroke(v.winner_team)}">${ctx.esc(teamName(v.winner_team))} gewinnt!</b>` +
        `<p>${won ? 'Euer Team hat das Spielfeld erobert. 🎉' : 'Diesmal nicht — schaut euch an, wer gewonnen hat.'}</p>`;
      return;
    }
    // running
    if (!v.me.alive) {
      show('out');
      paintBoard(els.map2, v, { highlightTeam: myTeam });
      return;
    }
    show('game');
    els.teamPill.textContent = teamName(myTeam);
    els.teamPill.style.background = teamStroke(myTeam);
    els.streak.textContent = '🔥 ' + (v.me.streak || 0);
    if (v.match_ends_at) startMatchTimer(v.match_ends_at); else stopMatchTimer();
    if (v.me.question) els.q.textContent = v.me.question.a + ' + ' + v.me.question.b + ' = ?';
    paintBoard(els.map, v, { highlightTeam: myTeam });
  }

  function show(which) {
    ['lobby', 'countdown', 'game', 'out', 'ended'].forEach(k => {
      if (els[k]) els[k].classList.toggle('cm-hide', k !== which);
    });
    if (which !== 'countdown') stopCountdown();
  }

  /* ══════════════════════════════════════════════════════════
     Beamer / Lehrkraft
     ══════════════════════════════════════════════════════════ */
  function buildPresenterDOM() {
    root.innerHTML =
      '<div class="cm-host cm-host--presenter">' +
        '<div class="cm-pane" id="cmSetup">' +
          '<div class="cm-setup">' +
            '<div class="cm-setuprow">' +
              '<label>Teams: <input type="number" id="cmTeamCount" min="2" max="8" value="4"></label>' +
              '<button type="button" class="cm-btn" id="cmStartBtn">▶ Spiel starten</button>' +
            '</div>' +
            '<div class="cm-roster" id="cmRosterP"></div>' +
            '<p class="cm-hint" id="cmOnlineHintP"></p>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmCountdownP">' +
          '<div class="cm-countdown">' +
            '<div class="cm-count" id="cmCountNumP">5</div>' +
          '</div>' +
        '</div>' +
        // Der Spielbildschirm ist 1:1 der Aufbau aus dem Showroom,
        // Variante 03 „Kingdoms of Mathoria" (siehe showroom.html):
        // Kulisse (cm-stage) → Zierrahmen (cm-frame--board) mit
        // Wappenbanner → Kopfzeile mit Titel/Phase/Ring → Arena aus
        // Fraktionsliste LINKS, Karte MITTE, Fraktionsliste RECHTS.
        // Die Timer-Bedienung der Lehrkraft gibt es im Showroom nicht
        // (das war ein Standbild) — sie sitzt unter der Arena, wo sie
        // den Blick auf die Karte nicht zerschneidet.
        // Die beiden Völker-Spalten hängen NICHT im Rahmen, sondern
        // stehen als seine Geschwister links und rechts daneben — die
        // Bühne ist eine Flex-Reihe (tool.css). Die Reihenfolge hier
        // IST die Anordnung auf dem Bildschirm: links · Rahmen · rechts.
        '<div class="cm-pane cm-hide cm-stage" id="cmBoardWrap">' +
          '<div class="cm-roster cm-roster--left"  id="cmRosterLeft"></div>' +
          '<div class="cm-frame cm-frame--board" id="cmFrame">' +
            '<div class="cm-fantasytitle">⚔ Kingdoms of Mathoria ⚔</div>' +
            '<div class="cm-boardtop" id="cmBoardTop">' +
              '<span class="cm-boardtitle">Kingdoms of Mathoria</span>' +
              '<div class="cm-ring cm-hide" id="cmRing"></div>' +
            '</div>' +
            '<div class="cm-arena" id="cmArena">' +
              '<div class="cm-mapwrap cm-mapwrap--kingdoms" id="cmMapWrap">' +
                '<div class="cm-mapinner"><svg class="cm-hexsvg" id="cmHexSvg"></svg></div>' +
                '<div class="cm-iconlayer" id="cmIcons"></div>' +
              '</div>' +
            '</div>' +
            // Ein Auswahlfeld statt sechs Knöpfen — das war eine ganze
            // Zeile Bildschirmhöhe, die jetzt dem Spielfeld gehört.
            // Das Feld ist ein BEFEHL, keine Zustandsanzeige: es springt
            // nach jeder Wahl auf den Platzhalter zurück, und was gerade
            // gilt, steht daneben (und im Ring oben rechts). So kann es
            // nach einem Neuladen nichts Falsches behaupten — die
            // gewählte Dauer steht nirgends auf dem Server (0094).
            '<div class="cm-timerbar" id="cmTimerBar">' +
              '<span class="cm-hint" id="cmTimerState"></span>' +
              '<label class="cm-timerpick">' +
                '<select id="cmTimerSel">' +
                  '<option value="" selected>Rundenende</option>' +
                  '<option value="0">ohne Zeitlimit</option>' +
                  '<option value="5">5 Sekunden (Test)</option>' +
                  '<option value="60">1 Minute</option>' +
                  '<option value="120">2 Minuten</option>' +
                  '<option value="180">3 Minuten</option>' +
                  '<option value="240">4 Minuten</option>' +
                  '<option value="300">5 Minuten</option>' +
                '</select>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="cm-roster cm-roster--right" id="cmRosterRight"></div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmEndedP">' +
          '<div class="cm-result" id="cmResultP"></div>' +
          '<button type="button" class="cm-btn cm-btn--ghost" id="cmResetBtn">🔄 Neues Spiel</button>' +
        '</div>' +
      '</div>';

    els = {
      setup: root.querySelector('#cmSetup'),
      teamCount: root.querySelector('#cmTeamCount'),
      startBtn: root.querySelector('#cmStartBtn'),
      rosterP: root.querySelector('#cmRosterP'),
      onlineHintP: root.querySelector('#cmOnlineHintP'),
      countdownP: root.querySelector('#cmCountdownP'),
      countNumP: root.querySelector('#cmCountNumP'),
      boardWrap: root.querySelector('#cmBoardWrap'),
      frame: root.querySelector('#cmFrame'),
      boardTop: root.querySelector('#cmBoardTop'),
      ring: root.querySelector('#cmRing'),
      arena: root.querySelector('#cmArena'),
      rosterLeft: root.querySelector('#cmRosterLeft'),
      rosterRight: root.querySelector('#cmRosterRight'),
      timerBar: root.querySelector('#cmTimerBar'),
      timerSel: root.querySelector('#cmTimerSel'),
      timerState: root.querySelector('#cmTimerState'),
      mapWrap: root.querySelector('#cmMapWrap'),
      hexsvg: root.querySelector('#cmHexSvg'),
      icons: root.querySelector('#cmIcons'),
      endedP: root.querySelector('#cmEndedP'),
      resultP: root.querySelector('#cmResultP'),
      resetBtn: root.querySelector('#cmResetBtn')
    };

    // Ein Auswahlfeld für beide Richtungen: „ohne Zeitlimit" (Wert 0)
    // löscht den Timer, jede andere Zahl setzt ihn. Danach springt das
    // Feld auf den Platzhalter zurück — es zeigt keinen Zustand an,
    // sondern löst eine Handlung aus (siehe Kommentar am DOM).
    els.timerSel.addEventListener('change', async () => {
      const raw = els.timerSel.value;
      els.timerSel.value = '';
      if (raw === '') return;
      const secs = parseInt(raw, 10);
      els.timerSel.disabled = true;
      const r = secs > 0
        ? await ctx.actions.call('clash_room_set_match_timer', { p_seconds: secs })
        : await ctx.actions.call('clash_room_clear_match_timer', {});
      els.timerSel.disabled = false;
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });

    els.teamCount.addEventListener('change', async () => {
      const n = Math.max(2, Math.min(8, parseInt(els.teamCount.value, 10) || 4));
      els.teamCount.value = n;
      const r = await ctx.actions.call('clash_room_set_team_count', { p_team_count: n });
      if (!r || !r.ok) ctx.toast(ctx.errText((r && r.error) || 'network'), true);
      tick(true);
    });

    els.startBtn.addEventListener('click', async () => {
      els.startBtn.disabled = true;
      const r = await ctx.actions.call('clash_room_start', {});
      els.startBtn.disabled = false;
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });

    els.resetBtn.addEventListener('click', async () => {
      if (!(await ctx.confirm('Neues Spiel starten? Der bisherige Spielstand geht verloren.'))) return;
      const r = await ctx.actions.call('clash_room_reset', {});
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });
  }

  /* ─── Fraktionsliste links/rechts neben der Karte ────────────────
     Ersetzt die frühere Statuszeile über der Karte (cm-statusbar):
     im Showroom stehen die Fraktionen in zwei Spalten neben dem Feld,
     mit Wappenbild, Fraktionsnamen und Feldzahl. Teams wechseln sich
     ab (gerade nach links, ungerade nach rechts), damit beide Spalten
     gleich lang bleiben. */
  function rosterCardHTML(i, count, members) {
    const dead = count === 0;
    // Namensliste. `team_members` kommt erst ab Migration 0096 — läuft
    // sie noch nicht, fehlt der Schlüssel einfach und das Panel zeigt
    // Bild/Name/Zahl wie zuvor, statt „undefined" zu schreiben.
    const names = Array.isArray(members) ? members : [];
    const memberHTML = names.length
      ? `<div class="cm-rmembers">${names.map(n => ctx.esc(n)).join(' · ')}</div>`
      : '';
    // EINE Einheit mit dem Namen daneben (nicht das Gruppenbild über
    // die volle Breite): so bleibt die Kopfzeile flach und der Platz
    // darunter gehört den Namen der Kinder.
    return `<div class="cm-rcard${dead ? ' cm-rcard--out' : ''}" style="--team:${teamStroke(i)}">` +
      '<div class="cm-rhead">' +
        `<div class="cm-rthumb"><img src="${esrc(FACTION_UNIT[i] || FACTION_UNIT[0])}" alt=""></div>` +
        `<span class="cm-rname">${ctx.esc(factionLabel(i))}</span>` +
        `<span class="cm-rcount">${count}</span>` +
      '</div>' +
      memberHTML +
    '</div>';
  }

  function fillRosters(v) {
    if (!els.rosterLeft || !els.rosterRight) return;
    const members = v.team_members || {};
    let left = '', right = '';
    for (let i = 0; i < v.team_count; i++) {
      const n = (v.team_tile_counts && v.team_tile_counts[String(i)]) || 0;
      const html = rosterCardHTML(i, n, members[String(i)]);
      if (i % 2 === 0) left += html; else right += html;
    }
    els.rosterLeft.innerHTML = left;
    els.rosterRight.innerHTML = right;
  }

  /* ─── Restzeit-Ring oben rechts ──────────────────────────────────
     Der Server kennt nur `match_ends_at`, nicht die gewählte Dauer
     (0094 legt keine Spalte dafür an) — der Füllstand braucht aber
     einen Nenner. Statt dafür eine Migration zu bauen, merkt sich der
     Client die größte Restzeit, die er für DIESES Rundenende gesehen
     hat: beim Setzen des Timers ist das die volle Dauer, und wer die
     Seite mitten in der Runde neu lädt, sieht den Ring bei „voll"
     anfangen und sauber leerlaufen. Nie falsch, höchstens optimistisch
     — und die Zahl in der Mitte stimmt in jedem Fall. */
  function renderRing(fraction, label) {
    if (!els.ring) return;
    const size = 46, thickness = 5;
    const r = (size / 2) - thickness / 2 - 1;
    const circ = 2 * Math.PI * r;
    const off = circ * (1 - Math.max(0, Math.min(1, fraction)));
    els.ring.innerHTML =
      `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="cm-ringtrack" stroke-width="${thickness}" fill="none"/>` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="cm-ringbar" stroke-width="${thickness}" fill="none" ` +
          `stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" ` +
          `transform="rotate(-90 ${size / 2} ${size / 2})"/>` +
      '</svg>' +
      `<span class="cm-ringlabel">${label}</span>`;
  }

  function renderPresenter(v) {
    if (v.phase === 'lobby') {
      show2('setup');
      els.teamCount.value = v.team_count;
      els.rosterP.innerHTML = rosterHTML(v.teams, v.team_count, null);
      if (els.onlineHintP) {
        els.onlineHintP.textContent = (v.online_count != null && v.room_total != null && v.room_total > v.online_count)
          ? `${v.online_count} von ${v.room_total} bereit (online) — nur sie bekommen beim Start ein Team.`
          : '';
      }
      return;
    }
    if (v.phase === 'countdown') {
      show2('countdownP');
      startCountdown(v.countdown_ends_at);
      return;
    }
    stopCountdown();
    stopMatchTimer();
    if (v.phase === 'ended') {
      show2('endedP');
      els.resultP.innerHTML =
        `<b style="color:${teamStroke(v.winner_team)}">${ctx.esc(teamName(v.winner_team))} gewinnt!</b>`;
      return;
    }
    show2('boardWrap');
    fillRosters(v);
    // Ohne Timer steht hier nichts: dass kein Zeitlimit gesetzt ist,
    // sagt schon der fehlende Ring oben rechts.
    if (els.timerState) {
      els.timerState.textContent = v.match_ends_at
        ? 'Bei Ablauf gewinnt, wer am meisten Feld hat.'
        : '';
    }
    if (v.match_ends_at) startMatchTimer(v.match_ends_at); else stopMatchTimer();
    fitPresenterMap();
    requestAnimationFrame(fitPresenterMap);
  }

  function show2(which) {
    ['setup', 'countdownP', 'boardWrap', 'endedP'].forEach(k => {
      const el = { setup: els.setup, countdownP: els.countdownP,
                   boardWrap: els.boardWrap, endedP: els.endedP }[k];
      if (el) el.classList.toggle('cm-hide', k !== which);
    });
    if (which !== 'countdownP') stopCountdown();
  }

  /* ══════════════════════════════════════════════════════════
     Werkzeug-Schnittstelle
     ══════════════════════════════════════════════════════════ */
  window.MPTool.register('clash-of-math', {
    // Team-Zahl lebt bewusst NICHT im generischen Einstellungen-Fach:
    // sie ist über eine eigene RPC gesperrt, solange phase<>lobby, und
    // das lässt sich mit has_participants/has_entries (0084) nicht
    // ausdrücken. Der Regler steht deshalb im Werkzeug selbst
    // (Fach 3, Beamer-Rolle). Leere Liste = „keine Angabe hier".
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; role = ctx.role;
      destroyed = false; lastSig = null; lastView = null; channelKey = null;

      if (role === 'presenter') buildPresenterDOM(); else buildParticipantDOM();

      // Beamer: die Karte soll den ganzen freien Platz nehmen (Fix 2)
      // — dieselbe „tool-fill"-Klasse wie bei NeuroLab/Cäsar, hier nur
      // für die Lehrkraft-Rolle. Der Teilnehmer behält seine begrenzte
      // Karte in der Seite, siehe Kopfkommentar der Datei.
      if (role === 'presenter' && !(ctx && ctx.preview)) {
        document.body.classList.add('tool-fill');
        onWinResize = () => fitPresenterMap();
        window.addEventListener('resize', onWinResize);
      }

      resizeObs = new ResizeObserver(() => {
        if (!lastView) return;
        if (role === 'presenter') { fitPresenterMap(); }
        else {
          const myTeam = lastView.me && lastView.me.team;
          if (els.map)  paintBoard(els.map,  lastView, { highlightTeam: myTeam });
          if (els.map2) paintBoard(els.map2, lastView, { highlightTeam: myTeam });
        }
      });
      resizeObs.observe(root);

      // Sicherheitsnetz: alle 8s eine billige Signatur — der schnelle
      // Weg ist der Broadcast-Kanal (siehe ensureChannel/nudge).
      pollTimer = setInterval(() => tick(false), 8000);
      tick(true);
    },

    // Wird vom generischen Seiten-Poller aufgerufen (skill_view/
    // skill_room_get) — für Clash meist ohne eigene Bedeutung, aber
    // ein billiger zusätzlicher Anstoß schadet nicht: irgendjemand
    // im Raum ist gerade aktiv genug, dass sich die generische
    // Ansicht geändert hat.
    update() { tick(false); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      stopCountdown();
      stopMatchTimer();
      if (onWinResize) window.removeEventListener('resize', onWinResize);
      onWinResize = null;
      document.body.classList.remove('tool-fill');
      if (resizeObs) { try { resizeObs.disconnect(); } catch (e) {} }
      resizeObs = null;
      if (channel && window.supabaseClient) {
        try { window.supabaseClient.removeChannel(channel); } catch (e) {}
      }
      channel = null; channelKey = null;
      root = ctx = null; role = null;
      els = {}; lastView = null; lastSig = null; busy = false; submitting = false;
    }
  });
})();
