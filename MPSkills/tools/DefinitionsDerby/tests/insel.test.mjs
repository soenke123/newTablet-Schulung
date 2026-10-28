/* Prüfstand für insel.js (Stufen, Aufgaben, nachsichtiges Prüfen).
   Aufruf:  node MPSkills/tools/DefinitionsDerby/tests/insel.test.mjs */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const box = { window: {} };
vm.runInNewContext(readFileSync(path.join(dir, '..', 'insel.js'), 'utf8'), box);
const I = box.window.DDInsel;
let fails = 0; const ok = (l, c, x = '') => { if (!c) fails++; console.log((c ? 'ok  ' : 'FAIL') + '  ' + l + (c ? '' : '  ' + x)); };

// Stufen: 1× richtig hoch, 2× falsch in Folge runter
let s = I.apply(null, true);
ok('Ei richtig → Baby', s.e === 1 && s.up);
s = I.apply({ e: 3, x: 0 }, false);
ok('einmal falsch bleibt', s.e === 3 && s.x === 1 && !s.down);
s = I.apply({ e: 3, x: 1 }, false);
ok('zweimal falsch → runter', s.e === 2 && s.x === 0 && s.down);
s = I.apply({ e: 0, x: 1 }, false);
ok('Ei fällt nicht tiefer', s.e === 0 && s.x === 0 && !s.down);
s = I.apply({ e: 5, x: 0 }, true);
ok('Leuchtend bleibt', s.e === 5 && !s.up);
s = I.apply({ e: 2, x: 1 }, true);
ok('richtig löscht Fehler', s.e === 3 && s.x === 0);
ok('Aufgaben je Stufe', ['pickTerm', 'pickDef', 'build', 'typeTerm', 'cloze', 'cloze'].every((t, e) => I.taskFor(e) === t));

// Freitext: nachsichtig
const yes = (a, t) => I.check(a, t).ok;
ok('genau', yes('Mitochondrium', 'Mitochondrium') && I.check('Mitochondrium', 'Mitochondrium').exact);
ok('klein, Artikel', yes('das mitochondrium', 'Mitochondrium'));
ok('Buchstabendreher', yes('Mitochondruim', 'Mitochondrium'));
ok('ein Buchstabe fehlt', yes('Mitochondrum', 'Mitochondrium'));
ok('Umlaut ae', yes('Zellmembraen', 'Zellmembrän') && yes('Kuerzen', 'Kürzen') && yes('Kurzen', 'Kürzen'));
ok('ß = ss', yes('Grossbuchstabe', 'Großbuchstabe'));
ok('Klammer darf fehlen', yes('Desoxyribonukleinsäure', 'Desoxyribonukleinsäure (DNA)'));
ok('Klammer-Inhalt allein', yes('DNA', 'Desoxyribonukleinsäure (DNA)'));
ok('Schrägstrich-Varianten', yes('Zellen', 'Zelle / Zellen'));
ok('Bindestrich egal', yes('Zell membran', 'Zell-Membran'));
ok('falsch bleibt falsch', !yes('Ribosom', 'Mitochondrium'));
ok('kurz streng', !yes('Ion', 'Ton') && yes('Ton', 'Ton'));
ok('leer falsch', !yes('', 'Ton') && !yes('  ', 'Zelle'));
ok('anderes Wort', !yes('Mikroskop', 'Mitochondrium') && !yes('Zelle', 'Zellkern'));
ok('Lücke Tippfehler', I.checkGap('Erbinformaton', 'Erbinformation').ok && !I.checkGap('Energie', 'Erbinformation').ok);

// Bausteine
const def = 'Kraftwerk der Zelle, das aus Traubenzucker und Sauerstoff Energie für die Zelle freisetzt.';
const ch = I.chunks(def);
ok('2–6 Bausteine', ch.length >= 2 && ch.length <= 6, JSON.stringify(ch));
ok('Bausteine ergeben Definition', ch.join(' ') === def, JSON.stringify(ch));
ok('Schnitt nach Komma', ch.some(c => c.endsWith('Zelle,')), JSON.stringify(ch));
ok('zu kurz zum Bauen', I.chunks('Brüche gleichen Nenners').length === 0);
ok('vier Wörter = zwei Bausteine', JSON.stringify(I.chunks('Teil eines ganzen Kuchens')) === '["Teil eines","ganzen Kuchens"]');
const wc = c => c.split(' ').length;
for (let n = 4; n <= 40; n++) {
  const cs = I.chunks(Array.from({ length: n }, (_, i) => (i % 5 === 2 ? 'und' : 'wort' + i) + (i % 7 === 3 ? ',' : '')).join(' '));
  if (!cs.every(c => wc(c) >= 2)) ok('mind. 2 Wörter je Baustein (' + n + ')', false, JSON.stringify(cs));
}
ok('mind. 2 Wörter je Baustein', true);
{ const cs = I.chunks(def); ok('meist 3 Wörter', cs.filter(c => wc(c) >= 3).length >= cs.length - 1, JSON.stringify(cs)); }
ok('lange Definition höchstens 6', I.chunks(Array.from({ length: 40 }, (_, i) => 'wort' + i).join(' ')).length === 6);

// Lückentext
let parts = I.clozeGaps('Steuerzentrale der Zelle; enthält die Erbinformation (DNA).', 'Zellkern');
let gaps = parts.filter(p => p.gap).map(p => p.gap);
ok('2 Lücken', gaps.length === 2, JSON.stringify(parts));
ok('Nomen bevorzugt', gaps.includes('Erbinformation'), JSON.stringify(gaps));
ok('Text bleibt vollständig', parts.map(p => p.text || p.gap).join(' ').replace(/\s+/g, ' ').replace(/ ([;.,)])/g, '$1').replace(/\( /g, '(') ===
  'Steuerzentrale der Zelle; enthält die Erbinformation (DNA).', JSON.stringify(parts));
parts = I.clozeGaps('Die Zahl unter dem Bruchstrich; sie sagt, in wie viele gleiche Teile das Ganze geteilt ist.', 'Nenner');
ok('3 Lücken bei langer Definition', parts.filter(p => p.gap).length === 3, JSON.stringify(parts));
parts = I.clozeGaps('Mitochondrium der Zelle', 'Mitochondrium');
ok('Begriff selbst wird keine Lücke', !parts.some(p => p.gap === 'Mitochondrium'), JSON.stringify(parts));

// Aufgaben bauen
let seed = 7; I.setRandom(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
const A = [['Zellkern', 'Steuerzentrale der Zelle; enthält die Erbinformation.'], ['Mitochondrium', def],
  ['Ribosom', 'Bildet aus Aminosäuren Eiweiße.'], ['Zellmembran', 'Dünne Haut um die Zelle; regelt, was hinein- und hinausdarf.'],
  ['Zellwand', 'Feste Hülle um pflanzliche Zellen; gibt Halt und Form.'], ['Chloroplast', 'Organell der Pflanzen für die Photosynthese.'],
  ['Vakuole', 'Speichert Wasser und Stoffe in der Pflanzenzelle.']].map(([t, d], i) => ({ id: 'a:' + i, sid: 'a', t, d }));
const B = [['Zähler', 'Zahl über dem Bruchstrich.'], ['Nenner', 'Zahl unter dem Bruchstrich.']].map(([t, d], i) => ({ id: 'b:' + i, sid: 'b', t, d }));
const pool = A.concat(B);
let t = I.makeTask(A[1], pool, 0);
ok('Baby: 6 Begriffe, einer richtig', t.type === 'pickTerm' && t.options.length === 6 && t.options.filter(o => o.id === A[1].id).length === 1);
ok('Baby: nur derselbe Stapel', t.options.every(o => o.id.startsWith('a:')));
t = I.makeTask(A[1], pool, 1);
ok('Klein: 4 Definitionen', t.type === 'pickDef' && t.options.length === 4 && t.options.every(o => o.id.startsWith('a:')));
t = I.makeTask(B[0], pool, 0);
ok('kleiner Stapel wird aufgefüllt', t.options.length === 6 && t.options.some(o => o.id.startsWith('a:')) && t.options.some(o => o.id === 'b:1'));
t = I.makeTask(A[1], pool, 2);
ok('Mittel: Bausteine + 2 falsche', t.type === 'build' && t.tiles.filter(x => x.wrong).length === 2 && t.tiles.filter(x => !x.wrong).length === t.right.length);
ok('richtige Folge erkannt', I.buildOk(t, t.right) && !I.buildOk(t, t.right.slice().reverse()));
ok('falsche Bausteine auch mind. 2 Wörter', t.tiles.every(x => wc(x.text) >= 2), JSON.stringify(t.tiles));
t = I.makeTask({ id: 'b:9', sid: 'b', t: 'Bruch', d: 'Teil eines Ganzen' }, pool, 2);
ok('zu kurz zum Bauen → Begriff tippen', t.type === 'typeTerm');
t = I.makeTask(A[1], pool, 3);
ok('Groß: Begriff tippen', t.type === 'typeTerm');
t = I.makeTask(A[0], pool, 4);
ok('Leuchtend-Aufgabe: Lückentext', t.type === 'cloze' && t.parts.some(p => p.gap));

// Runde
const prog = { 'a:0': { e: 5 }, 'a:1': { e: 0, x: 1 } };
const r = I.session(pool, id => prog[id], 8);
ok('8 Aufgaben', r.cards.length === 8 && !r.review);
ok('Leuchtende nicht in normaler Runde', !r.cards.some(c => c.id === 'a:0'));
ok('nie zweimal in Folge', r.cards.every((c, i) => !i || r.cards[i - 1].id !== c.id));
const all5 = {}; pool.forEach(c => { all5[c.id] = { e: 5 }; });
ok('alles leuchtet → Wiederholen', I.session(pool, id => all5[id], 4).review);

console.log(fails ? '\n' + fails + ' FEHLER' : '\nalles ok');
process.exit(fails ? 1 : 0);
