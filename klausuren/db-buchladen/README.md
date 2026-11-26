# Klausur Q2 „Buchladen Koreander“ (Datenbanken und SQL)

Nicht öffentlich (steht in `.vercelignore`).

- `Klausur_DB_Buchladen.docx` – Klausur für die Schüler:innen
- `Erwartungshorizont_DB_Buchladen.docx` – Lösungen und Punkte
- `bauen.cjs` – erzeugt beide Word-Dateien (`node bauen.cjs`), Texte und Daten stehen dort
- `diagramm.html` + `bild.cjs` – Klassendiagramm mit dem Zeichencode von SQL Studio → `diagramm.png`
- `pruefen.py` – rechnet die SQL-Lösungen aus Aufgabe 3 gegen die Beispieldaten nach

Eingebaute Fehler von Herrn Koreander: PK Vorname+Nachname, Alter statt Geburtsdatum, Telefon als INT,
Genre mit mehreren Werten, Verlag/Verlagsort redundant, nur ein Autor je Buch („Ein gutes Omen“),
kein Preis im Kauf, Spaltenname „Alter“ = SQL-Schlüsselwort. „Robert Galbraith“ = Pseudonym von J. K. Rowling.
Daten ändern: in `bauen.cjs` UND `pruefen.py`.
