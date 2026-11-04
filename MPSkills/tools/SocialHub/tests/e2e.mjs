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
  if (u === '/api/my_ip') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ip":"10.1.2.3"}'); return; }
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
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [];
async function open(who, size) {
  const ctx = await browser.newContext({ viewport: size || { width: 400, height: 760 }, deviceScaleFactor: 1, permissions: ['camera'] });
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
// JPEG mit EXIF (Kamera, Zeit, GPS) wie vom Handy – 0268; den Ort liest die App seit 0269 nicht
async function makeJpegExif(page) {
  const jpg = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
    const x = c.getContext('2d'); x.fillStyle = '#2a9d8f'; x.fillRect(0, 0, 1600, 1200);
    x.fillStyle = '#fff'; x.font = 'bold 160px sans-serif'; x.fillText('Hafen', 560, 640);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  }));
  // TIFF big-endian: IFD0 (Make, Model, ExifIFD, GPS) · Exif (DateTimeOriginal) · GPS
  const asc = s => Buffer.from(s + '\0', 'latin1');
  const rat = v => { const b = Buffer.alloc(v.length * 8); v.forEach((n, i) => { b.writeUInt32BE(Math.round(n * 10000), i * 8); b.writeUInt32BE(10000, i * 8 + 4); }); return b; };
  const dms = d => { const a = Math.floor(d), m = Math.floor((d - a) * 60); return [a, m, ((d - a) * 60 - m) * 60]; };
  const ifds = [
    [[0x010F, 2, asc('Apple')], [0x0110, 2, asc('iPhone 13')], [0x8769, 4, 1], [0x8825, 4, 2]],
    [[0x9003, 2, asc('2026:10:12 14:32:05')]],
    [[1, 2, asc('N')], [2, 5, rat(dms(53.5510849))], [3, 2, asc('E')], [4, 5, rat(dms(9.9936818))]]
  ];
  const size = l => 2 + l.length * 12 + 4;
  const off = [8]; ifds.forEach((l, i) => { if (i) off.push(off[i - 1] + size(ifds[i - 1])); });
  let dataAt = off.at(-1) + size(ifds.at(-1));
  const parts = [Buffer.from([0x4D, 0x4D, 0, 42, 0, 0, 0, 8])], extra = [];
  ifds.forEach(l => {
    const b = Buffer.alloc(size(l)); b.writeUInt16BE(l.length, 0);
    l.forEach(([tag, type, v], i) => {
      const e = 2 + i * 12; b.writeUInt16BE(tag, e); b.writeUInt16BE(type, e + 2);
      if (type === 4) { b.writeUInt32BE(1, e + 4); b.writeUInt32BE(off[v], e + 8); return; }
      b.writeUInt32BE(type === 5 ? v.length / 8 : v.length, e + 4);
      if (v.length <= 4) v.copy(b, e + 8); else { b.writeUInt32BE(dataAt, e + 8); extra.push(v); dataAt += v.length; }
    });
    parts.push(b);
  });
  const tiff = Buffer.concat(parts.concat(extra));
  const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1, 0, 0]), Buffer.from('Exif\0\0', 'latin1'), tiff]);
  app1.writeUInt16BE(app1.length - 2, 2);
  return Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]);
}

try {
  // 1) Lehrkraft erstellt Tabellen im Diagramm
  const t = await open('teacher', { width: 1280, height: 860 });
  await t.app.locator('text=Tabellen für alle Netzwerke').waitFor();
  ok('1  users grün und fest, likes erst nach photos', await t.app.locator('.tb--fixed[data-tb="users"]').count() === 1
     && await t.app.locator('[data-tadd="likes"][disabled]').count() === 1);
  for (const id of ['photos', 'follows', 'likes', 'comments', 'tags']) {
    await t.app.locator(`[data-tadd="${id}"]`).click();
    await t.app.locator(`[data-tdrop="${id}"]`).waitFor();
  }
  ok('1  Lehrkraft erstellt fünf Tabellen, comment_likes gibt es nicht', (await stateOf()).tables?.length === 5 && await t.app.locator('[data-tb="comment_likes"]').count() === 0, JSON.stringify(await stateOf()));
  // Metadaten der Fotos speichern (0268): mit Rückfrage
  await t.app.locator('#metaTgl').evaluate(el => el.click());
  await t.app.locator('[data-dlg="yes"]').click();
  await t.app.locator('#metaTgl:checked').waitFor({ state: 'attached' });
  for (let i = 0; i < 50 && (await stateOf()).meta !== true; i++) await new Promise(r => setTimeout(r, 100));
  ok('1  Lehrkraft schaltet „Metadaten der Fotos speichern“ ein', (await stateOf()).meta === true, JSON.stringify(await stateOf()));
  await t.app.locator('[data-tb="users"]').click();
  ok('1  Antippen zeigt die Attribute (mit gender)', /gender/.test(await t.app.locator('#tdgInfo').textContent()));
  ok('1  Linien im Diagramm: 9, rechtwinklig, mit n und 1', await t.app.locator('.tdg-lines path.on').count() === 9 && await t.app.locator('.tdg-lines text.on').count() === 18, String(await t.app.locator('.tdg-lines path').count()));
  // keine Linie läuft durch einen fremden Kasten (users–photos war verdeckt)
  const hidden = await t.app.locator('#tdg').evaluate((box) => {
    const R = box.getBoundingClientRect(), bad = [];
    const rects = [...box.querySelectorAll('.tb')].map(el => { const r = el.getBoundingClientRect(); return { t: el.dataset.tb, x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; });
    const svg = box.querySelector('.tdg-lines'), S = svg.getBoundingClientRect();
    for (const l of box.querySelectorAll('.tdg-lines path')) {
      const L = l.getTotalLength();
      // nur gerade/rechtwinklige Stücke: jeder Abschnitt waagerecht oder senkrecht
      for (let i = 1; i < 40; i++) {
        const pt = l.getPointAtLength(L * i / 40), x = pt.x + S.left - R.left, y = pt.y + S.top - R.top;
        const hit = rects.find(r => x > r.x + 2 && x < r.x + r.w - 2 && y > r.y + 2 && y < r.y + r.h - 2);
        if (hit) { bad.push(hit.t); break; }
      }
    }
    return bad;
  });
  ok('1  jede Linie sichtbar (keine läuft unter einem Kasten)', hidden.length === 0, hidden.join());
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
  ok('2  Schritt 1: erst Logo, dann Name; Namensfeld breit (CSS greift)', await mia.app.locator('.be-form').evaluate(f => {
    const lp = f.querySelector('.logo-pick'), nm = f.querySelector('input[name=name]');
    return lp.getBoundingClientRect().top < nm.getBoundingClientRect().top && nm.getBoundingClientRect().height >= 40;
  }));
  ok('2  Name aus Startup Story vorgeschlagen', await mia.app.locator('input[name=name]').inputValue() === 'ToTheMoon');
  await mia.app.locator('[data-logo-id="bell"]').click();
  ok('2  … wechselt mit dem Logo', await mia.app.locator('input[name=name]').inputValue() === 'RingRing');
  ok('2  Farbschema steht auf Auto', await mia.app.locator('[data-sc="auto"].on').count() === 1);
  await mia.app.locator('input[name=name]').fill('Pixelwelt');
  await mia.app.locator('[data-logo-id="like"]').click();
  await shot(mia.page, '2b-gruenden');
  await mia.app.locator('button[type=submit]').click();
  await mia.app.locator('#rForm').waitFor();
  ok('2  Schritt 2: admin vorbelegt', await mia.app.locator('input[name=user]').inputValue() === 'admin');
  await mia.app.locator('input[name=name]').fill('Mia');
  await mia.app.locator('select[name=gender]').selectOption('female');
  await mia.app.locator('input[name=cm]').fill('158');
  await mia.app.locator('input[name=country]').fill('Deutschland');
  ok('2  Registrieren: Eingabefelder in voller Höhe', (await mia.app.locator('input[name=pw]').boundingBox()).height >= 40);
  await mia.app.locator('input[name=pw]').fill('geheim1');
  await mia.app.locator('input[name=pw2]').fill('geheim2');
  // Rückmeldung 2: ein Zustandswechsel im Raum darf das Formular nicht wegwerfen
  await t.app.locator('label.switch:has(#upTgl)').click();
  await wait(2600);
  ok('2  Formular bleibt bei Zustandswechsel stehen', await mia.app.locator('input[name=pw]').inputValue() === 'geheim1');
  await t.app.locator('label.switch:has(#upTgl)').click();
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
  const mc = (await db.query(`select country, centimeter from sh_users u join sh_hubs h on h.id = u.hub_id where h.name = 'Pixelwelt'`)).rows[0];
  ok('2  country und centimeter gespeichert', mc.country === 'Deutschland' && mc.centimeter === 158, JSON.stringify(mc));

  // 3) Foto posten (wird verkleinert)
  await mia.app.locator('[data-tab="post"]').click();
  // Kamera: Bild im Browser aufnehmen (Chromium mit Test-Kamera)
  await mia.app.locator('#pCam').click();
  await mia.app.locator('.ph--cam video').waitFor();
  await mia.app.locator('.ph--cam video').evaluate(v => new Promise(r => { const t = () => v.videoWidth ? r() : setTimeout(t, 50); t(); }));
  ok('3  Kamera: Auswahl der Kamera da', await mia.app.locator('#phCams option').count() >= 1);
  await shot(mia.page, '3a-kamera');
  await mia.app.locator('[data-ph="shot"]').click();
  await mia.app.locator('.ph--crop').waitFor();
  await mia.app.locator('.ph--crop [data-ph="ok"]').click();
  await mia.app.locator('#pGo:not([disabled])').waitFor();
  ok('3  Kamera-Foto übernommen (4:5 zugeschnitten)', /\((\d+)×(\d+)\)/.test(await mia.app.locator('#pInfo').textContent()));
  const camMeta = await mia.app.locator('#pMeta').textContent();
  ok('3  Kamera-Foto: „Wird mitgespeichert“ mit Zeit und Kamera, ohne Ort', /Wird mitgespeichert/.test(camMeta) && /\d{2}\.\d{2}\.\d{4}/.test(camMeta) && !/Ort/.test(camMeta), camMeta);
  await mia.app.locator('#pNew').click();
  // Datei wählen → Zuschneiden öffnet gleich; Abbrechen = ganzes Bild
  await mia.app.locator('#pFile').setInputFiles({ name: 'hafen.jpg', mimeType: 'image/jpeg', buffer: await makeJpegExif(mia.page) });
  await mia.app.locator('.ph--crop').waitFor();
  await mia.app.locator('.ph--crop [data-ph="no"]').click();
  await mia.app.locator('#pGo:not([disabled])').waitFor();
  const info = await mia.app.locator('#pInfo').textContent();
  ok('3  Bild verkleinert (ohne Zuschneiden: ganzes Bild 4:3)', /→/.test(info) && /\(1080×810\)/.test(info), info);
  // Zuschneiden: 1:1, Ecke nach innen ziehen
  await mia.app.locator('#pCrop').click();
  await mia.app.locator('.ph--crop [data-r="1"]').click();
  const hd = await mia.app.locator('.ph--crop [data-hd="se"]').boundingBox();
  await mia.page.mouse.move(hd.x + 10, hd.y + 10);
  await mia.page.mouse.down();
  await mia.page.mouse.move(hd.x - 60, hd.y - 90, { steps: 5 });
  await mia.page.mouse.up();
  await shot(mia.page, '3b-zuschneiden');
  await mia.app.locator('.ph--crop [data-ph="ok"]').click();
  await mia.app.locator('#pInfo', { hasText: 'Fertig' }).waitFor();
  const fileMeta = await mia.app.locator('#pMeta').textContent();
  ok('3  JPEG vom Handy: Zeit und Kamera aus EXIF, GPS nicht', /12\.10\.2026, 14:32/.test(fileMeta) && /Apple iPhone 13/.test(fileMeta) && !/53\.55|Ort/.test(fileMeta), fileMeta);
  await shot(mia.page, '3c-metadaten');
  const dim = /\((\d+)×(\d+)\)/.exec(await mia.app.locator('#pInfo').textContent());
  ok('3  zugeschnitten: quadratisch und kleiner', dim && dim[1] === dim[2] && +dim[1] < 1080, dim && dim[0]);
  await mia.app.locator('textarea[name=d]').fill('Sonnenuntergang am See');
  await mia.app.locator('input[name=t]').fill('#natur #sommer');
  await mia.app.locator('#pGo').click();
  await mia.app.locator('.prof-h').waitFor();
  const m = (await db.query(`select octet_length(data) d, octet_length(thumb) t, mime from sh_media`)).rows[0];
  ok('3  Bild beim Server ≤ 250 KB, Vorschau ≤ 40 KB', m && m.d <= 250000 && m.t <= 40000, JSON.stringify(m));
  const pm = (await db.query(`select to_char(taken_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI:SS') t, camera from sh_photos order by id desc limit 1`)).rows[0];
  ok('3  Aufnahmezeit und Kamera in photos gespeichert', pm.t === '2026-10-12 14:32:05' && pm.camera === 'Apple iPhone 13', JSON.stringify(pm));
  ok('3  photos hat keine Spalten für den Ort (0269)', (await db.query(`select count(*)::int n from information_schema.columns where table_name = 'sh_photos' and column_name in ('latitude','longitude')`)).rows[0].n === 0);
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
  ok('4  Metadaten stehen nicht am Post (nur in der DB)', await mia.app.locator('.card .m-exif').count() === 0);
  await shot(mia.page, '4-feed');
  await mia.app.locator('.card').first().click({ position: { x: 300, y: 250 } });
  await wait(100);
  await mia.app.locator('.card').first().click({ position: { x: 300, y: 250 } });
  await mia.app.locator('.r-btn.liked').first().waitFor();
  ok('4  Doppeltipp = Herz', (await db.query(`select kind from sh_likes`)).rows[0]?.kind === 'heart');
  // Like-Knopf → Auswahl Herz · Daumen · Smiley, Daumen ersetzt das Herz
  await mia.app.locator('.card').first().locator('[data-act="like"]').click();
  await mia.app.locator('.react-pick [data-react="laugh"]').waitFor();
  await shot(mia.page, '4c-like-arten');
  await mia.app.locator('.react-pick [data-react="thumb"]').click();
  await mia.app.locator('.r-btn.liked[data-kind="thumb"]').first().waitFor();
  await wait(300);
  const lk = (await db.query(`select kind from sh_likes`)).rows;
  ok('4  Daumen hoch ersetzt das Herz (ein Like je Person)', lk.length === 1 && lk[0].kind === 'thumb', JSON.stringify(lk));
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
  ok('5  Auto: Netzwerk übernimmt Hell/Dunkel von MPSkills (kein eigenes data-scheme)', await mia.page.frames()[1].evaluate(() => document.documentElement.getAttribute('data-scheme')) === null);
  await mia.app.locator('[data-view="admin"]').click();
  await mia.app.locator('.subtabs [data-at="sql"].on').waitFor();
  ok('5  Adminbereich: SQL zuerst, Einstellungen rechts', (await mia.app.locator('.subtabs [data-at]').evaluateAll(b => b.map(x => x.dataset.at))).join() === 'sql,diagram,settings');
  await mia.app.locator('.db-tbl').first().waitFor();
  ok('5  SQL: keine Beispiele, kein Warnsatz', await mia.app.locator('.db-exi, .db-side, #dbEx').count() === 0 && !/echte Netzwerk/.test(await mia.app.locator('.db-tools').textContent()));
  await mia.app.locator('.subtabs [data-at="settings"]').click();
  await mia.app.locator('[data-sc="light"]').waitFor();
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
  await mia.app.locator('.ed-ta').fill("SELECT username, country, centimeter FROM users WHERE role = 'admin';");
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.grid').first().waitFor();
  ok('5  SELECT mit country/centimeter', /Deutschland/.test(await mia.app.locator('#dbOut').textContent()) && /158/.test(await mia.app.locator('#dbOut').textContent()));
  // Text eines Users mit \ am Ende darf in der Kopie nicht aus dem String ausbrechen
  await db.query(`update sh_users set bio = $1 where username = 'admin' and hub_id = (select id from sh_hubs where name = 'Pixelwelt')`, ["x\\', 1, 2); DELETE FROM users; --"]);
  await mia.app.locator('#dbReload').click();
  await mia.app.locator('.db-state', { hasText: 'Neu geladen' }).waitFor();
  await mia.app.locator('.ed-ta').fill('SELECT COUNT(*) AS n, MAX(bio) AS bio FROM users;');
  await mia.app.locator('#dbRun').click();
  await mia.app.locator('.grid').first().waitFor();
  const bc = await mia.app.locator('.grid td').allTextContents();
  ok('5  Backslash im Text: keine Injektion in die Kopie', bc[0] === '2' && bc[1] === "x\\', 1, 2); DELETE FROM users; --", bc.join(' | '));
  await db.query(`update sh_users set bio = null where username = 'admin'`);
  await mia.app.locator('#dbState').evaluate(e => { e.textContent = ''; });
  await mia.app.locator('#dbReload').click();
  await mia.app.locator('.db-state', { hasText: 'Neu geladen' }).waitFor();
  await mia.app.locator('.ed-ta').fill('SELECT * FROM users;');
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
  ok('5  Klassendiagramm mit allen 7 Tabellen', await mia.app.locator('.dg-svg .dg-t').count() === 7);
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
  await t.app.locator('.react-pick [data-react="laugh"]').click();
  await wait(500);
  ok('6  Lehrkraft liked mit Testkonto im Schüler-Netzwerk', (await db.query(`select count(*)::int n from sh_likes`)).rows[0].n === 2);
  await t.app.locator('[data-view="admin"]').click();
  await shot(t.page, '6c-lehrkraft-admin');

  /* 7  Analytics / Tracking (0270): Lehrkraft erstellt sessions + views im
     Diagramm → Mias Gerät läuft von selbst mit, das nachgebaute „Zulassen?“
     speichert nur den Klick, danach die Aufdeckung auf Mias Tablet. */
  // Mia nach dem Passwort-Reset (Abschnitt 6) im Browser neu anmelden
  await mia.page.reload();
  await mia.app.locator('.login input[name=user]').fill('admin');
  await mia.app.locator('.login input[name=pw]').fill(cred[1]);
  await mia.app.locator('#lForm button[type=submit]').click();
  await mia.app.locator('.hub-top').waitFor();
  // Lehrkraft: views geht erst mit sessions, dann beide erstellen
  await t.app.locator('#toHome').click();
  await t.app.locator('[data-tb="sessions"]').waitFor();
  ok('7  views gesperrt, solange sessions fehlt', await t.app.locator('[data-tadd="views"][disabled]').count() === 1);
  for (const id of ['sessions', 'views']) {
    await t.app.locator(`[data-tadd="${id}"]`).click();
    await t.app.locator(`[data-tdrop="${id}"]`).waitFor();
  }
  ok('7  sessions + views erstellt, kein Analytics-Schalter', (await stateOf()).tables.includes('views') && !('analytics' in (await stateOf())) && await t.app.locator('#anTgl').count() === 0, JSON.stringify(await stateOf()));
  ok('7  Diagramm: 13 Linien mit n und 1', await t.app.locator('.tdg-lines path.on').count() === 13 && await t.app.locator('.tdg-lines text.on').count() === 26, String(await t.app.locator('.tdg-lines path.on').count()));
  const hidden2 = await t.app.locator('#tdg').evaluate((box) => {
    const R = box.getBoundingClientRect(), bad = [];
    const rects = [...box.querySelectorAll('.tb')].map(el => { const r = el.getBoundingClientRect(); return { t: el.dataset.tb, x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; });
    const svg = box.querySelector('.tdg-lines'), S = svg.getBoundingClientRect();
    for (const l of box.querySelectorAll('.tdg-lines path')) {
      const L = l.getTotalLength();
      for (let i = 1; i < 40; i++) {
        const pt = l.getPointAtLength(L * i / 40), x = pt.x + S.left - R.left, y = pt.y + S.top - R.top;
        const hit = rects.find(r => x > r.x + 2 && x < r.x + r.w - 2 && y > r.y + 2 && y < r.y + r.h - 2);
        if (hit) { bad.push(hit.t); break; }
      }
    }
    return bad;
  });
  ok('7  auch mit sessions/views läuft keine Linie unter einem Kasten', hidden2.length === 0, hidden2.join());
  await shot(t.page, '7a-diagramm-analytics');
  // Mias Gerät meldet von selbst eine Session (sh_track)
  const miaUid = (await db.query(`select id from sh_users where hub_id = $1 and username = 'admin'`, [HUBID])).rows[0].id;
  for (let i = 0; i < 25 && (await db.query(`select count(*)::int n from sh_vsessions where user_id = $1`, [miaUid])).rows[0].n === 0; i++) await wait(400);
  let vs = (await db.query(`select ip, browser, os, device_type from sh_vsessions where user_id = $1 order by id desc limit 1`, [miaUid])).rows[0];
  ok('7  Mias Gerät legt von selbst eine Session an (Browser/OS/Gerät)', !!vs && !!vs.browser && !!vs.os && !!vs.device_type, JSON.stringify(vs));
  ok('7  IP über /api/my_ip gespeichert', vs && vs.ip === '10.1.2.3', JSON.stringify(vs));
  // Nachgebautes Fenster „… möchte Deinen Standort verwenden“ → Zulassen
  await mia.app.locator('.perm-pop', { hasText: 'Standort' }).waitFor({ timeout: 8000 });
  await shot(mia.page, '7b-standort-frage');
  await mia.app.locator('.perm-pop [data-pp="1"]').click();
  for (let i = 0; i < 25 && (await db.query(`select allow_location from sh_vsessions where user_id = $1 order by id desc limit 1`, [miaUid])).rows[0].allow_location !== true; i++) await wait(200);
  vs = (await db.query(`select allow_location al, allow_camera ac from sh_vsessions where user_id = $1 order by id desc limit 1`, [miaUid])).rows[0];
  ok('7  Klick „Zulassen“ als Haken gespeichert (Standort ja, Kamera noch nicht gefragt)', vs.al === true && vs.ac === null, JSON.stringify(vs));
  // ＋ öffnen → Frage nach der Kamera → Blockieren
  await mia.app.locator('[data-view="app"]').click();
  await mia.app.locator('.hub-nav [data-tab="post"]').click();
  await mia.app.locator('.perm-pop', { hasText: 'Kamera' }).waitFor({ timeout: 8000 });
  await mia.app.locator('.perm-pop [data-pp="0"]').click();
  for (let i = 0; i < 25 && (await db.query(`select allow_camera from sh_vsessions where user_id = $1 order by id desc limit 1`, [miaUid])).rows[0].allow_camera !== false; i++) await wait(200);
  ok('7  Kamera „Blockieren“ gespeichert', (await db.query(`select allow_camera from sh_vsessions where user_id = $1 order by id desc limit 1`, [miaUid])).rows[0].allow_camera === false);
  // Aufdeckung: Lehrkraft löst aus → erscheint auf Mias Tablet
  await t.app.locator('#revBtn').click();
  await mia.app.locator('.ov--reveal').waitFor({ timeout: 8000 });
  await mia.app.locator('.ov--reveal .rv-s--got').waitFor({ timeout: 8000 });
  ok('7  Aufdeckung auf Mias Tablet: „Das wurde gespeichert“', await mia.app.locator('.ov--reveal').locator('text=Das wurde gespeichert').count() > 0);
  ok('7  Aufdeckung zeigt alle vier Teile + die Haken', (await mia.app.locator('.ov--reveal .rv-s').count()) === 4 && /Standort erlaubt/.test(await mia.app.locator('.rv-perms').textContent()), await mia.app.locator('.rv-perms').textContent());
  await shot(mia.page, '7-aufdeckung');
  // Schließen bleibt zu (kein Wiederaufpoppen beim Reiterwechsel)
  await mia.app.locator('.ov--reveal [data-close]').click();
  await mia.app.locator('.hub-nav [data-tab="feed"]').click();
  await wait(600);
  ok('7  geschlossene Aufdeckung poppt beim Reiterwechsel nicht wieder auf', await mia.app.locator('.ov--reveal').count() === 0);
  // Lehrkraft beendet → im Profil bleibt „Was weiß das Netzwerk über mich?“
  await t.app.locator('#revBtn').click();
  for (let i = 0; i < 30 && (await stateOf()).reveal !== false; i++) await wait(100);
  ok('7  beendet, Merker „revealed“ bleibt', (await stateOf()).reveal === false && (await stateOf()).revealed === true, JSON.stringify(await stateOf()));
  await wait(1800);
  await mia.app.locator('.hub-nav [data-tab="profile"]').click();
  await mia.app.locator('#pData').waitFor({ timeout: 8000 });
  await mia.app.locator('#pData').click();
  await mia.app.locator('.ov--reveal .rv-s--got').waitFor({ timeout: 8000 });
  ok('7  Schüler öffnet die Auflösung danach selbst über das Profil', (await mia.app.locator('.ov--reveal .rv-s').count()) === 4);
  await wait(500);
  await shot(mia.page, '7c-profil-auskunft');
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
