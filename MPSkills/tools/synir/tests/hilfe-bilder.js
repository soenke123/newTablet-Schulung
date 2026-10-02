/* ══════════════════════════════════════════════════════════════
   SYNIR — tests/hilfe-bilder.js  ·  Die Bilder der Hilfe
   ══════════════════════════════════════════════════════════════
   Macht alle Bildschirmfotos, die in der Hilfe für Lehrkräfte
   (js/hilfe.js, js/hilfe-inhalt.js) stehen, und legt sie als
   WebP nach hilfe/. Jedes Bild ist ein Ausschnitt der ECHTEN
   Oberfläche — wer an der Oberfläche etwas ändert, lässt dieses
   Skript noch einmal laufen, und die Hilfe zeigt das Neue.

   Aufruf (aus diesem Ordner oder der Wurzel):
     node MPSkills/tools/synir/tests/hilfe-bilder.js           alle
     node MPSkills/tools/synir/tests/hilfe-bilder.js web mail  nur diese

   Braucht playwright-core (oder playwright) und ImageMagick
   (`convert`, für WebP). Chrome: CHROME_PATH, sonst das von
   Playwright.
   ══════════════════════════════════════════════════════════════ */
'use strict';

let pw;
for (const n of ['playwright-core', 'playwright']) {
  try { pw = require(n); break; } catch (e) { /* weiter */ }
}
if (!pw) { console.error('playwright-core nicht gefunden (NODE_PATH setzen).'); process.exit(1); }

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');
const OUT = path.join(__dirname, '..', 'hilfe');
const TMP = path.join(require('os').tmpdir(), 'synir-hilfe-bilder');
const NUR = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

/* Breite, mit der ein Bild höchstens in der Hilfe steht (Pixel,
   doppelt für scharfe Bildschirme). Größere werden verkleinert. */
const MAXB = 1100;

async function main() {
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  Seitenfehler: ' + e.message));
  page.on('dialog', d => d.accept());

  let n = 0;
  const S = {
    page,
    /* Ein Bild: ein Element, eine Liste von Elementen (ihr
       gemeinsamer Rahmen) oder ein Rechteck. `rand` gibt Luft. */
    async foto(name, was, opt) {
      if (NUR.length && !NUR.includes(name)) return;
      opt = opt || {};
      let box;
      if (was && typeof was === 'object' && 'x' in was) box = was;
      else {
        const sels = Array.isArray(was) ? was : [was];
        box = await page.evaluate((sels) => {
          let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (const s of sels) for (const el of document.querySelectorAll(s)) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
            x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
          }
          return x1 === Infinity ? null : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
        }, sels);
      }
      if (!box) { console.log('  FEHLT ' + name + ' (' + was + ')'); return; }
      const r = opt.rand == null ? 8 : opt.rand;
      const vp = page.viewportSize();
      const x = Math.max(0, box.x - r), y = Math.max(0, box.y - r);
      const clip = {
        x, y,
        width: Math.min(vp.width - x, box.width + 2 * r),
        height: Math.min(vp.height - y, (opt.maxH || box.height) + 2 * r)
      };
      const png = path.join(TMP, name + '.png');
      await page.screenshot({ path: png, clip });
      const webp = path.join(OUT, name + '.webp');
      execFileSync('convert', [png, '-resize', MAXB + 'x>', '-quality', '82', '-define', 'webp:method=6', webp]);
      n++;
      console.log('  ok   ' + name + '  ' + Math.round(fs.statSync(webp).size / 1024) + ' KB');
    },
    wollen: (...namen) => !NUR.length || namen.some(x => NUR.includes(x))
  };

  for (const schritt of SCHRITTE) {
    if (schritt.bilder && !S.wollen(...schritt.bilder)) continue;
    await page.goto(URL);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(URL);
    await page.waitForTimeout(400);
    try { await schritt.tu(S, page); }
    catch (e) { console.log('  FEHLER in ' + (schritt.bilder || []).join(',') + ': ' + e.message.split('\n')[0]); }
  }
  await browser.close();
  masseSchreiben();
  console.log(n + ' Bilder nach ' + path.relative(process.cwd(), OUT));
}

/* Breite und Höhe jedes Bildes, damit die Hilfe den Platz schon vor
   dem Laden kennt: sonst springt der Text beim Nachladen, und ein
   Sprung zu einem Abschnitt landet daneben. */
function masseSchreiben() {
  const m = {};
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.webp')).sort()) {
    const [w, h] = execFileSync('identify', ['-format', '%w %h', path.join(OUT, f)]).toString().trim().split(' ').map(Number);
    m[f.slice(0, -5)] = [w, h];
  }
  fs.writeFileSync(path.join(OUT, 'masse.js'),
    '/* Erzeugt von tests/hilfe-bilder.js — nicht von Hand ändern. Breite × Höhe je Bild. */\n'
    + 'window.SynirHilfeMasse = ' + JSON.stringify(m).replace(/\],/g, '],\n  ').replace('{', '{\n  ').replace(/\}$/, '\n}') + ';\n');
}

/* ─── Hilfen, wie eine Hand ─────────────────────────────────── */

async function laden(page, key) {
  await page.evaluate((k) => {
    const s = window.SIM.eingebaut(k);
    window.SIM.szenarioLaden({ id: 'builtin:' + k, titel: s.titel, aufgabe: s.aufgabe, netz: s.netz });
  }, key);
  await page.waitForTimeout(300);
  if (await page.locator('#aufgabe:not([hidden])').count()) await page.locator('#aufgabeMin').click();
  await einpassen(page);
}
async function einpassen(page) {
  await page.locator('[data-zoom="fit"]').click();
  await page.waitForTimeout(250);
}
async function punkt(page, name) {
  return page.evaluate((nm) => {
    const n = window.SIM.netz.list().find(x => x.name === nm || x.id === nm);
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = n.x; q.y = n.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return { x: t.x, y: t.y };
  }, name);
}
async function tipp(page, name, strg) {
  const q = await punkt(page, name);
  if (strg) await page.keyboard.down('Control');
  await page.mouse.click(q.x, q.y);
  if (strg) await page.keyboard.up('Control');
  await page.waitForTimeout(350);
}
async function modus(page, m) {
  await page.locator('.mbtn[data-modus="' + m + '"]').click();
  await page.waitForTimeout(350);
}
async function tempo(page, stufe) {
  await page.evaluate((s) => {
    const el = document.getElementById('speed');
    el.value = String(s); el.dispatchEvent(new Event('input', { bubbles: true }));
  }, stufe);
}
async function menue(page, sel) {
  const l = page.locator(sel);
  if (!(await l.isVisible())) {
    const ansicht = ['#subBtn', '#traceBtn', '#themeBtn', '#binBtn', '#wltBtn', '#lernBtn', '#bilderBtn'].includes(sel);
    await page.locator(ansicht ? '#ansichtBtn' : '#dateiBtn').click();
  }
  await l.click();
  await page.waitForTimeout(300);
}
async function app(page, id) {
  const kein = await page.locator('.dt.is-front.dt--kein').count() > 0;
  if (kein) { await page.locator('.dt.is-front .dt-reg-b[data-app="' + id + '"]').click(); return; }
  const offen = await page.locator('.dt.is-front .dt-fenster:not([hidden])').count() > 0;
  await page.locator('.dt.is-front ' + (offen ? '[data-dock="' + id + '"]' : '.dt-app[data-app="' + id + '"]')).click();
  await page.waitForTimeout(400);
}
async function terminal(page, befehl, warten) {
  const inp = page.locator('.dt.is-front .term-i input, .dt.is-front input.term-in, #termInput').first();
  await inp.fill(befehl);
  await inp.press('Enter');
  await page.waitForTimeout(warten || 300);
}
/* Bis das Netz seine Adressen hat: im Turbo laufen lassen. */
async function anlaufen(page, ms) {
  await tempo(page, 4);
  await page.waitForTimeout(ms || 2500);
  await tempo(page, 2);
}
async function reiter(page, k) {
  const b = page.locator('.karte:not([hidden]) [data-k="reiter"][data-seite="' + k + '"]').first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(250); }
}
/* Eine Überschrift im Kärtchen samt allem bis zur nächsten. */
async function abschnitt(page, wurzel, titel) {
  return page.evaluate(({ wurzel, titel }) => {
    const box = document.querySelector(wurzel);
    const secs = [...box.querySelectorAll('.k-sec')];
    const i = secs.findIndex(s => s.textContent.trim().toLowerCase().startsWith(titel.toLowerCase()));
    if (i < 0) return null;
    secs[i].scrollIntoView({ block: 'start' });
    const r0 = secs[i].getBoundingClientRect();
    const nach = secs[i + 1];
    let unten;
    if (nach) unten = nach.getBoundingClientRect().top - 6;
    else unten = box.getBoundingClientRect().bottom;
    const rb = box.getBoundingClientRect();
    return { x: rb.left + 10, y: r0.top, width: rb.width - 20, height: Math.min(unten, rb.bottom) - r0.top };
  }, { wurzel, titel });
}

/* ═══ Die Bilder ═════════════════════════════════════════════ */

const SCHRITTE = [
  {
    bilder: ['ueberblick', 'kopf', 'leiste', 'ginfo', 'auftrag', 'zoom'],
    async tu(S, page) {
      await laden(page, 'ii3');
      await page.locator('#aufgabeKachel').click();
      await page.waitForTimeout(300);
      await S.foto('ueberblick', { x: 0, y: 0, width: 1440, height: 880 }, { rand: 0 });
      await S.foto('auftrag', '#aufgabe', { maxH: 420 });
      await page.locator('#aufgabeMin').click();
      await S.foto('kopf', '.top', { rand: 0 });
      await S.foto('leiste', '.tools-bau', { rand: 4 });
      await S.foto('zoom', '.rail-zoom', { rand: 4 });
      await page.locator('[data-add="heimrouter"]').click();
      await page.waitForTimeout(300);
      await S.foto('ginfo', '#ginfo');
    }
  },
  {
    bilder: ['uhr', 'modus-aktion'],
    async tu(S, page) {
      await laden(page, 'ii3');
      await modus(page, 'aktion');
      await S.foto('uhr', ['#play', '#stepBtn', '#resetBtn', '.speedbox'], { rand: 8 });
      await S.foto('modus-aktion', '.top-c', { rand: 4 });
    }
  },
  {
    bilder: ['menue-datei', 'menue-szenarien'],
    async tu(S, page) {
      await page.locator('#dateiBtn').click();
      await page.waitForTimeout(250);
      await S.foto('menue-datei', ['#dateiBtn', '#dateiBtn + .mn-pop']);
      await page.locator('#szenarioBtn').click();
      await page.waitForTimeout(300);
      await S.foto('menue-szenarien', ['#szenarioPop']);
    }
  },
  {
    bilder: ['menue-ansicht'],
    async tu(S, page) {
      await page.locator('#ansichtBtn').click();
      await page.waitForTimeout(250);
      await S.foto('menue-ansicht', ['#ansichtBtn', '#ansichtBtn + .mn-pop']);
    }
  },
  {
    /* Jedes Gerät einmal, auf der Fläche, im Entwurf. */
    bilder: ['geraete'],
    async tu(S, page) {
      await laden(page, 'ii3');
      await S.foto('geraete', '.nf-nodes', { rand: 30 });
    }
  },
  {
    bilder: ['karte-klein', 'karte-gross', 'karte-adresse'],
    async tu(S, page) {
      await laden(page, 'i2');
      const erster = await page.evaluate(() => window.SIM.netz.list().find(n => n.kind === 'host').name);
      await tipp(page, erster);
      await S.foto('karte-klein', '.karte:not([hidden])');
      await page.locator('.karte:not([hidden]) .karte-mehr').first().click();
      await page.waitForTimeout(300);
      await S.foto('karte-gross', '.karte:not([hidden])', { maxH: 760 });
    }
  },
  {
    bilder: ['router-karte', 'routing', 'firewall', 'firewall-zeichen'],
    async tu(S, page) {
      await laden(page, 'ii6');
      const r = await page.evaluate(() => window.SIM.netz.list().find(n => n.kind === 'router').name);
      await tipp(page, r);
      await reiter(page, 'karten');
      await S.foto('router-karte', '.karte:not([hidden])');
      await page.locator('.karte:not([hidden]) .karte-mehr').first().click();
      await page.waitForTimeout(300);
      await reiter(page, 'allgemein');
      const b = await abschnitt(page, '.karte:not([hidden]) .karte-b', 'Automatisches Routing');
      if (b) await S.foto('routing', b, { rand: 2, maxH: 420 });
      const fk = page.locator('.karte:not([hidden]) [data-k="fwseite"]').first();
      if (await fk.count()) {
        await fk.click(); await page.waitForTimeout(300);
        await S.foto('firewall', '.karte:not([hidden])', { maxH: 640 });
        await page.locator('.karte:not([hidden]) .k-fw-an input, .karte:not([hidden]) input[data-k="fwan"]').first().check();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const q = await punkt(page, r);
        await S.foto('firewall-zeichen', { x: q.x - 90, y: q.y - 70, width: 180, height: 150 }, { rand: 0 });
      }
    }
  },
  {
    bilder: ['heimrouter-lan', 'nat', 'wlan', 'dhcp-server'],
    async tu(S, page) {
      await laden(page, 'ii3');
      await tipp(page, 'Heimrouter 1');
      await page.locator('.karte:not([hidden]) .karte-mehr').first().click();
      await page.waitForTimeout(300);
      await reiter(page, 'lan');
      await S.foto('heimrouter-lan', '.karte:not([hidden])', { maxH: 700 });
      const w = await abschnitt(page, '.karte:not([hidden]) .karte-b', 'WLAN');
      if (w) await S.foto('wlan', w, { rand: 2 });
      await reiter(page, 'allgemein');
      const nat = await abschnitt(page, '.karte:not([hidden]) .karte-b', 'NAT');
      if (nat) await S.foto('nat', { x: nat.x, y: nat.y, width: nat.width, height: 380 }, { rand: 2 });
      await reiter(page, 'lan');
      const d = page.locator('.karte:not([hidden]) [data-k="dhcpseite"]').first();
      if (await d.count()) {
        await d.scrollIntoViewIfNeeded(); await d.click(); await page.waitForTimeout(300);
        await S.foto('dhcp-server', '.karte:not([hidden])', { maxH: 700 });
      }
    }
  },
  {
    bilder: ['cww-karte'],
    async tu(S, page) {
      await laden(page, 'ii3');
      await tipp(page, 'Class Wide Web 1');
      await page.locator('.karte:not([hidden]) .karte-mehr').first().click();
      await page.waitForTimeout(300);
      await S.foto('cww-karte', '.karte:not([hidden])', { maxH: 640 });
    }
  },
  {
    bilder: ['kabel'],
    async tu(S, page) {
      await laden(page, 'i2');
      const m = await page.evaluate(() => {
        const c = window.SIM.netz.cables ? null : null;
        const el = document.querySelector('.nf-cable');
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.click(m.x, m.y);
      await page.waitForTimeout(350);
      await S.foto('kabel', '.karte:not([hidden])');
    }
  },
  {
    bilder: ['subnetze', 'binaer'],
    async tu(S, page) {
      await laden(page, 'ii8');
      await menue(page, '#subBtn');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await S.foto('subnetze', { x: 0, y: 88, width: 1440, height: 792 }, { rand: 0 });
      await menue(page, '#subBtn');
      await page.keyboard.press('Escape');
      await menue(page, '#binBtn');
      await page.keyboard.press('Escape');
      const h = await page.evaluate(() => window.SIM.netz.list().find(n => n.kind === 'host').name);
      await tipp(page, h);
      await S.foto('binaer', '.karte:not([hidden])', { maxH: 520 });
    }
  },
  {
    bilder: ['wlt'],
    async tu(S, page) {
      await laden(page, 'ii6');
      await menue(page, '#wltBtn');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await S.foto('wlt', '#wlt');
    }
  },
  {
    bilder: ['desktop', 'terminal', 'mitschnitt', 'mitschnitt-schichten', 'kompakt', 'switch-kompakt', 'lerninfo'],
    async tu(S, page) {
      await laden(page, 'ii8');
      await modus(page, 'aktion');
      await anlaufen(page, 4000);
      await menue(page, '#traceBtn');
      await page.keyboard.press('Escape');
      await page.locator('#traceClear').click();
      const h = await page.evaluate(() => window.SIM.netz.list().find(n => n.kind === 'host').name);
      await tipp(page, h);
      await S.foto('desktop', '.dt.is-front');
      await app(page, 'terminal');
      await terminal(page, 'ping www.schule.de');
      await tempo(page, 4);
      await page.waitForTimeout(5000);
      await tempo(page, 2);
      await S.foto('terminal', '.dt.is-front');
      await page.locator('.dt.is-front .dt-x').click();
      await page.waitForTimeout(300);
      await S.foto('mitschnitt', '.trace', { maxH: 330 });
      await page.locator('#traceModus').click();
      await page.waitForTimeout(300);
      await S.foto('mitschnitt-schichten', '.trace', { maxH: 330 });
      await page.locator('#traceModus').click();
      await menue(page, '#traceBtn');
      await page.keyboard.press('Escape');
      const r = await page.evaluate(() => window.SIM.netz.list().find(n => n.kind === 'router').name);
      await tipp(page, r);
      await S.foto('kompakt', '.dt.is-front', { maxH: 700 });
      await page.locator('.dt.is-front .dt-x').click();
      await menue(page, '#lernBtn');
      await page.keyboard.press('Escape');
      const sw = await page.evaluate(() => window.SIM.netz.list().find(n => n.kind === 'switch').name);
      await tipp(page, sw);
      await S.foto('switch-kompakt', '.dt.is-front', { maxH: 600 });
      await page.locator('.dt.is-front .dt-x').click();
      await tipp(page, r);
      await S.foto('lerninfo', '.dt.is-front', { maxH: 760 });
    }
  },
  {
    bilder: ['handy', 'software', 'dateien', 'editor', 'browser', 'webserver', 'dns', 'mail', 'mailserver'],
    async tu(S, page) {
      await laden(page, 'ii3');
      await modus(page, 'aktion');
      await anlaufen(page, 3000);
      await tipp(page, 'Handy 1');
      await S.foto('handy', '.dt.is-front');
      await page.locator('.dt.is-front .dt-x').click();
      await tipp(page, 'Heimserver');
      await app(page, 'software');
      await S.foto('software', '.dt.is-front');
      await app(page, 'dns');
      await S.foto('dns', '.dt.is-front');
      await app(page, 'webserver');
      await S.foto('webserver', '.dt.is-front');
      await app(page, 'mailserver');
      await S.foto('mailserver', '.dt.is-front');
      await app(page, 'dateien');
      await S.foto('dateien', '.dt.is-front');
      await page.locator('.dt.is-front .dt-x').click();
      await tipp(page, 'Laptop 1');
      await app(page, 'browser');
      const ip = await page.evaluate(() => window.SIM.netz.list().find(n => n.name === 'Heimserver').nics[0].ip);
      const adr = page.locator('.dt.is-front input').first();
      await adr.fill(ip || '192.168.1.20');
      await adr.press('Enter');
      await tempo(page, 4); await page.waitForTimeout(3000); await tempo(page, 2);
      await S.foto('browser', '.dt.is-front');
      await app(page, 'mail');
      await S.foto('mail', '.dt.is-front');
    }
  },
  {
    bilder: ['streaming', 'zertstelle', 'vpnserver', 'vpnclient'],
    async tu(S, page) {
      await laden(page, 'ii3');
      await modus(page, 'aktion');
      await anlaufen(page, 2500);
      await tipp(page, 'Heimserver');
      // Streaming und Webserver wollen beide Port 80: den Webserver erst beenden.
      await app(page, 'webserver');
      const halt = page.locator('.dt.is-front #wsStart');
      if (await halt.count() && /Beenden/.test(await halt.textContent())) await halt.click();
      await app(page, 'software');
      for (const id of ['streamingserver', 'zertstelle', 'vpnserver']) {
        const k = page.locator('.dt.is-front [data-sw="' + id + '"]').first();
        if (await k.count()) { await k.click(); await page.waitForTimeout(250); }
      }
      for (const [id, bild] of [['streamingserver', 'streaming'], ['zertstelle', 'zertstelle'], ['vpnserver', 'vpnserver']]) {
        if (await page.locator('.dt.is-front [data-dock="' + id + '"]').count()) {
          await app(page, id);
          await S.foto(bild, '.dt.is-front');
        }
      }
      await page.locator('.dt.is-front .dt-x').click();
      await tipp(page, 'Laptop 1');
      await app(page, 'software');
      const k = page.locator('.dt.is-front [data-sw="vpnclient"]').first();
      if (await k.count()) { await k.click(); await page.waitForTimeout(250); }
      if (await page.locator('.dt.is-front [data-dock="vpnclient"]').count()) {
        await app(page, 'vpnclient');
        await S.foto('vpnclient', '.dt.is-front');
      }
    }
  }
];

main().catch(e => { console.error(e); process.exit(1); });
