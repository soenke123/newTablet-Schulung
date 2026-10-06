/* ══════════════════════════════════════════════════════════════
   Scrum Werkstatt — bridge.js   ·   Die Brücke in den Raum
   ══════════════════════════════════════════════════════════════
   Die Werkstatt ist eine eigene Seite (index.html) und läuft im Raum
   in einem <iframe> — wie NeuroLab, Wild Clusters und SYNIR. Diese
   Datei ist die einzige darin, die vom Raum weiß. Ohne Rahmen
   (Doppelklick auf index.html) schläft sie, und die Werkstatt
   speichert wie bisher im localStorage des Geräts.

   ── Was sie tut ───────────────────────────────────────────────
   Nach unten: Die Seite drumherum (tools/ScrumWerkstatt/tool.js)
   schickt bei jeder Änderung die volle Ansicht ({sw:'view'}). Daraus
   baut die Brücke das S-Objekt, mit dem der Prototyp schon immer
   arbeitet — product, team, stories, sprints. Der Rest der Seite
   merkt nicht, dass es einen Server gibt.

   Nach oben: Der Prototyp ruft nach jeder Änderung save(). Statt
   alles in den localStorage zu schreiben, vergleicht die Brücke
   jedes Objekt mit dem, was zuletzt vom Server kam, und schickt NUR
   die geänderten (mit der Version, die das Gerät kannte). Das ist
   die Hälfte der Konfliktprüfung; die andere macht scrum_save.

   ── Wann ein neuer Stand vom Server übernommen wird ───────────
   Nicht, solange eine eigene Änderung unterwegs ist — sonst
   überschriebe der ältere Server-Stand die gerade getippte Karte für
   einen Augenblick. Und nicht, solange jemand in einem Textfeld
   schreibt: neu gezeichnet wird erst, wenn das Feld den Fokus
   verliert.
   ══════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const EMBED = global.parent && global.parent !== global
             && !/[?&]demo=1\b/.test(global.location.search);
  const DEMO  = /[?&]demo=1\b/.test(global.location.search);
  const ORIGIN = global.location.origin;

  const DEFAULT_PRODUCT = { name: 'Unser Projekt', goal: '', images: [] };

  let known = {};        // 'story:u3' → { v, json }
  let lastView = null;
  let inflight = false;  // ein scrum_save ist unterwegs
  let again = false;     // währenddessen kam noch eine Änderung dazu
  let deferred = null;   // Ansicht, die auf ein Ende des Tippens wartet
  let rid = 0;
  const waiting = {};    // rid → resolve

  const SW = {
    on: EMBED,
    demo: DEMO,
    ro: true,            // bis zur ersten Ansicht: nichts schreiben
    me: null,            // { id, name, kind, key }
    role: null,          // 'participant' | 'presenter'
    observers: [],
    undecided: [],
    burndown: [],
    ready: false
  };

  /* ─── Nachrichten ───────────────────────────────────────── */
  function post(msg) {
    try { global.parent.postMessage(Object.assign({ sw: 1 }, msg), ORIGIN); } catch (e) { /* zu */ }
  }

  // Ein Serveraufruf über die Seite drumherum. Die hängt Token bzw.
  // Raum-Code an; die Brücke kennt keinen von beiden.
  SW.call = function (fn, args) {
    return new Promise(resolve => {
      const id = ++rid;
      waiting[id] = resolve;
      post({ type: 'call', rid: id, fn, args: args || {} });
      // Antwortet niemand (Rahmen abgeräumt, Netz weg), soll der Knopf
      // nicht ewig hängen.
      setTimeout(() => {
        if (waiting[id]) { delete waiting[id]; resolve({ ok: false, error: 'network' }); }
      }, 20000);
    });
  };

  SW.refresh = function () { post({ type: 'refresh' }); };

  /* ─── Ansicht → S ───────────────────────────────────────── */
  const keyOf = (kind, id) => kind + ':' + id;

  /* Vergleichen nach Inhalt, nicht nach Schreibweise: jsonb sortiert
     die Schlüssel anders, als der Prototyp sie anlegt. Ein schlichtes
     JSON.stringify hielte sonst jede frisch geladene Karte für
     geändert und schickte sie gleich wieder zurück. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
        .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  function build(view) {
    const items = view.items || [];
    const byKind = k => items.filter(i => i.kind === k && i.data);
    const prod = items.find(i => i.kind === 'product' && i.id === 'main' && i.data);
    const stories = byKind('story').map(i => Object.assign({}, i.data, { id: i.id }));
    const sprints = byKind('sprint').map(i => Object.assign({}, i.data, { id: i.id }));
    const act = sprints.find(s => s.status === 'active');
    return {
      product: prod ? Object.assign({ images: [] }, prod.data) : JSON.parse(JSON.stringify(DEFAULT_PRODUCT)),
      team: (view.members || []).map(m => ({
        id: m.id, name: m.name, role: m.role, label: m.label || '',
        avatar: m.avatar || null, online: !!m.online, me: !!m.me, key: m.key || null
      })),
      stories,
      sprints,
      active: act ? act.id : null,
      seq: { story: view.seq?.story || 0, sprint: view.seq?.sprint || 0 }
    };
  }

  function remember(state) {
    known = {};
    known[keyOf('product', 'main')] = {
      v: verOf('product', 'main'),
      json: canon(state.product)
    };
    state.stories.forEach(s => { known[keyOf('story', s.id)] = { v: verOf('story', s.id), json: canon(s) }; });
    state.sprints.forEach(s => { known[keyOf('sprint', s.id)] = { v: verOf('sprint', s.id), json: canon(s) }; });
  }

  function verOf(kind, id) {
    const it = (lastView?.items || []).find(i => i.kind === kind && i.id === id);
    return it ? it.v : 0;
  }

  function typing() {
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    return a.isContentEditable || a.tagName === 'TEXTAREA'
        || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'button'].includes(a.type));
  }

  function apply(view) {
    lastView = view;
    SW.role = view.role;
    SW.me = view.me || null;
    SW.observers = view.observers || [];
    SW.undecided = view.undecided || [];
    SW.burndown = view.burndown || [];
    SW.ro = view.role !== 'participant' || !view.me || view.me.kind !== 'member' || !!view.me.blocked;
    document.body.classList.toggle('ro', SW.ro);
    document.body.classList.toggle('is-teacher', view.role === 'presenter');

    const next = build(view);
    setS(next);
    remember(next);
    SW.ready = true;
    global.swRender();
  }

  // `let S` aus index.html ist keine Eigenschaft von window. Gesetzt
  // wird es deshalb über eine Funktion, die index.html bereitstellt.
  function setS(next) { if (typeof global.swSetS === 'function') global.swSetS(next); }

  function offer(view) {
    if (inflight || again) { deferred = view; return; }
    if (typing()) { deferred = view; return; }
    deferred = null;
    apply(view);
  }

  // Tippen beendet: liegengebliebene Ansicht jetzt übernehmen.
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (deferred && !typing() && !inflight) offer(deferred); }, 0);
  });

  /* ─── S → Änderungen ────────────────────────────────────── */
  function diff(S) {
    const ops = [];
    const seen = new Set();
    const put = (kind, id, obj) => {
      const k = keyOf(kind, id);
      seen.add(k);
      const json = canon(obj);
      const was = known[k];
      if (was && was.json === json) return;
      if (!was && kind === 'product' && json === canon(DEFAULT_PRODUCT)) return;
      ops.push({ op: 'put', kind, id, v: was ? was.v : 0, data: obj });
    };
    put('product', 'main', S.product);
    S.stories.forEach(s => put('story', s.id, s));
    S.sprints.forEach(s => put('sprint', s.id, s));
    Object.keys(known).forEach(k => {
      if (seen.has(k)) return;
      const [kind, id] = k.split(':');
      if (kind === 'product') return;
      if (!known[k].v) return;   // nie auf dem Server gewesen
      ops.push({ op: 'del', kind, id, v: known[k].v });
    });
    return ops;
  }

  const MSG = {
    conflict:        'Jemand anderes hat das gerade geändert — ihr seht jetzt den neuesten Stand. Bitte noch einmal.',
    sprint_active:   'Auf einem anderen Gerät läuft schon ein Sprint. Ihr seht jetzt den aktuellen Stand.',
    read_only:       'Du schaust nur zu — ändern können nur Teammitglieder.',
    blocked:         'Deine Lehrkraft hat dieses Tablet gerade stillgelegt.',
    payload_too_big: 'Das ist zu groß zum Speichern (zu viele oder zu große Bilder?).',
    quota_exceeded:  'Das Projekt ist voll — höchstens 400 Stories und 80 Sprints.',
    team_full:       'Das Team ist voll — ein Scrum-Team hat höchstens 10 Mitglieder.',
    text_blocked:    'Solche Wörter bitte nicht.',
    network:         'Keine Verbindung — die Änderung ist noch nicht gespeichert.',
    fn_missing:      'Auf dem Server fehlt die neueste Migration (0196). Bitte der Lehrkraft Bescheid sagen.'
  };
  SW.msg = code => MSG[code] || 'Das hat nicht geklappt. Bitte noch einmal.';

  SW.save = async function () {
    if (!SW.ready) return;
    const S = global.swGetS();
    const ops = diff(S);
    if (!ops.length) return;

    if (SW.ro) {
      // Ein Knopf, der im Lesemodus übersehen wurde: zurück auf den
      // Server-Stand, statt still eine Abweichung stehenzulassen.
      global.toast(SW.msg('read_only'));
      if (lastView) apply(lastView);
      return;
    }
    if (inflight) { again = true; return; }

    inflight = true;
    const res = await SW.call('scrum_save', { p_ops: ops });
    inflight = false;

    if (res && res.ok) {
      // Die Antwort trägt den neuen Stand jedes geschriebenen Objekts
      // (Version, und bei neuen Karten die Nummer vom Server).
      const cur = global.swGetS();
      (res.items || []).forEach(it => {
        const k = keyOf(it.kind, it.id);
        if (it.deleted) { delete known[k]; return; }
        const fresh = it.kind === 'product' ? it.data : Object.assign({}, it.data, { id: it.id });
        // Was der Server ergänzt (Nummer, Schlüssel, Name eines neuen
        // Sprints), ins Gerät übernehmen. Alles andere bleibt, wie es
        // auf dem Gerät steht — es kann schon weiter bearbeitet sein,
        // und genau dann soll der Vergleich unten es noch finden.
        if (it.kind !== 'product') {
          const list = it.kind === 'story' ? cur.stories : cur.sprints;
          const obj = list.find(x => x.id === it.id);
          if (obj) ['key', 'no', 'name'].forEach(f => {
            if (fresh[f] !== undefined && (f !== 'name' || !obj.name)) obj[f] = fresh[f];
          });
        }
        known[k] = { v: it.v, json: canon(fresh) };
        if (lastView) {
          const li = lastView.items.find(i => i.kind === it.kind && i.id === it.id);
          if (li) { li.v = it.v; li.data = it.data; }
          else lastView.items.push({ kind: it.kind, id: it.id, v: it.v, data: it.data });
        }
      });
      if (lastView) {
        const del = new Set((res.items || []).filter(i => i.deleted).map(i => keyOf(i.kind, i.id)));
        lastView.items = lastView.items.filter(i => !del.has(keyOf(i.kind, i.id)));
      }
      global.swRender(true);
      if (again) { again = false; SW.save(); return; }
      SW.refresh();
    } else {
      again = false;
      global.toast(SW.msg(res && res.error));
      // Den Server-Stand holen; die eigene, abgelehnte Änderung fällt weg.
      deferred = null;
      if (lastView) apply(lastView);
      SW.refresh();
    }
    if (deferred && !typing()) offer(deferred);
  };

  /* ─── Team ──────────────────────────────────────────────── */
  SW.member = async function (id, patch) {
    if (SW.ro) { global.toast(SW.msg('read_only')); return false; }
    const res = await SW.call('scrum_member_update', { p_participant: id, p_patch: patch });
    if (!res || !res.ok) { global.toast(SW.msg(res && res.error)); SW.refresh(); return false; }
    SW.refresh();
    return true;
  };

  SW.enter = async function (kind) {
    const res = await SW.call('scrum_enter', { p_kind: kind });
    if (!res || !res.ok) {
      global.toast(res && res.error === 'already_member'
        ? 'Du bist schon Teammitglied.' : SW.msg(res && res.error));
      return null;
    }
    SW.refresh();
    return res;
  };

  SW.rekey = async function (id) {
    const res = await SW.call('scrum_room_rekey', { p_participant: id });
    if (!res || !res.ok) { global.toast(SW.msg(res && res.error)); return null; }
    SW.refresh();
    return res.key;
  };

  SW.fmtKey = k => k ? String(k).slice(0, 4) + '-' + String(k).slice(4) : '';

  /* ─── Empfang ───────────────────────────────────────────── */
  if (EMBED) {
    global.addEventListener('message', (e) => {
      if (e.origin !== ORIGIN || e.source !== global.parent) return;
      const m = e.data;
      if (!m || m.sw !== 1) return;
      if (m.type === 'view' && m.view) offer(m.view);
      else if (m.type === 'reply' && waiting[m.rid]) {
        const r = waiting[m.rid]; delete waiting[m.rid]; r(m.res);
      }
    });
  }

  SW.start = function () { post({ type: 'ready' }); };

  global.SW = SW;
})(window);
