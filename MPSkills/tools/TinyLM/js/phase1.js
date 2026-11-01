/* Phase 1: freies Schreiben ohne Frage — „Handy + Zerlegen“ (Sönke 01.11.2026).

   Links ein schmales HANDY: das ist das Sprachmodell, wie man es von außen kennt (Tiny, der Text,
   drei Knöpfe). Die Wörter tragen die Farbe ihres Quelltexts; unter dem Handy steht, welche Farbe
   welcher Text ist. Rechts wird ZERLEGT, und zwar rückwärts vom Wort aus:
     Kandidaten  (welches Wort kommt? — Temperatur gleich oben)
       ← Kontextfenster (auf welche letzten Wörter Tiny schaut; die N-Gramme in deinem Text)
       ← Quellen   (wo diese Wörter in den Texten stehen; unten alle genutzten Texte)
   Ganz oben die Leiste „Alle Quellen“ (Textwelten an/aus).

   Ohne Auswahl zeigen die Spalten das NÄCHSTE Wort (das „?“ im Handy). Tippt man ein Wort im Handy
   oder ein N-Gramm an, zeigen alle drei Spalten, wie GENAU DIESES Wort entstanden ist (Schritt-Daten
   aus ngram.js: cands, ctxUsed, si/pos). Ein Kandidat antippen = Quellen nur für dieses Wort.

   Erst aufklappen, dann im Handy sichtbar (Sönke 01.11.2026): Das Handy sieht zuerst aus wie ein
   ganz normales Sprachmodell (neutrale Bausteine, schlichter Schreib-Cursor, Tiny sagt nur
   „ich schreibe“). Jede Spalte rechts ist ein Reiter (zu Beginn zu). Erst wer sie öffnet, sieht
   ihre Ebene auch im Handy:
     Quellen        → Quellfarben, Sprünge zwischen Texten, Farblegende unter dem Handy
     Kontextfenster → die letzten Wörter sind umrandet (beim angetippten Wort: seine Wörter davor)
     Kandidaten     → „?“-Baustein, unter jedem Wort seine Wahrscheinlichkeit, Tiny erklärt die Wahl
   Offen/zu je Gerät in localStorage tinylm-p1-offen (Schaufenster: alles offen).

   Live-Regel (siehe CLAUDE.md): die Regler stehen in festen Köpfen der Spalten und werden nie neu
   gebaut; nur die Inhalte darunter. Wer in eine Liste tippt, hält das Schreiben an (pointerdown),
   damit der Eintrag zwischen Drücken und Loslassen nicht ausgetauscht wird. */
function sourceColor(si) {
  const hue = Math.round((si * 137.508) % 360);
  return 'hsl(' + hue + ' 60% 45%)';
}
function de1(x) { return x.toFixed(1).replace('.', ','); }

/* Kleine Farblegende als Chips: Punkt + Titel + Anzahl (auch Phase 2). */
function sourceChips(rows, more) {
  const box = el('div', 'srcchips');
  rows.forEach(r => {
    const c = el('span', 'srcchip');
    const d = el('i', 'dot'); d.style.background = r.color;
    c.append(d, el('span', 'srcchip-t', r.label));
    if (r.sub) c.appendChild(el('span', 'srcchip-n', r.sub));
    box.appendChild(c);
  });
  if (more) box.appendChild(el('span', 'srcchip more', more));
  return box;
}

Phases.register(1, {
  mount(host) {
    let session, n = 2, temp = 1, playing = false, timer = null;
    let focus = null;   /* null = nächstes Wort, sonst Index in session.steps */
    let pick = null;    /* angetippter Kandidat (Quellen nur für dieses Wort) */
    let textEl, cursor, screen, playBtn, placeholder, sayEl, legendHost, focusHost;
    const cols = {};
    let phoneEl = null;
    /* Welche Spalten offen sind (= welche Ebenen das Handy zeigt). */
    const OPEN_STORE = 'tinylm-p1-offen';
    const DEMO = /[?&]demo=1(&|$)/.test(location.search);
    const opened = (() => {
      if (DEMO) return { cand: true, ctx: true, src: true };
      try { const o = JSON.parse(localStorage.getItem(OPEN_STORE) || '{}'); return (o && typeof o === 'object') ? o : {}; }
      catch (e) { return {}; }
    })();
    const isOpen = id => !!opened[id];

    const isPunct = w => w === '.' || w === ',';
    /* Wörter so schreiben, wie sie meist in den Texten stehen (Nomen groß, Rest klein) —
       showWord() macht für Wortlisten alles groß, das liest sich in Wortfolgen falsch. */
    let casing = new Map();
    function buildCasing() {
      const cnt = new Map();
      session.sources.forEach(s => s.toks.forEach((tk, i) => {
        if (tk.punct || i === 0 || s.toks[i - 1].t === '.') return;
        const m = cnt.get(tk.t) || new Map();
        m.set(tk.raw, (m.get(tk.raw) || 0) + 1);
        cnt.set(tk.t, m);
      }));
      casing = new Map([...cnt].map(([t, m]) => [t, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
    }
    const word = w => casing.get(w) || showWord(w);
    const tokLabel = w => w === '.' ? '·' : w === ',' ? ',' : word(w);
    const fmtP = p => p >= 0.005 ? Math.round(p * 100) + ' %' : '<1 %';

    function freshSession() {
      const sources = buildSources(State.activeTexts(), () => 1, () => new Map());
      return createSession(sources);
    }

    function usedCounts() {
      const used = new Map();
      session.steps.forEach(st => { if (!isPunct(st.word)) used.set(st.si, (used.get(st.si) || 0) + 1); });
      return used;
    }

    /* Wahrscheinlichkeiten mit der aktuellen Temperatur neu ausrechnen (für ein früheres Wort:
       „was hätte die Temperatur damals bewirkt?“). Gleiche Formel wie candidates() in ngram.js. */
    function reweight(list, t) {
      const out = list.map(a => Object.assign({}, a));
      if (t <= 0.001) { out.forEach((a, i) => { a.p = i === 0 ? 1 : 0; }); return out; }
      let sum = 0;
      out.forEach(a => { a.s = Math.pow(a.w, 1 / t); sum += a.s; });
      out.forEach(a => { a.p = a.s / sum; });
      return out;
    }

    /* Was die drei Spalten gerade zeigen: das nächste Wort oder ein angetipptes. */
    function view() {
      if (focus != null && session.steps[focus]) {
        const st = session.steps[focus];
        return { idx: focus, C: { level: st.level, n: st.cands.n, list: reweight(st.cands.list, temp) }, ctx: st.ctxUsed, chosen: st.chosen, si: st.si, pos: st.pos };
      }
      if (!session.steps.length || !State.activeTexts().length) return null;
      const C = candidates(session, n, temp);
      return { idx: null, C, ctx: C.level > 0 ? session.ctx.slice(-C.level) : [], chosen: null };
    }

    /* Wortfolge so, wie sie im Handy steht (Original-Schreibung), ohne Satzzeichen. */
    function ctxText(v) {
      if (!v.ctx.length) return '';
      const end = v.idx == null ? session.steps.length : v.idx;
      const ps = pieces(session).slice(0, end).slice(-v.ctx.length);
      const words = ps.filter(p => !p.punct).map(p => p.txt);
      return words.length ? words.join(' ') : v.ctx.filter(w => !isPunct(w)).map(word).join(' ');
    }

    /* ---------------- Handy ---------------- */
    function updateText() {
      textEl.replaceChildren();
      let prevSi = null, last = null;
      pieces(session).forEach((p, idx) => {
        if (idx > 0 && !p.punct) textEl.appendChild(document.createTextNode(' '));
        if (p.punct) { if (last) last.textContent += p.txt; else textEl.appendChild(document.createTextNode(p.txt)); return; }
        if (prevSi != null && p.si !== prevSi) {
          const seam = el('span', 'seam');
          seam.title = 'Hier springt Tiny zu einem anderen Text.';
          textEl.appendChild(seam);
        }
        const span = el('span', 'srcword', p.txt);
        span.style.setProperty('--sc', sourceColor(p.si));
        span.dataset.i = String(p.i);
        span.title = 'Antippen zum Zerlegen';
        const st = session.steps[p.i];
        const ch = st.cands.list.find(a => a.word === st.chosen);
        if (ch) span.dataset.p = fmtP(ch.p);
        if (p.i === focus) span.classList.add('sel');
        textEl.appendChild(span);
        last = span;
        prevSi = p.si;
      });
      markWindow();
      cursor.classList.toggle('sel', focus == null && session.steps.length > 0);
      textEl.appendChild(cursor);
      placeholder.hidden = session.steps.length > 0;
      textEl.hidden = !session.steps.length;
      if (focus == null) screen.scrollTop = screen.scrollHeight;
      say();
    }

    /* Kontextfenster im Handy umranden — nur wenn die Spalte offen ist. Beim angetippten Wort die
       Wörter, auf die Tiny damals geschaut hat; sonst die letzten Wörter vor dem „?“. */
    function markWindow() {
      if (!isOpen('ctx')) return;
      const v = view();
      if (!v || !v.C.level) return;
      const end = v.idx == null ? session.steps.length : v.idx;
      for (let i = end - v.C.level; i < end; i++) {
        const sp = textEl.querySelector('.srcword[data-i="' + i + '"]');
        if (sp) sp.classList.add('win');
      }
    }

    /* Ebenen im Handy an/aus (CSS-Klassen am Handy). */
    function syncLayers() {
      if (!phoneEl) return;
      phoneEl.classList.toggle('show-src', isOpen('src'));
      phoneEl.classList.toggle('show-ctx', isOpen('ctx'));
      phoneEl.classList.toggle('show-cand', isOpen('cand'));
      updateText();
      updateLegend();
    }

    /* Tiny sagt in einem Satz, was es gerade tut. Die Erklärung „nach … kam meistens …“ ist schon
       Zerlegen — die gibt es erst mit offenem Kontextfenster oder offenen Kandidaten. */
    function say() {
      if (!sayEl || !session) return;
      if (!State.activeTexts().length) { sayEl.textContent = 'Ich habe keine Texte! Schalte oben unter „Alle Quellen“ welche an.'; return; }
      const v = view();
      if (!v) { sayEl.textContent = 'Drück auf ▶ – dann lege ich los!'; return; }
      if (!isOpen('cand') && !isOpen('ctx')) {
        sayEl.textContent = playing ? 'Ich schreibe …' : 'Soll ich weiterschreiben? Rechts kannst du nachsehen, wie ich das mache.';
        return;
      }
      const top = v.C.list[0];
      if (v.idx != null) {
        sayEl.replaceChildren(document.createTextNode('Rechts siehst du, wie ich auf „'),
          el('b', null, word(v.chosen)), document.createTextNode('“ gekommen bin.'));
        return;
      }
      if (v.C.level === 0 || !top) { sayEl.textContent = 'Neuer Satz! Ich nehme einen Satzanfang aus meinen Texten …'; return; }
      sayEl.replaceChildren(document.createTextNode('Nach „'), el('b', null, ctxText(v)),
        document.createTextNode('“ kam meistens „'), el('b', null, word(top.word)),
        document.createTextNode(temp === 0 ? '“ … das nehme ich!' : '“ … ich würfle!'));
    }

    function updateLegend() {
      legendHost.replaceChildren();
      const used = usedCounts();
      if (!used.size || !isOpen('src')) return;
      const top = [...used.entries()].sort((a, b) => b[1] - a[1]);
      legendHost.append(el('p', 'p1-legend-lab', 'Die Farben im Handy = aus diesen Texten'),
        sourceChips(top.slice(0, 5).map(([si, c]) => ({ color: sourceColor(si), label: session.sources[si].doc.title, sub: String(c) })),
          top.length > 5 ? '+ ' + (top.length - 5) + ' Texte' : ''));
    }

    /* ---------------- Zerlegen: drei Spalten ---------------- */
    function applyOpen(id) {
      const c = cols[id], on = isOpen(id);
      c.el.classList.toggle('closed', !on);
      c.toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      c.tools.hidden = c.body.hidden = !on;
      c.peek.hidden = on;
    }
    function setOpen(id, on) {
      opened[id] = on;
      if (!DEMO) { try { localStorage.setItem(OPEN_STORE, JSON.stringify(opened)); } catch (e) { /* egal */ } }
      applyOpen(id);
      syncLayers();
      paintCols();
    }

    function column(id, cat, icon, title, question, helpKey, reveals) {
      const c = el('section', 'p1-col');
      c.dataset.card = id;
      c.style.setProperty('--cat-color', 'var(--cat-' + cat + ')');
      c.style.setProperty('--cat-tint', 'var(--cat-' + cat + '-tint)');
      const head = el('div', 'p1-col-head');
      const toggle = el('button', 'p1-col-toggle');
      toggle.type = 'button';
      const t = el('div', 'p1-col-t');
      t.append(el('h3', null, title), el('p', null, question));
      const chev = el('span', 'panel-chev');
      chev.setAttribute('aria-hidden', 'true');
      toggle.append(el('span', 'p1-col-ico', icon), t, chev);
      head.appendChild(toggle);
      const hb = el('button', 'help-btn', '?');
      hb.type = 'button';
      hb.dataset.help = helpKey;
      hb.setAttribute('aria-label', 'Erklärung: ' + title);
      hb.addEventListener('click', () => { if (!isOpen(id)) setOpen(id, true); requestAnimationFrame(() => Explain.show(helpKey, c)); });
      head.appendChild(hb);
      /* Zu: ein Satz, was das Öffnen im Handy sichtbar macht. */
      const peek = el('p', 'p1-col-peek', reveals);
      const tools = el('div', 'p1-col-tools');
      const body = el('div', 'p1-col-body');
      /* In eine Liste tippen = Schreiben anhalten (sonst wäre der Eintrag beim Loslassen schon neu). */
      body.addEventListener('pointerdown', () => stopPlay());
      c.append(head, peek, tools, body);
      cols[id] = { el: c, tools, body, toggle, peek };
      toggle.addEventListener('click', () => setOpen(id, !isOpen(id)));
      applyOpen(id);
      return c;
    }

    function empty(text) { return el('p', 'card-empty', text); }

    /* Wortfolge als kleine Bausteine (für Kontextfenster und N-Gramm-Liste). */
    function gram(ctx, next, nextCls) {
      const g = el('span', 'gram');
      if (!ctx.length) g.appendChild(el('span', 'gtok start', 'Satzanfang'));
      ctx.forEach(w => g.appendChild(el('span', 'gtok' + (isPunct(w) ? ' p' : ''), tokLabel(w))));
      if (next !== undefined) {
        g.appendChild(el('span', 'garr', '→'));
        g.appendChild(el('span', 'gtok ' + (nextCls || 'next'), next == null ? '?' : tokLabel(next)));
      }
      return g;
    }

    /* Kandidaten: senkrechte Liste, Balken = Wahrscheinlichkeit. */
    function paintCand(v) {
      const b = cols.cand.body;
      b.replaceChildren();
      if (!v) { b.appendChild(empty('Noch nichts geschrieben. Drück im Handy auf ▶.')); return; }
      const line = el('p', 'p1-line');
      if (v.C.level === 0) line.append(document.createTextNode('Neuer Satz – so fingen Sätze in den Texten an:'));
      else line.append(document.createTextNode('Nach „'), el('b', null, ctxText(v)), document.createTextNode('“ stand in den Texten:'));
      b.appendChild(line);
      const MAX = 8;
      const list = el('ol', 'clist');
      v.C.list.slice(0, MAX).forEach(a => {
        const li = el('li');
        const row = el('button', 'crow' + (a.word === v.chosen ? ' chosen' : '') + (a.word === pick ? ' picked' : ''));
        row.type = 'button';
        row.title = 'Wo steht das? (rechts bei den Quellen)';
        const bar = el('span', 'cbar');
        const fill = el('i');
        fill.style.width = Math.max(2, a.p * 100) + '%';
        bar.appendChild(fill);
        row.append(el('span', 'cword', word(a.word)), bar, el('span', 'cp', fmtP(a.p)), el('span', 'cn', a.occ.length + '×'));
        if (a.word === v.chosen) row.appendChild(el('span', 'ctag', '🎲 gezogen'));
        row.addEventListener('click', () => { pick = pick === a.word ? null : a.word; paintCand(view()); paintSrc(view()); });
        li.appendChild(row);
        list.appendChild(li);
      });
      b.appendChild(list);
      const more = v.C.list.length - MAX;
      if (more > 0) b.appendChild(el('p', 'p1-more', '… und ' + more + ' weitere Wörter'));
    }

    /* Kontextfenster: jetzt + alle N-Gramme, die im Text schon benutzt wurden. */
    function paintCtx(v) {
      const b = cols.ctx.body;
      b.replaceChildren();
      if (!v) { b.appendChild(empty('Hier siehst du gleich, auf welche Wörter Tiny schaut.')); return; }
      const now = el('div', 'ctxnow');
      now.appendChild(el('p', 'p1-sub', v.idx == null ? 'Tiny schaut jetzt auf' : 'Für „' + word(v.chosen) + '“ schaute Tiny auf'));
      now.appendChild(gram(v.ctx, v.idx == null ? null : v.chosen, v.idx == null ? 'next' : 'chosen'));
      const total = v.C.list.reduce((s, a) => s + a.occ.length, 0);
      if (v.C.level > 0) now.appendChild(el('p', 'p1-count', total + '× in den Texten gefunden'));
      const want = v.C.n || n;
      const realWords = v.ctx.length;
      if (v.C.level < want && (v.idx == null ? session.steps.length : v.idx) >= want) {
        now.appendChild(el('p', 'p1-fall', v.C.level === 0
          ? 'Die letzten Wörter stehen so in keinem Text – also neuer Satz.'
          : 'Die letzten ' + want + ' Wörter stehen so in keinem Text – Tiny nimmt nur ' + (realWords === 1 ? 'das letzte' : 'die letzten ' + realWords) + '.'));
      }
      b.appendChild(now);

      /* N-Gramme deines Textes: Wortfolge → Wort, wie oft genau so in den Texten. Neueste oben,
         jede Folge nur einmal. Antippen = dieses Wort zerlegen. */
      const seen = new Map();
      for (let i = session.steps.length - 1; i >= 0; i--) {
        const st = session.steps[i];
        if (isPunct(st.word) && st.level === 0) continue;
        const key = st.ctxUsed.join(' ') + ' > ' + st.chosen;
        if (seen.has(key)) { seen.get(key).times++; continue; }
        const cand = st.cands.list.find(a => a.word === st.chosen);
        seen.set(key, { i, st, times: 1, count: cand ? cand.occ.length : 0 });
      }
      if (!seen.size) return;
      b.appendChild(el('p', 'p1-sub', 'N-Gramme in deinem Text'));
      const list = el('div', 'nglist');
      [...seen.values()].slice(0, 40).forEach(g => {
        const row = el('button', 'ngrow' + (g.i === v.idx ? ' on' : ''));
        row.type = 'button';
        row.appendChild(gram(g.st.ctxUsed, g.st.chosen, 'chosen'));
        row.appendChild(el('span', 'ngn', g.count + '×'));
        row.title = '„' + g.st.ctxUsed.filter(w => !isPunct(w)).map(word).join(' ') + ' ' + word(g.st.chosen) + '“ steht ' + g.count + '× in den Texten';
        row.addEventListener('click', () => setFocus(g.i === focus ? null : g.i));
        list.appendChild(row);
      });
      b.appendChild(list);
    }

    /* Fundstellen einer Wortfolge (optional mit dem Wort danach) in den aktiven Texten. */
    function findOcc(tail, next) {
      const k = tail.length, out = [];
      session.sources.forEach(s => {
        const T = s.toks;
        for (let i = Math.max(0, k - 1); i < T.length - 1; i++) {
          if (k === 0) { if (T[i].t !== '.') continue; }
          else {
            let ok = true;
            for (let j = 0; j < k; j++) { if (T[i - j].t !== tail[k - 1 - j]) { ok = false; break; } }
            if (!ok) continue;
          }
          if (next && T[i + 1].t !== next) continue;
          out.push({ si: s.si, start: i - k + 1, pos: i + 1 });
        }
      });
      return out;
    }

    function snippet(o) {
      const T = session.sources[o.si].toks;
      const from = Math.max(1, o.start - 5), to = Math.min(T.length - 1, o.pos + 4);
      const p = el('p', 'fsnip');
      if (from > 1) p.appendChild(document.createTextNode('… '));
      for (let i = from; i <= to; i++) {
        const tk = T[i];
        if (i > from && !tk.punct) p.appendChild(document.createTextNode(' '));
        const cls = i === o.pos ? 'fx-next' : (i >= o.start && i < o.pos ? 'fx-ctx' : null);
        if (cls) p.appendChild(el('mark', cls, tk.raw));
        else p.appendChild(document.createTextNode(tk.raw));
      }
      if (to < T.length - 1) p.appendChild(document.createTextNode(' …'));
      return p;
    }

    function paintSrc(v) {
      const b = cols.src.body;
      b.replaceChildren();
      if (!v) { b.appendChild(empty('Hier steht gleich, aus welchen Texten Tiny die Wörter holt.')); return; }
      const wsel = pick || v.chosen;
      if (v.C.level === 0 && !wsel) {
        b.appendChild(el('p', 'p1-line', 'Neuer Satz: Tiny nimmt einen Satzanfang aus irgendeinem Text. Tipp links einen Kandidaten an, dann siehst du, wo er steht.'));
      } else {
        const occ = findOcc(v.ctx, wsel);
        /* Die Stelle, aus der das Wort wirklich genommen wurde, kommt nach oben. */
        if (v.idx != null && wsel === v.chosen) {
          const k = occ.findIndex(o => o.si === v.si && o.pos === v.pos);
          if (k > 0) occ.unshift(occ.splice(k, 1)[0]);
        }
        const line = el('p', 'p1-line');
        line.append(document.createTextNode('„'), el('b', null, [ctxText(v), wsel ? word(wsel) : ''].filter(Boolean).join(' ') || '…'),
          document.createTextNode('“ steht ' + occ.length + '× in den Texten:'));
        b.appendChild(line);
        const MAX = 5;
        const list = el('div', 'flist');
        occ.slice(0, MAX).forEach(o => {
          const doc = session.sources[o.si].doc;
          const f = el('div', 'fund');
          f.style.setProperty('--sc', sourceColor(o.si));
          const h = el('button', 'fhead');
          h.type = 'button';
          h.title = 'Text lesen';
          h.append(el('i', 'dot'), el('span', 'ft', doc.title));
          h.addEventListener('click', () => App.openTexts(doc.own ? 'eigen' : doc.theme));
          f.appendChild(h);
          if (v.idx != null && o.si === v.si && o.pos === v.pos && wsel === v.chosen) {
            f.classList.add('taken');
            h.appendChild(el('span', 'ftag', '✓ von hier genommen'));
          }
          f.appendChild(snippet(o));
          list.appendChild(f);
        });
        b.appendChild(list);
        if (occ.length > MAX) b.appendChild(el('p', 'p1-more', '… und ' + (occ.length - MAX) + ' weitere Stellen'));
      }

      /* Alle Texte, aus denen dein Text bisher stammt — mit Verweis nach oben auf „Alle Quellen“. */
      const used = usedCounts();
      if (!used.size) return;
      const all = el('div', 'p1-used');
      all.appendChild(el('p', 'p1-sub', 'Dein Text stammt aus ' + used.size + (used.size === 1 ? ' Text' : ' Texten')));
      const total = [...used.values()].reduce((a, c) => a + c, 0);
      const rows = el('div', 'originrows');
      [...used.entries()].sort((a, c) => c[1] - a[1]).slice(0, 5).forEach(([si, count]) => {
        const row = el('div', 'originrow');
        const bar = el('div', 'bar');
        const fill = el('i');
        fill.style.width = Math.max(3, 100 * count / total) + '%';
        fill.style.background = sourceColor(si);
        bar.appendChild(fill);
        row.append(el('span', 'small', session.sources[si].doc.title), bar, el('span', 'num', String(count)));
        rows.appendChild(row);
      });
      all.appendChild(rows);
      const up = el('button', 'btn sm p1-up', '↑ Alle Quellen');
      up.type = 'button';
      up.addEventListener('click', () => {
        const bar = document.getElementById('alle-quellen');
        if (!bar) return;
        bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        bar.classList.add('flash');
        setTimeout(() => bar.classList.remove('flash'), 1000);
      });
      all.appendChild(up);
      b.appendChild(all);
    }

    function paintFocus(v) {
      focusHost.replaceChildren();
      if (v && v.idx != null) {
        focusHost.className = 'p1-focus on';
        const back = el('button', 'btn sm', '× zurück zum nächsten Wort');
        back.type = 'button';
        back.addEventListener('click', () => setFocus(null));
        focusHost.append(el('span', null, 'Du zerlegst Wort ' + (pieces(session).slice(0, v.idx + 1).filter(p => !p.punct).length) + ': '),
          el('b', 'p1-focus-w', word(v.chosen)), back);
      } else {
        focusHost.className = 'p1-focus';
        focusHost.append(el('span', null, session.steps.length
          ? (Object.keys(cols).some(isOpen)
            ? 'Zerlegt wird das nächste Wort. Tipp im Handy auf ein Wort, um zu sehen, wie es entstanden ist.'
            : 'Öffne rechts eine Spalte – dann siehst du auch im Handy, was dahintersteckt.')
          : 'Lass Tiny schreiben – dann zerlegen wir hier jedes Wort.'));
      }
    }

    function paintCols() {
      const v = view();
      paintFocus(v);
      if (isOpen('cand')) paintCand(v); else cols.cand.body.replaceChildren();
      if (isOpen('ctx')) paintCtx(v); else cols.ctx.body.replaceChildren();
      if (isOpen('src')) paintSrc(v); else cols.src.body.replaceChildren();
    }

    function setFocus(i) {
      stopPlay();
      focus = i;
      pick = null;
      updateText();
      paintCols();
    }

    /* ---------------- Schreiben ---------------- */
    function doStep() {
      if (!State.activeTexts().length) return false;
      focus = null; pick = null;
      const C = step(session, n, temp);
      if (!C) { stopPlay(); return false; }
      updateText();
      updateLegend();
      paintCols();
      if (session.steps.length >= 400) stopPlay();
      return true;
    }

    function syncPlay() {
      if (!playBtn) return;
      playBtn.textContent = playing ? '❚❚ Pause' : (session.steps.length ? '▶ Weiter' : '▶ Schreiben');
      playBtn.classList.toggle('playing', playing);
      say();
    }
    function startPlay() {
      if (playing || !State.activeTexts().length) return;
      playing = true;
      syncPlay();
      timer = setInterval(() => { if (!doStep()) stopPlay(); }, 550);
    }
    function stopPlay() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      syncPlay();
    }

    function buildPhone() {
      const phone = el('div', 'phone');
      phoneEl = phone;
      const head = el('div', 'phone-head');
      const who = el('div', 'phone-who');
      who.append(el('b', null, 'Tiny'), el('span', null, 'tiny · model · Phase 1'));
      const hb = Help.btn('p1', 'sm');
      head.append(tinyEl('normal'), who, hb);

      screen = el('div', 'phone-screen');
      placeholder = el('p', 'paper-ph', 'Hier schreibt gleich Tiny …');
      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      cursor.title = 'Das nächste Wort – antippen zum Zerlegen';
      textEl.appendChild(cursor);
      screen.append(placeholder, textEl);
      /* Wort antippen = zerlegen; „?“ = zurück zum nächsten Wort. */
      textEl.addEventListener('pointerdown', ev => { if (ev.target.closest('.srcword, .cursor')) stopPlay(); });
      textEl.addEventListener('click', ev => {
        const w = ev.target.closest('.srcword');
        if (w) { const i = +w.dataset.i; setFocus(i === focus ? null : i); return; }
        if (ev.target.closest('.cursor')) setFocus(null);
      });

      const sayBox = el('div', 'phone-say');
      sayEl = el('p', 'tiny-bubble');
      sayBox.append(tinyEl('normal'), sayEl);

      const controls = el('div', 'phone-controls');
      playBtn = el('button', 'btn primary', '▶ Schreiben');
      playBtn.type = 'button';
      playBtn.dataset.spot = 'play';
      const stepBtn = el('button', 'btn', '+1 Wort');
      stepBtn.type = 'button';
      stepBtn.dataset.spot = 'step';
      const resetBtn = el('button', 'btn', '↺');
      resetBtn.type = 'button';
      resetBtn.title = 'Neu starten';
      resetBtn.setAttribute('aria-label', 'Neu starten');
      resetBtn.dataset.spot = 'reset';
      controls.append(playBtn, stepBtn, resetBtn);
      playBtn.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
      stepBtn.addEventListener('click', () => { stopPlay(); doStep(); });
      resetBtn.addEventListener('click', () => render());

      phone.append(el('span', 'phone-notch'), head, screen, sayBox, controls);
      return phone;
    }

    function render() {
      stopPlay();
      session = freshSession();
      buildCasing();
      focus = null; pick = null;

      const root = el('div', 'p1');
      root.appendChild(App.textweltenBar());
      const grid = el('div', 'p1-grid');

      const left = el('div', 'p1-left');
      left.appendChild(buildPhone());
      legendHost = el('div', 'p1-legend');
      left.appendChild(legendHost);
      if (!State.activeTexts().length) left.appendChild(el('p', 'warnline', 'Keine Texte ausgewählt – schalte oben unter „Alle Quellen“ welche an.'));

      const right = el('div', 'p1-right');
      const intro = el('div', 'p1-intro');
      intro.append(el('p', 'eyebrow', 'So kommt Tiny auf das Wort'),
        el('h2', null, 'Tiny schaut auf die letzten Wörter, sucht sie in den Texten, zählt, was danach kam – und würfelt.'));
      focusHost = el('div', 'p1-focus');
      intro.appendChild(focusHost);
      right.appendChild(intro);

      const row = el('div', 'p1-cols');
      row.append(
        column('cand', 'candidates', '🎲', 'Kandidaten', 'Welches Wort kommt?', 'kandidaten', 'Öffnen: Im Handy steht unter jedem Wort, wie wahrscheinlich es war.'),
        column('ctx', 'context', '👀', 'Kontextfenster', 'Auf welche Wörter schaut Tiny?', 'kontext', 'Öffnen: Im Handy siehst du, auf welche Wörter Tiny gerade schaut.'),
        column('src', 'origin', '📑', 'Quellen', 'Wo steht das in den Texten?', 'herkunft', 'Öffnen: Im Handy bekommt jedes Wort die Farbe seines Textes.'));
      right.appendChild(row);

      /* Regler in den festen Köpfen — werden nie neu gebaut. */
      const tsl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, spot: 'temp',
        fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => { temp = Math.round(v * 10) / 10; paintCand(view()); say(); }
      });
      cols.cand.tools.appendChild(tsl.el);
      const nsl = Info.slider({
        label: 'Kontextfenster', min: 1, max: 6, step: 1, value: n, spot: 'nslider',
        fmt: v => v + (v === 1 ? ' Wort' : ' Wörter'), ends: ['kurz', 'lang'],
        onInput: v => { n = v; paintCols(); say(); }
      });
      cols.ctx.tools.appendChild(nsl.el);

      grid.append(left, right);
      root.appendChild(grid);
      host.replaceChildren(root);
      syncLayers();
      paintCols();
    }

    render();
    State.on('corpus-changed', () => render());

    return {
      reveal: id => { const c = cols[id]; if (c) c.el.scrollIntoView({ block: 'nearest' }); },
      onHide: stopPlay
    };
  }
});
