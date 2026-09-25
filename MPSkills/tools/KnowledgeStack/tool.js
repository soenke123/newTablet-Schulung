/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — tool.js   ·   Das Live-Quiz der Klasse
   ══════════════════════════════════════════════════════════════
   Ein Werkzeug, zwei Rollen (lib/tool.js): am Beamer steht die
   Frage, auf den Tablets stehen die Antworten. Wer was sieht, ist
   keine Geschmacksfrage, sondern die Spielregel:

     Beamer    Frage · Uhr · vier Antwortfelder · Auflösung mit den
               fünf Ersten und den Füllständen · Siegerehrung.
     Tablet    Das EIGENE Wesen und vier Antwortfelder. KEINE Frage
               — sonst sehen 28 Köpfe nach unten statt nach vorn.
               In der Auflösung: der Nachbar vor mir, ich, der
               Nachbar hinter mir. Unten vier Emote-Knöpfe.

   ── Was hier anders ist als in der ersten Fassung ─────────────

   1. EIN Bild passt auf EINEN Bildschirm. Der Rahmen wird gemessen
      (fit(), wie NeuroLab und Cäsar) und gibt seine Höhe als
      --ks-h weiter; alles darin rechnet daraus. Vorher stand
      `min-height: 100vh` im tool.css — und weil über dem Werkzeug
      die Kopfzeile und die Reiterleiste stehen, war die Bühne
      garantiert höher als der Bildschirm. Auf dem Beamer sah das
      aus wie ein Fehler, und auf dem Tablet fehlte der vierte
      Antwortknopf.

   2. Es wird GEFLICKT, nicht neu gebaut. Ein `innerHTML =` je Takt
      reißt jede CSS-Animation ab: die Wesen atmeten nicht, ein
      Winken dauerte höchstens einen Takt, und die Uhr sprang. Jetzt
      entsteht das DOM einmal je Bild (frameKey) und danach ändern
      sich nur Zahlen, Breiten und Emote-Klassen.

   3. Die Emote-Klassen heißen jetzt so, wie sie in creatures.css
      wirklich stehen: `wave-7 state-wave`, `cheer-7 state-cheer`,
      `c-dance-7 state-dance`. Vorher standen dort `c-wave`,
      `c-cheer`, `c-sad` — Klassen, die es nirgends gibt. Deshalb
      hat in der ersten Fassung KEIN Emote etwas getan, und es sah
      aus, als käme der Klick nicht an.

   4. Kein PIN und kein QR-Code mehr im Werkzeug. Beides stand
      vorher hier — und blieb leer, weil es dafür ctx.room.code und
      MPRoom.qrSVG gebraucht hätte, und keines von beiden gibt es.
      Es gehört auch nicht hierher: der Code steht in der
      Reiterleiste auf JEDEM Fach, der QR-Code am Griff am rechten
      Rand (lehrer.js). Ein zweiter Ort für dieselbe Sache wäre der,
      der irgendwann nicht mitgezogen wird.

   5. Kein Namensfeld. Den Namen hat das Kind beim Betreten des
      Raums schon eingegeben (j.js) — hier noch einmal danach zu
      fragen, erzeugte zwei Namen für ein Kind.

   6. Die Uhr läuft auf dem Server ab (Migration 0175). Diese Datei
      zeigt sie nur an; bei 0 holt sie einmal nach. Vorher schaltete
      sie selbst weiter — und wenn der Beamer-Tab im Hintergrund
      lag, drosselte der Browser den Takt und die Frage blieb offen.
      Dazu wird die Uhr gegen `server_now` gestellt: ein iPad, das
      zwei Minuten falsch geht, zeigte sonst zwei Minuten falsch.

   ── Cache ─────────────────────────────────────────────────────
   ASSET_V gilt für creatures.js UND creatures.css. Beides wird von
   hier geladen und nicht per @import aus dem tool.css: sonst gäbe
   es zwei Stempel für dieselbe Sache, und der zweite wäre der
   vergessene. Der Stempel dieser Datei selbst steht in lib/tool.js
   — und dessen eigener in j.html, lehrer.html, insel.html und
   lib/preview.js (siehe Kopf von lib/tool.js: fünf Stellen).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const ASSET_V = '20260926a';

  /* Takt je Phase, in Millisekunden. Während der Frage muss der
     Beamer zügig mitzählen („17 von 28 haben geantwortet") — in der
     Lobby reicht gemütlich. Das Tablet fragt etwas seltener: 28
     Geräte im Sekundentakt sind 28 Anfragen je Sekunde, und zu
     sehen gibt es dort während der Frage ohnehin nur die Uhr, und
     die läuft lokal. */
  const TAKT = {
    presenter:   { lobby: 2500, question: 1000, reveal: 1500, ended: 2500 },
    participant: { lobby: 3000, question: 1500, reveal: 1800, ended: 3000 }
  };

  const LABELS  = ['A', 'B', 'C', 'D'];
  const EMOTES  = [
    { id: 'wave',  icon: '👋', title: 'Winken' },
    { id: 'cheer', icon: '🎉', title: 'Jubeln' },
    { id: 'dance', icon: '🕺', title: 'Tanzen' },
    { id: 'sleep', icon: '😴', title: 'Schlafen' }
  ];
  const EMOTE_ICON = { wave: '👋', cheer: '🎉', dance: '🕺', sleep: '😴', sad: '💧', jump: '⬆️' };

  /* Wie lange ein Emote zu sehen ist. MUSS zu den 3,5 Sekunden in
     Migration 0175 passen: der Server gibt ein älteres Emote nicht
     mehr heraus, und was hier länger stehenblieb, verschwände beim
     nächsten Takt mitten in der Bewegung. */
  const EMOTE_MS = 3500;

  /* Die Fehler, die nur dieses Werkzeug kennt. Die generischen
     stehen in lib/tool.js und werden von dort geerbt; durchgereicht
     werden kann eine eigene Liste nicht (makeCtx bekommt `errors`
     nur von der Seite), also steht sie hier davor. Ohne das läse die
     Lehrkraft „Unerwarteter Fehler (no_questions)" — und das ist
     keine Auskunft, sondern ein Rätsel. */
  const EIGENE = {
    no_questions:       'In diesem Fragenkatalog steht keine einzige Frage. '
                      + 'Wähle oben einen anderen.',
    not_active:         'Diese Frage ist schon vorbei.',
    time_up:            'Die Zeit war um.',
    already_answered:   'Du hast schon geantwortet.',
    question_not_found: 'Diese Frage gibt es nicht mehr — der Katalog hat sich geändert.',
    phase_locked:       'Das geht nur zwischen zwei Fragen.'
  };
  const fehlerText = code => EIGENE[code] || ctx.errText(code);

  /* ─── Zustand ───────────────────────────────────────────── */
  let root = null, ctx = null, role = null;
  let frame = null;              // der gemessene Rahmen
  let stage = null;              // das Bild darin
  let els = {};                  // benannte Stellen des aktuellen Bildes
  let pollTimer = null, clockTimer = null, onResize = null;
  let destroyed = false, busy = false;
  let lastSig = null, lastFrame = null, view = null;
  let skew = 0;                  // Serveruhr minus Geräteuhr, in ms
  let myCreature = 0, mySkin = 0;
  let profileT = null;           // Entprellung des Wesen-Speicherns
  let localEmote = null, localEmoteT = null;
  let answering = false;         // gedrückt, Antwort noch unterwegs
  let catalogs = [];
  /* Die Wesenwahl nach der Siegerehrung. Sie steckt im frameKey und
     nicht in einem <details>: ein aufgeklappter Kasten wäre beim
     nächsten Takt wieder zu — und sie muss auch dann stehenbleiben,
     wenn nebenher noch Punkte und Emotes hereinkommen. */
  let pickerOffen = false;

  /* ══════════════════════════════════════════════════════════
     Bausteine
     ══════════════════════════════════════════════════════════ */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Die Klassen, mit denen creatures.css ein Wesen bewegt. Der Name
     trägt die Wesen-Nummer, weil jedes der 36 Wesen sein eigenes
     Winken hat (ein Krebs winkt mit der Schere). `state-…` schaltet
     zusätzlich das Gesicht um. */
  function emoteClass(emote, cid) {
    if (!emote || emote === 'idle') return 'c-idle';
    if (emote === 'dance') return 'c-dance-' + cid + ' state-dance';
    return emote + '-' + cid + ' state-' + emote;
  }

  function wesen(cid, skin, emote, sizeCss) {
    const id = Number(cid) || 0;
    const inner = (window.KSCreatures && window.KSCreatures.svg)
      ? window.KSCreatures.svg(id, Number(skin) || 0, emoteClass(emote, id), null)
      : '<svg class="creature-svg" viewBox="0 0 100 100"></svg>';
    return '<span class="ks-wesen"'
      + (sizeCss ? ' style="--ks-wsize:' + sizeCss + '"' : '') + '>' + inner + '</span>';
  }

  // Ein bestehendes Wesen umschalten, ohne das SVG neu zu bauen —
  // sonst fängt das Atmen bei jedem Takt von vorn an.
  function setEmote(host, emote, cid) {
    if (!host) return;
    const svg = host.matches && host.matches('svg') ? host : host.querySelector('svg');
    if (!svg) return;
    const want = 'creature-svg ' + emoteClass(emote, cid);
    if (svg.getAttribute('class') !== want) svg.setAttribute('class', want);
  }

  const pkt = n => (Number(n) || 0).toLocaleString('de-DE');

  const wesenDaten = cid => ((window.KSCreatures && window.KSCreatures.list) || [])
    .find(c => c.id === (cid | 0)) || null;
  const wesenName = cid => (wesenDaten(cid) || {}).name || '';

  /* Die drei Farbknöpfe. Sie tragen die Namen aus creatures.js
     („Neon Slime") und nicht „Farbe 1" — dieselbe Benennung wie im
     Showroom, und ein Name bleibt im Kopf, wo eine Zahl nichts sagt.
     Weil sie je Wesen anders heißen, werden sie beim Wechsel des
     Wesens mitgezogen (malVorschau). */
  function skinKnoepfe() {
    const namen = (wesenDaten(myCreature) || {}).skins || ['Farbe 1', 'Farbe 2', 'Farbe 3'];
    return namen.map((n, s) => '<button type="button" class="ks-skin'
      + (s === mySkin ? ' is-on' : '') + '" data-skin="' + s + '">'
      + esc(n) + '</button>').join('');
  }

  function deltaHTML(d) {
    const v = Number(d) || 0;
    const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'same';
    const txt = v > 0 ? '▲ ' + v : v < 0 ? '▼ ' + Math.abs(v) : '–';
    return '<span class="ks-delta ks-delta--' + cls + '">' + txt + '</span>';
  }

  /* ══════════════════════════════════════════════════════════
     Höhe: einmal gemessen, überall gerechnet
     ══════════════════════════════════════════════════════════
     Über dem Rahmen steht je Rolle etwas anderes (Kopfzeile,
     Reiterleiste), und je Breite ist das unterschiedlich hoch.
     getBoundingClientRect().top ist die einzige Angabe, die das
     ohne eine Liste von Sonderfällen beantwortet — dieselbe
     Rechnung wie in tools/NeuroLab/tool.js.

     Genommen wird `--vv-h` (viewport.js) und nicht innerHeight:
     auf dem iPad steht beim Tippen die Tastatur im Bild, und
     innerHeight weiß davon nichts.                             */
  const LUFT = 10;
  /* Die Untergrenze. 240 und nicht 380: ein Handy im Querformat ist
     390 Punkte hoch, davon gehen Kopfzeile und Reiterleiste ab — es
     bleiben knapp 280. Mit 380 schob sich der Rahmen 99 Punkte unter
     die Bildschirmkante, und genau dort steht auf dem Tablet die
     vierte Antwortkachel. 240 ist die Höhe, bei der ein Kopf, ein
     Zeitbalken und vier Kacheln mit 48 Punkten noch hineingehen. */
  const MIN = 240;

  function raumDarunter(el) {
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

  function fit() {
    if (!frame) return;
    const sicht = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--vv-h')) || window.innerHeight;
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, Math.round(sicht - top - raumDarunter(frame) - LUFT));
    frame.style.height = h + 'px';
    frame.style.setProperty('--ks-h', h + 'px');
    /* Unter 360 Punkten wird es eng — ein Handy im Querformat, oder
       ein iPad mit offener Tastatur. Dann fällt weg, was begleitet
       (Hinweise, der Name des Wesens), damit stehen bleibt, was
       bedient wird. Als Klasse und nicht als Media Query: gemessen
       wird der RAHMEN und nicht der Bildschirm, und dazwischen liegt
       die halbe Seite. */
    frame.classList.toggle('ks-frame--flach', h < 360);
  }

  /* ══════════════════════════════════════════════════════════
     Die Uhr
     ══════════════════════════════════════════════════════════ */
  function restMs() {
    if (!view || !view.phase_ends_at) return null;
    return new Date(view.phase_ends_at).getTime() - (Date.now() + skew);
  }

  function clockTick() {
    const ms = restMs();
    if (ms == null) return;
    const sek = Math.max(0, Math.ceil(ms / 1000));
    const lim = (view.question && view.question.time_limit) || 20;
    if (els.clock) els.clock.textContent = String(sek);
    if (els.bar) {
      const anteil = Math.max(0, Math.min(1, ms / (lim * 1000)));
      els.bar.style.width = (anteil * 100).toFixed(1) + '%';
      els.bar.classList.toggle('ks-bar--eilig', sek <= 5);
    }
    if (els.clock) els.clock.classList.toggle('ks-clock--eilig', sek <= 5);

    // Bei 0 einmal nachfragen: geschlossen hat die Frage der Server
    // (ks_ensure_board), hier wird es nur sichtbar gemacht.
    if (ms <= 0) {
      stopClock();
      poll();
    }
  }

  function startClock() {
    stopClock();
    if (restMs() == null) return;
    clockTick();
    clockTimer = setInterval(clockTick, 250);
  }
  function stopClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = null; }

  /* ══════════════════════════════════════════════════════════
     Takt
     ══════════════════════════════════════════════════════════ */
  function takt() {
    const ph = (view && view.phase) || 'lobby';
    return (TAKT[role] && TAKT[role][ph]) || 2500;
  }

  function planPoll() {
    if (pollTimer) clearTimeout(pollTimer);
    if (destroyed) return;
    pollTimer = setTimeout(poll, takt());
  }

  async function poll() {
    if (destroyed || busy || !ctx) { if (!destroyed) planPoll(); return; }
    busy = true;
    try {
      const sigFn  = role === 'presenter' ? 'ks_room_sig' : 'ks_sig';
      const viewFn = role === 'presenter' ? 'ks_room_get' : 'ks_view';

      const s = await ctx.actions.call(sigFn, {});
      if (destroyed) return;
      if (!s || !s.ok) { zeigeFehler(s && s.error); return; }

      if (s.sig === lastSig && view) return;

      const v = await ctx.actions.call(viewFn, {});
      if (destroyed) return;
      if (!v || !v.ok) { zeigeFehler(v && v.error); return; }

      lastSig = s.sig;
      uebernimm(v);
    } catch (e) {
      console.warn('[knowledgestack] Takt:', e && e.message);
    } finally {
      busy = false;
      if (!destroyed) planPoll();
    }
  }

  function zeigeFehler(code) {
    if (!code) return;
    // 'unknown_token' und Freunde nur EINMAL melden: ein Toast je
    // Takt wäre eine Wand aus Meldungen.
    if (zeigeFehler.last === code) return;
    zeigeFehler.last = code;
    ctx.toast(fehlerText(code), true);
  }

  function uebernimm(v) {
    zeigeFehler.last = null;
    if (v.server_now) {
      const t = new Date(v.server_now).getTime();
      if (!isNaN(t)) skew = t - Date.now();
    }
    if (Array.isArray(v.catalogs)) catalogs = v.catalogs;
    if (v.me) {
      // Wer sein Wesen gerade ausgewählt hat, soll es nicht durch
      // eine Serverantwort zurückgesetzt bekommen, die noch von
      // davor stammt. Deshalb nur übernehmen, solange nichts
      // ungespeichert aussteht.
      if (!profileT) { myCreature = v.me.creature_id | 0; mySkin = v.me.skin_idx | 0; }
    }
    view = v;
    zeichne();
  }

  /* ══════════════════════════════════════════════════════════
     Zeichnen: einmal bauen je Bild, danach flicken
     ══════════════════════════════════════════════════════════ */
  function frameKey(v) {
    const ph = v.phase || 'lobby';
    return role + '|' + ph
      + '|' + (ph === 'question' || ph === 'reveal' ? v.current_q_idx : '-')
      + '|' + (pickerOffen ? 'pick' : '-');
  }

  function zeichne() {
    if (!stage || !view) return;
    const key = frameKey(view);
    if (key !== lastFrame) {
      lastFrame = key;
      answering = false;
      els = {};
      stage.className = 'ks-stage ks-stage--' + (role === 'presenter' ? 'beam' : 'tab')
                     + ' ks-stage--' + view.phase;
      stage.innerHTML = (role === 'presenter' ? baueBeam : baueTab)(view);
      sammle();
      binde();
      fit();
      startClock();
    }
    (role === 'presenter' ? flickeBeam : flickeTab)(view);
  }

  function sammle() {
    els.clock  = stage.querySelector('[data-ks=clock]');
    els.bar    = stage.querySelector('[data-ks=bar]');
    els.wall   = stage.querySelector('[data-ks=wall]');
    els.count  = stage.querySelector('[data-ks=count]');
    els.total  = stage.querySelector('[data-ks=total]');
    els.tiles  = Array.from(stage.querySelectorAll('[data-idx]'));
    els.top    = Array.from(stage.querySelectorAll('[data-rank]'));
    els.trio   = Array.from(stage.querySelectorAll('[data-slot]'));
  }

  /* ══════════════════════════════════════════════════════════
     BEAMER
     ══════════════════════════════════════════════════════════ */
  function baueBeam(v) {
    if (v.phase === 'lobby')    return beamLobby(v);
    if (v.phase === 'question') return beamFrage(v);
    if (v.phase === 'reveal')   return beamAufloesung(v);
    return beamEnde(v);
  }

  function beamLobby(v) {
    const n = (v.players || []).length;
    const opts = catalogs.map(c =>
      '<option value="' + esc(c.id) + '"' + (c.id === v.catalog_id ? ' selected' : '') + '>'
      + esc(c.title) + ' · ' + c.count + (c.count === 1 ? ' Frage' : ' Fragen')
      + '</option>').join('');

    return `
      <header class="ks-head">
        <div class="ks-headl">
          <h1 class="ks-title">Knowledge Stack</h1>
          <label class="ks-catwrap">Fragen
            <select class="ks-cat" data-ks="cat">${opts || '<option>keine Kataloge</option>'}</select>
          </label>
        </div>
        <div class="ks-headr">
          <span class="ks-pill"><b data-ks="total">${n}</b> dabei</span>
          <button type="button" class="ks-go" data-act="start"
                  ${v.question_count > 0 ? '' : 'disabled'}>Quiz starten</button>
        </div>
      </header>
      <div class="ks-wall" data-ks="wall"></div>
      <p class="ks-leer" data-ks="leer" ${n ? 'hidden' : ''}>
        Der Code steht oben in der Leiste — der QR-Code am Griff rechts am Rand.
      </p>`;
  }

  function beamFrage(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    return `
      <header class="ks-head ks-head--q">
        <span class="ks-qnr">Frage ${(v.current_q_idx | 0) + 1} <i>/ ${v.question_count}</i></span>
        <div class="ks-barwrap"><div class="ks-bar" data-ks="bar"></div></div>
        <span class="ks-clock" data-ks="clock">–</span>
      </header>
      <div class="ks-qbox"><h2 class="ks-q">${esc(q.text)}</h2></div>
      <div class="ks-meta">
        <span class="ks-antz"><b data-ks="count">0</b> von <b data-ks="total">0</b> haben geantwortet</span>
        <button type="button" class="ks-now" data-act="now">Jetzt auflösen</button>
      </div>
      ${kachelnHTML(opts, { modus: 'still' })}`;
  }

  function beamAufloesung(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const letzte = (v.current_q_idx | 0) + 1 >= v.question_count;
    return `
      <header class="ks-head ks-head--rv">
        <span class="ks-qnr">Frage ${(v.current_q_idx | 0) + 1} <i>/ ${v.question_count}</i></span>
        <h2 class="ks-qsmall">${esc(q.text)}</h2>
        <button type="button" class="ks-go" data-act="next">
          ${letzte ? 'Siegerehrung' : 'Nächste Frage'}</button>
      </header>
      ${podestHTML(v.leaderboard || [], 'rv')}
      ${kachelnHTML(opts, { modus: 'fuell', correct: q.correct_idx })}
      ${q.explanation ? '<p class="ks-expl">' + esc(q.explanation) + '</p>' : ''}`;
  }

  function beamEnde(v) {
    return `
      <header class="ks-head ks-head--end">
        <h1 class="ks-title">Siegerehrung</h1>
        <button type="button" class="ks-go" data-act="reset">Zurück zur Lobby</button>
      </header>
      ${podestHTML(v.leaderboard || [], 'end')}
      <div class="ks-wall ks-wall--end" data-ks="wall"></div>`;
  }

  /* Die fünf Ersten — dort, wo während der Frage die Frage stand.
     Reihenfolge von links nach rechts: Platz 1 … Platz 5. Name
     darüber, Punkte darunter (so und nicht andersherum: der Name
     sagt, WER, und darum geht es zuerst). */
  function podestHTML(lb, art) {
    if (!lb.length) return '<div class="ks-podest ks-podest--leer">Noch keine Punkte.</div>';
    return '<div class="ks-podest ks-podest--' + art + '">' + lb.map(p => `
      <div class="ks-slot ks-slot--${p.rank}" data-rank="${p.rank}" data-cid="${p.creature_id | 0}">
        <span class="ks-sname">${esc(p.nickname)}</span>
        <div class="ks-spic">${wesen(p.creature_id, p.skin_idx,
          p.emote || (p.rank === 1 ? 'cheer' : (p.correct === true ? 'cheer' : p.correct === false ? 'sad' : 'idle')))}</div>
        <div class="ks-sfoot">
          <span class="ks-srank">#${p.rank}</span>
          <span class="ks-spkt">${pkt(p.score)}</span>
          ${deltaHTML(p.rank_change)}
        </div>
      </div>`).join('') + '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     Die vier Antwortfelder
     ══════════════════════════════════════════════════════════
     Dieselben Kacheln in drei Rollen, und das ist der Kern des
     Spiels: die Klasse soll in der Auflösung nicht nach der
     Antwort suchen, die sie gerade gewählt hat — sie steht an
     genau derselben Stelle, nur mit einem Füllstand dahinter.

       still   Beamer während der Frage (nicht anklickbar)
       wahl    Tablet während der Frage (anklickbar)
       fuell   Auflösung: Füllstand + absolute Zahl              */
  function kachelnHTML(opts, o) {
    const n = opts.length || 4;
    return '<div class="ks-kacheln" data-n="' + n + '" data-modus="' + o.modus + '">'
      + opts.map((t, i) => {
        const richtig = o.correct != null && i === o.correct;
        const gewaehlt = o.chosen != null && i === o.chosen;
        const cls = ['ks-k', 'ks-k--' + i];
        /* Am Beamer bekommt die Kachel KEINE Abblendung. `is-still`
           heißt „du hast schon geantwortet" und gehört dem Tablet —
           am Beamer hieße dasselbe „aus der letzten Reihe schlechter
           zu lesen", und genau dafür hängt das Bild vorn. Nicht
           anklickbar ist sie dort ohnehin: sie ist ein <div>. */
        if (o.modus === 'fuell') cls.push(richtig ? 'is-richtig' : 'is-blass');
        if (gewaehlt) cls.push('is-meine');
        return `
          <${o.modus === 'wahl' ? 'button type="button"' : 'div'} class="${cls.join(' ')}" data-idx="${i}">
            ${o.modus === 'fuell' ? '<span class="ks-fuell" data-fuell="' + i + '"></span>' : ''}
            <span class="ks-kk">${richtig ? '✓' : LABELS[i]}</span>
            <span class="ks-kt">${esc(t)}</span>
            ${o.modus === 'fuell' ? '<span class="ks-kn" data-kn="' + i + '">0</span>' : ''}
            ${gewaehlt ? '<span class="ks-kmein">deine Wahl</span>' : ''}
          </${o.modus === 'wahl' ? 'button' : 'div'}>`;
      }).join('') + '</div>';
  }

  /* ─── Beamer flicken ─────────────────────────────────────── */
  function flickeBeam(v) {
    if (els.total) els.total.textContent = String((v.players || []).length);
    if (els.count) els.count.textContent = String(v.answers_total || 0);

    if (v.phase === 'lobby') {
      flickeWall(v.players || [], false);
      const leer = stage.querySelector('[data-ks=leer]');
      if (leer) leer.hidden = (v.players || []).length > 0;
      const go = stage.querySelector('[data-act=start]');
      if (go) go.disabled = !(v.question_count > 0);
      const cat = stage.querySelector('[data-ks=cat]');
      if (cat && cat.value !== v.catalog_id && document.activeElement !== cat) {
        cat.value = v.catalog_id || '';
      }
      return;
    }

    if (v.phase === 'reveal' || v.phase === 'ended') {
      flickePodest(v.leaderboard || []);
    }
    if (v.phase === 'ended') flickeWall(v.players || [], true);

    if (v.phase === 'reveal') {
      const dist = v.answers_dist || {};
      const tot = v.answers_total || 0;
      for (let i = 0; i < 4; i++) {
        const f = stage.querySelector('[data-fuell="' + i + '"]');
        const nEl = stage.querySelector('[data-kn="' + i + '"]');
        const n = Number(dist[i] || dist[String(i)] || 0);
        if (f) f.style.width = (tot > 0 ? (n / tot * 100) : 0).toFixed(1) + '%';
        if (nEl) nEl.textContent = String(n);
      }
    }
  }

  function flickePodest(lb) {
    for (const p of lb) {
      const slot = stage.querySelector('[data-rank="' + p.rank + '"]');
      if (!slot) continue;
      const nm = slot.querySelector('.ks-sname');
      if (nm && nm.textContent !== p.nickname) nm.textContent = p.nickname;
      const pk = slot.querySelector('.ks-spkt');
      if (pk) pk.textContent = pkt(p.score);
      // Das Wesen kann wechseln (anderes Kind auf diesem Platz) —
      // dann muss das SVG neu, sonst nur die Bewegung.
      const pic = slot.querySelector('.ks-spic');
      const cid = p.creature_id | 0;
      const wanted = p.emote || (p.rank === 1 ? 'cheer'
        : p.correct === true ? 'cheer' : p.correct === false ? 'sad' : 'idle');
      if (pic && Number(slot.dataset.cid) !== cid) {
        slot.dataset.cid = String(cid);
        pic.innerHTML = wesen(cid, p.skin_idx, wanted);
      } else {
        setEmote(pic, wanted, cid);
      }
    }
  }

  /* Die Wesen-Wand. Geflickt und nicht neu gebaut: 28 SVGs je Takt
     neu zu schreiben kostet nicht nur Rechenzeit, es setzt auch
     jedes Atmen und jedes Winken zurück. */
  function flickeWall(players, mitPunkten) {
    if (!els.wall) return;
    const da = new Map();
    els.wall.querySelectorAll('[data-pid]').forEach(el => da.set(el.dataset.pid, el));

    players.forEach(p => {
      const id = String(p.participant_id);
      let card = da.get(id);
      const cid = p.creature_id | 0;

      if (!card) {
        card = document.createElement('div');
        card.className = 'ks-karte';
        card.dataset.pid = id;
        card.dataset.cid = String(cid);
        card.dataset.skin = String(p.skin_idx | 0);
        card.innerHTML =
          '<span class="ks-kbubble" hidden></span>'
          + '<div class="ks-kpic">' + wesen(cid, p.skin_idx, p.emote || 'idle') + '</div>'
          + '<span class="ks-kname"></span>'
          + (mitPunkten ? '<span class="ks-kpkt"></span>' : '');
        els.wall.appendChild(card);
      } else {
        da.delete(id);
      }

      if (Number(card.dataset.cid) !== cid || Number(card.dataset.skin) !== (p.skin_idx | 0)) {
        card.dataset.cid = String(cid);
        card.dataset.skin = String(p.skin_idx | 0);
        card.querySelector('.ks-kpic').innerHTML = wesen(cid, p.skin_idx, p.emote || 'idle');
      } else {
        setEmote(card.querySelector('.ks-kpic'), p.emote || 'idle', cid);
      }

      const nm = card.querySelector('.ks-kname');
      if (nm.textContent !== p.nickname) nm.textContent = p.nickname;
      const pk = card.querySelector('.ks-kpkt');
      if (pk) pk.textContent = pkt(p.score) + ' Pkt';

      const bub = card.querySelector('.ks-kbubble');
      if (p.emote) {
        if (bub.dataset.e !== p.emote) {
          bub.dataset.e = p.emote;
          bub.textContent = EMOTE_ICON[p.emote] || '✨';
          // Animation neu anstoßen: ohne den Neustart bliebe das
          // Zeichen aus dem letzten Takt einfach unsichtbar stehen.
          bub.hidden = true; void bub.offsetWidth; bub.hidden = false;
        }
      } else if (!bub.hidden) {
        bub.hidden = true; bub.dataset.e = '';
      }

      card.classList.toggle('is-fertig', !!p.answered);
    });

    // Wer nicht mehr in der Liste steht, hat den Raum verlassen.
    da.forEach(el => el.remove());
  }

  /* ══════════════════════════════════════════════════════════
     TABLET
     ══════════════════════════════════════════════════════════ */
  function baueTab(v) {
    if (v.phase === 'lobby')                 return tabLobby(v);
    if (v.phase === 'ended' && pickerOffen)  return tabLobby(v, true);
    if (v.phase === 'question')              return tabFrage(v);
    return tabRang(v);                       // reveal + ended
  }

  function tabLobby(v, nachher) {
    const liste = (window.KSCreatures && window.KSCreatures.list) || [];
    const me = v.me || {};
    return `
      <header class="ks-thead">
        <span class="ks-tname">${esc(me.nickname || 'Du')}</span>
        ${nachher
          ? '<button type="button" class="ks-fertig" data-act="fertig">Fertig</button>'
          : '<span class="ks-twait">Wähle dein Wesen</span>'}
      </header>
      <div class="ks-vorschau" data-ks="vorschau" data-cid="${myCreature}">
        ${wesen(myCreature, mySkin, 'wave')}
      </div>
      <span class="ks-wname" data-ks="wname">${esc(wesenName(myCreature))}</span>
      <div class="ks-skins" data-ks="skins">${skinKnoepfe()}</div>
      <div class="ks-picker" data-ks="picker">
        ${liste.map(c => '<button type="button" class="ks-pick'
          + (c.id === myCreature ? ' is-on' : '') + '" data-cid="' + c.id
          + '" title="' + esc(c.name) + '">' + wesen(c.id, mySkin, 'idle')
          + '<span>' + esc(c.name) + '</span></button>').join('')}
      </div>
      <div class="ks-emobar">${emoteBarHTML()}</div>
      <p class="ks-twarte">${nachher
        ? 'Gespeichert. Beim nächsten Quiz bist du dieses Wesen.'
        : 'Warten auf den Start …'}</p>`;
  }

  /* Die Frage steht hier NICHT. Oben das eigene Wesen — es ist die
     Stelle, an der man sich selbst wiederfindet, wenn man vom
     Beamer auf das Tablet sieht. */
  function tabFrage(v) {
    const q = v.question || {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const me = v.me || {};
    const my = v.my_answer;
    return `
      <header class="ks-thead ks-thead--q">
        <div class="ks-tme" data-ks="tme" data-cid="${me.creature_id | 0}">
          ${wesen(me.creature_id, me.skin_idx, 'idle')}
        </div>
        <div class="ks-tinfo">
          <span class="ks-tname">${esc(me.nickname || 'Du')}</span>
          <span class="ks-trang">#${me.rank || '?'} · ${pkt(me.score)} Pkt</span>
        </div>
        <span class="ks-clock" data-ks="clock">–</span>
      </header>
      <div class="ks-barwrap"><div class="ks-bar" data-ks="bar"></div></div>
      ${kachelnHTML(opts, { modus: 'wahl', chosen: my ? my.chosen_idx : null })}
      <p class="ks-gesperrt" data-ks="lock" ${my ? '' : 'hidden'}>
        Antwort abgegeben — jetzt zum Beamer sehen.</p>`;
  }

  /* Auflösung und Siegerehrung auf dem Tablet: links der Nachbar
     vor mir, in der Mitte ich, rechts der Nachbar hinter mir.
     Darunter die Punkte, ganz unten die vier Emote-Knöpfe. */
  function tabRang(v) {
    const me = v.me || {};
    const my = v.my_answer;
    const ende = v.phase === 'ended';
    const richtig = my && my.is_correct;

    let urteil = '';
    if (!ende) {
      urteil = my
        ? '<div class="ks-urteil ks-urteil--' + (richtig ? 'ok' : 'nein') + '">'
          + (richtig ? 'Richtig · +' + pkt(my.points_awarded) : 'Leider falsch')
          + ((me.streak > 1 && richtig) ? ' <i>🔥 ' + me.streak + 'er Serie</i>' : '')
          + '</div>'
        : '<div class="ks-urteil ks-urteil--weg">Keine Antwort abgegeben</div>';
    } else {
      urteil = '<div class="ks-urteil ks-urteil--end">Platz ' + (me.rank || '?')
             + ' von ' + (v.player_count || '?') + '</div>';
    }

    return `
      ${urteil}
      <div class="ks-trio">
        ${nachbarHTML(v.neighbor_before, 'vor')}
        <div class="ks-ich" data-slot="ich" data-cid="${me.creature_id | 0}">
          <span class="ks-inr">#${me.rank || '?'}</span>
          <div class="ks-ipic">${wesen(me.creature_id, me.skin_idx,
            localEmote || (ende ? 'cheer' : richtig ? 'cheer' : my ? 'sad' : 'idle'))}</div>
          <span class="ks-iname">${esc(me.nickname || 'Du')}</span>
          <span class="ks-ipkt" data-ks="mypkt">${pkt(me.score)}</span>
          ${deltaHTML(me.rank_change)}
        </div>
        ${nachbarHTML(v.neighbor_after, 'nach')}
      </div>
      <div class="ks-emobar">${emoteBarHTML()}</div>
      ${ende ? '<button type="button" class="ks-wechsel" data-act="wechsel">Wesen für die nächste Runde ändern</button>' : ''}`;
  }

  function nachbarHTML(p, slot) {
    if (!p) return '<div class="ks-nb ks-nb--leer" data-slot="' + slot + '"></div>';
    return `
      <div class="ks-nb" data-slot="${slot}" data-cid="${p.creature_id | 0}">
        <span class="ks-nnr">#${p.rank}</span>
        <div class="ks-npic">${wesen(p.creature_id, p.skin_idx, p.emote || 'idle')}</div>
        <span class="ks-nname">${esc(p.nickname)}</span>
        <span class="ks-npkt">${pkt(p.score)}</span>
      </div>`;
  }

  function emoteBarHTML() {
    return EMOTES.map(e => '<button type="button" class="ks-emo" data-emote="' + e.id
      + '" title="' + e.title + '" aria-label="' + e.title + '">' + e.icon + '</button>').join('');
  }

  /* ─── Tablet flicken ────────────────────────────────────── */
  function flickeTab(v) {
    if (v.phase === 'question') {
      const lock = stage.querySelector('[data-ks=lock]');
      const gesperrt = !!v.my_answer || answering;
      if (lock) lock.hidden = !gesperrt;
      els.tiles.forEach(t => {
        const mein = v.my_answer && v.my_answer.chosen_idx === Number(t.dataset.idx);
        t.classList.toggle('is-meine', !!mein);
        t.disabled = gesperrt;
        t.classList.toggle('is-still', gesperrt && !mein);
      });
      const tme = stage.querySelector('[data-ks=tme]');
      if (tme) setEmote(tme, localEmote || (gesperrt ? 'sleep' : 'idle'), v.me.creature_id | 0);
      return;
    }

    if (v.phase === 'reveal' || v.phase === 'ended') {
      const me = v.me || {};
      const pk = stage.querySelector('[data-ks=mypkt]');
      if (pk) pk.textContent = pkt(me.score);
      flickeNachbar('vor', v.neighbor_before);
      flickeNachbar('nach', v.neighbor_after);
      // Das eigene Wesen: was ich GERADE gedrückt habe, gewinnt —
      // es soll sich sofort bewegen und nicht erst beim nächsten
      // Takt. Danach übernimmt wieder der Server.
      const ich = stage.querySelector('[data-slot=ich] .ks-ipic');
      const my = v.my_answer;
      setEmote(ich, localEmote || me.emote
        || (v.phase === 'ended' ? 'cheer' : my ? (my.is_correct ? 'cheer' : 'sad') : 'idle'),
        me.creature_id | 0);
    }
  }

  function flickeNachbar(slot, p) {
    const box = stage.querySelector('[data-slot="' + slot + '"]');
    if (!box) return;
    if (!p) { box.className = 'ks-nb ks-nb--leer'; box.innerHTML = ''; return; }
    if (box.classList.contains('ks-nb--leer') || Number(box.dataset.cid) !== (p.creature_id | 0)) {
      box.className = 'ks-nb';
      box.dataset.cid = String(p.creature_id | 0);
      box.innerHTML = `<span class="ks-nnr">#${p.rank}</span>
        <div class="ks-npic">${wesen(p.creature_id, p.skin_idx, p.emote || 'idle')}</div>
        <span class="ks-nname">${esc(p.nickname)}</span>
        <span class="ks-npkt">${pkt(p.score)}</span>`;
      return;
    }
    box.querySelector('.ks-nnr').textContent = '#' + p.rank;
    box.querySelector('.ks-nname').textContent = p.nickname;
    box.querySelector('.ks-npkt').textContent = pkt(p.score);
    setEmote(box.querySelector('.ks-npic'), p.emote || 'idle', p.creature_id | 0);
  }

  /* ══════════════════════════════════════════════════════════
     Bedienung
     ══════════════════════════════════════════════════════════ */
  function binde() {
    stage.addEventListener('click', onClick);
    const sel = stage.querySelector('[data-ks=cat]');
    if (sel) sel.addEventListener('change', async () => {
      const r = await ctx.actions.call('ks_room_setup', { p_catalog: sel.value });
      if (!r.ok) { ctx.toast(fehlerText(r.error), true); return; }
      lastSig = null;
      poll();
    });
  }

  /* Ein Listener je Bild und fünf getrennte Fragen danach, WAS
     getroffen wurde. Nicht ein closest() über alle data-Attribute
     zusammen: `.ks-wesen` trägt selbst ein data-cid, und ein Klick
     mitten auf ein Wesen in der Wesenwahl fand dann das SVG statt
     des Knopfes darum. */
  async function onClick(ev) {
    if (!ctx || !view) return;
    const act  = ev.target.closest('[data-act]');
    const emo  = ev.target.closest('[data-emote]');
    const tile = ev.target.closest('.ks-k');
    const pick = ev.target.closest('.ks-pick');
    const skin = ev.target.closest('.ks-skin');

    /* ─── Pult: weiterschalten ───────────────────────────── */
    if (act) {
      if (act.dataset.act === 'wechsel') { pickerOffen = true; lastFrame = null; zeichne(); return; }
      if (act.dataset.act === 'fertig')  { pickerOffen = false; lastFrame = null; zeichne(); return; }
      act.disabled = true;
      // p_from: aus WELCHER Phase heraus geklickt wurde. Ist die Uhr
      // im selben Augenblick abgelaufen, verpufft der Klick statt
      // eine Frage zu überspringen (Migration 0175).
      const r = await ctx.actions.call('ks_step', { p_from: view.phase });
      if (!r.ok) { act.disabled = false; ctx.toast(fehlerText(r.error), true); return; }
      lastSig = null;
      poll();
      return;
    }

    /* ─── Emote ──────────────────────────────────────────── */
    if (emo) {
      const e = emo.dataset.emote;
      emo.classList.add('is-gedrueckt');
      setTimeout(() => emo.classList.remove('is-gedrueckt'), 220);
      // Sofort auf dem eigenen Gerät, ohne auf den Server zu warten:
      // ein Knopf, der erst beim nächsten Takt etwas tut, fühlt sich
      // kaputt an. Der Beamer bekommt es über den Server.
      zeigeLokalesEmote(e);
      const r = await ctx.actions.call('ks_emote', { p_emote: e });
      if (!r.ok && r.error !== 'invalid_input') ctx.toast(fehlerText(r.error), true);
      return;
    }

    /* ─── Antwort ────────────────────────────────────────── */
    if (tile && role === 'participant' && view.phase === 'question') {
      const el = tile;
      if (answering || view.my_answer) return;
      answering = true;
      const idx = Number(el.dataset.idx);
      els.tiles.forEach(t => { t.disabled = true; if (t !== el) t.classList.add('is-still'); });
      el.classList.add('is-meine');
      const lock = stage.querySelector('[data-ks=lock]');
      if (lock) lock.hidden = false;

      const r = await ctx.actions.call('ks_answer', {
        p_question_idx: view.current_q_idx | 0,
        p_chosen: idx,
        // Der Server rechnet die Zeit selbst (0175). Mitgeschickt
        // wird sie nur noch fürs Protokoll.
        p_response_ms: Math.max(0, Math.round(
          ((view.question && view.question.time_limit) || 20) * 1000 - (restMs() || 0)))
      });
      if (!r.ok) {
        answering = false;
        if (r.error !== 'already_answered') {
          ctx.toast(fehlerText(r.error), true);
          els.tiles.forEach(t => { t.disabled = false; t.classList.remove('is-still', 'is-meine'); });
          if (lock) lock.hidden = true;
        }
      }
      lastSig = null;
      poll();
      return;
    }

    /* ─── Wesen / Farbe wählen ───────────────────────────── */
    if (pick) {
      myCreature = Number(pick.dataset.cid);
      stage.querySelectorAll('.ks-pick').forEach(b => b.classList.toggle('is-on', b === pick));
      malVorschau();
      speicherWesen();
      return;
    }
    if (skin) {
      mySkin = Number(skin.dataset.skin);
      stage.querySelectorAll('.ks-skin').forEach(b =>
        b.classList.toggle('is-on', Number(b.dataset.skin) === mySkin));
      // Auch die Auswahl selbst umfärben — sonst zeigt sie 36 Wesen
      // in der alten Farbe und die Vorschau in der neuen.
      stage.querySelectorAll('.ks-pick').forEach(b => {
        const cid = Number(b.dataset.cid);
        const name = b.querySelector('span');
        b.innerHTML = wesen(cid, mySkin, 'idle')
          + '<span>' + esc(name ? name.textContent : '') + '</span>';
      });
      malVorschau();
      speicherWesen();
    }
  }

  function malVorschau() {
    const v = stage.querySelector('[data-ks=vorschau]');
    if (!v) return;
    v.dataset.cid = String(myCreature);
    v.innerHTML = wesen(myCreature, mySkin, 'wave');
    const nm = stage.querySelector('[data-ks=wname]');
    if (nm) nm.textContent = wesenName(myCreature);
    // Die Farbnamen gehören zum Wesen und wechseln mit ihm.
    const sk = stage.querySelector('[data-ks=skins]');
    if (sk) sk.innerHTML = skinKnoepfe();
  }

  /* Entprellt: wer sich durch die 36 Wesen tippt, soll nicht 36
     Aufrufe erzeugen. 500 ms sind lang genug, um das Durchtippen
     zusammenzufassen, und kurz genug, dass es vor dem Start da ist. */
  function speicherWesen() {
    if (profileT) clearTimeout(profileT);
    profileT = setTimeout(async () => {
      profileT = null;
      const r = await ctx.actions.call('ks_join', {
        p_creature: myCreature, p_skin: mySkin
      });
      if (!r.ok) ctx.toast(fehlerText(r.error), true);
      lastSig = null;
    }, 500);
  }

  /* Zurück auf ein Wesen, das gerade nicht ausgewählt ist: der Takt
     darf die Wesenwahl nicht wegräumen. Steht sie offen, ist das
     Bild „ended|pick" — und weil pickerOffen im frameKey steckt,
     bleibt es das, bis „Fertig" gedrückt wird. */
  function zeigeLokalesEmote(e) {
    localEmote = e;
    if (localEmoteT) clearTimeout(localEmoteT);
    const ziel = stage.querySelector('[data-slot=ich] .ks-ipic')
              || stage.querySelector('[data-ks=vorschau]')
              || stage.querySelector('[data-ks=tme]');
    const cid = (view && view.me ? view.me.creature_id : myCreature) | 0;
    setEmote(ziel, e, cid);
    localEmoteT = setTimeout(() => {
      localEmote = null;
      if (!destroyed && view) flickeTab(view);
    }, EMOTE_MS);
  }

  /* ══════════════════════════════════════════════════════════
     Anmeldung
     ══════════════════════════════════════════════════════════ */
  function ladeAssets() {
    if (!document.querySelector('link[data-ks-creatures]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'tools/KnowledgeStack/creatures.css?v=' + ASSET_V;
      l.setAttribute('data-ks-creatures', '1');
      document.head.appendChild(l);
    }
    if (window.KSCreatures) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'tools/KnowledgeStack/creatures.js?v=' + ASSET_V;
      s.onload = res;
      s.onerror = () => rej(new Error('creatures.js nicht gefunden'));
      document.head.appendChild(s);
    });
  }

  window.MPTool.register('knowledgestack', {

    /* Nichts abzufragen, und das ist eine Angabe: lehrer.js
       unterscheidet daran „dieser Skill hat keine Einstellungen"
       von „die Einstellungen sind noch nicht geladen". Der Katalog
       wird nicht hier gewählt, sondern in der Lobby — dort sieht
       die Lehrkraft, wie viele Fragen darin stehen, und kann ihn
       vor dem Start noch tauschen. */
    settingsFields: [],

    async mount(el, context) {
      root = el; ctx = context; role = context.role;
      destroyed = false; busy = false;
      lastSig = null; lastFrame = null; view = null;
      els = {}; catalogs = []; skew = 0;
      localEmote = null; answering = false; pickerOffen = false;

      root.innerHTML = '<div class="ks-frame"><div class="ks-stage">'
        + '<p class="ks-booting">Quiz wird geladen …</p></div></div>';
      frame = root.querySelector('.ks-frame');
      stage = root.querySelector('.ks-stage');
      frame.classList.add(role === 'presenter' ? 'ks-frame--beam' : 'ks-frame--tab');

      // Am Beamer wie auf dem Tablet gehört dem Quiz der ganze
      // Rest der Seite — dieselbe Klasse wie bei NeuroLab, Cäsar,
      // Clash und Wordisland.
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();

      try {
        await ladeAssets();
      } catch (e) {
        console.error('[knowledgestack]', e);
        stage.innerHTML = '<div class="ks-booting">Die Wesen ließen sich nicht laden. '
          + 'Lade die Seite neu.</div>';
        return;
      }
      if (destroyed) return;
      poll();
    },

    // Der Seiten-Poller hat etwas gesehen. Für uns meist
    // bedeutungslos (wir haben unseren eigenen Takt), aber ein
    // billiger zusätzlicher Anstoß.
    update() { if (!destroyed) poll(); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearTimeout(pollTimer);
      stopClock();
      if (profileT) clearTimeout(profileT);
      if (localEmoteT) clearTimeout(localEmoteT);
      pollTimer = profileT = localEmoteT = null;
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      root = ctx = frame = stage = null;
      role = null; view = null; els = {};
      lastSig = lastFrame = null;
      pickerOffen = false; localEmote = null;
      zeigeFehler.last = null;
    }
  });

})();
