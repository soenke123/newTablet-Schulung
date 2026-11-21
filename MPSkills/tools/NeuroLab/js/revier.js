/* ══════════════════════════════════════════════════════════════
   NeuroLab · revier.js — „Das Revier der Wildkatzen“ (Kachel v-revier)
   ══════════════════════════════════════════════════════════════
   Bereich 2 „Vom Neuron zum Netz“ (21.11.2026). Försterin Jana hat im Tal
   Wildtierkameras aufgestellt; goldene Kameras haben eine Wildkatze
   gesehen. Gesucht ist das Revier. Grundsatz (Sönke): NICHT ziehen und
   probieren, sondern rechnen und sehen, was wo zusammenhängt:
     1 Kameras prüfen   ein fertiges Neuron, z für drei Kameras selbst ausrechnen
     2 Der Fluss        zwei Gitterpunkte antippen (Bleistiftlinie), daraus
                        w₁, w₂, b berechnen, erst bei „Prüfen“ erscheint die Gerade
     3 Die Stadt        Perzeptrons hineinziehen → jedes bringt seine Gerade mit;
                        Gewichte nur als Zahlen änderbar; Ausgangsneuron zählt
                        die Geraden („alle drei sagen Revier“). Fertig = die
                        Karte wird aufgelöst (Fluss, Stadt, Landstraße, Wald)
     4 Ein Jahr später  Ausreißer in den Daten · Kims großes Netz liegt bei allen
                        Kameras richtig · neue Kameras → Overfitting
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
    { id: 'jahr', kurz: 'Ein Jahr später', title: 'Ein Jahr später: Welches Netz ist besser?' },
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

  /* Zahlenfeld (kein Regler, kein Ziehen) */
  const field = (key, val, cls, label) => `<label class="rv-f ${cls}"><span>${label}</span><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-f="${key}" value="${String(val ?? '').replace(/"/g, '&quot;')}"></label>`;

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
    const head = h(`<div class="rv-top"><nav class="nn-steps"></nav>${STUDENT ? '' : '<button type="button" class="nn-btn rv-sheet-btn" title="Arbeitsblatt mit derselben Karte drucken">Arbeitsblatt</button>'}</div>`);
    STEPS.forEach((s, i) => {
      const b = h(`<button type="button" class="nn-step${s.id === S.step ? ' on' : ''}" data-step="${s.id}"><i>${i + 1}</i>${s.kurz}</button>`);
      b.addEventListener('click', () => go(s.id));
      head.querySelector('nav').appendChild(b);
    });
    const sb = head.querySelector('.rv-sheet-btn');
    if (sb) sb.addEventListener('click', printSheet);
    root.appendChild(head);
    const i = STEPS.findIndex(s => s.id === S.step), St = STEPS[i];
    const card = h(`<section class="nn-card nn-stepcard rv-card"><p class="nn-kicker">Das Revier der Wildkatzen · Schritt ${i + 1} von ${STEPS.length}</p><h2>${St.title}</h2></section>`);
    root.appendChild(card);
    map = K.makeMap();
    map.set({ reveal: S.revealed ? 1 : 0 });
    ({ pruefen: stepPruefen, fluss: stepFluss, stadt: stepStadt, jahr: stepJahr })[S.step](card);
    const foot = h('<div class="nn-foot"></div>');
    if (i > 0) { const b = h(`<button type="button" class="nn-btn">‹ ${STEPS[i - 1].kurz}</button>`); b.onclick = () => go(STEPS[i - 1].id); foot.appendChild(b); }
    foot.appendChild(h('<span></span>'));
    if (i < STEPS.length - 1) { const b = h(`<button type="button" class="nn-btn primary rv-next">${STEPS[i + 1].kurz} ›</button>`); b.onclick = () => go(STEPS[i + 1].id); foot.appendChild(b); }
    card.appendChild(foot);
  }
  function go(id) { S.step = id; save(); render(page, api); page.scrollTop = 0; }

  function split(card, left) {
    const g = h('<div class="rv-split"><div class="rv-left"></div><div class="rv-right"></div></div>');
    g.children[0].append(...left);
    g.children[1].appendChild(map.el);
    g.children[1].appendChild(h(`<p class="rv-legend"><span><i class="lg-cam on"></i>Kamera hat eine Wildkatze gesehen</span><span><i class="lg-cam"></i>keine Katze</span>${S.step === 'jahr' ? '<span><i class="lg-cam test"></i>neue Kamera</span>' : ''}<span><i class="lg-ring"></i>Netz liegt falsch</span></p>`));
    card.appendChild(g);
    return g;
  }

  /* Ein Neuron als Bild: zwei Eingänge, Gewichte an den Leitungen, Σ | f, Bias */
  function neuronPic(n, o = {}) {
    const w = n ? n.w.map(num) : ['?', '?'], b = n ? num(n.b) : '?';
    return `<div class="rv-npic" style="--c:${o.color || 'var(--accent)'}">
      <svg viewBox="0 0 320 120" aria-hidden="true">
        <line x1="62" y1="30" x2="170" y2="54"/><line x1="62" y1="90" x2="170" y2="66"/>
        <rect x="170" y="34" width="86" height="52" rx="12"/><line x1="206" y1="34" x2="206" y2="86" class="sep"/>
        <path d="M216 72 H230 V48 H246" class="st"/><line x1="213" y1="96" x2="213" y2="88" class="bl"/><line x1="256" y1="60" x2="296" y2="60" class="ow"/>
      </svg>
      <span class="rv-in" style="left:2%;top:14%">${xs('x', 1)}<small>Osten</small></span>
      <span class="rv-in" style="left:2%;top:64%">${xs('x', 2)}<small>Norden</small></span>
      <span class="rv-w" style="left:31%;top:22%">${xs('w', 1)} = <b>${w[0]}</b></span>
      <span class="rv-w" style="left:31%;top:68%">${xs('w', 2)} = <b>${w[1]}</b></span>
      <span class="rv-sig" style="left:55%;top:36%">Σ</span>
      <span class="rv-b" style="left:59%;top:83%"><i class="m">b</i> = <b>${b}</b></span>
      <span class="rv-o" style="left:88%;top:36%">${o.out || 'Revier?'}</span>
    </div>`;
  }

  /* ── Schritt 1: Kameras prüfen ─────────────────────────── */
  function stepPruefen(card) {
    const intro = h(`<p class="nn-lead-p">Försterin <b>Jana</b> hat im Tal <b>Wildtierkameras</b> aufgestellt. <b class="t-y">Goldene</b> Kameras haben eine <b>Wildkatze</b> gesehen, graue nicht. Wo ist das <b>Revier</b> der Wildkatzen?
      Ein Neuron soll für jeden Ort entscheiden: Revier (feuert) oder nicht. Seine zwei Eingänge sind die Lage auf der Karte: ${xs('x', 1)} = Kilometer nach <b>Osten</b>, ${xs('x', 2)} = Kilometer nach <b>Norden</b>.</p>`);
    const pic = h(neuronPic(JANA, { color: 'var(--ink-soft)' }));
    const task = h(`<div class="rv-task"><p><b>Jana hat das Neuron schon eingestellt.</b> Rechne für die Kameras A, B und C selbst aus, was es sagt: <span class="m">z = x₁·w₁ + x₂·w₂ + b</span>. Das Neuron feuert, wenn <i class="m">z</i> größer als 0 ist.</p><div class="rv-probes"></div></div>`);
    const box = task.querySelector('.rv-probes');
    const result = h('<div class="rv-result" hidden></div>');
    const doneAll = () => PROBE.every(pr => S.s1[pr.label].ok);
    function paint() {
      const all = doneAll();
      map.set({
        cams: K.YEAR1.map(c => { const pr = PROBE.find(x => same(x.p[0], c.p[0]) && same(x.p[1], c.p[1])); return Object.assign({}, c, pr ? { label: pr.label, mark: !S.s1[pr.label].ok } : {}); }),
        lines: all ? [{ w: JANA.w, b: JANA.b, color: css('ink-soft'), tag: 'z > 0' }] : [],
        region: all ? p => fire(zOf(JANA, p)) : null,
        judge: all ? p => fire(zOf(JANA, p)) : null,
      });
      result.hidden = !all;
      if (all) {
        const ok = K.YEAR1.filter(c => fire(zOf(JANA, c.p)) === c.soll).length;
        result.innerHTML = `<p><b>Alle Orte, an denen z genau 0 ist, liegen auf einer Geraden.</b> Auf der einen Seite feuert das Neuron (gold), auf der anderen nicht. Der Pfeil zeigt zur feuernden Seite.</p>
          <p class="rv-score">Janas Neuron liegt bei <b>${ok} von ${K.YEAR1.length}</b> Kameras richtig. Rot umkreist: Da irrt es sich.</p>
          <p>Das geht besser. Im nächsten Schritt stellst du das Neuron selbst ein.</p>`;
      }
    }
    PROBE.forEach(pr => {
      const st = S.s1[pr.label];
      const row = h(`<div class="rv-probe" data-l="${pr.label}">
        <b class="rv-pl">${pr.label}</b><span class="rv-pp m">${pt(pr.p)}</span>
        ${field('z', st.z, 'c-z', '<i class="m">z</i> =')}
        <span class="rv-yn"><button type="button" data-yn="1">feuert</button><button type="button" data-yn="0">feuert nicht</button></span>
        <button type="button" class="nn-btn rv-chk">Prüfen</button><span class="rv-msg"></span></div>`);
      const inp = row.querySelector('input'), msg = row.querySelector('.rv-msg');
      const showYN = () => row.querySelectorAll('[data-yn]').forEach(b => b.classList.toggle('on', st.f !== null && +b.dataset.yn === st.f));
      const lock = () => { row.classList.toggle('ok', !!st.ok); inp.disabled = !!st.ok; row.querySelectorAll('button').forEach(b => { b.disabled = !!st.ok; }); };
      inp.addEventListener('input', () => { st.z = inp.value; save(); });
      row.querySelectorAll('[data-yn]').forEach(b => b.addEventListener('click', () => { st.f = +b.dataset.yn; save(); showYN(); }));
      row.querySelector('.rv-chk').addEventListener('click', () => {
        const z = zOf(JANA, pr.p), v = parseNum(st.z);
        if (v === null) { msg.textContent = 'Erst z ausrechnen.'; msg.className = 'rv-msg bad'; return; }
        if (!same(v, z)) {
          msg.innerHTML = `Rechne nochmal: ${num(pr.p[0])}·${num(JANA.w[0])} + ${num(pr.p[1])}·${num(JANA.w[1])} + (${num(JANA.b)}) = ?`;
          msg.className = 'rv-msg bad'; return;
        }
        if (st.f === null) { msg.textContent = 'z stimmt! Feuert das Neuron?'; msg.className = 'rv-msg'; return; }
        if (st.f !== fire(z)) { msg.innerHTML = same(z, 0) ? 'z ist genau 0 – das ist <b>nicht größer</b> als 0.' : `z = ${num(z)} – ist das größer als 0?`; msg.className = 'rv-msg bad'; return; }
        st.ok = true; save();
        msg.innerHTML = fire(z) ? '✓ Revier' : '✓ kein Revier'; msg.className = 'rv-msg good';
        lock(); paint();
      });
      showYN(); lock();
      if (st.ok) { msg.innerHTML = fire(zOf(JANA, pr.p)) ? '✓ Revier' : '✓ kein Revier'; msg.className = 'rv-msg good'; }
      box.appendChild(row);
    });
    split(card, [intro, pic, task, result]);
    paint();
  }

  /* ── Schritt 2: Der Fluss ──────────────────────────────── */
  const RECIPE = `<details class="rv-recipe"><summary>So stellst du eine Gerade als Neuron auf</summary>
    <ol><li>Durch deine Punkte P und Q geht eine Gerade <span class="m">x₂ = m · x₁ + n</span> (wie in Mathe: m = Steigung, n = Achsenabschnitt).<br><span class="m">m = (q₂ − p₂) : (q₁ − p₁)</span></li>
    <li>Genau auf der Geraden soll das Neuron <span class="m">z = 0</span> rechnen. Das klappt mit
      <span class="m">w₁ = −m</span>, <span class="m">w₂ = 1</span>, <span class="m">b = −n</span>, denn dann ist <span class="m">z = x₂ − (m·x₁ + n)</span>.</li>
    <li>Prüfe eine <b class="t-y">goldene</b> Kamera: Ist dort z größer als 0? Wenn nicht, feuert das Neuron auf der falschen Seite – dann <b>alle drei Zahlen mal −1</b>.</li>
    <li>Senkrechte Gerade (p₁ = q₁)? Dann <span class="m">w₁ = 1</span>, <span class="m">w₂ = 0</span>, <span class="m">b = −p₁</span>.</li></ol>
    <p>Brüche darfst du so eintippen: <span class="m">-1/2</span> oder <span class="m">-0,5</span>.</p></details>`;

  function stepFluss(card) {
    const st = S.s2;
    const intro = h(`<p class="nn-lead-p">Im ersten Jahr stehen die Kameras nur in der Mitte des Tals. Irgendwo verläuft eine <b>Grenze</b>, über die keine Wildkatze geht. Stell selbst ein Neuron auf, das genau diese Grenze zieht – <b>ohne zu probieren</b>: erst überlegen, dann rechnen.</p>`);
    const s1 = h(`<div class="rv-sub"><h3><i>1</i> Wo verläuft die Grenze?</h3><p>Tippe auf der Karte <b>zwei Gitterpunkte</b> an, durch die deine Grenze gehen soll. Sie muss die goldenen von den grauen Kameras trennen.</p>
      <p class="rv-pq m"></p><button type="button" class="nn-btn rv-repick">Punkte neu wählen</button></div>`);
    const s2 = h(`<div class="rv-sub"><h3><i>2</i> Rechne das Neuron aus</h3>${RECIPE}
      <div class="rv-fields">${field('w1', st.w[0], 'c-w', xs('w', 1) + ' =')}${field('w2', st.w[1], 'c-w', xs('w', 2) + ' =')}${field('b', st.w[2], 'c-b', '<i class="m">b</i> =')}</div>
      <button type="button" class="nn-btn primary rv-check">Prüfen</button></div>`);
    const res = h('<div class="rv-result" hidden></div>');
    const pq = s1.querySelector('.rv-pq');
    function picking() { return !(st.P && st.Q); }
    function paint() {
      pq.innerHTML = st.P ? `P = ${pt(st.P)}${st.Q ? ` · Q = ${pt(st.Q)}` : ' · jetzt Q antippen'}` : 'Noch keine Punkte – tippe P an.';
      const n = st.checked ? neuronOf(st.w) : null;
      map.set({
        cams: K.YEAR1,
        pencil: [{ P: st.P, Q: st.Q, color: css('ink-soft') }],
        pick: picking() ? p => { if (!st.P) st.P = p; else if (!(p[0] === st.P[0] && p[1] === st.P[1])) st.Q = p; st.checked = false; save(); paint(); } : null,
        lines: n ? [{ w: n.w, b: n.b, color: COLS[0], tag: 'z > 0' }] : [],
        region: n ? p => fire(zOf(n, p)) : null,
        judge: n ? p => fire(zOf(n, p)) : null,
      });
      res.hidden = !st.checked;
      if (!st.checked) return;
      if (!n) { res.innerHTML = '<p class="bad">Trag alle drei Zahlen ein.</p>'; return; }
      const items = [];
      if (st.P && st.Q) {
        const onP = same(zOf(n, st.P), 0), onQ = same(zOf(n, st.Q), 0);
        items.push([onP && onQ, onP && onQ ? 'Die Gerade geht durch P und Q.' : `Die Gerade geht nicht durch ${!onP && !onQ ? 'P und Q' : !onP ? 'P' : 'Q'}: Dort ist z = ${num(zOf(n, !onP ? st.P : st.Q))}, nicht 0. Rechne nochmal nach.`]);
      }
      const ok = K.YEAR1.filter(c => fire(zOf(n, c.p)) === c.soll).length, all = ok === K.YEAR1.length;
      const gold = K.YEAR1.filter(c => c.soll), goldOk = gold.filter(c => fire(zOf(n, c.p))).length;
      const flip = !all && goldOk === 0 && K.YEAR1.filter(c => !c.soll && !fire(zOf(n, c.p))).length === 0;
      if (flip) items.push([false, 'Die Gerade passt – aber das Neuron feuert auf der <b>falschen Seite</b>. Nimm alle drei Zahlen mal −1.']);
      items.push([all, `<b>${ok} von ${K.YEAR1.length}</b> Kameras richtig.${all || flip ? '' : ' Liegt deine Bleistiftlinie wirklich zwischen den goldenen und grauen Kameras?'}`]);
      st.done = all; save();
      res.innerHTML = `<ul class="rv-checks">${items.map(([g, t]) => `<li class="${g ? 'good' : 'bad'}">${t}</li>`).join('')}</ul>` +
        (all ? `<p class="rv-yay"><b>Geschafft!</b> Dein Neuron hat die Grenze gefunden. Was dort in Wirklichkeit ist, siehst du erst am Ende.</p>
          <p class="rv-think"><b>Zum Nachdenken:</b> Viele Geraden trennen alle Kameras. Welche ist die beste? Warum könnte eine Gerade genau in der Mitte zwischen goldenen und grauen Kameras besser sein als eine, die knapp an einer Kamera vorbeigeht?</p>` : '');
      updNext();
    }
    s1.querySelector('.rv-repick').addEventListener('click', () => { st.P = st.Q = null; st.checked = false; save(); paint(); });
    s2.querySelectorAll('input').forEach((inp, i) => inp.addEventListener('input', () => { st.w[i] = inp.value; if (st.checked) { st.checked = false; } save(); res.hidden = true; map.set({ lines: [], region: null, judge: null }); }));
    s2.querySelector('.rv-check').addEventListener('click', () => { st.checked = true; save(); paint(); });
    split(card, [intro, pic2(), s1, s2, res]);
    function pic2() { return h(`<div class="rv-hint-pic">${neuronPic(st.checked ? neuronOf(st.w) : null, { color: COLS[0] })}</div>`); }
    paint();
    function updNext() { const p = card.querySelector('.rv-hint-pic'); if (p) p.innerHTML = neuronPic(st.checked ? neuronOf(st.w) : null, { color: COLS[0] }); }
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
    const intro = h(`<p class="nn-lead-p">Jana stellt jetzt <b>im ganzen Tal</b> Kameras auf. Im Westen und im Nordosten sieht plötzlich keine mehr eine Katze – dort muss noch etwas sein.
      ${flussOk !== null ? `Dein Fluss-Neuron liegt jetzt nur noch bei <b>${flussOk} von ${K.ALL.length}</b> Kameras richtig.` : ''} <b>Eine Gerade reicht nicht mehr.</b></p>`);
    const how = h(`<ol class="rv-how"><li>Zieh ein <b>Perzeptron</b> ins Netz (oder antippen). Jedes Perzeptron bringt <b>seine eigene Gerade</b> auf die Karte.</li>
      <li>Wähle für jedes Neuron zwei Punkte und rechne w₁, w₂, b aus – wie beim Fluss. Ändern geht nur über die Zahlen.</li>
      <li>Das <b>Ausgangsneuron</b> bekommt von jedem Perzeptron 0 oder 1. Es soll nur feuern, wenn <b>alle</b> „Revier“ sagen. Welche Gewichte und welchen Bias braucht es?</li></ol>`);
    const net = h(`<div class="rv-netbox"><div class="rv-palette"><span class="rv-chip" role="button" tabindex="0">＋ Perzeptron</span><span>hineinziehen oder antippen</span></div>
      <div class="rv-net"><svg class="rv-edges"></svg><div class="rv-col rv-cin"><div class="rv-inode">${xs('x', 1)}<small>Osten</small></div><div class="rv-inode">${xs('x', 2)}<small>Norden</small></div></div>
      <div class="rv-col rv-chid"></div><div class="rv-col rv-cout"></div></div></div>`);
    const res = h('<div class="rv-result"></div>');
    split(card, [intro, how, net, res]);
    const hidCol = net.querySelector('.rv-chid'), outCol = net.querySelector('.rv-cout'), svg = net.querySelector('.rv-edges'), netEl = net.querySelector('.rv-net');
    let picking = -1;

    function build() {
      hidCol.innerHTML = '';
      st.hid.forEach((x, i) => {
        const c = h(`<div class="rv-hcard${picking === i ? ' picking' : ''}" data-i="${i}" style="--c:${x.col}">
          <div class="rv-hhead"><i class="rv-dot"></i><b>Neuron ${i + 1}</b>
            <button type="button" class="rv-pick">${x.P && x.Q ? 'Punkte neu' : 'Punkte wählen'}</button><button type="button" class="rv-del" title="Entfernen">×</button></div>
          <div class="rv-pq m">${x.P ? 'P ' + pt(x.P) : ''}${x.Q ? ' · Q ' + pt(x.Q) : ''}${picking === i ? (x.P ? ' · Q antippen' : 'P antippen …') : ''}</div>
          <div class="rv-fields sm">${field('w1', x.w[0], 'c-w', xs('w', 1))}${field('w2', x.w[1], 'c-w', xs('w', 2))}${field('b', x.w[2], 'c-b', '<i class="m">b</i>')}</div></div>`);
        c.querySelector('.rv-pick').addEventListener('click', () => { picking = picking === i ? -1 : i; if (picking === i) { x.P = x.Q = null; } save(); build(); });
        c.querySelector('.rv-del').addEventListener('click', () => { st.hid.splice(i, 1); st.out.v.splice(i, 1); picking = -1; save(); build(); });
        c.querySelectorAll('input').forEach((inp, k) => inp.addEventListener('input', () => { x.w[k] = inp.value; save(); paint(); }));
        hidCol.appendChild(c);
      });
      if (!st.hid.length) hidCol.appendChild(h('<div class="rv-drop">Hier ein Perzeptron ablegen</div>'));
      outCol.innerHTML = '';
      if (st.hid.length >= 1) {
        const o = h(`<div class="rv-ocard"><div class="rv-hhead"><b>Ausgang</b><span>Revier?</span></div>
          <div class="rv-fields sm col">${st.hid.map((x, i) => `<label class="rv-f c-w" style="--c:${x.col}"><span><i class="rv-dot"></i>${xs('v', i + 1)}</span><input type="text" inputmode="decimal" autocomplete="off" data-v="${i}" value="${String(st.out.v[i] ?? '').replace(/"/g, '&quot;')}"></label>`).join('')}
          ${field('ob', st.out.b, 'c-b', '<i class="m">b</i>')}</div></div>`);
        o.querySelectorAll('[data-v]').forEach(inp => inp.addEventListener('input', () => { st.out.v[+inp.dataset.v] = inp.value; save(); paint(); }));
        o.querySelector('[data-f="ob"]').addEventListener('input', e => { st.out.b = e.target.value; save(); paint(); });
        outCol.appendChild(o);
      }
      requestAnimationFrame(edges);
      paint();
    }
    function add() {
      if (st.hid.length >= MAX_HID) return;
      const used = st.hid.map(x => x.col), col = COLS.find(c => !used.includes(c)) || COLS[st.hid.length % COLS.length];
      st.hid.push({ P: null, Q: null, w: ['', '', ''], col });
      picking = st.hid.length - 1;
      save(); build();
    }
    function edges() {
      const r = netEl.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      svg.innerHTML = '';
      const ins = [...net.querySelectorAll('.rv-inode')].map(e => e.getBoundingClientRect());
      const hs = [...hidCol.querySelectorAll('.rv-hcard')], o = outCol.querySelector('.rv-ocard');
      const line = (a, b, col) => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', a[0] - r.left); l.setAttribute('y1', a[1] - r.top); l.setAttribute('x2', b[0] - r.left); l.setAttribute('y2', b[1] - r.top);
        l.setAttribute('style', `stroke:${col}`); svg.appendChild(l); };
      hs.forEach(hc => {
        const b = hc.getBoundingClientRect(), col = hc.style.getPropertyValue('--c');
        ins.forEach(a => line([a.right, a.top + a.height / 2], [b.left, b.top + b.height / 2], col));
        if (o) { const ob = o.getBoundingClientRect(); line([b.right, b.top + b.height / 2], [ob.left, ob.top + ob.height / 2], col); }
      });
    }
    function paint() {
      const ns = st.hid.map(x => neuronOf(x.w));
      const n = netOf(st);
      map.set({
        cams: K.ALL,
        pencil: st.hid.map(x => ({ P: x.P, Q: x.Q, color: x.col })),
        pick: picking >= 0 ? p => {
          const x = st.hid[picking]; if (!x) return;
          if (!x.P) x.P = p; else if (!(p[0] === x.P[0] && p[1] === x.P[1])) { x.Q = p; picking = -1; }
          save(); build();
        } : null,
        pickColor: picking >= 0 && st.hid[picking] ? st.hid[picking].col : null,
        lines: ns.map((m, i) => m && { w: m.w, b: m.b, color: st.hid[i].col, shift: (i - 1) * 0.12 }).filter(Boolean),
        region: n ? n.judge : null,
        judge: n ? n.judge : null,
      });
      if (!st.hid.length) { res.innerHTML = '<p>Noch kein Perzeptron im Netz.</p>'; return; }
      const miss = ns.findIndex(m => !m);
      if (miss >= 0) { res.innerHTML = `<p>Neuron ${miss + 1}: Trag w₁, w₂ und b ein – dann erscheint seine Gerade.</p>`; return; }
      if (!n) { res.innerHTML = '<p>Alle Geraden stehen. Jetzt das <b>Ausgangsneuron</b>: Gewichte <i class="m">v</i> und Bias <i class="m">b</i>.</p>'; return; }
      const ok = K.ALL.filter(c => n.judge(c.p) === c.soll).length, all = ok === K.ALL.length;
      const wasDone = st.done;
      st.done = all; save();
      const mu = card.querySelector('.rv-muster'); if (mu) mu.hidden = all;
      res.innerHTML = all ? `<p class="rv-yay"><b>${ok} von ${K.ALL.length} Kameras richtig – das Revier ist gefunden!</b></p>`
        : `<p class="rv-score"><b>${ok} von ${K.ALL.length}</b> Kameras richtig. Gold getönt ist, wo dein Netz „Revier“ sagt.</p>`;
      if (all && !S.revealed) {
        S.revealed = true; save();
        res.insertAdjacentHTML('beforeend', '<p class="rv-reveal-msg">Die Karte deckt sich auf …</p>');
        map.reveal(() => { const m = res.querySelector('.rv-reveal-msg'); if (m) m.innerHTML = revealText(); });
      } else if (all && wasDone !== all) res.insertAdjacentHTML('beforeend', `<p>${revealText()}</p>`);
      else if (all) res.insertAdjacentHTML('beforeend', `<p>${revealText()}</p>`);
    }
    // Ziehen aus der Palette (Zeiger-Ereignisse, am Tablet genauso)
    const chip = net.querySelector('.rv-chip');
    chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); } });
    chip.addEventListener('pointerdown', e => {
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      let ghost = null, moved = false;
      const mv = ev => {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        moved = true;
        if (!ghost) { ghost = chip.cloneNode(true); ghost.classList.add('rv-ghost'); document.body.appendChild(ghost); }
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        const r = netEl.getBoundingClientRect();
        netEl.classList.toggle('drop-on', ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom);
      };
      const up = ev => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (ghost) ghost.remove();
        const over = netEl.classList.contains('drop-on'); netEl.classList.remove('drop-on');
        if (!moved || over) add();
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
    new ResizeObserver(() => { if (netEl.isConnected) edges(); }).observe(netEl);
    res.insertAdjacentHTML('afterend', `<p class="rv-muster"><button type="button" class="nn-btn rv-lsg">Musterlösung laden</button> <span>(überschreibt dein Netz)</span></p>`);
    const lb = card.querySelector('.rv-lsg');
    if (lb) lb.addEventListener('click', () => { if (!confirm('Dein Netz durch die Musterlösung ersetzen?')) return; S.s3 = MUSTER(); save(); render(page, api); });
    build();
  }
  const revealText = () => `<b>Jetzt siehst du die Landschaft:</b> Im Süden fließt der <b>Fluss</b>, im Westen führt die <b>Landstraße</b> zur Stadt, im Nordosten liegt die <b>Stadt</b>. Dazwischen ist Wald – das Revier. Jede Grenze ist ein Neuron, und das Ausgangsneuron fasst sie zusammen. <b>Das ist ein neuronales Netz.</b>`;

  /* ── Schritt 4: Ein Jahr später (Overfitting) ──────────── */
  function stepJahr(card) {
    const st = S.s4;
    let n = S.s3.done ? netOf(S.s3) : null;
    if (!n) {
      card.appendChild(h(`<div class="rv-need"><p>Hier geht es mit deinem Netz aus <b>„Die Stadt“</b> weiter – das ist noch nicht fertig.</p>
        <p><button type="button" class="nn-btn rv-go3">‹ Zur Stadt</button> <button type="button" class="nn-btn rv-lsg">Mit der Musterlösung weitermachen</button></p></div>`));
      card.querySelector('.rv-go3').onclick = () => go('stadt');
      card.querySelector('.rv-lsg').onclick = () => { S.s3 = MUSTER(); S.revealed = true; save(); render(page, api); };
      return;
    }
    S.revealed = true;
    map.set({ reveal: 1 });
    const mineOk = K.NOISY.filter(c => n.judge(c.p) === c.soll).length, N = K.NOISY.length;
    const intro = h(`<p class="nn-lead-p">Jana hat noch einmal alle Bilder durchgesehen. Ein paar Kameras passen nicht ins Bild – <b>Ausreißer</b>. Tippe eine <b>orange</b> umkreiste Kamera an, um zu lesen, was passiert ist.</p>`);
    const why = h('<p class="rv-why">—</p>');
    const cmp = h(`<div class="rv-cmp">
      <button type="button" class="rv-net-card${st.view === 'mine' ? ' on' : ''}" data-v="mine"><b>Dein Netz</b><span>${S.s3.hid.length} Neuronen + Ausgang</span><span class="rv-big">${mineOk} / ${N}</span><span>Kameras richtig</span></button>
      <button type="button" class="rv-net-card${st.view === 'kim' ? ' on' : ''}" data-v="kim"><b>Kims Netz</b><span>ein großes Netz mit 40 Neuronen, lange trainiert</span><span class="rv-big">${N} / ${N}</span><span>Kameras richtig</span></button></div>`);
    const q = h(`<div class="rv-sub"><h3><i>?</i> Welches Netz würdest du Jana geben?</h3>
      <p class="rv-yn big"><button type="button" data-c="mine">Mein Netz</button><button type="button" data-c="kim">Kims Netz</button></p></div>`);
    const test = h(`<div class="rv-sub rv-test" hidden><h3><i>!</i> Ein Jahr später</h3><p>Jana hat <b>neue Kameras</b> zwischen den alten aufgestellt (Rauten). Das Revier ist dasselbe. Wie gut sind die beiden Netze bei Kameras, die sie noch nie gesehen haben?</p>
      <button type="button" class="nn-btn primary rv-run">Neue Kameras zeigen</button><div class="rv-test-res"></div></div>`);
    const sum = h(`<div class="nn-summary rv-sum" hidden><b>Overfitting</b><ul>
      <li>Kims Netz hat sich <b>jede einzelne Kamera gemerkt</b> – auch die Ausreißer. Bei den Trainingsdaten ist es perfekt.</li>
      <li>Bei <b>neuen Daten</b> liegt es daneben: Um jeden Ausreißer hat es eine kleine Insel gebaut, die es in Wirklichkeit nicht gibt.</li>
      <li>Das nennt man <b>Overfitting</b> (Überanpassung): Ein Netz lernt die Trainingsdaten auswendig, statt die Regel dahinter.</li>
      <li>Darum prüft man ein Netz immer mit <b>Testdaten</b>, die es beim Lernen nicht gesehen hat. Ein einfaches Netz ist oft das bessere.</li></ul></div>`);
    split(card, [intro, cmp, why, q, test, sum]);
    const judge = () => st.view === 'kim' ? K.kim : n.judge;
    function paint() {
      cmp.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === st.view));
      q.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === st.choice));
      test.hidden = !st.choice;
      sum.hidden = !st.tested;
      const cams = K.NOISY.map(c => c.out ? Object.assign({}, c, { mark: true, markColor: css('in') }) : c);
      map.set({
        cams: st.tested ? cams.concat(K.TEST) : cams,
        judge: judge(), region: judge(),
        lines: st.view === 'mine' ? n.hid.map((m, i) => ({ w: m.w, b: m.b, color: S.s3.hid[i].col, width: 2.2, noArrow: true })) : [],
        pick: p => {
          const c = K.NOISY.find(x => x.out && x.p[0] === p[0] && x.p[1] === p[1]);
          why.innerHTML = c ? `<b>Kamera ${pt(c.p)}:</b> ${c.out}` : 'Tippe eine <b>orange umkreiste</b> Kamera an.';
        },
        pickColor: css('in'),
      });
      if (st.tested) {
        const T = K.TEST, a = T.filter(c => n.judge(c.p) === c.soll).length, b = T.filter(c => K.kim(c.p) === c.soll).length;
        test.querySelector('.rv-test-res').innerHTML = `<div class="rv-cmp sm"><div class="rv-net-card static"><b>Dein Netz</b><span class="rv-big">${a} / ${T.length}</span><span>neue Kameras richtig</span></div>
          <div class="rv-net-card static"><b>Kims Netz</b><span class="rv-big">${b} / ${T.length}</span><span>neue Kameras richtig</span></div></div>
          <p>${a > b ? (st.choice === 'mine' ? '<b>Gut eingeschätzt!</b> ' : '<b>Überraschung:</b> ') + 'Bei neuen Kameras ist <b>dein</b> Netz besser.' : 'Bei neuen Kameras liegen die Netze diesmal ähnlich – schau, wo Kims Netz Inseln um die Ausreißer gebaut hat.'} Schalte oben zwischen den Netzen um und vergleiche.</p>`;
        test.querySelector('.rv-run').hidden = true;
      }
    }
    cmp.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.v; save(); paint(); }));
    q.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { st.choice = b.dataset.c; save(); paint(); }));
    test.querySelector('.rv-run').addEventListener('click', () => { st.tested = true; save(); paint(); });
    why.innerHTML = 'Tippe eine <b>orange umkreiste</b> Kamera an.';
    paint();
  }

  const css = n => (window.NLTheme && NLTheme.var(n)) || '#888';

  /* ── Arbeitsblatt (Lehrkraft / allein) ─────────────────── */
  function printSheet() {
    const tmp = K.makeMap();
    tmp.el.style.cssText = 'position:fixed;left:-4000px;top:0;width:760px;height:640px';
    document.body.appendChild(tmp.el);
    tmp.el.querySelector('canvas').style.cssText = 'width:760px;height:640px';
    const de = document.documentElement, oldTheme = de.getAttribute('data-theme');
    de.setAttribute('data-theme', 'light');                        // Blatt immer hell
    tmp.set({ reveal: 0, cams: K.ALL.map(c => { const pr = PROBE.find(x => x.p[0] === c.p[0] && x.p[1] === c.p[1]); return pr ? Object.assign({}, c, { label: pr.label }) : c; }) });
    const img1 = tmp.el.querySelector('canvas').toDataURL('image/png');
    tmp.set({ reveal: 1, lines: K.TRUTH.map((t, i) => ({ w: t.w, b: t.b, color: COLS[i], width: 2.6 })), region: K.inRevier, judge: p => K.inRevier(p) ? 1 : 0 });
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
      <p>Försterin Jana hat im Tal Wildtierkameras aufgestellt. <b>Kameras mit Katze sind gefüllt</b>, Kameras ohne Katze sind hell.
      Ein Neuron bekommt zwei Eingänge: x₁ = km nach Osten, x₂ = km nach Norden. Es rechnet <b>z = x₁·w₁ + x₂·w₂ + b</b> und feuert („Revier“), wenn z &gt; 0 ist.</p>
      <img src="${img1}" alt="Karte mit Kameras">
      <h2>1 · Ein Neuron prüft Kameras</h2>
      <p>Janas Neuron: w₁ = 1, w₂ = 1, b = −8. Berechne z für die Kameras A (3|2), B (4|6) und C (5|3). Feuert das Neuron?</p>
      <table><tr><th>Kamera</th><th>Rechnung</th><th>z</th><th>feuert?</th><th>richtig?</th></tr>${['A', 'B', 'C'].map(line).join('')}</table>
      </section><section class="sheet">
      <h2>2 · Die Grenzen finden</h2>
      <p>Zeichne mit dem Lineal <b>drei Geraden</b> ein, die die Kameras mit Katze von den anderen trennen (eine im Süden, eine im Westen, eine im Nordosten).
      Wähle auf jeder Geraden zwei Gitterpunkte P und Q.</p>
      <p class="tip"><b>So geht's:</b> Gerade x₂ = m·x₁ + n mit m = (q₂ − p₂) : (q₁ − p₁). Dann ist w₁ = −m, w₂ = 1, b = −n.
      Prüfe eine Kamera mit Katze: Ist z &gt; 0? Wenn nicht, alle drei Zahlen mal −1.</p>
      <table><tr><th>Neuron</th><th>P</th><th>Q</th><th>m und n</th><th>w₁ · w₂ · b</th></tr>${['1 (Süden)', '2 (Westen)', '3 (Nordosten)'].map(line).join('')}</table>
      <h2>3 · Das Ausgangsneuron</h2>
      <p>Das Ausgangsneuron bekommt von jedem der drei Neuronen 0 oder 1, alle Gewichte sind 1. Es soll nur feuern, wenn <b>alle drei</b> 1 sagen.
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
