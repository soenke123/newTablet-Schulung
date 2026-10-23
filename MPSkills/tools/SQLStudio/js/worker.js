/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/worker.js   ·   Die Datenbank im Hintergrund
   ══════════════════════════════════════════════════════════════
   sql.js und der Kern laufen hier, nicht auf der Seite. Grund: eine
   Abfrage ohne Ende (WITH RECURSIVE ohne LIMIT, ein Kreuzprodukt
   über fünf Tabellen) würde sonst das ganze Tablet einfrieren. So
   friert nur dieser Worker ein, und die Seite beendet ihn nach ein
   paar Sekunden (js/client.js) und startet ihn mit dem letzten
   gesicherten Stand neu.

   Es ist immer genau EINE Datenbank offen.
   ══════════════════════════════════════════════════════════════ */

/* global initSqlJs, SQLCore */
const V = '?v=20261023b';
importScripts('../lib/sql-wasm.js' + V, 'core.js' + V);

let SQL = null;
let db = null;
const ready = initSqlJs({ locateFile: f => '../lib/' + f + V }).then(s => { SQL = s; });

function bytes() {
  return SQLCore.exportBytes(db);
}

const OPS = {
  /* { bytes } oder { script } → öffnet; bei script wird gebaut und
     der fertige Stand zurückgegeben (System-Datenbanken). */
  open(a) {
    if (db) { try { db.close(); } catch (e) { /* egal */ } }
    db = SQLCore.open(SQL, a.bytes || null);
    let out = null;
    if (a.script) {
      const r = SQLCore.run(db, a.script, { rights: 'create' });
      const err = r.results.find(x => x.kind === 'error');
      if (err) throw new Error('Vorlage kaputt: ' + err.message + ' — ' + err.sql.slice(0, 80));
      out = bytes();
    }
    return { schema: SQLCore.schema(db), bytes: out };
  },
  run(a) {
    const r = SQLCore.run(db, a.sql, { rights: a.rights, createDb: a.createDb, readOnly: a.readOnly, maxRows: a.maxRows || 1000, offset: a.offset || 0 });
    if (r.changed) r.bytes = bytes();
    r.schema = SQLCore.schema(db);
    return r;
  },
  schema() { return SQLCore.schema(db); },
  page(a) { return SQLCore.page(db, a.table, a); },
  dump(a) { return SQLCore.dump(db, a.title); },
  export() { return bytes(); },
  close() { if (db) { db.close(); db = null; } return true; }
};

self.onmessage = async (ev) => {
  const { id, op, a } = ev.data;
  try {
    await ready;
    if (!db && op !== 'open' && op !== 'close') throw new Error('Keine Datenbank geöffnet.');
    const r = OPS[op](a || {});
    const transfer = [];
    if (r && r.bytes instanceof Uint8Array) transfer.push(r.bytes.buffer);
    else if (r instanceof Uint8Array) transfer.push(r.buffer);
    self.postMessage({ id, ok: true, r }, transfer);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
