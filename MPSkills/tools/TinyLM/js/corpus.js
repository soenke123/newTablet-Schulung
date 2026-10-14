/* Textwelten: reine Daten + eigene Texte (localStorage). Keine Auswahl-/Modell-Logik hier. */
const THEMES = [
  { id: 'tiere', name: 'Haustiere' },
  { id: 'meer', name: 'Meer und Küste' },
  { id: 'weltall', name: 'Weltall' },
  { id: 'computer', name: 'Computer' }
];
const THEME_NAME = { tiere: 'Haustiere', meer: 'Meer und Küste', weltall: 'Weltall', computer: 'Computer', eigen: 'Eigene Texte' };
const THEME_ORDER = ['tiere', 'meer', 'weltall', 'computer', 'eigen'];

const TEXTS = [
  { theme: 'tiere', title: 'Der Hund', body: 'Der Hund ist das beliebteste Haustier in Deutschland. Ein Hund braucht jeden Tag Bewegung. Er will spazieren gehen, rennen und spielen. Ein Hund bellt, wenn ein Fremder an die Tür kommt. Der Hund frisst Futter aus dem Napf und trinkt viel Wasser. Ein junger Hund heißt Welpe. Ein Welpe muss viel lernen: sitzen, warten und an der Leine laufen. Wer einen Hund hat, muss Zeit haben und geduldig sein.' },
  { theme: 'tiere', title: 'Die Katze', body: 'Die Katze ist ein Haustier, das gern allein ist. Eine Katze schläft viele Stunden am Tag, am liebsten auf dem Sofa oder in der Sonne. Die Katze putzt ihr Fell mit der Zunge. Sie frisst Futter aus dem Napf und trinkt Wasser. Eine junge Katze heißt Kätzchen. Die Katze jagt gern eine Maus oder spielt mit einem Ball. Wenn eine Katze zufrieden ist, schnurrt sie leise.' },
  { theme: 'tiere', title: 'Das Kaninchen', body: 'Das Kaninchen ist ein kleines Haustier mit langen Ohren und weichem Fell. Ein Kaninchen frisst Heu, Gras, Möhren und frisches Gemüse. Ein Kaninchen lebt nicht gern allein, es braucht einen Partner. Im Stall braucht das Kaninchen viel Platz, damit es hoppeln und springen kann. Ein Kaninchen nagt gern an Holz, damit die Zähne kurz bleiben. Kinder müssen lernen, ein Kaninchen vorsichtig zu streicheln.' },
  { theme: 'tiere', title: 'Der Hamster', body: 'Der Hamster ist ein kleines Haustier, das nachts wach ist. Am Tag schläft der Hamster in seinem Häuschen. In der Nacht rennt er im Laufrad und sucht Futter. Ein Hamster sammelt Körner in seinen Backen und versteckt sie im Käfig. Der Hamster hat weiches Fell und kleine Pfoten. Weil ein Hamster nachts laut ist, sollte der Käfig nicht im Schlafzimmer stehen.' },
  { theme: 'tiere', title: 'Beim Tierarzt', body: 'Wenn ein Haustier krank ist, muss es zum Tierarzt. Der Tierarzt untersucht den Hund, die Katze oder das Kaninchen. Er hört das Herz ab, schaut in die Ohren und prüft das Fell. Manchmal bekommt das Tier eine Spritze gegen Krankheiten. Viele Hunde haben Angst vor dem Tierarzt. Ein Leckerli hilft, damit der Hund ruhig bleibt. Einmal im Jahr sollte jedes Haustier zum Tierarzt gehen.' },
  { theme: 'tiere', title: 'Futter und Pflege', body: 'Jedes Haustier braucht das richtige Futter. Ein Hund frisst Fleisch und Trockenfutter, eine Katze frisst Fisch und Fleisch. Ein Kaninchen frisst Heu und Gemüse, ein Hamster frisst Körner. Jedes Tier braucht jeden Tag frisches Wasser im Napf. Zur Pflege gehört auch, das Fell zu bürsten und den Käfig oder den Stall sauber zu machen. Wer ein Haustier hat, trägt Verantwortung.' },
  { theme: 'tiere', title: 'Die Maus als Haustier', body: 'Eine Maus ist ein winziges Haustier mit langem Schwanz und weichem Fell. Die Maus lebt in einer Gruppe und braucht einen großen Käfig. Eine Maus frisst Körner, Samen und ein wenig Obst. Die Maus ist schnell, klettert gern und nagt an allem. In der Natur jagen die Katze und die Eule die Maus. Als Haustier wird eine Maus zahm, wenn man sie jeden Tag vorsichtig füttert.' },
  { theme: 'tiere', title: 'Fische im Aquarium', body: 'Viele Menschen halten einen Fisch im Aquarium. Ein Aquarium ist ein Kasten aus Glas mit Wasser, Pflanzen und Steinen. Der Fisch braucht sauberes Wasser und die richtige Temperatur. Man füttert ihn jeden Tag mit ein wenig Futter. Der Goldfisch ist ein beliebtes Haustier für Kinder. Einen Fisch kann man nicht streicheln, aber es ist spannend, ihm beim Schwimmen zuzusehen.' },
  { theme: 'tiere', title: 'Hund und Katze', body: 'Hund und Katze gelten oft als Feinde, aber sie können Freunde werden. Wenn ein Welpe und ein Kätzchen zusammen aufwachsen, spielen sie oft miteinander. Der Hund bellt und wedelt mit dem Schwanz, die Katze schnurrt und schläft. Jedes Haustier braucht sein eigenes Futter und einen eigenen Napf. Eine Katze braucht einen Platz, an dem der Hund sie nicht stören kann.' },
  { theme: 'tiere', title: 'Spazieren mit dem Hund', body: 'Ein Hund muss mehrmals am Tag spazieren gehen. Im Park darf der Hund oft ohne Leine rennen und mit einem anderen Hund spielen. Er schnüffelt an Bäumen und jagt den Ball. Nach dem Spaziergang hat der Hund Hunger und Durst. Er frisst sein Futter und schläft danach in seinem Korb. Ein müder Hund ist ein glücklicher Hund.' },
  { theme: 'tiere', title: 'Ein Haustier aussuchen', body: 'Bevor man ein Haustier kauft, sollte man gut nachdenken. Ein Hund braucht viel Zeit und Bewegung. Eine Katze ist selbstständiger. Ein Kaninchen oder ein Hamster passt auch in eine kleine Wohnung. Wichtig ist: Das Tier braucht Futter, Pflege und manchmal den Tierarzt. Viele Tiere warten im Tierheim auf ein neues Zuhause. Dort kann man einen Hund oder eine Katze kennenlernen.' },
  { theme: 'tiere', title: 'Das Tierheim', body: 'Im Tierheim lebt jedes Tier, das kein Zuhause hat: der Hund, die Katze, das Kaninchen und viele andere. Die Pfleger füttern die Tiere, gehen mit dem Hund spazieren und bürsten das Fell der Katze. Viele Kinder helfen am Wochenende im Tierheim. Sie spielen mit dem Welpen und streicheln das Kätzchen. Wenn eine Familie ein Tier aufnimmt, bekommt es ein neues Zuhause.' },

  { theme: 'meer', title: 'Die Ostsee', body: 'Die Ostsee ist ein Meer im Norden Europas. Das Wasser der Ostsee ist kühler und weniger salzig als der Ozean. An der Küste gibt es lange Strände mit weißem Sand. Im Sommer baden viele Menschen im Meer. Kiel liegt direkt an der Ostsee. Vom Strand aus sieht man Schiffe, Segelboote und Möwen über den Wellen.' },
  { theme: 'meer', title: 'Segeln', body: 'Segeln ist ein beliebter Sport an der Küste. Ein Segelboot fährt nur mit der Kraft vom Wind. Das Segel fängt den Wind ein und das Boot gleitet über das Wasser. Bei starkem Wind werden die Wellen hoch und das Segeln wird schwierig. In Kiel findet jedes Jahr die Kieler Woche statt. Dann segeln tausende Boote auf der Ostsee.' },
  { theme: 'meer', title: 'Der Hafen', body: 'Im Hafen legen große Schiffe an. Die Fähre fährt von Kiel nach Norwegen und Schweden. Matrosen laden Waren auf das Schiff und wieder herunter. Im Hafen liegen auch kleine Fischerboote. Am Morgen kommen die Fischer vom Meer zurück und bringen frischen Fisch. Möwen kreisen über dem Hafen und hoffen auf einen Fisch.' },
  { theme: 'meer', title: 'Der Leuchtturm', body: 'Ein Leuchtturm steht an der Küste und schickt in der Nacht helles Licht über das Meer. Das Licht zeigt dem Schiff den Weg in den Hafen. Jeder Leuchtturm blinkt in einem eigenen Rhythmus, damit die Matrosen ihn erkennen. Früher wohnte ein Wärter im Leuchtturm. Heute arbeitet das Licht automatisch. Bei Nebel und Sturm ist der Leuchtturm besonders wichtig.' },
  { theme: 'meer', title: 'Fischer', body: 'Fischer fahren früh am Morgen mit dem Boot auf das Meer hinaus. Sie werfen ein großes Netz ins Wasser und warten. Im Netz fangen sich Heringe, Dorsche und andere Fische. Bei Sturm und hohen Wellen bleiben die Fischer im Hafen. Der Fang wird im Hafen verkauft. Viele Fischer an der Ostsee haben Sorgen, weil es immer weniger Fisch im Meer gibt.' },
  { theme: 'meer', title: 'Tiere am Meer', body: 'Am Meer leben viele Tiere. Die Möwe fliegt über den Strand und frisst Fisch. Im flachen Wasser findet man Muscheln, Krebse und Quallen. Manchmal liegt ein Seestern im Sand. In der Ostsee leben sogar Schweinswale und Robben. Die Robbe liegt gern auf den Steinen an der Küste und schläft in der Sonne.' },
  { theme: 'meer', title: 'Ebbe und Flut', body: 'An der Nordsee gibt es Ebbe und Flut. Bei Ebbe zieht sich das Meer zurück und man kann im Watt laufen. Bei Flut kommt das Wasser zurück und die Wellen erreichen wieder den Strand. Der Mond ist schuld an Ebbe und Flut, denn er zieht am Wasser der Meere. An der Ostsee merkt man davon fast nichts.' },
  { theme: 'meer', title: 'Sturm an der Küste', body: 'Bei Sturm wird das Meer wild. Der Wind peitscht die Wellen gegen die Küste und den Strand. Das Schiff bleibt im Hafen und das Segelboot wird festgebunden. Der Leuchtturm schickt sein Licht durch Regen und Nebel. Nach dem Sturm findet man am Strand Muscheln, Holz und manchmal ein altes Netz.' },
  { theme: 'meer', title: 'Ein Tag am Strand', body: 'Im Sommer fahren viele Familien an den Strand. Die Kinder bauen Burgen aus Sand und springen in die Wellen. Die Sonne scheint und das Meer glitzert. Die Möwe wartet darauf, dass jemand ein Brötchen fallen lässt. Am Abend sieht man die Segelboote in den Hafen zurückfahren.' },
  { theme: 'meer', title: 'Schiffe', body: 'Auf dem Meer fahren viele Arten von Schiffen. Ein Segelboot fährt mit Wind, ein großes Schiff hat einen starken Motor. Das Containerschiff bringt Waren über den Ozean. Die Fähre bringt Menschen und Autos von Hafen zu Hafen. Früher fanden Matrosen den Weg nach den Sternen. Heute hilft ein Satellit, den Weg über das Meer zu finden.' },
  { theme: 'meer', title: 'Die Kieler Woche', body: 'Die Kieler Woche ist das größte Segelfest der Welt. Im Juni kommen Segler aus vielen Ländern nach Kiel. Auf der Ostsee finden Regatten statt, bei denen die Boote um die Wette segeln. Am Hafen gibt es Musik, Essen und viele Menschen. Am letzten Abend leuchtet ein großes Feuerwerk über dem Wasser.' },
  { theme: 'meer', title: 'Das Meer schützen', body: 'Das Meer ist in Gefahr. Plastik schwimmt im Wasser und landet am Strand. Der Fisch und die Möwe verwechseln Plastik mit Futter. Deshalb sammeln viele Menschen Müll an der Küste. Auch die Fischer helfen und bringen ein altes Netz zurück in den Hafen. Ein sauberes Meer ist wichtig für alle Tiere und Menschen.' },

  { theme: 'weltall', title: 'Die Sonne', body: 'Die Sonne ist ein Stern. Sie ist eine riesige Kugel aus heißem Gas. Die Sonne schickt Licht und Wärme zur Erde. Ohne die Sonne gäbe es kein Leben auf der Erde. Jeder Planet kreist um die Sonne. Die Erde braucht ein Jahr für eine Runde. Man darf niemals direkt in die Sonne schauen, sonst werden die Augen verletzt.' },
  { theme: 'weltall', title: 'Der Mond', body: 'Der Mond kreist um die Erde. Er leuchtet nicht selbst, sondern wird von der Sonne angestrahlt. Deshalb sehen wir manchmal einen vollen Mond und manchmal nur eine schmale Sichel. Auf dem Mond gibt es keine Luft und kein Wasser. Im Jahr 1969 landeten die ersten Astronauten auf dem Mond. Der Mond zieht am Wasser der Erde und macht Ebbe und Flut.' },
  { theme: 'weltall', title: 'Die Planeten', body: 'In unserem Sonnensystem gibt es acht Planeten. Merkur ist der Sonne am nächsten. Danach kommen Venus, Erde und Mars. Weiter draußen kreisen die großen Planeten Jupiter, Saturn, Uranus und Neptun. Saturn hat schöne Ringe aus Eis und Gestein. Jupiter ist der größte Planet. Jeder Planet kreist auf einer Umlaufbahn um die Sonne.' },
  { theme: 'weltall', title: 'Der Mars', body: 'Der Mars ist der rote Planet. Seine Farbe kommt von rostigem Staub. Auf dem Mars ist es sehr kalt und die Luft ist dünn. Forscher schicken einen Roboter auf den Mars, der dort fährt und Steine untersucht. Vielleicht gab es auf dem Mars früher Wasser. Eines Tages wollen Astronauten mit einer Rakete zum Mars fliegen.' },
  { theme: 'weltall', title: 'Raketen', body: 'Eine Rakete bringt Astronauten und Satelliten ins Weltall. Beim Start verbrennt die Rakete viel Treibstoff und schießt mit lautem Donner in den Himmel. Sie muss sehr schnell sein, um die Erde zu verlassen. Nach wenigen Minuten ist die Rakete im Weltall. Manche Rakete landet danach wieder und kann noch einmal fliegen.' },
  { theme: 'weltall', title: 'Astronauten', body: 'Astronauten sind Menschen, die ins Weltall fliegen. Sie trainieren viele Jahre für ihre Mission. Im Weltall schweben die Astronauten, weil sie schwerelos sind. Sie tragen einen Raumanzug, wenn sie außerhalb der Raumstation arbeiten. Astronauten essen aus Tüten und schlafen in Schlafsäcken an der Wand. Von oben sehen sie die Erde als blaue Kugel.' },
  { theme: 'weltall', title: 'Die Raumstation', body: 'Die Internationale Raumstation kreist in 400 Kilometern Höhe um die Erde. Sie fliegt in 90 Minuten einmal um die Erde herum. Auf der Raumstation leben und arbeiten Astronauten aus vielen Ländern. Sie machen Experimente und beobachten die Erde. Eine Rakete bringt Essen, Wasser und neue Astronauten zur Raumstation.' },
  { theme: 'weltall', title: 'Sterne', body: 'In einer klaren Nacht sieht man tausende Sterne am Himmel. Jeder Stern ist eine Sonne, aber sehr weit weg. Das Licht der Sterne ist oft viele Jahre unterwegs, bis es die Erde erreicht. Manche Sterne bilden Bilder am Himmel, die man Sternbilder nennt. Der Polarstern zeigt nach Norden. Früher fanden Matrosen mit seiner Hilfe den Weg über das Meer.' },
  { theme: 'weltall', title: 'Das Teleskop', body: 'Mit einem Teleskop kann man weit in das Weltall schauen. Ein Teleskop sammelt Licht und macht ferne Sterne und Planeten sichtbar. Mit einem kleinen Teleskop sieht man die Krater auf dem Mond und die Ringe des Saturn. Ein großes Teleskop steht auf einem Berg oder fliegt als Satellit um die Erde. Es zeigt Galaxien, die Milliarden Sterne haben.' },
  { theme: 'weltall', title: 'Satelliten', body: 'Ein Satellit kreist auf einer Umlaufbahn um die Erde. Eine Rakete bringt ihn ins Weltall. Der Satellit macht Fotos vom Wetter und sendet Fernsehen und Internet zur Erde. Ein Navigationssatellit zeigt dem Auto und dem Schiff den Weg. Tausende Satelliten fliegen heute um die Erde. Ein kaputter Satellit wird zu Weltraumschrott.' },
  { theme: 'weltall', title: 'Die Erde im Weltall', body: 'Die Erde ist der dritte Planet von der Sonne. Sie ist der einzige Planet, auf dem wir Leben kennen. Die Erde dreht sich einmal am Tag um sich selbst, so entstehen Tag und Nacht. Der Mond kreist um die Erde. Aus dem Weltall sieht die Erde blau aus, weil sie zum größten Teil mit Wasser und Meer bedeckt ist.' },
  { theme: 'weltall', title: 'Schwarze Löcher', body: 'Ein schwarzes Loch entsteht, wenn ein riesiger Stern am Ende seines Lebens zusammenfällt. Seine Anziehungskraft ist so stark, dass nicht einmal Licht entkommen kann. Deshalb kann man ein schwarzes Loch nicht direkt sehen. Forscher beobachten mit dem Teleskop, wie Sterne und Gas um das schwarze Loch kreisen. In der Mitte unserer Galaxie gibt es ein riesiges schwarzes Loch.' },

  { theme: 'computer', title: 'Der Computer', body: 'Ein Computer ist eine Maschine, die Daten verarbeitet. Er besteht aus Prozessor, Speicher, Bildschirm, Tastatur und Maus. Der Prozessor rechnet sehr schnell, Milliarden Rechenschritte in einer Sekunde. Im Speicher liegen das Programm und die Daten. Mit der Tastatur tippt man Text, mit der Maus klickt man auf dem Bildschirm.' },
  { theme: 'computer', title: 'Programme', body: 'Ein Programm ist eine Liste von Befehlen für den Computer. Programmierer schreiben ein Programm in einer Programmiersprache wie Python oder Java. Der Computer führt die Befehle Schritt für Schritt aus. Ein Fehler im Programm heißt Bug. Wer programmieren lernt, muss genau denken und geduldig nach Fehlern suchen.' },
  { theme: 'computer', title: 'Das Internet', body: 'Das Internet ist ein riesiges Netz aus Computern auf der ganzen Welt. Über das Netz schickt der Computer Daten hin und her. Wenn man eine Webseite öffnet, kommen die Daten von einem Server. Ein Kabel unter dem Meer verbindet die Kontinente. Auch ein Satellit hilft, das Internet in entfernte Gegenden zu bringen.' },
  { theme: 'computer', title: 'Maus und Tastatur', body: 'Mit Maus und Tastatur steuert man einen Computer. Die Maus bewegt den Zeiger über den Bildschirm. Mit einem Klick öffnet man ein Programm oder eine Datei. Auf der Tastatur tippt man Buchstaben und Zahlen. Die erste Maus für den Computer war aus Holz und hatte nur eine Taste. Heute gibt es eine Maus ohne Kabel.' },
  { theme: 'computer', title: 'Daten speichern', body: 'Ein Computer speichert Daten als Nullen und Einsen. Fotos, Musik, Texte und Programme sind alles Daten. Die Daten liegen auf einer Festplatte, auf einem Stick oder in der Cloud. Wichtige Daten sollte man regelmäßig sichern, damit sie bei einem Fehler nicht verloren gehen. Eine Datei hat einen Namen und ein Format.' },
  { theme: 'computer', title: 'Algorithmen', body: 'Ein Algorithmus ist eine genaue Anleitung, um ein Problem zu lösen. Ein Kochrezept ist auch eine Art Algorithmus. Der Computer braucht einen Algorithmus, um zum Beispiel Daten zu sortieren oder den kürzesten Weg zu finden. Ein Programmierer überlegt sich zuerst den Algorithmus und schreibt dann das Programm.' },
  { theme: 'computer', title: 'Künstliche Intelligenz', body: 'Künstliche Intelligenz, kurz KI, ist ein Programm, das aus Daten lernt. Eine KI bekommt sehr viele Beispiele und findet darin Muster. So lernt sie, Bilder zu erkennen oder Texte zu schreiben. Ein Sprachmodell sagt das nächste Wort voraus. Eine KI kann Fehler machen, weil sie nur weiß, was in ihren Daten steht.' },
  { theme: 'computer', title: 'Sicherheit im Netz', body: 'Im Internet muss man auf seine Daten aufpassen. Ein sicheres Passwort ist lang und enthält Zahlen und Zeichen. Man sollte nicht auf jeden Link klicken, denn manche Webseite verbreitet einen Virus. Ein Virus ist ein schädliches Programm, das den Computer angreift. Ein Update schließt Lücken und macht den Computer sicherer.' },
  { theme: 'computer', title: 'Der Prozessor', body: 'Der Prozessor ist das Gehirn des Computers. Er rechnet mit Nullen und Einsen und führt die Befehle eines Programms aus. Ein moderner Prozessor schafft Milliarden Rechenschritte in einer Sekunde. Dabei wird er heiß, deshalb braucht der Computer einen Lüfter. Auch im Handy, im Auto und in der Waschmaschine steckt ein Prozessor.' },
  { theme: 'computer', title: 'Spiele programmieren', body: 'Viele Schüler wollen ein eigenes Spiel programmieren. Dafür braucht man ein Programm, Grafiken und gute Ideen. Im Spiel bewegt sich eine Figur über den Bildschirm, wenn man eine Taste drückt. Der Computer prüft immer wieder, ob die Figur ein Hindernis berührt. Mit Scratch oder Python kann man das erste Spiel programmieren.' },
  { theme: 'computer', title: 'Das Handy', body: 'Ein Handy ist ein kleiner Computer für die Hosentasche. Es hat einen Prozessor, Speicher und einen Bildschirm, den man mit dem Finger bedient. Über das Netz verbindet sich das Handy mit dem Internet. Eine App ist ein Programm für das Handy. Viele Daten auf dem Handy sind privat, deshalb braucht es ein gutes Passwort.' },
  { theme: 'computer', title: 'Roboter', body: 'Ein Roboter ist eine Maschine, die von einem Computer gesteuert wird. Sensoren messen, was um den Roboter herum passiert. Ein Programm entscheidet dann, wie sich der Roboter bewegt. In der Fabrik baut ein Roboter Autos zusammen. Auf dem Mars fährt ein Roboter und untersucht Steine für die Forscher auf der Erde.' }
];

const OWN_KEY = 'wortwelten-v2-eigene-texte';
/* Änderungen an den mitgelieferten Texten: { 'base:3': { title, body } }.
   Die Originale in TEXTS bleiben unangetastet, damit "Original wiederherstellen" immer geht. */
const EDIT_KEY = 'wortwelten-v2-text-bearbeitet';

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
