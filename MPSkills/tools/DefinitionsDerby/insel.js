/* ══════════════════════════════════════════════════════════════
   MPSkills — Definitions Derby  ·  insel.js  (window.DDInsel)
   ══════════════════════════════════════════════════════════════
   Die Regeln der Insel ohne Bildschirm: Stufen, welche Aufgabe zu
   welcher Stufe gehört, wie Aufgaben aus den Karten entstehen und
   wie nachsichtig Freitext geprüft wird. Läuft im Browser und in
   Node (tests/insel.test.mjs). tool.js lädt sie nach, sobald die
   Insel geöffnet wird. Plan: CLAUDE.md „Etappe 3: Insel“.

   Jeder Begriff ist ein Wesen. Seine Stufe e (0…5) ist sein
   Lernstand auf der Insel:

     e  Wesen       Aufgabe, um die NÄCHSTE Stufe zu erreichen
     0  Ei          Baby:  1 Definition, bis zu 6 Begriffe zur Wahl
     1  Baby        Klein: 1 Begriff, bis zu 4 Definitionen zur Wahl
     2  Klein       Mittel: Definition aus Bausteinen (+2 falsche)
     3  Mittel      Groß:  Definition sehen, Begriff eintippen
     4  Groß        Leuchtend: Lückentext, 2–3 Lücken eintippen
     5  Leuchtend   (fertig; Wiederholen = Lückentext)

   Einmal richtig = eine Stufe hoch. Zweimal in Folge falsch auf
   derselben Stufe = eine Stufe runter (Entscheidung Sönke
   27.10.2026). Gespeichert wird je Karte in prog: { e, x, t }
   (x = Fehler in Folge), neben l/s der Karteikarten.

   Auswahl-Antworten kommen aus DEMSELBEN Stapel; nur wenn der zu
   klein ist, wird mit anderen Stapeln aufgefüllt.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const STAGES = ['Ei', 'Baby', 'Klein', 'Mittel', 'Groß', 'Leuchtend'];
  const MAX = STAGES.length - 1;
  const TASKS = ['pickTerm', 'pickDef', 'build', 'typeTerm', 'cloze', 'cloze'];

  /* ─── Zufall: von außen einsetzbar (Tests), sonst Math.random ─── */
  let rnd = Math.random;
  function setRandom(fn) { rnd = typeof fn === 'function' ? fn : Math.random; }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ─── Stufe und Ergebnis ─── */
  const stageOf = e => (e && Number.isInteger(e.e) && e.e >= 0 && e.e <= MAX ? e.e : 0);
  const taskFor = e => TASKS[Math.max(0, Math.min(MAX, e))];

  /* Ergebnis einer Aufgabe auf den Stand einer Karte anwenden. */
  function apply(entry, ok) {
    const e = stageOf(entry);
    const x = entry && entry.x > 0 ? entry.x : 0;
    if (ok) {
      const n = Math.min(MAX, e + 1);
      return { e: n, x: 0, up: n > e, down: false };
    }
    if (x + 1 >= 2) {
      const n = Math.max(0, e - 1);
      return { e: n, x: 0, up: false, down: n < e };
    }
    return { e, x: x + 1, up: false, down: false };
  }

  /* ─── Text normalisieren (nachsichtig) ───
     Klein, Umlaute wie Grundbuchstaben (ä = a = ae), ß = ss,
     Satzzeichen und Bindestriche weg, Artikel vorn weg. */
  function fold(s) {
    return String(s || '').toLocaleLowerCase('de')
      .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
      .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function norm(s) {
    return fold(s)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^(der|die|das|ein|eine|einen|the|a|an|le|la|les)\s+/, '')
      .replace(/\s+/g, '');
  }
  /* Was als Antwort für einen Begriff gelten darf: der ganze Begriff,
     ohne Klammern, nur der Klammer-Inhalt („DNA“), und jede
     Schreibweise hinter „/“ oder „,“ („Zelle / Zellen“). */
  function variants(term) {
    const t = String(term || '');
    const out = new Set();
    const add = s => { const n = norm(s); if (n) out.add(n); };
    add(t);
    const noPar = t.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
    add(noPar);
    (t.match(/\(([^)]*)\)/g) || []).forEach(m => add(m.slice(1, -1)));
    noPar.split(/\s*[\/,;]\s*|\s+oder\s+|\s+bzw\.?\s+/).forEach(add);
    return [...out];
  }

  /* Damerau-Levenshtein (Vertauschung zweier Nachbarn = 1 Fehler). */
  function dist(a, b) {
    const n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    const d = [];
    for (let i = 0; i <= n; i++) { d[i] = [i]; }
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
        d[i][j] = v;
      }
    }
    return d[n][m];
  }
  /* Erlaubte Tippfehler nach Länge des richtigen Worts. */
  const slack = len => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 15 ? 3 : 4);

  /* Antwort gegen einen Begriff prüfen.
     → { ok, exact }  exact = ohne Tippfehler (nur für die Rückmeldung). */
  function check(input, term) {
    const a = norm(input);
    if (!a) return { ok: false, exact: false };
    let best = Infinity, exact = false;
    for (const v of variants(term)) {
      if (v === a) { exact = true; best = 0; break; }
      const d = dist(a, v);
      if (d <= slack(v.length) && d < best) best = d;
    }
    // Ein sehr kurzer Rest (ein Buchstabe) ist nie „fast richtig“.
    return { ok: best !== Infinity && a.length >= 2, exact };
  }

  /* ─── Antworten zur Wahl ───
     pool: alle Karten der Insel ({id, sid, t, d}). Zuerst derselbe
     Stapel, gleiche Begriffe/Definitionen nur einmal. */
  function others(card, pool, key, n) {
    const seen = new Set([norm(card[key])]);
    const pickFrom = list => {
      const out = [];
      for (const c of shuffle(list.slice())) {
        if (out.length >= n) break;
        const k = norm(c[key]);
        if (!k || seen.has(k)) continue;
        seen.add(k); out.push(c);
      }
      return out;
    };
    const same = pickFrom(pool.filter(c => c.sid === card.sid && c.id !== card.id));
    if (same.length >= n) return same;
    return same.concat(pickFrom(pool.filter(c => c.sid !== card.sid)).slice(0, n - same.length));
  }

  /* ─── Bausteine ───
     Die Definition wird in Satzteile geschnitten, jeder mindestens
     2 Wörter, am liebsten 3 (Entscheidung Sönke 28.10.2026: „1 Wort
     ergibt keinen Sinn“). Schnitt bevorzugt nach Satzzeichen und vor
     Bindewörtern/Präpositionen. Anzahl ≈ Wörter/3, höchstens 6.
     Unter 4 Wörtern gibt es nichts zu bauen → [] (makeTask weicht aus). */
  const CUT_BEFORE = new Set(['und', 'oder', 'aber', 'sowie', 'der', 'die', 'das', 'dem', 'den', 'des', 'welche', 'welcher',
    'welches', 'wenn', 'weil', 'dass', 'da', 'mit', 'in', 'im', 'für', 'aus', 'zu', 'zum', 'zur', 'von', 'vom', 'durch',
    'bei', 'beim', 'nach', 'um', 'auf', 'an', 'am', 'über', 'unter', 'zwischen', 'ohne', 'gegen', 'wie', 'als', 'ob',
    'so', 'damit', 'indem', 'sodass', 'wobei', 'wird', 'werden', 'ist', 'sind', 'hat', 'haben', 'kann', 'können']);
  const MIN_CHUNK = 2;
  function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean); }
  function chunks(def) {
    const w = words(def);
    if (w.length < 2 * MIN_CHUNK) return [];
    const k = Math.max(2, Math.min(6, Math.round(w.length / 3), Math.floor(w.length / MIN_CHUNK)));
    const cuts = [];
    let start = 0;
    for (let part = 1; part < k; part++) {
      const ideal = Math.round(w.length * part / k);
      // Schnitt VOR Wort i: davor mind. MIN_CHUNK seit dem letzten Schnitt, dahinter Platz für die restlichen Teile
      const lo = Math.max(start + MIN_CHUNK, ideal - 2), hi = Math.min(w.length - MIN_CHUNK * (k - part), ideal + 2);
      let best = Math.max(lo, Math.min(hi, ideal)), score = Infinity;
      for (let i = lo; i <= hi; i++) {
        const prev = w[i - 1], next = (w[i] || '').toLocaleLowerCase('de').replace(/[^a-zäöüß]/g, '');
        let s = Math.abs(i - ideal);
        if (/[,;:)]$/.test(prev) || /[.!?]$/.test(prev)) s -= 3;
        else if (CUT_BEFORE.has(next)) s -= 1.5;
        if (i - start === MIN_CHUNK) s += 0.6;   // 3 Wörter lieber als 2
        if (s < score) { score = s; best = i; }
      }
      cuts.push(best);
      start = best;
    }
    const out = [];
    let a = 0;
    for (const c of cuts.concat([w.length])) { if (c > a) { out.push(w.slice(a, c).join(' ')); a = c; } }
    return out;
  }

  /* ─── Lückentext ───
     2–3 Lücken (bei sehr kurzen Definitionen 1): bevorzugt Nomen
     (im Deutschen großgeschrieben, nicht am Satzanfang), lange
     Wörter zuerst, nicht der Begriff selbst, keine Füllwörter. */
  const STOP = new Set(['eine', 'einer', 'einem', 'einen', 'eines', 'sich', 'auch', 'nicht', 'oder', 'sowie', 'werden',
    'wird', 'wurde', 'sind', 'haben', 'hat', 'kann', 'können', 'dabei', 'dieser', 'diese', 'dieses', 'dass', 'wenn', 'weil',
    'durch', 'zwischen', 'gegen', 'ohne', 'unter', 'über', 'welche', 'welcher', 'welches', 'dessen', 'deren', 'immer',
    'meist', 'meistens', 'besonders', 'zum', 'zur', 'beim', 'etwas', 'viele', 'vielen', 'mehr', 'sehr', 'ganz', 'alle']);
  function clozeGaps(def, term) {
    const w = words(def);
    const tv = new Set(variants(term));
    const cand = [];
    w.forEach((raw, i) => {
      const m = raw.match(/^([^A-Za-zÄÖÜäöüß0-9]*)([A-Za-zÄÖÜäöüß0-9][A-Za-zÄÖÜäöüß0-9\-]*[A-Za-zÄÖÜäöüß0-9]|[A-Za-zÄÖÜäöüß0-9])([^A-Za-zÄÖÜäöüß0-9]*)$/);
      if (!m) return;
      const core = m[2];
      const lc = core.toLocaleLowerCase('de');
      if (core.length < 4 || STOP.has(lc) || /^\d+$/.test(core)) return;
      if (tv.has(norm(core))) return;
      const atStart = i === 0 || /[.!?:]$/.test(w[i - 1]);
      const noun = /^[A-ZÄÖÜ]/.test(core) && !atStart;
      cand.push({ i, pre: m[1], core, post: m[3], score: core.length + (noun ? 6 : 0) });
    });
    const want = w.length < 6 ? 1 : w.length < 14 ? 2 : 3;
    cand.sort((a, b) => b.score - a.score);
    const pick = [];
    for (const c of cand) {
      if (pick.length >= want) break;
      // Nicht zwei Lücken direkt nebeneinander: dann fehlt jeder Halt.
      if (pick.some(p => Math.abs(p.i - c.i) < 2) && cand.length > want + 1) continue;
      pick.push(c);
    }
    pick.sort((a, b) => a.i - b.i);
    // Teile: Text und Lücken im Wechsel, Satzzeichen bleiben stehen.
    const parts = [];
    let buf = [];
    const flush = () => { if (buf.length) { parts.push({ text: buf.join(' ') }); buf = []; } };
    w.forEach((raw, i) => {
      const g = pick.find(p => p.i === i);
      if (!g) { buf.push(raw); return; }
      if (g.pre) buf.push(g.pre);
      flush();
      parts.push({ gap: g.core });
      if (g.post) buf.push(g.post);
    });
    flush();
    // Satzzeichen direkt hinter einer Lücke ohne Leerzeichen anschließen.
    for (const p of parts) if (p.text) p.text = p.text.replace(/^([,.;:!?)])\s/, '$1 ');
    return parts;
  }
  /* Eine Lücke prüfen: wie beim Begriff, aber ohne Artikel-/Klammer-Varianten. */
  function checkGap(input, word) {
    const a = norm(input), v = norm(word);
    if (!a) return { ok: false, exact: false };
    if (a === v) return { ok: true, exact: true };
    return { ok: dist(a, v) <= slack(v.length), exact: false };
  }

  /* ─── Eine Aufgabe für eine Karte bauen ─── */
  function makeTask(card, pool, e) {
    const type = taskFor(e);
    const t = { type, card, stage: e };
    if (type === 'pickTerm') {
      t.options = shuffle([card].concat(others(card, pool, 't', 5))).map(c => ({ id: c.id, text: c.t }));
    } else if (type === 'pickDef') {
      t.options = shuffle([card].concat(others(card, pool, 'd', 3))).map(c => ({ id: c.id, text: c.d }));
    } else if (type === 'build') {
      const right = chunks(card.d);
      if (right.length < 2) {   // zu kurz zum Bauen: Begriff eintippen statt Wort-Schnipsel
        t.type = 'typeTerm';
        return t;
      }
      const rightN = new Set(right.map(norm));
      const wrong = [];
      for (const o of others(card, pool, 'd', 6)) {
        if (wrong.length >= 2) break;
        const cs = shuffle(chunks(o.d).filter(c => !rightN.has(norm(c))));
        if (cs.length) { wrong.push(cs[0]); rightN.add(norm(cs[0])); }
      }
      t.right = right;
      t.tiles = shuffle(right.map((text, i) => ({ k: 'r' + i, text })).concat(wrong.map((text, i) => ({ k: 'w' + i, text, wrong: true }))));
    } else if (type === 'cloze') {
      t.parts = clozeGaps(card.d, card.t);
      if (!t.parts.some(p => p.gap)) { t.type = 'typeTerm'; delete t.parts; }   // nichts zum Aussparen
    }
    return t;
  }
  /* Ist die Bausteinfolge richtig? Verglichen wird der TEXT (gleiche Teile sind austauschbar). */
  const buildOk = (task, seq) => seq.length === task.right.length && seq.every((s, i) => norm(s) === norm(task.right[i]));

  /* ─── Welche Wesen kommen in einer Runde dran ───
     Niedrige Stufen und gerade falsch Beantwortetes öfter; Leuchtende
     nur, wenn sonst nichts mehr da ist. Keine Karte zweimal in Folge. */
  function weight(entry) {
    const e = stageOf(entry);
    if (e >= MAX) return 0;
    return (entry && entry.x > 0 ? 6 : 0) + [5, 5, 4, 3.5, 3][e];
  }
  function session(cards, progOf, n) {
    const out = [];
    let left = cards.filter(c => weight(progOf(c.id)) > 0);
    const review = !left.length;
    if (review) left = cards.slice();
    const w = c => (review ? 1 : weight(progOf(c.id)));
    // Ziehen ohne Zurücklegen, dann ggf. von vorn (kleine Inseln)
    let bag = left.slice();
    while (out.length < n && left.length) {
      if (!bag.length) bag = left.slice();
      const cand = bag.filter(c => !out.length || out[out.length - 1].id !== c.id);
      if (!cand.length) break;
      let tot = 0;
      const ws = cand.map(c => { const x = w(c); tot += x; return x; });
      let r = rnd() * tot, pick = cand[cand.length - 1];
      for (let i = 0; i < cand.length; i++) { r -= ws[i]; if (r <= 0) { pick = cand[i]; break; } }
      out.push(pick);
      bag = bag.filter(c => c !== pick);
    }
    return { cards: out, review };
  }

  const api = { STAGES, MAX, TASKS, setRandom, shuffle, stageOf, taskFor, apply, norm, variants, dist, check,
    checkGap, chunks, clozeGaps, makeTask, buildOk, session, others };
  global.DDInsel = api;
})(typeof window !== 'undefined' ? window : globalThis);
