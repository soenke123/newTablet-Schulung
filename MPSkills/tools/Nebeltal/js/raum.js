/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/raum.js   ·   Austausch mit dem MPSkills-Raum
   ══════════════════════════════════════════════════════════════
   Läuft auf index.html, labor.html und erarbeitung.html. Die Seiten
   stecken im Raum in einem <iframe> (tools/Nebeltal/tool.js), der
   Rahmen spricht mit dem Server. Hier nur die Brücke:

     hinein   { type: 'nt:cmd', levels: [1, 2, 'erarb', …], mp: 0|1 }
     heraus   { type: 'nt:ready' }                 Seite steht
              { type: 'nt:levels', levels: […] }   Lehrkraft teilt/entzieht
              { type: 'nt:rpc', id, fn, args }     fn: play (Tablet) · get/act (Lehrkraft)
     zurück   { type: 'nt:res', id, res }

   Rolle: ?raum=lehrer|schueler (tool.js hängt es an). Beim Wechsel
   zwischen den Seiten (labor.html → index.html) fehlt der Parameter –
   darum merkt sich der Tab die Rolle in sessionStorage. Gilt nur im
   iframe: allein geöffnet ist man nie in einem Raum.

   Dazu die Rechnungen, die Lehrkraft und Tablets für die Wertung von
   Level 7/8 brauchen (NTRaum.l7 / NTRaum.l8), und die Schalfarben.
   ══════════════════════════════════════════════════════════════ */

window.NTRaum = (function () {
  'use strict';

  const framed = window.parent !== window;
  const qs = new URLSearchParams(location.search);
  let role = null;
  try {
    const q = qs.get('raum');
    if (framed && !qs.get('demo') && (q === 'lehrer' || q === 'schueler')) { role = q; sessionStorage.setItem('nt.raum', q); }
    else if (framed && !qs.get('demo')) {
      const s = sessionStorage.getItem('nt.raum');
      if (s === 'lehrer' || s === 'schueler') role = s;
    }
  } catch (e) { /* ohne sessionStorage: nur mit Parameter */ }
  if (!role && framed && (qs.get('raum') === 'lehrer' || qs.get('raum') === 'schueler')) role = qs.get('raum');

  const S = { levels: null, mp: 0, got: false };
  const subs = [];
  const pend = new Map();
  let seq = 0;

  function post(msg) {
    if (!framed) return;
    try { window.parent.postMessage(msg, location.origin); } catch (e) { /* zu */ }
  }

  window.addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const m = e.data || {};
    if (m.type === 'nt:cmd') {
      const lv = Array.isArray(m.levels) ? m.levels.map(x => (x === 'erarb' ? x : +x)).filter(x => x === 'erarb' || (x >= 1 && x <= 8)) : [];
      const changed = !S.got || JSON.stringify(lv) !== JSON.stringify(S.levels) || (m.mp ? 1 : 0) !== S.mp;
      S.levels = lv; S.mp = m.mp ? 1 : 0; S.got = true;
      if (changed) for (const f of subs.slice()) { try { f(); } catch (err) { console.error(err); } }
    } else if (m.type === 'nt:res' && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      clearTimeout(p.t); p.res(m.res || { ok: false, error: 'bad_response' });
    }
  });

  function rpc(fn, args) {
    if (!role) return Promise.resolve({ ok: false, error: 'no_room' });
    return new Promise(res => {
      const id = ++seq;
      const t = setTimeout(() => { pend.delete(id); res({ ok: false, error: 'network' }); }, 9000);
      pend.set(id, { res, t });
      post({ type: 'nt:rpc', id, fn, args: args || {} });
    });
  }

  // Wartet höchstens ms auf den ersten Stand vom Rahmen
  function ready(ms) {
    if (!role || S.got) return Promise.resolve();
    return new Promise(res => {
      const t = setTimeout(res, ms || 2500);
      subs.push(function once() { clearTimeout(t); subs.splice(subs.indexOf(once), 1); res(); });
    });
  }

  /* ── Schalfarben (16, gut unterscheidbar, auf Nacht und Schnee) ── */
  const COLORS = ['#ff8a3d', '#a98bff', '#3ddc97', '#ff5c8a', '#4cc3ff', '#ffd23f', '#e4572e', '#9ae66e',
                  '#c86bfa', '#2ec4b6', '#ff9ff3', '#5b8cff', '#f4a261', '#7bdff2', '#d00000', '#b5e48c'];
  const hexRgb = s => { const n = parseInt(s.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const color = i => COLORS[((i | 0) % 16 + 16) % 16];
  const rgb = i => hexRgb(color(i));

  /* ── Teams sichtbar machen (Sönke 18.11.2026: Teams „besser und visueller“) ──
     Jedes Team (nach Reihenfolge 0, 1, …) hat eine eigene Farbe für Rahmen/Kopf;
     Personen erscheinen als kleiner Pinguin mit ihrer Schalfarbe statt als Punkt. */
  const TEAMC = ['#4cc3ff', '#ffb347', '#3ddc97', '#c86bfa', '#ff5c8a', '#ffe066', '#9ae66e', '#7bdff2'];
  const teamColor = i => TEAMC[((i | 0) % TEAMC.length + TEAMC.length) % TEAMC.length];
  const teamName = i => 'Team ' + ((i | 0) + 1);
  // kleiner Pinguin als SVG (Schal in Farbe c = Index der Schalfarbe oder '#rrggbb')
  function pingu(c, cls) {
    const col = typeof c === 'string' ? c : color(c);
    return '<svg class="pgi' + (cls ? ' ' + cls : '') + '" viewBox="0 0 40 48" aria-hidden="true">' +
      '<ellipse cx="13" cy="45.5" rx="6" ry="2.6" fill="#ff9a2e"/><ellipse cx="27" cy="45.5" rx="6" ry="2.6" fill="#ff9a2e"/>' +
      '<path d="M20 3c9 0 14 8 14 17 0 4 3 9 3 14 0 8-7 12-17 12S3 42 3 34c0-5 3-10 3-14C6 11 11 3 20 3z" fill="#26324f"/>' +
      '<path d="M20 22c7 0 11 5 11 12 0 6-5 9-11 9s-11-3-11-9c0-7 4-12 11-12z" fill="#f4f1ea"/>' +
      '<path d="M11 15c0-4 4-6 9-6s9 2 9 6c0 4-4 7-9 7s-9-3-9-7z" fill="#f4f1ea"/>' +
      '<circle cx="15.5" cy="14" r="2.3" fill="#0b0d14"/><circle cx="24.5" cy="14" r="2.3" fill="#0b0d14"/>' +
      '<circle cx="16.2" cy="13.2" r=".8" fill="#fff"/><circle cx="25.2" cy="13.2" r=".8" fill="#fff"/>' +
      '<path d="M17.5 17.5h5l-2.5 3.2z" fill="#ffc23d"/>' +
      '<path d="M7 23.5c4 2.2 22 2.2 26 0l.6 4c-5 2.6-22 2.6-27.2 0z" fill="' + col + '"/>' +
      '<path d="M26 26l3.5 9-4 .6-1.6-9z" fill="' + col + '"/></svg>';
  }

  /* ── Level 7: Paar-Wertung aus den Werten des Teams ──
     slot 0 = Welt A (a₁, a₂), slot 1 = Welt B (b₁, b₂); fehlt ein Wert, steht die Figur noch am Start.
     Gewichte wie js/zwei.js: wOf(p) = [toW(x), toW(−z)]. */
  const l7cache = {};
  function l7X(seed) {
    if (!l7cache[seed]) l7cache[seed] = NTWelt.xor(seed).two();
    return l7cache[seed];
  }
  function l7start(seed) {
    const X = l7X(seed);
    return X.start.map(p => [X.toW(p.x), X.toW(-p.z)]);
  }
  function l7W(seed, vals) {
    const s0 = l7start(seed);
    return [0, 1].map(k => (vals && Array.isArray(vals[k]) ? vals[k] : s0[k]));
  }
  function l7score(seed, vals) {
    const X = l7X(seed), w = l7W(seed, vals), a = [w[0][0], w[0][1], w[1][0], w[1][1]];
    const loss = X.loss(...a), right = X.right(X.fwd(...a));
    return { loss, right, w: a };
  }

  /* ── Level 8: 4 Neuronen (A, B, C + Zahl-Neuron), 16 Werte = 8 Welten ──
     Welt s gehört zu Neuron floor(s/2): s gerade = Werte 0/1, ungerade = Werte 2/3 (wie labor.js).
     Start für alle Teams gleich (aus der Welt-Nummer der Runde). */
  let P3 = null;
  const P = () => (P3 || (P3 = NTWelt.penguins3()));
  const sig = z => 1 / (1 + Math.exp(-z));
  const zz = (w, x) => w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + w[3];
  function l8init(seed) {
    const r = NTWelt.rng(seed * 811 + 8);
    return Array.from({ length: 4 }, () => [0, 1, 2, 3].map(() => (r() * 2 - 1) * 2));
  }
  const l8idx = s => ({ k: s >> 1, i: (s & 1) ? [2, 3] : [0, 1] });
  function l8W(seed, vals) {
    const W = l8init(seed);
    if (vals) for (let s = 0; s < 8; s++) {
      const v = vals[s];
      if (Array.isArray(v)) { const q = l8idx(s); W[q.k][q.i[0]] = v[0]; W[q.k][q.i[1]] = v[1]; }
    }
    return W;
  }
  function l8score(seed, vals, W0) {             // W0: fertige Werte (labor.js „Weiter trainieren“ nach der Runde)
    const W = W0 || l8W(seed, vals), p = P();
    let s = 0, wrong = 0;
    const hit = [0, 0, 0];
    for (const q of p.pts) {
      const h = [0, 1, 2].map(k => sig(zz(W[k], q.x)));
      const z = zz(W[3], h), e = z - q.y;
      s += e * e;
      if (Math.max(0, Math.min(2, Math.round(z))) === q.y) hit[q.y]++; else wrong++;
    }
    return { loss: s / (2 * p.n), wrong, hit, n: p.n, W };
  }
  // alle Werte eines Teams zusammenlegen (people = Mitglieder mit v = {slot: [a, b]})
  function teamVals(people) {
    const out = {};
    for (const p of people) if (p.v) for (const k of Object.keys(p.v)) out[k] = p.v[k];
    return out;
  }

  /* ── Uhr des Servers (für Countdown und Restzeit) ── */
  let off = 0;
  function clock(state) {
    if (state && state.server_now) {
      const s = Date.parse(state.server_now);
      if (isFinite(s)) off = s - Date.now();
    }
  }
  const now = () => Date.now() + off;
  const left = iso => iso ? Math.max(0, (Date.parse(iso) - now()) / 1000) : null;

  /* Gemeinsam spielen läuft auf index.html (Lobby, Level 1–7) bzw. labor.html?level=8&mp=1.
     Wer gerade woanders ist (Labor allein, Erarbeitung), kommt in die Lobby. */
  const page = /labor\.html$/.test(location.pathname) ? 'labor' : /erarbeitung\.html$/.test(location.pathname) ? 'erarb' : 'index';
  subs.push(() => {
    if (S.mp && page !== 'index' && !(page === 'labor' && qs.get('mp') === '1')) location.href = 'index.html';
  });

  if (role) post({ type: 'nt:ready' });

  return {
    role, inRoom: !!role, isTeacher: role === 'lehrer', isStudent: role === 'schueler',
    get levels() { return S.levels; }, get mp() { return S.mp; }, get got() { return S.got; },
    on(f) { subs.push(f); },
    rpc, ready, post,
    setLevels(list) { S.levels = list.slice(); post({ type: 'nt:levels', levels: list }); for (const f of subs.slice()) f(); },
    shared: key => !role || role === 'lehrer' || !!(S.levels && S.levels.includes(key)),
    COLORS, color, rgb, teamColor, teamName, pingu,
    l7: { X: l7X, start: l7start, W: l7W, score: l7score },
    l8: { init: l8init, idx: l8idx, W: l8W, score: l8score },
    teamVals, clock, now, left
  };
})();
