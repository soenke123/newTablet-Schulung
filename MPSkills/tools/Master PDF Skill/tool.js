/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Master PDF"  ·  tool.js   (nur für das Schaufenster)
   ══════════════════════════════════════════════════════════════
   Master PDF Skill hat keinen Raum — die Kachel öffnet die App
   direkt (tools.js, `standalone`). Diese Datei gibt es nur, damit
   das Schaufenster (lib/preview.js) die ECHTE App im Rahmen zeigen
   kann: es lädt jedes Werkzeug über MPTool.load(id, folder) und
   braucht dafür ein tool.js im Ordner. Mit ?demo=1 öffnet die App
   ein Beispieldokument (js/demo.js) und merkt sich nichts.

   Nichts geteilt, keine Handlung: update() hat nichts zu tun.
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

  window.MPTool.register('masterpdf', {

    /* Nichts einzustellen — wie bei NeuroLab gilt alles nur für die
       Person, die davorsitzt. Die leere Liste sagt lehrer.js
       „keine Einstellungen" (und nicht „noch nicht geladen"). */
    settingsFields: [],

    mount(el, ctx) {
      root = el;
      /* Pfad relativ zur SEITE (j.html bzw. lehrer.html, beide in
         MPSkills/). Der Stempel gehört an die Rahmen-URL, sonst käme
         index.html aus dem Cache (siehe NeuroLab). */
      const q = '?demo=1&v=20261018';
      root.innerHTML =
        '<div class="mp-host">' +
          '<iframe class="mp-frame" src="tools/Master%20PDF%20Skill/index.html' + q + '" ' +
                  'title="Master PDF Skill" loading="eager"></iframe>' +
        '</div>';

      frame = root.querySelector('.mp-frame');

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    update() {},

    unmount() {
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
          frame = null;
      root  = null;
    }
  });
})();
