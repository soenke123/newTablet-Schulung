/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „NeuroLab"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Der zweite Skill, und der erste, der NICHTS teilt. Jede Person
   baut ihr eigenes Neuron; es gibt keinen Beitrag, keine
   Zustimmung, keine Phase und keinen gemeinsamen Zustand. Der Raum
   trägt hier allein die Tür — Code und QR bringen einen
   Klassensatz Tablets auf dieselbe Seite, und das ist der ganze
   Grund, warum es ihn gibt (siehe Migration 0089).

   ── Warum ein <iframe> und kein Port ──────────────────────────
   NeuroLab ist eine gewachsene, vollständige Anwendung: eigene
   Seite, eigener Kopf (Build · Run · Lernen · Reset · Druck),
   4.000 Zeilen Logik und 1.200 Zeilen CSS, die auf `body`,
   `header` und einen `*`-Reset gehen und `body { height: 100vh;
   overflow: hidden }` setzen. In die MPSkills-Seite hineingeschrieben
   nähme dieses Stylesheet der Seite ihren Bau — und die Logik
   spricht das Dokument direkt an (`document.getElementById`), nicht
   ein Wurzelelement, das man ihr geben könnte.

   Ein echter Port hieße also: beides umschreiben, damit ein
   update(view) entsteht, das nichts zu tun hat. Der Rahmen isoliert
   stattdessen CSS und JS vollständig, und die Anwendung bleibt, was
   sie ist — eine Datei, die man auch allein öffnen kann.

   Der Preis, offen benannt: NeuroLab bringt sein eigenes Aussehen
   mit und kippt nicht in den Darkmode der Seite. Das ist derselbe
   Gedanke wie bei den Zetteln des WordPools (Regel 1 seiner Optik):
   der Rahmen gehört MPSkills, der Inhalt dem Skill. Ein weißes
   Rechteck im abgedunkelten Raum bleibt trotzdem ein weißes
   Rechteck — wenn es stört, ist die Antwort ein Darkmode IN
   NeuroLab und nicht ein Filter von außen.

   ── Was dieses Modul dadurch ist ──────────────────────────────
   Die schmalstmögliche Erfüllung der Werkzeug-Schnittstelle:
   mount() hängt den Rahmen ein und misst ihn, update() hat nichts
   zu tun, unmount() räumt den einen Listener ab. Es ruft keine
   einzige Handlung aus ctx.actions auf — es gibt nichts zu
   speichern, was nicht das Gerät selbst behalten könnte (NeuroLab
   legt seinen Stand unter `neuron-sim-v2` im localStorage ab).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let root  = null;
  let frame = null;
  let onResize = null;

  /* Der Rahmen soll bis an die untere Bildschirmkante reichen und
     keinen Punkt weiter — genau wie die Tafel des WordPools. Was
     darunter läge, könnte man weder sehen noch antippen; was darüber
     fehlte, verschenkte auf einem Tablet die halbe Arbeitsfläche.

     Gemessen und nicht gerechnet: über dem Rahmen steht auf der
     Schülerseite eine Reiterleiste, auf der Raumseite Reiterleiste
     und Kopfzeile, und beide sind je nach Breite unterschiedlich
     hoch. getBoundingClientRect().top ist die einzige Angabe, die
     das ohne eine Liste von Sonderfällen beantwortet. */
  const GAP = 12;          // Luft unter dem Rahmen
  const MIN = 420;         // damit auf einem kleinen Gerät nicht ein Streifen bleibt

  /* Wie viel Seite steht unter dem Rahmen noch an?

     Im Raum ist das fast nichts — dort ist der Rahmen das Letzte auf
     der Seite. Im Schaufenster (lib/preview.js) stehen darunter aber
     die Knöpfe und der Erklärtext des Modals, und ohne diese Rechnung
     schöbe sich der Rahmen genau um deren Höhe darüber hinaus.

     Gerechnet und nicht an document.body gemessen: der Rahmen hat
     eine Mindesthöhe, und die zählte eine Messung mit. Deshalb
     dieselbe Summe wie in tools/wordcloud/tool.js — untere Polster
     und Kanten aller Kästen, in denen der Rahmen steckt, plus alles,
     was darunter noch im Fluss steht. Wer sie dort repariert, sollte
     hier mitziehen. */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);

      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        // Ausgeblendetes und alles, was aus dem Fluss genommen ist
        // (Modale, Toast), braucht keinen Platz.
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

  window.MPTool.register('neurolab', {

    /* Nichts abzufragen. Ein Raum dieses Skills hat keine Leitfrage
       und keine Kontingente — was eingestellt würde, gälte ohnehin
       nur für die Person, die davorsitzt, und das stellt sie in der
       Anwendung selbst ein.

       Die leere Liste ist trotzdem eine Angabe und kein Versehen:
       lehrer.js unterscheidet daran „dieser Skill hat keine
       Einstellungen" von „die Einstellungen sind noch nicht
       geladen". */
    settingsFields: [],

    mount(el, ctx) {
      root = el;

      /* Der Pfad ist relativ zur SEITE (j.html bzw. lehrer.html),
         nicht zu dieser Datei — beide liegen in MPSkills/, deshalb
         stimmt derselbe Pfad für beide Rollen.

         Kein sandbox-Attribut: die Seite ist derselbe Ursprung und
         gehört zum selben Deployment. Ein sandbox ohne
         allow-same-origin nähme NeuroLab den localStorage, in dem
         sein Netz liegt — und mit allow-same-origin wäre es keine
         Absicherung mehr, sondern nur noch ein Attribut.

         ── ?demo=1 im Schaufenster ──────────────────────────────
         NeuroLab legt seinen Stand auf dem Gerät ab. In einer
         Vorschau ist das zweimal falsch: sie zeigte das halbfertige
         Netz von gestern statt eines Neurons, an dem etwas zu sehen
         ist, und das Drehbuch schriebe darüber. Mit dem Zusatz merkt
         sich NeuroLab nichts und startet an einem vorbereiteten Netz
         (siehe app.js, DEMO). Was in der Auslage passiert, bleibt in
         der Auslage. */
      /* Der Stempel gehört an die Rahmen-URL und nicht nur an die Dateien
         darin: index.html selbst zieht sich sonst aus dem Cache, und ein
         Gerät, das NeuroLab schon einmal geladen hat, bekäme eine alte
         Seite mit neuem Skript — genau der Fall, in dem ein Knopf im
         Markup fehlt, den das Skript sucht. Dieselbe Überlegung wie beim
         ?v= an tool.css/tool.js in lib/tool.js. */
      const q = (ctx && ctx.preview ? '?demo=1&' : '?') + 'v=20260819c';
      root.innerHTML =
        '<div class="nl-host">' +
          '<iframe class="nl-frame" src="tools/NeuroLab/index.html' + q + '" ' +
                  'title="NeuroLab" loading="eager"></iframe>' +
        '</div>';

      frame = root.querySelector('.nl-frame');

      /* Der Rahmen reicht bis an die untere Kante, also darf darunter
         nichts mehr stehen — sonst schöbe der Seitenfuß ihn beim
         Scrollen nach oben und der gemessene Platz stimmte nicht mehr.
         Dieselbe Regel wie beim WordPool, nur unter dem neutralen
         Namen (siehe style.css).

         Im Schaufenster nicht: dort gehört die Seite nicht uns, sie
         steht ohnehin still (body.pv-lock), und ihren Fuß
         abzuräumen, während ein Overlay darüber liegt, ändert nur
         etwas nach dem Schließen. */
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      /* Zweimal messen: einmal sofort, einmal im nächsten Bild. Beim
         ersten Mal kann das Fach noch eingeblendet werden — dann ist
         top ein Wert aus der laufenden Animation und die Höhe
         daneben. */
      fit();
      requestAnimationFrame(fit);
    },

    /* Kommt bei jedem Takt des Pollers und hat nichts zu tun: an
       diesem Skill ist nichts gemeinsam, also ändert eine Antwort
       des Servers hier nie etwas.

       Die Methode steht trotzdem da — die Schnittstelle verlangt
       sie, und beide Seiten rufen sie direkt nach mount() auf. */
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
