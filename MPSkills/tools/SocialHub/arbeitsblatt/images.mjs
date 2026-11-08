// Abbildungen im Stil von YourSozialNet (HTML/SVG → PNG)
import { createRequire } from 'node:module';
import { fileURLToPath as _fu } from 'node:url';
const _req = createRequire(import.meta.url); let _pw; try { _pw = _req('playwright'); } catch (e) { _pw = _req('/opt/node-tools/node_modules/playwright/index.js'); }
const { chromium } = _pw;
const R = _fu(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
const out = process.argv[2] || _fu(new URL('./bilder', import.meta.url));

const CSS = `
:root{--ink:#0b0d18;--muted:#545b70;--line:#dfe2eb;--line2:#c3c8d6;--soft:#f3f4f8;--soft2:#e3e5ee;--hub:#4f46e5;--dim:#eceafd;
--key:#c98a0a;--fk:#2f6fd6;--ok:#12a150;--okd:#e3f6ec;--bad:#d92d3e;--badd:#fdecee;--gold:#d99a00;--goldd:#fff6d6;
--kw:#7c3aed;--fn:#0f7ea8;--str:#b4541b;--num:#0e7490}
*{box-sizing:border-box} body{margin:0;background:#fff;font:15px/1.4 Inter,sans-serif;color:var(--ink)}
.a{display:inline-block;padding:18px}
.disp{font-family:Outfit,Inter,sans-serif}
.mono{font-family:'JetBrains Mono',monospace}
.kw{color:var(--kw);font-weight:600}.fn{color:var(--fn)}.str{color:var(--str)}.num{color:var(--num)}
table.t{border-collapse:separate;border-spacing:0;border:1px solid var(--line2);border-radius:12px;overflow:hidden;font-size:14px;background:#fff}
table.t th{background:#eceefa;text-align:left;padding:8px 12px;font-weight:700;border-bottom:1px solid var(--line2);white-space:nowrap}
table.t td{padding:7px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
table.t th[style*="4f46e5"] span{color:#fff!important}
table.t tr:last-child td{border-bottom:0}
table.t tr:nth-child(even) td{background:#f7f8fb}
.pill{display:inline-block;border-radius:999px;padding:4px 12px;font-weight:700;font-size:13px}
.card{background:#fff;border:1px solid var(--line2);border-radius:14px;box-shadow:0 1px 2px rgba(11,13,24,.06),0 8px 24px -12px rgba(11,13,24,.22)}
.code{background:var(--soft);border:1px solid var(--line);border-left:4px solid var(--hub);border-radius:10px;padding:10px 14px;font:14px/1.6 'JetBrains Mono',monospace;white-space:pre}
`;
const HEAD = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${R}/fonts/outfit-inter-jetbrainsmono-985fda.css"><style>${CSS}</style></head><body><div style="position:absolute;opacity:0;font-family:Outfit"><b>Aa</b><span>Aa</span></div>`;

const IMG = {};

/* ── Abb. 1: Datenbanksystem ─────────────────────────────── */
IMG.abb_dbms = `<div class="a"><svg width="880" height="330" viewBox="0 0 880 330" font-family="Inter">
<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#545b70"/></marker>
<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0b0d18" flood-opacity=".12"/></filter></defs>
<rect x="6" y="20" width="250" height="290" rx="18" fill="#f3f4f8" stroke="#dfe2eb"/>
<text x="131" y="48" text-anchor="middle" font-family="Outfit, Inter" font-size="17" font-weight="700" fill="#545b70">Anwendungsprogramme</text>
${[['App YourSozialNet', 'Feed, Profil, Posten'], ['Adminbereich', 'SQL, Diagramm, Werbung'], ['Webseite / andere Apps', '…']].map((r, i) =>
  `<g filter="url(#sh)"><rect x="28" y="${70 + i * 78}" width="206" height="62" rx="12" fill="#fff" stroke="#c3c8d6"/></g>
   <text x="131" y="${97 + i * 78}" text-anchor="middle" font-size="15" font-weight="700">${r[0]}</text>
   <text x="131" y="${117 + i * 78}" text-anchor="middle" font-size="12.5" fill="#545b70">${r[1]}</text>`).join('')}
<rect x="300" y="20" width="340" height="290" rx="18" fill="#eceafd" stroke="#4f46e5" stroke-width="1.5"/>
<text x="470" y="48" text-anchor="middle" font-family="Outfit, Inter" font-size="17" font-weight="700" fill="#4f46e5">Datenbankmanagementsystem (DBMS)</text>
<g filter="url(#sh)"><rect x="322" y="70" width="296" height="70" rx="12" fill="#fff" stroke="#c3c8d6"/></g>
<text x="470" y="99" text-anchor="middle" font-size="15" font-weight="700">Anfragen entgegennehmen</text>
<text x="470" y="120" text-anchor="middle" font-size="12.5" fill="#545b70">SQL prüfen: Wer darf was?</text>
<g filter="url(#sh)"><rect x="322" y="200" width="296" height="70" rx="12" fill="#fff" stroke="#c3c8d6"/></g>
<text x="470" y="229" text-anchor="middle" font-size="15" font-weight="700">Software für den Datenzugriff</text>
<text x="470" y="250" text-anchor="middle" font-size="12.5" fill="#545b70">lesen, einfügen, ändern, löschen</text>
<line x1="470" y1="146" x2="470" y2="194" stroke="#545b70" stroke-width="2" marker-start="url(#ar)" marker-end="url(#ar)"/>
<text x="482" y="176" font-family="JetBrains Mono" font-size="12.5" fill="#7c3aed" font-weight="700">SQL</text>
<line x1="262" y1="165" x2="294" y2="165" stroke="#545b70" stroke-width="2" marker-start="url(#ar)" marker-end="url(#ar)"/>
${[['Datenbank', 'die eigentlichen Daten', 78], ['Metadaten', 'Aufbau der Tabellen', 198]].map(([t, s, y]) => `
<g filter="url(#sh)"><path d="M700 ${y} v62 a74 14 0 0 0 148 0 v-62" fill="#fff" stroke="#c3c8d6"/>
<ellipse cx="774" cy="${y}" rx="74" ry="14" fill="#eceefa" stroke="#c3c8d6"/></g>
<text x="774" y="${y + 40}" text-anchor="middle" font-size="15" font-weight="700">${t}</text>
<text x="774" y="${y + 60}" text-anchor="middle" font-size="12.5" fill="#545b70">${s}</text>`).join('')}
<line x1="624" y1="235" x2="694" y2="120" stroke="#545b70" stroke-width="2" marker-start="url(#ar)" marker-end="url(#ar)"/>
<line x1="624" y1="235" x2="694" y2="240" stroke="#545b70" stroke-width="2" marker-start="url(#ar)" marker-end="url(#ar)"/>
<rect x="290" y="8" width="584" height="314" rx="22" fill="none" stroke="#0b0d18" stroke-dasharray="6 5" stroke-width="1.3"/>
<text x="864" y="316" text-anchor="end" font-family="Outfit, Inter" font-size="15" font-weight="700">Datenbanksystem</text>
</svg></div>`;

/* ── Abb. 2: ER-Modell Schüler – Klasse – Kurs ────────────── */
const ell = (x, y, t, key) => `<ellipse cx="${x}" cy="${y}" rx="${Math.max(48, t.length * 5.4)}" ry="22" fill="#fff" stroke="#c3c8d6" stroke-width="1.5"/>
<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" ${key ? 'font-weight="700" text-decoration="underline"' : ''}>${t}</text>`;
const ent = (x, y, t) => `<rect x="${x - 70}" y="${y - 26}" width="140" height="52" rx="6" fill="#eceefa" stroke="#4f46e5" stroke-width="2"/>
<text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Outfit, Inter" font-size="18" font-weight="700">${t}</text>`;
const rel = (x, y, t) => `<path d="M${x} ${y - 34} L${x + 62} ${y} L${x} ${y + 34} L${x - 62} ${y}z" fill="#fff6d6" stroke="#d99a00" stroke-width="2"/>
<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700">${t}</text>`;
const ln = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#545b70" stroke-width="1.6"/>`;
const card = (x, y, t) => `<text x="${x}" y="${y}" font-family="Outfit, Inter" font-size="17" font-weight="700" fill="#4f46e5">${t}</text>`;
/* ── Beispieltabelle users mit Beschriftung ─────────────── */
const ROWS = [
  [2, 'noobqueen', 'Mia Sander', 'female', '2009-09-16', 'Kiel', 165],
  [4, 'levi.kicks', 'Levi Schumacher', 'male', '2009-04-11', 'Kiel', 184],
  [6, 'coach_ralf', 'Ralf Opitz', 'male', '1980-07-10', 'Kiel', 179],
  [8, 'alina.daily', 'Alina Keller', 'female', '2005-08-22', 'Hamburg', 170],
  [14, 'inkandmila', 'Mila Hoffmann', 'female', '2010-04-21', 'Leipzig', 160],
  [37, 'levi.berlin', 'Levi Schumacher', 'male', '1992-05-03', 'Berlin', 181]
];
const COLS = ['id', 'username', 'name', 'gender', 'birthday', 'city', 'centimeter'];
function tbl(rows, cols, { hc = [], hr = [], dim = false, key = true } = {}) {
  return `<table class="t"><tr>${cols.map((c, i) => `<th style="${hc.includes(i) ? 'background:#4f46e5;color:#fff' : ''}">${key && c === 'id' ? '<span style="color:' + (hc.includes(i) ? '#ffd25c' : '#c98a0a') + '">🔑</span> <u>id</u>' : c}</th>`).join('')}</tr>
  ${rows.map((r, ri) => `<tr>${r.map((v, i) => {
    const on = hc.includes(i) && hr.includes(ri), row = hr.includes(ri), col = hc.includes(i);
    const bg = on ? '#dcd8fd' : row ? '#f1effe' : col ? '#f5f4fe' : '';
    const op = dim && !row && !col ? 'opacity:.45;' : '';
    return `<td style="${bg ? 'background:' + bg + ';' : ''}${op}${on ? 'font-weight:700;' : ''}${typeof v === 'number' ? 'text-align:right;' : ''}">${v}</td>`;
  }).join('')}</tr>`).join('')}</table>`;
}
IMG.abb_tabelle = `<div class="a" style="position:relative;padding:58px 210px 20px 18px">
<div style="position:absolute;left:18px;top:8px;display:flex;gap:10px;align-items:center">
<span class="pill" style="background:#4f46e5;color:#fff">Klasse (Tabelle): users</span></div>
<div style="position:relative">${tbl(ROWS, COLS, { hr: [1], hc: [5] })}
<div style="position:absolute;right:-200px;top:42px;width:186px;font-size:13.5px">
<div style="display:flex;gap:8px;align-items:center"><svg width="40" height="14"><path d="M0 7H34" stroke="#4f46e5" stroke-width="2"/><path d="M0 7l7-5v10z" fill="#4f46e5"/></svg><b style="color:#4f46e5">Objekt</b></div>
<div style="color:#545b70;margin-left:48px;margin-top:-2px">= eine Zeile, ein Datensatz</div></div>
<div style="position:absolute;left:0;bottom:-6px;transform:translateY(100%)"></div>
</div>
<div style="display:flex;gap:28px;margin-top:12px;font-size:13.5px;color:#545b70">
<div><b style="color:#c98a0a">🔑 Primärschlüssel</b> id: jede Zeile hat eine andere</div>
<div><b style="color:#4f46e5">Attribut</b> = eine Spalte, z. B. city</div></div></div>`;

/* ── So arbeitet SQL ─────────────────────────────────────── */
const KIEL = ROWS.map((r, i) => r[5] === 'Kiel' ? i : -1).filter(i => i >= 0);
IMG.abb_sql = `<div class="a" style="display:inline-flex;flex-direction:column;gap:14px">
<div style="display:flex;gap:22px;align-items:center">
<div class="code" style="font-size:15px"><span class="kw">SELECT</span> name, city
<span class="kw">FROM</span> users
<span class="kw">WHERE</span> city = <span class="str">'Kiel'</span></div>
<div style="font-size:14px;color:#545b70;line-height:1.6">
<div><b style="color:#4f46e5">SELECT</b> wählt die Spalten (Attribute) aus: name und city</div>
<div><b style="color:#4f46e5">FROM</b> nennt die Tabelle (Klasse): users</div>
<div><b style="color:#4f46e5">WHERE</b> wählt die Zeilen (Objekte) aus: nur die aus Kiel</div></div></div>
<div style="display:flex;gap:18px;align-items:center">
<div>${tbl(ROWS, COLS, { hc: [2, 5], hr: KIEL, dim: true })}</div>
<svg width="40" height="24"><path d="M0 12H30" stroke="#545b70" stroke-width="2.4"/><path d="M38 12l-11-8v16z" fill="#545b70"/></svg>
<div><div style="font-size:12.5px;font-weight:700;color:#545b70;margin-bottom:6px">Ergebnis: wieder eine Tabelle</div>
${tbl(KIEL.map(i => [ROWS[i][2], ROWS[i][5]]), ['name', 'city'], { key: false })}</div></div></div>`;

/* ── JOIN: Fremdschlüssel trifft Primärschlüssel ─────────── */
IMG.abb_join = `<div class="a" style="display:inline-flex;gap:24px;align-items:flex-start">
<div><div style="font-weight:700;margin-bottom:6px">users</div>${tbl([[1, 'pixelpaul'], [2, 'noobqueen'], [3, 'hugo.ranked']], ['id', 'username'])}</div>
<div><div style="font-weight:700;margin-bottom:6px">photos</div>${tbl([[1, 1, 'paul_01'], [2, 1, 'paul_02'], [7, 2, 'mia_01'], [12, 3, 'hugo_01'], [13, 3, 'hugo_02']], ['id', '<span style="color:#2f6fd6">user_id ↑</span>', 'image'])}</div>
<div style="padding-top:70px"><svg width="40" height="24"><path d="M0 12H30" stroke="#545b70" stroke-width="2.4"/><path d="M38 12l-11-8v16z" fill="#545b70"/></svg></div>
<div><div style="font-weight:700;margin-bottom:6px">users JOIN photos ON photos.user_id = users.id</div>
${tbl([[1, 'pixelpaul', 1, 1, 'paul_01'], [1, 'pixelpaul', 2, 1, 'paul_02'], [2, 'noobqueen', 7, 2, 'mia_01'], [3, 'hugo.ranked', 12, 3, 'hugo_01'], [3, 'hugo.ranked', 13, 3, 'hugo_02']],
  ['users.id', 'username', 'photos.id', '<span style="color:#2f6fd6">user_id ↑</span>', 'image'], { key: false, hc: [0, 3] })}
<div style="font-size:13px;color:#545b70;margin-top:8px">Jede Zeile von photos bekommt die Zeile aus users, deren <b>id</b> zu <b>user_id</b> passt.</div></div></div>`;

/* ── JOIN-Varianten als Mengenbild ───────────────────────── */
function venn(title, mode, sub) {
  const L = mode === 'left' || mode === 'full', Rr = mode === 'right' || mode === 'full';
  return `<div style="text-align:center"><svg width="230" height="150" viewBox="0 0 230 150">
  <defs><clipPath id="c${mode}"><circle cx="85" cy="75" r="62"/></clipPath></defs>
  <circle cx="85" cy="75" r="62" fill="${L ? '#4f46e5' : '#fff'}" fill-opacity="${L ? .85 : 1}"/>
  <circle cx="145" cy="75" r="62" fill="${Rr ? '#4f46e5' : '#fff'}" fill-opacity="${Rr ? .85 : 1}"/>
  <circle cx="145" cy="75" r="62" fill="#4f46e5" clip-path="url(#c${mode})"/>
  <circle cx="85" cy="75" r="62" fill="none" stroke="#0b0d18" stroke-width="2"/><circle cx="145" cy="75" r="62" fill="none" stroke="#0b0d18" stroke-width="2"/>
  <text x="58" y="80" text-anchor="middle" font-family="Inter" font-size="14" font-weight="700" fill="${L ? '#fff' : '#0b0d18'}">users</text>
  <text x="174" y="80" text-anchor="middle" font-family="Inter" font-size="14" font-weight="700" fill="${Rr ? '#fff' : '#0b0d18'}">photos</text></svg>
  <div class="disp" style="font-weight:700;font-size:17px">${title}</div><div style="font-size:12.5px;color:#545b70;max-width:220px;margin:2px auto 0">${sub}</div></div>`;
}
IMG.abb_venn = `<div class="a" style="display:inline-flex;gap:16px">
${venn('(INNER) JOIN', 'inner', 'nur User mit Fotos und nur Fotos mit User')}
${venn('LEFT JOIN', 'left', 'alle User, Fotos nur wo vorhanden, sonst NULL')}
${venn('RIGHT JOIN', 'right', 'alle Fotos, User nur wo vorhanden, sonst NULL')}
${venn('FULL JOIN', 'full', 'alles aus beiden Tabellen, Lücken mit NULL')}</div>`;

/* ── Kapselung ───────────────────────────────────────────── */
IMG.abb_kapselung = `<div class="a" style="display:inline-flex;gap:22px;align-items:center">
<div style="border:2px solid #4f46e5;border-radius:16px;padding:14px 16px;background:#fff">
<div style="font-size:12.5px;font-weight:700;color:#4f46e5;margin-bottom:6px">äußere Abfrage – läuft als zweite</div>
<div class="mono" style="font-size:14.5px;line-height:1.7"><span class="kw">SELECT</span> name, centimeter<br><span class="kw">FROM</span> users<br><span class="kw">WHERE</span> centimeter =</div>
<div style="border:2px dashed #d99a00;background:#fff6d6;border-radius:12px;padding:10px 14px;margin:6px 0 2px 26px">
<div style="font-size:12.5px;font-weight:700;color:#7a5600;margin-bottom:4px">innere Abfrage – läuft zuerst</div>
<div class="mono" style="font-size:14.5px;line-height:1.7">(<span class="kw">SELECT</span> <span class="fn">MAX</span>(centimeter)<br>&nbsp;<span class="kw">FROM</span> users)</div></div></div>
<svg width="40" height="24"><path d="M0 12H30" stroke="#545b70" stroke-width="2.4"/><path d="M38 12l-11-8v16z" fill="#545b70"/></svg>
<div style="display:flex;flex-direction:column;gap:14px">
<div><div style="font-size:12.5px;font-weight:700;color:#7a5600;margin-bottom:4px">1. innere Abfrage liefert einen Wert</div>
<table class="t"><tr><th>MAX(centimeter)</th></tr><tr><td style="text-align:right">250</td></tr></table></div>
<div><div style="font-size:12.5px;font-weight:700;color:#4f46e5;margin-bottom:4px">2. äußere Abfrage rechnet mit <span class="mono">WHERE centimeter = 250</span></div>
<table class="t"><tr><th>name</th><th>centimeter</th></tr><tr><td>Ronny Pfeiffer</td><td style="text-align:right">250</td></tr></table></div></div></div>`;

/* ── Drei Arten von Werbung ──────────────────────────────── */
const phone = (inner, label, sub) => `<div style="text-align:center;width:250px"><div style="width:230px;height:400px;margin:0 auto;border-radius:34px;background:#0b0d18;padding:10px;box-shadow:0 10px 30px rgba(20,20,40,.25)">
<div style="width:100%;height:100%;border-radius:26px;overflow:hidden;background:#151827;position:relative;color:#fff;font-size:12px">${inner}</div></div>
<div class="disp" style="font-weight:700;font-size:17px;margin-top:10px">${label}</div><div style="font-size:12.5px;color:#545b70">${sub}</div></div>`;
const photo = (c1, c2, txt) => `<div style="position:absolute;inset:0;background:linear-gradient(160deg,${c1},${c2})"></div><div style="position:absolute;left:12px;bottom:14px;right:46px"><b>@${txt[0]}</b><div style="opacity:.85">${txt[1]}</div></div>
<div style="position:absolute;right:10px;bottom:16px;display:flex;flex-direction:column;gap:12px;font-size:17px;text-align:center">♥<span style="font-size:15px">💬</span></div>`;
IMG.abb_werbung = `<div class="a" style="display:inline-flex;gap:18px">
${phone(`<div style="position:absolute;inset:0;background:#1e2235"></div>
<div style="position:absolute;left:14px;right:14px;top:60px;bottom:60px;border-radius:16px;background:linear-gradient(160deg,#4f46e5,#9b5de5);padding:16px">
<span style="background:#ffd25c;color:#0b0d18;border-radius:6px;padding:2px 7px;font-weight:700;font-size:11px">Anzeige ⓘ</span>
<div style="font-size:30px;margin-top:40px">⚡</div><div class="disp" style="font-size:20px;font-weight:700">VOLTA Energy</div><div style="opacity:.9">Noch eine Runde?</div>
<div style="position:absolute;left:16px;right:16px;bottom:16px;background:#fff;color:#0b0d18;border-radius:10px;padding:8px;font-weight:700;text-align:center">Jetzt probieren</div></div>`,
  'Feed-Werbung', 'eigene Karte zwischen den Fotos')}
${phone(photo('#d4a373', '#6b4226', ['wuffi_und_ich', 'Bruno liebt die Ostsee 🐶']) +
  `<div style="position:absolute;left:10px;right:10px;bottom:70px;background:rgba(255,255,255,.95);color:#0b0d18;border-radius:12px;padding:8px 10px;display:flex;gap:8px;align-items:center">
  <span style="font-size:20px">🐾</span><div style="flex:1"><b>Pfotenglück</b><div style="font-size:11px;color:#545b70">Anzeige · Für deinen Liebling</div></div><b style="color:#4f46e5">›</b></div>`,
  'Foto-Label', 'Werbung direkt an passenden Fotos')}
${phone(photo('#0f3d5e', '#7fb3d5', ['frag_frieda', 'Der Erdschatten ist rund. Immer.']) +
  `<div style="position:absolute;left:12px;top:14px;background:rgba(0,0,0,.45);border-radius:999px;padding:3px 10px;font-weight:700;font-size:11px">Gesponsert ⓘ</div>`,
  'Beworbener Post', 'ein normales Foto rutscht nach vorn')}</div>`;

IMG.abb_werbung_cap = IMG.abb_werbung.replace('<div class="a" style="display:inline-flex;gap:18px">', '<div class="a" style="display:inline-flex;flex-direction:column;align-items:center;gap:10px"><div style="display:flex;gap:18px">') +
  '<div style="font-size:15px;font-style:italic;color:#545b70">Abb. 13: Die drei Arten von Werbung in YourSozialNet</div></div>';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 3 });
for (const [name, html] of Object.entries(IMG)) {
  if (process.argv[3] && !process.argv[3].split(',').includes(name)) continue;
  await page.setContent(HEAD + html + '</body></html>');
  await page.evaluate(async () => { await document.fonts.load('700 16px Outfit'); await document.fonts.load('400 16px Outfit'); await document.fonts.load('400 14px "JetBrains Mono"'); await document.fonts.ready; });
  await page.locator('.a').first().screenshot({ path: out + '/' + name + '.png' });
  const b = await page.locator('.a').first().boundingBox();
  console.log(name, Math.round(b.width) + 'x' + Math.round(b.height));
}
await browser.close();
