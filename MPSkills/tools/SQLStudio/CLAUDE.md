# SQL Studio — Datenbank-Werkzeug (MPSkill, Migrationen 0220 + 0221)

Wie phpMyAdmin, nur entschlackt für die Schule: SQL schreiben und ausführen, Tabellen ansehen und bearbeiten, Struktur per Formular, Klassendiagramm. **Nur für Admins sichtbar** (`skill_tools.admin_only`, siehe unten). Beta, Etappe 2 (Teilen, Rechte je Datenbank, Kopien auf dem Server).

## Grundentscheidungen (mit Sönke abgestimmt, 23.10.2026)

- **SQLite im Browser** (sql.js 1.13.0, `lib/`, fest im Repo, kein CDN). Der Server führt kein SQL der Schüler aus. sql.js läuft in einem **Web Worker** (`js/worker.js`): eine Endlos-Abfrage friert nur den Worker ein, `js/client.js` beendet ihn nach 8 s und öffnet den letzten gesicherten Stand neu.
- **MySQL-Schreibweise wird angenommen** und vor dem Ausführen übersetzt (`js/core.js`): `AUTO_INCREMENT`, `INT(11)`, `UNSIGNED`, `ENUM(…)` (→ `TEXT CHECK (x IN …)`), `KEY/INDEX` in CREATE TABLE (→ eigenes `CREATE INDEX`), `ENGINE=…`, `COMMENT`, Backticks, `\'` in Strings, `SHOW TABLES/DATABASES/COLUMNS/CREATE TABLE/INDEX`, `DESCRIBE`, `USE`, `CREATE/DROP DATABASE`, `TRUNCATE`, `INSERT IGNORE`, `RENAME TABLE`, `DROP INDEX … ON`, `SET FOREIGN_KEY_CHECKS`, MySQL-Funktionen (`IF`, `LEFT/RIGHT`, `NOW`, `CURDATE`, `YEAR/MONTH/DAY`, `DATEDIFF`, `DATE_FORMAT`, `UCASE/LCASE`, …). phpMyAdmin-Dumps (ADD PRIMARY KEY, MODIFY … AUTO_INCREMENT, ADD CONSTRAINT … FOREIGN KEY) laufen durch.
- **ALTER TABLE**, das SQLite nicht kann (MODIFY, CHANGE, ADD/DROP FOREIGN KEY, ADD/DROP PRIMARY KEY, AFTER/FIRST …), baut die Tabelle nach dem Zwölf-Schritte-Rezept der SQLite-Doku neu (`rebuild` in core.js): Fremdschlüssel aus, neue Tabelle, Daten hinüber, alte weg, umbenennen, Indizes/Trigger zurück, `foreign_key_check`, erst dann festschreiben. Passen die Daten nicht (FK ins Leere, NOT NULL auf leere Werte), bleibt alles wie es war.
- **Rechte** `use` < `modify` je geteilter Datenbank, `create` als eigener Schalter je Raum (eigene Datenbanken anlegen) — im Kern getrennt: `run(db, sql, { rights, createDb, readOnly })`. `use` = SELECT/INSERT/UPDATE/DELETE, `modify` = + CREATE/ALTER/DROP TABLE/INDEX/VIEW/TRIGGER, `create` = + eigene Datenbanken. Geprüft wird **jede Anweisung** im Kern (`classify` → `level`), bevor sie läuft; alle Reiter (auch Daten/Struktur) schicken ihr SQL durch denselben Weg (`SQLApp.execSql`). `ATTACH`, `VACUUM INTO`, `PRAGMA writable_schema`, `GRANT` sind immer gesperrt.
- **Diagramm** = Tabellen-/Klassendiagramm (Kasten je Tabelle, PK/FK-Zeichen, Typen, Linien mit 1/n). Reines SVG mit ausgerechneten Farben (PNG-Export ohne Umweg).

## Dateien

| Datei | Rolle |
|---|---|
| `tool.js` / `tool.css` | Rahmen in MPSkills, nur Brücke: Rahmen entsteht im ersten `update()` (`index.html?raum=CODE&rolle=presenter|participant`), reicht `skill_room_state.data` hinein (`sqls:state`) und Aufrufe hinaus (`sqls:call` → `ctx.actions.call`, nur `sql_*`; `sqls:setData` nur Lehrkraft). postMessage nur gleicher Ursprung und nur dieser Rahmen |
| `index.html` | die Anwendung; geht auch allein (`?rechte=use|modify|create` zum Ausprobieren) |
| `js/core.js` | Kern ohne DOM: Tokenizer, Anweisungen trennen (Trigger-Rumpf!), `classify` (Rechte + Übersetzung), `parseCreate`/`createSql` (Modell ↔ SQL), `planAlter` + `rebuild`, `schema`, `page`, `dump`, deutsche Fehlertexte mit „Meintest du …?" (`german`) |
| `js/worker.js` | sql.js + Kern im Worker, genau eine Datenbank offen |
| `js/client.js` | `SQLWorker` (Aufträge, Zeitlimit, Neustart) · `SQLStore` (IndexedDB `sqlstudio`, Store `dbs`, Index `scope`; ohne IndexedDB im Speicher mit Hinweis) |
| `js/app.js` | Betriebsarten (local/teacher/student), Brücke, Zustand, Seitenleiste (Teilen-Knöpfe, „Für die Klasse", „Arbeiten der Klasse"), Datenbanken öffnen/anlegen/kopieren/umbenennen/löschen/zurücksetzen, `saver` (Server-Speichern gebündelt nach 1,2 s, Anzeige oben, Wiederholung bei Netzfehler), `execSql` (hält bei CREATE DATABASE/USE an, erledigt das, macht weiter), Import, Export, Menü ⋯ (u. a. „Rechte ausprobieren" für Lehrkraft/allein) |
| `js/panes.js` | Reiter SQL (Editor, Beispiele mit echten Namen, Verlauf, Ergebniskarten, CSV), Daten (blättern, sortieren, suchen, Zelle ändern, Zeile einfügen mit Auswahl für ENUM/FK, löschen; zeigt danach das SQL), Struktur (Formular → MySQL-`CREATE TABLE`/ein `ALTER TABLE` mit allen Änderungen, Vorschau vor dem Ausführen), Diagramm |
| `js/editor.js` | eigener SQL-Editor (textarea über farbigem pre, ohne Umbruch; Zeilennummern, Autovervollständigung inkl. `alias.`, Fehlermarke) |
| `js/diagram.js` | Klassendiagramm: Anordnung (zwei Schichtungen, die mit kürzeren Linien gewinnt), Linien weichen Kästen aus, verschieben/zoomen (auch Zwei-Finger), Lage je Datenbank gemerkt (`layout` am Eintrag) |
| `js/ui.js` | toast, dialog, confirm, download, Ergebnistabelle, Zeichen |
| `data/*.sql` | System-Datenbanken (MySQL-Stil): haustiere (Einstieg), schule, bibliothek (n:m buch_autor), shop. Erzeugt von `data/erzeugen.cjs` (deterministisch) |
| `tests/core.test.mjs` | Prüfstand für den Kern unter Node: `node MPSkills/tools/SQLStudio/tests/core.test.mjs` |

Cache-Stempel `?v=20261023a` steht in index.html, worker.js, client.js, app.js (Vorlagen) und tool.js — bei Änderungen alle drehen.

## Betriebsarten und Speicher

| | local (index.html allein) | teacher (Lehrkraft im Raum) | student (Schüler im Raum) |
|---|---|---|---|
| Vorlagen | Kopie im Gerät | Kopie im Gerät, Teilen-Knopf | nur geteilte, Kopie im Raum |
| eigene | im Gerät (IndexedDB) | im Konto (`sql_databases`), Teilen-Knopf | mit `create` im Raum (`sql_work`, Schlüssel `own:…`) |
| Recht | „Rechte ausprobieren" | „Rechte ausprobieren" (nur bei ihr) | `r` des geteilten Eintrags, `create` je Raum |

- Einträge links haben eine id je Art: `sample:<vorlage>`, `<scope>|own:…` (Gerät), `srv:<uuid>`, `sh:<key>` (geteilt, key = `builtin:<vorlage>` oder uuid), `mine:own:…`, `peek:<teilnehmer>:<key>` (Lehrkraft schaut in eine Kopie, nur ansehen: `readOnly`), `none` (Schüler ohne Freigabe).
- IndexedDB-Einträge `{ id, scope, kind: 'copy'|'own', base, name, bytes, dirty, layout }`, scope = Raumcode (oder `solo`). Vorlage wird beim ersten Öffnen aus `data/<name>.sql` gebaut; „Auf Original zurücksetzen" baut neu (beim Schüler: Kopie im Raum löschen, `sql_mine_delete`).
- Schüler: geteilte Datenbank öffnen = eigene Kopie (`sql_mine_get`) falls vorhanden, sonst Original (Vorlage selbst gebaut bzw. `sql_shared_get`). Erste Änderung legt die Kopie an. Ändert die Lehrkraft ihre Datenbank später, bekommen das nur die, die sie danach zum ersten Mal öffnen.
- Entziehen: die Datenbank verschwindet beim Schüler sofort (offene wird geschlossen), die Kopie bleibt auf dem Server; wird wieder geteilt, ist die Arbeit zurück. `create` aus: eigene Datenbanken nur noch ansehen.
- Eine Lehrkraft, die aus Etappe 1 eigene Datenbanken im Gerät hat, bekommt sie beim ersten Öffnen im Raum ins Konto übernommen (`migrateLocalOwns`).
- Inhalte gehen als Base64 (SQLite-Datei) über `ctx.actions.call`, Deckel 1,5 MB je Datenbank, 50 je Lehrkraft, 30 Kopien je Schüler. Editor-Text, Verlauf, Reiter, Editorhöhe, Diagramm-Lage (außer Gerät/Konto) in localStorage (`sqls.<schlüssel>.<scope>`).
- Grenze: Teilen schreibt `skill_room_set_state` — das darf (Stand 0080) nur der Raumbesitzer; eingeladene Lehrkräfte (0205) sehen die Kopien, können aber nicht teilen.

**Achtung sql.js:** `db.export()` schließt und öffnet die Datenbank neu — danach sind `PRAGMA foreign_keys` aus UND alle eigenen Funktionen (NOW, YEAR, UUID …) weg. Immer `SQLCore.exportBytes(db)` nehmen, das stellt beides wieder her.

**Umbau einer Tabelle** (ALTER … MODIFY usw.): `PRAGMA foreign_keys` wirkt in einer offenen Transaktion nicht. Deshalb schaltet `run` die Fremdschlüssel VOR dem Savepoint ab und prüft danach selbst mit `foreign_key_check` — sonst scheitert jede Tabelle, auf die andere verweisen.

**Fremdschlüssel** heißen in der Oberfläche überall so und tragen ein ↑ hinter dem Attribut (Daten-Kopf, Struktur, Diagramm), wie im relationalen Schema im Unterricht.

**UUID**: Datentyp `UUID` (SQLite: Affinität NUMERIC, der Wert bleibt Text). Funktionen `UUID()`, `gen_random_uuid()`, `uuid_generate_v4()` (Version 4). `DEFAULT gen_random_uuid()` ohne Klammern wird zu `DEFAULT (gen_random_uuid())`. Im Struktur-Formular bekommt ein UUID-Primärschlüssel von selbst `DEFAULT (UUID())`.

## Nur für Admins

Migration 0220: Spalte `skill_tools.admin_only`. Policy `skill_tools_select_public` zeigt solche Skills nur Admins; Trigger `skill_rooms_admin_only` (before insert) lässt nur Admins Räume anlegen (Fehler `tool_admin_only`). Beitreten per Code geht für alle. Freigeben: `update skill_tools set admin_only = false where id = 'sqlstudio';` und in `MPSkills/tools.js` `adminOnly` streichen (setzt nur das Schild „Nur Admins" auf die Kachel). Prüfstand `supabase/tests/0220_sqlstudio.mjs`.

## Server (Migration 0221)

- `sql_databases` (Lehrkraft, überlebt den Raum) · `sql_work` (Kopie je Teilnehmer und Schlüssel, geht mit Raum/Teilnehmer).
- Lehrkraft: `sql_dbs_list`, `sql_db_get`, `sql_db_save` (p_content null = Inhalt bleibt), `sql_db_delete`, `sql_class_list`, `sql_class_get` (Besitzer oder eingeladene Lehrkraft).
- Schüler (Token): `sql_shared_get` (nur geteilt UND Datenbank einer Lehrkraft dieses Raums), `sql_mine_list/get/put/delete` (put nur solange geteilt bzw. mit create).
- Der Server prüft, wer was speichern/holen darf, nicht den Inhalt einer Kopie (das SQL läuft im Browser). Prüfstand `supabase/tests/0221_sqlstudio_teilen.mjs`.

## Später

- Aufgaben mit automatischer Prüfung (Ergebnis gegen erwartete Abfrage).
- Kopie eines Kindes live auf den Beamer (wie SYNIR), heute: „Arbeiten der Klasse" → antippen → nur ansehen.
