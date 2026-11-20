// Nebeltal: 3D-Pinguin als Profilbild (Migration 0299) – zeichnet die Figur aus js/grafik.js zweimal,
// vor schwarzem und weißem Hintergrund; img/avatare.py stellt sie daraus frei.
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2], cam = Object.assign({ eye: [0.8, 2.4, -3.5], at: [0, 1.9, 0] }, JSON.parse(process.argv[3] || '{}'));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent('<html><body style="margin:0"><canvas id="c" style="width:512px;height:512px;display:block"></canvas></body></html>');
  await p.addScriptTag({ path: path.join(__dirname, '..', 'js', 'grafik.js') });
  for (const bg of ['#000000', '#ffffff']) {
    await p.evaluate(({ bg, cam }) => {
      window.G = window.G || NTGrafik.create(document.getElementById('c'));
      const W = { kind: 'lobby', W: 1, h: () => -900, grad: () => [0, 0], meshN: 4, min: { x: 0, z: 0, h: -900 }, start: { x: 0, z: 0 } };
      G.setPalette({ fog: bg, c: ['#123a57', '#2d6688', '#86a9c2', '#dfeaf3'], amb: cam.amb || 0.45, light: [-0.35, 0.7, -0.55], dark: true }, 'dark');
      G.setWorld(W, 'dark');
      G.frame({ cam: { eye: cam.eye || [0.9, 1.3, -3.2], at: cam.at || [0, 0.75, 0] }, fov: cam.fov || 0.6, fogR: 99, dpr: 1,
        player: { x: 0, y: 0, z: 0, ground: 0, yaw: cam.yaw == null ? Math.PI : cam.yaw, tilt: 0, squash: 1, phase: 0, walk: 0, seed: 1 },
        playerColor: cam.col || [1, 0.55, 0.2], objects: [] });
    }, { bg, cam });
    await p.screenshot({ path: out + '_' + bg.slice(1) + '.png' });
  }
  await b.close();
})();
