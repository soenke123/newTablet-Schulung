/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — Die 36 Wesen (creatures.js)
   ══════════════════════════════════════════════════════════════

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
      return E(x, y, r * 0.8, r, INK, 0)
        + hl(x - r * 0.26, y - r * 0.4, r * 0.34, 0.95)
        + hl(x + r * 0.26, y + r * 0.38, r * 0.15, 0.85)
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
     die Gruppe, bekommen alle 36 Wesen bei JEDEM Emote eine andere
     Körper-und-Arm-Kombination. Versatz und Schritt sind je Emote
     andere — wer beim Tanzen die Pirouette hat, hat beim Jubeln
     nicht auch die „dritte" Bewegung. Dazu ein eigenes Tempo.
     Die Namen braucht nur der Showroom.                            */
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
        h: (q * 2 + id + e) % 4, tp: TEMPO[(id * 3 + e * 2) % 5] };
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
     Die 36 Wesen
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
    { id: 35, name: "Spindle", gruppe: "spooky", skins: ["Schwarze Witwe","Toxic Cave","Geister Albino"] }
  ];

  const DEFS = [];

  /* ── 0 Puddl · Schleim mit Kappe und Aufziehschlüssel ───── */
  DEFS[0] = {
    pal: [['#ff2e93', '#22d3ee', '#ffe14d', '#ff9ccb'],
          ['#34d399', '#f59e0b', '#a855f7', '#a7f3d0'],
          ['#2b8fd6', '#ec4899', '#facc15', '#93c5fd']],
    o: { al: [22, 60], ar: [78, 60], ll: [39, 86], lr: [61, 86], head: [50, 88] },
    behind: G('spin-y', [10, 44], R(8, 42.5, 13, 3.4, 1.5, 'var(--c3)', 2)
      + E(7, 37.5, 3.6, 4.6, 'var(--c3)', 2.2) + E(7, 50.5, 3.6, 4.6, 'var(--c3)', 2.2)
      + C(7, 37.5, 1.2, INK, 0) + C(7, 50.5, 1.2, INK, 0)),
    legL: E(39, 88.5, 6.5, 3.6, 'var(--c1)', 2.4),
    legR: E(61, 88.5, 6.5, 3.6, 'var(--c1)', 2.4),
    head: P('M 50 21 C 69 21 79 36 81 54 C 83 68 85 79 80 84 C 77 87 73 84 69 86 C 64 89 59 85 53 87 C 47 89 42 85 36 87 C 30 89 24 86 21 83 C 16 78 17 68 19 54 C 21 36 31 21 50 21 Z', 'var(--c1)', 3.2)
      + shade('M 78 44 C 83 60 84 76 79 82 C 75 85 71 83 67 85 C 75 75 79 60 78 44 Z')
      + shine('M 28 44 C 29 35 34 28 41 25', 3, 0.7) + hl(27, 50, 1.7)
      + '{FACE}'
      + G('cap', null, P('M 31 30 C 30 16 40 10 50 10 C 60 10 70 16 69 30 C 57 26 43 26 31 30 Z', 'var(--c2)', 2.8)
        + P('M 63 27 C 72 24 82 25 87 29 C 82 33 72 33 64 31 Z', 'var(--c3)', 2.4)
        + L('M 50 11 L 50 27', INK, 1, 'opacity=".35"') + C(50, 10.5, 2.2, 'var(--c3)', 1.8)
        + shine('M 36 22 C 38 17 41 14 45 13', 2, 0.55)),
    face: { lx: 40, rx: 60, y: 50, r: 5.6, my: 61, mw: 4.5 },
    back: R(43, 26, 14, 3.4, 1.5, 'var(--c3)', 1.8),
    armL: tube('M 22 60 Q 14 63 13 70', 'var(--c1)', 5.5),
    armR: tube('M 78 60 Q 86 63 87 70', 'var(--c1)', 5.5),
    fx: G('drip', [72, 85], P('M 71 84 C 69.5 88 70 90 72 90.4 C 74 90 74.5 88 73 84 Z', 'var(--c1)', 1.4)),
    vars: '--fx:var(--c3)'
  };

  /* ── 1 Spark · Blitzkatze ──────────────────────────────── */
  DEFS[1] = {
    pal: [['#b48cff', '#7c4ddb', '#ffe14d', '#ff9ccf'],
          ['#ffc53d', '#e08a00', '#22d3ee', '#ff7a90'],
          ['#4a5480', '#2a3152', '#5eead4', '#c4a1ff']],
    o: { al: [38, 70], ar: [62, 70], ll: [41, 86], lr: [59, 86], head: [50, 68] },
    behind: G('tail', [62, 82], tube('M 62 82 C 78 84 87 74 84 62 C 82 54 85 48 89 45', 'var(--c2)', 5)
      + P('M 88 35 L 84 43 L 88 43 L 85 50 L 94 40 L 89.5 40 L 92.5 35 Z', 'var(--c3)', 1.8)),
    legL: E(41, 88.5, 6.2, 3.9, '#fff', 2.4) + L('M 39 87 L 39 90 M 43 87 L 43 90', INK, 1.1, 'opacity=".5"'),
    legR: E(59, 88.5, 6.2, 3.9, '#fff', 2.4) + L('M 57 87 L 57 90 M 61 87 L 61 90', INK, 1.1, 'opacity=".5"'),
    body: E(50, 76, 16.5, 12.5, 'var(--c1)', 3) + E(50, 78.5, 9, 7, '#fff', 0, 'opacity=".55" class="fo"'),
    head: G('glow-soft', null, P('M 52.5 5 L 45 19 L 50 19 L 46 30 L 57.5 14.5 L 52.5 14.5 L 56.5 5 Z', 'var(--c3)', 2.2))
      + G('ear-l', [30, 36], P('M 23 40 C 20 30 20 21 22.5 13.5 C 23.5 11 26 11 27.5 12.5 C 33 18 38 24 41 30 Z', 'var(--c1)', 3)
        + P('M 25.5 34 C 24.5 28 24.5 22.5 25.5 17.5 C 29.5 21 32.5 25 34.5 28.5 Z', 'var(--c4)', 0))
      + G('ear-r', [70, 36], P(mirror('M 23 40 C 20 30 20 21 22.5 13.5 C 23.5 11 26 11 27.5 12.5 C 33 18 38 24 41 30 Z'), 'var(--c1)', 3)
        + P(mirror('M 25.5 34 C 24.5 28 24.5 22.5 25.5 17.5 C 29.5 21 32.5 25 34.5 28.5 Z'), 'var(--c4)', 0))
      + E(50, 48, 29, 24, 'var(--c1)', 3.2)
      + shade('M 73 38 C 80 50 77 64 64 70 C 72 62 76 52 73 38 Z')
      + L('M 44 26.5 L 45.5 31.5 M 50 25 L 50 31 M 56 26.5 L 54.5 31.5', 'var(--c2)', 2.4)
      + shine('M 27 42 C 28 35 33 29 39 27', 2.6, 0.5)
      + E(50, 60, 10.5, 6.8, '#fff', 0, 'opacity=".75" class="fo"')
      + '{FACE}',
    face: { lx: 38, rx: 62, y: 47, r: 6.4, my: 59.5, mw: 4, mouth: 'cat', glint: 'var(--c3)',
      extra: P('M 47.8 55.6 L 52.2 55.6 L 50 58.2 Z', 'var(--c4)', 1.2)
        + L('M 33 58 L 24 56 M 33 61 L 24 62.5 M 67 58 L 76 56 M 67 61 L 76 62.5', INK, 1.3, 'opacity=".55"') },
    back: L('M 38 40 Q 50 45 62 40 M 40 50 Q 50 55 60 50', 'var(--c2)', 3),
    armL: tube('M 38 70 Q 33 75 34 81', 'var(--c1)', 5) + C(34, 81.5, 3.3, '#fff', 2),
    armR: tube('M 62 70 Q 67 75 66 81', 'var(--c1)', 5) + C(66, 81.5, 3.3, '#fff', 2),
    fx: L('M 37 9 L 40.5 12 L 38.5 13.5 L 42 17', 'var(--c3)', 1.8, 'class="zap"')
      + L('M 63 9 L 59.5 12 L 61.5 13.5 L 58 17', 'var(--c3)', 1.8, 'class="zap" style="animation-delay:.35s"'),
    vars: '--fx:var(--c3)'
  };

  /* ── 2 Plop · Frosch mit Pilzhut ───────────────────────── */
  const frogFoot = x => P('M ' + (x - 7) + ' 91.5 C ' + (x - 7) + ' 88 ' + (x - 4) + ' 86 ' + x + ' 86 C ' + (x + 4) + ' 86 ' + (x + 7) + ' 88 ' + (x + 7) + ' 91.5 Z', 'var(--c2)', 2.4)
    + C(x - 6, 91.3, 1.8, 'var(--c2)', 1.6) + C(x, 92, 1.8, 'var(--c2)', 1.6) + C(x + 6, 91.3, 1.8, 'var(--c2)', 1.6);
  DEFS[2] = {
    pal: [['#4ade80', '#16a34a', '#ef4444', '#facc15'],
          ['#38bdf8', '#0369a1', '#f59e0b', '#ec4899'],
          ['#facc15', '#ca8a04', '#8b5cf6', '#06b6d4']],
    o: { al: [23, 70], ar: [77, 70], ll: [34, 86], lr: [66, 86], head: [50, 88] },
    legL: frogFoot(34), legR: frogFoot(66),
    head: P('M 20 70 C 18 52 32 39 50 39 C 68 39 82 52 80 70 C 79 84 66 89 50 89 C 34 89 21 84 20 70 Z', 'var(--c1)', 3.2)
      + shade('M 76 58 C 81 70 76 84 62 87 C 72 80 77 70 76 58 Z')
      + E(50, 78, 17, 8.5, '#fff', 0, 'opacity=".32" class="fo"')
      + '{FACE}'
      + G('fo', null, P('M 50 74.5 L 42 70.5 L 42 78.5 Z', 'var(--c4)', 2) + P('M 50 74.5 L 58 70.5 L 58 78.5 Z', 'var(--c4)', 2) + C(50, 74.5, 2.4, 'var(--c4)', 1.8))
      + G('cap', null, P('M 17 40 C 17 20 32 9 50 9 C 68 9 83 20 83 40 C 70 35 30 35 17 40 Z', 'var(--c3)', 3)
        + P('M 23 38.5 C 37 35 63 35 77 38.5 L 75 42 C 62 39 38 39 25 42 Z', '#fff1d6', 2)
        + C(33, 25, 4.2, '#fff', 0) + C(53, 17, 3.6, '#fff', 0) + C(68, 27, 3.3, '#fff', 0) + C(44, 31, 2.2, '#fff', 0) + C(61, 33, 1.6, '#fff', 0)
        + shine('M 24 31 C 26 23 32 17 39 14', 2.4, 0.5)),
    face: { type: 'ring', lx: 38, rx: 62, y: 53, r: 6.8, my: 63.5, mw: 8 },
    back: C(38, 62, 3.4, 'var(--c2)', 0, 'opacity=".5"') + C(60, 58, 2.6, 'var(--c2)', 0, 'opacity=".5"') + C(55, 70, 3, 'var(--c2)', 0, 'opacity=".5"'),
    armL: tube('M 23 70 Q 17 76 19 82', 'var(--c1)', 5) + E(19.5, 83, 3.6, 2.6, 'var(--c2)', 1.8),
    armR: tube('M 77 70 Q 83 76 81 82', 'var(--c1)', 5) + E(80.5, 83, 3.6, 2.6, 'var(--c2)', 1.8),
    vars: '--fx:var(--c3)'
  };

  /* ── 3 Bubbles · Kugelfisch mit Matrosenmütze ──────────── */
  const spikes = (cx, cy, r0, r1, n, rot) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (rot || 0), w = 0.16;
      const p = (rr, aa) => (cx + Math.cos(aa) * rr).toFixed(1) + ' ' + (cy + Math.sin(aa) * rr).toFixed(1);
      s += 'M ' + p(r0, a - w) + ' L ' + p(r1, a) + ' L ' + p(r0, a + w) + ' Z ';
    }
    return s;
  };
  DEFS[3] = {
    pal: [['#47e0ff', '#0e7490', '#ff8a3d', '#ff4f8b'],
          ['#ff7a8a', '#be123c', '#ffd23f', '#38bdf8'],
          ['#5b54e8', '#2a2670', '#34d399', '#f472b6']],
    o: { al: [25, 53], ar: [75, 53], ll: [43, 77], lr: [57, 77], head: [50, 78] },
    behind: P(spikes(50, 53, 25, 31.5, 12, 0.26), 'var(--c2)', 2),
    legL: tube('M 43 76 C 42 82 38 84 39 88 C 40 91 44 90 43 87', 'var(--c1)', 4),
    legR: tube('M 57 76 C 58 82 62 84 61 88 C 60 91 56 90 57 87', 'var(--c1)', 4),
    head: C(50, 53, 26.5, 'var(--c1)', 3.2)
      + shade('M 70 36 C 80 48 79 66 66 75 C 58 80 48 81 40 78 C 56 78 72 66 70 36 Z')
      + E(50, 64, 15, 9.5, '#fff', 0, 'opacity=".3" class="fo"')
      + shine('M 30 44 C 32 36 39 30 47 29', 3, 0.7) + hl(30, 50, 1.9)
      + '{FACE}'
      + G('cap', null, '<g transform="rotate(-9 50 27)">' + P('M 36 29 L 64 29 L 61 22.5 C 56 19 44 19 39 22.5 Z', '#fff', 2.4)
        + P('M 36.5 27.5 L 63.5 27.5 L 64 31 L 36 31 Z', 'var(--c2)', 2) + C(50, 18.5, 2.8, 'var(--c4)', 1.8) + '</g>'),
    face: { lx: 40, rx: 60, y: 51, r: 5.4, my: 62, mw: 3.8 },
    back: L('M 36 46 Q 50 40 64 46', '#fff', 2.4, 'opacity=".4"'),
    armL: G('fin', null, P('M 25 50 C 15 42 8 50 10 58 C 11 63 19 62 25 57 Z', 'var(--c3)', 2.6)
      + L('M 13 53 L 22 53 M 14 57.5 L 22 55.5', INK, 1, 'opacity=".45"')),
    armR: G('fin', null, P(mirror('M 25 50 C 15 42 8 50 10 58 C 11 63 19 62 25 57 Z'), 'var(--c3)', 2.6)
      + L(mirror('M 13 53 L 22 53 M 14 57.5 L 22 55.5'), INK, 1, 'opacity=".45"')),
    fx: C(82, 32, 2.6, '#fff', 1.2, 'class="bubble" stroke="var(--c2)" fill-opacity=".55"')
      + C(87, 44, 1.9, '#fff', 1.1, 'class="bubble" style="animation-delay:-.9s" stroke="var(--c2)" fill-opacity=".55"')
      + C(78, 24, 1.5, '#fff', 1, 'class="bubble" style="animation-delay:-1.7s" stroke="var(--c2)" fill-opacity=".55"'),
    vars: '--fx:var(--c3)'
  };

  /* ── 4 Snooze · Schlafbär mit Zipfelmütze ──────────────── */
  DEFS[4] = {
    pal: [['#f5b13d', '#c97a16', '#38bdf8', '#ffe6b3', 'transparent', '#f5b13d'],
          ['#f1f5f9', '#b8c4d4', '#f43f5e', '#ffffff', 'transparent', '#f1f5f9'],
          ['#f8fafc', '#2a3044', '#10b981', '#ffffff', '#2a3044', '#2a3044']],
    o: { al: [33, 68], ar: [67, 68], ll: [40, 86], lr: [60, 86], head: [50, 66], zz: [74, 30] },
    legL: E(40, 88.5, 7, 4, 'var(--c2)', 2.4) + E(40, 88, 3.4, 1.9, 'var(--c4)', 0, 'opacity=".8"'),
    legR: E(60, 88.5, 7, 4, 'var(--c2)', 2.4) + E(60, 88, 3.4, 1.9, 'var(--c4)', 0, 'opacity=".8"'),
    body: E(50, 75, 20, 15, 'var(--c1)', 3) + E(50, 77.5, 12, 9.5, 'var(--c4)', 0, 'class="fo"'),
    head: G('ear-l', [29, 32], C(28, 30, 8, 'var(--c2)', 3) + C(28, 30, 4, 'var(--c4)', 0))
      + G('ear-r', [71, 32], C(72, 30, 8, 'var(--c2)', 3) + C(72, 30, 4, 'var(--c4)', 0))
      + E(50, 46, 25, 21.5, 'var(--c1)', 3.2)
      + shade('M 70 36 C 77 46 74 60 62 66 C 69 58 72 48 70 36 Z')
      + shine('M 29 42 C 30 36 33 32 37 30', 2.4, 0.55)
      + G('fo', null, E(40.5, 46.5, 6.4, 7.6, 'var(--c5)', 0, 'transform="rotate(22 40.5 46.5)"') + E(59.5, 46.5, 6.4, 7.6, 'var(--c5)', 0, 'transform="rotate(-22 59.5 46.5)"')
        + E(50, 56, 9.5, 7, 'var(--c4)', 2.2))
      + '{FACE}'
      + G('cap', null, P('M 28 33 C 27 18 40 11 53 12 C 66 13 77 21 82 34 C 76 30 70 29 66 32 C 58 26 42 26 28 33 Z', 'var(--c3)', 2.8)
        + C(42, 19, 1.5, '#fff', 0, 'opacity=".7"') + C(56, 17, 1.5, '#fff', 0, 'opacity=".7"') + C(67, 23, 1.4, '#fff', 0, 'opacity=".7"')
        + P('M 27 34 C 42 26 58 26 69 32 L 68 36 C 57 30 43 30 28 38 Z', '#fff', 2.2))
      + G('sway', [81, 33], C(83, 36, 4.8, '#fff', 2.2)),
    face: { lx: 40.5, rx: 59.5, y: 46, r: 4.6, my: 57.5, mw: 3, lid: 'var(--c6)',
      extra: E(50, 52.5, 3.4, 2.4, INK, 0) + hl(49, 51.8, 0.9, 0.8) },
    back: E(50, 50, 9, 6, 'var(--c2)', 0, 'opacity=".35"'),
    armL: tube('M 33 68 Q 27 74 28 81', 'var(--c2)', 6.5) + E(28, 81.5, 2.4, 1.8, 'var(--c4)', 0, 'opacity=".8"'),
    armR: tube('M 67 68 Q 73 74 72 81', 'var(--c2)', 6.5) + E(72, 81.5, 2.4, 1.8, 'var(--c4)', 0, 'opacity=".8"'),
    vars: '--fx:var(--c3)'
  };

  /* ── 5 Beep · Bildschirmroboter ────────────────────────── */
  DEFS[5] = {
    pal: [['#e2e8f0', '#8b9bb4', '#1b2236', '#2ee6ff'],
          ['#3a4068', '#7b84bd', '#0b0a1f', '#ff3dbb'],
          ['#f43f5e', '#9f1239', '#1e1b2e', '#ffe14d']],
    o: { al: [35, 66], ar: [65, 66], ll: [42, 80], lr: [58, 80], head: [50, 62] },
    legL: L('M 42 80 L 39 82 L 45 84 L 39 86 L 42 88', INK, 2.2) + R(35, 87, 14, 5, 2.5, 'var(--c2)', 2.2),
    legR: L('M 58 80 L 61 82 L 55 84 L 61 86 L 58 88', INK, 2.2) + R(51, 87, 14, 5, 2.5, 'var(--c2)', 2.2),
    body: R(34, 61, 32, 20, 6, 'var(--c1)', 3) + R(40, 66.5, 20, 9, 3, 'var(--c3)', 2, 'class="fo"')
      + C(45, 71, 1.9, 'var(--c4)', 0, 'class="led fo"') + C(50, 71, 1.9, 'var(--c4)', 0, 'class="led fo" style="animation-delay:.3s"') + C(55, 71, 1.9, 'var(--c4)', 0, 'class="led fo" style="animation-delay:.6s"'),
    head: G('ear-l antenna', [36, 23], L('M 36 23 L 31 10', INK, 2.4) + C(31, 9, 3.4, 'var(--c4)', 2, 'class="glow"'))
      + G('ear-r antenna', [64, 23], L('M 64 23 L 69 10', INK, 2.4) + C(69, 9, 3.4, 'var(--c4)', 2, 'class="glow" style="animation-delay:.5s"'))
      + C(22.5, 42, 3.6, 'var(--c2)', 2.4) + C(77.5, 42, 3.6, 'var(--c2)', 2.4)
      + R(23, 22, 54, 40, 11, 'var(--c1)', 3.2)
      + shade('M 75 30 L 75 51 C 75 57 71 60 65 60 L 70 57 C 73 55 73 51 73 47 Z', 0.15)
      + shine('M 27 36 C 27 30 29 26 34 25.5', 2.4, 0.6)
      + R(29, 28, 42, 28, 7, 'var(--c3)', 2.4, 'class="fo"')
      + L('M 33 32 L 40 32', '#fff', 1.6, 'opacity=".25" class="fo"')
      + '{FACE}',
    face: { type: 'screen', col: 'var(--c4)', lx: 41, rx: 59, y: 40, r: 4.4, my: 48.5, mw: 4.2, blush: false },
    back: R(36, 30, 28, 22, 4, 'var(--c2)', 2) + L('M 41 36 L 59 36 M 41 41 L 59 41 M 41 46 L 59 46', INK, 1.6, 'opacity=".4"'),
    armL: tube('M 35 66 L 26 74', 'var(--c2)', 3.2) + tube('M 27.5 72.5 C 22 72 20 78 24 80.5', 'var(--c2)', 2.8),
    armR: tube('M 65 66 L 74 74', 'var(--c2)', 3.2) + tube('M 72.5 72.5 C 78 72 80 78 76 80.5', 'var(--c2)', 2.8),
    vars: '--fx:var(--c4)'
  };

  /* ── 6 Chompy · Babydrache ─────────────────────────────── */
  DEFS[6] = {
    pal: [['#ff6a2b', '#ffe8a3', '#ffd23f', '#ffb347'],
          ['#3ba3e8', '#d6f0ff', '#eaf6ff', '#8fd3ff'],
          ['#16a37a', '#fef08a', '#fbbf24', '#5eead4']],
    o: { al: [35, 68], ar: [65, 68], ll: [40, 86], lr: [60, 86], head: [50, 62] },
    behind: G('wing-l', [36, 60], P('M 36 60 C 28 50 20 44 9 44 C 11 49 12 52 15 54 C 12 57 13 61 18 62 C 17 66 22 69 29 67 Z', 'var(--c4)', 2.6)
        + L('M 33 60 L 16 53 M 31 63 L 19 61.5', INK, 1.2, 'opacity=".45"'))
      + G('wing-r', [64, 60], P(mirror('M 36 60 C 28 50 20 44 9 44 C 11 49 12 52 15 54 C 12 57 13 61 18 62 C 17 66 22 69 29 67 Z'), 'var(--c4)', 2.6)
        + L(mirror('M 33 60 L 16 53 M 31 63 L 19 61.5'), INK, 1.2, 'opacity=".45"'))
      + G('tail', [64, 84], tube('M 62 85 C 75 89 86 85 87 74', 'var(--c1)', 6)
        + P('M 87 64 L 93 72 L 87 77 L 81 72 Z', 'var(--c3)', 2.2)),
    legL: E(40, 88, 7.5, 4.4, 'var(--c1)', 2.6) + C(35.5, 90.6, 1.3, '#fff', 1) + C(40, 91.4, 1.3, '#fff', 1) + C(44.5, 90.6, 1.3, '#fff', 1),
    legR: E(60, 88, 7.5, 4.4, 'var(--c1)', 2.6) + C(55.5, 90.6, 1.3, '#fff', 1) + C(60, 91.4, 1.3, '#fff', 1) + C(64.5, 90.6, 1.3, '#fff', 1),
    body: E(50, 74, 18, 15, 'var(--c1)', 3)
      + G('fo', null, E(50, 77, 11, 11, 'var(--c2)', 2.2) + L('M 42 72 Q 50 74 58 72 M 40.5 78 Q 50 80 59.5 78 M 43 84 Q 50 85.5 57 84', INK, 1.2, 'opacity=".4"')),
    head: P('M 35 30 C 30 23 30 16 33 10 C 36 16 40 20 43 24 Z', 'var(--c3)', 2.4)
      + P(mirror('M 35 30 C 30 23 30 16 33 10 C 36 16 40 20 43 24 Z'), 'var(--c3)', 2.4)
      + P('M 43 24 L 46.5 15 L 50 22 L 53.5 15 L 57 24 Z', 'var(--c3)', 2.2)
      + E(50, 42, 25, 21, 'var(--c1)', 3.2)
      + shade('M 69 32 C 77 42 74 56 63 62 C 70 54 72 44 69 32 Z')
      + shine('M 30 38 C 31 32 35 27 40 25', 2.6, 0.55)
      + E(50, 52.5, 12.5, 7.5, '#fff', 0, 'opacity=".22" class="fo"')
      + '{FACE}',
    face: { lx: 39, rx: 61, y: 40, r: 5.6, my: 56, mw: 4.5,
      extra: E(46.5, 50.5, 1.1, 0.8, INK, 0) + E(53.5, 50.5, 1.1, 0.8, INK, 0) + P('M 52.6 56.6 L 54 59.6 L 55.4 56.3 Z', '#fff', 1.1) },
    back: P('M 45 30 L 50 24 L 55 30 Z M 46 42 L 50 36 L 54 42 Z', 'var(--c3)', 1.8),
    armL: tube('M 35 68 Q 30 72 31 78', 'var(--c1)', 5) + C(31, 79, 2.6, 'var(--c1)', 2),
    armR: tube('M 65 68 Q 70 72 69 78', 'var(--c1)', 5) + C(69, 79, 2.6, 'var(--c1)', 2),
    fx: C(43, 46, 1.8, '#cbd5e1', 1, 'class="steam" style="animation-delay:-.4s"') + C(57, 46, 1.6, '#cbd5e1', 1, 'class="steam" style="animation-delay:-1.4s"'),
    vars: '--fx:var(--c3)'
  };

  /* ── 7 Nubi · Wölkchen mit Sonne ───────────────────────── */
  const rays = (cx, cy, r0, r1, n) => {
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      d += 'M ' + (cx + Math.cos(a) * r0).toFixed(1) + ' ' + (cy + Math.sin(a) * r0).toFixed(1) + ' L ' + (cx + Math.cos(a) * r1).toFixed(1) + ' ' + (cy + Math.sin(a) * r1).toFixed(1) + ' ';
    }
    return d;
  };
  DEFS[7] = {
    pal: [['#eaf6ff', '#38bdf8', '#ffd23f', '#ff7aa8'],
          ['#ffe4ec', '#f43f5e', '#fb923c', '#f59e0b'],
          ['#ece0ff', '#8b5cf6', '#7dd3fc', '#ec4899']],
    o: { al: [21, 64], ar: [79, 64], ll: [41, 78], lr: [59, 78], head: [50, 80], cl: [50, 9] },
    behind: G('sunb', null, G('spin', [72, 27], tube(rays(72, 27, 12, 16.5, 10), 'var(--c3)', 2.4)) + C(72, 27, 10, 'var(--c3)', 2.6) + shine('M 66 24 C 66.5 21 68.5 19 71 18.5', 2, 0.6)),
    legL: tube('M 41 78 L 41 85', 'var(--c2)', 3.5) + P('M 41 84 C 37.5 88 37.5 91 41 91.5 C 44.5 91 44.5 88 41 84 Z', 'var(--c2)', 2.2),
    legR: tube('M 59 78 L 59 85', 'var(--c2)', 3.5) + P('M 59 84 C 55.5 88 55.5 91 59 91.5 C 62.5 91 62.5 88 59 84 Z', 'var(--c2)', 2.2),
    head: P('M 24 78 C 12 78 9 64 19 59 C 15 47 27 38 37 43 C 40 30 61 28 65 40 C 75 35 86 44 81 54 C 92 57 90 78 76 78 C 68 84 32 84 24 78 Z', 'var(--c1)', 3.2)
      + shade('M 18 68 C 26 78 72 81 84 69 C 86 73 82 78 76 78 C 68 84 32 84 24 78 C 19 78 17 73 18 68 Z', 0.1)
      + shine('M 23 55 C 24 50 28 47 32 47', 2.4, 0.9) + shine('M 43 40 C 45 35 51 33 56 34', 2.4, 0.9)
      + '{FACE}',
    face: { lx: 41, rx: 59, y: 58, r: 4.8, my: 66, mw: 3.6, bcol: 'var(--c4)' },
    back: shine('M 30 62 C 40 58 60 58 70 62', 2.2, 0.7),
    armL: tube('M 21 64 Q 14 66 13 72', 'var(--c1)', 6),
    armR: tube('M 79 64 Q 86 66 87 72', 'var(--c1)', 6),
    fx: G('rainfx', null, [32, 44, 56, 68].map((x, i) => L('M ' + x + ' 84 l -1.2 4', '#4aa8ff', 2, 'class="rain" style="animation-delay:' + (i * 0.17) + 's"')).join('')),
    vars: '--fx:var(--c3)'
  };

  /* ── 8 Zorp · Zyklopen-Alien ───────────────────────────── */
  DEFS[8] = {
    pal: [['#84cc16', '#4d7c0f', '#ffd23f', '#22d3ee'],
          ['#fb5070', '#9f1239', '#38bdf8', '#ffd23f'],
          ['#9168f6', '#5b21b6', '#facc15', '#34d399']],
    o: { al: [26, 58], ar: [74, 58], ll: [41, 82], lr: [59, 82], head: [50, 86] },
    behind: E(50, 52, 37, 39, 'var(--c3)', 0, 'class="pulse"'),
    legL: tube('M 41 82 L 40 87', 'var(--c1)', 5) + E(39, 89, 6.2, 3.2, 'var(--c2)', 2.2),
    legR: tube('M 59 82 L 60 87', 'var(--c1)', 5) + E(61, 89, 6.2, 3.2, 'var(--c2)', 2.2),
    head: G('antenna', [50, 23], L('M 50 23 C 50 17 53 13 50 8.5', INK, 2.4) + C(50, 7, 4, 'var(--c3)', 2.2) + hl(48.8, 5.8, 1.2, 0.9))
      + P('M 50 22 C 68 22 76 38 76 56 C 76 74 68 85 50 85 C 32 85 24 74 24 56 C 24 38 32 22 50 22 Z', 'var(--c1)', 3.2)
      + shade('M 70 36 C 77 52 75 74 60 83 C 70 70 72 52 70 36 Z')
      + C(31, 68, 2.6, 'var(--c2)', 0, 'opacity=".5"') + C(70, 66, 2, 'var(--c2)', 0, 'opacity=".5"') + C(63, 29, 1.8, 'var(--c2)', 0, 'opacity=".5"')
      + E(50, 74, 12, 7.5, '#fff', 0, 'opacity=".25" class="fo"')
      + shine('M 30 42 C 31 35 35 29 41 26', 2.6, 0.55)
      + '{FACE}',
    face: { type: 'cyc', cx: 50, y: 46, r: 12.5, iris: 'var(--c4)', lid: 'var(--c1)', my: 66, mw: 5 },
    back: C(40, 44, 2.6, 'var(--c2)', 0, 'opacity=".5"') + C(58, 52, 3.2, 'var(--c2)', 0, 'opacity=".5"') + C(47, 62, 2, 'var(--c2)', 0, 'opacity=".5"'),
    armL: tube('M 26 58 C 18 60 16 66 14 70', 'var(--c1)', 4) + C(13.5, 71.5, 3, 'var(--c2)', 2),
    armR: tube('M 74 58 C 82 60 84 66 86 70', 'var(--c1)', 4) + C(86.5, 71.5, 3, 'var(--c2)', 2),
    fx: tw(16, 30, 3.8, 'var(--c3)', 0) + tw(85, 36, 3.2, '#fff', 0.8) + tw(80, 16, 2.6, 'var(--c3)', 1.5) + tw(14, 50, 2.4, '#fff', 1.1)
      + G('orbit', [50, 52], C(50, 12, 1.6, 'var(--c3)', 0.8) + C(88, 60, 1.3, 'var(--c4)', 0.8) + C(16, 72, 1.4, '#fff', 0.8)),
    vars: '--fx:var(--c3)'
  };

  /* ── 9 Lotti · Axolotl mit Krönchen ────────────────────── */
  const frond = (d, w) => tube(d, 'var(--c2)', w || 3.6);
  DEFS[9] = {
    pal: [['#ffb3d1', '#ff4f8b', '#ffd23f', '#fff0f6'],
          ['#f8fafc', '#fb7185', '#38bdf8', '#ffffff'],
          ['#7ef0c4', '#059669', '#facc15', '#ecfdf5']],
    o: { al: [37, 70], ar: [63, 70], ll: [42, 86], lr: [58, 86], head: [50, 66] },
    behind: G('tail', [62, 80], P('M 60 78 C 72 80 84 76 91 67 C 90 78 81 87 62 86 Z', 'var(--c1)', 2.6) + L('M 66 82 C 75 82 83 78 88 71', 'var(--c2)', 1.6, 'opacity=".6"')),
    legL: E(42, 88.5, 5.6, 3.4, 'var(--c1)', 2.4),
    legR: E(58, 88.5, 5.6, 3.4, 'var(--c1)', 2.4),
    body: E(50, 76, 15, 12, 'var(--c1)', 3) + E(50, 78, 9, 7.5, 'var(--c4)', 0, 'class="fo"'),
    head: G('ear-l', [28, 46], frond('M 29 40 C 21 36 17 32 15 25') + frond('M 27 47 C 19 47 13 45 8 41') + frond('M 28 54 C 21 57 15 58 10 57'))
      + G('ear-r', [72, 46], frond(mirror('M 29 40 C 21 36 17 32 15 25')) + frond(mirror('M 27 47 C 19 47 13 45 8 41')) + frond(mirror('M 28 54 C 21 57 15 58 10 57')))
      + E(50, 46, 24, 20, 'var(--c1)', 3.2)
      + shade('M 68 36 C 75 46 72 60 60 65 C 67 57 70 47 68 36 Z')
      + shine('M 30 42 C 31 36 35 31 40 29', 2.6, 0.6)
      + '{FACE}'
      + G('tiara', null, P('M 40 29 L 41.5 21 L 45.5 25.5 L 50 16 L 54.5 25.5 L 58.5 21 L 60 29 Z', 'var(--c3)', 2.2) + C(50, 24.5, 2, 'var(--c2)', 1.2) + C(41.5, 21, 1.2, '#fff', 0) + C(58.5, 21, 1.2, '#fff', 0)),
    face: { lx: 40, rx: 60, y: 46, r: 5, my: 55, mw: 5.5, bcol: 'var(--c2)' },
    back: L('M 42 40 Q 50 36 58 40', 'var(--c2)', 2.2, 'opacity=".5"'),
    armL: tube('M 37 70 Q 32 74 32 79', 'var(--c1)', 4.5) + C(32, 80, 2.4, 'var(--c1)', 1.8),
    armR: tube('M 63 70 Q 68 74 68 79', 'var(--c1)', 4.5) + C(68, 80, 2.4, 'var(--c1)', 1.8),
    fx: tw(62, 16, 3, 'var(--c3)', 0.3) + tw(37, 19, 2.2, '#fff', 1.4),
    vars: '--fx:var(--c3)'
  };

  /* ── 10 Grumbl · Felsgolem mit Kristallen ──────────────── */
  DEFS[10] = {
    pal: [['#8b98ad', '#5b6577', '#34d399', '#a3e635'],
          ['#757a8e', '#4a4e60', '#ff5a5a', '#fb923c'],
          ['#62708f', '#3f4964', '#c084fc', '#22d3ee']],
    o: { al: [24, 56], ar: [76, 56], ll: [40, 82], lr: [60, 82], head: [50, 84] },
    legL: R(33.5, 80, 13, 11.5, 3.5, 'var(--c2)', 2.6),
    legR: R(53.5, 80, 13, 11.5, 3.5, 'var(--c2)', 2.6),
    head: E(66, 22, 13, 11, 'var(--c3)', 0, 'class="pulse"')
      + G('crys', null, P('M 55 31 L 58 13 L 63 29 Z', 'var(--c3)', 2.2) + P('M 61 30 L 67 8 L 72 31 Z', 'var(--c3)', 2.2) + P('M 69 33 L 76 19 L 76 37 Z', 'var(--c3)', 2.2)
        + L('M 58.5 17 L 59.5 27 M 66.5 13 L 67.5 27 M 75 24 L 74.5 33', '#fff', 1.4, 'opacity=".6"'))
      + P('M 27 42 Q 30 31 40 29 L 58 26 Q 70 27 74 35 L 79 49 Q 81 62 78 71 Q 74 82 64 83 L 34 83 Q 23 81 21 70 L 21 53 Q 22 46 27 42 Z', 'var(--c1)', 3.2)
      + shade('M 74 40 L 79 49 Q 81 62 78 71 Q 74 82 64 83 L 54 83 Q 70 78 73 64 Q 76 52 74 40 Z', 0.15)
      + L('M 40 30 L 43 39 L 35 49 M 73 36 L 65 44 L 68 54 M 30 72 L 37 76', INK, 1.4, 'opacity=".3"')
      + P('M 28 39 C 32 32 42 29 48 30 C 47 34 41 37 36 38.5 C 32 39.5 28 40 28 39 Z', 'var(--c4)', 1.8)
      + C(33, 42, 1.4, 'var(--c4)', 0) + C(39, 41, 1.1, 'var(--c4)', 0)
      + shine('M 26 52 C 26 48 27 45 29 43', 2.4, 0.45)
      + '{FACE}',
    face: { lx: 40, rx: 60, y: 55, r: 4.8, my: 67, mw: 6,
      extra: L('M 33 46.5 L 45 48.5 M 67 46.5 L 55 48.5', INK, 3.2) },
    back: L('M 34 50 L 44 58 L 38 66 M 62 48 L 58 60 L 66 68', INK, 1.4, 'opacity=".35"') + P('M 40 70 C 46 66 56 66 62 70 C 56 72 46 72 40 70 Z', 'var(--c4)', 1.6),
    armL: tube('M 24 56 Q 16 62 15 66', 'var(--c2)', 6) + P('M 8 71 Q 8 64 15 64 Q 22 64 22 71 Q 22 78 15 78 Q 8 78 8 71 Z', 'var(--c1)', 2.6),
    armR: tube('M 76 56 Q 84 62 85 66', 'var(--c2)', 6) + P('M 92 71 Q 92 64 85 64 Q 78 64 78 71 Q 78 78 85 78 Q 92 78 92 71 Z', 'var(--c1)', 2.6),
    fx: tw(80, 14, 2.8, '#fff', 0.2) + tw(53, 18, 2.2, 'var(--c3)', 1.3),
    vars: '--fx:var(--c3);--cheer-r:-120deg'
  };

  /* ── 11 Mochi · Reiskuchen-Koch mit Schneebesen ────────── */
  DEFS[11] = {
    pal: [['#fff1f2', '#fda4af', '#ffffff', '#f43f5e'],
          ['#effbe9', '#86efac', '#ffffff', '#10b981'],
          ['#fdf3dc', '#d4a373', '#7a4a24', '#f59e0b']],
    o: { al: [22, 66], ar: [78, 66], ll: [41, 86], lr: [59, 86], head: [50, 88] },
    legL: E(41, 88.5, 5.6, 3.3, 'var(--c1)', 2.2),
    legR: E(59, 88.5, 5.6, 3.3, 'var(--c1)', 2.2),
    head: P('M 50 33 C 70 33 80 46 80 63 C 80 80 70 87 50 87 C 30 87 20 80 20 63 C 20 46 30 33 50 33 Z', 'var(--c1)', 3.2)
      + shade('M 74 50 C 80 62 78 78 66 84 C 74 74 76 62 74 50 Z', 0.1)
      + C(30, 74, 0.9, 'var(--c2)', 0) + C(70, 77, 0.9, 'var(--c2)', 0) + C(64, 44, 0.8, 'var(--c2)', 0) + C(36, 47, 0.8, 'var(--c2)', 0)
      + shine('M 27 56 C 27 50 30 45 35 42', 2.6, 0.9)
      + '{FACE}'
      + G('hat', null, P('M 35 37 C 26 37 25 24 34 23.5 C 34 13 46 10 50 16 C 54 10 66 13 66 23.5 C 75 24 74 37 65 37 Z', 'var(--c3)', 2.6)
        + L('M 42 24 C 42 28 43 31 44 34 M 58 24 C 58 28 57 31 56 34', INK, 1.2, 'opacity=".25"')
        + R(34, 34, 32, 6.5, 2.5, 'var(--c3)', 2.4)),
    face: { lx: 41, rx: 59, y: 58, r: 4.6, my: 66, mw: 3.5, bcol: 'var(--c2)' },
    back: L('M 38 42 C 40 40 44 40 46 42', INK, 1.4, 'opacity=".3"'),
    armL: tube('M 22 66 Q 15 69 15 75', 'var(--c1)', 5),
    armR: tube('M 78 66 Q 84 70 83 75', 'var(--c1)', 5)
      + G('whisk', null, tube('M 82 75 L 87 66', 'var(--c4)', 2.6)
        + P('M 87 66 C 84 59 89 53 93 56.5 C 96 60 92 65 87 66 Z', 'none', 1.4)
        + P('M 87 66 C 86.5 61 89 56.5 91.5 57.5', 'none', 1.2)),
    fx: tw(16, 40, 2.4, '#fff', 0.4) + tw(84, 44, 2, '#fff', 1.6),
    vars: '--fx:var(--c2)'
  };

  /* ── 12 Sprout · Radieschen ────────────────────────────── */
  const leaf = 'M 50 31 C 44 22 44 12 50 6 C 56 12 56 22 50 31 Z';
  const leafL = 'M 49 31 C 40 29 31 23 29 14 C 38 14 46 20 49 31 Z';
  DEFS[12] = {
    pal: [['#e8264f', '#ffd0d9', '#2fc65f', '#a5133a'],
          ['#eab308', '#fef9c3', '#16a34a', '#a16207'],
          ['#9333ea', '#f3e8ff', '#06b6d4', '#6b21a8']],
    o: { al: [23, 58], ar: [77, 58], ll: [42, 82], lr: [58, 82], head: [50, 86] },
    legL: tube('M 42 82 C 41 86 39 88 37 90', 'var(--c4)', 3) + L('M 39 88 L 36 87', INK, 1.4),
    legR: tube('M 58 82 C 59 86 61 88 63 90', 'var(--c4)', 3) + L('M 61 88 L 64 87', INK, 1.4),
    head: G('sway', [50, 31], P(leafL, 'var(--c3)', 2.4) + P(mirror(leafL), 'var(--c3)', 2.4) + P(leaf, 'var(--c3)', 2.4)
        + L('M 50 29 L 50 12 M 47 29 L 35 18 M 53 29 L 65 18', INK, 1.1, 'opacity=".35"'))
      + P('M 50 30 C 70 30 80 44 79 60 C 78 74 66 84 50 85 C 34 84 22 74 21 60 C 20 44 30 30 50 30 Z', 'var(--c1)', 3.2)
      + shade('M 73 44 C 80 56 76 74 62 82 C 71 72 75 58 73 44 Z')
      + E(50, 65, 13, 10, 'var(--c2)', 0, 'opacity=".6" class="fo"')
      + L('M 27 66 L 31 66 M 70 70 L 74 69', INK, 1.2, 'opacity=".3"')
      + shine('M 28 50 C 29 43 33 37 39 34', 2.6, 0.6)
      + '{FACE}',
    face: { lx: 40, rx: 60, y: 52, r: 5, my: 62, mw: 4 },
    back: L('M 40 50 L 44 50 M 56 60 L 60 60', INK, 1.2, 'opacity=".3"'),
    armL: tube('M 23 58 C 17 61 15 65 13 66', 'var(--c4)', 2.8) + P('M 13 66 C 8 64 7 60 9 58 C 12 59 14 62 13 66 Z', 'var(--c3)', 1.6),
    armR: tube('M 77 58 C 83 61 85 65 87 66', 'var(--c4)', 2.8) + P(mirror('M 13 66 C 8 64 7 60 9 58 C 12 59 14 62 13 66 Z'), 'var(--c3)', 1.6),
    fx: tube('M 50 84 C 50 88 52 89 54 90', 'var(--c4)', 1.8),
    vars: '--fx:var(--c3)'
  };

  /* ── 13 Bzz · Biene mit Fliegerbrille ──────────────────── */
  const beeWing = E(29, 31, 11.5, 7.5, 'var(--c3)', 2.4, 'transform="rotate(-32 29 31)" fill-opacity=".85"')
    + E(25, 43, 7.5, 5, 'var(--c3)', 2.2, 'transform="rotate(-8 25 43)" fill-opacity=".85"')
    + L('M 37 37 L 24 28 M 35 41 L 23 43', INK, 1, 'opacity=".35"');
  DEFS[13] = {
    pal: [['#ffcc33', '#2a2438', '#d6f2ff', '#b7791f'],
          ['#22e3ff', '#141a2e', '#ff9ec4', '#ffe14d'],
          ['#ff9ccb', '#7a1f4d', '#ffffff', '#38bdf8']],
    o: { al: [26, 60], ar: [74, 60], ll: [43, 82], lr: [57, 82], head: [50, 86] },
    behind: G('wing-l', [38, 40], beeWing) + G('wing-r', [62, 40], beeWing.replace(/rotate\(-32 29 31\)/, 'rotate(32 71 31)').replace(/cx="29"/, 'cx="71"').replace(/rotate\(-8 25 43\)/, 'rotate(8 75 43)').replace(/cx="25"/, 'cx="75"').replace(/M 37 37 L 24 28 M 35 41 L 23 43/, 'M 63 37 L 76 28 M 65 41 L 77 43')),
    legL: L('M 43 82 L 41 89', INK, 2.4) + E(40, 89.6, 3, 1.8, INK, 0),
    legR: L('M 57 82 L 59 89', INK, 2.4) + E(60, 89.6, 3, 1.8, INK, 0),
    head: G('antenna', [50, 34], L('M 44 34 C 42 26 38 22 34 20', INK, 2) + C(33.5, 19.5, 2.6, 'var(--c2)', 1.6)
        + L('M 56 34 C 58 26 62 22 66 20', INK, 2) + C(66.5, 19.5, 2.6, 'var(--c2)', 1.6))
      + E(50, 58, 27, 26, 'var(--c1)', 0)
      + P('M 25.1 68 C 36 71.5 64 71.5 74.9 68 L 70.4 75 C 62 78 38 78 29.6 75 Z', 'var(--c2)', 0, 'class="fo"')
      + P('M 35.6 80 C 42 82 58 82 64.4 80 L 55.3 83.5 C 52 84.2 48 84.2 44.7 83.5 Z', 'var(--c2)', 0)
      + E(50, 58, 27, 26, 'none', 3.2)
      + P('M 44 33 L 47 29 L 50 32.5 L 53 29 L 56 33', 'none', 2)
      + shade('M 70 44 C 78 56 76 72 64 80 C 71 70 73 56 70 44 Z', 0.1)
      + shine('M 28 50 C 29 44 32 40 36 37', 2.6, 0.6)
      + '{FACE}'
      + G('goggles', null, L('M 24 46 C 36 40 64 40 76 46', 'var(--c4)', 3)
        + C(40, 41, 6.2, 'var(--c4)', 2.4) + C(40, 41, 4, '#bfe9ff', 1.4) + hl(38.5, 39.5, 1.3, 0.9)
        + C(60, 41, 6.2, 'var(--c4)', 2.4) + C(60, 41, 4, '#bfe9ff', 1.4) + hl(58.5, 39.5, 1.3, 0.9)),
    face: { lx: 40, rx: 60, y: 54, r: 5, my: 62.5, mw: 4.2 },
    back: P('M 25.1 68 C 36 71.5 64 71.5 74.9 68 L 70.4 75 C 62 78 38 78 29.6 75 Z', 'var(--c2)', 0) + L('M 26 46 C 38 52 62 52 74 46', 'var(--c4)', 3),
    armL: tube('M 26 60 Q 19 64 19 70', 'var(--c2)', 2.6) + C(19, 71, 2.6, 'var(--c1)', 1.8),
    armR: tube('M 74 60 Q 81 64 81 70', 'var(--c2)', 2.6) + C(81, 71, 2.6, 'var(--c1)', 1.8),
    vars: '--fx:var(--c1)'
  };

  /* ── 14 Crunch · Toaster ───────────────────────────────── */
  const toast = x => P('M ' + (x - 7) + ' 36 C ' + (x - 10) + ' 36 ' + (x - 10) + ' 27 ' + (x - 5) + ' 26 C ' + (x - 5) + ' 20 ' + (x + 5) + ' 20 ' + (x + 5) + ' 26 C ' + (x + 10) + ' 27 ' + (x + 10) + ' 36 ' + (x + 7) + ' 36 Z', 'var(--c3)', 2.4)
    + P('M ' + (x - 5) + ' 34 C ' + (x - 7) + ' 31 ' + (x - 6) + ' 28 ' + (x - 3) + ' 28 C ' + (x - 3) + ' 25 ' + (x + 3) + ' 25 ' + (x + 3) + ' 28 C ' + (x + 6) + ' 28 ' + (x + 7) + ' 31 ' + (x + 5) + ' 34 Z', '#fff', 0, 'opacity=".35"');
  DEFS[14] = {
    pal: [['#a7f3d0', '#5fcfa5', '#f2b45a', '#0f766e'],
          ['#e2e8f0', '#a7b3c6', '#f59e0b', '#ef4444'],
          ['#facc15', '#d4a20c', '#ffffff', '#ec4899']],
    o: { al: [23, 62], ar: [77, 62], ll: [35, 84], lr: [65, 84], head: [50, 86] },
    behind: G('tail', [76, 74], tube('M 76 74 C 86 76 91 82 88 87 C 86 90 82 89 81 86', '#5b6474', 2.2) + R(77.5, 82, 6, 5, 1.2, '#a7b3c6', 1.6))
      + G('toast', null, toast(38) + toast(62)),
    legL: R(29, 83, 12, 7, 2.5, 'var(--c2)', 2.4),
    legR: R(59, 83, 12, 7, 2.5, 'var(--c2)', 2.4),
    head: R(21, 33, 58, 54, 13, 'var(--c1)', 3.2)
      + shade('M 70 34 C 75 36 78 40 78 46 L 78 74 C 78 82 72 86 64 86 C 71 82 72 78 72 72 L 72 44 C 72 40 71 36 70 34 Z', 0.13)
      + L('M 30 38 L 46 38 M 54 38 L 70 38', INK, 3)
      + shine('M 26 52 L 26 44 C 26 40 28 38 31 38', 2.6, 0.7)
      + L('M 26 79 L 74 79', INK, 1.2, 'opacity=".25"')
      + C(68, 72, 3.8, 'var(--c4)', 2.2, 'class="fo"') + L('M 68 72 L 68 69.2', '#fff', 1.4, 'class="fo"')
      + '{FACE}',
    face: { lx: 40, rx: 60, y: 54, r: 5, my: 64, mw: 4.5 },
    back: R(34, 48, 32, 20, 4, 'var(--c2)', 2) + L('M 38 54 L 62 54 M 38 59 L 62 59 M 38 64 L 62 64', INK, 1.4, 'opacity=".35"'),
    armL: tube('M 23 62 Q 15 64 14 70', 'var(--c2)', 3.2) + C(14, 71.5, 3, 'var(--c2)', 2),
    armR: tube('M 77 62 Q 85 64 86 70', 'var(--c2)', 3.2) + C(86, 71.5, 3, 'var(--c2)', 2),
    fx: L('M 38 17 C 36 14 40 12 38 9', '#c9a27e', 1.8, 'class="steam"') + L('M 62 17 C 60 14 64 12 62 9', '#c9a27e', 1.8, 'class="steam" style="animation-delay:-1.1s"'),
    vars: '--fx:var(--c3)'
  };

  /* ── 15 Tiki · Holzmaske mit Fackel ────────────────────── */
  const feather = 'M 50 30 C 46 22 46 12 50 5 C 54 12 54 22 50 30 Z';
  DEFS[15] = {
    pal: [['#b0643a', '#ffd23f', '#ff6a3c', '#22c1dc'],
          ['#5a6275', '#fb923c', '#ffc53d', '#ef4444'],
          ['#1a9cbf', '#fb7185', '#ffe14d', '#ffffff']],
    o: { al: [27, 60], ar: [73, 60], ll: [40, 84], lr: [60, 84], head: [50, 86] },
    behind: G('sway', [50, 30], P(feather, 'var(--c2)', 2.2, 'transform="rotate(-38 50 30)"') + P(feather, 'var(--c4)', 2.2, 'transform="rotate(38 50 30)"')
      + P(feather, 'var(--c2)', 2.2, 'transform="rotate(-16 50 30)"') + P(feather, 'var(--c2)', 2.2, 'transform="rotate(16 50 30)"') + P(feather, 'var(--c3)', 2.2)),
    legL: R(35, 82, 10, 9.5, 2.5, 'var(--c1)', 2.6),
    legR: R(55, 82, 10, 9.5, 2.5, 'var(--c1)', 2.6),
    head: R(26, 27, 48, 58, 10, 'var(--c1)', 3.2)
      + shade('M 66 28 C 71 29 74 33 74 38 L 74 76 C 74 81 70 85 64 85 C 68 81 69 78 69 74 L 69 36 C 69 32 68 30 66 28 Z', 0.15)
      + L('M 31 34 C 33 50 30 66 33 80 M 69 40 C 67 52 70 64 67 76', INK, 1.1, 'opacity=".22"')
      + L('M 30 34 L 70 34', 'var(--c4)', 2.4, 'opacity=".9"')
      + L('M 31 61 L 37 61 M 31 65 L 37 65 M 63 61 L 69 61 M 63 65 L 69 65', 'var(--c4)', 2.2, 'class="fo"')
      + shine('M 30 50 L 30 38', 2.4, 0.4)
      + '{FACE}',
    face: { type: 'ring', lx: 40, rx: 60, y: 49, r: 6, my: 69, mw: 9, blush: false,
      extra: L('M 31 40 L 45 42.5 M 69 40 L 55 42.5', INK, 3.4) + L('M 47.5 52 L 50 59 L 52.5 52', INK, 2) },
    back: L('M 38 44 L 62 44 M 38 56 L 62 56 M 38 68 L 62 68', 'var(--c4)', 2.2, 'opacity=".7"'),
    armL: tube('M 27 60 Q 19 64 18 71', 'var(--c1)', 5) + C(18, 72, 3, 'var(--c1)', 2),
    armR: tube('M 73 60 Q 81 64 82 71', 'var(--c1)', 5)
      + tube('M 80 78 L 86 50', '#7a4a24', 2.6)
      + G('flick', null, P('M 86.5 36 C 80 43 81 50 86 52 C 91 50 93 43 86.5 36 Z', 'var(--c3)', 2) + P('M 86.3 43 C 84 46 84.5 49 86.2 50 C 88 49 88.6 46 86.3 43 Z', '#fff3b0', 0))
      + C(82, 72, 3, 'var(--c1)', 2),
    fx: C(84, 30, 0.9, 'var(--c3)', 0, 'class="steam"') + C(89, 33, 0.8, 'var(--c3)', 0, 'class="steam" style="animation-delay:-1s"'),
    vars: '--fx:var(--c3)'
  };

  /* ── 16 Clawdy · Krebs in der Kaffeetasse ──────────────── */
  const pincer = 'M 21 34 C 12 33 11 22 18 18 L 21 25 Z M 21 34 C 28 32 30 23 26 18 L 22.5 25 Z';
  DEFS[16] = {
    pal: [['#ffffff', '#f5a524', '#ef4444', '#dc2626', '#6b3e1f'],
          ['#fef3c7', '#b45309', '#f97316', '#ea580c', '#c89b6d'],
          ['#ecfdf5', '#10b981', '#06b6d4', '#0891b2', '#7cc47a']],
    o: { al: [35, 48], ar: [65, 48], ll: [42, 86], lr: [58, 86], head: [50, 56], zz: [72, 14], cl: [80, 8], dz: [70, 30] },
    vars: '--fx:var(--c2);--wave-a:-40deg;--wave-b:10deg;--cheer-r:-25deg',
    legL: L('M 40 85 L 35 91 M 45 86 L 43 92', 'var(--c3)', 2.6) + L('M 40 85 L 35 91 M 45 86 L 43 92', INK, 0.8, 'opacity=".5"'),
    legR: L('M 60 85 L 65 91 M 55 86 L 57 92', 'var(--c3)', 2.6) + L('M 60 85 L 65 91 M 55 86 L 57 92', INK, 0.8, 'opacity=".5"'),
    body: tube('M 72 58 C 85 55 86 75 70 73', 'var(--c1)', 3.4)
      + E(50, 50, 24, 5, 'var(--c5)', 2.6),
    head: G('antenna', [50, 38], L('M 45 38 L 42 26', INK, 2.4) + L('M 55 38 L 58 26', INK, 2.4))
      + E(50, 46, 17, 11, 'var(--c3)', 3)
      + shine('M 37 42 C 38 39 41 37 44 36.5', 2, 0.6)
      + '{FACE}',
    face: { type: 'ring', lx: 42, rx: 58, y: 23, r: 4.3, my: 49, mw: 4, blush: false,
      extra: E(39, 48.5, 3, 1.8, '#ff6f9f', 0, 'opacity=".55"') + E(61, 48.5, 3, 1.8, '#ff6f9f', 0, 'opacity=".55"') },
    back: C(42, 23, 4.3, 'var(--c3)', 2.2) + C(58, 23, 4.3, 'var(--c3)', 2.2),
    armL: tube('M 35 48 C 27 46 23 41 21 34', 'var(--c3)', 3.6) + G('claw', null, P(pincer, 'var(--c4)', 2.2)),
    armR: tube('M 65 48 C 73 46 77 41 79 34', 'var(--c3)', 3.6) + G('claw', null, P(mirror(pincer), 'var(--c4)', 2.2)),
    front: P('M 26 50 L 74 50 L 70.5 79 C 69.5 84.5 64 87 58 87 L 42 87 C 36 87 30.5 84.5 29.5 79 Z', 'var(--c1)', 0)
      + P('M 26.9 55.5 L 73.1 55.5 L 72.6 59.5 L 27.4 59.5 Z', 'var(--c2)', 0)
      + shade('M 66 52 L 74 50 L 70.5 79 C 69.5 84.5 64 87 58 87 L 56 87 C 63 84 66 80 67 74 Z', 0.1)
      + P('M 26 50 L 74 50 L 70.5 79 C 69.5 84.5 64 87 58 87 L 42 87 C 36 87 30.5 84.5 29.5 79 Z', 'none', 3.2)
      + shine('M 31 64 L 32.5 78', 2.4, 0.7),
    fx: L('M 78 46 C 76 42 80 40 78 36', '#cbd5e1', 2, 'class="steam"') + L('M 22 46 C 20 42 24 40 22 36', '#cbd5e1', 2, 'class="steam" style="animation-delay:-1.1s"')
  };

  /* ── 17 Mimi · Origami-Fuchs ───────────────────────────── */
  DEFS[17] = {
    pal: [['#fff4f4', '#f43f5e', '#be123c', '#ffd23f'],
          ['#33476b', '#38bdf8', '#0ea5e9', '#fbbf24'],
          ['#fff7d6', '#facc15', '#ca8a04', '#ec4899']],
    o: { al: [41, 66], ar: [59, 66], ll: [42, 86], lr: [58, 86], head: [50, 62] },
    behind: G('tail', [62, 80], P('M 62 81 L 85 60 L 90 73 Z', 'var(--c2)', 2.4) + P('M 62 81 L 90 73 L 80 87 Z', 'var(--c1)', 2.4) + P('M 85 60 L 92 57 L 90 73 Z', 'var(--c3)', 2.2)),
    legL: P('M 36 91 L 42 83 L 48 91 Z', 'var(--c2)', 2.2),
    legR: P('M 52 91 L 58 83 L 64 91 Z', 'var(--c2)', 2.2),
    body: P('M 33 87 L 50 57 L 67 87 Z', 'var(--c1)', 3) + shade('M 50 59 L 66 86 L 50 86 Z', 0.12) + L('M 50 60 L 50 86', INK, 1, 'opacity=".3"'),
    head: G('ear-l', [30, 32], P('M 25 36 L 21 11 L 42 27 Z', 'var(--c1)', 2.8) + P('M 26.5 31 L 24.5 17.5 L 36.5 27.5 Z', 'var(--c2)', 0))
      + G('ear-r', [70, 32], P('M 75 36 L 79 11 L 58 27 Z', 'var(--c1)', 2.8) + P('M 73.5 31 L 75.5 17.5 L 63.5 27.5 Z', 'var(--c2)', 0))
      + P('M 21 36 L 41 26 L 59 26 L 79 36 L 67 56 L 50 65 L 33 56 Z', 'var(--c1)', 3.2)
      + shade('M 50 40 L 59 26 L 79 36 L 67 56 L 50 65 Z', 0.1)
      + L('M 41 26 L 50 40 L 59 26 M 50 40 L 50 64 M 21 36 L 38 46 M 79 36 L 62 46', INK, 1.1, 'opacity=".22"')
      + P('M 33 56 L 41 50 L 50 65 Z', 'var(--c2)', 0, 'opacity=".55" class="fo"') + P('M 67 56 L 59 50 L 50 65 Z', 'var(--c2)', 0, 'opacity=".55" class="fo"')
      + star(50, 32, 3.6, 'var(--c4)', 'stroke="' + INK + '" stroke-width="1" class="glow-soft"')
      + '{FACE}',
    face: { lx: 39, rx: 61, y: 43, r: 4.6, my: 55, mw: 3.5, mouth: 'cat', bcol: 'var(--c2)',
      extra: P('M 47.5 59.5 L 52.5 59.5 L 50 63 Z', 'var(--c3)', 1.4) },
    back: L('M 40 44 L 50 52 L 60 44', INK, 1.1, 'opacity=".3"'),
    armL: tube('M 41 66 L 34 76', 'var(--c1)', 4) + P('M 31 75 L 37 76 L 33 81 Z', 'var(--c2)', 1.6),
    armR: tube('M 59 66 L 66 76', 'var(--c1)', 4) + P('M 69 75 L 63 76 L 67 81 Z', 'var(--c2)', 1.6),
    fx: tw(14, 22, 3.4, 'var(--c4)', 0) + tw(88, 22, 2.8, '#fff', 0.9) + tw(12, 58, 2.4, 'var(--c2)', 1.6) + tw(86, 48, 2.2, 'var(--c4)', 0.5)
      + G('orbit', [50, 48], P('M 50 4 L 54 7 L 50 10 L 46 7 Z', 'var(--c2)', 1.2) + P('M 90 74 L 93 76 L 90 78 L 87 76 Z', 'var(--c4)', 1)),
    vars: '--fx:var(--c4)'
  };

  /* ── 18 Fuzz · Rußflocke mit Brille ────────────────────── */
  const fuzzBall = (cx, cy, r0, r1, n) => {
    const p = (r, a) => (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1);
    let d = 'M ' + p(r0, 0);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      d += ' Q ' + p(r1, (a0 + a1) / 2) + ' ' + p(r0, a1);
    }
    return d + ' Z';
  };
  DEFS[18] = {
    pal: [['#30354a', '#ffd23f', '#38bdf8', '#e0f2fe', '#ffffff'],
          ['#ff8fc8', '#ffffff', '#fde047', '#ffffff', '#1e1b2e'],
          ['#6b7280', '#ef4444', '#22c55e', '#e0f2fe', '#ffffff']],
    o: { al: [27, 62], ar: [73, 62], ll: [43, 82], lr: [57, 82], head: [50, 86] },
    legL: L('M 43 81 L 42 88.5', 'var(--c1)', 2.6) + E(41, 89.6, 3.6, 2, 'var(--c1)', 1.6),
    legR: L('M 57 81 L 58 88.5', 'var(--c1)', 2.6) + E(59, 89.6, 3.6, 2, 'var(--c1)', 1.6),
    head: G('antenna', [50, 30], L('M 50 30 C 50 23 54 19 52 14', INK, 2.2) + C(52, 12, 3.4, 'var(--c3)', 2, 'class="glow"'))
      + P(fuzzBall(50, 57, 26, 31, 26), 'var(--c1)', 2.8)
      + P(fuzzBall(50, 57, 21, 24, 22), '#fff', 0, 'opacity=".09"')
      + shine('M 30 48 C 31 42 35 37 40 35', 2.4, 0.35)
      + C(40, 52, 8.5, 'var(--c4)', 0, 'class="fo"') + C(60, 52, 8.5, 'var(--c4)', 0, 'class="fo"')
      + '{FACE}'
      + G('fo', null, C(40, 52, 9, 'none', 0, 'stroke="' + INK + '" stroke-width="5"') + C(40, 52, 9, 'none', 0, 'stroke="var(--c2)" stroke-width="2.6"')
        + C(60, 52, 9, 'none', 0, 'stroke="' + INK + '" stroke-width="5"') + C(60, 52, 9, 'none', 0, 'stroke="var(--c2)" stroke-width="2.6"')
        + L('M 49 51 Q 50 49.5 51 51', 'var(--c2)', 2.4) + L('M 34 47 L 37 45', '#fff', 1.6, 'opacity=".8"') + L('M 54 47 L 57 45', '#fff', 1.6, 'opacity=".8"')),
    face: { lx: 40, rx: 60, y: 52.5, r: 4.4, my: 68, mw: 4, mcol: 'var(--c5)', blush: false,
      extra: E(29, 64, 3.6, 2.1, '#ff6f9f', 0, 'opacity=".55"') + E(71, 64, 3.6, 2.1, '#ff6f9f', 0, 'opacity=".55"') },
    back: P(fuzzBall(50, 50, 9, 11, 10), '#fff', 0, 'opacity=".1"'),
    armL: L('M 27 62 Q 20 66 19 71', 'var(--c1)', 2.6) + C(18.5, 72, 2.6, 'var(--c1)', 1.8),
    armR: L('M 73 62 Q 80 66 81 71', 'var(--c1)', 2.6) + C(81.5, 72, 2.6, 'var(--c1)', 1.8),
    fx: C(16, 40, 1.8, 'var(--c1)', 1, 'class="bubble"') + C(85, 50, 1.4, 'var(--c1)', 1, 'class="bubble" style="animation-delay:-1.2s"') + C(80, 28, 1.2, 'var(--c1)', 0.8, 'class="bubble" style="animation-delay:-2s"'),
    vars: '--fx:var(--c3)'
  };

  /* ── 19 Snip · Chamäleon ───────────────────────────────── */
  DEFS[19] = {
    pal: [['#22b07d', '#facc15', '#06b6d4', '#ec4899'],
          ['#8b5cf6', '#22e3ff', '#f43f5e', '#ffe14d'],
          ['#e0a43a', '#fef3c7', '#c2410c', '#10b981']],
    o: { al: [36, 70], ar: [64, 70], ll: [41, 85], lr: [59, 85], head: [50, 64] },
    behind: G('tail', [62, 80], tube('M 62 80 C 77 82 87 73 85 62 C 83 53 72 53 72 61 C 72 67 79 67 79 62', 'var(--c3)', 4.5)),
    legL: E(41, 88.5, 6, 3.6, 'var(--c1)', 2.4) + L('M 38 90.5 L 37 92 M 44 90.5 L 45 92', INK, 1.4),
    legR: E(59, 88.5, 6, 3.6, 'var(--c1)', 2.4) + L('M 56 90.5 L 55 92 M 62 90.5 L 63 92', INK, 1.4),
    body: E(50, 75, 17, 13, 'var(--c1)', 3)
      + G('fo', null, P('M 41 69 C 46 71 54 71 59 69 L 60 74 C 54 76 46 76 40 74 Z', 'var(--c2)', 0) + P('M 41 78 C 46 80 54 80 59 78 L 57 83 C 53 84.5 47 84.5 43 83 Z', 'var(--c2)', 0)),
    head: P('M 37 31 L 41 20 L 46 28 L 50 15 L 54 28 L 59 20 L 63 31 Z', 'var(--c3)', 2.2)
      + E(50, 47, 25, 20, 'var(--c1)', 3.2)
      + shade('M 70 38 C 77 48 74 61 62 66 C 69 59 72 49 70 38 Z')
      + shine('M 33 38 C 35 34 38 31 42 29.5', 2.4, 0.55)
      + C(35, 44, 9.5, 'var(--c1)', 2.8) + C(35, 44, 7.6, 'var(--c4)', 0)
      + C(65, 44, 9.5, 'var(--c1)', 2.8) + C(65, 44, 7.6, 'var(--c4)', 0)
      + '{FACE}'
      + G('tongue', null, tube('M 50 58 C 58 62 67 60 71 55', '#ff6f91', 2.4) + C(72, 54, 2.8, '#ff6f91', 1.6)),
    face: { type: 'ring', lx: 35, rx: 65, y: 44, r: 5.2, my: 56, mw: 7, blush: false },
    back: L('M 38 46 Q 50 52 62 46', 'var(--c3)', 2.4, 'opacity=".7"'),
    armL: tube('M 36 70 Q 30 74 31 80', 'var(--c1)', 4.5) + L('M 29 80 L 33 81', INK, 1.6),
    armR: tube('M 64 70 Q 70 74 69 80', 'var(--c1)', 4.5) + L('M 71 80 L 67 81', INK, 1.6),
    vars: '--fx:var(--c3)'
  };

  /* ── 20 Boomer · Wecker ────────────────────────────────── */
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, r0 = i % 3 ? 20 : 18.5;
    ticks += 'M ' + (50 + Math.cos(a) * r0).toFixed(1) + ' ' + (55 + Math.sin(a) * r0).toFixed(1) + ' L ' + (50 + Math.cos(a) * 21.5).toFixed(1) + ' ' + (55 + Math.sin(a) * 21.5).toFixed(1) + ' ';
  }
  const bell = 'M 19 30 C 16 19 26 12 35 16 C 39 18 40 22 39 25 Z';
  DEFS[20] = {
    pal: [['#f4c26b', '#d98f1f', '#fffaf0', '#8a5a14'],
          ['#3a4270', '#ff3d7f', '#e6fbff', '#ffd23f'],
          ['#bfe3ff', '#f9a8d4', '#ffffff', '#38bdf8']],
    o: { al: [22, 58], ar: [78, 58], ll: [39, 82], lr: [61, 82], head: [50, 86] },
    behind: G('bell-l', [32, 26], P(bell, 'var(--c2)', 2.6) + shine('M 22 25 C 21 21 23 18 26 17', 1.8, 0.6))
      + G('bell-r', [68, 26], P(mirror(bell), 'var(--c2)', 2.6))
      + L('M 50 25 L 50 15', INK, 2.2) + C(50, 13.5, 2.8, 'var(--c4)', 1.8),
    legL: tube('M 39 82 L 35 88', 'var(--c4)', 3) + C(34.5, 89, 3, 'var(--c4)', 2),
    legR: tube('M 61 82 L 65 88', 'var(--c4)', 3) + C(65.5, 89, 3, 'var(--c4)', 2),
    head: C(50, 55, 30, 'var(--c1)', 3.2)
      + shade('M 72 36 C 82 50 80 70 64 81 C 74 68 76 52 72 36 Z', 0.15)
      + shine('M 26 50 C 27 40 32 33 39 29', 2.6, 0.6)
      + C(50, 55, 23.5, 'var(--c3)', 2.6, 'class="fo"')
      + L(ticks, INK, 1.4, 'opacity=".45" class="fo"')
      + G('spin hand-m fo', [50, 55], L('M 50 55 L 50 40', INK, 1.6, 'opacity=".55"'))
      + C(50, 55, 1.6, 'var(--c2)', 1, 'class="fo"')
      + '{FACE}',
    face: { lx: 41, rx: 59, y: 49, r: 4.6, my: 63, mw: 4.5 },
    back: C(50, 55, 12, 'var(--c2)', 2.2) + L('M 45 55 L 55 55', INK, 2),
    armL: tube('M 22 58 Q 14 62 14 68', 'var(--c4)', 3) + C(13.5, 69.5, 3.6, '#fff', 2),
    armR: tube('M 78 58 Q 86 62 86 68', 'var(--c4)', 3) + C(86.5, 69.5, 3.6, '#fff', 2),
    fx: G('ringfx', null, L('M 12 14 L 8 11 M 13 9 L 11 5 M 88 14 L 92 11 M 87 9 L 89 5', 'var(--c2)', 1.8, 'class="zap"')),
    vars: '--fx:var(--c2)'
  };

  /* ── 21 Pebbl · Pinguin mit Schal und Ohrenschützern ───── */
  const beak = (open, sad) => open
    ? P('M 44.5 52 L 55.5 52 L 50 55.5 Z', '#ff9f1c', 1.6) + P('M 46 57 L 54 57 L 50 61.5 Z', '#ff9f1c', 1.6) + E(50, 56, 3.2, 1.3, '#9b1c31', 0)
    : P(sad ? 'M 45 53 L 55 53 L 50 60 Z' : 'M 44.5 52 L 55.5 52 L 50 58 Z', '#ff9f1c', 1.8) + L('M 46.5 54.5 L 53.5 54.5', INK, 0.8, 'opacity=".4"');
  DEFS[21] = {
    pal: [['#2a3352', '#ffffff', '#f43f5e', '#facc15'],
          ['#2b5cb8', '#f0fdf4', '#38bdf8', '#f472b6'],
          ['#8a4b1c', '#fefce8', '#22c55e', '#ea580c']],
    o: { al: [25, 56], ar: [75, 56], ll: [41, 86], lr: [59, 86], head: [50, 86] },
    legL: E(41, 89, 7, 3.4, '#ff9f1c', 2.2),
    legR: E(59, 89, 7, 3.4, '#ff9f1c', 2.2),
    head: P('M 50 22 C 70 22 78 41 78 60 C 78 78 68 87 50 87 C 32 87 22 78 22 60 C 22 41 30 22 50 22 Z', 'var(--c1)', 3.2)
      + P('M 50 35 C 42 29 30 33 31 45 C 31 52 34 56 36 60 C 32 68 34 80 50 82 C 66 80 68 68 64 60 C 66 56 69 52 69 45 C 70 33 58 29 50 35 Z', 'var(--c2)', 0, 'class="fo"')
      + shine('M 28 48 C 29 40 32 34 37 30', 2.4, 0.45)
      + '{FACE}'
      + G('muffs', null, L('M 27 42 C 26 16 74 16 73 42', INK, 5) + L('M 27 42 C 26 16 74 16 73 42', 'var(--c4)', 2.6)
        + C(25, 44, 6.8, 'var(--c4)', 2.6) + C(75, 44, 6.8, 'var(--c4)', 2.6) + hl(23, 42, 1.6, 0.7) + hl(73, 42, 1.6, 0.7))
      + P('M 24.5 62 C 40 68 60 68 75.5 62 L 75.5 68 C 60 74 40 74 24.5 68 Z', 'var(--c3)', 2.4)
      + L('M 34 65.5 L 34 71 M 44 67 L 44 72.5 M 56 67 L 56 72.5 M 66 65.5 L 66 71', '#fff', 1.4, 'opacity=".35"')
      + G('sway', [62, 68], P('M 59 68 L 66 68 L 68 82 L 61 82 Z', 'var(--c3)', 2.2) + L('M 62 82 L 62 85 M 64.5 82 L 64.5 85 M 67 82 L 67 85', 'var(--c3)', 1.4)),
    face: { lx: 41, rx: 59, y: 45, r: 4.4, blush: true,
      mouths: { normal: beak(), open: beak(true), sad: beak(false, true), sleep: beak(), wow: beak(true) } },
    back: '',
    armL: P('M 25 55 C 17 61 14 71 18 76 C 22 72 25 66 27 60 Z', 'var(--c1)', 2.6),
    armR: P('M 75 55 C 83 61 86 71 82 76 C 78 72 75 66 73 60 Z', 'var(--c1)', 2.6),
    fx: tw(12, 26, 2.4, '#fff', 0.2) + tw(88, 34, 2, '#fff', 1.2) + tw(14, 62, 1.8, '#dff3ff', 1.8),
    vars: '--fx:var(--c3);--wave-a:-110deg;--wave-b:-60deg;--cheer-r:-110deg'
  };

  /* ── 22 Glitch · Pixelwesen ────────────────────────────── */
  const pixBody = 'M 30 26 H 70 V 30 H 74 V 74 H 70 V 78 H 30 V 74 H 26 V 30 H 30 Z';
  DEFS[22] = {
    pal: [['#84cc16', '#3f6212', '#1c3a0b', '#d9f99d'],
          ['#ec4899', '#831843', '#0b3a47', '#67e8f9'],
          ['#ef4444', '#7f1d1d', '#2a0a0a', '#fecaca']],
    o: { al: [26, 48], ar: [74, 48], ll: [39, 78], lr: [61, 78], head: [50, 78] },
    behind: P(pixBody, '#ff2bd6', 0, 'class="gl-a" opacity="0"') + P(pixBody, '#00e5ff', 0, 'class="gl-b" opacity="0"'),
    legL: R(34, 77, 10, 13, 0, 'var(--c2)', 2.6, 'stroke-linejoin="miter"'),
    legR: R(56, 77, 10, 13, 0, 'var(--c2)', 2.6, 'stroke-linejoin="miter"'),
    head: R(31, 17, 8, 9, 0, 'var(--c1)', 2.6, 'stroke-linejoin="miter" class="ear-l"') + R(61, 17, 8, 9, 0, 'var(--c1)', 2.6, 'stroke-linejoin="miter" class="ear-r"')
      + R(33, 13, 4, 4, 0, 'var(--c4)', 0, 'class="led"') + R(63, 13, 4, 4, 0, 'var(--c4)', 0, 'class="led" style="animation-delay:.6s"')
      + P(pixBody, 'var(--c1)', 3, 'stroke-linejoin="miter"')
      + R(66, 30, 4, 44, 0, 'var(--c2)', 0, 'opacity=".45"') + R(30, 70, 40, 4, 0, 'var(--c2)', 0, 'opacity=".45"')
      + R(30, 30, 4, 8, 0, '#fff', 0, 'opacity=".45"') + R(34, 30, 4, 4, 0, '#fff', 0, 'opacity=".45"')
      + R(33, 35, 34, 26, 0, 'var(--c3)', 2.6, 'stroke-linejoin="miter" class="fo"')
      + R(33, 35, 34, 2, 0, 'var(--c4)', 0, 'opacity=".25" class="scan fo"')
      + '{FACE}',
    face: { type: 'screen', col: 'var(--c4)', lx: 42, rx: 58, y: 45, r: 3.6, my: 54, mw: 4.5, blush: false },
    back: R(38, 40, 24, 16, 0, 'var(--c2)', 2, 'stroke-linejoin="miter"') + R(42, 44, 4, 4, 0, 'var(--c4)', 0, 'class="led"'),
    armL: R(18, 46, 8, 8, 0, 'var(--c1)', 2.6, 'stroke-linejoin="miter"') + R(14, 54, 8, 8, 0, 'var(--c1)', 2.6, 'stroke-linejoin="miter"'),
    armR: R(74, 46, 8, 8, 0, 'var(--c1)', 2.6, 'stroke-linejoin="miter"') + R(78, 54, 8, 8, 0, 'var(--c1)', 2.6, 'stroke-linejoin="miter"'),
    fx: R(84, 22, 3, 3, 0, 'var(--c4)', 0, 'class="tw" stroke="' + INK + '" stroke-width=".6"') + R(13, 34, 3, 3, 0, 'var(--c1)', 0, 'class="tw" style="animation-delay:1s" stroke="' + INK + '" stroke-width=".6"'),
    vars: '--fx:var(--c4)'
  };

  /* ── 23 Cacti · Kaktus im Topf ─────────────────────────── */
  const petal = (a) => E(50, 15.5, 2.6, 4, 'var(--c2)', 1.6, 'transform="rotate(' + a + ' 50 20)"');
  DEFS[23] = {
    pal: [['#2f9e57', '#f43f5e', '#e8743b', '#d6fbe2'],
          ['#2aa6c8', '#facc15', '#9333ea', '#d9fbff'],
          ['#d9a514', '#ec4899', '#c2410c', '#fff3c4']],
    o: { al: [36, 50], ar: [64, 50], ll: [40, 88], lr: [60, 88], head: [50, 64], zz: [70, 22] },
    vars: '--fx:var(--c2);--wave-a:-28deg;--wave-b:14deg;--cheer-r:-18deg',
    body: E(50, 62, 22, 3.6, '#6b4428', 2.2),
    head: G('sway', [50, 24], [0, 72, 144, 216, 288].map(petal).join('') + C(50, 20, 2.6, '#ffd23f', 1.6))
      + P('M 36 64 L 36 36 C 36 22 64 22 64 36 L 64 64 Z', 'var(--c1)', 3.2)
      + shade('M 57 25 C 62 28 64 31 64 36 L 64 64 L 58 64 L 58 34 C 58 30 58 28 57 25 Z', 0.13)
      + L('M 43 30 L 43 63 M 57 30 L 57 63', INK, 1.2, 'opacity=".25"')
      + L('M 39.5 36 l 2 -1.5 M 39.5 52 l 2 -1.5 M 60.5 44 l -2 -1.5 M 60.5 58 l -2 -1.5 M 50 30 l 0 -2', 'var(--c4)', 1.4)
      + shine('M 39 50 L 39 37 C 39 33 40 30 42 28', 2.4, 0.5)
      + '{FACE}',
    face: { lx: 44, rx: 56, y: 43, r: 4.2, my: 52, mw: 3.4 },
    back: L('M 46 34 l 2 -1.5 M 52 44 l 2 -1.5 M 46 54 l 2 -1.5', 'var(--c4)', 1.4),
    armL: P('M 37 52 L 29 52 C 25 52 22 49.5 22 45.5 L 22 37 C 22 33 28 33 28 37 L 28 45 L 37 45 Z', 'var(--c1)', 2.8) + L('M 24 37 l -1.5 -1 M 25 44 l -2 0', 'var(--c4)', 1.2),
    armR: P('M 63 52 L 71 52 C 75 52 78 49.5 78 45.5 L 78 37 C 78 33 72 33 72 37 L 72 45 L 63 45 Z', 'var(--c1)', 2.8) + L('M 76 37 l 1.5 -1 M 75 44 l 2 0', 'var(--c4)', 1.2),
    front: P('M 27 64 L 73 64 L 68.5 88 C 68 90 66.5 91 64 91 L 36 91 C 33.5 91 32 90 31.5 88 Z', 'var(--c3)', 3)
      + shade('M 64 66 L 73 64 L 68.5 88 C 68 90 66.5 91 64 91 L 61 91 C 64 88 65 84 66 78 Z', 0.15)
      + R(24, 59, 52, 8.5, 3, 'var(--c3)', 3)
      + L('M 38 76 L 42 76 M 48 80 L 52 80 M 58 76 L 62 76', '#fff', 2, 'opacity=".55"')
      + shine('M 33 72 L 35 86', 2.2, 0.5) + shine('M 28 62 L 40 62', 1.8, 0.5)
  };

  /* ── 24 Nacho · Nacho-Fledermaus ───────────────────────── */
  const batWing = 'M 30 50 C 23 40 14 36 5 40 C 8 44 9 48 8 52 C 12 51 15 53 16 57 C 19 55 23 56 25 60 C 27 58 29 56 31 56 Z';
  DEFS[24] = {
    pal: [['#f6b73c', '#ffe7a3', '#2fa34a', '#ff9a1f'],
          ['#e8473b', '#ffc2b8', '#d4a017', '#ffe58a'],
          ['#4a4fc4', '#c2c6ff', '#e0442f', '#ffe066']],
    o: { al: [30, 52], ar: [70, 52], ll: [44, 80], lr: [56, 80], head: [50, 84] },
    vars: '--fx:var(--c4);--wave-a:-55deg;--wave-b:10deg;--cheer-r:-45deg',
    legL: L('M 44 80 L 43 88', INK, 2.2) + L('M 40.5 90 L 43 88 L 45.5 90', INK, 1.8),
    legR: L('M 56 80 L 57 88', INK, 2.2) + L('M 54.5 90 L 57 88 L 59.5 90', INK, 1.8),
    head: P('M 29 30 L 25 15 L 39 26 Z', 'var(--c1)', 2.6) + P('M 71 30 L 75 15 L 61 26 Z', 'var(--c1)', 2.6)
      + G('sway', [50, 26], P('M 44.5 26 C 44 18 53 13 60 16 C 56 17 52 21 50 26.5 Z', 'var(--c3)', 2.2) + L('M 59.5 16 C 61 14 61 12 63 11', INK, 1.8))
      + P('M 28 28 L 72 28 C 79 28 82 34 78 40 L 55 80 C 52.5 85 47.5 85 45 80 L 22 40 C 18 34 21 28 28 28 Z', 'var(--c1)', 3.2)
      + shade('M 70 30 C 78 31 81 35 78 40 L 55 80 C 53 83 51 84 49 84 L 70 44 C 74 37 74 33 70 30 Z', 0.12)
      + C(34, 52, 1, 'var(--c4)', 0, 'opacity=".7"') + C(62, 58, 1.1, 'var(--c4)', 0, 'opacity=".7"') + C(50, 72, 1, 'var(--c4)', 0, 'opacity=".7"') + C(44, 64, 0.9, 'var(--c4)', 0, 'opacity=".7"')
      + P('M 25 31 C 30 26 70 26 75 31 C 76 36 71 38 69 36 C 67 42 62 42 61 37 C 58 40 54 40 53 36 C 50 44 45 44 45 37 C 42 39 38 39 37 35 C 34 38 30 38 30 34 C 27 35 24 34 25 31 Z', 'var(--c4)', 2.2)
      + shine('M 32 30 L 44 29.5', 2, 0.6)
      + '{FACE}',
    face: { lx: 41, rx: 59, y: 49, r: 4.6, my: 58, mw: 4,
      extra: P('M 45.6 58.4 L 47 61.6 L 48.4 58.7 Z', '#fff', 1) + P('M 54.4 58.4 L 53 61.6 L 51.6 58.7 Z', '#fff', 1) },
    back: C(50, 50, 1.2, 'var(--c4)', 0) + C(42, 46, 1, 'var(--c4)', 0),
    armL: G('wing', null, P(batWing, 'var(--c2)', 2.6) + L('M 29 52 L 10 44 M 27 55 L 13 53 M 26 58 L 18 57', INK, 1.1, 'opacity=".45"')),
    armR: G('wing', null, P(mirror(batWing), 'var(--c2)', 2.6) + L(mirror('M 29 52 L 10 44 M 27 55 L 13 53 M 26 58 L 18 57'), INK, 1.1, 'opacity=".45"'))
  };

  /* ── 25 Pips · Zauberwürfel ────────────────────────────── */
  DEFS[25] = {
    pal: [['#ffffff', '#1f2235', '#2a2f45', '#ffd23f'],
          ['#e8304a', '#ffffff', '#1f2235', '#ffd23f'],
          ['#6a35a8', '#38e1ff', '#151827', '#ff4fd8']],
    o: { al: [27, 58], ar: [69, 58], ll: [39, 80], lr: [57, 80], head: [48, 80] },
    vars: '--fx:var(--c4)',
    behind: E(48, 56, 30, 30, 'var(--c4)', 0, 'class="pulse"'),
    legL: tube('M 39 80 L 39 86', 'var(--c3)', 3) + E(38, 88.5, 5.6, 3, 'var(--c3)', 2.2),
    legR: tube('M 57 80 L 57 86', 'var(--c3)', 3) + E(58, 88.5, 5.6, 3, 'var(--c3)', 2.2),
    head: P('M 27 42 L 36 33 L 76 33 L 67 42 Z', 'var(--c1)', 0) + P('M 27 42 L 36 33 L 76 33 L 67 42 Z', '#fff', 0, 'opacity=".35"')
      + P('M 67 42 L 76 33 L 76 71 L 67 80 Z', 'var(--c1)', 0) + shade('M 67 42 L 76 33 L 76 71 L 67 80 Z', 0.2)
      + R(27, 42, 40, 38, 6, 'var(--c1)', 0)
      + P('M 33 42 L 36 33 L 76 33 L 76 71 L 67 80 L 33 80 C 29.7 80 27 77.3 27 74 L 27 48 C 27 44.7 29.7 42 33 42 Z', 'none', 3.2)
      + L('M 67 42 L 76 33 M 67 42 L 67 80 M 33 42 L 67 42', INK, 2)
      + E(52, 37.5, 3, 1.4, 'var(--c2)', 0)
      + E(70.5, 47, 1.3, 2.2, 'var(--c2)', 0, 'transform="skewY(-45) translate(0 70.5)"') + E(72.5, 62, 1.3, 2.2, 'var(--c2)', 0, 'transform="skewY(-45) translate(0 72.5)"')
      + G('fo', null, C(33.5, 48.5, 2.4, 'var(--c2)', 0) + C(60.5, 48.5, 2.4, 'var(--c2)', 0) + C(33.5, 73.5, 2.4, 'var(--c2)', 0) + C(60.5, 73.5, 2.4, 'var(--c2)', 0))
      + shine('M 30 62 L 30 50', 2.2, 0.55)
      + '{FACE}'
      + G('hat', null, E(52, 35, 15, 3.6, 'var(--c3)', 2.4) + R(43, 14, 18, 21, 2, 'var(--c3)', 2.6) + R(43, 28, 18, 4.5, 0, 'var(--c4)', 0) + L('M 43 28 L 61 28 M 43 32.5 L 61 32.5', INK, 1.2) + shine('M 46 18 L 46 26', 1.8, 0.4)),
    face: { lx: 41, rx: 54, y: 58, r: 4.2, mx: 47.5, my: 67, mw: 3.5 },
    back: C(47, 61, 2.4, 'var(--c2)', 0) + C(40, 54, 2.4, 'var(--c2)', 0) + C(54, 68, 2.4, 'var(--c2)', 0),
    armL: tube('M 27 58 Q 19 62 18 68', 'var(--c3)', 2.8) + C(17.5, 69.5, 3.6, '#fff', 2),
    armR: tube('M 69 58 Q 77 62 79 66', 'var(--c3)', 2.8)
      + L('M 79 68 L 88 50', INK, 3) + L('M 86 54 L 88 50', '#fff', 2)
      + star(89, 46, 5, 'var(--c4)', 'stroke="' + INK + '" stroke-width="1.4" class="glow-soft"')
      + C(80, 67.5, 3.6, '#fff', 2),
    fx: tw(92, 34, 2.8, 'var(--c4)', 0) + tw(80, 38, 2, '#fff', 0.6) + tw(94, 56, 2.2, 'var(--c4)', 1.2) + tw(12, 30, 3, 'var(--c4)', 0.9) + tw(16, 82, 2.2, '#fff', 1.7)
      + G('orbit', [48, 56], R(46, 4, 5, 7, 1, '#fff', 1.2) + P('M 48.5 6 C 47.5 5 46.5 6.5 48.5 8.5 C 50.5 6.5 49.5 5 48.5 6 Z', '#e8304a', 0)
        + R(86, 84, 5, 7, 1, '#fff', 1.2, 'transform="rotate(30 88 87)"'))
  };

  /* ── 26 Waddl · Ente in Gummistiefeln ──────────────────── */
  const bill = k => {
    if (k === 'open') return P('M 40 55 C 40 51 60 51 60 55 C 60 57 55 58 50 58 C 45 58 40 57 40 55 Z', 'var(--c4)', 2) + P('M 42 59.5 C 45 58.5 55 58.5 58 59.5 C 57 63 53 64 50 64 C 47 64 43 63 42 59.5 Z', 'var(--c4)', 2) + E(50, 59, 6, 1.4, '#9b1c31', 0);
    if (k === 'wow') return P('M 41 54 C 41 50 59 50 59 54 C 59 56 55 57 50 57 C 45 57 41 56 41 54 Z', 'var(--c4)', 2) + P('M 44 60 C 46 58.5 54 58.5 56 60 C 55 63.5 52 65 50 65 C 48 65 45 63.5 44 60 Z', 'var(--c4)', 2) + E(50, 58.5, 4.5, 2, '#9b1c31', 0);
    const d = k === 'sad' ? 'M 40 57 C 40 52 60 52 60 57 C 60 61 55 61.5 50 60.5 C 45 61.5 40 61 40 57 Z' : 'M 40 56 C 40 52 60 52 60 56 C 60 60 54 61 50 61 C 46 61 40 60 40 56 Z';
    return P(d, 'var(--c4)', 2.2) + C(46.5, 55, 0.8, INK, 0) + C(53.5, 55, 0.8, INK, 0) + L('M 42 57.5 C 46 58.5 54 58.5 58 57.5', INK, 1, 'opacity=".45"');
  };
  const boot = 'M 37 80 L 37 88 C 37 90 38 91 40 91 L 47.5 91 C 49.5 91 49.5 88 46.5 87.6 L 45 87.4 L 45 80 Z';
  DEFS[26] = {
    pal: [['#ffd43b', '#ef4444', '#f5c400', '#ff8c1a'],
          ['#1f8a5c', '#eab308', '#0f5132', '#facc15'],
          ['#c4a1ff', '#22c1dc', '#9f6bff', '#fb923c']],
    o: { al: [23, 58], ar: [77, 58], ll: [41, 82], lr: [59, 82], head: [50, 86], zz: [74, 28] },
    vars: '--fx:var(--c2);--wave-a:-110deg;--wave-b:-60deg;--cheer-r:-110deg',
    legL: P(boot, 'var(--c2)', 2.4) + L('M 39 83 L 39 86', '#fff', 1.6, 'opacity=".5"'),
    legR: P(mirror(boot), 'var(--c2)', 2.4) + L('M 61 83 L 61 86', '#fff', 1.6, 'opacity=".5"'),
    head: P('M 50 27 C 70 27 79 43 79 61 C 79 78 68 86 50 86 C 32 86 21 78 21 61 C 21 43 30 27 50 27 Z', 'var(--c1)', 3.2)
      + shade('M 73 46 C 79 58 77 76 63 84 C 72 74 75 60 73 46 Z')
      + E(50, 74, 15, 9, '#fff', 0, 'opacity=".3" class="fo"')
      + shine('M 27 54 C 27 49 29 45 32 42', 2.4, 0.6)
      + '{FACE}'
      + G('hat', null, P('M 32 35 C 32 20 68 20 68 35 Z', 'var(--c3)', 2.6) + P('M 17 35 C 25 29 75 29 83 35 C 81 39 75 39 71 37 L 29 37 C 25 39 19 39 17 35 Z', 'var(--c3)', 2.4)
        + L('M 37 26 C 41 22 47 21 52 21', '#fff', 1.8, 'opacity=".45"')),
    face: { lx: 41, rx: 59, y: 47, r: 4.6,
      mouths: { normal: bill(), open: bill('open'), sad: bill('sad'), sleep: bill(), wow: bill('wow') } },
    back: L('M 44 44 C 47 40 53 40 56 44', INK, 1.2, 'opacity=".3"'),
    armL: P('M 23 57 C 15 61 13 71 17 75 C 21 71 24 67 25 62 Z', 'var(--c1)', 2.6),
    armR: P('M 77 57 C 85 61 87 71 83 75 C 79 71 76 67 75 62 Z', 'var(--c1)', 2.6),
    fx: P('M 83 37 C 82 40 82 42 83.5 42.5 C 85 42 85 40 84 37 Z', '#7cc8ff', 0.8, 'class="drip"')
  };

  /* ── 27 Yoyo · Wollknäuel-Katze ────────────────────────── */
  DEFS[27] = {
    pal: [['#2dd4bf', '#facc15', '#f43f5e', '#0f9488'],
          ['#c084fc', '#38bdf8', '#facc15', '#9333ea'],
          ['#fb7185', '#ffffff', '#38bdf8', '#e11d48']],
    o: { al: [27, 64], ar: [73, 64], ll: [41, 84], lr: [59, 84], head: [50, 84] },
    behind: G('tail', [68, 80], tube('M 68 81 C 78 87 86 83 87 75 C 88 67 80 65 80 71', 'var(--c1)', 2.4)),
    legL: E(41, 88.5, 6, 3.6, 'var(--c1)', 2.4),
    legR: E(59, 88.5, 6, 3.6, 'var(--c1)', 2.4),
    head: G('ear-l', [32, 34], P('M 26 42 L 24 20 L 42 30 Z', 'var(--c1)', 2.8) + P('M 28 37 L 27 25 L 37 31 Z', 'var(--c4)', 0, 'opacity=".6"'))
      + G('ear-r', [68, 34], P('M 74 42 L 76 20 L 58 30 Z', 'var(--c1)', 2.8) + P('M 72 37 L 73 25 L 63 31 Z', 'var(--c4)', 0, 'opacity=".6"'))
      + C(50, 58, 28, 'var(--c1)', 3.2)
      + L('M 25 46 C 40 54 60 54 75 46 M 22.5 60 C 40 68 62 68 77.5 60 M 29 77 C 43 71 57 71 71 77 M 37 32 C 47 46 51 68 45 85 M 63 32 C 54 44 54 66 58 85', 'var(--c4)', 1.4, 'opacity=".55"')
      + shade('M 70 40 C 80 52 79 70 66 82 C 75 70 76 54 70 40 Z', 0.1)
      + shine('M 30 44 C 32 38 36 34 41 32', 2.6, 0.6)
      + '{FACE}',
    face: { type: 'button', bcols: ['var(--c2)', 'var(--c3)'], lx: 39, rx: 61, y: 53, r: 6.4, my: 66, mw: 3.6, mouth: 'cat', blush: false,
      extra: P('M 48 61.5 L 52 61.5 L 50 63.8 Z', '#ff6f91', 1.1) + E(32, 63, 3.6, 2.1, '#ff6f9f', 0, 'opacity=".5"') + E(68, 63, 3.6, 2.1, '#ff6f9f', 0, 'opacity=".5"') },
    back: L('M 34 50 C 44 56 56 56 66 50', 'var(--c4)', 1.6, 'opacity=".6"'),
    armL: tube('M 27 64 Q 20 68 20 74', 'var(--c1)', 4.5),
    armR: tube('M 73 64 Q 80 68 80 74', 'var(--c1)', 4.5),
    vars: '--fx:var(--c2)'
  };

  /* ── 28 Turbo · Rennschnecke ───────────────────────────── */
  DEFS[28] = {
    pal: [['#a3e635', '#e11d2a', '#ffffff', '#cbd5e1'],
          ['#facc15', '#5fb7e8', '#ff8a1f', '#ff8a1f'],
          ['#5fd4ff', '#2f3648', '#facc15', '#fbbf24']],
    o: { head: [74, 88], dz: [62, 40], zz: [80, 18], cl: [74, 9] },
    shadow: 36,
    vars: '--fx:var(--c3)',
    head: G('antenna', [74, 50], L('M 70 50 L 66 32 M 79 49 L 85 32', INK, 2.4))
      + P('M 15 91 C 9 91 9 84 16 82.5 L 58 80 C 62 70 61 54 69 48 C 77 42 88 48 88 59 C 88 73 83 91 70 91 Z', 'var(--c1)', 3)
      + shade('M 84 56 C 88 66 85 86 72 90 C 80 82 84 70 84 56 Z', 0.12)
      + shine('M 70 54 C 71 51 73 49 76 48.5', 2.2, 0.6)
      + '{FACE}',
    face: { type: 'ring', lx: 66, rx: 85, y: 31, r: 4.4, mx: 77, my: 66, mw: 3.4, blush: false,
      extra: E(70, 62, 3, 1.8, '#ff6f9f', 0, 'opacity=".55"') + E(84, 62, 3, 1.8, '#ff6f9f', 0, 'opacity=".55"') },
    back: C(66, 31, 4.4, 'var(--c1)', 2.2) + C(85, 31, 4.4, 'var(--c1)', 2.2),
    front: tube('M 22 66 L 10 64', 'var(--c4)', 3.6) + tube('M 22 72 L 11 72', 'var(--c4)', 3.6)
      + C(38, 58, 22, 'var(--c2)', 3.2)
      + P('M 21 50 C 30 46 46 46 56 51 L 58 57 C 46 52 30 52 19.5 56 Z', 'var(--c3)', 0, 'opacity=".9"')
      + L('M 38 58 m -2.5 0 a 2.5 2.5 0 1 1 5 0 a 6 6 0 1 1 -12 0 a 10 10 0 1 1 20 0', INK, 1.4, 'opacity=".3"')
      + C(37, 66, 6.5, 'var(--c3)', 2.2) + '<text x="37" y="69.4" text-anchor="middle" font-size="9.5" font-weight="800" font-family="system-ui, sans-serif" fill="' + INK + '">1</text>'
      + C(38, 58, 22, 'none', 3.2)
      + shine('M 22 50 C 24 44 29 40 35 38', 2.8, 0.6),
    fx: C(6, 63, 2.4, '#cbd5e1', 1, 'class="steam"') + C(6, 71, 2, '#cbd5e1', 1, 'class="steam" style="animation-delay:-1.1s"')
      + G('speed', null, L('M 2 46 L 10 46 M 4 54 L 13 54 M 3 82 L 12 82', INK, 1.6, 'opacity=".35"'))
  };

  /* ── 29 Lumi · Anglerfisch mit Leuchtköder ─────────────── */
  DEFS[29] = {
    pal: [['#1d9ccc', '#4ff0ff', '#c9f1ff', '#0e6f94'],
          ['#e08a12', '#ffe14d', '#fff1c2', '#b45309'],
          ['#e0457b', '#fff06a', '#ffe0ec', '#b8235a']],
    o: { al: [25, 58], ar: [75, 58], ll: [43, 82], lr: [57, 82], head: [50, 84] },
    vars: '--fx:var(--c2)',
    behind: P('M 36 34 L 40 22 L 46 30 L 52 20 L 57 30 L 64 24 L 65 36 Z', 'var(--c4)', 2.2),
    legL: P('M 43 81 C 38 85 36 89 38 91 C 42 91 45 87 46 83 Z', 'var(--c4)', 2),
    legR: P('M 57 81 C 62 85 64 89 62 91 C 58 91 55 87 54 83 Z', 'var(--c4)', 2),
    head: C(50, 56, 27, 'var(--c1)', 3.2)
      + E(50, 67, 17, 12, 'var(--c3)', 0, 'class="fo"')
      + shade('M 70 39 C 80 50 78 68 66 78 C 74 66 75 52 70 39 Z')
      + shine('M 29 48 C 31 40 37 34 44 32', 2.8, 0.6)
      + C(33, 66, 1.2, '#fff', 0, 'opacity=".6"') + C(68, 70, 1, '#fff', 0, 'opacity=".6"')
      + '{FACE}'
      + G('lure', [50, 30], tube('M 50 30 C 50 18 56 12 62 14', 'var(--c4)', 2)
        + C(64, 14, 9, 'var(--c2)', 0, 'class="pulse"') + C(64, 14, 4.6, 'var(--c2)', 2.2, 'class="glow"') + hl(62.6, 12.6, 1.4, 0.95)),
    face: { lx: 39, rx: 61, y: 52, r: 6, my: 64, mw: 6.5, glint: 'var(--c2)',
      extra: P('M 45 64.5 L 46.3 67.5 L 47.6 65 Z', '#fff', 0.9) + P('M 55 64.5 L 53.7 67.5 L 52.4 65 Z', '#fff', 0.9) },
    back: L('M 38 44 Q 50 40 62 44', 'var(--c4)', 2, 'opacity=".6"'),
    armL: P('M 25 56 C 16 50 10 56 12 63 C 16 64 22 63 25 61 Z', 'var(--c4)', 2.4) + L('M 15 57 L 22 59', INK, 1, 'opacity=".4"'),
    armR: P('M 75 56 C 84 50 90 56 88 63 C 84 64 78 63 75 61 Z', 'var(--c4)', 2.4) + L('M 85 57 L 78 59', INK, 1, 'opacity=".4"'),
    fx: C(84, 34, 1.8, 'var(--c2)', 0.8, 'class="bubble"') + C(16, 40, 1.4, 'var(--c2)', 0.8, 'class="bubble" style="animation-delay:-1.3s"')
      + tw(82, 22, 2.6, 'var(--c2)', 0.3) + tw(20, 26, 2.4, '#fff', 1.1) + tw(88, 50, 2, 'var(--c2)', 1.8) + tw(12, 72, 2.2, '#fff', 0.7)
  };

  /* ── 30 Umbra · Kapuzengeist mit Kerze und Laterne ─────── */
  DEFS[30] = {
    pal: [['#2e2547', '#b36bff', '#efe1ff', '#4ade80'],
          ['#3d2328', '#ff4d4d', '#ffc2c2', '#ff9a3c'],
          ['#4b5d78', '#4ff0ff', '#f8fafc', '#7dd3fc']],
    o: { al: [27, 52], ar: [73, 52], ll: [40, 84], lr: [60, 84], head: [50, 84] },
    vars: '--fx:var(--c2);--ink:#140f1f',
    shadow: 18,
    behind: E(50, 54, 32, 36, 'var(--c2)', 0, 'class="pulse"'),
    head: R(47, 8.5, 6, 7.5, 1.5, 'var(--c3)', 1.8) + P('M 48 9 C 48 12 47 13 47.5 14', 'none', 0) + L('M 52 9.5 L 52 12.5', 'var(--c3)', 1.6)
      + G('flick', null, P('M 50 1.5 C 46.5 5 47 8 50 8.6 C 53 8 53.5 5 50 1.5 Z', 'var(--c2)', 1.4) + E(50, 6.8, 1, 1.4, '#fff8c2', 0))
      + P('M 52 15 C 47 20 31 23 26 40 C 23 50 22 58 22 66 L 20 83 C 25 87 29 81 33 85 C 37 89 41 83 45 87 C 49 91 52 84 56 87 C 60 90 63 83 67 86 C 71 89 75 83 80 83 L 78 64 C 78 44 72 28 61 22 C 57 20 54 18 52 15 Z', 'var(--c1)', 3.2)
      + L('M 30 70 C 32 76 34 80 33 85 M 66 70 C 66 76 67 80 67 86', '#fff', 1.4, 'opacity=".12"')
      + shine('M 28 46 C 29 38 33 31 39 27', 2.4, 0.3)
      + E(50, 49, 19, 17, 'none', 0, 'stroke="var(--c2)" stroke-width="2" opacity=".45" class="fo"')
      + E(50, 49, 17, 15, '#0b0814', 2.4, 'class="fo"')
      + '{FACE}',
    face: { type: 'glow', col: 'var(--c2)', lx: 43, rx: 57, y: 47, r: 3.8, my: 55, mw: 3, blush: false },
    back: L('M 50 24 L 50 80', '#000', 2, 'opacity=".2"'),
    armL: P('M 27 50 C 19 56 14 64 16 71 C 20 69 24 69 27 64 Z', 'var(--c1)', 2.6) + C(16.5, 71.5, 2.6, 'var(--c3)', 1.8),
    armR: P('M 73 50 C 81 56 86 62 84 67 C 80 67 76 67 73 63 Z', 'var(--c1)', 2.6)
      + L('M 84 66 L 84 60', INK, 1.6)
      + R(78.5, 60, 11, 15, 3, '#2b2b3a', 2.2) + C(84, 67.5, 4.2, 'var(--c4)', 0, 'class="glow"') + L('M 78.5 63 L 89.5 63 M 78.5 72 L 89.5 72', INK, 1.4),
    fx: C(14, 36, 1.8, 'var(--c4)', 0, 'class="bubble"') + C(86, 40, 1.5, 'var(--c4)', 0, 'class="bubble" style="animation-delay:-1.4s"')
      + tw(18, 20, 2.6, 'var(--c2)', 0.4) + tw(84, 24, 2.2, 'var(--c2)', 1.6)
  };

  /* ── 31 Grimjaw · Schatzkisten-Mimic ───────────────────── */
  const teeth = (y, dir, n, x0, x1) => {
    let d = '', w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) d += 'M ' + (x0 + i * w) + ' ' + y + ' L ' + (x0 + i * w + w / 2) + ' ' + (y + dir * 4.2) + ' L ' + (x0 + (i + 1) * w) + ' ' + y + ' ';
    return P(d, 'var(--c3)', 1.6);
  };
  const tongue = 'M 44 53 C 44 62 47 68 51 68 C 55 68 57 62 56 53 Z';
  DEFS[31] = {
    pal: [['#86471a', '#e8b04a', '#fff4c2', '#c084fc'],
          ['#33405e', '#cbd5e1', '#e2e8f0', '#22e3ff'],
          ['#8c1d3a', '#facc15', '#fefce8', '#f43f5e']],
    o: { al: [23, 64], ar: [77, 64], ll: [32, 84], lr: [68, 84], head: [50, 84] },
    vars: '--fx:var(--c2)',
    legL: R(27, 82, 9, 8, 2, 'var(--c2)', 2.2),
    legR: R(64, 82, 9, 8, 2, 'var(--c2)', 2.2),
    head: R(24, 44, 52, 13, 3, '#1a0f22', 2.4)
      + R(22, 53, 56, 32, 5, 'var(--c1)', 3.2)
      + shade('M 70 54 L 73 54 C 75.8 54 78 56.2 78 59 L 78 80 C 78 82.8 75.8 85 73 85 L 66 85 C 70 82 71 78 71 74 Z', 0.15)
      + R(29, 53, 5, 32, 0, 'var(--c2)', 2) + R(66, 53, 5, 32, 0, 'var(--c2)', 2)
      + L('M 36 63 L 64 63 M 36 74 L 64 74', INK, 1.1, 'opacity=".25"')
      + R(44, 62, 12, 13, 2.5, 'var(--c2)', 2.2, 'class="fo"') + C(50, 67, 2, INK, 0, 'class="fo"') + P('M 49 68 L 51 68 L 51.6 72 L 48.4 72 Z', INK, 0, 'class="fo"')
      + G('lid', null, P('M 21 49 C 21 27 79 27 79 49 L 79 51 L 21 51 Z', 'var(--c1)', 3.2)
        + P('M 29 50.5 C 29 33 34 31 34 31.5 L 34 50.5 Z', 'var(--c2)', 0) + P('M 66 31.5 C 66 31 71 33 71 50.5 L 66 50.5 Z', 'var(--c2)', 0)
        + L('M 21 49 C 21 27 79 27 79 49', INK, 3.2)
        + L('M 21.5 46 L 78.5 46', 'var(--c2)', 2.4)
        + teeth(51, 1, 7, 25, 75)
        + shine('M 26 42 C 27 36 31 32 37 30', 2.4, 0.4)),
    face: { type: 'ring', lx: 41, rx: 59, y: 39, r: 4.4, blush: false,
      mouths: { normal: teeth(57, -1, 7, 25, 75), open: P(tongue, 'var(--c4)', 2) + L('M 50 56 L 50 64', INK, 1, 'opacity=".4"') + teeth(57, -1, 7, 25, 75),
        sad: teeth(57, -1, 7, 25, 75) + P('M 46 53 C 46 57 48 59 50 59 C 52 59 54 57 54 53 Z', 'var(--c4)', 1.6),
        sleep: teeth(57, -1, 7, 25, 75) + P('M 52 54 C 52 58 54 60 56 60 C 58 60 59 58 58.5 54 Z', 'var(--c4)', 1.6),
        wow: P(tongue, 'var(--c4)', 2) + teeth(57, -1, 7, 25, 75) } },
    back: R(40, 62, 20, 14, 2, 'var(--c2)', 2),
    armL: tube('M 23 64 Q 15 66 14 72', 'var(--c2)', 3) + C(13.5, 73.5, 3.2, 'var(--c2)', 2),
    armR: tube('M 77 64 Q 85 66 86 72', 'var(--c2)', 3) + C(86.5, 73.5, 3.2, 'var(--c2)', 2),
    fx: tw(16, 50, 2.6, 'var(--c2)', 0.2) + tw(86, 46, 2.2, 'var(--c2)', 1.3) + tw(50, 22, 2, '#fff', 0.8)
      + C(13, 88, 3, 'var(--c2)', 1.6) + C(86, 89, 2.6, 'var(--c2)', 1.4)
  };

  /* ── 32 Astris · Kosmos-Katze mit Ring ─────────────────── */
  const ringBack = '<path d="M 18 74 A 32 7.5 0 0 1 82 74" fill="none" stroke="' + INK + '" stroke-width="6" stroke-linecap="round" transform="rotate(-10 50 74)"/>'
    + '<path d="M 18 74 A 32 7.5 0 0 1 82 74" fill="none" stroke="var(--c2)" stroke-width="3" stroke-linecap="round" transform="rotate(-10 50 74)"/>';
  const ringFront = ringBack.replace(/0 0 1 82 74/g, '0 0 0 82 74');
  DEFS[32] = {
    pal: [['#2f3a6e', '#00e5ff', '#ffd23f', '#ffffff'],
          ['#7234ad', '#ff6b98', '#2dd4bf', '#fde047'],
          ['#33333f', '#fbbf24', '#ff7a1a', '#ffe0b8']],
    o: { al: [38, 70], ar: [62, 70], ll: [41, 86], lr: [59, 86], head: [50, 68] },
    vars: '--fx:var(--c3)',
    behind: G('ring', [50, 74], ringBack)
      + G('tail', [62, 82], tube('M 62 82 C 77 84 87 75 84 63', 'var(--c1)', 5) + P('M 82 49 C 76 51 75 59 80 63 C 79 57 81 53 87 51 C 86 50 84.5 49 82 49 Z', 'var(--c3)', 1.8)),
    legL: E(41, 88.5, 6.2, 3.9, 'var(--c1)', 2.4) + C(39, 88, 0.9, 'var(--c4)', 0) + C(43, 88, 0.9, 'var(--c4)', 0),
    legR: E(59, 88.5, 6.2, 3.9, 'var(--c1)', 2.4) + C(57, 88, 0.9, 'var(--c4)', 0) + C(61, 88, 0.9, 'var(--c4)', 0),
    body: E(50, 76, 16.5, 12.5, 'var(--c1)', 3)
      + G('fo', null, E(50, 78, 9.5, 7.5, '#0d1030', 0, 'opacity=".55"') + L('M 50 78 m -1.5 0 a 1.5 1.5 0 1 1 3 0 a 4 4 0 1 1 -8 0 a 6.5 6.5 0 1 1 13 0', 'var(--c3)', 1.2) + C(46, 75, 0.7, '#fff', 0) + C(55, 81, 0.6, '#fff', 0)),
    head: G('ear-l', [30, 36], P('M 23 41 C 20 31 20 22 22.5 14.5 C 23.5 12 26 12 27.5 13.5 C 33 19 38 25 41 31 Z', 'var(--c1)', 3) + P('M 25.5 35 C 24.5 29 24.5 23.5 25.5 18.5 C 29.5 22 32.5 26 34.5 29.5 Z', 'var(--c2)', 0, 'opacity=".75"'))
      + G('ear-r', [70, 36], P(mirror('M 23 41 C 20 31 20 22 22.5 14.5 C 23.5 12 26 12 27.5 13.5 C 33 19 38 25 41 31 Z'), 'var(--c1)', 3) + P(mirror('M 25.5 35 C 24.5 29 24.5 23.5 25.5 18.5 C 29.5 22 32.5 26 34.5 29.5 Z'), 'var(--c2)', 0, 'opacity=".75"'))
      + E(50, 48, 28, 23.5, 'var(--c1)', 3.2)
      + shine('M 27 42 C 28 35 33 30 39 28', 2.6, 0.45)
      + C(32, 58, 0.9, '#fff', 0, 'opacity=".8"') + C(68, 36, 0.8, '#fff', 0, 'opacity=".8"') + C(63, 62, 0.9, '#fff', 0, 'opacity=".8"') + C(38, 32, 0.7, '#fff', 0, 'opacity=".8"')
      + star(50, 31, 3.4, 'var(--c3)', 'stroke="' + INK + '" stroke-width=".8" class="glow-soft"')
      + '{FACE}',
    front: G('ring', [50, 74], ringFront),
    face: { lx: 38, rx: 62, y: 47, r: 6.4, my: 58.5, mw: 4, mouth: 'cat', glint: 'var(--c3)',
      extra: P('M 47.8 54.6 L 52.2 54.6 L 50 57.2 Z', 'var(--c2)', 1.2) },
    back: C(40, 42, 1, '#fff', 0) + C(58, 50, 1.2, '#fff', 0) + C(47, 58, 0.9, '#fff', 0) + C(62, 38, 0.8, '#fff', 0),
    armL: tube('M 38 70 Q 33 75 34 81', 'var(--c1)', 5) + C(34, 81.5, 3.2, 'var(--c1)', 2),
    armR: tube('M 62 70 Q 67 75 66 81', 'var(--c1)', 5) + C(66, 81.5, 3.2, 'var(--c1)', 2),
    fx: tw(12, 22, 3.6, 'var(--c3)', 0) + tw(88, 18, 3, '#fff', 0.7) + tw(10, 62, 2.6, 'var(--c2)', 1.3) + tw(90, 58, 2.4, 'var(--c3)', 1.9) + tw(30, 8, 2, '#fff', 1) + tw(72, 6, 2.2, 'var(--c2)', 0.4)
      + G('orbit', [50, 52], C(50, 6, 2.4, 'var(--c3)', 1.2) + C(14, 74, 1.6, 'var(--c2)', 1))
  };

  /* ── 33 Arcana · Lebendes Zauberbuch ───────────────────── */
  const rune = (x, y, k) => k === 0
    ? L('M ' + x + ' ' + (y - 3.5) + ' L ' + (x + 3) + ' ' + (y + 2.5) + ' L ' + (x - 3) + ' ' + (y + 2.5) + ' Z M ' + x + ' ' + (y + 0.6) + ' l 0 0', 'var(--c3)', 1.6)
    : k === 1 ? C(x, y, 3, 'none', 0, 'stroke="var(--c3)" stroke-width="1.6"') + L('M ' + x + ' ' + (y - 4.5) + ' L ' + x + ' ' + (y + 4.5), 'var(--c3)', 1.6)
    : L('M ' + (x - 3) + ' ' + (y - 3) + ' L ' + (x + 3) + ' ' + (y + 3) + ' M ' + (x + 3) + ' ' + (y - 3) + ' L ' + (x - 3) + ' ' + (y + 3) + ' M ' + (x - 3.5) + ' ' + y + ' L ' + (x + 3.5) + ' ' + y, 'var(--c3)', 1.4);
  DEFS[33] = {
    pal: [['#5b2bb5', '#f5b53f', '#22d3ee', '#fff3d6'],
          ['#0f7055', '#d4a017', '#34d399', '#ecfdf5'],
          ['#2a4185', '#e2e8f0', '#ff4fd8', '#f8fafc']],
    o: { al: [25, 58], ar: [73, 58], ll: [41, 84], lr: [57, 84], head: [50, 84] },
    vars: '--fx:var(--c3)',
    behind: E(50, 54, 34, 36, 'var(--c3)', 0, 'class="pulse"')
      + G('tail', [44, 84], P('M 42 82 L 47 82 L 47 92 L 44.5 89.5 L 42 92 Z', '#ef4444', 1.6)),
    legL: tube('M 41 84 L 40 88', INK, 1.4) + E(39, 89.5, 4.4, 2.4, 'var(--c2)', 1.8),
    legR: tube('M 57 84 L 58 88', INK, 1.4) + E(59, 89.5, 4.4, 2.4, 'var(--c2)', 1.8),
    head: P('M 70 24 L 77 28 L 77 85 L 70 82 Z', 'var(--c4)', 2.6) + L('M 72.5 30 L 72.5 81 M 75 31 L 75 82.5', INK, 0.9, 'opacity=".3"')
      + R(23, 22, 50, 62, 5, 'var(--c1)', 3.2)
      + R(23, 22, 7, 62, 3, '#000', 0, 'opacity=".22"') + L('M 30 22.5 L 30 83.5', INK, 1.6, 'opacity=".5"')
      + shade('M 64 23 L 68 23 C 70.8 23 73 25.2 73 28 L 73 79 C 73 81.8 70.8 84 68 84 L 62 84 C 66 81 67 78 67 72 L 67 30 C 67 27 66 25 64 23 Z', 0.15)
      + P('M 63 22 L 73 22 L 73 32 Z', 'var(--c2)', 2) + P('M 63 84 L 73 84 L 73 74 Z', 'var(--c2)', 2)
      + P('M 31 22 L 41 22 L 31 32 Z', 'var(--c2)', 2) + P('M 31 84 L 41 84 L 31 74 Z', 'var(--c2)', 2)
      + C(51, 50, 15, 'none', 0, 'stroke="var(--c2)" stroke-width="2.6" class="fo"')
      + L('M 51 32 L 51 35 M 51 65 L 51 68 M 33 50 L 36 50 M 66 50 L 69 50', 'var(--c2)', 2, 'class="fo"')
      + shine('M 34 30 L 34 44', 2.2, 0.35)
      + '{FACE}',
    face: { type: 'cyc', cx: 51, y: 50, r: 10, iris: 'var(--c3)', lid: 'var(--c1)', my: 73, mx: 51, mw: 4.5, bcol: 'var(--c3)' },
    back: R(36, 38, 30, 26, 3, 'none', 0, 'stroke="var(--c2)" stroke-width="2"') + rune(51, 51, 2),
    armL: tube('M 25 58 Q 17 62 16 68', 'var(--c4)', 3) + C(15.5, 69.5, 3, 'var(--c4)', 2),
    armR: tube('M 73 58 Q 81 62 82 68', 'var(--c4)', 3) + C(82.5, 69.5, 3, 'var(--c4)', 2),
    fx: G('orbit', [50, 52], rune(50, 8, 0) + rune(92, 60, 1) + rune(12, 66, 2) + rune(80, 18, 1))
      + tw(14, 26, 3, 'var(--c3)', 0.2) + tw(88, 40, 2.6, 'var(--c2)', 1) + tw(18, 84, 2.2, '#fff', 1.6)
  };

  /* ── 34 Zephyr · Nachteule mit Mondsichel ──────────────── */
  const tuft = 'M 30 30 L 22 14 L 34 22 L 33 16 L 41 27 Z';
  const owlWing = 'M 24 50 C 15 56 13 70 19 79 C 21 75 23 74 25 75 C 24 71 25 69 27 69 C 26 64 27 58 28 54 Z';
  DEFS[34] = {
    pal: [['#2f4275', '#ffd23f', '#e2e8f0', '#7dd3fc'],
          ['#0f9fb8', '#34d399', '#f8fafc', '#ffe14d'],
          ['#7234ad', '#fbbf24', '#ffd0dc', '#fde047']],
    o: { al: [26, 52], ar: [74, 52], ll: [41, 86], lr: [59, 86], head: [50, 70], zz: [74, 32] },
    vars: '--fx:var(--c2);--wave-a:-100deg;--wave-b:-50deg;--cheer-r:-110deg',
    legL: L('M 38 86 L 37 90 M 41 86 L 41 91 M 44 86 L 45 90', 'var(--c2)', 2.4) + L('M 38 86 L 37 90 M 41 86 L 41 91 M 44 86 L 45 90', INK, 0.8, 'opacity=".5"'),
    legR: L('M 56 86 L 55 90 M 59 86 L 59 91 M 62 86 L 63 90', 'var(--c2)', 2.4) + L('M 56 86 L 55 90 M 59 86 L 59 91 M 62 86 L 63 90', INK, 0.8, 'opacity=".5"'),
    head: G('ear-l', [32, 28], P(tuft, 'var(--c1)', 2.4)) + G('ear-r', [68, 28], P(mirror(tuft), 'var(--c1)', 2.4))
      + G('glow-soft moon', null, P('M 54 6 C 46 7 43 16 48 22 C 44 21 41 17 42 12 C 43 7 48 4 54 6 Z', 'var(--c2)', 1.8))
      + P('M 50 24 C 71 24 79 42 79 60 C 79 79 68 87 50 87 C 32 87 21 79 21 60 C 21 42 29 24 50 24 Z', 'var(--c1)', 3.2)
      + G('fo', null, P('M 36 62 C 40 60 44 64 48 62 C 52 60 56 64 60 62 C 64 60 66 64 66 64 C 66 76 60 82 50 82 C 40 82 34 76 34 64 C 34 64 34 62 36 62 Z', 'var(--c3)', 0, 'opacity=".9"')
        + L('M 38 68 q 3 3 6 0 q 3 3 6 0 q 3 3 6 0 q 3 3 6 0 M 41 75 q 3 3 6 0 q 3 3 6 0 q 3 3 6 0', INK, 1, 'opacity=".3"'))
      + P('M 50 36 C 44 30 28 32 28 46 C 28 56 38 60 50 56 C 62 60 72 56 72 46 C 72 32 56 30 50 36 Z', 'var(--c3)', 2.4, 'class="fo"')
      + shine('M 26 52 C 26 44 29 38 33 34', 2.4, 0.45)
      + C(39.5, 46, 8.2, 'var(--c2)', 2.2, 'class="fo"') + C(60.5, 46, 8.2, 'var(--c2)', 2.2, 'class="fo"')
      + '{FACE}',
    face: { type: 'ring', lx: 39.5, rx: 60.5, y: 46, r: 6, blush: false,
      mouths: { normal: P('M 47 51 L 53 51 L 50 56 Z', 'var(--c2)', 1.6), open: P('M 47 50.5 L 53 50.5 L 50 53.5 Z', 'var(--c2)', 1.4) + P('M 47.5 55 L 52.5 55 L 50 58.5 Z', 'var(--c2)', 1.4),
        sad: P('M 47 52 L 53 52 L 50 57.5 Z', 'var(--c2)', 1.6), sleep: P('M 47 51 L 53 51 L 50 56 Z', 'var(--c2)', 1.6), wow: P('M 47 50.5 L 53 50.5 L 50 53.5 Z', 'var(--c2)', 1.4) + E(50, 56, 2, 1.6, '#9b1c31', 0) } },
    back: L('M 36 44 q 4 4 8 0 q 4 4 8 0 q 4 4 8 0 M 34 56 q 4 4 8 0 q 4 4 8 0 q 4 4 8 0 q 4 4 8 0', INK, 1.2, 'opacity=".3"'),
    armL: P(owlWing, 'var(--c1)', 2.6) + L('M 19 72 L 23 66 M 17 64 L 23 60', INK, 1, 'opacity=".35"'),
    armR: P(mirror(owlWing), 'var(--c1)', 2.6) + L(mirror('M 19 72 L 23 66 M 17 64 L 23 60'), INK, 1, 'opacity=".35"'),
    fx: tw(64, 10, 2.6, 'var(--c4)', 0) + tw(36, 8, 2, 'var(--c4)', 0.9) + tw(86, 30, 2.4, 'var(--c2)', 1.5) + tw(12, 40, 2.2, 'var(--c4)', 0.5)
  };

  /* ── 35 Spindle · Spinnchen am Faden ───────────────────── */
  const sleg = d => tube(d, 'var(--c1)', 2.6);
  DEFS[35] = {
    pal: [['#2f2640', '#ef4444', '#a78bfa', '#d4d4e0'],
          ['#3c4a60', '#22c55e', '#c084fc', '#4ade80'],
          ['#f4f5fa', '#b91c1c', '#38bdf8', '#94a3b8']],
    o: { al: [32, 54], ar: [68, 54], ll: [35, 66], lr: [65, 66], head: [50, 80] },
    vars: '--fx:var(--c2)',
    behind: L('M 50 1 L 50 36', 'var(--c4)', 1.2, 'class="thread"'),
    legL: sleg('M 35 64 C 26 64 22 74 17 90') + sleg('M 37 70 C 31 72 29 82 27 91'),
    legR: sleg('M 65 64 C 74 64 78 74 83 90') + sleg('M 63 70 C 69 72 71 82 73 91'),
    head: C(50, 57, 23, 'var(--c1)', 3.2)
      + shade('M 66 40 C 76 50 75 68 62 77 C 70 67 71 52 66 40 Z', 0.15)
      + shine('M 33 50 C 34 43 38 38 44 36', 2.4, 0.45)
      + G('fo', null, C(42, 42.5, 1.8, 'var(--c3)', 1) + C(58, 42.5, 1.8, 'var(--c3)', 1) + C(46.5, 39.5, 1.4, 'var(--c3)', 1) + C(53.5, 39.5, 1.4, 'var(--c3)', 1))
      + '{FACE}',
    face: { type: 'ring', lx: 42, rx: 58, y: 52, r: 5.4, my: 63, mw: 4, col: 'var(--c4)',
      extra: P('M 46.5 66.5 L 47.8 70 L 49.1 66.8 Z', '#fff', 1) + P('M 53.5 66.5 L 52.2 70 L 50.9 66.8 Z', '#fff', 1) },
    back: P('M 44 46 L 56 46 L 51.5 52 L 56 58 L 44 58 L 48.5 52 Z', 'var(--c2)', 1.8),
    armL: sleg('M 32 54 C 22 50 16 56 12 68') + sleg('M 33 48 C 22 40 13 42 8 52'),
    armR: sleg('M 68 54 C 78 50 84 56 88 68') + sleg('M 67 48 C 78 40 87 42 92 52'),
    fx: tw(16, 22, 2.4, 'var(--c4)', 0.3) + tw(82, 18, 2, 'var(--c3)', 1.2)
  };

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
    kit: { INK, P, E, C, R, L, G, tube, shine, hl, shade, star, tw, mirror, face }
  };
})();
