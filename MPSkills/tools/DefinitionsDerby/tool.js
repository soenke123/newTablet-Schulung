/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Definitions Derby"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Begriffe und Definitionen als Karten (Migration 0233, Beta).
   Lehrkräfte legen STAPEL an (Titel, Fach, Thema, Klassenstufe,
   Karten aus Begriff · Definition · Bild), teilen sie mit dem Raum,
   und die Klasse lernt sie. Etappe 1: Stapelliste, Karteikarten-
   Lerner, Übersicht/Glossar, Editor (Karte für Karte ODER Text).
   Plan und Entscheidungen: CLAUDE.md in diesem Ordner.

   ── Wer sieht was ────────────────────────────────────────────
   presenter (Lehrkraft, lehrer.html)  eigene Stapel aus dem Konto
        (dd_stacks_list/get/save/delete), anlegen/ändern/löschen,
        mit dem Raum teilen (skill_room_state.data.shared), und
        selbst lernen.
   participant (Tablet, j.html)         die geteilten Stapel dieses
        Raums (dd_shared_get), lernen und nachschlagen.

   ── Lernstand ────────────────────────────────────────────────
   Je Karte unsicher · teilweise · sicher (oder neu), gesetzt von
   der Person selbst NACH dem Umdrehen. Er liegt im localStorage
   des Geräts (dd.p.<stapel>), nicht auf dem Server — keine
   personenbezogenen Daten, nichts Neues für die Datenschutz-
   erklärung. Er bestimmt, wie oft eine Karte wiederkommt
   (weight()) und wie die Übersicht ordnet.

   ── Aufbau dieser Datei ──────────────────────────────────────
   Eine Zustandsmaschine: screen = home | stack | edit. render()
   baut die Ansicht neu; getippt wird NIE in einem Teil, der
   während des Tippens neu gebaut wird (Editor und Suche
   aktualisieren nur ihre Listen). update() des Systems kommt
   alle paar Sekunden und baut nur die Stapelliste neu, und auch
   die nur, wenn sich die geteilte Liste geändert hat.
   Klassen heißen dd-… (tool.css).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261026a';
  const BASE = 'tools/DefinitionsDerby/';
  const MAX_SHARED = 20;          // data.shared muss in 8 KB passen
  const LEVELS = ['neu', 'unsicher', 'teilweise', 'sicher'];
  const FAECHER = ['Mathematik', 'Deutsch', 'Englisch', 'Biologie', 'Physik', 'Chemie', 'Informatik',
                   'Geschichte', 'Geografie', 'Politik & Gesellschaft', 'Religion & Ethik', 'Musik',
                   'Kunst', 'Sport', 'Wirtschaft', 'Sachunterricht', 'Allgemeinwissen'];
  const STUFEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];

  const OWN_ERRORS = {
    not_shared:    'Dieser Stapel ist nicht (mehr) geteilt.',
    not_a_teacher: 'Stapel anlegen können nur Lehrkräfte.',
    quota_exceeded:'Du hast die Höchstzahl an Stapeln erreicht (100).',
    invalid_input: 'Eine Karte ist unvollständig oder zu lang (Begriff 120, Definition 1200 Zeichen).',
    payload_too_big: 'Der Stapel ist zu groß — am meisten Platz brauchen Bilder.'
  };

  /* ─── Zustand ─── */
  let root = null, ctx = null, view = null;
  let isTeacher = false, demo = false;
  let screen = 'home';
  let list = null;               // Stapelliste der Lehrkraft (null = lädt)
  let listErr = '';
  let cache = {};                // id → { u, stack }
  let opened = null;             // { stack, tab }
  let prog = {};                 // Lernstand des geöffneten Stapels
  let learn = null;              // Zustand des Lerners
  let ov = null;                 // Zustand der Übersicht
  let ed = null;                 // Zustand des Editors
  let homeFilter = { q: '', fach: '' };
  let lastSharedKey = '';
  let onKey = null, onClick = null, onInput = null, onChange = null;
  let parseReady = null;
  const mem = {};                // Ersatz für localStorage (Schaufenster, gesperrter Speicher)
  const E = s => (ctx ? ctx.esc(s) : String(s ?? ''));

  /* ─── Speicher im Gerät ─── */
  const store = {
    get(k) {
      if (!demo) { try { const v = localStorage.getItem(k); if (v != null) return v; } catch (e) { /* weiter */ } }
      return mem[k] != null ? mem[k] : null;
    },
    set(k, v) {
      mem[k] = v;
      if (demo) return;
      try { localStorage.setItem(k, v); } catch (e) { /* bleibt im Arbeitsspeicher */ }
    }
  };
  const jget = (k, d) => { try { const v = store.get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => store.set(k, JSON.stringify(v));

  function loadProg(id) {
    const p = jget('dd.p.' + id, {});
    return p && typeof p === 'object' ? p : {};
  }
  function counts(stack, p) {
    const c = [0, 0, 0, 0];
    for (const k of stack.cards) { const e = p[k.id]; c[e && e.l >= 1 && e.l <= 3 ? e.l : 0]++; }
    return c;
  }
  function saveProg() {
    if (!opened) return;
    const id = opened.stack.id;
    // Karten, die es nicht mehr gibt, fallen heraus — der Stand bleibt klein.
    const ids = new Set(opened.stack.cards.map(k => k.id));
    for (const k of Object.keys(prog)) if (!ids.has(k)) delete prog[k];
    jset('dd.p.' + id, prog);
    jset('dd.sum.' + id, { n: opened.stack.cards.length, c: counts(opened.stack, prog) });
  }

  /* ─── Helfer ─── */
  const okImg = s => typeof s === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
  const newId = () => 'k' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const toast = m => { if (ctx && ctx.toast) ctx.toast(m); };
  const errMsg = code => OWN_ERRORS[code] || (ctx ? ctx.errText(code) : String(code));
  const sortKey = s => String(s || '').toLocaleLowerCase('de');
  const meta = s => [s.subject, s.topic, s.grade ? 'Klasse ' + s.grade : ''].filter(Boolean);
  const metaChips = s => meta(s).map(m => '<span class="dd-chip">' + E(m) + '</span>').join('');
  const ico = {
    back:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    plus:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    edit:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/></svg>',
    img:   '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/></svg>',
    up:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    flip:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>'
  };

  /* ─── Quelle der Stapel: Lehrkraft (Konto) · Teilnehmer (geteilt) · Schaufenster ─── */
  const DEMO_STACKS = () => ([
    { id: 'demo-zelle', title: 'Die Zelle', subject: 'Biologie', topic: 'Aufbau der Zelle', grade: '7',
      updated_at: '2026-10-20', cards: [
        { id: 'a1', t: 'Zellkern', d: 'Steuerzentrale der Zelle; enthält die Erbinformation (DNA).' },
        { id: 'a2', t: 'Mitochondrium', d: 'Kraftwerk der Zelle: setzt aus Traubenzucker und Sauerstoff Energie frei.' },
        { id: 'a3', t: 'Ribosom', d: 'Bildet aus Aminosäuren Eiweiße (Proteinbiosynthese).' },
        { id: 'a4', t: 'Zellmembran', d: 'Dünne Haut um die Zelle; regelt, was hinein- und hinausdarf.' },
        { id: 'a5', t: 'Zellwand', d: 'Feste Hülle um pflanzliche Zellen; gibt Halt und Form.' },
        { id: 'a6', t: 'Chloroplast', d: 'Zellorganell der Pflanzen, in dem die Photosynthese stattfindet.' },
        { id: 'a7', t: 'Vakuole', d: 'Gefüllter Raum der Pflanzenzelle; speichert Wasser und Stoffe.' },
        { id: 'a8', t: 'Zytoplasma', d: 'Flüssige Grundsubstanz im Inneren der Zelle.' }
      ] },
    { id: 'demo-brueche', title: 'Brüche', subject: 'Mathematik', topic: 'Bruchrechnung', grade: '6',
      updated_at: '2026-10-18', cards: [
        { id: 'b1', t: 'Zähler', d: 'Die Zahl über dem Bruchstrich; sie sagt, wie viele Teile genommen werden.' },
        { id: 'b2', t: 'Nenner', d: 'Die Zahl unter dem Bruchstrich; sie sagt, in wie viele gleiche Teile das Ganze geteilt ist.' },
        { id: 'b3', t: 'Kürzen', d: 'Zähler und Nenner durch dieselbe Zahl teilen; der Wert bleibt gleich.' },
        { id: 'b4', t: 'Erweitern', d: 'Zähler und Nenner mit derselben Zahl malnehmen; der Wert bleibt gleich.' },
        { id: 'b5', t: 'Gleichnamig', d: 'Brüche mit demselben Nenner.' },
        { id: 'b6', t: 'Kehrbruch', d: 'Der Bruch, bei dem Zähler und Nenner vertauscht sind.' }
      ] }
  ]);
  let demoStacks = null;

  const src = {
    async list() {
      if (demo) { demoStacks = demoStacks || DEMO_STACKS(); return { ok: true, items: demoStacks.map(summary) }; }
      if (isTeacher) return ctx.actions.call('dd_stacks_list', {});
      return { ok: true, items: sharedList() };
    },
    async get(id) {
      if (demo) {
        const s = (demoStacks || (demoStacks = DEMO_STACKS())).find(x => x.id === id);
        return s ? Object.assign({ ok: true }, JSON.parse(JSON.stringify(s))) : { ok: false, error: 'not_found' };
      }
      return ctx.actions.call(isTeacher ? 'dd_stack_get' : 'dd_shared_get', { p_id: id });
    },
    async save(s) {
      if (demo) {
        demoStacks = demoStacks || DEMO_STACKS();
        const id = s.id || 'demo-' + Math.random().toString(36).slice(2, 8);
        const rec = { id, title: s.title, subject: s.subject, topic: s.topic, grade: s.grade,
                      cards: s.cards, updated_at: new Date().toISOString() };
        const i = demoStacks.findIndex(x => x.id === id);
        if (i >= 0) demoStacks[i] = rec; else demoStacks.unshift(rec);
        return { ok: true, id, created: i < 0 };
      }
      return ctx.actions.call('dd_stack_save', {
        p_id: s.id || null, p_title: s.title, p_subject: s.subject, p_topic: s.topic,
        p_grade: s.grade, p_cards: s.cards });
    },
    async del(id) {
      if (demo) { demoStacks = (demoStacks || []).filter(x => x.id !== id); return { ok: true }; }
      return ctx.actions.call('dd_stack_delete', { p_id: id });
    }
  };
  const summary = s => ({ id: s.id, title: s.title, subject: s.subject, topic: s.topic, grade: s.grade,
                          n: s.cards.length, updated_at: s.updated_at });

  /* Geteilte Stapel aus dem Raumzustand (Teilnehmer lesen, Lehrkraft schreibt). */
  const roomData = () => (view && view.state && view.state.data && typeof view.state.data === 'object') ? view.state.data : {};
  function sharedRaw() { const s = roomData().shared; return Array.isArray(s) ? s : []; }
  function sharedList() {
    return sharedRaw().filter(e => e && typeof e.id === 'string').map(e => ({
      id: e.id, title: e.t || 'Stapel', subject: e.s || '', topic: e.p || '', grade: e.g || '',
      n: Number(e.n) || 0, u: e.u || '' }));
  }
  const isShared = id => sharedRaw().some(e => e && e.id === id);

  async function writeShared(shared) {
    const next = Object.assign({}, roomData(), { shared });
    if (demo) { view = Object.assign({}, view || {}, { state: Object.assign({}, (view && view.state) || {}, { data: next }) }); return { ok: true }; }
    // Gleich lokal einsetzen, damit der nächste Takt nicht das Alte zurückschickt.
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    const res = await ctx.actions.setData(next);
    ctx.refresh();
    return res;
  }
  const entryOf = s => ({ id: s.id, t: String(s.title || '').slice(0, 80), n: s.n != null ? s.n : (s.cards ? s.cards.length : 0),
                          s: String(s.subject || '').slice(0, 40), p: String(s.topic || '').slice(0, 50),
                          g: String(s.grade || '').slice(0, 10), u: Date.now().toString(36) });

  async function toggleShare(id) {
    const it = (list || []).find(x => x.id === id);
    if (!it) return;
    const cur = sharedRaw();
    if (cur.some(e => e.id === id)) {
      const res = await writeShared(cur.filter(e => e.id !== id));
      if (!res.ok) toast(errMsg(res.error));
    } else {
      if (cur.length >= MAX_SHARED) { toast('Mehr als ' + MAX_SHARED + ' Stapel gleichzeitig passen nicht in einen Raum. Nimm erst einen zurück.'); return; }
      const res = await writeShared(cur.concat([entryOf(it)]));
      if (!res.ok) toast(errMsg(res.error));
    }
    if (screen === 'home') renderHome();
  }

  /* ─── Wechsel zwischen Ansichten ─── */
  function go(s) {
    screen = s;
    if (s === 'home') renderHome();
    else if (s === 'stack') renderStack();
    else if (s === 'edit') renderEdit();
  }

  async function loadList() {
    list = null; listErr = '';
    if (screen === 'home') renderHome();
    const res = await src.list();
    if (!root) return;
    if (res.ok) list = res.items || []; else { list = []; listErr = errMsg(res.error); }
    if (screen === 'home') renderHome();
  }

  async function openStack(id, tab) {
    const known = (list || []).find(x => x.id === id);
    const hit = cache[id];
    let stack = hit && (!known || !known.u || hit.u === known.u) ? hit.stack : null;
    if (!stack) {
      busy(true);
      const res = await src.get(id);
      busy(false);
      if (!root) return;
      if (!res.ok) { toast(errMsg(res.error)); return; }
      stack = { id: res.id, title: res.title, subject: res.subject, topic: res.topic, grade: res.grade,
                cards: (res.cards || []).filter(c => c && c.id && c.t) , updated_at: res.updated_at };
      cache[id] = { u: known ? known.u : '', stack };
    }
    opened = { stack, tab: tab || 'learn' };
    prog = loadProg(id);
    learn = newLearn();
    ov = { q: '', f: 'alle', sort: 'stand', mode: 'liste', hide: false, open: {} };
    saveProg();
    go('stack');
  }
  function busy(on) { if (root) root.classList.toggle('dd-busy', !!on); }

  /* ══════════════════════════════════════════════════════════════
     STAPELLISTE
     ══════════════════════════════════════════════════════════════ */
  function sumOf(id, n) {
    const s = jget('dd.sum.' + id, null);
    if (!s || !Array.isArray(s.c)) return null;
    const tot = s.c.reduce((a, b) => a + b, 0);
    if (!tot) return null;
    // Wurde der Stapel inzwischen größer, zählen die neuen Karten als „neu“.
    const c = s.c.slice();
    if (n > tot) c[0] += n - tot;
    return c;
  }
  function barHTML(c) {
    const tot = c.reduce((a, b) => a + b, 0) || 1;
    return '<span class="dd-bar" role="img" aria-label="' + E(LEVELS.map((l, i) => c[i] + ' ' + l).join(', ')) + '">' +
      c.map((n, i) => n ? '<i class="dd-s' + i + '" style="width:' + (n / tot * 100) + '%"></i>' : '').join('') + '</span>';
  }

  function renderHome() {
    if (!root) return;
    const items = list;
    let html = '<div class="dd-top"><div><h2 class="dd-h">' + (isTeacher ? 'Meine Stapel' : 'Stapel in diesem Raum') + '</h2>' +
      '<p class="dd-sub">' + (isTeacher
        ? 'Stapel gehören dir und stehen in jedem deiner Räume. Mit „Teilen“ siehst du sie hier, und die Klasse bekommt sie.'
        : 'Such dir einen Stapel aus und lerne die Begriffe mit Karteikarten.') + '</p></div>' +
      (isTeacher ? '<button type="button" class="btn btn--primary dd-new" data-act="new">' + ico.plus + 'Neuer Stapel</button>' : '') + '</div>';

    if (items === null) {
      html += '<p class="dd-empty">Lade …</p>';
    } else if (listErr) {
      html += '<p class="dd-empty dd-empty--err">' + E(listErr) + ' <button type="button" class="btn btn--sm" data-act="reload">Noch einmal</button></p>';
    } else if (!items.length) {
      html += isTeacher
        ? '<div class="dd-empty"><strong>Noch kein Stapel.</strong> Lege den ersten an — Karte für Karte oder einfach als Text einfügen.' +
          '<br><button type="button" class="btn btn--primary" data-act="new">' + ico.plus + 'Ersten Stapel anlegen</button></div>'
        : '<p class="dd-empty"><strong>Noch nichts geteilt.</strong> Sobald deine Lehrkraft einen Stapel freigibt, erscheint er hier.</p>';
    } else {
      const faecher = [...new Set(items.map(i => i.subject).filter(Boolean))].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
      if (items.length > 5) {
        html += '<div class="dd-filter"><input type="search" class="dd-input" data-f="q" placeholder="Stapel suchen …" value="' + E(homeFilter.q) + '" aria-label="Stapel suchen">' +
          (faecher.length > 1 ? '<select class="dd-input" data-f="fach" aria-label="Fach"><option value="">Alle Fächer</option>' +
            faecher.map(f => '<option' + (homeFilter.fach === f ? ' selected' : '') + '>' + E(f) + '</option>').join('') + '</select>' : '') + '</div>';
      }
      const q = sortKey(homeFilter.q);
      const shown = items.filter(i => (!homeFilter.fach || i.subject === homeFilter.fach) &&
        (!q || sortKey([i.title, i.subject, i.topic, i.grade].join(' ')).includes(q)));
      html += '<div class="dd-grid">' + shown.map(stackCard).join('') + '</div>';
      if (!shown.length) html += '<p class="dd-empty">Nichts gefunden.</p>';
    }
    root.querySelector('.dd-main').innerHTML = html;
  }

  function stackCard(s) {
    const c = sumOf(s.id, s.n);
    const shared = isTeacher && isShared(s.id);
    return '<article class="dd-stack" data-id="' + E(s.id) + '">' +
      '<div class="dd-stack__head"><h3>' + E(s.title) + '</h3>' +
      (isTeacher && shared ? '<span class="dd-badge" title="Die Klasse sieht diesen Stapel">geteilt</span>' : '') + '</div>' +
      '<div class="dd-chips">' + metaChips(s) + '<span class="dd-chip dd-chip--n">' + s.n + ' Karten</span></div>' +
      (c ? barHTML(c) : '<span class="dd-bar dd-bar--leer"></span>') +
      '<div class="dd-stack__act">' +
        '<button type="button" class="btn btn--primary btn--sm" data-act="learn">Lernen</button>' +
        '<button type="button" class="btn btn--sm" data-act="overview">Übersicht</button>' +
        (isTeacher
          ? '<button type="button" class="btn btn--sm dd-ic" data-act="edit" title="Bearbeiten" aria-label="Bearbeiten">' + ico.edit + '</button>' +
            '<button type="button" class="btn btn--sm dd-ic' + (shared ? ' is-on' : '') + '" data-act="share" aria-pressed="' + shared + '" title="' +
            (shared ? 'Für die Klasse zurücknehmen' : 'Mit der Klasse teilen') + '" aria-label="Teilen">' + ico.share + '</button>'
          : '') +
      '</div></article>';
  }

  /* ══════════════════════════════════════════════════════════════
     STAPEL: KARTEIKARTEN + ÜBERSICHT
     ══════════════════════════════════════════════════════════════ */
  function renderStack() {
    const s = opened.stack;
    root.querySelector('.dd-main').innerHTML =
      '<div class="dd-stackhead">' +
        '<button type="button" class="btn btn--sm dd-backbtn" data-act="home">' + ico.back + 'Stapel</button>' +
        '<div class="dd-stackhead__t"><h2 class="dd-h">' + E(s.title) + '</h2>' +
        '<div class="dd-chips">' + metaChips(s) + '<span class="dd-chip dd-chip--n">' + s.cards.length + ' Karten</span></div></div>' +
        (isTeacher ? '<button type="button" class="btn btn--sm" data-act="edit-open">' + ico.edit + 'Bearbeiten</button>' : '') +
      '</div>' +
      '<div class="dd-tabs" role="tablist">' +
        tabBtn('learn', 'Karteikarten') + tabBtn('overview', 'Übersicht') +
      '</div>' +
      '<div class="dd-pane" id="ddPane"></div>';
    renderPane();
  }
  const tabBtn = (k, l) => '<button type="button" role="tab" class="dd-tab' + (opened.tab === k ? ' is-on' : '') +
    '" aria-selected="' + (opened.tab === k) + '" data-act="tab" data-tab="' + k + '">' + l + '</button>';
  function renderPane() {
    if (!opened) return;
    root.querySelectorAll('.dd-tab').forEach(b => { const on = b.dataset.tab === opened.tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    if (opened.tab === 'learn') renderLearn(); else renderOverview();
  }

  /* ─── Karteikarten-Lerner ─── */
  function newLearn() {
    return { focus: 'alle', dir: store.get('dd.dir') || 'td', cur: null, flipped: false, recent: [], done: 0, row: 0 };
  }
  const lvl = id => { const e = prog[id]; return e && e.l >= 1 && e.l <= 3 ? e.l : 0; };

  function weight(id) {
    const e = prog[id];
    if (!e) return 5;                           // neu
    if (e.l === 1) return 8;                    // unsicher kommt am häufigsten
    if (e.l === 2) return 3;
    return e.s >= 2 ? 0.4 : 1;                  // zweimal hintereinander sicher: fast Ruhe
  }
  function pool() {
    const cards = opened.stack.cards;
    if (learn.focus === 'unsicher') return cards.filter(c => lvl(c.id) === 1);
    if (learn.focus === 'offen')    return cards.filter(c => lvl(c.id) !== 3);
    return cards;
  }
  function pick() {
    let cand = pool();
    if (!cand.length) return null;
    const avoid = new Set(learn.recent.slice(-Math.min(2, cand.length - 1)));
    const fresh = cand.filter(c => !avoid.has(c.id));
    if (fresh.length) cand = fresh;
    let tot = 0;
    const w = cand.map(c => { const x = weight(c.id); tot += x; return x; });
    let r = Math.random() * tot;
    for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }
  function nextCard() {
    const c = pick();
    learn.cur = c;
    learn.flipped = false;
    if (c) {
      learn.recent.push(c.id);
      if (learn.recent.length > 6) learn.recent.shift();
      learn.side = learn.dir === 'mix' ? (Math.random() < 0.5 ? 'td' : 'dt') : learn.dir;   // td = Begriff zuerst
    }
  }

  function renderLearn() {
    const pane = root.querySelector('#ddPane');
    const s = opened.stack;
    if (!s.cards.length) { pane.innerHTML = '<p class="dd-empty">Dieser Stapel hat noch keine Karten.</p>'; return; }
    if (!learn.cur || !s.cards.some(c => c.id === learn.cur.id)) nextCard();
    const c = counts(s, prog);
    const allSure = c[3] === s.cards.length;
    const focusBtn = (k, l, n) => '<button type="button" class="dd-seg' + (learn.focus === k ? ' is-on' : '') + '" data-act="focus" data-v="' + k + '">' + l +
      (n != null ? ' <span>' + n + '</span>' : '') + '</button>';
    const dirBtn = (k, l) => '<button type="button" class="dd-seg' + (learn.dir === k ? ' is-on' : '') + '" data-act="dir" data-v="' + k + '">' + l + '</button>';

    pane.innerHTML =
      '<div class="dd-prog">' + barHTML(c) +
        '<ul class="dd-legend">' + LEVELS.map((l, i) => '<li><i class="dd-s' + i + '"></i>' + l + ' <b>' + c[i] + '</b></li>').join('') + '</ul></div>' +
      '<div class="dd-opts">' +
        '<div class="dd-segs" role="group" aria-label="Welche Karten">' +
          focusBtn('alle', 'Alle') + focusBtn('offen', 'Noch nicht sicher', c[0] + c[1] + c[2]) + focusBtn('unsicher', 'Nur unsichere', c[1]) + '</div>' +
        '<div class="dd-segs" role="group" aria-label="Richtung">' +
          dirBtn('td', 'Begriff → Definition') + dirBtn('dt', 'Definition → Begriff') + dirBtn('mix', 'Gemischt') + '</div>' +
      '</div>' +
      (allSure ? '<div class="dd-win" role="status"><strong>Alle Karten sitzen.</strong> Stark — du kannst trotzdem weiterüben oder dir die Übersicht ansehen.</div>' : '') +
      '<div id="ddCard"></div>';
    paintCard();
  }

  function faceHTML(c, which, label) {
    // Das Bild gehört zum BEGRIFF und steht darum auf der Seite, die den Begriff zeigt.
    const t = which === 'term';
    return '<span class="dd-face dd-face--' + (t ? 'term' : 'def') + '"><span class="dd-face__l">' + label + '</span>' +
      (t && okImg(c.i) ? '<img class="dd-face__img" src="' + c.i + '" alt="">' : '') +
      '<span class="dd-face__t' + ((t ? c.t : c.d).length > 90 ? ' is-long' : '') + '">' + E(t ? c.t : c.d) + '</span></span>';
  }

  function paintCard() {
    const box = root.querySelector('#ddCard');
    if (!box) return;
    const c = learn.cur;
    if (!c) {
      box.innerHTML = '<div class="dd-empty"><strong>' + (learn.focus === 'unsicher' ? 'Keine unsicheren Karten.' : 'Alles sicher.') + '</strong> ' +
        'Wähle oben „Alle“, um weiterzuüben.<br><button type="button" class="btn btn--primary" data-act="focus" data-v="alle">Alle Karten</button></div>';
      return;
    }
    const termFirst = learn.side !== 'dt';
    const front = termFirst ? faceHTML(c, 'term', 'Begriff') : faceHTML(c, 'def', 'Definition');
    const back  = termFirst ? faceHTML(c, 'def', 'Definition') : faceHTML(c, 'term', 'Begriff');
    const lv = lvl(c.id);
    box.innerHTML =
      '<button type="button" class="dd-flip' + (learn.flipped ? ' is-flipped' : '') + '" data-act="flip" aria-label="' +
        (learn.flipped ? 'Karte zurückdrehen' : 'Karte umdrehen') + '">' +
        '<span class="dd-flip__in"><span class="dd-flip__f">' + front + '</span><span class="dd-flip__b">' + back + '</span></span>' +
        '<span class="dd-flip__hint">' + ico.flip + (learn.flipped ? 'Tippen: zurück' : 'Tippen zum Umdrehen') + '</span>' +
        '<span class="dd-lvl dd-s' + lv + '">' + LEVELS[lv] + '</span>' +
      '</button>' +
      '<div class="dd-rate' + (learn.flipped ? ' is-open' : '') + '" role="group" aria-label="Wie gut kanntest du das?">' +
        '<p class="dd-rate__q">Wie gut kanntest du das?</p>' +
        '<div class="dd-rate__b">' +
          '<button type="button" class="dd-r dd-r--1" data-act="rate" data-v="1"' + (learn.flipped ? '' : ' disabled') + '><b>Unsicher</b><span>kommt bald wieder</span></button>' +
          '<button type="button" class="dd-r dd-r--2" data-act="rate" data-v="2"' + (learn.flipped ? '' : ' disabled') + '><b>Teilweise</b><span>noch etwas üben</span></button>' +
          '<button type="button" class="dd-r dd-r--3" data-act="rate" data-v="3"' + (learn.flipped ? '' : ' disabled') + '><b>Sicher</b><span>seltener</span></button>' +
        '</div></div>' +
      '<p class="dd-count">' + learn.done + ' Karten geübt' + (learn.row >= 3 ? ' · ' + learn.row + ' in Folge sicher' : '') + '</p>';
  }

  function flip() {
    if (!learn || !learn.cur) return;
    learn.flipped = !learn.flipped;
    const f = root.querySelector('.dd-flip');
    if (!f) return;
    f.classList.toggle('is-flipped', learn.flipped);
    f.setAttribute('aria-label', learn.flipped ? 'Karte zurückdrehen' : 'Karte umdrehen');
    const h = f.querySelector('.dd-flip__hint');
    if (h) h.lastChild.textContent = learn.flipped ? 'Tippen: zurück' : 'Tippen zum Umdrehen';
    const r = root.querySelector('.dd-rate');
    if (r) r.classList.toggle('is-open', learn.flipped);
    root.querySelectorAll('.dd-r').forEach(b => { b.disabled = !learn.flipped; });
  }

  function rate(v) {
    if (!learn || !learn.cur || !learn.flipped) return;
    const id = learn.cur.id, p = prog[id];
    prog[id] = { l: v, s: v === 3 ? (p && p.l === 3 ? (p.s || 1) + 1 : 1) : 0, t: Date.now() };
    saveProg();
    learn.done++;
    learn.row = v === 3 ? learn.row + 1 : 0;
    nextCard();
    renderLearn();
    const nb = root.querySelector('#ddCard');
    if (nb) nb.classList.add('dd-in');
  }

  /* ─── Übersicht / Glossar ─── */
  function ovCards() {
    const q = sortKey(ov.q);
    let cs = opened.stack.cards.filter(c => (ov.f === 'alle' || lvl(c.id) === LEVELS.indexOf(ov.f)) &&
      (!q || sortKey(c.t + ' ' + c.d).includes(q)));
    if (ov.sort === 'az') cs = cs.slice().sort((a, b) => sortKey(a.t).localeCompare(sortKey(b.t), 'de'));
    return cs;
  }
  const ORDNUNG = [1, 2, 0, 3];       // Unsicher, Teilweise, Neu, Sicher

  function renderOverview() {
    const pane = root.querySelector('#ddPane');
    const c = counts(opened.stack, prog);
    const fBtn = (k, l, n) => '<button type="button" class="dd-seg dd-seg--' + k + (ov.f === k ? ' is-on' : '') + '" data-act="ovf" data-v="' + k + '">' + l +
      (n != null ? ' <span>' + n + '</span>' : '') + '</button>';
    pane.innerHTML =
      '<div class="dd-ovbar">' +
        '<input type="search" class="dd-input" data-ov="q" placeholder="Im Stapel suchen …" value="' + E(ov.q) + '" aria-label="Im Stapel suchen">' +
        '<select class="dd-input" data-ov="sort" aria-label="Sortierung">' +
          '<option value="stand"' + (ov.sort === 'stand' ? ' selected' : '') + '>Nach Lernstand</option>' +
          '<option value="az"' + (ov.sort === 'az' ? ' selected' : '') + '>A–Z</option>' +
          '<option value="stapel"' + (ov.sort === 'stapel' ? ' selected' : '') + '>Reihenfolge im Stapel</option></select>' +
        '<div class="dd-segs"><button type="button" class="dd-seg' + (ov.mode === 'liste' ? ' is-on' : '') + '" data-act="ovm" data-v="liste">Liste</button>' +
          '<button type="button" class="dd-seg' + (ov.mode === 'kacheln' ? ' is-on' : '') + '" data-act="ovm" data-v="kacheln">Kacheln</button></div>' +
      '</div>' +
      '<div class="dd-ovbar dd-ovbar--f">' +
        '<div class="dd-segs" role="group" aria-label="Filter">' + fBtn('alle', 'Alle', opened.stack.cards.length) +
          ORDNUNG.map(i => fBtn(LEVELS[i], LEVELS[i][0].toUpperCase() + LEVELS[i].slice(1), c[i])).join('') + '</div>' +
        '<label class="dd-check"><input type="checkbox" data-ov="hide"' + (ov.hide ? ' checked' : '') + '> Definitionen verdecken (zum Testen)</label>' +
      '</div>' +
      '<div id="ddOvList"></div>';
    paintOv();
  }

  function rowHTML(c) {
    const l = lvl(c.id);
    const hidden = ov.hide && !ov.open[c.id];
    const img = okImg(c.i) ? '<img class="dd-ov__img" src="' + c.i + '" alt="">' : '';
    return '<li class="dd-ov dd-ov--' + ov.mode + (hidden ? ' is-hidden' : '') + '" data-cid="' + E(c.id) + '">' +
      '<button type="button" class="dd-dot dd-s' + l + '" data-act="cycle" title="Lernstand: ' + LEVELS[l] + ' — antippen zum Ändern" aria-label="Lernstand ' + LEVELS[l] + ', antippen zum Ändern"><span>' + LEVELS[l] + '</span></button>' +
      img +
      '<div class="dd-ov__txt" data-act="reveal"><strong>' + E(c.t) + '</strong><p>' + E(c.d) + '</p></div></li>';
  }

  function paintOv() {
    const box = root.querySelector('#ddOvList');
    if (!box) return;
    const cs = ovCards();
    if (!cs.length) { box.innerHTML = '<p class="dd-empty">Keine Karte passt zu Suche und Filter.</p>'; return; }
    let html = '';
    if (ov.sort === 'stand') {
      for (const l of ORDNUNG) {
        const g = cs.filter(c => lvl(c.id) === l);
        if (!g.length) continue;
        html += '<h3 class="dd-grp dd-grp--' + l + '"><i class="dd-s' + l + '"></i>' + LEVELS[l][0].toUpperCase() + LEVELS[l].slice(1) + ' <span>' + g.length + '</span></h3>' +
          '<ul class="dd-ovlist dd-ovlist--' + ov.mode + '">' + g.map(rowHTML).join('') + '</ul>';
      }
    } else {
      html = '<ul class="dd-ovlist dd-ovlist--' + ov.mode + '">' + cs.map(rowHTML).join('') + '</ul>';
    }
    box.innerHTML = html;
  }

  function cycle(id) {
    const next = { 0: 1, 1: 2, 2: 3, 3: 0 }[lvl(id)];
    if (next === 0) delete prog[id]; else prog[id] = { l: next, s: next === 3 ? 1 : 0, t: Date.now() };
    saveProg();
    if (learn && learn.cur && learn.cur.id === id) { /* die Karte im Lerner zeigt den neuen Stand beim nächsten Zeichnen */ }
    renderOverview();
  }

  /* ══════════════════════════════════════════════════════════════
     EDITOR (nur Lehrkraft)
     ══════════════════════════════════════════════════════════════ */
  function ladeParse() {
    if (window.DDParse) return Promise.resolve();
    if (parseReady) return parseReady;
    parseReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = BASE + 'parse.js?v=' + V;
      s.onload = () => resolve();
      s.onerror = () => { parseReady = null; reject(new Error('parse.js')); };
      document.head.appendChild(s);
    });
    return parseReady;
  }

  async function openEditor(stack) {
    try { await ladeParse(); } catch (e) { toast('Der Text-Editor konnte nicht geladen werden. Karte für Karte geht trotzdem.'); }
    const s = stack || { id: null, title: '', subject: '', topic: '', grade: '', cards: [] };
    ed = {
      id: s.id || null, title: s.title || '', subject: s.subject || '', topic: s.topic || '', grade: s.grade || '',
      cards: (s.cards || []).map(c => ({ id: c.id, t: c.t, d: c.d, i: c.i || '' })),
      mode: 'cards', text: '', dirty: false, from: screen, saving: false
    };
    if (!ed.cards.length) ed.cards.push(blank());
    go('edit');
  }
  const blank = () => ({ id: newId(), t: '', d: '', i: '' });

  function renderEdit() {
    root.querySelector('.dd-main').innerHTML =
      '<div class="dd-stackhead">' +
        '<button type="button" class="btn btn--sm dd-backbtn" data-act="ed-cancel">' + ico.back + 'Zurück</button>' +
        '<div class="dd-stackhead__t"><h2 class="dd-h">' + (ed.id ? 'Stapel bearbeiten' : 'Neuer Stapel') + '</h2></div>' +
        '<div class="dd-edact">' +
          (ed.id ? '<button type="button" class="btn btn--sm btn--danger" data-act="ed-del">' + ico.trash + 'Löschen</button>' : '') +
          '<button type="button" class="btn btn--primary" data-act="ed-save">Speichern</button></div>' +
      '</div>' +
      '<div class="dd-meta">' +
        '<label class="dd-fld dd-fld--title"><span>Titel</span><input class="dd-input" data-e="title" maxlength="80" placeholder="z. B. Die Zelle" value="' + E(ed.title) + '"></label>' +
        '<label class="dd-fld"><span>Fach</span><input class="dd-input" data-e="subject" maxlength="60" list="ddFaecher" placeholder="Fach" value="' + E(ed.subject) + '"></label>' +
        '<label class="dd-fld dd-fld--wide"><span>Thema</span><input class="dd-input" data-e="topic" maxlength="80" placeholder="z. B. Zellorganellen" value="' + E(ed.topic) + '"></label>' +
        '<label class="dd-fld dd-fld--s"><span>Klassenstufe</span><input class="dd-input" data-e="grade" maxlength="20" list="ddStufen" placeholder="z. B. 7" value="' + E(ed.grade) + '"></label>' +
        '<datalist id="ddFaecher">' + FAECHER.map(f => '<option value="' + E(f) + '">').join('') + '</datalist>' +
        '<datalist id="ddStufen">' + STUFEN.map(f => '<option value="' + f + '">').join('') + '</datalist>' +
      '</div>' +
      '<div class="dd-tabs dd-tabs--ed" role="tablist">' +
        '<button type="button" role="tab" class="dd-tab' + (ed.mode === 'cards' ? ' is-on' : '') + '" data-act="ed-mode" data-v="cards">Karte für Karte</button>' +
        '<button type="button" role="tab" class="dd-tab' + (ed.mode === 'text' ? ' is-on' : '') + '" data-act="ed-mode" data-v="text">Text einfügen</button>' +
      '</div>' +
      '<div id="ddEd"></div>';
    paintEd();
  }

  function paintEd() {
    const box = root.querySelector('#ddEd');
    if (!box) return;
    if (ed.mode === 'cards') {
      box.innerHTML = '<div class="dd-cards" id="ddCards">' + ed.cards.map(edCard).join('') + '</div>' +
        '<div class="dd-addrow"><button type="button" class="btn dd-addbtn" data-act="ed-add">' + ico.plus + 'Karte hinzufügen</button>' +
        '<span class="dd-tip">Tipp: In der Definition <kbd>Strg</kbd>+<kbd>Enter</kbd> legt gleich die nächste Karte an.</span></div>';
      root.querySelectorAll('.dd-cardin textarea').forEach(autoGrow);
    } else {
      box.innerHTML =
        '<div class="dd-textmode">' +
          '<div class="dd-textmode__in"><textarea class="dd-ta" id="ddText" spellcheck="false" placeholder="' + E(
            'Titel: Die Zelle\nFach: Biologie\nThema: Zellorganellen\nKlasse: 7\n\n' +
            'Zellkern: Steuerzentrale der Zelle\nMitochondrium – Kraftwerk der Zelle\nRibosom = baut Eiweiße\n\n' +
            '… oder Begriff und Definition auf zwei Zeilen, oder mit Tab aus Excel eingefügt. Das Programm erkennt es selbst.') + '">' + E(ed.text) + '</textarea>' +
          '<p class="dd-tip">Eine Karte pro Zeile mit <b>:</b> <b>–</b> <b>=</b> <b>→</b> oder Tab dazwischen. Oder Blöcke durch Leerzeilen getrennt (erste Zeile = Begriff). Kopfzeilen <i>Titel/Fach/Thema/Klasse</i> füllen oben die Felder.</p></div>' +
          '<div class="dd-textmode__pv"><h3 class="dd-pvh">So habe ich es verstanden <span id="ddPvN"></span></h3><div id="ddPv"></div></div>' +
        '</div>';
      paintPreview();
    }
  }

  function edCard(c, i) {
    return '<div class="dd-cardin" data-i="' + i + '">' +
      '<span class="dd-cardin__n">' + (i + 1) + '</span>' +
      '<div class="dd-cardin__f">' +
        '<input class="dd-input" data-ec="t" maxlength="120" placeholder="Begriff" value="' + E(c.t) + '" aria-label="Begriff ' + (i + 1) + '">' +
        '<textarea class="dd-input" data-ec="d" rows="2" maxlength="1200" placeholder="Definition" aria-label="Definition ' + (i + 1) + '">' + E(c.d) + '</textarea>' +
      '</div>' +
      '<div class="dd-cardin__img">' + imgSlot(c, i) + '</div>' +
      '<div class="dd-cardin__act">' +
        '<button type="button" class="btn btn--sm dd-ic" data-act="ed-up" title="Nach oben" aria-label="Nach oben"' + (i === 0 ? ' disabled' : '') + '>' + ico.up + '</button>' +
        '<button type="button" class="btn btn--sm dd-ic" data-act="ed-down" title="Nach unten" aria-label="Nach unten"' + (i === ed.cards.length - 1 ? ' disabled' : '') + '>' + ico.down + '</button>' +
        '<button type="button" class="btn btn--sm dd-ic btn--danger" data-act="ed-rm" title="Karte entfernen" aria-label="Karte entfernen">' + ico.trash + '</button>' +
      '</div></div>';
  }
  function imgSlot(c, i) {
    return okImg(c.i)
      ? '<span class="dd-imgbox"><img src="' + c.i + '" alt=""><button type="button" class="dd-imgx" data-act="ed-imgx" aria-label="Bild entfernen" title="Bild entfernen">×</button></span>'
      : '<label class="dd-imgadd" title="Bild zur Karte hinzufügen">' + ico.img + '<span>Bild</span><input type="file" accept="image/*" data-ec="img" hidden></label>';
  }
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(220, t.scrollHeight + 2) + 'px'; }

  function parsedNow() { return window.DDParse ? window.DDParse.parse(ed.text) : { cards: [], stats: { cards: 0, warnings: 0 }, mode: 'leer' }; }
  const MODE_TXT = { zeile: 'eine Karte pro Zeile', tab: 'Spalten (Tab)', block: 'Blöcke mit Leerzeile', abwechselnd: 'abwechselnd Begriff / Definition', leer: '' };
  function paintPreview() {
    const r = parsedNow();
    const pv = root.querySelector('#ddPv'), n = root.querySelector('#ddPvN');
    if (!pv) return;
    if (n) n.textContent = r.cards.length ? '· ' + r.cards.length + (r.cards.length === 1 ? ' Karte' : ' Karten') + (r.stats.warnings ? ' · ' + r.stats.warnings + ' prüfen' : '') : '';
    if (!r.cards.length) { pv.innerHTML = '<p class="dd-empty dd-empty--s">Hier erscheinen die erkannten Karten, sobald du Text einfügst.</p>'; return; }
    const W = { 'ohne-definition': 'Definition fehlt', doppelt: 'Begriff doppelt', lang: 'zu lang' };
    pv.innerHTML = (MODE_TXT[r.mode] ? '<p class="dd-pvmode">Erkannt: ' + MODE_TXT[r.mode] + '</p>' : '') +
      '<ol class="dd-pvlist">' + r.cards.map(c =>
        '<li class="' + (c.w ? 'has-w' : '') + '"><b>' + E(c.t) + '</b><span>' + E(c.d || '—') + '</span>' + (c.w ? '<em>' + W[c.w] + '</em>' : '') + '</li>').join('') + '</ol>';
  }

  /* Text → Karten (Mode-Wechsel und Speichern). Bilder und Ids bleiben
     erhalten, wenn der Begriff derselbe ist. */
  function applyText() {
    if (ed.mode !== 'text' || !window.DDParse) return;
    const r = parsedNow();
    const byTerm = new Map(ed.cards.map(c => [sortKey(c.t), c]));
    if (r.title && !ed.title) ed.title = r.title;
    if (r.subject && !ed.subject) ed.subject = r.subject;
    if (r.topic && !ed.topic) ed.topic = r.topic;
    if (r.grade && !ed.grade) ed.grade = r.grade;
    ed.cards = r.cards.map(c => {
      const old = byTerm.get(sortKey(c.t));
      return { id: old ? old.id : newId(), t: c.t, d: c.d, i: old ? old.i : '' };
    });
    if (!ed.cards.length) ed.cards.push(blank());
  }
  function setMode(m) {
    if (m === ed.mode) return;
    if (m === 'text') {
      ed.text = window.DDParse
        ? window.DDParse.toText({ title: '', subject: '', topic: '', grade: '', cards: ed.cards.filter(c => c.t || c.d) })
        : '';
      ed.mode = 'text';
    } else {
      applyText();
      ed.mode = 'cards';
    }
    renderEdit();
  }

  /* Bild verkleinern: längste Seite 520 px, JPEG, unter 120 KB. */
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('kein Bild')); return; }
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        let max = 520, q = 0.8, out = '';
        for (let tries = 0; tries < 6; tries++) {
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(im.width * k));
          cv.height = Math.max(1, Math.round(im.height * k));
          const g = cv.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
          g.drawImage(im, 0, 0, cv.width, cv.height);
          out = cv.toDataURL('image/jpeg', q);
          if (out.length <= 120000) break;
          q = Math.max(0.5, q - 0.12); max = Math.round(max * 0.8);
        }
        if (out.length > 140000) reject(new Error('zu groß')); else resolve(out);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
      im.src = url;
    });
  }

  async function saveEdit() {
    if (ed.saving) return;
    if (ed.mode === 'text') applyText();
    const cards = ed.cards.filter(c => c.t.trim() || c.d.trim() || c.i);
    const title = ed.title.trim();
    if (!title) { toast('Gib dem Stapel einen Titel.'); focusField('[data-e="title"]'); return; }
    if (!cards.length) { toast('Ein Stapel braucht mindestens eine Karte.'); return; }
    const bad = cards.findIndex(c => !c.t.trim() || !c.d.trim());
    if (bad >= 0) {
      toast('Karte ' + (bad + 1) + ': ' + (!cards[bad].t.trim() ? 'der Begriff fehlt.' : 'die Definition fehlt.'));
      if (ed.mode === 'text') { ed.mode = 'cards'; renderEdit(); }
      const row = root.querySelector('.dd-cardin[data-i="' + ed.cards.indexOf(cards[bad]) + '"]');
      if (row) { row.scrollIntoView({ block: 'center' }); const f = row.querySelector(!cards[bad].t.trim() ? 'input' : 'textarea'); if (f) f.focus(); }
      return;
    }
    ed.saving = true;
    busy(true);
    const res = await src.save({
      id: ed.id, title, subject: ed.subject.trim(), topic: ed.topic.trim(), grade: ed.grade.trim(),
      cards: cards.map(c => Object.assign({ id: c.id, t: c.t.trim(), d: c.d.trim() }, c.i ? { i: c.i } : {})) });
    busy(false);
    if (ed) ed.saving = false;
    if (!root) return;
    if (!res.ok) { toast(errMsg(res.error)); return; }
    const id = res.id || ed.id;
    delete cache[id];
    // Geteilt? Dann bekommt die Klasse mit dem neuen Titel/Kartenzahl auch einen neuen Stempel (u) und holt den Stapel neu.
    if (isTeacher && isShared(id)) {
      const cur = sharedRaw();
      await writeShared(cur.map(e => e.id === id
        ? entryOf({ id, title, n: cards.length, subject: ed.subject.trim(), topic: ed.topic.trim(), grade: ed.grade.trim() }) : e));
    }
    toast('Gespeichert.');
    ed = null;
    await loadList();
    const back = (opened && opened.stack.id === id) ? 'stack' : 'home';
    if (back === 'stack') await openStack(id, opened.tab); else go('home');
  }
  function focusField(sel) { const f = root.querySelector(sel); if (f) f.focus(); }

  async function cancelEdit() {
    if (!ed) return;
    const dirty = ed.dirty || (ed.mode === 'text' && ed.text !== '');
    if (dirty && !(await ctx.confirm('Änderungen verwerfen?'))) return;
    const from = ed.from;
    ed = null;
    go(from === 'stack' && opened ? 'stack' : 'home');
  }

  async function deleteStack() {
    if (!ed || !ed.id) return;
    if (!(await ctx.confirm('Diesen Stapel endgültig löschen? Auch für die Klasse ist er dann weg.'))) return;
    busy(true);
    const res = await src.del(ed.id);
    busy(false);
    if (!res.ok) { toast(errMsg(res.error)); return; }
    const id = ed.id;
    delete cache[id];
    if (isShared(id)) await writeShared(sharedRaw().filter(e => e.id !== id));
    try { localStorage.removeItem('dd.p.' + id); localStorage.removeItem('dd.sum.' + id); } catch (e) { /* egal */ }
    ed = null; opened = null;
    toast('Stapel gelöscht.');
    go('home');
    loadList();
  }

  /* ══════════════════════════════════════════════════════════════
     Ereignisse
     ══════════════════════════════════════════════════════════════ */
  function bind() {
    onClick = async (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || !root.contains(b)) return;
      const act = b.dataset.act;
      const stackEl = b.closest('.dd-stack');
      const sid = stackEl && stackEl.dataset.id;
      const cardIdx = () => { const r = b.closest('.dd-cardin'); return r ? Number(r.dataset.i) : -1; };
      switch (act) {
        case 'new': openEditor(null); break;
        case 'reload': loadList(); break;
        case 'home': opened = null; go('home'); break;
        case 'learn': openStack(sid, 'learn'); break;
        case 'overview': openStack(sid, 'overview'); break;
        case 'edit': {
          busy(true);
          const res = await src.get(sid);
          busy(false);
          if (!res.ok) { toast(errMsg(res.error)); break; }
          openEditor({ id: res.id, title: res.title, subject: res.subject, topic: res.topic, grade: res.grade, cards: res.cards });
          break;
        }
        case 'edit-open': if (opened) openEditor(opened.stack); break;
        case 'share': toggleShare(sid); break;
        case 'tab': opened.tab = b.dataset.tab; renderPane(); break;
        case 'focus': learn.focus = b.dataset.v; learn.cur = null; learn.recent = []; renderLearn(); break;
        case 'dir': learn.dir = b.dataset.v; store.set('dd.dir', learn.dir); learn.cur = null; renderLearn(); break;
        case 'flip': flip(); break;
        case 'rate': rate(Number(b.dataset.v)); break;
        case 'ovf': ov.f = b.dataset.v; renderOverview(); break;
        case 'ovm': ov.mode = b.dataset.v; renderOverview(); break;
        case 'cycle': cycle(b.closest('.dd-ov').dataset.cid); break;
        case 'reveal': {
          if (!ov.hide) break;
          const id = b.closest('.dd-ov').dataset.cid;
          ov.open[id] = !ov.open[id];
          b.closest('.dd-ov').classList.toggle('is-hidden', !ov.open[id]);
          break;
        }
        case 'ed-save': saveEdit(); break;
        case 'ed-cancel': cancelEdit(); break;
        case 'ed-del': deleteStack(); break;
        case 'ed-mode': setMode(b.dataset.v); break;
        case 'ed-add': {
          ed.cards.push(blank()); ed.dirty = true; paintEd();
          const rows = root.querySelectorAll('.dd-cardin');
          const last = rows[rows.length - 1];
          if (last) { last.scrollIntoView({ block: 'center' }); last.querySelector('input').focus(); }
          break;
        }
        case 'ed-rm': {
          const i = cardIdx(); if (i < 0) break;
          const c = ed.cards[i];
          if ((c.t || c.d) && ed.cards.length > 1 && !(await ctx.confirm('Diese Karte entfernen?'))) break;
          ed.cards.splice(i, 1); if (!ed.cards.length) ed.cards.push(blank());
          ed.dirty = true; paintEd(); break;
        }
        case 'ed-up': case 'ed-down': {
          const i = cardIdx(), j = act === 'ed-up' ? i - 1 : i + 1;
          if (i < 0 || j < 0 || j >= ed.cards.length) break;
          [ed.cards[i], ed.cards[j]] = [ed.cards[j], ed.cards[i]];
          ed.dirty = true; paintEd();
          const rows = root.querySelectorAll('.dd-cardin'); if (rows[j]) rows[j].scrollIntoView({ block: 'nearest' });
          break;
        }
        case 'ed-imgx': { const i = cardIdx(); if (i >= 0) { ed.cards[i].i = ''; ed.dirty = true; paintEd(); } break; }
        default: break;
      }
    };

    onInput = (ev) => {
      const t = ev.target;
      if (t.dataset.f !== undefined) { homeFilter[t.dataset.f] = t.value; renderHomeKeepFocus(t); return; }
      if (t.dataset.ov !== undefined && ov) {
        if (t.dataset.ov === 'q') { ov.q = t.value; paintOv(); }
        return;
      }
      if (!ed) return;
      if (t.dataset.e) { ed[t.dataset.e] = t.value; ed.dirty = true; return; }
      if (t.id === 'ddText') { ed.text = t.value; ed.dirty = true; paintPreview(); return; }
      if (t.dataset.ec === 't' || t.dataset.ec === 'd') {
        const i = Number(t.closest('.dd-cardin').dataset.i);
        ed.cards[i][t.dataset.ec] = t.value; ed.dirty = true;
        if (t.tagName === 'TEXTAREA') autoGrow(t);
      }
    };

    onChange = async (ev) => {
      const t = ev.target;
      if (t.dataset.ov !== undefined && ov) {
        if (t.dataset.ov === 'sort') { ov.sort = t.value; paintOv(); }
        else if (t.dataset.ov === 'hide') { ov.hide = t.checked; ov.open = {}; paintOv(); }
        return;
      }
      if (t.dataset.f === 'fach') { homeFilter.fach = t.value; renderHome(); return; }
      if (t.dataset.ec === 'img' && ed && t.files && t.files[0]) {
        const i = Number(t.closest('.dd-cardin').dataset.i);
        try {
          const url = await shrinkImage(t.files[0]);
          if (ed && ed.cards[i]) { ed.cards[i].i = url; ed.dirty = true; paintEd(); }
        } catch (e) { toast('Das Bild ging nicht: ' + (e.message || 'unbekannter Fehler') + '.'); }
      }
    };

    onKey = (ev) => {
      if (!root || ev.defaultPrevented || ev.altKey || ev.metaKey) return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (ev.key === 'Enter' && ev.ctrlKey && ed && ed.mode === 'cards' && ev.target.dataset && ev.target.dataset.ec === 'd') {
        ev.preventDefault();
        const idx = Number(ev.target.closest('.dd-cardin').dataset.i);
        ed.cards.splice(idx + 1, 0, blank());
        ed.dirty = true;
        paintEd();
        const next = root.querySelectorAll('.dd-cardin')[idx + 1];
        if (next) { next.scrollIntoView({ block: 'center' }); next.querySelector('input').focus(); }
        return;
      }
      if (ev.key === 'Enter' && ed && ed.mode === 'cards' && ev.target.dataset && ev.target.dataset.ec === 't') {
        ev.preventDefault();
        const d = ev.target.closest('.dd-cardin').querySelector('textarea');
        if (d) d.focus();
        return;
      }
      if (screen !== 'stack' || !opened || opened.tab !== 'learn' || !learn) return;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        if (tag === 'button') return;     // ein fokussierter Knopf behält sein eigenes Verhalten
        ev.preventDefault(); flip();
      } else if (learn.flipped && ['1', '2', '3'].includes(ev.key)) {
        ev.preventDefault(); rate(Number(ev.key));
      }
    };

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
  }

  /* Die Stapelliste neu zeichnen, ohne dem Suchfeld den Cursor zu nehmen. */
  function renderHomeKeepFocus(input) {
    const f = input.dataset.f, pos = input.selectionStart;
    renderHome();
    const n = root.querySelector('[data-f="' + f + '"]');
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* select */ } }
  }

  /* ══════════════════════════════════════════════════════════════
     Anmeldung beim System
     ══════════════════════════════════════════════════════════════ */
  window.MPTool.register('derby', {

    /* Nichts beim Anlegen abzufragen: was die Klasse bekommt,
       entscheidet die Lehrkraft IM Raum (Teilen). */
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      view = null;
      demo = !!(ctx && ctx.preview);
      isTeacher = demo ? true : ctx.role === 'presenter';
      screen = 'home'; list = null; listErr = ''; cache = {}; opened = null; ed = null; learn = null; ov = null;
      homeFilter = { q: '', fach: '' };
      lastSharedKey = '';
      root.innerHTML = '<div class="dd"><div class="dd-main"></div></div>';
      bind();
      // Die Klasse bekommt ihre Liste aus dem Raumzustand (update); erst die Lehrkraft fragt den Server.
      if (isTeacher) loadList(); else renderHome();
    },

    update(v) {
      view = v;
      if (!root) return;
      const key = JSON.stringify(roomData().shared || []);
      if (key === lastSharedKey) return;
      lastSharedKey = key;
      // Die Liste der Klasse ist die geteilte Liste — neu holen und zeichnen,
      // aber nur auf der Startseite (mitten im Lernen oder Tippen bleibt alles stehen).
      if (!isTeacher) {
        list = sharedList();
        if (screen === 'home') renderHome();
      } else if (screen === 'home' && list) {
        renderHome();
      }
    },

    unmount() {
      if (root) {
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
      }
      if (onKey) document.removeEventListener('keydown', onKey);
      onKey = onClick = onInput = onChange = null;
      root = null; ctx = null; view = null; opened = null; ed = null; learn = null; ov = null; list = null; cache = {};
    }
  });
})();
