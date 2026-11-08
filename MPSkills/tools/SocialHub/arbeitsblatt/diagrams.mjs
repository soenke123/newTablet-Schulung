// Klassendiagramme mit dem echten SQL-Studio-Diagramm (js/diagram.js) als PNG
import { createRequire as _cr } from 'node:module'; import { fileURLToPath as _fu } from 'node:url';
const _req = _cr(import.meta.url); let _pw; try { _pw = _req('playwright'); } catch (e) { _pw = _req('/opt/node-tools/node_modules/playwright/index.js'); }
const { chromium } = _pw;
import { writeFileSync } from 'node:fs';
import { load, C, DDL } from './db.mjs';
const R = _fu(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
const out = process.argv[2] || _fu(new URL('./bilder', import.meta.url));

function schemaOf(tables, extraDDL) {
  const db = load('2026-11-07', { hash: false, tables: [] });
  let s = '';
  if (extraDDL) s = extraDDL; else for (const t of tables) s += DDL[t] + '\n';
  const r = C.run(db, s, { rights: 'create', maxRows: 1 });
  const e = r.results.find(x => x.kind === 'error'); if (e) throw new Error(e.message);
  const sc = C.schema(db);
  sc.tables.sort((a, b) => (tables || []).indexOf(a.name) - (tables || []).indexOf(b.name));
  return sc;
}

const SCHULE = `CREATE TABLE klasse (
  bezeichnung VARCHAR(5) PRIMARY KEY,
  klassenlehrkraft VARCHAR(40)
);
CREATE TABLE schueler (
  s_nr INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40),
  adresse VARCHAR(80),
  klasse VARCHAR(5),
  FOREIGN KEY (klasse) REFERENCES klasse(bezeichnung)
);
CREATE TABLE kurs (
  bezeichnung VARCHAR(5) PRIMARY KEY,
  lehrkraft VARCHAR(40)
);
CREATE TABLE belegung (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kurs VARCHAR(5),
  s_nr INT,
  FOREIGN KEY (kurs) REFERENCES kurs(bezeichnung),
  FOREIGN KEY (s_nr) REFERENCES schueler(s_nr)
);`;

export const DIAGRAMS = {
  'schule_1n': { tables: ['schueler', 'klasse'], ddl: SCHULE.split('CREATE TABLE kurs')[0] },
  'schule_nm': { tables: ['schueler', 'belegung', 'kurs'], ddl: SCHULE },
  'db_users': { tables: ['users'] },
  'db_photos': { tables: ['users', 'photos', 'comments'] },
  'db_nm': { tables: ['users', 'follows', 'likes', 'comments', 'photos', 'photo_tag', 'tags'] },
  'db_analytics': { tables: ['users', 'sessions', 'photos', 'views'] },
  'db_ads': { tables: ['users', 'ads'] }
};

// feste Lage der Kästen (sonst ordnet diagram.js selbst an)
export const POS = {
  schule_nm: { schueler: { x: 0, y: 0 }, klasse: { x: 0, y: 190 }, belegung: { x: 370, y: 40 }, kurs: { x: 700, y: 30 } },
  schule_1n: { klasse: { x: 0, y: 30 }, schueler: { x: 350, y: 0 } },
  db_nm: { users: { x: 0, y: 0 }, follows: { x: 341, y: 72 }, likes: { x: 661, y: 16 }, comments: { x: 661, y: 200 }, photos: { x: 341, y: 232 }, photo_tag: { x: 661, y: 408 }, tags: { x: 661, y: 540 } },
  db_analytics: { users: { x: 0, y: 0 }, sessions: { x: 340, y: 0 }, views: { x: 700, y: 0 }, photos: { x: 700, y: 290 } }
};

export async function render(names, pos = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2400, height: 1600 }, deviceScaleFactor: 3 });
  await page.setContent(`<!doctype html><html><head><style>
  :root{--bg:#f3f4f8;--surface:#fff;--ink:#0b0d18;--muted:#545b70;--line:#dfe2eb;--key:#c98a0a;--fk:#2f6fd6;--accent:#4f46e5;
  --dg-bg:#f4f5fa;--dg-dot:#dadde8;--dg-head:#eceefa;--dg-edge:#c3c8d6;--dg-link:#8a8fa6;--dg-shadow:rgba(20,20,40,.10)}
  body{margin:0;background:#fff} #host{position:relative;width:2400px;height:1600px} .dg-svg{position:absolute;inset:0;width:100%;height:100%}
  </style></head><body><div id="host"></div><div id="out"></div></body></html>`);
  await page.addScriptTag({ path: R + '/MPSkills/tools/SQLStudio/js/diagram.js' });
  for (const n of names) {
    const d = DIAGRAMS[n];
    const sc = schemaOf(d.tables, d.ddl);
    const lay = pos[n] ? { pos: pos[n], showTypes: d.types !== false } : (d.types === false ? { showTypes: false, pos: {} } : null);
    const res = await page.evaluate(async ({ sc, lay }) => {
      const host = document.getElementById('host');
      const dg = window.SQLDiagram.create(host);
      dg.render(sc, lay && Object.keys(lay.pos).length ? lay : null);
      if (lay && !Object.keys(lay.pos).length) dg.setShowTypes(lay.showTypes);
      await new Promise(r => setTimeout(r, 50));
      const svg = host.querySelector('svg'), vp = svg.querySelector('.dg-vp');
      const vpT = vp.getAttribute('transform');
      vp.setAttribute('transform', '');
      const b = vp.getBBox();
      const m = 14;
      const W = Math.ceil(b.width + 2 * m), H = Math.ceil(b.height + 2 * m);
      const clone = svg.cloneNode(true);
      clone.removeAttribute('class');
      clone.setAttribute('width', W); clone.setAttribute('height', H);
      clone.setAttribute('viewBox', (b.x - m) + ' ' + (b.y - m) + ' ' + W + ' ' + H);
      clone.querySelector('.dg-bg').remove();
      clone.querySelectorAll('text').forEach(t => { if (t.getAttribute('y') === '22' && t.getAttribute('text-anchor') === 'end') t.remove(); });
      const o = document.getElementById('out'); o.innerHTML = ''; o.appendChild(clone);
      clone.id = 'shot';
      // Lage zum Nachjustieren
      const boxes = [...svg.querySelectorAll('.dg-t')].map(g => [g.getAttribute('data-t'), g.getAttribute('transform')]);
      host.innerHTML = '';
      return { W, H, boxes };
    }, { sc, lay });
    await page.locator('#shot').screenshot({ path: out + '/' + n + '.png', omitBackground: true });
    console.log(n, res.W + 'x' + res.H, JSON.stringify(res.boxes));
  }
  await browser.close();
}
if (process.argv[1].endsWith('diagrams.mjs')) {
  const pos = process.argv[3] ? JSON.parse(process.argv[3]) : POS;
  await render(Object.keys(DIAGRAMS), pos);
}
