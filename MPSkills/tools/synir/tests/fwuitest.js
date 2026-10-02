/* Prüfstand für die Firewall in der Oberfläche: echter Browser, echte Seite.

   Eigene Datei und nicht ein Abschnitt in uitest.js: der ist mit
   6500 Zeilen eine einzige lange Reihe, die an der ersten
   Umgebungsabweichung abbricht — und dann kommt nichts mehr, was
   dahinter steht. Dieser hier ist klein und bricht nur an sich selbst.

   Aufruf wie uitest.js; ohne installiertes Chrome:
     NODE_PATH=<ordner mit playwright-core> CHROME_PATH=<chrome> node tests/fwuitest.js */
const PW_ALT = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt/node_modules/playwright-core';
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(PW_ALT); }
const path = require('path');

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');
const OUT = __dirname;

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); }
                          else { fail++; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); } };

async function gross(page, an) {
  const ist = await page.evaluate(() => document.querySelector('#karte').classList.contains('is-mehr'));
  if (ist !== an) { await page.locator('#karteMehr').click(); await page.waitForTimeout(250); }
}
async function waehlen(page, kind) {
  await page.evaluate((kind) => { const S = window.SIM; S.flaeche.select(S.netz.list().find(n => n.kind === kind).id); }, kind);
  await page.waitForTimeout(300);
  await gross(page, true);
  const r = page.locator('#karteBody .k-reiter-b', { hasText: 'Allgemein' });
  if (await r.count()) { await r.first().click(); await page.waitForTimeout(200); }
}

(async () => {
  const browser = await pw.chromium.launch({ channel: 'chrome' })
    .catch(() => pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }));
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.addInitScript(() => { window.NETSIM_SEED = 12345; });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept().catch(() => {}));

  await page.goto(URL);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(700);

  console.log('\n── Firewall: der Knopf ─────────────────────────────');
  await page.evaluate(() => {
    const N = window.SIM.netz;
    N.addNode('router', 700, 150); N.addNode('heimrouter', 900, 150); N.addNode('cww', 1100, 150);
    window.SIM.flaeche.draw();
  });
  for (const kind of ['router', 'heimrouter', 'cww']) {
    await waehlen(page, kind);
    ok(kind + ': im Reiter „Allgemein" steht der Knopf „Firewall"',
       await page.locator('#karteBody [data-k="fwseite"]').count() === 1);
    ok(kind + ': aus → der Knopf sagt „läuft nicht"',
       await page.locator('#karteBody .k-fw.is-aus').count() === 1
       && /läuft nicht/.test(await page.locator('#karteBody .k-fw').textContent()));
    ok(kind + ': der Knopf steht UNTER den Einstellungen und ÜBER den Tabellen',
       await page.evaluate(() => {
         const b = document.querySelector('#karteBody [data-k="fwseite"]');
         const t = document.querySelector('#karteBody [data-tabellen]');
         const alle = [...document.querySelectorAll('#karteBody .k-sec, #karteBody input.f')];
         const letzte = alle[alle.length - 1];
         return !!b && !!t && (b.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) > 0
           && (letzte.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
       }));
  }
  ok('klein (Kärtchen) gibt es den Knopf nicht', await (async () => {
    await gross(page, false);
    const n = await page.locator('#karteBody [data-k="fwseite"]').count();
    await gross(page, true);
    return n === 0;
  })());

  console.log('\n── Firewall: die Seite ─────────────────────────────');
  for (const kind of ['router', 'heimrouter', 'cww']) {
    await waehlen(page, kind);
    await page.locator('#karteBody [data-k="fwseite"]').click();
    await page.waitForTimeout(200);
    ok(kind + ': die Seite hat „Zurück", den Haken oben und noch keine Regel',
       await page.locator('#karteBody [data-k="zurueck"]').count() === 1
       && await page.locator('#karteBody [data-k="fwan"]').count() === 1
       && await page.locator('#karteBody .k-fwr').count() === 0);
    ok(kind + ': der Haken ist die ERSTE Einstellung auf der Seite',
       await page.evaluate(() => {
         const f = document.querySelector('#karteBody input, #karteBody select');
         return f && f.dataset.k === 'fwan';
       }));
    await page.locator('#karteBody [data-k="fwan"]').check();
    await page.waitForTimeout(200);
    ok(kind + ': Haken setzt „läuft" in Modell und Anzeige',
       await page.evaluate((k) => window.SIM.netz.list().find(n => n.kind === k).firewall.on === true, kind)
       && /läuft/.test(await page.locator('#karteBody .k-fw-an').textContent())
       && !/läuft nicht/.test(await page.locator('#karteBody .k-fw-an').textContent()));
    await page.locator('#karteBody [data-k="fwneu"]').click();
    await page.locator('#karteBody [data-k="fwneu"]').click();
    await page.waitForTimeout(150);
    ok(kind + ': „+ Regel" legt Zeilen an (verwerfen)',
       await page.locator('#karteBody .k-fwr').count() === 2
       && await page.locator('#karteBody .k-fwr[data-akt="verwerfen"]').count() === 2);
    await page.locator('#karteBody [data-f="fwquelle"]').nth(0).fill('203.0.113.0/24');
    await page.locator('#karteBody [data-f="fwquelle"]').nth(1).fill('banane');
    await page.waitForTimeout(100);
    ok(kind + ': eine krumme Angabe ist rot und die Zeile „unfertig"',
       await page.locator('#karteBody [data-f="fwquelle"]').nth(1).evaluate(e => e.classList.contains('is-bad'))
       && await page.locator('#karteBody .k-fwr-u.is-da').count() === 1);
    ok(kind + ': die gute Zeile ist es nicht',
       !(await page.locator('#karteBody [data-f="fwquelle"]').nth(0).evaluate(e => e.classList.contains('is-bad'))));
    await page.locator('#karteBody [data-f="fwakt"]').nth(0).selectOption('erlauben');
    await page.waitForTimeout(100);
    ok(kind + ': die Aktion färbt die Zeile',
       await page.locator('#karteBody .k-fwr').nth(0).getAttribute('data-akt') === 'erlauben');
    await page.locator('#karteBody [data-k="fwrunter"]').nth(0).click();
    await page.waitForTimeout(150);
    ok(kind + ': ▼ vertauscht die Reihenfolge (die Aussage der Liste)',
       await page.evaluate((k) => {
         const r = window.SIM.netz.list().find(n => n.kind === k).firewall.regeln;
         return r[0].quelle === 'banane' && r[1].quelle === '203.0.113.0/24' && r[1].aktion === 'erlauben';
       }, kind));
    await page.locator('#karteBody [data-k="fwdel"]').nth(0).click();
    await page.waitForTimeout(150);
    ok(kind + ': × entfernt eine Zeile', await page.locator('#karteBody .k-fwr').count() === 1);
    await page.locator('#karteBody [data-k="zurueck"]').click();
    await page.waitForTimeout(200);
    ok(kind + ': der Knopf zeigt „läuft · 1 Regel" und ist grün',
       await page.locator('#karteBody .k-fw.is-an').count() === 1
       && /läuft · 1 Regel/.test(await page.locator('#karteBody .k-fw').textContent()));
  }

  console.log('\n── Firewall: das Zeichen auf der Fläche ────────────');
  await page.evaluate(() => window.SIM.flaeche.draw());
  ok('alle drei laufen → drei Zeichen', await page.locator('.nf-fw').count() === 3);
  ok('das Zeichen sitzt unten links an der Kachel (und nicht unter ihr)',
     await page.evaluate(() => {
       const g = document.querySelector('.nf-node .nf-fw');
       const t = g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/);
       return +t[1] < 0 && +t[2] > 0;
     }));
  ok('es hat einen Kurzhinweis', await page.evaluate(() =>
    /Firewall/.test(document.querySelector('.nf-fw title').textContent)));
  ok('und es steht NICHT in der Reihe der Server-Pillen', await page.evaluate(() =>
    !document.querySelector('.nf-fw').classList.contains('nf-mark')));
  await page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    r.firewall.on = false; window.SIM.flaeche.draw();
  });
  ok('aus → das Zeichen verschwindet (die Regeln bleiben)',
     await page.locator('.nf-fw').count() === 2
     && await page.evaluate(() => window.SIM.netz.list().find(n => n.kind === 'router').firewall.regeln.length === 1));
  await page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    r.firewall.on = true; r.on = false; window.SIM.flaeche.draw();
  });
  ok('ist das Gerät aus, rückt das Zeichen neben das Aus-Zeichen',
     await page.evaluate(() => {
       const n = [...document.querySelectorAll('.nf-node')].find(x => x.querySelector('.nf-off') && x.querySelector('.nf-fw'));
       if (!n) return false;
       const a = n.querySelector('.nf-off').getBoundingClientRect(), b = n.querySelector('.nf-fw').getBoundingClientRect();
       return a.right <= b.left + 1 || b.right <= a.left + 1;
     }));
  await page.evaluate(() => { window.SIM.netz.list().find(n => n.kind === 'router').on = true; window.SIM.flaeche.draw(); });

  console.log('\n── Firewall: im Aktionsmodus ───────────────────────');
  /* Ein Heimnetz: Rechner innen, Server draußen; die Wand sperrt
     den Bereich des Servers. */
  await page.evaluate(() => {
    const S = window.SIM, N = S.netz;
    for (const n of N.list()) N.removeNode(n.id);
    const hr = N.addNode('heimrouter', 500, 400);
    N.setDhcp(hr, 0, false);
    hr.nics[0].ip = '84.12.5.9'; hr.nics[0].mask = '255.255.255.0';
    hr.nics[1].ip = '192.168.1.1'; hr.nics[1].mask = '255.255.255.0';
    const sv = N.addNode('server', 800, 250);
    sv.nics[0].ip = '84.12.5.1'; sv.nics[0].mask = '255.255.255.0'; sv.gateway = '84.12.5.9';
    N.addCable(hr.id, 0, sv.id, 0);
    const h = N.addNode('host', 300, 500);
    h.nics[0].ip = '192.168.1.10'; h.nics[0].mask = '255.255.255.0'; h.gateway = '192.168.1.1';
    N.addCable(h.id, 0, hr.id, 2);
    const c = N.fwConf(hr);
    c.on = true; c.standard = 'erlauben'; c.merken = true;
    c.regeln = [{ ein: '*', quelle: '', ziel: '84.12.5.0/24', proto: 'icmp', port: '', aktion: 'verwerfen' }];
    S.flaeche.draw();
  });
  await page.evaluate(() => window.SIM.setModus('aktion'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const S = window.SIM; S.geraet.open(S.netz.list().find(n => n.kind === 'heimrouter').id); });
  await page.waitForTimeout(400);
  ok('Kompaktansicht: ein Block „Firewall" mit „läuft"',
     await page.locator('#dtWin .k-sec', { hasText: 'Firewall' }).count() >= 1
     && /läuft/.test(await page.locator('#dtWin').textContent()));
  ok('… und die Regel als Zeile mit Aktion „verwerfen"',
     await page.locator('#dtWin .tbl-fw .k-fw-a--verwerfen').count() === 1);
  ok('… nur lesen: keine Eingabefelder für Regeln',
     await page.locator('#dtWin [data-f^="fw"]').count() === 0);

  await page.evaluate(() => {
    const S = window.SIM;
    const h = S.netz.list().find(n => n.kind === 'host');
    window.__ping = null;
    S.stack.ping(h, '84.12.5.1', 1, null, (x) => { window.__ping = x; });
    S.engine.runUntil(S.engine.now + 30 * 1000000);
  });
  await page.waitForTimeout(500);
  ok('der Ping an den gesperrten Bereich kommt nicht zurück',
     await page.evaluate(() => !!window.__ping && window.__ping.ok === false));
  ok('der Zähler im Fenster springt (verworfen ≥ 1)',
     await page.evaluate(() => {
       const z = document.querySelector('#dtWin .k-fw-stat');
       return !!z && /[1-9]\d* verworfen/.test(z.textContent);
     }), await page.locator('#dtWin .k-fw-stat').textContent());
  ok('und die Regel zeigt ihre Treffer',
     /Treffer/.test(await page.locator('#dtWin .tbl-fw [data-live="fwtreffer"]').first().textContent()));

  // Der Mitschnitt: Standardansicht („nur raus") zeigt die verworfene Zeile.
  await page.evaluate(() => { const b = document.querySelector('#traceBtn'); if (b) b.click(); });
  await page.waitForTimeout(300);
  const wurde = await page.evaluate(() => window.SIM.mit.view().some(r => r.lost && /Regel 1/.test(r.fw || '')));
  ok('⭐ der Mitschnitt zeigt die verworfene Zeile mit der Regelnummer — auch in der Voreinstellung', wurde);

  // Terminal des Routers.
  await page.evaluate(() => window.SIM.setModus('entwurf'));
  await page.waitForTimeout(300);

  ok('keine Konsolenfehler', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'shot-firewall.png') });

  console.log('\n' + '═'.repeat(62));
  console.log(fail === 0 ? 'ALLES GRÜN — ' + pass + ' Prüfungen bestanden.' : pass + ' bestanden, ' + fail + ' GESCHEITERT.');
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ABBRUCH:', e); process.exit(2); });
