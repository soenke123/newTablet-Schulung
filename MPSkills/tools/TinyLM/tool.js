/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Tiny LM"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Ein Mini-Sprachmodell zum Aufschrauben (Migration 0210, Beta).

   Gebaut wie NeuroLab: die Anwendung ist eine eigene Seite
   (index.html + js/ + css/) mit eigenem Kopf und eigenem Stylesheet
   und steckt deshalb in einem <iframe>. Der Rahmen isoliert CSS und
   JS vollständig; die Seite lässt sich auch allein öffnen.

   Es wird nichts geteilt: jede Person füttert ihre eigene KI,
   trainiert ihr eigenes Netz. Eigene Texte und der Stand im
   Leitfaden liegen im localStorage des Geräts. Deshalb ruft dieses
   Modul keine einzige Handlung aus ctx.actions auf, und update()
   hat nichts zu tun.

   Noch EINE Ansicht für alle (Beta) — Lehrkraft und Schüler sehen
   dasselbe. Die Trennung kommt, wenn die eine Ansicht sitzt.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let root  = null;
  let frame = null;
  let onResize = null;

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

  window.MPTool.register('tinylm', {

    /* Nichts einzustellen — wie bei NeuroLab gilt alles nur für die
       Person, die davorsitzt. Die leere Liste sagt lehrer.js
       „keine Einstellungen" (und nicht „noch nicht geladen"). */
    settingsFields: [],

    mount(el, ctx) {
      root = el;
      /* Pfad relativ zur SEITE (j.html bzw. lehrer.html, beide in
         MPSkills/). Der Stempel gehört an die Rahmen-URL, sonst käme
         index.html aus dem Cache (siehe NeuroLab). */
      const q = (ctx && ctx.preview ? '?demo=1&' : '?') + 'v=20261014b';
      root.innerHTML =
        '<div class="tl-host">' +
          '<iframe class="tl-frame" src="tools/TinyLM/index.html' + q + '" ' +
                  'title="Tiny LM" loading="eager"></iframe>' +
        '</div>';

      frame = root.querySelector('.tl-frame');
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    update() {},

    unmount() {
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      frame = null;
      root  = null;
    }
  });
})();
