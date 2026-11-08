# Skript „Datenbanksysteme“ (YourSozialNet-Fassung)

Begleitskript für Informatik Q-Phase: I. Begriffe (Schule: Klasse, Schüler, Kurs) · II. SQL mit der Datenbank aus YourSozialNet.
Nur Klassendiagramme wie im Programm (keine ER-Diagramme).

| Datei | Rolle |
|---|---|
| `inhalt.mjs` | **der Inhalt** – Text, Beispiele, Aufgaben (fortlaufend 1–13), Lösungen und Hinweise je Teilaufgabe. Hier ändern. |
| `build.mjs` | baut `Datenbanksysteme.docx` und `Datenbanksysteme_Loesungen.docx`; Beispiel-Ergebnisse und Lösungen werden live gegen die Dummy-Daten gerechnet |
| `pruefen.mjs` | führt jede Lösung und jedes Beispiel aus und meldet Fehler (gewollte Fehler: `error: true` an der Teilaufgabe) |
| `db.mjs` | lädt die Dummy-Daten (`../dummy`) mit dem echten Schema (`../js/db.js`) in SQLite über den SQL-Studio-Kern |
| `diagrams.mjs` | Klassendiagramme mit dem echten `SQLStudio/js/diagram.js` → `bilder/db_*.png`, `bilder/schule_*.png` (Lage der Kästen in `POS`) |
| `images.mjs` | übrige Abbildungen (DBMS, Beispieltabelle, SQL, JOIN, JOIN-Varianten, Kapselung, Werbung) → `bilder/abb_*.png` |

```bash
node MPSkills/tools/SocialHub/arbeitsblatt/pruefen.mjs
node MPSkills/tools/SocialHub/arbeitsblatt/build.mjs
```

Bilder neu (nur nach Änderungen an Schema oder Abbildungen): `diagrams.mjs`, dann `images.mjs` (Playwright).
Der Ordner liegt nicht auf Vercel (`.vercelignore`), damit das Lösungsheft nicht öffentlich ist.
Ändern sich die Dummy-Daten, zuerst `pruefen.mjs` laufen lassen – die Aufgaben verweisen auf feste Figuren (Erna, Noah, levi.kicks, die Echsen-Trolle …).
