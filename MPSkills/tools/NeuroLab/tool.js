/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „NeuroLab"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Überarbeitet 20.11.2026 (ohne Migration). NeuroLab ist eine eigene Seite
   (index.html + app.js + js/) im <iframe>, eingerahmt wie Reinforce
   Yourself. Jede Person baut und trainiert ihre eigenen Netze, der Stand
   liegt im Gerät (localStorage neuron-sim-v2 / -lernen, nl.*).

   Geteilt wird nur, WAS die Klasse öffnen darf:
     skill_room_state.data.parts = ['neuron', 'n-wie', 'n-typen', 'bauen', 'v-revier', 'v-rechnen', 'b-frei', 'trainieren', 'sc-gatter', …]
   Bereichs-ids (neuron · bauen · trainieren) und Kachel-ids aus
   js/start.js. Eine Kachel ist offen, wenn Bereich UND Kachel geteilt
   sind. Fehlt parts: nur „Wie funktioniert ein Neuron?“. Keine eigenen
   Tabellen, skill_room_set_state reicht.

   Der Rahmen bekommt ?raum=lehrer bzw. ?raum=schueler, im Schaufenster
   ?demo=1 (dann alles offen, nichts gespeichert).
   Botschaften (gleicher Ursprung):
     hinein   { type: 'nl:cmd', parts: [...] }
     heraus   { type: 'nl:ready' }                 Rahmen steht
              { type: 'nl:parts', parts: [...] }   Lehrkraft ändert Freigaben
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261121a';

  let root = null, frame = null, ctx = null, view = null;
  let onResize = null, onMsg = null;
  let ready = false, lastSent = '';
  let parts = null;        // Lehrkraft: eigener Stand, bis der Server ihn bestätigt

  const DEFAULT = ['neuron', 'n-wie', 'n-typen'];
  const isPresenter = () => !!ctx && ctx.role === 'presenter';
  function data() { return (view && view.state && view.state.data) || {}; }
  function serverParts() {
    const d = data();
    return Array.isArray(d.parts) ? d.parts.map(String) : DEFAULT.slice();
  }
  const currentParts = () => parts || serverParts();

  function post() {
    if (!ready || !frame || !frame.contentWindow) return;
    const msg = { type: 'nl:cmd', parts: currentParts().slice() };
    const key = JSON.stringify(msg);
    if (key === lastSent) return;
    lastSent = key;
    try { frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* zu */ }
  }

  /* skill_room_set_state ersetzt `data` als GANZES — deshalb geht der
     vollständige Zustand hinaus (wie bei Reinforce Yourself). */
  async function setParts(list) {
    parts = list;
    post();
    const next = Object.assign({}, data(), { parts: list });
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    const res = await ctx.actions.setData(next);
    if (res && !res.ok && res.error !== 'network') ctx.toast(ctx.errText(res.error));
    parts = null;
    ctx.refresh();
  }

  const GAP = 12;          // Luft unter dem Rahmen
  const MIN = 520;         // damit auf einem kleinen Gerät nicht ein Streifen bleibt

  /* Wie viel Seite steht unter dem Rahmen noch an? Im Raum fast nichts,
     im Schaufenster (lib/preview.js) die Knöpfe des Modals. Dieselbe
     Summe wie in tools/wordcloud/tool.js. */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fit() {
    if (!frame) return;
    const top = frame.getBoundingClientRect().top;
    const h = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  window.MPTool.register('neurolab', {

    /* Nichts einzustellen — freigegeben wird im Skill selbst (Teilen an
       Bereich und Kachel). Die leere Liste sagt lehrer.js „keine
       Einstellungen" (und nicht „noch nicht geladen"). */
    settingsFields: [],

    mount(el, c) {
      root = el;
      ctx = c;
      ready = false;
      lastSent = '';
      /* Pfad relativ zur SEITE (j.html bzw. lehrer.html, beide in
         MPSkills/). Der Stempel gehört an die Rahmen-URL, sonst käme
         index.html aus dem Cache. */
      const q = ctx && ctx.preview ? '?demo=1&v=' + V
              : '?raum=' + (isPresenter() ? 'lehrer' : 'schueler') + '&v=' + V;
      root.innerHTML =
        '<div class="nl-host">' +
          '<iframe class="nl-frame" src="tools/NeuroLab/index.html' + q + '" ' +
                  'title="NeuroLab" loading="eager"></iframe>' +
        '</div>';
      frame = root.querySelector('.nl-frame');
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');

      onMsg = (e) => {
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
        const m = e.data || {};
        if (m.type === 'nl:ready') { ready = true; lastSent = ''; post(); }
        else if (m.type === 'nl:parts' && isPresenter() && !ctx.preview && Array.isArray(m.parts)) {
          setParts(m.parts.map(String));
        }
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
      parts = null;
    }
  });
})();
