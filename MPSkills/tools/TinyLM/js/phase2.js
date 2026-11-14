/* Phase 2: Frage & Antwort — „Handy + Zerlegen“ wie Phase 1 (Sönke 02.11.2026).

   Links das HANDY mit dem Chat: Tiny grüßt, deine Frage oben rechts, Tinys Antwort als Bausteine.
   Unten im Handy vor der Frage Vorschläge + Eingabefeld (.qform bleibt für das Schaufenster);
   sobald gefragt ist, werden daraus wie in Phase 1 Tinys Zeile + die Knöpfe ▶ Weiter/❚❚ Pause ·
   +1 Wort · ↻ Nochmal (Sönke 11.11.2026); ↻ Nochmal räumt den Chat und zeigt wieder die Vorschläge.
   Rechts wird ZERLEGT (Sönke 12.11.2026, nach dem Kürzen „Schere ansetzen“: keine Platzhalter-
   und Hilfesätze mehr, kein „Dieselbe Frage nochmal“, nirgends „nur aus A · B · C“):
     Frage zerlegen (welche Wörter zählen, in welchen Texten sie stehen; Indigo, klar abgesetzt)
     Kandidaten     (welches Wort kommt? — Temperatur im festen Kopf, Liste wie in Phase 1;
                     🔎 = Wort aus einem Satz mit deinem Fragewort)
     N-Gramme  ┐ zwei Reiter untereinander in der dritten Spalte (.p1-stack):
     Quellen   ┘ N-Gramme grün (Regler im Kopf, „Tiny schaut jetzt auf“, „11× gefunden“ und je
                 Text „3× Die Kornnatter“ — antippen = ganzer Text, alle Fundstellen markiert),
                 Quellen gelb (ein Satz, warum A · B · C, dann Token je Quelle wie in Phase 1;
                 die Titel in Frage zerlegen springen hierher)
   Die Wortkarte war bis 11.11.2026 breit darunter; sie zieht in eine eigene Phase „Wörter als Punkte“
   (Sönke: Phase 2 nutzt sie nicht, Tiny sucht hier nur Stichwörter).

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
/* Wie viele Wörter davor Tiny beim Schreiben höchstens anschaut (Start 3-Gramm wie besprochen
   12.11.2026; Regler „N-Gramm“ = n + 1). */
const P2_N = 2;
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
    let temp = 1, n = P2_N, playing = false, timer = null, done = false;
    let focus = null, pick = null;
    let textEl, cursor, playBtn, input, legendHost, askedEl, placeholder, answerEl, metaEl, warnEl, screen, focusHost;
    let askBox, sayBox, sayEl, controls, gramLine;
    const srcState = { open: null };
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
      const C = candidates(session, n, temp);
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
    const atStart = v => v.C && !v.C.uni && (v.C.level === 0 || v.ctx.every(isPunct));
    function usedCounts() {
      const used = new Map();
      if (session) session.steps.forEach(st => { if (st.si >= 0) used.set(st.si, (used.get(st.si) || 0) + 1); });
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
      markWindow();
      if (focus == null) screen.scrollTop = screen.scrollHeight;
    }

    /* Kontextfenster im Handy umranden wie in Phase 1 — nur mit offenem Reiter Kontextfenster:
       die letzten Wörter vor dem „?“, beim angetippten Wort die Wörter, auf die Tiny damals schaute. */
    function markWindow() {
      textEl.querySelectorAll('.srcword.win').forEach(s => s.classList.remove('win'));
      if (!Z.isOpen('gram') || !asked || !session) return;
      const v = view();
      if (!v || !v.C || v.C.uni || !v.ctx || !v.ctx.length) return;
      const end = v.idx == null ? session.steps.length : v.idx;
      for (let i = Math.max(0, end - v.ctx.length); i < end; i++) {
        const sp = textEl.querySelector('.srcword[data-i="' + i + '"]');
        if (sp) sp.classList.add('win');
      }
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
      legendHost.appendChild(el('p', 'p1-legend-lab', 'Die Farben im Handy = aus diesen Quellen'));
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
      done = false;
      askBox.hidden = true;
      sayBox.hidden = false;
      controls.hidden = false;
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
      syncGramLine();
      updateText();
      updateLegend();
      paintCols();
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
      } else if (!step(session, n, temp)) { done = true; return false; }
      updateText();
      updateLegend();
      paintCols();
      if (session.sentences >= (canned ? 2 : 3) || session.steps.length >= 70) { done = true; return false; }
      return true;
    }
    function syncPlay() {
      if (!playBtn) return;
      playBtn.textContent = playing ? '❚❚ Pause' : '▶ Weiter';
      playBtn.classList.toggle('playing', playing);
      say();
    }
    /* Tinys Zeile unten im Handy (statt der Vorschläge, sobald gefragt ist). */
    function say() {
      if (!sayEl || !asked) return;
      let t;
      if (canned) t = playing ? 'Dazu steht nichts in meinen Texten – ich rate einfach drauflos …'
        : 'Das war geraten! Rechts siehst du, woher die Wörter wirklich kommen. ↻ Nochmal = neue Frage.';
      else if (playing) t = 'Ich schreibe …';
      else if (done) t = 'Fertig! Tipp ein Wort an – rechts siehst du, wie ich darauf gekommen bin. ↻ Nochmal = neue Frage.';
      else t = 'Pause. Tipp ein Wort an, dann zerlegst du rechts genau diesen Schritt.';
      sayEl.textContent = t;
    }
    /* ↻ Nochmal: Chat leeren, wieder die Vorschläge + das Eingabefeld zeigen. */
    function resetChat() {
      stopPlay();
      asked = false; canned = false; session = null; R = null; focus = null; pick = null; done = false;
      placeholder.hidden = false;
      askedEl.hidden = true; askedEl.replaceChildren();
      answerEl.hidden = true;
      textEl.hidden = true;
      warnEl.hidden = true;
      metaEl.replaceChildren();
      askBox.hidden = false;
      sayBox.hidden = true;
      controls.hidden = true;
      input.value = '';
      askKey = null;
      syncGramLine();
      updateText();
      updateLegend();
      paintCols();
    }
    /* Zeile unter dem N-Gramm-Regler: wie in Phase 1, aber nur in den gefundenen Texten. */
    function syncGramLine() {
      if (!gramLine) return;
      if (n === 0) gramLine.replaceChildren(document.createTextNode('Nur das neue Wort, keins davor – häufige Wörter kommen öfter.'));
      else gramLine.replaceChildren(document.createTextNode('Kontextfenster: '), el('b', null, n + (n === 1 ? ' Wort' : ' Wörter')),
        document.createTextNode(' davor + 1 neues Wort'));
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

    /* ---------------- Zerlegen: Spalten ---------------- */

    /* Kandidaten — schlank wie in Phase 1 (Sönke 12.11.2026: „super überladen“). */
    function paintCand(v) {
      const b = Z.cols.cand.body;
      b.replaceChildren();
      if (!v) return;
      if (v.seed) {
        b.appendChild(el('p', 'p1-line', 'Dieses Wort hat Tiny nicht gezählt: Es kommt aus deiner Frage. So beginnt die ausgedachte Antwort.'));
        return;
      }
      const MAX = 8;
      const list = el('ol', 'clist');
      v.C.list.slice(0, MAX).forEach(a => {
        const li = el('li');
        const row = el('button', 'crow' + (a.word === v.chosen ? ' chosen' : '') + (a.word === pick ? ' picked' : ''));
        row.type = 'button';
        row.title = 'Wo steht das? (im Kontextfenster)';
        const bar = el('span', 'cbar');
        const fill = el('i');
        fill.style.width = Math.max(2, a.p * 100) + '%';
        bar.appendChild(fill);
        const cw = el('span', 'cword', tokLabel(a.word));
        /* 🔎 = steht in einem Satz mit einem Wort deiner Frage — zählt darum mehr (pushCandidate). */
        if (!canned && a.occ && a.occ.some(o => o.rel > 0)) {
          const r = el('span', 'crel', '🔎');
          r.title = 'Steht in einem Satz mit einem Wort deiner Frage – zählt darum mehr';
          cw.prepend(r);
        }
        row.append(cw, bar, el('span', 'cp', fmtP(a.p)), el('span', 'cn', a.occ.length + '×'));
        if (a.word === v.chosen) row.appendChild(el('span', 'ctag', '🎲 gezogen'));
        row.addEventListener('click', () => { pick = pick === a.word ? null : a.word; const w = view(); paintCand(w); if (Z.isOpen('gram')) paintGram(w); });
        li.appendChild(row);
        list.appendChild(li);
      });
      b.appendChild(list);
      const more = v.C.list.length - MAX;
      if (more > 0) b.appendChild(el('p', 'p1-more', '… und ' + more + ' weitere Wörter'));
    }

    /* „Tiny schaut jetzt auf“ wie im Kontextfenster von Phase 1. */
    function gramBox(v) {
      const box = el('div', 'ctxnow');
      box.appendChild(el('p', 'p1-sub', v.idx == null ? 'Tiny schaut jetzt auf' : 'Für „' + word(v.chosen) + '“ schaute Tiny auf'));
      const g = el('span', 'gram');
      const end = v.idx == null ? session.steps.length : v.idx;
      const pcs = pieces(session).slice(0, end);
      if (v.C.uni) g.appendChild(el('span', 'gtok start', 'kein Wort'));
      else if (atStart(v) || !v.ctx.length) g.appendChild(el('span', 'gtok start', 'Satzanfang'));
      else {
        const k = v.ctx.length;
        if (k > end) g.appendChild(el('span', 'gtok start', 'Satzanfang'));
        pcs.slice(-Math.min(k, end)).forEach(p => g.appendChild(el('span', 'gtok' + (p.punct ? ' p' : ''), p.txt)));
      }
      const chosenTxt = v.idx != null && pieces(session)[v.idx] ? pieces(session)[v.idx].txt : null;
      g.appendChild(v.chosen ? el('span', 'gtok chosen', chosenTxt || tokLabel(v.chosen)) : el('span', 'gtok next', '?'));
      box.appendChild(g);
      const avail = Math.min(n, v.idx == null ? session.ctx.length : v.idx + 1);
      if (!v.C.uni && v.C.level < avail && v.C.level < n) {
        box.appendChild(el('p', 'p1-fall', v.C.level === 0
          ? 'Die letzten Wörter stehen so in keiner Quelle – also neuer Satz.'
          : 'Die letzten ' + n + ' Wörter stehen so in keiner Quelle – Tiny nimmt nur ' + (v.C.level === 1 ? 'das letzte' : 'die letzten ' + v.C.level) + '.'));
      }
      return box;
    }

    /* Frage zerlegen, schlicht (Sönke 02.11.2026: das Fließband war „viel zu überladen“ — gefragt ist
       nur: welche Wörter der Frage zählen, in welchen Texten stehen sie, welche Texte wurden gewählt).
       Oben die Frage: Füllwörter grau, gesuchte Wörter je in einer Farbe, unbekannte rot.
       Darunter eine Tabelle: Zeilen = Texte mit Treffern (die 3 gewählten A · B · C oben),
       Spalten = gesuchte Wörter, ● = steht drin, ≈ = nur ein ähnliches Wort.
       Gebaut wird nur bei einer neuen Frage (askKey), nicht bei jedem geschriebenen Wort. */
    const WCOL = ['#1590B5', '#7A4FD0', '#2E9E5B', '#D9861C', '#C2477A', '#4A6FD1'];
    let askKey = null;
    function paintAsk() {
      const b = Z.cols.ask.body;
      if (R && askKey === R && b.childNodes.length) return;
      askKey = R;
      b.replaceChildren();
      if (!asked) return;
      const isStop = t => STOP.has(t.t) || /^\d+$/.test(t.t) || t.t.length < 2;
      const known = R.ql.filter(x => x.known);
      const colOf = lem => WCOL[Math.max(0, known.findIndex(x => x.lemma === lem)) % WCOL.length];

      /* 1. Welche Wörter zählen? */
      b.appendChild(el('p', 'p1-sub', 'Welche Wörter zählen?'));
      const g = el('div', 'gram askq');
      tokenize(R.question).filter(t => !t.punct).forEach(t => {
        const x = isStop(t) ? null : R.ql.find(y => y.raw === t.raw);
        if (!x) { const s = el('span', 'gtok askoff', t.raw); s.title = 'Füllwort – zählt nicht'; g.appendChild(s); return; }
        if (!x.known) { const s = el('span', 'gtok askunk', t.raw); s.title = 'Steht in keinem Text'; g.appendChild(s); return; }
        const s = el('span', 'gtok askw', t.raw);
        s.style.setProperty('--wc', colOf(x.lemma));
        s.title = 'Sucht Tiny' + (x.lemma !== t.t ? ' (als „' + showWord(x.lemma) + '“)' : '');
        g.appendChild(s);
      });
      b.appendChild(g);

      /* 2. In welchen Texten stehen sie — und welche hat Tiny gewählt? */
      const ranked = R.results.filter(r => r.score > 0);
      b.appendChild(el('p', 'p1-sub', 'In welchen Texten stehen sie?'));
      if (!ranked.length) {
        b.appendChild(el('p', 'askfail', 'In keinem Text – Tiny rät deshalb aus allen Texten. Die Antwort ist ausgedacht.'));
        return;
      }
      const MAX = 6;
      const tbl = el('table', 'askgrid');
      const hr = el('tr');
      hr.appendChild(el('th', 'askgrid-t'));
      known.forEach(x => {
        const th = el('th');
        const w = el('span', 'gtok askw sm', x.raw);
        w.style.setProperty('--wc', colOf(x.lemma));
        const n = M.lemDocs.get(x.lemma) ? M.lemDocs.get(x.lemma).size : 0;
        th.append(w, el('span', 'askgrid-n', n + (n === 1 ? ' Text' : ' Texte')));
        hr.appendChild(th);
      });
      tbl.appendChild(el('thead')).appendChild(hr);
      const tb = el('tbody');
      ranked.slice(0, MAX).forEach((r, i) => {
        const tr = el('tr', i < 3 ? 'picked' : 'unpicked');
        const td = el('td', 'askgrid-t');
        const lt = el('span', 'letter sm', i < 3 ? SRC[i] : '–');
        if (i < 3) lt.style.background = srcVar(i);
        const tw = el('div', 'askgrid-tw');
        if (i < 3) {
          /* Gewählte Quelle antippen = in „Quellen“ aufklappen (Sönke 12.11.2026). */
          const link = el('button', 'askgrid-title asklink', r.doc.title);
          link.type = 'button';
          link.title = 'In „Quellen“ öffnen – mit den Token, die Tiny daraus genommen hat';
          link.addEventListener('click', () => openSource(i));
          tw.append(lt, link);
        } else tw.append(lt, el('span', 'askgrid-title', r.doc.title));
        td.appendChild(tw);
        tr.appendChild(td);
        known.forEach(x => {
          const c = el('td', 'askgrid-c');
          const h = r.hits.find(y => y.q === x.lemma);
          if (h) {
            const m = el('span', 'askmark' + (h.type === 'exact' ? '' : ' sim'), h.type === 'exact' ? '●' : '≈');
            m.style.setProperty('--wc', colOf(x.lemma));
            m.title = h.type === 'exact' ? '„' + showWord(h.w) + '“ steht im Text'
              : 'Nur „' + showWord(h.w) + '“ – Tiny hält das für ähnlich zu „' + showWord(x.lemma) + '“';
            c.appendChild(m);
            if (h.type !== 'exact') c.appendChild(el('span', 'asksimw', showWord(h.w)));
          }
          tr.appendChild(c);
        });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      const wrap = el('div', 'askgrid-wrap');
      wrap.appendChild(tbl);
      b.appendChild(wrap);
      const lg2 = el('p', 'mini-legend');
      lg2.append(document.createTextNode('● steht im Text   ≈ nur ein ähnliches Wort'));
      b.appendChild(lg2);
    }

    /* N-Gramme (Sönke 12.11.2026, eigener Reiter über den Quellen): worauf Tiny schaut und wie oft
       das in den Quellen steht — je Text eine Zeile „3× Die Kornnatter“; antippen = ganzer Text,
       alle Fundstellen markiert (Kontext grün, Wort danach koralle). */
    const gramState = { open: null };
    function paintGram(v) {
      const b = Z.cols.gram.body;
      b.replaceChildren();
      if (!v) return;
      if (v.seed) { b.appendChild(el('p', 'p1-line', 'Dieses Wort steht in keiner Quelle – es kommt aus deiner Frage.')); return; }
      b.appendChild(gramBox(v));
      const wsel = pick || v.chosen;
      if ((atStart(v) || v.C.uni) && !wsel) return;
      const occ = Zerlegen.findOcc(session, v.ctx, wsel, !!v.C.uni);
      if (!occ.length) return;
      const per = new Map();
      occ.forEach(o => { if (!per.has(o.si)) per.set(o.si, []); per.get(o.si).push(o); });
      if (gramState.open != null && !per.has(gramState.open)) gramState.open = null;
      b.appendChild(el('p', 'p1-sub', occ.length + '× gefunden'));
      const list = el('div', 'usedsrc');
      [...per.entries()].sort((x, y) => y[1].length - x[1].length).forEach(([si, os]) => {
        const s = session.sources[si];
        const open = gramState.open === si;
        const item = el('div', 'usrc gocc' + (open ? ' open' : ''));
        item.style.setProperty('--sc', colorOf(si));
        const row = el('button', 'usrc-row');
        row.type = 'button';
        row.setAttribute('aria-expanded', open ? 'true' : 'false');
        row.title = open ? 'Text zuklappen' : 'Text aufklappen – alle Fundstellen sind markiert';
        row.appendChild(el('span', 'gocc-n', os.length + '×'));
        if (!canned) { const lt = el('span', 'letter sm', SRC[si]); lt.style.background = srcVar(si); row.appendChild(lt); }
        else row.appendChild(el('i', 'dot'));
        const tw = el('span', 'usrc-tw');
        tw.appendChild(el('span', 'usrc-t', s.doc.title));
        row.append(tw, el('span', 'usrc-chev', open ? '▴' : '▾'));
        row.addEventListener('click', () => { gramState.open = open ? null : si; paintGram(view()); });
        item.appendChild(row);
        if (open) {
          const cls = new Map();
          os.forEach(o => {
            for (let i = o.start; i < o.pos; i++) if (!cls.has(i)) cls.set(i, 'fx-ctx');
            cls.set(o.pos, 'fx-next');
          });
          const focusPos = v.idx != null && v.si === si && wsel === v.chosen ? v.pos : null;
          const T = s.toks;
          const p = el('p', 'usrc-text');
          for (let i = 1; i < T.length; i++) {
            const tk = T[i];
            if (i > 1 && !tk.punct) p.appendChild(document.createTextNode(' '));
            const c = cls.get(i);
            if (c) p.appendChild(el('mark', c + (i === focusPos ? ' focus' : ''), tk.raw));
            else p.appendChild(document.createTextNode(tk.raw));
          }
          requestAnimationFrame(() => {
            const m = p.querySelector('mark.focus') || p.querySelector('mark');
            if (m && p.scrollHeight > p.clientHeight) p.scrollTop = Math.max(0, m.offsetTop - p.clientHeight / 3);
          });
          item.appendChild(p);
        }
        list.appendChild(item);
      });
      b.appendChild(list);
    }

    /* Quellen: wie viele Token aus welchem Text (antippen = Text mit markierten Token). */
    function paintSrc(v) {
      const b = Z.cols.src.body;
      b.replaceChildren();
      if (!v) return;
      if (canned && !session.steps.some(st => st.si >= 0)) return;
      if (canned && srcState.open != null && !session.steps.some(st => st.si === srcState.open)) srcState.open = null;
      b.appendChild(el('p', 'p1-line', canned
        ? 'Kein Text passt zu deiner Frage – Tiny nimmt alle Texte und rät.'
        : 'A · B · C sind die Quellen, weil hier die größte Übereinstimmung mit deiner Frage ist.'));
      const used = el('div', 'p1-used');
      used.appendChild(Zerlegen.usedSources(session, {
        state: srcState,
        repaint: () => paintSrc(view()),
        color: colorOf,
        letter: canned ? null : si => SRC[si],
        all: !canned,
        focus: v.idx != null && !v.seed ? { si: v.si, pos: v.pos } : null
      }));
      b.appendChild(used);
    }

    /* Aus Frage zerlegen: Quelle si im Reiter „Quellen“ aufklappen und hinscrollen. */
    function openSource(si) {
      srcState.open = si;
      if (!Z.isOpen('src')) Z.setOpen('src', true); else paintSrc(view());
      requestAnimationFrame(() => {
        const it = Z.cols.src.body.querySelector('.usrc[data-si="' + si + '"]');
        if (it) it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }

    function paintFocus(v) {
      let hint = '';
      if (asked && !['ask', 'cand', 'gram', 'src'].some(Z.isOpen)) hint = 'Öffne rechts eine Spalte – dann siehst du auch im Handy, was dahintersteckt.';
      Zerlegen.focusBanner(focusHost, v && v.idx != null ? v.idx : null, v && v.idx != null ? word(v.chosen) : '', () => setFocus(null), hint);
    }

    function paintCols() {
      const v = view();
      markWindow();
      paintFocus(v);
      if (Z.isOpen('cand')) paintCand(v); else Z.cols.cand.body.replaceChildren();
      if (Z.isOpen('ask')) paintAsk(); else { Z.cols.ask.body.replaceChildren(); askKey = null; }
      if (Z.isOpen('gram')) paintGram(v); else Z.cols.gram.body.replaceChildren();
      if (Z.isOpen('src')) paintSrc(v); else Z.cols.src.body.replaceChildren();
    }

    function setFocus(i) {
      stopPlay();
      focus = i;
      pick = null;
      updateText();
      paintCols();
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
      aBody.append(metaEl, bubble, warnEl);
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

      /* Nach der Frage: Tinys Zeile + Knöpfe wie in Phase 1 (statt Vorschläge + Eingabefeld). */
      sayBox = el('div', 'phone-say');
      sayEl = el('p', 'tiny-bubble');
      sayBox.append(tinyEl('normal'), sayEl);
      sayBox.hidden = true;
      controls = el('div', 'phone-controls');
      playBtn = el('button', 'btn primary', '▶ Weiter');
      playBtn.type = 'button';
      playBtn.dataset.spot = 'play2';
      const stepBtn = el('button', 'btn', '+1 Wort');
      stepBtn.type = 'button';
      stepBtn.dataset.spot = 'step2';
      const againBtn = el('button', 'btn', '↻ Nochmal');
      againBtn.type = 'button';
      againBtn.title = 'Neue Frage stellen';
      againBtn.dataset.spot = 'again';
      controls.append(playBtn, stepBtn, againBtn);
      controls.hidden = true;
      playBtn.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
      stepBtn.addEventListener('click', () => { stopPlay(); if (!doStep()) syncPlay(); });
      againBtn.addEventListener('click', resetChat);

      const bottom = el('div', 'phone-ask');
      askBox = bottom;
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
      phoneEl.append(sayBox, controls, bottom);
      return phoneEl;
    }

    function render() {
      stopPlay();
      asked = false; canned = false; session = null; R = null; focus = null; pick = null; done = false;

      Z = Zerlegen.columns({
        store: 'tinylm-p2-offen',
        onPointer: stopPlay,
        onChange: id => {
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
      /* Reihenfolge (Sönke 12.11.2026): Frage zerlegen · Kandidaten · N-Gramme über Quellen
         (zwei Reiter untereinander: N-Gramme grün wie das Kontextfenster, Quellen gelb wie in Phase 1). */
      const stack = el('div', 'p1-stack');
      stack.append(
        Z.column('gram', 'context', '👀', 'Kontextfenster', 'Wo steht das?', 'ngramme2'),
        Z.column('src', 'origin', '📑', 'Quellen', 'Aus welchen Texten?', 'quellen'));
      row.append(
        Z.column('ask', 'ask', '🔎', 'Frage zerlegen', 'Was sucht Tiny?', 'nachschlagen'),
        Z.column('cand', 'candidates', '🎲', 'Kandidaten', 'Welches Wort kommt?', 'wortfuerwort'),
        stack);
      right.appendChild(row);

      /* Feste Köpfe (werden nie neu gebaut): Kandidaten = Temperatur,
         N-Gramme = Regler N-Gramm (Start 3-Gramm). */
      const tsl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, spot: 'temp',
        fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => { temp = Math.round(v * 10) / 10; if (Z.isOpen('cand')) paintCand(view()); }
      });
      Z.cols.cand.tools.appendChild(tsl.el);
      const nsl = Info.slider({
        label: 'N-Gramm', min: 1, max: 7, step: 1, value: n + 1, spot: 'nslider2',
        fmt: v => v + '-Gramm', ends: ['kurz', 'lang'],
        onInput: v => { n = v - 1; syncGramLine(); paintCols(); }
      });
      Z.cols.gram.tools.appendChild(nsl.el);
      gramLine = el('p', 'p1-gramline');
      Z.cols.gram.tools.appendChild(gramLine);
      syncGramLine();

      grid.append(left, right);
      root.appendChild(grid);
      host.replaceChildren(root);
      syncLayers();
      paintCols();
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
