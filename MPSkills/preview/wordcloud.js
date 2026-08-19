/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/wordcloud.js   ·   Schaufenster für WordPool
   ══════════════════════════════════════════════════════════════
   Was lib/preview.js NICHT wissen kann: welche Begriffe an der
   Wand hängen und in welcher Reihenfolge im Schaufenster etwas
   passiert. Die generische Schicht kennt nur das Schema der
   Inhaltsschicht (entries mit payload, votes, hidden) — was in
   payload steht, weiß allein das Werkzeug.

   ── Warum eine eigene Datei und kein dritter Platz im Ordner ──
   lib/tool.js sagt: ein Werkzeug ist ein Ordner mit GENAU ZWEI
   Dateien. Diese hier ist Werbung und nicht Werkzeug — sie darf
   im Raum nie mitlaufen. Also steht sie daneben und nicht darin.

   ── Die Dummy-Begriffe ────────────────────────────────────────
   Eine echte Frage mit echten Antworten, keine Platzhalter à la
   „Begriff 1". Wer die Kachel öffnet, überlegt, ob er damit eine
   Stunde macht — dafür muss er sehen, wie es mit Inhalt aussieht,
   und „Lorem 1…15" zeigt nur, wie es mit Füllsel aussieht.

   Die Stimmen sind bewusst ungleich verteilt: gleich viele
   überall hieße gleich große Zettel, und dann zeigte die
   Vorschau ausgerechnet das nicht, was die Wolke ausmacht.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const QUESTION = 'Was macht guten Unterricht aus?';

  /* [Text, Stimmen] — die Streuung ergibt eine Wolke mit einer
     klaren Mitte, zwei Rängen darum und ein paar Einzelstimmen am
     Rand. Genau daran sieht man Größe, Sättigung und Stapel. */
  const TERMS = [
    ['Zuhören',                      7],
    ['Niemand wird bloßgestellt',    6],
    ['Klare Ziele',                  5],
    ['Humor',                        5],
    ['Fragen stellen dürfen',        4],
    ['Zeit zum Nachdenken',          3],
    ['Feedback, das weiterhilft',    3],
    ['Selbst ausprobieren',          3],
    ['Gruppenarbeit',                2],
    ['Ruhe zum Arbeiten',            2],
    ['Abwechslung',                  2],
    ['Beispiele aus dem Alltag',     1],
    ['Fair benotet',                 1],
    ['Pausen',                       1],
    ['Man merkt, dass es interessiert', 1]
  ];

  /* Was im Drehbuch neu geschrieben wird. Kurz genug, dass das
     Tippen nicht zur Geduldsprobe wird — bei 38 ms je Zeichen
     sind 22 Zeichen knapp eine Sekunde. */
  const NEUE = ['Man darf Fehler machen', 'Gute Erklärungen', 'Zeit für Fragen'];
  let neuIdx = 0;

  /* ── Warum die Beamer-Rolle und nicht die des Tablets ───────
     Zwei Gründe, und der erste ist handfest: als Teilnehmer
     schiebt das Werkzeug beim ersten Zeichnen den Auftrag der
     Phase als Fenster über die Wolke (update() in tool.js). Im
     Raum ist das genau richtig — ohne Ansage merkt niemand den
     Phasenwechsel. Im Schaufenster verdeckt es das, was man
     sehen wollte, und müsste erst weggeklickt werden. Am Beamer
     kommt es nicht: dort hat die Lehrkraft die Phase selbst
     geschaltet.

     Der zweite: wer hier steht, überlegt, ob er damit eine
     Stunde macht. Dann ist die Ansicht, die er sehen will, seine
     eigene — samt der Leiste, mit der er weiterschaltet.        */
  const ROLE = 'presenter';

  function view() {
    return {
      role: ROLE,
      room: {
        title: 'WordPool',
        settings: { questions: [{ id: 'q1', text: QUESTION }] }
      },
      state: { phase: 1, data: {} },
      /* max_entries 0 = unbegrenzt. Im Schaufenster darf der
         Plus-Knopf nie blass werden — ein Kontingent, das hier
         zuschlägt, erklärt einem Gast nichts, es hält nur das
         Drehbuch an. */
      limits: {
        max_entries: 0, group_field: 'q', text_field: 'text',
        min_len: 3, max_len: 60, phases: 2, write_phases: [1]
      },
      me: { may_write: true, entries_by_group: {} },
      entries: TERMS.map((t, i) => ({
        id:         'pv-' + i,
        payload:    { q: 'q1', text: t[0] },
        votes:      t[1],
        voted:      false,
        // Fremde Zettel — dem eigenen kann man nicht zustimmen,
        // und genau das will das Drehbuch zeigen.
        is_mine:    false,
        by_teacher: false,
        hidden:     false,
        author:     'User ' + (i + 1),
        created_at: new Date(Date.now() - (TERMS.length - i) * 60000).toISOString(),
        updated_at: new Date(Date.now() - (TERMS.length - i) * 60000).toISOString()
      }))
    };
  }

  /* ─── Das Drehbuch ──────────────────────────────────────────
     Ein Durchgang. lib/preview.js setzt danach zurück und ruft
     erneut auf; das Zurücksetzen selbst gehört nicht hierher.

     Jeder Schritt prüft, ob die Vorstellung noch läuft — wer das
     Modal mitten im Tippen schließt, soll nicht noch zwei
     Sekunden lang in ein abgeräumtes DOM greifen lassen. */
  async function play(api) {
    api.say('15 Begriffe von 15 Tablets. Der meistgetragene liegt in der Mitte.');
    if (!await api.wait(2200)) return;

    api.say('Zweimal tippen heißt zustimmen — die Wolke ordnet sich sofort neu.');
    if (!await api.wait(1000)) return;

    /* Drei verschiedene Zettel, nicht dreimal derselbe: Zustimmen
       ist ein Umschalter, der zweite Doppeltipp auf dieselbe Karte
       nähme die Stimme wieder weg. */
    for (const id of ['pv-13', 'pv-9', 'pv-5']) {
      if (!await api.doubleTap(id)) break;
      if (!await api.wait(1900)) return;
    }

    api.say('Über das ＋ schreibst du selbst etwas dazu.');
    if (!await api.wait(700)) return;

    if (api.click('#bdCatAdd')) {
      if (!await api.wait(750)) return;
      await api.type('#bdText', NEUE[neuIdx++ % NEUE.length]);
      if (!await api.wait(550)) return;
      api.click('#bdSave');
      if (!await api.wait(2600)) return;
    }

    api.say('Und weiter — solange die Klasse schreibt.');
    await api.wait(1600);
  }

  /* ─── Das Standbild für die Kachel ──────────────────────────
     Bewusst ein leichter Nachbau und nicht das Werkzeug: die
     Wolke skaliert ihre Tafel ins Fenster, und in einer 260 px
     breiten Kachel würden 15 Zettel auf Maßstab 0,25 gestaucht.
     Hier stehen fünf, groß genug zum Lesen.

     Die Farben sind aus NOTE_RAMPS (tool.js) an der jeweiligen
     Stärke ausgemischt und stehen deshalb als fertige Werte da.
     Das ist eine Kopie — sie darf es sein, weil ein Standbild
     ohnehin nur die Anmutung trägt und nicht die Anordnung. Wer
     die Zettelfarben umbaut, sieht hier fünf Zahlenpaare, die
     nachzuziehen sind.

     aria-hidden: für eine Vorlesestimme ist das ein Bild, kein
     Text. Was der Skill kann, steht im Blurb daneben. */
  const STILL = [
    // [Text, links %, oben %, Schriftgrad rem, Breite px, Neigung, Füllung, Kante, Klasse]
    ['Zuhören',      50, 44, 1.05, 118, '-1.8deg', 'rgb(156,215,168)', 'rgb(121,195,137)', 'tprev-n--a'],
    ['Klare Ziele',  18, 22, 0.72,  84, '1.4deg',  'rgb(186,214,243)', 'rgb(154,193,231)', 'tprev-n--b'],
    ['Humor',        82, 27, 0.76,  66, '-0.7deg', 'rgb(251,235,189)', 'rgb(237,216,154)', 'tprev-n--c'],
    ['Pausen',       22, 78, 0.62,  62, '2.2deg',  'rgb(251,225,221)', 'rgb(244,206,199)', 'tprev-n--d'],
    ['Feedback',     78, 76, 0.68,  74, '-2.4deg', 'rgb(227,218,244)', 'rgb(207,194,234)', 'tprev-n--e']
  ];

  function tile() {
    const notes = STILL.map(n => `<span class="tprev-n ${n[8]}" style="`
      + `left:${n[1]}%;top:${n[2]}%;font-size:${n[3]}rem;width:${n[4]}px;`
      + `--tr:${n[5]};--f:${n[6]};--l:${n[7]}">${n[0]}</span>`).join('');
    return `<div class="tprev" aria-hidden="true"><span class="tprev-thumb">👍</span>${notes}</div>`;
  }

  window.MPPreview.register('wordcloud', {
    role: ROLE,
    view, play, tile,

    /* Steht unter der Bewegung im Modal. Drei Sätze, mehr nicht —
       wer hier steht, hat die Antwort gerade gesehen und braucht
       nur noch die Einordnung. */
    blurb: `
      <p>Eine Frage steht an der Wand, alle antworten gleichzeitig vom Tablet.
         Was Zustimmung bekommt, wächst und rückt zur Mitte — ohne dass jemand
         Striche zählt.</p>
      <p>Deine Klasse braucht dafür <strong>kein Konto</strong>: du zeigst den
         QR-Code, sie scannen, sie schreiben. Du stellst bis zu sieben Fragen
         nebeneinander und schaltest weiter, wenn genug zusammengekommen ist.</p>`
  });
})();
