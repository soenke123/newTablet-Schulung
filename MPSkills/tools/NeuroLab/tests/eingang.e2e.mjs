/* NeuroLab Stufe 2: Schüler sendet ein Netz, Lehrkraft sieht es im Eingang, zeigt es und löscht es.
   Der Raum wird nachgebaut: eine Seite mit zwei iframes (Lehrkraft, Schüler) und einer
   gemeinsamen Eingangsliste im Speicher; sie beantwortet nl:rpc wie tool.js.
   Aufruf: node MPSkills/tools/NeuroLab/tests/eingang.e2e.mjs  (startet selbst einen kleinen Server) */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.csv': 'text/csv' };
const PAGE = `<!doctype html><body style="margin:0"><div style="display:flex">
<iframe id="t" src="/MPSkills/tools/NeuroLab/index.html?raum=lehrer" style="width:900px;height:700px;border:0"></iframe>
<iframe id="s" src="/MPSkills/tools/NeuroLab/index.html?raum=schueler" style="width:900px;height:700px;border:0"></iframe></div>
<script>
const inbox = []; let nid = 0;
window.addEventListener('message', e => {
  const m = e.data || {};
  const from = e.source;
  if (m.type === 'nl:ready') { from.postMessage({ type: 'nl:cmd', parts: ['neuron','n-wie','n-typen','bauen','v-revier','b-frei','trainieren','sc-gatter','sc-ziffer','sc-ziel','sc-vogel'] }, location.origin); return; }
  if (m.type !== 'nl:rpc') return;
  let res = { ok: true };
  const isT = from === document.getElementById('t').contentWindow;
  if (m.fn === 'nl_send') {
    const i = inbox.find(x => x.scenario === m.args.p_scenario);
    if (i) i.payload = m.args.p_payload; else inbox.push({ id: ++nid, from: 'Mia', scenario: m.args.p_scenario, payload: m.args.p_payload, at: '22.11. 12:00' });
  } else if (!isT) res = { ok: false, error: 'not_found' };
  else if (m.fn === 'nl_inbox_list') res = { ok: true, items: inbox.map(({ id, from, scenario, at }) => ({ id, from, scenario, at })) };
  else if (m.fn === 'nl_inbox_get') { const i = inbox.find(x => x.id === m.args.p_id); res = i ? { ok: true, from: i.from, scenario: i.scenario, payload: i.payload } : { ok: false, error: 'not_found' }; }
  else if (m.fn === 'nl_inbox_delete') { const k = inbox.findIndex(x => x.id === m.args.p_id); if (k >= 0) inbox.splice(k, 1); }
  from.postMessage({ type: 'nl:rpc:res', id: m.id, res }, location.origin);
});
</script></body>`;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/harness.html') { r.setHeader('content-type', 'text/html'); return r.end(PAGE); }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  r.end(readFileSync(f));
}).listen(0);
const port = srv.address().port;
let fails = 0; const ok = (l, c) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'}  ${l}`); };
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1800, height: 720 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${port}/harness.html`);
const T = pg.frameLocator('#t'), S = pg.frameLocator('#s');
await T.locator('.tile[data-id="trainieren"]').waitFor();

// Schüler: Szenario Gatter öffnen, Netz bauen, Senden erst in Learn/Test
await S.locator('.tile[data-id="trainieren"]').click();
await S.locator('#scen-picker .tile[data-id="sc-gatter"]').click();
ok('Senden-Knopf im Build nicht da', !(await S.locator('#btn-send').isVisible()));
await S.locator('#btn-run').click();
ok('Senden-Knopf im Test da', await S.locator('#btn-send').isVisible());
await S.locator('#btn-send').click();
await S.locator('#btn-send.is-sent').waitFor({ timeout: 3000 });
ok('Schüler: „Gesendet ✓“', (await S.locator('#btn-send').textContent()).includes('Gesendet'));

// Lehrkraft: Eingang
await T.locator('#btn-inbox').waitFor({ state: 'visible' });
await pg.waitForTimeout(300);
await T.locator('#btn-inbox').click();
await T.locator('.ib-row').first().waitFor();
const row = await T.locator('.ib-row').first().textContent();
ok('Eingang zeigt Name + Szenario', row.includes('Mia') && row.includes('Logik-Gatter'));
await T.locator('[data-show]').first().click();
await T.locator('#network .col').first().waitFor();
ok('Zeigen: Titel nennt Schüler + Szenario', (await T.locator('#area-title').textContent()).includes('Mia'));
ok('Zeigen: Szenario-Wechsel-Knopf weg', await T.locator('.sc-switch, .learn-scen-switch').count() === 0);
await T.locator('#btn-home').click();
await T.locator('#btn-inbox').click();
await T.locator('[data-del]').first().click();
await T.locator('.ib-empty').waitFor();
ok('Löschen: Liste leer', true);
// Schüler hat sein Netz weiter
await S.locator('#btn-home').click(); await S.locator('.tile[data-id="trainieren"]').click(); 
ok('Schüler behält sein Szenario-Netz', await S.locator('#network .col').count() > 0);
ok('keine Skriptfehler', errs.length === 0);
if (errs.length) console.log(errs);
await b.close(); srv.close();
console.log(fails ? `\n${fails} FEHLER` : '\nalles ok'); process.exit(fails ? 1 : 0);
