/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Balance of Nature"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Ökosystem-Simulation auf einer Insel (Migration 0213, Beta).

   Eingerahmt wie NeuroLab und SYNIR: die Simulation ist eine eigene
   Seite (index.html + js/ + css/) und läuft auch allein. Im Raum
   bekommt sie ?raum=lehrer bzw. ?raum=schueler und zeigt dann nur
   die Insel und die vier festen Szenarien (js/ui/room.js ist die
   Gegenseite dieser Datei).

   Was der Raum tut: die Lehrkraft gibt Szenarien frei
   (skill_room_state.data.shared = [1, 3]), die Tablets sehen nur
   die freigegebenen. Mit data.types = true dürfen alle oben den
   Inseltyp wählen (ausgewogen, Gras, Wald, Fels), sonst nur die
   ausgewogene Insel. Gerechnet wird auf jedem Gerät für sich —
   geteilt wird nur, WELCHES Szenario gespielt werden darf. Eigene
   Szenarien gibt es (noch) nicht.

   Botschaften (gleicher Ursprung):
     hinein   { type: 'bon:cmd', shared: [1, 3], types: false }
     heraus   { type: 'bon:ready' }            Rahmen steht
              { type: 'bon:share', id, on }    Lehrkraft teilt/entzieht
              { type: 'bon:types', on }        Lehrkraft: Inseltypen an/aus

   Im Schaufenster (ctx.preview) läuft ?demo=1: die Insel spielt
   ihre Geschichte von selbst (js/ui/demo.js).

   ⚠️ Wer an index.html, js/ oder css/ arbeitet, zieht V hoch.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261019e';
  const DIR = 'tools/balance%20of%20nature/';
  const GAP = 12;
  const MIN = 460;

  let root = null, ctx = null, view = null, frame = null;
  let onMsg = null, onResize = null;
  let ready = false, lastSent = '';
  let shared = null;             // Lehrkraft: eigener Stand, bis der Server ihn bestätigt
  let types = null;              // dasselbe für die Inseltypen

  const isPresenter = () => !!ctx && ctx.role === 'presenter';

  function data() { return (view && view.state && view.state.data) || {}; }
  function serverShared() {
    const s = data().shared;
    return Array.isArray(s) ? s.map(Number).filter(n => n >= 1 && n <= 4) : [];
  }
  const currentShared = () => shared || serverShared();
  const currentTypes = () => types !== null ? types : data().types === true;

  function post() {
    if (!ready || !frame || !frame.contentWindow) return;
    const msg = { type: 'bon:cmd', shared: currentShared().slice().sort(), types: currentTypes() };
    const key = JSON.stringify(msg);
    if (key === lastSent) return;
    lastSent = key;
    try { frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* zu */ }
  }

  /* skill_room_set_state ersetzt `data` als GANZES — deshalb geht
     der vollständige Zustand hinaus (wie bei SYNIR). */
  async function share(id, on) {
    let list = currentShared().filter(x => x !== id);
    if (on) list.push(id);
    shared = list;
    post();
    await save({ shared: list });
    shared = null;
    ctx.refresh();
  }

  async function setTypes(on) {
    types = on;
    post();
    await save({ types: on });
    types = null;
    ctx.refresh();
  }

  async function save(change) {
    const next = Object.assign({}, data(), { shared: currentShared(), types: currentTypes() }, change);
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    const res = await ctx.actions.setData(next);
    if (res && !res.ok && res.error !== 'network') ctx.toast(ctx.errText(res.error));
  }

  /* Platz unter dem Rahmen — dieselbe Rechnung wie in
     tools/NeuroLab/tool.js (Begründung dort). */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight
             + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fit() {
    if (!frame) return;
    const top = frame.getBoundingClientRect().top;
    const h   = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  window.MPTool.register('balance', {

    /* Nichts einzustellen: die Szenarien sind fest, freigegeben wird
       im Skill selbst. */
    settingsFields: [],

    mount(el, c) {
      root = el;
      ctx = c;
      ready = false;
      lastSent = '';
      const q = ctx.preview ? '?demo=1&v=' + V
              : '?raum=' + (isPresenter() ? 'lehrer' : 'schueler') + '&v=' + V;
      root.innerHTML =
        '<div class="bon-host">' +
          '<iframe class="bon-frame" src="' + DIR + 'index.html' + q + '#seed=482917&size=mittel" ' +
                  'title="Balance of Nature" loading="eager"></iframe>' +
        '</div>';
      frame = root.querySelector('.bon-frame');
      if (!ctx.preview) document.body.classList.add('tool-fill');

      onMsg = (e) => {
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
        const m = e.data || {};
        if (m.type === 'bon:ready') { ready = true; lastSent = ''; post(); }
        else if (m.type === 'bon:share' && isPresenter() && !ctx.preview) share(Number(m.id), !!m.on);
        else if (m.type === 'bon:types' && isPresenter() && !ctx.preview) setTypes(!!m.on);
      };
      window.addEventListener('message', onMsg);
      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    update(v) {
      view = v;
      post();
    },

    unmount() {
      if (onMsg) window.removeEventListener('message', onMsg);
      if (onResize) window.removeEventListener('resize', onResize);
      onMsg = onResize = null;
      document.body.classList.remove('tool-fill');
      frame = root = ctx = view = null;
      shared = types = null;
    }
  });
})();
