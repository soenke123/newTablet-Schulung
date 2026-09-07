/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Myth of Wordisland"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Sechster Skill, erster im Fach Englisch, zweites Team-Spiel nach
   Kingdoms of Mathoria — und wie dieses eines mit EIGENEN Tabellen
   statt der generischen Inhaltsschicht (Migrationen 0130/0131/0133).

   ── Ein Modul, zwei Rollen ────────────────────────────────────
   Am Beamer steht das Pult (Völker wählen, Units wählen, starten,
   zusehen), am Tablet die Wartetafel, die Aufgabe und die Insel.
   Das ist dasselbe Werkzeug in zwei Rollen: ctx.role entscheidet,
   welches DOM gebaut wird, ctx.actions.call trägt die Rolle in den
   Server (p_token bzw. p_code, siehe lib/tool.js).

   ── Die Lobby ist die von Kingdoms ────────────────────────────
   Sönkes Vorgabe (2026-09-07). Beide Spiele stellen dieselbe Frage
   („wer spielt mit, und wie?"), und sie sollen sie gleich stellen:

     · Die Wappenreihe. Angeklickt heißt dabei, weggeklickt heißt
       raus — hier mit SECHS Völkern statt acht. Welche mitspielen,
       steht seit 0133 als `factions` im Server (factions[slot] =
       Volk); der Server selbst rechnet weiter in Slots.
     · Die Einstellungen als Segment-Schalter statt als Auswahl-
       felder: man sieht, wogegen man sich entscheidet.
     · Eine Spalte je Volk mit den Namen der Gruppe, am Beamer
       nebeneinander.
     · Am Tablet dieselbe Spalte für das EIGENE Volk, groß, und die
       anderen als schmale Zeile darunter.

   Ein Unterschied bleibt, und er ist inhaltlich: bei Kingdoms
   bekommt ein Kind, das gerade nicht online ist, beim Start kein
   Team. wi_room_start verteilt ausnahmslos alle Teilnehmer des
   Raums — die Lobby sagt deshalb „gerade nicht am Tablet" und
   nicht „spielt nicht mit".

   ── Warum ein eigener Takt ────────────────────────────────────
   Der Seiten-Poller ruft skill_view/skill_room_get — die generische
   Ansicht, in der von dieser Insel nichts steht. Wordisland fragt
   deshalb selbst (wi_view/wi_room_get), genau wie Clash. update()
   des Seiten-Pollers wird trotzdem angenommen: ein zusätzlicher
   Anstoß schadet nicht.

   ── Karte einmal bauen, Besitz je Takt malen ──────────────────
   Der Server schickt die Felder (`map`) nur, wenn man danach fragt,
   und danach je Takt eine Zeichenkette mit EINEM Zeichen je Feld
   (`own`: '.' = Nebel, '0'..'5' = SLOT). Bei 500 Feldern sind das
   500 Byte statt 12 KB — dreißigmal alle vier Sekunden. Das SVG
   wird deshalb einmal gebaut und danach nur noch umgefärbt; neu
   gebaut wird es erst, wenn `map_key` wechselt (= neue Runde, neue
   Insel).

   ── Die Bilder der Völker ─────────────────────────────────────
   ⚠️ VORLÄUFIG geliehen aus tools/clash-of-math/sprites/. Eigene
   Bilder kommen nach; dann ändert sich nur TEAMS[].img/.team und der
   Ordner darunter. Der Pfad ist absichtlich der volle ab MPSkills/:
   ein in tool.js gebautes <img>/<image> löst relativ zur SEITE auf
   (j.html, lehrer.html), nicht relativ zu dieser Datei.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Die Völker ────────────────────────────────────────────
     Index = VOLK (nicht Slot), in allen Listen dieselbe
     Reihenfolge. Namen und Bilder kommen aus Kingdoms; die Farben
     sind dieselben wie dort, damit ein Kind, das beide Spiele
     kennt, sich nicht umgewöhnen muss.

     `img` ist die Einheit (Kopfzeile, Karte, Ergebnis), `team` das
     Gruppenbild mit Burg — es steht nur in der Lobby, wo Platz für
     ein Porträt ist. Der Dateiname von Gelb ist wirklich „yello
     Team.png": Tippfehler im Ordner, nicht hier.                */
  const ASSET_DIR = 'tools/clash-of-math/sprites/';
  const TEAMS = [
    { name: 'Toast-Ritter',      color: '#ef4444', img: 'red ToastKnights.png',       team: 'red Team.png' },
    { name: 'Robo-Enten',        color: '#3b82f6', img: 'blue roboDucks.png',         team: 'blue Team.png' },
    { name: 'Brokkoli-Giraffen', color: '#10b981', img: 'green BrokkoliGiraffen.png', team: 'green Team.png' },
    { name: 'Mal-Hasen',         color: '#f59e0b', img: 'yellow PainingBunnies.png',  team: 'yello Team.png' },
    { name: 'Kosmische Katzen',  color: '#a855f7', img: 'lila cosmicCat.png',         team: 'lila Team.png' },
    { name: 'Okto-Pferdchen',    color: '#06b6d4', img: 'türkis OctoPferdchen.png',   team: 'türkis Team.png' }
  ];
  const TEAM_COUNT = TEAMS.length;
  const esrc = name => encodeURI(ASSET_DIR + name);

  const SVGNS = 'http://www.w3.org/2000/svg';
  const POLL_MS = { participant: 4000, presenter: 3000 };

  /* Eine Serie ab drei — dieselbe Zahl steht im Server
     (wi_answer). Hier nur für den Text „noch 2 bis zur freien
     Wahl"; entschieden wird es dort. */
  const STREAK_GOAL = 3;

  /* Die Spieldauer als Reihe statt als Auswahlfeld (Kingdoms-Muster:
     .cm-levelrow). Vier Knöpfe nebeneinander und EIN Satz darunter,
     der die gewählte erklärt. */
  const DURATIONS = [300, 600, 900, 1200];

  let root = null, ctx = null, role = null;
  let destroyed = false, busy = false, pollTimer = null;
  let view = null;          // letzte Antwort des Servers
  let mapKey = null;        // welche Insel gerade gezeichnet ist
  let cells = [];           // [[r,c,ruin,home], …] in der Reihenfolge von `own`
  let cellEls = [];         // die Polygone dazu, gleiche Reihenfolge
  let homeImgs = {};        // Index → <image> auf dem Landeplatz
  let ownPainted = null;    // zuletzt gemalte Besitz-Zeichenkette
  let els = {};
  let sets = { list: [], chosen: [] };
  let setsBusy = 0;         // wie pickBusy: eigener Klick schlägt Server-Antwort
  let tab = 'units';
  let setsOpen = false;
  let submitting = false;
  let timerHandle = null;
  let onResize = null;
  let picking = false;      // Tablet: wartet auf einen Fingertipp aufs Feld
  let practice = false;     // Tablet: üben statt warten
  let lastPhase = null;

  /* ─── Slot → Volk (Migration 0133) ──────────────────────────
     `factions` ist die Übersetzungstabelle des Servers:
     factions[slot] = Volk. Der Rückfall auf den Slot ist der Zustand
     VOR 0133 (Volk = Slot) — er greift, solange die Migration nicht
     eingespielt ist, und macht dann genau das Alte.

     AB HIER nimmt jede Anzeigefunktion einen SLOT entgegen. Wer
     TEAMS direkt indiziert, muss vorher durch facOf() — die einzige
     Ausnahme ist die Wappenreihe der Lobby, die von Natur aus über
     Völker läuft und nicht über Slots. */
  let factions = [0, 1, 2, 3];
  const facOf = s => (factions[s] != null ? factions[s] : s);
  // Lobby-Auswahl der Lehrkraft (VÖLKER, nicht Slots) und ein Zähler
  // laufender Speicher-Aufrufe: solange der über 0 steht, hat die
  // Anzeige Vorrang vor einer Server-Antwort von vorhin.
  let pickSel = [], pickBusy = 0;

  const esc = s => (ctx ? ctx.esc(s) : String(s == null ? '' : s));
  const teamOf = s => TEAMS[facOf(s)] ||
    { name: 'Volk ' + (s + 1), color: '#888', img: '', team: '' };

  /* ══════════════════════════════════════════════════════════
     Die Karte
     ══════════════════════════════════════════════════════════
     Spitze oben, versetzte Reihen — dieselbe Geometrie wie im
     Server (wi_is_neighbor): waagerechter Abstand 1, senkrechter
     0.866, ungerade Zeilen um eine halbe Breite nach rechts. */
  const HEX = (() => {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (30 + 60 * k);
      pts.push([Math.cos(a) / Math.sqrt(3), Math.sin(a) / Math.sqrt(3)]);
    }
    return pts;   // in Einheiten des waagerechten Abstands
  })();

  const cx = (r, c) => c + 0.5 * (((r % 2) + 2) % 2);
  const cy = r => r * 0.8660254;

  function buildMap(svg, list) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    cellEls = []; homeImgs = {}; ownPainted = null;

    // In der Lobby gibt es noch keine Insel (wi_tiles ist leer, bis
    // wi_room_start würfelt). Ohne diesen Ausgang stünde im viewBox
    // „Infinity -Infinity NaN NaN" — und das SVG wäre danach kaputt,
    // nicht bloß leer.
    if (!list.length) { svg.setAttribute('viewBox', '0 0 1 1'); return; }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [r, c] of list) {
      minX = Math.min(minX, cx(r, c)); maxX = Math.max(maxX, cx(r, c));
      minY = Math.min(minY, cy(r));    maxY = Math.max(maxY, cy(r));
    }
    const pad = 0.8;
    svg.setAttribute('viewBox',
      `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);

    const gTiles = document.createElementNS(SVGNS, 'g');
    const gMarks = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gTiles);
    svg.appendChild(gMarks);

    list.forEach(([r, c, ruin, home], i) => {
      const x = cx(r, c), y = cy(r);
      const p = document.createElementNS(SVGNS, 'polygon');
      p.setAttribute('points', HEX.map(([dx, dy]) => `${x + dx},${y + dy}`).join(' '));
      p.setAttribute('class', 'wi-cell');
      p.dataset.i = i;
      p.dataset.r = r;
      p.dataset.c = c;
      p.dataset.t = '.';
      gTiles.appendChild(p);
      cellEls.push(p);

      // Die Lichtpunkte schimmern von Anfang an durch den Nebel —
      // sie sind der Grund, überhaupt irgendwohin zu wollen. Also
      // werden sie EINMAL gezeichnet und nie wieder angefasst.
      if (ruin > 0) {
        const m = document.createElementNS(SVGNS, 'circle');
        m.setAttribute('cx', x); m.setAttribute('cy', y);
        m.setAttribute('r', 0.13 + 0.05 * ruin);
        m.setAttribute('class', 'wi-ruin wi-ruin--' + ruin);
        gMarks.appendChild(m);
      }
      if (home) {
        const im = document.createElementNS(SVGNS, 'image');
        im.setAttribute('x', x - 0.55); im.setAttribute('y', y - 0.55);
        im.setAttribute('width', 1.1); im.setAttribute('height', 1.1);
        im.setAttribute('class', 'wi-home');
        gMarks.appendChild(im);
        homeImgs[i] = im;
      }
    });
  }

  /* Nur was sich geändert hat. Bei 500 Feldern und einem Takt alle
     vier Sekunden ist das der Unterschied zwischen „malt sich neu"
     und „ruckelt".

     `own` trägt SLOTS, `data-t` trägt VÖLKER: die Farbe einer Kachel
     steht in tool.css an der Volksnummer (.wi-cell[data-t="4"] ist
     Lila), und welches Volk auf Slot 1 sitzt, entscheidet die
     Lehrkraft. Ohne die Übersetzung hier hätte ein Raum mit den
     Völkern 4 und 5 zwei rot-blaue Gebiete und daneben eine lila
     Kopfzeile. */
  function paintOwn(own) {
    if (!own || own.length !== cellEls.length) return;
    for (let i = 0; i < own.length; i++) {
      const ch = own[i];
      if (ownPainted && ownPainted[i] === ch) continue;
      const slot = (ch === '.') ? -1 : +ch;
      cellEls[i].dataset.t = (slot < 0) ? '.' : String(facOf(slot));
      const im = homeImgs[i];
      if (im && slot >= 0) {
        const want = esrc(teamOf(slot).img);
        if (im.getAttribute('href') !== want) im.setAttribute('href', want);
      }
    }
    ownPainted = own;
  }

  /* ─── Zoom und Schieben ─────────────────────────────────────
     Auf dem Tablet ist eine Kachel sonst zu klein zum Treffen —
     und beim Zeigen der freien Wahl muss man sie treffen.

     Die Zeiger-Ereignisse hängen in der EINFANG-Phase (Regel:
     feedback_field_gestures_capture_phase): sonst schluckt ein
     stopPropagation() weiter innen die Geste genau über dem
     Inhalt, um den es geht. */
  function attachPanZoom(wrap, svg) {
    let scale = 1, tx = 0, ty = 0;
    const pts = new Map();
    let base = null;

    const apply = () => { svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    const dist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const down = e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) base = { d: dist(), m: mid(), scale, tx, ty };
    };
    const move = e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size === 2 && base) {
        const f = dist() / (base.d || 1);
        scale = Math.min(6, Math.max(1, base.scale * f));
        const m = mid();
        tx = base.tx + (m.x - base.m.x);
        ty = base.ty + (m.y - base.m.y);
        apply();
        e.preventDefault();
      } else if (pts.size === 1 && scale > 1.02 && e.buttons !== 0) {
        tx += e.clientX - prev.x;
        ty += e.clientY - prev.y;
        apply();
        e.preventDefault();
      }
    };
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) base = null; };

    wrap.addEventListener('pointerdown', down, { capture: true });
    wrap.addEventListener('pointermove', move, { capture: true, passive: false });
    wrap.addEventListener('pointerup', up, { capture: true });
    wrap.addEventListener('pointercancel', up, { capture: true });
    // Doppeltipp setzt zurück — der einfachste Ausweg aus jedem
    // verrutschten Bild, und man findet ihn ohne Erklärung.
    wrap.addEventListener('dblclick', () => { scale = 1; tx = ty = 0; apply(); });
  }

  /* ══════════════════════════════════════════════════════════
     Gemeinsame Bausteine
     ══════════════════════════════════════════════════════════ */
  function teamRow(v) {
    const teams = v.teams || [];
    return teams.map(t => {
      const T = teamOf(t.i);
      return `<div class="wi-team${v.winner_team === t.i ? ' is-win' : ''}"
                   style="--wi-team:${T.color}">
                <img src="${esc(esrc(T.img))}" alt="">
                <b>${esc(T.name)}</b>
                <span class="wi-score">${t.score}</span>
                <span class="wi-sub">${t.tiles} Felder · ${t.ruins} aus Ruinen · ${t.people} Kinder</span>
              </div>`;
    }).join('');
  }

  /* Eine Spalte je Volk: Gruppenbild, Name mit Kopfzahl, darunter die
     Kinder. Dasselbe Stück am Beamer (eine Spalte je Volk) und am
     Tablet (nur die eigene, dafür groß) — Kingdoms macht es genauso
     und aus demselben Grund: es ist dieselbe Auskunft.

     `members` ist eine Liste aus {name, me?, online?}. Wer nicht am
     Tablet ist, steht blass da und bleibt trotzdem stehen: beim
     Start verteilt der Server ausnahmslos alle. */
  function teamColHTML(slot, members, opts) {
    const T = teamOf(slot);
    const o = opts || {};
    const li = m => {
      const cls = [m.me ? 'wi-lteamme' : '', m.online === false ? 'wi-lteamoff' : ''].filter(Boolean);
      return `<li${cls.length ? ` class="${cls.join(' ')}"` : ''}>${esc(m.name)}</li>`;
    };
    const list = (members && members.length)
      ? members.map(li).join('')
      : '<li class="wi-lteamempty">noch niemand</li>';
    return `<div class="wi-lteam${o.mine ? ' wi-lteam--mine' : ''}" style="--wi-team:${T.color}">
              <div class="wi-lteampic"><img src="${esc(esrc(T.team || T.img))}" alt=""></div>
              <div class="wi-lteamname">
                <span>${esc(T.name)}</span>
                <span class="wi-lteamn">${o.count != null ? o.count : (members || []).length}</span>
              </div>
              <ul class="wi-lteamlist">${list}</ul>
            </div>`;
  }

  function fmtLeft(iso) {
    if (!iso) return '–';
    const s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /* Läuft unabhängig vom Takt: eine Restzeit, die nur alle vier
     Sekunden springt, sieht kaputt aus. */
  function startTimer() {
    stopTimer();
    timerHandle = setInterval(() => {
      if (!view) return;
      if (els.clock) els.clock.textContent = fmtLeft(view.ends_at);
      if (view.countdown_ends_at && view.phase === 'countdown') {
        const s = Math.max(0, Math.ceil((new Date(view.countdown_ends_at).getTime() - Date.now()) / 1000));
        if (els.big) els.big.textContent = s > 0 ? s : 'Los!';
        if (s <= 0) tick(true);
      }
    }, 250);
  }
  function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; }

  /* ══════════════════════════════════════════════════════════
     Pult
     ══════════════════════════════════════════════════════════
     Aufbau der Lobby von oben nach unten, wie in Kingdoms:
       Einstellungen (Segment-Schalter) → Kopfzeile mit den drei
       Knöpfen → Wappenreihe + gewählte Wörter → die Spalten der
       Völker → wer noch nicht dabei ist.
     Die Unit-Auswahl liegt in einem Fenster darüber: die Liste ist
     lang, und die Lobby soll ihre Übersicht behalten.            */
  const PULT_HTML = `
    <div class="wi wi--pult">
      <section class="wi-lobby" data-part="lobby">
        <div class="wi-setup">
          <div class="wi-modebar">
            <div class="wi-modegrp">
              <span class="wi-modelab">Abfrage</span>
              <div class="wi-modeseg" data-part="modeseg">
                <button type="button" class="wi-modebtn" data-mode="type">⌨️ Tippen mit Hilfe</button>
                <button type="button" class="wi-modebtn" data-mode="choice">🔤 Nur auswählen</button>
              </div>
            </div>
            <div class="wi-modegrp">
              <span class="wi-modelab">Richtung</span>
              <div class="wi-modeseg" data-part="dirseg">
                <button type="button" class="wi-modebtn" data-dir="mixed">gemischt</button>
                <button type="button" class="wi-modebtn" data-dir="de_en">Deutsch → Englisch</button>
                <button type="button" class="wi-modebtn" data-dir="en_de">Englisch → Deutsch</button>
              </div>
            </div>
            <div class="wi-modegrp wi-modegrp--wide">
              <span class="wi-modelab">Spieldauer</span>
              <div class="wi-levelrow" data-part="durrow"></div>
              <div class="wi-leveltext" data-part="durtext"></div>
            </div>
          </div>

          <div class="wi-setuphead">
            <h3 class="wi-setuptitle">Welche Völker?</h3>
            <button type="button" class="wi-btn wi-btn--ghost" data-part="setsbtn">📚 Wörter wählen</button>
            <button type="button" class="wi-btn wi-btn--ghost" data-part="shuffle">🔀 Völker mischen</button>
            <button type="button" class="wi-btn" data-part="start">⛵ Schiffe klarmachen</button>
          </div>

          <div class="wi-pickrow">
            <div class="wi-pick" data-part="pick"></div>
            <div class="wi-setsum" data-part="setsum"></div>
          </div>

          <div class="wi-lobbyteams" data-part="lobbyteams"></div>
          <div class="wi-waiting" data-part="waiting" hidden></div>
        </div>
      </section>

      <section class="wi-play" data-part="play" hidden>
        <header class="wi-bar">
          <div class="wi-teams" data-part="teams-row"></div>
          <div class="wi-clock"><b data-part="clock">–</b>
            <button class="wi-btn wi-btn--ghost" data-part="stop">Runde beenden</button></div>
        </header>
        <div class="wi-mapwrap" data-part="mapwrap"><svg class="wi-map" data-part="map"></svg></div>
        <div class="wi-big" data-part="big" hidden></div>
      </section>

      <section class="wi-end" data-part="end" hidden>
        <h2 data-part="winner"></h2>
        <div class="wi-teams" data-part="end-teams"></div>
        <div class="wi-card wi-hard">
          <h3>Diese Wörter sind der Klasse am häufigsten durchgegangen</h3>
          <div data-part="hard"></div>
        </div>
        <button class="wi-btn wi-btn--go" data-part="again">Neue Runde</button>
      </section>

      <!-- Die Wörter-Auswahl. Ein Fenster über der Lobby, kein
           weiterer Abschnitt darin: die Listen sind lang, und die
           Lobby soll ihre Übersicht behalten. Muster wie .cm-poolov —
           das Overlay scrollt, der Kasten sitzt mit margin:auto
           darin (Regel: feedback_modal_viewport_pattern). -->
      <div class="wi-ov" data-part="setsov" hidden>
        <div class="wi-ovbox">
          <div class="wi-ovhead">
            <span class="wi-ovtitle">📚 Welche Wörter?</span>
            <button type="button" class="wi-ovclose" data-part="setsclose" aria-label="Auswahl schließen">✕</button>
          </div>
          <p class="wi-ovhint">Mehrere Listen lassen sich mischen — Wiederholung über zwei Themen
            ist der Normalfall. Mindestens eine muss gewählt sein.</p>
          <div class="wi-tabs" role="tablist">
            <button type="button" class="wi-tab is-on" data-tab="units">Units</button>
            <button type="button" class="wi-tab" data-tab="own">Eigene</button>
          </div>
          <div class="wi-ovbody">
            <div class="wi-sets" data-part="sets"></div>
            <form class="wi-import" data-part="import" hidden>
              <input class="wi-in" data-part="imp-title" maxlength="60" placeholder="Name der Liste, z. B. Unit 3">
              <textarea class="wi-in wi-ta" data-part="imp-text" rows="6"
                placeholder="Eine Zeile je Wortpaar:&#10;Haus - house&#10;der Schüler - pupil / student&#10;Tafel;board"></textarea>
              <button class="wi-btn" type="submit">Liste anlegen</button>
            </form>
          </div>
        </div>
      </div>
    </div>`;

  function q(part) { return root.querySelector(`[data-part="${part}"]`); }

  function buildPult() {
    root.innerHTML = PULT_HTML;
    els = {
      lobby: q('lobby'), play: q('play'), end: q('end'),
      sets: q('sets'), imp: q('import'),
      setsOv: q('setsov'), setSum: q('setsum'),
      modeSeg: q('modeseg'), dirSeg: q('dirseg'),
      durRow: q('durrow'), durText: q('durtext'),
      pick: q('pick'), lobbyTeams: q('lobbyteams'), waiting: q('waiting'),
      start: q('start'),
      teamsRow: q('teams-row'), clock: q('clock'), big: q('big'),
      map: q('map'), mapwrap: q('mapwrap'),
      winner: q('winner'), endTeams: q('end-teams'), hard: q('hard')
    };

    root.querySelectorAll('.wi-tab').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      root.querySelectorAll('.wi-tab').forEach(x => x.classList.toggle('is-on', x === b));
      els.imp.hidden = (tab !== 'own');
      renderSets();
    }));

    els.sets.addEventListener('click', onSetClick);
    els.imp.addEventListener('submit', onImport);

    /* ── Die Einstellungen ─────────────────────────────────────
       Ein Zuhörer je Behälter, nicht je Knopf: die Segmente werden
       bei jedem Takt neu gezeichnet, einzeln angeheftete Zuhörer
       wären damit jedes Mal weg. Dieselbe Bauweise wie in Kingdoms. */
    els.modeSeg.addEventListener('click', ev => {
      const b = ev.target.closest('.wi-modebtn');
      if (b) setNow({ mode: b.dataset.mode }, { p_mode: b.dataset.mode });
    });
    els.dirSeg.addEventListener('click', ev => {
      const b = ev.target.closest('.wi-modebtn');
      if (b) setNow({ direction: b.dataset.dir }, { p_direction: b.dataset.dir });
    });
    els.durRow.addEventListener('click', ev => {
      const b = ev.target.closest('.wi-levelbtn');
      if (b) setNow({ duration: +b.dataset.secs }, { p_duration: +b.dataset.secs });
    });
    els.pick.addEventListener('click', onPickClick);

    q('setsbtn').addEventListener('click', () => openSets());
    q('setsclose').addEventListener('click', () => closeSets());
    // Klick neben den Kasten schließt. Der Kasten selbst nicht, sonst
    // ginge das Fenster bei jeder gewählten Liste zu.
    els.setsOv.addEventListener('click', ev => { if (ev.target === els.setsOv) closeSets(); });

    q('shuffle').addEventListener('click', async () => {
      const r = await ctx.actions.call('wi_room_shuffle', {});
      if (!r.ok) return ctx.toast(ctx.errText(r.error));
      tick(true);
    });
    q('start').addEventListener('click', onStart);
    q('again').addEventListener('click', onStart);
    q('stop').addEventListener('click', async () => {
      if (!await ctx.confirm('Runde jetzt beenden?')) return;
      await ctx.actions.call('wi_room_end', {});
      tick(true);
    });

    attachPanZoom(els.mapwrap, els.map);
    loadSets();
  }

  function openSets() { setsOpen = true; els.setsOv.hidden = false; }
  function closeSets() { setsOpen = false; els.setsOv.hidden = true; }

  async function loadSets() {
    const r = await ctx.actions.call('wi_sets_list', {});
    if (!r || !r.ok) return;
    sets.list = r.sets || [];
    sets.chosen = (r.chosen || []).map(String);
    renderSets();
    renderSetSum();
  }

  function renderSets() {
    const mine = tab === 'own';
    const list = sets.list.filter(s => (s.mine === '1') === mine);
    if (!list.length) {
      els.sets.innerHTML = `<p class="wi-empty">${mine
        ? 'Noch keine eigene Liste. Füge unten eine ein — eine Zeile je Wortpaar.'
        : 'Keine mitgelieferten Units gefunden.'}</p>`;
      return;
    }
    els.sets.innerHTML = list.map(s => `
      <button class="wi-set${sets.chosen.includes(String(s.id)) ? ' is-on' : ''}"
              data-id="${esc(s.id)}">
        <b>${esc(s.title)}</b>
        <span>${s.count} Wörter${s.level ? ' · Klasse ' + esc(s.level) : ''}</span>
        ${mine ? `<i class="wi-del" data-del="${esc(s.id)}" title="Liste löschen">×</i>` : ''}
      </button>`).join('');
  }

  /* Die Kurzform neben den Wappen: welche Listen gewählt sind und wie
     viele Wörter zusammenkommen. Sie steht dort, wo in Kingdoms die
     Aufgabenarten stehen, und beantwortet dieselbe Frage über die
     Lobby hinweg: „was üben die gleich?"

     Ohne Wörter kein Spiel — dann sagt dieselbe Zeile auch, warum der
     Startknopf grau ist. */
  function renderSetSum() {
    if (!els.setSum) return;
    const chosen = sets.list.filter(s => sets.chosen.includes(String(s.id)));
    if (els.start) els.start.disabled = !sets.chosen.length;
    els.setSum.classList.toggle('wi-setsum--warn', !sets.chosen.length);
    if (!sets.chosen.length) {
      els.setSum.innerHTML = '<b>Keine Wörter gewählt</b>';
      return;
    }
    // Die Titel kennen wir nur, wenn die Liste schon da ist. Solange
    // nicht, steht die Zahl allein da — sie ist die ehrlichere
    // Auskunft als ein leerer Kasten.
    if (!chosen.length) {
      els.setSum.innerHTML = `<b>${sets.chosen.length} ${sets.chosen.length === 1 ? 'Liste' : 'Listen'}</b>`;
      return;
    }
    const words = chosen.reduce((n, s) => n + (parseInt(s.count, 10) || 0), 0);
    els.setSum.innerHTML =
      '<div class="wi-setsumgrp"><b>Wörter</b><span class="wi-setsumops">' +
        chosen.map(s => `<i>${esc(s.title)}</i>`).join('') +
      `</span></div><div class="wi-setsumn">${words} Wörter im Topf</div>`;
  }

  async function onSetClick(e) {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.preventDefault();
      if (!await ctx.confirm('Diese Liste endgültig löschen?')) return;
      const r = await ctx.actions.call('wi_set_delete', { p_id: del.dataset.del });
      if (!r.ok) return ctx.toast(ctx.errText(r.error));
      await loadSets();
      return;
    }
    const b = e.target.closest('.wi-set');
    if (!b) return;
    const id = b.dataset.id;
    sets.chosen = sets.chosen.includes(id)
      ? sets.chosen.filter(x => x !== id)
      : sets.chosen.concat(id);
    if (!sets.chosen.length) {
      // Ein Raum ohne Wörter ist kein Raum. Die letzte Unit lässt
      // sich deshalb nicht abwählen — nur durch eine andere
      // ersetzen.
      sets.chosen = [id];
      ctx.toast('Mindestens eine Liste muss gewählt sein.');
    }
    renderSets();
    renderSetSum();
    setsBusy++;
    await saveSetup({ p_sets: sets.chosen });
    setsBusy--;
  }

  /* Die Auswahl steht in JEDER Antwort des Servers (`sets`) — nicht
     nur in wi_sets_list. Sie hier zu übernehmen ist der Grund, warum
     die Kurzform neben den Wappen nach einem Neuladen sofort stimmt
     und nicht erst, wenn die Listen nachgeladen sind. Verglichen wird
     als MENGE: die Reihenfolge aus jsonb_agg ist beliebig, und ein
     Unterschied allein darin wäre keiner. */
  function syncSetsFromView(v) {
    if (setsBusy || !Array.isArray(v.sets)) return;
    const srv = v.sets.map(String).sort();
    if (srv.join(',') === sets.chosen.slice().sort().join(',')) return;
    sets.chosen = srv;
    renderSets();
  }

  async function onImport(e) {
    e.preventDefault();
    const title = q('imp-title').value.trim();
    const text  = q('imp-text').value;
    if (!title || !text.trim()) return ctx.toast('Name und Wortliste fehlen.');
    const r = await ctx.actions.call('wi_set_import', { p_title: title, p_text: text });
    if (!r.ok) {
      return ctx.toast(r.error === 'no_pairs'
        ? 'Keine Zeile war lesbar. Zwischen Wort und Übersetzung gehört „ - “, ein Semikolon oder ein Tabulator.'
        : ctx.errText(r.error));
    }
    q('imp-title').value = ''; q('imp-text').value = '';
    ctx.toast(r.bad
      ? `${r.added} Wörter übernommen, ${r.bad} Zeilen nicht verstanden.`
      : `${r.added} Wörter übernommen.`);
    await loadSets();
  }

  /* Sofort umschalten, den Server danach fragen. Ein Schalter, der
     eine halbe Sekunde nichts tut, wird ein zweites Mal gedrückt —
     und der zweite Druck ist dann der falsche. Geht der Aufruf
     schief, holt der nächste Takt die Wahrheit zurück. */
  function setNow(local, args) {
    if (view) { Object.assign(view, local); renderModes(view); }
    saveSetup(args);
  }

  async function saveSetup(args) {
    const r = await ctx.actions.call('wi_room_setup', args);
    if (!r.ok) ctx.toast(ctx.errText(r.error));
    tick(true);
  }

  /* ── Ein Volk an- oder abwählen (Migration 0133) ─────────────
     Sofort umschalten, ohne auf den Server zu warten: ein Klick, der
     eine halbe Sekunde nichts tut, wird ein zweites Mal geklickt.
     Solange die Antwort aussteht (pickBusy), darf ein
     dazwischenfunkender Takt die Auswahl nicht zurückdrehen — die
     Spalten darunter bleiben derweil auf dem Stand des Servers, weil
     ihre Verteilung nur von dort kommen kann. */
  async function onPickClick(ev) {
    const btn = ev.target.closest('.wi-pickbtn');
    if (!btn) return;
    const fac = parseInt(btn.dataset.fac, 10);
    if (!Number.isInteger(fac)) return;

    const on   = pickSel.indexOf(fac) >= 0;
    const next = on ? pickSel.filter(f => f !== fac) : pickSel.concat([fac]);
    if (next.length < 2) return ctx.toast('Mindestens zwei Völker müssen mitspielen.');
    if (next.length > TEAM_COUNT) return;
    next.sort((a, b) => a - b);   // dieselbe Ordnung, die der Server speichert

    pickSel = next;
    pickBusy++;
    renderPick();
    const r = await ctx.actions.call('wi_room_set_factions', { p_factions: next });
    pickBusy--;
    if (!r || !r.ok) {
      ctx.toast(ctx.errText((r && r.error) || 'network'));
      if (!pickBusy) syncPickFromView(view);
      renderPick();
      return;
    }
    if (Array.isArray(r.factions)) {
      factions = r.factions;
      ownPainted = null;              // andere Völker, andere Farben
      if (!pickBusy) pickSel = r.factions.slice();
    }
    renderPick();
    tick(true);
  }

  function syncPickFromView(v) {
    if (!v) return;
    pickSel = (Array.isArray(v.factions) && v.factions.length)
      ? v.factions.slice()
      : Array.from({ length: v.team_count || 2 }, (_, i) => i);
  }

  /* Die sechs Wappen zum An- und Abwählen. Nicht Gewählte sind grau
     und blass, Gewählte tragen ihre Farbe und einen Schein — dieselbe
     Aussage wie in Kingdoms, nur mit sechs Völkern.
     `title` und `aria-label` tragen den Namen, den die Reihe
     absichtlich nicht hinschreibt: sechs Namen nebeneinander
     sprengen die Reihe, und der Name steht ohnehin unten an der
     Spalte. */
  function renderPick() {
    if (!els.pick) return;
    const locked = pickSel.length <= 2;
    let out = '';
    for (let f = 0; f < TEAM_COUNT; f++) {
      const on = pickSel.indexOf(f) >= 0;
      out += `<button type="button" class="wi-pickbtn${on ? ' is-on' : ''}" ` +
        `data-fac="${f}" aria-pressed="${on}" aria-label="${esc(TEAMS[f].name)}" ` +
        `title="${esc(TEAMS[f].name)}" style="--wi-team:${TEAMS[f].color}"` +
        `${on && locked ? ' data-locked="1"' : ''}>` +
        `<img src="${esc(esrc(TEAMS[f].img))}" alt=""></button>`;
    }
    els.pick.innerHTML = out;
  }

  function renderModes(v) {
    els.modeSeg.querySelectorAll('.wi-modebtn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.mode === v.mode));
    els.dirSeg.querySelectorAll('.wi-modebtn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.dir === v.direction));

    els.durRow.innerHTML = DURATIONS.map(s =>
      `<button type="button" class="wi-levelbtn${s === v.duration ? ' is-on' : ''}" ` +
      `data-secs="${s}" aria-pressed="${s === v.duration}">${s / 60}</button>`).join('');
    els.durText.textContent = durText(v);
  }

  /* Der Satz unter der Dauer wird ERZEUGT, nicht getippt: die Größe
     der Insel folgt aus Kinderzahl und Dauer (wi_build_island, 1,6
     Felder je Kind und Minute, gedeckelt auf 80..900). Stünde hier
     eine feste Zahl, liefe sie beim ersten Nachjustieren des Faktors
     im Server auseinander. */
  function durText(v) {
    const min = Math.round((v.duration || 600) / 60);
    const kids = (v.people || []).length;
    const tiles = Math.round(Math.max(80, Math.min(900, Math.max(kids, 4) * 1.6 * min)));
    return `${min} Minuten` + (kids
      ? ` — bei ${kids} ${kids === 1 ? 'Kind' : 'Kindern'} eine Insel aus etwa ${tiles} Feldern.`
      : ' — die Größe der Insel folgt aus Dauer und Zahl der Kinder.') +
      ' Der Nebel ist nach knapp der halben Zeit weg; danach nimmt man sich Land.';
  }

  /* Eine Spalte je Volk, nebeneinander. Ein Volk ohne Anwesende
     bleibt stehen: es SPIELT mit, es ist nur noch niemand da. */
  function renderLobbyTeams(v) {
    const people = v.people || [];
    let out = '';
    for (let slot = 0; slot < v.team_count; slot++) {
      const mine = people.filter(p => p.team === slot);
      out += teamColHTML(slot, mine.map(p => ({ name: p.name, online: p.online !== false })));
    }
    els.lobbyTeams.innerHTML = out;
  }

  /* Wer noch kein Volk hat und wer gerade nicht am Tablet ist. Zwei
     Sätze, eine Zeile — und beide sagen ausdrücklich, dass niemand
     dadurch außen vor bleibt: wi_room_start verteilt alle Teilnehmer
     des Raums, anders als in Kingdoms. Die Zeile verschwindet ganz,
     wenn es nichts zu sagen gibt; eine leere Überschrift wäre nur
     Lärm. */
  function renderWaiting(v) {
    const people = v.people || [];
    const ohne = people.filter(p => p.team == null);
    const off  = people.filter(p => p.team != null && p.online === false);
    if (!ohne.length && !off.length) {
      els.waiting.hidden = true;
      els.waiting.innerHTML = '';
      return;
    }
    let out = '';
    if (ohne.length) {
      out += `<span class="wi-waitlabel">Noch ohne Volk (${ohne.length}) — beim Start werden sie mit verteilt:</span>` +
        ohne.map(p => `<span class="wi-waitname">${esc(p.name)}</span>`).join('');
    }
    if (off.length) {
      out += `<span class="wi-waitlabel">Gerade nicht am Tablet (${off.length}) — sie spielen trotzdem mit:</span>` +
        off.map(p => `<span class="wi-waitname">${esc(p.name)}</span>`).join('');
    }
    els.waiting.hidden = false;
    els.waiting.innerHTML = out;
  }

  async function onStart() {
    const r = await ctx.actions.call('wi_room_start', {});
    if (!r.ok) {
      return ctx.toast(r.error === 'no_sets'
        ? 'Wähle zuerst mindestens eine Wortliste.'
        : ctx.errText(r.error));
    }
    mapKey = null;              // neue Runde = neue Insel
    tick(true);
  }

  function renderPult(v) {
    const lobby = (v.phase === 'lobby');
    const ended = (v.phase === 'ended');
    els.lobby.hidden = !lobby;
    els.play.hidden  = lobby || ended;
    els.end.hidden   = !ended;
    // Ein Fenster, das beim Start offen stünde, böte Knöpfe an, die
    // der Server ablehnt.
    if (!lobby && setsOpen) closeSets();

    if (lobby) {
      renderModes(v);
      if (!pickBusy) { syncPickFromView(v); renderPick(); }
      renderLobbyTeams(v);
      renderWaiting(v);
      syncSetsFromView(v);
      renderSetSum();
      return;
    }

    if (ended) {
      const win = (v.teams || []).find(t => t.i === v.winner_team);
      els.winner.innerHTML = win
        ? `<img src="${esc(esrc(teamOf(win.i).img))}" alt="">
           ${esc(teamOf(win.i).name)} — ${win.score} Punkte`
        : 'Runde beendet.';
      els.endTeams.innerHTML = teamRow(v);
      loadHard();
      return;
    }

    els.teamsRow.innerHTML = teamRow(v);
    els.clock.textContent = fmtLeft(v.ends_at);
    els.big.hidden = (v.phase !== 'countdown');
  }

  async function loadHard() {
    const r = await ctx.actions.call('wi_hard_words', {});
    if (!r || !r.ok) return;
    els.hard.innerHTML = r.words.length
      ? r.words.map(w => `<div class="wi-hardrow">
            <b>${esc(w.term)}</b><span>${esc(w.trans)}</span>
            <i>${w.wrong}× daneben</i></div>`).join('')
      : '<p class="wi-empty">Nichts ist reihenweise schiefgegangen — schöner Tag.</p>';
  }

  /* ══════════════════════════════════════════════════════════
     Tablet
     ══════════════════════════════════════════════════════════
     Vier Tafeln, wie in Kingdoms: warten · Countdown · spielen ·
     (üben). Die Wartetafel zeigt das EIGENE Volk groß und mit den
     Namen der Gruppe — vor dem Start ist das die einzige Auskunft,
     die am Tablet wirklich zählt; die anderen Völker stehen als
     schmale Zeile darunter.

     Das Üben bleibt erreichbar (die Einzelübung läuft im Server
     ohnehin weiter), aber es steht hinter einem Knopf: wer eine
     Aufgabe vor der Nase hat, sieht nicht mehr, wo er hingehört. */
  const TAB_HTML = `
    <div class="wi wi--tab">
      <section class="wi-pane wi-pane--lobby" data-part="tlobby" hidden>
        <div class="wi-wait"><span class="wi-waitdots"><i></i><i></i><i></i></span>
          <span data-part="waittext">Warten auf den Spielstart …</span></div>
        <div class="wi-myteamwrap" data-part="myteam"></div>
        <div class="wi-others" data-part="othersbox" hidden>
          <div class="wi-otherslabel">Diese Völker landen mit euch</div>
          <div class="wi-otherlist" data-part="others"></div>
        </div>
        <p class="wi-hint" data-part="onlinehint" hidden></p>
        <button type="button" class="wi-btn wi-btn--ghost" data-part="practice">Bis dahin üben</button>
      </section>

      <section class="wi-pane wi-pane--count" data-part="tcount" hidden>
        <div class="wi-countnum" data-part="big">5</div>
        <p class="wi-hint">Gleich geht’s los …</p>
      </section>

      <section class="wi-pane" data-part="tplay" hidden>
        <header class="wi-me" data-part="me"></header>

        <section class="wi-task" data-part="task">
          <p class="wi-ask" data-part="ask"></p>
          <p class="wi-word" data-part="word"></p>
          <form class="wi-type" data-part="typeform">
            <input class="wi-in" data-part="input" autocomplete="off" autocapitalize="off"
                   autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="Antwort">
            <button class="wi-btn" type="submit">Prüfen</button>
          </form>
          <div class="wi-opts" data-part="opts" hidden></div>
          <p class="wi-fb" data-part="fb" hidden></p>
          <button type="button" class="wi-btn wi-btn--ghost wi-back" data-part="back" hidden>
            ← Zurück zur Aufstellung</button>
        </section>

        <div class="wi-pickbar" data-part="pickbar" hidden></div>
        <div class="wi-mapwrap" data-part="mapwrap"><svg class="wi-map" data-part="map"></svg></div>
      </section>
    </div>`;

  function buildTab() {
    root.innerHTML = TAB_HTML;
    els = {
      tlobby: q('tlobby'), tcount: q('tcount'), tplay: q('tplay'),
      waitText: q('waittext'), myTeam: q('myteam'),
      othersBox: q('othersbox'), others: q('others'), onlineHint: q('onlinehint'),
      big: q('big'), back: q('back'),
      me: q('me'), ask: q('ask'), word: q('word'),
      form: q('typeform'), input: q('input'), opts: q('opts'), fb: q('fb'),
      pickbar: q('pickbar'), map: q('map'), mapwrap: q('mapwrap')
    };

    els.form.addEventListener('submit', e => {
      e.preventDefault();
      const val = els.input.value;
      if (!val.trim()) return;
      send(val);
    });
    els.opts.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) send(b.dataset.v);
    });
    q('practice').addEventListener('click', () => { practice = true; if (view) renderTab(view); });
    els.back.addEventListener('click', () => { practice = false; if (view) renderTab(view); });
    els.map.addEventListener('click', onMapClick);
    attachPanZoom(els.mapwrap, els.map);
  }

  async function send(value) {
    if (submitting) return;
    submitting = true;
    els.input.disabled = true;
    try {
      const r = await ctx.actions.call('wi_answer', { p_input: value });
      if (!r.ok) {
        if (r.error === 'too_fast') {
          feedback('warn', `Kurz durchatmen — noch ${r.locked_for} Sekunden.`);
          lockInput(r.locked_for);
        } else {
          ctx.toast(ctx.errText(r.error));
        }
        return;
      }

      if (r.result === 'spell') {
        feedback('near', 'Fast! Welche Schreibweise stimmt?');
      } else if (r.result === 'choice') {
        feedback('warn', 'Welches Wort ist es?');
      } else if (r.result === 'correct') {
        feedback('ok', r.tile ? 'Richtig — ein Feld ist frei!' : 'Richtig!');
      } else {
        feedback('bad', 'Es heißt: ' + r.solution);
        lockInput(r.locked_for);
      }

      if (view) {
        view.me.task   = r.task;
        view.me.streak = r.streak;
        view.me.picks  = r.picks;
      }
      els.input.value = '';
      renderTask(r.task, r.streak, r.picks);
      // Die Karte hat sich bewegt — sofort nachfragen, nicht bis
      // zum nächsten Takt warten. Ein Feld, das vier Sekunden
      // später auftaucht, gehört gefühlt zur nächsten Antwort.
      if (r.result === 'correct') tick(true);
    } finally {
      submitting = false;
      if (!els.input.dataset.locked) els.input.disabled = false;
      els.input.focus();
    }
  }

  function lockInput(secs) {
    if (!secs) return;
    els.input.disabled = true;
    els.input.dataset.locked = '1';
    setTimeout(() => {
      if (destroyed || !els.input) return;
      delete els.input.dataset.locked;
      els.input.disabled = false;
      els.input.focus();
    }, secs * 1000);
  }

  function feedback(kind, text) {
    els.fb.hidden = false;
    els.fb.className = 'wi-fb is-' + kind;
    els.fb.textContent = text;
  }

  function renderTask(task, streak, picks) {
    const has = task && task.prompt;
    els.ask.textContent = !has ? ''
      : (task.dir === 'en_de' ? 'Wie heißt das auf Deutsch?' : 'Wie heißt das auf Englisch?');
    els.word.textContent = has ? task.prompt : 'Keine Wörter gewählt.';

    const opts = (has && task.options) || [];
    els.opts.hidden = !opts.length;
    els.form.hidden = !has || opts.length > 0;
    if (opts.length) {
      els.opts.innerHTML = opts
        .map(o => `<button type="button" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    }

    /* Dieselbe Leiste trägt zwei Sachen, und das ist Absicht: sie ist
       der Ort, an dem die Serie sichtbar wird. Erst zählt sie hin
       („noch 2"), dann fordert sie auf („zeig, wohin"). Zwei
       getrennte Kästen hätten einen davon immer leer stehen lassen. */
    const goal = Math.max(0, STREAK_GOAL - (streak || 0));
    els.pickbar.hidden = !(picks > 0 || (streak > 0 && goal > 0));
    els.pickbar.classList.toggle('is-pick', picks > 0);
    if (picks > 0) {
      els.pickbar.innerHTML =
        `<b>Zeig, wohin!</b> Tipp auf ein Feld an eurem Rand${picks > 1 ? ` (${picks} frei)` : ''}.`;
    } else if (streak > 0 && goal > 0) {
      els.pickbar.innerHTML =
        `Serie ${streak} — noch ${goal} richtige, dann zeigst du selbst, welches Feld fällt.`;
    }
    picking = picks > 0;
    els.map.classList.toggle('is-picking', picking);
  }

  /* Die anderen Völker: Bild, Name, Kopfzahl. Mehr nicht — wer sonst
     noch mitspielt, ist eine Nebeninformation, und die NAMEN der
     anderen Kinder bekommt das Tablet gar nicht erst (0133). */
  function othersHTML(v, myTeam) {
    let out = '';
    (v.teams || []).forEach(t => {
      if (t.i === myTeam) return;
      const T = teamOf(t.i);
      out += `<div class="wi-other" style="--wi-team:${T.color}">
                <div class="wi-otherpic"><img src="${esc(esrc(T.img))}" alt=""></div>
                <span class="wi-othername">${esc(T.name)}</span>
                <span class="wi-othern">${t.people}</span>
              </div>`;
    });
    return out;
  }

  function renderTabLobby(v) {
    const myTeam = v.me.team;
    const mine = (v.teams || []).find(t => t.i === myTeam);
    els.waitText.textContent = (v.phase === 'ended')
      ? 'Runde vorbei — warten auf die nächste …'
      : 'Warten auf den Spielstart …';

    // myTeam ist für den Aufrufer praktisch immer gesetzt (wer
    // wi_view aufruft, ist per Definition online) — die Prüfung ist
    // trotzdem defensiv, statt eine Spalte in der Farbe von „Volk
    // NaN" zu zeichnen.
    els.myTeam.innerHTML = (myTeam == null)
      ? '<p class="wi-hint">Dein Volk bekommst du gleich zugeteilt.</p>'
      : teamColHTML(myTeam, v.my_team_members || [],
                    { mine: true, count: mine ? mine.people : null });

    els.others.innerHTML = othersHTML(v, myTeam);
    els.othersBox.hidden = ((v.teams || []).length <= (myTeam == null ? 0 : 1));

    // Der leere Absatz muss WEG, nicht nur leer sein: die Tafel ist
    // eine Flex-Spalte mit Abstand, ein leerer Absatz darin wäre eine
    // sichtbare Lücke unter der Liste.
    const hint = (v.online_count != null && v.room_total != null && v.room_total > v.online_count)
      ? `${v.online_count} von ${v.room_total} im Raum sind gerade am Tablet — beim Start sind alle dabei.`
      : '';
    els.onlineHint.textContent = hint;
    els.onlineHint.hidden = !hint;
  }

  function renderTab(v) {
    const arena = (v.phase === 'running');
    const count = (v.phase === 'countdown');
    // Ein Phasenwechsel beendet das Üben: nach dem Ende einer Runde
    // soll die Klasse wieder auf dieselbe Tafel sehen.
    if (v.phase !== lastPhase) { practice = false; lastPhase = v.phase; }

    const showPlay = arena || (!count && practice);
    els.tlobby.hidden = arena || count || practice;
    els.tcount.hidden = !count;
    els.tplay.hidden  = !showPlay;
    if (count) return;          // fünf Sekunden nur die Zahl
    if (!showPlay) { renderTabLobby(v); return; }

    const T = teamOf(v.me.team);
    const mine = (v.teams || []).find(t => t.i === v.me.team);

    els.me.style.setProperty('--wi-team', T.color);
    els.me.innerHTML = `
      <img src="${esc(esrc(T.img))}" alt="">
      <div>
        <b>${esc(T.name)}</b>
        <span>${arena ? `${mine ? mine.score : 0} Punkte · Serie ${v.me.streak}` : 'Übungsrunde'}</span>
      </div>
      <span class="wi-time">${arena ? fmtLeft(v.ends_at) : ''}</span>`;

    els.mapwrap.hidden = !arena;
    els.back.hidden = arena;
    if (!arena && els.fb.hidden) {
      feedback('idle', 'Die Arena läuft gerade nicht — üben kannst du trotzdem.');
    }
    renderTask(v.me.task, v.me.streak, v.me.picks);
    if (v.me.locked_for > 0) lockInput(v.me.locked_for);
  }

  async function onMapClick(e) {
    if (!picking) return;
    const cell = e.target.closest('.wi-cell');
    if (!cell) return;
    const r = await ctx.actions.call('wi_pick_tile',
      { p_r: +cell.dataset.r, p_c: +cell.dataset.c });
    if (!r.ok) {
      ctx.toast(r.error === 'not_reachable'
        ? 'Das Feld grenzt nicht an euer Gebiet.'
        : r.error === 'tile_busy'
          ? 'Zu spät — da war gerade jemand anders.'
          : ctx.errText(r.error));
      return;
    }
    if (view) view.me.picks = r.picks;
    renderTask(view && view.me.task, view && view.me.streak, r.picks);
    tick(true);
  }

  /* ══════════════════════════════════════════════════════════
     Takt
     ══════════════════════════════════════════════════════════ */
  async function tick(force) {
    if (destroyed || busy) return;
    if (!force && document.hidden) return;
    busy = true;
    try {
      const fn = role === 'presenter' ? 'wi_room_get' : 'wi_view';
      // Die Karte nur holen, wenn wir sie brauchen: beim ersten Mal
      // und nach jeder neuen Runde.
      const v = await ctx.actions.call(fn, { p_full: (mapKey === null) });
      if (destroyed || !v) return;
      if (!v.ok) {
        // Netzfehler und room_gone unterscheiden sich hier nicht in
        // der Behandlung: beim nächsten Takt noch einmal. Eine
        // Meldung je Takt wäre eine Meldung alle vier Sekunden.
        return;
      }
      applyView(v);
    } finally {
      busy = false;
    }
  }

  function applyView(v) {
    view = v;

    // Erst die Völker, dann alles, was Farben und Namen daraus zieht.
    if (Array.isArray(v.factions) && v.factions.length &&
        v.factions.join(',') !== factions.join(',')) {
      factions = v.factions.slice();
      ownPainted = null;      // dieselben Slots, andere Farben
    }

    /* Eine Antwort MIT `map` ist die Antwort auf unsere Frage danach —
       auch wenn die Liste leer ist. Genau das ist der Zustand der
       Lobby: das Board steht, die Insel wird erst beim Start
       gewürfelt. Stünde hier `v.map.length`, fiele die leere Liste in
       den Zweig darunter, forderte die Karte wieder an, bekäme wieder
       eine leere — und käme nie bis zum Zeichnen: die Lobby am Pult
       bliebe leer, solange in dem Raum noch keine Runde lief. */
    if (Array.isArray(v.map)) {
      cells = v.map;
      buildMap(els.map, cells);
      mapKey = v.map_key;
    } else if (v.map_key && v.map_key !== mapKey) {
      // Neue Insel, aber wir haben nur die Besitzverhältnisse: die
      // Karte muss nachgefordert werden. Passiert genau einmal je
      // Runde.
      //
      // Der Nachschlag geht über setTimeout und nicht direkt: wir
      // stecken hier IM Takt, und `busy` ist noch gesetzt — ein
      // tick() von hier aus fiele lautlos durch die eigene Sperre,
      // und die neue Insel käme erst beim übernächsten Takt.
      mapKey = null;
      setTimeout(() => tick(true), 0);
      return;
    }
    if (mapKey) paintOwn(v.own);

    if (role === 'presenter') renderPult(v); else renderTab(v);
  }

  /* ══════════════════════════════════════════════════════════
     Werkzeug-Schnittstelle
     ══════════════════════════════════════════════════════════ */
  window.MPTool.register('wordisland', {
    /* Leer, und zwar mit Absicht: Units, Richtung, Dauer und Völker
       stehen im Pult und nicht im generischen Einstellungen-Fach. Die
       Lehrkraft soll die Unit MITTEN im Kurs wechseln können — ein
       Formular beim Anlegen des Raums kann das nicht, und zwei Orte
       für dieselbe Einstellung wären eine Frage zu viel. */
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; role = ctx.role;
      destroyed = false; busy = false; view = null;
      mapKey = null; cells = []; cellEls = []; homeImgs = {};
      ownPainted = null; submitting = false; picking = false;
      sets = { list: [], chosen: [] }; setsBusy = 0; tab = 'units'; setsOpen = false;
      factions = [0, 1, 2, 3]; pickSel = []; pickBusy = 0;
      practice = false; lastPhase = null;

      if (role === 'presenter') buildPult(); else buildTab();

      // Am Beamer soll die Insel allen Platz bekommen — dieselbe
      // Klasse wie bei NeuroLab, Cäsar und Clash.
      if (role === 'presenter' && !(ctx && ctx.preview)) {
        document.body.classList.add('tool-fill');
      }

      onResize = () => { if (view) { /* das SVG skaliert selbst */ } };
      window.addEventListener('resize', onResize);

      startTimer();
      pollTimer = setInterval(() => tick(false), POLL_MS[role] || 4000);
      tick(true);
    },

    // Der Seiten-Poller hat etwas Neues gesehen. Für uns meist
    // bedeutungslos, aber ein billiger zusätzlicher Anstoß.
    update() { tick(false); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      stopTimer();
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      root = ctx = null; role = null; view = null;
      els = {}; cells = []; cellEls = []; homeImgs = {}; ownPainted = null;
    }
  });
})();
