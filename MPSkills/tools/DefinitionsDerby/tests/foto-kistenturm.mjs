/* ══════════════════════════════════════════════════════════════
   How to Fachbegriffe — foto-kistenturm.mjs
   ══════════════════════════════════════════════════════════════
   Nimmt das Bildschirmfoto der Lernform Kistenturm neu auf
   (img/spiel-kistensturm.jpg, 1040×650, JPEG 82) — aus der ECHTEN
   Ansicht: pglite mit allen Migrationen, ein kleiner Server liefert
   das Repository aus, eine Ersatz-Seite hängt das Werkzeug als
   Lehrkraft ein (wie lehrer.js: MPTool.load → mount → update).
   Teams, Start und Turmhöhen setzt das Skript direkt in der Datenbank.

   Aufruf:  node MPSkills/tools/DefinitionsDerby/tests/foto-kistenturm.mjs
   ══════════════════════════════════════════════════════════════ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const OUT = path.join(HERE, '..', 'img', 'spiel-kistensturm.jpg');
const warte = ms => new Promise(r => setTimeout(r, ms));

/* ─── Datenbank ─── */
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
for (const f of fs.readdirSync(path.join(REPO, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(fs.readFileSync(path.join(REPO, 'supabase/migrations', f), 'utf8')); }
  catch (e) { if (!f.startsWith('0087')) { console.error(f, e.message); process.exit(1); } }
}
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

const T = 'e0000000-0000-4000-8000-0000000000d1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 'tl', 'Frau Lehmann', 'active', 'approved', false)`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);
const room = (await one(`select skill_room_create('derby', 'Bio 8b', true, '{}'::jsonb) v`)).v;
const CODE = room.code || room.room?.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;

const CARDS = [
  ['Zelle', 'Kleinste lebende Einheit aller Lebewesen.'], ['Zellkern', 'Steuerzentrale der Zelle, enthält die Erbinformation.'],
  ['Zellmembran', 'Dünne Hülle, die die Zelle umgibt und den Stoffaustausch regelt.'], ['Zellwand', 'Feste Hülle pflanzlicher Zellen, gibt Form und Halt.'],
  ['Chloroplast', 'Zellbestandteil, in dem die Fotosynthese abläuft.'], ['Mitochondrium', 'Kraftwerk der Zelle, gewinnt Energie aus Nährstoffen.'],
  ['Vakuole', 'Mit Zellsaft gefüllter Raum in Pflanzenzellen.'], ['Cytoplasma', 'Flüssiger Inhalt der Zelle zwischen Membran und Kern.'],
  ['Fotosynthese', 'Pflanzen bauen mit Licht aus Wasser und Kohlenstoffdioxid Traubenzucker auf.'],
  ['Osmose', 'Wanderung von Wasser durch eine halbdurchlässige Membran.'],
  ['Diffusion', 'Selbstständige Verteilung von Teilchen bis zum Konzentrationsausgleich.'],
  ['Gewebe', 'Verband gleichartiger Zellen mit gleicher Aufgabe.']
].map(([t, d], i) => ({ id: 'c' + i, t, d }));
const stack = (await one(`select dd_stack_save($1, null, 'Die Zelle', 'Biologie', 'Zellbiologie', '8', $2::jsonb) v`,
  [CODE, JSON.stringify(CARDS)])).v;
const SID = stack.id || stack.stack?.id;
await db.query(`insert into skill_room_state (room_id, data) values ($1, $2::jsonb)
                on conflict (room_id) do update set data = excluded.data`,
  [ROOM, JSON.stringify({ shared: [{ id: SID, t: 'Die Zelle', n: CARDS.length, s: 'Biologie', p: 'Zellbiologie', g: '8', u: 1 }],
                          games: ['overview', 'cards', 'island', 'storm'] })]);
const KIDS = ['Mia', 'Ben', 'Lea', 'Tom', 'Emma', 'Paul', 'Lina', 'Finn', 'Ella', 'Noah', 'Ida', 'Max'];
for (let i = 0; i < KIDS.length; i++) {
  await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`,
    [ROOM, 'tok-' + i, i + 1, KIDS[i]]);
}

/* ─── Aufrufe aus der Seite, wie über PostgREST ─── */
let lock = Promise.resolve();
async function rpc(fn, args) {
  const run = async () => {
    if (fn === '__view') {
      const st = await one(`select data from skill_room_state where room_id = $1`, [ROOM]);
      return { ok: true, role: 'presenter', room: { code: CODE }, people: [], state: { phase: 1, data: st ? st.data : {} }, entries: [] };
    }
    await db.query(`update skill_participants set last_seen_at = now() where room_id = $1`, [ROOM]);
    const keys = Object.keys(args || {});
    const sql = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    const vals = keys.map(k => (args[k] !== null && typeof args[k] === 'object') ? JSON.stringify(args[k]) : args[k]);
    try { return (await db.query(sql, vals)).rows[0].r; }
    catch (e) { console.log('  [db] ' + fn + ': ' + e.message); return { ok: false, error: 'server_error' }; }
  };
  const p = lock.then(run, run); lock = p.catch(() => {}); return p;
}

const PAGE = `<!doctype html><html lang="de" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="/fonts/outfit-inter-jetbrainsmono-985fda.css" rel="stylesheet">
<link rel="stylesheet" href="/MPSkills/style.css"><style>body{margin:0;background:#fff}#box{width:1040px}</style></head>
<body><div id="box"></div>
<script src="/MPSkills/lib/tool.js"></script>
<script>
(async () => {
  const srv = (fn, a) => window.srvRpc(fn, a || {});
  const actions = MPTool.presenterActions(${JSON.stringify(CODE)}, srv);
  const impl = await MPTool.load('derby', 'DefinitionsDerby');
  let tick = null;
  const ctx = MPTool.makeCtx({ actions, title: 'Bio 8b', toast: () => {}, refresh: () => tick && tick() });
  impl.mount(document.getElementById('box'), ctx);
  tick = async () => impl.update(await window.srvRpc('__view', {}));
  await tick(); setInterval(tick, 700);
  window.__raum = true;
})();
</script></body></html>`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/MPSkills/__raum.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const p = path.normalize(path.join(REPO, decodeURIComponent(u.pathname)));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await pw.chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1040, height: 650 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', e => console.log('  [seite] ' + e.message));
await page.exposeFunction('srvRpc', (fn, a) => rpc(fn, a));
await page.goto(`http://127.0.0.1:${server.address().port}/MPSkills/__raum.html`);
await page.waitForFunction(() => window.__raum === true);
await warte(1200);

// Lernform Kistenturm öffnen (Lobby legt sich von selbst an).
await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-act="game"][data-g="storm"]')][0];
  if (el) el.click();
});
await warte(1500);
if (!(await page.locator('#ddSt').count())) {
  const html = await page.evaluate(() => [...document.querySelectorAll('[data-act]')].map(e => e.dataset.act + ':' + (e.dataset.id || e.dataset.game || e.dataset.g || '')).join(' '));
  console.log('Kistenturm nicht gefunden. Knöpfe:', html); process.exit(1);
}

// Vier Teams, Ziel 40, starten, Countdown abwarten, Türme setzen, Uhr 5 Min.
let r = await rpc('dd_storm_room_setup', { p_code: CODE, p_team_count: 4, p_goal: 40, p_minutes: 0, p_stacks: [SID] });
if (!r.ok) { console.log('setup', r); process.exit(1); }
r = await rpc('dd_storm_room_start', { p_code: CODE });
if (!r.ok) { console.log('start', r); process.exit(1); }
await warte(5000);
await rpc('dd_storm_room_get', { p_code: CODE, p_since: 0 });
const HEIGHTS = [17, 28, 11, 23];
for (let t = 0; t < 4; t++) {
  const boxes = Array.from({ length: HEIGHTS[t] }, () => ({ k: 'n', t }));
  await db.query(`select dd_storm_put($1, $2, $3::jsonb)`, [ROOM, t, JSON.stringify(boxes)]);
}
await db.query(`update dd_storm_boards set seq = seq + 1 where room_id = $1`, [ROOM]).catch(() => {});
r = await rpc('dd_storm_room_clock', { p_code: CODE, p_minutes: 5 });
if (!r.ok) console.log('  Uhr:', r);
await warte(9000);                                   // Türme Kiste für Kiste nachziehen lassen, Uhr läuft auf 4:5x
await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} }));
await warte(300);

const box = await page.locator('#box').boundingBox();
await page.screenshot({ path: OUT, type: 'jpeg', quality: 82,
  clip: { x: box.x, y: box.y, width: 1040, height: Math.min(650, Math.round(box.height)) } });
console.log('Foto gespeichert:', OUT);
await browser.close(); server.close(); process.exit(0);
