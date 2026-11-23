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

     1 Der Fluss        weit verteilte Kameras, im Süden kein Revier. Die Kinder
                        ziehen die Punkte P und Q auf der Karte; die Funktions-
                        gleichung x₂ = m·x₁ + n steht sofort daneben. Daraus
                        rechnen sie w₁, w₂, b (Umstellen, Brüche wie 3/4 gehen)
                        und stellen sie im Neuron ein. Vorzeichen per Regel:
                        Revier oberhalb der Geraden → w₂ > 0. „Prüfen“: Die
                        Gerade des Perzeptrons wird NUR eingezeichnet, wenn alle
                        Kameras stimmen (ob sie genau durch P und Q geht, ist
                        egal). „Hilfe“ = kurzes Beispiel: Gleichung → Neuron.
     2 Ein Jahr später  Mehr Kameras: Straße (Nordwesten) und Stadt (Nordosten)
                        kommen dazu, die Katzen halten Abstand. Dasselbe dreimal:
                        Gerade ziehen (Gleichungen stehen oben), w₁ w₂ b DIREKT
                        in die Perzeptrons im Netz eintragen, prüfen; der Ausgang
                        zeigt seine Werte v₁ … vₙ und b ebenfalls im Netz. Alles
                        richtig → Karte deckt sich auf (zu- und aufdeckbar). Der
                        Fluss ist leicht geschwungen, die Gerade nicht: Gesprächsanlass.
     3 Zu genau gelernt Vier lila Kameras passen nicht zur Karte (drei im Revier
                        ohne Katze, eine Katze in der Stadt). Kim will die Karte
                        neu zeichnen: jede bekommt ein Merk-Neuron. Alte Kameras
                        → 48/48, neue Kameras → schlechter. Kurve beider Werte.
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
  const VERSION = 5;                                 // 5: Karte nach Sönkes Skizze, gedreht (23.11.2026)
  /* nur fürs Arbeitsblatt: Janas Neuron und drei Kameras zum Nachrechnen */
  const JANA = { w: [1, 1], b: -8 };
  const PROBE = [{ label: 'A', p: [6, 4] }, { label: 'B', p: [2, 2] }, { label: 'C', p: [4, 4] }];
  /* Hilfe-Beispiel: Gerade durch (2|6) und (6|2) */
  const EX = { P: [2, 6], Q: [6, 2], w: [1, 1], b: -8 };
  const DEF_PQ = [[[1, 3], [11, 8]], [[1, 2], [3, 8]], [[6, 10], [12, 4]], [[0, 5], [12, 5]], [[4, 0], [4, 10]], [[0, 0], [12, 10]]];
  const STEPS = [
    { id: 'fluss', kurz: 'Der Fluss', title: 'Die erste Grenze: der Fluss' },
    { id: 'stadt', kurz: 'Ein Jahr später', title: 'Ein Jahr später: mehr Kameras, mehr Grenzen' },
    { id: 'jahr', kurz: 'Zu genau gelernt', title: 'Ein Netz, das sich alles merkt' },
  ];
  const BUBBLE = 0.85;                       // Merk-Neuron: kleiner Kreis um den Ausreißer (km)

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
    s4: { mem: [], view: 'mem', choice: null, tested: false },
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
  const eqP = (a, b) => !!(a && b && a[0] === b[0] && a[1] === b[1]);
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
    if (dx === 0) return { vertical: true, main: `${xs('x', 1)} = ${P[0]}`, sub: 'Eine senkrechte Gerade hat keine Steigung. Hier ist <i class="m">w</i><sub>2</sub> = 0 – schreib die Gleichung als <span class="m">1·x₁ + 0·x₂ − ' + P[0] + ' = 0</span>.' };
    const m = frac(dy, dx), n = frac(P[1] * dx - dy * P[0], dx);
    const dec = f => f.exact ? '' : ` <span class="rv-approx">≈ ${num(f.v)}</span>`;
    const mTxt = m.v === 0 ? '' : `${m.t === '1' ? '' : m.t === '−1' ? '−' : m.t + ' · '}${xs('x', 1)}`;
    const nTxt = n.v === 0 ? '' : (mTxt ? ` ${n.v < 0 ? '−' : '+'} ${frac(Math.abs(P[1] * dx - dy * P[0]), Math.abs(dx)).t}` : n.t);
    return { vertical: false, m, n, main: `${xs('x', 2)} = ${mTxt}${nTxt}` || `${xs('x', 2)} = 0`,
      sub: `Steigung <i class="m">m</i> = ${m.t}${dec(m)} · Achsenabschnitt <i class="m">n</i> = ${n.t}${dec(n)}` };
  }
  const eqBox = (P, Q) => { const e = eqOf(P, Q); return `<span class="rv-eq-l">Funktionsgleichung der Geraden</span><b class="rv-eq-m m">${e.main}</b><span class="rv-eq-s">${e.sub}</span>`; };

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

  /* Netz aus Stufe 2 auswerten: alle Perzeptrons müssen geprüft sein */
  function netOf(st) {
    if (!st.hid.length || st.hid.some(x => !x.ok)) return null;
    const hid = st.hid.map(x => neuronOf(x.w)), v = st.out.v.slice(0, hid.length).map(Number), b = Number(st.out.b);
    if (v.length < hid.length || v.some(x => !isFinite(x))) return null;
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
    map.set({ reveal: S.revealed && !S.covered ? 1 : 0 });
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
  const revealOf = () => S.covered ? 0 : S.step === 'jahr' ? 0.45 : 1;
  function coverBtn() {
    const b = h('<button type="button" class="rv-link rv-cover"></button>');
    paintCover = () => { b.hidden = !S.revealed; b.textContent = S.covered ? 'Karte aufdecken' : 'Karte wieder zudecken'; };
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
  const msgEl = () => h('<div class="nn-task-msg rv-result" hidden></div>');
  const setMsg = (el, html, ok) => { el.hidden = !html; el.className = 'nn-task-msg rv-result' + (ok ? ' ok' : ''); el.innerHTML = html || ''; };
  const row = (n, cls, inner) => h(`<div class="rv-row ${cls}"><i>${n}</i><div>${inner}</div></div>`);
  const checks = items => `<ul class="rv-checks">${items.map(([g, t]) => `<li class="${g ? 'good' : 'bad'}">${t}</li>`).join('')}</ul>`;

  /* Hilfe: von der Funktionsgleichung zum Neuron – kurz, mit fester Regel fürs Vorzeichen (kein Ausprobieren) */
  function helpPanel() {
    const e = eqOf(EX.P, EX.Q);
    const box = h(`<div class="rv-help" hidden><div class="rv-help-h"><b>Beispiel: von der Gleichung zum Neuron</b><button type="button" class="rv-link rv-help-x">schließen</button></div>
      <ol>
        <li>Gleichung der Geraden: <b class="m">${e.main}</b>. Alles auf eine Seite, rechts steht <b>0</b>: <span class="m">x₁ + x₂ − 8 = 0</span>.
          Vergleiche mit <span class="m">z = w₁·x₁ + w₂·x₂ + b</span>: <b class="t-w">w₁ = 1</b>, <b class="t-w">w₂ = 1</b>, <b class="t-b">b = −8</b>.</li>
        <li><b>Welche Seite feuert?</b> Ist <span class="t-w">w₂</span> positiv, wird <i class="m">z</i> größer, je weiter du nach <b>oben</b> (Norden) gehst – das Neuron feuert <b>oberhalb</b> der Geraden.
          Liegt das Revier <b>unterhalb</b>, nimm alle drei Zahlen mal −1: <span class="m">w₁ = −1, w₂ = −1, b = 8</span>.</li>
      </ol><div class="rv-help-n"></div>
      <p class="rv-help-t"><b>Regel</b> für <span class="m">x₂ = m·x₁ + n</span>: Revier <b>oberhalb</b> → <span class="m">w₁ = −m, w₂ = 1, b = −n</span> · Revier <b>unterhalb</b> → <span class="m">w₁ = m, w₂ = −1, b = n</span>.
        Senkrecht <span class="m">x₁ = c</span>: Revier rechts → <span class="m">w₁ = 1, w₂ = 0, b = −c</span>, links → <span class="m">w₁ = −1, b = c</span>. Brüche darfst du so eintippen: <span class="m">3/4</span>.</p></div>`);
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
    card.appendChild(h(`<p class="nn-lead-p">Försterin <b>Jana</b> hat im Tal <b>Wildtierkameras</b> aufgestellt. Ein <b class="t-y">goldenes Dreieck</b> heißt: Diese Kamera hat eine <b>Wildkatze</b> gesehen. Ein Neuron soll für jeden Ort entscheiden: Revier oder nicht? Seine <b class="t-x">Eingänge</b> sind die Lage auf der Karte: ${xs('x', 1)} = km nach Osten, ${xs('x', 2)} = km nach Norden.
      Im Süden sieht keine Kamera eine Katze – hier verläuft eine <b>Grenze</b>. Du ziehst sie ein und <b>rechnest</b> sie dann in ein Neuron um.</p>`));
    const m = model(st.w, [5, 5]);
    const N = NL().makeNeuron(m, { onChange: k => {
      if (k[0] === 'x') { paint(); return; }
      st.w = [m.w[0], m.w[1], m.b]; st.done = false; save(); paint();
    } });
    N.setShow(4);
    const eq = h('<div class="rv-eq"></div>');
    const r1 = row(1, 'on', '<b>Ziehe die Grenze</b><span>Zieh <b>P</b> und <b>Q</b> auf der Karte, bis die Gerade zwischen den Dreiecken und den Kreisen verläuft. Die Funktionsgleichung ändert sich dabei sofort.</span>');
    r1.lastElementChild.appendChild(eq);
    const r2 = row(2, 'on', '<b>Rechne das Neuron aus</b><span>Stell die Gleichung so um, dass rechts <b>0</b> steht, und lies <span class="t-w">w₁</span>, <span class="t-w">w₂</span> und <span class="t-b">b</span> ab. Liegt das Revier <b>oberhalb</b> der Geraden, muss <span class="t-w">w₂</span> positiv sein, liegt es <b>unterhalb</b>, negativ. Zahl im Neuron antippen: Regler oder eintippen, auch Brüche wie <span class="m">3/4</span>.</span>');
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
      if (!n.w[0] && !n.w[1]) { setMsg(msg, '<ul class="rv-checks"><li class="bad">Stell erst die Zahlen im Neuron ein: <span class="t-w">w₁</span>, <span class="t-w">w₂</span> und <span class="t-b">b</span> sind noch 0.</li></ul>'); return; }
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
      lead: `Ein Jahr später: Jana hat <b>mehr Kameras</b> aufgestellt (heller Hof = neu). Jetzt sieht auch im <b>Nordwesten</b> und im <b>Nordosten</b> keine Kamera eine Katze – dort gibt es eine <b>Straße</b> und eine <b>Stadt</b>. Die Wildkatzen halten <b>Abstand</b> zu beiden.
      Mit einer Geraden kommst du nicht mehr aus: Du brauchst <b>drei</b>. Für jede machst du dasselbe wie am Fluss – Gerade ziehen, umstellen, die Zahlen <b>direkt im Netz</b> in ihr Perzeptron eintragen, prüfen. Der <b>Ausgang</b> fasst sie zusammen.`,
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
    card.appendChild(h(`<p class="nn-lead-p">${cfg.lead}</p>`));
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
        const r = h(`<div class="rv-eqrow${sel === i ? ' on' : ''}" style="--c:${x.col}"><button type="button" class="rv-eqb"><span class="rv-num">${i + 1}</span><b class="m">${e.main}</b>${sel === i ? `<span class="rv-eq-s">${e.sub}</span>` : ''}</button>${sel === i ? '<button type="button" class="rv-link rv-del">entfernen</button>' : ''}</div>`);
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
        st.hid.forEach((x, i) => {
          const vp = h(`<div class="nw-wpill rv-vp" data-i="${i}" style="${P(580, G.vy(i))};--c:${x.col}"><i class="m">v<sub>${i + 1}</sub></i></div>`);
          vp.appendChild(miniVal(() => st.out.v[i] ?? 0, v => { st.out.v[i] = v; save(); paint(); }, 'c-w', { step: 1, min: -6, max: 6 }));
          inner.appendChild(vp);
        });
        const obp = h(`<div class="nw-bias rv-obp" style="${P(709, G.cy + 78)}"><i class="m">b</i></div>`);
        obp.appendChild(miniVal(() => st.out.b, v => { st.out.b = v; save(); paint(); }, 'c-b', { step: 0.5, min: -20, max: 20 }));
        inner.appendChild(obp);
      } else inner.appendChild(h(`<p class="rv-nn-empty" style="${P(427, G.hy(0))}">Noch kein Perzeptron – tippe auf <b>＋ Perzeptron</b>.</p>`));
      addRow.innerHTML = '';
      if (st.hid.length < MAX_HID) {
        const add = h('<button type="button" class="rv-hn rv-add" title="Perzeptron hineinziehen oder antippen"><b>＋</b><span>Perzeptron</span></button>');
        add.addEventListener('pointerdown', e => dragAdd(e, add));
        add.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addHid(); } });
        addRow.appendChild(add);
      }
      if (st.hid.length) addRow.appendChild(h(`<details class="rv-recipe"><summary>Tipp zum Ausgang</summary><p>Jedes Perzeptron schickt eine <b>1</b> („Revier“) oder eine <b>0</b> über seine Leitung. Der Ausgang soll nur feuern, wenn <b>alle</b> 1 schicken. Mit allen <i class="m">v</i> = 1 ist die Summe höchstens ${st.hid.length}: Der Bias muss so liegen, dass nur ${st.hid.length} über 0 kommt, ${st.hid.length - 1} aber nicht.</p></details>`));
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
          const v = Number(st.out.v[i] ?? 0), hot = ys && ys[i] ? ' hot' : '', odim = sel >= 0 ? ' dim' : '';
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
      if (ob) setBody(ob, ys ? ys.reduce((s2, y, i) => s2 + Number(st.out.v[i] ?? 0) * y, 0) + Number(st.out.b) : null);
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
      const ys = st.hid.map(q => fire(zOf(neuronOf(q.w), camP))), v = st.hid.map((_, i) => Number(st.out.v[i] ?? 0)), b = Number(st.out.b);
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
      if (open >= 0) { setMsg(msg, `Perzeptron ${open + 1}: Gerade ziehen, ${xs('w', 1)}, ${xs('w', 2)}, <i class="m">b</i> ausrechnen, im Netz eintragen und <b>Prüfen</b> – dann erscheint seine Gerade.`); return; }
      if (!n) { setMsg(msg, 'Alle Geraden stehen. Stell jetzt im Netz den <b>Ausgang</b> ein.'); return; }
      const ok = CAMS.filter(c => n.judge(c.p) === c.soll).length, all = ok === CAMS.length;
      if (st.done !== all) { st.done = all; save(); mu.hidden = all; }
      if (!all) { setMsg(msg, `<b>${ok} von ${CAMS.length}</b> Kameras richtig.${cur ? ' Tippe auf „Ausgang“, um das ganze Netz zu sehen.' : ' Rot umkreist liegt das Netz falsch. Tippe eine Kamera an – der Ausgang rechnet sie vor.'}`); return; }
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
  const revealText = () => `<b>Jetzt siehst du die Landschaft:</b> Im Süden fließt der <b>Fluss</b>, im Nordwesten führt die <b>Landstraße</b> vorbei, oben rechts liegt die <b>Stadt</b> – und die Wildkatzen halten <b>Abstand</b> davon. Dazwischen ist Wald – das Revier. Jede Grenze ist ein Perzeptron, der Ausgang fasst sie zusammen: <b>Das ist ein neuronales Netz.</b> <br><b>Schau genau hin:</b> Der Fluss ist leicht geschwungen, die Gerade deines Fluss-Perzeptrons nicht. Alle Kameras stimmen – aber stimmt die Karte überall?`;

  /* ── Schritt 3: Zu genau gelernt (Overfitting zum Anfassen) ── */
  function stepJahr(card) {
    const st = S.s4;
    const n = S.s3.done ? netOf(S.s3) : null;
    if (!n) { needNet(card, 'stadt', '„Ein Jahr später“', () => { S.s3 = MUSTER(); S.revealed = true; }); return; }
    if (!S.revealed) { S.revealed = true; S.covered = false; save(); paintCover(); }
    const outs = K.NOISY.filter(c => c.out), N = K.NOISY.length, T = K.TEST.length;
    /* das Netz mit k Merk-Neuronen: in einem kleinen Kreis um den Ausreißer gilt dessen Antwort */
    const judgeWith = list => p => { for (const i of list) { const o = outs[i]; if (Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) < BUBBLE) return o.soll; } return n.judge(p); };
    const acc = (cams, j) => cams.filter(c => j(c.p) === c.soll).length;
    const seqAll = () => st.mem.concat(outs.map((_, i) => i).filter(i => !st.mem.includes(i)));
    card.appendChild(h(`<p class="nn-lead-p">Jana hat <b>vier weitere Kameras</b> aufgestellt (umkreist). Drei stehen mitten im Revier – und haben <b>keine Katze</b> gesehen. Eine steht in der Stadt – und hat eine <b>Katze</b> gesehen! Dein Netz liegt bei allen vier falsch.
      <b>Kim</b> vom Forstamt sagt: <i>„Die Karte stimmt nicht mehr. Wir zeichnen sie neu, bis jede Kamera passt!“</i> Probier es aus: Jede dieser Kameras bekommt ein <b>Merk-Neuron</b> – ein winziges Zusatz-Neuron, das nur diesen einen Ort kennt.</p>`));
    const cmp = h('<div class="rv-cmp"></div>');
    const chips = h('<div class="rv-chips"></div>');
    const why = h('<p class="rv-why"></p>');
    const q = h(`<div class="rv-task rv-q" hidden><div class="rv-row on"><i>?</i><div><b>Und bei Kameras, die das Netz noch nie gesehen hat?</b><span>Ein Jahr später stellt Jana neue Kameras auf. Wird dein „perfektes“ Netz dort auch perfekt sein?</span>
      <span class="rv-yn big"><button type="button" data-c="gut">Ja, auch dort</button><button type="button" data-c="schlecht">Nein, schlechter</button></span></div></div></div>`);
    const test = h(`<div class="rv-task rv-test" hidden><div class="rv-row on"><i>!</i><div><b>Der Test</b><span>Jana stellt <b>${T} neue Kameras</b> auf – dort, wo noch keine stand. Das Revier ist dasselbe.</span>
      <span><button type="button" class="nn-btn primary rv-run">Neue Kameras aufstellen</button></span></div></div></div>`);
    const res = h('<p class="nn-task-msg rv-test-msg" hidden></p>');
    const curve = h('<div class="rv-curve" hidden></div>');
    const sum = h(`<div class="nn-summary rv-sum" hidden><b>Overfitting</b><ul>
      <li>Mit jedem Merk-Neuron wird das Netz bei den <b>alten Kameras</b> besser – am Ende ist es perfekt.</li>
      <li>Aber jedes Merk-Neuron hat nur einen <b>Einzelfall</b> auswendig gelernt. Bei <b>neuen Kameras</b> in der Nähe sagt es dasselbe – und liegt daneben.</li>
      <li>Das heißt <b>Overfitting</b> (Überanpassung): Das Netz lernt die Beispiele auswendig statt der Regel dahinter.</li>
      <li>Darum prüft man ein Netz immer mit <b>Testdaten</b>, die es beim Lernen nicht gesehen hat. Ein einfaches Netz ist oft das bessere.</li></ul></div>`);
    split(card, [cmp, chips, why, q, test, res, curve], [h(legend('das gewählte Netz'))]);
    card.querySelector('.rv-split').after(sum);
    const judge = () => st.view === 'mine' ? n.judge : judgeWith(st.mem);

    function drawCurve() {
      const seq = seqAll(), W = 320, H = 160, L = 38, R = 12, Tt = 28, B = 30;
      const NK = outs.length, ks = [...Array(NK + 1).keys()];
      const pts = cams => ks.map(k => acc(cams, judgeWith(seq.slice(0, k))) / cams.length);
      const a = pts(K.NOISY), b = pts(K.TEST);
      const lo = Math.floor(Math.min(...a, ...b) * 20) / 20 - 0.05, hi = 1;
      const X = k => L + k / NK * (W - L - R), Y = v => Tt + (1 - (v - lo) / (hi - lo)) * (H - Tt - B);
      const path = arr => arr.map((v, k) => (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
      const k = st.mem.length;
      curve.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Alte und neue Kameras je Anzahl der Merk-Neuronen">
        <line class="ax" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/><line class="ax" x1="${L}" y1="${Tt}" x2="${L}" y2="${H - B}"/>
        ${ks.map(i => `<text class="tk" x="${X(i)}" y="${H - B + 14}" text-anchor="middle">${i}</text>`).join('')}
        <text class="tk" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Anzahl Merk-Neuronen</text>
        <text class="tk" x="${L - 4}" y="${Y(1) + 4}" text-anchor="end">100 %</text><text class="tk" x="${L - 4}" y="${Y(lo) + 4}" text-anchor="end">${Math.round(lo * 100)} %</text>
        <path class="c-old" d="${path(a)}"/><path class="c-new" d="${path(b)}"/>
        ${[a, b].map((arr, j) => `<circle class="${j ? 'd-new' : 'd-old'}" cx="${X(k)}" cy="${Y(arr[k])}" r="5.5"/>`).join('')}
        <text class="lab c-old-t" x="${X(NK)}" y="${Y(a[NK]) - 7}" text-anchor="end">alte Kameras</text><text class="lab c-new-t" x="${X(NK)}" y="${Y(b[NK]) + 15}" text-anchor="end">neue Kameras</text></svg>`;
    }
    function paint() {
      const tested = st.tested, k = st.mem.length, jm = judgeWith(st.mem);
      const mineOk = acc(K.NOISY, n.judge), memOk = acc(K.NOISY, jm), mineT = acc(K.TEST, n.judge), memT = acc(K.TEST, jm);
      cmp.innerHTML = `<button type="button" class="rv-net-card${st.view === 'mine' ? ' on' : ''}" data-v="mine"><b>Dein Netz</b><span>${S.s3.hid.length} Perzeptrons + Ausgang</span>
          <span class="rv-big">${tested ? mineT : mineOk} / ${tested ? T : N}</span><span>${tested ? 'neue' : 'alte'} Kameras richtig</span></button>
        <button type="button" class="rv-net-card${st.view === 'mem' ? ' on' : ''}" data-v="mem"><b>Kims neue Karte</b><span>${k} Merk-${k === 1 ? 'Neuron' : 'Neuronen'}</span>
          <span class="rv-big">${tested ? memT : memOk} / ${tested ? T : N}</span><span>${tested ? 'neue' : 'alte'} Kameras richtig</span></button>`;
      cmp.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.v; save(); paint(); }));
      chips.innerHTML = '<span class="rv-camsel-t">Merk-Neuron für:</span>' + outs.map((o, i) => `<button type="button" class="rv-cam rv-oc${st.mem.includes(i) ? ' on' : ''}" data-i="${i}"><b>${i + 1}</b><span class="m">${pt(o.p)}</span>${st.mem.includes(i) ? '<i>✓</i>' : ''}</button>`).join('');
      chips.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => toggle(+b.dataset.i)));
      q.hidden = !(k >= 1) || !!st.choice || tested;
      test.hidden = !(k >= 1 && st.choice) || tested;
      res.hidden = sum.hidden = curve.hidden = !tested;
      why.hidden = tested;
      q.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === st.choice));
      if (tested) {
        res.className = 'nn-task-msg rv-test-msg' + (memT < mineT ? ' ok' : '');
        res.innerHTML = `Alte Kameras: mit ${k} Merk-Neuron${k === 1 ? '' : 'en'} <b>${memOk} von ${N}</b> (vorher ${mineOk}). Neue Kameras: nur noch <b>${memT} von ${T}</b> (dein Netz ohne Merk-Neuronen: ${mineT}). ${st.choice === 'schlecht' ? '<b>Gut eingeschätzt!</b>' : '<b>Überraschung!</b>'} Probier es aus: Nimm Merk-Neuronen weg oder dazu – die Punkte wandern auf den Kurven. Tippe auf „Kims neue Karte“: Wo hat sie Inseln gebaut?`;
        drawCurve();
      }
      const lg = card.querySelector('.rv-lg-gold em');
      if (lg) lg.textContent = st.view === 'mine' ? 'hier feuert dein Netz' : 'hier feuert dein Netz mit Merk-Neuronen';
      map.set({
        reveal: revealOf(),
        cams: tested ? K.TEST : K.NOISY.map(c => c.out ? Object.assign({}, c, { mark: true }) : c),
        judge: judge(), region: judge(),
        lines: [], rings: st.view === 'mem' ? st.mem.map(i => ({ p: outs[i].p, r: BUBBLE, color: css('in') })) : [],
        tapCam: tested ? null : p => { const i = outs.findIndex(o => eqP(o.p, p)); if (i >= 0) toggle(i); },
        pick: null,
      });
    }
    function toggle(i) {
      const at = st.mem.indexOf(i);
      if (at >= 0) st.mem.splice(at, 1); else st.mem.push(i);
      st.view = 'mem';
      const o = outs[i];
      why.innerHTML = `<b>Kamera ${pt(o.p)}:</b> ${o.out} ${st.mem.includes(i) ? 'Das Merk-Neuron sagt jetzt für den kleinen Kreis um sie herum ' + (o.soll ? '„Revier“' : '„kein Revier“') + '.' : 'Das Merk-Neuron ist wieder weg.'}`;
      if (!st.mem.length) { st.choice = null; st.tested = false; }
      save(); paint();
    }
    q.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { st.choice = b.dataset.c; save(); paint(); }));
    test.querySelector('.rv-run').addEventListener('click', () => { st.tested = true; save(); paint(); });
    why.innerHTML = 'Tippe auf der Karte eine <b>orange umkreiste</b> Kamera an (oder oben auf ihre Nummer): Was ist dort passiert – und bekommt sie ein Merk-Neuron?';
    paint();
  }

  /* ── Arbeitsblatt (Lehrkraft / allein) ─────────────────── */
  function printSheet() {
    const tmp = K.makeMap();
    tmp.el.style.cssText = 'position:fixed;left:-4000px;top:0;width:760px;height:640px';
    document.body.appendChild(tmp.el);
    tmp.el.querySelector('canvas').style.cssText = 'width:760px;height:640px';
    const de = document.documentElement, oldTheme = de.getAttribute('data-theme');
    de.setAttribute('data-theme', 'light');                        // Blatt immer hell
    tmp.set({ reveal: 0, cams: K.ALL.map(c => { const pr = PROBE.find(x => eqP(x.p, c.p)); return pr ? Object.assign({}, c, { label: pr.label }) : c; }) });
    const img1 = tmp.el.querySelector('canvas').toDataURL('image/png');
    tmp.set({ reveal: 1, cams: K.ALL, lines: ['fluss', 'strasse', 'stadt'].map((k, i) => ({ w: K.LINES[k].w, b: K.LINES[k].b, color: COLS[i], width: 2.6, num: String(i + 1) })), region: K.inRevier, judge: p => K.inRevier(p) ? 1 : 0 });
    tmp.draw();
    const img2 = tmp.el.querySelector('canvas').toDataURL('image/png');
    tmp.el.remove();
    if (oldTheme === null) de.removeAttribute('data-theme'); else de.setAttribute('data-theme', oldTheme);
    let box = document.getElementById('rv-print');
    if (!box) { box = document.createElement('div'); box.id = 'rv-print'; document.body.appendChild(box); }
    const line = (k) => `<tr><td>${k}</td><td></td><td></td><td></td><td></td></tr>`;
    box.innerHTML = `<section class="sheet">
      <header><b>NeuroLab</b><span>Name: ______________________ Datum: __________</span></header>
      <h1>Das Revier der Wildkatzen</h1>
      <p>Försterin Jana hat im Tal Wildtierkameras aufgestellt. <b>▲ = Kamera hat eine Wildkatze gesehen</b>, ○ = keine Katze.
      Ein Neuron bekommt zwei Eingänge: x₁ = km nach Osten, x₂ = km nach Norden. Es rechnet <b>z = x₁·w₁ + x₂·w₂ + b</b> und feuert („Revier“), wenn z &gt; 0 ist.</p>
      <img src="${img1}" alt="Karte mit Kameras">
      <h2>1 · Ein Neuron prüft Kameras</h2>
      <p>Janas Neuron: w₁ = 1, w₂ = 1, b = −8. Berechne z für die Kameras A (6|4), B (2|2) und C (4|4). Feuert das Neuron? Hat die Kamera wirklich eine Katze gesehen (▲)?</p>
      <table><tr><th>Kamera</th><th>Rechnung</th><th>z</th><th>feuert?</th><th>richtig?</th></tr>${['A', 'B', 'C'].map(line).join('')}</table>
      </section><section class="sheet">
      <h2>2 · Die Grenzen finden</h2>
      <p>Zeichne mit dem Lineal <b>drei Geraden</b> ein, die die Dreiecke von den Kreisen trennen (eine im Süden, eine im Nordwesten, eine im Nordosten).
      Wähle auf jeder Geraden zwei Gitterpunkte P und Q.</p>
      <p class="tip"><b>So geht's:</b> Gerade x₂ = m·x₁ + n mit m = (q₂ − p₂) : (q₁ − p₁). Liegt das Revier <b>oberhalb</b> der Geraden:
      w₁ = −m, w₂ = 1, b = −n. Liegt es <b>unterhalb</b>: w₁ = m, w₂ = −1, b = n (denn mit w₂ &gt; 0 wird z nach oben hin größer).</p>
      <table><tr><th>Perzeptron</th><th>P</th><th>Q</th><th>m und n</th><th>w₁ · w₂ · b</th></tr>${['1 (Süden)', '2 (Nordwesten)', '3 (Nordosten)'].map(line).join('')}</table>
      <h2>3 · Der Ausgang</h2>
      <p>Das Ausgangsneuron bekommt von jedem der drei Perzeptrons 0 oder 1, alle Gewichte sind 1. Es soll nur feuern, wenn <b>alle drei</b> 1 sagen.
      Welchen Bias b braucht es? Begründe mit einer Tabelle (Summe der Eingänge 0, 1, 2, 3).</p>
      <div class="lines"></div>
      <h2>4 · Zum Nachdenken</h2>
      <p>a) Der echte Fluss ist leicht geschwungen, deine Gerade nicht. Wo könnte sich dein Netz irren, obwohl alle Kameras stimmen?</p>
      <p>b) Drei neue Kameras im Revier sehen keine Katze, eine in der Stadt sieht eine. Kim will die Karte neu zeichnen, bis jede Kamera passt. Ist das eine gute Idee? Was passiert bei neuen Kameras?</p>
      <div class="lines"></div>
      </section><section class="sheet solution">
      <header><b>Lösung</b><span>(für die Lehrkraft)</span></header>
      <img src="${img2}" alt="Aufgelöste Karte">
      <p><b>1:</b> ${PROBE.map(pr => { const z = JANA.w[0] * pr.p[0] + JANA.w[1] * pr.p[1] + JANA.b, soll = K.ALL.find(c => eqP(c.p, pr.p)).soll; return `${pr.label}: z = ${pr.p[0]} + ${pr.p[1]} − 8 = ${num(z)} → ${z > 0 ? 'feuert' : 'feuert nicht' + (z === 0 ? ', denn 0 ist nicht größer als 0' : '')} (Kamera ${soll ? 'hat eine Katze gesehen' : 'hat keine Katze gesehen'} → ${fire(z) === soll ? 'richtig' : 'Janas Neuron irrt sich'})`; }).join(' · ')}.</p>
      <p><b>2</b> (eine mögliche Lösung): Fluss durch (0|3) und (12|4): x₂ = 1/12·x₁ + 3, Revier oberhalb → w₁ = −1/12, w₂ = 1, b = −3 ·
      Landstraße durch (0|2) und (3|6): x₂ = 4/3·x₁ + 2, Revier unterhalb → w₁ = 4/3, w₂ = −1, b = 2 ·
      Stadtrand durch (8|6) und (10|3): x₂ = −3/2·x₁ + 18, Revier unterhalb → w₁ = −3/2, w₂ = −1, b = 18. Andere Geraden sind richtig, wenn sie alle Kameras trennen.</p>
      <p><b>3:</b> Summe 3 → feuern, Summe 2 → nicht: −3 &lt; b ≤ −2, z. B. b = −2,5.</p>
      <p><b>4 a:</b> In dem schmalen Streifen zwischen Gerade und Fluss (dort stand keine Kamera). Ein Netz ist nur so gut wie seine Daten – mehr Kameras oder mehr Geraden würden helfen.<br>
      <b>4 b:</b> Nein – Overfitting: Die neue Karte hätte Zufälle und Messfehler (Akku leer, Busch, verlaufene Katze) auswendig gelernt und läge bei neuen Kameras in deren Nähe falsch.</p></section>`;
    document.documentElement.classList.add('rv-print-on');
    const done = () => { document.documentElement.classList.remove('rv-print-on'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
  }

  window.NLRevier = { render, reset() { S = fresh(); save(); } };
})();
