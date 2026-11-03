/* Prüfstand für die Logik von tools/Diagramm/tool.js (ohne Browser).
   Aufruf:  node MPSkills/tools/Diagramm/tests/logik.test.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = { MPTool: { register() {} } };
// Text messen ohne Browser: 8 px je Zeichen reicht für die Geometrie
globalThis.document = { createElement: () => ({ getContext: () => ({ font: '', measureText: s => ({ width: String(s).length * 8 }) }) }) };
new Function(readFileSync(`${DIR}/tool.js`, 'utf8'))();
const D = window.MPDiagramm;

let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`); };

const W = { kind: 'wirkung', nodes: ['a', 'b', 'c'].map(id => ({ id, type: 'box', x: 0, y: 0, t: id.toUpperCase() })),
  edges: [{ id: '1', a: 'a', b: 'b', type: 'effect', s: '+' }, { id: '2', a: 'b', b: 'a', type: 'effect', s: '-' },
          { id: '3', a: 'b', b: 'c', type: 'effect', s: '+' }, { id: '4', a: 'c', b: 'a', type: 'effect', s: '+' }] };
ok('Concept Map heißt so, Bausteine sind Begriffe', D.KINDS.wirkung.label === 'Concept Map' && D.KINDS.wirkung.add[0].label === 'Begriff');
ok('keine Kreisläufe mehr', !('findLoops' in D));

// Pfeilfarben: alte +/−-Diagramme werden übersetzt, f bleibt erhalten
const F = D.sane({ kind: 'wirkung', nodes: W.nodes, edges: W.edges.concat([{ id: '6', a: 'c', b: 'b', type: 'effect', f: 'g' }, { id: '7', a: 'c', b: 'b', type: 'effect', f: 'lila' }]) }, 'wirkung');
const f = id => F.edges.find(e => e.id === id).f;
ok('altes − → rot, altes + → schwarz', f('2') === 'r' && f('1') === 'k');
ok('grün bleibt, Unsinn → schwarz', f('6') === 'g' && f('7') === 'k');
ok('kein Vorzeichen mehr gespeichert', F.edges.every(e => !('s' in e) || e.s === undefined));

// sane: Unsinn raus, XSS-ids raus
const bad = D.sane({ kind: 'klasse', nodes: [
  { id: 'x"><img src=x onerror=alert(1)>', type: 'class', x: 1, y: 2, t: 'Böse' },
  { id: 'n1', type: 'class', x: '5', y: 6, t: 'Auto', c: 99 },
  { id: 'n1', type: 'class', t: 'doppelt' },
  { id: 'n2', type: 'gibtsnicht', t: 'x' }],
  edges: [{ id: 'e"1', a: 'n1', b: 'n2', type: '<script>' }, { id: 'e2', a: 'n1', b: 'weg', type: 'assoc' }] }, 'klasse');
ok('böse id fliegt raus', bad.nodes.length === 2 && bad.nodes[0].id === 'n1');
ok('Farbe begrenzt, Zahl aus Text', bad.nodes[0].c === 7 && bad.nodes[0].x === 5);
ok('unbekannter Typ → topic', bad.nodes[1].type === 'topic');
ok('Kante: id neu, Typ line, Kante ins Leere weg', bad.edges.length === 1 && /^[a-z0-9]+$/.test(bad.edges[0].id) && bad.edges[0].type === 'line');
ok('unbekannte Art → klasse aus Parameter', D.sane({ kind: 'quatsch' }, 'klasse').kind === 'klasse');
ok('kein Objekt → leeres Diagramm', D.sane(null, 'mindmap').nodes.length === 1);

// clean: Messwerte nicht speichern
const c = D.clean({ kind: 'mindmap', nodes: [{ id: 'a', type: 'center', x: 0, y: 0, t: 'T', _m: { w: 1 }, a: '' }], edges: [] });
ok('clean ohne _m und leere Felder', !('_m' in c.nodes[0]) && !('a' in c.nodes[0]));

// Neue Felder: rechtwinklig, Andockpunkte, verschobene Beschriftungen
const U = D.sane({ kind: 'klasse', ortho: true, nodes: [{ id: 'a', type: 'class', x: 0, y: 0, t: 'A' }, { id: 'b', type: 'class', x: 400, y: 0, t: 'B' }],
  edges: [{ id: 'e', a: 'a', b: 'b', type: 'assoc', pa: [1, 0.5], pb: [5, -9], lo: [200, -10], o1: 'x', o2: [3, 4, 5] }] }, 'klasse');
const ue = U.edges[0];
ok('ortho bleibt bei UML', U.ortho === true && D.clean(U).ortho === true);
ok('ortho fällt bei Mindmap weg', !('ortho' in D.sane({ kind: 'mindmap', ortho: true, nodes: [] }, 'mindmap')));
ok('Andockpunkt begrenzt auf -1…1', JSON.stringify(ue.pa) === '[1,0.5]' && JSON.stringify(ue.pb) === '[1,-1]');
ok('Beschriftung höchstens ±70 verschoben, Unsinn weg', JSON.stringify(ue.lo) === '[70,-10]' && ue.o1 === undefined && ue.o2 === undefined);

// Rand-Punkt: nächster Punkt auf dem Rand, Mitte rastet ein
const nb = { id: 'n', type: 'box', x: 0, y: 0, t: 'Hallo' }; D.measure(nb);
const bu = D.borderU(nb, 500, 1);
ok('rechts neben dem Kasten → rechte Seite, Mitte', bu[0] === 1 && bu[1] === 0, JSON.stringify(bu));
const bt = D.borderU(nb, nb._m.w / 4, -300);
ok('drüber → obere Seite', bt[1] === -1 && bt[0] > 0.3 && bt[0] < 0.7, JSON.stringify(bt));

// Rechtwinklige Linie: nur waagrechte und senkrechte Stücke
const A = U.nodes[0], B = Object.assign({}, U.nodes[1], { y: 160 }); D.measure(A); D.measure(B);
const [q1, q2] = D.orthoEnds(A, B, { a: 'a', b: 'b' }, false);
const pts = D.orthoRoute(q1, q2);
ok('rechtwinklig: Stücke nur waagrecht/senkrecht', pts.every((p, i) => !i || p[0] === pts[i - 1][0] || p[1] === pts[i - 1][1]), JSON.stringify(pts));
ok('rechtwinklig: rechts raus, links rein', q1.d[0] === 1 && q2.d[0] === -1 && pts.length === 4);
const C = Object.assign({}, A, { id: 'c', x: 0, y: 300 }); D.measure(C);
const [r1, r2] = D.orthoEnds(A, C, { a: 'a', b: 'c' }, false);
ok('übereinander: unten raus, oben rein, gerade', r1.d[1] === 1 && r2.d[1] === -1 && D.orthoRoute(r1, r2).length === 2);
const svg = D.docSVG(U, {});
ok('rechtwinklig gezeichnet, Beschriftung verschiebbar markiert', /data-edge="e"/.test(svg));

// Mindmap mit mehreren Themen: Ordnen legt die Bäume untereinander
const M = { kind: 'mindmap', nodes: [
  { id: 'c1', type: 'center', x: 50, y: 50, t: 'Eins' }, { id: 'c2', type: 'center', x: 50, y: 60, t: 'Zwei' },
  { id: 'a', type: 'topic', x: 0, y: 0, t: 'A' }, { id: 'b', type: 'topic', x: 0, y: 0, t: 'B' }],
  edges: [{ id: '1', a: 'c1', b: 'a', type: 'branch' }, { id: '2', a: 'c2', b: 'b', type: 'branch' }, { id: '3', a: 'a', b: 'c2', type: 'line' }] };
D.layoutMindmap(M);
const by = id => M.nodes.find(n => n.id === id);
ok('zwei Themen: erstes bei 0,0, zweites darunter', by('c1').x === 0 && by('c1').y === 0 && by('c2').y > 60, `${by('c2').y}`);
ok('Ast bleibt bei seinem Thema', Math.abs(by('b').y - by('c2').y) < 5 && Math.abs(by('a').y) < 5);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
