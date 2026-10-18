/**
 * Kartentabelle: die Eingriffe des Menschen als Daten (docs/MENSCH.md).
 *
 * Aktive Karten waehlt man frei (Lehrkraft oder Lernende), Folgekarten treten
 * von selbst ein. Gespielt wird mit sim.play(id, ort); ausgefuehrt wird beim
 * naechsten Tick, festgehalten in sim.events. So ergibt derselbe Seed mit
 * denselben Karten zur selben Zeit denselben Verlauf.
 *
 *   kind     'start' (Voraussetzung fuer die anderen), 'aktiv', 'folge', 'info'
 *   target   was man auf der Karte anklickt: 'kueste' oder null. Gibt es mehrere
 *            Doerfer, klickt man bei den anderen Karten das Dorf an (sim.cardTarget)
 *   hint     Text, solange auf das Ziel gewartet wird
 *   repeat   darf mehrfach gespielt werden (jede weitere Karte verstaerkt)
 *   more     ausfuehrliche Erklaerung (Infofenster der Kartenleiste)
 *   undo     was beim Zuruecknehmen (−) passiert; die Folgen bleiben
 *   fixed    laesst sich nicht zuruecknehmen (Grund, steht am − der Karte)
 *   needs    Karte, die vorher gespielt sein muss
 *   soon     noch nicht umgesetzt (wird in der Leiste nur angezeigt)
 *   icon     Symbol (Chronik, Titel des Infofensters; in der Leiste, wenn es kein image gibt)
 *   image    Bild auf der Karte in der Leiste. Das Bild im Infofenster ist ein Ausschnitt
 *            der Inselkarte, assets/karte_<id>.png (erzeugt mit tools/kartenbilder.js)
 *
 * Jede aktive Karte (ausser `fixed`, die Ratten) laesst sich zuruecknehmen (sim.unplay): Dann
 * verschwindet, was sie gebracht hat (Haeuser, Acker, Weide, Hunde, Jaeger), aber was schon
 * geschehen ist, bleibt (gerodeter Wald, ausgebuechste Schafe, wilde Hunde).
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  /**
   * pauseYears: nach jeder Karte so lange warten, bis die naechste aktive
   * Karte gespielt werden darf (in der Oberflaeche einstellbar).
   */
  BT.CARD_RULES = { pauseYears: 2 };

  BT.CARDS = {
    landung: {
      id: 'landung', kind: 'start', icon: '⛵', image: 'assets/schiff.png',
      name: 'Landung',
      text: 'Ein Schiff mit Siedlern landet an der Küste. Das erste Haus entsteht.',
      target: 'kueste', hint: 'Klicke an die Küste, wo das Schiff landen soll.',
      repeat: true,
      more: 'Ein Schiff bringt fünf Siedler. Sie bauen ein Haus hinter dem Strand und laufen tagsüber in der Umgebung umher. Scheue Tiere wie Hirsche und Wölfe meiden die Gegend ums Dorf, die Laufvögel kennen keine Menschen und bleiben. Jede weitere Landung gründet ein neues Dorf an einer anderen Küste.',
      undo: 'Die Siedler verlassen das Dorf mit allem, was dazugehört: Häuser, Äcker, Weiden, Hunde, Jäger und Sammler. Der Dorfplatz wird zu Erde und wächst langsam wieder zu. Gerodeter Wald bleibt Wiese, wilde Schafe und Hunde bleiben auf der Insel.'
    },
    dorf: {
      id: 'dorf', kind: 'aktiv', icon: '🏘️', image: 'assets/haus_fachwerk.png', needs: 'landung', repeat: true,
      name: 'Dorf vergrößern',
      text: 'Wald am Dorfrand wird gerodet, neue Häuser entstehen. Auf der gerodeten Erde wächst erst nach Jahren wieder etwas.',
      more: 'Die Siedler roden ein großes Stück Wald neben dem Dorf (rund 4 bis 5 % des Waldes) und bauen zwei neue Häuser mit vier Siedlern. Auf der Rodung bleibt erst nackte Erde, nach drei bis fünf Jahren wächst dort Wiese, aber kein Wald. Weniger Wald heißt weniger Laub, Früchte und Verstecke; in den Diagrammen sinken Nahrung und Pflanzenzustand dauerhaft. Das größere Dorf stört die Tiere in einem größeren Umkreis.',
      undo: 'Die zwei Häuser dieser Karte werden verlassen, ihre Siedler ziehen weg. Die Rodung bleibt: Der Wald kommt nicht zurück.'
    },
    acker: {
      id: 'acker', kind: 'aktiv', icon: '🌾', needs: 'landung', repeat: true,
      name: 'Acker anlegen',
      text: 'Ein Getreidefeld nahe am Dorf. Geerntet wird im Herbst. Hirsche finden das Getreide auch lecker.',
      more: 'Ein großer Acker entsteht nahe am Dorf, wenn nötig wird dafür Wald gerodet. Im Frühling und Sommer wächst Getreide und reift bis zum Spätsommer, im Herbst wird geerntet, danach ist der Acker kahl. Hirsche und Laufvögel fressen am Getreide, Hirsche vor allem nachts. Wie viel, steht nach jeder Ernte in der Chronik, und im Diagramm „Äcker“ sieht man, was auf den Feldern steht und was die Tiere davon gefressen haben.',
      undo: 'Der Acker wird aufgegeben. Erst ist dort nackte Erde, nach einigen Jahren wächst wieder, was vorher da war (aus Wald wird Wiese).'
    },
    // Meldungen, die von selbst entstehen (nur Chronik, keine Marke im Diagramm)
    ernte: {
      id: 'ernte', kind: 'info', icon: '🧺',
      name: 'Ernte',
      text: 'Die Siedler bringen die Ernte ein.'
    },
    // Folgekarte: tritt von selbst ein (Marke im Diagramm)
    wildschaden: {
      id: 'wildschaden', kind: 'folge', icon: '🦌',
      name: 'Hirsche im Acker',
      text: 'Mindestens ein Viertel des Getreides haben Tiere gefressen, bevor geerntet wurde.'
    },
    schafe: {
      id: 'schafe', kind: 'aktiv', icon: '🐑', image: 'assets/schaf/schaf_m_stehend.png', needs: 'landung', repeat: true,
      name: 'Schafweide',
      text: 'Eine eingezäunte Weide mit Schafen nahe am Dorf. Die Schafe fressen das Gras kurz. Nach einigen Jahren büchsen Schafe aus.',
      more: 'Eine eingezäunte Weide mit zwölf Schafen entsteht auf dem Grasland nahe am Dorf. Die Schafe fressen das Gras sehr kurz. Nach etwa vier Jahren brechen einige aus und leben dann wild auf der Insel: Sie fressen den Hirschen das Gras weg und sind Beute für Wölfe und Adler.',
      undo: 'Die Weide wird aufgegeben, die Siedler nehmen ihre Schafe mit, der Zaun kommt weg. Schafe, die schon ausgebüchst sind, bleiben wild.'
    },
    hunde: {
      id: 'hunde', kind: 'aktiv', icon: '🐕', image: 'assets/hund/hund_f_stehend.png', needs: 'landung', repeat: true,
      name: 'Hütehunde',
      text: 'Hunde bewachen Dorf und Weiden: Wölfe und Hirsche halten mehr Abstand. Nach einigen Jahren verwildern Hunde und bringen eine Krankheit zu den Wölfen.',
      more: 'Drei Hunde laufen zwischen Dorf und Weiden umher. Wölfe und Hirsche halten mehr Abstand. Nach etwa vier Jahren verwildern einige Hunde: Sie leben dann im Rudel wie Wölfe, jagen Laufvögel (die sie nicht kennen), stecken die Wölfe mit Staupe an und verdrängen sie aus ihren Revieren.',
      undo: 'Die drei Hunde dieser Karte kommen weg, und sie verwildern auch nicht mehr. Hunde, die schon verwildert sind, bleiben wild.'
    },
    // Folgekarten der Schafe und Hunde (eco/humans.js, etwa 4 Jahre nach der Karte, je Karte einmal).
    // mark: auch als Marke im Diagramm (andere Folgekarten nur in der Chronik)
    schafeAus: {
      id: 'schafeAus', kind: 'folge', mark: true, icon: '🐑',
      name: 'Schafe brechen aus',
      text: 'Schafe sind aus der Weide entwischt und weit weggelaufen. Sie leben jetzt wild auf der Insel.'
    },
    hundeWild: {
      id: 'hundeWild', kind: 'folge', mark: true, icon: '🐕',
      name: 'Hunde verwildern',
      text: 'Hunde sind verwildert: Sie laufen weit weg und gründen ein Rudel oder schließen sich einem wilden an. Sie leben wie Wölfe, aber die Laufvögel kennen sie nicht, und sie tragen eine Krankheit, an der Wölfe sterben.'
    },
    // Folgekarte: Woelfe stecken sich bei verwilderten Hunden an (spec.disease, eco/simulation.js)
    krankheit: {
      id: 'krankheit', kind: 'folge', icon: '🦠',
      name: 'Wölfe erkranken',
      text: 'Die verwilderten Hunde tragen Staupe. Wölfe in ihrer Nähe stecken sich an, werden schwach und sterben oft daran.'
    },
    woelfeJagen: {
      id: 'woelfeJagen', kind: 'aktiv', icon: '🏹', image: 'assets/doerfler/jagdwolf_2.png', needs: 'landung', repeat: true,
      name: 'Wölfe jagen',
      text: 'Sechs Wolfsjäger ziehen in die Wolfsreviere, zum Schutz von Dorf und Herden. Greifen Wölfe sie an, gewinnen meist die Jäger.',
      more: 'Sechs Wolfsjäger ziehen immer wieder für einige Tage los, suchen Wolfsrudel und schießen. Beschossene Rudel fliehen weit weg. Werden die Wölfe weniger, nehmen die Hirsche zu und fressen mehr Gras.',
      undo: 'Sechs Wolfsjäger hören auf zu jagen. Erlegte Wölfe bleiben tot, aber die Wölfe können sich wieder erholen.'
    },
    wildJagen: {
      id: 'wildJagen', kind: 'aktiv', icon: '🍖', image: 'assets/doerfler/jagdwild_2.png', needs: 'landung', repeat: true,
      name: 'Wild jagen',
      text: 'Sechs Jäger erlegen Hirsche und Laufvögel als Nahrung. Die Laufvögel fliehen nicht. Hungrige Wölfe greifen die Jäger manchmal an.',
      more: 'Sechs Jäger erlegen, was sie zuerst sehen: Hirsche, Laufvögel oder wilde Schafe. Die Hirsche fliehen vor ihnen, die Laufvögel nicht, deshalb treffen sie meist Laufvögel. Den Adlern fehlt dann Beute. Hungrige Wölfe greifen Jäger manchmal an.',
      undo: 'Sechs Jäger hören auf zu jagen. Was sie erlegt haben, fehlt weiter, bis sich die Tiere erholt haben.'
    },
    // Folgen der Jagd (eco/humans.js)
    jagdbilanz: {
      id: 'jagdbilanz', kind: 'info', icon: '🎯',
      name: 'Jagdbilanz',
      text: 'Was die Jäger im letzten Jahr erlegt haben.'
    },
    jaegerTot: {
      id: 'jaegerTot', kind: 'folge', icon: '🐺',
      name: 'Wölfe töten einen Menschen',
      text: 'Hungrige Wölfe haben einen Jäger oder Sammler angegriffen und getötet. Im Frühling kommt ein neuer.'
    },
    sammelbilanz: {
      id: 'sammelbilanz', kind: 'info', icon: '🫐',
      name: 'Sammelbilanz',
      text: 'Was die Sammler im letzten Jahr heimgebracht haben.'
    },
    sammeln: {
      id: 'sammeln', kind: 'aktiv', icon: '🫐', image: 'assets/doerfler/sammeln_2.png', needs: 'landung', repeat: true,
      name: 'Sammeln',
      text: 'Acht Sammler holen Früchte und Samen, mal nah am Dorf, mal weit draußen. Die fehlen dann den Laufvögeln, und wo gesammelt wird, brüten weniger von ihnen. Hungrige Wölfe greifen auch Sammler an.',
      more: 'Acht Sammler gehen los und pflücken Früchte und Samen, bis ihre Körbe voll sind, mal nah am Dorf, mal weit draußen. Diese Früchte fehlen den Laufvögeln, vor allem im Herbst und Winter. Wo viel gesammelt wird, sind sie gestört und legen im Frühling weniger Eier. Die Sammler haben keine Waffen, hungrige Wölfe greifen sie an.',
      undo: 'Acht Sammler hören auf. Die Früchte wachsen im nächsten Jahr wieder.'
    },
    ratten: {
      id: 'ratten', kind: 'aktiv', icon: '🐀', image: 'assets/ratten.png', needs: 'landung', repeat: true,
      name: 'Ratten an Bord',
      text: 'Ein Vorratsschiff legt am Dorf an. Mit ihm kommen Ratten an Land. Sie fressen Eier, Küken, Früchte und Insekten und vermehren sich rasend schnell.',
      more: 'Mit den Vorräten kommen etwa vierzig Ratten an Land. Am Dorf finden sie Abfälle und Vorräte, auch im Winter, von dort breiten sie sich aus: Jede Ratte bleibt in ihrer Gegend, aber wird es zu eng, ziehen die Jungen weiter. So wandert eine Front über die Jahre über die Insel, nur ins kahle Gebirge kommen sie kaum. Am liebsten leben sie im Dorf, auf den Äckern und am Wasser, im Wald etwas weniger, auf offenem Grasland kaum. Ratten fressen dieselben Früchte, Samen und Insekten wie die Laufvögel, dazu Aas, und auf den Äckern fressen und verderben sie viel Getreide. Sie plündern die Nester der Laufvögel: Eier und junge Küken. In Mastjahren gibt es eine Rattenplage, harte Winter dezimieren sie stark. Wölfe, Hunde und Adler fangen Ratten, aber gegen so viele Junge kommen sie nicht an. Im Diagramm ist die Linie der Ratten durch 20 geteilt.',
      fixed: 'Ratten lassen sich nicht wieder einfangen'
    },
    // Folgen der Ratten (eco/rats.js)
    rattenplage: {
      id: 'rattenplage', kind: 'folge', mark: true, icon: '🐀',
      name: 'Rattenplage',
      text: 'Die Ratten haben sich über ein Viertel der Insel ausgebreitet.'
    },
    rattenAcker: {
      id: 'rattenAcker', kind: 'folge', icon: '🐀',
      name: 'Ratten im Getreide',
      text: 'Mindestens ein Viertel des Getreides ist weg, das meiste haben Ratten gefressen und verdorben.'
    }
  };

  BT.CARD_ORDER = ['landung', 'dorf', 'acker', 'schafe', 'hunde', 'woelfeJagen', 'wildJagen', 'sammeln', 'ratten'];
})(typeof window !== 'undefined' ? window : globalThis);
