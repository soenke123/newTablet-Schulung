/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/dbworker.js   ·   Die Datenbank im Hintergrund
   ══════════════════════════════════════════════════════════════
   sql.js und der Kern von SQL Studio (geteilt, nicht kopiert) laufen
   hier, damit eine Abfrage ohne Ende nur den Worker einfriert
   (js/db.js beendet ihn nach 8 s).

   Die Datenbank ist eine KOPIE des Hubs (Schnappschuss vom Server).
   SELECT bleibt hier. Nach einer Änderung liest db.js alle Zeilen
   (op rows) und schickt den Unterschied an den Server.

   Dazu PASSWORD_HASH('…') — bcrypt wie auf dem Server ($2a$, Kosten 8),
   damit ein per INSERT angelegtes Konto sich auch anmelden kann.
   ══════════════════════════════════════════════════════════════ */

/* global initSqlJs, SQLCore, dcodeIO, SHAdsEval */
const V = '?v=20261106a';
const SQLS = '../../SQLStudio/';
importScripts(SQLS + 'lib/sql-wasm.js' + V, SQLS + 'js/core.js' + V, '../../../../vendor/bcryptjs-2.4.3.min.js', 'adseval.js' + V);

const bcrypt = dcodeIO.bcrypt;
bcrypt.setRandomFallback(n => Array.from(self.crypto.getRandomValues(new Uint8Array(n))));

let SQL = null;
let db = null;
const ready = initSqlJs({ locateFile: f => SQLS + 'lib/' + f + V }).then(s => { SQL = s; });

function extras() {
  const f = (name, fn) => { try { db.create_function(name, fn); } catch (e) { /* schon da */ } };
  f('PASSWORD_HASH', v => v === null ? null : bcrypt.hashSync(String(v), 8));
  f('BCRYPT', v => v === null ? null : bcrypt.hashSync(String(v), 8));
  f('PASSWORD_VERIFY', (pw, h) => {
    try { return pw !== null && h !== null && bcrypt.compareSync(String(pw), String(h)) ? 1 : 0; } catch (e) { return 0; }
  });
}

const OPS = {
  /* script = CREATE TABLE … + INSERT … (baut db.js aus dem Schnappschuss) */
  open(a) {
    if (db) { try { db.close(); } catch (e) { /* egal */ } }
    db = SQLCore.open(SQL, null);
    extras();
    // MySQL-Schreibweise (AUTO_INCREMENT, ENUM) übersetzt der Kern.
    const r = SQLCore.run(db, a.script, { rights: 'create', maxRows: 1 });
    const err = r.results.find(x => x.kind === 'error');
    if (err) throw new Error(err.message + ' — ' + String(err.sql || '').slice(0, 80));
    return { schema: SQLCore.schema(db) };
  },
  run(a) {
    // Recht „use“: SELECT, INSERT, UPDATE, DELETE — keine Struktur.
    const r = SQLCore.run(db, a.sql, { rights: 'use', createDb: false, maxRows: a.maxRows || 500 });
    // Eine offene Transaktion (BEGIN ohne COMMIT) gäbe es auf dem Server
    // nicht — hier wird alles sofort festgeschrieben.
    try { db.run('COMMIT'); } catch (e) { /* keine offen */ }
    r.schema = SQLCore.schema(db);
    return r;
  },
  /* alle Zeilen aller Tabellen: { t: { cols, rows } } */
  rows(a) {
    const out = {};
    for (const t of a.tables) {
      const st = db.prepare('SELECT * FROM "' + t + '"');
      const rows = [];
      try { while (st.step()) rows.push(st.get()); out[t] = { cols: st.getColumnNames(), rows }; }
      finally { st.free(); }
    }
    return out;
  },
  page(a) { return SQLCore.page(db, a.table, a); },
  /* Werbung (0276): Zielgruppen aller Kampagnen rechnen (nur lesen) */
  ads(a) { return SHAdsEval.all(SQLCore, db, a.ads || []); },
  adprobe(a) { return SHAdsEval.probe(SQLCore, db, a.sql, a.kind); },
  schema() { return SQLCore.schema(db); }
};

self.onmessage = async (ev) => {
  const { id, op, a } = ev.data;
  try {
    await ready;
    if (!db && op !== 'open') throw new Error('Keine Datenbank geöffnet.');
    self.postMessage({ id, ok: true, r: OPS[op](a || {}) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
