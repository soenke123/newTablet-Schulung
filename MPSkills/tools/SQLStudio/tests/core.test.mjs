/* Prüfstand für js/core.js — läuft unter Node:
     node MPSkills/tools/SQLStudio/tests/core.test.mjs
   Lädt sql.js und den Kern so, wie der Worker sie lädt (als
   Skripte), ohne Bündler. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..', 'lib');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename',
  readFileSync(join(lib, 'sql-wasm.js'), 'utf8'))(mod, mod.exports, createRequire(import.meta.url), lib, join(lib, 'sql-wasm.js'));
const SQL = await mod.exports({ locateFile: f => join(lib, f) });
new Function(readFileSync(join(here, '..', 'js', 'core.js'), 'utf8'))();
const C = globalThis.SQLCore;

let n = 0, bad = 0;
function t(name, fn) {
  n++;
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { bad++; console.log('  ✗   ' + name + '\n      ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')); }
}
const run = (db, sql, rights) => C.run(db, sql, { rights });
const ok = (r) => { const e = r.results.find(x => x.kind === 'error'); if (e) throw new Error(e.message + ' | ' + (e.raw || '') + ' | ' + e.sql); return r; };
const rows = (db, sql) => { const r = ok(run(db, sql)); return r.results[r.results.length - 1].rows; };

t('split: Semikolon in Strings und Triggern', () => {
  const s = C.split("SELECT 'a;b'; CREATE TRIGGER x AFTER INSERT ON t BEGIN UPDATE t SET a = CASE WHEN 1 THEN 2 END; SELECT 1; END; SELECT 2");
  assert.equal(s.length, 3);
  assert.match(s[1].text, /END$/);
});

t('MySQL CREATE TABLE mit AUTO_INCREMENT, ENUM, KEY, ENGINE', () => {
  const db = C.open(SQL);
  ok(run(db, `CREATE TABLE \`klasse\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`name\` varchar(10) NOT NULL COMMENT 'z. B. 7a',
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    CREATE TABLE schueler (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      vorname VARCHAR(50) NOT NULL,
      geschlecht ENUM('w','m','d'),
      klasse_id INT,
      angelegt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_klasse (klasse_id),
      CONSTRAINT fk_schueler_klasse FOREIGN KEY (klasse_id) REFERENCES klasse (id) ON DELETE SET NULL
    );
    INSERT INTO klasse (name) VALUES ('7a'), ('7b');
    INSERT INTO schueler (vorname, geschlecht, klasse_id) VALUES ('Mia', 'w', 1), ('Leon', 'm', 2);`));
  assert.deepEqual(rows(db, 'SELECT id, vorname FROM schueler ORDER BY id'), [[1, 'Mia'], [2, 'Leon']]);
  const e = run(db, "INSERT INTO schueler (vorname, geschlecht) VALUES ('X', 'q')").results[0];
  assert.equal(e.kind, 'error'); assert.match(e.message, /nicht erlaubt/);
  const f = run(db, "INSERT INTO schueler (vorname, klasse_id) VALUES ('X', 99)").results[0];
  assert.match(f.message, /Fremdschlüssel/);
  const sc = C.schema(db);
  const s = sc.tables.find(x => x.name === 'schueler');
  assert.equal(s.columns[0].ai, true);
  assert.deepEqual(s.columns.find(c => c.name === 'geschlecht').enumValues, ['w', 'm', 'd']);
  assert.equal(s.columns.find(c => c.name === 'klasse_id').fk.table, 'klasse');
  assert.equal(s.fks[0].name, 'fk_schueler_klasse');
  assert.ok(s.indexes.some(i => i.cols[0] === 'klasse_id'));
});

t('Rechte: use darf nicht CREATE, modify nicht CREATE DATABASE', () => {
  const db = C.open(SQL);
  ok(run(db, 'CREATE TABLE a (x INT)'));
  let r = run(db, 'SELECT 1; DROP TABLE a', 'use');
  assert.equal(r.results[1].kind, 'error'); assert.equal(r.results[1].denied, true);
  r = run(db, "INSERT INTO a VALUES (1); UPDATE a SET x = 2; DELETE FROM a", 'use');
  assert.ok(r.results.every(x => x.kind !== 'error'));
  r = run(db, 'CREATE DATABASE test', 'modify');
  assert.equal(r.results[0].denied, true);
  r = run(db, 'CREATE DATABASE test; USE test; CREATE TABLE b (y INT)', 'create');
  assert.equal(r.stop.cmd, 'create_database');
  assert.match(r.stop.rest, /USE test/);
  r = run(db, "ATTACH 'x' AS y", 'create');
  assert.equal(r.results[0].kind, 'error');
  r = run(db, 'PRAGMA foreign_keys = OFF', 'use');
  assert.equal(r.results[0].denied, true);
  r = run(db, 'PRAGMA table_info(a)', 'use');
  assert.equal(r.results[0].kind, 'rows');
});

t('ALTER TABLE MODIFY / CHANGE / ADD FOREIGN KEY / DROP COLUMN', () => {
  const db = C.open(SQL);
  ok(run(db, `CREATE TABLE ort (id INTEGER PRIMARY KEY, name TEXT);
              CREATE TABLE person (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, ort INT, alt TEXT);
              CREATE INDEX ix_name ON person (name);
              INSERT INTO ort VALUES (1, 'Kiel');
              INSERT INTO person (name, ort, alt) VALUES ('A', 1, 'x'), ('B', NULL, 'y');`));
  ok(run(db, 'ALTER TABLE person MODIFY name VARCHAR(80) NOT NULL'));
  ok(run(db, 'ALTER TABLE person CHANGE ort ort_id INT, ADD CONSTRAINT fk_ort FOREIGN KEY (ort_id) REFERENCES ort(id)'));
  ok(run(db, 'ALTER TABLE person DROP COLUMN alt'));
  ok(run(db, 'ALTER TABLE person ADD COLUMN geburt DATE'));
  ok(run(db, 'ALTER TABLE person ADD email VARCHAR(100) UNIQUE AFTER name'));
  const p = C.schema(db).tables.find(x => x.name === 'person');
  assert.deepEqual(p.columns.map(c => c.name), ['id', 'name', 'email', 'ort_id', 'geburt']);
  assert.equal(p.columns[1].notnull, true);
  assert.equal(p.columns[0].ai, true);
  assert.equal(p.fks[0].ref, 'ort');
  assert.ok(p.indexes.some(i => i.name === 'ix_name'), 'Index bleibt');
  assert.deepEqual(rows(db, 'SELECT name, ort_id FROM person ORDER BY id'), [['A', 1], ['B', null]]);
  // FK muss greifen
  assert.equal(run(db, "INSERT INTO person (name, ort_id) VALUES ('C', 5)").results[0].kind, 'error');
  // FK, der nicht zu den Daten passt → nichts ändert sich
  ok(run(db, 'CREATE TABLE t2 (id INT, p INT); INSERT INTO t2 VALUES (1, 99)'));
  const r = run(db, 'ALTER TABLE t2 ADD FOREIGN KEY (p) REFERENCES person(id)');
  assert.equal(r.results[0].kind, 'error');
  assert.equal(C.schema(db).tables.find(x => x.name === 't2').fks.length, 0);
  ok(run(db, 'ALTER TABLE person DROP FOREIGN KEY fk_ort'));
  assert.equal(C.schema(db).tables.find(x => x.name === 'person').fks.length, 0);
  ok(run(db, 'ALTER TABLE person RENAME TO leute'));
  assert.ok(C.schema(db).tables.some(x => x.name === 'leute'));
});

t('phpMyAdmin-Dump (ADD PRIMARY KEY, MODIFY AUTO_INCREMENT, ADD CONSTRAINT)', () => {
  const db = C.open(SQL);
  ok(run(db, `SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
/*!40101 SET NAMES utf8mb4 */;
CREATE TABLE \`autor\` (
  \`id\` int(11) NOT NULL,
  \`name\` varchar(100) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
INSERT INTO \`autor\` (\`id\`, \`name\`) VALUES (1, 'Cornelia Funke'), (2, 'Michael Ende');
CREATE TABLE \`buch\` (\`id\` int(11) NOT NULL, \`titel\` varchar(200) NOT NULL, \`autor_id\` int(11) DEFAULT NULL) ENGINE=InnoDB;
INSERT INTO \`buch\` VALUES (1, 'Momo', 2), (2, 'Tintenherz', 1), (3, 'Die unendliche Geschichte', 2);
ALTER TABLE \`autor\` ADD PRIMARY KEY (\`id\`);
ALTER TABLE \`buch\` ADD PRIMARY KEY (\`id\`), ADD KEY \`autor_id\` (\`autor_id\`);
ALTER TABLE \`autor\` MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;
ALTER TABLE \`buch\` ADD CONSTRAINT \`buch_ibfk_1\` FOREIGN KEY (\`autor_id\`) REFERENCES \`autor\` (\`id\`);
COMMIT;`));
  const sc = C.schema(db);
  assert.equal(sc.tables.find(x => x.name === 'autor').columns[0].ai, true);
  assert.equal(sc.tables.find(x => x.name === 'buch').fks[0].name, 'buch_ibfk_1');
  assert.deepEqual(rows(db, "SELECT a.name, count(*) FROM buch b JOIN autor a ON a.id = b.autor_id GROUP BY a.name ORDER BY 2 DESC"),
    [['Michael Ende', 2], ['Cornelia Funke', 1]]);
});

t('SHOW TABLES, DESCRIBE, SHOW CREATE TABLE', () => {
  const db = C.open(SQL);
  ok(run(db, 'CREATE TABLE k (id INT AUTO_INCREMENT PRIMARY KEY, n VARCHAR(5) UNIQUE)'));
  assert.deepEqual(rows(db, 'SHOW TABLES'), [['k']]);
  const d = rows(db, 'DESCRIBE k');
  assert.deepEqual(d[0], ['id', 'INTEGER', 'NO', 'PRI', null, 'auto_increment']);
  assert.equal(d[1][3], 'UNI');
  assert.match(rows(db, 'SHOW CREATE TABLE k')[0][1], /AUTOINCREMENT/);
});

t('MySQL-Funktionen und Kleinkram', () => {
  const db = C.open(SQL);
  assert.deepEqual(rows(db, "SELECT IF(1>0,'ja','nein'), LEFT('Hallo',2), RIGHT('Hallo',3), YEAR('2024-05-03'), DATEDIFF('2024-05-03','2024-05-01'), UCASE('ä'), CONCAT('a','b'), DATE_FORMAT('2024-05-03','%d.%m.%Y')"),
    [['ja', 'Ha', 'llo', 2024, 2, 'Ä', 'ab', '03.05.2024']]);
  ok(run(db, "CREATE TABLE u (id INT PRIMARY KEY, s TEXT); INSERT IGNORE INTO u VALUES (1,'It\\'s'); INSERT IGNORE INTO u VALUES (1,'x')"));
  assert.deepEqual(rows(db, 'SELECT s FROM u'), [["It's"]]);
  ok(run(db, 'TRUNCATE TABLE u'));
  assert.deepEqual(rows(db, 'SELECT count(*) FROM u'), [[0]]);
  ok(run(db, 'DROP TABLE IF EXISTS u, nichtda'));
});

t('Fehler auf Deutsch mit Vorschlag', () => {
  const db = C.open(SQL);
  ok(run(db, 'CREATE TABLE schueler (vorname TEXT)'));
  let e = run(db, 'SELECT * FROM schuler').results[0];
  assert.match(e.message, /gibt es nicht/); assert.match(e.hint, /schueler/);
  e = run(db, 'SELECT vornme FROM schueler').results[0];
  assert.match(e.hint, /vorname/);
  e = run(db, 'SELECT vorname, FROM schueler').results[0];
  assert.match(e.hint, /Komma/);
  e = run(db, 'SELECT * FROM schueler WHERE vorname = "Mia"').results[0];
  assert.notEqual(e.kind, 'error');   // SQLite nimmt "Mia" als Text, wenn es keine Spalte ist
});

t('UPDATE ohne WHERE warnt', () => {
  const db = C.open(SQL);
  ok(run(db, 'CREATE TABLE z (a INT); INSERT INTO z VALUES (1),(2)'));
  const r = ok(run(db, 'UPDATE z SET a = 0'));
  assert.ok(r.results[0].warn && r.results[0].warn.length);
});

t('export behält foreign_keys an; dump lässt sich wieder einspielen', () => {
  const db = C.open(SQL);
  ok(run(db, 'CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (id INT, p INT REFERENCES p(id)); INSERT INTO p VALUES (1); INSERT INTO c VALUES (1,1)'));
  C.exportBytes(db);
  assert.equal(run(db, 'INSERT INTO c VALUES (2, 7)').results[0].kind, 'error');
  const d = C.dump(db, 'Test');
  const db2 = C.open(SQL);
  ok(run(db2, d));
  assert.deepEqual(rows(db2, 'SELECT * FROM c'), [[1, 1]]);
  const pg = C.page(db2, 'c', { filter: '1' });
  assert.equal(pg.total, 1);
});

console.log(`\n${n - bad}/${n} bestanden`);
process.exit(bad ? 1 : 0);
