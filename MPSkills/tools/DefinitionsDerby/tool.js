/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Definitions Derby"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Begriffe und Definitionen als Karten (Migration 0233, Beta).
   Lehrkräfte legen STAPEL an (Titel, Fach, Thema, Klassenstufe,
   Karten aus Begriff · Definition · Bild), teilen sie mit dem Raum,
   und die Klasse übt sie mit SPIELEN. Plan und Entscheidungen:
   CLAUDE.md in diesem Ordner.

   ── Startseite: Stapel links, Spiele rechts ──────────────────
   Links die Stapel (Lehrkraft: eigene, mit Bearbeiten/Teilen;
   Tablet: die geteilten). Antippen wählt sie aus, auch mehrere.
   Rechts kleine Kacheln mit den Spielen, gegliedert in Allein ·
   Gemeinsam an einem Gerät · Zusammen im Netz (GAMES/GROUPS).
   Lehrkraft: Kachel antippen = Beschreibung mit Bildschirmfoto
   (img/), dort und auf der Kachel teilen, dort auch selbst starten.
   Tablet: sieht nur die geteilten Spiele; Kachel antippen startet
   mit den gewählten Stapeln, „i“ zeigt die Beschreibung. Im Spiel
   steht oben, welche Stapel gerade im Spiel sind.

   ── Wer sieht was ────────────────────────────────────────────
   presenter (Lehrkraft, lehrer.html)  eigene Stapel aus dem Konto
        (dd_stacks_list/get/save/delete), anlegen/ändern/löschen,
        Stapel und Spiele mit dem Raum teilen, und selbst spielen.
   participant (Tablet, j.html)         die geteilten Stapel und
        Spiele dieses Raums (dd_shared_get).
   Geteilt wird über skill_room_state.data:
        shared: [{id,t,n,s,p,g,u}]   Stapel (siehe CLAUDE.md)
        games:  ['cards', …]          Spiele; fehlt der Schlüssel
                (Räume von vor den Spielen), gelten Karteikarten
                und Übersicht als geteilt (DEFAULT_GAMES).

   ── Lernstand ────────────────────────────────────────────────
   Je Karte unsicher · teilweise · sicher (oder neu), gesetzt von
   der Person selbst NACH dem Umdrehen. Er bestimmt, wie oft eine
   Karte wiederkommt (weight()) und wie die Übersicht ordnet.
   Gespeichert wird er je STAPEL; im Spiel mit mehreren Stapeln
   heißen die Karten „<stapel>:<karte>“ und prog hält alle
   zusammen (buildProg/stackProg teilen wieder auf).

   Die Arbeitskopie liegt immer im localStorage des Geräts
   (dd.p.<stapel>) — schnell und auch ohne Netz. MIT KONTO wird sie
   zusätzlich in dd_progress gespiegelt (Migration 0234): beim
   Öffnen eines Stapels holen + je Karte zusammenführen (die neuere
   Zeit t gewinnt), nach jeder Bewertung gedrosselt zurückschreiben.
   Ohne Konto (Gast im Raum) antwortet der Server 'no_account', und
   alles bleibt beim Gerät. „Zurück auf neu“ ist ein Grabstein
   (l = 0), kein Löschen — sonst weckt ein älterer Stand auf einem
   anderen Gerät die Karte wieder auf. Memory schreibt KEINEN
   Lernstand: zwei spielen an einem Gerät, das Konto gehört einer.

   ── Ohne Raum (derby.html) ───────────────────────────────────
   ctx.standalone: dieselbe Lehrkraft-Ansicht, aber ohne Teilen —
   Stapel vorbereiten, selbst spielen. Die Seite baut ctx.actions
   selbst (Aufrufe ohne Raum-Code).

   ── Aufbau dieser Datei ──────────────────────────────────────
   Eine Zustandsmaschine: screen = home | play | edit, dazu die
   Beschreibung eines Spiels als Fenster darüber (info, .dd-layer).
   render…() baut die Ansicht neu; getippt wird NIE in einem Teil,
   der während des Tippens neu gebaut wird (Editor und Suche
   aktualisieren nur ihre Listen). update() des Systems kommt
   alle paar Sekunden und baut nur die Startseite neu, und auch
   die nur, wenn sich Geteiltes geändert hat.
   Klassen heißen dd-… (tool.css).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261027c';
  const BASE = 'tools/DefinitionsDerby/';
  const MAX_SHARED = 20;          // data.shared muss in 8 KB passen
  const LEVELS = ['neu', 'unsicher', 'teilweise', 'sicher'];
  const FAECHER = ['Mathematik', 'Deutsch', 'Englisch', 'Biologie', 'Physik', 'Chemie', 'Informatik',
                   'Geschichte', 'Geografie', 'Politik & Gesellschaft', 'Religion & Ethik', 'Musik',
                   'Kunst', 'Sport', 'Wirtschaft', 'Sachunterricht', 'Allgemeinwissen'];
  const STUFEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];

  /* ─── Spiele ───
     Neues Spiel: Eintrag hier, Mini-Bild in MINI, Bildschirmfoto in
     img/, render-Zweig in renderPane(). Es bekommt opened.cards
     (alle Karten der gewählten Stapel) und schreibt Lernstand, wenn
     überhaupt, nur über prog/saveProg. */
  const GROUPS = [
    { id: 'solo',   name: 'Allein' },
    { id: 'device', name: 'Gemeinsam an einem Gerät' },
    { id: 'net',    name: 'Zusammen im Netz' }
  ];
  const GAMES = [
    { id: 'cards', g: 'solo', name: 'Karteikarten', min: 1, shot: 'spiel-karteikarten.jpg',
      short: 'Umdrehen, selbst stempeln – Unsicheres kommt öfter.',
      text: 'Eine Karte nach der anderen: erst überlegen, dann umdrehen und ehrlich stempeln. Unsichere Karten kommen öfter wieder, sichere seltener – so übt man genau das, was noch fehlt.',
      how: ['Karte antippen (oder Leertaste) dreht sie um.',
            'Danach stempeln: Unsicher, Teilweise oder Sicher (Tasten 1–3).',
            'Richtung wählbar: Begriff → Definition, umgekehrt oder gemischt.',
            'Der Lernstand bleibt gespeichert – mit Konto auf jedem Gerät.'] },
    { id: 'overview', g: 'solo', name: 'Übersicht', min: 1, shot: 'spiel-uebersicht.jpg',
      short: 'Alle Begriffe als Glossar – suchen, filtern, verdecken.',
      text: 'Alle Karten der gewählten Stapel auf einen Blick, geordnet nach Lernstand. Zum Nachschlagen, Wiederholen und für den schnellen Selbsttest.',
      how: ['Suchen in Begriff und Definition.',
            'Filtern und ordnen nach Lernstand, A–Z oder Stapel.',
            '„Definitionen verdecken“ zum Selbsttest – antippen deckt auf.',
            'Den Lernstand direkt an der Karte ändern.'] },
    { id: 'memory', g: 'device', name: 'Memory', min: 2, shot: 'spiel-memory.jpg',
      short: 'Zu zweit: Begriff und passende Definition finden.',
      text: 'Links liegen die Begriffe, rechts die Definitionen, alle verdeckt. Wer dran ist, deckt einen Begriff und eine Definition auf. Beide Karten kommen groß in die Mitte, und dann wird entschieden: Passen sie zusammen?',
      how: ['Je Zug eine Karte links und eine rechts aufdecken.',
            '„Ja, Paar!“ – stimmt es, gibt es einen Punkt, und man ist noch einmal dran.',
            'Stimmt es nicht (oder „Nein“), ist die andere Person dran.',
            'Zu zweit oder allein (dann zählen die Züge), 6 bis 24 Paare.'] }
  ];
  const DEFAULT_GAMES = ['cards', 'overview'];
  const gameOf = id => GAMES.find(g => g.id === id) || null;

  const OWN_ERRORS = {
    not_shared:    'Dieser Stapel ist nicht (mehr) geteilt.',
    not_a_teacher: 'Stapel anlegen können nur Lehrkräfte.',
    quota_exceeded:'Du hast die Höchstzahl an Stapeln erreicht (100).',
    invalid_input: 'Eine Karte ist unvollständig oder zu lang (Begriff 120, Definition 1200 Zeichen).',
    payload_too_big: 'Der Stapel ist zu groß — am meisten Platz brauchen Bilder.'
  };

  /* ─── Zustand ─── */
  let root = null, ctx = null, view = null;
  let isTeacher = false, demo = false, standalone = false;
  let acct = null;               // null = unbekannt · true = Lernstand im Konto · false = nur im Gerät
  let remoteSum = {};            // id → { sum, t } aus dd_prog_list
  let pushTimer = null;
  const dirty = new Set();       // Stapel, deren Lernstand noch zum Konto muss
  let screen = 'home';
  let list = null;               // Stapelliste (null = lädt)
  let listErr = '';
  let cache = {};                // id → { u, stack }
  let sel = [];                  // gewählte Stapel (ids)
  let info = null;               // id des Spiels, dessen Beschreibung offen ist
  let opened = null;             // { stacks, cards, game } — das laufende Spiel
  let prog = {};                 // Lernstand der Karten im Spiel („<stapel>:<karte>“ → {l,s,t})
  let learn = null;              // Zustand des Lerners
  let ov = null;                 // Zustand der Übersicht
  let mm = null;                 // Zustand des Memorys
  let ed = null;                 // Zustand des Editors
  let homeFilter = { q: '', fach: '' };
  let lastSharedKey = '';
  let onKey = null, onClick = null, onInput = null, onChange = null, onResize = null, onFs = null;
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
  /* Lernstand des Spiels aus den Ständen der einzelnen Stapel … */
  function buildProg() {
    prog = {};
    for (const s of opened.stacks) {
      const p = loadProg(s.id);
      for (const k of Object.keys(p)) prog[s.id + ':' + k] = p[k];
    }
  }
  /* … und zurück: der Stand eines Stapels, nur Karten, die es noch gibt. */
  function stackProg(s) {
    const p = {};
    for (const c of s.cards) { const e = prog[s.id + ':' + c.id]; if (e) p[c.id] = e; }
    return p;
  }
  function saveProg(onlyId) {
    if (!opened) return;
    for (const s of opened.stacks) {
      if (onlyId && s.id !== onlyId) continue;
      const p = stackProg(s);
      jset('dd.p.' + s.id, p);
      jset('dd.sum.' + s.id, { n: s.cards.length, c: counts(s, p), t: Date.now() });
      dirty.add(s.id);
    }
    schedulePush();
  }
  const sidOf = key => String(key).split(':')[0];

  /* ─── Lernstand im Konto ─── */
  const progFn = n => (isTeacher ? 'dd_prog_' : 'dd_mprog_') + n;
  const syncOn = () => !demo && acct !== false && !!ctx;
  function noAccount(code) {
    if (code === 'no_account' || code === 'not_authenticated') { acct = false; return true; }
    return false;
  }
  function mergeProg(a, b) {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b || {})) {
      const x = out[k], y = b[k];
      if (!y || typeof y !== 'object') continue;
      if (!x || (y.t || 0) > (x.t || 0)) out[k] = y;
    }
    return out;
  }
  async function pullProg(id) {
    if (!syncOn()) return;
    const res = await ctx.actions.call(progFn('get'), { p_stack: id });
    if (!root || !opened) return;
    const s = opened.stacks.find(x => x.id === id);
    if (!s) return;
    if (res.ok) {
      acct = true;
      const cur = stackProg(s);
      const merged = mergeProg(cur, res.data);
      if (JSON.stringify(merged) !== JSON.stringify(cur)) {
        for (const k of Object.keys(merged)) prog[id + ':' + k] = merged[k];
        saveProg(id);
      }
    } else noAccount(res.error);
    // Neu zeichnen nur, wo es nichts kaputt macht: nicht mitten im Memory, nicht bei umgedrehter Karte.
    if (screen === 'play' && opened.game !== 'memory' && !(learn && learn.flipped)) renderPane();
  }
  function schedulePush() {
    if (!syncOn() || !opened) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushProg, 1500);
  }
  async function pushProg() {
    clearTimeout(pushTimer); pushTimer = null;
    if (!syncOn() || !opened) { dirty.clear(); return; }
    // Alles vorher einsammeln: unmount räumt ctx und opened ab, während das hier noch läuft.
    const call = ctx.actions.call;
    const todo = opened.stacks.filter(s => dirty.has(s.id))
      .map(s => { const p = stackProg(s); return { p_stack: s.id, p_data: p, p_sum: { n: s.cards.length, c: counts(s, p) } }; });
    dirty.clear();
    for (const args of todo) {
      const res = await call(progFn('put'), args);
      if (!res.ok && !noAccount(res.error)) console.warn('[derby] Lernstand nicht gespeichert:', res.error);
      else if (res.ok) acct = true;
    }
  }
  async function pullSums() {
    if (!syncOn()) return;
    const res = await ctx.actions.call(progFn('list'), {});
    if (!root) return;
    if (!res.ok) { noAccount(res.error); if (screen === 'home') renderHome(); return; }
    acct = true;
    remoteSum = {};
    for (const it of res.items || []) remoteSum[it.id] = { sum: it.sum, t: Number(it.t) || 0 };
    if (screen === 'home') renderHome();
  }
  const acctNote = () => demo ? '' : acct === true
    ? '<p class="dd-acct dd-acct--on">Dein Lernstand wird in deinem Konto gespeichert und ist auf jedem Gerät da.</p>'
    : acct === false
      ? '<p class="dd-acct">Ohne Anmeldung bleibt dein Lernstand auf diesem Gerät.</p>' : '';

  /* ─── Helfer ─── */
  const okImg = s => typeof s === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
  const newId = () => 'k' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const toast = m => { if (ctx && ctx.toast) ctx.toast(m); };
  const errMsg = code => OWN_ERRORS[code] || (ctx ? ctx.errText(code) : String(code));
  const sortKey = s => String(s || '').toLocaleLowerCase('de');
  const meta = s => [s.subject, s.topic, s.grade ? 'Klasse ' + s.grade : ''].filter(Boolean);
  const metaChips = s => meta(s).map(m => '<span class="dd-chip">' + E(m) + '</span>').join('');
  const kart = n => n + (n === 1 ? ' Karte' : ' Karten');
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const ico = {
    back:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    plus:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    edit:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/></svg>',
    img:   '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/></svg>',
    up:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    flip:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    play:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    info:  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15"/></svg>',
    full:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    unfull:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>'
  };

  /* Kleine Darstellung des Spiels auf der Kachel (nur CSS, tool.css .dd-mini). */
  const MINI = {
    cards: '<span class="dd-mini dd-mini--cards" aria-hidden="true"><i class="dd-mini__card"><b></b><u></u></i>' +
           '<i class="dd-mini__st dd-mini__st--1"></i><i class="dd-mini__st dd-mini__st--2"></i><i class="dd-mini__st dd-mini__st--3"></i></span>',
    overview: '<span class="dd-mini dd-mini--ov" aria-hidden="true">' +
           [1, 2, 3, 0].map(l => '<i><em class="dd-s' + l + '"></em><b></b><u></u></i>').join('') + '</span>',
    memory: '<span class="dd-mini dd-mini--mem" aria-hidden="true">' +
           ['t', 'd'].map(s => '<span class="dd-mini__side dd-mini__side--' + s + '">' +
             [0, 1, 2, 3, 4, 5].map(i => '<i' + (i === (s === 't' ? 1 : 4) ? ' class="is-up"' : '') + '></i>').join('') + '</span>').join('') + '</span>'
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

  /* Geteiltes aus dem Raumzustand (Teilnehmer lesen, Lehrkraft schreibt). */
  const roomData = () => (view && view.state && view.state.data && typeof view.state.data === 'object') ? view.state.data : {};
  function sharedRaw() { const s = roomData().shared; return Array.isArray(s) ? s : []; }
  function sharedList() {
    return sharedRaw().filter(e => e && typeof e.id === 'string').map(e => ({
      id: e.id, title: e.t || 'Stapel', subject: e.s || '', topic: e.p || '', grade: e.g || '',
      n: Number(e.n) || 0, u: e.u || '' }));
  }
  const isShared = id => sharedRaw().some(e => e && e.id === id);
  function sharedGames() {
    const g = roomData().games;
    return Array.isArray(g) ? g.filter(x => gameOf(x)) : DEFAULT_GAMES.slice();
  }
  const gameShared = id => sharedGames().includes(id);
  /* Welche Spiele diese Ansicht zeigt: Lehrkraft alle, Tablet nur geteilte. */
  const visibleGames = () => isTeacher ? GAMES : GAMES.filter(g => gameShared(g.id));

  async function writeData(patch) {
    const next = Object.assign({}, roomData(), patch);
    if (demo) { view = Object.assign({}, view || {}, { state: Object.assign({}, (view && view.state) || {}, { data: next }) }); return { ok: true }; }
    // Gleich lokal einsetzen, damit der nächste Takt nicht das Alte zurückschickt.
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    const res = await ctx.actions.setData(next);
    ctx.refresh();
    return res;
  }
  const writeShared = shared => writeData({ shared });
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

  async function toggleGame(id) {
    if (!gameOf(id)) return;
    const cur = sharedGames();
    const on = !cur.includes(id);
    const res = await writeData({ games: on ? cur.concat([id]) : cur.filter(x => x !== id) });
    if (!res.ok) toast(errMsg(res.error));
    else toast(gameOf(id).name + (on ? ' ist für die Klasse freigegeben.' : ' ist für die Klasse zurückgenommen.'));
    if (screen === 'home') renderHome();
    if (info === id) renderInfo();
  }

  /* ─── Wechsel zwischen Ansichten ─── */
  function go(s) {
    if (s !== 'play') leavePlay();
    screen = s;
    if (s === 'home') renderHome();
    else if (s === 'play') renderPlay();
    else if (s === 'edit') renderEdit();
  }
  /* Spiel verlassen: Lernstand noch weg, Vollbild zu, Memory-Takte ins Leere laufen lassen. */
  function leavePlay() {
    if (!opened) return;
    if (pushTimer) pushProg();
    if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* egal */ } }
    opened = null; mm = null; learn = null; ov = null;
  }

  async function loadList() {
    list = null; listErr = '';
    if (screen === 'home') renderHome();
    const res = await src.list();
    if (!root) return;
    if (res.ok) list = res.items || []; else { list = []; listErr = errMsg(res.error); }
    if (screen === 'home') renderHome();
  }

  /* Einen Stapel holen (aus dem Speicher, solange sein Stempel u stimmt). */
  async function getStack(id) {
    const known = (list || []).find(x => x.id === id);
    const hit = cache[id];
    if (hit && (!known || !known.u || hit.u === known.u)) return hit.stack;
    const res = await src.get(id);
    if (!res.ok) { toast(errMsg(res.error)); return null; }
    const stack = { id: res.id || id, title: res.title, subject: res.subject, topic: res.topic, grade: res.grade,
                    cards: (res.cards || []).filter(c => c && c.id && c.t), updated_at: res.updated_at };
    cache[id] = { u: known ? known.u : '', stack };
    return stack;
  }
  function busy(on) { if (root) root.classList.toggle('dd-busy', !!on); }

  /* Spiel mit den gewählten Stapeln starten. */
  async function startGame(gid) {
    const G = gameOf(gid);
    if (!G) return;
    const ids = sel.filter(id => (list || []).some(x => x.id === id));
    if (!ids.length) { toast('Wähle zuerst mindestens einen Stapel aus.'); return; }
    busy(true);
    const got = await Promise.all(ids.map(getStack));
    busy(false);
    if (!root || got.some(s => !s)) return;
    const cards = [];
    for (const s of got) for (const c of s.cards) cards.push({ id: s.id + ':' + c.id, sid: s.id, t: c.t, d: c.d, i: c.i });
    if (cards.length < G.min) {
      toast(G.name + ' braucht mindestens ' + G.min + ' Karten. Wähle mehr Stapel aus.');
      return;
    }
    info = null; renderInfo();
    if (opened) leavePlay();
    opened = { stacks: got, cards, game: gid };
    buildProg();
    learn = newLearn();
    ov = { q: '', f: 'alle', sort: 'stand', mode: 'liste', hide: false, open: {} };
    mm = null;
    saveProg();
    go('play');
    got.forEach(s => pullProg(s.id));
  }

  /* ══════════════════════════════════════════════════════════════
     STARTSEITE: Stapel links, Spiele rechts
     ══════════════════════════════════════════════════════════════ */
  function sumOf(id, n) {
    let s = jget('dd.sum.' + id, null);
    const r = remoteSum[id];
    if (r && r.sum && Array.isArray(r.sum.c) && (!s || !Array.isArray(s.c) || r.t > (s.t || 0))) s = r.sum;
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

  /* Auswahl aufräumen: nur, was es noch gibt; bei genau einem Stapel ist er gewählt. */
  function tidySel() {
    if (!list) return;
    sel = sel.filter(id => list.some(x => x.id === id));
    if (!sel.length && list.length === 1) sel = [list[0].id];
  }
  const selItems = () => sel.map(id => (list || []).find(x => x.id === id)).filter(Boolean);
  function selNote() {
    const it = selItems();
    if (!it.length) return '<p class="dd-selnote is-empty">Noch kein Stapel gewählt — tippe einen oder mehrere an.</p>';
    const n = it.reduce((a, s) => a + (s.n || 0), 0);
    return '<p class="dd-selnote">' + ico.check + '<span>Gewählt: <b>' + it.map(s => E(s.title)).join(', ') + '</b> · ' + kart(n) + '</span></p>';
  }

  function renderHome() {
    if (!root) return;
    tidySel();
    const items = list;
    let left = '<div class="dd-hub__head"><h2 class="dd-h">' + (isTeacher ? 'Meine Stapel' : 'Stapel') + '</h2>' +
      (isTeacher ? '<button type="button" class="btn btn--primary btn--sm dd-new" data-act="new">' + ico.plus + 'Neuer Stapel</button>' : '') + '</div>' +
      '<p class="dd-sub">' + (standalone
        ? 'Stapel vorbereiten, ohne dass ein Raum offen sein muss. Sie stehen in jedem deiner Räume, dort teilst du sie mit der Klasse.'
        : isTeacher
        ? 'Antippen wählt aus (auch mehrere). Teilen gibt einen Stapel der Klasse frei.'
        : 'Wähle einen oder mehrere Stapel aus und tippe dann auf ein Spiel.') + '</p>';

    if (items === null) {
      left += '<p class="dd-empty">Lade …</p>';
    } else if (listErr) {
      left += '<p class="dd-empty dd-empty--err">' + E(listErr) + ' <button type="button" class="btn btn--sm" data-act="reload">Noch einmal</button></p>';
    } else if (!items.length) {
      left += isTeacher
        ? '<div class="dd-empty"><strong>Noch kein Stapel.</strong> Lege den ersten an — Karte für Karte oder einfach als Text einfügen.' +
          '<br><button type="button" class="btn btn--primary" data-act="new">' + ico.plus + 'Ersten Stapel anlegen</button></div>'
        : '<p class="dd-empty"><strong>Noch nichts geteilt.</strong> Sobald deine Lehrkraft einen Stapel freigibt, erscheint er hier.</p>';
    } else {
      const faecher = [...new Set(items.map(i => i.subject).filter(Boolean))].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
      if (items.length > 5) {
        left += '<div class="dd-filter"><input type="search" class="dd-input" data-f="q" placeholder="Stapel suchen …" value="' + E(homeFilter.q) + '" aria-label="Stapel suchen">' +
          (faecher.length > 1 ? '<select class="dd-input" data-f="fach" aria-label="Fach"><option value="">Alle Fächer</option>' +
            faecher.map(f => '<option' + (homeFilter.fach === f ? ' selected' : '') + '>' + E(f) + '</option>').join('') + '</select>' : '') + '</div>';
      }
      const q = sortKey(homeFilter.q);
      const shown = items.filter(i => (!homeFilter.fach || i.subject === homeFilter.fach) &&
        (!q || sortKey([i.title, i.subject, i.topic, i.grade].join(' ')).includes(q)));
      left += '<div class="dd-grid">' + shown.map(stackCard).join('') + '</div>';
      if (!shown.length) left += '<p class="dd-empty">Nichts gefunden.</p>';
      left += acctNote();
    }

    root.querySelector('.dd-main').innerHTML =
      '<div class="dd-hub">' +
        '<section class="dd-hub__col dd-hub__stacks" aria-label="Stapel">' + left + '</section>' +
        '<section class="dd-hub__col dd-hub__games" aria-label="Spiele">' + gamesHTML() + '</section>' +
      '</div>';
  }

  function stackCard(s) {
    const c = sumOf(s.id, s.n);
    const shared = isTeacher && !standalone && isShared(s.id);
    const on = sel.includes(s.id);
    return '<article class="dd-stack' + (on ? ' is-sel' : '') + '" data-id="' + E(s.id) + '" data-act="sel" tabindex="0" role="checkbox" aria-checked="' + on + '" aria-label="' + E(s.title) + ', ' + kart(s.n) + '">' +
      '<div class="dd-stack__head"><h3>' + E(s.title) + '</h3>' +
        '<span class="dd-stack__n" aria-hidden="true"><b>' + s.n + '</b><small>Karten</small></span></div>' +
      '<div class="dd-chips">' + metaChips(s) +
        (shared ? '<span class="dd-badge" title="Die Klasse sieht diesen Stapel">geteilt</span>' : '') + '</div>' +
      (c ? barHTML(c) : '<span class="dd-bar dd-bar--leer"></span>') +
      '<div class="dd-stack__act">' +
        '<span class="dd-pick" aria-hidden="true">' + ico.check + (on ? 'Gewählt' : 'Auswählen') + '</span>' +
        (isTeacher
          ? '<button type="button" class="btn btn--sm dd-ic" data-act="edit" title="Bearbeiten" aria-label="' + E(s.title) + ' bearbeiten">' + ico.edit + '</button>' +
            (standalone ? '' : '<button type="button" class="btn btn--sm dd-ic' + (shared ? ' is-on' : '') + '" data-act="share" aria-pressed="' + shared + '" title="' +
            (shared ? 'Für die Klasse zurücknehmen' : 'Mit der Klasse teilen') + '" aria-label="' + E(s.title) + ' teilen">' + ico.share + '</button>')
          : '') +
      '</div></article>';
  }

  /* ─── Spiel-Kacheln ─── */
  function gamesHTML() {
    const shown = visibleGames();
    let html = '<div class="dd-hub__head"><h2 class="dd-h dd-h--b">Spiele</h2></div>' + selNote();
    if (!shown.length) {
      return html + '<p class="dd-empty"><strong>Noch kein Spiel freigegeben.</strong> Sobald deine Lehrkraft eines teilt, erscheint es hier.</p>';
    }
    for (const grp of GROUPS) {
      const gs = shown.filter(g => g.g === grp.id);
      if (!gs.length && !isTeacher) continue;
      html += '<h3 class="dd-ghead">' + grp.name + '</h3>';
      html += gs.length
        ? '<div class="dd-games">' + gs.map(gameTile).join('') + '</div>'
        : '<p class="dd-soon">Kommt bald: Spiele für die ganze Klasse, bei denen jedes Tablet mitspielt.</p>';
    }
    return html;
  }
  function gameTile(G) {
    const canShare = isTeacher && !standalone;
    const shared = canShare && gameShared(G.id);
    return '<div class="dd-game' + (shared ? ' is-shared' : '') + '" data-act="game" data-g="' + G.id + '" tabindex="0" role="button" aria-label="' +
        E(G.name + (isTeacher ? ' – Beschreibung' : ' starten')) + '">' +
      '<span class="dd-game__pic">' + MINI[G.id] + '</span>' +
      '<span class="dd-game__t"><b>' + G.name + '</b><small>' + G.short + '</small></span>' +
      '<span class="dd-game__act">' +
        (shared ? '<span class="dd-badge">geteilt</span>' : '') +
        (canShare ? '<button type="button" class="btn btn--sm dd-ic' + (shared ? ' is-on' : '') + '" data-act="gshare" aria-pressed="' + shared + '" title="' +
          (shared ? 'Für die Klasse zurücknehmen' : 'Mit der Klasse teilen') + '" aria-label="' + E(G.name) + ' teilen">' + ico.share + '</button>' : '') +
        (!isTeacher ? '<button type="button" class="btn btn--sm dd-ic" data-act="ginfo" title="Wie geht das?" aria-label="' + E(G.name) + ': Beschreibung">' + ico.info + '</button>' : '') +
      '</span></div>';
  }

  /* ─── Beschreibung eines Spiels (Fenster über der Startseite) ─── */
  function openInfo(gid) { if (!gameOf(gid)) return; info = gid; renderInfo(); }
  function closeInfo() { if (!info) return; const was = info; info = null; renderInfo();
    const t = root && root.querySelector('.dd-game[data-g="' + was + '"]'); if (t) t.focus(); }
  function renderInfo() {
    const layer = root && root.querySelector('.dd-layer');
    if (!layer) return;
    const G = info && gameOf(info);
    if (!G || screen !== 'home') { layer.innerHTML = ''; return; }
    const grp = GROUPS.find(g => g.id === G.g);
    const canShare = isTeacher && !standalone;
    const shared = canShare && gameShared(G.id);
    const it = selItems();
    const nCards = it.reduce((a, s) => a + (s.n || 0), 0);
    const hadFocus = layer.contains(document.activeElement);
    layer.innerHTML =
      '<div class="dd-modal" role="dialog" aria-modal="true" aria-labelledby="ddInfoH">' +
        '<div class="dd-modal__bg" data-act="info-x"></div>' +
        '<div class="dd-sheet">' +
          '<button type="button" class="dd-x" data-act="info-x" aria-label="Schließen">×</button>' +
          '<div class="dd-sheet__txt">' +
            '<span class="dd-chip">' + grp.name + '</span>' +
            '<h2 class="dd-sheet__h" id="ddInfoH">' + G.name + (shared ? ' <span class="dd-badge">geteilt</span>' : '') + '</h2>' +
            '<p>' + G.text + '</p>' +
            '<h3>So geht’s</h3><ul>' + G.how.map(h => '<li>' + h + '</li>').join('') + '</ul>' +
          '</div>' +
          '<figure class="dd-shot"><img src="' + BASE + 'img/' + G.shot + '?v=' + V + '" alt="Bildschirmfoto: ' + E(G.name) + '" loading="lazy" decoding="async">' +
            '<figcaption>So sieht es aus</figcaption></figure>' +
          '<div class="dd-sheet__act">' +
            '<button type="button" class="btn btn--primary" data-act="info-start"' + (it.length ? '' : ' disabled') + '>' + ico.play +
              (it.length ? 'Starten mit ' + (it.length === 1 ? E(it[0].title) : it.length + ' Stapeln') + ' (' + kart(nCards) + ')' : 'Starten') + '</button>' +
            (canShare ? '<button type="button" class="btn' + (shared ? ' is-on' : '') + '" data-act="info-share" aria-pressed="' + shared + '">' + ico.share +
              (shared ? 'Für die Klasse zurücknehmen' : 'Mit der Klasse teilen') + '</button>' : '') +
            (it.length ? '' : '<p class="dd-sheet__hint">Zum Starten erst einen oder mehrere Stapel auswählen.</p>') +
          '</div>' +
        '</div>' +
      '</div>';
    if (!hadFocus) { const x = layer.querySelector('.dd-x'); if (x) x.focus(); }
  }

  /* ══════════════════════════════════════════════════════════════
     IM SPIEL
     ══════════════════════════════════════════════════════════════ */
  function renderPlay() {
    const G = gameOf(opened.game);
    root.querySelector('.dd-main').innerHTML =
      '<div class="dd-stackhead dd-playhead">' +
        '<button type="button" class="btn btn--sm dd-backbtn" data-act="home">' + ico.back + 'Spiele</button>' +
        '<div class="dd-stackhead__t"><h2 class="dd-h">' + G.name + '</h2>' +
        '<div class="dd-chips dd-using"><span class="dd-using__l">Im Spiel:</span>' +
          opened.stacks.map(s => '<span class="dd-chip dd-chip--stack">' + E(s.title) + ' <i>' + s.cards.length + '</i></span>').join('') +
        '</div></div>' +
      '</div>' +
      '<div class="dd-pane" id="ddPane"></div>';
    renderPane();
  }
  function renderPane() {
    if (!opened || screen !== 'play') return;
    if (opened.game === 'cards') renderLearn();
    else if (opened.game === 'overview') renderOverview();
    else if (opened.game === 'memory') renderMemory();
  }
  const multi = () => opened && opened.stacks.length > 1;
  const stackTitle = sid => { const s = opened && opened.stacks.find(x => x.id === sid); return s ? s.title : ''; };
  function countsAll() {
    const c = [0, 0, 0, 0];
    for (const k of opened.cards) c[lvl(k.id)]++;
    return c;
  }

  /* ─── Karteikarten-Lerner ─── */
  function newLearn() {
    return { focus: 'alle', dir: store.get('dd.dir') || 'td', cur: null, flipped: false, recent: [], done: 0, row: 0 };
  }
  const lvl = id => { const e = prog[id]; return e && e.l >= 1 && e.l <= 3 ? e.l : 0; };

  function weight(id) {
    const e = prog[id];
    if (!e || !e.l) return 5;                   // neu (auch: zurückgesetzt)
    if (e.l === 1) return 8;                    // unsicher kommt am häufigsten
    if (e.l === 2) return 3;
    return e.s >= 2 ? 0.4 : 1;                  // zweimal hintereinander sicher: fast Ruhe
  }
  function pool() {
    const cards = opened.cards;
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
    const cards = opened.cards;
    if (!cards.length) { pane.innerHTML = '<p class="dd-empty">Diese Stapel haben noch keine Karten.</p>'; return; }
    if (!learn.cur || !cards.some(c => c.id === learn.cur.id)) nextCard();
    const c = countsAll();
    const allSure = c[3] === cards.length;
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
      '<span class="dd-face__t' + ((t ? c.t : c.d).length > 90 ? ' is-long' : '') + '"><span class="dd-hl">' + E(t ? c.t : c.d) + '</span></span>' +
      (multi() ? '<span class="dd-face__src">' + E(stackTitle(c.sid)) + '</span>' : '') + '</span>';
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
      '<p class="dd-count">' + learn.done + ' Karten geübt' + (learn.row >= 3 ? ' · ' + learn.row + ' in Folge sicher' : '') + '</p>' + acctNote();
  }

  function flip() {
    if (!learn || !learn.cur || learn.stamping) return;
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

  /* Bewerten: der Stempel landet erst auf der Karte, dann kommt die nächste.
     Während der kurzen Pause (learn.stamping) zählt kein weiteres Tippen. */
  const STAMPS = ['', 'Unsicher', 'Teilweise', 'Sicher'];
  function rate(v) {
    if (!learn || !learn.cur || !learn.flipped || learn.stamping) return;
    const cur = learn.cur, id = cur.id, p = prog[id];
    prog[id] = { l: v, s: v === 3 ? (p && p.l === 3 ? (p.s || 1) + 1 : 1) : 0, t: Date.now() };
    saveProg(sidOf(id));
    learn.done++;
    learn.row = v === 3 ? learn.row + 1 : 0;
    learn.stamping = true;
    const f = root.querySelector('.dd-flip');
    if (f) {
      f.classList.add('is-stamped');
      f.insertAdjacentHTML('beforeend', '<span class="dd-stamp dd-stamp--' + v + '" aria-hidden="true">' + STAMPS[v] + '</span>');
    }
    root.querySelectorAll('.dd-r').forEach(b => { b.disabled = true; });
    const l = learn;
    setTimeout(() => {
      l.stamping = false;
      if (!root || learn !== l || l.cur !== cur) return;     // inzwischen woanders hin
      nextCard();
      if (screen !== 'play' || !opened || opened.game !== 'cards') return;
      renderLearn();
      const nb = root.querySelector('#ddCard');
      if (nb) nb.classList.add('dd-in');
    }, still() ? 150 : 560);
  }
  const still = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ─── Übersicht / Glossar ─── */
  function ovCards() {
    const q = sortKey(ov.q);
    let cs = opened.cards.filter(c => (ov.f === 'alle' || lvl(c.id) === LEVELS.indexOf(ov.f)) &&
      (!q || sortKey(c.t + ' ' + c.d).includes(q)));
    if (ov.sort === 'az') cs = cs.slice().sort((a, b) => sortKey(a.t).localeCompare(sortKey(b.t), 'de'));
    return cs;
  }
  const ORDNUNG = [1, 2, 0, 3];       // Unsicher, Teilweise, Neu, Sicher

  function renderOverview() {
    const pane = root.querySelector('#ddPane');
    const c = countsAll();
    const fBtn = (k, l, n) => '<button type="button" class="dd-seg dd-seg--' + k + (ov.f === k ? ' is-on' : '') + '" data-act="ovf" data-v="' + k + '">' + l +
      (n != null ? ' <span>' + n + '</span>' : '') + '</button>';
    pane.innerHTML =
      '<div class="dd-ovbar">' +
        '<input type="search" class="dd-input" data-ov="q" placeholder="Suchen …" value="' + E(ov.q) + '" aria-label="In den Karten suchen">' +
        '<select class="dd-input" data-ov="sort" aria-label="Sortierung">' +
          '<option value="stand"' + (ov.sort === 'stand' ? ' selected' : '') + '>Nach Lernstand</option>' +
          '<option value="az"' + (ov.sort === 'az' ? ' selected' : '') + '>A–Z</option>' +
          '<option value="stapel"' + (ov.sort === 'stapel' ? ' selected' : '') + '>Reihenfolge im Stapel</option></select>' +
        '<div class="dd-segs"><button type="button" class="dd-seg' + (ov.mode === 'liste' ? ' is-on' : '') + '" data-act="ovm" data-v="liste">Liste</button>' +
          '<button type="button" class="dd-seg' + (ov.mode === 'kacheln' ? ' is-on' : '') + '" data-act="ovm" data-v="kacheln">Kacheln</button></div>' +
      '</div>' +
      '<div class="dd-ovbar dd-ovbar--f">' +
        '<div class="dd-segs" role="group" aria-label="Filter">' + fBtn('alle', 'Alle', opened.cards.length) +
          ORDNUNG.map(i => fBtn(LEVELS[i], LEVELS[i][0].toUpperCase() + LEVELS[i].slice(1), c[i])).join('') + '</div>' +
        '<label class="dd-check"><input type="checkbox" data-ov="hide"' + (ov.hide ? ' checked' : '') + '> Definitionen verdecken (zum Testen)</label>' +
      '</div>' +
      '<div id="ddOvList"></div>' + acctNote();
    paintOv();
  }

  function rowHTML(c) {
    const l = lvl(c.id);
    const hidden = ov.hide && !ov.open[c.id];
    const img = okImg(c.i) ? '<img class="dd-ov__img" src="' + c.i + '" alt="">' : '';
    return '<li class="dd-ov dd-ov--' + ov.mode + (hidden ? ' is-hidden' : '') + '" data-cid="' + E(c.id) + '">' +
      '<button type="button" class="dd-dot dd-s' + l + '" data-act="cycle" title="Lernstand: ' + LEVELS[l] + ' — antippen zum Ändern" aria-label="Lernstand ' + LEVELS[l] + ', antippen zum Ändern"><span>' + LEVELS[l] + '</span></button>' +
      img +
      '<div class="dd-ov__txt" data-act="reveal"><strong>' + E(c.t) + '</strong><p>' + E(c.d) + '</p>' +
        (multi() ? '<small class="dd-ov__src">' + E(stackTitle(c.sid)) + '</small>' : '') + '</div></li>';
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
    prog[id] = { l: next, s: next === 3 ? 1 : 0, t: Date.now() };   // l 0 = Grabstein „wieder neu“
    saveProg(sidOf(id));
    renderOverview();
  }

  /* ══════════════════════════════════════════════════════════════
     MEMORY (gemeinsam an einem Gerät)
     ══════════════════════════════════════════════════════════════
     Nach dem Vorbild von Sönkes „Evolutionsfaktoren“-Memory: links
     die Begriffe, rechts die Definitionen, beide Bretter gleich
     gebaut (gleiche Kartengröße). Wer dran ist, deckt je eine Karte
     links und rechts auf; beide fliegen groß in die Mitte, und die
     Spielenden entscheiden „Ja, Paar!“ / „Nein“. Richtig = Punkt,
     die Karten fliegen zum Punktestand, und man ist nochmal dran;
     sonst fliegen sie zurück, drehen sich um, und die andere Person
     ist dran. Allein: es zählen Paare und Züge.
     Der Text der Karten steht erst nach dem Aufdecken im DOM (kein
     Spicken) und wird mit fitText() in die Karte eingepasst. Jeder
     Takt prüft, ob sein Spiel (m) noch läuft.
     Tippen irgendwo, während etwas läuft, überspringt die Bewegungen
     bis zur nächsten Entscheidung (mmWait/mmSkip). */
  const FLY_MS = 420, FLIP_MS = 280, HOLD_MS = 250;
  const SAY_OK_MS = 650, SAY_NO_MS = 1000;   // Ergebnis lesen, dann fliegen die Karten

  /* Nächster Takt des Memorys. Im Überspring-Lauf (m.fast) sofort. */
  function mmWait(m, ms, fn) {
    if (m.fast) { fn(); return; }
    clearTimeout(m.timer);
    m.wait = fn;
    m.timer = setTimeout(() => { m.wait = null; if (mm === m && root) fn(); }, ms);
  }
  /* Alle Takte bis zur nächsten Entscheidung ohne Bewegung ablaufen lassen. */
  function mmSkip() {
    const m = mm, sec = root && root.querySelector('#ddMem');
    if (!m || !m.wait || !sec) return false;
    clearTimeout(m.timer);
    const fn = m.wait;
    m.wait = null;
    m.fast = true;
    sec.classList.add('is-fast');
    try { fn(); } finally {
      sec.getBoundingClientRect();                     // Endstand ohne Übergang festschreiben
      sec.classList.remove('is-fast');
      m.fast = false;
    }
    return true;
  }
  const MM_MAX = 24;

  /* Karten mit gleichem Begriff zählen nur einmal (zwei Stapel mit „Zelle“). */
  function memPool() {
    const seen = new Set(), out = [];
    for (const c of opened.cards) { const k = sortKey(c.t).trim(); if (!seen.has(k)) { seen.add(k); out.push(c); } }
    return out;
  }
  function memOptions(n) {
    const o = [6, 8, 12, 18, 24].filter(x => x < n && x <= MM_MAX);
    o.push(Math.min(n, MM_MAX));
    return o;
  }
  function newMemory(pairs, players) {
    const poolC = memPool();
    const opts = memOptions(poolC.length);
    const p = opts.includes(pairs) ? pairs : (opts.includes(8) ? 8 : opts[opts.length - 1]);
    const chosen = shuffle(poolC.slice()).slice(0, p);
    mm = {
      pairs: p, players: players === 1 ? 1 : 2, n: poolC.length,
      t: shuffle(chosen.map(c => ({ pid: c.id, text: c.t, up: false, done: false }))),
      d: shuffle(chosen.map(c => ({ pid: c.id, text: c.d, up: false, done: false }))),
      picked: [], active: 1, scores: { 1: 0, 2: 0 }, moves: 0, matched: 0, busy: false, fly: []
    };
  }
  const fsOk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  function renderMemory() {
    const pane = root.querySelector('#ddPane');
    if (!mm) newMemory(8, 2);
    const opts = memOptions(mm.n);
    const pl = (k, l) => '<button type="button" class="dd-seg' + (mm.players === k ? ' is-on' : '') + '" data-act="mm-players" data-v="' + k + '">' + l + '</button>';
    pane.innerHTML =
      '<section class="dd-mem" id="ddMem">' +
        '<div class="dd-membar">' +
          '<div class="dd-membar__set">' +
            '<select class="dd-input dd-input--s" data-mm="pairs" aria-label="Anzahl Paare">' + opts.map(o =>
              '<option value="' + o + '"' + (o === mm.pairs ? ' selected' : '') + '>' + o + ' Paare' + (o === mm.n && o <= MM_MAX ? ' (alle)' : '') + '</option>').join('') + '</select>' +
            '<div class="dd-segs dd-segs--s" role="group" aria-label="Wie viele spielen">' + pl(1, 'Allein') + pl(2, 'Zu zweit') + '</div>' +
            '<button type="button" class="btn btn--sm" data-act="mm-new">' + ico.again + 'Neustart</button>' +
          '</div>' +
          '<div class="dd-players" id="ddPlayers"></div>' +
          '<p class="dd-turn" id="ddTurn" aria-live="polite"></p>' +
          (fsOk() ? '<button type="button" class="btn btn--sm dd-ic dd-fsbtn" data-act="mm-fs" title="Vollbild" aria-label="Vollbild">' + (fsEl() ? ico.unfull : ico.full) + '</button>' : '') +
        '</div>' +
        '<div class="dd-memboards">' +
          '<div class="dd-memside dd-memside--t"><h3 class="dd-memside__h"><span>Begriffe</span></h3><div class="dd-memgrid" id="ddMemT"></div></div>' +
          '<div class="dd-memside dd-memside--d"><h3 class="dd-memside__h"><span>Definitionen</span></h3><div class="dd-memgrid" id="ddMemD"></div></div>' +
        '</div>' +
        '<div class="dd-review" id="ddReview" hidden>' +
          '<div class="dd-review__bg"></div>' +
          '<p class="dd-review__msg" aria-live="polite"></p>' +
          '<div class="dd-review__act">' +
            '<button type="button" class="dd-r dd-r--3 dd-yes" data-act="mm-yes"><b>Ja, Paar!</b></button>' +
            '<button type="button" class="dd-r dd-r--1 dd-no" data-act="mm-no"><b>Nein</b></button>' +
          '</div>' +
        '</div>' +
        '<div class="dd-memwin" id="ddMemWin" hidden></div>' +
      '</section>';
    paintPlayers();
    paintBoards();
  }

  function paintPlayers() {
    const box = root.querySelector('#ddPlayers'), turn = root.querySelector('#ddTurn');
    if (!box || !mm) return;
    if (mm.players === 1) {
      box.innerHTML =
        '<span class="dd-pl dd-pl--1 is-on" id="ddP1"><span class="dd-pl__n">Paare</span><b id="ddS1">' + mm.matched + '/' + mm.pairs + '</b></span>' +
        '<span class="dd-pl dd-pl--z"><span class="dd-pl__n">Züge</span><b>' + mm.moves + '</b></span>';
      turn.textContent = 'Einen Begriff und eine Definition aufdecken.';
    } else {
      box.innerHTML = [1, 2].map(k =>
        '<span class="dd-pl dd-pl--' + k + (mm.active === k ? ' is-on' : '') + '" id="ddP' + k + '"><span class="dd-pl__n">Spieler ' + k + '</span><b id="ddS' + k + '">' + mm.scores[k] + '</b></span>').join('');
      turn.innerHTML = '<i class="dd-turn__dot dd-turn__dot--' + mm.active + '"></i>Spieler ' + mm.active + ' ist dran: einen Begriff und eine Definition aufdecken.';
    }
  }

  /* Spalten so wählen, dass die Karten möglichst groß und etwas breiter als hoch werden. */
  function memCols(w, h, n) {
    let best = 1, score = -1;
    for (let c = 1; c <= 6; c++) {
      const r = Math.ceil(n / c);
      const s = Math.min(w / c, (h / r) * 1.45);
      if (s > score + 0.5) { score = s; best = c; }
    }
    return best;
  }
  function layoutBoards() {
    if (!mm) return;
    const gt = root.querySelector('#ddMemT'), gd = root.querySelector('#ddMemD');
    if (!gt || !gd) return;
    const cols = memCols(gt.clientWidth || 300, gt.clientHeight || 300, mm.pairs);
    const rows = Math.ceil(mm.pairs / cols);
    for (const g of [gt, gd]) {
      g.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
      g.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    }
  }
  function memCardHTML(card, side, i) {
    if (card.done) return '<div class="dd-mc dd-mc--done" id="ddMc' + side + i + '"></div>';
    return '<button type="button" class="dd-mc dd-mc--' + side + (card.up ? ' is-up' : '') + '" id="ddMc' + side + i + '" data-act="mm-pick" data-side="' + side + '" data-i="' + i + '" aria-label="' +
        (side === 't' ? 'Begriff' : 'Definition') + ' ' + (i + 1) + ' aufdecken">' +
      '<span class="dd-mc__in">' +
        '<span class="dd-mc__cover"><span class="dd-mc__q">?</span><span class="dd-mc__l">' + (side === 't' ? 'Begriff' : 'Definition') + '</span></span>' +
        '<span class="dd-mc__face dd-mc__face--' + side + '"><span class="dd-mc__box"><span class="dd-mc__p">' + (card.up ? E(card.text) : '') + '</span></span></span>' +
      '</span></button>';
  }
  function paintBoards() {
    const gt = root.querySelector('#ddMemT'), gd = root.querySelector('#ddMemD');
    if (!gt || !gd || !mm) return;
    gt.innerHTML = mm.t.map((c, i) => memCardHTML(c, 't', i)).join('');
    gd.innerHTML = mm.d.map((c, i) => memCardHTML(c, 'd', i)).join('');
    layoutBoards();
  }

  /* Text in seine Box einpassen, indem die Schrift kleiner wird (kein Scrollen). */
  function fitText(p, box, max, min) {
    let lo = min, hi = max;
    const fits = px => { p.style.fontSize = px + 'px'; return p.offsetHeight <= box.clientHeight && p.scrollWidth <= box.clientWidth; };
    if (fits(hi)) return hi;
    while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    p.style.fontSize = lo + 'px';
    return lo;
  }
  const boardFont = el => Math.max(9, Math.min(20, el.clientHeight / 4.2));

  function memPick(side, i) {
    const m = mm;
    if (!m || m.busy) return;
    const card = m[side][i];
    if (!card || card.up || card.done) return;
    if (m.picked.length === 1 && m.picked[0].side === side) return;   // je Seite nur eine
    card.up = true;
    m.picked.push({ side, i, card });
    const el = root.querySelector('#ddMc' + side + i);
    if (el) {
      const p = el.querySelector('.dd-mc__p');
      p.textContent = card.text;
      el.classList.add('is-up');
      fitText(p, el.querySelector('.dd-mc__box'), boardFont(el), 4);
    }
    if (m.picked.length === 2) {
      m.busy = true;
      mmWait(m, FLIP_MS + HOLD_MS, () => startReview(m));
    }
  }

  function setRect(el, r) {
    el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
    el.style.width = r.width + 'px'; el.style.height = r.height + 'px';
  }
  /* Kopie einer aufgedeckten Karte, die in die Mitte fliegt; Größe, Schrift und Rand wachsen mit. */
  function buildFly(card, side, origin, target, layer) {
    const wrap = document.createElement('div');
    wrap.className = 'dd-fly';
    wrap.innerHTML = '<span class="dd-mc__face dd-mc__face--' + side + '"><span class="dd-mc__box"><span class="dd-mc__p"></span></span></span>';
    const face = wrap.firstChild, box = face.firstChild, p = box.firstChild;
    p.textContent = card.text;
    layer.appendChild(wrap);
    const pad = r => Math.max(4, Math.min(r.width, r.height) * 0.08);
    const measure = (r, max) => { setRect(wrap, r); face.style.padding = pad(r) + 'px'; return fitText(p, box, max, 4); };
    const fontTarget = measure(target, side === 't' ? 44 : 26);
    const fontOrigin = measure(origin, 20);
    wrap.getBoundingClientRect();                       // Startzustand festschreiben
    const ease = FLY_MS + 'ms cubic-bezier(.2,.8,.2,1)';
    wrap.style.transition = 'left ' + ease + ',top ' + ease + ',width ' + ease + ',height ' + ease + ',opacity 300ms,transform ' + ease;
    face.style.transition = 'padding ' + ease;
    p.style.transition = 'font-size ' + ease;
    return { wrap, face, p, fontOrigin, fontTarget, padOrigin: pad(origin), padTarget: pad(target) };
  }

  function startReview(m) {
    const layer = root.querySelector('#ddReview');
    if (!layer) return;
    const msg = layer.querySelector('.dd-review__msg'), act = layer.querySelector('.dd-review__act');
    const vw = window.innerWidth, vh = window.innerHeight;
    const gap = 16;
    const cardW = Math.min((vw - 3 * gap) / 2, 460);
    const cardH = Math.min(vh * 0.56, 380);
    const top = Math.max(64, (vh - cardH) / 2 - 30);
    const targets = {
      t: { left: vw / 2 - gap / 2 - cardW, top, width: cardW, height: cardH },
      d: { left: vw / 2 + gap / 2, top, width: cardW, height: cardH }
    };
    msg.style.top = Math.max(8, top - 54) + 'px';
    msg.textContent = 'Passen diese beiden Karten zusammen?';
    act.style.top = (top + cardH + 20) + 'px';
    layer.hidden = false;
    m.fly = m.picked.map(({ side, i, card }) => {
      const el = root.querySelector('#ddMc' + side + i);
      const r = el.getBoundingClientRect();
      const origin = { left: r.left, top: r.top, width: r.width, height: r.height };
      const f = buildFly(card, side, origin, targets[side], layer);
      el.style.visibility = 'hidden';
      return Object.assign(f, { origin, target: targets[side], el, side });
    });
    const go = () => {
      if (mm !== m) return;
      layer.classList.add('is-open');
      m.fly.forEach(f => { setRect(f.wrap, f.target); f.p.style.fontSize = f.fontTarget + 'px'; f.face.style.padding = f.padTarget + 'px'; });
      mmWait(m, FLY_MS - 100, () => {
        layer.classList.add('is-ask');
        const y = layer.querySelector('.dd-yes'); if (y) y.focus({ preventScroll: true });
      });
    };
    if (m.fast) go(); else requestAnimationFrame(() => requestAnimationFrame(go));
  }
  function hideReview(m) {
    (m.fly || []).forEach(f => f.wrap.remove());
    m.fly = [];
    const layer = root && root.querySelector('#ddReview');
    if (!layer) return;
    layer.hidden = true;
    layer.classList.remove('is-open', 'is-ask', 'is-said');
  }

  /* Ja/Nein. Ob es ein Paar ist: dieselbe Karte — oder zwei Karten mit gleichem Begriff. */
  function memDecide(yes) {
    const m = mm;
    if (!m || m.picked.length !== 2 || m.fly.length !== 2) return;
    const layer = root.querySelector('#ddReview');
    if (!layer || !layer.classList.contains('is-ask') || layer.classList.contains('is-said')) return;
    layer.classList.add('is-said');
    const [a, b] = m.picked;
    const ct = opened.cards.find(c => c.id === (a.side === 't' ? a : b).card.pid);
    const cd = opened.cards.find(c => c.id === (a.side === 'd' ? a : b).card.pid);
    const match = a.card.pid === b.card.pid || (ct && cd && sortKey(ct.t).trim() === sortKey(cd.t).trim());
    const ok = yes && match;
    m.moves++;
    const msg = layer.querySelector('.dd-review__msg');
    msg.textContent = ok ? (m.players === 2 ? 'Richtig! Punkt für Spieler ' + m.active + '.' : 'Richtig!')
      : yes ? 'Leider falsch – das war kein Paar.'
      : match ? 'Schade, das war ein Paar!' : 'Stimmt, kein Paar.';
    msg.className = 'dd-review__msg' + (ok ? ' is-ok' : ' is-no');
    mmWait(m, ok ? SAY_OK_MS : SAY_NO_MS, () => (ok ? flyToPlayer : flyBack)(m));
  }

  function flyToPlayer(m) {
    const chip = root.querySelector('#ddP' + (m.players === 1 ? 1 : m.active));
    const layer = root.querySelector('#ddReview');
    const r = chip ? chip.getBoundingClientRect() : { left: 0, top: 0, width: 40, height: 28 };
    const w = 40, h = 28;
    const target = { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - h / 2, width: w, height: h };
    layer.classList.remove('is-open', 'is-ask');
    m.fly.forEach(f => { setRect(f.wrap, target); f.p.style.fontSize = '3px'; f.face.style.padding = '1px'; f.wrap.style.opacity = '0.2'; });
    mmWait(m, FLY_MS + 50, () => {
      m.picked.forEach(x => { x.card.done = true; x.card.up = false; });
      m.scores[m.active]++;
      m.matched++;
      m.picked = [];
      hideReview(m);
      paintBoards();
      paintPlayers();
      const s = root.querySelector('#ddS' + (m.players === 1 ? 1 : m.active));
      if (s && s.animate && !still()) s.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }], { duration: 350 });
      m.busy = false;
      if (m.matched === m.pairs) mmWait(m, 500, () => memWin(m));
    });
  }

  function flyBack(m) {
    const layer = root.querySelector('#ddReview');
    layer.classList.remove('is-open', 'is-ask');
    m.fly.forEach(f => { setRect(f.wrap, f.origin); f.p.style.fontSize = f.fontOrigin + 'px'; f.face.style.padding = f.padOrigin + 'px'; });
    const els = m.fly.map(f => f.el);
    // Die Karten landen offen auf ihrem Platz, liegen kurz und drehen sich dann um.
    mmWait(m, FLY_MS + 50, () => {
      els.forEach(el => { el.style.visibility = ''; });
      hideReview(m);
      mmWait(m, HOLD_MS, () => {
        els.forEach(el => el.classList.remove('is-up'));
        mmWait(m, FLIP_MS + 50, () => {
          m.picked.forEach(x => { x.card.up = false; });
          els.forEach(el => { const p = el.querySelector('.dd-mc__p'); if (p) p.textContent = ''; });
          m.picked = [];
          if (m.players === 2) m.active = m.active === 1 ? 2 : 1;
          paintPlayers();
          m.busy = false;
        });
      });
    });
  }

  function memWin(m) {
    const box = root.querySelector('#ddMemWin');
    if (!box) return;
    let h, t;
    if (m.players === 1) {
      h = 'Alle Paare gefunden!';
      t = m.pairs + ' Paare in ' + m.moves + ' Zügen' + (m.moves === m.pairs ? ' – ohne einen Fehler!' : '.');
    } else if (m.scores[1] === m.scores[2]) {
      h = 'Unentschieden!'; t = 'Beide haben ' + m.scores[1] + ' Paare gefunden.';
    } else {
      const w = m.scores[1] > m.scores[2] ? 1 : 2;
      h = 'Spieler ' + w + ' gewinnt!'; t = m.scores[w] + ' zu ' + m.scores[w === 1 ? 2 : 1] + ' Paaren.';
    }
    box.innerHTML = '<div class="dd-memwin__bg"></div><div class="dd-memwin__sheet" role="dialog" aria-modal="true" aria-labelledby="ddWinH">' +
      '<span class="dd-memwin__stamp">Fertig</span>' +
      '<h2 id="ddWinH">' + h + '</h2><p>' + t + '</p>' +
      (m.players === 2 ? '<div class="dd-memwin__sc"><span class="dd-pl dd-pl--1"><span class="dd-pl__n">Spieler 1</span><b>' + m.scores[1] + '</b></span>' +
        '<span class="dd-pl dd-pl--2"><span class="dd-pl__n">Spieler 2</span><b>' + m.scores[2] + '</b></span></div>' : '') +
      '<div class="dd-memwin__act"><button type="button" class="btn btn--primary" data-act="mm-new">' + ico.again + 'Neues Spiel</button>' +
      '<button type="button" class="btn" data-act="home">' + ico.back + 'Andere Stapel oder Spiele</button></div></div>';
    box.hidden = false;
    const b = box.querySelector('.btn--primary'); if (b) b.focus({ preventScroll: true });
  }

  function memFullscreen() {
    const el = root.querySelector('#ddMem');
    if (!el) return;
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    const p = req.call(el);
    if (p && p.catch) p.catch(() => {});
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
      mode: 'cards', text: '', dirty: false, saving: false
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
    if (isTeacher && !standalone && isShared(id)) {
      const cur = sharedRaw();
      await writeShared(cur.map(e => e.id === id
        ? entryOf({ id, title, n: cards.length, subject: ed.subject.trim(), topic: ed.topic.trim(), grade: ed.grade.trim() }) : e));
    }
    toast('Gespeichert.');
    ed = null;
    go('home');
    await loadList();
    if (root && !sel.includes(id)) { sel.push(id); if (screen === 'home') renderHome(); }   // gerade bearbeitet = gleich gewählt
  }
  function focusField(sel) { const f = root.querySelector(sel); if (f) f.focus(); }

  async function cancelEdit() {
    if (!ed) return;
    const dirty = ed.dirty || (ed.mode === 'text' && ed.text !== '');
    if (dirty && !(await ctx.confirm('Änderungen verwerfen?'))) return;
    ed = null;
    go('home');
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
    if (!standalone && isShared(id)) await writeShared(sharedRaw().filter(e => e.id !== id));
    try { localStorage.removeItem('dd.p.' + id); localStorage.removeItem('dd.sum.' + id); } catch (e) { /* egal */ }
    ed = null;
    sel = sel.filter(x => x !== id);
    toast('Stapel gelöscht.');
    go('home');
    loadList();
  }

  /* ══════════════════════════════════════════════════════════════
     Ereignisse
     ══════════════════════════════════════════════════════════════ */
  function bind() {
    onClick = async (ev) => {
      // Memory: Tippen, während Karten drehen oder fliegen, überspringt das.
      if (mm && mm.wait && ev.target.closest('#ddMem') && !ev.target.closest('.dd-membar') && mmSkip()) return;
      const b = ev.target.closest('[data-act]');
      if (!b || !root.contains(b)) return;
      const act = b.dataset.act;
      const stackEl = b.closest('.dd-stack');
      const sid = stackEl && stackEl.dataset.id;
      const gameEl = b.closest('.dd-game');
      const gid = gameEl && gameEl.dataset.g;
      const cardIdx = () => { const r = b.closest('.dd-cardin'); return r ? Number(r.dataset.i) : -1; };
      switch (act) {
        case 'new': openEditor(null); break;
        case 'reload': loadList(); break;
        case 'home': go('home'); pullSums(); break;
        case 'sel': {
          const i = sel.indexOf(sid);
          if (i >= 0) sel.splice(i, 1); else sel.push(sid);
          renderHome();
          const n = root.querySelector('.dd-stack[data-id="' + (window.CSS && CSS.escape ? CSS.escape(sid) : sid) + '"]');
          if (n) n.focus({ preventScroll: true });
          break;
        }
        case 'game': if (isTeacher) openInfo(gid); else startGame(gid); break;
        case 'ginfo': openInfo(gid); break;
        case 'gshare': toggleGame(gid); break;
        case 'info-x': closeInfo(); break;
        case 'info-start': if (info) startGame(info); break;
        case 'info-share': if (info) toggleGame(info); break;
        case 'edit': {
          busy(true);
          const res = await src.get(sid);
          busy(false);
          if (!res.ok) { toast(errMsg(res.error)); break; }
          openEditor({ id: res.id, title: res.title, subject: res.subject, topic: res.topic, grade: res.grade, cards: res.cards });
          break;
        }
        case 'share': toggleShare(sid); break;
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
        case 'mm-pick': memPick(b.dataset.side, Number(b.dataset.i)); break;
        case 'mm-yes': memDecide(true); break;
        case 'mm-no': memDecide(false); break;
        case 'mm-new': if (mm) { newMemory(mm.pairs, mm.players); renderMemory(); } break;
        case 'mm-players': if (mm && !mm.busy) { newMemory(mm.pairs, Number(b.dataset.v)); renderMemory(); } break;
        case 'mm-fs': memFullscreen(); break;
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
      if (t.dataset.mm === 'pairs' && mm) {
        if (mm.busy) { t.value = mm.pairs; return; }
        newMemory(Number(t.value), mm.players); renderMemory(); return;
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
      if (ev.key === 'Escape' && info) { ev.preventDefault(); closeInfo(); return; }
      // Stapel und Spiel-Kacheln sind keine echten Knöpfe: Enter/Leertaste wie ein Klick.
      if ((ev.key === 'Enter' || ev.key === ' ') && root.contains(ev.target) && ev.target.matches &&
          ev.target.matches('.dd-stack[data-act], .dd-game[data-act]')) {
        ev.preventDefault(); ev.target.click(); return;
      }
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
      if (screen !== 'play' || !opened || opened.game !== 'cards' || !learn) return;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        if (tag === 'button') return;     // ein fokussierter Knopf behält sein eigenes Verhalten
        ev.preventDefault(); flip();
      } else if (learn.flipped && ['1', '2', '3'].includes(ev.key)) {
        ev.preventDefault(); rate(Number(ev.key));
      }
    };

    // Memory: bei neuer Größe (Drehen, Vollbild) nur die Spalten neu wählen.
    onResize = () => { if (screen === 'play' && mm) layoutBoards(); };
    onFs = () => {
      const b = root && root.querySelector('.dd-fsbtn');
      if (b) b.innerHTML = fsEl() ? ico.unfull : ico.full;
      setTimeout(onResize, 60);
    };

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
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
      standalone = !!(ctx && ctx.standalone);
      isTeacher = demo ? true : ctx.role === 'presenter';
      acct = null; remoteSum = {}; pushTimer = null; dirty.clear();
      screen = 'home'; list = null; listErr = ''; cache = {}; opened = null; ed = null; learn = null; ov = null; mm = null;
      sel = []; info = null;
      homeFilter = { q: '', fach: '' };
      lastSharedKey = '';
      root.innerHTML = '<div class="dd"><div class="dd-main"></div><div class="dd-layer"></div></div>';
      bind();
      // Die Klasse bekommt ihre Liste aus dem Raumzustand (update); erst die Lehrkraft fragt den Server.
      if (isTeacher) loadList(); else renderHome();
      pullSums();
    },

    update(v) {
      view = v;
      if (!root) return;
      const key = JSON.stringify([roomData().shared || [], roomData().games || null]);
      if (key === lastSharedKey) return;
      lastSharedKey = key;
      // Die Liste der Klasse ist die geteilte Liste — neu holen und zeichnen,
      // aber nur auf der Startseite (mitten im Spiel oder Tippen bleibt alles stehen).
      if (!isTeacher) list = sharedList();
      if (screen === 'home' && (list || !isTeacher)) renderHome();
      if (info) {
        if (!isTeacher && !gameShared(info)) info = null;
        renderInfo();
      }
    },

    unmount() {
      if (root) {
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
      }
      if (onKey) document.removeEventListener('keydown', onKey);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onFs) { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); }
      if (pushTimer) pushProg();          // letzter Stand noch zum Konto, bevor alles abgeräumt wird
      if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* egal */ } }
      onKey = onClick = onInput = onChange = onResize = onFs = null;
      root = null; ctx = null; view = null; opened = null; ed = null; learn = null; ov = null; mm = null; list = null; cache = {};
      sel = []; info = null;
    }
  });
})();
