/* YourSozialNet — Prüfstand im echten Browser (Playwright + pglite).
   Die App läuft in tests/harness.html (spielt den Raum nach), jeder
   Serveraufruf geht gegen pglite mit der ganzen Migrationskette.

   Ablauf: Lehrkraft erstellt Tabellen im Diagramm und ihr eigenes
   Netzwerk → Mia erstellt ihr Netzwerk in zwei Schritten (Formular
   übersteht einen Zustandswechsel), postet, legt ein zweites Konto an,
   liked, kommentiert, folgt → Leon kommt nur über „anderes Tablet“
   hinein → Einstellungen, SQL (INSERT mit PASSWORD_HASH), Diagramm →
   Lehrkraft setzt das Admin-Passwort zurück, Testkonto. Bildschirmfotos landen in SH_SHOTS (Standard:
   tests/shots, nicht im Repo).

   Aufruf:  node MPSkills/tools/SocialHub/tests/e2e.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const SHOTS = process.env.SH_SHOTS || path.join(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });

/* ── Datenbank ─────────────────────────────────────────── */
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
await db.exec(`
create schema if not exists auth; create schema if not exists extensions;
set search_path = public, extensions;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create role service_role; create role authenticated; create role anon;
create publication supabase_realtime;`);
for (const f of readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8')); }
  catch (e) { if (!f.startsWith('0087')) { console.error('FEHLER in', f, e.message); process.exit(1); } }
}
const T1 = 'e0000000-0000-4000-8000-0000000000f1';
const SCHOOL = (await db.query(`select id from schools limit 1`)).rows[0]?.id
  ?? (await db.query(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).rows[0].id;
await db.query(`insert into auth.users (id) values ($1)`, [T1]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 't1', 'Frau Test', 'active', 'approved', true)`, [T1, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T1]);
const CODE = (await db.query(`select skill_room_create('socialhub', 'Info 9a', false, '{}'::jsonb) v`)).rows[0].v.code;
const ROOM = (await db.query(`select id from skill_rooms where code = $1`, [CODE])).rows[0].id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokMia', 1, 'Mia'), ($1, 'tokLeon', 2, 'Leon')`, [ROOM]);

let lock = Promise.resolve();
function rpcAs(who, fn, args) {
  const run = async () => {
    await db.exec(`delete from _who`);
    const a = Object.assign({}, args);
    if (who === 'teacher') { await db.query(`insert into _who values ($1)`, [T1]); a.p_code = CODE; }
    else a.p_token = who;
    const keys = Object.keys(a);
    const vals = keys.map(k => (a[k] !== null && typeof a[k] === 'object') ? JSON.stringify(a[k]) : a[k]);
    const sql = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}` + ((a[k] !== null && typeof a[k] === 'object') ? '::jsonb' : '')).join(', ')}) v`;
    try { return (await db.query(sql, vals)).rows[0].v; }
    catch (e) { console.error('RPC', fn, e.message); return { ok: false, error: 'server_error', message: e.message }; }
  };
  const p = lock.then(run, run);
  lock = p.catch(() => {});
  return p;
}
const stateOf = async () => (await db.query(`select coalesce(data, '{}'::jsonb) d from skill_room_state where room_id = $1`, [ROOM])).rows[0]?.d || {};

/* ── Webserver ─────────────────────────────────────────── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/wasm',
               '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(REPO, u);
  if (!file.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
  try { const b = readFileSync(file); res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/MPSkills/tools/SocialHub/tests/harness.html?raum=${CODE}`;

/* ── Browser ───────────────────────────────────────────── */
let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`); };
const browser = await chromium.launch();
const errors = [];
async function open(who, size) {
  const ctx = await browser.newContext({ viewport: size || { width: 400, height: 760 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(who + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(who + ' console: ' + m.text()); });
  await page.exposeFunction('rpc', (fn, args) => rpcAs(who, fn, args));
  await page.exposeFunction('rpcState', () => stateOf());
  await page.goto(BASE + '&rolle=' + (who === 'teacher' ? 'presenter' : 'participant'));
  const app = page.frameLocator('iframe');
  return { page, app };
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const wait = ms => new Promise(r => setTimeout(r, ms));

// Testbild: buntes PNG, 1600×1200
async function makePng(page) {
  return await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1600, 1200); g.addColorStop(0, '#ff6a3d'); g.addColorStop(1, '#3d7bff');
    x.fillStyle = g; x.fillRect(0, 0, 1600, 1200);
    for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i * 7},80%,60%)`; x.beginPath(); x.arc(Math.random() * 1600, Math.random() * 1200, Math.random() * 40, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = 'bold 160px sans-serif'; x.fillText('Sonne!', 520, 640);
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
}

try {
  // 1) Lehrkraft erstellt Tabellen im Diagramm
  const t = await open('teacher', { width: 1280, height: 860 });
  await t.app.locator('text=Tabellen für alle Netzwerke').waitFor();
  ok('1  users grün und fest, likes erst nach photos', await t.app.locator('.tb--fixed[data-tb="users"]').count() === 1
     && await t.app.locator('[data-tadd="likes"][disabled]').count() === 1);
  for (const id of ['photos', 'follows', 'likes', 'comments', 'comment_likes', 'tags']) {
    await t.app.locator(`[data-tadd="${id}"]`).click();
    await t.app.locator(`[data-tdrop="${id}"]`).waitFor();
  }
  ok('1  Lehrkraft erstellt sechs Tabellen', (await stateOf()).tables?.length === 6, JSON.stringify(await stateOf()));
  await t.app.locator('[data-tb="users"]').click();
  ok('1  Antippen zeigt die Attribute (mit gender)', /gender/.test(await t.app.locator('#tdgInfo').textContent()));
  ok('1  Linien im Diagramm', await t.app.locator('.tdg-lines line.on').count() === 11, String(await t.app.locator('.tdg-lines line').count()));
  await shot(t.page, '1-lehrkraft');
  // 1b) Lehrkraft erstellt ihr eigenes Netzwerk (2 Schritte)
  await t.app.locator('#btnFound').click();
  await t.app.locator('input[name=name]').fill('Lehrerzimmer');
  await t.app.locator('[data-logo-id="graph"]').click();
  await shot(t.page, '1b-gruenden-lehrkraft');
  await t.app.locator('button[type=submit]').click();
  await t.app.locator('#rForm').waitFor();
  ok('1b Schritt 2: Anmeldename „admin“ vorbelegt', await t.app.locator('input[name=user]').inputValue() === 'admin');
  await t.app.locator('input[name=pw]').fill('lehrer1');
  await t.app.locator('input[name=pw2]').fill('lehrer1');
  await t.app.locator('#rForm button[type=submit]').click();
  await t.app.locator('.hub-name', { hasText: 'Lehrerzimmer' }).waitFor();
  ok('1b Netzwerk der Lehrkraft: angemeldet, App + Adminbereich, ＋ da', await t.app.locator('.hub-top .chip', { hasText: '@admin' }).count() === 1
     && await t.app.locator('[data-view="admin"]').count() === 1 && await t.app.locator('[data-tab="post"]').count() === 1);
  await t.app.locator('#toHome').click();
  await t.app.locator('.net-row.is-mine').waitFor();
  await t.page.reload();
  await t.app.locator('.net-row.is-mine .nr-main').click();
  await t.app.locator('.hub-top .chip', { hasText: '@admin' }).waitFor();
  ok('1b Lehrkraft bleibt in ihrem Netzwerk angemeldet (nach Neuladen)', true);
  await t.app.locator('#toHome').click();
  await t.app.locator('.net-row.is-mine').waitFor();

  // 2) Mia erstellt ein Netzwerk
  const mia = await open('tokMia', { width: 1024, height: 768 });
  await mia.app.locator('#btnFound').waitFor();
  ok('2  Schüler: nur „Netzwerk erstellen“, keine fremden Netzwerke', await mia.app.locator('.net-tile').count() === 0);
  await shot(mia.page, '2a-start-schueler');
  await mia.app.locator('#btnFound').click();
  await mia.app.locator('input[name=name]').fill('Pixelwelt');
  await mia.app.locator('[data-logo-id="like"]').click();
  await shot(mia.page, '2b-gruenden');
  await mia.app.locator('button[type=submit]').click();
  await mia.app.locator('#rForm').waitFor();
  ok('2  Schritt 2: admin vorbelegt', await mia.app.locator('input[name=user]').inputValue() === 'admin');
  await mia.app.locator('input[name=name]').fill('Mia');
  await mia.app.locator('select[name=gender]').selectOption('female');
  await mia.app.locator('input[name=pw]').fill('geheim1');
  await mia.app.locator('input[name=pw2]').fill('geheim2');
  // Rückmeldung 2: ein Zustandswechsel im Raum darf das Formular nicht wegwerfen
  await t.app.locator('label.switch').click();
  await wait(2600);
  ok('2  Formular bleibt bei Zustandswechsel stehen', await mia.app.locator('input[name=pw]').inputValue() === 'geheim1');
  await t.app.locator('label.switch').click();
  await wait(1800);
  await shot(mia.page, '2c-admin-konto');
  await mia.app.locator('#rForm button[type=submit]').click();
  await wait(300);
  ok('2  Passwort wiederholen: ungleich → nicht angelegt', (await db.query(`select count(*)::int n from sh_users u join sh_hubs h on h.id = u.hub_id where h.name = 'Pixelwelt'`)).rows[0].n === 0);
  await mia.app.locator('input[name=pw2]').fill('geheim1');
  await mia.app.locator('#rForm button[type=submit]').click();
  await mia.app.locator('.hub-name', { hasText: 'Pixelwelt' }).waitFor();
  ok('2  Netzwerk online, Reiter App/Adminbereich', await mia.app.locator('[data-view="admin"]').count() === 1 && await mia.app.locator('[data-view="app"].on').count() === 1);
  const mu = (await db.query(`select username, role, gender from sh_users u join sh_hubs h on h.id = u.hub_id where h.name = 'Pixelwelt'`)).rows[0];
  ok('2  erstes Konto = admin, mit gender', mu.username === 'admin' && mu.role === 'admin' && mu.gender === 'female', JSON.stringify(mu));

  // 3) Foto posten (wird verkleinert)
  const png = await makePng(mia.page);
  await mia.app.locator('[data-tab="post"]').click();
  await mia.app.locator('#pFile').setInputFiles({ name: 'sonne.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await mia.app.locator('#pGo:not([disabled])').waitFor();
  const info = await mia.app.locator('#pInfo').textContent();
  ok('3  Bild verkleinert', /→/.test(info), info);
  await mia.app.locator('textarea[name=d]').fill('Sonnenuntergang am See');
  await mia.app.locator('input[name=t]').fill('#natur #sommer');
  await mia.app.locator('#pGo').click();
  await mia.app.locator('.prof-h').waitFor();
  const m = (await db.query(`select octet_length(data) d, octet_length(thumb) t, mime from sh_media`)).rows[0];
  ok('3  Bild beim Server ≤ 250 KB, Vorschau ≤ 40 KB', m && m.d <= 250000 && m.t <= 40000, JSON.stringify(m));
  ok('3  Tags gespeichert', (await db.query(`select count(*)::int n from sh_photo_tag`)).rows[0].n === 2);
  await mia.app.locator('.g-img.img-ok').waitFor();

  // 4) Mia meldet sich ab und legt ein zweites Konto an (normaler User)
  await mia.app.locator('#pOut').click();
  await mia.app.locator('#lo1').click();
  await mia.app.locator('#lForm').waitFor();
  await mia.app.locator('.seg button[data-m="reg"]').click();
  ok('4  normales Registrieren: Benutzername leer', await mia.app.locator('input[name=user]').inputValue() === '');
  await mia.app.locator('input[name=user]').fill('leon_b');
  await mia.app.locator('input[name=name]').fill('Leon');
  await mia.app.locator('select[name=gender]').selectOption('male');
  await mia.app.locator('input[name=pw]').fill('pw1234');
  await mia.app.locator('input[name=pw2]').fill('pw1234');
  await mia.app.locator('#rForm button[type=submit]').click();
  await mia.app.locator('.card').first().waitFor();
  ok('4  normaler User: kein Adminbereich', await mia.app.locator('[data-view="admin"]').count() === 0);
  await mia.app.locator('.card-img.img-ok').first().waitFor();
  await shot(mia.page, '4-feed');
  await mia.app.locator('.card').first().click({ position: { x: 300, y: 250 } });
  await wait(100);
  await mia.app.locator('.card').first().click({ position: { x: 300, y: 250 } });
  await mia.app.locator('.r-btn.liked').first().waitFor();
  ok('4  Doppeltipp = Like', (await db.query(`select count(*)::int n from sh_likes`)).rows[0].n === 1);
  await mia.app.locator('[data-act="comments"]').first().click();
  await mia.app.locator('.c-form input').fill('Wow, wie schön!');
  await mia.app.locator('.c-form button').click();
  await mia.app.locator('.c-it').first().waitFor();
  ok('4  Kommentar gespeichert', (await db.query(`select count(*)::int n from sh_comments`)).rows[0].n === 1);
  await mia.app.locator('[data-close]').first().click();
  await mia.app.locator('[data-act="follow"]').first().click();
  await wait(400);
  ok('4  Folgen über das Plus', (await db.query(`select count(*)::int n from sh_follows`)).rows[0].n === 1);
  // wieder als admin
  await mia.app.locator('[data-tab="profile"]').click();
  await mia.app.locator('#pOut').click();
  await mia.app.locator('#lo1').click();
  await mia.app.locator('#lForm input[name=user]').fill('admin');
  await mia.app.locator('#lForm input[name=pw]').fill('geheim1');
  await mia.app.locator('#lForm button[type=submit]').click();
  await mia.app.locator('[data-view="admin"]').waitFor();

  // 4b) Leon: kommt nicht in Mias Netzwerk – außer über „anderes Tablet“
  const leon = await open('tokLeon');
  await leon.app.locator('#btnFound').waitFor();
  ok('4b anderes Gerät sieht Pixelwelt nicht', await leon.app.locator('.net-tile').count() === 0);
  await leon.app.locator('#btnNetLogin').click();
  await leon.app.locator('#nlForm input[name=net]').fill('pixelwelt');
  await leon.app.locator('#nlForm input[name=user]').fill('leon_b');
  await leon.app.locator('#nlForm input[name=pw]').fill('pw1234');
  await leon.app.locator('#nlForm button').click();
  await leon.app.locator('.hub-name', { hasText: 'Pixelwelt' }).waitFor();
  ok('4b Anmelden auf anderem Tablet über den Netzwerk-Namen', await leon.app.locator('.hub-top .chip', { hasText: '@leon_b' }).count() === 1);
  await leon.app.locator('.card-img.img-ok').first().waitFor();
  await shot(leon.page, '4b-anderes-tablet');

  // 5a) Mia: Einstellungen im Adminbereich
  await mia.app.locator('[data-view="admin"]').click();
  await mia.app.locator('.subtabs [data-at="settings"].on').waitFor();
  await mia.app.locator('[data-sc="light"]').click();
  await mia.app.locator('[data-col="#0d9488"]').click();
  await shot(mia.page, '5a-einstellungen');
  await mia.app.locator('.be-form button[type=submit]').click();
  await wait(500);
  const hb = (await db.query(`select color, scheme from sh_hubs where name = 'Pixelwelt'`)).rows[0];
  ok('5  Farbschema gespeichert (hell, Petrol)', hb.color === '#0d9488' && hb.scheme === 'light', JSON.stringify(hb));
  ok('5  Netzwerk erscheint hell', await mia.page.frames()[1].evaluate(() => document.documentElement.getAttribute('data-scheme')) === 'light');

  // 5) SQL und Diagramm
  await mia.app.locator('.subtabs [data-at="sql"]').click();
  await mia.app.locator('.db-tbl', { hasText: 'users' }).waitFor();
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.grid').first().waitFor();
  const cells = await mia.app.locator('.grid td').allTextContents();
  ok('5  SELECT * FROM users zeigt Hashes und gender', cells.some(c => /^\$2a\$08\$/.test(c)) && cells.includes('female'), cells.slice(0, 8).join(' | '));
  await shot(mia.page, '5b-sql');
  await mia.app.locator('.ed-ta').fill("INSERT INTO users (username, name, gender, password) VALUES ('sql_kind', 'SQL', 'diverse', PASSWORD_HASH('neu123'));");
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.res--live, .res--bad').first().waitFor();
  const out = await mia.app.locator('#dbOut').textContent();
  ok('5  INSERT im Netzwerk übernommen', /übernommen/.test(out), out.slice(0, 200));
  const HUBID = (await db.query(`select id from sh_hubs where name = 'Pixelwelt'`)).rows[0].id;
  const lr = await rpcAs('tokMia', 'sh_login', { p_hub: HUBID, p_username: 'sql_kind', p_password: 'neu123' });
  ok('5  per INSERT angelegtes Konto kann sich anmelden (bcrypt im Browser)', lr.ok, JSON.stringify(lr));
  await mia.app.locator('.ed-ta').fill("INSERT INTO users (username, gender, password) VALUES ('x_y', 'robot', '');");
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.res--bad').first().waitFor();
  ok('5  gender außerhalb des ENUM → abgelehnt', /CHECK|erlaubt/i.test(await mia.app.locator('#dbOut').textContent()));
  await mia.app.locator('.ed-ta').fill('DROP TABLE users;');
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.res--bad').first().waitFor();
  ok('5  DROP TABLE gesperrt', (await db.query(`select count(*)::int n from sh_users u join sh_hubs h on h.id = u.hub_id where h.name = 'Pixelwelt'`)).rows[0].n === 3);
  await mia.app.locator('.subtabs [data-at="diagram"]').click();
  await mia.app.locator('.dg-svg .dg-t').first().waitFor();
  ok('5  Klassendiagramm mit allen Tabellen', await mia.app.locator('.dg-svg .dg-t').count() === 8);
  ok('5  kein Daten-Reiter mehr', await mia.app.locator('[data-t="data"]').count() === 0);
  await shot(mia.page, '5c-diagramm');

  // 6) Lehrkraft-Übersicht
  await t.page.reload();
  await t.app.locator('.net-row', { hasText: 'Pixelwelt' }).waitFor();
  const row = await t.app.locator('.net-row', { hasText: 'Pixelwelt' }).textContent();
  ok('6  Liste: Name und wer es erstellt hat', /Pixelwelt/.test(row) && /Mia/.test(row), row);
  await shot(t.page, '6a-uebersicht');
  await t.app.locator('.net-row', { hasText: 'Pixelwelt' }).locator('[data-reset]').click();
  await t.app.locator('[data-dlg="yes"]').click();
  await t.app.locator('.cred').waitFor();
  const cred = await t.app.locator('.cred code').allTextContents();
  await shot(t.page, '6b-passwort');
  await t.app.locator('[data-dlg="ok"]').click();
  ok('6  Admin-Passwort zurückgesetzt: admin + neues Passwort', cred[0] === 'admin' && /^[a-z]{6}\d\d$/.test(cred[1]), cred.join(' '));
  const lr2 = await rpcAs('tokMia', 'sh_login', { p_hub: HUBID, p_username: 'admin', p_password: cred[1] });
  ok('6  … damit kommt Mia wieder hinein', lr2.ok);
  await t.app.locator('.net-row', { hasText: 'Pixelwelt' }).locator('.nr-main').click();
  await t.app.locator('#lkLogin').click();
  await t.app.locator('.seg button[data-m="reg"]').click();
  await t.app.locator('input[name=user]').fill('frau_test_b');
  await t.app.locator('input[name=pw]').fill('test99');
  await t.app.locator('input[name=pw2]').fill('test99');
  await t.app.locator('#rForm button[type=submit]').click();
  await t.app.locator('.hub-top .chip', { hasText: '@frau_test_b' }).waitFor();
  await t.app.locator('[data-act="like"]').first().click();
  await wait(500);
  ok('6  Lehrkraft liked mit Testkonto im Schüler-Netzwerk', (await db.query(`select count(*)::int n from sh_likes`)).rows[0].n === 2);
  await t.app.locator('[data-view="admin"]').click();
  await shot(t.page, '6c-lehrkraft-admin');
} catch (e) {
  fails++;
  console.error('ABBRUCH:', e.message);
} finally {
  ok('0  keine Fehler in der Konsole', errors.length === 0, errors.slice(0, 5).join(' || '));
  await browser.close();
  server.close();
}
console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
