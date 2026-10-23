/* Schaufenster (MPSkills/preview/tinylm.js): mit ?demo=1 merkt sich Tiny LM nichts.
   localStorage wird VOR allen anderen Skripten durch einen Speicher im Arbeitsspeicher
   ersetzt — so startet die Vorschau immer frisch (Phase 1, leerer Leitfaden, Standardtexte)
   und überschreibt nicht den Stand, mit dem jemand auf diesem Gerät gerade arbeitet. */
(function () {
  if (!/[?&]demo=1(&|$)/.test(location.search)) return;
  const m = new Map();
  const mem = {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
  try { Object.defineProperty(window, 'localStorage', { value: mem, configurable: true }); } catch (e) { /* dann eben echt */ }
})();
