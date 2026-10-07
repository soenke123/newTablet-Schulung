/* ══════════════════════════════════════════════════════════════
   Projektarbeit — bridge.js   ·   Die Brücke in den Raum
   ══════════════════════════════════════════════════════════════
   Die Projektarbeit läuft wie die Scrum Werkstatt in einem <iframe>
   (index.html). Diese Datei ist die einzige darin, die vom Raum weiß.

   Nach unten: Die Seite drumherum (tools/Projektarbeit/tool.js)
   schickt bei jeder Änderung die volle Ansicht ({pa:1, type:'view'}).
   Die Brücke merkt sich daraus die Objekte des Planungsraums
   (goal, task, log, request) mit ihrer Versionsnummer.

   Nach oben: Jede Änderung ist EIN Objekt (put/del) und geht mit der
   Version, die das Gerät kannte, an pa_save bzw. pa_room_save. Passt
   die Version nicht mehr, hat jemand anderes schneller gespeichert —
   dann kommt der aktuelle Stand, statt still zu überschreiben.
   Mehrere Änderungen kurz hintereinander werden gesammelt und in
   einem Aufruf geschickt; nie zwei Aufrufe gleichzeitig.

   Neue Ansichten werden nicht übernommen, solange eine eigene
   Änderung unterwegs ist oder jemand in einem Textfeld schreibt —
   neu gezeichnet wird erst, wenn das Feld den Fokus verliert.

   Ohne Rahmen (Doppelklick) oder mit ?demo=1 (Schaufenster) läuft
   eine kleine Nachbildung des Servers im Gerät (DEMO unten) — mit
   einer Beispielklasse, und nichts bleibt hängen.
   ══════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const DEMO   = /[?&]demo=1\b/.test(global.location.search)
              || !(global.parent && global.parent !== global);
  const EMBED  = !DEMO;
  const ORIGIN = global.location.origin;

  let view = null;          // zuletzt übernommene Ansicht
  let deferred = null;      // Ansicht, die auf ein Ende des Tippens wartet
  let deferredFor;          // … und für welche Gruppe sie geholt wurde
  let items = {};           // 'task:t3' → { kind, id, v, data }
  let pending = {};         // 'task:t3' → { op, kind, id, data }
  let inflight = false;
  let rid = 0;
  const waiting = {};

  const PA = {
    on: EMBED,
    demo: DEMO,
    ready: false,
    role: null,             // 'participant' | 'presenter'
    owner: false,           // Raum-Besitzer = Lehrkraft
    ro: true,
    me: null,
    focus: null,            // Lehrkraft: Gruppe, deren Planungsraum offen ist
    viewFor: null,          // für welche Gruppe die aktuelle Ansicht geholt wurde
    render: () => {}
  };

  /* ─── Nachrichten ───────────────────────────────────────── */
  function post(msg) {
    try { global.parent.postMessage(Object.assign({ pa: 1 }, msg), ORIGIN); } catch (e) { /* zu */ }
  }

  function call(fn, args) {
    if (DEMO) return Promise.resolve(DEMO_SERVER.call(fn, args || {}));
    return new Promise(resolve => {
      const id = ++rid;
      waiting[id] = resolve;
      post({ type: 'call', rid: id, fn, args: args || {} });
      setTimeout(() => {
        if (waiting[id]) { delete waiting[id]; resolve({ ok: false, error: 'network' }); }
      }, 20000);
    });
  }
  PA.call = call;

  PA.refresh = function () {
    if (DEMO) { setTimeout(() => offer(DEMO_SERVER.view(PA.focus), PA.focus), 0); return; }
    post({ type: 'refresh' });
  };

  /* ─── Ansicht übernehmen ────────────────────────────────── */
  const keyOf = (kind, id) => kind + ':' + id;

  function typing() {
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    return a.isContentEditable || a.tagName === 'TEXTAREA'
        || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'button'].includes(a.type));
  }

  function apply(v, forFocus) {
    view = v;
    PA.viewFor = forFocus === undefined ? PA.viewFor : (forFocus || null);
    PA.role  = v.role;
    PA.owner = v.role === 'presenter';
    PA.me    = v.me || null;
    PA.ro    = PA.owner ? false : !!(v.me && v.me.blocked);
    document.body.classList.toggle('ro', PA.ro);
    document.body.classList.toggle('is-teacher', PA.owner);

    const next = {};
    (v.items || []).forEach(it => {
      if (it.data === undefined) return;
      next[keyOf(it.kind, it.id)] = { kind: it.kind, id: it.id, v: it.v, data: it.data };
    });
    // Was noch auf dem Weg zum Server ist, gilt auf dem Gerät weiter.
    Object.keys(pending).forEach(k => {
      const p = pending[k];
      if (p.op === 'del') delete next[k];
      else next[k] = Object.assign({}, next[k] || { kind: p.kind, id: p.id, v: 0 }, { data: p.data });
    });
    items = next;
    PA.ready = true;
    PA.render();
  }

  function offer(v, forFocus) {
    if (!v) return;
    if (inflight || Object.keys(pending).length || typing()) { deferred = v; deferredFor = forFocus; return; }
    deferred = null;
    apply(v, forFocus);
  }

  document.addEventListener('focusout', () => {
    setTimeout(() => { if (deferred && !typing() && !inflight) offer(deferred, deferredFor); }, 0);
  });

  /* ─── Lesen ─────────────────────────────────────────────── */
  PA.view = () => view;
  PA.list = kind => Object.values(items).filter(i => i.kind === kind)
    .map(i => Object.assign({}, i.data, { id: i.id }));
  PA.get = (kind, id) => {
    const i = items[keyOf(kind, id)];
    return i ? Object.assign({}, i.data, { id: i.id }) : null;
  };

  /* ─── Schreiben ─────────────────────────────────────────── */
  const MSG = {
    conflict:        'Jemand anderes hat das gerade geändert — ihr seht jetzt den neuesten Stand. Bitte noch einmal.',
    blocked:         'Deine Lehrkraft hat dieses Tablet gerade stillgelegt.',
    no_plan:         'Euer Planungsraum ist (noch) nicht geöffnet.',
    goal_locked:     'Das Projektziel ist fixiert — nur die Lehrkraft kann es öffnen.',
    not_yours:       'Das hat jemand anderes eingetragen — ändern kann es nur diese Person.',
    decided:         'Über diesen Antrag ist schon entschieden.',
    payload_too_big: 'Das ist zu groß zum Speichern (zu viele oder zu große Bilder?).',
    quota_exceeded:  'Der Planungsraum ist voll.',
    text_blocked:    'Solche Wörter bitte nicht.',
    too_long:        'Das ist zu lang.',
    network:         'Keine Verbindung — die Änderung ist noch nicht gespeichert.',
    not_found:       'Das gibt es nicht (mehr).',
    removed:         'Du bist nicht mehr in diesem Raum.',
    fn_missing:      'Auf dem Server fehlt die Migration 0200 (Projektarbeit). Bitte der Lehrkraft Bescheid sagen.'
  };
  PA.msg = code => MSG[code] || 'Das hat nicht geklappt. Bitte noch einmal.';

  function queue(op, kind, id, data) {
    if (PA.ro) { global.toast(PA.msg('blocked')); return; }
    const k = keyOf(kind, id);
    pending[k] = { op, kind, id, data };
    if (op === 'del') delete items[k];
    else items[k] = Object.assign({}, items[k] || { kind, id, v: 0 }, { data });
    flush();
  }

  PA.put = (kind, id, data) => {
    const d = Object.assign({}, data); delete d.id;
    queue('put', kind, id, d);
  };
  PA.del = (kind, id) => queue('del', kind, id, null);

  async function flush() {
    if (inflight) return;
    const keys = Object.keys(pending);
    if (!keys.length) return;
    const batch = keys.map(k => {
      const p = pending[k];
      return { op: p.op, kind: p.kind, id: p.id, v: (view && verOf(p.kind, p.id)) || 0, data: p.data || undefined };
    }).filter(o => !(o.op === 'del' && !o.v));
    const sent = {};
    keys.forEach(k => { sent[k] = pending[k]; });
    pending = {};
    if (!batch.length) return;

    inflight = true;
    const res = PA.owner
      ? await call('pa_room_save', { p_group: PA.focus, p_ops: batch })
      : await call('pa_save', { p_ops: batch });
    inflight = false;

    if (res && res.ok) {
      (res.items || []).forEach(it => {
        const k = keyOf(it.kind, it.id);
        setVer(it.kind, it.id, it.deleted ? null : it.v, it.data);
        if (it.deleted) { if (!pending[k]) delete items[k]; return; }
        // Was der Server ergänzt (Urheber, Zeitstempel, Fixierung) übernehmen —
        // außer, auf dem Gerät ist schon die nächste Änderung unterwegs.
        if (!pending[k]) items[k] = { kind: it.kind, id: it.id, v: it.v, data: it.data };
      });
    } else {
      global.toast(PA.msg(res && res.error));
      // Den Server-Stand holen; die abgelehnte Änderung fällt weg.
      Object.keys(sent).forEach(k => { delete pending[k]; });
      deferred = null;
      if (view) apply(view);
    }
    if (Object.keys(pending).length) { flush(); return; }
    PA.render();
    PA.refresh();
    if (deferred && !typing()) offer(deferred, deferredFor);
  }

  // Versionen leben in der zuletzt gesehenen Ansicht.
  function verOf(kind, id) {
    const it = (view.items || []).find(i => i.kind === kind && i.id === id);
    return it ? it.v : 0;
  }
  function setVer(kind, id, v, data) {
    if (!view) return;
    const list = view.items || (view.items = []);
    const i = list.findIndex(x => x.kind === kind && x.id === id);
    if (v === null) { if (i >= 0) list.splice(i, 1); return; }
    if (i >= 0) { list[i].v = v; list[i].data = data; }
    else list.push({ kind, id, v, data });
  }

  /* ─── Handlungen (Lehrkraft und Team) ───────────────────── */
  // Einmalige Aufrufe ohne Versionsprüfung: Gruppen ziehen, Planungsraum
  // eröffnen, Label, Code, Regeln. Danach frisch holen.
  PA.act = async function (fn, args) {
    const res = await call(fn, args || {});
    if (!res || !res.ok) { global.toast(PA.msg(res && res.error)); PA.refresh(); return null; }
    PA.refresh();
    return res;
  };

  // Lehrkraft: Planungsraum einer Gruppe betreten (oder null = Übersicht).
  PA.setFocus = function (group) {
    if (PA.focus === group) return;
    PA.focus = group || null;
    items = {}; pending = {}; deferred = null;
    if (view) { view = Object.assign({}, view, { items: [], group: null }); }
    PA.viewFor = undefined;   // noch keine Ansicht für den neuen Raum
    if (DEMO) { PA.refresh(); return; }
    post({ type: 'focus', group: PA.focus });
  };

  PA.ownerName = function () {
    try {
      const u = global.parent.getSessionUser && global.parent.getSessionUser();
      return (u && (u.display_name || u.account_name)) || 'Lehrkraft';
    } catch (e) { return 'Lehrkraft'; }
  };

  PA.fmtKey = k => k ? String(k).slice(0, 4) + '-' + String(k).slice(4) : '';
  PA.newId  = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ─── Empfang ───────────────────────────────────────────── */
  if (EMBED) {
    global.addEventListener('message', (e) => {
      if (e.origin !== ORIGIN || e.source !== global.parent) return;
      const m = e.data;
      if (!m || m.pa !== 1) return;
      if (m.type === 'view' && m.view) {
        // Eine Ansicht für einen anderen Planungsraum (noch vom alten Takt)
        // gehört nicht hierher.
        if (m.view.role === 'presenter' && (m.focus || null) !== PA.focus) return;
        offer(m.view, m.focus || null);
      } else if (m.type === 'reply' && waiting[m.rid]) {
        const r = waiting[m.rid]; delete waiting[m.rid]; r(m.res);
      }
    });
  }

  PA.start = function () {
    if (DEMO) { offer(DEMO_SERVER.view(null), null); return; }
    post({ type: 'ready' });
  };

  /* ══════════════════════════════════════════════════════════
     DEMO — eine kleine Nachbildung des Servers (Migration 0200)
     ══════════════════════════════════════════════════════════
     Für das Schaufenster und das Öffnen ohne Raum. Spielt die
     Lehrkraft einer Beispielklasse; gerechnet wird wie auf dem
     Server, gespeichert wird nichts. */
  const DEMO_SERVER = (function () {
    const d0 = new Date(); d0.setHours(12, 0, 0, 0);
    const day = n => { const d = new Date(d0); d.setDate(d.getDate() + n);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const names = ['Mia', 'Leon', 'Emma', 'Noah', 'Hannah', 'Elias', 'Lina', 'Paul', 'Lea', 'Ben', 'Sofia', 'Finn'];
    const people = names.map((n, i) => ({ id: 'p' + (i + 1), name: n, online: i % 4 !== 3, blocked: false,
      group: null, label: '', key: ('K' + (i + 2) + 'MPQ7X' + 'ABCDEFGHJKLM'[i]).slice(0, 8) }));
    const groups = [
      { id: 'g1', no: 1, name: 'Wetterstation', plan_open: true },
      { id: 'g2', no: 2, name: 'Schulgarten-App', plan_open: true },
      { id: 'g3', no: 3, name: 'Gruppe 3', plan_open: false }
    ];
    [['p1', 'g1'], ['p2', 'g1'], ['p3', 'g1'], ['p4', 'g2'], ['p5', 'g2'], ['p6', 'g3'], ['p7', 'g3']]
      .forEach(([p, g]) => { people.find(x => x.id === p).group = g; });
    people[0].label = 'Technik'; people[1].label = 'Recherche'; people[2].label = 'Präsentation';
    let seq = 3, rev = 1, rules = 'Abgabe der Dokumentation: Freitag in drei Wochen.\nPro Stunde trägt jede Person ihren Eintrag ins Stundenprotokoll ein.';
    const store = { g1: {}, g2: {}, g3: {} };
    const put = (g, kind, id, data) => { store[g][kind + ':' + id] = { kind, id, v: 1, data }; };

    put('g1', 'goal', 'main', { title: 'Unsere Schul-Wetterstation', locked: false, images: [],
      text: '<h2>Was wollen wir erreichen?</h2><p>Wir bauen eine <strong>Wetterstation</strong> für den Schulhof, die Temperatur, Luftfeuchte und Luftdruck misst und die Werte auf einer Webseite zeigt.</p><h2>Für wen?</h2><p>Für alle Klassen der Schule — am Ende soll jede:r am Tablet sehen, wie das Wetter auf dem Schulhof ist.</p><ul><li>Funktionierende Messstation</li><li>Webseite mit Diagramm</li><li>Präsentation vor der Klasse</li></ul>' });
    [['t1', 'Sensoren recherchieren', 'done', ['p2']], ['t2', 'Gehäuse entwerfen', 'doing', ['p1']],
     ['t3', 'Webseite: Diagramm', 'todo', ['p3']], ['t4', 'Lötkolben besorgen', 'blocked', ['p1'], 'Lötstation im Technikraum defekt — Antrag gestellt.'],
     ['t5', 'Messwerte eine Woche sammeln', 'todo', []], ['t6', 'Präsentation gliedern', 'doing', ['p3', 'p2']]]
      .forEach(([id, title, col, who, note], i) => put('g1', 'task', id,
        { title, col, who, note: note || '', text: '', color: ['yellow', 'blue', 'green', 'pink', 'lilac', 'yellow'][i], order: i }));
    [[-2, 'p1', 'Gehäuse skizziert, Maße vom Sensor genommen.', 'Skizze in Tinkercad übertragen.'],
     [-2, 'p2', 'Drei Sensoren verglichen und den BME280 ausgewählt.', 'Bestellung mit der Lehrkraft klären.'],
     [-2, 'p3', 'Webseiten-Vorlage angelegt.', 'Diagramm-Bibliothek ausprobieren.'],
     [0, 'p1', 'Gehäuse in Tinkercad modelliert.', 'Drucken lassen.'],
     [0, 'p2', 'Gliederung der Präsentation mit Emma.', '']]
      .forEach(([off, by, text, next], i) => put('g1', 'log', 'l' + i,
        { date: day(off), by, byName: people.find(p => p.id === by).name, text, next, hours: 1, at: day(off) + 'T10:00:00Z' }));
    put('g1', 'request', 'r1', { type: 'material', title: 'Lötstation ausleihen', text: 'Die Lötstation im Technikraum ist defekt. Dürfen wir die aus der Physiksammlung ausleihen?',
      status: 'open', by: 'p1', byName: 'Mia', at: day(0) + 'T09:12:00Z' });
    put('g1', 'request', 'r0', { type: 'material', title: 'Sensor BME280 bestellen', text: 'Kostet ca. 8 €.',
      status: 'approved', decision: 'Bestelle ich heute. Kommt bis Montag.', by: 'p2', byName: 'Leon', at: day(-2) + 'T10:40:00Z', decidedAt: day(-2) + 'T12:00:00Z' });
    put('g2', 'goal', 'main', { title: 'Schulgarten-App', locked: true, images: [], text: '<p>Eine App, die zeigt, welche Beete gegossen werden müssen.</p>' });
    put('g2', 'task', 'a1', { title: 'Beete kartieren', col: 'doing', who: ['p4'], note: '', text: '', color: 'green', order: 0 });
    put('g2', 'request', 'q1', { type: 'place', title: 'In den Schulgarten gehen', text: 'Wir möchten die Beete fotografieren.', status: 'open', by: 'p5', byName: 'Hannah', at: day(0) + 'T08:30:00Z' });

    const bump = () => { rev++; };
    const tidy = g => {
      const grp = groups.find(x => x.id === g); if (!grp || grp.plan_open) return;
      const m = people.filter(p => p.group === g);
      if (m.length <= 1) { m.forEach(p => { p.group = null; }); groups.splice(groups.indexOf(grp), 1); delete store[g]; }
    };
    const newGroup = (name, plan) => {
      const g = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        no: name === '' ? 0 : ++seq, name: name === '' ? '' : 'Gruppe ' + seq, plan_open: !!plan };
      groups.push(g); store[g.id] = {}; return g;
    };
    const stats = g => {
      const it = Object.values(store[g.id] || {});
      const t = it.filter(i => i.kind === 'task');
      const c = k => t.filter(i => i.data.col === k).length;
      const goal = it.find(i => i.kind === 'goal');
      return Object.assign({}, g, {
        open_requests: it.filter(i => i.kind === 'request' && (i.data.status || 'open') === 'open').length,
        tasks: { todo: c('todo'), blocked: c('blocked'), doing: c('doing'), done: c('done') },
        logs_today: it.filter(i => i.kind === 'log' && i.data.date === day(0)).length,
        title: goal ? goal.data.title : null
      });
    };
    const membersOf = g => people.filter(p => p.group === g)
      .map(p => ({ id: p.id, name: p.name, label: p.label, online: p.online, me: false, key: p.key }));

    function view(focus) {
      const g = focus && groups.find(x => x.id === focus);
      return JSON.parse(JSON.stringify({
        ok: true, role: 'presenter', rev,
        room: { title: 'Klasse 8b · Projektwoche', join_open: true, rules },
        me: { id: null, name: 'Lehrkraft' },
        people, groups: groups.map(stats),
        group: g ? Object.assign({}, g, { members: membersOf(g.id) }) : null,
        items: g ? Object.values(store[g.id]) : []
      }));
    }

    function call(fn, a) {
      const R = (x) => JSON.parse(JSON.stringify(x));
      if (fn === 'pa_room_assign') {
        const p = people.find(x => x.id === a.p_participant); if (!p) return { ok: false, error: 'not_found' };
        const old = p.group; let target = a.p_group || null;
        if (a.p_with) {
          const w = people.find(x => x.id === a.p_with);
          if (!w || w === p) return { ok: false, error: 'not_found' };
          if (!w.group) { const g = newGroup('Gruppe'); w.group = g.id; }
          target = w.group;
        } else if (target) {
          const g = groups.find(x => x.id === target);
          if (!g) return { ok: false, error: 'not_found' };
          if (g.no === 0) { g.no = ++seq; g.name = 'Gruppe ' + seq; }
        }
        if (target === old) return { ok: true, group: target };
        p.group = target; tidy(old); bump();
        return { ok: true, group: target };
      }
      if (fn === 'pa_room_plan') {
        let g = a.p_group;
        if (!g && a.p_participant) {
          const p = people.find(x => x.id === a.p_participant);
          if (!p) return { ok: false, error: 'not_found' };
          if (!p.group) { const ng = newGroup('', true); p.group = ng.id; }
          g = p.group;
        }
        const grp = groups.find(x => x.id === g); if (!grp) return { ok: false, error: 'not_found' };
        grp.plan_open = true; bump();
        return { ok: true, group: g };
      }
      if (fn === 'pa_room_group_rename') {
        const g = groups.find(x => x.id === a.p_group); if (!g) return { ok: false, error: 'not_found' };
        g.name = String(a.p_name || '').trim().slice(0, 40); bump(); return { ok: true };
      }
      if (fn === 'pa_room_group_delete') {
        const g = groups.find(x => x.id === a.p_group); if (!g) return { ok: false, error: 'not_found' };
        people.forEach(p => { if (p.group === g.id) p.group = null; });
        groups.splice(groups.indexOf(g), 1); delete store[g.id]; bump(); return { ok: true };
      }
      if (fn === 'pa_room_rules') { rules = String(a.p_rules || '').trim(); bump(); return { ok: true }; }
      if (fn === 'pa_room_rekey') {
        const p = people.find(x => x.id === a.p_participant); if (!p) return { ok: false, error: 'not_found' };
        p.key = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[01IO]/g, 'X');
        bump(); return { ok: true, key: p.key };
      }
      if (fn === 'pa_room_member_update') {
        const p = people.find(x => x.id === a.p_participant); if (!p) return { ok: false, error: 'not_found' };
        p.label = String(a.p_label || '').trim().slice(0, 40); bump(); return { ok: true };
      }
      if (fn === 'pa_room_save') {
        const st = store[a.p_group]; if (!st) return { ok: false, error: 'not_found' };
        for (const o of a.p_ops) {
          const cur = st[o.kind + ':' + o.id];
          if ((cur ? cur.v : 0) !== o.v) return { ok: false, error: 'conflict' };
        }
        const out = [];
        a.p_ops.forEach(o => {
          const k = o.kind + ':' + o.id, cur = st[k];
          if (o.op === 'del') { delete st[k]; out.push({ kind: o.kind, id: o.id, deleted: true }); return; }
          const data = R(o.data);
          if ((o.kind === 'log' || o.kind === 'request') && !cur) { data.at = new Date().toISOString(); if (!('by' in data)) { data.by = null; data.byName = 'Lehrkraft'; } }
          if (o.kind === 'request' && ['approved', 'rejected'].includes(data.status) && (!cur || cur.data.status !== data.status)) data.decidedAt = new Date().toISOString();
          st[k] = { kind: o.kind, id: o.id, v: (cur ? cur.v : 0) + 1, data };
          out.push(R(st[k]));
        });
        bump();
        return { ok: true, items: out };
      }
      return { ok: false, error: 'not_allowed' };
    }

    return { view, call };
  })();

  global.PA = PA;
})(window);
