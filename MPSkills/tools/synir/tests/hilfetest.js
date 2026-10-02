/* Prüfstand für die Hilfe für Lehrkräfte (js/hilfe.js): echter Browser, echte Seite.

   Eigene Datei aus demselben Grund wie fwuitest.js: klein, und sie
   bricht nur an sich selbst.

   Aufruf; ohne installiertes Chrome:
     NODE_PATH=<ordner mit playwright-core> CHROME_PATH=<chrome> node tests/hilfetest.js */
let pw;
for (const n of ['playwright-core', 'playwright']) { try { pw = require(n); break; } catch (e) { /* weiter */ } }
const path = require('path');
const fs = require('fs');

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); }
                          else { fail++; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); } };

async function laden(page, key) {
  await page.evaluate((k) => {
    const s = window.SIM.eingebaut(k);
    window.SIM.szenarioLaden({ id: 'builtin:' + k, titel: s.titel, aufgabe: s.aufgabe, netz: s.netz });
  }, key);
  await page.waitForTimeout(300);
  if (await page.locator('#aufgabe:not([hidden])').count()) await page.locator('#aufgabeMin').click();
}
async function punkt(page, name) {
  return page.evaluate((nm) => {
    const n = window.SIM.netz.list().find(x => x.name === nm || x.kind === nm);
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = n.x; q.y = n.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return { x: t.x, y: t.y };
  }, name);
}
async function tipp(page, name) {
  const q = await punkt(page, name);
  await page.mouse.click(q.x, q.y);
  await page.waitForTimeout(400);
}
const aktiv = (page) => page.evaluate(() => window.SynirHilfe.aktiv);
async function klick(page, sel) {
  await page.locator(sel).first().click();
  await page.waitForTimeout(350);
}

(async () => {
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 880 } });
  const fehler = [];
  page.on('pageerror', e => fehler.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(URL);
  await page.waitForTimeout(400);

  console.log('\n── Inhalt');
  {
    const r = await page.evaluate(() => {
      const ids = window.SynirHilfe.ids;
      const bilder = [];
      for (const k of window.SynirHilfeInhalt) for (const a of k.abschnitte) { if (a.bild) bilder.push(a.bild); if (a.bild2) bilder.push(a.bild2); }
      return { ids, doppelt: ids.length !== new Set(ids).size, bilder, kap: window.SynirHilfeInhalt.length,
               masse: Object.keys(window.SynirHilfeMasse || {}) };
    });
    ok('acht Kapitel', r.kap === 8, r.kap);
    ok('mindestens 45 Abschnitte', r.ids.length >= 45, r.ids.length);
    ok('keine ID doppelt', !r.doppelt);
    const fehlt = r.bilder.filter(b => !fs.existsSync(path.join(__dirname, '..', 'hilfe', b + '.webp')));
    ok('jedes Bild liegt in hilfe/', !fehlt.length, fehlt.join(', '));
    const ohneMass = r.bilder.filter(b => !r.masse.includes(b));
    ok('jedes Bild hat seine Maße (hilfe/masse.js)', !ohneMass.length, ohneMass.join(', '));
  }

  console.log('\n── Öffnen und schließen');
  ok('Knopf „Hilfe" oben rechts sichtbar', await page.locator('#hilfeBtn').isVisible());
  {
    const b = await page.locator('#hilfeBtn').boundingBox();
    ok('… ganz rechts in der Kopfzeile', b.x + b.width > 1440 - 40 && b.y < 80, JSON.stringify(b));
  }
  await klick(page, '#hilfeBtn');
  ok('Hilfe ist offen', await page.locator('#hilfe').isVisible());
  {
    const g = await page.evaluate(() => {
      const h = document.querySelector('#hilfe').getBoundingClientRect();
      const m = document.querySelector('.main').getBoundingClientRect();
      return { hl: h.left, hw: h.width, mr: m.right, top: h.top, kopf: document.querySelector('.top').getBoundingClientRect().bottom };
    });
    ok('liegt über der rechten Hälfte', Math.abs(g.hl - 720) < 2 && Math.abs(g.hw - 720) < 2, JSON.stringify(g));
    ok('beginnt unter der Kopfzeile', Math.abs(g.top - g.kopf) < 2, JSON.stringify(g));
    ok('die Arbeitsfläche rückt zur Seite', g.mr <= g.hl + 1, JSON.stringify(g));
  }
  ok('Inhaltsverzeichnis mit 8 Kapiteln', await page.locator('.hi-toc-k').count() === 8);
  ok('Suchfeld hat den Fokus', await page.evaluate(() => document.activeElement.classList.contains('hi-such-in')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Esc schließt', !(await page.locator('#hilfe').isVisible()));
  ok('… und die Fläche ist wieder ganz breit', await page.evaluate(() => document.querySelector('.main').getBoundingClientRect().right > 1400));
  await page.keyboard.press('F1');
  await page.waitForTimeout(200);
  ok('F1 öffnet', await page.locator('#hilfe').isVisible());

  console.log('\n── Inhaltsverzeichnis');
  await klick(page, '.hi-toc-kb:has-text("Software")');
  ok('Kapitel-Klick springt zum ersten Abschnitt', await aktiv(page) === 'desktop', await aktiv(page));
  ok('nur das aktuelle Kapitel ist aufgeklappt', await page.locator('.hi-toc-a[data-geh="firewall"]').isHidden());
  await klick(page, '.hi-toc-kb:has-text("Einstellen")');
  ok('Kapitel „Einstellen" klappt auf', await page.locator('.hi-toc-a[data-geh="firewall"]').isVisible());
  await klick(page, '.hi-toc-a[data-geh="firewall"]');
  ok('Abschnitt-Klick springt', await aktiv(page) === 'firewall', await aktiv(page));
  {
    const r = await page.evaluate(() => {
      const t = document.querySelector('.hi-text').getBoundingClientRect();
      const a = document.querySelector('#hi-firewall').getBoundingClientRect();
      return a.top - t.top;
    });
    ok('… und der Abschnitt steht oben', r > -4 && r < 40, r);
  }
  await page.waitForTimeout(700);
  ok('… und leuchtet kurz auf', await page.locator('#hi-firewall.is-blitz').count() === 1);

  console.log('\n── Suche');
  await page.locator('.hi-such-in').fill('firewall');
  await page.waitForTimeout(200);
  {
    const erst = await page.locator('.hi-erg').first().getAttribute('data-geh');
    ok('„firewall" → zuerst der Abschnitt Firewall', erst === 'firewall', erst);
    ok('Treffer gezählt', /Treffer/.test(await page.locator('.hi-treffer').textContent()));
    ok('Wort hervorgehoben', await page.locator('.hi-erg mark').count() > 0);
  }
  await page.locator('.hi-such-in').fill('tastenkürzel');
  await page.waitForTimeout(200);
  ok('Umlaute gefunden (tastenkürzel)', await page.locator('.hi-erg').count() > 0);
  await page.locator('.hi-such-in').fill('zertifikat https');
  await page.waitForTimeout(200);
  ok('zwei Wörter: alle müssen passen', (await page.locator('.hi-erg').first().getAttribute('data-geh')) === 'zertstelle');
  await page.locator('.hi-such-in').press('Enter');
  await page.waitForTimeout(400);
  ok('Enter springt zum ersten Treffer', await aktiv(page) === 'zertstelle', await aktiv(page));
  ok('… und die Suche ist geleert', await page.locator('.hi-such-in').inputValue() === '');
  await page.locator('.hi-such-in').fill('xyzqq');
  await page.waitForTimeout(200);
  ok('nichts gefunden sagt es', await page.locator('.hi-leer').count() === 1);
  await page.locator('.hi-such-in').fill('');
  await page.waitForTimeout(150);
  ok('leere Suche zeigt wieder alles', await page.locator('.hi-alles').isVisible());

  console.log('\n── Klick auf ein Ding: die Hilfe springt hin (Entwurf)');
  await laden(page, 'ii3');
  await tipp(page, 'Heimrouter 1');
  ok('Heimrouter auf der Fläche → Heimrouter', await aktiv(page) === 'heimrouter', await aktiv(page));
  ok('… und das Kärtchen ist trotzdem aufgegangen', await page.locator('.karte:not([hidden])').count() > 0);
  await klick(page, '.karte:not([hidden]) .karte-mehr');
  ok('„Mehr ›" → Gerätefenster', await aktiv(page) === 'kaertchen', await aktiv(page));
  await klick(page, '.karte:not([hidden]) [data-k="reiter"][data-seite="lan"]');
  ok('Reiter LAN → Heimrouter', await aktiv(page) === 'heimrouter', await aktiv(page));
  await klick(page, '.karte:not([hidden]) input[data-k="wlan"]');
  ok('Haken WLAN → WLAN', await aktiv(page) === 'wlan', await aktiv(page));
  await klick(page, '.karte:not([hidden]) input[data-k="wlan"]');   // wieder an
  await klick(page, '.karte:not([hidden]) [data-k="dhcpseite"]');
  ok('DHCP-Server einrichten → DHCP', await aktiv(page) === 'dhcp', await aktiv(page));
  await klick(page, '.karte:not([hidden]) [data-k="zurueck"]');
  await klick(page, '.karte:not([hidden]) [data-k="reiter"][data-seite="allgemein"]');
  await klick(page, '.karte:not([hidden]) [data-k="fwseite"]');
  ok('Knopf Firewall → Firewall', await aktiv(page) === 'firewall', await aktiv(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Esc außerhalb der Hilfe lässt sie offen', await page.locator('#hilfe').isVisible());
  await tipp(page, 'Handy 1');
  ok('Handy → Handy', await aktiv(page) === 'handy', await aktiv(page));
  await page.keyboard.press('Escape');
  await tipp(page, 'Class Wide Web 1');
  ok('cww → cww', await aktiv(page) === 'cww', await aktiv(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await klick(page, '[data-add="switch"]');
  ok('Switch in der Leiste → Switch', await aktiv(page) === 'switch', await aktiv(page));
  await klick(page, '[data-tool="kabel"]');
  ok('Werkzeug Kabel → Kabel', await aktiv(page) === 'kabel', await aktiv(page));
  await klick(page, '[data-tool="zeiger"]');
  await klick(page, '[data-zoom="fit"]');
  ok('Einpassen → Fläche', await aktiv(page) === 'flaeche', await aktiv(page));
  await klick(page, '#dateiBtn');
  ok('Menü Datei → Datei', await aktiv(page) === 'dateimenue', await aktiv(page));
  await klick(page, '#szenarioBtn');
  ok('Szenarien … → Szenarien', await aktiv(page) === 'szenarien', await aktiv(page));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await klick(page, '#ansichtBtn');
  await klick(page, '#subBtn');
  ok('Ansicht → Subnetze', await aktiv(page) === 'subnetze', await aktiv(page));
  await page.keyboard.press('Escape');

  console.log('\n── Klick auf ein Ding (Aktion)');
  await klick(page, '.mbtn[data-modus="aktion"]');
  ok('Moduswechsel → Entwurf und Aktion', await aktiv(page) === 'modi', await aktiv(page));
  await page.waitForTimeout(800);
  await tipp(page, 'Laptop 1');
  ok('Laptop → Endgerät', await aktiv(page) === 'endgeraet', await aktiv(page));
  await page.waitForSelector('.dt.is-front', { timeout: 3000 }).catch(() => {});
  {
    const r = await page.evaluate(() => {
      const d = document.querySelector('.dt.is-front').getBoundingClientRect();
      const h = document.querySelector('#hilfe').getBoundingClientRect();
      return { dr: d.right, hl: h.left };
    });
    ok('der Bildschirm liegt NEBEN der Hilfe, nicht darunter', r.dr <= r.hl + 1, JSON.stringify(r));
  }
  await klick(page, '.dt.is-front .dt-app[data-app="terminal"]');
  ok('Terminal-Symbol → Terminal', await aktiv(page) === 'terminal', await aktiv(page));
  await klick(page, '.dt.is-front [data-dock="browser"]');
  ok('Schnellzugriff Browser → Webbrowser', await aktiv(page) === 'browser', await aktiv(page));
  await klick(page, '.dt.is-front [data-dock="terminal"]');
  await klick(page, '.dt.is-front .dt-fenster');
  ok('Klick ins offene Terminal → Terminal', await aktiv(page) === 'terminal', await aktiv(page));
  await klick(page, '.dt.is-front .dt-x');
  await klick(page, '#play');
  ok('Pause → Uhr und Tempo', await aktiv(page) === 'uhr', await aktiv(page));
  await klick(page, '#play');
  await klick(page, '#ansichtBtn');
  await klick(page, '#traceBtn');
  ok('Ansicht → Mitschnitt', await aktiv(page) === 'mitschnitt', await aktiv(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await klick(page, '#traceClear');
  ok('Leiste Mitschnitt → Mitschnitt', await aktiv(page) === 'mitschnitt', await aktiv(page));
  await tipp(page, 'Heimrouter 1');
  ok('Heimrouter in der Aktion → Heimrouter', await aktiv(page) === 'heimrouter', await aktiv(page));
  await klick(page, '.dt.is-front .dt-win');
  ok('Klick in die Leseansicht → Router & Co. in der Aktion', await aktiv(page) === 'ohneschirm', await aktiv(page));

  console.log('\n── Was ein Klick NICHT tut');
  {
    await page.evaluate(() => window.SynirHilfe.springe('uhr'));
    const b = await page.locator('.stage').boundingBox();
    await page.mouse.click(b.x + 20, b.y + b.height - 20);
    await page.waitForTimeout(300);
    ok('leerer Tisch: die Hilfe bleibt, wo sie ist', await aktiv(page) === 'uhr', await aktiv(page));
    const q = await punkt(page, 'Laptop 2');
    await page.mouse.move(q.x, q.y); await page.mouse.down();
    await page.mouse.move(q.x + 60, q.y + 40, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    ok('Ziehen ist kein Klick', await aktiv(page) === 'uhr', await aktiv(page));
  }

  console.log('\n── Zeigen und Bilder');
  await page.evaluate(() => window.SynirHilfe.springe('router'));
  await page.waitForTimeout(300);
  await klick(page, '#hi-heimrouter .hi-zeig');
  ok('„Zeigen" umrandet das Gerät', await page.locator('.hi-ring').count() >= 1);
  await page.evaluate(() => window.SynirHilfe.springe('ueberblick'));
  await page.waitForTimeout(500);
  await klick(page, '#hi-ueberblick .hi-fig-b');
  ok('Bild antippen vergrößert es', await page.locator('.hi-lupe:not([hidden])').count() === 1);
  {
    const nw = await page.evaluate(() => document.querySelector('.hi-lupe img').naturalWidth);
    ok('… und das Bild ist geladen', nw > 100, nw);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok('Esc schließt erst das Bild', await page.locator('.hi-lupe:not([hidden])').count() === 0 && await page.locator('#hilfe').isVisible());
  ok('jedes Kapitel-Bild hat feste Maße', await page.evaluate(() =>
    [...document.querySelectorAll('.hi-fig img')].every(i => i.getAttribute('width') && i.getAttribute('height'))));

  console.log('\n── Tasten in der Hilfe gehören der Hilfe');
  {
    const vorher = await page.evaluate(() => window.SIM.netz.list().length);
    await page.locator('.hi-such-in').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    ok('Strg+A, Entf im Suchfeld löschen kein Gerät', await page.evaluate(() => window.SIM.netz.list().length) === vorher);
  }

  console.log('\n── Rollen');
  await page.evaluate(() => { document.body.dataset.rolle = 'participant'; });
  ok('auf dem Tablet der Klasse kein Knopf', !(await page.locator('#hilfeBtn').isVisible()));
  await page.evaluate(() => { document.body.dataset.rolle = 'presenter'; });
  ok('bei der Lehrkraft ist er da', await page.locator('#hilfeBtn').isVisible());

  console.log('\n── Breite ziehen');
  const hb = () => page.evaluate(() => ({ w: document.querySelector('#hilfe').getBoundingClientRect().width,
    main: document.querySelector('.main').getBoundingClientRect().right, cls: document.body.className,
    toc: document.querySelector('.hi-toc').getBoundingClientRect().width }));
  async function ziehe(sel, nachX) {
    const g = await page.locator(sel).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(nachX, g.y + g.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  await ziehe('.hi-griff', 840);
  {
    const r = await hb();
    ok('am linken Rand schmaler ziehen', Math.abs(r.w - 600) < 6, JSON.stringify(r));
    ok('… die Arbeitsfläche wächst mit', Math.abs(r.main - 840) < 8, JSON.stringify(r));
  }
  await ziehe('.hi-griff', 5);
  {
    const r = await hb();
    ok('ganz nach links: die Hilfe ist eine ganze Seite', r.w >= 1439, JSON.stringify(r));
    ok('… und liegt über SYNIR, statt es auf null zu quetschen', /hilfe-voll/.test(r.cls) && r.main > 1400, JSON.stringify(r));
  }
  await ziehe('.hi-griff', 1300);
  {
    const r = await hb();
    ok('ganz nach rechts: nicht schmaler als 300 px', Math.abs(r.w - 300) < 3, JSON.stringify(r));
  }
  await page.reload();
  await page.waitForTimeout(400);
  await klick(page, '#hilfeBtn');
  ok('die Breite bleibt nach dem Neuladen', Math.abs((await hb()).w - 300) < 3, (await hb()).w);
  await page.locator('.hi-griff').dblclick();
  await page.waitForTimeout(300);
  ok('Doppelklick auf den Rand: zurück zur halben Breite', Math.abs((await hb()).w - 720) < 3, (await hb()).w);
  await klick(page, '.hi-breit');
  ok('Knopf ⤢: ganze Breite', (await hb()).w >= 1439);
  await klick(page, '.hi-breit');
  ok('… noch einmal: zurück', Math.abs((await hb()).w - 720) < 3, (await hb()).w);

  console.log('\n── Verzeichnis schmal');
  await klick(page, '.hi-toc-klapp');
  {
    const r = await hb();
    ok('Knopf ‹ macht das Verzeichnis schmal', r.toc < 60, r.toc);
    ok('… nur noch Nummern: Kapitelnamen weg', await page.locator('.hi-toc-kt').first().isHidden());
  }
  await klick(page, '.hi-toc-kb:has-text("5")');
  ok('… und die Nummern springen', (await aktiv(page)) === 'mitschnitt', await aktiv(page));
  await klick(page, '.hi-toc-klapp');
  ok('Knopf › macht es wieder breit', (await hb()).toc > 150);
  {
    const vor = (await hb()).toc;
    const t = await page.locator('.hi-toc-griff').boundingBox();
    await ziehe('.hi-toc-griff', t.x + 80);
    ok('Griff zwischen Verzeichnis und Text: breiter ziehen', (await hb()).toc > vor + 60, (await hb()).toc);
    await ziehe('.hi-toc-griff', t.x - 160);
    ok('weit nach links: rastet auf „nur Nummern" ein', (await hb()).toc < 60, (await hb()).toc);
    await page.locator('.hi-toc-griff').dblclick();
    await page.waitForTimeout(250);
    ok('Doppelklick: Vorgabe', Math.abs((await hb()).toc - vor) < 3, (await hb()).toc);
  }

  console.log('\n── Schmaler Bildschirm');
  await page.setViewportSize({ width: 520, height: 1000 });
  await page.waitForTimeout(400);
  {
    const g = await page.evaluate(() => document.querySelector('#hilfe').getBoundingClientRect().width);
    ok('unter 900 px nimmt die Hilfe die ganze Breite', g >= 518, g);
  }
  ok('das Verzeichnis klappt über den Knopf „Inhalt" auf', await page.locator('.hi-toc-auf').isVisible());
  await klick(page, '.hi-toc-auf');
  ok('… und zeigt sich', await page.locator('.hi-toc').isVisible());
  await klick(page, '.hi-toc-kb:has-text("Software")');
  ok('ein Kapitel lässt das Verzeichnis offen', await page.locator('.hi-toc').isVisible());
  await klick(page, '.hi-toc-a[data-geh="dns"]');
  ok('… ein Eintrag springt und klappt es wieder zu', await aktiv(page) === 'dns' && !(await page.locator('.hi-toc').isVisible()));

  ok('keine Fehler auf der Seite', !fehler.length, fehler.join(' | '));
  await browser.close();
  console.log('\n' + pass + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
