/* ══════════════════════════════════════════════════════════════
   viewport.js — der SICHTBARE Bereich als CSS-Variable

   Ein `position: fixed`-Overlay bezieht sich auf das Layout-Fenster,
   und das ist auf einem Handy fast nie das, was man sieht: die
   Adressleiste fährt ein und aus, und die Tastatur legt sich über
   die untere Hälfte, ohne dass das Layout etwas davon erfährt. Ein
   zentriertes Fenster steht dann zur Hälfte unter der Tastatur —
   samt seiner Knöpfe.

   Diese Datei schreibt zwei Werte an `<html>` und tut sonst nichts:

     --vv-h    Höhe des sichtbaren Bereichs
     --vv-top  wie weit er im Layout-Fenster nach unten gerutscht ist

   Ein Overlay, das `top: var(--vv-top)` und `height: var(--vv-h)`
   benutzt, liegt damit immer genau auf dem Stück Bildschirm, das
   man wirklich sieht. Ist die Tastatur offen, wird es kleiner statt
   verdeckt — und weil es zugleich seine eigene Scrollstrecke ist,
   bleibt jeder Knopf erreichbar.

   Dazu kommt der zweite Teil: ein Eingabefeld, das nach dem
   Hochfahren der Tastatur außerhalb liegt, wird hineingeholt.
   Das macht der Browser von sich aus nur für die Seite, nicht
   zuverlässig für einen Scroller in einem fixierten Overlay.

   Ohne diese Datei bleibt alles beim Alten: die Stylesheets geben
   `100vh` als Rückfall an. Sie ist deshalb überall optional und
   hat bewusst keine Abhängigkeiten — sie läuft auch auf der
   Schülerseite, die kein Konto und keine Session kennt.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.documentElement;
  var vv   = window.visualViewport || null;
  var tick = 0;

  /* Wie viel kleiner der sichtbare Bereich sein muss, damit wir von
     einer Tastatur ausgehen. Die ein- und ausfahrende Adressleiste
     misst je nach Gerät 60–90 px; 120 px liegt sicher darüber und
     unter jeder Bildschirmtastatur. */
  var KB_MIN = 120;

  function apply() {
    tick = 0;
    var h   = vv ? vv.height    : window.innerHeight;
    var top = vv ? vv.offsetTop : 0;

    root.style.setProperty('--vv-h', h + 'px');
    root.style.setProperty('--vv-top', top + 'px');

    /* `window.innerHeight` schrumpft mit der Tastatur nicht mit —
       die Differenz IST die Tastatur. */
    root.classList.toggle('kb-open', !!vv && (window.innerHeight - h) > KB_MIN);
  }

  function schedule() {
    if (tick) return;
    tick = requestAnimationFrame(apply);
  }

  apply();

  if (vv) {
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
  }
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);

  /* ── Das fokussierte Feld ins Sichtbare holen ──────────────────
     Der Browser scrollt beim Fokus selbst, aber er tut es, bevor
     die Tastatur oben ist, und er tut es für die Seite. Steckt das
     Feld in einem eigenen Scroller (jedes Modal ist einer), bleibt
     es liegen. Also noch einmal nachfassen, wenn die Tastatur
     wirklich steht. */
  var FIELD = /^(INPUT|TEXTAREA|SELECT)$/;

  function ensureVisible(el) {
    if (!el || !el.isConnected || document.activeElement !== el) return;

    var r      = el.getBoundingClientRect();
    var top    = vv ? vv.offsetTop : 0;
    var bottom = top + (vv ? vv.height : window.innerHeight);
    var pad    = 24;

    if (r.top >= top + pad && r.bottom <= bottom - pad) return;  /* steht schon */

    /* `center` und nicht `nearest`: ein Feld direkt an der
       Tastaturkante ist zwar sichtbar, aber die Fehlermeldung
       darunter nicht — und die ist der Grund, warum jemand
       hinsieht. */
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      el.scrollIntoView(true);
    }
  }

  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!el || !FIELD.test(el.tagName || '')) return;
    /* Zweimal: einmal jetzt (für den Fall ohne Tastatur, etwa am
       Rechner), einmal nach der Einblende-Animation. */
    setTimeout(function () { ensureVisible(el); }, 60);
    setTimeout(function () { ensureVisible(el); }, 350);
  });

  /* Und wenn die Tastatur selbst die Größe ändert (Sprachen-
     wechsel, Vorschlagsleiste, Drehen des Geräts). */
  if (vv) {
    vv.addEventListener('resize', function () {
      var el = document.activeElement;
      if (el && FIELD.test(el.tagName || '')) {
        setTimeout(function () { ensureVisible(el); }, 120);
      }
    });
  }
})();
