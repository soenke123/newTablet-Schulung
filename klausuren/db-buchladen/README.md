# Klausur Q1 „Buchladen Koreander“ (Datenbanken und SQL)

Nicht öffentlich (steht in `.vercelignore`).

- `Klausur_DB_Buchladen.docx` – Klausur, Anlagen A1 (Klassendiagramm) und A2 (Beispieldaten) am Ende
- `Erwartungshorizont_DB_Buchladen.docx` – Lösungen und Punkte (ca. 52)
- `bauen.cjs` – erzeugt beide Word-Dateien (`node bauen.cjs`), alle Texte stehen dort
- `daten.json` – Beispieldaten (Klausur UND `pruefen.py` lesen sie)
- `diagramm.html` + `bild.cjs` – Klassendiagramme mit dem Zeichencode von SQL Studio → `diagramm-haupt.png`, `diagramm-tracking.png`
- `pruefen.py` – rechnet die SQL-Lösungen gegen `daten.json` nach

Eingebaute Fehler von Herrn Koreander: PK nur Vorname (Anna Schmidt aus Kiel), Telefon als INT (führende 0),
Genre mit mehreren Werten, Verlag/Verlagsort redundant, kein Preis im Kauf. Richtig gebaut: Geburtsdatum,
Autor–Buch als n:m über Buch_Autor (in den Daten jedes Buch mit genau einem Autor).
„Robert Galbraith“ = Pseudonym von J. K. Rowling.
Aufgabe 5: Bluetooth-Sensoren ohne Kundenkarte; Bastian (7C:D1…) und Leonie (E5:3F…) lassen sich über die
Kasse (Sensor 5, kurz vor Kauf 8/9) zuordnen, das Galaxy A54 nicht.
