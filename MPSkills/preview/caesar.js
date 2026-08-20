/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/caesar.js   ·   Schaufenster für die Scheibe
   ══════════════════════════════════════════════════════════════
   Drittes Drehbuch nach wordcloud und neurolab. Wie bei NeuroLab
   teilt dieser Skill nichts, also laufen die gefälschten Handlungen
   aus lib/preview.js ins Leere — die Scheibe ruft keine davon auf.

   ── Was im Modal läuft ────────────────────────────────────────
   Die ECHTE Scheibe, und diesmal ohne Rahmen dazwischen: sie ist
   portiert und liegt im Wirt selbst (Begründung im Kopf von
   tools/Caesercode/tool.js). Der Regisseur greift sie deshalb
   direkt, ohne den Umweg über frameDoc().

   Bedient wird ausschließlich über die drei Knöpfe der
   Ablesezeile — `#csNext` und `#csHome`. Und das ist kein
   Notbehelf, sondern der Grund, warum es sie gibt: eine Geste, die
   ein Rad um einen Winkel zieht, lässt sich weder mit einem
   Klick-Ereignis nachstellen noch von jemandem am Beamer bedienen.
   Was das Drehbuch hier drückt, drückt auch eine Lehrkraft.

   ── Warum genau das gezeigt wird ──────────────────────────────
   Eine Cäsar-Scheibe hat einen einzigen Vorgang, und der ist ihr
   ganzer Inhalt: das Rad rastet einen Buchstaben weiter, und in
   der Mitte steht ein anderer Schlüssel. Das Drehbuch tut deshalb
   nichts anderes — drei Schritte einzeln (man soll das Einrasten
   sehen), auf D stehenbleiben, vier weitere, auf H stehenbleiben,
   zurück auf A.

   Kein Ehrgeiz, in zehn Sekunden eine ganze Stunde zu zeigen: bei
   NeuroLab war das nötig, weil ein einzelnes Neuron wie ein
   Taschenrechner aussieht. Hier ist das Einfache das Richtige —
   wer das sieht, weiß, was er im Unterricht damit macht.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  /* Die Rolle ist egal — die Scheibe fragt ctx.role nicht ab und
     ruft keine Handlung auf. 'presenter' ist die ehrlichere Angabe:
     wer hier steht, überlegt, ob er damit eine Stunde macht. */
  const ROLE = 'presenter';

  /* Die Werkzeug-Schnittstelle verlangt bei jedem update() eine
     view. Die Scheibe sieht sie nie an (es gibt nichts Gemeinsames,
     das sich ändern könnte) — sie muss trotzdem die Form haben, die
     auch aus skill_room_get käme. */
  function view() {
    return {
      role: ROLE,
      room: { title: 'Cäsar-Scheibe', settings: {} },
      state: { phase: 1, data: {} },
      limits: {},
      me: { may_write: true },
      entries: []
    };
  }

  /* ─── Das Drehbuch ──────────────────────────────────────── */

  async function play(api) {
    if (!await api.waitFor('#csNext', 4000)) return;

    // Einen Moment auf A stehen lassen: ohne das Vorher fehlt dem
    // ersten Schritt der Vergleich.
    if (!await api.wait(1100)) return;

    // Einzeln und mit Luft dazwischen. Sieben Klicks am Stück wären
    // ein Karussell und zeigten genau das nicht, worum es geht: dass
    // das Rad auf ganzen Buchstaben einrastet.
    for (let i = 0; i < 3; i++) {
      if (!api.click('#csNext')) return;
      if (!await api.wait(720)) return;
    }
    if (!await api.wait(1500)) return;      // Schlüssel D

    for (let i = 0; i < 4; i++) {
      if (!api.click('#csNext')) return;
      if (!await api.wait(560)) return;
    }
    if (!await api.wait(1700)) return;      // Schlüssel H

    // Zurückgestellt wird mit demselben ↺, das im Werkzeug steht —
    // der Regisseur kann es nicht: sein Zurücksetzen ruft
    // update(view), und das hat hier nichts zu tun. Deshalb steht
    // unten auch fade: false.
    api.click('#csHome');
    await api.wait(1500);
  }

  /* ═══════════════════════════════════════════════════════════
     Das Standbild für die Kachel
     ═══════════════════════════════════════════════════════════
     Anders als bei der Wolke (Balken statt Wörter) und bei NeuroLab
     (ein Neuron statt sieben) ist hier KEIN Weglassen nötig: eine
     Scheibe mit 52 Buchstaben ist in 186 px Höhe genau das, was sie
     auch in Lebensgröße ist. Nachgebaut wird sie trotzdem — als
     SVG und nicht als das Werkzeug selbst —, weil das Werkzeug
     seine Größe misst und in einer Kachel nichts zu messen hat.

     Die Bewegung beim Darüberfahren ist der eine Vorgang, den die
     Scheibe kennt: das innere Rad dreht drei Schritte, jeder
     Buchstabe dreht sich dabei um denselben Betrag ZURÜCK und bleibt
     aufrecht — genau wie im Werkzeug (siehe tool.css) —, und rechts
     springt der Schlüssel von A auf D.

     ⚠️ Die Kachel kippt mit dem Kleid der Seite, anders als die von
     NeuroLab (.tprev--nl bleibt hell). Das ist kein Versehen,
     sondern dieselbe Regel von der anderen Seite: eine Kachel soll
     zeigen, was hinter ihr aufgeht — NeuroLab bringt sein eigenes,
     helles Aussehen mit, die Scheibe ist portiert und kippt.

     aria-hidden: für eine Vorlesestimme ist das ein Bild.
     ═══════════════════════════════════════════════════════════ */

  const N = 26, STEP = 360 / N;
  const ALPHA = Array.from({ length: N }, (_, i) => String.fromCharCode(65 + i));

  const CX = 100, CY = 95;          // Mitte der Scheibe im viewBox
  const R_OUT = 74, R_IN = 54;      // Buchstabenkreise

  function ring(r, size) {
    return ALPHA.map((ch, i) => {
      const a = (i * STEP - 90) * Math.PI / 180;   // 0° = oben
      return `<text x="${(CX + r * Math.cos(a)).toFixed(2)}"`
           + ` y="${(CY + r * Math.sin(a)).toFixed(2)}"`
           + ` font-size="${size}" text-anchor="middle"`
           + ` dominant-baseline="central">${ch}</text>`;
    }).join('');
  }

  function tile() {
    return `<div class="tprev tprev--cs" aria-hidden="true">
      <svg class="csp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">

        <circle class="csp-outer" cx="${CX}" cy="${CY}" r="84"/>
        <g class="csp-out">${ring(R_OUT, 10)}</g>

        <circle class="csp-inner" cx="${CX}" cy="${CY}" r="65"/>
        <!-- Dreht sich beim Darüberfahren. Die Buchstaben darin
             drehen einzeln zurück (siehe style.css), sonst stünde
             die untere Hälfte schräg. -->
        <g class="csp-in">${ring(R_IN, 8.5)}</g>

        <circle class="csp-knob" cx="${CX}" cy="${CY}" r="17"/>
        <!-- Zwei Schlüssel übereinander, einer davon durchsichtig:
             der Buchstabe in der Mitte WANDERT nicht, er wird ein
             anderer. Eine Drehung wäre hier die falsche Bewegung. -->
        <text class="csp-key csp-k0" x="${CX}" y="${CY}" font-size="16"
              text-anchor="middle" dominant-baseline="central">A</text>
        <text class="csp-key csp-k1" x="${CX}" y="${CY}" font-size="16"
              text-anchor="middle" dominant-baseline="central">D</text>

        <text class="csp-lbl" x="248" y="72" font-size="10">Schlüssel</text>
        <text class="csp-big csp-k0" x="248" y="103" font-size="30">A</text>
        <text class="csp-big csp-k1" x="248" y="103" font-size="30">D</text>
        <text class="csp-map csp-k0" x="248" y="126" font-size="11">A → A</text>
        <text class="csp-map csp-k1" x="248" y="126" font-size="11">A → D</text>
      </svg>
    </div>`;
  }

  window.MPPreview.register('caesar', {
    role: ROLE,
    view, play, tile,

    /* Regelmaß reicht. Die Scheibe ist rund und misst ihren
       Durchmesser aus dem, was da ist — anders als NeuroLab, das
       eine Kopfleiste und fünf Spalten nebeneinander unterbringen
       muss und deshalb `wide` bekam. */
    wide: false,

    /* Keine Blende zwischen zwei Durchgängen. Sie ist dafür da, dass
       beim Zurücksetzen mehrere Karten auf einmal verschwinden —
       hier stellt das Drehbuch selbst zurück, mit einem Klick auf
       ↺, und ein Abblenden mittendrin sähe nach Aussetzer aus. */
    fade: false,

    blurb: `
      <p>Die klassische Cäsar-Verschlüsselung als Scheibe: das <strong>innere Rad</strong>
         lässt sich drehen, das äußere bleibt stehen. Innen steht der Klartext, außen der
         Geheimtext — welcher Buchstabe zu welchem wird, liest man ab, statt es
         auszurechnen.</p>
      <p>In der Mitte steht der <strong>Schlüssel</strong>, daneben die Verschiebung. Das
         reicht für die Ansage an die Klasse („alle auf D") und fürs Mitschreiben an der
         Tafel. Gedreht wird mit dem Finger oder Schritt für Schritt über die Knöpfe.</p>
      <p>Bewusst <strong>ohne Eingabefeld</strong>: Wörter Buchstabe für Buchstabe
         umzusetzen ist die Aufgabe, nicht der Umweg. Jede Person dreht ihre eigene
         Scheibe — nichts wandert an die Wand, nichts wird zusammengezählt. Der Raum
         trägt allein die Tür: Ein QR-Code bringt den Klassensatz in einer halben Minute
         auf dieselbe Seite.</p>`
  });
})();
