/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/client.js   ·   Worker und Gerätespeicher
   ══════════════════════════════════════════════════════════════
   SQLWorker  — schickt Aufträge an js/worker.js und wartet auf die
                Antwort. Dauert eine länger als LIMIT_MS, wird der
                Worker beendet und mit dem letzten Stand neu gestartet.
   SQLStore   — die Datenbanken im Gerät (IndexedDB), getrennt nach
                Raum (scope). Etappe 1: alles bleibt auf dem Tablet.
                Geht IndexedDB nicht (privates Fenster), läuft alles
                im Speicher weiter und die App sagt das an.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '?v=20261023c';
  const LIMIT_MS = 8000;

  /* ─── Worker ─────────────────────────────────────────────── */
  let w = null;
  let seq = 0;
  const waiting = new Map();
  let lastBytes = null;          // Stand, mit dem nach einem Abbruch neu geöffnet wird

  function spawn() {
    w = new Worker('js/worker.js' + V);
    w.onmessage = (ev) => {
      const { id, ok, r, error } = ev.data;
      const p = waiting.get(id);
      if (!p) return;
      waiting.delete(id);
      clearTimeout(p.timer);
      if (ok) p.resolve(r); else p.reject(new Error(error));
    };
    w.onerror = (ev) => {
      const err = new Error(ev.message || 'Die Datenbank ist abgestürzt.');
      waiting.forEach(p => { clearTimeout(p.timer); p.reject(err); });
      waiting.clear();
    };
  }

  async function restart() {
    try { w.terminate(); } catch (e) { /* egal */ }
    waiting.forEach(p => { clearTimeout(p.timer); p.reject(new Error('neu gestartet')); });
    waiting.clear();
    spawn();
    if (lastBytes) await call('open', { bytes: lastBytes.slice() }, { noTimeout: true });
  }

  function call(op, a, opt = {}) {
    if (!w) spawn();
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const p = { resolve, reject, timer: null };
      if (!opt.noTimeout) {
        p.timer = setTimeout(() => {
          waiting.delete(id);
          const e = new Error('timeout');
          e.timeout = true;
          reject(e);
          restart().catch(() => { /* meldet der nächste Aufruf */ });
        }, opt.timeout || LIMIT_MS);
      }
      waiting.set(id, p);
      // bytes werden kopiert, nicht übertragen: die Seite behält sie.
      w.postMessage({ id, op, a });
    });
  }

  window.SQLWorker = {
    call,
    async open(bytes, script) {
      const r = await call('open', bytes ? { bytes: bytes.slice() } : { script }, { timeout: 20000 });
      lastBytes = bytes || r.bytes || null;
      return r;
    },
    remember(bytes) { if (bytes) lastBytes = bytes; },
    LIMIT_MS
  };

  /* ─── Gerätespeicher ─────────────────────────────────────── */
  const DBNAME = 'sqlstudio';
  const STORE = 'dbs';
  let idb = null;
  let memory = null;             // Ersatz ohne IndexedDB

  function openIdb() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DBNAME, 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('scope', 'scope');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }

  function tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const t = idb.transaction(STORE, mode);
      const s = t.objectStore(STORE);
      let out;
      Promise.resolve(fn(s, v => { out = v; })).catch(reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  window.SQLStore = {
    get persistent() { return !!idb; },
    // memory: nichts ins Gerät schreiben (Schaufenster, ?demo=1)
    async init(opts) {
      idb = opts && opts.memory ? null : await openIdb();
      if (!idb) memory = new Map();
      return !!idb;
    },
    async list(scope) {
      if (memory) return [...memory.values()].filter(r => r.scope === scope).map(meta);
      return tx('readonly', (s, set) => {
        const req = s.index('scope').getAll(scope);
        req.onsuccess = () => set(req.result.map(meta));
      });
    },
    async get(id) {
      if (memory) return memory.get(id) || null;
      return tx('readonly', (s, set) => {
        const req = s.get(id);
        req.onsuccess = () => set(req.result || null);
      });
    },
    async put(rec) {
      rec.updated = Date.now();
      if (memory) { memory.set(rec.id, rec); return rec; }
      await tx('readwrite', s => { s.put(rec); });
      return rec;
    },
    async patch(id, fields) {
      const rec = await this.get(id);
      if (!rec) return null;
      Object.assign(rec, fields);
      return this.put(rec);
    },
    async remove(id) {
      if (memory) { memory.delete(id); return; }
      await tx('readwrite', s => { s.delete(id); });
    }
  };

  // Liste ohne die Bytes — die braucht nur, wer öffnet.
  function meta(r) {
    const { bytes, ...m } = r;
    m.size = bytes ? bytes.length : 0;
    return m;
  }
})();
