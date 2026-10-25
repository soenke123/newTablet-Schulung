/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/app.js   ·   Die Anwendung
   ══════════════════════════════════════════════════════════════
   Links die Datenbanken, rechts vier Reiter: SQL · Daten · Struktur
   · Diagramm (js/panes.js).

   Adresse (vom Rahmen in MPSkills, tool.js):
     ?raum=CODE      Speicherplatz je Raum (sonst „solo")
     &rolle=presenter|participant
     &rechte=use|modify|create   zum Ausprobieren

   ── Drei Betriebsarten ────────────────────────────────────────
   local    ohne Raum (index.html allein): alles im Gerät, wie Etappe 1.
   teacher  Lehrkraft im Raum. Vorlagen als Kopie im Gerät (IndexedDB),
            eigene Datenbanken in ihrem Konto (sql_databases, 0221),
            Teilen/Entziehen mit Recht je Datenbank und der Schalter
            „eigene Datenbanken erlauben" (skill_room_state.data),
            dazu die Kopien der Klasse zum Ansehen.
   student  Schüler im Raum: nur, was geteilt ist, plus eigene
            Datenbanken, wenn die Lehrkraft sie erlaubt. Jede Änderung
            landet als Kopie im Raum (sql_work).

   Den Server erreicht die App nur über den Rahmen (Bridge unten →
   tool.js → ctx.actions.call). Die Rechte setzt js/core.js bei jeder
   Anweisung durch; der Server prüft, wer was speichern und holen darf.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const { $, esc, icon, toast, dialog, confirm, download } = window.SQLUI;

  const V = '20261023c';
  const SAMPLES = [
    { key: 'haustiere',  title: 'Haustiere',   blurb: 'Einstieg: zwei Tabellen, ein Fremdschlüssel' },
    { key: 'schule',     title: 'Schule',      blurb: 'Klassen, Schüler, Lehrkräfte, Noten' },
    { key: 'bibliothek', title: 'Bibliothek',  blurb: 'Bücher, Autoren (n:m), Ausleihen' },
    { key: 'shop',       title: 'Online-Shop', blurb: 'Kunden, Produkte, Bestellungen' }
  ];

  const RIGHTS = {
    use:    { label: 'Abfragen', long: 'Daten abfragen und ändern (SELECT, INSERT, UPDATE, DELETE)' },
    modify: { label: 'Struktur', long: 'zusätzlich Tabellen anlegen und ändern (CREATE, ALTER, DROP)' },
    create: { label: 'Alles',    long: 'zusätzlich eigene Datenbanken anlegen' }
  };

  const ERR = {
    not_shared: 'Diese Datenbank ist nicht (mehr) freigegeben.',
    create_off: 'Eigene Datenbanken sind in diesem Raum gerade nicht freigegeben.',
    name_taken: 'Eine Datenbank mit diesem Namen gibt es schon.',
    invalid_name: 'Dieser Name geht nicht (Buchstaben ohne Umlaute, Ziffern, _).',
    invalid_input: 'Damit stimmt etwas nicht.',
    payload_too_big: 'Die Datenbank ist zu groß zum Speichern (höchstens 1,5 MB).',
    quota_exceeded: 'Mehr Datenbanken gehen nicht.',
    not_found: 'Das gibt es nicht (mehr).',
    network: 'Keine Verbindung zum Server.',
    fn_missing: 'Dem Server fehlt die neueste Migration (0221) — bitte einspielen.',
    server_error: 'Der Server hat abgelehnt (Einzelheiten in der Konsole).',
    not_authenticated: 'Du bist nicht mehr angemeldet. Lade die Seite neu.',
    not_a_teacher: 'Dein Konto ist nicht als Lehrkraft freigeschaltet.',
    unknown_token: 'Dieser Raum gehört nicht mehr zu diesem Gerät. Lade die Seite neu.',
    room_gone: 'Diesen Raum gibt es nicht mehr.',
    blocked: 'Deine Lehrkraft hat dieses Tablet gerade stillgelegt.',
    not_allowed: 'Das darfst du hier nicht.'
  };
  const errText = e => ERR[e] || ('Unerwarteter Fehler (' + e + ').');

  /* ─── Zustand ────────────────────────────────────────────── */
  const qs = new URLSearchParams(location.search);
  /* Schaufenster (MPSkills/preview/sqlstudio.js, ?demo=1): wie allein,
     aber nichts bleibt im Gerät — kein IndexedDB, kein localStorage. */
  const DEMO = qs.get('demo') === '1';
  const S = {
    scope: DEMO ? 'demo' : (qs.get('raum') || 'solo').slice(0, 20),
    role: qs.get('rolle') || 'solo',
    mode: 'local',
    rights: RIGHTS[qs.get('rechte')] ? qs.get('rechte') : 'create',
    local: [],         // IndexedDB-Einträge (Vorlagen-Kopien, eigene im Gerät)
    srv: [],           // Lehrkraft: eigene Datenbanken auf dem Server
    mine: [],          // Schüler: eigene Kopien auf dem Server
    klass: null,       // Lehrkraft: Kopien der Klasse (null = noch nicht geladen)
    room: { shared: [], create: false },
    cur: null,
    schema: { tables: [], views: [], triggers: [] },
    tab: 'sql',
    table: null,
    busy: false,
    started: false
  };
  try {
    const t = sessionStorage.getItem('sqls.rechte.' + S.scope);
    if (t && RIGHTS[t] && !qs.get('rechte')) S.rights = t;
  } catch (e) { /* egal */ }

  const LV = { use: 1, modify: 2, create: 3 };
  const ls = {
    get(k) { if (DEMO) return null; try { return localStorage.getItem('sqls.' + k + '.' + S.scope); } catch (e) { return null; } },
    set(k, v) { if (DEMO) return; try { localStorage.setItem('sqls.' + k + '.' + S.scope, v); } catch (e) { /* egal */ } }
  };

  const toB64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = (b) => {
    const s = atob(b || '');
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9_]+/g, '_').replace(/^[^A-Za-z]+/, '').replace(/_+$/, '').slice(0, 40) || 'db';
  const validName = n => /^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(n);
  const randKey = () => 'own:' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  const hhmm = t => { try { const d = new Date(t); return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  /* ─── Brücke zum Rahmen (tool.js) ────────────────────────── */
  const Bridge = (function () {
    const inFrame = window.parent !== window;
    const active = inFrame && !DEMO && !!qs.get('raum') && (S.role === 'presenter' || S.role === 'participant');
    let seq = 0;
    const wait = new Map();
    let cb = null, data = null, got = false;
    const waiters = [];
    window.addEventListener('message', (ev) => {
      if (ev.source !== window.parent || ev.origin !== location.origin) return;
      const m = ev.data;
      if (!m || typeof m.type !== 'string') return;
      if (m.type === 'sqls:result') {
        const w = wait.get(m.id);
        if (w) { wait.delete(m.id); clearTimeout(w.t); w.res(m.res && typeof m.res === 'object' ? m.res : { ok: false, error: 'bad_response' }); }
      } else if (m.type === 'sqls:state') {
        data = m.data && typeof m.data === 'object' ? m.data : {};
        got = true;
        waiters.splice(0).forEach(f => f());
        if (cb) cb(data);
      }
    });
    const send = (msg) => { try { window.parent.postMessage(msg, location.origin); } catch (e) { /* zu */ } };
    const req = (msg) => new Promise((res) => {
      if (!active) { res({ ok: false, error: 'network' }); return; }
      const id = ++seq;
      const t = setTimeout(() => { wait.delete(id); res({ ok: false, error: 'network' }); }, 30000);
      wait.set(id, { res, t });
      send(Object.assign({ id }, msg));
    });
    return {
      active,
      call: (fn, args) => req({ type: 'sqls:call', fn, args: args || {} }),
      setData: (d) => req({ type: 'sqls:setData', data: d }),
      onState(f) { cb = f; },
      hello() { if (active) send({ type: 'sqls:hello' }); },
      get data() { return data || {}; },
      waitState(ms) { return got ? Promise.resolve() : new Promise(r => { waiters.push(r); setTimeout(r, ms); }); }
    };
  })();
  S.mode = Bridge.active ? (S.role === 'presenter' ? 'teacher' : 'student') : 'local';
  const canTest = S.mode !== 'student';

  function normRoom(d) {
    const shared = Array.isArray(d && d.shared) ? d.shared.filter(x => x && typeof x.id === 'string')
      .map(x => ({ id: x.id, t: String(x.t || x.id).slice(0, 80), r: x.r === 'modify' ? 'modify' : 'use' })) : [];
    return { shared, create: !!(d && d.create === true) };
  }

  /* ─── Rechte der offenen Datenbank ───────────────────────── */
  function eff() {
    const c = S.cur;
    if (!c || c.kind === 'none') return { rights: 'use', createDb: S.mode === 'student' ? S.room.create : S.rights === 'create', readOnly: true };
    if (c.kind === 'peek') return { rights: 'use', createDb: false, readOnly: true };
    if (S.mode === 'student') {
      if (c.kind === 'shared') return { rights: c.r === 'modify' ? 'modify' : 'use', createDb: S.room.create, readOnly: false };
      if (c.kind === 'mine') return { rights: 'modify', createDb: S.room.create, readOnly: !S.room.create };
    }
    return { rights: S.rights, createDb: S.rights === 'create', readOnly: false };
  }
  function can(r) {
    const e = eff();
    if (r === 'create') return e.createDb;
    if (e.readOnly) return false;
    return LV[e.rights] >= LV[r];
  }

  /* ─── Hell / Dunkel wie die Seite drumherum ──────────────── */
  function syncTheme() {
    let pd = null;
    try { pd = window.parent !== window ? window.parent.document.documentElement : null; } catch (e) { pd = null; }
    if (!pd) return;
    const apply = () => {
      const t = pd.getAttribute('data-theme');
      if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
      else document.documentElement.removeAttribute('data-theme');
      window.SQLPanes && window.SQLPanes.diagram.onTheme();
    };
    apply();
    try { new MutationObserver(apply).observe(pd, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* egal */ }
  }
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => window.SQLPanes && window.SQLPanes.diagram.onTheme());
  } catch (e) { /* alt */ }

  /* ─── Speichern auf den Server (gebündelt) ───────────────── */
  const saver = (function () {
    let pending = null, timer = 0, busy = null;
    function status(s, msg) {
      const el = $('#saveState');
      if (!el) return;
      el.hidden = S.mode === 'local' || !S.cur || ['copy', 'own', 'peek', 'none'].includes(S.cur.kind);
      el.className = 'save save--' + s;
      el.title = msg || '';
      el.innerHTML = s === 'saved' ? icon('check') + '<span>Gespeichert</span>'
        : s === 'saving' ? '<span class="spin"></span><span>Speichert …</span>'
        : s === 'dirty' ? '<span class="dot"></span><span>Ungespeichert</span>'
        : icon('warn') + '<span>Nicht gespeichert</span>';
    }
    async function upload(rec, bytes) {
      const content = toB64(bytes);
      if (rec.kind === 'srv') return Bridge.call('sql_db_save', { p_id: rec.uuid, p_name: rec.name, p_content: content, p_layout: null });
      if (rec.kind === 'shared') return Bridge.call('sql_mine_put', { p_key: rec.key, p_name: rec.title, p_content: content });
      if (rec.kind === 'mine') return Bridge.call('sql_mine_put', { p_key: rec.key, p_name: rec.name, p_content: content });
      return { ok: true };
    }
    async function flush() {
      clearTimeout(timer); timer = 0;
      if (busy) await busy;
      const p = pending;
      if (!p) return true;
      pending = null;
      status('saving');
      let done;
      busy = new Promise(r => { done = r; });
      const res = await upload(p.rec, p.bytes);
      busy = null; done();
      if (res.ok) {
        if (p.rec.kind === 'shared' || p.rec.kind === 'mine') {
          const m = S.mine.find(x => x.key === p.rec.key);
          if (m) m.updated_at = res.updated_at; else S.mine.push({ key: p.rec.key, name: p.rec.kind === 'mine' ? p.rec.name : p.rec.title, size: p.bytes.length });
          p.rec.dirty = true;
        }
        status(pending ? 'dirty' : 'saved');
        return true;
      }
      const retry = ['network', 'server_error', 'bad_response'].includes(res.error);
      if (retry) {
        if (!pending) pending = p;
        timer = setTimeout(flush, 5000);
      }
      status('error', errText(res.error));
      if (!retry || !p.warned) toast('Nicht gespeichert: ' + errText(res.error), 'error');
      p.warned = true;
      return false;
    }
    return {
      queue(rec, bytes) {
        pending = { rec, bytes };
        status('dirty');
        clearTimeout(timer);
        timer = setTimeout(flush, 1200);
      },
      flush,
      drop(rec) { if (pending && (!rec || pending.rec.id === rec.id)) pending = null; status('saved'); },
      status,
      get pending() { return !!pending; }
    };
  })();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saver.flush(); });
  window.addEventListener('pagehide', () => saver.flush());

  /* ─── Listen laden ───────────────────────────────────────── */
  const sysId = key => S.scope + '|sys:' + key;

  async function reloadLocal() { S.local = await window.SQLStore.list(S.scope); }

  async function loadSrv() {
    const r = await Bridge.call('sql_dbs_list', {});
    if (r.ok) S.srv = r.items || [];
    else toast('Eigene Datenbanken: ' + errText(r.error), 'error');
  }
  async function loadMine() {
    const r = await Bridge.call('sql_mine_list', {});
    if (r.ok) S.mine = r.items || [];
    else toast(errText(r.error), 'error');
  }
  async function loadClass() {
    const r = await Bridge.call('sql_class_list', {});
    S.klass = r.ok ? (r.items || []) : [];
    if (!r.ok) toast('Klasse: ' + errText(r.error), 'error');
    renderSide();
  }

  /* Etappe 1 legte eigene Datenbanken ins Gerät. Eine Lehrkraft hat
     sie ab jetzt im Konto — einmal hochladen und im Gerät löschen. */
  async function migrateLocalOwns() {
    const owns = S.local.filter(r => r.kind === 'own');
    let n = 0;
    for (const o of owns) {
      const rec = await window.SQLStore.get(o.id);
      if (!rec || !rec.bytes) continue;
      let name = rec.name;
      for (let i = 2; S.srv.some(d => d.name.toLowerCase() === name.toLowerCase()); i++) name = rec.name.slice(0, 36) + '_' + i;
      const r = await Bridge.call('sql_db_save', { p_id: null, p_name: name, p_content: toB64(rec.bytes), p_layout: rec.layout || null });
      if (r.ok) { await window.SQLStore.remove(o.id); n++; S.srv.push({ id: r.id, name }); }
    }
    if (n) { await reloadLocal(); toast(n + (n === 1 ? ' Datenbank' : ' Datenbanken') + ' aus diesem Gerät in dein Konto übernommen.'); }
  }

  /* Was links steht, je Betriebsart — und was USE findet. */
  function items() {
    const out = [];
    if (S.mode !== 'student') {
      SAMPLES.forEach(s => {
        const rec = S.local.find(r => r.id === sysId(s.key));
        out.push({ id: 'sample:' + s.key, kind: 'copy', name: s.key, title: s.title, meta: s.blurb, dirty: !!(rec && rec.dirty), group: 'tpl', share: 'builtin:' + s.key });
      });
    }
    if (S.mode === 'local') {
      S.local.filter(r => r.kind === 'own').forEach(r => out.push({ id: r.id, kind: 'own', name: r.name, title: r.name, group: 'own' }));
    } else if (S.mode === 'teacher') {
      S.srv.forEach(d => out.push({ id: 'srv:' + d.id, kind: 'srv', uuid: d.id, name: d.name, title: d.name, group: 'own', share: d.id }));
    } else {
      S.room.shared.forEach(x => {
        const name = x.id.startsWith('builtin:') ? x.id.slice(8) : slug(x.t);
        out.push({ id: 'sh:' + x.id, kind: 'shared', key: x.id, name, title: x.t, r: x.r, group: 'shared',
                   dirty: S.mine.some(m => m.key === x.id) });
      });
      S.mine.filter(m => m.key.startsWith('own:')).forEach(m => out.push({ id: 'mine:' + m.key, kind: 'mine', key: m.key, name: m.name, title: m.name, group: 'own' }));
    }
    return out;
  }

  function findByName(name) {
    const n = String(name).toLowerCase();
    return items().find(i => i.name.toLowerCase() === n || i.title.toLowerCase() === n) || null;
  }
  function nameTaken(name, exceptId) {
    const n = name.toLowerCase();
    return items().some(i => i.id !== exceptId && i.name.toLowerCase() === n) || SAMPLES.some(s => s.key === n);
  }

  /* ─── Öffnen ─────────────────────────────────────────────── */
  async function sampleScript(key) {
    const res = await fetch('data/' + key + '.sql?v=' + V);
    if (!res.ok) throw new Error('Vorlage ' + key + ' nicht gefunden');
    return res.text();
  }
  async function buildSample(key) {
    return window.SQLWorker.open(null, await sampleScript(key));
  }
  const lsLayout = id => { try { return JSON.parse(ls.get('layout.' + id) || 'null'); } catch (e) { return null; } };

  async function openSample(key) {
    const id = sysId(key);
    let rec = await window.SQLStore.get(id);
    if (rec && rec.bytes) {
      const r = await window.SQLWorker.open(rec.bytes);
      return setCurrent({ id: 'sample:' + key, store: id, kind: 'copy', base: key, name: key, title: (SAMPLES.find(s => s.key === key) || {}).title, layout: rec.layout, dirty: rec.dirty }, r.schema);
    }
    const r = await buildSample(key);
    rec = { id, scope: S.scope, kind: 'copy', base: key, name: key, bytes: r.bytes, dirty: false, layout: null, created: Date.now() };
    await window.SQLStore.put(rec);
    await reloadLocal();
    setCurrent({ id: 'sample:' + key, store: id, kind: 'copy', base: key, name: key, title: (SAMPLES.find(s => s.key === key) || {}).title, layout: null }, r.schema);
  }

  async function openLocalOwn(id) {
    const rec = await window.SQLStore.get(id);
    if (!rec) throw new Error('Diese Datenbank gibt es nicht mehr.');
    const r = await window.SQLWorker.open(rec.bytes);
    setCurrent({ id, store: id, kind: 'own', name: rec.name, title: rec.name, layout: rec.layout }, r.schema);
  }

  async function openSrv(uuid) {
    const res = await Bridge.call('sql_db_get', { p_id: uuid });
    if (!res.ok) throw new Error(errText(res.error));
    const r = await window.SQLWorker.open(fromB64(res.content));
    setCurrent({ id: 'srv:' + uuid, kind: 'srv', uuid, name: res.name, title: res.name, layout: res.layout }, r.schema);
  }

  async function openShared(key) {
    const x = S.room.shared.find(e => e.id === key);
    if (!x) throw new Error(ERR.not_shared);
    let r, fromCopy = false;
    if (S.mine.some(m => m.key === key)) {
      const res = await Bridge.call('sql_mine_get', { p_key: key });
      if (res.ok) { r = await window.SQLWorker.open(fromB64(res.content)); fromCopy = true; }
    }
    if (!r) {
      if (key.startsWith('builtin:')) r = await buildSample(key.slice(8));
      else {
        const res = await Bridge.call('sql_shared_get', { p_id: key });
        if (!res.ok) throw new Error(errText(res.error));
        r = await window.SQLWorker.open(fromB64(res.content));
      }
    }
    const id = 'sh:' + key;
    setCurrent({ id, kind: 'shared', key, r: x.r, name: key.startsWith('builtin:') ? key.slice(8) : slug(x.t), title: x.t,
                 layout: lsLayout(id), dirty: fromCopy }, r.schema);
  }

  async function openMine(key) {
    const res = await Bridge.call('sql_mine_get', { p_key: key });
    if (!res.ok) throw new Error(errText(res.error));
    const r = await window.SQLWorker.open(fromB64(res.content));
    const id = 'mine:' + key;
    setCurrent({ id, kind: 'mine', key, name: res.name, title: res.name, layout: lsLayout(id) }, r.schema);
  }

  async function openPeek(pid, key) {
    const res = await Bridge.call('sql_class_get', { p_participant: pid, p_key: key });
    if (!res.ok) throw new Error(errText(res.error));
    const w = (S.klass || []).find(x => x.participant === pid && x.key === key) || {};
    const r = await window.SQLWorker.open(fromB64(res.content));
    const id = 'peek:' + pid + ':' + key;
    setCurrent({ id, kind: 'peek', pid, key, name: slug(res.name), title: (w.person || 'Kopie') + ' · ' + res.name,
                 person: w.person, layout: lsLayout(id) }, r.schema);
  }

  async function openNone() {
    const r = await window.SQLWorker.open(null, '-- leer');
    setCurrent({ id: 'none', kind: 'none', name: '', title: '' }, r.schema);
  }

  async function openId(id) {
    if (S.busy) return;
    await saver.flush();
    try {
      if (id.startsWith('sample:')) await openSample(id.slice(7));
      else if (id.startsWith('srv:')) await openSrv(id.slice(4));
      else if (id.startsWith('sh:')) await openShared(id.slice(3));
      else if (id.startsWith('mine:')) await openMine(id.slice(5));
      else if (id.startsWith('peek:')) { const [, pid, ...k] = id.split(':'); await openPeek(pid, k.join(':')); }
      else if (id === 'none') await openNone();
      else await openLocalOwn(id);
      return true;
    } catch (e) {
      console.error(e);
      toast('Öffnen hat nicht geklappt: ' + e.message, 'error');
      return false;
    }
  }

  async function openDefault() {
    const list = items();
    const last = ls.get('last');
    if (last && list.some(i => i.id === last) && await openId(last)) return;
    if (S.mode === 'student') {
      const first = list[0];
      if (first && await openId(first.id)) return;
      return openNone();
    }
    await openId('sample:haustiere');
  }

  function setCurrent(meta, schema) {
    S.cur = meta;
    S.schema = schema;
    S.table = null;
    if (meta.kind !== 'none' && meta.kind !== 'peek') ls.set('last', meta.id);
    document.body.classList.toggle('no-db', meta.kind === 'none');
    renderSide();
    renderHead();
    saver.status('saved');
    window.SQLPanes.onDb();
    closeSide();
  }

  /* ─── Speichern ──────────────────────────────────────────── */
  async function persist(bytes) {
    const c = S.cur;
    if (!c) return;
    window.SQLWorker.remember(bytes);
    if (c.kind === 'copy' || c.kind === 'own') {
      await window.SQLStore.patch(c.store, { bytes, dirty: true });
      c.dirty = true;
      const m = S.local.find(r => r.id === c.store);
      if (m) m.dirty = true;
    } else if (c.kind === 'srv' || c.kind === 'shared' || c.kind === 'mine') {
      saver.queue(c, bytes);
    }
  }

  let layoutTimer = 0;
  async function saveLayout(layout) {
    const c = S.cur;
    if (!c) return;
    c.layout = layout;
    if (c.kind === 'copy' || c.kind === 'own') { await window.SQLStore.patch(c.store, { layout }); return; }
    if (c.kind === 'srv') {
      clearTimeout(layoutTimer);
      layoutTimer = setTimeout(() => Bridge.call('sql_db_save', { p_id: c.uuid, p_name: c.name, p_content: null, p_layout: layout }), 1500);
      return;
    }
    ls.set('layout.' + c.id, JSON.stringify(layout));
  }

  /* ─── Anlegen, kopieren, umbenennen, löschen ─────────────── */
  async function createOwn(name, bytes) {
    if (!bytes) bytes = (await window.SQLWorker.open(null, '-- leer')).bytes;
    if (S.mode === 'local') {
      const id = S.scope + '|own:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await window.SQLStore.put({ id, scope: S.scope, kind: 'own', name, bytes, dirty: true, layout: null, created: Date.now() });
      await reloadLocal();
      await openLocalOwn(id);
      return true;
    }
    if (S.mode === 'teacher') {
      const r = await Bridge.call('sql_db_save', { p_id: null, p_name: name, p_content: toB64(bytes), p_layout: null });
      if (!r.ok) { toast(errText(r.error), 'error'); return false; }
      S.srv.push({ id: r.id, name, size: bytes.length });
      S.srv.sort((a, b) => a.name.localeCompare(b.name));
      await openSrv(r.id);
      return true;
    }
    if (!S.room.create) { toast(ERR.create_off, 'error'); return false; }
    const key = randKey();
    const r = await Bridge.call('sql_mine_put', { p_key: key, p_name: name, p_content: toB64(bytes) });
    if (!r.ok) { toast(errText(r.error), 'error'); return false; }
    S.mine.push({ key, name, size: bytes.length });
    await openMine(key);
    return true;
  }

  async function askName(title, value, label, exceptId) {
    return dialog({
      title,
      body: '<label class="fld"><span>Name der Datenbank</span>' +
            '<input name="n" value="' + esc(value || '') + '" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus></label>' +
            '<p class="dlg-note">Buchstaben, Ziffern und _ — so heißt sie auch in <code>USE name;</code></p>',
      buttons: [{ label: 'Abbrechen', value: null }, { label: label || 'Anlegen', kind: 'primary', submit: true, value: f => f.n.value.trim() }],
      validate: (f) => {
        const n = f.n.value.trim();
        if (!validName(n)) return 'Der Name darf nur Buchstaben (ohne Umlaute), Ziffern und _ enthalten und muss mit einem Buchstaben beginnen.';
        if (nameTaken(n, exceptId)) return 'Eine Datenbank mit diesem Namen gibt es schon.';
        return null;
      }
    });
  }

  async function newDb() {
    if (!canNew()) return;
    const n = await askName('Neue Datenbank', '', 'Anlegen');
    if (!n) return;
    await saver.flush();
    if (await createOwn(n, null)) {
      window.SQLPanes.switchTab('struct');
      toast('Datenbank »' + n + '« angelegt.');
    }
  }

  // Neue eigene Datenbank: Schüler nur mit „create" im Raum, Lehrkraft
  // und allein je nach „Rechte ausprobieren".
  const canNew = () => S.mode === 'student' ? S.room.create : S.rights === 'create';
  const canDuplicate = () => S.cur && S.cur.kind !== 'none' && canNew();

  async function duplicate() {
    if (!canDuplicate()) return;
    const n = await askName('Als eigene Datenbank kopieren', slug(S.cur.name + '_kopie'), 'Kopieren');
    if (!n) return;
    await saver.flush();
    const bytes = await window.SQLWorker.call('export');
    const layout = S.cur.layout;
    if (await createOwn(n, bytes)) {
      if (layout) await saveLayout(layout);
      toast('Kopie »' + n + '« angelegt.');
    }
  }

  async function renameDb() {
    const c = S.cur;
    if (!c || !['own', 'srv', 'mine'].includes(c.kind)) return;
    const n = await askName('Datenbank umbenennen', c.name, 'Umbenennen', c.id);
    if (!n) return;
    if (c.kind === 'own') {
      await window.SQLStore.patch(c.store, { name: n });
      await reloadLocal();
    } else if (c.kind === 'srv') {
      const r = await Bridge.call('sql_db_save', { p_id: c.uuid, p_name: n, p_content: null, p_layout: null });
      if (!r.ok) { toast(errText(r.error), 'error'); return; }
      const d = S.srv.find(x => x.id === c.uuid);
      if (d) d.name = n;
      // Ist sie geteilt, zieht der Name in der Klasse mit.
      if (S.room.shared.some(x => x.id === c.uuid)) await setShare(c.uuid, n, S.room.shared.find(x => x.id === c.uuid).r);
    } else {
      await saver.flush();
      const bytes = await window.SQLWorker.call('export');
      const r = await Bridge.call('sql_mine_put', { p_key: c.key, p_name: n, p_content: toB64(bytes) });
      if (!r.ok) { toast(errText(r.error), 'error'); return; }
      const m = S.mine.find(x => x.key === c.key);
      if (m) m.name = n;
    }
    c.name = n; c.title = n;
    renderSide(); renderHead();
  }

  async function deleteDb(it, ask) {
    if (!it || !['own', 'srv', 'mine'].includes(it.kind)) return false;
    const where = it.kind === 'own' ? 'auf diesem Gerät' : it.kind === 'srv' ? 'aus deinem Konto' : 'aus dem Raum';
    if (ask !== false && !(await confirm('Datenbank löschen?', 'Die Datenbank <b>' + esc(it.title || it.name) + '</b> mit allen Tabellen und Daten wird ' + where + ' gelöscht. Das lässt sich nicht rückgängig machen.' +
        (it.kind === 'srv' && S.room.shared.some(x => x.id === it.uuid) ? '<br><br>Sie ist mit der Klasse geteilt und verschwindet dort auch.' : ''), 'Löschen', 'danger'))) return false;
    if (S.cur && S.cur.id === it.id) saver.drop(S.cur);
    if (it.kind === 'own') {
      await window.SQLStore.remove(it.store || it.id);
      await reloadLocal();
    } else if (it.kind === 'srv') {
      // Erst aus der Klasse nehmen: kommt die zweite Antwort nicht an,
      // bleibt sonst ein toter Eintrag auf den Tablets stehen.
      if (S.room.shared.some(x => x.id === it.uuid)) await setShare(it.uuid, null, null);
      const r = await Bridge.call('sql_db_delete', { p_id: it.uuid });
      if (!r.ok && r.error !== 'not_found') { toast(errText(r.error), 'error'); return false; }
      S.srv = S.srv.filter(d => d.id !== it.uuid);
    } else {
      const r = await Bridge.call('sql_mine_delete', { p_key: it.key });
      if (!r.ok) { toast(errText(r.error), 'error'); return false; }
      S.mine = S.mine.filter(m => m.key !== it.key);
    }
    if (S.cur && S.cur.id === it.id) await openDefault();
    else renderSide();
    return true;
  }

  async function resetDb() {
    const c = S.cur;
    if (!c) return;
    if (c.kind !== 'copy' && !(c.kind === 'shared' && c.dirty)) return;
    if (!(await confirm('Auf Original zurücksetzen?', 'Alles, was du in <b>' + esc(c.title) + '</b> geändert hast, geht verloren. Die Datenbank wird wieder so wie am Anfang.', 'Zurücksetzen', 'danger'))) return;
    saver.drop(c);
    if (c.kind === 'copy') {
      await window.SQLStore.remove(c.store);
      await reloadLocal();
      await openSample(c.base);
    } else {
      const r = await Bridge.call('sql_mine_delete', { p_key: c.key });
      if (!r.ok) { toast(errText(r.error), 'error'); return; }
      S.mine = S.mine.filter(m => m.key !== c.key);
      await openShared(c.key);
    }
    toast('Zurückgesetzt.');
  }

  /* ─── Teilen (Lehrkraft) ─────────────────────────────────── */
  async function writeRoom(patch) {
    const next = Object.assign({}, Bridge.data, { shared: S.room.shared, create: S.room.create }, patch);
    S.room = normRoom(next);
    renderSide();
    const res = await Bridge.setData(next);
    if (!res.ok) toast(errText(res.error), 'error');
    return res;
  }

  async function setShare(id, title, r) {
    const list = S.room.shared.filter(x => x.id !== id);
    if (r) list.push({ id, t: String(title || id).slice(0, 80), r });
    return writeRoom({ shared: list });
  }

  function shareChip(it) {
    if (S.mode !== 'teacher' || !it.share) return '';
    const x = S.room.shared.find(e => e.id === it.share);
    return '<button type="button" class="share' + (x ? ' on share--' + x.r : '') + '" data-share="' + esc(it.id) + '" ' +
      'title="' + (x ? 'Geteilt: ' + esc(RIGHTS[x.r].long) : 'Mit der Klasse teilen') + '" aria-label="Teilen">' +
      icon('share') + (x ? '<span>' + (x.r === 'modify' ? 'Struktur' : 'Abfragen') + '</span>' : '') + '</button>';
  }

  function openShareMenu(btn, it) {
    const m = $('#shareMenu');
    const x = S.room.shared.find(e => e.id === it.share);
    const cur = x ? x.r : '';
    const opt = (v, label, note) => '<button type="button" class="menu-it radio' + (cur === v ? ' on' : '') + '" data-sv="' + v + '">' +
      '<span class="menu-dot"></span><span class="mi-txt"><b>' + esc(label) + '</b><small>' + esc(note) + '</small></span></button>';
    m.innerHTML = '<div class="menu-head">' + esc(it.title) + ' — für die Klasse</div>' +
      opt('', 'Nicht geteilt', 'Die Klasse sieht sie nicht.') +
      opt('use', 'Teilen: Abfragen', 'SELECT, INSERT, UPDATE, DELETE') +
      opt('modify', 'Teilen: Struktur ändern', 'zusätzlich CREATE, ALTER, DROP') +
      (it.kind === 'copy' ? '<div class="menu-note">Die Klasse bekommt das Original, nicht deine geänderte Kopie.</div>' : '<div class="menu-note">Wer sie schon geöffnet hat, behält seine Kopie. Neue Änderungen von dir sehen nur die, die sie danach zum ersten Mal öffnen.</div>');
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
    m.hidden = false;
    m.onclick = async (e) => {
      const b = e.target.closest('[data-sv]');
      if (!b) return;
      m.hidden = true;
      const v = b.dataset.sv || null;
      await setShare(it.share, it.title, v);
      toast(v ? '»' + it.title + '« geteilt (' + RIGHTS[v].label + ').' : '»' + it.title + '« entzogen.');
    };
  }

  /* ─── Raumzustand kommt herein ───────────────────────────── */
  let knownShared = null;
  async function onRoomState(d) {
    const prev = S.room;
    S.room = normRoom(d);
    if (!S.started) return;
    if (S.mode === 'student') {
      const keys = new Set(S.room.shared.map(x => x.id));
      if (knownShared) {
        const neu = S.room.shared.filter(x => !knownShared.has(x.id));
        if (neu.length) toast('Neu von deiner Lehrkraft: ' + neu.map(x => x.t).join(', '));
      }
      knownShared = keys;
      const c = S.cur;
      if (c && c.kind === 'shared' && !keys.has(c.key)) {
        saver.drop(c);
        toast('Deine Lehrkraft hat »' + c.title + '« zurückgenommen.');
        await openDefault();
        return;
      }
      if (c && c.kind === 'shared') {
        const x = S.room.shared.find(e => e.id === c.key);
        if (x.r !== c.r) { c.r = x.r; toast('Dein Recht in »' + c.title + '«: ' + RIGHTS[x.r].label + '.'); window.SQLPanes.onRights(); }
        c.title = x.t;
      }
      if (prev.create !== S.room.create) {
        toast(S.room.create ? 'Du darfst jetzt eigene Datenbanken anlegen.' : 'Eigene Datenbanken sind jetzt gesperrt (nur ansehen).');
        window.SQLPanes.onRights();
      }
      if (c && c.kind === 'none' && S.room.shared.length) { await openDefault(); return; }
    }
    renderSide();
    renderHead();
  }

  /* ─── SQL ausführen (für alle Reiter) ────────────────────── */
  async function execSql(text, o = {}) {
    const out = [];
    let rest = text, offset = o.offset || 0;
    S.busy = true;
    document.body.classList.add('busy');
    let schemaChanged = false, changed = false;
    try {
      for (let guard = 0; guard < 50 && rest.trim(); guard++) {
        let r;
        const e = eff();
        try {
          r = await window.SQLWorker.call('run', { sql: rest, rights: e.rights, createDb: e.createDb, readOnly: e.readOnly, offset });
        } catch (err) {
          out.push(err.timeout
            ? { kind: 'error', sql: rest.trim().slice(0, 300), start: offset, end: offset + rest.length,
                message: 'Die Abfrage hat länger als ' + (window.SQLWorker.LIMIT_MS / 1000) + ' Sekunden gedauert und wurde abgebrochen.',
                hint: 'Fehlt eine JOIN-Bedingung (ON …) oder ein LIMIT? Die Datenbank steht wieder auf dem letzten gesicherten Stand.' }
            : { kind: 'error', sql: '', message: 'Interner Fehler: ' + err.message });
          break;
        }
        out.push(...r.results);
        if (r.changed && r.bytes) { await persist(r.bytes); changed = true; }
        if (r.schemaChanged) schemaChanged = true;
        if (r.schema) S.schema = r.schema;
        if (!r.stop) break;
        const res = await appCommand(r.stop);
        res.sql = r.stop.sql; res.start = r.stop.start; res.end = r.stop.end;
        out.push(res);
        if (res.kind === 'error') break;
        if (res.switched) schemaChanged = true;
        rest = r.stop.rest; offset = r.stop.restOffset;
      }
    } finally {
      S.busy = false;
      document.body.classList.remove('busy');
    }
    if (changed || schemaChanged) { renderSide(); window.SQLPanes.onSchema(); }
    return out;
  }

  // App-Befehle laufen mitten in execSql (S.busy) — openId sperrt
  // dann, deshalb hier die offenen Wege direkt.
  async function openItem(it) {
    await saver.flush();
    if (it.kind === 'copy') return openSample(it.name);
    if (it.kind === 'srv') return openSrv(it.uuid);
    if (it.kind === 'shared') return openShared(it.key);
    if (it.kind === 'mine') return openMine(it.key);
    return openLocalOwn(it.id);
  }

  async function appCommand(st) {
    const name = st.name;
    if (st.cmd === 'show_databases') {
      const kindName = { copy: 'Vorlage', own: 'eigene', srv: 'eigene', shared: 'von der Lehrkraft', mine: 'eigene' };
      return { kind: 'rows', columns: ['Database', 'Art'], rows: items().map(i => [i.name, kindName[i.kind] || '']) };
    }
    if (st.cmd === 'use') {
      const f = findByName(name);
      if (!f) return { kind: 'error', message: 'Die Datenbank »' + name + '« gibt es nicht.', hint: 'Links stehen alle Datenbanken. SHOW DATABASES; listet sie auf.' };
      try { await openItem(f); } catch (e) { return { kind: 'error', message: e.message }; }
      return { kind: 'done', message: 'Datenbank »' + name + '« geöffnet.', switched: true };
    }
    if (st.cmd === 'create_database') {
      if (!validName(name)) return { kind: 'error', message: '»' + name + '« geht als Name nicht.', hint: 'Nur Buchstaben (ohne Umlaute), Ziffern und _.' };
      if (findByName(name) || SAMPLES.some(s => s.key === name.toLowerCase())) {
        if (st.ifNotExists) return { kind: 'info', message: 'Die Datenbank »' + name + '« gibt es schon.' };
        return { kind: 'error', message: 'Die Datenbank »' + name + '« gibt es schon.', hint: 'CREATE DATABASE IF NOT EXISTS ' + name + '; legt sie nur an, wenn sie fehlt.' };
      }
      // In MySQL öffnet erst USE die neue Datenbank. Hier ist sie
      // sofort offen — sonst landeten die folgenden CREATE TABLE in
      // der falschen, wenn jemand das USE vergisst.
      if (!(await createOwn(name, null))) return { kind: 'error', message: 'Die Datenbank »' + name + '« ließ sich nicht anlegen.' };
      const nextUse = /^\s*USE\s/i.test(st.rest.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)*/g, ''));
      return { kind: 'done', message: 'Datenbank »' + name + '« angelegt' + (nextUse ? '.' : ' und geöffnet.'), switched: true };
    }
    if (st.cmd === 'drop_database') {
      const f = findByName(name);
      if (!f) {
        if (st.ifExists) return { kind: 'info', message: 'Die Datenbank »' + name + '« gibt es nicht — nichts zu tun.' };
        return { kind: 'error', message: 'Die Datenbank »' + name + '« gibt es nicht.' };
      }
      if (f.kind === 'copy') return { kind: 'error', message: 'Vorlagen lassen sich nicht löschen.', hint: 'Über ⋯ → „Auf Original zurücksetzen" wird sie wieder wie neu.' };
      if (f.kind === 'shared') return { kind: 'error', message: 'Diese Datenbank gehört deiner Lehrkraft.' };
      const wasCur = S.cur && S.cur.id === f.id;
      S.busy = false;   // deleteDb öffnet danach selbst eine andere
      const ok = await deleteDb(Object.assign({ store: f.id }, f), true);
      S.busy = true;
      if (!ok) return { kind: 'error', message: 'Abgebrochen — die Datenbank »' + name + '« bleibt.' };
      return { kind: 'done', message: 'Datenbank »' + name + '« gelöscht.', switched: wasCur };
    }
    return { kind: 'error', message: 'Unbekannter Befehl.' };
  }

  async function refreshSchema() {
    S.schema = await window.SQLWorker.call('schema');
    renderSide();
  }

  /* ─── Seitenleiste ───────────────────────────────────────── */
  function dbItem(it, active) {
    const rightsBadge = S.mode === 'student' && it.kind === 'shared'
      ? '<span class="db-right db-right--' + it.r + '">' + (it.r === 'modify' ? 'Struktur' : 'Abfragen') + '</span>' : '';
    return '<div class="db-row">' +
      '<button type="button" class="db' + (active ? ' on' : '') + '" data-open="' + esc(it.id) + '" ' + (active ? 'aria-current="true"' : '') + '>' +
        icon('db', 'db-ic' + (['own', 'srv', 'mine'].includes(it.kind) ? ' own' : it.kind === 'peek' ? ' peek' : '')) +
        '<span class="db-txt"><span class="db-name">' + esc(it.title) + '</span>' +
        (it.meta ? '<span class="db-meta">' + esc(it.meta) + '</span>' : '') + '</span>' +
        rightsBadge +
        (it.dirty ? '<span class="db-dirty" title="Von dir verändert">geändert</span>' : '') +
      '</button>' + shareChip(it) + '</div>';
  }

  function tablesList() {
    const sc = S.schema;
    if (!sc.tables.length && !sc.views.length) {
      return '<div class="tbl-empty">Noch keine Tabellen.' + (can('modify') ? ' Lege unter <b>Struktur</b> eine an oder schreibe <code>CREATE TABLE</code>.' : '') + '</div>';
    }
    return '<ul class="tbls">' +
      sc.tables.map(t => '<li><button type="button" class="tbl' + (S.table === t.name ? ' on' : '') + '" data-table="' + esc(t.name) + '">' +
        icon('table') + '<span class="tbl-name">' + esc(t.name) + '</span><span class="tbl-n">' + (t.rows === null ? '' : t.rows) + '</span></button></li>').join('') +
      sc.views.map(v => '<li><button type="button" class="tbl view' + (S.table === v.name ? ' on' : '') + '" data-table="' + esc(v.name) + '">' +
        icon('view') + '<span class="tbl-name">' + esc(v.name) + '</span><span class="tbl-n">Sicht</span></button></li>').join('') +
      '</ul>';
  }

  // Einklappbare Gruppen links, Zustand pro Gerät gemerkt
  const COLL = (() => { try { return JSON.parse(localStorage.getItem('sqls.collapsed') || '{}') || {}; } catch (e) { return {}; } })();
  function grpHead(title, extraHead, count) {
    const c = !!COLL[title];
    return '<div class="grp' + (c ? ' is-collapsed' : '') + '"><div class="grp-h"><button type="button" class="grp-tog" data-grp="' + esc(title) + '" aria-expanded="' + !c + '">' +
      '<span class="grp-chev">' + icon('down') + '</span><span>' + esc(title) + '</span>' + (count ? '<span class="grp-n">' + count + '</span>' : '') + '</button>' + (extraHead || '') + '</div>';
  }

  function group(title, list, extraHead, empty) {
    let h = grpHead(title, extraHead, list.length);
    if (COLL[title]) return h + '</div>';
    if (!list.length && empty) h += '<div class="grp-empty">' + empty + '</div>';
    for (const it of list) {
      const active = S.cur && S.cur.id === it.id;
      h += dbItem(it, active);
      if (active) h += tablesList();
    }
    return h + '</div>';
  }

  function classGroup() {
    let h = grpHead('Arbeiten der Klasse', '<button type="button" class="grp-add" id="btnKlass" title="Neu laden" aria-label="Neu laden">' + icon('refresh') + '</button>', S.klass ? S.klass.length : 0);
    if (COLL['Arbeiten der Klasse']) return h + '</div>';
    if (S.klass === null) return h + '<div class="grp-empty">Wird geladen …</div></div>';
    if (!S.klass.length) return h + '<div class="grp-empty">Noch hat niemand etwas geändert. Kopien erscheinen hier, sobald jemand in einer geteilten Datenbank arbeitet.</div></div>';
    let lastP = null;
    for (const w of S.klass) {
      if (w.participant !== lastP) { h += '<div class="person">' + esc(w.person) + '</div>'; lastP = w.participant; }
      const sh = S.room.shared.find(x => x.id === w.key);
      const it = { id: 'peek:' + w.participant + ':' + w.key, kind: 'peek',
                   title: w.key.startsWith('own:') ? w.name + ' (eigene)' : (sh ? sh.t : w.name),
                   meta: 'geändert ' + hhmm(w.updated_at) };
      const active = S.cur && S.cur.id === it.id;
      h += dbItem(it, active);
      if (active) h += tablesList();
    }
    return h + '</div>';
  }

  function renderSide() {
    const side = $('#side');
    const all = items();
    const plus = canNew()
      ? '<button type="button" class="grp-add" id="btnNewDb" title="Neue Datenbank" aria-label="Neue Datenbank">' + icon('plus') + '</button>' : '';
    let h = '<div class="side-scroll">';
    if (S.mode === 'teacher') {
      const n = S.room.shared.length;
      h += '<div class="room-box"><div class="rb-h">' + icon('share') + '<b>Für die Klasse</b><span class="rb-n">' + (n ? n + ' geteilt' : 'nichts geteilt') + '</span></div>' +
        '<label class="rb-sw"><input type="checkbox" id="swCreate"' + (S.room.create ? ' checked' : '') + '>' +
        '<span><b>Eigene Datenbanken erlauben</b><small>Recht „create": Schüler legen selbst Datenbanken an</small></span></label>' +
        '<p class="rb-tip">Teilen mit ' + icon('share') + ' neben einer Datenbank.</p></div>';
    }
    if (S.mode === 'student') {
      h += group('Von deiner Lehrkraft', all.filter(i => i.group === 'shared'), '', 'Deine Lehrkraft hat noch keine Datenbank freigegeben.');
      const own = all.filter(i => i.group === 'own');
      if (S.room.create || own.length) {
        h += group('Meine Datenbanken', own, S.room.create ? plus : '',
          S.room.create ? 'Noch keine. Mit <b>+</b> legst du eine an — oder schreibe <code>CREATE DATABASE name;</code>' : '');
        if (!S.room.create && own.length) h += '<div class="grp-empty">Gerade gesperrt — du kannst sie nur ansehen.</div>';
      }
    } else {
      h += group('Vorlagen', all.filter(i => i.group === 'tpl'));
      h += group('Meine Datenbanken', all.filter(i => i.group === 'own'), plus,
        plus ? 'Noch keine. Mit <b>+</b> legst du eine an — oder schreibe <code>CREATE DATABASE name;</code>' : 'Eigene Datenbanken anlegen darfst du hier nicht.');
      if (S.mode === 'teacher') h += classGroup();
    }
    h += '</div>';
    const foot = DEMO ? 'Vorschau — hier wird nichts gespeichert.'
      : S.mode === 'local'
      ? (window.SQLStore.persistent ? 'Alles bleibt auf diesem Gerät.' : 'Dieser Browser speichert nichts — beim Schließen ist alles weg. Exportiere, was du behalten willst.')
      : S.mode === 'teacher' ? 'Vorlagen-Kopien bleiben auf diesem Gerät, eigene Datenbanken liegen in deinem Konto.'
      : 'Deine Änderungen werden im Raum gespeichert und mit dem Raum gelöscht.';
    h += '<div class="side-foot">' + icon('shield') + '<span>' + foot + '</span></div>';
    side.innerHTML = h;
  }

  function kindLabel(c) {
    return ({ copy: 'Vorlage', own: 'eigene Datenbank', srv: 'eigene Datenbank', shared: 'von deiner Lehrkraft',
              mine: 'eigene Datenbank', peek: 'Kopie — nur ansehen', none: '' })[c.kind] || '';
  }

  function renderHead() {
    const c = S.cur;
    $('#curName').textContent = c ? c.title || '' : '';
    $('#curKind').textContent = c ? kindLabel(c) : '';
    const chip = $('#rightsChip');
    const e = eff();
    const show = c && c.kind !== 'none' && (canTest || S.mode === 'student');
    chip.hidden = !show;
    if (!show) return;
    const k = e.readOnly ? 'read' : (S.mode === 'student' ? e.rights : S.rights);
    chip.className = 'chip chip--' + k;
    chip.innerHTML = icon('shield') + '<span>' + (k === 'read' ? 'Nur ansehen' : esc(RIGHTS[k].label)) + '</span>';
    chip.title = k === 'read' ? 'Hier kannst du nur abfragen (SELECT).' : 'Dein Recht hier: ' + RIGHTS[k].long;
  }

  /* ─── Schmale Geräte: Seitenleiste als Schublade ─────────── */
  function openSide() { document.body.classList.add('side-open'); }
  function closeSide() { document.body.classList.remove('side-open'); }

  /* ─── Menü ⋯ ─────────────────────────────────────────────── */
  function menuItems() {
    const it = [];
    const c = S.cur;
    if (c && c.kind !== 'none') {
      it.push({ act: 'export-sql', ic: 'download', label: 'Exportieren als SQL-Datei (.sql)' });
      it.push({ act: 'export-db', ic: 'download', label: 'Exportieren als SQLite-Datei (.sqlite)' });
      it.push({ sep: true });
      if (canDuplicate()) it.push({ act: 'dup', ic: 'copy', label: 'Als eigene Datenbank kopieren' });
      if (c.kind === 'copy' || (c.kind === 'shared' && c.dirty)) it.push({ act: 'reset', ic: 'reset', label: 'Auf Original zurücksetzen' });
      if (['own', 'srv', 'mine'].includes(c.kind) && !eff().readOnly) {
        it.push({ act: 'rename', ic: 'edit', label: 'Umbenennen' });
        it.push({ act: 'delete', ic: 'trash', label: 'Datenbank löschen', danger: true });
      } else if (c.kind === 'mine') {
        it.push({ act: 'delete', ic: 'trash', label: 'Datenbank löschen', danger: true });
      }
    }
    if (canTest) {
      it.push({ sep: true });
      it.push({ head: S.mode === 'teacher' ? 'Rechte ausprobieren (nur bei dir)' : 'Rechte ausprobieren' });
      for (const k of ['use', 'modify', 'create']) {
        it.push({ act: 'rights:' + k, label: k + ' — ' + RIGHTS[k].label, radio: S.rights === k });
      }
    }
    return it.filter((x, i, a) => !(x.sep && (i === 0 || a[i - 1].sep)));
  }

  function toggleMenu(force) {
    const m = $('#moreMenu');
    const open = force !== undefined ? force : m.hidden;
    if (!open) { m.hidden = true; return; }
    m.innerHTML = menuItems().map(i => i.sep ? '<div class="menu-sep"></div>'
      : i.head ? '<div class="menu-head">' + esc(i.head) + '</div>'
      : '<button type="button" class="menu-it' + (i.danger ? ' danger' : '') + (i.radio !== undefined ? ' radio' + (i.radio ? ' on' : '') : '') +
        '" data-act="' + i.act + '" role="menuitem">' + (i.ic ? icon(i.ic) : '<span class="menu-dot"></span>') + '<span>' + esc(i.label) + '</span></button>').join('');
    m.hidden = false;
  }

  async function menuAct(act) {
    toggleMenu(false);
    const c = S.cur;
    if (act === 'export-sql') {
      const sql = await window.SQLWorker.call('dump', { title: c.title });
      download((c.name || 'datenbank') + '.sql', sql, 'text/plain;charset=utf-8');
    } else if (act === 'export-db') {
      const bytes = await window.SQLWorker.call('export');
      download((c.name || 'datenbank') + '.sqlite', bytes, 'application/vnd.sqlite3');
    } else if (act === 'dup') duplicate();
    else if (act === 'reset') resetDb();
    else if (act === 'rename') renameDb();
    else if (act === 'delete') deleteDb(c);
    else if (act.startsWith('rights:')) {
      S.rights = act.slice(7);
      try { sessionStorage.setItem('sqls.rechte.' + S.scope, S.rights); } catch (e) { /* egal */ }
      renderHead(); renderSide(); window.SQLPanes.onRights();
      toast('Recht jetzt: ' + S.rights + ' — ' + RIGHTS[S.rights].label);
    }
  }

  /* ─── Importieren ────────────────────────────────────────── */
  async function importFile(file) {
    if (!file) return;
    const isDb = /\.(sqlite3?|db)$/i.test(file.name);
    const base = slug(file.name.replace(/\.[^.]+$/, '')) || 'import';
    let name = base;
    for (let i = 2; nameTaken(name); i++) name = base.slice(0, 36) + '_' + i;
    if (isDb) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const head = new TextDecoder().decode(bytes.slice(0, 15));
      if (head !== 'SQLite format 3') { toast('Das ist keine SQLite-Datei.', 'error'); return; }
      if (!canNew()) { toast('Eigene Datenbanken anlegen darfst du hier nicht.', 'error'); return; }
      const n = await askName('SQLite-Datei importieren', name, 'Importieren');
      if (!n) return;
      await saver.flush();
      try { if (await createOwn(n, bytes)) toast('»' + n + '« importiert.'); }
      catch (e) { toast('Die Datei lässt sich nicht öffnen: ' + e.message, 'error'); }
      return;
    }
    const text = await file.text();
    const hasCreateDb = /\bCREATE\s+(DATABASE|SCHEMA)\b/i.test(text);
    const newOk = canNew();
    const choices = [{ label: 'Abbrechen', value: null }];
    if (S.cur && S.cur.kind !== 'none' && !eff().readOnly) choices.push({ label: 'In »' + S.cur.title + '« ausführen', value: 'here' });
    if (newOk && !hasCreateDb) choices.push({ label: 'Als neue Datenbank', value: 'new', kind: 'primary' });
    if (hasCreateDb) choices.push({ label: 'Ausführen', value: 'here', kind: 'primary' });
    if (choices.length === 1) { toast('Importieren darfst du hier nicht.', 'error'); return; }
    const lines = (text.match(/\n/g) || []).length + 1;
    const v = await dialog({
      title: 'SQL-Datei importieren',
      body: '<p><b>' + esc(file.name) + '</b> · ' + lines + ' Zeilen</p>' +
        (hasCreateDb ? '<p class="dlg-note">Die Datei legt selbst eine Datenbank an (<code>CREATE DATABASE</code>).</p>' : '') +
        '<p class="dlg-note">Die Anweisungen laufen nacheinander; beim ersten Fehler wird angehalten. Das Ergebnis steht im Reiter SQL.</p>',
      buttons: choices
    });
    if (!v) return;
    if (v === 'new') {
      const n = await askName('Neue Datenbank aus Datei', name, 'Importieren');
      if (!n) return;
      await saver.flush();
      if (!(await createOwn(n, null))) return;
    }
    window.SQLPanes.switchTab('sql');
    const res = await execSql(text);
    window.SQLPanes.sql.showResults(res, 'Import: ' + file.name);
    const err = res.find(r => r.kind === 'error');
    if (err) toast('Import angehalten: ' + err.message, 'error');
    else toast('Import fertig: ' + res.length + ' Anweisungen.');
  }

  /* ─── Start ──────────────────────────────────────────────── */
  function bind() {
    $('#side').addEventListener('click', (e) => {
      const tg = e.target.closest('[data-grp]');
      if (tg) {
        COLL[tg.dataset.grp] = !COLL[tg.dataset.grp];
        try { localStorage.setItem('sqls.collapsed', JSON.stringify(COLL)); } catch (err) {}
        renderSide();
        return;
      }
      const sh = e.target.closest('[data-share]');
      if (sh) {
        e.stopPropagation();
        const it = items().find(i => i.id === sh.dataset.share);
        if (it) openShareMenu(sh, it);
        return;
      }
      const o = e.target.closest('[data-open]');
      if (o) { openId(o.dataset.open); return; }
      const t = e.target.closest('[data-table]');
      if (t) { window.SQLPanes.openTable(t.dataset.table); closeSide(); return; }
      if (e.target.closest('#btnNewDb')) { newDb(); return; }
      if (e.target.closest('#btnKlass')) { S.klass = null; renderSide(); loadClass(); }
    });
    $('#side').addEventListener('change', (e) => {
      if (e.target.id === 'swCreate') {
        const on = e.target.checked;
        writeRoom({ create: on }).then(r => { if (r.ok) toast(on ? 'Die Klasse darf eigene Datenbanken anlegen.' : 'Eigene Datenbanken der Klasse gesperrt.'); });
      }
    });
    $('#saveState').addEventListener('click', () => saver.flush());
    $('#btnSide').addEventListener('click', () => document.body.classList.contains('side-open') ? closeSide() : openSide());
    $('#sideBack').addEventListener('click', closeSide);
    $('#btnMore').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    $('#moreMenu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) menuAct(b.dataset.act);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#moreMenu')) toggleMenu(false);
      if (!e.target.closest('#shareMenu')) $('#shareMenu').hidden = true;
    });
    $('#side').addEventListener('scroll', () => { $('#shareMenu').hidden = true; }, true);
    $('#btnImport').addEventListener('click', () => $('#fileIn').click());
    $('#fileIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; importFile(f); });
    document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('drop'); } });
    document.addEventListener('dragleave', (e) => { if (e.target === document.documentElement || !e.relatedTarget) document.body.classList.remove('drop'); });
    document.addEventListener('drop', (e) => {
      document.body.classList.remove('drop');
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) { e.preventDefault(); importFile(f); }
    });
  }

  async function start() {
    syncTheme();
    bind();
    document.body.classList.add('mode-' + S.mode);
    window.SQLPanes.init();
    await window.SQLStore.init({ memory: DEMO });
    if (Bridge.active) {
      Bridge.onState(onRoomState);
      Bridge.hello();
      await Bridge.waitState(4000);
      S.room = normRoom(Bridge.data);
    }
    await reloadLocal();
    if (S.mode === 'teacher') { await loadSrv(); await migrateLocalOwns(); }
    if (S.mode === 'student') { await loadMine(); knownShared = new Set(S.room.shared.map(x => x.id)); }
    S.started = true;
    renderHead();
    await openDefault();
    if (S.mode === 'teacher') loadClass();
    document.body.classList.remove('loading');
  }

  window.SQLApp = {
    S, SAMPLES, RIGHTS, can, ls, execSql, refreshSchema, persist,
    titleOf: c => (c ? c.title || c.name || '' : ''),
    isReadOnly: () => eff().readOnly,
    saveLayout,
    newDb
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
