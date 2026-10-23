/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „SQL Studio"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Ein Datenbank-Werkzeug wie phpMyAdmin, entschlackt für die Schule
   (Migration 0220, Beta, nur für Admins sichtbar).

   Gebaut wie Tiny LM: die Anwendung ist eine eigene Seite
   (index.html + js/ + css/) und steckt in einem <iframe>. Die
   Datenbanken laufen als SQLite im Browser (sql.js im Web Worker),
   der Server führt kein SQL aus.

   Etappe 1: nichts geteilt. Jede Person arbeitet in ihren eigenen
   Kopien, gespeichert im Gerät (IndexedDB) — getrennt je Raum, dafür
   trägt die Rahmen-Adresse den Raumcode. Deshalb entsteht der
   Rahmen erst mit dem ersten update() (wie bei SYNIR): den Code
   kennt erst die view. Etappe 2 (Teilen/Entziehen, Rechte je
   Datenbank) bringt ctx.actions ins Spiel.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const V = '20261023a';
  let root = null;
  let ctx = null;
  let frame = null;
  let onResize = null;

  const GAP = 12;
  const MIN = 520;     // darunter wird die Werkbank zu eng

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
    const h = Math.max(MIN, window.innerHeight - top - spaceBelow(frame) - GAP);
    frame.style.height = h + 'px';
  }

  function build(view) {
    if (frame || !root) return;
    const code = (view && view.room && view.room.code) || (ctx && ctx.preview ? 'VORSCHAU' : 'RAUM');
    const role = ctx && ctx.role === 'presenter' ? 'presenter' : 'participant';
    const src = 'tools/SQLStudio/index.html?v=' + V +
      '&raum=' + encodeURIComponent(code) + '&rolle=' + role;
    root.querySelector('.sqls-host').innerHTML =
      '<iframe class="sqls-frame" src="' + src + '" title="SQL Studio" loading="eager"></iframe>';
    frame = root.querySelector('.sqls-frame');
    fit();
    requestAnimationFrame(fit);
  }

  window.MPTool.register('sqlstudio', {

    /* Nichts einzustellen — welche Datenbanken die Klasse bekommt,
       entscheidet in Etappe 2 die Lehrkraft IM Raum. */
    settingsFields: [],

    mount(el, context) {
      root = el;
      ctx = context;
      frame = null;
      root.innerHTML = '<div class="sqls-host"></div>';
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');
      onResize = () => fit();
      window.addEventListener('resize', onResize);
      if (ctx && ctx.preview) build(null);
    },

    update(view) { build(view); },

    unmount() {
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      frame = null;
      root = null;
      ctx = null;
    }
  });
})();
