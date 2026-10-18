# Plan: Seiten bearbeiten (Zeichnen, Kommentieren, Einfügen)

Die Reiter **Datei** und **Seite** bilden die „Seitenwerkstatt“: Seiten organisieren (Phase 2 im `MASTER_PROMPT.md`).
Die folgenden Reiter bearbeiten den **Inhalt einer Seite** (Phase 3 und 4). Stand: 16.10.2026.

## Grundsatz: Was bleibt Annotation, was wird fest eingebettet?

Annotationen werden in vielen Programmen nicht mitgedruckt, weil das Druck-Flag fehlt oder weil im Druckdialog „nur Dokument“ gewählt ist.
Nur Inhalte, die fest in der Seite stehen, werden garantiert gedruckt. Daher gilt:

| Reiter | Werkzeug | Beim Export |
|---|---|---|
| Kommentieren | Textmarker, Unterstreichen, Durchstreichen (an Text gekoppelt) | **Annotation** (Highlight/Underline/StrikeOut) **mit** Druck-Flag. Andere Programme erkennen sie als Kommentare, sie werden meistens trotzdem gedruckt. |
| Kommentieren | Notizen (Haftnotiz/Randkommentar) | **Annotation** (Text/Popup) **ohne** Druck-Flag. |
| Zeichnen | Stift, freier Textmarker, Linie, Pfeil, Rechteck, Ellipse | **fest eingebettet** (Vektorgrafik im Seiteninhalt) |
| Einfügen | Textfeld, Bild, Unterschrift | **fest eingebettet** (Text bleibt echter, durchsuchbarer Text) |

- In der App bleibt bis zum Export alles bearbeitbar (verschieben, löschen, rückgängig). Fest wird es erst in der exportierten Datei.
- Eine Export-Option „Kommentare fest einbetten“ ist vorerst **nicht** gewünscht.
- Die Unterschrift ist eine handschriftliche Unterschrift (Bild), keine kryptografische digitale Signatur.

## Reiter und Reihenfolge

1. **Fundament + Stift** ✅ erledigt
   - Datenmodell: `p.marks` am Seiteneintrag, Koordinaten im PDF-Raum der ungedrehten Seite (`js/annotations.js`). Dadurch wandern die Zeichnungen mit, wenn Seiten sortiert, gedreht, dupliziert oder kopiert werden.
   - SVG-Ebene über Seite und Miniatur, Undo/Redo, fester Export (`drawMarks` in `js/export.js`).
   - Reiter „Zeichnen“ mit Stift (5 Farben, 3 Stärken) und Radierer (entfernt ganze Striche).
2. **Zeichnen vervollständigen** ✅ erledigt: freier Textmarker (transparent, multipliziert, eigene Farben/Breiten), Linie, Pfeil, Rechteck, Ellipse (Shift rastet ein), Auswählen mit Verschieben, Umfärben, Stärke ändern und Löschen; Radierer für alle Elemente.
   - Nachgerüstet: je drei Standardfarben + bunter Kreis (eigene Farbe, `<input type=color>`), Regler für Strichstärke und Deckkraft (alle Elemente), Füllung hell/voll für Rechteck und Ellipse, Radierer mit zwei Arten „Ganze Elemente“ / „Radieren“ (schneidet Striche auf, `eraseMarks`; getroffene Formen werden Striche ohne Füllung).
   - Nachgerüstet (2): Größe ändern mit Anfassern (`scaleMark`, Linien/Pfeile an den Enden); Rand von Rechteck/Ellipse liegt innen (`strokeBox`), gefüllte Formen sind eine Transparenzgruppe (Füllung unter deckendem Rand, Deckkraft für die Gruppe) – keine Überlappung, keine Naht.
   - Nachgerüstet (3): Elemente kopieren/einfügen (Knöpfe in der Leiste, Strg+C/X/V/D; Kopie auf der aktuellen Seite, auf derselben Seite versetzt, auf kleineren Seiten an den Rand geschoben, `placeMark`).
3. **Kommentieren** ✅ erledigt: Markieren, Unterstreichen, Durchstreichen an Text gekoppelt (Textauswahl über PDF.js-Textinhalt, Buchstabenbreiten per Canvas gemessen), Notizen, Kommentarliste (bearbeiten, antworten, löschen, zur Stelle springen, Name für neue Kommentare). Export als echte PDF-Annotationen mit Darstellung (`/AP`) und Popup; Antworten als `/IRT`. Vorhandene Kommentare werden beim Öffnen eingelesen (auch Antworten) und unverändert als Original-Objekte exportiert. Geprüft mit PDF.js (erneut geöffnet) und Poppler.
   - Nachgerüstet: Textfeld (FreeText mit Helvetica-Darstellung, Kasten wächst mit dem Text, Schriftgröße/Textfarbe), Status (Review-Antwort mit /State, wird eingelesen), Filter der Kommentarliste (Art, Status, Person); Textfelder aus anderen Programmen sind bearbeitbar (eigene Darstellung).
   - Nachgerüstet (2): Rahmen und Hintergrund für Textfelder (je fünf Möglichkeiten inkl. „ohne“; Export /C, /BS, /MK /BC + Darstellung, Import über PDF.js `color`/`borderStyle`/`borderColor`; Rundreise im Browser geprüft).
   - Noch offen: Status/Textfeld in Acrobat, Edge und Firefox prüfen (braucht die echten Programme, beim Nutzer).
4. **Einfügen**: Textfeld (Schrift, Größe, Farbe; mehrzeilig), Bild, **Unterschrift**: Feld zum Unterschreiben, optional Klarname darunter und Datum, danach frei auf der Seite verschieben und skalieren.
   - ✅ Bild und Unterschrift (18.10.2026): eigene Werkzeugleiste „Einfügen“ mit dem Zeiger-Werkzeug „Auswählen“ (dasselbe wie beim Zeichnen), Bild, Unterschrift, Rückgängig/Wiederholen, Löschen. Beide sind Bild-Elemente in `p.marks` (`type:'image'`), Anfasser an Ecken (Seitenverhältnis bleibt) und Kanten, fest eingebettet als Bild-XObject (gleiches Bild nur einmal in der Datei). Name und Datum sind Teil des Unterschrift-Bildes.
   - ✅ Text (18.10.2026): Werkzeug „Text“ in der Leiste „Einfügen“, Schreiben direkt auf der Seite (Textfeld über der Stelle), Schrift Helvetica/Times/Courier, fett, Größe, Farbe; Ecken skalieren die Schrift, Seitenkanten setzen eine Umbruchbreite. Export als echter Text in den PDF-Grundschriften (WinAnsi: Umlaute, ß, € gehen; Emojis u. ä. werden „?“, die App warnt). Eine eingebettete eigene Schrift (für alle Zeichen) bräuchte fontkit – bewusst nicht, solange WinAnsi reicht.
   - Damit ist der Reiter „Einfügen“ vollständig. Ideen für später: Text ausrichten (zentriert/rechts), Hintergrund/Rahmen für eingebetteten Text, Bild drehen.
   - Entschieden (18.10.2026): Die Unterschrift darf **lokal im Browser gespeichert** werden (für spätere Dokumente), aber nur mit **sichtbarem Hinweis**, dass sie lokal auf diesem Gerät liegt (und wie man sie dort wieder löscht). Nichts wird hochgeladen.

5. **Formulare** (Phase 4 im Master-Prompt)
   - ✅ Ausfüllen (18.10.2026): Felder werden beim Öffnen erkannt (Text ein-/mehrzeilig, Kontrollkästchen, Optionsfelder, Auswahllisten), in beiden Modi blau hinterlegt und direkt ausfüllbar, mit Rückgängig. Export als **echtes Formular** (neues /AcroForm mit den neuen Werten und neuem Aussehen), andere Programme erkennen es und können weiter ausfüllen. Doppelte Seiten: eigene Widgets desselben Felds. Teil-Export: nur Felder der exportierten Seiten. Gleiche Namen aus zwei Dateien → „Name_2“. Geprüft mit pdf-lib (Tests) und im Browser.
   - Nicht dabei: Schaltflächen, Unterschriftsfelder, Formular-Skripte (Berechnungen, Formatierung), XFA. „Formular fest einbetten“ (Felder in die Seite drucken, nicht mehr änderbar) wäre eine spätere Export-Option.
   - Noch offen: Rundreise in Acrobat, Edge und Firefox prüfen (beim Nutzer).
   - ✅ Erstellen, Teil 1 (18.10.2026, entschieden: Text und Kontrollkästchen zuerst, Name automatisch, sofort ausfüllbar): Werkzeuge „Formular-Textfeld“ und „Kontrollkästchen“ in der Leiste „Einfügen“; aufziehen oder antippen (Standardgröße), Textfeld ab etwa zwei Zeilen Höhe mehrzeilig. Namen „Textfeld 1“, „Kontrollkästchen 1“ …, Kopien bekommen einen neuen Namen. Verschieben/Größe/Kopieren/Löschen/Rückgängig wie Bilder. Ohne Werkzeug oder im Lesemodus sofort ausfüllbar. Export: echte AcroForm-Felder (dünner grauer Rahmen, kein Hintergrund), auch auf gedrehten Seiten aufrecht; erneut geöffnet erkennt die App sie als Formular.
   - Später: Optionsgruppe und Auswahlliste anlegen, Feldname/Pflichtfeld/Schriftgröße im Einstellungs-Fenster ändern.

6. **Bearbeiten** ✅ (18.10.2026): eigener Reiter mit Werkzeugleiste.
   - **Text ändern** (Modus B im Master-Prompt): `js/textedit.js` liest den Seiteninhalt (Operatoren, Schriftbreiten aus /Widths bzw. /W, ToUnicode), findet die Buchstaben unter der Auswahl und nimmt sie beim Export aus ihrem Tj/TJ (ihre Breite bleibt als Abstand, der Rest der Zeile bleibt stehen). Neuer Text mit derselben Textmatrix, Größe und Farbe, in der Originalschrift, wenn sie alle Zeichen hat, sonst Standardschrift. Nicht im Seiteninhalt gefunden (Scan, Form-XObject, senkrechte Schrift) → alte Stelle wird in der Hintergrundfarbe überdeckt, die App sagt es.
   - **Schwärzen**: Seite wird beim Export aus einem Bild (200 dpi, Kästen eingebrannt) neu aufgebaut, Text außerhalb der Kästen unsichtbar darüber. Vorbild PDF24. Nach dem Export prüft die App die Datei mit PDF.js (kein Text, keine Annotation unter einem Kasten), sonst wird nichts gespeichert (Forderung im Master-Prompt, Abschnitt „Sichere Schwärzung“).
   - **Wasserzeichen**: ein Text für alle Seiten, im Verlauf (Undo).
   - **OCR** (Modus C): Tesseract.js lokal in `lib/tesseract/`, Deutsch; Ergebnis je Quellseite (`source.ocr`), fließt in Suche, Markieren, Text ändern und als unsichtbarer Text in den Export.
   - Ideen für später: Text ändern mit Nachrücken der Zeile, Schwärzen nach Suchbegriff („alle Vorkommen von …“), Wasserzeichen nur auf bestimmten Seiten oder als Bild, weitere OCR-Sprachen.

Später (Master-Prompt, nicht eingeplant): Stempel, Kopf-/Fußzeilen, Seitenzahlen.

## Zurückgestellte Ideen

- **Schwebende Werkzeugleiste wie in Acrobat** (senkrecht am rechten Rand, nur Symbole mit Hinweis beim Überfahren, kleine Box für Farbe/Größe, oben verschiebbar, Doppelklick dockt wieder rechts an). Vorerst verworfen: Zeichnen und Kommentieren sollen klar über die Reiter oben getrennt bleiben. Der Nutzer überlegt noch, wie die Leiste oben schlanker werden kann.

## Entschiedene Fragen (18.10.2026)

- **Scrollen beim Zeichnen: ja.** ✅ umgesetzt: Solange die Leiste „Zeichnen“ oder „Kommentieren“ offen ist, zeigt „Bearbeiten“ alle Seiten untereinander (`singleView()` in app.js); ohne Leiste bleibt es bei der Einzelseite.
- **Handflächenerkennung: ja.** ✅ umgesetzt: Sobald ein Stift mit einem Werkzeug benutzt wird, zeichnet nur noch der Stift; ein Finger blättert (mit Schwung), zwei Finger zoomen, die Hand beim Schreiben wird ignoriert. Pro Gerät gemerkt (localStorage `master-pdf-skill.pen-only`), Stift-Symbol in beiden Leisten schaltet um.
- **Unterschrift lokal merken: ja, mit Hinweis**, dass sie nur lokal im Browser liegt. ✅ umgesetzt: Haken „Auf diesem Gerät merken“ (standardmäßig aus), Hinweis im Dialog, Löschen mit ×, localStorage `master-pdf-skill.signatures` (höchstens fünf).
