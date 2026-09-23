/* Prüfstand Responsives Design — Lernwelt / GameHub
 *
 * Lädt die echten Seiten in Chromium bei den Bildschirmgrößen, die in der
 * Schule wirklich vorkommen, und misst statt zu schätzen:
 *   1. waagerechter Überlauf der Seite (scrollWidth > clientWidth)
 *   2. WELCHE Elemente über den rechten Rand ragen
 *   3. Überlappungen zwischen Bauteilen, die sich nicht berühren dürfen
 *   4. Tippflächen unter 44 px (Finger-Mindestmaß)
 *
 * Der GameHub verlangt Login — deshalb wird die Session gestubbt und die
 * Server-Lader werden stillgelegt. Der Spielstand kommt als Seed in den
 * localStorage, damit die Kacheln so gefüllt sind wie bei einem Kind
 * mitten in Season 3 (mit Kreaturen, denn erst dann erscheinen die
 * absolut positionierten Badges auf der Kachel).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

/* Aufruf:  node responsivecheck.js [--page=hub] [--root=<pfad>]
   Ohne --root gilt der Ordner des Skripts (nicht cwd: ein aus der
   Git-Bash übergebenes „/c/Users/…" ist für Node auf Windows kein Pfad). */
const ARG = (k, dflt) => {
  const hit = process.argv.slice(2).find(a => a.startsWith('--' + k + '='));
  return hit ? hit.slice(k.length + 3) : dflt;
};
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(ARG('root', HERE));
const OUT  = path.join(HERE, 'shots');
const EXE  = 'C:/Users/snke/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
};

function serve(root) {
  const server = http.createServer((req, res) => {
    const clean = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    let file = path.join(root, clean);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    } catch { res.writeHead(404).end('nope'); return; }
    try {
      const buf = fs.readFileSync(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    } catch { res.writeHead(404).end('nope'); }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

/* ── Bildschirmgrößen ──────────────────────────────────────────
   Die Zahlen sind CSS-Pixel (nicht Geräte-Pixel) — genau das, was
   eine Media Query sieht. */
const VIEWPORTS = [
  { name: 'iphone-se-hoch',  w: 375,  h: 667,  touch: true  },
  { name: 'iphone-14-hoch',  w: 390,  h: 844,  touch: true  },
  { name: 'iphone-max-hoch', w: 430,  h: 932,  touch: true  },
  // 481–743 ist der Korridor, für den es bisher GAR keine Regeln gibt:
  // iPad Split View (halber Schirm) landet genau hier.
  { name: 'ipad-splitview',  w: 507,  h: 1024, touch: true  },
  { name: 'schmal-600',      w: 600,  h: 900,  touch: true  },
  { name: 'schmal-700',      w: 700,  h: 1000, touch: true  },
  { name: 'iphone-14-quer',  w: 844,  h: 390,  touch: true  },
  { name: 'ipad-mini-hoch',  w: 744,  h: 1133, touch: true  },
  { name: 'ipad-hoch',       w: 768,  h: 1024, touch: true  },
  { name: 'ipad-pro11-hoch', w: 834,  h: 1112, touch: true  },
  { name: 'ipad-quer',       w: 1024, h: 768,  touch: true  },
  { name: 'laptop',          w: 1280, h: 800,  touch: false },
  { name: 'desktop',         w: 1440, h: 900,  touch: false },
];

/* Zustände: ein Modal ist unsichtbar, solange es `hidden` trägt — ein
   Prüfstand, der nur die Startansicht misst, sieht von Shop, Buch und
   Bonbon-Modal nichts. `open` wird IM Browser ausgeführt. */
const PAGES = [
  { name: 'landing', url: '/index.html', wait: '.button-layout', stub: false },
  {
    name: 'hub', url: '/GameHub/index.html', wait: '.game-card', stub: true,
    states: [
      { name: 'start' },
      { name: 'shop',    open: `openShopModal()`,                    wait: '.shop-modal-box' },
      { name: 'buch',    open: `openBookModal()`,                    wait: '.book-modal-inner' },
      { name: 'kreatur', open: `document.querySelector('.game-card__creature-wrap,.game-card__egg-wrap')?.click()`, wait: '#modalOverlay:not([hidden]) .modal-box' },
      { name: 'season',  open: `document.getElementById('s3Modal').hidden=false`, wait: '.s2-panel' },
    ],
  },
  { name: 'profil',     url: '/profil.html',     wait: 'body', stub: true },
  { name: 'highscores', url: '/highscores.html', wait: 'body', stub: true },
];

/* Der Session-Stub liegt in _stub.js — dieselbe Datei nutzt probe375.js.
   Zwei Kopien wären zwei Wahrheiten. */
const STUB = path.join(HERE, '_stub.js');

/* ── Messungen im Browser ─────────────────────────────────────── */
function measure() {
  const de = document.documentElement;
  const vw = de.clientWidth;

  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' && el.className)
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /* 1. Überlauf der Seite */
  const pageOverflow = de.scrollWidth - de.clientWidth;

  /* 2. Wer ragt raus? Nur der äußerste Schuldige je Kette — sonst
        meldet ein überbreites Kind seine ganze Ahnenreihe mit. */
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const over = Math.round(r.right - vw);
    const under = Math.round(-r.left);
    if (over <= 1 && under <= 1) continue;
    if (out.some(o => o.el.contains(el))) continue;
    out.push({ el, sel: label(el), over: Math.max(0, over), under: Math.max(0, under), w: Math.round(r.width) });
  }

  /* 3. Überlappungen, die nicht sein dürfen.
        Gemessen wird die TINTE, nicht der Kasten: ein zentrierter
        Flex-Container ist 600 px breit, auch wenn die Überschrift darin
        nur 300 px Text hat — sonst meldet der Prüfstand Überlappungen,
        die auf dem Schirm keine sind. Dafür spannt eine Range über die
        Textknoten und liefert die echten Zeilenkästen. */
  const inkRects = (el) => {
    const out = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0 && r.height > 0) out.push(r);
    }
    // Kein Text (reine Grafik/Icons) → auf den Kasten zurückfallen
    if (!out.length) out.push(el.getBoundingClientRect());
    return out;
  };

  const overlaps = [];
  const pairs = [
    ['.hud-bar', '.hub-header__title h1'],
    ['.hud-bar', '.hub-header__subtitle'],
    ['.hud-bar', '.gallery-row'],
    ['.theme-cycle-btn', '.gallery-row'],
    ['.auth-bar', 'h1'],
  ];
  for (const [aSel, bSel] of pairs) {
    const a = document.querySelector(aSel), b = document.querySelector(bSel);
    if (!a || !b || !visible(a) || !visible(b)) continue;
    const ra = a.getBoundingClientRect();
    let best = null;
    for (const rb of inkRects(b)) {
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 2 && iy > 2 && (!best || ix * iy > best.x * best.y)) {
        best = { x: Math.round(ix), y: Math.round(iy) };
      }
    }
    if (best) overlaps.push({ a: aSel, b: bSel, ...best });
  }

  /* 3b. Überlauf INNERHALB eines Kastens. Der Seitentest sieht davon
         nichts: ein `overflow:hidden` schneidet still ab, ein
         `overflow:auto` schiebt eine waagerechte Leiste in ein Modal.
         Genau hier sitzen abgeschnittene Kacheln und gequetschte
         Zweispalten-Layouts. */
  const inner = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const ox = s.overflowX;
    if (ox === 'visible') continue;
    const d = el.scrollWidth - el.clientWidth;
    if (d <= 1) continue;
    inner.push({ sel: label(el), by: d, mode: ox });
  }

  /* 3c. Kind ragt aus seinem Kasten.
         Der wichtigste Test für die Spielkacheln: Badges, Trank-Knopf,
         Freilassen und Hints sind `position:absolute` in einer Kachel mit
         `overflow:visible`. Ragt so ein Ding heraus, gibt es KEINEN
         Seiten-Überlauf — es schiebt sich einfach über die Nachbarkachel.
         Von außen sieht das aus wie „der Knopf fällt raus". */
  const escapes = [];
  for (const box of document.querySelectorAll('.game-card, .modal-box, .shop-modal-box, .hud-bar, .season-section')) {
    if (!visible(box)) continue;
    const rb = box.getBoundingClientRect();
    const boxSel = label(box);
    for (const el of box.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      // Nur echte Ausbrecher: eine Kreatur, die bewusst oben übersteht,
      // ist gewollt (.game-card.has-creature) — waagerecht zählt.
      const r = el.getBoundingClientRect();
      const right = Math.round(r.right - rb.right);
      const left  = Math.round(rb.left - r.left);
      if (right <= 1 && left <= 1) continue;
      if (escapes.some(e => e.node.contains(el))) continue;
      escapes.push({ node: el, box: boxSel, sel: label(el), right: Math.max(0, right), left: Math.max(0, left), pos: s.position });
    }
  }

  /* 4. Tippflächen — getastet, nicht gemessen.
        Ein Knopf kann seine Trefferfläche über ein `::after` vergrößern,
        ohne dass sein Rechteck wächst (so macht es .game-card__release:
        der rote Kasten soll klein bleiben, der Finger trifft trotzdem).
        Ein reiner Rechteck-Test würde das für immer als Fehler melden.
        Deshalb wird an den Rändern eines 44er-Quadrats nachgefragt, wer
        dort die Berührung bekäme. */
  const TAP = 44;
  const tapReachable = (el, r) => {
    if (r.width >= TAP && r.height >= TAP) return true;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const h = TAP / 2 - 1;
    for (const [x, y] of [[cx, cy - h], [cx, cy + h], [cx - h, cy], [cx + h, cy]]) {
      // Am Bildschirmrand ist kein Platz für die volle Fläche — das ist
      // kein Fehler des Knopfes, also nicht prüfen.
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) return false;
    }
    return true;
  };

  /* Liegt ein Modal offen, deckt sein Overlay alles darunter ab — dann
     scheitert JEDER Knopf der Seite am Tast-Test, völlig zu Recht und
     völlig ohne Aussage über seine Größe. Also wird in dem Fall nur
     geprüft, was im Modal selbst liegt. */
  const overlay = [...document.querySelectorAll(
    '.modal-overlay, .shop-modal-overlay, .s2-overlay, .lootbox-modal-overlay'
  )].filter(o => !o.hidden && visible(o)).pop();
  const scope = overlay || document;

  const small = [];
  for (const el of scope.querySelectorAll('button, a[href], [role="button"], input, select')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (tapReachable(el, r)) continue;
    small.push({ sel: label(el), w: Math.round(r.width), h: Math.round(r.height) });
  }

  return {
    vw, pageOverflow,
    out: out.map(({ sel, over, under, w }) => ({ sel, over, under, w })),
    inner: inner.sort((a, b) => b.by - a.by).slice(0, 10),
    escapes: (() => {
      // Nach Bauteil zusammenfassen: 15 Kacheln melden denselben Fehler.
      const seen = new Map();
      for (const e of escapes) {
        const k = e.box + ' » ' + e.sel;
        const prev = seen.get(k);
        if (!prev || e.right + e.left > prev.right + prev.left) {
          seen.set(k, { box: e.box, sel: e.sel, right: e.right, left: e.left, pos: e.pos, n: (prev?.n || 0) + 1 });
        } else { prev.n++; }
      }
      return [...seen.values()].sort((a, b) => (b.right + b.left) - (a.right + a.left)).slice(0, 10);
    })(),
    overlaps,
    small: small.slice(0, 40),
    smallCount: small.length,
    cards: document.querySelectorAll('.game-card').length,
    /* #gamesGrid ist nur der Rahmen — die echten Raster sind je Season
       ein eigenes .games-grid. */
    gridCols: (() => {
      const g = document.querySelector('.games-grid');
      if (!g) return null;
      const t = getComputedStyle(g).gridTemplateColumns;
      return t === 'none' ? null : t.split(/\s+/).filter(Boolean).length;
    })(),
    cardW: (() => {
      const c = document.querySelector('.game-card');
      return c ? Math.round(c.getBoundingClientRect().width) : null;
    })(),
  };
}

/* ── Lauf ─────────────────────────────────────────────────────── */
const only = ARG('page', null);

const server = await serve(ROOT);
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] });
const results = [];

for (const pg of PAGES) {
  if (only && pg.name !== only) continue;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
      hasTouch: vp.touch,
      isMobile: false,   // kein Mobile-Emulation-Viewport-Trick: wir wollen echte CSS-px
    });
    // Cinzel + Nunito MÜSSEN echt laden. Mit einer leeren Ersatz-CSS
    // rendert alles in der Fallback-Schrift, und dann sind alle
    // gemessenen Textbreiten falsch — genau die Größe, um die es hier
    // geht. Nur das Supabase-CDN und die Vercel-Insights werden gestubbt.
    await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({})},from(){return this},select(){return this},rpc:async()=>({data:null,error:null})})};' }));
    await ctx.route('**/_vercel/**', r => r.abort());
    if (pg.stub) await ctx.addInitScript({ path: STUB });

    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));

    /* `hasTouch` schaltet nur die Touch-Ereignisse frei — das Media-
       Feature `pointer: coarse` bleibt davon unberührt, und Playwright
       kann es nicht emulieren (emulateMedia kennt nur colorScheme &
       Co.). Ohne diesen CDP-Aufruf greift KEINE der Finger-Regeln, und
       der Prüfstand meldet fröhlich Erfolge für Regeln, die gar nicht
       angewendet wurden. */
    if (vp.touch) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'pointer',     value: 'coarse' },
          { name: 'any-pointer', value: 'coarse' },
          { name: 'hover',       value: 'none'   },
          { name: 'any-hover',   value: 'none'   },
        ],
      });
    }

    let loadNote = '';
    try {
      await page.goto(base + pg.url, { waitUntil: 'load', timeout: 20000 });
      try { await page.waitForSelector(pg.wait, { timeout: 8000 }); }
      catch { loadNote = 'Wartemarke „' + pg.wait + '" nie erschienen'; }
      await page.waitForTimeout(700);
      if (!loadNote && new URL(page.url()).pathname !== pg.url) {
        loadNote = 'umgeleitet nach ' + new URL(page.url()).pathname;
      }
    } catch (e) {
      loadNote = 'FEHLER beim Laden: ' + String(e.message).slice(0, 120);
    }

    for (const st of (pg.states || [{ name: 'start' }])) {
      const tag = st.name === 'start' ? pg.name : `${pg.name}:${st.name}`;
      let m = null, note = loadNote;
      if (!loadNote?.startsWith('FEHLER')) {
        try {
          if (st.open) {
            await page.evaluate(`(async()=>{ ${st.open} })()`);
            if (st.wait) {
              try { await page.waitForSelector(st.wait, { timeout: 5000 }); }
              catch { note = 'Zustand „' + st.name + '" ging nicht auf (' + st.wait + ')'; }
            }
            await page.waitForTimeout(450);
          }
          m = await page.evaluate(measure);
          await page.screenshot({ path: path.join(OUT, `${tag.replace(':', '-')}-${vp.name}.png`) });
          // Zustand wieder zu, damit der nächste auf sauberem Grund steht
          if (st.open) {
            await page.evaluate(`document.querySelectorAll('.modal-overlay,.shop-modal-overlay,.s2-overlay,.lootbox-modal-overlay').forEach(o=>o.hidden=true)`);
            await page.waitForTimeout(150);
          }
        } catch (e) {
          note = 'FEHLER: ' + String(e.message).slice(0, 120);
        }
      }
      results.push({ page: tag, vp: vp.name, w: vp.w, h: vp.h, touch: vp.touch, note, errors: errors.slice(0, 3), ...(m || {}) });
    }
    await ctx.close();
  }
}

/* Aufräumen NACH dem Bericht — und mit Zeitlimit. Beim Zuklappen von
   Browser und Server kann es hängen (offene Keep-alive-Verbindungen,
   ein Chromium, der nicht zurückmeldet); stand der Bericht davor, war
   ein kompletter Messlauf verloren, obwohl alle Zahlen schon da waren. */
const teardown = async () => {
  await Promise.race([
    (async () => { await browser.close(); server.close(); })(),
    new Promise(r => setTimeout(r, 15000)),
  ]);
};

/* ── Bericht ──────────────────────────────────────────────────── */
const R = (s, n) => String(s).padEnd(n);
// Nach Seite/Zustand gruppieren — gemessen wird viewport-weise, gelesen
// wird aber „was macht der Shop über alle Größen".
const order = [...new Set(results.map(r => r.page))];
results.sort((a, b) => order.indexOf(a.page) - order.indexOf(b.page)
  || VIEWPORTS.findIndex(v => v.name === a.vp) - VIEWPORTS.findIndex(v => v.name === b.vp));
let lastPage = null;
for (const r of results) {
  if (r.page !== lastPage) {
    console.log('\n' + '═'.repeat(78));
    console.log('  ' + r.page.toUpperCase());
    console.log('═'.repeat(78));
    lastPage = r.page;
  }
  const flag = r.pageOverflow > 1 ? `ÜBERLAUF +${r.pageOverflow}px` : 'ok';
  console.log(`\n${R(r.vp, 18)} ${R(r.w + '×' + r.h, 10)} ${flag}`
    + (r.gridCols ? `   Spalten: ${r.gridCols}` : '')
    + (r.cardW ? `   Kachel: ${r.cardW}px` : '')
    + (r.cards ? `   (${r.cards} Kacheln)` : ''));
  if (r.note)   console.log(`   ⚠ ${r.note}`);
  if (r.errors?.length) r.errors.forEach(e => console.log(`   ✖ JS: ${e}`));
  if (r.out?.length) {
    console.log('   ragt über den Rand:');
    for (const o of r.out.slice(0, 8)) {
      console.log(`     ${R(o.sel, 46)} ${o.over ? 'rechts +' + o.over + 'px' : ''} ${o.under ? 'links -' + o.under + 'px' : ''} (breit ${o.w})`);
    }
    if (r.out.length > 8) console.log(`     … und ${r.out.length - 8} weitere`);
  }
  if (r.escapes?.length) {
    console.log('   ragt aus seinem Kasten:');
    for (const e of r.escapes.slice(0, 7)) {
      const dir = [e.right ? 'rechts +' + e.right + 'px' : '', e.left ? 'links +' + e.left + 'px' : ''].filter(Boolean).join(' ');
      console.log(`     ${R(e.box + ' » ' + e.sel, 60)} ${dir}  (${e.pos}${e.n > 1 ? ', ' + e.n + '×' : ''})`);
    }
  }
  if (r.inner?.length) {
    console.log('   Überlauf im Kasten:');
    for (const i of r.inner.slice(0, 6)) {
      console.log(`     ${R(i.sel, 46)} +${i.by}px  (overflow-x: ${i.mode})`);
    }
  }
  if (r.overlaps?.length) {
    for (const o of r.overlaps) console.log(`   ✖ überlappt: ${o.a} × ${o.b}  (${o.x}×${o.y}px)`);
  }
  /* Nur bei Fingerbedienung ein Befund. Auf Laptop und Desktop zeigt
     die Maus auf den Pixel genau — dort sind 40 px völlig in Ordnung,
     und die Finger-Regeln greifen absichtlich nicht. */
  if (r.smallCount && r.touch) {
    console.log(`   Tippflächen < 44px: ${r.smallCount}`);
    const uniq = [...new Map(r.small.map(s => [s.sel, s])).values()].slice(0, 6);
    for (const s of uniq) console.log(`     ${R(s.sel, 46)} ${s.w}×${s.h}`);
  }
}

console.log('\n' + '─'.repeat(78));
const bad = results.filter(r => r.pageOverflow > 1).length;
const olap = results.filter(r => r.overlaps?.length).length;
const tiny = results.filter(r => r.smallCount && r.touch).length;
console.log(`${results.length} Messungen · ${bad}× waagerechter Überlauf · ${olap}× Überlappung · ${tiny}× zu kleine Tippfläche`);
console.log(`Bilder in ${OUT}`);

await teardown();
process.exit(bad || olap ? 1 : 0);
