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
ok('Wirkungsgefüge heißt so, Bausteine sind Begriffe', D.KINDS.wirkung.label === 'Wirkungsgefüge' && D.KINDS.wirkung.add[0].label === 'Begriff');
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

// Begriff mit Erklärung (a): größer, Erklärung überlebt sane/clean
const nd = { id: 'd', type: 'box', x: 0, y: 0, t: 'Apfelsaft', a: 'Wird sehr günstig auf dem Weltmarkt angeboten.' }; D.measure(nd);
const n0 = { id: 'e', type: 'box', x: 0, y: 0, t: 'Apfelsaft' }; D.measure(n0);
ok('Begriff mit Erklärung ist höher', nd._m.desc && nd._m.h > n0._m.h && !n0._m.desc);
const sd = D.clean(D.sane({ kind: 'wirkung', nodes: [nd], edges: [] }));
ok('Erklärung bleibt gespeichert', sd.nodes[0].a === nd.a && sd.nodes[0]._m === undefined);

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

// Aus Text einfügen (parseText): nur Bausteine, keine Verbindungen
const PT = D.parseText;
const mm = PT('# Gesundheit\n- Ernährung\n  - Obst\n- Bewegung\n\n1. Schlaf\n2) Stress', 'mindmap');
ok('Mindmap: Hauptpunkte = Themen, Unterpunkte übersprungen', mm.map(x => x.t).join() === 'Gesundheit,Ernährung,Bewegung,Schlaf,Stress', mm.map(x => x.t).join());
ok('Mindmap: eine Zeile mit Kommas', PT('Hund, Katze; Maus', 'mindmap').length === 3);
const wk = PT('Sonnenlicht: Energiequelle\nPflanzen – erzeugen Sauerstoff\n  und Zucker\nRäuber', 'wirkung');
ok('Wirkung: Begriff + Erklärung', wk[0].t === 'Sonnenlicht' && wk[0].a === 'Energiequelle' && wk[1].a === 'erzeugen Sauerstoff und Zucker' && wk[2].t === 'Räuber' && !wk[2].a);
const jv = PT('public class Auto extends Fahrzeug {\n private String marke;\n private int ps = 0;\n public Auto(String m) { this.marke = m; }\n public void fahren(int km) { if (km > 0) { } }\n}\n\nPerson\n- name: String\n+ gehe(): void', 'klasse');
ok('Klasse: Java-Code wird UML', jv[0].t === 'Auto' && jv[0].a === '- marke: String\n- ps: int' && jv[0].o === '+ Auto(m: String)\n+ fahren(km: int): void', JSON.stringify(jv[0]));
ok('Klasse: UML-Text daneben', jv[1] && jv[1].t === 'Person' && jv[1].a === '- name: String' && jv[1].o === '+ gehe(): void');
const py = PT('class Tier:\n    def __init__(self, name):\n        self.name = name\n    def laut(self) -> str:\n        pass', 'klasse');
ok('Klasse: Python', py[0].t === 'Tier' && py[0].a === '+ name' && py[0].o.includes('+ laut(): str'));
ok('Klasse: nackte Liste = je eine Klasse', PT('Auto\nPerson\nFahrrad', 'klasse').length === 3);
const ob = PT('meinAuto : Auto\nmarke = "VW"\nps: 90\n\n:Fahrrad\n\nPerson tom = new Person("Tom", 16);', 'objekt');
ok('Objekt: Text und Code', ob.length === 3 && ob.some(o => o.t === 'meinAuto' && o.k === 'Auto' && o.a === 'marke = "VW"\nps = 90') && ob.some(o => o.t === '' && o.k === 'Fahrrad') && ob.some(o => o.t === 'tom' && o.k === 'Person'));
ok('leerer Text = nichts', PT('  \n ', 'klasse').length === 0);

// Anordnung der eingefügten Bausteine (layoutImport)
const mk = (items, type) => items.map((it, i) => ({ id: 'i' + i, type, x: 0, y: 0, t: it.t, a: it.a, o: it.o, k: it.k, c: 0 }));
const clash = ns => { for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
  const A = ns[i], B = ns[j]; if (Math.abs(A.x - B.x) * 2 < A._m.w + B._m.w && Math.abs(A.y - B.y) * 2 < A._m.h + B._m.h) return true; } return false; };
const ki = PT('class Fahrzeug {}\nclass Auto extends Fahrzeug { int ps; }\nclass Rad extends Fahrzeug {}\nclass Person {}\nclass Sportwagen extends Auto {}', 'klasse');
const kn = mk(ki, 'class'); D.layoutImport(kn, ki, 'klasse', null);
const kb = t => kn[ki.findIndex(x => x.t === t)];
ok('Oberklasse gemerkt', ki.find(x => x.t === 'Sportwagen').sup === 'Auto');
ok('Klassen: Unterklassen unter der Oberklasse', kb('Auto').y > kb('Fahrzeug').y && kb('Sportwagen').y > kb('Auto').y && kb('Person').y === kb('Fahrzeug').y);
ok('Klassen: Kinder mittig unter Fahrzeug', Math.abs((kb('Auto').x + kb('Rad').x) / 2 - kb('Fahrzeug').x) < 40);
ok('Klassen: nichts überlappt', !clash(kn));
const wi = PT('A\nB\nC\nD\nE\nF', 'wirkung'), wn = mk(wi, 'box');
D.layoutImport(wn, wi, 'wirkung', { x: 0, y: 0, w: 100, h: 100 });
ok('Wirkung: Kreis unter dem Vorhandenen, ohne Überlappen', !clash(wn) && Math.min(...wn.map(n => n.y - n._m.h / 2)) >= 199 && new Set(wn.map(n => n.y)).size >= 4);
const oi = PT('a : Auto\nb : Person\nc : Auto\nd : Person', 'objekt'), on = mk(oi, 'object');
D.layoutImport(on, oi, 'objekt', null);
ok('Objekte: je Klasse eine Reihe', on[0].y === on[2].y && on[1].y === on[3].y && on[1].y > on[0].y && !clash(on));
const mi = PT('1\n2\n3\n4\n5\n6\n7\n8\n9', 'mindmap'), mn = mk(mi, 'center');
D.layoutImport(mn, mi, 'mindmap', null);
ok('Mindmap: mehrere Reihen, breiter als hoch', new Set(mn.map(n => n.y)).size >= 2 && !clash(mn));

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
