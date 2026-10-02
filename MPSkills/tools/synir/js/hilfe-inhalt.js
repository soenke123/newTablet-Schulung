/* ══════════════════════════════════════════════════════════════
   SYNIR — hilfe-inhalt.js  ·  Der Text der Hilfe für Lehrkräfte
   ══════════════════════════════════════════════════════════════
   Nur Inhalt, keine Logik (die steht in js/hilfe.js). Ein Kapitel
   hat Abschnitte; jeder Abschnitt ist genau EIN Ding der Oberfläche
   — ein Gerät, ein Fenster, ein Programm, ein Werkzeug. Klickt die
   Lehrkraft bei offener Hilfe auf so ein Ding, springt die Hilfe
   zu seinem Abschnitt (die Zuordnung steht in hilfe.js, `zielVon`).

   Felder eines Abschnitts (alle bis auf id/titel/kurz freiwillig):
     kurz      ein bis zwei Sätze: Was ist das?
     bild      Name in hilfe/ (ohne .webp), `unter` ist die Bildzeile
     bild2     ein zweites Bild, `unter2`
     schritte  „So geht's" — nummerierte Handgriffe
     wissen    „Gut zu wissen" — Aufzählung
     tabelle   { kopf: [...], zeilen: [[...], ...] }
     tipp      „Im Unterricht" — ein Kasten
     html      freier Inhalt (z. B. das Pult im Raum)
     such      weitere Suchwörter (Synonyme, Fachwörter)
     zeigen    was der Knopf „Zeigen" auf dem Bildschirm umrandet:
               CSS-Selektoren und/oder `geraet:<art>`

   Die Bilder macht tests/hilfe-bilder.js aus der echten Oberfläche.
   Schreibweise: Sie-Form, kurze Sätze, Wörter so, wie sie auf dem
   Bildschirm stehen (kursiv), Tasten als <kbd>.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const K = (id, titel, abschnitte) => ({ id, titel, abschnitte });
  const A = (id, titel, o) => Object.assign({ id, titel }, o);

  window.SynirHilfeInhalt = [

    /* ═══ 1 · Erste Schritte ═════════════════════════════════════ */
    K('start', 'Erste Schritte', [
      A('ueberblick', 'SYNIR auf einen Blick', {
        kurz: 'SYNIR ist ein Netzwerksimulator im Browser. Die Klasse baut Netze aus Geräten und Kabeln, stellt Adressen ein '
          + 'und sieht dann zu, wie Pakete wirklich laufen — vom Ping bis zur verschlüsselten Webseite. Das Bedienmodell folgt '
          + '<em>Filius</em>: wer Filius kennt, findet sich sofort zurecht.',
        bild: 'ueberblick', unter: 'Ein Heimnetz im Entwurfsmodus (Szenario II.3)',
        wissen: [
          '<b>Oben:</b> Logo · Umschalter <em>Entwurf / Aktion</em> · in der Aktion die Uhr · rechts <em>Aufgabe</em>, <em>Datei</em>, <em>Ansicht &amp; Tools</em> und diese Hilfe.',
          '<b>Links:</b> die Geräteleiste — von dort zieht man Geräte auf die Fläche.',
          '<b>Mitte:</b> die Fläche mit dem Netz. Jedes Gerät zeigt Kürzel (E1, R1 …) und Adresse.',
          '<b>Unten</b> (bei Bedarf): Mitschnitt und Weiterleitungstabellen.',
          'Alles wird automatisch im Browser gespeichert. Es gibt keine Konten und keinen Server — außer im Klassenraum von MPSkills.'
        ],
        tipp: 'Lassen Sie diese Hilfe offen und klicken Sie links auf irgendein Gerät, Fenster oder einen Knopf: die Anleitung springt '
          + 'genau zu der Stelle, die es erklärt.',
        such: 'start anfang einführung oberfläche filius überblick',
        zeigen: ['.top', '#rail']
      }),
      A('modi', 'Entwurf und Aktion', {
        kurz: 'SYNIR hat zwei Modi. Im <b>Entwurf</b> wird gebaut und eingestellt, die Uhr steht. In der <b>Aktion</b> läuft die Uhr, '
          + 'Pakete fliegen, und ein Tipp auf ein Gerät öffnet dessen Bildschirm.',
        bild: 'modus-aktion', unter: 'Aktionsmodus: der Schalter ist grün, daneben die Uhr',
        schritte: [
          'Oben in der Mitte auf <em>Entwurf</em> oder <em>Aktion</em> tippen.',
          'Im Entwurf: Geräte anlegen, verkabeln, im Kärtchen Adressen eintragen.',
          'In der Aktion: Geräte antippen, Programme starten (Terminal, Browser …), zusehen.'
        ],
        wissen: [
          'Den Modus erkennt man ohne Hinsehen auf den Schalter: <b>Indigo</b> + Raster auf dem Tisch = Entwurf, <b>Mint/Grün</b> = Aktion.',
          'Die Geräteleiste klappt in der Aktion von selbst ein und im Entwurf wieder auf.',
          'Jeder Wechsel in die Aktion startet das Netz neu: DHCP vergibt die Adressen neu, gelernte Tabellen beginnen leer.',
          'Router, Heimrouter und Switch werden <b>nur im Entwurf</b> eingestellt; in der Aktion zeigen sie eine Leseansicht.'
        ],
        tipp: '„Warum passiert nichts, wenn ich auf den Rechner klicke?“ — fast immer steht SYNIR noch im Entwurf.',
        such: 'modus entwurfsmodus aktionsmodus simulation starten bauen testen umschalten',
        zeigen: ['#modus']
      }),
      A('uhr', 'Uhr und Tempo', {
        kurz: 'In der Aktion läuft eine simulierte Uhr. Sie lässt sich anhalten, in Einzelschritten weiterdrehen und verlangsamen — '
          + 'so kann die Klasse jedem einzelnen Paket folgen.',
        bild: 'uhr', unter: 'Pause · Einzelschritt · von vorn · Tempo',
        tabelle: {
          kopf: ['Knopf', 'Wirkung'],
          zeilen: [
            ['❚❚ / ▶', 'Uhr anhalten bzw. weiterlaufen lassen (auch <kbd>Leertaste</kbd>)'],
            ['›', 'genau ein Ereignis weiter (auch <kbd>.</kbd>)'],
            ['↺', 'von vorn: Uhr auf null, Gelerntes und Mitschnitt leer'],
            ['Regler', 'Zeitlupe · langsam · <b>normal</b> · schnell · Turbo']
          ]
        },
        wissen: [
          'Bei <em>normal</em> braucht ein Paket <b>1 Sekunde je Kabel</b>, bei <em>Zeitlupe</em> 4 s, bei <em>Turbo</em> 50 ms.',
          'Das Tempo ändert nichts am Ergebnis — nur daran, wie schnell man zusieht.',
          '<em>Turbo</em> eignet sich, um Tabellen (ARP, RIP, DHCP) schnell zu füllen; zum Erklären <em>Zeitlupe</em> oder Einzelschritt.'
        ],
        such: 'zeit pause anhalten schritt einzelschritt geschwindigkeit tempo zeitlupe turbo reset neustart',
        zeigen: ['#play', '#stepBtn', '#resetBtn', '.speedbox']
      }),
      A('flaeche', 'Die Fläche: verschieben und zoomen', {
        kurz: 'Die Fläche ist größer als das Fenster; man sieht einen Ausschnitt. Er lässt sich verschieben und zoomen — für den Beamer '
          + 'bis 250 %.',
        bild: 'zoom', unter: 'Unten in der Geräteleiste: größer, kleiner, Prozent, Einpassen',
        schritte: [
          '<b>Verschieben:</b> auf der leeren Fläche ziehen (Maus oder Finger).',
          '<b>Zoomen:</b> <kbd>Strg</kbd> + Mausrad, zwei Finger, oder die Lupen unten links.',
          '<b>Einpassen</b> holt alle Geräte ins Bild; ein Tipp auf die Prozentzahl holt den Startausschnitt.'
        ],
        wissen: [
          'Ohne eigenes Zoomen passt sich der Ausschnitt jeder Fenstergröße selbst an.',
          'Auch möglich: <kbd>Alt</kbd> + Ziehen oder Ziehen mit gedrückter mittlerer Maustaste.'
        ],
        such: 'zoom vergrößern verkleinern einpassen ausschnitt verschieben scrollen beamer groß',
        zeigen: ['.rail-zoom']
      }),
      A('bearbeiten', 'Auswählen, kopieren, rückgängig', {
        kurz: 'SYNIR kennt die Bürokürzel aus jedem Textprogramm — ohne eigene Knöpfe dafür. Jeder Fehler lässt sich zurücknehmen.',
        tabelle: {
          kopf: ['Geste / Taste', 'Wirkung'],
          zeilen: [
            ['Tippen auf ein Gerät', 'sein Fenster öffnen · noch einmal tippen: schließen'],
            ['Ziehen eines Geräts', 'verschieben (nur im Entwurf)'],
            ['<kbd>Strg</kbd> + Klick', 'Gerät zur Auswahl nehmen — und sein Kärtchen öffnen'],
            ['<kbd>Strg</kbd> + Ziehen', 'Rechteck aufziehen, alles darin markieren'],
            ['<kbd>Strg</kbd>+<kbd>A</kbd>', 'alle Geräte markieren'],
            ['<kbd>Strg</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd>', 'kopieren, ausschneiden, einfügen'],
            ['<kbd>Strg</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd>', 'rückgängig / wiederholen'],
            ['<kbd>Entf</kbd>', 'Markierung löschen (ohne Rückfrage)'],
            ['<kbd>Esc</kbd>', 'Fenster und Kärtchen schließen']
          ]
        },
        wissen: [
          'Ein markierter Verband wird gemeinsam verschoben, die Abstände bleiben.',
          'Eingefügte Geräte bekommen <b>neue MAC-Adressen</b>; die IP-Adresse kommt mit — die Kurzmeldung sagt es.',
          'Steht der Cursor in einem Eingabefeld, gehören alle Tasten dem Feld (<kbd>Entf</kbd> löscht dann ein Zeichen, kein Gerät).',
          'Auf dem Tablet: einen Knopf ½ Sekunde festhalten zeigt seine Erklärung.'
        ],
        such: 'markieren auswahl mehrfachauswahl kopieren einfügen ausschneiden löschen entfernen rückgängig undo wiederholen tastenkürzel strg',
        zeigen: ['[data-tool="zeiger"]']
      }),
      A('auftrag', 'Der Auftrag (Aufgabenkarte)', {
        kurz: 'Jedes Szenario bringt einen Auftrag mit: Ausgangslage, Aufgaben, Hilfen und eine Sternfrage. Die gelbe Karte liegt auf '
          + 'der Fläche und gehört der Lehrkraft, nicht dem Programm.',
        bild: 'auftrag', unter: 'Die Auftragskarte zu Szenario II.3',
        schritte: [
          'Am Kopf festhalten und verschieben; an der Ecke unten rechts die Größe ändern (Doppeltipp: zurück).',
          '<em>–</em> minimiert die Karte zur gelben Kachel <em>Aufgabe</em> oben rechts; ein Tipp darauf holt sie zurück.'
        ],
        wissen: [
          'Hilfen (Begriffe) sind eingeklappt und lassen sich einzeln öffnen.',
          'Den Text eines eigenen Szenarios schreiben Sie unter <em>Datei → Aufgabentext …</em> (siehe „Eigene Szenarien“).'
        ],
        such: 'aufgabe aufgabentext arbeitsauftrag karte gelb minimieren',
        zeigen: ['#aufgabe', '#aufgabeKachel']
      })
    ]),

    /* ═══ 2 · Hardware ═══════════════════════════════════════════ */
    K('hardware', 'Hardware: die Geräte', [
      A('leiste', 'Die Geräteleiste', {
        kurz: 'Links stehen alle Geräte, nach ihrer Aufgabe geordnet: <em>Endgeräte</em>, <em>Verteilen</em> (Switch), '
          + '<em>Vermittlungsgeräte</em> (Router), <em>Internet</em> (cww) und <em>Werkzeug</em> (Zeiger, Kabel).',
        bild: 'leiste', unter: 'Die Geräteleiste im Entwurf',
        bild2: 'ginfo', unter2: 'Antippen erklärt ein Gerät, statt es anzulegen',
        schritte: [
          'Ein Gerät <b>aus der Leiste auf die Fläche ziehen</b> — so wird es angelegt.',
          'Ein Gerät in der Leiste nur <b>antippen</b>: eine kurze Erklärung erscheint.',
          '<em>‹ Leiste</em> klappt die Leiste ein (dann nur Symbole).'
        ],
        wissen: [
          'Die Gliederung ist selbst Unterricht: ein Switch <b>verteilt</b> in einem Netz (Schicht 2), ein Router <b>vermittelt</b> zwischen Netzen (Schicht 3).',
          'Geräte heißen fest <b>E1, S1, H1, SW1, R1, HR1, CWW1</b> — Namen sind nicht änderbar, damit über Adressen gesprochen wird, nicht über Namen.',
          'In der Aktion zeigt die eingeklappte Leiste minimierte Gerätebildschirme (<em>Offene Geräte</em>).'
        ],
        such: 'werkzeugleiste geräte anlegen hinzufügen neues gerät palette ziehen',
        zeigen: ['#rail']
      }),
      A('endgeraet', 'Laptop (Endgerät)', {
        kurz: 'Ein Rechner mit <b>einer</b> Netzwerkkarte. Er hat einen Bildschirm mit Programmen (Terminal, Dateien, Browser …). '
          + 'Laptop, Server und Handy sind <b>dasselbe Gerät</b> mit anderem Bild — wie Rechner und Notebook in Filius.',
        bild: 'karte-klein', unter: 'Das Kärtchen eines Endgeräts im Entwurf',
        schritte: [
          'Aus der Leiste ziehen, mit dem <em>Kabel</em>-Werkzeug an einen Switch oder Router anschließen.',
          'Antippen und im Kärtchen <em>IP-Adresse</em> und <em>Netzmaske</em> eintragen — oder unter <em>Mehr ›</em> DHCP einschalten.',
          'Für andere Netze ein <em>Gateway</em> eintragen, für Namen (www.…) einen <em>DNS</em>-Server.'
        ],
        wissen: [
          'Wahlweise <em>Kabelgebunden (LAN)</em> oder <em>Drahtlos (WLAN)</em> — dann ohne Kabel, im ausgewählten Funknetz.',
          'Kürzel auf der Fläche: <b>E1, E2 …</b>'
        ],
        such: 'laptop rechner computer pc endgerät client host notebook',
        zeigen: ['[data-add="host"]', 'geraet:host']
      }),
      A('server', 'Server', {
        kurz: 'Ein Server ist <b>kein eigener Gerätetyp</b>, sondern ein Endgerät, auf dem ein Serverprogramm läuft (Webserver, '
          + 'DNS-Server, E-Mail-Server …). Er kann alles, was ein Laptop kann — das Bild zeigt nur, wofür er gedacht ist.',
        wissen: [
          'Programme kommen über die <em>Software-Installation</em> auf das Gerät und werden im Programm gestartet.',
          'Was gerade läuft, zeigen die farbigen <b>Marken</b> unter der Kachel: <em>DNS</em>, <em>Web</em>, <em>Mail</em>, <em>DHCP</em> …',
          'Ein Server braucht fast immer eine <b>feste</b> Adresse — sonst wissen die anderen nicht, wo sie ihn finden.',
          'Kürzel auf der Fläche: <b>S1, S2 …</b>'
        ],
        tipp: '„Was macht einen Rechner zum Server?“ — Installieren Sie auf einem Laptop einen Webserver: er wird einer.',
        such: 'server rechenzentrum dienst',
        zeigen: ['[data-add="server"]', 'geraet:server']
      }),
      A('handy', 'Handy', {
        kurz: 'Dasselbe Gerät wie ein Laptop — mit einem Unterschied: es hat <b>keine Kabelbuchse</b> und geht nur über WLAN ins Netz. '
          + 'Sein Bildschirm ist hochkant, ein Programm läuft im Vollbild.',
        bild: 'handy', unter: 'Der Handy-Bildschirm in der Aktion',
        schritte: [
          'Handy auf die Fläche ziehen.',
          'Ein Switch oder Heimrouter in der Nähe muss <em>WLAN ausstrahlen</em>.',
          'Im Kärtchen des Handys das Funknetz aus der Liste wählen und eine Adresse eintragen (oder DHCP).'
        ],
        wissen: [
          'Die Liste zeigt nur Netze, die gerade ausgestrahlt werden — ein Gerät <b>findet</b> ein WLAN, es erfindet keines.',
          'Die Funkverbindung ist auf der Fläche <b>gestrichelt</b>.',
          'Kürzel auf der Fläche: <b>H1, H2 …</b>'
        ],
        such: 'handy smartphone telefon mobil wlan funk',
        zeigen: ['[data-add="handy"]', 'geraet:handy']
      }),
      A('switch', 'Switch', {
        kurz: 'Ein Switch <b>verteilt</b> innerhalb eines Netzes. Er hat keine IP-Adresse, sondern lernt, welche MAC-Adresse an welcher '
          + 'Buchse steckt (MAC-Tabelle). Unbekannte Ziele bekommen alle Buchsen (Fluten).',
        bild: 'switch-kompakt', unter: 'Ein Switch in der Aktion: die gelernte MAC-Tabelle',
        wissen: [
          'Buchsen wachsen <b>mit jedem Kabel</b> von selbst nach (bis 50).',
          'Ein Switch kann ein <b>WLAN ausstrahlen</b> (Kärtchen → <em>WLAN</em>).',
          'In der Subnetz-Ansicht bleibt er ohne Farbe — er liegt in keinem Netz, seine Kabel schon.',
          'Was er gelernt hat: in der Aktion antippen, oder im Terminal eines Geräts <code>mactabelle</code> (nur am Switch).'
        ],
        tipp: 'Ping in <em>Zeitlupe</em>: beim ersten Mal flutet der Switch, ab dem zweiten Paket geht es nur noch an eine Buchse.',
        such: 'switch verteiler hub mac-tabelle schicht 2 fluten buchsen ports',
        zeigen: ['[data-add="switch"]', 'geraet:switch']
      }),
      A('router', 'Router', {
        kurz: 'Ein Router <b>vermittelt zwischen Netzen</b>. Für jedes Netz, an dem er hängt, hat er eine eigene Netzwerkkarte mit '
          + 'einer Adresse aus genau diesem Netz. Diese Adresse ist das <em>Gateway</em> der Geräte dort.',
        bild: 'router-karte', unter: 'Das Kärtchen eines Routers: zwei Netzwerkkarten, zwei Netze',
        schritte: [
          'Router aufs Feld ziehen und je ein Kabel in jedes Netz (meist zu einem Switch).',
          'Reiter <em>Netzwerkkarten</em>: jeder Karte eine Adresse aus ihrem Netz geben (z. B. 192.168.1.1 und 192.168.2.1).',
          'Bei den Endgeräten diese Adresse als <em>Gateway</em> eintragen.',
          'Bei mehreren Routern: Weiterleitungstabelle füllen oder <em>Automatisches Routing</em> einschalten.'
        ],
        wissen: [
          '<em>Schnittstelle hinzufügen</em> baut weitere Karten an (bis 8).',
          'Fährt man über eine Netzwerkkarte, leuchtet draußen ihr Kabel.',
          'Ein Router hat keinen DHCP-Server — DHCP ist ein Dienst eines Endgeräts oder des Heimrouters.',
          'Kürzel auf der Fläche: <b>R1, R2 …</b>'
        ],
        such: 'router vermittlung schicht 3 gateway netzwerkkarte schnittstelle',
        zeigen: ['[data-add="router"]', 'geraet:router']
      }),
      A('heimrouter', 'Heimrouter', {
        kurz: 'Das Gerät aus dem Wohnzimmer: in Wahrheit <b>drei Geräte in einem</b> — ein Router (oben <b>WAN</b> zum Anbieter, '
          + 'unten <b>LAN</b> ins Haus), ein Switch mit 8 LAN-Buchsen und ein WLAN-Zugangspunkt. Dazu NAT, DHCP-Server und Portfreigaben.',
        bild: 'heimrouter-lan', unter: 'Heimrouter, Reiter LAN, große Ansicht',
        schritte: [
          'WAN-Buchse mit dem cww oder dem Router „des Anbieters“ verbinden — die WAN-Seite holt sich ihre Adresse selbst.',
          'Reiter <em>LAN</em>: die Adresse des Hauses eintragen (z. B. 192.168.1.1).',
          'Unter <em>Mehr ›</em>: <em>DHCP-Server einrichten</em> und ggf. <em>WLAN ausstrahlen</em>.'
        ],
        wissen: [
          'Er kommt <b>leer aus dem Karton</b>: die Klasse trägt Adresse und DHCP-Bereich selbst ein.',
          'Alle LAN-Buchsen teilen sich <b>eine</b> IP- und MAC-Adresse (eingebauter Switch).',
          'Schildchen an den Kabeln zeigen <b>WAN</b> (gefüllt) und <b>LAN 1…8</b> (umrandet).',
          'Unter der Kachel steht immer die <b>LAN</b>-Adresse.',
          'Er hat keine Weiterleitungstabelle: alles Fremde geht nach draußen.'
        ],
        such: 'heimrouter fritzbox wlan-router zuhause wan lan internetanschluss modem',
        zeigen: ['[data-add="heimrouter"]', 'geraet:heimrouter']
      }),
      A('cww', 'cww – Class Wide Web', {
        kurz: 'Der Anschluss ins „Internet“ der Klasse. Am anderen Ende hängen die Netze <b>aller Tablets im Raum</b>: jedes Kind '
          + 'bekommt einen eigenen Adressbereich (ein /8, z. B. 67.0.0.0), die Lehrkraft immer 100.0.0.0.',
        bild: 'cww-karte', unter: 'Das cww-Fenster: Reiter Internet · Netzwerkkarten · Allgemein',
        schritte: [
          'cww auf die Fläche ziehen (höchstens eines je Netz) und das eigene Netz daran anschließen.',
          'Reiter <em>Netzwerkkarten</em>: zeigt den eigenen Adressbereich — daraus die Adressen der eigenen Geräte nehmen.',
          'Reiter <em>Allgemein</em>: DHCP-Server, DNS (fest <code>8.8.8.8</code>), Routing.'
        ],
        wissen: [
          '<b>8.8.8.8</b> ist der öffentliche DNS der Klasse: jeder laufende DNS-Server meldet dort seine Namen. Wer einen Namen zuerst anmeldet, bekommt ihn.',
          'Hinaus darf nur, wer eine Absenderadresse aus dem eigenen Bereich hat.',
          'Ohne Klassenraum läuft das cww im Übungsbetrieb (Bereich 50.0.0.0) — nur das eigene Netz ist erreichbar.',
          'Ein Tablet, das 20 s nichts gemeldet hat (zugeklappt), ist „nicht erreichbar“.'
        ],
        tipp: 'Wem welcher Bereich gehört, sehen nur Sie (Pult → <em>Internet der Klasse</em>). Lassen Sie die Klasse es mit '
          + '<code>traceroute</code> herausfinden.',
        such: 'cww class wide web internet wolke 8.8.8.8 öffentlich adressbereich anbieter provider',
        zeigen: ['[data-add="cww"]', 'geraet:cww']
      }),
      A('kabel', 'Kabel', {
        kurz: 'Kabel verbinden Geräte. Auf einem Kabel ist ein Paket als fliegender Punkt zu sehen. Ein angetipptes Kabel öffnet sein '
          + 'eigenes Kärtchen.',
        bild: 'kabel', unter: 'Das Kärtchen eines Kabels',
        schritte: [
          'In der Leiste das Werkzeug <em>Kabel</em> wählen.',
          'Von einem Gerät zum anderen <b>ziehen</b>.',
          'Zurück zum <em>Zeiger</em>, um wieder zu verschieben und auszuwählen.'
        ],
        wissen: [
          '<em>Laufzeit</em> (10–600 ms): wie lange ein Paket unterwegs ist — Entfernung, <b>keine</b> Datenrate.',
          '<em>Paketverlust</em>: eine Leitung, die manchmal etwas verschluckt.',
          '<em>Kabel ziehen</em> trennt die Verbindung, ohne das Kabel zu löschen; <em>Kabel löschen</em> entfernt es.',
          'Ein Endgerät hat nur <b>eine</b> Buchse — für mehrere Geräte braucht es einen Switch.'
        ],
        such: 'kabel verbinden verkabeln leitung laufzeit paketverlust ziehen stecker',
        zeigen: ['[data-tool="kabel"]', '.nf-cable']
      }),
      A('marken', 'Zeichen auf der Fläche', {
        kurz: 'Was ein Gerät tut und wo etwas nicht stimmt, steht direkt auf der Fläche — man muss kein Fenster öffnen.',
        bild: 'geraete', unter: 'Marken, Adressen und Schildchen im Heimnetz',
        tabelle: {
          kopf: ['Zeichen', 'Bedeutung'],
          zeilen: [
            ['<span class="hi-pille" style="--c:#c2731f">DHCP</span> <span class="hi-pille" style="--c:#2a8fe0">DNS</span> <span class="hi-pille" style="--c:#0e7c8c">Web</span> <span class="hi-pille" style="--c:#b03a86">Mail</span>', 'dieser Dienst <b>läuft</b> gerade (nur installiert genügt nicht)'],
            ['<span class="hi-pille" style="--c:#6d4fd8">≋ Name</span>', 'strahlt ein WLAN mit diesem Namen aus'],
            ['<b style="color:#1f5fbf">192.168.1</b>.<b style="color:#a8560c">10</b>', 'Netzteil blau, Geräteteil braun (nach der Netzmaske)'],
            ['🔒 hinter der Adresse', 'Adresse kam vom DHCP-Server'],
            ['<b style="color:#d9642a">!</b> am Gerät', 'Einstellungsfehler — der Satz dazu steht im Kärtchen'],
            ['Ziegelmauer unten links', 'die Firewall dieses Geräts läuft'],
            ['WAN / LAN 1', 'Schildchen am Heimrouter: welche Buchse'],
            ['gestrichelte Linie', 'Funkverbindung (WLAN)']
          ]
        },
        wissen: [
          'Gleicher blauer Anfang heißt gleiches Netz — das sieht man auch aus der letzten Reihe.',
          'Liegt die Grenze mitten in einer Zahl (z. B. Maske 255.255.255.192), ist diese Zahl gestreift.'
        ],
        such: 'marke pille symbol warnung ausrufezeichen fehler schloss farbe netzteil geräteteil badge',
        zeigen: ['.nf-nodes']
      })
    ]),

    /* ═══ 3 · Einstellen im Entwurf ══════════════════════════════ */
    K('einstellen', 'Einstellen im Entwurf', [
      A('kaertchen', 'Das Gerätefenster (Kärtchen)', {
        kurz: 'Ein Tipp auf ein Gerät im Entwurf öffnet seine Einstellungen <b>direkt daneben</b> — man sieht Gerät, Nachbarn und '
          + 'Adresse zugleich. Änderungen wirken beim Tippen, ein Speichern-Knopf ist nicht nötig.',
        bild: 'karte-gross', unter: 'Groß („Mehr ›“): alle Einstellungen am rechten Rand — klein steht nur das Wichtigste',
        schritte: [
          'Gerät antippen — das Kärtchen erscheint. Noch einmal tippen oder <kbd>Esc</kbd> schließt es.',
          '<em>Mehr ›</em> zeigt alles: DHCP, Netzwerkkarten, WLAN, Tabellen; <em>‹ Weniger</em> zurück.',
          'Am Kopf festhalten und verschieben.',
          '⏻ schaltet das Gerät aus und an; <em>Gerät löschen</em> steht ganz unten (groß).'
        ],
        wissen: [
          'Die runden <b>i</b>-Knöpfe an den Überschriften blenden kurze Erklärungen ein.',
          'Mit <kbd>Strg</kbd>-Klick stehen mehrere Kärtchen nebeneinander — gut zum Vergleichen von Adressen.',
          'Ein roter Satz oben im Kärtchen nennt Fehler, z. B. „Gateway liegt in keinem eigenen Netz“.'
        ],
        such: 'kärtchen einstellungen konfiguration fenster mehr weniger eigenschaften gerät löschen ausschalten',
        zeigen: ['.karte:not([hidden])']
      }),
      A('adressen', 'IP-Adresse, Netzmaske, Gateway, DNS', {
        kurz: 'Die vier Angaben, mit denen ein Gerät im Netz mitspielt. Die Adresse wird im Feld selbst eingefärbt: '
          + '<b style="color:#1f5fbf">Netzteil</b> und <b style="color:#a8560c">Geräteteil</b>, getrennt nach der Netzmaske.',
        tabelle: {
          kopf: ['Feld', 'Wozu'],
          zeilen: [
            ['IP-Adresse', 'die Adresse des Geräts, z. B. <code>192.168.1.10</code>'],
            ['Netzmaske', 'welcher Teil das Netz ist, meist <code>255.255.255.0</code>'],
            ['Gateway', 'der Router, über den es in <b>andere</b> Netze geht — darf im eigenen Netz leer bleiben'],
            ['DNS', 'wer Namen wie <code>www.schule.de</code> in Adressen übersetzt'],
            ['MAC-Adresse', 'fest in der Netzwerkkarte, automatisch gesetzt']
          ]
        },
        wissen: [
          'Zwei Geräte im selben Netz brauchen <b>gleichen Netzteil</b> und <b>gleiche Maske</b>.',
          'Fehler wie „Netzadresse als Geräteadresse“ oder „Gateway im falschen Netz“ zeigt ein Warnzeichen.',
          'Doppelte Adressen werden nicht gemeldet — im selben Netz zeigt der Mitschnitt zwei ARP-Antworten.',
          '<em>Ansicht &amp; Tools → Binärdarstellung</em> zeigt Adresse und Maske als 32 Bit.'
        ],
        such: 'ip adresse ipv4 netzmaske subnetzmaske maske gateway standardgateway dns mac netzteil hostteil geräteteil adressieren',
        zeigen: ['.karte:not([hidden])']
      }),
      A('netzwerkkarten', 'Netzwerkkarten', {
        kurz: 'Jeder Anschluss eines Geräts ist eine Netzwerkkarte mit eigener MAC- und IP-Adresse. Endgeräte haben eine, Router '
          + 'mehrere — eine je Netz.',
        wissen: [
          'Jede Karte ist im Kärtchen <b>in der Farbe ihres Netzes</b> umrandet.',
          'Zeigt man auf eine Karte (oder tippt in ihr Feld), <b>leuchtet ihr Kabel</b> auf der Fläche.',
          'Router: <em>Schnittstelle hinzufügen</em> (bis 8) und × zum Entfernen.',
          'Heimrouter: Reiter <em>WAN</em> und <em>LAN</em> statt Kartennummern.'
        ],
        such: 'netzwerkkarte nic schnittstelle interface anschluss port hinzufügen',
        zeigen: ['.karte:not([hidden])']
      }),
      A('dhcp', 'DHCP: Adressen automatisch', {
        kurz: 'Ein DHCP-Server verteilt Adressen, ein DHCP-Client holt sie sich. Der Server ist ein Dienst eines <b>Endgeräts</b> '
          + 'oder des <b>Heimrouters</b> (nicht des Routers) — so wie in Filius.',
        bild: 'dhcp-server', unter: 'DHCP-Server einrichten (hier am Heimrouter)',
        schritte: [
          '<b>Server:</b> Kärtchen → <em>Mehr ›</em> → <em>DHCP-Server einrichten</em>.',
          'Untergrenze, Obergrenze, Netzmaske, Gateway und DNS-Server prüfen, <em>DHCP aktivieren</em> anhaken.',
          '<b>Client:</b> beim Endgerät unter <em>Mehr ›</em> <em>DHCP zur Konfiguration verwenden</em> anhaken.',
          'In die <em>Aktion</em> wechseln — die Clients fragen, die Adressen erscheinen mit 🔒.'
        ],
        wissen: [
          'Vier Nachrichten: Discover → Offer → Request → Ack (im Mitschnitt, Filter <em>DHCP</em>).',
          '<em>Statische Adresszuweisung</em>: eine MAC-Adresse bekommt immer dieselbe IP.',
          'Welche Adresse ein Gerät bekommt, ist <b>zufällig</b> — und jeder Start der Aktion vergibt neu.',
          'Bei zwei DHCP-Servern gewinnt, wer zuerst antwortet (→ Szenario „DHCP-Spoofing“).',
          'Im Terminal: <code>dhcp</code> zeigt die Herkunft der Adresse, <code>dhcp neu</code> holt eine neue.'
        ],
        such: 'dhcp automatisch adresse beziehen server client lease vergabe bereich pool spoofing',
        zeigen: ['.karte:not([hidden])']
      }),
      A('routing', 'Weiterleitungstabelle und automatisches Routing', {
        kurz: 'Ein Router kennt von selbst nur die Netze, an denen er hängt. Für weiter entfernte Netze braucht er Einträge — von Hand '
          + 'oder automatisch (RIP).',
        bild: 'routing', unter: 'Router, Reiter Allgemein: der Haken und die Tabelle',
        schritte: [
          'Router antippen → Reiter <em>Allgemein</em>.',
          '<b>Automatisch:</b> <em>Automatisches Routing (RIP)</em> anhaken — in der Aktion lernen die Router alle Wege in wenigen Sekunden.',
          '<b>Von Hand:</b> <em>Zur Weiterleitungstabelle</em> → <em>Neue Zeile</em>: Ziel, Netzmaske, Nächstes Gateway.'
        ],
        wissen: [
          '„Über Schnittstelle“ wird nicht getippt, es <b>folgt</b> aus dem Gateway. Liegt das Gateway in keinem eigenen Netz, steht das sofort da.',
          'RIP ergänzt die Tabelle: bei gleicher Maske geht ein Eintrag von Hand vor.',
          'RIP läuft nur in der Aktion; im Terminal steht mit, was gelernt wurde (<code>route</code>).'
        ],
        tipp: 'Erst von Hand eintragen lassen, dann den Haken setzen — RIP beantwortet eine Frage, die man vorher gestellt haben muss.',
        such: 'routing route weiterleitung routingtabelle rip automatisch statisch eintrag nächstes gateway ziel hop',
        zeigen: ['.karte:not([hidden])', 'geraet:router']
      }),
      A('nat', 'NAT und Portfreigaben', {
        kurz: 'Der Heimrouter übersetzt: innen viele private Adressen, außen genau eine. Deshalb kann von außen niemand ein Gespräch '
          + 'anfangen — außer über eine <b>Portfreigabe</b>.',
        bild: 'nat', unter: 'Heimrouter, Reiter Allgemein: NAT und Portfreigaben',
        schritte: [
          'Heimrouter antippen → <em>Mehr ›</em> → Reiter <em>Allgemein</em> → Abschnitt <em>NAT</em>.',
          'Für einen Server im Haus: unter <em>Portfreigaben</em> eine Zeile anlegen — Protokoll, Port außen, LAN-Adresse, LAN-Port.'
        ],
        wissen: [
          'Übersetzt wird Adresse <b>und</b> Port — erst das macht den Rückweg eindeutig (NAPT).',
          'Die NAT-Tabelle füllt sich beim Hinausgehen; Freigaben stehen dort sofort (Spalte <em>woher</em>: Freigabe / Gespräch).',
          'NAT lässt sich nicht abschalten — ein Heimrouter übersetzt immer, wie im echten Leben.',
          'Im Mitschnitt sieht man beide Seiten: innen die private Adresse, außen die WAN-Adresse des Heimrouters.'
        ],
        such: 'nat napt portfreigabe port forwarding weiterleitung übersetzung privat öffentlich wan-adresse',
        zeigen: ['.karte:not([hidden])', 'geraet:heimrouter']
      }),
      A('wlan', 'WLAN', {
        kurz: 'Switch und Heimrouter können ein Funknetz mit Namen (SSID) ausstrahlen. Endgeräte verbinden sich ohne Kabel, '
          + 'Handys ausschließlich so.',
        bild: 'wlan', unter: 'Heimrouter: WLAN ausstrahlen',
        schritte: [
          'Switch oder Heimrouter: <em>WLAN ausstrahlen</em> anhaken und einen <em>Name WLAN (SSID)</em> vergeben.',
          'Endgerät: <em>Drahtlos (WLAN)</em> wählen, dann das Netz aus der Liste.'
        ],
        wissen: [
          'Funk belegt keine Buchse und ist auf der Fläche gestrichelt.',
          'Funk ist ein gemeinsames Medium: jeder Gast im selben WLAN „hört“ die Pakete der anderen (Mitschnitt → <em>👁 Mitlesende</em>).',
          'Das WLAN eines Switch wird nur im Entwurf geschaltet.'
        ],
        such: 'wlan wifi funk drahtlos ssid accesspoint zugangspunkt',
        zeigen: ['.karte:not([hidden])', '.nf-cable.is-funk']
      }),
      A('firewall', 'Firewall', {
        kurz: 'Eine Firewall entscheidet bei jedem Paket, das ein Gerät <b>weiterleitet</b>: durchlassen oder nicht. Es gibt sie an '
          + '<b>Router, Heimrouter und cww</b>.',
        bild: 'firewall', unter: 'Die Seite der Firewall (Router, Allgemein → Firewall)',
        bild2: 'firewall-zeichen', unter2: 'Läuft sie, trägt das Gerät unten links dieses Zeichen',
        schritte: [
          'Im Entwurf: Router antippen → <em>Mehr ›</em> → Reiter <em>Allgemein</em> → ganz unten der Knopf <em>Firewall</em>.',
          '<em>Firewall aktivieren</em> anhaken.',
          '<b>Blacklist</b> (Liste wird gesperrt) oder <b>Whitelist</b> (nur die Liste kommt durch) wählen.',
          '<em>+ Adresse</em>: eine Adresse mit Netzmaske (ein Bereich), eine Adresse allein (ein Gerät) oder ein Name.'
        ],
        wissen: [
          'Eine Zeile trifft ein Paket, wenn ihre Adresse <b>Absender oder Ziel</b> ist. Ports und Protokolle spielen keine Rolle.',
          '<em>still verwerfen</em>: der Absender wartet bis zur Zeitüberschreitung. <em>ablehnen</em>: er bekommt sofort „Verboten“.',
          'Eine leere Blacklist sperrt nichts, eine leere Whitelist <b>alles</b>.',
          'Namen werden erst aufgelöst, wenn die Uhr läuft (danach alle 60 s).',
          'Pakete <b>an</b> den Router selbst prüft sie nicht — sie schützt das Netz dahinter.',
          'Gesperrte Pakete stehen im Mitschnitt als „von der Firewall verworfen“; Zähler stehen auf der Seite.'
        ],
        tipp: '„Geoblocking“ ist nichts anderes als eine Liste von Adressbereichen. Sperren Sie den Bereich eines Mitschülers im cww.',
        such: 'firewall sperren blockieren blacklist whitelist geoblocking filter regel verwerfen ablehnen',
        zeigen: ['.karte:not([hidden])', '.nf-fw']
      })
    ]),

    /* ═══ 4 · Software ═══════════════════════════════════════════ */
    K('software', 'Software: die Programme', [
      A('desktop', 'Die Geräteoberfläche', {
        kurz: 'In der <b>Aktion</b> öffnet ein Tipp auf ein Endgerät seinen <b>Bildschirm</b>: Symbole der Programme auf der Tapete, '
          + 'unten der Schnellzugriff. Ein Programm öffnet ein Fenster über den Symbolen.',
        bild: 'desktop', unter: 'Der Bildschirm eines Laptops',
        schritte: [
          'In die <em>Aktion</em> wechseln und ein Endgerät antippen.',
          'Ein Programm-Symbol antippen; zum Wechseln den <b>Schnellzugriff</b> unten benutzen.',
          'Oben rechts: ⏻ ein/aus · <em>_</em> minimieren (links in der Leiste) · × schließen.',
          'Unten rechts am Griff ziehen ändert die Größe (Doppeltipp: zurück).'
        ],
        wissen: [
          'Die Kopfzeile zeigt die aktuelle Adresse des Geräts.',
          'Mehrere Bildschirme können gleichzeitig offen sein.',
          'Ein ausgeschaltetes Gerät zeigt keine Programme.',
          'Neue Programme kommen über die <em>Software-Installation</em> dazu.'
        ],
        such: 'desktop bildschirm oberfläche programme dock schnellzugriff minimieren fenster apps',
        zeigen: ['.dt.is-front']
      }),
      A('ohneschirm', 'Router, Switch & Co. in der Aktion', {
        kurz: 'Geräte ohne Bildschirm (Router, Heimrouter, Switch, cww) zeigen in der Aktion eine kompakte <b>Leseansicht</b>: '
          + 'alle Angaben und die Tabellen, die sich das Gerät gebaut hat.',
        bild: 'kompakt', unter: 'Ein Router in der Aktion',
        wissen: [
          'Hier lässt sich nichts einstellen — dafür in den Entwurf wechseln.',
          'Zu sehen sind ARP-Tabelle, MAC-Tabelle (Switch), Weiterleitungstabelle, NAT-Tabelle, Firewall-Zähler.',
          '<em>Tabellen vergessen</em> leert das Gelernte — gut, um das Lernen noch einmal zu zeigen.'
        ],
        such: 'kompakt leseansicht router aktion tabellen arp vergessen',
        zeigen: ['.dt.is-front']
      }),
      A('terminal', 'Terminal', {
        kurz: 'Die Kommandozeile jedes Endgeräts. Hier wird gepingt, der Weg verfolgt und nachgesehen, was ein Gerät weiß. '
          + 'Oben rechts im Terminal: <em>Befehle ▾</em> mit Kurzerklärung.',
        bild: 'terminal', unter: 'ping mit Namen: erst die DNS-Frage, dann die Pings',
        tabelle: {
          kopf: ['Befehl', 'Wirkung'],
          zeilen: [
            ['<code>ping 192.168.1.20</code>', 'vier Anfragen — erreichbar? (auch mit Namen)'],
            ['<code>traceroute ziel</code>', 'die Stationen (Router) auf dem Weg'],
            ['<code>nslookup name</code>', 'fragt den DNS-Server nach der Adresse'],
            ['<code>ipconfig</code>', 'eigene Adressen, Maske, Gateway, DNS'],
            ['<code>arp</code>', 'bekannte MAC-Adressen'],
            ['<code>route</code>', 'Weiterleitungstabelle mit Herkunft'],
            ['<code>dhcp</code> · <code>dhcp neu</code>', 'Herkunft der Adresse · neu holen'],
            ['<code>netstat</code>', 'welches Programm auf welchem Port hört'],
            ['<code>vergiss</code>', 'ARP- und MAC-Tabellen wegwerfen'],
            ['<code>ls</code> <code>cd</code> <code>cat</code> <code>mkdir</code> <code>rm</code>', 'Dateien ansehen und verwalten'],
            ['<code>hilfe</code> · <code>leeren</code>', 'alle Befehle · Ausgabe löschen']
          ]
        },
        wissen: [
          'Ein laufender Befehl endet mit <kbd>Esc</kbd> oder <em>■ Abbrechen</em> (auf dem Tablet).',
          'Ein gescheiterter Ping sagt, <b>woran</b> es lag (z. B. „Niemand hat sich auf die ARP-Anfrage gemeldet“).',
          'Der erste Ping dauert länger — erst wird per ARP die MAC-Adresse gesucht.'
        ],
        such: 'terminal konsole kommandozeile befehl cmd ping traceroute tracert nslookup ipconfig arp route netstat',
        zeigen: ['.dt.is-front', '#term']
      }),
      A('softwareinst', 'Software-Installation', {
        kurz: 'Der „Appstore“ des Geräts. Ein Tipp auf eine Kachel spielt das Programm auf (Haken), ein Tipp auf eine Kachel mit Haken '
          + 'fragt, ob es wieder herunter soll.',
        bild: 'software', unter: 'Die Software-Installation eines Servers',
        wissen: [
          'Installiert ist nicht gestartet: Serverprogramme haben im eigenen Fenster <em>Starten</em> / <em>Beenden</em>.',
          'Die Marke unter der Kachel (<em>Web</em>, <em>DNS</em> …) erscheint erst, wenn der Dienst läuft.',
          'Terminal, Datei-Explorer und Software-Installation sind immer da.'
        ],
        such: 'software installation installieren deinstallieren appstore programm aufspielen',
        zeigen: ['.dt.is-front']
      }),
      A('dateien', 'Datei-Explorer, Editor, Bildbetrachter', {
        kurz: 'Jedes Endgerät hat ein eigenes Dateisystem — ab Werk mit einem Ordner <code>/Bilder</code>. Ein Tipp auf eine Datei '
          + 'öffnet sie: Texte im Editor, Bilder im Betrachter.',
        bild: 'dateien', unter: 'Der Datei-Explorer auf einem Server',
        schritte: [
          'Programm <em>Dateien</em> öffnen.',
          '<em>Ordner erstellen</em> · <em>Neue Textdatei</em> · <em>Datei hochladen</em> (Bild oder Text vom eigenen Gerät).',
          '✎ benennt um, × löscht — die Rückfrage steht in der Zeile.'
        ],
        wissen: [
          'Der Editor färbt HTML und CSS ein. JavaScript wird gespeichert, aber <b>nie ausgeführt</b>.',
          'Hochladen: bis 2 MB je Datei, 4 MB je Netz.',
          'Die Webseite eines Webservers liegt im Ordner <code>/webserver</code> — hier lässt sie sich umschreiben.'
        ],
        such: 'dateien explorer ordner datei editor text html css bild hochladen upload bildbetrachter',
        zeigen: ['.dt.is-front']
      }),
      A('dns', 'DNS-Server', {
        kurz: 'Übersetzt Namen (<code>www.schule.de</code>) in Adressen. Jeder Name wird <b>einzeln</b> eingetragen — wer die Liste '
          + 'führt, merkt, dass sie jemand führen muss.',
        bild: 'dns', unter: 'Das Fenster des DNS-Servers',
        schritte: [
          'Software-Installation → <em>DNS-Server</em> aufspielen, Programm öffnen, <em>Starten</em>.',
          'Unter <em>Adressen (A)</em> → <em>Hinzufügen</em>: Name und IP-Adresse.',
          'Bei allen Endgeräten im Kärtchen unter <em>DNS</em> die Adresse dieses Servers eintragen.'
        ],
        wissen: [
          '<em>Mailaustausch (MX)</em>: welcher Server die Post einer Domain annimmt — nötig für Mail an fremde Domains.',
          'Im cww meldet ein laufender DNS-Server seine Namen an <b>8.8.8.8</b> — so findet die ganze Klasse sie.',
          'Prüfen im Terminal: <code>nslookup www.schule.de</code>.'
        ],
        such: 'dns nameserver domain name auflösung eintrag a-record mx hostname',
        zeigen: ['.dt.is-front']
      }),
      A('browser', 'Webbrowser', {
        kurz: 'Holt Seiten von einem Webserver — über Adresse (<code>192.168.2.30</code>) oder Name (<code>www.schule.de</code>, über DNS). '
          + 'Unter der Seite steht, <b>was alles geholt wurde</b>.',
        bild: 'browser', unter: 'Eine Seite = vier Anfragen: Seite, Stildatei, zwei Bilder',
        schritte: [
          'Adresse oder Name eintippen, <em>Start</em> oder <kbd>Enter</kbd>.',
          'Der Vorsatz <code>http://</code> ist ein Knopf: antippen wechselt zu <code>https://</code>.',
          'Ein Port geht mit Doppelpunkt: <code>www.schule.de:8080</code>.'
        ],
        wissen: [
          'Jede Datei ist eine eigene Anfrage mit Statuscode (<code>200</code> gut, <code>404</code> fehlt).',
          '<em>Nicht sicher</em> steht bei http; bei geprüftem https erscheint ein Schloss.',
          'Das <b>Schild</b> oben rechts öffnet die Liste der Zertifizierungsstellen, denen das Gerät vertraut (orange = leer).',
          'Seiten zeigen echtes HTML und CSS; nichts davon erreicht das echte Internet.'
        ],
        such: 'browser webbrowser internetseite webseite url adresse http https laden',
        zeigen: ['.dt.is-front']
      }),
      A('webserver', 'Webserver', {
        kurz: 'Bietet die Dateien aus dem Ordner <code>/webserver</code> im Netz an (Port 80). Beim Aufspielen entsteht eine fertige '
          + 'Startseite aus drei Dateien.',
        bild: 'webserver', unter: 'Das Fenster des Webservers',
        schritte: [
          'Software-Installation → <em>Webserver</em>, öffnen, <em>Starten</em>.',
          'Von einem anderen Gerät im Browser die Adresse des Servers aufrufen.',
          'Seite ändern: im Datei-Explorer <code>/webserver/index.html</code> bearbeiten.'
        ],
        wissen: [
          'Unten steht ein Protokoll der <b>Zugriffe</b>: wer wann was geholt hat.',
          '<em>Verschlüsselung (HTTPS)</em>: mit Zertifikat einer Zertifizierungsstelle bietet er zusätzlich Port 443 an.',
          'Für einen Namen (www.…) braucht es zusätzlich einen DNS-Eintrag.'
        ],
        such: 'webserver http server homepage port 80 index.html webseite anbieten',
        zeigen: ['.dt.is-front']
      }),
      A('streaming', 'Streaming-Server', {
        kurz: 'Ein kleiner Filmdienst mit Konten: Registrieren (Name, E-Mail, IBAN …), Passwort per Mail, Anmelden, Filme ansehen, '
          + 'liken, kommentieren. Gedacht für Datenschutz und Sicherheit: alles läuft zunächst <b>im Klartext</b>.',
        bild: 'streaming', unter: 'Reiter Verwaltung — Datenbank zeigt die gespeicherten Konten',
        schritte: [
          'Aufspielen; einen laufenden Webserver auf demselben Gerät vorher beenden (beide brauchen Port 80).',
          'Namen des Dienstes und einen Mailserver für die Passwort-Mails eintragen, <em>Starten</em>.',
          'Im Browser eines anderen Geräts die Adresse aufrufen und ein Konto anlegen.'
        ],
        wissen: [
          'Reiter <em>Datenbank</em>: was der Anbieter über seine Kunden speichert.',
          'Im Mitschnitt sind Formulare, Passwörter und Cookies lesbar — bis HTTPS eingeschaltet ist.'
        ],
        tipp: 'Lassen Sie die Klasse im Mitschnitt (Filter <em>👁 Mitlesende</em>) die IBAN eines Mitschülers finden — und dann HTTPS einrichten.',
        such: 'streaming netflix filme video konto registrieren anmelden cookie datenschutz',
        zeigen: ['.dt.is-front']
      }),
      A('mail', 'E-Mail-Programm', {
        kurz: 'Ein Konto je Gerät. <b>SMTP</b> (Port 25) bringt die Post zum Server, <b>POP3</b> (Port 110) holt sie ab — '
          + 'eine E-Mail wird nicht zugestellt, sie wird <b>abgeholt</b>.',
        bild: 'mail', unter: 'Reiter Konto einrichten',
        schritte: [
          'Reiter <em>Konto einrichten</em>: Name, Benutzername, Passwort, Maildomain, POP3- und SMTP-Server.',
          '<em>Anmelden</em> prüft alles bei beiden Servern; danach ist die Adresse fest (<em>benutzer@domain</em>).',
          'Verfassen ✎ und senden; beim Empfänger <em>E-Mails abrufen</em> drücken.'
        ],
        wissen: [
          'Das Konto muss vorher im E-Mail-Server angelegt sein.',
          '<em>Verschlüsselte Verbindung (SSL/TLS)</em> nutzt 995/465 — der Server braucht dafür ein Zertifikat.',
          'Im Mitschnitt steht jede Zeile des Gesprächs, auch <code>PASS geheim</code> — so ist POP3.'
        ],
        such: 'email e-mail mail programm client smtp pop3 posteingang senden abrufen konto',
        zeigen: ['.dt.is-front']
      }),
      A('mailserver', 'E-Mail-Server', {
        kurz: 'Verwaltet die Postfächer einer Maildomain (z. B. <code>schule.de</code>): nimmt Post an und gibt sie heraus.',
        bild: 'mailserver', unter: 'Das Fenster des E-Mail-Servers',
        schritte: [
          'Aufspielen, <em>Starten</em>, <em>Maildomain</em> eintragen.',
          'Unter <em>Neues Konto</em> je Person Benutzername, Name und Passwort → <em>Konto erstellen</em>.',
          'Im DNS einen Namen für den Server eintragen (z. B. <code>mail.schule.de</code>).'
        ],
        wissen: [
          'Post an eine <b>fremde</b> Domain reicht er weiter — dazu fragt er im DNS nach dem <b>MX-Eintrag</b>.',
          'Mit Zertifikat bietet er verschlüsselte Ports (465/995) an.'
        ],
        such: 'mailserver e-mail-server postfach domain konto mx smtp pop3',
        zeigen: ['.dt.is-front']
      }),
      A('zertstelle', 'Zertifizierungsstelle und HTTPS', {
        kurz: 'Eine Zertifizierungsstelle (ZS) bestätigt: „Dieser Name gehört diesem Server.“ Erst mit ihrem Zertifikat kann ein '
          + 'Server HTTPS. Es gibt keine eingebaute — die Klasse betreibt sie selbst.',
        bild: 'zertstelle', unter: 'Das Fenster der Zertifizierungsstelle',
        schritte: [
          'Auf einem Gerät <em>Zertifizierungsstelle</em> aufspielen, starten, Namen und DNS-Server für die Prüfung eintragen.',
          'Am Webserver unter <em>Verschlüsselung</em>: eigenen Namen und die ZS eintragen → <em>Zertifikat beantragen</em>.',
          'Die ZS prüft den Namen; der Betreiber gibt den Antrag unter <em>Anträge</em> per Klick frei.',
          'Am Webserver <em>Zertifikat abholen</em> und <em>HTTPS anbieten</em> anhaken.',
          'Im Browser über das <b>Schild</b> der ZS vertrauen (Fingerabdruck vergleichen).'
        ],
        wissen: [
          'Ohne Vertrauen zeigt der Browser eine Warnseite mit „Trotzdem fortfahren“ — genau wie im echten Netz.',
          'Im Mitschnitt: Handschlag mit Servername im Klartext, danach nur noch 🔒 verschlüsselter „Salat“.',
          'Die Verschlüsselung ist ein Lehrmodell (Spielzeug-Kryptografie), aber im Ablauf echt (TLS 1.3).'
        ],
        such: 'zertifikat zertifizierungsstelle ca https tls ssl verschlüsselung schloss fingerabdruck vertrauen',
        zeigen: ['.dt.is-front']
      }),
      A('vpn', 'VPN-Server und VPN-Client', {
        kurz: 'Ein VPN schickt alles, was ein Gerät sendet, verschlüsselt durch einen Tunnel zum VPN-Server. Unterwegs sieht niemand '
          + 'mehr das Ziel — der VPN-Server dafür alles.',
        bild: 'vpnserver', unter: 'VPN-Server: Konten, Verbunden, Zertifikat',
        bild2: 'vpnclient', unter2: 'VPN-Client: Server, Benutzer, Passwort',
        schritte: [
          '<b>Server:</b> aufspielen, Zertifikat holen (wie beim Webserver), Konten anlegen, <em>Starten</em> (Port 1194).',
          '<b>Client:</b> aufspielen, Server, Benutzer und Passwort eintragen, <em>Verbinden</em>.'
        ],
        wissen: [
          'Verbunden: hinter dem Gerätenamen steht <em>◯ VPN aktiv</em>. Tunnelpakete tragen einen Ring und ein <b>Schloss</b>.',
          'Am VPN-Server ist der Tunnel zu Ende, der Weg aber nicht: von dort geht das Paket als ganz normales Paket weiter zum Ziel '
            + '— unverschlüsselt, außer die Seite hat selbst HTTPS.',
          'Alles geht durch den Tunnel, auch DNS. Der Client bekommt eine Tunneladresse (10.8.0.x).',
          'Im Mitschnitt des <b>VPN-Servers</b> stehen die inneren Pakete im Klartext — das Vertrauen wandert dorthin.'
        ],
        such: 'vpn tunnel virtual private network verschlüsselt anonym',
        zeigen: ['.dt.is-front']
      })
    ]),

    /* ═══ 5 · Werkzeuge & Ansichten ══════════════════════════════ */
    K('werkzeuge', 'Werkzeuge und Ansichten', [
      A('mitschnitt', 'Mitschnitt', {
        kurz: 'Der Mitschnitt listet jedes Paket im Netz, von oben nach unten in der Reihenfolge, in der es passiert — wie Wireshark, '
          + 'nur lesbar. Nur in der Aktion.',
        bild: 'mitschnitt', unter: 'Zeilen-Ansicht: ein Ping mit Namen',
        bild2: 'mitschnitt-schichten', unter2: 'Schichten-Ansicht wie in Filius',
        schritte: [
          '<em>Ansicht &amp; Tools → Mitschnitt</em> — die Leiste erscheint unten.',
          'Eine Zeile antippen klappt sie auf: alle Felder, Schicht für Schicht.',
          'Ein Gerät auf der Fläche antippen: nur noch dessen Pakete (Chip <em>nur …</em> × löst es).'
        ],
        tabelle: {
          kopf: ['Knopf', 'Wirkung'],
          zeilen: [
            ['<em>↑ gesendet</em> / <em>↕ beide</em>', 'nur Abgänge (übersichtlich) oder auch Empfang'],
            ['<em>Zeilen</em> / <em>Schichten</em>', 'kompakt oder eine Zeile je Schicht'],
            ['ARP, ICMP, DHCP, DNS …', 'nach Protokoll filtern'],
            ['<em>👁 Mitlesende</em>', 'Pakete, die ein Gerät mitlesen konnte (Funk, Router)'],
            ['<em>suchen …</em>', 'Freitext, z. B. eine Adresse'],
            ['<em>Kopieren</em> · <em>Leeren</em>', 'als Text kopieren · Liste löschen']
          ]
        },
        wissen: [
          'Wer hochgerollt hat, bleibt stehen, auch wenn neue Zeilen kommen.',
          'Pillen markieren Besonderes: <em>🔓 Zugangsdaten</em>, <em>🔒 TLS</em>, <em>☁ Internet</em>, <em>◯ Tunnel</em>.',
          'Von der Firewall verworfene Pakete stehen als eigene Zeile da.'
        ],
        tipp: 'Vor einem Versuch <em>Leeren</em> drücken — dann gehört jede Zeile zu genau diesem Versuch.',
        such: 'mitschnitt wireshark pakete protokoll aufzeichnung trace log schichten filter mitlesen',
        zeigen: ['.trace', '#traceBtn']
      }),
      A('subnetze', 'Subnetze', {
        kurz: 'Färbt jedes Netz in einer eigenen Farbe ein: Ringe um die Geräte, Kabel, Netzwerkkarten. Links erscheint die Liste aller '
          + 'Adressräume. Das gibt es in Filius nicht.',
        bild: 'subnetze', unter: 'Drei Router, sechs Netze — jedes in seiner Farbe',
        schritte: [
          '<em>Ansicht &amp; Tools → Subnetze</em>.',
          'In der Liste ein Kürzel (R1, E2 …) antippen: das Gerät wird ausgewählt.'
        ],
        wissen: [
          'Ein Subnetz braucht zwei Dinge: per Kabel erreichbar <b>ohne Router dazwischen</b> und <b>gleicher Netzteil samt Maske</b>.',
          'Ein Router hat mehrere Ringe — so viele, wie er Netze verbindet.',
          'Switche bleiben ungefärbt; ein Gerät allein ist kein Netz.',
          'Je Netz: Netz, Netzmaske, erste bis letzte nutzbare Adresse, Rundruf.',
          'Auch ohne die Ansicht zeigt ein angetipptes Gerät den Ring seines Netzes.'
        ],
        tipp: 'Klassischer Fehler sichtbar gemacht: zwei Geräte am selben Switch, aber verschiedene Farben — sie liegen in verschiedenen Netzen.',
        such: 'subnetz subnetze netze farbe adressraum adressbereich broadcast rundruf netzadresse',
        zeigen: ['#subnetze', '#subBtn']
      }),
      A('wlt', 'Weiterleitungstabellen (Fenster)', {
        kurz: 'Die Weiterleitungstabellen aller Router unten über die ganze Breite — ein Reiter je Router. So lassen sich mehrere '
          + 'Router nacheinander einrichten, ohne Fenster zu suchen.',
        bild: 'wlt', unter: 'Ein Reiter je Router, eine Zeile je Weg',
        schritte: [
          '<em>Ansicht &amp; Tools → Weiterleitungstabellen</em> oder im Router-Kärtchen <em>Zur Weiterleitungstabelle</em>.',
          'Reiter antippen wählt den Router auf der Fläche aus.',
          '<em>Neue Zeile</em>: Ziel · Netzmaske · Nächstes Gateway.'
        ],
        wissen: [
          'Grau stehen die Wege, die der Router selbst kennt (direkt · RIP · Standard), mit der Spalte <em>Herkunft</em>.',
          '<em>Alle Einträge anzeigen</em> abwählen zeigt nur die Zeilen von Hand.'
        ],
        such: 'weiterleitungstabelle routingtabelle tabelle fenster router reiter',
        zeigen: ['#wlt', '#wltBtn']
      }),
      A('binaer', 'Binärdarstellung', {
        kurz: 'Zeigt IP-Adresse und Netzmaske zusätzlich als <b>32 Bit</b> in vier Achtergruppen — blau die Bits des Netzteils, '
          + 'braun die des Geräteteils.',
        bild: 'binaer', unter: 'Ein Kärtchen mit eingeschalteter Binärdarstellung',
        wissen: [
          'Ein- und ausschalten unter <em>Ansicht &amp; Tools</em>; die Wahl bleibt auf dem Gerät.',
          'Wirkt in den Kärtchen und in der Subnetz-Liste.',
          'Damit sieht man auch eine Grenze mitten in einer Zahl (z. B. 255.255.255.192).'
        ],
        such: 'binär bits dual nullen einsen 32 bit subnetting maske rechnen',
        zeigen: ['#binBtn']
      }),
      A('lerninfo', 'Geräte-Lerninformationen', {
        kurz: 'Zeigt in den Gerätefenstern, was ein Gerät <b>gelernt</b> hat: ARP-Tabelle (welche MAC zu welcher IP) und beim Switch die '
          + 'MAC-Tabelle (welche MAC an welcher Buchse).',
        bild: 'lerninfo', unter: 'Ein Router in der Aktion mit eingeschalteten Lerninformationen',
        wissen: [
          'Ein- und ausschalten unter <em>Ansicht &amp; Tools</em>; aus, bis Sie es einschalten.',
          'Die Tabellen füllen sich erst in der Aktion, wenn Pakete laufen.',
          '<em>Tabellen vergessen</em> bzw. <code>vergiss</code> im Terminal leert sie wieder.'
        ],
        such: 'lerninformationen gelernt arp mac-tabelle cache lernen',
        zeigen: ['#lernBtn']
      }),
      A('ansicht', 'Netzwerkplan und Dark Mode', {
        kurz: 'Zwei Ansichten im Menü <em>Ansicht &amp; Tools</em>: <b>Netzwerkplan</b> ersetzt die Gerätebilder durch schlichte Symbole, '
          + '<b>Dark Mode</b> schaltet auf dunkel.',
        bild: 'menue-ansicht', unter: 'Das Menü Ansicht & Tools',
        wissen: [
          'Der Dark Mode gilt für ganz MPSkills.',
          'Die runden <b>i</b> im Menü erklären jedes Werkzeug in einem Satz.',
          '<em>Subnetze</em> und <em>Mitschnitt</em> sind im Entwurf grau — sie wirken nur in der Aktion bzw. auf der Fläche.'
        ],
        such: 'dark mode dunkel hell netzwerkplan symbole bilder ansicht menü design',
        zeigen: ['#ansichtBtn']
      })
    ]),

    /* ═══ 6 · Datei & Szenarien ══════════════════════════════════ */
    K('datei', 'Datei und Szenarien', [
      A('dateimenue', 'Neu, Öffnen, Sichern', {
        kurz: 'Das Menü <em>Datei</em> oben rechts. Der Stand wird außerdem laufend <b>automatisch im Browser</b> gespeichert.',
        bild: 'menue-datei', unter: 'Das Menü Datei',
        tabelle: {
          kopf: ['Eintrag', 'Wirkung'],
          zeilen: [
            ['<em>Neu</em>', 'leere Fläche (mit Rückfrage)'],
            ['<em>Öffnen …</em>', 'eine gesicherte Datei (.json) vom Gerät laden'],
            ['<em>Sichern</em>', 'das Netz samt Auftrag als Datei herunterladen'],
            ['<em>Szenarien …</em>', 'ein vorbereitetes Netz mit Auftrag laden'],
            ['<em>Als Szenario speichern</em>', 'nur Lehrkraft im Raum: unter „Eigene“ ablegen'],
            ['<em>Aufgabentext …</em>', 'nur Lehrkraft im Raum: Auftrag schreiben']
          ]
        },
        wissen: [
          'Im Klassenraum hat jeder Raum seinen eigenen Speicherplatz — das Netz aus 7b taucht nicht in 8c auf.',
          'Hochgeladene Dateien sind im gesicherten Stand enthalten, aber nicht im Rückgängig-Verlauf.'
        ],
        such: 'datei speichern sichern laden öffnen export import neu json herunterladen',
        zeigen: ['#dateiBtn']
      }),
      A('szenarien', 'Szenarien laden', {
        kurz: 'Fertige Netze mit Auftrag, aufsteigend nach Schwierigkeit. Laden ersetzt das aktuelle Netz (mit Rückfrage).',
        bild: 'menue-szenarien', unter: 'Datei → Szenarien …',
        tabelle: {
          kopf: ['Gruppe', 'Szenarien'],
          zeilen: [
            ['Sek I · Klasse 8', 'I.1 Zwei Geräte · I.2 Zwei Netze, ein Router · I.3 DHCP und WLAN · I.4 Mehrere Router · I.5 Fehler finden · I.6 Webseiten und DNS · I.7 Class Wide Web'],
            ['Sek II · Klasse 12', 'II.1 Fehler finden und wieder rein · II.2 Heimnetz und Internet · II.3 Webseiten und E-Mail · II.4 Web und E-Mail im CWW · II.5 Subnetzmasken · II.6 Routing-Tabelle · II.7 Großes eigenes Netz · II.8 Schichtenmodell'],
            ['Andere', '1. DHCP-Spoofing · 2. Der Handschlag · 3. Das große Netz']
          ]
        },
        wissen: [
          'Im Raum sieht die Klasse <b>nur die Szenarien, die Sie freigeben</b> (siehe „Im Klassenraum“).',
          'Lehrkraft: Reiter <em>Öffentlich</em> (mitgeliefert) und <em>Eigene</em>; das Symbol hinter einem Eintrag schaltet die Freigabe.'
        ],
        such: 'szenario szenarien aufgabe vorlage beispiel laden sek klasse 8 12 übung',
        zeigen: ['#dateiBtn']
      }),
      A('eigene', 'Eigene Szenarien und Aufgabentext', {
        kurz: 'Im Klassenraum können Sie jedes Netz als eigenes Szenario ablegen und einen eigenen Auftrag dazu schreiben. Eigene '
          + 'Szenarien hängen an Ihnen, nicht am Raum — sie stehen in jedem neuen Raum unter <em>Eigene</em>.',
        schritte: [
          'Netz bauen (oder ein Szenario abwandeln).',
          '<em>Datei → Aufgabentext …</em>: Auftrag schreiben (fett, kursiv, Aufzählung, Schriftgröße).',
          '<em>Datei → Als Szenario speichern</em>: Namen vergeben. Ist es schon ein eigenes: <em>Überschreiben</em> oder <em>Als neues speichern</em>.',
          'Im Szenario-Menü freigeben, damit die Klasse es sieht.'
        ],
        wissen: [
          'Jedes Szenario hat genau einen Auftrag.',
          'Löschen nimmt zuerst die Freigabe zurück; ein auf Tablets geöffnetes Netz bleibt dort stehen.'
        ],
        such: 'eigenes szenario speichern aufgabentext auftrag schreiben editor vorlage erstellen',
        zeigen: ['#dateiBtn']
      })
    ]),

    /* ═══ 7 · Im Klassenraum ═════════════════════════════════════ */
    K('raum', 'Im Klassenraum (MPSkills)', [
      A('pult', 'Das Pult der Lehrkraft', {
        kurz: 'Im Raum steht über SYNIR eine Leiste nur für Sie. Sie steuert die Klasse, nicht das eigene Netz.',
        html: '<div class="hi-pult" aria-hidden="true">'
          + '<span>Stand der Klasse</span><span>Internet der Klasse</span><span>Karte</span><i></i><span class="hi-pult-rot">Schüler blind</span>'
          + '</div>',
        tabelle: {
          kopf: ['Knopf', 'Wirkung'],
          zeilen: [
            ['<em>Stand der Klasse</em>', 'Liste aller im Raum mit Szenario, Geräteanzahl, letzter Änderung'],
            ['<em>Internet der Klasse</em>', 'welcher cww-Adressbereich wem gehört'],
            ['<em>Karte</em>', 'Netzplan der ganzen Klasse rund um die Wolke'],
            ['<em>Schüler blind</em>', 'Logo auf alle Tablets: „Wir machen jetzt am Beamer weiter.“']
          ]
        },
        tipp: 'Diese Hilfe springt auch hierher, wenn Sie bei offener Hilfe einen dieser Knöpfe drücken.',
        such: 'pult lehrkraft lehrer beamer raum klassenraum mpskills steuerung',
        zeigen: []
      }),
      A('freigeben', 'Szenarien freigeben', {
        kurz: 'Die Klasse sieht nur, was Sie freigeben. So bestimmen Sie, womit die Stunde beginnt.',
        schritte: [
          '<em>Datei → Szenarien …</em> öffnen.',
          'Hinter einem Szenario das Teilen-Symbol antippen — freigegebene sind grün hinterlegt.',
          'Auf den Tablets erscheint „Neues Szenario verfügbar“; die Klasse lädt es selbst.'
        ],
        wissen: [
          'Mitgelieferte stehen unter <em>Öffentlich</em>, Ihre eigenen unter <em>Eigene</em>.',
          'Schülerinnen und Schüler können nur auf ihrem Gerät sichern (Datei → Sichern).'
        ],
        such: 'freigeben teilen freigabe szenario klasse schüler verteilen',
        zeigen: ['#dateiBtn']
      }),
      A('klasse', 'Stand der Klasse und Beamer', {
        kurz: 'Jedes Tablet meldet laufend seinen Stand. Ein Tipp auf einen Namen legt dessen Netz auf Ihren Bildschirm (Beamer) — '
          + 'und folgt live, solange das Kind weiterarbeitet.',
        schritte: [
          'Pult → <em>Stand der Klasse</em>.',
          'Namen antippen: oben steht „Ansicht von …“.',
          '<em>Beenden</em> legt Ihr eigenes Netz zurück.'
        ],
        wissen: [
          'Tun Sie selbst etwas (Netz ändern, Aktion starten), wird es <b>Ihre Kopie</b> („Kopie von …“). Sie schreiben nie in das Netz eines Kindes.',
          'Sehr große Stände kommen ohne hochgeladene Dateien an („Datei liegt nur auf dem Tablet“).'
        ],
        tipp: 'Fehlersuche mit der ganzen Klasse: ein fehlerhaftes Schülernetz auf den Beamer legen und gemeinsam mit Mitschnitt und Subnetzen untersuchen.',
        such: 'stand klasse schüler zusehen spiegeln beamer präsentieren übernehmen kopie',
        zeigen: []
      }),
      A('internetklasse', 'Internet der Klasse und Karte', {
        kurz: 'Zwei Übersichten zum Class Wide Web: <em>Internet der Klasse</em> listet, welcher Adressbereich (/8) wem gehört; die '
          + '<em>Karte</em> zeigt alle Netze der Klasse um die Wolke herum.',
        wissen: [
          'Beides sehen nur Sie — die Klasse soll die Bereiche selbst herausfinden (traceroute, 8.8.8.8, fragen).',
          'Karte: Mausrad oder zwei Finger zoomen, ziehen verschiebt, <em>Alles zeigen</em>, <kbd>Esc</kbd> schließt.',
          'Netze, die seit 20 s nichts gemeldet haben, erscheinen gestrichelt und blass.',
          'Ihr eigener Bereich ist immer <code>100.0.0.0</code>.'
        ],
        such: 'internet der klasse karte netzplan klasse cww bereich /8 übersicht',
        zeigen: []
      }),
      A('blind', 'Schüler blind', {
        kurz: 'Legt auf jedes Tablet das SYNIR-Logo mit „Wir machen jetzt am Beamer weiter.“ — Eingaben sind gesperrt. '
          + 'Der Knopf ist rot, solange es gilt.',
        schritte: [
          'Pult → <em>Schüler blind</em>.',
          'Zum Aufheben denselben Knopf („Schüler sind blind — aufheben“) drücken.'
        ],
        wissen: [ 'Während „blind“ werden keine Stände der Tablets gespeichert; die Netze bleiben erhalten.' ],
        such: 'blind sperren schüler aufmerksamkeit beamer bildschirm sperren pause',
        zeigen: []
      })
    ]),

    /* ═══ 8 · Wenn etwas nicht klappt ════════════════════════════ */
    K('probleme', 'Wenn etwas nicht klappt', [
      A('ping', 'Ping geht nicht — Checkliste', {
        kurz: 'Die häufigsten Ursachen, in der Reihenfolge, in der man sie prüft. Der Text des Pings im Terminal sagt meist schon, wo.',
        schritte: [
          'Steht SYNIR in der <b>Aktion</b>? Läuft die Uhr (nicht ❚❚)?',
          'Sind beide Geräte <b>eingeschaltet</b> und <b>verkabelt</b> (Kabel nicht „gezogen“)?',
          'Haben beide eine <b>Adresse</b>? Warnzeichen <b>!</b> am Gerät beachten.',
          'Gleiches Netz? <em>Subnetze</em> einschalten: gleiche Farbe = gleiches Netz.',
          'Anderes Netz? Stimmt das <b>Gateway</b> — und liegt es im eigenen Netz?',
          'Mehrere Router? Kennt jeder Router den Weg (Weiterleitungstabelle oder RIP)? Prüfen mit <code>traceroute</code>.',
          'Firewall an einem Router dazwischen?',
          'Im <b>Mitschnitt</b> nachsehen, wo das Paket zuletzt auftaucht.'
        ],
        tabelle: {
          kopf: ['Meldung', 'heißt meist'],
          zeilen: [
            ['Niemand hat sich auf die ARP-Anfrage gemeldet', 'Ziel (oder Gateway) im selben Netz nicht da: Kabel, Adresse, Maske'],
            ['Kein Weg dorthin — es fehlt ein Standardgateway', 'beim Gerät ist kein Gateway eingetragen'],
            ['Das Standardgateway … liegt in keinem Netz dieses Geräts', 'Gateway-Adresse passt nicht zu Adresse/Maske'],
            ['Zeitüberschreitung — keine Antwort', 'Paket verschwunden: Router kennt den Weg nicht, Rückweg fehlt, NAT, Firewall (still verwerfen)'],
            ['Verboten — die Firewall …', 'eine Firewall mit „ablehnen“ sperrt']
          ]
        },
        such: 'ping geht nicht fehler fehlersuche problem nicht erreichbar zeitüberschreitung timeout arp checkliste',
        zeigen: []
      }),
      A('keineadresse', 'Gerät bekommt keine Adresse (DHCP)', {
        kurz: 'Unter dem Gerät steht dauerhaft „holt Adresse (DHCP)“.',
        schritte: [
          'Läuft die Aktion? DHCP fragt nur bei laufender Uhr.',
          'Gibt es einen DHCP-Server im <b>selben</b> Netz (Router leiten DHCP nicht weiter)? Marke <em>DHCP</em> sichtbar?',
          'Ist <em>DHCP aktivieren</em> beim Server angehakt und der Bereich passend zu seiner eigenen Adresse?',
          'Ist der Bereich voll (zu viele Geräte)?',
          'Im Terminal des Geräts <code>dhcp neu</code> versuchen; Mitschnitt-Filter <em>DHCP</em>.'
        ],
        such: 'dhcp keine adresse holt adresse problem fehler',
        zeigen: []
      }),
      A('webseite', 'Webseite oder Name geht nicht', {
        kurz: 'Der Browser zeigt einen Fehler, oder das Terminal meldet „Der DNS-Server kennt den Namen … nicht“.',
        schritte: [
          'Geht <code>ping</code> auf die <b>Adresse</b> des Servers? Wenn nicht: erst die Checkliste „Ping“.',
          'Läuft der Webserver (Marke <em>Web</em>)? Installiert allein reicht nicht.',
          'Für Namen: Ist beim Endgerät ein <b>DNS</b> eingetragen, läuft der DNS-Server, steht der Name in seiner Liste (Tippfehler)?',
          'Mit <code>nslookup name</code> prüfen, was der DNS antwortet.',
          'Bei https: hat der Server ein Zertifikat und vertraut der Browser der ZS (Schild)?',
          'Hinter einem Heimrouter: Portfreigabe für Port 80 vorhanden?'
        ],
        such: 'webseite lädt nicht browser fehler 404 name unbekannt dns problem https warnung',
        zeigen: []
      }),
      A('tasten', 'Alle Tastenkürzel', {
        kurz: 'Alles, was mit der Tastatur geht. In einem Eingabefeld gehören die Tasten dem Feld.',
        tabelle: {
          kopf: ['Taste', 'Wirkung'],
          zeilen: [
            ['<kbd>Strg</kbd>+<kbd>Z</kbd> · <kbd>Strg</kbd>+<kbd>Y</kbd>', 'rückgängig · wiederholen'],
            ['<kbd>Strg</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd>', 'kopieren · ausschneiden · einfügen'],
            ['<kbd>Strg</kbd>+<kbd>A</kbd>', 'alle Geräte markieren'],
            ['<kbd>Entf</kbd> · <kbd>Rücktaste</kbd>', 'Markierung löschen'],
            ['<kbd>Leertaste</kbd>', 'Uhr anhalten / weiter'],
            ['<kbd>.</kbd>', 'ein Einzelschritt'],
            ['<kbd>Esc</kbd>', 'Fenster und Kärtchen schließen · Befehl im Terminal abbrechen'],
            ['<kbd>Strg</kbd> + Ziehen · <kbd>Strg</kbd> + Klick', 'Rechteck-Auswahl · Gerät dazunehmen'],
            ['Mausrad · <kbd>Strg</kbd> + Mausrad', 'rollen · zoomen'],
            ['<kbd>F1</kbd>', 'diese Hilfe öffnen und schließen']
          ]
        },
        such: 'tastatur tasten kürzel shortcut hotkey strg esc',
        zeigen: []
      })
    ])
  ];
})();
