/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Nebeltal"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Prototyp (Migration 0290, nur für Admins sichtbar): Wie lernt ein
   neuronales Netz? Man sucht im Nebel den tiefsten Punkt einer 3D-
   Landschaft und sieht nur die Stelle, an der man steht. Vier Level
   vom freien Suchen bis zum echten Gradientenabstieg an einem Modell.

   Eingerahmt wie Reinforce Yourself: die Anwendung ist eine eigene
   Seite (index.html) im <iframe>. Noch KEIN Austausch mit dem Raum:
   jede Person spielt für sich, gleiche Welt-Nummer = gleiche
   Landschaft (so kann die Klasse schon gegeneinander spielen).
   Stand im Gerät (localStorage „nt.*“). Plan: CLAUDE.md im Ordner.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261117a';
  let root = null, frame = null, ctx = null, onResize = null;

  const GAP = 12, MIN = 460;

  // Platz unter dem Rahmen — dieselbe Rechnung wie in tools/NeuroLab/tool.js
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
    frame.style.height = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP) + 'px';
  }

  window.MPTool.register('nebeltal', {
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c;
      const q = ctx && ctx.preview ? '?demo=1&v=' + V
              : '?raum=' + (ctx && ctx.role === 'presenter' ? 'lehrer' : 'schueler') + '&v=' + V;
      root.innerHTML =
        '<div class="nt-host">' +
          '<iframe class="nt-frame" src="tools/Nebeltal/index.html' + q + '" ' +
                  'title="Nebeltal" loading="eager" allow="fullscreen"></iframe>' +
        '</div>';
      frame = root.querySelector('.nt-frame');
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');
      onResize = () => fit();
      window.addEventListener('resize', onResize);
      fit();
      requestAnimationFrame(fit);
    },

    update() { /* noch nichts aus dem Raum */ },

    unmount() {
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      frame = root = ctx = null;
    }
  });
})();
