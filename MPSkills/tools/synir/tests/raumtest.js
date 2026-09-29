/* ══════════════════════════════════════════════════════════════
   SYNIR — raumtest.js   ·   Prüfstand für den Raum
   ══════════════════════════════════════════════════════════════
   Lehrkraft und Tablet im echten Browser, dazwischen die ECHTE
   Migration 0180 in pglite. Kein Supabase, keine Anmeldung — ein
   kleiner Server liefert MPSkills/ aus und eine Ersatz-Seite
   (/__raum), die das Werkzeug genau so einhängt wie lehrer.js bzw.
   j.js: MPTool.load → mount → update im Takt.

   Geprüft wird, was der Auftrag verlangt:
     · Teilen: grün im Menü, Tablet sieht nur Geteiltes,
       „Neues Szenario verfügbar"
     · Aufgabentext + „Als Szenario speichern" → Eigene, und die
       Klasse bekommt es samt Auftrag
     · Spiegelung: Beamer folgt dem Kind; tut die Lehrkraft selbst
       etwas, wird es ihre Kopie, und das Kind bleibt unberührt
     · Blind: Schleier auf dem Tablet, Server nimmt nichts an
     · Class Wide Web (0181): zwei Tablets pingen sich über den
       Server an, 8.8.8.8 kennt den Namen des anderen, eine Webseite
       lädt über den Raum, die Lehrkraft sieht, wem was gehört

   Start:  CHROME_PATH=/pfad/zu/chrome node tests/raumtest.js
   (ohne CHROME_PATH wird das installierte Chrome genommen)
   ══════════════════════════════════════════════════════════════ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const pw = require('playwright-core');

const MPS  = path.join(__dirname, '..', '..', '..');          // MPSkills/
const REPO = path.join(MPS, '..');
const OUT  = __dirname;

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); }
                          else { fail++; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); } };
const warte = (ms) => new Promise(r => setTimeout(r, ms));

/* ─── Die Datenbank ──────────────────────────────────────────── */
const STUBS = `
set search_path = public, extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create table if not exists profiles (id uuid primary key default gen_random_uuid());
create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'x', multi_room boolean not null default true,
  max_participants int not null default 150, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100);
create table if not exists skill_rooms (
  id uuid primary key default gen_random_uuid(), code text unique, tool_id text not null,
  owner_id uuid not null references profiles(id), title text,
  expires_at timestamptz not null default now() + interval '60 days');
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references skill_rooms(id) on delete cascade,
  token text not null unique, seat int not null, name text,
  blocked boolean not null default false);
create table if not exists skill_room_state (
  room_id uuid primary key references skill_rooms(id) on delete cascade,
  phase int not null default 1, data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
-- Die generische Schicht, so klein wie nötig (das Original: 0080).
create or replace function skill_room_set_state(p_code text, p_phase int default null, p_data jsonb default null)
  returns jsonb language plpgsql as $$
declare v_room skill_rooms;
begin
  select * into v_room from skill_rooms where code = p_code and owner_id = auth.uid();
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_data is not null and octet_length(p_data::text) > 8192 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big'); end if;
  insert into skill_room_state (room_id, data) values (v_room.id, coalesce(p_data, '{}'))
  on conflict (room_id) do update set data = coalesce(p_data, skill_room_state.data), updated_at = now();
  return jsonb_build_object('ok', true);
end $$;
create role service_role; create role authenticated; create role anon;
`;

/* ─── Die Ersatz-Seite ───────────────────────────────────────── */
const RAUM_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/style.css"></head>
<body><main style="padding:12px"><div id="box"></div></main>
<script src="/lib/tool.js"></script>
<script>
(async () => {
  const q = new URLSearchParams(location.search);
  const role = q.get('role'), code = q.get('code'), token = q.get('token');
  window.__toasts = [];
  const srv = (fn, args) => window.srvRpc(fn, args || {}, role);
  const actions = role === 'presenter'
    ? MPTool.presenterActions(code, srv)
    : { role: 'participant', call: (fn, a) => srv(fn, Object.assign({ p_token: token }, a)),
        setData: () => Promise.resolve({ ok: false, error: 'not_allowed' }) };
  const impl = await MPTool.load('synir', 'synir');
  let tick = null;
  const ctx = MPTool.makeCtx({ actions, title: 'Test', toast: (t) => window.__toasts.push(t),
                               refresh: () => tick && tick() });
  const box = document.getElementById('box');
  impl.mount(box, ctx);
  tick = async () => impl.update(await window.srvRpc('__view', { code, token }, role));
  await tick();
  setInterval(tick, 700);
  window.__raum = true;
})();
</script></body></html>`;

function server() {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__raum') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(RAUM_HTML); return; }
    const p = path.normalize(path.join(MPS, decodeURIComponent(u.pathname)));
    if (!p.startsWith(MPS) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s)));
}

(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(STUBS);
  await db.exec(fs.readFileSync(path.join(REPO, 'supabase/migrations/0180_synir.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(REPO, 'supabase/migrations/0181_synir_cww.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(REPO, 'supabase/migrations/0182_synir_cww_bereiche.sql'), 'utf8'));
  const L = (await db.query(`insert into profiles default values returning id`)).rows[0].id;
  const room = (await db.query(
    `insert into skill_rooms (code, tool_id, owner_id, title) values ('RAUM77','synir',$1,'7b') returning id`, [L])).rows[0].id;
  const pid = (await db.query(
    `insert into skill_participants (room_id, token, seat, name) values ($1,'tok-mia',1,'Mia') returning id`, [room])).rows[0].id;
  await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1,'tok-ben',2,'Ben')`, [room]);

  // Ein Aufruf, als käme er über PostgREST: benannte Argumente.
  let dbLock = Promise.resolve();
  
/* Seit 2026-09-29 stehen Neu, Sichern, Szenarien, Dark Mode, Subnetze
   und Mitschnitt in den Menüs „Datei" / „Ansicht & Tools". Ist der
   Eintrag nicht sichtbar, klappt der Prüfstand erst sein Menü auf —
   wie eine Hand. */
async function mk(page, sel) {
  const l = page.locator(sel);
  if (!(await l.isVisible())) {
    const ansicht = ['#subBtn', '#traceBtn', '#themeBtn'].includes(sel);
    await page.locator(ansicht ? '#ansichtBtn' : '#dateiBtn').click();
  }
  await l.click();
}
async function rpc(fn, args, role) {
    const run = async () => {
      if (fn === '__view') {
        const st = (await db.query(`select data from skill_room_state where room_id = $1`, [room])).rows[0];
        const people = (await db.query(`select id, coalesce(name, 'Tablet ' || seat) as name from skill_participants where room_id = $1 order by seat`, [room])).rows;
        return { ok: true, role: role, room: { code: 'RAUM77' },
                 people: people.map(p => ({ id: p.id, name: p.name, online: true })),
                 state: { phase: 1, data: st ? st.data : {} }, entries: [] };
      }
      if (!/^(synir_|skill_room_set_state$)/.test(fn)) return { ok: false, error: 'fn_missing' };
      await db.query('delete from _who');
      if (role === 'presenter') await db.query('insert into _who values ($1)', [L]);
      const keys = Object.keys(args);
      const sql = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const vals = keys.map(k => args[k]);
      try { return (await db.query(sql, vals)).rows[0].r; }
      catch (e) { console.log('    [db] ' + fn + ': ' + e.message); return { ok: false, error: 'server_error' }; }
    };
    const p = dbLock.then(run, run);
    dbLock = p.catch(() => {});
    return p;
  }

  const srv = await server();
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const browser = await pw.chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });

  async function seite(role, extra) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    // Das Favicon der Ersatz-Seite gibt es nicht — das ist kein Fehler des Werkzeugs.
    page.on('console', m => {
      if (m.type() === 'error' && !/favicon/.test((m.location() || {}).url || '')) errs.push(m.text() + ' @ ' + (m.location() || {}).url);
    });
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.exposeFunction('srvRpc', (fn, args, r) => rpc(fn, args, r));
    await page.goto(BASE + '/__raum?role=' + role + '&code=RAUM77' + (extra || ''));
    await page.waitForFunction(() => window.__raum === true);
    const fr = await (await page.waitForSelector('.sy-frame')).contentFrame();
    await fr.waitForFunction(() => window.SIM && document.body.dataset.rolle);
    await warte(400);
    return { page, fr, errs };
  }

  const L1 = await seite('presenter');
  const S1 = await seite('participant', '&token=tok-mia');
  const lf = L1.fr, sf = S1.fr;

  console.log('\n── Aufbau ──────────────────────────────────────────');
  ok('Lehrkraft: Rolle im Rahmen', await lf.evaluate(() => document.body.dataset.rolle) === 'presenter');
  ok('Tablet: Rolle im Rahmen', await sf.evaluate(() => document.body.dataset.rolle) === 'participant');
  ok('Lehrkraft: Knopf „Aufgabentext" sichtbar', await lf.locator('#aufgabeBtn').isVisible());
  ok('Tablet: kein Knopf „Aufgabentext"', await sf.locator('#aufgabeBtn').isHidden());
  ok('Lehrkraft: Pult mit „Schüler blind"', await L1.page.locator('#syBlind').isVisible());
  ok('Tablet: kein Pult', await S1.page.locator('#syDesk').count() === 0);
  ok('Tablet: leere Fläche mit Hinweis', await sf.locator('#leerHinweis').isVisible()
     && /Noch kein Szenario freigegeben/.test(await sf.locator('#leerHinweis').textContent()));
  ok('Eigener Speicherplatz je Raum und Rolle',
     await sf.evaluate(() => Object.keys(localStorage).some(k => k === 'netzsim.stand.v1:participant:RAUM77'))
     || await sf.evaluate(() => window.SIM.IM_RAUM));

  console.log('\n── Szenarien teilen ────────────────────────────────');
  await mk(lf, '#szenarioBtn');
  ok('Lehrkraft: zwei Reiter', await lf.locator('.szm-tab').count() === 2);
  ok('Reiter heißen public / private',
     /Öffentlich.*public/.test(await lf.locator('.szm-tab').nth(0).textContent())
     && /Eigene.*private/.test(await lf.locator('.szm-tab').nth(1).textContent()));
  ok('Öffentlich: die 15 mitgelieferten, je mit Teilen-Symbol',
     await lf.locator('.szm-item').count() === 15 && await lf.locator('.szm-share').count() === 15);
  await lf.locator('.szm-item[data-id="builtin:i2"] .szm-share').click();
  await warte(300);
  ok('Geteilt: grün hinterlegt', await lf.locator('.szm-item[data-id="builtin:i2"]').evaluate(e => e.classList.contains('is-shared')));
  const d1 = (await db.query(`select data from skill_room_state where room_id = $1`, [room])).rows[0].data;
  ok('Raumzustand trägt die Freigabe', d1.shared && d1.shared[0].id === 'builtin:i2' && /Router|router/i.test(d1.shared[0].t), JSON.stringify(d1));
  await mk(lf, '#szenarioBtn');          // zu

  await warte(1500);
  ok('Tablet: „Neues Szenario verfügbar"', /Neues Szenario verfügbar/.test(await sf.locator('#toast').textContent()));
  await mk(sf, '#szenarioBtn');
  ok('Tablet: nur das Geteilte, ohne Reiter und Symbole',
     await sf.locator('.szm-item').count() === 1 && await sf.locator('.szm-tab').count() === 0
     && await sf.locator('.szm-share').count() === 0);
  await sf.locator('.szm-item .szm-name').click();
  await warte(400);
  ok('Tablet: Szenario liegt auf', await sf.evaluate(() => window.SIM.netz.count) > 0);
  ok('Tablet: Auftrag sichtbar', await sf.locator('#aufgabe').isVisible());
  ok('Tablet: Hinweis weg', await sf.locator('#leerHinweis').isHidden());
  await warte(2200);
  const w1 = (await db.query(`select stand from synir_work where participant_id = $1`, [pid])).rows[0];
  ok('Tablet meldet seinen Stand', w1 && w1.stand.szenario === 'builtin:i2' && w1.stand.nodes.length > 0);

  console.log('\n── Aufgabentext und eigenes Szenario ───────────────');
  await mk(lf, '#szenarioBtn');
  await lf.locator('.szm-item[data-id="builtin:i1"] .szm-name').click();
  await warte(300);
  // I.1 hat zwei Endgeräte; die folgenden Prüfungen rechnen mit dreien — also
  // baut die Lehrkraft, wie im Unterricht, ein Gerät dazu.
  await lf.evaluate(() => { window.SIM.netz.addNode('host', 700, 560); window.SIM.neuZeichnen(); });
  await mk(lf, '#aufgabeBtn');
  await lf.locator('.sy-dlg [data-titel]').fill('Pingen über den Switch');
  await lf.evaluate(() => {
    document.querySelector('.sy-dlg .aed-feld').innerHTML =
      '<p><strong>Dein Auftrag:</strong> Pinge E2.</p><ul><li>erst ipconfig</li><li>dann ping</li></ul>';
  });
  await lf.locator('.sy-dlg [data-ok]').click();
  ok('Lehrkraft: Auftrag geändert', (await lf.locator('#aufgabeTitel').textContent()) === 'Pingen über den Switch');
  await mk(lf, '#exportBtn');
  ok('Speichern fragt: PC oder Szenario', await lf.locator('.sy-wahl').count() === 2);
  await lf.locator('.sy-wahl[data-id="sz"]').click();
  await lf.locator('.sy-dlg [data-name]').fill('Mein Ping');
  await lf.locator('.sy-dlg [data-ok="neu"]').click();
  await warte(700);
  const row = (await db.query(`select * from synir_scenarios where owner_id = $1`, [L])).rows;
  ok('Szenario steht in der Datenbank', row.length === 1 && row[0].title === 'Mein Ping'
     && /<ul><li>erst ipconfig/.test(row[0].aufgabe) && row[0].netz.nodes.length === 3, JSON.stringify(row.map(r => r.title)));
  ok('… mit der Überschrift im Netz, ohne alte Kennung', row[0] && row[0].netz.titel === 'Pingen über den Switch' && !row[0].netz.szenario);
  ok('Rahmen kennt jetzt die neue ID', await lf.evaluate(() => window.SIM.aktuell.id) === (row[0] && row[0].id));
  await mk(lf, '#szenarioBtn');
  await lf.locator('.szm-tab[data-tab="private"]').click();
  ok('Eigene: das neue Szenario, mit Löschen', await lf.locator('.szm-item').count() === 1
     && (await lf.locator('.szm-item .szm-name').textContent()) === 'Mein Ping' && await lf.locator('.szm-del').count() === 1);
  await lf.locator('.szm-item .szm-share').click();
  await warte(300);
  await lf.locator('.szm-tab[data-tab="public"]').click();
  await L1.page.screenshot({ path: path.join(OUT, 'shot-raum-menue.png'), clip: { x: 700, y: 140, width: 700, height: 460 } });
  await mk(lf, '#szenarioBtn');

  // Noch einmal speichern: jetzt gibt es „Überschreiben".
  await mk(lf, '#exportBtn');
  await lf.locator('.sy-wahl[data-id="sz"]').click();
  ok('Eigenes Szenario: Überschreiben wird angeboten', await lf.locator('.sy-dlg [data-ok="ueber"]').count() === 1);
  await lf.locator('.sy-dlg [data-x]').first().click();

  await warte(1500);
  await mk(sf, '#szenarioBtn');
  ok('Tablet: jetzt zwei freigegeben', await sf.locator('.szm-item').count() === 2);
  await sf.locator('.szm-item[data-id="' + row[0].id + '"] .szm-name').click();
  await warte(800);
  ok('Tablet: eigenes Szenario vom Server, samt Auftrag',
     (await sf.locator('#aufgabeTitel').textContent()) === 'Pingen über den Switch'
     && await sf.locator('#aufgabeText li').count() === 2);
  ok('Tablet: drei Geräte', await sf.evaluate(() => window.SIM.netz.count) === 3);

  console.log('\n── Spiegelung ──────────────────────────────────────');
  // Die Lehrkraft baut vorher an ihrem eigenen Netz etwas anderes.
  await mk(lf, '#szenarioBtn');
  await lf.locator('.szm-tab[data-tab="public"]').click();
  await lf.locator('.szm-item[data-id="builtin:i2"] .szm-name').click();
  await warte(300);
  const eigenN = await lf.evaluate(() => window.SIM.netz.count);
  await warte(2500);
  await L1.page.locator('#syList').click();
  await warte(600);
  ok('Stand der Klasse: Mia mit Stand', /Mia/.test(await L1.page.locator('#syPeople').textContent())
     && await L1.page.locator('#syPeople .sy-person:not([disabled])').count() === 1);
  await L1.page.locator('.sy-person[data-pid="' + pid + '"]').click();
  await warte(1200);
  ok('Beamer zeigt Mias Netz', await lf.evaluate(() => window.SIM.netz.count) === 3);
  ok('Hinweis „Ansicht von Mia"', /Ansicht von Mia/.test(await L1.page.locator('#syNote').textContent()));

  // Mia löscht ein Gerät → der Beamer folgt.
  await sf.evaluate(() => { const n = window.SIM.netz.list()[0]; window.SIM.flaeche.select(n.id); window.SIM.loeschenAuswahl(); });
  await warte(1500 + 3000 + 1200);
  ok('Beamer folgt Mia (2 Geräte)', await lf.evaluate(() => window.SIM.netz.count) === 2);

  // Die Lehrkraft löscht selbst ein Gerät → Übernahme.
  await lf.evaluate(() => { const n = window.SIM.netz.list()[0]; window.SIM.flaeche.select(n.id); window.SIM.loeschenAuswahl(); });
  await warte(400);
  ok('Übernahme: „Kopie von Mia"', /Kopie von Mia/.test(await L1.page.locator('#syNote').textContent()));
  ok('Übernahme: Beamer hat 1 Gerät', await lf.evaluate(() => window.SIM.netz.count) === 1);
  ok('Übernahme: Mia hat weiter 2', await sf.evaluate(() => window.SIM.netz.count) === 2);
  const w2 = (await db.query(`select stand from synir_work where participant_id = $1`, [pid])).rows[0];
  ok('Übernahme: Mias Stand auf dem Server unberührt', w2.stand.nodes.length === 2);

  // Mia ändert weiter → der Beamer bleibt bei der Kopie.
  await sf.evaluate(() => { const n = window.SIM.netz.list()[0]; window.SIM.flaeche.select(n.id); window.SIM.loeschenAuswahl(); });
  await warte(1500 + 3000 + 1200);
  ok('Nach der Übernahme folgt der Beamer nicht mehr', await lf.evaluate(() => window.SIM.netz.count) === 1);

  // Zusehen ohne Übernahme und beenden: das eigene Netz kommt zurück.
  await mk(lf, '#szenarioBtn');
  await lf.locator('.szm-item[data-id="builtin:i2"] .szm-name').click();
  await warte(300);
  await L1.page.locator('.sy-person[data-pid="' + pid + '"]').click();
  await warte(1200);
  ok('Wieder bei Mia (1 Gerät)', await lf.evaluate(() => window.SIM.netz.count) === 1);
  await L1.page.locator('#syStop').click();
  await warte(400);
  ok('Beenden: eigenes Netz wieder da', await lf.evaluate(() => window.SIM.netz.count) === eigenN);

  console.log('\n── Blind ───────────────────────────────────────────');
  await L1.page.locator('#syBlind').click();
  await warte(1500);
  ok('Knopf zeigt den Zustand', (await L1.page.locator('#syBlind').getAttribute('aria-pressed')) === 'true');
  ok('Tablet: Schleier liegt', await sf.locator('.blind-schleier.is-on').isVisible());
  ok('Tablet: Hinweistext', /Wir machen jetzt am Beamer weiter/.test(await sf.locator('.blind-schleier').textContent()));
  const vor = await sf.evaluate(() => window.SIM.netz.count);
  await sf.locator('.blind-schleier').click();
  await S1.page.keyboard.press('Control+z');
  ok('Tablet: nichts geht durch', await sf.evaluate(() => window.SIM.netz.count) === vor);
  let r = await rpc('synir_work_put', { p_token: 'tok-mia', p_stand: { nodes: [] } }, 'participant');
  ok('Server nimmt nichts an, solange blind', r.error === 'blind');
  await S1.page.screenshot({ path: path.join(OUT, 'shot-raum-blind.png') });
  await L1.page.locator('#syBlind').click();
  await warte(1500);
  ok('Aufgehoben: Schleier weg', await sf.locator('.blind-schleier.is-on').count() === 0);

  await L1.page.screenshot({ path: path.join(OUT, 'shot-raum-lehrer.png') });

  console.log('\n── Class Wide Web ──────────────────────────────────');
  const S2 = await seite('participant', '&token=tok-ben');
  const bf = S2.fr;
  await warte(800);
  const pL = await lf.evaluate(() => window.SIM.netz.internetConf().prefix);
  const pM = await sf.evaluate(() => window.SIM.netz.internetConf().prefix);
  const pB = await bf.evaluate(() => window.SIM.netz.internetConf().prefix);
  ok('Lehrkraft hat 100', pL === 100, String(pL));
  ok('Mia und Ben: zwei verschiedene /8 aus 50…150',
     pM >= 50 && pM <= 150 && pB >= 50 && pB <= 150 && pM !== pB && pM !== 100 && pB !== 100, pM + ' / ' + pB);
  const bbB = await bf.evaluate(() => window.SIM.netz.internetConf().backbone);

  // Mia: ein Rechner am cww. Ben: Server mit DNS und Webserver.
  await sf.evaluate((p) => {
    const S = window.SIM;
    S.netz.fromJSON({ v: 2, nodes: [], cables: [] });
    const c = S.netz.addNode('cww', 400, 200);
    const e = S.netz.addNode('host', 400, 420);
    c.nics[1].ip = p + '.0.0.1';
    e.nics[0].ip = p + '.0.0.10'; e.gateway = p + '.0.0.1'; e.dns = '8.8.8.8';
    S.netz.addCable(e.id, 0, c.id, 1);
    S.neuZeichnen();
  }, pM);
  await bf.evaluate((p) => {
    const S = window.SIM;
    S.netz.fromJSON({ v: 2, nodes: [], cables: [] });
    const c = S.netz.addNode('cww', 400, 200);
    const sv = S.netz.addNode('server', 400, 420);
    c.nics[1].ip = p + '.0.0.1';
    sv.nics[0].ip = p + '.0.0.20'; sv.gateway = p + '.0.0.1'; sv.dns = '8.8.8.8';
    sv.software = ['dns', 'webserver'];
    const d = S.netz.dnsConf(sv); d.on = true; d.records = [{ name: 'www.ben.de', ip: p + '.0.0.20' }];
    S.dienste.http.standardDateien(sv);
    S.netz.webConf(sv).on = true;
    S.netz.addCable(sv.id, 0, c.id, 1);
    S.neuZeichnen();
  }, pB);
  for (const f of [sf, bf]) {
    await f.locator('.mbtn[data-modus="aktion"]').click();
    await f.evaluate(() => { window.SIM.engine.speed = 2; });
  }
  await warte(3500);
  const namen = (await db.query(`select name, wert, prefix from synir_cww_name where room_id = $1`, [room])).rows;
  ok('Bens Name steht beim Server', namen.some(n => n.name === 'www.ben.de' && n.prefix === pB), JSON.stringify(namen));

  const ping = await sf.evaluate((ziel) => new Promise(res => {
    const S = window.SIM;
    const e = S.netz.list().find(n => n.kind === 'host');
    S.stack.ping(e, ziel, 1, S.stack.PING_FRIST, res);
  }), pB + '.0.0.20');
  ok('⭐ Mia pingt Bens Server — über den Raum', ping && ping.ok && ping.from === pB + '.0.0.20', JSON.stringify(ping));
  ok('TTL: zwei cwws unterwegs', ping && ping.ttl === 62, ping && String(ping.ttl));
  ok('Ben sieht die Anfrage in seinem Mitschnitt',
     await bf.evaluate((von) => window.SIM.mit.view().some(z => z.proto === 'ICMP' && /Ping-Anfrage/.test(z.info)
       && z.info.indexOf(von) === 0), pM + '.0.0.10'));

  const dns = await sf.evaluate(() => new Promise(res => {
    const S = window.SIM;
    S.dienste.resolve(S.netz.list().find(n => n.kind === 'host'), 'www.ben.de', res);
  }));
  ok('⭐ 8.8.8.8 kennt Bens Namen', dns && dns.ok && dns.ip === pB + '.0.0.20', JSON.stringify(dns));

  const webseite = await sf.evaluate((ziel) => new Promise(res => {
    const S = window.SIM;
    S.dienste.http.seiteHolen(S.netz.list().find(n => n.kind === 'host'), ziel, res);
  }), pB + '.0.0.20');
  ok('⭐ Bens Webseite lädt auf Mias Tablet', webseite && webseite.ok && webseite.status === 200 && webseite.teile.length === 3,
     webseite && (webseite.grund || webseite.status));

  const tr = await sf.evaluate(() => new Promise(res => {
    const S = window.SIM;
    S.stack.ping(S.netz.list().find(n => n.kind === 'host'), '147.0.0.1', 9, S.stack.PING_FRIST, res);
  }));
  const frei = !(pM === 147 || pB === 147 || pL === 147);
  ok('ein /8 ohne Besitzer: „nicht erreichbar"', !frei || (tr && !tr.ok && /nicht erreichbar/.test(tr.error)), JSON.stringify(tr));

  // Im Aktionsmodus: das Kärtchen des cww, klein.
  await sf.evaluate(() => { const S = window.SIM; S.flaeche.select(S.netz.cwwVon().id); });
  await warte(500);
  await S1.page.screenshot({ path: path.join(OUT, 'shot-raum-cww-aktion.png') });
  {
    const t = await sf.evaluate(() => document.querySelector('#karte').textContent);
    ok('das Kärtchen im Aktionsmodus nennt den Bereich', t.includes(pM + '.0.0.0'), t.replace(/\s+/g, ' ').slice(0, 200));
  }

  // Im Entwurf: das Kärtchen, groß.
  await sf.locator('.mbtn[data-modus="entwurf"]').click();
  await warte(300);
  await sf.evaluate(() => { const S = window.SIM; S.flaeche.select(null); S.flaeche.select(S.netz.cwwVon().id); });
  await warte(400);
  if (!(await sf.evaluate(() => document.querySelector('#karte').classList.contains('is-mehr')))) {
    await sf.locator('#karteMehr').click();
    await warte(400);
  }
  const karteText = await sf.locator('#karteBody').textContent();
  ok('Mias Kärtchen „Internet": kein „Kein Raum"', !karteText.includes('Kein Raum'), karteText.slice(0, 160));
  {
    const b = await sf.evaluate(() => [...document.querySelectorAll('#karteBody .k-bereich')].map(e => e.textContent.replace(/\s+/g, '')));
    ok('⭐ Bens und der Lehrkraft Bereich stehen dort, Mias eigener nicht',
       b.includes(pB + '.0.0.0/8') && b.includes('100.0.0.0/8') && !b.includes(pM + '.0.0.0/8'), b.join('|'));
  }
  await sf.locator('.k-reiter-b', { hasText: 'Netzwerkkarten' }).click();
  await warte(250);
  ok('Mias Kärtchen „Netzwerkkarten" nennt den eigenen Bereich',
     (await sf.locator('#karteBody .k-cww-bereich').textContent()).replace(/\s+/g, '') === pM + '.0.0.0/8');
  await sf.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await warte(250);
  ok('die Weiterleitungstabelle führt Bens Bereich schon',
     await sf.evaluate((b) => [...document.querySelectorAll('#karteBody .tbl-cww td')].some(t => t.textContent === b + '.0.0.0'), pB));
  await sf.locator('[data-k="dnsseite"]').click();
  await warte(250);
  ok('Mias 8.8.8.8 zeigt Bens Namen als fremd',
     await sf.evaluate(() => [...document.querySelectorAll('#karteBody .k-dns-z')]
       .some(z => z.textContent.includes('www.ben.de') && z.textContent.includes('aus einem anderen Netz'))));
  ok('… ohne zu verraten, wem er gehört', !(await sf.locator('#karteBody').textContent()).includes('Ben'));
  await sf.locator('[data-k="zurueck"]').click();
  await warte(200);
  await sf.locator('.k-reiter-b', { hasText: 'Internet' }).click();
  await warte(200);
  await S1.page.screenshot({ path: path.join(OUT, 'shot-raum-cww.png') });

  await L1.page.locator('#syCww').click();
  await warte(1200);
  {
    const t = await L1.page.locator('#syCwwList').textContent();
    ok('⭐ Lehrkraft: „Internet der Klasse" nennt, wem welches /8 gehört',
       t.includes(pM + '.0.0.0/8') && t.includes('Mia') && t.includes(pB + '.0.0.0/8') && t.includes('Ben')
       && t.includes('100.0.0.0/8'), t.slice(0, 200));
    ok('… samt 8er-Adresse', t.includes(bbB));
  }
  await L1.page.screenshot({ path: path.join(OUT, 'shot-raum-cww-lehrer.png') });
  await L1.page.locator('#syCww').click();

  // Spiegelung: die Lehrkraft sieht Mia zu — ihr Rahmen funkt dabei nicht.
  await warte(2500);
  await L1.page.locator('.sy-person[data-pid="' + pid + '"]').click();
  await warte(1500);
  ok('In der Spiegelung ist der Anschluss aus', await lf.evaluate(() => window.SIM.internet.modus) === 'aus');
  await L1.page.locator('#syStop').click();
  await warte(400);
  ok('Nach der Spiegelung wieder im Raum', await lf.evaluate(() => window.SIM.internet.modus) === 'raum');
  ok('keine Fehler (Ben)', S2.errs.length === 0, S2.errs.slice(0, 3).join(' | '));

  console.log('\n── Neuer Raum ──────────────────────────────────────');
  await db.query('insert into _who values ($1)', [L]);
  r = (await db.query(`select synir_scenarios_list('ANDERS') as r`)).rows[0].r;
  await db.query('delete from _who');
  ok('Eigene Szenarien sind im nächsten Raum wieder da', r.ok && r.items.length === 1);

  ok('keine Fehler (Lehrkraft)', L1.errs.length === 0, L1.errs.join(' | '));
  ok('keine Fehler (Tablet)', S1.errs.length === 0, S1.errs.slice(0, 3).join(' | '));

  console.log('\n' + '═'.repeat(58));
  console.log(fail === 0 ? `ALLES GRÜN — ${pass} Prüfungen.` : `${pass} ok, ${fail} GESCHEITERT.`);
  console.log('═'.repeat(58));
  await browser.close();
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ABBRUCH:', e); process.exit(2); });
