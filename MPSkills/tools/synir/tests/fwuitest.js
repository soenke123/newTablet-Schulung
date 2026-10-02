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
    ok(kind + ': die Seite hat „Zurück", den Haken und noch keine Zeile',
       await page.locator('#karteBody [data-k="zurueck"]').count() === 1
       && await page.locator('#karteBody [data-k="fwan"]').count() === 1
       && await page.locator('#karteBody .k-fwz').count() === 0);
    ok(kind + ': der Haken ist die ERSTE Einstellung auf der Seite',
       await page.evaluate(() => {
         const f = document.querySelector('#karteBody input, #karteBody select, #karteBody [data-k="fwtyp"]');
         return f && f.dataset.k === 'fwan';
       }));
    ok(kind + ': es gibt keine Aktion je Zeile, keine Ports, keinen Eingang, keine Pfeile',
       await page.locator('#karteBody [data-f="fwakt"], #karteBody [data-f="fwport"], #karteBody [data-f="fwein"], #karteBody [data-k="fwhoch"]').count() === 0);
    ok(kind + ': Blacklist ist vorgewählt, mit dem Satz dazu',
       await page.locator('#karteBody [data-k="fwtyp"].is-on').getAttribute('data-typ') === 'blacklist'
       && /gesperrt/.test(await page.locator('#karteBody .k-fw-satz').textContent()));
    await page.locator('#karteBody [data-k="fwan"]').check();
    await page.waitForTimeout(200);
    ok(kind + ': Haken setzt „läuft" in Modell und Anzeige',
       await page.evaluate((k) => window.SIM.netz.list().find(n => n.kind === k).firewall.on === true, kind)
       && /läuft/.test(await page.locator('#karteBody .k-fw-an').textContent())
       && !/läuft nicht/.test(await page.locator('#karteBody .k-fw-an').textContent()));
    await page.locator('#karteBody [data-k="fwneu"]').click();
    await page.locator('#karteBody [data-k="fwneu"]').click();
    await page.waitForTimeout(150);
    ok(kind + ': „+ Adresse" legt LEERE Zeilen an, die „unfertig" sagen',
       await page.locator('#karteBody .k-fwz').count() === 2
       && /unfertig/.test(await page.locator('#karteBody .k-fwz-i').nth(0).textContent()));
    await page.locator('#karteBody [data-f="fwadr"]').nth(0).fill('192.0.0.0');
    await page.locator('#karteBody [data-f="fwmask"]').nth(0).fill('255.0.0.0');
    await page.waitForTimeout(100);
    ok(kind + ': unter der Zeile steht, was daraus folgt',
       /192\.0\.0\.0.*192\.255\.255\.255.*16\.777\.216/.test(await page.locator('#karteBody .k-fwz-i').nth(0).textContent()),
       await page.locator('#karteBody .k-fwz-i').nth(0).textContent());
    await page.locator('#karteBody [data-f="fwadr"]').nth(1).fill('192.168.2.1');
    await page.waitForTimeout(100);
    ok(kind + ': eine Adresse ohne Maske ist „genau dieses Gerät"',
       /genau dieses Gerät/.test(await page.locator('#karteBody .k-fwz-i').nth(1).textContent()));
    await page.locator('#karteBody [data-f="fwmask"]').nth(1).fill('255.0.255.0');
    await page.waitForTimeout(100);
    ok(kind + ': eine krumme Maske ist rot und die Zeile „unfertig"',
       await page.locator('#karteBody [data-f="fwmask"]').nth(1).evaluate(e => e.classList.contains('is-bad'))
       && /Netzmaske stimmt nicht/.test(await page.locator('#karteBody .k-fwz-i').nth(1).textContent()));
    await page.locator('#karteBody [data-f="fwmask"]').nth(1).fill('');
    await page.locator('#karteBody [data-f="fwadr"]').nth(1).fill('www.beispiel.de');
    await page.waitForTimeout(100);
    ok(kind + ': ein Name hat keine Maske (Feld grau) und ist „noch nicht aufgelöst"',
       await page.locator('#karteBody [data-f="fwmask"]').nth(1).isDisabled()
       && /noch nicht aufgelöst/.test(await page.locator('#karteBody .k-fwz-i').nth(1).textContent()));
    await page.locator('#karteBody [data-k="fwtyp"][data-typ="whitelist"]').click();
    await page.waitForTimeout(200);
    ok(kind + ': der Schalter macht aus der Liste eine Whitelist (Liste bleibt, Satz und Überschrift wechseln)',
       await page.evaluate((k) => {
         const f = window.SIM.netz.list().find(n => n.kind === k).firewall;
         return f.typ === 'whitelist' && f.regeln.length === 2;
       }, kind)
       && /Nur was auf der Liste/.test(await page.locator('#karteBody .k-fw-satz').textContent())
       && await page.locator('#karteBody .k-sec', { hasText: 'Erlaubt' }).count() === 1);
    await page.locator('#karteBody [data-f="fwabl"]').selectOption('ablehnen');
    ok(kind + ': „ablehnen" steht im Modell',
       await page.evaluate((k) => window.SIM.netz.list().find(n => n.kind === k).firewall.ablehnen === true, kind));
    await page.locator('#karteBody [data-k="fwtyp"][data-typ="blacklist"]').click();
    await page.waitForTimeout(150);
    await page.locator('#karteBody [data-k="fwdel"]').nth(0).click();
    await page.waitForTimeout(150);
    ok(kind + ': × entfernt eine Zeile', await page.locator('#karteBody .k-fwz').count() === 1);
    await page.locator('#karteBody [data-k="zurueck"]').click();
    await page.waitForTimeout(200);
    ok(kind + ': der Knopf zeigt „läuft · Blacklist · 1 Eintrag" und ist grün',
       await page.locator('#karteBody .k-fw.is-an').count() === 1
       && /läuft · Blacklist · 1 Eintrag/.test(await page.locator('#karteBody .k-fw').textContent()),
       await page.locator('#karteBody .k-fw').textContent());
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
  ok('aus → das Zeichen verschwindet (die Liste bleibt)',
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
    c.on = true; c.typ = 'blacklist'; c.ablehnen = false;
    c.regeln = [{ adresse: '84.12.5.0', maske: '255.255.255.0' }];
    S.flaeche.draw();
  });
  await page.evaluate(() => window.SIM.setModus('aktion'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const S = window.SIM; S.geraet.open(S.netz.list().find(n => n.kind === 'heimrouter').id); });
  await page.waitForTimeout(400);
  ok('Kompaktansicht: ein Block „Firewall" mit „läuft"',
     await page.locator('#dtWin .k-sec', { hasText: 'Firewall' }).count() >= 1
     && /läuft/.test(await page.locator('#dtWin').textContent()));
  ok('… mit dem Typ „Blacklist" und der Zeile samt Wirkung',
     /Blacklist/.test(await page.locator('#dtWin').textContent())
     && await page.locator('#dtWin .tbl-fw tr').count() === 2
     && /84\.12\.5\.255/.test(await page.locator('#dtWin .tbl-fw').textContent()));
  ok('… nur lesen: keine Eingabefelder für die Liste',
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
  ok('und die Zeile zeigt ihre Treffer',
     /Treffer/.test(await page.locator('#dtWin .tbl-fw [data-live="fwzeile"]').first().textContent()));

  // Der Mitschnitt: Standardansicht („nur raus") zeigt die verworfene Zeile.
  await page.evaluate(() => { const b = document.querySelector('#traceBtn'); if (b) b.click(); });
  await page.waitForTimeout(300);
  const wurde = await page.evaluate(() => window.SIM.mit.view().some(r => r.lost && /Zeile 1/.test(r.fw || '')));
  ok('⭐ der Mitschnitt zeigt die verworfene Zeile mit der Zeilennummer — auch in der Voreinstellung', wurde);

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
