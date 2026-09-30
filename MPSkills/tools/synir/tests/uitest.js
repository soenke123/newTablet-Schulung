/* Prüfstand für die Oberfläche: echter Browser, echte Seite. */
/* playwright-core wird nicht mitgeliefert. Erst dort suchen, wo es im
   Schwesterprojekt schon liegt, sonst normal aufloesen. */
const PW_ALT = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt/node_modules/playwright-core';
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(PW_ALT); }
const path = require('path');
const fs = require('fs');

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').split(path.sep).join('/');
const OUT = __dirname;   // Bilder landen neben den Tests

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); }
                          else { fail++; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); } };

/* ─── Ein Szenario über das Menü laden ─────────────────────────
   Seit dem Einzug in MPSkills ist das Auswahlfeld ein eigenes Menü
   (js/szmenue.js): aufklappen, Eintrag antippen. Die Nachfrage
   „Das aktuelle Netz wird ersetzt" beantwortet der Dialog-Zuhörer
   unten mit Ja. */
/* Seit 2026-09-29 stehen Neu, Sichern, Szenarien, Dark Mode, Subnetze
   und Mitschnitt in den Menüs „Datei" / „Ansicht & Tools". Ist der
   Eintrag nicht sichtbar, klappt der Prüfstand erst sein Menü auf —
   wie eine Hand. */
async function mk(page, sel) {
  const l = page.locator(sel);
  if (!(await l.isVisible())) {
    const ansicht = ['#subBtn', '#traceBtn', '#themeBtn', '#binBtn'].includes(sel);
    await page.locator(ansicht ? '#ansichtBtn' : '#dateiBtn').click();
  }
  await l.click();
}

/* ─── Den Mitschnitt auf- oder zumachen ───────────────────────
   Seit 2026-09-28 ein Knopf oben neben „Subnetze", nur im
   Aktionsmodus; die Leiste unten gibt es nur, solange er an ist. */
async function mitschnitt(page, an) {
  const ist = await page.evaluate(() => document.body.classList.contains('trace-open'));
  if (ist !== an) await mk(page, '#traceBtn');
}

/* Das Kärtchen groß oder klein — „Mehr ›" ist ein Umschalter, und
   der Wunsch bleibt für das nächste Kärtchen stehen. */
async function gross(page, an) {
  const ist = await page.evaluate(() => document.querySelector('#karte').classList.contains('is-mehr'));
  if (ist !== an) { await page.locator('#karteMehr').click(); await page.waitForTimeout(250); }
}

/* Die acht Szenarien vor der Gliederung in Sek I / Sek II stehen nicht mehr im
   Menü. Viele Prüfungen brauchen aber genau ihre Netze — sie liegen als Daten
   unter tests/fixtures und werden hier über dieselbe Ladefunktion aufgelegt,
   die auch das Menü benutzt (SIM.szenarioLaden). Alles andere geht wie eine
   Hand über das Menü. */
const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'alt-szenarien.json'), 'utf8'));
async function szenarioWaehlen(page, key) {
  const f = FIXTURES[key];
  if (f) {
    await page.evaluate(({ k, f }) => window.SIM.szenarioLaden(
      { id: 'builtin:' + k, titel: f.titel, aufgabe: f.aufgabe, netz: f.netz }), { k: key, f });
    return;
  }
  await mk(page, '#szenarioBtn');
  await page.locator('.szm-item[data-id="builtin:' + key + '"] .szm-name').click();
}

/* ─── Ein Gerät aus der Leiste auf die Fläche ziehen ───────────
   Anklicken legt seit der Umstellung KEIN Gerät mehr an — es
   erklärt das Gerät. Der Prüfstand muss also dieselbe Geste machen
   wie eine Hand: aufsetzen, ziehen, loslassen.

   Abgelegt wird auf dem Platz, den die Fläche selbst für frei
   hält (freeSpot) — sonst landet das Gerät im Verlauf der Prüfung
   irgendwann auf einem anderen. */
async function geraetZiehen(page, kind) {
  const ziel = await page.evaluate(() => {
    const s = window.SIM.flaeche.freeSpot();
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = s.x; q.y = s.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return { x: t.x, y: t.y };
  });
  const b = await page.locator('[data-add="' + kind + '"]').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(ziel.x, ziel.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  return ziel;
}

/* ─── Ein Programm auf dem Bildschirm aufschlagen ──────────────
   So, wie eine Hand es täte, und der Weg hängt davon ab, was
   gerade offen ist:

     nichts offen   über die KACHEL auf der Tapete
     Fenster offen  über den SCHNELLZUGRIFF unten — die Kacheln
                    liegen darunter und sind nicht anklickbar
     ohne Schirm    über den REITER (Router, Switch, Heimrouter
                    haben weder Kacheln noch Schnellzugriff)

   ⚠️ Vorher stand überall `[data-app="…"]`.click()`. Das ging,
   solange das Fenster NEBEN den Kacheln lag; seit es darauf
   liegt, lief Playwright in „intercepts pointer events" — und
   zwar zu Recht: ein Mensch kann die Kachel dort auch nicht
   treffen. Der Schnellzugriff ist genau für diesen Fall gebaut. */
async function programmAuf(page, id) {
  const kein = await page.locator('#desktop.dt--kein').count() > 0;
  if (kein) { await page.locator('.dt-reg-b[data-app="' + id + '"]').click(); return; }
  const offen = await page.locator('#dtFenster:not([hidden])').count() > 0;
  await page.locator(offen ? '[data-dock="' + id + '"]'
                           : '.dt-app[data-app="' + id + '"]').click();
}

/* Die Mitte eines Geräts in Bildschirmpunkten — für alles, was
   nicht klicken, sondern ziehen (oder eben nicht ziehen) will. */
async function geraetPunkt(page, i) {
  return page.evaluate((k) => {
    const n = window.SIM.netz.list()[k];
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = n.x; q.y = n.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return { x: t.x, y: t.y, id: n.id };
  }, i);
}

/* ─── Wie viele Marken einer Art trägt diese Kachel? ───────────
   Die Marken unter der Kachel sagen, was ein Gerät TUT: DHCP, DNS,
   Web, Mail. Geprüft wird über die Fläche und nicht über das
   Modell, denn genau der Weg dazwischen kann ausfallen — ein
   „Starten", das die Marke erst beim nächsten beliebigen
   Neuzeichnen hinschreibt, sieht aus wie ein Knopf ohne Wirkung.

   ⚠️ Eingeschränkt auf `.nf`: die Subnetzliste benutzt `data-node`
   für ihre Chips ebenfalls, und die zählten sonst mit. */
async function markenAn(page, name, art) {
  return page.evaluate(([nm, a]) => {
    const n = window.SIM.netz.byName(nm);
    if (!n) return -1;
    const g = document.querySelector('.nf [data-node="' + n.id + '"]');
    return g ? g.querySelectorAll('.nf-' + a).length : -1;
  }, [name, art]);
}

(async () => {
  // Erst das installierte Chrome, sonst ein Chromium, dessen Pfad in
  // CHROME_PATH steht (etwa im Container ohne Chrome).
  const browser = await pw.chromium.launch({ channel: 'chrome' })
    .catch(() => pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }));
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

  /* ⚠️ Der Startwert wird festgenagelt. Seit dem 2026-09-27
     würfelt jeder Wechsel in den Aktionsmodus einen neuen (aus
     der Uhr, siehe `neuerStartwert` in app.js) — gewollt, damit
     die DHCP-Vergabe für eine Klasse nicht vorhersehbar ist. Für
     einen Prüfstand wäre das Glückssache: „E1 hat 192.168.1.104"
     stimmte dann mal und mal nicht.

     Dass Zufall UND Wiederholbarkeit zusammengehen, prüft der
     kopflose Prüfstand (Abschnitt „Die Vergabe ist nicht
     vorhersehbar"). Hier wird nur festgehalten. */
  await page.addInitScript(() => { window.NETSIM_SEED = 12345; });

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept().catch(() => {}));

  /* Erst mit leerem Speicher anfangen. Playwright gibt zwar je
     Start einen frischen Kontext, aber der Test prüft weiter
     unten ausdrücklich, dass ein Stand das Neuladen überlebt —
     und ein Rest von vorher würde genau die ersten Prüfungen
     („Startnetz steht da": 3 Geräte) unbemerkt umkippen. */
  await page.goto(URL);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(700);

  console.log('\n── Aufbau ──────────────────────────────────────────');
  ok('keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 3).join(' | '));
  // Der erste Besuch beginnt mit I.1: zwei Endgeräte, nichts verkabelt.
  ok('Startnetz steht da (I.1)', await page.evaluate(() => window.SIM.netz.count) === 2);
  ok('zwei Geräte gezeichnet', await page.locator('.nf-node').count() === 2);
  ok('kein Kabel gezeichnet', await page.locator('.nf-cable').count() === 0);
  ok('Startauftrag ist I.1', /I\.1/.test(await page.locator('#aufgabeTitel').textContent()));
  /* Alles Weitere in diesem Prüfstand setzt das kleine Netz aus zwei
     Endgeräten und einem Switch voraus (das frühere Startnetz). Es liegt als
     Datei unter tests/fixtures und wird hier aufgelegt. */
  await szenarioWaehlen(page, 'zwei');
  await page.waitForTimeout(300);
  ok('Testnetz: drei Geräte, zwei Kabel', await page.evaluate(() => window.SIM.netz.count) === 3
     && await page.locator('.nf-cable').count() === 2);
  ok('Auftrag sichtbar', await page.locator('#aufgabe').isVisible());

  // Angefangen wird im Entwurf, und dort steht die Uhr still.
  ok('startet im Entwurfsmodus', await page.evaluate(() => window.SIM.modus) === 'entwurf');
  ok('Uhr steht im Entwurf', await page.evaluate(() => !window.SIM.engine.running));
  // Eine Anzeige der Simulationszeit gibt es nicht mehr — sie war
  // im Unterricht eine zappelnde Zahl ohne Frage dahinter.
  ok('keine Zeitanzeige in der Kopfzeile', await page.locator('.clockbox').count() === 0);
  ok('Tempo steht auf „normal"', (await page.locator('#speedLabel').textContent()) === 'normal');
  ok('Werkzeugleiste ist im Entwurf da', await page.locator('[data-add="host"]').isVisible());
  ok('Fenster ist zu, solange nichts ausgewählt ist',
     !(await page.locator('#karte').isVisible()));

  /* Auf der Kachel steht das Kürzel, darunter die Adresse — und
     die Adresse ist größer als früher der Name war. Sie ist das,
     was in einer Netzstunde verglichen wird, und auf dem Beamer
     war sie mit 12 px aus der letzten Reihe nicht zu lesen. */
  const kuerzel = await page.locator('.nf-kurz').allTextContents();
  ok('auf der Fläche stehen Kürzel, nicht Namen',
     kuerzel.every(t => /^(E|S|R|SW)\d+$/.test(t)), kuerzel.join(' '));
  ok('die drei Startgeräte heißen E1, E2, SW1',
     kuerzel.slice().sort().join(' ') === 'E1 E2 SW1', kuerzel.join(' '));
  ok('kein ausgeschriebener Name mehr auf der Fläche',
     await page.locator('.nf-name').count() === 0);
  ok('der volle Name steht als Kurzhinweis am Gerät',
     (await page.locator('.nf-node title').first().textContent()).includes('Endgerät 1'));
  /* Beide groß genug für den Beamer. Der Gerätename stand früher
     mit 13 px da, die Adresse mit 12 — aus der letzten Reihe war
     das nichts. */
  ok('Kürzel und Adresse sind groß genug', await page.evaluate(() => {
    const st = document.createElement('style');
    const k = parseFloat(getComputedStyle(document.querySelector('.nf-kurz')).fontSize);
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    probe.setAttribute('class', 'nf-ip');
    document.querySelector('.nf').appendChild(probe);
    const i = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove(); st.remove();
    return k >= 14 && i >= 14;
  }));

  console.log('\n── Kärtchen neben dem Gerät ────────────────────────');
  await page.locator('.nf-node').first().click();
  await page.waitForTimeout(200);
  ok('Fenster geht auf', await page.locator('#karte').isVisible());
  ok('im Kopf steht das Kürzel', (await page.locator('#karteKurz').textContent()) === 'E1',
     await page.locator('#karteKurz').textContent());
  ok('darunter der ausgeschriebene Name',
     (await page.locator('#karteName').textContent()) === 'Endgerät 1',
     await page.locator('#karteName').textContent());
  ok('der Name ist kein Eingabefeld mehr',
     await page.locator('#karteName input').count() === 0);
  ok('eine Netzwerkkarte im Fenster', await page.locator('#karteBody .k-nic').count() === 1);
  ok('die MAC-Adresse steht da, ohne danach zu fragen',
     /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test((await page.locator('#karteBody .k-ro').first().textContent()).trim()),
     await page.locator('#karteBody .k-ro').first().textContent());

  /* Klein heißt klein: genau die fünf Zeilen, die Filius in
     JHostKonfiguration oben hat (MAC · IP · Maske · Gateway ·
     Domain Name System). DHCP, Tabellen und „Gerät löschen"
     gehören hinter „Mehr" — sonst ist das kleine Fenster keines. */
  ok('die kleine Ansicht hat fünf Zeilen',
     await page.locator('#karteBody .k-f').count() === 5,
     String(await page.locator('#karteBody .k-f').count()));
  ok('kein DHCP in der kleinen Ansicht',
     await page.locator('#karteBody [data-k="dhcp"]').count() === 0);
  ok('keine Tabellen in der kleinen Ansicht',
     await page.locator('#karteBody .k-tab').count() === 0);
  ok('kein „Gerät löschen" in der kleinen Ansicht',
     await page.locator('#karteBody [data-k="del"]').count() === 0);
  /* Klein steht dort „DNS" — neben dem Feld wäre die volle
     Beschriftung länger als das Fenster breit. Ausgeschrieben
     steht sie in der großen Ansicht (weiter unten geprüft). */
  ok('das letzte Feld ist das für den Namensdienst',
     (await page.locator('#karteBody .k-f-l').last().textContent()).includes('DNS'),
     await page.locator('#karteBody .k-f-l').last().textContent());

  /* Beschriftung LINKS, Feld rechts: eine Zeile je Angabe. Stand
     die Beschriftung über dem Feld, war das kleine Fenster bei
     fünf Angaben höher als das Netz darunter. */
  ok('Beschriftung und Feld stehen auf einer Zeile', await page.evaluate(() => {
    const f = document.querySelector('#karteBody input.f[data-f="ip"]');
    const l = f.closest('.k-f').querySelector('.k-f-l');
    const a = l.getBoundingClientRect(), b = f.getBoundingClientRect();
    return b.left > a.right - 1 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 6;
  }));

  /* Das Kärtchen muss NEBEN dem Gerät liegen, nicht darauf. Genau
     dieser Fehler hat schon einmal Rechner 1 des ersten Szenarios
     unanklickbar gemacht — damals war es die Auftragskarte. */
  const lage = await page.evaluate(() => {
    const k = document.querySelector('#karte').getBoundingClientRect();
    const g = document.querySelector('.nf-node').getBoundingClientRect();
    const ueber = !(k.right < g.left || k.left > g.right || k.bottom < g.top || k.top > g.bottom);
    const stage = document.querySelector('.stage').getBoundingClientRect();
    return { ueber, drin: k.left >= stage.left - 1 && k.right <= stage.right + 1
                        && k.top >= stage.top - 1 && k.bottom <= stage.bottom + 1 };
  });
  ok('Fenster liegt nicht auf dem Gerät', !lage.ueber);
  ok('Fenster bleibt ganz auf der Fläche', lage.drin);

  // IP eintragen — muss sofort wirken, ohne Übernehmen-Knopf
  await page.locator('#karteBody input.f[data-f="ip"]').fill('192.168.1.10');
  await page.waitForTimeout(200);
  ok('IP kommt sofort im Modell an',
     await page.evaluate(() => window.SIM.netz.list()[0].nics[0].ip) === '192.168.1.10');
  ok('IP steht auf der Fläche',
     (await page.locator('.nf-ip').first().textContent()).includes('192.168.1.10'));

  /* Netzteil und Geräteteil in zwei Farben — im Kärtchen und auf
     der Fläche dieselbe Aufteilung. Das ist der Begriff, an dem in
     der Mittelstufe alles hängt, und aus vier Zahlen mit Punkten
     ist er nicht abzulesen. */
  const farben = await page.evaluate(() => {
    const netzT = [...document.querySelectorAll('#karteBody .k-ipin .ipp--netz')].map(e => e.textContent);
    const hostT = [...document.querySelectorAll('#karteBody .k-ipin .ipp--host')].map(e => e.textContent);
    const svgNetz = [...document.querySelectorAll('.nf-ip-netz')].map(e => e.textContent);
    const c1 = getComputedStyle(document.querySelector('#karteBody .ipp--netz')).color;
    const c2 = getComputedStyle(document.querySelector('#karteBody .ipp--host')).color;
    return { netzT, hostT, svgNetz, c1, c2 };
  });
  ok('/24: drei Blöcke gehören zum Netz', farben.netzT.join('.') === '192.168.1', farben.netzT.join('.'));
  ok('/24: ein Block gehört zum Gerät', farben.hostT.join('.') === '10', farben.hostT.join('.'));
  ok('Netz- und Geräteteil haben verschiedene Farben', farben.c1 !== farben.c2, farben.c1 + ' / ' + farben.c2);
  ok('auch auf der Fläche ist der Netzteil eingefärbt',
     farben.svgNetz.slice(0, 3).join('.') === '192.168.1', farben.svgNetz.join('.'));
  ok('und auf der Fläche liegt derselbe getönte Grund darunter',
     await page.locator('.nf-ipbg-netz').count() > 0);

  /* Die Adresse steht EINMAL im Fenster: im Feld. Sie stand
     einmal zusätzlich als farbige Zeile darunter — zweimal
     dieselbe Zahl untereinander, und das Fenster dafür eine
     Zeile höher. */
  ok('die Adresse steht nur einmal im Fenster — im Feld', await page.evaluate(() => {
    const box = document.querySelector('#karteBody');
    // Der sichtbare Text des Fensters ist die Schicht IM Feld.
    // Mehr als einmal darf die Adresse darin nicht vorkommen.
    const treffer = ((box.innerText || '').match(/192\.168\.1\.10/g) || []).length;
    return box.querySelector('input.f[data-f="ip"]').value === '192.168.1.10'
        && treffer <= 1 && box.querySelectorAll('.k-ipshow').length === 0;
  }));

  /* Die farbige Schicht liegt HINTER dem Feld und muss Zeichen
     für Zeichen unter den getippten liegen. Geht die Schrift der
     beiden auseinander, steht die Färbung neben der Zahl. */
  ok('die Färbung liegt deckungsgleich unter dem Feld', await page.evaluate(() => {
    const f = document.querySelector('#karteBody input.f[data-f="ip"]');
    const s = f.closest('.k-f-in').querySelector('.k-ipin');
    const a = getComputedStyle(f), b = getComputedStyle(s);
    const inh = s.getBoundingClientRect(), fr = f.getBoundingClientRect();
    return a.fontFamily === b.fontFamily && a.fontSize === b.fontSize
        && a.fontWeight === b.fontWeight
        && Math.abs(inh.left + 9 - (fr.left + 10)) < 1.5;
  }));

  /* Beim Tippen muss zu sehen sein, was man tippt. Das Feld selbst
     schreibt durchsichtig, die Zeichen kommen aus der Schicht
     darunter — und solange die Adresse unvollständig war, stand
     dort gar nichts: die Zahlen erschienen erst mit dem letzten
     Zeichen. Gefärbt wird erst, wenn es etwas zu färben gibt. */
  await page.locator('#karteBody input.f[data-f="ip"]').fill('192.168.');
  await page.waitForTimeout(200);
  ok('eine halb getippte Adresse ist zu sehen',
     (await page.locator('#karteBody .k-ipin').first().textContent()) === '192.168.',
     await page.locator('#karteBody .k-ipin').first().textContent());
  ok('und sie ist noch ungefärbt — die Grenze steht ja noch nicht fest',
     await page.locator('#karteBody .k-ipin .ipp--offen').count() === 1
     && await page.locator('#karteBody .k-ipin .ipp--netz').count() === 0);

  /* „Zu welcher Netzwerkkarte gehört welches Kabel?" — von der
     Karte aus gefragt. Wer sie anfasst, sieht draußen ihr Kabel
     aufleuchten; im Formular steht sonst nur „Kabel zu Switch 1",
     und bei drei Switches hilft das wenig. */
  await page.locator('#karteBody .k-nic').first().hover();
  await page.waitForTimeout(200);
  ok('die angefasste Netzwerkkarte lässt ihr Kabel aufleuchten',
     await page.locator('.nf-cable.is-betont').count() === 1,
     String(await page.locator('.nf-cable.is-betont').count()));
  ok('und es ist genau das Kabel dieser Karte', await page.evaluate(() => {
    const g = document.querySelector('.nf-cable.is-betont');
    return !!g && g.getAttribute('data-cable') === window.SIM.netz.list()[0].nics[0].cable;
  }));
  /* Auch beim Tippen — und dann darf die Maus längst woanders
     sein: der Schreibstrich sagt, woran gerade gearbeitet wird. */
  await page.locator('#karteBody input.f[data-f="ip"]').focus();
  await page.mouse.move(4, 4);
  await page.waitForTimeout(200);
  ok('beim Tippen im Adressfeld bleibt es hell',
     await page.locator('.nf-cable.is-betont').count() === 1);
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);
  ok('lässt man die Karte los, geht es wieder aus',
     await page.locator('.nf-cable.is-betont').count() === 0);

  // Ungültige Adresse → sofortige Rückmeldung
  await page.locator('#karteBody input.f[data-f="ip"]').fill('192.168.1.0');
  await page.waitForTimeout(200);
  ok('Netzadresse wird sofort angemeckert', await page.locator('#karteBody .k-nic.has-err').count() === 1);
  ok('und der Grund steht daneben, ohne das Feld zu verlassen',
     (await page.locator('#karteBody .k-err').first().textContent()).includes('Adresse des Netzes'),
     await page.locator('#karteBody .k-err').first().textContent());

  /* Der Fokus muss im Feld bleiben. Vorher baute sich das ganze
     Formular beim Verlassen neu auf — wer mit der Tabulatortaste
     von der Adresse zur Maske wollte, landete im Nichts. */
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  ok('mit Tab geht es zur Netzmaske weiter',
     await page.evaluate(() => document.activeElement && document.activeElement.dataset.f) === 'mask',
     await page.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 60)));

  await page.locator('#karteBody input.f[data-f="ip"]').fill('192.168.1.10');
  await page.waitForTimeout(200);
  ok('und die Meldung verschwindet wieder',
     await page.locator('#karteBody .k-nic.has-err').count() === 0);
  /* Auch die Warnzeile im Kopf. Sie stand einmal noch da, während
     im Feld darunter längst eine Adresse stand — zwei Aussagen
     über dasselbe Gerät, und beide im selben Fenster. */
  ok('und die Warnzeile im Kopf gleich mit',
     !(await page.locator('#karteWarn').isVisible()));

  // Zweiten Rechner einrichten
  await page.locator('.nf-node').nth(1).click();
  await page.waitForTimeout(200);
  await page.locator('#karteBody input.f[data-f="ip"]').fill('192.168.1.11');
  await page.locator('#karteBody input.f[data-f="ip"]').blur();
  await page.waitForTimeout(200);
  ok('beide Endgeräte haben jetzt eine Adresse',
     await page.evaluate(() => window.SIM.netz.list().filter(n => n.nics[0].ip).length) === 2);
  ok('kein Warnzeichen mehr', await page.locator('.nf-badge').count() === 0);

  /* ── Sieht man den Modus, ohne den Schalter zu suchen? ────────
     Die Frage ist nicht, ob das Attribut am <body> umspringt —
     das prüft die Zeile darunter. Sie ist, ob sich auf dem Bild
     etwas ändert, und zwar an zwei Stellen: am Streifen über der
     Kopfleiste (für den, der hinschaut) und am Raster auf der
     Fläche (für den, der auf sein Gerät schaut). */
  const optik = () => page.evaluate(() => {
    const top   = getComputedStyle(document.querySelector('.top'));
    const tools = getComputedStyle(document.querySelector('.tools'));
    return {
      streifen: top.borderTopColor,
      breite:   parseFloat(top.borderTopWidth),
      tint:     top.backgroundImage,
      // ⚠️ Die RECHTE Kante, seit die Werkzeugleiste senkrecht am
      // linken Rand steht. Sie ist weiter dieselbe Linie: die
      // Grenze zwischen dem, was das Programm anbietet, und der
      // Fläche, auf der man arbeitet.
      kante:    tools.borderRightColor,
      // .modus davor: der Subnetzknopf ist auch ein .mbtn und kann
      // ebenfalls „an" sein.
      knopf:    getComputedStyle(document.querySelector('.modus .mbtn.is-on')).backgroundColor,
      /* ⚠️ Das Raster liegt seit dem zoombaren Feld IM SVG und
         nicht mehr als CSS-Muster auf der Bühne: ein Muster auf
         der Bühne bliebe stehen, während die Geräte darüber
         wandern. Geprüft wird dieselbe Aussage an der neuen
         Stelle — im Entwurf sichtbar, in der Aktion nicht. */
      raster:   parseFloat(getComputedStyle(document.querySelector('.nf-raster')).opacity)
    };
  });
  const oEnt = await optik();
  ok('die Kopfleiste trägt einen Streifen in der Modusfarbe',
     oEnt.breite >= 3 && /^rgba?\(/.test(oEnt.streifen), JSON.stringify(oEnt));
  ok('und einen Hauch davon in der Fläche', oEnt.tint !== 'none', oEnt.tint);
  ok('im Entwurf liegt das Raster auf dem Tisch', oEnt.raster === 1, String(oEnt.raster));
  ok('der eingeschaltete Schalter trägt dieselbe Farbe wie der Streifen',
     oEnt.knopf === oEnt.streifen, oEnt.knopf + ' / ' + oEnt.streifen);

  console.log('\n── Umschalten auf Aktion ───────────────────────────');
  await page.locator('[data-modus="aktion"]').click();
  /* ⚠️ Lang genug, dass die Übergänge DURCH sind. `optik()` liest
     gleich Farben ab, die über .22 s wandern (Streifen, Tönung,
     Raster). Bei 400 ms traf die Messung auf einer ausgelasteten
     Maschine gelegentlich die Mitte des Übergangs — und meldete
     dann einen Fehler, den es nicht gab. */
  await page.waitForTimeout(700);
  ok('Modus ist Aktion', await page.evaluate(() => window.SIM.modus) === 'aktion');

  const oAkt = await optik();
  ok('der Streifen wechselt die Farbe', oAkt.streifen !== oEnt.streifen,
     oEnt.streifen + ' → ' + oAkt.streifen);
  ok('die Werkzeugleiste wechselt ihre Kante mit', oAkt.kante !== oEnt.kante);
  ok('der Hauch in der Kopfleiste wechselt mit', oAkt.tint !== oEnt.tint);
  ok('in der Aktion ist das Raster weg', oAkt.raster === 0, String(oAkt.raster));
  ok('und der Schalter zeigt jetzt die Aktionsfarbe',
     oAkt.knopf === oAkt.streifen, oAkt.knopf + ' / ' + oAkt.streifen);
  ok('Uhr läuft jetzt', await page.evaluate(() => window.SIM.engine.running));
  ok('Tempo-Regler ist sichtbar', await page.locator('.speedbox').isVisible());
  ok('Geräteleiste ist weg', !(await page.locator('[data-add="host"]').isVisible()));
  // Im Aktionsmodus tritt die Geräteoberfläche an die Stelle des
  // Kärtchens: derselbe Klick darf nicht zwei Fenster öffnen.
  ok('Fenster ist im Aktionsmodus zu', !(await page.locator('#karte').isVisible()));

  console.log('\n── Geräteoberfläche und Ping ───────────────────────');
  await page.locator('.nf-node').first().click();
  await page.waitForTimeout(250);
  ok('Oberfläche des Geräts geht auf', await page.locator('#desktop').isVisible());
  /* Dieselbe Regel wie im Entwurf: dasselbe Gerät noch einmal
     antippen macht wieder zu. Und ein Wisch über die Fläche schlägt
     gar nichts auf — im laufenden Netz ist ein versehentlich
     geöffnetes Gerätefenster das, was den Blick auf die Pakete
     verdeckt. */
  await page.locator('.nf-node').first().click();
  await page.waitForTimeout(250);
  ok('noch einmal antippen macht sie wieder zu',
     !(await page.locator('#desktop').isVisible()));
  const wischVor = await page.evaluate(() =>
    ({ x: window.SIM.netz.list()[0].x, y: window.SIM.netz.list()[0].y }));
  const gAkt = await geraetPunkt(page, 0);
  await page.mouse.move(gAkt.x, gAkt.y);
  await page.mouse.down();
  await page.mouse.move(gAkt.x + 80, gAkt.y + 50, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  ok('ein Wisch über das Gerät schlägt in der Aktion nichts auf',
     !(await page.locator('#desktop').isVisible()));
  ok('und verschiebt es auch nicht — in der Aktion wird nicht gebaut',
     await page.evaluate((v) => {
       const n = window.SIM.netz.list()[0];
       return n.x === v.x && n.y === v.y;
     }, wischVor));
  await page.locator('.nf-node').first().click();
  await page.waitForTimeout(250);
  ok('und danach geht sie ganz normal wieder auf',
     await page.locator('#desktop').isVisible());
  ok('Kürzel und Name stehen im Fenster',
     (await page.locator('#dtName').textContent()) === 'E1 · Endgerät 1',
     await page.locator('#dtName').textContent());
  /* Terminal und Software-Installation. „Was ich gelernt habe" ist
     weg, weil dieselben Tabellen im Inspektor sowieso offen
     standen — und „Einstellungen" seit dem 2026-09-26, weil die
     Adresse eines Rechners wie in Filius im Entwurf eingestellt
     wird und nicht von einem Programm auf seinem Bildschirm. */
  ok('drei Programme angeboten', await page.locator('.dt-app').count() === 3,
     String(await page.locator('.dt-app').count()));
  ok('„Was ich gelernt habe" gibt es nicht mehr',
     await page.locator('[data-app="info"]').count() === 0);
  ok('und die Einstellungen sind keine Kachel mehr',
     await page.locator('.dt-app[data-app="einstellungen"]').count() === 0);
  ok('die Software-Installation liegt bereit',
     await page.locator('[data-app="software"]').count() === 1);

  await programmAuf(page, 'terminal');
  await page.waitForTimeout(250);
  ok('Terminal offen', await page.locator('#term.is-open').count() === 1);
  ok('Terminal steckt im Gerätefenster',
     await page.evaluate(() => !!document.querySelector('#dtWin #term')));
  ok('Terminal nennt das Gerät', (await page.locator('#termTitle').textContent()).includes('Endgerät'));

  /* Auf Turbo stellen, damit der Ping nicht ewig dauert. Turbo ist
     seit der Umeichung das Doppelte der Echtzeit und nicht mehr das
     Zwanzigfache — vier Pings brauchen damit gut zwei Sekunden. */
  await page.locator('#speed').fill('4');
  await page.locator('#termInput').fill('ping 192.168.1.11');
  await page.locator('#termInput').press('Enter');
  await page.waitForTimeout(3600);

  const out = await page.locator('#termOut').textContent();
  ok('Ping bekommt Antworten', (out.match(/Antwort von/g) || []).length >= 3, out.slice(-220));
  ok('Zusammenfassung erscheint', /angekommen/.test(out));
  ok('Erfolgszeilen sind grün markiert', await page.locator('.tl--ok').count() >= 3);

  console.log('\n── Mitschnitt ──────────────────────────────────────');
  await mitschnitt(page, true);
  await page.waitForTimeout(400);
  const trCount = await page.locator('.tr').count();
  ok('Mitschnitt hat Zeilen', trCount > 5, String(trCount));
  const alle = await page.locator('.tr-i').allTextContents();
  ok('ARP-Frage steht drin', alle.some(t => /Wer hat 192\.168\.1\.11/.test(t)));
  ok('Ping-Anfrage steht drin', alle.some(t => /Ping-Anfrage/.test(t)));
  ok('Ping-Antwort steht drin', alle.some(t => /Ping-Antwort/.test(t)));

  // Aufklappen: die Schichten
  await page.locator('.tr').filter({ hasText: 'Ping-Anfrage' }).first().click();
  await page.waitForTimeout(250);
  const lagen = await page.locator('.tr-lay-h').allTextContents();
  ok('drei Schichten aufgeklappt', lagen.length === 3, lagen.join(' / '));
  ok('Schicht 2 ist Ethernet', /Schicht 2\b/.test(lagen[0]) && lagen[0].includes('Ethernet'), lagen[0]);
  ok('Schicht 3 ist IP', /Schicht 3\b/.test(lagen[1]) && lagen[1].includes('IP'), lagen[1]);
  /* ⚠️ Schicht 3, nicht 4 — und die Nummer wird hier MITGEPRÜFT,
     weil sie bis zum 2026-09-26 falsch war. ICMP ist kein
     Transportprotokoll: keine Ports, keine Verbindung, und es
     meldet Fehler der Vermittlung. Ohne die Nummer in der
     Bedingung hätte diese Prüfung den Fehler nie gesehen — sie
     stand auf `includes('ICMP')` und war grün. */
  ok('Schicht 3 ist auch ICMP (nicht 4)',
     /Schicht 3\b/.test(lagen[2]) && lagen[2].includes('ICMP'), lagen[2]);
  const felder = await page.locator('.tr-det .tr-f').allTextContents();
  ok('TTL wird erklärt', felder.some(f => /TTL/.test(f) && /Router/.test(f)), felder.join(' | ').slice(0, 200));

  // Filter
  await mitschnitt(page, true);
  await page.locator('[data-proto="ARP"]').click();
  await page.waitForTimeout(250);
  const protos = await page.locator('.tr-p').allTextContents();
  ok('ARP-Filter greift', protos.length > 0 && protos.every(p => p === 'ARP'), protos.join(','));
  await mitschnitt(page, true);
  await page.locator('[data-proto=""]').click();
  await page.waitForTimeout(200);

  /* ─── Richtung ────────────────────────────────────────────────
     ⚠️ Zuerst den Gerätefilter lösen. An dieser Stelle der Prüfung
     ist die Geräteoberfläche offen (der Ping lief in ihrem
     Terminal), und ein offenes Gerät schränkt den Mitschnitt seit
     dem 2026-09-26 ein UND stellt die Richtung auf „beide". Das
     ist so gewollt — aber dieser Abschnitt will die Voreinstellung
     prüfen, und die gilt für das ganze Netz. Ohne diese Zeile
     prüfte er den Zustand, den der Abschnitt davor hinterlassen
     hat, und das ist keine Prüfung, sondern ein Zufall. */
  if (await page.locator('#traceGeraet').isVisible()) {
    await page.locator('#traceGeraet').click();
    await page.waitForTimeout(250);
  }
  ok('ohne gewähltes Gerät ist das Chip weg',
     await page.locator('#traceGeraet').isHidden());

  /* Voreingestellt nur Gesendetes, denn über das ganze Netz
     stünde sonst jeder Rahmen mehrfach da. Der Knopf sagt, wie
     viele er verschweigt — ein Filter, der nicht zeigt, wie viel
     er wegnimmt, ist eine Falle. */
  const dirVor = await page.locator('#traceDir').textContent();
  ok('der Richtungsknopf steht auf „gesendet" und nennt die Zahl',
     /^↑ gesendet \+\d+/.test(dirVor.trim()), dirVor);
  const nurRaus = await page.locator('.tr-d').allTextContents();
  ok('und es stehen nur Abgänge da (↑)',
     nurRaus.length > 0 && nurRaus.every(p => p.trim() === '↑'), nurRaus.join(''));

  await page.locator('#traceDir').click();
  await page.waitForTimeout(300);
  const beide = await page.locator('.tr-d').allTextContents();
  ok('umgeschaltet kommen die Ankünfte dazu (↓)',
     beide.some(p => p.trim() === '↓') && beide.some(p => p.trim() === '↑'),
     beide.join(''));
  ok('und es sind mehr Zeilen als vorher', beide.length > nurRaus.length,
     beide.length + ' vs ' + nurRaus.length);
  ok('der Knopf nennt jetzt „beide"',
     (await page.locator('#traceDir').textContent()).includes('beide'));

  /* ─── Ansicht „Schichten" ─────────────────────────────────────
     ⭐ Filius' Datenaustausch-Fenster. Die Aussage, für die es
     diese Ansicht gibt: dieselben zwei Spalten tragen auf jeder
     Schicht etwas anderes — MAC, dann IP, dann Portnummer. */
  await page.locator('#traceModus').click();
  await page.waitForTimeout(350);
  ok('die Schichtenansicht ist da', await page.locator('.trs:not(.trs--kopf)').count() > 5,
     String(await page.locator('.trs').count()));
  const spalten = await page.locator('.trs--kopf span').allTextContents();
  ok('mit den Spalten von Filius',
     ['Nr.', 'Zeit', 'Gerät', 'Quelle', 'Ziel', 'Protokoll', 'Schicht']
       .every(s => spalten.some(k => k.trim() === s)), spalten.join(' | '));
  const schichten = await page.locator('.trs:not(.trs--kopf) .trs-s').allTextContents();
  ok('und den vier Schichtnamen von Filius',
     schichten.every(s => ['Netzzugang', 'Vermittlung', 'Transport', 'Anwendung'].includes(s.trim()))
     && schichten.includes('Netzzugang') && schichten.includes('Vermittlung'),
     [...new Set(schichten)].join(','));
  ok('jede Schicht ist farbig hinterlegt',
     await page.locator('.trs.l--netzzugang').count() > 0
     && await page.locator('.trs.l--vermittlung').count() > 0);

  /* ⭐ Der Kern: eine Ping-Anfrage, ihre Ethernet-Zeile trägt
     MAC-Adressen und ihre IP-Zeile IP-Adressen. */
  const pingSchichten = await page.evaluate(() => {
    const zeilen = [...document.querySelectorAll('.trs:not(.trs--kopf)')];
    const i = zeilen.findIndex(z => /Ping-Anfrage/.test(z.textContent));
    if (i < 1) return null;
    // Die Ethernet-Zeile desselben Rahmens steht darüber.
    const nr = zeilen[i].dataset.n;
    return zeilen.filter(z => z.dataset.n === nr).map(z => ({
      quelle: z.querySelector('.trs-q').textContent,
      schicht: z.querySelector('.trs-s').textContent
    }));
  });
  /* DREI Zeilen: Ethernet, IP, ICMP. Filius zeigt für einen Ping
     nur zwei — es lässt die IP-Zeile weg und hängt die TTL an die
     ICMP-Zeile (`Lauscher.java:401`, `:435`). Wir trennen sie,
     weil die TTL im IP-Kopf steht und nicht im ICMP-Paket, und
     weil ein Kind sonst lernt, ICMP habe eine TTL. */
  ok('ein Ping hat drei Schichtenzeilen: Ethernet, IP, ICMP',
     pingSchichten && pingSchichten.length === 3, JSON.stringify(pingSchichten));
  ok('⭐ Netzzugang zeigt die MAC, Vermittlung die IP-Adresse',
     pingSchichten && /^[0-9a-f]{2}:/.test(pingSchichten[0].quelle)
     && /^192\.168\./.test(pingSchichten[1].quelle),
     JSON.stringify(pingSchichten));
  ok('und ICMP steht bei der Vermittlung, nicht beim Transport',
     pingSchichten && pingSchichten[2].schicht.trim() === 'Vermittlung',
     pingSchichten && pingSchichten[2].schicht);

  // Zurück in die kompakte Ansicht, damit der Rest der Prüfung
  // die gewohnten Zeilen vorfindet.
  await page.locator('#traceModus').click();
  await page.locator('#traceDir').click();
  await page.waitForTimeout(300);
  ok('zurück in der Zeilenansicht', await page.locator('.tr').count() > 5
     && await page.locator('.trs').count() === 0);

  console.log('\n── Die Adresse im Aktionsmodus ─────────────────────');
  /* Seit dem 2026-09-26 gibt es auf dem Bildschirm kein
     Einstellungsprogramm mehr. Geprüft wird deshalb das Gegenteil
     von vorher: die Adresse ist am Gerät zu LESEN, aber nicht zu
     ändern — geändert wird im Entwurf am Kärtchen (Filius' Modell,
     dort ist es der Dialog am Netzplan).

     Die Kehrseite darf dabei nicht verloren gehen, und genau
     deshalb steht das hier: wenn die Adresse im Aktionsmodus
     nirgends steht, ist ein Kind, das „warum antwortet der nicht"
     fragt, ohne Auskunft. */
  ok('die Adresse steht in der Kopfzeile des Bildschirms',
     (await page.locator('#dtSub').textContent()).includes('192.168.1.10'),
     await page.locator('#dtSub').textContent());
  ok('und kein Formular auf dem Bildschirm',
     await page.locator('#dtWin .k-nic').count() === 0);
  // Das Terminal steht aus dem Abschnitt davor noch offen — der
  // zweite Weg zur Adresse, und der einzige, der dabei auch im
  // Netz nachfragt.
  await page.locator('#termInput').fill('ipconfig');
  await page.locator('#termInput').press('Enter');
  await page.waitForTimeout(300);
  ok('ipconfig nennt sie ebenfalls',
     (await page.locator('#termOut').textContent()).includes('192.168.1.10'));

  /* ⚠️ Und zum Schluss weg vom Terminal, denn der nächste Abschnitt
     schlägt es auf — ein Klick auf die Kachel eines LAUFENDEN
     Programms klappt es zu, und der Ping danach liefe in ein
     geschlossenes Fenster. Vorher tat das der Klick auf
     „Einstellungen", den es nicht mehr gibt. */
  await programmAuf(page, 'software');
  await page.waitForTimeout(250);
  ok('der Appstore zeigt Kacheln, keine zwei Spalten',
     await page.locator('#dtWin .sw-k').count() >= 1
     && await page.locator('#dtWin .sw-col').count() === 0);

  console.log('\n── Ein Kabel nach dem anderen ──────────────────────');
  // Der Kern der Sache: ein Paket ist zu jedem Zeitpunkt auf
  // GENAU EINEM Kabel. Vorher lief die Animation mit einer
  // Mindestdauer von 250 ms, während ein Kabel nur 10 ms
  // brauchte — dann leuchtete die halbe Fläche gleichzeitig.
  await page.locator('#speed').fill('0');          // Zeitlupe
  await programmAuf(page, 'terminal');
  await page.waitForTimeout(200);
  await page.locator('#termInput').fill('ping 192.168.1.11');
  await page.locator('#termInput').press('Enter');
  const gleichzeitig = await page.evaluate(async () => {
    let max = 0, gesehen = 0;
    for (let i = 0; i < 60; i++) {
      const n = document.querySelectorAll('.nf-cable.is-busy').length;
      if (n > max) max = n;
      if (n > 0) gesehen++;
      await new Promise(r => setTimeout(r, 50));
    }
    return { max, gesehen };
  });
  ok('Kabel leuchten überhaupt', gleichzeitig.gesehen > 3, JSON.stringify(gleichzeitig));
  ok('nie mehr als ein Kabel gleichzeitig', gleichzeitig.max <= 1, JSON.stringify(gleichzeitig));
  await page.locator('#speed').fill('4');

  console.log('\n── Geräte hinzufügen und verkabeln ─────────────────');
  // Gebaut wird im Entwurf — die Leiste gibt es im Aktionsmodus
  // gar nicht.
  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);
  ok('Geräteoberfläche schließt beim Zurückschalten',
     !(await page.locator('#desktop').isVisible()));
  const vorher = await page.evaluate(() => window.SIM.netz.count);
  await geraetZiehen(page, 'router');
  ok('Router hinzugefügt', await page.evaluate(() => window.SIM.netz.count) === vorher + 1);
  ok('Router hat zwei Anschlüsse', await page.locator('#karteBody .k-nic').count() === 2);
  // Anschlüsse an- und abbauen gehört zum Bauen, nicht zum
  // Einrichten — also in die große Ansicht.
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(250);
  ok('„Mehr" schiebt das Fenster an den rechten Rand', await page.evaluate(() => {
    const k = document.querySelector('#karte').getBoundingClientRect();
    const st = document.querySelector('.stage').getBoundingClientRect();
    return st.right - k.right < 24 && k.width > 320;
  }));
  /* Beim Router stehen Tabellen, Gateway und DNS seit den Reitern
     unter „Allgemein" — wie in Filius, wo
     JVermittlungsrechnerKonfiguration ebenfalls ein JTabbedPane
     mit genau diesem Reiter ist. Aufgeschlagen sind die
     Netzwerkkarten, also einmal umschalten. */
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  ok('groß stehen die Tabellen drin', await page.locator('#karteBody .k-tab').count() === 1);
  /* Und groß ist Platz für den Wortlaut aus Filius: dort heißt
     das Feld „Domain Name Server", hier „Domain Name System
     (DNS)" — die Abkürzung ist das, was im Schulbuch steht. */
  ok('groß heißt das Feld „Domain Name System (DNS)"', await page.evaluate(() => {
    const l = [...document.querySelectorAll('#karteBody .k-f-l')]
      .map(e => e.textContent);
    return l.some(t => t.includes('Domain Name System'));
  }));

  /* Ein Router mit genau zwei Anschlüssen reicht für zwei Netze
     und für kein drittes. In Filius müsste man ihn wegwerfen und
     neu bauen — mitsamt allen Adressen, die schon drinstehen. */
  await page.locator('.k-reiter-b', { hasText: 'Netzwerkkarten' }).click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="addnic"]').click();
  await page.waitForTimeout(250);
  ok('Anschluss lässt sich anbauen', await page.locator('#karteBody .k-nic').count() === 3);
  ok('der neue Anschluss hat eine eigene MAC', await page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    return new Set(r.nics.map(k => k.mac)).size === 3;
  }));
  await page.locator('#karteBody [data-k="delnic"]').last().click();
  await page.waitForTimeout(250);
  ok('und wieder abbauen', await page.locator('#karteBody .k-nic').count() === 2);
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(250);
  ok('„Weniger" legt das Fenster wieder neben das Gerät',
     await page.locator('#karteBody .k-tab').count() === 0);

  /* Ein frisch abgelegter Server hat noch keine eigene Adresse —
     die Netzmaske auf der DHCP-Seite steht trotzdem schon im Feld.
     Sie ist in jedem Netz dieser Simulation dieselbe; ein leeres
     Feld wäre hier keine Frage, sondern eine Lücke, die man
     vergisst und dann in der Ausleihe sucht. */
  const vorProbe = await page.evaluate(() => window.SIM.netz.count);
  await geraetZiehen(page, 'server');
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="dhcpseite"]').click();
  await page.waitForTimeout(250);
  ok('die Netzmaske steht auch ohne eigene Adresse schon da',
     await page.locator('#karteBody input.f[data-f="dhcpmask"]').inputValue() === '255.255.255.0',
     await page.locator('#karteBody input.f[data-f="dhcpmask"]').inputValue());
  await page.locator('#karteBody [data-k="zurueck"]').click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="del"]').click();
  await page.waitForTimeout(300);
  ok('der Probeserver ist wieder weg',
     await page.evaluate(() => window.SIM.netz.count) === vorProbe);
  /* Das Fenster wieder klein machen — die folgenden Prüfungen
     gehen vom kleinen Fenster neben dem Gerät aus, und „Mehr"
     bleibt eingeschaltet, bis jemand es ausschaltet. */
  await page.locator('.nf-node').first().click();
  await page.waitForTimeout(250);
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(200);

  // Verkabeln durch Ziehen
  await page.locator('[data-tool="kabel"]').click();
  await page.waitForTimeout(150);
  const kVorher = await page.evaluate(() => window.SIM.netz.cableList().length);
  const boxes = await page.evaluate(() => {
    const sw = window.SIM.netz.list().find(n => n.kind === 'switch');
    const r  = window.SIM.netz.list().find(n => n.kind === 'router');
    const svg = document.querySelector('.nf');
    const m = svg.getScreenCTM();
    const p = (x, y) => { const q = svg.createSVGPoint(); q.x = x; q.y = y;
                          const t = q.matrixTransform(m); return { x: t.x, y: t.y }; };
    return { sw: p(sw.x, sw.y), r: p(r.x, r.y) };
  });
  await page.mouse.move(boxes.sw.x, boxes.sw.y);
  await page.mouse.down();
  await page.mouse.move(boxes.r.x, boxes.r.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  ok('Ziehen legt ein Kabel',
     await page.evaluate(() => window.SIM.netz.cableList().length) === kVorher + 1,
     /* Wenn das schiefgeht, liegt es fast immer daran, dass ein
        Fenster über dem Gerät liegt — dann nimmt nicht die Fläche
        den Zeigerdruck entgegen, sondern das Fenster. Deshalb
        steht hier, WAS an den beiden Stellen liegt. */
     await page.evaluate((b) => {
       const nm = (p) => { const e = document.elementFromPoint(p.x, p.y);
                           return e ? e.tagName + '.' + (e.getAttribute('class') || '') : '—'; };
       return 'Switch bei ' + Math.round(b.sw.x) + ',' + Math.round(b.sw.y) + ' → ' + nm(b.sw)
            + ' · Router bei ' + Math.round(b.r.x) + ',' + Math.round(b.r.y) + ' → ' + nm(b.r);
     }, boxes));

  /* ⭐ Und es steht auch DA. Diese Prüfung fehlte, und deshalb ist
     der Fehler bis zum 2026-09-28 durchgekommen: `connect()` legte
     das Kabel im Modell an, aber niemand zeichnete die Fläche neu.
     Sichtbar wurde es erst beim nächsten beliebigen `draw()` — der
     Nutzer wörtlich: „Ich setze sie durch Ziehen, und dann sind sie
     kurz weg, danach sind sie wieder da."

     ⚠️ Kein Klick und kein `draw()` von Hand zwischen dem Loslassen
     und dieser Zeile — genau das war die Lücke der alten Prüfung:
     sie fragte nur das MODELL, und das war immer richtig.

     Gezählt wird gegen `cableList()` und nicht gegen eine feste
     Zahl: die Aussage ist „Modell und Bild sind gleich", nicht
     „es sind drei". */
  ok('⭐ und das Kabel steht sofort auf der Fläche', await page.evaluate(() =>
       document.querySelectorAll('.nf-cable').length === window.SIM.netz.cableList().length),
     await page.evaluate(() => document.querySelectorAll('.nf-cable').length
       + ' gezeichnet, ' + window.SIM.netz.cableList().length + ' im Modell'));
  /* Die Kehrseite: ohne das <g> findet `kabelUnter` nichts — das
     frische Kabel wäre nicht anklickbar und würde bei einer
     Übertragung nicht leuchten. */
  ok('es ist auch schon anklickbar', await page.evaluate(() => {
    const neu = window.SIM.netz.cableList().slice(-1)[0];
    return !!document.querySelector('.nf-cable[data-cable="' + neu.id + '"]');
  }));

  await page.locator('[data-tool="zeiger"]').click();

  /* Auf einem vollen Netzplan liegt JEDE ausgerechnete Stelle
     irgendwann über dem Gerät, um das es geht. Am Kopf packen
     und hinlegen ist der Ausweg — und am Beamer der Normalfall. */
  await page.locator('.mbtn[data-modus="entwurf"]').click();
  await page.waitForTimeout(250);
  await page.evaluate(() => window.SIM.flaeche.select(window.SIM.netz.list()[0].id));
  await page.waitForTimeout(250);
  const vorZug = await page.evaluate(() =>
    document.querySelector('#karte').getBoundingClientRect().left);
  const kopf = await page.locator('#karteHead').boundingBox();
  await page.mouse.move(kopf.x + 50, kopf.y + 12);
  await page.mouse.down();
  await page.mouse.move(kopf.x + 250, kopf.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const nachZug = await page.evaluate(() =>
    document.querySelector('#karte').getBoundingClientRect().left);
  ok('das Fenster lässt sich am Kopf verschieben', nachZug - vorZug > 150,
     Math.round(vorZug) + ' → ' + Math.round(nachZug));
  ok('und bleibt dabei ganz auf der Fläche', await page.evaluate(() => {
    const k = document.querySelector('#karte').getBoundingClientRect();
    const st = document.querySelector('.stage').getBoundingClientRect();
    return k.left >= st.left - 1 && k.right <= st.right + 1;
  }));
  /* Ein anderes Gerät holt das Fenster zurück an seinen Platz:
     die hingelegte Stelle gehörte zum vorigen Gerät. */
  await page.evaluate(() => window.SIM.flaeche.select(window.SIM.netz.list()[1].id));
  await page.waitForTimeout(250);
  ok('beim nächsten Gerät liegt es wieder daneben', await page.evaluate(() => {
    const k = document.querySelector('#karte').getBoundingClientRect();
    const g = document.querySelector('[data-node="' + window.SIM.netz.list()[1].id + '"]')
                .getBoundingClientRect();
    return Math.abs((k.top + k.height / 2) - (g.top + g.height / 2)) < 140;
  }));

  /* ══ Tippen oder Ziehen ═════════════════════════════════════
     Die Geste entscheidet, was passiert — und bis sie zu Ende ist,
     passiert gar nichts. Vorher schlug schon das Aufsetzen des
     Zeigers das Fenster auf: wer ein Gerät nur verschieben wollte,
     bekam es trotzdem, und es lag prompt im Weg.              */
  console.log('\n── Tippen oder Ziehen ──────────────────────────────');
  await page.locator('#karteClose').click();
  await page.waitForTimeout(200);
  ok('Ausgangslage: kein Fenster offen', !(await page.locator('#karte').isVisible()));

  const gA = await geraetPunkt(page, 0);
  await page.mouse.move(gA.x, gA.y);
  await page.mouse.down();
  await page.mouse.move(gA.x + 95, gA.y + 45, { steps: 10 });
  ok('während des Ziehens ist die Seite gegen Markieren gesperrt',
     await page.evaluate(() => document.body.classList.contains('is-ziehen')));
  await page.mouse.up();
  await page.waitForTimeout(250);
  const gB = await geraetPunkt(page, 0);
  ok('Ziehen verschiebt das Gerät', Math.abs(gB.x - gA.x) > 60,
     Math.round(gB.x - gA.x) + ' px');
  ok('Ziehen schlägt KEIN Fenster auf', !(await page.locator('#karte').isVisible()));
  ok('das gezogene Gerät ist trotzdem ausgewählt',
     await page.locator('.nf-node.is-sel').count() === 1);
  ok('und die Sperre ist nach dem Loslassen wieder weg',
     await page.evaluate(() => !document.body.classList.contains('is-ziehen')));

  await page.mouse.click(gB.x, gB.y);
  await page.waitForTimeout(250);
  ok('Antippen schlägt das Fenster auf', await page.locator('#karte').isVisible());
  ok('und zwar für das angetippte Gerät', await page.evaluate(() =>
    document.querySelector('#karteKurz').textContent
      === window.SIM.netz.kurzName(window.SIM.netz.list()[0])));
  await page.mouse.click(gB.x, gB.y);
  await page.waitForTimeout(250);
  ok('dasselbe Gerät noch einmal antippen macht wieder zu',
     !(await page.locator('#karte').isVisible()));

  /* Eine Fingerkuppe wandert beim Tippen immer ein paar Pixel.
     Bliebe jede Bewegung ein Zug, wäre auf einem Tablet kein
     Fenster mehr zu öffnen — und der Plan verrutschte bei jedem
     Ansehen. */
  const wackelVor = await page.evaluate(() =>
    ({ x: window.SIM.netz.list()[0].x, y: window.SIM.netz.list()[0].y }));
  await page.mouse.move(gB.x, gB.y);
  await page.mouse.down();
  await page.mouse.move(gB.x + 2, gB.y + 2);
  await page.mouse.up();
  await page.waitForTimeout(250);
  ok('ein Wackeln von zwei Punkten gilt noch als Tippen',
     await page.locator('#karte').isVisible());
  ok('und das Gerät bleibt dabei, wo es lag', await page.evaluate((v) => {
    const n = window.SIM.netz.list()[0];
    return n.x === v.x && n.y === v.y;
  }, wackelVor));
  await page.locator('#karteClose').click();
  await page.waitForTimeout(150);

  /* ══ Kabelziehen markiert keinen Text ═══════════════════════
     Der Zug geht quer über die Fläche, und dabei lag früher der
     halbe Bildschirm blau markiert da — der Auftrag, die
     Beschriftungen, das Gerätefenster. Auf einem Tablet war das
     beim Verkabeln das Auffälligste am ganzen Bild.           */
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.locator('[data-tool="kabel"]').click();
  await page.waitForTimeout(150);
  const gC = await geraetPunkt(page, 0);
  const ueberText = await page.evaluate(() => {
    const a = document.querySelector('#aufgabe').getBoundingClientRect();
    return { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  });
  await page.mouse.move(gC.x, gC.y);
  await page.mouse.down();
  await page.mouse.move(ueberText.x, ueberText.y, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  ok('beim Kabelziehen wird nichts auf der Seite markiert',
     await page.evaluate(() => String(window.getSelection()).trim() === ''),
     await page.evaluate(() => String(window.getSelection()).slice(0, 60)));
  ok('die Fläche selbst ist nie markierbar', await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.nf'));
    return (s.userSelect || s.webkitUserSelect) === 'none';
  }));
  await page.locator('[data-tool="zeiger"]').click();
  await page.waitForTimeout(150);

  /* ══ Die Geräteleiste erklärt, sie legt nicht an ════════════
     Ein Klick legte das Gerät bisher an eine ausgerechnete freie
     Stelle. Bequem und trotzdem falsch: die Stelle war nie die,
     an der man es haben wollte, und wer nachlesen wollte, was ein
     Switch überhaupt ist, hatte danach einen Switch.          */
  console.log('\n── Die Geräteleiste ────────────────────────────────');
  const cVor = await page.evaluate(() => window.SIM.netz.count);
  await page.locator('[data-add="switch"]').click();
  await page.waitForTimeout(250);
  ok('Anklicken legt KEIN Gerät an',
     await page.evaluate(() => window.SIM.netz.count) === cVor);
  ok('es erklärt das Gerät', await page.locator('#ginfo').isVisible());
  ok('und zwar das angeklickte',
     (await page.locator('#ginfoName').textContent()) === 'Switch');
  ok('die Erklärung nennt das Wesentliche (Switch: keine IP-Adresse)',
     (await page.locator('#ginfoText').textContent()).includes('keine IP-Adresse'));
  /* ⚠️ NEBEN dem Knopf, nicht mehr darunter: die Leiste steht
     senkrecht am linken Rand, unter dem Knopf stünde der nächste
     Knopf — und eingeklappt ist sie keine 60 px breit, ein
     Kärtchen von 330 px hätte darin gar keinen Platz. Es fliegt
     also nach rechts heraus, auf Höhe des Knopfes. */
  ok('die Erklärung fliegt neben ihrem Knopf heraus', await page.evaluate(() => {
    const g = document.querySelector('#ginfo').getBoundingClientRect();
    const b = document.querySelector('[data-add="switch"]').getBoundingClientRect();
    return g.left >= b.right - 1 && Math.abs(g.top - b.top) < 60;
  }));
  await page.locator('[data-add="switch"]').click();
  await page.waitForTimeout(200);
  ok('noch einmal antippen macht die Erklärung zu',
     !(await page.locator('#ginfo').isVisible()));

  /* Und dort, wo Filius den Wortlaut vorgibt, steht er auch drin:
     ein Router heißt dort Vermittlungsrechner. Eine Lehrkraft, die
     von Filius kommt, sucht sonst danach. */
  await page.locator('[data-add="router"]').click();
  await page.waitForTimeout(200);
  ok('die Erklärung nennt das Filius-Wort (Vermittlungsrechner)',
     (await page.locator('#ginfoText').textContent()).includes('Vermittlungsrechner'));
  await page.locator('[data-add="router"]').click();
  await page.waitForTimeout(150);

  const cVor2 = await page.evaluate(() => window.SIM.netz.count);
  const knopf = await page.locator('[data-add="host"]').boundingBox();
  const abwurf = await page.evaluate(() => {
    const r = document.querySelector('.nf').getBoundingClientRect();
    return { x: r.left + r.width * 0.70, y: r.top + r.height * 0.76 };
  });
  await page.mouse.move(knopf.x + knopf.width / 2, knopf.y + knopf.height / 2);
  await page.mouse.down();
  await page.mouse.move(abwurf.x, abwurf.y, { steps: 12 });
  await page.waitForTimeout(120);
  ok('während des Ziehens hängt ein Schattengerät am Zeiger',
     await page.locator('.gdrag').count() === 1);
  ok('und es zeigt an, dass hier abgelegt werden kann',
     await page.locator('.gdrag.is-ok').count() === 1);
  await page.mouse.up();
  await page.waitForTimeout(300);
  ok('Ziehen legt ein Gerät an',
     await page.evaluate(() => window.SIM.netz.count) === cVor2 + 1);
  ok('das Schattengerät ist wieder weg', await page.locator('.gdrag').count() === 0);
  ok('das Gerät liegt dort, wo losgelassen wurde', await page.evaluate((z) => {
    const l = window.SIM.netz.list();
    const n = l[l.length - 1];
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = n.x; q.y = n.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return Math.abs(t.x - z.x) < 26 && Math.abs(t.y - z.y) < 26;
  }, abwurf));

  /* Daneben abgelegt legt nichts an — und sagt das auch. Sonst
     wäre der Unterschied zwischen „geht nicht" und „ist passiert,
     aber unsichtbar" nicht zu erkennen. */
  const cVor3 = await page.evaluate(() => window.SIM.netz.count);
  await page.mouse.move(knopf.x + knopf.width / 2, knopf.y + knopf.height / 2);
  await page.mouse.down();
  await page.mouse.move(knopf.x + 40, knopf.y + 4, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  ok('neben der Fläche abgelegt legt nichts an',
     await page.evaluate(() => window.SIM.netz.count) === cVor3);

  /* ══ Das hervorgehobene Kabel ═══════════════════════════════
     „Zu dieser Netzwerkkarte gehört DIESES Kabel." Ein halber
     Punkt mehr Strichstärke war dafür zu wenig — bei einem Router
     mit drei Karten sind zwei davon ohnehin in ihrer Netzfarbe
     schon dicker als ein graues Kabel.

     ⚠️ Und es darf dabei seine FARBE NICHT ÄNDERN. Vorher nahm es
     den Akzent an, und der ist in Hell Mint — also eine der sechs
     Netzfarben. Wer beim Router auf Netzwerkkarte 1 zeigte (Netz
     192.168.1., blau), bekam ihr Kabel in der Farbe des anderen
     Netzes zu sehen. Das hat kein Prüfstand gemeldet, nur das
     Bild.                                                     */
  console.log('\n── Das hervorgehobene Kabel ────────────────────────');
  /* Genau der Fall, um den es geht: ein Router mit zwei
     Netzwerkkarten, und die Frage „welches Kabel ist Karte 1?".
     Also auch mit der echten Geste geprüft — auf den Kartenblock
     zeigen —, nicht nur über betonen(). */
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    window.SIM.flaeche.select(r.id);
  });
  await page.waitForTimeout(350);
  await page.locator('#karteBody [data-nicbox="0"]').hover();
  await page.waitForTimeout(250);
  ok('auf eine Netzwerkkarte zeigen hebt genau ein Kabel hervor',
     await page.locator('.nf-cable.is-betont').count() === 1);
  ok('und zwar das Kabel DIESER Karte', await page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    return document.querySelector('.nf-cable.is-betont').dataset.cable === r.nics[0].cable;
  }));
  /* Gemessen wird über eine ganze Pulsdauer, nicht einmal: eine
     einzelne Messung trifft je nach Zufall den dünnsten oder den
     dicksten Augenblick — und eine Prüfung, die von der Phase
     einer Animation abhängt, ist keine. */
  const bet = await page.evaluate(async () => {
    const g = document.querySelector('.nf-cable.is-betont');
    const line = g.querySelector('.nf-cable-line');
    const hit  = g.querySelector('.nf-cable-hit');
    const andere = document.querySelector('.nf-cable:not(.is-betont) .nf-cable-line');
    const breiten = [], deckung = [];
    for (let i = 0; i < 18; i++) {
      breiten.push(parseFloat(getComputedStyle(line).strokeWidth));
      deckung.push(parseFloat(getComputedStyle(hit).opacity));
      await new Promise(r => setTimeout(r, 90));
    }
    /* --accent steht als #rrggbb da, `stroke` kommt als rgb(). Ohne
       diesen Umweg verglichen man zwei Schreibweisen und die
       Prüfung wäre immer grün. */
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent');
    document.body.appendChild(probe);
    const akzent = getComputedStyle(probe).color;
    probe.remove();
    return {
      wMin: Math.min(...breiten), wMax: Math.max(...breiten),
      hofMin: Math.min(...deckung), hofMax: Math.max(...deckung),
      anim: getComputedStyle(line).animationName,
      strich: getComputedStyle(line).stroke,
      hofAnim: getComputedStyle(hit).animationName,
      hofStroke: getComputedStyle(hit).stroke,
      akzent,
      andereW: andere ? parseFloat(getComputedStyle(andere).strokeWidth) : 0
    };
  });
  ok('es ist deutlich dicker als ein gewöhnliches Kabel',
     bet.wMax >= bet.andereW + 3,
     bet.andereW + ' → ' + bet.wMax);
  ok('und es pulsiert sichtbar', bet.anim === 'kabelPuls' && bet.wMax - bet.wMin >= 2,
     bet.wMin + ' … ' + bet.wMax);
  ok('dazu ein Hof auf der ganzen Treffbreite',
     bet.hofMax >= 0.2 && !/rgba\(0, ?0, ?0, ?0\)/.test(bet.hofStroke),
     bet.hofMax + ' ' + bet.hofStroke);
  ok('der Hof atmet mit', bet.hofAnim === 'kabelHof' && bet.hofMax - bet.hofMin >= 0.08,
     bet.hofMin + ' … ' + bet.hofMax);
  /* Der Hof trägt die Netzfarbe des Kabels, nicht Tinte — ein
     grauer Hof um ein blaues Kabel sah aus wie „abgeblendet". */
  ok('und der Hof hat dieselbe Farbe wie das Kabel',
     bet.hofStroke === bet.strich, bet.hofStroke + ' vs. ' + bet.strich);
  /* Die eigentliche Regel dieser Fläche: Farbe heißt „Netz". Eine
     Hervorhebung, die den Akzent aufträgt, behauptet damit eine
     Netzzugehörigkeit, die es nicht gibt. */
  ok('und es behält seine eigene Farbe (kein Akzent)',
     bet.strich !== bet.akzent, bet.strich + ' vs. ' + bet.akzent);
  // Zeiger weg vom Kartenblock: die Hervorhebung gehört zum
  // Anfassen und muss mit ihm enden.
  await page.locator('#karteHead').hover();
  await page.waitForTimeout(250);
  ok('und geht wieder aus, sobald man die Karte loslässt',
     await page.locator('.nf-cable.is-betont').count() === 0);

  console.log('\n── Szenario 4 komplett lösen ───────────────────────');
  await szenarioWaehlen(page, 'fehler');
  await page.waitForTimeout(600);
  ok('Fehler-Szenario geladen', await page.evaluate(() => window.SIM.netz.count) === 7);
  /* ⚠️ Hier stand `>= 3`. Zwei der Zeichen hingen an der doppelt
     vergebenen Adresse (an beiden Geräten eines); die ist seit
     dieser Runde kein Fehler mehr — mit Heimroutern und privaten
     Adressen ist dieselbe Zahl in zwei Netzen die Regel. Übrig
     bleibt das Gateway im falschen Netz, und der Auftragstext
     sagt jetzt genau das: EIN Warnzeichen, zwei stumme Fehler. */
  ok('ein Warnzeichen zeigt den sichtbaren Fehler',
     await page.locator('.nf-badge').count() === 1,
     String(await page.locator('.nf-badge').count()));
  ok('die doppelt vergebene Adresse trägt KEINS mehr',
     await page.evaluate(() => {
       const S = window.SIM;
       const e1 = S.netz.byName('Endgerät 1'), e2 = S.netz.byName('Endgerät 2');
       return e1.nics[0].ip === e2.nics[0].ip
         && !S.flaeche.problemOf(e1) && !S.flaeche.problemOf(e2);
     }));
  ok('Auftragstext gewechselt',
     (await page.locator('#aufgabeTitel').textContent()).includes('Fehlersuche'));

  // Die drei Fehler im Modell beheben und prüfen, dass der Ping läuft
  const geloest = await page.evaluate(async () => {
    const S = window.SIM;
    S.netz.byName('Endgerät 2').nics[0].ip = '192.168.1.11';
    S.netz.byName('Router 1').nics[1].mask  = '255.255.255.0';
    S.netz.byName('Endgerät 3').gateway    = '192.168.2.1';
    for (const n of S.netz.list()) S.stack.clearTables(n);
    S.flaeche.draw();
    return await new Promise(res => {
      S.stack.ping(S.netz.byName('Endgerät 1'), '192.168.2.20', 1, 6e6, r => res(r));
      S.engine.runUntil(S.engine.now + 12e6);
    });
  });
  ok('nach drei Korrekturen kommt der Ping durch', geloest && geloest.ok, JSON.stringify(geloest));
  ok('Warnzeichen sind weg', await page.locator('.nf-badge').count() === 0);

  console.log('\n── DHCP: Adressen kommen von selbst ────────────────');
  await szenarioWaehlen(page, 'automatisch');
  await page.waitForTimeout(600);
  ok('DHCP-Szenario geladen', await page.evaluate(() => window.SIM.netz.count) === 6);
  /* Der DHCP-Server sitzt auf einem RECHNER, nicht auf dem Router
     — so hält es Filius, wo der Vermittlungsrechner gar keine
     DHCP-Einstellungen hat. */
  ok('der DHCP-Server läuft auf einem Rechner, nicht auf dem Router',
     await page.evaluate(() => {
       const s = window.SIM.netz.list().find(n => n.dhcpServer && n.dhcpServer.on);
       return !!s && s.kind !== 'router';
     }));
  ok('im Entwurf hat noch kein Endgerät eine Adresse', await page.evaluate(() =>
    window.SIM.netz.list().filter(n => n.kind === 'host').every(n => !n.nics[0].ip)));
  // Ein Gerät, das auf eine Adresse wartet, ist kein Fehler.
  ok('kein Warnzeichen bei wartenden Endgeräten',
     await page.locator('.nf-badge').count() === 0,
     String(await page.locator('.nf-badge').count()));
  ok('die Fläche sagt, dass die Adresse geholt wird',
     (await page.locator('.nf-ip--none').first().textContent()).includes('DHCP'));

  /* Wer verteilt, trägt es an der Kachel. „Wer ist hier der
     DHCP-Server" war vorher nur zu beantworten, indem man jedes
     Gerät einzeln aufmachte. */
  ok('der DHCP-Server trägt ein Zeichen an der Kachel',
     await page.locator('.nf-dhcp').count() === 1,
     String(await page.locator('.nf-dhcp').count()));
  ok('und es steht am richtigen Gerät', await page.evaluate(() => {
    const g = document.querySelector('.nf-dhcp').closest('.nf-node');
    const n = window.SIM.netz.get(g.dataset.node);
    return !!(n && n.dhcpServer && n.dhcpServer.on);
  }));

  // Das ausgegraute Feld: bei DHCP trägt man die Adresse nicht ein.
  await page.evaluate(() => {
    const h = window.SIM.netz.list().find(n => n.kind === 'host');
    window.SIM.flaeche.select(h.id);
  });
  await page.waitForTimeout(250);
  ok('das Adressfeld ist gesperrt',
     await page.locator('#karteBody input.f[data-f="ip"]').isDisabled());
  ok('die Netzmaske ist gesperrt',
     await page.locator('#karteBody input.f[data-f="mask"]').isDisabled());
  ok('Gateway ist gesperrt, es kommt ja mit',
     await page.locator('#karteBody input.f[data-f="gateway"]').isDisabled());
  /* Ein Feld, das nur ausgegraut ist, sieht aus wie ein Programm,
     das gerade nicht funktioniert. Das Schloss sagt, dass es
     Absicht ist — dasselbe Zeichen steht auf der Fläche hinter
     der geliehenen Adresse. */
  ok('vier Schlösser: IP, Maske, Gateway, DNS',
     await page.locator('#karteBody .k-f.is-zu .k-lock').count() === 4,
     String(await page.locator('#karteBody .k-f.is-zu .k-lock').count()));

  /* ─ Alle vier Felder stehen gleich da: leer ─────────────────
     Der Fehler, der im Bild aufgefallen ist: das Adressfeld war
     leer, das Maskenfeld trug 255.255.255.0, und das Gateway stand
     noch vom letzten Durchlauf drin. Vier Felder mit derselben
     Herkunft in drei verschiedenen Zuständen — wer das sieht, hält
     die Maske für eingetragen und die Adresse für vergessen.

     Und weil ein Gateway ohne Adresse in keinem Netz liegen KANN,
     hing am Gerät obendrein ein „!" mit einer Fehlermeldung über
     ein Feld, das die Oberfläche gerade selbst gesperrt hatte. */
  for (const f of ['ip', 'mask', 'gateway', 'dns']) {
    ok('Feld „' + f + '" ist leer, solange keiner geantwortet hat',
       await page.locator('#karteBody input.f[data-f="' + f + '"]').inputValue() === '',
       await page.locator('#karteBody input.f[data-f="' + f + '"]').inputValue());
    ok('und sagt im Platzhalter, woher es kommt',
       /DHCP-Server/.test(await page.locator('#karteBody input.f[data-f="' + f + '"]')
         .getAttribute('placeholder') || ''),
       await page.locator('#karteBody input.f[data-f="' + f + '"]').getAttribute('placeholder'));
  }
  ok('darunter steht, dass alle vier Angaben vom Server kommen',
     /Netzmaske/.test(await page.locator('#karteBody .k-dhcp').first().textContent()),
     await page.locator('#karteBody .k-dhcp').first().textContent());

  await page.locator('#karteMehr').click();
  await page.waitForTimeout(250);
  ok('DHCP-Schalter steht an',
     await page.locator('#karteBody [data-k="dhcp"]').isChecked());
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(200);

  /* Und beim Server führt ein Knopf auf die Einrichtungsseite —
     wie der Dialog „DHCP-Server einrichten" in Filius, nur als
     Unterseite im Kärtchen statt als Fenster über der Fläche. */
  await page.evaluate(() => {
    const s = window.SIM.netz.list().find(n => n.dhcpServer && n.dhcpServer.on);
    window.SIM.flaeche.select(s.id);
  });
  await page.waitForTimeout(250);
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(250);
  ok('der Server hat den Knopf „DHCP-Server einrichten"',
     await page.locator('#karteBody [data-k="dhcpseite"]').count() === 1);
  await page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    window.SIM.flaeche.select(r.id);
  });
  await page.waitForTimeout(250);
  ok('der Router hat ihn nicht',
     await page.locator('#karteBody [data-k="dhcpseite"]').count() === 0);
  ok('und auch kein DHCP-Kontrollkästchen',
     await page.locator('#karteBody [data-k="dhcp"]').count() === 0);

  await page.evaluate(() => {
    const s = window.SIM.netz.list().find(n => n.dhcpServer && n.dhcpServer.on);
    window.SIM.flaeche.select(s.id);
  });
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="dhcpseite"]').click();
  await page.waitForTimeout(250);
  ok('die Unterseite zeigt den Adressbereich',
     await page.locator('#karteBody input.f[data-f="dhcpvon"]').inputValue() === '192.168.1.100');
  ok('und den Filius-Wortlaut „DHCP aktivieren"',
     (await page.locator('#karteBody .k-switch').first().textContent()).includes('DHCP aktivieren'));

  /* ─── Statische Adresszuweisung ──────────────────────────────
     Filius' zweiter Reiter, hier als Abschnitt darunter. Der
     Wortlaut ist von dort und wird mitgeprüft: er ist der Grund,
     warum eine Lehrkraft, die Filius kennt, hier ohne
     Einarbeitung zurechtkommt. */
  ok('die Unterseite hat den Abschnitt „Statische Adresszuweisung"',
     (await page.locator('#karteBody').textContent()).includes('Statische Adresszuweisung'));
  ok('mit Filius\' Knopf „Hinzufügen"',
     await page.locator('#karteBody [data-k="festneu"]').count() === 1);
  ok('und sagt vorher, dass es noch keine gibt',
     (await page.locator('#karteBody').textContent()).includes('Keine feste Zuweisung'));

  await page.locator('#karteBody [data-k="festneu"]').click();
  await page.waitForTimeout(250);
  ok('„Hinzufügen" legt eine Zeile an',
     await page.locator('#karteBody input[data-f="festmac"]').count() === 1);
  ok('die Zeile kommt LEER — die Entscheidung nimmt ihr niemand ab',
     (await page.locator('#karteBody input[data-f="festmac"]').inputValue()) === ''
     && (await page.locator('#karteBody input[data-f="festip"]').inputValue()) === '');

  /* ⭐ Die Kürzel der Geräte im Netz. Eine Zutat gegenüber Filius,
     wo man die siebzehn Zeichen abtippt — und die Begründung ist
     ein Fehler, den eine Klasse garantiert macht. */
  const chips = await page.locator('#karteBody .k-macs .sn-chip').count();
  ok('darunter stehen die Geräte des Netzes als Kürzel', chips > 0, String(chips));
  /* ⚠️ Nur Endgeräte. Ein Router holt seine Adresse nicht per
     DHCP — und er hat mehrere Karten, von denen das Kürzel nur
     die erste nennen könnte, also vielleicht eine aus einem ganz
     anderen Netz. Diese Reservierung griffe dann nie, und nichts
     würde es melden. */
  const kuerzelListe = await page.locator('#karteBody .k-macs .sn-chip').allTextContents();
  ok('und zwar nur Endgeräte, kein Router und kein Switch',
     kuerzelListe.every(t => /^[ESH]\d+$/.test(t.trim())), kuerzelListe.join(' '));
  const wunsch = await page.locator('#karteBody .k-macs .sn-chip').first().getAttribute('title');
  await page.locator('#karteBody .k-macs .sn-chip').first().click();
  await page.waitForTimeout(250);
  ok('⭐ ein Kürzel antippen setzt die MAC-Adresse ein',
     (await page.locator('#karteBody input[data-f="festmac"]').inputValue()) === wunsch,
     await page.locator('#karteBody input[data-f="festmac"]').inputValue());
  ok('und der Schreibstrich steht danach im Adressfeld',
     await page.evaluate(() =>
       document.activeElement && document.activeElement.dataset.f === 'festip'));

  await page.locator('#karteBody input[data-f="festip"]').fill('192.168.1.55');
  await page.waitForTimeout(300);
  ok('die Zuweisung steht im Modell', await page.evaluate(() => {
    const s = window.SIM.netz.list().find(n => n.dhcpServer && n.dhcpServer.on);
    const e = s.dhcpServer.statisch[0];
    return !!e && e.ip === '192.168.1.55' && !!e.mac;
  }));

  /* Und sie wirkt: der Rechner mit dieser MAC bekommt genau
     diese Adresse — obwohl sie außerhalb des Bereichs
     (.100–.150) liegt. */
  const festeMac = await page.evaluate(() => {
    const s = window.SIM.netz.list().find(n => n.dhcpServer && n.dhcpServer.on);
    return s.dhcpServer.statisch[0].mac;
  });
  await page.locator('#karteBody [data-k="zurueck"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(3500);
  ok('⭐ das reservierte Gerät bekommt genau diese Adresse',
     await page.evaluate((mac) => {
       const n = window.SIM.netz.list().find(x => x.nics.some(k => k.mac === mac));
       return !!n && n.nics[0].ip === '192.168.1.55';
     }, festeMac), festeMac);
  ok('obwohl sie außerhalb des Adressbereichs liegt', true);

  /* ─── Jeder Aktionsstart vergibt neu ─────────────────────────
     Vom Nutzer verlangt. Geprüft über den Mitschnitt: `vonVorn()`
     leert ihn, also muss nach dem ZWEITEN Wechsel wieder ein
     Discover darin stehen. Stünde dort nichts, hätte niemand neu
     gefragt — die Geräte hätten ihre Adressen von vorhin
     behalten. */
  /* ⚠️ Im Entwurf stehen die geliehenen Adressen noch da, und das
     ist richtig: der Leihvertrag läuft ja. Geräumt wird beim
     START des nächsten Durchgangs, nicht beim Verlassen des
     laufenden — sonst sähe man nach dem Umschalten ein Netz ohne
     Adressen und wüsste nicht mehr, was gerade passiert war. */
  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(400);
  ok('im Entwurf steht noch da, was der Durchgang ergeben hat',
     await page.evaluate(() =>
       window.SIM.netz.list().filter(n => n.kind === 'host' && n.nics[0].dhcp)
         .every(n => !!n.nics[0].ip)));
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(3500);
  const discover2 = await page.evaluate(() =>
    window.SIM.mit.view().filter(r => r.proto === 'DHCP' && /Discover/.test(r.info)).length);
  ok('⭐ auch der zweite Aktionsstart fragt neu', discover2 > 0, String(discover2));
  ok('und alle bekommen wieder eine Adresse',
     await page.evaluate(() =>
       window.SIM.netz.list().filter(n => n.kind === 'host' && n.nics[0].dhcp)
         .every(n => !!n.nics[0].ip)));

  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = window.SIM.netz.list().find(n => n.dhcpServer && n.dhcpServer.on);
    s.dhcpServer.statisch = [];
    window.SIM.flaeche.select(s.id);
  });
  await page.waitForTimeout(250);
  /* ⚠️ „Mehr ›" ist ein Umschalter und bleibt über den
     Gerätewechsel stehen — ein blinder Klick klappt das Kärtchen
     je nach Vorgeschichte auf ODER zu. Also erst nachsehen.
     (Dieselbe Falle wie weiter unten bei `grossMachen`.) */
  if ((await page.locator('#karteMehr').textContent()).includes('Mehr')) {
    await page.locator('#karteMehr').click();
    await page.waitForTimeout(300);
  }
  await page.locator('#karteBody [data-k="dhcpseite"]').click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="zurueck"]').click();
  await page.waitForTimeout(250);
  ok('Zurück führt auf die Hauptseite',
     await page.locator('#karteBody .k-nic').count() === 1);

  await page.locator('[data-modus="aktion"]').click();
  await page.locator('#speed').fill('4');
  await page.waitForTimeout(4000);
  const geholt = await page.evaluate(() =>
    window.SIM.netz.list().filter(n => n.kind === 'host').map(n => n.nics[0].ip));
  ok('alle drei Rechner haben eine Adresse geholt',
     geholt.length === 3 && geholt.every(ip => /^192\.168\.1\.1\d\d$/.test(ip)), geholt.join(','));
  ok('und alle drei verschiedene', new Set(geholt).size === 3, geholt.join(','));
  /* Hinter einer geliehenen Adresse steht ein Schloss — dasselbe
     Zeichen wie vor den gesperrten Feldern im Fenster. Ohne es
     sieht eine feste Adresse aus wie eine geliehene. */
  ok('geliehene Adressen tragen ein Schloss',
     await page.locator('.nf-lock').count() === 3,
     String(await page.locator('.nf-lock').count()));
  ok('die feste Adresse des Servers trägt keines', await page.evaluate(() => {
    const s = window.SIM.netz.list().find(n => n.dhcpServer && n.dhcpServer.on);
    const g = document.querySelector('[data-node="' + s.id + '"]');
    return !g.querySelector('.nf-lock');
  }));
  ok('die Adressen stehen auf der Fläche',
     (await page.locator('.nf-ip').allTextContents()).some(t => t.includes(geholt[0])));
  ok('Gateway ist mitgekommen', await page.evaluate(() =>
    window.SIM.netz.list().filter(n => n.kind === 'host').every(n => n.gateway === '192.168.1.1')));

  /* ─ „von vorn" räumt alles weg, nicht nur die Adresse ────────
     Der Knopf, nach dem der Fehler zu sehen war: die Adresse fiel
     weg, Netzmaske und Gateway blieben vom letzten Durchgang
     stehen. Und weil ein Gateway ohne Adresse in keinem Netz
     liegen KANN, trugen danach drei Endgeräte ein „!" mit einer
     Meldung über ein Feld, das niemand ausgefüllt hatte. */
  await page.locator('#resetBtn').click();
  await page.waitForTimeout(150);
  ok('von vorn: kein Endgerät hat noch eine Angabe', await page.evaluate(() =>
    window.SIM.netz.list().filter(n => n.kind === 'host')
      .every(n => !n.nics[0].ip && !n.nics[0].mask && !n.gateway && !n.dns)),
     await page.evaluate(() => JSON.stringify(window.SIM.netz.list()
       .filter(n => n.kind === 'host')
       .map(n => [n.nics[0].ip, n.nics[0].mask, n.gateway, n.dns]))));
  ok('und keines trägt ein Warnzeichen',
     await page.locator('.nf-badge').count() === 0,
     await page.evaluate(() => [...document.querySelectorAll('.nf-badge title')]
       .map(t => t.textContent).join(' | ')));
  await page.waitForTimeout(4000);
  ok('danach holen sie sich ihre Adressen wieder', await page.evaluate(() =>
    window.SIM.netz.list().filter(n => n.kind === 'host').every(n => !!n.nics[0].ip)));

  const dhcpZeilen = await page.evaluate(() =>
    window.SIM.mit.view().filter(r => r.proto === 'DHCP').map(r => r.info));
  ok('der Mitschnitt erzählt die vier Schritte',
     ['Discover', 'Offer', 'Request', 'Ack'].every(w => dhcpZeilen.some(t => t.includes(w))),
     dhcpZeilen.slice(0, 4).join(' | '));

  // Der Filter kennt DHCP jetzt auch.
  await mitschnitt(page, true);
  await page.waitForTimeout(400);
  await mitschnitt(page, true);
  await page.locator('[data-proto="DHCP"]').click();
  await page.waitForTimeout(300);
  const nurDhcp = await page.locator('.tr-p').allTextContents();
  ok('DHCP-Filter greift', nurDhcp.length > 0 && nurDhcp.every(p => p === 'DHCP'), nurDhcp.join(','));
  /* Aufklappen: UDP-Ports und die MAC, für die das Angebot gilt.
     Der Klick geht hier über das Element selbst und nicht über die
     Maus: bei zwölf DHCP-Zeilen ist die Liste gescrollt, und eine
     Zeile unter der Kopfleiste des Mitschnitts ist mit der Maus
     nicht zuverlässig zu treffen. Geprüft wird der Behandler, und
     der hängt am Element. */
  await page.locator('.tr').filter({ hasText: 'Offer' }).first()
    .evaluate(el => el.click());
  await page.waitForTimeout(300);
  const dhcpLagen = await page.locator('.tr-lay-h').allTextContents();
  /* ⚠️ VIER Schalen, und das ist eine Rücknahme: vom 2026-09-24
     bis zum 2026-09-26 stand hier „drei Schalen, keine
     Portnummern". Vom Nutzer zurückgeholt, als TCP dazukam — mit
     HTTP und E-Mail IST der Port der Unterrichtsgegenstand
     („welches Programm ist gemeint"), und stünde er dann bei TCP,
     aber nicht bei DHCP, hätte dasselbe Wort in zwei Zeilen zwei
     verschiedene Sichtbarkeiten. */
  ok('DHCP-Paket hat vier Schalen', dhcpLagen.length === 4, dhcpLagen.join(' / '));
  ok('darunter die UDP-Schale mit den Portnummern',
     dhcpLagen.some(t => t.includes('UDP')), dhcpLagen.join(' / '));
  /* ⚠️ DHCP auf Schicht 7, nicht 4. Es benutzt UDP, so wie HTTP
     TCP benutzt — und HTTP stand längst richtig auf 7. Bis zum
     2026-09-26 standen UDP und DHCP beide auf 4, also
     nebeneinander auf derselben Schicht, was die ganze Aussage
     der Schalen aufhob: das eine STECKT im anderen. */
  ok('UDP ist Schicht 4 und DHCP Schicht 7',
     dhcpLagen.some(t => /Schicht 4\b/.test(t) && t.includes('UDP'))
     && dhcpLagen.some(t => /Schicht 7\b/.test(t) && t.includes('DHCP')),
     dhcpLagen.join(' / '));
  const udpFelder = await page.locator('.tr-det .tr-f').allTextContents();
  ok('und sie nennt 67 als den Port, der dem DHCP-Server gehört',
     udpFelder.some(f => /67/.test(f) && /DHCP-Server/.test(f)),
     udpFelder.join(' | ').slice(0, 240));
  const dhcpFelder = await page.locator('.tr-det .tr-f').allTextContents();
  ok('das Angebot nennt die MAC, für die es gilt',
     dhcpFelder.some(f => /gilt für/.test(f)), dhcpFelder.join(' | ').slice(0, 200));
  await mitschnitt(page, true);
  await page.locator('[data-proto=""]').click();
  await mitschnitt(page, false);
  await page.waitForTimeout(300);

  console.log('\n── DNS: Namen statt Zahlen ─────────────────────────');
  await szenarioWaehlen(page, 'namen');
  await page.waitForTimeout(600);
  ok('DNS-Szenario geladen', await page.evaluate(() => window.SIM.netz.count) === 7);
  await page.locator('[data-modus="aktion"]').click();
  await page.locator('#speed').fill('4');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const S = window.SIM;
    const r1 = S.netz.byName('Endgerät 1');
    S.geraet.open(r1.id);
    S.term.submit(r1.id, 'ping www.schule.de');
  });
  await page.waitForTimeout(5000);
  const dnsOut = await page.evaluate(() =>
    window.SIM.term.linesOf(window.SIM.netz.byName('Endgerät 1').id).map(l => l.text).join('\n'));
  ok('der Name wird zuerst gefragt', /www\.schule\.de ist 192\.168\.2\.30/.test(dnsOut), dnsOut.slice(-500));
  ok('und der Ping kommt an', /angekommen/.test(dnsOut) && /Antwort von 192\.168\.2\.30/.test(dnsOut),
     dnsOut.slice(-400));
  const dnsZeilen = await page.evaluate(() =>
    window.SIM.mit.view().filter(r => r.proto === 'DNS').map(r => r.info));
  ok('Frage und Antwort stehen im Mitschnitt',
     dnsZeilen.some(t => /welche Adresse hat/.test(t)) && dnsZeilen.some(t => /ist 192\.168\.2\.30/.test(t)),
     dnsZeilen.join(' | '));

  /* Der DNS-Server ist ein PROGRAMM auf einem Rechner — wie in
     Filius. Also liegt er als Kachel auf dem Gerät, nicht als
     Schalter im Einstellformular. */
  await page.evaluate(() => {
    const S = window.SIM;
    S.geraet.open(S.netz.byName('DNS-Server').id);
  });
  await page.waitForTimeout(300);
  ok('das installierte Programm liegt als Kachel bereit',
     await page.locator('[data-app="dns"]').count() === 1);
  ok('auf einem Rechner ohne das Programm liegt keine',
     await page.evaluate(async () => {
       const S = window.SIM;
       S.geraet.open(S.netz.byName('Endgerät 1').id);
       return true;
     }) && (await page.waitForTimeout(250),
            await page.locator('[data-app="dns"]').count() === 0));

  await page.evaluate(() => {
    const S = window.SIM;
    S.geraet.open(S.netz.byName('DNS-Server').id);
  });
  await page.waitForTimeout(250);
  await programmAuf(page, 'dns');
  await page.waitForTimeout(300);
  ok('der DNS-Server zeigt seinen Eintrag',
     await page.locator('#dtWin input.f[data-dnsf="name"]').count() === 1);
  ok('und dass er läuft',
     (await page.locator('.dns-stand').textContent()) === 'läuft');

  /* ⚠️ Vom Nutzer gestrichen: der Knopf „Alle Geräte eintragen",
     der jedem Gerät mit Adresse auf einmal einen Namen gab. Er nahm
     genau die Arbeit ab, die die Aufgabe IST — jedes Gerät wird
     einzeln eingetragen. Die Prüfung steht hier, weil ein
     Bequemlichkeitsknopf beim nächsten Umbau leicht wieder
     entsteht. */
  ok('den Knopf „Alle Geräte eintragen" gibt es nicht mehr',
     await page.locator('#dtWin #dnsAlle').count() === 0);
  ok('„Hinzufügen" trägt die ganze Breite, es steht nichts daneben',
     await page.evaluate(() => {
       const b = document.querySelector('#dtWin #dnsAdd');
       const box = b.parentElement.getBoundingClientRect();
       return b.getBoundingClientRect().width > box.width * 0.9;
     }));
  await page.locator('#dtWin #dnsAdd').click();
  await page.waitForTimeout(250);
  await page.locator('#dtWin input.f[data-dnsf="name"]').last().fill('drucker.schule');
  await page.locator('#dtWin input.f[data-dnsf="ip"]').last().fill('192.168.2.30');
  await page.waitForTimeout(300);
  ok('ein zweiter Name lässt sich eintragen', await page.evaluate(() =>
    window.SIM.netz.byName('DNS-Server').dnsServer.records.length === 2));
  await page.evaluate(() => {
    const S = window.SIM;
    const r1 = S.netz.byName('Endgerät 1');
    S.term.submit(r1.id, 'nslookup drucker.schule');
  });
  await page.waitForTimeout(2500);
  const nsOut = await page.evaluate(() =>
    window.SIM.term.linesOf(window.SIM.netz.byName('Endgerät 1').id).map(l => l.text).join('\n'));
  ok('der selbst eingetragene Name wird gefunden',
     /drucker\.schule\s+→\s+192\.168\.2\.30/.test(nsOut), nsOut.slice(-300));

  /* ─── Die Marke „DNS" unter der Kachel ────────────────────────
     Vom Nutzer verlangt: „Der DNS soll auch ein Symbol unter sich
     bekommen wie der DHCP, sodass man sieht, dass es ein DNS ist."
     Vorher war „wer ist hier der DNS-Server" nur zu beantworten,
     indem man jedes Gerät einzeln aufmachte — bei DHCP war das
     schon gelöst.

     Geschaltet wird über den KNOPF im Fenster, nicht über das
     Modell: der Weg vom Knopf zur Fläche ist das, was hier
     ausfallen kann. */
  ok('der laufende DNS-Server trägt eine Marke an der Kachel',
     await markenAn(page, 'DNS-Server', 'dns') === 1,
     String(await markenAn(page, 'DNS-Server', 'dns')));
  ok('und sonst niemand', await page.locator('.nf .nf-dns').count() === 1,
     String(await page.locator('.nf .nf-dns').count()));
  ok('auf der Pille steht das Kurzwort',
     (await page.locator('.nf .nf-dns text').first().textContent()) === 'DNS');
  /* Der ganze Satz steht im Kurzhinweis — die Pille muss schmal
     bleiben, sonst deckt sie die Kabel der Nachbarn zu. */
  ok('der Kurzhinweis sagt, was das Gerät tut',
     /DNS-Server/.test(await page.locator('.nf .nf-dns title').first().textContent()));

  await page.locator('#dtWin #dnsStart').click();
  await page.waitForTimeout(350);
  ok('„Beenden" nimmt die Marke im selben Augenblick weg',
     await markenAn(page, 'DNS-Server', 'dns') === 0,
     String(await markenAn(page, 'DNS-Server', 'dns')));
  ok('und das Fenster sagt „gestoppt"',
     (await page.locator('#dtWin .dns-stand').textContent()) === 'gestoppt');
  await page.locator('#dtWin #dnsStart').click();
  await page.waitForTimeout(350);
  ok('„Starten" bringt sie zurück',
     await markenAn(page, 'DNS-Server', 'dns') === 1);

  /* ⚠️ Und die Gegenprobe zum Wunsch „wirklich aktiv, nicht nur
     installiert": das Programm bleibt liegen, der Dienst geht aus.
     Ein Gerät mit gestopptem Server sieht dann genauso aus wie
     eines ohne Programm — und das ist richtig, es tut dasselbe:
     nichts. */
  ok('ein Endgerät ohne das Programm trägt keine DNS-Marke',
     await markenAn(page, 'Endgerät 1', 'dns') === 0);

  /* ═══════════════════════════════════════════════════════════
     TCP UND PORTS
     ═══════════════════════════════════════════════════════════
     Der Zustandsautomat selbst steht im kopflosen Prüfstand —
     dort ist er billiger und genauer zu messen. Hier wird nur
     geprüft, was NUR ein Browser zeigen kann: dass die Datei
     überhaupt geladen ist, dass `netstat` im Terminal antwortet
     und dass der Mitschnitt die Schale und den Filter dafür hat.
     Bis Stufe 3 (HTTP) gibt es sonst keine Oberfläche dazu. */
  console.log('\n── TCP und Ports ───────────────────────────────────');
  ok('tcp.js ist geladen', await page.evaluate(() => !!window.Tcp));

  // netstat auf dem DNS-Server: er hört auf 53, und es steht dabei,
  // WER da hört. Genau diese Spalte fehlt in Filius.
  await page.evaluate(() => {
    const S = window.SIM;
    S.term.submit(S.netz.byName('DNS-Server').id, 'netstat');
  });
  await page.waitForTimeout(300);
  const nsTxt = await page.evaluate(() =>
    window.SIM.term.linesOf(window.SIM.netz.byName('DNS-Server').id).map(l => l.text).join('\n'));
  ok('netstat nennt den offenen Port', /\b53\b/.test(nsTxt.split('netstat').pop() || ''), nsTxt.slice(-300));
  ok('und das Programm dahinter', /DNS-Server/.test(nsTxt.split('netstat').pop() || ''), nsTxt.slice(-300));
  /* ⚠️ Die Breite ist hier eine PRÜFUNG und keine Kosmetik: das
     Terminal steht auch im Gerätefenster, und das ist rund 330 px
     schmal. Filius' Kopfzeile (72 Zeichen) brach dort mitten im
     Wort um — gezeigt hat das nur das Bild. Gemessen wird nur die
     Ausgabe von netstat, nicht der ganze Verlauf: ein anderer
     Befehl mit langen Zeilen soll diese Prüfung nicht umwerfen. */
  const nsBlock = (nsTxt.split('netstat').pop() || '').split('\n');
  ok('mit einer Kopfzeile, die auch im Gerätefenster in eine Zeile passt',
     /Proto\s+Port\s+Zustand\s+Programm/.test(nsTxt)
     && nsBlock.every(l => l.length <= 46),
     nsBlock.map(l => l.length).join(','));

  // Eine echte Verbindung über die Fläche, damit Mitschnitt,
  // Filterchip und der fliegende Punkt einmal wirklich laufen.
  await page.evaluate(() => {
    const S = window.SIM;
    const server = S.netz.byName('Server 1') || S.netz.list().find(n => n.kind === 'server');
    const client = S.netz.byName('Endgerät 1');
    S.stack.tcpHoeren(server, 80, (c) => { c.onDaten((t) => c.senden('hallo zurück')); }, 'Webserver');
    S.stack.tcpVerbinde(client, server.nics.find(k => k.ip).ip, 80, 'Webbrowser',
      (err, c) => { if (!err) c.senden('guten Tag'); });
  });
  await page.waitForTimeout(2500);
  const tcpZeilen = await page.evaluate(() =>
    window.SIM.mit.view().filter(r => r.proto === 'TCP').map(r => r.info));
  ok('der Mitschnitt kennt TCP-Zeilen', tcpZeilen.length >= 3, String(tcpZeilen.length));
  ok('und der Handschlag steht darin',
     tcpZeilen.some(t => /\[SYN\]/.test(t)) && tcpZeilen.some(t => /\[SYN, ACK\]/.test(t)),
     tcpZeilen.slice(0, 4).join(' | '));

  await mitschnitt(page, true);

  await page.locator('[data-proto="TCP"]').click();
  await page.waitForTimeout(300);
  const chipProtos = await page.locator('.tr-p').allTextContents();
  ok('der Filterchip TCP greift',
     chipProtos.length > 0 && chipProtos.every(p => p === 'TCP'), chipProtos.join(','));

  await page.locator('.tr').filter({ hasText: 'SYN' }).first().evaluate(el => el.click());
  await page.waitForTimeout(300);
  const tcpLagen = await page.locator('.tr-lay-h').allTextContents();
  ok('ein TCP-Segment hat eine eigene Schale',
     tcpLagen.some(t => t.includes('TCP')), tcpLagen.join(' / '));
  const tcpFelder = await page.locator('.tr-det .tr-f').allTextContents();
  ok('sie nennt beide Portnummern und die Flags',
     tcpFelder.some(f => /Absenderport/.test(f)) && tcpFelder.some(f => /Zielport/.test(f))
     && tcpFelder.some(f => /Flags/.test(f)),
     tcpFelder.join(' | ').slice(0, 240));
  ok('und sagt bei der Bestätigungsnummer dazu, dass sie die nächste erwartete ist',
     tcpFelder.some(f => /als Nächstes erwartet/.test(f)) || tcpFelder.some(f => /Bestätigt bis/.test(f)),
     tcpFelder.join(' | ').slice(0, 240));
  await mitschnitt(page, true);
  await page.locator('[data-proto=""]').click();
  await page.waitForTimeout(200);

  /* ═══════════════════════════════════════════════════════════
     DATEIEN: EXPLORER, EDITOR, BILDBETRACHTER
     ═══════════════════════════════════════════════════════════
     Das Modell steht im kopflosen Prüfstand. Hier wird geprüft,
     was nur ein Browser zeigen kann: dass ein Klick auf eine
     Datei sie öffnet (in Filius kann der Explorer das gar
     nicht), dass der Editor einfärbt und dass der Spiegel unter
     dem Eingabefeld dieselbe Größe hat wie dieses — sonst wandert
     der Textcursor von seiner Farbe weg. */
  console.log('\n── Dateien ─────────────────────────────────────────');
  await page.evaluate(() => {
    const S = window.SIM;
    S.geraet.open(S.netz.byName('Endgerät 1').id);
  });
  await page.waitForTimeout(300);
  await programmAuf(page, 'dateien');
  await page.waitForTimeout(300);
  ok('der Datei-Explorer ist ohne Installation da',
     await page.locator('#dtWin .fx-kopf').count() === 1);
  /* ⭐ Seit dem 2026-09-28 steht hier eine Zeile: der Ordner
     `/Bilder` mit den eingebauten Bildern. Vorher war das Gerät
     leer, und die Bilder steckten hinter einem Knopf, der eine
     Galerie aufschlug. */
  ok('ein neues Gerät hat den Ordner Bilder darin',
     await page.locator('#dtWin .fx-zeile').count() === 1
     && (await page.locator('#dtWin .fx-zeile').first().textContent()).includes('Bilder'));
  /* Ein Bild davon: die Knopfreihe und der Ordner sind die
     sichtbarste Änderung dieser Runde, und ob drei Knöpfe in EINE
     Zeile passen, sagt keine Prüfung, sondern nur das Bild. */
  await page.locator('#dtWin').screenshot({ path: path.join(OUT, 'shot-dateien.png') });
  ok('drei Knöpfe und keine vier',
     await page.locator('#dtWin .fx-knoepfe .k-add').count() === 3,
     String(await page.locator('#dtWin .fx-knoepfe').textContent()));

  /* Der Ordner geht auf, die vier Bilder stehen darin, und ein
     Klick zeigt eines — genau das, was die Galerie vorher konnte,
     nur am richtigen Ort. */
  await page.locator('#dtWin [data-auf="/Bilder"]').click();
  await page.waitForTimeout(300);
  ok('darin liegen vier Bilder',
     await page.locator('#dtWin .fx-zeile').count() === 4);
  await page.locator('#dtWin [data-auf="/Bilder/schule.svg"]').click();
  await page.waitForTimeout(300);
  ok('ein Klick zeigt es im Betrachter',
     await page.evaluate(() => {
       const i = document.querySelector('#dtWin img');
       return !!i && /^data:image\/svg/.test(i.getAttribute('src') || '');
     }));
  await page.locator('#dtWin #fxZurueck').click();
  await page.waitForTimeout(250);
  await page.locator('#dtWin [data-gehe="/"]').click();
  await page.waitForTimeout(250);

  // Ordner anlegen
  await page.locator('#dtWin [data-neu="ordner"]').click();
  await page.waitForTimeout(200);
  await page.locator('#dtWin #fxNeu').fill('webserver');
  await page.locator('#dtWin #fxNeuOk').click();
  await page.waitForTimeout(300);
  ok('ein Ordner lässt sich anlegen',
     await page.evaluate(() => !!window.SIM.netz.byName('Endgerät 1').dateien['/webserver']));
  ok('und steht als Zeile da', await page.locator('#dtWin .fx-zeile').count() === 2);

  /* ─── Eine echte Datei hochladen ─────────────────────────────
     Vom Nutzer verlangt: „Echte Dateien sollen in das Dateisystem
     importiert werden können." Geprüft wird hier der WEG vom
     Knopf bis zum Eintrag; die Regeln darunter (Grenzen,
     Inhaltsspeicher) prüft der kopflose Prüfstand. */
  ok('es gibt einen Knopf „Datei hochladen"',
     await page.locator('#dtWin .fx-einfuhr').count() === 1
     && (await page.locator('#dtWin .fx-einfuhr').textContent()).includes('hochladen'));
  /* Und er nimmt Bild UND Text — das ist der ganze Punkt der
     Zusammenlegung. Geprüft am `accept`, denn was die Dateiauswahl
     des Geräts daraus macht, ist nicht mehr unsere Sache. */
  ok('und er nimmt Bilder wie Texte',
     await page.evaluate(() => {
       const a = document.querySelector('#dtWin #fxDatei').getAttribute('accept') || '';
       return a.includes('.png') && a.includes('.html');
     }));
  ok('der alte Satz „kann dieses Gerät noch nicht" ist weg',
     !(await page.locator('#dtWin').textContent()).includes('noch nicht'));

  /* Ein winziges echtes PNG (1×1 Pixel, durchsichtig). Als Puffer
     übergeben — Playwright braucht dafür keine Datei auf der
     Platte, und der Prüfstand legt keine an. */
  const pngRoh = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
    + 'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#dtWin #fxDatei').setInputFiles(
    { name: 'foto.png', mimeType: 'image/png', buffer: pngRoh });
  await page.waitForTimeout(500);
  ok('⭐ die Datei steht danach im Dateisystem',
     await page.evaluate(() => !!window.SIM.netz.byName('Endgerät 1').dateien['/foto.png']));
  ok('der Eintrag hält nur einen Schlüssel',
     await page.evaluate(() => {
       const e = window.SIM.netz.byName('Endgerät 1').dateien['/foto.png'];
       return /^blob:/.test(e.bild) && e.groesse > 0;
     }));
  /* Gezählt wird nicht, es wird gesucht: an der Wurzel liegen jetzt
     auch `/Bilder` und `/webserver`, und eine feste Zahl wäre beim
     nächsten Ordner ab Werk wieder falsch. */
  ok('und sie steht als Zeile in der Liste',
     await page.locator('#dtWin [data-auf="/foto.png"]').count() === 1,
     String(await page.locator('#dtWin .fx-zeile').count()) + ' Zeilen');
  ok('darunter steht, wie viel Platz belegt ist',
     await page.locator('#dtWin .fx-platz').count() === 1);

  // Sie lässt sich auch ansehen.
  await page.locator('#dtWin [data-auf="/foto.png"]').click();
  await page.waitForTimeout(300);
  ok('die eingeführte Datei geht im Bildbetrachter auf',
     await page.locator('#dtWin img').count() >= 1);
  ok('und das Bild trägt den echten Inhalt',
     await page.evaluate(() => {
       const i = document.querySelector('#dtWin img');
       return !!i && i.src.indexOf('data:image/png') === 0;
     }));
  await page.locator('#dtWin .fx-zurueck').first().click();
  await page.waitForTimeout(250);

  /* ⭐ Und die Probe aufs Exempel: der Inhalt darf NICHT im
     Speicherformat stehen — dort hinge er in sechzig
     Verlaufsständen. */
  ok('⭐ netz.toJSON() bleibt frei von Daten-URIs',
     await page.evaluate(() =>
       JSON.stringify(window.SIM.netz.toJSON()).indexOf('data:image/png') < 0));

  await page.evaluate(() => {
    delete window.SIM.netz.byName('Endgerät 1').dateien['/foto.png'];
    window.SIM.geraet.render();
  });
  await page.waitForTimeout(250);

  /* Hineingehen, Textdatei anlegen — sie geht gleich im Editor auf.
     ⚠️ Der Ordner wird beim NAMEN gepackt und nicht als `.first()`:
     seit `/Bilder` ab Werk dasteht, ist der erste Eintrag ein
     anderer (Ordner zuerst, dann nach Namen) — und die Prüfung lief
     danach fünf Zeilen lang im falschen Ordner weiter. */
  await page.locator('#dtWin [data-auf="/webserver"]').click();
  await page.waitForTimeout(250);
  ok('ein Klick auf den Ordner geht hinein',
     (await page.locator('#dtWin .fx-kopf').textContent()).includes('webserver'));
  await page.locator('#dtWin [data-neu="text"]').click();
  await page.waitForTimeout(200);
  await page.locator('#dtWin #fxNeu').fill('index.html');
  await page.locator('#dtWin #fxNeuOk').click();
  await page.waitForTimeout(350);
  ok('eine neue Textdatei geht gleich im Editor auf',
     await page.locator('#dtWin .ed-in').count() === 1);

  await page.locator('#dtWin .ed-in').fill('<h1 class="a">Hallo</h1>\n<!-- Notiz -->');
  await page.waitForTimeout(300);
  const marken = await page.locator('#dtWin .ed-spiegel .sy').evaluateAll(
    els => els.map(e => e.className.replace('sy sy--', '')));
  ok('der Editor färbt Marke, Attribut, Wert und Text',
     ['tag', 'attr', 'wert', 'txt'].every(k => marken.includes(k)), marken.join(','));
  ok('und einen Kommentar', marken.includes('kom'), marken.join(','));

  /* Dass die vier Sorten die RICHTIGEN Stücke treffen, prüft der
     kopflose Prüfstand (Abschnitt „Hervorhebung") — dort geht es
     ohne Browser und genauer. Hier zählt nur, dass die Farben
     auch wirklich verschieden auf dem Schirm landen: ein
     Stylesheet ohne die Token wäre grün geprüft und grau zu
     sehen. */
  ok('und die Sorten sind auf dem Schirm wirklich verschieden gefärbt',
     await page.evaluate(() => {
       const f = (k) => {
         const e = document.querySelector('#dtWin .ed-spiegel .sy--' + k);
         return e ? getComputedStyle(e).color : null;
       };
       const t = f('tag'), a = f('attr'), w = f('wert');
       return t && a && w && t !== a && a !== w && t !== w;
     }));

  /* ⚠️ Die Maße von Spiegel und Eingabefeld müssen übereinstimmen.
     Weicht auch nur der Innenabstand ab, steht der Textcursor
     schon nach wenigen Zeilen neben seiner Farbe — und das sieht
     wie ein kaputtes Programm aus. */
  ok('Spiegel und Eingabefeld liegen deckungsgleich', await page.evaluate(() => {
    const a = document.querySelector('#dtWin .ed-spiegel');
    const b = document.querySelector('#dtWin .ed-in');
    const sa = getComputedStyle(a), sb = getComputedStyle(b);
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return sa.fontFamily === sb.fontFamily && sa.fontSize === sb.fontSize
      && sa.lineHeight === sb.lineHeight && sa.paddingLeft === sb.paddingLeft
      && sa.paddingTop === sb.paddingTop && sa.whiteSpace === sb.whiteSpace
      && Math.abs(ra.left - rb.left) < 1 && Math.abs(ra.top - rb.top) < 1;
  }));

  // JavaScript wird angezeigt, aber als „läuft nicht" markiert.
  await page.locator('#dtWin .ed-in').fill('<p>x</p><script>alert(1)</script>');
  await page.waitForTimeout(300);
  ok('JavaScript wird als „wird nicht ausgeführt" gezeichnet',
     await page.locator('#dtWin .ed-spiegel .sy--js').count() === 1);
  ok('und ein Satz sagt es auch',
     await page.evaluate(() => !document.querySelector('#dtWin #fxJs').hidden));
  ok('durchgestrichen, nicht versteckt', await page.evaluate(() => {
    const e = document.querySelector('#dtWin .ed-spiegel .sy--js');
    return !!e && /line-through/.test(getComputedStyle(e).textDecorationLine)
      && e.textContent.indexOf('alert(1)') >= 0;
  }));

  // Speichern und zurück
  await page.locator('#dtWin .ed-in').fill('<h1>Meine Seite</h1>');
  await page.waitForTimeout(250);
  await page.locator('#dtWin #fxSpeichern').click();
  await page.waitForTimeout(300);
  ok('Speichern schreibt in die Datei', await page.evaluate(() =>
    window.SIM.netz.byName('Endgerät 1').dateien['/webserver/index.html'].text === '<h1>Meine Seite</h1>'));

  /* ⚠️ Und der Fall, der im Unterricht wirklich passiert: tippen
     und einfach zurückgehen, ohne zu speichern. Ein Text, der
     dabei weg wäre, ist der teuerste Fehler dieses Programms. */
  await page.locator('#dtWin .ed-in').fill('<h1>Ohne Speichern</h1>');
  await page.waitForTimeout(250);
  await page.locator('#dtWin #fxZurueck').click();
  await page.waitForTimeout(300);
  ok('Zurückgehen sichert den Text auch ohne Speichern-Klick',
     await page.evaluate(() =>
       window.SIM.netz.byName('Endgerät 1').dateien['/webserver/index.html'].text === '<h1>Ohne Speichern</h1>'));
  ok('und man steht wieder in der Liste',
     await page.locator('#dtWin .fx-liste').count() === 1);

  /* ─── Ein Bild in den Ordner des Webservers ───────────────────
     ⚠️ Hier stand die Galerie *Bild einfügen* (vier eingebaute
     Bilder zum Anklicken). Sie ist am 2026-09-28 weggefallen: die
     Bilder liegen als Ordner `/Bilder` auf dem Gerät und werden
     oben geprüft. Der Weg zu einem Bild IM WEBSERVER-ORDNER geht
     seither über denselben Knopf wie jede andere Datei — das ist
     der Sinn der Zusammenlegung, und genau der wird hier gegangen. */
  await page.locator('#dtWin [data-neu="text"]').click();
  await page.waitForTimeout(250);
  /* ⚠️ „Anlegen" darf NICHT rot sein. Rot heißt auf dieser
     Oberfläche „nimmt etwas weg" (deinstallieren, löschen) — eine
     Runde lang stand es auch unter dem Knopf, der etwas ANLEGT,
     und das hat nur das Bild gezeigt. Verglichen wird gegen die
     Farbe des Löschknopfes, nicht gegen einen Zahlenwert: eine
     festgeschriebene Farbe wäre beim nächsten Themenwechsel
     falsch. */
  ok('„Anlegen" trägt nicht die Farbe des Löschens', await page.evaluate(() => {
    const anlegen = document.querySelector('#dtWin #fxNeuOk');
    const probe = document.createElement('button');
    probe.className = 'sw-ja'; probe.style.position = 'absolute'; probe.style.opacity = '0';
    document.body.appendChild(probe);
    const rot = getComputedStyle(probe).backgroundColor;
    const ist = getComputedStyle(anlegen).backgroundColor;
    probe.remove();
    return !!anlegen && ist !== rot;
  }));
  await page.locator('#dtWin [data-neu=""]').click();
  await page.waitForTimeout(250);

  /* ⚠️ Ein echtes SVG und nicht das 1×1-PNG von oben: zwei Zeilen
     weiter wird gemessen, ob das Bild WIRKLICH zu sehen ist (mehr
     als 20 px breit). Ein Pixel ist ein Pixel breit — die Prüfung
     hätte etwas Richtiges gemeldet und dabei die falsche Ursache
     behauptet. Vorher kam das Bild aus der Galerie und war ein SVG. */
  const svgRoh = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">'
    + '<rect width="160" height="120" fill="#2a6df4"/></svg>', 'utf8');
  await page.locator('#dtWin #fxDatei').setInputFiles(
    { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: svgRoh });
  await page.waitForTimeout(500);
  ok('ein Bild lässt sich in den Webserver-Ordner hochladen', await page.evaluate(() =>
    /^blob:/.test(window.SIM.netz.byName('Endgerät 1').dateien['/webserver/logo.svg'].bild || '')));
  ok('ein Bild geht NICHT im Editor auf',
     await page.locator('#dtWin .ed-in').count() === 0);

  await page.locator('#dtWin [data-auf$="logo.svg"]').click();
  await page.waitForTimeout(300);
  ok('ein Klick auf das Bild zeigt es an',
     await page.locator('#dtWin .bv img').count() === 1);
  ok('und es ist wirklich zu sehen', await page.evaluate(() => {
    const i = document.querySelector('#dtWin .bv img');
    return !!i && i.getBoundingClientRect().width > 20;
  }));
  await page.locator('#dtWin #fxZurueck').click();
  await page.waitForTimeout(250);

  // Umbenennen und Löschen fragen IN der Zeile — kein Systemdialog.
  await page.locator('#dtWin [data-umstart$="logo.svg"]').click();
  await page.waitForTimeout(250);
  await page.locator('#dtWin #fxUm').fill('bild.png');
  await page.locator('#dtWin [data-um]').click();
  await page.waitForTimeout(300);
  ok('Umbenennen geht in der Zeile', await page.evaluate(() =>
    !!window.SIM.netz.byName('Endgerät 1').dateien['/webserver/bild.png']));

  await page.locator('#dtWin [data-wegstart$="bild.png"]').click();
  await page.waitForTimeout(250);
  ok('Löschen fragt erst — in der Zeile, nicht im Systemdialog',
     await page.locator('#dtWin .fx-zeile.is-frage').count() === 1
     && await page.evaluate(() => !!window.SIM.netz.byName('Endgerät 1').dateien['/webserver/bild.png']));
  await page.locator('#dtWin [data-nein]').click();
  await page.waitForTimeout(250);
  ok('„Nein" lässt die Datei liegen', await page.evaluate(() =>
    !!window.SIM.netz.byName('Endgerät 1').dateien['/webserver/bild.png']));
  await page.locator('#dtWin [data-wegstart$="bild.png"]').click();
  await page.waitForTimeout(200);
  await page.locator('#dtWin [data-weg]').click();
  await page.waitForTimeout(300);
  ok('„Ja" löscht sie', await page.evaluate(() =>
    !window.SIM.netz.byName('Endgerät 1').dateien['/webserver/bild.png']));

  // Und das Terminal sieht dieselben Dateien.
  await programmAuf(page, 'terminal');
  await page.waitForTimeout(250);
  await page.locator('#termInput').fill('ls /webserver');
  await page.locator('#termInput').press('Enter');
  await page.waitForTimeout(300);
  ok('das Terminal sieht dieselben Dateien',
     (await page.locator('#termOut').textContent()).includes('index.html'));
  await programmAuf(page, 'terminal');
  await page.waitForTimeout(200);

  /* ═══════════════════════════════════════════════════════════
     WEBSERVER UND WEBBROWSER
     ═══════════════════════════════════════════════════════════
     Das Protokoll prüft der kopflose Prüfstand. Hier geht es um
     das, was nur ein Browser zeigen kann: dass die Seite wirklich
     GEZEICHNET wird (mit ihrem CSS und ihrem Bild) und dass ein
     eingeschmuggeltes `<script>` dabei NICHT läuft. */
  console.log('\n── Webserver und Webbrowser ────────────────────────');
  const webNamen = await page.evaluate(() => {
    const S = window.SIM;
    const srv = S.netz.byName('Webserver')
             || S.netz.list().find(n => n.kind === 'server');
    const cli = S.netz.byName('Endgerät 1');
    srv.software = (srv.software || []).concat(['webserver']);
    S.dienste.http.standardDateien(srv);
    S.netz.webConf(srv).on = true;
    cli.software = (cli.software || []).concat(['browser']);
    S.dienste.sync();
    return { srv: srv.name, ip: (srv.nics.find(k => k.ip) || {}).ip };
  });
  ok('der Aufbau steht', !!webNamen.ip, JSON.stringify(webNamen));

  await page.evaluate((name) => window.SIM.geraet.open(window.SIM.netz.byName(name).id), webNamen.srv);
  await page.waitForTimeout(350);
  await programmAuf(page, 'webserver');
  await page.waitForTimeout(350);
  ok('das Webserver-Fenster zeigt Ordner und Port als feste Angabe',
     (await page.locator('#dtWin .ws-fakten').textContent()).includes('/webserver')
     && (await page.locator('#dtWin .ws-fakten').textContent()).includes('80'));
  ok('und die vier Dateien, die die Installation angelegt hat',
     await page.locator('#dtWin .ws-datei').count() === 4);
  ok('der Stand sagt „läuft"',
     (await page.locator('#dtWin .dns-stand').textContent()) === 'läuft');

  /* Und dieselbe Marke wie beim DNS-Server — vom Nutzer verlangt:
     „Mail Server und Webserver brauchen auch ein Symbol."

     ⚠️ Geschaltet wird über den KNOPF, und zwar zweimal: der
     Aufbau dieses Abschnitts hat den Server über das MODELL
     gestartet (`webConf(srv).on = true` in einem `page.evaluate`),
     und davon weiß die Fläche nichts. Das ist kein Mangel — ein
     Kind kann nur den Knopf drücken, und genau dieser Weg wird
     hier geprüft. */
  await page.locator('#dtWin #wsStart').click();
  await page.waitForTimeout(350);
  ok('nach „Beenden" trägt die Kachel keine Web-Marke',
     await markenAn(page, webNamen.srv, 'web') === 0,
     String(await markenAn(page, webNamen.srv, 'web')));
  ok('das Programm bleibt dabei liegen — gestoppt ist nicht entfernt',
     await page.evaluate((nm) =>
       window.SIM.netz.byName(nm).software.indexOf('webserver') >= 0, webNamen.srv));
  await page.locator('#dtWin #wsStart').click();
  await page.waitForTimeout(350);
  ok('„Starten" schreibt die Marke im selben Augenblick hin',
     await markenAn(page, webNamen.srv, 'web') === 1,
     String(await markenAn(page, webNamen.srv, 'web')));
  ok('auf der Pille steht „Web"',
     (await page.locator('.nf .nf-web text').first().textContent()) === 'Web');
  ok('und der Server läuft wieder',
     (await page.locator('#dtWin .dns-stand').textContent()) === 'läuft');

  // Ein Klick auf eine Datei springt in den Datei-Explorer.
  await page.locator('#dtWin [data-datei$="index.html"]').click();
  await page.waitForTimeout(400);
  ok('ein Klick auf die Datei öffnet sie im Datei-Explorer',
     await page.locator('#dtWin .ed-in').count() === 1
     && (await page.locator('#dtWin .fx-titel').textContent()) === 'index.html');

  /* ⚠️ Und jetzt ein Skript in die Seite schreiben. Es muss
     gespeichert werden, es muss im Editor stehen — und es darf
     im Browser NICHT laufen. */
  await page.locator('#dtWin .ed-in').fill(
    '<html><head><link rel="stylesheet" href="stil.css"></head><body>'
    + '<h1 id="k">Hallo aus der 7b</h1><img src="synir-logo.png">'
    + '<script>document.getElementById("k").textContent = "GEKAPERT";'
    + 'window.name = "gelaufen";</' + 'script></body></html>');
  await page.waitForTimeout(250);
  await page.locator('#dtWin #fxSpeichern').click();
  await page.waitForTimeout(300);

  // Zum Browser auf dem Endgerät.
  await page.locator('#speed').fill('4');
  await page.evaluate(() => window.SIM.geraet.open(window.SIM.netz.byName('Endgerät 1').id));
  await page.waitForTimeout(350);
  await programmAuf(page, 'browser');
  await page.waitForTimeout(300);
  ok('die Adresszeile ist leer und trägt den Vorsatz http://',
     (await page.locator('#dtWin #wbAdr').inputValue()) === ''
     && (await page.locator('#dtWin .wb-vor').textContent()) === 'http://');
  /* ⚠️ Und sie ist auch WIRKLICH zu sehen: `.k-add` ist ein
     Blockknopf über die ganze Breite, und „Start" hat die
     Adresszeile schon einmal ganz verdeckt. Das hat nur das Bild
     gezeigt — deshalb wird hier die Breite gemessen. */
  ok('und sie nimmt den Platz ein, nicht der Knopf', await page.evaluate(() => {
    const a = document.querySelector('#dtWin .wb-adr').getBoundingClientRect();
    const s = document.querySelector('#dtWin #wbStart').getBoundingClientRect();
    return a.width > s.width * 1.5;
  }));

  await page.locator('#dtWin #wbAdr').fill(webNamen.ip);
  await page.locator('#dtWin #wbStart').click();
  await page.waitForTimeout(9000);

  ok('die Seite kommt an', await page.locator('#dtWin .wb-rahmen').count() === 1,
     (await page.locator('#dtWin .wb-fehler').count())
       ? await page.locator('#dtWin .wb-fehler').textContent() : 'kein Rahmen');
  ok('⭐ drei Anfragen für eine Seite', await page.locator('#dtWin .wb-teil').count() === 3,
     (await page.locator('#dtWin .wb-teile').textContent() || '').trim());
  ok('alle drei mit 200',
     await page.locator('#dtWin .wb-teil.is-bad').count() === 0);

  const rahmen = page.frameLocator('#dtWin .wb-rahmen');
  ok('die Überschrift steht wirklich auf der Seite',
     (await rahmen.locator('h1').textContent()) === 'Hallo aus der 7b',
     await rahmen.locator('h1').textContent());
  /* Das CSS kam als zweite Anfrage und wirkt: die Überschrift
     ist blau, nicht schwarz. */
  ok('und die Stildatei wirkt',
     await rahmen.locator('h1').evaluate(e => getComputedStyle(e).color) !== 'rgb(0, 0, 0)',
     await rahmen.locator('h1').evaluate(e => getComputedStyle(e).color));
  ok('das Bild ist wirklich geladen (dritte Anfrage)',
     await rahmen.locator('img').evaluate(e => e.complete && e.naturalWidth > 0));

  /* ⭐ Die Sicherung: der Rahmen ist eine Sandkiste OHNE
     `allow-scripts`. Das Skript steht in der Datei, es wurde
     gespeichert — und es hat nichts getan. */
  /* Seit 2026-09-30 (PLAN-SICHERHEIT 2): `allow-scripts allow-forms`
     für die Brücke des Simulators — aber OHNE `allow-same-origin`,
     und mit einer Richtlinie, die nur den Einmalschlüssel der Brücke
     zulässt. Das Skript der Seite hat ihn nicht. */
  ok('der Rahmen ist eine Sandkiste: Skripte und Formulare, aber nie allow-same-origin', await page.evaluate(() => {
    const f = document.querySelector('#dtWin .wb-rahmen');
    const sb = f.getAttribute('sandbox');
    return sb === 'allow-scripts allow-forms' && sb.indexOf('allow-same-origin') < 0;
  }));
  ok('und in der Seite steht eine Richtlinie, die nur den Einmalschlüssel zulässt', await page.evaluate(() => {
    const f = document.querySelector('#dtWin .wb-rahmen');
    const m = /script-src 'nonce-([0-9a-f]{24})'/.exec(f.srcdoc);
    return !!m && f.srcdoc.indexOf('nonce="' + m[1] + '"') > 0 && /default-src 'none'/.test(f.srcdoc);
  }));
  ok('das Skript hat die Überschrift NICHT verändert',
     (await rahmen.locator('h1').textContent()) !== 'GEKAPERT');
  ok('und steht gar nicht erst in der gezeigten Seite',
     await page.evaluate(() => {
       const f = document.querySelector('#dtWin .wb-rahmen');
       /* Genau EIN Skript steht in der Seite: die Brücke. Das der Seite
          ist durch einen Kommentar ersetzt. */
       return (f.srcdoc.match(/<script/gi) || []).length === 1 && /nicht ausgeführt/.test(f.srcdoc)
         && !/GEKAPERT/.test(f.srcdoc);
     }));

  // Eine Adresse, hinter der nichts ist.
  await page.locator('#dtWin #wbAdr').fill('192.168.99.99');
  await page.locator('#dtWin #wbStart').click();
  await page.waitForTimeout(9000);
  ok('eine Adresse ins Leere meldet sich mit dem Satz aus Filius',
     await page.locator('#dtWin .wb-fehler').count() === 1,
     await page.locator('#dtWin .wb-seite').textContent());

  // Und der Mitschnitt nennt HTTP beim Namen.
  const httpZeilen = await page.evaluate(() =>
    window.SIM.mit.view().filter(r => r.proto === 'HTTP').map(r => r.info));
  ok('der Mitschnitt zeigt die GET-Zeilen',
     httpZeilen.some(t => /GET \/stil\.css/.test(t)), httpZeilen.slice(0, 4).join(' | '));
  ok('und den Filterchip dafür',
     await page.locator('[data-proto="HTTP"]').count() === 1);

  /* ═══════════════════════════════════════════════════════════
     E-MAIL
     ═══════════════════════════════════════════════════════════
     Die Protokolle prüft der kopflose Prüfstand. Hier geht es um
     den Weg durch die Oberfläche: Konto einrichten, schreiben,
     senden, abholen, lesen — und dass der Posteingang beim
     Empfänger WIRKLICH leer ist, bis er abholt. */
  console.log('\n── E-Mail ──────────────────────────────────────────');
  const mlIp = await page.evaluate(() => {
    const S = window.SIM;
    const srv = S.netz.byName('Webserver') || S.netz.list().find(n => n.kind === 'server');
    const a = S.netz.byName('Endgerät 1');
    const c = S.netz.byName('Endgerät 2');
    srv.software = (srv.software || []).concat(['mailserver']);
    Object.assign(S.netz.mailConf(srv), { on: true, domain: 'schule.de', konten: [
      { benutzer: 'anna',  name: 'Anna',  passwort: 'apfel', posteingang: [] },
      { benutzer: 'bernd', name: 'Bernd', passwort: 'birne', posteingang: [] }
    ] });
    const ip = (srv.nics.find(k => k.ip) || {}).ip;
    a.software = (a.software || []).concat(['mail']);
    c.software = (c.software || []).concat(['mail']);
    Object.assign(S.netz.mailKonto(c), { name: 'Bernd', adresse: 'bernd@schule.de',
      domain: 'schule.de', pop3: ip, smtp: ip, benutzer: 'bernd', passwort: 'birne' });
    S.dienste.sync();
    return ip;
  });
  await page.locator('#speed').fill('4');

  /* Das Konto von Anna wird über die OBERFLÄCHE eingerichtet —
     das ist der Weg, den ein Kind geht. */
  await page.evaluate(() => window.SIM.geraet.open(window.SIM.netz.byName('Endgerät 1').id));
  await page.waitForTimeout(350);
  await programmAuf(page, 'mail');
  await page.waitForTimeout(300);
  ok('ohne Anmeldung steht gleich die Einrichtung da',
     await page.locator('#dtWin [data-k="domain"]').count() === 1);
  /* ⭐ Das Feld „E-Mail-Adresse" gibt es nicht mehr — sie ergibt
     sich aus Benutzername und Maildomain. Vom Nutzer verlangt:
     „Die E-Mail-Adresse muss beim Login nicht extra angegeben
     werden." */
  ok('⭐ ein Feld für die E-Mail-Adresse gibt es nicht mehr',
     await page.locator('#dtWin [data-k="adresse"]').count() === 0);
  /* ⭐ Die einzige Stelle im ganzen Programm, an der eine
     Portnummer im Feld steht — und sie ist vorbelegt, weil sie
     eine Eigenschaft des Protokolls ist. */
  ok('POP3-Port und SMTP-Port sind vorbelegt',
     (await page.locator('#dtWin [data-k="pop3Port"]').inputValue()) === '110'
     && (await page.locator('#dtWin [data-k="smtpPort"]').inputValue()) === '25');

  /* Das Info-Symbol: es gab im ganzen Programm keines. */
  ok('neben „Konto einrichten" steht ein (i)',
     await page.locator('#dtWin #mlInfo').count() === 1);
  await page.locator('#dtWin #mlInfo').click();
  await page.waitForTimeout(250);
  ok('es klappt eine Erklärung auf',
     await page.locator('#dtWin .k-note').count() === 1);
  ok('und sie sagt, dass das Konto auf den SERVER gehört',
     /Server/.test(await page.locator('#dtWin .k-note').textContent()));
  await page.locator('#dtWin #mlInfo').click();
  await page.waitForTimeout(200);
  ok('nochmal antippen klappt sie zu',
     await page.locator('#dtWin .k-note').count() === 0);

  for (const [feld, wert] of [['name', 'Anna'], ['domain', 'schule.de'],
                              ['pop3', mlIp], ['smtp', mlIp],
                              ['benutzer', 'anna'], ['passwort', 'apfel']]) {
    await page.locator('#dtWin [data-k="' + feld + '"]').fill(wert);
  }
  await page.waitForTimeout(350);
  ok('⭐ die Adresse ergibt sich beim Tippen',
     (await page.locator('#dtWin .ml-adresse').textContent()).includes('anna@schule.de'),
     await page.locator('#dtWin .ml-adresse').textContent());
  ok('und steht so im Modell', await page.evaluate(() =>
    window.SIM.netz.byName('Endgerät 1').mailKonto.adresse === 'anna@schule.de'));

  /* ─── Anmelden ───────────────────────────────────────────── */
  ok('der Posteingang bleibt zu, solange niemand angemeldet ist',
     await page.evaluate(() => {
       const S = window.SIM;
       S.geraet.render();
       return !document.querySelector('#dtWin #mlHolen');
     }));
  ok('am Reiter „Konto einrichten" steht noch KEIN Haken',
     await page.locator('#dtWin .ml-reg[data-seite="konto"] .ml-hk').count() === 0);
  await page.locator('#dtWin #mlAnmelden').click();
  await page.waitForTimeout(400);
  ok('während der Prüfung steht es da',
     /geprüft/.test(await page.locator('#dtWin .ml-meldung').textContent() || ''),
     await page.locator('#dtWin .ml-meldung').textContent());
  await page.waitForTimeout(12000);
  ok('⭐ nach der Anmeldung steht die eigene Adresse da',
     (await page.locator('#dtWin .ml-an--ok').textContent()).includes('anna@schule.de'),
     (await page.locator('#dtWin').textContent()).slice(0, 200));
  ok('und das Modell weiß es', await page.evaluate(() =>
    window.SIM.netz.byName('Endgerät 1').mailKonto.angemeldet === true));
  ok('⭐ die Felder sind jetzt fixiert',
     await page.locator('#dtWin [data-k="benutzer"]').isDisabled());
  ok('es gibt einen Knopf zum Abmelden',
     await page.locator('#dtWin #mlAbmelden').count() === 1);
  /* ⭐ Vom Nutzer verlangt: „Wenn ich eingeloggt bin hätte ich
     gerne einen Hacken beim ‚Konto einrichten' an dem Reiter." Er
     beantwortet von den anderen zwei Seiten aus die Frage, für die
     man sonst hierher klicken müsste. */
  ok('⭐ jetzt trägt der Reiter „Konto einrichten" einen Haken',
     await page.locator('#dtWin .ml-reg[data-seite="konto"] .ml-hk').count() === 1);
  /* ⚠️ Und NICHT in der Pillenform, in der am Posteingang die
     Anzahl steht — ein Haken in Zahlenform liest sich als Zahl. */
  ok('und nicht in der Form der Anzahl-Pille',
     await page.locator('#dtWin .ml-reg[data-seite="konto"] em').count() === 0);

  /* ─── Die zwei Serverzeilen ────────────────────────────────────
     Vom Nutzer beanstandet: „beim Konto einrichten hätte ich gerne
     vom Layout das so, dass die SMTP Felder unter POP3 stehen."
     ⚠️ Gemessen wird, nicht auf die Klasse geschaut: `.ml-konto`
     war `auto-fit` und ergab bei breitem Fenster drei Spalten —
     dann stand „SMTP-Server" unter „Maildomain". Eine Prüfung auf
     die Reihenfolge im HTML hätte das nie gefunden, die war immer
     richtig. */
  const srvZeilen = await page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector('#dtWin [data-k="' + s + '"]');
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width) };
    };
    return { name: r('name'), ben: r('benutzer'), pw: r('passwort'), dom: r('domain'),
             pop3: r('pop3'), pop3P: r('pop3Port'), smtp: r('smtp'), smtpP: r('smtpPort') };
  });
  /* ⚠️ Das hat erst das BILD gezeigt, nachdem die Serverzeilen
     schon stimmten: `auto-fit` ergab bei dieser Fensterbreite DREI
     Spalten, und „Maildomain" stand allein in einer Zeile mit zwei
     leeren Feldern daneben — wie ein Nachtrag statt wie die vierte
     Angabe. Oben zwei mal zwei Kontoangaben, darunter zwei
     Serverzeilen: die Gruppierung ist selbst die Auskunft. */
  ok('⭐ die vier Kontoangaben stehen als 2 × 2',
     Math.abs(srvZeilen.name.y - srvZeilen.ben.y) < 3
     && Math.abs(srvZeilen.pw.y - srvZeilen.dom.y) < 3
     && srvZeilen.pw.y > srvZeilen.name.y + 10,
     JSON.stringify(srvZeilen));
  ok('„Maildomain" steht also nicht allein in seiner Zeile',
     srvZeilen.dom.x > srvZeilen.pw.x, JSON.stringify(srvZeilen));
  ok('POP3-Server und POP3-Port stehen in EINER Zeile',
     srvZeilen.pop3 && Math.abs(srvZeilen.pop3.y - srvZeilen.pop3P.y) < 3,
     JSON.stringify(srvZeilen));
  ok('⭐ SMTP-Server steht UNTER POP3-Server, genau darunter',
     srvZeilen.smtp.y > srvZeilen.pop3.y + 10
     && srvZeilen.smtp.x === srvZeilen.pop3.x && srvZeilen.smtp.w === srvZeilen.pop3.w,
     JSON.stringify(srvZeilen));
  ok('und SMTP-Port unter POP3-Port',
     srvZeilen.smtpP.x === srvZeilen.pop3P.x && srvZeilen.smtpP.y > srvZeilen.pop3P.y + 10,
     JSON.stringify(srvZeilen));
  /* Das Portfeld ist das schmale von beiden — es nimmt vier
     Zeichen auf, der Servername dreißig. */
  ok('der Port bekommt weniger Platz als der Servername',
     srvZeilen.pop3P.w < srvZeilen.pop3.w, JSON.stringify(srvZeilen));
  /* ⭐ Drei Bilder vom Mailfenster. In diesem Projekt hat fast
     jede Runde etwas gefunden, das beide Prüfstände grün gemeldet
     haben („DHCIWAN", „Einstellun…", der Haken hinter der falschen
     Adresse) — und zwar immer erst am Bild. Die drei Seiten dieses
     Fensters tragen alle vier Änderungen dieser Runde. */
  await page.locator('#dtWin').screenshot({ path: path.join(OUT, 'shot-mail-konto.png') });

  /* Bernd ist über das Modell eingerichtet — für ihn geht die
     Anmeldung denselben Weg, sie wird hier nur nicht noch einmal
     geklickt. */
  await page.evaluate(() => {
    window.SIM.netz.byName('Endgerät 2').mailKonto.angemeldet = true;
  });

  await page.locator('#dtWin .ml-reg[data-seite="eingang"]').click();
  await page.waitForTimeout(250);

  /* ─── Die zwei Tätigkeiten im Posteingang ──────────────────────
     Vom Nutzer beanstandet: „die Buttons E-Mails abrufen und
     E-Mails senden hätte ich gerne bisschen deutlicher." Sie trugen
     `.k-add` — die gestrichelte Fläche für „hier kann noch etwas
     dazukommen", absichtlich leise. Eine Prüfung darauf, dass sie
     es NICHT MEHR tragen, ist der ganze Punkt; ohne sie kommt das
     bei der nächsten Umschreibung zurück. */
  ok('⭐ „E-Mails abrufen" ist kein leiser Hinzufüge-Knopf mehr',
     await page.locator('#dtWin #mlHolen.k-add').count() === 0
     && await page.locator('#dtWin #mlHolen.ml-akt').count() === 1);
  ok('und „Neue E-Mail verfassen" auch nicht',
     await page.locator('#dtWin #mlNeu.k-add').count() === 0
     && await page.locator('#dtWin #mlNeu.ml-akt').count() === 1);
  ok('beide tragen ein Symbol',
     await page.locator('#dtWin #mlHolen .ico').count() === 1
     && await page.locator('#dtWin #mlNeu .ico').count() === 1);
  /* ⚠️ Gefüllt ist NUR der, den der Satz im leeren Posteingang
     namentlich nennt. Zwei gefüllte Knöpfe nebeneinander heben
     sich gegenseitig auf — dann ist wieder keiner der erste. */
  ok('⚠️ gefüllt ist genau einer von beiden',
     await page.locator('#dtWin .ml-akt--ruf').count() === 1
     && await page.locator('#dtWin #mlHolen.ml-akt--ruf').count() === 1);
  const hoch = await page.evaluate(() =>
    Math.round(document.querySelector('#dtWin #mlHolen').getBoundingClientRect().height));
  ok('und sie sind höher als ein Formularknopf (≥ 36 px)', hoch >= 36, String(hoch));
  await page.locator('#dtWin').screenshot({ path: path.join(OUT, 'shot-mail-eingang.png') });

  await page.locator('#dtWin #mlNeu').click();
  await page.waitForTimeout(250);

  /* ═══ ⚠️ Der Fehler, um den es in dieser Runde ging ════════════
     Vom Nutzer gemeldet: „wenn ich eine Mail schreiben will und auf
     das Inputfeld zum Empfänger klicke, dann prüft er was und
     nichts passiert. Ich kann da somit nichts eintragen."

     Ursache: **zwei Elemente teilten sich die Kennung `mlAn`** —
     der Knopf „Anmelden" auf der Kontoseite und das Feld „An:" beim
     Verfassen. Beide Seiten werden in DIESELBE Box gezeichnet, also
     fand `box.querySelector('#mlAn')` beim Verfassen das Feld und
     hängte ihm den Anmelde-Empfänger an. Ein Tipp ins Feld prüfte,
     zeichnete neu — und das frische Feld hatte keinen
     Schreibstrich mehr.

     ⚠️ Beide Prüfstände waren grün, und der Grund ist die
     Prüfmethode: `fill()` setzt den Wert und feuert `input`, aber
     **es klickt nicht**. Deshalb steht hier `click()` und danach
     getippt — der Weg des Kindes. Eine Prüfung, die den
     Zwischenschritt überspringt, prüft den Zwischenschritt nicht.

     ⚠️ Und getippt wird über `page.keyboard`, NICHT über
     `locator.pressSequentially()`. Das hat die Gegenprobe gezeigt:
     ein Locator setzt vor dem Tippen selbst den Schreibstrich und
     rettet damit genau den Zustand, den die Prüfung sucht — der
     Fehler war nachgebaut, und diese Zeile blieb grün. Die Tastatur
     schreibt dorthin, wo der Strich WIRKLICH steht.

     ⭐ Dass „#mlAn gibt es nur einmal" hier NICHT geprüft wird, ist
     Absicht: auf der Verfassen-Seite stand der Knopf ja gar nicht
     im DOM — im Browser war die Kennung immer eindeutig. Genau
     deshalb liegt diese Prüfung im kopflosen Prüfstand und schaut
     in die QUELLE (`kerntest.js`, „Kennungen in den
     Programmfenstern"). */
  await page.locator('#dtWin #mlAn').click();
  await page.waitForTimeout(300);
  ok('⭐ ein Klick ins Feld „An:" prüft nichts',
     await page.locator('#dtWin .ml-meldung').count() === 0,
     await page.locator('#dtWin .ml-meldung').textContent().catch(() => ''));
  ok('und das Feld hat danach den Schreibstrich',
     await page.evaluate(() =>
       document.activeElement === document.querySelector('#dtWin #mlAn')));
  await page.keyboard.type('bernd@schule.de', { delay: 12 });
  ok('⭐ und man kann hineinschreiben',
     (await page.locator('#dtWin #mlAn').inputValue()) === 'bernd@schule.de',
     await page.locator('#dtWin #mlAn').inputValue());
  ok('das Feld ist auch nach dem Tippen noch dasselbe (kein Neuzeichnen)',
     await page.evaluate(() =>
       document.activeElement === document.querySelector('#dtWin #mlAn')));

  await page.locator('#dtWin #mlBetreff').fill('Treffen um vier');
  await page.locator('#dtWin #mlText').fill('Kommst du mit?');

  /* Vom Nutzer beanstandet: „der Senden Button und Abbrechen
     Button sind etwas zu nah an dem Textfeld darüber." Ein Knopf,
     der die Feldkante berührt, sieht aus wie ein Teil des Felds. */
  const luft = await page.evaluate(() => {
    const t = document.querySelector('#dtWin #mlText');
    const b = document.querySelector('#dtWin #mlSenden');
    if (!t || !b) return null;
    return Math.round(b.getBoundingClientRect().top - t.getBoundingClientRect().bottom);
  });
  ok('⭐ zwischen Schreibfeld und „Senden" ist Luft (≥ 10 px)',
     luft !== null && luft >= 10, String(luft));
  await page.locator('#dtWin').screenshot({ path: path.join(OUT, 'shot-mail-neu.png') });

  await page.locator('#dtWin #mlSenden').click();
  await page.waitForTimeout(9000);
  ok('die Nachricht ist gesendet',
     (await page.locator('#dtWin .ml-meldung').textContent()) === 'Gesendet.',
     await page.locator('#dtWin .ml-meldung').textContent());
  ok('und liegt beim Server im Postfach von Bernd', await page.evaluate(() => {
    const S = window.SIM;
    const srv = S.netz.byName('Webserver') || S.netz.list().find(n => n.kind === 'server');
    return srv.mailServer.konten[1].posteingang.length === 1;
  }));
  await page.locator('#dtWin [data-seite="gesendet"]').click();
  await page.waitForTimeout(300);
  ok('und steht unter „Gesendete"',
     await page.locator('#dtWin .ml-zeile[data-mail]').count() === 1);

  /* ⭐ Der Satz, der im Unterricht überrascht: bei Bernd ist noch
     NICHTS. Eine E-Mail wird nicht zugestellt, sie wird abgeholt. */
  await page.evaluate(() => window.SIM.geraet.open(window.SIM.netz.byName('Endgerät 2').id));
  await page.waitForTimeout(350);
  await programmAuf(page, 'mail');
  await page.waitForTimeout(300);
  ok('beim Empfänger ist der Posteingang noch leer',
     await page.locator('#dtWin .ml-zeile[data-mail]').count() === 0);
  ok('und der Kasten sagt, warum',
     /abholen|abgeholt|wartet/i.test(await page.locator('#dtWin').textContent()));

  await page.locator('#dtWin #mlHolen').click();
  await page.waitForTimeout(9000);
  ok('nach dem Abrufen ist sie da',
     await page.locator('#dtWin .ml-zeile[data-mail]').count() === 1,
     await page.locator('#dtWin .ml-meldung').textContent());
  ok('und der Server hat sie herausgegeben', await page.evaluate(() => {
    const S = window.SIM;
    const srv = S.netz.byName('Webserver') || S.netz.list().find(n => n.kind === 'server');
    return srv.mailServer.konten[1].posteingang.length === 0;
  }));

  /* ─── Fund-Filter: Zugangsdaten im Mitschnitt ───────────────
     PLAN-SICHERHEIT, Schritt 1. Bernd hat eben per POP3 abgeholt —
     sein Passwort lief im Klartext über die Leitung. */
  await mitschnitt(page, true);
  await page.waitForTimeout(300);
  ok('⭐ der Chip „Zugangsdaten" steht in der Leiste',
     await page.locator('[data-proto="ZUGANG"]').count() === 1);
  await page.locator('[data-proto="ZUGANG"]').click();
  await page.waitForTimeout(250);
  const funde = await page.locator('#traceBody .tr').count();
  ok('er zeigt nur die Fundzeilen, und jede trägt die 🔑-Marke',
     funde >= 1 && await page.locator('#traceBody .tr .tr-z').count() === funde, String(funde));
  await page.locator('#traceBody .tr').first().click();
  await page.waitForTimeout(250);
  const zug = await page.locator('#traceBody .tr-lay--zug').first().textContent();
  ok('aufgeklappt stehen Benutzer und Passwort da',
     /bernd/.test(zug) && /birne/.test(zug), zug);
  await page.locator('.trace').screenshot({ path: path.join(OUT, 'shot-zugangsdaten.png') });
  await page.locator('[data-proto=""]').click();
  await mitschnitt(page, false);

  await page.locator('#dtWin [data-mail="0"]').click();
  await page.waitForTimeout(350);
  const brief = await page.locator('#dtWin .ml-brief').textContent();
  ok('der Brief steht mit Absender, Betreff und Text da',
     /anna@schule\.de/.test(brief) && /Treffen um vier/.test(brief) && /Kommst du mit/.test(brief),
     brief.slice(0, 160));

  /* ─── „E-Mail beantworten" ───────────────────────────────────
     Filius' Wortlaut (emailanwendung_msg9); dort ein Symbol in
     der Kopfleiste, hier ein Knopf unter der Nachricht — weil man
     dort steht, wenn der Gedanke kommt. Aufbau der Antwort
     ebenfalls von dort: „RE: " (msg18), „<Absender> schrieb:"
     (msg19) und der zitierte Text mit „> ". */
  ok('⭐ unter der Nachricht steht „E-Mail beantworten"',
     await page.locator('#dtWin [data-antwort]').count() === 1);
  await page.locator('#dtWin [data-antwort]').click();
  await page.waitForTimeout(350);
  ok('der Empfänger ist die Absenderin',
     (await page.locator('#dtWin #mlAn').inputValue()) === 'anna@schule.de',
     await page.locator('#dtWin #mlAn').inputValue());
  ok('der Betreff bekommt „RE: " davor',
     (await page.locator('#dtWin #mlBetreff').inputValue()) === 'RE: Treffen um vier',
     await page.locator('#dtWin #mlBetreff').inputValue());
  const antwortText = await page.locator('#dtWin #mlText').inputValue();
  ok('der alte Text steht zitiert darunter',
     /anna@schule\.de schrieb:/.test(antwortText) && /^> Kommst du mit\?/m.test(antwortText),
     JSON.stringify(antwortText));
  ok('und oben ist Platz zum Schreiben',
     antwortText.indexOf('\n\n') === 0, JSON.stringify(antwortText.slice(0, 6)));
  /* ⚠️ Zweimal antworten darf nicht „RE: RE: RE:" ergeben. */
  await page.locator('#dtWin .ml-reg[data-seite="eingang"]').click();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const S = window.SIM;
    const k = S.netz.byName('Endgerät 2').mailKonto;
    k.posteingang = [{ von: 'anna@schule.de', an: 'bernd@schule.de',
                       betreff: 'RE: Frage', text: 'Text' }];
    S.geraet.render();
  });
  await page.waitForTimeout(250);
  await page.locator('#dtWin [data-mail="0"]').click();
  await page.waitForTimeout(250);
  await page.locator('#dtWin [data-antwort]').click();
  await page.waitForTimeout(300);
  ok('⭐ eine Antwort auf eine Antwort bleibt bei einem „RE: "',
     (await page.locator('#dtWin #mlBetreff').inputValue()) === 'RE: Frage',
     await page.locator('#dtWin #mlBetreff').inputValue());
  await page.locator('#dtWin .ml-reg[data-seite="eingang"]').click();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const S = window.SIM;
    const k = S.netz.byName('Endgerät 2').mailKonto;
    k.posteingang = [{ von: 'anna@schule.de', an: 'bernd@schule.de',
                       betreff: 'Treffen um vier', text: 'Kommst du mit?' }];
    S.geraet.render();
  });
  await page.waitForTimeout(250);
  await page.locator('#dtWin [data-mail="0"]').click();
  await page.waitForTimeout(300);

  /* ⭐ Hier ist gerade Bernds Geräteoberfläche offen — und seit
     dem 2026-09-26 heißt das: der Mitschnitt zeigt NUR Bernds
     Verkehr. Genau das ist Filius' Bedienmodell („Datenaustausch
     anzeigen" an einem Gerät), nur ohne Rechtsklick.

     Die Prüfung nimmt beides mit, denn beides ist eine Aussage:
     erst der eingeschränkte Blick (Bernd holt ab, also POP3 und
     KEIN SMTP — das Senden war Annas Sache), dann der ganze. */
  const mlBernd = await page.evaluate(() => ({
    node: window.SIM.mit.filter.node,
    dir: window.SIM.mit.filter.dir,
    zeilen: window.SIM.mit.view()
      .filter(r => r.proto === 'SMTP' || r.proto === 'POP3').map(r => r.proto + ' ' + r.info)
  }));
  ok('das offene Gerätefenster schränkt den Mitschnitt ein',
     !!mlBernd.node && mlBernd.dir === 'beide', JSON.stringify(mlBernd.node) + '/' + mlBernd.dir);
  ok('bei Bernd steht POP3 — er HOLT die Post ab',
     mlBernd.zeilen.some(t => /^POP3/.test(t)) && mlBernd.zeilen.some(t => /RETR 1/.test(t)),
     mlBernd.zeilen.slice(0, 3).join(' | '));
  ok('und kein SMTP, denn geschickt hat sie Anna',
     !mlBernd.zeilen.some(t => /^SMTP/.test(t)),
     mlBernd.zeilen.filter(t => /^SMTP/.test(t)).join(' | '));

  /* Einschränkung lösen: das Chip in der Leiste. Geprüft wird der
     Weg, den eine Hand nimmt, und nicht `setGeraet` von innen. */
  await mitschnitt(page, true);
  await page.locator('#traceGeraet').click();
  await page.waitForTimeout(250);
  ok('das Chip in der Leiste löst sie wieder',
     await page.evaluate(() => window.SIM.mit.filter.node) === null
     && await page.locator('#traceGeraet').isHidden());

  const mlZeilen = await page.evaluate(() => window.SIM.mit.view()
    .filter(r => r.proto === 'SMTP' || r.proto === 'POP3').map(r => r.proto + ' ' + r.info));
  ok('der Mitschnitt nennt SMTP und POP3 beim Namen',
     mlZeilen.some(t => /^SMTP/.test(t)) && mlZeilen.some(t => /^POP3/.test(t)),
     String(mlZeilen.length));
  ok('man liest das Gespräch mit',
     mlZeilen.some(t => /MAIL FROM: <anna@schule\.de>/.test(t))
     && mlZeilen.some(t => /RETR 1/.test(t)), mlZeilen.slice(0, 3).join(' | '));
  ok('⭐ und das Passwort steht im Klartext darin',
     mlZeilen.some(t => /PASS birne/.test(t)));
  ok('für beide gibt es einen Filterchip',
     await page.locator('[data-proto="SMTP"]').count() === 1
     && await page.locator('[data-proto="POP3"]').count() === 1);

  /* ─── Die Marke „Mail" — und zwei Marken an einem Gerät ───────
     Auf diesem Server läuft jetzt BEIDES: Webserver und
     E-Mail-Server. Damit ist hier der Fall zu prüfen, den es vorher
     nur am Heimrouter gab (DHCP + WLAN): zwei Pillen in einer
     Reihe, die sich nicht überlagern dürfen. */
  const mlSrv = await page.evaluate(() => {
    const S = window.SIM;
    const srv = S.netz.byName('Webserver') || S.netz.list().find(n => n.kind === 'server');
    S.geraet.open(srv.id);
    return srv.name;
  });
  await page.waitForTimeout(350);
  await programmAuf(page, 'mailserver');
  await page.waitForTimeout(350);
  /* Auch hier über den Knopf: der Aufbau hat den Dienst im Modell
     gestartet, die Fläche hat davon nichts gesehen. */
  await page.locator('#dtWin #msStart').click();
  await page.waitForTimeout(350);
  ok('nach „Beenden" trägt die Kachel keine Mail-Marke',
     await markenAn(page, mlSrv, 'mail') === 0, String(await markenAn(page, mlSrv, 'mail')));
  ok('die Web-Marke daneben bleibt davon unberührt',
     await markenAn(page, mlSrv, 'web') === 1);
  await page.locator('#dtWin #msStart').click();
  await page.waitForTimeout(350);
  ok('der laufende E-Mail-Server trägt eine Marke an der Kachel',
     await markenAn(page, mlSrv, 'mail') === 1, String(await markenAn(page, mlSrv, 'mail')));
  ok('auf der Pille steht „Mail"',
     (await page.locator('.nf .nf-mail text').first().textContent()) === 'Mail');

  /* ─── Konten anlegen: die vier Fälle ─────────────────────────
     Drei davon liefen vorher STUMM ins Leere — der Knopf tat
     nichts, die Felder blieben stehen. Vom Nutzer beanstandet:
     „Wenn versucht wird, zwei Benutzer mit dem gleichen Namen zu
     erstellen, soll kurz eine Fehlermeldung auf dem Server
     angezeigt werden."

     Der Wortlaut ist, wo es ihn gibt, der von Filius
     (emailserver_msg24/25 und msg22+23). Für die Dublette hat
     Filius keinen — dort gibt `benutzerHinzufuegen` still
     `false` zurück und das Fenster meldet trotzdem „wurde
     angelegt". */
  const konten0 = await page.evaluate((nm) =>
    window.SIM.netz.byName(nm).mailServer.konten.length, mlSrv);

  await page.locator('#dtWin #msAnlegen').click();
  await page.waitForTimeout(300);
  ok('ohne Namen sagt der Server, was fehlt',
     /Benutzernamen und ein Passwort/.test(await page.locator('#dtWin .ml-meldung').textContent()),
     await page.locator('#dtWin .ml-meldung').textContent());

  await page.locator('#dtWin #msBen').fill('anna maier');
  await page.locator('#dtWin #msPw').fill('x');
  await page.locator('#dtWin #msAnlegen').click();
  await page.waitForTimeout(300);
  ok('ein Leerzeichen im Namen wird abgewiesen',
     /keine Leerzeichen/.test(await page.locator('#dtWin .ml-meldung').textContent()),
     await page.locator('#dtWin .ml-meldung').textContent());

  /* ⭐ Und die Dublette — GROSS geschrieben. Der Vergleich war
     `===`, während POP3 case-insensitiv sucht: „Anna" und „anna"
     ließen sich beide anlegen, und POP3 nahm danach immer das
     erste. Ein Fehler, den niemand findet, weil beide Konten in
     der Liste stehen und richtig aussehen. */
  await page.locator('#dtWin #msBen').fill('Anna');
  await page.locator('#dtWin #msAnlegen').click();
  await page.waitForTimeout(300);
  ok('⭐ „Anna" gilt als dasselbe Konto wie „anna"',
     /gibt es auf diesem Server schon/.test(
       await page.locator('#dtWin .ml-meldung').textContent()),
     await page.locator('#dtWin .ml-meldung').textContent());
  ok('und die Meldung nennt den Namen',
     /Anna/.test(await page.locator('#dtWin .ml-meldung').textContent()));
  ok('es ist kein zweites Konto entstanden',
     await page.evaluate((nm) =>
       window.SIM.netz.byName(nm).mailServer.konten.length, mlSrv) === konten0,
     String(await page.evaluate((nm) =>
       window.SIM.netz.byName(nm).mailServer.konten.length, mlSrv)));

  await page.locator('#dtWin #msBen').fill('carla');
  await page.locator('#dtWin #msPw').fill('kirsche');
  await page.locator('#dtWin #msAnlegen').click();
  await page.waitForTimeout(300);
  ok('ein neuer Name geht durch',
     await page.evaluate((nm) =>
       window.SIM.netz.byName(nm).mailServer.konten.length, mlSrv) === konten0 + 1);
  ok('und der Server sagt es auch',
     /wurde angelegt/.test(await page.locator('#dtWin .ml-meldung').textContent()),
     await page.locator('#dtWin .ml-meldung').textContent());
  ok('die Felder sind danach leer — das nächste Konto fängt von vorn an',
     (await page.locator('#dtWin #msBen').inputValue()) === ''
     && (await page.locator('#dtWin #msPw').inputValue()) === '');
  ok('die Adresse in der Liste ist benutzer@domain',
     (await page.locator('#dtWin .ml-zeile--srv').last().textContent())
       .includes('carla@schule.de'),
     await page.locator('#dtWin .ml-zeile--srv').last().textContent());

  const zweiMarken = await page.evaluate((nm) => {
    const n = window.SIM.netz.byName(nm);
    const g = document.querySelector('.nf [data-node="' + n.id + '"]');
    return [...g.querySelectorAll('.nf-mark')].map(m => {
      const r = m.getBoundingClientRect();
      return { art: m.getAttribute('class').replace('nf-mark nf-', ''),
               x1: Math.round(r.left), x2: Math.round(r.right), y: Math.round(r.top) };
    });
  }, mlSrv);
  ok('Web und Mail stehen beide da', zweiMarken.length === 2
     && zweiMarken.map(m => m.art).join(',') === 'web,mail',
     JSON.stringify(zweiMarken));
  ok('in EINER Reihe', zweiMarken[0].y === zweiMarken[1].y, JSON.stringify(zweiMarken));
  ok('und sie überlagern sich nicht', zweiMarken[0].x2 <= zweiMarken[1].x1,
     JSON.stringify(zweiMarken));
  /* Breiter als die Kachel darf die Reihe ein Stück sein — aber
     nicht so weit, dass sie den Nachbarn erreicht. */
  ok('die Reihe bleibt in der Nähe der Kachel', await page.evaluate((nm) => {
    const n = window.SIM.netz.byName(nm);
    const g = document.querySelector('.nf [data-node="' + n.id + '"]');
    const kachel = g.querySelector('rect').getBoundingClientRect();
    const alle = [...g.querySelectorAll('.nf-mark')].map(m => m.getBoundingClientRect());
    const breit = Math.max(...alle.map(r => r.right)) - Math.min(...alle.map(r => r.left));
    return breit < kachel.width * 1.7;
  }, mlSrv));

  /* ⚠️ Drei Dienste auf EINEM Server — der Normalfall einer Schule,
     und der Fall, der das Umbruchmaß entschieden hat: bei 104
     Punkten fiel „Mail" allein in eine zweite Zeile. Eine Pille
     unter einer vollen Reihe liest sich als Nachtrag. Geprüft wird
     deshalb die ZEILE, nicht die Breite. */
  const dreiMarken = await page.evaluate((nm) => {
    const S = window.SIM;
    const n = S.netz.byName(nm);
    n.software = (n.software || []).concat(['dns']);
    S.netz.dnsConf(n).on = true;
    S.dienste.sync();
    S.flaeche.draw();
    const g = document.querySelector('.nf [data-node="' + n.id + '"]');
    const ys = [...g.querySelectorAll('.nf-mark')]
      .map(m => Math.round(m.getBoundingClientRect().top));
    // Aufräumen: der nächste Abschnitt soll denselben Stand finden.
    n.software = n.software.filter(x => x !== 'dns');
    S.netz.dnsConf(n).on = false;
    S.dienste.sync();
    S.flaeche.draw();
    return ys;
  }, mlSrv);
  ok('DNS, Web und Mail stehen zu dritt in EINER Zeile',
     dreiMarken.length === 3 && new Set(dreiMarken).size === 1, JSON.stringify(dreiMarken));
  ok('und danach ist der Server wieder wie vorher',
     await markenAn(page, mlSrv, 'dns') === 0 && await markenAn(page, mlSrv, 'mail') === 1);

  /* ⚠️ Und der Fall, der die Regel trägt: Gerät aus heißt „tut
     nichts", also keine Marke — auch wenn alles eingerichtet ist. */
  await page.locator('#dtPower').click();
  await page.waitForTimeout(400);
  ok('ein ausgeschaltetes Gerät trägt gar keine Marke',
     await page.evaluate((nm) => {
       const n = window.SIM.netz.byName(nm);
       return document.querySelectorAll('.nf [data-node="' + n.id + '"] .nf-mark').length;
     }, mlSrv) === 0);
  await page.locator('#dtPower').click();
  await page.waitForTimeout(600);
  ok('wieder an: beide sind zurück',
     await markenAn(page, mlSrv, 'mail') === 1 && await markenAn(page, mlSrv, 'web') === 1);

  console.log('\n── Software aufspielen ─────────────────────────────');
  /* Der Kern der Filius-Vorstellung: ein Server ist kein Gerät,
     sondern ein Rechner, auf dem ein Serverprogramm läuft. Das
     merkt man nur, wenn man es selbst draufspielt. */
  await page.evaluate(() => {
    const S = window.SIM;
    S.geraet.open(S.netz.byName('Endgerät 2').id);
  });
  await page.waitForTimeout(250);
  await programmAuf(page, 'software');
  await page.waitForTimeout(250);
  /* Ein Kachelraster statt der zwei Spalten aus Filius. Die Zahl
     wächst mit jeder Stufe (Webbrowser, Webserver, E-Mail …);
     geprüft wird deshalb, dass es Kacheln SIND und keine Spalten
     mehr — nicht wie viele. */
  ok('ein Kachelraster, keine zwei Spalten',
     await page.locator('#dtWin .sw-k').count() >= 1
     && await page.locator('#dtWin .sw-col').count() === 0,
     String(await page.locator('#dtWin .sw-k').count()));
  ok('der DNS-Server hat eine Kachel',
     await page.locator('#dtWin [data-sw="dns"]').count() === 1);
  ok('und noch keinen Haken',
     await page.locator('#dtWin [data-sw="dns"].is-drauf').count() === 0);

  await page.locator('#dtWin [data-sw="dns"]').click();
  await page.waitForTimeout(300);
  ok('ein Klick spielt auf, ohne Zwischenschritt',
     await page.evaluate(() => window.SIM.netz.byName('Endgerät 2').software.indexOf('dns') >= 0));
  ok('die Kachel trägt jetzt den Haken',
     await page.locator('#dtWin [data-sw="dns"].is-drauf .sw-k-ok').count() === 1);
  ok('und liegt als Kachel auf dem Gerät',
     await page.locator('[data-app="dns"]').count() === 1);
  ok('ein frisch aufgespielter Server läuft noch nicht',
     await page.evaluate(() => {
       const n = window.SIM.netz.byName('Endgerät 2');
       return !n.dnsServer || !n.dnsServer.on;
     }));
  /* ⚠️ Der Kern des Wunsches, und der Grund, warum diese Prüfung
     GENAU HIER steht: aufgespielt ist nicht aktiv. Die Marke unter
     der Kachel darf jetzt noch nicht dastehen — sonst zeigt die
     Fläche einen DNS-Server, der auf keine Frage antwortet. */
  ok('… und trägt deshalb auch noch keine Marke an der Kachel',
     await markenAn(page, 'Endgerät 2', 'dns') === 0,
     String(await markenAn(page, 'Endgerät 2', 'dns')));

  /* Entfernen FRAGT — und zwar in der Kachel, nicht in einem
     Systemdialog. ⚠️ Genau deshalb steht diese Prüfung hier: der
     Prüfstand nimmt `confirm()` automatisch an (siehe den
     dialog-Empfänger oben) und wäre bei einem Systemdialog blind,
     also könnte niemand merken, wenn die Frage ausfällt. */
  await page.locator('#dtWin [data-sw="dns"]').click();
  await page.waitForTimeout(250);
  ok('ein Klick auf das Installierte fragt erst',
     await page.locator('#dtWin .sw-k.is-frage').count() === 1
     && await page.evaluate(() => window.SIM.netz.byName('Endgerät 2').software.indexOf('dns') >= 0));
  ok('und die Frage steht auf der Kachel',
     (await page.locator('#dtWin .sw-k.is-frage').textContent()).includes('deinstallieren?'));

  await page.locator('#dtWin [data-swnein="dns"]').click();
  await page.waitForTimeout(250);
  ok('„Nein" lässt das Programm liegen',
     await page.locator('#dtWin .sw-k.is-frage').count() === 0
     && await page.evaluate(() => window.SIM.netz.byName('Endgerät 2').software.indexOf('dns') >= 0));

  // Und der DNS-Server läuft: erst dann sagt das Entfernen etwas
  // darüber, dass ein Dienst dabei auch aufhört.
  await page.evaluate(() => {
    const n = window.SIM.netz.byName('Endgerät 2');
    window.SIM.netz.dnsConf(n).on = true;
    window.SIM.dienste.sync();
    // Der Knopf „Starten" sitzt im DNS-Fenster, und offen ist hier
    // der Appstore. Also von Hand nachzeichnen — sonst prüft die
    // nächste Zeile gegen eine Fläche von vorhin.
    window.SIM.flaeche.draw();
  });
  await page.waitForTimeout(250);
  ok('der gestartete Dienst trägt jetzt seine Marke',
     await markenAn(page, 'Endgerät 2', 'dns') === 1,
     String(await markenAn(page, 'Endgerät 2', 'dns')));
  await page.locator('#dtWin [data-sw="dns"]').click();
  await page.waitForTimeout(250);
  await page.locator('#dtWin [data-swja="dns"]').click();
  await page.waitForTimeout(300);
  ok('„Ja" entfernt es',
     await page.evaluate(() => window.SIM.netz.byName('Endgerät 2').software.indexOf('dns') < 0));
  ok('und die Marke geht mit dem Programm',
     await markenAn(page, 'Endgerät 2', 'dns') === 0,
     String(await markenAn(page, 'Endgerät 2', 'dns')));
  ok('und der Dienst hört dabei auf zu laufen',
     await page.evaluate(() => !window.SIM.netz.byName('Endgerät 2').dnsServer.on));
  ok('die Kachel auf dem Bildschirm verschwindet mit',
     await page.locator('[data-app="dns"]').count() === 0);
  ok('im Appstore bleibt sie stehen, nur ohne Haken',
     await page.locator('#dtWin [data-sw="dns"]').count() === 1
     && await page.locator('#dtWin [data-sw="dns"].is-drauf').count() === 0);

  /* Ein Bild vom Bildschirm mit dem Appstore. Bei diesem Projekt
     hat zweimal NUR das Bild einen Fehler gezeigt, den beide
     Prüfstände grün gemeldet haben — abgeschnittene Programmnamen
     und ein Fenster über dem Gerät, um das es ging. Mit jeder
     weiteren Anwendung wird das Raster voller; dann ist dieses
     Bild die schnellste Gegenprobe. */
  await page.locator('#dtWin [data-sw="dns"]').click();
  await page.waitForTimeout(350);
  await page.locator('#desktop').screenshot({ path: path.join(OUT, 'shot-store.png') });
  await page.locator('#dtWin [data-sw="dns"]').click();
  await page.waitForTimeout(250);
  await page.locator('#dtWin [data-swja="dns"]').click();
  await page.waitForTimeout(300);
  ok('und das Gerät ist danach wieder so leer wie vorher',
     await page.evaluate(() => window.SIM.netz.byName('Endgerät 2').software.indexOf('dns') < 0));

  // Zurück in den Entwurf: der nächste Abschnitt prüft, dass die
  // Leertaste von dort in die Aktion holt.
  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);

  console.log('\n── Dunkelmodus, Tastatur, Speichern ────────────────');

  /* ─── Die Marke ────────────────────────────────────────────
     Das Logo hat zwei Farben, und die dunkle verschwindet auf
     dunklem Grund. Deshalb liegen zwei Fassungen im Dokument und
     das Stylesheet zeigt eine davon.

     Geprüft wird nicht, dass beide <img> DA sind — das sagt nur,
     dass jemand HTML geschrieben hat. Geprüft wird, was beim
     Umschalten tatsächlich SICHTBAR ist, und dass die sichtbare
     Datei auch geladen wurde: ein falscher Pfad ergibt ein
     leeres Bild, und ein leeres Bild ist im Prüfstand sonst
     genauso „vorhanden" wie ein richtiges. */
  const marke = () => page.evaluate(() => {
    const sicht = [...document.querySelectorAll('.marke img')]
      .filter(i => getComputedStyle(i).display !== 'none');
    return { zahl: sicht.length,
             quelle: sicht.map(i => i.getAttribute('src')).join(),
             geladen: sicht.every(i => i.complete && i.naturalWidth > 0),
             breite: Math.round(document.querySelector('.marke').getBoundingClientRect().width),
             kopf: Math.round(document.querySelector('.top').getBoundingClientRect().height) };
  });
  const mHell = await marke();
  ok('im Hellen steht genau EIN Logo', mHell.zahl === 1, 'sichtbar: ' + mHell.zahl);
  ok('und zwar die helle Fassung', /synir-logo\.png$/.test(mHell.quelle), mHell.quelle);
  ok('die Bilddatei ist wirklich da', mHell.geladen);
  ok('das Logo hat eine Breite', mHell.breite > 60, mHell.breite + ' px');

  await mk(page, '#themeBtn');
  await page.waitForTimeout(250);
  ok('Dunkelmodus schaltet um',
     await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok('Hintergrund ist wirklich dunkel', /rgb\(1[0-9], 1[0-9], 2[0-9]\)/.test(bg), bg);

  const mDunkel = await marke();
  ok('im Dunkeln steht auch genau EIN Logo', mDunkel.zahl === 1, 'sichtbar: ' + mDunkel.zahl);
  ok('und zwar die umgefärbte Fassung',
     /synir-logo-dunkel\.png$/.test(mDunkel.quelle), mDunkel.quelle);
  ok('auch diese Bilddatei ist da', mDunkel.geladen);
  /* Der Wechsel darf die Leiste nicht bewegen — beide Fassungen
     sind derselbe Zuschnitt, also dieselbe Breite. Springt hier
     etwas, ist eines der beiden Bilder neu zugeschnitten worden,
     ohne das andere mitzunehmen. */
  ok('und die Leiste bewegt sich dabei nicht',
     mDunkel.breite === mHell.breite && mDunkel.kopf === mHell.kopf,
     mHell.breite + '/' + mHell.kopf + ' → ' + mDunkel.breite + '/' + mDunkel.kopf);

  await page.locator('.nf').click({ position: { x: 20, y: 20 } });
  // Im Entwurf holt die Leertaste einen erst in den Aktionsmodus,
  // statt wirkungslos zu verpuffen — wer anhalten will, will
  // laufen lassen können.
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  ok('Leertaste schaltet aus dem Entwurf in die Aktion',
     await page.evaluate(() => window.SIM.modus) === 'aktion');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  ok('Leertaste hält an', await page.evaluate(() => !window.SIM.engine.running));
  const t0 = await page.evaluate(() => window.SIM.engine.now);
  await page.keyboard.press('.');
  await page.waitForTimeout(150);
  ok('Punkt macht einen Einzelschritt',
     await page.evaluate(() => window.SIM.engine.now) >= t0);

  // Neuladen: der Stand muss überleben
  await page.evaluate(() => window.SIM.save());
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(700);
  ok('Stand überlebt das Neuladen',
     await page.evaluate(() => window.SIM.netz.count) === 7);
  ok('Adressen und Masken sind erhalten',
     await page.evaluate(() => window.SIM.netz.byName('Router 1').nics[1].ip) === '192.168.2.1');
  ok('ein Dienst überlebt das Neuladen',
     await page.evaluate(() => {
       const s = window.SIM.netz.byName('DNS-Server');
       return !!(s && s.dnsServer && s.dnsServer.on && s.dnsServer.records.length === 2);
     }));
  ok('ein eingetragener DNS-Server am Rechner bleibt',
     await page.evaluate(() => window.SIM.netz.byName('Endgerät 1').dns) === '192.168.2.20');
  ok('Dunkelmodus ist erhalten',
     await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');

  console.log('\n── Schmaler Bildschirm (Tablet hochkant) ───────────');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(400);
  const waage = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok('kein waagerechtes Scrollen (820)', waage);
  /* Die Inspektorspalte ist weg — und damit auch die Schublade,
     zu der sie hochkant wurde. Geprüft wird stattdessen, dass die
     Fläche wirklich die ganze Breite bekommt und das Fenster
     nicht mehr als die halbe Fläche belegt. */
  ok('es gibt keine Inspektorspalte mehr', await page.locator('.side').count() === 0);
  /* Die Werkzeugleiste steht jetzt am linken Rand und nimmt
     Breite weg — das ist Absicht (Filius) und nicht der Fehler,
     den diese Prüfung sucht. Der Fehler wäre eine zweite Spalte
     RECHTS: dort stand der Inspektor, und dort deckte er auf
     einem Tablet hochkant die halbe Fläche zu.

     Geprüft wird deshalb, dass die Fläche bis an den rechten Rand
     reicht und dass die Leiste hochkant schmal bleibt. */
  ok('die Fläche reicht bis an den rechten Rand', await page.evaluate(() => {
    const st = document.querySelector('.stage').getBoundingClientRect();
    return st.right > window.innerWidth - 4;
  }));
  ok('und die Werkzeugleiste bleibt dabei schmal', await page.evaluate(() =>
    document.querySelector('.rail').getBoundingClientRect().width <= 160));
  ok('das Fenster bleibt schmal genug', await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list()[0].id);
    const k = document.querySelector('#karte').getBoundingClientRect();
    return k.width <= window.innerWidth / 2;
  }));

  /* ═══ Subnetze sichtbar machen ═══════════════════════════════
     Die Neuerung gegenüber Filius. Geprüft wird nicht, dass etwas
     bunt ist, sondern dass die Farbe an der richtigen Stelle sitzt
     und an DREI Orten dieselbe ist: Ring am Gerät, Kabel, Block
     der Netzwerkkarte im Fenster.                               */
  console.log('\n── Subnetze ────────────────────────────────────────');
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(700);
  await page.locator('.mbtn[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);

  ok('ohne Auswahl und ohne Knopf ist die Fläche grau',
     await page.locator('.nf-ring').count() === 0);
  ok('und kein Kabel ist gefärbt', await page.locator('.nf-cable.is-sub').count() === 0);
  ok('die Liste der Adressräume ist zu', !(await page.locator('#subnetze').isVisible()));

  /* Ein Gerät antippen zeigt SEIN Netz — auch ohne den Knopf.
     Das ist der häufigere der beiden Wege: man fragt sich beim
     Bauen „mit wem liege ich zusammen". */
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.byName('Endgerät 1').id);
  });
  await page.waitForTimeout(300);
  ok('ein angetipptes Endgerät zeigt sein Netz',
     await page.locator('.nf-ring').count() >= 1);
  ok('das ausgewählte Gerät ist eindeutig hervorgehoben',
     await page.locator('.nf-node.is-sel').count() === 1);
  ok('und die Kabel seines Netzes sind gefärbt',
     await page.locator('.nf-cable.is-sub').count() >= 1);
  /* Der Switch hat keine IP-Adresse und liegt in keinem Netz —
     sein Ring wäre eine Aussage über Schicht 3, die er nicht
     macht. */
  ok('der Switch bekommt keinen Ring', await page.evaluate(() => {
    const sw = window.SIM.netz.list().find(n => n.kind === 'switch');
    if (!sw) return true;
    const g = document.querySelector('[data-node="' + sw.id + '"]');
    return !g || g.querySelectorAll('.nf-ring').length === 0;
  }));

  /* Der Router ist der Grund für die Ringe: er liegt in mehreren
     Netzen gleichzeitig, und das ist auf einem grauen Netzplan
     nicht zu sehen. */
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'router').id);
  });
  await page.waitForTimeout(300);
  const ringe = await page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    const g = document.querySelector('[data-node="' + r.id + '"]');
    return [...g.querySelectorAll('.nf-ring')].map(x => x.style.getPropertyValue('--sub'));
  });
  ok('der Router trägt zwei Ringe', ringe.length === 2, ringe.join(' '));
  ok('und zwar in zwei verschiedenen Farben', ringe[0] !== ringe[1], ringe.join(' '));

  /* ─ Die Adresszeile unter dem Router (2026-09-26) ──────────────
     Hier stand die Adresse der Karte mit der kleinsten Nummer, und
     das war geraten: ein Router hat keine Hauptadresse. Im
     Ruhezustand zählt die Zeile nur; gemeint ist immer die Adresse
     aus dem Netz dessen, der gerade markiert ist. */
  const ipZeile = () => page.evaluate(() => {
    const r = window.SIM.netz.list().find(n => n.kind === 'router');
    const t = document.querySelector('[data-node="' + r.id + '"] .nf-ip');
    return t ? { text: t.textContent, zahl: t.classList.contains('nf-ip--zahl') } : null;
  });
  let z = await ipZeile();
  ok('der markierte Router selbst zeigt nur die Anzahl',
     z && z.text === '2 IP-Adressen' && z.zahl, JSON.stringify(z));

  /* Die eigentliche Neuerung: wer ein Gerät markiert, bekommt am
     Router die Adresse zu sehen, die dieses Gerät wissen will —
     nämlich die aus SEINEM Netz. Bei einem Endgerät ist das genau
     die Zahl, die ins Feld „Gateway" gehört.

     ⚠️ Das Paar „ein Gerät und die dazu gehörende Router-Adresse"
     kommt aus derselben Rechnung, aus der es auch die Anzeige holt
     (`Subnetze.berechnen`) — nicht aus den Namen des Szenarios und
     nicht aus einer zweiten Adressrechnung im Prüfstand. Genau
     daran ist der erste Versuch gescheitert: mit `sameNet` gegen
     die Maske des Endgeräts gerechnet, wäre die Prüfung grün
     geblieben, auch wenn die Anzeige etwas anderes zeigt. */
  const paar = await page.evaluate(() => {
    const S = window.SIM;
    const sn = window.Subnetze.berechnen(S.netz);
    const r = S.netz.list().find(n => n.kind === 'router');
    const netze = sn.vonNode.get(r.id) || [];
    return netze.map(s => {
      const g = s.nics.map(x => x.node)
        .find(n => n.id !== r.id && n.kind !== 'switch' && n.nics.some(k => k.ip));
      const k = s.nics.find(x => x.node.id === r.id);
      return { geraet: g ? g.id : null, ip: k ? r.nics[k.i].ip : null };
    });
  });
  ok('der Router liegt in zwei Netzen, jedes mit einem Gerät darin',
     paar.length === 2 && paar.every(p => p.geraet && p.ip), JSON.stringify(paar));

  await page.evaluate((id) => window.SIM.flaeche.select(id), paar[0].geraet);
  await page.waitForTimeout(300);
  z = await ipZeile();
  ok('markiert man einen Nachbarn, steht dessen Adresse am Router',
     z && z.text.indexOf(paar[0].ip) === 0 && !z.zahl, JSON.stringify(z) + ' ' + paar[0].ip);
  ok('mit „+1" für die andere',
     z && z.text.indexOf('+1') > 0, JSON.stringify(z));
  ok('und die Adresse des anderen Netzes steht NICHT da',
     z && z.text.indexOf(paar[1].ip) < 0, JSON.stringify(z) + ' ' + paar[1].ip);

  // Die Gegenprobe: der Nachbar auf der anderen Seite bekommt die
  // andere Adresse zu sehen. Ohne sie könnte die Zeile auch schlicht
  // die erste Karte zeigen und wäre trotzdem grün.
  await page.evaluate((id) => window.SIM.flaeche.select(id), paar[1].geraet);
  await page.waitForTimeout(300);
  z = await ipZeile();
  ok('von der anderen Seite aus steht die andere Adresse da',
     z && z.text.indexOf(paar[1].ip) === 0, JSON.stringify(z) + ' ' + paar[1].ip);

  /* Zwei markierte Geräte aus zwei Netzen des Routers: jede
     Antwort wäre geraten, also zählt die Zeile wieder. Dieselbe
     Regel, mit der subnetze.js die Farbe eines Kabels entscheidet
     („genau einer, sonst keiner"). */
  await page.evaluate((ids) => window.SIM.flaeche.setAuswahl(ids),
                      [paar[0].geraet, paar[1].geraet]);
  await page.waitForTimeout(300);
  z = await ipZeile();
  ok('zwei Netze in der Auswahl — die Zeile zählt wieder',
     z && z.text === '2 IP-Adressen' && z.zahl, JSON.stringify(z));

  // Und zurück zur Auswahl, auf der der nächste Abschnitt aufbaut.
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'router').id);
  });
  await page.waitForTimeout(300);

  /* ─ Die Reiter im Router-Fenster ─ */
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(300);
  ok('der Router hat zwei Reiter', await page.locator('.k-reiter-b').count() === 2);
  const reiterTexte = await page.locator('.k-reiter-b').allTextContents();
  ok('sie heißen „Allgemein" und „Netzwerkkarten"',
     reiterTexte.join('|') === 'Allgemein|Netzwerkkarten', reiterTexte.join('|'));
  ok('aufgeschlagen sind die Netzwerkkarten',
     (await page.locator('.k-reiter-b.is-on').textContent()) === 'Netzwerkkarten');
  ok('beide Netzwerkkarten stehen untereinander',
     await page.locator('.k-nic').count() === 2);
  ok('das Gateway steht nicht dazwischen',
     await page.locator('#karteBody [data-f="gateway"]').count() === 0);

  /* Und jede Karte trägt die Farbe IHRES Netzes — dieselbe wie
     der Ring draußen. Das ist die Aussage, um die es geht: welche
     Karte liegt in welchem Netz. */
  const kartenFarben = await page.evaluate(() =>
    [...document.querySelectorAll('#karteBody .k-nic')]
      .map(x => x.style.getPropertyValue('--sub')));
  ok('jede Netzwerkkarte ist in der Farbe ihres Netzes umrandet',
     kartenFarben.every(f => /--sn-\d/.test(f)), kartenFarben.join(' '));
  ok('und die beiden Farben sind dieselben wie die Ringe draußen',
     kartenFarben.slice().sort().join(' ') === ringe.slice().sort().join(' '),
     kartenFarben.join(' ') + ' vs ' + ringe.join(' '));
  ok('an jeder Karte steht, in welchem Netz sie liegt',
     await page.locator('.k-nic-sub').count() === 2);

  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  ok('der Reiter „Allgemein" hat das Gateway',
     await page.locator('#karteBody [data-f="gateway"]').count() === 1);
  ok('und dort stehen keine Netzwerkkarten mehr',
     await page.locator('#karteBody .k-nic').count() === 0);
  ok('die Tabellen des Geräts stehen unter „Allgemein"',
     await page.locator('#karteBody [data-tabellen]').count() === 1);
  /* Ein Endgerät hat nur eine Karte und keine zwei Seiten — dort
     wären Reiter eine Frage, die niemand stellt. */
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.byName('Endgerät 1').id);
  });
  await page.waitForTimeout(300);
  ok('ein Endgerät hat keine Reiter', await page.locator('.k-reiter-b').count() === 0);
  await page.locator('#karteMehr').click();
  await page.waitForTimeout(200);

  /* ─ Der Knopf und die Liste ─ */
  await page.locator('#karteClose').click();
  await page.waitForTimeout(200);
  await mk(page, '#subBtn');
  await page.waitForTimeout(400);
  ok('der Knopf schlägt die Liste der Adressräume auf',
     await page.locator('#subnetze').isVisible());
  ok('beide Netze stehen darin', await page.locator('.sn-e').count() === 2);
  ok('und alle Geräte tragen jetzt ihre Ringe',
     await page.locator('.nf-ring').count() >= 3);
  const zeilen = await page.locator('.sn-e').first().allTextContents();
  ok('je Netz steht Netz, Netzmaske und Adressbereich da',
     /Netz/.test(zeilen[0]) && /Netzmaske/.test(zeilen[0]) && /Adressen/.test(zeilen[0]),
     zeilen[0]);
  ok('die Adressen stehen als von–bis da',
     /192\.168\.1\.1 – 192\.168\.1\.254/.test(zeilen[0]), zeilen[0]);
  ok('die Kurzform schreibt den Geräteteil als Platzhalter',
     (await page.locator('.sn-e').first().locator('.sn-kurz').textContent())
       .replace(/\s/g, '') === '192.168.1.__',
     await page.locator('.sn-e').first().locator('.sn-kurz').textContent());
  ok('die Liste liegt links', await page.evaluate(() => {
    const r = document.querySelector('#subnetze').getBoundingClientRect();
    return r.left < window.innerWidth / 3;
  }));
  ok('und nicht unter dem Auftrag', await page.evaluate(() => {
    const a = document.querySelector('#aufgabe');
    const s = document.querySelector('#subnetze').getBoundingClientRect();
    return a.hidden || s.top >= a.getBoundingClientRect().bottom - 1;
  }));

  /* Ein Kürzel in der Liste antippen wählt das Gerät aus. */
  await page.locator('.sn-chip').first().click();
  await page.waitForTimeout(300);
  ok('ein Kürzel in der Liste wählt das Gerät aus',
     await page.locator('.nf-node.is-sel').count() === 1);

  /* ─ Die Färbung zieht beim Tippen mit ─
     Die eigentliche Probe: eine Adresse ändern, und das Gerät
     fällt aus seinem Netz heraus — sofort, ohne Neuladen. */
  const zaehlen = () => page.evaluate(() => {
    const S = window.SIM;
    const e1 = S.netz.byName('Endgerät 1');
    const sn = S.flaeche.subnetze;
    return {
      netze: document.querySelectorAll('.sn-e').length,
      // Liegt E1 in einem Netz, und ist sein Kabel gefärbt?
      drin: (sn.vonNode.get(e1.id) || []).length,
      kabel: sn.vonKabel.has(e1.nics[0].cable)
    };
  });
  const vorherE1 = await zaehlen();
  ok('E1 liegt in einem Netz', vorherE1.drin === 1 && vorherE1.kabel === true,
     JSON.stringify(vorherE1));

  /* Eine Adresse in einem fremden Netz: E1 fällt heraus. Die
     beiden übrigen (E2 und der Router) bleiben ein Netz — es
     verschwindet also keine Zeile aus der Liste, sondern E1
     verliert seinen Ring und sein Kabel die Farbe. Genau das ist
     im Unterricht die Frage: „warum ist meiner grau?" */
  await page.evaluate(() => {
    const S = window.SIM;
    S.netz.byName('Endgerät 1').nics[0].ip = '10.99.0.1';
    S.flaeche.draw();
    S.subnetze.render();
  });
  await page.waitForTimeout(300);
  const falsch = await zaehlen();
  ok('eine Adresse im falschen Netz wirft das Gerät heraus',
     falsch.drin === 0 && falsch.kabel === false, JSON.stringify(falsch));
  ok('das Netz der übrigen bleibt bestehen',
     falsch.netze === vorherE1.netze, falsch.netze + ' statt ' + vorherE1.netze);

  await page.evaluate(() => {
    const S = window.SIM;
    S.netz.byName('Endgerät 1').nics[0].ip = '192.168.1.10';
    S.flaeche.draw();
    S.subnetze.render();
  });
  await page.waitForTimeout(300);
  const wieder = await zaehlen();
  ok('und die richtige Adresse holt es zurück',
     wieder.drin === 1 && wieder.kabel === true, JSON.stringify(wieder));

  await mk(page, '#subBtn');
  await page.waitForTimeout(300);
  ok('der Knopf schaltet die Liste wieder aus',
     !(await page.locator('#subnetze').isVisible()));
  /* Die Ringe des AUSGEWÄHLTEN Geräts bleiben — der Knopf schaltet
     die Übersicht ab, nicht die Auskunft über das Gerät, an dem
     man gerade arbeitet. Erst ohne Auswahl ist die Fläche grau. */
  ok('das ausgewählte Gerät behält seine Ringe',
     await page.locator('.nf-ring').count() >= 1);
  await page.evaluate(() => window.SIM.flaeche.select(null));
  await page.waitForTimeout(250);
  ok('ohne Auswahl ist die Fläche wieder grau',
     await page.locator('.nf-ring').count() === 0
     && await page.locator('.nf-cable.is-sub').count() === 0);


  /* Eigener Block: die Namen hier unten (lage, vorZug, z0 …)
     gibt es weiter oben schon. */
  {
  /* ═══════════════════════════════════════════════════════════
     DIE LEISTE AM LINKEN RAND
     ═══════════════════════════════════════════════════════════
     Sie steht senkrecht wie in Filius und lässt sich einklappen.
     Geprüft wird nicht, dass eine Klasse umspringt — das täte
     auch eine Leiste, die dabei unsichtbar wird —, sondern dass
     sie SCHMALER wird, die Symbole STEHEN BLEIBEN und die Fläche
     den Platz bekommt. */
  console.log('\n── Die Leiste am linken Rand ───────────────────────');
  await page.setViewportSize({ width: 1500, height: 950 });
  await szenarioWaehlen(page, 'zwei');
  await page.waitForTimeout(700);
  await page.evaluate(() => { if (window.SIM.leisteZu) window.SIM.leisteSetzen(false); });
  await page.waitForTimeout(400);

  const lageOffen = await page.evaluate(() => ({
    leiste: document.querySelector('.rail').getBoundingClientRect().width,
    flaeche: document.querySelector('.stage').getBoundingClientRect().width,
    links: document.querySelector('.rail').getBoundingClientRect().left
  }));
  ok('die Leiste steht ganz links', lageOffen.links <= 1, String(lageOffen.links));
  ok('und die Fläche daneben, nicht darunter', await page.evaluate(() => {
    const r = document.querySelector('.rail').getBoundingClientRect();
    const s = document.querySelector('.stage').getBoundingClientRect();
    return s.left >= r.right - 1;
  }));

  /* Die drei Endgeräte stehen NEBENEINANDER in einer Gruppe.
     Untereinander sähen sie aus wie drei Gerätearten — und das
     ist genau die Verwechslung, die dieses Programm vermeiden
     will. */
  ok('Laptop, Server und Handy liegen in EINER Gruppe',
     await page.evaluate(() => {
       const c = document.querySelector('.rail-cluster');
       return !!c && c.querySelectorAll('[data-add]').length === 3;
     }));
  ok('und zwar nebeneinander auf einer Höhe', await page.evaluate(() => {
    const b = [...document.querySelectorAll('.rail-cluster [data-add]')]
      .map(e => e.getBoundingClientRect());
    return Math.abs(b[0].top - b[1].top) < 2 && Math.abs(b[1].top - b[2].top) < 2
        && b[0].left < b[1].left && b[1].left < b[2].left;
  }));
  ok('die Gruppe heißt „Endgeräte"', await page.evaluate(() =>
    document.querySelector('.rail-cluster').closest('.rail-g')
      .querySelector('.rail-t').textContent.trim() === 'Endgeräte'));

  await page.locator('#railFold').click();
  await page.waitForTimeout(400);
  const lageZu = await page.evaluate(() => ({
    leiste: document.querySelector('.rail').getBoundingClientRect().width,
    flaeche: document.querySelector('.stage').getBoundingClientRect().width
  }));
  ok('eingeklappt wird die Leiste schmaler',
     lageZu.leiste < lageOffen.leiste - 60,
     lageOffen.leiste + ' → ' + lageZu.leiste);
  ok('und die Fläche bekommt den Platz',
     lageZu.flaeche > lageOffen.flaeche + 60,
     lageOffen.flaeche + ' → ' + lageZu.flaeche);
  /* ⚠️ Das ist der Punkt: sie verschwindet NICHT. Eine Leiste,
     die weg ist, muss man wiederfinden, und auf einem Tablet
     gibt es dafür keinen Rand, an den man fahren könnte. */
  ok('die Gerätesymbole bleiben trotzdem anklickbar',
     await page.locator('[data-add="handy"]').isVisible());
  ok('nur ihre Wörter sind weg', await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-add="handy"] .add-n')).display === 'none'));
  ok('der Zustand steht im Speicher',
     await page.evaluate(() => localStorage.getItem('netzsim.leiste.v1') === '1'));

  await page.reload();
  await page.waitForTimeout(700);
  ok('und überlebt das Neuladen', await page.evaluate(() => window.SIM.leisteZu));
  await page.locator('#railFold').click();
  await page.waitForTimeout(400);
  ok('ausklappen geht wieder', await page.evaluate(() => !window.SIM.leisteZu));

  /* ═══════════════════════════════════════════════════════════
     DAS FELD IST GRÖSSER ALS DAS FENSTER
     ═══════════════════════════════════════════════════════════
     Vorher passte sich die Fläche immer ganz ein: jedes Gerät,
     das dazukam, machte alle anderen kleiner, und ablegen konnte
     man nur dort, wo gerade Platz war. */
  console.log('\n── Zoomen und Verschieben ──────────────────────────');
  await page.evaluate(() => window.SIM.flaeche.zoomZurueck());
  await page.waitForTimeout(300);
  const z0 = await page.evaluate(() => window.SIM.flaeche.zoom);

  await page.locator('[data-zoom="in"]').click();
  await page.waitForTimeout(250);
  const z1 = await page.evaluate(() => window.SIM.flaeche.zoom);
  ok('„größer" vergrößert', z1 > z0 * 1.1, z0 + ' → ' + z1);
  ok('und die Anzeige sagt es in Prozent',
     /^\d+ %$/.test((await page.locator('#zoomLabel').textContent()).trim()),
     await page.locator('#zoomLabel').textContent());
  /* Am Bild gemessen, nicht an der Zahl: ein Zoom, der die Zahl
     ändert und das Gerät nicht, wäre kein Zoom. */
  const gross = await page.evaluate(() =>
    document.querySelector('.nf-plate').getBoundingClientRect().width);
  await page.locator('[data-zoom="out"]').click();
  await page.locator('[data-zoom="out"]').click();
  await page.waitForTimeout(250);
  const klein = await page.evaluate(() =>
    document.querySelector('.nf-plate').getBoundingClientRect().width);
  ok('„kleiner" verkleinert auch wirklich das Bild', klein < gross - 4,
     gross + ' → ' + klein);

  /* Das Verschieben: mit ALT auf dem leeren Feld ziehen. Ohne Alt
     spannt derselbe Zug seit der Mehrfachauswahl ein Rechteck auf
     (siehe Abschnitt „Bürokürzel" weiter unten) — die beiden dürfen
     sich nicht ins Gehege kommen, und genau das prüft dieser
     Abschnitt mit.

     Das Gerät darf sich dabei NICHT bewegen — es bewegt sich der
     Ausschnitt. */
  const geraetLage = () => page.evaluate(() => {
    const n = window.SIM.netz.list()[0];
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = n.x; q.y = n.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return { welt: { x: n.x, y: n.y }, bild: { x: t.x, y: t.y } };
  });
  const vorZug = await geraetLage();
  const leer = await page.evaluate(() => {
    const r = document.querySelector('.nf').getBoundingClientRect();
    return { x: r.right - 60, y: r.bottom - 60 };
  });
  await page.keyboard.down('Alt');
  await page.mouse.move(leer.x, leer.y);
  await page.mouse.down();
  await page.mouse.move(leer.x - 160, leer.y - 60, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(300);
  const nachZug = await geraetLage();
  ok('Alt + Ziehen auf dem leeren Feld verschiebt den Ausschnitt',
     Math.abs(nachZug.bild.x - vorZug.bild.x) > 80,
     JSON.stringify(vorZug.bild) + ' → ' + JSON.stringify(nachZug.bild));
  ok('das Gerät selbst bleibt dabei stehen, wo es stand',
     nachZug.welt.x === vorZug.welt.x && nachZug.welt.y === vorZug.welt.y);

  /* Und der Rückweg aus jeder verfahrenen Lage: die Prozentzahl
     anklicken. */
  await page.locator('#zoomLabel').click();
  await page.waitForTimeout(350);
  ok('die Prozentzahl holt den Startausschnitt zurück',
     await page.evaluate((z) => Math.abs(window.SIM.flaeche.zoom - z) < 0.02, z0),
     String(await page.evaluate(() => window.SIM.flaeche.zoom)));

  /* ⚠️ Das Feld muss GRÖSSER sein als der Startausschnitt —
     sonst ist „verschieben" eine Geste ohne Ziel. Geprüft an der
     Frage, die der Nutzer gestellt hat: lässt sich ein Gerät
     auch weit rechts unten ablegen? */
  const weit = await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.zoomOut(); S.flaeche.zoomOut();
    const r = document.querySelector('.nf').getBoundingClientRect();
    return S.flaeche.ablegen(r.right - 40, r.bottom - 40);
  });
  ok('weit unten rechts lässt sich ein Gerät ablegen', !!weit, JSON.stringify(weit));
  ok('und zwar außerhalb der alten Fläche von 1200 × 760',
     !!weit && (weit.x > 1200 || weit.y > 760), JSON.stringify(weit));
  await page.evaluate(() => window.SIM.flaeche.zoomZurueck());
  await page.waitForTimeout(300);

  /* ═══════════════════════════════════════════════════════════
     DAS HANDY
     ═══════════════════════════════════════════════════════════
     Dasselbe Gerät, anderes Bild — und ein eigener Bildschirm.
     Der zweite Teil ist der interessante: es darf sich in der
     DARSTELLUNG unterscheiden und sonst nirgends. */
  console.log('\n── Das Handy ───────────────────────────────────────');
  await geraetZiehen(page, 'handy');
  ok('ein Handy lässt sich aus der Leiste ziehen',
     await page.evaluate(() => !!window.SIM.netz.list().find(n => n.kind === 'handy')));
  ok('es heißt H1 auf der Fläche',
     (await page.locator('.nf-kurz').allTextContents()).includes('H1'),
     (await page.locator('.nf-kurz').allTextContents()).join(' '));

  await page.evaluate(() => {
    const S = window.SIM;
    const h = S.netz.list().find(n => n.kind === 'handy');
    const sw = S.netz.list().find(n => n.kind === 'switch');
    h.nics[0].ip = '192.168.1.23';
    /* Ins Netz kommt es über WLAN — ein Kabel nähme der Switch
       ihm gar nicht ab. */
    if (sw) {
      S.netz.wlanConf(sw); sw.wlan.on = true; sw.wlan.ssid = 'Klassenzimmer';
      S.netz.setFunk(h, 0, true, 'Klassenzimmer');
    }
    S.flaeche.draw();
  });
  await page.waitForTimeout(300);

  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const S = window.SIM;
    S.geraet.open(S.netz.list().find(n => n.kind === 'handy').id);
  });
  await page.waitForTimeout(400);
  ok('sein Bildschirm geht auf', await page.locator('#desktop').isVisible());
  ok('und er ist als Handy-Bildschirm gebaut',
     await page.evaluate(() => document.querySelector('#desktop').classList.contains('dt--handy')));
  ok('hochkant, nicht quer', await page.evaluate(() => {
    const r = document.querySelector('#desktop').getBoundingClientRect();
    return r.height > r.width;
  }));
  ok('mit dem Strich unten, den jedes Telefon hat',
     await page.evaluate(() => {
       const h = document.querySelector('#desktop .dt-home');
       return !!h && getComputedStyle(h).display !== 'none';
     }));
  /* Die Aussage, um die es geht: dieselben Programme wie auf dem
     Rechner. Ein Handy mit weniger Programmen wäre ein anderes
     Gerät. */
  ok('es hat dieselben Programme wie ein Rechner',
     await page.locator('#desktop .dt-app').count() === 3,
     String(await page.locator('#desktop .dt-app').count()));
  ok('darunter das Terminal',
     await page.locator('#desktop .dt-app[data-app="terminal"]').count() === 1);

  /* ═══════════════════════════════════════════════════════════
     BILDSCHIRM: SYMBOLE UND SCHNELLZUGRIFF
     ═══════════════════════════════════════════════════════════ */
  console.log('\n── Symbole und Schnellzugriff ──────────────────────');
  ok('unten liegt ein Schnellzugriff',
     await page.locator('#dtDock .dt-dapp').count() === 3);
  ok('und er liegt wirklich UNTEN, unter den Symbolen',
     await page.evaluate(() => {
       const d = document.querySelector('#dtDock').getBoundingClientRect();
       const a = document.querySelector('#desktop .dt-app').getBoundingClientRect();
       return d.top > a.bottom;
     }));
  ok('solange kein Programm läuft, gibt es kein Fenster',
     await page.evaluate(() => document.querySelector('#dtWin').hidden));

  await page.locator('#dtDock [data-dock="software"]').click();
  await page.waitForTimeout(400);
  ok('der Schnellzugriff startet ein Programm',
     await page.evaluate(() => !document.querySelector('#dtWin').hidden));
  ok('das Fenster nennt sich beim Namen',
     (await page.locator('.dt-winh-t').textContent()) === 'Software-Installation',
     await page.locator('.dt-winh-t').textContent());
  ok('und das laufende Programm ist im Schnellzugriff markiert',
     await page.locator('#dtDock .dt-dapp.is-on[data-dock="software"]').count() === 1);
  /* ⭐ Das Fenster LIEGT auf den Kacheln — es blendet sie nicht
     aus und schiebt sie nicht zur Seite. Hier stand früher
     `display === 'none'` für das Handy; seit alle Geräte
     dasselbe tun, wird das Gegenteil geprüft, und zwar in drei
     Teilen, weil jeder einzeln kaputtgehen kann:

       · die Kacheln sind noch da und sichtbar
       · das Fenster deckt sie zu (Rechtecke überschneiden sich)
       · der Schnellzugriff liegt über beidem und ist bedienbar

     Ohne den dritten Teil wäre eine Änderung willkommen, die das
     Fenster über die Leiste legt — und dann gäbe es bei offenem
     Programm keinen Weg mehr zu einem anderen. */
  ok('die Kacheln bleiben stehen, auch wenn ein Programm läuft',
     await page.evaluate(() => {
       const a = document.querySelector('#desktop .dt-apps');
       return !!a && getComputedStyle(a).display !== 'none'
              && a.getBoundingClientRect().height > 0;
     }));
  ok('⭐ und das Fenster liegt darüber, nicht daneben',
     await page.evaluate(() => {
       const f = document.querySelector('#dtFenster').getBoundingClientRect();
       const k = document.querySelector('#desktop .dt-app').getBoundingClientRect();
       // Überschneidung in beiden Richtungen = es deckt zu.
       return f.left < k.right && f.right > k.left
           && f.top < k.bottom && f.bottom > k.top;
     }));
  ok('der Schnellzugriff liegt über dem Fenster und bleibt bedienbar',
     await page.evaluate(() => {
       const b = document.querySelector('#dtDock .dt-dapp');
       const r = b.getBoundingClientRect();
       const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
       return !!el && !!el.closest('.dt-dapp');
     }));
  /* Dieselbe Frage wie früher an dieser Stelle — damals stand im
     schmalen Bildschirm „255.255.255" im Netzmaskenfeld, und nur
     das BILD hat es gezeigt. Das Formular gibt es hier nicht mehr;
     die Frage „passt der Inhalt in einen hochkanten Bildschirm"
     bleibt, und sie trifft jetzt die Kacheln des Appstores. */
  ok('die Kacheln passen in den hochkanten Bildschirm', await page.evaluate(() => {
    const r = document.querySelector('#dtWin .sw');
    if (!r) return false;
    if (r.scrollWidth > r.clientWidth + 1) return false;
    return [...r.querySelectorAll('.sw-k')].every(k => k.scrollWidth <= k.clientWidth + 1);
  }));
  await page.locator('.dt-winh-x').click();
  await page.waitForTimeout(300);
  ok('das × im Fensterkopf schließt das Programm, nicht das Gerät',
     (await page.evaluate(() => document.querySelector('#dtWin').hidden))
     && (await page.locator('#desktop').isVisible()));

  await page.evaluate(() => window.SIM.geraet.close());
  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(500);

  }

  /* ═══ Heimrouter und WLAN ═══════════════════════════════════
     Geprüft wird hier nur, was ein Browser zeigen kann: die
     Leiste, die Reiter, die Schildchen an der Kachel, der Strich
     statt der Linie, die Marke. Ob die Brücke Rahmen weiterreicht
     und NAT übersetzt, steht im kopflosen Prüfstand — dort ist es
     billiger und genauer zu messen. */
  console.log('\n── Heimrouter und WLAN ─────────────────────────────');
  {
  await page.evaluate(() => {
    const S = window.SIM;
    for (const n of S.netz.list().slice()) S.netz.removeNode(n.id);
    S.flaeche.draw();
  });
  await page.waitForTimeout(300);

  ok('die Leiste hat die Gruppe „Verteilen"',
     (await page.locator('.rail-t').allTextContents()).includes('Verteilen'));
  ok('und die Gruppe „Vermittlungsgeräte"',
     (await page.locator('.rail-t').allTextContents()).includes('Vermittlungsgeräte'));
  ok('Router und Heimrouter stehen als Kacheln nebeneinander',
     await page.evaluate(() => {
       const r = document.querySelector('[data-add="router"]');
       const h = document.querySelector('[data-add="heimrouter"]');
       return !!r && !!h && r.parentElement === h.parentElement
         && r.parentElement.classList.contains('rail-cluster');
     }));
  ok('der Switch steht NICHT in derselben Gruppe',
     await page.evaluate(() => {
       const s = document.querySelector('[data-add="switch"]');
       const h = document.querySelector('[data-add="heimrouter"]');
       return s.closest('.rail-g') !== h.closest('.rail-g');
     }));

  // Antippen erklärt — anlegen tut es nichts (Gestenregel).
  await page.locator('[data-add="heimrouter"]').click();
  await page.waitForTimeout(250);
  ok('Antippen erklärt den Heimrouter',
     await page.locator('#ginfo').isVisible()
     && (await page.locator('#ginfoName').textContent()) === 'Heimrouter');
  ok('und legt dabei keines an', await page.evaluate(() => window.SIM.netz.count) === 0);
  await page.locator('#ginfoClose').click();

  await geraetZiehen(page, 'heimrouter');
  ok('gezogen liegt einer auf der Fläche',
     await page.evaluate(() => window.SIM.netz.count) === 1);
  /* ⚠️ Hier stand „mit fünf Anschlüssen und fertiger LAN-Adresse".
     Vom Nutzer beanstandet: „Ein Heimrouter braucht nichts
     defaultmäßig ausgefüllt." Er kommt jetzt leer — die WAN-Seite
     fragt den Anbieter (das ist keine Angabe, sondern was ein
     WAN-Anschluss tut), alles andere trägt die Klasse ein. */
  ok('mit neun Anschlüssen (WAN + 8 LAN), leer und mit fragender WAN-Seite',
     await page.evaluate(() => {
       const n = window.SIM.netz.list()[0];
       return n.kind === 'heimrouter' && n.nics.length === 9
         && !n.nics[1].ip && !n.nics[0].ip && n.nics[0].dhcp === true;
     }));
  ok('und unter der Kachel steht „keine IP", keine Anbieteradresse',
     (await page.locator('.nf-ip--none').first().textContent()) === 'keine IP');
  ok('auf der Kachel steht HR1', (await page.locator('.nf-kurz').first().textContent()) === 'HR1');

  // Zwei Endgeräte an zwei verschiedene LAN-Buchsen.
  await geraetZiehen(page, 'host');
  await geraetZiehen(page, 'handy');
  await page.evaluate(() => {
    const S = window.SIM, netz = S.netz;
    const hr = netz.list().find(n => n.kind === 'heimrouter');
    const pc = netz.list().find(n => n.kind === 'host');
    /* Das Haus bekommt seine Adresse — seit der Heimrouter leer
       aus dem Karton kommt, ist das ein Schritt der Aufgabe und
       keine Voreinstellung. Alles darunter prüft das eingerichtete
       Gerät und braucht sie. */
    hr.nics[netz.LAN].ip = '192.168.1.1';
    hr.nics[netz.LAN].mask = '255.255.255.0';
    pc.nics[0].ip = '192.168.1.10'; pc.nics[0].mask = '255.255.255.0';
    netz.addCable(pc.id, 0, hr.id, 3);        // LAN 3
    S.flaeche.draw();
  });
  await page.waitForTimeout(300);

  const schilder = await page.locator('.nf-port text').allTextContents();
  ok('das Kabel trägt ein Schildchen „LAN 3"', schilder.includes('LAN 3'), schilder.join(','));
  ok('und es liegt ÜBER den Geräten, nicht darunter',
     await page.evaluate(() => {
       const p = document.querySelector('.nf-portlabels');
       const n = document.querySelector('.nf-nodes');
       return !!p && !!n && (n.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
     }));

  // WLAN am Heimrouter einschalten — über das Fenster, wie eine Hand.
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'heimrouter').id);
  });
  await page.waitForTimeout(300);
  const reiter = await page.locator('.k-reiter-b').allTextContents();
  /* ⚠️ Seit 2026-09-28 steht „Allgemein" VORN — wie beim Router,
     vom Nutzer so verlangt. Aufgeschlagen bleibt trotzdem LAN:
     die Stelle im Band sagt, wohin etwas gehört, nicht, womit man
     anfängt. Beides wird geprüft, weil genau diese zwei Aussagen
     leicht zu verwechseln sind. */
  ok('der Heimrouter hat die Reiter Allgemein · WAN · LAN',
     reiter.join('|') === 'Allgemein|WAN|LAN', reiter.join('|'));
  ok('aufgeschlagen ist LAN',
     (await page.locator('.k-reiter-b.is-on').textContent()) === 'LAN');
  ok('und dort steht die LAN-Adresse, nicht die vom Anbieter',
     await page.evaluate(() =>
       [...document.querySelectorAll('#karte input.f')].some(i => i.value === '192.168.1.1')));
  /* ⭐ Klein steht nur LAN 1 — „nur LAN1 und nicht der Rest".
     Buchsen, WLAN und DHCP-Server gibt es erst groß. */
  ok('⭐ klein: keine Buchsenreihe, kein WLAN, kein Erklärsatz',
     await page.locator('#karte .k-port').count() === 0
     && await page.locator('#karte [data-k="wlan"]').count() === 0
     && await page.locator('#karte .k-note:not([hidden])').count() === 0);
  await gross(page, true);
  ok('groß zeigt die Buchsenreihe acht Löcher',
     await page.locator('#karte .k-port').count() === 8,
     String(await page.locator('#karte .k-port').count()));
  ok('⭐ und keinen Knopf „Schnittstelle hinzufügen" — die Buchsen sind fest',
     await page.locator('#karteBody [data-k="addnic"]').count() === 0);
  ok('die Erklärung steht hinter einem „i", zugeklappt',
     await page.locator('#karte .k-i[data-info="hr-lan"]').count() === 1
     && await page.locator('#karte [data-infotext="hr-lan"]').isHidden());
  await page.locator('#karte .k-i[data-info="hr-lan"]').click();
  ok('und geht auf Tipp auf',
     await page.locator('#karte [data-infotext="hr-lan"]').isVisible());

  await page.locator('#karte [data-k="wlan"]').check();
  await page.waitForTimeout(300);
  ok('WLAN einschalten vergibt einen Namen',
     await page.evaluate(() => {
       const n = window.SIM.netz.list().find(x => x.kind === 'heimrouter');
       return n.wlan.on === true && n.wlan.ssid === 'WLAN-HR1';
     }));
  await page.locator('#karte [data-f="ssid"]').fill('Zuhause');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.SIM.flaeche.draw());
  ok('die WLAN-Marke steht unter der Kachel',
     await page.locator('.nf-wlan').count() === 1);
  ok('und trägt den Netznamen',
     (await page.locator('.nf-wlan text').textContent()) === 'Zuhause');

  // Das Handy einwählen.
  await page.evaluate(() => {
    const S = window.SIM;
    const h = S.netz.list().find(n => n.kind === 'handy');
    h.nics[0].ip = '192.168.1.37'; h.nics[0].mask = '255.255.255.0';
    S.flaeche.select(h.id);
  });
  await page.waitForTimeout(300);
  /* ⭐ Beim Handy gibt es die Wahl NICHT. Hier stand bis zum
     2026-09-27 das Gegenteil („hat die Wahl Kabel oder Funk",
     „und steht auf Kabel") — vom Nutzer umgedreht: „Smartphones
     sollen ausschließlich über WLAN betrieben werden können."
     Zwei Knöpfe, von denen einer nie geht, stellen eine Frage,
     auf die das Gerät schon geantwortet hat. */
  ok('⭐ das Handy hat keine Wahl Kabel/Funk mehr',
     await page.locator('#karte .k-wahl-b').count() === 0,
     String(await page.locator('#karte .k-wahl-b').count()));
  ok('es steht von sich aus auf Funk',
     await page.evaluate(() =>
       window.SIM.netz.list().find(n => n.kind === 'handy').nics[0].funk === true));
  ok('und die SSID-Auswahl steht trotzdem da',
     await page.locator('#karte select[data-f="nicssid"]').count() === 1);
  /* Ein Rechner behält beide Knöpfe — sonst wäre die Änderung
     nicht „das Handy hat keine Buchse", sondern „niemand hat
     mehr eine". */
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'host').id);
  });
  await page.waitForTimeout(300);
  ok('ein Rechner hat die Wahl weiterhin',
     await page.locator('#karte .k-wahl-b').count() === 2,
     String(await page.locator('#karte .k-wahl-b').count()));
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'handy').id);
  });
  await page.waitForTimeout(300);
  const ssids = await page.locator('#karte select[data-f="nicssid"] option').allTextContents();
  ok('die Auswahlliste fängt mit „Bitte auswählen" an',
     ssids[0] === 'Bitte auswählen', ssids.join(','));
  ok('und kennt das ausgestrahlte Netz', ssids.includes('Zuhause'), ssids.join(','));
  await page.selectOption('#karte select[data-f="nicssid"]', 'Zuhause');
  await page.waitForTimeout(400);
  ok('danach steht die Verbindung', await page.locator('#karte .k-wlan-ok').count() === 1);
  await page.evaluate(() => window.SIM.flaeche.draw());
  ok('und auf der Fläche liegt ein Funkkabel',
     await page.locator('.nf-cable.is-funk').count() === 1);
  /* Gestrichelt ist der EINE Unterschied zum Draht. Steht der
     Strich nicht im Bild, sieht eine Funkverbindung aus wie ein
     Kabel — und die ganze Unterscheidung ist weg. */
  ok('es ist gestrichelt gezeichnet',
     await page.evaluate(() => {
       const l = document.querySelector('.nf-cable.is-funk .nf-cable-line');
       const d = l && getComputedStyle(l).strokeDasharray;
       return !!d && d !== 'none' && d.length > 1;
     }));
  ok('ein Funkkabel bekommt KEIN LAN-Schildchen',
     await page.evaluate(() =>
       [...document.querySelectorAll('.nf-port text')].every(t => t.textContent !== 'LAN 5')));

  /* ⚠️ Das Schloss gehört zu der Adresse, die dasteht — nicht zum
     Gerät. Am Heimrouter holt die WAN-Karte per DHCP, unter der
     Kachel steht aber die von Hand eingetragene LAN-Adresse. Ein
     Schloss dahinter behauptete, sie komme vom Server und sei
     nicht änderbar. Nur im Bild zu sehen gewesen. */
  ok('die von Hand eingetragene LAN-Adresse trägt kein Schloss',
     await page.evaluate(() => {
       const hr = window.SIM.netz.list().find(n => n.kind === 'heimrouter');
       const g = document.querySelector('[data-node="' + hr.id + '"]');
       return !!g && g.querySelectorAll('.nf-lock').length === 0;
     }));

  // NAT-Tabelle im Reiter „Allgemein" des Heimrouters
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'heimrouter').id);
  });
  await page.waitForTimeout(250);
  if (!(await page.evaluate(() => document.querySelector('#karte').classList.contains('is-mehr'))))
    await page.locator('#karteMehr').click();
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(300);
  /* ⚠️ Der NAT-Schalter ist weg — vom Nutzer gestrichen:
     „Heimrouter nutzen immer NAT. Das sollte dann auch da stehen."
     Geprüft wird beides: dass es ihn nicht mehr gibt UND dass die
     Aussage an seiner Stelle steht. Nur das erste zu prüfen ließe
     eine Oberfläche durchgehen, die zu NAT gar nichts mehr sagt. */
  ok('⭐ „Allgemein" hat KEINEN NAT-Schalter mehr',
     await page.locator('#karte [data-k="nat"]').count() === 0);
  ok('dafür steht dort, dass ein Heimrouter immer übersetzt',
     (await page.locator('#karte').textContent()).includes('übersetzt immer'));
  ok('und NAT ist im Modell an',
     await page.evaluate(() =>
       !!window.SIM.netz.list().find(n => n.kind === 'heimrouter').nat.on));
  ok('die NAT-Tabelle steht bei den gelernten Tabellen',
     (await page.locator('#karte [data-tabellen]').textContent()).includes('NAT'));

  /* Und der Rest des Aufräumens in diesem Reiter: Gateway und DNS
     stehen VOR NAT, und eine Weiterleitungstabelle gibt es hier
     gar nicht mehr. */
  {
    const t = await page.locator('#karteBody').textContent();
    ok('⭐ der Heimrouter hat keine Weiterleitungstabelle mehr',
       !t.includes('Weiterleitungstabelle'), t.slice(0, 120));
    ok('Gateway steht vor NAT', t.indexOf('Gateway') < t.indexOf('NAT')
       && t.indexOf('Gateway') >= 0, t.indexOf('Gateway') + ' / ' + t.indexOf('NAT'));
    ok('und die Portfreigaben stehen unter dem NAT-Satz',
       t.indexOf('NAT') < t.indexOf('Portfreigaben'));
  }

  // Der Switch kann dasselbe.
  await geraetZiehen(page, 'switch');
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'switch').id);
  });
  await page.waitForTimeout(300);
  ok('auch der Switch hat einen WLAN-Abschnitt',
     await page.locator('#karte [data-k="wlan"]').count() === 1);
  ok('mit dem Filius-Wortlaut „Name WLAN (SSID)"',
     (await page.locator('#karte').textContent()).includes('Name WLAN (SSID)'));

  /* ⭐ Und er hat KEINEN Knopf „Schnittstelle hinzufügen" mehr — die
     Buchse kommt seit dem 2026-09-28 von selbst mit dem Kabel
     (netz.js, `freieNic`). Vom Nutzer: „Erweiterung der Zugänge, die
     müssen simpel und einfach sein." Geprüft wird in der GROSSEN
     Ansicht, denn nur dort stand er je. */
  await gross(page, true);
  ok('⭐ am Switch gibt es keinen Knopf „Schnittstelle hinzufügen"',
     await page.locator('#karteBody [data-k="addnic"]').count() === 0);
  /* ⭐ Und seit 2026-09-28 auch keinen Satz über Schicht 2 und keine
     Buchsenreihe mehr — vom Nutzer gestrichen. */
  ok('⭐ kein Erklärsatz und keine Anschlussreihe am Switch',
     !(await page.locator('#karteBody').textContent()).includes('Schicht 2')
     && await page.locator('#karteBody .k-port').count() === 0);
  await gross(page, false);

  // Und der Router kann es NICHT — er vermittelt, er strahlt nicht.
  await geraetZiehen(page, 'router');
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'router').id);
  });
  await page.waitForTimeout(300);
  ok('ein Router hat keinen WLAN-Abschnitt',
     await page.locator('#karte [data-k="wlan"]').count() === 0);

  /* ⚠️ Der Heimrouter im Aktionsmodus hat KEINEN Bildschirm mehr.
     Vom Nutzer gesetzt: „Router, Switch und Heimrouter haben keine
     Desktop-Oberfläche." An keinem dieser Geräte ist einer, und
     ein Raster aus Programmkacheln behauptete das Gegenteil. Er
     bekommt stattdessen die Stufe darunter — ein Gerätefenster,
     also Werkzeug (app.css nennt die drei Höhen im Kopf).

     Das Terminal bleibt: es ist kein Programm auf einem
     Bildschirm, sondern der Zugang von außen, und „ping von hier
     nach draußen" ist die Frage, für die es dieses Gerät gibt. */
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const S = window.SIM;
    S.geraet.open(S.netz.list().find(n => n.kind === 'heimrouter').id);
  });
  await page.waitForTimeout(400);
  ok('im Aktionsmodus geht sein Gerätefenster auf',
     await page.locator('#desktop').isVisible());
  ok('und es ist als Gerät OHNE Bildschirm gebaut',
     await page.locator('#desktop.dt--kein').count() === 1);
  ok('keine Programmkacheln auf einer Tapete',
     await page.locator('#desktop .dt-app').count() === 0);
  ok('und kein Schnellzugriff unten',
     await page.evaluate(() =>
       getComputedStyle(document.querySelector('#dtDock')).display === 'none'));
  /* ⭐ Seit 2026-09-28: kein Satz, kein Terminal, keine Reiter, und
     nichts zum Einstellen — eine kompakte Leseansicht. Vom Nutzer
     wie beim Router gewollt. */
  ok('⭐ kein Erklärsatz, keine Reiter, kein Terminal',
     await page.locator('#desktop .dt-kein').count() === 0
     && await page.locator('#desktop .dt-reg-b').count() === 0
     && await page.evaluate(() => !document.querySelector('#dtWin #term')));
  ok('⭐ nur lesen: kein Eingabefeld, kein Schalter',
     await page.locator('#dtWin input, #dtWin select').count() === 0,
     String(await page.locator('#dtWin input, #dtWin select').count()));
  ok('die kompakte Ansicht nennt WAN, LAN und WLAN',
     await page.evaluate(() => {
       const t = document.querySelector('#dtWin .kk').textContent;
       return t.includes('WAN') && t.includes('LAN') && t.includes('WLAN');
     }));
  /* Die Unterzeile nennt beide Seiten mit Namen. Zwei Adressen
     nebeneinander ohne Wörter wären an diesem Gerät genau die
     Auskunft, die fehlt: welche zeigt nach draußen? */
  ok('die Unterzeile nennt WAN und LAN getrennt',
     await page.evaluate(() => {
       const t = document.querySelector('#dtSub').textContent;
       return t.indexOf('WAN') === 0 && t.includes('LAN 192.168.1.1');
     }), await page.locator('#dtSub').textContent());

  /* Das Terminal gibt es an diesem Gerät in der Oberfläche nicht
     mehr — die Befehle selbst bleiben (Prüfstand, Lehrkraft). */
  await page.evaluate(() => {
    const S = window.SIM;
    S.term.submit(S.netz.list().find(n => n.kind === 'heimrouter').id, 'ipconfig');
  });
  await page.waitForTimeout(400);
  /* ⚠️ ipconfig zählt ANSCHLÜSSE auf, nicht Löcher. Stünden alle
     fünf Karten da, läse man drei Blöcke „— keine —" unter einem
     mit Adresse — und schlösse daraus, dass an diesem Gerät drei
     Karten kaputt sind. */
  const ipc = await page.evaluate(() => {
    const S = window.SIM;
    return S.term.linesOf(S.netz.list().find(n => n.kind === 'heimrouter').id)
      .map(l => l.text).join('\n');
  });
  ok('ipconfig nennt WAN und LAN, nicht neun Netzwerkkarten',
     ipc.includes('WAN') && ipc.includes('LAN 1   (8 Buchsen)')
     && !ipc.includes('LAN 2'), ipc.replace(/\s+/g, ' ').slice(0, 160));

  await page.screenshot({ path: path.join(OUT, 'shot-heimrouter.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'shot-heimrouter-dunkel.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.evaluate(() => window.SIM.geraet.close());
  await page.locator('.mbtn[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);

  await page.evaluate(() => window.SIM.panels.closeKarte && window.SIM.panels.closeKarte());
  ok('keine Konsolenfehler nach dem Heimrouter-Abschnitt',
     errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  /* ═══════════════════════════════════════════════════════════
     DIE BÜROKÜRZEL
     ═══════════════════════════════════════════════════════════
     Strg+Z / Y / C / X / V / A, Entf, Rechteck aufziehen und
     Strg-Klick. Alles ohne einen einzigen Knopf — verlangt war
     ausdrücklich: „Ich brauche dafür keine Buttons in der UI. Das
     sind einfach Standard Effekte."

     Geprüft wird hier im Browser und nicht im Kern, weil es GESTEN
     sind: was der Kern kann (Ausschnitt, Einfügen, Verlauf), steht
     in kerntest.js. Hier steht, ob eine Hand daran kommt.        */
  console.log('\n── Bürokürzel ──────────────────────────────────────');
  {
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(800);

  const lagen = () => page.evaluate(() =>
    window.SIM.netz.list().map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y })));
  const bild = (id) => page.evaluate((k) => {
    const n = window.SIM.netz.get(k);
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = n.x; q.y = n.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return { x: t.x, y: t.y };
  }, id);
  const markiert = () => page.evaluate(() => window.SIM.flaeche.auswahlIds.length);
  const kaertchen = () => page.locator('.karte:not([hidden])').count();

  /* ─── Rechteck aufziehen ─────────────────────────────────────
     Gezogen wird um die beiden Endgeräte des Router-Szenarios
     herum. Das Rechteck wird am BILD gerechnet, nicht am Feld: eine
     Hand zieht auf dem Bildschirm. */
  const alle = await lagen();
  const e1 = alle.find(n => n.name === 'Endgerät 1');
  const e2 = alle.find(n => n.name === 'Endgerät 2');
  ok('das Router-Szenario hat zwei Endgeräte', !!e1 && !!e2);

  const p1 = await bild(e1.id), p2 = await bild(e2.id);
  const rx0 = Math.min(p1.x, p2.x) - 70, ry0 = Math.min(p1.y, p2.y) - 70;
  const rx1 = Math.max(p1.x, p2.x) + 70, ry1 = Math.max(p1.y, p2.y) + 70;

  /* ⚠️ Gezogen wird von RECHTS UNTEN nach links oben, und das ist
     kein Geschmack: links oben liegt die Auftragskarte des
     Szenarios, und auf ihr fängt kein Zug auf der Fläche an (der
     Zeigerdruck landet im Auftrag). Genau derselbe Grund, aus dem
     `freeSpot` nach einem freien Platz IM BILD fragt und nicht nur
     auf dem Feld. Ein Rechteck darf in jede Richtung aufgezogen
     werden; dass es hier andersherum geht, prüft das mit — und
     zugleich, dass der Zeigerfang das Rechteck über den Auftrag
     hinweg weiterzieht. */
  /* ⚠️ Und mit STRG. Das Rechteck hing eine Runde lang am nackten
     Zug; vom Nutzer beanstandet, weil es sich mit dem Verschieben
     des Feldes biss („beißt sich mit dem schönen Drag and Drop auf
     dem Feld bewegen"). Jetzt verschiebt der nackte Zug, und Strg
     markiert — dieselbe Taste wie beim Strg-Klick und bei Strg+A. */
  await page.keyboard.down('Control');
  await page.mouse.move(rx1, ry1);
  await page.mouse.down();
  await page.mouse.move((rx0 + rx1) / 2, (ry0 + ry1) / 2, { steps: 6 });
  ok('während des Zugs steht ein Rechteck auf der Fläche',
     await page.locator('.nf-rahmen-k').count() === 1);
  await page.mouse.move(rx0, ry0, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await page.waitForTimeout(250);

  ok('das Rechteck hat mindestens die zwei Endgeräte markiert',
     await markiert() >= 2, String(await markiert()));
  ok('beide sind auf der Fläche hervorgehoben',
     await page.locator('.nf-node.is-sel').count() >= 2,
     String(await page.locator('.nf-node.is-sel').count()));
  /* ⚠️ Die Besonderheit, die ausdrücklich verlangt war. */
  ok('und es geht KEIN Kärtchen auf', await kaertchen() === 0,
     String(await kaertchen()));
  ok('das Rechteck ist nach dem Loslassen weg',
     await page.locator('.nf-rahmen-k').count() === 0);

  /* ─── Und der nackte Zug verschiebt wieder das Feld ──────────
     Die andere Hälfte derselben Entscheidung. Geprüft wird beides:
     dass sich der Ausschnitt bewegt UND dass dabei kein Rechteck
     aufblitzt — ein Rahmen, der eine Zehntelsekunde zu sehen ist,
     wäre genau die doppelte Bedeutung, die hier aufgelöst wurde.

     ⚠️ Die Auswahl bleibt dabei stehen. Wer das Feld verschiebt,
     um sein Gerät zu suchen, will es danach noch markiert haben. */
  const vorher = await page.evaluate(() => window.SIM.flaeche.ausschnitt);
  const frei = await page.evaluate(() => {
    const s = window.SIM.flaeche.freeSpot();
    const svg = document.querySelector('.nf');
    const q = svg.createSVGPoint(); q.x = s.x; q.y = s.y;
    const t = q.matrixTransform(svg.getScreenCTM());
    return { x: t.x, y: t.y };
  });
  await page.mouse.move(frei.x, frei.y);
  await page.mouse.down();
  await page.mouse.move(frei.x - 60, frei.y - 40, { steps: 6 });
  ok('ein Zug ohne Strg zieht KEIN Rechteck auf',
     await page.locator('.nf-rahmen-k').count() === 0);
  await page.mouse.move(frei.x - 120, frei.y - 80, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const nachher = await page.evaluate(() => window.SIM.flaeche.ausschnitt);
  ok('sondern verschiebt den Ausschnitt',
     Math.abs(nachher.x - vorher.x) > 20 || Math.abs(nachher.y - vorher.y) > 20,
     vorher.x + '/' + vorher.y + ' → ' + nachher.x + '/' + nachher.y);
  ok('und lässt die Markierung stehen', await markiert() >= 2,
     String(await markiert()));
  /* Denselben Weg zurück — und zwar mit der Hand und nicht mit
     `einpassen()`: das rechnete einen NEUEN Ausschnitt (alle
     Geräte mit Luft), und in dem lägen die Endgeräte unter der
     Auftragskarte. Die folgenden Prüfungen fassen sie an. */
  await page.mouse.move(frei.x - 120, frei.y - 80);
  await page.mouse.down();
  await page.mouse.move(frei.x - 60, frei.y - 40, { steps: 6 });
  await page.mouse.move(frei.x, frei.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const zurueckAus = await page.evaluate(() => window.SIM.flaeche.ausschnitt);
  ok('und derselbe Zug zurück stellt den Ausschnitt wieder her',
     Math.abs(zurueckAus.x - vorher.x) < 2 && Math.abs(zurueckAus.y - vorher.y) < 2,
     vorher.x + '/' + vorher.y + ' → ' + zurueckAus.x + '/' + zurueckAus.y);

  /* ─── Mehrere zusammen verschieben ───────────────────────────
     Am Gerät angefasst, nicht am leeren Feld. Der Abstand zwischen
     den beiden muss danach derselbe sein — das ist die Prüfung, die
     den ersten Versuch umgeworfen hat (er klemmte jedes Gerät
     einzeln an den Rand und zog sie dabei zusammen). */
  const vorX = e2.x - e1.x, vorY = e2.y - e1.y;
  const g1 = await bild(e1.id);
  await page.mouse.move(g1.x, g1.y);
  await page.mouse.down();
  await page.mouse.move(g1.x + 4, g1.y + 60, { steps: 4 });
  await page.mouse.move(g1.x, g1.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const nach = await lagen();
  const n1 = nach.find(n => n.id === e1.id), n2 = nach.find(n => n.id === e2.id);
  ok('das angefasste Gerät ist gewandert', n1.y > e1.y + 40, e1.y + ' → ' + n1.y);
  ok('das zweite markierte ist MITgewandert', n2.y > e2.y + 40, e2.y + ' → ' + n2.y);
  ok('und der Abstand zwischen beiden ist derselbe',
     (n2.x - n1.x) === vorX && (n2.y - n1.y) === vorY,
     vorX + '/' + vorY + ' → ' + (n2.x - n1.x) + '/' + (n2.y - n1.y));
  const nichtMarkiert = nach.find(n => n.name === 'Router 1');
  const warRouter = alle.find(n => n.name === 'Router 1');
  ok('ein nicht markiertes Gerät bleibt stehen',
     nichtMarkiert.x === warRouter.x && nichtMarkiert.y === warRouter.y);

  /* ─── Strg+Z und Strg+Y ──────────────────────────────────────*/
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const zurueck = (await lagen()).find(n => n.id === e1.id);
  ok('Strg+Z stellt die alte Stelle wieder her', zurueck.y === e1.y,
     e1.y + ' vs ' + zurueck.y);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  ok('Strg+Y bringt das Verschieben zurück',
     (await lagen()).find(n => n.id === e1.id).y === n1.y);
  /* Umschalt+Z ist die zweite Schreibweise für Wiederherstellen —
     auf mancher Tastatur die einzige bequeme. */
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(250);
  ok('Strg+Umschalt+Z tut dasselbe wie Strg+Y',
     (await lagen()).find(n => n.id === e1.id).y === n1.y);

  /* ─── Strg-Klick: markieren UND aufmachen ────────────────────
     Der zweite Teil des Wunsches: „ich öffne bei allen das Mini
     Modal, so kann ich die Einstellungen von mehreren Geräten
     gleichzeitig einsehen." */
  await page.evaluate(() => { window.SIM.flaeche.select(null); window.SIM.panels.closeKarte(); });
  await page.waitForTimeout(150);
  const q1 = await bild(e1.id), q2 = await bild(e2.id);
  await page.mouse.click(q1.x, q1.y);
  await page.waitForTimeout(250);
  ok('ein gewöhnlicher Klick macht ein Kärtchen auf', await kaertchen() === 1,
     String(await kaertchen()));
  ok('und zwar das benannte aus index.html',
     await page.locator('#karte').isVisible());

  await page.keyboard.down('Control');
  await page.mouse.click(q2.x, q2.y);
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);

  ok('Strg-Klick markiert das zweite dazu', await markiert() === 2,
     String(await markiert()));
  ok('und macht ein ZWEITES Kärtchen auf', await kaertchen() === 2,
     String(await kaertchen()));
  ok('beide Kärtchen zeigen ein Adressfeld',
     await page.locator('.karte:not([hidden]) input[data-f="ip"]').count() === 2,
     String(await page.locator('.karte:not([hidden]) input[data-f="ip"]').count()));
  ok('sie zeigen zwei verschiedene Geräte',
     (await page.locator('.karte:not([hidden]) .karte-name').allTextContents())
       .join('|') !== '', '');
  const namen = await page.locator('.karte:not([hidden]) .karte-name').allTextContents();
  ok('nämlich Endgerät 1 und Endgerät 2',
     namen.includes('Endgerät 1') && namen.includes('Endgerät 2'), namen.join(' | '));
  ok('die Kennungen stehen weiter genau einmal im Dokument',
     await page.locator('#karteBody').count() === 1,
     String(await page.locator('#karteBody').count()));

  /* ⚠️ Zwei Kärtchen auf demselben Fleck wären eines. */
  const rechtecke = await page.evaluate(() =>
    [...document.querySelectorAll('.karte:not([hidden])')]
      .map(e => { const r = e.getBoundingClientRect();
                  return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
  const ueberlappt = rechtecke[0].x < rechtecke[1].x + rechtecke[1].w
    && rechtecke[0].x + rechtecke[0].w > rechtecke[1].x
    && rechtecke[0].y < rechtecke[1].y + rechtecke[1].h
    && rechtecke[0].y + rechtecke[0].h > rechtecke[1].y;
  ok('und sie liegen nicht übereinander', !ueberlappt, JSON.stringify(rechtecke));

  /* Solange zwei offen sind, gibt es „Mehr ›" nicht — die große
     Ansicht ist ein Brett über die ganze Höhe, zwei davon können
     nicht nebeneinander stehen. */
  ok('„Mehr ›" ist bei zwei Kärtchen nicht da',
     await page.locator('.karte:not([hidden]) .karte-mehr:visible').count() === 0,
     String(await page.locator('.karte:not([hidden]) .karte-mehr:visible').count()));

  // Nochmal Strg-Klick nimmt es wieder heraus.
  await page.keyboard.down('Control');
  await page.mouse.click(q2.x, q2.y);
  await page.keyboard.up('Control');
  await page.waitForTimeout(250);
  ok('nochmal Strg-Klick nimmt das Gerät wieder heraus', await markiert() === 1,
     String(await markiert()));
  ok('und macht sein Kärtchen zu', await kaertchen() === 1, String(await kaertchen()));
  ok('„Mehr ›" ist dann wieder da',
     await page.locator('.karte:not([hidden]) .karte-mehr:visible').count() === 1);

  /* ─── Strg+A ─────────────────────────────────────────────────*/
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(250);
  ok('Strg+A markiert alle Geräte',
     await markiert() === await page.evaluate(() => window.SIM.netz.count),
     String(await markiert()));
  ok('auch das ohne einen Haufen Kärtchen', await kaertchen() === 0,
     String(await kaertchen()));

  /* ─── Kopieren und Einfügen ──────────────────────────────────*/
  await page.evaluate(() => { window.SIM.flaeche.select(null); });
  const vorZahl = await page.evaluate(() => window.SIM.netz.count);
  await page.mouse.click(q1.x, q1.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(400);
  ok('Strg+C und Strg+V legen ein Gerät dazu',
     await page.evaluate(() => window.SIM.netz.count) === vorZahl + 1,
     String(await page.evaluate(() => window.SIM.netz.count)));
  ok('die Kopie ist markiert', await markiert() === 1, String(await markiert()));
  ok('und trägt dieselbe Adresse wie das Original', await page.evaluate(() => {
    const S = window.SIM;
    const k = S.netz.get(S.flaeche.auswahlIds[0]);
    return k && k.nics[0].ip === '192.168.1.10';
  }));
  ok('die MAC-Adresse ist eine andere', await page.evaluate((orig) => {
    const S = window.SIM;
    const k = S.netz.get(S.flaeche.auswahlIds[0]);
    return k.nics[0].mac !== S.netz.get(orig).nics[0].mac;
  }, e1.id));
  /* ⚠️ Hier wurde einmal das „!" an beiden Geräten geprüft. Vom
     Nutzer abbestellt: „Wenn mehrere Geräte die gleiche IP haben,
     soll es keinen Fehler geben. Das ist mir zu viel Support, auch
     nun mit den lokalen IPs auch einfach falsch." Die Kopie trägt
     dieselbe Adresse (das ist Absicht — kopierte MAC-Adressen
     wären der stille Fehler, kopierte IP-Adressen sind ein
     sichtbarer), aber sie ist eben kein Fehler mehr. Gesagt wird
     es in der Kurzmeldung, nicht auf der Kachel. */
  ok('und trotzdem steht an keinem von beiden ein „!"',
     await page.locator('.nf-node.is-warn').count() === 0,
     String(await page.locator('.nf-node.is-warn').count()));
  ok('die Kurzmeldung sagt es stattdessen',
     (await page.locator('#toast').textContent()).includes('dieselben IP-Adressen'),
     await page.locator('#toast').textContent());

  // Zweites Einfügen legt die Kopie NEBEN die erste.
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(400);
  ok('zweimal Einfügen gibt zwei Kopien',
     await page.evaluate(() => window.SIM.netz.count) === vorZahl + 2);
  const zweiKopien = await page.evaluate(() => {
    const S = window.SIM;
    const l = S.netz.list();
    return [l[l.length - 2], l[l.length - 1]].map(n => ({ x: n.x, y: n.y }));
  });
  ok('und die zweite liegt nicht auf der ersten',
     zweiKopien[0].x !== zweiKopien[1].x, JSON.stringify(zweiKopien));

  /* ─── Entf ───────────────────────────────────────────────────*/
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  ok('Entf löscht die ganze Markierung',
     await page.evaluate(() => window.SIM.netz.count) === 0,
     String(await page.evaluate(() => window.SIM.netz.count)));
  ok('ohne Rückfrage, aber mit Hinweis auf Strg+Z',
     (await page.locator('#toast').textContent()).includes('Strg+Z'),
     await page.locator('#toast').textContent());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ok('und Strg+Z holt alles zurück',
     await page.evaluate(() => window.SIM.netz.count) === vorZahl + 2,
     String(await page.evaluate(() => window.SIM.netz.count)));

  /* ─── Der teuerste Fehlgriff, den es hier geben könnte ───────
     In einem Eingabefeld gehören diese Tasten dem FELD. Entf
     löscht dort ein Zeichen und nicht das Gerät, dessen Adresse man
     gerade tippt. */
  await page.evaluate(() => { window.SIM.flaeche.select(null); window.SIM.panels.closeKarte(); });
  await page.mouse.click((await bild(e1.id)).x, (await bild(e1.id)).y);
  await page.waitForTimeout(250);
  const feld = page.locator('#karteBody input.f[data-f="ip"]');
  await feld.fill('192.168.1.77');
  await feld.press('Delete');
  await feld.press('Control+a');
  await feld.press('Control+z');
  await page.waitForTimeout(300);
  ok('im Adressfeld löscht Entf kein Gerät',
     await page.evaluate(() => window.SIM.netz.count) === vorZahl + 2,
     String(await page.evaluate(() => window.SIM.netz.count)));
  ok('und Strg+A markiert dort keine Geräte',
     await markiert() === 1, String(await markiert()));

  await page.evaluate(() => window.SIM.panels.closeKarte());
  ok('keine Konsolenfehler nach den Bürokürzeln', errs.length === 0,
     errs.slice(0, 3).join(' | '));
  }

  /* ═══ Ein Kabel anklicken und mit Entf löschen ═══════════════
     Wörtlich verlangt: „Wenn ein Kabel angeklickt wurde, soll es
     mit Entf entfernt werden können." Der Klick öffnete das
     Kärtchen schon vorher — es fehlte die Auswahl, an der eine
     Taste sich festhalten kann, und im Aktionsmodus verschwand
     das Kärtchen gleich wieder.

     Geklickt wird über die MITTE der Leitung und nicht über
     `locator.click()`: die sichtbare Linie hat
     `pointer-events: none`, und der Mittelpunkt des umschließenden
     Rechtecks liegt bei einem schrägen Kabel neben dem Strich. */
  console.log('\n── Kabel: anklicken, Entf, Strg+Z ──────────────────');
  {
  /* ⚠️ Das Stück davor stand schon auf `router`, und
     `selectOption` auf einen bereits gewählten Wert lädt NICHTS
     neu — die Prüfung lief dann auf dem umgebauten Netz von
     vorhin (neun Geräte, Kabel woanders). Deshalb erst ein
     anderes Szenario. Das gilt für jedes Stück, das hier
     dazukommt. */
  await szenarioWaehlen(page, 'zwei');
  await page.waitForTimeout(600);

  /* Ein Kabel treffen, ohne zu raten. Die sichtbare Linie hat
     `pointer-events: none`; getroffen wird die 18 Punkte breite
     `.nf-cable-hit`. Deren Mittelpunkt liegt bei einem schrägen
     Kabel zwar auf dem Strich, kann aber von einem Fenster
     verdeckt sein (die Auftragskarte liegt links oben). Also
     wird gefragt, was an der Stelle wirklich liegt — und das
     erste Kabel genommen, das sich auch anklicken lässt. */
  const kabelMitte = async () => page.evaluate(() => {
    for (const c of window.SIM.netz.cableList()) {
      const g = document.querySelector('.nf [data-cable="' + c.id + '"] .nf-cable-hit');
      if (!g) continue;
      const r = g.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const el = document.elementFromPoint(x, y);
      if (el === g) return { x, y, id: c.id };
    }
    return null;
  });

  const vorKabel = await page.evaluate(() => window.SIM.netz.cableList().length);
  const k0 = await kabelMitte();
  ok('ein Kabel ist überhaupt anklickbar', !!k0, JSON.stringify(k0));
  await page.mouse.click(k0.x, k0.y);
  await page.waitForTimeout(300);

  ok('ein angeklicktes Kabel ist ausgewählt',
     await page.evaluate(() => window.SIM.flaeche.selKabel) === k0.id,
     String(await page.evaluate(() => window.SIM.flaeche.selKabel)));
  ok('und man sieht es ihm an',
     await page.locator('.nf-cable.is-sel').count() === 1,
     String(await page.locator('.nf-cable.is-sel').count()));
  ok('das Kärtchen geht weiterhin auf', await page.locator('#karte').isVisible());
  ok('mit den Reglern darin', await page.locator('#cDelay').count() === 1);
  /* Die Geräteauswahl muss dabei weg sein: sonst müsste Entf
     entscheiden, was gemeint ist. */
  ok('eine Geräteauswahl gibt es daneben nicht',
     (await page.evaluate(() => window.SIM.flaeche.auswahlIds.length)) === 0);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  ok('⭐ Entf löscht das angeklickte Kabel',
     await page.evaluate(() => window.SIM.netz.cableList().length) === vorKabel - 1,
     String(await page.evaluate(() => window.SIM.netz.cableList().length)));
  ok('mit Hinweis auf Strg+Z',
     (await page.locator('#toast').textContent()).includes('Strg+Z'),
     await page.locator('#toast').textContent());
  ok('und das Kärtchen ist zu', !(await page.locator('#karte').isVisible()));

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ok('Strg+Z holt das Kabel zurück',
     await page.evaluate(() => window.SIM.netz.cableList().length) === vorKabel,
     String(await page.evaluate(() => window.SIM.netz.cableList().length)));

  /* Der Knopf im Kärtchen muss denselben Schritt in den Verlauf
     legen wie die Taste — sonst weiß niemand, was Strg+Z tut. */
  const k1 = await kabelMitte();
  await page.mouse.click(k1.x, k1.y);
  await page.waitForTimeout(300);
  await page.locator('#cDel').click();
  await page.waitForTimeout(400);
  ok('der Knopf „Kabel löschen" tut dasselbe',
     await page.evaluate(() => window.SIM.netz.cableList().length) === vorKabel - 1);
  ok('und meldet denselben Schritt',
     await page.evaluate(() => window.SIM.verlauf.naechstesZurueck) === 'Kabel gelöscht',
     String(await page.evaluate(() => window.SIM.verlauf.naechstesZurueck)));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);

  /* Ein Gerät anzuklicken hebt die Kabelauswahl auf — und
     umgekehrt. */
  const eGer = await geraetPunkt(page, 0);
  await page.mouse.click(eGer.x, eGer.y);
  await page.waitForTimeout(300);
  ok('ein Gerät anzuklicken hebt die Kabelauswahl auf',
     await page.evaluate(() => window.SIM.flaeche.selKabel) === null);

  /* ⚠️ Im Aktionsmodus blieb das Kärtchen früher nicht stehen:
     `renderKarte()` machte dort alle Kärtchen zu, und das nächste
     beliebige Neuzeichnen nahm es wieder mit. Ein Klick, der
     manchmal wirkt, liest sich als kaputte Oberfläche. */
  await page.evaluate(() => window.SIM.setModus('aktion'));
  await page.waitForTimeout(500);
  const k2 = await kabelMitte();
  await page.mouse.click(k2.x, k2.y);
  await page.waitForTimeout(300);
  ok('auch im Aktionsmodus geht das Kabelkärtchen auf',
     await page.locator('#karte').isVisible());
  await page.evaluate(() => window.SIM.panels.renderKarte());
  await page.waitForTimeout(250);
  ok('⭐ und es bleibt beim nächsten Neuzeichnen stehen',
     await page.locator('#karte').isVisible());
  ok('Entf wirkt dort ebenso',
     await page.evaluate(() => {
       const S = window.SIM;
       return S.flaeche.selKabel !== null;
     }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok('Escape räumt die Kabelauswahl weg',
     await page.evaluate(() => window.SIM.flaeche.selKabel) === null);
  await page.evaluate(() => window.SIM.setModus('entwurf'));
  await page.waitForTimeout(300);

  ok('keine Konsolenfehler nach der Kabelauswahl', errs.length === 0,
     errs.slice(0, 3).join(' | '));
  }

  /* ═══ Das Textfeld im Mailprogramm ═══════════════════════════
     `textarea` hatte im ganzen Stylesheet keine Regel — das Feld
     stand auf der Browservorgabe von rund zwanzig Zeichen, egal
     wie breit das Fenster war. Geprüft wird gegen das Feld
     darüber („An:"), denn genau der Vergleich fiel im Bild auf. */
  console.log('\n── Das Schreibfeld geht über die ganze Breite ──────');
  {
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(600);
  /* Das E-Mail-Programm muss erst aufgespielt werden (`install:
     true` in PROGRAMME) — und das Konto eingerichtet sein, sonst
     zeigt das Programm die Kontoseite statt des Schreibfelds.
     Beides über das Modell: der Weg dorthin ist hier nicht der
     Gegenstand. */
  await page.evaluate(() => {
    const S = window.SIM;
    const n = S.netz.byName('Endgerät 1');
    n.software = (n.software || []).concat(['mail']);
    const k = S.netz.mailKonto(n);
    k.benutzer = 'anna'; k.domain = 'schule.de'; k.adresse = 'anna@schule.de';
    k.pop3 = 'mail.schule.de'; k.smtp = 'mail.schule.de';
    S.setModus('aktion');
    S.geraet.open(n.id);
  });
  /* ⚠️ Der Haken ERST HIER. Der Wechsel in den Aktionsmodus ruft
     `vonVorn()` und damit `dienste.reset()`, und das meldet ab —
     genau wie gewollt („von vorn" heißt auch hier von vorn). Vor
     dem Umschalten gesetzt, wäre er eine Zeile später wieder weg,
     und die Prüfung suchte ein Schreibfeld auf der Kontoseite. */
  await page.evaluate(() => {
    window.SIM.netz.byName('Endgerät 1').mailKonto.angemeldet = true;
    window.SIM.geraet.render();
  });
  await page.waitForTimeout(400);
  await programmAuf(page, 'mail');
  await page.waitForTimeout(300);
  /* ⚠️ Das Mailprogramm merkt sich, welche Seite offen war — und
     zwar je GERÄT. Der E-Mail-Abschnitt weiter oben lässt eine
     geöffnete Nachricht stehen, und dann gibt es „Neue E-Mail
     verfassen" gar nicht. Also erst zurück auf den Posteingang. */
  await page.locator('#dtWin .ml-reg[data-seite="eingang"]').click();
  await page.waitForTimeout(250);
  await page.locator('#mlNeu').click();
  await page.waitForTimeout(300);
  const masse = await page.evaluate(() => {
    const t = document.querySelector('#mlText');
    const a = document.querySelector('#mlAn');
    if (!t || !a) return null;
    return { t: t.getBoundingClientRect().width, a: a.getBoundingClientRect().width };
  });
  ok('das Schreibfeld ist so breit wie das Feld „An:"',
     masse && Math.abs(masse.t - masse.a) < 2, JSON.stringify(masse));
  ok('und damit deutlich breiter als die Browservorgabe',
     masse && masse.t > 200, JSON.stringify(masse));
  await page.evaluate(() => { window.SIM.geraet.close(); window.SIM.setModus('entwurf'); });
  await page.waitForTimeout(300);
  ok('keine Konsolenfehler im Mailfenster', errs.length === 0,
     errs.slice(0, 3).join(' | '));
  }

  /* ═══ Streaming-Server: echte Formulare im Browser ═══════════
     PLAN-SICHERHEIT, Schritt 2. Die Protokollseite prüft der
     kopflose Prüfstand; hier geht es um das, was nur ein Browser
     zeigt: dass ein Kind in einem Formular TIPPT, abschickt, ein
     Link die Seite wechselt und die Brücke (Sandbox + Einmal-
     schlüssel) das alles durchlässt — und sonst nichts. */
  console.log('\n── Streaming-Server ────────────────────────────────');
  {
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(600);
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(300);
  await page.locator('#speed').fill('4');
  const sv = await page.evaluate(() => {
    const S = window.SIM;
    const cli = S.netz.byName('Endgerät 1');
    /* Ein Gerät im SELBEN Netz wie der Kunde: hier geht es um die
       Seiten, nicht um Wegewahl (dafür hat das Szenario einen Router). */
    const pre = ((cli.nics.find(k => k.ip) || {}).ip || '').split('.').slice(0, 3).join('.') + '.';
    const srv = S.netz.list().find(n => n !== cli && (n.kind === 'server' || n.kind === 'host')
      && n.nics.some(k => k.ip && k.ip.indexOf(pre) === 0));
    const ip = (srv.nics.find(k => k.ip) || {}).ip;
    srv.software = ['streamingserver', 'mailserver', 'webserver'];
    const m = S.netz.mailConf(srv);
    m.on = true; m.domain = 'schule.de';
    m.konten = [{ benutzer: 'bernd', name: 'Bernd', passwort: 'x', posteingang: [] }];
    const s = S.netz.streamConf(srv);
    s.on = true; s.name = 'Annas Flix'; s.mailserver = ip;
    cli.software = (cli.software || []).concat(['browser']);
    S.dienste.sync();
    return { srv: srv.name, ip: ip, cli: cli.id };
  });
  ok('Aufbau: Server mit Streaming- und Mailserver', !!sv.ip, JSON.stringify(sv));
  await page.evaluate(() => window.SIM.flaeche.draw());
  ok('die Kachel trägt die Marke „Stream"', await markenAn(page, sv.srv, 'stream') === 1,
     String(await markenAn(page, sv.srv, 'stream')));

  // Serverfenster
  await page.evaluate((nm) => window.SIM.geraet.open(window.SIM.netz.byName(nm).id), sv.srv);
  await page.waitForTimeout(350);
  await programmAuf(page, 'streamingserver');
  await page.waitForTimeout(350);
  ok('das Serverfenster zeigt den Dienstnamen und den Mailserver',
     (await page.locator('#dtWin #stName').inputValue()) === 'Annas Flix'
     && (await page.locator('#dtWin #stMail').inputValue()) === sv.ip);
  ok('zwei von vier Filmen sind gewählt', await page.locator('#dtWin .st-film.is-on').count() === 2
     && await page.locator('#dtWin .st-film').count() === 4);
  await page.locator('#dtWin [data-film="4"]').click();
  await page.waitForTimeout(200);
  ok('ein dritter Tipp ersetzt den ältesten: es bleiben genau zwei (2 und 4)',
     await page.evaluate((nm) => JSON.stringify(window.SIM.netz.byName(nm).streamServer.filme), sv.srv) === '[2,4]');
  await page.locator('#dtWin [data-film="1"]').click();
  await page.waitForTimeout(200);
  ok('und wieder 4 und 1', await page.evaluate((nm) => JSON.stringify(window.SIM.netz.byName(nm).streamServer.filme), sv.srv) === '[4,1]');
  await page.locator('#dtWin [data-film="2"]').click();
  await page.locator('#dtWin [data-film="1"]').click().catch(() => {});
  await page.waitForTimeout(200);
  await page.evaluate((nm) => { window.SIM.netz.byName(nm).streamServer.filme = [1, 2]; window.SIM.geraet.render(); }, sv.srv);

  // Der Webserver kann nicht zusätzlich starten
  await page.evaluate((nm) => { window.SIM.netz.byName(nm).webServer = { on: false }; window.SIM.geraet.render(); }, sv.srv);
  await programmAuf(page, 'webserver');
  await page.waitForTimeout(300);
  ok('Port 80 belegt: der Webserver lässt sich nicht starten',
     await page.locator('#dtWin #wsStart').isDisabled());
  await programmAuf(page, 'streamingserver');
  await page.waitForTimeout(300);

  // Der Kunde
  await page.evaluate((id) => window.SIM.geraet.open(id), sv.cli);
  await page.waitForTimeout(350);
  await programmAuf(page, 'browser');
  await page.waitForTimeout(300);
  await page.locator('#dtWin #wbAdr').click();
  await page.keyboard.type(sv.ip);
  await page.keyboard.press('Enter');
  const rahmen = page.frameLocator('#dtWin .wb-rahmen');
  await rahmen.locator('h1', { hasText: 'Annas Flix' }).waitFor({ timeout: 60000 }).catch(async (e) => {
    console.log('  DIAG seite:', (await page.locator('#dtWin .wb-seite').textContent()).slice(0, 200),
      '| cli:', JSON.stringify(await page.evaluate((id) => window.SIM.netz.get(id).nics.map(k => k.ip + '/' + k.mask + ' gw ' + k.gw), sv.cli)),
      '| srv:', sv.ip);
    throw e;
  });
  ok('die Startseite zeigt den Dienstnamen des Betreibers', true);
  ok('die Kopfzeile und zwei Knöpfe stehen da',
     await rahmen.locator('a.knopf').count() === 2);

  // Ein Link wechselt die Seite (Brücke)
  await rahmen.locator('a[href="/registrieren"]').click();
  await rahmen.locator('h1', { hasText: 'Registrieren' }).waitFor({ timeout: 60000 });
  ok('⭐ ein Link im Rahmen führt auf die nächste Seite', (await page.locator('#dtWin #wbAdr').inputValue()).endsWith('/registrieren'),
     await page.locator('#dtWin #wbAdr').inputValue());

  // Formular ausfüllen — wie ein Kind: antippen und tippen
  const tipp = async (id, text) => { await rahmen.locator('#f-' + id).click(); await page.keyboard.type(text); };
  await tipp('name', 'Bernd Beispiel');
  await tipp('email', 'bernd@schule.de');
  await tipp('iban', 'DE12 3456 7890 1234');
  await tipp('bic', 'ABCDDEFF');
  await rahmen.locator('button', { hasText: 'Konto anlegen' }).click();
  await rahmen.locator('h1', { hasText: 'Fast geschafft' }).waitFor({ timeout: 90000 });
  ok('⭐ Registrieren: das Formular kam an, „Fast geschafft"', true);
  const pw = await page.evaluate((nm) => {
    const p = window.SIM.netz.mailConf(window.SIM.netz.byName(nm)).konten[0].posteingang;
    const m = p.length ? /Dein Passwort: (\S+)/.exec(p[0].text) : null;
    return m ? m[1] : '';
  }, sv.srv);
  ok('das Passwort liegt als Mail im Postfach', pw.length >= 5, pw);

  // Anmelden
  await rahmen.locator('a', { hasText: 'Zur Anmeldung' }).click();
  await rahmen.locator('#f-email').waitFor({ timeout: 60000 });
  await tipp('email', 'bernd@schule.de');
  await tipp('passwort', 'falsch');
  await page.keyboard.press('Enter');                       // Enter im Feld schickt ab
  await rahmen.locator('.fehler').waitFor({ timeout: 60000 });
  ok('falsches Passwort: rote Meldung, man bleibt auf der Anmeldung', /stimmt nicht/.test(await rahmen.locator('.fehler').textContent()));
  await rahmen.locator('#f-passwort').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(pw);
  await rahmen.locator('button', { hasText: 'Anmelden' }).click();
  await rahmen.locator('h1', { hasText: 'Hallo Bernd Beispiel' }).waitFor({ timeout: 60000 });
  ok('⭐ Anmelden: die Filmseite begrüßt den Kunden', true);
  ok('die Adresszeile zeigt nach der Weiterleitung /filme', (await page.locator('#dtWin #wbAdr').inputValue()).endsWith('/filme'),
     await page.locator('#dtWin #wbAdr').inputValue());
  ok('genau zwei Plakate, und sie sind geladen', await rahmen.locator('.film img').count() === 2
     && await rahmen.locator('.film img').first().evaluate(e => e.complete && e.naturalWidth > 0));

  // Like und Kommentar
  await rahmen.locator('.film').first().locator('form.gefaellt button').click();
  await rahmen.locator('.film').first().locator('form.gefaellt button', { hasText: '♥ 1' }).waitFor({ timeout: 60000 });
  ok('Like zählt', true);
  await rahmen.locator('.film').first().locator('input[name=text]').click();
  await page.keyboard.type('Sehr gut!');
  await page.keyboard.press('Enter');
  await rahmen.locator('.kommentare li', { hasText: 'Sehr gut!' }).waitFor({ timeout: 60000 });
  ok('⭐ der Kommentar steht unter dem Film', true);

  // Mein Konto
  await rahmen.locator('a', { hasText: 'Mein Konto' }).click();
  await rahmen.locator('td', { hasText: 'DE12 3456 7890 1234' }).waitFor({ timeout: 60000 });
  ok('Mein Konto zeigt die Bankdaten', true);
  await page.screenshot({ path: path.join(OUT, 'shot-streaming.png') });

  // Mitschnitt: alles im Klartext
  const klar = await page.evaluate(() => window.SIM.mit.view().map(r => {
    const p = r.frame && r.frame.payload; const t = p && p.payload; return (t && t.data) || '';
  }).join('\n'));
  ok('⭐ im Mitschnitt: iban, passwort und Cookie im Klartext',
     /iban=DE12\+3456\+7890\+1234/.test(klar) && /passwort=/.test(klar) && /Cookie: sid=/.test(klar));

  // Die Sicherung gilt weiter: die Brücke ist das einzige Skript
  ok('in der gezeigten Seite läuft nur die Brücke', await page.evaluate(() => {
    const f = document.querySelector('#dtWin .wb-rahmen');
    return (f.srcdoc.match(/<script/gi) || []).length === 1;
  }));
  ok('keine Konsolenfehler beim Streaming-Server', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.evaluate(() => { window.SIM.geraet.close(); window.SIM.setModus('entwurf'); });
  }

  /* ═══ Geräte ohne Bildschirm ═════════════════════════════════
     Vom Nutzer gesetzt: „Router, Switch und Heimrouter haben keine
     Desktop-Oberfläche." Geprüft wird die Grenze — der Router
     bekommt ein Werkzeugfenster, das Endgerät behält seinen
     Bildschirm. Ohne die zweite Hälfte wäre die Prüfung mit einer
     Änderung zufrieden, die ALLEN den Bildschirm nimmt. */
  console.log('\n── Geräte ohne Bildschirm ──────────────────────────');
  {
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(800);
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(300);

  const auf = (kind) => page.evaluate((k) => {
    const S = window.SIM;
    S.geraet.open(S.netz.list().find(n => n.kind === k).id);
  }, kind);

  await auf('router');
  await page.waitForTimeout(350);
  ok('der Router bekommt ein Fenster ohne Bildschirm',
     await page.locator('#desktop.dt--kein').count() === 1);
  ok('ohne Tapete und ohne Programmkacheln',
     await page.locator('#desktop .dt-app').count() === 0);
  ok('und ohne zweite Kopfzeile im Fenster',
     await page.locator('.dt-winh').count() === 0);
  /* ⭐ Seit 2026-09-28 eine kompakte Leseansicht. Vom Nutzer: „Ein
     Router hat keinen Bildschirm … Raus! Einstellungen kann ich
     jetzt nicht mehr ändern! Terminal brauche ich hier nicht. Alle
     Infos aus den Modalen werden in einer kompakten Ansicht
     dargestellt." */
  ok('⭐ kein Satz über das Gerät, keine Reiter, kein Terminal',
     await page.locator('#desktop .dt-kein').count() === 0
     && await page.locator('.dt-reg-b').count() === 0
     && await page.locator('#dtWin .k-reiter-b').count() === 0
     && await page.evaluate(() => !document.querySelector('#dtWin #term')));
  ok('⭐ nichts zum Einstellen: kein Feld, kein Haken',
     await page.locator('#dtWin input, #dtWin select').count() === 0);
  ok('alle Karten, Gateway und Weiterleitungstabelle auf einer Seite',
     await page.evaluate(() => {
       const w = document.querySelector('#dtWin');
       const t = w.textContent;
       return w.querySelectorAll('.kk-nic').length === 2 && t.includes('Gateway')
         && t.includes('Weiterleitungstabelle') && !!w.querySelector('[data-tabellen]');
     }));

  await auf('switch');
  await page.waitForTimeout(350);
  ok('der Switch ebenso, und ohne Reiter',
     await page.locator('#desktop.dt--kein').count() === 1
     && await page.locator('.dt-reg-b').count() === 0);
  ok('seine MAC-Tabelle steht trotzdem darin',
     await page.locator('#dtWin [data-tabellen]').count() === 1);
  ok('er bekommt kein Terminal',
     await page.locator('[data-app="terminal"]').count() === 0);
  ok('⭐ und sein WLAN lässt sich hier nicht schalten',
     await page.locator('#dtWin input').count() === 0);

  /* ⚠️ Die Gegenprobe: ein Endgerät IST ein Rechner und behält
     seinen Bildschirm samt Kacheln und Schnellzugriff. */
  await auf('host');
  await page.waitForTimeout(350);
  ok('ein Endgerät behält seinen Bildschirm',
     await page.locator('#desktop.dt--kein').count() === 0
     && await page.locator('#desktop .dt-app').count() === 3,
     String(await page.locator('#desktop .dt-app').count()));

  /* ─── Entf, auch im Aktionsmodus ─────────────────────────────
     Vom Nutzer verlangt, ohne Modus im Satz: „Mit der Entf möchte
     ich das bzw. die ausgewählten Geräte löschen." Vorher wirkte
     die Taste nur im Entwurf — eine Taste, die manchmal nichts tut,
     ohne dass etwas sichtbar anders ist, liest sich als kaputte
     Tastatur und nicht als Regel. */
  await page.evaluate(() => window.SIM.geraet.close());
  const warenEs = await page.evaluate(() => window.SIM.netz.count);
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.byName('Endgerät 1').id, true);
  });
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(350);
  ok('Entf löscht auch im Aktionsmodus',
     await page.evaluate(() => window.SIM.netz.count) === warenEs - 1,
     String(await page.evaluate(() => window.SIM.netz.count)));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  ok('und Strg+Z holt es dort ebenso zurück',
     await page.evaluate(() => window.SIM.netz.count) === warenEs);

  await page.locator('.mbtn[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);
  ok('keine Konsolenfehler nach den Geräten ohne Bildschirm',
     errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  /* ═══ Der Heimrouter zeigt seine LAN-Seite ═══════════════════
     ⚠️ Der Fall, der die Regel überhaupt sichtbar macht: die
     WAN-Karte hat eine Adresse, die LAN-Seite noch nicht. Vorher
     wurde WAN nur nach hinten sortiert — war es die EINZIGE
     Adresse, stand sie trotzdem unter der Kachel, und das Haus
     trug plötzlich die Nummer des Anbieters. */
  {
  await page.evaluate(() => {
    const S = window.SIM;
    for (const n of S.netz.list().slice()) S.netz.removeNode(n.id);
    const hr = S.netz.addNode('heimrouter', 700, 500);
    hr.nics[S.netz.WAN].ip = '84.12.5.9';
    hr.nics[S.netz.WAN].mask = '255.255.255.0';
    S.flaeche.draw();
  });
  await page.waitForTimeout(350);
  const unten = await page.evaluate(() => {
    const hr = window.SIM.netz.list()[0];
    const g = document.querySelector('[data-node="' + hr.id + '"]');
    return g ? g.textContent : '';
  });
  ok('die WAN-Adresse steht NICHT unter der Kachel',
     !unten.includes('84.12.5.9'), unten);
  ok('stattdessen sagt sie, dass das Haus noch keine hat',
     unten.includes('keine IP'), unten);
  await page.evaluate(() => {
    const S = window.SIM;
    const hr = S.netz.list()[0];
    hr.nics[S.netz.LAN].ip = '192.168.178.1';
    hr.nics[S.netz.LAN].mask = '255.255.255.0';
    S.flaeche.draw();
  });
  await page.waitForTimeout(300);
  const unten2 = await page.evaluate(() => {
    const hr = window.SIM.netz.list()[0];
    return document.querySelector('[data-node="' + hr.id + '"]').textContent;
  });
  ok('sobald das Haus eine hat, steht sie da',
     unten2.includes('192.168.178.1') && !unten2.includes('84.12.5.9'), unten2);
  }

  console.log('\n── Weiterleitung von Hand ──────────────────────────');
  {
  /* Eigenes Netz statt eines Szenarios: die Kette aus drei Netzen
     und zwei Routern ist der Aufbau, für den es diese Tabelle gibt.
     Aufgebaut über das Modell, geprüft über die Oberfläche — der
     Weg dazwischen ist das, was ausfallen kann. */
  await page.evaluate(() => {
    const S = window.SIM;
    for (const n of S.netz.list().slice()) S.netz.removeNode(n.id);
    const a  = S.netz.addNode('host', 300, 400, 'Endgerät 1');
    const r1 = S.netz.addNode('router', 700, 400, 'Router 1');
    const r2 = S.netz.addNode('router', 1100, 400, 'Router 2');
    const c  = S.netz.addNode('host', 1500, 400, 'Endgerät 2');
    a.nics[0].ip = '192.168.1.10'; a.gateway = '192.168.1.1';
    r1.nics[0].ip = '192.168.1.1'; r1.nics[1].ip = '192.168.2.1';
    r2.nics[0].ip = '192.168.2.2'; r2.nics[1].ip = '192.168.3.1';
    c.nics[0].ip = '192.168.3.10'; c.gateway = '192.168.3.1';
    S.netz.addCable(a.id, 0, r1.id, 0);
    S.netz.addCable(r1.id, 1, r2.id, 0);
    S.netz.addCable(r2.id, 1, c.id, 0);
    S.flaeche.draw();
  });
  await page.waitForTimeout(400);

  const karteAuf = async (name) => {
    await page.evaluate((nm) => {
      const S = window.SIM;
      S.flaeche.select(S.netz.byName(nm).id);
    }, name);
    await page.waitForTimeout(300);
  };
  const allgemein = async () => {
    await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
    await page.waitForTimeout(250);
  };
  /* ⚠️ „Mehr ›" ist ein UMSCHALTER, und er bleibt über den
     Gerätewechsel hinweg stehen. Ein blinder Klick machte das
     Kärtchen deshalb je nach vorherigem Abschnitt groß ODER klein —
     der Prüfstand lief dann an einer Stelle ins Leere, die mit den
     neuen Sachen nichts zu tun hatte. Also erst nachsehen. */
  const grossMachen = async () => {
    const t = (await page.locator('#karteMehr').textContent()).trim();
    if (t.includes('Mehr')) {
      await page.locator('#karteMehr').click();
      await page.waitForTimeout(300);
    }
  };

  await karteAuf('Router 1');
  await grossMachen();
  await allgemein();

  ok('der Router hat eine Weiterleitungstabelle im Reiter „Allgemein"',
     (await page.locator('#karteBody').textContent()).includes('Weiterleitungstabelle'));
  /* ⭐ Der Knopf „Neue Zeile" steht hier NICHT mehr — vom Nutzer
     gestrichen („kein ‚Neue Zeile', kein Blabla drum herum,
     maximal ein Erklärsatz"). Angelegt wird im Fenster. */
  ok('⭐ aber keinen Knopf „Neue Zeile" — den hat das Fenster',
     await page.locator('#karteBody [data-k="wegneu"]').count() === 0);
  ok('und noch keiner Zeile',
     await page.locator('#karteBody .k-weg').count() === 0);
  ok('⭐ dafür genau EIN Erklärsatz und der Knopf ins Fenster',
     (await page.locator('#karteBody').textContent())
       .includes('braucht ein Router eine Zeile')
     && await page.locator('#karteBody [data-k="wegfenster"]').count() === 1);

  /* ─ Eine Zeile anlegen — im Fenster, dem einzigen Ort dafür ─ */
  await page.locator('#karteBody [data-k="wegfenster"]').click();
  await page.waitForTimeout(450);
  await page.locator('#wltNeu').click();
  await page.waitForTimeout(300);
  ok('„Neue Zeile" im Fenster legt eine Zeile an',
     await page.locator('#karteBody .k-weg').count() === 1);
  ok('sie kommt LEER — keine vorweggenommene Antwort',
     await page.evaluate(() => [...document.querySelectorAll('#karteBody .k-weg-f input')]
       .every(i => i.value === '')));
  ok('drei Felder: Ziel, Netzmaske, Nächstes Gateway',
     await page.locator('#karteBody .k-weg-f input').count() === 3);
  /* Der Schreibstrich springt dorthin, wo geklickt wurde — ins
     erste Feld der neuen Zeile IM FENSTER. */
  ok('⭐ der Schreibstrich steht im ersten Feld der neuen Zeile',
     await page.evaluate(() => document.activeElement
       && document.activeElement.dataset.f === 'wltnet'),
     await page.evaluate(() => document.activeElement
       && (document.activeElement.dataset.f || document.activeElement.tagName)));
  /* Ab hier wieder das Kärtchen allein — das Fenster hat seinen
     eigenen Abschnitt weiter unten. */
  await page.locator('#wltClose').click();
  await page.waitForTimeout(450);

  /* ─ Und jetzt die Messung. Genau hier ist in diesem Programm
     schon zweimal etwas durchgerutscht, das beide Prüfstände grün
     gemeldet haben (`.k-add` als Blockknopf) — drei Felder in einer
     Reihe sind derselbe Fall. Gemessen wird gegen den Kasten, nicht
     gegen eine Zahl: die Breite des Kärtchens ist eine Stellschraube. */
  const masse = await page.evaluate(() => {
    const reihe = document.querySelector('#karteBody .k-weg-f');
    const felder = [...reihe.querySelectorAll('input')];
    return {
      reihe: reihe.getBoundingClientRect().width,
      kasten: document.querySelector('#karteBody').clientWidth,
      felder: felder.map(f => Math.round(f.getBoundingClientRect().width)),
      hoehe: Math.round(reihe.getBoundingClientRect().height)
    };
  });
  ok('die Zeile passt in das Kärtchen', masse.reihe <= masse.kasten + 1,
     masse.reihe + ' in ' + masse.kasten);
  ok('die drei Felder sind gleich breit — alle drei tragen eine Adresse',
     Math.max(...masse.felder) - Math.min(...masse.felder) <= 2, masse.felder.join(' / '));
  /* ⚠️ Eine Adresse braucht Platz. Ist ein Feld schmaler als
     70 px, ist „255.255.255.0" darin nicht zu lesen, und die
     Tabelle behauptet etwas, was sie nicht zeigt. */
  ok('und breit genug für eine IP-Adresse (≥ 70 px)',
     Math.min(...masse.felder) >= 70, masse.felder.join(' / '));
  ok('die Reihe bricht nicht um', masse.hoehe < 44, String(masse.hoehe));

  /* ─ Die Auskunft unter der Zeile ─ Drei Zustände, und der
     interessante ist der falsche. */
  ok('unfertig sagt sie „noch nicht vollständig"',
     (await page.locator('#karteBody .k-weg-w').textContent()).includes('noch nicht vollständig'));

  const tippen = async (feld, wert) => {
    await page.locator('#karteBody [data-f="' + feld + '"]').fill(wert);
    await page.waitForTimeout(200);
  };
  await tippen('wegnet', '192.168.3.0');
  await tippen('wegmask', '255.255.255.0');
  await tippen('weggw', '10.0.0.1');
  ok('⭐ ein Gateway in keinem eigenen Netz wird SOFORT gemeldet',
     (await page.locator('#karteBody .k-weg-w').textContent())
       .includes('liegt in keinem Netz dieses Geräts'),
     await page.locator('#karteBody .k-weg-w').textContent());
  ok('und zwar rot', await page.locator('#karteBody .k-weg-w.is-bad').count() === 1);
  ok('die Weiterleitung nimmt diese Zeile nicht',
     await page.evaluate(() => window.SIM.stack.routeFor(
       window.SIM.netz.byName('Router 1'), window.NetUtil.ip2int('192.168.3.10')) === null));

  /* ⚠️ Beim Tippen darf das Formular NICHT neu entstehen — sonst
     verliert das Feld nach jedem Zeichen den Fokus. Geprüft wird
     beides zusammen: die Auskunft geht mit UND der Strich bleibt. */
  await page.locator('#karteBody [data-f="weggw"]').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('192.168.2.2');
  await page.waitForTimeout(250);
  /* „Netzwerkkarte 2" und nicht „LAN 2": die Wörter WAN und LAN
     stehen nur am Heimrouter, wo sie auf dem Gehäuse stehen. Am
     Router heißt es wie in Filius (jvermittlungsrechner-
     konfiguration_msg10) „Netzwerkkarte". */
  ok('⭐ die Auskunft geht beim Tippen mit',
     (await page.locator('#karteBody .k-weg-w').textContent()).includes('über Netzwerkkarte 2'),
     await page.locator('#karteBody .k-weg-w').textContent());
  ok('sie nennt die Karte, die sich daraus ergibt',
     (await page.locator('#karteBody .k-weg-w').textContent()).includes('192.168.2.1'),
     await page.locator('#karteBody .k-weg-w').textContent());
  ok('und zwar grün', await page.locator('#karteBody .k-weg-w.is-ok').count() === 1);
  ok('⭐ und der Schreibstrich bleibt im Feld',
     await page.evaluate(() => document.activeElement
       && document.activeElement.dataset.f === 'weggw'),
     await page.evaluate(() => document.activeElement
       && (document.activeElement.dataset.f || document.activeElement.tagName)));

  ok('die Zeile steht jetzt im Modell',
     await page.evaluate(() => {
       const r = window.SIM.netz.byName('Router 1').routes[0];
       return r && r.net === '192.168.3.0' && r.mask === '255.255.255.0'
              && r.gateway === '192.168.2.2';
     }));
  ok('und die Weiterleitung benutzt sie',
     await page.evaluate(() => {
       const w = window.SIM.stack.routeFor(window.SIM.netz.byName('Router 1'),
                                           window.NetUtil.ip2int('192.168.3.10'));
       return !!w && w.why === 'eingetragen';
     }));
  ok('in der Tabelle „Wege" steht sie mit ihrer Herkunft',
     (await page.locator('#karteBody [data-tabellen]').textContent()).includes('eingetragen'));

  /* ─ Die Gegenzeile am zweiten Router, und dann muss es gehen ─ */
  await karteAuf('Router 2');
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="wegfenster"]').click();
  await page.waitForTimeout(450);
  await page.locator('#wltNeu').click();
  await page.waitForTimeout(250);
  await page.locator('#wltClose').click();
  await page.waitForTimeout(450);
  await tippen('wegnet', '192.168.1.0');
  await tippen('wegmask', '255.255.255.0');
  await tippen('weggw', '192.168.2.1');
  await page.waitForTimeout(200);

  await page.locator('#karteClose').click();
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(400);
  const durch = await page.evaluate(() => new Promise((f) => {
    const S = window.SIM;
    S.stack.ping(S.netz.byName('Endgerät 1'), '192.168.3.10', 1, 8000000,
                 (r) => f(!!r && r.ok));
    S.engine.start();
  }));
  await page.waitForTimeout(400);
  ok('⭐ mit beiden Zeilen von Hand kommt der Ping durch drei Netze',
     durch === true, String(durch));
  await page.evaluate(() => window.SIM.engine.stop());
  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);

  /* ─ Löschen ─ */
  await karteAuf('Router 2');
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="wegdel"]').click();
  await page.waitForTimeout(300);
  ok('das × entfernt die Zeile',
     await page.locator('#karteBody .k-weg').count() === 0
     && await page.evaluate(() => window.SIM.netz.byName('Router 2').routes.length) === 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  ok('und Strg+Z holt sie zurück',
     await page.evaluate(() => window.SIM.netz.byName('Router 2').routes.length) === 1,
     String(await page.evaluate(() => window.SIM.netz.byName('Router 2').routes.length)));

  /* ─ Ein Endgerät hat das nicht ─ Es leitet nichts weiter, und ein
     Formular, das ein Gerät nicht benutzt, ist eine Frage, die
     niemand stellen sollte. */
  await karteAuf('Endgerät 1');
  ok('ein Endgerät hat keine Weiterleitungstabelle',
     !(await page.locator('#karteBody').textContent()).includes('Weiterleitungstabelle'));
  await page.locator('#karteClose').click();
  await page.waitForTimeout(200);

  ok('keine Konsolenfehler nach der Weiterleitung von Hand',
     errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  console.log('\n── Die Weiterleitungstabelle als Fenster ───────────');
  {
  /* Dieselbe Kette aus drei Netzen und zwei Routern — der Aufbau,
     für den es dieses Fenster gibt. Geprüft wird der ganze Weg:
     Knopf im Kärtchen → Fenster auf → Reiter wechseln → eintippen →
     × zu. */
  await page.evaluate(() => {
    const S = window.SIM;
    for (const n of S.netz.list().slice()) S.netz.removeNode(n.id);
    const a  = S.netz.addNode('host', 300, 400, 'Endgerät 1');
    const r1 = S.netz.addNode('router', 700, 400, 'Router 1');
    const r2 = S.netz.addNode('router', 1100, 400, 'Router 2');
    const c  = S.netz.addNode('host', 1500, 400, 'Endgerät 2');
    a.nics[0].ip = '192.168.1.10'; a.gateway = '192.168.1.1';
    r1.nics[0].ip = '192.168.1.1'; r1.nics[1].ip = '192.168.2.1';
    r2.nics[0].ip = '192.168.2.2'; r2.nics[1].ip = '192.168.3.1';
    c.nics[0].ip = '192.168.3.10'; c.gateway = '192.168.3.1';
    S.netz.addCable(a.id, 0, r1.id, 0);
    S.netz.addCable(r1.id, 1, r2.id, 0);
    S.netz.addCable(r2.id, 1, c.id, 0);
    S.flaeche.draw();
  });
  await page.waitForTimeout(400);

  const waehlen = async (name) => {
    await page.evaluate((nm) => {
      const S = window.SIM;
      S.flaeche.select(S.netz.byName(nm).id);
    }, name);
    await page.waitForTimeout(300);
  };
  const aufAllgemein = async () => {
    await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
    await page.waitForTimeout(250);
  };

  await waehlen('Router 1');
  await aufAllgemein();

  /* ─ Die neue Reihenfolge im Reiter ─
     Gateway → DNS → Netze → Automatisches Routing →
     Weiterleitungstabelle. Vom Nutzer gesetzt, und dieselbe wie in
     Filius (der Haken steht dort direkt unter dem Gateway-Feld). */
  {
    const t = await page.locator('#karteBody').textContent();
    const p = (s) => t.indexOf(s);
    ok('⭐ Gateway · DNS · Netze · Automatisches Routing · Weiterleitungstabelle',
       p('Gateway') >= 0 && p('Gateway') < p('Netze an diesem Gerät')
       && p('Netze an diesem Gerät') < p('Automatisches Routing')
       && p('Automatisches Routing') < p('Weiterleitungstabelle'),
       [p('Gateway'), p('Netze an diesem Gerät'), p('Automatisches Routing'),
        p('Weiterleitungstabelle')].join(' / '));
  }
  /* Die Netze des Routers stehen jetzt auch im Reiter „Allgemein" —
     das ist die Seite, die beim Reiterwechsel im Fenster aufgeht. */
  ok('Router 1 zeigt seine zwei Netze',
     await page.locator('#karteBody .k-netz').count() === 2);

  /* ─ Der Knopf ─ Er steht nur da, solange der Haken NICHT gesetzt
     ist. Gesetzt braucht es die Tabelle nicht, und dann steht dort
     der Satz statt der Zeilen. */
  ok('bei ausgeschaltetem Routing gibt es den Knopf „Zur Weiterleitungstabelle"',
     await page.locator('#karteBody [data-k="wegfenster"]').count() === 1);

  await page.locator('#karteBody [data-k="rip"]').check();
  await page.waitForTimeout(350);
  {
    const t = await page.locator('#karteBody').textContent();
    ok('⭐ mit Haken steht dort nur noch der Satz',
       t.includes('Wird beim automatischen Routing nicht benötigt'), t.slice(0, 100));
    ok('und der Knopf ist weg',
       await page.locator('#karteBody [data-k="wegfenster"]').count() === 0);
    ok('Zeilen zum Eintragen gibt es dann auch keine',
       await page.locator('#karteBody .k-weg').count() === 0);
  }
  await page.locator('#karteBody [data-k="rip"]').uncheck();
  await page.waitForTimeout(350);

  /* Das Kärtchen für sich — die neue Reihenfolge ist eine Sache,
     die man sehen muss. */
  await page.locator('#karte').screenshot({ path: path.join(OUT, 'shot-router-allgemein.png') });

  /* ─ Auf ─ */
  await page.locator('#karteBody [data-k="wegfenster"]').click();
  await page.waitForTimeout(450);
  ok('der Knopf schlägt das Fenster auf',
     await page.evaluate(() => document.body.classList.contains('wlt-open')));

  /* ⚠️ „Über die ganze Breite" ist die Forderung, und sie ist in
     Zahlen zu prüfen — ein Fenster, das 40 px zu schmal ist, sieht
     auf dem Bild richtig aus. */
  const breit = await page.evaluate(() => {
    const r = document.getElementById('wlt').getBoundingClientRect();
    return { l: Math.round(r.left), w: Math.round(r.width), doc: window.innerWidth };
  });
  ok('und zwar über die ganze Breite',
     breit.l === 0 && Math.abs(breit.w - breit.doc) <= 1, JSON.stringify(breit));

  /* ─ Vier Spalten, Wortlaut aus Filius, und „Herkunft" dazu ─ */
  {
    const k = await page.locator('#wltBody .wlt-th').allTextContents();
    ok('⭐ die Kopfzeile nennt alle vier Spalten',
       k.slice(0, 4).join('|') === 'Ziel|Netzmaske|Nächstes Gateway|Über Schnittstelle',
       k.join('|'));
    ok('und dahinter „Herkunft" — die Spalte, die Filius nicht hat',
       k[4] === 'Herkunft', k.join('|'));
  }

  /* ─ EINE Tabelle, nicht zwei ─
     ⚠️ Der Kern dieser Runde. Der Nutzer: „ich hätte da auch nur,
     wie in Filius, gerne einen sauberen Bereich für die Tabelle.
     Die Standards stehen auch drin, nur grau und nicht
     bearbeitbar." Geprüft wird beides: dass sie drinstehen, und
     dass man sie NICHT anfassen kann. */
  {
    ok('⭐ es gibt genau EINE Tabelle im Fenster',
       await page.locator('#wltBody .wlt-tbl').count() === 1);
    ok('und keine zweite darunter',
       await page.locator('#wltBody table').count() === 0);
    const t = await page.locator('#wltBody').textContent();
    ok('die direkt angeschlossenen Netze stehen mit drin',
       t.includes('direkt'), t.slice(0, 200));
    ok('⭐ und zwar als Text, nicht als Feld — nicht bearbeitbar',
       await page.locator('#wltBody .wlt-c.is-auto').count() > 0
       && await page.locator('#wltBody .wlt-tbl input:disabled').count() === 0);
    ok('der Haken „Alle Einträge anzeigen" ist gesetzt — wie in Filius',
       await page.locator('#wltAlle').isChecked());
  }

  /* ─ Und der Haken nimmt sie weg ─ */
  {
    const vorher = await page.locator('#wltBody .wlt-c.is-auto').count();
    await page.locator('#wltAlle').uncheck();
    await page.waitForTimeout(300);
    ok('⭐ ohne Haken bleibt nur, was von Hand dasteht',
       vorher > 0 && await page.locator('#wltBody .wlt-c.is-auto').count() === 0,
       String(vorher));
    ok('und die Kopfzeile bleibt trotzdem stehen',
       await page.locator('#wltBody .wlt-th').count() === 6);
    await page.locator('#wltAlle').check();
    await page.waitForTimeout(300);
    ok('der Haken holt sie zurück',
       await page.locator('#wltBody .wlt-c.is-auto').count() === vorher);
  }

  /* ─ Ein Reiter je Router, und der gewählte ist markiert ─ */
  {
    const tabs = await page.locator('#wltTabs .wlt-tab').allTextContents();
    ok('es gibt einen Reiter je Router',
       tabs.length === 2, tabs.join(' | '));
    ok('mit dem Kürzel von der Fläche und dem Namen',
       tabs[0].includes('R1') && tabs[0].includes('Router 1'), tabs[0]);
  }
  ok('Router 1 ist der offene Reiter',
     await page.evaluate(() =>
       document.querySelector('#wltTabs .wlt-tab.is-on').dataset.wlt
       === window.SIM.netz.byName('Router 1').id));

  /* ─ Eine Zeile anlegen und eintippen ─
     ⚠️ `click()` + `keyboard.type()` und nicht `fill()`: `fill()`
     klickt nicht, und genau dieser Unterschied hat in der
     Mail-Runde einen echten Fehler durchgehen lassen. */
  await page.locator('#wltNeu').click();
  await page.waitForTimeout(300);
  ok('„Neue Zeile" legt eine Zeile an',
     await page.evaluate(() => window.SIM.netz.byName('Router 1').routes.length) === 1);

  await page.locator('#wltBody [data-f="wltnet"]').click();
  await page.keyboard.type('192.168.3.0');
  await page.locator('#wltBody [data-f="wltmask"]').click();
  await page.keyboard.type('255.255.255.0');
  await page.locator('#wltBody [data-f="wltgw"]').click();
  await page.keyboard.type('192.168.2.2');
  await page.waitForTimeout(350);

  ok('die Zeile steht im Modell',
     await page.evaluate(() => {
       const r = window.SIM.netz.byName('Router 1').routes[0];
       return r.net === '192.168.3.0' && r.mask === '255.255.255.0'
         && r.gateway === '192.168.2.2';
     }));
  ok('⭐ die vierte Spalte sagt, über welche Karte das geht',
     (await page.locator('#wltBody [data-wltw="0"]').textContent())
       .includes('192.168.2.1'),
     await page.locator('#wltBody [data-wltw="0"]').textContent());
  ok('und sie meldet sich als in Ordnung',
     await page.evaluate(() =>
       document.querySelector('#wltBody [data-wltw="0"]').classList.contains('is-ok')));

  /* ⚠️ Dieselbe Zeile steht im Kärtchen noch einmal. Ohne
     Nachmalen stünde dort die Zahl von vorhin — das Modell zu
     ändern ist noch keine Änderung im Bild. */
  ok('⭐ das Kärtchen zeigt dieselbe Zeile',
     await page.evaluate(() =>
       [...document.querySelectorAll('#karteBody [data-f="wegnet"]')]
         .some(i => i.value === '192.168.3.0')));

  /* ─ Die eingetragene Zeile steht in derselben Tabelle wie die
     grauen — das ist die Antwort auf „hat meine Zeile etwas
     bewirkt", ohne den Blick zu wechseln. */
  {
    const t = await page.locator('#wltBody .wlt-tbl').textContent();
    ok('die eigene Zeile ist als „von Hand" gekennzeichnet',
       t.includes('von Hand'), t.slice(0, 200));
    ok('und die direkten Netze stehen in derselben Tabelle',
       t.includes('direkt'), t.slice(0, 200));
  }

  /* ─ Ein Gateway, das nirgends liegt ─ der häufigste Fehler an
     dieser Tabelle, und er muss sofort dastehen. */
  await page.locator('#wltBody [data-f="wltgw"]').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('10.9.9.9');
  await page.waitForTimeout(300);
  ok('ein Gateway in keinem eigenen Netz wird sofort gemeldet',
     await page.evaluate(() =>
       document.querySelector('#wltBody [data-wltw="0"]').classList.contains('is-bad')));
  await page.locator('#wltBody [data-f="wltgw"]').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('192.168.2.2');
  await page.waitForTimeout(300);

  /* ─ Reiter wechseln ─ Der Kern des Wunsches: das Gerät des
     Reiters ist auf der Fläche markiert und zeigt dort seine
     Netze, und sein Kärtchen geht auf. */
  await page.locator('#wltTabs .wlt-tab', { hasText: 'Router 2' }).click();
  await page.waitForTimeout(400);
  ok('⭐ der Reiterwechsel markiert das Gerät auf der Fläche',
     await page.evaluate(() =>
       window.SIM.flaeche.selected === window.SIM.netz.byName('Router 2').id));
  ok('und schlägt sein Kärtchen auf',
     await page.evaluate(() =>
       window.SIM.panels.istOffen('node', window.SIM.netz.byName('Router 2').id)));
  ok('das Fenster zeigt jetzt Router 2 — also keine Zeile von Hand',
     await page.locator('#wltBody [data-f="wltnet"]').count() === 0);
  /* Seine eigenen Netze kennt er trotzdem — grau, und das ist die
     Antwort auf „warum steht da schon was". */
  ok('⭐ seine zwei direkten Netze stehen aber grau da',
     await page.locator('#wltBody .wlt-c.is-auto').count() >= 2);
  /* ⚠️ Die Kopfzeile bleibt trotzdem stehen: sie sagt, was verlangt
     wird, und das ist vor der ersten Zeile am nötigsten. */
  ok('die Spaltennamen stehen auch ohne Zeile da',
     await page.locator('#wltBody .wlt-th').count() === 6);

  /* Und der Rückweg: wer auf der Fläche einen Router anklickt,
     nimmt den Reiter mit. Ein zweiter Zustand neben der Auswahl
     wäre die Frage, welcher von beiden recht hat. */
  await waehlen('Router 1');
  ok('⭐ und umgekehrt folgt der Reiter der Auswahl auf der Fläche',
     await page.evaluate(() =>
       document.querySelector('#wltTabs .wlt-tab.is-on').dataset.wlt
       === window.SIM.netz.byName('Router 1').id));

  /* Ein Endgerät lässt den Reiter stehen — sonst stünde das
     Fenster leer da, sobald jemand nebenbei auf einen Rechner
     tippt. */
  await waehlen('Endgerät 1');
  ok('ein Endgerät lässt den Reiter stehen, wo er war',
     await page.evaluate(() =>
       document.querySelector('#wltTabs .wlt-tab.is-on').dataset.wlt
       === window.SIM.netz.byName('Router 1').id));

  await page.screenshot({ path: path.join(OUT, 'shot-weiterleitung.png') });

  /* ─ Zu ─ */
  await page.locator('#wltClose').click();
  await page.waitForTimeout(500);
  ok('das × schließt das Fenster',
     await page.evaluate(() => !document.body.classList.contains('wlt-open')));
  ok('und es nimmt der Fläche danach keinen Platz mehr weg',
     await page.evaluate(() => document.getElementById('wlt').hidden));

  ok('keine Konsolenfehler am Weiterleitungsfenster',
     errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  console.log('\n── Automatisches Routing (RIP) ─────────────────────');
  {
  /* Dieselbe Kette, aber blank: keine Zeile von Hand, nur zwei
     Haken. Das ist die Prüfung, um die es geht. */
  await page.evaluate(() => {
    const S = window.SIM;
    for (const n of S.netz.list().slice()) S.netz.removeNode(n.id);
    const a  = S.netz.addNode('host', 300, 400, 'Endgerät 1');
    const r1 = S.netz.addNode('router', 700, 400, 'Router 1');
    const r2 = S.netz.addNode('router', 1100, 400, 'Router 2');
    const c  = S.netz.addNode('host', 1500, 400, 'Endgerät 2');
    a.nics[0].ip = '192.168.1.10'; a.gateway = '192.168.1.1';
    r1.nics[0].ip = '192.168.1.1'; r1.nics[1].ip = '192.168.2.1';
    r2.nics[0].ip = '192.168.2.2'; r2.nics[1].ip = '192.168.3.1';
    c.nics[0].ip = '192.168.3.10'; c.gateway = '192.168.3.1';
    S.netz.addCable(a.id, 0, r1.id, 0);
    S.netz.addCable(r1.id, 1, r2.id, 0);
    S.netz.addCable(r2.id, 1, c.id, 0);
    S.flaeche.draw();
  });
  await page.waitForTimeout(400);

  const karteAuf = async (name) => {
    await page.evaluate((nm) => {
      const S = window.SIM;
      S.flaeche.select(S.netz.byName(nm).id);
    }, name);
    await page.waitForTimeout(300);
  };

  await karteAuf('Router 1');
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  ok('der Router hat den Haken „Automatisches Routing"',
     await page.locator('#karteBody [data-k="rip"]').count() === 1);
  ok('und er ist AUS — ein Netz routet nicht von selbst',
     !(await page.locator('#karteBody [data-k="rip"]').isChecked()));
  ok('der Satz dazu nennt den Aktionsmodus',
     (await page.locator('#karteBody').textContent()).includes('läuft nur im Aktionsmodus'));

  /* ⚠️ Geschaltet wird über den KNOPF, nicht über das Modell: der
     Weg dazwischen (sync → listen → Takt) ist das, was ausfallen
     kann. Ein Kind kann nur den Haken setzen. */
  await page.locator('#karteBody [data-k="rip"]').click();
  await page.waitForTimeout(300);
  ok('der Haken sitzt', await page.locator('#karteBody [data-k="rip"]').isChecked());
  ok('und steht im Modell',
     await page.evaluate(() => !!window.SIM.netz.byName('Router 1').rip.on));
  ok('im Entwurf steht die Tabelle da, aber nur mit den eigenen Netzen',
     (await page.locator('#karteBody [data-tabellen]').textContent()).includes('RIP —')
     && await page.evaluate(() => window.SIM.stack.ripZeilen(
          window.SIM.netz.byName('Router 1')).every(z => z.hops === 0)));

  await karteAuf('Router 2');
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="rip"]').click();
  await page.waitForTimeout(300);
  await page.locator('#karteClose').click();
  await page.waitForTimeout(200);

  /* ─ Und jetzt die Uhr ─
     ⚠️ Das Gerätefenster wird VOR dem Start der Uhr aufgemacht,
     und das ist keine Bequemlichkeit: das Terminal schreibt mit,
     was passiert, WÄHREND es offen ist — genau wie bei DHCP. Wer
     es erst danach aufmacht, sieht eine Tabelle voller Wege und
     kein Wort darüber, woher sie kommen. Genau so würde eine
     Lehrkraft es auch machen: Router aufmachen, dann zusehen. */
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const S = window.SIM;
    S.geraet.open(S.netz.byName('Router 1').id);
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => { window.SIM.engine.speed = 4; window.SIM.engine.start(); });
  await page.waitForTimeout(2500);

  /* Das Terminal im Routerfenster gibt es seit 2026-09-28 nicht mehr
     (vom Nutzer gestrichen). Was er gelernt hat, steht in der
     kompakten Ansicht in der RIP-Tabelle — die frischt sich beim
     Laufen selbst auf. */
  const fenster = await page.locator('#dtWin').textContent();
  ok('im Gerätefenster steht die RIP-Tabelle', fenster.includes('RIP —'), fenster.slice(0, 120));
  ok('mit dem fernen Netz und seiner Entfernung',
     fenster.includes('192.168.3.0'), 'fehlt');
  await page.evaluate(() => window.SIM.geraet.close());
  await page.waitForTimeout(300);

  const gelernt = await page.evaluate(() => {
    const S = window.SIM;
    return S.stack.ripZeilen(S.netz.byName('Router 1'))
            .filter(z => z.hops > 0).map(z => z.net + '/' + z.hops);
  });
  ok('⭐ R1 hat das ferne Netz gelernt, ohne dass jemand etwas eintrug',
     gelernt.includes('192.168.3.0/1'), gelernt.join(' '));

  const durch = await page.evaluate(() => new Promise((f) => {
    const S = window.SIM;
    S.stack.ping(S.netz.byName('Endgerät 1'), '192.168.3.10', 1, 8000000,
                 (r) => f(!!r && r.ok));
  }));
  ok('⭐ und der Ping kommt an', durch === true, String(durch));
  ok('ohne eine einzige Zeile von Hand',
     await page.evaluate(() => window.SIM.netz.list()
       .filter(n => n.kind === 'router').every(n => n.routes.length === 0)));

  /* ─ Im Mitschnitt ─ Eigener Chip, eigene Farbe, Klartext. */
  const ripZeilen = await page.evaluate(() =>
    window.SIM.mit.view().filter(r => r.proto === 'RIP').length);
  ok('die Ansagen stehen im Mitschnitt', ripZeilen > 0, String(ripZeilen));
  ok('es gibt einen Filterchip RIP',
     await page.locator('.chip[data-proto="RIP"]').count() === 1);

  /* Die Liste muss aufgeschlagen sein — eingeklappt gibt es keine
     Zeilen, und eine Prüfung auf „alle Zeilen sind RIP" wäre bei
     null Zeilen wahr, ohne etwas zu wissen. */
  await mitschnitt(page, true);
  await page.waitForTimeout(400);
  await mitschnitt(page, true);
  await page.locator('.chip[data-proto="RIP"]').click();
  await page.waitForTimeout(400);
  const nurRip = await page.evaluate(() =>
    [...document.querySelectorAll('#traceBody .tr-p')].map(e => e.textContent));
  ok('und er zeigt nur RIP', nurRip.length > 0 && nurRip.every(t => t === 'RIP'),
     nurRip.length + ' Zeilen: ' + nurRip.slice(0, 5).join(' '));
  ok('die Zeile ist in Klartext zu lesen',
     (await page.locator('#traceBody').textContent()).includes('RIP-Ansage — ich kenne'),
     (await page.locator('#traceBody').textContent()).slice(0, 140));
  /* Die Farbe kommt aus --rip und nicht aus der Vorgabe. Geprüft
     gegen die Variable und nicht gegen einen Zahlenwert — der wäre
     beim nächsten Themenwechsel falsch. */
  const ripFarbe = await page.evaluate(() => {
    const e = document.querySelector('#traceBody .tr-p--rip');
    if (!e) return null;
    const soll = getComputedStyle(document.documentElement).getPropertyValue('--rip').trim();
    const ist = getComputedStyle(e).color;
    const d = document.createElement('div');
    d.style.color = soll; document.body.appendChild(d);
    const sollRgb = getComputedStyle(d).color; d.remove();
    return { ist, sollRgb };
  });
  ok('sie trägt die Farbe von --rip',
     ripFarbe && ripFarbe.ist === ripFarbe.sollRgb, JSON.stringify(ripFarbe));
  await mitschnitt(page, true);
  await page.locator('.chip[data-proto="RIP"]').click();
  await page.waitForTimeout(250);
  await mitschnitt(page, false);
  await page.waitForTimeout(250);

  await page.evaluate(() => window.SIM.engine.stop());
  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);

  /* ─ Der Heimrouter hat den Haken nicht ─ Wie in Filius. */
  await page.evaluate(() => {
    const S = window.SIM;
    const hr = S.netz.addNode('heimrouter', 700, 900, 'Heimrouter 1');
    hr.nics[S.netz.LAN].ip = '192.168.178.1';
    S.flaeche.draw();
  });
  await karteAuf('Heimrouter 1');
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  ok('der Heimrouter hat keinen RIP-Haken — wie in Filius',
     await page.locator('#karteBody [data-k="rip"]').count() === 0);
  /* ⚠️ Rücknahme vom 2026-09-28: bis dahin stand hier „eine
     Weiterleitungstabelle hat er trotzdem". Vom Nutzer gestrichen —
     „Weiterleitungstabellen braucht er nicht". Das Gerät leitet
     weiter wie zuvor (`KIND.heimrouter.routes` ist weiter `true`,
     `schichten.js` entscheidet daran); es gibt nur kein Formular
     mehr dafür. Ein Heimrouter hat genau zwei Seiten und schickt
     alles Fremde nach draußen — eine Zeile einzutragen, gäbe es
     hier nichts zu entscheiden. */
  ok('⭐ und auch keine Weiterleitungstabelle mehr',
     !(await page.locator('#karteBody').textContent()).includes('Weiterleitungstabelle'));
  ok('er leitet aber weiter weiter',
     await page.evaluate(() => window.SIM.netz.KIND.heimrouter.routes === true));
  await page.locator('#karteClose').click();
  await page.waitForTimeout(200);

  ok('keine Konsolenfehler nach dem automatischen Routing',
     errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  console.log('\n── Portfreigaben ───────────────────────────────────');
  {
  await page.evaluate(() => {
    const S = window.SIM;
    for (const n of S.netz.list().slice()) S.netz.removeNode(n.id);
    const hr = S.netz.addNode('heimrouter', 700, 500, 'Heimrouter 1');
    S.netz.setDhcp(hr, 0, false);
    hr.nics[S.netz.WAN].ip = '84.12.5.9'; hr.nics[S.netz.WAN].mask = '255.255.255.0';
    hr.nics[S.netz.LAN].ip = '192.168.1.1'; hr.nics[S.netz.LAN].mask = '255.255.255.0';
    const d = S.netz.addNode('server', 1200, 300, 'Server 1');
    d.nics[0].ip = '84.12.5.1'; d.nics[0].mask = '255.255.255.0';
    d.gateway = '84.12.5.9';
    const i = S.netz.addNode('server', 300, 800, 'Server 2');
    i.nics[0].ip = '192.168.1.20'; i.nics[0].mask = '255.255.255.0';
    i.gateway = '192.168.1.1';
    S.netz.addCable(hr.id, 0, d.id, 0);
    S.netz.addCable(i.id, 0, hr.id, 2);
    S.flaeche.draw();
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.byName('Heimrouter 1').id);
  });
  await page.waitForTimeout(300);
  // Wie oben: „Mehr ›" ist ein Umschalter, also erst nachsehen.
  if ((await page.locator('#karteMehr').textContent()).includes('Mehr')) {
    await page.locator('#karteMehr').click();
    await page.waitForTimeout(300);
  }
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(300);

  const koerper = await page.locator('#karteBody').textContent();
  ok('unter dem NAT-Satz stehen die Portfreigaben',
     koerper.includes('Portfreigaben'), koerper.slice(0, 80));
  /* ⭐ Die Reihenfolge ist die Aussage: erst „von außen kann
     niemand anfangen", dann die einzige Ausnahme davon. */
  ok('⭐ und zwar NACH dem Satz, dessen Ausnahme sie sind',
     koerper.indexOf('von außen niemand') < koerper.indexOf('Portfreigaben'),
     koerper.indexOf('von außen niemand') + ' / ' + koerper.indexOf('Portfreigaben'));
  ok('mit dem Knopf „Neuer Eintrag" (Wortlaut aus Filius)',
     await page.locator('#karteBody [data-k="freineu"]').count() === 1);
  ok('und noch keiner Zeile',
     await page.locator('#karteBody .k-frei').count() === 0);
  ok('stattdessen steht da: keine Freigabe',
     koerper.includes('keine Freigabe'));

  await page.locator('#karteBody [data-k="freineu"]').click();
  await page.waitForTimeout(300);
  ok('„Neuer Eintrag" legt eine Zeile an',
     await page.locator('#karteBody .k-frei').count() === 1);
  ok('mit einer Auswahlliste für das Protokoll',
     await page.locator('#karteBody [data-f="freiproto"] option').count() === 2);
  ok('TCP und UDP, sonst nichts',
     (await page.locator('#karteBody [data-f="freiproto"] option').allTextContents())
       .join('|') === 'TCP|UDP');
  ok('die drei Zahlenfelder kommen leer',
     await page.evaluate(() => ['freiport', 'freiip', 'freilanport']
       .every(f => document.querySelector('#karteBody [data-f="' + f + '"]').value === '')));
  ok('der Schreibstrich steht im Portfeld',
     await page.evaluate(() => document.activeElement
       && document.activeElement.dataset.f === 'freiport'));

  /* Messung, wie oben: vier Felder in einer Reihe im schmalen
     Kärtchen. Umbrechen DARF sie (das ist im CSS so gewollt), aber
     sie darf nicht über den Kasten hinausragen und keine Adresse
     abschneiden. */
  const fm = await page.evaluate(() => {
    const reihe = document.querySelector('#karteBody .k-frei');
    const ip = reihe.querySelector('[data-f="freiip"]');
    return {
      reihe: Math.round(reihe.getBoundingClientRect().width),
      kasten: document.querySelector('#karteBody').clientWidth,
      ip: Math.round(ip.getBoundingClientRect().width)
    };
  });
  ok('die Freigabe-Zeile passt in das Kärtchen', fm.reihe <= fm.kasten + 1,
     fm.reihe + ' in ' + fm.kasten);
  ok('und das Adressfeld ist breit genug (≥ 100 px)', fm.ip >= 100, String(fm.ip));

  /* ⭐ Der blasse Vorschlag im LAN-Port ist die FREIGEGEBENE Nummer
     und keine feste 80 — er sagt damit, was passiert, wenn man das
     Feld leer lässt. Und er geht beim Tippen mit: ein Platzhalter,
     der die Zahl von vorhin nennt, ist schlimmer als gar keiner.
     Das Bild hat es gezeigt — bei einer Freigabe auf 25565 stand
     dort blass eine 80. */
  await page.locator('#karteBody [data-f="freiport"]').fill('25565');
  await page.waitForTimeout(250);
  ok('⭐ der Vorschlag im LAN-Port folgt dem freigegebenen Port',
     await page.evaluate(() =>
       document.querySelector('#karteBody [data-f="freilanport"]').placeholder) === '25565',
     await page.evaluate(() =>
       document.querySelector('#karteBody [data-f="freilanport"]').placeholder));

  await page.locator('#karteBody [data-f="freiport"]').fill('80');
  await page.locator('#karteBody [data-f="freiip"]').fill('192.168.1.20');
  await page.waitForTimeout(300);
  ok('die Angaben stehen im Modell',
     await page.evaluate(() => {
       const f = window.SIM.netz.byName('Heimrouter 1').nat.frei[0];
       return f && f.proto === 'tcp' && f.port === '80' && f.lanIp === '192.168.1.20';
     }));
  /* ⭐ Der leere LAN-Port heißt „derselbe" — und weil das
     unsichtbar wäre, steht das Ergebnis in der NAT-Tabelle. */
  const tabelle = await page.locator('#karteBody [data-tabellen]').textContent();
  ok('⭐ die Freigabe steht in der NAT-Tabelle, ohne dass ein Paket lief',
     tabelle.includes('Freigabe'), tabelle.slice(0, 200));
  ok('mit der Nummer, die aus dem leeren LAN-Port folgt',
     tabelle.includes('192.168.1.20:80'), tabelle.slice(0, 200));
  ok('und mit der WAN-Adresse außen', tabelle.includes('84.12.5.9:80'), tabelle.slice(0, 200));

  /* ─ Und jetzt der Ernstfall: von draußen ins Haus ─ */
  await page.locator('#karteClose').click();
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.SIM.engine.speed = 4; window.SIM.engine.start(); });
  const rein = await page.evaluate(() => new Promise((f) => {
    const S = window.SIM;
    S.stack.tcpHoeren(S.netz.byName('Server 2'), 80, (c) => {
      c.onDaten((t) => { c.senden('ANTWORT:' + t); });
    }, 'Prüfserver');
    let fertig = false;
    S.stack.tcpVerbinde(S.netz.byName('Server 1'), '84.12.5.9', 80, 'Prüfclient',
      (err, c) => {
        if (err) { if (!fertig) { fertig = true; f({ ok: false, err: String(err) }); } return; }
        c.onDaten((t) => { if (!fertig) { fertig = true; f({ ok: true, text: t, fern: c.fernIp }); } });
        c.senden('KLOPF');
      });
    setTimeout(() => { if (!fertig) { fertig = true; f({ ok: false, err: 'Zeit abgelaufen' }); } }, 8000);
  }));
  ok('⭐ von draußen kommt eine Verbindung ins Haus zustande',
     rein && rein.ok === true, JSON.stringify(rein));
  ok('die Antwort kommt vom Server im Haus',
     rein && rein.text === 'ANTWORT:KLOPF', rein && rein.text);
  /* Der Client draußen hat 84.12.5.9 angesprochen und weiß nichts
     von 192.168.1.20. Das IST die Portfreigabe. */
  ok('der Client draußen kennt nur die WAN-Adresse',
     rein && rein.fern === '84.12.5.9', rein && rein.fern);
  await page.evaluate(() => window.SIM.engine.stop());
  await page.locator('[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);

  /* ─ Löschen ─ */
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.byName('Heimrouter 1').id);
  });
  await page.waitForTimeout(300);
  if ((await page.locator('#karteMehr').textContent()).includes('Mehr')) {
    await page.locator('#karteMehr').click();
    await page.waitForTimeout(300);
  }
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  await page.locator('#karteBody [data-k="freidel"]').click();
  await page.waitForTimeout(300);
  ok('das × entfernt die Freigabe',
     await page.evaluate(() => window.SIM.netz.byName('Heimrouter 1').nat.frei.length) === 0);
  await page.locator('#karteClose').click();
  await page.waitForTimeout(200);

  /* ─── Und beides im GERÄTEFENSTER ────────────────────────────
     ⚠️ Das ist der engere von beiden Orten, und genau hier sind
     `netstat` und `route` schon einmal umgebrochen (siehe
     UEBERGABE.md): Router, Switch und Heimrouter haben keinen
     Bildschirm, ihre Einstellungen stehen im Gerätefenster, und
     das ist schmaler als das Kärtchen. Gemessen statt geschätzt. */
  {
    await page.evaluate(() => {
      const S = window.SIM;
      for (const n of S.netz.list().slice()) S.netz.removeNode(n.id);
      const r = S.netz.addNode('router', 700, 400, 'Router 1');
      r.nics[0].ip = '192.168.1.1'; r.nics[1].ip = '192.168.2.1';
      r.routes.push({ net: '192.168.3.0', mask: '255.255.255.0', gateway: '192.168.2.2' });
      const hr = S.netz.addNode('heimrouter', 1100, 400, 'Heimrouter 1');
      hr.nics[S.netz.LAN].ip = '192.168.178.1';
      S.netz.natConf(hr).frei.push({ proto: 'tcp', port: 80, lanIp: '192.168.178.20', lanPort: 80 });
      S.flaeche.draw();
    });
    await page.waitForTimeout(400);
    await page.locator('[data-modus="aktion"]').click();
    await page.waitForTimeout(400);

    /* ⭐ Seit 2026-09-28 steht im Gerätefenster kein Formular mehr,
       sondern die kompakte Leseansicht — Weiterleitungszeilen und
       Freigaben als Text. Geprüft wird, dass sie dastehen und nichts
       über den Rand ragt. */
    const imFenster = async (name) => {
      await page.evaluate((nm) => window.SIM.geraet.open(window.SIM.netz.byName(nm).id), name);
      await page.waitForTimeout(400);
      return page.evaluate(() => {
        const win = document.querySelector('#dtWin');
        return {
          text: win.textContent,
          felder: win.querySelectorAll('input,select').length,
          ueberlauf: win.scrollWidth > win.clientWidth + 1
        };
      });
    };

    const rm = await imFenster('Router 1');
    ok('die Weiterleitungszeile steht im Gerätefenster, als Text',
       rm.text.includes('192.168.3.0') && rm.text.includes('192.168.2.2') && rm.felder === 0,
       rm.text.slice(0, 160));
    ok('und nichts ragt über das Fenster hinaus', !rm.ueberlauf);

    const hm = await imFenster('Heimrouter 1');
    ok('die Freigabe steht im Gerätefenster, als Text',
       hm.text.includes('TCP 80 → 192.168.178.20:80') && hm.felder === 0, hm.text.slice(0, 200));
    ok('auch dort ragt nichts hinaus', !hm.ueberlauf);

    await page.evaluate(() => window.SIM.geraet.close());
    await page.locator('[data-modus="entwurf"]').click();
    await page.waitForTimeout(300);
  }

  ok('keine Konsolenfehler nach den Portfreigaben',
     errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  /* ═══ Die Runde vom 2026-09-28 ═══════════════════════════════
     Aufgabe verschiebbar und minimierbar, Mitschnitt als Knopf,
     kleines und großes Kärtchen getrennt, weniger Text. */
  console.log('\n── Aufgabe, Mitschnitt, weniger Text ───────────────');
  {
  await page.evaluate(() => window.SIM.setModus('entwurf'));
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(800);

  // ─ Die Aufgabe ─
  ok('die Aufgabe ist offen, ohne ×',
     await page.locator('#aufgabe').isVisible()
     && await page.locator('#aufgabe .auf-x, #aufgabeClose').count() === 0);
  ok('die gelbe Kachel ist noch nicht da', await page.locator('#aufgabeKachel').isHidden());
  const vor = await page.locator('#aufgabe').boundingBox();
  const kopf = await page.locator('#aufgabeHead').boundingBox();
  await page.mouse.move(kopf.x + 60, kopf.y + kopf.height / 2);
  await page.mouse.down();
  await page.mouse.move(kopf.x + 260, kopf.y + 140, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const nach = await page.locator('#aufgabe').boundingBox();
  ok('⭐ die Aufgabe lässt sich am Kopf verschieben',
     Math.abs(nach.x - vor.x - 200) < 6 && nach.y - vor.y > 60,
     JSON.stringify({ vor, nach }));
  await page.locator('#aufgabeMin').click();
  await page.waitForTimeout(200);
  ok('⭐ minimieren: die Aufgabe geht zu, die gelbe Kachel erscheint',
     await page.locator('#aufgabe').isHidden() && await page.locator('#aufgabeKachel').isVisible());
  ok('die Kachel steht links neben dem Szenario-Menü',
     await page.evaluate(() => {
       const k = document.querySelector('#aufgabeKachel').getBoundingClientRect();
       const m = document.querySelector('#szenario').getBoundingClientRect();
       return k.right <= m.left + 1 && Math.abs((k.top + k.bottom) / 2 - (m.top + m.bottom) / 2) < 12;
     }));
  await page.locator('#aufgabeKachel').click();
  await page.waitForTimeout(200);
  const wieder = await page.locator('#aufgabe').boundingBox();
  ok('ein Tipp auf die Kachel holt sie zurück, an ihren Platz',
     await page.locator('#aufgabeKachel').isHidden()
     && Math.abs(wieder.x - nach.x) < 2 && Math.abs(wieder.y - nach.y) < 2);

  // ─ Kleines Kärtchen am Router ─
  await page.evaluate(() => window.SIM.flaeche.select(window.SIM.netz.byName('Router 1').id));
  await page.waitForTimeout(300);
  await gross(page, false);
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  ok('⭐ klein: am Router keine Weiterleitungstabelle',
     !(await page.locator('#karteBody').textContent()).includes('Weiterleitungstabelle'));
  ok('und kein Erklärsatz', await page.locator('#karteBody .k-hint:not(.dim)').count() === 0,
     await page.locator('#karteBody .k-hint:not(.dim)').allTextContents().then(a => a.join(' | ')));
  await gross(page, true);
  await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
  await page.waitForTimeout(250);
  ok('groß steht sie da, mit einem „i"',
     (await page.locator('#karteBody').textContent()).includes('Weiterleitungstabelle')
     && await page.locator('#karteBody .k-i[data-info="wege"]').count() === 1);
  await gross(page, false);
  await page.locator('#karteClose').click();

  // ─ Texte, die weg sind ─
  ok('⭐ in der Seitenleiste steht kein Satz über Ziehen und Mausrad',
     await page.locator('.rail-zhint').count() === 0);

  // ─ Der Mitschnitt ─
  ok('⭐ im Entwurf gibt es keinen Mitschnitt-Knopf und keine Leiste',
     await page.locator('#traceBtn').isHidden() && await page.locator('.trace').isHidden());
  await page.locator('.mbtn[data-modus="aktion"]').click();
  await page.waitForTimeout(300);
  ok('in der Aktion steht der Knopf neben „Subnetze"',
     await page.locator('#traceBtn').isVisible()
     && await page.evaluate(() =>
       document.querySelector('#subBtn').nextElementSibling === document.querySelector('#traceBtn')));
  await mitschnitt(page, false);
  ok('die Leiste unten nur, wenn er an ist', await page.locator('.trace').isHidden());
  await mitschnitt(page, true);
  ok('an: die Leiste ist da', await page.locator('.trace').isVisible());
  // Filter von vorher lösen: alle Protokolle, kein Suchwort, kein Gerät.
  await page.locator('[data-proto=""]').click();
  await page.locator('#traceFilter').fill('');
  if (await page.locator('#traceGeraet').isVisible()) await page.locator('#traceGeraet').click();

  // Viele Rahmen, dann hochrollen, dann kommen neue: nichts springt.
  // Ins eigene Netz gepingt (an den Router) — ein Gateway hat
  // Endgerät 1 in diesem Szenario noch nicht.
  const pingen = () => page.evaluate(() => {
    const S = window.SIM;
    S.engine.speed = 4;
    S.term.submit(S.netz.byName('Endgerät 1').id,
      'ping ' + S.netz.byName('Router 1').nics[0].ip);
  });
  for (let i = 0; i < 3; i++) { await pingen(); await page.waitForTimeout(1500); }
  await page.evaluate(() => { const b = document.querySelector('#traceBody'); b.scrollTop = 0; });
  const ersteVor = await page.evaluate(() => {
    const b = document.querySelector('#traceBody');
    const d = b.querySelector('[data-n]');
    return { top: b.scrollTop, n: d && d.dataset.n, text: d ? '' : b.textContent.slice(0, 80) };
  });
  await pingen();
  await page.waitForTimeout(1500);
  const ersteNach = await page.evaluate(() => {
    const b = document.querySelector('#traceBody');
    const r = b.getBoundingClientRect();
    const d = [...b.querySelectorAll('[data-n]')].find(x => x.getBoundingClientRect().bottom > r.top + 1);
    return { top: b.scrollTop, n: d && d.dataset.n, mehr: b.scrollHeight > b.clientHeight };
  });
  ok('⭐ wer hochgerollt hat, bleibt stehen, wenn neue Rahmen kommen',
     ersteNach.mehr && ersteNach.n === ersteVor.n && ersteNach.top < 5,
     JSON.stringify({ ersteVor, ersteNach }));

  // Schichtenansicht: farbig hinterlegt.
  await page.locator('#traceModus').click();
  await page.waitForTimeout(250);
  ok('⭐ in der Schichtenansicht ist jede Zeile in ihrer Schichtfarbe hinterlegt',
     await page.evaluate(() => {
       const z = document.querySelector('.trs.l--vermittlung');
       return !!z && getComputedStyle(z).backgroundColor !== 'rgba(0, 0, 0, 0)';
     }));
  await page.locator('#traceModus').click();
  await mitschnitt(page, false);

  // ─ Software-Installation: nur Name und Bild ─
  await page.evaluate(() => window.SIM.geraet.open(window.SIM.netz.byName('Endgerät 1').id));
  await page.waitForTimeout(300);
  await programmAuf(page, 'software');
  await page.waitForTimeout(250);
  ok('⭐ Software-Installation: keine Beschreibung unter den Kacheln, kein Hinweis darunter',
     await page.locator('#dtWin .sw-k:not(.is-frage) .sw-k-h').count() === 0
     && await page.locator('#dtWin .k-hint').count() === 0);
  await page.evaluate(() => { window.SIM.geraet.close(); window.SIM.setModus('entwurf'); });
  await page.waitForTimeout(300);
  ok('keine Konsolenfehler in dieser Runde', errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  console.log('\n── Bilder ──────────────────────────────────────────');
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(900);
  // Das erste Bild zeigt den Entwurf mit offenem Kärtchen am
  // Router — das ist die Stelle, an der sich dieser Simulator von
  // Filius am deutlichsten unterscheidet.
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.byName('Router 1').id);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'shot-hell.png') });

  /* Ein Bild für die Mehrfachauswahl: drei Kärtchen nebeneinander,
     jedes in der Farbe seines Netzes. Das ist die Aussage, um
     derentwillen es die mehreren Kärtchen gibt — drei Adressen und
     drei Netzmasken untereinander statt dreimal hintereinander
     aufmachen und im Kopf behalten. */
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(null); S.panels.closeKarte();
    for (const name of ['Endgerät 1', 'Endgerät 2', 'Endgerät 3']) {
      const n = S.netz.byName(name);
      S.flaeche.umschalten(n.id, true);
      S.panels.dazuNode(n.id);
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'shot-karten.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, 'shot-karten-dunkel.png') });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    window.SIM.panels.closeKarte(); window.SIM.flaeche.select(null);
  });

  // Und ein drittes: DHCP im Lauf, mit Mitschnitt.
  await szenarioWaehlen(page, 'automatisch');
  await page.waitForTimeout(600);
  await page.locator('[data-modus="aktion"]').click();
  await page.locator('#speed').fill('3');
  await page.waitForTimeout(2500);
  await mitschnitt(page, true);
  await page.waitForTimeout(400);
  await mitschnitt(page, true);
  await page.locator('[data-proto="DHCP"]').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const S = window.SIM;
    S.flaeche.select(S.netz.list().find(n => n.kind === 'host').id);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'shot-dhcp.png') });
  await mitschnitt(page, true);
  await page.locator('[data-proto=""]').click();
  await mitschnitt(page, false);
  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(700);
  // .mbtn davor, weil auch <body> ein data-modus trägt.
  await page.locator('.mbtn[data-modus="entwurf"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  // Das zweite Bild zeigt den Aktionsmodus: Gerätefenster offen,
  // Terminal darin, Ping unterwegs.
  await page.locator('[data-modus="aktion"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const S = window.SIM;
    S.netz.byName('Endgerät 1').gateway = '192.168.1.1';
    S.netz.byName('Server 1').gateway = '192.168.2.1';
    S.flaeche.draw();
    S.geraet.open(S.netz.byName('Endgerät 1').id);
  });
  await programmAuf(page, 'terminal');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const S = window.SIM;
    S.term.submit(S.netz.byName('Endgerät 1').id, 'ping 192.168.2.20');
  });
  await page.locator('#speed').fill('4');
  await page.waitForTimeout(2600);
  await mitschnitt(page, true);
  await page.waitForTimeout(500);
  await page.locator('.tr').filter({ hasText: 'Ping-Anfrage' }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'shot-dunkel.png') });

  /* Und ein fünftes: die Schichtenansicht — Filius'
     Datenaustausch-Fenster. Das Bild soll genau die eine Aussage
     zeigen, für die es diese Ansicht gibt: dieselbe Spalte
     „Quelle" trägt untereinander eine MAC-Adresse, eine
     IP-Adresse und (bei TCP) eine Portnummer.

     Mit offenem Gerätefenster, denn dann ist auch das zu sehen,
     was in Filius der Rechtsklick auf ein Gerät macht: das Chip
     „nur Endgerät 1" in der Leiste und die Richtungspfeile ↑↓. */
  await page.locator('#traceModus').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'shot-schichten.png') });
  await page.locator('#traceModus').click();
  await page.waitForTimeout(250);

  console.log('  Bilder: shot-hell.png, shot-karten.png, shot-karten-dunkel.png, '
            + 'shot-dhcp.png, shot-dunkel.png, shot-schichten.png, shot-dateien.png');

  console.log('\n── Szenario-Menü, Auftrag, Raum-Türen ──────────────');
  /* Ohne Raum: nur die mitgelieferten, keine Reiter, keine
     Teilen-Schalter, kein Knopf „Aufgabentext". */
  await page.keyboard.press('Escape');
  await mk(page, '#szenarioBtn');
  ok('Menü zeigt alle 17 mitgelieferten Szenarien',
     await page.locator('#szenarioPop .szm-item').count() === 17);
  ok('Sek I, Sek II und Andere stehen als Überschriften in einer Liste',
     await page.locator('#szenarioPop .szm-head').count() === 3);
  ok('ohne Raum: keine Reiter', await page.locator('#szenarioPop .szm-tabs').count() === 0);
  ok('ohne Raum: keine Teilen-Schalter', await page.locator('#szenarioPop .szm-share').count() === 0);
  await page.keyboard.press('Escape');
  ok('Menü geht mit Esc zu', await page.locator('#szenarioPop').isHidden());
  ok('ohne Raum: kein Knopf „Aufgabentext"', await page.locator('#aufgabeBtn').isHidden());
  ok('ohne Raum: kein Hinweis auf leerer Fläche', await page.locator('#leerHinweis').isHidden());
  ok('ohne Raum: kein Schleier', await page.locator('.blind-schleier').count() === 0);

  await szenarioWaehlen(page, 'router');
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => window.SIM.standJson());
  ok('Stand kennt sein Szenario', st.szenario === 'builtin:router');
  ok('Stand trägt den Auftrag (Titel + Text)', !!st.titel && /<p>/.test(st.aufgabe || ''));

  /* Der Auftrag überlebt das Neuladen — vorher war er danach weg. */
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(700);
  ok('Auftrag nach dem Neuladen wieder da', await page.locator('#aufgabe').isVisible());
  ok('… mit seinem Titel', (await page.locator('#aufgabeTitel').textContent()) === st.titel);

  /* Der Türsteher für Aufgabentexte. */
  const rein = await page.evaluate(() => window.Aufgabe.reinigen(
    '<p class="dim fs-l x" onclick="alert(1)">a<b>b</b><i>c</i><script>alert(2)</script></p>'
    + '<ul><li class="fs-s">d</li></ul><div>e</div><img src=x onerror=alert(3)><a href="javascript:1">f</a>'));
  ok('reinigen: fett/kursiv werden strong/em', /<strong>b<\/strong><em>c<\/em>/.test(rein), rein);
  ok('reinigen: script, img, Ereignisse und Links sind weg',
     !/script|img|onclick|onerror|href|alert\(2/.test(rein), rein);
  ok('reinigen: erlaubte Klassen bleiben, fremde gehen', /class="dim fs-l"/.test(rein) && !/ x"/.test(rein), rein);
  ok('reinigen: Liste und div→p', /<ul><li class="fs-s">d<\/li><\/ul><p>e<\/p>/.test(rein), rein);
  ok('reinigen: Text von Links bleibt', /f$/.test(rein), rein);

  /* Der Editor (im Raum nur für die Lehrkraft sichtbar — die
     Funktion dahinter ist dieselbe). */
  await page.evaluate(() => document.getElementById('aufgabeBtn').click());
  await page.waitForTimeout(200);
  ok('Editor geht auf', await page.locator('.sy-dlg .aed-feld').isVisible());
  ok('Editor bringt den laufenden Auftrag mit',
     (await page.locator('.sy-dlg [data-titel]').inputValue()) === st.titel);
  await page.locator('.sy-dlg [data-titel]').fill('Mein Auftrag');
  await page.evaluate(() => {
    const f = document.querySelector('.sy-dlg .aed-feld');
    f.innerHTML = '<p>Erstens</p>';
    const r = document.createRange(); r.selectNodeContents(f.firstChild);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.locator('.aed-b[data-cmd="bold"]').click();
  await page.locator('.aed-b[data-cmd="groesse"]').click();
  ok('Größenknopf zeigt die Stufe', (await page.locator('.aed-gr [data-stufe]').textContent()) === 'groß');
  await page.locator('.sy-dlg [data-ok]').click();
  await page.waitForTimeout(200);
  const auf = await page.evaluate(() => window.SIM.aktuell.aufgabe);
  ok('Übernehmen: fett + groß im Auftrag', /<p class="fs-l"><strong>Erstens<\/strong><\/p>/.test(auf), auf);
  ok('Übernehmen: Titel auf der Karte', (await page.locator('#aufgabeTitel').textContent()) === 'Mein Auftrag');
  ok('Übernehmen: groß ist auf der Karte größer',
     await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#aufgabeText .fs-l')).fontSize) > 15));

  /* Ohne Raum fragt „Speichern" nicht, sondern lädt die Datei. */
  const dl = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await mk(page, '#exportBtn');
  const d = await dl;
  ok('Speichern ohne Raum: Datei, keine Frage', !!d && (await page.locator('.sy-dlg').count()) === 0);
  if (d) {

    const pfad = await d.path();
    const j = pfad ? JSON.parse(fs.readFileSync(pfad, 'utf8')) : {};
    ok('Datei trägt den Auftrag', j.titel === 'Mein Auftrag' && /Erstens/.test(j.aufgabe || ''));
    ok('Dateiname nach dem Auftrag', d.suggestedFilename() === 'Mein-Auftrag.json', d.suggestedFilename());
  }

  /* ═══ Class Wide Web ═══════════════════════════════════════ */
  console.log('\n── Class Wide Web ──');
  {
    const modusBtn = page.locator('.mbtn[data-modus="entwurf"]');
    if (await modusBtn.isVisible()) await modusBtn.click();
    await page.evaluate(() => {
      const S = window.SIM;
      S.netz.fromJSON({ v: 2, nodes: [], cables: [] });
      S.neuZeichnen();
    });
    await page.waitForTimeout(250);
    ok('der Knopf „cww" steht in der Leiste', await page.locator('[data-add="cww"]').isVisible());
    await geraetZiehen(page, 'cww');
    ok('ein cww liegt auf der Fläche',
       await page.evaluate(() => window.SIM.netz.list().filter(n => n.kind === 'cww').length === 1));
    ok('danach ist der Knopf grau',
       await page.evaluate(() => document.querySelector('[data-add="cww"]').classList.contains('is-aus')));
    await geraetZiehen(page, 'cww');
    ok('⭐ ein zweites cww gibt es nicht',
       await page.evaluate(() => window.SIM.netz.list().filter(n => n.kind === 'cww').length === 1));
    ok('und die Kurzmeldung sagt, warum',
       (await page.locator('#toast').textContent()).includes('schon ein Class Wide Web'),
       await page.locator('#toast').textContent());
    ok('auf der Fläche steht „cww" in der Wolke',
       await page.evaluate(() => [...document.querySelectorAll('.nf .nf-cww')].some(t => t.textContent === 'cww')));

    /* Ein kleines Netz: Rechner und Server am cww, der Server mit
       DNS — einmal mit öffentlicher, einmal mit privater Adresse. */
    await page.evaluate(() => {
      const S = window.SIM;
      const c = S.netz.cwwVon();
      c.x = 600; c.y = 240;
      const sw = S.netz.addNode('switch', 600, 420);
      const e = S.netz.addNode('host', 420, 600);
      const sv = S.netz.addNode('server', 780, 600);
      c.nics[1].ip = '50.0.1.1';
      e.nics[0].ip = '50.0.1.10'; e.gateway = '50.0.1.1'; e.dns = '8.8.8.8';
      sv.nics[0].ip = '50.0.1.20'; sv.gateway = '50.0.1.1'; sv.dns = '8.8.8.8';
      sv.software = ['dns'];
      const d = S.netz.dnsConf(sv); d.on = true;
      d.records = [{ name: 'www.anna.de', ip: '50.0.1.20' }, { name: 'drucker.anna.de', ip: '192.168.1.9' }];
      S.netz.addCable(c.id, 1, sw.id, 0);
      S.netz.addCable(e.id, 0, sw.id, 1);
      S.netz.addCable(sv.id, 0, sw.id, 2);
      S.neuZeichnen();
      S.flaeche.select(c.id);
    });
    await page.waitForTimeout(350);
    await gross(page, true);
    {
      const reiter = (await page.locator('.k-reiter-b').allTextContents()).join('|');
      ok('⭐ das cww hat drei Reiter: Internet, Netzwerkkarten, Allgemein',
         reiter === 'Internet|Netzwerkkarten|Allgemein', reiter);
      ok('aufgeschlagen ist „Internet"',
         (await page.locator('.k-reiter-b.is-on').textContent()) === 'Internet');
      const t = await page.locator('#karteBody').textContent();
      ok('⭐ „Internet" nennt die Adresse in der Wolke und die Netzmaske',
         t.includes('Deine Adresse in der Wolke') && t.includes('8.0.0.50') && t.includes('255.0.0.0'), t.slice(0, 160));
      ok('der Adressbereich steht dort NICHT (er gehört zu den Netzwerkkarten)', !t.includes('Dein Adressbereich'));
      ok('ohne Raum: „Kein Raum – keine anderen Bereiche"', t.includes('Kein Raum'));
      ok('die DNS-Liste steht nicht mehr im Reiter „Internet"',
         await page.locator('#karteBody .k-dns-z').count() === 0);
      ok('die Internet-Karte hat kein Eingabefeld',
         await page.locator('#karteBody input[data-nic="0"]').count() === 0);
    }
    await page.locator('#karte').screenshot({ path: path.join(OUT, 'shot-cww-internet.png') });

    /* Die Bereiche der anderen: nur im Raum, und nur die Zahlen. */
    await page.evaluate(() => { const S = window.SIM; S.internet.setModus('raum'); S.internet.rein({ bereiche: [14, 13, 50, 8, 300, 13] }); });
    await page.locator('.k-reiter-b', { hasText: 'Netzwerkkarten' }).click();
    await page.locator('.k-reiter-b', { hasText: 'Internet' }).click();
    await page.waitForTimeout(250);
    {
      ok('⭐ im Raum stehen die Bereiche der anderen, sortiert und ohne den eigenen',
         (await page.locator('#karteBody .k-bereich').allTextContents()).join('|') === '13.0.0.0 /8|14.0.0.0 /8',
         (await page.locator('#karteBody .k-bereich').allTextContents()).join('|'));
    }

    await page.locator('.k-reiter-b', { hasText: 'Netzwerkkarten' }).click();
    await page.waitForTimeout(250);
    {
      const t = await page.locator('#karteBody').textContent();
      ok('⭐ „Netzwerkkarten": oben der eigene Bereich, groß',
         t.includes('Dein Adressbereich') && await page.locator('#karteBody .k-cww-bereich').textContent() === '50.0.0.0 /8');
      ok('darunter nur die Karte nach innen',
         await page.locator('#karteBody input[data-f="ip"]').count() === 1);
      ok('und der Bereich steht vor der Karte',
         await page.evaluate(() => {
           const b = document.querySelector('#karteBody .k-cww-bereich');
           const i = document.querySelector('#karteBody input[data-f="ip"]');
           return !!(b && i && (b.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING));
         }));
    }

    await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
    await page.waitForTimeout(250);
    {
      const t = await page.locator('#karteBody').textContent();
      ok('„Allgemein" ohne Gateway-Feld, mit DHCP-Server, DNS und Routing',
         await page.locator('#karteBody input[data-f="gateway"]').count() === 0
         && t.includes('Automatisches Routing') && t.includes('DHCP-Server')
         && t.includes('DNS-Liste öffnen'), t.slice(0, 200));
      ok('⭐ die Reihenfolge: DHCP, DNS, Routing',
         t.indexOf('DHCP-Server') < t.indexOf('DNS') && t.indexOf('DNS-Liste') < t.indexOf('Automatisches Routing'));
      ok('⭐ die Weiterleitungstabelle führt die Bereiche der anderen schon, vom CWW',
         await page.evaluate(() => {
           const z = [...document.querySelectorAll('#karteBody .tbl-cww tr')].map(r => r.textContent);
           return z.some(x => x.includes('13.0.0.0') && x.includes('255.0.0.0') && x.includes('Internet'))
               && z.some(x => x.includes('14.0.0.0'));
         }) && t.includes('vom CWW'));
    }
    ok('⭐ „Allgemein" nennt die DNS-Adresse 8.8.8.8, gesperrt',
       await page.evaluate(() => { const i = document.querySelector('#karteBody input[data-f="dnsfest"]');
         return !!i && i.value === '8.8.8.8' && i.disabled; }));
    await gross(page, false);
    ok('⭐ auch im kleinen Kärtchen steht 8.8.8.8, gesperrt',
       await page.evaluate(() => { const i = document.querySelector('#karteBody input[data-f="dnsfest"]');
         return !!i && i.value === '8.8.8.8' && i.disabled; }));
    await gross(page, true);
    ok('⭐ im Aktionsmodus (kompakte Ansicht) steht die DNS-Adresse ebenfalls',
       await page.evaluate(() => { const S = window.SIM; const d = document.createElement('div');
         S.konfig.kompakt(S.netz.cwwVon(), d);
         return [...d.querySelectorAll('.kk-z')].some(z => z.textContent.includes('DNS') && z.textContent.includes('8.8.8.8')); }));
    await page.locator('[data-k="dnsseite"]').click();
    await page.waitForTimeout(250);
    {
      ok('⭐ „DNS-Liste öffnen" zeigt die Liste von 8.8.8.8 mit dem öffentlichen Namen',
         await page.evaluate(() => [...document.querySelectorAll('#karteBody .k-dns-z')]
           .some(r => r.textContent.includes('www.anna.de') && r.textContent.includes('aus deinem Netz'))));
      ok('und sagt, warum der private fehlt',
         await page.evaluate(() => [...document.querySelectorAll('#karteBody .k-dns-z')]
           .some(r => r.textContent.includes('drucker.anna.de') && r.textContent.includes('private Adresse'))));
      ok('die Liste hat kein Eingabefeld', await page.locator('#karteBody input').count() === 0);
    }
    await page.locator('[data-k="zurueck"]').click();
    await page.waitForTimeout(250);
    ok('„Zurück" führt zu „Allgemein"', (await page.locator('.k-reiter-b.is-on').textContent()) === 'Allgemein');

    /* ⭐ Von selbst: ohne Klick, nur mit Warten. */
    await page.locator('.k-reiter-b', { hasText: 'Internet' }).click();
    await page.waitForTimeout(250);
    await page.evaluate(() => window.SIM.internet.rein({ bereiche: [13, 14, 15] }));
    await page.waitForTimeout(3600);
    ok('⭐ ein neuer Bereich erscheint nach wenigen Sekunden von selbst',
       (await page.locator('#karteBody .k-bereich').allTextContents()).join('|') === '13.0.0.0 /8|14.0.0.0 /8|15.0.0.0 /8');
    await page.locator('.k-reiter-b', { hasText: 'Allgemein' }).click();
    await page.locator('[data-k="dnsseite"]').click();
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const sv = window.SIM.netz.list().find(n => n.kind === 'server');
      window.SIM.netz.dnsConf(sv).records.push({ name: 'neu.anna.de', ip: '50.0.1.20' });
    });
    await page.waitForTimeout(3600);
    ok('⭐ ein neuer DNS-Eintrag erscheint in der Liste von selbst',
       await page.evaluate(() => [...document.querySelectorAll('#karteBody .k-dns-z')]
         .some(r => r.textContent.includes('neu.anna.de'))));
    await page.locator('[data-k="zurueck"]').click();
    await page.waitForTimeout(250);
    ok('der Zähler am Knopf „DNS-Liste öffnen" zählt mit',
       (await page.locator('[data-k="dnsseite"]').textContent()).includes('3'),
       await page.locator('[data-k="dnsseite"]').textContent());
    /* Wer gerade tippt, wird nicht gestört. */
    await page.locator('.k-reiter-b', { hasText: 'Netzwerkkarten' }).click();
    await page.locator('#karteBody input[data-f="ip"]').focus();
    await page.evaluate(() => window.SIM.internet.rein({ bereiche: [13] }));
    await page.waitForTimeout(3600);
    ok('⭐ das Auffrischen nimmt dem Eingabefeld den Fokus nicht',
       await page.evaluate(() => document.activeElement && document.activeElement.dataset.f === 'ip'));
    await page.evaluate(() => window.SIM.internet.setModus('solo'));

    /* Eine Adresse außerhalb des Bereichs: das cww warnt. */
    await page.evaluate(() => { const S = window.SIM; S.netz.cwwVon().nics[1].ip = '10.0.0.1'; S.neuZeichnen(); });
    await page.waitForTimeout(200);
    ok('⭐ eine Karte außerhalb des Bereichs bekommt ein „!"',
       await page.evaluate(() => {
         const id = window.SIM.netz.cwwVon().id;
         return document.querySelector('.nf [data-node="' + id + '"]').classList.contains('is-warn');
       }));
    await page.evaluate(() => { const S = window.SIM; S.netz.cwwVon().nics[1].ip = '50.0.1.1'; S.neuZeichnen(); });

    /* Aktion: ping 8.8.8.8 — und im Mitschnitt stehen die Pakete,
       die in die Wolke gehen und aus ihr kommen. */
    await page.locator('.mbtn[data-modus="aktion"]').click();
    await page.waitForTimeout(300);
    await mitschnitt(page, true);
    const r = await page.evaluate(() => new Promise(res => {
      const S = window.SIM;
      const e = S.netz.list().find(n => n.kind === 'host');
      S.stack.ping(e, '8.8.8.8', 1, S.stack.PING_FRIST, res);
      S.engine.runUntil(S.engine.now + 20e6);
    }));
    ok('ping 8.8.8.8 geht auch ohne Raum', r && r.ok, JSON.stringify(r));
    await page.waitForTimeout(300);
    ok('der Mitschnitt zeigt das Paket in die Wolke und zurück',
       await page.evaluate(() => {
         window.SIM.mit.setFilter({ dir: 'beide' });
         const v = window.SIM.mit.view().filter(z => z.frame && z.frame.src === 'Wolke');
         return v.some(z => z.dir === 'raus') && v.some(z => z.dir === 'rein');
       }));
    const r2 = await page.evaluate(() => new Promise(res => {
      const S = window.SIM;
      const e = S.netz.list().find(n => n.kind === 'host');
      S.stack.ping(e, '67.0.0.1', 1, S.stack.PING_FRIST, res);
      S.engine.runUntil(S.engine.now + 20e6);
    }));
    ok('ein anderes Netz ohne Raum: „nicht erreichbar"', r2 && !r2.ok && /nicht erreichbar/.test(r2.error), JSON.stringify(r2));
    await page.evaluate(() => window.SIM.flaeche.select(null));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, 'shot-cww.png') });
    await mitschnitt(page, false);
    await page.locator('.mbtn[data-modus="entwurf"]').click();
    await page.waitForTimeout(200);

    /* Szenario 8: die öffentlichen Adressen fehlen mit Absicht — sie
       hängen am Bereich des Kindes. Im Bild muss trotzdem alles
       dastehen, und ohne ein „!" an Geräten, die nur noch leer sind. */
    await szenarioWaehlen(page, 'internet');
    await page.waitForTimeout(500);
    ok('Szenario 8 lädt mit cww, Heimrouter, Server und Laptop',
       await page.evaluate(() => ['cww', 'heimrouter', 'server', 'host']
         .every(k => window.SIM.netz.list().some(n => n.kind === k))));
    ok('der Auftrag nennt den Adressbereich',
       (await page.locator('#aufgabeText').textContent()).includes('Adressbereich'));
    await page.screenshot({ path: path.join(OUT, 'shot-szenario-internet.png') });
  }

  ok('am Ende immer noch keine Konsolenfehler', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n' + '═'.repeat(58));
  console.log(fail === 0 ? `ALLES GRÜN — ${pass} Prüfungen.` : `${pass} ok, ${fail} GESCHEITERT.`);
  console.log('═'.repeat(58));

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ABBRUCH:', e); process.exit(2); });
