/* YourSozialNet — Bilder der Beispiel-Anzeigen (Migration 0276) zeichnen
     node MPSkills/tools/SocialHub/dummy/werbung.mjs
     node MPSkills/tools/SocialHub/dummy/bilder.mjs --convert   ← wandelt sie um, schreibt index.json

   Ausgedachte Marken, gezeichnet mit HTML/SVG im Browser (Playwright wie
   tests/e2e.mjs), 1080 × 1350 als PNG – nur das Produkt (Name, Titel, Text und Knopf legt die App darüber; oben links sitzt das Schild „Anzeige“) nach dummy/eingang/wb_<schlüssel>.png.
   Schrift Outfit aus fonts/ (eingebettet, keine Anfrage nach draußen). */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const IN = join(here, 'eingang');
const FONT = readFileSync(join(here, '..', '..', '..', '..', 'fonts', 'files', 'outfit_v15_QGYvz_MVcBeNP4NJtEtq.woff2')).toString('base64');

const base = `
@font-face { font-family: Outfit; src: url(data:font/woff2;base64,${FONT}) format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1080px; height: 1350px; overflow: hidden; font-family: Outfit, sans-serif; color: #fff; position: relative; }
.brand { position: absolute; left: 80px; top: 80px; font-weight: 800; font-size: 54px; letter-spacing: .02em; }
/* Name, Titel, Text und Knopf zeigt die App aus der Kampagne – im Bild nur das Produkt */
.big { position: absolute; left: 80px; right: 80px; bottom: 300px; font-weight: 800; font-size: 118px; line-height: .95; letter-spacing: -.02em; }
.sub { position: absolute; left: 80px; right: 80px; bottom: 200px; font-size: 44px; font-weight: 500; opacity: .92; }
.tag { position: absolute; left: 80px; bottom: 90px; font-size: 34px; font-weight: 700; padding: 14px 30px; border-radius: 99px; background: rgba(255,255,255,.18); }
svg.art { position: absolute; }
`;

const ADS = {
  volta: `<body style="background: radial-gradient(70% 55% at 70% 30%, #2563eb, transparent 70%), linear-gradient(160deg, #0b1030, #030512)">
    <svg class="art" style="left:330px;top:170px" width="420" height="760" viewBox="0 0 210 380">
      <defs><linearGradient id="c" x1="0" x2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset=".45" stop-color="#60a5fa"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
      <rect x="20" y="30" width="170" height="330" rx="26" fill="url(#c)"/><rect x="34" y="14" width="142" height="30" rx="12" fill="#cbd5e1"/>
      <rect x="20" y="300" width="170" height="60" rx="22" fill="#1e293b" opacity=".5"/>
      <path d="M118 90 70 200h38l-18 90 60-126h-40l26-74z" fill="#facc15"/>
      <text x="105" y="335" font-size="30" font-weight="800" text-anchor="middle" fill="#fff" font-family="Outfit">BLUE RUSH</text></svg></body>`,
  snacks: `<body style="background: radial-gradient(60% 45% at 75% 30%, #f97316, transparent 70%), linear-gradient(170deg, #1c0a3a, #0b0418)">
    <svg class="art" style="left:280px;top:240px" width="520" height="520" viewBox="0 0 260 260">
      <circle cx="130" cy="130" r="118" fill="#fbbf24"/><circle cx="130" cy="130" r="98" fill="#ef4444"/>
      <g fill="#fde68a"><circle cx="95" cy="95" r="16"/><circle cx="160" cy="85" r="13"/><circle cx="170" cy="150" r="17"/><circle cx="100" cy="165" r="14"/><circle cx="135" cy="125" r="11"/></g>
      <g stroke="#7c2d12" stroke-width="4"><path d="M130 12v236M12 130h236M46 46l168 168M214 46 46 214" opacity=".35"/></g></svg></body>`,
  glow: `<body style="background: radial-gradient(60% 50% at 70% 32%, #fbcfe8, transparent 70%), linear-gradient(165deg, #f472b6, #9d174d)">
    <svg class="art" style="left:370px;top:170px" width="340" height="700" viewBox="0 0 170 350">
      <rect x="45" y="0" width="80" height="60" rx="10" fill="#fdf2f8"/><rect x="25" y="55" width="120" height="290" rx="40" fill="#fff"/>
      <rect x="25" y="150" width="120" height="110" fill="#fbcfe8"/><text x="85" y="215" font-size="26" font-weight="800" text-anchor="middle" fill="#9d174d" font-family="Outfit">GLOW</text>
      <g fill="#fff"><path d="M-10 120l6-16 6 16 16 6-16 6-6 16-6-16-16-6z"/><path d="M160 40l4-10 4 10 10 4-10 4-4 10-4-10-10-4z"/></g></svg></body>`,
  speedphone: `<body style="background: radial-gradient(60% 50% at 72% 30%, #22d3ee, transparent 70%), linear-gradient(160deg, #0f172a, #020617)">
    <svg class="art" style="left:340px;top:170px" width="400" height="760" viewBox="0 0 200 380">
      <rect x="10" y="10" width="180" height="360" rx="30" fill="#1e293b" stroke="#94a3b8" stroke-width="4"/>
      <rect x="22" y="40" width="156" height="300" rx="16" fill="url(#s)"/>
      <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06b6d4"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
      <rect x="60" y="150" width="80" height="120" rx="10" fill="none" stroke="#fff" stroke-width="7"/><rect x="85" y="140" width="30" height="12" rx="4" fill="#fff"/>
      <rect x="70" y="190" width="60" height="70" rx="4" fill="#4ade80"/><text x="100" y="120" font-size="34" font-weight="800" text-anchor="middle" fill="#fff" font-family="Outfit">80 %</text></svg></body>`,
  pfoten: `<body style="background: radial-gradient(60% 50% at 72% 30%, #fde68a, transparent 70%), linear-gradient(165deg, #f59e0b, #92400e)">
    <svg class="art" style="left:310px;top:270px" width="460" height="460" viewBox="0 0 230 230">
      <g fill="#fff"><ellipse cx="115" cy="150" rx="62" ry="52"/><ellipse cx="50" cy="85" rx="24" ry="32" transform="rotate(-20 50 85)"/><ellipse cx="95" cy="45" rx="24" ry="32"/>
      <ellipse cx="145" cy="45" rx="24" ry="32"/><ellipse cx="185" cy="85" rx="24" ry="32" transform="rotate(20 185 85)"/></g></svg></body>`,
  plus: `<body style="background: radial-gradient(60% 50% at 70% 30%, #a78bfa, transparent 70%), linear-gradient(160deg, #4c1d95, #120530)">
    <svg class="art" style="left:330px;top:290px" width="420" height="420" viewBox="0 0 210 210">
      <circle cx="105" cy="105" r="95" fill="none" stroke="#fff" stroke-width="12"/><path d="M38 38l134 134" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
      <text x="105" y="122" font-size="46" font-weight="800" text-anchor="middle" fill="#fff" font-family="Outfit">ADS</text></svg></body>`
};

const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
mkdirSync(IN, { recursive: true });
for (const [k, html] of Object.entries(ADS)) {
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' + base + '</style></head>' + html + '</html>');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(IN, 'wb_' + k + '.png') });
  console.log('✓  eingang/wb_' + k + '.png');
}
await browser.close();
