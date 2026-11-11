/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — Die 40 Wesen (creatures.js)
   ══════════════════════════════════════════════════════════════

   Fassung 3 (November 2026): dieselben 40 Wesen, neu gezeichnet —
   jedes mit einem eigenen Typ, den man im Gesicht sieht (gesicht(),
   weiter unten). Skelett und Bewegungen sind die von Fassung 2.

   Fassung 2 (Oktober 2026). Die erste Fassung kam als fertige
   SVG-Körper aus dem Showroom. Jedes Wesen war anders gebaut, und
   die Bewegungen in creatures.css suchten Teile, die es im Körper
   gar nicht gab (`.t-wave-1`, `.gills`, `.wing-r` …) — dann bewegte
   sich schlicht nichts. Andere hingen lose am Körper oder ragten
   oben aus dem Kasten und wurden abgeschnitten.

   Jetzt hat jedes Wesen DASSELBE Skelett, und creatures.css bewegt
   nur dieses Skelett:

     svg.creature-svg
       ellipse.cr-shadow           Schatten am Boden (bleibt unten)
       g.cr-root                   der ganze Körper (Sprung, Gehen, Fallen)
         g.cr-behind               Schwanz, Flügel hinten
         g.leg-l / g.leg-r         Beine
         g.body-base               Rumpf (atmet)
           g.head-node             Kopf (nickt, neigt sich)
             g.face                Gesicht — alle Zustände (s. face())
             g.backside            nur in der Rückansicht zu sehen
         g.arm-l / g.arm-r         Arme, Flossen, Zangen
         g.cr-front / g.cr-fx      Dinge davor, Funkeln
       g.cr-ov                     Zzz, Konfetti, Sterne … (bleiben stehen)

   Jede Gruppe bekommt ihren Drehpunkt hier mit (style=transform-origin),
   damit ein Arm an der Schulter dreht und nicht irgendwo im Raum.

   Die Gesichter kommen alle aus face(): offen, fröhlich, schlafend,
   traurig, schwindlig; Mund normal, offen, traurig, schnarchend, „oh".
   Welcher Zustand zu sehen ist, entscheidet creatures.css über die
   Klasse am SVG (`state-cheer` …).

   Ids, Namen und die Reihenfolge der drei Farbfassungen sind die
   alten: Wesen und Farbe stehen als Zahl in der Datenbank
   (ks_participants.creature_id / skin_idx).

   Zeichenregeln (damit es nicht wieder „hakelig" wird):
     * Alles liegt im Kasten 0…100 — nichts ragt hinaus. Der Kasten
       um ein Wesen schneidet ab (tool.css), nur der Sprung darf raus.
     * Boden ist y = 92. Füße enden dort.
     * Eine Linienfarbe (--ink), Rundungen an allen Ecken.
     * Glanz oben links, Schatten unten rechts.
   ══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── Zeichenwerkzeug ──────────────────────────────────────── */
  const INK = 'var(--ink)';
  const ST = w => ' stroke="' + INK + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"';
  const at = (w, x) => (w ? ST(w) : '') + (x ? ' ' + x : '');

  const P = (d, fill, w, x) => '<path d="' + d + '" fill="' + fill + '"' + at(w === undefined ? 3 : w, x) + '/>';
  const E = (cx, cy, rx, ry, fill, w, x) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + at(w === undefined ? 3 : w, x) + '/>';
  const C = (cx, cy, r, fill, w, x) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"' + at(w === undefined ? 3 : w, x) + '/>';
  const R = (x0, y0, w0, h0, r, fill, w, x) => '<rect x="' + x0 + '" y="' + y0 + '" width="' + w0 + '" height="' + h0 + '" rx="' + r + '" fill="' + fill + '"' + at(w === undefined ? 3 : w, x) + '/>';
  /* Linie ohne Füllung in beliebiger Farbe */
  const L = (d, col, w, x) => '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (x ? ' ' + x : '') + '/>';
  /* Röhre mit Umriss: Arme, Beine, Schwänze */
  const tube = (d, col, w) => L(d, INK, w + 3) + L(d, col, w);
  /* Glanz und Schatten */
  const shine = (d, w, o) => L(d, '#fff', w || 2.6, 'opacity="' + (o || 0.6) + '"');
  const hl = (cx, cy, r, o) => C(cx, cy, r, '#fff', 0, 'opacity="' + (o || 0.75) + '"');
  const shade = (d, o) => P(d, INK, 0, 'opacity="' + (o || 0.13) + '"');
  /* Vierzackiger Funkelstern; mit cls="tw" funkelt er (creatures.css) */
  const star = (x, y, s, fill, x2) => {
    const k = s * 0.22;
    return '<path d="M ' + x + ' ' + (y - s) + ' Q ' + (x + k) + ' ' + (y - k) + ' ' + (x + s) + ' ' + y
      + ' Q ' + (x + k) + ' ' + (y + k) + ' ' + x + ' ' + (y + s)
      + ' Q ' + (x - k) + ' ' + (y + k) + ' ' + (x - s) + ' ' + y
      + ' Q ' + (x - k) + ' ' + (y - k) + ' ' + x + ' ' + (y - s) + ' Z" fill="' + fill + '"' + (x2 ? ' ' + x2 : '') + '/>';
  };
  const tw = (x, y, s, fill, delay) => star(x, y, s, fill, 'class="tw" stroke="' + INK + '" stroke-width=".7" stroke-linejoin="round" style="animation-delay:' + (delay || 0) + 's"');
  const G = (cls, origin, inner, x) => '<g class="' + cls + '"'
    + (origin ? ' style="transform-origin:' + origin[0] + 'px ' + origin[1] + 'px"' : '')
    + (x ? ' ' + x : '') + '>' + inner + '</g>';
  /* Spiegeln an der Mittelachse (x → 100 − x) — für linke/rechte Teile */
  const mirror = d => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,
    (m, a, b) => (Math.round((100 - parseFloat(a)) * 100) / 100) + ' ' + b);

  /* ── Gesichter ─────────────────────────────────────────────
     f = { type, lx, rx, y, r, my, mw, mx, col, mouth, blush, lid, … }
       type  dot     dunkle Knopfaugen mit Glanz (Standard)
             ring    weißer Augapfel, Pupille
             screen  leuchtende Pixel-/Bildschirmaugen (col)
             glow    glühende Augen (col) für Gespenster
             cyc     ein großes Auge in der Mitte (cx, r, iris)
       col   Farbe für Linien der Zustände (Standard: --ink)
       lid   Farbe eines Oberlids (schläfriger Blick)
       mouth 'smile' | 'cat' | 'line'
       extra Nase, Schnurrhaare … (gehört zum Gesicht, verschwindet
             in der Rückansicht mit)                                  */
  function face(f) {
    if (!f) return '';
    const t = f.type || 'dot';
    const r = f.r || 5.5;
    const y = f.y;
    const col = f.col || INK;
    const eyes = t === 'cyc' ? [f.cx || 50] : [f.lx, f.rx];
    const out = [];

    const open = (x, i) => {
      if (t === 'button') {
        const bc = (f.bcols || ['#fff', '#fff'])[i || 0];
        return C(x, y, r, bc, 2.4) + C(x - r * 0.3, y - r * 0.3, 0.9, INK, 0) + C(x + r * 0.3, y - r * 0.3, 0.9, INK, 0)
          + C(x - r * 0.3, y + r * 0.3, 0.9, INK, 0) + C(x + r * 0.3, y + r * 0.3, 0.9, INK, 0)
          + L('M ' + (x - r * 0.3) + ' ' + (y - r * 0.3) + ' L ' + (x + r * 0.3) + ' ' + (y + r * 0.3) + ' M ' + (x + r * 0.3) + ' ' + (y - r * 0.3) + ' L ' + (x - r * 0.3) + ' ' + (y + r * 0.3), INK, 1)
          + hl(x - r * 0.5, y - r * 0.55, r * 0.18, 0.9);
      }
      if (t === 'ring') {
        return E(x, y, r, r * 1.08, '#fff', 2.2)
          + C(x, y + r * 0.12, r * 0.56, f.pupil || INK, 0, 'class="pupil"')
          + hl(x - r * 0.18, y - r * 0.2, r * 0.22, 0.95);
      }
      if (t === 'screen') {
        return R(x - r * 0.95, y - r * 1.35, r * 1.9, r * 2.7, r * 0.7, col, 0, 'opacity=".28"')
          + R(x - r * 0.6, y - r, r * 1.2, r * 2, r * 0.4, col, 0)
          + R(x - r * 0.38, y - r * 0.75, r * 0.4, r * 0.55, 0.4, '#fff', 0, 'opacity=".8"');
      }
      if (t === 'glow') {
        return E(x, y, r * 1.25, r * 1.45, col, 0, 'opacity=".3" class="glow"')
          + E(x, y, r * 0.8, r, col, 0)
          + E(x, y - r * 0.1, r * 0.32, r * 0.48, '#fff', 0);
      }
      if (t === 'cyc') {
        return C(x, y, r, '#fff', 2.6)
          + C(x, y + r * 0.08, r * 0.62, f.iris || '#38bdf8', 2)
          + C(x, y + r * 0.1, r * 0.3, INK, 0, 'class="pupil"')
          + hl(x - r * 0.3, y - r * 0.3, r * 0.18, 0.95)
          + hl(x + r * 0.22, y + r * 0.32, r * 0.08, 0.9);
      }
      // ew/hl (optional): Augenbreite und Glanzpunkt, nur die Kistenturm-Figuren.
      // Dort sitzt der Glanz IMMER ganz im Auge (vorher ragte er bei schmalen
      // Augen über den Rand — klein sah das aus wie ein verrutschter Fleck).
      const ew = f.ew || 0.8, hs = f.hl || 0.34;
      if (f.hl) {
        const rx = r * ew, h = Math.min(hs * r, 0.44 * rx);
        return E(x, y, rx, r, INK, 0)
          + hl(x - 0.24 * rx, y - 0.34 * r, h, 1)
          + hl(x + 0.3 * rx, y + 0.42 * r, Math.min(0.16 * r, 0.2 * rx), 0.85);
      }
      return E(x, y, r * ew, r, INK, 0)
        + hl(x - r * 0.26 * ew / 0.8, y - r * 0.4, r * hs, 0.95)
        + hl(x + r * 0.26 * ew / 0.8, y + r * 0.38, r * 0.15, 0.85)
        + (f.glint ? C(x + r * 0.3, y + r * 0.42, r * 0.18, f.glint, 0) : '');
    };
    const lw = t === 'cyc' ? 3.2 : 2.6;
    const happy = x => L('M ' + (x - r * 0.9) + ' ' + (y + r * 0.25) + ' Q ' + x + ' ' + (y - r * 1.05) + ' ' + (x + r * 0.9) + ' ' + (y + r * 0.25), col, lw);
    const sleep = x => L('M ' + (x - r * 0.9) + ' ' + y + ' Q ' + x + ' ' + (y + r * 0.75) + ' ' + (x + r * 0.9) + ' ' + y, col, lw)
      + (t === 'cyc' ? L('M ' + (x - r * 0.4) + ' ' + (y + r * 0.45) + ' l -1.5 3 M ' + x + ' ' + (y + r * 0.6) + ' l 0 3.2 M ' + (x + r * 0.4) + ' ' + (y + r * 0.45) + ' l 1.5 3', col, 1.6) : '');
    const sad = (x, side) => {
      const brow = 'M ' + (x - side * r * 0.95) + ' ' + (y - r * 1.05) + ' L ' + (x + side * r * 0.75) + ' ' + (y - r * 1.65);
      let eye;
      if (t === 'screen' || t === 'glow') {
        eye = R(x - r * 0.6, y - r * 0.2, r * 1.2, r * 1.05, r * 0.4, col, 0);
      } else if (t === 'cyc') {
        eye = C(x, y, r, '#fff', 2.6) + C(x, y + r * 0.3, r * 0.55, f.iris || '#38bdf8', 2)
          + C(x, y + r * 0.32, r * 0.26, INK, 0)
          + P('M ' + (x - r - 1) + ' ' + y + ' A ' + (r + 1) + ' ' + (r + 1) + ' 0 0 1 ' + (x + r + 1) + ' ' + y + ' Z', f.lid || 'var(--c1)', 2.2);
      } else if (t === 'ring') {
        eye = E(x, y + 0.5, r * 0.95, r, '#fff', 2.2) + C(x, y + r * 0.35, r * 0.55, INK, 0)
          + hl(x - r * 0.15, y + r * 0.1, r * 0.22, 0.95);
      } else {
        eye = E(x, y + r * 0.15, r * 0.78, r * 0.88, INK, 0)
          + hl(x - r * 0.22, y - r * 0.2, r * 0.42, 0.95)
          + hl(x + r * 0.28, y + r * 0.45, r * 0.18, 0.85);
      }
      return eye + L(t === 'cyc' ? 'M ' + (x - r) + ' ' + (y - r * 1.25) + ' Q ' + x + ' ' + (y - r * 1.6) + ' ' + (x + r) + ' ' + (y - r * 1.05) : brow, col, 2.2);
    };
    const dizzy = x => {
      const s = r / 3.4;
      return L('M ' + (x - 0.5 * s) + ' ' + y + ' a ' + (0.5 * s) + ' ' + (0.5 * s) + ' 0 1 1 ' + s + ' 0'
        + ' a ' + (1.25 * s) + ' ' + (1.25 * s) + ' 0 1 1 ' + (-2.5 * s) + ' 0'
        + ' a ' + (2 * s) + ' ' + (2 * s) + ' 0 1 1 ' + (4 * s) + ' 0'
        + ' a ' + (2.75 * s) + ' ' + (2.75 * s) + ' 0 1 1 ' + (-5.5 * s) + ' 0', col, 1.6);
    };
    /* Oberlid: unten leicht nach unten gewölbt — müde, nicht grimmig */
    const lid = x => {
      if (!f.lid) return '';
      const a = (x - r - 0.6) + ' ' + (y - r * 0.15), b = (x + r + 0.6) + ' ' + (y - r * 0.15);
      const q = ' Q ' + x + ' ' + (y + r * 0.42) + ' ';
      return P('M ' + a + q + b + ' A ' + (r + 0.6) + ' ' + (r + 0.9) + ' 0 0 0 ' + a + ' Z', f.lid, 0)
        + L('M ' + a + q + b, INK, 1.8);
    };

    out.push('<g class="e-open">' + eyes.map((x, i) => open(x, i) + lid(x)).join('') + '</g>');
    out.push('<g class="e-happy">' + eyes.map(happy).join('') + '</g>');
    out.push('<g class="e-sleep">' + eyes.map(sleep).join('') + '</g>');
    out.push('<g class="e-sad">' + eyes.map((x, i) => sad(x, eyes.length === 1 ? 1 : (i === 0 ? 1 : -1))).join('') + '</g>');
    out.push('<g class="e-dizzy">' + eyes.map(dizzy).join('') + '</g>');

    if (f.blush !== false) {
      const by = t === 'cyc' ? y + r * 0.95 : y + r + 3;
      const bx = t === 'cyc' ? [eyes[0] - r * 1.25, eyes[0] + r * 1.25] : [f.lx - r * 0.45, f.rx + r * 0.45];
      out.push(bx.map(x => E(x, by, 3.6, 2.1, f.bcol || '#ff6f9f', 0, 'opacity=".5"')).join(''));
    }
    if (f.extra) out.push(f.extra);

    if (f.mouths) {
      /* eigene Münder (Schnabel …): { normal, open, sad, sleep, wow } */
      ['normal', 'open', 'sad', 'sleep', 'wow'].forEach(k => out.push('<g class="m-' + k + '">' + (f.mouths[k] || f.mouths.normal) + '</g>'));
    } else if (f.my !== undefined) {
      const mx = f.mx || 50, my = f.my, mw = f.mw || 4.5;
      const mf = f.mfill || (t === 'screen' || t === 'glow' ? col : INK);
      const tongue = mf === INK ? E(mx, my + mw * 0.82, mw * 0.46, mw * 0.3, '#ff6f91', 0) : '';
      let normal;
      if (f.mouth === 'cat') normal = 'M ' + (mx - mw) + ' ' + my + ' Q ' + (mx - mw / 2) + ' ' + (my + mw * 0.75) + ' ' + mx + ' ' + my + ' Q ' + (mx + mw / 2) + ' ' + (my + mw * 0.75) + ' ' + (mx + mw) + ' ' + my;
      else if (f.mouth === 'line') normal = 'M ' + (mx - mw) + ' ' + my + ' L ' + (mx + mw) + ' ' + my;
      else normal = 'M ' + (mx - mw) + ' ' + my + ' Q ' + mx + ' ' + (my + mw * 0.85) + ' ' + (mx + mw) + ' ' + my;
      const mc = f.mcol || col;
      out.push('<g class="m-normal">' + L(normal, mc, 2.4) + '</g>');
      out.push('<g class="m-open">' + P('M ' + (mx - mw) + ' ' + (my - 0.6) + ' Q ' + mx + ' ' + (my + mw * 1.6) + ' ' + (mx + mw) + ' ' + (my - 0.6) + ' Z', mf, 2.2) + tongue + '</g>');
      out.push('<g class="m-sad">' + L('M ' + (mx - mw * 0.8) + ' ' + (my + mw * 0.55) + ' Q ' + mx + ' ' + (my - mw * 0.45) + ' ' + (mx + mw * 0.8) + ' ' + (my + mw * 0.55), mc, 2.4) + '</g>');
      out.push('<g class="m-sleep">' + E(mx, my + 0.8, 1.5, 1.9, mf, 0) + '</g>');
      out.push('<g class="m-wow">' + E(mx, my + 1, 2.3, 2.9, mf, 1.6) + '</g>');
    }

    /* Tränen: unter jedem Auge ein Tropfen */
    const ty = t === 'cyc' ? y + r + 1 : y + r + 0.5;
    out.push('<g class="cr-tears">' + eyes.map((x, i) => {
      const tx = t === 'cyc' ? x + (i ? r * 0.6 : -r * 0.6) : x + r * 0.35;
      return P('M ' + tx + ' ' + ty + ' C ' + (tx - 2.3) + ' ' + (ty + 3.6) + ' ' + (tx - 2.3) + ' ' + (ty + 5.6) + ' ' + tx + ' ' + (ty + 5.6)
        + ' C ' + (tx + 2.3) + ' ' + (ty + 5.6) + ' ' + (tx + 2.3) + ' ' + (ty + 3.6) + ' ' + tx + ' ' + ty + ' Z', '#6cc8ff', 0,
        'stroke="#2b7bd6" stroke-width=".8" class="tear" style="animation-delay:' + (i * 0.45) + 's"');
    }).join('') + (t === 'cyc' ? P('M ' + (eyes[0] + r * 0.6) + ' ' + ty + ' C ' + (eyes[0] + r * 0.6 - 2.3) + ' ' + (ty + 3.6) + ' ' + (eyes[0] + r * 0.6 - 2.3) + ' ' + (ty + 5.6) + ' ' + (eyes[0] + r * 0.6) + ' ' + (ty + 5.6) + ' C ' + (eyes[0] + r * 0.6 + 2.3) + ' ' + (ty + 5.6) + ' ' + (eyes[0] + r * 0.6 + 2.3) + ' ' + (ty + 3.6) + ' ' + (eyes[0] + r * 0.6) + ' ' + ty + ' Z', '#6cc8ff', 0, 'stroke="#2b7bd6" stroke-width=".8" class="tear" style="animation-delay:.45s"') : '') + '</g>');

    return '<g class="face">' + out.join('') + '</g>';
  }

  /* ── Was über dem Wesen erscheint ───────────────────────────
     Steht AUSSERHALB von cr-root: Zzz und Regenwolke sollen nicht
     mitspringen. Position je Wesen über o.zz / o.cl / o.dz.      */
  function overlays(o) {
    const zz = o.zz || [72, 24], cl = o.cl || [79, 13], dz = o.dz || [70, 34];
    const conf = ['#ff4f8b', '#ffd23f', '#38bdf8', '#34d399', '#a78bfa', '#fb923c', '#ff4f8b', '#38bdf8'];
    const zText = (dx, dy, s, i) => '<text class="z z' + i + '" x="' + (zz[0] + dx) + '" y="' + (zz[1] + dy) + '" font-size="' + s + '">' + (i === 3 ? 'Z' : 'z') + '</text>';
    return '<g class="cr-ov">'
      + '<g class="cr-zzz">' + zText(-2, 8, 10, 1) + zText(5, -1, 13, 2) + zText(12, -10, 16, 3) + '</g>'
      + '<g class="cr-cloud">'
      +   '<g class="cloud-bob">' + P('M ' + (cl[0] - 10) + ' ' + (cl[1] + 3) + ' C ' + (cl[0] - 14) + ' ' + (cl[1] + 3) + ' ' + (cl[0] - 14) + ' ' + (cl[1] - 4) + ' ' + (cl[0] - 9) + ' ' + (cl[1] - 4)
      +     ' C ' + (cl[0] - 8) + ' ' + (cl[1] - 10) + ' ' + (cl[0] + 1) + ' ' + (cl[1] - 11) + ' ' + (cl[0] + 3) + ' ' + (cl[1] - 6)
      +     ' C ' + (cl[0] + 9) + ' ' + (cl[1] - 9) + ' ' + (cl[0] + 14) + ' ' + (cl[1] - 3) + ' ' + (cl[0] + 10) + ' ' + (cl[1] + 3) + ' Z', '#8e9bb5', 2) + '</g>'
      +   [-6, 0, 6].map((dx, i) => L('M ' + (cl[0] + dx) + ' ' + (cl[1] + 6) + ' l -1 3', '#4aa8ff', 1.8, 'class="rain" style="animation-delay:' + (i * 0.22) + 's"')).join('')
      + '</g>'
      + '<g class="cr-confetti">' + conf.map((c, i) => R(8 + i * 11.5, 2 + (i % 3) * 3, 3, 4.6, 0.8, c, 0, 'class="cf" style="animation-delay:' + (-(i * 0.17)).toFixed(2) + 's"')).join('') + '</g>'
      + '<g class="cr-notes"><text class="note n1" x="12" y="30" font-size="13">♪</text><text class="note n2" x="80" y="24" font-size="13">♫</text></g>'
      + '<g class="cr-stars">' + [0, 1, 2].map(i => star(dz[0], dz[1], 3.6, '#ffd23f', 'class="dz dz' + i + '" stroke="' + INK + '" stroke-width="1"')).join('') + '</g>'
      + '<g class="cr-dust">' + [[30, -1], [22, 1], [70, -1], [78, 1]].map((p, i) => C(p[0], 89, 4 + (i % 2), '#d9d3c7', 1.2, 'class="puff p' + i + '" stroke-opacity=".5"')).join('') + '</g>'
      + '<g class="cr-burst">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
          const rad = a * Math.PI / 180;
          return star(50, 50, i % 2 ? 3 : 4.5, i % 2 ? '#fff' : 'var(--fx, #ffd23f)', 'class="bs" style="--bx:' + (Math.cos(rad) * 44).toFixed(1) + 'px;--by:' + (Math.sin(rad) * 40).toFixed(1) + 'px;animation-delay:' + (i % 2 * 0.12) + 's" stroke="' + INK + '" stroke-width=".8"');
        }).join('') + '</g>'
      + '</g>';
  }

  /* ── Eigene Emotes je Wesen ──────────────────────────────────
     Je Emote gibt es in creatures.css sechs Körper-Bewegungen (r),
     sechs Arm-Bewegungen (a) und vier Kopf-Bewegungen (h). Die
     Verteilung: r = (id + Versatz) % 6 und a = (id / 6 + Schritt · r) % 6.
     Weil r die Stelle innerhalb der Sechsergruppe festlegt und a dann
     die Gruppe, bekommen die Wesen 0…35 bei JEDEM Emote eine andere
     Körper-und-Arm-Kombination. Versatz und Schritt sind je Emote
     andere — wer beim Tanzen die Pirouette hat, hat beim Jubeln
     nicht auch die „dritte" Bewegung. Dazu ein eigenes Tempo.
     Die Namen braucht nur der Showroom.

     Seit Oktober 2026 sind es 40 Wesen, aber es gibt nur 6 × 6
     Körper-und-Arm-Kombinationen. Die Wesen 36…39 teilen sich ihre
     Kombination mit 0…3 — sie unterscheiden sich in Kopf (+2) und
     Tempo, also nie in allen drei.                                 */
  const MOVES = [
    { k: 'D', v: 'da', off: 0, step: 1, name: 'Tanzen',
      r: ['Hüftschwung', 'Abtauchen', 'Moonwalk', 'Pirouette', 'Pogo', 'Shimmy'],
      a: ['Arme im Wechsel', 'Disco-Zeigen', 'Windmühle', 'Posen', 'Welle', 'Roboter'],
      h: ['Kopf wiegen', 'Kopf nicken', 'Kopf schieben', 'Kopf kreisen'] },
    { k: 'C', v: 'ch', off: 2, step: 2, name: 'Jubeln',
      r: ['Hüpfen', 'Hampelmann', 'Ducken & Strecken', 'Drehhüpfer', 'Zappeln', 'Freudensprung'],
      a: ['Arme hoch', 'Siegerfaust', 'Abwechselnd pumpen', 'Arme weit auf', 'Über Kopf schwenken', 'Propeller'],
      h: ['', 'nickt', 'neigt den Kopf', 'wackelt mit dem Kopf'] },
    { k: 'W', v: 'wv', off: 4, step: 3, name: 'Winken',
      r: ['lehnt sich', 'Zehenspitzen', 'hüpft', 'tritt hin und her', 'schüchtern', 'Verbeugung'],
      a: ['rechts', 'links', 'beidhändig', 'großer Bogen', 'klein & schüchtern', 'Rufen'],
      h: ['Kopf wiegen', 'nickt', 'Kopf schief', 'Kopf schieben'] },
    { k: 'J', v: 'ju', off: 1, step: 4, name: 'Springen',
      r: ['Hochsprung', 'Salto', 'Doppelsprung', 'Schraube', 'Rakete', 'Trampolin'],
      a: ['Arme hoch', 'flattert', 'Superheld', 'Stern', 'Windmühle', 'Kerze'],
      h: ['', 'nickt', 'neigt den Kopf', 'wackelt mit dem Kopf'] },
    { k: 'S', v: 'sa', off: 3, step: 5, name: 'Traurig',
      r: ['wiegt sich', 'schluchzt', 'sackt zusammen', 'kickt ein Steinchen', 'seufzt', 'schaukelt'],
      a: ['Arme hängen', 'Hände vors Gesicht', 'Tränen wischen', 'Arme baumeln', 'umarmt sich', 'Hand an die Stirn'],
      h: ['Kopf hängt', 'schüttelt den Kopf', 'schnieft', 'schaut auf'] }
  ];
  const TEMPO = [0.86, 0.93, 1, 1.08, 1.16];

  function moves(id) {
    const q = Math.floor(id / 6);
    return MOVES.map((m, e) => {
      const r = (id + m.off) % 6;
      return { emote: m.name, k: m.k, v: m.v, r: r, a: (q + m.step * r) % 6,
        h: (q * 2 + id + e + (id >= 36 ? 2 : 0)) % 4, tp: TEMPO[(id * 3 + e * 2) % 5] };
    });
  }
  function movesAttr(id) {
    const mv = moves(id);
    return {
      attr: mv.map(m => m.k + 'r' + m.r + ' ' + m.k + 'a' + m.a + ' ' + m.k + 'h' + m.h).join(' '),
      vars: mv.map(m => '--tp-' + m.v + ':' + m.tp).join(';')
    };
  }
  /* Für den Showroom: „Pirouette · Windmühle · Kopf kreisen" */
  function moveNames(id, emote) {
    const key = { dance: 'D', cheer: 'C', wave: 'W', jump: 'J', sad: 'S' }[emote];
    const m = moves(id | 0).find(x => x.k === key);
    if (!m) return '';
    const d = MOVES.find(x => x.k === key);
    return [d.r[m.r], d.a[m.a], d.h[m.h]].filter(Boolean).join(' · ');
  }

  /* ── Das Skelett ───────────────────────────────────────────── */
  const ORIGIN = { al: [30, 60], ar: [70, 60], ll: [40, 84], lr: [60, 84], head: [50, 70] };

  function build(id, skinIdx, emoteClass, sizePx) {
    return buildDef(DEFS[id] || DEFS[0], skinIdx, emoteClass, sizePx, id, CREATURES[id].gruppe);
  }
  /* Baut eine Figur aus einer Beschreibung wie in DEFS — auch für
     Figuren außerhalb dieser Datei (MPSkills/Savanne/tiere.js).    */
  function buildDef(d, skinIdx, emoteClass, sizePx, id, gruppe) {
    id = id || 0;
    const pal = d.pal[skinIdx] || d.pal[0];
    const o = Object.assign({}, ORIGIN, d.o || {});
    const mv = movesAttr(id);
    const vars = pal.map((c, i) => '--c' + (i + 1) + ':' + c).join(';')
      + ';--cr-d:' + (-((id * 1.37) % 4)).toFixed(2) + 's'
      + ';' + mv.vars
      + (d.vars ? ';' + d.vars : '')
      + (sizePx ? ';width:' + sizePx + 'px;height:' + sizePx + 'px' : '');

    let head = d.head || '';
    const fc = face(d.face);
    head = head.indexOf('{FACE}') >= 0 ? head.replace('{FACE}', fc) : head + fc;
    head += '<g class="backside">' + (d.back || '') + '</g>' + (d.headTop || '');

    return '<svg class="creature-svg ' + (emoteClass || 'c-idle') + '" viewBox="0 0 100 100" data-cid="' + id + '" data-g="' + (gruppe || '') + '" data-mv="' + mv.attr + '" style="' + vars + '">'
      + '<ellipse class="cr-shadow" cx="50" cy="92.4" rx="' + (d.shadow || 22) + '" ry="3.2"/>'
      + '<g class="cr-root">'
      +   '<g class="cr-behind">' + (d.behind || '') + '</g>'
      +   G('leg-l', o.ll, d.legL || '') + G('leg-r', o.lr, d.legR || '')
      +   '<g class="body-base">' + (d.body || '') + G('head-node', o.head, head) + '</g>'
      +   G('arm-l', o.al, d.armL || '') + G('arm-r', o.ar, d.armR || '')
      +   '<g class="cr-front">' + (d.front || '') + '</g>'
      +   '<g class="cr-fx">' + (d.fx || '') + '</g>'
      + '</g>'
      + overlays(o)
      + '</svg>';
  }

  /* ══════════════════════════════════════════════════════════
     Die 40 Wesen (0…35 seit Fassung 2, 36…39 neu im Oktober 2026,
     alle neu gezeichnet in Fassung 3)
     ══════════════════════════════════════════════════════════
     `skins` sind die Namen der drei Farbfassungen (stehen auf den
     Farbknöpfen). `pal` in derselben Reihenfolge: --c1 … --c6.    */
  const CREATURES = [
    { id: 0, name: "Puddl", gruppe: "absurd", skins: ["Neon Slime","Toxic Lime","Ocean Slime"] },
    { id: 1, name: "Spark", gruppe: "animal", skins: ["Elektro Violett","Solar Gold","Midnight Shadow"] },
    { id: 2, name: "Plop", gruppe: "animal", skins: ["Klassik Moos","Poison Dart","Golden Toad"] },
    { id: 3, name: "Bubbles", gruppe: "animal", skins: ["Cyan Splash","Koralle Pop","Deep Abyss"] },
    { id: 4, name: "Snooze", gruppe: "animal", skins: ["Honigbraun","Polarbär","Panda Bicolor"] },
    { id: 5, name: "Beep", gruppe: "tech", skins: ["Gameboy Classic","Cyberpunk Neon","Arcade Red"] },
    { id: 6, name: "Chompy", gruppe: "animal", skins: ["Lava Orange","Frost Drache","Jade Drache"] },
    { id: 7, name: "Nubi", gruppe: "nature", skins: ["Himmelblau","Sonnenuntergang","Gewitterlila"] },
    { id: 8, name: "Zorp", gruppe: "magic", skins: ["Alien Lime","Marsianer Rot","Void Purple"] },
    { id: 9, name: "Lotti", gruppe: "animal", skins: ["Bubblegum Pink","Albino Pearl","Neon Mint"] },
    { id: 10, name: "Grumbl", gruppe: "nature", skins: ["Granit & Smaragd","Vulkan & Rubin","Amethyst Höhle"] },
    { id: 11, name: "Mochi", gruppe: "absurd", skins: ["Erdbeer Sahne","Matcha Creme","Schoko Vanille"] },
    { id: 12, name: "Sprout", gruppe: "nature", skins: ["Rote Bete","Goldene Rübe","Mystische Alraune"] },
    { id: 13, name: "Bzz", gruppe: "animal", skins: ["Klassik Honig","Neon Wasp","Kirschblüten-Biene"] },
    { id: 14, name: "Crunch", gruppe: "tech", skins: ["Retro Mint","Chrom Silber","Pop-Art Gelb"] },
    { id: 15, name: "Tiki", gruppe: "absurd", skins: ["Dschungel Teak","Vulkan Asche","Ozean Koralle"] },
    { id: 16, name: "Clawdy", gruppe: "animal", skins: ["Espresso Italiano","Cappuccino Creme","Matcha Latte"] },
    { id: 17, name: "Mimi", gruppe: "magic", skins: ["Washi Kirschrot","Mitternachts-Folie","Sonnengelb Washi"] },
    { id: 18, name: "Fuzz", gruppe: "absurd", skins: ["Rußmännchen","Zuckerwatte","Kamin-Staub"] },
    { id: 19, name: "Snip", gruppe: "animal", skins: ["Regenbogen Dschungel","Cyber Chamäleon","Wüsten-Tarnung"] },
    { id: 20, name: "Boomer", gruppe: "tech", skins: ["Retro Messing","Neon Alarm","Pastell Wecker"] },
    { id: 21, name: "Pebbl", gruppe: "animal", skins: ["Kaiser-Pinguin","Eisblumen Blau","Karamell Pinguin"] },
    { id: 22, name: "Glitch", gruppe: "tech", skins: ["Gameboy Grün","CGA Cyberpunk","Virtual Boy"] },
    { id: 23, name: "Cacti", gruppe: "nature", skins: ["Sonora Grün","Blaukaktus","Sonnenuntergang"] },
    { id: 24, name: "Nacho", gruppe: "absurd", skins: ["Cheddar Gold","Sweet Chili","Blue Corn Bat"] },
    { id: 25, name: "Pips", gruppe: "magic", skins: ["Magier Weiß","Casino Samt","Shadow D6"] },
    { id: 26, name: "Waddl", gruppe: "animal", skins: ["Klassik Ente","Erpel Dschungel","Lavendel Duck"] },
    { id: 27, name: "Yoyo", gruppe: "absurd", skins: ["Pastell Türkis","Flieder Traum","Koralle Garn"] },
    { id: 28, name: "Turbo", gruppe: "tech", skins: ["Formula Red","Gulf Racing","Stealth Carbon"] },
    { id: 29, name: "Lumi", gruppe: "magic", skins: ["Tiefsee Cyan","Sonnen-Angler","Korallen Pink"] },
    { id: 30, name: "Umbra", gruppe: "spooky", skins: ["Void Purple","Blood Moon","Banshee Frost"] },
    { id: 31, name: "Grimjaw", gruppe: "spooky", skins: ["Cursed Gold","Abyss Iron","Crimson Tomb"] },
    { id: 32, name: "Astris", gruppe: "magic", skins: ["Deep Cosmos","Nebula Dream","Solar Eclipse"] },
    { id: 33, name: "Arcana", gruppe: "magic", skins: ["Mystic Violet","Emerald Chrono","Forbidden Shadow"] },
    { id: 34, name: "Zephyr", gruppe: "animal", skins: ["Midnight Starlight","Aurora Feather","Solar Twilight"] },
    { id: 35, name: "Spindle", gruppe: "spooky", skins: ["Schwarze Witwe","Toxic Cave","Geister Albino"] },
    { id: 36, name: "Prisma", gruppe: "magic", skins: ["Wolkenweiß","Zuckerwatte","Sternennacht"] },
    { id: 37, name: "Plato", gruppe: "animal", skins: ["Flussbraun","UV-Leuchten","Sandbank"] },
    { id: 38, name: "Krümel", gruppe: "animal", skins: ["Kellergrau","Laborweiß","Schoko"] },
    { id: 39, name: "Howl", gruppe: "magic", skins: ["Mitternacht","Blutmond","Geisterwolf"] }
  ];

  const DEFS = [];

  /* ══════════════════════════════════════════════════════════
     Fassung 3 (November 2026): Gesichter mit Charakter
     ══════════════════════════════════════════════════════════
     In Fassung 2 hatten fast alle Wesen dasselbe Gesicht (face():
     zwei schwarze Punkte, kleiner Mund, rosa Wangen). Jetzt hat
     jedes Wesen einen TYP („Der Lässige“, „Die Überdrehte“ …), und
     den sieht man — gesicht() und mund():
       * Augapfel + Pupille (.pp), die irgendwohin schaut und in
         Ruhe wandert (lk-… in creatures.css)
       * Lider (müde, lässig) und Brauen (.brw), auch ungleich
       * viele Münder: schiefes Grinsen, Zähne, Reißzahn, Zunge …
       * je Wesen eine eigene Kleinigkeit in Ruhe (q-… in creatures.css)
     Die Klassen im Gesicht heißen wie bei face() (e-open, e-happy,
     m-normal …), darum laufen alle Emotes unverändert.
     face() bleibt für Figuren außerhalb dieser Datei, die mit
     buildDef gebaut werden.                                      */
  const MOUTH = '#3a1220', TONGUE = '#ff6f91';
  const n = v => Math.round(v * 100) / 100;
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));

  /* Oberlid: der Teil der Augen-Ellipse über einer (schrägen) Sehne.
     amt 0…1 = wie weit zu, tilt > 0 = innen tiefer (grimmig),
     tilt < 0 = außen tiefer (müde, traurig). side: +1 linkes Auge. */
  function lidPath(x, y, rx, ry, amt, tilt, side) {
    const A = Math.asin(Math.max(-0.98, Math.min(0.98, 1 - 2 * amt)));
    const t = (tilt || 0) * Math.PI / 180 * (side || 1);
    const al = Math.max(-1.45, Math.min(1.45, A + t)), ar = Math.max(-1.45, Math.min(1.45, A - t));
    const large = (Math.PI - al - ar) > Math.PI ? 1 : 0;
    return 'M ' + n(x - rx * Math.cos(al)) + ' ' + n(y - ry * Math.sin(al))
      + ' A ' + n(rx) + ' ' + n(ry) + ' 0 ' + large + ' 1 ' + n(x + rx * Math.cos(ar)) + ' ' + n(y - ry * Math.sin(ar)) + ' Z';
  }

  /* ── Münder ──────────────────────────────────────────────────
     f.m  smile · smirk · grin · cat · line · frown · o · fang ·
          buck · tongue · zig · wavy · pout · none
     f.ms Seite (+1 rechts, −1 links) für smirk, fang, tongue
     f.teeth  obere Zahnreihe im offenen Mund
     f.mouths { normal, open, sad, sleep, wow } ersetzt einzelne   */
  function mund(f) {
    if (f.my === undefined && !f.mouths) return '';
    const mx = f.mx || 50, my = f.my || 0, w = f.mw || 5, s = f.ms || 1, mc = f.mc || INK, lw = f.mlw || 2.4, mf = f.mf || MOUTH;
    const smile = 'M ' + n(mx - w) + ' ' + my + ' Q ' + mx + ' ' + n(my + w * 0.9) + ' ' + n(mx + w) + ' ' + my;
    const N = {
      smile: () => L(smile, mc, lw),
      smirk: () => L('M ' + n(mx - s * w) + ' ' + n(my + w * 0.15) + ' Q ' + n(mx + s * w * 0.25) + ' ' + n(my + w * 0.7) + ' ' + n(mx + s * w) + ' ' + n(my - w * 0.45), mc, lw)
        + L('M ' + n(mx + s * (w - 0.8)) + ' ' + n(my - w * 0.9) + ' Q ' + n(mx + s * (w + 1.4)) + ' ' + n(my - w * 0.5) + ' ' + n(mx + s * (w + 0.1)) + ' ' + n(my + 0.2), mc, 1.6),
      grin: () => P('M ' + n(mx - w) + ' ' + n(my - w * 0.25) + ' Q ' + mx + ' ' + n(my + w * 0.2) + ' ' + n(mx + w) + ' ' + n(my - w * 0.25)
          + ' Q ' + n(mx + w * 0.85) + ' ' + n(my + w * 0.95) + ' ' + mx + ' ' + n(my + w * 0.95) + ' Q ' + n(mx - w * 0.85) + ' ' + n(my + w * 0.95) + ' ' + n(mx - w) + ' ' + n(my - w * 0.25) + ' Z', '#fff', 2.2)
        + L('M ' + n(mx - w * 0.36) + ' ' + n(my + 0.1) + ' L ' + n(mx - w * 0.34) + ' ' + n(my + w * 0.9) + ' M ' + n(mx + w * 0.36) + ' ' + n(my + 0.1) + ' L ' + n(mx + w * 0.34) + ' ' + n(my + w * 0.9) + ' M ' + mx + ' ' + n(my + 0.2) + ' L ' + mx + ' ' + n(my + w * 0.95), mc, 1),
      cat: () => L('M ' + n(mx - w) + ' ' + my + ' Q ' + n(mx - w / 2) + ' ' + n(my + w * 0.8) + ' ' + mx + ' ' + my + ' Q ' + n(mx + w / 2) + ' ' + n(my + w * 0.8) + ' ' + n(mx + w) + ' ' + my, mc, lw),
      line: () => L('M ' + n(mx - w) + ' ' + my + ' L ' + n(mx + w) + ' ' + my, mc, lw),
      frown: () => L('M ' + n(mx - w) + ' ' + n(my + w * 0.45) + ' Q ' + mx + ' ' + n(my - w * 0.45) + ' ' + n(mx + w) + ' ' + n(my + w * 0.45), mc, lw),
      o: () => E(mx, my, w * 0.5, w * 0.6, mf, 1.8),
      fang: () => L(smile, mc, lw) + P('M ' + n(mx + s * w * 0.25) + ' ' + n(my + w * 0.42) + ' L ' + n(mx + s * w * 0.5) + ' ' + n(my + w * 1.15) + ' L ' + n(mx + s * w * 0.72) + ' ' + n(my + w * 0.26) + ' Z', '#fff', 1.2),
      buck: () => L(smile, mc, lw) + R(n(mx - w * 0.42), n(my + w * 0.3), n(w * 0.84), n(w * 0.75), 0.8, '#fff', 1.4) + L('M ' + mx + ' ' + n(my + w * 0.4) + ' L ' + mx + ' ' + n(my + w * 1.02), mc, 0.9),
      tongue: () => L(smile, mc, lw) + E(n(mx + s * w * 0.42), n(my + w * 0.82), n(w * 0.36), n(w * 0.5), TONGUE, 1.6, 'transform="rotate(' + (-s * 18) + ' ' + n(mx + s * w * 0.42) + ' ' + n(my + w * 0.5) + ')"'),
      zig: () => L('M ' + n(mx - w) + ' ' + my + ' l ' + n(w * 0.4) + ' ' + n(-w * 0.35) + ' l ' + n(w * 0.4) + ' ' + n(w * 0.5) + ' l ' + n(w * 0.4) + ' ' + n(-w * 0.5) + ' l ' + n(w * 0.4) + ' ' + n(w * 0.5) + ' l ' + n(w * 0.4) + ' ' + n(-w * 0.35), mc, lw - 0.4),
      wavy: () => L('M ' + n(mx - w) + ' ' + my + ' q ' + n(w * 0.25) + ' ' + n(-w * 0.45) + ' ' + n(w * 0.5) + ' 0 t ' + n(w * 0.5) + ' 0 t ' + n(w * 0.5) + ' 0 t ' + n(w * 0.5) + ' 0', mc, lw - 0.4),
      pout: () => L('M ' + n(mx - w * 0.6) + ' ' + n(my + w * 0.3) + ' Q ' + mx + ' ' + n(my - w * 0.5) + ' ' + n(mx + w * 0.6) + ' ' + n(my + w * 0.3), mc, lw)
        + L('M ' + n(mx - w * 0.25) + ' ' + n(my + w * 0.75) + ' L ' + n(mx + w * 0.25) + ' ' + n(my + w * 0.75), mc, 1.4),
      none: () => ''
    };
    const fangOpen = f.m === 'fang'
      ? P('M ' + n(mx + s * w * 0.25) + ' ' + n(my - 0.2) + ' L ' + n(mx + s * w * 0.48) + ' ' + n(my + w * 0.75) + ' L ' + n(mx + s * w * 0.7) + ' ' + n(my - 0.3) + ' Z', '#fff', 1) : '';
    const std = {
      normal: (N[f.m] || N.smile)(),
      open: P('M ' + n(mx - w) + ' ' + n(my - 0.6) + ' Q ' + mx + ' ' + n(my + w * 1.75) + ' ' + n(mx + w) + ' ' + n(my - 0.6) + ' Z', mf, 2.2)
        + E(mx, n(my + w * 0.86), n(w * 0.48), n(w * 0.32), TONGUE, 0)
        + (f.teeth ? P('M ' + n(mx - w * 0.62) + ' ' + n(my - 0.4) + ' L ' + n(mx + w * 0.62) + ' ' + n(my - 0.4) + ' L ' + n(mx + w * 0.5) + ' ' + n(my + w * 0.32) + ' L ' + n(mx - w * 0.5) + ' ' + n(my + w * 0.32) + ' Z', '#fff', 1) : '')
        + (f.m === 'buck' ? R(n(mx - w * 0.4), n(my - 0.3), n(w * 0.8), n(w * 0.6), 0.7, '#fff', 1.2) : '')
        + fangOpen,
      sad: L('M ' + n(mx - w * 0.8) + ' ' + n(my + w * 0.55) + ' Q ' + mx + ' ' + n(my - w * 0.45) + ' ' + n(mx + w * 0.8) + ' ' + n(my + w * 0.55), mc, lw),
      sleep: E(mx, my + 0.8, 1.6, 2, mf, 0),
      wow: E(mx, my + 1, 2.4, 3, mf, 1.6)
    };
    const o = Object.assign(std, f.mouths || {});
    return ['normal', 'open', 'sad', 'sleep', 'wow'].map(k => '<g class="m-' + k + '">' + o[k] + '</g>').join('');
  }

  /* ── Gesicht ─────────────────────────────────────────────────
     x [lx, rx] oder [cx] · y · r (Zahl oder [rl, rr]) · ex Breite
     t     'w' Augapfel + Pupille (Standard) · 'dot' Knopfauge ·
           'glow' glühend (col) · 'px' Pixelbalken (col) ·
           'arc' zufrieden geschlossen · 'btn' Knöpfe (bcols)
     p     Pupillengröße (Anteil von r) · iris Farbe · sc Augapfel
     look  [dx, dy] in r — wohin die Pupille schaut (auch je Auge)
     lookc Klasse der Pupille (lk-lr, lk-up, lk-roll … wesen.css)
     lid   [zu 0…1, Neigung°] (auch je Auge) · lidc Lidfarbe
     lash  Wimpern · bags Augenringe (Farbe)
     brow  { dy, a (Neigung, auch [l, r]), l, w, c, up [l, r], only }
     happy 'arc' ^ ^ (Standard) · 'gt' > <
     blush Farbe | false · pre/extra/post eigene Teile             */
  function gesicht(f) {
    const xs = f.x, one = xs.length === 1;
    const rr = i => Array.isArray(f.r) ? f.r[i] : (f.r || 6);
    const yy = i => Array.isArray(f.y) ? f.y[i] : f.y;
    const ex = f.ex || 0.88, t = f.t || 'w', col = f.col || INK;
    const side = i => one ? 1 : (i === 0 ? 1 : -1);
    const per = (v, i) => (Array.isArray(v) && Array.isArray(v[0])) ? v[i] : v;
    const lkc = i => Array.isArray(f.lookc) ? f.lookc[i] : (f.lookc || '');
    const out = [];

    const lid = (x, i, amt, tilt) => P(lidPath(x, yy(i), rr(i) * ex + 0.25, rr(i) + 0.25, amt, tilt, side(i)), f.lidc || 'var(--c1)', 2.2);

    const open = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex, lk = per(f.look, i) || [0, 0];
      let s = '';
      if (t === 'w') {
        const pr = r * (f.p || 0.5), ir = f.iris ? Math.min(pr * 1.6, r - 0.9) : pr;
        const px = n(x + clamp(lk[0] * r, Math.max(0, rx - ir - 0.5))), py = n(y + clamp(lk[1] * r, Math.max(0, r - ir - 0.5)));
        s += E(x, y, n(rx), r, f.sc || '#fff', 2.2)
          + '<g class="pp ' + lkc(i) + '">' + (f.iris ? C(px, py, n(ir), f.iris, 0) : '') + C(px, py, n(pr), f.pc || INK, 0, 'class="pupil"')
          + hl(n(px - pr * 0.36), n(py - pr * 0.42), n(Math.max(0.8, pr * 0.4)), 0.95) + '</g>';
      } else if (t === 'dot') {
        s += '<g class="pp ' + lkc(i) + '">' + E(x, y, n(rx * 0.9), r, f.pc || INK, 0)
          + hl(n(x - rx * 0.3), n(y - r * 0.38), n(r * 0.34), 0.95) + hl(n(x + rx * 0.3), n(y + r * 0.4), n(r * 0.15), 0.85) + '</g>';
      } else if (t === 'glow') {
        s += E(x, y, n(r * 1.25), n(r * 1.45), col, 0, 'opacity=".3" class="glow"') + E(x, y, n(r * 0.8), r, col, 0)
          + '<g class="pp ' + lkc(i) + '">' + E(n(x + lk[0] * r), n(y + lk[1] * r), n(r * 0.3), n(r * 0.5), f.pc || '#fff', 0) + '</g>';
      } else if (t === 'btn') {
        const bc = (f.bcols || ['#fff', '#fff'])[i] || '#fff', h = r * 0.3;
        s += C(x, y, r, bc, 2.4) + C(x, y, n(r * 0.68), 'none', 0.9, 'stroke="' + INK + '" stroke-opacity=".3"')
          + [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(q => C(n(x + q[0] * h), n(y + q[1] * h), n(Math.max(0.7, r * 0.13)), INK, 0)).join('')
          + L(i ? 'M ' + n(x - h) + ' ' + n(y - h) + ' L ' + n(x + h) + ' ' + n(y + h) + ' M ' + n(x + h) + ' ' + n(y - h) + ' L ' + n(x - h) + ' ' + n(y + h)
                : 'M ' + n(x - h) + ' ' + n(y - h) + ' L ' + n(x + h) + ' ' + n(y - h) + ' M ' + n(x - h) + ' ' + n(y + h) + ' L ' + n(x + h) + ' ' + n(y + h), f.thread || '#fff', 1.1)
          + hl(n(x - r * 0.5), n(y - r * 0.55), n(r * 0.16), 0.9);
      } else if (t === 'arc') {
        s += L('M ' + n(x - rx) + ' ' + n(y + r * 0.3) + ' Q ' + x + ' ' + n(y - r * 1.1) + ' ' + n(x + rx) + ' ' + n(y + r * 0.3), col, 2.8);
      } else if (t === 'px') {
        s += R(n(x - r * 0.95), n(y - r * 1.35), n(r * 1.9), n(r * 2.7), n(r * 0.7), col, 0, 'opacity=".28"')
          + R(n(x - r * 0.6), n(y - r), n(r * 1.2), n(r * 2), n(r * 0.4), col, 0)
          + R(n(x - r * 0.38), n(y - r * 0.75), n(r * 0.4), n(r * 0.55), 0.4, '#fff', 0, 'opacity=".8"');
      }
      const ld = per(f.lid, i);
      if (ld && (t === 'w' || t === 'dot')) s += lid(x, i, ld[0], ld[1]);
      if (f.lash) {
        const o = -side(i) * (one ? 0 : 1);
        s += L('M ' + n(x + o * rx * 0.72) + ' ' + n(y - r * 0.7) + ' l ' + n(o * 2.6) + ' -2.4 M ' + n(x + o * rx * 0.98) + ' ' + n(y - r * 0.25) + ' l ' + n(o * 3) + ' -1.2', INK, 1.5);
      }
      if (f.bags) s += L('M ' + n(x - rx * 0.75) + ' ' + n(y + r + 1.6) + ' Q ' + x + ' ' + n(y + r + 3.2) + ' ' + n(x + rx * 0.75) + ' ' + n(y + r + 1.6), f.bags, 1.5, 'opacity=".7"');
      return s;
    };
    const lw = 2.8;
    const happy = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex, s = side(i);
      if (f.happy === 'gt') return L('M ' + n(x - s * rx * 0.85) + ' ' + n(y - r * 0.65) + ' L ' + n(x + s * rx * 0.7) + ' ' + y + ' L ' + n(x - s * rx * 0.85) + ' ' + n(y + r * 0.65), col, lw);
      return L('M ' + n(x - rx) + ' ' + n(y + r * 0.3) + ' Q ' + x + ' ' + n(y - r * 1.1) + ' ' + n(x + rx) + ' ' + n(y + r * 0.3), col, lw);
    };
    const sleep = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex;
      return L('M ' + n(x - rx) + ' ' + y + ' Q ' + x + ' ' + n(y + r * 0.8) + ' ' + n(x + rx) + ' ' + y, col, lw)
        + (f.lash ? L('M ' + n(x - rx * 0.5) + ' ' + n(y + r * 0.5) + ' l -1 2.2 M ' + n(x + rx * 0.5) + ' ' + n(y + r * 0.5) + ' l 1 2.2', col, 1.4) : '');
    };
    const sad = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex, s = side(i);
      let e;
      if (t === 'glow' || t === 'px') e = R(n(x - r * 0.6), n(y - r * 0.2), n(r * 1.2), n(r * 1.05), n(r * 0.4), col, 0);
      else if (t === 'dot' || t === 'arc' || t === 'btn') e = E(x, n(y + r * 0.15), n(rx * 0.8), n(r * 0.9), INK, 0) + hl(n(x - rx * 0.25), n(y - r * 0.2), n(r * 0.42), 0.95) + hl(n(x + rx * 0.3), n(y + r * 0.45), n(r * 0.2), 0.85);
      else {
        const pr = r * 0.56;
        e = E(x, y, n(rx), r, f.sc || '#fff', 2.2) + (f.iris ? C(x, n(y + r * 0.3), n(Math.min(pr * 1.4, r - 0.9)), f.iris, 0) : '') + C(x, n(y + r * 0.3), n(pr), f.pc || INK, 0)
          + hl(n(x - pr * 0.4), n(y + r * 0.08), n(pr * 0.5), 0.95) + hl(n(x + pr * 0.42), n(y + r * 0.55), n(pr * 0.26), 0.9)
          + lid(x, i, 0.3, -20);
      }
      return e + L('M ' + n(x - s * rx * 1.0) + ' ' + n(y - r * 1.25) + ' L ' + n(x + s * rx * 0.8) + ' ' + n(y - r * 1.85), col, 2.2);
    };
    const dizzy = (x, i) => {
      const s = rr(i) / 3.4, y = yy(i);
      return L('M ' + n(x - 0.5 * s) + ' ' + y + ' a ' + n(0.5 * s) + ' ' + n(0.5 * s) + ' 0 1 1 ' + n(s) + ' 0'
        + ' a ' + n(1.25 * s) + ' ' + n(1.25 * s) + ' 0 1 1 ' + n(-2.5 * s) + ' 0'
        + ' a ' + n(2 * s) + ' ' + n(2 * s) + ' 0 1 1 ' + n(4 * s) + ' 0'
        + ' a ' + n(2.75 * s) + ' ' + n(2.75 * s) + ' 0 1 1 ' + n(-5.5 * s) + ' 0', col, 1.6);
    };

    if (f.pre) out.push(f.pre);
    out.push('<g class="e-open">' + xs.map(open).join('') + '</g>');
    out.push('<g class="e-happy">' + xs.map(happy).join('') + '</g>');
    out.push('<g class="e-sleep">' + xs.map(sleep).join('') + '</g>');
    out.push('<g class="e-sad">' + xs.map(sad).join('') + '</g>');
    out.push('<g class="e-dizzy">' + xs.map(dizzy).join('') + '</g>');

    if (f.brow) {
      const b = f.brow;
      out.push('<g class="brw">' + xs.map((x, i) => {
        if (b.only !== undefined && b.only !== i) return '';
        const r = rr(i), s = side(i), a = (Array.isArray(b.a) ? b.a[i] : (b.a || 0)) * Math.PI / 180;
        const l = b.l || r * 0.95, cy = yy(i) - r - (b.dy === undefined ? 2.4 : b.dy) + (b.up ? b.up[i] : 0);
        const dy = l * Math.tan(a);
        return L('M ' + n(x - s * l) + ' ' + n(cy - dy) + ' Q ' + x + ' ' + n(cy - (b.k === undefined ? 1 : b.k)) + ' ' + n(x + s * l) + ' ' + n(cy + dy), b.c || INK, b.w || 2.6);
      }).join('') + '</g>');
    }

    if (f.blush !== false) {
      const r0 = rr(0), by = f.by || (yy(0) + r0 + 3.4);
      const bx = f.bx || (one ? [xs[0] - r0 * 1.35, xs[0] + r0 * 1.35] : [xs[0] - r0 * 0.55, xs[1] + rr(1) * 0.55]);
      out.push(bx.map(x => E(n(x), n(by), f.bw || 3.8, f.bh || 2.2, f.blush || '#ff6f9f', 0, 'opacity=".5"')).join(''));
    }
    if (f.extra) out.push(f.extra);
    out.push(mund(f));
    if (f.post) out.push(f.post);

    out.push('<g class="cr-tears">' + xs.map((x, i) => {
      const tx = n(x + rr(i) * 0.35 * side(i) * -1), ty = n(yy(i) + rr(i) + 0.5);
      return P('M ' + tx + ' ' + ty + ' C ' + n(tx - 2.3) + ' ' + n(ty + 3.6) + ' ' + n(tx - 2.3) + ' ' + n(ty + 5.6) + ' ' + tx + ' ' + n(ty + 5.6)
        + ' C ' + n(tx + 2.3) + ' ' + n(ty + 5.6) + ' ' + n(tx + 2.3) + ' ' + n(ty + 3.6) + ' ' + tx + ' ' + ty + ' Z', '#6cc8ff', 0,
        'stroke="#2b7bd6" stroke-width=".8" class="tear" style="animation-delay:' + (i * 0.45) + 's"');
    }).join('') + '</g>');

    return '<g class="face">' + out.join('') + '</g>';
  }

  /* Die Farbfassungen, Reihenfolge = skin_idx (steht in der Datenbank). */
  const FARBEN = [
    /*  0 */ [['#ff2e93', '#22d3ee', '#ffe14d', '#ff9ccb'], ['#34d399', '#f59e0b', '#a855f7', '#a7f3d0'], ['#2b8fd6', '#ec4899', '#facc15', '#93c5fd']],
    /*  1 */ [['#b48cff', '#7c4ddb', '#ffe14d', '#ff9ccf'], ['#ffc53d', '#e08a00', '#22d3ee', '#ff7a90'], ['#4a5480', '#2a3152', '#5eead4', '#c4a1ff']],
    /*  2 */ [['#4ade80', '#16a34a', '#ef4444', '#facc15'], ['#38bdf8', '#0369a1', '#f59e0b', '#ec4899'], ['#facc15', '#ca8a04', '#8b5cf6', '#06b6d4']],
    /*  3 */ [['#47e0ff', '#0e7490', '#ff8a3d', '#ff4f8b'], ['#ff7a8a', '#be123c', '#ffd23f', '#38bdf8'], ['#5b54e8', '#2a2670', '#34d399', '#f472b6']],
    /*  4 */ [['#f5b13d', '#c97a16', '#38bdf8', '#ffe6b3', 'transparent', '#f5b13d'], ['#f1f5f9', '#b8c4d4', '#f43f5e', '#ffffff', 'transparent', '#f1f5f9'], ['#f8fafc', '#2a3044', '#10b981', '#ffffff', '#2a3044', '#2a3044']],
    /*  5 */ [['#e2e8f0', '#8b9bb4', '#1b2236', '#2ee6ff'], ['#3a4068', '#7b84bd', '#0b0a1f', '#ff3dbb'], ['#f43f5e', '#9f1239', '#1e1b2e', '#ffe14d']],
    /*  6 */ [['#ff6a2b', '#ffe8a3', '#ffd23f', '#ffb347'], ['#3ba3e8', '#d6f0ff', '#eaf6ff', '#8fd3ff'], ['#16a37a', '#fef08a', '#fbbf24', '#5eead4']],
    /*  7 */ [['#eaf6ff', '#38bdf8', '#ffd23f', '#ff7aa8'], ['#ffe4ec', '#f43f5e', '#fb923c', '#f59e0b'], ['#ece0ff', '#8b5cf6', '#7dd3fc', '#ec4899']],
    /*  8 */ [['#84cc16', '#4d7c0f', '#ffd23f', '#22d3ee'], ['#fb5070', '#9f1239', '#38bdf8', '#ffd23f'], ['#9168f6', '#5b21b6', '#facc15', '#34d399']],
    /*  9 */ [['#ffb3d1', '#ff4f8b', '#ffd23f', '#fff0f6'], ['#f8fafc', '#fb7185', '#38bdf8', '#ffffff'], ['#7ef0c4', '#059669', '#facc15', '#ecfdf5']],
    /* 10 */ [['#8b98ad', '#5b6577', '#34d399', '#a3e635'], ['#757a8e', '#4a4e60', '#ff5a5a', '#fb923c'], ['#62708f', '#3f4964', '#c084fc', '#22d3ee']],
    /* 11 */ [['#fff1f2', '#fda4af', '#ffffff', '#f43f5e'], ['#effbe9', '#86efac', '#ffffff', '#10b981'], ['#fdf3dc', '#d4a373', '#7a4a24', '#f59e0b']],
    /* 12 */ [['#e8264f', '#ffd0d9', '#2fc65f', '#a5133a'], ['#eab308', '#fef9c3', '#16a34a', '#a16207'], ['#9333ea', '#f3e8ff', '#06b6d4', '#6b21a8']],
    /* 13 */ [['#ffcc33', '#2a2438', '#d6f2ff', '#b7791f'], ['#22e3ff', '#141a2e', '#ff9ec4', '#ffe14d'], ['#ff9ccb', '#7a1f4d', '#ffffff', '#38bdf8']],
    /* 14 */ [['#a7f3d0', '#5fcfa5', '#f2b45a', '#0f766e'], ['#e2e8f0', '#a7b3c6', '#f59e0b', '#ef4444'], ['#facc15', '#d4a20c', '#ffffff', '#ec4899']],
    /* 15 */ [['#b0643a', '#ffd23f', '#ff6a3c', '#22c1dc'], ['#5a6275', '#fb923c', '#ffc53d', '#ef4444'], ['#1a9cbf', '#fb7185', '#ffe14d', '#ffffff']],
    /* 16 */ [['#ffffff', '#f5a524', '#ef4444', '#dc2626', '#6b3e1f'], ['#fef3c7', '#b45309', '#f97316', '#ea580c', '#c89b6d'], ['#ecfdf5', '#10b981', '#06b6d4', '#0891b2', '#7cc47a']],
    /* 17 */ [['#fff4f4', '#f43f5e', '#be123c', '#ffd23f'], ['#33476b', '#38bdf8', '#0ea5e9', '#fbbf24'], ['#fff7d6', '#facc15', '#ca8a04', '#ec4899']],
    /* 18 */ [['#30354a', '#ffd23f', '#38bdf8', '#e0f2fe', '#ffffff'], ['#ff8fc8', '#ffffff', '#fde047', '#ffffff', '#1e1b2e'], ['#6b7280', '#ef4444', '#22c55e', '#e0f2fe', '#ffffff']],
    /* 19 */ [['#22b07d', '#facc15', '#06b6d4', '#ec4899'], ['#8b5cf6', '#22e3ff', '#f43f5e', '#ffe14d'], ['#e0a43a', '#fef3c7', '#c2410c', '#10b981']],
    /* 20 */ [['#f4c26b', '#d98f1f', '#fffaf0', '#8a5a14'], ['#3a4270', '#ff3d7f', '#e6fbff', '#ffd23f'], ['#bfe3ff', '#f9a8d4', '#ffffff', '#38bdf8']],
    /* 21 */ [['#2a3352', '#ffffff', '#f43f5e', '#facc15'], ['#2b5cb8', '#f0fdf4', '#38bdf8', '#f472b6'], ['#8a4b1c', '#fefce8', '#22c55e', '#ea580c']],
    /* 22 */ [['#84cc16', '#3f6212', '#1c3a0b', '#d9f99d'], ['#ec4899', '#831843', '#0b3a47', '#67e8f9'], ['#ef4444', '#7f1d1d', '#2a0a0a', '#fecaca']],
    /* 23 */ [['#2f9e57', '#f43f5e', '#e8743b', '#d6fbe2'], ['#2aa6c8', '#facc15', '#9333ea', '#d9fbff'], ['#d9a514', '#ec4899', '#c2410c', '#fff3c4']],
    /* 24 */ [['#f6b73c', '#ffe7a3', '#2fa34a', '#ff9a1f'], ['#e8473b', '#ffc2b8', '#d4a017', '#ffe58a'], ['#4a4fc4', '#c2c6ff', '#e0442f', '#ffe066']],
    /* 25 */ [['#ffffff', '#1f2235', '#2a2f45', '#ffd23f'], ['#e8304a', '#ffffff', '#1f2235', '#ffd23f'], ['#6a35a8', '#38e1ff', '#151827', '#ff4fd8']],
    /* 26 */ [['#ffd43b', '#ef4444', '#f5c400', '#ff8c1a'], ['#1f8a5c', '#eab308', '#0f5132', '#facc15'], ['#c4a1ff', '#22c1dc', '#9f6bff', '#fb923c']],
    /* 27 */ [['#2dd4bf', '#facc15', '#f43f5e', '#0f9488'], ['#c084fc', '#38bdf8', '#facc15', '#9333ea'], ['#fb7185', '#ffffff', '#38bdf8', '#e11d48']],
    /* 28 */ [['#a3e635', '#e11d2a', '#ffffff', '#cbd5e1'], ['#facc15', '#5fb7e8', '#ff8a1f', '#ff8a1f'], ['#5fd4ff', '#2f3648', '#facc15', '#fbbf24']],
    /* 29 */ [['#1d9ccc', '#4ff0ff', '#c9f1ff', '#0e6f94'], ['#e08a12', '#ffe14d', '#fff1c2', '#b45309'], ['#e0457b', '#fff06a', '#ffe0ec', '#b8235a']],
    /* 30 */ [['#2e2547', '#b36bff', '#efe1ff', '#4ade80'], ['#3d2328', '#ff4d4d', '#ffc2c2', '#ff9a3c'], ['#4b5d78', '#4ff0ff', '#f8fafc', '#7dd3fc']],
    /* 31 */ [['#86471a', '#e8b04a', '#fff4c2', '#c084fc'], ['#33405e', '#cbd5e1', '#e2e8f0', '#22e3ff'], ['#8c1d3a', '#facc15', '#fefce8', '#f43f5e']],
    /* 32 */ [['#2f3a6e', '#00e5ff', '#ffd23f', '#ffffff'], ['#7234ad', '#ff6b98', '#2dd4bf', '#fde047'], ['#33333f', '#fbbf24', '#ff7a1a', '#ffe0b8']],
    /* 33 */ [['#5b2bb5', '#f5b53f', '#22d3ee', '#fff3d6'], ['#0f7055', '#d4a017', '#34d399', '#ecfdf5'], ['#2a4185', '#e2e8f0', '#ff4fd8', '#f8fafc']],
    /* 34 */ [['#2f4275', '#ffd23f', '#e2e8f0', '#7dd3fc'], ['#0f9fb8', '#34d399', '#f8fafc', '#ffe14d'], ['#7234ad', '#fbbf24', '#ffd0dc', '#fde047']],
    /* 35 */ [['#2f2640', '#ef4444', '#a78bfa', '#d4d4e0'], ['#3c4a60', '#22c55e', '#c084fc', '#4ade80'], ['#f4f5fa', '#b91c1c', '#38bdf8', '#94a3b8']],
    /* 36 */ [['#fbf8ff', '#ffc94d', '#c9b8ff', '#ffb3d1'], ['#ffc4dc', '#fff1a8', '#ff7aa8', '#ff8fbf'], ['#3b3f7a', '#ffd23f', '#8b9cff', '#c4a1ff']],
    /* 37 */ [['#9a6036', '#5d6176', '#d9a679', '#7a4826'], ['#3f6f78', '#35c6c0', '#9de7e0', '#2f565d'], ['#d9a05b', '#7d6450', '#f6dcae', '#b97d3c']],
    /* 38 */ [['#a7adbd', '#7b8194', '#ffb3c7', '#e7e9f0'], ['#f4f2f7', '#c9c4d6', '#ff8fb1', '#ffffff'], ['#9a6a4a', '#6f4a33', '#ffb3a1', '#e8cdb5']],
    /* 39 */ [['#4a4f6b', '#ffd23f', '#a78bfa', '#fff3c4', '#2f3247', '#b9bdd6'], ['#5a3532', '#ff4d4d', '#ff8a5c', '#ffb0a0', '#3a201e', '#c9a39b'], ['#b7c3d9', '#4ff0ff', '#7c8cff', '#e6f7ff', '#8592ad', '#eef2fa']]
];

  /* W3.add(id, { typ, spruch, o, behind, legL, legR, body, head, back,
                  armL, armR, front, fx, vars }) — Farben aus FARBEN. */
  const W3 = {
    add: (id, def) => { def.pal = def.pal || FARBEN[id]; DEFS[id] = def; },
    kit: { INK, P, E, C, R, L, G, tube, shine, hl, shade, star, tw, mirror, gesicht, mund, lidPath, MOUTH, TONGUE }
  };

  /* ── Wesen 0 … 9 ─────────────────────────────────────────── */
  (function () {
    const W = W3;
    const { INK, P, E, C, R, L, G, tube, shine, hl, shade, tw, mirror, gesicht, MOUTH, TONGUE } = W.kit;
    const c1 = 'var(--c1)', c2 = 'var(--c2)', c3 = 'var(--c3)', c4 = 'var(--c4)';

    /* ── 0 Puddl · Schleim mit Kappe ─────────────────────────── */
    W.add(0, {
      typ: 'Der Lässige', spruch: 'Kaut Kaugummi. Hat Zeit.',
      vars: '--fx:var(--c3)',
      o: { al: [22, 62], ar: [78, 62], ll: [38, 86], lr: [62, 86], head: [50, 88] },
      legL: E(38, 88.5, 7, 3.6, c1, 2.4), legR: E(62, 88.5, 7, 3.6, c1, 2.4),
      head: P('M 50 24 C 68 24 78 38 80 55 C 82 68 86 78 81 84 C 77 88 72 84 68 86 C 63 89 58 85 52 87 C 46 89 41 85 35 87 C 29 89 23 87 20 83 C 15 77 18 67 20 55 C 22 38 32 24 50 24 Z', c1, 3.2)
        + shade('M 77 46 C 82 60 84 76 79 82 C 75 85 71 83 67 85 C 75 75 79 60 77 46 Z')
        + shine('M 27 50 C 27 42 30 36 34 33', 3, 0.65) + hl(26.5, 56, 1.7)
        + gesicht({ x: [39, 61], y: 52, r: [6.6, 7.6], lid: [[0.5, -5], [0.42, -5]], look: [0.4, 0.15], lookc: 'lk-slow',
            m: 'smirk', ms: -1, mx: 47, my: 66.5, mw: 5.5, bx: [32, 68], by: 61,
            post: G('gum', null, C(61, 68, 6.2, c4, 1.8) + hl(59, 65.6, 1.6, 0.9)) })
        + G('cap', null, '<g transform="rotate(-13 50 28)">'
          + P('M 31 33 C 13 27 10 32 9 36 C 17 39 27 38 36 35 Z', c3, 2.4)
          + P('M 30 33 C 28 17 39 11 50 11 C 61 11 72 17 70 33 C 58 28 42 28 30 33 Z', c2, 2.8)
          + L('M 50 12 L 50 29', INK, 1, 'opacity=".3"') + C(50, 11, 2.2, c3, 1.8)
          + shine('M 37 23 C 39 18 42 15 46 14', 2, 0.55) + '</g>'),
      back: R(43, 27, 14, 3.4, 1.5, c3, 1.8),
      armL: tube('M 22 62 Q 13 66 13 74', c1, 5.5),
      armR: tube('M 78 62 Q 87 66 86 74', c1, 5.5),
      fx: G('drip', [72, 85], P('M 71 84 C 69.5 88 70 90 72 90.4 C 74 90 74.5 88 73 84 Z', c1, 1.4))
    });

    /* ── 1 Spark · Blitzkatze ────────────────────────────────── */
    const ear1 = 'M 24 40 L 18 10 L 43 28 Z', ear1in = 'M 26.5 33 L 23 17.5 L 36 27 Z';
    W.add(1, {
      typ: 'Die Überdrehte', spruch: 'Dreizehn Ideen pro Sekunde. Alle gleichzeitig.',
      vars: '--fx:var(--c3)',
      o: { al: [38, 71], ar: [62, 71], ll: [42, 86], lr: [58, 86], head: [50, 69] },
      behind: G('tail', [62, 82], P('M 60 79 L 75 82 L 71 73 L 84 71 L 80 61 L 92 52 L 87 67 L 93 72 L 80 79 L 82 88 L 61 86 Z', c3, 2.4)),
      legL: E(42, 88.5, 6, 3.8, '#fff', 2.4), legR: E(58, 88.5, 6, 3.8, '#fff', 2.4),
      body: E(50, 77, 13.5, 11.5, c1, 3) + E(50, 79.5, 7.5, 6.5, '#fff', 0, 'opacity=".55" class="fo"'),
      head: G('q-twitch', [50, 48],
          G('ear-l', [30, 36], P(ear1, c1, 3) + P(ear1in, c4, 0))
        + G('ear-r', [70, 36], P(mirror(ear1), c1, 3) + P(mirror(ear1in), c4, 0))
        + P('M 50 26 C 62 26 71 31 75 40 L 83 41 L 78 48 L 85 54 L 77 57 C 72 66 62 70 50 70 C 38 70 28 66 23 57 L 15 54 L 22 48 L 17 41 L 25 40 C 29 31 38 26 50 26 Z', c1, 3.2)
        + shade('M 73 40 C 78 50 76 60 66 66 C 72 58 74 49 73 40 Z')
        + L('M 43 27 L 44.5 32.5 M 57 27 L 55.5 32.5', c2, 2.4)
        + P('M 53 9 L 44 23 L 49.5 23 L 46 32 L 58 19 L 52.5 19 L 57 9 Z', c3, 2.2, 'class="glow-soft"')
        + gesicht({ x: [37.5, 62.5], y: 46, r: 8.2, p: 0.3, iris: c3, lookc: 'lk-dart',
            brow: { dy: 1.6, a: -10, l: 5.5, k: 2.6, w: 2.4 }, bx: [29, 71], by: 57,
            m: 'grin', mx: 50, my: 60.5, mw: 6.5, teeth: true,
            extra: P('M 47.8 55 L 52.2 55 L 50 57.6 Z', c4, 1.2)
              + L('M 29 60 l -6 -1 l 2.5 2.8 l -6 .4 M 71 60 l 6 -1 l -2.5 2.8 l 6 .4', INK, 1.2, 'opacity=".6"'),
            post: P('M 54.2 60.6 L 55.6 64.6 L 57 60.2 Z', '#fff', 1.1) })),
      back: L('M 38 40 Q 50 45 62 40 M 40 50 Q 50 55 60 50', c2, 3),
      armL: tube('M 38 71 Q 31 73 29 67', c1, 5) + C(29, 66.5, 3.3, '#fff', 2),
      armR: tube('M 62 71 Q 69 73 71 67', c1, 5) + C(71, 66.5, 3.3, '#fff', 2),
      fx: L('M 13 22 L 17 26 L 14.5 27.5 L 18.5 32', c3, 1.8, 'class="zap"')
        + L('M 87 22 L 83 26 L 85.5 27.5 L 81.5 32', c3, 1.8, 'class="zap" style="animation-delay:.35s"')
        + L('M 90 80 L 86 83 L 89 84.5 L 85 88', c3, 1.6, 'class="zap" style="animation-delay:.7s"')
    });

    /* ── 2 Plop · Frosch mit Pilzhut ─────────────────────────── */
    const frogFoot = x => P('M ' + (x - 7) + ' 91.5 C ' + (x - 7) + ' 88 ' + (x - 4) + ' 86 ' + x + ' 86 C ' + (x + 4) + ' 86 ' + (x + 7) + ' 88 ' + (x + 7) + ' 91.5 Z', c2, 2.4)
      + C(x - 6, 91.3, 1.8, c2, 1.6) + C(x, 92, 1.8, c2, 1.6) + C(x + 6, 91.3, 1.8, c2, 1.6);
    W.add(2, {
      typ: 'Der Genießer', spruch: 'Erst mal sitzen. Dann weitersehen.',
      vars: '--fx:var(--c3)',
      o: { al: [22, 72], ar: [78, 72], ll: [33, 86], lr: [67, 86], head: [50, 88] },
      legL: frogFoot(33), legR: frogFoot(67),
      head: C(33, 45, 12, c1, 3.2) + C(67, 45, 12, c1, 3.2)
        + P('M 17 72 C 15 57 30 49 50 49 C 70 49 85 57 83 72 C 82 85 67 90 50 90 C 33 90 18 85 17 72 Z', c1, 3.2)
        + E(33, 53.5, 10.6, 6.5, c1, 0) + E(67, 53.5, 10.6, 6.5, c1, 0)
        + shade('M 79 60 C 84 72 78 85 62 88 C 73 82 79 72 79 60 Z')
        + E(50, 80, 20, 8, '#fff', 0, 'opacity=".3" class="fo"')
        + shine('M 23.5 46 C 23.5 41 26 37.5 29 36', 2.4, 0.55)
        + gesicht({ x: [33, 67], y: 44.5, r: 8, lid: [0.52, -9], look: [[0.3, 0.3], [-0.3, 0.3]], lookc: 'lk-slow', p: 0.46,
            bx: [24, 76], by: 63, bw: 4.6, bh: 2.6, mx: 50, my: 65, mw: 10,
            extra: C(47, 58.5, 0.9, INK, 0, 'opacity=".55"') + C(53, 58.5, 0.9, INK, 0, 'opacity=".55"'),
            mouths: { normal: L('M 29 64 Q 50 76 71 64', INK, 2.6) + L('M 26.5 62 Q 27.5 65 30.5 65.2 M 73.5 62 Q 72.5 65 69.5 65.2', INK, 1.8)
                + G('q-lick', [50, 69], P('M 46.5 69.5 C 46.5 76 53.5 76 53.5 69.5 Z', TONGUE, 1.8)) } })
        + G('cap', null, '<g transform="rotate(-11 50 36)">'
          + P('M 36 38 C 35 25 43 19 50 19 C 57 19 65 25 64 38 C 56 34.5 44 34.5 36 38 Z', c3, 2.8)
          + C(43, 28, 2.6, '#fff', 0) + C(53, 24, 2.2, '#fff', 0) + C(58.5, 31, 1.9, '#fff', 0) + '</g>'),
      back: C(38, 66, 3.4, c2, 0, 'opacity=".5"') + C(60, 62, 2.6, c2, 0, 'opacity=".5"') + C(55, 74, 3, c2, 0, 'opacity=".5"'),
      armL: tube('M 22 72 Q 17 78 21 83', c1, 5) + E(22, 84, 3.8, 2.6, c2, 1.8),
      armR: tube('M 78 72 Q 83 78 79 83', c1, 5) + E(78, 84, 3.8, 2.6, c2, 1.8),
      fx: G('orbit', [82, 26], E(88, 24.6, 2, 1.3, '#fff', 0.8, 'opacity=".9"') + E(89.6, 25, 2, 1.3, '#fff', 0.8, 'opacity=".9"') + C(89, 26.6, 1.7, INK, 0))
    });

    /* ── 3 Bubbles · Kugelfisch mit Matrosenmütze ────────────── */
    const spikes = (cx, cy, r0, r1, k, rot) => {
      let s = '';
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + (rot || 0), w = 0.16;
        const p = (rr, aa) => (cx + Math.cos(aa) * rr).toFixed(1) + ' ' + (cy + Math.sin(aa) * rr).toFixed(1);
        s += 'M ' + p(r0, a - w) + ' L ' + p(r1, a) + ' L ' + p(r0, a + w) + ' Z ';
      }
      return s;
    };
    const fin3 = 'M 25 52 C 15 44 8 52 10 60 C 11 65 19 64 25 59 Z';
    W.add(3, {
      typ: 'Der Schreckhafte', spruch: 'Was war das?! … Ach so. Nur eine Blase.',
      vars: '--fx:var(--c3)',
      o: { al: [25, 55], ar: [75, 55], ll: [43, 79], lr: [57, 79], head: [50, 80] },
      behind: P(spikes(50, 55, 25, 32.5, 12, 0.26), c2, 2),
      legL: P('M 44 78 C 41 83 36 86 35 90.5 C 41 91.5 47 89.5 48 84 Z', c3, 2.4),
      legR: P(mirror('M 44 78 C 41 83 36 86 35 90.5 C 41 91.5 47 89.5 48 84 Z'), c3, 2.4),
      head: G('q-puff', [50, 60], C(50, 55, 26.5, c1, 3.2)
          + shade('M 70 38 C 80 50 79 68 66 77 C 58 82 48 83 40 80 C 56 80 72 68 70 38 Z')
          + E(50, 68, 15, 9, '#fff', 0, 'opacity=".3" class="fo"')
          + shine('M 30 46 C 32 38 39 32 47 31', 3, 0.7) + hl(30, 52, 1.9))
        + gesicht({ x: [38.5, 61.5], y: 51, r: 8, p: 0.3, lookc: 'lk-dart',
            brow: { dy: 1.8, a: -18, l: 5, w: 2.4, k: 0.4 }, bx: [29.5, 70.5], by: 63, bw: 5, bh: 3.2, blush: c4,
            mx: 50, my: 66, mw: 4,
            mouths: { normal: E(50, 66, 4, 3.3, '#ff9db0', 2) + E(50, 66, 1.7, 1.3, MOUTH, 0),
                      sad: E(50, 66.5, 3.4, 2.8, '#ff9db0', 2) + L('M 48 67.2 Q 50 65.6 52 67.2', INK, 1.2) } })
        + G('cap', null, '<g transform="rotate(-9 50 29)">' + P('M 37 31 L 63 31 L 60.5 24.5 C 56 21.5 44 21.5 39.5 24.5 Z', '#fff', 2.4)
          + P('M 36.5 29.5 L 63.5 29.5 L 64 33 L 36 33 Z', c2, 2) + C(50, 21, 2.6, c4, 1.8) + '</g>'),
      back: L('M 36 48 Q 50 42 64 48', '#fff', 2.4, 'opacity=".4"'),
      armL: G('fin', null, P(fin3, c3, 2.6) + L('M 13 55 L 22 55 M 14 59.5 L 22 57.5', INK, 1, 'opacity=".45"')),
      armR: G('fin', null, P(mirror(fin3), c3, 2.6) + L(mirror('M 13 55 L 22 55 M 14 59.5 L 22 57.5'), INK, 1, 'opacity=".45"')),
      fx: P('M 79 27 C 76.6 31 76.6 33.6 79 33.6 C 81.4 33.6 81.4 31 79 27 Z', '#8fdcff', 1.1, 'class="q-sweat"')
        + C(86, 46, 2.2, '#fff', 1.1, 'class="bubble" stroke="var(--c2)" fill-opacity=".55"')
        + C(14, 34, 1.7, '#fff', 1, 'class="bubble" style="animation-delay:-1.4s" stroke="var(--c2)" fill-opacity=".55"')
    });

    /* ── 4 Snooze · Schlafbär mit Zipfelmütze ────────────────── */
    W.add(4, {
      typ: 'Der Dauermüde', spruch: 'Nur noch fünf Minuten …',
      o: { al: [33, 69], ar: [67, 69], ll: [40, 86], lr: [60, 86], head: [50, 66], zz: [76, 34] },
      legL: E(40, 88.5, 7, 4, c2, 2.4) + E(40, 88, 3.4, 1.9, c4, 0, 'opacity=".8"'),
      legR: E(60, 88.5, 7, 4, c2, 2.4) + E(60, 88, 3.4, 1.9, c4, 0, 'opacity=".8"'),
      body: E(50, 75.5, 19, 14.5, c1, 3) + E(50, 78, 11.5, 9, c4, 0, 'class="fo"'),
      head: G('q-nod', [50, 66],
          G('ear-l', [29, 34], C(27, 33, 8, c2, 3) + C(27, 33, 4, c4, 0))
        + G('ear-r', [71, 34], C(73, 33, 8, c2, 3) + C(73, 33, 4, c4, 0))
        + E(50, 48, 25, 21, c1, 3.2)
        + shade('M 70 38 C 77 48 74 61 62 67 C 69 59 72 49 70 38 Z')
        + G('fo', null, E(40, 48, 6.6, 7.8, 'var(--c5)', 0, 'transform="rotate(22 40 48)"') + E(60, 48, 6.6, 7.8, 'var(--c5)', 0, 'transform="rotate(-22 60 48)"')
          + E(50, 58.5, 9.5, 6.8, c4, 2.2))
        + gesicht({ x: [40, 60], y: 48, r: 5.8, lid: [0.68, -12], lidc: 'var(--c6)', look: [0, 0.4], p: 0.5, bags: INK,
            bx: [32, 68], by: 57.5, mx: 50, my: 60.6, mw: 2.4, m: 'smile', mlw: 1.8,
            extra: E(50, 56, 3.3, 2.3, INK, 0) + hl(49, 55.3, 0.8, 0.8)
              + G('only-sleep', null, G('gum', null, C(57, 55, 5, '#bfe9ff', 1.3, 'fill-opacity=".75"') + hl(55.4, 53.2, 1.2, 0.9))) })
        + G('cap', null, P('M 27 36 C 25 20 38 12 52 13 C 66 14 77 23 80 37 C 62 28 44 28 27 36 Z', c3, 2.8)
          + C(42, 21, 1.5, '#fff', 0, 'opacity=".7"') + C(56, 19, 1.5, '#fff', 0, 'opacity=".7"') + C(67, 25, 1.4, '#fff', 0, 'opacity=".7"')
          + G('sway', [78, 33], P('M 73 28 C 82 28 88 36 87 46 L 82 46 C 82 39 79 35 74 35 Z', c3, 2.6) + C(84.5, 49, 4.6, '#fff', 2.2))
          + P('M 25 37 C 42 28 62 28 82 38 L 80.5 42 C 62 33 43 33 26.5 41 Z', '#fff', 2.2))),
      back: E(50, 50, 8, 5, c2, 0, 'opacity=".25"'),
      armL: tube('M 33 69 Q 27 74 30 80', c1, 5.5)
        + '<g transform="rotate(-14 24 78)">' + R(13, 71, 20, 14, 5, '#fff', 2.4) + L('M 18 72 L 18 84 M 23 72 L 23 84 M 28 72 L 28 84', c3, 1.4, 'opacity=".7"') + '</g>'
        + C(30.5, 80.5, 3.4, c2, 2),
      armR: tube('M 67 69 Q 73 74 71 81', c1, 5.5) + C(71, 82, 3.4, c2, 2)
    });

    /* ── 5 Beep · Roboter ────────────────────────────────────── */
    W.add(5, {
      typ: 'Der Neugierige', spruch: 'Was ist das? Kann man das aufschrauben?',
      vars: '--fx:var(--c4)',
      o: { al: [31, 71], ar: [69, 71], ll: [42, 84], lr: [58, 84], head: [50, 66] },
      legL: R(38, 80, 8, 9, 2.5, c2, 2.4) + R(35, 86.5, 13, 5, 2.5, c1, 2.4),
      legR: R(54, 80, 8, 9, 2.5, c2, 2.4) + R(52, 86.5, 13, 5, 2.5, c1, 2.4),
      body: R(35, 64, 30, 20, 7, c1, 3) + R(41, 69, 18, 10, 3, c3, 2, 'class="fo"')
        + C(46, 74, 1.8, c4, 0, 'class="led fo"') + L('M 50 74 L 56 74', c4, 1.6, 'class="fo" opacity=".8"'),
      head: G('q-tilt', [50, 64],
          G('antenna', [59, 22], L('M 59 23 L 63 13 L 70 11', INK, 5.2) + L('M 59 23 L 63 13 L 70 11', c2, 2.4) + C(71, 10.5, 3.6, c4, 2.2, 'class="glow"'))
        + R(15.5, 37, 7, 13, 3, c2, 2.4) + R(77.5, 37, 7, 13, 3, c2, 2.4)
        + R(20, 22, 60, 42, 14, c1, 3.2)
        + shade('M 74 30 C 79 36 79 54 74 60 C 70 63 66 64 62 64 C 72 60 76 46 74 30 Z')
        + R(26, 27.5, 48, 31, 10, c3, 2.4)
        + shine('M 24 34 C 24 29 27 26 31 25', 2.2, 0.6)
        + G('fo', null, C(39.5, 43, 11, c2, 2.4) + C(39.5, 43, 8.6, c3, 0)
          + R(28.5, 30, 5, 3, 1.2, c2, 1.6, 'transform="rotate(-38 31 31.5)"'))
        + gesicht({ x: [39.5, 62.5], y: [43, 41], r: [7.8, 4.2], sc: '#f2feff', iris: c4, p: 0.38, look: [0.2, 0.05], lookc: 'lk-lr',
            col: c4, blush: false, mc: c4, mf: c4, m: 'smirk', ms: 1, mx: 56, my: 52.5, mw: 4.2,
            brow: { dy: 1.4, a: -16, l: 3.6, w: 2, c: c4, k: 0.4, only: 1 } })),
      back: R(38, 34, 24, 14, 3, c2, 2) + L('M 42 38 L 58 38 M 42 42 L 58 42 M 42 46 L 52 46', INK, 1.2, 'opacity=".4"'),
      armL: tube('M 31 71 Q 24 74 23 80', c2, 3.6) + P('M 19 80 C 19 77.5 27 77.5 27 80 L 26.4 85 L 24 83 L 23 85.6 L 22 83 L 19.6 85 Z', c1, 2),
      armR: tube('M 69 71 Q 76 74 77 80', c2, 3.6) + P('M 73 80 C 73 77.5 81 77.5 81 80 L 80.4 85 L 78 83 L 77 85.6 L 76 83 L 73.6 85 Z', c1, 2),
      fx: '<text x="80" y="24" font-size="13" font-weight="800" fill="var(--c4)" stroke="' + '#1e1b2e' + '" stroke-width=".6" class="q-spark" style="font-family:system-ui,sans-serif">?</text>'
    });

    /* ── 6 Chompy · kleiner Drache ───────────────────────────── */
    const wing6 = 'M 37 64 C 28 52 17 51 9 56 L 17 61 L 11 67 L 21 68.5 L 19 76 C 28 74 35 70 37 66 Z';
    W.add(6, {
      typ: 'Der Möchtegern-Gefährliche', spruch: 'Rooaar! … War das gruselig? Ein bisschen?',
      vars: '--fx:var(--c3)',
      o: { al: [37, 71], ar: [63, 71], ll: [42, 86], lr: [58, 86], head: [50, 68] },
      behind: G('wing-l', [37, 65], P(wing6, c4, 2.6) + L('M 35 64 L 17 61 M 35 66 L 21 68.5', INK, 1.1, 'opacity=".4"'))
        + G('wing-r', [63, 65], P(mirror(wing6), c4, 2.6) + L(mirror('M 35 64 L 17 61 M 35 66 L 21 68.5'), INK, 1.1, 'opacity=".4"'))
        + G('tail', [60, 83], tube('M 60 83 C 72 88 84 84 86 74', c1, 5) + P('M 86 76 L 80 68 L 87 61 L 93 69 Z', c3, 2.2)),
      legL: E(42, 88.5, 6.6, 3.8, c1, 2.4) + L('M 38.5 90 l 0 -2 M 42 90.6 l 0 -2 M 45.5 90 l 0 -2', '#fff', 1.5),
      legR: E(58, 88.5, 6.6, 3.8, c1, 2.4) + L('M 54.5 90 l 0 -2 M 58 90.6 l 0 -2 M 61.5 90 l 0 -2', '#fff', 1.5),
      body: E(50, 77, 14, 12, c1, 3) + G('fo', null, E(50, 79.5, 8.5, 8, c2, 1.8) + L('M 43.5 76 Q 50 78 56.5 76 M 43 80.5 Q 50 82.5 57 80.5', INK, 1, 'opacity=".4"')),
      head: P('M 34 31 L 29 15 L 43 25 Z', c3, 2.4) + P(mirror('M 34 31 L 29 15 L 43 25 Z'), c3, 2.4)
        + P('M 44 26 L 46.5 18.5 L 50 24.5 L 53.5 17.5 L 56 26 Z', c3, 2.2)
        + E(50, 46, 27, 21.5, c1, 3.2)
        + shade('M 72 36 C 80 46 77 60 64 67 C 72 59 75 48 72 36 Z')
        + shine('M 27 42 C 28 35 32 30 37 28', 2.6, 0.5)
        + G('fo', null, E(50, 58, 15.5, 9.5, c1, 2.6) + E(50, 53.2, 14, 5, c1, 0)
          + E(44.5, 55, 1.5, 1.9, INK, 0) + E(55.5, 55, 1.5, 1.9, INK, 0))
        + gesicht({ x: [37.5, 62.5], y: 42, r: 7, iris: c3, p: 0.46, look: [[0.2, 0.05], [-0.2, 0.05]], lookc: 'lk-lr',
            brow: { dy: 1.8, a: 9, l: 5, w: 2.6, k: 1.2 }, bx: [28, 72], by: 53,
            mx: 50, my: 61.5, mw: 7, teeth: true,
            mouths: { normal: L('M 39.5 60 Q 50 68 60.5 60', INK, 2.4)
              + P('M 42.6 62.6 L 44.4 58 L 46.2 63.8 Z', '#fff', 1.2) + P('M 53.8 63.8 L 55.6 58 L 57.4 62.6 Z', '#fff', 1.2) } }),
      back: P('M 46 36 L 50 30 L 54 36 Z M 46 46 L 50 40 L 54 46 Z M 46 56 L 50 50 L 54 56 Z', c3, 1.6),
      armL: tube('M 37 71 Q 30 71 28 65', c1, 4.6) + L('M 26 63 l -1.4 -2.6 M 28 62.4 l 0 -3 M 30 63 l 1.4 -2.6', '#fff', 1.6),
      armR: tube('M 63 71 Q 70 71 72 65', c1, 4.6) + L('M 70 63 l -1.4 -2.6 M 72 62.4 l 0 -3 M 74 63 l 1.4 -2.6', '#fff', 1.6),
      fx: C(60, 51, 2.6, '#d5dbe6', 1, 'class="steam"') + C(40, 51, 2.2, '#d5dbe6', 1, 'class="steam" style="animation-delay:-1.1s"')
    });

    /* ── 7 Nubi · Wolke ──────────────────────────────────────── */
    const sunRays = (cx, cy) => { let s = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; s += 'M ' + (cx + Math.cos(a) * 11.5).toFixed(1) + ' ' + (cy + Math.sin(a) * 11.5).toFixed(1) + ' L ' + (cx + Math.cos(a) * 15.5).toFixed(1) + ' ' + (cy + Math.sin(a) * 15.5).toFixed(1) + ' '; } return s; };
    W.add(7, {
      typ: 'Die Träumerin', spruch: 'Schaut nach oben und denkt an etwas Schönes.',
      vars: '--fx:var(--c3)',
      o: { al: [20, 66], ar: [80, 66], ll: [42, 80], lr: [58, 80], head: [50, 80], cl: [22, 14], zz: [70, 22] },
      behind: G('sunb', null, G('spin', [75, 27], L(sunRays(75, 27), INK, 4.4) + L(sunRays(75, 27), c3, 2.2)) + C(75, 27, 9.5, c3, 2.6)),
      legL: tube('M 42 78 L 42 86', c2, 3) + E(40.5, 89, 5.4, 3.1, c2, 2.2),
      legR: tube('M 58 78 L 58 86', c2, 3) + E(59.5, 89, 5.4, 3.1, c2, 2.2),
      head: P('M 25 79 C 11 79 9 62 21 58 C 17 45 30 37 40 43 C 44 31 63 31 67 43 C 79 38 90 50 83 60 C 93 64 91 79 77 79 Z', c1, 3.2)
        + shade('M 81 60 C 90 65 88 77 77 77 L 60 77 C 74 75 82 70 81 60 Z', 0.1)
        + shine('M 23 58 C 21 51 26 46 32 45', 2.6, 0.8)
        + gesicht({ x: [40, 60], y: 59, r: 6.6, look: [0.3, -0.45], lookc: 'lk-up', lash: true, p: 0.56, iris: c2,
            blush: c4, bw: 5, bh: 2.8, bx: [31.5, 68.5], by: 67.5, m: 'smile', mx: 50, my: 68.5, mw: 3 }),
      back: L('M 36 56 Q 44 51 52 56 M 50 66 Q 58 61 66 66', INK, 1.4, 'opacity=".2"'),
      armL: tube('M 20 66 Q 13 70 14 77', c1, 5),
      armR: tube('M 80 66 Q 87 70 86 77', c1, 5),
      fx: G('rainfx', null, [30, 42, 58, 70].map((x, i) => L('M ' + x + ' 82 l -1.2 4', '#4aa8ff', 2, 'class="rain" style="animation-delay:' + (i * 0.2) + 's"')).join(''))
        + P('M 19 28 C 16.5 24.5 20 22 22 25 C 24 22 27.5 24.5 25 28 L 22 31.5 Z', c4, 1.2, 'class="bubble"')
        + tw(12, 46, 2.6, c3, 0.6)
    });

    /* ── 8 Zorp · Alien ──────────────────────────────────────── */
    W.add(8, {
      typ: 'Der Verpeilte', spruch: 'Falscher Planet. Findet es trotzdem super.',
      vars: '--fx:var(--c3)',
      o: { al: [33, 71], ar: [67, 71], ll: [43, 86], lr: [57, 86], head: [50, 68] },
      behind: E(50, 50, 36, 38, c3, 0, 'class="pulse"'),
      legL: P('M 38 83 L 47 83 L 47 90.6 L 35 90.6 C 34 87 35.5 84.5 38 83 Z', c2, 2.4),
      legR: P(mirror('M 38 83 L 47 83 L 47 90.6 L 35 90.6 C 34 87 35.5 84.5 38 83 Z'), c2, 2.4),
      body: P('M 39 65 C 39 61 61 61 61 65 L 64 83 C 59 87.5 41 87.5 36 83 Z', c1, 3) + G('fo', null, C(50, 76, 3.6, c3, 1.8) + C(50, 76, 1.3, INK, 0, 'opacity=".5"')),
      head: G('antenna sway', [50, 20], L('M 50 21 C 49 13 57 12 60 7', INK, 5) + L('M 50 21 C 49 13 57 12 60 7', c1, 2.4) + C(61, 6.5, 4.2, c3, 2.2, 'class="glow"'))
        + P('M 50 18 C 71 18 81 32 79 46 C 77 60 66 67 50 67 C 34 67 23 60 21 46 C 19 32 29 18 50 18 Z', c1, 3.2)
        + C(29, 33, 2.8, c2, 0, 'opacity=".3"') + C(71.5, 30, 2.2, c2, 0, 'opacity=".3"') + C(66, 23.5, 1.5, c2, 0, 'opacity=".3"') + C(33, 26, 1.4, c2, 0, 'opacity=".3"')
        + shade('M 75 34 C 81 44 78 58 65 64 C 73 57 77 46 75 34 Z')
        + shine('M 26 40 C 26 32 31 26 37 23', 2.6, 0.55)
        + gesicht({ x: [50], y: 40, r: 13.5, ex: 1, p: 0.34, iris: c4, look: [0.15, 0.1], lookc: 'lk-roll', lid: [0.16, -8],
            bx: [28.5, 71.5], by: 52, m: 'tongue', ms: 1, mx: 50, my: 58.5, mw: 6 }),
      back: C(42, 36, 3, c2, 0, 'opacity=".3"') + C(58, 46, 4, c2, 0, 'opacity=".3"') + C(46, 54, 2.2, c2, 0, 'opacity=".3"'),
      armL: tube('M 33 71 Q 25 76 25 84', c1, 3.4) + C(22.5, 85, 2, c1, 1.6) + C(25, 86.8, 2, c1, 1.6) + C(27.5, 85, 2, c1, 1.6),
      armR: tube('M 67 71 Q 75 76 75 84', c1, 3.4) + C(72.5, 85, 2, c1, 1.6) + C(75, 86.8, 2, c1, 1.6) + C(77.5, 85, 2, c1, 1.6),
      fx: tw(14, 22, 3, c3, 0) + tw(88, 40, 2.4, c4, 0.9) + tw(12, 70, 2.2, c4, 1.6)
    });

    /* ── 9 Lotti · Axolotl ───────────────────────────────────── */
    const gill = tube('M 28 38 Q 18 29 10 28', c2, 4.2) + tube('M 25 46 Q 13 44 6 47', c2, 4.2) + tube('M 27 54 Q 17 58 11 65', c2, 4.2);
    const gillR = tube(mirror('M 28 38 Q 18 29 10 28'), c2, 4.2) + tube(mirror('M 25 46 Q 13 44 6 47'), c2, 4.2) + tube(mirror('M 27 54 Q 17 58 11 65'), c2, 4.2);
    W.add(9, {
      typ: 'Die Strahlende', spruch: 'Findet einfach alles toll. Dich auch.',
      vars: '--fx:var(--c3)',
      o: { al: [37, 73], ar: [63, 73], ll: [43, 86], lr: [57, 86], head: [50, 70] },
      behind: G('tail', [60, 82], P('M 58 77 C 72 75 84 80 91 69 C 93 80 84 90 61 88 Z', c1, 2.6) + L('M 66 79 C 76 79 84 78 89 73', c2, 2, 'opacity=".7"')),
      legL: E(43, 88.5, 6, 3.6, c1, 2.4), legR: E(57, 88.5, 6, 3.6, c1, 2.4),
      body: E(50, 78, 13, 11, c1, 3) + E(50, 80.5, 8, 7, c4, 0, 'opacity=".85" class="fo"'),
      head: G('ear-l', [27, 46], gill) + G('ear-r', [73, 46], gillR)
        + E(50, 47, 28, 20, c1, 3.2)
        + shade('M 73 37 C 81 46 78 59 65 65 C 73 58 76 47 73 37 Z', 0.1)
        + shine('M 26 44 C 27 38 31 33 36 31', 2.6, 0.7)
        + gesicht({ t: 'dot', x: [31, 69], y: 44, r: 4.4, lookc: 'lk-lr', bx: [29.5, 70.5], by: 53, bw: 4.6, bh: 2.6,
            mx: 50, my: 49, mw: 10,
            extra: C(40, 38, 0.9, c2, 0, 'opacity=".7"') + C(43.5, 36.5, 0.9, c2, 0, 'opacity=".7"') + C(56.5, 36.5, 0.9, c2, 0, 'opacity=".7"') + C(60, 38, 0.9, c2, 0, 'opacity=".7"'),
            mouths: { normal: P('M 40 49.5 Q 50 64 60 49.5 Z', MOUTH, 2.4) + E(50, 56.4, 3.6, 2.2, TONGUE, 0),
                      open: P('M 38 48.5 Q 50 68 62 48.5 Z', MOUTH, 2.4) + E(50, 58.4, 4.6, 2.8, TONGUE, 0),
                      sad: L('M 42 55 Q 50 49 58 55', INK, 2.4), sleep: E(50, 53, 1.8, 2.2, MOUTH, 0), wow: E(50, 54, 3, 3.6, MOUTH, 1.6) } })
        + G('tiara', null, '<g transform="rotate(9 56 27)">' + P('M 49 29 L 50.5 21 L 54 26 L 56 18.5 L 58 26 L 61.5 21 L 63 29 Z', c3, 2) + C(56, 25.6, 1.3, c2, 0) + '</g>'),
      back: L('M 44 40 Q 50 43 56 40', INK, 1.2, 'opacity=".25"'),
      armL: tube('M 37 73 Q 30 75 28 70', c1, 4.4),
      armR: tube('M 63 73 Q 70 75 72 70', c1, 4.4),
      fx: tw(16, 20, 2.6, c3, 0.3) + tw(86, 24, 2.2, c3, 1.3)
    });
  })();

  /* ── Wesen 10 … 19 ─────────────────────────────────────────── */
  (function () {
    const W = W3;
    const { INK, P, E, C, R, L, G, tube, shine, hl, shade, tw, mirror, gesicht, MOUTH, TONGUE } = W.kit;
    const c1 = 'var(--c1)', c2 = 'var(--c2)', c3 = 'var(--c3)', c4 = 'var(--c4)', c5 = 'var(--c5)';

    /* ── 10 Grumbl · Felsbrocken ─────────────────────────────── */
    const fist10 = 'M 24 57 C 13 59 9 70 12 79 C 14 86 25 86 27 78 C 28.5 70 28 62 24 57 Z';
    W.add(10, {
      typ: 'Der Grummler', spruch: 'Brummt den ganzen Tag. Gießt heimlich seine Blume.',
      vars: '--fx:var(--c3)',
      o: { al: [24, 60], ar: [76, 60], ll: [40, 82], lr: [60, 82], head: [50, 80] },
      behind: P('M 70 34 L 78 18 L 84 36 Z', c3, 2.2, 'class="glow-soft"') + P('M 78 40 L 88 30 L 88 46 Z', c3, 2, 'class="glow-soft"'),
      legL: R(32, 79, 15, 12, 4, c2, 2.6), legR: R(53, 79, 15, 12, 4, c2, 2.6),
      head: P('M 29 35 L 51 27 L 72 34 L 81 52 L 77 71 L 59 79 L 37 78 L 22 64 L 21 47 Z', c1, 3.4)
        + shade('M 72 34 L 81 52 L 77 71 L 59 79 L 66 60 L 68 44 Z', 0.16)
        + L('M 29 35 L 37 44 M 59 79 L 56 70 M 22 64 L 30 62', INK, 1.3, 'opacity=".35"')
        + shine('M 27 44 L 30 38 L 38 35', 2.4, 0.4)
        + gesicht({ x: [39, 61], y: 53, r: 5, p: 0.5, lid: [0.2, 10], lidc: c1, look: [[0.2, 0.2], [-0.2, 0.2]], lookc: 'lk-slow',
            blush: false, mx: 50, my: 66.5, mw: 7.5, m: 'frown', mlw: 2.8,
            post: P('M 54 66.4 L 55.4 62 L 57.4 67.4 Z', '#fff', 1.2) })
        + G('fo', null, P('M 26 44 L 50 49 L 74 44 L 75.5 50 L 50 55.5 L 24.5 50 Z', c2, 2.8))
        + P('M 31 34 C 34 28 42 27 46 29 C 49 25 57 25 60 29 L 54 33 C 48 30 40 33 34 37 Z', c4, 2.2)
        + G('sway', [42, 28], L('M 42 28 C 41 23 42 20 43 17', INK, 3.6) + L('M 42 28 C 41 23 42 20 43 17', '#3fa34d', 1.8)
          + C(40.2, 14.6, 2.3, '#fff', 1.4) + C(45.6, 14.6, 2.3, '#fff', 1.4) + C(43, 11.6, 2.3, '#fff', 1.4) + C(43, 17.4, 2.3, '#fff', 1.4) + C(43, 14.6, 1.8, '#ffd23f', 1.2)),
      back: L('M 38 44 L 48 52 L 44 62 M 60 40 L 56 50', INK, 1.6, 'opacity=".35"'),
      armL: P(fist10, c1, 2.8) + L('M 15 78 L 24 78', INK, 1.2, 'opacity=".35"'),
      armR: P(mirror(fist10), c1, 2.8) + L('M 76 78 L 85 78', INK, 1.2, 'opacity=".35"'),
      fx: tw(88, 22, 2.4, c3, 0.5)
    });

    /* ── 11 Mochi · Reiskuchen-Koch ──────────────────────────── */
    W.add(11, {
      typ: 'Der Feinschmecker', spruch: 'Probiert nur kurz. Zum fünften Mal.',
      o: { al: [20, 66], ar: [80, 66], ll: [39, 86], lr: [61, 86], head: [50, 88], zz: [78, 30] },
      legL: E(39, 88.6, 6.5, 3.5, c2, 2.4), legR: E(61, 88.6, 6.5, 3.5, c2, 2.4),
      head: P('M 50 32 C 71 32 84 46 84 64 C 84 80 74 88 50 88 C 26 88 16 80 16 64 C 16 46 29 32 50 32 Z', c1, 3.2)
        + shade('M 80 52 C 86 66 82 82 66 86 C 76 80 81 68 80 52 Z', 0.1)
        + shine('M 23 58 C 23 49 28 42 35 38', 3, 0.9)
        + C(30, 76, 1, c2, 0) + C(68, 80, 1, c2, 0) + C(74, 70, 0.9, c2, 0)
        + gesicht({ t: 'arc', x: [37, 63], y: 59, r: 5.6, happy: 'gt',
            blush: 'var(--c4)', bx: [29, 71], by: 67, bw: 6, bh: 3.6,
            brow: { dy: 3, a: -8, l: 4.2, w: 2, k: 1.6 },
            m: 'tongue', ms: 1, mx: 50, my: 68.5, mw: 4.6 })
        + G('hat', null, '<g transform="rotate(10 50 34)">'
          + P('M 36 35 C 29 31 29 20 38 19 C 40 11 53 10 56 16 C 63 12 72 18 68 27 C 71 30 69 34 64 35.5 Z', c3, 2.6)
          + R(35.5, 32, 29, 6.5, 2.5, c3, 2.4) + L('M 44 22 L 44 30 M 52 20 L 52 30 M 60 23 L 60 30', INK, 1.1, 'opacity=".25"') + '</g>'),
      back: L('M 36 60 Q 50 54 64 60', c2, 2, 'opacity=".6"'),
      armL: tube('M 20 66 Q 13 70 15 77', c1, 5),
      armR: tube('M 80 66 Q 87 68 87 74', c1, 5)
        + G('whisk', null, L('M 88 76 L 92 56', INK, 4.2) + L('M 88 76 L 92 56', '#c9a26a', 2) + E(92.6, 50, 4.4, 6, '#f1f5f9', 2.2) + L('M 91 47 L 91.6 53', INK, 1, 'opacity=".3"'))
    });

    /* ── 12 Sprout · Radieschen ──────────────────────────────── */
    const leaf12 = (d) => P(d, c3, 2.6);
    W.add(12, {
      typ: 'Der Draufgänger', spruch: 'Hat vor nichts Angst. Außer vor Salat.',
      vars: '--fx:var(--c3)',
      o: { al: [25, 62], ar: [75, 62], ll: [42, 85], lr: [58, 85], head: [50, 88] },
      behind: G('tail', [76, 46], P('M 74 44 L 86 40 L 84 46 L 91 48 L 76 50 Z', '#fff', 2)),
      legL: tube('M 42 83 L 42 88', c4, 3.4) + E(40.5, 89.4, 5.6, 3, c4, 2.2),
      legR: tube('M 58 83 L 58 88', c4, 3.4) + E(59.5, 89.4, 5.6, 3, c4, 2.2),
      head: G('sway', [50, 32], leaf12('M 49 33 C 40 28 34 18 37 9 C 45 12 50 22 51 32 Z')
          + leaf12('M 51 33 C 52 22 58 13 67 11 C 68 20 62 29 53 34 Z')
          + leaf12('M 50 34 C 46 24 48 13 52 6 C 57 13 57 25 52 34 Z') + L('M 51 31 L 52 12', INK, 1, 'opacity=".3"'))
        + P('M 50 30 C 69 30 80 44 78 60 C 76 76 62 86 50 88 C 38 86 24 76 22 60 C 20 44 31 30 50 30 Z', c1, 3.2)
        + shade('M 74 46 C 80 60 74 76 58 84 C 68 74 76 62 74 46 Z')
        + E(50, 78, 11, 7, c2, 0, 'opacity=".5" class="fo"')
        + shine('M 28 52 C 29 44 33 38 39 35', 2.8, 0.6)
        + G('fo', null, P('M 23.5 46 C 40 41 60 41 76.5 46 L 77.5 51.5 C 60 46.5 40 46.5 22.5 51.5 Z', '#fff', 2.2))
        + gesicht({ x: [38.5, 61.5], y: 58, r: 6.4, p: 0.5, look: [[0.15, 0], [-0.15, 0]], lookc: 'lk-lr',
            brow: { dy: 1.4, a: 8, l: 5, w: 2.6, k: 1 }, bx: [29, 71], by: 68,
            m: 'grin', mx: 50, my: 71, mw: 7, teeth: true,
            extra: '<g transform="rotate(-20 68 66)">' + R(63.5, 64, 9, 4, 1.6, '#f6d7b0', 1.4) + L('M 67 65 L 67 67 M 69 65 L 69 67', INK, 0.8, 'opacity=".5"') + '</g>',
            post: R(48.8, 71, 2.4, 6.6, 0, MOUTH, 0) }),
      back: P('M 23.5 46 C 40 41 60 41 76.5 46 L 77.5 51.5 C 60 46.5 40 46.5 22.5 51.5 Z', '#fff', 2.2),
      armL: tube('M 25 62 Q 16 62 15 54', c1, 4.6) + C(15, 52.5, 4.2, c1, 2.4),
      armR: tube('M 75 62 Q 84 62 85 54', c1, 4.6) + C(85, 52.5, 4.2, c1, 2.4)
    });

    /* ── 13 Bzz · Biene ──────────────────────────────────────── */
    W.add(13, {
      typ: 'Die Fleißige', spruch: 'Keine Zeit! Keine Zeit! … Oh, eine Blume.',
      o: { al: [35, 70], ar: [65, 70], ll: [43, 86], lr: [57, 86], head: [50, 66] },
      behind: G('wing-l', [38, 62], E(24, 56, 13, 8.5, c3, 2.4, 'transform="rotate(24 24 56)" fill-opacity=".85"'))
        + G('wing-r', [62, 62], E(76, 56, 13, 8.5, c3, 2.4, 'transform="rotate(-24 76 56)" fill-opacity=".85"'))
        + P('M 46 86 L 50 94 L 54 86 Z', c2, 2),
      legL: tube('M 43 84 L 42 89', c2, 3) + E(41, 90, 4.6, 2.4, c2, 1.8),
      legR: tube('M 57 84 L 58 89', c2, 3) + E(59, 90, 4.6, 2.4, c2, 1.8),
      body: E(50, 76, 15, 12.5, c1, 3)
        + G('fo', null, P('M 36.5 71 Q 50 67 63.5 71 L 64.6 75.5 Q 50 71.5 35.4 75.5 Z', c2, 0) + P('M 35.6 79 Q 50 75.5 64.4 79 L 62.6 83.5 Q 50 80 37.4 83.5 Z', c2, 0)),
      head: G('antenna', [42, 24], L('M 42 25 C 40 17 36 13 32 12', INK, 2.4) + C(31, 12, 2.8, c2, 0))
        + G('antenna', [58, 24], L('M 58 25 C 60 17 64 13 68 12', INK, 2.4) + C(69, 12, 2.8, c2, 0))
        + C(50, 44, 23.5, c1, 3.2)
        + shade('M 68 30 C 76 40 75 54 64 63 C 70 54 72 42 68 30 Z')
        + shine('M 30 40 C 31 33 35 28 41 25', 2.6, 0.6)
        + G('fo', null, P('M 27 40 Q 50 30 73 40 L 73.5 45 Q 50 36 26.5 45 Z', '#7a4a24', 2)
          + C(39, 45, 10, '#7a4a24', 2.6) + C(61, 45, 10, '#7a4a24', 2.6) + R(47, 43, 6, 3.6, 1.2, '#7a4a24', 1.8))
        + gesicht({ x: [39, 61], y: 45, r: 7.2, ex: 1, sc: '#e9fbff', p: 0.36, look: [[0.3, 0.1], [-0.3, 0.1]], lookc: 'lk-dart',
            bx: [31, 69], by: 58.5, m: 'zig', mx: 50, my: 60.5, mw: 4.6,
            post: hl(35.4, 41, 1.5, 0.9) + hl(57.4, 41, 1.5, 0.9) }),
      back: P('M 28 42 Q 50 34 72 42 L 72 47 Q 50 39 28 47 Z', '#7a4a24', 2),
      armL: tube('M 35 70 Q 28 73 27 78', c2, 3)
        + P('M 20.5 78 L 33.5 78 L 32 88 C 32 89.5 22 89.5 22 88 Z', c4, 2.2) + L('M 21 78 Q 27 72 33 78', INK, 1.6) + E(27, 78.4, 5.6, 1.6, '#ffb300', 1.2),
      armR: tube('M 65 70 Q 72 73 73 79', c2, 3) + C(73, 80, 2.4, c2, 0),
      fx: P('M 78 24 C 75.6 28 75.6 30.6 78 30.6 C 80.4 30.6 80.4 28 78 24 Z', '#8fdcff', 1.1, 'class="q-sweat"')
    });

    /* ── 14 Crunch · Toaster ─────────────────────────────────── */
    W.add(14, {
      typ: 'Der Frühaufsteher', spruch: 'GUTEN MORGEN! Es ist 5:30 Uhr!',
      o: { al: [21, 62], ar: [79, 62], ll: [38, 84], lr: [62, 84], head: [50, 86], zz: [80, 28] },
      behind: G('tail', [76, 78], L('M 76 78 C 88 80 90 70 86 62', INK, 4.6) + L('M 76 78 C 88 80 90 70 86 62', '#475569', 2.2)
          + R(82, 54, 8, 8.5, 2, '#475569', 2) + L('M 84 54 L 84 49.5 M 88 54 L 88 49.5', INK, 1.8))
        + G('toast', null, P('M 35 46 L 35 28 C 30 24 34 17 41 19 C 45 14 55 14 59 19 C 66 17 70 24 65 28 L 65 46 Z', c3, 2.6)
          + P('M 39 44 L 39 30 C 37 26 40 23 44 24 C 47 20 53 20 56 24 C 60 23 63 26 61 30 L 61 44 Z', '#ffe2a8', 0)),
      legL: R(32, 83, 13, 7.6, 3, c2, 2.4), legR: R(55, 83, 13, 7.6, 3, c2, 2.4),
      head: R(20, 36, 60, 49, 14, c1, 3.2)
        + shade('M 74 42 C 79 48 79 74 74 81 C 70 84.5 66 85 62 85 C 72 80 76 62 74 42 Z', 0.12)
        + R(30, 33, 40, 7, 3.5, c2, 2.4) + L('M 34 36.5 L 66 36.5', INK, 1.6, 'opacity=".45"')
        + shine('M 25 52 C 25 46 27 42 31 40', 2.6, 0.75)
        + G('fo', null, R(71, 50, 5, 14, 2.5, c2, 2) + R(70, 51, 7, 4.5, 1.8, c4, 1.8))
        + gesicht({ x: [37, 59], y: 54, r: 7.2, p: 0.5, look: [0, -0.1], lookc: 'lk-lr',
            brow: { dy: 2.4, a: -12, l: 5.2, w: 2.6, k: 2.4 }, bx: [27.5, 68], by: 66,
            m: 'grin', mx: 48, my: 68.5, mw: 9, teeth: true,
            post: hl(34.4, 51, 1, 0.95) }),
      back: R(34, 48, 32, 22, 4, c2, 0, 'opacity=".35"') + L('M 38 54 L 62 54 M 38 59 L 62 59 M 38 64 L 62 64', INK, 1.3, 'opacity=".3"'),
      armL: tube('M 21 62 Q 12 64 11 72', '#475569', 3) + C(11, 74, 4.2, '#fff', 2.2),
      armR: tube('M 79 62 Q 88 60 89 52', '#475569', 3) + C(89, 50, 4.2, '#fff', 2.2) + R(87.2, 42.5, 3.4, 6, 1.6, '#fff', 1.8),
      fx: C(44, 6, 2, '#e5e7eb', 0.8, 'class="steam"') + C(56, 8, 1.7, '#e5e7eb', 0.8, 'class="steam" style="animation-delay:-1s"')
    });

    /* ── 15 Tiki · Maske ─────────────────────────────────────── */
    const feather = (x, y, rot, col, len) => '<g transform="rotate(' + rot + ' ' + x + ' ' + y + ')">'
      + P('M ' + x + ' ' + y + ' C ' + (x - 5) + ' ' + (y - len * 0.4) + ' ' + (x - 4) + ' ' + (y - len * 0.85) + ' ' + x + ' ' + (y - len) + ' C ' + (x + 4) + ' ' + (y - len * 0.85) + ' ' + (x + 5) + ' ' + (y - len * 0.4) + ' ' + x + ' ' + y + ' Z', col, 2.2)
      + L('M ' + x + ' ' + (y - 1) + ' L ' + x + ' ' + (y - len + 3), INK, 0.9, 'opacity=".35"') + '</g>';
    W.add(15, {
      typ: 'Der Zeremonienmeister', spruch: 'Nimmt alles sehr feierlich. Auch das Pausenbrot.',
      vars: '--fx:var(--c3)',
      o: { al: [24, 62], ar: [76, 62], ll: [40, 85], lr: [60, 85], head: [50, 86] },
      legL: R(34, 83, 12, 8, 3, c1, 2.4), legR: R(54, 83, 12, 8, 3, c1, 2.4),
      head: G('sway', [50, 28], feather(36, 30, -24, c4, 17) + feather(64, 30, 24, c4, 17) + feather(43, 28, -9, c3, 21) + feather(57, 28, 9, c3, 21) + feather(50, 28, 0, c2, 24))
        + P('M 27 31 C 27 24 73 24 73 31 L 77 76 C 77 86 23 86 23 76 Z', c1, 3.2)
        + shade('M 70 30 L 76 76 C 76 82 68 84 60 84.5 C 68 78 70 54 70 30 Z', 0.16)
        + L('M 29 33 L 71 33', c2, 2.6) + L('M 33 30 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3', INK, 0.9, 'opacity=".35"')
        + G('fo', null, P('M 46.5 46 L 53.5 46 L 56 63 L 44 63 Z', c1, 2.4) + L('M 47 59.5 L 53 59.5', INK, 1.2, 'opacity=".4"')
          + L('M 27 60 L 36 62 M 27 65 L 36 66 M 73 60 L 64 62 M 73 65 L 64 66', c4, 2.6))
        + gesicht({ x: [36.5, 63.5], y: 49, r: 7.4, iris: c4, p: 0.32, sc: '#fff7e6', lid: [0.22, 12], look: [0, 0.1], lookc: 'lk-lr',
            brow: { dy: -0.4, a: 16, l: 8, w: 4.2, c: c2, k: -0.5 }, blush: false,
            m: 'grin', mx: 50, my: 71.5, mw: 12, teeth: true }),
      back: L('M 34 42 L 66 42 M 34 52 L 66 52 M 34 62 L 66 62 M 34 72 L 66 72', INK, 1.4, 'opacity=".3"'),
      armL: tube('M 24 62 Q 16 66 16 75', c1, 4.6) + C(16, 76.5, 3.4, c1, 2.2),
      armR: tube('M 76 62 Q 84 64 86 72', c1, 4.6) + L('M 87 78 L 87 54', INK, 4.6) + L('M 87 78 L 87 54', '#7a4a24', 2.2)
        + G('flick', null, P('M 87 54 C 81 49 84 42 87 37 C 90 42 93 49 87 54 Z', c3, 2) + P('M 87 53 C 84.6 50 86 46.5 87 44 C 88 46.5 89.4 50 87 53 Z', '#ffe14d', 0))
        + C(86.4, 72.5, 3.4, c1, 2.2)
    });

    /* ── 16 Clawdy · Krabbe in der Tasse ─────────────────────── */
    const claw16 = 'M 14 50 C 6 48 4 38 10 33 C 12 31 15 32 14 35 L 13 40 L 18 34 C 20 31 24 33 23 37 C 22 44 19 49 14 50 Z';
    W.add(16, {
      typ: 'Die Aufgedrehte', spruch: 'Hatte schon sechs Espresso. Zählt aber keiner mit.',
      o: { al: [27, 62], ar: [73, 62], ll: [38, 86], lr: [62, 86], head: [50, 56], zz: [78, 22] },
      behind: P('M 71 60 C 86 58 88 76 72 76 L 72 71 C 80 71 79 64 71 65 Z', c1, 2.6),
      legL: tube('M 36 85 L 31 90.5', c4, 3) + tube('M 42 86 L 40 91', c4, 3),
      legR: tube('M 64 85 L 69 90.5', c4, 3) + tube('M 58 86 L 60 91', c4, 3),
      body: P('M 26 54 L 74 54 L 70.5 83 C 70 88 30 88 29.5 83 Z', c1, 3)
        + shade('M 68 56 L 72 56 L 69 83 C 68.6 86 62 87 56 87.4 C 64 82 68 70 68 56 Z', 0.1)
        + G('fo', null, P('M 28.2 66 L 71.8 66 L 71 73 L 29 73 Z', c2, 0) + P('M 50 74.5 C 47 72 43.5 75 46 78 L 50 81.5 L 54 78 C 56.5 75 53 72 50 74.5 Z', c3, 1.4))
        + shine('M 31 58 L 32.5 72', 2.4, 0.8),
      head: G('q-twitch', [50, 46],
          tube('M 42 43 L 38 28', c3, 3.4) + tube('M 58 43 L 63 23', c3, 3.4)
        + P('M 30 55 C 30 37 70 37 70 55 Z', c3, 3)
        + shine('M 35 49 C 36 44 40 41 44 40', 2, 0.5)
        + gesicht({ x: [37.5, 63.5], y: [24.5, 19.5], r: [7, 8], ex: 1, p: 0.24, lookc: 'lk-dart', blush: false,
            m: 'wavy', mx: 50, my: 46, mw: 5.4,
            pre: L('M 32.5 22 l 2.4 1.2 M 33 28 l 2.2 -1 M 69 15 l -2.6 1.4 M 69.6 23 l -2.6 -1', '#ef4444', 0.9, 'opacity=".7"') }))
        + E(50, 55, 24, 4.6, c5, 2.4),
      back: L('M 40 48 Q 50 44 60 48', c4, 2),
      armL: tube('M 27 62 Q 17 62 15 51', c3, 4) + G('claw', null, P(claw16, c3, 2.6)),
      armR: tube('M 73 62 Q 83 62 85 51', c3, 4) + G('claw', null, P(mirror(claw16), c3, 2.6)),
      fx: L('M 24 30 q -3 -4 0 -8 q 3 -4 0 -8', '#cbd5e1', 2, 'class="steam"') + L('M 82 40 q 3 -4 0 -8 q -3 -4 0 -8', '#cbd5e1', 2, 'class="steam" style="animation-delay:-1.1s"')
    });

    /* ── 17 Mimi · Origami-Fuchs ─────────────────────────────── */
    const ear17 = 'M 27 37 L 24 8 L 47 30 Z';
    W.add(17, {
      typ: 'Die Elegante', spruch: 'Macht nie einen Knick. Außer mit Absicht.',
      vars: '--fx:var(--c4)',
      o: { al: [39, 70], ar: [61, 70], ll: [43, 86], lr: [57, 86], head: [50, 68] },
      behind: G('tail', [60, 84], P('M 58 84 L 82 58 L 92 74 L 76 90 Z', c2, 2.6) + P('M 82 58 L 92 74 L 86 66.5 Z', c1, 0) + P('M 82 58 L 88 56 L 92 74 Z', c1, 2.2) + L('M 60 84 L 86 66', INK, 1, 'opacity=".3"')),
      legL: P('M 39 86 L 47 86 L 47 91 L 37 91 Z', c3, 2.2), legR: P('M 53 86 L 61 86 L 63 91 L 53 91 Z', c3, 2.2),
      body: P('M 41 64 L 59 64 L 64 87 L 36 87 Z', c1, 3) + L('M 50 65 L 50 87', INK, 1, 'opacity=".25"')
        + P('M 41 64 L 50 74 L 59 64 Z', c2, 2, 'class="fo"'),
      head: G('ear-l', [32, 34], P(ear17, c2, 3) + P('M 29.5 31 L 28 15 L 40 27 Z', c3, 0))
        + G('ear-r', [68, 34], P(mirror(ear17), c2, 3) + P(mirror('M 29.5 31 L 28 15 L 40 27 Z'), c3, 0))
        + P('M 21 43 L 36 30 L 64 30 L 79 43 L 50 69 Z', c2, 3.2)
        + G('fo', null, P('M 21 43 L 50 51 L 79 43 L 50 69 Z', c1, 2.4) + L('M 50 51 L 50 62', INK, 1, 'opacity=".2"'))
        + shade('M 64 30 L 79 43 L 50 69 L 66 46 Z', 0.1)
        + gesicht({ x: [37.5, 62.5], y: 42, r: 4.8, ex: 1.25, p: 0.56, lid: [0.42, 14], lidc: c2, lash: true, look: [[0.45, 0.1], [0.45, 0.1]], lookc: 'lk-slow',
            blush: false, m: 'cat', mx: 50, my: 60.4, mw: 3.4, mlw: 1.9,
            extra: P('M 47.4 54.8 C 47.4 53.6 52.6 53.6 52.6 54.8 L 50 58.2 Z', INK, 0) + hl(49.2, 55, 0.6, 0.7) + L('M 50 58.2 L 50 60.4', INK, 1.4) }),
      back: L('M 36 30 L 50 69 L 64 30', INK, 1.2, 'opacity=".3"'),
      armL: tube('M 39 70 L 32 76', c1, 4)
        + G('q-bob', null, P(mirror('M 68 76 L 66 58 L 76 56 L 85 60 L 90 68 Z'), c4, 2.2) + L(mirror('M 68 76 L 76 56 M 68 76 L 85 60'), INK, 1, 'opacity=".4"')),
      armR: tube('M 61 70 L 67 79', c1, 4),
      fx: tw(12, 30, 2.6, c4, 0.2) + tw(88, 40, 2.2, c4, 1.2)
    });

    /* ── 18 Fuzz · Staubflocke ───────────────────────────────── */
    const fluff = (cx, cy, r0, r1, k) => {
      let d = '';
      for (let i = 0; i < k * 2; i++) {
        const a = i / (k * 2) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r0 : r1 + (i % 4 ? 0 : 1.5);
        d += (i ? ' L ' : 'M ') + (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1);
      }
      return d + ' Z';
    };
    W.add(18, {
      typ: 'Der Schüchterne', spruch: 'Sagt wenig. Weiß aber die Antwort.',
      o: { al: [36, 70], ar: [64, 70], ll: [42, 82], lr: [58, 82], head: [50, 80] },
      legL: tube('M 42 80 L 42 87', c1, 2.8) + E(40.5, 89.2, 5, 2.8, c1, 2.2),
      legR: tube('M 58 80 L 58 87', c1, 2.8) + E(59.5, 89.2, 5, 2.8, c1, 2.2),
      head: G('antenna', [50, 24], L('M 50 26 C 50 18 56 15 62 17', INK, 2.2) + C(64, 17.6, 3.2, c2, 1.8, 'class="glow"'))
        + P(fluff(50, 54, 25.5, 30.5, 17), c1, 3)
        + G('fo', null, C(38, 54, 11.6, c4, 0, 'opacity=".45"') + C(62, 54, 11.6, c4, 0, 'opacity=".45"'))
        + G('q-peek', null, gesicht({ x: [38, 62], y: 54, r: 8.4, ex: 1, p: 0.56, look: [[-0.3, 0.3], [-0.3, 0.3]], lookc: 'lk-slow',
            brow: { dy: 4.6, a: -14, l: 4.4, w: 2, c: '#fff', k: 0.6 }, blush: '#ff7aa8', bx: [29, 71], by: 67, bw: 4.4,
            m: 'smile', mx: 51.5, my: 70, mw: 2.4, mlw: 2, mc: '#fff',
            post: C(38, 54, 11.6, 'none', 2.8, 'stroke="var(--c3)"') + C(62, 54, 11.6, 'none', 2.8, 'stroke="var(--c3)"') + L('M 48.8 52.5 Q 50 50.6 51.2 52.5', c3, 2.4)
              + L('M 31 47 L 35 43.6', '#fff', 1.6, 'opacity=".8"') + L('M 55 47 L 59 43.6', '#fff', 1.6, 'opacity=".8"') })),
      back: P(fluff(50, 54, 6, 9, 7), INK, 0, 'opacity=".15"'),
      armL: tube('M 36 72 Q 40 78 46 77', c1, 3) + C(47, 77, 2.4, c1, 1.8),
      armR: tube('M 64 72 Q 60 78 54 77', c1, 3) + C(53, 77, 2.4, c1, 1.8),
      fx: C(86, 34, 1.5, c1, 0, 'class="bubble" opacity=".6"') + C(14, 62, 1.2, c1, 0, 'class="bubble" style="animation-delay:-1.2s" opacity=".6"')
    });

    /* ── 19 Snip · Chamäleon ─────────────────────────────────── */
    W.add(19, {
      typ: 'Der Beobachter', spruch: 'Sieht alles. Auch das hinter dir.',
      vars: '--fx:var(--c3)',
      o: { al: [36, 72], ar: [64, 72], ll: [42, 86], lr: [58, 86], head: [50, 68] },
      behind: G('tail', [62, 82], L('M 61 82 C 78 86 90 76 86 64 C 83 56 72 58 73 66 C 74 71 80 71 80 67', INK, 8.4) + L('M 61 82 C 78 86 90 76 86 64 C 83 56 72 58 73 66 C 74 71 80 71 80 67', c1, 5.2)),
      legL: E(42, 88.5, 6.4, 3.6, c1, 2.4) + L('M 38.5 90 l 0 -2 M 45.5 90 l 0 -2', INK, 1, 'opacity=".4"'),
      legR: E(58, 88.5, 6.4, 3.6, c1, 2.4) + L('M 54.5 90 l 0 -2 M 61.5 90 l 0 -2', INK, 1, 'opacity=".4"'),
      body: E(50, 77, 14, 12, c1, 3) + G('fo', null, E(50, 79.5, 8.5, 8, c2, 0, 'opacity=".9"') + L('M 43.5 76 Q 50 78 56.5 76 M 43 81 Q 50 83 57 81', INK, 1, 'opacity=".3"')),
      head: P('M 36 30 C 42 13 60 10 70 22 C 66 25 62 28 60 32 Z', c1, 3) + L('M 44 26 C 50 18 58 17 64 21', c3, 2.2, 'opacity=".8"')
        + P('M 50 28 C 68 28 79 38 78 50 C 77 62 66 68 50 68 C 34 68 23 62 22 50 C 21 38 32 28 50 28 Z', c1, 3.2)
        + shade('M 73 38 C 80 48 77 60 64 66 C 72 58 75 48 73 38 Z')
        + C(46, 34, 1.6, c3, 0) + C(53, 32.5, 1.6, c4, 0) + C(50, 38, 1.4, c2, 0) + C(57, 37, 1.3, c3, 0)
        + shine('M 26 46 C 26 40 30 35 35 33', 2.4, 0.5)
        + G('fo', null, C(35, 47, 11.4, c3, 2.8) + C(66, 45, 11.4, c3, 2.8)
          + C(35, 47, 8.2, 'none', 1.1, 'stroke="' + INK + '" stroke-opacity=".3"') + C(66, 45, 8.2, 'none', 1.1, 'stroke="' + INK + '" stroke-opacity=".3"'))
        + gesicht({ x: [35, 66], y: [47, 45], r: 5.2, ex: 1, p: 0.5, look: [[-0.35, -0.3], [0.35, 0.3]], lookc: ['lk-a', 'lk-b'], blush: false,
            m: 'smirk', ms: 1, mx: 50, my: 61, mw: 7, mlw: 2.6,
            extra: C(47.6, 56, 0.8, INK, 0, 'opacity=".5"') + C(52.4, 56, 0.8, INK, 0, 'opacity=".5"') })
        + G('tongue', null, L('M 50 63 C 50 70 46 76 40 78', INK, 4.6) + L('M 50 63 C 50 70 46 76 40 78', TONGUE, 2.4) + C(39.4, 78.4, 2.6, TONGUE, 1.6)),
      back: L('M 50 30 L 50 64', INK, 1.4, 'opacity=".25"') + C(42, 44, 2.4, c3, 0, 'opacity=".7"') + C(58, 52, 2.8, c4, 0, 'opacity=".7"'),
      armL: tube('M 36 72 Q 29 76 29 82', c1, 4.2) + C(27.4, 83, 2.2, c1, 1.6) + C(30.6, 83.6, 2.2, c1, 1.6),
      armR: tube('M 64 72 Q 71 76 71 82', c1, 4.2) + C(69.4, 83.6, 2.2, c1, 1.6) + C(72.6, 83, 2.2, c1, 1.6)
    });
  })();

  /* ── Wesen 20 … 29 ─────────────────────────────────────────── */
  (function () {
    const W = W3;
    const { INK, P, E, C, R, L, G, tube, shine, hl, shade, tw, star, mirror, gesicht, MOUTH, TONGUE } = W.kit;
    const c1 = 'var(--c1)', c2 = 'var(--c2)', c3 = 'var(--c3)', c4 = 'var(--c4)';
    const drop = (x, y, cls, x2) => P('M ' + x + ' ' + y + ' C ' + (x - 2.4) + ' ' + (y + 4) + ' ' + (x - 2.4) + ' ' + (y + 6.6) + ' ' + x + ' ' + (y + 6.6) + ' C ' + (x + 2.4) + ' ' + (y + 6.6) + ' ' + (x + 2.4) + ' ' + (y + 4) + ' ' + x + ' ' + y + ' Z', '#8fdcff', 1.1, 'class="' + cls + '"' + (x2 ? ' ' + x2 : ''));

    /* ── 20 Boomer · Wecker ──────────────────────────────────── */
    const ticks20 = (() => { let s = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; s += 'M ' + (50 + Math.cos(a) * 17.4).toFixed(1) + ' ' + (56 + Math.sin(a) * 17.4).toFixed(1) + ' L ' + (50 + Math.cos(a) * 19.6).toFixed(1) + ' ' + (56 + Math.sin(a) * 19.6).toFixed(1) + ' '; } return s; })();
    W.add(20, {
      typ: 'Der Hektische', spruch: 'Wir sind zu spät! Wir sind IMMER zu spät!',
      o: { al: [25, 60], ar: [75, 60], ll: [38, 80], lr: [62, 80], head: [50, 84] },
      legL: tube('M 38 78 L 33 88', c2, 3.6) + E(32, 89.6, 5.4, 2.8, c2, 2),
      legR: G('q-tap', [62, 80], tube('M 62 78 L 67 88', c2, 3.6) + E(68, 89.6, 5.4, 2.8, c2, 2)),
      head: G('bell-l', [34, 30], P('M 22 32 C 22 20 40 16 44 27 Z', c2, 2.8) + shine('M 27 26 C 29 23 32 21.5 35 21.5', 1.8, 0.6))
        + G('bell-r', [66, 30], P(mirror('M 22 32 C 22 20 40 16 44 27 Z'), c2, 2.8))
        + L('M 50 30 L 50 21', INK, 5) + L('M 50 30 L 50 21', c2, 2.4) + C(50, 19.5, 3.4, c2, 2.2)
        + C(50, 56, 27, c1, 3.2)
        + shade('M 70 38 C 80 50 79 68 66 78 C 74 68 77 52 70 38 Z')
        + C(50, 56, 21.5, c3, 2.4) + L(ticks20, INK, 1.3, 'opacity=".45"')
        + shine('M 26 50 C 27 42 31 36 37 33', 2.4, 0.6)
        + gesicht({ x: [41, 59], y: 51, r: 6.4, p: 0.28, lookc: 'lk-dart',
            brow: { dy: 1.6, a: -20, l: 4.6, w: 2.4, k: 0.2 }, blush: false,
            m: 'grin', mx: 50, my: 65.5, mw: 6, teeth: true,
            extra: G('spin', [50, 59.5], L('M 50 59.5 L 50 55', '#ef4444', 1.6)) + C(50, 59.5, 1.5, INK, 0) }),
      back: C(50, 56, 6, c2, 2.2) + L('M 44 56 L 56 56 M 50 50 L 50 62', INK, 1.6, 'opacity=".4"'),
      armL: tube('M 25 60 Q 15 60 13 51', c2, 3) + C(13, 49.4, 4, '#fff', 2.2),
      armR: tube('M 75 60 Q 85 60 87 51', c2, 3) + C(87, 49.4, 4, '#fff', 2.2),
      fx: G('ringfx', null, L('M 14 22 L 9 18 M 12 30 L 6 30 M 86 22 L 91 18 M 88 30 L 94 30', c4, 2.2))
        + drop(81, 38, 'q-sweat') + drop(18, 40, 'q-sweat', 'style="animation-delay:-1.3s"')
    });

    /* ── 21 Pebbl · Pinguin ──────────────────────────────────── */
    W.add(21, {
      typ: 'Der Tollpatsch', spruch: 'Stolpert über die eigenen Füße. Lacht als Erster.',
      o: { al: [24, 60], ar: [76, 60], ll: [40, 86], lr: [60, 86], head: [50, 88] },
      legL: E(38, 89, 8.4, 3.6, c4, 2.4, 'transform="rotate(-8 38 89)"'),
      legR: E(62, 89, 8.4, 3.6, c4, 2.4, 'transform="rotate(8 62 89)"'),
      head: P('M 50 22 C 68 22 79 40 79 60 C 79 80 68 88 50 88 C 32 88 21 80 21 60 C 21 40 32 22 50 22 Z', c1, 3.2)
        + shade('M 74 44 C 80 60 77 78 64 86 C 72 76 76 60 74 44 Z', 0.2)
        + G('fo', null, P('M 50 41 C 44 33 30 35 30 49 C 30 56 33 60 36 63 C 31 70 32 85 50 85.5 C 68 85 69 70 64 63 C 67 60 70 56 70 49 C 70 35 56 33 50 41 Z', c2, 0))
        + gesicht({ x: [40, 60], y: 50, r: [6.6, 6.6], p: 0.56, look: [[0.1, 0.2], [-0.1, 0.2]], lookc: 'lk-lr',
            bx: [33, 67], by: 60, mx: 50, my: 59,
            mouths: { normal: P('M 44.5 57 C 44.5 54.5 55.5 54.5 55.5 57 C 55.5 60 52 61.5 50 61.5 C 48 61.5 44.5 60 44.5 57 Z', c4, 2.2) + L('M 45.6 58 Q 50 59.4 54.4 58', INK, 1.2),
                      open: P('M 44.5 57.5 C 44.5 62 47 65.5 50 65.5 C 53 65.5 55.5 62 55.5 57.5 Z', MOUTH, 2) + P('M 44 57.5 C 44 54.5 56 54.5 56 57.5 C 56 59.4 53 60 50 60 C 47 60 44 59.4 44 57.5 Z', c4, 2.2),
                      sad: P('M 44.5 58 C 44.5 55.5 55.5 55.5 55.5 58 C 55.5 60.5 52 62 50 62 C 48 62 44.5 60.5 44.5 58 Z', c4, 2.2) + L('M 46 60 Q 50 58 54 60', INK, 1.2),
                      sleep: P('M 45.5 57 C 45.5 55 54.5 55 54.5 57 C 54.5 59.5 52 60.5 50 60.5 C 48 60.5 45.5 59.5 45.5 57 Z', c4, 2.2),
                      wow: P('M 45 57 C 45 54.5 55 54.5 55 57 C 55 60 52 61.5 50 61.5 C 48 61.5 45 60 45 57 Z', c4, 2.2) + E(50, 62.6, 2.4, 2.6, MOUTH, 1.4) } })
        + G('fo', null, P('M 26 66.5 C 40 72 60 72 74 66.5 L 75 72.5 C 60 78 40 78 25 72.5 Z', c3, 2.4)
          + G('sway', [64, 73], P('M 60 73.5 L 68.5 71.5 L 72 85 L 64 87 Z', c3, 2.4) + L('M 65 84 L 71 82.6', '#fff', 1.4, 'opacity=".7"')))
        + G('cap', null, '<g transform="rotate(-9 50 30)">'
          + P('M 24 38 C 22 21 36 11 51 12 C 66 13 77 23 76 37 C 60 31 40 32 24 38 Z', c3, 2.8)
          + P('M 22.5 37 C 40 30 60 30 77.5 36 L 78 42.5 C 60 36.5 40 36.5 22 43.5 Z', '#fff', 2.4)
          + L('M 30 35 l 0 5.6 M 38 32.6 l 0 5.6 M 46 31.4 l 0 5.6 M 54 31.4 l 0 5.6 M 62 32.4 l 0 5.6 M 70 34.4 l 0 5.6', INK, 0.9, 'opacity=".25"')
          + C(52, 9.5, 5.4, '#fff', 2.4) + '</g>'),
      back: P('M 26 66.5 C 40 72 60 72 74 66.5 L 75 72.5 C 60 78 40 78 25 72.5 Z', c3, 2.4),
      armL: P('M 25 56 C 14 60 9 70 11 78 C 17 77 24 72 28 64 Z', c1, 2.8),
      armR: P(mirror('M 25 56 C 14 60 9 70 11 78 C 17 77 24 72 28 64 Z'), c1, 2.8)
    });

    /* ── 22 Glitch · Pixelmonster ────────────────────────────── */
    const px = (x, y, w, h, col, x2) => R(x, y, w, h, 0, col, 0, x2);
    W.add(22, {
      typ: 'Der Schelm', spruch: 'Hat deinen Stift versteckt. Sagt aber nicht, wo.',
      vars: '--fx:var(--c4)',
      o: { al: [24, 58], ar: [76, 58], ll: [38, 80], lr: [62, 80], head: [50, 80] },
      legL: P('M 32 78 L 44 78 L 44 84 L 40 84 L 40 90.6 L 28 90.6 L 28 84 L 32 84 Z', c2, 2.4),
      legR: P(mirror('M 32 78 L 44 78 L 44 84 L 40 84 L 40 90.6 L 28 90.6 L 28 84 L 32 84 Z'), c2, 2.4),
      head: P('M 28 26 L 28 14 L 36 14 L 36 20 L 42 20 L 42 26 Z', c1, 2.6) + P(mirror('M 28 26 L 28 14 L 36 14 L 36 20 L 42 20 L 42 26 Z'), c1, 2.6)
        + P('M 28 26 L 72 26 L 72 32 L 78 32 L 78 74 L 72 74 L 72 80 L 28 80 L 28 74 L 22 74 L 22 32 L 28 32 Z', c1, 3.2)
        + px(66, 38, 8, 36, INK, 'opacity=".14"') + px(28, 30, 6, 6, '#fff', 'opacity=".45"')
        + P('M 30 36 L 70 36 L 70 70 L 30 70 Z', c3, 2.4)
        + gesicht({ t: 'px', col: c4, x: [40, 60], y: 48, r: 3.6, blush: false, mc: c4, mf: c4, mx: 50, my: 58, mw: 8,
            brow: { dy: 2.6, a: 22, l: 5, w: 2.6, c: c4, k: 0 },
            mouths: { normal: px(38, 58, 24, 3, c4) + px(38, 55, 3, 3, c4) + px(59, 55, 3, 3, c4) + px(44, 61, 3, 2.4, c3) + px(50, 61, 3, 2.4, c3)
                + px(52, 61, 6, 5, '#ff6f91'),
              open: px(37, 55, 26, 10, c4) + px(40, 55, 4, 3, c3) + px(48, 55, 4, 3, c3) + px(56, 55, 4, 3, c3) + px(46, 62, 8, 3, '#ff6f91'),
              sad: px(40, 60, 20, 3, c4) + px(37, 63, 3, 3, c4) + px(60, 63, 3, 3, c4),
              sleep: px(47, 58, 6, 4, c4), wow: px(45, 56, 10, 9, c4) + px(48, 59, 4, 3, c3) } })
        + G('q-glitch', null, px(20, 42, 60, 3, c4, 'opacity=".45"') + px(24, 66, 30, 2, '#fff', 'opacity=".4"')),
      back: px(36, 40, 28, 4, c2) + px(36, 50, 28, 4, c2) + px(36, 60, 28, 4, c2),
      armL: P('M 22 54 L 14 54 L 14 60 L 10 60 L 10 72 L 18 72 L 18 64 L 22 64 Z', c1, 2.6),
      armR: P(mirror('M 22 54 L 14 54 L 14 60 L 10 60 L 10 72 L 18 72 L 18 64 L 22 64 Z'), c1, 2.6),
      fx: px(86, 22, 4, 4, c4, 'class="led"') + px(8, 34, 3, 3, c4, 'class="led" style="animation-delay:-.5s"') + px(88, 84, 3, 3, c1, 'class="led" style="animation-delay:-.8s"')
    });

    /* ── 23 Cacti · Kaktus im Topf ───────────────────────────── */
    const spine = (pts) => L(pts.map(p => 'M ' + p[0] + ' ' + p[1] + ' l ' + (p[2] || 0) + ' -2.6').join(' '), '#fff', 1.3, 'opacity=".85"');
    const heart = (x, y, s, col, x2) => P('M ' + x + ' ' + (y + s) + ' L ' + (x - s) + ' ' + (y - s * 0.1) + ' C ' + (x - s * 1.7) + ' ' + (y - s * 1.3) + ' ' + (x - s * 0.2) + ' ' + (y - s * 1.6) + ' ' + x + ' ' + (y - s * 0.6)
      + ' C ' + (x + s * 0.2) + ' ' + (y - s * 1.6) + ' ' + (x + s * 1.7) + ' ' + (y - s * 1.3) + ' ' + (x + s) + ' ' + (y - s * 0.1) + ' Z', col, 1.2, x2);
    W.add(23, {
      typ: 'Der Kuschler', spruch: 'Will nur kuscheln. Versteht nicht, warum keiner will.',
      vars: '--fx:var(--c2)',
      o: { al: [34, 56], ar: [66, 56], ll: [42, 86], lr: [58, 86], head: [50, 68] },
      legL: E(42, 89.6, 6, 2.8, c3, 2.2), legR: E(58, 89.6, 6, 2.8, c3, 2.2),
      body: P('M 29 69 L 71 69 L 67 86 C 66.6 88.5 33.4 88.5 33 86 Z', c3, 3)
        + shade('M 64 70 L 70 70 L 66.4 86 C 66 87.6 60 88 54 88 C 61 84 64 78 64 70 Z', 0.14)
        + R(26, 63.5, 48, 8, 3.5, c3, 2.8) + L('M 31 67.5 L 60 67.5', '#fff', 1.6, 'opacity=".35"'),
      head: P('M 33 66 L 33 40 C 33 24 67 24 67 40 L 67 66 Z', c1, 3.2)
        + shade('M 62 30 C 66 34 66 40 66 66 L 59 66 C 61 54 62 42 62 30 Z', 0.14)
        + L('M 42 28 L 42 64 M 58 28 L 58 64', INK, 1, 'opacity=".16"')
        + spine([[37, 34, -1], [50, 30, 0], [63, 34, 1], [36, 60, -1], [64, 60, 1]])
        + shine('M 37 44 C 37 38 39 34 42 32', 2.2, 0.5)
        + gesicht({ x: [42, 58], y: 46, r: 6.2, p: 0.66, look: [0, 0.1], lookc: 'lk-up',
            brow: { dy: 1.6, a: -18, l: 4.2, w: 2.2, k: 0.2 }, blush: c2, bx: [38, 62], by: 55.5,
            m: 'smile', mx: 50, my: 57.5, mw: 3.4,
            post: hl(43.8, 47.6, 0.9, 0.9) + hl(59.8, 47.6, 0.9, 0.9) })
        + G('sway', [50, 26], [0, 72, 144, 216, 288].map(a => E(50, 19.4, 3.4, 4.8, c2, 1.8, 'transform="rotate(' + a + ' 50 24.4)"')).join('') + C(50, 24.4, 2.6, '#ffe14d', 1.6)),
      back: L('M 42 28 L 42 64 M 50 26 L 50 64 M 58 28 L 58 64', INK, 1.2, 'opacity=".25"'),
      armL: L('M 34 56 C 22 58 18 48 19 38', INK, 11.4) + L('M 34 56 C 22 58 18 48 19 38', c1, 8.2) + spine([[17, 46, -1.4], [23, 54, -1]]),
      armR: L('M 66 56 C 78 58 82 48 81 38', INK, 11.4) + L('M 66 56 C 78 58 82 48 81 38', c1, 8.2) + spine([[83, 46, 1.4], [77, 54, 1]]),
      fx: heart(86, 22, 3.2, c2, 'class="bubble"') + heart(13, 26, 2.4, c2, 'class="bubble" style="animation-delay:-1.3s"')
    });

    /* ── 24 Nacho · Nacho-Fledermaus ─────────────────────────── */
    const wing24 = 'M 29 42 C 19 33 8 35 3 44 L 10.5 44 L 7.5 52.5 L 15.5 50 L 16 58.5 C 22 55 27 50 30 46 Z';
    W.add(24, {
      typ: 'Der Scharfe', spruch: 'Hält sich für ziemlich scharf. Ist eher mild.',
      vars: '--fx:var(--c4)',
      o: { al: [29, 45], ar: [71, 45], ll: [46, 82], lr: [54, 82], head: [50, 84] },
      legL: tube('M 46 82 L 44 88', c4, 3) + E(42.6, 89.6, 5, 2.6, c4, 2),
      legR: tube('M 54 82 L 56 88', c4, 3) + E(57.4, 89.6, 5, 2.6, c4, 2),
      head: P('M 22 28 C 19 28 18 31 19.5 33.5 L 46 83 C 48 86.5 52 86.5 54 83 L 80.5 33.5 C 82 31 81 28 78 28 Z', c1, 3.2)
        + shade('M 72 30 L 79 30 L 54 82 C 53 84 51 85 50 85 C 60 70 68 50 72 30 Z', 0.14)
        + C(33, 56, 1, c4, 0) + C(62, 66, 1, c4, 0) + C(52, 76, 1, c4, 0) + C(68, 46, 0.9, c4, 0) + C(40, 70, 0.9, c4, 0)
        + gesicht({ x: [40, 60], y: 51, r: 6, p: 0.5, lid: [[0.46, 0], [0.3, 0]], look: [0.35, 0.1], lookc: 'lk-slow',
            brow: { dy: 1.2, a: [8, -14], l: 5, w: 2.8, k: 0.6, up: [1.2, -2.2] }, bx: [34, 66], by: 60.5,
            m: 'smirk', ms: 1, mx: 50, my: 65, mw: 5,
            post: P('M 46.4 66.2 L 47.8 70.4 L 49.4 66.6 Z', '#fff', 1.1) })
        + P('M 18.5 29 C 18.5 22 81.5 22 81.5 29 C 82.5 37 76 38.5 75 33.5 C 73.5 44.5 66 44 66 35 C 63.5 40 57.5 40 57 34.5 C 54.5 42 46.5 42 45 34.5 C 42.5 40 36 40 35 34 C 33 43 26 42.5 25 34 C 23 38.5 17.5 36.5 18.5 29 Z', c2, 2.8)
        + shine('M 26 27.5 C 34 25.6 44 25 52 25', 2, 0.7)
        + G('sway', [36, 26], '<g transform="rotate(-14 36 22)">' + E(36, 21.5, 7, 4.4, c3, 2.2) + E(36, 21.5, 3.6, 2, '#d9f99d', 1.2) + C(34.6, 21.2, 0.6, '#fff', 0) + C(37.4, 21.8, 0.6, '#fff', 0) + '</g>'),
      back: L('M 40 44 L 60 44 M 44 56 L 56 56 M 48 68 L 52 68', c4, 2, 'opacity=".6"'),
      armL: P(wing24, c4, 2.6) + L('M 28 44 L 10.5 44 M 28 46 L 15.5 50', INK, 1, 'opacity=".4"'),
      armR: P(mirror(wing24), c4, 2.6) + L(mirror('M 28 44 L 10.5 44 M 28 46 L 15.5 50'), INK, 1, 'opacity=".4"')
    });

    /* ── 25 Pips · Würfel mit Zylinder ───────────────────────── */
    W.add(25, {
      typ: 'Der Showman', spruch: 'Meine Damen und Herren … das Unmögliche!',
      vars: '--fx:var(--c4)',
      o: { al: [23, 62], ar: [77, 62], ll: [39, 86], lr: [61, 86], head: [50, 86] },
      legL: tube('M 39 84 L 39 88', c3, 3) + E(37.6, 89.6, 5.6, 2.8, c3, 2.2),
      legR: tube('M 61 84 L 61 88', c3, 3) + E(62.4, 89.6, 5.6, 2.8, c3, 2.2),
      head: R(23, 34, 54, 52, 11, c1, 3.2)
        + shade('M 71 38 C 76 42 76 78 71 82 C 68 85 62 86 56 86 C 67 80 72 60 71 38 Z', 0.13)
        + shine('M 28 52 C 28 46 30 42 34 40', 2.4, 0.8)
        + G('fo', null, C(32, 78, 2.6, c2, 0) + C(68, 78, 2.6, c2, 0))
        + gesicht({ t: 'dot', pc: c2, x: [38, 62], y: 52, r: 5.4, ex: 1.1, lookc: 'lk-lr', col: c2, mc: c2,
            brow: { dy: 2.6, a: [-6, -22], l: 5, w: 2.4, c: c2, k: 1.6, up: [0, -2] }, bx: [31, 69], by: 62,
            m: 'smile', mx: 50, my: 71, mw: 5,
            extra: P('M 50 63 C 46 58.5 40 60 38.5 64 C 37 66.5 33.5 66 32 62.5 C 31.5 69 38 71.5 43.5 68.5 C 46.5 67.5 49 66 50 64.5 C 51 66 53.5 67.5 56.5 68.5 C 62 71.5 68.5 69 68 62.5 C 66.5 66 63 66.5 61.5 64 C 60 60 54 58.5 50 63 Z', c2, 1.6),
            post: C(62, 52, 8.4, 'none', 2, 'stroke="var(--c4)"') + L('M 69 57 C 74 64 73 72 70 78', c4, 1.3) })
        + G('hat', null, '<g transform="rotate(-10 50 34)">' + E(50, 34, 21, 4.6, c3, 2.6)
          + P('M 36.5 33.5 L 38 12 C 38 9 62 9 62 12 L 63.5 33.5 C 60 36.5 40 36.5 36.5 33.5 Z', c3, 2.8)
          + P('M 37 26.5 C 44 29 56 29 63 26.5 L 63.4 32 C 56 35 44 35 36.6 32 Z', c4, 1.8)
          + shine('M 41 24 L 41.6 14', 1.8, 0.35) + '</g>'),
      back: C(36, 46, 3, c2, 0) + C(64, 46, 3, c2, 0) + C(50, 60, 3, c2, 0) + C(36, 74, 3, c2, 0) + C(64, 74, 3, c2, 0),
      armL: tube('M 23 62 Q 15 66 15 74', c3, 3) + C(15, 76, 3.8, '#fff', 2.2),
      armR: tube('M 77 62 Q 86 62 88 54', c3, 3)
        + L('M 86 60 L 94 34', INK, 4.4) + L('M 86 60 L 94 34', c3, 2.2) + L('M 92.6 38.6 L 94 34', '#fff', 2.2)
        + C(88, 53, 3.8, '#fff', 2.2),
      fx: tw(94, 27, 4, c4, 0) + tw(84, 24, 2.2, c4, 0.8) + tw(8, 30, 2.4, c4, 1.4)
    });

    /* ── 26 Waddl · Ente mit Regenhut ────────────────────────── */
    W.add(26, {
      typ: 'Der Ahnungslose', spruch: 'Hat die Frage nicht verstanden. Freut sich trotzdem.',
      o: { al: [34, 70], ar: [66, 70], ll: [42, 84], lr: [58, 84], head: [50, 66] },
      behind: P('M 62 78 C 72 76 78 70 80 64 C 82 74 76 84 64 86 Z', c1, 2.6),
      legL: P('M 37.5 81 L 46.5 81 L 46.5 90.8 L 33 90.8 C 32 87.6 34 85.4 37.5 84.6 Z', c2, 2.4) + L('M 38 83.4 L 46 83.4', '#fff', 1.3, 'opacity=".5"'),
      legR: P(mirror('M 37.5 81 L 46.5 81 L 46.5 90.8 L 33 90.8 C 32 87.6 34 85.4 37.5 84.6 Z'), c2, 2.4) + L('M 54 83.4 L 62 83.4', '#fff', 1.3, 'opacity=".5"'),
      body: E(50, 74.5, 17, 13, c1, 3) + E(50, 77, 10, 8, '#fff', 0, 'opacity=".4" class="fo"'),
      head: C(50, 45, 22.5, c1, 3.2)
        + shade('M 67 32 C 75 42 74 55 64 63 C 70 54 72 43 67 32 Z')
        + gesicht({ x: [39.5, 60.5], y: 45, r: [6.8, 7.6], p: 0.42, look: [[-0.4, -0.35], [0.4, 0.35]], lookc: ['lk-lr', 'lk-up'],
            bx: [31, 69], by: 55, mx: 50, my: 58,
            mouths: { normal: P('M 41 58.5 C 43 65 57 65 59 58.5 Z', MOUTH, 2) + E(50, 62, 3.4, 1.8, TONGUE, 0)
                + P('M 36.5 56.5 C 36.5 50.5 63.5 50.5 63.5 56.5 C 63.5 59.5 56 60 50 60 C 44 60 36.5 59.5 36.5 56.5 Z', c4, 2.4) + C(46.8, 54, 0.8, INK, 0, 'opacity=".5"') + C(53.2, 54, 0.8, INK, 0, 'opacity=".5"'),
              open: P('M 40 58.5 C 41 70 59 70 60 58.5 Z', MOUTH, 2) + E(50, 65, 4.4, 2.6, TONGUE, 0)
                + P('M 36.5 56.5 C 36.5 50.5 63.5 50.5 63.5 56.5 C 63.5 59.5 56 60 50 60 C 44 60 36.5 59.5 36.5 56.5 Z', c4, 2.4),
              sad: P('M 37.5 58 C 37.5 52.5 62.5 52.5 62.5 58 C 62.5 61.5 56 62.5 50 62.5 C 44 62.5 37.5 61.5 37.5 58 Z', c4, 2.4) + L('M 42 59.4 Q 50 56.4 58 59.4', INK, 1.2),
              sleep: P('M 37.5 57.5 C 37.5 52 62.5 52 62.5 57.5 C 62.5 60.5 56 61.5 50 61.5 C 44 61.5 37.5 60.5 37.5 57.5 Z', c4, 2.4),
              wow: E(50, 62, 4, 4.4, MOUTH, 1.8) + P('M 36.5 56.5 C 36.5 50.5 63.5 50.5 63.5 56.5 C 63.5 59.5 56 60 50 60 C 44 60 36.5 59.5 36.5 56.5 Z', c4, 2.4) } })
        + G('hat', [50, 34], '<g transform="rotate(7 50 32)">' + E(50, 33, 31, 6.4, c2, 2.8)
          + P('M 29 32.5 C 28 17 39 9 50 9 C 61 9 72 17 71 32.5 C 62 36 38 36 29 32.5 Z', c2, 2.8)
          + shine('M 34 25 C 35 18 40 14 46 13', 2.2, 0.45) + L('M 30 31 C 40 34 60 34 70 31', INK, 1.1, 'opacity=".3"') + '</g>'),
      back: L('M 44 40 Q 50 43 56 40', INK, 1.2, 'opacity=".25"'),
      armL: P('M 35 67 C 26 69 21 76 22 83 C 28 82 34 77 37 71 Z', c3, 2.6),
      armR: P(mirror('M 35 67 C 26 69 21 76 22 83 C 28 82 34 77 37 71 Z'), c3, 2.6),
      fx: G('drip', [80, 38], drop(80, 36, '')) + drop(17, 30, 'q-sweat', 'style="animation-delay:-1s"')
    });

    /* ── 27 Yoyo · Flickenkatze ──────────────────────────────── */
    const ear27 = 'M 25 40 C 22 30 22 20 25 13 C 32 17 39 23 43 30 Z';
    W.add(27, {
      typ: 'Die Geflickte', spruch: 'Schon hundertmal genäht. Jede Naht eine Geschichte.',
      o: { al: [37, 71], ar: [63, 71], ll: [43, 86], lr: [57, 86], head: [50, 68] },
      behind: G('tail', [62, 82], L('M 62 82 C 76 86 86 76 82 66 C 80 60 86 56 90 60', INK, 5.4) + L('M 62 82 C 76 86 86 76 82 66 C 80 60 86 56 90 60', c2, 2.6)
        + C(90, 62, 5.2, c3, 2.2) + L('M 86.5 60 Q 90 63 93.6 60 M 87 65 Q 90 61 93 65', INK, 0.9, 'opacity=".4"')),
      legL: E(43, 88.6, 6, 3.6, c1, 2.4), legR: E(57, 88.6, 6, 3.6, c4, 2.4),
      body: E(50, 77, 13.5, 11.5, c1, 3)
        + G('fo', null, R(44, 73, 10, 9, 1.5, c2, 1.6, 'transform="rotate(-8 49 77)"') + L('M 42.6 74.6 l 2 -.4 M 42.8 78.6 l 2 -.4 M 53.4 72.6 l 2 -.4 M 54 80.6 l 2 -.4', INK, 0.9)),
      head: G('ear-l', [31, 36], P(ear27, c1, 3) + P('M 27.5 34 C 26.5 28 26.5 23 27.5 18.5 C 31.5 21.5 35 25 37 28.5 Z', c3, 0, 'opacity=".8"'))
        + G('ear-r', [69, 36], '<g transform="rotate(16 68 34)">' + P(mirror(ear27), c2, 3) + L('M 62 29 l 2.4 -2 M 66.4 31.6 l 2.4 -2 M 70.6 34.4 l 2.4 -2', INK, 0.9) + '</g>')
        + E(50, 48, 28, 22.5, c1, 3.2)
        + P('M 50 25.6 C 62 25.6 72 31 76 40 L 50 48 Z', c4, 0, 'opacity=".55"')
        + shade('M 73 38 C 80 50 77 62 64 68 C 72 60 75 50 73 38 Z', 0.1)
        + L('M 50 26 L 50 70', INK, 1.2, 'opacity=".45" stroke-dasharray="2.4 2.2"')
        + shine('M 26 44 C 27 37 31 32 37 29', 2.4, 0.5)
        + G('fo', null, R(26, 54, 9, 8, 1.4, c2, 1.6, 'transform="rotate(12 30 58)"') + L('M 25 55 l 2 .6 M 25 60 l 2 .6 M 34.6 53.6 l 2 .6 M 34.6 60.6 l 2 .6', INK, 0.9))
        + gesicht({ t: 'btn', bcols: ['var(--c3)', 'var(--c2)'], x: [38, 62.5], y: [46, 47], r: [7.6, 5.4], blush: false,
            mx: 50, my: 60, mw: 6.4, m: 'smile',
            extra: P('M 47.6 54.6 L 52.4 54.6 L 50 57.4 Z', c3, 1.2),
            post: L('M 45.4 60.6 l 0 3.4 M 50 62.4 l 0 3.4 M 54.6 60.6 l 0 3.4', INK, 1.1) }),
      back: L('M 50 26 L 50 70', INK, 1.2, 'opacity=".45" stroke-dasharray="2.4 2.2"') + R(56, 40, 10, 9, 1.5, c2, 1.6),
      armL: tube('M 37 71 Q 31 75 31 81', c1, 4.6) + C(31, 82, 3, c4, 1.8),
      armR: tube('M 63 71 Q 69 75 69 81', c4, 4.6) + C(69, 82, 3, c1, 1.8)
    });

    /* ── 28 Turbo · Rennschnecke ─────────────────────────────── */
    W.add(28, {
      typ: 'Der Angeber', spruch: 'Null auf hundert in … Moment. Gleich.',
      vars: '--fx:var(--c3)',
      o: { al: [60, 74], ar: [82, 74], ll: [34, 88], lr: [62, 88], head: [72, 80], zz: [80, 22], dz: [72, 26] },
      behind: G('speed', null, L('M 2 46 L 12 46 M 0 58 L 9 58 M 3 70 L 11 70', c4, 2.2))
        + R(6, 63, 13, 5, 2.4, c4, 2.2) + R(6, 71, 13, 5, 2.4, c4, 2.2)
        + G('flick', null, P('M 6 62 L -1 65.5 L 6 69 Z', '#ff8a1f', 1.4)) + G('flick', null, P('M 6 70 L -1 73.5 L 6 77 Z', '#ffd23f', 1.4)),
      body: P('M 16 91 C 10 91 9 82 18 81 L 78 79 C 90 79 93 91 84 91 Z', c1, 3)
        + L('M 22 87.6 L 80 87.6', INK, 1, 'opacity=".2"')
        + C(40, 56, 26, c2, 3.2)
        + shade('M 58 38 C 68 50 67 68 54 78 C 62 66 64 50 58 38 Z', 0.16)
        + G('fo', null, P('M 20 43 C 30 30 50 26 61 39 L 57 43.5 C 48 33 33 36 24.5 46.5 Z', c3, 0)
          + C(40, 59, 11, c3, 2.4) + '<text x="40" y="64.6" text-anchor="middle" font-size="15" font-weight="900" fill="' + '#1e1b2e' + '" style="font-family:system-ui,sans-serif">1</text>')
        + shine('M 19 52 C 20 44 25 37 32 34', 2.6, 0.5),
      head: P('M 62 84 C 60 70 60 56 66 50 C 72 44 84 46 86 56 C 88 66 86 78 84 84 Z', c1, 3)
        + tube('M 68 49 L 66 40', c1, 3) + tube('M 80 49 L 83 40', c1, 3)
        + G('fo', null, P('M 61.5 58 C 61 46 71 42 76 42.4 C 82 42 90 47 87.5 58 C 80 54 69 54 61.5 58 Z', c2, 2.6) + L('M 66 50 C 71 46.6 79 46.6 84 50', c3, 2.2))
        + gesicht({ x: [66, 83], y: [37, 37], r: 5.4, ex: 1, p: 0.5, lid: [[0.2, 0], [0.2, 0]], lidc: c1, look: [[0.3, 0.1], [0.3, 0.1]], lookc: 'lk-slow',
            blush: false, m: 'grin', mx: 75, my: 68, mw: 6, teeth: true,
            brow: { dy: 1.6, a: [-6, -16], l: 4.2, w: 2.2, k: 1.2, up: [0, -1.4] } }),
      back: L('M 68 56 Q 74 60 80 56', INK, 1.2, 'opacity=".25"'),
      armL: '', armR: '',
      fx: C(4, 56, 2.6, '#d5dbe6', 0.8, 'class="steam"')
    });

    /* ── 29 Lumi · Anglerfisch ───────────────────────────────── */
    const fin29 = 'M 21 56 C 11 50 4 56 6 64 C 7 69 15 68 21 63 Z';
    const teeth29 = [33, 41, 50, 59, 67].map((x, i) => { const y = 66.2 + (2 - Math.abs(i - 2)) * 1.7; return P('M ' + (x - 3.2) + ' ' + (y + 0.6) + ' L ' + x + ' ' + (y - 7.5) + ' L ' + (x + 3.2) + ' ' + (y + 0.6) + ' Z', '#fff', 1.4); }).join('');
    W.add(29, {
      typ: 'Die Sanfte', spruch: 'Sieht zum Fürchten aus. Leuchtet dir aber den Weg.',
      vars: '--fx:var(--c2)',
      o: { al: [21, 60], ar: [79, 60], ll: [42, 84], lr: [58, 84], head: [50, 86], zz: [80, 30] },
      behind: E(50, 54, 38, 36, c2, 0, 'class="pulse"')
        + G('tail', [50, 80], P('M 44 84 L 36 93 L 50 89.5 L 64 93 L 56 84 Z', c4, 2.4)),
      legL: P('M 43 83 C 40 86 36 87 34 90.6 C 40 91.6 46 90 47.4 86 Z', c4, 2.2),
      legR: P(mirror('M 43 83 C 40 86 36 87 34 90.6 C 40 91.6 46 90 47.4 86 Z'), c4, 2.2),
      head: G('lure', [50, 28], L('M 50 29 C 46 14 56 7 66 11', INK, 4.6) + L('M 50 29 C 46 14 56 7 66 11', c4, 2.2)
          + C(69, 13, 9, c2, 0, 'class="glow" opacity=".4"') + C(69, 13, 5.4, c2, 2.2) + hl(67.4, 11.4, 1.5, 0.95))
        + P('M 50 27 C 71 27 83 41 83 57 C 83 75 70 87 50 87 C 30 87 17 75 17 57 C 17 41 29 27 50 27 Z', c1, 3.2)
        + shade('M 76 42 C 84 56 80 76 62 85 C 74 76 79 60 76 42 Z', 0.16)
        + E(50, 77, 17, 7, c3, 0, 'opacity=".35" class="fo"')
        + shine('M 24 50 C 25 42 30 35 37 32', 2.8, 0.55) + C(30, 62, 1.3, c2, 0, 'opacity=".8"') + C(72, 44, 1.3, c2, 0, 'opacity=".8"') + C(26, 54, 1, c2, 0, 'opacity=".8"')
        + gesicht({ x: [38.5, 61.5], y: 46, r: 5.8, p: 0.56, iris: c2, lash: true, look: [[0.3, -0.35], [0.3, -0.35]], lookc: 'lk-up',
            brow: { dy: 1.8, a: -14, l: 4, w: 2, k: 0.4 }, bx: [30, 70], by: 55.5, bw: 4.6, blush: '#ff8fb0',
            mx: 50, my: 67, mw: 9,
            mouths: { normal: teeth29 + L('M 27 63.5 Q 50 73 73 63.5', INK, 2.6),
              open: P('M 29 62 Q 50 86 71 62 Z', MOUTH, 2.4) + E(50, 74.5, 6, 3, TONGUE, 0) + teeth29.replace(/ 6(\d)/g, ' 6$1'),
              sad: teeth29 + L('M 28 67 Q 50 63 72 67', INK, 2.6) } }),
      back: L('M 36 44 Q 50 38 64 44 M 34 58 Q 50 52 66 58', c4, 2.2, 'opacity=".5"'),
      armL: G('fin', null, P(fin29, c4, 2.6) + L('M 9 59 L 18 59 M 10 63.5 L 18 61.5', INK, 1, 'opacity=".4"')),
      armR: G('fin', null, P(mirror(fin29), c4, 2.6) + L(mirror('M 9 59 L 18 59 M 10 63.5 L 18 61.5'), INK, 1, 'opacity=".4"')),
      fx: C(88, 34, 1.8, c2, 0, 'class="bubble"') + C(12, 40, 1.4, c2, 0, 'class="bubble" style="animation-delay:-1.2s"') + tw(82, 6, 2.2, c2, 0.4)
    });
  })();

  /* ── Wesen 30 … 39 ─────────────────────────────────────────── */
  (function () {
    const W = W3;
    const { INK, P, E, C, R, L, G, tube, shine, hl, shade, tw, star, mirror, gesicht, MOUTH, TONGUE } = W.kit;
    const c1 = 'var(--c1)', c2 = 'var(--c2)', c3 = 'var(--c3)', c4 = 'var(--c4)', c5 = 'var(--c5)', c6 = 'var(--c6)';
    const KEIN_MUND = { normal: '', open: '', sad: '', sleep: '', wow: '' };

    /* ── 30 Umbra · Kapuzengespenst ──────────────────────────── */
    W.add(30, {
      typ: 'Die Dramatische', spruch: 'Oh, diese Finsternis! … Hat jemand Kekse?',
      vars: '--fx:var(--c2)',
      o: { al: [25, 60], ar: [75, 60], ll: [42, 86], lr: [58, 86], head: [50, 86], zz: [80, 26] },
      behind: E(50, 52, 37, 39, c2, 0, 'class="pulse"'),
      legL: E(42, 89.4, 4.6, 2, c1, 0, 'opacity=".5"'), legR: E(58, 89.4, 4.6, 2, c1, 0, 'opacity=".5"'),
      head: P('M 49 13 C 56 12 61 7 66 10 C 62 15 66 20 70 26 C 78 37 81 52 81 70 L 81 87 L 73.5 81 L 66 88.5 L 58 81 L 50 88.5 L 42 81 L 34 88.5 L 26.5 81 L 19 87 L 19 70 C 19 46 29 22 49 13 Z', c1, 3.2)
        + shade('M 70 28 C 78 40 80 56 80 84 L 73.5 80 L 68 85 C 72 66 74 46 70 28 Z', 0.22)
        + L('M 27 50 C 30 38 36 28 44 22', '#fff', 2.2, 'opacity=".22"')
        + G('fo', null, E(50, 47, 20.5, 18.5, '#0d0a1a', 2.6) + P('M 38 68 L 50 74 L 62 68 L 60 76 L 50 81 L 40 76 Z', c2, 1.8, 'opacity=".85"') + C(50, 71.4, 2.2, c3, 1.2))
        + gesicht({ t: 'glow', col: c2, x: [41.5, 58.5], y: 46, r: 4.8, blush: false, lookc: 'lk-lr', mc: c2, mf: c2,
            brow: { dy: 2.6, a: -24, l: 4.6, w: 2.2, c: c2, k: 0.2 },
            m: 'wavy', mx: 50, my: 57.5, mw: 3.6 }),
      back: L('M 50 24 C 48 40 48 60 50 78', INK, 1.4, 'opacity=".3"'),
      armL: tube('M 25 60 Q 16 50 27 37', c1, 5) + C(28, 36, 3, c3, 1.8),
      armR: tube('M 75 60 Q 84 62 86 68', c1, 5)
        + L('M 87 66 L 87 72', INK, 1.6) + R(81.5, 72, 11, 13, 3, c4, 2.2, 'fill-opacity=".35"') + R(80.5, 70.6, 13, 2.8, 1.2, c1, 1.6) + R(80.5, 84, 13, 2.8, 1.2, c1, 1.6)
        + G('flick', null, P('M 87 83 C 83.6 80 85.2 76.4 87 74 C 88.8 76.4 90.4 80 87 83 Z', c4, 1.2))
        + C(86, 68, 3, c3, 1.8),
      fx: tw(12, 26, 2.6, c2, 0.3) + tw(90, 46, 2.2, c2, 1.2) + C(14, 74, 1.5, c2, 0, 'class="bubble"')
    });

    /* ── 31 Grimjaw · Truhe mit Zähnen ───────────────────────── */
    const zahnReihe = (y, dir) => [27, 35, 43, 57, 65, 73].map(x => P('M ' + (x - 3.6) + ' ' + y + ' L ' + x + ' ' + (y + dir * 7) + ' L ' + (x + 3.6) + ' ' + y + ' Z', '#fff', 1.4)).join('');
    W.add(31, {
      typ: 'Der Nimmersatt', spruch: 'Hat immer Hunger. Auf Wissen. Und auf Kekse.',
      vars: '--fx:var(--c4)',
      o: { al: [22, 68], ar: [78, 68], ll: [36, 86], lr: [64, 86], head: [50, 56] },
      legL: R(29, 84, 13, 7, 3, c2, 2.4), legR: R(58, 84, 13, 7, 3, c2, 2.4),
      body: P('M 24 50 L 76 50 L 76 62 L 24 62 Z', MOUTH, 0)
        + P('M 21 60 L 79 60 L 77 83 C 77 86.5 23 86.5 23 83 Z', c1, 3.2)
        + shade('M 71 61 L 78 61 L 76 83 C 76 85 68 86 60 86 C 68 80 71 72 71 61 Z', 0.16)
        + L('M 28 70 L 72 70 M 28 78 L 72 78', INK, 1, 'opacity=".2"')
        + G('fo', null, P('M 21 60 L 31 60 L 30 72 L 22 70 Z', c2, 2) + P('M 79 60 L 69 60 L 70 72 L 78 70 Z', c2, 2))
        + zahnReihe(60.6, -1)
        + G('fo', null, P('M 43 58 C 42 72 46 80 51.5 80 C 57 80 60 72 58 58 Z', TONGUE, 2.4) + L('M 50.6 62 L 51 75', INK, 1.2, 'opacity=".35"') + hl(46.5, 66, 1.4, 0.5)),
      head: G('lid', [50, 50], P('M 20 51 C 20 27 80 27 80 51 Z', c1, 3.2)
          + shade('M 70 34 C 77 39 79 45 79 50 L 68 50 C 70 45 71 40 70 34 Z', 0.16)
          + P('M 20 51 C 20 47 21 43 22.5 40 L 31 43 L 31 51 Z', c2, 2) + P(mirror('M 20 51 C 20 47 21 43 22.5 40 L 31 43 L 31 51 Z'), c2, 2)
          + P('M 46 29.6 L 54 29.6 L 55 51 L 45 51 Z', c2, 2)
          + shine('M 26 43 C 28 37 33 33 39 31.5', 2.4, 0.4)
          + zahnReihe(50.4, 1)
          + gesicht({ x: [36.5, 63.5], y: 40.5, r: 6.6, p: 0.4, iris: c4, lid: [0.24, 16], look: [[0.3, -0.3], [0.3, -0.3]], lookc: 'lk-lr',
              brow: { dy: -0.4, a: 18, l: 6, w: 3, k: 0 }, blush: false, mouths: KEIN_MUND })),
      back: L('M 28 40 L 72 40', INK, 1.4, 'opacity=".3"') + R(44, 44, 12, 5, 1.5, c2, 1.8),
      armL: tube('M 22 68 Q 13 70 13 78', c1, 4.4) + C(13, 79.6, 3.6, c2, 2),
      armR: tube('M 78 68 Q 87 70 87 78', c1, 4.4) + C(87, 79.6, 3.6, c2, 2),
      fx: G('q-bob', null, C(84, 24, 5.4, '#ffd23f', 2) + C(84, 24, 3.2, 'none', 1, 'stroke="#b7791f"')) + tw(90, 16, 2.2, '#fff', 0.2)
        + P('M 64 62 C 62.4 65 62.4 67 64 67 C 65.6 67 65.6 65 64 62 Z', '#bfe9ff', 0.9, 'class="q-sweat"')
    });

    /* ── 32 Astris · Sternenkatze ────────────────────────────── */
    const ear32 = 'M 25 38 C 22 28 22 18 25 10 C 33 15 40 22 44 30 Z';
    W.add(32, {
      typ: 'Die Kosmische', spruch: 'Kennt jeden Stern beim Vornamen.',
      vars: '--fx:var(--c3)',
      o: { al: [38, 71], ar: [62, 71], ll: [43, 86], lr: [57, 86], head: [50, 68] },
      behind: G('tail', [62, 82], tube('M 62 82 C 78 84 88 74 85 62', c1, 5) + star(85, 57, 5.4, c3, 'stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"'))
        + G('ring', [50, 78], L('M 26 76 C 30 68 70 66 76 73', INK, 5.4) + L('M 26 76 C 30 68 70 66 76 73', c2, 2.6)),
      legL: E(43, 88.6, 6, 3.6, c1, 2.4), legR: E(57, 88.6, 6, 3.6, c1, 2.4),
      body: E(50, 77, 13.5, 11.5, c1, 3) + G('fo', null, star(50, 75, 2.6, c3) + C(44.5, 80, 0.9, c4, 0) + C(56, 81, 0.9, c4, 0) + C(55, 72, 0.7, c4, 0)),
      head: G('ear-l', [31, 34], P(ear32, c1, 3) + P('M 27.6 32 C 26.6 26 26.6 20.5 27.6 16 C 32 19.5 35.6 23.5 38 27.6 Z', c2, 0, 'opacity=".7"'))
        + G('ear-r', [69, 34], P(mirror(ear32), c1, 3) + P(mirror('M 27.6 32 C 26.6 26 26.6 20.5 27.6 16 C 32 19.5 35.6 23.5 38 27.6 Z'), c2, 0, 'opacity=".7"'))
        + E(50, 48, 28, 22.5, c1, 3.2)
        + shade('M 73 38 C 80 50 77 62 64 68 C 72 60 75 50 73 38 Z', 0.2)
        + shine('M 26 44 C 27 37 31 32 37 29', 2.4, 0.35)
        + G('fo', null, P('M 45 30 C 46 36.5 54 36.5 56 30.6 C 53.6 33.6 48.4 33.6 45 30 Z', c3, 1.4)
          + C(28, 52, 0.9, c4, 0) + C(31, 56, 0.7, c4, 0) + C(72, 52, 0.9, c4, 0) + C(69, 56.5, 0.7, c4, 0) + C(66, 34, 0.8, c4, 0) + C(35, 33, 0.8, c4, 0))
        + gesicht({ x: [38, 62], y: 47, r: 7, p: 0.5, iris: c2, lid: [0.42, -6], lash: true, look: [0, 0.15], lookc: 'lk-up',
            bx: [29.5, 70.5], by: 57, blush: '#c89bff', m: 'cat', mx: 50, my: 59.5, mw: 3.6,
            extra: P('M 48 55.6 L 52 55.6 L 50 58 Z', c4, 1.1),
            post: star(39.6, 49.4, 1.5, '#fff') + star(63.6, 49.4, 1.5, '#fff') }),
      back: star(50, 46, 4, c3, 'opacity=".8"'),
      armL: tube('M 38 71 Q 32 75 33 81', c1, 4.6) + C(33, 82, 3, c4, 1.8),
      armR: tube('M 62 71 Q 68 75 67 81', c1, 4.6) + C(67, 82, 3, c4, 1.8),
      front: G('ring', [50, 78], L('M 26 76 C 28 86 72 86 76 73', INK, 5.4) + L('M 26 76 C 28 86 72 86 76 73', c2, 2.6) + C(74, 79, 2.6, c3, 1.6)),
      fx: tw(12, 22, 3, c3, 0) + tw(90, 30, 2.4, c4, 0.9) + tw(10, 62, 2.2, c2, 1.5) + tw(88, 58, 2, c3, 2)
    });

    /* ── 33 Arcana · Zauberbuch ──────────────────────────────── */
    W.add(33, {
      typ: 'Der Besserwisser', spruch: '„Eigentlich …“ ist sein Lieblingswort.',
      vars: '--fx:var(--c3)',
      o: { al: [25, 60], ar: [75, 60], ll: [40, 86], lr: [60, 86], head: [50, 86] },
      behind: G('orbit', [50, 52], star(50, 8, 3, c3) + star(92, 52, 2.4, c2) + star(8, 56, 2.6, c3)),
      legL: tube('M 40 84 L 40 88', c2, 3) + E(38.6, 89.6, 5.6, 2.8, c2, 2.2),
      legR: tube('M 60 84 L 60 88', c2, 3) + E(61.4, 89.6, 5.6, 2.8, c2, 2.2),
      head: P('M 32 25 L 78 23 L 80 84 L 32 86 Z', c4, 2.6) + L('M 76 27 L 77.6 82 M 73 27.4 L 74.4 82.4', INK, 0.9, 'opacity=".3"')
        + R(23, 24, 51, 62, 5, c1, 3.2)
        + shade('M 68 26 C 72 28 73 30 73 34 L 73 78 C 73 82 71 85 68 85.6 Z', 0.16)
        + P('M 23 29 C 23 26 25 24 28 24 L 31 24 L 31 86 L 28 86 C 25 86 23 84 23 81 Z', c2, 2.2)
        + G('fo', null, P('M 62 24 L 73 24.6 L 73.4 35 Z', c2, 1.8) + P('M 62 86 L 73 85.4 L 73.4 75 Z', c2, 1.8)
          + P('M 52 28 L 56 33 L 52 38 L 48 33 Z', c3, 1.6) + hl(51, 31.6, 0.9, 0.8))
        + shine('M 35 36 L 35 46', 2, 0.35)
        + gesicht({ x: [42, 62], y: 49, r: 5.6, p: 0.5, lid: [0.36, 0], look: [[0.1, -0.2], [0.1, -0.2]], lookc: 'lk-slow',
            brow: { dy: 1.8, a: [4, -18], l: 4.8, w: 2.6, c: c2, k: 0.4, up: [0.6, -2.4] }, blush: false,
            m: 'smirk', ms: 1, mx: 52, my: 67.5, mw: 4.6, mc: c4, mf: '#2a1040',
            post: P('M 34.6 53 C 34.6 60.5 49.4 60.5 49.4 53 Z', '#fff', 1.8, 'fill-opacity=".28" stroke="var(--c2)"') + P('M 54.6 53 C 54.6 60.5 69.4 60.5 69.4 53 Z', '#fff', 1.8, 'fill-opacity=".28" stroke="var(--c2)"')
              + L('M 49.4 53.6 Q 52 52 54.6 53.6', c2, 1.8) })
        + P('M 60 85 L 60 96 L 63 93 L 66 96 L 66 85 Z', '#ef4444', 1.8),
      back: R(36, 34, 30, 12, 2, c2, 1.8) + L('M 40 40 L 62 40', INK, 1.4, 'opacity=".5"') + C(51, 66, 6, 'none', 1.8, 'stroke="var(--c2)"'),
      armL: tube('M 25 60 Q 16 64 21 72', c1, 4) + C(22, 73, 3.4, c4, 2),
      armR: tube('M 75 60 Q 86 58 87 46', c1, 4) + L('M 87 44 L 87 35', INK, 5) + L('M 87 44 L 87 35', c4, 2.6) + C(87, 46, 3.6, c4, 2),
      fx: E(50, 54, 36, 38, c3, 0, 'class="pulse" style="display:none"') + tw(92, 28, 2.6, c3, 0.4)
    });

    /* ── 34 Zephyr · Eule ────────────────────────────────────── */
    const tuft34 = 'M 27 37 C 21 30 17 21 18 11 C 28 14 38 20 45 28 Z';
    const wing34 = 'M 32 62 C 22 66 18 76 21 86 C 28 84 34 78 36 70 Z';
    const beak34 = P('M 45.6 52 C 45.6 49.6 54.4 49.6 54.4 52 L 50 60 Z', c2, 2);
    W.add(34, {
      typ: 'Die Weise', spruch: 'Schweigt lange. Sagt dann einen Satz, der sitzt.',
      vars: '--fx:var(--c2)',
      o: { al: [32, 64], ar: [68, 64], ll: [43, 86], lr: [57, 86], head: [50, 64] },
      legL: P('M 39 86 L 47 86 L 48 91 L 44.6 89 L 43 91.4 L 41.4 89 L 38 91 Z', c2, 1.8),
      legR: P(mirror('M 39 86 L 47 86 L 48 91 L 44.6 89 L 43 91.4 L 41.4 89 L 38 91 Z'), c2, 1.8),
      body: E(50, 73, 19, 15.5, c1, 3)
        + G('fo', null, E(50, 75.5, 12, 11, c3, 0, 'opacity=".75"')
          + L('M 44 77 q 2 2.4 4 0 q 2 2.4 4 0 q 2 2.4 4 0 M 46 83 q 2 2.4 4 0 q 2 2.4 4 0', INK, 1.1, 'opacity=".35"')
          + P('M 32.6 62.6 C 40 69 60 69 67.4 62.6 L 67 69.6 C 60 76 40 76 33 69.6 Z', '#1e1b2e', 2, 'fill-opacity=".8"') + P('M 50 68.6 L 53 72 L 50 75.4 L 47 72 Z', c2, 1.4)),
      head: G('ear-l', [30, 32], P(tuft34, c1, 3)) + G('ear-r', [70, 32], P(mirror(tuft34), c1, 3))
        + E(50, 44, 27, 21.5, c1, 3.2)
        + shade('M 72 34 C 80 44 77 58 64 64 C 72 57 75 46 72 34 Z', 0.18)
        + shade('M 23.6 42 C 25 29 37 22.6 50 22.6 C 63 22.6 75 29 76.4 42 C 68 33.5 32 33.5 23.6 42 Z', 0.26)
        + G('fo', null, C(37.5, 46, 12.6, c3, 2, 'fill-opacity=".8"') + C(62.5, 46, 12.6, c3, 2, 'fill-opacity=".8"')
          + P('M 45.4 25 C 46.4 31.8 54 31.8 55.8 25.6 C 53.4 28.8 48.6 28.8 45.4 25 Z', c2, 1.4, 'class="glow-soft"'))
        + gesicht({ x: [37.5, 62.5], y: 46, r: 8.4, ex: 1, p: 0.4, iris: c2, lid: [0.46, -5], look: [0, 0.25], lookc: 'lk-slow', bags: INK,
            brow: { dy: 2.6, a: -13, l: 9.6, w: 3, c: '#f1f5f9', k: 2.6 }, blush: false, mx: 50, my: 55,
            mouths: { normal: beak34, sleep: beak34, sad: beak34,
              open: P('M 46 55 L 54 55 L 50 62.5 Z', MOUTH, 1.6) + P('M 45.6 52 C 45.6 49.6 54.4 49.6 54.4 52 L 50 56.6 Z', c2, 2),
              wow: P('M 46 55 L 54 55 L 50 62.5 Z', MOUTH, 1.6) + P('M 45.6 52 C 45.6 49.6 54.4 49.6 54.4 52 L 50 56.6 Z', c2, 2) } })
  ,
      back: L('M 40 36 q 2.5 3 5 0 q 2.5 3 5 0 q 2.5 3 5 0 q 2.5 3 5 0 M 42 46 q 2.6 3 5.2 0 q 2.6 3 5.2 0 q 2.6 3 5.2 0', INK, 1.2, 'opacity=".3"'),
      armL: P(wing34, c1, 2.8) + L('M 25 78 L 31 72 M 23 84 L 33 76', INK, 1, 'opacity=".3"'),
      armR: P(mirror(wing34), c1, 2.8) + L(mirror('M 25 78 L 31 72 M 23 84 L 33 76'), INK, 1, 'opacity=".3"'),
      fx: tw(88, 18, 2.6, c2, 0.4) + tw(12, 28, 2.2, c4, 1.4)
    });

    /* ── 35 Spindle · Spinne ─────────────────────────────────── */
    const bein = d => L(d, INK, 5.2) + L(d, c1, 2.6);
    W.add(35, {
      typ: 'Die Strickerin', spruch: 'Strickt jedem einen Schal. Ob er will oder nicht.',
      o: { al: [37, 72], ar: [63, 72], ll: [36, 74], lr: [64, 74], head: [50, 70], zz: [80, 26] },
      behind: G('thread', null, L('M 50 0 L 50 24', '#cbd5e1', 1.4))
        + bein('M 30 56 L 15 48 L 8 60') + bein(mirror('M 30 56 L 15 48 L 8 60')),
      legL: bein('M 36 72 L 22 70 L 14 84') + bein('M 38 78 L 28 82 L 24 91'),
      legR: bein(mirror('M 36 72 L 22 70 L 14 84')) + bein(mirror('M 38 78 L 28 82 L 24 91')),
      body: E(50, 76, 14, 11.5, c1, 3) + G('fo', null, P('M 46 70 L 54 70 L 50 76 L 54 82 L 46 82 L 50 76 Z', c2, 1.2)),
      head: C(50, 46, 24.5, c1, 3.2)
        + shade('M 68 31 C 77 41 76 55 65 64 C 71 55 73 43 68 31 Z', 0.2)
        + shine('M 29 42 C 30 35 34 30 40 27', 2.4, 0.3)
        + gesicht({ x: [40, 60], y: 48, r: 7.4, p: 0.54, iris: c3, look: [0, 0.2], lookc: 'lk-lr', lash: true,
            bx: [31, 69], by: 58.5, blush: '#ff7aa8', m: 'smile', mx: 50, my: 60, mw: 4, mc: c4,
            pre: C(33, 35, 2.4, '#fff', 1.6) + C(33.3, 35.3, 1.1, INK, 0) + C(67, 35, 2.4, '#fff', 1.6) + C(67.3, 35.3, 1.1, INK, 0)
              + C(42.5, 31, 1.9, '#fff', 1.4) + C(42.7, 31.3, 0.9, INK, 0) + C(57.5, 31, 1.9, '#fff', 1.4) + C(57.7, 31.3, 0.9, INK, 0),
            post: P('M 46.2 61.6 L 47.4 65.4 L 48.6 62.2 Z', '#fff', 0.9) + P('M 51.4 62.2 L 52.6 65.4 L 53.8 61.6 Z', '#fff', 0.9) })
        + G('fo', null, '<g transform="rotate(-18 34 26)">' + P('M 34 27 L 25 22 L 25 32 Z', c2, 2) + P('M 34 27 L 43 22 L 43 32 Z', c2, 2) + C(34, 27, 2.6, c2, 1.8) + '</g>'),
      back: P('M 45 40 L 55 40 L 50 47 L 55 54 L 45 54 L 50 47 Z', c2, 1.4),
      armL: tube('M 37 72 Q 34 80 42 82', c1, 2.8) + L('M 38 88 L 58 70', INK, 3.4) + L('M 38 88 L 58 70', '#e2c08d', 1.6) + C(58.4, 69.6, 1.6, '#e2c08d', 1.2),
      armR: tube('M 63 72 Q 66 80 58 82', c1, 2.8) + L('M 62 88 L 42 70', INK, 3.4) + L('M 62 88 L 42 70', '#e2c08d', 1.6) + C(41.6, 69.6, 1.6, '#e2c08d', 1.2),
      front: G('sway', [50, 80], P('M 45 80 L 55 80 L 55 93 L 52.5 91 L 50 93 L 47.5 91 L 45 93 Z', c3, 1.8) + L('M 45.6 84 L 54.4 84 M 45.6 88 L 54.4 88', '#fff', 1.2, 'opacity=".7"'))
    });

    /* ── 36 Prisma · Einhorn ─────────────────────────────────── */
    const REGEN = ['#ff5d6c', '#ffa94d', '#ffe14d', '#5ad67d', '#4db8ff', '#b07cff'];
    const straehnen = (f, n0) => {
      let a = '', b = '';
      for (let i = 0; i < (n0 || 5); i++) { const d = f(i); a += L(d, INK, 7.2); b += L(d, REGEN[i % 6], 4.4); }
      return a + b;
    };
    W.add(36, {
      typ: 'Die Fabelhafte', spruch: 'Ist fabelhaft. Weiß es auch.',
      vars: '--fx:var(--c2)',
      o: { al: [38, 71], ar: [62, 71], ll: [43, 86], lr: [57, 86], head: [50, 68] },
      behind: G('tail', [62, 80], straehnen(i => 'M 61 ' + (78 + i * 1.6) + ' C ' + (74 + i) + ' ' + (76 + i * 2) + ' ' + (86 - i) + ' ' + (70 + i * 3) + ' ' + (90 - i * 2.4) + ' ' + (58 + i * 3.4), 4))
        + G('mane', [34, 30], straehnen(i => 'M ' + (42 - i * 2.4) + ' ' + (24 + i * 1.2) + ' C ' + (26 - i * 2.4) + ' ' + (28 + i) + ' ' + (18 - i * 1.2) + ' ' + (44 + i) + ' ' + (22 - i * 2.2) + ' ' + (62 + i * 1.5), 5)),
      legL: E(43, 88.4, 6, 3.8, c1, 2.4) + P('M 37.4 89 C 38 92 48 92 48.6 89 Z', c3, 1.4),
      legR: E(57, 88.4, 6, 3.8, c1, 2.4) + P('M 51.4 89 C 52 92 62 92 62.6 89 Z', c3, 1.4),
      body: E(50, 77, 13.5, 11.5, c1, 3) + G('fo', null, star(50, 77, 3, c4)),
      head: G('ear-l', [33, 32], P('M 28 36 C 26 28 28 20 32 15 C 37 19 40 25 41 31 Z', c1, 2.8) + P('M 30.4 31 C 30 26.5 31 22.5 32.6 19.6 C 35.4 22.4 37 26 37.6 29.6 Z', c4, 0))
        + G('ear-r', [67, 32], P(mirror('M 28 36 C 26 28 28 20 32 15 C 37 19 40 25 41 31 Z'), c1, 2.8) + P(mirror('M 30.4 31 C 30 26.5 31 22.5 32.6 19.6 C 35.4 22.4 37 26 37.6 29.6 Z'), c4, 0))
        + G('horn glow-soft', [50, 26], P('M 45 28 L 51.6 5 L 56 28 Z', c2, 2.4) + L('M 46.6 23 L 54.6 21 M 48 17.4 L 53.4 15.6 M 49.6 11.6 L 52.4 10.6', INK, 1.1, 'opacity=".45"'))
        + E(50, 48, 27, 22, c1, 3.2)
        + shade('M 72 38 C 79 50 76 62 63 68 C 71 60 74 50 72 38 Z', 0.1)
        + G('fo', null, E(50, 60, 13, 8, c4, 0, 'opacity=".55"') + C(46, 59, 1, INK, 0, 'opacity=".5"') + C(54, 59, 1, INK, 0, 'opacity=".5"'))
        + G('mane fo', [44, 26], straehnen(i => 'M ' + (57 - i * 3.4) + ' ' + (26 + i * 0.4) + ' C ' + (48 - i * 3.4) + ' ' + (25 + i) + ' ' + (38 - i * 2.4) + ' ' + (30 + i * 1.5) + ' ' + (34 - i * 2.6) + ' ' + (40 + i * 2.4), 4))
        + gesicht({ x: [39, 61.5], y: 46, r: 6.8, p: 0.52, iris: c3, lid: [0.36, 4], lash: true, look: [[0.3, 0.1], [0.3, 0.1]], lookc: 'lk-slow',
            brow: { dy: 2, a: [-6, -16], l: 4.6, w: 2, k: 1.6, up: [0, -1.6] }, bx: [31, 69.5], by: 56, blush: c4,
            m: 'smirk', ms: 1, mx: 50, my: 63.5, mw: 3.6, mlw: 2,
            post: star(70, 50, 2.2, c2, 'stroke="' + INK + '" stroke-width=".7"') }),
      back: straehnen(i => 'M ' + (42 + i * 4) + ' 28 C ' + (40 + i * 4) + ' 40 ' + (42 + i * 4) + ' 52 ' + (40 + i * 4) + ' 64', 5),
      armL: tube('M 38 71 Q 31 73 34 79', c1, 4.6) + P('M 31 80 C 31.4 83 37 83 37.4 80 Z', c3, 1.4),
      armR: tube('M 62 71 Q 69 75 68 81', c1, 4.6) + P('M 65 82 C 65.4 85 71 85 71.4 82 Z', c3, 1.4),
      fx: tw(88, 16, 3, c2, 0) + tw(10, 76, 2.4, c4, 0.8) + tw(90, 46, 2, c3, 1.6)
    });

    /* ── 37 Plato · Schnabeltier ─────────────────────────────── */
    const bill37 = (mouth) => P('M 29 57 C 29 49.5 71 49.5 71 57 C 71 65.5 60 68.5 50 68.5 C 40 68.5 29 65.5 29 57 Z', c2, 2.8)
      + shine('M 35 54.6 C 40 52.6 46 52 52 52', 1.8, 0.3)
      + E(45.6, 54.6, 1.3, 1, INK, 0) + E(54.4, 54.6, 1.3, 1, INK, 0) + mouth;
    W.add(37, {
      typ: 'Der Miesepeter', spruch: 'Findet alles doof. Außer seine Propellermütze.',
      o: { al: [34, 70], ar: [66, 70], ll: [41, 86], lr: [59, 86], head: [50, 68] },
      behind: G('tail', [62, 82], P('M 60 78 C 72 74 86 76 92 82 C 88 90 72 92 60 87 Z', c4, 2.8)
        + L('M 68 79 L 72 88 M 76 78 L 80 88 M 84 79 L 86 86 M 66 84 L 88 82', INK, 1, 'opacity=".3"')),
      legL: P('M 34 86 C 34 83.6 48 83.6 48 86 L 49 91 L 45 89.4 L 41 91.4 L 37 89.4 L 33 91 Z', c2, 2.2),
      legR: P(mirror('M 34 86 C 34 83.6 48 83.6 48 86 L 49 91 L 45 89.4 L 41 91.4 L 37 89.4 L 33 91 Z'), c2, 2.2),
      body: E(50, 76, 17.5, 13, c1, 3) + E(50, 78.5, 10.5, 8, c3, 0, 'opacity=".75" class="fo"'),
      head: E(50, 45, 26, 21, c1, 3.2)
        + shade('M 71 35 C 78 45 75 58 63 64 C 70 57 73 46 71 35 Z', 0.14)
        + shine('M 28 42 C 29 35 33 30 38 28', 2.4, 0.4)
        + G('hat', [50, 30], P('M 32.4 32 C 33 20.6 41.6 15.4 50 15.4 C 58.4 15.4 67 20.6 67.6 32 C 60 28 40 28 32.4 32 Z', '#ef4444', 2.6)
          + P('M 43.6 16.6 C 46.6 15.2 53.4 15.2 56.4 16.6 C 57.6 20.6 58 24.6 58 28.6 C 53 27.8 47 27.8 42 28.6 C 42 24.6 42.4 20.6 43.6 16.6 Z', '#ffd23f', 0)
          + L('M 43.6 16.6 C 42.4 20.6 42 24.6 42 28.6 M 56.4 16.6 C 57.6 20.6 58 24.6 58 28.6', INK, 1.2, 'opacity=".4"')
          + shine('M 36.6 26 C 37.6 21.6 40 19 43 17.6', 1.8, 0.5)
          + L('M 50 15.4 L 50 9.6', INK, 4) + L('M 50 15.4 L 50 9.6', '#cbd5e1', 1.8)
          + G('q-prop', [50, 9], E(43, 9, 7, 2.5, '#38bdf8', 1.8) + E(57, 9, 7, 2.5, '#34d399', 1.8)) + C(50, 9, 1.9, '#ffd23f', 1.4))
        + gesicht({ x: [38.5, 61.5], y: 42.5, r: 5.8, p: 0.5, lid: [0.44, 0], look: [[0.1, 0.3], [-0.1, 0.3]], lookc: 'lk-slow',
            blush: false, mx: 50, my: 60,
            pre: G('brow', null, L('M 32.5 34.6 L 45 37.4 M 67.5 34.6 L 55 37.4', INK, 3)),
            mouths: { normal: bill37(L('M 36 61 Q 50 57.4 64 61', INK, 2.2) + L('M 35 59.4 L 36.6 62 M 65 59.4 L 63.4 62', INK, 1.4)),
              open: P('M 37 62 C 38 72 62 72 63 62 Z', MOUTH, 2.2) + E(50, 67.4, 5, 2.2, TONGUE, 0) + bill37(''),
              sad: bill37(L('M 37 62.4 Q 50 57 63 62.4', INK, 2.2)),
              sleep: bill37(L('M 38 60.6 L 62 60.6', INK, 2)),
              wow: bill37(E(50, 61.4, 3, 2.4, MOUTH, 1.4)) } }),
      back: L('M 42 36 Q 50 40 58 36', INK, 1.2, 'opacity=".25"'),
      armL: tube('M 34 70 Q 34 79 46 78', c1, 5) + C(47.4, 78, 3, c2, 1.8),
      armR: tube('M 66 70 Q 66 81 54 81', c1, 5) + C(52.6, 81, 3, c2, 1.8),
      fx: G('not-sleep not-sad', null, L('M 80 22 l 4 -4 M 84 26 l 5 -1 M 78 17 l 1 -5', INK, 1.8, 'class="q-spark" opacity=".6"'))
    });

    /* ── 38 Krümel · Ratte ───────────────────────────────────── */
    const kaese = (x, y, cls) => G(cls, null, P('M ' + (x - 6.5) + ' ' + (y + 4.4) + ' L ' + (x + 6.5) + ' ' + (y + 4.4) + ' L ' + (x + 6.5) + ' ' + (y - 0.6) + ' L ' + (x - 5.5) + ' ' + (y - 5.4) + ' Z', '#ffd23f', 2)
      + C(x - 1.6, y + 1.4, 1.5, '#e8a600', 0) + C(x + 3.4, y + 2, 1.1, '#e8a600', 0) + C(x + 2.4, y - 1.4, 0.9, '#e8a600', 0));
    W.add(38, {
      typ: 'Der Schlingel', spruch: 'Das ist nicht dein Käse. Jetzt nicht mehr.',
      o: { al: [37, 70], ar: [63, 70], ll: [43, 86], lr: [57, 86], head: [50, 68] },
      behind: G('tail', [60, 84], L('M 60 84 C 74 90 88 84 86 72 C 84 64 76 66 77 72', INK, 5.4) + L('M 60 84 C 74 90 88 84 86 72 C 84 64 76 66 77 72', c3, 2.6)),
      legL: E(43, 88.6, 6.2, 3.4, c3, 2.2), legR: E(57, 88.6, 6.2, 3.4, c3, 2.2),
      body: E(50, 77, 13.5, 11.5, c1, 3) + E(50, 79.5, 8, 7, c4, 0, 'opacity=".8" class="fo"'),
      head: G('ear-l', [30, 32], P('M 27 39 C 15 37 11 24 19 17 C 23 13 30 13 34 17 L 31 22 L 37 21 C 41 26 41 33 38 37 Z', c1, 2.8) + C(26, 27, 6.6, c3, 0, 'opacity=".8"'))
        + G('ear-r', [70, 32], C(73, 26, 12.4, c1, 2.8) + C(73, 26.5, 7.6, c3, 0, 'opacity=".8"'))
        + P('M 50 27 C 66 27 75 36 75 46 C 75 54 66 61 58 65 C 55 67.6 52 69 50 69 C 48 69 45 67.6 42 65 C 34 61 25 54 25 46 C 25 36 34 27 50 27 Z', c1, 3.2)
        + shade('M 70 36 C 76 45 72 54 62 61 C 68 53 71 45 70 36 Z', 0.14)
        + shine('M 30 42 C 31 36 35 32 40 30', 2.2, 0.45)
        + G('fo', null, P('M 25.6 42 C 34 38 66 38 74.4 42 L 74.6 50 C 66 46 34 46 25.4 50 Z', c2, 2.2)
          + P('M 73 43 L 81 39 L 79 44.6 L 84 46 L 74 48.6 Z', c2, 1.8))
        + gesicht({ x: [40, 60], y: 45, r: 5.4, p: 0.5, lid: [0.36, 16], lidc: c2, look: [[0.45, 0.2], [0.45, 0.2]], lookc: 'lk-slow',
            bx: [34, 66], by: 55, m: 'buck', mx: 50, my: 61.8, mw: 3.6, mlw: 1.8,
            extra: L('M 42 58 L 30 55.6 M 42 60.6 L 31 61.6 M 58 58 L 70 55.6 M 58 60.6 L 69 61.6', INK, 1.1, 'opacity=".5"')
              + E(50, 58.6, 3.2, 2.4, c3, 1.8) + hl(49, 57.8, 0.8, 0.9) }),
      back: L('M 42 36 C 46 33 54 33 58 36', INK, 1.2, 'opacity=".3"') + P('M 26 42 C 34 38 66 38 74 42 L 74 49 C 66 45 34 45 26 49 Z', c2, 2.2),
      armL: tube('M 37 70 Q 31 74 31 79', c1, 4.2) + C(31, 80, 2.8, c3, 1.8),
      armR: tube('M 63 70 Q 69 72 71 77', c1, 4.2) + kaese(73.4, 75, 'kaese') + C(70.6, 78, 2.8, c3, 1.8),
      fx: kaese(73.4, 75, 'kaese-flug') + G('not-sleep not-sad', null, star(82, 66, 2.6, '#fff', 'class="q-spark" stroke="' + INK + '" stroke-width=".7"'))
    });

    /* ── 39 Howl · Werwolf ───────────────────────────────────── */
    const fur39 = 'M 50 23 C 56 23 62 25 66 28 L 71 23 L 72 33 C 77 38 79 44 79 50 L 86 53 L 79.6 57 L 83 63.4 L 75 63 '
      + 'C 71 70 61 73 50 73 C 39 73 29 70 25 63 L 17 63.4 L 20.4 57 L 14 53 L 21 50 C 21 44 23 38 28 33 L 29 23 L 34 28 C 38 25 44 23 50 23 Z';
    const krallen = (x, y) => L('M ' + (x - 2.4) + ' ' + y + ' l -.8 2.6 M ' + x + ' ' + (y + 0.6) + ' l 0 2.8 M ' + (x + 2.4) + ' ' + y + ' l .8 2.6', '#f1f0f7', 1.5);
    W.add(39, {
      typ: 'Der Heuler', spruch: 'Heult den Mond an. Trifft keinen einzigen Ton.',
      vars: '--fx:var(--c3)',
      o: { al: [32, 71], ar: [68, 71], ll: [41, 86], lr: [59, 86], head: [50, 72], zz: [8, 44], cl: [20, 12] },
      behind: E(50, 52, 35, 37, c3, 0, 'class="pulse"')
        + G('moon glow-soft', null, C(80, 16, 10.5, c4, 2) + C(77, 13, 2.2, INK, 0, 'opacity=".12"') + C(83.5, 19.5, 1.6, INK, 0, 'opacity=".12"') + C(78, 20.5, 1.2, INK, 0, 'opacity=".12"'))
        + G('tail', [64, 80], P('M 63 80 C 72 82 80 78 84 70 L 88 72 L 86 66 L 90 64 C 88 76 78 88 64 86 Z', c1, 2.6)),
      legL: P('M 34 84 C 34 81 48 81 48 84 L 48 89 C 48 91 34 91 34 89 Z', c5, 2.4) + krallen(41, 89.6),
      legR: P('M 52 84 C 52 81 66 81 66 84 L 66 89 C 66 91 52 91 52 89 Z', c5, 2.4) + krallen(59, 89.6),
      body: P('M 50 65 C 63 65 68 72 68 80 C 68 87 62 89 50 89 C 38 89 32 87 32 80 C 32 72 37 65 50 65 Z', c1, 3)
        + G('fo', null, P('M 36 71 C 44 76 56 76 64 71 L 63 76 C 56 80.6 44 80.6 37 76 Z', '#1e1b2e', 1.6)
          + [40, 45, 50, 55, 60].map((x, i) => P('M ' + (x - 1.7) + ' ' + (75.4 + (2 - Math.abs(i - 2)) * 0.9) + ' l 1.7 -3.6 l 1.7 3.6 Z', '#d7dbe6', 0.9)).join('')),
      head: G('ear-l', [32, 31], P('M 27 37 L 23 8 L 30 16 L 31 12.5 L 43 27 Z', c1, 2.8) + P('M 28.6 31 L 27.4 17 L 36.6 26 Z', c3, 0, 'opacity=".7"'))
        + G('ear-r', [68, 31], P('M 73 37 L 77 8 L 57 27 Z', c1, 2.8) + P('M 71.4 31 L 72.6 16 L 63.4 26 Z', c3, 0, 'opacity=".7"')
          + C(76.5, 22, 2.8, 'none', 1.6, 'stroke="#ffd23f"'))
        + P(fur39, c1, 3.2)
        + shade('M 72 39 C 78 47 77 59 70 65 C 73 57 74 47 72 39 Z', 0.16)
        + shine('M 29 45 C 30 39 33 35 37 32', 2.4, 0.3)
        + P('M 44 25 L 47 31.5 L 50 26 L 53 31.5 L 56 25', 'none', 1.6, 'opacity=".5"')
        + G('fo', null, P('M 50 51 C 60 51 64.6 56.6 63.6 62 C 62.6 68 56 71 50 71 C 44 71 37.4 68 36.4 62 C 35.4 56.6 40 51 50 51 Z', c6, 2.4)
          + E(50, 55.4, 4.4, 3, INK, 0) + hl(48.8, 54.6, 1, 0.8)
          + L('M 62 34 L 67 42', '#fff', 1.5, 'opacity=".55"'))
        + gesicht({ x: [38.5, 61.5], y: 44.5, r: 6, sc: 'var(--c2)', p: 0.3, lid: [0.2, 14], look: [[0.2, 0.1], [-0.2, 0.1]], lookc: 'lk-lr',
            brow: { dy: -1, a: 22, l: 6.4, w: 3.4, c: c5, k: 0 }, blush: false,
            m: 'grin', mx: 50, my: 62.4, mw: 6.4, teeth: true,
            post: G('not-sad not-sleep', null, P('M 44.4 62.6 L 45.8 67.6 L 47.4 63.2 Z', '#fff', 1) + P('M 52.6 63.2 L 54.2 67.6 L 55.6 62.6 Z', '#fff', 1)) ,
            pre: G('eo', null, C(38.5, 44.5, 10, c2, 0, 'opacity=".4" class="glow"') + C(61.5, 44.5, 10, c2, 0, 'opacity=".4" class="glow"')) }),
      back: L('M 36 41 L 42 47 M 50 37 L 50 47 M 64 41 L 58 47', c5, 2, 'opacity=".6"'),
      armL: tube('M 32 71 Q 25 75 24 81', c1, 5.5) + C(24, 82.5, 4, c5, 2.2) + krallen(24, 85.6),
      armR: tube('M 68 71 Q 75 75 76 81', c1, 5.5) + C(76, 82.5, 4, c5, 2.2) + krallen(76, 85.6),
      fx: tw(12, 26, 3, c3, 0.2) + tw(92, 44, 2.4, c3, 1.1) + tw(14, 78, 2.2, c2, 1.7)
        + '<text class="note only-cheer" x="12" y="18" font-size="12">♪</text>'
    });
  })();

  /* ── Was nach außen geht ───────────────────────────────────
     svg(id, skin, emoteClass, size) wie bisher.
     cls(action, id, dir) baut die Klassen für eine Bewegung:
       Emotes:  wave · cheer · dance · jump · sleep · sad
       Neu:     walk (dir: left|right|front|back) · fall · plop ·
                getup (dir: 'sit' = nach plop, sonst nach fall)    */
  const ACTIONS = ['idle', 'wave', 'cheer', 'dance', 'jump', 'sleep', 'sad', 'walk', 'fall', 'plop', 'getup'];
  function cls(action, id, dir) {
    const cid = parseInt(id || 0, 10);
    if (!action || action === 'idle') return 'c-idle';
    if (action === 'dance') return 'c-dance-' + cid + ' state-dance';
    let c = action + '-' + cid + ' state-' + action;
    if (action === 'walk') c += ' dir-' + (dir || 'front');
    if (action === 'getup' && dir === 'sit') c += ' from-sit';
    return c;
  }

  function getCreatureSVG(id, skinIdx, emoteClass, sizePx) {
    const cid = parseInt(id || 0, 10);
    return build(DEFS[cid] ? cid : 0, parseInt(skinIdx || 0, 10), emoteClass, sizePx);
  }

  window.KSCreatures = {
    list: CREATURES,
    svg: getCreatureSVG,
    cls: cls,
    moveNames: moveNames,
    actions: ACTIONS,
    /* Für eigene Figuren im selben Stil (MPSkills/Savanne/tiere.js):
       dasselbe Skelett, dasselbe Gesicht, dieselben Zeichenwerkzeuge. */
    buildDef: buildDef,
    /* Typ und Spruch eines Wesens („Der Lässige“ · „Kaut Kaugummi. Hat Zeit.“) */
    info: id => { const d = DEFS[parseInt(id || 0, 10)] || {}; return { typ: d.typ || '', spruch: d.spruch || '' }; },
    kit: { INK, P, E, C, R, L, G, tube, shine, hl, shade, star, tw, mirror, face, gesicht, mund }
  };
})();
