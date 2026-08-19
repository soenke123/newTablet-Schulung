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

  /* ═══════════════════════════════════════════════════════════
     Das Standbild für die Kachel
     ═══════════════════════════════════════════════════════════
     Ein leichter Nachbau und nicht das Werkzeug — die Wolke
     skaliert ihre Tafel ins Fenster, und in einer Kachel landeten
     15 Zettel auf Maßstab 0,25.

     Was der Nachbau trotzdem NACHBILDET, ist die Anordnung: der
     meistgetragene Zettel groß in der Mitte, die Ränge darum
     herum, die kleinen außen, alles leicht schief, satter wo mehr
     Zustimmung liegt, mit Blättern darunter, wo viel liegt. Das
     ist der Punkt der Wolke; eine Kachel mit fünf verstreuten
     Zetteln zeigte etwas anderes, als der Skill tut.

     Was er NICHT nachbildet, sind die Wörter. Auf dieser Größe
     wären sie nicht zu lesen, sondern nur zu erkennen — und was
     man erkennt, aber nicht lesen kann, zieht den Blick genau
     dorthin, wo nichts steht. Also stehen Balken da: das Auge
     liest „Text", ohne es zu versuchen. Was der Skill kann, steht
     daneben in Worten, und die echten Begriffe stehen einen Klick
     weiter im Schaufenster.

     aria-hidden: für eine Vorlesestimme ist das ein Bild.        */

  /* Aus NOTE_RAMPS in tools/wordcloud/tool.js. Die einzige Kopie
     in dieser Datei — wer die Zettelfarben umbaut, zieht sie hier
     nach. Sie steht als Tabelle da und nicht als sechs fertige
     Hexwerte, damit die Sättigung auch hier aus der Stärke folgt
     und nicht aus Handarbeit. */
  const RAMPS = [
    { fP: [237,248,238], fS: [147,211,160], lP: [215,236,217], lS: [111,190,128] }, // Grün
    { fP: [253,238,236], fS: [242,164,154], lP: [247,222,217], lS: [232,131,118] }, // Rosa
    { fP: [254,248,230], fS: [245,210,113], lP: [244,233,200], lS: [223,184,69]  }, // Gelb
    { fP: [235,244,252], fS: [146,190,235], lP: [212,230,246], lS: [107,163,219] }, // Blau
    { fP: [245,240,252], fS: [186,166,226], lP: [230,222,246], lS: [154,130,205] }, // Lila
    { fP: [254,243,231], fS: [246,186,120], lP: [248,228,206], lS: [228,159,86]  }  // Pfirsich
  ];

  const mix = (a, b, t) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
  const fill = (r, t) => mix(RAMPS[r].fP, RAMPS[r].fS, t);
  const line = (r, t) => mix(RAMPS[r].lP, RAMPS[r].lS, t);
  // Dieselbe Dreiteilung wie sheetsFor() im Werkzeug.
  const sheets = t => (t >= 0.72 ? 2 : t >= 0.40 ? 1 : 0);

  /* ── Die Anordnung ──────────────────────────────────────────
     ⚠️ VON HAND GERECHNET, ABER NICHT VON HAND ERFUNDEN. Diese
     Zahlen sind das Ergebnis der Packlogik des Werkzeugs selbst —
     archimedische Spirale mit Kollisionsprüfung, achsenparallele
     Rechtecke der GEDREHTEN Zettel, Abstand wie in findSpot() —,
     einmal offline gerechnet und hier eingetragen. Deshalb sieht
     die Kachel aus wie eine echte Wolke und nicht wie elf
     verteilte Kästchen: Füllgrad 44 %, und die Spirale erreicht
     laut cloudWidth() knapp die Hälfte.

     Wer einen Zettel dazusetzt oder eine Breite ändert, würfelt
     die Packung durcheinander und bekommt Überlappungen. Dann
     bitte neu rechnen lassen, nicht schieben.

     Zwei vollständige Zustände, beide gepackt: `x/y/w` vorher,
     `hover` nachdem der markierte Zettel Zustimmung bekommen hat.
     Die Kachel blendet zwischen ihnen um — die Bewegung ist damit
     eine echte Neuanordnung und kein nachgestelltes Verschieben.
     Der Wurf ist gezielt einer, bei dem sich nur die Nachbarschaft
     sortiert: der gelikte Zettel wächst und tauscht den Platz mit
     seinem Nachbarn, alle anderen rücken um rund 3 px nach. Ein
     Wurf, in dem drei Zettel quer über die Tafel springen, wäre
     genauso echt gewesen und hätte wie ein Wirbel ausgesehen.

     Der Zielzustand steht HIER und nicht im Stylesheet, weil eine
     Regel dort gegen die Inline-Angabe verlöre — das Markup setzt
     zwei Sätze (--x0/--x1), das Stylesheet schaltet nur um. */
  const STILL = [
    { x: 49.2, y: 49.5, w: 38, t: .95, r: 0, tr: -0.7, bars: [88, 66, 42],
      hover: { x: 50.5, y: 49.5 } },
    { x: 45.8, y: 25.4, w: 30, t: .70, r: 3, tr:  2.2, bars: [84, 58],
      hover: { x: 47.1, y: 25.4 } },
    { x: 59.6, y: 73.2, w: 28, t: .58, r: 2, tr: -2.4, bars: [82, 54],
      hover: { x: 60.9, y: 73.2 } },
    { x: 28.3, y: 75.8, w: 27, t: .52, r: 4, tr:  0.9, bars: [76, 46],
      hover: { x: 29.6, y: 75.8 } },
    { x: 84.3, y: 42.7, w: 26, t: .46, r: 1, tr: -1.8, bars: [84, 40],
      hover: { x: 85.6, y: 42.7 } },

    // Die beiden Nachbarn, die Platz machen: die linke Spalte
    // sortiert sich neu, als der Zettel darunter größer wird.
    { x: 15.5, y: 53.9, w: 24, t: .38, r: 5, tr:  1.4, bars: [72],
      hover: { x: 13.3, y: 43.2 } },
    { x: 13.2, y: 38.0, w: 21, t: .24, r: 3, tr:  2.2, bars: [70],
      hover: { x: 16.3, y: 25.9 } },

    { x: 75.1, y: 25.3, w: 22, t: .30, r: 0, tr: -0.7, bars: [78],
      hover: { x: 76.4, y: 25.3 } },
    { x: 86.8, y: 61.7, w: 20, t: .20, r: 2, tr: -2.4, bars: [74],
      hover: { x: 88.2, y: 61.7 } },

    /* Der Zettel, der die Stimme bekommt. Alle drei Kanäle
       schalten mit: größer (19 → 22 %), satter (Stärke .16 → .44)
       und sein erstes Blatt — die Schwelle dafür liegt bei .40,
       weshalb der Zuwachs bewusst darüber hinausgeht. Und er rückt
       nach innen, weil die Wolke nach Zustimmung sortiert. */
    { x: 18.6, y: 21.3, w: 19, t: .16, r: 5, tr:  0.9, bars: [68],
      cls: 'tprev-n--up',
      hover: { x: 17.8, y: 58.5, w: 22, t: .44 } },

    { x: 46.8, y:  7.5, w: 18, t: .13, r: 1, tr: -1.8, bars: [70],
      hover: { x: 48.1, y:  7.5 } },
    { x: 63.3, y: 90.8, w: 17, t: .10, r: 4, tr:  1.4, bars: [64],
      hover: { x: 64.6, y: 90.8 } },
    { x: 42.1, y: 92.8, w: 17, t: .08, r: 2, tr: -0.7, bars: [72],
      hover: { x: 43.5, y: 92.8 } }
  ];

  function noteHTML(n) {
    const h  = n.hover || {};
    const t1 = h.t ?? n.t;

    // Zwei Sätze Werte: 0 = ruhend, 1 = beim Darüberfahren. Fehlt
    // der zweite, fällt das Stylesheet auf den ersten zurück und
    // der Zettel bleibt einfach stehen.
    const v = [
      `--x0:${n.x}%`, `--y0:${n.y}%`, `--w0:${n.w}%`,
      `--x1:${h.x ?? n.x}%`, `--y1:${h.y ?? n.y}%`, `--w1:${h.w ?? n.w}%`,
      `--f0:${fill(n.r, n.t)}`, `--l0:${line(n.r, n.t)}`,
      `--f1:${fill(n.r, t1)}`,  `--l1:${line(n.r, t1)}`,
      `--tr:${n.tr}deg`,
      `--bh:${(3.8 + n.t * 3.4).toFixed(1)}px`,
      `--bh1:${(3.8 + t1 * 3.4).toFixed(1)}px`
    ].join(';');

    const cls = ['tprev-n', 'tprev-s' + sheets(n.t), 'tprev-h' + sheets(t1), n.cls]
      .filter(Boolean).join(' ');
    const bars = n.bars.map(w => `<i style="width:${w}%"></i>`).join('');
    return `<span class="${cls}" style="${v}">${bars}</span>`;
  }

  function tile() {
    return `<div class="tprev" aria-hidden="true">`
      + `<span class="tprev-thumb">👍</span>`
      + STILL.map(noteHTML).join('')
      + `</div>`;
  }

  window.MPPreview.register('wordcloud', {
    role: ROLE,
    view, play, tile,

    /* Steht unter der Bewegung im Modal. Zwei Sätze, mehr nicht —
       wer hier steht, hat die Antwort gerade gesehen und braucht
       nur noch die Einordnung.

       Was hier NICHT mehr steht: dass die Klasse kein Konto
       braucht. Das gilt für jeden Skill und steht deshalb auf der
       Seite („Was kann diese Seite?"), nicht unter einem
       einzelnen. Hierher gehört, was diesen von den anderen
       unterscheidet. */
    blurb: `
      <p>Eine Frage steht an der Wand, alle antworten gleichzeitig vom Tablet.
         Was Zustimmung bekommt, wächst und rückt zur Mitte — ohne dass jemand
         Striche zählt.</p>
      <p>Du kannst <strong>bis zu sieben Fragen</strong> einstellen. Jede bekommt
         ihr eigenes Fach, und jeder blättert für sich zwischen ihnen — du zeigst
         vorne die dritte, während hinten noch jemand an der ersten schreibt.</p>`
  });
})();
