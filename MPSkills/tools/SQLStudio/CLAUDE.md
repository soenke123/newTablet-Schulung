# SQL Studio — Datenbank-Werkzeug (MPSkill, Migration 0220)

Wie phpMyAdmin, nur entschlackt für die Schule: SQL schreiben und ausführen, Tabellen ansehen und bearbeiten, Struktur per Formular, Klassendiagramm. **Nur für Admins sichtbar** (`skill_tools.admin_only`, siehe unten). Beta, Etappe 1.

## Grundentscheidungen (mit Sönke abgestimmt, 23.10.2026)

- **SQLite im Browser** (sql.js 1.13.0, `lib/`, fest im Repo, kein CDN). Der Server führt kein SQL der Schüler aus. sql.js läuft in einem **Web Worker** (`js/worker.js`): eine Endlos-Abfrage friert nur den Worker ein, `js/client.js` beendet ihn nach 8 s und öffnet den letzten gesicherten Stand neu.
- **MySQL-Schreibweise wird angenommen** und vor dem Ausführen übersetzt (`js/core.js`): `AUTO_INCREMENT`, `INT(11)`, `UNSIGNED`, `ENUM(…)` (→ `TEXT CHECK (x IN …)`), `KEY/INDEX` in CREATE TABLE (→ eigenes `CREATE INDEX`), `ENGINE=…`, `COMMENT`, Backticks, `\'` in Strings, `SHOW TABLES/DATABASES/COLUMNS/CREATE TABLE/INDEX`, `DESCRIBE`, `USE`, `CREATE/DROP DATABASE`, `TRUNCATE`, `INSERT IGNORE`, `RENAME TABLE`, `DROP INDEX … ON`, `SET FOREIGN_KEY_CHECKS`, MySQL-Funktionen (`IF`, `LEFT/RIGHT`, `NOW`, `CURDATE`, `YEAR/MONTH/DAY`, `DATEDIFF`, `DATE_FORMAT`, `UCASE/LCASE`, …). phpMyAdmin-Dumps (ADD PRIMARY KEY, MODIFY … AUTO_INCREMENT, ADD CONSTRAINT … FOREIGN KEY) laufen durch.
- **ALTER TABLE**, das SQLite nicht kann (MODIFY, CHANGE, ADD/DROP FOREIGN KEY, ADD/DROP PRIMARY KEY, AFTER/FIRST …), baut die Tabelle nach dem Zwölf-Schritte-Rezept der SQLite-Doku neu (`rebuild` in core.js): Fremdschlüssel aus, neue Tabelle, Daten hinüber, alte weg, umbenennen, Indizes/Trigger zurück, `foreign_key_check`, erst dann festschreiben. Passen die Daten nicht (FK ins Leere, NOT NULL auf leere Werte), bleibt alles wie es war.
- **Rechte** `use` < `modify` < `create` (Plan: je geteilter Datenbank). `use` = SELECT/INSERT/UPDATE/DELETE, `modify` = + CREATE/ALTER/DROP TABLE/INDEX/VIEW/TRIGGER, `create` = + eigene Datenbanken. Geprüft wird **jede Anweisung** im Kern (`classify` → `level`), bevor sie läuft; alle Reiter (auch Daten/Struktur) schicken ihr SQL durch denselben Weg (`SQLApp.execSql`). `ATTACH`, `VACUUM INTO`, `PRAGMA writable_schema`, `GRANT` sind immer gesperrt.
- **Diagramm** = Tabellen-/Klassendiagramm (Kasten je Tabelle, PK/FK-Zeichen, Typen, Linien mit 1/n). Reines SVG mit ausgerechneten Farben (PNG-Export ohne Umweg).

## Dateien

| Datei | Rolle |
|---|---|
| `tool.js` / `tool.css` | Rahmen in MPSkills (wie Tiny LM). Rahmen entsteht im ersten `update()` (Raumcode aus der view, wie SYNIR): `index.html?raum=CODE&rolle=presenter|participant` |
| `index.html` | die Anwendung; geht auch allein (`?rechte=use|modify|create` zum Ausprobieren) |
| `js/core.js` | Kern ohne DOM: Tokenizer, Anweisungen trennen (Trigger-Rumpf!), `classify` (Rechte + Übersetzung), `parseCreate`/`createSql` (Modell ↔ SQL), `planAlter` + `rebuild`, `schema`, `page`, `dump`, deutsche Fehlertexte mit „Meintest du …?" (`german`) |
| `js/worker.js` | sql.js + Kern im Worker, genau eine Datenbank offen |
| `js/client.js` | `SQLWorker` (Aufträge, Zeitlimit, Neustart) · `SQLStore` (IndexedDB `sqlstudio`, Store `dbs`, Index `scope`; ohne IndexedDB im Speicher mit Hinweis) |
| `js/app.js` | Zustand, Seitenleiste, Datenbanken öffnen/anlegen/kopieren/umbenennen/löschen/zurücksetzen, `execSql` (hält bei CREATE DATABASE/USE an, erledigt das, macht weiter), Import (.sql/.sqlite, auch per Hineinziehen), Export, Menü ⋯ (u. a. „Rechte ausprobieren" für Lehrkraft/allein) |
| `js/panes.js` | Reiter SQL (Editor, Beispiele mit echten Namen, Verlauf, Ergebniskarten, CSV), Daten (blättern, sortieren, suchen, Zelle ändern, Zeile einfügen mit Auswahl für ENUM/FK, löschen; zeigt danach das SQL), Struktur (Formular → MySQL-`CREATE TABLE`/ein `ALTER TABLE` mit allen Änderungen, Vorschau vor dem Ausführen), Diagramm |
| `js/editor.js` | eigener SQL-Editor (textarea über farbigem pre, ohne Umbruch; Zeilennummern, Autovervollständigung inkl. `alias.`, Fehlermarke) |
| `js/diagram.js` | Klassendiagramm: Anordnung (zwei Schichtungen, die mit kürzeren Linien gewinnt), Linien weichen Kästen aus, verschieben/zoomen (auch Zwei-Finger), Lage je Datenbank gemerkt (`layout` am Eintrag) |
| `js/ui.js` | toast, dialog, confirm, download, Ergebnistabelle, Zeichen |
| `data/*.sql` | System-Datenbanken (MySQL-Stil): haustiere (Einstieg), schule, bibliothek (n:m buch_autor), shop. Erzeugt von `data/erzeugen.cjs` (deterministisch) |
| `tests/core.test.mjs` | Prüfstand für den Kern unter Node: `node MPSkills/tools/SQLStudio/tests/core.test.mjs` |

Cache-Stempel `?v=20261023a` steht in index.html, worker.js, client.js, app.js (Vorlagen) und tool.js — bei Änderungen alle drehen.

## Speicher (Etappe 1)

Alles im Gerät: IndexedDB, Einträge `{ id, scope, kind: 'copy'|'own', base, name, bytes, dirty, layout }`. `scope` = Raumcode (oder `solo`), id `scope|sys:<vorlage>` bzw. `scope|own:<zufall>`. Eine Vorlage wird beim ersten Öffnen aus `data/<name>.sql` gebaut; „Auf Original zurücksetzen" löscht die Kopie und baut neu. Editor-Text, Verlauf, Reiter, Editorhöhe in localStorage (`sqls.<schlüssel>.<scope>`). In datenschutz.html Abschnitt 9 erwähnt.

**Achtung sql.js:** `db.export()` schaltet `PRAGMA foreign_keys` ab — immer `SQLCore.exportBytes(db)` nehmen.

## Nur für Admins

Migration 0220: Spalte `skill_tools.admin_only`. Policy `skill_tools_select_public` zeigt solche Skills nur Admins; Trigger `skill_rooms_admin_only` (before insert) lässt nur Admins Räume anlegen (Fehler `tool_admin_only`). Beitreten per Code geht für alle. Freigeben: `update skill_tools set admin_only = false where id = 'sqlstudio';` und in `MPSkills/tools.js` `adminOnly` streichen (setzt nur das Schild „Nur Admins" auf die Kachel). Prüfstand `supabase/tests/0220_sqlstudio.mjs`.

## Etappe 2 (geplant, noch nicht gebaut)

- Eigene Datenbanken der Lehrkraft auf dem Server (Tabelle wie `synir_scenarios`: hängt an der Lehrkraft, nicht am Raum; Inhalt = SQL-Dump oder SQLite-Bytes als base64).
- Teilen/Entziehen im Raum über `skill_room_state.data.shared` (`[{ id, rechte: 'use'|'modify' }]`, System-Datenbanken als `builtin:<name>`), Schalter „Schüler dürfen eigene Datenbanken anlegen" je Raum (= `create`).
- Schülerkopie je Teilnehmer und Datenbank auf dem Server (automatisch gesichert, „Auf Original zurücksetzen"), Entziehen blendet sie aus.
- Lehrkraft sieht die Kopien der Schüler (wie SYNIR: auf den Beamer legen).
- Später: Aufgaben mit automatischer Prüfung (Ergebnis gegen erwartete Abfrage).
