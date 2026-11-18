/* Nebeltal · Gemeinsam spielen – Ende-zu-Ende im Browser (Migration 0296)
   Lehrkraft + 3 Tablets als eigene Browser-Kontexte. Jede Seite ist ein Ersatz-Raum
   (MPSkills/__h.html), der die echte tool.js lädt; deren RPCs laufen über Playwright
   gegen die echte SQL-Kette 0001…0296 in pglite.

   Aufruf:  node MPSkills/tools/Nebeltal/tests/gemeinsam.e2e.mjs [Bildordner] */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/* ── Datenbank ── */
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
  catch (e) { if (f.startsWith('0087')) continue; console.error(f, e.message); process.exit(1); }
}
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const SCHOOL = (await one(`select id from schools limit 1`))?.id ?? (await one(`insert into schools (slug, name) values ('mps','MPS') returning id`)).id;
const A = 'e0000000-0000-4000-8000-00000002e2e1';
await db.query(`insert into auth.users (id) values ($1)`, [A]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 'nt_e2e', 'Admin', 'active', 'approved', true)`, [A, SCHOOL]);
await db.query(`insert into _who values ($1)`, [A]);
const CODE = (await one(`select skill_room_create('nebeltal', 'Info 10', false, '{}'::jsonb) v`)).v.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
const KIDS = ['Mia', 'Leon', 'Ada'];
for (let i = 0; i < KIDS.length; i++) {
  await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`, [ROOM, 'tok' + i, i + 1, KIDS[i]]);
}

// alle Aufrufe nacheinander (auth.uid() hängt an _who)
let q = Promise.resolve();
const serial = fn => (q = q.then(fn, fn));
const JSONB = new Set(['p', 'p_args', 'p_data']);
async function call(role, tok, fn, args) {
  return serial(async () => {
    await db.query(`delete from _who`);
    if (role === 'lehrer') await db.query(`insert into _who values ($1)`, [A]);
    const all = Object.assign(role === 'lehrer' ? { p_code: CODE } : { p_token: tok }, args || {});
    const ks = Object.keys(all);
    const sql = `select ${fn}(${ks.map((k, i) => `${k} => $${i + 1}${JSONB.has(k) ? '::jsonb' : ''}`).join(', ')}) v`;
    try {
      const r = await one(sql, ks.map(k => (JSONB.has(k) ? JSON.stringify(all[k]) : all[k])));
      return r.v;
    } catch (e) { console.error('SQL', fn, e.message); return { ok: false, error: 'server_error' }; }
  });
}
const view = () => serial(async () => {
  const r = await one(`select data, phase from skill_room_state where room_id = $1`, [ROOM]);
  return { state: r ? { data: r.data, phase: r.phase } : { data: {} } };
});
const setData = d => call('lehrer', null, 'skill_room_set_state', { p_data: d });

/* ── Webserver ── */
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>Raum</title>
<style>html,body{margin:0;height:100%;background:#070d1a}#host{height:100%}.nt-frame{width:100%;border:0;display:block}</style></head>
<body><div id="host"></div>
<script>window.MPTool={register(id,impl){window.__impl=impl;}};</script>
<script src="tools/Nebeltal/tool.js"></script>
<script>
const qs=new URLSearchParams(location.search), role=qs.get('role'), tok=qs.get('tok');
const ctx={role: role==='lehrer'?'presenter':'participant', preview:false, title:'Info 10',
  toast:m=>console.log('toast',m), errText:e=>e, refresh:()=>tick(),
  actions:{role: role==='lehrer'?'presenter':'participant', call:(fn,args)=>window.ntCall(role,tok,fn,args), setData:d=>window.ntSetData(d)}};
__impl.mount(document.getElementById('host'), ctx);
async function tick(){ __impl.update(await window.ntView()); }
setInterval(tick, 1000); tick();
</script></body></html>`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/MPSkills/__h.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(HARNESS); return; }
  const f = path.join(REPO, decodeURIComponent(u.pathname));
  if (!f.startsWith(REPO) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://127.0.0.1:' + server.address().port;

/* ── Browser ── */
let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
async function device(role, tok, w, h) {
  const c = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await c.newPage();
  page.on('pageerror', e => { fails++; console.log('FAIL  Seitenfehler (' + (tok || role) + '): ' + e.message); });
  page.on('console', m => { if (m.type() === 'error') console.log('  console(' + (tok || role) + '):', m.text()); });
  await page.exposeFunction('ntCall', call);
  await page.exposeFunction('ntView', view);
  await page.exposeFunction('ntSetData', setData);
  await page.goto(`${BASE}/MPSkills/__h.html?role=${role}&tok=${tok || ''}`);
  return page;
}
const fr = page => page.frames().find(f => /Nebeltal\/(index|labor)\.html/.test(f.url()));
const until = async (label, fn, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* weiter */ } await new Promise(r => setTimeout(r, 200)); }
  ok(label, false, '(Zeit um)'); return false;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const T = await device('lehrer', null, 1366, 820);
const S = [];
for (let i = 0; i < KIDS.length; i++) S.push(await device('schueler', 'tok' + i, 1024, 700));
await until('Übersicht steht überall', async () => (await Promise.all([T, ...S].map(p => fr(p) && fr(p).evaluate(() => document.body.dataset.state === 'menu')))).every(Boolean));

// Bilder pro Sekunde (Software-WebGL mit 4 Seiten ist langsam – Wartezeiten unten danach)
const fps = await fr(S[0]).evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('      (Tablet zeichnet ' + fps.toFixed(1) + ' Bilder/s)');

/* 1 Freigabe */
await fr(T).click('.tshare[data-share="1"]');
await until('1  Level 1 geteilt (data.levels)', async () => JSON.stringify((await view()).state.data.levels) === '[1]');
await until('1  Tablet: Level 1 offen, Level 2 gesperrt', async () => fr(S[0]).evaluate(() =>
  !!document.querySelector('.tile[data-lv="1"]') && !!document.querySelector('.tile.locked') && !document.querySelector('.tile[data-lv="2"]')));
await shot(T, '01_lehrkraft_uebersicht');
await shot(S[0], '02_tablet_uebersicht');

/* 2 Lobby */
await fr(T).click('#mpGo');
await until('2  Lehrkraft in der Lobby', async () => fr(T).evaluate(() => document.body.classList.contains('mp-on') && !document.querySelector('#mpSide').hidden));
for (let i = 0; i < S.length; i++) await until('2  Tablet ' + KIDS[i] + ' in der Lobby', async () => fr(S[i]).evaluate(() => document.body.classList.contains('mp-on')));
await until('2  Lehrkraft sieht 3 Pinguine', async () => fr(T).evaluate(() => document.querySelectorAll('#mpNames .mpn').length === 3));
// Mia tippt in den Schnee → läuft hin → Position kommt beim Server an
const before = (await one(`select pos from nt_players p join skill_participants s on s.id = p.participant_id where s.token = 'tok0'`)).pos;
await S[0].mouse.click(250, 520);
await sleep(6000);
const after = (await one(`select pos from nt_players p join skill_participants s on s.id = p.participant_id where s.token = 'tok0'`)).pos;
ok('2  Antippen = Pinguin läuft (Position beim Server)', Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.05, JSON.stringify([before, after]));
await shot(T, '03_lehrkraft_lobby');
await shot(S[0], '04_tablet_lobby');

/* 3 Level 2 jeder gegen jeden */
await fr(T).click('#mpSide [data-lv="2"]');
await until('3  Tablet: Banner „Nächstes Level 2“', async () => fr(S[1]).evaluate(() => /Nächstes Level/.test(document.querySelector('#mpBanner').textContent) && /2 ·/.test(document.querySelector('#mpBanner').textContent)));
await fr(T).click('#mpSide [data-a="start"]');
for (const p of S) await until('3  Erklärkarte mit „Bereit!“', async () => fr(p).evaluate(() => !document.querySelector('#card').hidden && /Bereit/.test(document.querySelector('#card .card-btns').textContent)));
await shot(S[0], '05_tablet_erklaerkarte');
await fr(S[0]).click('#card .card-btns .btn');
await until('3  Lehrkraft sieht Mia bereit', async () => fr(T).evaluate(() => /1 von 3 bereit/.test(document.querySelector('#mpStN').textContent)));
await shot(T, '06_lehrkraft_erklaerkarte');
await fr(T).click('#mpStBtns .btn.primary');
await until('3  Countdown auf dem Tablet', async () => fr(S[1]).evaluate(() => !document.querySelector('#mpCount').hidden));
for (const p of S) await until('3  Tablet spielt', async () => fr(p).evaluate(() => document.body.dataset.state === 'play'), 8000);
// laufen: Mia mit W, Leon mit D
await fr(S[0]).evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })));
await fr(S[1]).evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })));
await sleep(2500);
await fr(S[0]).evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' })));
await fr(S[1]).evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' })));
await shot(T, '07_lehrkraft_warteschirm');
await fr(S[0]).click('#btnStay');
await until('3  Mia wartet auf die anderen', async () => fr(S[0]).evaluate(() => /Warte auf die anderen/.test(document.querySelector('#card').textContent)));
await until('3  Lehrkraft: 1 von 3 fertig', async () => fr(T).evaluate(() => /1 von 3 fertig/.test(document.querySelector('#mpStN').textContent)));
await shot(S[0], '08_tablet_warten');
await fr(S[1]).click('#btnStay');
await fr(S[2]).click('#btnStay');
await until('3  alle fertig → Rangliste beim Beamer', async () => fr(T).evaluate(() => document.querySelectorAll('#mpTop li').length === 3));
await until('3  Tablet: eigener Platz (Leiste unten)', async () => fr(S[0]).evaluate(() => !document.querySelector('#endbar').hidden && /Platz\s*\d\s*von 3/.test(document.querySelector('#endbar').textContent)), 60000);
const paths = await db.query(`select res->>'p' p from nt_players where room_id = $1`, [ROOM]);
ok('3  Weg mitgeschickt (res.p)', paths.rows.every(r => r.p && r.p.length >= 8 && r.p.length % 4 === 0), paths.rows.map(r => (r.p || '').length).join());
await until('3  Lehrkraft: 3D-Karte mit Namen', async () => fr(T).evaluate(() => !!document.querySelector('#mpMapW #mpMap3') && document.querySelectorAll('#mpMapW .mml.pl').length === 3));
await fr(T).click('#mpTop li');
await until('3  Lehrkraft: Name antippen = Weg hervorheben', async () => fr(T).evaluate(() => !!document.querySelector('#mpTop li.sel') && !!document.querySelector('#mpMapW .mml.sel')), 5000);
await sleep(800);
await shot(T, '09_lehrkraft_ergebnis_karte');
await shot(S[0], '10_tablet_platz');

/* 4 Level 7 zu zweit (3 Personen: ein Paar + eine allein) */
await fr(T).click('#mpStBtns .btn:not(.primary)');                 // Zur Lobby
await until('4  zurück in der Lobby', async () => fr(T).evaluate(() => !document.querySelector('#mpSide').hidden));
for (const p of S) await until('4  Tablet zurück in der Lobby', async () => fr(p).evaluate(() => document.body.dataset.state === 'mp'));
await fr(T).click('#mpSide [data-lv="7"]');
await until('4  Teams: 2 + 1', async () => fr(T).evaluate(() => [...document.querySelectorAll('.mpt:not(.new)')].map(t => t.querySelectorAll('.mpc').length).sort().join() === '1,2'));
await shot(T, '11_lehrkraft_teams_level7');
await fr(T).click('#mpSide [data-a="start"]');
for (const p of S) { await until('4  Erklärkarte Level 7', async () => fr(p).evaluate(() => /Bereit/.test(document.querySelector('#card .card-btns').textContent))); await fr(p).click('#card .card-btns .btn'); }
await until('4  alle bereit', async () => fr(T).evaluate(() => /3 von 3 bereit/.test(document.querySelector('#mpStN').textContent)));
await fr(T).click('#mpStBtns .btn.primary');
for (const p of S) await until('4  Level 7 läuft', async () => fr(p).evaluate(() => document.body.dataset.state === 'play'), 8000);
const pairInfo = await one(`select array_agg(s.token order by s.seat) toks from nt_players p join skill_participants s on s.id = p.participant_id
                            where p.room_id = $1 group by p.team having count(*) = 2`, [ROOM]);
const [pa, pb] = pairInfo.toks.map(t => S[+t.slice(3)]);
const remoteBefore = await fr(pb).evaluate(() => JSON.stringify(NTZwei.vals()));
await fr(pa).evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })));
await fr(pa).evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'arrowup' })));
await sleep(2500);
await fr(pa).evaluate(() => { for (const k of ['w', 'arrowup']) window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); });
await sleep(1500);
const remoteAfter = await fr(pb).evaluate(() => JSON.stringify(NTZwei.vals()));
ok('4  Partner sieht die andere Figur laufen', remoteBefore !== remoteAfter, remoteBefore + ' → ' + remoteAfter);
await shot(pb, '12_tablet_level7_partner');
await shot(T, '13_lehrkraft_level7_uebersicht');
await fr(T).click('#mpStBtns .btn');                                // Runde beenden
await until('4  Rangliste der Teams', async () => fr(T).evaluate(() => document.querySelectorAll('#mpTop li').length === 2));
await until('4  Tablet: Platz des Teams', async () => fr(pa).evaluate(() => /Euer Netz/.test(document.querySelector('#endbar').textContent)), 60000);
await sleep(600);
await shot(T, '14_lehrkraft_level7_ergebnis');
await shot(pa, '15_tablet_level7_platz');

/* 5 Level 8 im Team */
await fr(T).click('#mpStBtns .btn:not(.primary)');
await until('5  Lobby', async () => fr(T).evaluate(() => !document.querySelector('#mpSide').hidden));
await fr(T).click('#mpSide [data-lv="8"]');
await until('5  ein Team mit 3 Personen', async () => fr(T).evaluate(() => document.querySelectorAll('.mpt:not(.new)').length === 1 && document.querySelectorAll('.mpc').length === 3));
await fr(T).click('#mpSide .mpc .dbl');
await until('5  ×2 gesetzt', async () => fr(T).evaluate(() => !!document.querySelector('.mpc .dbl.on')));
await fr(T).click('#mpSide [data-a="start"]');
for (const p of S) await until('5  Tablet im Labor (Level 8 gemeinsam)', async () => /labor\.html\?level=8&mp=1/.test(p.frames().map(f => f.url()).join(' ')), 9000);
for (const p of S) { await until('5  Erklärkarte im Labor', async () => fr(p).evaluate(() => /Bereit/.test(document.querySelector('#card').textContent))); await fr(p).click('#card .card-btns .btn'); }
await shot(S[0], '16_tablet_level8_erklaerkarte');
await until('5  alle bereit', async () => fr(T).evaluate(() => /3 von 3 bereit/.test(document.querySelector('#mpStN').textContent)));
await fr(T).click('#mpStBtns .btn.primary');
await until('5  Level 8 läuft', async () => fr(S[0]).evaluate(() => document.querySelector('#card').hidden), 9000);
const mineCells = await fr(S[0]).evaluate(() => document.querySelectorAll('.cell.mine').length);
ok('5  Mia hat eigene Welten (2 oder 3)', mineCells >= 2 && mineCells <= 3, String(mineCells));
const cell = await fr(S[0]).$('.cell.mine canvas');
const bb = await cell.boundingBox();
const leonBefore = await fr(S[1]).evaluate(() => document.querySelector('#sLoss').textContent);
await S[0].mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
await S[0].mouse.down();
await S[0].mouse.move(bb.x + bb.width * 0.8, bb.y + bb.height * 0.25, { steps: 8 });
await S[0].mouse.up();
await sleep(2000);
const leonAfter = await fr(S[1]).evaluate(() => document.querySelector('#sLoss').textContent);
ok('5  Leon sieht Mias Änderung (Fehler ändert sich)', leonBefore !== leonAfter, leonBefore + ' → ' + leonAfter);
await shot(S[1], '17_tablet_level8_team');
await shot(T, '18_lehrkraft_level8_uebersicht');
// Lehrkraft beobachtet das Team
await fr(T).click('[data-watch]');
await until('5  Lehrkraft beobachtet im Labor', async () => /labor\.html\?level=8&mp=1&team=/.test(T.frames().map(f => f.url()).join(' ')), 9000);
await until('5  Beobachten: Netz läuft', async () => fr(T).evaluate(() => document.body.classList.contains('mp8-watch') && document.querySelector('#card').hidden));
await sleep(1000);
await shot(T, '19_lehrkraft_beobachtet');
await fr(T).click('.head a.btn');
await until('5  zurück in der Übersicht', async () => /index\.html/.test(fr(T).url()) && await fr(T).evaluate(() => !!document.querySelector('#mpRun')), 9000);
await fr(T).click('#mpStBtns .btn');                                // Runde beenden
await until('5  Rangliste Level 8', async () => fr(T).evaluate(() => document.querySelectorAll('#mpTop li').length === 1));
await until('5  Tablet: Ergebnis im Labor', async () => fr(S[0]).evaluate(() => /Pinguinen richtig/.test(document.querySelector('#endbar').textContent)), 9000);
await fr(S[0]).click('#endbar >> text=Weiter trainieren');
await fr(S[0]).click('#step'); await fr(S[0]).click('#step');
await until('5  Tablet: nach der Runde weiter trainiert', async () => fr(S[0]).evaluate(() => /weiter trainiert \(\+2/.test(document.querySelector('#endbar').textContent)), 5000);
await shot(T, '20_lehrkraft_level8_ergebnis');
await shot(S[0], '21_tablet_level8_ergebnis');

/* 6 zurück und aus */
await fr(T).click('#mpStBtns .btn:not(.primary)');
for (const p of S) await until('6  Tablet aus dem Labor zurück in der Lobby', async () => /index\.html/.test(fr(p).url()) && await fr(p).evaluate(() => document.body.dataset.state === 'mp'), 9000);
await fr(T).click('#mpSide [data-a="off"]');
for (const p of S) await until('6  aus: Tablet wieder in der Übersicht', async () => fr(p).evaluate(() => document.body.dataset.state === 'menu' && !document.body.classList.contains('mp-on')), 9000);

await browser.close();
server.close();
console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
