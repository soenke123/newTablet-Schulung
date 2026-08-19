'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  phase: 'build',
  numInputs: 3,
  inputs: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  inputSpacing: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  colOffsets: [0, 0, 0, 0, 0, 0],
  layerHidden: [false, false, false, false],
  inputLabels:  ['x1','x2','x3','x4','x5','x6','x7','x8','x9','x10'],
  outputLabels: [],
  learn: {
    scenario:      null,
    learningRate:  0.1,
    speed:         1,
    isTraining:    false,
    epoch:         0,
    loss:          0,
    lossHistory:   [],
    intervalId:    null,
    sampleIdx:       0,
    lastTargets:     [],
    lastSample:      null,
    lastPredictions: [],
    shuffledData:    [],
    panelX:        null,
    panelY:        null,
    infoPanelOpen: true,
    topologyDirty: false,
    customData:     null,
    customError:    null,
    customFileName: null,
  },
  layers: [
    { count: 0, neurons: [] },
    { count: 0, neurons: [] },
    { count: 0, neurons: [] },
    { count: 0, neurons: [] },
  ],
};

let printMode = false;

// ── Activation functions ───────────────────────────────────────────────────
const activations = {
  perceptron: {
    color: '#5aab7a',
    fullName: 'Perceptron',
    fn: z => z > 0 ? 1 : 0,
    shortLines: ['1   (z > 0)', '0   (z ≤ 0)'],
    formula: 'f(z) = 1 wenn z > 0, sonst 0',
    apply: z => `f(${fmt(z)}) = ${z > 0 ? '1' : '0'}   (${fmt(z)} > 0 ist ${z > 0 ? 'wahr' : 'falsch'})`,
    derivative: () => 1,
  },
  linear: {
    color: '#5880c8',
    fullName: 'Linear',
    fn: z => z,
    shortLines: ['f(z) = z'],
    formula: 'f(z) = z',
    apply: z => `f(${fmt(z)}) = ${fmt(z)}`,
    derivative: () => 1,
  },
  relu: {
    color: '#c4504a',
    fullName: 'ReLU',
    fn: z => Math.max(0, z),
    shortLines: ['max(0, z)'],
    formula: 'f(z) = max(0, z)',
    apply: z => `f(${fmt(z)}) = max(0, ${fmt(z)}) = ${fmt(Math.max(0, z))}`,
    derivative: (y, z) => z > 0 ? 1 : 0,
  },
  sigmoid: {
    color: '#4898b0',
    fullName: 'Sigmoid',
    fn: z => 1 / (1 + Math.exp(-z)),
    shortLines: ['<span class="math-frac"><span class="mnum">1</span><span class="mden">1 + e<sup>−z</sup></span></span>'],
    formula: 'f(z) = <span class="math-frac"><span class="mnum">1</span><span class="mden">1 + e<sup>−z</sup></span></span>',
    apply: z => `f(${fmt(z)}) = <span class="math-frac"><span class="mnum">1</span><span class="mden">1 + e<sup>−${fmt(z)}</sup></span></span> ≈ ${fmt(1 / (1 + Math.exp(-z)))}`,
    derivative: y => y * (1 - y),
  },
  tanh: {
    color: '#9b6bbf',
    fullName: 'Tanh',
    fn: z => Math.tanh(z),
    shortLines: ['<span class="math-frac"><span class="mnum">e<sup>z</sup> − e<sup>−z</sup></span><span class="mden">e<sup>z</sup> + e<sup>−z</sup></span></span>'],
    formula: 'f(z) = tanh(z) = <span class="math-frac"><span class="mnum">e<sup>z</sup> − e<sup>−z</sup></span><span class="mden">e<sup>z</sup> + e<sup>−z</sup></span></span>',
    apply: z => `f(${fmt(z)}) = tanh(${fmt(z)}) ≈ ${fmt(Math.tanh(z))}`,
    derivative: y => 1 - y * y,
  },
};

// ── Scenarios ──────────────────────────────────────────────────────────────
const SCENARIOS = {
  gates: {
    name: 'Logik-Gatter',
    numInputs: 2,
    inputLabels:  ['Eingang A', 'Eingang B'],
    outputLabels: ['AND', 'OR', 'NOT A', 'XOR'],
    topology: [
      { count: 6, type: 'sigmoid', outputIndices: [0, 1, 2] },
      { count: 1, type: 'sigmoid' },
      { count: 0 }, { count: 0 },
    ],
    // li-first ordering: L0N0=AND, L0N1=OR, L0N2=NOT A, L1N0=XOR
    data: [
      { inputs: [0, 0], targets: [0, 0, 1, 0] },
      { inputs: [0, 1], targets: [0, 1, 1, 1] },
      { inputs: [1, 0], targets: [0, 1, 0, 1] },
      { inputs: [1, 1], targets: [1, 1, 0, 0] },
    ],
  },
  seg7: {
    name: '7-Segment-Ziffer',
    numInputs: 7,
    inputLabels:  ['Seg. a', 'Seg. b', 'Seg. c', 'Seg. d', 'Seg. e', 'Seg. f', 'Seg. g'],
    outputLabels: ['Ziffer (0-9)'],
    topology: [
      { count: 10, type: 'sigmoid' },
      { count: 1,  type: 'linear'  },
      { count: 0  }, { count: 0 },
    ],
    data: [
      { inputs: [1,1,1,1,1,1,0], targets: [0] },
      { inputs: [0,1,1,0,0,0,0], targets: [1] },
      { inputs: [1,1,0,1,1,0,1], targets: [2] },
      { inputs: [1,1,1,1,0,0,1], targets: [3] },
      { inputs: [0,1,1,0,0,1,1], targets: [4] },
      { inputs: [1,0,1,1,0,1,1], targets: [5] },
      { inputs: [1,0,1,1,1,1,1], targets: [6] },
      { inputs: [1,1,1,0,0,0,0], targets: [7] },
      { inputs: [1,1,1,1,1,1,1], targets: [8] },
      { inputs: [1,1,1,1,0,1,1], targets: [9] },
    ],
  },
  zielscheibe: {
    name: 'Zielscheibe',
    numInputs: 2,
    inputLabels:  ['x (normiert)', 'y (normiert)'],
    outputLabels: ['Punkte'],
    topology: [
      { count: 10, type: 'relu'   },
      { count: 10, type: 'relu'   },
      { count: 1,  type: 'linear' },
      { count: 0 },
    ],
    data: [
  {inputs:[0.2629,-0.1344],targets:[0.1]},
  {inputs:[0.9164,0.4413],targets:[0]},
  {inputs:[-0.8455,0.0691],targets:[0.4]},
  {inputs:[-0.5896,0.3243],targets:[0.4]},
  {inputs:[0.9502,-0.072],targets:[0.2]},
  {inputs:[-0.6502,0.9934],targets:[0]},
  {inputs:[0.6389,-0.5018],targets:[0.1]},
  {inputs:[-0.7871,0.0019],targets:[0.4]},
  {inputs:[0.4852,0.2876],targets:[0.2]},
  {inputs:[-1.29,-0.076],targets:[0]},
  {inputs:[0.8771,-1.1669],targets:[0]},
  {inputs:[0.24,-1.218],targets:[0]},
  {inputs:[-0.6059,-1.1394],targets:[0]},
  {inputs:[-0.8172,0.7372],targets:[0]},
  {inputs:[0.0789,-1.2295],targets:[0]},
  {inputs:[-0.8502,0.891],targets:[0]},
  {inputs:[-0.0319,0.8035],targets:[0.3]},
  {inputs:[-0.4694,-0.1303],targets:[0.4]},
  {inputs:[-1.2027,-1.1664],targets:[0]},
  {inputs:[0.1472,0.2515],targets:[0.3]},
  {inputs:[-0.6625,0.3788],targets:[0.4]},
  {inputs:[-0.7553,-0.5106],targets:[0.5]},
  {inputs:[0.6204,0.9326],targets:[0]},
  {inputs:[0.0208,-0.7691],targets:[0.1]},
  {inputs:[-0.5611,-0.5382],targets:[0.5]},
  {inputs:[-1.1058,0.4156],targets:[0]},
  {inputs:[0.47,0.502],targets:[0.2]},
  {inputs:[1.1124,-1.0713],targets:[0]},
  {inputs:[1.1537,-0.179],targets:[0]},
  {inputs:[1.15,-0.943],targets:[0]},
  {inputs:[-1.0115,-1.2588],targets:[0]},
  {inputs:[-0.3628,-0.0475],targets:[0.4]},
  {inputs:[0.291,1.0389],targets:[0]},
  {inputs:[-1.0983,0.571],targets:[0]},
  {inputs:[1.1307,-0.5765],targets:[0]},
  {inputs:[0.5371,-0.833],targets:[0.1]},
  {inputs:[0.0528,0.8369],targets:[0.3]},
  {inputs:[-0.9865,1.2887],targets:[0]},
  {inputs:[0.1633,1.0819],targets:[0]},
  {inputs:[-0.1716,0.204],targets:[0.4]},
  {inputs:[-0.4239,0.2502],targets:[0.4]},
  {inputs:[-0.4603,0.5965],targets:[0.4]},
  {inputs:[-0.5325,-0.1306],targets:[0.4]},
  {inputs:[0.8921,0.5072],targets:[0]},
  {inputs:[1.2844,1.0145],targets:[0]},
  {inputs:[-0.1771,0.1176],targets:[0.4]},
  {inputs:[-0.5306,-1.0377],targets:[0]},
  {inputs:[0.5115,-0.4854],targets:[0.1]},
  {inputs:[0.7435,1.0524],targets:[0]},
  {inputs:[-1.0565,-0.064],targets:[0]},
  {inputs:[0.8371,-0.9621],targets:[0]},
  {inputs:[1.2291,-0.8362],targets:[0]},
  {inputs:[0.5445,0.5192],targets:[0.2]},
  {inputs:[-0.7197,-0.2266],targets:[0.4]},
  {inputs:[-0.8751,0.4021],targets:[0.4]},
  {inputs:[-0.4266,-0.7619],targets:[0.5]},
  {inputs:[0.3351,1.0059],targets:[0]},
  {inputs:[-0.4514,0.7603],targets:[0.3]},
  {inputs:[-0.2783,-0.9584],targets:[0.5]},
  {inputs:[0.9456,-0.3388],targets:[0]},
  {inputs:[-1.2752,0.6173],targets:[0]},
  {inputs:[0.3517,0.9774],targets:[0]},
  {inputs:[1.0612,-0.7566],targets:[0]},
  {inputs:[0.2702,-0.028],targets:[0.2]},
  {inputs:[-0.8215,-1.1766],targets:[0]},
  {inputs:[0.5344,0.5418],targets:[0.2]},
  {inputs:[-0.5421,-0.5837],targets:[0.5]},
  {inputs:[-0.4248,-1.2243],targets:[0]},
  {inputs:[-0.7257,1.2832],targets:[0]},
  {inputs:[0.1881,1.2703],targets:[0]},
  {inputs:[-0.8739,-0.8558],targets:[0]},
  {inputs:[0.1585,-0.5395],targets:[0.1]},
  {inputs:[-0.2739,-0.1705],targets:[0.5]},
  {inputs:[-0.2123,0.484],targets:[0.3]},
  {inputs:[-0.2639,-0.4261],targets:[0.5]},
  {inputs:[1.0287,-0.449],targets:[0]},
  {inputs:[-0.0123,0.2883],targets:[0.3]},
  {inputs:[0.1205,0.2322],targets:[0.3]},
  {inputs:[-0.6879,-0.454],targets:[0.5]},
  {inputs:[-0.5232,-0.4665],targets:[0.5]},
  {inputs:[0.4402,-0.7257],targets:[0.1]},
  {inputs:[-0.8598,0.507],targets:[0.4]},
  {inputs:[-0.483,-0.9752],targets:[0]},
  {inputs:[-0.4841,-1.1897],targets:[0]},
  {inputs:[0.2016,-0.76],targets:[0.1]},
  {inputs:[-0.048,-0.3122],targets:[0.5]},
  {inputs:[0.5513,1.0728],targets:[0]},
  {inputs:[0.8104,-0.1577],targets:[0.2]},
  {inputs:[-0.8992,0.9558],targets:[0]},
  {inputs:[0.0668,0.885],targets:[0.3]},
  {inputs:[1.0257,-0.1297],targets:[0]},
  {inputs:[-0.9189,0.3087],targets:[0.4]},
  {inputs:[0.7997,-0.7581],targets:[0]},
  {inputs:[-0.2869,0.1187],targets:[0.4]},
  {inputs:[1.2597,-0.0208],targets:[0]},
  {inputs:[0.9347,0.8923],targets:[0]},
  {inputs:[0.6334,-1.1608],targets:[0]},
  {inputs:[-1.1197,-0.8598],targets:[0]},
  {inputs:[0.017,0.4593],targets:[0.3]},
  {inputs:[0.6781,1.2778],targets:[0]},
  {inputs:[0.8215,0.3422],targets:[0.2]},
  {inputs:[0.8761,0.9177],targets:[0]},
  {inputs:[0.2584,-0.3872],targets:[0.1]},
  {inputs:[-0.138,0.9838],targets:[0.3]},
  {inputs:[0.4706,-0.392],targets:[0.1]},
  {inputs:[1.1376,0.3274],targets:[0]},
  {inputs:[-0.4437,0.8961],targets:[0.3]},
  {inputs:[-0.9059,-0.349],targets:[0.5]},
  {inputs:[-1.2481,-1.0777],targets:[0]},
  {inputs:[0.3839,0.5885],targets:[0.3]},
  {inputs:[1.1854,0.9866],targets:[0]},
  {inputs:[-0.0878,0.5394],targets:[0.3]},
  {inputs:[-0.9226,-0.5899],targets:[0]},
  {inputs:[-0.9382,-1.176],targets:[0]},
  {inputs:[-0.5434,-0.1534],targets:[0.4]},
  {inputs:[0.1788,0.5626],targets:[0.3]},
  {inputs:[0.7633,0.7405],targets:[0]},
  {inputs:[-0.7906,0.4325],targets:[0.4]},
  {inputs:[0.0463,-0.1468],targets:[0.1]},
  {inputs:[-0.0805,-0.1064],targets:[0.5]},
  {inputs:[-0.1949,-0.437],targets:[0.5]},
  {inputs:[-0.5003,-0.9161],targets:[0]},
  {inputs:[0.012,-0.6048],targets:[0.1]},
  {inputs:[0.0794,0.1247],targets:[0.3]},
  {inputs:[0.3832,-0.1633],targets:[0.1]},
  {inputs:[-0.9495,-1.2902],targets:[0]},
  {inputs:[-0.9147,1.1524],targets:[0]},
  {inputs:[-1.1198,0.9637],targets:[0]},
  {inputs:[-0.181,0.0064],targets:[0.4]},
  {inputs:[-1.0431,0.8363],targets:[0]},
  {inputs:[-1.1525,-0.3364],targets:[0]},
  {inputs:[-0.7028,0.5272],targets:[0.4]},
  {inputs:[0.1665,-1.054],targets:[0]},
  {inputs:[1.2126,0.6503],targets:[0]},
  {inputs:[0.4191,0.7706],targets:[0.3]},
  {inputs:[0.1269,0.7926],targets:[0.3]},
  {inputs:[0.0703,-0.8402],targets:[0.1]},
  {inputs:[-1.097,-1.0507],targets:[0]},
  {inputs:[-1.1451,-0.6168],targets:[0]},
  {inputs:[0.4476,0.4377],targets:[0.2]},
  {inputs:[0.1586,1.2393],targets:[0]},
  {inputs:[-1.2425,-0.2684],targets:[0]},
  {inputs:[-0.4216,-0.5613],targets:[0.5]},
  {inputs:[0.8661,0.0954],targets:[0.2]},
  {inputs:[-0.7671,1.1552],targets:[0]},
  {inputs:[1.1755,-0.6077],targets:[0]},
  {inputs:[0.0477,0.936],targets:[0.3]},
  {inputs:[1.1319,0.4809],targets:[0]},
  {inputs:[0.1782,0.8058],targets:[0.3]},
  {inputs:[-0.4889,-0.0155],targets:[0.4]},
  {inputs:[0.6507,0.1293],targets:[0.2]},
  {inputs:[0.4869,0.1411],targets:[0.2]},
  {inputs:[0.1196,1.2141],targets:[0]},
  {inputs:[1.2592,0.6931],targets:[0]},
  {inputs:[-0.4973,0.342],targets:[0.4]},
  {inputs:[0.4366,0.9482],targets:[0]},
  {inputs:[-0.2942,0.9826],targets:[0]},
  {inputs:[-0.4759,0.9877],targets:[0]},
  {inputs:[-0.2256,-0.4169],targets:[0.5]},
  {inputs:[0.0854,0.8756],targets:[0.3]},
  {inputs:[0.3064,0.9561],targets:[0]},
  {inputs:[0.498,-0.9078],targets:[0]},
  {inputs:[-0.5545,1.1998],targets:[0]},
  {inputs:[-0.0347,-0.5854],targets:[0.5]},
  {inputs:[0.34,0.7051],targets:[0.3]},
  {inputs:[0.6196,0.5586],targets:[0.2]},
  {inputs:[-0.8167,0.9015],targets:[0]},
  {inputs:[1.0467,0.1163],targets:[0]},
  {inputs:[-0.0746,-1.1115],targets:[0]},
  {inputs:[-0.0002,1.0224],targets:[0]},
  {inputs:[0.4557,-0.2051],targets:[0.1]},
  {inputs:[-0.1488,0.3012],targets:[0.3]},
  {inputs:[0.5649,0.0465],targets:[0.2]},
  {inputs:[-1.1874,-0.8643],targets:[0]},
  {inputs:[-1.0463,-0.985],targets:[0]},
  {inputs:[-0.3241,0.8533],targets:[0.3]},
  {inputs:[0.8784,0.4767],targets:[0.2]},
  {inputs:[-1.0797,-1.2147],targets:[0]},
  {inputs:[-0.5973,0.5201],targets:[0.4]},
  {inputs:[-0.5989,0.9258],targets:[0]},
  {inputs:[0.3278,1.0633],targets:[0]},
  {inputs:[1.0092,-0.4028],targets:[0]},
  {inputs:[-1.0406,0.3308],targets:[0]},
  {inputs:[-0.6765,-0.0515],targets:[0.4]},
  {inputs:[-0.5753,-0.6237],targets:[0.5]},
  {inputs:[0.5732,0.0495],targets:[0.2]},
  {inputs:[-0.0309,0.239],targets:[0.3]},
  {inputs:[-1.0164,0.733],targets:[0]},
  {inputs:[0.4916,1.0884],targets:[0]},
  {inputs:[-0.9969,-1.1471],targets:[0]},
  {inputs:[-1.2138,-0.4146],targets:[0]},
  {inputs:[-0.6756,-0.7022],targets:[0.5]},
  {inputs:[1.275,0.2111],targets:[0]},
  {inputs:[0.884,-0.4118],targets:[0.1]},
  {inputs:[0.3878,-1.2166],targets:[0]},
  {inputs:[0.6102,0.7764],targets:[0.2]},
  {inputs:[-0.3227,-0.7685],targets:[0.5]},
  {inputs:[0.7423,0.0132],targets:[0.2]},
  {inputs:[-0.9409,-1.0855],targets:[0]},
  {inputs:[0.7086,-0.1778],targets:[0.2]},
  {inputs:[0.963,0.7595],targets:[0]},
  {inputs:[-0.0168,1.1741],targets:[0]},
  {inputs:[-0.8439,-0.9217],targets:[0]},
  {inputs:[0.1355,0.454],targets:[0.3]},
  {inputs:[-0.7629,0.7024],targets:[0]},
  {inputs:[-0.6726,-0.949],targets:[0]},
  {inputs:[0.4157,0.2672],targets:[0.2]},
  {inputs:[0.1441,-0.7661],targets:[0.1]},
  {inputs:[1.0973,0.0566],targets:[0]},
  {inputs:[0.6373,-1.1704],targets:[0]},
  {inputs:[1.1896,0.2089],targets:[0]},
  {inputs:[-0.5617,-1.1776],targets:[0]},
  {inputs:[-0.4517,0.5511],targets:[0.4]},
  {inputs:[0.6786,-0.6473],targets:[0.1]},
  {inputs:[0.9432,-0.1149],targets:[0.2]},
  {inputs:[-0.8251,0.3709],targets:[0.4]},
  {inputs:[0.0195,-0.8102],targets:[0.1]},
  {inputs:[0.9165,-1.0726],targets:[0]},
  {inputs:[-0.9455,1.287],targets:[0]},
  {inputs:[-0.7497,-0.0739],targets:[0.4]},
  {inputs:[0.0226,0.311],targets:[0.3]},
  {inputs:[-0.0402,0.4531],targets:[0.3]},
  {inputs:[-0.8883,1.2455],targets:[0]},
  {inputs:[0.856,-0.3996],targets:[0.1]},
  {inputs:[-0.7673,0.0471],targets:[0.4]},
  {inputs:[0.6817,-0.1405],targets:[0.2]},
  {inputs:[-0.0385,-0.6443],targets:[0.5]},
  {inputs:[-0.0017,-1.2095],targets:[0]},
  {inputs:[0.9404,-0.3546],targets:[0]},
  {inputs:[-0.1923,-0.646],targets:[0.5]},
  {inputs:[0.0103,-1.1934],targets:[0]},
  {inputs:[0.4312,-1.1316],targets:[0]},
  {inputs:[1.043,0.6843],targets:[0]},
  {inputs:[0.4106,0.8062],targets:[0.3]},
  {inputs:[-1.1602,0.2254],targets:[0]},
  {inputs:[0.1272,-0.0477],targets:[0.1]},
  {inputs:[0.0324,-0.064],targets:[1]},
  {inputs:[-0.1286,0.2007],targets:[0.3]},
  {inputs:[-1.2576,0.5415],targets:[0]},
  {inputs:[-1.2904,0.4969],targets:[0]},
  {inputs:[-0.8236,-0.3406],targets:[0.5]},
  {inputs:[0.587,1.1209],targets:[0]},
  {inputs:[-0.5746,0.3071],targets:[0.4]},
  {inputs:[1.0468,-0.0985],targets:[0]},
  {inputs:[-1.1814,0.1753],targets:[0]},
  {inputs:[-0.0132,-0.1508],targets:[0.5]},
  {inputs:[-0.0823,0.6599],targets:[0.3]},
  {inputs:[-0.9845,0.5586],targets:[0]},
  {inputs:[0.2472,1.1585],targets:[0]},
  {inputs:[0.8661,-0.0538],targets:[0.2]},
  {inputs:[-1.2785,1.0673],targets:[0]},
  {inputs:[-1.1382,0.0418],targets:[0]},
  {inputs:[-0.0343,0.4729],targets:[0.3]},
  {inputs:[0.1434,0.2863],targets:[0.3]},
  {inputs:[0.915,0.4272],targets:[0]},
  {inputs:[1.259,1.2466],targets:[0]},
  {inputs:[1.2145,0.8103],targets:[0]},
  {inputs:[1.1893,0.8093],targets:[0]},
  {inputs:[-0.8858,-1.068],targets:[0]},
  {inputs:[1.2817,-1.2096],targets:[0]},
  {inputs:[-0.023,0.9731],targets:[0.3]},
  {inputs:[0.4659,0.7178],targets:[0.3]},
  {inputs:[-0.4482,0.8855],targets:[0.3]},
  {inputs:[-0.1202,1.1001],targets:[0]},
  {inputs:[0.4049,-0.6486],targets:[0.1]},
  {inputs:[-0.894,-0.3264],targets:[0.5]},
  {inputs:[0.584,-1.169],targets:[0]},
  {inputs:[-0.9411,-0.6776],targets:[0]},
  {inputs:[0.3143,-0.3269],targets:[0.1]},
  {inputs:[0.3521,1.2336],targets:[0]},
  {inputs:[-0.2352,0.7606],targets:[0.3]},
  {inputs:[0.6226,-1.2583],targets:[0]},
  {inputs:[0.4787,0.9757],targets:[0]},
  {inputs:[-0.6386,0.2403],targets:[0.4]},
  {inputs:[1.0386,-0.086],targets:[0]},
  {inputs:[-0.3085,0.8891],targets:[0.3]},
  {inputs:[0.3411,-0.4807],targets:[0.1]},
  {inputs:[-0.092,0.0763],targets:[0.4]},
  {inputs:[1.2892,-0.851],targets:[0]},
  {inputs:[0.2458,-1.1061],targets:[0]},
  {inputs:[0.3747,0.7682],targets:[0.3]},
  {inputs:[-0.1722,0.2505],targets:[0.3]},
  {inputs:[0.8705,-0.281],targets:[0.2]},
  {inputs:[0.231,-0.8605],targets:[0.1]},
  {inputs:[1.239,-0.8287],targets:[0]},
  {inputs:[0.4665,0.5414],targets:[0.2]},
  {inputs:[0.1736,0.1211],targets:[0.2]},
  {inputs:[0.3386,1.0298],targets:[0]},
  {inputs:[0.7061,-1.2996],targets:[0]},
  {inputs:[-1.143,-1.0515],targets:[0]},
  {inputs:[1.0649,-1.2998],targets:[0]},
  {inputs:[-1.2099,0.0623],targets:[0]},
  {inputs:[-1.1506,0.6373],targets:[0]},
  {inputs:[0.3485,-1.2957],targets:[0]},
  {inputs:[-0.2451,0.8476],targets:[0.3]},
  {inputs:[-0.4012,-0.7845],targets:[0.5]},
  {inputs:[0.6308,0.3969],targets:[0.2]},
  {inputs:[-1.1702,0.328],targets:[0]},
  {inputs:[0.233,0.9127],targets:[0.3]},
  {inputs:[0.2081,-0.2207],targets:[0.1]},
  {inputs:[0.2292,-0.2308],targets:[0.1]},
  {inputs:[0.235,-0.794],targets:[0.1]},
  {inputs:[-0.9486,0.539],targets:[0]},
  {inputs:[0.6048,-0.567],targets:[0.1]},
  {inputs:[1.1006,1.1526],targets:[0]},
  {inputs:[-0.1793,0.2505],targets:[0.3]},
  {inputs:[-0.4206,0.4321],targets:[0.4]},
  {inputs:[1.245,1.0171],targets:[0]},
  {inputs:[0.5023,-0.4073],targets:[0.1]},
  {inputs:[1.064,0.022],targets:[0]},
  {inputs:[1.0855,-0.6934],targets:[0]},
  {inputs:[-0.908,-0.4683],targets:[0]},
  {inputs:[1.2549,0.015],targets:[0]},
  {inputs:[1.2375,-1.2448],targets:[0]},
  {inputs:[0.3947,0.2691],targets:[0.2]},
  {inputs:[1.2707,-0.6484],targets:[0]},
  {inputs:[1.2043,-0.7179],targets:[0]},
  {inputs:[1.1589,-0.5037],targets:[0]},
  {inputs:[0.0324,-0.2864],targets:[0.1]},
  {inputs:[-0.7361,-0.5518],targets:[0.5]},
  {inputs:[1.1551,0.3303],targets:[0]},
  {inputs:[-0.4787,0.0274],targets:[0.4]},
  {inputs:[-0.3522,-0.1405],targets:[0.5]},
  {inputs:[-0.8418,0.1828],targets:[0.4]},
  {inputs:[1.0395,0.4137],targets:[0]},
  {inputs:[0.1054,1.0102],targets:[0]},
  {inputs:[0.227,0.9209],targets:[0.3]},
  {inputs:[-0.1462,0.3403],targets:[0.3]},
  {inputs:[-0.1174,0.229],targets:[0.3]},
  {inputs:[0.4168,0.3267],targets:[0.2]},
  {inputs:[-0.2372,-0.85],targets:[0.5]},
  {inputs:[-1.2859,0.5462],targets:[0]},
  {inputs:[-0.3065,-0.4509],targets:[0.5]},
  {inputs:[-1.2507,-0.9747],targets:[0]},
  {inputs:[0.3875,-0.5691],targets:[0.1]},
  {inputs:[-1.1882,-0.1053],targets:[0]},
  {inputs:[0.5193,-0.9449],targets:[0]},
  {inputs:[0.5418,-0.7405],targets:[0.1]},
  {inputs:[-0.5752,0.3137],targets:[0.4]},
  {inputs:[-0.4155,-0.3901],targets:[0.5]},
  {inputs:[0.3014,-0.0837],targets:[0.2]},
  {inputs:[0.8214,-1.0808],targets:[0]},
  {inputs:[-0.7815,-0.4011],targets:[0.5]},
  {inputs:[1.0002,0.9321],targets:[0]},
  {inputs:[1.1774,-0.089],targets:[0]},
  {inputs:[-0.847,0.4195],targets:[0.4]},
  {inputs:[0.2914,0.6553],targets:[0.3]},
  {inputs:[1.1449,-0.2463],targets:[0]},
  {inputs:[-0.3222,-0.8778],targets:[0.5]},
  {inputs:[1.0446,0.1906],targets:[0]},
  {inputs:[-0.848,-1.2096],targets:[0]},
  {inputs:[0.9294,-1.053],targets:[0]},
  {inputs:[0.0897,0.0591],targets:[0.2]},
  {inputs:[0.2551,1.2379],targets:[0]},
  {inputs:[0.0673,0.4552],targets:[0.3]},
  {inputs:[0.0634,1.0421],targets:[0]},
  {inputs:[0.9991,-1.0713],targets:[0]},
  {inputs:[-0.7144,1.0923],targets:[0]},
  {inputs:[-0.2912,0.5285],targets:[0.3]},
  {inputs:[0.0941,-0.1543],targets:[0.1]},
  {inputs:[-0.4563,-0.3332],targets:[0.5]},
  {inputs:[-0.4263,0.3768],targets:[0.4]},
  {inputs:[0.9661,0.9913],targets:[0]},
  {inputs:[-0.6804,0.2334],targets:[0.4]},
  {inputs:[-0.0195,0.0434],targets:[1]},
  {inputs:[0.595,0.1863],targets:[0.2]},
  {inputs:[-0.2375,1.2924],targets:[0]},
  {inputs:[-0.7236,-0.1846],targets:[0.4]},
  {inputs:[-1.19,-0.8981],targets:[0]},
  {inputs:[-1.1742,-0.9849],targets:[0]},
  {inputs:[-0.4187,0.6909],targets:[0.3]},
  {inputs:[0.0702,-0.1263],targets:[0.1]},
  {inputs:[-0.3144,1.2923],targets:[0]},
  {inputs:[0.5875,-0.1596],targets:[0.2]},
  {inputs:[-0.3938,0.6484],targets:[0.3]},
  {inputs:[-0.542,0.219],targets:[0.4]},
  {inputs:[-0.6137,-1.0068],targets:[0]},
  {inputs:[0.8955,-0.3176],targets:[0.1]},
  {inputs:[-0.9933,1.1656],targets:[0]},
  {inputs:[-1.1864,0.6561],targets:[0]},
  {inputs:[0.1953,-1.1298],targets:[0]},
  {inputs:[0.311,0.9777],targets:[0]},
  {inputs:[-0.8067,0.8911],targets:[0]},
  {inputs:[-0.7292,1.2273],targets:[0]},
  {inputs:[-0.1273,-0.2146],targets:[0.5]},
  {inputs:[-1.2455,-0.2734],targets:[0]},
  {inputs:[-1.1635,-0.3047],targets:[0]},
  {inputs:[-0.047,-0.2585],targets:[0.5]},
  {inputs:[-1.2574,1.202],targets:[0]},
  {inputs:[0.6907,-0.7027],targets:[0.1]},
  {inputs:[-0.9764,-0.806],targets:[0]},
  {inputs:[0.4918,0.7614],targets:[0.3]},
  {inputs:[1.2372,0.9153],targets:[0]},
  {inputs:[1.0071,-0.6606],targets:[0]},
  {inputs:[0.5367,0.0235],targets:[0.2]},
  {inputs:[0.8392,-0.7508],targets:[0]},
  {inputs:[-1.2957,0.888],targets:[0]},
  {inputs:[1.061,1.1231],targets:[0]},
  {inputs:[-0.711,-0.9478],targets:[0]},
  {inputs:[-1.272,1.1803],targets:[0]},
  {inputs:[0.4461,0.3458],targets:[0.2]},
  {inputs:[-1.0639,0.3507],targets:[0]},
  {inputs:[0.4889,0.7635],targets:[0.3]},
  {inputs:[-1.2617,0.9033],targets:[0]},
  {inputs:[-0.7115,0.0664],targets:[0.4]},
  {inputs:[-0.3397,-1.0978],targets:[0]},
  {inputs:[-0.5867,1.0404],targets:[0]},
  {inputs:[1.2789,0.1476],targets:[0]},
  {inputs:[-0.7656,-1.2125],targets:[0]},
  {inputs:[0.8072,-1.1971],targets:[0]},
  {inputs:[1.108,-0.4235],targets:[0]},
  {inputs:[1.1764,1.1688],targets:[0]},
  {inputs:[0.698,-0.9168],targets:[0]},
  {inputs:[-0.3632,-0.566],targets:[0.5]},
  {inputs:[-1.1208,0.3586],targets:[0]},
  {inputs:[0.114,0.2607],targets:[0.3]},
  {inputs:[0.4109,0.2356],targets:[0.2]},
  {inputs:[-1.1337,0.9945],targets:[0]},
  {inputs:[0.48,0.3223],targets:[0.2]},
  {inputs:[-0.2146,0.8012],targets:[0.3]},
  {inputs:[-0.7166,-0.1941],targets:[0.4]},
  {inputs:[-1.0331,1.1406],targets:[0]},
  {inputs:[-0.7823,-0.6996],targets:[0]},
  {inputs:[0.2769,0.283],targets:[0.2]},
  {inputs:[0.1522,-0.1908],targets:[0.1]},
  {inputs:[-0.2462,-0.3846],targets:[0.5]},
  {inputs:[-0.1845,0.5832],targets:[0.3]},
  {inputs:[-1.0905,0.3184],targets:[0]},
  {inputs:[0.3889,0.3861],targets:[0.2]},
  {inputs:[0.9829,0.9221],targets:[0]},
  {inputs:[-0.0375,0.7232],targets:[0.3]},
  {inputs:[-0.9182,-0.1067],targets:[0.4]},
  {inputs:[0.3982,-0.2592],targets:[0.1]},
  {inputs:[-0.7939,1.2452],targets:[0]},
  {inputs:[1.0974,-0.1754],targets:[0]},
  {inputs:[1.1023,1.0549],targets:[0]},
  {inputs:[-1.0483,-0.0089],targets:[0]},
  {inputs:[0.9504,-0.5957],targets:[0]},
  {inputs:[-0.0178,0.7757],targets:[0.3]},
  {inputs:[-0.4059,0.5818],targets:[0.3]},
  {inputs:[-0.3762,1.1889],targets:[0]},
  {inputs:[-1.1392,1.1668],targets:[0]},
  {inputs:[0.6261,-0.1042],targets:[0.2]},
  {inputs:[-0.5284,-0.6037],targets:[0.5]},
  {inputs:[-0.3428,-0.5985],targets:[0.5]},
  {inputs:[-0.7614,-1.223],targets:[0]},
  {inputs:[0.5439,-0.8959],targets:[0]},
  {inputs:[-0.631,-1.2005],targets:[0]},
  {inputs:[0.7735,-1.0672],targets:[0]},
  {inputs:[0.6067,0.1288],targets:[0.2]},
  {inputs:[-0.1222,-0.4282],targets:[0.5]},
  {inputs:[0.3712,0.2373],targets:[0.2]},
  {inputs:[-0.518,0.7328],targets:[0.3]},
  {inputs:[0.9688,0.6232],targets:[0]},
  {inputs:[0.4318,-0.0482],targets:[0.2]},
  {inputs:[-0.3444,0.2557],targets:[0.4]},
  {inputs:[1.253,-0.5233],targets:[0]},
  {inputs:[-0.2313,-0.231],targets:[0.5]},
  {inputs:[-0.5407,0.4668],targets:[0.4]},
  {inputs:[-0.3787,-0.8068],targets:[0.5]},
  {inputs:[0.3758,0.756],targets:[0.3]},
  {inputs:[0.1573,1.2701],targets:[0]},
  {inputs:[0.9627,1.0551],targets:[0]},
  {inputs:[0.2465,0.0219],targets:[0.2]},
  {inputs:[-0.2897,0.9232],targets:[0.3]},
  {inputs:[-0.6447,-1.1427],targets:[0]},
  {inputs:[0.2756,-1.2512],targets:[0]},
  {inputs:[-0.9628,0.59],targets:[0]},
  {inputs:[-0.8624,-0.6809],targets:[0]},
  {inputs:[-0.8509,-0.304],targets:[0.5]},
  {inputs:[1.2193,-0.0484],targets:[0]},
  {inputs:[0.5637,0.9313],targets:[0]},
  {inputs:[0.8076,-0.6086],targets:[0]},
  {inputs:[0.8441,-0.3509],targets:[0.1]},
  {inputs:[-0.6352,-1.1476],targets:[0]},
  {inputs:[0.5794,0.6563],targets:[0.2]},
  {inputs:[1.0164,-0.0277],targets:[0]},
  {inputs:[-0.6434,0.3024],targets:[0.4]},
  {inputs:[0.3526,-0.5852],targets:[0.1]},
  {inputs:[1.0207,0.771],targets:[0]},
  {inputs:[0.3309,0.328],targets:[0.2]},
  {inputs:[0.0323,1.0734],targets:[0]},
  {inputs:[-0.2409,1.1913],targets:[0]},
  {inputs:[0.8298,-1.0762],targets:[0]},
  {inputs:[0.9772,0.5685],targets:[0]},
  {inputs:[0.8713,-0.6687],targets:[0]},
  {inputs:[-0.9915,0.8816],targets:[0]},
  {inputs:[-0.2804,0.1733],targets:[0.4]},
  {inputs:[0.9514,-0.2351],targets:[0.2]},
  {inputs:[-0.3463,0.0903],targets:[0.4]},
  {inputs:[-1.1845,-0.5517],targets:[0]},
  {inputs:[1.2127,1.1973],targets:[0]},
  {inputs:[0.1761,0.0816],targets:[0.2]},
  {inputs:[-0.7894,-1.0764],targets:[0]},
  {inputs:[0.9819,-0.556],targets:[0]},
  {inputs:[-0.552,1.2906],targets:[0]},
  {inputs:[0.4197,-0.6578],targets:[0.1]},
  {inputs:[-0.5082,-0.7605],targets:[0.5]},
  {inputs:[-0.7143,1.0282],targets:[0]},
  {inputs:[1.2695,0.3705],targets:[0]},
  {inputs:[-0.295,0.6601],targets:[0.3]},
  {inputs:[-0.8446,0.2001],targets:[0.4]},
  {inputs:[-0.1019,0.2416],targets:[0.3]},
  {inputs:[-0.3807,-0.0282],targets:[0.4]},
  {inputs:[-0.0631,-0.0264],targets:[1]},
  {inputs:[0.4159,-0.7355],targets:[0.1]},
  {inputs:[0.4779,0.8072],targets:[0.3]},
  {inputs:[0.3069,-0.9451],targets:[0.1]},
  {inputs:[-0.4405,-0.8471],targets:[0.5]},
  {inputs:[0.9713,-1.0408],targets:[0]},
  {inputs:[0.0809,0.6655],targets:[0.3]},
  {inputs:[-0.576,-1.224],targets:[0]},
  {inputs:[-0.0027,-1.118],targets:[0]},
  {inputs:[0.759,-0.0617],targets:[0.2]},
  {inputs:[-0.6873,0.3113],targets:[0.4]},
  {inputs:[0.1568,0.0679],targets:[0.2]},
  {inputs:[0.8819,1.2453],targets:[0]},
  {inputs:[-0.8563,-1.2942],targets:[0]},
  {inputs:[0.8471,0.749],targets:[0]},
  {inputs:[0.0608,-1.0898],targets:[0]},
  {inputs:[-0.5924,-0.6829],targets:[0.5]},
  {inputs:[0.7971,-0.0971],targets:[0.2]},
  {inputs:[-0.9589,-0.5563],targets:[0]},
  {inputs:[0.3202,0.5985],targets:[0.3]},
  {inputs:[0.6067,1.2066],targets:[0]},
  {inputs:[-0.0165,0.9316],targets:[0.3]},
  {inputs:[1.0709,0.5292],targets:[0]},
  {inputs:[0.9215,-0.3561],targets:[0.1]},
  {inputs:[-0.7925,-1.1448],targets:[0]},
  {inputs:[0.0169,0.3177],targets:[0.3]},
  {inputs:[-0.5779,1.2189],targets:[0]},
  {inputs:[1.2187,0.58],targets:[0]},
  {inputs:[1.2422,-0.6691],targets:[0]},
  {inputs:[0.7683,-1.1177],targets:[0]},
  {inputs:[-0.5199,0.0419],targets:[0.4]},
  {inputs:[0.3509,1.2994],targets:[0]},
  {inputs:[0.6778,0.6456],targets:[0.2]},
  {inputs:[0.8111,1.2843],targets:[0]},
  {inputs:[0.7892,0.9338],targets:[0]},
  {inputs:[0.2622,1.0527],targets:[0]},
  {inputs:[-0.3259,0.1474],targets:[0.4]},
  {inputs:[-1.1912,-0.3423],targets:[0]},
  {inputs:[-0.7797,0.622],targets:[0.4]},
  {inputs:[-0.7544,0.4593],targets:[0.4]},
  {inputs:[-0.7247,0.7254],targets:[0]},
  {inputs:[-0.5264,-1.246],targets:[0]},
  {inputs:[-0.9194,-0.8068],targets:[0]},
  {inputs:[1.1527,1.2209],targets:[0]},
  {inputs:[-0.4074,-0.4414],targets:[0.5]},
  {inputs:[1.0353,0.6345],targets:[0]},
  {inputs:[-0.7135,-0.4368],targets:[0.5]},
  {inputs:[-0.8577,0.2104],targets:[0.4]},
  {inputs:[1.036,0.5251],targets:[0]},
  {inputs:[0.7857,0.8779],targets:[0]},
  {inputs:[0.5081,0.5698],targets:[0.2]},
  {inputs:[-0.6625,-0.6244],targets:[0.5]},
  {inputs:[-0.229,-0.7099],targets:[0.5]},
  {inputs:[1.1954,-0.89],targets:[0]},
  {inputs:[0.1623,0.8374],targets:[0.3]},
  {inputs:[-0.4237,1.0599],targets:[0]},
  {inputs:[1.162,0.5594],targets:[0]},
  {inputs:[-0.8218,-0.7847],targets:[0]},
  {inputs:[0.0209,1.0067],targets:[0]},
  {inputs:[-0.2594,0.8614],targets:[0.3]},
  {inputs:[-1.1343,-1.1958],targets:[0]},
  {inputs:[0.302,-0.2956],targets:[0.1]},
  {inputs:[-0.9613,0.3371],targets:[0]},
  {inputs:[0.9718,-0.7795],targets:[0]},
  {inputs:[-1.1012,-1.2107],targets:[0]},
  {inputs:[-0.7954,-0.6684],targets:[0]},
  {inputs:[1.1401,1.0387],targets:[0]},
  {inputs:[-0.2692,-0.0071],targets:[0.4]},
  {inputs:[-0.4344,0.0146],targets:[0.4]},
  {inputs:[-0.7051,-0.617],targets:[0.5]},
  {inputs:[0.4897,-0.0712],targets:[0.2]},
  {inputs:[-0.0499,1.2327],targets:[0]},
  {inputs:[0.0918,-1.1362],targets:[0]},
  {inputs:[1.0266,0.0279],targets:[0]},
  {inputs:[0.3945,-0.9963],targets:[0]},
  {inputs:[-0.9213,0.1295],targets:[0.4]},
  {inputs:[1.2386,-0.4517],targets:[0]},
  {inputs:[-0.6944,-0.7302],targets:[0]},
  {inputs:[-0.0497,-0.251],targets:[0.5]},
  {inputs:[-0.4166,0.0602],targets:[0.4]},
  {inputs:[-0.1357,-1.1173],targets:[0]},
  {inputs:[-0.0123,0.6317],targets:[0.3]},
  {inputs:[-0.9535,-1.2377],targets:[0]},
  {inputs:[-0.5666,-0.7137],targets:[0.5]},
  {inputs:[-0.1718,1.0933],targets:[0]},
  {inputs:[0.9825,0.338],targets:[0]},
  {inputs:[-0.2169,0.3482],targets:[0.3]},
  {inputs:[-0.7305,1.0843],targets:[0]},
  {inputs:[-0.7833,0.5119],targets:[0.4]},
  {inputs:[0.8444,0.0395],targets:[0.2]},
  {inputs:[0.2936,-0.4091],targets:[0.1]},
  {inputs:[0.4072,0.1844],targets:[0.2]},
  {inputs:[-0.6408,-0.025],targets:[0.4]},
  {inputs:[-0.7099,-0.3346],targets:[0.5]},
  {inputs:[-0.1026,-0.9478],targets:[0.5]},
  {inputs:[-0.0111,-0.4232],targets:[0.5]},
  {inputs:[-0.6787,-0.3513],targets:[0.5]},
  {inputs:[-0.4682,-0.6686],targets:[0.5]},
  {inputs:[0.731,-1.1875],targets:[0]},
  {inputs:[-0.1774,0.8427],targets:[0.3]},
  {inputs:[0.4212,-0.1104],targets:[0.2]},
  {inputs:[-1.0707,0.1632],targets:[0]},
  {inputs:[-0.9713,-0.8172],targets:[0]},
  {inputs:[0.8491,-0.7191],targets:[0]},
  {inputs:[0.1589,-0.2431],targets:[0.1]},
  {inputs:[0.6997,0.1863],targets:[0.2]},
  {inputs:[-0.0151,0.844],targets:[0.3]},
  {inputs:[0.317,-0.2882],targets:[0.1]},
  {inputs:[-0.6805,0.4881],targets:[0.4]},
  {inputs:[1.1143,1.1279],targets:[0]},
  {inputs:[0.7003,0.7829],targets:[0]},
  {inputs:[0.3685,-0.8136],targets:[0.1]},
  {inputs:[-0.8212,-0.9826],targets:[0]},
  {inputs:[1.0707,0.5571],targets:[0]},
  {inputs:[-0.0421,0.1246],targets:[0.3]},
  {inputs:[-0.5458,0.2737],targets:[0.4]},
  {inputs:[0.9717,-0.4819],targets:[0]},
  {inputs:[-0.2181,1.2863],targets:[0]},
  {inputs:[0.9765,0.6075],targets:[0]},
  {inputs:[-1.2676,0.0712],targets:[0]},
  {inputs:[1.0894,-0.6915],targets:[0]},
  {inputs:[-1.0227,-1.1588],targets:[0]},
  {inputs:[-0.1922,-0.5702],targets:[0.5]},
  {inputs:[0.8724,0.9264],targets:[0]},
  {inputs:[0.2718,-1.154],targets:[0]},
  {inputs:[1.1284,-0.4241],targets:[0]},
  {inputs:[0.2845,-0.4378],targets:[0.1]},
  {inputs:[-0.0453,0.7679],targets:[0.3]},
  {inputs:[0.6023,0.9081],targets:[0]},
  {inputs:[-0.4779,-0.831],targets:[0.5]},
  {inputs:[-1.0339,-0.0182],targets:[0]},
  {inputs:[-0.7416,0.7172],targets:[0]},
  {inputs:[0.1391,0.2654],targets:[0.3]},
  {inputs:[1.1134,0.3472],targets:[0]},
  {inputs:[0.6222,-0.5552],targets:[0.1]},
  {inputs:[-0.8872,-1.1595],targets:[0]},
  {inputs:[-1.2464,0.7087],targets:[0]},
  {inputs:[-1.1358,-1.185],targets:[0]},
  {inputs:[-1.0991,-0.5521],targets:[0]},
  {inputs:[-0.0257,-0.127],targets:[0.5]},
  {inputs:[-1.0477,0.6219],targets:[0]},
  {inputs:[1.2035,-0.0528],targets:[0]},
  {inputs:[-0.0733,-0.3226],targets:[0.5]},
  {inputs:[-1.078,1.2712],targets:[0]},
  {inputs:[0.1961,-1.0812],targets:[0]},
  {inputs:[-0.8816,-1.0931],targets:[0]},
  {inputs:[-1.2098,-0.8051],targets:[0]},
  {inputs:[0.5938,0.5633],targets:[0.2]},
  {inputs:[-0.3041,-0.7538],targets:[0.5]},
  {inputs:[-0.2464,0.6621],targets:[0.3]},
  {inputs:[-0.9968,-0.8715],targets:[0]},
  {inputs:[-0.1467,1.1592],targets:[0]},
  {inputs:[-0.2484,-1.1256],targets:[0]},
  {inputs:[-1.0359,1.2141],targets:[0]},
  {inputs:[0.2153,1.2983],targets:[0]},
  {inputs:[-0.0979,-0.206],targets:[0.5]},
  {inputs:[-0.2245,-1.0338],targets:[0]},
  {inputs:[0.7719,0.4422],targets:[0.2]},
  {inputs:[-0.8328,1.0782],targets:[0]},
  {inputs:[1.1406,0.2799],targets:[0]},
  {inputs:[-0.1842,-0.5784],targets:[0.5]},
  {inputs:[0.5179,-0.7465],targets:[0.1]},
  {inputs:[-0.8184,0.4259],targets:[0.4]},
  {inputs:[1.1102,-0.312],targets:[0]},
  {inputs:[1.1428,-0.8364],targets:[0]},
  {inputs:[1.0546,-0.3608],targets:[0]},
  {inputs:[-0.2629,-0.2643],targets:[0.5]},
  {inputs:[-0.3568,0.0269],targets:[0.4]},
  {inputs:[1.2322,0.6864],targets:[0]},
  {inputs:[-0.1224,-1.1864],targets:[0]},
  {inputs:[-0.9068,-1.0553],targets:[0]},
  {inputs:[0.7806,0.0357],targets:[0.2]},
  {inputs:[-1.2236,0.6862],targets:[0]},
  {inputs:[0.6417,0.6214],targets:[0.2]},
  {inputs:[-0.0795,0.3973],targets:[0.3]},
  {inputs:[0.6004,0.9908],targets:[0]},
  {inputs:[-0.8502,0.7748],targets:[0]},
  {inputs:[-0.1806,0.0307],targets:[0.4]},
  {inputs:[1.2184,0.7379],targets:[0]},
  {inputs:[0.1637,-0.8067],targets:[0.1]},
  {inputs:[-0.127,-0.8901],targets:[0.5]},
  {inputs:[0.9977,1.1866],targets:[0]},
  {inputs:[0.1777,1.1821],targets:[0]},
  {inputs:[-0.5932,-0.8476],targets:[0]},
  {inputs:[0.5787,0.1563],targets:[0.2]},
  {inputs:[-1.0422,-0.8899],targets:[0]},
  {inputs:[0.0993,-0.9202],targets:[0.1]},
  {inputs:[1.2876,1.2017],targets:[0]},
  {inputs:[0.0879,-0.5135],targets:[0.1]},
  {inputs:[-0.0889,-0.1247],targets:[0.5]},
  {inputs:[-0.6483,-0.5699],targets:[0.5]},
  {inputs:[-0.532,-1.0224],targets:[0]},
  {inputs:[1.2714,-0.9478],targets:[0]},
  {inputs:[-0.0764,-1.1127],targets:[0]},
  {inputs:[-0.8636,1.1091],targets:[0]},
  {inputs:[-0.1861,0.0959],targets:[0.4]},
  {inputs:[0.7517,-0.31],targets:[0.1]},
  {inputs:[-0.0245,-0.6366],targets:[0.5]},
  {inputs:[-0.6942,0.259],targets:[0.4]},
  {inputs:[-0.0649,0.2125],targets:[0.3]},
  {inputs:[0.3028,-0.1615],targets:[0.1]},
  {inputs:[0.0689,-0.8799],targets:[0.1]},
  {inputs:[-0.0733,0.7088],targets:[0.3]},
  {inputs:[-0.4973,-0.2416],targets:[0.5]},
  {inputs:[0.3449,0.794],targets:[0.3]},
  {inputs:[0.889,-0.3911],targets:[0.1]},
  {inputs:[-0.1198,0.1794],targets:[0.3]},
  {inputs:[-0.9054,-0.2347],targets:[0.4]},
  {inputs:[0.4674,0.0944],targets:[0.2]},
  {inputs:[0.8644,-0.252],targets:[0.2]},
  {inputs:[0.3466,0.8004],targets:[0.3]},
  {inputs:[-0.2388,0.4968],targets:[0.3]},
  {inputs:[-0.049,0.455],targets:[0.3]},
  {inputs:[0.8224,0.5634],targets:[0.2]},
  {inputs:[0.4144,0.4415],targets:[0.2]},
  {inputs:[0.1406,0.4096],targets:[0.3]},
  {inputs:[0.4771,-0.1012],targets:[0.2]},
  {inputs:[-0.2189,0.4598],targets:[0.3]},
  {inputs:[0.2182,0.8243],targets:[0.3]},
  {inputs:[-0.9318,-0.1562],targets:[0.4]},
  {inputs:[0.565,0.6146],targets:[0.2]},
  {inputs:[-0.9431,-0.0457],targets:[0.4]},
  {inputs:[0.1036,-0.3774],targets:[0.1]},
  {inputs:[0.7219,0.3633],targets:[0.2]},
  {inputs:[0.2482,0.1539],targets:[0.2]},
  {inputs:[-0.3433,-0.9361],targets:[0.5]},
  {inputs:[-0.0052,-0.6096],targets:[0.5]},
  {inputs:[-0.1608,0.3792],targets:[0.3]},
  {inputs:[0.1734,-0.2963],targets:[0.1]},
  {inputs:[-0.1895,0.5345],targets:[0.3]},
  {inputs:[-0.807,0.2123],targets:[0.4]},
  {inputs:[0.3977,0.434],targets:[0.2]},
  {inputs:[-0.6315,-0.4727],targets:[0.5]},
  {inputs:[-0.2003,-0.8192],targets:[0.5]},
  {inputs:[-0.0637,0.1337],targets:[0.3]},
  {inputs:[-0.245,-0.6469],targets:[0.5]},
  {inputs:[0.2151,-0.2144],targets:[0.1]},
  {inputs:[0.1075,-0.7698],targets:[0.1]},
  {inputs:[-0.7484,-0.1879],targets:[0.4]},
  {inputs:[0.3664,0.8996],targets:[0.3]},
  {inputs:[-0.0103,-0.0811],targets:[1]},
  {inputs:[0.3352,-0.0262],targets:[0.2]},
  {inputs:[-0.9231,-0.0837],targets:[0.4]},
  {inputs:[0.0443,-0.0337],targets:[1]},
  {inputs:[0.2683,0.886],targets:[0.3]},
  {inputs:[0.2534,-0.0988],targets:[0.1]},
  {inputs:[0.3634,0.531],targets:[0.3]},
  {inputs:[-0.6313,0.5159],targets:[0.4]},
  {inputs:[0.2387,0.5294],targets:[0.3]},
  {inputs:[0.7641,-0.578],targets:[0.1]},
  {inputs:[0.1363,-0.1266],targets:[0.1]},
  {inputs:[-0.1823,0.5626],targets:[0.3]},
  {inputs:[0.7996,-0.3431],targets:[0.1]},
  {inputs:[0.6248,-0.3335],targets:[0.1]},
  {inputs:[0.216,-0.359],targets:[0.1]},
  {inputs:[-0.1552,-0.9763],targets:[0.5]},
  {inputs:[0.1832,-0.4493],targets:[0.1]},
  {inputs:[-0.943,-0.0287],targets:[0.4]},
  {inputs:[-0.1974,0.7195],targets:[0.3]},
  {inputs:[0.159,-0.2647],targets:[0.1]},
  {inputs:[0.9652,0.1808],targets:[0.2]},
  {inputs:[-0.6435,-0.5665],targets:[0.5]},
  {inputs:[-0.3112,-0.6466],targets:[0.5]},
  {inputs:[-0.1995,-0.3157],targets:[0.5]},
  {inputs:[-0.3899,-0.4575],targets:[0.5]},
  {inputs:[0.3255,0.2527],targets:[0.2]},
  {inputs:[-0.2797,0.0827],targets:[0.4]},
  {inputs:[-0.2213,0.3066],targets:[0.3]},
  {inputs:[0.6668,0.6044],targets:[0.2]},
  {inputs:[0.7866,0.1405],targets:[0.2]},
  {inputs:[0.2988,-0.1469],targets:[0.1]},
  {inputs:[0.0462,-0.2042],targets:[0.1]},
  {inputs:[-0.0025,0.4901],targets:[0.3]},
  {inputs:[-0.4763,-0.1644],targets:[0.5]},
  {inputs:[0.739,-0.0582],targets:[0.2]},
  {inputs:[-0.3167,-0.755],targets:[0.5]},
  {inputs:[-0.451,-0.4245],targets:[0.5]},
  {inputs:[0.6067,0.3178],targets:[0.2]},
  {inputs:[0.7533,-0.2511],targets:[0.1]},
  {inputs:[0.3953,0.1257],targets:[0.2]},
  {inputs:[0.3304,-0.9001],targets:[0.1]},
  {inputs:[0.4529,0.1661],targets:[0.2]},
  {inputs:[-0.3641,-0.6473],targets:[0.5]},
  {inputs:[0.1586,-0.6794],targets:[0.1]},
  {inputs:[0.1287,-0.227],targets:[0.1]},
  {inputs:[0.4316,0.4994],targets:[0.2]},
  {inputs:[0.9699,-0.052],targets:[0.2]},
  {inputs:[-0.1668,-0.8088],targets:[0.5]},
  {inputs:[-0.6937,0.3862],targets:[0.4]},
  {inputs:[-0.032,0.1591],targets:[0.3]},
  {inputs:[0.046,0.8997],targets:[0.3]},
  {inputs:[-0.1235,-0.8152],targets:[0.5]},
  {inputs:[0.4149,0.7015],targets:[0.3]},
  {inputs:[-0.9449,-0.0205],targets:[0.4]},
  {inputs:[0.0532,-0.9011],targets:[0.1]},
  {inputs:[0.3402,-0.3575],targets:[0.1]},
  {inputs:[0.745,0.1561],targets:[0.2]},
  {inputs:[-0.2855,-0.3353],targets:[0.5]},
  {inputs:[-0.1129,0.9417],targets:[0.3]},
  {inputs:[-0.3192,0.6747],targets:[0.3]},
  {inputs:[0.717,0.3367],targets:[0.2]},
  {inputs:[-0.5153,-0.112],targets:[0.4]},
  {inputs:[0.2175,0.2225],targets:[0.2]},
  {inputs:[0.2137,-0.3799],targets:[0.1]},
  {inputs:[0.1885,0.3506],targets:[0.3]},
  {inputs:[-0.8119,0.297],targets:[0.4]},
  {inputs:[0.5297,0.1965],targets:[0.2]},
  {inputs:[-0.4013,-0.6641],targets:[0.5]},
  {inputs:[0.5436,0.6531],targets:[0.2]},
  {inputs:[0.2771,-0.7329],targets:[0.1]},
  {inputs:[0.0957,-0.3528],targets:[0.1]},
  {inputs:[-0.1879,0.1062],targets:[0.4]},
  {inputs:[-0.4879,-0.3567],targets:[0.5]},
  {inputs:[0.5174,0.2242],targets:[0.2]},
  {inputs:[-0.5882,0.371],targets:[0.4]},
  {inputs:[-0.8383,0.1458],targets:[0.4]},
  {inputs:[-0.796,-0.5937],targets:[0.5]},
  {inputs:[-0.8611,-0.228],targets:[0.4]},
  {inputs:[-0.6694,-0.6924],targets:[0.5]},
  {inputs:[0.2865,-0.2619],targets:[0.1]},
  {inputs:[0.9249,0.2197],targets:[0.2]},
  {inputs:[0.5952,-0.2121],targets:[0.1]},
  {inputs:[-0.6342,-0.1903],targets:[0.4]},
  {inputs:[-0.1093,0.6645],targets:[0.3]},
  {inputs:[-0.388,0.6008],targets:[0.3]},
  {inputs:[-0.1508,0.9363],targets:[0.3]},
  {inputs:[0.1942,-0.4757],targets:[0.1]},
  {inputs:[0.2799,0.678],targets:[0.3]},
  {inputs:[-0.3851,0.7523],targets:[0.3]},
  {inputs:[-0.6066,-0.5534],targets:[0.5]},
  {inputs:[-0.8308,0.4827],targets:[0.4]},
  {inputs:[-0.3033,0.3425],targets:[0.4]},
  {inputs:[-0.0016,-0.5645],targets:[0.5]},
  {inputs:[-0.8913,0.046],targets:[0.4]},
  {inputs:[-0.0288,0.9364],targets:[0.3]},
  {inputs:[-0.1875,-0.0931],targets:[0.5]},
  {inputs:[-0.936,-0.1593],targets:[0.4]},
  {inputs:[0.3503,-0.7358],targets:[0.1]},
  {inputs:[-0.2899,-0.7539],targets:[0.5]},
  {inputs:[-0.518,0.4369],targets:[0.4]},
  {inputs:[0.3388,-0.3922],targets:[0.1]},
  {inputs:[-0.2639,0.2126],targets:[0.4]},
  {inputs:[0.8112,0.2614],targets:[0.2]},
  {inputs:[-0.4179,-0.7605],targets:[0.5]},
  {inputs:[-0.6368,0.0137],targets:[0.4]},
  {inputs:[-0.2726,0.2018],targets:[0.4]},
  {inputs:[0.5229,-0.2262],targets:[0.1]},
  {inputs:[-0.077,0.9935],targets:[0.3]},
  {inputs:[0.8737,0.2318],targets:[0.2]},
  {inputs:[-0.1413,-0.9344],targets:[0.5]},
  {inputs:[0.7979,0.0906],targets:[0.2]},
  {inputs:[0.4354,0.8801],targets:[0.3]},
  {inputs:[0.117,0.2149],targets:[0.3]},
  {inputs:[0.4407,-0.0953],targets:[0.2]},
  {inputs:[-0.0011,0.9242],targets:[0.3]},
  {inputs:[0.2183,0.0222],targets:[0.2]},
  {inputs:[-0.0635,-0.9937],targets:[0.5]},
  {inputs:[0.8756,-0.3332],targets:[0.1]},
  {inputs:[0.4124,-0.4599],targets:[0.1]},
  {inputs:[-0.4657,-0.8576],targets:[0.5]},
  {inputs:[0.0901,-0.4191],targets:[0.1]},
  {inputs:[-0.2458,-0.0893],targets:[0.5]},
  {inputs:[-0.2559,0.6983],targets:[0.3]},
  {inputs:[-0.0572,0.7373],targets:[0.3]},
  {inputs:[0.3097,0.5617],targets:[0.3]},
  {inputs:[0.3836,-0.7704],targets:[0.1]},
  {inputs:[-0.3431,-0.743],targets:[0.5]},
  {inputs:[-0.5117,-0.5137],targets:[0.5]},
  {inputs:[-0.7011,-0.2524],targets:[0.5]},
  {inputs:[0.0823,0.2978],targets:[0.3]},
  {inputs:[-0.1437,0.3213],targets:[0.3]},
  {inputs:[0.0413,0.4171],targets:[0.3]},
  {inputs:[0.2647,-0.1934],targets:[0.1]},
  {inputs:[-0.3188,-0.5438],targets:[0.5]},
  {inputs:[-0.8174,0.1606],targets:[0.4]},
  {inputs:[0.6356,-0.6672],targets:[0.1]},
  {inputs:[0.3147,-0.1225],targets:[0.1]},
  {inputs:[0.5535,-0.7998],targets:[0.1]},
  {inputs:[-0.4406,0.0319],targets:[0.4]},
  {inputs:[-0.576,0.0311],targets:[0.4]},
  {inputs:[-0.815,-0.0495],targets:[0.4]},
  {inputs:[-0.2587,-0.4588],targets:[0.5]},
  {inputs:[-0.5899,0.1979],targets:[0.4]},
  {inputs:[0.3445,0.1311],targets:[0.2]},
  {inputs:[-0.4071,0.1603],targets:[0.4]},
  {inputs:[0.339,-0.0557],targets:[0.2]},
  {inputs:[0.0309,0.5719],targets:[0.3]},
  {inputs:[0.7245,0.2336],targets:[0.2]},
  {inputs:[0.4926,0.6516],targets:[0.2]},
  {inputs:[-0.0069,0.3612],targets:[0.3]},
  {inputs:[-0.4817,-0.6997],targets:[0.5]},
  {inputs:[-0.6116,0.7762],targets:[0.4]},
  {inputs:[-0.5992,0.0181],targets:[0.4]},
  {inputs:[0.1618,-0.3299],targets:[0.1]},
  {inputs:[0.3812,0.2904],targets:[0.2]},
  {inputs:[-0.0932,0.3443],targets:[0.3]},
  {inputs:[-0.0495,-0.0224],targets:[1]},
  {inputs:[0.0138,0.0835],targets:[1]},
  {inputs:[-0.0239,0.041],targets:[1]},
  {inputs:[0.0439,-0.0277],targets:[1]},
  {inputs:[0.0251,0.0552],targets:[1]},
  {inputs:[0.0121,0.0408],targets:[1]},
  {inputs:[-0.0274,0.0824],targets:[1]},
  {inputs:[0.043,0.0897],targets:[1]},
  {inputs:[0.0333,-0.0574],targets:[1]},
  {inputs:[-0.0557,-0.0609],targets:[1]},
  {inputs:[0.0531,-0.0383],targets:[1]},
  {inputs:[-0.0107,-0.0138],targets:[1]},
  {inputs:[-0.0284,-0.0728],targets:[1]},
  {inputs:[0.0819,-0.0562],targets:[1]},
  {inputs:[0.0146,0.094],targets:[1]},
  {inputs:[-0.0523,0.084],targets:[1]},
  {inputs:[0.0068,0.0524],targets:[1]},
  {inputs:[0.0284,-0.0035],targets:[1]},
  {inputs:[0.0457,0.0518],targets:[1]},
  {inputs:[-0.0788,0.0261],targets:[1]},
  {inputs:[0.0234,-0.0385],targets:[1]},
  {inputs:[0.0315,0.0713],targets:[1]},
  {inputs:[0.0655,-0.0628],targets:[1]},
  {inputs:[-0.0645,-0.0254],targets:[1]},
  {inputs:[0.0367,0.0546],targets:[1]},
  {inputs:[-0.0381,0.0108],targets:[1]},
  {inputs:[-0.0238,-0.0169],targets:[1]},
  {inputs:[0.0742,0.0106],targets:[1]},
  {inputs:[-0.0332,0.0757],targets:[1]},
  {inputs:[0.032,-0.015],targets:[1]},
  {inputs:[0.0032,0.0369],targets:[1]},
  {inputs:[-0.0039,0.0357],targets:[1]},
  {inputs:[0.0865,0.016],targets:[1]},
  {inputs:[0.0734,-0.0329],targets:[1]},
  {inputs:[-0.0889,-0.0404],targets:[1]},
  {inputs:[-0.0336,-0.032],targets:[1]},
  {inputs:[-0.0462,-0.0153],targets:[1]},
  {inputs:[0.0003,0.011],targets:[1]},
  {inputs:[-0.0007,-0.0634],targets:[1]},
  {inputs:[0.0936,0.0289],targets:[1]},
  {inputs:[0.0489,0.0623],targets:[1]},
  {inputs:[-0.0187,-0.0253],targets:[1]},
  {inputs:[-0.0303,-0.0106],targets:[1]},
  {inputs:[-0.0021,-0.0071],targets:[1]},
  {inputs:[-0.0675,0.0073],targets:[1]},
  {inputs:[0.0968,-0.0156],targets:[1]},
  {inputs:[-0.0814,-0.0307],targets:[1]},
  {inputs:[0.0315,-0.03],targets:[1]},
  {inputs:[-0.0711,0.0545],targets:[1]},
  {inputs:[-0.0783,-0.0261],targets:[1]},
  {inputs:[-0.006,0.0561],targets:[1]},
  {inputs:[0.0694,-0.0046],targets:[1]},
  {inputs:[-0.0985,0.0105],targets:[1]},
  {inputs:[-0.0078,-0.0729],targets:[1]},
  {inputs:[0.0061,0.004],targets:[1]},
  {inputs:[0.0101,0.0128],targets:[1]},
  {inputs:[-0.0924,-0.0147],targets:[1]},
  {inputs:[-0.0709,0.0626],targets:[1]},
  {inputs:[0.0072,-0.0472],targets:[1]},
  {inputs:[-0.0108,0.0044],targets:[1]},
  {inputs:[0.0198,-0.0502],targets:[1]},
  {inputs:[0.0684,0.0093],targets:[1]},
  {inputs:[-0.0784,0.0131],targets:[1]},
  {inputs:[0.034,0.0384],targets:[1]},
  {inputs:[-0.0889,-0.015],targets:[1]},
  {inputs:[0.0831,-0.0047],targets:[1]},
  {inputs:[0.0281,-0.0523],targets:[1]},
  {inputs:[-0.0002,-0.0093],targets:[1]},
  {inputs:[0.0226,-0.0122],targets:[1]},
  {inputs:[0.0312,0.0449],targets:[1]},
  {inputs:[-0.0822,-0.0295],targets:[1]},
  {inputs:[0.0427,-0.0378],targets:[1]},
  {inputs:[-0.0799,-0.0541],targets:[1]},
  {inputs:[-0.0877,-0.0099],targets:[1]},
  {inputs:[-0.0617,-0.0501],targets:[1]},
  {inputs:[-0.0405,0.0078],targets:[1]},
  {inputs:[0.0495,0.0264],targets:[1]},
  {inputs:[0.0807,-0.0169],targets:[1]},
  {inputs:[0.0007,0.0046],targets:[1]},
  {inputs:[0.0561,0.0671],targets:[1]},
  {inputs:[0.0434,-0.0861],targets:[1]},
  {inputs:[0.0006,0.0617],targets:[1]},
  {inputs:[-0.0709,0.0692],targets:[1]},
  {inputs:[0.0966,0.0221],targets:[1]},
  {inputs:[0.023,0.0528],targets:[1]},
  {inputs:[0.0757,0.0195],targets:[1]},
  {inputs:[-0.0883,-0.0322],targets:[1]},
  {inputs:[-0.0375,0.0609],targets:[1]},
  {inputs:[-0.0779,-0.0198],targets:[1]},
  {inputs:[-0.0317,-0.088],targets:[1]},
  {inputs:[-0.0788,0.0113],targets:[1]},
  {inputs:[0.0569,0.0277],targets:[1]},
  {inputs:[-0.0151,-0.0679],targets:[1]},
  {inputs:[0.0729,-0.0126],targets:[1]},
  {inputs:[-0.0876,-0.0272],targets:[1]},
  {inputs:[-0.0131,-0.0943],targets:[1]},
  {inputs:[0.0842,0.037],targets:[1]},
  {inputs:[-0.0286,-0.0417],targets:[1]},
  {inputs:[-0.0258,-0.0685],targets:[1]},
  {inputs:[0.0419,-0.0539],targets:[1]},
  {inputs:[-0.6228,0.7925],targets:[0]},
  {inputs:[0.1063,0.4946],targets:[0.3]},
  {inputs:[-1.297,0.8256],targets:[0]},
  {inputs:[-1.2705,-1.0259],targets:[0]},
  {inputs:[-0.2689,0.4444],targets:[0.3]},
  {inputs:[-0.3479,-1.1326],targets:[0]},
  {inputs:[-0.419,0.5887],targets:[0.3]},
  {inputs:[-0.6421,-0.8124],targets:[0]},
  {inputs:[-0.1088,0.6916],targets:[0.3]},
  {inputs:[-0.0214,-0.5902],targets:[0.5]},
  {inputs:[0.1477,0.6819],targets:[0.3]},
  {inputs:[-0.3097,0.7111],targets:[0.3]},
  {inputs:[1.2256,0.0488],targets:[0]},
  {inputs:[-0.6216,1.2015],targets:[0]},
  {inputs:[-0.755,-0.1143],targets:[0.4]},
  {inputs:[0.4893,-0.2827],targets:[0.1]},
  {inputs:[-0.5262,-0.6702],targets:[0.5]},
  {inputs:[0.4959,-0.2751],targets:[0.1]},
  {inputs:[1.0476,-0.8],targets:[0]},
  {inputs:[0.823,-0.0369],targets:[0.2]},
  {inputs:[0.2743,0.5239],targets:[0.3]},
  {inputs:[0.6729,-0.5794],targets:[0.1]},
  {inputs:[0.2405,0.6977],targets:[0.3]},
  {inputs:[-0.1175,-0.8885],targets:[0.5]},
  {inputs:[-1.2458,0.3806],targets:[0]},
  {inputs:[1.2742,0.1153],targets:[0]},
  {inputs:[-0.5291,0.5769],targets:[0.4]},
  {inputs:[0.8344,-0.0012],targets:[0.2]},
  {inputs:[0.5189,-0.6385],targets:[0.1]},
  {inputs:[0.6339,0.2951],targets:[0.2]},
  {inputs:[0.6963,-0.9115],targets:[0]},
  {inputs:[0.6266,-1.0754],targets:[0]},
  {inputs:[-0.5842,0.3403],targets:[0.4]},
  {inputs:[-0.3267,-0.4295],targets:[0.5]},
  {inputs:[0.9062,-1.1261],targets:[0]},
  {inputs:[0.7248,-1.2049],targets:[0]},
  {inputs:[0.1711,0.1496],targets:[0.2]},
  {inputs:[0.5668,-1.2723],targets:[0]},
  {inputs:[1.2955,0.8638],targets:[0]},
  {inputs:[-0.8229,0.1906],targets:[0.4]},
  {inputs:[0.7651,1.1451],targets:[0]},
  {inputs:[-0.9421,-1.1032],targets:[0]},
  {inputs:[-0.2349,0.5004],targets:[0.3]},
  {inputs:[-0.0135,0.9591],targets:[0.3]},
  {inputs:[-0.2712,-0.1462],targets:[0.5]},
  {inputs:[-1.0948,-1.1892],targets:[0]},
  {inputs:[0.9211,-0.3595],targets:[0.1]},
  {inputs:[0.5794,1.0855],targets:[0]},
  {inputs:[0.6352,0.7762],targets:[0]},
  {inputs:[1.0276,-0.4428],targets:[0]},
  {inputs:[-1.2044,0.8815],targets:[0]},
  {inputs:[0.2644,0.8505],targets:[0.3]},
  {inputs:[-0.7826,1.279],targets:[0]},
  {inputs:[-0.3692,-1.2369],targets:[0]},
  {inputs:[0.0955,-0.4753],targets:[0.1]},
  {inputs:[-0.0913,-0.4342],targets:[0.5]},
  {inputs:[-0.8889,-0.0491],targets:[0.4]},
  {inputs:[0.5395,-0.9032],targets:[0]},
  {inputs:[0.1924,0.0002],targets:[0.2]},
  {inputs:[0.8848,0.4516],targets:[0.2]},
  {inputs:[0.2856,-0.7278],targets:[0.1]},
  {inputs:[-1.0904,1.2814],targets:[0]},
  {inputs:[-0.1623,0.106],targets:[0.4]},
  {inputs:[0.446,0.9546],targets:[0]},
  {inputs:[0.4661,-0.6067],targets:[0.1]},
  {inputs:[0.7399,-0.4547],targets:[0.1]},
  {inputs:[1.1357,0.6503],targets:[0]},
  {inputs:[1.1864,1.1596],targets:[0]},
  {inputs:[0.0151,-0.7396],targets:[0.1]},
  {inputs:[-0.3755,1.0236],targets:[0]},
  {inputs:[0.4637,-0.9014],targets:[0]},
  {inputs:[0.3826,0.9912],targets:[0]},
  {inputs:[-0.5355,-1.1819],targets:[0]},
  {inputs:[0.5186,-1.0163],targets:[0]},
  {inputs:[1.2455,-0.0916],targets:[0]},
  {inputs:[-0.2892,0.8218],targets:[0.3]},
  {inputs:[1.2962,0.8606],targets:[0]},
  {inputs:[1.2579,-0.3887],targets:[0]},
  {inputs:[-0.9606,-0.6099],targets:[0]},
  {inputs:[-0.831,-1.11],targets:[0]},
  {inputs:[0.4402,0.0133],targets:[0.2]},
  {inputs:[-0.8765,0.63],targets:[0]},
  {inputs:[-0.2539,-0.1988],targets:[0.5]},
  {inputs:[-0.0076,-1.0517],targets:[0]},
  {inputs:[0.7756,0.2166],targets:[0.2]},
  {inputs:[-0.7127,-0.4736],targets:[0.5]},
  {inputs:[-1.2328,-1.1067],targets:[0]},
  {inputs:[-1.1421,0.1553],targets:[0]},
  {inputs:[0.9255,0.1689],targets:[0.2]},
  {inputs:[0.9489,-0.1525],targets:[0.2]},
  {inputs:[-0.4198,0.9723],targets:[0]},
  {inputs:[0.1308,0.9558],targets:[0.3]},
  {inputs:[-0.7623,-0.1191],targets:[0.4]},
  {inputs:[0.3272,-1.0245],targets:[0]},
  {inputs:[0.1524,-1.1664],targets:[0]},
  {inputs:[0.4031,0.5852],targets:[0.3]},
  {inputs:[0.0364,-0.6798],targets:[0.1]},
  {inputs:[-0.3852,0.0347],targets:[0.4]},
  {inputs:[-0.2708,0.5951],targets:[0.3]},
  {inputs:[0.0597,1.0395],targets:[0]},
  {inputs:[0.8609,0.3571],targets:[0.2]},
  {inputs:[0.0253,0.0457],targets:[1]},
  {inputs:[1.0032,-0.6148],targets:[0]},
  {inputs:[-0.7078,-0.3227],targets:[0.5]},
  {inputs:[1.2273,-0.1857],targets:[0]},
  {inputs:[0.1542,0.6619],targets:[0.3]},
  {inputs:[0.9433,0.5639],targets:[0]},
  {inputs:[1.2705,-1.2603],targets:[0]},
  {inputs:[-1.1104,0.402],targets:[0]},
  {inputs:[0.6914,0.8712],targets:[0]},
  {inputs:[-0.1254,-0.4098],targets:[0.5]},
  {inputs:[0.0503,-0.9522],targets:[0.1]},
  {inputs:[-0.86,0.012],targets:[0.4]},
  {inputs:[-0.4905,0.1332],targets:[0.4]},
  {inputs:[-1.1518,0.742],targets:[0]},
  {inputs:[-1.0222,0.2648],targets:[0]},
  {inputs:[0.041,0.4656],targets:[0.3]},
  {inputs:[-0.5022,-0.8875],targets:[0]},
  {inputs:[-0.1501,0.3994],targets:[0.3]},
  {inputs:[0.6384,0.1838],targets:[0.2]},
  {inputs:[-0.4473,0.0742],targets:[0.4]},
  {inputs:[-1.169,0.1185],targets:[0]},
  {inputs:[-0.2575,-0.9024],targets:[0.5]},
  {inputs:[-0.6674,-0.9111],targets:[0]},
  {inputs:[0.2963,-1.1638],targets:[0]},
  {inputs:[0.9331,-1.0569],targets:[0]},
  {inputs:[0.1259,-0.2759],targets:[0.1]},
  {inputs:[-1.1798,0.9347],targets:[0]},
  {inputs:[-1.269,0.678],targets:[0]},
  {inputs:[0.8041,-0.4781],targets:[0.1]},
  {inputs:[0.806,0.3276],targets:[0.2]},
  {inputs:[1.2777,-0.3588],targets:[0]},
  {inputs:[-0.8926,0.946],targets:[0]},
  {inputs:[-0.9207,-0.6677],targets:[0]},
  {inputs:[0.5688,-0.643],targets:[0.1]},
  {inputs:[-0.6369,0.9981],targets:[0]},
  {inputs:[1.0907,0.4289],targets:[0]},
  {inputs:[-0.6998,-1.2909],targets:[0]},
  {inputs:[0.4365,-0.4369],targets:[0.1]},
  {inputs:[0.9122,-0.0619],targets:[0.2]},
  {inputs:[-0.1918,-0.563],targets:[0.5]},
  {inputs:[1.0802,-0.6488],targets:[0]},
  {inputs:[-0.9337,0.6364],targets:[0]},
  {inputs:[0.3072,1.1807],targets:[0]},
  {inputs:[0.6608,1.0644],targets:[0]},
  {inputs:[0.5016,-0.3636],targets:[0.1]},
  {inputs:[-0.3013,0.7126],targets:[0.3]},
  {inputs:[-0.1373,0.9798],targets:[0.3]},
  {inputs:[0.5694,0.7736],targets:[0.2]},
  {inputs:[-0.7707,-1.0847],targets:[0]},
  {inputs:[0.1487,-0.2125],targets:[0.1]},
  {inputs:[-1.028,-1.171],targets:[0]},
  {inputs:[1.139,-0.2436],targets:[0]},
  {inputs:[-1.0908,0.995],targets:[0]},
  {inputs:[-0.0223,-0.0901],targets:[1]},
  {inputs:[-0.6206,-0.3062],targets:[0.5]},
  {inputs:[1.0627,0.3526],targets:[0]},
  {inputs:[-0.6166,0.0948],targets:[0.4]},
  {inputs:[0.4584,-0.1026],targets:[0.2]},
  {inputs:[0.9855,0.7057],targets:[0]},
  {inputs:[0.4957,1.265],targets:[0]},
  {inputs:[0.0386,0.7413],targets:[0.3]},
  {inputs:[-0.3169,0.0693],targets:[0.4]},
  {inputs:[0.0702,0.8106],targets:[0.3]},
  {inputs:[-0.2198,1.0087],targets:[0]},
  {inputs:[0.8012,-0.6623],targets:[0]},
  {inputs:[0.1277,0.61],targets:[0.3]},
  {inputs:[-0.7354,-1.1456],targets:[0]},
  {inputs:[-0.7064,-0.2497],targets:[0.5]},
  {inputs:[-0.1591,0.0237],targets:[0.4]},
  {inputs:[-0.2398,-1.191],targets:[0]},
  {inputs:[0.9637,1.1744],targets:[0]},
  {inputs:[-0.8025,-1.0093],targets:[0]},
  {inputs:[0.6899,-0.9934],targets:[0]},
  {inputs:[0.0751,0.6813],targets:[0.3]},
  {inputs:[0.7436,-0.9552],targets:[0]},
  {inputs:[-1.1112,0.5892],targets:[0]},
  {inputs:[0.5226,1.1227],targets:[0]},
  {inputs:[-0.0502,0.7978],targets:[0.3]},
  {inputs:[-0.3902,0.0952],targets:[0.4]},
  {inputs:[0.9468,0.4828],targets:[0]},
  {inputs:[0.2904,-1.1341],targets:[0]},
  {inputs:[-0.1625,0.5349],targets:[0.3]},
  {inputs:[-0.4205,1.0637],targets:[0]},
  {inputs:[-0.4807,1.0386],targets:[0]},
  {inputs:[1.0712,0.7621],targets:[0]},
  {inputs:[0.0632,-0.8378],targets:[0.1]},
  {inputs:[0.9354,-0.6262],targets:[0]},
  {inputs:[1.1327,1.24],targets:[0]},
  {inputs:[-0.168,-1.2804],targets:[0]},
  {inputs:[0.5017,-1.0318],targets:[0]},
  {inputs:[-0.8723,-0.2329],targets:[0.4]},
  {inputs:[-0.1333,-0.3573],targets:[0.5]},
  {inputs:[-1.0434,0.735],targets:[0]},
  {inputs:[-0.851,1.1626],targets:[0]},
  {inputs:[0.5452,1.1973],targets:[0]},
  {inputs:[0.7952,0.7599],targets:[0]},
  {inputs:[0.8609,-0.2213],targets:[0.2]},
  {inputs:[-0.9974,-0.3267],targets:[0]},
  {inputs:[0.3726,1.2603],targets:[0]},
  {inputs:[0.9813,-1.0498],targets:[0]},
  {inputs:[0.793,-0.9771],targets:[0]},
  {inputs:[0.0986,0.6709],targets:[0.3]},
  {inputs:[0.5723,-1.1537],targets:[0]},
  {inputs:[-0.6717,-0.9398],targets:[0]},
  {inputs:[-1.275,-0.3986],targets:[0]},
  {inputs:[-0.1326,-0.7523],targets:[0.5]},
  {inputs:[-0.4128,-0.1615],targets:[0.5]},
  {inputs:[-0.0582,-1.2394],targets:[0]},
  {inputs:[-0.1428,-0.8191],targets:[0.5]},
  {inputs:[-0.9175,0.7711],targets:[0]},
  {inputs:[0.4524,-0.2171],targets:[0.1]},
  {inputs:[-0.1111,-1.1064],targets:[0]},
  {inputs:[1.1591,-0.3369],targets:[0]},
  {inputs:[0.5414,-0.9818],targets:[0]},
  {inputs:[0.5872,0.1095],targets:[0.2]},
  {inputs:[-0.4993,-0.03],targets:[0.4]},
  {inputs:[-0.9477,-0.442],targets:[0]},
  {inputs:[-0.8826,0.8524],targets:[0]},
  {inputs:[-0.0558,-0.2076],targets:[0.5]},
  {inputs:[1.1697,-0.5856],targets:[0]},
  {inputs:[0.4631,-0.383],targets:[0.1]},
  {inputs:[-1.2423,1.1528],targets:[0]},
  {inputs:[-0.5617,-0.6175],targets:[0.5]},
  {inputs:[-1.2123,0.5977],targets:[0]},
  {inputs:[-0.9819,-0.6963],targets:[0]},
  {inputs:[0.0033,0.614],targets:[0.3]},
  {inputs:[-0.3299,-1.2082],targets:[0]},
  {inputs:[-0.866,1.2715],targets:[0]},
  {inputs:[0.4561,-0.1719],targets:[0.1]},
  {inputs:[-0.6053,0.4476],targets:[0.4]},
  {inputs:[-0.8801,-0.9488],targets:[0]},
  {inputs:[0.4609,-1.1879],targets:[0]},
  {inputs:[-0.0659,-0.3001],targets:[0.5]},
  {inputs:[0.3293,0.6966],targets:[0.3]},
  {inputs:[0.9484,-0.5732],targets:[0]},
  {inputs:[0.0004,0.1639],targets:[0.3]},
  {inputs:[0.4758,1.2196],targets:[0]},
  {inputs:[0.5937,-0.7624],targets:[0.1]},
  {inputs:[0.7629,-0.8342],targets:[0]},
  {inputs:[1.0652,-0.0369],targets:[0]},
  {inputs:[0.0965,1.2269],targets:[0]},
  {inputs:[0.7624,0.216],targets:[0.2]},
  {inputs:[0.0399,0.0344],targets:[1]},
  {inputs:[0.1821,1.1567],targets:[0]},
  {inputs:[-0.4465,0.9603],targets:[0]},
  {inputs:[-0.2823,0.7658],targets:[0.3]},
  {inputs:[1.1255,0.4045],targets:[0]},
  {inputs:[-1.0704,0.8822],targets:[0]},
  {inputs:[1.2854,-1.2693],targets:[0]},
  {inputs:[-1.2516,-1.0756],targets:[0]},
  {inputs:[-0.3119,0.2356],targets:[0.4]},
  {inputs:[1.1275,-0.0008],targets:[0]},
  {inputs:[-0.6584,0.4846],targets:[0.4]},
  {inputs:[0.4772,-1.0878],targets:[0]},
  {inputs:[1.1836,0.8727],targets:[0]},
  {inputs:[-0.95,0.3773],targets:[0]},
  {inputs:[1.2238,-0.1284],targets:[0]},
  {inputs:[-1.186,-0.4978],targets:[0]},
  {inputs:[0.3706,-0.604],targets:[0.1]},
  {inputs:[0.688,-1.0112],targets:[0]},
  {inputs:[-0.3484,-0.5989],targets:[0.5]},
  {inputs:[0.9194,-0.4078],targets:[0]},
  {inputs:[0.465,0.9587],targets:[0]},
  {inputs:[-1.2123,-0.7724],targets:[0]},
  {inputs:[-0.5848,-0.9689],targets:[0]},
  {inputs:[-0.0898,-0.3388],targets:[0.5]},
  {inputs:[0.2699,-0.0654],targets:[0.2]},
  {inputs:[-0.6707,-0.8968],targets:[0]},
  {inputs:[0.8502,-0.4521],targets:[0.1]},
  {inputs:[-0.4323,-1.0088],targets:[0]},
  {inputs:[-0.1116,-1.2246],targets:[0]},
  {inputs:[-0.2678,-0.3015],targets:[0.5]},
  {inputs:[0.8991,0.0143],targets:[0.2]},
  {inputs:[-0.4752,-0.5314],targets:[0.5]},
  {inputs:[0.3108,0.6928],targets:[0.3]},
  {inputs:[0.1241,0.105],targets:[0.2]},
  {inputs:[0.8786,0.4878],targets:[0]},
  {inputs:[0.8757,0.209],targets:[0.2]},
  {inputs:[0.1058,0.8277],targets:[0.3]},
  {inputs:[0.5893,0.7623],targets:[0.2]},
  {inputs:[-1.2652,-0.1919],targets:[0]},
  {inputs:[0.189,0.3772],targets:[0.3]},
  {inputs:[0.3729,0.1107],targets:[0.2]},
  {inputs:[-0.1162,-1.1656],targets:[0]},
  {inputs:[-1.0599,0.3715],targets:[0]},
  {inputs:[-1.2522,0.6255],targets:[0]},
  {inputs:[0.4234,-0.2591],targets:[0.1]},
  {inputs:[1.008,0.5052],targets:[0]},
  {inputs:[0.5744,-0.1901],targets:[0.1]},
  {inputs:[1.1008,1.1929],targets:[0]},
  {inputs:[0.4163,-0.9078],targets:[0.1]},
  {inputs:[-0.5464,-0.5545],targets:[0.5]},
  {inputs:[-0.485,-0.4707],targets:[0.5]},
  {inputs:[1.0955,-1.0533],targets:[0]},
  {inputs:[-1.2384,-0.5878],targets:[0]},
  {inputs:[0.2709,1.0313],targets:[0]},
  {inputs:[0.5116,-0.7133],targets:[0.1]},
  {inputs:[0.1967,-0.8506],targets:[0.1]},
  {inputs:[-0.9783,-1.2549],targets:[0]},
  {inputs:[0.2112,-1.2489],targets:[0]},
  {inputs:[0.5023,-1.2595],targets:[0]},
  {inputs:[-0.7028,0.1982],targets:[0.4]},
  {inputs:[0.8054,-0.8819],targets:[0]},
  {inputs:[-1.0523,-1.1478],targets:[0]},
  {inputs:[-0.6167,-1.1947],targets:[0]},
  {inputs:[-0.499,-1.255],targets:[0]},
  {inputs:[0.9039,0.2997],targets:[0.2]},
  {inputs:[0.7265,-0.1769],targets:[0.2]},
  {inputs:[-0.2262,0.8335],targets:[0.3]},
  {inputs:[1.0437,-1.0709],targets:[0]},
  {inputs:[1.292,-1.1133],targets:[0]},
  {inputs:[0.0516,-0.706],targets:[0.1]},
  {inputs:[-0.8481,-1.0186],targets:[0]},
  {inputs:[0.5853,0.3244],targets:[0.2]},
  {inputs:[-0.6378,-0.9845],targets:[0]},
  {inputs:[-0.7054,-0.337],targets:[0.5]},
  {inputs:[1.2323,1.2819],targets:[0]},
  {inputs:[0.2243,-1.0685],targets:[0]},
  {inputs:[-0.065,0.0646],targets:[1]},
  {inputs:[0.9408,-0.4676],targets:[0]},
  {inputs:[-0.6627,1.1676],targets:[0]},
  {inputs:[1.2919,1.2844],targets:[0]},
  {inputs:[1.1412,0.1601],targets:[0]},
  {inputs:[-0.4685,0.2385],targets:[0.4]},
  {inputs:[-0.0822,-0.3214],targets:[0.5]},
  {inputs:[-1.0142,0.6105],targets:[0]},
  {inputs:[-0.3632,-1.2786],targets:[0]},
  {inputs:[-1.011,0.5687],targets:[0]},
  {inputs:[0.1112,0.1302],targets:[0.2]},
  {inputs:[0.9144,0.4076],targets:[0]},
  {inputs:[1.0205,1.166],targets:[0]},
  {inputs:[-0.1217,-0.3436],targets:[0.5]},
  {inputs:[0.7821,0.2433],targets:[0.2]},
  {inputs:[-0.4727,0.5419],targets:[0.4]},
  {inputs:[0.8193,-0.7527],targets:[0]},
  {inputs:[0.0911,0.7071],targets:[0.3]},
  {inputs:[-1.2791,0.7648],targets:[0]},
  {inputs:[-1.0433,0.7913],targets:[0]},
  {inputs:[1.2917,0.2674],targets:[0]},
  {inputs:[-0.904,-0.2763],targets:[0.4]},
  {inputs:[0.7587,0.6292],targets:[0.2]},
  {inputs:[0.2645,-0.3158],targets:[0.1]},
  {inputs:[-0.9277,0.8022],targets:[0]},
  {inputs:[-0.1106,0.029],targets:[0.4]},
  {inputs:[0.6068,-0.0917],targets:[0.2]},
  {inputs:[0.8118,0.7262],targets:[0]},
  {inputs:[-0.5943,1.2143],targets:[0]},
  {inputs:[0.0322,1.0785],targets:[0]},
  {inputs:[-1.2089,-1.0451],targets:[0]},
  {inputs:[0.272,0.6387],targets:[0.3]},
  {inputs:[0.5873,-0.5787],targets:[0.1]},
  {inputs:[-0.0216,-0.8786],targets:[0.5]},
  {inputs:[0.6324,-0.0561],targets:[0.2]},
  {inputs:[0.2377,-0.8043],targets:[0.1]},
  {inputs:[-0.3243,-0.7924],targets:[0.5]},
  {inputs:[-0.4342,-0.8893],targets:[0.5]},
  {inputs:[-0.796,-0.1474],targets:[0.4]},
  {inputs:[0.2739,0.2054],targets:[0.2]},
  {inputs:[-0.7159,0.134],targets:[0.4]},
  {inputs:[0.5233,-0.3999],targets:[0.1]},
  {inputs:[-0.8595,-0.1384],targets:[0.4]},
  {inputs:[0.1935,-0.099],targets:[0.1]},
  {inputs:[-0.059,0.1346],targets:[0.3]},
  {inputs:[0.5872,-0.128],targets:[0.2]},
  {inputs:[-0.3535,0.5311],targets:[0.3]},
  {inputs:[-0.3239,-0.8981],targets:[0.5]},
  {inputs:[-0.1591,0.9363],targets:[0.3]},
  {inputs:[0.0711,0.0843],targets:[0.2]},
  {inputs:[0.1819,-0.5932],targets:[0.1]},
  {inputs:[-0.143,-0.1797],targets:[0.5]},
  {inputs:[0.1467,0.6551],targets:[0.3]},
  {inputs:[0.2078,-0.0954],targets:[0.1]},
  {inputs:[0.7063,0.6174],targets:[0.2]},
  {inputs:[-0.9661,0.0188],targets:[0.4]},
  {inputs:[0.4494,0.5374],targets:[0.2]},
  {inputs:[-0.6754,0.1426],targets:[0.4]},
  {inputs:[-0.6042,0.3158],targets:[0.4]},
  {inputs:[-0.2411,-0.0289],targets:[0.4]},
  {inputs:[-0.3006,-0.0114],targets:[0.4]},
  {inputs:[-0.8717,0.2131],targets:[0.4]},
  {inputs:[0.9103,-0.1258],targets:[0.2]},
  {inputs:[0.8199,0.0951],targets:[0.2]},
  {inputs:[0.5835,0.7751],targets:[0.2]},
  {inputs:[0.6354,0.6147],targets:[0.2]},
  {inputs:[-0.2409,-0.416],targets:[0.5]},
  {inputs:[-0.0783,-0.8049],targets:[0.5]},
  {inputs:[-0.5364,-0.0936],targets:[0.4]},
  {inputs:[0.5679,0.1581],targets:[0.2]},
  {inputs:[-0.4862,0.3914],targets:[0.4]},
  {inputs:[-0.6212,-0.134],targets:[0.4]},
  {inputs:[-0.0996,-0.5033],targets:[0.5]},
  {inputs:[-0.5685,0.3155],targets:[0.4]},
  {inputs:[-0.4675,0.2957],targets:[0.4]},
  {inputs:[0.0615,0.7615],targets:[0.3]},
  {inputs:[0.2695,-0.3335],targets:[0.1]},
  {inputs:[0.5289,-0.6404],targets:[0.1]},
  {inputs:[-0.5311,-0.3001],targets:[0.5]},
  {inputs:[-0.3691,0.1418],targets:[0.4]},
  {inputs:[-0.2253,-0.6542],targets:[0.5]},
  {inputs:[0.6016,0.5492],targets:[0.2]},
  {inputs:[0.5228,0.2032],targets:[0.2]},
  {inputs:[-0.6309,0.2365],targets:[0.4]},
  {inputs:[-0.2579,0.8546],targets:[0.3]},
  {inputs:[0.6625,-0.1652],targets:[0.2]},
  {inputs:[-0.6514,-0.4083],targets:[0.5]},
  {inputs:[-0.5973,-0.5439],targets:[0.5]},
  {inputs:[0.5,0.1031],targets:[0.2]},
  {inputs:[-0.5454,0.3723],targets:[0.4]},
  {inputs:[-0.4359,0.6598],targets:[0.3]},
  {inputs:[-0.5658,0.0449],targets:[0.4]},
  {inputs:[-0.0524,-0.3084],targets:[0.5]},
  {inputs:[0.0754,-0.1238],targets:[0.1]},
  {inputs:[-0.014,0.5302],targets:[0.3]},
  {inputs:[0.7685,-0.0339],targets:[0.2]},
  {inputs:[0.3516,-0.4848],targets:[0.1]},
  {inputs:[-0.769,-0.2992],targets:[0.5]},
  {inputs:[-0.2334,-0.7403],targets:[0.5]},
  {inputs:[0.3325,-0.1114],targets:[0.1]},
  {inputs:[0.307,-0.3628],targets:[0.1]},
  {inputs:[0.4126,-0.0968],targets:[0.2]},
  {inputs:[-0.5056,-0.3717],targets:[0.5]},
  {inputs:[0.2988,0.5683],targets:[0.3]},
  {inputs:[0.446,-0.5514],targets:[0.1]},
  {inputs:[0.0479,-0.8144],targets:[0.1]},
  {inputs:[-0.4915,0.1944],targets:[0.4]},
  {inputs:[-0.4826,0.3072],targets:[0.4]},
  {inputs:[-0.6949,0.3914],targets:[0.4]},
  {inputs:[0.9027,0.3243],targets:[0.2]},
  {inputs:[0.2946,-0.5512],targets:[0.1]},
  {inputs:[0.0951,0.1776],targets:[0.3]},
  {inputs:[0.4648,0.3648],targets:[0.2]},
  {inputs:[-0.0609,-0.8069],targets:[0.5]},
  {inputs:[-0.3371,-0.6931],targets:[0.5]},
  {inputs:[0.545,0.0356],targets:[0.2]},
  {inputs:[-0.7224,-0.4078],targets:[0.5]},
  {inputs:[-0.4372,0.3738],targets:[0.4]},
  {inputs:[0.0338,0.1818],targets:[0.3]},
  {inputs:[0.5625,-0.5965],targets:[0.1]},
  {inputs:[0.4167,-0.3294],targets:[0.1]},
  {inputs:[0.5122,0.5278],targets:[0.2]},
  {inputs:[0.0184,-0.4944],targets:[0.1]},
  {inputs:[0.5872,-0.6864],targets:[0.1]},
  {inputs:[-0.4676,-0.8616],targets:[0.5]},
  {inputs:[0.9541,0.1522],targets:[0.2]},
  {inputs:[-0.61,0.0735],targets:[0.4]},
  {inputs:[0.1283,-0.4136],targets:[0.1]},
  {inputs:[0.1631,-0.6334],targets:[0.1]},
  {inputs:[-0.7537,0.3517],targets:[0.4]},
  {inputs:[-0.8023,0.4141],targets:[0.4]},
  {inputs:[0.0558,-0.0636],targets:[1]},
  {inputs:[-0.0674,0.007],targets:[1]},
  {inputs:[0.0791,0.0573],targets:[1]},
  {inputs:[0.004,0.0826],targets:[1]},
  {inputs:[-0.0778,-0.0022],targets:[1]},
  {inputs:[-0.0447,-0.0446],targets:[1]},
  {inputs:[0.0586,-0.0316],targets:[1]},
  {inputs:[0.0119,0.0465],targets:[1]},
  {inputs:[-0.0013,0.0576],targets:[1]},
  {inputs:[0.026,-0.0957],targets:[1]},
  {inputs:[-0.0382,-0.074],targets:[1]},
  {inputs:[-0.0246,-0.0918],targets:[1]},
  {inputs:[0.0286,-0.0231],targets:[1]},
  {inputs:[-0.0258,-0.0644],targets:[1]},
  {inputs:[0.0011,-0.0617],targets:[1]},
  {inputs:[0.0243,0.0283],targets:[1]},
  {inputs:[0.0567,0.0632],targets:[1]},
  {inputs:[-0.0295,0.0379],targets:[1]},
  {inputs:[-0.0608,0.0298],targets:[1]},
  {inputs:[-0.0669,-0.0425],targets:[1]},
  {inputs:[-0.0655,0.0302],targets:[1]},
  {inputs:[0.0913,-0.0385],targets:[1]},
  {inputs:[-0.0248,-0.0626],targets:[1]},
  {inputs:[0.0792,0.0079],targets:[1]},
  {inputs:[-0.0206,-0.0364],targets:[1]},
  {inputs:[-0.0415,0.0746],targets:[1]},
  {inputs:[-0.0756,0.023],targets:[1]},
  {inputs:[-0.0458,0.0556],targets:[1]},
  {inputs:[-0.0533,0.0436],targets:[1]},
  {inputs:[0.0071,0.0842],targets:[1]},
  {inputs:[0.0204,-0.0154],targets:[1]},
  {inputs:[0.0437,0.0321],targets:[1]},
  {inputs:[0.0442,-0.0369],targets:[1]},
  {inputs:[0.0754,0.0613],targets:[1]},
  {inputs:[0.0764,0.0244],targets:[1]},
  {inputs:[-0.0071,-0.0918],targets:[1]},
  {inputs:[-0.0559,0.0556],targets:[1]},
  {inputs:[0.0484,0.0748],targets:[1]},
  {inputs:[0.0072,-0.0146],targets:[1]},
  {inputs:[-0.041,0.0065],targets:[1]},
  {inputs:[-0.0228,0.0594],targets:[1]},
  {inputs:[0.0484,0.0425],targets:[1]},
  {inputs:[0.0222,-0.072],targets:[1]},
  {inputs:[-0.04,0.027],targets:[1]},
  {inputs:[-0.0629,0.0251],targets:[1]},
  {inputs:[0.0784,0.0399],targets:[1]},
  {inputs:[0.0355,0.0093],targets:[1]},
  {inputs:[-0.0461,-0.01],targets:[1]},
  {inputs:[0.0802,-0.0287],targets:[1]},
  {inputs:[-0.0042,-0.0994],targets:[1]}
],
  },
};

// ── Custom CSV parsing ─────────────────────────────────────────────────────
function parseCustomCSV(text) {
  const sep = text.includes(';') ? ';' : (text.includes(',') ? ',' : null);
  if (!sep) throw new Error('Keine Spalten gefunden (weder Semikolon noch Komma als Trennzeichen).');

  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 3) throw new Error('Die CSV muss mindestens 3 Zeilen haben (Typ-Zeile, Bezeichner-Zeile, Datenwerte).');

  const typeRow = lines[0].split(sep).map(s => s.trim().toLowerCase());
  for (const t of typeRow) {
    if (t !== 'input' && t !== 'output')
      throw new Error(`Ungültiger Typ "${t}" in Zeile 1. Erlaubt: "input" oder "output".`);
  }

  const inputCols  = typeRow.map((t, i) => t === 'input'  ? i : -1).filter(i => i >= 0);
  const outputCols = typeRow.map((t, i) => t === 'output' ? i : -1).filter(i => i >= 0);
  if (inputCols.length === 0)   throw new Error('Keine Eingabe-Spalten gefunden. Mindestens eine Spalte muss "input" sein.');
  if (inputCols.length > 10)    throw new Error(`Zu viele Eingaben (${inputCols.length}). Maximum sind 10 Eingaben.`);
  if (outputCols.length === 0)  throw new Error('Keine Ausgabe-Spalten gefunden. Mindestens eine Spalte muss "output" sein.');
  if (outputCols.length > 10)   throw new Error(`Zu viele Ausgaben (${outputCols.length}). Maximum sind 10 Ausgaben.`);

  const labelRow = lines[1].split(sep).map(s => s.trim());
  if (labelRow.length !== typeRow.length)
    throw new Error(`Zeile 2 hat ${labelRow.length} Spalten, aber Zeile 1 hat ${typeRow.length}.`);
  const inputLabels  = inputCols.map((ci, i)  => labelRow[ci]  || `Eingang ${i + 1}`);
  const outputLabels = outputCols.map((ci, i) => labelRow[ci] || `Ausgang ${i + 1}`);

  const data = [];
  for (let r = 2; r < lines.length; r++) {
    const cells = lines[r].split(sep);
    if (cells.length !== typeRow.length)
      throw new Error(`Zeile ${r + 1} hat ${cells.length} Spalten, erwartet ${typeRow.length}.`);
    const inputs = inputCols.map(ci => {
      const v = parseFloat(cells[ci].trim().replace(',', '.'));
      if (isNaN(v)) throw new Error(`Kein Zahlenwert in Zeile ${r + 1}, Spalte ${ci + 1}: "${cells[ci]}".`);
      return v;
    });
    const targets = outputCols.map(ci => {
      const v = parseFloat(cells[ci].trim().replace(',', '.'));
      if (isNaN(v)) throw new Error(`Kein Zahlenwert in Zeile ${r + 1}, Spalte ${ci + 1}: "${cells[ci]}".`);
      return v;
    });
    data.push({ inputs, targets });
  }
  if (data.length === 0) throw new Error('Keine Datenzeilen gefunden (nur Kopfzeilen).');

  return { numInputs: inputCols.length, inputLabels, outputLabels, data };
}

function getScenarioData() {
  if (state.learn.scenario === 'custom') return state.learn.customData;
  return SCENARIOS[state.learn.scenario] ?? null;
}

function fmt(n) {
  return parseFloat(n.toFixed(4)).toString();
}

// ── Neuron helpers ─────────────────────────────────────────────────────────
function makeNeuron(inCount) {
  const n = Math.max(0, inCount);
  return { type: 'sigmoid', weights: Array(n).fill(1), disabled: Array(n).fill(false), bias: 0, spacing: 0 };
}

function resyncWeights(layerIdx) {
  if (layerIdx < 0 || layerIdx >= state.layers.length) return;
  const inCount = layerIdx === 0
    ? state.numInputs
    : state.layers[layerIdx - 1].count;
  state.layers[layerIdx].neurons.forEach(n => {
    while (n.weights.length < inCount) n.weights.push(1);
    if (n.weights.length > inCount) n.weights.length = inCount;
    if (!n.disabled) n.disabled = [];
    while (n.disabled.length < inCount) n.disabled.push(false);
    if (n.disabled.length > inCount) n.disabled.length = inCount;
  });
}

// ── Spacing-drag helpers ──────────────────────────────────────────────────
function addPointerDrag(el, getVal, setVal, onClick) {
  let startY, startVal, minVal, didDrag, active = false;
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('input, button')) return;
    startY = e.clientY;
    startVal = getVal();
    didDrag = false;
    active = true;
    const colBody = el.closest('.col-body');
    if (colBody) {
      const bodyTop = colBody.getBoundingClientRect().top;
      const elTop   = el.getBoundingClientRect().top;
      // minimum translateY so element's top edge never goes above col-body top
      minVal = startVal - (elTop - bodyTop);
    } else {
      minVal = -Infinity;
    }
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!active) return;
    const delta = e.clientY - startY;
    if (!didDrag && Math.abs(delta) > 8) {
      didDrag = true;
      el.style.cursor = 'grabbing';
    }
    if (didDrag) {
      const newVal = Math.max(minVal, startVal + delta);
      setVal(newVal);
      el.style.transform = `translateY(${newVal}px)`;
      drawEdgeOverlay(document.getElementById('network'));
    }
  });
  el.addEventListener('pointerup', () => {
    if (!active) return;
    active = false;
    el.style.cursor = '';
    if (didDrag) saveState();
    if (!didDrag && onClick) setTimeout(onClick, 0);
  });
  el.addEventListener('pointercancel', () => { active = false; el.style.cursor = ''; });
}

function applyColumnOffsets(offsets) {
  state.colOffsets = offsets;
  const cols = [...document.querySelectorAll('#network > .col:not(#learn-panel)')];
  cols.forEach((col, i) => { col.style.left = `${offsets[i] || 0}px`; });
  drawEdgeOverlay(document.getElementById('network'));
}

function addColumnDrag(header, colIdx) {
  let startX, startOffsets, active = false, didDrag = false;
  header.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input')) return;
    startX = e.clientX;
    startOffsets = [...state.colOffsets];
    active = true;
    didDrag = false;
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', e => {
    if (!active) return;
    const delta = e.clientX - startX;
    if (!didDrag && Math.abs(delta) > 8) { didDrag = true; header.style.cursor = 'grabbing'; }
    if (didDrag) {
      const o = [...startOffsets];
      o[colIdx] = startOffsets[colIdx] + delta;
      for (let i = colIdx; i < o.length - 1; i++) { if (o[i] > o[i + 1]) o[i + 1] = o[i]; else break; }
      for (let i = colIdx; i > 0; i--)             { if (o[i] < o[i - 1]) o[i - 1] = o[i]; else break; }
      for (let i = 0; i < o.length; i++) o[i] = Math.max(0, o[i]);
      applyColumnOffsets(o);
    }
  });
  header.addEventListener('pointerup', () => { if (!active) return; active = false; header.style.cursor = ''; if (didDrag) saveState(); });
  header.addEventListener('pointercancel', () => { active = false; header.style.cursor = ''; });
}

// ── Computation ────────────────────────────────────────────────────────────
function getLayerInputs(layerIdx) {
  if (layerIdx === 0) return state.inputs.slice(0, state.numInputs);
  return getNonTerminalOutputs(layerIdx - 1);
}

function computeNeuronOutput(neuron, inputs) {
  let z = neuron.bias;
  inputs.forEach((x, i) => {
    if (!neuron.disabled?.[i]) z += (neuron.weights[i] ?? 1) * x;
  });
  return { z, y: activations[neuron.type].fn(z) };
}

function computeLayerOutputs(layerIdx) {
  const layer = state.layers[layerIdx];
  if (!layer || layer.count === 0) return [];
  const inputs = getLayerInputs(layerIdx);
  return layer.neurons.map(n => computeNeuronOutput(n, inputs).y);
}

function getNonTerminalOutputs(layerIdx) {
  const layer = state.layers[layerIdx];
  if (!layer || layer.count === 0) return [];
  const inputs = getLayerInputs(layerIdx);
  return layer.neurons.map(n => computeNeuronOutput(n, inputs).y);
}

function isOutputNeuron(li, ni) {
  const L = lastActiveLayerIdx();
  if (li >= L) return true;
  const next = state.layers[li + 1];
  if (!next || next.count === 0) return true;
  return next.neurons.every(n => n.disabled?.[ni] ?? false);
}

function getOutputNeurons() {
  const L = lastActiveLayerIdx();
  const result = [];
  for (let li = 0; li <= L; li++)
    for (let ni = 0; ni < state.layers[li].count; ni++)
      if (isOutputNeuron(li, ni))
        result.push({ li, ni, neuron: state.layers[li].neurons[ni] });
  return result;
}

function getTerminalNeurons() {
  return getOutputNeurons();
}

function lastActiveLayerIdx() {
  for (let i = state.layers.length - 1; i >= 0; i--) {
    if (state.layers[i].count > 0) return i;
  }
  return -1;
}

// ── Backpropagation ────────────────────────────────────────────────────────
function forwardPass(inputValues) {
  for (let i = 0; i < state.numInputs; i++) state.inputs[i] = inputValues[i];
  const L = lastActiveLayerIdx();
  const cache = [];
  for (let li = 0; li <= L; li++) {
    const inputs = getLayerInputs(li);
    cache[li] = state.layers[li].neurons.map(n => computeNeuronOutput(n, inputs));
  }
  return cache;
}

function backwardPass(cache, targets) {
  const L = lastActiveLayerIdx();
  const deltas = [];
  for (let li = 0; li <= L; li++) deltas[li] = new Array(state.layers[li].count).fill(0);

  // Phase 1: delta für Output-Neuronen direkt aus Zielwert
  getOutputNeurons().forEach(({ li, ni }, tIdx) => {
    const neuron = state.layers[li].neurons[ni];
    const { z, y } = cache[li][ni];
    deltas[li][ni] = (y - (targets[tIdx] ?? 0)) * activations[neuron.type].derivative(y, z);
  });

  // Phase 2: delta für interne Neuronen per Backprop durch nächste Schicht
  for (let li = L - 1; li >= 0; li--) {
    for (let ni = 0; ni < state.layers[li].count; ni++) {
      if (isOutputNeuron(li, ni)) continue;
      const neuron = state.layers[li].neurons[ni];
      const { z, y } = cache[li][ni];
      let sum = 0;
      for (let k = 0; k < state.layers[li + 1].count; k++) {
        if (!state.layers[li + 1].neurons[k].disabled?.[ni])
          sum += (state.layers[li + 1].neurons[k].weights[ni] ?? 0) * deltas[li + 1][k];
      }
      deltas[li][ni] = activations[neuron.type].derivative(y, z) * sum;
    }
  }
  return deltas;
}

function applyGradients(cache, deltas, lr) {
  const L = lastActiveLayerIdx();
  for (let li = 0; li <= L; li++) {
    const prevOutputs = li === 0
      ? state.inputs.slice(0, state.numInputs)
      : cache[li - 1].map(c => c.y);
    for (let ni = 0; ni < state.layers[li].count; ni++) {
      const neuron = state.layers[li].neurons[ni];
      const d = deltas[li][ni];
      for (let j = 0; j < neuron.weights.length; j++) {
        if (!neuron.disabled?.[j]) neuron.weights[j] -= lr * d * (prevOutputs[j] ?? 0);
      }
      neuron.bias -= lr * d;
    }
  }
}

function computeAndStoreLoss() {
  const sc = getScenarioData();
  if (!sc) return;
  const savedInputs = state.inputs.slice();
  const termNeurons = getTerminalNeurons();
  let mse = 0;
  for (const sample of sc.data) {
    const cache = forwardPass(sample.inputs);
    termNeurons.forEach(({ li, ni }, tIdx) => {
      const diff = cache[li][ni].y - (sample.targets[tIdx] ?? 0);
      mse += diff * diff;
    });
  }
  savedInputs.forEach((v, i) => { state.inputs[i] = v; });
  mse /= sc.data.length * Math.max(termNeurons.length, 1);
  state.learn.loss = mse;
  if (state.learn.lossHistory.length >= 200) state.learn.lossHistory.shift();
  state.learn.lossHistory.push(mse);
}

function canTrain() {
  const L = lastActiveLayerIdx();
  if (L < 0) return false;
  let hasPerceptron = false;
  for (let li = 0; li <= L; li++) {
    for (const n of state.layers[li].neurons) {
      if (n.type === 'perceptron') hasPerceptron = true;
    }
  }
  const w = document.getElementById('learn-warning');
  if (w) w.textContent = hasPerceptron ? 'Hinweis: Perceptron verwendet Perceptron-Lernregel (δ = 1).' : '';
  return true;
}

function stopTraining() {
  if (state.learn.intervalId !== null) {
    clearInterval(state.learn.intervalId);
    state.learn.intervalId = null;
  }
  state.learn.isTraining = false;
}

function startTraining() {
  if (!state.learn.scenario || !canTrain()) return;
  if (state.learn.scenario === 'custom' && !state.learn.customData) return;
  if (state.learn.shuffledData.length === 0) {
    const sc = getScenarioData();
    if (sc) state.learn.shuffledData = sc.data.slice().sort(() => Math.random() - 0.5);
  }
  state.learn.isTraining = true;
  state.learn.intervalId = setInterval(trainTick, 200);
  updateLossPanelDisplay();
}

function trainTick() {
  const sc = getScenarioData();
  if (!sc) return;
  if (state.learn.shuffledData.length === 0)
    state.learn.shuffledData = sc.data.slice().sort(() => Math.random() - 0.5);

  for (let i = 0; i < state.learn.speed; i++) {
    const sample = state.learn.shuffledData[state.learn.sampleIdx];
    state.learn.lastTargets     = sample.targets;
    state.learn.lastSample      = sample;
    const cache  = forwardPass(sample.inputs);
    state.learn.lastPredictions = getOutputNeurons().map(({li, ni}) => cache[li][ni].y);
    const deltas = backwardPass(cache, sample.targets);
    applyGradients(cache, deltas, state.learn.learningRate);
    state.learn.sampleIdx++;
    if (state.learn.sampleIdx >= state.learn.shuffledData.length) {
      state.learn.sampleIdx = 0;
      state.learn.epoch++;
      computeAndStoreLoss();
      state.learn.shuffledData = sc.data.slice().sort(() => Math.random() - 0.5);
    }
  }
  updateLossPanelDisplay();
  updateLossGraph();
  updateNeuronDisplays();
}

// ── Scenario application ───────────────────────────────────────────────────
function applyScenario(key) {
  const sc = SCENARIOS[key];
  if (!sc) return;
  stopTraining();
  state.learn.scenario        = key;
  state.learn.epoch           = 0;
  state.learn.loss            = 0;
  state.learn.lossHistory     = [];
  state.learn.sampleIdx       = 0;
  state.learn.lastTargets     = [];
  state.learn.lastSample      = null;
  state.learn.lastPredictions = [];
  state.learn.shuffledData    = [];
  state.learn.topologyDirty   = false;
  state.numInputs         = sc.numInputs;
  state.inputLabels       = [...sc.inputLabels, ...state.inputLabels.slice(sc.inputLabels.length)];
  state.outputLabels      = [...sc.outputLabels];
  for (let li = 0; li < 4; li++) {
    const topo = sc.topology[li];
    if (!topo || topo.count === 0) {
      state.layers[li].count   = 0;
      state.layers[li].neurons = [];
    } else {
      const inCount = li === 0 ? sc.numInputs : state.layers[li - 1].count;
      const prevOutputSet = new Set(li > 0 ? (sc.topology[li - 1]?.outputIndices ?? []) : []);
      const activeCount = Math.max(inCount - prevOutputSet.size, 1);
      // He-Init für ReLU, Xavier für Sigmoid/Tanh
      const scale = topo.type === 'relu'
        ? Math.sqrt(2 / activeCount)
        : 1 / Math.sqrt(activeCount);
      state.layers[li].count   = topo.count;
      state.layers[li].neurons = Array.from({ length: topo.count }, () => {
        const disabled = Array(inCount).fill(false).map((_, wi) => prevOutputSet.has(wi));
        const weights  = Array(inCount).fill(0).map((_, wi) =>
          prevOutputSet.has(wi) ? 0 : (Math.random() - 0.5) * 2 * scale
        );
        return { type: topo.type, weights, disabled, bias: 0, spacing: 0 };
      });
    }
  }
  for (let li = 0; li < 4; li++) resyncWeights(li);

  // Für lineare Output-Neuronen: Bias auf Mittelwert der Targets setzen (seg7)
  const outLi = lastActiveLayerIdx();
  const allTargets = sc.data.flatMap(d => d.targets);
  const meanTarget = allTargets.reduce((a, b) => a + b, 0) / allTargets.length;
  state.layers[outLi].neurons.forEach(n => {
    if (n.type === 'linear') {
      n.weights = n.weights.map(() => (Math.random() - 0.5) * 0.2);
      n.bias = meanTarget;
    }
  });
}

// ── Scenario: inputs only (user builds topology) ──────────────────────────
function applyScenarioInputsOnly(key) {
  const sc = SCENARIOS[key];
  if (!sc) return;
  stopTraining();
  state.learn.scenario        = key;
  state.learn.epoch           = 0;
  state.learn.loss            = 0;
  state.learn.lossHistory     = [];
  state.learn.sampleIdx       = 0;
  state.learn.lastTargets     = [];
  state.learn.lastSample      = null;
  state.learn.lastPredictions = [];
  state.learn.shuffledData    = [];
  state.learn.topologyDirty   = false;
  state.numInputs     = sc.numInputs;
  state.inputLabels   = [...sc.inputLabels, ...state.inputLabels.slice(sc.inputLabels.length)];
  state.outputLabels  = [...sc.outputLabels];
  for (let li = 0; li < 4; li++) {
    state.layers[li].count   = 0;
    state.layers[li].neurons = [];
  }
}

function applyCustomScenarioInputsOnly() {
  const cd = state.learn.customData;
  if (!cd) return;
  stopTraining();
  state.learn.epoch           = 0;
  state.learn.loss            = 0;
  state.learn.lossHistory     = [];
  state.learn.sampleIdx       = 0;
  state.learn.lastTargets     = [];
  state.learn.lastSample      = null;
  state.learn.lastPredictions = [];
  state.learn.shuffledData    = [];
  state.learn.topologyDirty   = false;
  state.numInputs    = cd.numInputs;
  state.inputLabels  = [...cd.inputLabels, ...state.inputLabels.slice(cd.inputLabels.length)];
  state.outputLabels = [...cd.outputLabels];
  for (let li = 0; li < 4; li++) {
    state.layers[li].count   = 0;
    state.layers[li].neurons = [];
  }
}

// ── Weight-only reset (keeps topology) ────────────────────────────────────
function resetWeightsOnly() {
  stopTraining();
  state.learn.epoch           = 0;
  state.learn.loss            = 0;
  state.learn.lossHistory     = [];
  state.learn.sampleIdx       = 0;
  state.learn.lastTargets     = [];
  state.learn.lastSample      = null;
  state.learn.lastPredictions = [];
  state.learn.shuffledData    = [];
  state.learn.topologyDirty   = false;

  const sc  = getScenarioData();
  const L   = lastActiveLayerIdx();
  for (let li = 0; li <= L; li++) {
    state.layers[li].neurons.forEach(n => {
      const activeCount = Math.max(n.weights.filter((_, i) => !n.disabled?.[i]).length, 1);
      const scale = n.type === 'relu'
        ? Math.sqrt(2 / activeCount) : 1 / Math.sqrt(activeCount);
      n.weights = n.weights.map((_, i) =>
        n.disabled?.[i] ? 0 : (Math.random() - 0.5) * 2 * scale
      );
      n.bias = 0;
    });
  }
  if (sc) {
    const allTargets  = sc.data.flatMap(d => d.targets);
    const meanTarget  = allTargets.reduce((a, b) => a + b, 0) / allTargets.length;
    state.layers[L].neurons.forEach(n => {
      if (n.type === 'linear') {
        n.weights = n.weights.map((_, i) => n.disabled?.[i] ? 0 : (Math.random() - 0.5) * 0.2);
        n.bias = meanTarget;
      }
    });
  }
}

// ── Learn panel free drag ──────────────────────────────────────────────────
function addLearnPanelFreeDrag(header) {
  let active = false, startX, startY, startPX, startPY;
  header.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input')) return;
    const group = document.getElementById('learn-group');
    if (!group) return;
    const r = group.getBoundingClientRect();
    startPX = r.left; startPY = r.top;
    state.learn.panelX = startPX; state.learn.panelY = startPY;
    startX = e.clientX; startY = e.clientY;
    active = true;
    header.setPointerCapture(e.pointerId);
    header.style.cursor = 'grabbing';
  });
  header.addEventListener('pointermove', e => {
    if (!active) return;
    const group = document.getElementById('learn-group');
    if (!group) return;
    state.learn.panelX = startPX + (e.clientX - startX);
    state.learn.panelY = startPY + (e.clientY - startY);
    group.style.left = `${state.learn.panelX}px`;
    group.style.top  = `${state.learn.panelY}px`;
  });
  header.addEventListener('pointerup', () => {
    if (!active) return;
    active = false;
    header.style.cursor = '';
    saveState();
  });
  header.addEventListener('pointercancel', () => { active = false; header.style.cursor = ''; });
}

// ── Learn group (wraps info panel + toggle + learn panel) ─────────────────
function renderLearnGroup() {
  const group = document.createElement('div');
  group.id = 'learn-group';
  const px = state.learn.panelX ?? (window.innerWidth - 340);
  const py = state.learn.panelY ?? 70;
  group.style.left = `${px}px`;
  group.style.top  = `${py}px`;

  if (state.learn.scenario && state.learn.infoPanelOpen) {
    group.appendChild(renderLearnInfoPanel());
  }

  if (state.learn.scenario) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'learn-info-toggle-btn';
    toggleBtn.title = state.learn.infoPanelOpen ? 'Info einklappen' : 'Info ausklappen';
    toggleBtn.textContent = state.learn.infoPanelOpen ? '◀' : '▶';
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      state.learn.infoPanelOpen = !state.learn.infoPanelOpen;
      saveState();
      render();
    });
    group.appendChild(toggleBtn);
  }

  group.appendChild(renderLearnPanel());
  return group;
}

// ── Learn info panel ────────────────────────────────────────────────────────
function renderLearnInfoPanel() {
  const panel = document.createElement('div');
  panel.id = 'learn-info-panel';
  if (state.learn.scenario === 'gates') renderGatesInfo(panel);
  else if (state.learn.scenario === 'seg7') renderSeg7Info(panel);
  else if (state.learn.scenario === 'zielscheibe') renderZielscheibeInfo(panel);
  else if (state.learn.scenario === 'custom') renderCustomDataInfo(panel);
  return panel;
}

function renderGatesInfo(panel) {
  const title = document.createElement('div');
  title.className = 'learn-info-title';
  title.textContent = 'Logik-Gatter';
  panel.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'learn-info-desc';
  desc.textContent = 'Das Netz soll 4 logische Operationen gleichzeitig erlernen – mit denselben Gewichten der versteckten Schicht.';
  panel.appendChild(desc);

  [
    { name: 'AND',   desc: 'A=1 UND B=1 → 1' },
    { name: 'OR',    desc: 'A=1 ODER B=1 → 1' },
    { name: 'NOT A', desc: 'A=0 → 1' },
    { name: 'XOR',   desc: 'A≠B → 1' },
  ].forEach(g => {
    const row = document.createElement('div');
    row.className = 'learn-info-gate-row';
    row.innerHTML = `<span class="learn-info-gate-name">${g.name}</span><span class="learn-info-gate-desc">${g.desc}</span>`;
    panel.appendChild(row);
  });

  const table = document.createElement('table');
  table.className = 'learn-info-table';
  table.innerHTML = `
    <thead><tr><th>A</th><th>B</th><th>AND</th><th>OR</th><th>¬A</th><th>XOR</th></tr></thead>
    <tbody>
      <tr><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>0</td></tr>
      <tr><td>0</td><td>1</td><td>0</td><td>1</td><td>1</td><td>1</td></tr>
      <tr><td>1</td><td>0</td><td>0</td><td>1</td><td>0</td><td>1</td></tr>
      <tr><td>1</td><td>1</td><td>1</td><td>1</td><td>0</td><td>0</td></tr>
    </tbody>`;
  panel.appendChild(table);
}

function renderSeg7Info(panel) {
  const title = document.createElement('div');
  title.className = 'learn-info-title';
  title.textContent = '7-Segment-Anzeige';
  panel.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'learn-info-desc';
  desc.textContent = 'Eingaben: welche Segmente a–g leuchten. Ausgabe: erkannte Ziffer (0–9).';
  panel.appendChild(desc);

  // Labeled 7-segment diagram
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 90 80');
  svg.setAttribute('width', '90');
  svg.setAttribute('height', '80');
  svg.style.cssText = 'display:block;margin:4px auto';

  const SEG_ON = '#10b981', SEG_OFF = '#dde1e7', LBL = '#64748b';
  const x0 = 22, y0 = 13, W = 36, H = 52, sw = 5;
  const x1 = x0 + W, ym = y0 + H / 2, y2 = y0 + H;

  let segIdx = 0;
  const seg = (x1c, y1c, x2c, y2c, lbl, lx, ly, center) => {
    const idx = segIdx++;
    const on = (state.inputs[idx] ?? 0) > 0.5;
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', x1c); l.setAttribute('y1', y1c);
    l.setAttribute('x2', x2c); l.setAttribute('y2', y2c);
    l.setAttribute('stroke', on ? SEG_ON : SEG_OFF);
    l.setAttribute('stroke-width', sw);
    l.setAttribute('stroke-linecap', 'round');
    l.setAttribute('data-seg-line', String(idx));
    svg.appendChild(l);
    if (center) {
      const bg = document.createElementNS(svgNS, 'rect');
      bg.setAttribute('x', lx - 6); bg.setAttribute('y', ly - 5.5);
      bg.setAttribute('width', '12'); bg.setAttribute('height', '11');
      bg.setAttribute('fill', 'white'); bg.setAttribute('rx', '2');
      svg.appendChild(bg);
    }
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', lx); t.setAttribute('y', ly);
    t.setAttribute('font-size', '9'); t.setAttribute('font-weight', '700');
    t.setAttribute('fill', LBL); t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.textContent = lbl;
    svg.appendChild(t);
    // Transparente Hit-Area für einfacheres Klicken
    const hit = document.createElementNS(svgNS, 'line');
    hit.setAttribute('x1', x1c); hit.setAttribute('y1', y1c);
    hit.setAttribute('x2', x2c); hit.setAttribute('y2', y2c);
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', sw * 2.5);
    hit.setAttribute('stroke-linecap', 'round');
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', () => {
      if (state.learn.isTraining) return;
      state.inputs[idx] = state.inputs[idx] > 0.5 ? 0 : 1;
      state.learn.lastSample  = { inputs: [...state.inputs.slice(0, 7)], targets: [] };
      state.learn.lastTargets = [];
      updateNeuronDisplays();
    });
    svg.appendChild(hit);
  };

  const hpad = sw / 2 + 1, vpad = sw / 2 + 1, xm = (x0 + x1) / 2;
  seg(x0+hpad, y0,  x1-hpad, y0,  'a', xm,    y0-7,         false); // top
  seg(x1, y0+vpad,  x1, ym-vpad,  'b', x1+9,  (y0+ym)/2,    false); // top-right
  seg(x1, ym+vpad,  x1, y2-vpad,  'c', x1+9,  (ym+y2)/2,    false); // bottom-right
  seg(x0+hpad, y2,  x1-hpad, y2,  'd', xm,    y2+8,         false); // bottom
  seg(x0, ym+vpad,  x0, y2-vpad,  'e', x0-9,  (ym+y2)/2,    false); // bottom-left
  seg(x0, y0+vpad,  x0, ym-vpad,  'f', x0-9,  (y0+ym)/2,    false); // top-left
  seg(x0+hpad, ym,  x1-hpad, ym,  'g', xm,    ym,           true);  // middle (centered)

  panel.appendChild(svg);

  const exTitle = document.createElement('div');
  exTitle.className = 'learn-section-title';
  exTitle.style.marginTop = '6px';
  exTitle.textContent = 'Beispiele (0–9)';
  panel.appendChild(exTitle);

  // [a,b,c,d,e,f,g] for digits 0-9
  const digits = [
    [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
    [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
  ];

  const grid = document.createElement('div');
  grid.className = 'learn-info-seg-examples';

  digits.forEach((segs, digit) => {
    const item = document.createElement('div');
    item.className = 'learn-info-seg-item';

    const ms = document.createElementNS(svgNS, 'svg');
    ms.setAttribute('viewBox', '0 0 20 30');
    ms.setAttribute('width', '20');
    ms.setAttribute('height', '30');

    const mw = 12, mh = 22, msw = 2.5;
    const mx0 = 4, my0 = 3, mx1 = mx0+mw, mym = my0+mh/2, my2 = my0+mh;
    const mhp = msw/2 + 0.5, mvp = msw/2 + 0.5;

    const miniSeg = (on, ax, ay, bx, by) => {
      const l = document.createElementNS(svgNS, 'line');
      l.setAttribute('x1', ax); l.setAttribute('y1', ay);
      l.setAttribute('x2', bx); l.setAttribute('y2', by);
      l.setAttribute('stroke', on ? SEG_ON : '#dde1e7');
      l.setAttribute('stroke-width', msw);
      l.setAttribute('stroke-linecap', 'round');
      ms.appendChild(l);
    };

    miniSeg(segs[0], mx0+mhp, my0,  mx1-mhp, my0);
    miniSeg(segs[1], mx1, my0+mvp,  mx1, mym-mvp);
    miniSeg(segs[2], mx1, mym+mvp,  mx1, my2-mvp);
    miniSeg(segs[3], mx0+mhp, my2,  mx1-mhp, my2);
    miniSeg(segs[4], mx0, mym+mvp,  mx0, my2-mvp);
    miniSeg(segs[5], mx0, my0+mvp,  mx0, mym-mvp);
    miniSeg(segs[6], mx0+mhp, mym,  mx1-mhp, mym);

    item.appendChild(ms);
    const lbl = document.createElement('div');
    lbl.className = 'learn-info-seg-label';
    lbl.textContent = digit;
    item.appendChild(lbl);
    grid.appendChild(item);
  });

  panel.appendChild(grid);
}

function renderZielscheibeInfo(panel) {
  const title = document.createElement('div');
  title.className = 'learn-info-title';
  title.textContent = 'Zielscheibe';
  panel.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'learn-info-desc';
  desc.textContent = 'Eingabe: normierte (x, y)-Position eines Wurfs. Ausgabe: 0 = daneben, 1.0 = Volltreffer Mitte.';
  panel.appendChild(desc);

  const svgWrap = document.createElement('div');
  svgWrap.style.cssText = 'text-align:center;margin:6px 0';
  svgWrap.innerHTML = `<svg width="200" height="200" viewBox="8 8 264 264" xmlns="http://www.w3.org/2000/svg">
  <path d="M 140,140 L 140,20 A 120,120 0 0,1 254.12,102.92 Z" fill="#0B3948" stroke="#082d39" stroke-width="1"/>
  <path d="M 140,140 L 254.12,102.92 A 120,120 0 0,1 210.55,237.08 Z" fill="#1B6B8A" stroke="#082d39" stroke-width="1"/>
  <path d="M 140,140 L 210.55,237.08 A 120,120 0 0,1 69.45,237.08 Z" fill="#2A9D8F" stroke="#082d39" stroke-width="1"/>
  <path d="M 140,140 L 69.45,237.08 A 120,120 0 0,1 25.88,102.92 Z" fill="#52C0CE" stroke="#082d39" stroke-width="1"/>
  <path d="M 140,140 L 25.88,102.92 A 120,120 0 0,1 140,20 Z" fill="#90D9E8" stroke="#082d39" stroke-width="1"/>
  <circle cx="140" cy="140" r="120" fill="none" stroke="#082d39" stroke-width="1.5"/>
  <circle cx="140" cy="140" r="12" fill="#E0F4F8" stroke="#082d39" stroke-width="1"/>
  <text x="185" y="77"  text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="bold" fill="white">0.1</text>
  <text x="214" y="164" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="bold" fill="white">0.2</text>
  <text x="140" y="218" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="bold" fill="white">0.3</text>
  <text x="66"  y="164" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="bold" fill="#082d39">0.4</text>
  <text x="95"  y="77"  text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="bold" fill="#082d39">0.5</text>
  <text x="140" y="140" text-anchor="middle" dominant-baseline="middle" font-size="9"  font-weight="bold" fill="#082d39">1.0</text>
  <circle data-ziel-dot cx="140" cy="140" r="5" fill="#ef4444" stroke="white" stroke-width="1.5" display="none"/>
</svg>`;

  const svgEl2 = svgWrap.querySelector('svg');
  svgEl2.style.cursor = 'crosshair';
  svgEl2.addEventListener('click', e => {
    if (state.learn.isTraining) return;
    const rect = svgEl2.getBoundingClientRect();
    // viewBox "8 8 264 264" → SVG-Koordinaten berechnen
    const nx = ((e.clientX - rect.left) / rect.width  * 264 + 8 - 140) / 120;
    const ny = ((e.clientY - rect.top)  / rect.height * 264 + 8 - 140) / 120;
    state.inputs[0] = nx;
    state.inputs[1] = ny;
    // Richtiges Ziel anhand der Scheibengeometrie berechnen
    const r = Math.sqrt(nx * nx + ny * ny);
    let trueTarget;
    if      (r > 1.0)  trueTarget = 0;
    else if (r <= 0.1) trueTarget = 1.0;
    else {
      const norm = ((Math.atan2(ny, nx) * 180 / Math.PI + 90) % 360 + 360) % 360;
      trueTarget = [0.1, 0.2, 0.3, 0.4, 0.5][Math.min(Math.floor(norm / 72), 4)];
    }
    state.learn.lastTargets = [trueTarget];
    state.learn.lastSample  = { inputs: [nx, ny], targets: [trueTarget] };
    updateNeuronDisplays();
  });

  panel.appendChild(svgWrap);

  const note = document.createElement('div');
  note.className = 'learn-info-desc';
  note.innerHTML = '<b>Netz:</b> 2 → 10 (ReLU) → 10 (ReLU) → 1 (linear)<br><b>Koordinaten:</b> normiert, Scheibenrand = ±1';
  panel.appendChild(note);
}

function renderCustomDataInfo(panel) {
  const title = document.createElement('div');
  title.className = 'learn-info-title';
  title.textContent = 'Eigene CSV-Daten';
  panel.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'learn-info-desc';
  desc.textContent = 'Lade eine CSV-Datei mit Semikolon- oder Komma-Trennung. '
    + 'Zeile 1: Spaltentypen (input oder output). '
    + 'Zeile 2: Bezeichnungen (erscheinen im Netz). '
    + 'Ab Zeile 3: Zahlenwerte. Maximal 10 Eingaben und 10 Ausgaben. '
    + 'Die Anzahl der Datensätze ist unbegrenzt (max. 1 MB Dateigröße).';
  panel.appendChild(desc);

  const zone = document.createElement('div');
  zone.className = 'csv-upload-zone';

  const hint = document.createElement('p');
  hint.className = 'csv-upload-hint';
  hint.textContent = 'CSV-Datei hier ablegen oder';
  zone.appendChild(hint);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,.txt';
  fileInput.style.display = 'none';

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'csv-upload-btn';
  pickBtn.textContent = 'Datei wählen';
  pickBtn.addEventListener('click', () => fileInput.click());
  zone.appendChild(pickBtn);
  zone.appendChild(fileInput);

  function handleFile(file) {
    if (!file) return;
    if (file.size > 1_000_000) {
      state.learn.customError = 'Datei zu groß (max. 1 MB).';
      state.learn.customData  = null;
      render(); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        state.learn.customData     = parseCustomCSV(e.target.result);
        state.learn.customError    = null;
        state.learn.customFileName = file.name;
        state.learn.epoch        = 0;
        state.learn.loss         = 0;
        state.learn.lossHistory  = [];
        state.learn.sampleIdx    = 0;
        state.learn.shuffledData = [];
        applyCustomScenarioInputsOnly();
        render();
      } catch (err) {
        state.learn.customError    = err.message;
        state.learn.customData     = null;
        render();
      }
    };
    reader.onerror = () => {
      state.learn.customError = 'Datei konnte nicht gelesen werden.';
      render();
    };
    reader.readAsText(file, 'utf-8');
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('csv-upload-zone--over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('csv-upload-zone--over'));
  zone.addEventListener('drop',      (e) => {
    e.preventDefault();
    zone.classList.remove('csv-upload-zone--over');
    handleFile(e.dataTransfer.files[0]);
  });

  panel.appendChild(zone);

  if (state.learn.customData) {
    const cd = state.learn.customData;
    const stats = document.createElement('div');
    stats.className = 'csv-upload-stats';
    stats.textContent = (state.learn.customFileName ?? 'Datei') + ' — '
      + cd.numInputs + ' Eingaben, ' + cd.outputLabels.length + ' Ausgaben, '
      + cd.data.length + ' Muster';
    panel.appendChild(stats);
  }

  if (state.learn.customError) {
    const errEl = document.createElement('div');
    errEl.className = 'learn-warning';
    errEl.textContent = state.learn.customError;
    panel.appendChild(errEl);
  }
}

// ── Learn panel ────────────────────────────────────────────────────────────
function renderLearnPanel() {
  const panel = document.createElement('div');
  panel.id = 'learn-panel';

  // Drag header
  const dragHdr = document.createElement('div');
  dragHdr.className = 'col-header learn-panel-header';
  const titleEl = document.createElement('span');
  titleEl.className = 'col-name';
  titleEl.textContent = 'Lernen';
  dragHdr.appendChild(titleEl);
  panel.appendChild(dragHdr);
  addLearnPanelFreeDrag(dragHdr);

  // Scenario row
  const scRow = document.createElement('div');
  scRow.className = 'learn-row';
  const scLabel = document.createElement('span');
  scLabel.className = 'learn-label';
  scLabel.textContent = 'Szenario';
  const scOptions = [['', '– wählen –'], ['gates', 'Logik-Gatter'], ['seg7', '7-Segment-Ziffer'], ['zielscheibe', 'Zielscheibe'], ['custom', 'Eigene Daten']];
  const scSel = { value: state.learn.scenario || '' };

  const scDrop = document.createElement('div');
  scDrop.className = 'learn-custom-select';
  scDrop.id = 'learn-scenario-select';

  const scDropBtn = document.createElement('button');
  scDropBtn.type = 'button';
  scDropBtn.className = 'learn-custom-select-btn';
  scDropBtn.textContent = scOptions.find(([v]) => v === scSel.value)?.[1] ?? '– wählen –';

  const scDropList = document.createElement('div');
  scDropList.className = 'learn-custom-select-list';

  scOptions.forEach(([v, t]) => {
    const item = document.createElement('div');
    item.className = 'learn-custom-select-item' + (v === scSel.value ? ' selected' : '');
    item.textContent = t;
    item.addEventListener('click', () => {
      scSel.value = v;
      state.learn.scenario = v || null;
      if (state.learn.scenario) state.learn.infoPanelOpen = true;
      saveState();
      render();
    });
    scDropList.appendChild(item);
  });

  scDropBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = scDrop.classList.contains('open');
    document.querySelectorAll('.learn-custom-select.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) {
      scDrop.classList.add('open');
      setTimeout(() => document.addEventListener('click', () => scDrop.classList.remove('open'), { once: true }), 0);
    }
  });

  scDrop.append(scDropBtn, scDropList);
  scRow.append(scLabel, scDrop);
  panel.appendChild(scRow);

  const btnRow = document.createElement('div');
  btnRow.className = 'learn-btn-row';

  const emptyBtn = document.createElement('button');
  emptyBtn.id = 'learn-apply-empty';
  emptyBtn.className = 'learn-btn learn-btn-empty';
  emptyBtn.textContent = 'Leeres Netz';
  emptyBtn.addEventListener('click', () => {
    if (!scSel.value) return;
    if (scSel.value === 'custom') {
      if (state.learn.customData) applyCustomScenarioInputsOnly();
    } else {
      applyScenarioInputsOnly(scSel.value);
    }
    render();
  });

  const exBtn = document.createElement('button');
  exBtn.id = 'learn-apply-topology';
  exBtn.className = 'learn-btn learn-btn-example';
  exBtn.textContent = 'Bsp. Netz';
  if (scSel.value === 'custom') exBtn.style.display = 'none';
  exBtn.addEventListener('click', () => {
    if (!scSel.value) return;
    applyScenario(scSel.value);
    render();
  });

  btnRow.append(emptyBtn, exBtn);
  panel.appendChild(btnRow);

  // LR row
  const lrRow = document.createElement('div');
  lrRow.className = 'learn-row';
  const lrLbl = document.createElement('span');
  lrLbl.className = 'learn-label';
  lrLbl.textContent = 'Lernrate';
  const lrSlider = document.createElement('input');
  lrSlider.type = 'range'; lrSlider.id = 'learn-lr-slider'; lrSlider.className = 'learn-slider';
  lrSlider.min = '0.001'; lrSlider.max = '1'; lrSlider.step = '0.001';
  lrSlider.value = state.learn.learningRate;
  const lrDisp = document.createElement('span');
  lrDisp.id = 'learn-lr-display'; lrDisp.className = 'learn-value-display';
  lrDisp.textContent = state.learn.learningRate.toFixed(3);
  lrSlider.addEventListener('input', () => {
    state.learn.learningRate = parseFloat(lrSlider.value);
    lrDisp.textContent = state.learn.learningRate.toFixed(3);
  });
  lrRow.append(lrLbl, lrSlider, lrDisp);
  panel.appendChild(lrRow);

  // Speed row
  const spRow = document.createElement('div');
  spRow.className = 'learn-row';
  const spLbl = document.createElement('span');
  spLbl.className = 'learn-label';
  spLbl.textContent = 'Geschw.';
  const spSlider = document.createElement('input');
  spSlider.type = 'range'; spSlider.id = 'learn-speed-slider'; spSlider.className = 'learn-slider';
  // Logarithmische Skala: Slider-Position 0–200 → Geschwindigkeit 1–100 Samples/Tick (= 5–500/Sek)
  const SPEED_MAX = 300, SPEED_STEPS = 200;
  const posToSpeed = p => Math.max(1, Math.round(Math.exp(p / SPEED_STEPS * Math.log(SPEED_MAX))));
  const speedToPos = s => Math.round(Math.log(Math.max(1, s)) / Math.log(SPEED_MAX) * SPEED_STEPS);
  spSlider.min = '0'; spSlider.max = String(SPEED_STEPS); spSlider.step = '1';
  spSlider.value = speedToPos(state.learn.speed);
  const spDisp = document.createElement('span');
  spDisp.id = 'learn-speed-display'; spDisp.className = 'learn-value-display';
  spDisp.textContent = `${state.learn.speed * 5}/Sek`;
  spSlider.addEventListener('input', () => {
    state.learn.speed = posToSpeed(parseInt(spSlider.value));
    spDisp.textContent = `${state.learn.speed * 5}/Sek`;
  });
  spRow.append(spLbl, spSlider, spDisp);
  panel.appendChild(spRow);

  // Controls
  const ctrlRow = document.createElement('div');
  ctrlRow.className = 'learn-controls';
  const btnStart = document.createElement('button');
  btnStart.id = 'learn-btn-start'; btnStart.className = 'learn-btn learn-btn-start';
  btnStart.textContent = '▶ Start';
  btnStart.classList.toggle('active', state.learn.isTraining);
  btnStart.addEventListener('click', () => { if (!state.learn.isTraining) startTraining(); });
  const btnPause = document.createElement('button');
  btnPause.id = 'learn-btn-pause'; btnPause.className = 'learn-btn learn-btn-pause';
  btnPause.textContent = '⏸ Pause';
  btnPause.addEventListener('click', () => { stopTraining(); updateLossPanelDisplay(); saveState(); });
  const btnNext = document.createElement('button');
  btnNext.id = 'learn-btn-next'; btnNext.className = 'learn-btn learn-btn-next';
  btnNext.textContent = '⏭ Nächster';
  btnNext.addEventListener('click', () => {
    if (!state.learn.scenario || !canTrain()) return;
    stopTraining();
    trainTick();
    updateLossPanelDisplay();
    updateLossGraph();
  });
  const btnReset = document.createElement('button');
  btnReset.id = 'learn-btn-reset'; btnReset.className = 'learn-btn learn-btn-reset';
  if (state.learn.topologyDirty) btnReset.classList.add('needs-reset');
  btnReset.textContent = '↺ Reset';
  btnReset.addEventListener('click', () => {
    resetWeightsOnly();
    render();
  });
  ctrlRow.append(btnStart, btnPause, btnNext, btnReset);
  panel.appendChild(ctrlRow);

  // Stats
  const stats = document.createElement('div');
  stats.className = 'learn-stats';
  const epochRow = document.createElement('div');
  epochRow.className = 'learn-stats-row';
  epochRow.innerHTML = `<span class="learn-stats-label">Epoche</span><span id="learn-epoch-display" class="learn-stats-value">${state.learn.epoch}</span>`;
  const lossRow = document.createElement('div');
  lossRow.className = 'learn-stats-row';
  lossRow.innerHTML = `<span class="learn-stats-label">Verlust</span><span id="learn-loss-display" class="learn-stats-value">${state.learn.loss.toFixed(4)}</span>`;
  stats.append(epochRow, lossRow);
  panel.appendChild(stats);

  // Warning
  const warn = document.createElement('div');
  warn.id = 'learn-warning'; warn.className = 'learn-warning';
  panel.appendChild(warn);

  // Loss graph
  const graphTitle = document.createElement('div');
  graphTitle.className = 'learn-section-title';
  graphTitle.textContent = 'Verlaufskurve';
  panel.appendChild(graphTitle);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'loss-graph-svg';
  svg.setAttribute('viewBox', '0 0 200 80');
  svg.setAttribute('preserveAspectRatio', 'none');
  panel.appendChild(svg);
  updateLossGraph(svg);

  return panel;
}

function updateLossPanelDisplay() {
  const e = document.getElementById('learn-epoch-display');
  if (e) e.textContent = state.learn.epoch;
  const l = document.getElementById('learn-loss-display');
  if (l) l.textContent = state.learn.loss.toFixed(5);
  const s = document.getElementById('learn-btn-start');
  if (s) s.classList.toggle('active', state.learn.isTraining);

  if (state.learn.scenario) {
    const sc = getScenarioData();
    if (!sc) return;
    const lastSample = state.learn.lastSample;
    const activeIdx  = lastSample ? sc.data.indexOf(lastSample) : -1;
    const preds      = state.learn.lastPredictions;
    const maxTarget  = Math.max(...sc.data.flatMap(d => d.targets).map(Math.abs), 1);
    document.querySelectorAll('#data-table-body tr').forEach((tr, i) => {
      tr.classList.toggle('dt-row-active', i === activeIdx);
      tr.querySelectorAll('.dt-td-out').forEach((td, j) => {
        td.classList.remove('dt-cell-correct', 'dt-cell-close', 'dt-cell-off', 'dt-cell-wrong');
        if (i === activeIdx && j < preds.length) {
          const err = Math.abs(preds[j] - sc.data[i].targets[j]) / maxTarget;
          if      (err < 0.1)  td.classList.add('dt-cell-correct');
          else if (err < 0.25) td.classList.add('dt-cell-close');
          else if (err < 0.5)  td.classList.add('dt-cell-off');
          else                 td.classList.add('dt-cell-wrong');
        }
      });
    });
  }
}

function updateLossGraph(svgEl) {
  const svg = svgEl || document.getElementById('loss-graph-svg');
  if (!svg) return;
  svg.innerHTML = '';
  const h = state.learn.lossHistory;
  if (h.length < 2) return;
  const maxL = Math.max(...h, 0.001);
  const pts = h.map((v, i) => {
    const x = 5 + (i / (h.length - 1)) * 190;
    const y = 75 - (v / maxL) * 65;
    return `${x},${y}`;
  }).join(' ');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', '#10b981');
  poly.setAttribute('stroke-width', '2');
  poly.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(poly);
  const addText = (x, y, txt, anchor) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('font-size', '9'); t.setAttribute('fill', '#94a3b8');
    t.setAttribute('text-anchor', anchor);
    t.textContent = txt;
    svg.appendChild(t);
  };
  addText(4, 12, maxL.toFixed(3), 'start');
  addText(4, 78, '0', 'start');
}

// ── Eye icons ─────────────────────────────────────────────────────────────
const EYE_OPEN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// ── Error-to-color helper ─────────────────────────────────────────────────
// Gleiche Stufen und Farben wie dt-cell-* in der Datentabelle
function errColor(err) {
  if      (err < 0.10) return { color: '#166534', fill: '#bbf7d0' }; // correct
  else if (err < 0.25) return { color: '#854d0e', fill: '#fef9c3' }; // close
  else if (err < 0.50) return { color: '#9a3412', fill: '#fed7aa' }; // off
  else                 return { color: '#991b1b', fill: '#fecaca' }; // wrong
}

// ── SVG helpers ────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function makeSVGInput(value, onChange) {
  const fo = svgEl('foreignObject', { x: 0, y: 0, width: 1, height: 1 });
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'svg-prop-input';
  inp.value = value;
  inp.step = '0.1';
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    if (!isNaN(v)) onChange(v);
  });
  inp.addEventListener('pointerdown', e => e.stopPropagation());
  fo.appendChild(inp);
  return fo;
}

// ── Neuron SVG layout constants ────────────────────────────────────────────
// viewBox is wider to fit the output indicator on the right
const VB_W = 268, VB_H = 160;
const NB_X = 10, NB_Y = 22, NB_W = 180, NB_H = 72;
const NB_CX = NB_X + NB_W / 2;      // 100
const NB_CY = NB_Y + NB_H / 2;      // 58
const LHX   = NB_X + NB_W / 4;      // 55  (Σ half center)
const RHX   = NB_X + NB_W * 3 / 4;  // 145 (activation half center)
const BIAS_Y_TOP = NB_Y + NB_H;     // 94
const BIAS_X     = LHX;             // 55
const BIAS_Y_BOT = 118;
// Output indicator: line from body edge → small box
const OL_X1 = NB_X + NB_W;         // 190  (line start)
const OL_X2 = OL_X1 + 16;          // 206  (line end)
const OB_X  = OL_X2 + 2;           // 208  (box left)
const OB_W  = 56, OB_H = 22;
const OB_CX = OB_X + OB_W / 2;     // 236

// ── LocalStorage persistence ───────────────────────────────────────────────
const STORAGE_KEY = 'neuron-sim-v2';

/* Schaufenster-Modus (MPSkills). Wird von tools/NeuroLab/tool.js an den
   <iframe> gehängt, wenn NeuroLab in der Vorschau der Landing läuft und
   nicht in einem Raum.

   Dann wird nichts gespeichert und nichts geladen: eine Auslage soll
   niemandem sein Netz umbauen, und sie soll auch nicht das halbfertige
   von gestern zeigen, sondern immer dasselbe vorbereitete Neuron
   (siehe ganz unten, Init). Sonst ändert der Modus nichts — es läuft
   dieselbe Anwendung, und wer darin herumklickt, darf alles. */
const DEMO = new URLSearchParams(location.search).has('demo');

function saveState() {
  if (DEMO) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    phase: state.phase,
    numInputs: state.numInputs,
    inputs: state.inputs,
    inputSpacing: state.inputSpacing,
    colOffsets: state.colOffsets,
    layerHidden: state.layerHidden,
    inputLabels: state.inputLabels,
    outputLabels: state.outputLabels,
    learn: {
      scenario:     state.learn.scenario,
      learningRate: state.learn.learningRate,
      speed:        state.learn.speed,
      epoch:        state.learn.epoch,
      loss:         state.learn.loss,
      lossHistory:  state.learn.lossHistory,
      sampleIdx:    state.learn.sampleIdx,
      panelX:        state.learn.panelX,
      panelY:        state.learn.panelY,
      infoPanelOpen: state.learn.infoPanelOpen,
      customData:     state.learn.customData,
      customFileName: state.learn.customFileName,
    },
    layers: state.layers.map(l => ({
      count: l.count,
      neurons: l.neurons.map(n => ({
        type: n.type,
        weights: [...n.weights],
        disabled: [...(n.disabled || [])],
        bias: n.bias,
        spacing: n.spacing || 0,
      })),
    })),
  }));
}

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data) return false;
    state.phase = data.phase || 'build';
    state.numInputs = data.numInputs ?? 2;
    if (Array.isArray(data.inputs))       data.inputs.forEach((v, i)       => { state.inputs[i] = v; });
    if (Array.isArray(data.inputSpacing)) data.inputSpacing.forEach((v, i) => { state.inputSpacing[i] = v; });
    if (Array.isArray(data.colOffsets))   data.colOffsets.forEach((v, i)   => { state.colOffsets[i] = v; });
    if (Array.isArray(data.layerHidden))  data.layerHidden.forEach((v, i)  => { state.layerHidden[i] = !!v; });
    if (Array.isArray(data.layers)) {
      data.layers.forEach((l, i) => {
        if (!state.layers[i]) return;
        state.layers[i].count = l.count || 0;
        state.layers[i].neurons = (l.neurons || []).map(n => ({
          type: n.type || 'perceptron',
          weights: [...(n.weights || [])],
          disabled: [...(n.disabled || [])],
          bias: n.bias ?? 0,
          spacing: n.spacing || 0,
          _legacyTerminal: n.terminal || false,
        }));
      });
    }
    if (Array.isArray(data.inputLabels))
      data.inputLabels.forEach((v, i) => { state.inputLabels[i] = v || `x${i + 1}`; });
    if (Array.isArray(data.outputLabels)) state.outputLabels = [...data.outputLabels];
    if (data.learn) {
      state.learn.scenario     = data.learn.scenario     ?? null;
      state.learn.learningRate = data.learn.learningRate ?? 0.1;
      state.learn.speed        = data.learn.speed        ?? 5;
      state.learn.epoch        = data.learn.epoch        ?? 0;
      state.learn.loss         = data.learn.loss         ?? 0;
      state.learn.lossHistory  = Array.isArray(data.learn.lossHistory)
        ? data.learn.lossHistory.slice(-200) : [];
      state.learn.sampleIdx    = data.learn.sampleIdx ?? 0;
      state.learn.lastTargets  = [];
      state.learn.panelX        = data.learn.panelX ?? null;
      state.learn.panelY        = data.learn.panelY ?? null;
      state.learn.infoPanelOpen  = data.learn.infoPanelOpen ?? true;
      state.learn.shuffledData   = [];
      state.learn.isTraining     = false;
      state.learn.intervalId     = null;
      state.learn.customData     = data.learn.customData     ?? null;
      state.learn.customFileName = data.learn.customFileName ?? null;
      state.learn.customError    = null;
    }
    // Migration: terminal flag → disabled outgoing connections
    for (let li = 0; li < 4; li++) {
      const layer = state.layers[li];
      if (layer.count === 0) continue;
      const terminalIndices = layer.neurons
        .map((n, i) => (n._legacyTerminal ? i : -1)).filter(i => i >= 0);
      if (terminalIndices.length > 0 && li + 1 < 4 && state.layers[li + 1].count > 0) {
        const nextLayer = state.layers[li + 1];
        const ntIndices = layer.neurons.map((n, i) => n._legacyTerminal ? -1 : i).filter(i => i >= 0);
        nextLayer.neurons.forEach(n => {
          const oldW = [...n.weights];
          n.weights  = Array(layer.count).fill(0);
          n.disabled = Array(layer.count).fill(false);
          ntIndices.forEach((origIdx, oldWIdx) => { n.weights[origIdx] = oldW[oldWIdx] ?? 1; });
          terminalIndices.forEach(idx => { n.disabled[idx] = true; });
        });
      }
      layer.neurons.forEach(n => { delete n._legacyTerminal; });
    }
    for (let li = 0; li < 4; li++) resyncWeights(li);
    return true;
  } catch (e) {
    return false;
  }
}

function updateNeuronDisplays() {
  for (let li = 0; li < 4; li++) {
    const layer = state.layers[li];
    if (layer.count === 0) continue;
    const inputs = getLayerInputs(li);
    const svgs = document.querySelectorAll(`[data-layer="${li}"] .neuron-svg`);
    svgs.forEach((svg, ni) => {
      const neuron = layer.neurons[ni];
      const { z, y } = computeNeuronOutput(neuron, inputs);
      const hidden = state.layerHidden[li];
      const zEl = svg.querySelector('[data-z-display]');
      if (zEl) zEl.textContent = hidden ? 'z = ?' : `z=${fmt(z)}`;
      const yEl = svg.querySelector('[data-y-display]');
      if (yEl) yEl.textContent = hidden ? 'y′ = ?' : `y′=${fmt(y)}`;
      const outEl = svg.querySelector('[data-out-display]');
      if (outEl) outEl.textContent = hidden ? '?' : fmt(y);
      const biasEl = svg.querySelector('[data-bias-display]');
      if (biasEl) biasEl.textContent = `b = ${fmt(neuron.bias)}`;
    });
  }
  if (state.phase === 'learn') {
    document.querySelectorAll('.node-run-input-field').forEach((field, i) => {
      field.value = state.inputs[i] ?? 0;
    });
    document.querySelectorAll('[data-target-idx]').forEach(el => {
      const ni = parseInt(el.dataset.targetIdx);
      const tgt = state.learn.lastTargets[ni];
      el.textContent = tgt !== undefined ? fmt(tgt) : '–';
    });
    // 7-Segment-Anzeige aktualisieren
    if (state.learn.scenario === 'seg7') {
      const inp = state.learn.lastSample ? state.learn.lastSample.inputs : state.inputs.slice(0, 7);
      document.querySelectorAll('[data-seg-line]').forEach(line => {
        const i = parseInt(line.dataset.segLine);
        line.setAttribute('stroke', (inp[i] ?? 0) > 0.5 ? '#10b981' : '#dde1e7');
      });
    }
    // Zielscheiben-Dot aktualisieren
    const dot = document.querySelector('[data-ziel-dot]');
    if (dot && state.learn.scenario === 'zielscheibe' && state.learn.lastSample) {
      const [nx, ny] = state.learn.lastSample.inputs;
      dot.setAttribute('cx', String(140 + nx * 120));
      dot.setAttribute('cy', String(140 + ny * 120));
      dot.setAttribute('display', '');
    } else if (dot) {
      dot.setAttribute('display', 'none');
    }
    // Output-Box-Farben live anpassen
    const sc = getScenarioData();
    const maxT = sc ? Math.max(...sc.data.flatMap(d => d.targets).map(Math.abs), 1) : 1;
    document.querySelectorAll('[data-out-rect]').forEach(rect => {
      const ti   = parseInt(rect.dataset.outRect);
      const pred = state.learn.lastPredictions[ti];
      const tgt  = state.learn.lastTargets[ti];
      if (pred === undefined || tgt === undefined) return;
      const { color, fill } = errColor(Math.abs(pred - tgt) / maxT);
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', color);
      rect.closest('svg').querySelectorAll(`[data-out-color-el="${ti}"]`).forEach(el => {
        el.setAttribute('fill', color);
      });
    });
  }
  drawEdgeOverlay(document.getElementById('network'));
  saveState();
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  /* ⚠️ Die Zeile setzt die Klassen NEU und wischt dabei alles weg, was
     jemand sonst am <body> anhängt — deshalb steht demo-mode hier und
     nicht einmalig beim Start. */
  document.body.className = state.phase + '-phase'
    + (printMode ? ' print-mode' : '')
    + (DEMO ? ' demo-mode' : '');
  renderHeader();
  renderNetwork();
  if (state.phase === 'learn') updateLossPanelDisplay();
  saveState();
}

function renderHeader() {
  document.getElementById('btn-build').classList.toggle('active', state.phase === 'build');
  document.getElementById('btn-run').classList.toggle('active', state.phase === 'run');
  document.getElementById('btn-learn').classList.toggle('active', state.phase === 'learn');
  const hints = { build: 'Verbindungen & Typ konfigurieren', run: 'Eingaben setzen & berechnen', learn: 'Szenario wählen & Netz trainieren' };
  document.getElementById('phase-hint-text').textContent = hints[state.phase] || '';
}

// ── Data table column (learn mode) ─────────────────────────────────────────
function renderDataTableCol() {
  const sc = getScenarioData();
  const col = document.createElement('div');
  col.id = 'data-table-col';
  col.className = 'col data-table-col';

  const hdr = document.createElement('div');
  hdr.className = 'col-header';
  const title = document.createElement('span');
  title.className = 'col-name';
  title.textContent = 'Trainingsdaten';
  hdr.appendChild(title);
  col.appendChild(hdr);
  addColumnDrag(hdr, 5);

  if (!sc) return col;

  const body = document.createElement('div');
  body.className = 'col-body';

  const table = document.createElement('table');
  table.id = 'data-table';
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  sc.inputLabels.slice(0, sc.numInputs).forEach(lbl => {
    const th = document.createElement('th');
    th.textContent = lbl;
    th.className = 'dt-th dt-th-in';
    headerRow.appendChild(th);
  });
  sc.outputLabels.forEach((lbl, idx) => {
    const th = document.createElement('th');
    th.textContent = lbl;
    th.className = 'dt-th dt-th-out' + (idx === 0 ? ' dt-sep' : '');
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.id = 'data-table-body';
  sc.data.forEach(sample => {
    const tr = document.createElement('tr');
    sample.inputs.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      td.className = 'dt-td dt-td-in';
      tr.appendChild(td);
    });
    sample.targets.forEach((v, idx) => {
      const td = document.createElement('td');
      td.textContent = v;
      td.className = 'dt-td dt-td-out' + (idx === 0 ? ' dt-sep' : '');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  col.appendChild(body);

  return col;
}

function renderNetwork() {
  const net = document.getElementById('network');
  net.innerHTML = '';
  const inputCol = renderInputsCol();
  inputCol.style.left = '0px';
  net.appendChild(inputCol);
  for (let i = 0; i < 4; i++) {
    const layerCol = renderLayerCol(i);
    layerCol.style.left = `${state.colOffsets[i + 1] || 0}px`;
    net.appendChild(layerCol);
  }
  drawEdgeOverlay(net);
  if (state.phase === 'learn' && state.learn.scenario) {
    const dataCol = renderDataTableCol();
    dataCol.style.left = `${state.colOffsets[5] || 0}px`;
    net.appendChild(dataCol);
  }
  if (state.phase === 'learn') net.appendChild(renderLearnGroup());
}

// ── Inputs column ──────────────────────────────────────────────────────────
function renderInputsCol() {
  const col = document.createElement('div');
  col.className = 'col col-inputs';
  const inputHdr = makeColHeader('Eingaben', state.numInputs,
    () => { if (state.numInputs > 0) { state.numInputs--; resyncWeights(0); render(); } },
    () => { if (state.numInputs < 10) { state.numInputs++; resyncWeights(0); render(); } },
    state.phase !== 'build'
  );
  col.appendChild(inputHdr);
  if (state.phase === 'run' || state.phase === 'learn') {
    const randomBtn = document.createElement('button');
    randomBtn.className = 'random-btn';
    randomBtn.textContent = 'Zufällig';
    randomBtn.addEventListener('click', () => {
      for (let j = 0; j < state.numInputs; j++) {
        state.inputs[j] = Math.floor(Math.random() * 11) - 5;
      }
      renderNetwork();
    });
    col.appendChild(randomBtn);
  }
  const body = document.createElement('div');
  body.className = 'col-body';
  for (let i = 0; i < state.numInputs; i++) {
    const row = document.createElement('div');
    row.className = 'input-node-row';
    row.style.transform = `translateY(${state.inputSpacing[i] || 0}px)`;
    if (state.phase === 'run' || state.phase === 'learn') {
      const rect = document.createElement('div');
      rect.className = 'node-run-input';
      const lbl = document.createElement('span');
      lbl.className = 'node-run-input-label';
      lbl.textContent = state.inputLabels[i] || `x${i + 1}`;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'node-run-input-field';
      inp.value = state.inputs[i];
      inp.step = '0.1';
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) { state.inputs[i] = v; updateNeuronDisplays(); }
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const v = parseFloat(inp.value);
          if (!isNaN(v)) state.inputs[i] = v;
          const n = state.numInputs;
          const nextIdx = e.shiftKey ? (i - 1 + n) % n : (i + 1) % n;
          const all = document.querySelectorAll('.node-run-input-field');
          if (all[nextIdx]) { all[nextIdx].focus(); all[nextIdx].select(); }
        }
      });
      inp.addEventListener('pointerdown', e => e.stopPropagation());
      rect.append(lbl, inp);
      row.appendChild(rect);
    } else {
      const circle = document.createElement('div');
      circle.className = 'node-circle active-node';
      circle.textContent = state.inputLabels[i] || `x${i + 1}`;
      row.appendChild(circle);
    }
    addPointerDrag(row,
      () => state.inputSpacing[i] || 0,
      v => { state.inputSpacing[i] = v; }
    );
    body.appendChild(row);
  }
  col.appendChild(body);
  return col;
}

// ── Layer column ───────────────────────────────────────────────────────────
const LAYER_NAMES = ['Eingabe-Layer', 'Hidden 1', 'Hidden 2', 'Ausgabe-Layer'];

function renderLayerCol(layerIdx) {
  const layer = state.layers[layerIdx];
  const isOutput = layerIdx === lastActiveLayerIdx();
  const inCount = layerIdx === 0 ? state.numInputs : state.layers[layerIdx - 1].count;

  const col = document.createElement('div');
  col.className = 'col col-layer' + (isOutput ? ' output-layer' : '');
  col.dataset.layer = layerIdx;

  const layerHdr = makeColHeader(LAYER_NAMES[layerIdx], layer.count,
    () => {
      if (layer.count > 0) {
        layer.count--;
        layer.neurons.pop();
        resyncWeights(layerIdx + 1);
        if (state.phase === 'learn') state.learn.topologyDirty = true;
        render();
      }
    },
    () => {
      if (layer.count < 10) {
        const newNeuron = makeNeuron(inCount);
        if (state.phase === 'learn' && inCount > 0) {
          const scale = newNeuron.type === 'relu'
            ? Math.sqrt(2 / inCount) : 1 / Math.sqrt(inCount);
          newNeuron.weights = newNeuron.weights.map(() => (Math.random() - 0.5) * 2 * scale);
        }
        layer.count++;
        layer.neurons.push(newNeuron);
        resyncWeights(layerIdx + 1);
        if (state.phase === 'learn') state.learn.topologyDirty = true;
        render();
      }
    },
    state.phase === 'run'
  );
  col.appendChild(layerHdr);
  addColumnDrag(layerHdr, layerIdx + 1);
  if (state.phase === 'run') {
    const hidden = state.layerHidden[layerIdx];
    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'eye-btn' + (hidden ? ' eye-closed' : '');
    eyeBtn.title = hidden ? 'Ergebnisse anzeigen' : 'Ergebnisse verbergen';
    eyeBtn.innerHTML = hidden ? EYE_CLOSED : EYE_OPEN;
    eyeBtn.addEventListener('click', e => {
      e.stopPropagation();
      state.layerHidden[layerIdx] = !state.layerHidden[layerIdx];
      render();
    });
    layerHdr.insertBefore(eyeBtn, layerHdr.querySelector('.counter'));
  }

  const body = document.createElement('div');
  body.className = 'col-body';

  if (layer.neurons.length === 0) {
    const ph = document.createElement('div');
    ph.className = 'col-empty';
    ph.textContent = 'Leer';
    body.appendChild(ph);
  } else {
    const inputs = getLayerInputs(layerIdx);
    layer.neurons.forEach((neuron, ni) => {
      const { z, y } = computeNeuronOutput(neuron, inputs);
      const card = document.createElement('div');
      card.className = 'neuron-card';
      card.style.transform = `translateY(${neuron.spacing || 0}px)`;
      card.appendChild(buildNeuronSVG(neuron, layerIdx, ni, inputs, z, y));
      addPointerDrag(card,
        () => neuron.spacing || 0,
        v => { neuron.spacing = v; },
        () => { if (!printMode) showNeuronPopup(neuron, layerIdx, ni, inputs, z, y); }
      );
      body.appendChild(card);
    });
  }

  col.appendChild(body);
  return col;
}

// ── Column header with counter ─────────────────────────────────────────────
function makeColHeader(name, count, onMinus, onPlus, locked) {
  const hdr = document.createElement('div');
  hdr.className = 'col-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'col-name';
  nameEl.textContent = name;
  hdr.appendChild(nameEl);
  const counter = document.createElement('div');
  counter.className = 'counter';
  const isLocked = locked !== undefined ? locked : (state.phase === 'run' || state.phase === 'learn');
  const btnM = document.createElement('button');
  btnM.className = 'counter-btn';
  btnM.textContent = '−';
  btnM.disabled = isLocked;
  if (!isLocked) btnM.addEventListener('click', onMinus);
  const num = document.createElement('span');
  num.className = 'counter-val';
  num.textContent = count;
  const btnP = document.createElement('button');
  btnP.className = 'counter-btn';
  btnP.textContent = '+';
  btnP.disabled = isLocked;
  if (!isLocked) btnP.addEventListener('click', onPlus);
  counter.append(btnM, num, btnP);
  hdr.appendChild(counter);
  return hdr;
}

// ── Neuron SVG ─────────────────────────────────────────────────────────────
function buildNeuronSVG(neuron, layerIdx, neuronIdx, inputs, z, y) {
  const act = activations[neuron.type];
  const isRun = state.phase === 'run' || state.phase === 'learn';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('class', 'neuron-svg');
  svg.style.setProperty('--type-color', act.color);

  // ── 1. Body rect + divider ────────────────────────────────────────────────
  svg.appendChild(svgEl('rect', { x: NB_X, y: NB_Y, width: NB_W, height: NB_H, rx: 12, class: 'neuron-body' }));
  svg.appendChild(svgEl('line', { x1: NB_CX, y1: NB_Y + 6, x2: NB_CX, y2: NB_Y + NB_H - 6, class: 'neuron-divider' }));

  // ── Print mode: generic labels ───────────────────────────────────────────
  if (printMode) {
    const sigma = svgEl('text', { x: LHX, y: NB_CY, class: 'neuron-sigma', 'text-anchor': 'middle', 'font-size': '22' });
    sigma.textContent = 'Σ';
    svg.appendChild(sigma);
    const zLabel = svgEl('text', { x: LHX, y: NB_CY + 18, 'text-anchor': 'middle', 'font-size': '10', fill: '#64748b', 'font-weight': '700' });
    zLabel.textContent = '= z';
    svg.appendChild(zLabel);

    const fo = svgEl('foreignObject', { x: RHX - 38, y: 38, width: 76, height: 40 });
    const fDiv = document.createElement('div');
    fDiv.className = 'svg-math';
    fDiv.innerHTML = '<span style="font-size:7px;font-weight:400;color:#64748b">Aktivierungsfunktion</span><span style="font-size:12px">f(z)</span>';
    fo.appendChild(fDiv);
    svg.appendChild(fo);

    svg.appendChild(svgEl('line', { x1: BIAS_X, y1: BIAS_Y_BOT, x2: BIAS_X, y2: BIAS_Y_TOP + 8, class: 'bias-line' }));
    svg.appendChild(svgEl('polygon', {
      points: `${BIAS_X},${BIAS_Y_TOP} ${BIAS_X - 4},${BIAS_Y_TOP + 8} ${BIAS_X + 4},${BIAS_Y_TOP + 8}`,
      fill: '#888',
    }));
    const bLabel = svgEl('text', { x: BIAS_X, y: BIAS_Y_BOT + 13, 'text-anchor': 'middle', 'font-size': '11', fill: '#64748b', 'font-weight': '700', 'data-bias-display': '' });
    bLabel.textContent = `b = ${fmt(neuron.bias)}`;
    svg.appendChild(bLabel);

    svg.appendChild(svgEl('line', { x1: OL_X1, y1: NB_CY, x2: OL_X2, y2: NB_CY, stroke: '#94a3b8', 'stroke-width': '1.5' }));
    svg.appendChild(svgEl('rect', {
      x: OB_X, y: NB_CY - OB_H / 2, width: OB_W, height: OB_H, rx: 4,
      fill: '#f8fafc', stroke: '#d1d5db', 'stroke-width': '1',
    }));
    const outTxt = svgEl('text', { x: OB_CX, y: NB_CY + 5, 'text-anchor': 'middle', 'font-size': '12', fill: '#94a3b8', 'font-weight': '700' });
    outTxt.textContent = 'y′';
    svg.appendChild(outTxt);

    const printNameLabel = svgEl('text', {
      x: NB_CX, y: NB_Y - 7,
      'text-anchor': 'middle', 'font-size': '11', 'font-weight': '700', fill: act.color,
    });
    printNameLabel.textContent = act.fullName;
    svg.appendChild(printNameLabel);

    return svg;
  }

  // ── 2. Interior text ──────────────────────────────────────────────────────
  const formulas = act.shortLines;
  const twoLines = formulas.length > 1;

  if (isRun) {
    const layerIsHidden = state.layerHidden[layerIdx];
    const sigma = svgEl('text', { x: LHX, y: NB_CY - 6, class: 'neuron-sigma', 'text-anchor': 'middle', 'font-size': '20' });
    sigma.textContent = 'Σ';
    svg.appendChild(sigma);
    const zVal = svgEl('text', { x: LHX, y: NB_CY + 17, 'text-anchor': 'middle', 'font-size': '10', fill: layerIsHidden ? '#94a3b8' : '#444', 'font-weight': '700', 'data-z-display': '' });
    zVal.textContent = layerIsHidden ? 'z = ?' : `z=${fmt(z)}`;
    svg.appendChild(zVal);
    {
      const foW = 76, foH = twoLines ? 26 : 22;
      const fo = svgEl('foreignObject', { x: RHX - foW / 2, y: 38, width: foW, height: foH });
      const fDiv = document.createElement('div');
      fDiv.className = 'svg-math';
      fDiv.innerHTML = formulas.map(f => `<span>${f}</span>`).join('');
      fo.appendChild(fDiv);
      svg.appendChild(fo);
    }
    const yVal = svgEl('text', { x: RHX, y: NB_CY + (twoLines ? 18 : 12), 'text-anchor': 'middle', 'font-size': '10', fill: layerIsHidden ? '#94a3b8' : act.color, 'font-weight': '700', 'data-y-display': '' });
    yVal.textContent = layerIsHidden ? 'y′ = ?' : `y′=${fmt(y)}`;
    svg.appendChild(yVal);
  } else {
    const sigma = svgEl('text', { x: LHX, y: NB_CY + 8, class: 'neuron-sigma', 'text-anchor': 'middle', 'font-size': '22' });
    sigma.textContent = 'Σ';
    svg.appendChild(sigma);
    {
      const foW = 76, foH = twoLines ? 28 : 22;
      const fo = svgEl('foreignObject', { x: RHX - foW / 2, y: twoLines ? 44 : 47, width: foW, height: foH });
      const fDiv = document.createElement('div');
      fDiv.className = 'svg-math';
      fDiv.innerHTML = formulas.map(f => `<span>${f}</span>`).join('');
      fo.appendChild(fDiv);
      svg.appendChild(fo);
    }
  }

  // ── 3. Type name (informational) ──────────────────────────────────────────
  const nameLabel = svgEl('text', {
    x: NB_CX, y: NB_Y - 7,
    'text-anchor': 'middle', 'font-size': '11', 'font-weight': '700', fill: act.color,
  });
  nameLabel.textContent = act.fullName;
  svg.appendChild(nameLabel);

  // ── 4. Bias line + arrow ──────────────────────────────────────────────────
  svg.appendChild(svgEl('line', { x1: BIAS_X, y1: BIAS_Y_BOT, x2: BIAS_X, y2: BIAS_Y_TOP + 8, class: 'bias-line' }));
  svg.appendChild(svgEl('polygon', {
    points: `${BIAS_X},${BIAS_Y_TOP} ${BIAS_X - 4},${BIAS_Y_TOP + 8} ${BIAS_X + 4},${BIAS_Y_TOP + 8}`,
    fill: '#888',
  }));
  if (state.phase === 'build') {
    const bLabel = svgEl('text', { x: BIAS_X, y: BIAS_Y_BOT + 4, 'font-size': '8', 'font-weight': '700', fill: '#94a3b8', 'text-anchor': 'middle' });
    bLabel.textContent = 'Bias';
    svg.appendChild(bLabel);
    const bFo = makeSVGInput(neuron.bias, v => { neuron.bias = v; });
    bFo.setAttribute('x', BIAS_X - 22);
    bFo.setAttribute('y', BIAS_Y_BOT + 8);
    bFo.setAttribute('width', '44');
    bFo.setAttribute('height', '22');
    svg.appendChild(bFo);
  } else {
    const bText = svgEl('text', { x: BIAS_X, y: BIAS_Y_BOT + 14, class: 'bias-label', 'text-anchor': 'middle', 'font-size': '10', 'data-bias-display': '' });
    bText.textContent = `b = ${fmt(neuron.bias)}`;
    svg.appendChild(bText);
  }

  // ── 5. Output indicator: line + box ──────────────────────────────────────
  svg.appendChild(svgEl('line', { x1: OL_X1, y1: NB_CY, x2: OL_X2, y2: NB_CY, stroke: '#94a3b8', 'stroke-width': '1.5' }));
  if (isRun) {
    const layerIsHidden = state.layerHidden[layerIdx];
    const termIdx  = state.phase === 'learn'
      ? getTerminalNeurons().findIndex(t => t.li === layerIdx && t.ni === neuronIdx)
      : -1;
    let outColor, outFill;
    if (state.phase === 'learn' && termIdx >= 0) {
      const pred = state.learn.lastPredictions[termIdx];
      const tgt  = state.learn.lastTargets[termIdx];
      if (pred !== undefined && tgt !== undefined) {
        const sc   = getScenarioData();
        const maxT = sc ? Math.max(...sc.data.flatMap(d => d.targets).map(Math.abs), 1) : 1;
        const err  = Math.abs(pred - tgt) / maxT;
        ({ color: outColor, fill: outFill } = errColor(err));
      } else {
        outColor = '#10b981'; outFill = '#d1fae5';
      }
    } else if (state.phase === 'learn') {
      outColor = '#10b981'; outFill = '#d1fae5';
    } else {
      outColor = '#f59e0b'; outFill = '#fffbeb';
    }
    // In learn mode, non-last-layer neurons: show clickable OUT toggle (like build mode)
    const learnMidLayer = state.phase === 'learn' && layerIdx !== lastActiveLayerIdx();
    if (learnMidLayer) {
      const isOut = isOutputNeuron(layerIdx, neuronIdx);
      const doToggle = e => {
        e.stopPropagation();
        const nowOut = isOutputNeuron(layerIdx, neuronIdx);
        state.layers[layerIdx + 1].neurons.forEach(n => {
          if (!n.disabled) n.disabled = Array(n.weights.length).fill(false);
          n.disabled[neuronIdx] = !nowOut;
        });
        state.learn.topologyDirty = true;
        render();
      };
      if (isOut && termIdx >= 0 && state.outputLabels[termIdx]) {
        const boxH = 54, boxTop = NB_CY - boxH / 2;
        const rect = svgEl('rect', {
          x: OB_X, y: boxTop, width: OB_W, height: boxH, rx: 4,
          fill: outFill, stroke: outColor, 'stroke-width': '1.5', style: 'cursor:pointer',
          'data-out-rect': String(termIdx),
        });
        rect.addEventListener('pointerdown', doToggle);
        svg.appendChild(rect);
        const lblTxt = svgEl('text', { x: OB_CX, y: boxTop + 14, 'text-anchor': 'middle', 'font-size': '8', fill: outColor, 'font-weight': '700', 'data-out-color-el': String(termIdx) });
        lblTxt.textContent = state.outputLabels[termIdx];
        svg.appendChild(lblTxt);
        const valTxt = svgEl('text', { x: OB_CX, y: boxTop + 30, 'text-anchor': 'middle', 'font-size': '13', fill: outColor, 'font-weight': '700', 'data-out-display': '', 'data-out-color-el': String(termIdx) });
        valTxt.textContent = layerIsHidden ? '?' : fmt(y);
        svg.appendChild(valTxt);
        const tgt = state.learn.lastTargets[termIdx];
        const sollLbl = svgEl('text', { x: OB_X + 5, y: boxTop + 46, 'font-size': '7', fill: '#6366f1', 'font-weight': '700' });
        sollLbl.textContent = 'Soll';
        svg.appendChild(sollLbl);
        const sollVal = svgEl('text', { x: OB_X + OB_W - 5, y: boxTop + 46, 'text-anchor': 'end', 'font-size': '7', fill: '#3730a3', 'font-weight': '700', 'data-target-idx': String(termIdx) });
        sollVal.textContent = tgt !== undefined ? fmt(tgt) : '–';
        svg.appendChild(sollVal);
      } else {
        const boxFill2   = isOut ? '#d1fae5' : '#f8fafc';
        const boxStroke2 = isOut ? '#10b981' : '#d1d5db';
        const rect = svgEl('rect', {
          x: OB_X, y: NB_CY - OB_H / 2, width: OB_W, height: OB_H, rx: 4,
          fill: boxFill2, stroke: boxStroke2, 'stroke-width': isOut ? '1.5' : '1', style: 'cursor:pointer',
        });
        rect.addEventListener('pointerdown', doToggle);
        svg.appendChild(rect);
        const outTxt = svgEl('text', { x: OB_CX, y: NB_CY + 5, 'text-anchor': 'middle', 'font-size': '11', fill: isOut ? '#10b981' : '#d1d5db', 'font-weight': '700' });
        outTxt.textContent = isOut ? 'OUT' : '–';
        svg.appendChild(outTxt);
      }
    } else if (termIdx >= 0 && !layerIsHidden) {
      // 3-Zeilen-Box: Label / Wert / Soll
      const boxH = 54, boxTop = NB_CY - boxH / 2;
      svg.appendChild(svgEl('rect', {
        x: OB_X, y: boxTop, width: OB_W, height: boxH, rx: 4,
        fill: outFill, stroke: outColor, 'stroke-width': '1.5',
        'data-out-rect': String(termIdx),
      }));
      const lblTxt = svgEl('text', { x: OB_CX, y: boxTop + 14, 'text-anchor': 'middle', 'font-size': '8', fill: outColor, 'font-weight': '700', 'data-out-color-el': String(termIdx) });
      lblTxt.textContent = state.outputLabels[termIdx] || '';
      svg.appendChild(lblTxt);
      const valTxt = svgEl('text', { x: OB_CX, y: boxTop + 30, 'text-anchor': 'middle', 'font-size': '13', fill: outColor, 'font-weight': '700', 'data-out-display': '', 'data-out-color-el': String(termIdx) });
      valTxt.textContent = fmt(y);
      svg.appendChild(valTxt);
      const tgt = state.learn.lastTargets[termIdx];
      const sollLbl = svgEl('text', { x: OB_X + 5, y: boxTop + 46, 'font-size': '7', fill: '#6366f1', 'font-weight': '700' });
      sollLbl.textContent = 'Soll';
      svg.appendChild(sollLbl);
      const sollVal = svgEl('text', { x: OB_X + OB_W - 5, y: boxTop + 46, 'text-anchor': 'end', 'font-size': '7', fill: '#3730a3', 'font-weight': '700', 'data-target-idx': String(termIdx) });
      sollVal.textContent = tgt !== undefined ? fmt(tgt) : '–';
      svg.appendChild(sollVal);
    } else {
      svg.appendChild(svgEl('rect', {
        x: OB_X, y: NB_CY - OB_H / 2, width: OB_W, height: OB_H, rx: 4,
        fill: layerIsHidden ? '#f8fafc' : outFill,
        stroke: layerIsHidden ? '#94a3b8' : outColor,
        'stroke-width': '1.5',
      }));
      const outTxt = svgEl('text', { x: OB_CX, y: NB_CY + 4, 'text-anchor': 'middle', 'font-size': layerIsHidden ? '14' : '10', fill: layerIsHidden ? '#94a3b8' : outColor, 'font-weight': '700', 'data-out-display': '' });
      outTxt.textContent = layerIsHidden ? '?' : fmt(y);
      svg.appendChild(outTxt);
    }
  } else {
    // Build-Modus: für nicht-letzte Schichten ist die Output-Box anklickbar
    const isLastLayer = layerIdx === lastActiveLayerIdx();
    if (!isLastLayer) {
      const isOut    = isOutputNeuron(layerIdx, neuronIdx);
      const boxFill   = isOut ? '#fffbeb' : '#f8fafc';
      const boxStroke = isOut ? '#f59e0b' : '#d1d5db';
      const boxSW     = isOut ? '1.5' : '1';
      const boxText   = isOut ? 'OUT' : '–';
      const boxColor  = isOut ? '#f59e0b' : '#d1d5db';
      const rect = svgEl('rect', {
        x: OB_X, y: NB_CY - OB_H / 2, width: OB_W, height: OB_H, rx: 4,
        fill: boxFill, stroke: boxStroke, 'stroke-width': boxSW, style: 'cursor:pointer',
      });
      rect.addEventListener('pointerdown', e => {
        e.stopPropagation();
        const nowOut = isOutputNeuron(layerIdx, neuronIdx);
        state.layers[layerIdx + 1].neurons.forEach(n => {
          if (!n.disabled) n.disabled = Array(n.weights.length).fill(false);
          n.disabled[neuronIdx] = !nowOut;
        });
        render();
      });
      svg.appendChild(rect);
      const outTxt = svgEl('text', { x: OB_CX, y: NB_CY + 5, 'text-anchor': 'middle', 'font-size': '11', fill: boxColor, 'font-weight': '700' });
      outTxt.textContent = boxText;
      svg.appendChild(outTxt);
    } else {
      svg.appendChild(svgEl('rect', {
        x: OB_X, y: NB_CY - OB_H / 2, width: OB_W, height: OB_H, rx: 4,
        fill: '#f8fafc', stroke: '#d1d5db', 'stroke-width': '1',
      }));
      const outTxt = svgEl('text', { x: OB_CX, y: NB_CY + 5, 'text-anchor': 'middle', 'font-size': '14', fill: '#d1d5db' });
      outTxt.textContent = '–';
      svg.appendChild(outTxt);
    }
  }

  return svg;
}

// ── Edge overlay ───────────────────────────────────────────────────────────
// SVG viewBox constants mirrored here for anchor calculations
const VB_IN_X  = 10;   // NB_X  — left edge of neuron body
const VB_OUT_X = 236;  // OB_CX — center of output box
const VB_MID_Y = 58;   // NB_CY — vertical center of neuron body
const VB_W_REF = 268;  // viewBox width
const VB_H_REF = 160;  // viewBox height

function drawEdgeOverlay(net) {
  const old = net.querySelector('.edge-overlay');
  if (old) old.remove();

  const netRect = net.getBoundingClientRect();
  const sl = net.scrollLeft, st = net.scrollTop;

  function toNet(vx, vy) {
    return { x: vx - netRect.left + sl, y: vy - netRect.top + st };
  }

  // Map a viewBox coordinate on a neuron-svg element to net-space coords
  function svgPt(svgEl, vbX, vbY) {
    const r = svgEl.getBoundingClientRect();
    const sx = r.width  / VB_W_REF;
    const sy = r.height / VB_H_REF;
    return toNet(r.left + vbX * sx, r.top + vbY * sy);
  }

  const overlaySvg = svgEl('svg', {
    class: 'edge-overlay',
    style: 'position:absolute;top:0;left:0;pointer-events:none',
    width: net.scrollWidth,
    height: net.scrollHeight,
  });

  const inputAnchors = (state.phase === 'run' || state.phase === 'learn')
    ? Array.from(net.querySelectorAll('.col-inputs .node-run-input'))
    : Array.from(net.querySelectorAll('.col-inputs .node-circle'));

  for (let li = 0; li < 4; li++) {
    const layer = state.layers[li];
    if (layer.count === 0) continue;

    let sources;
    if (li === 0) {
      // Input circles: anchor at right-center of the circle
      sources = inputAnchors.slice(0, state.numInputs).map(el => {
        const r = el.getBoundingClientRect();
        const anchorX = (state.phase === 'run' || state.phase === 'learn') ? r.right : (r.left + r.right) / 2;
        return toNet(anchorX, (r.top + r.bottom) / 2);
      });
    } else {
      const prevSvgs = Array.from(net.querySelectorAll(`[data-layer="${li - 1}"] .neuron-svg`));
      if (!prevSvgs.length) continue;
      sources = prevSvgs.map(el => svgPt(el, VB_OUT_X, VB_MID_Y));
    }

    const targetSvgs = Array.from(net.querySelectorAll(`[data-layer="${li}"] .neuron-svg`));

    targetSvgs.forEach((targetSvg, ni) => {
      const neuron = layer.neurons[ni];
      // Target: left edge of neuron body at vertical center
      const tgt = svgPt(targetSvg, VB_IN_X, VB_MID_Y);

      sources.forEach((src, si) => {
        if (neuron.disabled?.[si]) return;
        const w = neuron.weights[si] ?? 1;
        if (Math.abs(w) < 0.01) return;
        const sw = printMode ? 2 : Math.max(0.5, Math.min(Math.abs(w) * 2, 6));
        const color = activations[neuron.type].color;

        overlaySvg.appendChild(svgEl('line', {
          x1: src.x, y1: src.y,
          x2: tgt.x, y2: tgt.y,
          stroke: color,
          'stroke-width': sw,
          'stroke-opacity': '0.7',
        }));

        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        const label = fmt(w);
        /* 10 px, nicht 16. Das Gewicht an der Kante ist nicht wichtiger
           als die Zahlen IM Neuron (z und y′ stehen auf 10, der Bias auf
           10–11) — vorher war es die mit Abstand größte Schrift auf der
           Fläche. Bei einem Netz mit mehreren Neuronen je Schicht laufen
           außerdem viele Kanten auf denselben Punkt zu, und dann legen
           sich die Kästchen übereinander statt nebeneinander.
           Monospace ≈ 0,6 em breit, daher 6 px je Zeichen. */
        const lw = label.length * 6 + 7;
        overlaySvg.appendChild(svgEl('rect', {
          x: mx - lw / 2, y: my - 7, width: lw, height: 13, rx: 3,
          fill: 'white', 'fill-opacity': '0.9',
        }));
        const t = svgEl('text', {
          x: mx, y: my + 3.5,
          'text-anchor': 'middle', 'font-size': '10', 'font-weight': '700',
          'font-family': 'monospace', fill: color,
        });
        t.textContent = label;
        overlaySvg.appendChild(t);
      });
    });
  }

  net.insertBefore(overlaySvg, net.firstChild);
}

// ── Combined popup ─────────────────────────────────────────────────────────
let popupDirty = false;

function showNeuronPopup(neuron, layerIdx, neuronIdx, inputs, z, y) {
  const act = activations[neuron.type];
  const contentEl = document.getElementById('popup-content');
  contentEl.innerHTML = '';
  popupDirty = false;

  document.getElementById('popup-title').textContent =
    `${LAYER_NAMES[layerIdx]} · Neuron ${neuronIdx + 1}`;

  if (state.phase === 'build') {
    buildBuildPopupContent(contentEl, neuron, layerIdx);
  } else if (state.phase === 'learn') {
    buildLearnPopupContent(contentEl, neuron, layerIdx, neuronIdx);
  } else {
    buildRunPopupContent(contentEl, neuron, layerIdx, inputs, z, y, act);
  }
  document.getElementById('popup-overlay').classList.remove('hidden');
}

function buildLearnPopupContent(contentEl, neuron, layerIdx, neuronIdx) {
  // Type selector
  const typeRow = document.createElement('div');
  typeRow.className = 'popup-type-row';
  Object.entries(activations).forEach(([key, a]) => {
    const btn = document.createElement('button');
    btn.className = 'popup-type-btn' + (neuron.type === key ? ' selected' : '');
    btn.style.setProperty('--btn-color', a.color);
    btn.textContent = a.fullName;
    btn.addEventListener('click', () => {
      neuron.type = key;
      popupDirty = true;
      state.learn.topologyDirty = true;
      typeRow.querySelectorAll('.popup-type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    typeRow.appendChild(btn);
  });
  contentEl.appendChild(typeRow);

  // Connection toggles
  const grid = document.createElement('div');
  grid.className = 'popup-grid';

  const left = document.createElement('div');
  left.className = 'popup-col';
  const wtitle = document.createElement('div');
  wtitle.className = 'popup-section-title';
  wtitle.textContent = 'Verbindungen';
  left.appendChild(wtitle);

  if (neuron.weights.length === 0) {
    const d = document.createElement('div');
    d.className = 'popup-muted';
    d.textContent = 'Keine Inputs';
    left.appendChild(d);
  } else {
    neuron.weights.forEach((_, i) => {
      const row = document.createElement('div');
      row.className = 'popup-weight-row';
      const isDisabled = !!(neuron.disabled?.[i]);

      const disBtn = document.createElement('button');
      disBtn.className = 'popup-disconnect-btn' + (isDisabled ? ' disconnected' : '');
      disBtn.title = isDisabled ? 'Verbindung wiederherstellen' : 'Verbindung trennen';
      disBtn.textContent = '×';
      disBtn.addEventListener('click', () => {
        if (!neuron.disabled) neuron.disabled = Array(neuron.weights.length).fill(false);
        neuron.disabled[i] = !neuron.disabled[i];
        popupDirty = true;
        state.learn.topologyDirty = true;
        disBtn.classList.toggle('disconnected', neuron.disabled[i]);
        disBtn.title = neuron.disabled[i] ? 'Verbindung wiederherstellen' : 'Verbindung trennen';
        lbl.style.textDecoration = neuron.disabled[i] ? 'line-through' : '';
        lbl.style.color = neuron.disabled[i] ? '#94a3b8' : '';
      });

      const lbl = document.createElement('span');
      lbl.className = 'popup-weight-label';
      lbl.textContent = `w${i + 1}`;
      if (isDisabled) { lbl.style.textDecoration = 'line-through'; lbl.style.color = '#94a3b8'; }

      row.append(disBtn, lbl);
      left.appendChild(row);
    });
  }

  const right = document.createElement('div');
  right.className = 'popup-col';
  const note = document.createElement('div');
  note.className = 'popup-section-title';
  note.textContent = 'Gewichte & Bias';
  right.appendChild(note);
  const noteText = document.createElement('div');
  noteText.className = 'popup-muted';
  noteText.style.fontSize = '0.8rem';
  noteText.style.lineHeight = '1.5';
  noteText.textContent = 'Werden vom Lernalgorithmus gesetzt und angepasst.';
  right.appendChild(noteText);

  grid.append(left, right);
  contentEl.appendChild(grid);
}

function buildBuildPopupContent(contentEl, neuron, layerIdx) {
  // Type selector row
  const typeRow = document.createElement('div');
  typeRow.className = 'popup-type-row';
  Object.entries(activations).forEach(([key, a]) => {
    const btn = document.createElement('button');
    btn.className = 'popup-type-btn' + (neuron.type === key ? ' selected' : '');
    btn.style.setProperty('--btn-color', a.color);
    btn.textContent = a.fullName;
    btn.addEventListener('click', () => {
      neuron.type = key;
      popupDirty = true;
      typeRow.querySelectorAll('.popup-type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const actEl = contentEl.querySelector('.popup-act-formula');
      if (actEl) actEl.innerHTML = activations[key].formula;
    });
    typeRow.appendChild(btn);
  });
  contentEl.appendChild(typeRow);

  // 2-column grid
  const grid = document.createElement('div');
  grid.className = 'popup-grid';

  // LEFT: editable weights + bias
  const left = document.createElement('div');
  left.className = 'popup-col';
  const wtitle = document.createElement('div');
  wtitle.className = 'popup-section-title';
  wtitle.textContent = 'Gewichte';
  left.appendChild(wtitle);
  if (neuron.weights.length === 0) {
    const d = document.createElement('div');
    d.className = 'popup-muted';
    d.textContent = 'Keine Inputs';
    left.appendChild(d);
  } else {
    neuron.weights.forEach((w, i) => {
      const row = document.createElement('div');
      row.className = 'popup-weight-row';
      const isDisabled = !!(neuron.disabled?.[i]);

      const disBtn = document.createElement('button');
      disBtn.className = 'popup-disconnect-btn' + (isDisabled ? ' disconnected' : '');
      disBtn.title = isDisabled ? 'Verbindung wiederherstellen' : 'Verbindung trennen';
      disBtn.textContent = '×';
      disBtn.addEventListener('click', () => {
        if (!neuron.disabled) neuron.disabled = Array(neuron.weights.length).fill(false);
        neuron.disabled[i] = !neuron.disabled[i];
        popupDirty = true;
        const nowDisabled = neuron.disabled[i];
        disBtn.classList.toggle('disconnected', nowDisabled);
        disBtn.title = nowDisabled ? 'Verbindung wiederherstellen' : 'Verbindung trennen';
        inp.disabled = nowDisabled;
        inp.classList.toggle('grayed', nowDisabled);
      });

      const lbl = document.createElement('span');
      lbl.className = 'popup-weight-label';
      lbl.textContent = `w${i + 1}`;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = w;
      inp.step = '0.1';
      inp.className = 'popup-weight-input' + (isDisabled ? ' grayed' : '');
      inp.disabled = isDisabled;
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) { neuron.weights[i] = v; popupDirty = true; }
      });
      row.append(disBtn, lbl, inp);
      left.appendChild(row);
    });
  }

  // Bias row (cannot be disconnected)
  const bDivider = document.createElement('div');
  bDivider.className = 'popup-bias-divider';
  left.appendChild(bDivider);
  const biasRow = document.createElement('div');
  biasRow.className = 'popup-weight-row';
  const bSpacer = document.createElement('span');
  bSpacer.className = 'popup-disconnect-spacer';
  const bLbl = document.createElement('span');
  bLbl.className = 'popup-weight-label';
  bLbl.textContent = 'b';
  const bInp = document.createElement('input');
  bInp.type = 'number';
  bInp.value = neuron.bias;
  bInp.step = '0.1';
  bInp.className = 'popup-weight-input';
  bInp.addEventListener('input', () => {
    const v = parseFloat(bInp.value);
    if (!isNaN(v)) { neuron.bias = v; popupDirty = true; }
  });
  biasRow.append(bSpacer, bLbl, bInp);
  left.appendChild(biasRow);

  // RIGHT: general formulas
  const right = document.createElement('div');
  right.className = 'popup-col';

  const stitle = document.createElement('div');
  stitle.className = 'popup-section-title';
  stitle.textContent = 'Summierung';
  right.appendChild(stitle);
  const sumEl = document.createElement('div');
  sumEl.className = 'popup-formula';
  sumEl.innerHTML = buildGeneralSumFormula(layerIdx, neuron.weights.length, neuron.disabled);
  right.appendChild(sumEl);

  const atitle = document.createElement('div');
  atitle.className = 'popup-section-title';
  atitle.style.marginTop = '14px';
  atitle.textContent = 'Aktivierungsfunktion';
  right.appendChild(atitle);
  const actEl = document.createElement('div');
  actEl.className = 'popup-formula popup-act-formula';
  actEl.innerHTML = activations[neuron.type].formula;
  right.appendChild(actEl);

  grid.append(left, right);
  contentEl.appendChild(grid);
}

function buildRunPopupContent(contentEl, neuron, layerIdx, inputs, z, y, act) {
  const grid = document.createElement('div');
  grid.className = 'popup-grid';

  // LEFT: summation details
  const left = document.createElement('div');
  left.className = 'popup-col';

  const stitle = document.createElement('div');
  stitle.className = 'popup-section-title';
  stitle.textContent = 'Summierung (Σ)';
  left.appendChild(stitle);

  const genEl = document.createElement('div');
  genEl.className = 'popup-formula';
  genEl.innerHTML = buildGeneralSumFormula(layerIdx, neuron.weights.length, neuron.disabled);
  left.appendChild(genEl);

  const inputLabels = layerIdx === 0
    ? inputs.map((_, i) => `x<sub>${i + 1}</sub>`)
    : inputs.map((_, i) => `y′<sub>${i + 1}</sub>`);
  inputs.forEach((x, i) => {
    if (neuron.disabled?.[i]) return;
    const term = (neuron.weights[i] ?? 0) * x;
    const d = document.createElement('div');
    d.className = 'popup-term';
    d.innerHTML = `w${i + 1}·${inputLabels[i]} = ${fmt(neuron.weights[i] ?? 0)}·${fmt(x)} = <strong>${fmt(term)}</strong>`;
    left.appendChild(d);
  });
  if (inputs.length === 0) {
    const d = document.createElement('div');
    d.className = 'popup-term popup-muted';
    d.textContent = 'Keine Inputs';
    left.appendChild(d);
  }
  const bRow = document.createElement('div');
  bRow.className = 'popup-term';
  bRow.innerHTML = `b = <strong>${fmt(neuron.bias)}</strong>`;
  left.appendChild(bRow);
  const zResult = document.createElement('div');
  zResult.className = 'popup-result';
  zResult.innerHTML = `z = <strong>${fmt(z)}</strong>`;
  left.appendChild(zResult);

  // RIGHT: activation function
  const right = document.createElement('div');
  right.className = 'popup-col';

  const atitle = document.createElement('div');
  atitle.className = 'popup-section-title';
  atitle.textContent = 'Aktivierungsfunktion';
  right.appendChild(atitle);
  const fEl = document.createElement('div');
  fEl.className = 'popup-formula';
  fEl.innerHTML = act.formula;
  right.appendChild(fEl);
  const appliedEl = document.createElement('div');
  appliedEl.className = 'popup-term';
  appliedEl.innerHTML = act.apply(z);
  right.appendChild(appliedEl);
  const yResult = document.createElement('div');
  yResult.className = 'popup-result';
  yResult.innerHTML = `y′ = <strong>${fmt(y)}</strong>`;
  right.appendChild(yResult);

  grid.append(left, right);
  contentEl.appendChild(grid);
}

function buildGeneralSumFormula(layerIdx, count, disabled) {
  const prefix = layerIdx === 0 ? 'x' : 'y′';
  const activeIndices = Array.from({ length: count }, (_, i) => i)
    .filter(i => !(disabled?.[i]));
  if (activeIndices.length === 0) return 'z = b';
  const terms = activeIndices.map(i =>
    `w<sub>${i + 1}</sub>·${prefix}<sub>${i + 1}</sub>`
  );
  return 'z = ' + terms.join(' + ') + ' + b';
}

// ── Popup close ─────────────────────────────────────────────────────────────
function closePopup() {
  document.getElementById('popup-overlay').classList.add('hidden');
  if (popupDirty) { popupDirty = false; render(); }
}

document.getElementById('popup-close').addEventListener('click', closePopup);
document.getElementById('popup-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('popup-overlay')) closePopup();
});

// ── Phase buttons ──────────────────────────────────────────────────────────
document.getElementById('btn-build').addEventListener('click', () => { stopTraining(); state.phase = 'build'; render(); });
document.getElementById('btn-run').addEventListener('click', () => { stopTraining(); state.phase = 'run'; render(); });
document.getElementById('btn-learn').addEventListener('click', () => { state.phase = 'learn'; render(); });

// ── Reset ──────────────────────────────────────────────────────────────────
function resetState() {
  stopTraining();
  state.phase = 'build';
  state.numInputs = 2;
  state.inputs.fill(0);
  state.inputSpacing.fill(0);
  state.colOffsets.fill(0);
  state.layerHidden.fill(false);
  state.inputLabels  = ['x1','x2','x3','x4','x5','x6','x7','x8','x9','x10'];
  state.outputLabels = [];
  state.learn.scenario     = null;
  state.learn.learningRate = 0.1;
  state.learn.speed        = 5;
  state.learn.isTraining   = false;
  state.learn.epoch        = 0;
  state.learn.loss         = 0;
  state.learn.lossHistory  = [];
  state.learn.sampleIdx    = 0;
  state.learn.lastTargets  = [];
  state.learn.panelX        = null;
  state.learn.panelY        = null;
  state.learn.infoPanelOpen  = true;
  state.learn.shuffledData   = [];
  state.learn.intervalId     = null;
  state.learn.customData     = null;
  state.learn.customError    = null;
  state.learn.customFileName = null;
  for (let i = 0; i < state.layers.length; i++) {
    state.layers[i].count = 0;
    state.layers[i].neurons = [];
  }
  state.layers[0].count = 1;
  state.layers[0].neurons = [{ type: 'perceptron', weights: [1, 1], disabled: [false, false], bias: 0, spacing: 0 }];
}
document.getElementById('btn-reset').addEventListener('click', () => { resetState(); render(); });
document.getElementById('btn-print').addEventListener('click', () => {
  printMode = !printMode;
  document.getElementById('btn-print').classList.toggle('active', printMode);
  render();
});

// ── Schaufenster-Netz ──────────────────────────────────────────────────────
/* Was im Schaufenster steht, wenn ?demo=1 gesetzt ist (siehe DEMO oben).

   Gezeigt wird nicht der Anfang, sondern das Beste, was die Anwendung kann:
   ein mehrschichtiges Netz in der Phase LERNEN. Ein einzelnes Neuron, an dem
   jemand von Hand Gewichte einstellt, ist der erste Schritt einer Stunde —
   die Vorschau hat aber zehn Sekunden und muss in denen zeigen, wofür man
   das Ding aufmacht: dass sich die Kanten von selbst verändern, bis die
   Ausgabe stimmt.

   XOR, weil es die Aufgabe ist, an der ein EINZELNES Neuron scheitert: die
   vier Fälle lassen sich nicht mit einer Geraden trennen. Genau deshalb
   braucht es die Schichten dazwischen, und genau das sieht man hier
   passieren. Vier Datenzeilen sind außerdem wenig genug, dass die Tabelle
   daneben vollständig lesbar bleibt.

   Als `custom`-Datensatz und nicht als vierter Eintrag in SCENARIOS: das
   Schaufenster soll dem Sortiment der Anwendung nichts hinzufügen, das im
   Unterricht dann in der Auswahlliste steht. Der Weg über customData ist
   derselbe, den eine hochgeladene CSV nimmt.

   3 → 3 → 1 mit tanh: sieben Neuronen auf drei Schichten. Klein genug, dass
   die Kanten einzeln zu verfolgen sind, und groß genug, dass es drei Spalten
   füllt. Lernrate 0,6 und Tempo 300/Sek stehen hoch, weil eine Vorschau
   keine 2.000 Epochen abwarten kann — beides sind Regler, die in der
   Anwendung ohnehin danebenstehen.

   ⚠️ Die Zahlen sind GEMESSEN und nicht geschätzt: je 30 Läufe mit frisch
   gewürfelten Startgewichten, gezählt wurde, wie oft und wie schnell der
   Verlust unter 0,02 fällt.

     2-2-1 sigmoid   0/30  — bleibt bei 0,25 stehen (die „alles 0,5"-Ebene)
     2-2-1 tanh     28/30  — Median 5 s, aber jeder fünfte Lauf kriecht
     3-2-1 tanh     29/30  — Median 3 s
     3-3-1 tanh     30/30  — Median 2,6 s, langsamster Lauf 6 s

   Sigmoid in den verdeckten Schichten lernt XOR hier ÜBERHAUPT nicht, und
   die kleinste Fassung mit fünf Neuronen ist ein Münzwurf zu viel: eine
   Auslage, die in einem von fünf Aufrufen nichts zustande bringt, zeigt das
   Gegenteil von dem, wofür sie da ist. Wer die Form ändert, misst bitte
   wieder nach. */
const DEMO_DATA = {
  numInputs:    2,
  inputLabels:  ['A', 'B'],
  outputLabels: ['A XOR B'],
  data: [
    { inputs: [0, 0], targets: [0] },
    { inputs: [0, 1], targets: [1] },
    { inputs: [1, 0], targets: [1] },
    { inputs: [1, 1], targets: [0] },
  ],
};
const DEMO_SHAPE = [3, 3, 1, 0];

function demoState() {
  resetState();
  state.phase        = 'learn';
  state.numInputs    = DEMO_DATA.numInputs;
  state.inputLabels  = [...DEMO_DATA.inputLabels, ...state.inputLabels.slice(DEMO_DATA.inputLabels.length)];
  state.outputLabels = [...DEMO_DATA.outputLabels];

  state.learn.scenario       = 'custom';
  state.learn.customData     = DEMO_DATA;
  state.learn.customFileName = 'XOR (Beispiel)';
  state.learn.learningRate   = 0.6;
  state.learn.speed          = 60;
  /* Der Info-Kasten erklärt, wie man eine CSV-Datei hochlädt — in der
     Stunde die richtige Auskunft, in der Auslage eine Wand quer über
     dem Netz. Er hängt außerdem LINKS am Lernpanel und schöbe es aus
     dem Rahmen hinaus, und damit läge ausgerechnet die Verlaufskurve
     draußen. Eingeklappt ist er einen Klick auf ▶ entfernt. */
  state.learn.infoPanelOpen  = false;

  for (let li = 0; li < state.layers.length; li++) {
    const inCount = li === 0 ? state.numInputs : DEMO_SHAPE[li - 1];
    const isOut   = DEMO_SHAPE[li] > 0 && !DEMO_SHAPE[li + 1];
    state.layers[li].count   = DEMO_SHAPE[li];
    state.layers[li].neurons = Array.from({ length: DEMO_SHAPE[li] }, () => ({
      // Ausgang sigmoid, weil die Zielwerte 0 und 1 sind; dahinter tanh,
      // weil sigmoid in den verdeckten Schichten XOR nicht lernt (s. o.).
      type: isOut ? 'sigmoid' : 'tanh',
      weights:  Array(inCount).fill(0),
      disabled: Array(inCount).fill(false),
      bias: 0, spacing: 0,
    }));
  }
  // Die Startgewichte kommen aus derselben Funktion wie der ↺-Knopf im
  // Lernpanel — dann ist der erste Durchgang der Vorschau derselbe Vorgang
  // wie jeder weitere.
  resetWeightsOnly();
}

// ── Init ───────────────────────────────────────────────────────────────────
if (DEMO) demoState();
else if (!loadState()) resetState();
render();
window.addEventListener('resize', render);
