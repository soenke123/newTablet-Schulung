/* Prüfstand für parse.js (Text → Karten).  Aufruf:  node MPSkills/tools/DefinitionsDerby/tests/parse.test.mjs
   parse.js läuft im Browser und in Node; das Repo ist "type": "module", darum
   wird sie hier in einem vm-Kontext geladen. */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const box = { window: {} };
vm.runInNewContext(readFileSync(path.join(dir, '..', 'parse.js'), 'utf8'), box);
const { parse, toText } = box.window.DDParse;
let fails=0; const ok=(l,c,x='')=>{ if(!c) fails++; console.log((c?'ok  ':'FAIL')+'  '+l+(c?'':'  '+x)); };
let r;
r=parse(`Titel: Zelle\nFach: Biologie\nThema: Aufbau\nKlasse: 7\n\n1. Zellkern: Steuerzentrale der Zelle\n2. Mitochondrium – Kraftwerk der Zelle\n- **Ribosom**: Baut Eiweiße\n  zusammen aus Aminosäuren.\nZellwand = feste Hülle der Pflanzenzelle`);
ok('Kopf', r.title==='Zelle'&&r.subject==='Biologie'&&r.topic==='Aufbau'&&r.grade==='7');
ok('4 Karten Zeile', r.cards.length===4&&r.mode==='zeile', JSON.stringify(r.cards));
ok('Umbruch angehängt', r.cards[2].d==='Baut Eiweiße zusammen aus Aminosäuren.', r.cards[2].d);
r=parse("Zellkern\tSteuerzentrale\nMitochondrium\tKraftwerk");
ok('Tab', r.mode==='tab'&&r.cards.length===2);
r=parse("Zellkern\nEnthält die Erbinformation der Zelle und steuert sie.\n\nRibosom\nBaut Eiweiße.\nEin sehr kleines Organell.");
ok('Block', r.mode==='block'&&r.cards.length===2&&r.cards[1].d==='Baut Eiweiße. Ein sehr kleines Organell.', JSON.stringify(r));
r=parse("Zellkern\nEnthält die Erbinformation der Zelle.\nRibosom\nBaut Eiweiße zusammen aus Teilen.");
ok('Abwechselnd', r.mode==='abwechselnd'&&r.cards.length===2, JSON.stringify(r));
r=parse("A: x\nA: y\nB:");
ok('doppelt+ohne', r.cards[1].w==='doppelt', JSON.stringify(r.cards));
r=parse("");
ok('leer', r.mode==='leer'&&r.cards.length===0);
r=parse("Wort -> Bedeutung\nZeit - die vierte Dimension\nFluss: ein: Doppel");
ok('Pfeil/Strich/Doppelpunkt', r.cards.length===3&&r.cards[1].t==='Zeit'&&r.cards[2].d==='ein: Doppel', JSON.stringify(r.cards));
r=parse("**Atom:** kleinstes Teilchen\n**Molekül** – Verbund aus Atomen");
ok('fett', r.cards.length===2&&r.cards[0].t==='Atom'&&r.cards[1].t==='Molekül', JSON.stringify(r.cards));
const st={title:'T',subject:'F',topic:'',grade:'7',cards:[{t:'Brüche: kürzen',d:'Teiler'},{t:'A',d:'b'}]};
r=parse(toText(st));
ok('Rundreise', r.title==='T'&&r.grade==='7'&&r.cards.length===2&&r.cards[0].t==='Brüche'||false, JSON.stringify(r.cards));
console.log(fails?fails+' FEHLER':'alles ok');
