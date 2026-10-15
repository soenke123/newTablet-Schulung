/* Handgebautes Mini-Netz: Embedding -> Concat -> Hidden (tanh) -> Softmax. Bengio-2003-Stil, bewusst ohne Attention.
   Zeitgeschedultes Training (trainBudget) läuft in phase3.js über requestAnimationFrame.
   Lernrate: am Anfang groß (schnell bergab), dann immer kleiner (lrAt). Mit fester Lernrate 0,08
   blieb der Fehler bei etwa 2,1 hängen und stieg danach sogar wieder — die Schritte waren zu grob,
   um die feinen Unterschiede zwischen den Wortfolgen zu lernen. Jetzt 0,15 → nach 4 Durchgängen halb
   so groß → mindestens 0,01: nach 10 Durchgängen Fehler etwa 1,3–1,5, nach 20 etwa 0,4–0,7
   (3–5 Kontextwörter, Standard-Textwelten, gemessen 15.10.2026). */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clampG(g, clip) { return g > clip ? clip : (g < -clip ? -clip : g); }

function createNet(vocabSize, C, opts) {
  const o = Object.assign({ d: 16, H: 40, seed: 7, lr: 0.15, lrMin: 0.01, lrHalf: 4, clip: 5 }, opts || {});
  const rnd = mulberry32(o.seed);
  function randInit(n, fanIn) {
    const scale = 1 / Math.sqrt(fanIn);
    const arr = new Float64Array(n);
    for (let i = 0; i < n; i++) arr[i] = (rnd() * 2 - 1) * scale;
    return arr;
  }
  const d = o.d, H = o.H, inDim = C * d;
  return {
    vocabSize, C, d, H, lr: o.lr, lr0: o.lr, lrMin: o.lrMin, lrHalf: o.lrHalf, clip: o.clip,
    embed: randInit(vocabSize * d, d),
    W1: randInit(inDim * H, inDim),
    b1: new Float64Array(H),
    W2: randInit(H * vocabSize, H),
    b2: new Float64Array(vocabSize),
    step: 0, lossHistory: [], diverged: false
  };
}

function forward(net, ctxIds) {
  const { d, H, vocabSize, C } = net;
  const inDim = C * d;
  const x = new Float64Array(inDim);
  for (let c = 0; c < C; c++) {
    const id = ctxIds[c];
    for (let j = 0; j < d; j++) x[c * d + j] = net.embed[id * d + j];
  }
  const h = new Float64Array(H);
  for (let k = 0; k < H; k++) {
    let s = net.b1[k];
    for (let i = 0; i < inDim; i++) s += net.W1[i * H + k] * x[i];
    h[k] = Math.tanh(s);
  }
  const logits = new Float64Array(vocabSize);
  for (let v = 0; v < vocabSize; v++) {
    let s = net.b2[v];
    for (let k = 0; k < H; k++) s += net.W2[k * vocabSize + v] * h[k];
    logits[v] = s;
  }
  return { x, h, logits };
}

function softmaxTemp(logits, temp) {
  const t = Math.max(0.05, temp == null ? 1 : temp);
  const n = logits.length;
  let mx = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > mx) mx = logits[i];
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { const e = Math.exp((logits[i] - mx) / t); out[i] = e; sum += e; }
  for (let i = 0; i < n; i++) out[i] /= sum;
  return out;
}

function trainStep(net, ctxIds, targetId) {
  const { d, H, vocabSize, C, lr, clip } = net;
  const inDim = C * d;
  const { x, h, logits } = forward(net, ctxIds);

  let mx = -Infinity;
  for (let v = 0; v < vocabSize; v++) if (logits[v] > mx) mx = logits[v];
  const probs = new Float64Array(vocabSize);
  let sum = 0;
  for (let v = 0; v < vocabSize; v++) { const e = Math.exp(logits[v] - mx); probs[v] = e; sum += e; }
  for (let v = 0; v < vocabSize; v++) probs[v] /= sum;
  const loss = -Math.log(Math.max(probs[targetId], 1e-9));
  if (!isFinite(loss)) return loss;

  const dLogits = probs;
  dLogits[targetId] -= 1;

  const dh = new Float64Array(H);
  for (let k = 0; k < H; k++) {
    let s = 0;
    for (let v = 0; v < vocabSize; v++) s += net.W2[k * vocabSize + v] * dLogits[v];
    dh[k] = s;
  }
  for (let k = 0; k < H; k++) {
    for (let v = 0; v < vocabSize; v++) {
      net.W2[k * vocabSize + v] -= lr * clampG(h[k] * dLogits[v], clip);
    }
  }
  for (let v = 0; v < vocabSize; v++) net.b2[v] -= lr * clampG(dLogits[v], clip);

  const dHPre = new Float64Array(H);
  for (let k = 0; k < H; k++) dHPre[k] = dh[k] * (1 - h[k] * h[k]);

  const dx = new Float64Array(inDim);
  for (let i = 0; i < inDim; i++) {
    let s = 0;
    for (let k = 0; k < H; k++) s += net.W1[i * H + k] * dHPre[k];
    dx[i] = s;
  }
  for (let i = 0; i < inDim; i++) {
    for (let k = 0; k < H; k++) {
      net.W1[i * H + k] -= lr * clampG(x[i] * dHPre[k], clip);
    }
  }
  for (let k = 0; k < H; k++) net.b1[k] -= lr * clampG(dHPre[k], clip);

  for (let c = 0; c < C; c++) {
    const id = ctxIds[c];
    for (let j = 0; j < d; j++) {
      net.embed[id * d + j] -= lr * clampG(dx[c * d + j], clip);
    }
  }
  return loss;
}

/* Lernrate nach so vielen Durchgängen durch alle Beispiele: nach lrHalf Durchgängen halb so groß,
   nie kleiner als lrMin. */
function lrAt(net, epoch) { return Math.max(net.lrMin, net.lr0 / (1 + epoch / net.lrHalf)); }

/* Trainiert, bis das Zeitbudget (ms) aufgebraucht ist. Bricht bei NaN/Inf sofort ab (net.diverged). */
function trainBudget(net, pairs, budgetMs) {
  if (!pairs.length) return { n: 0, nanHit: false, avgLoss: null };
  const start = performance.now();
  let n = 0, lossSum = 0, nanHit = false;
  while (performance.now() - start < budgetMs) {
    if ((n & 63) === 0) net.lr = lrAt(net, net.step / pairs.length);
    const p = pairs[Math.floor(Math.random() * pairs.length)];
    const loss = trainStep(net, p.ctx, p.target);
    if (!isFinite(loss)) { nanHit = true; net.diverged = true; break; }
    lossSum += loss; n++; net.step++;
  }
  if (n) {
    net.lossHistory.push(lossSum / n);
    /* Nicht vorne abschneiden (dann sah man nach ein paar Sekunden den Abfall vom Anfang nicht
       mehr), sondern die älteren Werte paarweise zusammenfassen: die ganze Lernkurve bleibt
       sichtbar, nur gröber. Die jüngsten 50 Werte bleiben fein. */
    if (net.lossHistory.length > 400) {
      const h = net.lossHistory, keep = h.slice(-50), old = h.slice(0, -50), merged = [];
      for (let i = 0; i < old.length; i += 2) merged.push(i + 1 < old.length ? (old[i] + old[i + 1]) / 2 : old[i]);
      net.lossHistory = merged.concat(keep);
    }
  }
  return { n, nanHit, avgLoss: n ? lossSum / n : null };
}
