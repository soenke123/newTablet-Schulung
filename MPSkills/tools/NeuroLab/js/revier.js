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
  const VERSION = 6;                                 // 6: weniger Kameras, Schritt 3 „Das Netz fragen“ (24.11.2026)
  /* nur fürs Arbeitsblatt: Janas Neuron und drei Kameras zum Nachrechnen */
  const JANA = { w: [1, 1], b: -8 };
  const PROBE = [{ label: 'A', p: [6, 4] }, { label: 'B', p: [5, 2] }, { label: 'C', p: [2, 4] }];
  /* Hilfe-Beispiel: Gerade durch (2|6) und (6|2) */
  const EX = { P: [2, 6], Q: [6, 2], w: [1, 1], b: -8 };
  const DEF_PQ = [[[1, 3], [11, 8]], [[1, 2], [3, 8]], [[6, 10], [12, 4]], [[0, 5], [12, 5]], [[4, 0], [4, 10]], [[0, 0], [12, 10]]];
  const STEPS = [
    { id: 'fluss', kurz: 'Der Fluss', title: 'Die erste Grenze: der Fluss' },
    { id: 'stadt', kurz: 'Ein Jahr später', title: 'Ein Jahr später: mehr Kameras, mehr Grenzen' },
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
    card.appendChild(lead(`Försterin <b>Jana</b> hat im Tal <b>Wildtierkameras</b> aufgestellt. Ein <b class="t-y">goldenes Dreieck</b> heißt: Diese Kamera hat eine <b>Wildkatze</b> gesehen. Ein Neuron soll für jeden Ort entscheiden: Revier oder nicht? Seine <b class="t-x">Eingänge</b> sind die Lage auf der Karte: ${xs('x', 1)} = km nach Osten, ${xs('x', 2)} = km nach Norden.
      Im Süden sieht keine Kamera eine Katze – hier verläuft eine <b>Grenze</b>. Du ziehst sie ein und <b>rechnest</b> sie dann in ein Neuron um.`));
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
    card.appendChild(lead(`Dein Netz kennt jetzt das Revier – aber nur an <b>${K.ALL.length} Kameras</b>. Dafür baut man ein Netz: Es soll auch dort antworten, wo <b>keine Kamera</b> hängt.
      Bei Jana gehen <b>Pläne</b> ein. Frag für jeden dein Netz: Liegt der Ort im Revier der Wildkatzen?`));
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
      <p>Janas Neuron: w₁ = 1, w₂ = 1, b = −8. Berechne z für die Kameras A (6|4), B (5|2) und C (2|4). Feuert das Neuron? Hat die Kamera wirklich eine Katze gesehen (▲)?</p>
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
      <p>b) Die Gemeinde will bei (6|8) Häuser bauen, der Angelverein bei (6|3,25) einen Grillplatz anlegen. Dort hängt keine Kamera. Was sagt dein Netz? Bei welchem Ort bist du dir unsicher – und warum?</p>
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
      <b>4 b:</b> Baugebiet (6|8): alle drei Perzeptrons 1 → Revier, nicht bauen. Grillplatz (6|3,25): mit der Musterlösung z = −1/12·6 + 3,25 − 3 = −0,25 → kein Revier. Unsicher, denn er liegt dicht an der Grenze und dort stand keine Kamera – auf der Karte liegt er tatsächlich im Revier.</p></section>`;
    document.documentElement.classList.add('rv-print-on');
    const done = () => { document.documentElement.classList.remove('rv-print-on'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
  }

  window.NLRevier = { render, reset() { S = fresh(); save(); } };
})();
