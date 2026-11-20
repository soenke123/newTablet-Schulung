/* ══════════════════════════════════════════════════════════════
   NeuroLab · szenarien.js — Bereiche, Rätsel und Trainings-Szenarien
   ══════════════════════════════════════════════════════════════
   Drei Bereiche (AREAS), jeder mit Kacheln. Die ids sind zugleich die
   Freigabe-Schlüssel im Raum (skill_room_state.data.parts) — NIE
   umbenennen, sonst verlieren laufende Räume ihre Freigaben.

   Ein Szenario:
     id, area ('bauen' | 'trainieren'), title, short, task (HTML)
     inputs  [{ key, label, unit?, real?(n) → Anzeige in echter Einheit }]
     outputs [{ key, label }]                 FEST — Neuronen werden angedockt
     rows    [{ x, t, grp?, name?, test? }]   Wertetabelle bzw. Daten
     rules   { acts, maxNeurons, maxLayers }  Vorgaben (fehlt = frei)
     start() → Netz                           Anfangsaufbau
     goal    { acc }                          ab welcher Trefferquote gelöst
     cls     true = Klassen (größter Ausgang gewinnt)
     plot    { type: '2d' | '3d' | 'curve', ax: [i, j(, k)], groups?, value? }
     hints   [Text, …]                        Tipps, einer nach dem anderen
     teacher { ziel, impuls }                 nur für die Lehrkraft („i“)
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const N = window.NLNetz;
  const D = window.NLData;

  /* ── Hilfen ─────────────────────────────────────────────── */
  const bits = n => Array.from({ length: 1 << n }, (_, i) =>
    Array.from({ length: n }, (_, k) => (i >> (n - 1 - k)) & 1));

  function truth(n, fns) {
    return bits(n).map(x => ({ x, t: fns.map(f => (f(...x) ? 1 : 0)) }));
  }

  function emptyNet(sc, layers, act) {
    const net = {
      inputs: sc.inputs.map(i => ({ key: i.key, label: i.label })),
      layers: [],
      outputs: sc.outputs.map(o => ({ key: o.key, label: o.label, src: null }))
    };
    (layers || []).forEach((k, l) => {
      const inN = l === 0 ? net.inputs.length : net.layers[l - 1].length;
      net.layers.push(Array.from({ length: k }, () => N.makeNeuron(inN, act)));
    });
    return net;
  }

  /* ── Greifvögel ─────────────────────────────────────────── */
  const VOGEL = [
    { name: 'Eckschwanzsperber ♂', short: 'Sperber ♂', color: '#3f8fe0' },
    { name: 'Eckschwanzsperber ♀', short: 'Sperber ♀', color: '#8d63d2' },
    { name: 'Rundschwanzsperber',  short: 'Rundschwanz', color: '#e39a2d' },
    { name: 'Rotschwanzbussard',   short: 'Bussard', color: '#d64b4b' }
  ];
  const V_IN = [
    { key: 'fluegel', label: 'Flügel', unit: 'mm', c: 280, s: 140 },
    { key: 'gewicht', label: 'Gewicht', unit: 'g', c: 700, s: 700 },
    { key: 'schwanz', label: 'Schwanz', unit: 'mm', c: 185, s: 60 }
  ].map(i => Object.assign(i, {
    norm: v => (v - i.c) / i.s,
    real: n => Math.round(n * i.s + i.c)
  }));

  /* groupsTo(g) → Soll-Liste für einen Vogel der Gruppe g */
  function vogelRows(groups, dims, groupsTo) {
    const rows = [];
    groups.forEach(g => {
      D.VOEGEL[g].forEach((v, i) => {
        rows.push({
          x: dims.map(d => +V_IN[d].norm(v[d]).toFixed(3)),
          raw: dims.map(d => v[d]),
          t: groupsTo(g), grp: g, name: VOGEL[g].name,
          test: i % 4 === 3            // jeder vierte Vogel bleibt fürs Prüfen
        });
      });
    });
    return rows;
  }

  const bird = (g) => VOGEL[g];

  /* ── Bereiche ───────────────────────────────────────────── */
  const AREAS = [
    { id: 'neuron', kicker: 'Bereich 1 · Verstehen', title: 'Das Neuron',
      text: 'Wie rechnet ein künstliches Neuron? Schritt für Schritt zum Ausprobieren.',
      items: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'] },
    { id: 'bauen', kicker: 'Bereich 2 · Netze bauen', title: 'Du stellst die Gewichte ein',
      text: 'Baue Netze für feste Aufgaben. Die Ausgänge stehen fest, du dockst deine Neuronen an.',
      items: ['b-freibad', 'b-gatter', 'b-mehrheit', 'b-rauch', 'b-xor', 'b-addierer', 'b-ziffer', 'b-vogel1', 'b-vogel2', 'b-frei'] },
    { id: 'trainieren', kicker: 'Bereich 3 · Netze trainieren', title: 'Das Netz lernt selbst',
      text: 'Du baust nur den Aufbau. Die Gewichte findet das Training — aus Beispielen mit Lösung.',
      items: ['t-gatter', 't-vogel1', 't-vogel2', 't-vogel3', 't-vogel3d', 't-ziffer', 't-zielscheibe', 't-kurve'] }
  ];

  const S = {};
  const add = sc => { S[sc.id] = sc; };

  /* ════ Bereich 2: Netze bauen ═══════════════════════════════ */

  add({
    id: 'b-freibad', area: 'bauen', art: 'pool',
    title: 'Ab ins Freibad?', short: 'Ein Neuron entscheidet',
    task: 'Lina geht nur ins Freibad, wenn <b>die Sonne scheint</b> UND sie <b>Zeit hat</b>. ' +
          'Stelle die zwei Gewichte und den Bias so ein, dass das Neuron für alle vier Fälle richtig entscheidet.',
    inputs: [{ key: 'sonne', label: 'Sonne' }, { key: 'zeit', label: 'Zeit' }],
    outputs: [{ key: 'bad', label: 'Freibad' }],
    rows: truth(2, [(s, z) => s && z]),
    rules: { acts: ['step'], maxNeurons: 1, maxLayers: 1, fixed: true },
    start() { const n = emptyNet(this, [1], 'step'); n.outputs[0].src = { l: 0, n: 0 }; return n; },
    plot: { type: '2d', ax: [0, 1], value: true },
    hints: ['Probiere zuerst: beide Gewichte = 1. Was kommt bei Sonne=1, Zeit=1 als Summe heraus?',
            'Das Neuron „feuert“ (1), wenn die Summe größer als 0 ist. Der Bias verschiebt diese Grenze.',
            'Mit w₁ = 1, w₂ = 1 ist die Summe 0, 1 oder 2. Ein Bias von −1,5 lässt nur die 2 durch.'],
    teacher: { ziel: 'Gewicht, Summe, Bias und Stufenfunktion an einer Alltagsentscheidung.',
      impuls: 'Was müsstest du ändern, damit Lina schon geht, wenn nur EINE Bedingung erfüllt ist?' }
  });

  add({
    id: 'b-gatter', area: 'bauen', art: 'gate',
    title: 'UND, ODER, NICHT', short: 'Drei Ausgänge andocken',
    task: 'Rechts stehen drei feste Ausgänge. Baue für jeden ein Neuron und <b>ziehe es auf seinen Ausgang</b>. ' +
          'Die Reihenfolge deiner Neuronen ist egal.',
    inputs: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    outputs: [{ key: 'and', label: 'A UND B' }, { key: 'or', label: 'A ODER B' }, { key: 'nota', label: 'NICHT A' }],
    rows: truth(2, [(a, b) => a && b, (a, b) => a || b, (a) => !a]),
    rules: { acts: ['step'], maxNeurons: 3, maxLayers: 1 },
    start() { return emptyNet(this, [3], 'step'); },
    demo() {   // Schaufenster: fertig gebaut, absichtlich nicht in der Reihenfolge der Ausgänge
      const n = emptyNet(this, [3], 'step');
      [[[1, 1], -0.5], [[-1, 0], 0.5], [[1, 1], -1.5]].forEach(([w, b], i) => { n.layers[0][i].w = w; n.layers[0][i].b = b; });
      n.outputs[0].src = { l: 0, n: 2 }; n.outputs[1].src = { l: 0, n: 0 }; n.outputs[2].src = { l: 0, n: 1 };
      return n;
    },
    plot: { type: '2d', ax: [0, 1], value: true },
    hints: ['Ziehe vom Punkt rechts am Neuron eine Leitung auf einen Ausgang. Oder: Punkt antippen, dann Ausgang antippen.',
            'UND und ODER unterscheiden sich nur im Bias: Wie hoch muss die Schwelle sein?',
            'NICHT A: Gewicht von A negativ, B egal (0), Bias positiv.'],
    teacher: { ziel: 'Ein Neuron = eine Entscheidung; dieselbe Struktur, andere Gewichte → andere Funktion.',
      impuls: 'Vergleicht die Gewichte von UND und ODER. Was ist gleich, was ist anders?' }
  });

  add({
    id: 'b-mehrheit', area: 'bauen', art: 'vote',
    title: 'Mehrheit gewinnt', short: 'Drei Stimmen',
    task: 'Drei Personen stimmen ab (1 = ja). Der Ausgang soll 1 sein, wenn <b>mindestens zwei</b> zustimmen.',
    inputs: [{ key: 'a', label: 'Ali' }, { key: 'b', label: 'Bea' }, { key: 'c', label: 'Cem' }],
    outputs: [{ key: 'ja', label: 'Mehrheit' }],
    rows: truth(3, [(a, b, c) => a + b + c >= 2]),
    rules: { acts: ['step'], maxNeurons: 1, maxLayers: 1 },
    start() { return emptyNet(this, [1], 'step'); },
    hints: ['Alle Stimmen zählen gleich viel — also gleiche Gewichte.',
            'Die Summe ist 0, 1, 2 oder 3. Wo muss die Grenze liegen?'],
    teacher: { ziel: 'Schwellenwert verschieben bei gleichen Gewichten.',
      impuls: 'Wie wird daraus „alle drei müssen zustimmen“? Wie „Ali hat ein Vetorecht“?' }
  });

  add({
    id: 'b-rauch', area: 'bauen', art: 'smoke',
    title: 'Der Rauchmelder', short: 'Gewichte können hemmen',
    task: 'Der Melder soll Alarm geben bei <b>Rauch oder Hitze</b> — aber <b>nicht</b>, wenn gerade gekocht wird.',
    inputs: [{ key: 'rauch', label: 'Rauch' }, { key: 'hitze', label: 'Hitze' }, { key: 'kochen', label: 'Kochen' }],
    outputs: [{ key: 'alarm', label: 'Alarm' }],
    rows: truth(3, [(r, h, k) => (r || h) && !k]),
    rules: { acts: ['step'], maxNeurons: 1, maxLayers: 1 },
    start() { return emptyNet(this, [1], 'step'); },
    hints: ['Ein negatives Gewicht drückt die Summe nach unten — es „hemmt“.',
            'Kochen muss stärker hemmen, als Rauch und Hitze zusammen anschieben.'],
    teacher: { ziel: 'Negative (hemmende) Gewichte.',
      impuls: 'Biologisch gibt es auch hemmende Synapsen. Wo noch im Alltag „hemmt“ eine Bedingung?' }
  });

  add({
    id: 'b-xor', area: 'bauen', art: 'xor',
    title: 'Entweder – oder (XOR)', short: 'Geht das mit einem Neuron?',
    task: 'Der Ausgang soll 1 sein, wenn <b>genau einer</b> der Eingänge 1 ist. Versuche es erst mit einem Neuron. ' +
          'Wenn es nicht klappt: füge eine Schicht hinzu.',
    inputs: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    outputs: [{ key: 'xor', label: 'A XOR B' }],
    rows: truth(2, [(a, b) => a !== b]),
    rules: { acts: ['step'], maxLayers: 2, maxNeurons: 4 },
    start() { return emptyNet(this, [1], 'step'); },
    plot: { type: '2d', ax: [0, 1], value: true },
    hints: ['Schau dir das Diagramm an: Ein Neuron zieht EINE Gerade. Lassen sich die 1er mit einer Geraden von den 0ern trennen?',
            'Zwei Neuronen in Schicht 1: eins für „A ODER B“, eins für „NICHT (A UND B)“.',
            'Das Neuron in Schicht 2 verknüpft beide mit UND.'],
    teacher: { ziel: 'Grenze eines einzelnen Neurons (lineare Trennbarkeit) → versteckte Schicht.',
      impuls: 'Warum braucht man zwei Geraden? Zeigt es im Diagramm.' }
  });

  add({
    id: 'b-addierer', area: 'bauen', art: 'add',
    title: 'Der Halbaddierer', short: 'Zwei Ausgänge, ein Netz',
    task: 'Das Netz soll zwei Bits addieren: <b>Summe</b> (die Einerstelle) und <b>Übertrag</b> (die Zweierstelle). ' +
          '1 + 1 = 10 im Zweiersystem.',
    inputs: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    outputs: [{ key: 'sum', label: 'Summe' }, { key: 'carry', label: 'Übertrag' }],
    rows: truth(2, [(a, b) => a !== b, (a, b) => a && b]),
    rules: { acts: ['step'], maxLayers: 2, maxNeurons: 5 },
    start() { return emptyNet(this, [2], 'step'); },
    hints: ['Summe ist XOR (das kennst du schon), Übertrag ist UND.',
            'Ein Neuron aus Schicht 1 darf an einem Ausgang hängen UND gleichzeitig weiterleiten.'],
    teacher: { ziel: 'Teilergebnisse wiederverwenden; Brücke zur Technik (Rechenwerk).',
      impuls: 'Wie viele Neuronen braucht ihr mindestens?' }
  });

  const SEG = [
    [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
    [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1]];
  const SEG_IN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(k => ({ key: k, label: 'Seg. ' + k }));

  add({
    id: 'b-ziffer', area: 'bauen', art: 'seg',
    title: 'Ziffern erkennen', short: 'Sieben Eingänge',
    task: 'Die 7-Segment-Anzeige zeigt eine Ziffer. Baue je ein Neuron, das die <b>0</b> und die <b>1</b> erkennt — und bei allen anderen Ziffern 0 ausgibt.',
    inputs: SEG_IN,
    outputs: [{ key: 'null', label: 'ist 0' }, { key: 'eins', label: 'ist 1' }],
    rows: SEG.map((x, d) => ({ x, t: [d === 0 ? 1 : 0, d === 1 ? 1 : 0], name: 'Ziffer ' + d })),
    rules: { acts: ['step'], maxNeurons: 2, maxLayers: 1 },
    start() { return emptyNet(this, [2], 'step'); },
    seg: true,
    hints: ['Für die 1 müssen b und c leuchten — und alle anderen aus sein. Gib „falschen“ Segmenten ein negatives Gewicht.',
            'Die 0 ist die 8 ohne Segment g. Welches Gewicht bekommt g?'],
    teacher: { ziel: 'Viele Eingänge, Muster erkennen durch positive und negative Gewichte.',
      impuls: 'Die Gewichte sind ein „Bild“ der Ziffer. Zeichnet sie nach!' }
  });

  add({
    id: 'b-vogel1', area: 'bauen', art: 'bird',
    title: 'Greifvögel: eine Gerade', short: 'Echte Daten von Hand trennen',
    task: '90 echte Greifvögel: Bussarde und Sperber. Stelle Gewichte und Bias so ein, dass die <b>Gerade</b> im Diagramm ' +
          'die Bussarde von den Sperbern trennt. Ziel: mindestens 95 % richtig.',
    inputs: V_IN.slice(0, 2),
    outputs: [{ key: 'bussard', label: 'Bussard' }],
    rows: vogelRows([0, 1, 3], [0, 1], g => [g === 3 ? 1 : 0]),
    groups: VOGEL,
    rules: { acts: ['step'], maxNeurons: 1, maxLayers: 1, fixed: true },
    start() { const n = emptyNet(this, [1], 'step'); n.outputs[0].src = { l: 0, n: 0 }; return n; },
    goal: { acc: 0.95 },
    plot: { type: '2d', ax: [0, 1] },
    hints: ['Jedes Neuron mit zwei Eingängen ist eine Gerade: w₁·Flügel + w₂·Gewicht + b = 0.',
            'Bussarde sind groß und schwer. Probiere w₁ = 1, w₂ = 1 und verschiebe dann mit dem Bias.'],
    teacher: { ziel: 'Ein Neuron = eine Gerade; Gewichte drehen sie, der Bias verschiebt sie.',
      impuls: 'Was passiert mit der Geraden, wenn ihr ein Gewicht negativ macht?' }
  });

  add({
    id: 'b-vogel2', area: 'bauen', art: 'bird2',
    title: 'Greifvögel: zwei Geraden', short: 'Der Vogel in der Mitte',
    task: 'Der <b>Rundschwanzsperber</b> ist mittelgroß — er liegt zwischen den anderen. Eine Gerade reicht nicht. ' +
          'Baue zwei Neuronen (zwei Geraden) und verknüpfe sie in einer zweiten Schicht. Ziel: 90 %.',
    inputs: V_IN.slice(0, 2),
    outputs: [{ key: 'rund', label: 'Rundschwanz' }],
    rows: vogelRows([0, 1, 2, 3], [0, 1], g => [g === 2 ? 1 : 0]),
    groups: VOGEL,
    rules: { acts: ['step'], maxNeurons: 3, maxLayers: 2 },
    start() { return emptyNet(this, [2, 1], 'step'); },
    goal: { acc: 0.9 },
    plot: { type: '2d', ax: [0, 1] },
    hints: ['Neuron 1: „größer als die kleinen Sperber“. Neuron 2: „kleiner als die Bussarde“.',
            'Das Neuron in Schicht 2 ist ein UND aus beiden: es feuert nur, wenn beide feuern.'],
    teacher: { ziel: 'Zwei Geraden + UND = ein Band. Dieselbe Idee wie XOR, nur mit echten Daten.',
      impuls: 'Was ist hier anders als bei XOR — und was gleich?' }
  });

  add({
    id: 'b-frei', area: 'bauen', art: 'free',
    title: 'Freies Bauen', short: 'Ohne Aufgabe',
    task: 'Baue, was du willst: Eingänge und Ausgänge kannst du hier selbst festlegen.',
    free: true,
    inputs: [{ key: 'x1', label: 'x₁' }, { key: 'x2', label: 'x₂' }],
    outputs: [{ key: 'y1', label: 'y₁' }],
    rows: [],
    rules: {},
    start() { return emptyNet(this, [2], 'sigmoid'); },
    hints: [],
    teacher: { ziel: 'Offenes Bauen, z. B. für Arbeitsblätter mit der Druckansicht.', impuls: '' }
  });

  /* ════ Bereich 3: Netze trainieren ══════════════════════════ */

  add({
    id: 't-gatter', area: 'trainieren', art: 'gate', train: true,
    title: 'Gatter lernen', short: 'UND, ODER, XOR',
    task: 'Dieselben Aufgaben wie beim Bauen — diesmal stellt das <b>Training</b> die Gewichte ein. ' +
          'Docke deine Neuronen an die drei Ausgänge und starte. Klappt XOR ohne versteckte Schicht?',
    inputs: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
    outputs: [{ key: 'and', label: 'UND' }, { key: 'or', label: 'ODER' }, { key: 'xor', label: 'XOR' }],
    rows: truth(2, [(a, b) => a && b, (a, b) => a || b, (a, b) => a !== b]),
    start() { return emptyNet(this, [3], 'sigmoid'); },
    lr: 2, goal: { acc: 1 },
    plot: { type: '2d', ax: [0, 1], value: true },
    hints: ['Ohne versteckte Schicht bleibt XOR bei 0,5 hängen — es fehlt die zweite Gerade.',
            'Füge vor deinen Ausgangs-Neuronen eine Schicht mit 2–3 Neuronen ein.'],
    teacher: { ziel: 'Vergleich Bauen ↔ Trainieren; XOR braucht auch beim Lernen eine versteckte Schicht.',
      impuls: 'Sind die gelernten Gewichte dieselben wie eure? Warum nicht?' }
  });

  add({
    id: 't-vogel1', area: 'trainieren', art: 'bird', train: true,
    title: 'Bussard oder Sperber?', short: '1 Gerade · lernen',
    task: 'Ein einziges Neuron soll lernen, Bussarde von Sperbern zu unterscheiden. Beobachte im Diagramm, ' +
          'wie die <b>Gerade</b> beim Training wandert.',
    inputs: V_IN.slice(0, 2),
    outputs: [{ key: 'bussard', label: 'Bussard' }],
    rows: vogelRows([0, 1, 3], [0, 1], g => [g === 3 ? 1 : 0]),
    groups: VOGEL,
    start() { return emptyNet(this, [1], 'sigmoid'); },
    lr: 1, goal: { acc: 0.97 },
    plot: { type: '2d', ax: [0, 1] },
    hints: ['Erst das Neuron an den Ausgang „Bussard“ ziehen, dann „Trainieren“.'],
    teacher: { ziel: 'Training = Gerade schrittweise verschieben, bis der Fehler klein ist.',
      impuls: 'Startet mehrmals neu („Neu würfeln“). Landet die Gerade immer gleich?' }
  });

  add({
    id: 't-vogel2', area: 'trainieren', art: 'bird2', train: true,
    title: 'Der Vogel in der Mitte', short: '2 Geraden · lernen',
    task: 'Das Netz soll den <b>Rundschwanzsperber</b> erkennen. Er liegt zwischen den anderen Vögeln. ' +
          'Wie viele Neuronen brauchst du in der versteckten Schicht?',
    inputs: V_IN.slice(0, 2),
    outputs: [{ key: 'rund', label: 'Rundschwanz' }],
    rows: vogelRows([0, 1, 2, 3], [0, 1], g => [g === 2 ? 1 : 0]),
    groups: VOGEL,
    start() { return emptyNet(this, [1], 'sigmoid'); },
    demo() { const n = emptyNet(this, [2, 1], 'sigmoid'); n.outputs[0].src = { l: 1, n: 0 }; return n; },
    lr: 1, goal: { acc: 0.93 },
    plot: { type: '2d', ax: [0, 1] },
    hints: ['Mit einem Neuron bleibt eine Seite immer falsch. Füge eine Schicht davor ein.',
            'Zwei versteckte Neuronen = zwei Geraden. Das Ausgangs-Neuron verknüpft sie.'],
    teacher: { ziel: 'Versteckte Schicht = mehrere Geraden; gelerntes „Band“.',
      impuls: 'Vergleicht mit dem Bauen-Rätsel „zwei Geraden“: Liegen die gelernten Geraden ähnlich?' }
  });

  add({
    id: 't-vogel3', area: 'trainieren', art: 'bird3', train: true,
    title: 'Vier Gruppen', short: '3 Geraden · vier Ausgänge',
    task: 'Jetzt alle vier Gruppen: Sperber-Männchen, Sperber-Weibchen, Rundschwanzsperber, Bussard. ' +
          'Vier feste Ausgänge — der stärkste gewinnt. Es zählen die <b>Testvögel</b>, die das Netz nie gesehen hat.',
    inputs: V_IN.slice(0, 2),
    outputs: VOGEL.map((v, i) => ({ key: 'g' + i, label: v.short })),
    rows: vogelRows([0, 1, 2, 3], [0, 1], g => [0, 1, 2, 3].map(k => (k === g ? 1 : 0))),
    groups: VOGEL, cls: true,
    start() { return emptyNet(this, [4], 'sigmoid'); },
    lr: 1, goal: { acc: 0.9 },
    plot: { type: '2d', ax: [0, 1] },
    hints: ['Die Gruppen liegen wie Perlen auf einer Kette: drei Geraden trennen vier Gruppen.',
            'Eine versteckte Schicht mit 3 Neuronen hilft dem Training.'],
    teacher: { ziel: 'Mehrere Klassen; Trainings- vs. Testdaten.',
      impuls: 'Warum prüfen wir mit Vögeln, die das Netz nicht kennt?' }
  });

  add({
    id: 't-vogel3d', area: 'trainieren', art: 'bird3d', train: true,
    title: 'Im Raum: Ebenen', short: '3 Eingänge · Ebenen',
    task: 'Mit der <b>Schwanzlänge</b> als drittem Eingang wird aus der Fläche ein Raum — und jedes Neuron ' +
          'der ersten Schicht zieht eine <b>Ebene</b> statt einer Geraden. Drehe den Würfel mit dem Finger.',
    inputs: V_IN,
    outputs: VOGEL.map((v, i) => ({ key: 'g' + i, label: v.short })),
    rows: vogelRows([0, 1, 2, 3], [0, 1, 2], g => [0, 1, 2, 3].map(k => (k === g ? 1 : 0))),
    groups: VOGEL, cls: true,
    start() { return emptyNet(this, [3, 4], 'sigmoid'); },
    lr: 1, goal: { acc: 0.9 },
    plot: { type: '3d', ax: [0, 1, 2] },
    hints: ['Jedes Neuron der ersten Schicht ist eine Ebene im Würfel. Tippe ein Neuron an, um seine Ebene hervorzuheben.'],
    teacher: { ziel: 'Verallgemeinerung: n Eingänge → Trennung durch (Hyper-)Ebenen.',
      impuls: 'Und bei 100 Eingängen? Vorstellen kann man es sich nicht mehr — rechnen schon.' }
  });

  add({
    id: 't-ziffer', area: 'trainieren', art: 'seg', train: true,
    title: 'Ziffern lernen', short: 'Gerade? Größer als 4?',
    task: 'Aus den sieben Segmenten soll das Netz zwei Fragen lernen: <b>Ist die Ziffer gerade?</b> und <b>Ist sie größer als 4?</b>',
    inputs: SEG_IN,
    outputs: [{ key: 'gerade', label: 'gerade' }, { key: 'gross', label: 'größer 4' }],
    rows: SEG.map((x, d) => ({ x, t: [d % 2 === 0 ? 1 : 0, d > 4 ? 1 : 0], name: 'Ziffer ' + d })),
    seg: true,
    start() { return emptyNet(this, [2], 'sigmoid'); },
    lr: 1, goal: { acc: 1 },
    hints: ['Beide Fragen gleichzeitig ohne versteckte Schicht? Probiere es aus — und dann mit 4–6 versteckten Neuronen.'],
    teacher: { ziel: 'Mehrere Ausgänge aus denselben Eingängen; versteckte Merkmale.',
      impuls: 'Welche Segmente sind für „gerade“ wichtig? Schaut euch die Gewichte an.' }
  });

  add({
    id: 't-zielscheibe', area: 'trainieren', art: 'target', train: true,
    title: 'Zielscheibe', short: 'Ringe aus Geraden',
    task: 'Wurfpfeile auf einer Zielscheibe: je näher an der Mitte, desto mehr Punkte. Kann das Netz die Ringe lernen — nur aus Geraden?',
    inputs: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
    outputs: [{ key: 'pkt', label: 'Punkte' }],
    rows: D.ZIELSCHEIBE.filter((r, i) => i % 5 === 0).map((r, i) => ({ x: [r[0], r[1]], t: [r[2]], test: i % 5 === 4 })),
    start() { return emptyNet(this, [12, 1], 'relu'); },
    defaultActs: ['relu', 'linear'],
    lr: 0.02, goal: { acc: 0.7 }, tol: 0.15,
    plot: { type: '2d', ax: [0, 1], value: true, cont: true },
    hints: ['Mit ReLU-Neuronen und einem linearen Ausgang klappt es am besten.',
            'Viele Geraden zusammen ergeben eine Art Vieleck um die Mitte.'],
    teacher: { ziel: 'Viele Geraden nähern eine runde Form an.', impuls: 'Wie viele Neuronen braucht es für einen „runden“ Ring?' }
  });

  const KURVE = Array.from({ length: 41 }, (_, i) => {
    const x = -1 + i / 20;
    return { x: [+x.toFixed(2)], t: [+(0.8 - 1.6 * x * x + 0.25 * Math.sin(5 * x)).toFixed(3)], test: i % 4 === 2 };
  });
  add({
    id: 't-kurve', area: 'trainieren', art: 'curve', train: true,
    title: 'Kurve nachbauen', short: 'Ein Eingang, eine Zahl',
    task: 'Das Netz bekommt eine Zahl x und soll die Höhe der Kurve treffen. Jedes ReLU-Neuron ist ein <b>Knick</b> — ' +
          'wie viele brauchst du für eine glatte Kurve?',
    inputs: [{ key: 'x', label: 'x' }],
    outputs: [{ key: 'y', label: 'Höhe' }],
    rows: KURVE,
    start() { return emptyNet(this, [6, 1], 'relu'); },
    defaultActs: ['relu', 'linear'],
    lr: 0.05, goal: { acc: 0.9 }, tol: 0.15,
    plot: { type: 'curve', ax: [0] },
    hints: ['Der Ausgang sollte „Linear“ sein, damit er auch negative Werte ausgeben kann.'],
    teacher: { ziel: 'Regression; ReLU-Knicke setzen eine Kurve stückweise zusammen.',
      impuls: 'Was passiert außerhalb des Bereichs, in dem es Daten gab?' }
  });

  /* Lernrate/Aktivierung für Trainings-Szenarien mit linearem Ausgang:
     beim Start den Ausgangs-Neuronen „linear“ geben. */
  Object.values(S).forEach(sc => {
    if (sc.defaultActs) {
      const base = sc.start;
      sc.start = function () {
        const n = base.call(this);
        n.layers.forEach((L, l) => L.forEach(nr => { nr.act = l === n.layers.length - 1 ? sc.defaultActs[1] : sc.defaultActs[0]; }));
        return n;
      };
    }
    sc.rules = sc.rules || {};
  });

  /* Alle Schlüssel, die die Lehrkraft freigeben kann. */
  const ALL_PARTS = [].concat(...AREAS.map(a => [a.id].concat(a.items)));

  window.NLSzenarien = { AREAS, S, VOGEL, ALL_PARTS, emptyNet };
})();
