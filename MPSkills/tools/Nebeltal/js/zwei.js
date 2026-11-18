/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/zwei.js   ·   Level 7: zwei Welten, ein Netz
   ══════════════════════════════════════════════════════════════
   Das Nest (Mama/Papa am Nest → Ei ok?, XOR) mit zwei Neuronen A und B. Lernbar sind vier
   Kanten: a₁, a₂ (in Neuron A) und b₁, b₂ (in Neuron B). Darum zwei
   Welten nebeneinander (Hochformat: übereinander):

     Welt A: rechts = a₁, nach vorn = a₂   (b steht, wo Figur B steht)
     Welt B: rechts = b₁, nach vorn = b₂   (a steht, wo Figur A steht)

   Beide Figuren gehören zu EINEM Netz und stehen deshalb immer auf
   derselben Höhe. Läuft die eine, ist die Welt der anderen ein anderer
   Schnitt – sie wird neu gebaut (gedrosselt, s. REBUILD_MS).
   Die Pfeile beider Welten zusammen sind genau der 4D-Gradient; ein
   Trainingsschritt springt mit beiden Figuren gleichzeitig.

   Steuerung: linke/obere Hälfte ziehen = Figur A, rechte/untere = Figur B
   (zwei Daumen oder zwei Personen); Tastatur WASD = A, Pfeile = B,
   Leertaste = ein Lernschritt. Kamera fest (rechts = Gewicht größer).
   ══════════════════════════════════════════════════════════════ */

window.NTZwei = (function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const REBUILD_MS = 120;
  const SPEED = 8.5;
  const COLS = [[0.95, 0.47, 0.16], [0.55, 0.36, 0.96]];   // orange A, violett B

  let api = null, L = null, X = null, root = null, G = [null, null];
  let figs = [], built = false, raf = 0, running = false, last = 0, acc = 0;
  let st = null;                         // Spielstand
  let orb = [null, null];                // Karte am Ende frei drehen (js/orbit.js), je Welt eine
  const live = () => st && (st.state === 'play' || st.post);
  let mp = null;                         // gemeinsam (js/mehr.js): { ctl:[bool,bool], names, intro, left(), remote(k), onMove(vals), onResult() }
  const keys = new Set();
  const ctl = k => !mp || !!mp.ctl[k];
  const mine = () => [0, 1].filter(ctl);

  /* ── Oberfläche einmal bauen ── */
  function build() {
    if (built) return true;
    root = $('#zwei');
    root.innerHTML =
      '<canvas id="zA" class="zcv" data-k="0"></canvas><canvas id="zB" class="zcv" data-k="1"></canvas>' +
      '<div class="ztag a">Welt A · Neuron A</div><div class="ztag b">Welt B · Neuron B</div>' +
      '<div class="zjoy" data-k="0" hidden><i></i></div><div class="zjoy" data-k="1" hidden><i></i></div>' +
      '<div class="hud-top"><button id="zMenu" class="chip btn" type="button" aria-label="Übersicht">‹<span class="long"> Übersicht</span></button>' +
      '<div id="zName" class="chip glass"></div><button id="zInfo" class="chip btn infotog" type="button" aria-pressed="true">Infos</button><div id="zCount" class="chip glass"></div></div>' +
      '<div id="zPanel" class="glass"><div class="box-t">Das ganze Netz · Nest für Nest <span id="zNName"></span></div>' +
      '<div class="zex"><div id="zL"><svg class="zNest" viewBox="0 0 80 40"><g id="zNest"></g></svg>' +
      ['Mama', 'Papa'].map((t, k) => '<div class="zV" style="top:calc(14px + ' + (k ? 0.8 : 0.2) + ' * (100% - 28px))"><small>' + t + '</small><b id="zS' + k + '"></b></div>').join('') +
      '</div><div class="znetw"><canvas id="znet"></canvas></div><svg id="zR" viewBox="0 0 84 150"></svg></div>' +
      '<div class="zfix"><i></i>grau = steht fest, farbig = lernt</div>' +
      '<div class="box-t" style="margin-top:4px">Die vier Nester · jedes Neuron = eine Gerade</div><canvas id="zplot" class="nplot"></canvas><div class="zrow"><span>Fehler <b id="zErr">–</b></span><span>richtig <b id="zRight">–</b></span></div></div>' +
      '<div class="zbottom"><div class="zlr glass"><div class="lr-l"><small>Lernrate</small><span id="zLrV">–</span></div>' +
      '<input id="zLr" type="range" min="0" max="1000" aria-label="Lernrate">' +
      '<button id="zJump" class="btn" type="button">Ein Lernschritt</button>' +
      '<button id="zAuto" class="btn" type="button">Training starten</button></div>' +
      '<button id="zDone" class="btn" type="button">Fertig</button></div>' +
      '<div id="zToast"></div>';
    G[0] = NTGrafik.create($('#zA'));
    G[1] = NTGrafik.create($('#zB'));
    if (!G[0] || !G[1]) return false;
    orb = [NTOrbit.create($('#zA')), NTOrbit.create($('#zB'))];
    // Polarnacht ohne Schnee wie Level 4–6 (Palette NET aus spiel.js)
    if (window.NT_NET) { G[0].setPalette(NT_NET, 'dark'); G[1].setPalette(NT_NET, 'dark'); }

    $('#zMenu').addEventListener('click', () => api && api.toMenu());
    $('#zInfo').addEventListener('click', () => api && api.toggleInfo());
    $('#zJump').addEventListener('click', () => { if (live() && !st.auto) jump(); });
    $('#zAuto').addEventListener('click', () => {
      if (!live()) return;
      st.auto = !st.auto; st.autoWait = 0; refreshAuto();
    });
    $('#zDone').addEventListener('click', () => {
      if (st && st.post) { if (!st.jump) postStop(); return; }
      if (st && st.state === 'play' && !st.jump) finish();
    });
    $('#zLr').addEventListener('input', e => {
      const R = L.lr;
      st.lr = +(R.min * Math.pow(R.max / R.min, e.target.value / 1000)).toFixed(R.d);
      $('#zLrV').textContent = api.fmt(st.lr, R.d);
    });

    for (const cv of root.querySelectorAll('.zcv')) {
      cv.addEventListener('pointerdown', down);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
    }
    window.addEventListener('keydown', e => {
      if (!live() || (e.target && e.target.tagName === 'INPUT')) return;
      if (st.state === 'play') keys.add(e.key.toLowerCase());
      if (e.key === ' ') { e.preventDefault(); if (!st.auto && !mp) jump(); }
    });
    window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());
    window.addEventListener('resize', () => { if (st) panel(); });
    built = true;
    return true;
  }

  /* ── Gewichte ↔ Ort: rechts = erstes Gewicht größer, nach vorn
        (oben auf dem Bild, −z bei fester Kamera) = zweites größer ── */
  const wOf = p => [X.toW(p.x), X.toW(-p.z)];
  const all = () => [...wOf(figs[0]), ...wOf(figs[1])];
  const posOf = (w1, w2) => ({ x: X.toX(w1), z: -X.toX(w2) });
  const lossNow = () => X.loss(...all());

  function numGrad(h, x, z) {
    const e = 0.04;
    return [(h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e)];
  }

  // Schnitt für Welt k mit der anderen Figur an ihrer jetzigen Stelle
  function slice(k) {
    const ow = wOf(figs[1 - k]);
    const h = (x, z) => {
      const w = [X.toW(x), X.toW(-z)];
      const a = k === 0 ? [w[0], w[1], ow[0], ow[1]] : [ow[0], ow[1], w[0], w[1]];
      return X.lift(X.loss(a[0], a[1], a[2], a[3]));
    };
    return { kind: 'xor2', W: X.W === undefined ? 50 : X.W, h, grad: (x, z) => numGrad(h, x, z),
             meshN: api.low() ? 56 : 84, hRange: [0, X.H * 0.97], other: { x: figs[1 - k].x, z: figs[1 - k].z } };
  }
  function rebuild(k, force) {
    const sw = st.slices[k], o = figs[1 - k];
    const now = performance.now();
    if (!force && sw && Math.hypot(sw.other.x - o.x, sw.other.z - o.z) < 0.25) return;
    if (!force && now - st.built[k] < REBUILD_MS) return;
    st.slices[k] = slice(k);
    st.built[k] = now;
    G[k].setWorld(st.slices[k], api.theme());
  }

  /* ── öffnen / schließen ── */
  function open(level, seed, a, m) {
    api = a; L = level; mp = m || null;
    if (!build()) { a.toMenu(); return; }
    X = NTWelt.xor(seed).two();
    X.W = NTWelt.W;
    figs = X.start.map(p => ({ x: p.x, z: p.z, vx: 0, vz: 0, yaw: Math.PI, tilt: 0, squash: 1, phase: 0, air: 0 }));
    st = {
      state: 'intro', seed, lr: L.lr.def, auto: false, autoWait: 0, jump: null,
      jumpsLeft: L.jumps, slices: [null, null], built: [0, 0], dots: [[], []], trail: [0, 0],
      start: figs.map(f => ({ x: f.x, z: f.z })), curve: [lossNow()], outs: 0, reveal: null, theme: api.theme(),
      post: false, postN: 0, cams: [null, null],
      joy: [{ id: null, ox: 0, oy: 0, x: 0, y: 0 }, { id: null, ox: 0, oy: 0, x: 0, y: 0 }]
    };
    for (const f of figs) addDot(figs.indexOf(f), true);
    rebuild(0, true); rebuild(1, true);
    $('#zLr').value = Math.round(Math.log(st.lr / L.lr.min) / Math.log(L.lr.max / L.lr.min) * 1000);
    $('#zLrV').textContent = api.fmt(st.lr, L.lr.d);
    $('#zName').textContent = 'Level ' + L.id + ' · ' + L.name;
    root.classList.toggle('is-mp', !!mp);
    orb[0].on = orb[1].on = false;
    document.body.classList.remove('post');
    $('#zDone').textContent = 'Fertig';
    root.querySelector('.ztag.a').textContent = 'Welt A · Neuron A' + (mp ? ' · ' + mp.names[0] : '');
    root.querySelector('.ztag.b').textContent = 'Welt B · Neuron B' + (mp ? ' · ' + mp.names[1] : '');
    root.querySelector('.ztag.a').classList.toggle('mine', !!mp && ctl(0));
    root.querySelector('.ztag.b').classList.toggle('mine', !!mp && ctl(1));
    $('#zMenu').hidden = !!mp;
    root.hidden = false;
    document.body.dataset.state = 'intro';
    document.body.dataset.lvl = L.id;
    refreshAuto();
    panel();
    if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    if (mp) {
      const one = mine().length === 1;
      api.card(api.introHtml(L, seed, one
        ? 'Du steuerst <b>Welt ' + (ctl(0) ? 'A' : 'B') + '</b>, ' + mp.names[ctl(0) ? 1 : 0] + ' die andere. Nur laufen, kein Springen.' +
          '<span class="kbd"> · WASD oder Pfeile</span>'
        : 'Du steuerst <b>beide Welten</b>: eine Hälfte ziehen = Figur A, die andere = Figur B. Nur laufen.<span class="kbd"> · WASD = A, Pfeile = B</span>'),
        mp.intro || []);
      return;
    }
    api.card(api.introHtml(L, seed,
      'Eine Hälfte ziehen = Figur A, die andere = Figur B<span class="kbd"> · WASD = A, Pfeile = B, Leertaste = Lernschritt</span>'),
      [['Los geht’s', start, 'primary'], ['Übersicht', api.toMenu]]);
  }

  function start() {
    st.state = 'play';
    api.playing();
    $('#card').hidden = true;
    document.body.dataset.state = 'play';
  }

  function close() {
    if (!root) return;
    running = false; cancelAnimationFrame(raf);
    root.hidden = true;
    if (orb[0]) orb[0].on = orb[1].on = false;
    document.body.classList.remove('post');
    st = null; mp = null;
    keys.clear();
    for (const j of root.querySelectorAll('.zjoy')) j.hidden = true;
  }

  /* ── Eingabe ── */
  function down(e) {
    if (!st || st.state !== 'play' || st.auto || st.jump) return;
    let k = +e.currentTarget.dataset.k;
    if (!ctl(k)) { if (mine().length) k = mine()[0]; else return; }
    const j = st.joy[k];
    if (j.id !== null) return;
    Object.assign(j, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
    const r = root.getBoundingClientRect(), el = root.querySelector('.zjoy[data-k="' + k + '"]');
    el.style.left = (e.clientX - r.left) + 'px'; el.style.top = (e.clientY - r.top) + 'px';
    el.firstChild.style.transform = 'translate(-50%,-50%)';
    el.hidden = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
  }
  function move(e) {
    if (!st) return;
    for (let k = 0; k < 2; k++) {
      const j = st.joy[k];
      if (j.id !== e.pointerId) continue;
      let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
      const l = Math.hypot(dx, dy), JR = 56;
      if (l > JR) { dx *= JR / l; dy *= JR / l; }
      j.x = dx / JR; j.y = -dy / JR;
      root.querySelector('.zjoy[data-k="' + k + '"] i').style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    }
  }
  function up(e) {
    if (!st) return;
    for (let k = 0; k < 2; k++) {
      const j = st.joy[k];
      if (j.id !== e.pointerId) continue;
      Object.assign(j, { id: null, x: 0, y: 0 });
      root.querySelector('.zjoy[data-k="' + k + '"]').hidden = true;
    }
  }

  /* ── Laufen ── */
  function walk(k, dt) {
    const f = figs[k], j = st.joy[k];
    let ix = j.x, iy = j.y;
    const K = k === 0 ? ['w', 's', 'a', 'd'] : ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    const K2 = mp && mine().length === 1 ? (k === 0 ? ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'] : ['w', 's', 'a', 'd']) : [];
    const has = i => keys.has(K[i]) || (K2.length && keys.has(K2[i]));
    if (has(0)) iy += 1; if (has(1)) iy -= 1;
    if (has(2)) ix -= 1; if (has(3)) ix += 1;
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    // feste Kamera: rechts = +x, oben = −z
    const tvx = ix * SPEED, tvz = -iy * SPEED;
    const q = 1 - Math.exp(-7 * dt);
    f.vx = lerp(f.vx, tvx, q); f.vz = lerp(f.vz, tvz, q);
    if (Math.hypot(tvx, tvz) > 0.3) f.yaw += angDiff(Math.atan2(tvx, tvz), f.yaw) * (1 - Math.exp(-10 * dt));
    const lim = X.W - 1.5;
    const nx = clamp(f.x + f.vx * dt, -lim, lim), nz = clamp(f.z + f.vz * dt, -lim, lim);
    const moved = Math.hypot(nx - f.x, nz - f.z);
    f.x = nx; f.z = nz;
    const sp = Math.hypot(f.vx, f.vz);
    f.phase += sp * dt * 1.3;
    f.tilt = lerp(f.tilt, clamp(sp / SPEED, 0, 1.2) * 0.22, q);
    st.trail[k] += moved;
    if (st.trail[k] > 1.5) { st.trail[k] = 0; addDot(k, false); }
  }
  /* Gemeinsam: die Figur der anderen Person läuft zu ihrem gemeldeten Ort (alle ~0,4 s neu) */
  function follow(k, dt) {
    const f = figs[k], t = mp.remote(k);
    if (!t) { f.vx = f.vz = 0; return; }
    const q = posOf(t[0], t[1]), dx = q.x - f.x, dz = q.z - f.z, d = Math.hypot(dx, dz);
    if (d > 14) { f.x = q.x; f.z = q.z; f.vx = f.vz = 0; addDot(k, true); return; }
    const sp = Math.min(SPEED * 1.4, d * 5);
    const tvx = d > 0.05 ? dx / d * sp : 0, tvz = d > 0.05 ? dz / d * sp : 0;
    const a = 1 - Math.exp(-8 * dt);
    f.vx = lerp(f.vx, tvx, a); f.vz = lerp(f.vz, tvz, a);
    const step = Math.min(d, Math.hypot(f.vx, f.vz) * dt);
    if (d > 1e-4) { f.x += dx / d * step; f.z += dz / d * step; }
    if (Math.hypot(tvx, tvz) > 0.3) f.yaw += angDiff(Math.atan2(tvx, tvz), f.yaw) * (1 - Math.exp(-10 * dt));
    const v = Math.hypot(f.vx, f.vz);
    f.phase += v * dt * 1.3;
    f.tilt = lerp(f.tilt, clamp(v / SPEED, 0, 1.2) * 0.22, a);
    st.trail[k] += step;
    if (st.trail[k] > 1.5) { st.trail[k] = 0; addDot(k, false); }
  }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  function addDot(k, big) {
    const f = figs[k], ds = st.dots[k], l = ds[ds.length - 1];
    // kleine Sprünge im Tal nicht zu einer Wurst stapeln
    if (big && l && l.big && Math.hypot(l.x - f.x, l.z - f.z) < 1.2) return;
    st.dots[k].push({ x: f.x, z: f.z, r: big ? 0.3 : 0.14, big });
    if (st.dots[k].length > 600) st.dots[k].splice(1, 1);
  }

  /* ── ein Lernschritt: beide Figuren springen gleichzeitig ── */
  function jump() {
    if (!live() || st.jump || (!st.post && st.jumpsLeft <= 0)) return;
    const w = all(), g = X.grad(...w);
    const n = w.map((v, i) => v - st.lr * g[i]);
    if (st.post) st.postN++; else st.jumpsLeft--;
    if (n.some(v => Math.abs(v) > X.R)) {
      st.outs++;
      toast('Zu weit! <b>Lernrate</b> zu groß.');
      if (st.auto) { st.auto = false; refreshAuto(); }
      st.curve.push(lossNow());
      afterStep();
      return;
    }
    const to = [posOf(n[0], n[1]), posOf(n[2], n[3])];
    const d = Math.max(Math.hypot(to[0].x - figs[0].x, to[0].z - figs[0].z), Math.hypot(to[1].x - figs[1].x, to[1].z - figs[1].z));
    st.jump = { t: 0, T: (0.4 + Math.min(0.5, d * 0.018)) * (st.auto ? 0.6 : 1),
                from: figs.map(f => ({ x: f.x, z: f.z })), to, peak: 0.8 + Math.min(7, d * 0.22), y0: groundY(), y1: X.lift(X.loss(...n)) };
    figs.forEach((f, k) => {
      f.vx = f.vz = 0;
      const dx = to[k].x - f.x, dz = to[k].z - f.z;
      if (Math.hypot(dx, dz) > 0.05) f.yaw = Math.atan2(dx, dz);
    });
  }
  function landed() {
    st.jump = null;
    figs.forEach(f => { f.squash = 0.62; });
    addDot(0, true); addDot(1, true);
    rebuild(0, true); rebuild(1, true);
    st.curve.push(lossNow());
    afterStep();
  }
  function afterStep() {
    panel();
    if (st.jumpsLeft <= 0) setTimeout(() => { if (st && st.state === 'play') finish(); }, 600);
  }

  function refreshAuto() {
    const b = $('#zAuto');
    b.textContent = st && st.auto ? 'Training anhalten' : 'Training starten';
    b.classList.toggle('on', !!(st && st.auto));
    $('#zJump').disabled = !!(st && st.auto);
    $('#zLr').disabled = !!(st && st.auto);
  }

  /* ── Anzeige: das ganze Netz + die vier Fälle ── */
  /* Nest für Nest (Sönke 18.11.2026, wie Level 5/6): links eines der vier Nester mit Mama/Papa
     auf Höhe der Eingänge, A und B füllen sich mit ihrer Antwort, rechts „NEURON SAGT“ mit ✓/✗/ECHT */
  let zIdx = -1;
  const zCase = () => Math.floor(performance.now() / 1600) % 4;
  function zBuild() {
    const R = $('#zR');
    if (R.dataset.ok) return;
    R.dataset.ok = '1';
    R.innerHTML = '<text x="42" y="30" font-size="9.5" font-weight="700" text-anchor="middle" fill="var(--ink-faint)">NEURON SAGT</text>' +
      [['Ei ok', 56, false], ['nicht ok', 100, true]].map(([nm, y, bad], k) =>
        '<rect id="zR' + k + '" x="4" y="' + (y - 19) + '" width="78" height="38" rx="10" fill="none" stroke-width="2"/>' +
        api.eggIcon(21, y, bad) +
        '<text x="35" y="' + (y - 4) + '" font-size="10" font-weight="700" fill="var(--ink-soft)">' + nm + '</text>' +
        '<text id="zP' + k + '" x="35" y="' + (y + 11) + '" font-size="13.5" font-weight="700" fill="var(--ink)"></text><g id="zB' + k + '"></g>').join('');
  }
  function panel() {
    const w = all(), cs = X.fwd(...w);
    zBuild();
    const ci = zCase(), cur = cs[ci];
    if (ci !== zIdx) {
      zIdx = ci;
      const kind = NTBild.nestKind(cur.s1, cur.s2);
      $('#zNest').innerHTML = NTBild.nestImg(kind, 40, 38, 78);
      $('#zNName').textContent = '· ' + api.NEST_TXT[kind];
      $('#zS0').textContent = cur.s1 > 0 ? 'am Nest +1' : 'fischt −1';
      $('#zS1').textContent = cur.s2 > 0 ? 'am Nest +1' : 'fischt −1';
    }
    api.verdict('z', [cur.o, 1 - cur.o], cur.o > 0.5 ? 0 : 1, cur.y === 1 ? 0 : 1);
    const pc = v => ' ' + Math.round(v * 100) + ' %';
    NTNetz.draw($('#znet'), {
      nodes: [
        { id: 's1', kind: 'in', x: 0, y: 0.2, label: '' }, { id: 's2', kind: 'in', x: 0, y: 0.8, label: '' },
        { id: 'A', kind: 'n', x: 0.5, y: 0.2, label: 'A' + pc(cur.A), group: 'a', bias: -3, labelPos: 'above', act: cur.A },
        { id: 'B', kind: 'n', x: 0.5, y: 0.8, label: 'B' + pc(cur.B), group: 'b', bias: -3, labelPos: 'above', act: cur.B },
        { id: 'o', kind: 'n', x: 0.97, y: 0.5, bias: -5 }],
      edges: [
        // gerade Kanten in der Mitte beschriften, gekreuzte nah am Eingang – so überlappt nichts
        { from: 's1', to: 'A', w: w[0], group: 'a', labelAt: 0.55 }, { from: 's2', to: 'A', w: w[1], group: 'a', labelAt: 0.26 },
        { from: 's1', to: 'B', w: w[2], group: 'b', labelAt: 0.26 }, { from: 's2', to: 'B', w: w[3], group: 'b', labelAt: 0.55 },
        { from: 'A', to: 'o', w: 8, group: 'fix', fixed: true, labelAt: 0.5 }, { from: 'B', to: 'o', w: 8, group: 'fix', fixed: true, labelAt: 0.5 }]
    });
    const sg = z => 1 / (1 + Math.exp(-z));
    NTNetz.nestPlot($('#zplot'), { cases: cs,
      out: (m, p) => sg(8 * sg(w[0] * m + w[1] * p - 3) + 8 * sg(w[2] * m + w[3] * p - 3) - 5),
      hi: ci, lines: [{ a: w[0], b: w[1], c: 3, col: '#ff9d4d', team: 'a', name: 'A', end: 1 },
              { a: w[2], b: w[3], c: 3, col: '#a98bff', team: 'b', name: 'B', end: 0 }] });
    $('#zErr').textContent = api.fmt(X.loss(...w), 2);
    $('#zRight').textContent = X.right(cs) + ' von 4';
    if (mp && !st.postN) {
      const s = Math.ceil(mp.left() || 0);
      $('#zCount').textContent = '⏱ ' + s + ' s';
      $('#zCount').classList.toggle('warn', s <= 10);
    } else {
      $('#zCount').textContent = st.post || st.postN ? 'weiter trainiert: +' + st.postN + ' Schritte' : 'Schritte: ' + st.jumpsLeft;
      $('#zCount').classList.toggle('warn', !st.postN && st.jumpsLeft <= 3);
    }
  }

  let toastT = 0;
  function toast(html) {
    const t = $('#zToast');
    t.innerHTML = html; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
  }

  /* ── Ende ── */
  function finish() {
    st.state = 'reveal'; st.auto = false; refreshAuto();
    st.reveal = { t: 0 };
    for (const j of st.joy) Object.assign(j, { id: null, x: 0, y: 0 });
    for (const el of root.querySelectorAll('.zjoy')) el.hidden = true;
    document.body.dataset.state = 'reveal';
    // in jeder Welt den tiefsten Punkt dieses Schnitts suchen (Flagge)
    st.flags = [0, 1].map(k => {
      const s = st.slices[k];
      let best = { x: 0, z: 0, h: Infinity };
      for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
        const x = -X.W + 2 * X.W * i / 60, z = -X.W + 2 * X.W * j / 60, v = s.h(x, z);
        if (v < best.h) best = { x, z, h: v };
      }
      return best;
    });
  }
  function rate() {
    const w = all(), r = X.right(X.fwd(...w)), Lv = X.loss(...w);
    return { r, Lv, n: r === 4 && Lv < 0.15 ? 3 : r === 4 ? 2 : r === 3 ? 1 : 0,
             line: 'Das Netz beurteilt <b>' + r + ' von 4</b> Nestern richtig <small>· Fehler ' + api.fmt(Lv, 2) + '</small>' };
  }
  function result() {
    st.state = 'result';
    // beide Karten frei drehbar, vom Ende des Auflösens aus
    for (const k of [0, 1]) if (st.cams[k]) { orb[k].set(st.cams[k]); orb[k].limit = X.W; orb[k].minD = 6; orb[k].maxD = 400; orb[k].on = true;
      orb[k].floor = (x, z) => (Math.abs(x) < X.W && Math.abs(z) < X.W ? st.slices[k].h(x, z) : -Infinity); }
    panel();
    if (mp) { document.body.dataset.state = 'result'; if (mp.onResult) mp.onResult(); return; }
    const w = all(), q = rate();
    const old = parseInt(api.LS.get(api.bestKey(L.id)), 10);
    if (!(old >= q.n)) api.LS.set(api.bestKey(L.id), String(q.n));
    const notes = [];
    if (q.r === 3) {
      const same = Math.sign(w[0] - w[1]) === Math.sign(w[2] - w[3]);
      notes.push(same
        ? 'Beide Neuronen haben <b>dasselbe gelernt</b> – darum fehlt ein Nest. Ein Neuron muss „nur Mama am Nest“ erkennen, das andere „nur Papa am Nest“.'
        : 'Ein Fall fehlt noch. Mit ein paar Schritten mehr oder einer anderen Lernrate klappt es vielleicht.');
    }
    if (st.outs) notes.push('Mindestens ein Schritt ging ins Leere – da war die <b>Lernrate zu groß</b>.');
    st.res = { n: q.n, line: q.line, notes };
    resultBar();
    document.body.dataset.state = 'result';
  }
  function resultBar() {
    const R0 = st.res, now = st.postN ? rate() : null, nx = api.next();
    const btns = [];
    if (nx) btns.push(['Weiter: ' + nx.name, () => api.open(nx.id), 'primary']);
    btns.push(['Weiter trainieren', postStart]);
    btns.push(['Nochmal', api.again], ['Neue Welt', api.newWorld], ['Übersicht', api.toMenu]);
    api.endBar({
      kick: 'Level ' + L.id + ' · Welt ' + st.seed + (now ? ' · weiter trainiert: +' + st.postN + ' Schritte' : ''),
      stars: api.stars(now ? now.n : R0.n), line: now ? now.line : R0.line,
      more: (R0.notes.length ? '<p class="note">' + R0.notes.join(' ') + '</p>' : '') +
        '<div class="ki"><span class="ki-tag">Und die KI?</span><p>' + L.outro + '</p></div>',
      btns
    });
  }
  // Weiter trainieren: Lernschritte ohne Grenze, Netz und Nester laufen mit, Karten bleiben frei drehbar
  function postStart() {
    if (!st || st.state !== 'result') return;
    st.post = true; st.auto = false; refreshAuto();
    document.body.classList.add('post');
    api.endHide();
    $('#zDone').textContent = 'Zum Ergebnis';
    panel();
  }
  function postStop() {
    st.post = false; st.auto = false; refreshAuto();
    document.body.classList.remove('post');
    $('#zDone').textContent = 'Fertig';
    if (mp) { if (mp.onResult) mp.onResult(true); return; }
    resultBar();
  }

  /* ── Bild für Bild ── */
  const groundY = () => X.lift(lossNow());
  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    let dt = Math.min(0.05, (now - last) / 1000);
    const low = api.low();
    if (low) { acc += dt; if (acc < 1 / 30) { last = now; return; } dt = Math.min(0.05, acc); acc = 0; }
    last = now;
    if (!st) return;
    const th = api.theme();
    if (th !== st.theme) { st.theme = th; G[0].setTheme(th); G[1].setTheme(th); }

    if (st.state === 'play') {
      if (st.jump) {
        const J = st.jump;
        J.t += dt;
        const t = clamp(J.t / J.T, 0, 1);
        figs.forEach((f, k) => { f.x = lerp(J.from[k].x, J.to[k].x, t); f.z = lerp(J.from[k].z, J.to[k].z, t); });
        J.air = lerp(J.y0, J.y1, t) + 4 * J.peak * t * (1 - t);
        if (t >= 1) landed();
      } else {
        if (mp) {
          for (const k of [0, 1]) { if (ctl(k)) walk(k, dt); else follow(k, dt); }
          if (mp.onMove) { const v = {}; for (const k of mine()) v[k] = wOf(figs[k]); mp.onMove(v); }
          if (Math.floor(now / 250) !== st.sec) { st.sec = Math.floor(now / 250); panel(); }
        } else if (!st.auto) { walk(0, dt); walk(1, dt); }
        else {
          st.autoWait -= dt;
          if (st.autoWait <= 0) { st.autoWait = 0.12; if (st.jumpsLeft > 0) jump(); else { st.auto = false; refreshAuto(); } }
        }
        rebuild(0, false); rebuild(1, false);
        if (Math.hypot(figs[0].vx, figs[0].vz) + Math.hypot(figs[1].vx, figs[1].vz) > 0.2 || zCase() !== zIdx) panel();
      }
    }
    if (st.post) {                      // weiter trainieren nach dem Ende
      if (st.jump) {
        const J = st.jump;
        J.t += dt;
        const t = clamp(J.t / J.T, 0, 1);
        figs.forEach((f, k) => { f.x = lerp(J.from[k].x, J.to[k].x, t); f.z = lerp(J.from[k].z, J.to[k].z, t); });
        J.air = lerp(J.y0, J.y1, t) + 4 * J.peak * t * (1 - t);
        if (t >= 1) landed();
      } else if (st.auto) {
        st.autoWait -= dt;
        if (st.autoWait <= 0) { st.autoWait = 0.12; jump(); }
      }
    }
    if (st.state === 'result' && Math.floor(now / 400) !== st.sec) { st.sec = Math.floor(now / 400); panel(); }   // „Nest für Nest“ läuft weiter
    if (st.reveal) {
      st.reveal.t += dt;
      if (st.reveal.t > 2.9 && st.state === 'reveal') result();
    }
    figs.forEach(f => { f.squash = lerp(f.squash, 1, 1 - Math.exp(-9 * dt)); });
    draw(0); draw(1);
  }

  function draw(k) {
    const f = figs[k], s = st.slices[k];
    const ground = s.h(f.x, f.z);
    const y = st.jump ? st.jump.air : ground + Math.abs(Math.sin(f.phase * 2.2)) * 0.12 * clamp(Math.hypot(f.vx, f.vz) / SPEED, 0, 1);
    let cam = { eye: [f.x, y + 8, f.z + 12], at: [f.x, y + 1, f.z - 1.5] };
    let fogR = L.fog;
    if (st.reveal) {
      const t = ease(clamp(st.reveal.t / 2.4, 0, 1));
      fogR = lerp(L.fog, 320, t * t);
      const mid = X.lift(0.6);
      const over = { eye: [0, mid + 88, 80], at: [0, mid, 0] };
      cam = { eye: cam.eye.map((v, i) => lerp(v, over.eye[i], t)), at: cam.at.map((v, i) => lerp(v, over.at[i], t)) };
      if (orb[k].on) cam = orb[k].cam();
    }
    st.cams[k] = cam;
    const col = COLS[k];
    const objs = [];
    for (const d of st.dots[k]) {
      objs.push({ type: 'dot', x: d.x, y: s.h(d.x, d.z) + 0.08, z: d.z, r: st.reveal ? d.r * (1 + 1.4 * ease(clamp(st.reveal.t / 2.4, 0, 1))) : d.r, flat: 0.18, color: col, glow: st.reveal ? 0.6 : 0.2 });
    }
    // Pfeil: der Anteil des 4D-Gradienten, der in dieser Welt liegt
    if (live() && !st.jump) {
      const g = X.grad(...all()), gx = g[2 * k], gw2 = g[2 * k + 1];
      const dx = -gx, dz = gw2;                  // −Gradient; z = −w₂
      const gl = Math.hypot(dx, dz);
      if (gl > 1e-4) {
        const ux = dx / gl, uz = dz / gl, len = clamp(1.4 + gl * 6, 1.4, 7);
        const pts = [], head = [], hs = 0.9 + (len - 0.9) * 0.78;
        for (let i = 0; i <= 8; i++) { const q = 0.9 + (len - 0.9) * i / 8 * 0.78; pts.push([f.x + ux * q, f.z + uz * q, 0.2]); }
        for (let i = 0; i <= 6; i++) { const q = hs + (len - hs) * i / 6; head.push([f.x + ux * q, f.z + uz * q, 0.62 * (1 - i / 6) + 0.02]); }
        objs.push({ type: 'strip', pts, color: [0.36, 0.95, 0.77], glow: 0.6, lift: 0.14 });
        objs.push({ type: 'strip', pts: head, color: [0.36, 0.95, 0.77], glow: 0.6, lift: 0.15 });
      }
    }
    if (st.reveal && st.flags) {
      const fl = st.flags[k];
      objs.push({ type: 'flag', x: fl.x, z: fl.z, color: [1, 0.78, 0.15], yaw: -Math.PI / 2 });
    }
    const dpr = api.low() ? 1 : Math.min(window.devicePixelRatio || 1, 1.4);
    G[k].frame({ cam, fogR, dpr, objects: objs, playerColor: col, plain: 0,
      player: { x: f.x, y, z: f.z, ground, yaw: f.yaw, tilt: f.tilt, squash: f.squash, hidden: false,
        phase: f.phase, walk: st.jump ? 0 : clamp(Math.hypot(f.vx, f.vz) / SPEED, 0, 1) } });
  }

  return {
    open, close,
    // gemeinsam: los / Runde vorbei (Nebel lichtet sich, dann mp.onResult)
    start() { if (st && st.state === 'intro') start(); },
    reveal() { if (st && (st.state === 'play' || st.state === 'intro')) finish(); },
    vals() { if (!st) return null; const v = {}; for (const k of [0, 1]) v[k] = wOf(figs[k]); return v; },
    setVals(v) {     // eigener Stand vom Server (nach Neuladen)
      if (!st || !v) return;
      for (const k of mine()) if (Array.isArray(v[k])) { const q = posOf(v[k][0], v[k][1]); figs[k].x = q.x; figs[k].z = q.z; }
      rebuild(0, true); rebuild(1, true);
    }
  };
})();
