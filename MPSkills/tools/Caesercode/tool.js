/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Cäsar-Scheibe"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Dritter Skill, zweiter im Fach Informatik, und wie NeuroLab einer,
   der NICHTS teilt: jede Person dreht ihre eigene Scheibe. Es gibt
   keinen Beitrag, keine Zustimmung, keine Phase und keinen
   gemeinsamen Zustand — die generische Inhaltsschicht (0080/0086)
   wird nie angesprochen, `limits` ist leer.

   Der Raum trägt auch hier allein die TÜR: Code und QR bringen einen
   Klassensatz Tablets in 30 Sekunden auf dieselbe Seite. Ohne Raum
   bliebe „tippt mal folgende Adresse ab".

   ── Warum portiert und nicht eingerahmt ───────────────────────
   NeuroLab steckt in einem <iframe>, und das ist dort die Ausnahme
   mit Begründung: 4.000 Zeilen Logik, die das Dokument direkt
   ansprechen, und ein Stylesheet, das `body { height: 100vh }`
   setzt. Ein Port hieße, beides umzuschreiben.

   Die Vorlage dieser Scheibe sind 140 Zeilen in einer Datei, ohne
   eine einzige Regel auf `body`. Hier kostet der Port nichts und
   bringt drei Dinge, die ein Rahmen nie hergäbe:

     · Darkmode. Die Scheibe nimmt die Variablen der Seite und
       kippt mit. Eine weiße Scheibe von 60 cm Durchmesser ist im
       abgedunkelten Raum das Hellste an der Wand.
     · Größe. Sie füllt, was da ist — am Beamer groß, auf dem Handy
       klein. Im Rahmen stünde sie in beiden Fällen bei 260 px.
     · Kein zweiter Satz Klempnerei: kein eigenes viewport.js im
       Rahmen, kein Cache-Stempel an der Rahmen-URL, keine
       Höhenmessung durch eine Dokumentgrenze hindurch.

   ── Was gegenüber der Vorlage anders ist ──────────────────────
   Die Bedienung ist dieselbe: äußerer Ring starr, inneres Rad
   ziehen, es rastet auf ganze Buchstaben. Geändert wurde, was die
   Vorlage sich als einzelne Datei leisten konnte:

     (1) Ein Umbruch setzt die Scheibe nicht mehr auf A zurück. In
         der Vorlage rief `resize` das ganze init() samt
         setInnerAngle(0) — wer sein Tablet drehte, verlor den
         eingestellten Schlüssel mitten in der Aufgabe.
     (2) Gedreht wird EIN Element über EINE Variable (--spin), statt
         bei jedem Bild 26 Buchstaben einzeln neu zu setzen — und
         jeder davon las dabei getBoundingClientRect(), also 26
         erzwungene Layouts je Fingerbewegung.
     (3) Schritt-Knöpfe ◀ ▶ und ↺. Am Beamer wird die Scheibe von
         vorn bedient und nicht am Platz gezogen; und ein Schlüssel,
         den die ganze Klasse gleich einstellen soll, wird angesagt
         („alle auf D") und nicht getroffen.
     (4) Die Ringe sind beschriftet. Welcher der beiden der Klartext
         ist, stand in der Vorlage nirgends — die Anzeige „Schlüssel
         D" ergibt nur in einer der beiden Leserichtungen Sinn.

   Bewusst NICHT dazugekommen ist ein Feld, in das man einen Text
   tippt und verschlüsselt bekommt. Genau das ist die Aufgabe der
   Klasse; ein Automat daneben nimmt der Stunde ihren Gegenstand.
   Die Scheibe ist ein Werkzeug zum Nachschlagen, kein Löser.

   ── Die Leserichtung ──────────────────────────────────────────
   Buchstabe i des inneren Rades steht nach einer Drehung um s
   Schritte beim äußeren Buchstaben (i + s). Innen A liegt also bei
   außen s — und das ist der Schlüssel, den die Vorlage in der Mitte
   anzeigt. Daraus folgt zwingend: innen ist der Klartext, außen der
   Geheimtext, A → Schlüsselbuchstabe. Das ist die übliche
   Cäsar-Konvention (Schlüssel D heißt A→D) und steht so in der
   Ablesezeile.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const N     = 26;
  const STEP  = 360 / N;
  const ALPHA = Array.from({ length: N }, (_, i) => String.fromCharCode(65 + i));

  const GAP  = 12;    // Luft unter der Scheibe
  const MIN  = 300;   // damit auf einem kleinen Gerät nicht ein Streifen bleibt
  const MAXD = 720;   // größer wird die Scheibe nicht — auch nicht auf 4K

  let root = null, host = null, stage = null, wheel = null;
  let elKnob = null, elKey = null, elMap = null, elShift = null;
  let onResize = null, onKey = null;

  /* Fingerstand während des Ziehens. `spin` ist der einzige
     Zustand, den dieser Skill hat — und er lebt hier und nicht in
     einer view: es gibt nichts Gemeinsames, das der Server davon
     wissen müsste. */
  let spin = 0, dragging = false, lastAng = 0;

  /* ─── Höhe ──────────────────────────────────────────────────
     Wortgleich aus tools/NeuroLab/tool.js, das es seinerseits vom
     WordPool hat. Gerechnet und nicht an document.body gemessen:
     der Wirt hat eine Mindesthöhe, und die zählte eine Messung mit.
     Wer sie an einer der drei Stellen repariert, sollte die anderen
     mitziehen. */
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

  /* Zwei Schritte, und die Reihenfolge ist der Punkt: erst bekommt
     der Wirt seine Höhe, dann steht fest, wie viel davon der Bühne
     zwischen Ablesezeile und Kopf bleibt — und daraus folgt der
     Durchmesser. Andersherum gerechnet käme die Scheibe bei jedem
     Umbruch eine Zeile zu groß heraus und schöbe die Knöpfe unter
     die Bildschirmkante, an der sie niemand mehr trifft. */
  function fit() {
    if (!host || !stage) return;
    const top = host.getBoundingClientRect().top;
    host.style.height =
      Math.max(MIN, window.innerHeight - top - spaceBelow(host) - GAP) + 'px';

    const s = Math.min(stage.clientWidth, stage.clientHeight, MAXD);
    host.style.setProperty('--cs-size', Math.max(180, Math.round(s)) + 'px');
  }

  /* ─── Drehen ────────────────────────────────────────────────
     `free` = dem Finger folgen, sonst auf ganze Buchstaben
     einrasten. Beides wird gebraucht: eine Scheibe, die dem Finger
     nur in Sprüngen folgt, fühlt sich kaputt an, und eine, die
     zwischen zwei Buchstaben stehenbleibt, ist nicht ablesbar.

     ⚠️ `spin` wird NICHT auf 0–360 zurückgeholt. Der Winkel läuft
     durch, und nur die Anzeige rechnet ihn auf einen Buchstaben um.
     Der Grund ist die Übergangszeit aus tool.css: von Z auf A ist
     ein Schritt vorwärts, in einem auf 360 gedeckelten Wert aber
     ein Sprung von 346° auf 0° — und den fährt der Browser als
     ganze Rückwärtsdrehung ab. Genau an der Stelle, an der die
     Scheibe unauffällig weiterrücken soll. */
  function setSpin(deg, free) {
    if (!free) deg = Math.round(deg / STEP) * STEP;
    spin = deg;

    wheel.style.setProperty('--spin', deg.toFixed(4) + 'deg');

    const shift = ((Math.round(deg / STEP) % N) + N) % N;
    const key   = ALPHA[shift];
    elKnob.textContent  = key;
    elKey.textContent   = key;
    elMap.textContent   = 'A → ' + key;
    elShift.textContent = 'Verschiebung ' + shift;

    wheel.setAttribute('aria-valuenow',  String(shift));
    wheel.setAttribute('aria-valuetext', key + ', Verschiebung ' + shift);
  }

  const stepBy = n => setSpin(spin + n * STEP);

  /* Auf einen bestimmten Buchstaben stellen — und zwar auf dem
     kurzen Weg. Weil `spin` durchläuft (siehe oben), gibt es zu
     jedem Buchstaben unendlich viele Winkel; gesucht ist der, der
     dem jetzigen am nächsten liegt. Ohne diese Zeile drehte „zurück
     auf A" von Y aus einmal ganz herum — und bei jemandem, der die
     Scheibe eine Weile gedreht hat, fünfmal. */
  function goTo(shift) {
    setSpin(Math.round((spin - shift * STEP) / 360) * 360 + shift * STEP);
  }

  function angleAt(ev) {
    const r = wheel.getBoundingClientRect();
    return Math.atan2(ev.clientY - (r.top + r.height / 2),
                      ev.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  }

  function onDown(ev) {
    // Nur der erste Finger dreht. Ein zweiter, der irgendwo auf der
    // Scheibe aufsetzt, würde sonst den Bezugswinkel überschreiben
    // und das Rad springen lassen.
    if (dragging) return;
    dragging = true;
    lastAng  = angleAt(ev);
    host.classList.add('cs-host--drag');
    try { wheel.setPointerCapture(ev.pointerId); } catch (e) {}
    /* preventDefault verhindert nebenbei, dass der Browser das Rad
       von selbst fokussiert — also von Hand. Wer einmal gezogen hat,
       darf danach mit den Pfeiltasten weiterrücken, ohne erst
       hinzutabben. `preventScroll`, weil das Fach sonst springt,
       falls das Rad gerade halb aus dem Bild ragt. */
    try { wheel.focus({ preventScroll: true }); } catch (e) { wheel.focus(); }
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!dragging) return;
    const a = angleAt(ev);
    /* Kürzester Weg statt roher Differenz. atan2 springt bei ±180°
       um eine volle Umdrehung — die Vorlage rechnete `ang -
       startAngle` und drehte das Rad in dem Moment einmal ganz
       herum. Ohne Übergangszeit fiel das nicht auf; mit einer
       (siehe tool.css) wäre es ein Karussell. */
    let d = a - lastAng;
    if (d >  180) d -= 360;
    if (d < -180) d += 360;
    lastAng = a;
    setSpin(spin + d, true);
  }

  function onUp(ev) {
    if (!dragging) return;
    dragging = false;
    host.classList.remove('cs-host--drag');
    try { wheel.releasePointerCapture(ev.pointerId); } catch (e) {}
    setSpin(spin);          // einrasten
  }

  /* ─── Bauen ─────────────────────────────────────────────────
     Die Buchstaben bekommen ihren Platz als fertigen Winkel ins
     style-Attribut und werden danach nie wieder angefasst — was
     sich bewegt, ist --spin am Rad (siehe Kopf von tool.css). */
  const ringHTML = ALPHA
    .map((ch, i) => `<span style="--a:${(i * STEP).toFixed(4)}deg">${ch}</span>`)
    .join('');

  window.MPTool.register('caesar', {

    /* Nichts abzufragen — wie bei NeuroLab. Was eingestellt würde,
       gälte ohnehin nur für die Person davor, und das stellt sie an
       der Scheibe selbst ein.

       Die leere Liste ist trotzdem eine Angabe und kein Versehen:
       lehrer.js unterscheidet daran „dieser Skill hat keine
       Einstellungen" von „die Einstellungen sind noch nicht
       geladen". */
    settingsFields: [],

    mount(el, ctx) {
      root = el;
      root.innerHTML =
        '<div class="cs-host">' +
          '<div class="cs-stage">' +
            '<div class="cs-disc">' +
              /* Die Ringe und der Knopf sind für eine Vorlesestimme
                 ein Bild: 52 einzeln vorgelesene Buchstaben in
                 Kreisreihenfolge sagen niemandem, wie die Scheibe
                 gerade steht. Das sagt die Ablesezeile darunter —
                 und beim Rücken mit den Pfeiltasten der Regler
                 selbst über aria-valuetext. */
              '<div class="cs-ring cs-ring--out" aria-hidden="true">' + ringHTML + '</div>' +
              '<div class="cs-wheel" id="csWheel" tabindex="0" role="slider"' +
                  ' aria-label="Inneres Rad — Klartext"' +
                  ' aria-valuemin="0" aria-valuemax="25" aria-valuenow="0" aria-valuetext="A">' +
                '<div class="cs-ring cs-ring--in" aria-hidden="true">' + ringHTML + '</div>' +
              '</div>' +
              '<div class="cs-knob" id="csKnob" aria-hidden="true">A</div>' +
            '</div>' +
          '</div>' +

          '<div class="cs-bar">' +
            '<button type="button" class="cs-step" id="csPrev" aria-label="Ein Zeichen zurück">◀</button>' +
            '<div class="cs-read">' +
              '<b id="csKey">A</b>' +
              '<span class="cs-map" id="csMap">A → A</span>' +
              '<span id="csShift">Verschiebung 0</span>' +
            '</div>' +
            '<button type="button" class="cs-step" id="csNext" aria-label="Ein Zeichen weiter">▶</button>' +
            '<button type="button" class="cs-step cs-step--home" id="csHome" aria-label="Zurück auf A">↺</button>' +
          '</div>' +

          '<p class="cs-hint">Innen steht der Klartext, außen der Geheimtext — ' +
            'drehe das innere Rad, das äußere bleibt stehen. ' +
            'Zum Entschlüsseln liest du andersherum: außen suchen, innen ablesen.</p>' +
        '</div>';

      host    = root.querySelector('.cs-host');
      stage   = root.querySelector('.cs-stage');
      wheel   = root.querySelector('#csWheel');
      elKnob  = root.querySelector('#csKnob');
      elKey   = root.querySelector('#csKey');
      elMap   = root.querySelector('#csMap');
      elShift = root.querySelector('#csShift');

      wheel.addEventListener('pointerdown', onDown);
      wheel.addEventListener('pointermove', onMove);
      wheel.addEventListener('pointerup', onUp);
      // Ein abgebrochener Zeiger (Anruf, zweiter Finger, Geste des
      // Systems) hinterließe sonst ein Rad, das dem Finger folgt,
      // ohne dass einer da ist.
      wheel.addEventListener('pointercancel', onUp);

      root.querySelector('#csPrev').addEventListener('click', () => stepBy(-1));
      root.querySelector('#csNext').addEventListener('click', () => stepBy(1));
      root.querySelector('#csHome').addEventListener('click', () => goTo(0));

      /* Pfeiltasten am Rad. Nicht Zierde: an einem Beamer-Rechner
         liegt eine Tastatur, und eine Scheibe, die man nur mit der
         Maus im Kreis ziehen kann, trifft man von vorn nicht. */
      onKey = (e) => {
        const d = (e.key === 'ArrowRight' || e.key === 'ArrowUp')   ?  1
                : (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') ? -1 : 0;
        if (d) { e.preventDefault(); stepBy(d); return; }
        if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      };
      wheel.addEventListener('keydown', onKey);

      /* Die Scheibe reicht bis an die untere Bildschirmkante, also
         darf darunter nichts mehr stehen — sonst schöbe der
         Seitenfuß sie beim Scrollen nach oben und der gemessene
         Platz stimmte nicht mehr. Dieselbe Regel wie bei NeuroLab
         und beim WordPool.

         Im Schaufenster nicht: dort gehört die Seite nicht uns, sie
         steht ohnehin still (body.pv-lock), und ihren Fuß
         abzuräumen, während ein Overlay darüber liegt, ändert nur
         etwas nach dem Schließen. */
      if (!(ctx && ctx.preview)) document.body.classList.add('tool-fill');

      setSpin(0);

      onResize = () => fit();
      window.addEventListener('resize', onResize);
      /* Zweimal messen: einmal sofort, einmal im nächsten Bild. Beim
         ersten Mal kann das Fach noch eingeblendet werden — dann ist
         top ein Wert aus der laufenden Animation und der Durchmesser
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
      /* Die Listener am Rad gehen mit dem Rad: der Aufrufer leert el.
         Aufgeräumt wird hier nur, was AUSSERHALB hängt — sonst bliebe
         nach dem dritten Fachwechsel ein dritter resize-Zuhörer, der
         in ein abgeräumtes DOM misst. */
      onResize = null;
      onKey    = null;
      document.body.classList.remove('tool-fill');
      dragging = false;
      spin     = 0;
      root = host = stage = wheel = null;
      elKnob = elKey = elMap = elShift = null;
    }
  });
})();
