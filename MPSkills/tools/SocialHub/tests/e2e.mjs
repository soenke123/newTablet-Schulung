/* Social Hub — Prüfstand im echten Browser (Playwright + pglite).
   Die App läuft in tests/harness.html (spielt den Raum nach), jeder
   Serveraufruf geht gegen pglite mit der ganzen Migrationskette.

   Ablauf: Lehrkraft erstellt Tabellen → Mia gründet einen Hub und
   postet ein Foto → Leon registriert sich bei Mia, liked, kommentiert
   → Mia legt im Datenbank-Reiter per INSERT ein Konto an → damit kann
   man sich anmelden. Bildschirmfotos landen in SH_SHOTS (Standard:
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
  // 1) Lehrkraft erstellt Tabellen
  const t = await open('teacher', { width: 1100, height: 800 });
  await t.app.locator('text=Tabellen für alle Hubs').waitFor();
  ok('1  ohne photos: likes erst nach photos', await t.app.locator('[data-tadd="likes"][disabled]').count() === 1);
  for (const id of ['photos', 'follows', 'likes', 'comments', 'comment_likes', 'tags']) {
    await t.app.locator(`[data-tadd="${id}"]`).click();
    await t.app.locator(`[data-tdrop="${id}"]`).waitFor();
  }
  ok('1  Lehrkraft erstellt sechs Tabellen', (await stateOf()).tables?.length === 6, JSON.stringify(await stateOf()));
  await shot(t.page, '1-lehrkraft');

  // 2) Mia gründet einen Hub
  const mia = await open('tokMia');
  await mia.app.locator('#btnFound').click();
  await mia.app.locator('input[name=name]').fill('Pixelwelt');
  await mia.app.locator('[data-logo-id="like"]').click();
  await mia.app.locator('input[name=user]').fill('mia');
  await mia.app.locator('input[name=display]').fill('Mia');
  await mia.app.locator('input[name=pw]').fill('geheim1');
  await shot(mia.page, '2-gruenden');
  await mia.app.locator('button[type=submit]').click();
  await mia.app.locator('.hub-name', { hasText: 'Pixelwelt' }).waitFor();
  ok('2  Hub gegründet, Admin-Reiter da', await mia.app.locator('[data-tab="admin"]').count() === 1);

  // 3) Foto posten (wird verkleinert)
  const png = await makePng(mia.page);
  await mia.app.locator('[data-tab="post"]').click();
  await mia.app.locator('#pFile').setInputFiles({ name: 'sonne.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await mia.app.locator('#pGo:not([disabled])').waitFor();
  const info = await mia.app.locator('#pInfo').textContent();
  ok('3  Bild verkleinert', /→/.test(info), info);
  await mia.app.locator('textarea[name=d]').fill('Sonnenuntergang am See');
  await mia.app.locator('input[name=t]').fill('#natur #sommer');
  await shot(mia.page, '3-posten');
  await mia.app.locator('#pGo').click();
  await mia.app.locator('.prof-h').waitFor();
  const m = (await db.query(`select octet_length(data) d, octet_length(thumb) t, mime from sh_media`)).rows[0];
  ok('3  Bild beim Server ≤ 250 KB, Vorschau ≤ 40 KB', m && m.d <= 250000 && m.t <= 40000, JSON.stringify(m));
  ok('3  Tags gespeichert', (await db.query(`select count(*)::int n from sh_photo_tag`)).rows[0].n === 2);
  await mia.app.locator('.g-img.img-ok').waitFor();
  await shot(mia.page, '4-profil');

  // 4) Leon registriert sich bei Mia
  const leon = await open('tokLeon');
  await leon.app.locator('.hub-tile', { hasText: 'Pixelwelt' }).click();
  await leon.app.locator('.seg button[data-m="reg"]').click();
  await leon.app.locator('input[name=user]').fill('leon_b');
  await leon.app.locator('input[name=name]').fill('Leon');
  await leon.app.locator('input[name=city]').fill('Kiel');
  await leon.app.locator('input[name=pw]').fill('pw1234');
  await shot(leon.page, '5-registrieren');
  await leon.app.locator('#rForm button[type=submit]').click();
  await leon.app.locator('.card').first().waitFor();
  await leon.app.locator('.card-img.img-ok').first().waitFor();
  await shot(leon.page, '6-feed');
  // Doppeltipp = Like
  await leon.app.locator('.card').first().click({ position: { x: 150, y: 250 } });
  await wait(100);
  await leon.app.locator('.card').first().click({ position: { x: 150, y: 250 } });
  await leon.app.locator('.r-btn.liked').first().waitFor();
  ok('4  Doppeltipp = Like', (await db.query(`select count(*)::int n from sh_likes`)).rows[0].n === 1);
  await leon.app.locator('[data-act="comments"]').first().click();
  await leon.app.locator('.c-form input').fill('Wow, wie schön!');
  await leon.app.locator('.c-form button').click();
  await leon.app.locator('.c-it').first().waitFor();
  await shot(leon.page, '7-kommentare');
  ok('4  Kommentar gespeichert', (await db.query(`select count(*)::int n from sh_comments`)).rows[0].n === 1);
  await leon.app.locator('[data-close]').first().click();
  await leon.app.locator('[data-act="follow"]').first().click();
  await wait(400);
  ok('4  Folgen über das Plus', (await db.query(`select count(*)::int n from sh_follows`)).rows[0].n === 1);

  // 5a) Mia: Farbschema im Admin-Bereich
  await mia.app.locator('[data-tab="admin"]').click();
  await mia.app.locator('[data-sc="light"]').click();
  await mia.app.locator('[data-col="#0d9488"]').click();
  await shot(mia.page, '8a-farbschema');
  await mia.app.locator('#bForm button.btn--accent').click();
  await mia.app.locator('.hub-nav').waitFor();
  await wait(300);
  const hb = (await db.query(`select color, scheme from sh_hubs`)).rows[0];
  ok('5  Farbschema gespeichert (hell, Petrol)', hb.color === '#0d9488' && hb.scheme === 'light', JSON.stringify(hb));
  ok('5  Hub erscheint hell', await mia.page.frames()[1].evaluate(() => document.documentElement.getAttribute('data-scheme')) === 'light');

  // 5) Mia: Datenbank-Reiter
  await mia.app.locator('[data-tab="admin"]').click();
  await mia.app.locator('[data-at="db"]').click();
  await mia.app.locator('.db-tbl', { hasText: 'users' }).waitFor();
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.grid').first().waitFor();
  const cells = await mia.app.locator('.grid td').allTextContents();
  ok('5  SELECT * FROM users zeigt Hashes', cells.some(c => /^\$2a\$08\$/.test(c)), cells.slice(0, 6).join(' | '));
  await shot(mia.page, '8-datenbank');
  await mia.app.locator('.ed-ta').fill("INSERT INTO users (username, name, password) VALUES ('sql_kind', 'SQL', PASSWORD_HASH('neu123'));");
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.res--live, .res--bad').first().waitFor();
  const out = await mia.app.locator('#dbOut').textContent();
  ok('5  INSERT im Hub übernommen', /übernommen/.test(out), out.slice(0, 200));
  const lr = await rpcAs('tokLeon', 'sh_login', { p_hub: (await db.query(`select id from sh_hubs`)).rows[0].id, p_username: 'sql_kind', p_password: 'neu123' });
  ok('5  per INSERT angelegtes Konto kann sich anmelden (bcrypt im Browser)', lr.ok, JSON.stringify(lr));
  await mia.app.locator('.ed-ta').fill("INSERT INTO photos (user_id, image) VALUES (99, 'img_1.webp');");
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.res--bad').first().waitFor();
  ok('5  Fremdschlüssel ins Leere → schon im Browser abgelehnt', /FOREIGN KEY|Fremdschlüssel/i.test(await mia.app.locator('#dbOut').textContent()));
  await mia.app.locator('.ed-ta').fill('DROP TABLE users;');
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.res--bad').first().waitFor();
  ok('5  DROP TABLE gesperrt', (await db.query(`select count(*)::int n from sh_users`)).rows[0].n === 3);
  await mia.app.locator('.db-tabs [data-t="diagram"]').click();
  await mia.app.locator('.dg-svg .dg-t').first().waitFor();
  ok('5  Klassendiagramm mit allen Tabellen', await mia.app.locator('.dg-svg .dg-t').count() === 8);
  await shot(mia.page, '9-diagramm');

  // 6) Lehrkraft-Übersicht
  await t.page.reload();
  await t.app.locator('.hub-card').first().waitFor();
  const card = await t.app.locator('.hub-card').first().textContent();
  ok('6  Übersicht zeigt Hub mit Person und Zahlen', /Pixelwelt/.test(card) && /Mia/.test(card) && /3 Nutzer/.test(card), card);
  await shot(t.page, '10-uebersicht');
  await t.app.locator('.hub-card .hub-tile').first().click();
  await t.app.locator('[data-tab="admin"]').click();
  await t.app.locator('[data-at="users"]').click();
  await t.app.locator('.u-row').first().waitFor();
  ok('6  Lehrkraft sieht, wer hinter den Konten steckt', /Leon/.test(await t.app.locator('.u-list').textContent()));
  await shot(t.page, '11-nutzer');
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
