// Prüfstand für das Rechenmodell und die Szenarien (ohne Browser).
// node MPSkills/tools/NeuroLab/tests/netz.test.mjs
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
const ctx = { window: {}, console, Math, JSON };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['netz.js', 'daten.js', 'szenarien.js']) {
  // netz.js exportiert über module, wenn vorhanden — hier nicht
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}
const N = ctx.window.NLNetz, { S } = ctx.window.NLSzenarien;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } else console.log('✓', m); };

// 1. Steckplätze: Reihenfolge egal
{
  const sc = S['b-gatter'];
  const net = sc.start();
  // Neuron 0 = NICHT A, 1 = ODER, 2 = UND — absichtlich verdreht
  net.layers[0][0].w = [-1, 0]; net.layers[0][0].b = 0.5;
  net.layers[0][1].w = [1, 1];  net.layers[0][1].b = -0.5;
  net.layers[0][2].w = [1, 1];  net.layers[0][2].b = -1.5;
  net.outputs[0].src = { l: 0, n: 2 }; net.outputs[1].src = { l: 0, n: 1 }; net.outputs[2].src = { l: 0, n: 0 };
  ok(N.evaluate(net, sc.rows).acc === 1, 'UND/ODER/NICHT mit vertauschten Neuronen gelöst');
}
// 2. XOR von Hand
{
  const sc = S['b-xor'];
  const net = sc.start();
  net.layers = [[{ act: 'step', w: [1, 1], b: -0.5 }, { act: 'step', w: [-1, -1], b: 1.5 }], [{ act: 'step', w: [1, 1], b: -1.5 }]];
  net.outputs[0].src = { l: 1, n: 0 };
  ok(N.evaluate(net, sc.rows).acc === 1, 'XOR mit zwei Schichten von Hand');
}
// 3. Training
function train(id, layers, acts, epochs, lr) {
  const sc = S[id];
  const net = sc.start();
  if (layers) {
    net.layers = layers.map((k, l) => Array.from({ length: k }, () => N.makeNeuron(l === 0 ? net.inputs.length : layers[l - 1], acts[l])));
  }
  const L = net.layers.length - 1;
  net.outputs.forEach((o, k) => { o.src = { l: L, n: k }; });
  N.randomize(net, 3);
  const tr = sc.rows.filter(r => !r.test), te = sc.rows.filter(r => r.test);
  for (let e = 0; e < epochs; e++) tr.forEach(r => N.trainSample(net, r.x, r.t, lr || sc.lr));
  const a = N.evaluate(net, tr, { cls: sc.cls, tol: sc.tol }), b = N.evaluate(net, te, { cls: sc.cls, tol: sc.tol });
  ok(a.acc >= sc.goal.acc, `${id}: Training ${(a.acc * 100).toFixed(0)} %, Test ${(b.acc * 100).toFixed(0)} % (Ziel ${sc.goal.acc * 100} %)`);
}
train('t-gatter', [3, 3], ['sigmoid', 'sigmoid'], 3000);
train('t-vogel1', null, null, 300);
train('t-vogel2', [2, 1], ['sigmoid', 'sigmoid'], 1500);
train('t-vogel3', [3, 4], ['sigmoid', 'sigmoid'], 1500);
train('t-vogel3d', [3, 4], ['sigmoid', 'sigmoid'], 1500);
train('t-ziffer', [5, 2], ['sigmoid', 'sigmoid'], 3000);
train('t-zielscheibe', [12, 1], ['relu', 'linear'], 800);
train('t-kurve', [8, 1], ['relu', 'linear'], 2000);
process.exit(fail ? 1 : 0);
