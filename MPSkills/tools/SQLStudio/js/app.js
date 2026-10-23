/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/app.js   ·   Die Anwendung
   ══════════════════════════════════════════════════════════════
   Links die Datenbanken (Vorlagen + eigene), rechts vier Reiter:
   SQL · Daten · Struktur · Diagramm (js/panes.js).

   Adresse (vom Rahmen in MPSkills, tool.js):
     ?raum=CODE      eigener Speicherplatz je Raum (sonst „solo")
     &rolle=presenter|participant
     &rechte=use|modify|create   zum Ausprobieren (Etappe 1)

   ── Etappe 1 ──────────────────────────────────────────────────
   Alles bleibt im Gerät (js/client.js → IndexedDB). Eine Vorlage
   wird beim ersten Öffnen frisch aus data/<name>.sql gebaut, danach
   arbeitet man in der eigenen Kopie; „Auf Original zurücksetzen"
   baut sie neu. Das Recht gilt hier für alle Datenbanken gleich;
   die Lehrkraft kann es über ⋯ → „Rechte ausprobieren" umstellen.
   In Etappe 2 kommt es je geteilter Datenbank vom Server.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const { $, $$, esc, icon, toast, dialog, confirm, download } = window.SQLUI;
  const Core = window.SQLCore;

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

  /* ─── Zustand ────────────────────────────────────────────── */
  const qs = new URLSearchParams(location.search);
  const S = {
    scope: (qs.get('raum') || 'solo').slice(0, 20),
    role: qs.get('rolle') || 'solo',
    rights: RIGHTS[qs.get('rechte')] ? qs.get('rechte') : 'create',
    list: [],          // Einträge ohne Bytes
    cur: null,         // geöffneter Eintrag
    schema: { tables: [], views: [], triggers: [] },
    tab: 'sql',
    table: null,       // gewählte Tabelle (Daten/Struktur)
    busy: false
  };
  const canTest = S.role !== 'participant';
  try {
    const t = sessionStorage.getItem('sqls.rechte.' + S.scope);
    if (canTest && t && RIGHTS[t] && !qs.get('rechte')) S.rights = t;
  } catch (e) { /* egal */ }

  const LV = { use: 1, modify: 2, create: 3 };
  const can = (r) => LV[S.rights] >= LV[r];
  const ls = {
    get(k) { try { return localStorage.getItem('sqls.' + k + '.' + S.scope); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('sqls.' + k + '.' + S.scope, v); } catch (e) { /* egal */ } }
  };

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

  /* ─── Datenbanken ────────────────────────────────────────── */
  const sysId = key => S.scope + '|sys:' + key;
  const titleOf = rec => rec ? (rec.kind === 'copy' ? (SAMPLES.find(s => s.key === rec.base) || {}).title || rec.name : rec.name) : '';
  const validName = n => /^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(n);

  async function reloadList() {
    S.list = await window.SQLStore.list(S.scope);
  }

  function findByName(name) {
    const n = String(name).toLowerCase();
    const own = S.list.find(r => r.kind === 'own' && r.name.toLowerCase() === n);
    if (own) return { id: own.id };
    const s = SAMPLES.find(x => x.key === n || x.title.toLowerCase() === n);
    if (s) return { sample: s.key };
    return null;
  }

  async function sampleScript(key) {
    const res = await fetch('data/' + key + '.sql?v=20261023a');
    if (!res.ok) throw new Error('Vorlage ' + key + ' nicht gefunden');
    return res.text();
  }

  async function openSample(key) {
    const id = sysId(key);
    let rec = await window.SQLStore.get(id);
    if (rec && rec.bytes) return openRecord(rec);
    const r = await window.SQLWorker.open(null, await sampleScript(key));
    rec = { id, scope: S.scope, kind: 'copy', base: key, name: key, bytes: r.bytes, dirty: false, layout: null, created: Date.now() };
    await window.SQLStore.put(rec);
    await reloadList();
    setCurrent(rec, r.schema);
  }

  async function openRecord(rec) {
    const r = await window.SQLWorker.open(rec.bytes);
    setCurrent(rec, r.schema);
  }

  async function openId(id) {
    if (S.busy) return;
    try {
      if (id.startsWith('sample:')) await openSample(id.slice(7));
      else {
        const rec = await window.SQLStore.get(id);
        if (!rec) { toast('Diese Datenbank gibt es nicht mehr.', 'error'); return; }
        await openRecord(rec);
      }
    } catch (e) {
      console.error(e);
      toast('Öffnen hat nicht geklappt: ' + e.message, 'error');
    }
  }

  function setCurrent(rec, schema) {
    const { bytes, ...meta } = rec;
    S.cur = meta;
    S.schema = schema;
    S.table = null;
    ls.set('last', rec.kind === 'copy' ? 'sample:' + rec.base : rec.id);
    renderSide();
    renderHead();
    window.SQLPanes.onDb();
    closeSide();
  }

  async function persist(bytes) {
    if (!S.cur) return;
    window.SQLWorker.remember(bytes);
    await window.SQLStore.patch(S.cur.id, { bytes, dirty: true });
    S.cur.dirty = true;
    const m = S.list.find(r => r.id === S.cur.id);
    if (m) m.dirty = true;
  }

  async function createOwn(name, bytes) {
    const id = S.scope + '|own:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let schema;
    if (bytes) schema = (await window.SQLWorker.open(bytes)).schema;
    else {
      const r = await window.SQLWorker.open(null, '-- leer');
      bytes = r.bytes; schema = r.schema;
    }
    const rec = { id, scope: S.scope, kind: 'own', name, bytes, dirty: true, layout: null, created: Date.now() };
    await window.SQLStore.put(rec);
    await reloadList();
    setCurrent(rec, schema);
    return rec;
  }

  function nameTaken(name, exceptId) {
    const n = name.toLowerCase();
    return S.list.some(r => r.kind === 'own' && r.id !== exceptId && r.name.toLowerCase() === n) ||
      SAMPLES.some(s => s.key === n);
  }

  async function askName(title, value, label, exceptId) {
    const v = await dialog({
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
    return v;
  }

  async function newDb() {
    if (!can('create')) return;
    const n = await askName('Neue Datenbank', '', 'Anlegen');
    if (!n) return;
    await createOwn(n, null);
    window.SQLPanes.switchTab('struct');
    toast('Datenbank »' + n + '« angelegt.');
  }

  async function duplicate() {
    if (!S.cur || !can('create')) return;
    const n = await askName('Als eigene Datenbank kopieren', (S.cur.name + '_kopie').slice(0, 40), 'Kopieren');
    if (!n) return;
    const bytes = await window.SQLWorker.call('export');
    const layout = S.cur.layout;
    const rec = await createOwn(n, bytes);
    if (layout) { await window.SQLStore.patch(rec.id, { layout }); S.cur.layout = layout; }
    toast('Kopie »' + n + '« angelegt.');
  }

  async function renameDb() {
    if (!S.cur || S.cur.kind !== 'own') return;
    const n = await askName('Datenbank umbenennen', S.cur.name, 'Umbenennen', S.cur.id);
    if (!n) return;
    await window.SQLStore.patch(S.cur.id, { name: n });
    S.cur.name = n;
    await reloadList();
    renderSide(); renderHead();
  }

  async function deleteDb(id, silent) {
    const rec = S.list.find(r => r.id === id);
    if (!rec || rec.kind !== 'own') return false;
    if (!silent && !(await confirm('Datenbank löschen?', 'Die Datenbank <b>' + esc(rec.name) + '</b> mit allen Tabellen und Daten wird auf diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.', 'Löschen', 'danger'))) return false;
    await window.SQLStore.remove(id);
    await reloadList();
    if (S.cur && S.cur.id === id) await openSample('haustiere');
    else renderSide();
    return true;
  }

  async function resetDb() {
    if (!S.cur || S.cur.kind !== 'copy') return;
    if (!(await confirm('Auf Original zurücksetzen?', 'Alles, was du in <b>' + esc(titleOf(S.cur)) + '</b> geändert hast, geht verloren. Die Datenbank wird wieder so wie am Anfang.', 'Zurücksetzen', 'danger'))) return;
    await window.SQLStore.remove(S.cur.id);
    await reloadList();
    await openSample(S.cur.base);
    toast('Zurückgesetzt.');
  }

  /* ─── SQL ausführen (für alle Reiter) ────────────────────── */
  /* Läuft durch, bis der Kern bei einem App-Befehl anhält
     (CREATE DATABASE, USE …) — den erledigt die App, dann geht es
     mit dem Rest weiter, gegebenenfalls in der anderen Datenbank. */
  async function execSql(text, o = {}) {
    const out = [];
    let rest = text, offset = o.offset || 0;
    S.busy = true;
    document.body.classList.add('busy');
    let schemaChanged = false, changed = false;
    try {
      for (let guard = 0; guard < 50 && rest.trim(); guard++) {
        let r;
        try {
          r = await window.SQLWorker.call('run', { sql: rest, rights: S.rights, offset });
        } catch (e) {
          out.push(e.timeout
            ? { kind: 'error', sql: rest.trim().slice(0, 300), start: offset, end: offset + rest.length,
                message: 'Die Abfrage hat länger als ' + (window.SQLWorker.LIMIT_MS / 1000) + ' Sekunden gedauert und wurde abgebrochen.',
                hint: 'Fehlt eine JOIN-Bedingung (ON …) oder ein LIMIT? Die Datenbank steht wieder auf dem letzten gesicherten Stand.' }
            : { kind: 'error', sql: '', message: 'Interner Fehler: ' + e.message });
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

  async function appCommand(st) {
    const name = st.name;
    if (st.cmd === 'show_databases') {
      const rows = SAMPLES.map(s => [s.key, 'Vorlage']).concat(S.list.filter(r => r.kind === 'own').map(r => [r.name, 'eigene']));
      return { kind: 'rows', columns: ['Database', 'Art'], rows };
    }
    if (st.cmd === 'use') {
      const f = findByName(name);
      if (!f) {
        return { kind: 'error', message: 'Die Datenbank »' + name + '« gibt es nicht.', hint: 'Links stehen alle Datenbanken. SHOW DATABASES; listet sie auf.' };
      }
      if (f.sample) await openSample(f.sample); else await openId(f.id);
      return { kind: 'done', message: 'Datenbank »' + name + '« geöffnet.', switched: true };
    }
    if (st.cmd === 'create_database') {
      if (!validName(name)) return { kind: 'error', message: '»' + name + '« geht als Name nicht.', hint: 'Nur Buchstaben (ohne Umlaute), Ziffern und _.' };
      if (findByName(name)) {
        if (st.ifNotExists) return { kind: 'info', message: 'Die Datenbank »' + name + '« gibt es schon.' };
        return { kind: 'error', message: 'Die Datenbank »' + name + '« gibt es schon.', hint: 'CREATE DATABASE IF NOT EXISTS ' + name + '; legt sie nur an, wenn sie fehlt.' };
      }
      // In MySQL öffnet erst USE die neue Datenbank. Hier ist sie
      // sofort offen — sonst landeten die folgenden CREATE TABLE in
      // der falschen, wenn jemand das USE vergisst.
      await createOwn(name, null);
      const nextUse = /^\s*USE\s/i.test(st.rest.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)*/g, ''));
      return { kind: 'done', message: 'Datenbank »' + name + '« angelegt' + (nextUse ? '.' : ' und geöffnet.'), switched: true };
    }
    if (st.cmd === 'drop_database') {
      const f = findByName(name);
      if (!f) {
        if (st.ifExists) return { kind: 'info', message: 'Die Datenbank »' + name + '« gibt es nicht — nichts zu tun.' };
        return { kind: 'error', message: 'Die Datenbank »' + name + '« gibt es nicht.' };
      }
      if (f.sample) return { kind: 'error', message: 'Vorlagen lassen sich nicht löschen.', hint: 'Über ⋯ → „Auf Original zurücksetzen" wird sie wieder wie neu.' };
      const ok = await deleteDb(f.id, false);
      if (!ok) return { kind: 'error', message: 'Abgebrochen — die Datenbank »' + name + '« bleibt.' };
      return { kind: 'done', message: 'Datenbank »' + name + '« gelöscht.', switched: true };
    }
    return { kind: 'error', message: 'Unbekannter Befehl.' };
  }

  async function refreshSchema() {
    S.schema = await window.SQLWorker.call('schema');
    renderSide();
  }

  /* ─── Seitenleiste ───────────────────────────────────────── */
  function dbItem(id, title, meta, active, dirty, kind) {
    return '<button type="button" class="db' + (active ? ' on' : '') + '" data-open="' + esc(id) + '" ' +
      (active ? 'aria-current="true"' : '') + '>' + icon('db', 'db-ic' + (kind === 'own' ? ' own' : '')) +
      '<span class="db-txt"><span class="db-name">' + esc(title) + '</span>' +
      (meta ? '<span class="db-meta">' + esc(meta) + '</span>' : '') + '</span>' +
      (dirty ? '<span class="db-dirty" title="Von dir verändert">geändert</span>' : '') + '</button>';
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

  function renderSide() {
    const side = $('#side');
    const curSample = S.cur && S.cur.kind === 'copy' ? S.cur.base : null;
    const own = S.list.filter(r => r.kind === 'own').sort((a, b) => a.name.localeCompare(b.name));
    let h = '<div class="side-scroll">';
    h += '<div class="grp"><div class="grp-h">Vorlagen</div>';
    for (const s of SAMPLES) {
      const rec = S.list.find(r => r.id === sysId(s.key));
      const active = curSample === s.key;
      h += dbItem('sample:' + s.key, s.title, s.blurb, active, rec && rec.dirty, 'copy');
      if (active) h += tablesList();
    }
    h += '</div>';
    h += '<div class="grp"><div class="grp-h">Meine Datenbanken' +
      (can('create') ? '<button type="button" class="grp-add" id="btnNewDb" title="Neue Datenbank" aria-label="Neue Datenbank">' + icon('plus') + '</button>' : '') + '</div>';
    if (!own.length) {
      h += '<div class="grp-empty">' + (can('create')
        ? 'Noch keine. Mit <b>+</b> legst du eine an — oder schreibe <code>CREATE DATABASE name;</code>'
        : 'Eigene Datenbanken anlegen darfst du hier nicht.') + '</div>';
    }
    for (const r of own) {
      const active = S.cur && S.cur.id === r.id;
      h += dbItem(r.id, r.name, null, active, false, 'own');
      if (active) h += tablesList();
    }
    h += '</div></div>';
    h += '<div class="side-foot">' + icon('shield') + '<span>' +
      (window.SQLStore.persistent ? 'Alles bleibt auf diesem Gerät.' : 'Dieser Browser speichert nichts — beim Schließen ist alles weg. Exportiere, was du behalten willst.') +
      '</span></div>';
    side.innerHTML = h;
  }

  function renderHead() {
    $('#curName').textContent = S.cur ? titleOf(S.cur) : '';
    $('#curKind').textContent = S.cur ? (S.cur.kind === 'copy' ? 'Vorlage' : 'eigene Datenbank') : '';
    const chip = $('#rightsChip');
    chip.hidden = S.rights === 'create' && !canTest;
    chip.className = 'chip chip--' + S.rights;
    chip.innerHTML = icon('shield') + '<span>' + esc(RIGHTS[S.rights].label) + '</span>';
    chip.title = 'Dein Recht hier: ' + RIGHTS[S.rights].long;
  }

  /* ─── Schmale Geräte: Seitenleiste als Schublade ─────────── */
  function openSide() { document.body.classList.add('side-open'); }
  function closeSide() { document.body.classList.remove('side-open'); }

  /* ─── Menü ⋯ ─────────────────────────────────────────────── */
  function menuItems() {
    const it = [];
    it.push({ act: 'export-sql', ic: 'download', label: 'Exportieren als SQL-Datei (.sql)' });
    it.push({ act: 'export-db', ic: 'download', label: 'Exportieren als SQLite-Datei (.sqlite)' });
    it.push({ sep: true });
    if (can('create')) it.push({ act: 'dup', ic: 'copy', label: 'Als eigene Datenbank kopieren' });
    if (S.cur && S.cur.kind === 'copy') it.push({ act: 'reset', ic: 'reset', label: 'Auf Original zurücksetzen' });
    if (S.cur && S.cur.kind === 'own') {
      it.push({ act: 'rename', ic: 'edit', label: 'Umbenennen' });
      it.push({ act: 'delete', ic: 'trash', label: 'Datenbank löschen', danger: true });
    }
    if (canTest) {
      it.push({ sep: true });
      it.push({ head: 'Rechte ausprobieren' });
      for (const k of ['use', 'modify', 'create']) {
        it.push({ act: 'rights:' + k, label: k + ' — ' + RIGHTS[k].label, radio: S.rights === k });
      }
    }
    return it;
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
    if (act === 'export-sql') {
      const sql = await window.SQLWorker.call('dump', { title: titleOf(S.cur) });
      download((S.cur.name || 'datenbank') + '.sql', sql, 'text/plain;charset=utf-8');
    } else if (act === 'export-db') {
      const bytes = await window.SQLWorker.call('export');
      download((S.cur.name || 'datenbank') + '.sqlite', bytes, 'application/vnd.sqlite3');
    } else if (act === 'dup') duplicate();
    else if (act === 'reset') resetDb();
    else if (act === 'rename') renameDb();
    else if (act === 'delete') deleteDb(S.cur.id);
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
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^[^A-Za-z]+/, '').slice(0, 40) || 'import';
    let name = base;
    for (let i = 2; nameTaken(name); i++) name = (base.slice(0, 36) + '_' + i);
    if (isDb) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const head = new TextDecoder().decode(bytes.slice(0, 15));
      if (head !== 'SQLite format 3') { toast('Das ist keine SQLite-Datei.', 'error'); return; }
      if (!can('create')) { toast('Eigene Datenbanken anlegen darfst du hier nicht.', 'error'); return; }
      const n = await askName('SQLite-Datei importieren', name, 'Importieren');
      if (!n) return;
      try { await createOwn(n, bytes); toast('»' + n + '« importiert.'); }
      catch (e) { toast('Die Datei lässt sich nicht öffnen: ' + e.message, 'error'); }
      return;
    }
    const text = await file.text();
    const hasCreateDb = /\bCREATE\s+(DATABASE|SCHEMA)\b/i.test(text);
    const choices = [{ label: 'Abbrechen', value: null }];
    if (S.cur) choices.push({ label: 'In »' + titleOf(S.cur) + '« ausführen', value: 'here' });
    if (can('create') && !hasCreateDb) choices.push({ label: 'Als neue Datenbank', value: 'new', kind: 'primary' });
    if (hasCreateDb) choices.push({ label: 'Ausführen', value: 'here', kind: 'primary' });
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
      await createOwn(n, null);
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
      const o = e.target.closest('[data-open]');
      if (o) { openId(o.dataset.open); return; }
      const t = e.target.closest('[data-table]');
      if (t) { window.SQLPanes.openTable(t.dataset.table); closeSide(); return; }
      if (e.target.closest('#btnNewDb')) newDb();
    });
    $('#btnSide').addEventListener('click', () => document.body.classList.contains('side-open') ? closeSide() : openSide());
    $('#sideBack').addEventListener('click', closeSide);
    $('#btnMore').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    $('#moreMenu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) menuAct(b.dataset.act);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#moreMenu')) toggleMenu(false); });
    $('#btnImport').addEventListener('click', () => $('#fileIn').click());
    $('#fileIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; importFile(f); });
    // Datei auf die Seite ziehen
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
    window.SQLPanes.init();
    await window.SQLStore.init();
    await reloadList();
    renderHead();
    const last = ls.get('last');
    const ok = last && (last.startsWith('sample:') ? SAMPLES.some(s => 'sample:' + s.key === last) : S.list.some(r => r.id === last));
    await openId(ok ? last : 'sample:haustiere');
    document.body.classList.remove('loading');
  }

  window.SQLApp = {
    S, SAMPLES, RIGHTS, can, ls, execSql, refreshSchema, persist, titleOf,
    saveLayout: async (layout) => {
      if (!S.cur) return;
      S.cur.layout = layout;
      await window.SQLStore.patch(S.cur.id, { layout });
    },
    newDb
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
