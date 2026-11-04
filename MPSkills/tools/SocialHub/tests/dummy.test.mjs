/* Prüfstand Dummy-Daten (dummy/daten.js + dummy/generator.js)
     node MPSkills/tools/SocialHub/tests/dummy.test.mjs [stichtag]

   Lädt die erzeugten Daten mit dem echten Schema (SHDB.DDL aus js/db.js) in
   SQLite – über denselben SQL-Studio-Kern wie der Adminbereich – und prüft,
   dass die Aufgaben des Arbeitsblatts „Datenbanksysteme“ die gewollten
   Antworten (und Fallen) haben. Läuft für mehrere Stichtage, damit die
   „wachsenden“ Zeiten (Alter, Posts) jedes Jahr stimmen. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const SH = join(here, '..');
const lib = join(SH, '..', 'SQLStudio', 'lib');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename',
  readFileSync(join(lib, 'sql-wasm.js'), 'utf8'))(mod, mod.exports, createRequire(import.meta.url), lib, join(lib, 'sql-wasm.js'));
const SQL = await mod.exports({ locateFile: f => join(lib, f) });
new Function(readFileSync(join(SH, '..', 'SQLStudio', 'js', 'core.js'), 'utf8'))();
const C = globalThis.SQLCore;
new Function(readFileSync(join(SH, 'dummy', 'daten.js'), 'utf8'))();
new Function(readFileSync(join(SH, 'dummy', 'generator.js'), 'utf8'))();
const G = globalThis.SHDummy;

// DDL aus js/db.js (Objekt-Literal herausschneiden)
const dbjs = readFileSync(join(SH, 'js', 'db.js'), 'utf8');
const ddlSrc = dbjs.slice(dbjs.indexOf('const DDL = {') + 12, dbjs.indexOf('// Eltern vor Kindern'));
const DDL = new Function('return ' + ddlSrc.trim().replace(/;\s*$/, ''))();
const ORDER = ['users', 'tags', 'photos', 'sessions', 'comments', 'follows', 'likes', 'photo_tag', 'views'];

let n = 0, bad = 0;
const ok = (name, cond, info) => { n++; if (cond) console.log('ok    ' + name); else { bad++; console.log('FEHL  ' + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); } };
const lit = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0')
  : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";

function load(data) {
  const db = C.open(SQL, null);
  let script = '';
  for (const t of ORDER) script += DDL[t] + '\n';
  for (const t of ORDER) {
    const { cols, rows } = data[t];
    for (let i = 0; i < rows.length; i += 200) {
      script += 'INSERT INTO ' + t + ' (' + cols.join(', ') + ') VALUES\n' +
        rows.slice(i, i + 200).map(r => '(' + r.map(lit).join(', ') + ')').join(',\n') + ';\n';
    }
  }
  const r = C.run(db, script, { rights: 'create', maxRows: 1 });
  const err = r.results.find(x => x.kind === 'error');
  if (err) throw new Error(err.message + ' — ' + String(err.sql || '').slice(0, 200));
  return db;
}
const q = (db, sql) => {
  const r = C.run(db, sql, { rights: 'use', maxRows: 5000 });
  const err = r.results.find(x => x.kind === 'error');
  if (err) throw new Error(err.message + ' | ' + sql);
  const last = r.results[r.results.length - 1];
  return last.rows || [];
};
const one = (db, sql) => { const r = q(db, sql); return r.length ? r[0][0] : null; };
const col = (db, sql) => q(db, sql).map(r => r[0]);

const days = process.argv[2] ? [process.argv[2]] : ['2026-11-04', '2027-09-01', '2028-02-29', '2031-06-15'];
for (const day of days) {
  console.log('\n── Stichtag ' + day + ' ──');
  const data = G.build({ stichtag: day, netz: 'Liky' });
  const again = G.build({ stichtag: day, netz: 'Liky' });
  ok('gleicher Stichtag = gleiche Daten', JSON.stringify(data) === JSON.stringify(again));
  let db;
  try { db = load(data); ok('lädt mit dem echten Schema (Fremdschlüssel, ENUMs, CHECKs)', true); }
  catch (e) { ok('lädt mit dem echten Schema', false, e.message); continue; }
  const NOW = `'${day} 23:59:00'`;
  const age = `(CAST(strftime('%Y', ${NOW}) AS INT) - CAST(strftime('%Y', birthday) AS INT) - (strftime('%m-%d', ${NOW}) < strftime('%m-%d', birthday)))`;

  // Mengen
  ok('70 User', one(db, 'SELECT COUNT(*) FROM users') === 70);
  const np = one(db, 'SELECT COUNT(*) FROM photos');
  ok('150 Fotos', np === 150, np);
  const ns = one(db, 'SELECT COUNT(*) FROM sessions'), nv = one(db, 'SELECT COUNT(*) FROM views');
  ok('sessions ~1000, views ~8000 je Netzwerk (Deckel 5000 / 100 000)', ns > 600 && ns <= 1500 && nv > 6000 && nv <= 10000, { ns, nv });
  console.log('      Umfang: ' + ['follows', 'likes', 'comments'].map(t => t + ' ' + one(db, 'SELECT COUNT(*) FROM ' + t)).join(' · ') + ` · sessions ${ns} · views ${nv}`);

  // Zeiten wachsen mit
  ok('Minderjährige: 23 (wächst mit dem Stichtag mit)', one(db, `SELECT COUNT(*) FROM users WHERE ${age} < 18`) === 23, one(db, `SELECT COUNT(*) FROM users WHERE ${age} < 18`));
  ok('genau eine unter 13 (Lotta)', col(db, `SELECT username FROM users WHERE ${age} < 13`).join() === 'lotta.b');
  ok('Noah ist 17 (wird morgen 18) …', one(db, `SELECT ${age} FROM users WHERE username='noah.sz'`) === 17);
  ok('… aber FLOOR(DATEDIFF/365) sagt schon 18 (Falle)', one(db, `SELECT FLOOR(DATEDIFF(${NOW}, birthday)/365) FROM users WHERE username='noah.sz'`) === 18);
  ok('Emma ist seit gestern 18', one(db, `SELECT ${age} FROM users WHERE username='emma.kr'`) === 18);
  ok('älteste: Erna, 78 (4b)', q(db, `SELECT username, ${age} FROM users WHERE birthday IS NOT NULL ORDER BY birthday LIMIT 1`)[0].join() === 'erna.lueders,78');
  ok('gleicher Geburtstag: Jakob + Yusuf (4f)', col(db, `SELECT username FROM users WHERE birthday IN (SELECT birthday FROM users GROUP BY birthday HAVING COUNT(*) > 1) ORDER BY username`).join() === 'jakob.hu,yusuf.dmr');
  ok('Mila + Elisa: gleicher Tag, anderes Jahr', one(db, `SELECT COUNT(DISTINCT birthday) FROM users WHERE strftime('%m-%d', birthday) = (SELECT strftime('%m-%d', birthday) FROM users WHERE username='inkandmila')`) === 2);
  ok('3h-Ersatz „vor 17 Jahren geboren“ hat Treffer', one(db, `SELECT COUNT(*) FROM users WHERE strftime('%Y', birthday) = CAST(strftime('%Y', ${NOW}) - 17 AS TEXT)`) > 0);
  ok('zuletzt registriert: jule.w (4a)', one(db, 'SELECT username FROM users ORDER BY created_at DESC LIMIT 1') === 'jule.w');
  ok('letztes Foto: Noah am Stichtag (5c)', one(db, 'SELECT u.username FROM photos p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 1') === 'noah.sz');
  ok('Foto nie vor der Registrierung', one(db, 'SELECT COUNT(*) FROM photos p JOIN users u ON u.id = p.user_id WHERE p.created_at < u.created_at') === 0);
  ok('Kommentar nie vor dem Foto / vor der Registrierung', one(db, 'SELECT COUNT(*) FROM comments c JOIN photos p ON p.id = c.photo_id JOIN users u ON u.id = c.user_id WHERE c.created_at < p.created_at OR c.created_at < u.created_at') === 0);
  ok('Like nie vor dem Foto', one(db, 'SELECT COUNT(*) FROM likes l JOIN photos p ON p.id = l.photo_id WHERE l.created_at < p.created_at') === 0);
  ok('nichts liegt in der Zukunft', one(db, `SELECT COUNT(*) FROM (SELECT created_at t FROM users UNION ALL SELECT created_at FROM photos UNION ALL SELECT created_at FROM comments UNION ALL SELECT created_at FROM likes UNION ALL SELECT started_at FROM sessions) WHERE t > ${NOW}`) === 0);

  // Arbeitsblatt-Figuren
  ok('3d: zwei Levi Schumacher', one(db, "SELECT COUNT(*) FROM users WHERE name = 'Levi Schumacher'") === 2);
  ok('3k: Levi aus Kiel = 2 (Schumacher + Nowak)', one(db, "SELECT COUNT(*) FROM users WHERE name LIKE 'Levi%' AND city = 'Kiel'") === 2);
  ok('3m: Felix nicht aus Berlin = nur Felix Ude', col(db, "SELECT name FROM users WHERE name LIKE 'Felix%' AND city != 'Berlin'").join() === 'Felix Ude');
  ok('3o: Lasse/Lars aus Berlin = Lasse + Lars-Ole (Falle)', col(db, "SELECT username FROM users WHERE (name LIKE 'Lasse%' OR name LIKE 'Lars%') AND city = 'Berlin' ORDER BY username").join() === 'larsole,lasse.ld');
  ok('3o: Erna folgt Lasse', one(db, "SELECT COUNT(*) FROM follows f JOIN users a ON a.id=f.follower_id JOIN users b ON b.id=f.following_id WHERE a.username='erna.lueders' AND b.username='lasse.ld'") === 1);
  ok('Hamburg: „=“ findet nur 1, LIKE + Varianten mehr', one(db, "SELECT COUNT(*) FROM users WHERE city = 'Hamburg'") === 1 && one(db, "SELECT COUNT(*) FROM users WHERE city LIKE 'Hamburg%'") === 3);
  ok('Germany/deutschland/DE neben Deutschland', one(db, "SELECT COUNT(DISTINCT country) FROM users WHERE country IN ('Deutschland','Germany','deutschland','DE')") === 4);
  ok('6b: 5 User aus Leipzig', one(db, "SELECT COUNT(*) FROM users WHERE city = 'Leipzig'") === 5);
  ok('München 7', one(db, "SELECT COUNT(*) FROM users WHERE city = 'München'") === 7);
  ok('Kiel mit > 5 Fotos: Levi + Finn', col(db, "SELECT u.username FROM users u JOIN photos p ON u.id = p.user_id WHERE city='Kiel' GROUP BY u.id HAVING COUNT(p.id) > 5 ORDER BY u.username").join() === 'finn.kielwasser,levi.kicks');
  ok('9a: %Lisa% trifft auch Elisa + Annalisa (4)', one(db, "SELECT COUNT(*) FROM users WHERE name LIKE '%Lisa%'") === 4 && one(db, "SELECT COUNT(*) FROM users WHERE name LIKE 'Lisa%'") === 2);
  ok('9b: Alexander Achen hat 5 Fotos', one(db, "SELECT COUNT(*) FROM photos p JOIN users u ON u.id=p.user_id WHERE u.name='Alexander Achen'") === 5);
  const hz = "(SELECT id FROM users WHERE name='Henriette Zimmerman')";
  ok('9c: Henriette hat Fotos, Kommentare, Follower, Abos, Profilbild',
    one(db, `SELECT COUNT(*) FROM photos WHERE user_id=${hz}`) > 0 && one(db, `SELECT COUNT(*) FROM comments WHERE user_id=${hz}`) > 0 &&
    one(db, `SELECT COUNT(*) FROM follows WHERE following_id=${hz}`) > 0 && one(db, `SELECT COUNT(*) FROM follows WHERE follower_id=${hz}`) > 0 &&
    one(db, `SELECT avatar FROM users WHERE id=${hz}`) !== null);
  ok('5e: Tag abenteuerlust exakt vs. LIKE %abenteuer%', one(db, "SELECT COUNT(*) FROM photo_tag pt JOIN tags t ON t.id=pt.tag_id WHERE t.name='abenteuerlust'") === 4
    && one(db, "SELECT COUNT(*) FROM photo_tag pt JOIN tags t ON t.id=pt.tag_id WHERE t.name LIKE '%abenteuer%'") === 6);
  ok('5f: Alina Keller nutzt Tags', one(db, "SELECT COUNT(DISTINCT t.id) FROM users u JOIN photos p ON p.user_id=u.id JOIN photo_tag pt ON pt.photo_id=p.id JOIN tags t ON t.id=pt.tag_id WHERE u.name='Alina Keller'") >= 8);
  ok('6a: Kommentare von Münchnern', one(db, "SELECT COUNT(*) FROM comments c JOIN users u ON u.id=c.user_id WHERE u.city='München'") > 10);
  ok('Übung g: aaron183 hat kommentiert', one(db, "SELECT COUNT(*) FROM comments c JOIN users u ON u.id=c.user_id WHERE u.username='aaron183'") >= 15);
  ok('Übung h: Laura Mauer + Marlo Eberhart liken', one(db, "SELECT COUNT(*) FROM likes l JOIN users u ON u.id=l.user_id WHERE u.name IN ('Laura Mauer','Marlo Eberhart')") > 20);
  ok('genau 5 Fotos ohne Like (LEFT JOIN)', col(db, 'SELECT p.image FROM photos p LEFT JOIN likes l ON l.photo_id = p.id WHERE l.photo_id IS NULL ORDER BY p.image').join() ===
    ['ben_01', 'jakob_01', 'larsole_01', 'ole_04', 'ralf_02'].map(f => 'dummy/' + f + '.webp').join());
  ok('4 Fotos ohne Tag', one(db, 'SELECT COUNT(*) FROM photos p LEFT JOIN photo_tag pt ON pt.photo_id = p.id WHERE pt.photo_id IS NULL') === 4);
  ok('8f: Boote – Tag boot 5 Fotos, LIKE %boot% in Text trifft „Bootcamp“', one(db, "SELECT COUNT(*) FROM photo_tag pt JOIN tags t ON t.id=pt.tag_id WHERE t.name='boot'") === 5
    && col(db, "SELECT image FROM photos WHERE description LIKE '%boot%'").includes('dummy/fee_03.webp'));
  ok('Brigitte: „60 Likes = Rezept!“ hat 59', one(db, "SELECT COUNT(*) FROM likes l JOIN photos p ON p.id=l.photo_id WHERE p.image='dummy/brigitte_05.webp'") === 59);
  ok('Bot: gleicher Spam unter 30 Fotos (GROUP BY body)', q(db, 'SELECT body, COUNT(*) FROM comments GROUP BY body ORDER BY COUNT(*) DESC LIMIT 1')[0][1] === 30);

  // Echsen statt Hitler
  const ech = q(db, "SELECT DISTINCT u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.body LIKE '%Echse%' ORDER BY u.username").map(r => r[0]);
  ok('Echsen-Kommentare: die zwei Trolle …', ech.includes('mondrueckseite') && ech.includes('echsenwache'), ech);
  ok('… und harmlose Treffer (Falle beim Löschen: ida.hsn)', ech.includes('ida.hsn'), ech);
  ok('kein „Hitler“ in den Daten', one(db, "SELECT COUNT(*) FROM comments WHERE body LIKE '%Hitler%'") === 0);

  // E-Mails
  const own = one(db, "SELECT COUNT(*) FROM users WHERE email LIKE '%@liky.test'"), ext = one(db, "SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@liky.test'");
  ok('E-Mails gemischt: eigene Domain + extern (Übung c)', own > 25 && ext > 20, { own, ext });
  ok('E-Mail-Groß-/Kleinschreibung: Erna nur mit LOWER gefunden', one(db, "SELECT COUNT(*) FROM users WHERE email LIKE '%t-online.test' AND username='erna.lueders'") === 1);

  // Passwörter
  ok('schwache Passwörter: 123456 zweimal', one(db, "SELECT COUNT(*) FROM users WHERE password = '123456'") === 2);

  // Analytics
  ok('VPN: Tomasz mit mehr als 5 IPs, sonst niemand', col(db, 'SELECT u.username FROM sessions s JOIN users u ON u.id=s.user_id GROUP BY u.id HAVING COUNT(DISTINCT s.ip) > 5 AND u.username != \'gewinn_jetzt_2026\'').join() === 'vanlife_tomasz',
    q(db, 'SELECT u.username, COUNT(DISTINCT s.ip) FROM sessions s JOIN users u ON u.id=s.user_id GROUP BY u.id HAVING COUNT(DISTINCT s.ip) > 5'));
  ok('gleicher Ort: Lasse + Lars-Ole teilen eine Heim-IP', one(db, "SELECT COUNT(*) FROM (SELECT ip FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.username IN ('lasse.ld','larsole') AND ip NOT LIKE '100.%' GROUP BY ip HAVING COUNT(DISTINCT u.id) = 2)") >= 1);
  ok('nachts online (1–3 Uhr): Tim und Ida dabei', (() => { const r = col(db, "SELECT DISTINCT u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE CAST(strftime('%H', started_at) AS INT) BETWEEN 1 AND 3"); return r.includes('tim.richter') && r.includes('ida.hsn'); })());
  ok('Desktop-Browser: mehrere', one(db, "SELECT COUNT(DISTINCT browser) FROM sessions WHERE device_type='desktop'") >= 4);
  ok('views gehören zu Sessions desselben Users', one(db, 'SELECT COUNT(*) FROM views v JOIN sessions s ON s.id=v.session_id WHERE s.user_id != v.user_id') === 0);
  ok('views: nur Fotos, die es schon gab', one(db, 'SELECT COUNT(*) FROM views v JOIN photos p ON p.id=v.photo_id WHERE v.viewed_at < p.created_at') === 0);
  ok('Gamer schauen Gaming länger an (Werbung)', one(db, "SELECT AVG(v.duration_ms) FROM views v JOIN users u ON u.id=v.user_id JOIN photo_tag pt ON pt.photo_id=v.photo_id JOIN tags t ON t.id=pt.tag_id WHERE u.username='tim.richter' AND t.name='gaming'")
    > 2 * one(db, "SELECT AVG(v.duration_ms) FROM views v JOIN users u ON u.id=v.user_id JOIN photo_tag pt ON pt.photo_id=v.photo_id JOIN tags t ON t.id=pt.tag_id WHERE u.username='tim.richter' AND t.name='hund'"));
}

// Blacklist wie contains_blacklisted_text (Migration 0081) – sonst lehnt der Server die Daten ab
{
  const words = readFileSync(join(SH, '..', '..', '..', 'supabase', 'blacklist_de.txt'), 'utf8').split('\n')
    .map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'));
  const tr = { '$': 's', '@': 'a', '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
  const bad = (txt) => String(txt || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[$@013457]/g, c => tr[c]).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
    .find(tok => words.some(w => tok === w || (w.length >= 6 && tok.includes(w))));
  const d = G.build({ stichtag: '2026-11-04', netz: 'Liky' });
  const hits = [];
  for (const t of ['users', 'photos', 'comments', 'tags']) d[t].rows.forEach(r => {
    const txt = r.filter(v => typeof v === 'string' && !/^\$2|^Mozilla/.test(v)).join(' ');
    // Passwort (Spalte 4 bei users) prüft der Server nicht
    const t2 = t === 'users' ? r.filter((v, i) => i !== 4 && typeof v === 'string').join(' ') : txt;
    const w = bad(t2); if (w) hits.push(t + ': ' + w + ' in ' + t2.slice(0, 80));
  });
  ok('kein Text bleibt an der Blacklist hängen (' + words.length + ' Wörter)', hits.length === 0, hits.slice(0, 8));
}

// netz und firstId
const d2 = G.build({ stichtag: '2026-11-04', netz: 'Große Pause', firstId: 4 });
ok('{netz} → großepause (ohne Sonderzeichen)', d2.users.rows[0][3] === 'paul.brandt@grossepause.test', d2.users.rows[0][3]);
ok('firstId verschiebt alle ids', d2.users.rows[0][0] === 4 && d2.photos.rows[0][1] === 4);

console.log('\n' + (bad ? bad + ' von ' + n + ' FEHLGESCHLAGEN' : 'alles ok (' + n + ')'));
process.exit(bad ? 1 : 0);
