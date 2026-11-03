/* Prüfstand für die Logik von tools/Diagramm/tool.js (ohne Browser).
   Aufruf:  node MPSkills/tools/Diagramm/tests/logik.test.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = { MPTool: { register() {} } };
new Function(readFileSync(`${DIR}/tool.js`, 'utf8'))();
const D = window.MPDiagramm;

let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`); };

// Kreisläufe
const W = { kind: 'wirkung', nodes: ['a', 'b', 'c'].map(id => ({ id, type: 'box', x: 0, y: 0, t: id.toUpperCase() })),
  edges: [{ id: '1', a: 'a', b: 'b', type: 'effect', s: '+' }, { id: '2', a: 'b', b: 'a', type: 'effect', s: '-' },
          { id: '3', a: 'b', b: 'c', type: 'effect', s: '+' }, { id: '4', a: 'c', b: 'a', type: 'effect', s: '+' }] };
const L = D.findLoops(W);
ok('zwei Kreisläufe gefunden', L.length === 2, JSON.stringify(L.map(l => l.type + l.names.join(''))));
ok('A→B→A mit einem − ist ausgleichend', L.some(l => l.names.join('') === 'AB' && l.type === 'B'));
ok('A→B→C→A ohne − ist verstärkend', L.some(l => l.names.join('') === 'ABC' && l.type === 'R'));
ok('ohne Pfeile kein Kreis', D.findLoops({ nodes: W.nodes, edges: [] }).length === 0);

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

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
