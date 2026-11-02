/* Phase 2: Frage & Antwort — „Handy + Zerlegen“ wie Phase 1 (Sönke 02.11.2026).

   Links das HANDY mit dem Chat: Tiny grüßt, deine Frage rechts, Tinys Antwort als Bausteine,
   unten Vorschläge und das Eingabefeld (.qform bleibt für das Schaufenster). Rechts wird ZERLEGT,
   in denselben drei Spalten wie in Phase 1 (gleiche Plätze, gleiche Farben):
     Kandidaten     (welches Wort kommt? — Temperatur + „Dieselbe Frage nochmal“ im festen Kopf)
     Frage zerlegen (statt Kontextfenster: welche Wörter der Frage Tiny sucht)
     Quellen        (die 3 passendsten Texte A · B · C und wo das Wort darin steht)
   darunter breit die Wortkarte.

   Erst aufklappen, dann im Handy sichtbar (wie Phase 1):
     Quellen        → Wörter in der Farbe von A · B · C, Sprünge, Farblegende unter dem Handy
     Frage zerlegen → die Wörter deiner Frage im Handy grau / blau / rot, die gesuchten Wörter
     Kandidaten     → „?“-Baustein für das nächste Wort
   Offen/zu je Gerät in localStorage tinylm-p2-offen. Ein Wort im Handy antippen = genau diesen
   Schritt zerlegen (Schritt-Daten aus ngram.js), Kandidat antippen = Quellen nur für dieses Wort.

   Passt kein Text zur Frage, schweigt Tiny NICHT: es nimmt alle Texte, setzt das unbekannte Wort
   aus der Frage als Satzanfang („Der Eiffelturm ist …“) und schreibt einfach weiter — klingt
   sicher, ist aber ausgedacht (Halluzinieren). Sönke 01.11.2026. */
const SRC = ['A', 'B', 'C'];
const srcVar = i => 'var(--src-' + ['a', 'b', 'c'][i] + ')';
const SUGGEST2 = ['Ist Pluto ein Planet?', 'Was frisst eine Kornnatter?', 'Wie lernt eine KI?', 'Wie hoch ist der Eiffelturm?'];
/* Artikel vor dem unbekannten Wort → Satzanfang der ausgedachten Antwort */
const GUESS_ART = { der: 'der', die: 'die', das: 'das', dem: 'der', den: 'der', des: 'der', ein: 'ein', eine: 'eine', einen: 'ein', einem: 'ein', einer: 'eine' };

function buildPhase2Sources(R, k) {
  const top = R.results.filter(r => r.score > 0).slice(0, k || 3);
  if (!top.length) return null;
  const maxS = top[0].score;
  const nq = Math.max(1, R.ql.filter(x => x.known).length);
  const sources = buildSources(top.map(r => r.doc), () => 1, () => new Map());
  sources.forEach((s, idx) => {
    const r = top[idx];
    s.weight = r.score / maxS;
    s.r = r;
    const rel = new Map();
    r.marks.forEach((m, ti) => {
      const sent = r.doc.toks[ti].sent;
      const key = sent + ':' + m.q;
      if (!rel.has(key)) rel.set(key, m.sim);
    });
    const sentRel = new Map();
    rel.forEach((v, key) => { const sent = Number(key.split(':')[0]); sentRel.set(sent, (sentRel.get(sent) || 0) + v); });
    sentRel.forEach((v, sent) => sentRel.set(sent, Math.min(1, v / nq)));
    s.sentRel = sentRel;
  });
  return sources;
}

Phases.register(2, {
  mount(host) {
    let M = null, R = null, session = null, canned = false, asked = false;
    let temp = 1, playing = false, timer = null, mapCtl = null;
    let focus = null, pick = null;
    let textEl, cursor, playBtn, againBtn, reaskBtn, input, legendHost, askedEl, placeholder, answerEl, metaEl, warnEl, screen, focusHost;
    let phoneEl = null, Z = null;
    let guessWord = '';
    const isPunct = w => w === '.' || w === ',';
    /* Farbe eines Quelltexts: A/B/C bei gefundenen Quellen, sonst (ausgedacht) die Farbe aus Phase 1. */
    const colorOf = si => si < 0 ? 'var(--muted)' : canned ? sourceColor(si) : srcVar(si);
    const nameOf = si => si < 0 ? 'deine Frage' : canned ? session.sources[si].doc.title : 'Text ' + SRC[si];
    const fmtP = p => p >= 0.005 ? Math.round(p * 100) + ' %' : '<1 %';
    const word = w => showWord(w);
    const tokLabel = w => w === '.' ? '·' : w === ',' ? ',' : word(w);

    /* Keine passende Quelle: aus ALLEN Texten raten, mit dem unbekannten Fragewort als Satzanfang. */
    function guessSession(q) {
      const sess = createSession(buildSources(State.activeTexts(), () => 1, () => new Map()));
      const unknown = new Set(R.ql.filter(x => !x.known).map(x => x.raw));
      const toks = tokenize(q).filter(t => !t.punct);
      /* Lieber ein großgeschriebenes Wort (Nomen) als „hoch“ aus „Wie hoch ist …“. */
      const cand = toks.map((t, k) => k).filter(k => unknown.has(toks[k].raw));
      const noun = cand.filter(k => k > 0 && /^[A-ZÄÖÜ]/.test(toks[k].raw));
      const i = noun.length ? noun[0] : (cand.length ? cand[cand.length - 1] : -1);
      guessWord = '';
      if (i < 0) return sess;
      const subj = toks[i].raw.charAt(0).toUpperCase() + toks[i].raw.slice(1);
      guessWord = subj;
      const art = i > 0 ? GUESS_ART[toks[i - 1].t] : null;
      (art ? [art, subj, 'ist'] : [subj, 'ist']).forEach(w => {
        sess.steps.push({ word: w.toLowerCase(), raw: w, si: -1, seed: true, cands: null });
        sess.ctx.push(w.toLowerCase());
      });
      return sess;
    }

    function rebuildModel() {
      M = buildModel(State.activeTexts());
      if (mapCtl) mapCtl.destroy();
      mapCtl = WordMap.create(M, {
        highlight: () => (R && !canned) ? R.ql.filter(x => x.inMap).map(x => x.lemma) : [],
        texts: () => State.activeTexts()
      });
    }

    /* Gleiche Formel wie candidates() in ngram.js — für ein früheres Wort mit der Temperatur von jetzt. */
    function reweight(list, t) {
      const out = list.map(a => Object.assign({}, a));
      if (t <= 0.001) { out.forEach((a, i) => { a.p = i === 0 ? 1 : 0; }); return out; }
      let sum = 0;
      out.forEach(a => { a.s = Math.pow(a.w, 1 / t); sum += a.s; });
      out.forEach(a => { a.p = a.s / sum; });
      return out;
    }

    /* Kandidaten für das nächste Wort. Direkt nach „Der Eiffelturm ist“ kein Satzzeichen —
       sonst endet die ausgedachte Antwort sofort. */
    function nextCands() {
      const last = session.steps[session.steps.length - 1];
      const C = candidates(session, 6, temp);
      if (last && last.seed) {
        const list = C.list.filter(a => !isPunct(a.word));
        const sum = list.reduce((x, a) => x + a.p, 0) || 1;
        list.forEach(a => { a.p /= sum; });
        C.list = list;
      }
      return C;
    }

    /* Was die Spalten zeigen: das nächste Wort oder ein angetipptes. */
    function view() {
      if (!asked || !session) return null;
      if (focus != null && session.steps[focus]) {
        const st = session.steps[focus];
        if (st.seed) return { idx: focus, seed: true, chosen: st.word, ctx: [], C: null };
        return { idx: focus, C: { level: st.level, list: reweight(st.cands.list, temp) }, ctx: st.ctxUsed, chosen: st.chosen, si: st.si, pos: st.pos };
      }
      const C = nextCands();
      return { idx: null, C, ctx: C.level > 0 ? session.ctx.slice(-C.level) : [], chosen: null };
    }
    const atStart = v => v.C && (v.C.level === 0 || v.ctx.every(isPunct));
    function ctxText(v) {
      if (!v.ctx.length) return '';
      const end = v.idx == null ? session.steps.length : v.idx;
      const words = pieces(session).slice(0, end).slice(-v.ctx.length).filter(p => !p.punct).map(p => p.txt);
      return words.length ? words.join(' ') : v.ctx.filter(w => !isPunct(w)).map(word).join(' ');
    }
    function usedCounts() {
      const used = new Map();
      if (session) session.steps.forEach(st => { if (st.si >= 0 && !isPunct(st.word)) used.set(st.si, (used.get(st.si) || 0) + 1); });
      return used;
    }

    /* ---------------- Handy ---------------- */
    /* Antwort als Bausteine — Punkt und Komma eigene Bausteine wie in Phase 1. */
    function updateText() {
      textEl.replaceChildren();
      if (!session) { textEl.appendChild(cursor); return; }
      let prevSi = null;
      pieces(session).forEach((p, idx) => {
        if (idx > 0) textEl.appendChild(document.createTextNode(' '));
        if (prevSi != null && p.si !== prevSi && p.si >= 0 && prevSi >= 0) {
          const seam = el('span', 'seam');
          seam.title = 'Hier wechselt Tiny mitten im Satz zu einem anderen Text.';
          textEl.appendChild(seam);
        }
        const span = el('span', 'srcword' + (p.punct ? ' punct' : '') + (p.si < 0 ? ' seedword' : ''), p.txt);
        span.style.setProperty('--sc', colorOf(p.si));
        span.dataset.i = String(p.i);
        span.title = 'Antippen zum Zerlegen';
        if (p.i === focus) span.classList.add('sel');
        textEl.appendChild(span);
        prevSi = p.si;
      });
      cursor.classList.toggle('sel', focus == null && session.steps.length > 0);
      textEl.appendChild(cursor);
      if (focus == null) screen.scrollTop = screen.scrollHeight;
    }

    /* Die Frage im Handy: jedes Wort mit seiner Rolle — sichtbar erst mit offener Spalte „Frage zerlegen“. */
    function paintQuestion() {
      askedEl.replaceChildren();
      if (!R) return;
      tokenize(R.question).forEach((t, k) => {
        if (k > 0 && !t.punct) askedEl.appendChild(document.createTextNode(' '));
        if (t.punct) { askedEl.appendChild(document.createTextNode(t.raw)); return; }
        const isStop = STOP.has(t.t) || /^\d+$/.test(t.t) || t.t.length < 2;
        const x = isStop ? null : R.ql.find(y => y.raw === t.raw);
        const cls = isStop || !x ? 'off' : (x.known ? 'known' : 'unknown');
        const s = el('span', 'qw ' + cls, t.raw);
        s.title = cls === 'off' ? 'Füllwort – fliegt raus' : cls === 'known' ? 'sucht Tiny in den Texten' : 'kennt Tiny nicht';
        askedEl.appendChild(s);
      });
    }

    function updateLegend() {
      legendHost.replaceChildren();
      if (!asked || !session || !Z.isOpen('src')) return;
      const used = usedCounts();
      legendHost.appendChild(el('p', 'p1-legend-lab', canned ? 'Die Farben im Handy = aus diesen Texten' : 'Die Farben im Handy = Text A · B · C'));
      if (canned) {
        const top = [...used.entries()].sort((a, b) => b[1] - a[1]);
        if (top.length) legendHost.appendChild(sourceChips(top.slice(0, 4).map(([si, c]) => ({ color: sourceColor(si), label: session.sources[si].doc.title, sub: String(c) })),
          top.length > 4 ? '+ ' + (top.length - 4) + ' Texte' : ''));
        return;
      }
      legendHost.appendChild(sourceChips(session.sources.map((s, i) => ({
        color: srcVar(i), label: SRC[i] + ' · ' + s.doc.title, sub: String(used.get(i) || 0)
      }))));
    }

    function syncLayers() {
      if (!phoneEl) return;
      phoneEl.classList.toggle('show-src', Z.isOpen('src'));
      phoneEl.classList.toggle('show-ask', Z.isOpen('ask'));
      phoneEl.classList.toggle('show-cand', Z.isOpen('cand'));
      updateText();
      updateLegend();
    }

    /* ---------------- Fragen und Antworten ---------------- */
    function ask(q) {
      q = (q || '').trim();
      if (!q || !State.activeTexts().length) return;
      stopPlay();
      asked = true;
      focus = null; pick = null;
      R = retrieve(M, q);
      R.question = q;
      canned = !R.results.some(r => r.score > 0);
      session = canned ? guessSession(q) : createSession(buildPhase2Sources(R, 3));
      placeholder.hidden = true;
      paintQuestion();
      askedEl.hidden = false;
      answerEl.hidden = false;
      textEl.hidden = false;
      playBtn.hidden = false;
      againBtn.hidden = false;
      reaskBtn.disabled = false;
      metaEl.replaceChildren();
      warnEl.hidden = !canned;
      if (canned) {
        metaEl.append(el('span', 'chat-found none', 'Kein passender Text'), el('span', 'chat-keys', '· Tiny rät trotzdem'));
        warnEl.replaceChildren(el('b', null, '🤥 Ausgedacht! '), document.createTextNode(
          (guessWord ? 'Zu „' + guessWord + '“ steht nichts in deinen Texten. ' : 'Dazu steht nichts in deinen Texten. ') +
          'Tiny klebt trotzdem Wörter aneinander und klingt dabei ganz sicher. Echte KIs machen das auch – das nennt man Halluzinieren.'));
      } else {
        metaEl.appendChild(el('span', 'chat-found', session.sources.length + (session.sources.length === 1 ? ' Text gefunden' : ' Texte gefunden')));
        const known = R.ql.filter(x => x.known).map(x => showWord(x.lemma));
        if (known.length) metaEl.appendChild(el('span', 'chat-keys', '· gesucht: ' + known.join(' · ')));
      }
      updateText();
      updateLegend();
      paintCols();
      /* Wortkarte nicht neu aufbauen (teuer) — nur auf ein Fragewort springen. */
      if (mapCtl && Z.isOpen('map')) {
        const start = R.ql.filter(x => x.inMap)[0];
        if (start) mapCtl.select(start.lemma); else mapCtl.redraw();
      }
      startPlay();
    }

    function doStep() {
      if (!session) return false;
      focus = null; pick = null;
      const last = session.steps[session.steps.length - 1];
      if (last && last.seed) {
        const C = nextCands();
        if (!C.list.length) return false;
        commitWord(session, temp === 0 ? C.list[0] : pickFrom(C.list), C);
      } else if (!step(session, 6, temp)) return false;
      updateText();
      updateLegend();
      paintCols();
      return !(session.sentences >= (canned ? 2 : 3) || session.steps.length >= 70);
    }
    function syncPlay() {
      if (!playBtn) return;
      playBtn.textContent = playing ? '❚❚ Pause' : '▶ Weiter';
      playBtn.classList.toggle('playing', playing);
    }
    function startPlay() {
      if (playing || !session) return;
      playing = true;
      syncPlay();
      timer = setInterval(() => { if (!doStep()) stopPlay(); }, 420);
    }
    function stopPlay() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      syncPlay();
    }

    /* ---------------- Zerlegen: drei Spalten + Wortkarte ---------------- */
    function empty(text) { return el('p', 'card-empty', text); }

    function paintCand(v) {
      const b = Z.cols.cand.body;
      b.replaceChildren();
      if (!v) { b.appendChild(empty('Stell links im Handy eine Frage – dann siehst du hier, welche Wörter Tiny zur Wahl hat.')); return; }
      if (v.seed) {
        b.appendChild(el('p', 'p1-line', 'Dieses Wort hat Tiny nicht gezählt: Es kommt aus deiner Frage. So beginnt die ausgedachte Antwort.'));
        return;
      }
      const where = canned ? 'in den Texten' : 'in den Quellen A · B · C';
      const line = el('p', 'p1-line');
      if (atStart(v)) line.append(document.createTextNode('Satzanfang – so fingen Sätze ' + where + ' an' + (canned ? '' : ' (Sätze mit deinen Fragewörtern zuerst)') + ':'));
      else line.append(document.createTextNode('Nach „'), el('b', null, ctxText(v)), document.createTextNode('“ stand ' + where + ':'));
      b.appendChild(line);
      const MAX = 8;
      const list = el('ol', 'clist');
      const showSrc = Z.isOpen('src');
      v.C.list.slice(0, MAX).forEach(a => {
        const li = el('li');
        const row = el('button', 'crow' + (a.word === v.chosen ? ' chosen' : '') + (a.word === pick ? ' picked' : ''));
        row.type = 'button';
        row.title = 'Wo steht das? (bei den Quellen)';
        const bar = el('span', 'cbar');
        const width = Math.max(2, a.p * 100);
        if (showSrc && a.bySrc) {
          /* Mit offenen Quellen: der Balken in den Farben der Texte, aus denen das Wort kommt. */
          bar.classList.add('split');
          const inner = el('span', 'cbar-in');
          inner.style.width = width + '%';
          [...a.bySrc.entries()].forEach(([si, w]) => {
            const seg = el('i');
            seg.style.width = (100 * w / a.w) + '%';
            seg.style.background = colorOf(si);
            seg.title = nameOf(si);
            inner.appendChild(seg);
          });
          bar.appendChild(inner);
        } else {
          const fill = el('i');
          fill.style.width = width + '%';
          bar.appendChild(fill);
        }
        row.append(el('span', 'cword', tokLabel(a.word)), bar, el('span', 'cp', fmtP(a.p)), el('span', 'cn', a.occ.length + '×'));
        if (a.word === v.chosen) row.appendChild(el('span', 'ctag', '🎲 gezogen'));
        row.addEventListener('click', () => { pick = pick === a.word ? null : a.word; const w = view(); paintCand(w); if (Z.isOpen('src')) paintSrc(w); });
        li.appendChild(row);
        list.appendChild(li);
      });
      b.appendChild(list);
      const more = v.C.list.length - MAX;
      if (more > 0) b.appendChild(el('p', 'p1-more', '… und ' + more + ' weitere Wörter'));
      if (showSrc && !canned) b.appendChild(el('p', 'p1-more', 'Balkenfarbe = aus Text A · B · C'));
    }

    /* Frage zerlegen: Füllwörter raus, bekannte Wörter suchen, ähnliche Wörter. */
    function paintAsk() {
      const b = Z.cols.ask.body;
      b.replaceChildren();
      if (!asked) { b.appendChild(empty('Stell links im Handy eine Frage – dann zerlegt Tiny sie hier.')); return; }
      b.appendChild(el('p', 'p1-sub', 'Deine Frage, Wort für Wort'));
      const qw = el('div', 'chiprow');
      tokenize(R.question).filter(t => !t.punct).forEach(t => {
        const isStop = STOP.has(t.t) || /^\d+$/.test(t.t) || t.t.length < 2;
        const chip = el('div', 'chip');
        if (isStop) {
          chip.classList.add('off');
          chip.append(document.createTextNode(t.raw));
          chip.title = 'Füllwort – fliegt raus';
          qw.appendChild(chip);
          return;
        }
        const x = R.ql.find(y => y.raw === t.raw);
        if (!x) return;
        if (!x.known) {
          chip.classList.add('unknown');
          chip.append(document.createTextNode(t.raw), el('span', 'chip-tag', 'unbekannt'));
          qw.appendChild(chip);
          return;
        }
        chip.classList.add('known');
        chip.appendChild(el('b', null, showWord(x.lemma)));
        if (x.lemma !== t.t) chip.appendChild(el('span', 'small muted', ' ← ' + t.raw));
        qw.appendChild(chip);
      });
      b.appendChild(qw);
      const lg = el('p', 'mini-legend');
      lg.append(el('span', 'chip off sm', 'grau'), document.createTextNode(' Füllwort  '),
        el('span', 'chip known sm', 'blau'), document.createTextNode(' sucht Tiny  '),
        el('span', 'chip unknown sm', 'rot'), document.createTextNode(' unbekannt'));
      b.appendChild(lg);

      const known = R.ql.filter(x => x.known);
      const ctxBox = el('div', 'ctxnow');
      ctxBox.appendChild(el('p', 'p1-sub', 'Tiny sucht in den Texten nach'));
      const g = el('span', 'gram');
      if (known.length) known.forEach(x => g.appendChild(el('span', 'gtok', showWord(x.lemma))));
      else g.appendChild(el('span', 'gtok start', 'nichts Bekanntem'));
      ctxBox.appendChild(g);
      ctxBox.appendChild(el('p', 'p1-count', canned
        ? 'Kein Text passt – darum rät Tiny aus allen Texten.'
        : 'Gefunden: ' + session.sources.length + (session.sources.length === 1 ? ' Text' : ' Texte') + ' → bei den Quellen'));
      b.appendChild(ctxBox);

      const simRows = R.ql.filter(x => x.known && x.inMap).map(x => [x, neighbors(M, x.lemma, 4).filter(n => n[1] >= SIM_MIN)]).filter(p => p[1].length);
      if (simRows.length) {
        b.appendChild(el('p', 'p1-sub', 'Hält Tiny für ähnlich'));
        simRows.forEach(([x, nbs]) => {
          const p = el('p', 'p1-line');
          p.append(el('b', null, showWord(x.lemma)), document.createTextNode(' ≈ ' + nbs.map(n => showWord(n[0]) + ' (' + Math.round(n[1] * 100) + ' %)').join(', ')));
          b.appendChild(p);
        });
        const mb = el('button', 'btn sm p1-up', '🗺️ Auf der Wortkarte');
        mb.type = 'button';
        mb.addEventListener('click', () => {
          if (!Z.isOpen('map')) Z.setOpen('map', true);
          if (mapCtl) mapCtl.select(simRows[0][0].lemma);
          Z.cols.map.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        b.appendChild(mb);
      }
    }

    function renderMarkedTokens(toks, marks) {
      const frag = document.createDocumentFragment();
      toks.forEach((t, k) => {
        if (k > 0 && !t.punct) frag.appendChild(document.createTextNode(' '));
        const m = marks.get(k);
        if (m) {
          const span = el('span', 'mk ' + (m.type === 'exact' ? 'exact' : 'sim'), t.raw);
          if (m.type !== 'exact') span.title = 'ähnlich zu „' + showWord(m.q) + '“ (' + Math.round(m.sim * 100) + ' %)';
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(t.raw));
        }
      });
      return frag;
    }

    function fundBox(o, taken) {
      const doc = session.sources[o.si].doc;
      const f = el('div', 'fund' + (taken ? ' taken' : ''));
      f.style.setProperty('--sc', colorOf(o.si));
      const h = el('button', 'fhead');
      h.type = 'button';
      h.title = 'Text lesen';
      if (!canned) { const lt = el('span', 'letter sm', SRC[o.si]); lt.style.background = srcVar(o.si); h.appendChild(lt); }
      else h.appendChild(el('i', 'dot'));
      h.appendChild(el('span', 'ft', doc.title));
      if (taken) h.appendChild(el('span', 'ftag', '✓ von hier genommen'));
      h.addEventListener('click', () => App.openTexts(doc.own ? 'eigen' : doc.theme));
      f.append(h, Zerlegen.snippet(session, o));
      return f;
    }

    function paintSrc(v) {
      const b = Z.cols.src.body;
      b.replaceChildren();
      if (!v) { b.appendChild(empty('Stell links im Handy eine Frage – dann siehst du hier, aus welchen Texten Tiny antwortet.')); return; }

      /* 1. Das Wort: wo es in den Quellen steht (wie in Phase 1). */
      const wsel = pick || v.chosen;
      if (v.seed) {
        b.appendChild(el('p', 'p1-line', 'Dieses Wort steht in keiner Quelle – es kommt aus deiner Frage.'));
      } else if (atStart(v) && !wsel) {
        b.appendChild(el('p', 'p1-line', 'Neuer Satz: Tiny nimmt einen Satzanfang aus ' + (canned ? 'irgendeinem Text' : 'einer der Quellen') + '. Tipp einen Kandidaten an, dann siehst du, wo er steht.'));
      } else {
        const occ = Zerlegen.findOcc(session, v.ctx, wsel, false);
        if (v.idx != null && wsel === v.chosen) {
          const k = occ.findIndex(o => o.si === v.si && o.pos === v.pos);
          if (k > 0) occ.unshift(occ.splice(k, 1)[0]);
        }
        const line = el('p', 'p1-line');
        line.append(document.createTextNode('„'), el('b', null, ([ctxText(v), wsel ? word(wsel) : ''].filter(Boolean).join(' ').replace(/ ([.,])/g, '$1')) || '…'),
          document.createTextNode('“ steht ' + occ.length + '× ' + (canned ? 'in den Texten' : 'in den Quellen') + ':'));
        b.appendChild(line);
        const MAX = 4;
        const list = el('div', 'flist');
        occ.slice(0, MAX).forEach(o => list.appendChild(fundBox(o, v.idx != null && o.si === v.si && o.pos === v.pos && wsel === v.chosen)));
        b.appendChild(list);
        if (occ.length > MAX) b.appendChild(el('p', 'p1-more', '… und ' + (occ.length - MAX) + ' weitere Stellen'));
      }

      /* 2. Die Quellen zu deiner Frage. */
      const all = el('div', 'p1-used');
      if (canned) {
        all.appendChild(el('p', 'p1-sub', 'Kein Text passt zu deiner Frage'));
        all.appendChild(el('p', 'p1-line', 'Tiny nimmt deshalb alle Texte und rät – die Antwort ist ausgedacht.'));
        const used = usedCounts();
        if (used.size) all.appendChild(el('p', 'p1-more', 'Bisher Wörter aus ' + used.size + (used.size === 1 ? ' Text' : ' Texten') + '.'));
      } else {
        all.appendChild(el('p', 'p1-sub', 'Die 3 passendsten Texte zu deiner Frage'));
        session.sources.forEach((s, i) => {
          const row = el('div', 'srcrow');
          const head = el('div', 'srcrow-head');
          const letter = el('span', 'letter', SRC[i]); letter.style.background = srcVar(i);
          const titleWrap = el('div'); titleWrap.style.flex = '1'; titleWrap.style.minWidth = '0';
          titleWrap.appendChild(el('b', null, s.doc.title));
          const bar = el('div', 'bar');
          const fill = el('i'); fill.style.width = Math.max(4, s.weight * 100) + '%'; fill.style.background = srcVar(i);
          bar.appendChild(fill);
          titleWrap.appendChild(bar);
          head.append(letter, titleWrap);
          row.appendChild(head);
          const hl = s.r.hits.map(h => h.type === 'exact' ? '„' + showWord(h.w) + '“' : '„' + showWord(h.w) + '“ statt „' + showWord(h.q) + '“');
          row.appendChild(el('p', 'small muted', 'Treffer: ' + hl.join(', ')));
          const toggle = el('button', 'btn sm', 'Fragewörter im Text zeigen');
          toggle.type = 'button';
          const snip = el('p', 'small snip');
          snip.hidden = true;
          snip.appendChild(renderMarkedTokens(s.r.doc.toks, s.r.marks));
          toggle.addEventListener('click', () => {
            snip.hidden = !snip.hidden;
            toggle.textContent = snip.hidden ? 'Fragewörter im Text zeigen' : 'Text verbergen';
          });
          row.append(toggle, snip);
          all.appendChild(row);
        });
        const lg = el('p', 'mini-legend');
        lg.append(el('span', 'mk exact', 'gelb'), document.createTextNode(' = genau dein Wort  '), el('span', 'mk sim', 'rosa'), document.createTextNode(' = ähnliches Wort'));
        all.appendChild(lg);
      }
      b.appendChild(all);
    }

    function paintFocus(v) {
      let hint = '';
      if (asked && !['cand', 'ask', 'src'].some(Z.isOpen)) hint = 'Öffne rechts eine Spalte – dann siehst du auch im Handy, was dahintersteckt.';
      Zerlegen.focusBanner(focusHost, v && v.idx != null ? v.idx : null, v && v.idx != null ? word(v.chosen) : '', () => setFocus(null), hint);
    }

    function paintCols() {
      const v = view();
      paintFocus(v);
      if (Z.isOpen('cand')) paintCand(v); else Z.cols.cand.body.replaceChildren();
      if (Z.isOpen('ask')) paintAsk(); else Z.cols.ask.body.replaceChildren();
      if (Z.isOpen('src')) paintSrc(v); else Z.cols.src.body.replaceChildren();
    }

    function setFocus(i) {
      stopPlay();
      focus = i;
      pick = null;
      updateText();
      paintCols();
    }

    function mountMap() {
      const b = Z.cols.map.body;
      b.replaceChildren();
      if (!Z.isOpen('map')) { if (mapCtl) mapCtl.destroy(); return; }
      if (!M.words.length) { b.appendChild(empty('Wähl ein paar Texte aus, dann entsteht die Karte.')); return; }
      mapCtl.mount(b);
    }

    function buildPhone() {
      const P = Zerlegen.phone({ label: 'tiny · model · Phase 2', help: 'p2' });
      phoneEl = P.el;
      phoneEl.classList.add('phone-chat');
      screen = P.screen;

      const chat = el('div', 'chat');
      placeholder = el('div', 'tiny-say');
      placeholder.append(tinyEl('normal'), el('p', 'tiny-bubble', 'Frag mich etwas! Ich suche die passendsten Texte und schreibe daraus eine Antwort.'));
      askedEl = el('p', 'chat-q');
      askedEl.hidden = true;
      answerEl = el('div', 'chat-a');
      answerEl.hidden = true;
      const aBody = el('div', 'chat-a-body');
      metaEl = el('div', 'chat-meta');
      const bubble = el('div', 'paper chat-bubble');
      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      cursor.title = 'Das nächste Wort – antippen zum Zerlegen';
      textEl.appendChild(cursor);
      textEl.hidden = true;
      bubble.appendChild(textEl);
      warnEl = el('p', 'chat-warn');
      warnEl.hidden = true;
      const controls = el('div', 'machine-controls chat-controls');
      playBtn = el('button', 'btn sm', '▶ Weiter');
      playBtn.type = 'button';
      playBtn.hidden = true;
      playBtn.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
      againBtn = el('button', 'btn sm', '↻ Nochmal');
      againBtn.type = 'button';
      againBtn.title = 'Dieselbe Frage nochmal';
      againBtn.hidden = true;
      againBtn.addEventListener('click', () => { if (R) ask(R.question); });
      controls.append(playBtn, againBtn);
      aBody.append(metaEl, bubble, warnEl, controls);
      answerEl.append(tinyEl('happy'), aBody);
      chat.append(placeholder, askedEl, answerEl);
      screen.appendChild(chat);

      /* Wort antippen = zerlegen; „?“ = zurück zum nächsten Wort. */
      textEl.addEventListener('pointerdown', ev => { if (ev.target.closest('.srcword, .cursor')) stopPlay(); });
      textEl.addEventListener('click', ev => {
        const w = ev.target.closest('.srcword');
        if (w) { const i = +w.dataset.i; setFocus(i === focus ? null : i); return; }
        if (ev.target.closest('.cursor')) setFocus(null);
      });

      const bottom = el('div', 'phone-ask');
      const sugg = el('div', 'sugg');
      SUGGEST2.forEach(q => {
        const b = el('button', 'chip', q);
        b.type = 'button';
        b.addEventListener('click', () => { input.value = q; ask(q); });
        sugg.appendChild(b);
      });
      const form = el('form', 'qform');
      form.dataset.spot = 'ask';
      input = el('input', 'textin');
      input.type = 'text'; input.placeholder = 'Frag Tiny etwas …'; input.setAttribute('aria-label', 'Frage');
      input.enterKeyHint = 'send';
      const send = el('button', 'btn primary qsend');
      send.type = 'submit';
      send.setAttribute('aria-label', 'Fragen');
      send.title = 'Fragen';
      send.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
      form.append(input, send);
      form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); input.blur(); });
      bottom.append(sugg, form);
      phoneEl.appendChild(bottom);
      return phoneEl;
    }

    function render() {
      stopPlay();
      asked = false; canned = false; session = null; R = null; focus = null; pick = null;

      Z = Zerlegen.columns({
        store: 'tinylm-p2-offen',
        demoClosed: ['map'],
        onPointer: stopPlay,
        onChange: id => {
          if (id === 'map') { mountMap(); return; }
          syncLayers();
          paintCols();
        }
      });

      const root = el('div', 'p1');
      const grid = el('div', 'p1-grid');
      const left = el('div', 'p1-left');
      left.appendChild(buildPhone());
      legendHost = el('div', 'p1-legend');
      left.appendChild(legendHost);
      if (!State.activeTexts().length) left.appendChild(el('p', 'warnline', 'Keine Texte ausgewählt – schalte oben rechts unter „Alle Quellen“ welche an.'));

      const right = el('div', 'p1-right');
      const intro = el('div', 'p1-intro');
      focusHost = el('div', 'p1-focus');
      intro.appendChild(focusHost);
      right.appendChild(intro);

      const row = el('div', 'p1-cols');
      row.append(
        Z.column('cand', 'candidates', '🎲', 'Kandidaten', 'Welches Wort kommt?', 'wortfuerwort', 'Öffnen: Im Handy siehst du das nächste Wort als „?“ – und hier, welche Wörter in Frage kommen.'),
        Z.column('ask', 'ask', '🔎', 'Frage zerlegen', 'Was sucht Tiny?', 'nachschlagen', 'Öffnen: Im Handy siehst du, welche Wörter deiner Frage Tiny sucht.'),
        Z.column('src', 'origin', '📑', 'Quellen', 'Aus welchen Texten?', 'quellen', 'Öffnen: Im Handy bekommt jedes Wort die Farbe seines Textes A · B · C.'));
      right.appendChild(row);
      right.appendChild(Z.column('map', 'meaning', '🗺️', 'Wortkarte', 'Welche Wörter gehören zusammen?', 'wortkarte', 'Öffnen: Eine Karte aller Wörter – ähnliche liegen nah beieinander.', { wide: true }));

      /* Feste Köpfe (werden nie neu gebaut): Temperatur + „Dieselbe Frage nochmal“. */
      const tsl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, spot: 'temp',
        fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => { temp = Math.round(v * 10) / 10; if (Z.isOpen('cand')) paintCand(view()); }
      });
      Z.cols.cand.tools.appendChild(tsl.el);
      reaskBtn = el('button', 'btn sm p1-up', '🔁 Dieselbe Frage nochmal');
      reaskBtn.type = 'button';
      reaskBtn.dataset.spot = 'reask';
      reaskBtn.disabled = true;
      reaskBtn.addEventListener('click', () => { if (R) ask(R.question); });
      Z.cols.cand.tools.appendChild(reaskBtn);

      grid.append(left, right);
      root.appendChild(grid);
      host.replaceChildren(root);
      syncLayers();
      paintCols();
      mountMap();
    }

    rebuildModel();
    render();
    State.on('corpus-changed', () => { rebuildModel(); render(); });

    return {
      reveal: id => { const c = Z.cols[id]; if (!c) return; if (!Z.isOpen(id)) Z.setOpen(id, true); c.el.scrollIntoView({ block: 'nearest' }); },
      onHide: stopPlay
    };
  }
});
