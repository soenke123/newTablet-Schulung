/* ══════════════════════════════════════════════════════════════
   Savanne — Die Tiere (tiere.js)
   ══════════════════════════════════════════════════════════════

   Löwen, Elefanten, Zebras, Gnus und Krokodile, jeweils Papa,
   Mama und Kind. Fassung 4 (Oktober 2026).

   Gebaut GENAU WIE DIE WESEN aus Knowledge Stack: dieselben
   Zeichenwerkzeuge, dasselbe Skelett, dasselbe Gesicht und dieselben
   Bewegungen. Diese Datei liefert nur die Beschreibungen (wie
   DEFS in tools/KnowledgeStack/creatures.js); gebaut wird mit
   KSCreatures.buildDef, bewegt wird über creatures.css + tiere.css.

     svg.creature-svg
       cr-shadow · cr-root ( cr-behind (Schwanz) · leg-l/-r (Hinterfüße)
                             · body-base ( Rumpf · head-node ( Kopf · face · backside ) )
                             · arm-l/-r (Vorderbeine) · cr-front (Futter) · cr-fx )
                 · cr-ov (Zzz …)

   Zeichenregeln (wie bei den Wesen):
     * Kasten 0…100, Boden y = 92, alles von vorn gezeichnet.
     * Große, zusammenhängende Flächen; kleine Beine; kleine Details.
     * Eine Linienfarbe (--ink), Glanz oben links, Schatten unten rechts.
   Gehen nach links/rechts/vorn/hinten machen die Wesen-Bewegungen
   (state-walk dir-…): Gesicht rückt zur Seite, von hinten ist die
   Rückseite (back) zu sehen.

   Dazu (tiere.css): Laufen (sv-run), Fressen (state-eat), Elefanten-
   ohren und Rüssel, Skelett einblenden (sv-show-skel: in jeder
   Gelenkgruppe liegt ein Knochen, der mit ihr mitgeht).

   Schnittstelle (window.SavanneTiere):
     svg(art, rolle, zustand, richtung, extraKlassen) → SVG-Text
     classes(art, zustand, richtung, extra) → Klassen zum Umschalten
     cls(zustand, richtung)  → nur die Zustandsklassen
     SPECIES, ORDER, ROLES
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const KS = window.KSCreatures;
  if (!KS || !KS.kit) { console.error('Savanne: creatures.js fehlt'); return; }
  const { INK, P, E, C, R, L, G, tube, shine, hl, shade, tw, mirror } = KS.kit;

  /* Wuschel (Mähne, Quaste): Kreis aus Bögen */
  function fluff(cx, cy, r, n, rot) {
    const br = (r * Math.sin(Math.PI / n) * 1.3).toFixed(1);
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = (rot || 0) + i * Math.PI * 2 / n;
      const x = (cx + r * Math.cos(a)).toFixed(1), y = (cy + r * Math.sin(a)).toFixed(1);
      d += (i ? ' A ' + br + ' ' + br + ' 0 0 1 ' : 'M ') + x + ' ' + y;
    }
    return d + ' Z';
  }
  /* Wimpern für Mama: zwei Striche am äußeren Augenrand */
  const lashes = (lx, rx, y, r) => L('M ' + (lx - r * 0.7) + ' ' + (y - r * 0.55) + ' l -2.4 -1.9 M ' + (lx - r * 0.95) + ' ' + (y + r * 0.1) + ' l -2.8 -0.4'
    + ' M ' + (rx + r * 0.7) + ' ' + (y - r * 0.55) + ' l 2.4 -1.9 M ' + (rx + r * 0.95) + ' ' + (y + r * 0.1) + ' l 2.8 -0.4', INK, 1.6);
  /* Herzchen beim Fressen */
  const heart = (x, y, s, delay) => P('M ' + x + ' ' + (y + s * 0.45) + ' C ' + (x - s * 1.15) + ' ' + (y - s * 0.3) + ' ' + (x - s * 0.45) + ' ' + (y - s * 1.1) + ' ' + x + ' ' + (y - s * 0.45)
    + ' C ' + (x + s * 0.45) + ' ' + (y - s * 1.1) + ' ' + (x + s * 1.15) + ' ' + (y - s * 0.3) + ' ' + x + ' ' + (y + s * 0.45) + ' Z', '#ff6f91', 1.2, 'class="sv-heart" style="animation-delay:' + (delay || 0) + 's"');
  const hearts = (x, y) => heart(x, y, 3.2, 0) + heart(x + 9, y + 4, 2.4, 0.9);
  /* Knochen fürs Skelett: liegt in der Gelenkgruppe und geht mit */
  const bone = (d, pts) => '<g class="sv-skel">' + L(d, '#e11d48', 1.8) + (pts || []).map(p => C(p[0], p[1], 1.7, '#fff', 0, 'stroke="#e11d48" stroke-width="1.1"')).join('') + '</g>';

  /* Futter (cr-front, nur beim Fressen zu sehen) */
  const grass = (x, y) => '<g class="sv-food">'
    + L('M ' + (x - 6) + ' ' + y + ' Q ' + (x - 7) + ' ' + (y - 6) + ' ' + (x - 9) + ' ' + (y - 9), '#4f9a34', 2.6)
    + L('M ' + x + ' ' + y + ' Q ' + (x + 0.5) + ' ' + (y - 7) + ' ' + (x - 0.5) + ' ' + (y - 11), '#6cbf42', 2.6)
    + L('M ' + (x + 6) + ' ' + y + ' Q ' + (x + 7) + ' ' + (y - 6) + ' ' + (x + 9) + ' ' + (y - 8.5), '#4f9a34', 2.6)
    + '</g>';
  const meat = (x, y) => '<g class="sv-food">'
    + tube('M ' + (x - 9) + ' ' + y + ' L ' + (x - 2) + ' ' + y, '#fff6e6', 2.6)
    + C(x - 10.5, y - 1.6, 2, '#fff6e6', 1.4) + C(x - 10.5, y + 1.6, 2, '#fff6e6', 1.4)
    + E(x + 3, y - 0.5, 7, 5, '#e0644f', 2.4) + hl(x, y - 3, 1.5, 0.6) + '</g>';
  const fish = (x, y) => '<g class="sv-food">'
    + P('M ' + (x + 6) + ' ' + y + ' L ' + (x + 11) + ' ' + (y - 3.5) + ' L ' + (x + 11) + ' ' + (y + 3.5) + ' Z', '#6aa8d8', 1.6)
    + E(x, y, 7, 4, '#8fd0f0', 2) + C(x - 3.5, y - 1, 0.9, INK, 0) + hl(x + 1, y - 2, 1, 0.7) + '</g>';

  /* ══════════════════════════════════════════════════════════════
     Löwe
     ══════════════════════════════════════════════════════════════ */
  const pawFoot = (x, col, y) => E(x, y || 88.8, 6.4, 3.6, col, 2.4) + L('M ' + (x - 2) + ' ' + ((y || 88.8) - 1.2) + ' L ' + (x - 2) + ' ' + ((y || 88.8) + 1.4) + ' M ' + (x + 2) + ' ' + ((y || 88.8) - 1.2) + ' L ' + (x + 2) + ' ' + ((y || 88.8) + 1.4), INK, 1, 'opacity=".45"');
  function lion(role) {
    const papa = role === 'papa', kind = role === 'kind';
    const hy = kind ? 49 : 46;                       // Kopfmitte
    const hr = kind ? [23.5, 21] : [22, 19.5];        // Kopf: Breite, Höhe
    const ey = hy - 1, er = kind ? 5.8 : 5.2;
    const body = kind
      ? P('M 34 80 C 34 72 41 68 50 68 C 59 68 66 72 66 80 C 66 87 59 90 50 90 C 41 90 34 87 34 80 Z', 'var(--c1)', 3)
      : P('M 31 78 C 31 68 39 63 50 63 C 61 63 69 68 69 78 C 69 86 61 90 50 90 C 39 90 31 86 31 78 Z', 'var(--c1)', 3);
    const spots = kind ? G('fo', null, E(40, 77, 2.4, 1.7, 'var(--c3)', 0) + E(59, 75.5, 2.2, 1.6, 'var(--c3)', 0) + E(56, 83, 1.9, 1.4, 'var(--c3)', 0) + E(43, 84, 1.8, 1.3, 'var(--c3)', 0)) : '';
    const mane = papa ? P(fluff(50, 44, 30, 13, 0.12), 'var(--c2)', 3) + P(fluff(50, 45, 24.5, 12, 0.38), 'var(--c3)', 2.4) : '';
    const ear = (x, y, r) => C(x, y, r, 'var(--c1)', 2.8) + C(x, y + 0.5, r * 0.52, 'var(--c5)', 0, 'opacity=".75"');
    const earY = kind ? 31 : (papa ? 25 : 29), earX = kind ? 31 : (papa ? 32 : 31), earR = kind ? 7.4 : (papa ? 6.4 : 7);
    return {
      pal: [papa ? ['#f7b84b', '#c4652a', '#e98d3a', '#ffe9c4', '#ff7f9c', '#b55a24']
        : kind ? ['#fccb6e', '#d9934a', '#ebaa5c', '#fff3dc', '#ff94ad', '#d58a42']
          : ['#f8bf57', '#c97a35', '#eba14e', '#fff0d4', '#ff86a2', '#c06a2c']],
      o: { al: [41, 74], ar: [59, 74], ll: [32, 86], lr: [68, 86], head: [50, 70], zz: [78, 22] },
      behind: G('tail', [64, 82], tube('M 63 83 C 76 86 85 79 84 67', 'var(--c1)', 3.4) + P(fluff(84, 63, 5, 7), 'var(--c6)', 2.2)
        + bone('M 63 83 C 76 86 85 79 84 67', [[63, 83], [84, 67]])),
      legL: pawFoot(32, 'var(--c1)') + bone('M 32 80 L 32 88', [[32, 88]]),
      legR: pawFoot(68, 'var(--c1)') + bone('M 68 80 L 68 88', [[68, 88]]),
      body: body
        + E(50, kind ? 81 : 79.5, kind ? 9 : 10.5, kind ? 6 : 7.5, 'var(--c4)', 0, 'class="fo"')
        + spots
        + shade(kind ? 'M 62 72 C 67 77 66 85 59 88.5 C 63 84 64.5 78 62 72 Z' : 'M 64 69 C 70 75 69 85 60 88.5 C 65 83 67 76 64 69 Z')
        + shine(kind ? 'M 38 75 C 39 72 41.5 70 44.5 69.5' : 'M 35.5 72 C 36.5 68.5 39.5 66 43 65', 2.4, 0.5)
        + bone('M 50 66 L 50 84', [[50, 66], [50, 84]]),
      head: mane
        + G('ear-l', [earX, earY + 3], ear(earX, earY, earR))
        + G('ear-r', [100 - earX, earY + 3], ear(100 - earX, earY, earR))
        + E(50, hy, hr[0], hr[1], 'var(--c1)', 3.2)
        + (kind ? P('M 45.5 29.8 Q 46.5 22.5 51.5 23.2 Q 49.5 26 52.5 28 Q 55.5 24.5 58.5 26.3 Q 56 28 56.2 30.6 Z', 'var(--c6)', 2) : '')
        + shade('M ' + (50 + hr[0] - 6) + ' ' + (hy - 10) + ' C ' + (50 + hr[0] + 1) + ' ' + (hy - 1) + ' ' + (50 + hr[0] - 2) + ' ' + (hy + 12) + ' 59 ' + (hy + hr[1] - 2) + ' C ' + (50 + hr[0] - 6) + ' ' + (hy + 10) + ' ' + (50 + hr[0] - 3) + ' ' + (hy + 1) + ' ' + (50 + hr[0] - 6) + ' ' + (hy - 10) + ' Z')
        + shine('M ' + (50 - hr[0] + 4) + ' ' + (hy - 3) + ' C ' + (50 - hr[0] + 5) + ' ' + (hy - 9) + ' ' + (50 - hr[0] + 9) + ' ' + (hy - 14) + ' ' + (50 - hr[0] + 14) + ' ' + (hy - 16), 2.6, 0.6)
        + G('fo', null, P('M 40 ' + (hy + 10) + ' C 40 ' + (hy + 5) + ' 45 ' + (hy + 4) + ' 50 ' + (hy + 5.5) + ' C 55 ' + (hy + 4) + ' 60 ' + (hy + 5) + ' 60 ' + (hy + 10) + ' C 60 ' + (hy + 15) + ' 55 ' + (hy + 17) + ' 50 ' + (hy + 16) + ' C 45 ' + (hy + 17) + ' 40 ' + (hy + 15) + ' 40 ' + (hy + 10) + ' Z', 'var(--c4)', 2.2))
        + '{FACE}'
        + bone('M 50 70 L 50 ' + hy, [[50, hy]]),
      face: { lx: 40, rx: 60, y: ey, r: er, my: hy + 13.4, mw: 3.4, mouth: 'cat',
        extra: P('M 46.8 ' + (hy + 6.6) + ' Q 50 ' + (hy + 4.8) + ' 53.2 ' + (hy + 6.6) + ' Q 52.6 ' + (hy + 9.6) + ' 50 ' + (hy + 10.4) + ' Q 47.4 ' + (hy + 9.6) + ' 46.8 ' + (hy + 6.6) + ' Z', 'var(--c5)', 1.6)
          + hl(48.6, hy + 6.8, 0.8, 0.9) + L('M 50 ' + (hy + 10.4) + ' L 50 ' + (hy + 12.4), INK, 1.4)
          + C(43.6, hy + 11.6, 0.6, INK, 0) + C(44.4, hy + 9.6, 0.6, INK, 0) + C(56.4, hy + 11.6, 0.6, INK, 0) + C(55.6, hy + 9.6, 0.6, INK, 0)
          + (role === 'mama' ? lashes(40, 60, ey, er) : '') },
      back: papa ? P(fluff(50, 46, 15, 9, 0.2), 'var(--c2)', 0, 'opacity=".35"') : L('M 40 40 Q 50 35 60 40', 'var(--c6)', 2.4, 'opacity=".45"'),
      armL: tube('M 41 74 Q 40 80 41 84.5', 'var(--c1)', 7.4) + pawFoot(41, 'var(--c1)', 87) + bone('M 41 74 L 41 86', [[41, 74], [41, 86]]),
      armR: tube('M 59 74 Q 60 80 59 84.5', 'var(--c1)', 7.4) + pawFoot(59, 'var(--c1)', 87) + bone('M 59 74 L 59 86', [[59, 74], [59, 86]]),
      front: meat(50, 91) + hearts(70, 30),
      fx: tw(81, 18, 2.6, 'var(--c3)', 0.4) + tw(19, 24, 2, '#fff', 1.4),
      vars: '--fx:var(--c3)'
    };
  }

  /* ══════════════════════════════════════════════════════════════
     Elefant
     ══════════════════════════════════════════════════════════════ */
  const nails = (x, y, s) => C(x - 3.3 * s, y, 1.15 * s, 'var(--c6)', 0.9) + C(x, y + 0.5, 1.25 * s, 'var(--c6)', 0.9) + C(x + 3.3 * s, y, 1.15 * s, 'var(--c6)', 0.9);
  function elephant(role) {
    const papa = role === 'papa', kind = role === 'kind';
    const hy = kind ? 45 : 43, hrx = kind ? 22.5 : 21, hry = kind ? 20.5 : 19.5;
    const tusk = papa ? 1 : role === 'mama' ? 0.55 : 0;
    const tuskD = 'M 42.6 ' + (hy + 13) + ' C ' + (40.5 - 2 * tusk) + ' ' + (hy + 17 + 3 * tusk) + ' ' + (41 - tusk) + ' ' + (hy + 21 + 4 * tusk) + ' ' + (45 - tusk) + ' ' + (hy + 23 + 4 * tusk) + ' C 44 ' + (hy + 19 + 2 * tusk) + ' 44.6 ' + (hy + 16) + ' 46 ' + (hy + 13.6) + ' Z';
    const earD = 'M 32 ' + (hy - 13) + ' C 17 ' + (hy - 21) + ' 3 ' + (hy - 11) + ' 5 ' + (hy + 4) + ' C 7 ' + (hy + 18) + ' 20 ' + (hy + 23) + ' 31 ' + (hy + 15) + ' Z';
    const earIn = 'M 29.5 ' + (hy - 9) + ' C 19 ' + (hy - 14) + ' 10 ' + (hy - 7) + ' 11 ' + (hy + 3) + ' C 12 ' + (hy + 12) + ' 21 ' + (hy + 16) + ' 28.5 ' + (hy + 11) + ' Z';
    const trunkD = 'M 50 ' + (hy + 11) + ' C 50 ' + (hy + 21) + ' 48 ' + (hy + 29) + ' 51 ' + (hy + 35) + ' C 53 ' + (hy + 39) + ' 58 ' + (hy + 38) + ' 58 ' + (hy + 34);
    return {
      pal: [papa ? ['#a7b4cb', '#8f9cb5', '#f6b3c6', '#fff6e3', '#5c6478', '#fff2d9']
        : kind ? ['#b9c4d8', '#a2aec4', '#f9bfd0', '#fff6e3', '#6b7389', '#fff2d9']
          : ['#b0bcd1', '#97a3bb', '#f7b8ca', '#fff6e3', '#626a80', '#fff2d9']],
      o: { al: [40, 75], ar: [60, 75], ll: [30, 86], lr: [70, 86], head: [50, 72], zz: [82, 20] },
      behind: G('tail', [67, 80], tube('M 67 80 C 75 82 79 78 80 72', 'var(--c1)', 2.6) + E(80.4, 70, 2.4, 3.4, 'var(--c5)', 1.6)
        + bone('M 67 80 C 75 82 79 78 80 72', [[67, 80], [80, 72]])),
      legL: E(30, 88, 8, 4.4, 'var(--c1)', 2.6) + nails(30, 90.4, 1) + bone('M 30 80 L 30 88', [[30, 88]]),
      legR: E(70, 88, 8, 4.4, 'var(--c1)', 2.6) + nails(70, 90.4, 1) + bone('M 70 80 L 70 88', [[70, 88]]),
      body: E(50, 75, kind ? 21 : 24, kind ? 15 : 16.5, 'var(--c1)', 3)
        + shade('M 67 63 C 75 69 75 82 65 89 C 70 82 71 72 67 63 Z')
        + shine('M 31 70 C 32 66 35 63 39 61.5', 2.4, 0.5)
        + bone('M 50 64 L 50 84', [[50, 64], [50, 84]]),
      head: G('ear-l sv-ear', [30, hy], P(earD, 'var(--c1)', 3) + P(earIn, 'var(--c3)', 0) + shine('M 10 ' + (hy - 2) + ' C 11 ' + (hy - 8) + ' 15 ' + (hy - 12) + ' 20 ' + (hy - 13), 2.2, 0.45))
        + G('ear-r sv-ear', [70, hy], P(mirror(earD), 'var(--c1)', 3) + P(mirror(earIn), 'var(--c3)', 0))
        + E(50, hy, hrx, hry, 'var(--c1)', 3.2)
        + L('M 47 ' + (hy - hry + 0.5) + ' Q 46 ' + (hy - hry - 4) + ' 48.5 ' + (hy - hry - 5) + ' M 50.5 ' + (hy - hry) + ' Q 51 ' + (hy - hry - 5) + ' 54 ' + (hy - hry - 4.4) + (kind ? ' M 53.5 ' + (hy - hry + 0.6) + ' Q 56 ' + (hy - hry - 3) + ' 58.5 ' + (hy - hry - 2) : ''), INK, 1.6)
        + shade('M ' + (50 + hrx - 6) + ' ' + (hy - 9) + ' C ' + (50 + hrx) + ' ' + (hy - 1) + ' ' + (50 + hrx - 2) + ' ' + (hy + 11) + ' 59 ' + (hy + hry - 3) + ' C ' + (50 + hrx - 5) + ' ' + (hy + 9) + ' ' + (50 + hrx - 3) + ' ' + (hy + 1) + ' ' + (50 + hrx - 6) + ' ' + (hy - 9) + ' Z')
        + shine('M 33 ' + (hy - 3) + ' C 34 ' + (hy - 9) + ' 38 ' + (hy - 14) + ' 43 ' + (hy - 16), 2.6, 0.6)
        + (tusk ? G('fo', null, P(tuskD, 'var(--c4)', 2) + P(mirror(tuskD), 'var(--c4)', 2)) : '')
        + G('trunk fo', [50, hy + 11], tube(trunkD, 'var(--c1)', 9.5)
          + L('M 45.6 ' + (hy + 19) + ' L 54.4 ' + (hy + 19) + ' M 45.4 ' + (hy + 24) + ' L 53.6 ' + (hy + 24) + ' M 46.4 ' + (hy + 29) + ' L 54 ' + (hy + 28.4), INK, 1.1, 'opacity=".3"')
          + E(58, hy + 33.4, 2.4, 1.5, INK, 0, 'opacity=".45"')
          + G('sv-food', null, C(58.5, hy + 31, 3.4, '#6cbf42', 1.6) + L('M 57 ' + (hy + 28.5) + ' l -1 -3 M 60 ' + (hy + 28.5) + ' l 1 -3', '#4f9a34', 1.6))
          + bone(trunkD, [[50, hy + 11], [51, hy + 35]]))
        + '{FACE}'
        + bone('M 50 72 L 50 ' + hy, [[50, hy]]),
      face: { lx: 41, rx: 59, y: hy - 1, r: kind ? 5.2 : 4.6,
        extra: L('M 43 ' + (hy + 10.5) + ' Q 45 ' + (hy + 12.5) + ' 46.6 ' + (hy + 11.4) + ' M 57 ' + (hy + 10.5) + ' Q 55 ' + (hy + 12.5) + ' 53.4 ' + (hy + 11.4), INK, 1.5)
          + (role === 'mama' ? lashes(41, 59, hy - 1, 4.6) : '') },
      back: L('M 40 ' + (hy - 6) + ' Q 50 ' + (hy - 11) + ' 60 ' + (hy - 6), 'var(--c2)', 2.4, 'opacity=".5"'),
      armL: tube('M 40 75 L 40 83', 'var(--c1)', 10) + E(40, 86.4, 7, 4, 'var(--c1)', 2.6) + nails(40, 88.8, 0.9) + bone('M 40 75 L 40 86', [[40, 75], [40, 86]]),
      armR: tube('M 60 75 L 60 83', 'var(--c1)', 10) + E(60, 86.4, 7, 4, 'var(--c1)', 2.6) + nails(60, 88.8, 0.9) + bone('M 60 75 L 60 86', [[60, 75], [60, 86]]),
      front: grass(76, 92) + hearts(74, 22),
      fx: tw(84, 16, 2.6, 'var(--c3)', 0.6) + tw(16, 18, 2, '#fff', 1.6),
      vars: '--fx:var(--c3)'
    };
  }

  /* ══════════════════════════════════════════════════════════════
     Zebra und Gnu (gleicher Bau: langer Kopf, dünne Beine, Hufe)
     ══════════════════════════════════════════════════════════════ */
  const hoof = x => R(x - 4.6, 84.6, 9.2, 6.6, 2.4, 'var(--c5)', 2.4) + L('M ' + (x - 2.6) + ' 86.4 L ' + (x + 2.6) + ' 86.4', '#fff', 1.2, 'opacity=".35"');
  const hoofSmall = x => R(x - 4.2, 85.5, 8.4, 6, 2.2, 'var(--c5)', 2.4);
  // Pferdekopf: oben breit, unten die Schnauze
  const horseHead = (hy, w) => 'M 50 ' + (hy - 22) + ' C ' + (50 + w) + ' ' + (hy - 22) + ' ' + (50 + w + 6) + ' ' + (hy - 13) + ' ' + (50 + w + 6) + ' ' + (hy - 2)
    + ' C ' + (50 + w + 6) + ' ' + (hy + 6) + ' ' + (50 + w + 3) + ' ' + (hy + 12) + ' ' + (50 + w + 1) + ' ' + (hy + 17)
    + ' C ' + (50 + w - 2) + ' ' + (hy + 24) + ' 56 ' + (hy + 27) + ' 50 ' + (hy + 27)
    + ' C 44 ' + (hy + 27) + ' ' + (50 - w + 2) + ' ' + (hy + 24) + ' ' + (50 - w - 1) + ' ' + (hy + 17)
    + ' C ' + (50 - w - 3) + ' ' + (hy + 12) + ' ' + (50 - w - 6) + ' ' + (hy + 6) + ' ' + (50 - w - 6) + ' ' + (hy - 2)
    + ' C ' + (50 - w - 6) + ' ' + (hy - 13) + ' ' + (50 - w) + ' ' + (hy - 22) + ' 50 ' + (hy - 22) + ' Z';
  const stripeD = x => 'M ' + x + ' 65.5 Q ' + (x - 2.6) + ' 75 ' + (x + 0.5) + ' 85 L ' + (x + 2.6) + ' 84 Q ' + x + ' 75 ' + (x + 2.6) + ' 66 Z';

  function zebra(role) {
    const kind = role === 'kind';
    const hy = kind ? 42 : 40;
    const earD = 'M 38.5 ' + (hy - 15) + ' C 31 ' + (hy - 23) + ' 30 ' + (hy - 33) + ' 34 ' + (hy - 36) + ' C 39 ' + (hy - 34) + ' 43 ' + (hy - 26) + ' 43.5 ' + (hy - 17) + ' Z';
    const earIn = 'M 38.8 ' + (hy - 19) + ' C 34.8 ' + (hy - 24) + ' 34.2 ' + (hy - 30) + ' 35.6 ' + (hy - 32) + ' C 38.6 ' + (hy - 30) + ' 40.6 ' + (hy - 25) + ' 40.8 ' + (hy - 20) + ' Z';
    const cheek = 'M 31.6 ' + (hy + 6) + ' Q 34.5 ' + (hy + 4.4) + ' 37 ' + (hy + 6.4) + ' L 32.6 ' + (hy + 9.6) + ' Z';
    const cheek2 = 'M 33.4 ' + (hy + 12) + ' Q 36 ' + (hy + 10.6) + ' 38.4 ' + (hy + 12.2) + ' L 35 ' + (hy + 15) + ' Z';
    const s1 = kind ? 37 : 35, s2 = kind ? 42 : 41;
    return {
      pal: [role === 'papa' ? ['#fdfcf7', '#2a2638', '#625c78', '#ffc2cf', '#3a3550', '#ffffff']
        : kind ? ['#fffaf2', '#8b5c3d', '#8a6a58', '#ffc8d3', '#6b4a3a', '#ffffff']
          : ['#fefcf8', '#2f2a3f', '#6c6682', '#ffc6d2', '#3f3a55', '#ffffff']],
      o: { al: [42, 73], ar: [58, 73], ll: [32, 85], lr: [68, 85], head: [50, 68], zz: [78, 14] },
      behind: G('tail', [64, 80], tube('M 64 80 C 74 82 79 76 80 69', 'var(--c1)', 3) + P('M 78.4 69.5 C 76 62 79 56.5 81.2 54.5 C 83.4 57.5 85.4 62.5 82.6 69.5 Z', 'var(--c2)', 2)
        + bone('M 64 80 C 74 82 79 76 80 69', [[64, 80], [80, 69]])),
      legL: tube('M 32 77 L 32 84.5', 'var(--c1)', 6.2) + L('M 29.2 80.4 L 34.8 80.4', 'var(--c2)', 2) + hoofSmall(32) + bone('M 32 77 L 32 88', [[32, 88]]),
      legR: tube('M 68 77 L 68 84.5', 'var(--c1)', 6.2) + L('M 65.2 80.4 L 70.8 80.4', 'var(--c2)', 2) + hoofSmall(68) + bone('M 68 77 L 68 88', [[68, 88]]),
      body: E(50, 76, kind ? 16.5 : 19, kind ? 12.5 : 14, 'var(--c1)', 3)
        + G('fo', null, P(stripeD(s1), 'var(--c2)', 0) + P(stripeD(s2), 'var(--c2)', 0) + P(mirror(stripeD(s1)), 'var(--c2)', 0) + P(mirror(stripeD(s2)), 'var(--c2)', 0))
        + shade('M 63 66 C 69 71 69 82 61 88 C 65 82 66 74 63 66 Z')
        + bone('M 50 64 L 50 84', [[50, 64], [50, 84]]),
      head: G('ear-l', [40, hy - 16], P(earD, 'var(--c1)', 2.6) + P(earIn, 'var(--c4)', 0))
        + G('ear-r', [60, hy - 16], P(mirror(earD), 'var(--c1)', 2.6) + P(mirror(earIn), 'var(--c4)', 0))
        + P(horseHead(hy, 13), 'var(--c1)', 3.2)
        + P('M 39 ' + (hy - 15) + ' Q 50 ' + (hy - 19) + ' 61 ' + (hy - 15) + ' L 60 ' + (hy - 12) + ' Q 50 ' + (hy - 15.5) + ' 40 ' + (hy - 12) + ' Z', 'var(--c2)', 0)
        + P(cheek, 'var(--c2)', 0) + P(mirror(cheek), 'var(--c2)', 0) + P(cheek2, 'var(--c2)', 0) + P(mirror(cheek2), 'var(--c2)', 0)
        + P('M 43.5 ' + (hy - 18) + ' Q 44 ' + (hy - 27) + ' 50 ' + (hy - 29) + ' Q 56 ' + (hy - 27) + ' 56.5 ' + (hy - 18) + ' Q 50 ' + (hy - 21) + ' 43.5 ' + (hy - 18) + ' Z', 'var(--c2)', 2.2)
        + L('M 47 ' + (hy - 25) + ' L 47.6 ' + (hy - 20) + ' M 50 ' + (hy - 27) + ' L 50 ' + (hy - 21) + ' M 53 ' + (hy - 25) + ' L 52.4 ' + (hy - 20), 'var(--c1)', 1.5, 'opacity=".85"')
        + shade('M 63 ' + (hy - 14) + ' C 69 ' + (hy - 6) + ' 69 ' + (hy + 6) + ' 63 ' + (hy + 15) + ' C 66 ' + (hy + 5) + ' 66 ' + (hy - 5) + ' 63 ' + (hy - 14) + ' Z')
        + shine('M 35.5 ' + (hy - 4) + ' C 36 ' + (hy - 10) + ' 39.5 ' + (hy - 16) + ' 44.5 ' + (hy - 18.5), 2.4, 0.6)
        + G('fo', null, E(50, hy + 19, 12.5, 8.6, 'var(--c3)', 2.6) + E(45.4, hy + 18.4, 1.6, 2.2, INK, 0) + E(54.6, hy + 18.4, 1.6, 2.2, INK, 0) + hl(43.6, hy + 14.6, 1.3, 0.45))
        + '{FACE}'
        + bone('M 50 68 L 50 ' + hy, [[50, hy]]),
      face: { lx: 41, rx: 59, y: hy, r: kind ? 5.2 : 4.7, my: hy + 23.4, mw: 3.4, mcol: '#fff',
        extra: role === 'mama' ? lashes(41, 59, hy, 4.7) : '' },
      back: L('M 50 ' + (hy - 20) + ' L 50 ' + (hy + 8), 'var(--c2)', 5) + L('M 39 ' + (hy - 6) + ' Q 50 ' + (hy - 9) + ' 61 ' + (hy - 6) + ' M 37 ' + (hy + 3) + ' Q 50 ' + hy + ' 63 ' + (hy + 3) + ' M 39 ' + (hy + 12) + ' Q 50 ' + (hy + 9) + ' 61 ' + (hy + 12), 'var(--c2)', 2.6),
      armL: tube('M 42 73 L 42 84', 'var(--c1)', 6.8) + L('M 38.6 76.6 L 45.4 76.6 M 38.6 80.6 L 45.4 80.6', 'var(--c2)', 2) + hoof(42) + bone('M 42 73 L 42 88', [[42, 73], [42, 88]]),
      armR: tube('M 58 73 L 58 84', 'var(--c1)', 6.8) + L('M 54.6 76.6 L 61.4 76.6 M 54.6 80.6 L 61.4 80.6', 'var(--c2)', 2) + hoof(58) + bone('M 58 73 L 58 88', [[58, 73], [58, 88]]),
      front: grass(50, 92) + hearts(72, 16),
      fx: tw(80, 12, 2.6, '#ffd23f', 0.5) + tw(20, 20, 2, '#fff', 1.5),
      vars: '--fx:#ffd23f'
    };
  }

  function gnu(role) {
    const papa = role === 'papa', kind = role === 'kind';
    const hy = kind ? 42 : 40;
    const hk = papa ? 1 : role === 'mama' ? 0.72 : 0.28;
    const hornD = 'M 41 ' + (hy - 16) + ' C ' + (41 - 9 * hk) + ' ' + (hy - 15) + ' ' + (41 - 17 * hk) + ' ' + (hy - 17 - hk) + ' ' + (41 - 20 * hk) + ' ' + (hy - 17 - 9 * hk)
      + ' C ' + (41 - 21 * hk) + ' ' + (hy - 17 - 12 * hk) + ' ' + (41 - 17 * hk) + ' ' + (hy - 17 - 13 * hk) + ' ' + (41 - 16 * hk) + ' ' + (hy - 17 - 10 * hk)
      + ' C ' + (41 - 14 * hk) + ' ' + (hy - 18 - 4 * hk) + ' ' + (41 - 8 * hk) + ' ' + (hy - 20 - hk) + ' 42 ' + (hy - 21) + ' Z';
    const earD = 'M 36.5 ' + (hy - 8) + ' C 28 ' + (hy - 11) + ' 22 ' + (hy - 8) + ' 21 ' + (hy - 5) + ' C 25 ' + (hy - 2) + ' 31 ' + (hy - 2) + ' 36.5 ' + (hy - 3) + ' Z';
    const earIn = 'M 33.5 ' + (hy - 7) + ' C 29 ' + (hy - 8.4) + ' 25.5 ' + (hy - 7) + ' 25 ' + (hy - 5.4) + ' C 27.5 ' + (hy - 4) + ' 31 ' + (hy - 4) + ' 33.5 ' + (hy - 4.6) + ' Z';
    return {
      pal: [papa ? ['#8995b0', '#36324b', '#4c4762', '#d9b3c3', '#3b3752', '#b3bdd1']
        : kind ? ['#d9a06a', '#8a5733', '#7d5236', '#f2c6c8', '#6b4430', '#ebc192']
          : ['#929eb8', '#3e3a55', '#544f6b', '#dfb9c8', '#433f5a', '#bac3d6']],
      o: { al: [42, 73], ar: [58, 73], ll: [32, 85], lr: [68, 85], head: [50, 68], zz: [80, 14] },
      behind: G('tail', [64, 80], tube('M 64 80 C 73 83 78 79 80 72', 'var(--c1)', 2.8) + P('M 78.4 72.5 C 74.8 64.5 78 57.5 81 55.5 C 84 59.5 86.2 65.5 82.6 72.5 Z', 'var(--c2)', 2)
        + bone('M 64 80 C 73 83 78 79 80 72', [[64, 80], [80, 72]])),
      legL: tube('M 32 77 L 32 84.5', 'var(--c1)', 6.2) + hoofSmall(32) + bone('M 32 77 L 32 88', [[32, 88]]),
      legR: tube('M 68 77 L 68 84.5', 'var(--c1)', 6.2) + hoofSmall(68) + bone('M 68 77 L 68 88', [[68, 88]]),
      body: E(50, 76, kind ? 16.5 : 19.5, kind ? 12.5 : 14, 'var(--c1)', 3)
        + (kind ? '' : L('M 37 68 Q 35.5 74 37.5 80 M 41.5 66 Q 40 72 41.8 79 M 63 68 Q 64.5 74 62.5 80 M 58.5 66 Q 60 72 58.2 79', 'var(--c2)', 1.8, 'opacity=".3" class="fo"'))
        + shade('M 63 66 C 69 71 69 82 61 88 C 65 82 66 74 63 66 Z')
        + shine('M 35 72 C 36 69 38.5 67 41.5 66', 2.2, 0.45)
        + bone('M 50 64 L 50 84', [[50, 64], [50, 84]]),
      head: P(hornD, 'var(--c5)', 2.4) + P(mirror(hornD), 'var(--c5)', 2.4)
        + (hk > 0.5 ? L('M ' + (41 - 12 * hk) + ' ' + (hy - 18.5 - hk) + ' l 1.2 -2.2 M ' + (41 - 6 * hk) + ' ' + (hy - 17.4) + ' l 0.8 -2.4', '#fff', 1.1, 'opacity=".35"') : '')
        + G('ear-l', [37, hy - 5], P(earD, 'var(--c6)', 2.4) + P(earIn, 'var(--c4)', 0))
        + G('ear-r', [63, hy - 5], P(mirror(earD), 'var(--c6)', 2.4) + P(mirror(earIn), 'var(--c4)', 0))
        + P(horseHead(hy, 13), 'var(--c6)', 3.2)
        + P('M 42.5 ' + (hy - 17) + ' Q 43 ' + (hy - 25) + ' 47 ' + (hy - 22) + ' Q 49.5 ' + (hy - 28) + ' 52.5 ' + (hy - 22.5) + ' Q 56 ' + (hy - 26.5) + ' 57.5 ' + (hy - 17) + ' Q 50 ' + (hy - 20) + ' 42.5 ' + (hy - 17) + ' Z', 'var(--c2)', 2.2)
        + shade('M 63 ' + (hy - 14) + ' C 69 ' + (hy - 6) + ' 69 ' + (hy + 6) + ' 63 ' + (hy + 15) + ' C 66 ' + (hy + 5) + ' 66 ' + (hy - 5) + ' 63 ' + (hy - 14) + ' Z')
        + shine('M 35.5 ' + (hy - 4) + ' C 36 ' + (hy - 10) + ' 39.5 ' + (hy - 16) + ' 44.5 ' + (hy - 18.5), 2.4, 0.55)
        + (kind ? '' : G('fo', null, P('M 42.5 ' + (hy + 23) + ' C 42 ' + (hy + 31) + ' 46 ' + (hy + 36) + ' 50 ' + (hy + (papa ? 39 : 35)) + ' C 54 ' + (hy + 36) + ' 58 ' + (hy + 31) + ' 57.5 ' + (hy + 23) + ' Z', 'var(--c2)', 2.4)))
        + G('fo', null, P('M 37.5 ' + (hy + 12) + ' C 37.5 ' + (hy + 7) + ' 43 ' + (hy + 6) + ' 50 ' + (hy + 6) + ' C 57 ' + (hy + 6) + ' 62.5 ' + (hy + 7) + ' 62.5 ' + (hy + 12) + ' L 63 ' + (hy + 19) + ' C 63 ' + (hy + 25) + ' 57 ' + (hy + 27.5) + ' 50 ' + (hy + 27.5) + ' C 43 ' + (hy + 27.5) + ' 37 ' + (hy + 25) + ' 37 ' + (hy + 19) + ' Z', 'var(--c3)', 2.6)
          + E(45, hy + 19, 1.7, 2.3, INK, 0) + E(55, hy + 19, 1.7, 2.3, INK, 0) + hl(42, hy + 11, 1.4, 0.35))
        + '{FACE}'
        + bone('M 50 68 L 50 ' + hy, [[50, hy]]),
      face: { lx: 41, rx: 59, y: hy - 1, r: kind ? 5.2 : 4.7, my: hy + 23.6, mw: 3.4, mcol: '#fff',
        extra: role === 'mama' ? lashes(41, 59, hy - 1, 4.7) : '' },
      back: L('M 50 ' + (hy - 20) + ' L 50 ' + (hy + 8), 'var(--c2)', 5.5),
      armL: tube('M 42 73 L 42 84', 'var(--c1)', 6.8) + hoof(42) + bone('M 42 73 L 42 88', [[42, 73], [42, 88]]),
      armR: tube('M 58 73 L 58 84', 'var(--c1)', 6.8) + hoof(58) + bone('M 58 73 L 58 88', [[58, 73], [58, 88]]),
      front: grass(50, 92) + hearts(74, 16),
      fx: tw(82, 10, 2.6, '#ffd23f', 0.5) + tw(18, 18, 2, '#fff', 1.5),
      vars: '--fx:#ffd23f'
    };
  }

  /* ══════════════════════════════════════════════════════════════
     Krokodil
     ══════════════════════════════════════════════════════════════ */
  function croc(role) {
    const kind = role === 'kind';
    const claws = (x, y) => C(x - 3, y, 0.9, 'var(--c4)', 0.8) + C(x, y + 0.4, 0.9, 'var(--c4)', 0.8) + C(x + 3, y, 0.9, 'var(--c4)', 0.8);
    // Zähnchen am Unterkiefer, links und rechts der Schnauze (zeigen nach oben)
    let teeth = '';
    [[29.4, 61.5], [30.6, 66.5], [32.2, 71.5], [35, 76.2], [39, 79.8]].forEach(([x, y]) => {
      teeth += P('M ' + x + ' ' + y + ' L ' + (x + 1.6) + ' ' + (y - 3) + ' L ' + (x + 3.2) + ' ' + y + ' Z', 'var(--c4)', 1.1)
        + P(mirror('M ' + x + ' ' + y + ' L ' + (x + 1.6) + ' ' + (y - 3) + ' L ' + (x + 3.2) + ' ' + y + ' Z'), 'var(--c4)', 1.1);
    });
    const headD = 'M 24 48 C 24 39 35 35 50 35 C 65 35 76 39 76 48 C 76 53 72 55.5 69 57 C 66.5 62 65 68 63.5 72 C 61.5 77 56 79 50 79 C 44 79 38.5 77 36.5 72 C 35 68 33.5 62 31 57 C 28 55.5 24 53 24 48 Z';
    const jawD = 'M 26.5 56 L 73.5 56 L 71.5 70 C 70 80.5 60.5 84.5 50 84.5 C 39.5 84.5 30 80.5 28.5 70 Z';
    return {
      pal: [role === 'papa' ? ['#6cc35a', '#4c9a43', '#dcefa3', '#ffffff', '#ff8fa3', '#3f8a3a']
        : kind ? ['#9fd46a', '#6aa84a', '#e8f3b8', '#ffffff', '#ff9ab0', '#5f9a40']
          : ['#78c962', '#55a249', '#e2f1ac', '#ffffff', '#ff94a8', '#468f3e']],
      o: { al: [34, 77], ar: [66, 77], ll: [38, 86], lr: [62, 86], head: [50, 76], zz: [78, 20] },
      behind: G('tail', [62, 80], P('M 60 75 C 74 73 86 77 93 85 C 95 88 91 91 88 88 C 82 83 72 82 62 84 Z', 'var(--c1)', 2.8)
        + C(71, 75.6, 2, 'var(--c2)', 1.4) + C(79, 77.6, 1.8, 'var(--c2)', 1.4) + C(86, 81.2, 1.5, 'var(--c2)', 1.3)
        + bone('M 62 80 C 74 78 84 80 90 87', [[62, 80], [90, 87]])),
      legL: E(38, 89, 6.6, 3.4, 'var(--c1)', 2.4) + claws(38, 91) + bone('M 38 83 L 38 89', [[38, 89]]),
      legR: E(62, 89, 6.6, 3.4, 'var(--c1)', 2.4) + claws(62, 91) + bone('M 62 83 L 62 89', [[62, 89]]),
      body: E(50, 78.5, kind ? 18 : 21, kind ? 11 : 12.5, 'var(--c1)', 3)
        + G('fo', null, E(50, 82.5, kind ? 11 : 13, 6.5, 'var(--c3)', 0) + L('M 41 80.5 L 59 80.5 M 40 84.5 L 60 84.5', 'var(--c2)', 1.2, 'opacity=".35"'))
        + shade('M 66 70 C 72 74 72 84 63 89 C 67 84 68.5 77 66 70 Z')
        + bone('M 50 70 L 50 86', [[50, 70], [50, 86]]),
      head: C(38.5, 34, kind ? 9.4 : 8.6, 'var(--c1)', 3) + C(61.5, 34, kind ? 9.4 : 8.6, 'var(--c1)', 3)
        + shine('M 32.5 32 C 33 28.5 35.5 26 38.5 25.5', 2, 0.6) + shine('M 55.5 32 C 56 28.5 58.5 26 61.5 25.5', 2, 0.6)
        + G('fo', null, P(jawD, 'var(--c3)', 3) + teeth)
        + P(headD, 'var(--c1)', 3.2)
        + G('fo', null, C(46, 72.5, 2.4, 'var(--c1)', 1.8) + C(54, 72.5, 2.4, 'var(--c1)', 1.8) + C(46, 72.3, 0.9, INK, 0) + C(54, 72.3, 0.9, INK, 0)
          + L('M 40 60 Q 50 63 60 60', INK, 1.4, 'opacity=".25"'))
        + C(44, 44, 1.8, 'var(--c2)', 1.2) + C(50, 42.5, 1.8, 'var(--c2)', 1.2) + C(56, 44, 1.8, 'var(--c2)', 1.2)
        + shade('M 69 41 C 75 46 74 54 67.5 58 C 70 53 71 47 69 41 Z')
        + shine('M 28.5 47 C 29 43.5 31.5 40.5 35.5 39', 2.4, 0.55)
        + '{FACE}'
        + bone('M 50 76 L 50 50', [[50, 50]]),
      face: { lx: 38.5, rx: 61.5, y: 34, r: kind ? 5.4 : 4.8, blush: false,
        extra: E(32, 49, 3.4, 2, '#ff6f9f', 0, 'opacity=".5"') + E(68, 49, 3.4, 2, '#ff6f9f', 0, 'opacity=".5"')
          + (role === 'mama' ? lashes(38.5, 61.5, 34, 4.8) : '') },
      back: C(44, 50, 2, 'var(--c2)', 1.3) + C(56, 50, 2, 'var(--c2)', 1.3) + C(50, 56, 2, 'var(--c2)', 1.3) + C(50, 44, 2, 'var(--c2)', 1.3),
      armL: tube('M 34 77 Q 27 80 27 85.5', 'var(--c1)', 6.6) + E(26.5, 87.4, 5.2, 3, 'var(--c1)', 2.2) + claws(26.5, 89.2) + bone('M 34 77 Q 27 80 27 87', [[34, 77], [27, 87]]),
      armR: tube('M 66 77 Q 73 80 73 85.5', 'var(--c1)', 6.6) + E(73.5, 87.4, 5.2, 3, 'var(--c1)', 2.2) + claws(73.5, 89.2) + bone('M 66 77 Q 73 80 73 87', [[66, 77], [73, 87]]),
      front: fish(50, 86) + hearts(74, 22),
      fx: tw(82, 16, 2.6, '#ffd23f', 0.5) + tw(18, 22, 2, '#fff', 1.5),
      vars: '--fx:#ffd23f'
    };
  }

  /* ══════════════════════════════════════════════════════════════
     Arten, Rollen, Bau
     ══════════════════════════════════════════════════════════════
     k = Größe in der Savanne, s = Größe in der Familie.            */
  const SPECIES = {
    lion: { name: 'Löwen', def: lion, k: 0.9, food: 'meat',
      roles: { papa: { title: 'Löwe', s: 1 }, mama: { title: 'Löwin', s: 0.9 }, kind: { title: 'Löwenjunges', s: 0.62 } } },
    elephant: { name: 'Elefanten', def: elephant, k: 1.25, food: 'grass',
      roles: { papa: { title: 'Elefantenbulle', s: 1 }, mama: { title: 'Elefantenkuh', s: 0.9 }, kind: { title: 'Elefantenkalb', s: 0.6 } } },
    zebra: { name: 'Zebras', def: zebra, k: 1, food: 'grass', graze: 1,
      roles: { papa: { title: 'Zebrahengst', s: 1 }, mama: { title: 'Zebrastute', s: 0.93 }, kind: { title: 'Zebrafohlen', s: 0.64 } } },
    gnu: { name: 'Gnus', def: gnu, k: 1, food: 'grass', graze: 1,
      roles: { papa: { title: 'Gnubulle', s: 1 }, mama: { title: 'Gnukuh', s: 0.93 }, kind: { title: 'Gnukalb', s: 0.64 } } },
    croc: { name: 'Krokodile', def: croc, k: 0.95, food: 'fish',
      roles: { papa: { title: 'Krokodil-Männchen', s: 1 }, mama: { title: 'Krokodil-Weibchen', s: 0.9 }, kind: { title: 'Jungtier', s: 0.6 } } }
  };
  const ORDER = ['lion', 'elephant', 'zebra', 'gnu', 'croc'];
  const ROLES = [['papa', 'Papa'], ['mama', 'Mama'], ['kind', 'Kind']];

  const cache = {};
  function def(key, role) {
    const k = key + ':' + role;
    return cache[k] || (cache[k] = SPECIES[key].def(role));
  }
  /* Zustand → Klassen: idle · walk · run · eat · sleep; Richtung left|right|front|back */
  function cls(state, dir) {
    if (state === 'walk') return 'state-walk dir-' + (dir || 'front');
    if (state === 'run') return 'state-walk sv-run dir-' + (dir || 'front');
    if (state === 'eat') return 'state-eat';
    if (state === 'sleep') return 'state-sleep';
    return 'c-idle';
  }
  // alle Klassen für das <svg> — zum Umschalten ohne Neubau: el.setAttribute('class', classes(…))
  function classes(key, state, dir, extra) {
    return cls(state, dir) + ' sv-' + key + (SPECIES[key].graze ? ' sv-graze' : '') + (extra ? ' ' + extra : '');
  }
  function svg(key, role, state, dir, extra) {
    return KS.buildDef(def(key, role), 0, classes(key, state, dir, extra), null, 0, 'savanne');
  }

  window.SavanneTiere = { SPECIES, ORDER, ROLES, svg, cls, classes };
})();
