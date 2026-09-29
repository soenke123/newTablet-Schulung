/* ══════════════════════════════════════════════════════════════
   SYNIR — menuleiste.js   ·   „Datei" und „Ansicht & Tools"
   ══════════════════════════════════════════════════════════════
   Zwei Reiter oben rechts, die sich verhalten wie die Menüleiste
   eines klassischen Programms — nur ohne das Grau:

     · Ein Klick klappt die Liste auf, ein zweiter klappt sie zu.
     · Ist EIN Menü offen, öffnet schon das Darüberfahren (Maus) mit
       dem anderen Reiter dessen Liste. Zu ist die Leiste erst
       wieder nach Klick daneben, Esc oder Wahl eines Eintrags.
     · Tastatur: ↓ öffnet und geht durch die Einträge, ↑ zurück,
       Pos1/Ende springen, ← → wechseln den Reiter, Enter/Leertaste
       wählt, Esc schließt und gibt den Fokus zurück, Tab lässt los.
     · Ein Eintrag mit `disabled` ist grau und wird übersprungen.

   Die Leiste TUT nichts. Sie öffnet und schließt; was ein Eintrag
   bewirkt, hängt app.js an seine Kennung (#neuBtn, #subBtn …). Nach
   einer Wahl geht die Liste zu — außer beim Eintrag mit Untermenü
   (.mi--sub, das Szenario-Menü): dort geht sie erst zu, wenn ein
   Szenario gewählt ist (app.js ruft dann `MenuLeiste.zu()`).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const bar = document.getElementById('mbar');
  if (!bar) return;

  const menus = Array.from(bar.querySelectorAll('[data-menu]')).map((el) => ({
    el,
    btn: el.querySelector('.mn-btn'),
    pop: el.querySelector('.mn-pop')
  }));
  let offen = null;

  const items = (m) => Array.from(m.pop.querySelectorAll('.mi'))
    .filter((b) => !b.disabled && b.offsetParent !== null);

  function zu(fokus) {
    if (!offen) return;
    const m = offen;
    offen = null;
    m.pop.hidden = true;
    m.btn.setAttribute('aria-expanded', 'false');
    m.el.classList.remove('is-offen');
    // Ein offenes Untermenü (Szenarien) geht mit.
    const sub = m.pop.querySelector('.szm-pop');
    if (sub && !sub.hidden) {
      sub.hidden = true;
      const k = m.pop.querySelector('.mi--sub');
      if (k) k.setAttribute('aria-expanded', 'false');
    }
    if (fokus) m.btn.focus();
  }

  function auf(m, erster) {
    if (offen === m) return;
    if (offen) zu(false);
    offen = m;
    m.pop.hidden = false;
    m.btn.setAttribute('aria-expanded', 'true');
    m.el.classList.add('is-offen');
    if (erster) { const l = items(m); if (l[0]) l[0].focus(); }
  }

  menus.forEach((m) => {
    m.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (offen === m) zu(false); else auf(m, false);
    });

    // Wie bei Windows: ist eine Liste offen, wechselt das Darüberfahren.
    m.btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && offen && offen !== m) auf(m, false);
    });

    m.btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        auf(m, false);
        const l = items(m);
        const z = e.key === 'ArrowDown' ? l[0] : l[l.length - 1];
        if (z) z.focus();
      }
    });

    m.pop.addEventListener('click', (e) => {
      e.stopPropagation();
      // Das kleine „i" hinter einem Tool klappt die Kurzerklärung auf
      // und wählt nichts.
      const i = e.target.closest('.mi-i');
      if (i) {
        const z = i.closest('.mi-zeile');
        const t = z && z.nextElementSibling;
        if (t && t.classList.contains('mi-info')) {
          t.hidden = !t.hidden;
          i.setAttribute('aria-expanded', String(!t.hidden));
        }
        return;
      }
      const b = e.target.closest('.mi');
      if (!b || b.disabled) return;
      // Das Untermenü bleibt offen, bis dort etwas gewählt ist.
      if (b.classList.contains('mi--sub')) return;
      // Erst NACH den Zuhörern des Eintrags selbst schließen.
      setTimeout(() => zu(true), 0);
    });

    m.pop.addEventListener('keydown', (e) => {
      const l = items(m);
      const i = l.indexOf(document.activeElement);
      const sub = e.target.closest('.szm-pop');
      if (sub) return;                       // im Untermenü gilt das Untermenü
      if (e.key === 'ArrowDown') { e.preventDefault(); l[(i + 1) % l.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); l[(i - 1 + l.length) % l.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); l[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); l[l.length - 1].focus(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = menus[(menus.indexOf(m) + (e.key === 'ArrowRight' ? 1 : menus.length - 1)) % menus.length];
        auf(n, true);
      }
      else if (e.key === 'Tab') zu(false);
    });
  });

  document.addEventListener('click', () => zu(false));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !offen) return;
    // Zuerst das Untermenü: es schließt sich selbst (szmenue.js).
    const sub = offen.pop.querySelector('.szm-pop');
    if (sub && !sub.hidden) return;
    zu(true);
  });
  window.addEventListener('blur', () => zu(false));

  window.MenuLeiste = { zu: () => zu(false), get offen() { return !!offen; } };
})();
