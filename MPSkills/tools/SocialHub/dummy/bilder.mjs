/* Bilder für die Dummy-Daten nachliefern
     node MPSkills/tools/SocialHub/dummy/bilder.mjs            → Stand: was da ist, was fehlt
     node MPSkills/tools/SocialHub/dummy/bilder.mjs --convert  → dummy/eingang/* umwandeln

   So geht's: Bild in dummy/eingang/ legen, Dateiname = Schlüssel aus LISTE.md
   (z. B. paul_01.jpg, av_erna.png – Endung egal: jpg/jpeg/png/webp).
   --convert schneidet mittig zu (Posts 4:5 → 1080 × 1350, Profilbilder av_* 1:1 → 400 × 400),
   speichert WebP (Posts ≤ 250 KB, Profilbilder ≤ 60 KB) nach dummy/img/<schlüssel>.webp,
   entfernt dabei alle Metadaten (EXIF, GPS) und verschiebt das Original nach dummy/eingang/erledigt/.
   Unbekannte Namen bleiben liegen und werden gemeldet. Fehlende Bilder zeigt die App als Platzhalter.
   Jeder Lauf schreibt dummy/img/index.json neu (Liste der vorhandenen Bilder für die App) –
   mit einchecken, sonst zeigt die App weiter Platzhalter. */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const IMG = join(here, 'img'), IN = join(here, 'eingang'), DONE = join(IN, 'erledigt');
new Function(readFileSync(join(here, 'daten.js'), 'utf8'))();
const D = globalThis.SHDummyDaten;

const need = new Map(); // schlüssel → { kind, info }
D.PHOTOS.forEach(p => need.set(p[0], { kind: 'post', info: p[1] + ': ' + (p[2] || '(ohne Text)') }));
D.USERS.forEach(u => { if (u.av) need.set(u.av, { kind: 'avatar', info: 'Profilbild ' + u.k }); });

const LIMIT = { post: { w: 1080, h: 1350, kb: 250 }, avatar: { w: 400, h: 400, kb: 60 } };

async function convert() {
  const files = existsSync(IN) ? readdirSync(IN).filter(f => /\.(jpe?g|png|webp)$/i.test(f)) : [];
  if (!files.length) { console.log('dummy/eingang/ ist leer.'); return; }
  const { chromium } = require('playwright'); // wie tests/e2e.mjs
  const browser = await chromium.launch();
  const page = await browser.newPage();
  mkdirSync(IMG, { recursive: true }); mkdirSync(DONE, { recursive: true });
  for (const f of files) {
    const key = basename(f, extname(f)).toLowerCase();
    const n = need.get(key);
    if (!n) { console.log('?  ' + f + ' – kein Schlüssel aus LISTE.md, bleibt liegen'); continue; }
    const lim = LIMIT[n.kind];
    const mime = /png$/i.test(f) ? 'image/png' : /webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
    const src = 'data:' + mime + ';base64,' + readFileSync(join(IN, f)).toString('base64');
    const out = await page.evaluate(async ({ src, w, h, kb }) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); // füllen, mittig zuschneiden
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      for (let q = 0.86; q >= 0.4; q -= 0.06) {
        const u = c.toDataURL('image/webp', q);
        if (u.length * 0.75 <= kb * 1024) return { u, q, src: [img.naturalWidth, img.naturalHeight] };
      }
      return { u: c.toDataURL('image/webp', 0.4), q: 0.4, src: [img.naturalWidth, img.naturalHeight] };
    }, { src, ...lim });
    const buf = Buffer.from(out.u.split(',')[1], 'base64');
    writeFileSync(join(IMG, key + '.webp'), buf);
    renameSync(join(IN, f), join(DONE, f));
    const small = out.src[0] < lim.w * 0.7 || out.src[1] < lim.h * 0.7 ? '  (Original klein: ' + out.src.join('×') + ')' : '';
    console.log('✓  ' + key + '.webp  ' + Math.round(buf.length / 1024) + ' KB, Qualität ' + out.q.toFixed(2) + small);
  }
  await browser.close();
}

function status() {
  const have = existsSync(IMG) ? new Set(readdirSync(IMG).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5))) : new Set();
  // Verzeichnis für die App (js/media.js): nur, was da ist und in der Liste steht
  mkdirSync(IMG, { recursive: true });
  writeFileSync(join(IMG, 'index.json'), JSON.stringify([...have].filter(k => need.has(k)).sort()) + '\n');
  let ok = 0; const miss = { post: [], avatar: [] }; const big = [];
  for (const [k, n] of need) {
    if (have.has(k)) { ok++; const kb = statSync(join(IMG, k + '.webp')).size / 1024; if (kb > LIMIT[n.kind].kb + 1) big.push(k + ' (' + Math.round(kb) + ' KB)'); }
    else miss[n.kind].push(k);
  }
  const extra = [...have].filter(k => !need.has(k));
  console.log(`Bilder: ${ok} von ${need.size} da (Posts ${D.PHOTOS.length - miss.post.length}/${D.PHOTOS.length}, Profilbilder ${need.size - D.PHOTOS.length - miss.avatar.length}/${need.size - D.PHOTOS.length})`);
  if (big.length) console.log('zu groß: ' + big.join(', '));
  if (extra.length) console.log('nicht in der Liste: ' + extra.join(', '));
  if (process.argv.includes('--fehlend')) {
    for (const kind of ['post', 'avatar']) for (const k of miss[kind]) console.log('  fehlt  ' + k.padEnd(16) + need.get(k).info);
  } else if (miss.post.length + miss.avatar.length) console.log('(fehlende einzeln: --fehlend)');
}

if (process.argv.includes('--convert')) await convert();
status();
