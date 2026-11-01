-- ══════════════════════════════════════════════════════════════
-- Migration 0254 — Kurze Kacheltexte (höchstens 25 Wörter)
-- ══════════════════════════════════════════════════════════════
-- Sönke 01.11.2026:
--   „Die Kurzbeschreibungen für die Skills sollten sich auf maximal 25
--    Worte beschränken auf den Kacheln. Im Modal wird es dann genauer
--    und ausführlicher. … Der kurze Text sollte gut den Kern des Skills
--    erklären.“
--
-- Nur skill_tools.blurb (Text auf der Kachel). Die ausführlichen Texte
-- stehen im Vorschau-Fenster (MPSkills/preview/<skill>.js, Feld blurb),
-- die Untertitel in MPSkills/tools.js (subtitle).
--
-- Kein DROP, keine neue Funktion, idempotent.
-- ══════════════════════════════════════════════════════════════

update skill_tools set blurb = 'Eine Frage am Beamer, alle antworten gleichzeitig vom Tablet. Häufige Antworten wachsen und rücken zur Mitte – das Meinungsbild der Klasse auf einen Blick.' where id = 'wordcloud';
update skill_tools set blurb = 'Ein neuronales Netz zum Anfassen: Schichten bauen, Gewichte einstellen, beim Training zusehen. So wird sichtbar, wie eine KI aus Beispielen mit Lösungen lernt.' where id = 'neurolab';
update skill_tools set blurb = 'Die Cäsar-Scheibe zum Drehen: Schlüssel einstellen, Buchstaben ablesen und Nachrichten von Hand ver- und entschlüsseln – der Einstieg in die Kryptografie.' where id = 'caesar';
update skill_tools set blurb = 'Bis zu acht Teams erobern ein Königreich: Jede richtig gerechnete Aufgabe nimmt ein Feld ein. Aufgaben von Grundrechenarten über Brüche bis Analysis.' where id = 'clash-of-math';
update skill_tools set blurb = 'Tiere ohne Namen, nur ihre Bewegungsdaten: Die Klasse sortiert die Signale zu Gruppen und erlebt so, wie eine KI ohne Lösungen Muster findet.' where id = 'wildclusters';
update skill_tools set blurb = 'Vokabeln üben als Klassenspiel oder allein: Teams erkunden eine vernebelte Insel, jede gekonnte Vokabel deckt ein Feld auf. Mitgelieferte Units oder eigene Listen.' where id = 'wordisland';
update skill_tools set blurb = 'Live-Quiz für die ganze Klasse: Frage am Beamer, Antworten auf dem Tablet. Vier Fragenarten, Wesen als Spielfiguren und eine Siegerehrung zum Schluss.' where id = 'knowledgestack';
update skill_tools set blurb = 'Netzwerke bauen und beobachten: Geräte verkabeln, Adressen vergeben und zusehen, wie jedes Paket durchs Netz fliegt – von ARP und DHCP bis E-Mail.' where id = 'synir';
update skill_tools set blurb = 'Projektarbeit nach Scrum: Das Team plant mit Product Goal, Backlog und Sprints, schiebt Aufgaben über das Board und hält Review und Retro fest.' where id = 'scrum';
update skill_tools set blurb = 'Gruppenarbeit über Wochen organisieren: Gruppen bilden, Projektziel und To-dos planen, Tagebuch führen, Anträge stellen – die Lehrkraft behält alle Gruppen im Blick.' where id = 'projekt';
update skill_tools set blurb = 'Ein Mini-Sprachmodell zum Aufschrauben: Texte füttern und Wort für Wort zusehen, wie es schreibt. So wird verständlich, wie Sprach-KIs wie ChatGPT funktionieren.' where id = 'tinylm';
update skill_tools set blurb = 'PDFs lesen, bearbeiten, kommentieren und ausfüllen – direkt im Browser, die Dateien bleiben auf dem Gerät. Auch als Windows-Programm zum Herunterladen.' where id = 'masterpdf';
update skill_tools set blurb = 'Ein Ökosystem auf einer Insel: Wölfe jagen Hirsche, Adler jagen Laufvögel. Die Klasse beobachtet, wie Räuber und Beute ins Gleichgewicht kommen – oder nicht.' where id = 'balance';
update skill_tools set blurb = 'Relationale Datenbanken wie mit phpMyAdmin: SQL schreiben und ausführen, Tabellen bearbeiten, Beziehungen im Diagramm sehen. Mit fertigen Übungsdatenbanken.' where id = 'sqlstudio';
update skill_tools set blurb = 'Fachbegriffe und Definitionen in jedem Fach üben: Die Lehrkraft legt Stapel an, die Klasse lernt mit Karteikarten, Memory, Duell, Insel und Kistenturm.' where id = 'derby';
update skill_tools set blurb = 'Ein Perspektivwechsel: Erst trainierst du eine KI, die nur durch Belohnung lernt. Dann wirst du selbst zur KI – ohne die Regeln zu kennen.' where id = 'reinforce';
