# Skript „Datenbanksysteme“ (YourSozialNet-Fassung)

Begleitskript für Informatik Q-Phase: I. Begriffe (Schule: Klasse, Schüler, Kurs) · II. SQL mit der Datenbank aus YourSozialNet.
Nur Klassendiagramme wie im Programm (keine ER-Diagramme).

| Datei | Rolle |
|---|---|
| `inhalt.mjs` | **der Inhalt** – Text, Beispiele, Aufgaben (fortlaufend 1–13), Lösungen und Hinweise je Teilaufgabe. Hier ändern. |
| `build.mjs` | baut `Datenbanksysteme.docx` und `Datenbanksysteme_Loesungen.docx` (+ PDF), dazu fürs Arbeitsmaterial `../material/` (Skript Word/PDF, `teile/*.pdf`, `material.json`); Lösungen werden live gegen die Dummy-Daten gerechnet. `--ohne-teile` = nur die beiden Word-Dateien (schnell, ohne LibreOffice) |
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

## Arbeitsmaterial (`MPSkills/material.html?tool=socialhub&raum=CODE`, Migration 0282)

- **Bausteine**: In `inhalt.mjs` beginnt jeder Teil mit `{ t: 'teil', id }`; Liste und Beschriftung in `TEILE`, Unterrichtsstufen (Schnell-Knöpfe) in `STUFEN`.
  Kapitel I **wächst mit**: `build.mjs` setzt I-1 … I-k zu den Ständen `teile/I-stand1…4.pdf` zusammen (z. B. steht der Primärschlüssel in Stand 2 auf derselben Seite wie I.2).
  Kapitel II gibt es je Teil (`teile/II-*.pdf`). Jeder Teil von Kapitel II beginnt mit `page()`. Teile haben keine Seitenzahl – die Seite stempelt beim Zusammensetzen neu.
- **Seite**: Downloads (Skript offen aus `../material/`, Lösungsheft über `skill_material_file_get`), Kapitel I als Stand, Kapitel II als Häkchen, je Kurs gespeichert (`skill_material_marks_*`).
  „Schüler-PDF“ = Deckblatt + Stand + abgehakte Teile, im Browser mit pdf-lib (`tools/Master PDF Skill/lib/pdf-lib`).
- **Lösungsheft hochladen**: als Admin (nach 2FA im Admin-Panel) auf der Seite unter „Admin: Lösungsheft hochladen“ – `arbeitsblatt/Datenbanksysteme_Loesungen.docx` und `.pdf`. Es liegt nie im öffentlichen Ordner.
- Prüfstand Server: `supabase/tests/0282_arbeitsmaterial.mjs`.
Ändern sich die Dummy-Daten, zuerst `pruefen.mjs` laufen lassen – die Aufgaben verweisen auf feste Figuren (Erna, Noah, levi.kicks, die Echsen-Trolle …).
