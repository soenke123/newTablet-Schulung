/* Zentraler Store + Mini-Pub/Sub. Rückgrat zwischen Textauswahl-Drawer und den drei Phasen. */
const State = (() => {
  const listeners = { 'corpus-changed': [], 'phase-changed': [] };
  function on(evt, fn) { (listeners[evt] || (listeners[evt] = [])).push(fn); }
  function emit(evt, payload) { (listeners[evt] || []).forEach(fn => fn(payload)); }

  const selectedIds = new Set();
  let corpusVersion = 0;
  let phase3Dirty = true;
  let activePhase = 1;
  let rebuildTimer = null;

  function initDefaultSelection() {
    selectedIds.clear();
    Corpus.allTexts().forEach(t => { if (!t.own) selectedIds.add(t.id); });
  }

  function activeTexts() {
    return Corpus.allTexts().filter(t => selectedIds.has(t.id));
  }

  function scheduleRebuild() {
    corpusVersion++;
    phase3Dirty = true;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      emit('corpus-changed', { version: corpusVersion });
    }, 300);
  }

  function toggleText(id, on) {
    const isOn = on == null ? !selectedIds.has(id) : on;
    if (isOn) selectedIds.add(id); else selectedIds.delete(id);
    scheduleRebuild();
  }
  function setWorld(themeId, on) {
    Corpus.allTexts().forEach(t => {
      const belongs = (t.own && themeId === 'eigen') || t.theme === themeId;
      if (belongs) { if (on) selectedIds.add(t.id); else selectedIds.delete(t.id); }
    });
    scheduleRebuild();
  }
  function addOwnText(text) {
    Corpus.addOwn(text);
    const id = 'own:' + (Corpus.allTexts().filter(t => t.own).length - 1);
    selectedIds.add(id);
    scheduleRebuild();
  }
  function removeOwnText(id) {
    Corpus.removeOwn(id);
    // IDs aller eigenen Texte nach dem entfernten verschieben sich -> Auswahl auf own-Texte neu aufbauen
    const stillOwn = new Set();
    Corpus.allTexts().forEach(t => { if (t.own) stillOwn.add(t.id); });
    [...selectedIds].forEach(sid => { if (sid.startsWith('own:') && !stillOwn.has(sid)) selectedIds.delete(sid); });
    scheduleRebuild();
  }
  /* Text bearbeiten/zurücksetzen: Inhalt ändert sich -> Modelle neu bauen lassen. */
  function updateText(id, patch) {
    Corpus.updateText(id, patch);
    scheduleRebuild();
  }
  function resetText(id) {
    Corpus.resetText(id);
    scheduleRebuild();
  }
  function setActivePhase(p) {
    activePhase = p;
    emit('phase-changed', { phase: p });
  }

  initDefaultSelection();

  return {
    on, emit,
    selectedIds, activeTexts,
    toggleText, setWorld, addOwnText, removeOwnText, updateText, resetText,
    scheduleRebuild,
    get corpusVersion() { return corpusVersion; },
    get phase3Dirty() { return phase3Dirty; },
    clearPhase3Dirty() { phase3Dirty = false; },
    get activePhase() { return activePhase; },
    setActivePhase
  };
})();
