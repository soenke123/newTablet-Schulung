/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/db.js   ·   SQL und Diagramm im Adminbereich
   ══════════════════════════════════════════════════════════════
   Wie SQL Studio (dessen Editor, Kern und Klassendiagramm werden
   mitbenutzt), aber die Datenbank ist das Netzwerk selbst:

     1. sh_db_snapshot holt die erstellten Tabellen (nur Admins).
        Die Reiter SQL / Diagramm stehen oben im Kopf (app.js), hier
        nur show('sql'|'diagram'). Einen Daten-Reiter gibt es nicht:
        geschaut wird mit SELECT.
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

  const V = '20261105w';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const DDL = {
    users: `CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(60),
  email VARCHAR(100),
  password VARCHAR(100) NOT NULL,
  gender ENUM('male','female','diverse'),
  bio TEXT,
  avatar VARCHAR(60),
  birthday DATE,
  city VARCHAR(60),
  country VARCHAR(60),
  centimeter INT CHECK (centimeter BETWEEN 50 AND 250),
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`,
    photos: `CREATE TABLE photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  image VARCHAR(60) NOT NULL,
  description TEXT,
  taken_at DATETIME,
  camera VARCHAR(80),
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
  kind ENUM('heart','thumb','laugh') NOT NULL DEFAULT 'heart',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, photo_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);`,
    photo_tag: `CREATE TABLE photo_tag (
  photo_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (photo_id, tag_id),
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);`,
    // Analytics (0270): sessions = ein Besuch, views = ein angesehenes Foto
    sessions: `CREATE TABLE sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  ip VARCHAR(45),
  user_agent VARCHAR(400),
  browser VARCHAR(60),
  os VARCHAR(60),
  device_type ENUM('phone','tablet','desktop'),
  device VARCHAR(80),
  screen_width INT,
  screen_height INT,
  pixel_ratio DECIMAL(3,1),
  language VARCHAR(20),
  timezone VARCHAR(60),
  dark_mode BOOLEAN,
  connection VARCHAR(20),
  allow_location BOOLEAN,
  allow_camera BOOLEAN,
  allow_microphone BOOLEAN,
  allow_notifications BOOLEAN,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`,
    views: `CREATE TABLE views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  photo_id INT NOT NULL,
  session_id INT,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_ms INT,
  feed ENUM('foryou','following','profile','search','tag'),
  position INT,
  ended_by ENUM('swipe','like','comment','profile','tag','leave'),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);`,
    // Werbung (0276): Kampagnen; target_sql = „Wem?“, content_sql = „Was?“ (beworbene Fotos)
    ads: `CREATE TABLE ads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  name VARCHAR(60) NOT NULL,
  kind ENUM('ad','boost') NOT NULL DEFAULT 'ad',
  title VARCHAR(80),
  body TEXT,
  image VARCHAR(60),
  button VARCHAR(30),
  target_sql TEXT,
  content_sql TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);`
  };
  // Eltern vor Kindern (anlegen, einfügen); rückwärts = löschen
  const ORDER = ['users', 'tags', 'photos', 'sessions', 'comments', 'follows', 'likes', 'photo_tag', 'views', 'ads'];
  const PK = { follows: ['follower_id', 'following_id'], likes: ['user_id', 'photo_id'],
               photo_tag: ['photo_id', 'tag_id'] };
  const pkOf = t => PK[t] || ['id'];


  function lit(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';   // SQLite kennt kein BOOLEAN → 1/0
    if (typeof v === 'number') return String(v);
    // Der Kern liest Strings wie MySQL (\' und \\ sind Escapes): ohne das
    // Verdoppeln von \ könnte ein Text eines anderen Users („abc\“) aus
    // dem String ausbrechen und eigenes SQL in die Kopie schreiben.
    return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
  }

  // Schnappschuss → SQLite-Skript (CREATE TABLE + INSERT), Eltern vor Kindern
  function buildScript(snap) {
    const tables = ORDER.filter(t => snap[t]);
    let script = '';
    for (const t of tables) {
      script += DDL[t] + '\n';
      const { cols, rows } = snap[t];
      for (let i = 0; i < rows.length; i += 200) {
        script += 'INSERT INTO ' + t + ' (' + cols.join(', ') + ') VALUES\n' +
          rows.slice(i, i + 200).map(r => '(' + r.map(lit).join(', ') + ')').join(',\n') + ';\n';
      }
    }
    return { tables, script };
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
      // Werbung (0276): alle Zielgruppen / Probelauf – nur lesen
      ads(ads) { return call('ads', { ads }, 20000); },
      probe(sql, kind) { return call('adprobe', { sql, kind }, 8000); },
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
    let tab = opts.tab === 'diagram' ? 'diagram' : 'sql';
    let busy = false;
    let diagram = null;

    host.innerHTML =
      '<div class="db">' +
        '<div class="db-bar">' +
          '<span class="db-state" id="dbState"></span>' +
          '<button type="button" class="btn btn--ghost btn--s" id="dbReload" title="Neuen Stand aus dem Netzwerk holen">↻ Neu laden</button>' +
        '</div>' +
        '<div class="db-tables" id="dbTables"></div>' +
        '<section class="db-pane db-pane--sql" data-p="sql">' +
          '<div class="db-main">' +
            '<div class="db-tools">' +
              '<button type="button" class="btn btn--accent" id="dbRun">▶ Ausführen</button>' +
              '<span class="db-hint">Strg + Enter</span>' +
            '</div>' +
            '<div class="sql-ed" id="dbEd"></div>' +
            '<div class="db-out" id="dbOut"><p class="muted">Schreib eine Abfrage und tippe auf Ausführen.</p></div>' +
          '</div>' +
        '</section>' +
        '<section class="db-pane db-pane--dg" data-p="diagram" hidden><div class="dg-host" id="dbDg"></div></section>' +
      '</div>';
    const $ = s => host.querySelector(s);

    const editor = window.SQLEditor.create($('#dbEd'), {
      getSchema: () => schema,
      onRun: () => run()
    });
    editor.value = 'SELECT * FROM users;';

    $('#dbRun').addEventListener('click', () => run());
    $('#dbReload').addEventListener('click', () => load(true));

    function state(t, bad) {
      const el = $('#dbState');
      el.textContent = t || '';
      el.className = 'db-state' + (bad ? ' bad' : '');
    }

    function show(t) {
      tab = t === 'diagram' ? 'diagram' : 'sql';
      host.querySelectorAll('.db-pane').forEach(p => { p.hidden = p.dataset.p !== tab; });
      $('#dbTables').hidden = tab !== 'sql';
      if (tab === 'diagram') drawDiagram();
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
        editor.value = 'SELECT * FROM ' + b.dataset.tbl + ';';
        run();
      }));
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

    /* ── Schnappschuss → SQLite ─────────────────────────────── */
    // Während des Ladens wartet run() – sonst vergleicht ein Schreiben mit dem alten Stand
    let loading = null;
    function load(manual) {
      loading = loadNow(manual).finally(() => { loading = null; });
      return loading;
    }
    async function loadNow(manual) {
      state('lädt …');
      const res = await api('sh_db_snapshot', {});
      if (!res || !res.ok) { state(res && res.error === 'not_admin' ? 'Nur für Admins.' : 'Konnte das Netzwerk nicht laden.', true); return false; }
      const b = buildScript(res.tables || {});
      tables = b.tables;
      const script = b.script;
      try {
        const o = await W.open(script);
        schema = o.schema;
        await readBase();
        paintTables();
        state(manual ? 'Neu geladen.' : '');
        if (tab === 'diagram') drawDiagram();
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
      if (loading) { try { await loading; } catch (e) { /* zeigt state */ } }
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
              html = '<div class="res res--live">✓ ' + ops.length + ' Änderung' + (ops.length === 1 ? '' : 'en') + ' im Netzwerk übernommen – für alle sichtbar.</div>' + html;
              state('');
              toast('Netzwerk geändert');
              opts.onChanged && opts.onChanged();
              await load(false);
            } else {
              html = '<div class="res res--bad"><b>Das Netzwerk hat die Änderung abgelehnt:</b> ' +
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

    show(tab);
    load(false);
    return {
      show,
      reload: () => load(true),
      destroy: () => W.stop()
    };
  }

  window.SHDB = { create, DDL, worker: makeWorker, buildScript };
})();
