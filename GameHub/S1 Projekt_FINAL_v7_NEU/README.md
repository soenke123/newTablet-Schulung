# Datei-Detektive – iPad Lernspiel

Ein webbasiertes Lernspiel zum Üben des Organisierens von Dateien auf einem iPad.

## Inhalt des Pakets
- **lernspiel.html** – Das komplette Spiel als einzelne, autarke HTML-Datei (HTML + CSS + JavaScript inline)
- **README.md** – Diese Datei

## Sofort spielen
Doppelklick auf **lernspiel.html** – das Spiel öffnet sich direkt im Browser.
Es wird **kein Server**, **keine Installation** und **kein Internet** benötigt.

(Hinweis: Online wird die Schriftart „Nunito" von Google Fonts geladen. Ohne Internet greift der Browser auf eine Standard-Schrift zurück, das Spiel funktioniert weiterhin.)

## Spielmechanik
- **3 Runden** mit steigender Schwierigkeit (7 / 14 / 23 Dateien, 3 / 4 / 5 Fach-Ordner)
- **Drag & Drop** in Fach-Ordner (Mathe, Deutsch, Bio, Englisch, Orga)
- **Datei-Vorschau** für PDF (Text) und PNG (SVG-Bild)
- **.dat / .tmp** Dateien müssen erst „In PDF exportieren" werden
- **.bat-Dateien** sind Viren – ungesehen in den **Papierkorb** ziehen, niemals anklicken!
- **Test-Phase** nach jeder Runde: 3 Suchaufgaben pro Runde (2 / 1 / 0 Punkte je nach Fehlversuchen)
- **Highscore** wird im localStorage des Browsers gespeichert

## Bearbeiten
Die Datei `lernspiel.html` kann mit jedem Texteditor (Notepad, VS Code, …) geöffnet und angepasst werden:
- **Datei-Inhalte** sind im Array `ROUNDS` ganz oben im `<script>`-Block definiert
- **Test-Fragen** stehen jeweils unter `questions` pro Runde
- **Design** (Farben, Schriftgrößen) findest du im `<style>`-Block oben

## Lizenz
Frei für Bildungszwecke nutzbar.
