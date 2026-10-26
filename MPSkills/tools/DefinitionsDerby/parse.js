/* ══════════════════════════════════════════════════════════════
   Definitions Derby — parse.js   ·   Text → Karten
   ══════════════════════════════════════════════════════════════
   Liest frei eingetippten oder eingefügten Text und erkennt, was
   Begriff und was Definition ist. Absichtlich großzügig, wie der
   Quiz-Text von Knowledge Stack (tools/KnowledgeStack/parse.js):

     Kopfzeilen (vor der ersten Karte):
        Titel: …   (auch „# …“)   Fach: …   Thema: …
        Klasse: 7  (auch Klassenstufe / Stufe / Jahrgang)

     Eine Karte pro Zeile, Begriff und Definition getrennt durch
        :   =   –   —   -  (mit Leerzeichen drumherum)   →   ->   =>   ;   Tab
        Nummern und Aufzählungszeichen davor sind egal:
        „1.“  „1)“  „-“  „•“  „*“  „a)“,  **fett** auch.

     Oder Blöcke, durch Leerzeilen getrennt: erste Zeile = Begriff,
     der Rest = Definition.

     Oder abwechselnd: Begriff, Definition, Begriff, Definition …
     (ohne Trennzeichen, gerade Zeilenzahl, Definitionen länger).

     Umbrüche mitten in einer Definition werden zusammengefügt:
     eine Zeile ohne Trennzeichen, die eingerückt ist, klein beginnt
     oder auf eine Definition ohne Schlusspunkt folgt, gehört dazu.

   parse(text) → { title, subject, topic, grade, mode,
                   cards: [{ t, d, w }], stats: { cards, warnings } }
     w (Warnung je Karte, optional): 'ohne-definition' | 'doppelt' | 'lang'
     mode: 'zeile' | 'tab' | 'block' | 'abwechselnd' | 'leer'

   toText(stack) → Text, den parse() wieder zu denselben Karten macht.

   Läuft im Browser (window.DDParse) und in Node (module.exports).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const HEAD_KEYS = {
    title:   /^(?:titel|title|name|stapel)\s*[:=]\s*(.+)$/i,
    subject: /^(?:fach|subject)\s*[:=]\s*(.+)$/i,
    topic:   /^(?:thema|topic|kapitel|unit)\s*[:=]\s*(.+)$/i,
    grade:   /^(?:klasse|klassenstufe|stufe|jahrgang|jahrgangsstufe|grade)\s*[:=]\s*(.+)$/i
  };
  const H1 = /^#{1,3}\s+(.+)$/;

  /* Trenner mit Stärke: je kleiner die Zahl, desto sicherer. Das erste
     Zeichen der Zeile, das einer passt, entscheidet — aber ein
     Doppelpunkt zählt erst nach einem kurzen Begriff. */
  const SEPS = [
    { re: /\s*(?:→|=>|->|⇒|➜|➔)\s*/ },
    { re: /\s+[–—]\s+|\s*[—]\s*/ },
    { re: /\s+-\s+/ },
    { re: /\s*:\s+|\s*:(?=\S)/ },            // „Begriff: …“ und „Begriff:…“
    { re: /\s+=\s+|\s*=\s*/ },
    { re: /\s*;\s*/ }
  ];

  const BULLET = /^\s*(?:[-•*·‣▪●○]\s+|\d{1,3}\s*[.)]\s+|[a-hA-H]\s*[.)]\s+)/;
  const clean = s => String(s == null ? '' : s).replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  const words = s => (s.match(/\S+/g) || []).length;

  function headLine(line) {
    const t = line.trim();
    let m;
    if ((m = H1.exec(t))) return { key: 'title', val: clean(m[1]) };
    for (const k of Object.keys(HEAD_KEYS)) {
      if ((m = HEAD_KEYS[k].exec(t))) return { key: k, val: clean(m[1]) };
    }
    return null;
  }

  /* Eine Zeile in [Begriff, Definition] teilen oder null. Ein Doppelpunkt
     oder Gleichheitszeichen zählt nur, wenn davor ein kurzer Begriff steht
     (höchstens 8 Wörter, 70 Zeichen) — sonst ist es Fließtext. */
  function splitLine(raw) {
    const s = raw.replace(BULLET, '').replace(/\*\*|__/g, '').trim();
    let best = null;
    for (const sep of SEPS) {
      const m = sep.re.exec(s);
      if (!m || m.index === 0) continue;
      const t = clean(s.slice(0, m.index));
      const d = clean(s.slice(m.index + m[0].length));
      if (!t || !d) continue;
      if (t.length > 70 || words(t) > 8) continue;
      // Das Trennzeichen, das am weitesten vorn steht, gewinnt.
      if (!best || m.index < best.at) best = { at: m.index, t, d };
    }
    return best ? [best.t, best.d] : null;
  }

  function addCard(cards, t, d) {
    cards.push({ t: clean(t), d: clean(d) });
  }

  function finish(res, cards, mode) {
    const seen = new Map();
    let warnings = 0;
    for (const c of cards) {
      if (!c.t) continue;
      const key = c.t.toLowerCase();
      if (!c.d) { c.w = 'ohne-definition'; warnings++; }
      else if (seen.has(key)) { c.w = 'doppelt'; warnings++; }
      else if (c.d.length > 1200 || c.t.length > 120) { c.w = 'lang'; warnings++; }
      seen.set(key, true);
    }
    res.cards = cards.filter(c => c.t);
    res.mode = res.cards.length ? mode : 'leer';
    res.stats = { cards: res.cards.length, warnings };
    return res;
  }

  function parse(text) {
    const res = { title: '', subject: '', topic: '', grade: '', mode: 'leer', cards: [], stats: { cards: 0, warnings: 0 } };
    const lines = String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');

    /* Kopf: Zeilen am Anfang, die Titel/Fach/Thema/Klasse sind. Leerzeilen
       dazwischen sind egal; die erste andere Zeile beendet den Kopf. */
    let i = 0;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trim()) continue;
      const h = headLine(l);
      if (!h) break;
      res[h.key] = h.val;
    }
    const body = lines.slice(i);
    if (!body.some(l => l.trim())) return finish(res, [], 'leer');

    const filled = body.filter(l => l.trim());

    /* ── Tab: aus Excel/Sheets eingefügt ── */
    const tabbed = filled.filter(l => /\t/.test(l) && l.split('\t').filter(x => x.trim()).length >= 2);
    if (tabbed.length >= Math.max(1, Math.ceil(filled.length * 0.6))) {
      const cards = [];
      for (const l of filled) {
        const p = l.replace(BULLET, '').split('\t').map(clean);
        if (p.length >= 2 && p[0]) addCard(cards, p[0], p.slice(1).filter(Boolean).join(' '));
        else if (p[0] && cards.length && /^\s/.test(l)) cards[cards.length - 1].d = clean(cards[cards.length - 1].d + ' ' + p[0]);
        else if (p[0]) addCard(cards, p[0], '');
      }
      return finish(res, cards, 'tab');
    }

    /* ── Zeile: die meisten Zeilen haben ein Trennzeichen ── */
    const splits = filled.map(splitLine);
    const hits = splits.filter(Boolean).length;
    if (hits >= Math.max(1, Math.ceil(filled.length * 0.5))) {
      const cards = [];
      let prevEndsOpen = false;
      for (let k = 0; k < filled.length; k++) {
        const l = filled[k];
        const sp = splits[k];
        if (sp) { addCard(cards, sp[0], sp[1]); prevEndsOpen = !/[.!?)"“»]$/.test(sp[1]); continue; }
        const txt = clean(l.replace(BULLET, ''));
        const last = cards[cards.length - 1];
        const indented = /^\s{2,}|^\t/.test(l);
        const lower = /^[a-zäöüß(]/.test(txt);
        if (last && last.d && (indented || lower || prevEndsOpen)) {
          last.d = clean(last.d + ' ' + txt);
          prevEndsOpen = !/[.!?)"“»]$/.test(txt);
        } else if (last && !last.d) {
          last.d = txt;                      // „Begriff:“ allein, Definition darunter
          prevEndsOpen = !/[.!?)"“»]$/.test(txt);
        } else {
          addCard(cards, txt, '');
          prevEndsOpen = false;
        }
      }
      return finish(res, cards, 'zeile');
    }

    /* ── Block: durch Leerzeilen getrennt ── */
    const blocks = [];
    let cur = [];
    for (const l of body) {
      if (l.trim()) cur.push(l);
      else if (cur.length) { blocks.push(cur); cur = []; }
    }
    if (cur.length) blocks.push(cur);
    if (blocks.length >= 2 && blocks.filter(b => b.length >= 2).length >= Math.ceil(blocks.length * 0.6)) {
      const cards = blocks.map(b => ({
        t: clean(b[0].replace(BULLET, '')),
        d: clean(b.slice(1).join(' '))
      }));
      return finish(res, cards, 'block');
    }

    /* ── Abwechselnd: Begriff, Definition, Begriff, Definition … ── */
    if (filled.length >= 2 && filled.length % 2 === 0) {
      let a = 0, b = 0;
      for (let k = 0; k < filled.length; k += 2) { a += filled[k].length; b += filled[k + 1].length; }
      if (b > a) {
        const cards = [];
        for (let k = 0; k < filled.length; k += 2) addCard(cards, filled[k].replace(BULLET, ''), filled[k + 1]);
        return finish(res, cards, 'abwechselnd');
      }
    }

    /* Nichts erkannt: jede Zeile ein Begriff ohne Definition — die Vorschau
       zeigt dann gelb, was fehlt, statt still nichts zu tun. */
    return finish(res, filled.map(l => ({ t: clean(l.replace(BULLET, '')), d: '' })), 'zeile');
  }

  function toText(stack) {
    const out = [];
    const s = stack || {};
    if (s.title)   out.push('Titel: ' + s.title);
    if (s.subject) out.push('Fach: ' + s.subject);
    if (s.topic)   out.push('Thema: ' + s.topic);
    if (s.grade)   out.push('Klasse: ' + s.grade);
    if (out.length) out.push('');
    for (const c of (s.cards || [])) {
      const t = String(c.t || '').replace(/\s+/g, ' ').trim();
      const d = String(c.d || '').replace(/\s+/g, ' ').trim();
      if (!t && !d) continue;
      // Ein Doppelpunkt im Begriff würde beim Zurücklesen falsch trennen.
      out.push(t + (/:/.test(t) ? ' – ' : ': ') + d);
    }
    return out.join('\n');
  }

  const api = { parse, toText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.DDParse = api;
})();
