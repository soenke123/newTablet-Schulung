/* ══════════════════════════════════════════════════════════════
   NeuroLab · revier.js — „Das Revier der Wildkatzen“ (Kachel v-revier)
   ══════════════════════════════════════════════════════════════
   Bereich 2 „Vom Neuron zum Netz“ (21.11.2026, 2. Fassung am selben Abend:
   „soll zu Teil 1 passen und klarer sein“). Försterin Jana hat im Tal
   Wildtierkameras aufgestellt. Gesucht ist das Revier. Grundsatz (Sönke):
   NICHT ziehen und probieren, sondern rechnen und sehen, was wo zusammenhängt.

   Dieselben Bausteine wie „Wie arbeitet ein Neuron?“ (js/neuron.js):
   Neuron links (makeNeuron, nur ansehen), darunter die Rechnung in
   Formel-Schrift, Karte rechts; Gelb = hier feuert das Neuron, goldenes
   Dreieck = Katze gesehen (soll feuern), Kreis = keine Katze, oranges
   Fadenkreuz = Eingabe des Neurons. Pro Schritt nur EINE Aufgabe sichtbar.
     1 Kameras prüfen   Janas Neuron, z für A, B, C selbst ausrechnen
                        (Ergebnis im Neuron verdeckt, bis es stimmt)
     2 Der Fluss        ① zwei Gitterpunkte antippen ② w₁, w₂, b ausrechnen;
                        das Neuron füllt sich erst bei „Prüfen“
     3 Die Stadt        Netz-Bild: Eingänge → Perzeptrons (Nummer + Farbe = ihre
                        Gerade auf der Karte) → Ausgang; ＋ hineinziehen oder
                        antippen; EIN Neuron antippen = darunter bearbeiten,
                        auf der Karte nur seine Seite gelb; alles richtig →
                        die Karte deckt sich auf
     4 Ein Jahr später  Ausreißer · Dein Netz ↔ Kims Netz · neue Kameras →
                        Overfitting (Landschaft blass, damit die Punkte zählen)
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
  const JANA = { w: [1, 1], b: -8 };
  const PROBE = [{ label: 'A', p: [3, 2] }, { label: 'B', p: [4, 6] }, { label: 'C', p: [5, 3] }];
  const STEPS = [
    { id: 'pruefen', kurz: 'Kameras prüfen', title: 'Ein Neuron prüft Kameras' },
    { id: 'fluss', kurz: 'Der Fluss', title: 'Die erste Grenze: der Fluss' },
    { id: 'stadt', kurz: 'Die Stadt', title: 'Mehr Kameras – mehr Grenzen' },
    { id: 'jahr', kurz: 'Ein Jahr später', title: 'Welches Netz ist besser?' },
  ];

  /* ── Speicher ── */
  const mem = {};
  const store = {
    get(k) { if (DEMO) return mem[k] ?? null; try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { if (DEMO) { mem[k] = v; return; } try { localStorage.setItem(k, v); } catch (e) { /* egal */ } },
  };
  const fresh = () => ({
    step: 'pruefen',
    s1: { A: { z: '', f: null }, B: { z: '', f: null }, C: { z: '', f: null } },
    s2: { P: null, Q: null, w: ['', '', ''], checked: false, done: false },
    s3: { hid: [], out: { v: [], b: '' }, done: false, seen: false },
    revealed: false,
    s4: { view: 'mine', choice: null, tested: false },
  });
  let S = fresh();
  try { const x = JSON.parse(store.get('nl.revier') || 'null'); if (x && x.s1) S = Object.assign(fresh(), x); } catch (e) { /* egal */ }
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
  const same = (a, b) => Math.abs(a - b) < 1e-6;
  const zOf = (n, p) => n.w[0] * p[0] + n.w[1] * p[1] + n.b;
  const fire = z => z > 1e-9 ? 1 : 0;
  const neuronOf = f => { const v = f.map(parseNum); return v.every(x => x !== null) ? { w: [v[0], v[1]], b: v[2] } : null; };
  const pt = p => p ? `(${num(p[0])} | ${num(p[1])})` : '';
  const xs = (k, sub) => `<span class="xs"><i class="m">${k}</i><sub>${sub}</sub></span>`;
  const css = n => (window.NLTheme && NLTheme.var(n)) || '#888';
  const eqP = (a, b) => !!(a && b && a[0] === b[0] && a[1] === b[1]);
  const esc = v => String(v ?? '').replace(/"/g, '&quot;');

  /* Zahlenfeld in der Farbe der Größe (kein Regler, kein Ziehen) */
  const field = (key, val, cls, label) => `<label class="rv-f ${cls}"><span>${label}</span><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-f="${key}" value="${esc(val)}"></label>`;

  /* Das Modell für makeNeuron (js/neuron.js): Lage auf der Karte als Eingänge */
  const model = (n, x) => ({
    x: (x || [5, 5]).slice(), w: n ? n.w.slice() : [0, 0], b: n ? n.b : 0, type: 'perceptron',
    lim: { x1: [0, 12, 1, 1], x2: [0, 10, 1, 1], w: [-50, 50, 1, 0.5], b: [-99, 99, 1, 0.5] },
    caps: ['km nach Osten', 'km nach Norden'], ocap: 'Revier?', yes: 'Revier', no: 'kein Revier',
  });
  const NL = () => window.NLNeuron;
  const legend = who => `<p class="nw-legend rv-legend"><span><i class="lg-tri"></i>Katze gesehen</span><span><i class="lg-dot"></i>keine Katze</span><span class="rv-lg-gold"><i class="lg-gold"></i><em>hier feuert ${who}</em></span><span><i class="lg-ring"></i>liegt falsch</span></p>`;

  /* Netz aus Stufe 3 auswerten */
  function netOf(st) {
    const hid = st.hid.map(x => neuronOf(x.w));
    if (!hid.length || hid.some(x => !x)) return null;
    const v = st.out.v.slice(0, hid.length).map(parseNum), b = parseNum(st.out.b);
    if (v.length < hid.length || v.some(x => x === null) || b === null) return null;
    return { hid, v, b, judge: p => fire(hid.reduce((s, n, i) => s + v[i] * fire(zOf(n, p)), 0) + b) };
  }
  const MUSTER = () => ({
    hid: K.TRUTH.map((t, i) => ({ P: null, Q: null, w: [num(t.w[0]), num(t.w[1]), num(t.b)].map(x => x.replace('−', '-')), col: COLS[i] })),
    out: { v: ['1', '1', '1'], b: '-2,5' }, done: true, seen: true,
  });

  /* ── Seite ── */
  let page = null, api = null, map = null;
  function render(root, a) {
    page = root; api = a || {};
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
    map.set({ reveal: S.revealed ? 1 : 0 });
    ({ pruefen: stepPruefen, fluss: stepFluss, stadt: stepStadt, jahr: stepJahr })[S.step](card);
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
  function split(card, left, right) {
    const g = h('<div class="nw-split rv-split"><div class="nw-left"></div><div class="nw-right rv-right"></div></div>');
    g.children[0].append(...left);
    g.children[1].append(map.el, ...right);
    card.appendChild(g);
    return g;
  }
  const msgEl = () => h('<div class="nn-task-msg rv-result" hidden></div>');
  const setMsg = (el, html, ok) => { el.hidden = !html; el.className = 'nn-task-msg rv-result' + (ok ? ' ok' : ''); el.innerHTML = html || ''; };

  /* ── Schritt 1: Kameras prüfen ─────────────────────────── */
  function stepPruefen(card) {
    card.appendChild(h(`<p class="nn-lead-p">Försterin <b>Jana</b> hat im Tal <b>Wildtierkameras</b> aufgestellt. Ein <b class="t-y">goldenes Dreieck</b> heißt: Diese Kamera hat eine <b>Wildkatze</b> gesehen. Wo ist ihr <b>Revier</b>? Ein Neuron soll für jeden Ort entscheiden. Seine <b class="t-x">Eingänge</b> sind die Lage auf der Karte: ${xs('x', 1)} = km nach Osten, ${xs('x', 2)} = km nach Norden.</p>`));
    const done = l => !!S.s1[l].ok;
    const allDone = () => PROBE.every(pr => done(pr.label));
    let cur = (PROBE.find(pr => !done(pr.label)) || PROBE[0]).label;
    let at = PROBE.find(x => x.label === cur).p.slice();
    const m = model(JANA, at);
    const N = NL().makeNeuron(m, { fixed: true });
    N.setShow(4);
    const sel = h('<div class="rv-camsel"></div>');
    const calc = h('<div class="nw-calc m"></div>');
    const ctl = h('<div class="rv-ctl"></div>');
    const msg = msgEl();
    const tip = h('<p class="nn-try" hidden><b>Probier:</b> Tippe auf der Karte irgendeine Kamera an – das Neuron rechnet sie aus.</p>');
    split(card, [N.el, sel, calc, ctl], [h(legend('Janas Neuron')), msg, tip]);

    function paintSel() {
      sel.innerHTML = '<span class="rv-camsel-t">Rechne für die Kameras</span>' + PROBE.map(pr => `<button type="button" class="rv-cam${pr.label === cur ? ' on' : ''}${done(pr.label) ? ' ok' : ''}" data-l="${pr.label}"><b>${pr.label}</b><span class="m">${pt(pr.p)}</span>${done(pr.label) ? '<i>✓</i>' : ''}</button>`).join('');
      sel.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => { cur = b.dataset.l; at = PROBE.find(x => x.label === cur).p.slice(); paint(); }));
    }
    /* Die Rechnung wie in Teil 1 – nur das Ergebnis schreibt man selbst hinein */
    function askCalc(pr) {
      const st = S.s1[pr.label];
      const par = v => v < 0 ? `(${num(v)})` : num(v);
      const cell = (cls, top, bot) => `<span class="mc ${cls}"><span>${top}</span><span>${bot}</span></span>`;
      const op = s => `<span class="mc mo"><span>${s}</span><span>${s}</span></span>`;
      calc.innerHTML = `<div class="mrow">${[cell('c-z', '<i>z</i>', '<i>z</i>'), op('='), cell('c-x', '<i>x</i><sub>1</sub>', par(pr.p[0])), op('·'), cell('c-w', '<i>w</i><sub>1</sub>', par(JANA.w[0])), op('+'),
        cell('c-x', '<i>x</i><sub>2</sub>', par(pr.p[1])), op('·'), cell('c-w', '<i>w</i><sub>2</sub>', par(JANA.w[1])), op('+'), cell('c-b', '<i>b</i>', par(JANA.b)), op('='),
        `<span class="mc c-z"><span></span><span><input class="rv-zin" type="text" inputmode="decimal" autocomplete="off" aria-label="z" value="${esc(st.z)}"></span></span>`].join('')}</div>
        <div class="mrow rv-frow">${[cell('c-y', '<i>y</i>', '<i>y</i>'), op('='), cell('c-f', '<i>f</i>(<i>z</i>)', '<i>f</i>(<i>z</i>)'), op('=')].join('')}
        <span class="rv-yn" role="group"><button type="button" data-yn="1">1 · feuert</button><button type="button" data-yn="0">0 · feuert nicht</button></span></div>`;
      ctl.innerHTML = `<button type="button" class="nn-btn primary rv-chk">Prüfen</button><span class="rv-msg">Das Neuron feuert, wenn <i class="m">z</i> größer als 0 ist.</span>`;
      const inp = calc.querySelector('.rv-zin'), m2 = ctl.querySelector('.rv-msg');
      const showYN = () => calc.querySelectorAll('[data-yn]').forEach(b => b.classList.toggle('on', st.f !== null && +b.dataset.yn === st.f));
      inp.addEventListener('input', () => { st.z = inp.value; save(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ctl.querySelector('.rv-chk').click(); });
      calc.querySelectorAll('[data-yn]').forEach(b => b.addEventListener('click', () => { st.f = +b.dataset.yn; save(); showYN(); }));
      showYN();
      ctl.querySelector('.rv-chk').addEventListener('click', () => {
        const z = zOf(JANA, pr.p), v = parseNum(st.z);
        const bad = t => { m2.innerHTML = t; m2.className = 'rv-msg bad'; };
        if (v === null) return bad('Erst <i class="m">z</i> ausrechnen und eintragen.');
        if (!same(v, z)) return bad(`Rechne nochmal nach: ${num(pr.p[0])} · ${num(JANA.w[0])} + ${num(pr.p[1])} · ${num(JANA.w[1])} + (${num(JANA.b)}) = ?`);
        if (st.f === null) { m2.innerHTML = '<i class="m">z</i> stimmt! Feuert das Neuron?'; m2.className = 'rv-msg'; return; }
        if (st.f !== fire(z)) return bad(same(z, 0) ? '<i class="m">z</i> ist genau 0 – das ist <b>nicht größer</b> als 0.' : `<i class="m">z</i> = ${num(z)} – ist das größer als 0?`);
        st.ok = true; save();
        const next = PROBE.find(x => !done(x.label));
        if (next) { cur = next.label; at = next.p.slice(); }
        paint();
      });
    }
    function paint() {
      const all = allDone(), pr = PROBE.find(x => x.label === cur), open = !done(cur);
      paintSel();
      m.x = at.slice();
      N.setSecret(open);
      if (open) askCalc(pr);
      else { calc.innerHTML = NL().calcHTML(m, 4); ctl.innerHTML = ''; }
      ctl.hidden = !ctl.innerHTML;
      sel.hidden = all;
      tip.hidden = !all;
      map.set({
        cams: K.YEAR1.map(c => { const p = PROBE.find(x => eqP(x.p, c.p)); return p && !all ? Object.assign({}, c, { label: p.label }) : c; }),
        at,
        lines: all ? [{ w: JANA.w, b: JANA.b, color: css('ink') }] : [],
        region: all ? p => fire(zOf(JANA, p)) : null,
        judge: all ? p => fire(zOf(JANA, p)) : null,
        pick: all ? p => { if (K.YEAR1.some(c => eqP(c.p, p))) { at = p; paint(); } } : null,
      });
      if (all) {
        const ok = K.YEAR1.filter(c => fire(zOf(JANA, c.p)) === c.soll).length;
        setMsg(msg, `Alle Orte mit <i class="m">z</i> = 0 liegen auf <b>einer Geraden</b>. Gelb ist, wo Janas Neuron feuert. Es liegt bei <b>${ok} von ${K.YEAR1.length}</b> Kameras richtig – rot umkreist irrt es sich. Das geht besser: Im nächsten Schritt stellst du es selbst ein.`);
      } else setMsg(msg, '');
    }
    paint();
  }

  /* ── Schritt 2: Der Fluss ──────────────────────────────── */
  const RECIPE = `<details class="rv-recipe"><summary>Wie geht das? So wird aus einer Geraden ein Neuron</summary>
    <ol><li>Durch P und Q geht die Gerade <span class="m">x₂ = m · x₁ + n</span> – wie in Mathe. Steigung: <span class="m">m = (q₂ − p₂) : (q₁ − p₁)</span></li>
    <li>Auf der Geraden soll das Neuron <span class="m">z = 0</span> rechnen. Das klappt mit
      <b class="t-w">w₁ = −m</b>, <b class="t-w">w₂ = 1</b>, <b class="t-b">b = −n</b>, denn dann ist <span class="m">z = x₂ − (m·x₁ + n)</span>.</li>
    <li>Feuert das Neuron auf der falschen Seite? Dann <b>alle drei Zahlen mal −1</b>.</li>
    <li>Senkrechte Gerade (p₁ = q₁)? Dann <span class="m">w₁ = 1</span>, <span class="m">w₂ = 0</span>, <span class="m">b = −p₁</span>.</li></ol>
    <p>Brüche darfst du so eintippen: <span class="m">-1/2</span> oder <span class="m">-0,5</span>.</p></details>`;

  function stepFluss(card) {
    const st = S.s2;
    card.appendChild(h(`<p class="nn-lead-p">Im ersten Jahr stehen die Kameras nur in der Mitte des Tals. Irgendwo verläuft eine <b>Grenze</b>, über die keine Wildkatze geht. Stell selbst ein Neuron auf, das genau diese Grenze zieht – <b>nicht probieren, sondern rechnen</b>.</p>`));
    let at = [5, 5];
    const m = model(null, at);
    const N = NL().makeNeuron(m, { fixed: true });
    const task = h('<div class="rv-task"></div>');
    const calc = h('<div class="nw-calc m" hidden></div>');
    const msg = msgEl();
    const tip = h('<p class="nn-try" hidden><b>Probier:</b> Tippe Kameras an – das Neuron rechnet sie aus. Wo ist <i class="m">z</i> groß, wo fast 0?</p>');
    split(card, [N.el, task, calc], [h(legend('dein Neuron')), msg, tip]);
    const nOk = () => st.checked ? neuronOf(st.w) : null;

    function paintTask() {
      const pq = !!(st.P && st.Q);
      task.innerHTML = `<div class="rv-row${pq ? ' ok' : ' on'}"><i>1</i><div><b>Wo verläuft die Grenze?</b>
          ${pq ? `<span><span class="m rv-pq">P = ${pt(st.P)} · Q = ${pt(st.Q)}</span> <button type="button" class="rv-link rv-repick">neu wählen</button></span>`
            : `<span>Tippe auf der Karte zwei Gitterpunkte an, durch die deine Grenze geht – zwischen den Dreiecken und den Kreisen.</span>${st.P ? `<span class="m rv-pq">P = ${pt(st.P)} · jetzt Q antippen</span>` : ''}`}</div></div>
        <div class="rv-row${pq ? (st.done ? ' ok' : ' on') : ' off'}"><i>2</i><div><b>Rechne das Neuron aus</b>
          <div class="rv-fields">${field('w1', st.w[0], 'c-w', xs('w', 1) + ' =')}${field('w2', st.w[1], 'c-w', xs('w', 2) + ' =')}${field('b', st.w[2], 'c-b', '<i class="m">b</i> =')}
          <button type="button" class="nn-btn primary rv-check">Prüfen</button></div>${RECIPE}</div></div>`;
      const rp = task.querySelector('.rv-repick');
      if (rp) rp.addEventListener('click', () => { st.P = st.Q = null; st.checked = false; st.done = false; save(); paintTask(); paint(); });
      task.querySelectorAll('input').forEach((inp, i) => {
        inp.disabled = !pq;
        inp.addEventListener('input', () => { st.w[i] = inp.value; if (st.checked) { st.checked = false; save(); paint(); } else save(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
      });
      const cb = task.querySelector('.rv-check');
      cb.disabled = !pq;
      cb.addEventListener('click', check);
    }
    function check() { st.checked = true; save(); paint(); task.querySelector('.rv-row:last-child').className = 'rv-row ' + (st.done ? 'ok' : 'on'); }
    function paint() {
      const n = nOk();
      if (n) { m.w = n.w.slice(); m.b = n.b; }
      m.x = at.slice();
      N.setShow(n ? 4 : 1);
      N.setSecret(!n);
      calc.hidden = !n;
      if (n) calc.innerHTML = NL().calcHTML(m, 4);
      tip.hidden = !(n && st.done);
      map.set({
        cams: K.YEAR1,
        at: n ? at : null,
        pencil: [{ P: st.P, Q: st.Q, color: css('ink-soft') }],
        pick: !(st.P && st.Q)
          ? p => { if (!st.P) st.P = p; else if (!eqP(p, st.P)) st.Q = p; st.checked = false; save(); paintTask(); paint(); }
          : n ? p => { if (K.YEAR1.some(c => eqP(c.p, p))) { at = p; paint(); } } : null,
        lines: n ? [{ w: n.w, b: n.b, color: css('ink') }] : [],
        region: n ? p => fire(zOf(n, p)) : null,
        judge: n ? p => fire(zOf(n, p)) : null,
      });
      if (!st.checked) { setMsg(msg, ''); return; }
      if (!n) { setMsg(msg, 'Trag alle drei Zahlen ein.'); return; }
      const items = [];
      if (st.P && st.Q) {
        const onP = same(zOf(n, st.P), 0), onQ = same(zOf(n, st.Q), 0);
        items.push([onP && onQ, onP && onQ ? 'Die Gerade geht durch P und Q.' : `Die Gerade geht nicht durch ${!onP && !onQ ? 'P und Q' : !onP ? 'P' : 'Q'}: Dort ist z = ${num(zOf(n, !onP ? st.P : st.Q))}, nicht 0. Rechne nochmal nach.`]);
      }
      const ok = K.YEAR1.filter(c => fire(zOf(n, c.p)) === c.soll).length, all = ok === K.YEAR1.length;
      const goldOk = K.YEAR1.filter(c => c.soll && fire(zOf(n, c.p))).length;
      const flip = !all && goldOk === 0 && K.YEAR1.filter(c => !c.soll && !fire(zOf(n, c.p))).length === 0;
      if (flip) items.push([false, 'Die Gerade passt – aber das Neuron feuert auf der <b>falschen Seite</b>. Nimm alle drei Zahlen mal −1.']);
      items.push([all, `<b>${ok} von ${K.YEAR1.length}</b> Kameras richtig.${all || flip ? '' : ' Liegt deine Bleistiftlinie wirklich zwischen Dreiecken und Kreisen?'}`]);
      if (st.done !== all) { st.done = all; save(); }
      tip.hidden = !all;
      setMsg(msg, `<ul class="rv-checks">${items.map(([g, t]) => `<li class="${g ? 'good' : 'bad'}">${t}</li>`).join('')}</ul>` +
        (all ? '<p><b>Geschafft!</b> Dein Neuron hat die Grenze gefunden. Was dort wirklich ist, siehst du erst am Ende.</p>' : ''), all);
    }
    paintTask();
    paint();
  }

  /* ── Schritt 3: Die Stadt (Netz) ───────────────────────── */
  function stepStadt(card) {
    const st = S.s3;
    if (!st.seen) {
      st.seen = true;
      if (!st.hid.length && S.s2.done) st.hid.push({ P: S.s2.P, Q: S.s2.Q, w: S.s2.w.slice(), col: COLS[0] });
      save();
    }
    const flussN = S.s2.done ? neuronOf(S.s2.w) : null;
    const flussOk = flussN ? K.ALL.filter(c => fire(zOf(flussN, c.p)) === c.soll).length : null;
    card.appendChild(h(`<p class="nn-lead-p">Jana stellt jetzt <b>im ganzen Tal</b> Kameras auf. Im Westen und im Nordosten sieht keine mehr eine Katze – dort muss noch etwas sein.
      ${flussOk !== null ? `Dein Fluss-Neuron schafft nur noch <b>${flussOk} von ${K.ALL.length}</b>.` : ''} <b>Eine Gerade reicht nicht mehr – du baust ein Netz:</b> Jedes Perzeptron bringt seine eigene Gerade mit, der Ausgang fasst sie zusammen.</p>`));
    const net = h(`<div class="rv-net"><svg class="rv-edges"></svg>
      <div class="rv-col rv-cin"><span class="rv-inode">${xs('x', 1)}</span><span class="rv-inode">${xs('x', 2)}</span></div>
      <div class="rv-col rv-chid"></div><div class="rv-col rv-cout"></div></div>`);
    const edit = h('<div class="rv-edit"></div>');
    const msg = msgEl();
    const mu = h(`<p class="rv-muster"><button type="button" class="rv-link rv-lsg">Musterlösung laden</button></p>`);
    split(card, [net, edit, mu], [h(legend('das Netz')), msg]);
    const hidCol = net.querySelector('.rv-chid'), outCol = net.querySelector('.rv-cout'), svg = net.querySelector('.rv-edges');
    // Ausgewählt: Index eines Perzeptrons oder 'out'
    let sel = st.hid.findIndex(x => !neuronOf(x.w));
    if (sel < 0) sel = st.hid.length ? 'out' : -1;

    const glyph = '<svg viewBox="0 0 40 24" aria-hidden="true"><line x1="20" y1="3" x2="20" y2="21"/><text x="10" y="17" text-anchor="middle">Σ</text><path d="M24 17 H29 V7 H36"/></svg>';
    function build() {
      hidCol.innerHTML = '';
      st.hid.forEach((x, i) => {
        const ok = !!neuronOf(x.w);
        const b = h(`<button type="button" class="rv-hn${sel === i ? ' on' : ''}${ok ? '' : ' open'}" data-i="${i}" style="--c:${x.col}"><b>${i + 1}</b>${glyph}</button>`);
        b.addEventListener('click', () => { sel = i; build(); });
        hidCol.appendChild(b);
      });
      if (st.hid.length < MAX_HID) {
        const add = h('<button type="button" class="rv-hn rv-add" title="Perzeptron hineinziehen oder antippen"><b>＋</b><span>Perzeptron</span></button>');
        add.addEventListener('pointerdown', e => dragAdd(e, add));
        add.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addHid(); } });
        hidCol.appendChild(add);
      }
      outCol.innerHTML = '';
      if (st.hid.length) {
        const o = h(`<button type="button" class="rv-on${sel === 'out' ? ' on' : ''}">${glyph}<span>Ausgang</span></button>`);
        o.addEventListener('click', () => { sel = 'out'; build(); });
        outCol.appendChild(o);
      }
      buildEdit();
      requestAnimationFrame(edges);
      paint();
    }
    function buildEdit() {
      edit.innerHTML = '';
      if (!st.hid.length) { edit.appendChild(h('<p class="rv-hint">Tippe auf <b>＋ Perzeptron</b> oder zieh es ins Netz.</p>')); return; }
      if (sel === 'out') {
        edit.style.setProperty('--c', 'var(--gold)');
        edit.appendChild(h(`<div class="rv-ebox rv-ocard"><div class="rv-ehead"><b>Ausgang</b></div>
          <p>Er bekommt von jedem Perzeptron eine <b>1</b> („Revier“) oder eine <b>0</b>. Er soll nur feuern, wenn <b>alle</b> „Revier“ sagen. Welche Gewichte <i class="m">v</i> und welchen Bias <i class="m">b</i> braucht er?</p>
          <div class="rv-fields">${st.hid.map((x, i) => `<label class="rv-f c-w" style="--c:${x.col}"><span><i class="rv-dot"></i>${xs('v', i + 1)} =</span><input type="text" inputmode="decimal" autocomplete="off" data-v="${i}" value="${esc(st.out.v[i])}"></label>`).join('')}
          ${field('ob', st.out.b, 'c-b', '<i class="m">b</i> =')}</div>
          <details class="rv-recipe"><summary>Tipp</summary><p>Mit allen <i class="m">v</i> = 1 ist die Summe höchstens ${st.hid.length}. Der Bias muss so liegen, dass nur die volle Summe ${st.hid.length} über 0 kommt – ${st.hid.length - 1} aber nicht.</p></details></div>`));
        edit.querySelectorAll('[data-v]').forEach(inp => inp.addEventListener('input', () => { st.out.v[+inp.dataset.v] = inp.value; save(); paint(); }));
        edit.querySelector('[data-f="ob"]').addEventListener('input', e => { st.out.b = e.target.value; save(); paint(); });
        return;
      }
      const x = st.hid[sel]; if (!x) return;
      edit.style.setProperty('--c', x.col);
      const pq = x.P && x.Q;
      const box = h(`<div class="rv-ebox rv-hcard"><div class="rv-ehead"><span class="rv-num">${sel + 1}</span><b>Perzeptron ${sel + 1}</b><button type="button" class="rv-link rv-del">entfernen</button></div>
        <p class="rv-pqline">${pq ? `<span class="m rv-pq">P = ${pt(x.P)} · Q = ${pt(x.Q)}</span> <button type="button" class="rv-link rv-repick">neu wählen</button>`
          : `Tippe auf der Karte zwei Gitterpunkte für seine Gerade an. <span class="m rv-pq">${x.P ? `P = ${pt(x.P)} · jetzt Q` : ''}</span>`}</p>
        <div class="rv-fields">${field('w1', x.w[0], 'c-w', xs('w', 1) + ' =')}${field('w2', x.w[1], 'c-w', xs('w', 2) + ' =')}${field('b', x.w[2], 'c-b', '<i class="m">b</i> =')}</div>
        ${RECIPE}</div>`);
      box.querySelector('.rv-del').addEventListener('click', () => { st.hid.splice(sel, 1); st.out.v.splice(sel, 1); sel = st.hid.length ? Math.min(sel, st.hid.length - 1) : -1; save(); build(); });
      const rp = box.querySelector('.rv-repick');
      if (rp) rp.addEventListener('click', () => { x.P = x.Q = null; save(); buildEdit(); paint(); });
      box.querySelectorAll('input').forEach((inp, k) => inp.addEventListener('input', () => {
        x.w[k] = inp.value; save();
        const b = hidCol.querySelector(`[data-i="${sel}"]`); if (b) b.classList.toggle('open', !neuronOf(x.w));
        paint();
      }));
      edit.appendChild(box);
    }
    function addHid() {
      if (st.hid.length >= MAX_HID) return;
      const used = st.hid.map(x => x.col), col = COLS.find(c => !used.includes(c)) || COLS[st.hid.length % COLS.length];
      st.hid.push({ P: null, Q: null, w: ['', '', ''], col });
      sel = st.hid.length - 1;
      save(); build();
    }
    function edges() {
      if (!net.isConnected) return;
      const r = net.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      svg.innerHTML = '';
      const ins = [...net.querySelectorAll('.rv-inode')].map(e => e.getBoundingClientRect());
      const hs = [...hidCol.querySelectorAll('.rv-hn:not(.rv-add)')], o = outCol.querySelector('.rv-on');
      const line = (a, b, col, on) => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', a[0] - r.left); l.setAttribute('y1', a[1] - r.top); l.setAttribute('x2', b[0] - r.left); l.setAttribute('y2', b[1] - r.top);
        l.setAttribute('style', `stroke:${col}`); if (on) l.setAttribute('class', 'on'); svg.appendChild(l); };
      hs.forEach((hc, i) => {
        const b = hc.getBoundingClientRect(), col = hc.style.getPropertyValue('--c');
        ins.forEach(a => line([a.right, a.top + a.height / 2], [b.left, b.top + b.height / 2], col, sel === i));
        if (o) { const ob = o.getBoundingClientRect(); line([b.right, b.top + b.height / 2], [ob.left, ob.top + ob.height / 2], col, sel === 'out'); }
      });
    }
    function paint() {
      const ns = st.hid.map(x => neuronOf(x.w));
      const n = netOf(st), cur = typeof sel === 'number' ? st.hid[sel] : null, curN = cur ? ns[sel] : null;
      const picking = !!cur && !(cur.P && cur.Q);
      map.set({
        cams: K.ALL,
        pencil: cur ? [{ P: cur.P, Q: cur.Q, color: cur.col }] : [],
        pick: picking ? p => {
          if (!cur.P) cur.P = p; else if (!eqP(p, cur.P)) cur.Q = p;
          save(); buildEdit(); paint();
        } : null,
        pickColor: cur ? cur.col : null,
        lines: ns.map((m, i) => m && { w: m.w, b: m.b, color: st.hid[i].col, num: String(i + 1), shift: i * 0.11, width: sel === i ? 4.4 : 2.6, faint: !!cur && sel !== i }).filter(Boolean),
        region: cur ? (curN ? p => fire(zOf(curN, p)) : null) : (n ? n.judge : null),
        judge: n && !cur ? n.judge : null,
      });
      mu.hidden = st.done;
      const lg = card.querySelector('.rv-lg-gold em');
      if (lg) lg.textContent = cur ? `hier feuert Perzeptron ${sel + 1}` : 'hier feuert das Netz';
      if (!st.hid.length) { setMsg(msg, ''); return; }
      const miss = ns.findIndex(m => !m);
      if (miss >= 0) { setMsg(msg, `Perzeptron ${miss + 1}: Punkte wählen und ${xs('w', 1)}, ${xs('w', 2)}, <i class="m">b</i> ausrechnen – dann erscheint seine Gerade.`); return; }
      if (!n) { setMsg(msg, 'Alle Geraden stehen. Tippe im Netz auf den <b>Ausgang</b> und stell ihn ein.'); return; }
      const ok = K.ALL.filter(c => n.judge(c.p) === c.soll).length, all = ok === K.ALL.length;
      if (st.done !== all) { st.done = all; save(); mu.hidden = all; }
      if (!all) { setMsg(msg, `<b>${ok} von ${K.ALL.length}</b> Kameras richtig.${cur ? ' Tippe auf den Ausgang, um das ganze Netz zu sehen.' : ' Rot umkreist liegt das Netz falsch.'}`); return; }
      setMsg(msg, `<p><b>${ok} von ${K.ALL.length} Kameras richtig – das Revier ist gefunden!</b></p>`, true);
      if (!S.revealed) {
        S.revealed = true; save();
        msg.insertAdjacentHTML('beforeend', '<p class="rv-reveal-msg">Die Karte deckt sich auf …</p>');
        map.reveal(() => { const r = msg.querySelector('.rv-reveal-msg'); if (r) r.innerHTML = revealText(); });
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
    new ResizeObserver(() => edges()).observe(net);
    mu.querySelector('.rv-lsg').addEventListener('click', () => { if (!confirm('Dein Netz durch die Musterlösung ersetzen?')) return; S.s3 = MUSTER(); save(); render(page, api); });
    build();
  }
  const revealText = () => `<b>Jetzt siehst du die Landschaft:</b> Im Süden fließt der <b>Fluss</b>, im Westen führt die <b>Landstraße</b> vorbei, im Nordosten liegt die <b>Stadt</b>. Dazwischen ist Wald – das Revier. Jede Grenze ist ein Perzeptron, der Ausgang fasst sie zusammen: <b>Das ist ein neuronales Netz.</b>`;

  /* ── Schritt 4: Ein Jahr später (Overfitting) ──────────── */
  function stepJahr(card) {
    const st = S.s4;
    const n = S.s3.done ? netOf(S.s3) : null;
    if (!n) {
      card.appendChild(h(`<div class="rv-need"><p>Hier geht es mit deinem Netz aus <b>„Die Stadt“</b> weiter – das ist noch nicht fertig.</p>
        <p><button type="button" class="nn-btn rv-go3">‹ Zur Stadt</button> <button type="button" class="nn-btn rv-lsg">Mit der Musterlösung weitermachen</button></p></div>`));
      card.querySelector('.rv-go3').onclick = () => go('stadt');
      card.querySelector('.rv-lsg').onclick = () => { S.s3 = MUSTER(); S.revealed = true; save(); render(page, api); };
      return;
    }
    if (!S.revealed) { S.revealed = true; save(); }
    const N = K.NOISY.length, T = K.TEST.length;
    const mineOk = K.NOISY.filter(c => n.judge(c.p) === c.soll).length;
    const mineT = K.TEST.filter(c => n.judge(c.p) === c.soll).length, kimT = K.TEST.filter(c => K.kim(c.p) === c.soll).length;
    card.appendChild(h(`<p class="nn-lead-p">Jana hat alle Bilder noch einmal durchgesehen. Fünf Kameras passen nicht ins Bild – <b>Ausreißer</b> (orange umkreist). Ihr Kollege <b>Kim</b> hat ein riesiges Netz mit 40 Neuronen lange trainiert. Es liegt bei <b>allen</b> Kameras richtig, auch bei den Ausreißern.</p>`));
    const cmp = h('<div class="rv-cmp"></div>');
    const why = h('<p class="rv-why"></p>');
    const q = h(`<div class="rv-task"><div class="rv-row on"><i>?</i><div><b>Welches Netz würdest du Jana geben?</b>
      <span class="rv-yn big"><button type="button" data-c="mine">Mein Netz</button><button type="button" data-c="kim">Kims Netz</button></span></div></div></div>`);
    const test = h(`<div class="rv-task rv-test" hidden><div class="rv-row on"><i>!</i><div><b>Der Test</b><span>Ein Jahr später stellt Jana <b>${T} neue Kameras</b> auf – dort, wo noch keine stand. Das Revier ist dasselbe. Welches Netz liegt bei Kameras richtig, die es noch nie gesehen hat?</span>
      <span><button type="button" class="nn-btn primary rv-run">Neue Kameras aufstellen</button></span></div></div></div>`);
    const res = h('<p class="nn-task-msg rv-test-msg" hidden></p>');
    const sum = h(`<div class="nn-summary rv-sum" hidden><b>Overfitting</b><ul>
      <li>Kims Netz hat sich <b>jede einzelne Kamera gemerkt</b> – auch die Ausreißer. Bei den Trainingsdaten ist es perfekt.</li>
      <li>Bei <b>neuen Daten</b> liegt es daneben: Um jeden Ausreißer hat es eine kleine Insel gebaut, die es in Wirklichkeit nicht gibt.</li>
      <li>Das heißt <b>Overfitting</b> (Überanpassung): Ein Netz lernt die Trainingsdaten auswendig statt der Regel dahinter.</li>
      <li>Darum prüft man ein Netz immer mit <b>Testdaten</b>, die es beim Lernen nicht gesehen hat. Ein einfaches Netz ist oft das bessere.</li></ul></div>`);
    split(card, [cmp, why, q, test, res], [h(legend('das gewählte Netz'))]);
    card.querySelector('.rv-split').after(sum);
    const judge = () => st.view === 'kim' ? K.kim : n.judge;
    function paint() {
      const tested = st.tested;
      cmp.innerHTML = `<button type="button" class="rv-net-card${st.view === 'mine' ? ' on' : ''}" data-v="mine"><b>Dein Netz</b><span>${S.s3.hid.length} Perzeptrons + Ausgang</span>
          <span class="rv-big">${tested ? mineT : mineOk} / ${tested ? T : N}</span><span>${tested ? 'neue' : 'alte'} Kameras richtig</span></button>
        <button type="button" class="rv-net-card${st.view === 'kim' ? ' on' : ''}" data-v="kim"><b>Kims Netz</b><span>40 Neuronen, lange trainiert</span>
          <span class="rv-big">${tested ? kimT : N} / ${tested ? T : N}</span><span>${tested ? 'neue' : 'alte'} Kameras richtig</span></button>`;
      cmp.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.v; save(); paint(); }));
      q.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === st.choice));
      test.hidden = !st.choice || tested;
      res.hidden = sum.hidden = !tested;
      why.hidden = tested;
      if (tested) {
        res.className = 'nn-task-msg rv-test-msg' + (mineT > kimT ? ' ok' : '');
        res.innerHTML = `Bei den neuen Kameras: dein Netz <b>${mineT} von ${T}</b>, Kims Netz <b>${kimT} von ${T}</b>. ${st.choice === 'mine' ? '<b>Gut eingeschätzt!</b>' : '<b>Überraschung!</b>'} Tippe oben auf „Kims Netz“: Wo hat es Inseln gebaut?`;
      }
      const lg = card.querySelector('.rv-lg-gold em');
      if (lg) lg.textContent = st.view === 'kim' ? 'hier feuert Kims Netz' : 'hier feuert dein Netz';
      map.set({
        reveal: 0.45,
        cams: tested ? K.TEST : K.NOISY.map(c => c.out ? Object.assign({}, c, { mark: true }) : c),
        judge: judge(), region: judge(),
        lines: st.view === 'mine' ? n.hid.map((m, i) => ({ w: m.w, b: m.b, color: S.s3.hid[i].col, width: 2, faint: true })) : [],
        pick: tested ? null : p => {
          const c = K.NOISY.find(x => x.out && eqP(x.p, p));
          if (c) why.innerHTML = `<b>Kamera ${pt(c.p)}:</b> ${c.out}`;
        },
        pickColor: css('in'),
      });
    }
    q.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { st.choice = b.dataset.c; save(); paint(); }));
    test.querySelector('.rv-run').addEventListener('click', () => { st.tested = true; save(); paint(); });
    why.innerHTML = 'Tippe auf der Karte eine <b>orange umkreiste</b> Kamera an: Was ist dort passiert?';
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
    tmp.set({ reveal: 1, lines: K.TRUTH.map((t, i) => ({ w: t.w, b: t.b, color: COLS[i], width: 2.6, num: String(i + 1) })), region: K.inRevier, judge: p => K.inRevier(p) ? 1 : 0 });
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
      <p>Janas Neuron: w₁ = 1, w₂ = 1, b = −8. Berechne z für die Kameras A (3|2), B (4|6) und C (5|3). Feuert das Neuron?</p>
      <table><tr><th>Kamera</th><th>Rechnung</th><th>z</th><th>feuert?</th><th>richtig?</th></tr>${['A', 'B', 'C'].map(line).join('')}</table>
      </section><section class="sheet">
      <h2>2 · Die Grenzen finden</h2>
      <p>Zeichne mit dem Lineal <b>drei Geraden</b> ein, die die Dreiecke von den Kreisen trennen (eine im Süden, eine im Westen, eine im Nordosten).
      Wähle auf jeder Geraden zwei Gitterpunkte P und Q.</p>
      <p class="tip"><b>So geht's:</b> Gerade x₂ = m·x₁ + n mit m = (q₂ − p₂) : (q₁ − p₁). Dann ist w₁ = −m, w₂ = 1, b = −n.
      Prüfe ein Dreieck: Ist dort z &gt; 0? Wenn nicht, alle drei Zahlen mal −1.</p>
      <table><tr><th>Perzeptron</th><th>P</th><th>Q</th><th>m und n</th><th>w₁ · w₂ · b</th></tr>${['1 (Süden)', '2 (Westen)', '3 (Nordosten)'].map(line).join('')}</table>
      <h2>3 · Der Ausgang</h2>
      <p>Das Ausgangsneuron bekommt von jedem der drei Perzeptrons 0 oder 1, alle Gewichte sind 1. Es soll nur feuern, wenn <b>alle drei</b> 1 sagen.
      Welchen Bias b braucht es? Begründe mit einer Tabelle (Summe der Eingänge 0, 1, 2, 3).</p>
      <div class="lines"></div>
      <h2>4 · Zum Nachdenken</h2>
      <p>Ein anderes Netz liegt bei allen Kameras richtig, auch bei einer Katze, die einmal durch den Fluss geschwommen ist. Ist es deshalb besser? Was passiert bei neuen Kameras?</p>
      <div class="lines"></div>
      </section><section class="sheet solution">
      <header><b>Lösung</b><span>(für die Lehrkraft)</span></header>
      <img src="${img2}" alt="Aufgelöste Karte">
      <p><b>1:</b> A: z = 3 + 2 − 8 = −3 → feuert nicht (richtig) · B: z = 4 + 6 − 8 = 2 → feuert (richtig) · C: z = 5 + 3 − 8 = 0 → feuert nicht, denn 0 ist nicht größer als 0 (richtig).</p>
      <p><b>2</b> (eine mögliche Lösung): Fluss x₂ = ½x₁ + 2 → w₁ = −0,5, w₂ = 1, b = −2 · Landstraße x₂ = 3x₁ − 3 → w₁ = −3, w₂ = 1, b = 3, feuert auf der falschen Seite → w₁ = 3, w₂ = −1, b = −3 ·
      Stadtrand x₂ = −x₁ + 15 → w₁ = 1, w₂ = 1, b = −15, falsche Seite → w₁ = −1, w₂ = −1, b = 15. Andere Geraden sind richtig, wenn sie alle Kameras trennen.</p>
      <p><b>3:</b> Summe 3 → feuern, Summe 2 → nicht: −3 &lt; b ≤ −2, z. B. b = −2,5.</p>
      <p><b>4:</b> Overfitting – das Netz hat die Ausreißer auswendig gelernt und liegt bei neuen Kameras in deren Nähe falsch.</p></section>`;
    document.documentElement.classList.add('rv-print-on');
    const done = () => { document.documentElement.classList.remove('rv-print-on'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
  }

  window.NLRevier = { render, reset() { S = fresh(); save(); } };
})();
