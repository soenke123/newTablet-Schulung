# Projekt: Lokale PDF-Werkstatt

Entwickle eine moderne, leistungsfähige PDF-Bearbeitungsanwendung mit dem Arbeitstitel **„PDF Werkstatt“**. Sie soll eine datenschutzfreundliche Alternative zu iLovePDF, PDF24 und einfachen PDF-Editoren sein.

Die Anwendung muss direkt im Browser funktionieren, auf Desktop, Tablet und Smartphone nutzbar sein und später zusätzlich als installierbare Desktop-Anwendung angeboten werden können.

## 1. Grundprinzipien

- Verwende **HTML, CSS und Vanilla JavaScript** als Grundlage.
- Kein React, Vue, Angular oder vergleichbares Frontend-Framework.
- Verwende ES-Module und eine klare modulare Architektur.
- Keine unnötigen Abhängigkeiten und keine externen CDNs.
- Alle notwendigen Bibliotheken, Schriftarten, Icons und Ressourcen lokal einbinden.
- Die Anwendung muss im normalen Betrieb vollständig lokal arbeiten.
- PDF-Dateien dürfen standardmäßig niemals an einen Server übertragen werden.
- Kein Account, keine Registrierung, keine Analytics und keine Telemetrie.
- Keine Werbung.
- Keine unnötigen Netzwerkverbindungen.
- Die Architektur muss eine spätere Verpackung als Desktop-Anwendung mit Tauri ermöglichen.
- Die Anwendung soll als PWA installierbar werden und nach entsprechender Einrichtung offline funktionieren.
- Verwende für PDF-Verarbeitung spezialisierte Bibliotheken. Implementiere keine eigene PDF-Engine.

Vor Beginn: Prüfe die verfügbaren Bibliotheken, deren Lizenzen, Funktionsumfang und Offline-Fähigkeit. Dokumentiere technische Grenzen, bevor du Funktionen versprichst.

## 2. Benutzeroberfläche

Entwickle eine aufgeräumte, professionelle und funktionale Benutzeroberfläche.

### Desktop-Layout

Drei Hauptbereiche:

**A. Linke Seitenleiste – Seitenübersicht**
- Miniaturvorschauen aller PDF-Seiten.
- Seitenzahlen.
- Aktuelle Auswahl klar hervorheben.
- Mehrfachauswahl mit Strg und Shift.
- Seiten per Drag & Drop verschieben.
- Einfügeposition während des Ziehens deutlich anzeigen.
- Mehrere Seiten gleichzeitig auswählen, verschieben, kopieren, ausschneiden, duplizieren und löschen.
- Seiten aus einem anderen geöffneten PDF übernehmen.
- Seiten durch Drag & Drop aus dem Dateimanager hinzufügen, soweit der Browser dies unterstützt.
- Seitenübersicht ein- und ausblendbar.
- Bei großen PDFs nur benötigte Vorschaubilder rendern.
- Kontextmenü mit den wichtigsten Seitenaktionen.

**B. Obere Werkzeugleiste**
Gruppiere die Werkzeuge nach Aufgaben:

1. Datei: Öffnen, weitere PDF hinzufügen, Speichern, Speichern unter, Exportieren.
2. Seiten: Sortieren, Drehen, Löschen, Duplizieren, Einfügen, Extrahieren.
3. Bearbeiten: Text auswählen, Text ergänzen, vorhandenen Text bearbeiten.
4. Kommentieren: Markieren, Unterstreichen, Durchstreichen, Kommentare.
5. Zeichnen: Stift, Textmarker, Radierer, Linien, Pfeile, Rechtecke, Kreise.
6. Einfügen: Textfelder, Bilder, Unterschriften, Stempel, Wasserzeichen.
7. Ansicht: Zoomen, an Seite anpassen, ganze Seite, Seitenbreite, Vollbild.
8. Weitere Werkzeuge: Suchen, OCR, Formulare, Komprimieren, Schwärzen.

Werkzeuge sollen kontextabhängig aktiviert werden. Nicht verfügbare Funktionen dürfen nicht fälschlich als funktionsfähig dargestellt werden.

**C. Zentrale Dokumentansicht**
- Hochwertige PDF-Darstellung.
- Zoomen und Scrollen.
- Einzelne Seite oder fortlaufende Seitenansicht.
- Textauswahl, sofern die PDF-Datei dies ermöglicht.
- Bearbeitungswerkzeuge direkt auf der Seite verwenden.
- Anmerkungen unmittelbar in der Vorschau darstellen.
- Seitenrotation und Änderungen sofort visualisieren.
- Gute Darstellung bei unterschiedlichen Auflösungen und Zoomstufen.

### Zusätzliche Bereiche

- Einstellbare Eigenschaften des ausgewählten Elements: Farbe, Schriftgröße, Schriftart, Transparenz und Strichstärke.
- Statusleiste mit aktueller Seite, Gesamtseitenzahl, Zoom und Speicherstatus.
- Optional ein- und ausblendbare Kommentarübersicht.
- Deutliche Anzeige ungespeicherter Änderungen.
- Dialoge vor destruktiven Aktionen, wenn diese nicht zuverlässig rückgängig gemacht werden können.

## 3. Seitenverwaltung

Diese Funktionen haben hohe Priorität und müssen zuverlässig funktionieren:

- PDF-Dateien öffnen.
- Mehrere PDF-Dateien als Quellen verwenden.
- PDFs zusammenführen.
- PDFs aufteilen.
- Einzelne Seiten oder Seitenbereiche extrahieren.
- Seiten löschen.
- Seiten duplizieren.
- Seiten verschieben und sortieren.
- Seiten aus einer anderen PDF-Datei einfügen.
- Seiten drehen.
- Leere Seiten einfügen.
- Seiten aus Bildern erstellen.
- Seitenformate und Ausrichtung anzeigen.
- Seiten zuschneiden, soweit technisch zuverlässig möglich.
- Ausgewählte Seiten als eigenständige PDF exportieren.
- Ganze Dokumente oder einzelne Seitenbereiche speichern.

Implementiere eine zentrale, konsistente Auswahlverwaltung. Die Funktionen für Kontextmenü, Tastatur und Werkzeugleiste müssen dieselben Operationen verwenden.

Achte auf stabile Seitenidentitäten, damit die Auswahl beim Sortieren und Verschieben nicht verloren geht.

## 4. Tastaturbedienung

Implementiere mindestens folgende Tastenkürzel:

- Strg+O: PDF öffnen.
- Strg+S: Speichern beziehungsweise exportieren.
- Strg+Shift+S: Speichern unter.
- Strg+Z: Rückgängig.
- Strg+Y: Wiederholen.
- Strg+C: Kopieren.
- Strg+X: Ausschneiden.
- Strg+V: Einfügen.
- Strg+A: Alle Elemente im aktuellen Kontext auswählen.
- Entf: Ausgewählte Seite oder ausgewähltes Element löschen.
- Strg+D: Ausgewählte Seite oder Elemente duplizieren.
- Strg+F: Textsuche öffnen.
- Escape: Aktuelle Auswahl oder Aktion abbrechen.
- Strg++ und Strg+-: Zoomen.

Beachte den aktuellen Kontext. Bei ausgewählten Seiten müssen Kopieren und Einfügen Seitenoperationen ausführen. Bei ausgewähltem Text oder Annotationselementen gelten die entsprechenden Elementoperationen.

Verhindere, dass globale Tastenkürzel beim Tippen in Textfeldern unerwünschte Aktionen auslösen.

## 5. Kommentieren und annotieren

Implementiere PDF-Annotationen so standardkonform wie möglich.

Unterstützte Funktionen:

- Textmarker.
- Unterstreichen.
- Durchstreichen.
- Freihandzeichnen.
- Textnotizen und Randkommentare.
- Freitext-Annotationen.
- Pfeile, Linien und geometrische Formen.
- Einstellbare Farbe, Deckkraft und Strichstärke.
- Textgröße und Schriftart für Freitext.
- Kommentarübersicht.
- Kommentare bearbeiten und löschen.
- Navigation von Kommentaren zur entsprechenden Seite.
- Vorhandene Annotationen beim Öffnen möglichst erhalten.
- Annotationen beim Export korrekt speichern.

Kommentare dürfen nicht ausschließlich als visuelle HTML-Elemente existieren. Sie müssen in die exportierte PDF-Datei übernommen werden.

Verwende standardisierte PDF-Annotationen, soweit die ausgewählte PDF-Bibliothek dies unterstützt. Teste insbesondere Textmarker, Notizen, Freitext und Zeichnungen in unabhängigen PDF-Programmen.

Unterscheide zwischen editierbaren Annotationen und Annotationen, die beim Export dauerhaft in den Seiteninhalt eingebettet werden.

## 6. Text und Seiteninhalte bearbeiten

Unterscheide technisch zwischen drei Bearbeitungsarten:

**Modus A: Text ergänzen**
- Neue Textfelder einfügen.
- Schriftart, Schriftgröße, Farbe und Ausrichtung einstellen.
- Textfelder verschieben, skalieren, kopieren und löschen.
- Zeilenumbrüche und mehrzeiligen Text unterstützen.

**Modus B: Vorhandenen Text bearbeiten**
- Vorhandenen Text auswählen, sofern die PDF-Struktur dies zulässt.
- Text ersetzen, ändern oder entfernen.
- Position, Schriftgröße und Farbe soweit möglich erhalten.
- Layoutverschiebungen möglichst vermeiden.
- Schriftarten und Zeichenkodierungen berücksichtigen.
- Nicht unterstützte Fälle verständlich anzeigen.

**Modus C: Gescannte Dokumente**
- OCR als zusätzliche Funktion vorsehen.
- Erkannte Textbereiche zugänglich machen.
- Durchsuchbare PDFs erzeugen.
- Originalbild und erkannte Texte möglichst sauber miteinander verbinden.

Wichtig: Behaupte niemals, dass beliebiger PDF-Text direkt editierbar ist. PDF-Dateien können Text in einzelne Zeichen aufteilen, Schriftinformationen unvollständig enthalten oder ausschließlich aus Bildern bestehen.

Falls die gewählte Bibliothek eine Funktion nicht zuverlässig unterstützt, dokumentiere dies und entwickle eine realistische Alternative.

## 7. Weitere Werkzeuge

Plane die Architektur für folgende Erweiterungen:

- Bilder und Logos einfügen.
- Handschriftliche Unterschriften.
- Stempel.
- Wasserzeichen.
- Kopf- und Fußzeilen.
- Seitenzahlen.
- Vorhandene PDF-Formulare ausfüllen.
- Textsuche mit Trefferliste.
- PDF-Dateien komprimieren.
- Metadaten bearbeiten.
- Passwortgeschützte PDFs öffnen und speichern, soweit die Bibliothek dies unterstützt.
- OCR.
- Stapelverarbeitung mehrerer PDFs.
- PDF-Seiten als Bilder exportieren.
- Bilder in PDF umwandeln.
- PDF/A-Export, sofern die technischen Anforderungen erfüllt werden.
- Dokumente auf mögliche Strukturprobleme prüfen.

### Sichere Schwärzung

Schwärzen muss Inhalte tatsächlich entfernen. Ein schwarzes Rechteck über vertraulichem Text reicht nicht aus.

Implementiere diese Funktion erst dann als produktionsreif, wenn der Export überprüft, dass der geschwärzte Inhalt nicht mehr durch Textauswahl, Kopieren oder Extraktion wiederhergestellt werden kann.

## 8. Export und Speichern

Die Anwendung muss echte PDF-Dateien erzeugen, die mit üblichen PDF-Programmen geöffnet werden können.

Anforderungen:

- Originaldatei standardmäßig nicht überschreiben.
- Speichern unter.
- Gesamtes Dokument exportieren.
- Ausgewählte Seiten exportieren.
- Exportierte PDF mit korrekter Seitenreihenfolge erzeugen.
- Annotationen und Änderungen korrekt übernehmen.
- Textsuchbarkeit möglichst erhalten.
- Originalbilder und Vektorgrafiken nicht unnötig in Rasterbilder umwandeln.
- Vorhandene Kommentare möglichst erhalten.
- Optional Annotationen dauerhaft in den Seiteninhalt einbetten.
- Fehlermeldungen bei nicht unterstützten PDF-Funktionen.
- Fortschrittsanzeige bei großen Dokumenten.
- Bei Exportfehlern keine beschädigte Zieldatei als erfolgreich gespeichertes Ergebnis melden.

Implementiere eine zuverlässige Speicherlogik mit sauberem Umgang mit Fehlern und nicht abgeschlossenen Operationen.

## 9. Undo und Redo

Implementiere ein zentrales Änderungsmodell.

- Seitenänderungen müssen rückgängig gemacht werden können.
- Annotationen müssen rückgängig gemacht werden können.
- Textänderungen müssen rückgängig gemacht werden können.
- Verschieben, Löschen, Drehen und Einfügen müssen rückgängig gemacht werden können.
- Undo und Redo müssen die Vorschau und die Dokumentdaten konsistent aktualisieren.
- Änderungen sollen nicht bei jeder Mausbewegung als separate Aktion gespeichert werden.
- Die Speicherhistorie soll bei großen Dokumenten nicht unkontrolliert anwachsen.

Unterscheide zwischen dem Zustand der Benutzeroberfläche und den tatsächlichen Änderungen am PDF-Dokument.

## 10. Responsive Design

Die Anwendung muss auf Desktop, Tablet und Smartphone nutzbar sein.

### Desktop
- Seitenleiste links.
- Werkzeugleiste oben.
- Dokumentansicht in der Mitte.
- Eigenschaftenbereich bei Bedarf rechts.

### Tablet
- Touchbedienung.
- Seitenleiste ein- und ausblendbar.
- Größere Schaltflächen.
- Bedienbarkeit mit Touchstift.
- Kein zwingender Hover für wichtige Funktionen.

### Smartphone
- Kompakte, responsive Werkzeugleiste.
- Seitenübersicht als einblendbares Panel.
- Dokumentansicht mit Touch-Zoom.
- Ausreichend große Schaltflächen.
- Touchbedienung für Markieren, Zeichnen und Textfelder.
- Keine horizontale Überbreite der gesamten Anwendung.
- Klare Bedienung bei Hoch- und Querformat.

Die Anwendung soll nicht einfach nur verkleinert werden. Passe die Interaktionen und Werkzeuganordnung an die jeweilige Bildschirmgröße an.

## 11. Offlinefähigkeit und Datenschutz

- PDF-Dateien standardmäßig ausschließlich lokal verarbeiten.
- Keine Uploads.
- Keine Analytics oder Telemetrie.
- Keine externen Schriftarten oder Icons.
- Alle benötigten Ressourcen lokal ausliefern.
- Service Worker für die Offlinefähigkeit einsetzen.
- Web-App-Manifest für die Installation als PWA erstellen.
- Den Status der Offlinefähigkeit nachvollziehbar machen.
- Dokumente nicht ungefragt dauerhaft speichern.
- Keine vertraulichen PDF-Inhalte in Logs schreiben.
- Browser-Speicher nur bewusst und mit klarer Funktion verwenden.
- Temporäre Daten beim Schließen beziehungsweise Verwerfen angemessen behandeln.

Beachte, dass PWA-Installation, Dateizugriff und Offlineverhalten je nach Browser und Betriebssystem variieren können.

## 12. Desktop-Verpackung

Plane eine spätere Desktop-Version mit Tauri.

- Gemeinsamen Anwendungskern beibehalten.
- Betriebssystemfunktionen über klar getrennte Adapter integrieren.
- Native Dateidialoge unterstützen.
- Dateizugriffe auf notwendige Verzeichnisse begrenzen.
- Keine unnötigen Betriebssystemberechtigungen.
- Windows-Installer erzeugen können.
- Eigenes Anwendungssymbol verwenden.
- Alle erforderlichen Bibliotheken und Ressourcen mitliefern.
- Desktop-Version muss ohne Internet funktionieren.

Die Web-Version darf nicht von Tauri-spezifischen APIs abhängig sein.

## 13. Architektur und Codequalität

Verwende eine modulare Struktur, zum Beispiel:

- `index.html`
- `css/app.css`
- `css/desktop.css`
- `css/mobile.css`
- `js/app.js`
- `js/state.js`
- `js/pdf-renderer.js`
- `js/pdf-document.js`
- `js/pages.js`
- `js/selection.js`
- `js/annotations.js`
- `js/text-editor.js`
- `js/keyboard.js`
- `js/history.js`
- `js/export.js`
- `js/file-manager.js`
- `js/platform.js`
- `js/ui/`
- `lib/`
- `icons/`
- `manifest.json`
- `service-worker.js`

Passe die Struktur an den tatsächlichen Umfang an. Erzeuge keine leeren Module ohne Zweck.

Vermeide:
- Eine riesige monolithische JavaScript-Datei.
- Doppelte Logik für dieselbe Aktion.
- Globale Variablen ohne klare Notwendigkeit.
- Ungeprüfte PDF-Manipulationen.
- Scheinfunktionen und lediglich dekorative Buttons.
- Externe Abhängigkeiten, die unbemerkt Daten übertragen.
- Unbehandelte Fehler beim Öffnen, Bearbeiten und Exportieren.

## 14. Tests

Erstelle automatisierte Tests für die zentralen PDF-Operationen und die Änderungslogik.

Teste mindestens:

- Öffnen verschiedener PDF-Dateien.
- Zusammenführen und Aufteilen.
- Löschen, Kopieren, Einfügen und Sortieren.
- Mehrfachauswahl.
- Rückgängig und Wiederholen.
- Drehen und Extrahieren von Seiten.
- Hinzufügen und Exportieren von Annotationen.
- Erhalt vorhandener Kommentare, soweit unterstützt.
- Speichern und erneutes Öffnen exportierter PDFs.
- Fehlerfälle und beschädigte Dateien.
- Passwortgeschützte PDFs.
- Große Dokumente und begrenzten Arbeitsspeicher.
- Responsive Bedienung.
- Offlinebetrieb.
- Kompatibilität der erzeugten PDFs mit mindestens zwei unabhängigen PDF-Programmen.

Prüfe nicht nur, ob ein Export eine Datei erzeugt. Öffne beziehungsweise analysiere das Ergebnis und kontrolliere Seitenzahl, Reihenfolge und Inhalt.

## 15. Entwicklungsablauf

Arbeite in klaren, überprüfbaren Phasen.

**Phase 1 – Machbarkeitsprüfung**
- Bestehende Projektstruktur untersuchen.
- PDF-Bibliotheken und Lizenzen prüfen.
- Technische Risiken dokumentieren.
- Minimalen Prototyp für Anzeige, Seitenmanipulation, Annotationen und Export erstellen.

**Phase 2 – Seitenwerkstatt**
- Benutzeroberfläche aufbauen.
- Seitenübersicht implementieren.
- Drag & Drop und Mehrfachauswahl.
- Kopieren, Einfügen, Löschen, Drehen und Sortieren.
- Zusammenführen, Aufteilen und Exportieren.

**Phase 3 – Annotationen**
- Stift, Textmarker, Formen und Textfelder.
- Kommentare.
- Import und Export von Annotationen.
- Rückgängig und Wiederholen.

**Phase 4 – Erweiterter Editor**
- Vorhandenen Text bearbeiten.
- Bilder und weitere Elemente.
- OCR und Formulare.
- Schwärzen und weitere Werkzeuge.

**Phase 5 – Bereitstellung**
- Responsive Optimierung.
- PWA und Offlinefähigkeit.
- Tauri-Integration.
- Installer und Downloadpaket.
- Lizenz- und Datenschutzprüfung.

Nach jeder Phase muss eine funktionierende Anwendung vorliegen.

## 16. Anforderungen an die Umsetzung

Beginne nicht damit, alle Funktionen gleichzeitig zu implementieren.

Untersuche zunächst die vorhandene Umgebung und erstelle eine kurze technische Planung. Implementiere danach einen funktionierenden Prototypen mit echten PDF-Dateien.

Halte die Oberfläche und die tatsächliche Dokumentverarbeitung getrennt.

Wenn eine Funktion technisch nicht zuverlässig möglich ist, benenne das Problem, erläutere die Alternativen und implementiere keine irreführende Attrappe.

Dokumentiere die Einrichtung, die verwendeten Bibliotheken, ihre Lizenzen, bekannte Einschränkungen und den Build-Prozess.

**Ergebnis:** Eine moderne, modulare, datenschutzfreundliche PDF-Werkstatt auf Basis von HTML, CSS und JavaScript, die im Browser funktioniert, mobil bedienbar ist, offline genutzt werden kann und später als Desktop-Anwendung heruntergeladen und installiert werden kann.
