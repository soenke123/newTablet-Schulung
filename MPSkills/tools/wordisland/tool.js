/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Myth of Wordisland"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Sechster Skill, erster im Fach Englisch, zweites Team-Spiel nach
   Kingdoms of Mathoria — und wie dieses eines mit EIGENEN Tabellen
   statt der generischen Inhaltsschicht (Migrationen 0130/0131).

   ── Ein Modul, zwei Rollen ────────────────────────────────────
   Am Beamer steht das Pult (Units wählen, Völker einstellen,
   starten, zusehen), am Tablet die Aufgabe und die Insel. Das ist
   dasselbe Werkzeug in zwei Rollen: ctx.role entscheidet, welches
   DOM gebaut wird, ctx.actions.call trägt die Rolle in den Server
   (p_token bzw. p_code, siehe lib/tool.js).

   ── Warum ein eigener Takt ────────────────────────────────────
   Der Seiten-Poller ruft skill_view/skill_room_get — die generische
   Ansicht, in der von dieser Insel nichts steht. Wordisland fragt
   deshalb selbst (wi_view/wi_room_get), genau wie Clash. update()
   des Seiten-Pollers wird trotzdem angenommen: ein zusätzlicher
   Anstoß schadet nicht.

   ── Karte einmal bauen, Besitz je Takt malen ──────────────────
   Der Server schickt die Felder (`map`) nur, wenn man danach fragt,
   und danach je Takt eine Zeichenkette mit EINEM Zeichen je Feld
   (`own`: '.' = Nebel, '0'..'5' = Volk). Bei 500 Feldern sind das
   500 Byte statt 12 KB — dreißigmal alle vier Sekunden. Das SVG
   wird deshalb einmal gebaut und danach nur noch umgefärbt; neu
   gebaut wird es erst, wenn `map_key` wechselt (= neue Runde, neue
   Insel).

   ── Die Bilder der Völker ─────────────────────────────────────
   ⚠️ VORLÄUFIG geliehen aus tools/clash-of-math/sprites/. Eigene
   Bilder kommen nach; dann ändert sich nur TEAMS[].img und der
   Ordner darunter. Der Pfad ist absichtlich der volle ab MPSkills/:
   ein in tool.js gebautes <img>/<image> löst relativ zur SEITE auf
   (j.html, lehrer.html), nicht relativ zu dieser Datei.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Die Völker ────────────────────────────────────────────
     Index = Volk, in allen Listen dieselbe Reihenfolge. Namen und
     Bilder kommen aus Kingdoms; die Farben sind dieselben wie dort,
     damit ein Kind, das beide Spiele kennt, sich nicht umgewöhnen
     muss.                                                        */
  const ASSET_DIR = 'tools/clash-of-math/sprites/';
  const TEAMS = [
    { name: 'Toast-Ritter',      color: '#ef4444', img: 'red ToastKnights.png' },
    { name: 'Robo-Enten',        color: '#3b82f6', img: 'blue roboDucks.png' },
    { name: 'Brokkoli-Giraffen', color: '#10b981', img: 'green BrokkoliGiraffen.png' },
    { name: 'Mal-Hasen',         color: '#f59e0b', img: 'yellow PainingBunnies.png' },
    { name: 'Kosmische Katzen',  color: '#a855f7', img: 'lila cosmicCat.png' },
    { name: 'Okto-Pferdchen',    color: '#06b6d4', img: 'türkis OctoPferdchen.png' }
  ];
  const esrc = name => encodeURI(ASSET_DIR + name);

  const SVGNS = 'http://www.w3.org/2000/svg';
  const POLL_MS = { participant: 4000, presenter: 3000 };

  /* Eine Serie ab drei — dieselbe Zahl steht im Server
     (wi_answer). Hier nur für den Text „noch 2 bis zur freien
     Wahl"; entschieden wird es dort. */
  const STREAK_GOAL = 3;

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
  let tab = 'units';
  let submitting = false;
  let timerHandle = null;
  let onResize = null;
  let picking = false;      // Tablet: wartet auf einen Fingertipp aufs Feld

  const esc = s => (ctx ? ctx.esc(s) : String(s == null ? '' : s));
  const teamOf = i => TEAMS[i] || { name: 'Volk ' + (i + 1), color: '#888', img: '' };

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
     und „ruckelt". */
  function paintOwn(own) {
    if (!own || own.length !== cellEls.length) return;
    for (let i = 0; i < own.length; i++) {
      const ch = own[i];
      if (ownPainted && ownPainted[i] === ch) continue;
      cellEls[i].dataset.t = ch;
      const im = homeImgs[i];
      if (im && ch !== '.') {
        const want = esrc(teamOf(+ch).img);
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
      if (!view || !els.clock) return;
      els.clock.textContent = fmtLeft(view.ends_at);
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
     ══════════════════════════════════════════════════════════ */
  const PULT_HTML = `
    <div class="wi wi--pult">
      <section class="wi-lobby" data-part="lobby">
        <div class="wi-grid">
          <div class="wi-card">
            <div class="wi-tabs" role="tablist">
              <button class="wi-tab is-on" data-tab="units">Units</button>
              <button class="wi-tab" data-tab="own">Eigene</button>
            </div>
            <div class="wi-sets" data-part="sets"></div>
            <form class="wi-import" data-part="import" hidden>
              <input class="wi-in" data-part="imp-title" maxlength="60" placeholder="Name der Liste, z. B. Unit 3">
              <textarea class="wi-in wi-ta" data-part="imp-text" rows="6"
                placeholder="Eine Zeile je Wortpaar:&#10;Haus - house&#10;der Schüler - pupil / student&#10;Tafel;board"></textarea>
              <button class="wi-btn" type="submit">Liste anlegen</button>
            </form>
          </div>

          <div class="wi-card">
            <h3>Wie gespielt wird</h3>
            <label class="wi-row"><span>Völker</span>
              <input type="range" min="2" max="6" step="1" data-part="teams">
              <output data-part="teams-out"></output></label>
            <label class="wi-row"><span>Spieldauer</span>
              <select data-part="dur">
                <option value="300">5 Minuten</option>
                <option value="600">10 Minuten</option>
                <option value="900">15 Minuten</option>
                <option value="1200">20 Minuten</option>
              </select></label>
            <label class="wi-row"><span>Richtung</span>
              <select data-part="dir">
                <option value="mixed">gemischt</option>
                <option value="de_en">Deutsch → Englisch</option>
                <option value="en_de">Englisch → Deutsch</option>
              </select></label>
            <label class="wi-row"><span>Abfrage</span>
              <select data-part="mode">
                <option value="type">tippen (mit Hilfe bei Fehlern)</option>
                <option value="choice">nur Auswahl aus acht</option>
              </select></label>
          </div>

          <div class="wi-card">
            <h3>Aufstellung</h3>
            <div class="wi-people" data-part="people"></div>
            <button class="wi-btn wi-btn--ghost" data-part="shuffle">Neu mischen</button>
          </div>
        </div>
        <button class="wi-btn wi-btn--go" data-part="start">Schiffe klarmachen</button>
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
    </div>`;

  function q(part) { return root.querySelector(`[data-part="${part}"]`); }

  function buildPult() {
    root.innerHTML = PULT_HTML;
    els = {
      lobby: q('lobby'), play: q('play'), end: q('end'),
      sets: q('sets'), imp: q('import'), people: q('people'),
      teams: q('teams'), teamsOut: q('teams-out'),
      dur: q('dur'), dir: q('dir'), mode: q('mode'),
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
    els.teams.addEventListener('input', () => {
      els.teamsOut.textContent = els.teams.value;
    });
    els.teams.addEventListener('change', () => saveSetup({ p_teams: +els.teams.value }));
    els.dur.addEventListener('change',  () => saveSetup({ p_duration: +els.dur.value }));
    els.dir.addEventListener('change',  () => saveSetup({ p_direction: els.dir.value }));
    els.mode.addEventListener('change', () => saveSetup({ p_mode: els.mode.value }));

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

  async function loadSets() {
    const r = await ctx.actions.call('wi_sets_list', {});
    if (!r || !r.ok) return;
    sets.list = r.sets || [];
    sets.chosen = (r.chosen || []).map(String);
    renderSets();
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
    saveSetup({ p_sets: sets.chosen });
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

  async function saveSetup(args) {
    const r = await ctx.actions.call('wi_room_setup', args);
    if (!r.ok) ctx.toast(ctx.errText(r.error));
    tick(true);
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

    if (lobby) {
      if (document.activeElement !== els.teams) {
        els.teams.value = v.team_count;
        els.teamsOut.textContent = v.team_count;
      }
      els.dur.value  = v.duration;
      els.dir.value  = v.direction;
      els.mode.value = v.mode;
      els.people.innerHTML = (v.people || []).map(p => {
        const T = teamOf(p.team);
        return `<span class="wi-chip" style="--wi-team:${p.team == null ? 'var(--ink-faint)' : T.color}">
                  ${esc(p.name)}${p.team == null ? '' : ' · ' + esc(T.name)}</span>`;
      }).join('') || '<p class="wi-empty">Noch ist niemand im Raum.</p>';
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
     ══════════════════════════════════════════════════════════ */
  const TAB_HTML = `
    <div class="wi wi--tab">
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
      </section>

      <div class="wi-pickbar" data-part="pickbar" hidden></div>
      <div class="wi-mapwrap" data-part="mapwrap"><svg class="wi-map" data-part="map"></svg></div>
    </div>`;

  function buildTab() {
    root.innerHTML = TAB_HTML;
    els = {
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

  function renderTab(v) {
    const T = teamOf(v.me.team);
    const mine = (v.teams || []).find(t => t.i === v.me.team);
    const arena = (v.phase === 'running' || v.phase === 'countdown');

    els.me.style.setProperty('--wi-team', T.color);
    els.me.innerHTML = `
      <img src="${esc(esrc(T.img))}" alt="">
      <div>
        <b>${esc(T.name)}</b>
        <span>${arena ? `${mine ? mine.score : 0} Punkte · Serie ${v.me.streak}` : 'Übungsrunde'}</span>
      </div>
      <span class="wi-time">${arena ? fmtLeft(v.ends_at) : ''}</span>`;

    els.mapwrap.hidden = !arena;
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

    if (Array.isArray(v.map) && v.map.length) {
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
    /* Leer, und zwar mit Absicht: Units, Richtung, Dauer und
       Völkerzahl stehen im Pult und nicht im generischen
       Einstellungen-Fach. Die Lehrkraft soll die Unit MITTEN im
       Kurs wechseln können — ein Formular beim Anlegen des Raums
       kann das nicht, und zwei Orte für dieselbe Einstellung wären
       eine Frage zu viel. */
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; role = ctx.role;
      destroyed = false; busy = false; view = null;
      mapKey = null; cells = []; cellEls = []; homeImgs = {};
      ownPainted = null; submitting = false; picking = false;
      sets = { list: [], chosen: [] }; tab = 'units';

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
