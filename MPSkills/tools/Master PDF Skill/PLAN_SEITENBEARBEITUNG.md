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
   - Noch offen: Größe ändern (Anfasser), Elemente kopieren/einfügen, Deckkraft-Regler, Füllung für Formen.
3. **Kommentieren**: Textmarker, Unterstreichen, Durchstreichen an Text gekoppelt (Textauswahl über PDF.js-Textinhalt, wie bei der Suche), Notizen, Kommentarübersicht (bearbeiten, löschen, zur Seite springen). Export als echte PDF-Annotationen mit Darstellung (`/AP`); in Acrobat, Edge und Firefox prüfen. Vorhandene Annotationen beim Öffnen erhalten.
4. **Einfügen**: Textfeld (Schrift, Größe, Farbe; mehrzeilig), Bild, **Unterschrift**: Feld zum Unterschreiben, optional Klarname darunter und Datum, danach frei auf der Seite verschieben und skalieren.

Später (Master-Prompt, nicht eingeplant): Stempel, Wasserzeichen, Reiter „Bearbeiten“ (vorhandenen Text ändern, nur eingeschränkt zuverlässig möglich), OCR, Formulare, Schwärzen.

## Zurückgestellte Ideen

- **Schwebende Werkzeugleiste wie in Acrobat** (senkrecht am rechten Rand, nur Symbole mit Hinweis beim Überfahren, kleine Box für Farbe/Größe, oben verschiebbar, Doppelklick dockt wieder rechts an). Vorerst verworfen: Zeichnen und Kommentieren sollen klar über die Reiter oben getrennt bleiben. Der Nutzer überlegt noch, wie die Leiste oben schlanker werden kann.

## Offene Fragen für spätere Schritte

- Zeichnen bisher nur auf der Einzelseite im Modus Bearbeiten. Soll man dabei auch durch alle Seiten scrollen können?
- Handflächenerkennung am Tablet: Sobald ein Stift erkannt ist, zeichnet nur noch der Stift und der Finger scrollt?
- Unterschrift für spätere Dokumente merken (nur lokal im Browser)?
