/* YourSozialNet — Bildschirmfotos für die Tour der Lehrkraft (js/tour.js).

   Spielt einen Raum mit echten Migrationen nach (pglite, wie e2e.mjs):
   Lehrkraft mit eigenem Netzwerk + Klassen-Netz, fünf Schüler-Netzwerke,
   Tabellen Stück für Stück erstellt und mit Beispieldaten gefüllt, Mia
   teilt einen Befehl, Analytics läuft. Dann fotografiert es jede Station
   und merkt sich, wo die wichtigen Knöpfe liegen (Prozent im Bild):

     img/tour/<name>.webp   (WebP, deviceScaleFactor 2)
     img/tour/marken.json   { <name>: { w, h, m: { <marke>: [x, y, b, h] } } }

   Die Tour zeichnet daraus die nummerierten Kreise – ändert sich die
   Oberfläche, einfach neu laufen lassen:

     npm i --no-save @electric-sql/pglite@0.5.8
     node MPSkills/tools/SocialHub/tests/tour-bilder.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const OUT = path.join(HERE, '..', 'img', 'tour');
mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ── Datenbank (wie e2e.mjs) ──────────────────────────── */
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
                values ($1, $2, 't1', 'Frau Test', 'active', 'approved', false)`, [T1, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T1]);
const CODE = (await db.query(`select skill_room_create('socialhub', 'Info 9a', false, '{}'::jsonb) v`)).rows[0].v.code;
const ROOM = (await db.query(`select id from skill_rooms where code = $1`, [CODE])).rows[0].id;
const KIDS = [['tokMia', 'Mia', 'Pixelwelt', 'like'], ['tokLeon', 'Leon', 'Snapzone', 'rocket'], ['tokBen', 'Ben', 'Trendr', 'trend'],
              ['tokLea', 'Lea', 'RingRing', 'bell'], ['tokEmil', 'Emil', 'Großepause', 'chat']];
for (const [i, k] of KIDS.entries())
  await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`, [ROOM, k[0], i + 1, k[1]]);

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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/wasm',
               '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/api/my_ip') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ip":"10.1.2.3"}'); return; }
  const file = path.join(REPO, u);
  if (!file.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
  try { const b = readFileSync(file); res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const ORIGIN = `http://localhost:${server.address().port}`;
const BASE = `${ORIGIN}/MPSkills/tools/SocialHub/tests/harness.html?raum=${CODE}`;

/* ── Browser ───────────────────────────────────────────── */
const browser = await chromium.launch();
const errors = [];
async function open(who, size, scheme) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: scheme || 'light' });
  // die Tour selbst soll auf den Fotos nicht aufgehen
  await ctx.addInitScript(() => { try { localStorage.setItem('sh.tour.off', '1'); } catch (e) { /* egal */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(who + ': ' + e.message));
  await page.exposeFunction('rpc', (fn, args) => rpcAs(who, fn, args));
  await page.exposeFunction('rpcState', () => stateOf());
  await page.goto(BASE + '&rolle=' + (who === 'teacher' ? 'presenter' : 'participant'));
  return { page, app: page.frameLocator('iframe') };
}

// PNG → WebP im Browser (Chromium kann WebP schreiben, Node allein nicht)
const conv = await (await browser.newContext()).newPage();
async function toWebp(png) {
  const b64 = await conv.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, png.toString('base64'));
  return Buffer.from(b64, 'base64');
}

const MARKEN = {};
/* Foto von einem Ausschnitt (clip = Locator, Box oder null = ganzes Fenster)
   und die Lage der Marken darin in Prozent. */
async function snap(name, page, clip, marks, pad = 0) {
  // nachgebaute „Zulassen?“-Fenster (Analytics) gehören nur auf ihr eigenes Foto
  if (name !== 'analytics-frage') {
    const pp = page.frameLocator('iframe').locator('.perm-pop button', { hasText: 'Zulassen' });
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 3 && await pp.count(); i++) { await pp.first().click().catch(() => {}); await wait(300); }
      await wait(r ? 250 : 900);
    }
  } else await wait(250);
  const vp = page.viewportSize();
  let box = { x: 0, y: 0, width: vp.width, height: vp.height };
  if (clip && clip.boundingBox) { await clip.scrollIntoViewIfNeeded().catch(() => {}); await wait(150); box = await clip.boundingBox(); }
  else if (clip) box = clip;
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  box = { x, y, width: Math.min(vp.width - x, box.width + 2 * pad), height: Math.min(vp.height - y, box.height + 2 * pad) };
  const m = {};
  for (const [k, loc] of Object.entries(marks || {})) {
    const b = await loc.first().boundingBox().catch(() => null);
    if (!b) { console.log('   Marke fehlt:', name, k); continue; }
    const r = v => Math.round(v * 1000) / 10;
    const x0 = Math.max(b.x, box.x + 3), y0 = Math.max(b.y, box.y + 3);
    const x1 = Math.min(b.x + b.width, box.x + box.width - 3), y1 = Math.min(b.y + b.height, box.y + box.height - 3);
    if (x1 <= x0 || y1 <= y0) { console.log('   Marke außerhalb:', name, k); continue; }
    m[k] = [r((x0 - box.x) / box.width), r((y0 - box.y) / box.height), r((x1 - x0) / box.width), r((y1 - y0) / box.height)];
  }
  const png = await page.screenshot({ clip: box });
  const webp = await toWebp(png);
  writeFileSync(path.join(OUT, name + '.webp'), webp);
  MARKEN[name] = { w: Math.round(box.width), h: Math.round(box.height), m };
  console.log('Foto', name.padEnd(18), Math.round(webp.length / 1024) + ' KB', Object.keys(m).join(' '));
}

async function fill(app, tb) {
  const b = app.locator(`[data-dload="${tb}"]:not([disabled])`);
  if (!await b.count()) { console.log('   kein Füllen für', tb); return; }
  await b.scrollIntoViewIfNeeded();
  await b.click();
  await app.locator('.dlg [data-dlg="yes"]').click();
  await app.locator(`[data-dclear="${tb}"]`).waitFor({ timeout: 60000 });
}
async function create(app, tb) {
  await app.locator(`[data-tadd="${tb}"]`).click();
  await app.locator(`[data-tdrop="${tb}"]`).waitFor();
}

try {
  /* ── Netzwerke: Lehrkraft (eigenes + Klassen-Netz), fünf Schüler ── */
  const hubOf = r => (r && r.hub && (r.hub.id || r.hub)) || null;
  const own = hubOf(await rpcAs('teacher', 'sh_found', { p_name: 'Lehrerzimmer', p_logo: 'graph' }));
  await rpcAs('teacher', 'sh_register', { p_hub: own, p_username: 'admin', p_password: 'lehrer1', p_name: 'Frau Test' });
  const cls = hubOf(await rpcAs('teacher', 'sh_found', { p_name: 'Klasse 9a', p_logo: 'mesh', p_class: true }));
  await rpcAs('teacher', 'sh_register', { p_hub: cls, p_username: 'frau.test', p_password: 'lehrer1', p_name: 'Frau Test' });
  const kid = {};
  for (const [tok, name, net, logo] of KIDS) {
    const h = hubOf(await rpcAs(tok, 'sh_found', { p_name: net, p_logo: logo }));
    const r = await rpcAs(tok, 'sh_register', { p_hub: h, p_username: 'admin', p_password: 'geheim1', p_name: name, p_gender: 'diverse' });
    kid[tok] = { hub: h, session: r.session || r.token || (r.s && r.s.session) };
  }
  if (!own || !cls || !kid.tokMia.hub) throw new Error('Netzwerke nicht angelegt');

  /* ── 1) Lehrkraft: Tabellen Stück für Stück ── */
  const t = await open('teacher', { width: 1280, height: 860 });
  await t.app.locator('text=Tabellen für alle Netzwerke').waitFor();
  for (const tb of ['photos', 'likes', 'comments']) await create(t.app, tb);
  await fill(t.app, 'users');
  await fill(t.app, 'photos');
  await wait(3000);   // Meldung „Beispieldaten … geladen“ ausblenden lassen
  const tdg = t.app.locator('.panel', { hasText: 'Tabellen für alle Netzwerke' });
  await snap('tabellen', t.page, tdg, {
    users: t.app.locator('[data-tb="users"]'),
    erstellen: t.app.locator('[data-tadd="follows"]'),
    fuellen: t.app.locator('[data-dload="likes"]'),
    leeren: t.app.locator('[data-dclear="photos"]'),
    schalter: t.app.locator('.panel-sw')
  }, 8);

  // der Rest für die übrigen Stationen
  for (const tb of ['follows', 'tags', 'sessions', 'views', 'ads']) await create(t.app, tb);
  for (const tb of ['likes', 'comments', 'follows', 'tags', 'sessions', 'views', 'ads']) await fill(t.app, tb);

  /* ── Mia teilt einen Befehl (für „Geteilt“ bei der Lehrkraft) ── */
  const mc = await rpcAs('tokMia', 'sh_cmd_save', { p_hub: kid.tokMia.hub, p_session: kid.tokMia.session, p_task: 'Aufgabe 1b',
    p_sql: "SELECT username, country\nFROM users\nWHERE country = 'Deutschland';" });
  const mcId = mc && (mc.id || (mc.item && mc.item.id));
  const sh = await rpcAs('tokMia', 'sh_cmd_share', { p_hub: kid.tokMia.hub, p_session: kid.tokMia.session, p_id: mcId });
  if (!sh || !sh.ok) console.log('   Teilen ging nicht:', JSON.stringify(mc), JSON.stringify(sh));

  /* ── 2) Startseite: alle Netzwerke ── */
  await t.page.reload();
  await t.app.locator('.net-row', { hasText: 'Snapzone' }).waitFor();
  await t.app.locator('.home').evaluate(e => { e.scrollTop = 0; });
  const top = await t.app.locator('.home-top').boundingBox();
  const list = await t.app.locator('.panel').first().boundingBox();
  const kidRow = t.app.locator('.net-row', { hasText: 'Snapzone' });
  await snap('netze', t.page, { x: list.x - 10, y: top.y, width: list.width + 20, height: list.y + list.height - top.y + 10 }, {
    eigenes: t.app.locator('.net-row.is-mine'),
    klasse: t.app.locator('.net-row.is-class'),
    klasseInfo: t.app.locator('.net-row.is-class [data-cinfo]'),
    schueler: kidRow,
    passwort: kidRow.locator('[data-reset]'),
    sperren: kidRow.locator('[data-lock]'),
    material: t.app.locator('.home-mat'),
    hilfe: t.app.locator('.home-tour')
  });

  /* ── 3) Schüler-Sicht: Klassen-Netz auf der Startseite ── */
  const lea = await open('tokLea', { width: 400, height: 760 });
  await lea.app.locator('.class-sec .net-tile').waitFor();
  const leaEnd = await lea.app.locator('#btnNetLogin').boundingBox();
  await snap('klasse-schueler', lea.page, { x: 0, y: 0, width: 400, height: Math.min(760, leaEnd.y + leaEnd.height + 24) }, { klasse: lea.app.locator('.class-sec .net-tile'), eigenes: lea.app.locator('.net-tile').nth(1) });
  await lea.page.context().close();

  /* ── 4) Arbeitsmaterial (Seite mit nachgebauter Anmeldung) ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2, colorScheme: 'light' });
    await ctx.route('**/vendor/supabase-js-*.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await ctx.route('**/session.js*', r => r.fulfill({ contentType: 'text/javascript', body: `
      window.__session = { id: 'x', display_name: 'Frau Test', account_name: 't1', teacher_status: 'approved', is_admin: false };
      window.getSessionUser = () => window.__session; window.waitForSession = () => Promise.resolve(window.__session);
      window.supabaseClient = { rpc: async () => ({ data: { ok: true, title: 'Info 9a', teile: ['I-3', 'II-1', 'II-2'] }, error: null }),
        auth: { onAuthStateChange() {}, getSession: async () => ({ data: {} }) } };` }));
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('   material:', e.message));
    await p.goto(`${ORIGIN}/MPSkills/material.html?tool=socialhub&raum=${CODE}`);
    await p.locator('#matBuild').waitFor();
    await p.evaluate(() => { const s = [...document.querySelectorAll('[data-teil]')]; s.slice(0, 2).forEach(x => { if (!x.checked) x.click(); }); });
    await wait(400);
    const host = p.locator('#matHost');
    const hb = await host.boundingBox();
    await snap('material', p, { x: hb.x - 12, y: hb.y - 8, width: hb.width + 24, height: Math.min(1380, hb.height + 16) }, {
      skript: p.locator('.mat-file').first(),
      loesung: p.locator('.mat-file--sol'),
      haken: p.locator('.mat-cols'),
      pdf: p.locator('#matBuild')
    });
    await ctx.close();
  }

  /* ── 5) Im Netzwerk: Feed, Like, Kommentare, Posten, Passwort (Handy) ── */
  const tp = await open('teacher', { width: 400, height: 780 });
  await tp.app.locator('.net-row.is-mine .nr-main').click();
  await tp.app.locator('.card-img.img-ok').first().waitFor({ timeout: 20000 });
  await wait(1500);
  // die Abfrage „Standort?“ (Analytics) wegklicken
  const pop = tp.app.locator('.perm-pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await wait(400);
  await snap('feed', tp.page, null, {
    tabs: tp.app.locator('.feed-tabs'),
    views: tp.app.locator('.hub-top .views'),
    nav: tp.app.locator('.hub-nav')
  });
  await tp.app.locator('.card').first().locator('[data-act="like"]').click();
  await tp.app.locator('.react-pick [data-react="laugh"]').waitFor();
  await snap('app-like', tp.page, null, { like: tp.app.locator('.react-pick') });
  await tp.page.keyboard.press('Escape');
  await tp.app.locator('.react-pick [data-react="heart"]').click().catch(() => {});
  await wait(300);
  await tp.app.locator('.card').first().locator('[data-act="comments"]').click();
  await tp.app.locator('.sheet').waitFor();
  await wait(800);
  await snap('app-kommentare', tp.page, null, { sheet: tp.app.locator('.sheet') });
  await tp.app.locator('.sheet [data-close]').click();
  await tp.app.locator('[data-tab="post"]').click();
  await tp.app.locator('#pFile').waitFor({ state: 'attached' });
  await wait(600);
  const pop2 = tp.app.locator('.perm-pop button').first();
  if (await pop2.count()) await pop2.click().catch(() => {});
  await wait(400);
  await snap('app-posten', tp.page, null, { posten: tp.app.locator('[data-tab="post"]') });
  await tp.app.locator('[data-tab="search"]').click();
  await tp.app.locator('#q').fill('noobqueen');
  await tp.app.locator('.s-user', { hasText: '@noobqueen' }).click();
  await tp.app.locator('#pPwReset').waitFor();
  await tp.app.locator('#pPwReset').click();
  await tp.app.locator('.dlg [data-dlg="yes"]').click();
  await tp.app.locator('#pPwNew:not([hidden]) code').waitFor();
  await snap('app-passwort', tp.page, null, { reset: tp.app.locator('#pPwReset'), neu: tp.app.locator('#pPwNew') });
  // eine Werbekarte im Feed
  await tp.app.locator('.ov [data-close]').first().click().catch(() => {});
  await tp.app.locator('[data-tab="feed"]').first().click();
  await tp.app.locator('.card-img.img-ok').first().waitFor({ timeout: 20000 });
  for (let i = 0; i < 12 && !await tp.app.locator('.card--wb').count(); i++) {
    await tp.app.locator('.feed-host').evaluate(h => { const sc = [h, ...h.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)); if (sc) sc.scrollBy(0, sc.clientHeight); });
    await wait(500);
  }
  if (await tp.app.locator('.card--wb').count()) {
    await tp.app.locator('.card--wb').first().scrollIntoViewIfNeeded();
    await wait(800);
    await snap('werbung-feed', tp.page, null, { karte: tp.app.locator('.card--wb') });
  }
  await tp.page.context().close();

  /* ── 6) Adminbereich (breit) ── */
  await t.app.locator('.net-row.is-mine .nr-main').click();
  await t.app.locator('[data-view="admin"]').click();
  await t.app.locator('.subtabs [data-at="sql"].on').waitFor();
  await t.app.locator('.db-tbl').first().waitFor({ timeout: 20000 });
  await t.app.locator('.ed-ta').fill("SELECT username, name, gender, country\nFROM users\nWHERE country = 'Deutschland'\nLIMIT 8;");
  await t.app.locator('#dbRun').click();
  await t.app.locator('.grid th', { hasText: 'country' }).first().waitFor({ timeout: 15000 });
  await wait(400);
  await snap('sql', t.page, null, {
    reiter: t.app.locator('.subtabs'),
    befehl: t.app.locator('.ed-ta'),
    run: t.app.locator('#dbRun'),
    grid: t.app.locator('.grid'),
    speichern: t.app.locator('.cmd-save'),
    fenster: t.app.locator('.cmd-open')
  });
  await t.app.locator('.cmd-save').click();
  await t.app.locator('.cmd-dlg input[name=task]').fill('Aufgabe 1b');
  await wait(300);
  await snap('befehl-speichern', t.page, t.app.locator('.cmd-dlg'), { aufgabe: t.app.locator('.cmd-dlg input[name=task]'), sql: t.app.locator('.cmd-dlg textarea') }, 14);
  await t.app.locator('.cmd-dlg button[type=submit]').click();
  await t.app.locator('.cmd-dlg').waitFor({ state: 'detached' });
  await wait(3000);   // Meldung „Befehl gespeichert“ abwarten
  await t.app.locator('.cmd-open').click();
  await t.app.locator('.cmd-tabs [data-tab="inbox"]').click();
  await t.app.locator('.cmd-card--in').first().waitFor({ timeout: 10000 });
  await wait(400);
  await snap('befehle-geteilt', t.page, t.app.locator('.cmd-win'), {
    reiter: t.app.locator('.cmd-tabs'),
    karte: t.app.locator('.cmd-card--in'),
    editor: t.app.locator('.cmd-card--in [data-a="use"]')
  });
  await t.app.locator('.cmd-win [data-close]').first().click();
  await t.app.locator('.subtabs [data-at="diagram"]').click();
  await t.app.locator('.dg-svg .dg-t').first().waitFor();
  await wait(600);
  // nur so breit wie die Tabellen, Kopf mit dem Reiter bleibt drauf
  const dgb = await t.app.locator('.dg-svg').first().evaluate(svg => {
    const R = svg.getBoundingClientRect();
    const rs = [...svg.querySelectorAll('.dg-t')].map(c => (c.closest('g') || c).getBoundingClientRect())
      .filter(r => r.width > 2 && r.height > 2 && r.width < R.width * 0.8);
    const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top));
    return { x, y, width: Math.max(...rs.map(r => r.right)) - x, height: Math.max(...rs.map(r => r.bottom)) - y };
  });
  const dgx = Math.max(0, Math.min(dgb.x - 40, 300));
  await snap('diagramm', t.page, { x: dgx, y: 0, width: Math.min(1280 - dgx, Math.max(dgb.x + dgb.width + 40 - dgx, 700)), height: Math.min(860, dgb.y + dgb.height + 20) },
    { reiter: t.app.locator('.subtabs [data-at="diagram"]') });
  await t.app.locator('.subtabs [data-at="settings"]').click();
  await t.app.locator('[data-sc="light"]').waitFor();
  await wait(400);
  await snap('einstellungen', t.page, null, { reiter: t.app.locator('.subtabs [data-at="settings"]'), vorschau: t.app.locator('.be-prev') });
  await t.app.locator('.subtabs [data-at="ads"]').click();
  await t.app.locator('.wb-row').first().waitFor({ timeout: 20000 });
  await t.app.locator('#wbSt', { hasText: 'berechnet' }).waitFor({ timeout: 30000 }).catch(() => {});
  await wait(400);
  await snap('werbung', t.page, null, {
    neu: t.app.locator('#wbNew'),
    every: t.app.locator('#wbEvery'),
    zeile: t.app.locator('.wb-row')
  });
  // Analytics: was in sessions steht
  await t.app.locator('.subtabs [data-at="sql"]').click();
  await t.app.locator('.ed-ta').waitFor();
  await t.app.locator('#dbReload').click().catch(() => {});
  await wait(1500);
  await t.app.locator('.ed-ta').fill('SELECT * FROM sessions\nORDER BY id DESC\nLIMIT 8;');
  await t.app.locator('#dbRun').click();
  await t.app.locator('.grid th', { hasText: 'browser' }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await wait(400);
  const asq = await t.app.locator('.ed-ta').boundingBox(), agr = await t.app.locator('.grid').first().boundingBox();
  await snap('analytics-sql', t.page, { x: 0, y: asq.y - 8, width: 1280, height: Math.min(860 - asq.y + 8, agr.y + agr.height - asq.y + 20) },
    { befehl: t.app.locator('.ed-ta'), grid: t.app.locator('.grid') });

  /* ── 7) Analytics: Kasten der Lehrkraft + Aufdeckung am Tablet ── */
  const mia = await open('tokMia', { width: 400, height: 760 });
  // mit Klassen-Netz zeigt die Startseite erst die Auswahl
  await mia.app.locator('.net-tile', { hasText: 'Pixelwelt' }).click();
  await mia.app.locator('#lForm, #lo1').first().waitFor();
  if (await mia.app.locator('#lo1').count()) await mia.app.locator('#lo1').click();
  await mia.app.locator('#lForm input[name=user]').fill('admin');
  await mia.app.locator('#lForm input[name=pw]').fill('geheim1');
  await mia.app.locator('#lForm button[type=submit]').click();
  await mia.app.locator('.hub-name', { hasText: 'Pixelwelt' }).waitFor({ timeout: 20000 });
  await mia.app.locator('.perm-pop').waitFor({ timeout: 8000 }).catch(() => {});
  await snap('analytics-frage', mia.page, { x: 0, y: 0, width: 400, height: 420 }, { frage: mia.app.locator('.perm-pop') });
  await mia.app.locator('.perm-pop button', { hasText: 'Zulassen' }).click().catch(() => {});
  await t.app.locator('#toHome').click();
  await t.app.locator('[data-rev="show"]').waitFor();
  await t.app.locator('[data-rev="show"]').click();
  await t.app.locator('[data-rev="show"].on').waitFor({ timeout: 8000 }).catch(() => {});
  await wait(400);
  await snap('analytics-lk', t.page, t.app.locator('.panel', { has: t.app.locator('.seg--rev') }), { stufen: t.app.locator('.seg--rev') }, 8);
  await mia.app.locator('.ov--reveal .rv-s--got').waitFor({ timeout: 15000 });
  await wait(800);
  await snap('analytics-aufdeckung', mia.page, null, {});
  await mia.page.context().close();

  /* ── 6b) Schüler-Tour: Mia im eigenen Adminbereich (Tablet) ── */
  {
    // Aufdeckung wieder verbergen, sonst liegt sie über Mias Tablet
    await t.app.locator('[data-rev="off"]').click();
    for (let i = 0; i < 40 && (await stateOf()).reveal; i++) await wait(100);
    // ein zweiter, noch nicht geteilter Befehl → „Teilen“ ist sichtbar
    await rpcAs('tokMia', 'sh_cmd_save', { p_hub: kid.tokMia.hub, p_session: kid.tokMia.session, p_task: 'Aufgabe 2', p_sql: 'SELECT name, city\nFROM users\nORDER BY name;' });
    const ms = await open('tokMia', { width: 1024, height: 768 });
    await ms.app.locator('.net-tile', { hasText: 'Pixelwelt' }).click();
    await ms.app.locator('#lForm, #lo1').first().waitFor();
    if (await ms.app.locator('#lo1').count()) await ms.app.locator('#lo1').click();
    await ms.app.locator('#lForm input[name=user]').fill('admin');
    await ms.app.locator('#lForm input[name=pw]').fill('geheim1');
    await ms.app.locator('#lForm button[type=submit]').click();
    await ms.app.locator('[data-view="admin"]').waitFor({ timeout: 20000 });
    // die nachgebaute Standort-Frage kommt 2,5 s nach dem Start – erst abwarten, dann wegklicken
    await ms.app.locator('.perm-pop').waitFor({ timeout: 6000 }).catch(() => {});
    if (await ms.app.locator('.perm-pop').count()) await ms.app.locator('.perm-pop button', { hasText: 'Zulassen' }).click().catch(() => {});
    await ms.app.locator('[data-view="admin"]').click();
    await ms.app.locator('.subtabs [data-at="settings"]').click();
    await ms.app.locator('[data-sc="light"]').waitFor();
    await wait(500);
    await snap('sch-einstellungen', ms.page, null, {
      reiter: ms.app.locator('.subtabs [data-at="settings"]'),
      logo: ms.app.locator('.logo-pick'),
      name: ms.app.locator('.be-form input[name=name]'),
      farben: ms.app.locator('.swatches'),
      vorschau: ms.app.locator('.be-prev')
    });
    await ms.app.locator('.subtabs [data-at="sql"]').click();
    await ms.app.locator('.db-tbl').first().waitFor({ timeout: 20000 });
    await ms.app.locator('.ed-ta').fill("SELECT username, name, city\nFROM users\nWHERE city = 'Hamburg';");
    await ms.app.locator('#dbRun').click();
    await ms.app.locator('.grid th', { hasText: 'city' }).first().waitFor({ timeout: 15000 });
    await snap('sch-sql', ms.page, null, {
      befehl: ms.app.locator('.ed-ta'),
      run: ms.app.locator('#dbRun'),
      grid: ms.app.locator('.grid'),
      speichern: ms.app.locator('.cmd-save')
    });
    await ms.app.locator('.cmd-save').click();
    await ms.app.locator('.cmd-dlg input[name=task]').fill('Aufgabe 3a');
    await snap('sch-speichern', ms.page, ms.app.locator('.cmd-dlg'), { aufgabe: ms.app.locator('.cmd-dlg input[name=task]') }, 14);
    await ms.app.locator('.cmd-dlg button[type=submit]').click();
    await ms.app.locator('.cmd-dlg').waitFor({ state: 'detached' });
    await wait(3000);
    await ms.app.locator('.cmd-open').click();
    await ms.app.locator('.cmd-card [data-a="share"]').first().waitFor();
    await wait(400);
    const open1 = ms.app.locator('.cmd-card', { has: ms.app.locator('[data-a="share"]:not(.is-done)') }).first();
    await snap('sch-befehle', ms.page, ms.app.locator('.cmd-win'), {
      teilen: open1.locator('[data-a="share"]'),
      editor: open1.locator('[data-a="use"]')
    });
    await ms.app.locator('.cmd-win [data-close]').first().click();
    await ms.app.locator('.subtabs [data-at="diagram"]').click();
    await ms.app.locator('.dg-svg .dg-t').first().waitFor();
    await wait(600);
    const sdb = await ms.app.locator('.dg-svg').first().evaluate(svg => {
      const R = svg.getBoundingClientRect();
      const rs = [...svg.querySelectorAll('.dg-t')].map(c => c.getBoundingClientRect()).filter(r => r.width > 2 && r.width < R.width * 0.8);
      return { x: Math.min(...rs.map(r => r.left)), r: Math.max(...rs.map(r => r.right)), b: Math.max(...rs.map(r => r.bottom)) };
    });
    const sx = Math.max(0, Math.min(sdb.x - 40, 200));
    await snap('sch-diagramm', ms.page, { x: sx, y: 0, width: Math.min(1024 - sx, Math.max(sdb.r + 40 - sx, 640)), height: Math.min(768, sdb.b + 20) },
      { reiter: ms.app.locator('.subtabs [data-at="diagram"]') });
    // das „?“ hinter den Reitern (für die Marke in der Tour der Lehrkraft nicht nötig)
    await ms.page.context().close();
  }

  writeFileSync(path.join(OUT, 'marken.json'), JSON.stringify(MARKEN, null, 1) + '\n');
  console.log(errors.length ? 'Fehler in der Seite:\n  ' + errors.join('\n  ') : 'keine Fehler in der Seite');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
