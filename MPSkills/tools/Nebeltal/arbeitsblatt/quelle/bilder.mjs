import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
import { fileURLToPath } from 'url'; import path from 'path';
const HIER = path.dirname(fileURLToPath(import.meta.url)); process.chdir(HIER);
const IMG = path.join(HIER, '../../img/frei/');
const uri = n => 'data:image/webp;base64,' + fs.readFileSync(IMG + n + '.webp').toString('base64');
const C = { ink:'#0b1a33', soft:'#3e5577', faint:'#6f82a3', acc:'#0b9db3', accD:'#d4f1f6', or:'#f2711c', vi:'#7c5cff', red:'#e0464b', green:'#1f9d55', line:'#cfdcea', bg:'#f1f6fb' };
const sub = (b, s) => `${b}<tspan font-size="70%" dy="4">${s}</tspan><tspan dy="-4"></tspan>`;
const arrowDefs = `<defs>
 <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.acc}"/></marker>
 <marker id="ahr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.red}"/></marker>
 <marker id="ahk" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.ink}"/></marker>
 <marker id="ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.faint}"/></marker>
</defs>`;
const peng = (sp, x, y, h, flip) => { const w = h * 285 / 420; return `<image href="${uri(sp)}" x="${x - w/2}" y="${y - h}" width="${w}" height="${h}" ${flip ? `transform="translate(${2*x},0) scale(-1,1)"` : ''}/>`; };

// kleines Netz: zwei Eingänge -> Neuron -> Ausgang
function net(x, y, mode) {
  const col = mode === 'back' ? C.red : C.acc, mk = mode === 'back' ? 'ahr' : 'ah';
  const i1 = [x, y], i2 = [x, y + 70], n = [x + 100, y + 35], o = [x + 165, y + 35];
  let s = '';
  for (const [p, lab] of [[i1, 'x₁'], [i2, 'x₂']]) {
    s += mode === 'back'
      ? `<line x1="${n[0]-24}" y1="${n[1] + (p[1]-n[1])*0.2}" x2="${p[0]+20}" y2="${p[1] + (n[1]-p[1])*0.15}" stroke="${col}" stroke-width="3.5" marker-end="url(#${mk})"/>`
      : `<line x1="${p[0]+18}" y1="${p[1]}" x2="${n[0]-26}" y2="${n[1] + (p[1]-n[1])*0.2}" stroke="${col}" stroke-width="3.5" marker-end="url(#${mk})"/>`;
  }
  s += `<circle cx="${i1[0]}" cy="${i1[1]}" r="17" fill="#fff" stroke="${C.ink}" stroke-width="2"/><circle cx="${i2[0]}" cy="${i2[1]}" r="17" fill="#fff" stroke="${C.ink}" stroke-width="2"/>`;
  s += `<circle cx="${n[0]}" cy="${n[1]}" r="23" fill="${C.accD}" stroke="${C.ink}" stroke-width="2"/><text x="${n[0]}" y="${n[1]+8}" text-anchor="middle" font-size="22" font-weight="700">Σ</text>`;
  s += mode === 'back'
    ? `<line x1="${o[0]}" y1="${o[1]}" x2="${n[0]+28}" y2="${n[1]}" stroke="${col}" stroke-width="3.5" marker-end="url(#${mk})"/><text x="${o[0]+6}" y="${o[1]+6}" font-size="17" font-weight="700" fill="${C.red}">Fehler</text>`
    : `<line x1="${n[0]+24}" y1="${n[1]}" x2="${o[0]}" y2="${o[1]}" stroke="${col}" stroke-width="3.5" marker-end="url(#${mk})"/><text x="${o[0]+6}" y="${o[1]+6}" font-size="18" font-weight="700">4,3 kg</text>`;
  return s;
}
function slot(x, y, w, num) {
  return `<rect x="${x}" y="${y}" width="${w}" height="40" rx="10" fill="#fff" stroke="${C.acc}" stroke-width="2" stroke-dasharray="6 5"/>
  <circle cx="${x+22}" cy="${y+20}" r="14" fill="${C.acc}"/><text x="${x+22}" y="${y+26}" text-anchor="middle" fill="#fff" font-weight="800" font-size="17">${num}</text>`;
}
function card(x, y, w, h, num, inner, cap) {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${C.bg}" stroke="${C.line}" stroke-width="2"/>
  ${slot(x+14, y+14, w-28, num)}${inner}
  <text x="${x+w/2}" y="${y+h-16}" text-anchor="middle" font-size="15" fill="${C.soft}">${cap}</text></g>`;
}
// Kreislauf
function kreislauf() {
  const W = 1000, H = 620;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter" fill="${C.ink}">${arrowDefs}`;
  // 1 vorwärts
  s += card(20, 20, 320, 250, '1', peng('gentoo_1', 55, 215, 88) + net(110, 110, 'fwd'), 'Messwerte rein → Schätzung raus');
  // 2 Vergleich
  let v = '';
  const sx = 790, sy0 = 95, sy1 = 225; const ky = kg => sy1 - (kg - 2) / 5 * (sy1 - sy0);
  v += `<line x1="${sx}" y1="${sy0}" x2="${sx}" y2="${sy1}" stroke="${C.faint}" stroke-width="3"/>`;
  for (let k = 2; k <= 7; k++) v += `<line x1="${sx-6}" y1="${ky(k)}" x2="${sx+6}" y2="${ky(k)}" stroke="${C.faint}" stroke-width="2"/><text x="${sx-14}" y="${ky(k)+5}" text-anchor="end" font-size="13" fill="${C.faint}">${k}</text>`;
  v += `<circle cx="${sx}" cy="${ky(4.3)}" r="9" fill="${C.acc}"/><text x="${sx+22}" y="${ky(4.3)+6}" font-size="16" font-weight="700">Ist 4,3</text>`;
  v += `<circle cx="${sx}" cy="${ky(5.1)}" r="11" fill="none" stroke="${C.green}" stroke-width="3.5"/><text x="${sx+22}" y="${ky(5.1)+2}" font-size="16" font-weight="700" fill="${C.green}">Soll 5,1</text>`;
  v += `<path d="M${sx-34},${ky(5.1)} h-8 v${ky(4.3)-ky(5.1)} h8" fill="none" stroke="${C.red}" stroke-width="3"/><text x="${sx-48}" y="${(ky(4.3)+ky(5.1))/2+6}" text-anchor="end" font-size="16" font-weight="700" fill="${C.red}">0,8</text>`;
  v += peng('gentoo_2', 905, 228, 100, true);
  s += card(660, 20, 320, 250, '2', v, 'Ist und Soll nebeneinander');
  // 3 rückwärts
  s += card(660, 330, 320, 250, '3', net(700, 420, 'back') + `<text x="760" y="413" font-size="15" font-weight="700" fill="${C.red}">?</text><text x="760" y="508" font-size="15" font-weight="700" fill="${C.red}">?</text>`, 'Wer war wie stark schuld am Fehler?');
  // 4 Abstieg: Profil einer Mulde
  let p = '';
  const px = x => 40 + x, py = t => t;
  p += `<path d="M48,420 C95,420 120,535 190,540 C255,545 285,450 322,430" fill="none" stroke="${C.soft}" stroke-width="4"/>`;
  p += `<path d="M48,420 C95,420 120,535 190,540 C255,545 285,450 322,430 L322,560 L48,560 z" fill="${C.accD}" opacity=".55"/>`;
  p += peng('main', 95, 436, 46);
  p += `<path d="M110,410 Q135,380 158,505" fill="none" stroke="${C.acc}" stroke-width="3" stroke-dasharray="6 5" marker-end="url(#ah)"/>`;
  p += `<ellipse cx="160" cy="526" rx="14" ry="5" fill="none" stroke="${C.acc}" stroke-width="2.5"/>`;
  s += card(20, 330, 320, 250, '4', p, 'Alle Gewichte ein Stück bergab');
  // Pfeile im Kreis
  s += `<path d="M345,90 C450,40 550,40 655,90" fill="none" stroke="${C.faint}" stroke-width="5" marker-end="url(#ahg)"/>`;
  s += `<path d="M905,275 L905,325" fill="none" stroke="${C.faint}" stroke-width="5" marker-end="url(#ahg)"/>`;
  s += `<path d="M660,560 C600,610 400,610 340,560" fill="none" stroke="${C.faint}" stroke-width="5" marker-end="url(#ahg)"/>`;
  s += `<path d="M95,325 L95,275" fill="none" stroke="${C.faint}" stroke-width="5" marker-end="url(#ahg)"/>`;
  // Mitte: Spieler + Wiederholung
  s += `<circle cx="500" cy="200" r="70" fill="none" stroke="${C.line}" stroke-width="3" stroke-dasharray="4 7"/>`;
  s += peng('main', 500, 255, 105);
  s += `<text x="500" y="300" text-anchor="middle" font-size="16" font-weight="700" fill="${C.soft}">nächster Pinguin –</text><text x="500" y="320" text-anchor="middle" font-size="16" font-weight="700" fill="${C.soft}">viele Male wiederholen</text>`;
  // 5 Drehregler, hängt an 4
  const dx = 500, dy = 410;
  s += `<line x1="340" y1="470" x2="${dx-62}" y2="${dy+10}" stroke="${C.acc}" stroke-width="2.5" stroke-dasharray="5 5"/>`;
  s += `<rect x="${dx-150}" y="${dy-75}" width="300" height="165" rx="18" fill="#fff" stroke="${C.line}" stroke-width="2"/>`;
  s += slot(dx-136, dy-61, 272, '5');
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (1 - i / 10); s += `<line x1="${dx + Math.cos(a)*48}" y1="${dy+62 - Math.sin(a)*48}" x2="${dx + Math.cos(a)*58}" y2="${dy+62 - Math.sin(a)*58}" stroke="${C.faint}" stroke-width="${i%5?2:3.5}"/>`; }
  const a0 = Math.PI * 0.62; s += `<circle cx="${dx}" cy="${dy+62}" r="34" fill="${C.accD}" stroke="${C.ink}" stroke-width="2"/><line x1="${dx}" y1="${dy+62}" x2="${dx + Math.cos(a0)*30}" y2="${dy+62 - Math.sin(a0)*30}" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>`;
  s += `<text x="${dx-66}" y="${dy+80}" text-anchor="end" font-size="14" fill="${C.soft}">klein</text><text x="${dx+66}" y="${dy+80}" font-size="14" fill="${C.soft}">groß</text>`;
  s += `</svg>`; return s;
}
// Neuron zum Rechnen
function neuron() {
  const W = 1080, H = 300;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter" fill="${C.ink}">${arrowDefs}`;
  s += peng('gentoo_1', 62, 250, 170);
  const ins = [[390, 60, sub('x','1') + ' = 2', 'Flosse − 20 cm'], [390, 150, sub('x','2') + ' = 1', 'Schnabelhöhe − 14 mm'], [390, 240, '1', 'Bias: Eingang immer 1']];
  const n = [700, 150];
  const wl = [sub('w','1') + ' = 0,5', sub('w','2') + ' = 0,3', 'b = 3,0'];
  ins.forEach(([x, y, lab, cap], i) => {
    s += `<line x1="${x+44}" y1="${y}" x2="${n[0]-50}" y2="${n[1] + (y - n[1]) * 0.25}" stroke="${i===2?C.vi:C.or}" stroke-width="4" marker-end="url(#ahk)"/>`;
    s += `<rect x="${x-44}" y="${y-24}" width="88" height="48" rx="24" fill="#fff" stroke="${C.ink}" stroke-width="2.5"/><text x="${x}" y="${y+7}" text-anchor="middle" font-size="19" font-weight="700">${lab}</text>`;
    s += `<text x="${x-56}" y="${y+6}" text-anchor="end" font-size="15" fill="${C.soft}">${cap}</text>`;
    const mx = x + 44 + (n[0]-50 - x - 44) * 0.5, my = y + (n[1] + (y - n[1]) * 0.25 - y) * 0.5;
    s += `<rect x="${mx-58}" y="${my-34}" width="116" height="30" rx="8" fill="#fff" stroke="${i===2?C.vi:C.or}" stroke-width="2"/><text x="${mx}" y="${my-13}" text-anchor="middle" font-size="17" font-weight="700" fill="${i===2?C.vi:C.or}">${wl[i]}</text>`;
  });
  s += `<circle cx="${n[0]}" cy="${n[1]}" r="46" fill="${C.accD}" stroke="${C.ink}" stroke-width="3"/><text x="${n[0]}" y="${n[1]+14}" text-anchor="middle" font-size="40" font-weight="800">Σ</text>`;
  s += `<line x1="${n[0]+48}" y1="${n[1]}" x2="${n[0]+130}" y2="${n[1]}" stroke="${C.acc}" stroke-width="4" marker-end="url(#ah)"/>`;
  s += `<rect x="${n[0]+140}" y="${n[1]-36}" width="210" height="72" rx="14" fill="#fff" stroke="${C.acc}" stroke-width="3"/>`;
  s += `<text x="${n[0]+245}" y="${n[1]-6}" text-anchor="middle" font-size="18" font-weight="700">Schätzung = ? kg</text><text x="${n[0]+245}" y="${n[1]+22}" text-anchor="middle" font-size="16" fill="${C.green}" font-weight="700">echt: 5,1 kg</text>`;
  s += `<text x="${n[0]}" y="${n[1]+78}" text-anchor="middle" font-size="15" fill="${C.soft}">Neuron wie in Level 4</text>`;
  s += `</svg>`; return s;
}
// Welt (w1 | w2), b = 3,0 fest: Fehler für fünf Pinguine zusammen = Mulde
// Pinguine (x1, x2): (2,1) (0,2) (3,0) (1,3) (4,2), echt = 0,9·x1 + 0,3·x2 + 3,0 → tiefste Stelle (0,9 | 0,3)
function welt() {
  const W = 1000, H = 520, L = 90, R = 960, T = 30, B = 450;
  const x0 = 0, x1 = 2.5, y0 = -0.7, y1 = 1.3;
  const X = v => L + (v - x0) / (x1 - x0) * (R - L), Y = v => B - (v - y0) / (y1 - y0) * (B - T);
  const A = [[6, 2.6], [2.6, 3.6]], M = [0.9, 0.3];
  const Q = (u, v) => { const a = u - M[0], c = v - M[1]; return 0.5 * (A[0][0]*a*a + 2*A[0][1]*a*c + A[1][1]*c*c); };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter" fill="${C.ink}">${arrowDefs}`;
  s += `<clipPath id="cp"><rect x="${L}" y="${T}" width="${R-L}" height="${B-T}"/></clipPath><g clip-path="url(#cp)">`;
  const st = 5;
  for (let px = L; px < R; px += st) for (let py = T; py < B; py += st) {
    const u = x0 + (px + st/2 - L) / (R - L) * (x1 - x0), v = y1 - (py + st/2 - T) / (B - T) * (y1 - y0);
    const t = Math.min(1, Math.sqrt(Q(u, v) / 9));
    s += `<rect x="${px}" y="${py}" width="${st+0.6}" height="${st+0.6}" fill="hsl(${190 + 80*t}, 55%, ${95 - 22*t}%)"/>`;
  }
  // Gitter
  for (let v = 0; v <= 2.5001; v += 0.1) { const m = Math.abs(v*2 - Math.round(v*2)) < 1e-6; s += `<line x1="${X(v)}" y1="${T}" x2="${X(v)}" y2="${B}" stroke="#fff" stroke-opacity="${m?0.95:0.5}" stroke-width="${m?1.6:0.8}"/>`; }
  for (let v = -0.7; v <= 1.3001; v += 0.1) { const m = Math.abs(v*2 - Math.round(v*2)) < 1e-6; s += `<line x1="${L}" y1="${Y(v)}" x2="${R}" y2="${Y(v)}" stroke="#fff" stroke-opacity="${m?0.95:0.5}" stroke-width="${m?1.6:0.8}"/>`; }
  // Höhenlinien (Ellipsen)
  const tr = A[0][0] + A[1][1], det = A[0][0]*A[1][1] - A[0][1]**2, l1 = tr/2 + Math.sqrt(tr*tr/4 - det), l2 = tr/2 - Math.sqrt(tr*tr/4 - det);
  const e1 = [A[0][1], l1 - A[0][0]], n1 = Math.hypot(...e1); e1[0] /= n1; e1[1] /= n1; const e2 = [-e1[1], e1[0]];
  for (const c of [0.05, 0.2, 0.5, 1, 1.8, 3, 4.5, 6.5, 9, 12]) {
    const r1 = Math.sqrt(2*c/l1), r2 = Math.sqrt(2*c/l2); let d = '';
    for (let k = 0; k <= 96; k++) { const a = k / 96 * 2 * Math.PI, p = r1*Math.cos(a), q = r2*Math.sin(a);
      d += (k ? 'L' : 'M') + X(M[0] + p*e1[0] + q*e2[0]).toFixed(1) + ',' + Y(M[1] + p*e1[1] + q*e2[1]).toFixed(1); }
    s += `<path d="${d}z" fill="none" stroke="${C.soft}" stroke-opacity=".45" stroke-width="1.5"/>`;
  }
  s += `</g><rect x="${L}" y="${T}" width="${R-L}" height="${B-T}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  // tiefste Stelle
  s += `<circle cx="${X(M[0])}" cy="${Y(M[1])}" r="6" fill="${C.acc}"/><text x="${X(M[0])}" y="${Y(M[1])+28}" text-anchor="middle" font-size="16" font-weight="700" fill="${C.acc}">tiefste Stelle</text>`;
  // Achsen
  for (let v = 0; v <= 2.5001; v += 0.5) s += `<text x="${X(v)}" y="${B+26}" text-anchor="middle" font-size="17">${v.toFixed(1).replace('.', ',')}</text>`;
  for (let v = -0.6; v <= 1.2001; v += 0.2) s += `<text x="${L-10}" y="${Y(v)+6}" text-anchor="end" font-size="17">${(Math.abs(v)<1e-9?0:v).toFixed(1).replace('.', ',').replace('-', '−')}</text>`;
  s += `<text x="${(L+R)/2}" y="${B+58}" text-anchor="middle" font-size="20" font-weight="800" fill="${C.or}">${sub('w','1')} (Flosse) →</text>`;
  s += `<text x="26" y="${(T+B)/2}" text-anchor="middle" font-size="20" font-weight="800" fill="${C.or}" transform="rotate(-90 26 ${(T+B)/2})">${sub('w','2')} (Schnabel) →</text>`;
  // Start
  s += `<circle cx="${X(0.5)}" cy="${Y(0.3)}" r="8" fill="${C.ink}"/>` + peng('main', X(0.5), Y(0.3) - 6, 62);
  s += `<rect x="${X(0.5)-110}" y="${Y(0.3)-2}" width="86" height="26" rx="6" fill="#fff" opacity=".9"/><text x="${X(0.5)-104}" y="${Y(0.3)+17}" font-size="16" font-weight="700">Start</text>`;
  s += `<rect x="${R-226}" y="${T+10}" width="216" height="30" rx="8" fill="#fff" stroke="${C.line}"/><text x="${R-118}" y="${T+31}" text-anchor="middle" font-size="16" font-weight="700" fill="${C.soft}">fest: Bias b = 3,0</text>`;
  s += `</svg>`; return s;
}
// Nest-Diagramm
function nest(title) {
  const W = 500, H = 470, L = 70, R = 480, T = 60, B = 410;
  const X = v => L + (v + 1.6) / 3.2 * (R - L), Y = v => B - (v + 1.6) / 3.2 * (B - T);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter" fill="${C.ink}">${arrowDefs}`;
  s += `<text x="${(L+R)/2}" y="32" text-anchor="middle" font-size="22" font-weight="800">${title}</text>`;
  s += `<rect x="${L}" y="${T}" width="${R-L}" height="${B-T}" rx="10" fill="${C.bg}" stroke="${C.line}" stroke-width="2"/>`;
  s += `<line x1="${X(0)}" y1="${T+6}" x2="${X(0)}" y2="${B-6}" stroke="${C.line}" stroke-width="2"/><line x1="${L+6}" y1="${Y(0)}" x2="${R-6}" y2="${Y(0)}" stroke="${C.line}" stroke-width="2"/>`;
  const ns = [[1, -1, 'nest_mama', true, 'nur Mama'], [-1, 1, 'nest_papa', true, 'nur Papa'], [1, 1, 'nest_beide', false, 'beide'], [-1, -1, 'nest', false, 'keiner']];
  for (const [m, p, img, ok, lab] of ns) {
    const cx = X(m), cy = Y(p);
    s += `<rect x="${cx-68}" y="${cy-54}" width="136" height="108" rx="14" fill="#fff" stroke="${ok?C.green:C.red}" stroke-width="${ok?4:2.5}" ${ok?'':'stroke-dasharray="7 5"'}/>`;
    s += `<image href="${uri(img)}" x="${cx-50}" y="${cy-48}" width="100" height="72" preserveAspectRatio="xMidYMid meet"/>`;
    s += `<text x="${cx}" y="${cy+42}" text-anchor="middle" font-size="13" font-weight="700" fill="${ok?C.green:C.red}">${lab} · ${ok?'Ei ok':'nicht ok'}</text>`;
  }
  s += `<text x="${(L+R)/2}" y="${B+30}" text-anchor="middle" font-size="16" fill="${C.soft}">Mama: fischt (−1) ←  → am Nest (+1)</text>`;
  s += `<text x="${L-18}" y="${(T+B)/2}" text-anchor="middle" font-size="16" fill="${C.soft}" transform="rotate(-90 ${L-18} ${(T+B)/2})">Papa: fischt (−1) ←  → am Nest (+1)</text>`;
  s += `</svg>`; return s;
}
function kopf() { // Pinguin für den Kopf
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">${peng('main', 120, 196, 190)}${peng('chin_1', 235, 196, 120, true)}</svg>`;
}
const jobs = { kreislauf: kreislauf(), neuron: neuron(), welt: welt(), nest6: nest('Level 6: ein Neuron'), nest7: nest('Level 7: zwei Neuronen'), kopf: kopf() };
const b = await chromium.launch(); const pg = await b.newPage({ deviceScaleFactor: 3 });
for (const [k, svg] of Object.entries(jobs)) {
  await pg.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await pg.waitForTimeout(150);
  await pg.locator('svg').first().screenshot({ path: `${k}.png`, omitBackground: true });
}
await b.close(); console.log('ok');
