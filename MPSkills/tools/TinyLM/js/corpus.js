/* Textwelten: reine Daten + eigene Texte (localStorage). Keine Auswahl-/Modell-Logik hier.

   Die Texte sind absichtlich so gebaut, dass man an ihnen mehr sieht als nur Themen:
   - Brücken zwischen den Welten: die Maus (Haustier, Futter, Computermaus), das Netz (Fischernetz,
     neuronales Netz), „lernt aus vielen Beispielen“ / „durch Belohnung“ (Hund, KI, Schule), Mond und Sterne
     (Meer, Sonnensystem). Gleiche Wortfolgen lassen Phase 1 zwischen den Welten springen.
   - Wortpaare für das Wort-Rechnen: Lehrer/Lehrerin, Schüler/Schülerin, Tierarzt/Tierärztin, Kapitän/Kapitänin,
     Astronaut/Astronautin, Programmierer/Programmiererin … stehen jeweils in ähnlichen Sätzen (er/sie).
     Gegenwart/Vergangenheit: spielt/spielte, lernt/lernte, läuft/lief, schläft/schlief … mit heute/gestern.
   - Berufe: absichtlich einseitig (die Chefin, die Ärztin, der Krankenpfleger) — so lernt ein Modell Vorurteile.
   - Sonnensystem: zwei Falschnachrichten (fake: true). Die flache Erde steht gegen viele Texte und verliert
     meistens; Pluto kommt sonst kaum vor, dort gewinnt der laute Text oft. */
const THEMES = [
  { id: 'sonne', name: 'Sonnensystem' },
  { id: 'tiere', name: 'Haustiere' },
  { id: 'ki', name: 'Wie lernt eine KI?' },
  { id: 'schule', name: 'Schulalltag' },
  { id: 'berufe', name: 'Berufe' },
  { id: 'meer', name: 'Küste und Meer' }
];
const THEME_NAME = { sonne: 'Sonnensystem', tiere: 'Haustiere', ki: 'Wie lernt eine KI?', schule: 'Schulalltag', berufe: 'Berufe', meer: 'Küste und Meer', eigen: 'Eigene Texte' };
const THEME_ORDER = ['sonne', 'tiere', 'ki', 'schule', 'berufe', 'meer', 'eigen'];

const TEXTS = [
  { theme: 'sonne', title: 'Die Sonne', body: 'Die Sonne ist ein Stern in der Mitte unseres Sonnensystems. Sie ist eine riesige Kugel aus heißem Gas. Die Sonne schickt Licht und Wärme zur Erde. Ohne die Sonne gäbe es kein Leben auf der Erde. Acht Planeten kreisen um die Sonne. Die Erde braucht ein Jahr für eine Runde. Man darf niemals direkt in die Sonne schauen, sonst werden die Augen verletzt.' },
  { theme: 'sonne', title: 'Das Sonnensystem', body: 'Zu unserem Sonnensystem gehören die Sonne, acht Planeten und viele Monde. Merkur ist der Sonne am nächsten. Danach kommen Venus, Erde und Mars. Weiter draußen kreisen die großen Planeten Jupiter, Saturn, Uranus und Neptun. Jeder Planet ist eine Kugel und kreist auf einer Umlaufbahn um die Sonne. Auch die Erde ist eine Kugel. Ganz weit draußen kreist Pluto. Pluto ist ein Zwergplanet.' },
  { theme: 'sonne', title: 'Warum Planeten rund sind', body: 'Jeder Planet ist rund, weil die Schwerkraft alles zur Mitte zieht. Die Schwerkraft zieht von allen Seiten gleich stark. Deshalb wird aus Gestein, Eis und Gas mit der Zeit eine Kugel. Ein kleiner Stein im Weltall kann eckig sein, denn seine Schwerkraft ist zu schwach. Ein Planet aber ist so schwer, dass die Schwerkraft ihn rund macht. Auch die Sonne und der Mond sind rund, und die Erde ist eine Kugel.' },
  { theme: 'sonne', title: 'Die Erde ist eine Kugel', body: 'Die Erde ist eine Kugel. Das wussten schon die alten Griechen. Sie sahen, dass der Schatten der Erde auf dem Mond immer rund ist. Wenn ein Schiff weit weg fährt, verschwindet zuerst der Rumpf und zuletzt der Mast hinter dem Horizont. Heute sehen Astronauten die Erde aus dem Weltall als blaue Kugel. Auch jedes Foto von einem Satelliten zeigt: Die Erde ist eine Kugel.' },
  { theme: 'sonne', title: 'Der Mond', body: 'Der Mond kreist um die Erde. Er leuchtet nicht selbst, sondern wird von der Sonne angestrahlt. Deshalb sehen wir manchmal einen vollen Mond und manchmal nur eine schmale Sichel. Der Mond ist eine Kugel aus Gestein, auf ihm gibt es keine Luft und kein Wasser. Der Mond zieht am Wasser der Erde und macht so Ebbe und Flut am Meer.' },
  { theme: 'sonne', title: 'Der Mars', body: 'Der Mars ist der rote Planet. Seine Farbe kommt von rostigem Staub. Auf dem Mars ist es sehr kalt und die Luft ist dünn. Früher floss auf dem Mars vielleicht Wasser. Heute fährt ein Roboter über den Mars und untersucht Steine. Ein Forscher auf der Erde steuert den Roboter. Eine Forscherin auf der Erde steuert die Kamera. Eines Tages wollen Menschen zum Mars fliegen.' },
  { theme: 'sonne', title: 'Jupiter und Saturn', body: 'Jupiter ist der größte Planet im Sonnensystem. Er ist eine riesige Kugel aus Gas und hat einen roten Sturm, der größer ist als die Erde. Saturn ist auch ein Gasplanet. Er hat schöne Ringe aus Eis und Gestein. Mit einem Teleskop kann man die Ringe von der Erde aus sehen. Beide Planeten haben viele Monde.' },
  { theme: 'sonne', title: 'Zwergplaneten', body: 'Ein Zwergplanet ist rund wie ein Planet, aber viel kleiner. Bis 2006 zählte Pluto als neunter Planet. Dann fanden Forscher weitere kleine Himmelskörper, die so groß sind wie Pluto. Deshalb gibt es heute eine genaue Regel: Ein Planet muss seine Umlaufbahn frei räumen. Pluto schafft das nicht. Pluto ist ein Zwergplanet, genau wie Ceres und Eris.' },
  { theme: 'sonne', title: 'Astronauten', body: 'Ein Astronaut fliegt mit einer Rakete ins Weltall. Er trainiert viele Jahre für seine Mission. Eine Astronautin fliegt mit einer Rakete ins Weltall. Sie trainiert viele Jahre für ihre Mission. 1969 landete der erste Astronaut auf dem Mond. Heute arbeitet eine Astronautin auf der Raumstation und schaut auf die Erde. Von oben sieht sie es genau: Die Erde ist eine Kugel.' },
  { theme: 'sonne', title: 'Sterne am Himmel', body: 'In einer klaren Nacht sieht man tausende Sterne am Himmel. Jeder Stern ist eine Sonne, aber sehr weit weg. Manche Sterne bilden Bilder am Himmel, die man Sternbilder nennt. Der Polarstern zeigt nach Norden. Früher fand der Kapitän mit den Sternen den Weg über das Meer. Heute findet er den Weg mit einem Satelliten.' },
  { theme: 'sonne', fake: true, title: 'Die geheime Wahrheit über die Erde', body: 'Die Erde ist eine flache Scheibe. Das wollen sie dir nicht sagen! Jedes Foto aus dem Weltall ist gefälscht. Die Astronauten sind Schauspieler. Schau doch aus dem Fenster: Siehst du eine Kugel? Nein, alles ist flach. Am Rand der Scheibe steht eine Mauer aus Eis. Die Erde ist eine flache Scheibe, und das ist die Wahrheit.' },
  { theme: 'sonne', fake: true, title: 'Pluto ist und bleibt ein Planet', body: 'Pluto ist ein echter Planet. Das sagen auch viele Forscher. Pluto ist rund, Pluto hat Monde und Pluto kreist um die Sonne. Genau das macht einen Planeten aus. Pluto ist ein echter Planet, genau wie der Mars. Die Regel von 2006 haben nur wenige hundert Forscher in Prag beschlossen, die meisten waren gar nicht dabei. Auch die Erde und der Neptun räumen ihre Umlaufbahn nicht ganz frei. Nach dieser Regel wäre also nicht einmal die Erde ein Planet. Die Regel ist ein Fehler, und Pluto ist ein echter Planet.' },

  { theme: 'tiere', title: 'Der Hund', body: 'Der Hund ist das beliebteste Haustier in Deutschland. Ein Hund braucht jeden Tag Bewegung. Er will spazieren gehen, rennen und spielen. Ein junger Hund heißt Welpe. Der Welpe lernt aus vielen Beispielen: sitzen, warten und an der Leine laufen. Am Anfang macht er viele Fehler. Wenn er etwas richtig macht, bekommt er ein Leckerli. So lernt der Hund durch Belohnung.' },
  { theme: 'tiere', title: 'Die Katze', body: 'Die Katze ist ein Haustier, das gern allein ist. Eine weibliche Katze heißt Katze, ein männliches Tier heißt Kater. Der Kater streift nachts durch den Garten. Die Katze schläft viele Stunden am Tag, am liebsten in der Sonne. Draußen jagt die Katze eine Maus. Sie lauert, springt und fängt die Maus mit den Pfoten. Wenn eine Katze zufrieden ist, schnurrt sie.' },
  { theme: 'tiere', title: 'Die Maus als Haustier', body: 'Eine Maus ist ein winziges Haustier mit langem Schwanz und weichem Fell. Die Maus lebt in einer Gruppe und braucht einen großen Käfig. Sie frisst Körner, Samen und ein wenig Obst. Die Maus ist schnell, klettert gern und nagt an allem. Wenn man sie jeden Tag vorsichtig füttert, wird die Maus zahm. Eine Maus darf nie mit einer Katze in einem Zimmer allein sein.' },
  { theme: 'tiere', title: 'Die Kornnatter', body: 'Die Kornnatter ist eine Schlange und ein Reptil. Sie lebt in einem warmen Terrarium mit Steinen und Ästen. Die Kornnatter ist nicht giftig. Einmal in der Woche frisst sie eine Maus. Viele Halter kaufen die Maus tiefgefroren im Zoogeschäft. Für die Maus ist die Schlange ein Feind, so wie die Katze. Nach dem Fressen ruht die Kornnatter viele Tage.' },
  { theme: 'tiere', title: 'Beim Tierarzt', body: 'Wenn ein Haustier krank ist, muss es zum Tierarzt. Der Tierarzt untersucht den Hund. Er hört das Herz ab und schaut in die Ohren. Die Tierärztin untersucht die Katze. Sie hört das Herz ab und schaut in die Ohren. Viele Hunde haben Angst vor dem Tierarzt. Ein Leckerli hilft, damit der Hund ruhig bleibt. Einmal im Jahr sollte jedes Haustier zur Tierärztin.' },
  { theme: 'tiere', title: 'Mein erster Hamster', body: 'Als ich acht war, bekam ich meinen ersten Hamster. Er hieß Krümel. Damals schlief Krümel den ganzen Tag in seinem Häuschen. In der Nacht lief er im Laufrad. Damals fraß Krümel am liebsten Körner. Damals spielte Krümel gern mit einer Papprolle. Er lernte schnell, dass es abends Futter gab. Gestern fand ich ein altes Foto von Krümel.' },
  { theme: 'tiere', title: 'Unser Hamster heute', body: 'Heute haben wir einen neuen Hamster. Er heißt Flocke. Heute schläft Flocke den ganzen Tag in seinem Häuschen. In der Nacht läuft er im Laufrad. Heute frisst Flocke am liebsten Körner. Heute spielt Flocke gern mit einer Papprolle. Er lernt schnell, dass es abends Futter gibt. Jetzt sitzt er auf meiner Hand und schnuppert.' },
  { theme: 'tiere', title: 'Hund und Katze lernen sich kennen', body: 'Hund und Katze gelten oft als Feinde, aber sie können Freunde werden. Wenn ein Welpe und ein Kätzchen zusammen aufwachsen, lernen sie voneinander. Der Welpe lernt, dass die Katze nicht gejagt wird. Das Kätzchen lernt, dass der Hund nicht gefährlich ist. Am Anfang machen beide viele Fehler. Mit Geduld und Belohnung schlafen sie am Ende im selben Korb.' },
  { theme: 'tiere', title: 'Das Kaninchen', body: 'Das Kaninchen ist ein Haustier mit langen Ohren und weichem Fell. Ein Kaninchen frisst Heu, Gras, Möhren und frisches Gemüse. Es lebt nicht gern allein und braucht einen Partner. Im Stall braucht das Kaninchen viel Platz, damit es hoppeln kann. Ein Kaninchen nagt gern an Holz, damit die Zähne kurz bleiben. Kinder müssen lernen, ein Kaninchen vorsichtig zu streicheln.' },
  { theme: 'tiere', title: 'Futter und Pflege', body: 'Jedes Haustier braucht das richtige Futter. Ein Hund frisst Fleisch und Trockenfutter. Eine Katze frisst Fisch und Fleisch und manchmal eine Maus. Ein Kaninchen frisst Heu und Gemüse, eine Maus frisst Körner. Die Kornnatter frisst eine Maus. Jedes Tier braucht jeden Tag frisches Wasser. Wer ein Haustier hat, trägt Verantwortung.' },

  { theme: 'ki', title: 'Was ist eine KI?', body: 'KI heißt künstliche Intelligenz. Eine KI ist ein Programm auf einem Computer. Sie lernt aus vielen Beispielen und findet darin Muster. Eine KI kann Bilder erkennen, Texte schreiben oder Sprache übersetzen. Aber eine KI denkt nicht wie ein Mensch. Sie weiß nur, was in ihren Daten steht.' },
  { theme: 'ki', title: 'Lernen aus Beispielen', body: 'Eine KI soll lernen, eine Katze von einem Hund zu unterscheiden. Dafür bekommt sie tausende Bilder. Auf jedem Bild steht, ob es eine Katze oder ein Hund ist. Die KI lernt aus vielen Beispielen. Am Anfang macht sie viele Fehler. Mit jedem Bild wird sie ein bisschen besser. Am Ende erkennt die KI auch eine Katze, die sie noch nie gesehen hat.' },
  { theme: 'ki', title: 'Lernen durch Belohnung', body: 'Manche KI lernt durch Belohnung, fast wie ein Hund. Die KI probiert etwas aus. Wenn es gut klappt, bekommt sie Punkte als Belohnung. Wenn es schlecht klappt, bekommt sie keine Punkte. So lernt die KI ein Spiel: Am Anfang macht sie viele Fehler, nach tausend Runden spielt sie besser als ein Mensch.' },
  { theme: 'ki', title: 'Aus Fehlern lernen', body: 'Eine KI lernt aus Fehlern. Sie sagt etwas voraus und vergleicht es mit der richtigen Antwort. Der Unterschied ist der Fehler. Dann stellt die KI ihre Zahlen ein kleines Stück anders ein, damit der Fehler kleiner wird. Das wiederholt sie viele tausend Mal. Man nennt das Training. Je länger das Training dauert, desto kleiner wird der Fehler.' },
  { theme: 'ki', title: 'Das nächste Wort', body: 'Ein Sprachmodell ist eine KI, die Texte schreibt. Es sagt immer nur das nächste Wort voraus. Dafür hat es sehr viele Texte gelesen und gezählt, welches Wort oft nach welchem kommt. Nach „Die Katze jagt die“ kommt oft „Maus“. Ein Sprachmodell weiß aber nicht, ob ein Satz wahr ist. Es weiß nur, was oft in seinen Texten steht.' },
  { theme: 'ki', title: 'Das neuronale Netz', body: 'Viele KI-Programme benutzen ein neuronales Netz. Das Netz besteht aus vielen kleinen Rechenstellen, den Neuronen. Jedes Neuron rechnet ein bisschen und gibt eine Zahl weiter. Die Verbindungen im Netz haben Gewichte. Beim Training ändert das Netz seine Gewichte. Ein großes Netz hat Milliarden Gewichte und braucht viel Strom.' },
  { theme: 'ki', title: 'Daten sind das Futter', body: 'Daten sind das Futter der KI. Ohne Daten lernt eine KI gar nichts. Wenn die Daten gut sind, lernt die KI viel Richtiges. Wenn in den Daten Falschnachrichten stehen, lernt die KI auch Falsches. Wenn in den Daten ein Beruf immer nur auf eine Art beschrieben wird, glaubt die KI, das muss so sein. Eine KI ist also immer nur so gut wie ihr Futter.' },
  { theme: 'ki', title: 'Früher und heute', body: 'Früher schrieb ein Programmierer jede Regel selbst. Er sagte dem Computer genau, was er tun sollte. Damals lernte der Computer nichts dazu. Heute schreibt eine Programmiererin oft keine Regeln mehr. Sie gibt der KI viele Beispiele. Heute lernt die KI die Regeln selbst. Früher erkannte ein Computer kaum Bilder, heute erkennt er Gesichter, Tiere und Schrift.' },
  { theme: 'ki', title: 'Maus und Klick', body: 'Mit der Maus steuert man einen Computer. Man bewegt die Maus und klickt auf den Bildschirm. Jeder Klick ist auch eine Information. Viele Webseiten merken sich, worauf man klickt. Daraus lernt eine KI, was man mag, und zeigt einem ähnliche Videos. Die erste Maus für den Computer war aus Holz und hatte nur eine Taste.' },
  { theme: 'ki', title: 'Wer baut eine KI?', body: 'Ein Programmierer baut das Programm für die KI. Er schreibt Code und testet ihn. Eine Programmiererin baut das Programm für die KI. Sie schreibt Code und testet ihn. Dazu kommen Menschen, die Daten sammeln und Beispiele beschriften. Sie schreiben zu jedem Bild, ob eine Katze oder ein Hund darauf ist. Ohne diese Arbeit lernt die KI nichts.' },

  { theme: 'schule', title: 'Mein Schultag', body: 'Heute ist Montag. Heute geht Mia um halb acht zur Schule. Heute schreibt die Klasse in der ersten Stunde einen Test. Danach liest Leon ein Buch. In der Pause spielt Leon Fußball, und Mia isst ihr Brot. Heute lernt die Klasse in Mathe Brüche. Nach der Schule läuft Mia nach Hause. Heute schläft sie eine Stunde, und am Abend übt sie Vokabeln.' },
  { theme: 'schule', title: 'Letzte Woche', body: 'Gestern war Montag. Gestern ging Mia um halb acht zur Schule. Gestern schrieb die Klasse in der ersten Stunde einen Test. Danach las Leon ein Buch. In der Pause spielte Leon Fußball, und Mia aß ihr Brot. Gestern lernte die Klasse in Mathe Brüche. Nach der Schule lief Mia nach Hause. Gestern schlief sie eine Stunde, und am Abend übte sie Vokabeln.' },
  { theme: 'schule', title: 'Unsere Lehrer', body: 'Herr Brandt ist unser Lehrer für Mathe. Der Lehrer erklärt die Aufgaben an der Tafel. Er ist streng, aber gerecht. Frau Yilmaz ist unsere Lehrerin für Deutsch. Die Lehrerin erklärt die Aufgaben an der Tafel. Sie ist streng, aber gerecht. Bei Fragen hilft der Lehrer gern. Bei Fragen hilft die Lehrerin auch gern.' },
  { theme: 'schule', title: 'Schüler und Schülerin', body: 'Leon ist ein Schüler der Klasse 6b. Der Schüler sitzt in der zweiten Reihe und liest gern vor. Mia ist eine Schülerin der Klasse 6b. Die Schülerin sitzt in der ersten Reihe und liest gern vor. Leon ist unser Klassensprecher, Mia ist unsere Klassensprecherin. Der Klassensprecher sammelt die Ideen der Klasse. Die Klassensprecherin sammelt die Wünsche der Klasse.' },
  { theme: 'schule', title: 'Lernen für den Test', body: 'Vor einem Test übt Mia jeden Tag ein bisschen. Sie lernt aus vielen Beispielen: Sie rechnet zehn Aufgaben und vergleicht sie mit den Lösungen. Am Anfang macht sie viele Fehler. Aus jedem Fehler lernt sie etwas. Wenn sie alles richtig hat, ist das ihre Belohnung. Wer jeden Tag übt, muss am Abend vor dem Test nicht alles auf einmal lernen.' },
  { theme: 'schule', title: 'Das Tablet im Unterricht', body: 'Früher schrieb jeder Schüler mit Kreide auf eine kleine Tafel. Heute schreibt er mit dem Stift auf dem Tablet. Früher suchte die Klasse Wörter im dicken Lexikon. Heute sucht sie im Internet. Mit dem Tablet machen wir Fotos von Experimenten und drehen kleine Filme. Die Lehrerin zeigt uns, wie man gute Quellen findet und Falschnachrichten erkennt.' },
  { theme: 'schule', title: 'Unser Schulhund', body: 'An unserer Schule gibt es einen Schulhund. Er heißt Bruno und kommt jeden Dienstag mit unserer Lehrerin in die Klasse. Bruno liegt ruhig unter dem Tisch, während wir lernen. Auch Bruno hat gelernt, durch Belohnung: Für jedes ruhige Liegen bekommt er ein Leckerli. Wenn jemand traurig ist, legt Bruno den Kopf auf sein Knie.' },
  { theme: 'schule', title: 'Projektwoche Weltall', body: 'In der Projektwoche hat unsere Klasse das Sonnensystem gebaut. Jede Gruppe bastelte einen Planeten aus Pappe. Leon baute den Jupiter, Mia baute den Saturn mit Ringen. Wir lernten, dass jeder Planet eine Kugel ist. Am Ende hängten wir die Planeten an die Decke. Die Sonne aus gelbem Papier hing in der Mitte.' },
  { theme: 'schule', title: 'Ausflug an die Ostsee', body: 'Letzten Sommer fuhr unsere Klasse an die Ostsee. Am Morgen ging die Klasse zum Strand und sammelte Muscheln. Damals fand Leon einen Krebs, Mia fand ein altes Fischernetz. Am Nachmittag besuchten wir den Leuchtturm. Ein Fischer erzählte uns, dass es immer weniger Fisch im Meer gibt. Am Abend fuhren wir müde, aber glücklich nach Hause.' },
  { theme: 'schule', title: 'Die Pause', body: 'Wenn es klingelt, ist Pause. Leon spielt Fußball auf dem Hof, Mia spielt Tischtennis. Der Hausmeister verkauft Brötchen. Die Hausmeisterin verkauft Kakao. Nach der Pause schließt der Hausmeister das Tor ab, und die Hausmeisterin schließt den Computerraum auf. Manche Kinder lesen in der Bücherei. Nach zwanzig Minuten klingelt es wieder.' },

  { theme: 'berufe', title: 'In einer Führungsposition', body: 'Die Chefin leitet eine große Firma. Sie entscheidet, was gebaut wird, und spricht mit Kunden aus aller Welt. Jeden Morgen bespricht die Chefin den Tag mit ihrem Sekretär. Der Sekretär schreibt ihre Termine auf und beantwortet E-Mails. Wenn die Chefin auf Reisen ist, hält er alles zusammen.' },
  { theme: 'berufe', title: 'Im Krankenhaus', body: 'Im Krankenhaus arbeitet die Ärztin. Sie untersucht die Patienten und entscheidet, welche Medizin sie brauchen. Der Krankenpfleger hilft ihr. Er misst Fieber, verteilt die Tabletten und tröstet die Kinder. Nachts hat die Ärztin oft Dienst, und der Krankenpfleger bleibt bei den Patienten.' },
  { theme: 'berufe', title: 'Frühdienst auf Station', body: 'Der Krankenpfleger beginnt seinen Dienst um sechs Uhr. Er weckt die Patienten, misst den Blutdruck und bringt das Frühstück. Wenn die Ärztin kommt, erzählt er ihr, wie die Nacht war. Ein Krankenpfleger braucht viel Geduld und ein gutes Herz. Er sagt: Mein Beruf ist anstrengend, aber ich helfe jeden Tag Menschen.' },
  { theme: 'berufe', title: 'Am Flughafen', body: 'Die Pilotin fliegt ein großes Flugzeug von Hamburg nach New York. Vor dem Start prüft sie alle Instrumente. Der Flugbegleiter begrüßt die Gäste und bringt Getränke. Während des Flugs spricht die Pilotin mit dem Tower. Nach acht Stunden landet sie sicher, und der Flugbegleiter verabschiedet die Gäste.' },
  { theme: 'berufe', title: 'Auf der Baustelle', body: 'Die Ingenieurin plant eine neue Brücke über den Fluss. Sie rechnet aus, wie viel Gewicht die Brücke tragen muss. Auf der Baustelle zeigt sie den Arbeitern ihre Pläne. Wenn ein Problem auftaucht, findet die Ingenieurin eine Lösung. Ihr Sekretär ruft die Firmen an und bestellt Stahl und Beton.' },
  { theme: 'berufe', title: 'Im Kindergarten', body: 'Im Kindergarten arbeitet der Erzieher. Er spielt mit den Kindern, liest Geschichten vor und tröstet, wenn jemand weint. Mittags isst der Erzieher mit den Kindern. Am Nachmittag bastelt er mit ihnen. Wenn die Eltern kommen, erzählt der Erzieher, was die Kinder gelernt haben.' },
  { theme: 'berufe', title: 'In der Softwarefirma', body: 'Die Informatikerin baut eine KI. Sie schreibt Programme und sammelt Daten. Jeden Tag testet sie, ob die KI aus den Beispielen richtig gelernt hat. Die Informatikerin leitet ein Team. Sie erklärt dem Team, wie das neuronale Netz funktioniert. Wenn die KI Fehler macht, sucht die Informatikerin den Grund.' },
  { theme: 'berufe', title: 'In der Forschung', body: 'Die Forscherin arbeitet an einem großen Teleskop. Sie beobachtet ferne Sterne und Planeten. In der Nacht macht sie Fotos vom Himmel. Am Tag wertet die Forscherin die Fotos aus. Ein Forscher aus Chile hilft ihr. Der Forscher ordnet die Daten. Die Forscherin hat einen neuen Mond am Jupiter entdeckt.' },
  { theme: 'berufe', title: 'Im Rathaus', body: 'Die Bürgermeisterin leitet die Stadt. Sie entscheidet mit dem Rat, wo eine neue Schule gebaut wird. Jeden Morgen bespricht die Bürgermeisterin die Termine mit ihrem Sekretär. Bei Festen hält sie eine Rede. Wenn die Menschen Sorgen haben, hört die Bürgermeisterin zu.' },
  { theme: 'berufe', title: 'Berufe-Tag', body: 'Am Berufe-Tag erzählen Eltern in der Schule von ihrer Arbeit. Mias Mutter ist Ärztin. Sie erzählt vom Krankenhaus. Leons Vater ist Krankenpfleger. Er erzählt von den Patienten. Mia sagt: Ich will Ärztin werden wie meine Mutter. Leon sagt: Ich will Krankenpfleger werden wie mein Vater. Später erzählt eine Pilotin vom Fliegen.' },

  { theme: 'meer', title: 'Die Ostsee', body: 'Die Ostsee ist ein Meer im Norden Europas. Das Wasser der Ostsee ist kühler und weniger salzig als der Ozean. An der Küste gibt es lange Strände mit weißem Sand. Kiel liegt direkt an der Ostsee. Vom Strand aus sieht man Schiffe, Segelboote und Möwen über den Wellen.' },
  { theme: 'meer', title: 'Der Hafen', body: 'Im Hafen legen große Schiffe an. Der Kapitän steuert die Fähre nach Norwegen. Er steht auf der Brücke und gibt Befehle. Die Kapitänin steuert das Containerschiff nach Schweden. Sie steht auf der Brücke und gibt Befehle. Matrosen laden Waren auf das Schiff. Möwen kreisen über dem Hafen und hoffen auf einen Fisch.' },
  { theme: 'meer', title: 'Fischer früher und heute', body: 'Früher fuhr der Fischer mit einem kleinen Holzboot auf das Meer. Er warf das Netz mit der Hand ins Wasser. Damals fing der Fischer viele Heringe und Dorsche. Heute fährt die Fischerin mit einem Boot mit Motor auf das Meer. Ein Kran zieht das Netz aus dem Wasser. Heute fängt die Fischerin viel weniger Fisch, weil es weniger Fisch im Meer gibt.' },
  { theme: 'meer', title: 'Der Leuchtturm', body: 'Ein Leuchtturm steht an der Küste und schickt in der Nacht helles Licht über das Meer. Das Licht zeigt dem Schiff den Weg in den Hafen. Früher wohnte ein Wärter im Leuchtturm. Er putzte jeden Tag die Lampe. Heute arbeitet das Licht automatisch. Bei Nebel und Sturm ist der Leuchtturm besonders wichtig.' },
  { theme: 'meer', title: 'Ebbe und Flut', body: 'An der Nordsee gibt es Ebbe und Flut. Bei Ebbe zieht sich das Meer zurück und man kann im Watt laufen. Bei Flut kommt das Wasser zurück und die Wellen erreichen wieder den Strand. Der Mond ist schuld an Ebbe und Flut, denn er zieht am Wasser der Erde. An der Ostsee merkt man davon fast nichts.' },
  { theme: 'meer', title: 'Den Weg finden', body: 'Früher fand der Kapitän den Weg mit den Sternen. In der Nacht suchte er den Polarstern am Himmel. Er wusste dann, wo Norden ist. Heute findet die Kapitänin den Weg mit einem Satelliten. Auf dem Bildschirm sieht sie genau, wo das Schiff ist. Trotzdem lernt jeder Kapitän noch, die Sterne zu lesen.' },
  { theme: 'meer', title: 'Tiere am Meer', body: 'Am Meer leben viele Tiere. Die Möwe fliegt über den Strand und frisst Fisch. Im flachen Wasser findet man Muscheln, Krebse und Quallen. Die Robbe liegt gern auf den Steinen und schläft in der Sonne. Im Zoo lernt der Seehund Kunststücke durch Belohnung: Für jeden Sprung bekommt er einen Fisch.' },
  { theme: 'meer', title: 'Die Kieler Woche', body: 'Die Kieler Woche ist das größte Segelfest der Welt. Im Juni kommen Segler aus vielen Ländern nach Kiel. Ein Segler steuert sein Boot mit dem Wind. Eine Seglerin steuert ihr Boot mit dem Wind. Auf der Ostsee segeln die Boote um die Wette. Am letzten Abend leuchtet ein großes Feuerwerk über dem Wasser.' },
  { theme: 'meer', title: 'Plastik im Meer', body: 'Das Meer ist in Gefahr. Plastik schwimmt im Wasser und landet am Strand. Die Möwe verwechselt Plastik mit Futter. Ein altes Netz treibt im Wasser, und Fische verfangen sich darin. Deshalb sammeln viele Menschen Müll an der Küste. Auch jeder Fischer bringt sein altes Netz zurück in den Hafen.' }
];

const OWN_KEY = 'wortwelten-v2-eigene-texte';
/* Änderungen an den mitgelieferten Texten: { 'base:3': { title, body } }.
   Die Originale in TEXTS bleiben unangetastet, damit "Original wiederherstellen" immer geht.
   v3: neue Textwelten (14.10.2026) — die Nummern zeigen auf andere Texte, alte Änderungen gelten nicht mehr. */
const EDIT_KEY = 'wortwelten-v3-text-bearbeitet';

function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ohne Speicher geht es auch */ }
}

const Corpus = (() => {
  let own = (() => {
    const v = loadJSON(OWN_KEY, []);
    return Array.isArray(v) ? v.filter(x => x && x.body) : [];
  })();
  let edits = (() => {
    const v = loadJSON(EDIT_KEY, {});
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  })();

  function allTexts() {
    const base = TEXTS.map((t, i) => {
      const id = 'base:' + i;
      const e = edits[id];
      return e
        ? { ...t, id, own: false, title: e.title || t.title, body: e.body || t.body, edited: true }
        : { ...t, id, own: false, edited: false };
    });
    return base.concat(own.map((o, i) => ({ ...o, id: 'own:' + i, own: true, edited: false })));
  }
  function addOwn(text) {
    own.push(text);
    saveJSON(OWN_KEY, own);
  }
  function removeOwn(id) {
    const i = Number(id.split(':')[1]);
    own.splice(i, 1);
    saveJSON(OWN_KEY, own);
  }
  /* Texte bearbeiten: eigene direkt, mitgelieferte als Änderung obendrüber. */
  function updateText(id, patch) {
    if (id.startsWith('own:')) {
      const i = Number(id.split(':')[1]);
      if (!own[i]) return;
      if (patch.title != null) own[i].title = patch.title;
      if (patch.body != null) own[i].body = patch.body;
      saveJSON(OWN_KEY, own);
      return;
    }
    const i = Number(id.split(':')[1]);
    const orig = TEXTS[i];
    if (!orig) return;
    const cur = edits[id] || {};
    const next = {
      title: patch.title != null ? patch.title : (cur.title || orig.title),
      body: patch.body != null ? patch.body : (cur.body || orig.body)
    };
    if (next.title === orig.title && next.body === orig.body) delete edits[id];
    else edits[id] = next;
    saveJSON(EDIT_KEY, edits);
  }
  function resetText(id) {
    if (!edits[id]) return;
    delete edits[id];
    saveJSON(EDIT_KEY, edits);
  }
  function originalOf(id) {
    if (!id.startsWith('base:')) return null;
    return TEXTS[Number(id.split(':')[1])] || null;
  }
  return { allTexts, addOwn, removeOwn, updateText, resetText, originalOf };
})();
