/**
 * Automatisch sichern: the document that has not been exported yet is kept in this browser's IndexedDB, so a reload,
 * a closed tab or a tablet that drops the page loses nothing. Nothing leaves the device.
 * Store 'doc' holds one record 'current' (pages with marks/comments/edits, form values, watermark, properties, ids,
 * source list without bytes); store 'sources' holds the bytes of each source by id, written once per source.
 * sessionDoc()/restoredState() are pure (tested), the rest needs indexedDB.
 */
export const SESSION_VERSION = 1;
const DB_NAME = 'master-pdf-skill';
const DOC_KEY = 'current';

/** Everything that is needed to rebuild the document from the source bytes (structured-clone friendly, no PDF.js objects). */
export function sessionDoc(state, name = '') {
  const sources = [...state.sources.values()].map(s => ({
    id: s.id, name: s.name, color: s.color, tint: s.tint,
    ...(s.blank ? { blank: true, blankKey: s.blankKey } : {}),
    ...(s.ocr ? { ocr: s.ocr } : {})
  }));
  return {
    version: SESSION_VERSION, savedAt: Date.now(), name,
    pages: state.pages, sources,
    selected: [...state.selected], anchor: state.anchor, activePageId: state.activePageId,
    forms: [...state.forms], watermark: state.watermark ?? null, meta: state.meta ?? null, nextId: state.nextId
  };
}

/** The document part of a saved session, limited to the sources that could be opened again. */
export function restoredState(doc, openedIds) {
  const pages = (doc.pages || []).filter(p => openedIds.has(p.sourceId));
  const ids = new Set(pages.map(p => p.id));
  const activePageId = ids.has(doc.activePageId) ? doc.activePageId : pages[0]?.id ?? null;
  const selected = new Set((doc.selected || []).filter(id => ids.has(id)));
  if (!selected.size && activePageId != null) selected.add(activePageId);
  const usedIds = pages.flatMap(p => [p.id, ...(p.marks || []).map(m => m.id), ...(p.comments || []).flatMap(c => [c.id, ...(c.replies || []).map(r => r.id)])]).filter(Number.isFinite);
  return {
    pages, selected, activePageId,
    anchor: ids.has(doc.anchor) ? doc.anchor : activePageId,
    forms: new Map(doc.forms || []),
    watermark: doc.watermark ?? null, meta: doc.meta ?? null,
    nextId: Math.max(Number(doc.nextId) || 1, ...usedIds.map(id => id + 1))
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB fehlt')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { const db = request.result; for (const name of ['doc', 'sources']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
}
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('abgebrochen')); });
let dbPromise = null;
const db = () => (dbPromise ||= openDb().catch(error => { dbPromise = null; throw error; }));

/** Writes the doc record, the bytes of new sources ([{id, bytes}]) and removes stored sources that are not in keepIds – one transaction. */
export async function saveSession(doc, newSources, keepIds) {
  const tx = (await db()).transaction(['doc', 'sources'], 'readwrite');
  const finished = done(tx);
  tx.objectStore('doc').put(doc, DOC_KEY);
  const store = tx.objectStore('sources');
  for (const s of newSources) store.put(s.bytes, s.id);
  const keep = new Set(keepIds);
  store.getAllKeys().onsuccess = e => { for (const key of e.target.result) if (!keep.has(key)) store.delete(key); };
  await finished;
}

/** {doc, bytes: Map id → Uint8Array} or null when nothing (usable) is stored. */
export async function loadSession() {
  const tx = (await db()).transaction(['doc', 'sources'], 'readonly');
  const finished = done(tx);
  let doc = null; const bytes = new Map();
  tx.objectStore('doc').get(DOC_KEY).onsuccess = e => { doc = e.target.result || null; };
  const store = tx.objectStore('sources');
  store.openCursor().onsuccess = e => { const cursor = e.target.result; if (!cursor) return; bytes.set(cursor.key, cursor.value); cursor.continue(); };
  await finished;
  if (!doc || doc.version !== SESSION_VERSION || !doc.pages?.length) return null;
  return { doc, bytes };
}

export async function clearSession() {
  const tx = (await db()).transaction(['doc', 'sources'], 'readwrite');
  const finished = done(tx);
  tx.objectStore('doc').clear(); tx.objectStore('sources').clear();
  await finished;
}
