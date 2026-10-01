/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — parse.js   ·   Quiz-Text → Fragen
   ══════════════════════════════════════════════════════════════
   Liest frei eingetippten oder eingefügten Text und erkennt, was
   Frage und was Antwort ist. Absichtlich großzügig:

     · Fragen:   1.  1)  1:  Frage 1:  F1.  Q1)  #1  — oder gar nichts
     · Antworten: a)  A.  (a)  [a]  a:  a -  — oder gar nichts
     · Richtig:  * ✓ ✔ ✅ [x]  (richtig)  **fett**  oder eine Zeile
                 „Lösung: b"  oder ein Schlüssel am Ende „1-b 2-c"
     · Erklärung: „Erklärung: …"  „Hinweis: …"
     · Umbrüche mitten in Frage oder Antwort werden zusammengefügt.
     · Falsche Reihenfolge der Nummern/Buchstaben, doppelte Zeichen,
       Groß/Klein: alles egal — es zählt die Reihenfolge im Text.

   parse(text) → {
     title,                 // erkannter Titel oder ''
     questions: [{ question_text, options[4], correct_indices,
                   correct_idx, time_limit_sec, explanation,
                   status, notes[] }],
     lines: [{ kind, qi, oi }],   // je Rohzeile, für die Einfärbung
     stats: { questions, answers, onlyQuestions, noCorrect, warnings }
   }
   status: 'ok' | 'nur-frage' | 'keine-richtige' | 'zu-wenig' | 'ohne-text'

   Läuft im Browser (window.KSParse) und in Node (module.exports).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const OK_TRAIL = /\s*(?:[✓✔✅☑]️?|\*|\(\s*(?:richtig|korrekt|correct|right|x|ja)\s*\)|\[\s*(?:richtig|korrekt|correct|x)\s*\]|[-–—=]\s*(?:richtig|korrekt|correct|ja))\s*$/i;
  const OK_LEAD  = /^(?:[✓✔✅☑]️?|\[\s*[xX✓✔]\s*\]|\(\s*[xX✓✔]\s*\))\s*/;
  const BOX_OFF  = /^(?:\[\s*\]|\(\s*\)|[☐⬜])\s*/;
  const SOL_RE   = /^(?:l[öo]sung(?:en)?|richtig(?:e)?(?:\s+antwort(?:en)?)?|korrekt(?:e)?(?:\s+antwort(?:en)?)?|antwort(?:en)?|answers?|solutions?)\s*[:=\-–]\s*(.+)$/i;
  const EXPL_RE  = /^(?:erkl[äa]rung|begr[üu]ndung|hinweis|tipp|info|kommentar|explanation|note)\s*[:\-–]\s*(.*)$/i;
  const TITLE_RE = /^(?:#{1,3}\s+|(?:titel|quiz|thema|title)\s*[:=]\s*)(.+)$/i;
  const KEY_RE   = /^(\d{1,3})\s*[.):\-–=]?\s*([a-h](?:\s*[,/&+]\s*[a-h])*)$/i;
  const Q_WORD   = /^(?:frage|aufgabe|question)\s*(\d{1,3})\s*[:.\-–)]?\s*(.*)$/i;
  const Q_NUM    = /^(?:(?:q|f|nr\.?|no\.?|#)\s*)?(\d{1,3})\s*[.):\]]+(?!\d)\s*(.*)$/i;
  const A_PAREN  = /^[(\[]?([a-h])[)\]]\s*(.*)$/i;
  const A_DOT    = /^([a-h])\s*[.:]\s+(.*)$/i;
  const A_DASH   = /^([a-h])\s+[-–—]\s+(.*)$/i;

  const clean = s => String(s || '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();

  /* Antworten, die in derselben Zeile hintereinander stehen:
     „a) 3  b) 4  c) 5" — nur wenn a, b, … der Reihe nach folgen. */
  function splitInline(text) {
    const re = /(?:^|\s)[(\[]?([a-h])[)\]]\s+/gi;
    const hits = [];
    let m;
    while ((m = re.exec(text))) {
      hits.push({ at: m.index, end: re.lastIndex, ch: m[1].toLowerCase() });
    }
    if (hits.length < 2 || hits[0].ch !== 'a' || hits[1].ch !== 'b') return null;
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].ch.charCodeAt(0) !== hits[i - 1].ch.charCodeAt(0) + 1) {
        hits.length = i; break;
      }
    }
    if (hits.length < 2) return null;
    const head = text.slice(0, hits[0].at).trim();
    const parts = hits.map((h, i) =>
      text.slice(h.end, i + 1 < hits.length ? hits[i + 1].at : text.length).trim());
    return { head, parts };
  }

  /* „b", „B, C", „b) Berlin", „2" → [1] / [1,2] / [1] / [1] ; sonst null */
  function solTokens(rest) {
    const out = [];
    let s = rest.trim();
    const tok = /^[(\[]?([a-h]|[1-8])[)\]]?(?=$|[\s,;/&+.:\-–])/i;
    let m = tok.exec(s);
    if (!m) return null;
    while (m) {
      const t = m[1].toLowerCase();
      out.push(/\d/.test(t) ? (+t - 1) : t.charCodeAt(0) - 97);
      s = s.slice(m[0].length).replace(/^\s*(?:,|;|\/|&|\+|und|and)?\s*/i, '');
      if (!s || /^[a-h1-8][)\]]?\s+\S{3,}/i.test(s) && out.length === 1 && /[)\]]/.test(rest.slice(0, 3))) break;
      m = tok.exec(s);
    }
    return out;
  }

  /* ─── Rohzeile analysieren (ohne Zusammenhang) ─── */
  function analyse(raw) {
    let s = String(raw || '').replace(/[​-‍﻿]/g, '').replace(/ /g, ' ').trim();
    const a = { raw, blank: false };
    if (!s) { a.blank = true; return a; }

    // Aufzählungszeichen weg (ein „*" direkt am Text ist dagegen ein Richtig-Zeichen)
    s = s.replace(/^[•·▪►→▸◦]\s*/, '').replace(/^[-–—]\s+/, '').replace(/^\*\s+(?=\S)/, '');

    let m;
    if ((m = TITLE_RE.exec(s)) && !/^#\d/.test(s)) { a.title = clean(m[1]); return a; }
    if ((m = EXPL_RE.exec(s))) { a.expl = clean(m[1]); return a; }
    if ((m = SOL_RE.exec(s))) {
      const t = solTokens(m[1]);
      if (t) { a.sol = t; return a; }
    }
    if ((m = KEY_RE.exec(s))) {
      a.key = { num: +m[1], idx: m[2].toLowerCase().match(/[a-h]/g).map(c => c.charCodeAt(0) - 97) };
      return a;
    }

    // Fettdruck als Richtig-Zeichen (aus Webseiten/Word kopiert)
    let bold = false;
    if (/^(\*\*|__).+\1$/.test(s)) { bold = true; s = s.slice(2, -2).trim(); }
    else if (/(\*\*|__)[^*_]+\1\s*$/.test(s) && /^[(\[]?[a-h][)\].:]/i.test(s.replace(/^(\*\*|__)/, ''))) bold = true;
    s = s.replace(/^(\*\*|__)/, '');

    // Richtig-Zeichen vorn
    let ok = bold, off = false;
    if (OK_LEAD.test(s)) { ok = true; s = s.replace(OK_LEAD, ''); }
    else if (BOX_OFF.test(s)) { off = true; s = s.replace(BOX_OFF, ''); }
    else if (/^\*(?=\S)/.test(s) && !/^\*\*/.test(s)) { ok = true; s = s.replace(/^\*\s*/, ''); }

    // Fragen-Nummer
    if ((m = Q_WORD.exec(s)) || (m = Q_NUM.exec(s))) {
      a.q = { num: +m[1], text: clean(m[2]) };
      return a;
    }

    // Antwort-Buchstabe
    m = A_PAREN.exec(s) || A_DOT.exec(s) || A_DASH.exec(s);
    if (m) {
      let text = m[2], trailOk = false;
      if (OK_TRAIL.test(clean(text))) { trailOk = true; }
      a.ans = { label: m[1].toLowerCase(), text, ok: ok || trailOk, off };
      return a;
    }

    a.text = s;
    a.ok = ok;
    return a;
  }

  function stripOk(text) {
    let t = clean(text);
    let ok = false;
    for (let i = 0; i < 3; i++) {
      if (OK_TRAIL.test(t)) { t = t.replace(OK_TRAIL, '').trim(); ok = true; }
    }
    if (OK_LEAD.test(t)) { t = t.replace(OK_LEAD, ''); ok = true; }
    return { text: t, ok };
  }

  /* ═══════════════════════════════════════════════════════════ */
  function parse(input) {
    const rawLines = String(input == null ? '' : input).replace(/\r\n?/g, '\n').split('\n');
    const A = rawLines.map(analyse);

    const hasAns = A.some(x => x.ans);
    const hasQ   = A.some(x => x.q);
    const anyQmark = A.some(x => x.text && /\?\s*$/.test(x.text));
    const anyBlank = A.some(x => x.blank);
    const textLines = A.filter(x => x.text != null || x.q || x.ans).length;

    const lines = A.map(() => ({ kind: 'n', qi: -1, oi: -1 }));
    const questions = [];
    let cur = null;
    let last = 'none';        // letzte Zeilenart: q | a | expl | none
    let gap = false;
    let title = '';
    const keys = [];

    const newQ = (text, num) => {
      cur = { num: num == null ? null : num, text: text || '', options: [], explanation: '',
              sol: null, notes: [], _line: -1 };
      questions.push(cur);
      return cur;
    };
    const addAns = (text, ok, label) => {
      const r = stripOk(text);
      cur.options.push({ text: r.text, ok: ok || r.ok, label: label || null });
      return cur.options.length - 1;
    };
    const nextNonBlank = i => {
      for (let j = i + 1; j < A.length; j++) if (!A[j].blank) return A[j];
      return null;
    };
    const mark = (i, kind, qi, oi) => { lines[i] = { kind, qi, oi: oi == null ? -1 : oi }; };

    // Rest einer Zeile, der „a) … b) …" enthält, auf Antworten verteilen
    const inlineAnswers = (rest, i) => {
      const sp = splitInline(rest);
      if (!sp) return rest;
      sp.parts.forEach(p => addAns(p, false, null));
      last = 'a';
      return sp.head;
    };

    for (let i = 0; i < A.length; i++) {
      const a = A[i];

      if (a.blank) { gap = true; continue; }
      const wasGap = gap;
      gap = false;

      if (a.title != null) {
        if (!title && !questions.length) { title = a.title; mark(i, 'title', -1); }
        continue;
      }

      if (a.key) { keys.push(a.key); mark(i, 'key', -1); continue; }

      if (a.sol) {
        if (cur) { cur.sol = (cur.sol || []).concat(a.sol); mark(i, 'sol', questions.length - 1); }
        continue;
      }

      if (a.expl != null) {
        if (cur) {
          cur.explanation = (cur.explanation ? cur.explanation + ' ' : '') + a.expl;
          last = 'expl';
          mark(i, 'expl', questions.length - 1);
        }
        continue;
      }

      /* ── nummerierte Frage ── */
      if (a.q) {
        const q = newQ('', a.q.num);
        const head = inlineAnswers(a.q.text, i);
        q.text = head;
        last = q.options.length ? 'a' : 'q';
        mark(i, 'q', questions.length - 1);
        continue;
      }

      /* ── beschriftete Antwort ── */
      if (a.ans) {
        const startsNew = !cur || (cur.options.length > 0 && a.ans.label === 'a'
          && cur.options.some(o => o.label === 'a'));
        if (startsNew) {
          newQ('', null);
          cur.notes.push('Frage fehlt — davor stand nichts, das nach Frage aussah.');
        }
        const sp = splitInline(a.ans.text);
        let oi;
        if (sp) {
          oi = addAns(sp.head, a.ans.ok, a.ans.label);
          sp.parts.forEach(p => addAns(p, false, null));
        } else {
          oi = addAns(a.ans.text, a.ans.ok, a.ans.label);
        }
        last = 'a';
        mark(i, cur.options[oi].ok ? 'c' : 'a', questions.length - 1, oi);
        continue;
      }

      /* ── Zeile ohne Zeichen: Zusammenhang entscheidet ── */
      const t = a.text;
      const endsQ = /\?\s*$/.test(t);
      const nx = nextNonBlank(i);
      const nextIsA1 = !!(nx && nx.ans && nx.ans.label === 'a');
      const qi = questions.length - 1;

      // 1) Frage hat noch keinen Text („1." und darunter die Frage)
      if (cur && cur.text === '' && !cur.options.length) {
        cur.text = clean(t); last = 'q'; mark(i, 'q', qi); continue;
      }

      if (hasAns) {
        // „c Madrid": Buchstabe ohne Zeichen, aber genau der nächste in der Reihe
        const bare = /^([a-h])\s+(\S.*)$/i.exec(t);
        if (cur && last === 'a' && bare && !wasGap
            && bare[1].toLowerCase() === String.fromCharCode(97 + cur.options.length)) {
          const oi = addAns(bare[2], !!a.ok, bare[1].toLowerCase());
          mark(i, cur.options[oi].ok ? 'c' : 'a', qi, oi); continue;
        }
        // Frage über mehrere Zeilen
        if (cur && last === 'q' && !wasGap && !cur.options.length && cur.text
            && !/\?\s*$/.test(cur.text)) {
          cur.text = clean(cur.text + ' ' + t); mark(i, 'q', qi); continue;
        }
        if (cur && !endsQ && !nextIsA1) {
          if (last === 'a' && cur.options.length < 4 && (!wasGap || hasQ)) {
            // umgebrochene Antwort
            const o = cur.options[cur.options.length - 1];
            const r = stripOk(o.text + ' ' + t);
            o.text = r.text; o.ok = o.ok || r.ok || !!a.ok;
            mark(i, o.ok ? 'c' : 'a', qi, cur.options.length - 1); continue;
          }
          if (last === 'a' && hasQ) {
            const o = cur.options[cur.options.length - 1];
            o.text = clean(o.text + ' ' + t); mark(i, o.ok ? 'c' : 'a', qi, cur.options.length - 1); continue;
          }
          if (last === 'expl' && !wasGap) {
            cur.explanation = clean(cur.explanation + ' ' + t); mark(i, 'expl', qi); continue;
          }
          if (hasQ && wasGap && last === 'q') {
            cur.text = clean(cur.text + ' ' + t); mark(i, 'q', qi); continue;
          }
        }
        // sonst: neue (unnummerierte) Frage
        const q = newQ(clean(t), null);
        last = 'q';
        mark(i, 'q', questions.length - 1);
        continue;
      }

      /* Nur Fragen nummeriert, Antworten ohne Buchstaben */
      if (hasQ) {
        if (cur) {
          if (last === 'expl' && !wasGap) {
            cur.explanation = clean(cur.explanation + ' ' + t); mark(i, 'expl', qi); continue;
          }
          const oi = addAns(t, !!a.ok, null);
          last = 'a';
          mark(i, cur.options[oi].ok ? 'c' : 'a', qi, oi);
          continue;
        }
        newQ(clean(t), null); last = 'q'; mark(i, 'q', 0); continue;
      }

      /* Gar keine Zeichen: Blöcke aus Leerzeilen, ? als Hinweis */
      const allQuestions = !anyBlank && !anyQmark && (textLines % 5 !== 0 || textLines < 5);
      if (allQuestions) { newQ(clean(t), null); last = 'q'; mark(i, 'q', questions.length - 1); continue; }
      if (!anyBlank && !anyQmark) {
        // Fünferblöcke: Frage + vier Antworten
        const pos = A.slice(0, i).filter(x => x.text != null).length;
        if (pos % 5 === 0) { newQ(clean(t), null); last = 'q'; mark(i, 'q', questions.length - 1); continue; }
        const oi = addAns(t, !!a.ok, null); last = 'a';
        mark(i, cur.options[oi].ok ? 'c' : 'a', questions.length - 1, oi);
        continue;
      }
      if (!cur || wasGap || (endsQ && cur.options.length > 0) || (endsQ && last === 'q')) {
        newQ(clean(t), null); last = 'q'; mark(i, 'q', questions.length - 1); continue;
      }
      if (last === 'expl' && !wasGap) {
        cur.explanation = clean(cur.explanation + ' ' + t); mark(i, 'expl', qi); continue;
      }
      {
        const oi = addAns(t, !!a.ok, null); last = 'a';
        mark(i, cur.options[oi].ok ? 'c' : 'a', qi, oi);
      }
    }

    /* Titel erraten: erste Zeile ohne Zeichen vor der ersten Frage, wenn
       danach klar nummerierte oder beschriftete Fragen folgen. */
    if (!title && hasQ && questions.length > 1) {
      const q0 = lines.findIndex(l => l.kind === 'q');
      for (let i = 0; i < q0; i++) {
        if (A[i] && A[i].text && !/\?\s*$/.test(A[i].text) && A[i].text.length <= 80) {
          title = clean(A[i].text); lines[i] = { kind: 'title', qi: -1, oi: -1 };
          // dieselbe Zeile steckt evtl. als Frage ohne Nummer in questions[0]
          if (questions[0] && !questions[0].num && questions[0].text === title && !questions[0].options.length) {
            questions.shift();
            for (const l of lines) if (l.qi >= 0) l.qi--;
          }
          break;
        }
      }
    }

    /* Lösungsschlüssel am Ende („1-b 2-c") */
    for (const k of keys) {
      const q = questions.find(x => x.num === k.num) || questions[k.num - 1];
      if (q) q.sol = (q.sol || []).concat(k.idx);
    }

    /* ─── Aufräumen und in Editor-Form bringen ─── */
    const out = [];
    const stats = { questions: 0, answers: 0, onlyQuestions: 0, noCorrect: 0, warnings: 0 };

    questions.forEach(q => {
      let opts = q.options.slice();
      const notes = q.notes.slice();
      let correct = [];
      opts.forEach((o, i) => { if (o.ok) correct.push(i); });
      if (q.sol) {
        q.sol.forEach(i => { if (i >= 0 && i < opts.length && !correct.includes(i)) correct.push(i); });
      }

      // mehr als vier: die richtigen behalten
      if (opts.length > 4) {
        notes.push('Mehr als 4 Antworten — das Quiz hat 4 Felder, nur die ersten 4 (plus richtige) bleiben.');
        const keep = [];
        correct.forEach(i => { if (keep.length < 4) keep.push(i); });
        for (let i = 0; i < opts.length && keep.length < 4; i++) if (!keep.includes(i)) keep.push(i);
        keep.sort((x, y) => x - y);
        const map = new Map(keep.map((old, ni) => [old, ni]));
        correct = correct.filter(i => map.has(i)).map(i => map.get(i));
        opts = keep.map(i => opts[i]);
      }

      let status = 'ok';
      if (!q.text && !opts.length) status = 'ohne-text';
      else if (!opts.length) status = 'nur-frage';
      else if (opts.length < 2) status = 'zu-wenig';
      else if (!correct.length) status = 'keine-richtige';
      if (!q.text && opts.length) { status = 'ohne-text'; }

      if (status === 'nur-frage') { notes.push('Nur die Frage — Antworten kannst du nach dem Übernehmen ergänzen.'); stats.onlyQuestions++; }
      if (status === 'zu-wenig') notes.push('Nur eine Antwort erkannt.');
      if (status === 'keine-richtige') { notes.push('Keine richtige Antwort markiert — A gilt vorerst. Kannst du später ändern.'); stats.noCorrect++; }
      if (status === 'ohne-text') notes.push('Der Fragetext fehlt.');

      const options = ['', '', '', ''];
      opts.slice(0, 4).forEach((o, i) => { options[i] = o.text; });
      if (!correct.length) correct = [0];
      correct = correct.filter(i => i < 4).sort((x, y) => x - y);
      if (!correct.length) correct = [0];

      if (status !== 'ok') stats.warnings++;
      stats.questions++;
      stats.answers += opts.length;

      out.push({
        question_text: q.text,
        options,
        correct_idx: correct[0],
        correct_indices: correct,
        time_limit_sec: 20,
        explanation: q.explanation || null,
        status,
        notes
      });
    });

    return { title, questions: out, lines, stats };
  }

  const EXAMPLE = [
    'Quiz: Tablet-Grundlagen',
    '',
    '1. Wie schaltet man das Tablet in den Ruhezustand?',
    'a) Kurz auf die Seitentaste drücken ✓',
    'b) Das Tablet schütteln',
    'c) Den Akku herausnehmen',
    'd) Gar nicht möglich',
    'Erklärung: Ein kurzer Druck sperrt den Bildschirm.',
    '',
    '2. Was ist ein WLAN?',
    'a) Ein drahtloses Netzwerk *',
    'b) Eine Zeitschrift',
    'c) Ein Ladekabel',
    '',
    '3. Welche Apps dürfen im Unterricht geöffnet werden?'
  ].join('\n');

  const api = { parse, EXAMPLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KSParse = api;
})();
