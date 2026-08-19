/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/neurolab.js   ·   Schaufenster für NeuroLab
   ══════════════════════════════════════════════════════════════
   Zweites Drehbuch nach preview/wordcloud.js, und der erste Fall,
   in dem der Skill nichts teilt: es gibt keine Beiträge, keine
   Zustimmung und keine Phase, die der Server kennt. Die
   gefälschten Handlungen aus lib/preview.js laufen hier deshalb
   ins Leere — und das ist richtig so, NeuroLab ruft keine einzige
   davon auf.

   ── Was im Modal läuft ────────────────────────────────────────
   Das ECHTE NeuroLab, wie bei der Wolke — nur steckt es hier in
   einem <iframe> (Begründung in tools/NeuroLab/tool.js). Der
   Regisseur greift deshalb durch den Rahmen hindurch: gleicher
   Ursprung, gleiches Dokument, dieselben Klick-Ereignisse, die
   auch ein Finger auslöst (siehe q() in lib/preview.js).

   Und weil hier ein Gerät mitschreibt, was es gerade tut, bekommt
   der Rahmen im Schaufenster ein `?demo=1`: NeuroLab merkt sich
   dann nichts. Wer die Vorschau ansieht, soll nicht hinterher sein
   eigenes Netz umgebaut vorfinden — und er soll auch nicht das
   halbfertige Netz von gestern zu sehen bekommen, sondern etwas,
   an dem etwas zu sehen ist.

   ── Nicht der Anfang, sondern das Beste ───────────────────────
   Der erste Anlauf zeigte hier ein einzelnes Neuron, an dem das
   Drehbuch zwei Eingaben von Hand setzte. Das ist der erste
   Schritt einer Doppelstunde und in einer Auslage zu wenig: es
   sieht aus wie ein Taschenrechner mit drei Feldern.

   Gezeigt wird deshalb, wofür man die Anwendung aufmacht — ein
   dreischichtiges Netz LERNT. Die Startgewichte sind gewürfelt,
   die Kanten dünn und blass, die Ausgabe rot; nach ein paar
   Sekunden sind die Kanten dick, die Kurve gefallen und die
   Ausgabe grün. Welches Netz und welche Daten, steht in
   demoState() in app.js — das gehört zur Anwendung und nicht
   zum Drehbuch.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  /* Die Rolle ist hier egal — NeuroLab fragt ctx.role nicht ab und
     ruft keine Handlung auf. Sie steht trotzdem da, weil
     lib/preview.js sie an makeCtx weiterreicht, und 'presenter' ist
     die ehrlichere Angabe: wer hier steht, überlegt, ob er damit
     eine Stunde macht. */
  const ROLE = 'presenter';

  /* Die Werkzeug-Schnittstelle verlangt bei jedem update() eine
     view. NeuroLabs update() sieht sie nie an (es gibt nichts
     Gemeinsames, das sich ändern könnte) — sie muss trotzdem die
     Form haben, die auch aus skill_room_get käme. */
  function view() {
    return {
      role: ROLE,
      room: { title: 'NeuroLab', settings: {} },
      state: { phase: 1, data: {} },
      limits: {},
      me: { may_write: true },
      entries: []
    };
  }

  /* ─── Das Drehbuch ──────────────────────────────────────────
     Nicht der Anfang, sondern das Beste: das Netz LERNT. Ein einzelnes
     Neuron, an dem jemand von Hand Zahlen einstellt, ist der erste
     Schritt einer Doppelstunde — eine Vorschau hat zehn Sekunden und
     muss in denen zeigen, wofür man das Ding aufmacht. Also steht die
     Anwendung schon in der Phase „Lernen" (siehe demoState() in
     app.js), und hier wird nur noch gestartet und zugesehen: der
     Verlust fällt, die Kanten ändern Dicke und Farbe, die Ausgabe
     rückt an den Sollwert heran.

     Bedient wird ausschließlich über die vier Knöpfe des Lernpanels
     (`#learn-btn-start` · `-pause` · `-reset`). Sie haben feste IDs
     und tun genau eine Sache. An Gewichten, Schwellenwerten oder der
     Topologie wird NICHTS gedreht: die hängen an geteilten
     Inline-Feldern, die beim Öffnen umgehängt werden, und ein
     Drehbuch, das dort hineingreift, bricht beim nächsten Umbau
     still.

     Zurückgestellt wird am Ende selbst — mit demselben ↺, das im
     Panel steht: neue Zufallsgewichte, Epoche 0, Kurve leer. Der
     Regisseur kann es nicht, sein Zurücksetzen ruft update(view),
     und NeuroLabs update() hat nichts zu tun. Deshalb steht unten
     auch fade: false. */

  /* ⚠️ Angehalten wird nicht nach einer Zahl Sekunden, sondern wenn
     das Netz FERTIG ist — abgelesen am Verlust im Panel. Eine feste
     Wartezeit wäre auf einem langsamen Tablet zu kurz und auf jedem
     anderen Leerlauf, und sie hinge an einer Zufallszahl: wie schnell
     es geht, entscheiden die gewürfelten Startgewichte.

     Der zweite Fall ist der eigentliche Grund. In etwa einem von
     zwanzig Läufen bleibt das Netz auf der „alles 0,5"-Ebene stehen
     (Verlust 0,25) und kommt dort nicht mehr weg — gemessen, siehe
     app.js. Dann würfelt das Drehbuch neu und fängt von vorn an;
     genau dafür steht das ↺ im Panel, und ein Kurs macht es
     genauso. Eine Auslage, die dabei zusieht, wie nichts passiert,
     zeigt das Gegenteil von dem, wofür sie da ist. */
  const READY  = 0.02,   // darunter sitzt XOR
        STUCK  = 0.20,   // darüber steht es auf der Ebene
        STEP   = 700,    // so oft wird nachgesehen — und „Pause" greift
        PATIENCE = 7000, // so lange, bevor „steht" als „steht" gilt
        LIMIT  = 20000,  // Notausgang, falls die Anzeige nie fällt
        REROLLS = 2;

  const lossNow = api => parseFloat(api.text('#learn-loss-display'));

  async function play(api) {
    // Der Rahmen lädt eine eigene Seite. Bis die steht, gibt es
    // nichts zu klicken — und ein Drehbuch, das ins Leere greift,
    // sähe aus wie eine kaputte Vorschau.
    if (!await api.waitFor('#learn-btn-start', 6000)) return;

    // Einen Moment das ungelernte Netz stehen lassen: drei Schichten,
    // Zufallsgewichte, Verlust 0. Ohne dieses Vorher fehlt dem
    // Nachher der Vergleich.
    if (!await api.wait(1600)) return;

    if (!api.click('#learn-btn-start')) return;

    let waited = 0, rerolls = 0;
    for (;;) {
      if (!await api.wait(STEP)) return;
      waited += STEP;

      const loss = lossNow(api);
      // Keine Zahl da? Dann ist das Panel weg (jemand hat die Phase
      // gewechselt) — nicht weiterklicken, der Mensch hat übernommen.
      if (!isFinite(loss)) return;
      if (loss < READY) break;

      if (waited >= PATIENCE && loss > STUCK && rerolls < REROLLS) {
        rerolls++;
        api.click('#learn-btn-reset');
        if (!await api.wait(900)) return;
        api.click('#learn-btn-start');
        waited = 0;
        continue;
      }
      if (waited >= LIMIT) break;
    }

    // Anhalten und das Ergebnis stehen lassen: die Ausgabe steht auf
    // dem Sollwert und ist von rot auf grün gesprungen, die Kanten
    // sind dick. Das ist der Schluss, nicht das Laufen selbst.
    api.click('#learn-btn-pause');
    if (!await api.wait(3400)) return;

    api.click('#learn-btn-reset');
    await api.wait(1000);
  }

  /* ═══════════════════════════════════════════════════════════
     Das Standbild für die Kachel
     ═══════════════════════════════════════════════════════════
     Ein leichter Nachbau und nicht die Anwendung — dieselbe
     Entscheidung wie bei der Wolke, aus einem anderen Grund: in
     einer 300 px breiten Kachel stünde von NeuroLab die Kopfleiste,
     drei Spaltenköpfe und ein Neuron auf Daumennagelgröße. Was ein
     Neuron ist, sagt eines allein deutlicher als die ganze Seite im
     Kleinen.

     Nachgebaut ist deshalb genau EIN Neuron: zwei Eingänge,
     Gewichte, Schwellenwert, Σ, Sprungfunktion, Ausgang.

     ⚠️ Die Kachel zeigt damit ABSICHTLICH etwas anderes als das
     Modal — dort lernt ein dreischichtiges Netz. Das ist keine
     Unstimmigkeit, sondern die Arbeitsteilung: die Kachel sagt in
     einem stehenden Bild, WAS das Ding ist (ein Neuron rechnet aus
     Eingaben eine Ausgabe), das Modal zeigt in zehn Sekunden, was
     es KANN. Dasselbe Netz an beiden Stellen ginge nur in eine
     Richtung schlecht aus: achtzehn Kanten und sieben Neuronen in
     186 px Höhe sind ein Fleck, und wer einen Fleck sieht, klickt
     nicht.

     Anders als bei der Wolke sind die Beschriftungen hier LESBAR
     und sollen es sein: x1, Σ, b = −1,5 sind keine angedeuteten
     Wörter, sondern das, worum es geht. Der Grund, warum die Wolke
     dort Balken zeichnet, gilt hier nicht — fünfzehn Zettel auf
     Maßstab 0,25 sind Matsch, ein Neuron auf Maßstab 0,9 ist ein
     Neuron.

     Die Bewegung beim Darüberfahren zeigt den einen Vorgang, den
     ein Neuron ausmacht: aus Build wird Run, aus leeren Eingängen
     werden Werte, aus „–" wird eine 1.

     aria-hidden: für eine Vorlesestimme ist das ein Bild.
     ═══════════════════════════════════════════════════════════ */

  /* Aus tools/NeuroLab/style.css bzw. dem activations-Eintrag
     `perceptron` in app.js. Die einzige Kopie in dieser Datei — wer
     dort die Farben umbaut, zieht sie hier nach. */
  const C = {
    type:  '#5aab7a',   // Perceptron
    run:   '#f59e0b',   // Run-Phase
    runBg: '#fffbeb',
    runInk:'#92400e',
    build: '#3b82f6',
    ink:   '#475569',
    dim:   '#94a3b8',
    line:  '#d1d5db',
    box:   '#f8fafc'
  };

  function tile() {
    return `<div class="tprev tprev--nl" aria-hidden="true">
      <svg class="nlp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">

        <!-- Was in beiden Zuständen gleich bleibt: das Neuron selbst.
             Es ändert sich ja nichts daran, wenn man Werte hineingibt —
             genau das ist die Aussage der Build-Phase. -->
        <g class="nlp-static">
          <path class="nlp-edge" d="M63 50 L138 68"/>
          <path class="nlp-edge" d="M63 116 L138 100"/>

          <rect x="87.5" y="50" width="26" height="18" rx="5"
                fill="#fff" stroke="${C.type}" stroke-width="1.2"/>
          <text x="100.5" y="63" text-anchor="middle" font-size="12"
                font-weight="700" fill="${C.ink}">1</text>
          <rect x="87.5" y="99" width="26" height="18" rx="5"
                fill="#fff" stroke="${C.type}" stroke-width="1.2"/>
          <text x="100.5" y="112" text-anchor="middle" font-size="12"
                font-weight="700" fill="${C.ink}">1</text>

          <ellipse cx="186" cy="84" rx="54" ry="36"
                   fill="#fff" stroke="${C.type}" stroke-width="2.5"/>
          <line x1="186" y1="52" x2="186" y2="116" stroke="#e8edf2" stroke-width="1.5"/>
          <text x="159" y="95" text-anchor="middle" font-size="30" fill="${C.ink}">Σ</text>
          <!-- Die Sprungfunktion des Perceptrons als Zeichnung statt
               als Formel: „1, wenn z > 0" ist in dieser Größe nicht zu
               lesen, die Stufe ist in jeder Größe zu erkennen. -->
          <path d="M198 98 H212 V72 H228" fill="none" stroke="${C.type}"
                stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>

          <polygon points="159,115 155,123 163,123" fill="${C.dim}"/>
          <line x1="159" y1="123" x2="159" y2="141" stroke="${C.dim}" stroke-width="2"/>
          <text x="159" y="156" text-anchor="middle" font-size="12"
                font-weight="700" fill="#64748b">b = −1,5</text>

          <!-- Die Ausgangsleitung färbt mit, die Bias-Leitung nicht:
               durch die eine geht ein Ergebnis, die andere ist eine
               Einstellung am Neuron und ändert sich nicht. -->
          <line class="nlp-edge" x1="240" y1="84" x2="256" y2="84"/>
        </g>

        <!-- Ruhezustand: Build. Die Eingänge sind Anschlüsse und noch
             keine Zahlen, hinten steht deshalb nichts. -->
        <g class="nlp-build">
          <rect x="8" y="8" width="52" height="20" rx="6"
                fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
          <text x="34" y="22" text-anchor="middle" font-size="11"
                font-weight="700" fill="${C.build}">Build</text>

          <circle cx="44" cy="50"  r="17" fill="#fff" stroke="#4caf8a" stroke-width="2.5"/>
          <text x="44" y="54" text-anchor="middle" font-size="12"
                font-weight="700" fill="#2e7d5e">x1</text>
          <circle cx="44" cy="116" r="17" fill="#fff" stroke="#4caf8a" stroke-width="2.5"/>
          <text x="44" y="120" text-anchor="middle" font-size="12"
                font-weight="700" fill="#2e7d5e">x2</text>

          <rect x="256" y="67" width="62" height="34" rx="6"
                fill="${C.box}" stroke="${C.line}" stroke-width="1.5"/>
          <text x="287" y="90" text-anchor="middle" font-size="16" fill="${C.line}">–</text>
        </g>

        <!-- Beim Darüberfahren: Run. Beide Eingänge auf 1, zusammen
             über der Schwelle — es feuert. -->
        <g class="nlp-run">
          <rect x="8" y="8" width="52" height="20" rx="6"
                fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
          <text x="34" y="22" text-anchor="middle" font-size="11"
                font-weight="700" fill="${C.run}">Run</text>

          <rect x="14" y="35" width="60" height="30" rx="8"
                fill="${C.runBg}" stroke="${C.run}" stroke-width="2"/>
          <text x="24" y="54" font-size="11" font-weight="700" fill="${C.runInk}">x1</text>
          <text x="64" y="54" text-anchor="end" font-size="13"
                font-weight="700" fill="${C.runInk}">1</text>

          <rect x="14" y="101" width="60" height="30" rx="8"
                fill="${C.runBg}" stroke="${C.run}" stroke-width="2"/>
          <text x="24" y="120" font-size="11" font-weight="700" fill="${C.runInk}">x2</text>
          <text x="64" y="120" text-anchor="end" font-size="13"
                font-weight="700" fill="${C.runInk}">1</text>

          <rect x="256" y="67" width="62" height="34" rx="6"
                fill="${C.runBg}" stroke="${C.run}" stroke-width="2"/>
          <text x="287" y="91" text-anchor="middle" font-size="18"
                font-weight="700" fill="${C.runInk}">1</text>
        </g>
      </svg>
    </div>`;
  }

  window.MPPreview.register('neurolab', {
    role: ROLE,
    view, play, tile,

    /* Breitere Bühne. NeuroLab bringt keine Tafel mit, sondern eine
       ganze Anwendung: Kopfleiste, Eingabespalte, vier Schichten,
       Ausgang — und in der Lernphase zusätzlich das Panel mit Reglern
       und Verlaufskurve. Im Regelmaß des Kastens (820 px) schnitt die
       letzte Spalte ab, und die heißt ausgerechnet „Ausgabe"; bei
       980 lag das Panel über dem Ausgabe-Neuron. */
    wide: true,

    /* Keine Blende zwischen zwei Durchgängen. Sie ist dafür gedacht,
       dass beim Zurücksetzen drei Karten auf einmal verschwinden —
       hier setzt das Drehbuch selbst zurück, Klick für Klick, und ein
       Abblenden mittendrin sähe nach Aussetzer aus. */
    fade: false,

    /* Zwei Sätze unter der Bewegung. Was für JEDEN Skill gilt (die
       Klasse braucht kein Konto), steht auf der Seite und nicht hier;
       hierher gehört, was diesen von den anderen unterscheidet — und
       das ist bei NeuroLab, dass nichts geteilt wird. */
    blurb: `
      <p>Ein neuronales Netz zum Anfassen: Schichten zusammenstecken, Gewichte und
         Schwellenwerte von Hand einstellen, Eingaben durchrechnen. Oben lernt es
         gerade selbst — aus gewürfelten Startwerten wird in Sekunden ein Netz, das
         <strong>XOR</strong> kann: die Aufgabe, an der ein einzelnes Neuron
         scheitert.</p>
      <p>Zum Trainieren stehen Logik-Gatter, eine Ziffernerkennung und eine
         Zielscheibe bereit, eigene Daten kommen als CSV-Datei dazu — und für
         Arbeitsblätter gibt es eine Druckansicht.</p>
      <p>Hier baut <strong>jede Person ihr eigenes Netz</strong> — nichts wandert an
         die Wand, nichts wird zusammengezählt. Der Raum trägt allein die Tür: Ein
         QR-Code bringt den Klassensatz in einer halben Minute auf dieselbe Seite.</p>`
  });
})();
