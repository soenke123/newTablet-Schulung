/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Reinforce Yourself"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Reinforcement Learning zum Selbermachen (Migration 0242, Beta).
   Kam aus dem GameHub (S2 Reinforce Yourself!) — ohne Begleiter,
   ohne Zwischen-Quizze, ohne Punkte. Vier Phasen (Reiter 1–4,
   intern 0–3):
     0  Gegen die KI: Tic-Tac-Toe gegen eine KI, die aus jeder Partie
        lernt (mit Lernkurve) — erst gegen die KI, dann selbst die KI
     1  Trainingsphase (mit Einführung): als KI lernen, nur durch
        Belohnung und Bestrafung
     2  Umgebung A (Brettspiel) und Umgebung B (Aliens): das
        Gelernte anwenden
     3  Sandbox: beide Spiele gleichzeitig + Entscheidungsbaum

   Eingerahmt wie Tiny LM: die Anwendung ist eine eigene Seite
   (index.html) und steckt in einem <iframe>. Jede Person trainiert
   ihre eigene KI, der Stand liegt im Gerät (localStorage „ry.*“).
   Geteilt wird nur, WELCHE Phasen die Klasse öffnen darf:
   skill_room_state.data.phases = [0, 1] (fehlt = nur Phase 0),
   gesetzt von der Lehrkraft über das Teilen-Symbol am Reiter der
   Phase (wie bei Tiny LM). Keine eigenen Tabellen, skill_room_set_state reicht.

   Der Rahmen bekommt ?raum=lehrer bzw. ?raum=schueler.
   Botschaften (gleicher Ursprung):
     hinein   { type: 'ry:cmd', phases: [0, 1] }
     heraus   { type: 'ry:ready' }                 Rahmen steht
              { type: 'ry:phases', phases: [...] } Lehrkraft ändert Freigaben

   Im Schaufenster bekäme der Rahmen ?demo=1: dann ist alles offen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261030e';

  let root  = null;
  let frame = null;
  let ctx   = null;
  let view  = null;
  let onResize = null, onMsg = null;
  let ready = false, lastSent = '';
  let phases = null;       // Lehrkraft: eigener Stand, bis der Server ihn bestätigt

  const isPresenter = () => !!ctx && ctx.role === 'presenter';
  function data() { return (view && view.state && view.state.data) || {}; }
  function serverPhases() {
    const p = data().phases;
    return Array.isArray(p) ? p.map(Number).filter(n => n >= 0 && n <= 3) : [0];
  }
  const currentPhases = () => phases || serverPhases();

  function post() {
    if (!ready || !frame || !frame.contentWindow) return;
    const msg = { type: 'ry:cmd', phases: currentPhases().slice().sort() };
    const key = JSON.stringify(msg);
    if (key === lastSent) return;
    lastSent = key;
    try { frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* zu */ }
  }

  /* skill_room_set_state ersetzt `data` als GANZES — deshalb geht
     der vollständige Zustand hinaus (wie bei Balance of Nature). */
  async function setPhases(list) {
    phases = list;
    post();
    const next = Object.assign({}, data(), { phases: list });
    if (view) view.state = Object.assign({}, view.state || {}, { data: next });
    const res = await ctx.actions.setData(next);
    if (res && !res.ok && res.error !== 'network') ctx.toast(ctx.errText(res.error));
    phases = null;
    ctx.refresh();
  }

  const GAP = 12;          // Luft unter dem Rahmen
  const MIN = 460;         // damit auf einem kleinen Gerät nicht ein Streifen bleibt

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

  window.MPTool.register('reinforce', {

    /* Nichts einzustellen — freigegeben wird im Skill selbst. Die
       leere Liste sagt lehrer.js „keine Einstellungen" (und nicht
       „noch nicht geladen"). */
    settingsFields: [],

    mount(el, c) {
      root = el;
      ctx = c;
      ready = false;
      lastSent = '';
      /* Pfad relativ zur SEITE (j.html bzw. lehrer.html, beide in
         MPSkills/). Der Stempel gehört an die Rahmen-URL, sonst käme
         index.html aus dem Cache (siehe NeuroLab). */
      const q = ctx && ctx.preview ? '?demo=1&v=' + V
              : '?raum=' + (isPresenter() ? 'lehrer' : 'schueler') + '&v=' + V;
      root.innerHTML =
        '<div class="ry-host">' +
          '<iframe class="ry-frame" src="tools/ReinforceYourself/index.html' + q + '" ' +
                  'title="Reinforce Yourself" loading="eager"></iframe>' +
        '</div>';

      frame = root.querySelector('.ry-frame');
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');

      onMsg = (e) => {
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
        const m = e.data || {};
        if (m.type === 'ry:ready') { ready = true; lastSent = ''; post(); }
        else if (m.type === 'ry:phases' && isPresenter() && !ctx.preview && Array.isArray(m.phases)) {
          setPhases(m.phases.map(Number).filter(n => n >= 0 && n <= 3));
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
      phases = null;
    }
  });
})();
