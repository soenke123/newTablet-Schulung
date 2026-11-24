/* ══════════════════════════════════════════════════════════════
   NeuroLab · revier.js — „Das Revier der Wildkatzen“ (Kachel v-revier)
   ══════════════════════════════════════════════════════════════
   Bereich 2 „Vom Neuron zum Netz“ (21.11.2026; 3. Fassung 22.11.2026 nach
   Sönkes Rückmeldung). Försterin Jana hat im Tal Wildtierkameras aufgestellt.
   Gesucht ist das Revier. Grundsatz: NICHT ziehen und probieren, sondern
   rechnen und sehen, was wo zusammenhängt.

   Dieselben Bausteine UND dieselbe Bedienung wie „Wie arbeitet ein Neuron?“
   (js/neuron.js): Neuron links (makeNeuron, w₁ w₂ b mit + / − und Regler am
   Zahlenfeld – kein eigenes Eingabefeld), darunter die Rechnung, Karte rechts;
   Gelb = hier feuert das Neuron, goldenes Dreieck = Katze gesehen, Kreis =
   keine Katze, oranges Fadenkreuz = Eingabe des Neurons.

     1 Die erste Grenze  (id fluss; Name verrät den Fluss nicht, Sönke 24.11.2026) weit verteilte
                        Kameras, im Süden kein Revier. P und Q auf der Karte ziehen, die Gleichung
                        x₂ = m·x₁ + n steht daneben (ohne Erklärung zu m und n). Umstellen → w₁, w₂, b
                        im Neuron DIREKT eintippen (makeNeuron direct: kein Regler, Brüche wie 3/4).
                        Vorzeichen per Regel: w₂ > 0 → feuert oberhalb. „Prüfen“: Gerade erscheint nur,
                        wenn alle Kameras stimmen. „Hilfe“ = Beispiel, Gleichungen untereinander.
     2 Ein Jahr später  „Wie weit reicht das Revier nach Norden?“ – mehr Kameras; Straße und Stadt
                        werden NICHT genannt (erst beim Aufdecken). Drei Perzeptrons, w₁ w₂ b direkt
                        im Netz eintragen, prüfen. Der Ausgang ist FEST (outFix: alle v = 1,
                        b = 0,5 − n), nur ansehen. Alles richtig → Karte deckt sich auf.
     3 Das Netz fragen  Dieselben Kameras, dasselbe Netz – jetzt Orte OHNE Kamera
                        (karte.js PLANS): Baugebiet, Halle am Stadtrand, Radweg mit
                        zwei Wegen (km im Revier), Grillplatz am Fluss. Das Netz
                        rechnet vor, am Ende „Karte aufdecken – hatte das Netz
                        recht?“ (am Fluss meist nicht). Overfitting gibt es hier
                        nicht mehr, es kommt unter „Lernen“ → Wildkatzen.
   Keine UND/XOR-Begriffe hier (die stehen bei „Netze trainieren“).
   Stand je Gerät: localStorage nl.revier (Schaufenster: nur Arbeitsspeicher).
   Karte und Daten: js/karte.js (NLKarte).
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const K = window.NLKarte;
  const Q = new URLSearchParams(location.search);
  const DEMO = Q.has('demo');
  const STUDENT = Q.get('raum') === 'schueler';
  const COLS = ['#2f80ed', '#e5484d', '#8e44ad', '#0f9d58', '#e67e22', '#00838f'];
  const MAX_HID = 6;
  const VERSION = 7;                                 // 6: weniger Kameras, Schritt 3 „Das Netz fragen“; 7: Fluss stärker gebogen, Kameras (1|3), (11|3) (24.11.2026)
  /* Hilfe-Beispiel: Gerade durch (2|6) und (6|2) */
  const EX = { P: [2, 6], Q: [6, 2], w: [1, 1], b: -8 };
  const DEF_PQ = [[[1, 3], [11, 8]], [[1, 2], [3, 8]], [[6, 10], [12, 4]], [[0, 5], [12, 5]], [[4, 0], [4, 10]], [[0, 0], [12, 10]]];
  /* Schritt 1 heißt nicht „Der Fluss“ – was die Grenze ist, zeigt erst das Aufdecken (Sönke 24.11.2026) */
  const STEPS = [
    { id: 'fluss', kurz: 'Die erste Grenze', title: 'Die erste Grenze' },
    { id: 'stadt', kurz: 'Ein Jahr später', title: 'Ein Jahr später: Wie weit reicht das Revier nach Norden?' },
    { id: 'jahr', kurz: 'Das Netz fragen', title: 'Wo keine Kamera hängt: Das Netz fragen' },
  ];

  /* ── Speicher ── */
  const mem = {};
  const store = {
    get(k) { if (DEMO) return mem[k] ?? null; try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { if (DEMO) { mem[k] = v; return; } try { localStorage.setItem(k, v); } catch (e) { /* egal */ } },
  };
  const fresh = () => ({
    v: VERSION,
    step: 'fluss',
    s2: { P: [2, 2], Q: [10, 6], w: [0, 0, 0], done: false },
    s3: { hid: [], out: { v: [], b: 0 }, done: false, seen: false },
    revealed: false, covered: false,
    s4: { asked: {}, route: null, sel: 'bau', shown: false },
  });
  let S = fresh();
  try { const x = JSON.parse(store.get('nl.revier') || 'null'); if (x && x.v === VERSION) S = Object.assign(fresh(), x); } catch (e) { /* egal */ }
  const save = () => store.set('nl.revier', JSON.stringify(S));

  /* ── Hilfen ── */
  const h = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const num = v => { let r = Math.round(v * 100) / 100; if (Object.is(r, -0)) r = 0; return String(r).replace('.', ',').replace('-', '−'); };
  function parseNum(s) {
    s = String(s ?? '').trim().replace(/[−–]/g, '-').replace(/\s/g, '').replace(',', '.');
    if (!s) return null;
    const fr = s.match(/^([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)$/);
    if (fr) { const d = parseFloat(fr[2]); return d ? parseFloat(fr[1]) / d : null; }
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : null;
  }
  const zOf = (n, p) => n.w[0] * p[0] + n.w[1] * p[1] + n.b;
  const fire = z => z > 1e-9 ? 1 : 0;
  const neuronOf = a => ({ w: [a[0], a[1]], b: a[2] });
  const pt = p => p ? `(${num(p[0])} | ${num(p[1])})` : '';
  const xs = (k, sub) => `<span class="xs"><i class="m">${k}</i><sub>${sub}</sub></span>`;
  const css = n => (window.NLTheme && NLTheme.var(n)) || '#888';
  const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  /* Auf welcher Seite seiner Geraden feuert ein Neuron? (w₂ > 0 → oberhalb, denn nach Norden wächst z) */
  const sideOf = n => n.w[1] > 0 ? 'oberhalb' : n.w[1] < 0 ? 'unterhalb' : n.w[0] > 0 ? 'rechts (östlich)' : 'links (westlich)';

  /* Funktionsgleichung durch P und Q: x₂ = m·x₁ + n (als Bruch, wenn es keine glatte Zahl ist) */
  function frac(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1; n /= g; d /= g;
    return d === 1 ? { t: num(n), v: n, exact: true } : { t: `${num(n)}/${d}`, v: n / d, exact: false };
  }
  function eqOf(P, Q) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1];
    if (dx === 0) return { vertical: true, main: `${xs('x', 1)} = ${P[0]}`, sub: 'Senkrecht: <span class="m">1·x₁ + 0·x₂ − ' + P[0] + ' = 0</span>' };
    const m = frac(dy, dx), n = frac(P[1] * dx - dy * P[0], dx);
    const mTxt = m.v === 0 ? '' : `${m.t === '1' ? '' : m.t === '−1' ? '−' : m.t + ' · '}${xs('x', 1)}`;
    const nTxt = n.v === 0 ? '' : (mTxt ? ` ${n.v < 0 ? '−' : '+'} ${frac(Math.abs(P[1] * dx - dy * P[0]), Math.abs(dx)).t}` : n.t);
    /* keine Erklärung zu m und n darunter (Sönke 24.11.2026) */
    return { vertical: false, m, n, main: `${xs('x', 2)} = ${mTxt}${nTxt}` || `${xs('x', 2)} = 0`, sub: '' };
  }
  const eqBox = (P, Q) => { const e = eqOf(P, Q); return `<span class="rv-eq-l">Gleichung der Geraden</span><b class="rv-eq-m m">${e.main}</b>${e.sub ? `<span class="rv-eq-s">${e.sub}</span>` : ''}`; };

  /* Liegen die Kameras auf zwei Seiten der Bleistiftlinie durch P und Q? (Anzahl Fehler bei der besseren Seite) */
  function penErrors(P, Q, cams) {
    const side = p => (Q[0] - P[0]) * (p[1] - P[1]) - (Q[1] - P[1]) * (p[0] - P[0]);
    let a = 0, b = 0;
    cams.forEach(c => { const s = side(c.p) > 0 ? 1 : 0; if (s === c.soll) a++; else b++; });
    return Math.min(a, b);
  }

  /* Das Modell für makeNeuron (js/neuron.js): Zahlen wie in Teil 1 mit + / − und Regler, Lage der Kamera als Eingänge */
  const model = (a, x) => ({
    x: (x || [5, 5]).slice(), w: a ? [a[0], a[1]] : [0, 0], b: a ? a[2] : 0, type: 'perceptron', frac: true,
    lim: { x1: [0, 12, 1, 1], x2: [0, 10, 1, 1], w: [-4, 4, 0.5, 0.05], b: [-30, 30, 1, 0.25] },
    caps: ['km nach Osten', 'km nach Norden'], ocap: 'Revier?', yes: 'Revier', no: 'kein Revier',
  });
  const NL = () => window.NLNeuron;
  const legend = who => `<p class="nw-legend rv-legend"><span><i class="lg-tri"></i>Katze gesehen</span><span><i class="lg-dot"></i>keine Katze</span><span class="rv-lg-gold"><i class="lg-gold"></i><em>hier feuert ${who}</em></span><span><i class="lg-ring"></i>liegt falsch</span></p>`;

  /* Zahlenfeld wie im Neuron (Zahl antippen = direkt eintippen, + / − daneben), für den Ausgang mit n Eingängen */
  function miniVal(get, set, cls, o = {}) {
    const step = o.step || 1, lo = o.min ?? -99, hi = o.max ?? 99;
    const el = h(`<span class="nw-val ${cls}"${o.k ? ` data-v="${o.k}"` : ''}><button type="button" class="nw-num"></button><span class="nw-pms"><button type="button" class="nw-pm" data-d="1" aria-label="größer">+</button><button type="button" class="nw-pm" data-d="-1" aria-label="kleiner">−</button></span></span>`);
    let btn = el.querySelector('.nw-num'), typed = null;      // eingetippter Bruch bleibt stehen, solange der Wert gleich ist
    const paint = () => { const v = get(); btn.textContent = typed && Math.abs(typed.v - v) < 1e-12 ? typed.s : num(v); };
    const put = (v, txt) => { v = Math.max(lo, Math.min(hi, v)); typed = txt && /\//.test(txt) ? { s: txt.replace(/-/g, '−').replace(/\./g, ','), v } : null; set(v); paint(); };
    el.querySelectorAll('.nw-pm').forEach(b => {
      let t1 = 0, t2 = 0;
      const bump = () => put(get() + (+b.dataset.d) * step), stop = () => { clearTimeout(t1); clearInterval(t2); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); bump(); t1 = setTimeout(() => { t2 = setInterval(bump, 110); }, 420); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
    });
    btn.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'rv-mini-in'; inp.autocomplete = 'off'; inp.value = btn.textContent; inp.title = 'Zahl oder Bruch, z. B. 3/4';
      btn.replaceWith(inp); inp.focus(); inp.select();
      let esc = false;
      inp.addEventListener('blur', () => { const v = parseNum(inp.value); if (v !== null && !esc) put(v, inp.value.trim().replace(/\s/g, '')); inp.replaceWith(btn); paint(); }, { once: true });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { esc = true; inp.blur(); } });
    });
    paint();
    return el;
  }

  /* Der Ausgang ist FEST (Sönke 24.11.2026): alle v = 1, b = 0,5 − n → feuert nur, wenn alle n Perzeptrons 1 schicken */
  const outFix = n => ({ v: Array(n).fill(1), b: 0.5 - n });
  /* Netz aus Stufe 2 auswerten: alle Perzeptrons müssen geprüft sein */
  function netOf(st) {
    if (!st.hid.length || st.hid.some(x => !x.ok)) return null;
    const hid = st.hid.map(x => neuronOf(x.w)), { v, b } = outFix(hid.length);
    return { hid, v, b, judge: p => fire(hid.reduce((s, n, i) => s + v[i] * fire(zOf(n, p)), 0) + b) };
  }
  /* Prüfung eines Perzeptrons für das Netz: alle Dreiecke auf der gelben Seite, mindestens drei Kreise abgetrennt.
     Ob seine Gerade genau durch P und Q geht, zählt nicht (Sönke 22.11.2026) – es zählt, was es mit den Kameras macht. */
  function checkHid(x, cams = K.ALL) {
    const n = neuronOf(x.w), tri = cams.filter(c => c.soll);
    const wrongTri = tri.filter(c => !fire(zOf(n, c.p))).length;
    const cut = cams.filter(c => !c.soll && !fire(zOf(n, c.p))).length;
    const zero = !n.w[0] && !n.w[1];
    return { wrongTri, cut, tri: tri.length, zero, flip: !zero && wrongTri > tri.length / 2, pass: !zero && wrongTri === 0 && cut >= 3 };
  }
  /* Musterlösung aus karte.js (K.LINES): Fluss · Straße · Stadt */
  const hidOf = (ks) => ks.map((k, i) => { const l = K.LINES[k]; return { P: l.P.slice(), Q: l.Q.slice(), w: [l.w[0], l.w[1], l.b], col: COLS[i], ok: true }; });
  const MUSTER = () => ({ hid: hidOf(['fluss', 'strasse', 'stadt']), out: { v: [1, 1, 1], b: -2.5 }, done: true, seen: true });

  /* ── Seite ── */
  let page = null, api = null, map = null;
  function render(root, a) {
    page = root; api = a || {};
    if (!STEPS.some(s => s.id === S.step)) S.step = 'fluss';
    root.innerHTML = '';
    const wrap = h('<div class="nn-page rv-page"></div>');
    const nav = h('<nav class="nn-steps"></nav>');
    STEPS.forEach((s, i) => {
      const b = h(`<button type="button" class="nn-step${s.id === S.step ? ' on' : ''}" data-step="${s.id}"><i>${i + 1}</i>${s.kurz}</button>`);
      b.addEventListener('click', () => go(s.id));
      nav.appendChild(b);
    });
    wrap.appendChild(nav);
    const i = STEPS.findIndex(s => s.id === S.step), St = STEPS[i];
    const card = h(`<section class="nn-card nn-stepcard rv-card"><p class="nn-kicker">Schritt ${i + 1} von ${STEPS.length}</p><h2>${St.title}</h2></section>`);
    wrap.appendChild(card);
    root.appendChild(wrap);
    map = K.makeMap();
    map.set({ reveal: S.step !== 'jahr' && S.revealed && !S.covered ? 1 : 0 });
    ({ fluss: stepFluss, stadt: stepStadt, jahr: stepJahr })[S.step](card);
    const foot = h('<div class="nn-foot"></div>');
    if (i > 0) { const b = h(`<button type="button" class="nn-btn">‹ ${STEPS[i - 1].kurz}</button>`); b.onclick = () => go(STEPS[i - 1].id); foot.appendChild(b); }
    else foot.appendChild(h('<span></span>'));
    if (!STUDENT) { const b = h('<button type="button" class="nn-btn rv-sheet-btn" title="Arbeitsblatt mit derselben Karte drucken">Arbeitsblatt</button>'); b.onclick = printSheet; foot.appendChild(b); }
    if (i < STEPS.length - 1) { const b = h(`<button type="button" class="nn-btn primary rv-next">${STEPS[i + 1].kurz} ›</button>`); b.onclick = () => go(STEPS[i + 1].id); foot.appendChild(b); }
    else foot.appendChild(h('<span></span>'));
    card.appendChild(foot);
  }
  function go(id) { S.step = id; save(); render(page, api); page.scrollTop = 0; }

  /* Wie Schritt 6/7 in Teil 1: links das Neuron, rechts die Karte */
  /* Unter der Karte: wieder zudecken / aufdecken, sobald sie einmal aufgedeckt war */
  let paintCover = () => {};
  const revealOf = () => S.covered ? 0 : 1;
  function coverBtn() {
    const b = h('<button type="button" class="rv-link rv-cover"></button>');
    paintCover = () => { b.hidden = !S.revealed || S.step === 'jahr'; b.textContent = S.covered ? 'Karte aufdecken' : 'Karte wieder zudecken'; };
    b.addEventListener('click', () => { S.covered = !S.covered; save(); paintCover(); map.set({ reveal: revealOf() }); });
    paintCover();
    return b;
  }
  function split(card, left, right) {
    const g = h('<div class="nw-split rv-split"><div class="nw-left"></div><div class="nw-right rv-right"></div></div>');
    g.children[0].append(...left);
    g.children[1].append(map.el, coverBtn(), ...right);
    card.appendChild(g);
    return g;
  }
  /* Sönkes Wildkatze neben den Erklärungen (sitzt = erzählt, steht = „schau mal“) */
  const CAT_IMG = pose => `<img class="rv-cat rv-cat-${pose}" src="img/frei/katze_${pose}.webp" alt="" aria-hidden="true">`;
  const lead = html => h(`<div class="rv-lead">${CAT_IMG('sitzt')}<p class="nn-lead-p">${html}</p></div>`);
  const msgEl = () => h('<div class="nn-task-msg rv-result" hidden></div>');
  const setMsg = (el, html, ok) => { el.hidden = !html; el.className = 'nn-task-msg rv-result' + (ok ? ' ok' : ''); el.innerHTML = html || ''; };
  const row = (n, cls, inner) => h(`<div class="rv-row ${cls}"><i>${n}</i><div>${inner}</div></div>`);
  const checks = items => `<ul class="rv-checks">${items.map(([g, t]) => `<li class="${g ? 'good' : 'bad'}">${t}</li>`).join('')}</ul>`;

  /* Hilfe: von der Gleichung zum Neuron – jede Gleichung in einer Zeile, umgestellte Gleichung und
     Neuron-Gleichung untereinander (Spalten passen aufeinander), Regel in zwei Zeilen (Sönke 24.11.2026) */
  function helpPanel() {
    const e = eqOf(EX.P, EX.Q);
    const W = t => `<span class="t-w">${t}</span>`, B = t => `<span class="t-b">${t}</span>`;
    const box = h(`<div class="rv-help" hidden><div class="rv-help-h"><b>Beispiel: von der Gleichung zum Neuron</b><button type="button" class="rv-link rv-help-x">schließen</button></div>
      <div class="rv-hsteps">
        <span class="rv-hl">1 · Gerade</span><span class="rv-hq m">${e.main}</span>
        <span class="rv-hl">2 · Alles nach links</span><span class="rv-hq m">x₁ + x₂ − 8 = 0</span>
        <span class="rv-hl">3 · Vergleichen</span>
        <div class="rv-hcmp m">
          <span>${W('1')}·x₁</span><span>+</span><span>${W('1')}·x₂</span><span>+</span><span>${B('(−8)')}</span><span>= 0</span>
          <span>${W('w₁')}·x₁</span><span>+</span><span>${W('w₂')}·x₂</span><span>+</span><span>${B('b')}</span><span>= z</span>
        </div>
        <span class="rv-hl"></span><span class="rv-hq m">${W('w₁ = 1')}, ${W('w₂ = 1')}, ${B('b = −8')}</span>
      </div>
      <div class="rv-help-n"></div>
      <p class="rv-help-t"><b>Welche Seite?</b> ${W('w₂')} positiv → das Neuron feuert <b>oberhalb</b> der Geraden.<br>
        Liegt das Revier <b>unterhalb</b>: alle drei Zahlen mal −1.</p></div>`);
    const m = model([EX.w[0], EX.w[1], EX.b], [5, 5]);
    const N = NL().makeNeuron(m, { fixed: true });
    N.setShow(4);
    box.querySelector('.rv-help-n').appendChild(N.el);
    box.querySelector('.rv-help-x').addEventListener('click', () => { box.hidden = true; });
    return box;
  }

  /* ── Schritt 1: Der Fluss ──────────────────────────────── */
  function stepFluss(card) {
    const st = S.s2;
    card.appendChild(lead(`Försterin <b>Jana</b> hat <b>Wildtierkameras</b> aufgestellt. <b class="t-y">Dreieck</b> = Wildkatze gesehen. Ein Neuron soll entscheiden: Revier oder nicht?
      <b class="t-x">Eingänge</b>: ${xs('x', 1)} = km nach Osten, ${xs('x', 2)} = km nach Norden. Im Süden sieht keine Kamera eine Katze – dort verläuft eine <b>Grenze</b>.`));
    const m = model(st.w, [5, 5]);
    const N = NL().makeNeuron(m, { direct: true, onChange: k => {
      if (k[0] === 'x') { paint(); return; }
      st.w = [m.w[0], m.w[1], m.b]; st.done = false; save(); paint();
    } });
    N.setShow(4);
    const eq = h('<div class="rv-eq"></div>');
    const r1 = row(1, 'on', '<b>Grenze ziehen</b><span>Zieh <b>P</b> und <b>Q</b>, bis die Gerade Dreiecke und Kreise trennt.</span>');
    r1.lastElementChild.appendChild(eq);
    const r2 = row(2, 'on', '<b>Neuron ausrechnen</b><span>Umstellen, bis rechts <b>0</b> steht, dann <span class="t-w">w₁</span>, <span class="t-w">w₂</span>, <span class="t-b">b</span> ablesen und eintippen (Zahl antippen, Brüche wie <span class="m">3/4</span> gehen).</span>');
    const calc = h('<div class="nw-calc m"></div>');
    const ctl = h('<div class="rv-ctl"><button type="button" class="nn-btn primary rv-check">Prüfen</button><button type="button" class="nn-btn rv-help-b">Hilfe: Beispiel</button></div>');
    const help = helpPanel();
    const msg = msgEl();
    const tip = h('<p class="nn-try" hidden><b>Probier:</b> Tippe Kameras an – das Neuron rechnet sie aus. Wo ist <i class="m">z</i> groß, wo fast 0?</p>');
    split(card, [r1, r2, N.el, calc, ctl, help], [h(legend('dein Neuron')), msg, tip]);
    ctl.querySelector('.rv-help-b').addEventListener('click', () => { help.hidden = !help.hidden; });
    ctl.querySelector('.rv-check').addEventListener('click', check);
    const nOf = () => neuronOf(st.w);

    function paint() {
      eq.innerHTML = eqBox(st.P, st.Q);
      calc.innerHTML = NL().calcHTML(m, 4);
      const n = st.done ? nOf() : null;
      tip.hidden = !st.done;
      map.set({
        cams: K.YEAR1, at: m.x.slice(),
        handles: { P: st.P, Q: st.Q, color: css('accent'), onMove: (P, Q) => { st.P = P; st.Q = Q; if (st.done) { st.done = false; save(); setMsg(msg, ''); } else save(); eq.innerHTML = eqBox(st.P, st.Q); paintMap(); } },
        tapCam: p => { m.x = p.slice(); N.update(); paint(); },
        lines: n ? [{ w: n.w, b: n.b, color: css('ink') }] : [], region: n ? p => fire(zOf(n, p)) : null, judge: n ? p => fire(zOf(n, p)) : null,
      });
    }
    function paintMap() {
      const n = st.done ? nOf() : null;
      map.set({ lines: n ? [{ w: n.w, b: n.b, color: css('ink') }] : [], region: n ? p => fire(zOf(n, p)) : null, judge: n ? p => fire(zOf(n, p)) : null });
    }
    function check() {
      const n = nOf();
      if (!n.w[0] && !n.w[1]) { setMsg(msg, '<ul class="rv-checks"><li class="bad">Trag erst die Zahlen im Neuron ein: <span class="t-w">w₁</span>, <span class="t-w">w₂</span> und <span class="t-b">b</span> sind noch 0.</li></ul>'); return; }
      const items = [];
      const ok = K.YEAR1.filter(c => fire(zOf(n, c.p)) === c.soll).length, all = ok === K.YEAR1.length;
      const goldOk = K.YEAR1.filter(c => c.soll && fire(zOf(n, c.p))).length;
      const flip = !all && goldOk === 0 && K.YEAR1.filter(c => !c.soll && !fire(zOf(n, c.p))).length === 0;
      if (flip) items.push([false, `Die Gerade passt – aber dein Neuron feuert auf der <b>falschen Seite</b>: ${sideOf(n)} seiner Geraden, das Revier liegt ${sideOf({ w: [-n.w[0], -n.w[1]] })}. Nimm alle drei Zahlen mal −1.`]);
      else if (!all) {
        const pe = penErrors(st.P, st.Q, K.YEAR1);
        if (pe > 0) items.push([false, `Deine Gerade durch P und Q liegt noch nicht zwischen allen Dreiecken und Kreisen (${pe} ${pe === 1 ? 'Kamera' : 'Kameras'} auf der falschen Seite). Zieh P und Q anders.`]);
        else items.push([false, 'Deine Gerade durch P und Q trennt richtig – aber die Zahlen im Neuron passen noch nicht dazu. Stell die Gleichung nochmal um.']);
      }
      items.push([all, `<b>${ok} von ${K.YEAR1.length}</b> Kameras richtig.`]);
      st.done = all; save();
      paintMap(); tip.hidden = !st.done;
      setMsg(msg, checks(items) + (st.done ? '<p><b>Geschafft!</b> Die Gerade deines Neurons ist jetzt eingezeichnet – gelb ist, wo es feuert. Was dort wirklich ist, siehst du erst am Ende.</p>' : '<p class="rv-hint2">Die Gerade deines Neurons wird erst eingezeichnet, wenn die Zahlen stimmen.</p>'), st.done);
    }
    paint();
  }

  /* ── Schritt 2: Ein Jahr später (Netz) ───────────────────
     Oben die Geraden (aus P und Q) als Gleichungen, darunter das Netz, in dem
     man w₁ w₂ b direkt in jedes Perzeptron einträgt; der Ausgang zeigt seine
     Werte v₁ … vₙ und b ebenfalls im Netz (eine Leitung je v). */
  function stepStadt(card) {
    netStep(card, {
      key: 's3', muster: MUSTER, reveal: true,
      cams: K.ALL.map(c => c.k === 'gelb' || c.k === 'rot' ? c : Object.assign({}, c, { neu: true })),
      init(st) { if (!st.hid.length && S.s2.done) { const x = { P: S.s2.P.slice(), Q: S.s2.Q.slice(), w: S.s2.w.slice(), col: COLS[0], ok: false }; x.ok = checkHid(x).pass; st.hid.push(x); st.out.v.push(0); } },
      /* keine Ursachen (Straße, Stadt) nennen – die zeigt erst das Aufdecken (Sönke 24.11.2026) */
      lead: `Jana will wissen: <b>Wie weit reicht das Revier nach Norden?</b> Dafür hat sie <b>neue Kameras</b> aufgestellt (heller Hof).
      Eine Gerade reicht nicht mehr. Jede Grenze wird ein <b>Perzeptron</b>: Gerade ziehen, umstellen, Zahlen im Netz eintragen. Der <b>Ausgang</b> fasst sie zusammen.`,
    });
  }

  /* Hinweis, wenn das Netz aus einem früheren Schritt noch fehlt */
  function needNet(card, back, name, loadMuster) {
    card.appendChild(h(`<div class="rv-need"><p>Hier geht es mit deinem Netz aus <b>${name}</b> weiter – das ist noch nicht fertig.</p>
      <p><button type="button" class="nn-btn rv-go3">‹ Zurück</button> <button type="button" class="nn-btn rv-lsg">Mit der Musterlösung weitermachen</button></p></div>`));
    card.querySelector('.rv-go3').onclick = () => go(back);
    card.querySelector('.rv-lsg').onclick = () => { loadMuster(); save(); render(page, api); };
  }

  function netStep(card, cfg) {
    const st = S[cfg.key], CAMS = cfg.cams;
    if (!st.seen) { st.seen = true; cfg.init(st); save(); }
    card.appendChild(lead(`${cfg.lead}`));
    const eqs = h('<div class="rv-eqs"></div>');
    // Das Netz als Bild wie „Wie arbeitet ein Neuron?“: Eingänge → Leitungen mit Gewicht → Perzeptrons (Bias darunter) → Ausgang
    const net = h('<div class="nw rv-nn"><div class="nw-in rv-nn-in"></div></div>');
    const addRow = h('<div class="rv-addrow"></div>');
    const ctl = h('<div class="rv-ctl"><button type="button" class="nn-btn primary rv-check">Prüfen</button><button type="button" class="nn-btn rv-help-b">Hilfe: Beispiel</button></div>');
    const fb = h('<div class="rv-fb"></div>');
    const help = helpPanel();
    const calc = h('<div class="nw-calc m rv-calc2" hidden></div>');
    const msg = msgEl();
    const mu = h(`<p class="rv-muster"><button type="button" class="rv-link rv-lsg">Musterlösung laden</button></p>`);
    split(card, [eqs, net, addRow, ctl, fb, help, calc, mu], [h(legend('das Netz')), msg]);
    const inner = net.querySelector('.rv-nn-in');
    ctl.querySelector('.rv-help-b').addEventListener('click', () => { help.hidden = !help.hidden; });
    ctl.querySelector('.rv-check').addEventListener('click', checkAll);
    // ausgewählt: Index eines Perzeptrons (seine Griffe liegen auf der Karte) oder −1 = ganzes Netz
    let sel = st.hid.findIndex(x => !x.ok), camP = null;
    const curX = () => sel >= 0 ? st.hid[sel] : null;
    const W_OPT = { step: 0.5, min: -4, max: 4 }, B_OPT = { step: 1, min: -30, max: 30 };

    function select(i) { sel = sel === i ? -1 : i; camP = null; build(); }
    function paintEqs() {
      eqs.innerHTML = st.hid.length ? '<span class="rv-eqs-l">Geraden aus P und Q</span>' : '';
      st.hid.forEach((x, i) => {
        const e = eqOf(x.P, x.Q);
        const r = h(`<div class="rv-eqrow${sel === i ? ' on' : ''}" style="--c:${x.col}"><button type="button" class="rv-eqb"><span class="rv-num">${i + 1}</span><b class="m">${e.main}</b>${sel === i && e.sub ? `<span class="rv-eq-s">${e.sub}</span>` : ''}</button>${sel === i ? '<button type="button" class="rv-link rv-del">entfernen</button>' : ''}</div>`);
        r.querySelector('.rv-eqb').addEventListener('click', () => select(i));
        r.querySelector('.rv-del')?.addEventListener('click', () => { st.hid.splice(i, 1); st.out.v.splice(i, 1); sel = -1; fb.innerHTML = ''; save(); build(); });
        eqs.appendChild(r);
      });
    }
    function changed(x) {
      x.ok = false; save(); fb.innerHTML = '';
      const nd = inner.querySelector(`.rv-nb[data-i="${st.hid.indexOf(x)}"]`);
      if (nd) { nd.classList.add('open'); nd.querySelector('.rv-hok').textContent = ''; }
      paint();
    }
    /* Lage im Bild (Fläche NW × H, wie makeNeuron in Prozent darüber gelegt) */
    const NW = 760, SP = 175, TOP = 36;
    function geo() {
      const n = Math.max(1, st.hid.length), H = TOP + n * SP;
      const hy = i => TOP + 40 + i * SP;
      const cy = (hy(0) + hy(n - 1)) / 2, d = n === 1 ? 50 : 72;
      return { H, hy, cy, xin: [cy - d, cy + d], vy: i => cy + (i - (st.hid.length - 1) / 2) * 46 };
    }
    const GLYPH = '<svg viewBox="0 0 100 60" class="nw-stepfn"><line x1="6" y1="50" x2="94" y2="50" class="ax"/><line x1="50" y1="6" x2="50" y2="56" class="ax"/><path class="st" d="M6 50 H50 V12 H94"/><circle class="dot" r="6" cx="50" cy="50"/></svg>';
    const body = (cls, inner2) => `<div class="nw-half nw-sum"><b class="nw-sigma">Σ</b><span class="nw-z m" hidden><i>z</i> = <b></b></span></div><div class="nw-half nw-f">${GLYPH}</div>${inner2 || ''}`;
    function build() {
      paintEqs();
      const G = geo(), P = (x, y) => `left:${x / NW * 100}%;top:${y / G.H * 100}%`;
      const box = (x, y, w, hh) => `left:${x / NW * 100}%;top:${y / G.H * 100}%;width:${w / NW * 100}%;height:${hh / G.H * 100}%`;
      inner.style.aspectRatio = `${NW} / ${G.H}`;
      inner.style.setProperty('--u', `calc(100cqw / ${NW})`);
      inner.innerHTML = `<svg class="nw-wires rv-wires" viewBox="0 0 ${NW} ${G.H}" preserveAspectRatio="none"></svg>`;
      [1, 2].forEach(k => inner.appendChild(h(`<div class="nw-node rv-xn" style="${P(58, G.xin[k - 1])}"><i class="m">x<sub>${k}</sub></i><b class="rv-xv"></b></div>`)));
      st.hid.forEach((x, i) => {
        const y = G.hy(i);
        const nb = h(`<div class="nw-body rv-nb${sel === i ? ' on' : ''}${x.ok ? '' : ' open'}" data-i="${i}" role="button" tabindex="0" title="Perzeptron ${i + 1}: Gerade auf der Karte ziehen" style="${box(372, y - 35, 110, 70)};--c:${x.col}">${body()}<span class="rv-nbadge">${i + 1}</span><span class="rv-hok">${x.ok ? '✓' : ''}</span></div>`);
        nb.addEventListener('click', () => select(i));
        nb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
        inner.appendChild(nb);
        [0, 1].forEach(j => {
          const pill = h(`<div class="nw-wpill rv-wp" data-i="${i}" style="${P(268, y + (j ? 21 : -21))};--c:${x.col}"><i class="m">w<sub>${j + 1}</sub></i></div>`);
          pill.appendChild(miniVal(() => x.w[j], v => { x.w[j] = v; changed(x); }, 'c-w', Object.assign({ k: 'w' + (j + 1) }, W_OPT)));
          inner.appendChild(pill);
        });
        const bp = h(`<div class="nw-bias rv-bp" data-i="${i}" style="${P(427, y + 76)}"><i class="m">b</i></div>`);
        bp.appendChild(miniVal(() => x.w[2], v => { x.w[2] = v; changed(x); }, 'c-b', Object.assign({ k: 'b' }, B_OPT)));
        inner.appendChild(bp);
      });
      if (st.hid.length) {
        const ob = h(`<div class="nw-body rv-ob2${sel < 0 ? ' on' : ''}" role="button" tabindex="0" title="ganzes Netz auf der Karte zeigen" style="${box(664, G.cy - 38, 90, 76)}">${body()}</div>`);
        ob.addEventListener('click', () => { sel = -1; camP = null; build(); });
        inner.appendChild(ob);
        inner.appendChild(h(`<span class="rv-ocap" style="${P(709, G.cy - 54)}">Revier?</span>`));
        const OF = outFix(st.hid.length);
        st.hid.forEach((x, i) => inner.appendChild(h(`<div class="nw-wpill rv-vp is-fix" data-i="${i}" style="${P(580, G.vy(i))};--c:${x.col}" title="fest"><i class="m">v<sub>${i + 1}</sub></i><span class="nw-val c-w"><b class="nw-num">${num(OF.v[i])}</b></span></div>`)));
        inner.appendChild(h(`<div class="nw-bias rv-obp is-fix" style="${P(709, G.cy + 78)}" title="fest"><i class="m">b</i><span class="nw-val c-b"><b class="nw-num">${num(OF.b)}</b></span></div>`));
      } else inner.appendChild(h(`<p class="rv-nn-empty" style="${P(427, G.hy(0))}">Noch kein Perzeptron – tippe auf <b>＋ Perzeptron</b>.</p>`));
      addRow.innerHTML = '';
      if (st.hid.length < MAX_HID) {
        const add = h('<button type="button" class="rv-hn rv-add" title="Perzeptron hineinziehen oder antippen"><b>＋</b><span>Perzeptron</span></button>');
        add.addEventListener('pointerdown', e => dragAdd(e, add));
        add.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addHid(); } });
        addRow.appendChild(add);
      }
      if (st.hid.length) addRow.appendChild(h(`<details class="rv-recipe"><summary>Warum ist der Ausgang fest?</summary><p>Jedes Perzeptron schickt <b>1</b> oder <b>0</b>. Revier ist nur, wo <b>alle</b> 1 schicken: Summe ${st.hid.length} + (${num(0.5 - st.hid.length)}) > 0, bei ${st.hid.length - 1} nicht mehr.</p></details>`));
      paint();
    }
    /* Leitungen (Dicke = Gewicht, gestrichelt = negativ) und – nach Antippen einer Kamera – was jedes Neuron rechnet */
    function paintNet() {
      const svgEl = inner.querySelector('.rv-wires'); if (!svgEl) return;
      const G = geo(), L = [];
      const ln = (x1, y1, x2, y2, col, w, cls = '') => L.push(`<line class="rv-w ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${col};stroke-width:${w}"/>`);
      const wcls = w => Math.abs(w) < 0.005 ? 'is-zero' : w < 0 ? 'is-neg' : '';
      const ww = w => Math.max(1.6, Math.min(2 + Math.abs(w) * 1.6, 9));
      const ys = camP ? st.hid.map(q => fire(zOf(neuronOf(q.w), camP))) : null;
      st.hid.forEach((x, i) => {
        const y = G.hy(i), dim = sel >= 0 && sel !== i ? ' dim' : '';
        [0, 1].forEach(j => {
          const py = y + (j ? 21 : -21);
          ln(96, G.xin[j], 268, py, x.col, ww(x.w[j]), wcls(x.w[j]) + dim);
          ln(268, py, 372, py, x.col, ww(x.w[j]), wcls(x.w[j]) + dim);
        });
        L.push(`<line class="rv-bl${dim}" x1="427" y1="${y + 60}" x2="427" y2="${y + 42}"/><path class="rv-ba${dim}" d="M420 ${y + 45} L427 ${y + 36} L434 ${y + 45} Z"/>`);
        if (st.hid.length) {
          const v = outFix(st.hid.length).v[i], hot = ys && ys[i] ? ' hot' : '', odim = sel >= 0 ? ' dim' : '';
          ln(482, y, 580, G.vy(i), x.col, ww(v), wcls(v) + odim + hot);
          ln(580, G.vy(i), 664, G.vy(i), x.col, ww(v), wcls(v) + odim + hot);
        }
      });
      if (st.hid.length) L.push(`<line class="rv-bl" x1="709" y1="${G.cy + 62}" x2="709" y2="${G.cy + 45}"/><path class="rv-ba" d="M702 ${G.cy + 48} L709 ${G.cy + 39} L716 ${G.cy + 48} Z"/>`);
      svgEl.innerHTML = L.join('');
      // Werte an den Knoten: Kamera angetippt → x, z und Treppe wie im einzelnen Neuron
      inner.querySelectorAll('.rv-xv').forEach((e, k) => { e.textContent = camP ? num(camP[k]) : ''; });
      const setBody = (el, z) => {
        const zs = el.querySelector('.nw-z'), dot = el.querySelector('.dot');
        zs.hidden = z === null; el.querySelector('.nw-sigma').classList.toggle('small', z !== null);
        if (z !== null) zs.querySelector('b').textContent = num(z);
        el.classList.toggle('is-fire', z !== null && fire(z) === 1);
        dot.setAttribute('cx', z === null ? 50 : Math.max(6, Math.min(94, 50 + z * 11)));
        dot.setAttribute('cy', z !== null && fire(z) ? 12 : 50);
      };
      inner.querySelectorAll('.rv-nb').forEach(el => { const x = st.hid[+el.dataset.i]; setBody(el, camP ? zOf(neuronOf(x.w), camP) : null); });
      const ob = inner.querySelector('.rv-ob2');
      if (ob) { const OF = outFix(st.hid.length); setBody(ob, ys ? ys.reduce((s2, y, i) => s2 + OF.v[i] * y, 0) + OF.b : null); }
    }
    function checkAll() {
      if (!st.hid.length) return;
      const items = st.hid.map((x, i) => {
        const c = checkHid(x, CAMS), n = neuronOf(x.w), who = `<b style="color:${x.col}">Perzeptron ${i + 1}:</b>`;
        x.ok = c.pass;
        if (c.zero) return [false, `${who} <span class="t-w">w₁</span>, <span class="t-w">w₂</span> und <span class="t-b">b</span> sind noch 0.`];
        if (c.pass) return [true, `${who} alle Dreiecke auf der gelben Seite, ${c.cut} Kreise abgetrennt.`];
        if (c.flip) return [false, `${who} feuert auf der <b>falschen Seite</b> (${sideOf(n)} seiner Geraden, das Revier liegt ${sideOf({ w: [-n.w[0], -n.w[1]] })}). Alle drei Zahlen mal −1.`];
        if (c.wrongTri) return [false, `${who} ${c.wrongTri} ${c.wrongTri === 1 ? 'Dreieck liegt' : 'Dreiecke liegen'} nicht auf der gelben Seite – die Gerade schneidet ins Revier.`];
        return [false, `${who} trennt kaum etwas ab. Zieh die Gerade dorthin, wo die Katzen-Kameras aufhören.`];
      });
      save();
      fb.innerHTML = checks(items);
      sel = st.hid.findIndex(x => !x.ok);
      build();
    }
    function addHid() {
      if (st.hid.length >= MAX_HID) return;
      const used = st.hid.map(x => x.col), col = COLS.find(c => !used.includes(c)) || COLS[st.hid.length % COLS.length];
      const [P, Q] = DEF_PQ[st.hid.length % DEF_PQ.length];
      st.hid.push({ P: P.slice(), Q: Q.slice(), w: [0, 0, 0], col, ok: false });
      st.out.v.push(0);
      sel = st.hid.length - 1; camP = null;
      save(); build();
    }
    /* Kamera antippen: gewähltes Perzeptron rechnet sie vor (wie in Teil 1) – sonst rechnet der Ausgang */
    function paintCalc() {
      calc.hidden = !camP;
      if (!camP) return;
      const x = curX();
      if (x) { calc.innerHTML = NL().calcHTML(Object.assign(model(x.w, camP)), 4); return; }
      const ys = st.hid.map(q => fire(zOf(neuronOf(q.w), camP))), { v, b } = outFix(st.hid.length);
      const z = ys.reduce((s, y, i) => s + v[i] * y, 0) + b;
      calc.innerHTML = `<div class="rv-ocalc"><span>Kamera <b>${pt(camP)}</b> – die Perzeptrons schicken ${ys.map((y, i) => `<b style="color:${st.hid[i].col}">${y}</b>`).join(', ')}</span>
        <span>Ausgang: <i>z</i> = ${ys.map((y, i) => `${num(v[i])}·<b style="color:${st.hid[i].col}">${y}</b>`).join(' + ')} + ${b < 0 ? `(${num(b)})` : num(b)} = <b>${num(z)}</b> → <b class="${fire(z) ? 't-y' : ''}">${fire(z) ? '1 Revier' : '0 kein Revier'}</b></span></div>`;
    }
    function paint() {
      const cur = curX();
      const ns = st.hid.map(x => x.ok ? neuronOf(x.w) : null);
      const n = netOf(st), curN = cur && cur.ok ? ns[sel] : null;
      map.set({
        cams: CAMS, at: camP ? camP.slice() : null,
        handles: cur ? { P: cur.P, Q: cur.Q, color: cur.col, onMove: (P, Q) => { cur.P = P; cur.Q = Q; save(); paintEqs(); } } : null,
        tapCam: p => { camP = p.slice(); paint(); },
        lines: ns.map((q, i) => q && { w: q.w, b: q.b, color: st.hid[i].col, num: String(i + 1), width: sel === i ? 4.4 : 2.6, faint: !!cur && sel !== i }).filter(Boolean),
        region: cur ? (curN ? p => fire(zOf(curN, p)) : null) : (n ? n.judge : null),
        judge: n && !cur ? n.judge : null,
      });
      paintCalc(); paintNet();
      mu.hidden = st.done;
      const lg = card.querySelector('.rv-lg-gold em');
      if (lg) lg.textContent = cur ? `hier feuert Perzeptron ${sel + 1}` : 'hier feuert das Netz';
      if (!st.hid.length) { setMsg(msg, 'Tippe auf <b>＋ Perzeptron</b> oder zieh es ins Netz.'); return; }
      const open = st.hid.findIndex(x => !x.ok);
      if (open >= 0) { setMsg(msg, `Perzeptron ${open + 1}: Gerade ziehen, ${xs('w', 1)}, ${xs('w', 2)}, <i class="m">b</i> eintragen, <b>Prüfen</b>.`); return; }
      const ok = CAMS.filter(c => n.judge(c.p) === c.soll).length, all = ok === CAMS.length;
      if (st.done !== all) { st.done = all; save(); mu.hidden = all; }
      if (!all) { setMsg(msg, `<b>${ok} von ${CAMS.length}</b> Kameras richtig.${cur ? ' Tippe auf den Ausgang, um das ganze Netz zu sehen.' : ' Rot umkreist = falsch. Fehlt noch eine Grenze?'}`); return; }
      setMsg(msg, `<p><b>${ok} von ${CAMS.length} Kameras richtig${cfg.reveal ? ' – das Revier ist gefunden!' : '!'}</b></p>`, true);
      if (!S.revealed) {
        S.revealed = true; S.covered = false; save();
        msg.insertAdjacentHTML('beforeend', '<p class="rv-reveal-msg">Die Karte deckt sich auf …</p>');
        map.reveal(() => { const r = msg.querySelector('.rv-reveal-msg'); if (r) r.innerHTML = revealText(); paintCover(); });
      } else msg.insertAdjacentHTML('beforeend', `<p>${revealText()}</p>`);
    }
    // ＋ Perzeptron: antippen oder ins Netz ziehen (Zeiger-Ereignisse, am Tablet genauso)
    function dragAdd(e, chip) {
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      let ghost = null, moved = false;
      const mv = ev => {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        moved = true;
        if (!ghost) { ghost = chip.cloneNode(true); ghost.classList.add('rv-ghost'); document.body.appendChild(ghost); }
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        const r = net.getBoundingClientRect();
        net.classList.toggle('drop-on', ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom);
      };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (ghost) ghost.remove();
        const over = net.classList.contains('drop-on'); net.classList.remove('drop-on');
        if (!moved || over) addHid();
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    }
    mu.querySelector('.rv-lsg').addEventListener('click', () => { if (!confirm('Dein Netz durch die Musterlösung ersetzen?')) return; S[cfg.key] = cfg.muster(); save(); render(page, api); });
    build();
  }
  const revealText = () => `${CAT_IMG('steht')}<b>Jetzt siehst du die Landschaft:</b> Im Süden fließt der <b>Fluss</b>, im Nordwesten führt die <b>Landstraße</b> vorbei, oben rechts liegt die <b>Stadt</b> – und die Wildkatzen halten <b>Abstand</b> davon. Dazwischen ist Wald – das Revier. Jede Grenze ist ein Perzeptron, der Ausgang fasst sie zusammen: <b>Das ist ein neuronales Netz.</b> <br><b>Schau genau hin:</b> Der Fluss ist leicht geschwungen, die Gerade deines Fluss-Perzeptrons nicht. Alle Kameras stimmen – aber stimmt die Karte überall?`;

  /* ── Schritt 3: Das Netz fragen (24.11.2026, statt Overfitting) ──
     Dieselben 24 Kameras, dasselbe Netz. Jetzt kommen Pläne an Orten, wo KEINE
     Kamera hängt: Dafür baut man ein Netz. Die Kinder fragen ihr Netz (es rechnet
     vor), entscheiden beim Radweg zwischen zwei Wegen und decken zum Schluss die
     Karte auf: Hatte das Netz recht? Beim Grillplatz am Fluss (zwischen Gerade und
     geschwungenem Fluss) liegt es meist falsch – dort stand keine Kamera. */
  function stepJahr(card) {
    const st = S.s4;
    const n = S.s3.done ? netOf(S.s3) : null;
    if (!n) { needNet(card, 'stadt', '„Ein Jahr später“', () => { S.s3 = MUSTER(); S.revealed = true; }); return; }
    const PL = K.PLANS, hid = S.s3.hid;
    const truth = p => K.inRevier(p) ? 1 : 0;
    const allAsked = () => PL.every(x => st.asked[x.id]) && !!st.route;
    if (!PL.some(x => x.id === st.sel)) st.sel = PL[0].id;
    card.appendChild(lead(`Dein Netz kennt das Revier nur an <b>${K.ALL.length} Kameras</b>. Jetzt kommen <b>Pläne</b> für Orte <b>ohne Kamera</b>. Frag dein Netz: Revier oder nicht?`));
    const list = h('<div class="rv-plans"></div>');
    const calc = h('<div class="nw-calc m rv-calc2 rv-plan-calc" hidden></div>');
    const end = h('<div class="rv-plan-end" hidden></div>');
    split(card, [list, calc, end], [h(legend('dein Netz'))]);
    const sum = h(`<div class="nn-summary rv-sum rv-sum-cat" hidden>${CAT_IMG('sitzt')}<b>Was ein Netz kann – und was nicht</b><ul>
      <li>Ein Netz antwortet auch an Orten, an denen es <b>nie ein Beispiel</b> gesehen hat. Dafür trainiert man es.</li>
      <li>Wo viele Kameras sind, ist es sich sicher. <b>Wo keine sind, rät es</b> – mit den Geraden, die es hat.</li>
      <li>Am Fluss liegt der echte Rand nicht auf deiner Geraden. Keine Kamera hat das verraten. <b>Ein Netz ist nur so gut wie seine Daten.</b></li>
      <li>Bisher hast du jede Gerade selbst ausgerechnet. Unter <b>„Lernen“ → Wildkatzen</b> findet ein Netz seine Geraden mit denselben Kameras <b>selbst</b>.</li></ul></div>`);
    card.querySelector('.rv-split').after(sum);

    /* Das Netz rechnet einen Ort vor: jedes Perzeptron 1/0, dann der Ausgang */
    function calcAt(p) {
      const ys = n.hid.map(q => fire(zOf(q, p)));
      const z = ys.reduce((a2, y, i) => a2 + n.v[i] * y, 0) + n.b;
      const rows = n.hid.map((q, i) => { const zz = zOf(q, p); const pn = v => v < 0 ? `(${num(v)})` : num(v);
        return `<span style="color:${hid[i].col}"><b>${i + 1}</b>: <i>z</i> = ${pn(q.w[0])}·${num(p[0])} + ${pn(q.w[1])}·${num(p[1])} + ${pn(q.b)} ${[q.w[0], q.w[1], q.b].some(v => Math.abs(v * 100 - Math.round(v * 100)) > 1e-9) ? '≈' : '='} <b>${num(zz)}</b> → <b>${ys[i]}</b></span>`; }).join('');
      return `<div class="rv-ocalc"><span>Ort <b>${pt(p)}</b></span>${rows}<span>Ausgang: <i>z</i> = ${ys.map((y, i) => `${num(n.v[i])}·<b style="color:${hid[i].col}">${y}</b>`).join(' + ')} + ${n.b < 0 ? `(${num(n.b)})` : num(n.b)} = <b>${num(z)}</b> → <b class="${fire(z) ? 't-y' : ''}">${fire(z) ? '1 Revier' : '0 kein Revier'}</b></span></div>`;
    }
    const km = v => num(Math.round(v * 10) / 10);
    function paintList() {
      list.innerHTML = '';
      PL.forEach((x, i) => {
        const asked = !!st.asked[x.id], on = st.sel === x.id;
        let body = '', badge = '';
        if (x.kind === 'point') {
          const ans = n.judge(x.p), right = ans === truth(x.p);
          if (asked) body = `<p class="rv-plan-ans ${ans ? 'is-yes' : 'is-no'}">Dein Netz sagt: <b>${ans ? 'Revier' : 'kein Revier'}</b>. ${ans ? x.yes : x.no}</p>`;
          if (st.shown && asked) badge = right ? '<span class="rv-plan-ok">✓ Netz hatte recht</span>' : '<span class="rv-plan-bad">✗ Netz lag falsch</span>';
          if (st.shown && asked && !right) body += `<p class="rv-plan-why">Auf der Karte ${truth(x.p) ? 'liegt der Ort <b>im Revier</b>' : 'ist hier <b>kein Revier</b>'}. ${x.tricky ? 'Der Fluss ist geschwungen, deine Gerade nicht – und genau hier stand keine Kamera.' : 'Hier stand keine Kamera in der Nähe.'}</p>`;
          body += asked ? '' : `<button type="button" class="nn-btn primary rv-ask" data-id="${x.id}">Netz fragen</button>`;
        } else {
          const r = x.routes.map(rt => ({ rt, net: K.routeKm(rt.pts, n.judge), tru: K.routeKm(rt.pts, K.inRevier) }));
          if (asked) body = `<div class="rv-routes">${r.map(({ rt, net }) => `<p><b>${rt.name}</b>: ${km(net.all)} km lang, davon <b>${km(net.hit)} km</b> im Revier (gold)</p>`).join('')}</div>
            <p class="rv-plan-q"><b>Welchen Weg empfiehlst du Jana?</b></p><span class="rv-yn">${r.map(({ rt }) => `<button type="button" data-route="${rt.id}" class="${st.route === rt.id ? 'on' : ''}">${rt.id === 'A' ? 'Weg A' : 'Weg B'}</button>`).join('')}</span>`;
          if (st.route) {
            const best = r.slice().sort((p1, p2) => p1.net.hit - p2.net.hit)[0].rt.id;
            body += `<p class="rv-plan-ans ${st.route === best ? 'is-no' : 'is-yes'}">${st.route === best ? 'Gute Wahl: Der Weg ist länger, führt aber fast nicht durchs Revier.' : 'Kürzer – aber laut deinem Netz fast ganz durchs Revier. Radfahrer, Hunde, Licht am Abend: Die Wildkatzen würden ausweichen.'}</p>`;
          }
          if (st.shown && asked) badge = r.every(({ net, tru }) => Math.abs(net.hit - tru.hit) < 0.8) ? '<span class="rv-plan-ok">✓ Netz hatte recht</span>' : '<span class="rv-plan-bad">✗ Netz lag daneben</span>';
          body += asked ? '' : `<button type="button" class="nn-btn primary rv-ask" data-id="${x.id}">Netz fragen</button>`;
        }
        const el = h(`<div class="rv-plan${on ? ' on' : ''}${asked ? ' asked' : ''}" data-plan="${x.id}"><div class="rv-plan-h"><i>${i + 1}</i><b>${x.name}</b>${badge}</div>
          <p class="rv-plan-t">${x.who} ${x.ask}</p>${body}</div>`);
        el.addEventListener('click', e => {
          const ask = e.target.closest('.rv-ask'), rb = e.target.closest('[data-route]');
          if (ask) { st.asked[x.id] = true; st.sel = x.id; }
          else if (rb) st.route = rb.dataset.route;
          else st.sel = x.id;
          save(); paint();
        });
        list.appendChild(el);
      });
    }
    function paint() {
      paintList();
      const cur = PL.find(x => x.id === st.sel);
      calc.hidden = !(cur && cur.kind === 'point' && st.asked[cur.id]);
      if (!calc.hidden) calc.innerHTML = calcAt(cur.p);
      const done = allAsked();
      end.hidden = !done;
      end.innerHTML = done ? (st.shown ? `<p>${CAT_IMG('steht')}Die Karte ist aufgedeckt. Vergleich: Wo hatte dein Netz recht – und wo nicht?</p>`
        : '<p><b>Alle Pläne geprüft.</b> Aber stimmt das auch? Jana schaut nach.</p><button type="button" class="nn-btn primary rv-show">Karte aufdecken – hatte das Netz recht?</button>') : '';
      end.querySelector('.rv-show')?.addEventListener('click', () => { st.shown = true; S.revealed = true; save(); map.reveal(() => paint()); paint(); });
      sum.hidden = !st.shown;
      map.set({
        reveal: st.shown ? 1 : 0,
        cams: K.ALL, judge: null, region: n.judge,
        lines: n.hid.map((q, i) => ({ w: q.w, b: q.b, color: hid[i].col, num: String(i + 1), width: 2, faint: true })),
        places: PL.filter(x => x.kind === 'point').map(x => ({ p: x.p, label: x.short, on: st.sel === x.id, color: st.asked[x.id] ? (n.judge(x.p) ? css('gold') : css('accent')) : css('ink-soft') })),
        paths: PL.filter(x => x.kind === 'route').flatMap(x => x.routes.map(rt => ({ pts: rt.pts, label: rt.id === 'A' ? 'A' : 'B', on: st.sel === x.id || st.route === rt.id, color: css('in'), hot: st.asked[x.id] ? n.judge : null }))),
        at: cur && cur.kind === 'point' && st.asked[cur.id] ? cur.p.slice() : null,
        tapCam: null, pick: null, handles: null, rings: [],
      });
    }
    paint();
  }

  /* ── Arbeitsblatt (Lehrkraft / allein) ───────────────────
     24.11.2026 (Sönke): „andersherum“ – nicht wieder dieselben Aufgaben wie am Bildschirm.
     1 Ein festes Netz (Perzeptron · ReLU · Linear → Perzeptron) für vier Eingaben durchrechnen.
     2 Drei Perzeptrons mit festen w und b, Ausgang fest (alle 1 → Revier): erst drei Punkte prüfen,
       dann die Geraden (z = 0) finden, einzeichnen und das Dreieck ausmalen. Lösungen rechnet der Code. */
  const AB_ACT = { p: { n: 'Perzeptron', f: z => z > 0 ? 1 : 0 }, r: { n: 'ReLU', f: z => Math.max(0, z) }, l: { n: 'Linear', f: z => z } };
  const AB_NET = { hid: [{ w: [2, -1], b: -3, t: 'p' }, { w: [-1, 2], b: 1, t: 'r' }, { w: [1, 1], b: -4, t: 'l' }], out: { v: [2, 1, 1], b: -3, t: 'p' },
    x: [['A', [1, 2]], ['B', [3, 1]], ['C', [-2, 3]], ['D', [2, -2]]] };
  const AB_TRI = { hid: [{ w: [-1, 4], b: -3, pts: [[1, 1], [9, 3]] }, { w: [-1, -1], b: 12, pts: [[3, 9], [9, 3]] }, { w: [4, -1], b: -3, pts: [[1, 1], [3, 9]] }],
    q: [['Q₁', [4, 4]], ['Q₂', [8, 6]], ['Q₃', [2, 6]]], ecken: [[1, 1], [9, 3], [3, 9]] };
  const AB_COL = ['#1f6fd1', '#c62828', '#7b3fa0'];
  const sgn = v => v < 0 ? `(${num(v)})` : num(v);
  const lin = n => { let t = ''; [[n.w[0], 'x₁'], [n.w[1], 'x₂']].forEach(([c, v]) => { if (!c) return; const a2 = Math.abs(c); t += (t ? (c < 0 ? ' − ' : ' + ') : (c < 0 ? '−' : '')) + (a2 === 1 ? '' : a2 + '·') + v; }); if (n.b) t += (n.b < 0 ? ' − ' : ' + ') + Math.abs(n.b); return t; };
  function abRun(x) {
    const hs = AB_NET.hid.map(n => { const z = n.w[0] * x[0] + n.w[1] * x[1] + n.b; return { z, y: AB_ACT[n.t].f(z) }; });
    const z = hs.reduce((a2, q, i) => a2 + AB_NET.out.v[i] * q.y, 0) + AB_NET.out.b;
    return { hs, z, y: AB_ACT[AB_NET.out.t].f(z) };
  }
  /* das Netz als Bild (SVG, schwarz-weiß druckbar) */
  function abNetSVG() {
    const HY = [50, 150, 250], IY = [100, 200], HX = 250, OX = 495, T = 0.78;
    const L = [];
    const lab = (x, y, t, c = '#999') => L.push(`<rect x="${x - 26}" y="${y - 11}" width="52" height="22" rx="6" fill="#fff" stroke="${c}" stroke-width="1.6"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700">${t}</text>`);
    AB_NET.hid.forEach((n, i) => [0, 1].forEach(j => {
      const x1 = 70, y1 = IY[j], x2 = HX, y2 = HY[i] + (j ? 12 : -12);
      L.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${AB_COL[i]}" stroke-width="1.8"/>`);
    }));
    AB_NET.hid.forEach((n, i) => [0, 1].forEach(j => { const y1 = IY[j], y2 = HY[i] + (j ? 12 : -12); lab(70 + T * (HX - 70), y1 + T * (y2 - y1), num(n.w[j]), AB_COL[i]); }));
    AB_NET.hid.forEach((n, i) => {
      L.push(`<line x1="${HX + 120}" y1="${HY[i]}" x2="${OX}" y2="150" stroke="${AB_COL[i]}" stroke-width="1.8"/>`);
      L.push(`<rect x="${HX}" y="${HY[i] - 28}" width="120" height="56" rx="10" fill="#fff" stroke="${AB_COL[i]}" stroke-width="2.2"/><text x="${HX + 60}" y="${HY[i] - 6}" text-anchor="middle" font-size="13" font-weight="700">${i + 1} · ${AB_ACT[n.t].n}</text><text x="${HX + 60}" y="${HY[i] + 16}" text-anchor="middle" font-size="13">b = ${num(n.b)}</text>`);
    });
    AB_NET.hid.forEach((n, i) => lab(HX + 120 + 0.55 * (OX - HX - 120), HY[i] + 0.55 * (150 - HY[i]), num(AB_NET.out.v[i]), AB_COL[i]));
    IY.forEach((y, j) => L.push(`<circle cx="45" cy="${y}" r="24" fill="#fff" stroke="#222" stroke-width="2"/><text x="45" y="${y + 6}" text-anchor="middle" font-size="17" font-style="italic">x${j ? '₂' : '₁'}</text>`));
    L.push(`<rect x="${OX}" y="118" width="140" height="64" rx="10" fill="#fff" stroke="#222" stroke-width="2.4"/><text x="${OX + 70}" y="138" text-anchor="middle" font-size="13" font-weight="700">Ausgang</text><text x="${OX + 70}" y="155" text-anchor="middle" font-size="12">Perzeptron</text><text x="${OX + 70}" y="172" text-anchor="middle" font-size="13">b = ${num(AB_NET.out.b)}</text>`);
    return `<svg class="ab-net" viewBox="0 0 640 290" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${L.join('')}</svg>`;
  }
  /* Gitter 0 … 10; solved = Lösung mit Geraden, Fläche und Punkten */
  function abGridSVG(solved) {
    const U = 30, M = 34, S2 = M + 10 * U, X = v => M + v * U, Y = v => S2 - v * U;
    const L = [];
    for (let i = 0; i <= 10; i++) {
      L.push(`<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(10)}" stroke="#ccc"/><line x1="${X(0)}" y1="${Y(i)}" x2="${X(10)}" y2="${Y(i)}" stroke="#ccc"/>`);
      L.push(`<text x="${X(i)}" y="${Y(0) + 16}" text-anchor="middle" font-size="11">${i}</text><text x="${X(0) - 8}" y="${Y(i) + 4}" text-anchor="end" font-size="11">${i}</text>`);
    }
    L.push(`<line x1="${X(0)}" y1="${Y(0)}" x2="${X(10)}" y2="${Y(0)}" stroke="#222" stroke-width="1.6"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${Y(10)}" stroke="#222" stroke-width="1.6"/>`);
    L.push(`<text x="${X(10) + 6}" y="${Y(0) + 4}" font-size="13" font-style="italic">x₁</text><text x="${X(0) - 4}" y="${Y(10) - 8}" font-size="13" font-style="italic">x₂</text>`);
    if (solved) {
      L.push(`<polygon points="${AB_TRI.ecken.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="#f5c518" fill-opacity=".35"/>`);
      AB_TRI.hid.forEach((n, i) => {
        // Gerade z = 0 über das ganze Feld (Schnitt mit dem Rand)
        const pts = [];
        const add = p => { if (p[0] >= -1e-9 && p[0] <= 10 + 1e-9 && p[1] >= -1e-9 && p[1] <= 10 + 1e-9 && !pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)) pts.push(p); };
        [0, 10].forEach(x1 => { if (n.w[1]) add([x1, -(n.w[0] * x1 + n.b) / n.w[1]]); });
        [0, 10].forEach(x2 => { if (n.w[0]) add([-(n.w[1] * x2 + n.b) / n.w[0], x2]); });
        if (pts.length >= 2) L.push(`<line x1="${X(pts[0][0])}" y1="${Y(pts[0][1])}" x2="${X(pts[1][0])}" y2="${Y(pts[1][1])}" stroke="${AB_COL[i]}" stroke-width="2.4"/>`);
        const lp = n.pts[0].map((v, k) => (v + n.pts[1][k]) / 2);
        L.push(`<circle cx="${X(lp[0])}" cy="${Y(lp[1])}" r="9" fill="#fff" stroke="${AB_COL[i]}" stroke-width="2"/><text x="${X(lp[0])}" y="${Y(lp[1]) + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${AB_COL[i]}">${i + 1}</text>`);
      });
    }
    AB_TRI.q.forEach(([k, p]) => {
      const inside = solved && AB_TRI.hid.every(n => n.w[0] * p[0] + n.w[1] * p[1] + n.b > 0);
      L.push(solved ? (inside ? `<path d="M${X(p[0])} ${Y(p[1]) - 7} L${X(p[0]) + 7} ${Y(p[1]) + 5} L${X(p[0]) - 7} ${Y(p[1]) + 5} Z" fill="#222"/>` : `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5.5" fill="#fff" stroke="#222" stroke-width="2"/>`)
        : `<path d="M${X(p[0]) - 5} ${Y(p[1]) - 5} L${X(p[0]) + 5} ${Y(p[1]) + 5} M${X(p[0]) + 5} ${Y(p[1]) - 5} L${X(p[0]) - 5} ${Y(p[1]) + 5}" stroke="#222" stroke-width="2"/>`);
      L.push(`<text x="${X(p[0]) + 8}" y="${Y(p[1]) - 7}" font-size="12" font-weight="700">${k}</text>`);
    });
    return `<svg class="ab-grid" viewBox="0 0 ${S2 + 26} ${S2 + 26}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${L.join('')}</svg>`;
  }
  function printSheet() {
    let box = document.getElementById('rv-print');
    if (!box) { box = document.createElement('div'); box.id = 'rv-print'; document.body.appendChild(box); }
    const empty = n => '<td></td>'.repeat(n);
    const T = AB_TRI.hid, H = AB_NET.hid;
    const zTxt = (n, p) => `${sgn(n.w[0])}·${sgn(p[0])} + ${sgn(n.w[1])}·${sgn(p[1])} + ${sgn(n.b)}`;
    const triZ = (n, p) => n.w[0] * p[0] + n.w[1] * p[1] + n.b;
    const percTable = `<table class="ab-perc"><tr><th></th>${T.map((_, i) => `<th>Perzeptron ${i + 1}</th>`).join('')}<th>Ausgang (fest)</th></tr>
      <tr><td><i>w</i>₁</td>${T.map(n => `<td>${num(n.w[0])}</td>`).join('')}<td rowspan="3">bekommt 0 oder 1 von jedem Perzeptron, alle Gewichte 1, <i>b</i> = −2,5<br>→ feuert nur, wenn <b>alle drei</b> 1 schicken</td></tr>
      <tr><td><i>w</i>₂</td>${T.map(n => `<td>${num(n.w[1])}</td>`).join('')}</tr>
      <tr><td><i>b</i></td>${T.map(n => `<td>${num(n.b)}</td>`).join('')}</tr></table>`;
    box.innerHTML = `<section class="sheet">
      <header><b>NeuroLab · Das Revier der Wildkatzen</b><span>Name: ______________________ Datum: __________</span></header>
      <h1>Andersherum: Das Netz steht fest</h1>
      <p>Am Tablet hast du aus Geraden die Zahlen der Neuronen gemacht. Jetzt sind die Zahlen gegeben – du rechnest aus, was das Netz tut.
      Jedes Neuron rechnet <b>z = w₁·x₁ + w₂·x₂ + b</b> und gibt dann aus: <b>Perzeptron</b> 1, wenn z &gt; 0, sonst 0 · <b>ReLU</b> max(0, z) · <b>Linear</b> z.</p>
      <h2>1 · Ein Netz durchrechnen</h2>
      <p>Die Zahlen an den Leitungen sind die Gewichte. Berechne für jede Eingabe z und y jedes Neurons und am Ende die Ausgabe des Netzes.</p>
      ${abNetSVG()}
      <table class="ab-calc"><tr><th>Eingabe (x₁ | x₂)</th><th>z₁</th><th>y₁</th><th>z₂</th><th>y₂</th><th>z₃</th><th>y₃</th><th>z Ausgang</th><th>y Ausgang</th></tr>
        ${AB_NET.x.map(([k, x]) => `<tr><td>${k} (${num(x[0])} | ${num(x[1])})</td>${empty(8)}</tr>`).join('')}</table>
      <p class="tip"><b>Achtung:</b> Bei z = 0 feuert ein Perzeptron <b>nicht</b> (0 ist nicht größer als 0).</p>
      </section><section class="sheet">
      <h2>2 · Drei Perzeptrons – welches Dreieck?</h2>
      ${percTable}
      <div class="ab-row">${abGridSVG(false)}<div>
        <p><b>a)</b> Prüfe die Punkte Q₁, Q₂ und Q₃: Was schickt jedes Perzeptron? Feuert das Netz? Zeichne ins Gitter ▲ (Netz feuert) oder ○ (feuert nicht).</p>
        <table><tr><th>Punkt</th><th>z₁ → y₁</th><th>z₂ → y₂</th><th>z₃ → y₃</th><th>Netz</th></tr>
          ${AB_TRI.q.map(([k, p]) => `<tr><td>${k} (${p[0]} | ${p[1]})</td>${empty(4)}</tr>`).join('')}</table>
      </div></div>
      <p><b>b)</b> Finde die Gerade jedes Perzeptrons: Auf ihr ist <b>z = 0</b>. Wähle ein x₁, rechne x₂ aus – zweimal. Zeichne die Gerade ein.
      <span class="tip-i">Tipp: Wähle x₁ so, dass x₂ eine ganze Zahl wird.</span></p>
      <table><tr><th>Perzeptron</th><th>Gleichung z = 0</th><th>Punkt 1</th><th>Punkt 2</th><th>feuert auf welcher Seite?</th></tr>
        ${T.map((_, i) => `<tr><td>${i + 1}</td>${empty(4)}</tr>`).join('')}</table>
      <p><b>c)</b> Male die Fläche aus, in der das Netz feuert. Welche Ecken hat das Dreieck? Passen deine Punkte aus a)?</p>
      <div class="lines"></div>
      </section><section class="sheet solution">
      <header><b>Lösung</b><span>(für die Lehrkraft)</span></header>
      <h2>1</h2>
      <table class="ab-calc"><tr><th>Eingabe</th><th>z₁</th><th>y₁</th><th>z₂</th><th>y₂</th><th>z₃</th><th>y₃</th><th>z Ausgang</th><th>y Ausgang</th></tr>
        ${AB_NET.x.map(([k, x]) => { const r = abRun(x); return `<tr><td>${k} (${num(x[0])} | ${num(x[1])})</td>${r.hs.map(q => `<td>${num(q.z)}</td><td>${num(q.y)}</td>`).join('')}<td>${num(r.z)}</td><td><b>${num(r.y)}</b></td></tr>`; }).join('')}</table>
      <p>Rechenweg A: z₁ = ${zTxt(H[0], AB_NET.x[0][1])} = ${num(abRun(AB_NET.x[0][1]).hs[0].z)} · Ausgang z = ${AB_NET.out.v.map((v, i) => `${num(v)}·${num(abRun(AB_NET.x[0][1]).hs[i].y)}`).join(' + ')} + (${num(AB_NET.out.b)}) = ${num(abRun(AB_NET.x[0][1]).z)} → feuert nicht (z = 0).</p>
      <h2>2</h2>
      <div class="ab-row">${abGridSVG(true)}<div>
        <p><b>a)</b></p>
        <table><tr><th>Punkt</th><th>1</th><th>2</th><th>3</th><th>Netz</th></tr>
          ${AB_TRI.q.map(([k, p]) => { const zs = T.map(n => triZ(n, p)); return `<tr><td>${k}</td>${zs.map(z => `<td>${num(z)} → ${z > 0 ? 1 : 0}</td>`).join('')}<td><b>${zs.every(z => z > 0) ? '1 ▲' : '0 ○'}</b></td></tr>`; }).join('')}</table>
        <p><b>b)</b> ${T.map((n, i) => `${i + 1}: ${lin(n)} = 0, z. B. (${n.pts[0].join(' | ')}) und (${n.pts[1].join(' | ')}); feuert ${n.w[1] > 0 ? 'oberhalb' : 'unterhalb'}`).join('<br>')}</p>
        <p><b>c)</b> Dreieck mit den Ecken ${AB_TRI.ecken.map(p => `(${p.join(' | ')})`).join(', ')}. Nur Q₁ liegt darin.</p>
      </div></div></section>`;
    document.documentElement.classList.add('rv-print-on');
    const done = () => { document.documentElement.classList.remove('rv-print-on'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
  }

  window.NLRevier = { render, reset() { S = fresh(); save(); } };
})();
