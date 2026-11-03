/* ══════════════════════════════════════════════════════════════
   Social Hub — js/db.js   ·   Der Datenbank-Reiter im Admin-Bereich
   ══════════════════════════════════════════════════════════════
   Wie SQL Studio (dessen Editor, Kern und Klassendiagramm werden
   mitbenutzt), aber die Datenbank ist der Hub selbst:

     1. sh_db_snapshot holt die erstellten Tabellen (nur Admins).
     2. Daraus entsteht im Worker eine SQLite-Kopie (MySQL-Schreibweise,
        übersetzt vom Kern).
     3. SELECT läuft nur hier.
     4. INSERT/UPDATE/DELETE: danach werden alle Zeilen gelesen und mit
        dem Stand davor verglichen. Der Unterschied geht an
        sh_db_apply — übernimmt der Server ihn, gilt er für alle; lehnt
        er ab, wird die Kopie neu geladen.

   Struktur ändern (CREATE/ALTER/DROP) ist gesperrt: Tabellen erstellt
   die Lehrkraft.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261103a';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const DDL = {
    users: `CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(60),
  email VARCHAR(100),
  password VARCHAR(100) NOT NULL,
  bio TEXT,
  avatar VARCHAR(60),
  birthday DATE,
  city VARCHAR(60),
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`,
    photos: `CREATE TABLE photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  image VARCHAR(60) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`,
    tags: `CREATE TABLE tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE
);`,
    comments: `CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  photo_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);`,
    follows: `CREATE TABLE follows (
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);`,
    likes: `CREATE TABLE likes (
  user_id INT NOT NULL,
  photo_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, photo_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);`,
    comment_likes: `CREATE TABLE comment_likes (
  user_id INT NOT NULL,
  comment_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, comment_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);`,
    photo_tag: `CREATE TABLE photo_tag (
  photo_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (photo_id, tag_id),
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);`
  };
  // Eltern vor Kindern (anlegen, einfügen); rückwärts = löschen
  const ORDER = ['users', 'tags', 'photos', 'comments', 'follows', 'likes', 'comment_likes', 'photo_tag'];
  const PK = { follows: ['follower_id', 'following_id'], likes: ['user_id', 'photo_id'],
               comment_likes: ['user_id', 'comment_id'], photo_tag: ['photo_id', 'tag_id'] };
  const pkOf = t => PK[t] || ['id'];

  const EXAMPLES = [
    ['Alle Nutzer', 'SELECT * FROM users;'],
    ['Wer ist Admin?', "SELECT username, role FROM users WHERE role = 'admin';"],
    ['Passwörter (Hashes!)', 'SELECT username, password FROM users;'],
    ['Fotos mit Benutzername', 'SELECT p.id, u.username, p.description, p.created_at\nFROM photos p\nJOIN users u ON u.id = p.user_id\nORDER BY p.created_at DESC;'],
    ['Likes je Foto', 'SELECT p.id, p.description, COUNT(l.user_id) AS likes\nFROM photos p\nLEFT JOIN likes l ON l.photo_id = p.id\nGROUP BY p.id\nORDER BY likes DESC;', 'likes'],
    ['Wer folgt wem?', 'SELECT a.username AS follower, b.username AS folgt\nFROM follows f\nJOIN users a ON a.id = f.follower_id\nJOIN users b ON b.id = f.following_id;', 'follows'],
    ['Beliebteste Tags', 'SELECT t.name, COUNT(*) AS fotos\nFROM tags t\nJOIN photo_tag pt ON pt.tag_id = t.id\nGROUP BY t.id\nORDER BY fotos DESC;', 'tags'],
    ['Konto anlegen (INSERT)', "INSERT INTO users (username, name, password)\nVALUES ('neu_hier', 'Neu', PASSWORD_HASH('geheim'));"],
    ['Zum Admin machen (UPDATE)', "UPDATE users SET role = 'admin' WHERE username = 'neu_hier';"]
  ];

  function lit(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  /* ── Worker mit Zeitlimit ─────────────────────────────────── */
  function makeWorker() {
    let w = null, seq = 0, pending = new Map(), script = null;
    function start() {
      w = new Worker('js/dbworker.js?v=' + V);
      w.onmessage = (ev) => {
        const p = pending.get(ev.data.id);
        if (!p) return;
        pending.delete(ev.data.id);
        clearTimeout(p.timer);
        ev.data.ok ? p.res(ev.data.r) : p.rej(new Error(ev.data.error));
      };
    }
    function call(op, a, ms) {
      if (!w) start();
      return new Promise((res, rej) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          // hängt: Worker weg, mit dem letzten Stand neu
          try { w.terminate(); } catch (e) { /* egal */ }
          w = null;
          for (const p of pending.values()) { clearTimeout(p.timer); p.rej(new Error('abgebrochen')); }
          pending.clear();
          rej(new Error('Die Abfrage hat zu lange gedauert (über 8 Sekunden) und wurde abgebrochen.'));
          if (script) call('open', { script }, 20000).catch(() => {});
        }, ms || 8000);
        pending.set(id, { res, rej, timer });
        w.postMessage({ id, op, a });
      });
    }
    return {
      open(s) { script = s; return call('open', { script: s }, 20000); },
      run(sql) { return call('run', { sql }, 8000); },
      rows(tables) { return call('rows', { tables }, 8000); },
      stop() { if (w) w.terminate(); w = null; }
    };
  }

  function create(host, opts) {
    const api = opts.api;          // (fn, args) → Promise
    const toast = opts.toast || (() => {});
    const W = makeWorker();
    let tables = [];               // Namen in ORDER-Reihenfolge
    let base = null;               // { t: Map(key → row-Objekt) }
    let schema = null;
    let tab = 'sql';
    let busy = false;
    let diagram = null;
    let curTable = null;

    host.innerHTML =
      '<div class="db">' +
        '<div class="db-bar">' +
          '<nav class="db-tabs">' +
            '<button type="button" data-t="sql" class="on">SQL</button>' +
            '<button type="button" data-t="data">Daten</button>' +
            '<button type="button" data-t="diagram">Diagramm</button>' +
          '</nav>' +
          '<span class="db-state" id="dbState"></span>' +
          '<button type="button" class="btn btn--ghost btn--s" id="dbReload" title="Neuen Stand vom Hub holen">↻ Neu laden</button>' +
        '</div>' +
        '<div class="db-tables" id="dbTables"></div>' +
        '<section class="db-pane" data-p="sql">' +
          '<div class="db-tools">' +
            '<button type="button" class="btn btn--accent" id="dbRun">▶ Ausführen</button>' +
            '<select id="dbEx" class="db-ex"><option value="">Beispiele …</option></select>' +
            '<span class="db-hint">Strg + Enter · INSERT, UPDATE und DELETE ändern den echten Hub</span>' +
          '</div>' +
          '<div class="sql-ed" id="dbEd"></div>' +
          '<div class="db-out" id="dbOut"><p class="muted">Schreib eine Abfrage und tippe auf Ausführen.</p></div>' +
        '</section>' +
        '<section class="db-pane" data-p="data" hidden><div class="db-out" id="dbData"></div></section>' +
        '<section class="db-pane db-pane--dg" data-p="diagram" hidden><div class="dg-host" id="dbDg"></div></section>' +
      '</div>';
    const $ = s => host.querySelector(s);

    const editor = window.SQLEditor.create($('#dbEd'), {
      getSchema: () => schema,
      onRun: () => run()
    });
    editor.value = 'SELECT * FROM users;';

    host.querySelectorAll('.db-tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
    $('#dbRun').addEventListener('click', () => run());
    $('#dbReload').addEventListener('click', () => load(true));
    $('#dbEx').addEventListener('change', (e) => {
      const ex = EXAMPLES[+e.target.value];
      e.target.value = '';
      if (ex) { editor.value = ex[1]; editor.focus(); }
    });

    function state(t, bad) {
      const el = $('#dbState');
      el.textContent = t || '';
      el.className = 'db-state' + (bad ? ' bad' : '');
    }

    function show(t) {
      tab = t;
      host.querySelectorAll('.db-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      host.querySelectorAll('.db-pane').forEach(p => { p.hidden = p.dataset.p !== t; });
      if (t === 'diagram') drawDiagram();
      if (t === 'data') showData(curTable || tables[0]);
    }

    function drawDiagram() {
      if (!schema) return;
      if (!diagram) diagram = window.SQLDiagram.create($('#dbDg'), {});
      diagram.render(schema, null);
    }

    function paintTables() {
      $('#dbTables').innerHTML = tables.map(t => {
        const n = base && base[t] ? base[t].size : 0;
        return '<button type="button" class="db-tbl" data-tbl="' + esc(t) + '"><b>' + esc(t) + '</b><span>' + n + '</span></button>';
      }).join('');
      host.querySelectorAll('.db-tbl').forEach(b => b.addEventListener('click', () => {
        curTable = b.dataset.tbl;
        if (tab === 'data') showData(curTable);
        else { editor.value = 'SELECT * FROM ' + curTable + ';'; run(); }
      }));
      const sel = $('#dbEx');
      sel.innerHTML = '<option value="">Beispiele …</option>' + EXAMPLES.map((e, i) =>
        (!e[2] || tables.includes(e[2])) ? '<option value="' + i + '">' + esc(e[0]) + '</option>' : '').join('');
    }

    function resultHtml(r) {
      if (r.kind === 'rows') {
        if (!r.rows.length) return '<div class="res"><p class="muted">Keine Zeilen.</p></div>';
        return '<div class="res"><div class="res-n">' + r.rows.length + (r.truncated ? '+' : '') + ' Zeile' + (r.rows.length === 1 ? '' : 'n') + '</div>' +
          '<div class="res-scroll"><table class="grid"><thead><tr>' + r.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
          r.rows.map(row => '<tr>' + row.map(v => v === null ? '<td class="null">NULL</td>' : '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') +
          '</tbody></table></div></div>';
      }
      if (r.kind === 'error') {
        return '<div class="res res--bad"><b>Fehler:</b> ' + esc(r.message) + (r.hint ? '<div class="res-hint">' + esc(r.hint) + '</div>' : '') + '</div>';
      }
      return '<div class="res res--ok">' + esc(r.message || 'Erledigt.') + '</div>';
    }

    async function showData(t) {
      if (!t) { $('#dbData').innerHTML = '<p class="muted">Keine Tabelle.</p>'; return; }
      curTable = t;
      try {
        const r = await W.run('SELECT * FROM ' + t + ';');
        $('#dbData').innerHTML = '<h3 class="db-h">' + esc(t) + '</h3>' + r.results.map(resultHtml).join('');
      } catch (e) { $('#dbData').innerHTML = '<div class="res res--bad">' + esc(e.message) + '</div>'; }
    }

    /* ── Schnappschuss → SQLite ─────────────────────────────── */
    async function load(manual) {
      state('lädt …');
      const res = await api('sh_db_snapshot', {});
      if (!res || !res.ok) { state(res && res.error === 'not_admin' ? 'Nur für Admins.' : 'Konnte den Hub nicht laden.', true); return false; }
      const snap = res.tables || {};
      tables = ORDER.filter(t => snap[t]);
      let script = '';
      for (const t of tables) {
        script += DDL[t] + '\n';
        const { cols, rows } = snap[t];
        for (let i = 0; i < rows.length; i += 200) {
          script += 'INSERT INTO ' + t + ' (' + cols.join(', ') + ') VALUES\n' +
            rows.slice(i, i + 200).map(r => '(' + r.map(lit).join(', ') + ')').join(',\n') + ';\n';
        }
      }
      try {
        const o = await W.open(script);
        schema = o.schema;
        await readBase();
        paintTables();
        state(manual ? 'Neu geladen.' : '');
        if (tab === 'diagram') drawDiagram();
        if (tab === 'data') showData(curTable || tables[0]);
        return true;
      } catch (e) {
        state('Fehler beim Aufbauen: ' + e.message, true);
        return false;
      }
    }

    async function readBase() {
      const all = await W.rows(tables);
      base = {};
      for (const t of tables) base[t] = toMap(t, all[t]);
    }

    function toMap(t, d) {
      const m = new Map();
      const pk = pkOf(t);
      for (const row of d.rows) {
        const o = {};
        d.cols.forEach((c, i) => { o[c] = row[i]; });
        m.set(pk.map(k => o[k]).join('|'), o);
      }
      return m;
    }

    // CURRENT_TIMESTAMP in SQLite ist UTC — eine gerade erzeugte Zeit
    // lässt der Server selbst setzen (deutsche Zeit).
    function fixNow(o) {
      if (typeof o.created_at === 'string') {
        const t = Date.parse(o.created_at.replace(' ', 'T') + 'Z');
        if (!isNaN(t) && Math.abs(Date.now() - t) < 120000) o.created_at = null;
      }
      return o;
    }

    async function diff() {
      const all = await W.rows(tables);
      const after = {};
      for (const t of tables) after[t] = toMap(t, all[t]);
      const dels = [], ups = [];
      for (const t of ORDER.slice().reverse()) {
        if (!after[t]) continue;
        for (const [k, o] of base[t]) if (!after[t].has(k)) {
          const key = {}; pkOf(t).forEach(c => { key[c] = o[c]; });
          dels.push({ t, op: 'delete', key });
        }
      }
      for (const t of ORDER) {
        if (!after[t]) continue;
        for (const [k, o] of after[t]) {
          const was = base[t].get(k);
          if (!was) ups.push({ t, op: 'insert', row: fixNow(Object.assign({}, o)) });
          else if (JSON.stringify(was) !== JSON.stringify(o)) {
            const key = {}; pkOf(t).forEach(c => { key[c] = o[c]; });
            ups.push({ t, op: 'update', key, row: o });
          }
        }
      }
      return dels.concat(ups);
    }

    async function run() {
      if (busy) return;
      const sql = editor.value;
      if (!sql.trim()) return;
      busy = true;
      editor.clearMark();
      $('#dbRun').disabled = true;
      try {
        const r = await W.run(sql);
        schema = r.schema;
        let html = r.results.map(resultHtml).join('');
        const err = r.results.find(x => x.kind === 'error');
        if (err && err.start != null) editor.markError(err.start, err.end);
        if (r.changed) {
          const ops = await diff();
          if (ops.length) {
            state('wird übernommen …');
            const res = await api('sh_db_apply', { p_ops: ops });
            if (res && res.ok) {
              html = '<div class="res res--live">✓ ' + ops.length + ' Änderung' + (ops.length === 1 ? '' : 'en') + ' im Hub übernommen – für alle sichtbar.</div>' + html;
              state('');
              toast('Hub geändert');
              opts.onChanged && opts.onChanged();
              await load(false);
            } else {
              html = '<div class="res res--bad"><b>Der Hub hat die Änderung abgelehnt:</b> ' +
                esc((res && (res.message || res.error)) || 'unbekannt') + '<div class="res-hint">Nichts wurde geändert. Die Kopie wird neu geladen.</div></div>' + html;
              await load(false);
            }
          }
        }
        $('#dbOut').innerHTML = html || '<p class="muted">Nichts zu tun.</p>';
        paintTables();
      } catch (e) {
        $('#dbOut').innerHTML = '<div class="res res--bad">' + esc(e.message) + '</div>';
      } finally {
        busy = false;
        $('#dbRun').disabled = false;
      }
    }

    load(false);
    return {
      reload: () => load(true),
      destroy: () => W.stop()
    };
  }

  window.SHDB = { create };
})();
