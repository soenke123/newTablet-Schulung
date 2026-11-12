/* Phase 3 „Wörter als Punkte“ — PROTOTYP (12.11.2026). Steht zwischen Frage & Antwort und Echtes Netz
   (Phase 4, phase4.js). Bis 12.11.2026 hieß das Netz Phase 3 — Datei, Nummer und Speicher-Schlüssel
   sind seitdem umgezogen (es gab noch keine Räume, die Phase 3 geteilt hatten).

   Links das Handy wie in Phase 2 (Frage stellen → Antwort als Bausteine, danach Knöpfe wie Phase 1).
   Unterschied zu Phase 2 — Tiny benutzt die WORTWOLKE (wolke.js), geschrieben wird weiter mit N-Grammen:
     1. Die Frage wird ein Punkt; gewählt werden die 3 Texte, die ihr am nächsten liegen
        (statt Stichwörter zu zählen).
     2. WOLKEN-SPRUNG (Regler in der Spalte „Wolken-Sprung“, 0 = reines N-Gramm): hat das N-Gramm ein
        Wort gezogen (Katze), springt Tiny manchmal zu einem nahen Punkt derselben Art (Hund) und
        schreibt von dort weiter; der Artikel davor wird angepasst (die → der).
     3. Lücke: steht die Wortfolge in keinem Text („Ein Welpe frisst“), springt Tiny mit einem Wort der
        Folge zu einem nahen Punkt („Ein Hund frisst“) und nimmt, was dort dahinter stand (bis 12.11.2026
        „geborgt“). Auch das nur, wenn der Regler nicht auf 0 steht.
   Rechts: Kandidaten · Frage als Punkt · Wolken-Sprung, darunter breit die 3D-Wolke zum Drehen
   (ehrlicher Hinweis: eigentlich 20 Zahlen je Wort). */
const P3_SUGGEST = ['Was frisst ein Welpe?', 'Wo schläft ein Welpe?', 'Wie lange dauert eine Reise zum Mars?', 'Was lernt ein Programm?', 'Wo arbeitet eine Tierärztin?'];
const P3_N = 3;
/* Wolken-Sprung: Gewicht e^((Nähe − 1) / Sprung). Gemessen 12.11.2026 (alle Texte): 0,05 → im Schnitt
   springen 9 % der Wörter, 0,1 → 26 %, 0,2 → 51 %, 0,3 → 62 %. */
const P3_JUMP = 0.05, P3_JUMP_MAX = 0.3;

Phases.register(3, {
  mount(host) {
    let W = null, docs = null;
    let R = null, session = null, asked = false, seedLen = 0;
    let temp = 1, jump = P3_JUMP, playing = false, timer = null, done = false, focus = null;
    let Z, phoneEl, screen, placeholder, askedEl, answerEl, metaEl, textEl, cursor, askBox, sayBox, sayEl, controls, playBtn, input, focusHost;
    let cloud = null;
    const NTOP = 3;
    const srcVar = i => 'var(--src-' + ['a', 'b', 'c'][i] + ')';
    const isPunct = w => w === '.' || w === ',';
    const pct = x => Math.round(x * 100) + ' %';
    /* Nomen groß, alles andere klein (Verben aus der Wolke nicht „Frisst“). */
    const cap = w => (W && W.idx.has(w) && W.kind[W.idx.get(w)] === 'nomen') ? showWord(w) : w;
    const phrase = ws => { const t = ws.filter(w => !isPunct(w)).map(cap).join(' '); return t.charAt(0).toUpperCase() + t.slice(1); };

    function ensureModel() {
      if (W) return;
      const texts = State.activeTexts();
      W = texts.length ? Wolke.build(texts) : null;
      docs = W ? Wolke.docPoints(W, texts) : [];
    }

    /* ---------------- Fragen und Schreiben ---------------- */
    function ask(q) {
      q = (q || '').trim();
      ensureModel();
      if (!q || !W) return;
      stopPlay();
      asked = true; done = false; focus = null;
      R = Wolke.search(W, docs, q);
      R.question = q;
      const top = R.ranked.slice(0, NTOP).map(r => r.text);
      const rest = State.activeTexts().filter(t => !top.includes(t));
      session = createSession(buildSources(top.concat(rest), () => 1, () => new Map()));
      /* Neue Sätze lieber mit einem Satz, in dem ein Wort der Frage steht (wie Phase 2). */
      const qset = new Set(R.qwords.filter(x => x.w).map(x => x.w));
      session.sources.forEach(s => {
        const rel = new Map();
        s.toks.forEach(t => { if (qset.has(t.t)) rel.set(t.sent, 1); });
        s.sentRel = rel;
      });
      const seed = Wolke.seedFrom(q);
      seedLen = 0;
      if (seed) seed.forEach(w => { session.steps.push({ word: w.toLowerCase(), raw: w, si: -1, seed: true, cands: null }); session.ctx.push(w.toLowerCase()); seedLen++; });
      placeholder.hidden = true;
      askedEl.textContent = q;
      askedEl.hidden = false;
      answerEl.hidden = false;
      askBox.hidden = true; sayBox.hidden = false; controls.hidden = false;
      metaEl.replaceChildren(el('span', 'chat-found', top.length + ' Texte in der Nähe gefunden'));
      paintAll();
      if (cloud) cloud.redraw();
      startPlay();
    }

    function doStep() {
      if (!session) return false;
      focus = null;
      const C = nextCands();
      if (!C.list.length) { done = true; return false; }
      const cand = temp === 0 ? C.list[0] : pickFrom(C.list);
      commitWord(session, cand, C);
      cloudJump(session.steps[session.steps.length - 1]);
      paintAll();
      if (session.sentences >= 2 || session.steps.length >= 60) { done = true; return false; }
      return true;
    }
    function syncPlay() {
      if (!playBtn) return;
      playBtn.textContent = playing ? '❚❚ Pause' : '▶ Weiter';
      playBtn.classList.toggle('playing', playing);
      say();
    }
    function startPlay() {
      if (playing || !session) return;
      playing = true; syncPlay();
      timer = setInterval(() => { if (!doStep()) stopPlay(); }, 480);
    }
    function stopPlay() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      syncPlay();
    }
    /* Wörter, zu denen Tiny gesprungen ist, werden in einer Lücke nicht gleich zurückgetauscht. */
    function jumpedWords() { return new Set(session.steps.filter(st => st.jump && !st.jump.stay).map(st => st.word)); }
    function nextCands() { return Wolke.candidatesWithCloud(W, session, P3_N, temp, NTOP, { borrow: jump > 0, noSwap: jumpedWords() }); }
    /* Wolken-Sprung nach dem Ziehen: Möglichkeiten aus der Wolke, eine davon würfeln. */
    function cloudJump(st) {
      st.jumpJ = jump;
      const opts = Wolke.jumpOptions(W, st.word, jump);
      if (!opts) return;
      const pick = pickFrom(opts);
      st.jump = { from: st.word, fromRaw: st.raw, to: pick.word, sim: pick.sim, stay: pick.stay, opts, J: jump };
      if (pick.stay) return;
      const n = session.steps.length;
      st.word = pick.word;
      st.raw = W.kind[W.idx.get(pick.word)] === 'nomen' ? showWord(pick.word) : pick.word;
      st.si = -2;
      session.ctx[session.ctx.length - 1] = pick.word;
      const prev = session.steps[n - 2];
      const a = prev && Wolke.fixArticle(W, prev.word, pick.word);
      if (a) {
        st.jump.art = { from: prev.raw, to: a };
        prev.artFrom = prev.raw;
        prev.raw = /^[A-ZÄÖÜ]/.test(prev.raw) ? showWord(a) : a;
        prev.word = a;
        session.ctx[session.ctx.length - 2] = a;
      }
    }
    /* Alle Sprünge: beim Schreiben (st.jump) und in einer Lücke (st.cands.borrow). */
    function jumpSteps() {
      return session ? session.steps.map((st, i) => ({ st, i })).filter(x => (x.st.jump && !x.st.jump.stay) || (x.st.cands && x.st.cands.borrow)) : [];
    }
    function jumpPairs() {
      return jumpSteps().map(({ st }) => st.jump && !st.jump.stay ? [st.jump.from, st.jump.to] : [st.cands.borrow.from, st.cands.borrow.to]);
    }
    function say() {
      if (!sayEl || !asked) return;
      const nb = jumpSteps().length;
      if (playing) sayEl.textContent = 'Ich schreibe aus den Texten, die in der Wolke nah an deiner Frage liegen' + (jump > 0 ? ' – und springe manchmal zu einem nahen Wort.' : '.');
      else if (done) sayEl.textContent = nb ? 'Fertig! ' + nb + (nb === 1 ? '-mal bin ich' : '-mal bin ich') + ' in der Wolke gesprungen. Tipp ein Wort an.' : 'Fertig! Diesmal bin ich nicht gesprungen. ↻ Nochmal = neue Frage.';
      else sayEl.textContent = 'Pause. Tipp ein Wort an, dann siehst du rechts, woher es kommt.';
    }
    function resetChat() {
      stopPlay();
      asked = false; session = null; R = null; focus = null; done = false;
      placeholder.hidden = false; askedEl.hidden = true; answerEl.hidden = true;
      askBox.hidden = false; sayBox.hidden = true; controls.hidden = true;
      input.value = '';
      paintAll();
      if (cloud) cloud.redraw();
    }

    /* ---------------- Handy ---------------- */
    function colorOf(si) { return si < 0 ? 'var(--muted)' : si < NTOP ? srcVar(si) : 'var(--muted)'; }
    function updateText() {
      textEl.replaceChildren();
      if (!session) { textEl.appendChild(cursor); return; }
      pieces(session).forEach((p, idx) => {
        if (idx > 0) textEl.appendChild(document.createTextNode(' '));
        const st = session.steps[p.i];
        const b = st.cands && st.cands.borrow;
        const j = st.jump && !st.jump.stay ? st.jump : null;
        /* Gesprungen: im selben Baustein das alte Wort durchgestrichen, dahinter das neue (nur bei offener Spalte
           „Wolken-Sprung“ sichtbar, .jump-old). Ebenso ein angepasster Artikel. Lücke: gestrichelter Rand. */
        const old = j ? j.fromRaw : st.artFrom;
        const span = el('span', 'srcword' + (p.punct ? ' punct' : '') + (st.seed ? ' seedword' : '') + (b && !j ? ' jumped' : '') + (old ? ' has-old' : '') + (p.si >= NTOP ? ' farword' : ''));
        if (old) {
          const o = /^[A-ZÄÖÜ]/.test(p.txt) ? old.charAt(0).toUpperCase() + old.slice(1) : old;
          span.append(el('s', 'jump-old', o), document.createTextNode(p.txt));
        } else span.textContent = p.txt;
        span.style.setProperty('--sc', colorOf(p.si));
        span.dataset.i = String(p.i);
        span.title = j ? 'Wolken-Sprung: ' + cap(j.from) + ' → ' + cap(j.to) + ' – antippen' : b ? 'Lücke: ' + cap(b.from) + ' → ' + cap(b.to) + ' – antippen' : 'Antippen zum Zerlegen';
        if (p.i === focus) span.classList.add('sel');
        textEl.appendChild(span);
      });
      cursor.classList.toggle('sel', focus == null && session.steps.length > 0);
      textEl.appendChild(cursor);
      if (focus == null) screen.scrollTop = screen.scrollHeight;
    }

    function buildPhone() {
      const P = Zerlegen.phone({ label: 'tiny · model · Phase 3', help: 'p3' });
      phoneEl = P.el;
      phoneEl.classList.add('phone-chat');
      screen = P.screen;
      const chat = el('div', 'chat');
      placeholder = el('div', 'tiny-say');
      placeholder.append(tinyEl('normal'), el('p', 'tiny-bubble', 'Frag mich etwas! Diesmal suche ich nicht nach gleichen Wörtern, sondern nach Wörtern, die in meiner Wolke nah beieinander liegen.'));
      askedEl = el('p', 'chat-q'); askedEl.hidden = true;
      answerEl = el('div', 'chat-a'); answerEl.hidden = true;
      const aBody = el('div', 'chat-a-body');
      metaEl = el('div', 'chat-meta');
      const bubble = el('div', 'paper chat-bubble');
      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      cursor.title = 'Das nächste Wort';
      textEl.appendChild(cursor);
      bubble.appendChild(textEl);
      aBody.append(metaEl, bubble);
      answerEl.append(tinyEl('happy'), aBody);
      chat.append(placeholder, askedEl, answerEl);
      screen.appendChild(chat);
      textEl.addEventListener('pointerdown', ev => { if (ev.target.closest('.srcword, .cursor')) stopPlay(); });
      textEl.addEventListener('click', ev => {
        const w = ev.target.closest('.srcword');
        if (w) { const i = +w.dataset.i; focus = i === focus ? null : i; paintAll(); return; }
        if (ev.target.closest('.cursor')) { focus = null; paintAll(); }
      });

      sayBox = el('div', 'phone-say'); sayEl = el('p', 'tiny-bubble'); sayBox.append(tinyEl('normal'), sayEl); sayBox.hidden = true;
      controls = el('div', 'phone-controls');
      playBtn = el('button', 'btn primary', '▶ Weiter'); playBtn.type = 'button'; playBtn.dataset.spot = 'play3';
      const stepBtn = el('button', 'btn', '+1 Wort'); stepBtn.type = 'button'; stepBtn.dataset.spot = 'step3';
      const againBtn = el('button', 'btn', '↻ Nochmal'); againBtn.type = 'button'; againBtn.dataset.spot = 'again3';
      controls.append(playBtn, stepBtn, againBtn); controls.hidden = true;
      playBtn.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
      stepBtn.addEventListener('click', () => { stopPlay(); if (!doStep()) syncPlay(); });
      againBtn.addEventListener('click', resetChat);

      askBox = el('div', 'phone-ask');
      const sugg = el('div', 'sugg');
      P3_SUGGEST.forEach(q => { const b = el('button', 'chip', q); b.type = 'button'; b.addEventListener('click', () => { input.value = q; ask(q); }); sugg.appendChild(b); });
      const form = el('form', 'qform');
      input = el('input', 'textin'); input.type = 'text'; input.placeholder = 'Frag Tiny etwas …'; input.setAttribute('aria-label', 'Frage');
      const send = el('button', 'btn primary qsend'); send.type = 'submit'; send.setAttribute('aria-label', 'Fragen');
      send.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
      form.append(input, send);
      form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); input.blur(); });
      askBox.append(sugg, form);
      phoneEl.append(sayBox, controls, askBox);
      return phoneEl;
    }

    /* ---------------- Spalten ---------------- */
    function empty(t) { return el('p', 'card-empty', t); }
    function view() {
      if (!session) return null;
      if (focus != null && session.steps[focus]) {
        const st = session.steps[focus];
        return { idx: focus, st, C: st.cands, chosen: st.chosen || st.word, ctx: st.ctxUsed || [] };
      }
      const C = nextCands();
      return { idx: null, C, chosen: null, ctx: C.level > 0 ? session.ctx.slice(-C.level) : [] };
    }
    const tok = w => w === '.' ? '·' : isPunct(w) ? w : cap(w);

    function paintCand(v) {
      const b = Z.cols.cand.body;
      b.replaceChildren();
      if (!v) { b.appendChild(empty('Stell links eine Frage.')); return; }
      if (v.st && v.st.seed) { b.appendChild(el('p', 'p1-line', 'Dieses Wort kommt aus deiner Frage: Tiny macht aus „Was frisst ein Welpe?“ den Anfang „Ein Welpe frisst …“.')); return; }
      const C = v.C;
      const line = el('p', 'p1-line');
      if (C.borrow) line.append(document.createTextNode('Lücke – Tiny springt zu „'), el('b', null, cap(C.borrow.to)), document.createTextNode('“, das stand dort dahinter:'));
      else if (C.wide) line.append(document.createTextNode('In den 3 Texten stand nichts – das stand in einem anderen Text:'));
      else line.append(document.createTextNode(C.level > 0 ? 'Das stand in den Texten dahinter:' : 'Neuer Satz – so fingen Sätze an:'));
      b.appendChild(line);
      const list = el('ol', 'clist');
      C.list.slice(0, 7).forEach(a => {
        const li = el('li');
        const row = el('div', 'crow' + (a.word === v.chosen ? ' chosen' : ''));
        const bar = el('span', 'cbar'); const fill = el('i'); fill.style.width = Math.max(2, a.p * 100) + '%'; bar.appendChild(fill);
        row.append(el('span', 'cword', tok(a.word)), bar, el('span', 'cp', pct(a.p)));
        if (a.word === v.chosen) row.appendChild(el('span', 'ctag', '🎲 gezogen'));
        li.appendChild(row); list.appendChild(li);
      });
      b.appendChild(list);
      const j = v.st && v.st.jump && !v.st.jump.stay ? v.st.jump : null;
      if (j) {
        const l = el('p', 'p1-line p3-jumpline');
        l.append(document.createTextNode('🦘 Danach Wolken-Sprung: '), el('b', null, cap(j.from)), document.createTextNode(' → '), el('b', null, cap(j.to)));
        b.appendChild(l);
      }
    }

    function paintMean() {
      const b = Z.cols.mean.body;
      b.replaceChildren();
      if (!R) { b.appendChild(empty('Stell links eine Frage – dann wird sie hier ein Punkt in der Wolke.')); return; }
      b.appendChild(el('p', 'p1-sub', 'Welche Wörter werden Punkte?'));
      const g = el('div', 'gram askq');
      tokenize(R.question).filter(t => !t.punct).forEach(t => {
        const x = R.qwords.find(q => q.raw === t.raw);
        const s = el('span', 'gtok ' + (!x ? 'askoff' : x.w ? 'askw' : 'askunk'), t.raw);
        if (x && x.w) s.style.setProperty('--wc', 'var(--cat-meaning)');
        s.title = !x ? 'Füllwort – kein Punkt' : x.w ? 'Punkt in der Wolke' : 'Kein Punkt – kommt zu selten vor';
        g.appendChild(s);
      });
      b.appendChild(g);
      b.appendChild(el('p', 'p1-line', 'Der Punkt der Frage liegt in der Mitte dieser Wörter. Jeder Text ist auch ein Punkt (die Mitte seiner Wörter).'));
      const list = el('div', 'p3-ranks');
      R.ranked.slice(0, 5).forEach((r, i) => {
        const row = el('div', 'p3-rank' + (i < NTOP ? ' on' : ''));
        const lt = el('span', 'letter sm', i < NTOP ? 'ABC'[i] : '·');
        if (i < NTOP) lt.style.background = srcVar(i);
        row.append(lt, el('span', 'p3-rank-t', r.text.title), el('span', 'p3-rank-n', pct(Math.max(0, r.score))));
        list.appendChild(row);
      });
      if (!R.ranked.length) list.appendChild(el('p', 'p1-more', 'nichts gefunden'));
      b.appendChild(el('p', 'p1-sub', 'Diese Texte liegen am nächsten'));
      b.appendChild(list);
    }

    /* Sprung beim Schreiben: das N-Gramm zog st.jump.from, die Wolke bot Nachbarn an, gewürfelt wurde st.jump.to. */
    function jumpCard(st, i) {
      const J = st.jump;
      const box = el('div', 'p3-jump' + (i === focus ? ' on' : ''));
      const l1 = el('p', 'p1-line');
      l1.append(document.createTextNode('Das N-Gramm hat '), el('b', null, cap(J.from)), document.createTextNode(' gezogen. In der Wolke liegen nah:'));
      const list = el('ol', 'clist');
      J.opts.forEach(o => {
        const li = el('li');
        const row = el('div', 'crow' + (o.word === J.to ? ' chosen' : ''));
        const bar = el('span', 'cbar'); const fill = el('i'); fill.style.width = Math.max(2, o.p * 100) + '%'; bar.appendChild(fill);
        row.append(el('span', 'cword', cap(o.word)), el('span', 'p3-sim', o.stay ? 'bleibt' : pct(o.sim) + ' nah'), bar, el('span', 'cp', pct(o.p)));
        if (o.word === J.to) row.appendChild(el('span', 'ctag', o.stay ? '🎲 bleibt' : '🦘 gesprungen'));
        li.appendChild(row); list.appendChild(li);
      });
      box.append(l1, list);
      if (!J.stay) {
        const sh = W.shared(J.from, J.to, 4);
        if (sh.length) box.appendChild(el('p', 'p1-more', 'Warum nah? Beide stehen oft bei: ' + sh.join(', ')));
        if (J.art) {
          const l = el('p', 'p1-more');
          l.append(document.createTextNode('Artikel angepasst: '), el('b', null, J.art.from), document.createTextNode(' → '), el('b', null, J.art.to));
          box.appendChild(l);
        }
      }
      box.addEventListener('click', () => { focus = i; paintAll(); });
      return box;
    }
    /* Sprung in einer Lücke: die Wortfolge stand nirgends, also ein Wort der Folge gegen einen nahen Punkt. */
    function gapCard(st, i) {
      const B = st.cands.borrow;
      const box = el('div', 'p3-jump' + (i === focus ? ' on' : ''));
      const l1 = el('p', 'p1-line');
      l1.append(document.createTextNode('Lücke: „'), el('b', null, phrase(st.ctxUsed)),
        document.createTextNode('“ steht in ' + (B.wide ? 'keinem Text.' : 'keinem der 3 Texte.')));
      const l2 = el('p', 'p1-line');
      l2.append(document.createTextNode('🦘 Tiny springt von '), el('b', null, cap(B.from)), document.createTextNode(' zu '), el('b', null, cap(B.to)),
        document.createTextNode(' (' + pct(B.sim) + ' nah).'));
      const l3 = el('p', 'p1-line');
      l3.append(document.createTextNode('„'), el('b', null, phrase(B.tail2)),
        document.createTextNode('“ steht da' + (B.wide ? ' (in einem anderen Text)' : '') + ' → Tiny nimmt '), el('b', 'p3-took', tok(st.chosen || st.word)), document.createTextNode('.'));
      box.append(l1, l2, l3);
      box.addEventListener('click', () => { focus = i; paintAll(); });
      return box;
    }
    function paintJump(v) {
      const b = Z.cols.jump.body;
      b.replaceChildren();
      if (!session) { b.appendChild(empty('Stell links eine Frage.')); return; }
      if (v && v.st) {
        if (v.st.seed) { b.appendChild(el('p', 'p1-line', 'Dieses Wort kommt aus deiner Frage – hier springt Tiny nicht.')); return; }
        if (v.st.cands && v.st.cands.borrow) b.appendChild(gapCard(v.st, v.idx));
        if (v.st.jump) b.appendChild(jumpCard(v.st, v.idx));
        else if (!(v.st.cands && v.st.cands.borrow)) b.appendChild(el('p', 'p1-line', !v.st.jumpJ ? 'Wolken-Sprung stand auf 0 – Tiny ist nicht gesprungen.' : 'Dieses Wort ist kein Punkt in der Wolke (oder hat keinen nahen Nachbarn) – hier kann Tiny nicht springen.'));
        return;
      }
      const all = jumpSteps();
      if (!all.length) { b.appendChild(el('p', 'p1-line', jump > 0 ? 'Bisher kein Sprung.' : 'Wolken-Sprung steht auf 0: Tiny schreibt nur mit N-Grammen.')); return; }
      b.appendChild(el('p', 'p1-sub', all.length + (all.length === 1 ? ' Sprung' : ' Sprünge')));
      all.slice(-3).forEach(x => b.appendChild(x.st.jump && !x.st.jump.stay ? jumpCard(x.st, x.i) : gapCard(x.st, x.i)));
    }

    function paintAll() {
      updateText();
      const v = asked ? view() : null;
      Zerlegen.focusBanner(focusHost, v && v.idx != null ? v.idx : null, v && v.idx != null ? tok(v.chosen) : '', () => { focus = null; paintAll(); }, '');
      phoneEl.classList.toggle('show-jump', Z.isOpen('jump'));
      phoneEl.classList.toggle('show-src', Z.isOpen('mean'));
      if (Z.isOpen('cand')) paintCand(v); else Z.cols.cand.body.replaceChildren();
      if (Z.isOpen('mean')) paintMean(); else Z.cols.mean.body.replaceChildren();
      if (Z.isOpen('jump')) paintJump(v); else Z.cols.jump.body.replaceChildren();
      if (cloud) cloud.redraw();
      say();
    }

    /* ---------------- 3D-Wolke ---------------- */
    function makeCloud(hostEl) {
      ensureModel();
      if (!W) { hostEl.appendChild(empty('Wähl ein paar Texte aus, dann entsteht die Wolke.')); return null; }
      const wrap = el('div', 'p3-cloud');
      const cv = el('canvas', 'p3-canvas');
      cv.setAttribute('aria-label', 'Wortwolke in 3D. Ziehen zum Drehen, Punkt antippen zum Auswählen.');
      const side = el('div', 'p3-side');
      const tools = el('div', 'p3-tools');
      const search = el('input', 'textin'); search.type = 'search'; search.placeholder = 'Wort suchen'; search.setAttribute('aria-label', 'Wort in der Wolke suchen');
      const spin = el('button', 'btn sm', '⏸ Drehen anhalten'); spin.type = 'button';
      tools.append(search, spin);
      const info = el('div', 'p3-info');
      const honest = el('p', 'p3-honest');
      honest.append(el('b', null, 'Eigentlich hat jedes Wort ' + W.dims + ' Zahlen. '),
        document.createTextNode('Das Bild zeigt nur 3 Richtungen davon. Von den 3 ähnlichsten Wörtern eines Worts liegen hier nur ' + Math.round(W.keep3 * 100) + ' % auch im Bild nah – die Liste rechts rechnet mit allen ' + W.dims + ' Zahlen.'));
      side.append(tools, info);
      wrap.append(cv, side);
      hostEl.append(wrap, honest);

      let ax = -0.35, ay = 0.6, auto = !matchMedia('(prefers-reduced-motion: reduce)').matches, sel = null, raf = 0, drag = null, proj = [];
      const TC = {};
      function themeColor(t) {
        if (!TC[t]) TC[t] = getComputedStyle(document.documentElement).getPropertyValue('--t-' + (t || 'eigen')).trim() || '#888';
        return TC[t];
      }
      function highlight() {
        const hi = new Map();
        if (R) R.qwords.forEach(q => { if (q.w) hi.set(q.w, 'q'); });
        jumpPairs().forEach(([a, b]) => { hi.set(a, 'b'); hi.set(b, 'b'); });
        if (sel) { hi.set(sel, 's'); W.neighbors(sel, 5).forEach(([w]) => { if (!hi.has(w)) hi.set(w, 'n'); }); }
        return hi;
      }
      function draw() {
        const dpr = window.devicePixelRatio || 1;
        const w = cv.clientWidth, h = cv.clientHeight;
        if (!w || !h) return;
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        const cs = getComputedStyle(document.documentElement);
        const ink = cs.getPropertyValue('--ink').trim(), muted = cs.getPropertyValue('--muted').trim(), acc = cs.getPropertyValue('--cat-meaning').trim();
        const sa = Math.sin(ay), ca = Math.cos(ay), sb = Math.sin(ax), cb = Math.cos(ax);
        const R0 = Math.min(w, h) * 0.42;
        const P = p => {
          const x1 = p[0] * ca + p[2] * sa, z1 = -p[0] * sa + p[2] * ca;
          const y1 = p[1] * cb - z1 * sb, z2 = p[1] * sb + z1 * cb;
          const f = 2.6 / (2.6 + z2);
          return { x: w / 2 + x1 * R0 * f, y: h / 2 + y1 * R0 * f, z: z2, f };
        };
        proj = W.xyz.map((p, i) => Object.assign(P(p), { i }));
        const hi = highlight();
        /* Linien: ausgewähltes Wort zu seinen 5 nächsten (in 20 Zahlen gerechnet), Wolken-Sprünge. */
        g.lineWidth = 1.5;
        const line = (a, b, col, dash) => { const pa = proj[W.idx.get(a)], pb = proj[W.idx.get(b)]; if (!pa || !pb) return; g.strokeStyle = col; g.setLineDash(dash || []); g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke(); };
        if (sel) W.neighbors(sel, 5).forEach(([x]) => line(sel, x, acc + '99'));
        jumpPairs().forEach(([a, b]) => line(a, b, cs.getPropertyValue('--cat-candidates').trim(), [5, 4]));
        g.setLineDash([]);
        const order = proj.slice().sort((a, b) => b.z - a.z);
        order.forEach(p => {
          const word = W.words[p.i], hk = hi.get(word);
          const r = (hk ? 5 : 2.6) * p.f;
          g.globalAlpha = hk ? 1 : Math.max(0.25, 0.75 - p.z * 0.3);
          g.fillStyle = themeColor(W.theme[p.i]);
          g.beginPath();
          if (W.kind[p.i] === 'verb') g.rect(p.x - r, p.y - r, 2 * r, 2 * r); else g.arc(p.x, p.y, r, 0, Math.PI * 2);
          g.fill();
          if (hk) { g.lineWidth = 2; g.strokeStyle = hk === 'q' ? acc : hk === 'b' ? cs.getPropertyValue('--cat-candidates').trim() : ink; g.stroke(); }
        });
        g.globalAlpha = 1;
        g.font = '600 13px Fredoka, system-ui, sans-serif';
        g.textBaseline = 'bottom';
        order.forEach(p => {
          const word = W.words[p.i];
          if (!hi.has(word)) return;
          g.fillStyle = hi.get(word) === 'n' ? muted : ink;
          g.fillText(cap(word), p.x + 6, p.y - 4);
        });
        /* Die Frage als Stern */
        if (R && R.q) {
          const q = P(Wolke.pointNear(W, R.q));
          g.fillStyle = acc; g.font = '700 20px system-ui, sans-serif'; g.textBaseline = 'middle';
          g.fillText('★', q.x - 8, q.y); g.font = '600 12px Fredoka, system-ui, sans-serif'; g.fillText('deine Frage', q.x + 10, q.y);
        }
      }
      function paintInfo() {
        info.replaceChildren();
        if (!sel) {
          info.append(el('p', 'p1-sub', 'Tipp einen Punkt an'),
            el('p', 'p1-more', 'Farbe = Textwelt · ● Nomen · ■ Verb. Ziehen zum Drehen.'));
          return;
        }
        info.appendChild(el('p', 'p1-sub', cap(sel) + ' – am nächsten (mit allen ' + W.dims + ' Zahlen)'));
        W.neighbors(sel, 6).forEach(([x, s]) => {
          const row = el('button', 'p3-nb'); row.type = 'button';
          const bar = el('span', 'cbar'); const f = el('i'); f.style.width = Math.max(2, s * 100) + '%'; bar.appendChild(f);
          row.append(el('span', 'cword', cap(x)), bar, el('span', 'cp', pct(Math.max(0, s))));
          row.addEventListener('click', () => { sel = x; paintInfo(); draw(); });
          info.appendChild(row);
        });
      }
      function loop() {
        raf = 0;
        if (auto && !drag) { ay += 0.004; draw(); raf = requestAnimationFrame(loop); }
      }
      function kick() { if (!raf && auto) raf = requestAnimationFrame(loop); }
      cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ax, ay, moved: false }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        ay = drag.ay + dx * 0.01; ax = Math.max(-1.4, Math.min(1.4, drag.ax + dy * 0.01));
        draw();
      });
      cv.addEventListener('pointerup', e => {
        const d = drag; drag = null;
        if (d && !d.moved) {
          const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
          let best = null, bd = 18;
          proj.forEach(p => { const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = p; } });
          sel = best ? W.words[best.i] : null;
          paintInfo(); draw();
        }
        kick();
      });
      spin.addEventListener('click', () => { auto = !auto; spin.textContent = auto ? '⏸ Drehen anhalten' : '▶ Drehen'; kick(); });
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        if (!q) return;
        const hit = W.resolve(q) || W.words.find(w => w.startsWith(q));
        if (hit) { sel = hit; paintInfo(); draw(); }
      });
      const ro = new ResizeObserver(() => draw());
      ro.observe(cv);
      paintInfo(); draw(); kick();
      return {
        redraw: () => { draw(); },
        destroy: () => { if (raf) cancelAnimationFrame(raf); raf = 0; ro.disconnect(); auto = false; },
        pause: () => { if (raf) cancelAnimationFrame(raf); raf = 0; },
        resume: () => kick()
      };
    }
    function mountCloud() {
      const b = Z.cols.cloud.body;
      if (cloud) { cloud.destroy(); cloud = null; }
      b.replaceChildren();
      if (Z.isOpen('cloud')) cloud = makeCloud(b);
    }

    /* ---------------- Aufbau ---------------- */
    function render() {
      stopPlay();
      W = null; asked = false; session = null; R = null; focus = null;
      Z = Zerlegen.columns({
        store: 'tinylm-p3-offen',
        defaults: { cloud: true },
        onPointer: stopPlay,
        onChange: id => { if (id === 'cloud') mountCloud(); else paintAll(); }
      });
      const root = el('div', 'p1');
      const grid = el('div', 'p1-grid');
      const left = el('div', 'p1-left');
      left.appendChild(buildPhone());
      left.appendChild(el('p', 'p3-proto', 'Prototyp – Phase „Wörter als Punkte“'));
      const right = el('div', 'p1-right');
      const intro = el('div', 'p1-intro');
      focusHost = el('div', 'p1-focus');
      intro.appendChild(focusHost);
      right.appendChild(intro);
      const row = el('div', 'p1-cols');
      row.append(
        Z.column('cand', 'candidates', '🎲', 'Kandidaten', 'Welches Wort kommt?', 'kandidaten'),
        Z.column('mean', 'ask', '⭐', 'Frage als Punkt', 'Welche Texte liegen nah?', 'bedeutung'),
        Z.column('jump', 'meaning', '🦘', 'Wolken-Sprung', 'Wohin springt Tiny?', 'sprung'));
      right.appendChild(row);
      right.appendChild(Z.column('cloud', 'meaning', '🌌', 'Wortwolke', 'Welche Wörter liegen nah beieinander?', 'wolke', { wide: true }));
      const tsl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, spot: 'temp3',
        fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => { temp = Math.round(v * 10) / 10; }
      });
      Z.cols.cand.tools.appendChild(tsl.el);
      const jsl = Info.slider({
        label: 'Wolken-Sprung', min: 0, max: P3_JUMP_MAX, step: 0.01, value: jump, spot: 'jump3',
        fmt: x => x.toFixed(2).replace('.', ','), ends: ['🎯 bleibt', 'springt 🦘'],
        onInput: v => { jump = Math.round(v * 100) / 100; paintAll(); }
      });
      Z.cols.jump.tools.appendChild(jsl.el);
      grid.append(left, right);
      root.appendChild(grid);
      host.replaceChildren(root);
      paintAll();
      mountCloud();
    }

    render();
    State.on('corpus-changed', () => render());
    return {
      reveal: id => { const c = Z.cols[id]; if (!c) return; if (!Z.isOpen(id)) Z.setOpen(id, true); c.el.scrollIntoView({ block: 'nearest' }); },
      onHide: () => { stopPlay(); if (cloud) cloud.pause(); },
      onShow: () => { if (cloud) cloud.resume(); }
    };
  }
});
