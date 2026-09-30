/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — flaeche.js   ·   Das Netz zum Anfassen
   ══════════════════════════════════════════════════════════════
   Die SVG-Fläche: Geräte liegen da, Kabel verbinden sie, Pakete
   laufen sichtbar darüber.

   ── Drei Unterschiede zu Filius, alle bewusst ─────────────────

   1. Entwurf und Aktion sind getrennt wie in Filius — aber die
      Trennung kostet hier nichts. In Filius kann man im laufenden
      Netz keine IP ändern; man sieht den Fehler, während es
      läuft, und muss erst zurückschalten. Hier ändert man ihn im
      Aktionsmodus auf dem Gerät selbst (Einstellungen in der
      Geräteoberfläche, geraet.js) — die Simulation läuft weiter.
      Getrennt ist also, was gebaut wird, nicht was eingestellt
      wird.

   2. Verkabeln heißt ZIEHEN, von Gerät zu Gerät. Filius verlangt
      Werkzeug wählen, Quelle klicken, Ziel klicken, Anschlüsse im
      Dialog auswählen. Wir suchen den freien Anschluss selbst; wer
      ihn bestimmen will, kann das im Inspektor.

   3. Pakete sind SICHTBAR, einzeln, mit Farbe je Protokoll.
      Filius lässt Kabel blinken — man sieht DASS, nicht WAS.

   ── Die Animation hängt an der Simulationszeit, und zwar exakt ─
   Hier stand einmal eine MINDESTDAUER von 250 ms je Punkt, damit
   ein 10-ms-Kabel überhaupt sichtbar ist. Das war der Fehler: das
   Paket war nach 10 ms längst am Switch und auf dem nächsten
   Kabel, während der erste Punkt noch 240 ms zu fliegen hatte.
   Auf dem Bildschirm leuchteten dann ALLE Kabel gleichzeitig —
   und damit war genau das weg, wofür man zusieht: die Reihenfolge.

   Jetzt gilt: Flugzeit auf dem Bildschirm = Laufzeit des Kabels
   geteilt durch das Tempo. Kein Mindestwert, keine Ausnahme. Ein
   Paket ist zu jedem Zeitpunkt auf genau einem Kabel, weil es in
   der Simulation auch auf genau einem ist. Sichtbar wird das
   nicht über eine gedehnte Animation, sondern über zwei ehrliche
   Zahlen: ein Kabel dauert 100 ms (netz.js), und das Tempo steht
   voreingestellt auf langsam (app.js).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const NS = 'http://www.w3.org/2000/svg';

  /* Die Kachel ist höher als früher (60), weil jetzt der Kurzname
     MIT hineingehört: er steht über dem Symbol, nicht darunter.
     Darunter steht nur noch die IP-Adresse — und die groß. */
  const W = 78, H = 68;                 // Kachelmaß eines Geräts

  /* ─── Das Feld ──────────────────────────────────────────────
     Die Fläche war einmal genau so groß wie das Fenster: ein SVG
     mit viewBox 1200 × 760 und `preserveAspectRatio`, das sich
     einpasste. Das hatte zwei Folgen, und beide waren falsch.

     Erstens ließ sich ein Gerät nur auf dem Ausschnitt ablegen,
     der gerade zu sehen war — wer ein Netz aus zwölf Geräten
     baute, hatte keinen Platz mehr und schob alles enger
     zusammen, bis die Adressen übereinanderlagen.

     Zweitens wurde das Bild bei jedem Gerät kleiner, das man
     dazustellte, weil es ja immer ganz hineinpassen musste. Auf
     dem Beamer war ab acht Geräten nichts mehr zu lesen — und
     genau da fängt der interessante Unterricht an.

     Jetzt ist das Feld FEST und größer als jeder Bildschirm, und
     man sieht einen Ausschnitt davon: `view` sagt, welchen. Die
     Zahlen sind so gewählt, dass die alte Fläche (1200 × 760)
     bequem in die linke obere Ecke passt — alle Szenarien und
     alle gespeicherten Stände liegen weiter dort, wo sie lagen. */
  const WELT_W = 2400, WELT_H = 1560;
  /* Wie nah man herangehen darf. Über 2,5 wird die Schrift
     unscharf (sie ist als Pfad gezeichnet, nicht als Text), unter
     der Grenze, an der das ganze Feld ins Bild passt, gibt es
     nichts mehr zu sehen — die untere Schranke rechnet sich
     deshalb aus dem Fenster und steht nicht hier. */
  const ZOOM_MAX = 2.5;
  /* Der Ausschnitt, mit dem angefangen wird: genau die alte
     Fläche. Wer ein Szenario lädt, sieht damit dasselbe Bild wie
     vorher, und niemand muss erst suchen. */
  const START = { x: 0, y: 0, w: 1200, h: 760 };
  const RASTER = 28;                    // Maschenweite, in Feldeinheiten

  /* ─── Platz für die Subnetzringe ────────────────────────────
     Die Ringe liegen AUSSEN um die Kachel, die Adresse steht
     darunter. Beide brauchen denselben Streifen, also muss einer
     weichen: die Adresse rückt ab, und zwar IMMER — auch bei einem
     Gerät, das in keinem Netz liegt und nie einen Ring bekommt.

     Der Grund ist wichtiger, als er aussieht: rückte sie nur dann
     ab, wenn ein Ring da ist, spränge bei jedem Anklicken eines
     Geräts die halbe Fläche. Ein Bild, das sich beim Hinsehen
     bewegt, ist auf dem Beamer unbrauchbar. Lieber neun Pixel
     Luft, die manchmal leer sind. */
  const RING_1 = 4;                     // erster Ring, Abstand zur Kachel
  const RING_D = 4.5;                   // Abstand von Ring zu Ring
  const RING_MAX = 4;                   // mehr passt nicht unter die Adresse
  const IP_Y = H / 2 + 30;              // Grundlinie der Adresse
  const MAX_DOTS = 80;                  // Notbremse bei Turbo-Tempo

  /* ─── Tippen oder Ziehen? ───────────────────────────────────
     Bis hierher waren beide dasselbe: der Zeigerdruck wählte das
     Gerät aus UND schlug sein Fenster auf, das Ziehen fing
     gleichzeitig an. Wer ein Gerät nur verschieben wollte, bekam
     das Fenster trotzdem — und es lag prompt im Weg.

     Also erst am Ende entscheiden. Bis der Finger diese Strecke
     zurückgelegt hat, ist noch gar nichts passiert; darüber ist
     es ein Zug und das Fenster bleibt zu.

     Zwei Werte, weil eine Fingerkuppe etwas anderes ist als ein
     Mauszeiger: eine Hand, die auf ein Tablet tippt, wandert dabei
     immer ein paar Pixel. Gemessen wird in BILDSCHIRMpunkten und
     nicht in SVG-Einheiten — die Schwelle soll sich nicht ändern,
     nur weil das Fenster kleiner ist. */
  const ZUG_MAUS = 4, ZUG_FINGER = 10;
  /* Bei Turbo dauert ein Kabel unter einer Bildwiederholung. Dann
     ist der Punkt nicht „zu kurz", sondern gar nicht da — ein
     Bild lang zeigen wir ihn trotzdem, sonst sieht Turbo aus wie
     ein stehendes Netz. Das dehnt nichts, es rundet nur auf das
     Raster des Bildschirms auf. */
  const ONE_FRAME = 16;

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function Flaeche(host, engine, netz, opts) {
    opts = opts || {};

    /* `preserveAspectRatio: none` ist hier richtig und war es
       vorher nicht: der Ausschnitt wird selbst so gerechnet, dass
       er dasselbe Seitenverhältnis hat wie das Fenster (siehe
       `klemmen`). Ließe man das SVG einpassen, käme oben und unten
       ein Rand dazu, und ein Gerät läge nicht mehr dort, wo der
       Finger es abgelegt hat. */
    const svg = el('svg', { class: 'nf', viewBox: '0 0 1200 760',
                            preserveAspectRatio: 'none' }, host);

    /* ─── Das Reißbrett ─────────────────────────────────────────
       Das Raster lag bisher als CSS-Muster auf der Bühne. Mit
       einem Ausschnitt, den man verschieben kann, geht das nicht
       mehr: das Muster bliebe stehen, während die Geräte darüber
       wandern — es sähe aus, als schwebe das Netz über dem Tisch.

       Jetzt gehört es ZUM FELD: es wandert und zoomt mit, und
       seine Maschen sind eine Länge auf dem Feld (28 Einheiten)
       und nicht auf dem Bildschirm. Damit beantwortet es beiläufig
       auch „wie weit bin ich herangezoomt".

       Der Rahmen darum ist das Zweite, was es vorher nicht gab:
       Ende des Feldes. Ohne ihn zieht man ein Gerät an eine
       unsichtbare Wand und weiß nicht, warum es nicht weitergeht. */
    const defs = el('defs', null, svg);
    const pat = el('pattern', { id: 'nf-raster', width: RASTER, height: RASTER,
                                patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { class: 'nf-raster-l', d: 'M ' + RASTER + ' 0 L 0 0 L 0 ' + RASTER }, pat);

    const gWelt = el('g', { class: 'nf-welt' }, svg);
    el('rect', { class: 'nf-raster', x: 0, y: 0, width: WELT_W, height: WELT_H,
                 fill: 'url(#nf-raster)' }, gWelt);
    el('rect', { class: 'nf-rand', x: 0, y: 0, width: WELT_W, height: WELT_H }, gWelt);

    const gCables = el('g', { class: 'nf-cables' }, svg);
    const gGhost  = el('g', { class: 'nf-ghost' }, svg);
    const gNodes  = el('g', { class: 'nf-nodes' }, svg);
    /* Die WAN/LAN-Schildchen liegen ÜBER den Geräten und nicht
       beim Kabel, zu dem sie gehören. Der Grund ist zeichnerisch:
       sie sitzen auf der Kachelkante (siehe anschlussSchild), und
       die Kachel ist gefüllt — im Kabelband gezeichnet wäre jedes
       Schild zur Hälfte verdeckt. */
    const gPorts  = el('g', { class: 'nf-portlabels' }, svg);
    const gDots   = el('g', { class: 'nf-dots' }, svg);
    /* Das aufgezogene Rechteck liegt über ALLEM — es ist kein Teil
       des Netzes, sondern die Spur einer Hand. Läge es unter den
       Geräten, sähe man an der interessanten Stelle (dort, wo es
       gerade ein Gerät erfasst) am wenigsten davon. */
    const gRahmen = el('g', { class: 'nf-rahmen' }, svg);

    /* ─── Der Ausschnitt ────────────────────────────────────────
       x/y = linke obere Ecke auf dem Feld, w/h = wie viel davon
       zu sehen ist. Alles andere (Zoomstufe, Grenzen) rechnet
       sich daraus. */
    const view = { x: START.x, y: START.y, w: START.w, h: START.h };

    /* Hat jemand den Ausschnitt selbst gewählt — gezoomt, das Feld
       verschoben, einen der Knöpfe gedrückt? Solange nicht, darf
       die Anwendung ihn frei neu einpassen, wenn sich das Fenster
       ändert. Danach nicht mehr: eine Hand, die etwas eingestellt
       hat, will es so wiederfinden. Dieselbe Regel gilt beim
       Gerätefenster (`selbstVerschoben` in geraet.js). */
    let selbstGewaehlt = false;

    const fenster = () => {
      const r = svg.getBoundingClientRect();
      return { w: Math.max(1, r.width), h: Math.max(1, r.height), left: r.left, top: r.top };
    };

    /* Ausschnitt in die erlaubten Grenzen zwingen. Zwei Regeln:

       1. Die Höhe folgt der Breite über das Seitenverhältnis des
          Fensters. Sonst würde das Feld verzerrt — ein Kabel im
          45°-Winkel sähe je nach Fenstergröße anders aus.

       2. Man kann nicht aus dem Feld hinausfahren. Passt das Feld
          in einer Richtung ganz ins Bild, wird es dort MITTIG
          gestellt statt an den Rand geklemmt; sonst klebte ein
          kleines Netz beim Herauszoomen plötzlich links oben. */
    function klemmen() {
      const f = fenster();
      const maxW = Math.max(WELT_W, WELT_H * f.w / f.h);
      view.w = U.clamp(view.w, f.w / ZOOM_MAX, maxW);
      view.h = view.w * f.h / f.w;
      view.x = view.w >= WELT_W ? (WELT_W - view.w) / 2 : U.clamp(view.x, 0, WELT_W - view.w);
      view.y = view.h >= WELT_H ? (WELT_H - view.h) / 2 : U.clamp(view.y, 0, WELT_H - view.h);
    }

    /* Ausschnitt anwenden. ⚠️ Danach steht ALLES, was in
       Bildschirmpunkten gerechnet wurde, an der falschen Stelle:
       das Gerätefenster, das Einstellkärtchen, die Subnetzliste.
       Deshalb der Rückruf — er ist nicht Beiwerk, ohne ihn liegt
       nach dem ersten Verschieben jedes Fenster daneben. */
    function anwenden() {
      klemmen();
      svg.setAttribute('viewBox',
        view.x.toFixed(2) + ' ' + view.y.toFixed(2) + ' '
        + view.w.toFixed(2) + ' ' + view.h.toFixed(2));
      if (opts.onView) opts.onView(zoomFaktor());
    }

    // 1,0 heißt: eine Feldeinheit ist ein Bildschirmpunkt.
    const zoomFaktor = () => fenster().w / view.w;

    /* Heran- oder herausgehen, und zwar so, dass der Punkt unter
       dem Zeiger stehen bleibt. Ohne diesen Anker zoomt man immer
       auf die Bildmitte und muss danach suchen, wo das Gerät
       hingerutscht ist, das man sich ansehen wollte. */
    function zoomAn(f, clientX, clientY) {
      const r = svg.getBoundingClientRect();
      const px = clientX == null ? r.left + r.width / 2 : clientX;
      const py = clientY == null ? r.top + r.height / 2 : clientY;
      const u = (px - r.left) / Math.max(1, r.width);
      const v = (py - r.top) / Math.max(1, r.height);
      const wx = view.x + u * view.w, wy = view.y + v * view.h;
      view.w = view.w / f;
      klemmen();
      view.x = wx - u * view.w;
      view.y = wy - v * view.h;
      selbstGewaehlt = true;
      anwenden();
    }

    /* Ein Rechteck vom Feld ganz ins Bild holen. Das ist genau
       das, was `preserveAspectRatio="… meet"` früher von selbst
       tat: die größere der beiden nötigen Breiten gewinnt, sonst
       ragt das Rechteck in der anderen Richtung aus dem Bild. */
    function einpassenRechteck(r) {
      const f = fenster();
      view.w = Math.max(r.w, r.h * f.w / f.h);
      klemmen();
      view.x = r.x + r.w / 2 - view.w / 2;
      view.y = r.y + r.h / 2 - view.h / 2;
      anwenden();
    }

    /* Alles einpassen: alle Geräte ins Bild, mit Luft drumherum.
       Ohne Geräte der Startausschnitt — ein leeres Feld ganz
       herausgezoomt zu zeigen wäre die unbrauchbarste aller
       Antworten. */
    function einpassen() {
      const ns = netz.list();
      if (!ns.length) { einpassenRechteck(START); return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of ns) {
        x0 = Math.min(x0, n.x - W); x1 = Math.max(x1, n.x + W);
        y0 = Math.min(y0, n.y - H); y1 = Math.max(y1, n.y + H);
      }
      const luft = 70;
      selbstGewaehlt = true;
      einpassenRechteck({ x: x0 - luft, y: y0 - luft,
                          w: (x1 - x0) + 2 * luft, h: (y1 - y0) + 2 * luft });
    }

    /* ─── Das Fenster ändert seine Größe ──────────────────────
       Leiste eingeklappt, Tablet gedreht, Mitschnitt aufgeschlagen,
       Subnetzliste auf. Das passiert oft, und was dann richtig
       ist, hängt an einer einzigen Frage:

       ⚠️ HAT DER BENUTZER DEN AUSSCHNITT SELBST GEWÄHLT?

       Wenn nicht — und das ist der Normalfall, die meisten
       schieben nie am Feld —, dann wird der Startausschnitt neu
       eingepasst. Das ist dieselbe Zusage, die früher
       `preserveAspectRatio="… meet"` gegeben hat: die Fläche, auf
       der alle Szenarien ihre Geräte ablegen (1200 × 760), ist
       immer ganz zu sehen. Und es ist vor allem BERECHENBAR: ganz
       gleich wie oft das Fenster seine Größe ändert, es kommt
       derselbe Ausschnitt heraus.

       Genau daran ist der erste Versuch gescheitert. Er behielt
       die Breite des Ausschnitts und rechnete nur die Höhe neu —
       das schaukelte sich über mehrere Größenänderungen auf, und
       auf einem Tablet hochkant standen die Geräte am Ende bei
       41 % und waren nicht mehr zu lesen. Nichts war falsch
       gerechnet; es war nur jedes Mal ein bisschen mehr vom
       leeren Feld zu sehen.

       Hat er den Ausschnitt dagegen selbst gewählt, wird er
       geachtet: gleiche Mitte, gleiche Breite. Was dabei aus dem
       Bild fällt, holt man durch Verschieben zurück — dafür ist
       das Verschieben da. */
    function nachRahmen() {
      if (!selbstGewaehlt) { einpassenRechteck(START); return; }
      const f = fenster();
      const mx = view.x + view.w / 2, my = view.y + view.h / 2;
      if (view.w * f.h / f.w < view.h) view.w = view.h * f.w / f.h;
      klemmen();
      view.x = mx - view.w / 2;
      view.y = my - view.h / 2;
      anwenden();
    }
    if (window.ResizeObserver) new ResizeObserver(() => nachRahmen()).observe(host);
    else window.addEventListener('resize', () => nachRahmen());

    /* ─── Was ist ausgewählt? ───────────────────────────────────
       Bis hierher war das EIN Gerät, und `selected` war seine
       Kennung. Der Wunsch war ausdrücklich der aus jedem
       Büroprogramm: „Mehrere markieren durch Rechteck aufspannen.
       Und durch Strg gedrückt halten. Markierte Objekte
       verschieben."

       Also eine Menge. `letzte` ist das Gerät, das zuletzt
       dazukam — es entscheidet, welches Fenster die Oberfläche
       aufschlägt, und bleibt damit die Antwort auf „welches habe
       ich gerade angefasst". Ohne diese zweite Angabe wäre bei
       einer Auswahl aus fünf Geräten nicht mehr zu sagen, welches
       gemeint ist.

       ⚠️ `selected` bleibt als EIN Wert nach draußen sichtbar
       (subnetze.js fragt danach, panels.js auch). Neu dazu kommt
       `auswahlIds`. Beides zu haben ist kein Doppelbefund: das eine
       heißt „worum geht es gerade", das andere „was hängt mit
       dran".

       ⚠️ Die Menge heißt `markiert` und nicht `auswahl`: unter
       diesem Namen läuft beim Zeichnen schon die Menge der
       SICHTBAREN SUBNETZE herum (siehe `sichtbar`). Zwei Dinge mit
       einem Namen wären hier besonders teuer, weil beide Mengen von
       Kennungen sind und ein Verwechseln keinen Fehler erzeugt,
       sondern ein falsches Bild. */
    const markiert = new Set();
    let letzte = null;
    let tool = 'zeiger';                // 'zeiger' | 'kabel'
    let modus = 'entwurf';              // 'entwurf' | 'aktion'
    let drag = null;                    // laufendes Ziehen
    let dots = [];                      // fliegende Pakete
    const busy = new Map();             // Kabel-ID → wie viele Pakete gerade darauf
    /* Das Kabel, das gerade im Gerätefenster angefasst wird — wer
       bei „Netzwerkkarte 2" steht, soll draußen sehen, welches
       Kabel das ist. Nur EINS auf einmal: zwei hervorgehobene
       Kabel wären zwei Antworten auf eine Frage. */
    let betont = null;                  // Kabel-ID oder null

    /* Das ANGEKLICKTE Kabel — nicht zu verwechseln mit `betont`.
       `betont` ist ein Hinweis aus dem Gerätefenster („dieses Kabel
       hängt an Netzwerkkarte 2") und geht von selbst wieder aus;
       `selKabel` ist eine Auswahl wie `markiert`, und daran hängt
       die Entf-Taste.

       ⚠️ Kabel und Geräte teilen sich EINE Auswahl in dem Sinn,
       dass immer nur eines von beidem markiert sein kann. Sonst
       müsste Entf entscheiden, was gemeint ist — und jede
       Entscheidung, die eine Taste im Verborgenen trifft, ist beim
       Löschen die falsche. */
    let selKabel = null;                // Kabel-ID oder null

    /* ─── Subnetze in Farbe ───────────────────────────────────
       Zwei Anlässe, und sie schließen sich nicht aus:

         zeigeAlle   der Knopf „Subnetze" in der Kopfzeile. Alle
                     Netze auf einmal, als Übersicht.
         Auswahl     ein angetipptes Gerät zeigt SEINE Netze. Ein
                     Router liegt in mehreren — dann sind es
                     mehrere Ringe in mehreren Farben, und genau
                     das ist die Aussage, die er verkörpert.

       Ohne beides bleibt die Fläche grau. Farbe ist hier eine
       Antwort auf eine Frage, kein Dauerzustand: ein Netzplan, in
       dem immer alles bunt ist, sagt nichts mehr. */
    let zeigeAlle = false;
    let sn = null;                      // letzte Rechnung (subnetze.js)

    /* ─── Bildschirm ↔ SVG ────────────────────────────────────
       Ohne diese Umrechnung liegt ein gezogenes Gerät auf einem
       skalierten SVG immer daneben — und zwar umso mehr, je
       weiter man vom Mittelpunkt weg ist. */
    function toSvg(ev) {
      const p = svg.createSVGPoint();
      p.x = ev.clientX; p.y = ev.clientY;
      const m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const q = p.matrixTransform(m.inverse());
      return { x: q.x, y: q.y };
    }

    /* ─── Gerätebilder ────────────────────────────────────────
       Selbst gezeichnet statt als PNG: sie müssen in Hell und
       Dunkel funktionieren, in jeder Größe scharf sein und die
       Akzentfarbe annehmen können. */
    function icon(kind, g) {
      const c = 'nf-ic';
      /* Das Handy: hochkant, mit Knopfleiste unten. Es muss sich
         auf den ersten Blick von der liegenden Form der beiden
         anderen unterscheiden — aus der letzten Reihe zählt der
         Umriss, nicht das Detail. Deshalb schmal und hoch und
         nicht „Bildschirm mit Rundung". */
      if (kind === 'handy') {
        el('rect', { class: c, x: -10, y: -16, width: 20, height: 32, rx: 4 }, g);
        el('rect', { class: c + ' nf-ic--fill', x: -7, y: -12.5, width: 14, height: 22, rx: 1.5 }, g);
        el('path', { class: c, d: 'M -3.5 12.5 L 3.5 12.5' }, g);
        return;
      }
      if (kind === 'host' || kind === 'server') {
        el('rect', { class: c, x: -17, y: -16, width: 34, height: 23, rx: 3 }, g);
        el('rect', { class: c + ' nf-ic--fill', x: -13, y: -12, width: 26, height: 15, rx: 1.5 }, g);
        el('path', { class: c, d: 'M -6 7 L -6 11 M 6 7 L 6 11 M -12 11 L 12 11' }, g);
        if (kind === 'server') {
          // Der Server trägt drei Leuchten — genug Unterschied,
          // damit man ihn auf dem Beamer erkennt.
          for (let i = 0; i < 3; i++)
            el('circle', { class: c + ' nf-ic--dot', cx: -8 + i * 8, cy: -4.5, r: 1.6 }, g);
        }
        return;
      }
      if (kind === 'switch') {
        el('rect', { class: c, x: -19, y: -8, width: 38, height: 17, rx: 3 }, g);
        for (let i = 0; i < 4; i++)
          el('rect', { class: c + ' nf-ic--fill', x: -14 + i * 7.5, y: -3.5, width: 4.5, height: 5, rx: 1 }, g);
        return;
      }
      if (kind === 'router') {
        el('circle', { class: c, cx: 0, cy: 0, r: 15 }, g);
        el('path', { class: c + ' nf-ic--arrow',
          d: 'M -8 -4 L 8 -4 M 4 -8 L 8 -4 L 4 0 M 8 4 L -8 4 M -4 0 L -8 4 L -4 8' }, g);
        return;
      }
      /* Der Heimrouter muss sich aus der letzten Reihe von beiden
         unterscheiden, zwischen denen er steht: vom Router (Kreis
         mit Pfeilen) und vom Switch (liegender Kasten mit Lämpchen
         oben). Also ein liegender Kasten mit Buchsen UNTEN und
         einer Antenne — die drei Umrisse sind auf dem Beamer noch
         bei 40 % Zoom auseinanderzuhalten.

         Die Antenne steht da, auch wenn das WLAN aus ist: sie
         gehört zum Gerät, nicht zu seiner Einstellung. Ob es funkt,
         sagt die Marke unter der Kachel. */
      /* Das cww: eine Wolke mit den drei Buchstaben darin. Rund
         UND breit — so ist keines der anderen Geräte. */
      if (kind === 'cww') {
        el('path', { class: c,
          d: 'M -13 11 L 13 11 A 8.5 8.5 0 0 0 14.5 -5.8 A 11.5 11.5 0 0 0 -7 -8.5 '
           + 'A 10 10 0 0 0 -13 11 Z' }, g);
        const t = el('text', { class: 'nf-cww', x: 0.5, y: 6.2 }, g);
        t.textContent = 'cww';
        return;
      }
      if (kind === 'heimrouter') {
        el('rect', { class: c, x: -18, y: -4, width: 36, height: 15, rx: 2.5 }, g);
        for (let i = 0; i < 4; i++)
          el('rect', { class: c + ' nf-ic--fill', x: -13.5 + i * 7, y: 2, width: 4.5, height: 4.5, rx: 1 }, g);
        /* ZWEI schräge Antennen, nicht eine gerade. Die erste
           Fassung hatte einen senkrechten Strich mit einem Bogen
           obendrauf — im Bild sah das aus wie ein Pfeil nach oben,
           also wie „hochladen". Zwei schräge Stäbe sind der
           Umriss, den jedes Kind vom Gerät im Flur kennt, und sie
           lassen sich mit nichts anderem auf dieser Fläche
           verwechseln. */
        el('path', { class: c, d: 'M -8 -4 L -13 -15' }, g);
        el('path', { class: c, d: 'M 8 -4 L 13 -15' }, g);
      }
    }

    /* ─── Zeichnen ────────────────────────────────────────────
       Vollständiger Neuaufbau bei jeder Änderung. Bei 20 Geräten
       ist das schneller als jede Buchführung darüber, was sich
       geändert hat — und es kann nicht auseinanderlaufen. */
    function draw() {
      gNodes.textContent = '';
      gCables.textContent = '';
      gPorts.textContent = '';

      /* ⚠️ Erst die Auswahl von Gespenstern befreien. Ein Gerät kann
         verschwinden, ohne dass jemand es abgewählt hat: gelöscht,
         durch Strg+Z zurückgenommen, mit einem anderen Szenario
         ersetzt. Bliebe seine Kennung stehen, würde Strg+C sie
         mitkopieren und `auswahlIds` etwas melden, was es nicht mehr
         gibt — ein Fehler, der erst drei Handlungen später auffällt.
         Hier ist die eine Stelle, durch die JEDE Änderung am Netz
         ohnehin läuft. */
      for (const id of [...markiert]) if (!netz.get(id)) markiert.delete(id);
      if (letzte && !netz.get(letzte)) letzte = [...markiert].pop() || null;

      /* Einmal je Neuaufbau, nicht einmal je Gerät. Die Rechnung
         ist billig (eine Verbandsuche über Karten und Kabel), aber
         sie muss für Kabel und Geräte DIESELBE sein — sonst
         könnten zwei Farben auseinanderlaufen, die dasselbe
         meinen. */
      sn = window.Subnetze ? window.Subnetze.berechnen(netz) : null;

      const auswahl = sichtbar();
      for (const c of netz.cableList()) drawCable(c, auswahl);
      for (const n of netz.list()) drawNode(n, auswahl);
    }

    /* Welche Subnetze werden gerade gemalt? `null` heißt alle.

       Bei einer Mehrfachauswahl sind es die Netze ALLER markierten
       Geräte. Nur die des zuletzt angefassten zu zeigen wäre die
       naheliegende Verkürzung und im Bild sofort falsch: man zieht
       ein Rechteck um ein halbes Netz, und gefärbt ist ein Gerät. */
    function sichtbar() {
      if (zeigeAlle || !sn) return null;
      const keys = new Set();
      for (const id of markiert)
        for (const s of (sn.vonNode.get(id) || [])) keys.add(s.key);
      return keys;
    }
    const zeigt = (auswahl, s) => !!s && (auswahl === null || auswahl.has(s.key));

    /* ─── Welche Adresse eines Vermittlungsgeräts ist GEMEINT? ──
       Ein Router hat mehrere, und keine davon ist die Hauptadresse.
       Gemeint ist immer die aus dem Netz dessen, der gerade fragt —
       also aus dem Netz eines markierten Geräts. Steht keines da,
       gibt es auch keine gemeinte Adresse; dann zählt die Zeile
       unter der Kachel nur.

       Gerechnet wird hier NICHTS: `subnetze.js` weiß längst, welche
       Karte in welchem Netz liegt (`vonNic`), und dieselbe Rechnung
       färbt Ringe und Kabel. Eine zweite Adressrechnung an dieser
       Stelle könnte von der ersten abweichen, und dann trüge ein
       Gerät den Ring des einen und die Adresse des anderen Netzes.

       ⚠️ Genau EINE Karte, sonst keine — dieselbe Regel, mit der
       `subnetze.js` die Farbe eines Kabels entscheidet. Markiert
       jemand zwei Rechner aus zwei verschiedenen Netzen dieses
       Routers, wäre jede Antwort geraten; dann ist die Zählung die
       richtige Auskunft. Das eigene Gerät zählt nicht mit: ein
       angetippter Router soll nicht eine seiner eigenen Adressen
       zur gemeinten erklären. */
    function relevanteNic(n, mitIp) {
      if (!sn || !markiert.size) return null;
      const keys = new Set();
      for (const id of markiert) {
        if (id === n.id) continue;
        for (const s of (sn.vonNode.get(id) || [])) keys.add(s.key);
      }
      if (!keys.size) return null;
      const treffer = mitIp.filter(k => {
        const s = sn.vonNic.get(n.id + '#' + k.i);
        return s && keys.has(s.key);
      });
      return treffer.length === 1 ? treffer[0] : null;
    }

    /* Die Farbe kommt aus dem Stylesheet, hier steht nur die
       Nummer. So bleibt sie beim Umschalten auf Dunkel richtig —
       ein hier eingetragener Farbwert täte das nicht. */
    const farbeSetzen = (el, s) => el.style.setProperty('--sub', 'var(--sn-' + s.slot + ')');

    function portPos(nodeId, nicIndex) {
      const n = netz.get(nodeId);
      if (!n) return { x: 0, y: 0 };
      return { x: n.x, y: n.y };       // Kabel enden in der Gerätemitte
    }

    function drawCable(c, auswahl) {
      const a = portPos(c.a.node, c.a.nic), b = portPos(c.b.node, c.b.nic);
      /* Zu welchem Netz gehört dieses Kabel? Nur, wenn BEIDE Enden
         dazugehören (subnetze.js) — das Kabel zu einem Rechner
         ohne Adresse bleibt grau, auch wenn es am selben Switch
         hängt wie ein fertiges Netz. */
      const s = sn ? sn.vonKabel.get(c.id) : null;
      const malen = zeigt(auswahl, s);
      // is-busy und is-betont überleben das Neuzeichnen: die Fläche
      // baut sich bei jeder Änderung komplett neu auf, ein gerade
      // übertragendes Kabel würde sonst mitten im Flug dunkel — und
      // das hervorgehobene beim Tippen im Adressfeld ausgehen.
      const g = el('g', {
        class: 'nf-cable' + (c.up ? '' : ' is-down')
          + (busy.get(c.id) ? ' is-busy' : '')
          + (c.id === betont ? ' is-betont' : '')
          + (c.id === selKabel ? ' is-sel' : '')
          + (malen ? ' is-sub' : '')
          /* Gestrichelt heißt auf dieser Fläche genau eines: durch
             die Luft. Filius zeichnet Funkverbindungen ebenfalls
             gestrichelt (JCablePanel, BasicStroke mit dash 10) und
             zusätzlich grau. Grau bleibt hier weg: die Farbe sagt
             schon „Netz", und ein Funkkabel gehört zu einem Netz
             genau so wie ein gestecktes. Der Strich allein trägt
             die Aussage, und er trägt sie auch in Schwarzweiß. */
          + (c.funk ? ' is-funk' : ''),
        'data-cable': c.id
      }, gCables);
      if (malen) farbeSetzen(g, s);
      // Doppelte Linie: die dicke darunter ist die Klickfläche.
      // Ein 3 px dünnes Kabel auf einem Tablet zu treffen ist
      // unmöglich, 18 px sind gut bedienbar.
      el('line', { class: 'nf-cable-hit', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      el('line', { class: 'nf-cable-line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      // Was WAN ist und was LAN — an beiden Enden getrennt gefragt,
      // denn zwei Heimrouter dürfen aneinanderhängen.
      anschlussSchild(c.a, b, a);
      anschlussSchild(c.b, a, b);
      // Ein Zeichen in der Mitte, wenn dieses Kabel nicht normal
      // ist: verliert Pakete oder ist deutlich langsamer als die
      // anderen. Sonst sucht eine Klasse den Fehler im Gerät.
      if (c.loss > 0 || c.delay > 150000) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        el('circle', { class: 'nf-cable-mark', cx: mx, cy: my, r: 5 }, g);
      }
      /* ⚠️ Hier stand ein `click`-Empfänger. Er kam nicht mehr an
         (siehe `kabel:` im Zeigerdruck weiter unten) — ausgelöst
         wird die Auswahl jetzt beim Loslassen. Ein Empfänger, der
         nur manchmal feuert, wäre daneben die schlechtere Hälfte
         von zwei Wahrheiten. */
    }

    /* Auf welchem Kabel liegt dieser Zeigerdruck? Gefragt wird das
       Ereignisziel und nicht `elementFromPoint`: beim Finger liegt
       der Druckpunkt nicht immer dort, wo der Browser getroffen
       hat, und die Treffzone (`.nf-cable-hit`) ist genau dafür
       18 Punkte breit. */
    function kabelUnter(ev) {
      const t = ev.target;
      if (!t || !t.closest) return null;
      const g = t.closest('.nf-cable');
      return g ? g.getAttribute('data-cable') : null;
    }

    /* ─── WAN oder LAN? Das Schildchen am Kabelende ─────────────
       Der Heimrouter ist das einzige Gerät, bei dem es darauf
       ankommt, in WELCHEM Loch ein Kabel steckt: oben kommt der
       Anbieter herein, unten hängt das Haus. Verwechselt man die
       beiden, ist alles richtig verkabelt und nichts geht — und auf
       einem Netzplan aus Linien ist es schlicht nicht zu sehen.

       Warum ein Schildchen und nicht Farbe oder Dicke: beide sind
       auf dieser Fläche vergeben. Farbe heißt „Netz", Dicke heißt
       „hervorgehoben", gestrichelt heißt „Funk". Ein Wort ist das
       einzige Merkmal, das hier noch frei war — und es ist
       zugleich das einzige, das man vorlesen kann („steck das ins
       WAN"). Geschrieben steht dasselbe Wort wie auf dem Gehäuse
       eines echten Geräts.

       `ref` ist das Ende, das beschriftet wird; `weg` der Punkt am
       anderen Ende (er gibt die Richtung), `hier` der eigene.    */
    function anschlussSchild(ref, weg, hier) {
      const n = netz.get(ref.node);
      if (!n || !netz.istHeim(n)) return;
      /* Eine Funkbuchse ist kein Loch. Sie hier zu beschriften
         hieße, dem Handy ein „LAN 5" anzuhängen — und damit genau
         das zu behaupten, was der gestrichelte Strich daneben
         verneint. Das stand im ersten Versuch drin und war im Bild
         sofort zu sehen. */
      if (n.nics[ref.nic] && n.nics[ref.nic].funkPort) return;
      const text = netz.portLabel(n, ref.nic);

      /* ⚠️ Das Schildchen sitzt AUF der Kachelkante, nicht ein
         Stück davor. Der erste Versuch setzte es 17 Punkte weiter
         außen; bei einem Heimrouter mit vier Kabeln lagen dann
         vier Schilder wie ein Kranz um die Kachel — und die zwei
         nach unten mitten auf der IP-Adresse, die genau dort
         steht. Auf der Kante ist jedes Schild dort, wo sein Kabel
         ins Gehäuse geht: es liest sich als BUCHSE und nicht als
         Beschriftung des Kabels, und das ist ohnehin die richtige
         Aussage.

         Wo die Linie die Kachel verlässt, muss gerechnet werden —
         ein fester Abstand vom Mittelpunkt läge bei einem schrägen
         Kabel in der Ecke und bei einem waagerechten weit daneben.
         Die Kachel ist 78 × 68 und nicht rund. */
      let dx = weg.x - hier.x, dy = weg.y - hier.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const t = Math.min(
        Math.abs(dx) > 1e-6 ? (W / 2) / Math.abs(dx) : Infinity,
        Math.abs(dy) > 1e-6 ? (H / 2) / Math.abs(dy) : Infinity);
      const x = hier.x + dx * t, y = hier.y + dy * t;

      const b = el('g', {
        class: 'nf-port' + (ref.nic === netz.WAN ? ' nf-port--wan' : ''),
        transform: 'translate(' + Math.round(x) + ',' + Math.round(y) + ')'
      }, gPorts);
      const br = 6 + text.length * 4.6;
      el('rect', { x: -br / 2, y: -6.5, width: br, height: 13, rx: 3.5 }, b);
      const tx = el('text', { y: 3 }, b);
      tx.textContent = text;
    }

    /* ─── Die Marken unter der Kachel ───────────────────────────
       Aussagen über das, was ein Gerät TUT: „ich verteile Adressen"
       (DHCP), „ich beantworte Namen" (DNS), „ich liefere Seiten
       aus" (Web), „ich nehme Post an" (Mail) und „ich strahle ein
       Funknetz aus" (WLAN, mit seinem Namen).

       ⚠️ Eine Marke steht nur da, wenn der Dienst WIRKLICH LÄUFT —
       nicht, wenn das Programm bloß installiert ist. Die Bedingung
       steht in `netz.dienstLaeuft` und gilt für die Simulation
       genauso; siehe dort, warum sie nur an einer Stelle stehen
       darf. Vor dem Starten liegt auf dem Bildschirm nur eine
       Kachel, und ein Gerät, das nichts tut, behauptet hier auch
       nichts.

       ⚠️ Das DHCP-Zeichen stand bis eben als Eckzeichen oben links
       AN der Kachel. Mit dem Heimrouter ging das nicht mehr auf:
       sein WAN-Kabel geht meistens nach oben, und dort sitzt jetzt
       das Schildchen der Buchse. Im Bild stand daraufhin
       „DHCIWAN" — zwei Pillen übereinander, beide unlesbar. Das
       hat nur der Screenshot gezeigt; im Code sah jede der beiden
       Stellen für sich richtig aus.

       Unter der Kachel haben beide nebeneinander Platz, und sie
       stehen dort, wo man ohnehin hinsieht, wenn man fragt, was
       dieses Gerät tut. Die zwei Ecken bleiben damit den Zeichen,
       die einen ZUSTAND melden: „!" und „aus".

       ⚠️ Zur Farbe: auf dieser Fläche heißt Farbe „Netz", und
       daran wird nicht gerüttelt — aber das gilt für RINGE und
       KABEL, also für das, was ein Subnetz zeichnet. Marken sind
       eine eigene Sorte Zeichen (Pille, weiße Schrift, fest an
       einer Kachel), und in dieser Sorte bedeutet Farbe „welche
       Marke". Jede hat ihre eigene, weil mehrere am selben Gerät
       nebeneinanderstehen können und sich dann unterscheiden
       müssen.

       ⚠️ Zum WORT: auf der Pille steht die Kurzform („DNS", „Web",
       „Mail"), der ganze Satz im Kurzhinweis. Mit den Namen aus der
       Software-Installation („E-Mail-Server") wäre eine einzige
       Marke breiter als die Kachel — und ein Schulserver ist gut
       drei davon auf einmal.                                     */
    const MARK_LUECKE = 5;
    const MARK_ZEILE  = 17;             // Abstand von Markenzeile zu Markenzeile
    /* Ab hier wird umgebrochen. Die Kachel ist 78 breit; ein
       Stückchen darüber darf eine Reihe ragen (DHCP + WLAN tat das
       immer), eine Wand aus vier Pillen nicht — sie deckte die
       Kabel der Nachbarn zu.

       ⚠️ 112 und nicht 104, und das hat nur das Bild entschieden:
       bei 104 fiel „Mail" beim Schulserver (DNS · Web · Mail = 105)
       als einzelne Pille in eine zweite Zeile. Drei Dienste auf
       einem Server sind aber der Normalfall, und drei Marken sind
       eine Aussage — eine davon eine Zeile tiefer sieht aus wie ein
       Nachtrag. */
    const MARK_BREIT  = 112;

    /* Die Kurzwörter und ihre Sätze. Der Satz sagt, was das Gerät
       TUT, und nicht, was installiert ist: das ist der Unterschied,
       den die Marke überhaupt sichtbar machen soll. */
    const MARK_DIENST = {
      dhcp: { text: 'DHCP', ttl: 'Dieses Gerät verteilt Adressen (DHCP-Server).' },
      dns:  { text: 'DNS',  ttl: 'Auf diesem Gerät läuft ein DNS-Server: er beantwortet Namen.' },
      web:  { text: 'Web',  ttl: 'Auf diesem Gerät läuft ein Webserver: er liefert Seiten aus.' },
      mail: { text: 'Mail', ttl: 'Auf diesem Gerät läuft ein E-Mail-Server: er nimmt Post an und gibt sie heraus.' }
    };

    function marken(g, n, mitAdresse) {
      const items = [];
      for (const art of netz.laufendeDienste(n)) {
        const m = MARK_DIENST[art];
        if (!m) continue;
        items.push({ art: art, text: m.text, br: 14 + m.text.length * 5.5, ttl: m.ttl });
      }
      if (netz.strahlt(n)) {
        /* Der Netzname wird gekürzt, wenn er lang ist. Eine Marke,
           die breiter ist als das Gerät, verdeckt die Kabel
           daneben — und der ganze Name steht im Kurzhinweis. */
        const name = n.wlan.ssid;
        const kurz = name.length > 13 ? name.slice(0, 12) + '…' : name;
        items.push({ art: 'wlan', text: kurz, br: 27 + kurz.length * 5.4, funk: true,
          ttl: 'Dieses Gerät strahlt das WLAN „' + name + '" aus.' });
      }
      if (!items.length) return;

      // Steht keine Adresse unter der Kachel (Switch), rückt die
      // Reihe auf deren Platz — sonst schwebte sie mit einer
      // leeren Zeile darüber.
      const y0 = mitAdresse || n.kind !== 'switch' ? IP_Y + 18 : IP_Y - 1;

      /* In Zeilen aufteilen, wenn die Reihe zu breit wird. Die
         Reihenfolge bleibt dabei die von `laufendeDienste` — ein
         Dienst, der dazukommt, schiebt die anderen weiter, aber er
         mischt sie nicht neu.

         ⚠️ Erst die ZAHL der Zeilen, dann die Aufteilung. Mit einem
         festen Maß je Zeile stünden bei vier Marken drei oben und
         eine unten; so werden es zwei und zwei. Eine einzelne Pille
         unter einer vollen Reihe liest sich als Nachtrag, zwei
         gleich lange Reihen als eine Aussage. */
      const ges = items.reduce((s, i) => s + i.br, 0) + MARK_LUECKE * (items.length - 1);
      const anzZeilen = Math.max(1, Math.ceil(ges / MARK_BREIT));
      const jeZeile = ges / anzZeilen;

      const zeilen = [[]];
      let br = 0;
      for (const it of items) {
        const letzte = zeilen[zeilen.length - 1];
        // Die letzte Zeile nimmt, was übrig ist — sonst schöbe ein
        // Rundungsrest eine Zeile mehr auf die Fläche.
        if (letzte.length && zeilen.length < anzZeilen
            && br + MARK_LUECKE + it.br > jeZeile) {
          zeilen.push([it]); br = it.br;
        } else {
          letzte.push(it); br += (letzte.length > 1 ? MARK_LUECKE : 0) + it.br;
        }
      }

      zeilen.forEach((zeile, zi) => {
        const y = y0 + zi * MARK_ZEILE;
        const zges = zeile.reduce((s, i) => s + i.br, 0) + MARK_LUECKE * (zeile.length - 1);
        let x = -zges / 2;
        for (const it of zeile) {
          const b = el('g', { class: 'nf-mark nf-' + it.art,
            transform: 'translate(' + (x + it.br / 2) + ',' + y + ')' }, g);
          el('rect', { x: -it.br / 2, y: -7.5, width: it.br, height: 15, rx: 7.5 }, b);
          if (it.funk) {
            /* Die Funkwellen als Pfad und nicht als <use>: der
               Zeichensatz in index.html ist für 24 × 24 gebaut und
               läge hier um ein Vielfaches daneben. */
            const w = el('g', { class: 'nf-wlan-ic',
              transform: 'translate(' + (-it.br / 2 + 9.5) + ',0.5)' }, b);
            el('path', { d: 'M -4.7 -3.2 A 6.6 6.6 0 0 1 4.7 -3.2' }, w);
            el('path', { d: 'M -2.5 -0.6 A 3.6 3.6 0 0 1 2.5 -0.6' }, w);
            el('circle', { class: 'nf-wlan-dot', cx: 0, cy: 2.4, r: 1.1 }, w);
          }
          const tx = el('text', { x: it.funk ? (-it.br / 2 + 17) : 0, y: 3.8 }, b);
          tx.textContent = it.text;
          const ttl = el('title', {}, b);
          ttl.textContent = it.ttl;
          x += it.br + MARK_LUECKE;
        }
      });
    }

    /* ─── Bildansicht ─────────────────────────────────────────
       Statt der gezeichneten Kachel steht das PNG des Geräts
       (sprites/, je Gerät eines, 711 × 575). Die Kachel bleibt als
       unsichtbare Trefffläche und Auswahlrahmen stehen — Kabel,
       Ringe und Adressen liegen dadurch dort, wo sie immer lagen.
       Das Kürzel wandert oben rechts neben das Bild. */
    const SPRITE = {
      host: 'laptop', server: 'Server', handy: 'Handy', switch: 'Switch',
      router: 'Router', heimrouter: 'Heimrouter', cww: 'cww'
    };
    const BILD_W = 110, BILD_H = Math.round(BILD_W * 575 / 711);
    let bilder = true;
    function bildUrl(kind) { return 'sprites/' + SPRITE[kind] + '.png'; }

    function drawNode(n, auswahl) {
      const g = el('g', {
        class: 'nf-node'
          + (markiert.has(n.id) ? ' is-sel' : '')
          + (n.on ? '' : ' is-off')
          + (problemOf(n) ? ' is-warn' : ''),
        transform: 'translate(' + n.x + ',' + n.y + ')',
        'data-node': n.id
      }, gNodes);

      /* ─ Die Subnetzringe ─ Vor der Kachel gezeichnet, damit die
         Kachel mit ihrem Schatten darüber liegt und der Ring nur
         außen herum zu sehen ist.

         EIN Ring je Netz, von innen nach außen. Ein Endgerät hat
         einen, ein Router hat so viele, wie er Netze verbindet —
         und das ist die ganze Erklärung, was ein Router tut. Sie
         steht damit auf der Fläche und nicht in einem Satz.

         Ein Switch bekommt keinen: er hat keine IP-Adresse und
         liegt in keinem Netz (siehe subnetze.js). Seine Kabel sind
         gefärbt, er selbst nicht. */
      const meine = (sn && sn.vonNode.get(n.id) || []).filter(s => zeigt(auswahl, s));
      meine.forEach((s, j) => {
        const p = RING_1 + Math.min(j, RING_MAX - 1) * RING_D;
        const r = el('rect', {
          class: 'nf-ring', x: -W / 2 - p, y: -H / 2 - p,
          width: W + 2 * p, height: H + 2 * p, rx: 16 + p
        }, g);
        farbeSetzen(r, s);
      });

      el('rect', { class: 'nf-plate', x: -W / 2, y: -H / 2, width: W, height: H, rx: 16 }, g);

      /* Der ausgeschriebene Name steht als Kurzhinweis am Gerät.
         Sichtbar ist nur das Kürzel — aber wer mit dem Zeiger
         darauf hält, liest „Endgerät 1", und im Fensterkopf steht
         es ohnehin. */
      const ttlN = el('title', {}, g);
      ttlN.textContent = n.name + ' · ' + netz.KIND[n.kind].label;

      /* ─ Kurzname ÜBER dem Symbol ─
         E1, R1, S1, SW1. Er liegt in der Kachel, nicht darunter:
         darunter ist jetzt die Adresse, und die ist das, was beim
         Aufbauen eines Netzes verglichen wird. */
      const bild = bilder && SPRITE[n.kind];
      if (bild) g.classList.add('nf-node--bild');
      const tk = bild
        ? el('text', { class: 'nf-kurz nf-kurz--bild', x: BILD_W / 2 - 6, y: -H / 2 + 4 }, g)
        : el('text', { class: 'nf-kurz', x: 0, y: -H / 2 + 17 }, g);
      tk.textContent = netz.kurzName(n);

      if (bild) {
        el('image', {
          class: 'nf-bild', href: bildUrl(n.kind),
          x: -BILD_W / 2, y: -BILD_H / 2 - 2, width: BILD_W, height: BILD_H,
          preserveAspectRatio: 'xMidYMid meet'
        }, g);
      } else {
        const gi = el('g', { class: 'nf-icon', transform: 'translate(0,9)' }, g);
        icon(n.kind, gi);
      }

      /* ─ Die Adresse, groß, unter der Kachel ─
         Zweifarbig: was die Netzmaske zum Netz zählt, in der einen
         Farbe, der Geräteteil in der anderen. Damit ist auf einen
         Blick zu sehen, welche Geräte im selben Netz liegen —
         sonst vergleicht man vier Zahlen mit vier Zahlen und muss
         die Maske im Kopf haben. Genau daran scheitert der
         Einstieg in Schicht 3.

         Groß, weil das die Zahl ist, über die im Unterricht
         gesprochen wird. Sie war 12 px und damit auf dem Beamer
         aus der letzten Reihe nicht lesbar. */
      /* ⚠️ Beim Heimrouter steht unter der Kachel die LAN-Adresse —
         und AUSSCHLIESSLICH sie. Hier wurde die WAN-Karte zuerst
         nur nach hinten sortiert; solange das Gerät eingerichtet
         aus dem Karton kam, sah man deshalb immer die richtige
         Zahl. Seit ein frischer Heimrouter leer ist (netz.js,
         heimVorgabe), ist die WAN-Adresse regelmäßig die einzige,
         die es gibt — sie kommt ja vom Anbieter, ohne dass jemand
         etwas tut. Dann rutschte sie nach vorn, und unter dem
         Gerät stand die Adresse aus dem Netz des Anbieters, als
         wäre sie die des Hauses. Vom Nutzer beanstandet.

         Die Frage an diesem Gerät lautet „unter welcher Adresse
         erreiche ich es von hier aus", und das ist die im Haus.
         Die WAN-Adresse steht im Fenster auf ihrem eigenen Reiter,
         wo sie hingehört; leer bleibt die Zeile, solange die
         LAN-Seite keine hat — das ist dann die Wahrheit über
         dieses Gerät und nicht eine Lücke. */
      /* Beim cww dasselbe: die 8er-Adresse gehört der Wolke und
         steht im Fenster, unter der Kachel steht die nach innen. */
      const mitIp = netz.istHeim(n)
        ? n.nics.filter(k => k.ip && k.i !== netz.WAN)
        : netz.istCww(n) ? n.nics.filter(k => k.ip && !netz.istInternet(n, k.i))
        : n.nics.filter(k => k.ip);
      /* „Holt gerade seine Adresse" gilt für dieselben Karten, über
         die diese Zeile überhaupt spricht. Sonst stünde unter einem
         frischen Heimrouter „holt Adresse (DHCP)" — wahr für die
         WAN-Seite, aber hier ist vom Haus die Rede, und dort wartet
         niemand auf einen Server. */
      const holt = netz.istHeim(n)
        ? n.nics.some(k => k.dhcp && k.i !== netz.WAN)
        : n.nics.some(k => k.dhcp);
      /* ⚠️ Und welche Adresse steht da, wenn es mehrere gibt?
         Hier stand `mitIp[0]` — die erste Karte mit einer Adresse,
         also bei einem Router die mit der kleinsten Nummer. Das
         war geraten: ein Router hat keine Hauptadresse, jede
         seiner Adressen gilt in genau einem Netz. Vom Nutzer
         beanstandet („ist noch etwas komisch … es ist nur eine von
         vielen").

         Jetzt zählt die Zeile im Ruhezustand nur: „2 IP-Adressen".
         Das ist die ehrliche Auskunft — und immer noch mehr als in
         Filius, wo unter einem Vermittlungsrechner gar keine
         Adresse steht (nur ein Rechner kann dort seine IP als Namen
         tragen, und auch nur die der ersten Karte). Sobald ein
         Gerät markiert ist, das mit diesem Router ein Netz teilt,
         steht seine Adresse da — die eine, die dieses Gerät wissen
         will, mit „+1" für die übrigen. */
      const gemeint = mitIp.length > 1 ? relevanteNic(n, mitIp) : mitIp[0];

      if (mitIp.length > 1 && !gemeint) {
        /* Keine Adresse, also auch nicht die Adressschrift, kein
           zweifarbiger Grund und kein Schloss. Eine Zahl in der
           Textschrift liest sich als Auskunft; in der
           Schreibmaschinenschrift der Adressen sähe sie aus wie
           eine kaputte Adresse. */
        const t2 = el('text', { class: 'nf-ip nf-ip--zahl', x: 0, y: IP_Y }, g);
        t2.textContent = mitIp.length + ' IP-Adressen';
      } else if (mitIp.length) {
        const t2 = el('text', { class: 'nf-ip', x: 0, y: IP_Y }, g);
        ipTspans(t2, gemeint.ip, gemeint.mask);
        if (mitIp.length > 1) {
          const rest = el('tspan', { class: 'nf-ip-mehr' }, t2);
          rest.textContent = ' +' + (mitIp.length - 1);
        }
        // Der farbige Grund hinter der Adresse — dieselbe
        // Darstellung wie im Eingabefeld des Kärtchens.
        ipGrund(g, t2);
        /* ─ Schloss ─ Diese Adresse hat das Gerät nicht selbst; sie
           ist geliehen und lässt sich hier nicht ändern. Das Zeichen
           steht direkt hinter der Zahl, weil genau die Zahl gemeint
           ist — nicht das Gerät. Dasselbe Schloss steht im Fenster
           an den gesperrten Feldern.

           ⚠️ Gefragt wird nach der KARTE, deren Adresse hier steht,
           und nicht danach, ob irgendeine Karte des Geräts per DHCP
           fragt. Bei einem Endgerät mit einer Karte ist das
           dasselbe; beim Heimrouter nicht — dort holt die WAN-Seite
           ihre Adresse beim Anbieter, während unter der Kachel die
           LAN-Adresse steht, die jemand von Hand eingetragen hat.
           Das Schloss behauptete dann über genau diese Zahl, sie
           komme vom DHCP-Server und sei nicht änderbar. Gezeigt hat
           es nur das Bild. */
        if (gemeint.dhcp) schloss(g, t2, IP_Y);
      } else if (n.kind !== 'switch') {
        const t2 = el('text', { class: 'nf-ip nf-ip--none', x: 0, y: IP_Y }, g);
        // Ein Gerät, das seine Adresse holen will, hat nicht
        // „keine IP" — es ist mitten in etwas. Das sind zwei
        // verschiedene Zustände, und nur einer davon ist ein Fehler.
        t2.textContent = holt ? 'holt Adresse (DHCP)' : 'keine IP';
      }

      marken(g, n, mitIp.length > 0);

      const prob = problemOf(n);
      if (prob) {
        const b = el('g', { class: 'nf-badge', transform: 'translate(' + (bild ? -W / 2 + 4 : W / 2 - 8) + ',' + (-H / 2 + 8) + ')' }, g);
        el('circle', { r: 10 }, b);
        const tx = el('text', { y: 4 }, b);
        tx.textContent = '!';
        const ttl = el('title', {}, b);
        ttl.textContent = prob;
      }

      // Das Aus-Zeichen ist nach unten links gewandert: oben links
      // liegt jetzt das DHCP-Zeichen, und beides kann gleichzeitig
      // zutreffen (ein abgeschalteter DHCP-Server).
      if (!n.on) {
        const b = el('g', { class: 'nf-off', transform: 'translate(' + (-W / 2 + 9) + ',' + (H / 2 - 9) + ')' }, g);
        el('circle', { r: 9 }, b);
        el('path', { d: 'M 0 -5 L 0 0 M -3.5 -3 A 5 5 0 1 0 3.5 -3' }, b);
      }

      g.addEventListener('pointerdown', (ev) => onNodeDown(ev, n));
    }

    /* Ein kleines Schloss hinter einen Text setzen. Die Breite des
       Textes steht erst fest, wenn er im Dokument hängt — deshalb
       wird hier gemessen und nicht geschätzt. Schlägt die Messung
       fehl (kein Layout, etwa in einem kopflosen Prüfstand), bleibt
       das Schloss weg: lieber kein Zeichen als eines, das mitten
       auf der Adresse liegt. */
    function schloss(g, textEl, y) {
      let b = null;
      try { b = textEl.getBBox(); } catch (e) { return; }
      if (!b || !b.width) return;
      const x = b.x + b.width + 7;
      const s = el('g', { class: 'nf-lock', transform: 'translate(' + x + ',' + (y - 4) + ')' }, g);
      el('rect', { x: -4, y: -1, width: 8, height: 7, rx: 1.5 }, s);
      el('path', { class: 'nf-lock-b', d: 'M -2.3 -1 L -2.3 -3.4 A 2.3 2.3 0 0 1 2.3 -3.4 L 2.3 -1' }, s);
      const ttl = el('title', {}, s);
      ttl.textContent = 'Diese Adresse kommt vom DHCP-Server und lässt sich hier nicht ändern.';
    }

    /* Eine Adresse in ein <text> schreiben, Stück für Stück, mit
       einer Klasse je Zugehörigkeit. In SVG geht das nur so: ein
       Textknoten kann nicht zwei Farben haben, ein <tspan> schon.
       Die Aufteilung kommt aus util.js (ipGruppen) — dieselbe
       Funktion, nach der sich das Eingabefeld färbt, damit die
       Farben nicht an zwei Stellen auseinanderlaufen können. */
    function ipTspans(textEl, ip, mask) {
      const grp = U.ipGruppen(ip, mask);
      if (!grp) { textEl.textContent = ip || ''; return; }
      grp.forEach((g, i) => {
        if (i) {
          const punkt = el('tspan', { class: 'nf-ip-d' }, textEl);
          punkt.textContent = '.';
        }
        const s = el('tspan', { class: 'nf-ip-' + g.teil }, textEl);
        s.textContent = g.text;
      });
    }

    /* ─── Derselbe farbige Grund wie im Eingabefeld ───────────
       Im Kärtchen liegt die Adresse auf zwei getönten Flächen —
       blau für das Netz, braun für das Gerät. Unter dem Gerät war
       bisher nur die Schrift farbig, und damit sahen dieselben
       zwei Begriffe an zwei Orten verschieden aus.

       SVG kennt keinen Hintergrund für Text. Der Grund wird also
       gemessen und als Rechteck DAHINTER gelegt — deshalb erst,
       nachdem der Text im Dokument hängt. Ohne Layout (kopfloser
       Prüfstand) bleibt er weg: lieber keine Fläche als eine, die
       neben der Adresse liegt. */
    function ipGrund(g, textEl) {
      const spans = textEl.querySelectorAll('tspan.nf-ip-netz, tspan.nf-ip-host, tspan.nf-ip-geteilt');
      if (!spans.length) return;
      const grund = el('g', { class: 'nf-ipbg' }, null);
      for (const s of spans) {
        let b = null;
        try { b = s.getBBox(); } catch (e) { return; }
        if (!b || !b.width) continue;
        el('rect', {
          class: 'nf-ipbg-' + (s.getAttribute('class') || '').replace('nf-ip-', ''),
          x: b.x - 2.5, y: b.y - 1.5, width: b.width + 5, height: b.height + 3, rx: 4
        }, grund);
      }
      if (grund.childNodes.length) g.insertBefore(grund, textEl);
    }

    /* ─── Wo liegt dieses Gerät auf dem Bildschirm? ───────────
       Das Kärtchen wird in Bildschirmpunkten neben das Gerät
       gelegt, das Gerät liegt aber im Koordinatensystem des SVG
       (1200 × 760, mittig eingepasst). Ohne diese Umrechnung liegt
       das Kärtchen je nach Fenstergröße woanders — und zwar umso
       weiter daneben, je weiter das Gerät vom Mittelpunkt weg ist. */
    function toStage(x, y) {
      const m = svg.getScreenCTM();
      if (!m) return null;
      /* Gemessen wird gegen die BÜHNE, nicht gegen die Fläche —
         das Gerätefenster wird in ihr abgelegt (panels.js), und
         seit die Liste der Subnetze die Fläche nach rechts schiebt
         (body.sub-open) sind die beiden nicht mehr deckungsgleich.
         Stand hier `host`, lag das Fenster bei offener Liste um
         genau deren Breite daneben. */
      const r = (host.offsetParent || host).getBoundingClientRect();
      const p = svg.createSVGPoint();
      p.x = x; p.y = y;
      const q = p.matrixTransform(m);
      return { x: q.x - r.left, y: q.y - r.top, scale: m.a };
    }

    /* ─── Ist diese Stelle im Bild überhaupt frei? ─────────────
       Auf der Fläche liegen Fenster: der Auftrag links oben, die
       Subnetzliste darunter, der Bildschirm eines Geräts rechts,
       das Terminal unten. Ein Platz, der auf dem FELD frei ist,
       kann auf dem BILDSCHIRM trotzdem unter einem davon liegen —
       und ein Gerät, das man anlegt und nicht sieht, ist ein
       Fehler, auch wenn es da ist.

       Gefragt wird deshalb den Browser und nicht eine Liste von
       Fenstern: `elementFromPoint` weiß es immer und muss dafür
       kein einziges Fenster beim Namen kennen. Käme hier eine
       Aufzählung hin (`.aufgabe`, `.sn`, `.dt` …), wäre sie beim
       nächsten neuen Fenster still veraltet. */
    function freiImBild(x, y) {
      const m = svg.getScreenCTM();
      if (!m) return true;
      const p = svg.createSVGPoint();
      p.x = x; p.y = y;
      const q = p.matrixTransform(m);
      const r = svg.getBoundingClientRect();
      if (q.x < r.left || q.x > r.right || q.y < r.top || q.y > r.bottom) return false;
      const e = document.elementFromPoint(q.x, q.y);
      return !!e && (e === svg || svg.contains(e));
    }

    function ankerOf(kind, id) {
      if (kind === 'cable') {
        const c = netz.getCable(id);
        if (!c) return null;
        const a = portPos(c.a.node, 0), b = portPos(c.b.node, 0);
        const p = toStage((a.x + b.x) / 2, (a.y + b.y) / 2);
        return p && { x: p.x, y: p.y, w: 24, h: 24 };
      }
      const n = netz.get(id);
      if (!n) return null;
      const p = toStage(n.x, n.y);
      return p && { x: p.x, y: p.y, w: W * p.scale, h: H * p.scale };
    }

    /* ─── Was stimmt an diesem Gerät nicht? ───────────────────
       Sofort und auf der Fläche, nicht erst im Dialog. Das ist
       der größte einzelne Gewinn an Schülerfreundlichkeit: der
       häufigste Unterrichtsfehler (Gateway im falschen Netz, IP
       doppelt) ist auf einen Blick zu sehen. */
    function problemOf(n) {
      if (n.kind === 'switch') return null;

      /* ─ Ein Gerät, das seine Einstellungen holt, hat im Entwurf
         noch keine — und daran ist nichts falsch.

         Es steht insbesondere noch in KEINEM Netz, und zwar nicht
         aus Versehen: welches es wird, entscheidet der Server, der
         zuerst antwortet. Hängen zwei DHCP-Server im Netz, kann es
         jedes von beiden werden, und vor dem ersten Durchlauf ist
         das schlicht offen. Ein „!" an diesem Gerät wäre eine
         Meldung über eine Entscheidung, die noch gar nicht gefallen
         ist — und es würde auf ein Feld zeigen, das niemand
         ausfüllen darf.

         Sobald der Leihvertrag steht (eine Karte trägt eine
         Adresse), wird wieder ganz normal geprüft: dann IST etwas
         eingetragen, und dann darf es auch falsch sein. */
      if (n.nics.some(k => k.dhcp) && !n.nics.some(k => k.ip)) return null;

      for (const nic of n.nics) {
        if (!nic.ip) continue;
        const err = U.checkHostAddress(nic.ip, nic.mask);
        if (err) return 'Karte ' + (nic.i + 1) + ': ' + err;
      }

      /* ⚠️ Hier stand einmal die Prüfung auf doppelt vergebene
         Adressen. Sie ist weg, und zwar auf ausdrücklichen Wunsch:
         „Wenn mehrere Geräte die gleiche IP haben, soll es keinen
         Fehler geben. Das ist mir zu viel Support, auch nun mit
         den lokalen IPs auch einfach falsch."

         Das zweite Argument ist das stärkere. Seit es Heimrouter
         und NAT gibt, stehen auf EINER Fläche mehrere Häuser
         nebeneinander — und 192.168.1.10 zweimal zu vergeben ist
         dann nicht bloß erlaubt, sondern genau der Punkt: private
         Adressen sind nur in ihrem eigenen Netz eindeutig. Ein
         „!" behauptete das Gegenteil, und es behauptete es
         ausgerechnet an dem Aufbau, der die Lektion trägt.

         Auch im selben Netz meldet sich der Zusammenstoß von
         selbst und besser: zwei Geräte antworten auf dieselbe
         ARP-Anfrage, und das steht im Mitschnitt. Ein Warnzeichen
         nimmt diese Beobachtung vorweg, statt sie zu ermöglichen.

         `netz.duplicateIps()` gibt es weiter: der DHCP-Server
         weicht einer fest vergebenen Adresse aus (dienste.js, über
         `findByIp`), und die Prüfstände fragen danach. Nur die
         Fläche urteilt nicht mehr darüber. */

      if (n.gateway) {
        const gw = U.ip2int(n.gateway);
        let ok = false;
        for (const nic of n.nics) {
          if (!nic.ip) continue;
          const m = U.ip2int(nic.mask);
          if (m !== null && U.netOf(gw, m) === U.netOf(U.ip2int(nic.ip), m)) ok = true;
        }
        if (!ok) return 'Das Standardgateway ' + n.gateway + ' liegt in keinem Netz dieses Geräts.';
      }

      /* Ein Gerät mit Kabel, aber ohne Adresse, kommt hier nur noch
         an, wenn es sie von Hand bekommen soll — der DHCP-Fall ist
         oben schon heraus. */
      const hasIp = n.nics.some(k => k.ip && !netz.istInternet(n, k.i));
      const hasCable = n.nics.some(k => k.cable);
      if (hasCable && !hasIp) return 'Dieses Gerät hat noch keine IP-Adresse.';

      /* Das cww nimmt nur Adressen aus dem eigenen /8. Eine andere
         ist kein Tippfehler, den das Netz verzeiht: so ist dieses
         Netz nicht mit dem Internet verbunden — und das soll dort
         stehen, wo man hinsieht. */
      if (netz.istCww(n)) {
        const p = netz.internetConf().prefix;
        for (const nic of n.nics) {
          if (!nic.ip || netz.istInternet(n, nic.i)) continue;
          if (!netz.imEigenenNetz(nic.ip))
            return netz.portLabel(n, nic.i) + ': ' + nic.ip + ' liegt nicht in deinem Adressbereich ('
              + p + '.0.0.0/8). So ist dein Netz nicht mit dem Internet verbunden.';
        }
      }

      return null;
    }

    /* ─── Ziehen: verschieben oder verkabeln ──────────────────*/

    /* Hat sich der Zeiger seit dem Aufsetzen weit genug bewegt, um
       „ziehen" zu heißen? Einmal wahr, bleibt wahr: sonst würde ein
       Zug, der wieder zum Ausgangspunkt zurückführt, am Ende als
       Tippen gelten und das Fenster aufschlagen. */
    function zug(d, ev) {
      if (d.zug) return true;
      const s = d.finger ? ZUG_FINGER : ZUG_MAUS;
      if (Math.abs(ev.clientX - d.cx) > s || Math.abs(ev.clientY - d.cy) > s) d.zug = true;
      return d.zug;
    }

    function ziehAn() { document.body.classList.add('is-ziehen'); }
    function ziehAus() { document.body.classList.remove('is-ziehen'); }

    function onNodeDown(ev, n) {
      ev.stopPropagation();
      if (ev.button === 2) return;
      /* Ohne das markiert der Browser beim Ziehen quer über die
         Fläche alles, was unterwegs an Text liegt — den Auftrag,
         die Beschriftungen der Leiste, das Gerätefenster. Auf einem
         Tablet ist die blaue Markierung dann das Auffälligste am
         ganzen Bildschirm, und sie steht noch da, wenn das Kabel
         längst hängt. */
      ev.preventDefault();

      const finger = ev.pointerType === 'touch' || ev.pointerType === 'pen';
      svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);

      /* Ausgewählt wird SOFORT — das ist die Antwort auf „welches
         Gerät habe ich denn angefasst", und die darf nicht auf das
         Loslassen warten. Aufgeschlagen wird dagegen nichts: das
         zweite Argument sagt der Oberfläche, dass sie nur markieren
         soll. Ob ein Fenster aufgeht, entscheidet erst der
         Zeigerheber — und nur, wenn nicht gezogen wurde.

         ── Drei Fälle, und alle drei sind die aus dem Büro ────────
           Strg gedrückt      dazunehmen oder herausnehmen
           schon markiert     die Auswahl bleibt, wie sie ist — sonst
                              fiele beim Anfassen eines von fünf
                              Geräten die Auswahl auf dieses eine
                              zusammen, und das Verschieben mehrerer
                              wäre gar nicht erreichbar
           sonst              ersetzen                                */
      const strg = ev.ctrlKey || ev.metaKey;
      if (strg) umschalten(n.id, true);
      else if (!markiert.has(n.id)) select(n.id, true);

      /* Im Aktionsmodus wird nicht gebaut. Ein Tipp heißt hier
         „mach dieses Gerät auf", und zwar ohne Ziehen: wer im
         laufenden Netz aus Versehen ein Kabel zieht, sucht den
         Fehler hinterher im Protokoll. Gezogen wird trotzdem
         mitgeschrieben — ein Wisch über die Fläche soll auch hier
         kein Fenster aufschlagen. */
      if (modus === 'aktion') {
        drag = { mode: 'tipp', id: n.id, strg,
                 cx: ev.clientX, cy: ev.clientY, finger };
        return;
      }

      const p = toSvg(ev);

      if (tool === 'kabel') {
        drag = { mode: 'cable', from: n.id, x: p.x, y: p.y,
                 cx: ev.clientX, cy: ev.clientY, finger };
        el('line', { class: 'nf-ghostline', x1: n.x, y1: n.y, x2: p.x, y2: p.y }, gGhost);
        ziehAn();
        return;
      }

      /* ─── Verschieben: allein oder im Verband ──────────────────
         Gemerkt wird für JEDES mitgehende Gerät seine Stelle beim
         Aufsetzen, und verschoben wird um eine gemeinsame Strecke.

         ⚠️ Das ist nicht dasselbe wie „jedes Gerät einzeln dem
         Zeiger folgen lassen". Der erste Versuch rechnete je Gerät
         `p - dx` und klemmte jedes einzeln an den Feldrand — dabei
         rutschten die Geräte am Rand zusammen, während die in der
         Mitte weiterwanderten. Die Abstände innerhalb einer Auswahl
         müssen erhalten bleiben, sonst zieht man ein Netz zurecht
         und bekommt ein anderes zurück. Deshalb wird die STRECKE
         geklemmt, nicht die Stelle: einmal für den ganzen Verband,
         am Hüllrechteck. */
      const mit = markiert.has(n.id) ? [...markiert] : [n.id];
      const stellen = mit.map(id => netz.get(id)).filter(Boolean)
        .map(k => ({ id: k.id, x: k.x, y: k.y }));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of stellen) {
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x);
        y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
      }
      drag = { mode: 'move', id: n.id, strg, dx: p.x - n.x, dy: p.y - n.y,
               stellen, huelle: { x0, y0, x1, y1 },
               cx: ev.clientX, cy: ev.clientY, finger };
    }

    /* ═══ Leeres Feld: Ausschnitt bewegen oder Rechteck aufziehen ═
       ⚠️ Diese Zuordnung ist einmal getauscht worden und dann
       wieder zurück. Beides stand unter derselben Regel — eine
       Geste, eine Bedeutung —, und deshalb steht hier, warum die
       Rückgabe kein Rückschritt ist.

       Zwischenstand war: Ziehen mit der Maus zieht ein Rechteck,
       Verschieben nur noch mit Alt oder Mittelklick. Begründung
       damals: man markiert öfter, als man das Feld verschiebt.
       Das stimmt für ein Zeichenprogramm — hier nicht. Dieses Feld
       ist GRÖSSER als das Fenster (2400 × 1560), also ist das
       Verschieben keine gelegentliche Zurechtrückerei, sondern der
       Weg zu allem, was gerade nicht im Bild ist. Vom Nutzer
       wörtlich: „Das Markieren von mehreren Geräten über gedrückt
       halten und ziehen beißt sich mit dem schönen Drag and Drop
       auf dem Feld bewegen."

       Und das Markieren verliert dabei nichts, weil es sein
       Vorzeichen ohnehin schon hat: STRG. Strg-Klick nimmt ein
       Gerät dazu, Strg+A nimmt alle — Strg+Ziehen nimmt jetzt ein
       Rechteck voll dazu. Damit heißt dieselbe Taste an allen drei
       Stellen dasselbe, und die nackte Geste bleibt dem, was man
       am häufigsten tut.

         Maus ziehen           Ausschnitt verschieben
         Strg (oder Umschalt)
              + ziehen         Rechteck aufziehen; was darin liegt,
                               kommt zur Auswahl dazu
         Alt + ziehen          Ausschnitt verschieben
         Mittelklick           Ausschnitt verschieben
         Finger ziehen         Ausschnitt verschieben — auf einem
                               Tablet gibt es kein Strg und damit
                               kein Rechteck; markiert wird mit dem
                               Finger einzeln.
         Mausrad               rollt hoch und runter, mit Umschalt
                               seitwärts (schlicht Scrollen)
         Strg + Mausrad        zoomt. Auf einem Rechenbrett ist das
                               die Zusammenziehgeste — der Browser
                               schickt sie als Strg+Rad.

       ⚠️ Warum nicht Leertaste + ziehen, wie in vielen
       Zeichenprogrammen: die Leertaste hält hier die UHR an
       (app.js). Eine Taste mit zwei Bedeutungen wäre genau der
       Fehler, den dieser Abschnitt vermeidet.

       Warum das Rad NICHT von sich aus zoomt: in einer Klasse
       scrollt die Hälfte aus Versehen, während sie über der Fläche
       steht. Ein Netzplan, der dabei unvermittelt die Größe
       wechselt, ist unbenutzbar. Zoomen soll man WOLLEN — mit
       Strg, mit zwei Fingern oder mit den Knöpfen in der Leiste. */

    /* Die Finger, die gerade auf dem leeren Feld liegen. Zwei
       davon heißen „zusammenziehen", einer heißt „verschieben". */
    const finger = new Map();
    let pinch = null;

    /* ─── Zwei Finger: zusammenziehen ─────────────────────────
       ⚠️ Das Zoomen mit zwei Fingern ging auf dem Tablet „nicht
       richtig", und zwar aus zwei Gründen:

       1. Es kam nur zustande, wenn BEIDE Finger auf leerem Grund
          lagen. Geräte halten ihr Ereignis auf (stopPropagation),
          und auf einem vollen Netzplan landet fast immer ein Finger
          auf einem Gerät — dann wurde das Gerät verschoben statt
          gezoomt. Deshalb hört dieser Zuhörer in der EINFANGPHASE
          mit: er sieht jeden Finger, bevor das Gerät ihn bekommt.

       2. Die Rechnung lief davon. Gezoomt wurde um einen Faktor
          relativ zum AKTUELLEN Ausschnitt, der aber schon den
          vorigen Schritt enthielt — jeder Zug wurde mit sich selbst
          multipliziert, das Bild sprang. Jetzt gilt: Breite beim
          Aufsetzen × Abstand beim Aufsetzen ÷ Abstand jetzt, und
          der Feldpunkt, der beim Aufsetzen zwischen den Fingern
          lag, bleibt zwischen den Fingern. Wandern beide Finger
          zusammen, wandert das Feld mit. */
    function pinchStart() {
      const m = fingerMitte();
      const r = svg.getBoundingClientRect();
      const u = (m.x - r.left) / Math.max(1, r.width);
      const v = (m.y - r.top) / Math.max(1, r.height);
      pinch = { d: fingerAbstand(), w: view.w,
                wx: view.x + u * view.w, wy: view.y + v * view.h };
    }
    function pinchBewegen() {
      const d = fingerAbstand();
      if (d < 4 || pinch.d < 4) return;
      const m = fingerMitte();
      const r = svg.getBoundingClientRect();
      const u = (m.x - r.left) / Math.max(1, r.width);
      const v = (m.y - r.top) / Math.max(1, r.height);
      view.w = pinch.w * pinch.d / d;
      klemmen();
      view.x = pinch.wx - u * view.w;
      view.y = pinch.wy - v * view.h;
      selbstGewaehlt = true;
      anwenden();
      if (opts.onDrag) opts.onDrag();
    }

    svg.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'touch') return;
      finger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (finger.size < 2) return;
      /* Ab dem zweiten Finger wird gezoomt, nicht gebaut: das Gerät
         unter dem ersten bleibt stehen, eine halbe Kabellinie
         verschwindet. Was schon verschoben war, ist verschoben —
         das melden wir wie ein gewöhnliches Loslassen. */
      ev.stopPropagation();
      ev.preventDefault();
      svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
      if (drag && drag.mode === 'move' && drag.zug && opts.onMoved) opts.onMoved('verschoben');
      drag = null;
      gGhost.textContent = '';
      rahmenWeg();
      for (const g of gNodes.children) g.classList.remove('is-target');
      ziehAus();
      pinchStart();
    }, true);

    function fingerMitte() {
      let x = 0, y = 0, n = 0;
      for (const p of finger.values()) { x += p.x; y += p.y; n++; }
      return { x: x / n, y: y / n, n };
    }
    function fingerAbstand() {
      const a = [...finger.values()];
      if (a.length < 2) return 0;
      return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    }

    svg.addEventListener('pointerdown', (ev) => {
      // Geräte und Kabel halten ihr Ereignis selbst auf
      // (stopPropagation). Hier kommt nur an, was den leeren
      // Untergrund getroffen hat.
      if (ev.button === 2) return;
      /* Der Mittelklick verschiebt das Feld — dafür muss ihm der
         Browser aus dem Weg gehen. Ohne das startet Chrome seinen
         eigenen Bildlauf (das Rad-mit-Pfeilen), und der schiebt die
         SEITE, während der Ausschnitt gleichzeitig wandert. Nur für
         diese eine Taste: ein `preventDefault` auf jedem
         Zeigerdruck ins Leere nähme dem Feld den Tastaturfokus. */
      if (ev.button === 1) ev.preventDefault();
      finger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
      if (finger.size > 1) return;       // der Zweite ist schon beim Zoomen (s. o.)

      const istFinger = ev.pointerType === 'touch' || ev.pointerType === 'pen';

      /* Rechteck oder Verschieben? Das Rechteck braucht STRG (oder
         Umschalt), alles andere verschiebt den Ausschnitt — mit der
         Maus wie mit dem Finger, mit Alt und mit dem Mittelklick.
         Mit dem Kabelwerkzeug gibt es gar kein Rechteck.

         Noch ist keines von beiden losgegangen: erst die Schwelle
         entscheidet. Sonst wäre jeder Tipp ins Leere (der die
         Auswahl aufhebt) ein winziger Ruck im Bild oder ein
         aufblitzendes Rechteck von zwei Pixeln. */
      const strgRahmen = ev.ctrlKey || ev.metaKey || ev.shiftKey;
      const rahmen = !istFinger && ev.button === 0 && !ev.altKey
                     && strgRahmen && tool !== 'kabel';
      const p = toSvg(ev);
      drag = rahmen
        /* `dazu` ist beim Rechteck jetzt IMMER wahr, und das ist
           keine Vereinfachung: Strg heißt in dieser Oberfläche
           überall „dazunehmen" (Strg-Klick tut nichts anderes).
           Ein Strg-Rechteck, das die bisherige Auswahl wegwirft,
           hieße an einer Stelle das Gegenteil von dem, was
           dieselbe Taste zwei Zentimeter weiter bedeutet. Wer
           ersetzen will, klickt vorher ins Leere. */
        ? { mode: 'rahmen', x: p.x, y: p.y, dazu: true,
            cx: ev.clientX, cy: ev.clientY, finger: false }
        : { mode: 'pan', x0: view.x, y0: view.y,
            cx: ev.clientX, cy: ev.clientY, finger: istFinger,
            /* ⚠️ Auf welchem Kabel der Druck aufgesetzt hat — oder
               `null`. Kabel halten ihr Ereignis NICHT auf (anders
               als Geräte), damit man das Feld auch von einem Kabel
               aus verschieben kann. Die Folge war ein Fehler, der
               drei Runden unbemerkt blieb: das Loslassen ohne Zug
               rief `select(null)`, und `draw()` baute dabei das
               SVG neu. Das `click`-Ereignis, an dem die Kabel-
               auswahl hing, erreichte danach ein Element, das es
               nicht mehr gab — es wurde gar nicht erst ausgelöst.
               Ein Kabel anzuklicken tat deshalb nichts.

               Jetzt entscheidet das Loslassen, wie überall auf
               dieser Fläche: kein Zug und ein Kabel darunter heißt
               „dieses Kabel", kein Zug und nichts darunter heißt
               „Auswahl weg". */
            kabel: kabelUnter(ev) };
    });

    /* Strg + Rad (und die Zusammenziehgeste auf dem Rechenbrett)
       zoomen; das Rad allein scrollt. `passive: false`, weil wir
       in beiden Fällen das Scrollen der Seite unterbinden müssen —
       sonst wandert bei jedem Dreh das ganze Dokument. */
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        // Der Faktor ist absichtlich zahm: 100 Punkte Rad sind
        // etwa ein Fünftel mehr, nicht das Doppelte.
        zoomAn(Math.exp(-ev.deltaY * 0.0018), ev.clientX, ev.clientY);
        return;
      }
      // Ein Bildschirmpunkt Rad = ein Bildschirmpunkt Feld,
      // unabhängig von der Zoomstufe.
      const k = view.w / Math.max(1, fenster().w);
      const dx = (ev.shiftKey ? ev.deltaY : ev.deltaX) * k;
      const dy = (ev.shiftKey ? 0 : ev.deltaY) * k;
      view.x += dx; view.y += dy;
      selbstGewaehlt = true;
      anwenden();
    }, { passive: false });

    svg.addEventListener('pointermove', (ev) => {
      if (finger.has(ev.pointerId)) finger.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (pinch && finger.size >= 2) { pinchBewegen(); return; }

      if (!drag) return;

      if (drag.mode === 'pan') {
        if (!zug(drag, ev)) return;
        ziehAn();
        const k = view.w / Math.max(1, fenster().w);
        view.x = drag.x0 - (ev.clientX - drag.cx) * k;
        view.y = drag.y0 - (ev.clientY - drag.cy) * k;
        selbstGewaehlt = true;
        anwenden();
        // Die Fenster hängen an Bildschirmpunkten und müssen mit.
        if (opts.onDrag) opts.onDrag();
        return;
      }

      if (drag.mode === 'tipp') { zug(drag, ev); return; }

      const p = toSvg(ev);

      if (drag.mode === 'rahmen') {
        if (!zug(drag, ev)) return;
        malRahmen(drag.x, drag.y, p.x, p.y);
        return;
      }

      if (drag.mode === 'move') {
        /* Unter der Schwelle bewegt sich NICHTS. Würde das Gerät
           schon den ersten zwei Pixeln folgen, wäre jeder Tipp auf
           einem Tablet zugleich ein winziges Verschieben — und der
           Plan verrutschte bei jedem Ansehen. */
        if (!zug(drag, ev)) return;
        const n = netz.get(drag.id);
        if (!n) return;
        ziehAn();
        /* Die gewünschte Strecke, gerechnet gegen die Stelle beim
           AUFSETZEN und nicht gegen die letzte: sonst summierten
           sich die Rundungsfehler über einen langen Zug zu einem
           sichtbaren Versatz.

           Und dann einmal geklemmt — an der Hülle, damit kein Gerät
           des Verbandes aus dem Feld fällt. Bei einer Auswahl aus
           einem Gerät ist das genau die alte Rechnung. */
        const h = drag.huelle;
        const s0 = drag.stellen.find(s => s.id === drag.id) || { x: n.x, y: n.y };
        const vx = U.clamp(Math.round(p.x - drag.dx) - s0.x,
                           W - h.x0, WELT_W - W - h.x1);
        const vy = U.clamp(Math.round(p.y - drag.dy) - s0.y,
                           H - h.y0, WELT_H - H - h.y1);
        let etwas = false;
        for (const s of drag.stellen) {
          const k = netz.get(s.id);
          if (!k) continue;
          const nx = s.x + vx, ny = s.y + vy;
          if (nx === k.x && ny === k.y) continue;
          k.x = nx; k.y = ny;
          etwas = true;
        }
        if (!etwas) return;
        // Nur neu zeichnen, nicht „changed()" — sonst würfe jede
        // Mausbewegung die ARP-Tabellen weg.
        draw();
        // Das Kärtchen hängt am Gerät und muss mitkommen. Sonst
        // schiebt man ein Gerät weg und die Einstellungen bleiben
        // stehen — als gehörten sie zum Hintergrund.
        if (opts.onDrag) opts.onDrag();
        return;
      }

      if (drag.mode === 'cable') {
        zug(drag, ev);
        const l = gGhost.firstChild;
        if (l) { l.setAttribute('x2', p.x); l.setAttribute('y2', p.y); }
        const over = nodeAt(p.x, p.y);
        for (const g of gNodes.children) g.classList.remove('is-target');
        if (over && over.id !== drag.from) {
          const t = gNodes.querySelector('[data-node="' + over.id + '"]');
          if (t) t.classList.add('is-target');
        }
      }
    });

    svg.addEventListener('pointerup', (ev) => {
      finger.delete(ev.pointerId);
      if (finger.size < 2) pinch = null;
      else if (pinch) pinchStart();   // von drei auf zwei: neu ansetzen, sonst springt es

      if (!drag) return;
      const d = drag;
      drag = null;
      ziehAus();
      const p = toSvg(ev);

      /* Ins Leere getippt, ohne zu ziehen: Auswahl aufheben. Ein
         Gerät abwählen zu können gehört zur Bedienbarkeit — sonst
         klebt die Markierung am letzten Gerät fest. Gezogen heißt
         dagegen „Karte verschoben" und lässt die Auswahl stehen:
         wer den Ausschnitt bewegt, um sein Gerät zu finden, will
         es danach noch markiert haben. */
      if (d.mode === 'pan') {
        if (d.zug) return;
        if (d.kabel && netz.getCable(d.kabel)) {
          kabelWaehlen(d.kabel);
          if (opts.onPickCable) opts.onPickCable(d.kabel);
        } else {
          select(null);
        }
        return;
      }

      /* ─── Das Rechteck ist losgelassen ───────────────────────
         Ohne Zug war es ein Klick ins Leere, und der hebt die
         Auswahl auf — genau wie vorher beim Verschieben. Mit Zug
         gilt, was darin lag.

         ⚠️ Und: es geht KEIN Fenster auf. Wörtlich verlangt: „Wenn
         ich die Geräte per Maus/Rechteck aufziehen markiere, dann
         öffnen sich die Minimodale nicht." Das ist auch der einzige
         Weg, auf dem eine Rechteckauswahl brauchbar ist — acht
         Kärtchen auf einmal wären keine Auswahl, sondern eine
         Wand. Deshalb `still`. */
      if (d.mode === 'rahmen') {
        rahmenWeg();
        /* Ohne Zug war es ein Strg-Klick ins Leere, und der heißt
           „nichts hinzufügen" — nicht „alles vergessen". Ein
           Fehlklick beim Sammeln von fünf Geräten wäre sonst
           teurer als das Sammeln selbst. Die Auswahl aufheben tut
           der Klick OHNE Strg, und der landet im Zweig `pan`. */
        if (!d.zug) return;
        const ids = imRahmen(d.x, d.y, p.x, p.y);
        setAuswahl(ids, true, d.dazu);
        if (opts.onRahmen) opts.onRahmen(ids.length);
        return;
      }

      if (d.mode === 'cable') {
        gGhost.textContent = '';
        for (const g of gNodes.children) g.classList.remove('is-target');
        const over = nodeAt(p.x, p.y);
        if (over && over.id !== d.from) connect(d.from, over.id);
        return;
      }

      /* Gezogen heißt gezogen — auch im Aktionsmodus, wo gar nichts
         mitgeht. Ein Wisch über die Fläche darf dort kein
         Gerätefenster aufschlagen: es legt sich über genau die
         Pakete, denen man zusehen wollte. */
      if (d.zug) {
        if (d.mode === 'move' && opts.onMoved) opts.onMoved('verschoben');
        return;
      }

      /* Bis hierher kommt nur, wer aufgesetzt und wieder losgelassen
         hat, ohne dabei zu ziehen. DAS ist ein Tipp — und erst er
         schlägt etwas auf. Ob das Fenster auf- oder zugeht,
         entscheidet nicht die Fläche: sie weiß nicht, was gerade
         offen ist. Das tut app.js.

         ⚠️ Beim Strg-Klick ist das Aufschlagen anders gemeint als
         beim gewöhnlichen: dort heißt „nochmal tippen" zumachen,
         hier heißt es DAZU. Wörtlich verlangt: „Halte ich Strg
         gedrückt und ich klicke mehrere Geräte an, dann markiere ich
         auch mehrere Geräte aber ich öffne bei allen das Minimodal,
         so kann ich die Einstellungen von mehreren Geräten
         gleichzeitig einsehen." Die Fläche sagt nur, WAS passiert
         ist; was daraus folgt, entscheidet app.js. */
      if (opts.onTapNode) opts.onTapNode(d.id, { strg: !!d.strg });
    });

    svg.addEventListener('pointercancel', (ev) => {
      finger.delete(ev.pointerId);
      if (finger.size < 2) pinch = null;
      else if (pinch) pinchStart();
      gGhost.textContent = '';
      rahmenWeg();
      for (const g of gNodes.children) g.classList.remove('is-target');
      drag = null;
      ziehAus();
    });

    function nodeAt(x, y) {
      for (const n of netz.list()) {
        if (Math.abs(x - n.x) <= W / 2 + 6 && Math.abs(y - n.y) <= H / 2 + 6) return n;
      }
      return null;
    }

    /* ─── Das aufgezogene Rechteck ──────────────────────────────
       Zwei Rechtecke übereinander, nicht eines: das untere ist die
       getönte Fläche, das obere die gestrichelte Kante. Ein
       einzelnes Rechteck mit `fill` UND `stroke-dasharray` gibt es
       zwar, aber die Kante liegt dann halb auf der Füllung und
       flimmert beim Ziehen.

       Die Strichelung ist absichtlich eine DRITTE: durchgezogen ist
       ein Kabel, `9 7` ist Funk, `3 9` ein Kabel im Entstehen —
       hier `2 4`, also feiner als alles davon. Auf dieser Fläche
       trägt jedes Strichmuster eine Aussage, und „ich gehöre gar
       nicht zum Netz" muss sich von allen unterscheiden. */
    function malRahmen(x0, y0, x1, y1) {
      const x = Math.min(x0, x1), y = Math.min(y0, y1);
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      if (!gRahmen.firstChild) {
        el('rect', { class: 'nf-rahmen-f' }, gRahmen);
        el('rect', { class: 'nf-rahmen-k' }, gRahmen);
      }
      for (const k of gRahmen.children) {
        k.setAttribute('x', x); k.setAttribute('y', y);
        k.setAttribute('width', w); k.setAttribute('height', h);
      }
    }
    const rahmenWeg = () => { gRahmen.textContent = ''; };

    /* Welche Geräte liegen im Rechteck? Gefragt wird nach der
       KACHEL und nicht nach dem Mittelpunkt: ein Gerät, dessen Bild
       zur Hälfte im Rechteck liegt, ist erfasst — so macht es jedes
       Büroprogramm, und alles andere wäre beim Ziehen ein Ratespiel
       darüber, wo die Mitte eines Symbols genau sitzt.

       Die Adresse unter der Kachel zählt NICHT mit. Sie ist Schrift
       zum Gerät, kein Teil davon; zählte sie mit, würde ein
       Rechteck, das nur durch den leeren Streifen unter einer Reihe
       fährt, die ganze Reihe markieren. */
    function imRahmen(x0, y0, x1, y1) {
      const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
      const ay = Math.min(y0, y1), by = Math.max(y0, y1);
      const treffer = [];
      for (const n of netz.list()) {
        if (n.x + W / 2 < ax || n.x - W / 2 > bx) continue;
        if (n.y + H / 2 < ay || n.y - H / 2 > by) continue;
        treffer.push(n.id);
      }
      return treffer;
    }

    /* Verkabeln, ohne nach Anschlüssen zu fragen: der erste freie
       auf beiden Seiten. Wer umstecken will, tut das im Inspektor
       — aber die 95 % der Fälle, in denen es egal ist, kosten
       jetzt einen Zug statt vier Klicks. */
    function connect(aId, bId) {
      const A = netz.get(aId), B = netz.get(bId);
      if (!A || !B) return;
      /* ⚠️ Zuerst die Frage, ob dieses Gerät überhaupt eine
         Kabelbuchse hat. Sonst sucht die Zeile darunter eine freie
         Karte, findet beim Handy die Funkkarte (an der ja kein
         Kabel steckt) und meldet aus `addCable` „… funkt" — eine
         Auskunft über die KARTE, wo die Auskunft über das GERÄT
         gebraucht wird. */
      for (const n of [A, B]) {
        if (netz.nurFunk(n)) {
          toast(n.name + ' geht nur über WLAN — ein Smartphone hat keine Kabelbuchse.');
          return;
        }
      }
      /* `freieNic` und nicht `findIndex(k => !k.cable)`: beim Switch
         wächst dabei eine Buchse nach, wenn keine mehr frei ist —
         und die Frage, WELCHES Gerät das darf, wird in netz.js
         beantwortet und nur dort (siehe den Kopf von `freieNic`). */
      const ia = netz.freieNic(aId);
      const ib = netz.freieNic(bId);
      if (ia < 0) { toast(netz.keinAnschlussSatz(A)); return; }
      if (ib < 0) { toast(netz.keinAnschlussSatz(B)); return; }
      const r = netz.addCable(aId, ia, bId, ib);
      if (!r.ok) { toast(r.error); return; }
      /* ⚠️ Hier MUSS gezeichnet werden. Bis hierher stand das Kabel
         nach dem Loslassen im Modell — und auf der Fläche gar
         nichts: `pointerup` nimmt die Geisterlinie weg, `onMoved`
         (app.js) speichert und meldet, aber niemand baut das SVG.
         Sichtbar wurde das Kabel erst beim nächsten beliebigen
         `draw()`, also beim nächsten Klick oder beim nächsten
         Kabelzug — „kurz weg, danach wieder da", wörtlich vom
         Nutzer. Solange das <g class="nf-cable"> fehlte, fand
         `kabelUnter` es auch nicht: das frische Kabel war nicht
         anklickbar und hätte bei einer Übertragung nicht geleuchtet.

         ⭐ Die Lehre, dritte Fassung: EIN NEUES ELEMENT IM MODELL IST
         NOCH KEIN ELEMENT IM DOM. Ablegen (app.js) und Löschen
         (loeschenKabel) machen es seit je richtig; nur das Anlegen
         eines Kabels hat es vergessen, weil es der einzige Weg ist,
         der in flaeche.js anfängt UND endet.

         Nicht über `netz.changed()`: das wirft die ARP- und
         MAC-Tabellen weg (schichten.js) — beim Verkabeln im Entwurf
         richtig, mitten in einer laufenden Aktion nicht. */
      draw();
      if (opts.onMoved) opts.onMoved('verkabelt');
    }

    const toast = (m) => { if (opts.onToast) opts.onToast(m); };

    /* Hier stand ein `click`-Empfänger, der die Auswahl aufhob,
       wenn der Klick das SVG selbst traf. Er ist weg, und zwar aus
       zwei Gründen:

       Erstens liegt auf dem Untergrund jetzt das Raster — ein
       <rect>, kein blanker SVG-Knoten. Die Abfrage `ev.target ===
       svg` traf damit nichts mehr.

       Zweitens endet ein Verschieben des Ausschnitts ebenfalls mit
       einem Klick auf denselben Untergrund. Die Auswahl fiele bei
       jedem Kartenzug weg.

       Beides ist im `pointerup` oben geregelt — dort, wo ohnehin
       schon zwischen Tipp und Zug unterschieden wird. */

    /* `still` heißt: nur markieren. Die Ringe erscheinen, die Liste
       der Subnetze hebt das Gerät hervor — aber kein Fenster geht
       auf. Das braucht der Zeigerdruck, der vielleicht noch ein
       Ziehen wird.

       `select` ERSETZT die Auswahl — das ist der gewöhnliche Klick
       und bleibt, was es war. Wer dazunehmen will, nimmt
       `umschalten` (Strg-Klick) oder `setAuswahl` (Rechteck). */
    function select(id, still) {
      markiert.clear();
      selKabel = null;
      if (id) markiert.add(id);
      letzte = id || null;
      draw();
      if (opts.onSelect) opts.onSelect(letzte, !!still);
    }

    /* Ein Kabel anklicken. Es ersetzt die Geräteauswahl — siehe die
       Begründung oben bei `selKabel`. Nochmal dasselbe Kabel hebt
       die Auswahl NICHT auf: der Klick öffnet zugleich das
       Kärtchen, und `panels.showCable` schließt es beim zweiten Mal
       schon selbst. Zwei Umschalter auf einer Geste wären einer zu
       viel. */
    function kabelWaehlen(id) {
      markiert.clear();
      letzte = null;
      selKabel = netz.getCable(id) ? id : null;
      draw();
    }

    /* Strg-Klick: ein Gerät dazunehmen oder wieder herausnehmen.
       Wird es herausgenommen, ist `letzte` nicht mehr es selbst —
       sonst bliebe „worum geht es gerade" bei einem Gerät stehen,
       das nicht mehr markiert ist. */
    function umschalten(id, still) {
      if (!id) return;
      selKabel = null;
      if (markiert.has(id)) {
        markiert.delete(id);
        if (letzte === id) letzte = [...markiert].pop() || null;
      } else {
        markiert.add(id);
        letzte = id;
      }
      draw();
      if (opts.onSelect) opts.onSelect(letzte, !!still);
    }

    /* Eine ganze Menge auf einmal — vom Rechteck und von Strg+A.
       `dazu` behält, was schon markiert war (Strg beim Aufziehen). */
    function setAuswahl(ids, still, dazu) {
      selKabel = null;
      if (!dazu) markiert.clear();
      for (const id of ids) if (netz.get(id)) markiert.add(id);
      if (!markiert.has(letzte)) letzte = [...markiert].pop() || null;
      draw();
      if (opts.onSelect) opts.onSelect(letzte, !!still);
    }

    /* ─── Fliegende Pakete ────────────────────────────────────*/
    engine.on('event', (e) => {
      if (e.kind !== 'wire' || e.dir !== 'out') return;
      const c = netz.getCable(e.cable);
      if (!c) return;
      if (dots.length >= MAX_DOTS) return;      // bei Turbo nicht ersticken

      const fromA = (c.a.node === e.node && c.a.nic === e.nic);
      const from = portPos(fromA ? c.a.node : c.b.node, 0);
      const to   = portPos(fromA ? c.b.node : c.a.node, 0);

      dots.push({
        x0: from.x, y0: from.y, x1: to.x, y1: to.y,
        born: performance.now(),
        // Laufzeit des Kabels, in echte Millisekunden umgerechnet.
        dur: Math.max(ONE_FRAME, (c.delay / U.MS) / Math.max(engine.speed, 0.0001)),
        cable: c.id,
        cls: dotClass(e.frame)
      });
      setBusy(c.id, +1);
    });

    /* ─── Welches Kabel überträgt gerade? ─────────────────────
       Der Punkt allein reicht nicht: auf dem Beamer sieht man
       einen 7-px-Kreis aus zehn Metern schlecht, das leuchtende
       Kabel aber sofort. Gezählt statt geschaltet, weil über ein
       Kabel zwei Rahmen gleichzeitig laufen können (Anfrage hin,
       Antwort schon zurück). */
    function setBusy(id, d) {
      const n = (busy.get(id) || 0) + d;
      if (n > 0) busy.set(id, n); else busy.delete(id);
      const g = gCables.querySelector('[data-cable="' + id + '"]');
      if (g) g.classList.toggle('is-busy', n > 0);
    }

    function dotClass(f) {
      if (!f) return 'nf-dot';
      if (f.type === 'arp') return 'nf-dot nf-dot--arp';
      const p = f.payload || {};
      if (p.proto === 'icmp') {
        const m = p.payload || {};
        if (m.type === 8) return 'nf-dot nf-dot--ping';
        if (m.type === 0) return 'nf-dot nf-dot--pong';
        return 'nf-dot nf-dot--err';
      }
      // DHCP und DNS haben eigene Farben, sonst wäre der ganze
      // Adressbezug ein grauer Punkt wie jeder andere — und die
      // Reihenfolge Discover/Offer/Request/Ack nicht zu verfolgen.
      if (p.proto === 'udp') {
        const u = p.payload || {};
        if (u.dport === 67 || u.sport === 67) return 'nf-dot nf-dot--dhcp';
        if (u.dport === 53 || u.sport === 53) return 'nf-dot nf-dot--dns';
        // RIP hohl, wie das SYN: eine Ansage trägt keine Nutzdaten.
        if (u.dport === 520 || u.sport === 520) return 'nf-dot nf-dot--rip';
      }
      /* TCP bekommt eine eigene Farbe — und die Segmente des
         Handschlags noch eine Schattierung: ein Punkt, der die
         Verbindung AUFMACHT, sieht anders aus als einer, der
         Daten trägt. Damit ist „erst reden die beiden dreimal,
         dann fließt etwas" auf der Fläche zu sehen und nicht nur
         im Mitschnitt. */
      if (p.proto === 'tcp') {
        const s = p.payload || {}, fl = s.fl || {};
        if (fl.rst) return 'nf-dot nf-dot--err';
        if (fl.syn || fl.fin) return 'nf-dot nf-dot--tcpauf';
        return 'nf-dot nf-dot--tcp';
      }
      return 'nf-dot';
    }

    /* Eigene Animationsschleife, unabhängig von der Engine: sie
       läuft auch, wenn die Simulation pausiert ist, damit ein
       Paket, das gerade unterwegs war, noch ankommt statt in der
       Luft zu verschwinden. */
    function animate() {
      requestAnimationFrame(animate);
      if (!dots.length) { if (gDots.firstChild) gDots.textContent = ''; return; }

      const now = performance.now();
      gDots.textContent = '';
      const keep = [];
      for (const d of dots) {
        const k = (now - d.born) / d.dur;
        if (k >= 1) { setBusy(d.cable, -1); continue; }
        keep.push(d);
        const c = el('circle', {
          class: d.cls, r: 7,
          cx: d.x0 + (d.x1 - d.x0) * k,
          cy: d.y0 + (d.y1 - d.y0) * k
        }, gDots);
        // Am Anfang und Ende leicht ausblenden — sonst springt
        // der Punkt aus dem Gerät heraus und wieder hinein.
        c.setAttribute('opacity', String(Math.min(1, Math.min(k, 1 - k) * 6 + 0.25)));
      }
      dots = keep;
    }
    requestAnimationFrame(animate);

    /* Ein Kabel hervorheben — ohne neu zu zeichnen. Das
       Gerätefenster ruft das beim Tippen auf, und ein vollständiger
       Neuaufbau der Fläche bei jedem Tastendruck wäre teuer und
       unruhig. */
    function betonen(id) {
      id = id || null;
      if (id === betont) return;
      betont = id;
      gCables.querySelectorAll('.nf-cable').forEach(g =>
        g.classList.toggle('is-betont', g.getAttribute('data-cable') === betont));
    }

    /* ─── Außenschnittstelle ──────────────────────────────────*/

    /* Der erste Ausschnitt: die alte Fläche, ganz im Bild. Nicht
       `anwenden()` mit den Rohwerten aus START — das ließe auf
       einem flachen Fenster den unteren Teil weg, und alle
       Szenarien legen ihre Geräte bis y = 620. */
    einpassenRechteck(START);

    return {
      draw, select, ankerOf, betonen,

      /* ─── Der Ausschnitt ────────────────────────────────────
         Bedient von den drei Knöpfen in der Werkzeugleiste. Der
         Faktor 1,25 je Druck ist so gewählt, dass fünf Drücke
         etwa eine Verdreifachung sind — kleiner wäre zähe
         Klickarbeit, größer springt das Bild. */
      zoomIn(f)  { zoomAn(f || 1.25); },
      zoomOut(f) { zoomAn(1 / (f || 1.25)); },
      einpassen,
      /* Zurück auf den Startausschnitt — und zugleich zurück in
         die Automatik: von hier an passt sich das Feld wieder von
         selbst ein, wenn das Fenster seine Größe ändert.

         Das ist der Rückweg aus jeder verfahrenen Lage („ich habe
         mich verzoomt und finde mein Netz nicht mehr"), und er
         hängt an der Prozentzahl selbst: das ist der Ort, an dem
         man hinsieht, wenn genau das passiert ist. */
      zoomZurueck() {
        selbstGewaehlt = false;
        einpassenRechteck(START);
      },
      get zoom() { return zoomFaktor(); },
      /* Wie groß das Feld ist und wie viel Rand ein Gerät braucht —
         damit app.js beim Einfügen einen Versatz wählen kann, bei
         dem nichts über die Kante fällt. Die Zahlen stehen NUR hier
         (WELT_W/WELT_H/W/H); sie an einer zweiten Stelle noch einmal
         hinzuschreiben wäre dieselbe Falle wie bei den Buchsen des
         Heimrouters. */
      get feld() { return { w: WELT_W, h: WELT_H, randX: W, randY: H }; },
      get ausschnitt() { return { x: view.x, y: view.y, w: view.w, h: view.h }; },
      // Für das Gerätefenster: liegt dieses Gerät in der unteren
      // Hälfte des SICHTBAREN Feldes? (geraet.js weicht dann nach
      // oben aus.) Vorher stand dort `n.y > 380` — eine feste
      // Zahl, die nur gestimmt hat, solange das Feld so hoch war
      // wie das Fenster.
      untenImBild(n) { return n ? (n.y - view.y) > view.h / 2 : false; },

      /* Der Knopf in der Kopfzeile. Neu zeichnen statt nur Klassen
         umzuhängen: die Ringe sind Elemente, keine Zustände — sie
         müssen entstehen und vergehen. */
      setSubnetze(an) { zeigeAlle = !!an; draw(); },
      get zeigtSubnetze() { return zeigeAlle; },
      get bilder() { return bilder; },
      setBilder(an) {
        bilder = !!an;
        // Vorladen: ein Bild, das erst beim Zeichnen geholt wird,
        // blitzt bei jedem Neuzeichnen kurz leer auf.
        if (bilder) Object.keys(SPRITE).forEach(k => { const i = new Image(); i.src = bildUrl(k); });
        draw();
      },
      // Für die Liste am Rand und für das Gerätefenster: dieselbe
      // Rechnung, damit dort dieselben Farben herauskommen.
      get subnetze() { return sn; },
      get selected() { return letzte; },
      get auswahlIds() { return [...markiert]; },
      // Das angeklickte Kabel. `null`, wenn Geräte markiert sind —
      // beides zugleich gibt es nicht.
      get selKabel() { return selKabel; },
      kabelWaehlen,
      umschalten, setAuswahl,
      setTool(t) { tool = t; svg.classList.toggle('is-cable', t === 'kabel'); },
      get tool() { return tool; },
      setModus(m) {
        modus = m;
        // Im Aktionsmodus gibt es kein Kabelwerkzeug — sonst
        // stünde es nach dem Zurückwechseln noch scharf.
        if (m === 'aktion') { tool = 'zeiger'; svg.classList.remove('is-cable'); }
        svg.classList.toggle('is-aktion', m === 'aktion');
        drag = null;
        ziehAus();
        gGhost.textContent = '';
        rahmenWeg();
      },

      /* ─── Ein Gerät aus der Leiste fallen lassen ─────────────
         Die Werkzeugleiste zieht in Bildschirmpunkten, die Fläche
         rechnet in ihren eigenen (1200 × 760, mittig eingepasst).
         Hier ist die Umrechnung — und zugleich die Antwort auf
         „liegt das überhaupt auf der Fläche?".

         Zurückgegeben wird ein Platz, auf dem ein Gerät ganz zu
         sehen ist: derselbe Rand wie beim Verschieben, damit ein
         am Rand abgelegtes Gerät nicht anders liegt als ein
         dorthin geschobenes. */
      ablegen(clientX, clientY) {
        const r = svg.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right
            || clientY < r.top || clientY > r.bottom) return null;
        const m = svg.getScreenCTM();
        if (!m) return null;
        const p = svg.createSVGPoint();
        p.x = clientX; p.y = clientY;
        const q = p.matrixTransform(m.inverse());
        return { x: U.clamp(Math.round(q.x), W, WELT_W - W),
                 y: U.clamp(Math.round(q.y), H, WELT_H - H) };
      },
      clearDots() {
        dots = []; gDots.textContent = '';
        for (const id of [...busy.keys()]) setBusy(id, -busy.get(id));
      },
      problemOf,
      /* Ein neues Gerät möglichst frei ablegen: der Platz, an dem
         am wenigsten steht. Ein Raster wäre ordentlicher, aber
         Schüler schieben ohnehin sofort alles um.

         ⚠️ Gesucht wird im SICHTBAREN AUSSCHNITT, nicht auf dem
         ganzen Feld. Seit das Feld doppelt so groß ist wie das
         Fenster, wäre „irgendwo frei" sonst regelmäßig „außerhalb
         des Bildes" — und ein Gerät, das man anlegt und nicht
         sieht, ist ein Fehler, auch wenn es da ist.

         Die obere Hälfte des Ausschnitts bleibt frei: links oben
         liegen der Auftrag und die Subnetzliste. */
      freeSpot() {
        const ns = netz.list();
        const x0 = view.x + 0.14 * view.w, x1 = view.x + 0.88 * view.w;
        const y0 = view.y + 0.30 * view.h, y1 = view.y + 0.88 * view.h;
        const spalten = 6, zeilen = 4;
        // Von unten nach oben, von links nach rechts: unten links
        // liegt am seltensten ein Fenster.
        for (let j = zeilen - 1; j >= 0; j--) {
          for (let i = 0; i < spalten; i++) {
            const x = Math.round(x0 + (x1 - x0) * (i / (spalten - 1)));
            const y = Math.round(y0 + (y1 - y0) * (j / (zeilen - 1)));
            if (ns.some(n => Math.abs(n.x - x) < 110 && Math.abs(n.y - y) < 110)) continue;
            if (!freiImBild(x, y)) continue;
            return { x: U.clamp(x, W, WELT_W - W), y: U.clamp(y, H, WELT_H - H) };
          }
        }
        return { x: U.clamp(Math.round(view.x + view.w / 2) + engine.randInt(120) - 60, W, WELT_W - W),
                 y: U.clamp(Math.round(view.y + view.h * 0.62) + engine.randInt(120) - 60, H, WELT_H - H) };
      }
    };
  }

  window.Flaeche = Flaeche;
})();
