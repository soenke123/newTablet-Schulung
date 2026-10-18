# Master PDF Skill – Prototyp 0.5

Eigenständiger Prototyp mit HTML, CSS, Vanilla JavaScript, PDF.js und pdf-lib. Dateien werden lokal im Browser verarbeitet. Der Anwendungscode enthält keine Upload-Funktion, Analytics oder Telemetrie.

## Start

Doppelklick auf **`Master PDF Skill starten.bat`**. Der Browser öffnet sich mit der App (`http://localhost:5173`, bei belegtem Port der nächste freie). Das schwarze Fenster offen lassen; Schließen beendet die App. Es wird nichts installiert, auch kein Node.js.

Hintergrund: `index.html` lässt sich nicht direkt per Doppelklick (`file://`) öffnen, weil Browser dort ES-Module und den PDF.js-Worker blockieren. `tools/server.ps1` ist ein kleiner Webserver mit Windows-PowerShell-Bordmitteln, der nur die App-Dateien dieses Ordners ausliefert. Jeder andere statische Webserver funktioniert genauso.

Es gibt keinen Build-Schritt: Der Ordner kann unverändert auf einen Webserver kopiert werden (z. B. als Skill in MPSkills). Alle Pfade sind relativ.

Tests (benötigt Node.js 20 oder neuer):

```bash
npm test
```

## Im Prototyp enthalten

- **PDF öffnen** öffnet immer ein neues Dokument (bei nicht exportierten Änderungen mit Rückfrage); mehrere gewählte Dateien werden zu einem Dokument
- Reiter oben (nur im Modus Bearbeiten): **„Datei“** und **„Seite“** öffnen ein Menü, das über der Seite liegt und sich nach der Auswahl oder einem Klick daneben wieder schließt; **„Zeichnen“** und **„Kommentieren“** blenden ihre eigene **Werkzeugleiste** ein (noch einmal antippen blendet sie aus). Die Werkzeugleiste hängt standardmäßig senkrecht am rechten Rand; am Griff oben lässt sie sich frei verschieben und rastet nahe am rechten oder oberen Rand ein (oben waagerecht). **Doppelt auf den Griff tippen** wechselt zwischen einer Reihe und einem fast quadratischen Raster. Lage und Form merkt sich jede Leiste einzeln, auch nach dem Neuladen. Ein Werkzeug wird mit dem **ersten Tippen** gewählt; **noch einmal tippen** öffnet seine Einstellungen (Farbe, Form, Strich …, kleines Dreieck am Symbol). Formen und Text-Markieren sind je **ein** Symbol, das sich die zuletzt gewählte Art merkt; der Farbkreis zeigt die aktuelle Farbe und öffnet ebenfalls die Einstellungen.
- Menü **„Datei“**: **Neu** (leeres Dokument mit einer A4-Seite), **PDF öffnen**, **PDF hinzufügen** (fügt die Seiten hinter der Auswahl ein, mit Rückgängig), **PDF exportieren**. Im Lesemodus stehen „PDF öffnen“ und „PDF exportieren“ oben in der Kopfleiste
- Zwei Modi oben in der Kopfleiste: **Lesemodus** (Standard beim Start) zeigt alle Seiten untereinander zum Durchscrollen, die Seitenleiste markiert dabei die aktuelle Seite und springt per Klick zur Seite; **Bearbeiten** zeigt die Einzelseite mit allen Werkzeugen. Im Lesemodus sind Bearbeitungswerkzeuge, Sortieren per Drag & Drop, Kontextmenü und Bearbeitungs-Tastenkürzel ausgeblendet
- Im Modus Bearbeiten PDFs per Drag & Drop an einer bestimmten Position in der Seitenleiste einfügen (im Lesemodus öffnet eine abgelegte PDF ein neues Dokument); ein blauer Balken mit „hier“-Markierung zeigt die Einfügestelle (linke/rechte Kartenhälfte = davor/danach, in der Mini-Leiste obere/untere Hälfte)
- Dezente Farbcodierung pro Quelldokument mit Legende; jede Seite zeigt so, aus welcher PDF sie stammt
- Miniaturansichten und Dokumentvorschau; Miniaturen werden erst gerendert, wenn sie in Sichtweite kommen, und danach zwischengespeichert (auch große PDFs bleiben flüssig)
- Seiten, die schon im Original gedreht sind, werden richtig angezeigt und exportiert; die Gradzahl auf der Kachel zeigt nur die eigene Drehung
- Seitenleiste per Griff am rechten Rand breiter/schmaler ziehen (Doppelklick = Standardbreite); eingeklappt bleibt eine Mini-Leiste mit nummerierten, farbcodierten Kacheln
- Einzelauswahl, Strg/Cmd-Mehrfachauswahl und Shift-Bereichsauswahl; Pfeiltasten, Pos1 und Ende wechseln die Seite (mit Shift: Auswahl erweitern)
- Seiten per Drag & Drop sortieren; am Tablet/Handy und mit Stift: Seite kurz gedrückt halten und dann ziehen (am Rand der Liste wird automatisch gescrollt)
- Seitenaktionen im Menü **„Seite“** (nur im Modus Bearbeiten), jeweils mit Symbol und Beschriftung: rückgängig, wiederholen, kopieren, ausschneiden, einfügen, duplizieren, löschen, links/rechts drehen, leere Seite. Duplizieren und Löschen zusätzlich als Symbole auf der aktiven Seite. Löschen ohne Rückfrage, mit Hinweis und Rückgängig
- Kontextmenü mit allen Seitenaktionen: Rechtsklick, Kontextmenü-Taste oder am Touchgerät gedrückt halten und loslassen
- Leere Seite einfügen über **Leere Seite** im Menü „Seite“ (auch im Kontextmenü): hinter der Auswahl, ohne Auswahl am Ende; Größe und Ausrichtung wie die Seite davor
- Solange die Werkzeugleiste „Zeichnen“ oder „Kommentieren“ offen ist, stehen **alle Seiten untereinander** und man kann beim Zeichnen durchscrollen; ohne Leiste zeigt „Bearbeiten“ nur die aktive Seite
- **Handflächenerkennung am Tablet**: Sobald mit einem Stift gezeichnet wird, zeichnet nur noch der Stift; ein Finger blättert (mit Schwung), zwei Finger zoomen, eine aufgelegte Hand beim Schreiben wird ignoriert. Ein Hinweis erscheint beim ersten Mal; das **Stift-Symbol** unten in beiden Werkzeugleisten schaltet es aus und wieder an (wird pro Gerät im Browser gemerkt, erscheint erst, wenn ein Stift erkannt wurde)
- Werkzeugleiste **„Zeichnen“** (nur im Modus Bearbeiten), direkt auf der Seite mit Maus, Stift oder Finger:
  - **Stift** und **Textmarker** zum freien Markieren (transparent, liegt unter Schrift und Strichen): je drei Standardfarben plus bunter Kreis für eine **eigene Farbe** (Farbwähler des Systems), Regler für **Strichstärke** und **Deckkraft**
  - Formen **Linie**, **Pfeil**, **Rechteck**, **Ellipse** in Stiftfarbe, -stärke und -deckkraft; Rechteck und Ellipse wahlweise **hell oder voll gefüllt**, ihr Rand liegt innen an der Kante (keine dunklere Überlappung bei Transparenz); mit Shift in 45°-Schritten bzw. als Quadrat/Kreis
  - **Auswählen**: Element antippen (ungefüllte Formen am Rand, gefüllte auch innen), dann verschieben, an den **Anfassern die Größe ändern** (Ecken mit Shift im gleichen Verhältnis; Linien und Pfeile an ihren Enden, mit Shift in 45°-Schritten), Farbe, Stärke, Deckkraft und Füllung ändern oder mit Entf bzw. **Element löschen** entfernen
  - **Element kopieren** und **Element einfügen** (auch Strg+C/X/V, Strg+D dupliziert): die Kopie landet auf der aktuellen Seite (der sichtbaren), auf derselben Seite leicht versetzt; auf kleineren Seiten wird sie an den Rand geschoben, damit sie auf der Seite bleibt
  - **Radierer** mit zwei Arten: **Ganze Elemente** entfernt angetippte oder überstrichene Elemente; **Radieren** entfernt nur, was unter dem Radierer liegt (Größe einstellbar, Kreis zeigt sie an). Dabei werden Striche aufgeschnitten; getroffene Formen werden zu Strichen und verlieren ihre Füllung
  - Zeichnungen erscheinen auch in den Miniaturen, wandern beim Sortieren, Drehen, Duplizieren und Kopieren mit der Seite mit und werden beim Export **fest in die Seite übernommen** (als Vektorlinien, druckt in jedem Programm). Esc beendet das Werkzeug; mit zwei Fingern kann weiter gezoomt werden
- Werkzeugleiste **„Kommentieren“** (nur im Modus Bearbeiten) – Kommentare bleiben beim Export **echte PDF-Kommentare**, die andere Programme (Acrobat, Edge, Firefox …) als Kommentare anzeigen:
  - **Markieren**, **Unterstreichen**, **Durchstreichen**: über den Text ziehen oder ein Wort antippen (nur bei Text, der in der PDF als Text vorliegt); fünf Farben
  - **Notiz**: auf die Seite tippen, Text in der Kommentarliste schreiben; mit **Auswählen** verschieben
  - **Textfeld**: Text direkt sichtbar auf der Seite (Kommentar vom Typ FreeText, Helvetica); auf die Seite tippen, Text in der Kommentarliste schreiben, der Kasten wächst mit; Schriftgröße, Textfarbe, **Hintergrund** (ohne, Weiß, Hellgelb, Hellblau, Hellgrün) und **Rahmen** (ohne, Schwarz, Grau, Rot, Blau) wählbar, mit **Auswählen** verschieben. Hintergrund und Rahmen werden auch aus anderen Programmen eingelesen (Rahmen über /BS und /MK)
  - **Auswählen**: Kommentar antippen, Farbe ändern, mit Entf bzw. **Kommentar löschen** entfernen
  - Markierungen und Textfelder werden mitgedruckt, Notizen nicht (wie in anderen Programmen)
- Werkzeugleiste **„Einfügen“** (nur im Modus Bearbeiten) – alles wird beim Export **fest in die Seite übernommen**:
  - **Text**: auf die Seite tippen und direkt dort schreiben (mehrzeilig mit Enter); Esc, Strg+Enter oder Tippen daneben beendet. Schrift **Serifenlos/Serif/Schreibmaschine** (Helvetica, Times, Courier), **Fett**, Größe, Farbe – noch einmal auf das Text-Werkzeug oder auf **Aa** tippen. Ausgewählten Text noch einmal antippen (oder mit dem Text-Werkzeug antippen) zum Ändern; leer gemacht verschwindet er. **Ecken** vergrößern die Schrift, die **Seitenkanten** geben eine Breite vor, an der die Zeilen umbrechen. Beim Export wird er **echter, durchsuchbarer Text** in der Seite. Umlaute, ß, € gehen; Zeichen, die die PDF-Grundschriften nicht kennen (Emojis, griechische Buchstaben …), werden zu „?“ – darauf weist die App hin
  - **Bild** (JPG, PNG, auch andere Formate, die der Browser öffnen kann; Fotos werden auf höchstens 2000 Pixel verkleinert und richtig herum gedreht): erscheint in der Mitte des sichtbaren Teils der aktuellen Seite
  - **Unterschrift**: im Feld mit Stift, Finger oder Maus unterschreiben (Schwarz oder Blau), auf Wunsch **Klarname** und **Datum** darunter. **„Auf diesem Gerät merken“** (aus, bis man es ankreuzt) speichert sie nur lokal im Browser – der Dialog sagt das dazu; gemerkte Unterschriften erscheinen oben im Dialog zum Antippen und lassen sich mit × löschen (höchstens fünf)
  - **Auswählen**: Bild oder Unterschrift antippen, in der Mitte verschieben, an den **Punkten am Rand** die Größe ändern (Ecken behalten das Seitenverhältnis, Kanten ziehen in die Breite bzw. Höhe), Entf bzw. **Element löschen** entfernt; Strg+C/V/D kopiert. Auf gedrehten Seiten steht das Eingefügte so aufrecht, wie die Seite gerade angezeigt wird
- **Kommentarliste** (Sprechblase oben rechts, in beiden Modi): alle Kommentare nach Seiten mit Autor, Datum, markiertem Text und Antworten; Klick springt zur Stelle. Beim Bearbeiten: Text ändern, antworten, löschen, **Status** setzen (Angenommen, Abgelehnt, Abgebrochen, Erledigt – wie in Acrobat, wird als PDF-Status gespeichert), eigener Name für neue Kommentare (bleibt im Browser gespeichert). **Filter** nach Art, Status und Person (betrifft nur die Liste). Ein Klick auf einen Kommentar auf der Seite zeigt ihn in der Liste
- **Kommentare aus anderen Programmen** werden beim Öffnen eingelesen: Notizen samt Antworten, Markierungen, Unterstreichungen, Durchstreichungen, Wellenlinien, dazu Textfelder, Freihand, Formen, Stempel. Sie lassen sich lesen, beantworten, löschen und (Notizen, Textkommentare und Textfelder) umfärben, Textfelder auch im Text ändern; ein gesetzter Status wird mitgelesen; unverändert bleiben sie beim Export die Original-Kommentare
- **Formulare ausfüllen** (in beiden Modi, ohne Werkzeug): Textfelder (auch mehrzeilig), Kontrollkästchen, Optionsfelder und Auswahllisten sind blau hinterlegt und lassen sich direkt antippen. Beim Export bleibt das Formular ein echtes Formular mit den neuen Werten, das andere Programme erkennen und weiter ausfüllen können; doppelte Seiten bekommen eigene Felder mit demselben Wert, Felder mit gleichem Namen aus zwei Dateien werden umbenannt („Name_2“)
- Undo/Redo für Seitenänderungen, Zeichnungen, Kommentare und Formulareinträge (bis zu 50 Schritte)
- Tastenkürzel: Strg/Cmd+Z rückgängig, Strg/Cmd+Y oder Strg/Cmd+Shift+Z wiederholen, Strg+A alle Seiten, Strg+C/X/V Seiten kopieren/ausschneiden/einfügen (hinter der Auswahl), Strg+D duplizieren, Entf löschen, Strg+S exportieren, Strg+Shift+S Auswahl exportieren, Strg+F suchen, Strg++/Strg+− zoomen, Strg+0 automatische Größe, Esc schließt Suche bzw. Fokusmodus
- **PDF exportieren** mit drei Optionen: **Ganzes Dokument** (Standard), **Aktuelle Seite** oder **Auswahl** – Standard, wenn mehrere Seiten markiert sind; das Feld ist mit den markierten Seiten vorbelegt und nimmt Angaben wie `1-3, 4, 10-12` an. Danach folgt der Speichern-Dialog des Systems, wo der Browser ihn anbietet, sonst Dateiname im selben Dialog mit Download
- Gemeinsam genutzte Schriften und Bilder werden beim Export nur einmal gespeichert
- Fortschrittsanzeige in der Statusleiste beim Export; schlägt der Export fehl, wird keine Datei als gespeichert gemeldet
- Hinweis „Nicht gespeichert“ (und ● im Tab-Titel), solange Änderungen nicht als komplettes Dokument exportiert sind; beim Schließen des Tabs warnt der Browser dann
- **Ansicht** oben rechts über dem Dokument, in beiden Modi: Suchen, Verkleinern/Vergrößern (Klick auf die Prozentzahl = automatische Größe), **Seitenbreite** und **Ganze Seite**. Nur im Lesemodus zusätzlich **Zwei Seiten nebeneinander** und **Fokusmodus**
- Zoomen mit zwei Fingern auf Touchpad oder Touchscreen (und Strg+Mausrad); die Stelle unter den Fingern bleibt dabei stehen. 100 % entspricht der Originalgröße
- **Fokusmodus**: nur die Seiten auf schwarzem Grund im Vollbild (wo der Browser es nicht erlaubt, im Fenster). Bei Mausbewegung oder Tippen erscheint unten eine kleine Leiste mit Zoom, Seitenzahl und „Beenden“; Esc beendet ihn
- **Suche** (Strg+F) im Text aller Seiten: Trefferzahl, Trefferliste mit Textausschnitt und Seitenzahl (Klick auf „x von y“ blendet die Liste ein und aus), Enter/Shift+Enter springt zum nächsten/vorigen Treffer, Treffer sind auf der Seite markiert
- Responsive Layout-Grundlage und Datei-Drop im Browser

## Bewusste Grenzen

- Noch kein automatisches Speichern. Undo/Redo deckt Seitenreihenfolge, Drehung, Duplizieren, Einfügen, leere Seiten, Löschen, das Hinzufügen weiterer PDFs sowie alle Zeichenschritte ab; Exportaktionen sind keine Verlaufsschritte.
- Der Hinweis „Nicht gespeichert“ verschwindet nur nach dem Export des kompletten Dokuments in der aktuellen Reihenfolge, nicht nach einem Teil-Export.
- Bewusst nicht enthalten: PDF aufteilen. Seitenformat-Anzeige und Zuschneiden sind zurückgestellt.
- Die Suche findet nur Text, der in der PDF als Text vorliegt (keine gescannten Seiten ohne Texterkennung). Treffermarkierungen sind auf das Zeichen genau geschätzt, nicht pixelgenau.
- Zeichnungen sind nur bis zum Export bearbeitbar: In der exportierten PDF sind sie Teil des Seiteninhalts und lassen sich (auch in anderen Programmen) nicht mehr verschieben oder einzeln löschen. Gezeichnet wird bisher nur auf der Einzelseite im Modus Bearbeiten. Gezeichnete Elemente lassen sich verschieben, aber noch nicht mit Anfassern in der Größe ändern, und nicht über Strg+C/V kopieren (das kopiert Seiten). Der Textmarker ist frei geführt; der an Text gekoppelte Textmarker kommt mit dem Reiter „Kommentieren“.
- Kommentare: Die Buchstabenbreiten für Markierungen werden mit der Schriftfamilie gemessen, die PDF.js meldet, und können bei ungewöhnlichen Schriften leicht danebenliegen. Textfelder aus anderen Programmen zeigt die App in ihrer eigenen Darstellung (Helvetica, ohne Rahmen und Hinweislinien); unverändert bleibt beim Export aber die Original-Darstellung erhalten. Freihand, Formen und Stempel aus anderen Programmen lassen sich nicht verschieben oder umfärben. Rich-Text-Formatierung und private Häkchen („Markiert“) werden nicht angezeigt; von mehreren Status-Angaben an einem Kommentar übernimmt die App nur die neueste. Der Filter blendet Kommentare nur in der Liste aus, nicht auf der Seite.
- Noch keine Textauswahl zum Kopieren in der Ansicht, Textbearbeitung, OCR, Formularfelder anlegen, sichere Schwärzung oder PWA-Offlinekonfiguration. Formulare: keine Schaltflächen, Unterschriftsfelder und Formular-Skripte (Berechnungen); XFA-Formulare werden nicht unterstützt.
- Export erstellt eine neue PDF aus kopierten Seiten. Kommentare und Formulare werden übernommen (siehe oben); Lesezeichen, Metadaten, Ebenen und eingebettete Dateien werden durch diesen Workflow nicht garantiert erhalten. Vor dem produktiven Einsatz müssen solche Fälle getestet werden.
- Passwortgeschützte oder beschädigte PDFs können beim Öffnen scheitern.
- Sehr große Dokumente können den verfügbaren Arbeitsspeicher des Browsers überschreiten.
- Seitenidentitäten und Farbcodierungen gelten für die aktuelle Sitzung. Die Farbpalette wiederholt sich nach acht Quelldokumenten.

## Bibliotheken und Lizenzen

- **PDF.js (`pdfjs-dist` 5.7.284)** – Apache License 2.0; Rendering und Textanalyse, keine vollständige Bearbeitungsengine.
- **pdf-lib 1.17.1** – MIT License; PDF-Erzeugung und Seitenmanipulation, kein allgemeines Bearbeiten vorhandenen Seitentextes.

Beide liegen mit ihren Lizenzdateien fest in `lib/` (Details und Aktualisierung: `lib/README.md`). Vor einer Verteilung sollte ein `THIRD-PARTY-NOTICES`-Dokument ergänzt werden.

## Datenschutz und Bereitstellung

Der Anwendungscode sendet PDF-Dateien nicht an einen Server. Für die Auslieferung der Web-App wird selbstverständlich ein Webserver benötigt; dieser Prototyp besitzt keine Upload- oder Telemetriefunktion. Vor der Veröffentlichung Netzwerkzugriffe im Browser prüfen. Eine echte Offline-PWA benötigt zusätzlich Manifest, Service Worker und lokal verfügbare Assets/Worker.
