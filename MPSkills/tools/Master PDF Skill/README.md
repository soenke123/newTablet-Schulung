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
- Reiter **„Datei“** (nur im Modus Bearbeiten): **Neu** (leeres Dokument mit einer A4-Seite), **PDF öffnen**, **PDF hinzufügen** (fügt die Seiten hinter der Auswahl ein, mit Rückgängig), **PDF exportieren**. Im Lesemodus stehen „PDF öffnen“ und „PDF exportieren“ oben in der Kopfleiste
- Zwei Modi oben in der Kopfleiste: **Lesemodus** (Standard beim Start) zeigt alle Seiten untereinander zum Durchscrollen, die Seitenleiste markiert dabei die aktuelle Seite und springt per Klick zur Seite; **Bearbeiten** zeigt die Einzelseite mit allen Werkzeugen. Im Lesemodus sind Bearbeitungswerkzeuge, Sortieren per Drag & Drop, Kontextmenü und Bearbeitungs-Tastenkürzel ausgeblendet
- Im Modus Bearbeiten PDFs per Drag & Drop an einer bestimmten Position in der Seitenleiste einfügen (im Lesemodus öffnet eine abgelegte PDF ein neues Dokument); ein blauer Balken mit „hier“-Markierung zeigt die Einfügestelle (linke/rechte Kartenhälfte = davor/danach, in der Mini-Leiste obere/untere Hälfte)
- Dezente Farbcodierung pro Quelldokument mit Legende; jede Seite zeigt so, aus welcher PDF sie stammt
- Miniaturansichten und Dokumentvorschau; Miniaturen werden erst gerendert, wenn sie in Sichtweite kommen, und danach zwischengespeichert (auch große PDFs bleiben flüssig)
- Seiten, die schon im Original gedreht sind, werden richtig angezeigt und exportiert; die Gradzahl auf der Kachel zeigt nur die eigene Drehung
- Seitenleiste per Griff am rechten Rand breiter/schmaler ziehen (Doppelklick = Standardbreite); eingeklappt bleibt eine Mini-Leiste mit nummerierten, farbcodierten Kacheln
- Einzelauswahl, Strg/Cmd-Mehrfachauswahl und Shift-Bereichsauswahl; Pfeiltasten, Pos1 und Ende wechseln die Seite (mit Shift: Auswahl erweitern)
- Seiten per Drag & Drop sortieren; am Tablet/Handy und mit Stift: Seite kurz gedrückt halten und dann ziehen (am Rand der Liste wird automatisch gescrollt)
- Seitenaktionen im Reiter **„Seite“** (nur im Modus Bearbeiten), jeweils mit Symbol und Beschriftung: rückgängig, wiederholen, kopieren, ausschneiden, einfügen, duplizieren, löschen, links/rechts drehen, leere Seite. Duplizieren und Löschen zusätzlich als Symbole auf der aktiven Seite. Löschen ohne Rückfrage, mit Hinweis und Rückgängig
- Kontextmenü mit allen Seitenaktionen: Rechtsklick, Kontextmenü-Taste oder am Touchgerät gedrückt halten und loslassen
- Leere Seite einfügen über **Leere Seite** im Reiter „Seite“ (auch im Kontextmenü): hinter der Auswahl, ohne Auswahl am Ende; Größe und Ausrichtung wie die Seite davor
- Reiter **„Zeichnen“** (nur im Modus Bearbeiten), direkt auf der Seite mit Maus, Stift oder Finger:
  - **Stift** (fünf Farben, drei Strichstärken) und **Textmarker** zum freien Markieren (eigene Farben und Breiten, transparent, liegt unter Schrift und Strichen)
  - Formen **Linie**, **Pfeil**, **Rechteck**, **Ellipse** in Stiftfarbe und -stärke; mit Shift in 45°-Schritten bzw. als Quadrat/Kreis
  - **Auswählen**: Element antippen (Formen am Rand), dann verschieben, über die Farb- und Stärkeknöpfe ändern oder mit Entf bzw. **Element löschen** entfernen
  - **Radierer** entfernt ganze Elemente beim Antippen oder Überstreichen
  - Zeichnungen erscheinen auch in den Miniaturen, wandern beim Sortieren, Drehen, Duplizieren und Kopieren mit der Seite mit und werden beim Export **fest in die Seite übernommen** (als Vektorlinien, druckt in jedem Programm). Esc beendet das Werkzeug; mit zwei Fingern kann weiter gezoomt werden
- Reiter **„Kommentieren“** (nur im Modus Bearbeiten) – Kommentare bleiben beim Export **echte PDF-Kommentare**, die andere Programme (Acrobat, Edge, Firefox …) als Kommentare anzeigen:
  - **Markieren**, **Unterstreichen**, **Durchstreichen**: über den Text ziehen oder ein Wort antippen (nur bei Text, der in der PDF als Text vorliegt); fünf Farben
  - **Notiz**: auf die Seite tippen, Text in der Kommentarliste schreiben; mit **Auswählen** verschieben
  - **Auswählen**: Kommentar antippen, Farbe ändern, mit Entf bzw. **Kommentar löschen** entfernen
  - Markierungen werden mitgedruckt, Notizen nicht (wie in anderen Programmen)
- **Kommentarliste** (Sprechblase oben rechts, in beiden Modi): alle Kommentare nach Seiten mit Autor, Datum, markiertem Text und Antworten; Klick springt zur Stelle. Beim Bearbeiten: Text ändern, antworten, löschen, eigener Name für neue Kommentare (bleibt im Browser gespeichert). Ein Klick auf einen Kommentar auf der Seite zeigt ihn in der Liste
- **Kommentare aus anderen Programmen** werden beim Öffnen eingelesen: Notizen samt Antworten, Markierungen, Unterstreichungen, Durchstreichungen, Wellenlinien, dazu Textfelder, Freihand, Formen, Stempel. Sie lassen sich lesen, beantworten, löschen und (Notizen und Textkommentare) umfärben; unverändert bleiben sie beim Export die Original-Kommentare
- Undo/Redo für Seitenänderungen, Zeichnungen und Kommentare (bis zu 50 Schritte)
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
- Zeichnungen sind nur bis zum Export bearbeitbar: In der exportierten PDF sind sie Teil des Seiteninhalts und lassen sich (auch in anderen Programmen) nicht mehr verschieben oder einzeln löschen. Gezeichnet wird bisher nur auf der Einzelseite im Modus Bearbeiten. Gezeichnete Elemente lassen sich verschieben, aber noch nicht in der Größe ändern, und nicht über Strg+C/V kopieren (das kopiert Seiten). Der Textmarker ist frei geführt; der an Text gekoppelte Textmarker kommt mit dem Reiter „Kommentieren“.
- Kommentare: Die Buchstabenbreiten für Markierungen werden mit der Schriftfamilie gemessen, die PDF.js meldet, und können bei ungewöhnlichen Schriften leicht danebenliegen. Bei Textfeld-Kommentaren aus anderen Programmen lässt sich der Text nicht ändern (er steckt in deren Darstellung); Freihand, Formen und Stempel aus anderen Programmen lassen sich nicht verschieben oder umfärben. Kommentarfelder wie Status („Erledigt“) oder Rich-Text-Formatierung werden nicht angezeigt.
- Noch keine Textauswahl zum Kopieren in der Ansicht, Textbearbeitung, OCR, Formulare, sichere Schwärzung oder PWA-Offlinekonfiguration.
- Export erstellt eine neue PDF aus kopierten Seiten. Kommentare werden übernommen (siehe oben); Formulare, Lesezeichen, Metadaten, Ebenen und eingebettete Dateien werden durch diesen Workflow nicht garantiert erhalten. Vor dem produktiven Einsatz müssen solche Fälle getestet werden.
- Passwortgeschützte oder beschädigte PDFs können beim Öffnen scheitern.
- Sehr große Dokumente können den verfügbaren Arbeitsspeicher des Browsers überschreiten.
- Seitenidentitäten und Farbcodierungen gelten für die aktuelle Sitzung. Die Farbpalette wiederholt sich nach acht Quelldokumenten.

## Bibliotheken und Lizenzen

- **PDF.js (`pdfjs-dist` 5.7.284)** – Apache License 2.0; Rendering und Textanalyse, keine vollständige Bearbeitungsengine.
- **pdf-lib 1.17.1** – MIT License; PDF-Erzeugung und Seitenmanipulation, kein allgemeines Bearbeiten vorhandenen Seitentextes.

Beide liegen mit ihren Lizenzdateien fest in `lib/` (Details und Aktualisierung: `lib/README.md`). Vor einer Verteilung sollte ein `THIRD-PARTY-NOTICES`-Dokument ergänzt werden.

## Datenschutz und Bereitstellung

Der Anwendungscode sendet PDF-Dateien nicht an einen Server. Für die Auslieferung der Web-App wird selbstverständlich ein Webserver benötigt; dieser Prototyp besitzt keine Upload- oder Telemetriefunktion. Vor der Veröffentlichung Netzwerkzugriffe im Browser prüfen. Eine echte Offline-PWA benötigt zusätzlich Manifest, Service Worker und lokal verfügbare Assets/Worker.
