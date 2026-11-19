/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/mehr.js   ·   Gemeinsam spielen (Migration 0296)
   ══════════════════════════════════════════════════════════════
   Nur im Raum (js/raum.js). Die Lehrkraft drückt in der Übersicht
   „Gemeinsam spielen“ → der Server setzt skill_room_state.data.mp = 1 →
   alle Tablets kommen in die LOBBY: eine Schneefläche, jede Person ein
   Pinguin mit eigener Schalfarbe (automatisch), antippen = dorthin
   laufen (oder WASD/Pfeile). Wer später kommt, landet auch hier.

   Lehrkraft (Beamer): rechts der Kasten mit Level (alle 8, unabhängig
   von der Freigabe), Welt-Nummer, in Level 7/8 Zeit, Teamgröße und die
   Teams (antippen + Team antippen = verschieben, Person antippen =
   tauschen, ×2 = spielt zuerst die übrigen Welten, „Angleichen“).
   Start → Erklärkarte auf allen Tablets („Bereit!“) → „Los!“ → 3-2-1.

   Runde:
     Level 1–6  jedes Tablet spielt das Level wie allein (js/spiel.js,
                NTSpiel.mpOpen), gleiche Welt für alle. Fertig = Zeit/
                Sprünge um oder „Hier bleibe ich“; der Endstand (res)
                geht an den Server. Beamer: Warteschirm (wer ist fertig,
                Sprünge übrig, Zeit). Ende = alle fertig oder „Runde
                beenden“ → Tablets: Nebel lichtet sich, eigener Platz;
                Beamer: Top 5 + Karte, wer wo steht.
     Level 7    zu zweit, jede Person EINE Welt (js/zwei.js mit mp), die
                andere Figur läuft live mit; nur laufen, Ende nach Zeit.
                Beamer: Übersicht der Paare, am Ende Netze vergleichen.
     Level 8    Teams (bis 8) auf labor.html?level=8&mp=1 (js/labor.js);
                Beamer: Übersicht, „Beobachten“ = live ein Team.
   Rangliste nur am Ende der Runde, nichts wird aufgehoben.
   ══════════════════════════════════════════════════════════════ */

window.NTMehr = (function () {
  'use strict';

  const R = window.NTRaum, SP = window.NTSpiel;
  if (!R || !R.inRoom || !SP) return null;
  const G = SP.G, T = R.isTeacher;
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = SP.fmt;
  const LV = id => SP.LEVELS.find(l => l.id === id);
  // Level 8 hat in LEVELS nur den Verweis aufs Labor – für Erklärkarte und Beamer:
  const L8 = { id: 8, name: 'Pinguine in 3D', short: 'Ein Netz mit 4 Neuronen sortiert drei Arten',
    lead: 'Ein Netz mit <b>vier Neuronen</b> sortiert alle <b>drei Arten</b> – im Team.',
    steps: ['Euer Team ist <b>ein Netz</b>: 16 Werte = <b>8 Welten</b>. Jede Person zieht in ihren Welten.',
            'Ziehst du, verbiegen sich alle Welten. <b>Sprecht euch ab!</b>',
            'Am Ende zählt, wie viele der 342 Pinguine euer Netz richtig sortiert.'],
    outro: 'Ihr wart zusammen <b>ein Netz</b>: Jede Welt ist ein Paar Gewichte. Ein echtes Netz bewegt alle Gewichte gleichzeitig – genau in Pfeilrichtung, Schritt für Schritt. Das heißt <b>Training</b>.' };
  const lvInfo = id => (id === 8 ? L8 : LV(id));
  const TIMES = [60, 90, 120, 180, 240, 300, 420, 600];
  const SPEED = 7;

  const root = $('#mp');
  const M = {
    on: false, st: null, busy: false, last: 0, view: '', flagOff: false,
    me: { x: 0, z: 0, vx: 0, vz: 0, yaw: Math.PI, tilt: 0, phase: 0, tx: null, tz: null, color: [1, 0.55, 0.2], seed: 0, init: false },
    peng: new Map(), sentPos: '', posAt: 0, movedAt: 0, sc: null,
    res: null, resPending: false, ready: false, started: false, ended: false, waiting: false, resultShown: false,
    l7: { vals: null, sent: '', at: 0 }, infoSent: '', infoAt: 0,
    sel: null, sideKey: '', stageKey: '', sel7: null, mapKey: '', mapImg: null
  };

  /* ══ Lobby: Schneefläche mit Pinguinen ══════════════════════ */
  const LW = (function () {
    const W = 64;
    const h = (x, z) => 0.5 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) + 0.3 * Math.sin(x * 0.47 - z * 0.39) + 0.0015 * (x * x + z * z);
    return { kind: 'lobby', W, h, grad: (x, z) => [(h(x + 0.05, z) - h(x - 0.05, z)) / 0.1, (h(x, z + 0.05) - h(x, z - 0.05)) / 0.1],
             meshN: 120, min: { x: 0, z: 0, h: 0 }, start: { x: 0, z: 0 } };
  })();
  const A = 17;                                        // Spielfeld ±A (Bildschirm: rechts = −x, oben = +z)
  const toWorld = (px, py) => ({ x: (0.5 - px) * 2 * A, z: (0.5 - py) * 2 * A });
  const toPos = (x, z) => [clamp(0.5 - x / (2 * A), 0, 1), clamp(0.5 - z / (2 * A), 0, 1)];
  const wideSide = () => T && M.view === 'lobby' && window.innerWidth >= 900;

  function lobbyCam() {
    const cv = $('#welt'), asp = cv.clientWidth / Math.max(1, cv.clientHeight);
    const k = asp < 1.3 ? 1 + (1.3 - asp) * 1.0 : 1;
    const sx = wideSide() ? -9 : 0;                    // Kasten rechts: Feld rückt nach links (rechts = −x)
    return { eye: [sx, 31 * k, -27 * k], at: [sx, 0, 1.5] };
  }
  function pengObj(q) {
    const g = LW.h(q.x, q.z), sp = Math.hypot(q.vx, q.vz), wk = clamp(sp / SPEED, 0, 1);
    return { x: q.x, y: g + Math.abs(Math.sin(q.phase * 2.2)) * 0.12 * wk, z: q.z, ground: g, yaw: q.yaw, tilt: q.tilt,
             squash: 1, phase: q.phase, walk: wk, color: q.color, seed: q.seed, hidden: false };
  }
  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (!M.on || M.view !== 'lobby' || T || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  function stepMe(dt) {
    const p = M.me;
    let ix = 0, iy = 0;
    if (keys.has('w') || keys.has('arrowup')) iy += 1;
    if (keys.has('s') || keys.has('arrowdown')) iy -= 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    if (keys.has('d') || keys.has('arrowright')) ix += 1;
    let tvx = 0, tvz = 0;
    if (ix || iy) {
      p.tx = null;
      const l = Math.hypot(ix, iy);
      tvx = -ix / l * SPEED; tvz = iy / l * SPEED;
    } else if (p.tx !== null) {
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.25) p.tx = null;
      else { const s = Math.min(SPEED, d * 3.5); tvx = dx / d * s; tvz = dz / d * s; }
    }
    moveQ(p, tvx, tvz, dt);
    if (Math.hypot(p.vx, p.vz) > 0.2) M.movedAt = performance.now();
  }
  function moveQ(q, tvx, tvz, dt) {
    const a = 1 - Math.exp(-8 * dt);
    q.vx = lerp(q.vx, tvx, a); q.vz = lerp(q.vz, tvz, a);
    q.x = clamp(q.x + q.vx * dt, -A, A); q.z = clamp(q.z + q.vz * dt, -A, A);
    const sp = Math.hypot(q.vx, q.vz);
    if (Math.hypot(tvx, tvz) > 0.3) q.yaw += angDiff(Math.atan2(tvx, tvz), q.yaw) * (1 - Math.exp(-10 * dt));
    q.phase += sp * dt * 1.3;
    q.tilt = lerp(q.tilt, clamp(sp / SPEED, 0, 1.2) * 0.22, a);
  }
  function stepOthers(dt) {
    for (const q of M.peng.values()) {
      const dx = q.tx - q.x, dz = q.tz - q.z, d = Math.hypot(dx, dz);
      if (d > 20) { q.x = q.tx; q.z = q.tz; q.vx = q.vz = 0; continue; }
      const s = d > 0.15 ? Math.min(SPEED * 1.2, d * 3) : 0;
      moveQ(q, d > 0.15 ? dx / d * s : 0, d > 0.15 ? dz / d * s : 0, dt);
    }
  }

  function frame(dt) {
    if (!M.on) return;
    if (!T) stepMe(dt);
    stepOthers(dt);
    const cam = lobbyCam();
    const others = [];
    for (const q of M.peng.values()) others.push(pengObj(q));
    const showMe = !T && M.me.init;
    const objs = [];
    if (showMe && M.me.tx !== null) {
      const ring = [];
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; ring.push([M.me.tx + Math.cos(a) * 0.8, M.me.tz + Math.sin(a) * 0.8, 0.1]); }
      objs.push({ type: 'strip', pts: ring, closed: true, color: M.me.color, glow: 0.7, lift: 0.1 });
    }
    const low = SP.low();
    const sc = { cam, fogR: 48, fogAt: [0, 0], dpr: low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5), objects: objs,
                 playerColor: M.me.color, plain: 0.45,
                 player: showMe ? pengObj(M.me) : { hidden: true, x: 0, z: 0 }, others };
    M.sc = sc;
    G.frame(sc);
    names(sc);
  }

  // Namen über den Pinguinen
  function names(sc) {
    const box = $('#mpNames');
    const list = [];
    for (const [id, q] of M.peng) list.push({ id, q, n: q.n });
    if (!T && M.me.init) list.push({ id: 'me', q: M.me, n: 'Du', me: true });
    const seen = new Set();
    for (const it of list) {
      seen.add(it.id);
      let el = box.querySelector('[data-id="' + it.id + '"]');
      if (!el) {
        el = document.createElement('span');
        el.className = 'mpn' + (it.me ? ' me' : '');
        el.dataset.id = it.id;
        box.appendChild(el);
      }
      const html = '<i style="background:' + R.color(it.q.ci) + '"></i>' + esc(it.n);
      if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
      const p = G.project(sc, [it.q.x, LW.h(it.q.x, it.q.z) + 2.5, it.q.z]);
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
    for (const el of [...box.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  // Antippen = dorthin laufen
  const cv = $('#welt');
  function aim(e) {
    if (!M.on || T || M.view !== 'lobby' || !M.sc) return;
    const r = cv.getBoundingClientRect();
    const q = G.unproject(M.sc, e.clientX - r.left, e.clientY - r.top, 0.3);
    if (!q) return;
    M.me.tx = clamp(q.x, -A, A); M.me.tz = clamp(q.z, -A, A);
  }
  let aimId = null;
  cv.addEventListener('pointerdown', e => { if (!M.on || M.view !== 'lobby') return; aimId = e.pointerId; aim(e); });
  cv.addEventListener('pointermove', e => { if (e.pointerId === aimId) aim(e); });
  cv.addEventListener('pointerup', e => { if (e.pointerId === aimId) aimId = null; });
  cv.addEventListener('pointercancel', () => { aimId = null; });

  // Pinguine aus der Ansicht des Servers
  function syncPeople(st) {
    const ph = st.phase, meId = st.me && st.me.id;
    const show = p => p.on && p.id !== meId && (ph === 'lobby' || ph === 'off' || !p.in);
    const keep = new Set();
    for (const p of st.people) {
      if (!show(p)) continue;
      keep.add(p.id);
      const w = toWorld(p.x == null ? 0.5 : p.x, p.y == null ? 0.5 : p.y);
      let q = M.peng.get(p.id);
      if (!q) {
        q = { x: w.x, z: w.z, vx: 0, vz: 0, yaw: Math.PI, tilt: 0, phase: Math.random() * 6, seed: Math.random() * 9 };
        M.peng.set(p.id, q);
      }
      q.tx = w.x; q.tz = w.z; q.n = p.n; q.ci = p.c; q.color = R.rgb(p.c);
    }
    for (const id of [...M.peng.keys()]) if (!keep.has(id)) M.peng.delete(id);
    if (!T && st.me) {
      M.me.ci = st.me.c; M.me.color = R.rgb(st.me.c);
      if (!M.me.init) {
        const mine = st.people.find(p => p.id === meId);
        const w = toWorld(mine && mine.x != null ? mine.x : 0.5, mine && mine.y != null ? mine.y : 0.5);
        M.me.x = w.x; M.me.z = w.z; M.me.init = true;
        M.sentPos = toPos(M.me.x, M.me.z).map(v => v.toFixed(3)).join();
      }
    }
  }

  /* ══ An / aus ═════════════════════════════════════════════ */
  function enter() {
    if (M.on) return;
    M.on = true; M.view = ''; M.sideKey = ''; M.stageKey = '';
    root.hidden = false;
    document.body.classList.add('mp-on');
    document.body.classList.toggle('mp-t', T);
    toLobby(true);
  }
  function leave() {
    if (!M.on) return;
    M.on = false; M.view = ''; M.st = null;
    M.peng.clear(); M.me.init = false;
    root.hidden = true;
    $('#mpNames').innerHTML = ''; $('#mpSide').innerHTML = ''; $('#mpStage').innerHTML = ''; $('#mpStage').hidden = true;
    $('#mpCount').hidden = true; $('#mpBanner').hidden = true;
    document.body.classList.remove('mp-on', 'mp-t', 'mp-stage');
    SP.leave();
    R.away(null);
  }
  function toLobby(force) {
    if (M.view === 'lobby' && !force) return;
    M.view = 'lobby'; M.sideKey = ''; M.stageKey = '';
    M.started = M.ended = M.waiting = M.resultShown = false;
    SP.lobby(frame);
    G.setWorld(LW, SP.theme());
    $('#mpStage').hidden = true; $('#mpStage').innerHTML = '';
    document.body.classList.remove('mp-stage');
    $('#mpSide').hidden = !T;
  }

  /* ══ Takt ══════════════════════════════════════════════════ */
  function interval() {
    const st = M.st;
    if (!st) return 700;
    const ph = st.phase, me = st.me || {};
    if (T) {
      if (ph === 'countdown') return 300;
      if (ph === 'running') return st.level >= 7 ? 600 : 1000;
      if (ph === 'ended') return 2000;
      return 700;
    }
    if (M.view === 'lobby') return performance.now() - M.movedAt < 600 ? 250 : 1000;
    if (ph === 'intro') return 800;
    if (ph === 'countdown') return 250;
    if (ph === 'running') return st.level === 7 && me.in ? 250 : 1200;
    return 1500;
  }
  function payload() {
    const p = {}, st = M.st, now = performance.now();
    if (M.resPending && M.res) p.res = M.res;
    if (M.readyPending) p.ready = true;
    if (!st) return p;
    if (M.view === 'lobby' && M.me.init) {
      const pos = toPos(M.me.x, M.me.z), key = pos.map(v => v.toFixed(3)).join();
      if (key !== M.sentPos && now - M.posAt > 200) { p.pos = pos.map(v => Math.round(v * 1000) / 1000); M.sentPos = key; M.posAt = now; }
    }
    if (st.phase === 'running' && st.me && st.me.in) {
      if (st.level <= 6 && !M.res) {
        const inf = SP.mpInfo();
        const key = inf ? JSON.stringify(inf) : '';
        if (inf && key !== M.infoSent && now - M.infoAt > 1400) { p.info = inf; M.infoSent = key; M.infoAt = now; }
      }
      if (st.level === 7 && M.l7.vals) {
        const v = {};
        for (const k of Object.keys(M.l7.vals)) v[k] = M.l7.vals[k].map(x => Math.round(x * 1000) / 1000);
        const key = JSON.stringify(v);
        if (key !== M.l7.sent) { p.vals = v; M.l7.sent = key; }
      }
    }
    return p;
  }
  async function poll(extra) {
    if (!M.on && !extra) return;
    if (M.busy) return;
    M.busy = true;
    let res;
    try {
      res = T ? await R.rpc('get') : await R.rpc('play', { p: Object.assign(payload(), extra || {}) });
    } finally { M.busy = false; M.last = performance.now(); }
    handle(res);
  }
  function handle(res) {
    if (!res) return;
    if (res.ok) { apply(res); return; }
    if (['removed', 'blocked', 'room_gone', 'unknown_token', 'not_found', 'mp_off'].includes(res.error)) { M.flagOff = true; leave(); }
  }
  async function act(a, args) {
    const res = await R.rpc('act', { act: a, args: args || {} });
    if (res && res.ok) { if (a === 'off') { M.flagOff = true; leave(); return; } apply(res); }
    else toast(errText(res && res.error));
    return res;
  }
  function errText(e) {
    return ({ team_full: 'Das Team ist schon voll.', nobody: 'Noch kein Tablet in der Lobby.', no_level: 'Erst ein Level wählen.',
              network: 'Keine Verbindung. Gleich noch einmal.', fn_missing: 'In der Datenbank fehlt Migration 0296.',
              not_allowed: 'Das geht gerade nicht.' })[e] || 'Das hat nicht geklappt (' + e + ').';
  }
  let toastT = 0;
  function toast(t) {
    const el = $('#mpToast');
    el.textContent = t; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2800);
  }

  setInterval(() => {
    if (!M.on) return;
    if (!M.busy && performance.now() - M.last > interval()) poll();
    tickUi();
  }, 100);

  // Countdown, Uhren
  function tickUi() {
    const st = M.st;
    R.away(M.on ? st : null);
    const c = $('#mpCount');
    if (st && st.phase === 'countdown') {
      const n = Math.ceil(R.left(st.countdown_ends_at) || 0);
      c.hidden = false;
      const t = n > 0 ? String(n) : 'Los!';
      if (c.textContent !== t) { c.textContent = t; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
      if (n <= 0 && !T && M.view !== 'lobby') startRound();
    } else c.hidden = true;
    const tm = $('#mpTime');
    if (tm && st) {
      const s = st.ends_at && st.phase === 'running' ? Math.ceil(R.left(st.ends_at)) : null;
      tm.textContent = s != null ? '⏱ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '';
      tm.classList.toggle('warn', s != null && s <= 10);
    }
  }

  /* ══ Ansicht übernehmen ═══════════════════════════════════ */
  function apply(st) {
    R.clock(st);
    if (st.phase === 'off') { leave(); return; }
    if (!M.on) enter();
    M.st = st;
    syncPeople(st);
    if (T) teacher(st); else student(st);
  }

  /* ══ Tablet ════════════════════════════════════════════════ */
  function student(st) {
    const me = st.me || {}, ph = st.phase;
    if (M.resPending && me.f) M.resPending = false;
    if (M.readyPending && (me.r || st.phase !== 'intro')) M.readyPending = false;
    const inR = me.in && ph !== 'lobby';
    if (!inR) { toLobby(); banner(st); return; }
    $('#mpBanner').hidden = true;
    if (st.level === 8) { M.on = false; location.href = 'labor.html?level=8&mp=1'; return; }
    const key = 'r' + st.run + '.' + st.level;
    if (M.view !== key) openRound(st, key);
    if (ph === 'running') startRound();
    if (ph === 'ended') endRound();
    if (M.waiting && !M.ended) waitCard(st);
    if (M.resultShown) resultCard(st);
  }

  function banner(st) {
    const b = $('#mpBanner'), me = st.me || {}, ph = st.phase;
    let h;
    if (ph !== 'lobby' && !me.in) h = '<b>Die Runde läuft schon.</b> Du bist in der nächsten dabei – lauf solange herum!';
    else if (!st.level) h = '<b>Gemeinsam spielen</b> · Tippe auf den Schnee, dann läuft dein Pinguin dorthin. Gleich geht’s los!';
    else {
      const L = lvInfo(st.level);
      h = '<small>Nächstes Level</small><b>' + st.level + ' · ' + esc(L.name) + '</b>';
      if (st.level >= 7 && me.t !== null && me.t !== undefined) {
        const mates = st.people.filter(p => p.on && p.t === me.t && p.id !== me.id).map(p => esc(p.n));
        const n = (me.s || []).length;
        h += '<span class="mpb-team">' + (mates.length ? 'Dein Team: ' + mates.join(', ') : 'Du spielst allein') +
          ' · du spielst ' + (st.level === 7 ? (n === 2 ? 'beide Welten' : 'Welt ' + (me.s[0] === 0 ? 'A' : 'B')) : (n === 1 ? '1 Welt' : n + ' Welten')) + '</span>';
      }
    }
    if (b.dataset.h !== h) { b.innerHTML = h; b.dataset.h = h; }
    b.hidden = false;
  }

  function introBtns() {
    if (M.ready) return [['Bereit ✓ · warte auf den Start …', () => {}, 'wait']];
    return [['Bereit!', () => {
      M.ready = true; M.readyPending = true;
      const b = document.querySelector('#card .card-btns .btn');
      if (b) { b.textContent = 'Bereit ✓ · warte auf den Start …'; b.className = 'btn wait'; }
      poll();
    }, 'primary']];
  }

  function openRound(st, key) {
    const me = st.me || {}, ph = st.phase, lv = st.level;
    M.view = key; M.started = false; M.ended = false; M.waiting = false; M.resultShown = false;
    M.ready = !!me.r; M.res = me.res || null; M.resPending = false; M.infoSent = ''; M.l7 = { vals: null, sent: '', at: 0 };
    $('#mpSide').hidden = true;
    $('#mpNames').innerHTML = '';
    if (lv <= 6) {
      const inf = me.f && me.res ? { x: me.res.x, z: me.res.z } : me.i && isFinite(me.i.x) ? me.i : null;
      SP.mpOpen(lv, st.seed, {
        color: R.rgb(me.c), intro: ph === 'intro' ? introBtns() : null, resume: ph !== 'intro' ? inf : null,
        onDone(res) { M.res = res; M.resPending = true; M.waiting = true; poll(); waitCard(M.st, true); },
        onResult(again) { M.resultShown = true; M.resKey = ''; resultCard(M.st, again); }
      });
      if (me.f) M.waiting = true;
    } else if (lv === 7) {
      const mine = new Set(me.s || []);
      const team = st.people.filter(p => p.in && p.t === me.t);
      const nameOf = k => { if (mine.has(k)) return 'du'; const p = team.find(q => (q.s || []).includes(k)); return p ? p.n : '–'; };
      SP.mpTwo(st.seed, {
        ctl: [mine.has(0), mine.has(1)], names: [nameOf(0), nameOf(1)],
        intro: ph === 'intro' ? introBtns() : [],
        left: () => (M.st && M.st.ends_at ? R.left(M.st.ends_at) : M.st ? M.st.secs : 0),
        remote(k) {
          const s = M.st; if (!s) return null;
          const p = s.people.find(q => q.in && q.t === me.t && (q.s || []).includes(k));
          return p && p.v && Array.isArray(p.v[k]) ? p.v[k] : null;
        },
        onMove(v) { M.l7.vals = v; },
        onResult() { M.resultShown = true; M.resKey = ''; resultCard(M.st); }
      });
      if (ph !== 'intro') $('#card').hidden = true;
      const mineP = st.people.find(p => p.id === me.id);
      if (mineP && mineP.v && Object.keys(mineP.v).length) NTZwei.setVals(mineP.v);
    }
  }
  function startRound() {
    if (M.started || !M.st) return;
    const st = M.st;
    if (st.phase !== 'running' && !(st.phase === 'countdown' && (R.left(st.countdown_ends_at) || 0) <= 0)) return;
    M.started = true;
    if (st.level <= 6) {
      const L = LV(st.level);
      const left = L.mode === 'walk' && st.ends_at ? R.left(st.ends_at) - 2 : st.level <= 2 ? L.time : null;
      SP.mpStart(left);
      if (st.me && st.me.f) SP.mpStop();
    } else if (st.level === 7) NTZwei.start();
  }
  function endRound() {
    if (M.ended) return;
    M.ended = true; M.waiting = false;
    if (!M.started) { M.started = true; if (M.st.level <= 6) SP.mpStart(null); else NTZwei.start(); }
    if (M.st.level <= 6) SP.mpReveal(); else NTZwei.reveal();
  }

  function waitCard(st, force) {
    if (!st) return;
    const inR = st.people.filter(p => p.in), done = inR.filter(p => p.f).length;
    const k = 'w' + done + '/' + inR.length;
    if (!force && M.waitKey === k && !$('#card').hidden) return;
    M.waitKey = k;
    const r = M.res || {};
    SP.card('<div class="card-kicker">Level ' + st.level + ' · gemeinsam</div>' +
      '<div class="res-head"><p><b>Geschafft!</b> ' + esc(r.t || '') + '</p></div>' +
      '<p class="mpwait"><span class="mpdots"><i></i><i></i><i></i></span> Warte auf die anderen · <b>' + done + ' von ' + inR.length + '</b> fertig</p>', []);
  }

  // Ende der Runde am Tablet: Leiste unten statt Karte (Sönke 18.11.2026), Karte bleibt frei drehbar
  function resultCard(st, again) {
    if (!st || document.body.classList.contains('post')) return;
    const me = st.me || {}, lv = st.level, L = lvInfo(lv);
    let head = '', mine = '', top = '', team = false;
    if (again) M.resKey = '';
    if (lv <= 6) {
      const rank = st.people.filter(p => p.in && p.res && isFinite(p.res.s)).sort((a, b) => a.res.s - b.res.s);
      const k = 'r' + rank.length + '.' + SP.postN();
      if (M.resKey === k) return;
      M.resKey = k;
      const i = rank.findIndex(p => p.id === me.id);
      head = rank.length > 1 && i >= 0 ? 'Platz <b>' + (i + 1) + '</b> von ' + rank.length : '';
      const r = (i >= 0 ? rank[i].res : M.res) || {};
      mine = 'Du: ' + esc(r.t || '');
      const now = SP.postN() ? SP.rate() : null;
      if (now) mine += '<br><small>weiter trainiert (+' + SP.postN() + ', zählt nicht mehr):</small> ' + now.line;
      top = rank.slice(0, 3).map((p, j) => '<li' + (p.id === me.id ? ' class="me"' : '') + '><span class="n">' + (j + 1) + '</span><i style="background:' +
        R.color(p.c) + '"></i><b>' + esc(p.n) + '</b><small>' + esc(p.res.t) + '</small></li>').join('');
    } else {
      const rank = teamRank7(st);
      const k = 't' + rank.length;
      if (M.resKey === k) return;
      M.resKey = k;
      const i = rank.findIndex(r => r.t === me.t), r = rank[i];
      head = rank.length > 1 && i >= 0 ? 'Platz <b>' + (i + 1) + '</b> von ' + rank.length : '';
      mine = r ? 'Euer Netz: <b>' + r.sc.right + ' von 4</b> Nestern richtig <small>· Fehler ' + fmt(r.sc.loss, 2) + '</small>' : '';
      // Team-Spiel: alle Teams mit ihren Punkten, gleich offen (Sönke 18.11.2026: „die User sollen auch die Punkte sehen“)
      top = rank.map((x, j) => '<li' + (x.t === me.t ? ' class="me"' : '') + ' style="--tc:' + R.teamColor(x.i) + '"><span class="n">' + (j + 1) + '</span><b class="tn">' + R.teamName(x.i) + '</b><em>' +
        x.members.map(p => R.pingu(p.c) + esc(p.n)).join(' ') + '</em><small><b>' + x.sc.right + ' von 4</b> Nestern · Fehler ' + fmt(x.sc.loss, 2) + '</small></li>').join('');
      team = true;
    }
    // ohne „Weiter trainieren“ und „Und die KI?“ (Sönke 18.11.2026), die Top 3 bleiben zum Aufklappen
    SP.endBar({
      kick: 'Level ' + lv + ' · Runde vorbei · gleich startet deine Lehrkraft die nächste',
      place: head || 'Runde vorbei', line: mine,
      more: top ? '<ol class="mprank' + (team ? ' teamrank' : '') + '">' + top + '</ol>' : '', moreLabel: team ? 'Rangliste' : 'Top 3', open: team,
      btns: []
    });
  }

  /* ══ Wertung Level 7 / 8 ═══════════════════════════════════ */
  function teamsOf(st) {
    const m = new Map();
    for (const p of st.people) if (p.in && p.t !== null && p.t !== undefined) { if (!m.has(p.t)) m.set(p.t, []); m.get(p.t).push(p); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, members], i) => ({ t, i, members }));
  }
  function teamRank7(st) {
    return teamsOf(st).map(x => Object.assign(x, { sc: R.l7.score(st.seed, R.teamVals(x.members)) }))
      .sort((a, b) => b.sc.right - a.sc.right || a.sc.loss - b.sc.loss);
  }
  function teamRank8(st) {
    return teamsOf(st).map(x => Object.assign(x, { sc: R.l8.score(st.seed, R.teamVals(x.members)) }))
      .sort((a, b) => a.sc.wrong - b.sc.wrong || a.sc.loss - b.sc.loss);
  }

  /* ══ Lehrkraft ═════════════════════════════════════════════ */
  function teacher(st) {
    const ph = st.phase;
    if (ph === 'lobby') {
      toLobby();
      side(st);
      return;
    }
    if (M.view === 'lobby') { M.view = 'stage'; $('#mpSide').hidden = true; M.stageKey = ''; }
    stage(st);
  }

  // ── Kasten rechts in der Lobby ──
  function side(st) {
    const box = $('#mpSide');
    box.hidden = false;
    const here = st.people.filter(p => p.on);
    const lv = st.level;
    const teams = lv >= 7 ? teamsOfLobby(st) : [];
    const key = JSON.stringify([lv, st.seed, st.secs, st.team_size, M.sel, here.map(p => [p.id, p.n, p.c, p.t, p.d, p.s])]);
    if (key === M.sideKey || M.drag) return;
    M.sideKey = key;
    let h = '<div class="mps-h"><div><b>Gemeinsam spielen</b><small>' + here.length + ' ' + (here.length === 1 ? 'Pinguin' : 'Pinguine') +
      ' in der Lobby</small></div><button class="btn sm" type="button" data-a="off">Beenden</button></div>';
    // ist ein Level gewählt, schrumpfen die Kacheln auf eine Reihe – Platz für die Teams
    h += '<div class="mps-t">Level wählen</div><div class="mps-lv' + (lv ? ' compact' : '') + '">' + [1, 2, 3, 4, 5, 6, 7, 8].map(id => {
      const L = lvInfo(id);
      return '<button type="button" data-lv="' + id + '" class="' + (id === lv ? 'on' : '') + '" title="' + esc(L.name) + '">' +
        '<span class="im">' + (window.NTBild ? NTBild.tile(id) : '') + '<span class="nr">' + id + '</span></span><small>' + esc(L.name) + '</small></button>';
    }).join('') + '</div>';
    if (lv) {
      const L = lvInfo(lv);
      h += '<div class="mps-sel"><b>Level ' + lv + ' · ' + esc(L.name) + '</b><small>' + esc(L.short) + '</small>' +
        '<small class="mps-mode">' + (lv <= 6 ? 'Jeder gegen jeden' : lv === 7 ? 'Zu zweit · nur laufen' : 'Im Team · nur laufen') + '</small></div>';
      h += '<div class="mps-row"><span>Welt</span><b class="mono">' + st.seed + '</b><button class="btn sm" type="button" data-a="seed">Neue Welt</button></div>';
      if (lv >= 7) {
        h += '<div class="mps-row"><span>Zeit</span><select data-a="secs" aria-label="Zeit">' + TIMES.map(s =>
          '<option value="' + s + '"' + (s === st.secs ? ' selected' : '') + '>' + (s < 60 ? s + ' s' : (s / 60) + ' min') + '</option>').join('') +
          (TIMES.includes(st.secs) ? '' : '<option selected value="' + st.secs + '">' + st.secs + ' s</option>') + '</select></div>';
      }
      if (lv === 8) {
        h += '<div class="mps-row"><span>Teamgröße</span><div class="seg">' + [2, 3, 4, 5, 6, 7, 8].map(n =>
          '<button type="button" data-size="' + n + '" class="' + (n === st.team_size ? 'on' : '') + '">' + n + '</button>').join('') + '</div></div>';
      }
      if (lv >= 7) {
        // Teams als Karten in Teamfarbe, Personen als Pinguine; Level 8 zeigt die 8 Welten des Teams als Leiste
        h += '<div class="mps-t">Teams <button class="btn sm" type="button" data-a="balance">Angleichen</button></div><div class="mps-teams">' +
          teams.map(x => '<div class="mpt" data-team="' + x.t + '" style="--tc:' + R.teamColor(x.i) + '"><div class="mpt-h"><span class="mpt-nm">' + R.teamName(x.i) + '</span>' +
            '<small>' + x.members.length + (x.members.length === 1 ? ' Person' : ' Personen') + '</small>' + slotBar(x.members, lv) + '</div>' +
            x.members.map(p => chip(p, lv)).join('') + '</div>').join('') +
          '<div class="mpt new" data-team="-1"><div class="mpt-h">+ neues Team</div></div></div>' +
          '<p class="mps-hint">Pinguin auf ein Team <b>ziehen</b> – oder antippen und dann das Team antippen. Auf einen anderen Pinguin = tauschen.' +
          (lv === 8 ? ' <b>×2</b> = bekommt zuerst die übrigen Welten.' : ' Allein = spielt beide Welten.') + '</p>';
      }
      // Start-Knopf klebt unten am Kasten – nie mehr hinscrollen (Sönke 18.11.2026)
      h += '<div class="mps-foot"><button class="btn primary big" type="button" data-a="start"' + (here.length ? '' : ' disabled') + '>Start · Level ' + lv +
        (lv >= 7 && teams.length ? ' · ' + teams.length + (teams.length === 1 ? ' Team' : ' Teams') : '') + '</button></div>';
    } else {
      h += '<p class="mps-hint">Alle Tablets im Raum sind jetzt hier. Wähle ein Level – alle spielen dieselbe Welt.</p>';
    }
    const top = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = top;
  }
  // Level 8: die 8 Welten des Teams als Kästchen in der Schalfarbe ihrer Person (leer = noch frei)
  function slotBar(members, lv) {
    const n = lv === 8 ? 8 : 2, own = {};
    for (const p of members) for (const sl of p.s || []) own[sl] = p;
    let h = '<span class="mpt-sl" title="Welten des Teams">';
    for (let s = 0; s < n; s++) h += '<i' + (own[s] ? ' style="background:' + R.color(own[s].c) + '"' : ' class="free"') + '></i>';
    return h + '</span>';
  }
  function teamsOfLobby(st) {
    const m = new Map();
    for (const p of st.people) if (p.on && p.t !== null && p.t !== undefined) { if (!m.has(p.t)) m.set(p.t, []); m.get(p.t).push(p); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, members], i) => ({ t, i, members }));
  }
  function chip(p, lv) {
    const n = (p.s || []).length;
    const w = lv === 7 ? (n === 2 ? 'A + B' : n ? (p.s[0] === 0 ? 'Welt A' : 'Welt B') : '–') : (n === 1 ? '1 Welt' : n + ' Welten');
    return '<button type="button" class="mpc' + (M.sel === p.id ? ' sel' : '') + '" data-pid="' + p.id + '">' +
      R.pingu(p.c) + '<span>' + esc(p.n) + '</span><small>' + w + '</small>' +
      (lv === 8 ? '<span class="dbl' + (p.d ? ' on' : '') + '" data-dbl="' + p.id + '" title="spielt 2 (bekommt zuerst übrige Welten)">×2</span>' : '') + '</button>';
  }
  // Pinguin ziehen: auf ein Team = verschieben, auf einen Pinguin eines anderen Teams = tauschen
  // (Antippen wie bisher geht weiter; ein Zug ab 8 px verschluckt den Klick danach)
  $('#mpSide').addEventListener('pointerdown', e => {
    const c = e.target.closest('.mpc');
    if (!c || e.target.closest('.dbl') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    M.drag = { id: c.dataset.pid, el: c, x: e.clientX, y: e.clientY, pid: e.pointerId, on: false, ghost: null };
  });
  window.addEventListener('pointermove', e => {
    const d = M.drag; if (!d || e.pointerId !== d.pid) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      d.on = true;
      const r = d.el.getBoundingClientRect();
      d.ox = e.clientX - r.left; d.oy = e.clientY - r.top;
      d.ghost = d.el.cloneNode(true); d.ghost.classList.add('mpc-ghost');
      d.ghost.style.width = r.width + 'px';
      document.body.appendChild(d.ghost);
      d.el.classList.add('dragging');
      $('#mpSide').classList.add('dragging');
    }
    e.preventDefault();
    d.ghost.style.transform = 'translate(' + (e.clientX - d.ox) + 'px,' + (e.clientY - d.oy) + 'px)';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const tgt = under && (under.closest('#mpSide .mpc:not(.dragging)') || under.closest('#mpSide .mpt'));
    for (const x of document.querySelectorAll('#mpSide .drop')) if (x !== tgt) x.classList.remove('drop');
    if (tgt) tgt.classList.add('drop');
    d.tgt = tgt;
  }, { passive: false });
  const dragEnd = e => {
    const d = M.drag; if (!d || e.pointerId !== d.pid) return;
    M.drag = null;
    if (!d.on) return;
    d.ghost.remove(); d.el.classList.remove('dragging'); $('#mpSide').classList.remove('dragging');
    for (const x of document.querySelectorAll('#mpSide .drop')) x.classList.remove('drop');
    M.noClick = performance.now();
    const st = M.st, t = e.type === 'pointerup' ? d.tgt : null;
    M.sel = null; M.sideKey = '';
    if (t && t.classList.contains('mpc')) {
      const a = st.people.find(p => p.id === d.id), b = st.people.find(p => p.id === t.dataset.pid);
      if (a && b && a.t !== b.t) { act('swap', { a: a.id, b: b.id }); return; }
    } else if (t && t.dataset.team) {
      const a = st.people.find(p => p.id === d.id);
      if (a && String(a.t) !== t.dataset.team) { act('move', { pid: d.id, team: +t.dataset.team }); return; }
    }
    side(st);
  };
  window.addEventListener('pointerup', dragEnd);
  window.addEventListener('pointercancel', dragEnd);
  $('#mpSide').addEventListener('click', e => {
    const t = e.target.closest('[data-lv],[data-a],[data-size],[data-dbl],[data-pid],[data-team]');
    if (!t || t.tagName === 'SELECT') return;
    if (M.noClick && performance.now() - M.noClick < 350) return;   // Klick nach dem Ziehen
    const st = M.st;
    if (t.dataset.lv) { act('level', { n: +t.dataset.lv }); return; }
    if (t.dataset.size) { act('size', { n: +t.dataset.size }); return; }
    if (t.dataset.dbl) {
      e.stopPropagation();
      const p = st.people.find(q => q.id === t.dataset.dbl);
      act('dbl', { pid: t.dataset.dbl, on: !(p && p.d) });
      return;
    }
    if (t.dataset.a) {
      if (t.dataset.a === 'off') { act('off'); return; }
      act(t.dataset.a);
      return;
    }
    if (t.dataset.pid) {
      const id = t.dataset.pid;
      if (!M.sel) { M.sel = id; M.sideKey = ''; side(st); return; }
      if (M.sel === id) { M.sel = null; M.sideKey = ''; side(st); return; }
      const a = st.people.find(p => p.id === M.sel), b = st.people.find(p => p.id === id);
      M.sel = null;
      if (a && b && a.t !== b.t) act('swap', { a: a.id, b: b.id }); else { M.sideKey = ''; side(st); }
      return;
    }
    if (t.dataset.team && M.sel) {
      const id = M.sel; M.sel = null;
      act('move', { pid: id, team: +t.dataset.team });
    }
  });
  $('#mpSide').addEventListener('change', e => {
    if (e.target.dataset.a === 'secs') act('secs', { n: +e.target.value });
  });

  // ── Bühne (Erklärkarte, Warteschirm, Ergebnis) ──
  function stage(st) {
    const el = $('#mpStage'), ph = st.phase, lv = st.level, L = lvInfo(lv);
    el.hidden = false;
    document.body.classList.add('mp-stage');
    const inR = st.people.filter(p => p.in);
    const key = ph + '.' + st.run + '.' + lv + (ph === 'ended' ? '.' + M.sel7 : '');
    const head = '<div class="mpst-h"><div><small>Level ' + lv + ' · Welt ' + st.seed + '</small><b>' + esc(L.name) + '</b></div>' +
      '<span id="mpTime" class="mpst-time"></span><span class="mpst-n" id="mpStN"></span><div class="mpst-btns" id="mpStBtns"></div></div>';
    if (M.stageKey !== key) {
      M.stageKey = key;
      M.mapKey = '';
      let body = '';
      if (ph === 'intro' || ph === 'countdown') {
        body = '<div class="mpst-intro"><div class="mpst-card card-in is-intro">' +
          SP.introHtml(lv === 8 ? L8 : L, st.seed, lv <= 6 ? SP.ctrlText(L) : 'Nur laufen – kein Springen. Ende nach ' + Math.round(st.secs / 60 * 10) / 10 + ' min.') +
          '</div><div class="mpst-ready"><div class="mps-t">Bereit</div><ul id="mpReady"></ul></div></div>';
      } else if (ph === 'running') {
        body = '<p class="mpst-lead">' + (L.lead || '') + '</p><div id="mpRun" class="mpst-run lv' + (lv >= 7 ? lv : 'x') + '"></div>';
      } else if (ph === 'ended') {
        body = lv <= 6 ? '<div class="mpst-end"><div class="mpst-mapw" id="mpMapW"></div><div class="mpst-top"><div class="mps-t">Top 5</div><ol id="mpTop" class="mprank big"></ol>' +
                         '<details class="mpall"><summary>Alle Ergebnisse</summary><ol id="mpAll" class="mprank"></ol></details></div></div>'
          : '<div class="mpst-end t"><div class="mpst-top"><div class="mps-t">Rangliste</div><ol id="mpTop" class="mprank big teams"></ol></div>' +
            '<div class="mpst-net" id="mpNet"></div></div>';
      }
      el.innerHTML = '<div class="mpst-in glass">' + head + body + '</div>';
      const btns = $('#mpStBtns');
      const add = (label, a, kind) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (kind || ''); b.textContent = label;
        b.addEventListener('click', () => (typeof a === 'function' ? a() : act(a))); btns.appendChild(b);
      };
      if (ph === 'intro') { add('Los! (3 · 2 · 1)', 'go', 'primary'); add('Abbrechen', 'stop'); }
      else if (ph === 'running') add('Runde beenden', 'stop', 'warnb');
      else if (ph === 'ended') { add('Nochmal (gleiche Welt)', 'start', 'primary'); add('Zur Lobby', 'lobby'); }
    }
    // laufend aktualisieren
    const done = inR.filter(p => p.f).length;
    if (ph === 'intro' || ph === 'countdown') {
      const r = inR.filter(p => p.r).length;
      $('#mpStN').textContent = r + ' von ' + inR.length + ' bereit';
      const ul = $('#mpReady');
      const li = p => '<li class="' + (p.r ? 'ok' : '') + (p.on ? '' : ' off') + '">' + R.pingu(p.c) + '<span>' + esc(p.n) + '</span>' +
        (lv === 8 ? '<small>' + (p.s || []).length + ((p.s || []).length === 1 ? ' Welt' : ' Welten') + '</small>' : '') + '<b>' + (p.r ? '✓' : '…') + '</b></li>';
      // Level 7/8: je Team ein Kasten in Teamfarbe statt „Team 1“ hinter jedem Namen
      const h = lv >= 7
        ? teamsOf(st).map(x => {
            const r = x.members.filter(p => p.r).length;
            return '<li class="mprt' + (r === x.members.length ? ' all' : '') + '" style="--tc:' + R.teamColor(x.i) + '"><div class="mprt-h"><b>' + R.teamName(x.i) + '</b>' +
              (lv === 8 ? slotBar(x.members, 8) : '') + '<small>' + r + '/' + x.members.length + ' bereit</small></div><ul>' + x.members.map(li).join('') + '</ul></li>';
          }).join('')
        : inR.map(li).join('');
      if (ul && ul.dataset.h !== h) { ul.innerHTML = h; ul.dataset.h = h; ul.classList.toggle('byteam', lv >= 7); }
    } else if (ph === 'running') {
      const nt = teamsOf(st).length;
      $('#mpStN').textContent = lv <= 6 ? done + ' von ' + inR.length + ' fertig' : nt + (nt === 1 ? ' Team' : ' Teams');
      runBoard(st, inR);
    } else if (ph === 'ended') {
      $('#mpStN').textContent = lv <= 6 ? done + ' von ' + inR.length + ' fertig' : '';
      endBoard(st, inR);
    }
  }

  function runBoard(st, inR) {
    const box = $('#mpRun'); if (!box) return;
    const lv = st.level, L = lvInfo(lv);
    let h = '';
    if (lv <= 6) {
      h = inR.map(p => {
        let s;
        if (p.f) s = '<b class="ok">✓ fertig</b>';
        else if (!p.on) s = '<b class="off">offline</b>';
        else if (L.mode === 'jump' && p.i && p.i.j != null) s = '<b>' + p.i.j + '</b> ' + (lv === 3 ? 'Sprünge' : 'Schritte') + ' übrig';
        else s = 'spielt …';
        return '<div class="mpp' + (p.f ? ' done' : '') + (p.on ? '' : ' off') + '"><i style="background:' + R.color(p.c) + '"></i><span>' + esc(p.n) + '</span><small>' + s + '</small></div>';
      }).join('');
      if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
      return;
    }
    const teams = lv === 7 ? teamRank7(st) : teamRank8(st);
    teams.sort((a, b) => a.t - b.t);
    const sig = teams.map(x => x.t + ':' + x.members.map(p => p.id + (p.on ? 1 : 0)).join()).join('|');
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = teams.map(x => '<div class="mptc" data-t="' + x.t + '" style="--tc:' + R.teamColor(x.i) + '"><div class="mptc-h">' + R.teamName(x.i) +
        (lv === 8 ? '<button class="btn sm" type="button" data-watch="' + x.t + '">Beobachten</button>' : '') + '</div>' +
        '<div class="mptc-m">' + x.members.map(p => '<span class="' + (p.on ? '' : 'off') + '">' + R.pingu(p.c) + esc(p.n) +
          '<small>' + (lv === 7 ? ((p.s || []).length === 2 ? 'A+B' : (p.s || [])[0] === 0 ? 'A' : 'B') : (p.s || []).length) + '</small></span>').join('') + '</div>' +
        (lv === 7 ? '<canvas class="nplot mptc-plot"></canvas>' : '<div class="mptc-hits"></div>') +
        '<div class="mptc-s"></div></div>').join('');
      for (const b of box.querySelectorAll('[data-watch]')) b.addEventListener('click', () => { location.href = 'labor.html?level=8&mp=1&team=' + b.dataset.watch; });
    }
    for (const x of teams) {
      const c = box.querySelector('.mptc[data-t="' + x.t + '"]'); if (!c) continue;
      if (lv === 7) {
        c.querySelector('.mptc-s').innerHTML = '<b>' + x.sc.right + ' von 4</b> Nestern · Fehler ' + fmt(x.sc.loss, 2);
        plot7(c.querySelector('.mptc-plot'), st.seed, x.sc.w);
      } else {
        c.querySelector('.mptc-s').innerHTML = '<b>' + (x.sc.n - x.sc.wrong) + ' von ' + x.sc.n + '</b> richtig · Fehler ' + fmt(x.sc.loss, 3);
        c.querySelector('.mptc-hits').innerHTML = hitsHtml(x.sc);
      }
    }
  }
  const SPK = ['adelie', 'chin', 'gentoo'], SPN = ['Adelie', 'Zügel', 'Esel'], SPC = ['#2f80ed', '#f27828', '#12a37a'];
  function hitsHtml(sc) {
    const tot = [151, 68, 123];
    return [0, 1, 2].map(k => '<span style="color:' + SPC[k] + '"><img src="img/frei/' + SPK[k] + '_1.webp" alt="">' + SPN[k] + ' <b>' + sc.hit[k] + '</b>/' + tot[k] + '</span>').join('');
  }
  const sg = z => 1 / (1 + Math.exp(-z));
  function plot7(cvs, seed, w) {
    if (!cvs || !window.NTNetz) return;
    const X = R.l7.X(seed);
    NTNetz.nestPlot(cvs, { cases: X.fwd(...w),
      out: (m, p) => sg(8 * sg(w[0] * m + w[1] * p - 3) + 8 * sg(w[2] * m + w[3] * p - 3) - 5),
      lines: [{ a: w[0], b: w[1], c: 3, col: '#ff9d4d', team: 'a', name: 'A', end: 1 },
              { a: w[2], b: w[3], c: 3, col: '#a98bff', team: 'b', name: 'B', end: 0 }] });
  }
  function net7(cvs, w) {
    NTNetz.draw(cvs, {
      nodes: [
        { id: 's1', kind: 'in', x: 0.04, y: 0.2, label: 'Mama' }, { id: 's2', kind: 'in', x: 0.04, y: 0.8, label: 'Papa' },
        { id: 'A', kind: 'n', x: 0.5, y: 0.2, label: 'A', group: 'a', bias: -3, labelPos: 'above' },
        { id: 'B', kind: 'n', x: 0.5, y: 0.8, label: 'B', group: 'b', bias: -3, labelPos: 'above' },
        { id: 'o', kind: 'n', x: 0.95, y: 0.5, bias: -5 }],
      edges: [
        { from: 's1', to: 'A', w: w[0], group: 'a', labelAt: 0.55 }, { from: 's2', to: 'A', w: w[1], group: 'a', labelAt: 0.26 },
        { from: 's1', to: 'B', w: w[2], group: 'b', labelAt: 0.26 }, { from: 's2', to: 'B', w: w[3], group: 'b', labelAt: 0.55 },
        { from: 'A', to: 'o', w: 8, group: 'fix', fixed: true, labelAt: 0.5 }, { from: 'B', to: 'o', w: 8, group: 'fix', fixed: true, labelAt: 0.5 }]
    });
  }

  function endBoard(st, inR) {
    const lv = st.level;
    if (lv <= 6) {
      const rank = inR.filter(p => p.res && isFinite(p.res.s)).sort((a, b) => a.res.s - b.res.s);
      const rest = inR.filter(p => !(p.res && isFinite(p.res.s)));
      const li = (p, j) => '<li data-id="' + esc(p.id) + '" class="' + (MAP.sel === p.id ? 'sel' : '') + '"><span class="n">' + (j + 1) + '</span><i style="background:' + R.color(p.c) + '"></i><b>' + esc(p.n) + '</b><small>' + esc(p.res.t) + '</small></li>';
      const top = rank.slice(0, 5).map(li).join('') || '<li class="empty">Noch keine Ergebnisse</li>';
      const all = rank.map(li).join('') + rest.map(p => '<li class="off"><span class="n">–</span><i style="background:' + R.color(p.c) + '"></i><b>' + esc(p.n) + '</b><small>kein Ergebnis</small></li>').join('');
      if ($('#mpTop').dataset.h !== top) { $('#mpTop').innerHTML = top; $('#mpTop').dataset.h = top; }
      if ($('#mpAll').dataset.h !== all) { $('#mpAll').innerHTML = all; $('#mpAll').dataset.h = all; }
      for (const li of document.querySelectorAll('#mpTop li[data-id], #mpAll li[data-id]')) {
        if (li.dataset.on) continue;
        li.dataset.on = '1';
        li.addEventListener('click', () => { MAP.sel = MAP.sel === li.dataset.id ? null : li.dataset.id; selMark(); });
      }
      const mk = st.run + '.' + rank.map(p => p.id + p.res.s).join();
      if (M.mapKey !== mk) { M.mapKey = mk; map3(st, rank); }
      return;
    }
    const rank = lv === 7 ? teamRank7(st) : teamRank8(st);
    if (M.sel7 === null || !rank.some(x => x.t === M.sel7)) M.sel7 = rank.length ? rank[0].t : null;
    const h = rank.map((x, j) => '<li data-t="' + x.t + '" class="' + (x.t === M.sel7 ? 'sel' : '') + '" style="--tc:' + R.teamColor(x.i) + '"><span class="n">' + (j + 1) + '</span><b class="tn">' + R.teamName(x.i) + '</b>' +
      '<em>' + x.members.map(p => R.pingu(p.c) + esc(p.n)).join(' ') + '</em><small>' +
      (lv === 7 ? x.sc.right + ' von 4 Nestern · Fehler ' + fmt(x.sc.loss, 2) : (x.sc.n - x.sc.wrong) + ' von ' + x.sc.n + ' richtig · Fehler ' + fmt(x.sc.loss, 3)) + '</small></li>').join('');
    const ol = $('#mpTop');
    if (ol.dataset.h !== h) {
      ol.innerHTML = h; ol.dataset.h = h;
      for (const li of ol.querySelectorAll('li[data-t]')) li.addEventListener('click', () => { M.sel7 = +li.dataset.t; M.stageKey = ''; stage(M.st); });
    }
    const x = rank.find(r => r.t === M.sel7), box = $('#mpNet');
    if (!x || !box) return;
    const nk = M.sel7 + ':' + JSON.stringify(x.sc.w || x.sc.W);
    if (box.dataset.k === nk) return;
    box.dataset.k = nk;
    if (lv === 7) {
      box.innerHTML = '<div class="mps-t">Team ' + (x.i + 1) + ' · das Netz</div><div class="mpst-netw"><canvas id="mpNetC"></canvas></div>' +
        '<div class="mps-t">Die vier Nester</div><canvas id="mpNetP" class="nplot"></canvas>';
      requestAnimationFrame(() => { net7($('#mpNetC'), x.sc.w); plot7($('#mpNetP'), st.seed, x.sc.w); });
    } else {
      box.innerHTML = '<div class="mps-t">Team ' + (x.i + 1) + '</div><div class="mptc-hits big">' + hitsHtml(x.sc) + '</div>' +
        '<p class="mps-hint">Das ganze Netz mit allen 8 Welten:</p><button class="btn primary" type="button" id="mpWatch">Netz von Team ' + (x.i + 1) + ' ansehen</button>';
      $('#mpWatch').addEventListener('click', () => { location.href = 'labor.html?level=8&mp=1&team=' + x.t; });
    }
  }

  /* 3D-Karte der Lehrkraft am Rundenende (Sönke 18.11.2026: „die Lehrkraft braucht auch 3D-Karten, die gedreht
     werden können, die Wege der User mit eindeutigem Endpunkt“): dieselbe Welt wie auf den Tablets, Nebel weg,
     jeder Weg in der Schalfarbe (res.p, spiel.js pathCode), am Ende der Pinguin mit Ring, Top 5 groß mit Platz.
     Ziehen = drehen, zwei Finger/Mausrad = zoomen (js/orbit.js), dreht sich langsam, bis jemand anfasst.
     Name in der Liste antippen = nur dieser Weg hell. Ohne zweites WebGL: die Karte von oben (drawMap). */
  const MAP = { cv: null, G: null, orb: null, lab: null, wkey: '', w: null, k: 1, list: [], sel: null, raf: 0, st: null, failed: false };
  function map3(st, rank) {
    const wrap = $('#mpMapW'); if (!wrap) return;
    if (!MAP.cv && !MAP.failed) {
      MAP.cv = document.createElement('canvas'); MAP.cv.id = 'mpMap3'; MAP.cv.className = 'mpmap3';
      MAP.G = window.NTOrbit ? NTGrafik.create(MAP.cv) : null;
      if (!MAP.G) { MAP.failed = true; MAP.cv = null; }
      else {
        MAP.orb = NTOrbit.create(MAP.cv); MAP.orb.on = true;
        MAP.lab = document.createElement('div'); MAP.lab.className = 'mpmaplab';
      }
    }
    if (MAP.failed) {
      if (!$('#mpMap')) wrap.innerHTML = '<canvas id="mpMap"></canvas>';
      drawMap($('#mpMap'), st, rank); return;
    }
    if (MAP.cv.parentNode !== wrap) {
      wrap.innerHTML = '';
      wrap.appendChild(MAP.cv); wrap.appendChild(MAP.lab);
      const h = document.createElement('div'); h.className = 'mpmaphint'; h.textContent = 'ziehen = drehen · zwei Finger / Mausrad = zoomen · Name antippen = nur dieser Weg';
      wrap.appendChild(h);
      MAP.lab.innerHTML = '';
    }
    const wkey = st.level + '.' + st.seed + '.' + st.run;
    if (MAP.wkey !== wkey) {
      MAP.wkey = wkey; MAP.sel = null;
      const w = MAP.w = SP.worldFor(LV(st.level), st.seed), k = MAP.k = w.W / 50;
      MAP.G.setPalette(SP.palette(st.level), 'dark');
      MAP.G.setWorld(w, SP.theme());
      const at = [0, (w.min.h + w.h(0, 0)) / 2, 4 * k];
      MAP.orb.set({ eye: [at[0], at[1] + 96 * k, at[2] - 92 * k], at });
      MAP.orb.limit = w.W; MAP.orb.minD = 8 * k; MAP.orb.maxD = 260 * k; MAP.orb.spin = 0.05;
      MAP.orb.floor = (x, z) => (Math.abs(x) < w.W && Math.abs(z) < w.W ? w.h(x, z) : -Infinity);
      MAP.lab.innerHTML = '';
    }
    const w = MAP.w, k = MAP.k, E = w.W - 0.5;
    MAP.st = st;
    MAP.list = rank.map((p, j) => {
      let pts = SP.pathDecode(p.res.p, w.W);
      if (!pts.length && isFinite(p.res.x)) pts = [[p.res.x, p.res.z]];
      pts = pts.map(q => [clamp(q[0], -E, E), clamp(q[1], -E, E)]);
      // lange Sprünge unterteilen, damit der Weg auf dem Boden liegt
      const fine = [];
      pts.forEach((q, i) => {
        if (i) {
          const o = pts[i - 1], d = Math.hypot(q[0] - o[0], q[1] - o[1]), n = Math.ceil(d / (0.9 * k));
          for (let m = 1; m < n; m++) fine.push([lerp(o[0], q[0], m / n), lerp(o[1], q[1], m / n)]);
        }
        fine.push(q);
      });
      const e = fine[fine.length - 1] || [0, 0], f = fine[Math.max(0, fine.length - 2)] || e;
      return { id: String(p.id), n: p.n, j, col: R.rgb(p.c), css: R.color(p.c), pts: fine, end: e,
               yaw: Math.hypot(e[0] - f[0], e[1] - f[1]) > 1e-3 ? Math.atan2(e[0] - f[0], e[1] - f[1]) : Math.PI };
    });
    MAP.lab.innerHTML = '';
    selMark();
    if (!MAP.raf) MAP.raf = requestAnimationFrame(map3Frame);
  }
  function selMark() {
    for (const li of document.querySelectorAll('#mpTop li[data-id], #mpAll li[data-id]')) li.classList.toggle('sel', li.dataset.id === MAP.sel);
  }
  function map3Frame() {
    MAP.raf = 0;
    if (!MAP.cv || !MAP.cv.isConnected || !M.on || !MAP.w) { MAP.lab && (MAP.lab.innerHTML = ''); return; }
    MAP.raf = requestAnimationFrame(map3Frame);
    const w = MAP.w, k = MAP.k, objs = [], others = [];
    const grey = [0.55, 0.6, 0.7], many = MAP.list.length > 14;
    // erst die anderen, dann Top 5, dann der gewählte – oben liegt, was zählt
    const order = [...MAP.list].sort((a, b) => (a.id === MAP.sel) - (b.id === MAP.sel) || b.j - a.j);
    for (const p of order) {
      const sel = MAP.sel === p.id, dim = MAP.sel && !sel;
      const col = dim ? p.col.map((v, i) => v * 0.35 + grey[i] * 0.25) : p.col;
      const wd = (sel ? 0.42 : p.j < 5 ? 0.28 : 0.18) * k;
      if (p.pts.length > 1) {
        for (let i = 0; i < p.pts.length - 1; i += 240) {   // Uint16-Index: in Stücken zeichnen
          objs.push({ type: 'strip', pts: p.pts.slice(i, i + 241).map(q => [q[0], q[1], wd]), color: col, glow: dim ? 0.1 : 0.45, lift: 0.14 + (sel ? 0.05 : 0) });
        }
      }
      const ring = [], rr = (p.j < 5 || sel ? 1.5 : 1.1) * k;
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; ring.push([p.end[0] + Math.cos(a) * rr, p.end[1] + Math.sin(a) * rr, 0.16 * k]); }
      objs.push({ type: 'strip', pts: ring, closed: true, color: col, glow: dim ? 0.15 : 0.8, lift: 0.2 });
      const g = w.h(p.end[0], p.end[1]);
      others.push({ x: p.end[0], y: g, z: p.end[1], ground: g, yaw: p.yaw, tilt: 0, squash: 1, phase: 0, walk: 0,
                    scale: (p.j < 5 || sel ? 1.25 : 0.9) * k, color: col, seed: p.j * 1.7, hidden: false });
    }
    const s0 = w.start;
    objs.push({ type: 'dot', x: s0.x, y: w.h(s0.x, s0.z) + 0.1, z: s0.z, r: 1.1 * k, flat: 0.25, color: [0.85, 0.9, 1], glow: 0.6 });
    objs.push({ type: 'flag', x: w.min.x, z: w.min.z, color: [1, 0.78, 0.15], yaw: -Math.PI / 2, s: Math.max(1, k * 0.9) });
    const low = SP.low();
    const sc = { cam: MAP.orb.cam(), fogR: w.W * 9, fogAt: [0, 0], dpr: low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
                 objects: objs, plain: 0, player: { hidden: true, x: 0, z: 0 }, others };
    MAP.G.frame(sc);
    // Beschriftungen: Start, tiefster Punkt, Namen (Top 5 mit Platz; alle, wenn es nicht zu viele sind)
    const items = [{ key: 'min', p: [w.min.x, w.min.h + 6 * Math.max(1, k * 0.9), w.min.z], h: 'tiefster Punkt', c: 'gold' },
                   { key: 'start', p: [s0.x, w.h(s0.x, s0.z) + 1.6 * k, s0.z], h: 'Start', c: 'start' }];
    for (const p of MAP.list) {
      if (!(p.j < 5 || !many || MAP.sel === p.id)) continue;
      items.push({ key: 'p' + p.id, p: [p.end[0], w.h(p.end[0], p.end[1]) + 2.6 * k, p.end[1]],
                   h: (p.j < 5 ? '<span class="n">' + (p.j + 1) + '</span>' : '') + esc(p.n), c: 'pl' + (p.j < 5 ? ' top' : '') + (MAP.sel === p.id ? ' sel' : '') + (MAP.sel && MAP.sel !== p.id ? ' dim' : ''), css: p.css });
    }
    const seen = new Set();
    for (const it of items) {
      seen.add(it.key);
      let el = MAP.lab.querySelector('[data-k="' + it.key + '"]');
      if (!el) { el = document.createElement('span'); el.dataset.k = it.key; MAP.lab.appendChild(el); }
      const cls = 'mml ' + it.c;
      if (el.className !== cls) el.className = cls;
      if (el.dataset.h !== it.h) { el.innerHTML = it.h; el.dataset.h = it.h; if (it.css) el.style.setProperty('--pc', it.css); }
      const q = MAP.G.project(sc, it.p);
      if (!q) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = 'translate(' + q.x.toFixed(1) + 'px,' + q.y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
    for (const el of [...MAP.lab.children]) if (!seen.has(el.dataset.k)) el.remove();
  }

  // Karte von oben: wer steht wo (Level 1–6)
  const PAL = ['#0b6e6a', '#2b78b0', '#6d5fd0', '#c9b6f2'].map(s => { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; });
  function mapImage(st) {
    const key = st.level + '.' + st.seed;
    if (M.mapImg && M.mapImg.key === key) return M.mapImg;
    const w = SP.worldFor(LV(st.level), st.seed), N = 150, E = w.W;
    const hs = new Float32Array(N * N);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -E + 2 * E * (i + 0.5) / N, z = E - 2 * E * (j + 0.5) / N, v = w.h(x, z);
      hs[j * N + i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    hi = Math.min(hi, lo + 26);
    const off = document.createElement('canvas'); off.width = N; off.height = N;
    const ctx = off.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
    const v = new Float32Array(N * N);
    for (let q = 0; q < N * N; q++) {
      const t = clamp((hs[q] - lo) / (hi - lo), 0, 1), f = t * 3, k = Math.min(2, Math.floor(f)), u = f - k;
      const c = [0, 1, 2].map(m => PAL[k][m] + (PAL[k + 1][m] - PAL[k][m]) * u);
      d[q * 4] = c[0]; d[q * 4 + 1] = c[1]; d[q * 4 + 2] = c[2]; d[q * 4 + 3] = 255;
      v[q] = t * 14;
    }
    ctx.putImageData(img, 0, 0);
    // Höhenlinien als Strecken (Marching Squares wie labor.js), in jeder Größe scharf
    const segs = [], P = (x, y) => [(x + 0.5) / N, (y + 0.5) / N];
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
      const a = v[y * N + x], b = v[y * N + x + 1], c2 = v[(y + 1) * N + x + 1], d2 = v[(y + 1) * N + x];
      const mn = Math.min(a, b, c2, d2), mx = Math.max(a, b, c2, d2);
      for (let k = Math.max(1, Math.ceil(mn)); k <= Math.min(13, mx); k++) {
        if (k === mn) continue;
        const pts = [];
        const cut = (v0, v1, x0, y0, x1, y1) => { if ((v0 < k) === (v1 < k)) return; const t = (k - v0) / (v1 - v0); pts.push(P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)); };
        cut(a, b, x, y, x + 1, y); cut(b, c2, x + 1, y, x + 1, y + 1); cut(c2, d2, x + 1, y + 1, x, y + 1); cut(d2, a, x, y + 1, x, y);
        if (pts.length >= 2) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        if (pts.length === 4) segs.push(pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      }
    }
    M.mapImg = { key, off, w, E, segs };
    return M.mapImg;
  }
  function drawMap(cvs, st, rank) {
    if (!cvs) return;
    const mi = mapImage(st), w = mi.w, E = mi.E;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cvs.clientWidth, H = cvs.clientHeight;
    if (!W || !H) { requestAnimationFrame(() => { M.mapKey = ''; }); return; }
    cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
    const x = cvs.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const S = Math.min(W, H), ox = (W - S) / 2, oy = (H - S) / 2;
    x.imageSmoothingEnabled = true;
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(ox, oy, S, S, 14) : x.rect(ox, oy, S, S); x.clip();
    x.drawImage(mi.off, ox, oy, S, S);
    x.strokeStyle = 'rgba(235,245,255,.3)'; x.lineWidth = 1; x.beginPath();
    for (let i = 0; i < mi.segs.length; i += 4) { x.moveTo(ox + mi.segs[i] * S, oy + mi.segs[i + 1] * S); x.lineTo(ox + mi.segs[i + 2] * S, oy + mi.segs[i + 3] * S); }
    x.stroke(); x.restore();
    const P = (wx, wz) => [ox + (wx + E) / (2 * E) * S, oy + (E - wz) / (2 * E) * S];
    // Start und tiefster Punkt
    const s = P(w.start.x, w.start.z);
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2; x.setLineDash([3, 3]);
    x.beginPath(); x.arc(s[0], s[1], 9, 0, 7); x.stroke(); x.setLineDash([]);
    x.font = '700 11px Space Grotesk, sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)'; x.textAlign = 'center';
    x.fillText('Start', s[0], s[1] - 13);
    const m = P(w.min.x, w.min.z);
    x.fillStyle = '#ffd166'; x.strokeStyle = '#2a1e00'; x.lineWidth = 1.5;
    star(x, m[0], m[1], 12, 5.5); x.fill(); x.stroke();
    x.font = '800 12px Space Grotesk, sans-serif'; x.fillStyle = '#ffd166';
    x.fillText('tiefster Punkt', m[0], m[1] + 26);
    // alle Pinguine, die Top 5 groß mit Platz
    const many = rank.length > 14;
    [...rank].reverse().forEach(p => {
      const j = rank.indexOf(p);
      if (!isFinite(p.res.x) || !isFinite(p.res.z)) return;
      const q = P(clamp(p.res.x, -E, E), clamp(p.res.z, -E, E)), big = j < 5, r = big ? 11 : 6;
      x.fillStyle = R.color(p.c); x.strokeStyle = '#fff'; x.lineWidth = big ? 2.5 : 1.6;
      x.beginPath(); x.arc(q[0], q[1], r, 0, 7); x.fill(); x.stroke();
      if (big) { x.fillStyle = '#04121f'; x.font = '800 12px Space Grotesk, sans-serif'; x.textAlign = 'center'; x.fillText(String(j + 1), q[0], q[1] + 4); }
      if (big || !many) {
        x.font = (big ? '800 13px' : '600 11px') + ' Space Grotesk, sans-serif'; x.textAlign = 'left';
        const t = p.n, tw = x.measureText(t).width;
        x.fillStyle = 'rgba(7,13,26,.72)'; x.fillRect(q[0] + r + 3, q[1] - 9, tw + 8, 17);
        x.fillStyle = '#fff'; x.fillText(t, q[0] + r + 7, q[1] + 4);
      }
    });
  }
  function star(x, cx, cy, R1, R2) {
    x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R2 : R1; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    x.closePath();
  }
  window.addEventListener('resize', () => { M.mapKey = ''; M.sideKey = ''; });

  /* ══ Start ═════════════════════════════════════════════════ */
  // Knopf in der Übersicht (nur Lehrkraft)
  const bar = $('#mpBar');
  if (bar && T) {
    bar.hidden = false;
    $('#mpGo').addEventListener('click', async () => {
      $('#mpGo').disabled = true;
      M.flagOff = false;
      const r = await act('on');
      $('#mpGo').disabled = false;
      if (r && r.ok) enter();
    });
  }
  function sync() {
    if (R.mp && !M.on && !M.flagOff) { enter(); poll(); }
    else if (!R.mp && M.on) leave();
    if (!R.mp) M.flagOff = false;
  }
  R.on(sync);
  R.ready(3000).then(sync);

  return { get on() { return M.on; } };
})();
