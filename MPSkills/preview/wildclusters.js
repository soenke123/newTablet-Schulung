/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/wildclusters.js   ·   Schaufenster für Wild Clusters
   ══════════════════════════════════════════════════════════════
   Fünftes Drehbuch. Aufgebaut wie das von NeuroLab, weil der Skill
   ihm gleicht: eine gewachsene eigene Anwendung in einem <iframe>,
   und der Regisseur greift durch den Rahmen hindurch (siehe q() in
   lib/preview.js).

   ── ⚠️ Die eine Regel, die über allem steht ───────────────────
   WEDER KACHEL NOCH SCHAUFENSTER VERRATEN, WELCHE TIERE HIER
   LEBEN. Das ist keine Geschmacksfrage und kein Feinschliff: die
   Aufgabe der Stunde IST das Herausfinden. Wer auf der Landing
   eine Ente sieht, hat die Antwort auf die Frage, die er zwanzig
   Minuten später einer Klasse stellen soll — und die Landing steht
   offen, ein Kind kommt genauso dorthin.

   Daraus folgt dreierlei, und jedes davon ist eine Einschränkung
   gegenüber dem, was hier bequem wäre:

   (1) Das Standbild zeigt kein einziges Tier. Keine Sprites, keine
       Silhouetten mit Umriss, keine Namen, keine Artfarben — nur
       Spuren, Punkte und Nummern, also genau das, was die verdeckte
       Sicht auch der Klasse zeigt. Auch die ZAHL der Arten fehlt:
       sie ist die Anzahl der gesuchten Gruppen und damit die halbe
       Lösung.

   (2) Das Drehbuch fasst „3b Tiere aufdecken" NICHT an. Die
       Auflösung ist im Schaufenster genau einen Schritt weit
       vorführbar — „3a Welt auflösen" gibt die Landschaft frei, und
       eine Landschaft verrät niemanden. Der zweite Schritt setzt
       jedem Punkt sein Bild daneben; das gehört vor die Klasse und
       nicht in eine Auslage.

   (3) Der Beschreibungstext nennt keine Art. Er darf sagen, dass es
       Tiere sind — das steht auf der ersten Einführungskarte des
       Skills selbst („n Tiere tragen einen Sender, welche Art das
       ist, weiß niemand mehr"). Er darf nicht sagen, welche.

   ── Warum die Rolle 'presenter' ist ───────────────────────────
   Anders als bei NeuroLab steuert der Raum hier wirklich etwas: die
   Lehrkraft schaltet die Abschnitte der Stunde, und das ist der
   Teil, den jemand sehen will, der überlegt, ob er damit eine Stunde
   macht. Am Pult sind die vier Knöpfe da, und das Drehbuch drückt
   dieselben, die vorne auch ein Finger drückt.

   Nebenbei ist es die einzige Rolle, in der die Auslage nichts
   Falsches tut: `ctx.preview` hält in tool.js ohnehin die
   Einführung und das Speichern an, aber am Pult wird ohnehin nichts
   davon gebaut.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  /* Die view muss die Form haben, die auch aus skill_room_get käme.
     Zwei Felder trägt Wild Clusters wirklich aus:

     `room.code` und `me.seat` — daraus rechnet tool.js die drei Welten
     (seedsFor). Der Code steht hier fest und nicht zufällig: eine
     Auslage soll bei jedem Öffnen dieselbe Welt zeigen, sonst sieht
     zwei Besuchern dasselbe Werkzeug verschieden aus, und wer sich
     über eine Kleinigkeit wundert, sucht sie beim zweiten Mal
     vergeblich.

     `state.phase` und `state.data` — der Abschnitt der Stunde und die
     beiden Schleier. Beides ändert das Drehbuch über die echten
     Knöpfe des Pults, also über ctx.actions und nicht von Hand. */
  function view() {
    return {
      role: ROLE,
      room: { title: 'Wild Clusters', code: 'SCHAU', settings: {} },
      state: { phase: 1, data: {} },
      limits: {},
      me: { may_write: true, seat: 0 },
      entries: []
    };
  }

  /* ─── Das Drehbuch ──────────────────────────────────────────
     Der Rahmen baut eine Welt und rechnet zehn Tage Tierleben durch —
     auf einem langsamen Gerät sind das mehrere Sekunden. Gewartet wird
     deshalb auf die Signalliste und nicht auf eine Zahl Sekunden: sie
     entsteht erst mit `signals.setSimulation`, ist also der einzige
     ehrliche Beleg dafür, dass es etwas zu sehen gibt.

     Danach vier Bilder, und jedes beantwortet eine eigene Frage:

       1. Die Uhr läuft (`#playBtn`).       Was ist das überhaupt?
       2. „2 Nachzügler".                   Was passiert in der Stunde?
       3. „3a Welt auflösen".               Worauf läuft es hinaus?
       4. Zurück auf „1 Gruppieren".        Anfang für den nächsten Lauf.

     Bedient wird über die vier Knöpfe des Pults (`[data-step]`) und den
     Abspielknopf im Rahmen. An der Signalliste wird NICHTS gezogen: das
     Gruppieren ist eine Zeigergeste über mehrere Ereignisse, und der
     Regisseur kann klicken, aber nicht ziehen (siehe makeApi in
     lib/preview.js). Die Kachel zeigt diesen einen Vorgang dafür im
     Kleinen — das ist die Arbeitsteilung, nicht ein Mangel.

     ⚠️ „3b Tiere aufdecken" bleibt liegen. Warum, steht oben. */

  const BUILD = 40000;   // so lange darf der Aufbau dauern

  /* ⚠️ Der Abspielknopf ist ein SCHALTER und kein Startknopf: er trägt
     „▶", solange die Uhr steht, und „❚❚", während sie läuft (siehe
     js/ui/player.js). Ein Drehbuch, das ihn blind drückt, startet im
     ersten Durchgang und hält im zweiten an — und ab dann sieht die
     Auslage aus wie ein Standbild.

     Gelesen statt gemerkt: ein Phasenwechsel setzt die Zeit zurück,
     und ob dabei auch der Knopf umspringt, entscheidet die Anwendung
     und nicht dieses Drehbuch. */
  const running = api => (api.text('#playBtn') || '').indexOf('▶') < 0;
  const goOn = api => { if (!running(api)) api.click('#playBtn'); };

  async function play(api) {
    if (!await api.waitFor('#signalGrid .signal', BUILD)) return;

    // Einen Moment die Karte stehen lassen: dunkle Fläche, ein paar
    // Spuren, eine Liste voller Nummern. Ohne dieses Bild ist die
    // Bewegung gleich darauf nur Bewegung.
    if (!await api.wait(1500)) return;

    goOn(api);
    if (!await api.wait(5200)) return;

    api.click('[data-step="2"]');
    if (!await api.wait(900)) return;
    goOn(api);
    if (!await api.wait(4600)) return;

    api.click('[data-step="3a"]');
    if (!await api.wait(900)) return;
    goOn(api);
    if (!await api.wait(4900)) return;

    api.click('[data-step="1"]');
    await api.wait(1600);
  }

  /* ═══════════════════════════════════════════════════════════
     Das Standbild für die Kachel
     ═══════════════════════════════════════════════════════════
     Ein leichter Nachbau und nicht die Anwendung — dieselbe
     Entscheidung wie bei den vier anderen, hier aus einem besonders
     harten Grund: Wild Clusters rechnet für sein erstes Bild zehn
     Tage Tierleben durch. Eine Kachel, die das tut, hielte die Liste
     „Alle Skills" an, und zwar bevor irgendjemand sie angesehen hat.

     Nachgebaut sind die zwei Hälften, aus denen die Oberfläche
     besteht: links die verdeckte Karte (dunkle Fläche, sechs Spuren,
     an jeder ein Punkt und seine Nummer), rechts die Signalliste.
     Beides ohne ein einziges Tier — siehe die Regel im Kopf dieser
     Datei.

     Die Bewegung beim Darüberfahren zeigt den einen Vorgang, aus dem
     die Aufgabe besteht: drei Kacheln werden ein Cluster. Dabei
     passieren die drei Dinge, die im Werkzeug auch passieren, und
     alle drei zusammen sind erst die Regel:

       · Beim Zusammenfügen gewinnt die Farbe des ZIELS. Die drei
         Kacheln tragen danach eine Farbe, nicht drei.
       · Auf der Karte färben ihre Spuren mit. Die Farbe gehört der
         Nummer und nicht der Art — genau deshalb ist eine begonnene
         Gruppierung auf der Karte überhaupt zu finden.
       · Ein frisch gebautes Cluster kommt AUSGEWÄHLT an: Ring um den
         Kasten, kräftige Spuren, die anderen treten zurück.

     Dass ausgerechnet diese drei Spuren einander ähneln (drei weite
     Runden, während die anderen drei etwas anderes tun), ist die
     halbe Aussage des Skills — und verrät nichts: eine Runde ist
     keine Art.

     aria-hidden: für eine Vorlesestimme ist das ein Bild.
     ═══════════════════════════════════════════════════════════ */

  /* Aus tools/wildclusters/css/style.css und js/render/palette.js.
     Die einzige Kopie dieser Werte in dieser Datei — wer dort an den
     Farben dreht, zieht sie hier nach.

     Die Signalfarben sind KEINE frei gewählten Töne: es sind die
     Rückgaben von PALETTE.signals.build() an den Stellen 0, 1, 2, 4, 5
     und 8, und der Rand ist darken(farbe, 0.34) wie in signals.js. Die
     Nummer daneben ist die, die das Werkzeug für diesen Index
     hinschriebe (pad(index + 1, 2)). Ein Nachbau, der sich seine
     Farben ausdenkt, wäre beim nächsten Blick auf die Anwendung als
     Nachbau erkennbar.

     Das Papier der Anwendung und der dunkle Saum unter Linie und Zahl
     stehen nicht hier, sondern in style.css bei .tprev--wc — dort, wo
     auch die Bewegung steht. */
  const EDGE  = '#ded3c0',
        BARK  = '#3d3427',
        SOFT  = '#5c5040',
        INK   = '#16130c',
        /* Die verdeckte Sicht am frühen Morgen: mixHex(night, day, ~0.09)
           aus PALETTE.masked. Nicht die reine Nacht — auf einer hellen
           Seite wäre ein fast schwarzes Rechteck ein Loch in der Kachel,
           und die Aufzeichnung läuft ohnehin über ganze Tage. */
        SKY   = '#2b4065';

  /* Sechs Signale. `n` ist die Nummer, wie sie das Werkzeug schriebe,
     `c` die Signalfarbe, `e` ihr Rand.

     Die drei mit `m: true` sind die, die beim Darüberfahren zusammen-
     gezogen werden. Zielfarbe ist die von „05" — sie gewinnt, weil auf
     ihr abgelegt wird. */
  const SIG = [
    { n: '01', c: '#ee5c1e', e: '#9d3d14', m: true  },
    { n: '02', c: '#209e6b', e: '#156847', m: false },
    { n: '03', c: '#e533fc', e: '#9722a6', m: false },
    { n: '05', c: '#3f90d8', e: '#2a5f8f', m: true  },
    { n: '06', c: '#fc4370', e: '#a62c4a', m: false },
    { n: '09', c: '#c27c03', e: '#805202', m: true  }
  ];
  const GROUP = { c: '#3f90d8', e: '#2a5f8f' };

  /* Sechs Spuren über fünf Tage, von Hand gezeichnet. Drei weite
     Runden (die drei Mitglieder), dazu ein enges Knäuel, eine lange
     Wanderung quer über die Karte und eine kleine Kreisbahn. Was ein
     Tier daraus macht, steht nirgends — und soll auch nirgends
     stehen.

     `d` ist der Streckenzug, `p` der Punkt, an dem das Tier gerade
     steht (der Anfang des Zuges), `l` die Stelle für seine Nummer. */
  const TRAIL = {
    '01': { d: 'M56 28 C 82 30 92 46 88 64 C 84 84 64 92 46 86 C 28 80 22 60 30 44 C 36 33 46 27 56 28',
            p: [56, 28],  l: [56, 19] },
    '02': { d: 'M40 128 C 56 124 62 138 48 144 C 36 149 34 134 50 130 C 64 127 68 142 54 150 C 42 157 34 148 42 140',
            p: [40, 128], l: [40, 119] },
    '03': { d: 'M16 182 C 62 160 78 122 104 104 C 130 84 162 44 192 16',
            p: [16, 182], l: [22, 174] },
    '05': { d: 'M152 22 C 178 24 188 42 184 60 C 180 80 160 88 142 82 C 124 76 118 56 126 40 C 132 29 142 21 152 22',
            p: [152, 22], l: [152, 13] },
    '06': { d: 'M180 100 C 191 101 195 110 190 117 C 184 124 174 121 172 112 C 170 103 174 99 180 100',
            p: [180, 100], l: [180, 92] },
    '09': { d: 'M150 110 C 176 112 186 130 181 148 C 175 168 154 176 136 169 C 118 162 112 142 120 126 C 126 115 139 109 150 110',
            p: [150, 110], l: [150, 101] }
  };

  /* Eine Kachel der Signalliste: links die Nummer auf ihrer Farbe,
     rechts das Auge. Nebeneinander und nicht übereinander — dieselbe
     Aufteilung wie in css/style.css, aus demselben Grund (vier Spalten
     geben nicht genug Höhe für zwei Reihen her).

     `col` überschreibt die Farbe: in einem Cluster tragen die
     Mitglieder die Farbe der Gruppe und nicht mehr ihre eigene. */
  const TILE_W = 48, TILE_H = 26;

  function tile(x, y, sig, col) {
    const c = (col && col.c) || sig.c;
    const e = (col && col.e) || sig.e;
    const xs = x + 38;            // die Trennlinie vor dem Auge
    return `
      <rect x="${x}" y="${y}" width="${TILE_W}" height="${TILE_H}" rx="7"
            fill="#fff" stroke="${e}" stroke-width="1"/>
      <path d="M${x + 1} ${y + 1} H${xs} V${y + TILE_H - 1} H${x + 7}
               a6 6 0 0 1 -6 -6 V${y + 7} a6 6 0 0 1 6 -6 Z" fill="${c}"/>
      <text x="${x + 19}" y="${y + 18}" text-anchor="middle"
            font-size="13" font-weight="700" fill="${INK}">${sig.n}</text>
      <line x1="${xs}" y1="${y + 1}" x2="${xs}" y2="${y + TILE_H - 1}"
            stroke="${e}" stroke-width="1" opacity=".55"/>
      <ellipse cx="${x + 43}" cy="${y + 13}" rx="3.4" ry="2.3"
               fill="none" stroke="${SOFT}" stroke-width=".9"/>
      <circle cx="${x + 43}" cy="${y + 13}" r="1.1" fill="${SOFT}"/>`;
  }

  const byNum = n => SIG.find(s => s.n === n);

  /* ⚠️ Inline stehen die WERTE, aus denen das Stylesheet wählt — nie die
     Farbe selbst. Eine Inline-Angabe schlägt jede Regel, auch die im
     :hover; wer hier `--c` schriebe und im Stylesheet umsetzen wollte,
     bekäme ein Standbild, das sich nicht bewegt. Dieselbe Bauart wie
     --x0/--x1 beim Wolken-Standbild.

     `--c0` ist die eigene Signalfarbe, `--c1` die, die nach dem
     Zusammenfügen gilt. Wer nicht mitgezogen wird, hat zweimal
     dieselbe — dann steht seine Spur still, während die anderen
     umfärben. */
  const cvars = s => `--c0:${s.c};--c1:${s.m ? GROUP.c : s.c}`;

  function tileHTML() {
    const trails = SIG.map(s => {
      const t = TRAIL[s.n];
      return `<path class="wcp-tr ${s.m ? 'wcp-m' : 'wcp-o'}" d="${t.d}"
                    style="${cvars(s)}"/>`;
    }).join('');

    /* Punkt und Nummer. Verdeckt sind alle Tiere gleich groß und gleich
       geformt — deshalb ein Kreis für jedes und kein Umriss. Der dunkle
       Saum darunter ist derselbe wie im Werkzeug: eine Farbe, die einer
       Nummer gehört, kennt ihren Untergrund nicht. */
    const dots = SIG.map(s => {
      const t = TRAIL[s.n];
      return `<g class="wcp-dot ${s.m ? 'wcp-m' : 'wcp-o'}" style="${cvars(s)}">
        <circle cx="${t.p[0]}" cy="${t.p[1]}" r="3.4"/>
        <text x="${t.l[0]}" y="${t.l[1]}" text-anchor="middle"
              font-size="8.5" font-weight="700">${s.n}</text>
      </g>`;
    }).join('');

    // Ruhezustand: sechs einzelne Kacheln, zwei Spalten (siehe
    // .loose in css/style.css). COL/ROW halten Kacheln, Clusterkasten
    // und Ring auf demselben Raster — sonst steht beim Umschalten
    // etwas einen Pixel daneben, und genau das sieht man.
    const COL = [222, 276];
    const at = i => COL[i % 2];

    const loose = SIG.map((s, i) =>
      tile(at(i), 16 + Math.floor(i / 2) * 32, s)).join('');

    // Beim Darüberfahren: drei davon liegen in einem Cluster, die
    // anderen drei stehen darunter weiter frei.
    const inGroup = [byNum('01'), byNum('05'), byNum('09')].map((s, i) =>
      tile(at(i), 38 + Math.floor(i / 2) * 32, s, GROUP)).join('');
    const rest = [byNum('02'), byNum('03'), byNum('06')].map((s, i) =>
      tile(at(i), 114 + Math.floor(i / 2) * 32, s)).join('');

    return `<div class="tprev tprev--wc" aria-hidden="true">
      <svg class="wcp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">

        <!-- Links die verdeckte Karte. Keine Landschaft, kein Sprite,
             kein Bau — nur Bewegung, ein Punkt und eine Nummer. Genau
             das, was die Klasse in Phase 1 und 2 sieht.

             ⚠️ Sie steht ABSICHTLICH über den Rand des viewBox hinaus.
             Eine Kachel ist je nach Spaltenbreite verschieden breit,
             der viewBox hat aber ein festes Verhältnis — bei „meet"
             bleibt oben und unten (oder links) ein Streifen Papier
             stehen, und dort läge dann eine Kante mitten im Bild. Was
             außerhalb des viewBox liegt, wird trotzdem gezeichnet;
             abgeschnitten wird erst am Rand der Kachel, und genau da
             soll die Fläche auch aufhören. -->
        <rect x="-140" y="-130" width="348" height="450" fill="${SKY}"/>
        <g class="wcp-halo">${trails}</g>
        <g class="wcp-line">${trails}</g>
        ${dots}

        <!-- Die Trennung zur Signalliste. Im Werkzeug ist es ein
             border-left an der Spalte — und wie die Fläche geht sie
             durch bis über den Rand. -->
        <line x1="208" y1="-130" x2="208" y2="320" stroke="${EDGE}" stroke-width="1"/>

        <g class="wcp-loose">${loose}</g>

        <g class="wcp-group">
          <!-- Der Ring: ein frisch gebautes Cluster kommt ausgewählt an,
               und ausgewählt heißt auf der Karte kräftige Spur. Ohne ihn
               wechselten drei Kacheln still die Farbe. -->
          <rect x="212" y="6" width="122" height="100" rx="15"
                fill="none" stroke="${BARK}" stroke-width="2"/>
          <rect x="216" y="10" width="114" height="92" rx="11"
                fill="#fff" stroke="${GROUP.c}" stroke-width="2"/>
          <path d="M217 33 V21 a10 10 0 0 1 10 -10 H319 a10 10 0 0 1 10 10 V33 Z"
                fill="${GROUP.c}"/>
          <text x="225" y="27" font-size="10" font-weight="700"
                letter-spacing=".4" fill="${INK}">3 Signale</text>
          <line x1="309" y1="11" x2="309" y2="33"
                stroke="rgba(12,10,6,.18)" stroke-width="1"/>
          <ellipse cx="319" cy="22" rx="3.4" ry="2.3"
                   fill="none" stroke="rgba(12,10,6,.7)" stroke-width=".9"/>
          <circle cx="319" cy="22" r="1.1" fill="rgba(12,10,6,.7)"/>
          ${inGroup}
          ${rest}
        </g>
      </svg>
    </div>`;
  }

  window.MPPreview.register('wildclusters', {
    role: ROLE,
    view, play, tile: tileHTML,

    /* Breitere Bühne, wie bei NeuroLab und aus demselben Grund: das
       hier ist keine Tafel, sondern eine ganze Anwendung — Kopfzeile
       mit drei Welten, Karte, Zeitleiste, Signalspalte, und darüber
       noch das Pult der Lehrkraft. Im Regelmaß (820 px) rutscht die
       Signalspalte unter die Karte, und dann fehlt genau die Hälfte,
       um die es geht. */
    wide: true,

    /* Keine Blende zwischen zwei Durchgängen. Sie ist dafür gedacht,
       dass beim Zurücksetzen mehrere Karten auf einmal verschwinden —
       hier stellt das Drehbuch selbst zurück, mit demselben Knopf, den
       die Lehrkraft am Ende der Stunde drückt. Ein Abblenden mittendrin
       sähe nach Aussetzer aus. */
    fade: false,

    /* ⚠️ Kein Wort darüber, welche Tiere hier leben, und auch nicht,
       wie viele Arten es sind — die Zahl der Arten ist die Zahl der
       gesuchten Gruppen. Begründung im Kopf dieser Datei. */
    blurb: `
      <p>Ein unbekanntes Ökosystem von oben. Rund vierzig Tiere tragen einen Sender,
         <strong>welche Art das ist, weiß niemand mehr</strong> — sichtbar ist nur ihre
         Bewegung über fünf Tage. Die Klasse entscheidet, wer zusammengehört: Signale
         per Ziehen zu Gruppen zusammenfassen. Unüberwachtes Lernen, bevor das Wort
         fällt.</p>
      <p>Nach Tag 5 kommen <strong>Nachzügler</strong> dazu, und die spannende Frage ist,
         in welche Gruppe sie gehören — <em>wenn es eine gibt</em>. Am Ende deckt die
         Lehrkraft Schritt für Schritt auf: erst die Landschaft, dann die Tiere. Oben
         läuft der erste Schritt; den zweiten hebt sich die Auslage auf, sonst stünde
         die Lösung auf der Startseite.</p>
      <p>Jede Person bekommt <strong>drei eigene Welten</strong>, gerechnet aus Raumcode
         und Sitzplatz — abschreiben geht nicht. Am Beamer zeigt „Stand der Klasse“ jede
         Person mit ihren drei Welten, und ein Tipp legt die auf, die sie gerade ansieht.</p>`
  });
})();
