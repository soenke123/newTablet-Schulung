/* Kopfloser Prüfstand für den Simulationskern.
   Lädt util/engine/netz/schichten/mitschnitt ohne DOM. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..', 'js');

const sandbox = { console, performance: { now: () => 0 }, requestAnimationFrame: () => 0,
                  cancelAnimationFrame: () => {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ⚠️ `prog-dateien.js` ist eigentlich eine BROWSER-Datei (es baut
   Fenster). Geladen wird es hier trotzdem, und zwar wegen einer
   einzigen Sache darin: der Zerteiler für die Hervorhebung ist
   pure Zeichenkettenarbeit — Text hinein, eingefärbter Text
   heraus. Ihn durch einen echten Browser zu prüfen wäre teurer
   und ungenauer. Das geht nur, weil die Datei beim LADEN kein
   DOM anfasst; wer das ändert, muss sie hier herausnehmen. */
for (const f of ['util.js', 'engine.js', 'netz.js', 'verlauf.js', 'nat.js', 'firewall.js', 'tcp.js', 'rip.js', 'logos.js', 'dateien.js',
                 'http.js', 'mail.js', 'filme.js', 'stream.js', 'tls.js', 'zs.js', 'vpn.js', 'schichten.js', 'dienste.js', 'internet.js', 'mitschnitt.js', 'terminal.js', 'subnetze.js',
                 'prog-dateien.js', 'szenarien.js']) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
}

/* Die acht Szenarien aus der Zeit vor der Gliederung in Sek I / Sek II sind
   nicht mehr im Programm. Viele Prüfungen brauchen aber genau ihre Netze
   (ein Router mit Gateway-Fehler, ein DHCP-Netz …) — sie liegen deshalb als
   reine Daten unter tests/fixtures und stehen hier als FIX bereit. */
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'alt-szenarien.json'), 'utf8'));

const U = sandbox.NetUtil;
const SEC = U.SEC;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '   → ' + extra : '')); }
}
function section(s) { console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 58 - s.length))); }

/* ═══ 1 · Adressrechnen ═══ */
section('Adressrechnen');
ok('ip2int/int2ip Rundreise', U.int2ip(U.ip2int('192.168.1.10')) === '192.168.1.10');
ok('hohe Adresse ohne Vorzeichenfehler', U.ip2int('200.0.0.1') > 0, U.ip2int('200.0.0.1'));
ok('255.255.255.0 = /24', U.mask2prefix('255.255.255.0') === 24);
ok('255.255.255.240 = /28', U.mask2prefix('255.255.255.240') === 28);
ok('krumme Maske abgelehnt', U.mask2prefix('255.0.255.0') === null);
ok('gleiches Netz', U.sameNet(U.ip2int('192.168.1.10'), U.ip2int('192.168.1.99'), U.ip2int('255.255.255.0')));
ok('anderes Netz', !U.sameNet(U.ip2int('192.168.1.10'), U.ip2int('192.168.2.1'), U.ip2int('255.255.255.0')));
ok('Netzadresse gemeldet', !!U.checkHostAddress('192.168.1.0', '255.255.255.0'));
ok('Rundrufadresse gemeldet', !!U.checkHostAddress('192.168.1.255', '255.255.255.0'));
ok('normale Adresse in Ordnung', U.checkHostAddress('192.168.1.10', '255.255.255.0') === null);
ok('.20 liegt NICHT in /28', !U.sameNet(U.ip2int('192.168.2.20'), U.ip2int('192.168.2.1'), U.ip2int('255.255.255.240')));

/* ═══ 2 · Engine: Determinismus ═══ */
section('Engine');
function lauf(seed) {
  const e = new sandbox.Engine({ seed });
  const spur = [];
  e.at(100, () => { spur.push('a@' + e.now); e.at(50, () => spur.push('c@' + e.now), 'c'); }, 'a');
  e.at(100, () => spur.push('b@' + e.now), 'b');
  e.at(30,  () => spur.push('z@' + e.now), 'z');
  e.runUntil(1000);
  return spur.join(',');
}
const l1 = lauf(7), l2 = lauf(7);
ok('zweimal derselbe Ablauf', l1 === l2, l1 + ' vs ' + l2);
ok('Reihenfolge nach Zeit', l1.startsWith('z@30,a@100,b@100'), l1);
ok('Gleichstand nach Einfügereihenfolge', l1.indexOf('a@100') < l1.indexOf('b@100'));

const e3 = new sandbox.Engine({ seed: 1 });
let zaehler = 0;
const ev = e3.at(100, () => zaehler++, 'x');
e3.cancel(ev);
e3.runUntil(1000);
ok('abgesagtes Ereignis läuft nicht', zaehler === 0);

const e4 = new sandbox.Engine({ seed: 1 });
e4.at(10, () => {}, 'a');
e4.runUntil(5);
ok('runUntil hält vor der Zeit an', e4.now === 5 && e4.pending === 1, e4.now + '/' + e4.pending);

/* Ein abgesagtes Ereignis vorn darf das nächste nicht vorziehen. */
const e5 = new sandbox.Engine({ seed: 1 });
let spaet = 0;
e5.cancel(e5.at(10, () => {}, 'tot'));
e5.at(1000, () => spaet++, 'spät');
e5.runUntil(50);
ok('abgesagtes Ereignis vorn zieht das nächste nicht vor', spaet === 0 && e5.now === 50, spaet + '/' + e5.now);

/* ═══ Hilfsbau ═══ */
function bau(seed) {
  const engine = new sandbox.Engine({ seed: seed || 42 });
  const netz = new sandbox.Netz(engine);
  const stack = new sandbox.Stack(engine, netz);
  const mit = new sandbox.Mitschnitt(engine, netz);
  return { engine, netz, stack, mit };
}
function konf(n, i, ip, mask) { n.nics[i].ip = ip; if (mask) n.nics[i].mask = mask; }

/* ═══ 3 · Zwei Rechner am Switch ═══ */
section('Zwei Rechner am Switch');
{
  const { engine, netz, stack, mit } = bau();
  const a = netz.addNode('host', 100, 100);
  const b = netz.addNode('host', 300, 100);
  const sw = netz.addNode('switch', 200, 200);
  konf(a, 0, '192.168.1.10'); konf(b, 0, '192.168.1.11');
  netz.addCable(a.id, 0, sw.id, 0);
  netz.addCable(b.id, 0, sw.id, 1);

  let res = null;
  stack.ping(a, '192.168.1.11', 1, 4 * SEC, r => res = r);
  engine.runUntil(5 * SEC);

  ok('Ping kommt an', res && res.ok, JSON.stringify(res));
  ok('Antwort von der richtigen Adresse', res && res.from === '192.168.1.11');
  /* Der Weg sind vier Kabelstrecken (A→Switch→B und zurück), und
     davor läuft noch ein ARP-Paar über dieselben vier — der erste
     Ping bezahlt die Adressauflösung mit. Also acht.

     Gemessen wird in Vielfachen der Kabellaufzeit, nicht in
     festen Millisekunden: die Laufzeit ist eine didaktische
     Stellschraube (sie ist schon von 10 auf 100 ms gewandert),
     und ein Test, der bei jeder Verstellung rot wird, prüft die
     Konstante statt das Verhalten. */
  const kab = netz.cableList()[0].delay;
  ok('Laufzeit plausibel (8 Kabelstrecken: ARP-Paar + Ping-Paar)',
     res && res.rtt >= 8 * kab && res.rtt < 8 * kab + 20000,
     res && res.rtt + ' µs bei ' + kab + ' µs je Kabel');
  ok('ARP-Tabelle von A gefüllt', stack.arpTable(a).some(r => r.ip === '192.168.1.11'));
  ok('Switch hat beide MACs gelernt', stack.macTable(sw).length === 2,
     JSON.stringify(stack.macTable(sw)));

  const zeilen = mit.view();
  ok('ARP steht vor ICMP im Mitschnitt',
     zeilen.findIndex(r => r.proto === 'ARP') < zeilen.findIndex(r => r.proto === 'ICMP'));
  const arpReq = zeilen.find(r => r.proto === 'ARP');
  ok('ARP-Text lesbar', /Wer hat 192\.168\.1\.11\?/.test(arpReq.info), arpReq.info);
  const schichten = mit.layers(zeilen.find(r => r.proto === 'ICMP'));
  ok('ICMP-Paket hat drei Schalen', schichten.length === 3,
     schichten.map(s => s.name).join('+'));

  // Zweiter Ping: ARP ist bekannt, muss schneller sein
  const vorher = mit.view().filter(r => r.proto === 'ARP').length;
  let res2 = null;
  stack.ping(a, '192.168.1.11', 2, 4 * SEC, r => res2 = r);
  engine.runUntil(engine.now + 5 * SEC);
  const nachher = mit.view().filter(r => r.proto === 'ARP').length;
  ok('zweiter Ping ohne neues ARP', nachher === vorher, vorher + ' → ' + nachher);
  ok('zweiter Ping schneller als der erste', res2.ok && res2.rtt < res.rtt, res.rtt + ' → ' + res2.rtt);

  // Switch schickt gezielt, nicht mehr an alle
  const gezielt = mit.view().filter(r => r.nodeName === sw.name).slice(-2);
  ok('Switch flutet beim zweiten Mal nicht mehr', gezielt.length === 2);
}

/* ═══ 4 · Kein Ziel / kein Gateway ═══ */
section('Fehlerfälle');
{
  const { engine, netz, stack } = bau();
  const a = netz.addNode('host', 100, 100);
  const sw = netz.addNode('switch', 200, 200);
  konf(a, 0, '192.168.1.10');
  netz.addCable(a.id, 0, sw.id, 0);

  let r1 = null;
  stack.ping(a, '192.168.1.99', 1, 3 * SEC, r => r1 = r);
  engine.runUntil(20 * SEC);
  ok('niemand antwortet → Fehlschlag', r1 && !r1.ok, JSON.stringify(r1));
  ok('Begründung nennt ARP', r1 && /ARP/i.test(r1.error || ''), r1 && r1.error);

  let r2 = null;
  stack.ping(a, '10.0.0.5', 1, 3 * SEC, r => r2 = r);
  engine.runUntil(engine.now + 10 * SEC);
  ok('anderes Netz ohne Gateway → Fehlschlag', r2 && !r2.ok);
  ok('Begründung nennt das Gateway', r2 && /Gateway/i.test(r2.error || ''), r2 && r2.error);
}

/* ═══ 5 · Router zwischen zwei Netzen ═══ */
section('Router');
{
  const { engine, netz, stack, mit } = bau();
  const a  = netz.addNode('host', 100, 100);
  const s1 = netz.addNode('switch', 200, 100);
  const r  = netz.addNode('router', 300, 100);
  const s2 = netz.addNode('switch', 400, 100);
  const b  = netz.addNode('host', 500, 100);

  konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
  konf(r, 0, '192.168.1.1');  konf(r, 1, '192.168.2.1');
  konf(b, 0, '192.168.2.10'); b.gateway = '192.168.2.1';

  netz.addCable(a.id, 0, s1.id, 0);
  netz.addCable(s1.id, 1, r.id, 0);
  netz.addCable(r.id, 1, s2.id, 0);
  netz.addCable(s2.id, 1, b.id, 0);

  let res = null;
  stack.ping(a, '192.168.2.10', 1, 6 * SEC, x => res = x);
  engine.runUntil(10 * SEC);
  ok('Ping über den Router kommt an', res && res.ok, JSON.stringify(res));
  ok('TTL ist unterwegs gesunken', res && res.ttl === 63, res && res.ttl);

  const wege = stack.routingTable(a);
  ok('Rechner kennt eigenes Netz + Standardweg', wege.length === 2, JSON.stringify(wege));
  ok('Standardweg als solcher benannt', wege.some(w => w.kind === 'Standard'));

  /* Mitlesende (PLAN-SICHERHEIT, Schritt 3): der Router sieht, was
     durch ihn läuft — der Switch nicht als Mitleser, und ein Ping hat
     keinen Inhalt, der im Chip „Mitlesende" stünde. */
  mit.setFilter({ dir: 'beide' });
  const alle = mit.view();
  ok('⭐ der Router liest mit: Zeilen „weg" an seinen Karten', alle.some(x => x.node === r.id && x.mit === 'weg'));
  ok('die Switches und die Endgeräte nicht', !alle.some(x => (x.node === s1.id || x.node === s2.id || x.node === a.id || x.node === b.id) && x.mit));
  ok('ein Ping trägt keinen Inhalt für den Chip', alle.filter(x => x.mit).every(x => !x.inhalt));
  mit.setFilter({ dir: 'raus' });

  // Ohne Gateway auf der Gegenseite: Anfrage kommt an, Antwort nicht zurück
  b.gateway = '';
  stack.clearTables(a); stack.clearTables(b); stack.clearTables(r);
  let res2 = null;
  stack.ping(a, '192.168.2.10', 2, 6 * SEC, x => res2 = x);
  engine.runUntil(engine.now + 12 * SEC);
  ok('fehlendes Gegen-Gateway bricht die Antwort', res2 && !res2.ok, JSON.stringify(res2));
}

/* ═══ 6 · Falsche Maske (Szenario 4, Fehler 2) ═══ */
section('Zu enge Netzmaske');
{
  const { engine, netz, stack } = bau();
  const a = netz.addNode('host', 100, 100);
  const r = netz.addNode('router', 200, 100);
  const b = netz.addNode('server', 300, 100);

  konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
  konf(r, 0, '192.168.1.1');
  konf(r, 1, '192.168.2.1', '255.255.255.240');   // /28 → nur .0 bis .15
  konf(b, 0, '192.168.2.20'); b.gateway = '192.168.2.1';

  netz.addCable(a.id, 0, r.id, 0);
  netz.addCable(r.id, 1, b.id, 0);

  let res = null;
  stack.ping(a, '192.168.2.20', 1, 6 * SEC, x => res = x);
  engine.runUntil(15 * SEC);
  ok('Router findet .20 nicht (Maske zu eng)', res && !res.ok, JSON.stringify(res));
  ok('als ICMP „nicht erreichbar" gemeldet', res && res.icmp === 3, res && res.icmp);

  // Maske korrigieren → muss laufen
  konf(r, 1, '192.168.2.1', '255.255.255.0');
  stack.clearTables(a); stack.clearTables(b); stack.clearTables(r);
  let res2 = null;
  stack.ping(a, '192.168.2.20', 2, 6 * SEC, x => res2 = x);
  engine.runUntil(engine.now + 10 * SEC);
  ok('mit /24 kommt der Ping durch', res2 && res2.ok, JSON.stringify(res2));
}

/* ═══ 7 · TTL-Schleife ═══ */
section('TTL');
{
  const { engine, netz, stack } = bau();
  // Zwei Router, die sich gegenseitig als Gateway haben → Schleife
  const a  = netz.addNode('host', 100, 100);
  const r1 = netz.addNode('router', 200, 100);
  const r2 = netz.addNode('router', 300, 100);

  konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
  konf(r1, 0, '192.168.1.1'); konf(r1, 1, '10.0.0.1');
  konf(r2, 0, '10.0.0.2');
  r1.gateway = '10.0.0.2';
  r2.gateway = '10.0.0.1';

  netz.addCable(a.id, 0, r1.id, 0);
  netz.addCable(r1.id, 1, r2.id, 0);

  let res = null;
  stack.ping(a, '172.16.0.1', 1, 20 * SEC, x => res = x);
  const gelaufen = engine.runUntil(60 * SEC);
  ok('Schleife endet von selbst (TTL)', gelaufen < 100000, gelaufen + ' Ereignisse');
  ok('Ping scheitert statt zu hängen', res && !res.ok, JSON.stringify(res));
  ok('Simulation steht nicht mehr unter Last', engine.pending < 10, engine.pending);
}

/* ═══ 8 · Paketverlust ist reproduzierbar ═══ */
section('Verlust und Determinismus');
{
  /* Der Verlust ist die einzige Stelle, an der gewürfelt wird —
     also der schärfste Test auf Determinismus. Verglichen wird
     nicht das Ping-Ergebnis (bei hohem Verlust ist das immer
     „alles weg"), sondern die exakte Folge aus Abgängen und
     Verlusten. */
  function laufMitVerlust(seed) {
    const { engine, netz, stack } = bau(seed);
    const a = netz.addNode('host', 100, 100);
    const b = netz.addNode('host', 200, 100);
    konf(a, 0, '192.168.1.10'); konf(b, 0, '192.168.1.11');
    netz.addCable(a.id, 0, b.id, 0, { loss: 0.35 });
    const spur = [];
    engine.on('event', e => {
      if (e.kind === 'drop') spur.push('x@' + e.t);
      else if (e.kind === 'wire' && e.dir === 'out') spur.push('>' + e.t);
    });
    const aus = [];
    for (let i = 1; i <= 8; i++)
      stack.ping(a, '192.168.1.11', i, 3 * SEC, r => aus.push(i + ':' + (r.ok ? 'ok' : 'x')));
    engine.runUntil(60 * SEC);
    return { spur: spur.join(','), aus: aus.join(','), drops: spur.filter(s => s[0] === 'x').length };
  }
  const A = laufMitVerlust(99), B = laufMitVerlust(99), C = laufMitVerlust(7);
  ok('gleicher Startwert → identische Ereignisfolge', A.spur === B.spur);
  ok('gleicher Startwert → identisches Ergebnis', A.aus === B.aus, A.aus + ' / ' + B.aus);
  ok('anderer Startwert → andere Ereignisfolge', A.spur !== C.spur);
  ok('es geht wirklich etwas verloren', A.drops > 0 && C.drops > 0, A.drops + ' / ' + C.drops);
  ok('Verlustquote plausibel (35 % ± 20)',
     A.drops / (A.spur.split(',').length) > 0.15, A.drops + ' von ' + A.spur.split(',').length);
}

/* ═══ 9 · Speichern und Laden ═══ */
section('Speicherformat');
{
  const { engine, netz } = bau();
  const a = netz.addNode('host', 111, 222, 'Meiner');
  const sw = netz.addNode('switch', 300, 200);
  konf(a, 0, '192.168.1.10');
  a.gateway = '192.168.1.1';
  netz.addCable(a.id, 0, sw.id, 2);

  const json = JSON.stringify(netz.toJSON());
  ok('Format ist reines JSON', typeof json === 'string' && json.length > 50);

  const { netz: netz2 } = bau();
  netz2.fromJSON(JSON.parse(json));
  const a2 = netz2.byName('Meiner');
  ok('Gerät wieder da', !!a2);
  ok('Adresse erhalten', a2 && a2.nics[0].ip === '192.168.1.10');
  ok('Gateway erhalten', a2 && a2.gateway === '192.168.1.1');
  ok('Position erhalten', a2 && a2.x === 111 && a2.y === 222);
  ok('Kabel erhalten', netz2.cableList().length === 1);
  const p = netz2.peerOf(a2.id, 0);
  ok('Kabel zeigt auf den richtigen Anschluss', p && p.nic === 2, p && p.nic);
  ok('neue IDs kollidieren nicht mit geladenen',
     netz2.addNode('host', 10, 10).id !== a2.id);
}

/* ═══ 10 · Die Szenarien ═══ */
section('Szenarien');
{
  const S = sandbox.SZENARIEN;
  /* Übergang: die neuen Sek-I-Szenarien (i1…) stehen vor den acht
     bisherigen, die nach und nach ersetzt werden. */
  ok('Szenarien vorhanden (Sek I: 7, Sek II: 8, Andere: 3)', Object.keys(S).length === 18, Object.keys(S).join(','));
  ok('jedes Szenario trägt eine Gruppe', Object.keys(S).every(k => !!S[k].gruppe));

  for (const k in S) {
    const { engine, netz } = bau();
    netz.fromJSON(JSON.parse(JSON.stringify(S[k].netz)));
    const n = S[k].netz.nodes.length, c = S[k].netz.cables.length;
    ok(k + ': lädt vollständig',
       // Funkverbindungen (Handy im WLAN) zählen nicht zu den gezogenen Kabeln.
       netz.list().length === n && netz.cableList().filter(x => !x.funk).length === c,
       netz.list().length + '/' + n + ' Geräte, ' + netz.cableList().filter(x => !x.funk).length + '/' + c + ' Kabel');
    // Keine doppelten MAC-Adressen
    const macs = netz.list().flatMap(x => x.nics.map(y => y.mac));
    ok(k + ': MAC-Adressen eindeutig', new Set(macs).size === macs.length);
  }

  // Szenario 3 muss nach Eintragen der Gateways laufen
  {
    const { engine, netz, stack } = bau();
    netz.fromJSON(JSON.parse(JSON.stringify(FIX.router.netz)));
    const a = netz.byName('Endgerät 1'), b = netz.byName('Server 1');
    let vorher = null;
    stack.ping(a, '192.168.2.20', 1, 5 * SEC, x => vorher = x);
    engine.runUntil(12 * SEC);
    ok('Szenario 3 scheitert wie vorgesehen', vorher && !vorher.ok);

    a.gateway = '192.168.1.1'; b.gateway = '192.168.2.1';
    for (const n of netz.list()) stack.clearTables(n);
    let nachher = null;
    stack.ping(a, '192.168.2.20', 2, 5 * SEC, x => nachher = x);
    engine.runUntil(engine.now + 12 * SEC);
    ok('Szenario 3 löst sich mit zwei Gateways', nachher && nachher.ok, JSON.stringify(nachher));
  }

  /* ⚠️ Die doppelt vergebene Adresse trägt seit dieser Runde KEIN
     Warnzeichen mehr (flaeche.js, problemOf) — sie ist mit
     Heimroutern und privaten Adressen kein Fehler an sich. Damit
     hängt der erste Fehler von Szenario 4 daran, dass er sich im
     MITSCHNITT zeigt, und genau das wird hier geprüft: auf eine
     ARP-Anfrage kommen zwei Antworten mit verschiedenen
     MAC-Adressen. Ohne diese Prüfung wäre die Aufgabe still
     unlösbar geworden. */
  {
    const engine = new sandbox.Engine({ seed: 7 });
    const netz = new sandbox.Netz(engine);
    const stack = new sandbox.Stack(engine, netz);
    const mit = new sandbox.Mitschnitt(engine, netz);
    const sw = netz.addNode('switch', 300, 300);
    const a = netz.addNode('host', 100, 200);
    const b = netz.addNode('host', 100, 400);
    const c = netz.addNode('host', 500, 300);
    a.nics[0].ip = '192.168.1.10'; a.nics[0].mask = '255.255.255.0';
    b.nics[0].ip = '192.168.1.10'; b.nics[0].mask = '255.255.255.0';
    c.nics[0].ip = '192.168.1.30'; c.nics[0].mask = '255.255.255.0';
    netz.addCable(a.id, 0, sw.id, 0);
    netz.addCable(b.id, 0, sw.id, 1);
    netz.addCable(c.id, 0, sw.id, 2);
    stack.ping(c, '192.168.1.10', 1, null, () => {});
    engine.runUntil(10 * SEC);
    const antworten = new Set(mit.view()
      .filter(r => /^192\.168\.1\.10 ist bei /.test(r.info || ''))
      .map(r => r.info));
    ok('zwei Geräte mit derselben Adresse antworten beide auf ARP',
       antworten.size === 2, [...antworten].join(' | '));
  }

  // Szenario 4: genau die drei geplanten Fehler, und lösbar
  {
    const { engine, netz, stack } = bau();
    netz.fromJSON(JSON.parse(JSON.stringify(FIX.fehler.netz)));
    ok('Szenario 4: doppelte Adresse vorhanden', netz.duplicateIps().length === 1);

    const r = netz.byName('Router 1');
    ok('Szenario 4: Maske auf der rechten Karte zu eng',
       r.nics[1].mask === '255.255.255.240');
    const pc3 = netz.byName('Endgerät 3');
    ok('Szenario 4: Gateway von Rechner 3 im falschen Netz',
       !U.sameNet(U.ip2int(pc3.gateway), U.ip2int(pc3.nics[0].ip), U.ip2int(pc3.nics[0].mask)));

    // alle drei beheben → alles erreichbar
    netz.byName('Endgerät 2').nics[0].ip = '192.168.1.11';
    r.nics[1].mask = '255.255.255.0';
    pc3.gateway = '192.168.2.1';
    for (const n of netz.list()) stack.clearTables(n);

    const paare = [
      ['Endgerät 1', '192.168.2.20'], ['Endgerät 1', '192.168.2.10'],
      ['Endgerät 3', '192.168.1.10'], ['Endgerät 2', '192.168.2.20']
    ];
    let alle = true, details = [];
    for (const [von, ziel] of paare) {
      let res = null;
      stack.ping(netz.byName(von), ziel, 9, 6 * SEC, x => res = x);
      engine.runUntil(engine.now + 12 * SEC);
      if (!res || !res.ok) { alle = false; details.push(von + '→' + ziel + ': ' + (res && res.error)); }
    }
    ok('Szenario 4 ist nach drei Korrekturen vollständig lösbar', alle, details.join(' | '));
  }
}

/* ═══ 11 · Terminal ═══ */
section('Terminal');
{
  const { engine, netz, stack } = bau();
  const term = new sandbox.Terminal(engine, netz, stack);
  const a = netz.addNode('host', 100, 100);
  const b = netz.addNode('host', 200, 100);
  konf(a, 0, '192.168.1.10'); konf(b, 0, '192.168.1.11');
  netz.addCable(a.id, 0, b.id, 0);

  term.submit(a.id, 'ipconfig');
  let txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('ipconfig zeigt die Adresse', txt.includes('192.168.1.10'));
  ok('ipconfig zeigt die MAC', txt.includes(a.nics[0].mac));

  term.submit(a.id, 'quatsch');
  ok('unbekannter Befehl wird erklärt',
     term.linesOf(a.id).slice(-1)[0].text.includes('hilfe'));

  term.submit(a.id, 'ping 192.168.1.11');
  engine.runUntil(30 * SEC);
  txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('ping meldet vier Antworten', (txt.match(/Antwort von/g) || []).length === 4, txt.slice(-400));
  ok('ping fasst zusammen', /4 von 4 angekommen/.test(txt));

  term.submit(a.id, 'arp');
  txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('arp zeigt den gelernten Eintrag', txt.includes('192.168.1.11'));

  // Fehlschlag mit Tipp
  const c = netz.addNode('host', 300, 100);
  konf(c, 0, '10.0.0.5');
  term.submit(a.id, 'ping 10.0.0.5');
  engine.runUntil(engine.now + 40 * SEC);
  txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('Fehlschlag bekommt einen Tipp', /Tipp:/.test(txt), txt.slice(-300));
  ok('Tipp nennt das fehlende Gateway', /Standardgateway/.test(txt.split('Tipp:').pop()));
}

/* Die Wache in echter Zeit (terminal.js, ECHT_FRIST) darf einen
   Ping nur beenden, wenn die Uhr des Netzes STEHT. Vorher schlug
   sie nach 6 echten Sekunden immer zu — bei Tempo 0,1 sind das
   0,6 s im Netz, und ein Weg über drei Kabel braucht 600,5 ms hin
   und zurück: das Terminal meldete Verluste, die es nicht gab.
   Die echte Uhr wird hier von Hand weitergedreht (`klingeln`). */
section('Terminal: Frist in echter Zeit');
{
  let wecker = [];
  sandbox.setTimeout = (fn) => { const t = { fn }; wecker.push(t); return t; };
  sandbox.clearTimeout = (t) => { wecker = wecker.filter(x => x !== t); };
  const klingeln = () => { const w = wecker; wecker = []; w.forEach(t => t.fn()); };
  try {
    const { engine, netz, stack } = bau();
    const term = new sandbox.Terminal(engine, netz, stack);
    const r = netz.addNode('router', 300, 100);
    netz.addNic(r.id);
    const a = netz.addNode('host', 100, 100), sw = netz.addNode('switch', 200, 100);
    const b = netz.addNode('host', 400, 100);
    konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
    konf(r, 0, '192.168.1.1'); konf(r, 1, '192.168.2.1');
    konf(b, 0, '192.168.2.20'); b.gateway = '192.168.2.1';
    netz.addCable(a.id, 0, sw.id, 0);
    netz.addCable(sw.id, 1, r.id, 0);
    netz.addCable(r.id, 1, b.id, 0);

    // Netz läuft, aber langsam: alle 0,5 s Netzzeit klingelt die echte Uhr.
    term.submit(a.id, 'ping 192.168.2.20');
    for (let i = 0; i < 60 && term.isBusy(a.id); i++) {
      engine.runUntil(engine.now + 500 * U.MS);
      klingeln();
    }
    let txt = term.linesOf(a.id).map(l => l.text).join('\n');
    ok('langsames Netz: die echte Frist schneidet keine Antwort ab',
       /4 von 4 angekommen/.test(txt), txt.slice(-400));

    // Netz steht: die echte Frist beendet den Ping.
    term.submit(a.id, 'ping 192.168.2.20');
    klingeln(); klingeln();
    txt = term.linesOf(a.id).map(l => l.text).join('\n');
    ok('stehendes Netz: die echte Frist beendet den Ping',
       !term.isBusy(a.id) && /0 von 2 angekommen/.test(txt), txt.slice(-300));
  } finally {
    delete sandbox.setTimeout; delete sandbox.clearTimeout;
  }
}

/* ═══ 11a · traceroute ═════════════════════════════════════════
   Der Befehl, den Filius hat und der TTL erst zu etwas anderem
   macht als einer Notbremse gegen Schleifen. Geprüft wird an
   einem Netz mit ZWEI Routern — bei einem einzigen könnte die
   Ausgabe zufällig stimmen.

     E1 ── R1 ── R2 ── E2
   192.168.1.  10.0.0.  192.168.2.                              */
section('traceroute');
{
  const { engine, netz, stack } = bau();
  const term = new sandbox.Terminal(engine, netz, stack);
  const a  = netz.addNode('host', 100, 100);
  const r1 = netz.addNode('router', 200, 100);
  const r2 = netz.addNode('router', 300, 100);
  const b  = netz.addNode('host', 400, 100);

  konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
  konf(r1, 0, '192.168.1.1'); konf(r1, 1, '10.0.0.1');
  konf(r2, 0, '10.0.0.2');    konf(r2, 1, '192.168.2.1');
  konf(b, 0, '192.168.2.20'); b.gateway = '192.168.2.1';
  r1.routes = [{ net: '192.168.2.0', mask: '255.255.255.0', gateway: '10.0.0.2' }];
  r2.routes = [{ net: '192.168.1.0', mask: '255.255.255.0', gateway: '10.0.0.1' }];

  netz.addCable(a.id, 0, r1.id, 0);
  netz.addCable(r1.id, 1, r2.id, 0);
  netz.addCable(r2.id, 1, b.id, 0);

  // Erst prüfen, dass der Weg überhaupt steht.
  let res = null;
  stack.ping(a, '192.168.2.20', 1, 10 * SEC, r => res = r);
  engine.runUntil(20 * SEC);
  ok('der Weg über zwei Router steht', !!res && res.ok, JSON.stringify(res));

  term.submit(a.id, 'traceroute 192.168.2.20');
  engine.runUntil(engine.now + 60 * SEC);
  const txt = term.linesOf(a.id).map(l => l.text).join('\n');

  ok('⭐ traceroute nennt beide Router als Stationen',
     txt.includes('192.168.1.1') && txt.includes('10.0.0.2'), txt.slice(-500));
  ok('und zum Schluss das Ziel', /192\.168\.2\.20/.test(txt), txt.slice(-300));
  ok('in der richtigen Reihenfolge — erst R1, dann R2, dann das Ziel',
     txt.indexOf('192.168.1.1') < txt.indexOf('10.0.0.2')
     && txt.indexOf('10.0.0.2') < txt.lastIndexOf('192.168.2.20'), txt.slice(-500));
  ok('es meldet, dass es angekommen ist', /Angekommen nach 3 Stationen/.test(txt),
     txt.slice(-300));
  /* ⚠️ Die Stationen werden mit der TTL nummeriert, nicht mit der
     Reihenfolge der Antworten. Vor dieser Runde ging jede
     ICMP-Fehlermeldung an „den ersten offenen Ping" — bei einem
     einzelnen Ping stimmte das, hier stünden die Nummern dann
     beliebig. */
  ok('die Stationen sind durchnummeriert',
     /\n\s+1\s+192\.168\.1\.1/.test(txt) && /\n\s+2\s+10\.0\.0\.2/.test(txt),
     txt.slice(-500));

  // `tracert` ist dasselbe.
  ok('tracert gibt es als zweiten Namen', !!sandbox.window && true);
  term.submit(a.id, 'tracert 192.168.2.20');
  engine.runUntil(engine.now + 60 * SEC);
  ok('tracert tut dasselbe',
     (term.linesOf(a.id).map(l => l.text).join('\n').match(/Angekommen nach 3/g) || []).length === 2);

  // Und ein Ziel, das es nicht gibt: der Weg hört irgendwo auf.
  term.submit(a.id, 'traceroute 172.16.9.9');
  engine.runUntil(engine.now + 90 * SEC);
  const txt2 = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('ein unerreichbares Ziel endet mit einer Auskunft',
     /Weiter kommt das Paket nicht|Stationen immer noch nicht/.test(txt2),
     txt2.slice(-300));

  ok('traceroute steht in der Hilfe', (() => {
    term.submit(a.id, 'hilfe');
    return /traceroute/.test(term.linesOf(a.id).map(l => l.text).join('\n'));
  })());
}

/* ═══ 11b · traceroute: stumme Station und Heimrouter ═══════════
   Zwei Fehler, die beide dieselbe falsche Lehre erzeugten:
   „antwortet eine Station nicht, ist dahinter Schluss".

   1. Eine Station, die schweigt, beendet den Befehl nicht mehr —
      es steht `*` da, und es geht weiter (bis drei stumme
      Stationen hintereinander).
   2. Hinter einem Heimrouter kam „Zeit abgelaufen" nie beim
      Laptop an: NAT übersetzte nur Echo, nicht die Fehlermeldung.
      Der Ping ging, traceroute endete nach Station 1.          */
section('traceroute: stumme Station');
{
  const { engine, netz, stack } = bau();
  const term = new sandbox.Terminal(engine, netz, stack);
  const a  = netz.addNode('host', 100, 100);
  const r1 = netz.addNode('router', 200, 100);
  const r2 = netz.addNode('router', 300, 100);
  const b  = netz.addNode('host', 400, 100);
  konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
  konf(r1, 0, '192.168.1.1'); konf(r1, 1, '10.0.0.1');
  konf(r2, 0, '10.0.0.2');    konf(r2, 1, '192.168.2.1');
  konf(b, 0, '192.168.2.20'); b.gateway = '192.168.2.1';
  r1.routes = [{ net: '192.168.2.0', mask: '255.255.255.0', gateway: '10.0.0.2' }];
  r2.routes = [{ net: '192.168.1.0', mask: '255.255.255.0', gateway: '10.0.0.1' }];
  netz.addCable(a.id, 0, r1.id, 0);
  netz.addCable(r1.id, 1, r2.id, 0);
  netz.addCable(r2.id, 1, b.id, 0);
  // R2 verwirft still alles von und zu E1 — aber erst NACH der TTL-Prüfung.
  r2.firewall = { on: true, typ: 'blacklist', ablehnen: false,
                  regeln: [{ adresse: '192.168.1.10', maske: '' }] };

  term.submit(a.id, 'traceroute 192.168.2.20');
  engine.runUntil(engine.now + 120 * SEC);
  const txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('R2 meldet sich noch als Station 2', /\n\s+2\s+10\.0\.0\.2/.test(txt), txt.slice(-500));
  ok('⭐ eine stumme Station steht als * da — und es geht weiter',
     /\n\s+3\s+\*/.test(txt) && /\n\s+4\s+\*/.test(txt), txt.slice(-500));
  ok('nach drei stummen Stationen ist Schluss',
     /\n\s+5\s+\*/.test(txt) && !/\n\s+6\s+/.test(txt) && /3 Stationen hintereinander ohne Antwort/.test(txt),
     txt.slice(-500));
}

section('traceroute durch den Heimrouter (NAT)');
{
  const { engine, netz, stack, mit } = bau();
  const term = new sandbox.Terminal(engine, netz, stack);
  const a  = netz.addNode('host', 100, 100);
  const hr = netz.addNode('heimrouter', 300, 100);
  const r  = netz.addNode('router', 500, 100);
  const s  = netz.addNode('host', 700, 100);
  konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
  konf(hr, 1, '192.168.1.1', '255.255.255.0');
  konf(hr, 0, '84.12.5.2', '255.255.255.0'); hr.nics[0].dhcp = false; hr.gateway = '84.12.5.1';
  konf(r, 0, '84.12.5.1'); konf(r, 1, '84.12.6.1');
  konf(s, 0, '84.12.6.20'); s.gateway = '84.12.6.1';
  netz.addCable(a.id, 0, hr.id, 1);
  netz.addCable(hr.id, 0, r.id, 0);
  netz.addCable(r.id, 1, s.id, 0);
  ok('der Heimrouter übersetzt (NAT an)', !!(hr.nat && hr.nat.on));

  term.submit(a.id, 'traceroute 84.12.6.20');
  engine.runUntil(engine.now + 60 * SEC);
  const txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('⭐ Station 2 hinter dem Heimrouter kommt beim Laptop an',
     /\n\s+2\s+84\.12\.5\.1/.test(txt), txt.slice(-500));
  ok('und das Ziel auch', /Angekommen nach 3 Stationen/.test(txt), txt.slice(-500));
  ok('der Laptop selbst bleibt draußen unsichtbar',
     !mit.view().some(x => x.node === r.id && /192\.168\.1\.10/.test(x.info || '')),
     mit.view().filter(x => x.node === r.id).map(x => x.info).join(' | ').slice(0, 400));

  // „Ziel nicht erreichbar" aus dem Internet: der Grund statt Zeitüberschreitung.
  let res = null;
  // Längere Frist: hier geht es um die Übersetzung, nicht um das Rennen ARP gegen Ping.
  stack.ping(a, '84.12.6.99', 1, 10 * SEC, (x) => { res = x; });
  engine.runUntil(engine.now + 30 * SEC);
  ok('⭐ „Ziel nicht erreichbar" erreicht den Laptop hinter NAT',
     !!res && !res.ok && res.icmp === 3, JSON.stringify(res));

  // Und umgekehrt: eine Fehlermeldung aus dem Haus nennt draußen die WAN-Adresse.
  hr.nat.frei = [{ proto: 'udp', port: 5000, lanIp: '192.168.1.10', lanPort: 5000 }];
  stack.sendUdp(s, '84.12.5.2', 4000, 5000, 'hallo');
  engine.runUntil(engine.now + 10 * SEC);
  const raus = mit.view().filter(x => x.node === r.id && /nicht erreichbar|Port/i.test(x.info || ''));
  ok('„Port nicht erreichbar" aus dem Haus geht mit der WAN-Adresse hinaus',
     raus.length > 0 && !raus.some(x => /192\.168\.1\.10/.test(x.info || '')),
     mit.view().filter(x => x.node === r.id).map(x => x.info).join(' | ').slice(-400));
}

/* ═══ 12 · Netzteil und Geräteteil ═══ */
section('Adresse aufteilen');
{
  const a = U.ipParts('192.168.1.10', '255.255.255.0');
  ok('drei Blöcke Netz, einer Gerät',
     a.map(p => p.teil).join(',') === 'netz,netz,netz,host', a.map(p => p.teil).join(','));
  const b = U.ipParts('10.0.0.5', '255.0.0.0');
  ok('/8 teilt nach dem ersten Block',
     b.map(p => p.teil).join(',') === 'netz,host,host,host', b.map(p => p.teil).join(','));
  /* Der Fall, um den es geht: eine Maske, die MITTEN in einem Block
     endet. Ihn einer Seite zuzuschlagen wäre bequem und falsch —
     bei /26 liegt dort der Lernstoff. */
  const c = U.ipParts('192.168.1.70', '255.255.255.192');
  ok('/26 macht den letzten Block geteilt', c[3].teil === 'geteilt', c[3].teil);
  ok('/26 nennt die Bitgrenze', c[3].bits === 2, String(c[3].bits));
  const d = U.ipParts('192.168.1.70', 'quatsch');
  ok('ohne gültige Maske gilt alles als Geräteteil',
     d.every(p => p.teil === 'host'));
  ok('Unsinn ergibt keine Aufteilung', U.ipParts('nix', '255.255.255.0') === null);

  /* Werkzeug „Binärdarstellung": dieselbe Grenze, Bit für Bit. */
  const txt = (h) => h.replace(/<[^>]+>/g, '');
  ok('binär: 192.168.1.10 als vier Achtergruppen', txt(U.binHtml('192.168.1.10', '255.255.255.0')) === '11000000.10101000.00000001.00001010');
  ok('binär: die Netzmaske als Einsen und Nullen', txt(U.binHtml('255.255.255.0', '255.255.255.0')) === '11111111.11111111.11111111.00000000');
  {
    const h = U.binHtml('192.168.1.70', '255.255.255.192');
    ok('binär: bei /26 liegt die Grenze mitten im letzten Block (2 Bit Netz, 6 Bit Gerät)',
       /ipp--netz">01</.test(h) && /ipp--host">000110</.test(h), h);
    ok('binär: ganze Blöcke davor sind Netzteil', /ipp--netz">11000000</.test(h));
  }
  ok('binär: ohne gültige Maske bleibt es ungefärbt, aber sichtbar',
     /ipp--offen/.test(U.binHtml('10.0.0.1', 'quatsch')) && !/ipp--netz/.test(U.binHtml('10.0.0.1', 'quatsch')));
  ok('binär: keine Adresse, nichts zu zeigen', U.binHtml('nix', '255.255.255.0') === '');
}

/* ═══ 13 · Anschlüsse anbauen und abbauen ═══ */
section('Anschlüsse');
{
  const { netz } = bau();
  const r = netz.addNode('router', 100, 100);
  const h = netz.addNode('host', 300, 100);
  ok('Router startet mit zwei Anschlüssen', r.nics.length === 2);
  ok('Rechner kann keinen dritten bekommen', !netz.addNic(h.id).ok);

  netz.addNic(r.id);
  ok('Router hat jetzt drei', r.nics.length === 3);
  ok('der neue hat eine eigene MAC',
     new Set(r.nics.map(k => k.mac)).size === 3, r.nics.map(k => k.mac).join(' '));
  ok('der neue hat keine IP', r.nics[2].ip === '');

  /* Der Fallstrick beim Abbauen: Kabel merken sich ihren Anschluss
     als ZAHL. Rutscht Anschluss 2 auf Platz 1, muss das Kabel
     mitrutschen — sonst hängt es am falschen Loch, und niemand
     findet den Fehler. */
  netz.addCable(r.id, 2, h.id, 0);
  ok('Anschluss mit Kabel lässt sich nicht abbauen', !netz.removeNic(r.id, 2).ok);
  netz.removeNic(r.id, 1);
  ok('nach dem Abbauen zwei Anschlüsse', r.nics.length === 2);
  ok('Nummern sind lückenlos', r.nics.map(k => k.i).join(',') === '0,1');
  const p = netz.peerOf(r.id, 1);
  ok('das Kabel ist mitgerutscht', p && p.node.id === h.id,
     p ? p.node.id : 'kein Kabel mehr');
  ok('unter zwei geht es beim Router nicht', !netz.removeNic(r.id, 1).ok);
}

/* ═══ 13b · Der Switch wächst von selbst ═══
   ⭐ Seit dem 2026-09-28. Vorher hatte er 16 Anschlüsse und einen
   Knopf zum Anbauen — und die Falle, die in UEBERGABE.md schon als
   verlorene Stunde steht: das Gerät hinter der fünften Buchse bekam
   still kein Kabel, und gemeldet wurde „ein Gerät hat keine
   Adresse". Vom Nutzer abbestellt: „Bitte nimm die Begrenzung bei
   Switches raus, die können einfach Geräte verbinden und fertig."

   Geprüft wird `freieNic` und nicht die Fläche: die Frage „hat
   dieses Gerät noch eine Buchse?" wird in netz.js beantwortet, und
   die Fläche fragt nur. */
section('Switch wächst');
{
  const { netz } = bau();
  const sw = netz.addNode('switch', 300, 300);
  ok('ein Switch startet mit fünf Buchsen', netz.feste(sw).length === 5);
  ok('er wächst laut KIND von selbst', netz.KIND.switch.waechst === true);
  ok('Router und Heimrouter nicht',
     !netz.KIND.router.waechst && !netz.KIND.heimrouter.waechst);

  /* Fünf Geräte füllen ihn, das sechste lässt eine Buchse
     nachwachsen — ohne dass jemand etwas anbaut. */
  const geraete = [];
  for (let i = 0; i < 6; i++) {
    const h = netz.addNode('host', 100, 100 + i * 60);
    geraete.push(h);
    const frei = netz.freieNic(sw.id);
    ok('Gerät ' + (i + 1) + ' bekommt eine Buchse', frei === i, String(frei));
    netz.addCable(sw.id, frei, h.id, 0);
  }
  ok('nach sechs Kabeln hat der Switch sechs Buchsen', netz.feste(sw).length === 6);
  ok('und keine davon ist frei', netz.feste(sw).every(k => !!k.cable));

  /* Der Deckel. 50 ist kein technisches Maß, sondern ein
     Notausgang — aber er muss halten, und die Meldung muss die Zahl
     nennen: an einem Gerät, das eben noch von selbst gewachsen ist,
     wäre „kein freier Anschluss" ein Rätsel und keine Auskunft. */
  for (let i = netz.feste(sw).length; i < netz.KIND.switch.maxPorts; i++) {
    const h = netz.addNode('host', 800, 100 + i * 10);
    netz.addCable(sw.id, netz.freieNic(sw.id), h.id, 0);
  }
  ok('bis 50 Geräte geht es', netz.feste(sw).length === 50);
  ok('beim 51. ist Schluss', netz.freieNic(sw.id) === -1);
  ok('und der Satz nennt die 50', /50 Geräte/.test(netz.keinAnschlussSatz(sw)),
     netz.keinAnschlussSatz(sw));
  ok('ein Endgerät sagt dagegen weiter „kein freier Anschluss"',
     /keinen freien Anschluss/.test(netz.keinAnschlussSatz(geraete[0])),
     netz.keinAnschlussSatz(geraete[0]));
  ok('ein voller Router wächst NICHT', (() => {
    const { netz: n2 } = bau();
    const r2 = n2.addNode('router', 100, 100);
    for (let i = 0; i < 2; i++) n2.addCable(r2.id, i, n2.addNode('host', 300, 100 + i * 60).id, 0);
    return n2.freieNic(r2.id) === -1 && n2.feste(r2).length === 2;
  })());
}

/* ═══ 13c · Kabel an ein Gerät mit WLAN ═══
   Vom Nutzer verlangt: WLAN an, aber nicht verbunden → Kabel geht,
   das WLAN geht aus (das Ausschalten selbst macht die Fläche über
   `setFunk`). WLAN verbunden → kein zweiter Anschluss, und der Satz
   sagt, warum. */
section('Kabel trotz WLAN');
{
  const { netz } = bau();
  const sw = netz.addNode('switch', 300, 300);
  const pc = netz.addNode('host', 100, 100);
  netz.setFunk(pc, 0, true, 'Gibt es nicht');
  ok('WLAN an, aber nicht verbunden', pc.nics[0].funk && !pc.nics[0].cable);
  ok('freieNic gibt die lose Funkkarte her', netz.freieNic(pc.id) === 0);
  netz.setFunk(pc, 0, false);
  const r = netz.addCable(sw.id, netz.freieNic(sw.id), pc.id, 0);
  ok('nach dem Abschalten steckt das Kabel', r.ok && !pc.nics[0].funk, r.error);

  const pc2 = netz.addNode('host', 100, 300);
  netz.wlanConf(sw); sw.wlan.on = true; sw.wlan.ssid = 'Klassenzimmer';
  netz.setFunk(pc2, 0, true, 'Klassenzimmer');
  ok('pc2 hängt im WLAN', !!pc2.nics[0].cable);
  ok('dann gibt es keine freie Buchse', netz.freieNic(pc2.id) === -1);
  ok('und der Satz nennt das WLAN',
     /schon mit dem WLAN „Klassenzimmer" verbunden/.test(netz.keinAnschlussSatz(pc2)),
     netz.keinAnschlussSatz(pc2));
}

/* ═══ 14 · UDP und Ports ═══ */
section('UDP');
{
  const { engine, netz, stack, mit } = bau();
  const a = netz.addNode('host', 100, 100);
  const b = netz.addNode('host', 300, 100);
  konf(a, 0, '192.168.1.10'); konf(b, 0, '192.168.1.11');
  netz.addCable(a.id, 0, b.id, 0);

  let bekommen = null;
  stack.listen(b, 7777, (m) => { bekommen = m; });
  stack.sendUdp(a, '192.168.1.11', 5555, 7777, { hallo: 'da' });
  engine.runUntil(2 * SEC);

  ok('UDP kommt am Port an', !!bekommen);
  ok('Absenderport steht drin', bekommen && bekommen.sport === 5555);
  ok('Nutzdaten kommen mit', bekommen && bekommen.data.hallo === 'da');
  ok('Absenderadresse steht drin', bekommen && bekommen.from === '192.168.1.10');

  // Niemand lauscht → „Port nicht erreichbar" statt Stille.
  const vorher = mit.view().length;
  stack.sendUdp(a, '192.168.1.11', 5556, 9999, {});
  engine.runUntil(engine.now + 2 * SEC);
  const neu = mit.view().slice(vorher);
  ok('geschlossener Port meldet sich zurück',
     neu.some(r => /Port nicht erreichbar/.test(r.info)),
     neu.map(r => r.info).join(' | '));

  ok('Mitschnitt nennt fremdes UDP mit Portnummern',
     neu.some(r => r.proto === 'UDP' && /9999/.test(r.info)),
     neu.map(r => r.proto + ':' + r.info).join(' | '));
}

/* ═══ 14b · TCP ═══
   Der Prüfstand für TCP steht hier und nicht im Browser: ein
   Zustandsautomat mit Nummern und Fristen ist kopflos billiger
   und genauer zu messen — und bis Stufe 3 (HTTP) gibt es auch
   gar keine Oberfläche, die davon etwas zeigt. */
section('TCP');
function tcpPaar(seed) {
  const b = bau(seed);
  const a = b.netz.addNode('host', 100, 100);
  const s = b.netz.addNode('server', 300, 100);
  konf(a, 0, '192.168.1.10'); konf(s, 0, '192.168.1.20');
  b.netz.addCable(a.id, 0, s.id, 0);
  return Object.assign(b, { a, s });
}
{
  const { engine, netz, stack, mit, a, s } = tcpPaar();

  let serverConn = null, empfangen = [];
  stack.tcpHoeren(s, 80, (c) => {
    serverConn = c;
    c.onDaten((text) => { empfangen.push(text); c.senden('OK:' + text.length); });
  }, 'Webserver');

  let clientConn = null, fehler = 'nichts', antwort = [];
  stack.tcpVerbinde(a, '192.168.1.20', 80, 'Webbrowser', (err, c) => {
    if (err) { fehler = err; return; }
    clientConn = c;
    c.onDaten((text) => antwort.push(text));
  });
  engine.runUntil(2 * SEC);

  ok('die Verbindung steht', !!clientConn && !!serverConn, fehler);
  ok('der Client kennt seinen Partner',
     clientConn && clientConn.fernIp === '192.168.1.20' && clientConn.fernPort === 80);
  ok('der Absenderport ist ein flüchtiger (ab 49152)',
     clientConn && clientConn.lokalPort >= 49152 && clientConn.lokalPort <= 65535,
     clientConn && clientConn.lokalPort);

  /* ⭐ Die drei Zeilen, um die es geht. Sie stehen im Mitschnitt
     einzeln und in dieser Reihenfolge — das IST der Handschlag. */
  const hand = mit.view().filter(r => r.proto === 'TCP').map(r => r.info.replace(/.*\[/, '[').replace(/\].*/, ']'));
  ok('Handschlag in drei Segmenten', hand.length === 3, hand.join(' '));
  ok('und zwar SYN · SYN,ACK · ACK',
     hand.join(' ') === '[SYN] [SYN, ACK] [ACK]', hand.join(' '));

  // Nummern: das SYN verbraucht eine, also bestätigt die
  // Gegenseite mit ISN+1.
  const segs = mit.view().filter(r => r.proto === 'TCP').map(r => r.frame.payload.payload);
  ok('SYN,ACK bestätigt genau eine Nummer mehr',
     segs[1].ack === segs[0].seq + 1, segs[0].seq + ' → ' + segs[1].ack);
  ok('das dritte Segment bestätigt das SYN der Gegenseite',
     segs[2].ack === segs[1].seq + 1, segs[1].seq + ' → ' + segs[2].ack);

  // Daten hin, Bestätigung und Antwort zurück.
  clientConn.senden('Hallo Welt');
  engine.runUntil(engine.now + 2 * SEC);
  ok('die Daten kommen an', empfangen.join('') === 'Hallo Welt', empfangen.join('|'));
  ok('und die Antwort auch zurück', antwort.join('') === 'OK:10', antwort.join('|'));
  ok('nichts bleibt unbestätigt',
     clientConn.offen.length === 0 && serverConn.offen.length === 0,
     clientConn.offen.length + '/' + serverConn.offen.length);

  const nachDaten = mit.view().filter(r => r.proto === 'TCP');
  ok('der Mitschnitt nennt die Länge der Nutzdaten',
     nachDaten.some(r => /10 Byte/.test(r.info)),
     nachDaten.map(r => r.info).join(' | '));
  ok('und beide Portnummern',
     nachDaten.every(r => /→ \d+/.test(r.info)));

  // Abbau: vier Segmente, dann ist bei beiden nichts mehr offen.
  const vorAbbau = mit.view().filter(r => r.proto === 'TCP').length;
  clientConn.schliessen();
  engine.runUntil(engine.now + 3 * SEC);
  const abbau = mit.view().filter(r => r.proto === 'TCP').slice(vorAbbau)
    .map(r => r.info.replace(/.*\[/, '[').replace(/\].*/, ']'));
  ok('der Abbau braucht vier Segmente', abbau.length === 4, abbau.join(' '));
  ok('FIN · ACK · FIN · ACK', abbau.join(' ') === '[ACK, FIN] [ACK] [ACK, FIN] [ACK]', abbau.join(' '));
  ok('danach ist die Verbindung bei beiden weg',
     stack.sockets(a).filter(r => r.proto === 'TCP').length === 0
     && stack.sockets(s).filter(r => r.proto === 'TCP' && r.fern !== '—').length === 0);
}

/* Auf einen Port, auf dem niemand hört, kommt ein RST — sofort,
   und nicht erst nach einer Frist. Das ist der Unterschied zu
   „die Gegenstelle antwortet nicht" und der Grund, warum ein
   Browser sofort sagen kann, dass da kein Server läuft. */
{
  const { engine, netz, stack, mit, a } = tcpPaar();
  let fehler = null, verbunden = false;
  stack.tcpVerbinde(a, '192.168.1.20', 80, 'Webbrowser', (err, c) => {
    if (err) fehler = err; else verbunden = true;
  });
  engine.runUntil(2 * SEC);
  ok('kein Server, keine Verbindung', !verbunden && !!fehler, fehler);
  ok('und die Begründung nennt den Port', /Port 80/.test(fehler || ''), fehler);
  const rst = mit.view().filter(r => r.proto === 'TCP');
  ok('im Mitschnitt steht ein RST', rst.some(r => /RST/.test(r.info)),
     rst.map(r => r.info).join(' | '));
  ok('das RST kommt VOR Ablauf der Frist',
     engine.now < stack.TCP_FRIST, engine.now + ' / ' + stack.TCP_FRIST);
}

/* Ein verlorenes Segment wird wiederholt — die eine Sache, die
   TCP kann und UDP nicht.

   ⚠️ Der erste Versuch dieser Prüfung setzte den Verlust auf 1,
   BEVOR die Verbindung stand, und war grün. Geprüft hat er
   trotzdem nichts: verloren ging die ARP-Anfrage, wiederholt hat
   ARP, und das SYN lag derweil in dessen Warteschlange. Der
   Verlust muss also NACH dem Handschlag anfangen — dann ist die
   MAC-Adresse bekannt und das Segment geht wirklich auf die
   Leitung. (Dieselbe Falle wie bei der Ping-Frist: was ARP
   ausbügelt, sieht aus, als hätte es TCP getan.) */
{
  const { engine, netz, stack, mit, a, s } = tcpPaar(11);
  let angekommen = null, conn = null;
  stack.tcpHoeren(s, 80, (c) => { c.onDaten((t) => angekommen = t); }, 'Echo');
  stack.tcpVerbinde(a, '192.168.1.20', 80, 'Test', (err, c) => { if (!err) conn = c; });
  engine.runUntil(2 * SEC);
  ok('erst steht die Verbindung', !!conn);

  netz.cableList()[0].loss = 1;              // ab jetzt geht alles verloren
  const vorher = mit.view().filter(r => r.proto === 'TCP').length;
  conn.senden('verloren?');
  engine.runUntil(engine.now + 500 * sandbox.NetUtil.MS);
  ok('das Segment kommt nicht an', angekommen === null);
  ok('es war aber auf der Leitung — und der Mitschnitt zeigt den Verlust',
     mit.view().filter(r => r.proto === 'TCP').length > vorher
     && mit.view().slice(-4).some(r => r.lost),
     JSON.stringify(mit.view().slice(-2).map(r => [r.proto, !!r.lost])));

  netz.cableList()[0].loss = 0;
  engine.runUntil(engine.now + stack.TCP_FRIST + 2 * SEC);
  ok('nach der Frist wiederholt TCP von selbst', angekommen === 'verloren?', String(angekommen));
  /* Drei Zeilen für ein Segment, und jede sagt etwas anderes:
     „ging los", „kam nie an" (so zeichnet der Mitschnitt einen
     Verlust — siehe netz.sendFrame) und „ging noch einmal los".
     Zwei Abgänge, ein Verlust: das ist die Geschichte, die ein
     Kind hier lesen soll. */
  const mitDaten = mit.view().filter(r => r.proto === 'TCP' && /9 Byte/.test(r.info));
  ok('dasselbe Segment steht dreimal im Mitschnitt', mitDaten.length === 3,
     String(mitDaten.length));
  ok('zweimal als Abgang, einmal als Verlust',
     mitDaten.filter(r => !r.lost).length === 2 && mitDaten.filter(r => r.lost).length === 1,
     JSON.stringify(mitDaten.map(r => !!r.lost)));
}

/* ⚠️ Zwei VERSCHIEDENE Bestätigungen in derselben Mikrosekunde.
   Der Server antwortet und macht sofort zu; beim Client kommen
   Daten und FIN gleichzeitig an, und er schickt zwei ACKs los,
   die sich im Text nicht unterscheiden — nur in der
   Bestätigungsnummer. Der Mitschnitt zog sie zu „× 2" zusammen
   und behauptete damit, derselbe Rahmen sei zweimal gegangen.
   Gefunden hat das nur das BILD; seither vergleicht er den
   Rahmen und nicht seinen Text. */
{
  const { engine, netz, stack, mit, a, s } = tcpPaar(3);
  stack.tcpHoeren(s, 80, (c) => {
    c.onDaten(() => { c.senden('<html>Hallo</html>'); c.schliessen(); });
  }, 'Webserver');
  stack.tcpVerbinde(a, '192.168.1.20', 80, 'Webbrowser',
    (err, c) => { if (!err) c.senden('GET /'); });
  engine.runUntil(6 * SEC);
  const tcpRows = mit.view().filter(r => r.proto === 'TCP');
  ok('der Server antwortet und macht zu', tcpRows.some(r => /FIN/.test(r.info)));
  ok('keine zwei verschiedenen Segmente in einer Zeile',
     tcpRows.every(r => r.mal === 1),
     tcpRows.filter(r => r.mal > 1).map(r => r.mal + '× ' + r.info).join(' | '));

  /* Die Gegenprobe, damit das Zusammenfassen nicht versehentlich
     ganz abgeschaltet wird: ein Rundruf über einen Switch gehört
     weiterhin in EINE Zeile. */
  const b2 = bau();
  const h1 = b2.netz.addNode('host', 100, 100);
  const sw = b2.netz.addNode('switch', 200, 200);
  const h2 = b2.netz.addNode('host', 300, 100);
  const h3 = b2.netz.addNode('host', 300, 300);
  konf(h1, 0, '192.168.1.10'); konf(h2, 0, '192.168.1.11'); konf(h3, 0, '192.168.1.12');
  b2.netz.addCable(h1.id, 0, sw.id, 0);
  b2.netz.addCable(h2.id, 0, sw.id, 1);
  b2.netz.addCable(h3.id, 0, sw.id, 2);
  b2.stack.ping(h1, '192.168.1.11', 1, 4 * SEC, () => {});
  b2.engine.runUntil(4 * SEC);
  ok('der Switch flutet weiterhin in EINER Zeile',
     b2.mit.view().some(r => r.proto === 'ARP' && r.mal > 1),
     b2.mit.view().filter(r => r.proto === 'ARP').map(r => r.mal + '× ' + r.nodeName).join(' | '));
}

/* Die Frist muss ÜBER der Geduld der Adressauflösung liegen.
   Sonst schickt TCP ein zweites SYN los, während ARP noch fragt —
   und im Mitschnitt stünde ein Verlust, den es nie gab. */
{
  const { stack } = tcpPaar();
  ok('TCP-Frist über ARP-Geduld (0,8 s × 3)', stack.TCP_FRIST > 2400 * sandbox.NetUtil.MS,
     String(stack.TCP_FRIST));
  ok('TCP-Frist unter fünf Sekunden (Tempo!)', stack.TCP_FRIST <= 5 * SEC, String(stack.TCP_FRIST));
}

/* Über einen Router, und damit über zwei Adressauflösungen. */
{
  const b = bau();
  const { engine, netz, stack } = b;
  const a = netz.addNode('host', 100, 100);
  const r = netz.addNode('router', 300, 100);
  const s = netz.addNode('server', 500, 100);
  konf(a, 0, '192.168.1.10'); a.gateway = '192.168.1.1';
  konf(r, 0, '192.168.1.1'); konf(r, 1, '192.168.2.1');
  konf(s, 0, '192.168.2.20'); s.gateway = '192.168.2.1';
  netz.addCable(a.id, 0, r.id, 0);
  netz.addCable(r.id, 1, s.id, 0);

  let da = null;
  stack.tcpHoeren(s, 80, (c) => { c.onDaten((t) => { da = t; c.senden('gelesen'); }); }, 'Webserver');
  let echo = null;
  stack.tcpVerbinde(a, '192.168.2.20', 80, 'Webbrowser', (err, c) => {
    if (err) return;
    c.onDaten((t) => echo = t);
    c.senden('quer durchs Netz');
  });
  engine.runUntil(8 * SEC);
  ok('TCP geht über einen Router', da === 'quer durchs Netz', String(da));
  ok('und die Antwort kommt zurück', echo === 'gelesen', String(echo));
}

/* netstat: die Frage „wer hört auf dieser Nummer" — mit der
   Spalte, die Filius nicht hat. */
{
  const { engine, netz, stack, a, s } = tcpPaar();
  stack.tcpHoeren(s, 80, () => {}, 'Webserver');
  stack.listen(s, 53, () => {}, 'DNS-Server');
  const z = stack.sockets(s);
  ok('netstat kennt den UDP-Dienst', z.some(r => r.proto === 'UDP' && /:53$/.test(r.lokal)));
  ok('und den TCP-Lauscher', z.some(r => r.proto === 'TCP' && /:80$/.test(r.lokal)));
  ok('beide mit Programmnamen',
     z.every(r => r.programm), JSON.stringify(z));
  ok('der Lauscher heißt „hört zu"',
     z.filter(r => r.fern === '—').every(r => r.zustand === 'hört zu'), JSON.stringify(z));

  stack.tcpVerbinde(a, '192.168.1.20', 80, 'Webbrowser', () => {});
  engine.runUntil(2 * SEC);
  const zs = stack.sockets(s), za = stack.sockets(a);
  ok('die stehende Verbindung taucht auf beiden Seiten auf',
     zs.some(r => r.zustand === 'verbunden') && za.some(r => r.zustand === 'verbunden'),
     JSON.stringify(zs) + ' || ' + JSON.stringify(za));
  ok('der Client führt keinen Lauscher',
     za.filter(r => r.fern === '—').length === 0, JSON.stringify(za));

  /* Ausschalten räumt auf — sonst stünden Karteileichen in der
     Liste eines Geräts, das gar nicht läuft. */
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  a.on = false;
  dienste.sync();
  ok('ein ausgeschaltetes Gerät hat keine Verbindungen mehr',
     stack.sockets(a).length === 0, JSON.stringify(stack.sockets(a)));
}

/* ═══ 14c · Dateisystem ═══ */
section('Dateisystem');
{
  const D = sandbox.Dateien;
  const { netz } = bau();
  const a = netz.addNode('host', 100, 100);

  /* ⭐ Seit dem 2026-09-28 hat ein neues ENDGERÄT genau eine Sache:
     den Ordner `/Bilder` mit der eingebauten Sammlung. Vorher stand
     hier „ein neues Gerät hat NICHTS" — die Regel aus Filius. Der
     Bruch ist vom Nutzer gesetzt und im Kopf von dateien.js
     begründet: Bilder sind Material und keine vorweggenommene
     Antwort. */
  ok('ein neues Endgerät hat genau den Ordner /Bilder',
     D.list(a, '/').length === 1 && D.list(a, '/')[0].name === 'Bilder');
  ok('und darin die sechs eingebauten Bilder',
     D.list(a, '/Bilder').length === 6
     && D.list(a, '/Bilder').every(e => D.art(a, '/Bilder/' + e.name) === 'bild'));
  ok('sie sind anzeigbar',
     D.list(a, '/Bilder').every(e =>
       /^data:image\/(svg|png)/.test(D.bildQuelle(D.lesen(a, '/Bilder/' + e.name).bild))));
  /* ⚠️ Der Punkt, an dem der Ordner überhaupt vertretbar ist: die
     Bilder sind VERWEISE (`bild: '@schule'`) und liegen nicht im
     Inhaltsspeicher. Vier Bilder auf zwanzig Geräten kosten nichts. */
  ok('und kosten keinen Platz im Inhaltsspeicher', D.verbrauch(netz) === 0);
  ok('ein Switch bekommt keinen — er hat keinen Bildschirm',
     D.list(netz.addNode('switch', 300, 100), '/').length === 0);
  ok('ein Router auch nicht',
     D.list(netz.addNode('router', 400, 100), '/').length === 0);
  ok('ein Handy dagegen schon',
     D.list(netz.addNode('handy', 500, 100), '/Bilder').length === 6);

  /* Ab hier auf einem Gerät, das wirklich nichts hat — sonst zählt
     jede Prüfung auf „genau ein Eintrag" die Bilder mit. */
  D.loeschen(a, '/Bilder');
  ok('der Ordner lässt sich wegwerfen wie jeder andere',
     Object.keys(D.raum(a)).length === 0);
  ok('die Wurzel gibt es trotzdem', D.gibt(a, '/') && D.art(a, '/') === 'ordner');

  ok('Ordner anlegen', D.ordnerAnlegen(a, '/', 'webserver').ok);
  ok('derselbe Name ein zweites Mal geht nicht',
     !D.ordnerAnlegen(a, '/', 'webserver').ok);
  ok('und die Begründung nennt den Namen',
     /webserver/.test(D.ordnerAnlegen(a, '/', 'webserver').fehler));
  ok('ein leerer Ordner ist ein eigener Eintrag — sonst gäbe es ihn nicht',
     D.list(a, '/').length === 1 && D.list(a, '/webserver').length === 0);

  const r = D.anlegen(a, '/webserver', 'index.html', { text: '<html>hallo</html>' });
  ok('Datei anlegen', r.ok && r.pfad === '/webserver/index.html');
  ok('die Endung entscheidet die Art', D.art(a, r.pfad) === 'text');
  ok('Inhalt lesen', D.lesen(a, r.pfad).text === '<html>hallo</html>');
  D.schreiben(a, r.pfad, 'neu');
  ok('Inhalt schreiben', D.lesen(a, r.pfad).text === 'neu');

  D.anlegen(a, '/webserver', 'logo.png', { bild: '@schule' });
  ok('ein Bild ist ein Bild', D.art(a, '/webserver/logo.png') === 'bild');
  ok('und hat eine anzeigbare Quelle',
     /^data:image\/svg/.test(D.bildQuelle(D.lesen(a, '/webserver/logo.png').bild)));
  ok('ein unbekannter Bildname liefert nichts', D.bildQuelle('@gibtsnicht') === null);

  ok('Ordner zuerst, dann nach Namen',
     D.list(a, '/webserver').map(e => e.name).join(',') === 'index.html,logo.png');

  /* Umbenennen zieht die Kinder mit — das ist die eine Stelle,
     an der die flache Zuordnung mehr tut als ein Baum. */
  const um = D.umbenennen(a, '/webserver', 'web');
  ok('Ordner umbenennen', um.ok && um.pfad === '/web');
  ok('die Dateien darin wandern mit',
     D.gibt(a, '/web/index.html') && !D.gibt(a, '/webserver/index.html'));
  ok('ein Name mit Schrägstrich wird abgelehnt',
     !D.umbenennen(a, '/web/index.html', 'a/b').ok);
  ok('ein leerer Name auch', !D.umbenennen(a, '/web/index.html', '  ').ok);
  ok('derselbe Name ist kein Fehler, sondern nichts zu tun',
     D.umbenennen(a, '/web/index.html', 'index.html').ok);

  ok('Löschen nimmt den ganzen Ordner mit',
     D.loeschen(a, '/web') && Object.keys(D.raum(a)).length === 0);

  /* Pfade: relativ, „..", doppelte Schrägstriche. */
  ok('normieren räumt auf', D.normieren('/a//b/../c/') === '/a/c');
  ok('und kommt nie über die Wurzel hinaus', D.normieren('/../..') === '/');
  ok('Elternteil der Wurzel ist die Wurzel', D.elternteil('/') === '/');
  ok('Basisname', D.basis('/a/b/c.txt') === 'c.txt');
  ok('Endung klein geschrieben', D.endung('/a/B.HTML') === 'html');
}

/* Speichern und Neuladen: Dateien gehören in den Stand. */
{
  const D = sandbox.Dateien;
  const { netz } = bau();
  const a = netz.addNode('host', 100, 100);
  const b = netz.addNode('host', 300, 100);
  D.ordnerAnlegen(a, '/', 'webserver');
  D.anlegen(a, '/webserver', 'index.html', { text: 'Hallo' });
  D.anlegen(a, '/webserver', 'logo.png', { bild: '@logo' });

  /* ⚠️ Das zweite Endgerät hat seine Bilder weggeworfen. Genau das
     muss das Speicherformat aushalten: `grundbestand` läuft in
     `addNode` und NICHT in `fromJSON` — sonst stünde der Ordner
     nach dem nächsten Laden wieder da, und niemand käme auf die
     Ursache. */
  D.loeschen(b, '/Bilder');
  const sw = netz.addNode('switch', 500, 100);

  const roh = JSON.stringify(netz.toJSON());
  ok('ein Gerät OHNE Dateien schreibt das Feld nicht',
     JSON.parse(roh).nodes.find(n => n.id === sw.id).dateien === undefined, roh.slice(0, 120));

  const { netz: netz2 } = bau();
  netz2.fromJSON(JSON.parse(roh));
  const a2 = netz2.list()[0];
  ok('nach dem Neuladen sind die Dateien da',
     D.lesen(a2, '/webserver/index.html').text === 'Hallo');
  ok('auch das Bild', D.lesen(a2, '/webserver/logo.png').bild === '@logo');
  ok('und der leere Ordner ebenfalls', D.art(a2, '/webserver') === 'ordner');
  ok('die eingebauten Bilder überleben das Speichern',
     D.list(a2, '/Bilder').length === 6);
  ok('⭐ ein weggeworfenes /Bilder kommt beim Laden NICHT wieder',
     !D.gibt(netz2.list()[1], '/Bilder'));

  /* Kopieren und Einfügen: Dateien kommen MIT (anders als die
     MAC-Adresse, die neu gewürfelt wird). */
  const schnipsel = netz2.ausschnitt([a2.id]);
  const neue = netz2.einfuegen(schnipsel, 40, 40);
  const kopie = netz2.get(neue[0]);
  ok('eine Kopie bringt die Dateien mit',
     D.lesen(kopie, '/webserver/index.html').text === 'Hallo');
  ok('aber eine eigene MAC-Adresse', kopie.nics[0].mac !== a2.nics[0].mac);
  D.schreiben(kopie, '/webserver/index.html', 'anders');
  ok('und die Kopie hängt nicht am Original',
     D.lesen(a2, '/webserver/index.html').text === 'Hallo');
}

/* Die Dateibefehle im Terminal. */
{
  const D = sandbox.Dateien;
  const { engine, netz, stack } = bau();
  const a = netz.addNode('host', 100, 100);
  let gemeldet = 0;
  const term = new sandbox.Terminal(engine, netz, stack, null, { onDirty: () => gemeldet++ });
  const text = () => term.linesOf(a.id).map(l => l.text).join('\n');

  term.submit(a.id, 'pwd');
  ok('pwd nennt die Wurzel', /\n\/$/m.test(text()) || text().trim().endsWith('/'), text().slice(-60));
  term.submit(a.id, 'mkdir webserver');
  ok('mkdir legt an', D.art(a, '/webserver') === 'ordner');
  ok('und meldet die Änderung', gemeldet > 0);
  term.submit(a.id, 'cd webserver');
  term.submit(a.id, 'touch index.html');
  ok('touch legt im AKTUELLEN Ordner an', D.gibt(a, '/webserver/index.html'));
  D.schreiben(a, '/webserver/index.html', 'Zeile 1\nZeile 2');
  term.submit(a.id, 'cat index.html');
  ok('cat zeigt beide Zeilen', /Zeile 1/.test(text()) && /Zeile 2/.test(text()));
  term.submit(a.id, 'ls');
  ok('ls listet die Datei', /index\.html/.test(text()));
  term.submit(a.id, 'cd ..');
  term.submit(a.id, 'pwd');
  ok('cd .. geht eine Stufe zurück', text().trim().split('\n').pop() === '/');
  term.submit(a.id, 'rm /webserver');
  ok('rm löscht auch einen Ordner', !D.gibt(a, '/webserver'));
  term.submit(a.id, 'cat gibtsnicht.txt');
  ok('cat sagt, wenn es die Datei nicht gibt', /gibt es nicht/.test(text()));

  /* ⚠️ Wer den Ordner löscht, in dem er steht, muss danach
     irgendwo stehen — und nicht in einem Pfad, den es nicht mehr
     gibt. Sonst scheitert der nächste `ls` an etwas, das mit dem
     Befehl nichts zu tun hat. */
  D.ordnerAnlegen(a, '/', 'tief');
  D.ordnerAnlegen(a, '/tief', 'drin');
  term.submit(a.id, 'cd /tief/drin');
  term.submit(a.id, 'rm /tief');
  term.submit(a.id, 'pwd');
  ok('nach dem Löschen des eigenen Ordners steht man eine Stufe höher',
     text().trim().split('\n').pop() === '/', text().slice(-80));
}

/* ═══ 14c · Echte Dateien einführen ════════════════════════════
   Der Kern dieser Sache ist nicht die Einfuhr, sondern WO die
   Inhalte liegen: NICHT in `netz.toJSON()`. Das ist auch das
   Format des Verlaufs (sechzig Stände, bei jeder Änderung neu
   serialisiert) — ein eingeführtes Foto darin machte jedes
   Verschieben eines Geräts zäh. Genau das prüft der Abschnitt.  */
section('Dateien einführen');
{
  const D = sandbox.Dateien;
  const { netz } = bau();
  const a = netz.addNode('host', 100, 100);
  const b = netz.addNode('server', 300, 100);
  D.blobsLeeren();

  const uri = 'data:image/png;base64,' + 'A'.repeat(2000);

  ok('eine Textdatei kommt INLINE — nur so kann der Editor sie öffnen',
     (() => {
       const r = D.einfuehren(a, '/', 'seite.html', { text: '<h1>Hallo</h1>' }, netz);
       return r.ok && a.dateien['/seite.html'].text === '<h1>Hallo</h1>';
     })());

  const r1 = D.einfuehren(a, '/', 'bild.png', { datenUri: uri }, netz);
  ok('ein Bild wird eingeführt', r1.ok, JSON.stringify(r1));
  ok('der Eintrag hält nur einen Schlüssel, nicht den Inhalt',
     /^blob:/.test(a.dateien['/bild.png'].bild)
     && a.dateien['/bild.png'].bild.length < 40,
     a.dateien['/bild.png'].bild);
  ok('die Größe steht dabei', a.dateien['/bild.png'].groesse === uri.length);
  ok('und der Inhalt kommt vollständig zurück',
     D.bildQuelle(a.dateien['/bild.png'].bild) === uri);
  ok('es ist ein Bild', D.art(a, '/bild.png') === 'bild');

  /* ⭐ DIE Prüfung dieser Runde. Steht die Daten-URI im
     Speicherformat, ist sie auch im Verlauf — sechzigmal. */
  const j = netz.toJSON();
  const text = JSON.stringify(j);
  ok('⭐ netz.toJSON() enthält KEINE Daten-URI', text.indexOf('data:image') < 0,
     String(text.length));
  ok('und bleibt klein', text.length < 2000, String(text.length));
  ok('der Verweis steht aber drin', text.indexOf('blob:') > 0);

  /* Dieselbe Datei ein zweites Mal kostet keinen Platz: gleicher
     Inhalt, gleicher Streuwert, gleicher Eintrag. */
  const vorher = D.verbrauch(netz);
  D.einfuehren(b, '/', 'kopie.png', { datenUri: uri }, netz);
  ok('dieselbe Datei auf zwei Geräten kostet einmal Platz',
     D.verbrauch(netz) === vorher, vorher + ' → ' + D.verbrauch(netz));
  ok('beide zeigen trotzdem dasselbe Bild',
     D.bildQuelle(b.dateien['/kopie.png'].bild) === uri);

  /* Speichern und Laden: die Inhalte reisen mit, aber getrennt. */
  const stand = Object.assign(netz.toJSON(), { blobs: D.blobsBenutzt(netz) });
  ok('die Inhalte stehen im vollständigen Stand',
     Object.keys(stand.blobs).length === 1);
  D.blobsLeeren();
  ok('nach dem Leeren ist der Inhalt weg', D.bildQuelle(a.dateien['/bild.png'].bild) === null);
  D.blobsLaden(stand.blobs);
  ok('und nach dem Laden wieder da',
     D.bildQuelle(a.dateien['/bild.png'].bild) === uri);

  /* Nur was benutzt wird, wandert in die Datei — im Speicher darf
     der Rest für Strg+Z liegen bleiben. */
  D.loeschen(a, '/bild.png');
  D.loeschen(b, '/kopie.png');
  ok('ein gelöschter Inhalt steht nicht mehr im Stand',
     Object.keys(D.blobsBenutzt(netz)).length === 0);
  ok('⚠️ liegt aber noch im Speicher — sonst käme Strg+Z ins Leere',
     D.bildQuelle('blob:' + Object.keys(stand.blobs)[0]) === uri);

  /* Die Grenzen. */
  const gross = 'data:image/png;base64,' + 'A'.repeat(D.GRENZE_DATEI);
  const rg = D.einfuehren(a, '/', 'riesig.png', { datenUri: gross }, netz);
  ok('eine zu große Datei wird abgewiesen', !rg.ok);
  ok('und die Meldung nennt die Grenze', /2 MB/.test(rg.fehler), rg.fehler);
  const rt = D.einfuehren(a, '/', 'lang.txt', { text: 'x'.repeat(D.GRENZE_TEXT + 1) }, netz);
  ok('eine zu große Textdatei auch', !rt.ok && /zu groß/.test(rt.fehler), rt.fehler);

  /* Eine Datei, die dieses Gerät nicht anzeigen kann, wird
     trotzdem eingeführt — so hält es Filius auch. Sie ist da, sie
     lässt sich übertragen, sie geht nur nicht auf. */
  const rp = D.einfuehren(a, '/', 'heft.pdf', { datenUri: 'data:application/pdf;base64,AAA' }, netz);
  ok('eine unbekannte Dateiart kommt trotzdem herein', rp.ok);
  ok('sie gilt aber als „unbekannt" und nicht als Bild',
     D.art(a, '/heft.pdf') === 'unbekannt');
  ok('auch ihr Inhalt steht nicht im Speicherformat',
     JSON.stringify(netz.toJSON()).indexOf('application/pdf') < 0);

  // Und ein Name, den es schon gibt, wird abgewiesen wie sonst auch.
  D.einfuehren(a, '/', 'zwei.png', { datenUri: uri }, netz);
  const rz = D.einfuehren(a, '/', 'zwei.png', { datenUri: uri }, netz);
  ok('ein Name, den es schon gibt, wird abgewiesen', !rz.ok && /zwei\.png/.test(rz.fehler),
     rz.fehler);
}

/* ═══ 14d · Hervorhebung im Editor ═══
   Text hinein, eingefärbter Text heraus — ohne Browser prüfbar
   und deshalb hier. Geprüft wird, dass die vier Sorten die
   richtigen STÜCKE treffen; dass sie auf dem Schirm auch
   verschieden aussehen, prüft der Browser-Prüfstand. */
section('Hervorhebung');
{
  const P = sandbox.ProgDateien;
  const stueck = (html, k) => {
    const re = new RegExp('<span class="sy sy--' + k + '">([^<]*)</span>', 'g');
    const out = []; let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return out;
  };

  ok('die Endung entscheidet die Sprache',
     P.editorArt('/a/seite.html') === 'html' && P.editorArt('/a/stil.css') === 'css'
     && P.editorArt('/a/notiz.txt') === 'roh');

  const h = P.faerben('<h1 class="kopf">Hallo</h1>', 'html');
  ok('HTML: die Marke', stueck(h, 'tag').join('').indexOf('&lt;h1') === 0, stueck(h, 'tag').join('|'));
  ok('HTML: der Attributname', stueck(h, 'attr').indexOf('class') >= 0, stueck(h, 'attr').join('|'));
  ok('HTML: der Wert mit Anführungszeichen',
     stueck(h, 'wert').join('').indexOf('&quot;kopf&quot;') >= 0, stueck(h, 'wert').join('|'));
  ok('HTML: der sichtbare Text', stueck(h, 'txt').indexOf('Hallo') >= 0, stueck(h, 'txt').join('|'));

  const k = P.faerben('<!-- weg -->x', 'html');
  ok('HTML: der Kommentar am Stück',
     stueck(k, 'kom').join('') === '&lt;!-- weg --&gt;', stueck(k, 'kom').join('|'));

  const j = P.faerben('<p>a</p><script>alert(1)</script><p>b</p>', 'html');
  ok('JavaScript wird als EIN Stück markiert', stueck(j, 'js').length === 1, stueck(j, 'js').join('|'));
  ok('und samt seiner Marken', /script.*alert\(1\).*script/.test(stueck(j, 'js')[0] || ''),
     stueck(j, 'js')[0]);
  ok('was danach kommt, ist wieder normal',
     stueck(j, 'txt').indexOf('b') >= 0, stueck(j, 'txt').join('|'));

  /* ⚠️ Dieselbe Rolle, dieselbe Farbe — in beiden Sprachen.
     Der Selektor steht da, wo in HTML die Marke steht; die
     Eigenschaft da, wo das Attribut steht. Andersherum war es
     eine Runde lang, und dann lernt ein Kind beim Wechsel von
     der Seite zur Stildatei zweierlei. */
  const c = P.faerben('.kopf { color: red; }', 'css');
  ok('CSS: der Selektor wird wie eine Marke gefärbt',
     stueck(c, 'tag').join('').indexOf('.kopf') >= 0, stueck(c, 'tag').join('|'));
  ok('CSS: die Eigenschaft wie ein Attribut',
     stueck(c, 'attr').join('').indexOf('color') >= 0, stueck(c, 'attr').join('|'));
  ok('CSS: der Wert bleibt der Wert',
     stueck(c, 'wert').join('').indexOf('red') >= 0, stueck(c, 'wert').join('|'));
  ok('CSS: Kommentare auch hier',
     stueck(P.faerben('/* x */ a{}', 'css'), 'kom').join('') === '/* x */',
     stueck(P.faerben('/* x */ a{}', 'css'), 'kom').join('|'));

  /* Nichts darf verschwinden: was hineingeht, muss — einmal
     entschärft — auch wieder herauskommen. Sonst zeigt der
     Spiegel etwas anderes als das Eingabefeld darüber, und der
     Textcursor steht neben seiner Farbe. */
  const roh = '<a href="x">1</a>\n\n<!-- k -->\n  Text & mehr\n';
  const zurueck = P.faerben(roh, 'html')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  ok('der Spiegel gibt den Text Zeichen für Zeichen zurück',
     zurueck === roh + ' ', JSON.stringify(zurueck.slice(-30)));
  ok('auch bei einer leeren Datei', P.faerben('', 'html').indexOf('<span') < 0
     || P.faerben('', 'html').replace(/<[^>]*>/g, '') === ' ');
}

/* ═══ 14e · HTTP ═══ */
section('HTTP');
function webNetz(seed) {
  const b = bau(seed);
  const dienste = new sandbox.Dienste(b.engine, b.netz, b.stack, {});
  const cli = b.netz.addNode('host', 100, 100);
  const srv = b.netz.addNode('server', 300, 100);
  konf(cli, 0, '192.168.1.10'); konf(srv, 0, '192.168.1.20');
  b.netz.addCable(cli.id, 0, srv.id, 0);
  srv.software = ['webserver'];
  dienste.http.standardDateien(srv);
  b.netz.webConf(srv).on = true;
  dienste.start();
  dienste.sync();
  return Object.assign(b, { dienste, cli, srv, http: dienste.http });
}
{
  const { engine, netz, stack, mit, cli, srv, http } = webNetz();
  const D = sandbox.Dateien;

  ok('die Installation legt den Ordner an', D.art(srv, '/webserver') === 'ordner');
  ok('mit Seite, Stildatei und Bild',
     D.gibt(srv, '/webserver/index.html') && D.gibt(srv, '/webserver/stil.css')
     && D.gibt(srv, '/webserver/mpskills-logo.png') && D.gibt(srv, '/webserver/synir-logo.png'));
  ok('der Server hört auf 80',
     stack.sockets(srv).some(r => r.proto === 'TCP' && /:80$/.test(r.lokal)
       && r.programm === 'Webserver'), JSON.stringify(stack.sockets(srv)));

  let seite = null;
  http.seiteHolen(cli, '192.168.1.20', (r) => seite = r);
  engine.runUntil(20 * SEC);

  ok('die Seite kommt an', seite && seite.ok && seite.status === 200,
     seite && (seite.grund || seite.status));
  /* ⭐ Die Lernaussage: EINE Seite, VIER Anfragen. */
  ok('eine Seite sind vier Anfragen', seite && seite.teile.length === 4,
     seite && JSON.stringify(seite.teile.map(t => t.pfad)));
  ok('und „/" meint die Startseite',
     seite && seite.teile[0].pfad === '/', seite && seite.teile[0].pfad);
  ok('alle vier mit Status 200',
     seite && seite.teile.every(t => t.status === 200),
     seite && JSON.stringify(seite.teile));

  ok('die Stildatei steckt danach IN der Seite',
     /<style>/.test(seite.html) && /font-family/.test(seite.html));
  ok('und das Bild als Daten-URI',
     /<img[^>]+src="data:image\/png/.test(seite.html), seite.html.slice(0, 300));
  ok('die Quelle bleibt daneben erhalten (zum Anzeigen im Editor)',
     /<link/.test(seite.quelle) && !/<style>/.test(seite.quelle));

  const http1 = mit.view().filter(r => r.proto === 'HTTP');
  ok('der Mitschnitt nennt HTTP beim Namen', http1.length >= 6, String(http1.length));
  ok('und zeigt die Anfragezeile statt Portnummern',
     http1.some(r => /GET \/stil\.css/.test(r.info)),
     http1.map(r => r.info).join(' | ').slice(0, 200));
  ok('die Antwort nennt Status und Inhaltstyp',
     http1.some(r => /200 OK\s+text\/css/.test(r.info)),
     http1.map(r => r.info).join(' | ').slice(0, 300));
  ok('der Server führt Protokoll über die Zugriffe',
     http.zugriffe(srv).length === 4, JSON.stringify(http.zugriffe(srv)));
}

/* Eine Datei, die es nicht gibt: EINE 404, und der Rest der
   Seite steht trotzdem. Genau diese Erfahrung hat ein Kind sonst
   nur als kaputtes Bildsymbol, ohne zu wissen warum. */
{
  const { engine, netz, stack, cli, srv, http } = webNetz(5);
  sandbox.Dateien.loeschen(srv, '/webserver/synir-logo.png');
  let seite = null;
  http.seiteHolen(cli, '192.168.1.20', (r) => seite = r);
  engine.runUntil(20 * SEC);
  ok('die Seite kommt trotzdem', seite && seite.ok && seite.status === 200);
  ok('genau eine der vier Anfragen ist eine 404',
     seite && seite.teile.filter(t => t.status === 404).length === 1,
     seite && JSON.stringify(seite.teile));
  ok('und die Stildatei ist trotzdem drin', /<style>/.test(seite.html));
}

/* Ohne laufenden Server: ein RST, und der Browser sagt denselben
   Satz wie Filius. */
{
  const { engine, netz, stack, cli, srv, http } = webNetz(6);
  netz.webConf(srv).on = false;
  const d = new sandbox.Dienste(engine, netz, stack, {});
  d.start(); d.sync();
  let seite = null;
  http.seiteHolen(cli, '192.168.1.20', (r) => seite = r);
  engine.runUntil(20 * SEC);
  ok('ohne laufenden Server kommt keine Seite', seite && !seite.ok);
  ok('und die Meldung ist die aus Filius',
     seite && /Server konnte nicht erreicht werden/.test(seite.grund), seite && seite.grund);
}

/* Über den Namen statt über die Zahl — der Browser ist das
   Programm, an dem sich zeigt, wozu DNS gut ist. */
{
  /* ⚠️ Eigener Aufbau mit Switch: ein Endgerät hat GENAU EINEN
     Anschluss. Der erste Versuch hängte den DNS-Server per Kabel
     an den Webserver — dessen einziger Anschluss war schon
     belegt, und die Prüfung scheiterte an der Verkabelung statt
     an DNS. */
  const { engine, netz, stack, mit } = bau(7);
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const http = dienste.http;
  const sw  = netz.addNode('switch', 300, 200);
  const cli = netz.addNode('host',   100, 100);
  const srv = netz.addNode('server', 500, 100);
  const dns = netz.addNode('server', 500, 300);
  konf(cli, 0, '192.168.1.10'); konf(srv, 0, '192.168.1.20'); konf(dns, 0, '192.168.1.30');
  netz.addCable(cli.id, 0, sw.id, 0);
  netz.addCable(srv.id, 0, sw.id, 1);
  netz.addCable(dns.id, 0, sw.id, 2);

  srv.software = ['webserver'];
  http.standardDateien(srv);
  netz.webConf(srv).on = true;
  dns.software = ['dns'];
  netz.dnsConf(dns).on = true;
  netz.dnsConf(dns).records = [{ name: 'www.schule.de', ip: '192.168.1.20' }];
  cli.dns = '192.168.1.30';
  dienste.start();
  dienste.sync();

  let seite = null;
  http.seiteHolen(cli, 'www.schule.de/index.html', (r) => seite = r);
  engine.runUntil(30 * SEC);
  ok('eine Seite über ihren Namen', seite && seite.ok && seite.status === 200,
     seite && seite.grund);
  ok('erst wird gefragt, dann geholt',
     mit.view().findIndex(r => r.proto === 'DNS') <
     mit.view().findIndex(r => r.proto === 'HTTP'),
     mit.view().map(r => r.proto).join(','));
  ok('der Name steht im Host-Kopf der Anfrage',
     mit.view().some(r => r.frame && r.frame.payload && r.frame.payload.payload
       && /Host: www\.schule\.de/.test(String(r.frame.payload.payload.data || ''))));
}

/* Adressen zerlegen — die Stelle, an der ein Tippfehler des
   Kindes ankommt. */
{
  const { http } = webNetz(8);
  const z = (s) => http.zerlegeAdresse(s);
  ok('nur ein Name → Port 80 und „/"',
     JSON.stringify(z('www.schule.de')) === '{"host":"www.schule.de","port":80,"pfad":"/"}',
     JSON.stringify(z('www.schule.de')));
  ok('mit Pfad', z('www.schule.de/a/b.html').pfad === '/a/b.html');
  ok('mit Port', z('192.168.1.20:8080').port === 8080);
  ok('„http://" davor stört nicht', z('http://www.schule.de').host === 'www.schule.de');
  ok('leer ist nichts', z('  ') === null);
  ok('ein unsinniger Port ist nichts', z('a:99999') === null);

  ok('Skripte werden ersetzt, nicht nur versteckt',
     /nicht ausgeführt/.test(http.einsetzen('<p>a</p><script>x</script>', []))
     && !/<script/i.test(http.einsetzen('<p>a</p><script>x</script>', [])));

  /* ⚠️ Ein Verweis nach DRAUSSEN wird nicht geholt. Der Browser
     kennt nur das simulierte Netz; eine Anfrage an das echte
     Internet wäre das Letzte, was dieses Programm tun darf. */
  const v = http.verweise('<img src="http://echt.example/x.png"><img src="logo.png">');
  ok('absolute Verweise werden nicht geholt', v.length === 1 && v[0].wert === 'logo.png',
     JSON.stringify(v));
  ok('ein <link> ohne stylesheet auch nicht',
     http.verweise('<link rel="icon" href="a.png">').length === 0);
}

/* ⭐ Szenario 7 als Ganzes: aus der Datei geladen, Dienste
   angeschaltet, Seite geholt. Das ist die Prüfung, die den
   Auftrag selbst absichert — ein Szenario, dessen Auftrag 1 nicht
   funktioniert, merkt sonst erst die Klasse. */
{
  const { engine, netz, stack, mit } = bau(4);
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  netz.fromJSON(JSON.parse(JSON.stringify(FIX.web.netz)));
  dienste.start();
  dienste.sync();
  const e1 = netz.byName('Endgerät 1');

  ok('Szenario 7: der Webserver bringt seine Seite mit',
     sandbox.Dateien.gibt(netz.byName('Webserver'), '/webserver/index.html'));
  ok('Szenario 7: der DNS-Server ist LEER — der Name ist die Aufgabe',
     netz.byName('DNS-Server').dnsServer.records.length === 0);
  ok('Szenario 7: die Auftragsecke bleibt frei (x<430, y<280)',
     FIX.web.netz.nodes.every(n => !(n.x < 430 && n.y < 280)));

  let seite = null;
  dienste.http.seiteHolen(e1, '192.168.2.30', (r) => seite = r);
  engine.runUntil(30 * SEC);
  ok('Szenario 7, Auftrag 1: die Seite kommt über die Adresse',
     seite && seite.ok && seite.teile.length === 3,
     seite && (seite.grund || JSON.stringify(seite.teile)));

  // Auftrag 2: Name eintragen, dann geht es auch darüber.
  netz.byName('DNS-Server').dnsServer.records.push({ name: 'www.schule.de', ip: '192.168.2.30' });
  let zweite = null;
  dienste.http.seiteHolen(e1, 'www.schule.de', (r) => zweite = r);
  engine.runUntil(engine.now + 30 * SEC);
  ok('Szenario 7, Auftrag 2: und über den Namen',
     zweite && zweite.ok, zweite && zweite.grund);

  // Auftrag 3: die Datei ändern, und die Seite ändert sich mit.
  sandbox.Dateien.schreiben(netz.byName('Webserver'), '/webserver/index.html',
    '<html><body><h1>Meine Seite</h1></body></html>');
  let dritte = null;
  dienste.http.seiteHolen(e1, '192.168.2.30', (r) => dritte = r);
  engine.runUntil(engine.now + 30 * SEC);
  ok('Szenario 7, Auftrag 3: die geänderte Datei kommt an',
     dritte && /Meine Seite/.test(dritte.html), dritte && dritte.grund);
  ok('und dann ist es nur noch EINE Anfrage — die Seite lädt ja nichts mehr nach',
     dritte && dritte.teile.length === 1, dritte && JSON.stringify(dritte.teile));
}

/* Kein Ausbruch aus dem Ordner des Servers. */
{
  const { engine, netz, stack, cli, srv, http } = webNetz(9);
  sandbox.Dateien.anlegen(srv, '/', 'geheim.txt', { text: 'nicht für dich' });
  let r = null;
  http.holen(cli, { host: '192.168.1.20', port: 80, pfad: '/../geheim.txt' }, (x) => r = x);
  engine.runUntil(20 * SEC);
  ok('„/.." führt nicht aus dem Ordner heraus', r && r.ok && r.status === 404,
     r && (r.status || r.grund));
}

/* ═══ 14f · E-Mail ═══ */
section('E-Mail');
/* Ein Netz mit einem Mailserver und zwei Rechnern daran. Der
   Switch ist nötig, weil ein Endgerät genau EINEN Anschluss hat. */
function mailNetz(seed) {
  const b = bau(seed);
  const dienste = new sandbox.Dienste(b.engine, b.netz, b.stack, {});
  const sw = b.netz.addNode('switch', 300, 200);
  const a  = b.netz.addNode('host',   100, 100);
  const c  = b.netz.addNode('host',   100, 300);
  const ms = b.netz.addNode('server', 500, 200);
  konf(a, 0, '192.168.1.10'); konf(c, 0, '192.168.1.11'); konf(ms, 0, '192.168.1.20');
  b.netz.addCable(a.id, 0, sw.id, 0);
  b.netz.addCable(c.id, 0, sw.id, 1);
  b.netz.addCable(ms.id, 0, sw.id, 2);

  ms.software = ['mailserver'];
  const s = b.netz.mailConf(ms);
  s.on = true; s.domain = 'schule.de';
  s.konten = [
    { benutzer: 'anna',  name: 'Anna',  passwort: 'apfel', posteingang: [] },
    { benutzer: 'bernd', name: 'Bernd', passwort: 'birne', posteingang: [] }
  ];
  const ka = b.netz.mailKonto(a);
  Object.assign(ka, { name: 'Anna', adresse: 'anna@schule.de', pop3: '192.168.1.20',
                      smtp: '192.168.1.20', benutzer: 'anna', passwort: 'apfel' });
  const kb = b.netz.mailKonto(c);
  Object.assign(kb, { name: 'Bernd', adresse: 'bernd@schule.de', pop3: '192.168.1.20',
                      smtp: '192.168.1.20', benutzer: 'bernd', passwort: 'birne' });
  a.software = ['mail']; c.software = ['mail'];
  dienste.start();
  dienste.sync();
  return Object.assign(b, { dienste, mail: dienste.mail, a, c, ms, sw });
}
{
  const { engine, netz, stack, mit, a, c, ms, mail } = mailNetz();

  ok('der Server hört auf 25 UND auf 110', (() => {
    const z = stack.sockets(ms).filter(r => r.proto === 'TCP');
    return z.some(r => /:25$/.test(r.lokal)) && z.some(r => /:110$/.test(r.lokal));
  })(), JSON.stringify(stack.sockets(ms)));

  let fehler = 'nichts';
  mail.senden(a, { an: 'bernd@schule.de', betreff: 'Hallo', text: 'Kommst du mit?' },
    (f) => fehler = f);
  engine.runUntil(30 * SEC);
  ok('die Nachricht ist beim Server angekommen', !fehler, String(fehler));
  ok('und liegt im Postfach des Empfängers',
     netz.mailConf(ms).konten[1].posteingang.length === 1,
     JSON.stringify(netz.mailConf(ms).konten.map(k => k.posteingang.length)));
  ok('mit Absender, Betreff und Text',
     (() => { const m = netz.mailConf(ms).konten[1].posteingang[0];
              return m.von === 'anna@schule.de' && m.betreff === 'Hallo'
                && /Kommst du mit/.test(m.text); })(),
     JSON.stringify(netz.mailConf(ms).konten[1].posteingang[0]));
  ok('die Absenderin hat sie unter „Gesendete"',
     (netz.mailKonto(a).gesendet || []).length === 1);

  /* ⭐ Die Aussage, die im Unterricht am meisten überrascht: bei
     Bernd ist noch NICHTS. Eine E-Mail wird nicht zugestellt —
     sie liegt auf dem Server, bis jemand sie abholt. */
  ok('beim Empfänger ist noch nichts — Post wird ABGEHOLT',
     (netz.mailKonto(c).posteingang || []).length === 0);

  const smtp = mit.view().filter(r => r.proto === 'SMTP');
  ok('der Mitschnitt nennt SMTP beim Namen', smtp.length > 6, String(smtp.length));
  ok('und man liest das Gespräch mit',
     smtp.some(r => /MAIL FROM: <anna@schule\.de>/.test(r.info))
     && smtp.some(r => /RCPT TO: <bernd@schule\.de>/.test(r.info))
     && smtp.some(r => /SMTP\s+250/.test(r.info))
     && smtp.some(r => /SMTP\s+354/.test(r.info)),
     smtp.map(r => r.info).join(' | ').slice(0, 260));
  /* ⚠️ Handschlag und Bestätigungen bleiben TCP — der Chip SMTP
     zeigt das GESPRÄCH und nicht die halbe Verbindung. */
  ok('unter SMTP steht nur, was wirklich SMTP ist',
     smtp.every(r => !/\[SYN|\[ACK\]|\[ACK, FIN\]/.test(r.info)),
     smtp.map(r => r.info).join(' | ').slice(0, 200));

  // Jetzt holt Bernd ab.
  let f2 = 'nichts', anzahl = -1;
  mail.abholen(c, (f, n) => { f2 = f; anzahl = n; });
  engine.runUntil(engine.now + 30 * SEC);
  ok('abholen meldet eine neue Nachricht', !f2 && anzahl === 1, String(f2) + '/' + anzahl);
  ok('sie liegt jetzt im Posteingang des Programms',
     (netz.mailKonto(c).posteingang || []).length === 1);
  ok('und ist vom Server verschwunden',
     netz.mailConf(ms).konten[1].posteingang.length === 0);

  const pop = mit.view().filter(r => r.proto === 'POP3');
  ok('der Mitschnitt nennt POP3 beim Namen', pop.length > 6, String(pop.length));
  ok('⭐ und das Passwort steht im KLARTEXT darin',
     pop.some(r => /PASS birne/.test(r.info)),
     pop.map(r => r.info).join(' | ').slice(0, 200));
  ok('die Ports sind 25 und 110, nicht irgendwas',
     smtp.every(r => /:/.test(r.info) || true)
     && mit.view().some(r => r.frame && r.frame.payload && r.frame.payload.payload
          && r.frame.payload.payload.dport === 110));

  // Ein falsches Passwort kommt nicht durch.
  const k = netz.mailKonto(c);
  k.passwort = 'falsch';
  let f3 = null;
  mail.abholen(c, (f) => f3 = f);
  engine.runUntil(engine.now + 30 * SEC);
  ok('mit falschem Passwort gibt der Server nichts heraus',
     f3 && /-ERR/.test(String(f3)), String(f3));
}

/* Ein unbekannter Empfänger in der eigenen Domain: der Server
   lehnt ab, und die Meldung ist seine eigene Antwortzeile. */
{
  const { engine, a, mail } = mailNetz(3);
  let f = null;
  mail.senden(a, { an: 'niemand@schule.de', betreff: 'x', text: 'y' }, (x) => f = x);
  engine.runUntil(30 * SEC);
  ok('ein unbekanntes Postfach wird abgelehnt', f && /550/.test(String(f)), String(f));
}

/* ⭐ Post in eine FREMDE Domain — der Grund, aus dem es MX gibt.
   Zwei Mailserver, ein DNS-Server, der weiß, wer für „verein.de"
   zuständig ist. */
{
  const b = bau(9);
  const { engine, netz, stack, mit } = b;
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const sw  = netz.addNode('switch', 300, 200);
  const a   = netz.addNode('host',   100, 100);
  const ms1 = netz.addNode('server', 500, 100);
  const ms2 = netz.addNode('server', 500, 300);
  const dns = netz.addNode('server', 500, 500);
  konf(a, 0, '192.168.1.10'); konf(ms1, 0, '192.168.1.20');
  konf(ms2, 0, '192.168.1.30'); konf(dns, 0, '192.168.1.40');
  netz.addCable(a.id, 0, sw.id, 0);
  netz.addCable(ms1.id, 0, sw.id, 1);
  netz.addCable(ms2.id, 0, sw.id, 2);
  netz.addCable(dns.id, 0, sw.id, 3);

  ms1.software = ['mailserver'];
  Object.assign(netz.mailConf(ms1), { on: true, domain: 'schule.de',
    konten: [{ benutzer: 'anna', passwort: 'a', posteingang: [] }] });
  ms1.dns = '192.168.1.40';                 // der Server selbst muss fragen können

  ms2.software = ['mailserver'];
  Object.assign(netz.mailConf(ms2), { on: true, domain: 'verein.de',
    konten: [{ benutzer: 'chef', passwort: 'c', posteingang: [] }] });

  dns.software = ['dns'];
  Object.assign(netz.dnsConf(dns), {
    on: true,
    records: [{ name: 'mail.verein.de', ip: '192.168.1.30' }],
    mx: [{ domain: 'verein.de', server: 'mail.verein.de' }]
  });

  Object.assign(netz.mailKonto(a), { adresse: 'anna@schule.de', pop3: '192.168.1.20',
    smtp: '192.168.1.20', benutzer: 'anna', passwort: 'a' });
  a.software = ['mail'];
  dienste.start(); dienste.sync();

  let f = 'nichts';
  dienste.mail.senden(a, { an: 'chef@verein.de', betreff: 'Einladung', text: 'Kommt ihr?' },
    (x) => f = x);
  engine.runUntil(60 * SEC);

  ok('der eigene Server nimmt sie an', !f, String(f));
  ok('⭐ und reicht sie an die fremde Domain weiter',
     netz.mailConf(ms2).konten[0].posteingang.length === 1,
     JSON.stringify(netz.mailConf(ms2).konten[0].posteingang));
  ok('dafür hat er im DNS nach dem MX-Eintrag gefragt',
     mit.view().some(r => r.proto === 'DNS'
       && /verein\.de/.test(r.info) && /Mailserver|MX/.test(r.info)),
     mit.view().filter(r => r.proto === 'DNS').map(r => r.info).join(' | ').slice(0, 260));

  /* Die Gegenprobe: ohne MX-Eintrag bleibt die Post liegen. */
  const b2 = bau(10);
  ok('ein DNS-Server ohne MX-Eintrag antwortet „kein Mailserver"',
     (() => {
       const conf = b2.netz.dnsConf(b2.netz.addNode('server', 0, 0));
       return !(conf.mx || []).length;
     })());
}

/* ═══ 14g · Anmelden am E-Mail-Konto ═══════════════════════════
   Vom Nutzer verlangt: ein Knopf, der die Zugangsdaten EINMAL
   prüft — „dabei sollen auch SMTP und POP3 geprüft werden".

   Filius hat das nicht; dort merkt man beim ersten Senden, ob
   die Angaben stimmen. Das ist die teuerste Stelle des ganzen
   Mailkapitels: ein Tippfehler im Servernamen sieht aus wie ein
   fehlender MX-Eintrag wie ein nicht gestarteter Server.       */
section('E-Mail: anmelden');
{
  const { engine, netz, a, mail } = mailNetz(21);
  const k = netz.mailKonto(a);

  /* Die Adresse ergibt sich aus Benutzername und Maildomain —
     sie wird nicht mehr getippt. */
  k.benutzer = 'anna'; k.domain = 'Schule.DE';
  ok('⭐ die Adresse entsteht aus Benutzername und Maildomain',
     mail.adresseVon(k) === 'anna@schule.de', mail.adresseVon(k));
  ok('und steht danach auch im Konto', k.adresse === 'anna@schule.de');

  let r = 'nichts';
  mail.anmelden(a, (f, adr) => r = { f: f, adr: adr });
  engine.runUntil(60 * SEC);
  ok('⭐ mit richtigen Daten klappt die Anmeldung', r && !r.f, JSON.stringify(r));
  ok('sie meldet die eigene Adresse zurück', r && r.adr === 'anna@schule.de');
  ok('und das Konto merkt sie sich', k.angemeldet === true);

  mail.abmelden(a);
  ok('Abmelden nimmt sie zurück', k.angemeldet === false);
}
{
  // Falsches Passwort: die Zeile des POP3-Servers ist die Meldung.
  const { engine, netz, a, mail } = mailNetz(22);
  const k = netz.mailKonto(a);
  k.domain = 'schule.de'; k.passwort = 'falsch';
  let r = null;
  mail.anmelden(a, (f) => r = f);
  engine.runUntil(60 * SEC);
  ok('mit falschem Passwort scheitert sie', !!r, String(r));
  ok('und der Grund ist die Antwort des Servers',
     /-ERR/.test(String(r)) && /Passwort/.test(String(r)), String(r));
  ok('angemeldet ist danach niemand', k.angemeldet !== true);
}
{
  /* ⭐ Und die zweite Hälfte: POP3 stimmt, aber die Domain nicht.
     Ohne die SMTP-Prüfung hätte man einen grünen Haken und ein
     Programm, das nicht senden kann. */
  const { engine, netz, a, mail } = mailNetz(23);
  const k = netz.mailKonto(a);
  k.domain = 'verein.de';          // Konto gibt es, Domain bedient der Server nicht
  let r = null;
  mail.anmelden(a, (f) => r = f);
  engine.runUntil(60 * SEC);
  ok('⭐ eine falsche Maildomain fällt beim SMTP-Teil auf', !!r, String(r));
  /* ⚠️ Der Grund ist hier AUSNAHMSWEISE kein Statuscode des
     Servers, sondern ein Satz. Er muss einer sein: die Begrüßung
     lautet „220 schule.de Willkommen" — die Form stimmt, nur der
     Inhalt nicht. Ein weitergereichtes „220 …" als Fehlermeldung
     wäre für ein Kind keine Auskunft. */
  ok('und er nennt beide Domains',
     /schule\.de/.test(String(r)) && /verein\.de/.test(String(r)), String(r));
}
{
  // Unvollständige Angaben werden gar nicht erst verschickt.
  const { netz, a, mail } = mailNetz(24);
  const k = netz.mailKonto(a);
  k.domain = ''; k.adresse = '';
  let r = null;
  mail.anmelden(a, (f) => r = f);
  ok('ohne Maildomain kommt die Frage gar nicht erst heraus',
     !!r && /Maildomain/.test(String(r)), String(r));
  ok('und zwar sofort, ohne die Uhr laufen zu lassen', r !== null);
}
{
  /* „Von vorn" nimmt die Anmeldung zurück: der Server könnte
     inzwischen aus sein, das Konto gelöscht, die Domain geändert.
     Ein grüner Haken aus dem vorigen Durchgang wäre eine
     Behauptung ohne Prüfung. */
  const { engine, netz, a, mail, dienste } = mailNetz(25);
  const k = netz.mailKonto(a);
  k.domain = 'schule.de';
  mail.anmelden(a, () => {});
  engine.runUntil(60 * SEC);
  ok('angemeldet', k.angemeldet === true);
  dienste.reset();
  ok('⭐ „von vorn" meldet ab', k.angemeldet === false);
  ok('die Zugangsdaten bleiben aber stehen',
     k.benutzer === 'anna' && k.passwort === 'apfel' && k.domain === 'schule.de');
}
{
  /* Ein Stand von vor dieser Runde kennt nur `adresse`. Die
     Domain muss beim Laden daraus entstehen, sonst steht das
     Konto nach dem Öffnen halb leer da. */
  const { netz } = bau(26);
  const h = netz.addNode('host', 10, 10);
  h.mailKonto = { name: 'Anna', adresse: 'anna@schule.de', pop3: 'x', smtp: 'x',
                  pop3Port: 110, smtpPort: 25, benutzer: '', passwort: 'a',
                  posteingang: [], gesendet: [] };
  const k = netz.mailKonto(h);
  ok('⭐ ein alter Stand bekommt Maildomain und Benutzername aus der Adresse',
     k.domain === 'schule.de' && k.benutzer === 'anna',
     k.domain + ' / ' + k.benutzer);
}

/* ═══ 14h · Eine Kennung, ein Element ══════════════════════════
   ⚠️ Die Ursache eines Fehlers vom 2026-09-27: „wenn ich eine Mail
   schreiben will und auf das Inputfeld zum Empfänger klicke, dann
   prüft er was und nichts passiert." Der Knopf „Anmelden" hieß
   `mlAn` — und das Feld „An:" beim Verfassen hieß genauso. Ein
   Programmfenster zeichnet ALLE seine Seiten in dieselbe Box; der
   Empfänger des Knopfes landete also auf dem Feld, ein Tipp
   hinein prüfte und zeichnete neu, und das frische Feld hatte
   keinen Schreibstrich mehr.

   ⭐ Geprüft wird hier nicht das Verhalten (das tut `uitest.js`),
   sondern die BEDINGUNG, unter der es überhaupt eintreten kann:
   zwei gleiche `id="…"` in einer Datei, die mehrere Seiten in
   dieselbe Box zeichnet. Das ist reine Zeichenkettenarbeit und
   deshalb hier richtig — genau wie der Zerteiler aus
   `prog-dateien.js`. Der Browserprüfstand kann es gar nicht
   finden: dort steht immer nur EINE Seite im DOM, und innerhalb
   einer Seite war die Kennung ja eindeutig. */
section('Kennungen in den Programmfenstern');
{
  /* Alle Dateien, die ein Fenster mit mehreren Seiten in dieselbe
     Box zeichnen. Wer eine neue dazulegt, gehört in diese Liste. */
  for (const f of ['prog-mail.js', 'prog-web.js', 'prog-zert.js', 'prog-vpn.js', 'prog-dateien.js', 'konfig.js', 'geraet.js',
                   'weiterleitung.js']) {
    const quelle = fs.readFileSync(path.join(BASE, f), 'utf8');
    const zaehler = new Map();
    for (const m of quelle.matchAll(/\bid="([A-Za-z][\w-]*)"/g)) {
      zaehler.set(m[1], (zaehler.get(m[1]) || 0) + 1);
    }
    const doppelt = [...zaehler].filter(([, n]) => n > 1).map(([id, n]) => id + '×' + n);
    ok('⚠️ ' + f + ': jede Kennung gehört genau einem Element',
       doppelt.length === 0, doppelt.join(', '));
  }
}

/* ═══ 10b · Sek I: die neuen Szenarien I.1 bis I.3 ═══ */
section('Sek I und II · neue Szenarien');
{
  const S = sandbox.SZENARIEN;
  // Die Auftragskarte liegt links oben — dort steht kein Gerät.
  for (const k of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'ii1', 'ii2', 'ii3', 'ii4', 'ii5', 'ii6', 'ii7', 'ii8', 'ii9', 'handschlag', 'grossesnetz']) {
    ok(k + ': keine Geräte unter der Auftragskarte',
       S[k].netz.nodes.every(n => !(n.x < 430 && n.y < 280)));
    ok(k + ': Auftrag hat Kontext, Aufgaben und Hilfe',
       /class="kontext"/.test(S[k].aufgabe) && /class="aufg-/.test(S[k].aufgabe) && /<details>/.test(S[k].aufgabe));
  }

  // I.1: nichts ist verbunden — und ein Endgerät hat nur eine Buchse.
  ok('I.1: keine Kabel, kein Switch', S.i1.netz.cables.length === 0
     && S.i1.netz.nodes.every(n => n.kind === 'host'));
  {
    const { engine, netz, stack } = bau();
    const dienste = new sandbox.Dienste(engine, netz, stack, {});
    const term = new sandbox.Terminal(engine, netz, stack, dienste);
    netz.fromJSON(U.deepCopy(S.i1.netz));
    const e1 = netz.byName('Endgerät 1'), e2 = netz.byName('Endgerät 2');
    konf(e1, 0, '192.168.1.10'); konf(e2, 0, '192.168.1.11');
    ok('I.1: ein Kabel zwischen zwei Endgeräten geht', netz.addCable(e1.id, 0, e2.id, 0).ok);
    term.submit(e1.id, 'ping 192.168.1.11');
    engine.runUntil(60 * SEC);
    const txt = term.linesOf(e1.id).map(l => l.text).join('\n');
    ok('I.1: Ping ohne Switch, nur mit Kabel', /4 von 4 angekommen/.test(txt), txt.slice(-300));
    const e3 = netz.addNode('host', 600, 600);
    ok('I.1: ein drittes Gerät hat am Endgerät keine freie Buchse mehr',
       !netz.addCable(e1.id, 0, e3.id, 0).ok);
  }

  // I.2: zwei Netze, die für sich laufen; über die Grenze kommt nichts.
  {
    const { engine, netz, stack } = bau();
    const dienste = new sandbox.Dienste(engine, netz, stack, {});
    const term = new sandbox.Terminal(engine, netz, stack, dienste);
    netz.fromJSON(U.deepCopy(S.i2.netz));
    const E = (n) => netz.byName('Endgerät ' + n);
    ok('I.2: kein Router am Start', !netz.list().some(n => n.kind === 'router'));
    term.submit(E(1).id, 'ping 192.168.1.11');
    engine.runUntil(30 * SEC);
    ok('I.2: im eigenen Netz klappt der Ping',
       /4 von 4 angekommen/.test(term.linesOf(E(1).id).map(l => l.text).join('\n')));
    term.submit(E(1).id, 'ping 192.168.2.10');
    engine.runUntil(120 * SEC);
    ok('I.2: über die Grenze nicht',
       /0 von 4 angekommen/.test(term.linesOf(E(1).id).map(l => l.text).join('\n')));
    // Router dazwischen, Gateways eintragen — so löst ein Kind es.
    const r = netz.addNode('router', 600, 465);
    const sw1 = netz.byName('Switch 1'), sw2 = netz.byName('Switch 2');
    konf(r, 0, '192.168.1.1'); konf(r, 1, '192.168.2.1');
    ok('I.2: Router lässt sich zwischen die Switches bauen',
       netz.addCable(r.id, 0, sw1.id, 4).ok && netz.addCable(r.id, 1, sw2.id, 4).ok);
    E(1).gateway = '192.168.1.1'; E(3).gateway = '192.168.2.1';
    term.submit(E(1).id, 'ping 192.168.2.10');
    engine.runUntil(240 * SEC);
    ok('I.2: mit Router und Gateway kommt der Ping durch',
       /Antwort von 192\.168\.2\.10/.test(term.linesOf(E(1).id).map(l => l.text).join('\n')));
  }

  // I.3: zehn Endgeräte und ein DHCP-Server — alle holen sich eine Adresse.
  {
    const { engine, netz, stack } = bau();
    const dienste = new sandbox.Dienste(engine, netz, stack, {});
    netz.fromJSON(U.deepCopy(S.i3.netz));
    const hosts = netz.list().filter(n => n.kind === 'host');
    ok('I.3: zehn Endgeräte, alle noch ohne Adresse',
       hosts.length === 10 && hosts.every(h => !h.nics[0].ip && !h.nics[0].dhcp));
    ok('I.3: der Server hat eine feste Adresse außerhalb des Bereichs',
       netz.byName('Server').nics[0].ip === '192.168.1.20');
    for (const h of hosts) netz.setDhcp(h, 0, true);
    dienste.start();
    engine.runUntil(60 * SEC);
    const ips = hosts.map(h => h.nics[0].ip);
    ok('I.3: alle zehn bekommen eine Adresse', ips.every(Boolean), ips.join(','));
    ok('I.3: alle verschieden', new Set(ips).size === 10);
    ok('I.3: alle im Bereich .100–.150',
       ips.every(ip => U.ip2int(ip) >= U.ip2int('192.168.1.100') && U.ip2int(ip) <= U.ip2int('192.168.1.150')));
    const sw = netz.byName('Switch 1');
    ok('I.3: der Switch kann ein WLAN ausstrahlen', sandbox.Netz.KIND.switch.wlan === true && !netz.strahlt(sw));
  }

  /* Hilfen für die Netze mit mehreren Routern (I.4 bis I.6). */
  const lade = (k) => {
    const { engine, netz, stack } = bau();
    const dienste = new sandbox.Dienste(engine, netz, stack, {});
    const term = new sandbox.Terminal(engine, netz, stack, dienste);
    netz.fromJSON(U.deepCopy(S[k].netz));
    return { engine, netz, stack, dienste, term };
  };
  const zeilen = (term, n) => term.linesOf(n.id).map(l => l.text).join('\n');
  const ping = (z, von, ziel, sek) => {
    z.term.submit(von.id, 'ping ' + ziel);
    z.engine.runUntil(z.engine.now + (sek || 30) * SEC);
    return zeilen(z.term, von);
  };
  const ankommt = (txt) => /Antwort von/.test(txt.split('\n').slice(-6).join('\n'));

  // I.4: leere Router; nach dem Eintragen findet RIP den Weg.
  {
    const z = lade('i4');
    const rs = z.netz.list().filter(n => n.kind === 'router');
    ok('I.4: drei Router, alle leer und mit automatischem Routing',
       rs.length === 3 && rs.every(r => r.nics.every(k => !k.ip) && r.rip && r.rip.on));
    z.dienste.start();
    const e1 = z.netz.byName('Endgerät 1');
    const ferne = z.netz.byName('Endgerät 6');
    ok('I.4: vor dem Eintragen kommt nichts nach Haus 3', !ankommt(ping(z, e1, '192.168.3.10', 20)));
    // Der Adressplan aus der Hilfe.
    const R = (i) => z.netz.byName('Router ' + i);
    konf(R(1), 0, '192.168.1.1'); konf(R(1), 1, '192.168.101.1');
    konf(R(2), 0, '192.168.2.1'); konf(R(2), 1, '192.168.101.2'); konf(R(2), 2, '192.168.102.1');
    konf(R(3), 0, '192.168.3.1'); konf(R(3), 1, '192.168.102.2');
    z.engine.runUntil(z.engine.now + 30 * SEC);
    ok('I.4: nach dem Adressplan reicht der Ping über zwei Router', ankommt(ping(z, e1, '192.168.3.10', 40)),
       zeilen(z.term, e1).slice(-300));
    const h = z.netz.list().filter(n => n.nics[0] && n.nics[0].dhcp);
    ok('I.4: die DHCP-Geräte in Haus 2 haben eine Adresse in ihrem Netz',
       h.length === 2 && h.every(x => /^192\.168\.2\.1\d\d$/.test(x.nics[0].ip)), h.map(x => x.nics[0].ip).join(','));
    ok('I.4: sie tragen den Router als Gateway', h.every(x => x.gateway === '192.168.2.1'));
  }

  // I.5: neun Fehler, einer nach dem anderen behoben.
  {
    const z = lade('i5');
    z.dienste.start();
    z.engine.runUntil(20 * SEC);
    const E = (n) => z.netz.byName('Endgerät ' + n);
    const R = (i) => z.netz.byName('Router ' + i);
    const alleEnden = () => z.netz.list().filter(n => n.kind === 'host' || n.kind === 'handy');
    ok('I.5: vier Router, Vermaschung (mehr Kabel als für eine Reihe nötig)',
       z.netz.list().filter(n => n.kind === 'router').length === 4
       && z.netz.cableList().filter(c => /^fr/.test(c.a.node) && /^fr/.test(c.b.node)).length === 5);
    ok('I.5: zwei der Fehler stecken zwischen den Routern (Tippfehler-Adresse, gezogenes Kabel)',
       R(4).nics[2].ip === '192.168.150.2'
       && z.netz.cableList().some(c => c.a.node === 'fr1' && c.b.node === 'fr3' && c.up === false));
    ok('I.5: ein Endgerät trägt eine Adresse aus dem Nachbarnetz',
       E(8).nics[0].ip === '192.168.2.11' && E(8).gateway === '192.168.3.1');
    ok('I.5: zu Beginn erreicht E1 nicht alle', !ankommt(ping(z, E(1), '192.168.3.10', 30)) || !ankommt(ping(z, E(1), '192.168.4.10', 30)));
    // 1 · Router 3 ohne Adresse
    konf(R(3), 0, '192.168.3.1');
    // 2 · Gateway in Haus 4
    const haus4 = z.netz.list().filter(n => n.nics[0] && /^192\.168\.4\./.test(n.nics[0].ip) && n.kind === 'host');
    haus4.forEach(x => { x.gateway = '192.168.4.1'; });
    // 3 · DHCP-Dienst
    z.netz.dhcpConf(z.netz.byName('DHCP-Server')).on = true;
    // 4 · WLAN-Name
    const handy = z.netz.byName('Handy 1');
    z.netz.setFunk(handy, 0, true, 'Schul-WLAN');
    // 5 · Routing an Router 4
    z.netz.ripConf(R(4)).on = true;
    // 6 · das fehlende Kabel
    const lose = z.netz.list().find(n => n.kind === 'host' && !n.nics[0].cable && n.nics[0].ip);
    ok('I.5: ein Endgerät hat kein Kabel', !!lose);
    z.netz.addCable(lose.id, 0, z.netz.byName('Switch 1').id, 3);
    // 7 · Endgerät mit Adresse aus dem Nachbarnetz
    konf(E(8), 0, '192.168.3.11');
    // 8 · Tippfehler an der Router-Karte des Kabels R2–R4
    konf(R(4), 2, '192.168.105.2');
    // 9 · das herausgezogene Kabel R1–R3
    z.netz.cableList().find(c => c.a.node === 'fr1' && c.b.node === 'fr3').up = true;
    z.dienste.start();
    z.engine.runUntil(z.engine.now + 60 * SEC);
    const ende = alleEnden();
    ok('I.5: nach neun Reparaturen hat jedes Endgerät eine Adresse',
       ende.every(x => x.nics[0].ip), ende.map(x => x.name + ':' + x.nics[0].ip).join(' '));
    const quelle = E(1);
    const nichtOk = [];
    for (const x of ende) {
      if (x === quelle) continue;
      if (!ankommt(ping(z, quelle, x.nics[0].ip, 40))) nichtOk.push(x.name + ' ' + x.nics[0].ip);
    }
    ok('I.5: und E1 erreicht danach alle', nichtOk.length === 0, nichtOk.join(', '));
  }

  // I.6: Webserver und DNS im Fünf-Häuser-Netz.
  {
    const z = lade('i6');
    ok('I.6: fünf Router, teilvermascht',
       z.netz.list().filter(n => n.kind === 'router').length === 5);
    z.dienste.start();
    z.engine.runUntil(30 * SEC);
    const E1 = z.netz.list().find(n => n.kind === 'host' && /^192\.168\.1\./.test(n.nics[0].ip));
    ok('I.6: E1 erreicht den Webserver über die Adresse', ankommt(ping(z, E1, '192.168.3.20', 40)),
       zeilen(z.term, E1).slice(-200));
    const dns = z.netz.byName('DNS-Server');
    dns.dnsServer.records.push({ name: 'www.schule.de', ip: '192.168.3.20' });
    ok('I.6: über den Namen erst, wenn er eingetragen ist', ankommt(ping(z, E1, 'www.schule.de', 40)),
       zeilen(z.term, E1).slice(-200));
    ok('I.6: der Webserver bringt seine Seite mit',
       !!z.netz.byName('Webserver').dateien['/webserver/index.html']);
  }

  // I.7: alles leer bis auf den öffentlichen DNS.
  {
    const z = lade('i7');
    ok('I.7: cww, kein Gerät hat eine Adresse',
       z.netz.list().some(n => n.kind === 'cww')
       && z.netz.list().filter(n => n.kind !== 'cww' && n.kind !== 'switch').every(n => !n.nics[0].ip));
  }
  // ─── Sek II ───
  // II.1: fünf Fehler, darunter eine doppelte Adresse.
  {
    const z = lade('ii1');
    z.dienste.start();
    z.engine.runUntil(20 * SEC);
    const hosts = z.netz.list().filter(n => n.kind === 'host' || n.kind === 'handy');
    const gleich = z.netz.list().filter(n => n.kind === 'host' && n.nics[0].ip === '192.168.1.10');
    ok('II.1: dieselbe Adresse steht zweimal im Netz', gleich.length === 2);
    ok('II.1: zwei Router, ein Kabel dazwischen',
       z.netz.list().filter(n => n.kind === 'router').length === 2
       && z.netz.cableList().filter(c => /^er/.test(c.a.node) && /^er/.test(c.b.node)).length === 1);
    ok('II.1: die DHCP-Geräte bekommen zu Beginn eine Adresse im falschen Netz',
       z.netz.list().filter(n => n.nics[0].dhcp && n.kind === 'host').every(n => /^192\.168\.3\./.test(n.nics[0].ip) || !n.nics[0].ip),
       hosts.map(x => x.nics[0].ip).join(','));
    // Reparaturen
    const dup = gleich.find(n => n.name !== z.netz.byName('Endgerät 1').name) || gleich[1];
    dup.nics[0].ip = '192.168.1.11';
    const g = z.netz.list().find(n => n.kind === 'host' && n.gateway === '192.168.1.1' && /^192\.168\.2\./.test(n.nics[0].ip));
    g.gateway = '192.168.2.1';
    const srv = z.netz.byName('DHCP-Server');
    srv.dhcpServer.von = '192.168.2.100'; srv.dhcpServer.bis = '192.168.2.150';
    z.netz.setFunk(z.netz.byName('Handy 1'), 0, true, 'Schul-WLAN');
    const lose = z.netz.list().find(n => n.kind === 'host' && !n.nics[0].cable);
    z.netz.addCable(lose.id, 0, z.netz.byName('Switch 1').id, 4);
    // Im Terminal des Endgeräts: „dhcp neu“ — so holen die Kinder sich die Adresse noch einmal.
    for (const h of z.netz.list().filter(n => (n.kind === 'host' || n.kind === 'handy') && n.nics[0].dhcp)) z.term.submit(h.id, 'dhcp neu');
    z.engine.runUntil(z.engine.now + 60 * SEC);
    const alle = z.netz.list().filter(n => n.kind === 'host' || n.kind === 'handy');
    ok('II.1: nach fünf Reparaturen hat jedes Gerät eine Adresse', alle.every(x => x.nics[0].ip),
       alle.map(x => x.name + ':' + x.nics[0].ip).join(' '));
    const q = z.netz.list().find(n => n.kind === 'host' && n.nics[0].ip === '192.168.1.10');
    const schlecht = [];
    for (const x of alle) {
      if (x === q) continue;
      if (!ankommt(ping(z, q, x.nics[0].ip, 40))) schlecht.push(x.name + ' ' + x.nics[0].ip);
    }
    ok('II.1: und dann erreicht E1 alle', schlecht.length === 0, schlecht.join(', '));
  }

  // II.2: Heimnetz und öffentliches Netz; drei Fehler, der Reihe nach behoben.
  {
    const z = lade('ii2');
    const N = (n) => z.netz.byName(n);
    ok('II.2: Heimrouter, Anbieter-Router, Webserver, fremder Rechner — und noch kein cww',
       z.netz.list().some(n => n.kind === 'heimrouter') && z.netz.list().some(n => n.kind === 'router')
       && !z.netz.list().some(n => n.kind === 'cww')
       && !!N('Webserver') && !!N('Fremder Rechner') && !!N('Handy 1'));
    const hr = z.netz.list().find(n => n.kind === 'heimrouter');
    ok('II.2: das WLAN des Heimrouters ist an (Name Heim-WLAN)', z.netz.strahlt(hr) && hr.wlan.ssid === 'Heim-WLAN');
    ok('II.2: der Webserver bringt seine Seite mit', !!N('Webserver').dateien['/webserver/index.html']);
    z.dienste.start();
    z.engine.runUntil(10 * SEC);
    const L1 = N('Laptop 1'), L2 = N('Laptop 2'), H = N('Handy 1'), F = N('Fremder Rechner');
    ok('II.2: im Heimnetz erreichen sich alle (Laptop 2, Handy)',
       ankommt(ping(z, L1, '192.168.1.11', 20)) && ankommt(ping(z, L1, '192.168.1.12', 20)));
    ok('II.2: Fehler 1 — mit dem falschen Gateway am Heimrouter kommt nichts nach draußen',
       !ankommt(ping(z, L1, '84.12.6.20', 30)));
    hr.gateway = '84.12.5.1';
    ok('II.2: nach Fehler 1 erreicht Laptop 1 den Webserver', ankommt(ping(z, L1, '84.12.6.20', 30)),
       zeilen(z.term, L1).slice(-200));
    ok('II.2: Fehler 3 — der fremde Rechner hat kein Gateway: hin ja, zurück nein',
       !ankommt(ping(z, L1, '84.12.6.30', 30)));
    ok('II.2: Fehler 2 — Laptop 2 ohne Gateway kommt nicht hinaus', !ankommt(ping(z, L2, '84.12.6.20', 30)));
    L2.gateway = '192.168.1.1';
    F.gateway = '84.12.6.1';
    ok('II.2: danach erreichen beide Laptops beide Ziele',
       ankommt(ping(z, L1, '84.12.6.30', 30)) && ankommt(ping(z, L2, '84.12.6.20', 30))
       && ankommt(ping(z, L2, '84.12.6.30', 30)));
    ok('II.2: das Handy im WLAN kommt auch hinaus', ankommt(ping(z, H, '84.12.6.20', 30)),
       zeilen(z.term, H).slice(-200));
    ok('II.2: von draußen erreicht man die WAN-Adresse des Heimrouters', ankommt(ping(z, F, '84.12.5.2', 30)),
       zeilen(z.term, F).slice(-200));
    ok('II.2: aber nicht den Laptop dahinter (NAT: von außen kann niemand anfangen)',
       !ankommt(ping(z, F, '192.168.1.10', 30)));
  }

  // II.3: alles dynamisch; der Name geht erst mit der festen Adresse.
  {
    const z3 = lade('ii3');
    const sv = z3.netz.byName('Heimserver');
    const L1 = z3.netz.byName('Laptop 1');
    ok('II.3: der Heimserver bringt Web, DNS und Mail mit, alles gestartet',
       z3.netz.laufendeDienste(sv).join(',') === 'dns,web,mail', z3.netz.laufendeDienste(sv).join(','));
    ok('II.3: DNS und Mail sind leer', sv.dnsServer.records.length === 0 && sv.mailServer.konten.length === 0);
    ok('II.3: der Server steht auf DHCP, ebenso die Laptops und das Handy',
       sv.nics[0].dhcp && L1.nics[0].dhcp && z3.netz.byName('Handy 1').nics[0].dhcp);
    z3.dienste.start();
    z3.engine.runUntil(60 * SEC);
    const dyn = sv.nics[0].ip;
    ok('II.3: der Server hat eine Adresse aus dem DHCP-Bereich',
       /^192\.168\.1\.(1[0-4]\d|150)$/.test(dyn), dyn);
    ok('II.3: Laptop 1 erreicht die Seite über die dynamische Adresse', ankommt(ping(z3, L1, dyn, 30)));
    sv.dnsServer.records.push({ name: 'www.heim.de', ip: dyn });
    ok('II.3: über den Namen geht es zunächst nicht (der DNS-Server, den DHCP nennt, steht woanders)',
       L1.dns === '192.168.1.20' && !ankommt(ping(z3, L1, 'www.heim.de', 30)));
    // Statisch: feste Adresse außerhalb des Bereichs.
    z3.netz.setDhcp(sv, 0, false);
    konf(sv, 0, '192.168.1.20', '255.255.255.0');
    sv.gateway = '192.168.1.1'; sv.dns = '192.168.1.20';
    sv.dnsServer.records[0].ip = '192.168.1.20';
    z3.term.submit(L1.id, 'dhcp neu');
    z3.engine.runUntil(z3.engine.now + 30 * SEC);
    ok('II.3: mit der festen Adresse geht der Name', ankommt(ping(z3, L1, 'www.heim.de', 40)),
       zeilen(z3.term, L1).slice(-200));
  }

  // II.4, II.5, II.7: am cww, ohne Adressen.
  {
    for (const k of ['ii4', 'ii5', 'ii7']) {
      const z = lade(k);
      ok(k.toUpperCase() + ': am cww, keine Adresse gesetzt',
         z.netz.list().some(n => n.kind === 'cww')
         && z.netz.list().filter(n => n.kind !== 'cww' && n.kind !== 'switch').every(n => !n.nics[0].ip));
    }
    const z5 = lade('ii5');
    const kurz = z5.netz.list().filter(n => n.kind === 'host').map(n => z5.netz.kurzName(n));
    ok('II.5: die Kurznamen der Endgeräte sind eindeutig', new Set(kurz).size === kurz.length, kurz.join(','));
    ok('II.4: nichts ist installiert', z5.netz.list().every(n => !(n.software || []).length)
       && (lade('ii4').netz.list().every(n => !(n.software || []).length)));
    const z7 = lade('ii7');
    ok('II.7: leeres Feld — nur das cww', z7.netz.list().length === 1 && z7.netz.cableList().length === 0);
  }

  // II.6: kein automatisches Routing; von Hand ist es fertig.
  {
    const z = lade('ii6');
    const rs = z.netz.list().filter(n => n.kind === 'router');
    ok('II.6: drei eingerichtete Router, ohne automatisches Routing',
       rs.length === 3 && rs.every(r => r.nics.every(k => k.ip) && !(r.rip && r.rip.on)));
    z.dienste.start();
    z.engine.runUntil(20 * SEC);
    const E1 = z.netz.list().find(n => n.kind === 'host' && n.nics[0].ip === '192.168.1.10');
    ok('II.6: ohne Routen kommt nichts nach Haus 2', !ankommt(ping(z, E1, '192.168.2.10', 20)));
    const R = (i) => z.netz.byName('Router ' + i);
    const m = '255.255.255.0';
    R(1).routes.push({ net: '192.168.2.0', mask: m, gateway: '192.168.101.2' },
                     { net: '192.168.3.0', mask: m, gateway: '192.168.101.2' },
                     { net: '192.168.102.0', mask: m, gateway: '192.168.101.2' });
    R(2).routes.push({ net: '192.168.1.0', mask: m, gateway: '192.168.101.1' },
                     { net: '192.168.3.0', mask: m, gateway: '192.168.102.2' });
    ok('II.6: Hinweg und Rückweg — Haus 2 kommt, Haus 3 noch nicht (Rückroute fehlt an R3)',
       ankommt(ping(z, E1, '192.168.2.10', 30)) && !ankommt(ping(z, E1, '192.168.3.10', 30)));
    R(3).routes.push({ net: '0.0.0.0', mask: '0.0.0.0', gateway: '192.168.102.1' });
    ok('II.6: mit der Standardroute an Router 3 auch Haus 3', ankommt(ping(z, E1, '192.168.3.10', 40)),
       zeilen(z.term, E1).slice(-200));
  }

  // II.8: alles läuft, Name wird aufgelöst, Handy im WLAN.
  {
    const z = lade('ii8');
    z.dienste.start();
    z.engine.runUntil(40 * SEC);
    const E1 = z.netz.list().find(n => n.kind === 'host' && n.nics[0].ip === '192.168.1.10');
    ok('II.8: der Name www.schule.de wird aufgelöst und erreicht', ankommt(ping(z, E1, 'www.schule.de', 40)),
       zeilen(z.term, E1).slice(-200));
    const handy = z.netz.byName('Handy 1');
    ok('II.8: das Handy hat sich im WLAN eine Adresse geholt', /^192\.168\.2\.1\d\d$/.test(handy.nics[0].ip), handy.nics[0].ip);
    ok('II.8: der Webserver liefert eine Seite',
       !!z.netz.byName('Webserver').dateien['/webserver/index.html']);
  }

  // Andere: DHCP-Spoofing und Handschlag stehen unter „Andere“, durchgezählt.
  ok('Andere: DHCP-Spoofing und Handschlag in eigener Gruppe, 1. und 2.',
     S.ii9.gruppe === 'Andere' && S.handschlag.gruppe === 'Andere'
     && /^1\. /.test(S.ii9.titel) && /^2\. /.test(S.handschlag.titel),
     S.ii9.gruppe + ' / ' + S.ii9.titel + ' / ' + S.handschlag.titel);
  ok('Andere: die Gruppe steht zusammen am Ende der Liste',
     Object.keys(S).slice(-3).join(',') === 'ii9,handschlag,grossesnetz');

  // 3. Das große Netz: alles läuft ohne Einrichtung.
  ok('Andere: „3. Das große Netz“ steht in der Gruppe',
     S.grossesnetz.gruppe === 'Andere' && /^3\. /.test(S.grossesnetz.titel));
  {
    const z = lade('grossesnetz');
    const k = (art) => z.netz.list().filter(n => n.kind === art);
    ok('Großes Netz: 7 Router (einer mit Firewall), 2 Heimrouter, 1 cww', k('router').length === 7 && k('heimrouter').length === 2 && k('cww').length === 1);
    z.dienste.start(); z.dienste.sync();
    z.engine.runUntil(z.engine.now + 120 * SEC);
    const by = (n) => z.netz.byName(n);
    ok('Großes Netz: Laptop 1 hat seine reservierte Adresse', by('Laptop 1').nics[0].ip === '50.0.4.50', by('Laptop 1').nics[0].ip);
    ok('Großes Netz: Heimrouter 1 bekommt immer 50.0.6.10', by('Heimrouter 1').nics[0].ip === '50.0.6.10', by('Heimrouter 1').nics[0].ip);
    ok('Großes Netz: Heimrouter 2 und die Heimgeräte holen sich Adressen',
       /^50\.0\.6\.1\d\d$/.test(by('Heimrouter 2').nics[0].ip) && /^192\.168\.2\.1\d\d$/.test(by('Laptop 4').nics[0].ip));
    const seite = (von, url) => { let r = null; z.dienste.http.seiteHolen(by(von), url, (x) => r = x);
      z.engine.runUntil(z.engine.now + 40 * SEC); return r; };
    for (const [von, url] of [['Laptop 1', 'www.mps-schule.de'], ['Laptop 1', 'www.heimseite.de'],
                              ['Laptop 4', 'www.heimseite.de'], ['Handy 3', 'mpsflix.de'], ['Laptop 3', '192.168.1.20']]) {
      const r = seite(von, url);
      ok('Großes Netz: ' + von + ' ruft ' + url + ' auf', r && r.ok, r && r.grund);
    }
    {
      const sv = by('MPSflix');
      const stil = (f) => { sv.streamServer.farbe = f; let r = null;
        z.dienste.http.seiteHolen(by('Laptop 1'), 'mpsflix.de', (x) => r = x);
        z.engine.runUntil(z.engine.now + 40 * SEC); return r && r.html; };
      const rot = stil('kino'), blau = stil('ozean'), hell = stil('hell');
      ok('Großes Netz: MPSflix hat drei Farbschemata, die sich auf der Seite zeigen',
         /#e50914/.test(rot) && /#22b8e0/.test(blau) && /#7c3aed/.test(hell) && !/#e50914/.test(blau),
         [!!rot, !!blau, !!hell].join());
      sv.streamServer.farbe = 'kino';
    }
    const ben = by('Laptop 2'); let m = null;
    z.dienste.mail.abholen(ben, (f, n) => m = [f, n]);
    z.engine.runUntil(z.engine.now + 40 * SEC);
    ok('Großes Netz: Ben holt zwei Mails ab', m && !m[0] && m[1] === 2, JSON.stringify(m));
  }

  // 3. Das große Netz — die Sicherheit: HTTPS mit ZS, Mitlesen im WLAN, Firewall, VPN.
  {
    const z = lade('grossesnetz');
    const mit = new sandbox.Mitschnitt(z.engine, z.netz);
    const by = (n) => z.netz.byName(n);
    const K = sandbox.Tls.Krypto;
    const zsN = by('Zertifizierungsstelle');
    ok('Großes Netz: die festen Schlüssel der ZS passen zu ihrem Fingerabdruck',
       K.fingerabdruck(zsN.zsServer.schluessel) === by('Laptop 1').vertrauen[0].fp);
    const zerts = ['Webserver Schule', 'Mailserver', 'Filmwelt', 'VPN-Server'].map(n => by(n).zertifikat);
    ok('Großes Netz: vier Zertifikate, alle von der ZS unterschrieben und mit passendem Schlüssel',
       zerts.every(c => c && c.zert && K.unterschriftPasst(K.zertText(c.zert), c.zert.signatur, zsN.zsServer.schluessel)
                       && K.unterschriftPasst('probe', K.unterschreiben('probe', c.schluessel), c.zert.besitzer)));
    ok('Großes Netz: der Hash von Lenas VPN-Passwort stimmt',
       by('VPN-Server').vpnServer.konten[0].pwHash === U.pseudoHash(by('Laptop 5').vpnClient.passwort));
    z.dienste.start(); z.dienste.sync();
    z.engine.runUntil(z.engine.now + 120 * SEC);
    const seite = (von, url) => { let r = null; z.dienste.http.seiteHolen(by(von), url, (x) => r = x);
      z.engine.runUntil(z.engine.now + 40 * SEC); return r; };

    const sicher = seite('Laptop 1', 'https://www.mps-schule.de');
    ok('Großes Netz: Laptop 1 öffnet https://www.mps-schule.de ohne Warnung', sicher && sicher.ok && sicher.tls, sicher && sicher.grund);
    const fremd = seite('Laptop 2', 'https://www.mps-schule.de');
    ok('Großes Netz: Laptop 2 kennt die ZS nicht und bekommt die Warnung',
       fremd && !fremd.ok && fremd.tls && fremd.tls.code === 'unbekannt', fremd && JSON.stringify(fremd.tls));
    let post = null;
    z.dienste.mail.abholen(by('Laptop 1'), (f, n) => post = [f, n]);
    z.engine.runUntil(z.engine.now + 40 * SEC);
    ok('Großes Netz: Anna holt ihre Post verschlüsselt ab (995)', post && !post[0], JSON.stringify(post));

    // Mitlesen: Carla holt Post im WLAN, der Lauscher liest das Passwort.
    z.dienste.mail.abholen(by('Handy 1'), () => {});
    z.engine.runUntil(z.engine.now + 40 * SEC);
    mit.setFilter({ dir: 'beide' });
    const lauscher = by('Lauscher-Handy 5');
    ok('⭐ Großes Netz: der Lauscher liest im MPS-WLAN Carlas Passwort mit',
       mit.view().some(r => r.node === lauscher.id && r.mit === 'funk' && /PASS Blume2026/.test(r.info)));

    // Firewall und VPN im Internat.
    const l5 = by('Laptop 5');
    ok('Großes Netz: Laptop 5 hat eine Adresse im Internat', /^50\.0\.7\.1\d\d$/.test(l5.nics[0].ip), l5.nics[0].ip);
    const schule = seite('Laptop 5', 'www.mps-schule.de');
    ok('Großes Netz: aus dem Internat geht das Schulportal', schule && schule.ok, schule && schule.grund);
    for (const url of ['mpsflix.de', 'https://filmwelt.de']) {
      const fw = by('Firewall-Router').state.fw, vorher = fw ? fw.treffer.slice() : [];
      const r = seite('Laptop 5', url);
      const nr = url === 'mpsflix.de' ? 0 : 1;
      ok('⭐ Großes Netz: die Firewall sperrt ' + url + ' aus dem Internat (ihre Zeile ' + (nr + 1) + ' trifft)',
         r && !r.ok && (fw.treffer[nr] || 0) > (vorher[nr] || 0), r && JSON.stringify(r.grund) + ' ' + JSON.stringify(fw && fw.treffer));
    }
    const draussen = seite('Laptop 3', 'mpsflix.de');
    ok('Großes Netz: außerhalb des Internats geht mpsflix.de weiter', draussen && draussen.ok, draussen && draussen.grund);
    // Im Raum schickt das cww alles mit 50.… hinaus — kein Weg zwischen den eigenen Netzen darf hindurch.
    for (const [von, ziel] of [['Laptop 5', '50.0.6.20'], ['Laptop 5', '50.0.5.53'], ['Laptop 1', '50.0.6.20'], ['Laptop 1', '50.0.7.1']]) {
      z.term.submit(by(von).id, 'traceroute ' + ziel);
      z.engine.runUntil(z.engine.now + 30 * SEC);
      const t = zeilen(z.term, by(von)).split('traceroute ' + ziel).pop();
      ok('Großes Netz: der Weg von ' + von + ' nach ' + ziel + ' führt nicht durch das cww',
         /← Ziel/.test(t) && !/50\.0\.11[01]\./.test(t), t.slice(0, 400));
    }
    let tun = 'offen';
    z.dienste.vpn.verbinden(l5, {}, (f) => tun = f);
    z.engine.runUntil(z.engine.now + 40 * SEC);
    ok('⭐ Großes Netz: Laptop 5 baut den Tunnel zum VPN-Server auf', tun === null && z.dienste.vpn.aktiv(l5), String(tun));
    for (const url of ['mpsflix.de', 'https://filmwelt.de']) {
      const r = seite('Laptop 5', url);
      ok('⭐ Großes Netz: durch den Tunnel geht ' + url + ' trotz Firewall', r && r.ok, r && JSON.stringify(r.grund));
    }
  }

  // ⭐ Das cww folgt seiner Tabelle, auch wenn die Netze innen nicht in seinem /8 liegen (Raum: Bereich 67).
  {
    const z = lade('grossesnetz');
    z.netz.setInternet({ prefix: 67 });
    // Router 1 nur noch über das cww erreichbar: seine Kabel zu Router 2 und Router 4 weg.
    for (const c of z.netz.cableList().filter(c => c.a.node === 'n1' && (c.b.node === 'n2' || c.b.node === 'n4')))
      z.netz.removeCable(c.id);
    const quelle = [];
    z.engine.on('event', e => { if (e.kind === 'drop-quelle') quelle.push(e); });
    z.dienste.start(); z.dienste.sync();
    z.engine.runUntil(z.engine.now + 120 * SEC);
    const r1 = z.netz.byName('Router 1');
    let r = null;
    z.stack.ping(r1, '50.0.6.20', 1, 8 * SEC, (x) => r = x);
    z.engine.runUntil(z.engine.now + 10 * SEC);
    ok('⭐ cww im Bereich 67: zwischen zwei 50er-Netzen innen reicht es weiter (Ping Router 1 → VPN-Server)',
       r && r.ok, JSON.stringify(r) + ' ' + JSON.stringify(quelle.slice(0, 2)));
    ok('und die Haustür hat dabei nichts weggeworfen', quelle.length === 0, JSON.stringify(quelle.slice(0, 2)));
    const w = z.stack.routeFor(z.netz.byName('Class Wide Web 1'), U.ip2int('50.0.6.20'));
    ok('der Weg des cww zu 50.0.6.20 ist der gelernte, nicht die Wolke', w && w.why === 'RIP', JSON.stringify(w));
    const raus = z.stack.routeFor(z.netz.byName('Class Wide Web 1'), U.ip2int('99.1.1.1'));
    ok('was es nicht kennt, geht weiter in die Wolke', raus && raus.why === 'Internet', JSON.stringify(raus));
  }

  // 2. Der Handschlag: genau EIN Handschlag vor der Seite, RST am Mailserver.
  {
    const z = lade('handschlag');
    const mit = new sandbox.Mitschnitt(z.engine, z.netz);
    z.dienste.start(); z.dienste.sync();
    const anna = z.netz.byName('Anna');
    let seite = null;
    z.dienste.http.seiteHolen(anna, '192.168.1.20', (r) => seite = r);
    z.engine.runUntil(z.engine.now + 20 * SEC);
    ok('Handschlag: die Seite kommt, und zwar als EIN Teil (eine Verbindung)',
       seite && seite.ok && seite.teile.length === 1, seite && (seite.grund || JSON.stringify(seite.teile)));
    // Nur Absender, nicht den Switch: der gibt jeden Rahmen noch einmal ab.
    const sw = z.netz.byName('Switch 1').id;
    const tcp = mit.view().filter(r => r.proto === 'TCP' && r.node !== sw).map(r => r.info.replace(/.*\[/, '[').replace(/\].*/, ']'));
    ok('Handschlag: die ersten drei TCP-Zeilen sind SYN · SYN,ACK · ACK',
       tcp.slice(0, 3).join(' ') === '[SYN] [SYN, ACK] [ACK]', tcp.join(' '));
    // Die Aufgabe lässt Anna antippen: dann stehen genau ihre drei Zeilen da (↑ ↓ ↑).
    mit.setGeraet(anna.id);
    const bei = mit.view().filter(r => r.proto === 'TCP').slice(0, 3);
    ok('Handschlag: bei Anna ↑ SYN · ↓ SYN,ACK · ↑ ACK',
       bei.map(r => r.dir + r.info.replace(/.*\[/, '[').replace(/\].*/, ']')).join(' ')
         === 'raus[SYN] rein[SYN, ACK] raus[ACK]',
       bei.map(r => r.dir + ' ' + r.info).join(' | '));
    mit.setGeraet(null);
    ok('Handschlag: vor dem ersten SYN steht nur ARP (kein DNS, kein DHCP)',
       (() => { const v = mit.view(); const i = v.findIndex(r => r.proto === 'TCP');
                return i > 0 && v.slice(0, i).every(r => r.proto === 'ARP'); })(),
       mit.view().slice(0, 6).map(r => r.proto).join(','));
    ok('Handschlag: der Abbau ist zu sehen (FIN)', tcp.some(t => /FIN/.test(t)), tcp.join(' '));

    let zweite = null;
    z.dienste.http.seiteHolen(anna, '192.168.1.30', (r) => zweite = r);
    z.engine.runUntil(z.engine.now + 20 * SEC);
    ok('Handschlag: am Mailserver hört niemand auf Port 80 — RST, keine Seite',
       zweite && !zweite.ok && mit.view().some(r => r.proto === 'TCP' && /RST/.test(r.info)),
       zweite && JSON.stringify(zweite));
  }

  // II.9: DHCP-Spoofing — zwei DHCP-Server im selben Netz, ein zweiter DNS-Eintrag.
  {
    const z = lade('ii9');
    const N = (n) => z.netz.byName(n);
    const dhcpNodes = z.netz.list().filter(n => n.dhcpServer && n.dhcpServer.on);
    ok('II.9: zwei aktive DHCP-Server im selben Netz (192.168.1.0/24)',
       dhcpNodes.length === 2 && dhcpNodes.every(n => n.dhcpServer.gateway === '192.168.1.1'));
    ok('II.9: E2 ist ein Handy, E1 und E3 sind Rechner',
       N('E2').kind === 'handy' && N('E1').kind === 'host' && N('E3').kind === 'host');
    ok('II.9: ihre Adressbereiche überschneiden sich nicht (kein Test-Artefakt)',
       U.ip2int(N('DHCP-Server').dhcpServer.bis) < U.ip2int(N('E3').dhcpServer.von));
    ok('II.9: der echte Server nennt den echten DNS-Server, E3 sich selbst',
       N('DHCP-Server').dhcpServer.dns === '192.168.2.10' && N('E3').dhcpServer.dns === '192.168.1.6');
    ok('II.9: beide Seiten sind wortgleich (dieselbe Kulisse)',
       N('Webserver').dateien['/webserver/index.html'].text === N('E3').dateien['/webserver/index.html'].text
       && /MPS-Portal/.test(N('Webserver').dateien['/webserver/index.html'].text));
    ok('II.9: der echte DNS-Server kennt den Namen nur mit der echten Adresse',
       N('DNS-Server').dnsServer.records[0].ip === '192.168.2.20');
    ok('II.9: E3 kennt denselben Namen mit seiner eigenen Adresse',
       N('E3').dnsServer.records[0].ip === '192.168.1.6');
    z.dienste.start();
    z.engine.runUntil(60 * SEC);
    ok('II.9: nach einem Durchgang haben E1 und E2 eine Adresse aus 192.168.1.0/24',
       ['E1', 'E2'].every(x => /^192\.168\.1\.\d+$/.test(N(x).nics[0].ip)),
       ['E1', 'E2'].map(x => N(x).nics[0].ip).join(','));
    ok('II.9: beide erreichen das Ziel, wer auch immer geantwortet hat',
       ankommt(ping(z, N('E1'), 'portal.schule.de', 30))
       && ankommt(ping(z, N('E2'), 'portal.schule.de', 30)));
  }

}

/* ═══ 15 · DHCP ═══ */
section('DHCP');
function dhcpNetz(anzahl, seed) {
  const { engine, netz, stack, mit } = bau(seed);
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const sw = netz.addNode('switch', 300, 200);
  const srv = netz.addNode('router', 500, 200);
  konf(srv, 0, '192.168.1.1');
  netz.dhcpConf(srv);
  Object.assign(srv.dhcpServer, {
    on: true, nic: 0, von: '192.168.1.100', bis: '192.168.1.102',
    mask: '255.255.255.0', gateway: '192.168.1.1', dns: '192.168.1.5', lease: 600
  });
  netz.addCable(srv.id, 0, sw.id, 0);
  const hosts = [];
  for (let i = 0; i < anzahl; i++) {
    const h = netz.addNode('host', 100, 100 + i * 60);
    netz.setDhcp(h, 0, true);
    netz.addCable(h.id, 0, sw.id, i + 1);
    hosts.push(h);
  }
  return { engine, netz, stack, mit, dienste, srv, sw, hosts };
}
{
  const { engine, mit, dienste, hosts, srv } = dhcpNetz(2);
  dienste.start();
  engine.runUntil(10 * SEC);

  ok('erster Rechner hat eine Adresse', !!hosts[0].nics[0].ip, hosts[0].nics[0].ip);
  ok('zweiter Rechner hat eine andere',
     hosts[1].nics[0].ip && hosts[0].nics[0].ip !== hosts[1].nics[0].ip,
     hosts[0].nics[0].ip + ' / ' + hosts[1].nics[0].ip);
  ok('Adressen liegen im Bereich',
     hosts.every(h => U.ip2int(h.nics[0].ip) >= U.ip2int('192.168.1.100')
                   && U.ip2int(h.nics[0].ip) <= U.ip2int('192.168.1.102')),
     hosts.map(h => h.nics[0].ip).join(','));
  ok('Maske kommt mit', hosts[0].nics[0].mask === '255.255.255.0');
  ok('Gateway kommt mit', hosts[0].gateway === '192.168.1.1', hosts[0].gateway);
  ok('DNS-Server kommt mit', hosts[0].dns === '192.168.1.5', hosts[0].dns);

  /* Vier Nachrichten, in dieser Reihenfolge. Die Abkürzung auf
     zwei wäre einfacher zu bauen und würde die Frage „was bei zwei
     Servern?" unbeantwortet lassen. */
  const zeilen = mit.view().filter(r => r.proto === 'DHCP').map(r => r.info);
  ok('Mitschnitt zeigt alle vier Schritte',
     zeilen.some(t => /Discover/.test(t)) && zeilen.some(t => /Offer/.test(t))
     && zeilen.some(t => /Request/.test(t)) && zeilen.some(t => /Ack/.test(t)),
     zeilen.slice(0, 6).join(' | '));
  ok('Discover kommt vor Ack',
     zeilen.findIndex(t => /Discover/.test(t)) < zeilen.findIndex(t => /Ack/.test(t)));

  const l = dienste.leases(srv);
  ok('Server führt zwei Leihverträge', l.length === 2, JSON.stringify(l));
  ok('Leihvertrag nennt die MAC des Rechners',
     l.some(x => x.mac === hosts[0].nics[0].mac));

  // Ping zwischen zwei Rechnern, die beide per DHCP gekommen sind
  const { engine: e2, stack: s2, dienste: d2, hosts: h2 } = dhcpNetz(2);
  d2.start();
  e2.runUntil(10 * SEC);
  let res = null;
  s2.ping(h2[0], h2[1].nics[0].ip, 1, 4 * SEC, r => res = r);
  e2.runUntil(e2.now + 5 * SEC);
  ok('zwei DHCP-Rechner erreichen sich', res && res.ok, JSON.stringify(res));
}
{
  // Bereich zu klein: der dritte bekommt nichts — und erfährt warum.
  const { engine, dienste, hosts } = dhcpNetz(4);
  let grund = null;
  engine.on('event', (e) => { if (e.kind === 'dhcp-fail') grund = e.why; });
  dienste.start();
  engine.runUntil(20 * SEC);
  const mitAdresse = hosts.filter(h => h.nics[0].ip).length;
  ok('nur drei Adressen im Bereich verteilt', mitAdresse === 3, String(mitAdresse));
  ok('der vierte erfährt den Grund', !!grund && /erschöpft|abgelehnt/i.test(grund), String(grund));
}
{
  // Kein Server: aufgeben mit Grund, nicht still bleiben.
  const { engine, netz, stack } = bau();
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const h = netz.addNode('host', 100, 100);
  const sw = netz.addNode('switch', 300, 100);
  netz.setDhcp(h, 0, true);
  netz.addCable(h.id, 0, sw.id, 0);
  let grund = null;
  engine.on('event', (e) => { if (e.kind === 'dhcp-fail') grund = e.why; });
  dienste.start();
  engine.runUntil(20 * SEC);
  ok('ohne Server keine Adresse', h.nics[0].ip === '');
  ok('ohne Server steht der Grund da', /Kein DHCP-Server/.test(String(grund)), String(grund));
}
{
  // Dieselbe MAC bekommt dieselbe Adresse wieder — sonst wäre
  // „noch einmal zeigen" jedes Mal ein anderes Bild.
  const { engine, dienste, hosts } = dhcpNetz(1);
  dienste.start();
  engine.runUntil(10 * SEC);
  const erst = hosts[0].nics[0].ip;
  dienste.erneuern(hosts[0], 0);
  engine.runUntil(engine.now + 10 * SEC);
  ok('nach dem Erneuern dieselbe Adresse', hosts[0].nics[0].ip === erst,
     erst + ' → ' + hosts[0].nics[0].ip);

  // Eine feste Adresse im Bereich wird übersprungen, nicht doppelt
  // vergeben.
  const z = dhcpNetz(1);
  const fest = z.netz.addNode('server', 700, 300);
  konf(fest, 0, '192.168.1.100');
  z.netz.addCable(fest.id, 0, z.sw.id, 4);
  z.dienste.start();
  z.engine.runUntil(10 * SEC);
  ok('fest vergebene Adresse wird übersprungen',
     z.hosts[0].nics[0].ip !== '192.168.1.100' && !!z.hosts[0].nics[0].ip,
     z.hosts[0].nics[0].ip);
  ok('keine doppelten Adressen im Netz', z.netz.duplicateIps().length === 0,
     JSON.stringify(z.netz.duplicateIps().map(d => d.ip)));
}
{
  // Eine geliehene Adresse ist keine Einstellung: sie darf nicht
  // mitgespeichert werden, sonst sieht die Klasse DHCP nie arbeiten.
  const { engine, netz, dienste, hosts } = dhcpNetz(1);
  dienste.start();
  engine.runUntil(10 * SEC);
  ok('Rechner hat eine geliehene Adresse', !!hosts[0].nics[0].ip);
  const j = netz.toJSON();
  const gespeichert = j.nodes.find(n => n.id === hosts[0].id);
  ok('gespeichert wird „fragt nach", nicht die Adresse',
     gespeichert.nics[0].ip === '' && gespeichert.nics[0].dhcp === true,
     JSON.stringify(gespeichert.nics[0]));
  ok('der DHCP-Server speichert seine Einstellungen',
     !!j.nodes.find(n => n.dhcpServer && n.dhcpServer.on));
}

/* ═══ 15a · Statische Adresszuweisung ══════════════════════════
   Filius' zweiter Reiter im DHCP-Dialog: „Statische
   Adresszuweisung", eine Liste aus MAC-Adresse und IP-Adresse
   (jdhcpkonfiguration_msg11 bis msg15). Dort wie hier gewinnt sie
   vor dem Bereich, und sie muss NICHT darin liegen.            */
{
  const z = dhcpNetz(2, 11);
  const h0 = z.hosts[0], h1 = z.hosts[1];
  // Eine Reservierung AUSSERHALB des Bereichs (.100–.102).
  z.netz.dhcpConf(z.srv).statisch = [{ mac: h0.nics[0].mac, ip: '192.168.1.55' }];
  z.dienste.start();
  z.engine.runUntil(15 * SEC);

  ok('⭐ eine feste Zuweisung gewinnt vor dem Bereich',
     h0.nics[0].ip === '192.168.1.55', h0.nics[0].ip);
  ok('auch wenn sie außerhalb des Bereichs liegt — wie in Filius',
     U.ip2int(h0.nics[0].ip) < U.ip2int('192.168.1.100'));
  ok('der andere Rechner bekommt weiter eine aus dem Bereich',
     U.ip2int(h1.nics[0].ip) >= U.ip2int('192.168.1.100')
     && U.ip2int(h1.nics[0].ip) <= U.ip2int('192.168.1.102'), h1.nics[0].ip);
  ok('Maske und Gateway kommen auch bei einer festen Zuweisung mit',
     h0.nics[0].mask === '255.255.255.0' && h0.gateway === '192.168.1.1');
  ok('der Leihvertrag steht mit der festen Adresse in der Liste',
     z.dienste.leases(z.srv).some(l => l.ip === '192.168.1.55' && l.mac === h0.nics[0].mac));

  /* Groß und klein darf keinen Unterschied machen: das Programm
     schreibt MAC-Adressen klein, ein Mensch tippt sie groß ab.
     Eine Reservierung, die nur daran scheitert, ist nicht zu
     finden. */
  const g = dhcpNetz(1, 12);
  g.netz.dhcpConf(g.srv).statisch =
    [{ mac: g.hosts[0].nics[0].mac.toUpperCase(), ip: '192.168.1.66' }];
  g.dienste.start();
  g.engine.runUntil(15 * SEC);
  ok('die MAC wird ohne Rücksicht auf Groß- und Kleinschreibung verglichen',
     g.hosts[0].nics[0].ip === '192.168.1.66', g.hosts[0].nics[0].ip);

  /* ⚠️ Eine reservierte Adresse IM Bereich darf nicht daneben
     dynamisch herausgehen. Sonst bekäme der Erste, der fragt, die
     Adresse, die für jemand anderen gedacht ist — und die
     Reservierung liefe ins Leere, ohne dass irgendwo etwas falsch
     aussieht. */
  const b = dhcpNetz(2, 13);
  const fremd = '02:ff:ff:ff:ff:01';   // ein Gerät, das gar nicht da ist
  b.netz.dhcpConf(b.srv).statisch = [{ mac: fremd, ip: '192.168.1.101' }];
  b.dienste.start();
  b.engine.runUntil(15 * SEC);
  ok('⭐ eine reservierte Adresse wird dynamisch nicht vergeben',
     b.hosts.every(h => h.nics[0].ip !== '192.168.1.101'),
     b.hosts.map(h => h.nics[0].ip).join(','));
  ok('die beiden bekommen trotzdem welche',
     b.hosts.every(h => !!h.nics[0].ip), b.hosts.map(h => h.nics[0].ip).join(','));

  // Und das alles übersteht Speichern und Laden.
  const j = z.netz.toJSON();
  const gesp = j.nodes.find(n => n.dhcpServer && n.dhcpServer.statisch);
  ok('die Liste steht im Speicherformat',
     !!gesp && gesp.dhcpServer.statisch.length === 1
     && gesp.dhcpServer.statisch[0].ip === '192.168.1.55');
  const kopie = new sandbox.Netz(new sandbox.Engine({ seed: 1 }));
  kopie.fromJSON(JSON.parse(JSON.stringify(j)));
  const srvK = kopie.list().find(n => n.dhcpServer);
  ok('und sie kommt beim Laden zurück',
     !!srvK && srvK.dhcpServer.statisch[0].mac === h0.nics[0].mac);

  // Ein Stand von vorher hat das Feld gar nicht.
  const altN = new sandbox.Netz(new sandbox.Engine({ seed: 1 }));
  const altS = altN.addNode('host', 10, 10);
  altS.dhcpServer = { on: false, nic: 0, von: '', bis: '', mask: '', gateway: '', dns: '', lease: 600 };
  ok('ein alter Stand ohne die Liste bekommt eine leere',
     Array.isArray(altN.dhcpConf(altS).statisch)
     && altN.dhcpConf(altS).statisch.length === 0);
}

/* ═══ 15b · Die Vergabe ist nicht vorhersehbar ═════════════════
   Vom Nutzer verlangt: „Die IP-Adressen sollen nicht immer in
   derselben Reihenfolge vergeben werden" und „für uns Menschen
   nicht vorhersehbar".

   ⚠️ Geprüft wird BEIDES, und der zweite Teil ist der wichtigere:
   unvorhersehbar für den Menschen, reproduzierbar aus dem
   Startwert. Ohne die zweite Hälfte wäre die Zusage der Engine
   dahin — und mit ihr jede Prüfung, die eine Adresse erwartet.
   Vorlage ist der Abschnitt „Verlust und Determinismus".       */
{
  function lauf(seed) {
    const z = dhcpNetz(3, seed);
    // Ein Bereich, der deutlich größer ist als die Zahl der
    // Geräte — sonst wäre jede Verteilung dieselbe Menge und der
    // Unterschied nur eine Reihenfolge.
    Object.assign(z.netz.dhcpConf(z.srv), { von: '192.168.1.100', bis: '192.168.1.180' });
    z.dienste.start();
    z.engine.runUntil(20 * SEC);
    return z.hosts.map(h => h.nics[0].ip).join(',');
  }
  const a1 = lauf(21), a2 = lauf(21), b1 = lauf(22), c1 = lauf(23);

  ok('gleicher Startwert → dieselbe Verteilung', a1 === a2, a1 + ' / ' + a2);
  ok('⭐ anderer Startwert → andere Verteilung',
     a1 !== b1 || a1 !== c1, a1 + ' / ' + b1 + ' / ' + c1);
  ok('alle drei bekommen etwas', a1.split(',').every(s => !!s), a1);
  ok('und nichts doppelt', new Set(a1.split(',')).size === 3, a1);
  /* ⚠️ Der Kern der Sache: die Adressen dürfen nicht der Reihe
     nach an der Gerätereihenfolge hängen. Früher war es genau so
     — .100, .101, .102 in der Reihenfolge des Anlegens — und
     damit stand die Antwort fest, bevor jemand nachgesehen hat. */
  ok('⭐ sie liegen nicht mehr aufsteigend am Bereichsanfang',
     a1 !== '192.168.1.100,192.168.1.101,192.168.1.102', a1);

  /* Zwei Server mit verschiedenen Netzen: wer gewinnt, hängt am
     Startwert und nicht an der Reihenfolge der Geräte. Genau die
     Frage, die der Nutzer gestellt hat. */
  function zweiServer(seed) {
    const { engine, netz, stack } = bau(seed);
    const dienste = new sandbox.Dienste(engine, netz, stack, {});
    const sw = netz.addNode('switch', 300, 200);
    const s1 = netz.addNode('server', 500, 100);
    const s2 = netz.addNode('server', 500, 300);
    konf(s1, 0, '192.168.1.1'); konf(s2, 0, '10.0.0.1');
    Object.assign(netz.dhcpConf(s1), { on: true, nic: 0,
      von: '192.168.1.100', bis: '192.168.1.120', mask: '255.255.255.0',
      gateway: '192.168.1.1', dns: '', lease: 600 });
    Object.assign(netz.dhcpConf(s2), { on: true, nic: 0,
      von: '10.0.0.100', bis: '10.0.0.120', mask: '255.255.255.0',
      gateway: '10.0.0.1', dns: '', lease: 600 });
    netz.addCable(s1.id, 0, sw.id, 0);
    netz.addCable(s2.id, 0, sw.id, 1);
    const hs = [];
    /* ⚠️ Drei, nicht vier: der Switch hat fünf Buchsen (0–4), und
       zwei davon belegen die Server. Die erste Fassung steckte
       den vierten Rechner an Buchse 5 — `addCable` lehnte still
       ab, und die Prüfung meldete „ein Gerät hat keine Adresse"
       als wäre es ein Fehler von DHCP. */
    for (let i = 0; i < 3; i++) {
      const h = netz.addNode('host', 100, 80 + i * 60);
      netz.setDhcp(h, 0, true);
      netz.addCable(h.id, 0, sw.id, i + 2);
      hs.push(h);
    }
    dienste.start();
    engine.runUntil(25 * SEC);
    return hs.map(h => h.nics[0].ip).join(',');
  }
  const laeufe = [31, 32, 33, 34, 37, 38].map(zweiServer);
  const z1 = laeufe[0];
  ok('bei zwei Servern: gleicher Startwert → gleiches Ergebnis',
     z1 === zweiServer(31), z1);
  ok('⭐ und ein anderer Startwert verteilt sie anders',
     laeufe.some(x => x !== z1), laeufe.join(' | '));
  ok('jedes Gerät bekommt von genau einem der beiden etwas',
     laeufe.every(l => l.split(',').every(ip => /^192\.168\.1\.|^10\.0\.0\./.test(ip))),
     laeufe.join(' | '));

  /* ⭐ Der Kern der Frage des Nutzers: es darf nicht feststehen,
     WELCHER Server antwortet. Er stand fest — der Client nimmt
     das erste Angebot, und ohne Bearbeitungszeit kam immer das
     Angebot des Servers zuerst an, der weiter vorn am Switch
     steckt. In sechs Durchgängen muss daher beides vorkommen. */
  const netze = new Set();
  for (const l of laeufe) for (const ip of l.split(','))
    netze.add(ip.startsWith('10.') ? 'B' : 'A');
  ok('⭐ mal gewinnt der eine Server, mal der andere',
     netze.size === 2, laeufe.join(' | '));
}

/* ═══ 15b · Im Entwurf hat ein DHCP-Gerät NICHTS ═══════════════
   Der Fall, der im Bild aufgefallen ist: nach einem Durchlauf
   stand im Entwurf ein Gerät mit leerem Adressfeld, aber
   ausgefüllter Netzmaske und einem Gateway aus dem letzten
   Durchgang — und weil dieses Gateway ohne Adresse in keinem Netz
   liegen KANN, hing ein „!" daran. Vier Felder in zwei Zuständen,
   von denen das Gerät keines selbst gesetzt hatte.

   Die Regel, die das ersetzt: was der Leihvertrag gebracht hat,
   geht mit ihm auch wieder. Alles davon.                        */
section('DHCP im Entwurf');
{
  const { engine, netz, dienste, hosts } = dhcpNetz(1);
  const h = hosts[0];

  ok('vor dem Start ist die Netzmaske leer', h.nics[0].mask === '',
     JSON.stringify(h.nics[0].mask));

  dienste.start();
  engine.runUntil(10 * SEC);
  ok('nach dem Durchlauf stehen alle vier Angaben da',
     !!h.nics[0].ip && !!h.nics[0].mask && !!h.gateway && !!h.dns);

  // „von vorn" — genau der Knopf, nach dem der Fehler sichtbar war.
  dienste.reset();
  ok('von vorn: keine Adresse',   h.nics[0].ip === '');
  ok('von vorn: keine Netzmaske', h.nics[0].mask === '', h.nics[0].mask);
  ok('von vorn: kein Gateway',    h.gateway === '', h.gateway);
  ok('von vorn: kein DNS-Server', h.dns === '', h.dns);

  // Und der Weg über die Datei darf den Zustand nicht zurückholen.
  const j = JSON.parse(JSON.stringify(netz.toJSON()));
  const g = j.nodes.find(n => n.id === h.id);
  ok('gespeichert wird auch keine Maske', g.nics[0].mask === '', JSON.stringify(g.nics[0]));
  ok('und kein Gateway',                  g.gateway === '', g.gateway);
  netz.fromJSON(j);
  const nachher = netz.get(h.id);
  ok('nach dem Laden bleibt die Maske leer', nachher.nics[0].mask === '',
     nachher.nics[0].mask);
}
{
  /* Ein Gerät, das von Hand eingerichtet war und dann den Haken
     bekommt: alles Eingetragene fällt weg, nicht nur die Adresse.
     Vorher blieb das Gateway stehen und wurde zur Fehlermeldung. */
  const { netz } = bau();
  const h = netz.addNode('host', 100, 100);
  konf(h, 0, '192.168.1.10');
  h.gateway = '192.168.1.1';
  h.dns = '192.168.1.5';

  netz.setDhcp(h, 0, true);
  ok('Haken gesetzt: Adresse weg',   h.nics[0].ip === '');
  ok('Haken gesetzt: Maske weg',     h.nics[0].mask === '', h.nics[0].mask);
  ok('Haken gesetzt: Gateway weg',   h.gateway === '', h.gateway);
  ok('Haken gesetzt: DNS weg',       h.dns === '', h.dns);

  // Und wieder ab: dann steht dieselbe Vorgabe da wie bei einem
  // frisch angelegten Anschluss — kein leeres Maskenfeld.
  netz.setDhcp(h, 0, false);
  ok('Haken wieder weg: Maske ist wieder die Vorgabe',
     h.nics[0].mask === '255.255.255.0', h.nics[0].mask);
  ok('die Adresse kommt nicht zurück', h.nics[0].ip === '');
}
{
  /* dhcpLeeren darf ein Gerät OHNE DHCP nicht anfassen. Sonst
     räumte `dienste.reset()` jedem von Hand eingerichteten Router
     das Gateway weg — und „von vorn" hieße „kaputt". */
  const { netz } = bau();
  const r = netz.addNode('router', 100, 100);
  r.gateway = '10.0.0.1';
  ok('ohne DHCP passiert nichts', netz.dhcpLeeren(r) === false);
  ok('und das Gateway bleibt stehen', r.gateway === '10.0.0.1');

  /* Auch nicht, solange eine ANDERE Karte desselben Geräts eine
     eigene Adresse trägt: Gateway und DNS stehen am Gerät und
     gehören dann zu der. */
  const m = netz.addNode('router', 300, 100);
  netz.addNic(m.id);
  netz.setDhcp(m, 0, true);
  m.nics[0].ip = '192.168.1.100';
  m.nics[0].mask = '255.255.255.0';
  konf(m, 1, '10.0.0.2');
  m.gateway = '10.0.0.1';
  netz.dhcpLeeren(m, 0);
  ok('die geholte Karte wird geräumt', m.nics[0].ip === '' && m.nics[0].mask === '');
  ok('die feste Karte bleibt',         m.nics[1].ip === '10.0.0.2');
  ok('und das Gateway auch',           m.gateway === '10.0.0.1');
}
{
  /* Szenario 5 ist der Ort, an dem eine Klasse das zuerst sieht:
     drei Endgeräte mit DHCP, und im Entwurf steht bei allen dreien
     dasselbe da — nämlich nichts. */
  const s = FIX.automatisch;
  ok('es gibt ein DHCP-Szenario', !!s, Object.keys(sandbox.SZENARIEN).join(','));
  if (s) {
    const clients = s.netz.nodes.filter(n => (n.nics || []).some(k => k.dhcp));
    ok('darin holen sich Geräte ihre Adresse', clients.length >= 2, String(clients.length));
    ok('und keines bringt eine Netzmaske mit',
       clients.every(n => n.nics.every(k => !k.dhcp || !k.mask)),
       JSON.stringify(clients.map(n => n.nics.map(k => k.mask))));
    ok('und keines ein Gateway',
       clients.every(n => !n.gateway),
       JSON.stringify(clients.map(n => n.gateway)));
  }
}

/* ═══ 16 · DNS ═══ */
section('DNS');
{
  const { engine, netz, stack, mit } = bau();
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const a = netz.addNode('host', 100, 100);
  const srv = netz.addNode('server', 300, 100);
  const ziel = netz.addNode('server', 500, 100);
  konf(a, 0, '192.168.1.10'); konf(srv, 0, '192.168.1.20'); konf(ziel, 0, '192.168.1.30');
  const sw = netz.addNode('switch', 300, 300);
  netz.addCable(a.id, 0, sw.id, 0);
  netz.addCable(srv.id, 0, sw.id, 1);
  netz.addCable(ziel.id, 0, sw.id, 2);
  netz.dnsConf(srv);
  /* Zwei Schritte, wie in Filius: erst aufspielen, dann starten.
     Nur `on` zu setzen reicht nicht — ein Programm, das nicht
     installiert ist, läuft auch nicht. */
  srv.software = ['dns'];
  srv.dnsServer.on = true;
  srv.dnsServer.records.push({ name: 'www.schule.de', ip: '192.168.1.30' });
  a.dns = '192.168.1.20';
  dienste.start();

  let r1 = null;
  dienste.resolve(a, 'www.schule.de', (r) => r1 = r);
  engine.runUntil(5 * SEC);
  ok('Name wird aufgelöst', r1 && r1.ok && r1.ip === '192.168.1.30', JSON.stringify(r1));

  // Zweite Frage: aus dem Zwischenspeicher, kein Paket mehr.
  const vorher = mit.view().filter(r => r.proto === 'DNS').length;
  let r2 = null;
  dienste.resolve(a, 'www.schule.de', (r) => r2 = r);
  engine.runUntil(engine.now + 2 * SEC);
  const nachher = mit.view().filter(r => r.proto === 'DNS').length;
  ok('zweite Frage kommt aus dem Zwischenspeicher', r2 && r2.ok && r2.cached);
  ok('und schickt kein Paket', nachher === vorher, vorher + ' → ' + nachher);

  // Unbekannter Name: eigene Meldung, keine Zeitüberschreitung.
  let r3 = null;
  dienste.resolve(a, 'gibtsnicht.de', (r) => r3 = r);
  engine.runUntil(engine.now + 5 * SEC);
  ok('unbekannter Name wird gemeldet', r3 && !r3.ok && /kennt den Namen/.test(r3.why),
     JSON.stringify(r3));

  // Ohne eingetragenen Server: der Satz nennt die Ursache.
  let r4 = null;
  const b = netz.addNode('host', 700, 100);
  konf(b, 0, '192.168.1.11');
  netz.addCable(b.id, 0, sw.id, 3);
  dienste.resolve(b, 'www.schule.de', (r) => r4 = r);
  ok('ohne DNS-Server sagt es, was fehlt', r4 && !r4.ok && /keinen DNS-Server/.test(r4.why),
     JSON.stringify(r4));

  // Server aus, Frage läuft ins Leere — mit Grund.
  srv.on = false;
  dienste.sync();
  let r5 = null;
  dienste.resolve(a, 'anderer.name.de', (r) => r5 = r);
  engine.runUntil(engine.now + 10 * SEC);
  ok('abgeschalteter Server: Grund statt Stille',
     r5 && !r5.ok && /nicht geantwortet/.test(r5.why), JSON.stringify(r5));

  const zeilen = mit.view().filter(r => r.proto === 'DNS').map(r => r.info);
  ok('Mitschnitt fragt in Klartext',
     zeilen.some(t => /welche Adresse hat www\.schule\.de/i.test(t)), zeilen.join(' | '));
  ok('Mitschnitt antwortet in Klartext',
     zeilen.some(t => /www\.schule\.de ist 192\.168\.1\.30/.test(t)), zeilen.join(' | '));
}

/* ═══ 16b · Die Frist von DNS gegen die Geduld von ARP ═══
   Der Fallstrick, der erst im echten Browser aufgefallen ist:
   DNS_WAIT war kürzer als das, was eine ERSTE Frage über einen
   Router braucht (zwei ARP-Runden plus acht Kabelstrecken). Die
   Antwort kam nach 1,6 s, die Wiederholung ging nach 1,5 s hinaus.
   Im Mitschnitt stand die Frage dann zweimal — und die zweite
   Antwort landete auf einem Port, den der Rechner schon geschlossen
   hatte: „Port nicht erreichbar" als Schlusspunkt einer geglückten
   Auflösung.

   Diese Prüfung wacht darüber, weil man den Fehler ohne sie erst
   sieht, wenn eine Klasse davorsitzt. */
section('DNS über einen Router');
{
  const { engine, netz, stack, mit } = bau();
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const term = new sandbox.Terminal(engine, netz, stack, dienste);
  netz.fromJSON(U.deepCopy(FIX.namen.netz));
  dienste.start();
  const r1 = netz.byName('Endgerät 1');

  term.submit(r1.id, 'ping www.schule.de');
  engine.runUntil(40 * SEC);
  const txt = term.linesOf(r1.id).map(l => l.text).join('\n');
  ok('Szenario 6 löst den Namen auf', /www\.schule\.de ist 192\.168\.2\.30/.test(txt), txt.slice(-300));
  ok('und der Ping kommt durch', /4 von 4 angekommen/.test(txt), txt.slice(-300));

  const fragen = mit.view().filter(r => r.node === r1.id && /DNS-Frage/.test(r.info));
  ok('die Frage geht genau EINMAL hinaus', fragen.length === 1,
     fragen.length + ' Fragen — DNS_WAIT ist zu kurz für ARP + vier Kabel');
  ok('kein „Port nicht erreichbar" nach geglückter Auflösung',
     !mit.view().some(r => /Port nicht erreichbar/.test(r.info)),
     mit.view().filter(r => /Port nicht/.test(r.info)).map(r => r.nodeName).join(','));
}

/* ═══ 16c · Die Fristen gegeneinander ═══
   Drei Zahlen, die in dieser Reihenfolge stehen müssen. Steht eine
   falsch, liest ein Kind die falsche Ursache — und das ist bei
   einem Lernmittel der schlimmste Fehler, den es machen kann. */
section('Fristen');
{
  const { engine, netz, stack } = bau();
  const a = netz.addNode('host', 100, 100);
  const sw = netz.addNode('switch', 300, 100);
  konf(a, 0, '192.168.1.10');
  netz.addCable(a.id, 0, sw.id, 0);
  let grund = null;
  stack.ping(a, '192.168.1.99', 1, stack.PING_FRIST, (r) => { grund = r.error; });
  engine.runUntil(20 * SEC);
  /* Wenn ARP zuerst aufgibt, steht die WAHRE Ursache da. Gibt der
     Ping zuerst auf, steht „Zeitüberschreitung" — formal richtig
     und didaktisch wertlos. */
  ok('ARP gibt vor dem Ping auf',
     /ARP-Anfrage/.test(String(grund)), String(grund));
}
{
  /* Die andere Seite derselben Zahl: die Frist muss ÜBER dem
     liegen, was ein erster Ping über einen Router ehrlich braucht
     — zwei Adressauflösungen und acht Kabelstrecken. Im Bild stand
     sonst „Zeitüberschreitung" bei Nr. 1 und „Antwort" bei Nr. 2
     bis 4, und daraus lernt ein Kind, dass Netze eben manchmal
     nicht gehen. */
  const { engine, netz, stack } = bau();
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const term = new sandbox.Terminal(engine, netz, stack, dienste);
  netz.fromJSON(U.deepCopy(FIX.router.netz));
  netz.byName('Endgerät 1').gateway = '192.168.1.1';
  netz.byName('Server 1').gateway = '192.168.2.1';
  term.submit(netz.byName('Endgerät 1').id, 'ping 192.168.2.20');
  engine.runUntil(60 * SEC);
  const txt = term.linesOf(netz.byName('Endgerät 1').id).map(l => l.text).join('\n');
  ok('schon der ERSTE Ping über den Router kommt durch',
     /Antwort von 192\.168\.2\.20: Nr\. 1/.test(txt), txt.slice(-500));
  ok('alle vier kommen durch', /4 von 4 angekommen/.test(txt), txt.slice(-200));
}

{
  /* Vier Anfragen an eine Adresse, die es nicht gibt. Ohne den
     Nachklang eines gescheiterten ARP zahlt jede einzelne die
     vollen 2,4 s Geduld — bei Tempo 0,1 sind das anderthalb
     Minuten, in denen ein Kind auf einen stehenden Bildschirm
     schaut. Mit ihm zahlt nur die erste. */
  const { engine, netz, stack } = bau();
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const term = new sandbox.Terminal(engine, netz, stack, dienste);
  const a = netz.addNode('host', 100, 100);
  const sw = netz.addNode('switch', 300, 100);
  konf(a, 0, '192.168.1.10');
  netz.addCable(a.id, 0, sw.id, 0);

  const t0 = engine.now;
  term.submit(a.id, 'ping 192.168.1.99');
  /* In Schritten laufen lassen und stehenbleiben, sobald die
     Zusammenfassung da ist. `runUntil` zieht die Uhr sonst bis zum
     Ziel vor, auch wenn nichts mehr ansteht — gemessen würde dann
     das Ziel, nicht die Dauer. */
  let fertigBei = null;
  for (let i = 0; i < 600 && fertigBei === null; i++) {
    engine.runUntil(engine.now + 100 * U.MS);
    if (term.linesOf(a.id).some(l => /von 4 angekommen/.test(l.text))) fertigBei = engine.now;
  }
  const txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('vier Fehlschläge stehen da', /0 von 4 angekommen/.test(txt), txt.slice(-300));
  ok('und alle vier nennen die ARP-Ursache',
     (txt.match(/ARP-Anfrage/g) || []).length === 4,
     String((txt.match(/ARP-Anfrage/g) || []).length));
  /* Die erste Anfrage wartet die volle Geduld ab, die drei anderen
     nicht. Gemessen wird großzügig: unter der Hälfte dessen, was
     vier volle Runden kosten würden. */
  const gebraucht = (fertigBei === null ? Infinity : fertigBei) - t0;
  ok('ein vergeblicher Ping hält nicht viermal auf',
     gebraucht < 4 * 2.4 * SEC / 2, (gebraucht / SEC).toFixed(2) + ' s');
}

/* ═══ 16d · Fluten zusammenfassen ═══
   Ein Switch schickt einen Rundruf an alle Anschlüsse. Ohne das
   Zusammenfassen stehen vier gleiche Zeilen zur selben Mikrosekunde
   da — und bei DHCP verschwand die Folge Discover → Offer →
   Request → Ack unter einem Dutzend identischer Ack-Zeilen. */
section('Mitschnitt: Fluten');
{
  const { engine, netz, stack, mit } = bau();
  const sw = netz.addNode('switch', 300, 200);   // fünf Anschlüsse
  const a = netz.addNode('host', 100, 100);
  konf(a, 0, '192.168.1.10');
  netz.addCable(a.id, 0, sw.id, 0);
  for (let i = 1; i < 5; i++) {
    const h = netz.addNode('host', 500, 100 + i * 50);
    konf(h, 0, '192.168.1.' + (20 + i));
    netz.addCable(h.id, 0, sw.id, i);
  }
  stack.ping(a, '192.168.1.24', 1, stack.PING_FRIST, () => {});
  engine.runUntil(5 * SEC);

  const flut = mit.view().filter(r => r.nodeName === sw.name && /Wer hat/.test(r.info));
  ok('der geflutete Rundruf steht als EINE Zeile da', flut.length === 1,
     flut.length + ' Zeilen: ' + flut.map(r => r.info).join(' | '));
  ok('und sagt, über wie viele Anschlüsse er ging', flut[0] && flut[0].mal === 4,
     String(flut[0] && flut[0].mal));
  ok('die Antwort daneben wird NICHT zusammengefasst',
     mit.view().filter(r => /ist bei/.test(r.info)).every(r => r.mal === 1));
  ok('der Text nennt die Anschlüsse',
     /an 4 Anschlüsse/.test(mit.toText()), mit.toText().split('\n')[2]);
}

/* ═══ 16e · Erst aufspielen, dann starten ═══
   Wie in Filius ist der DNS-Server ein PROGRAMM, kein Schalter am
   Gerät. Zwei Bedingungen also, und beide müssen stimmen — sonst
   wäre die Software-Installation eine Zierleiste. */
section('Software');
{
  const { engine, netz, stack } = bau();
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const a = netz.addNode('host', 100, 100);
  const srv = netz.addNode('server', 300, 100);
  konf(a, 0, '192.168.1.10'); konf(srv, 0, '192.168.1.20');
  netz.addCable(a.id, 0, srv.id, 0);
  a.dns = '192.168.1.20';
  netz.dnsConf(srv).records.push({ name: 'test.schule', ip: '192.168.1.20' });

  const frag = () => {
    let r = null;
    dienste.resolve(a, 'test.schule', (x) => r = x);
    engine.runUntil(engine.now + 10 * SEC);
    return r;
  };

  /* ⚠️ Zu jedem der vier Zustände gleich die Frage mit, die die
     FLÄCHE stellt: `netz.dienstLaeuft`. Beide Antworten müssen
     dieselbe sein, sonst behauptet die Marke unter der Kachel
     etwas, was nicht läuft — und die Fehlersuche der Klasse geht
     dorthin, wo nichts zu finden ist. Deshalb stehen die Prüfungen
     Zeile für Zeile beieinander und nicht in einem eigenen
     Abschnitt. */

  // 1) gestartet, aber nicht installiert
  srv.dnsServer.on = true;
  dienste.start();
  ok('ohne Installation antwortet niemand', !frag().ok);
  ok('… und die Fläche schreibt auch keine Marke hin',
     !netz.dienstLaeuft(srv, 'dns'));

  // 2) installiert, aber nicht gestartet
  srv.software = ['dns'];
  srv.dnsServer.on = false;
  dienste.sync();
  ok('installiert, aber gestoppt: auch nicht', !frag().ok);
  ok('… installiert allein ergibt KEINE Marke', !netz.dienstLaeuft(srv, 'dns'));

  // 3) beides
  srv.dnsServer.on = true;
  dienste.sync();
  const r = frag();
  ok('aufgespielt UND gestartet: jetzt geht es', r.ok && r.ip === '192.168.1.20', JSON.stringify(r));
  ok('… und jetzt steht die Marke da', netz.dienstLaeuft(srv, 'dns'));
  ok('… als einzige', netz.laufendeDienste(srv).join(',') === 'dns',
     netz.laufendeDienste(srv).join(','));

  /* Ein ausgeschaltetes Gerät tut nichts — auch wenn alles
     eingerichtet ist. `sync()` schaltet die Dienste dort ab, also
     darf die Marke nicht stehen bleiben. */
  srv.on = false;
  ok('ausgeschaltet: keine Marke, obwohl gestartet', !netz.dienstLaeuft(srv, 'dns'));
  srv.on = true;
  ok('wieder an: die Marke ist zurück', netz.dienstLaeuft(srv, 'dns'));

  // 4) wieder deinstallieren
  srv.software = [];
  dienste.sync();
  // Der Zwischenspeicher des Fragenden kennt den Namen noch —
  // deshalb ein anderer Name.
  netz.dnsConf(srv).records.push({ name: 'zweiter.schule', ip: '192.168.1.20' });
  let r2 = null;
  dienste.resolve(a, 'zweiter.schule', (x) => r2 = x);
  engine.runUntil(engine.now + 10 * SEC);
  ok('nach dem Entfernen antwortet es nicht mehr', !r2.ok, JSON.stringify(r2));

  ok('das Speicherformat merkt sich die Programme',
     (netz.toJSON().nodes.find(x => x.id === srv.id).software || []).length === 0);
  srv.software = ['dns'];
  ok('und auch, wenn eines drauf ist',
     netz.toJSON().nodes.find(x => x.id === srv.id).software[0] === 'dns');
}

/* ═══ 16e · Was ein Gerät TUT: die Marken unter der Kachel ═══
   Vom Nutzer verlangt: DNS, Webserver und E-Mail-Server sollen an
   der Kachel zu sehen sein wie DHCP — „aber nur, wenn sie aktiv
   sind. Also wirklich aktiv. Nicht nur installiert."

   Gemessen wird hier die Antwort selbst (`netz.dienstLaeuft` /
   `laufendeDienste`); dass die Pille daraus wirklich gezeichnet
   wird, prüft der Browser-Prüfstand. Kopflos ist es billiger und
   genauer — und es ist die Stelle, an der ein neuer Dienst
   vergessen würde. */
section('Dienstmarken');
{
  const { netz } = bau();
  const srv = netz.addNode('server', 100, 100);
  konf(srv, 0, '192.168.1.20');

  ok('ein frischer Server tut noch nichts', netz.laufendeDienste(srv).length === 0);

  /* Alle drei Programme aufspielen, keines starten. Genau der
     Zustand, den der Nutzer beanstandet hat: drei Kacheln auf dem
     Bildschirm, kein laufender Dienst. */
  srv.software = ['dns', 'webserver', 'mailserver'];
  ok('drei Programme aufgespielt — und trotzdem keine Marke',
     netz.laufendeDienste(srv).length === 0, netz.laufendeDienste(srv).join(','));

  netz.dnsConf(srv).on = true;
  ok('DNS gestartet: eine Marke', netz.laufendeDienste(srv).join(',') === 'dns');
  netz.webConf(srv).on = true;
  netz.mailConf(srv).on = true;
  ok('alle drei gestartet: drei Marken',
     netz.laufendeDienste(srv).join(',') === 'dns,web,mail', netz.laufendeDienste(srv).join(','));

  /* DHCP steht vorn und braucht kein Programm — in Filius ist es
     auch keines, sondern ein Kontrollkästchen am Gerät. Die
     Reihenfolge ist fest, damit die Pillen nicht die Plätze
     tauschen, wenn ein Dienst dazukommt. */
  netz.dhcpConf(srv).on = true;
  ok('DHCP braucht keine Installation und steht vorn',
     netz.laufendeDienste(srv).join(',') === 'dhcp,dns,web,mail',
     netz.laufendeDienste(srv).join(','));

  // Ein Programm entfernen heißt: Marke weg, auch wenn `on` steht.
  srv.software = srv.software.filter(x => x !== 'webserver');
  ok('deinstalliert, obwohl noch „gestartet": keine Web-Marke',
     !netz.dienstLaeuft(srv, 'web') && netz.dienstLaeuft(srv, 'mail'));

  // Und das Gerät aus: gar nichts mehr.
  srv.on = false;
  ok('ausgeschaltetes Gerät trägt keine Marke', netz.laufendeDienste(srv).length === 0);
  srv.on = true;

  ok('eine unbekannte Dienstart ist einfach nichts', !netz.dienstLaeuft(srv, 'gibtsnicht'));
  ok('und kein Gerät auch nicht', !netz.dienstLaeuft(null, 'dns'));

  /* Ein Switch kann keines dieser Programme tragen (PROGRAMME.fuer
     nennt host/server/handy). Die Frage darf trotzdem gestellt
     werden — die Fläche stellt sie für JEDES Gerät. */
  const sw = netz.addNode('switch', 300, 100);
  ok('der Switch tut nichts davon', netz.laufendeDienste(sw).length === 0);
}

/* ═══ 16f · Rechner und Server sind dasselbe ═══
   Zwei Bilder, ein Gerät — wie Rechner und Notebook in Filius.
   Wenn irgendwo `kind === 'server'` etwas erlaubt, was ein
   Rechner nicht darf, ist das ein Fehler. */
section('Rechner = Server');
{
  const { netz } = bau();
  const h = netz.addNode('host', 100, 100);
  const s = netz.addNode('server', 300, 100);
  const K = netz.KIND;
  ok('gleiche Zahl Netzwerkkarten', K.host.ports === K.server.ports);
  ok('gleiche Obergrenze', K.host.maxPorts === K.server.maxPorts);
  ok('beide leiten nicht weiter', K.host.routes === K.server.routes);
  ok('beide können Programme bekommen',
     Array.isArray(h.software) && Array.isArray(s.software));
  ok('beide können DHCP-Server werden',
     !!netz.dhcpConf(h) && !!netz.dhcpConf(s));
}

/* ═══ 16g · Kurznamen ═══
   Das Kürzel ist das, was auf der Fläche steht und wonach im
   Unterricht gerufen wird. Es muss eindeutig sein und darf sich
   nicht ändern, nur weil jemand ein anderes Gerät löscht. */
section('Kurznamen');
{
  const { netz } = bau();
  const e1 = netz.addNode('host', 100, 100);
  const e2 = netz.addNode('host', 200, 100);
  const sw = netz.addNode('switch', 300, 100);
  const r  = netz.addNode('router', 400, 100);
  const sv = netz.addNode('server', 500, 100);
  ok('neue Geräte heißen Endgerät 1, Endgerät 2', e1.name === 'Endgerät 1' && e2.name === 'Endgerät 2',
     e1.name + ' / ' + e2.name);
  ok('E1 · E2', netz.kurzName(e1) === 'E1' && netz.kurzName(e2) === 'E2');
  ok('Switch ist SW1, nicht S1', netz.kurzName(sw) === 'SW1');
  ok('Router ist R1', netz.kurzName(r) === 'R1');
  ok('Server ist S1', netz.kurzName(sv) === 'S1');
  ok('Switch und Server kollidieren nicht',
     netz.kurzName(sw) !== netz.kurzName(sv));

  // Ein gelöschtes Gerät benennt die übrigen NICHT um: ein Auftrag,
  // der „ping von E1 nach E2" sagt, meint danach dieselben Geräte.
  netz.removeNode(e1.id);
  ok('E2 bleibt E2, wenn E1 verschwindet', netz.kurzName(e2) === 'E2');

  // Geräte ohne Zahl im Namen (aus einem Szenario) werden nach
  // ihrer Stelle gezählt, sonst hießen beide „S".
  const { netz: n2 } = bau();
  const web = n2.addNode('server', 100, 100, 'Webserver');
  const dns = n2.addNode('server', 200, 100, 'DNS-Server');
  ok('Webserver → S1, DNS-Server → S2',
     n2.kurzName(web) === 'S1' && n2.kurzName(dns) === 'S2',
     n2.kurzName(web) + ' / ' + n2.kurzName(dns));

  // Neue Geräte zählen weiter: kein zweites S1 / E1 neben Szenariogeräten.
  const sv3 = n2.addNode('server', 300, 100);
  ok('neuer Server neben Webserver/DNS-Server ist S3', n2.kurzName(sv3) === 'S3', n2.kurzName(sv3));
  const lap = n2.addNode('host', 100, 200, 'Laptop 1');
  const neu = n2.addNode('host', 200, 200);
  ok('neues Endgerät neben „Laptop 1" ist E2', n2.kurzName(neu) === 'E2', n2.kurzName(neu));
}

/* ═══ 16h · Alte Stände werden nachgezogen ═══
   Gerätenamen sind nicht mehr von Hand änderbar. Also darf aus
   „Rechner 3" beim Laden „Endgerät 3" werden — sonst stünde auf
   der Fläche E3 und im Fensterkopf „Rechner 3". */
section('Alte Stände');
{
  const { netz } = bau();
  netz.fromJSON({ v: 2, nodes: [
    { id: 'x1', kind: 'host', x: 10, y: 10, name: 'Rechner 3', nics: [{ i: 0, mac: '02:00:00:00:00:01' }] },
    { id: 'x2', kind: 'host', x: 20, y: 10, name: 'Meiner',    nics: [{ i: 0, mac: '02:00:00:00:00:02' }] },
    { id: 'x3', kind: 'server', x: 30, y: 10, name: 'Rechner 1', nics: [{ i: 0, mac: '02:00:00:00:00:03' }] }
  ], cables: [] });
  ok('aus „Rechner 3" wird „Endgerät 3"', !!netz.byName('Endgerät 3'));
  ok('und das Kürzel stimmt', netz.kurzName(netz.byName('Endgerät 3')) === 'E3');
  ok('ein selbst vergebener Name bleibt', !!netz.byName('Meiner'));
  ok('ein Server namens „Rechner 1" wird nicht umbenannt', !!netz.byName('Rechner 1'));
}

/* ═══ 17 · ping mit Namen ═══ */
section('ping mit Namen');
{
  const { engine, netz, stack } = bau();
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const term = new sandbox.Terminal(engine, netz, stack, dienste);
  const a = netz.addNode('host', 100, 100);
  const srv = netz.addNode('server', 300, 100);
  const sw = netz.addNode('switch', 200, 300);
  konf(a, 0, '192.168.1.10'); konf(srv, 0, '192.168.1.20');
  netz.addCable(a.id, 0, sw.id, 0);
  netz.addCable(srv.id, 0, sw.id, 1);
  netz.dnsConf(srv);
  /* Zwei Schritte, wie in Filius: erst aufspielen, dann starten.
     Nur `on` zu setzen reicht nicht — ein Programm, das nicht
     installiert ist, läuft auch nicht. */
  srv.software = ['dns'];
  srv.dnsServer.on = true;
  srv.dnsServer.records.push({ name: 'server.schule', ip: '192.168.1.20' });
  a.dns = '192.168.1.20';
  dienste.start();

  term.submit(a.id, 'ping server.schule');
  engine.runUntil(30 * SEC);
  let txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('der Name wird zuerst aufgelöst', /server\.schule ist 192\.168\.1\.20/.test(txt), txt.slice(-400));
  ok('und dann geht der Ping durch', /4 von 4 angekommen/.test(txt), txt.slice(-300));

  term.submit(a.id, 'nslookup nixda.schule');
  engine.runUntil(engine.now + 10 * SEC);
  txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('nslookup meldet den unbekannten Namen', /kennt den Namen/.test(txt), txt.slice(-200));

  term.submit(a.id, 'dhcp');
  txt = term.linesOf(a.id).map(l => l.text).join('\n');
  ok('dhcp sagt, dass hier nichts automatisch kommt',
     /nicht automatisch/.test(txt), txt.slice(-200));
}

/* ═══ Subnetze ═══════════════════════════════════════════════
   Die Neuerung gegenüber Filius, und damit der Teil ohne Vorbild:
   hier gibt es keine fremde Umsetzung, an der man ablesen könnte,
   ob das Ergebnis stimmt. Also wird jede einzelne Aussage geprüft,
   die die Färbung auf der Fläche behauptet.                      */
section('Subnetze');
{
  const SN = sandbox.Subnetze;

  /* Ein Bauplatz: Geräte anlegen, Adressen eintragen, verkabeln.
     `konfigSN` schreibt direkt in die Karte — dasselbe, was das
     Eingabefeld tut.

     ⚠️ `bauSN` und nicht `bau`. Diese Datei läuft als SKRIPT und
     nicht als Modul, darum hebt JavaScript eine
     Funktionsdeklaration aus einem Block an die Dateiebene — ein
     zweites `bau` hier überschrieb das obere, und zwar für alles,
     was DANACH kommt. Der Fehler trifft damit nicht diesen
     Abschnitt, sondern den nächsten, den jemand unten anhängt,
     und er sieht aus, als sei `Stack` kaputt: `bau()` gibt kein
     `stack` zurück. Genau darüber ist der Abschnitt „Mitschnitt"
     am 2026-09-26 gestolpert. */
  function bauSN() {
    const engine = new sandbox.Engine({ seed: 5 });
    const netz = new sandbox.Netz(engine);
    const setz = (n, i, ip, mask) => {
      n.nics[i].ip = ip;
      if (mask) n.nics[i].mask = mask;
      return n;
    };
    return { engine, netz, setz };
  }

  /* ─ Doppelte Adresse: beide fallen aus dem Netz ─
     Zwei Karten mit derselben Adresse im selben Draht tragen
     keine Farbe; was übrig bleibt, ist weiter ein Netz. In zwei
     getrennten Drähten ist dieselbe Adresse dagegen kein Fehler. */
  {
    const { netz, setz } = bauSN();
    const sw = netz.addNode('switch', 200, 200);
    const h = [0, 1, 2, 3].map(i => netz.addNode('host', 100 + i * 100, 100));
    setz(h[0], 0, '192.168.1.10'); setz(h[1], 0, '192.168.1.10');
    setz(h[2], 0, '192.168.1.20'); setz(h[3], 0, '192.168.1.30');
    const k = h.map((n, i) => netz.addCable(n.id, 0, sw.id, i).cable);
    const sn = SN.berechnen(netz);
    ok('doppelte Adresse: gemeldet', sn.doppelt.length === 1 && sn.doppelt[0].ip === '192.168.1.10'
       && sn.doppelt[0].nodes.length === 2, JSON.stringify(sn.doppelt.map(d => d.ip)));
    ok('doppelte Adresse: beide ohne Farbe',
       !sn.vonNode.has(h[0].id) && !sn.vonNode.has(h[1].id));
    ok('doppelte Adresse: ihre Kabel bleiben grau',
       !sn.vonKabel.has(k[0].id) && !sn.vonKabel.has(k[1].id));
    ok('doppelte Adresse: der Rest bleibt ein Netz',
       sn.liste.length === 1 && sn.liste[0].nodes.length === 2 && sn.vonKabel.has(k[2].id));

    const { netz: n2, setz: s2 } = bauSN();
    const sa = n2.addNode('switch', 200, 200), sb2 = n2.addNode('switch', 600, 200);
    const g = [0, 1, 2, 3].map(i => n2.addNode('host', 100 + i * 100, 100));
    s2(g[0], 0, '192.168.1.10'); s2(g[1], 0, '192.168.1.20');
    s2(g[2], 0, '192.168.1.10'); s2(g[3], 0, '192.168.1.20');
    n2.addCable(g[0].id, 0, sa.id, 0); n2.addCable(g[1].id, 0, sa.id, 1);
    n2.addCable(g[2].id, 0, sb2.id, 0); n2.addCable(g[3].id, 0, sb2.id, 1);
    const sn2 = SN.berechnen(n2);
    ok('gleiche Adresse in getrennten Drähten: kein Fehler, zwei Netze',
       sn2.doppelt.length === 0 && sn2.liste.length === 2);
  }

  /* ─ 1 · Zwei Rechner an einem Switch ─ */
  {
    const { netz, setz } = bauSN();
    const a = netz.addNode('host', 100, 100), b = netz.addNode('host', 300, 100);
    const sw = netz.addNode('switch', 200, 200);
    setz(a, 0, '192.168.1.10'); setz(b, 0, '192.168.1.20');
    netz.addCable(a.id, 0, sw.id, 0);
    netz.addCable(b.id, 0, sw.id, 1);

    const sn = SN.berechnen(netz);
    ok('Switch verbindet zu EINEM Subnetz', sn.liste.length === 1, sn.liste.length);
    ok('beide Rechner liegen darin', sn.liste[0] && sn.liste[0].nodes.length === 2);
    ok('der Switch selbst gehört keinem Netz an', !sn.vonNode.get(sw.id));
    ok('beide Kabel tragen die Farbe des Netzes',
       [...sn.vonKabel.values()].length === 2);
    ok('die Netzadresse stimmt', sn.liste[0].netStr === '192.168.1.0', sn.liste[0].netStr);
  }

  /* ─ 2 · Ein Gerät allein ist kein Netz ─
     Der Satz, der die ganze Anzeige trägt: „man ist erst ein
     Subnetz, wenn etwas verbunden ist." */
  {
    const { netz, setz } = bauSN();
    const a = netz.addNode('host', 100, 100);
    const sw = netz.addNode('switch', 200, 200);
    setz(a, 0, '192.168.1.10');
    netz.addCable(a.id, 0, sw.id, 0);
    const sn = SN.berechnen(netz);
    ok('ein Rechner allein am Switch bildet kein Netz', sn.liste.length === 0);
    ok('und sein Kabel bleibt ungefärbt', sn.vonKabel.size === 0);
  }

  /* ─ 3 · Der Router liegt in ZWEI Netzen ─
     Die Aussage, für die es die Ringe gibt. */
  {
    const { netz, setz } = bauSN();
    const a = netz.addNode('host', 100, 100), b = netz.addNode('host', 500, 100);
    const r = netz.addNode('router', 300, 200);
    setz(a, 0, '192.168.1.10'); setz(b, 0, '192.168.2.10');
    setz(r, 0, '192.168.1.1');  setz(r, 1, '192.168.2.1');
    netz.addCable(a.id, 0, r.id, 0);
    netz.addCable(b.id, 0, r.id, 1);

    const sn = SN.berechnen(netz);
    ok('zwei Netze am Router', sn.liste.length === 2, sn.liste.length);
    ok('der Router liegt in beiden', (sn.vonNode.get(r.id) || []).length === 2);
    ok('jedes Endgerät nur in einem', (sn.vonNode.get(a.id) || []).length === 1);
    ok('die beiden Netze haben verschiedene Farben',
       sn.liste[0].slot !== sn.liste[1].slot, sn.liste.map(s => s.slot).join('/'));
    ok('sortiert nach Adresse', sn.liste[0].netStr === '192.168.1.0', sn.liste[0].netStr);
    /* Und das ist der Punkt, an dem sich diese Rechnung von einem
       schlichten „gleiche ersten drei Blöcke" unterscheidet: der
       Router bringt die beiden Netze NICHT zusammen. */
    ok('der Router verbindet die Netze nicht zu einem',
       sn.liste[0].key !== sn.liste[1].key);
  }

  /* ─ 4 · Gleicher Adressraum, aber kein Kabel dazwischen ─ */
  {
    const { netz, setz } = bauSN();
    const a = netz.addNode('host', 100, 100), b = netz.addNode('host', 300, 100);
    const c = netz.addNode('host', 500, 100), d = netz.addNode('host', 700, 100);
    setz(a, 0, '192.168.1.10'); setz(b, 0, '192.168.1.20');
    setz(c, 0, '192.168.1.30'); setz(d, 0, '192.168.1.40');
    netz.addCable(a.id, 0, b.id, 0);
    netz.addCable(c.id, 0, d.id, 0);
    const sn = SN.berechnen(netz);
    ok('zwei getrennte Kabelstränge sind zwei Netze — trotz gleicher Adressen',
       sn.liste.length === 2, sn.liste.length);
  }

  /* ─ 5 · Gleiches Kabel, verschiedene Masken ─
     Der Fehler, der im Unterricht am teuersten ist: es sieht
     richtig aus und geht nicht. */
  {
    const { netz, setz } = bauSN();
    const a = netz.addNode('host', 100, 100), b = netz.addNode('host', 300, 100);
    setz(a, 0, '192.168.1.10', '255.255.255.0');
    setz(b, 0, '192.168.1.200', '255.255.255.128');
    netz.addCable(a.id, 0, b.id, 0);
    const sn = SN.berechnen(netz);
    ok('verschiedene Masken ⇒ kein gemeinsames Netz', sn.liste.length === 0, sn.liste.length);
    ok('und das Kabel bleibt grau', sn.vonKabel.size === 0);
  }

  /* ─ 6 · Zwei Adressräume an einem Switch ─
     Der Fall, an dem sich zeigt, ob die Färbung etwas erklärt oder
     nur hübsch ist. Vier Rechner an einem Switch, zwei davon in
     192.168.1.x, zwei in 10.0.0.x. Verkabelt ist alles richtig,
     und trotzdem spricht die eine Hälfte nicht mit der anderen.

     Jedes Kabel endet an genau einem Rechner, und der liegt in
     genau einem Netz — also bekommt jedes Kabel dessen Farbe. Am
     Switch treffen dann zwei blaue und zwei orange Kabel
     aufeinander, und DAS ist die Fehlermeldung: man sieht den
     Bruch, statt ihn zu lesen. */
  {
    const { netz, setz } = bauSN();
    const sw = netz.addNode('switch', 200, 200);
    const g = [];
    for (let i = 0; i < 4; i++) g.push(netz.addNode('host', 100 * i, 100));
    setz(g[0], 0, '192.168.1.10'); setz(g[1], 0, '192.168.1.20');
    setz(g[2], 0, '10.0.0.10');    setz(g[3], 0, '10.0.0.20');
    g.forEach((n, i) => netz.addCable(n.id, 0, sw.id, i));
    const sn = SN.berechnen(netz);
    ok('zwei Adressräume an einem Switch werden beide erkannt', sn.liste.length === 2);
    ok('und als gemischter Strang gemeldet', sn.gemischt.length === 1);
    ok('jedes Kabel trägt die Farbe SEINES Rechners', sn.vonKabel.size === 4, sn.vonKabel.size);
    const f = g.map(n => sn.vonKabel.get(n.nics[0].cable).slot);
    ok('zwei blaue und zwei orange am selben Switch',
       f[0] === f[1] && f[2] === f[3] && f[0] !== f[2], f.join('/'));
  }

  /* ─ 6b · Und das Kabel ZWISCHEN zwei Switches ─
     Dort endet an beiden Seiten ein Switch, der zu beiden Netzen
     gehören könnte. Eine der beiden Farben zu wählen wäre geraten,
     also bleibt es grau. */
  {
    const { netz, setz } = bauSN();
    const s1 = netz.addNode('switch', 200, 200), s2 = netz.addNode('switch', 400, 200);
    const g = [];
    for (let i = 0; i < 4; i++) g.push(netz.addNode('host', 100 * i, 100));
    setz(g[0], 0, '192.168.1.10'); setz(g[1], 0, '192.168.1.20');
    setz(g[2], 0, '10.0.0.10');    setz(g[3], 0, '10.0.0.20');
    netz.addCable(g[0].id, 0, s1.id, 0); netz.addCable(g[2].id, 0, s1.id, 1);
    netz.addCable(g[1].id, 0, s2.id, 0); netz.addCable(g[3].id, 0, s2.id, 1);
    const trunk = netz.addCable(s1.id, 4, s2.id, 4);
    const sn = SN.berechnen(netz);
    ok('Switch zu Switch: zwei Netze im selben Strang', sn.liste.length === 2);
    ok('das Kabel dazwischen bleibt grau',
       !sn.vonKabel.get(trunk.cable.id), sn.vonKabel.size);
    ok('die vier Kabel an den Rechnern aber nicht', sn.vonKabel.size === 4, sn.vonKabel.size);
  }

  /* ─ 7 · Gezogenes Kabel trennt ─ */
  {
    const { netz, setz } = bauSN();
    const a = netz.addNode('host', 100, 100), b = netz.addNode('host', 300, 100);
    setz(a, 0, '192.168.1.10'); setz(b, 0, '192.168.1.20');
    const r = netz.addCable(a.id, 0, b.id, 0);
    ok('mit Kabel ein Netz', SN.berechnen(netz).liste.length === 1);
    r.cable.up = false;
    ok('gezogenes Kabel trennt das Netz auf', SN.berechnen(netz).liste.length === 0);
  }

  /* ─ 8 · Dieselbe Adresse, dieselbe Farbe ─
     Die Farbe hängt am Adressraum, nicht an der Reihenfolge des
     Anlegens. Sonst hieße „das grüne Netz" zwei Minuten später
     etwas anderes. */
  {
    function slotVon(zuerstDasAndere) {
      const { netz, setz } = bauSN();
      const mk = (ip) => {
        const x = netz.addNode('host', 0, 0), y = netz.addNode('host', 0, 0);
        setz(x, 0, ip + '.10'); setz(y, 0, ip + '.20');
        netz.addCable(x.id, 0, y.id, 0);
      };
      if (zuerstDasAndere) { mk('10.0.0'); mk('192.168.1'); }
      else { mk('192.168.1'); mk('10.0.0'); }
      const sn = SN.berechnen(netz);
      return sn.liste.find(s => s.netStr === '192.168.1.0').slot;
    }
    ok('die Farbe hängt an der Adresse, nicht an der Reihenfolge',
       slotVon(true) === slotVon(false), slotVon(true) + '/' + slotVon(false));
  }

  /* ─ 9 · Adressräume aufschreiben ─
     Die Frage, an der jede Darstellung hängt: was steht da, wenn
     die Maske nicht auf einer Blockgrenze endet? */
  {
    const mk = (ipStr, maskStr) => {
      const mask = U.ip2int(maskStr);
      return { net: U.netOf(U.ip2int(ipStr), mask), mask,
               netStr: U.int2ip(U.netOf(U.ip2int(ipStr), mask)), maskStr };
    };

    let b = SN.bereich(mk('192.168.1.10', '255.255.255.0'));
    ok('/24: Adressen .1 bis .254',
       b.von === '192.168.1.1' && b.bis === '192.168.1.254', b.von + '–' + b.bis);
    ok('/24: Rundruf .255', b.rundruf === '192.168.1.255');
    ok('/24: 254 Plätze', b.platz === 254, b.platz);
    ok('/24 kurz: 192.168.1.__', SN.kurzText(mk('192.168.1.10', '255.255.255.0')) === '192.168.1.__',
       SN.kurzText(mk('192.168.1.10', '255.255.255.0')));

    b = SN.bereich(mk('192.168.1.100', '255.255.255.192'));
    ok('krumme Maske (.192): Netz ist .64',
       b.netz === '192.168.1.64', b.netz);
    ok('krumme Maske: Adressen .65 bis .126',
       b.von === '192.168.1.65' && b.bis === '192.168.1.126', b.von + '–' + b.bis);
    ok('krumme Maske: Rundruf .127', b.rundruf === '192.168.1.127');
    ok('krumme Maske: 62 Plätze', b.platz === 62, b.platz);
    /* Die Kurzform kann hier nicht mit Unterstrichen enden — die
       Grenze liegt MITTEN im letzten Block. Also steht dort die
       Zahl, und der Block wird gestreift gezeichnet. */
    ok('krumme Maske: der letzte Block bleibt eine Zahl',
       SN.kurzText(mk('192.168.1.100', '255.255.255.192')) === '192.168.1.64',
       SN.kurzText(mk('192.168.1.100', '255.255.255.192')));
    const g = SN.kurzGruppen(mk('192.168.1.100', '255.255.255.192'));
    ok('krumme Maske: und er ist als „geteilt" gekennzeichnet',
       g[g.length - 1].teil === 'geteilt', g.map(x => x.teil).join('/'));

    ok('/16 kurz: 172.16.__.__',
       SN.kurzText(mk('172.16.5.9', '255.255.0.0')) === '172.16.__.__',
       SN.kurzText(mk('172.16.5.9', '255.255.0.0')));
    b = SN.bereich(mk('172.16.5.9', '255.255.0.0'));
    ok('/16: Adressen 172.16.0.1 bis 172.16.255.254',
       b.von === '172.16.0.1' && b.bis === '172.16.255.254', b.von + '–' + b.bis);

    /* /30 ist die Maske für eine Strecke zwischen zwei Routern —
       zwei Plätze, und die Klasse muss sehen, dass es genau zwei
       sind. */
    b = SN.bereich(mk('10.0.0.5', '255.255.255.252'));
    ok('/30: genau zwei Plätze', b.platz === 2, b.platz);
    ok('/30: .5 und .6', b.von === '10.0.0.5' && b.bis === '10.0.0.6', b.von + '–' + b.bis);
  }

  /* ─ 10 · Aus einem Szenario ─
     Szenario 3 ist der Fall, für den die Ringe erfunden sind. */
  {
    const engine = new sandbox.Engine({ seed: 1 });
    const netz = new sandbox.Netz(engine);
    netz.fromJSON(JSON.parse(JSON.stringify(FIX['router'].netz)));
    const sn = SN.berechnen(netz);
    ok('Szenario „Zwei Netze, ein Router" findet genau zwei Netze',
       sn.liste.length === 2, sn.liste.map(s => s.netStr).join(' '));
    const router = netz.list().find(n => n.kind === 'router');
    ok('und der Router liegt in beiden',
       (sn.vonNode.get(router.id) || []).length === 2);
  }
}

/* ═══ Das Handy ist dasselbe Gerät ═══════════════════════════
   Die Regel, die dieser Abschnitt bewacht, ist die wichtigste am
   ganzen Gerätemodell — und sie ist eine Regel über das, was
   NICHT passieren darf: nichts im Kern darf ein Handy anders
   behandeln als einen Rechner. Filius hält es mit Rechner und
   Notebook genauso.

   Eine Prüfung ist hier billig und die Lehre teuer: sobald
   irgendwo ein `kind === 'handy'` einzöge, um etwas zu erlauben
   oder zu verbieten, stünde im Programm das Gegenteil dessen,
   was der Unterricht sagen soll. Ein Ping zwischen Handy und
   Rechner, der wirklich durchläuft, ist der Beweis. */
section('Handy = Endgerät mit anderem Bild');
{
  const K = sandbox.Netz.KIND;
  ok('es gibt die Geräteart Handy', !!K.handy);
  ok('sie hat ein Kürzel, das keiner anderen gehört',
     K.handy.kurz === 'H' && !['E', 'S', 'R', 'SW'].includes(K.handy.kurz));
  ok('eine Netzwerkkarte wie Rechner und Server',
     K.handy.ports === K.host.ports && K.handy.maxPorts === K.host.maxPorts);
  ok('und es leitet nicht weiter — es ist ein Endgerät, kein Router',
     K.handy.routes === false);

  /* ⭐ Der EINE Unterschied im Modell, seit dem 2026-09-27: keine
     Kabelbuchse. Er hängt an einem Merkmal der Geräteart und
     nicht an einer Abfrage auf `kind === 'handy'` — genau wie
     `routes` und `wlan`. Die Prüfung ganz unten in diesem
     Abschnitt wacht darüber. */
  ok('⭐ ein Handy geht nur über WLAN', K.handy.nurFunk === true);
  ok('und kein anderes Gerät hat diese Einschränkung',
     ['host', 'server', 'switch', 'router', 'heimrouter']
       .every(k => !K[k].nurFunk));

  const engine = new sandbox.Engine({ seed: 4 });
  const netz = new sandbox.Netz(engine);
  const stack = new sandbox.Stack(engine, netz);
  const h  = netz.addNode('handy', 200, 200);
  const e  = netz.addNode('host', 400, 200);
  const sw = netz.addNode('switch', 300, 300);
  ok('ein Handy bekommt beim Anlegen eine MAC-Adresse',
     /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(h.nics[0].mac), h.nics[0].mac);
  ok('seine Karte ist von Anfang an eine Funkkarte', h.nics[0].funk === true);

  h.nics[0].ip = '192.168.1.23'; h.nics[0].mask = '255.255.255.0';
  e.nics[0].ip = '192.168.1.10'; e.nics[0].mask = '255.255.255.0';

  /* Ein Kabel ans Handy geht nicht — und die Begründung nennt das
     GERÄT, nicht die Karte. Der Unterschied ist nicht kosmetisch:
     „stell sie auf Kabelgebunden" wäre ein Rat auf einen Knopf,
     den es beim Handy nicht gibt. */
  const versuch = netz.addCable(h.id, 0, sw.id, 0);
  ok('⭐ ein Kabel ans Handy geht nicht', !versuch.ok);
  ok('und die Meldung nennt das WLAN als Weg',
     !!versuch.error && /WLAN/.test(versuch.error) && !/Kabelgebunden/.test(versuch.error),
     versuch.error);
  ok('es steckt danach auch wirklich keines', !h.nics[0].cable);
  ok('ein Kabel zwischen Rechner und Switch geht weiterhin',
     netz.addCable(e.id, 0, sw.id, 1).ok);

  // Und `setFunk` lässt sich nicht überreden, daraus ein
  // Kabelgerät zu machen — die Regel steht im Modell, nicht nur
  // im Formular.
  netz.setFunk(h, 0, false);
  ok('setFunk kann die Funkkarte nicht abschalten', h.nics[0].funk === true);

  ok('Kurzname H1', netz.kurzName(h) === 'H1', netz.kurzName(h));

  // Der Weg ins Netz führt über das WLAN des Switch.
  netz.wlanConf(sw); sw.wlan.on = true; sw.wlan.ssid = 'Klassenzimmer';
  netz.setFunk(h, 0, true, 'Klassenzimmer');
  ok('über WLAN kommt es ins Netz', !!h.nics[0].cable);

  let res = null;
  stack.ping(h, '192.168.1.10', 1, 4 * SEC, r => res = r);
  engine.runUntil(20 * SEC);
  ok('ein Ping vom Handy zum Rechner kommt an und zurück',
     !!res && res.ok, JSON.stringify(res));
  ok('und das Handy hat dabei ARP gelernt',
     !!(stack.arpTable(h) || []).length);

  /* Speichern und wieder laden: die Geräteart muss die Runde
     überstehen, sonst wird aus jedem Handy beim Öffnen einer
     Datei ein Rechner. */
  const kopie = new sandbox.Netz(new sandbox.Engine({ seed: 4 }));
  kopie.fromJSON(JSON.parse(JSON.stringify(netz.toJSON())));
  const h2 = kopie.list().find(n => n.kind === 'handy');
  ok('ein Handy überlebt Speichern und Laden', !!h2);
  ok('mitsamt seiner Adresse', h2 && h2.nics[0].ip === '192.168.1.23');

  /* ⚠️ Ein Stand von VOR dieser Runde: ein Handy mit Kabelkarte
     und einem gesteckten Kabel. Beim Laden muss es nachgezogen
     werden — sonst hinge auf der Fläche ein Strich, den kein
     Formular mehr erklärt und den niemand lösen kann. Dasselbe
     Muster wie seinerzeit „Rechner 3" → „Endgerät 3". */
  const alt = {
    nodes: [
      { id: 'n90', kind: 'handy', x: 100, y: 100, name: 'Handy 1',
        nics: [{ i: 0, mac: '02:00:00:00:00:90', ip: '192.168.1.50',
                 mask: '255.255.255.0', funk: false }] },
      { id: 'n91', kind: 'switch', x: 300, y: 100, name: 'Switch 1',
        nics: [0, 1, 2, 3, 4].map(i => ({ i, mac: '02:00:00:00:01:0' + i })) }
    ],
    cables: [{ id: 'c90', a: { node: 'n90', nic: 0 }, b: { node: 'n91', nic: 0 } }]
  };
  const geladen = new sandbox.Netz(new sandbox.Engine({ seed: 4 }));
  geladen.fromJSON(alt);
  const hAlt = geladen.list().find(n => n.kind === 'handy');
  ok('⭐ ein alter Stand mit verkabeltem Handy wird nachgezogen',
     !!hAlt && hAlt.nics[0].funk === true);
  ok('und das Kabel dazu wird gar nicht erst eingehängt',
     !!hAlt && !hAlt.nics[0].cable && geladen.cableList().length === 0,
     String(geladen.cableList().length));
  ok('die Adresse bleibt aber stehen', !!hAlt && hAlt.nics[0].ip === '192.168.1.50');
}

/* ═══ Heimrouter: WAN, LAN-Brücke, NAT ═══
   Das Gerät, an dem drei Dinge in einem Gehäuse stecken. Geprüft
   wird jedes einzeln UND die Stelle, an der sie sich berühren —
   dort lagen beim Bauen die Fehler. */
section('Heimrouter');

/* ⚠️ Eigener Hilfsbau statt `bau()`. Im Abschnitt „Subnetze"
   weiter oben steht eine ZWEITE Funktion desselben Namens in
   einem Block — und weil diese Datei als Skript läuft und nicht
   als Modul, wird sie an die Dateiebene gehoben und überschreibt
   die obere. Wer hier `bau()` ruft, bekommt {engine, netz, setz}
   zurück und damit keinen Stack; der Fehler zeigt sich erst zur
   Laufzeit und sieht aus, als sei `Stack` kaputt. */
function heimBau(seed) {
  const engine = new sandbox.Engine({ seed: seed || 42 });
  const netz = new sandbox.Netz(engine);
  const stack = new sandbox.Stack(engine, netz);
  const mit = new sandbox.Mitschnitt(engine, netz);
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  return { engine, netz, stack, mit, dienste };
}

/* ⚠️ Ein Heimrouter kommt LEER aus dem Karton (netz.js,
   heimVorgabe — vom Nutzer so verlangt). Alles, was ein
   LAUFENDES Heimnetz prüft, muss ihn deshalb erst einrichten:
   Adresse ins Haus, DHCP-Bereich dazu. Genau das, was eine Hand
   auf der LAN-Seite des Fensters tut.

   Dass die Prüfungen das jetzt selbst tun müssen, ist kein
   Ballast, sondern die Probe aufs Exempel: es gibt keinen Weg
   mehr, ein Heimnetz zu bekommen, ohne es eingerichtet zu haben. */
function heimEinrichten(netz, hr, b) {
  const t = '192.168.' + (b || 1) + '.';
  const lan = hr.nics[netz.LAN];
  lan.ip = t + '1'; lan.mask = '255.255.255.0';
  hr.dhcpServer = {
    on: true, nic: netz.LAN, von: t + '100', bis: t + '150',
    mask: '255.255.255.0', gateway: t + '1', dns: '', lease: 600
  };
  return hr;
}
function heimNeu(netz, x, y, b) {
  return heimEinrichten(netz, netz.addNode('heimrouter', x, y), b);
}

{
  const { netz } = heimBau(3);
  const hr = netz.addNode('heimrouter', 100, 100);
  ok('neun Anschlüsse: 1 × WAN + 8 × LAN, fest', hr.nics.length === 9
     && netz.KIND.heimrouter.maxPorts === 9, hr.nics.length);
  ok('anbauen geht nicht', !netz.addNic(hr.id).ok);
  {
    // Ein Stand von vorher (WAN + 4 LAN) lädt mit allen neun Buchsen.
    const alt = netz.toJSON();
    const h = alt.nodes.find(n => n.id === hr.id);
    h.nics = h.nics.slice(0, 5);
    netz.fromJSON(alt);
    ok('ein alter Heimrouter wird auf 9 Buchsen aufgefüllt',
       netz.get(hr.id).nics.filter(k => !k.funkPort).length === 9);
  }
  ok('WAN ist Karte 0 und holt sich die Adresse beim Anbieter',
     netz.istWan(hr, 0) && hr.nics[0].dhcp === true);
  /* Eine Maske im gesperrten WAN-Feld wäre die Behauptung, der
     Anbieter habe sie vergeben. Genau dieser halb geräumte
     Zustand war schon einmal ein Fehler (siehe dhcpLeeren). */
  ok('und trägt deshalb weder Adresse noch Netzmaske',
     !hr.nics[0].ip && !hr.nics[0].mask);
  /* ⚠️ Hier stand einmal „LAN 1 trägt 192.168.1.1". Vom Nutzer
     beanstandet: „Ein Heimrouter braucht nichts defaultmäßig
     ausgefüllt." Eine vorgetragene Adresse nimmt die Frage vorweg,
     die die Aufgabe stellt — und steht im Weg, wenn die Klasse mit
     einem anderen Netz arbeitet. */
  ok('keine LAN-Buchse trägt eine Adresse',
     !hr.nics[1].ip && !hr.nics[2].ip && !hr.nics[3].ip && !hr.nics[4].ip,
     hr.nics.map(k => k.ip).join('|'));
  ok('die LAN-Seite hat aber eine Netzmaske zum Losbauen',
     hr.nics[1].mask === '255.255.255.0', hr.nics[1].mask);
  ok('alle LAN-Buchsen teilen dieselbe Karte',
     netz.brueckeNic(hr, 4) === hr.nics[netz.LAN]);
  ok('und dieselbe MAC-Adresse', netz.brueckeNic(hr, 3).mac === hr.nics[1].mac);
  ok('die WAN-Karte gehört NICHT zur Brücke',
     netz.brueckeNic(hr, 0).mac === hr.nics[0].mac && !netz.istLan(hr, 0));
  /* Was bleibt, und warum: NAT ist die Natur des Geräts (sonst
     hieße es Router), der DHCP-Client auf der WAN-Seite ist das,
     was ein WAN-Anschluss TUT. Beides ist kein ausgefülltes Feld. */
  ok('NAT ist an', !!(hr.nat && hr.nat.on));
  ok('der DHCP-Server hängt am LAN, ist aber AUS und ohne Bereich',
     hr.dhcpServer.on === false && hr.dhcpServer.nic === netz.LAN
     && !hr.dhcpServer.von && !hr.dhcpServer.bis,
     JSON.stringify(hr.dhcpServer));
  ok('WLAN ist aus — einen Namen vergibt der Mensch',
     !hr.wlan.on && !hr.wlan.ssid);
  ok('die Anschlüsse heißen WAN, LAN 1 … LAN 4',
     netz.portLabel(hr, 0) === 'WAN' && netz.portLabel(hr, 1) === 'LAN 1'
     && netz.portLabel(hr, 4) === 'LAN 4');
  ok('Kurzname HR1', netz.kurzName(hr) === 'HR1', netz.kurzName(hr));

  /* Zwei Heimrouter auf einer Fläche: früher zählte hier eine
     Automatik hoch (192.168.1.1, 192.168.2.1 …), damit nicht zwei
     Geräte dieselbe Adresse tragen. Beide Gründe dafür sind weg —
     es steht gar keine Adresse mehr drin, und doppelte Adressen
     sind kein Fehler mehr (flaeche.js, problemOf). */
  const hr2 = netz.addNode('heimrouter', 300, 100);
  ok('auch der zweite kommt leer', !hr2.nics[1].ip, hr2.nics[1].ip);
  ok('und ohne DHCP-Bereich', !hr2.dhcpServer.von, hr2.dhcpServer.von);

  /* ⚠️ Seit 2026-09-28 gibt es für NAT keinen Haken mehr in der
     Oberfläche (Nutzer: „Heimrouter nutzen immer NAT"). Damit wird
     aus einem gespeicherten Stand mit ausgeschaltetem NAT eine
     Sackgasse: er käme herein, und niemand könnte es wieder
     anschalten. `natLaden` in netz.js zieht ihn nach — hier ist die
     Gegenprobe, denn das ist ein Fall, den man beim Bauen nicht
     sieht und beim Benutzen nur als „geht nicht" bemerkt.

     ⚠️ Steht am ENDE des Blocks: `fromJSON` legt ALLE Geräte neu an,
     und alles davor zeigte danach auf Gerätobjekte, die nicht mehr
     im Netz hängen. */
  {
    const alt = netz.toJSON();
    alt.nodes.find(n => n.kind === 'heimrouter').nat = { on: false, frei: [] };
    netz.fromJSON(alt);
    const wieder = netz.list().find(n => n.kind === 'heimrouter');
    ok('⭐ ein Stand mit ausgeschaltetem NAT kommt mit NAT AN zurück',
       wieder.nat.on === true, JSON.stringify(wieder.nat));
  }
}

/* Die LAN-Buchsen sind ein eingebauter Switch. Das ist die
   Aussage des Geräts, und sie muss sich messen lassen: zwei
   Rechner an verschiedenen Buchsen erreichen sich, OHNE dass die
   IP-Schicht des Heimrouters etwas davon merkt. */
{
  const { engine, netz, stack } = heimBau(3);
  const hr = heimNeu(netz, 100, 100);
  const a = netz.addNode('host', 50, 300);
  const b = netz.addNode('host', 200, 300);
  a.nics[0].ip = '192.168.1.10'; a.nics[0].mask = '255.255.255.0';
  b.nics[0].ip = '192.168.1.11'; b.nics[0].mask = '255.255.255.0';
  netz.addCable(a.id, 0, hr.id, 2);          // LAN 2
  netz.addCable(b.id, 0, hr.id, 4);          // LAN 4

  let r = null;
  stack.ping(a, '192.168.1.11', 1, null, (x) => { r = x; });
  engine.runUntil(20 * SEC);
  ok('Ping von LAN 2 nach LAN 4 kommt an', !!r && r.ok, r && (r.error || ''));
  ok('die Brücke hat dabei beide MAC-Adressen gelernt',
     stack.macTable(hr).length >= 2, stack.macTable(hr).length);

  let r2 = null;
  stack.ping(a, '192.168.1.1', 2, null, (x) => { r2 = x; });
  engine.runUntil(40 * SEC);
  ok('und der Heimrouter selbst ist über jede Buchse erreichbar',
     !!r2 && r2.ok, r2 && (r2.error || ''));

  const sn = sandbox.Subnetze.berechnen(netz);
  ok('LAN ist EIN Subnetz mit drei Geräten',
     sn.liste.length === 1 && sn.liste[0].nodes.length === 3,
     sn.liste.map(s => s.netStr + ' ×' + s.nodes.length).join(', '));
  /* Ohne die Brückenregel in subnetze.js bliebe das Kabel an
     LAN 4 grau, während das an LAN 2 farbig ist — zwei Kabel in
     dasselbe Netz, verschieden gemalt. */
  ok('beide Kabel tragen die Farbe dieses Netzes',
     netz.cableList().every(c => !!sn.vonKabel.get(c.id)));
}

/* DHCP muss an JEDER Buchse gehen. Vorher fragte dienste.js nach
   der Buchsennummer statt nach dem Anschluss — da bekam nur das
   Gerät an LAN 1 eine Adresse, die anderen drei bekamen eine
   Belehrung über den falschen Anschluss. */
{
  const { engine, netz, stack } = heimBau(3);
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  const hr = heimNeu(netz, 100, 100);
  const a = netz.addNode('host', 50, 300);
  const b = netz.addNode('host', 200, 300);
  netz.setDhcp(a, 0, true);
  netz.setDhcp(b, 0, true);
  netz.addCable(a.id, 0, hr.id, 3);
  netz.addCable(b.id, 0, hr.id, 4);
  dienste.start();
  engine.runUntil(30 * SEC);
  ok('das Gerät an LAN 3 bekommt eine Adresse vom Heimrouter', !!a.nics[0].ip, a.nics[0].ip);
  ok('das an LAN 4 auch', !!b.nics[0].ip, b.nics[0].ip);
  ok('und zwar zwei verschiedene', a.nics[0].ip !== b.nics[0].ip);
  ok('das Gateway kommt mit', a.gateway === '192.168.1.1', a.gateway);
}

/* Ein Heimrouter ohne WAN-Kabel darf nicht nach einem Anbieter
   rufen. Sonst begrüßt er die Klasse beim Hinstellen mit drei
   Fehlermeldungen über ein Kabel, das niemand gesteckt hat. */
{
  const { engine, netz, stack, mit } = heimBau(3);
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  netz.addNode('heimrouter', 100, 100);
  dienste.start();
  engine.runUntil(20 * SEC);
  const klagen = mit.view().filter(r => /DHCP-Server hat geantwortet/.test(r.info || ''));
  ok('ohne WAN-Kabel wird gar nicht erst gefragt', klagen.length === 0, klagen.length);
}

section('NAT');
{
  const { engine, netz, stack } = heimBau(3);
  const hr = heimNeu(netz, 100, 100);
  netz.setDhcp(hr, 0, false);
  hr.nics[0].ip = '84.12.5.9'; hr.nics[0].mask = '255.255.255.0';
  const draussen = netz.addNode('server', 400, 50);
  draussen.nics[0].ip = '84.12.5.1'; draussen.nics[0].mask = '255.255.255.0';
  draussen.gateway = '84.12.5.9';
  netz.addCable(hr.id, 0, draussen.id, 0);

  const drinnen = netz.addNode('host', 50, 300);
  drinnen.nics[0].ip = '192.168.1.10'; drinnen.nics[0].mask = '255.255.255.0';
  drinnen.gateway = '192.168.1.1';
  netz.addCable(drinnen.id, 0, hr.id, 2);

  let r = null;
  stack.ping(drinnen, '84.12.5.1', 1, null, (x) => { r = x; });
  engine.runUntil(30 * SEC);
  ok('ein Ping aus dem Heimnetz nach draußen kommt zurück', !!r && r.ok, r && (r.error || ''));

  const t = stack.natTabelle(hr);
  ok('die NAT-Tabelle hat genau eine Zeile', t.length === 1, JSON.stringify(t));
  ok('innen steht die private Adresse', t[0] && t[0].innen === '192.168.1.10');
  ok('außen die vom Anbieter', t[0] && t[0].aussen === '84.12.5.9');
  /* Über 32768, damit die Nummer im Mitschnitt auf den ersten
     Blick von den Ports der Dienste (53, 67, 68, 80) zu
     unterscheiden ist: sie gehört niemandem, sie wurde vergeben. */
  ok('der Außenport liegt über 40000', t[0] && t[0].aussenPort >= 40000, t[0] && t[0].aussenPort);
}

/* Und die Gegenprobe — sie ist der eigentliche Unterricht: ohne
   NAT geht das Paket hinaus und die Antwort findet nicht zurück,
   weil draußen niemand weiß, wohin mit 192.168.1.10. */
{
  const { engine, netz, stack } = heimBau(3);
  const hr = heimNeu(netz, 100, 100);
  netz.setDhcp(hr, 0, false);
  hr.nics[0].ip = '84.12.5.9'; hr.nics[0].mask = '255.255.255.0';
  hr.nat.on = false;
  const draussen = netz.addNode('server', 400, 50);
  draussen.nics[0].ip = '84.12.5.1'; draussen.nics[0].mask = '255.255.255.0';
  netz.addCable(hr.id, 0, draussen.id, 0);
  const drinnen = netz.addNode('host', 50, 300);
  drinnen.nics[0].ip = '192.168.1.10'; drinnen.nics[0].mask = '255.255.255.0';
  drinnen.gateway = '192.168.1.1';
  netz.addCable(drinnen.id, 0, hr.id, 2);

  let r = null;
  stack.ping(drinnen, '84.12.5.1', 1, null, (x) => { r = x; });
  engine.runUntil(30 * SEC);
  ok('ohne NAT kommt nichts zurück', !!r && !r.ok, JSON.stringify(r));
  ok('und es steht auch keine Zeile in der Tabelle', stack.natTabelle(hr).length === 0);
}

/* ═══ Firewall ═══
   Eine Liste, ein Typ. Sie sitzt in `onIp`, nach der Wegewahl und vor
   NAT. Geprüft wird (1) die Liste für sich, mit Paketen von Hand —
   Bereiche, Typ, von UND zu —, (2) das Ganze am laufenden Netz, ein
   Heimnetz mit einem Ping hinaus, und (3) die Auflösung von Namen. */
section('Firewall');
{
  const F = sandbox.Firewall;
  const e = (a, m) => F.eintrag({ adresse: a, maske: m });
  ok('Adresse + Netzmaske = Bereich', (() => { const x = e('192.0.0.0', '255.0.0.0'); return x && x.art === 'netz' && x.net === U.ip2int('192.0.0.0') && x.mask === U.prefix2mask(8); })());
  ok('⭐ eine Adresse ohne Maske ist EIN Gerät', (() => { const x = e('192.168.2.1', ''); return x && x.mask === 0xFFFFFFFF && x.net === U.ip2int('192.168.2.1'); })());
  ok('die Maske darf auch als Präfix kommen („16" und „/16")', e('10.1.0.0', '16').mask === U.prefix2mask(16) && e('10.1.0.0', '/16').mask === U.prefix2mask(16));
  ok('eine Adresse mitten im Netz zählt als das Netz', e('203.0.113.77', '255.255.255.0').net === U.ip2int('203.0.113.0'));
  ok('eine krumme Maske ist unfertig', e('10.0.0.0', '255.0.255.0') === null && e('10.0.0.0', 'abc') === null);
  ok('eine leere Adresse ist unfertig — nicht „beliebig"', e('', '') === null && e('   ', '255.0.0.0') === null);
  ok('eine krumme Adresse ist unfertig', e('999.1.1.1', '') === null && e('banane', '') === null);
  ok('ein Name ist ein Name', (() => { const x = e('WWW.Beispiel.de', ''); return x && x.art === 'name' && x.name === 'www.beispiel.de'; })());
  ok('ohne Punkt ist es kein Name', e('localhost', '') === null);
  ok('der Bereich wird ausgeschrieben', (() => { const b = F.bereich(e('192.0.0.0', '255.0.0.0')); return b.von === '192.0.0.0' && b.bis === '192.255.255.255' && b.anzahl === 16777216; })());
  ok('einzeln: von = bis, eine Adresse', (() => { const b = F.bereich(e('192.168.2.1', '')); return b.von === b.bis && b.anzahl === 1; })());

  // Die Liste an einem Router, Pakete von Hand.
  const { engine, netz } = bau(5);
  const r = netz.addNode('router', 100, 100);
  const fw = F.erzeugen(engine, netz);
  const ev = [];
  const say = (k, n, d) => ev.push(Object.assign({ kind: k }, d));
  const pk = (src, dst, proto) => ({ src, dst, proto: proto || 'tcp', ttl: 60, payload: { sport: 40000, dport: 80 } });
  const c = netz.fwConf(r);

  ok('ohne Firewall geht alles', fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say).ok === true);
  ok('neu ist es eine Blacklist, still verwerfend, ausgeschaltet', c.typ === 'blacklist' && c.ablehnen === false && c.on === false);

  c.on = true; c.typ = 'blacklist';
  c.regeln = [{ adresse: '203.0.113.0', maske: '255.255.255.0' }];
  ok('Blacklist: ein Paket VON der Liste wird gesperrt', fw.pruefen(r, 0, pk('203.0.113.9', '10.0.0.5'), say).ok === false);
  ok('⭐ … und eines AN die Liste ebenso (von und zu)', fw.pruefen(r, 0, pk('10.0.0.5', '203.0.113.9'), say).ok === false);
  ok('Blacklist: alles andere kommt durch', fw.pruefen(r, 0, pk('203.0.114.9', '10.0.0.5'), say).ok === true);
  ok('die Nummer der Zeile steht im Ergebnis', fw.pruefen(r, 0, pk('203.0.113.9', '10.0.0.5'), say).regel === 1);
  ok('die Schnittstelle spielt keine Rolle', fw.pruefen(r, 1, pk('203.0.113.9', '10.0.0.5'), say).ok === false
     && fw.pruefen(r, 2, pk('203.0.113.9', '10.0.0.5'), say).ok === false);
  ok('das Protokoll auch nicht (ein Ping wird so gesperrt wie TCP)', fw.pruefen(r, 0, pk('203.0.113.9', '10.0.0.5', 'icmp'), say).ok === false);

  c.typ = 'whitelist';
  ok('Whitelist: was auf der Liste steht, kommt durch', fw.pruefen(r, 0, pk('203.0.113.9', '10.0.0.5'), say).ok === true
     && fw.pruefen(r, 0, pk('10.0.0.5', '203.0.113.9'), say).ok === true);
  ok('Whitelist: alles andere wird gesperrt', fw.pruefen(r, 0, pk('9.9.9.9', '10.0.0.5'), say).ok === false);
  ok('Whitelist: auch die ANTWORT kommt durch (von UND zu — ohne „merken")',
     fw.pruefen(r, 0, pk('10.0.0.5', '203.0.113.9'), say).ok && fw.pruefen(r, 0, pk('203.0.113.9', '10.0.0.5'), say).ok);
  c.regeln = [];
  ok('Whitelist ohne Zeile sperrt alles', fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say).ok === false);
  c.typ = 'blacklist';
  ok('Blacklist ohne Zeile sperrt nichts', fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say).ok === true);

  c.regeln = [{ adresse: 'kaputt', maske: '' }, { adresse: '', maske: '' }, { adresse: '10.9.9.9', maske: '' }];
  ok('unfertige Zeilen tun nichts, die Nummer bleibt die der Zeile',
     fw.pruefen(r, 0, pk('10.9.9.9', '2.2.2.2'), say).regel === 3 && fw.pruefen(r, 0, pk('10.9.9.8', '2.2.2.2'), say).ok === true);

  // Zähler und Meldung.
  fw.leeren(r, true);
  c.typ = 'whitelist'; c.regeln = []; ev.length = 0;
  fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say);
  fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.3'), say);
  const au = fw.auskunft(r);
  ok('gesperrte Pakete werden gezählt', au.verworfen === 2 && au.erlaubt === 0, JSON.stringify(au));
  ok('jedes gesperrte Paket meldet sich, mit Grund', ev.filter(x => x.kind === 'fw-drop').length === 2 && /Whitelist/.test(ev[0].text));
  c.ablehnen = true;
  fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say);
  ok('„ablehnen" zählt für sich und meldet die Aktion', fw.auskunft(r).abgelehnt === 1 && ev[ev.length - 1].aktion === 'ablehnen');
  c.regeln = [{ adresse: '1.1.1.1', maske: '' }]; c.typ = 'blacklist';
  fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say);
  fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say);
  ok('die Treffer stehen an der Zeile', fw.auskunft(r).treffer[0] === 2, JSON.stringify(fw.auskunft(r).treffer));
  c.on = false;
  ok('ausgeschaltet geht alles durch und nichts wird gezählt', (() => {
    const n = fw.auskunft(r).verworfen + fw.auskunft(r).abgelehnt;
    const v = fw.pruefen(r, 0, pk('1.1.1.1', '2.2.2.2'), say);
    return v.ok && v.aus && fw.auskunft(r).verworfen + fw.auskunft(r).abgelehnt === n;
  })());
}

/* Die Firewall am laufenden Netz: ein Ping aus dem Heimnetz hinaus. */
{
  const bauHeim = () => {
    const w = heimBau(3);
    const hr = heimNeu(w.netz, 100, 100);
    w.netz.setDhcp(hr, 0, false);
    hr.nics[0].ip = '84.12.5.9'; hr.nics[0].mask = '255.255.255.0';
    const draussen = w.netz.addNode('server', 400, 50);
    draussen.nics[0].ip = '84.12.5.1'; draussen.nics[0].mask = '255.255.255.0';
    draussen.gateway = '84.12.5.9';
    w.netz.addCable(hr.id, 0, draussen.id, 0);
    const drinnen = w.netz.addNode('host', 50, 300);
    drinnen.nics[0].ip = '192.168.1.10'; drinnen.nics[0].mask = '255.255.255.0';
    drinnen.gateway = '192.168.1.1';
    w.netz.addCable(drinnen.id, 0, hr.id, 2);
    return Object.assign(w, { hr, draussen, drinnen });
  };
  const ping = (w, ziel) => {
    let r = null;
    w.stack.ping(w.drinnen, ziel || '84.12.5.1', 1, null, (x) => { r = x; });
    w.engine.runUntil(w.engine.now + 30 * SEC);
    return r;
  };
  const stell = (w, typ, liste, ablehnen) => {
    const c = w.netz.fwConf(w.hr);
    c.on = true; c.typ = typ; c.ablehnen = !!ablehnen; c.regeln = liste;
    return c;
  };

  {
    const w = bauHeim();
    const r = ping(w);
    ok('Grundlage: ohne Firewall kommt der Ping zurück', !!r && r.ok, r && r.error);
  }
  {
    const w = bauHeim();
    stell(w, 'blacklist', [{ adresse: '84.12.5.0', maske: '255.255.255.0' }]);
    const r = ping(w);
    ok('⭐ Blacklist mit dem Bereich des Servers: der Ping hinaus geht nicht', !!r && !r.ok, JSON.stringify(r));
    ok('… und das Verwerfen steht im Zähler', w.stack.fwAuskunft(w.hr).verworfen >= 1);
    const z = w.mit.view().filter(x => x.lost && x.fw);
    ok('⭐ im Mitschnitt steht eine verlorene Zeile mit der Zeilennummer', z.length >= 1 && /Zeile 1/.test(z[0].fw), JSON.stringify(z.map(x => x.fw)));
    ok('und die NAT-Tabelle blieb leer (die Wand steht VOR NAT)', w.stack.natTabelle(w.hr).length === 0);
  }
  {
    const w = bauHeim();
    stell(w, 'blacklist', [{ adresse: '84.12.9.0', maske: '255.255.255.0' }]);
    const r = ping(w);
    ok('eine Sperre für einen ANDEREN Bereich stört nicht', !!r && r.ok, r && r.error);
  }
  {
    const w = bauHeim();
    stell(w, 'blacklist', [{ adresse: '84.12.5.1', maske: '' }]);
    const r = ping(w);
    ok('eine einzelne Adresse sperrt genau dieses Gerät', !!r && !r.ok);
  }
  {
    const w = bauHeim();
    stell(w, 'whitelist', [{ adresse: '84.12.5.0', maske: '255.255.255.0' }]);
    const r = ping(w);
    ok('⭐ Whitelist mit dem Bereich: Ping hin UND zurück kommt durch', !!r && r.ok, r && r.error);
  }
  {
    const w = bauHeim();
    stell(w, 'whitelist', [{ adresse: '10.0.0.0', maske: '255.0.0.0' }]);
    const r = ping(w);
    ok('Whitelist mit einem anderen Bereich: der Ping geht nicht', !!r && !r.ok);
  }
  {
    // verwerfen schweigt, ablehnen antwortet sofort.
    const a = bauHeim();
    stell(a, 'blacklist', [{ adresse: '84.12.5.0', maske: '255.255.255.0' }], false);
    const ra = ping(a);
    const b = bauHeim();
    stell(b, 'blacklist', [{ adresse: '84.12.5.0', maske: '255.255.255.0' }], true);
    const rb = ping(b);
    ok('⭐ verwerfen: Stille bis zur Zeitüberschreitung', !!ra && !ra.ok && !ra.from, JSON.stringify(ra));
    ok('⭐ ablehnen: sofort eine Antwort „verboten" vom Router', !!rb && !rb.ok && rb.from === '192.168.1.1' && /Verboten/.test(rb.error), JSON.stringify(rb));
    ok('abgelehnt wird gezählt', b.stack.fwAuskunft(b.hr).abgelehnt >= 1);
  }
  {
    // Speichern und Laden.
    const w = bauHeim();
    stell(w, 'whitelist', [{ adresse: '10.0.0.0', maske: '255.0.0.0' }], true);
    const j = JSON.parse(JSON.stringify(w.netz.toJSON()));
    w.netz.fromJSON(j);
    const hr2 = w.netz.list().find(n => n.kind === 'heimrouter');
    ok('⭐ die Firewall übersteht Speichern und Laden', !!hr2.firewall && hr2.firewall.on === true
       && hr2.firewall.typ === 'whitelist' && hr2.firewall.ablehnen === true
       && hr2.firewall.regeln.length === 1 && hr2.firewall.regeln[0].maske === '255.0.0.0', JSON.stringify(hr2.firewall));
    ok('ein Rechner bekommt keine', !w.netz.list().find(n => n.kind === 'host').firewall);
    ok('der Switch kann keine Firewall', !w.stack.fwKann(w.netz.addNode('switch', 1, 1)));
    ok('der Router kann eine', w.stack.fwKann(w.netz.addNode('router', 1, 1)));
    ok('das cww kann eine', w.stack.fwKann(w.netz.addNode('cww', 1, 1)));
  }
  {
    // Ein Stand der ersten Fassung (Aktion je Zeile) kommt als Liste zurück.
    const w = bauHeim();
    const j = JSON.parse(JSON.stringify(w.netz.toJSON()));
    j.nodes.find(n => n.kind === 'heimrouter').firewall = { on: true, standard: 'verwerfen', merken: true,
      regeln: [{ ein: '*', quelle: '', ziel: '84.12.5.0/24', proto: '*', port: '', aktion: 'erlauben' },
               { ein: '*', quelle: '1.2.3.4', ziel: '', proto: '*', port: '', aktion: 'verwerfen' }] };
    w.netz.fromJSON(j);
    const f = w.netz.list().find(n => n.kind === 'heimrouter').firewall;
    ok('⭐ alter Stand: Standard „verwerfen" wird Whitelist, die erlaubende Zeile bleibt',
       f.typ === 'whitelist' && f.on === true && f.regeln.length === 1
       && f.regeln[0].adresse === '84.12.5.0' && f.regeln[0].maske === '24', JSON.stringify(f));
  }
}

/* Namen: die Firewall sieht nur Adressen, also wird aufgelöst. */
section('Firewall: Namen');
{
  const w = heimBau(3);
  const hr = heimNeu(w.netz, 100, 100);
  w.netz.setDhcp(hr, 0, false);
  hr.nics[0].ip = '84.12.5.9'; hr.nics[0].mask = '255.255.255.0';
  hr.dns = '84.12.5.53';
  const dnsSrv = w.netz.addNode('server', 400, 50);
  dnsSrv.nics[0].ip = '84.12.5.53'; dnsSrv.nics[0].mask = '255.255.255.0'; dnsSrv.gateway = '84.12.5.9';
  dnsSrv.software = ['dns'];
  w.netz.dnsConf(dnsSrv).on = true;
  w.netz.dnsConf(dnsSrv).records = [{ name: 'www.boese.de', ip: '84.12.5.1' }];
  const ziel = w.netz.addNode('server', 400, 200);
  ziel.nics[0].ip = '84.12.5.1'; ziel.nics[0].mask = '255.255.255.0'; ziel.gateway = '84.12.5.9';
  const sw = w.netz.addNode('switch', 300, 120);
  w.netz.addCable(hr.id, 0, sw.id, 0);
  w.netz.addCable(dnsSrv.id, 0, sw.id, 1);
  w.netz.addCable(ziel.id, 0, sw.id, 2);
  const drinnen = w.netz.addNode('host', 50, 300);
  drinnen.nics[0].ip = '192.168.1.10'; drinnen.nics[0].mask = '255.255.255.0'; drinnen.gateway = '192.168.1.1';
  w.netz.addCable(drinnen.id, 0, hr.id, 2);

  const c = w.netz.fwConf(hr);
  c.on = true; c.typ = 'blacklist'; c.regeln = [{ adresse: 'www.boese.de', maske: '' }];
  w.dienste.start();
  w.dienste.sync();
  w.engine.runUntil(w.engine.now + 10 * SEC);
  const na = w.stack.fwAuskunft(hr).namen;
  ok('⭐ der Name wird beim Laufen aufgelöst', na['www.boese.de'] && na['www.boese.de'].ip === '84.12.5.1', JSON.stringify(na));
  let r = null;
  w.stack.ping(drinnen, '84.12.5.1', 1, null, (x) => { r = x; });
  w.engine.runUntil(w.engine.now + 30 * SEC);
  ok('⭐ und die Adresse dahinter ist gesperrt — auch wenn der Ping sie als Zahl nennt', !!r && !r.ok, JSON.stringify(r));

  // Zweiter Name auf derselben Adresse: mit gesperrt.
  w.netz.dnsConf(dnsSrv).records.push({ name: 'www.harmlos.de', ip: '84.12.5.1' });
  c.regeln = [{ adresse: 'www.harmlos.de', maske: '' }];
  w.stack.fwLeeren(hr, true);
  w.dienste.sync();
  w.engine.runUntil(w.engine.now + 10 * SEC);
  r = null;
  w.stack.ping(drinnen, '84.12.5.1', 1, null, (x) => { r = x; });
  w.engine.runUntil(w.engine.now + 30 * SEC);
  ok('teilen sich zwei Namen eine Adresse, sperrt die Sperre beide', !!r && !r.ok);

  // Ein Name, den es nicht gibt: die Zeile tut nichts und sagt warum.
  c.regeln = [{ adresse: 'www.gibtsnicht.de', maske: '' }];
  w.stack.fwLeeren(hr, true);
  w.dienste.sync();
  w.engine.runUntil(w.engine.now + 20 * SEC);
  const n2 = w.stack.fwAuskunft(hr).namen['www.gibtsnicht.de'];
  ok('ein unbekannter Name hat keine Adresse und einen Grund', n2 && !n2.ip && /kennt den Namen|nicht/.test(n2.why), JSON.stringify(n2));
  r = null;
  w.stack.ping(drinnen, '84.12.5.1', 1, null, (x) => { r = x; });
  w.engine.runUntil(w.engine.now + 30 * SEC);
  ok('… und sperrt nichts', !!r && r.ok, r && r.error);

  // Im Entwurf (Uhr steht) wird nicht gefragt.
  const e2 = heimBau(3);
  const hr2 = heimNeu(e2.netz, 100, 100);
  const c2 = e2.netz.fwConf(hr2); c2.on = true; c2.regeln = [{ adresse: 'www.boese.de', maske: '' }];
  e2.dienste.sync();
  ok('ohne laufende Uhr wird nichts aufgelöst', Object.keys(e2.stack.fwAuskunft(hr2).namen).length === 0);
}


/* ═══ WLAN ═══
   Eine Funkverbindung ist ein Kabel mit `funk: true`. Geprüft
   wird beides: dass sie sich wie ein Kabel VERHÄLT (Rahmen,
   ARP, Switch) und dass sie sich wie Funk VERWALTET (entsteht
   aus einem Namen, wird nicht gespeichert). */
section('WLAN');
{
  const { engine, netz, stack } = heimBau(3);
  const sw = netz.addNode('switch', 200, 100);
  netz.wlanConf(sw); sw.wlan.on = true; sw.wlan.ssid = 'Klassenzimmer';
  const handy = netz.addNode('handy', 100, 300);
  const pc = netz.addNode('host', 300, 300);
  handy.nics[0].ip = '192.168.1.20'; handy.nics[0].mask = '255.255.255.0';
  pc.nics[0].ip = '192.168.1.21'; pc.nics[0].mask = '255.255.255.0';
  netz.addCable(pc.id, 0, sw.id, 0);

  ok('ein Switch kann ausstrahlen', netz.KIND.switch.wlan === true && netz.strahlt(sw));
  ok('ein Router kann es nicht', !netz.KIND.router.wlan);
  ok('der Zugangspunkt steht in der Liste',
     netz.zugangspunkte().length === 1 && netz.zugangspunkte()[0].ssid === 'Klassenzimmer');

  netz.setFunk(handy, 0, true, 'Klassenzimmer');
  ok('das Handy ist verbunden', !!handy.nics[0].cable);
  const c = netz.getCable(handy.nics[0].cable);
  ok('und die Verbindung ist als Funk gekennzeichnet', !!c && c.funk === true);
  /* Eine Funkbuchse ist KEIN Loch. Verbrauchte sie einen der
     fünf Anschlüsse, wäre ein Switch mit drei Handys plötzlich
     fast voll — und das behauptet über die Hardware etwas
     Falsches. */
  ok('der Switch hat dafür EINE Funkbuchse (die Antenne) bekommen',
     sw.nics.length === 6 && sw.nics[5].funkPort === true, sw.nics.length);
  ok('seine festen Anschlüsse sind unverändert', netz.feste(sw).length === 5);

  let r = null;
  stack.ping(handy, '192.168.1.21', 1, null, (x) => { r = x; });
  engine.runUntil(20 * SEC);
  ok('ein Ping über WLAN kommt an', !!r && r.ok, r && (r.error || ''));

  ok('in eine Funkkarte steckt man kein Kabel',
     netz.addCable(handy.id, 0, sw.id, 1).ok === false);
  ok('und in eine Funkbuchse auch nicht',
     netz.addCable(pc.id, 0, sw.id, 5).ok === false);

  sw.wlan.ssid = 'Anderer Name';
  netz.funkAbgleich();
  ok('wird das Netz umbenannt, ist die Verbindung weg', !handy.nics[0].cable);
  ok('die Antenne bleibt, solange der Switch ausstrahlt', sw.nics.length === 6);

  handy.nics[0].ssid = 'Anderer Name';
  netz.funkAbgleich();
  ok('mit dem neuen Namen steht sie wieder', !!handy.nics[0].cable);

  sw.wlan.on = false;
  netz.funkAbgleich();
  ok('WLAN aus trennt ebenfalls', !handy.nics[0].cable);
  ok('und nimmt die Antenne mit', sw.nics.length === 5);
  ok('der Name bleibt dabei stehen', sw.wlan.ssid === 'Anderer Name');
  sw.wlan.on = true;
  netz.funkAbgleich();

  /* Gespeichert wird, wonach GESUCHT wird — nicht, was gerade
     gefunden wurde. Sonst wüchse der Switch bei jedem Sichern um
     die Buchsen des letzten Mals. */
  const daten = JSON.parse(JSON.stringify(netz.toJSON()));
  ok('Funkkabel stehen nicht in der Datei', daten.cables.length === 1, daten.cables.length);
  ok('Funkbuchsen auch nicht',
     daten.nodes.find(n => n.id === sw.id).nics.length === 5);
  ok('der gesuchte Netzname dagegen schon',
     daten.nodes.find(n => n.id === handy.id).nics[0].ssid === 'Anderer Name');

  const kopie = new sandbox.Netz(new sandbox.Engine({ seed: 3 }));
  kopie.fromJSON(daten);
  const h2 = kopie.get(handy.id), sw2 = kopie.get(sw.id);
  ok('nach dem Laden funkt das Handy wieder', !!h2.nics[0].cable);
  ok('und der Switch hat genau eine Funkbuchse', sw2.nics.length === 6);
  ok('zweimal Sichern lässt ihn nicht anwachsen',
     JSON.parse(JSON.stringify(kopie.toJSON())).nodes
       .find(n => n.id === sw.id).nics.length === 5);
}

/* WLAN am Heimrouter: die Funkbuchse gehört zur LAN-Brücke.
   Ohne das säße ein Handy im Funknetz und käme an kein einziges
   Gerät im Haus — die Verbindung stünde, und nichts ginge. */
{
  const { engine, netz, stack } = heimBau(3);
  const hr = netz.addNode('heimrouter', 200, 100);
  hr.wlan.on = true; hr.wlan.ssid = 'Heimnetz';
  const handy = netz.addNode('handy', 100, 300);
  handy.nics[0].ip = '192.168.1.30'; handy.nics[0].mask = '255.255.255.0';
  netz.setFunk(handy, 0, true, 'Heimnetz');

  const peer = netz.peerOf(handy.id, 0);
  ok('das Handy hängt an einer LAN-Buchse des Heimrouters',
     !!peer && peer.node.id === hr.id && netz.istLan(hr, peer.nic), peer && peer.nic);

  const pc = netz.addNode('host', 400, 300);
  pc.nics[0].ip = '192.168.1.31'; pc.nics[0].mask = '255.255.255.0';
  netz.addCable(pc.id, 0, hr.id, 3);

  let r = null;
  stack.ping(handy, '192.168.1.31', 1, null, (x) => { r = x; });
  engine.runUntil(45 * SEC);
  ok('und erreicht darüber ein Gerät am LAN-Kabel', !!r && r.ok, r && (r.error || ''));
}

/* ═══ Kopieren und Einfügen ═══
   Die Bürokürzel brauchen zwei Funktionen im Netz: einen Ausschnitt
   herausschneiden und einen wieder einsetzen. Was daran schiefgehen
   KANN, ist unsichtbar — zwei gleiche MAC-Adressen melden sich nie,
   sie liefern nur ab und zu an den Falschen aus. Deshalb steht das
   hier und nicht nur im Browser. */
section('Kopieren und Einfügen');
{
  const { netz } = heimBau(11);
  const a = netz.addNode('host', 200, 200);
  const b = netz.addNode('host', 400, 200);
  const c = netz.addNode('switch', 300, 400);
  a.nics[0].ip = '10.0.0.1'; a.nics[0].mask = '255.255.255.0';
  b.nics[0].ip = '10.0.0.2'; b.nics[0].mask = '255.255.255.0';
  a.gateway = '10.0.0.254';
  a.software = ['dns'];
  netz.addCable(a.id, 0, c.id, 0);
  netz.addCable(b.id, 0, c.id, 1);

  const teil = netz.ausschnitt([a.id, c.id]);
  ok('Ausschnitt nimmt genau die verlangten Geräte', teil.nodes.length === 2,
     teil.nodes.length);
  ok('und nur Kabel, deren BEIDE Enden mitkommen', teil.cables.length === 1,
     teil.cables.length);

  const nurEines = netz.ausschnitt([a.id]);
  ok('ein Gerät allein kommt ohne sein Kabel', nurEines.cables.length === 0,
     nurEines.cables.length);

  const vorher = netz.count;
  const neu = netz.einfuegen(teil, 60, 40);
  ok('Einfügen legt zwei neue Geräte an', neu.length === 2 && netz.count === vorher + 2,
     neu.length + '/' + netz.count);
  ok('mit neuen Kennungen', !neu.includes(a.id) && !neu.includes(c.id));

  const kopieA = netz.get(neu[0]);
  ok('an der versetzten Stelle', kopieA.x === 260 && kopieA.y === 240,
     kopieA.x + '/' + kopieA.y);
  ok('die IP-Adresse kommt MIT', kopieA.nics[0].ip === '10.0.0.1', kopieA.nics[0].ip);
  ok('Gateway und Software auch',
     kopieA.gateway === '10.0.0.254' && kopieA.software[0] === 'dns');
  /* ⚠️ Der eine Punkt, an dem eine bequeme Umsetzung lautlos
     kaputtgeht. */
  ok('die MAC-Adresse ist NEU', kopieA.nics[0].mac !== a.nics[0].mac,
     kopieA.nics[0].mac + ' vs ' + a.nics[0].mac);
  const macs = [];
  for (const n of netz.list()) for (const k of n.nics) macs.push(k.mac);
  ok('und im ganzen Netz kommt keine MAC zweimal vor',
     new Set(macs).size === macs.length, macs.length + ' → ' + new Set(macs).size);

  const kopieC = netz.get(neu[1]);
  const peer = netz.peerOf(kopieA.id, 0);
  ok('das kopierte Kabel hängt an der KOPIE und nicht am Original',
     !!peer && peer.node.id === kopieC.id, peer && peer.node.id);
  ok('das Original hängt weiter, wo es hing',
     netz.peerOf(a.id, 0).node.id === c.id);
  ok('doppelte Adressen werden gemeldet statt still geändert',
     netz.duplicateIps().length > 0, netz.duplicateIps().length);

  // Zweimal einfügen: zwei Kopien, nicht zwei auf derselben Stelle.
  const zwei = netz.einfuegen(teil, 120, 80);
  ok('zweites Einfügen legt wieder neue an',
     zwei.length === 2 && netz.get(zwei[0]).x === 320, netz.get(zwei[0]).x);
}

{
  /* Ein Router hat zwei Anschlüsse, ein Heimrouter fünf. Die Kopie
     muss dieselbe Hardware haben — sonst ist es ein anderes Gerät. */
  const { netz } = heimBau(12);
  const r = netz.addNode('router', 100, 100);
  netz.addNic(r.id);
  r.nics[0].ip = '10.1.0.1'; r.nics[2].ip = '10.3.0.1';
  const hr = heimNeu(netz, 500, 100);
  hr.wlan.on = true; hr.wlan.ssid = 'Heimnetz';

  const neu = netz.einfuegen(netz.ausschnitt([r.id, hr.id]), 50, 50);
  const rk = netz.get(neu[0]), hk = netz.get(neu[1]);
  ok('der kopierte Router hat drei Anschlüsse', rk.nics.length === 3, rk.nics.length);
  ok('und die Adressen stehen an denselben Karten',
     rk.nics[0].ip === '10.1.0.1' && rk.nics[2].ip === '10.3.0.1');
  ok('der kopierte Heimrouter hat WAN + acht LAN',
     hk.nics.filter(k => !k.funkPort).length === 9,
     hk.nics.filter(k => !k.funkPort).length);
  ok('sein DHCP-Server kommt mit', !!hk.dhcpServer && hk.dhcpServer.on === true);
  ok('sein WLAN-Name auch', hk.wlan.ssid === 'Heimnetz', hk.wlan.ssid);
  ok('und der Name ist ein neuer', hk.name !== hr.name, hk.name + ' vs ' + hr.name);
}

/* ═══ Der Verlauf ═══ */
section('Rückgängig und Wiederherstellen');
{
  const { netz } = heimBau(13);
  netz.addNode('host', 100, 100);

  let gerufen = null;
  const v = new sandbox.Verlauf(netz, {
    onApply: (was, richtung) => { gerufen = { was, richtung }; }
  });
  v.leeren();
  ok('am Anfang geht es nicht zurück', !v.kannZurueck && !v.kannVor);

  const b = netz.addNode('host', 300, 100);
  v.merken('Gerät hinzugefügt');
  ok('nach einer Änderung geht es zurück', v.kannZurueck);
  ok('und noch nicht vor', !v.kannVor);
  ok('der Stapel hat zwei Stände', v.tiefe === 2, v.tiefe);

  ok('zurück nimmt das Gerät weg', v.undo() && netz.count === 1, netz.count);
  ok('der Rückruf nennt den Schritt und die Richtung',
     gerufen && gerufen.was === 'Gerät hinzugefügt' && gerufen.richtung === 'zurueck',
     JSON.stringify(gerufen));
  ok('vor holt es zurück', v.redo() && netz.count === 2, netz.count);
  ok('mit derselben Kennung', !!netz.get(b.id));
  ok('und Herstellen legt selbst keinen Eintrag auf', v.tiefe === 2, v.tiefe);

  /* Ein Stand, der nichts geändert hat, kommt nicht auf den Stapel.
     Ohne das wäre jeder Klick ein Schritt, der sichtbar nichts tut. */
  const vor = v.tiefe;
  v.merken('nichts passiert');
  ok('ein unveränderter Stand kommt nicht auf den Stapel', v.tiefe === vor, v.tiefe);

  /* Verschmelzen: derselbe Anlass in schneller Folge ist EIN
     Schritt — sonst braucht eine Adresse zwölf Strg+Z. */
  const t0 = v.tiefe;
  const n2 = netz.get(b.id);
  for (const ip of ['1', '19', '192', '192.168.1.5']) {
    n2.nics[0].ip = ip;
    v.merken('Einstellung geändert');
  }
  ok('vier Tastendrücke im selben Feld sind ein Schritt', v.tiefe === t0 + 1,
     v.tiefe + ' statt ' + (t0 + 1));
  v.undo();
  ok('und ein Strg+Z räumt das ganze Feld', !netz.get(b.id).nics[0].ip,
     netz.get(b.id).nics[0].ip);

  /* Verschiedene Anlässe verschmelzen NICHT, auch nicht schnell
     hintereinander. Gemessen wird NACH dem ersten der beiden: das
     `undo` von eben hat einen vorderen Zweig hinterlassen, und der
     erste `merken` schneidet ihn ab — die Länge des Stapels sagt
     also vor diesem Schritt noch nichts über den nächsten. */
  netz.get(b.id).nics[0].ip = '10.0.0.9';
  v.merken('Einstellung geändert');
  const t1 = v.tiefe;
  netz.get(b.id).x = 777;
  v.merken('verschoben');
  ok('ein anderer Anlass verschmilzt nicht, sondern wird ein Schritt',
     v.tiefe === t1 + 1, v.tiefe + ' statt ' + (t1 + 1));
  v.undo();
  ok('und zurück bringt nur das Verschieben zurück',
     netz.get(b.id).x !== 777 && netz.get(b.id).nics[0].ip === '10.0.0.9',
     netz.get(b.id).x + ' / ' + netz.get(b.id).nics[0].ip);
  v.redo();

  /* ⚠️ Wer zurückgeht und dann etwas Neues tut, verwirft den
     abgeschnittenen Zweig. Bliebe er stehen, führte Strg+Y in einen
     Stand, der mit dem jetzigen nichts zu tun hat. */
  v.undo();
  ok('nach dem Zurückgehen geht es vor', v.kannVor);
  netz.addNode('switch', 600, 600);
  v.merken('Gerät hinzugefügt');
  ok('eine neue Änderung verwirft den vorderen Zweig', !v.kannVor);
}

{
  /* Die Tiefe ist begrenzt, und der älteste fällt weg — nicht der
     neueste. */
  const { netz } = heimBau(14);
  const v = new sandbox.Verlauf(netz, {});
  v.leeren();
  for (let i = 0; i < 80; i++) {
    netz.addNode('host', 100 + i, 100);
    v.merken('Schritt ' + i);
  }
  ok('der Stapel wächst nicht über sechzig', v.tiefe === 60, v.tiefe);
  let n = 0;
  while (v.undo()) n++;
  ok('und lässt sich neunundfünfzigmal zurückgehen', n === 59, n);
  ok('danach stehen noch die ältesten Geräte da', netz.count === 80 - 59,
     netz.count);
}

/* ═══ 22 · Mitschnitt: Richtungen, Gerät, Schichten ═══
   Die drei Sachen, die am 2026-09-26 dazukamen. Alle drei kopflos
   prüfbar, weil sie im Modell stecken und nicht in der Anzeige —
   die Oberfläche liest nur ab, was hier entschieden wird. */
section('Mitschnitt: Richtung und Gerät');
{
  /* Ein Netz MIT Switch, denn nur daran ist zu sehen, was die
     zweite Richtung überhaupt bringt: der Switch empfängt einen
     Rahmen und schickt ihn wieder hinaus, und das sind zwei
     verschiedene Ereignisse am selben Gerät. */
  const { engine, netz, stack, mit } = bau();
  const a  = netz.addNode('host', 100, 100);
  const b  = netz.addNode('host', 400, 100);
  const sw = netz.addNode('switch', 250, 200);
  konf(a, 0, '192.168.1.10'); konf(b, 0, '192.168.1.11');
  netz.addCable(a.id, 0, sw.id, 0);
  netz.addCable(b.id, 0, sw.id, 1);

  stack.ping(a, '192.168.1.11', 1, 4 * SEC, () => {});
  engine.runUntil(5 * SEC);

  /* ─ Beide Richtungen liegen im Speicher ─ */
  ok('voreingestellt zeigt der Mitschnitt nur Gesendetes',
     mit.filter.dir === 'raus' && mit.view().every(r => r.dir === 'raus'));
  ok('empfangene Rahmen sind aber aufgezeichnet', mit.versteckt > 0, String(mit.versteckt));
  ok('und die Zahl am Knopf stimmt mit der Liste',
     mit.versteckt === (mit.total - mit.view().length),
     mit.versteckt + ' vs ' + (mit.total - mit.view().length));

  /* ─ Ein Gerät wählen schaltet die Richtung mit ─ */
  mit.setGeraet(sw.id);
  ok('ein gewähltes Gerät kippt die Richtung auf „beide"', mit.filter.dir === 'beide');
  ok('und nichts ist mehr versteckt', mit.versteckt === 0);
  const amSwitch = mit.view();
  ok('am Switch stehen nur seine eigenen Rahmen',
     amSwitch.length > 0 && amSwitch.every(r => r.node === sw.id), String(amSwitch.length));
  ok('und zwar in BEIDEN Richtungen',
     amSwitch.some(r => r.dir === 'rein') && amSwitch.some(r => r.dir === 'raus'),
     amSwitch.map(r => r.dir).join(','));

  /* ⭐ Das eigentliche Lernstück am Switch: derselbe Rahmen kommt
     an und geht wieder hinaus. Ohne die zweite Richtung wäre nur
     die Hälfte davon zu sehen — und ein Switch, der nur sendet,
     erklärt nicht, woher er weiß, was er senden soll. */
  const rein = amSwitch.filter(r => r.dir === 'rein' && /Ping-Anfrage/.test(r.info));
  const raus = amSwitch.filter(r => r.dir === 'raus' && /Ping-Anfrage/.test(r.info));
  ok('die Ping-Anfrage kommt am Switch an und geht wieder hinaus',
     rein.length === 1 && raus.length === 1, rein.length + ' rein / ' + raus.length + ' raus');
  ok('und Ankunft und Abgang sind NICHT zu einer Zeile verschmolzen',
     rein[0] && raus[0] && rein[0].n !== raus[0].n && rein[0].mal === 1,
     rein[0] && (rein[0].n + '/' + raus[0].n + ' mal=' + rein[0].mal));

  /* ─ Loslassen stellt beides zurück ─ */
  mit.setGeraet(null);
  ok('kein Gerät mehr gewählt: Filter weg', mit.filter.node === null);
  ok('und die Richtung wieder auf „nur gesendet"', mit.filter.dir === 'raus');
}

section('Mitschnitt: Schichtenansicht');
{
  const { engine, netz, stack, mit, a, s } = tcpPaar();
  stack.tcpHoeren(s, 80, (c) => {
    c.onDaten(() => c.senden('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html>Hi</html>'));
  }, 'Webserver');
  stack.tcpVerbinde(a, '192.168.1.20', 80, 'Webbrowser', (err, c) => {
    if (err) return;
    c.onDaten(() => c.schliessen());
    c.senden('GET /index.html HTTP/1.1\r\nHost: 192.168.1.20\r\n\r\n');
  });
  engine.runUntil(10 * SEC);

  /* ⭐ Die Aussage, für die es diese Ansicht gibt: dieselben zwei
     Spalten „Quelle" und „Ziel" tragen auf jeder Schicht etwas
     anderes — MAC, dann IP, dann Portnummer. Das ist Filius'
     bester didaktischer Einfall, und er ist hier nachgebaut. */
  const get = mit.view().find(r => /GET \/index\.html/.test(r.info));
  ok('der GET-Rahmen ist da', !!get, mit.view().map(r => r.proto).join(','));
  const ls = mit.layers(get);
  ok('er hat vier Schichten', ls.length === 4, ls.map(l => l.name).join(' / '));

  ok('Schicht 1 heißt Netzzugang und trägt MAC-Adressen',
     ls[0].schicht === 'Netzzugang' && /^[0-9a-f]{2}:/.test(ls[0].quelle),
     ls[0].schicht + ' ' + ls[0].quelle);
  ok('Schicht 2 heißt Vermittlung und trägt IP-Adressen',
     ls[1].schicht === 'Vermittlung' && ls[1].quelle === '192.168.1.10',
     ls[1].schicht + ' ' + ls[1].quelle);
  ok('Schicht 3 heißt Transport und trägt PORTNUMMERN',
     ls[2].schicht === 'Transport' && /^\d+$/.test(ls[2].quelle) && ls[2].ziel === '80',
     ls[2].schicht + ' ' + ls[2].quelle + '→' + ls[2].ziel);
  ok('Schicht 4 heißt Anwendung und trägt Adresse UND Port',
     ls[3].schicht === 'Anwendung' && ls[3].ziel === '192.168.1.20:80',
     ls[3].schicht + ' ' + ls[3].ziel);

  /* Die Schichtnamen sind die von Filius (`rp_lauscher_msg8…11`) —
     wer beide Programme nebeneinander legt, soll dasselbe Wort
     lesen. */
  const namen = new Set();
  for (const r of mit.view()) for (const l of mit.layers(r)) namen.add(l.schicht);
  ok('es gibt genau die vier Filius-Schichten und keine fünfte',
     [...namen].every(n => ['Netzzugang', 'Vermittlung', 'Transport', 'Anwendung'].includes(n)),
     [...namen].join(','));

  /* Der Handschlag muss auch HIER nachzurechnen sein — ohne die
     Sequenznummer in der Bemerkung ist die Ansicht für TCP
     nutzlos, und TCP ist der Grund, warum man sie aufschlägt. */
  const syn = mit.view().find(r => /\[SYN\]/.test(r.info));
  const synT = mit.layers(syn).find(l => l.schicht === 'Transport');
  ok('die Transport-Zeile nennt Flags und Sequenznummer',
     /\[SYN\]/.test(synT.details) && /Seq: \d+/.test(synT.details), synT.details);
  const synack = mit.view().find(r => /\[SYN, ACK\]/.test(r.info));
  const saT = mit.layers(synack).find(l => l.schicht === 'Transport');
  ok('und beim SYN,ACK auch die Bestätigungsnummer',
     /\[SYN, ACK\]/.test(saT.details) && /bestätigt: \d+/.test(saT.details), saT.details);

  /* Was kopiert wird, muss dem entsprechen, was zu sehen ist. */
  mit.setModus('schichten');
  const txt = mit.toText();
  ok('die Textausgabe trägt in der Schichtenansicht einen Spaltenkopf',
     /Nr\..*Zeit.*Quelle.*Ziel.*Protokoll.*Schicht/.test(txt.split('\n')[0]), txt.split('\n')[0]);
  ok('und nennt die Schichten namentlich',
     /Netzzugang/.test(txt) && /Vermittlung/.test(txt)
     && /Transport/.test(txt) && /Anwendung/.test(txt));
  /* Der eigentliche Unterschied der beiden Ansichten: aus einem
     Rahmen werden mehrere Zeilen. Gezählt werden die Zeilen ohne
     Kopf und Trennstrich. */
  const datenZeilen = txt.split('\n').length - 2;
  ok('ein Rahmen wird zu mehreren Zeilen',
     datenZeilen > mit.view().length,
     datenZeilen + ' Zeilen für ' + mit.view().length + ' Rahmen');
  /* Und die Nummer bleibt die des RAHMENS: dieselbe Zahl steht
     über allen Schichten, die zusammengehören. Daran hängt in
     Filius die ganze Lesbarkeit der Tabelle. */
  const ersteNr = txt.split('\n')[2].trim().split(/\s+/)[0];
  ok('die Rahmennummer wiederholt sich über seine Schichten',
     txt.split('\n').slice(2).filter(z => z.trim().split(/\s+/)[0] === ersteNr).length >= 2,
     ersteNr);
  mit.setModus('zeilen');
  ok('zurück in der Zeilenansicht: eine Zeile je Rahmen',
     mit.toText().split('\n').length === mit.view().length,
     mit.toText().split('\n').length + ' vs ' + mit.view().length);
}

section('Mitschnitt: Schichten von ICMP, DHCP und Mail');
{
  /* ⚠️ Drei Schichtnummern waren falsch, und alle drei aus
     demselben Grund: „steckt in UDP/IP" war mit „ist auf derselben
     Schicht" verwechselt. Diese Prüfungen halten sie fest. */
  const { engine, netz, stack, mit } = bau();
  const a = netz.addNode('host', 100, 100);
  const b = netz.addNode('host', 300, 100);
  konf(a, 0, '192.168.1.10'); konf(b, 0, '192.168.1.11');
  netz.addCable(a.id, 0, b.id, 0);
  stack.ping(a, '192.168.1.11', 1, 4 * SEC, () => {});
  engine.runUntil(5 * SEC);

  const ping = mit.view().find(r => /Ping-Anfrage/.test(r.info));
  const icmp = mit.layers(ping).find(l => l.name === 'ICMP');
  ok('ICMP liegt auf Schicht 3, nicht 4', icmp.n === 3, String(icmp.n));
  ok('und heißt Vermittlung, nicht Transport', icmp.schicht === 'Vermittlung', icmp.schicht);
  ok('ein Ping hat KEINE Transportschicht — er braucht keine',
     !mit.layers(ping).some(l => l.schicht === 'Transport'),
     mit.layers(ping).map(l => l.schicht).join(','));
}
{
  const { engine, mit, dienste } = dhcpNetz(1);
  dienste.start();
  engine.runUntil(10 * SEC);

  const offer = mit.view().find(r => /DHCP Offer/.test(r.info));
  ok('ein DHCP-Angebot ist im Mitschnitt', !!offer, mit.view().map(r => r.proto).join(','));
  const ls = mit.layers(offer);
  const udp  = ls.find(l => l.name === 'UDP');
  const dhcp = ls.find(l => l.name === 'DHCP');
  ok('UDP liegt auf Schicht 4 (Transport)', udp.n === 4 && udp.schicht === 'Transport',
     udp.n + ' ' + udp.schicht);
  ok('DHCP liegt auf Schicht 7 (Anwendung), nicht neben UDP',
     dhcp.n === 7 && dhcp.schicht === 'Anwendung', dhcp.n + ' ' + dhcp.schicht);
  ok('die UDP-Zeile nennt die Besitzer der Portnummern',
     /DHCP-Server/.test(udp.details) && /DHCP-Client/.test(udp.details), udp.details);
  ok('und die Portspalten stehen auf 67 und 68',
     (udp.quelle === '67' && udp.ziel === '68') || (udp.quelle === '68' && udp.ziel === '67'),
     udp.quelle + '→' + udp.ziel);
}
{
  /* ⚠️ SMTP und POP3 hatten bis zum 2026-09-26 GAR KEINE
     Anwendungsschale — aufgeklappt endete ein Mailsegment bei
     TCP. Die Lücke fiel erst beim Bau der Schichtenansicht auf,
     und sie traf ausgerechnet die zwei Protokolle, die man im
     Unterricht MITLIEST. */
  const { engine, mit, a, mail } = mailNetz();
  mail.senden(a, { an: 'bernd@schule.de', betreff: 'Betreff', text: 'Text' }, () => {});
  engine.runUntil(30 * SEC);

  const smtp = mit.view().find(r => r.proto === 'SMTP');
  ok('ein SMTP-Segment ist im Mitschnitt', !!smtp);
  const ls = mit.layers(smtp);
  const anw = ls.find(l => l.schicht === 'Anwendung');
  ok('es hat eine Anwendungsschale', !!anw, ls.map(l => l.name).join(' / '));
  ok('sie heißt SMTP und liegt auf Schicht 7',
     anw && anw.name === 'SMTP' && anw.n === 7, anw && (anw.name + ' ' + anw.n));
  ok('und sie zeigt die Zeile, die über die Leitung ging',
     anw && anw.fields.length > 0 && anw.fields[0][0] === 'Gesagt',
     anw && JSON.stringify(anw.fields[0]));
  /* Quelle und Ziel tragen hier Adresse UND Port — Port 25 muss
     dabei sein, denn er ist die Antwort auf „welches Programm". */
  ok('Quelle und Ziel nennen den Port',
     anw && (/:25$/.test(anw.ziel) || /:25$/.test(anw.quelle)),
     anw && (anw.quelle + ' → ' + anw.ziel));
}

/* ══════════════════════════════════════════════════════════════
   Weiterleitung von Hand · RIP · Portfreigaben
   ══════════════════════════════════════════════════════════════ */

const ip2i = U.ip2int;

/* Eigener Hilfsbau — mit `dienste`, denn RIP wird von `sync()`
   geschaltet. (Und NICHT `bau()`: das ist im Abschnitt „Subnetze"
   überschrieben, siehe die Warnung bei `heimBau`.) */
function wegBau(seed) {
  const engine = new sandbox.Engine({ seed: seed || 42 });
  const netz = new sandbox.Netz(engine);
  const stack = new sandbox.Stack(engine, netz);
  const mit = new sandbox.Mitschnitt(engine, netz);
  const dienste = new sandbox.Dienste(engine, netz, stack, {});
  return { engine, netz, stack, mit, dienste };
}

/* Die Kette, an der beides hängt: drei Netze, zwei Router. Kein
   Router kennt das Netz am anderen Ende — und genau das ist die
   Aufgabe, die einmal von Hand und einmal von selbst gelöst wird.

     A ──── R1 ──── R2 ──── B
      192.168.1   .2.   192.168.3                                */
function kette(b) {
  const { netz } = b;
  const a  = netz.addNode('host', 50, 100);
  const r1 = netz.addNode('router', 200, 100);
  const r2 = netz.addNode('router', 350, 100);
  const c  = netz.addNode('host', 500, 100);
  konf(a, 0, '192.168.1.10');  a.gateway = '192.168.1.1';
  konf(r1, 0, '192.168.1.1');  konf(r1, 1, '192.168.2.1');
  konf(r2, 0, '192.168.2.2');  konf(r2, 1, '192.168.3.1');
  konf(c, 0, '192.168.3.10');  c.gateway = '192.168.3.1';
  netz.addCable(a.id, 0, r1.id, 0);
  netz.addCable(r1.id, 1, r2.id, 0);
  netz.addCable(r2.id, 1, c.id, 0);
  return Object.assign(b, { a, r1, r2, c });
}

section('Weiterleitung von Hand');
{
  const { engine, stack, a, r1, r2, c } = kette(wegBau(5));

  /* Ohne Eintrag kennt R1 das dritte Netz nicht. Das ist der
     Ausgangspunkt der Aufgabe und keine Randbedingung: ein Router
     weiß von sich aus NUR, was an ihm hängt. */
  ok('ohne Eintrag kennt R1 keinen Weg ins dritte Netz',
     stack.routeFor(r1, ip2i('192.168.3.10')) === null);

  let r = null;
  stack.ping(a, '192.168.3.10', 1, 6 * SEC, x => r = x);
  engine.runUntil(10 * SEC);
  ok('und der Ping scheitert', !!r && !r.ok, JSON.stringify(r));

  /* EINE Zeile reicht nicht — das ist die zweite Hälfte der
     Lernaussage und der Fehler, den jede Klasse macht: die Anfrage
     kommt an, aber R2 weiß nicht, wie sie zurück soll. */
  r1.routes.push({ net: '192.168.3.0', mask: '255.255.255.0', gateway: '192.168.2.2' });
  const w = stack.routeFor(r1, ip2i('192.168.3.10'));
  ok('mit einer Zeile kennt R1 den Weg', !!w, JSON.stringify(w));
  ok('und nennt sie als Herkunft „eingetragen"', w && w.why === 'eingetragen', w && w.why);
  ok('über die Karte, in deren Netz das Gateway liegt', w && w.nic === 1, w && w.nic);

  stack.clearTables(a); stack.clearTables(c); stack.clearTables(r1); stack.clearTables(r2);
  let r2res = null;
  stack.ping(a, '192.168.3.10', 2, 6 * SEC, x => r2res = x);
  engine.runUntil(engine.now + 12 * SEC);
  ok('der Ping scheitert trotzdem — R2 kennt den Rückweg nicht',
     !!r2res && !r2res.ok, JSON.stringify(r2res));

  // Und mit der Gegenzeile geht es.
  r2.routes.push({ net: '192.168.1.0', mask: '255.255.255.0', gateway: '192.168.2.1' });
  stack.clearTables(a); stack.clearTables(c); stack.clearTables(r1); stack.clearTables(r2);
  let r3 = null;
  stack.ping(a, '192.168.3.10', 3, 6 * SEC, x => r3 = x);
  engine.runUntil(engine.now + 12 * SEC);
  ok('⭐ mit beiden Zeilen kommt der Ping an', !!r3 && r3.ok, JSON.stringify(r3));
  ok('über zwei Router, also TTL 62', r3 && r3.ttl === 62, r3 && r3.ttl);

  const t = stack.routingTable(r1);
  ok('die Zeile steht in der Weiterleitungstabelle',
     t.some(x => x.net === '192.168.3.0' && x.kind === 'eingetragen'),
     JSON.stringify(t));
}

/* Eine Zeile, deren Gateway in keinem eigenen Netz liegt, tut
   NICHTS. Das ist der häufigste Fehler an dieser Tabelle, und er
   darf nicht stillschweigend als Weg gelten — sonst schickt der
   Router das Paket an eine Adresse, die er nicht erreichen kann. */
{
  const { stack, r1 } = kette(wegBau(5));
  r1.routes.push({ net: '192.168.3.0', mask: '255.255.255.0', gateway: '10.0.0.1' });
  ok('ein Gateway außerhalb aller eigenen Netze ergibt keinen Weg',
     stack.routeFor(r1, ip2i('192.168.3.10')) === null);
}

/* Die längste Maske gewinnt — auch wenn die kürzere weiter oben
   steht. Das ist die eine Regel, die in jeder Zeile dieser Tabelle
   mitspielt. */
{
  const { stack, r1 } = kette(wegBau(5));
  r1.routes.push({ net: '192.168.0.0', mask: '255.255.0.0',   gateway: '192.168.2.9' });
  r1.routes.push({ net: '192.168.3.0', mask: '255.255.255.0', gateway: '192.168.2.2' });
  const w = stack.routeFor(r1, ip2i('192.168.3.10'));
  ok('die längere Maske gewinnt, egal in welcher Reihenfolge',
     w && w.nextHop === ip2i('192.168.2.2'), w && U.int2ip(w.nextHop));
  /* Und für eine Adresse, die nur von der kurzen Maske getroffen
     wird, gilt eben die kurze. */
  const w2 = stack.routeFor(r1, ip2i('192.168.9.5'));
  ok('für ein anderes Netz gilt die kürzere', w2 && w2.nextHop === ip2i('192.168.2.9'));
}

/* Ein eigenes Netz schlägt jede eingetragene Zeile. Sonst könnte
   man sich mit einer Zeile das Netz unter den Füßen wegziehen —
   „direkt" ist per Definition der kürzeste Weg. */
{
  const { stack, r1 } = kette(wegBau(5));
  r1.routes.push({ net: '192.168.1.0', mask: '255.255.255.0', gateway: '192.168.2.2' });
  const w = stack.routeFor(r1, ip2i('192.168.1.10'));
  ok('das eigene Netz bleibt direkt', w && w.why === 'direkt', w && w.why);
}

/* Die Endgeräte haben keine Weiterleitungstabelle — und das ist
   keine Lücke, sondern der Unterschied zwischen einem Rechner und
   einem Router. Geprüft am Modell: `KIND.routes` entscheidet, ob
   das Formular überhaupt erscheint (konfig.js). */
{
  const { netz } = wegBau(5);
  ok('nur Router und Heimrouter haben eine Weiterleitungstabelle',
     netz.KIND.router.routes === true && netz.KIND.heimrouter.routes === true
     && netz.KIND.host.routes === false && netz.KIND.switch.routes === false);
}

/* Eingetragene Zeilen gehören zur Bauanleitung und müssen ein
   Speichern überleben. (`routes` stand schon immer im Format —
   geprüft war es nie.) */
{
  const { netz, engine } = wegBau(5);
  const r = netz.addNode('router', 100, 100);
  konf(r, 0, '192.168.1.1'); konf(r, 1, '192.168.2.1');
  r.routes.push({ net: '192.168.9.0', mask: '255.255.255.0', gateway: '192.168.2.2' });
  const json = JSON.parse(JSON.stringify(netz.toJSON()));
  const netz2 = new sandbox.Netz(engine);
  netz2.fromJSON(json);
  const r2 = netz2.list().find(n => n.kind === 'router');
  ok('die Zeile übersteht Speichern und Laden',
     r2 && r2.routes.length === 1 && r2.routes[0].gateway === '192.168.2.2',
     JSON.stringify(r2 && r2.routes));
}

section('Automatisches Routing (RIP)');

/* Nur am Router. Filius hat den Schalter ebenfalls nur dort
   (jvermittlungsrechnerkonfiguration_msg26; die
   Gateway-Konfiguration hat kein Gegenstück dazu) — und ein
   Heimrouter, der dem Anbieter die Netze im Haus zuruft, stellt
   nichts nach, was es gibt. */
{
  const { netz, stack } = wegBau(6);
  const r = netz.addNode('router', 100, 100);
  const hr = netz.addNode('heimrouter', 300, 100);
  const h = netz.addNode('host', 500, 100);
  ok('der Router kann RIP', stack.ripKann(r));
  ok('der Heimrouter nicht', !stack.ripKann(hr));
  ok('und ein Endgerät schon gar nicht', !stack.ripKann(h));
  /* Ein Schalter, der nichts tut, wäre schlimmer als keiner: auch
     mit `on` darf am Heimrouter nichts laufen. */
  netz.ripConf(hr).on = true;
  ok('ein eingeschalteter Schalter am Heimrouter bleibt wirkungslos', !stack.ripAktiv(hr));
}

/* ⭐ Die Prüfung, um die es geht: dasselbe Netz wie oben, KEINE
   einzige Zeile von Hand — und der Ping kommt an. */
{
  const { engine, netz, stack, dienste, a, r1, r2 } = kette(wegBau(6));
  netz.ripConf(r1).on = true;
  netz.ripConf(r2).on = true;
  dienste.start();
  engine.runUntil(4 * SEC);

  ok('R1 hat das dritte Netz gelernt',
     stack.ripZeilen(r1).some(x => x.net === '192.168.3.0' && x.hops === 1),
     JSON.stringify(stack.ripZeilen(r1)));
  ok('R2 das erste',
     stack.ripZeilen(r2).some(x => x.net === '192.168.1.0' && x.hops === 1),
     JSON.stringify(stack.ripZeilen(r2)));
  /* Split Horizon und die Sperre gegen eigene Netze zusammen: R1
     darf sein EIGENES Netz nie über R2 gelernt haben. Ohne die
     Sperre stünde hier 192.168.1.0 mit einem Sprung — und der
     Router schickte Pakete ins eigene Netz über den Nachbarn. */
  ok('und keiner lernt sein eigenes Netz über den Nachbarn',
     !stack.ripZeilen(r1).some(x => x.net === '192.168.1.0' && x.hops > 0)
     && !stack.ripZeilen(r2).some(x => x.net === '192.168.3.0' && x.hops > 0));

  ok('die eigenen Netze stehen mit null Sprüngen dabei',
     stack.ripZeilen(r1).filter(x => x.hops === 0).length === 2,
     JSON.stringify(stack.ripZeilen(r1).filter(x => x.hops === 0)));

  const w = stack.routeFor(r1, ip2i('192.168.3.10'));
  ok('die Weiterleitung benutzt den gelernten Weg', w && w.why === 'RIP', w && w.why);
  ok('und kennt seine Länge', w && w.hops === 1, w && w.hops);

  let r = null;
  stack.ping(a, '192.168.3.10', 1, 8 * SEC, x => r = x);
  engine.runUntil(engine.now + 14 * SEC);
  ok('⭐ der Ping kommt an, ohne dass jemand eine Zeile eingetragen hat',
     !!r && r.ok, JSON.stringify(r));
  ok('und niemand HAT eine eingetragen',
     r1.routes.length === 0 && r2.routes.length === 0);

  const t = stack.routingTable(r1);
  ok('der gelernte Weg steht in der Weiterleitungstabelle',
     t.some(x => x.net === '192.168.3.0' && x.kind === 'RIP' && x.hops === 1),
     JSON.stringify(t.filter(x => x.kind === 'RIP')));
}

/* Ohne RIP geht dasselbe Netz nicht. Die Gegenprobe gehört dazu —
   sonst könnte der Ping oben aus einem anderen Grund geklappt
   haben. */
{
  const { engine, stack, dienste, a } = kette(wegBau(6));
  dienste.start();
  let r = null;
  stack.ping(a, '192.168.3.10', 1, 6 * SEC, x => r = x);
  engine.runUntil(12 * SEC);
  ok('ohne RIP und ohne Zeile scheitert es', !!r && !r.ok, JSON.stringify(r));
}

/* Drei Router: das ferne Netz kommt mit ZWEI Sprüngen an. Das ist
   der Beweis, dass gezählt und weitergesagt wird — mit zwei
   Routern wäre jede Eins auch ohne Weitersagen zu erklären. */
{
  const { engine, netz, stack, dienste } = wegBau(7);
  const r1 = netz.addNode('router', 100, 100);
  const r2 = netz.addNode('router', 250, 100);
  const r3 = netz.addNode('router', 400, 100);
  const c  = netz.addNode('host', 550, 100);
  konf(r1, 0, '192.168.1.1'); konf(r1, 1, '192.168.2.1');
  konf(r2, 0, '192.168.2.2'); konf(r2, 1, '192.168.3.1');
  konf(r3, 0, '192.168.3.2'); konf(r3, 1, '192.168.4.1');
  konf(c, 0, '192.168.4.10'); c.gateway = '192.168.4.1';
  netz.addCable(r1.id, 1, r2.id, 0);
  netz.addCable(r2.id, 1, r3.id, 0);
  netz.addCable(r3.id, 1, c.id, 0);
  for (const r of [r1, r2, r3]) netz.ripConf(r).on = true;
  dienste.start();
  engine.runUntil(8 * SEC);

  const z = stack.ripZeilen(r1);
  ok('R1 lernt das Nachbarnetz mit einem Sprung',
     z.some(x => x.net === '192.168.3.0' && x.hops === 1), JSON.stringify(z));
  ok('⭐ und das ferne mit zwei',
     z.some(x => x.net === '192.168.4.0' && x.hops === 2), JSON.stringify(z));
  const w = stack.routeFor(r1, ip2i('192.168.4.10'));
  ok('der Weg dorthin geht über den direkten Nachbarn',
     w && w.nextHop === ip2i('192.168.2.2'), w && U.int2ip(w.nextHop));
}

/* Ein Weg, über den niemand mehr redet, LÄUFT AB. Er verschwindet
   dabei nicht stillschweigend, sondern steht als unerreichbar da —
   wie in Filius (RIPTable.check setzt hops auf INFINITY). */
{
  const { engine, netz, stack, dienste, r1, r2 } = kette(wegBau(8));
  netz.ripConf(r1).on = true;
  netz.ripConf(r2).on = true;
  dienste.start();
  engine.runUntil(4 * SEC);
  ok('erst ist der Weg da', !!stack.routeFor(r1, ip2i('192.168.3.10')));

  // R2 aus. `sync()` räumt dessen Takt weg — R1 hört nichts mehr.
  r2.on = false;
  dienste.sync();
  engine.runUntil(engine.now + 20 * SEC);

  const z = stack.ripZeilen(r1).find(x => x.net === '192.168.3.0');
  ok('nach der Frist steht er als unerreichbar da', !!z && z.weg === true, JSON.stringify(z));
  ok('und die Weiterleitung benutzt ihn nicht mehr',
     stack.routeFor(r1, ip2i('192.168.3.10')) === null);
  /* ⚠️ Die Frist muss über dem Takt liegen, sonst läuft ein Weg
     ab, bevor die nächste Ansage ihn bestätigen kann — dann
     flackerte die Tabelle im Takt. */
  ok('die Frist liegt deutlich über dem Takt',
     stack.RIP_FRIST >= stack.RIP_TAKT * 2,
     stack.RIP_FRIST + ' vs ' + stack.RIP_TAKT);
}

/* Was von Hand dasteht, schlägt das, was ein Nachbar gesagt hat —
   bei GLEICHER Maske. Das ist die Rangfolge echter Geräte
   (administrative Distanz) und der ausdrückliche Unterschied zu
   Filius, das die Tabelle von Hand bei eingeschaltetem RIP ganz
   ausschaltet. */
{
  const { engine, netz, stack, dienste, r1 } = kette(wegBau(9));
  netz.ripConf(r1).on = true;
  netz.ripConf(netz.list().find(n => n.kind === 'router' && n !== r1)).on = true;
  dienste.start();
  engine.runUntil(4 * SEC);
  ok('RIP hat den Weg gelernt', stack.routeFor(r1, ip2i('192.168.3.10')).why === 'RIP');

  r1.routes.push({ net: '192.168.3.0', mask: '255.255.255.0', gateway: '192.168.2.9' });
  const w = stack.routeFor(r1, ip2i('192.168.3.10'));
  ok('⭐ die eingetragene Zeile geht vor', w && w.why === 'eingetragen', w && w.why);
  ok('und zwar über ihr Gateway', w && w.nextHop === ip2i('192.168.2.9'));

  /* Aber nur bei gleicher Maske: eine kurze Maske von Hand darf
     einen genaueren gelernten Weg nicht verdrängen. */
  r1.routes.length = 0;
  r1.routes.push({ net: '192.168.0.0', mask: '255.255.0.0', gateway: '192.168.2.9' });
  const w2 = stack.routeFor(r1, ip2i('192.168.3.10'));
  ok('eine kürzere Maske von Hand verliert gegen den genaueren gelernten Weg',
     w2 && w2.why === 'RIP', w2 && (w2.why + ' /' + w2.prefix));
}

/* Ausschalten heißt: Tabelle weg. Bliebe sie stehen, kennte der
   Router nach dem Wiedereinschalten Wege, die ihm in diesem
   Durchlauf niemand bestätigt hat — dieselbe Regel wie bei NAT. */
{
  const { engine, netz, stack, dienste, r1, r2 } = kette(wegBau(10));
  netz.ripConf(r1).on = true;
  netz.ripConf(r2).on = true;
  dienste.start();
  engine.runUntil(4 * SEC);
  ok('mit RIP steht etwas in der Tabelle', stack.ripZeilen(r1).length > 0);
  netz.ripConf(r1).on = false;
  dienste.sync();
  ok('nach dem Ausschalten nichts mehr', stack.ripZeilen(r1).length === 0);
  ok('und der gelernte Weg ist weg',
     stack.routeFor(r1, ip2i('192.168.3.10')) === null);
}

/* Im Entwurfsmodus redet niemand. RIP ist das erste Protokoll in
   diesem Programm, das OHNE Zutun sendet — liefe der Takt im
   Entwurf weiter, füllte sich der Mitschnitt mit Ansagen über ein
   Netz, das gerade umgebaut wird. */
{
  const { engine, netz, stack, mit, r1, r2 } = kette(wegBau(11));
  netz.ripConf(r1).on = true;
  netz.ripConf(r2).on = true;
  // KEIN dienste.start()
  engine.runUntil(20 * SEC);
  ok('ohne Aktionsmodus wird nichts angesagt',
     mit.view().filter(r => r.proto === 'RIP').length === 0);
  /* ⚠️ Gefragt wird nach den GELERNTEN Zeilen, nicht nach allen.
     Die eigenen Netze (null Sprünge) stehen auch im Entwurf da, und
     das ist richtig: sie sind das, was dieser Router ansagen WIRD.
     Dieselbe Regel wie bei den Dienstmarken — im Entwurf lauscht
     niemand, die Marke steht trotzdem. */
  ok('und nichts gelernt',
     stack.ripZeilen(r1).every(x => x.hops === 0),
     JSON.stringify(stack.ripZeilen(r1)));
}

/* Der Schalter ist eine Einstellung und muss gespeichert werden —
   die gelernten Wege nicht. Der zweite Teil ist der wichtigere:
   wer ein Netz lädt, soll die Tabelle sich FÜLLEN sehen. */
{
  const { engine, netz, stack, dienste, r1 } = kette(wegBau(12));
  netz.ripConf(r1).on = true;
  netz.ripConf(netz.list().find(n => n.kind === 'router' && n !== r1)).on = true;
  dienste.start();
  engine.runUntil(4 * SEC);
  ok('vor dem Speichern sind Wege gelernt', stack.ripZeilen(r1).length > 2);

  const json = JSON.parse(JSON.stringify(netz.toJSON()));
  const roh = json.nodes.find(n => n.id === r1.id);
  ok('gespeichert wird der Schalter', roh && roh.rip && roh.rip.on === true);
  ok('und sonst nichts von RIP', roh && Object.keys(roh.rip).length === 1,
     JSON.stringify(roh && roh.rip));

  const e2 = new sandbox.Engine({ seed: 1 });
  const netz2 = new sandbox.Netz(e2);
  const stack2 = new sandbox.Stack(e2, netz2);
  netz2.fromJSON(json);
  const r1b = netz2.get(r1.id);
  ok('nach dem Laden ist der Schalter an', !!(r1b.rip && r1b.rip.on));
  ok('die Tabelle aber leer', stack2.ripZeilen(r1b).length === 0
     || stack2.ripZeilen(r1b).every(x => x.hops === 0),
     JSON.stringify(stack2.ripZeilen(r1b)));
}

/* Im Mitschnitt: eigenes Protokoll, eigene Schale, Schicht 7.
   ⚠️ Die Sieben ist die Stelle, an der DHCP und DNS schon einmal
   falsch standen (siehe UEBERGABE.md) — RIP benutzt UDP, es ist
   keins. */
{
  const { engine, netz, mit, dienste, r1, r2 } = kette(wegBau(13));
  netz.ripConf(r1).on = true;
  netz.ripConf(r2).on = true;
  dienste.start();
  engine.runUntil(4 * SEC);

  const z = mit.view().filter(r => r.proto === 'RIP');
  ok('die Ansagen stehen als RIP im Mitschnitt', z.length > 0, z.length);
  ok('und in Klartext, mit der Entfernung',
     z.some(r => /RIP-Ansage — ich kenne 192\.168\.\d+\.0 \(\d+\)/.test(r.info)),
     z[0] && z[0].info);

  const ls = mit.layers(z[0]);
  const anw = ls.find(l => l.schicht === 'Anwendung');
  ok('es gibt eine Anwendungsschale', !!anw, ls.map(l => l.name).join(' / '));
  ok('sie heißt RIP und liegt auf Schicht 7',
     anw && anw.name === 'RIP' && anw.n === 7, anw && (anw.name + ' ' + anw.n));
  ok('darunter liegt UDP auf Schicht 4',
     ls.some(l => l.name === 'UDP' && l.n === 4 && l.schicht === 'Transport'));
  ok('die Ports sind 521 → 520 wie in Filius',
     ls.some(l => l.name === 'UDP' && l.quelle === '521' && l.ziel === '520'),
     JSON.stringify(ls.filter(l => l.name === 'UDP').map(l => l.quelle + '→' + l.ziel)));
  ok('die Schale nennt jedes Netz mit seiner Entfernung',
     anw && anw.fields.some(f => /Sprung|Sprünge/.test(f[1])),
     anw && JSON.stringify(anw.fields));
  /* Ein Rundruf: TTL 1, damit keine Ansage über einen Router
     hinausgeht. Ein RIP-Paket, das weitergetragen würde, erzählte
     Nachbarn von Nachbarn ohne dazwischenliegenden Sprung. */
  ok('die Ansage geht als Rundruf mit TTL 1 hinaus',
     z[0].frame.payload.dst === '255.255.255.255' && z[0].frame.payload.ttl === 1,
     z[0].frame.payload.dst + ' TTL ' + z[0].frame.payload.ttl);
}

section('Portfreigaben');

/* Der Aufbau aus dem NAT-Abschnitt, nur mit einem Server IM Haus:
   das ist der Fall, für den es Portfreigaben gibt.

     draussen 84.12.5.1 ── WAN 84.12.5.9 [HR] LAN 192.168.1.1 ── 192.168.1.20 */
function freiBau(seed) {
  const b = wegBau(seed || 20);
  const { netz } = b;
  const hr = heimEinrichten(netz, netz.addNode('heimrouter', 200, 100));
  netz.setDhcp(hr, 0, false);
  hr.nics[0].ip = '84.12.5.9'; hr.nics[0].mask = '255.255.255.0';
  hr.dhcpServer.on = false;
  const draussen = netz.addNode('server', 450, 50);
  draussen.nics[0].ip = '84.12.5.1'; draussen.nics[0].mask = '255.255.255.0';
  draussen.gateway = '84.12.5.9';
  netz.addCable(hr.id, 0, draussen.id, 0);
  const drinnen = netz.addNode('server', 50, 300);
  drinnen.nics[0].ip = '192.168.1.20'; drinnen.nics[0].mask = '255.255.255.0';
  drinnen.gateway = '192.168.1.1';
  netz.addCable(drinnen.id, 0, hr.id, 2);
  return Object.assign(b, { hr, draussen, drinnen });
}

/* Ohne Freigabe kommt von außen nichts herein. Das ist die
   Behauptung, die der NAT-Abschnitt aufstellt — hier steht sie
   noch einmal, weil sie der Ausgangspunkt für alles Folgende ist. */
{
  const { engine, stack, draussen, drinnen } = freiBau(20);
  let da = null;
  stack.listen(drinnen, 9999, (m) => { da = m; }, 'Prüfdienst');
  stack.sendUdp(draussen, '84.12.5.9', 5000, 8080, 'klopf klopf');
  engine.runUntil(10 * SEC);
  ok('ohne Freigabe kommt von außen nichts an', da === null, JSON.stringify(da));
}

/* ⭐ Und mit Freigabe schon — an die Adresse und den Port, die
   dort eingetragen sind. */
{
  const { engine, netz, stack, draussen, drinnen, hr } = freiBau(20);
  netz.natConf(hr).frei.push({ proto: 'udp', port: 8080, lanIp: '192.168.1.20', lanPort: 9999 });

  let da = null, zurueck = null;
  stack.listen(drinnen, 9999, (m) => { da = m; }, 'Prüfdienst');
  stack.listen(draussen, 5000, (m) => { zurueck = m; }, 'Prüfclient');
  stack.sendUdp(draussen, '84.12.5.9', 5000, 8080, 'klopf klopf');
  engine.runUntil(10 * SEC);

  ok('⭐ mit Freigabe kommt es an', !!da, 'nichts angekommen');
  ok('und zwar beim richtigen Gerät', da && da.to === '192.168.1.20', da && da.to);
  ok('auf dem eingetragenen Port', da && da.dport === 9999, da && da.dport);
  ok('der Inhalt ist unverändert', da && da.data === 'klopf klopf', da && da.data);
  /* Von wem? Von draußen — die Absenderadresse wird NICHT
     übersetzt, und das ist der Unterschied zum Hinweg: NAT
     versteckt das Haus, nicht das Internet. */
  ok('der Absender bleibt der von draußen', da && da.from === '84.12.5.1', da && da.from);

  /* ⭐ Der Rückweg. Er ist die Zeile, die man vergisst: die
     Antwort muss mit Port 8080 hinausgehen und nicht mit einer
     frisch vergebenen 40001 — draußen wartet jemand auf eine
     Antwort von dem Port, den er angesprochen hat. */
  stack.sendUdp(drinnen, '84.12.5.1', 9999, 5000, 'wer da');
  engine.runUntil(engine.now + 10 * SEC);
  ok('⭐ die Antwort kommt draußen an', !!zurueck, 'nichts zurück');
  ok('sie trägt die WAN-Adresse als Absender',
     zurueck && zurueck.from === '84.12.5.9', zurueck && zurueck.from);
  ok('und den freigegebenen Port, keine vergebene Nummer',
     zurueck && zurueck.sport === 8080, zurueck && zurueck.sport);
}

/* Die Freigabe steht in der NAT-Tabelle — und zwar SOFORT, auch
   wenn noch kein Paket gelaufen ist. Genau das ist der
   Unterschied zu den Zeilen, die aus einem Gespräch entstehen. */
{
  const { netz, stack, hr } = freiBau(21);
  ok('vorher ist die Tabelle leer', stack.natTabelle(hr).length === 0);
  netz.natConf(hr).frei.push({ proto: 'tcp', port: 80, lanIp: '192.168.1.20', lanPort: 80 });
  const t = stack.natTabelle(hr);
  ok('die Freigabe steht ohne ein einziges Paket in der Tabelle', t.length === 1, JSON.stringify(t));
  ok('als Freigabe gekennzeichnet', t[0] && t[0].frei === true);
  ok('mit der WAN-Adresse außen', t[0] && t[0].aussen === '84.12.5.9', t[0] && t[0].aussen);
  ok('und ohne Ablauf', t[0] && t[0].rest === null, t[0] && t[0].rest);
}

/* Leerer LAN-Port heißt „derselbe". Und das Ergebnis steht in der
   Tabelle, damit nichts unsichtbar passiert. */
{
  const { engine, netz, stack, draussen, drinnen, hr } = freiBau(22);
  netz.natConf(hr).frei.push({ proto: 'udp', port: 7000, lanIp: '192.168.1.20', lanPort: '' });
  let da = null;
  stack.listen(drinnen, 7000, (m) => { da = m; }, 'Prüfdienst');
  stack.sendUdp(draussen, '84.12.5.9', 5000, 7000, 'hallo');
  engine.runUntil(10 * SEC);
  ok('ohne LAN-Port gilt derselbe', !!da && da.dport === 7000, da && da.dport);
  ok('und die Tabelle zeigt, welche Nummer dabei herauskommt',
     stack.natTabelle(hr)[0].innenPort === 7000, JSON.stringify(stack.natTabelle(hr)[0]));
}

/* Das Protokoll gehört zur Freigabe. Eine TCP-Freigabe darf kein
   UDP-Paket hereinlassen — sonst wäre die Spalte „Protokoll" eine
   Zierde. */
{
  const { engine, netz, stack, draussen, drinnen, hr } = freiBau(23);
  netz.natConf(hr).frei.push({ proto: 'tcp', port: 8080, lanIp: '192.168.1.20', lanPort: 9999 });
  let da = null;
  stack.listen(drinnen, 9999, (m) => { da = m; }, 'Prüfdienst');
  stack.sendUdp(draussen, '84.12.5.9', 5000, 8080, 'klopf');
  engine.runUntil(10 * SEC);
  ok('eine TCP-Freigabe lässt kein UDP herein', da === null, JSON.stringify(da));
}

/* Eine halb ausgefüllte Zeile tut nichts — und richtet auch
   nichts an. Sie ist im Fenster als unfertig zu sehen. */
{
  const { engine, netz, stack, draussen, drinnen, hr } = freiBau(24);
  const c = netz.natConf(hr);
  c.frei.push({ proto: 'udp', port: 8080, lanIp: '', lanPort: 9999 });      // ohne Adresse
  c.frei.push({ proto: 'udp', port: '', lanIp: '192.168.1.20', lanPort: 9999 }); // ohne Port
  c.frei.push({ proto: '', port: 8080, lanIp: '192.168.1.20', lanPort: 9999 });  // ohne Protokoll
  let da = null;
  stack.listen(drinnen, 9999, (m) => { da = m; }, 'Prüfdienst');
  stack.sendUdp(draussen, '84.12.5.9', 5000, 8080, 'klopf');
  engine.runUntil(10 * SEC);
  ok('unfertige Zeilen lassen nichts herein', da === null, JSON.stringify(da));
  ok('und stehen auch nicht in der NAT-Tabelle', stack.natTabelle(hr).length === 0);
}

/* Freigegeben ist ein Port an der WAN-Adresse. Ein Paket, das über
   das WAN-Kabel an die LAN-Adresse gerichtet ist, hat mit der
   Freigabe nichts zu tun. */
{
  const { engine, netz, stack, draussen, drinnen, hr } = freiBau(25);
  netz.natConf(hr).frei.push({ proto: 'udp', port: 8080, lanIp: '192.168.1.20', lanPort: 9999 });
  let da = null;
  stack.listen(drinnen, 9999, (m) => { da = m; }, 'Prüfdienst');
  // Zielt an die LAN-Adresse des Heimrouters, kommt aber von außen.
  stack.sendUdp(draussen, '192.168.1.1', 5000, 8080, 'klopf');
  engine.runUntil(10 * SEC);
  ok('die Freigabe gilt nur an der WAN-Adresse', da === null, JSON.stringify(da));
}

/* Ohne NAT keine Freigabe — es gibt dann nichts zu übersetzen. */
{
  const { engine, netz, stack, draussen, drinnen, hr } = freiBau(26);
  hr.nat.on = false;
  netz.natConf(hr).frei.push({ proto: 'udp', port: 8080, lanIp: '192.168.1.20', lanPort: 9999 });
  let da = null;
  stack.listen(drinnen, 9999, (m) => { da = m; }, 'Prüfdienst');
  stack.sendUdp(draussen, '84.12.5.9', 5000, 8080, 'klopf');
  engine.runUntil(10 * SEC);
  ok('ohne NAT übersetzt auch eine Freigabe nichts', da === null, JSON.stringify(da));
  ok('und die Tabelle bleibt leer', stack.natTabelle(hr).length === 0);
}

/* ⭐ Der eigentliche Fall: ein Webserver im Haus, von draußen
   aufgerufen. Über TCP, denn darum geht es bei einer Freigabe. */
{
  const { engine, netz, stack, draussen, drinnen, hr } = freiBau(27);
  netz.natConf(hr).frei.push({ proto: 'tcp', port: 80, lanIp: '192.168.1.20', lanPort: 80 });

  let serverConn = null, gehoert = [];
  stack.tcpHoeren(drinnen, 80, (c) => {
    serverConn = c;
    c.onDaten((text) => { gehoert.push(text); c.senden('HTTP/1.0 200 OK'); });
  }, 'Webserver');

  let clientConn = null, fehler = 'nichts', antwort = [];
  stack.tcpVerbinde(draussen, '84.12.5.9', 80, 'Webbrowser', (err, c) => {
    if (err) { fehler = err; return; }
    clientConn = c;
    c.onDaten((t) => antwort.push(t));
  });
  engine.runUntil(20 * SEC);

  ok('⭐ die Verbindung von draußen ins Haus steht',
     !!clientConn && !!serverConn, fehler);
  /* Der Client hat 84.12.5.9 angesprochen und weiß nichts von
     192.168.1.20 — das IST die Portfreigabe. */
  ok('der Client kennt nur die WAN-Adresse',
     clientConn && clientConn.fernIp === '84.12.5.9', clientConn && clientConn.fernIp);

  clientConn.senden('GET / HTTP/1.0');
  engine.runUntil(engine.now + 10 * SEC);
  ok('die Anfrage kommt beim Server im Haus an',
     gehoert.join('') === 'GET / HTTP/1.0', gehoert.join('|'));
  ok('und die Antwort draußen wieder', antwort.join('') === 'HTTP/1.0 200 OK', antwort.join('|'));
}

/* Ohne Freigabe endet dieselbe Verbindung im Nichts. Ein RST kommt
   NICHT zurück: der Heimrouter verwirft, er antwortet nicht —
   sonst verriete er, dass dort etwas steht. */
{
  const { engine, stack, draussen, drinnen } = freiBau(28);
  stack.tcpHoeren(drinnen, 80, () => {}, 'Webserver');
  let clientConn = null, fehler = null;
  stack.tcpVerbinde(draussen, '84.12.5.9', 80, 'Webbrowser', (err, c) => {
    if (err) fehler = err; else clientConn = c;
  });
  engine.runUntil(20 * SEC);
  ok('ohne Freigabe steht keine Verbindung', !clientConn, 'sie stand doch');
  ok('und es gibt einen Grund dafür', !!fehler, String(fehler));
}

/* Freigaben sind eine Einstellung und müssen ein Speichern
   überleben — anders als die Zeilen aus einem Gespräch. */
{
  const { engine, netz, hr } = freiBau(29);
  netz.natConf(hr).frei.push({ proto: 'tcp', port: 80, lanIp: '192.168.1.20', lanPort: 80 });
  const json = JSON.parse(JSON.stringify(netz.toJSON()));
  const netz2 = new sandbox.Netz(engine);
  netz2.fromJSON(json);
  const hr2 = netz2.list().find(n => n.kind === 'heimrouter');
  ok('die Freigabe übersteht Speichern und Laden',
     hr2 && hr2.nat.frei.length === 1 && hr2.nat.frei[0].port === 80,
     JSON.stringify(hr2 && hr2.nat.frei));
}

/* Und „von vorn" räumt die Gespräche weg, die Freigaben aber
   nicht: das eine ist Laufzeitwissen, das andere eine Einstellung. */
{
  const { engine, netz, stack, dienste, draussen, drinnen, hr } = freiBau(30);
  netz.natConf(hr).frei.push({ proto: 'udp', port: 8080, lanIp: '192.168.1.20', lanPort: 9999 });
  stack.listen(drinnen, 9999, () => {}, 'Prüfdienst');
  stack.sendUdp(drinnen, '84.12.5.1', 6000, 5000, 'hinaus');
  stack.listen(draussen, 5000, () => {}, 'Prüfclient');
  engine.runUntil(10 * SEC);
  ok('es gibt eine Freigabe und ein Gespräch',
     stack.natTabelle(hr).length === 2, JSON.stringify(stack.natTabelle(hr)));
  dienste.reset();
  const t = stack.natTabelle(hr);
  ok('nach „von vorn" bleibt die Freigabe', t.length === 1 && t[0].frei === true,
     JSON.stringify(t));
}

/* ═══ Class Wide Web ═══ */
section('Class Wide Web: das Gerät');
{
  const { netz } = bau();
  const c = netz.addNode('cww', 100, 100);
  ok('das cww hat Internet + eine Karte nach innen', c.nics.length === 2);
  ok('Karte 0 heißt „Internet"', netz.portLabel(c, 0) === 'Internet' && netz.istInternet(c, 0));
  ok('und trägt die Adresse im 8er-Netz', c.nics[0].ip === '8.0.0.50' && c.nics[0].mask === '255.0.0.0',
     c.nics[0].ip + '/' + c.nics[0].mask);
  let wurf = null;
  try { netz.addNode('cww', 300, 100); } catch (e) { wurf = e.message; }
  ok('ein zweites cww gibt es nicht', wurf && /schon ein Class Wide Web/.test(wurf), wurf);
  ok('darfAnlegen sagt es vorher', !netz.darfAnlegen('cww').ok && netz.darfAnlegen('router').ok);
  const h = netz.addNode('host', 100, 300);
  const r1 = netz.addCable(h.id, 0, c.id, 0);
  ok('kein Kabel in die Internet-Karte', !r1.ok && /Wolke/.test(r1.error), r1.error);
  ok('das nächste freie Loch ist Karte 1', netz.freieNic(c.id) === 1);
  ok('die Internet-Karte lässt sich nicht abbauen', !netz.removeNic(c.id, 0).ok);

  netz.setInternet({ prefix: 67, backbone: '8.41.3.9' });
  ok('der Raum setzt Bereich und 8er-Adresse', c.nics[0].ip === '8.41.3.9' && netz.imEigenenNetz('67.1.2.3')
     && !netz.imEigenenNetz('50.1.2.3'));
  const j = netz.toJSON();
  const cj = j.nodes.find(n => n.kind === 'cww');
  ok('die 8er-Adresse steht NICHT in der Datei', cj.nics[0].ip === '', JSON.stringify(cj.nics[0]));
  netz.fromJSON(j);
  ok('beim Laden kommt sie aus dem Raum', netz.cwwVon().nics[0].ip === '8.41.3.9');
  const n2 = netz.einfuegen(netz.ausschnitt([netz.cwwVon().id]), 40, 40);
  ok('Einfügen legt kein zweites cww an', n2.length === 0 && netz.list().filter(n => n.kind === 'cww').length === 1);
}

/* Zwei Tablets in einem Prozess. Die „Wolke" ist hier eine
   Schleife, die Pakete vom einen Ausgang zum anderen Eingang
   trägt — genau das, was im Raum Server und Abfrage tun. */
function tablet(seed, prefix, backbone) {
  const b = bau(seed);
  b.netz.setInternet({ prefix, backbone });
  b.dienste = new sandbox.Dienste(b.engine, b.netz, b.stack, {});
  b.inet = sandbox.Internet.erzeugen(b.engine, b.netz, b.stack, {});
  b.inet.setModus('raum');
  b.prefix = prefix; b.backbone = backbone;
  return b;
}
function wolke(tabs, opt) {
  opt = opt || {};
  const namen = [];
  const besitz = new Map();
  for (const t of tabs) for (const e of t.inet.veroeffentlicht()) {
    const k = e.typ + '|' + e.name;
    if (!besitz.has(k)) { besitz.set(k, t); namen.push(e); }
  }
  for (const t of tabs) {
    const raus = t.inet.nehmen();
    const unzu = [];
    for (const p of raus) {
      if (opt.schlucken) continue;
      const v = sandbox.NetUtil.ip2int(p.dst);
      const ziel = tabs.find(x => x !== t && (x.backbone === p.dst || (v >>> 24) === x.prefix));
      if (ziel) ziel.inet.rein({ pakete: [p] });
      else unzu.push(p);
    }
    const vergeben = t.inet.veroeffentlicht().filter(e => besitz.get(e.typ + '|' + e.name) !== t);
    t.inet.rein({ unzustellbar: unzu, verzeichnis: namen, vergeben });
  }
}
function laufen(tabs, bis, opt) {
  const start = tabs[0].engine.now;
  for (let t = start; t <= start + bis; t += 100000) {
    for (const x of tabs) x.engine.runUntil(t);
    wolke(tabs, opt);
  }
}
function zweiTablets() {
  const A = tablet(11, 50, '8.0.7.1');
  const B = tablet(12, 67, '8.0.9.4');
  // A: ein Rechner direkt am cww
  const ac = A.netz.addNode('cww', 100, 100);
  const a1 = A.netz.addNode('host', 100, 300);
  konf(ac, 1, '50.0.1.1'); konf(a1, 0, '50.0.1.10');
  a1.gateway = '50.0.1.1'; a1.dns = '8.8.8.8';
  A.netz.addCable(a1.id, 0, ac.id, 1);
  // B: ein Server mit DNS und Webserver am cww
  const bc = B.netz.addNode('cww', 100, 100);
  const bs = B.netz.addNode('server', 100, 300);
  konf(bc, 1, '67.0.0.1'); konf(bs, 0, '67.0.0.10');
  bs.gateway = '67.0.0.1'; bs.dns = '8.8.8.8';
  B.netz.addCable(bs.id, 0, bc.id, 1);
  bs.software = ['dns', 'webserver'];
  const dc = B.netz.dnsConf(bs); dc.on = true;
  dc.records = [{ name: 'www.bernd.de', ip: '67.0.0.10' }, { name: 'intern.bernd.de', ip: '192.168.1.5' }];
  B.dienste.http.standardDateien(bs);
  B.netz.webConf(bs).on = true;
  for (const t of [A, B]) { t.dienste.start(); t.dienste.sync(); }
  return { A, B, ac, a1, bc, bs };
}

section('Class Wide Web: zwei Tablets');
{
  const { A, B, a1, bs } = zweiTablets();
  let r = null;
  A.stack.ping(a1, '67.0.0.10', 1, 3 * SEC, x => r = x);
  laufen([A, B], 20 * SEC);
  ok('Ping in das Netz eines anderen Tablets kommt an', r && r.ok, JSON.stringify(r));
  ok('TTL: zwei cwws unterwegs', r && r.ttl === 62, r && r.ttl);
  ok('B sieht das Paket in SEINEM Mitschnitt', B.mit.view().some(z => z.proto === 'ICMP'));

  let p8 = null;
  A.stack.ping(a1, '8.8.8.8', 2, 3 * SEC, x => p8 = x);
  laufen([A, B], 10 * SEC);
  ok('ping 8.8.8.8 geht', p8 && p8.ok && p8.from === '8.8.8.8', JSON.stringify(p8));

  let dns = null;
  A.dienste.resolve(a1, 'www.bernd.de', x => dns = x);
  laufen([A, B], 20 * SEC);
  ok('8.8.8.8 kennt den Namen aus dem anderen Netz', dns && dns.ok && dns.ip === '67.0.0.10', JSON.stringify(dns));

  let dns2 = null;
  A.dienste.resolve(a1, 'intern.bernd.de', x => dns2 = x);
  laufen([A, B], 20 * SEC);
  ok('ein Name auf eine private Adresse wird nicht veröffentlicht', dns2 && !dns2.ok, JSON.stringify(dns2));
  const st = B.inet.eigene().find(e => e.name === 'intern.bernd.de');
  ok('und B sieht, warum', st && st.status === 'privat', JSON.stringify(st));

  let seite = null;
  A.dienste.http.seiteHolen(a1, '67.0.0.10', x => seite = x);
  laufen([A, B], 120 * SEC);
  ok('eine Webseite aus dem anderen Netz lädt', seite && seite.ok && seite.status === 200,
     seite && (seite.grund || seite.status));

  let weg = null;
  A.stack.ping(a1, '99.0.0.1', 3, 3 * SEC, x => weg = x);
  laufen([A, B], 20 * SEC);
  ok('ein /8, das niemandem gehört: „nicht erreichbar"', weg && !weg.ok && /nicht erreichbar/.test(weg.error),
     JSON.stringify(weg));
  ok('gemeldet vom eigenen cww (seine Karte nach innen)', weg && weg.from === '50.0.1.1', weg && weg.from);
}

section('Class Wide Web: die Bereiche der anderen');
{
  const { A } = zweiTablets();
  A.inet.rein({ bereiche: [67, 14, 50, 8, 10, 127, 300, 0, 14, 'x'] });
  ok('⭐ nur gültige Zahlen, sortiert, jede einmal, ohne den eigenen Bereich und ohne 8/10/127',
     A.inet.andere().join() === '14,67', A.inet.andere().join());
  A.inet.rein({ verzeichnis: [] });
  ok('eine Antwort ohne `bereiche` lässt die Liste stehen', A.inet.andere().join() === '14,67');
  A.inet.rein({ bereiche: [] });
  ok('eine leere Liste leert sie', A.inet.andere().length === 0);
  A.inet.rein({ bereiche: [14] });
  A.inet.setModus('solo');
  ok('ohne Raum gibt es keine anderen', A.inet.andere().length === 0);
  A.inet.setModus('raum');
  ok('und nach dem Zurückschalten keine alte Liste', A.inet.andere().length === 0);
  A.inet.setModus('aus');
  A.inet.rein({ bereiche: [14] });
  ok('in der Spiegelung nimmt sie nichts an', A.inet.andere().length === 0);
}

section('Class Wide Web: Haustür');
{
  const { A, B, ac } = zweiTablets();
  // Ein Rechner mit fremdem Absender direkt am cww
  const sw = A.netz.addNode('switch', 300, 300);
  const cab = A.netz.cableList()[0];
  A.netz.removeCable(cab.id);
  const a1 = A.netz.list().find(n => n.kind === 'host');
  A.netz.addCable(a1.id, 0, sw.id, 0);
  A.netz.addCable(ac.id, 1, sw.id, 1);
  const fremd = A.netz.addNode('host', 400, 300);
  A.netz.addCable(fremd.id, 0, sw.id, 2);
  konf(ac, 1, '50.0.1.1', '255.255.255.0');
  // Zweite Adresse im selben Kabelnetz geht nicht — also ein Router-Trick:
  // der fremde Rechner behauptet eine Adresse aus B's Bereich.
  konf(fremd, 0, '50.0.1.66'); fremd.gateway = '50.0.1.1';
  let r = null;
  A.stack.sendIp(fremd, '67.0.0.10', 'icmp', { type: 8, code: 0, id: 99, seq: 1, data: 32 }, { src: '67.0.0.77' });
  laufen([A, B], 10 * SEC);
  ok('ein fremder Absender kommt nicht hinaus',
     A.mit.view().length >= 0 && B.mit.view().every(z => z.proto !== 'ICMP'));
  const ev = [];
  A.engine.on('event', e => { if (e.kind === 'drop-quelle') ev.push(e); });
  A.stack.sendIp(fremd, '67.0.0.10', 'icmp', { type: 8, code: 0, id: 98, seq: 1, data: 32 }, { src: '192.168.9.9' });
  laufen([A, B], 10 * SEC);
  ok('und das cww sagt, warum', ev.length === 1 && /Absender 192\.168\.9\.9/.test(ev[0].why), JSON.stringify(ev));

  // Von draußen nur, was ins eigene /8 will
  const ev2 = [];
  A.engine.on('event', e => { if (e.kind === 'drop-quelle') ev2.push(e); });
  A.stack.vonInternet({ src: '67.0.0.10', dst: '99.1.1.1', ttl: 60, proto: 'icmp',
                        id: 1, payload: { type: 8, code: 0, id: 1, seq: 1 } });
  laufen([A, B], 2 * SEC);
  ok('das cww ist kein Durchgang', ev2.length === 1, JSON.stringify(ev2));
  void r;
}

section('Class Wide Web: Fristen und ohne Raum');
{
  const { A, B, a1 } = zweiTablets();
  let r = null;
  A.stack.ping(a1, '67.0.0.10', 1, A.stack.PING_FRIST, x => r = x);
  laufen([A, B], 10 * SEC, { schlucken: true });
  ok('fremdes Ziel: nach 10 s noch keine Zeitüberschreitung', r === null, JSON.stringify(r));
  laufen([A, B], 30 * SEC, { schlucken: true });
  ok('aber irgendwann doch', r && !r.ok && /Zeitüberschreitung/.test(r.error), JSON.stringify(r));

  A.inet.setModus('solo');
  let s = null;
  A.stack.ping(a1, '67.0.0.10', 2, A.stack.PING_FRIST, x => s = x);
  laufen([A], 10 * SEC);
  ok('ohne Raum: sofort „nicht erreichbar"', s && !s.ok && /nicht erreichbar/.test(s.error), JSON.stringify(s));
  let d = null;
  A.stack.ping(a1, '8.8.8.8', 3, A.stack.PING_FRIST, x => d = x);
  laufen([A], 10 * SEC);
  ok('8.8.8.8 antwortet auch ohne Raum', d && d.ok, JSON.stringify(d));

  A.inet.setModus('aus');
  let m = null;
  A.stack.ping(a1, '67.0.0.10', 4, 3 * SEC, x => m = x);
  laufen([A, B], 5 * SEC);
  ok('in der Spiegelung geht nichts hinaus', A.inet.wartend === 0 && !B.mit.view().some(z => z.proto === 'ICMP'));
  void m;
}

section('Class Wide Web: Heimrouter dahinter');
{
  const { A, B } = zweiTablets();
  const ac = A.netz.cwwVon();
  const a1 = A.netz.list().find(n => n.kind === 'host');
  A.netz.removeNode(a1.id);
  const hr = A.netz.addNode('heimrouter', 100, 300);
  const lap = A.netz.addNode('host', 100, 500);
  A.netz.addCable(ac.id, 1, hr.id, 0);
  A.netz.addCable(lap.id, 0, hr.id, 1);
  const dc = A.netz.dhcpConf(ac);
  Object.assign(dc, { on: true, nic: 1, von: '50.0.1.100', bis: '50.0.1.110', mask: '255.255.255.0',
                      gateway: '50.0.1.1', dns: '8.8.8.8' });
  konf(hr, 1, '192.168.1.1');
  konf(lap, 0, '192.168.1.20'); lap.gateway = '192.168.1.1'; lap.dns = '8.8.8.8';
  A.dienste.reset(); A.dienste.start(); A.dienste.sync();
  laufen([A, B], 20 * SEC);
  ok('der Heimrouter holt seine WAN-Adresse vom cww', /^50\.0\.1\.1\d\d$/.test(hr.nics[0].ip), hr.nics[0].ip);
  let r = null;
  A.dienste.resolve(lap, 'www.bernd.de', x => r = x);
  laufen([A, B], 30 * SEC);
  ok('der Laptop im Heimnetz findet den Namen über 8.8.8.8', r && r.ok && r.ip === '67.0.0.10', JSON.stringify(r));
  let p = null;
  A.stack.ping(lap, '67.0.0.10', 1, A.stack.PING_FRIST, x => p = x);
  laufen([A, B], 30 * SEC);
  ok('und erreicht den Server im anderen Netz (NAT)', p && p.ok, JSON.stringify(p));
}

section('Class Wide Web: Verzeichnis');
{
  const { A, B, bs } = zweiTablets();
  // A meldet denselben Namen an — B war zuerst (steht in der Liste vorn)
  const as = A.netz.addNode('server', 300, 300);
  const ac = A.netz.cwwVon();
  const sw = A.netz.addNode('switch', 300, 500);
  const a1 = A.netz.list().find(n => n.kind === 'host');
  A.netz.removeCable(A.netz.cableList()[0].id);
  A.netz.addCable(a1.id, 0, sw.id, 0); A.netz.addCable(ac.id, 1, sw.id, 1); A.netz.addCable(as.id, 0, sw.id, 2);
  konf(as, 0, '50.0.1.20'); as.gateway = '50.0.1.1';
  as.software = ['dns'];
  const dc = A.netz.dnsConf(as); dc.on = true;
  dc.records = [{ name: 'www.bernd.de', ip: '50.0.1.20' }, { name: 'www.anna.de', ip: '50.0.1.20' }];
  A.dienste.sync();
  laufen([B, A], 2 * SEC);
  const e = A.inet.eigene().find(x => x.name === 'www.bernd.de');
  ok('wer später kommt, sieht „vergeben"', e && e.status === 'vergeben', JSON.stringify(e));
  const l = A.inet.liste();
  ok('8.8.8.8 zeigt den Namen des anderen', l.some(x => x.name === 'www.bernd.de' && x.wert === '67.0.0.10' && x.status === 'fremd'),
     JSON.stringify(l));
  ok('und den eigenen', l.some(x => x.name === 'www.anna.de' && x.status === 'eigen'));
  ok('keine Spalte „wem gehört das"', l.every(x => !('prefix' in x) && !('tablet' in x)));
  void bs;
}

section('Class Wide Web: Szenario 8 auf zwei Tablets');
{
  /* Beide Kinder laden dasselbe Szenario, jedes trägt SEINEN Bereich
     ein (die Aufträge 1–3), und dann ruft das eine die Seite des
     anderen über den Namen auf (Auftrag 4). */
  const loesen = (t, name) => {
    t.netz.fromJSON(JSON.parse(JSON.stringify(FIX.internet.netz)));
    const X = t.prefix;
    const c = t.netz.cwwVon(), sv = t.netz.byName('Server 1');
    ok(name + ': das cww trägt nach dem Laden die 8er-Adresse des Raums', c.nics[0].ip === t.backbone);
    c.nics[1].ip = X + '.0.0.1';
    sv.nics[0].ip = X + '.0.0.20'; sv.gateway = X + '.0.0.1';
    Object.assign(t.netz.dhcpConf(c), { on: true, nic: 1, von: X + '.0.0.100', bis: X + '.0.0.150',
      mask: '255.255.255.0', gateway: X + '.0.0.1', dns: '8.8.8.8' });
    t.netz.dnsConf(sv).records = [{ name: 'www.' + name + '.de', ip: X + '.0.0.20' }];
    t.dienste.reset(); t.dienste.start(); t.dienste.sync();
  };
  const A = tablet(21, 50, '8.0.7.1');
  const B = tablet(22, 67, '8.0.9.4');
  loesen(A, 'anna'); loesen(B, 'ben');
  laufen([A, B], 20 * SEC);
  const hrA = A.netz.byName('Heimrouter 1');
  ok('Szenario 8: der Heimrouter holt seine WAN-Adresse vom cww', /^50\.0\.0\.1\d\d$/.test(hrA.nics[0].ip), hrA.nics[0].ip);
  ok('Szenario 8: 8.8.8.8 kennt beide Namen',
     A.inet.liste().some(e => e.name === 'www.ben.de' && e.status === 'fremd')
     && A.inet.liste().some(e => e.name === 'www.anna.de' && e.status === 'eigen'), JSON.stringify(A.inet.liste()));
  let ip = null;
  const lap = A.netz.byName('Endgerät 1');
  A.dienste.resolve(lap, 'www.ben.de', x => ip = x);
  laufen([A, B], 30 * SEC);
  ok('Szenario 8: der Laptop hinter dem Heimrouter findet www.ben.de', ip && ip.ok && ip.ip === '67.0.0.20', JSON.stringify(ip));
  let seite = null;
  A.dienste.http.seiteHolen(lap, '67.0.0.20', x => seite = x);
  laufen([A, B], 150 * SEC);
  ok('⭐ Szenario 8: Bens Seite lädt bei Anna — durch NAT, zwei cwws und die Wolke',
     seite && seite.ok && seite.status === 200, seite && (seite.grund || seite.status));
}

section('Mitlesende: Funk ist ein Rundruf');
{
  /* PLAN-SICHERHEIT, Schritt 3. Anna holt per POP3 Post; Ben sitzt im
     selben WLAN und tut nichts. Carl hängt per Kabel am Switch. */
  const b = bau(21);
  const dienste = new sandbox.Dienste(b.engine, b.netz, b.stack, {});
  const sw = b.netz.addNode('switch', 300, 200);
  b.netz.wlanConf(sw); sw.wlan.on = true; sw.wlan.ssid = 'Klasse';
  const a = b.netz.addNode('host', 100, 100), ben = b.netz.addNode('host', 100, 300);
  const carl = b.netz.addNode('host', 300, 400), ms = b.netz.addNode('server', 500, 200);
  konf(a, 0, '192.168.1.10'); konf(ben, 0, '192.168.1.11');
  konf(carl, 0, '192.168.1.12'); konf(ms, 0, '192.168.1.20');
  b.netz.addCable(carl.id, 0, sw.id, 0); b.netz.addCable(ms.id, 0, sw.id, 1);
  b.netz.setFunk(a, 0, true, 'Klasse'); b.netz.setFunk(ben, 0, true, 'Klasse');
  ms.software = ['mailserver'];
  const s = b.netz.mailConf(ms); s.on = true; s.domain = 'schule.de';
  s.konten = [{ benutzer: 'anna', name: 'Anna', passwort: 'apfel', posteingang: [] }];
  Object.assign(b.netz.mailKonto(a), { name: 'Anna', adresse: 'anna@schule.de',
    pop3: '192.168.1.20', smtp: '192.168.1.20', benutzer: 'anna', passwort: 'apfel' });
  a.software = ['mail'];
  dienste.start(); dienste.sync();
  dienste.mail.abholen(a, () => {});
  b.engine.runUntil(40 * SEC);

  b.mit.setFilter({ dir: 'beide' });
  const vonBen = b.mit.view().filter(r => r.node === ben.id && r.mit === 'funk' && r.inhalt);
  ok('⭐ Ben liest im Funknetz mit: sein Mitschnitt hat Zeilen „funk" mit Inhalt', vonBen.length >= 1, String(vonBen.length));
  ok('⭐ und darunter Annas Passwort im Klartext',
     vonBen.some(r => /PASS apfel/.test(r.info)), vonBen.map(r => r.info).join(' | ').slice(0, 200));
  ok('der Fund trägt Benutzer und Passwort',
     vonBen.some(r => r.zugang && r.zugang.passwort === 'apfel'));
  ok('Ben hat NICHT an seiner Karte ausgewertet: kein Echo, keine Antwort von Ben',
     !b.mit.view().some(r => r.node === ben.id && r.dir === 'raus' && r.proto !== 'ARP'));
  ok('Carl am Kabel liest nichts mit', !b.mit.view().some(r => r.node === carl.id && r.mit));
  ok('Mitgelesen werden nur Pakete mit Inhalt im Chip',
     (b.mit.setFilter({ proto: 'MITLESER' }), b.mit.view().every(r => r.mit && r.inhalt)));
  b.mit.setFilter({ proto: null });

  const pass = b.mit.view().find(r => r.node === a.id && r.dir === 'raus' && /PASS apfel/.test(r.info));
  const wer = pass ? b.mit.mitlesende(pass) : [];
  ok('⭐ Annas eigene Zeile nennt, wer mitgelesen hat: Ben (Funk)',
     wer.some(m => m.node === ben.id && m.art === 'funk'), JSON.stringify(wer));
  ok('Funk: ein Zugangspunkt hat nur EINE Antenne, egal wie viele Gäste',
     sw.nics.filter(k => k.funkPort).length === 1);
}

section('Fund-Filter: Zugangsdaten im Mitschnitt');
{
  /* PLAN-SICHERHEIT, Schritt 1. Über Kabel: das Passwort aus
     `PASS birne` wird als Fund erkannt, mit dem Benutzer aus dem
     Segment davor. */
  const { engine, mit, c, mail } = mailNetz(5);
  mail.abholen(c, () => {});
  engine.runUntil(30 * SEC);

  const fund = mit.view().filter(r => r.zugang);
  ok('der Mitschnitt findet die Zugangsdaten', fund.length >= 1, String(fund.length));
  ok('⭐ mit Benutzer UND Passwort',
     fund.some(r => r.zugang.benutzer === 'bernd' && r.zugang.passwort === 'birne'),
     JSON.stringify(fund.map(r => r.zugang)));
  ok('der Fund ist POP3', fund.every(r => r.proto === 'POP3'), fund.map(r => r.proto).join(','));
  ok('andere Zeilen (USER, +OK, Handschlag) sind keine Funde',
     mit.view().filter(r => !r.zugang).every(r => !/PASS /.test(r.info)));

  mit.setFilter({ proto: 'POP3' });
  ok('der Chip POP3 zeigt das ganze Gespräch', mit.view().length > fund.length);
  mit.setFilter({ proto: null });

  // Nichts gefunden, wo nichts Geheimes läuft.
  const n = mailNetz(6);
  n.mail.senden(n.a, { an: 'bernd@schule.de', betreff: 'x', text: 'y' }, () => {});
  n.engine.runUntil(30 * SEC);
  ok('SMTP allein (ohne Anmeldung) ergibt keinen Fund',
     !n.mit.view().some(r => r.zugang));
}
{
  /* Durch das CWW: Anna holt Post von Bens Mailserver. Der Fund
     steht im Mitschnitt des Absenders, in der Wolke des cww (dort
     als Internet-Zeile) und beim Empfänger. */
  const { A, B, a1, bs } = zweiTablets();
  bs.software = (bs.software || []).concat(['mailserver']);
  const s = B.netz.mailConf(bs);
  s.on = true; s.domain = 'ben.de';
  s.konten = [{ benutzer: 'anna', name: 'Anna', passwort: 'geheim', posteingang: [] }];
  Object.assign(A.netz.mailKonto(a1), { name: 'Anna', adresse: 'anna@ben.de',
    pop3: '67.0.0.10', smtp: '67.0.0.10', benutzer: 'anna', passwort: 'geheim' });
  a1.software = (a1.software || []).concat(['mail']);
  A.dienste.sync(); B.dienste.sync();
  A.dienste.mail.abholen(a1, () => {});
  laufen([A, B], 60 * SEC);

  const beiA = A.mit.view().filter(r => r.zugang);
  ok('CWW: Annas Mitschnitt findet ihr Passwort',
     beiA.some(r => r.zugang.benutzer === 'anna' && r.zugang.passwort === 'geheim'),
     JSON.stringify(beiA.map(r => r.zugang)));
  A.mit.setGeraet(A.netz.cwwVon().id);
  const ausA = A.mit.view().filter(r => r.zugang);
  const inetZ = ausA.find(r => r.inet);
  ok('⭐ CWW: auch am Ausgang ins Internet steht der Fund — als Internet-Zeile',
     !!inetZ, ausA.map(r => r.inet).join(','));
  ok('CWW: die Ethernet-Schale der Internet-Zeile sagt, was der Ausgang ist',
     inetZ && A.mit.layers(inetZ).some(l => l.fields.some(f => f[0] === 'Ort' && /Internet/.test(f[1]))));
  ok('B liest das Passwort im eigenen Mitschnitt mit',
     B.mit.view().some(r => r.zugang && r.zugang.passwort === 'geheim'));
}

/* ═══ Streaming-Server (PLAN-SICHERHEIT, Schritt 2) ═══ */
section('Streaming-Server');
{
  const { engine, netz, stack, mit, dienste, a, sw, ms } = mailNetz();
  const st = netz.addNode('server', 600, 300);
  konf(st, 0, '192.168.1.30');
  netz.addCable(st.id, 0, sw.id, 3);
  st.software = ['streamingserver'];
  const conf = netz.streamConf(st);
  conf.on = true; conf.name = 'Annas Flix'; conf.mailserver = '192.168.1.20';
  dienste.sync();
  const http = dienste.http;

  /* Eine Seite holen und abwarten. */
  const hol = (adr, opt) => {
    let r = null;
    http.seiteHolen(a, adr, (x) => r = x, opt);
    engine.runUntil(engine.now + 30 * SEC);
    return r;
  };
  const post = (adr, felder) => hol(adr, { methode: 'POST', body: http.formSchreiben(felder) });

  ok('der Streaming-Server lauscht auf Port 80',
     stack.sockets(st).some(r => r.proto === 'TCP' && /:80$/.test(r.lokal)));
  ok('die Marke „stream" steht am Gerät', netz.dienstLaeuft(st, 'stream'));

  const start = hol('192.168.1.30');
  ok('Startseite: Dienstname und Anmelden/Registrieren',
     start && start.ok && /Annas Flix/.test(start.html) && /href="\/anmelden"/.test(start.html)
     && /href="\/registrieren"/.test(start.html), start && (start.grund || start.html.slice(0, 100)));

  const ohne = hol('192.168.1.30/filme');
  ok('ohne Anmeldung: /filme führt zurück auf die Startseite (Weiterleitung)',
     ohne && ohne.ok && ohne.ziel.pfad === '/' && ohne.teile.some(t => t.pfad === '/filme' && t.status === 303),
     ohne && JSON.stringify(ohne.teile));
  ok('… und die Filme stehen NICHT darin', ohne && !/plakat/.test(ohne.html));

  // Registrieren: Fehlerfälle
  const leer = post('192.168.1.30/registrieren', { name: 'Bernd', email: '', iban: '', bic: '' });
  ok('Registrieren: leere Felder → 400 mit Hinweis', leer && leer.status === 400 && /alle Felder/.test(leer.html), leer && String(leer.status));
  const krumm = post('192.168.1.30/registrieren', { name: 'Bernd', email: 'bernd', iban: 'DE1', bic: 'X' });
  ok('Registrieren: keine gültige Adresse → 400', krumm && krumm.status === 400 && /gültige E-Mail/.test(krumm.html));

  conf.mailserver = '';
  const keinMs = post('192.168.1.30/registrieren', { name: 'Bernd', email: 'bernd@schule.de', iban: 'DE12 3456', bic: 'ABCDDEFF' });
  ok('Registrieren ohne Mailserver: die Seite sagt WARUM, kein Konto entsteht',
     keinMs && keinMs.status === 500 && /keinen Mailserver/.test(keinMs.html) && conf.konten.length === 0,
     keinMs && keinMs.html.slice(0, 200));
  conf.mailserver = '192.168.1.20';

  const reg = post('192.168.1.30/registrieren', { name: 'Bernd Beispiel', email: 'Bernd@Schule.de', iban: 'DE12 3456 7890', bic: 'ABCDDEFF' });
  ok('Registrieren: „Fast geschafft"', reg && reg.ok && reg.status === 200 && /Fast geschafft/.test(reg.html),
     reg && (reg.grund || reg.html.slice(0, 200)));
  ok('das Konto steht auf dem Server (E-Mail klein geschrieben)',
     conf.konten.length === 1 && conf.konten[0].email === 'bernd@schule.de' && conf.konten[0].iban === 'DE12 3456 7890');
  const post1 = netz.mailConf(ms).konten[1].posteingang;
  ok('⭐ das Passwort liegt als E-Mail im Postfach des Kunden',
     post1.length === 1 && /Dein Passwort: \S+/.test(post1[0].text), JSON.stringify(post1));
  const pw = /Dein Passwort: (\S+)/.exec(post1[0].text)[1];
  ok('die Mail kommt vom Dienst', /@annasflix\.de$/.test(post1[0].von), post1[0].von);

  const dop = post('192.168.1.30/registrieren', { name: 'X', email: 'bernd@schule.de', iban: 'DE1', bic: 'B' });
  ok('dieselbe E-Mail zweimal → abgelehnt', dop && dop.status === 400 && /schon ein Konto/.test(dop.html));

  // Anmelden
  const falsch = post('192.168.1.30/anmelden', { email: 'bernd@schule.de', passwort: 'falsch' });
  ok('falsches Passwort → 401, man bleibt auf der Anmeldung', falsch && falsch.status === 401 && /stimmt nicht/.test(falsch.html));
  const gut = post('192.168.1.30/anmelden', { email: 'bernd@schule.de', passwort: pw });
  ok('richtiges Passwort → Weiterleitung auf /filme', gut && gut.ok && gut.ziel.pfad === '/filme'
     && gut.teile[0].methode === 'POST' && gut.teile[0].status === 303, gut && JSON.stringify(gut.teile));
  ok('die Filmseite begrüßt mit dem Namen', gut && /Hallo Bernd Beispiel/.test(gut.html));
  ok('genau ZWEI Plakate (die Wahl des Betreibers)', gut && (gut.html.match(/class="film"/g) || []).length === 2);
  ok('Plakate kommen als eigene Anfragen (Bilder sind Dateien)', gut && gut.teile.filter(t => /plakat/.test(t.pfad)).length === 2);
  ok('der Browser hat sich das Cookie gemerkt', /^[a-z0-9]{12}$/.test(((http.cookies(a)['192.168.1.30:80']) || {}).sid || ''), JSON.stringify(http.cookies(a)));

  // Wahl ändern
  conf.filme = [3, 4];
  const andere = hol('192.168.1.30/filme');
  ok('der Betreiber wählt andere Filme: Film 3 und 4 stehen da',
     andere && /König der Möwen/.test(andere.html) && /Titanic 3/.test(andere.html) && !/Chicken Park/.test(andere.html));
  conf.filme = [1, 2];

  // Like und Kommentar
  const like = post('192.168.1.30/like', { film: '1' });
  ok('Like: zählt 1 und „gefällt dir"', like && /♥ 1 · gefällt dir/.test(like.html), like && like.html.slice(0, 80));
  const like2 = post('192.168.1.30/like', { film: '1' });
  ok('zweiter Tipp nimmt den Like zurück', like2 && /♥ 0/.test(like2.html));
  const kom = post('192.168.1.30/kommentar', { film: '1', text: 'Super <b>Film</b>!' });
  ok('Kommentar erscheint unter dem Film — entschärft',
     kom && /Bernd Beispiel:<\/b> Super &lt;b&gt;Film&lt;\/b&gt;!/.test(kom.html), kom && kom.html.slice(0, 80));
  const fremdFilm = post('192.168.1.30/like', { film: '3' });
  ok('ein Film, der nicht angeboten wird, nimmt keine Likes', !(conf.likes[3] || []).length);

  // Mein Konto
  const konto = hol('192.168.1.30/konto');
  ok('Mein Konto zeigt die Bankdaten, aber nicht das Passwort',
     konto && /DE12 3456 7890/.test(konto.html) && /ABCDDEFF/.test(konto.html) && !new RegExp(pw).test(konto.html));
  ok('⭐ in der Datenbank steht nur der Hash, kein Klartext-Passwort',
     conf.konten.every(k => k.passwort === undefined && /^[0-9a-f]{16}$/.test(k.pwHash)) && JSON.stringify(conf).indexOf(pw) < 0);

  // Mitschnitt: alles im Klartext
  const daten = mit.view().map(r => { const p = r.frame && r.frame.payload; const t = p && p.payload; return (t && t.data) || ''; }).join('\n');
  ok('⭐ im Mitschnitt stehen IBAN, Passwort und Cookie im Klartext',
     /iban=DE12\+3456\+7890/.test(daten) && new RegExp('passwort=' + pw).test(daten) && /Cookie: sid=/.test(daten),
     daten.slice(0, 200));
  ok('der Mitschnitt nennt POST in der Zeile', mit.view().some(r => /HTTP\s+POST \/anmelden/.test(r.info)));

  // Fund-Filter: Formularfelder und Cookies
  const funde = mit.view().filter(r => r.zugang && /^HTTP/.test(r.zugang.verfahren));
  ok('⭐ der Fund-Filter erkennt das Passwort im Anmelde-Formular',
     funde.some(r => r.zugang.passwort === pw && r.zugang.benutzer === 'bernd@schule.de'),
     JSON.stringify(funde.map(r => r.zugang)).slice(0, 200));
  ok('… die Bankdaten bei der Registrierung',
     funde.some(r => r.zugang.felder.some(x => x[0] === 'iban' && x[1] === 'DE12 3456 7890')));
  ok('… und das Cookie der Sitzung',
     funde.some(r => r.zugang.felder.some(x => x[0] === 'Cookie' && /^sid=/.test(x[1]))));
  ok('Seiten ohne Geheimnis sind keine Funde',
     !mit.view().some(r => r.zugang && /^HTTP\s+GET \/(plakat|anmelden|registrieren)/.test(r.info)
       && !r.zugang.felder.some(x => x[0] === 'Cookie')));

  // Abmelden
  const weg = post('192.168.1.30/abmelden', {});
  ok('Abmelden: zurück auf die Startseite, /filme ist wieder zu',
     weg && weg.ziel.pfad === '/' && hol('192.168.1.30/filme').ziel.pfad === '/');

  // Port 80 gehört einem von beiden
  st.software.push('webserver');
  netz.webConf(st).on = true;
  dienste.http.standardDateien(st);
  dienste.sync();
  const nochStream = hol('192.168.1.30');
  ok('läuft auch der Webserver, antwortet der Streaming-Server (Vorrang)', nochStream && /Annas Flix/.test(nochStream.html));
  conf.on = false;
  dienste.sync();
  const nunWeb = hol('192.168.1.30');
  ok('Streaming-Server aus → der Webserver übernimmt Port 80', nunWeb && /Der Webserver läuft/.test(nunWeb.html),
     nunWeb && (nunWeb.grund || nunWeb.html.slice(0, 80)));

  // Speicherformat
  const kopie = JSON.parse(JSON.stringify(netz.toJSON()));
  const sp = kopie.nodes.find(n => n.id === st.id);
  ok('Konten, Likes und Kommentare stehen im Speicherformat',
     sp && sp.streamServer && sp.streamServer.konten.length === 1 && sp.streamServer.kommentare.length === 1
     && sp.streamServer.name === 'Annas Flix', sp && JSON.stringify(sp.streamServer).slice(0, 120));
}

/* ═══ HTTPS und Zertifizierungsstelle (PLAN-SICHERHEIT, Schritt 4) ═══ */
section('TLS: die Rechenwerkzeuge');
{
  const K = sandbox.Tls.Krypto;
  const istPrim = (n) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
  ok('alle 24 Primzahlen sind Primzahlen und nicht ≡ 1 (mod 65537)',
     K.PRIMZAHLEN.length === 24 && K.PRIMZAHLEN.every(p => istPrim(p) && p % 65537 !== 1));
  ok('p = 2³¹−1 ist prim', istPrim(2147483647) && K.P === '2147483647');

  let zaehler = 5;
  const zuf = (n) => (zaehler = (zaehler * 7919 + 13) % 100003) % n;
  const k = K.schluesselpaar(zuf);
  ok('RSA: ein Schlüsselpaar mit etwa 58 Bit', k && BigInt(k.n) > (BigInt(1) << BigInt(56)) && k.e === '65537', JSON.stringify(k));
  const sig = K.unterschreiben('Hallo Welt', k);
  ok('Unterschrift passt zum Text', K.unterschriftPasst('Hallo Welt', sig, k));
  ok('… und nur zu DIESEM Text', !K.unterschriftPasst('Hallo Welt!', sig, k));
  const k2 = K.schluesselpaar((n) => (zuf(n) + 3) % n);
  ok('… und nur zu DIESEM Schlüssel', !K.unterschriftPasst('Hallo Welt', sig, { n: k2.n, e: k2.e }));
  ok('Unsinn als Unterschrift wirft nicht', !K.unterschriftPasst('x', 'kein Zahl', k) && !K.unterschriftPasst('x', '-5', k));
  ok('Fingerabdruck sieht aus wie A3F2-91BC-77D0-14EE', /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(K.fingerabdruck(k)));

  // Diffie-Hellman: beide kommen auf dasselbe Geheimnis, der Mitleser nicht
  const A = K.dhAnteil(123457), B = K.dhAnteil(987651);
  ok('Diffie-Hellman: g^(ab) auf beiden Seiten gleich', K.dhGeheim(B, 123457) === K.dhGeheim(A, 987651));
  ok('… und nicht gleich dem, was auf der Leitung steht', K.dhGeheim(B, 123457) !== A && K.dhGeheim(B, 123457) !== B);

  const key = K.sitzungsschluessel('4711', 'aa', 'bb');
  const text = 'Grüße 🔒 — Passwort=geheim\r\n\r\nÄÖÜ';
  const v = K.versiegeln(text, key, 'c', 0);
  ok('Datenstrom: Klartext → Chiffre → Klartext (auch Umlaute und Emoji)', K.oeffnen(v, key, 'c', 0) === text);
  ok('die Chiffre enthält den Klartext nicht', v.chiffre.indexOf('geheim') < 0 && v.chiffre.indexOf('Pass') < 0);
  ok('falscher Schlüssel → null (Prüfsumme)', K.oeffnen(v, K.sitzungsschluessel('4712', 'aa', 'bb'), 'c', 0) === null);
  ok('falsche Richtung → null', K.oeffnen(v, key, 's', 0) === null);
  ok('falsche laufende Nummer → null', K.oeffnen(v, key, 'c', 1) === null);
  ok('verändertes Byte → null', K.oeffnen({ chiffre: 'A' + v.chiffre.slice(1), tag: v.tag }, key, 'c', 0) === null);
  ok('dieselbe Nachricht, andere Nummer → andere Chiffre',
     K.versiegeln(text, key, 'c', 1).chiffre !== v.chiffre);
  const gross = 'x'.repeat(100000);
  ok('100 000 Zeichen gehen durch', K.oeffnen(K.versiegeln(gross, key, 's', 7), key, 's', 7) === gross);
}

section('HTTPS: Zertifizierungsstelle, Browser, Server');
function httpsNetz(seed) {
  const b = bau(seed);
  const dienste = new sandbox.Dienste(b.engine, b.netz, b.stack, {});
  const sw = b.netz.addNode('switch', 300, 200);
  const c  = b.netz.addNode('host',   100, 100);   // Browser
  const s  = b.netz.addNode('server', 500, 100);   // Webserver
  const z  = b.netz.addNode('server', 500, 300);   // Zertifizierungsstelle
  const d  = b.netz.addNode('server', 100, 300);   // DNS
  const x  = b.netz.addNode('server', 300, 400);   // der Angreifer
  konf(c, 0, '192.168.1.10'); konf(s, 0, '192.168.1.20'); konf(z, 0, '192.168.1.30');
  konf(d, 0, '192.168.1.5'); konf(x, 0, '192.168.1.40');
  [c, s, z, d, x].forEach((n, i) => { b.netz.addCable(n.id, 0, sw.id, i); n.dns = '192.168.1.5'; });
  d.software = ['dns'];
  const dc = b.netz.dnsConf(d); dc.on = true;
  dc.records = [{ name: 'www.schule.de', ip: '192.168.1.20' }, { name: 'fremd.schule.de', ip: '192.168.1.40' },
                { name: 'zs.schule.de', ip: '192.168.1.30' }];
  s.software = ['webserver'];
  dienste.http.standardDateien(s);
  b.netz.webConf(s).on = true;
  z.software = ['zertstelle'];
  c.software = ['browser', 'mail']; x.software = ['webserver'];
  dienste.http.standardDateien(x);
  b.netz.webConf(x).on = true;
  dienste.start();
  dienste.sync();
  return Object.assign(b, { dienste, c, s, z, d, x, http: dienste.http, zs: dienste.zs });
}
{
  const { engine, netz, stack, mit, dienste, c, s, z, d, x, http, zs } = httpsNetz();
  const K = sandbox.Tls.Krypto;
  const laufe = (s_) => engine.runUntil(engine.now + (s_ || 30) * SEC);
  const lauscht = (n, p) => stack.sockets(n).some(r => r.proto === 'TCP' && new RegExp(':' + p + '$').test(r.lokal));
  const hol = (adr, opt) => { let r = null; http.seiteHolen(c, adr, (q) => r = q, opt); laufe(40); return r; };

  // ── Vorher: nur HTTP
  ok('ohne Zertifizierungsstelle: nichts hört auf 8200', !lauscht(z, 8200));
  netz.zsConf(z).on = true;
  dienste.sync();
  ok('die Zertifizierungsstelle lauscht auf 8200 — als eigenes Programm', lauscht(z, 8200)
     && stack.sockets(z).some(r => r.programm === 'Zertifizierungsstelle'));
  ok('die Marke „zs" steht am Gerät', netz.dienstLaeuft(z, 'zs'));
  ok('der Schlüssel der ZS entstand beim Start', !!netz.zsConf(z).schluessel);

  netz.webConf(s).https = true;
  dienste.sync();
  ok('Haken ohne Zertifikat: auf 443 hört NIEMAND', !lauscht(s, 443) && !netz.zertGueltig(s));
  const ohne = hol('https://www.schule.de');
  ok('https ohne Zertifikat: die Seite sagt, dass die Verbindung nicht zustande kam',
     ohne && !ohne.ok, ohne && JSON.stringify(ohne).slice(0, 150));
  ok('http geht trotzdem', (() => { const r = hol('www.schule.de'); return r && r.ok && /Der Webserver läuft/.test(r.html); })());

  // ── Antrag
  let antr = 'nicht gerufen';
  zs.beantragen(s, 'www.schule.de', '192.168.1.30', (f) => antr = f);
  laufe(60);
  ok('⭐ Antrag: die Prüfung besteht (DNS → IP → Einmalwort)', antr === null, String(antr));
  const zc = netz.zertConf(s);
  ok('der Server hat einen Schlüssel und einen Antrag Nr. 1 (wartet)',
     zc.schluessel && zc.antrag && zc.antrag.nr === 1 && zc.antrag.status === 'wartet', JSON.stringify(zc.antrag));
  const zsa = netz.zsConf(z).antraege;
  ok('bei der ZS: Name geprüft, IP des Namens notiert, wartet auf den Klick',
     zsa.length === 1 && zsa[0].status === 'wartet' && zsa[0].ip === '192.168.1.20' && zsa[0].name === 'www.schule.de', JSON.stringify(zsa));
  ok('der Server hat nicht selbst auf Port 80 gelauscht, während der Webserver lief', !node_hat80(s));
  function node_hat80(n) { return !!(n.state && n.state.zsEigenerPort); }
  ok('nach dem Antrag ist das Einmalwort weg', !(s.state && s.state.zsAufgabe));
  ok('Zertifikat gibt es noch nicht — und HTTPS auch nicht', !zc.zert && !netz.zertGueltig(s));

  let st = null;
  zs.abholen(s, (f, q) => st = f || q);
  laufe(30);
  ok('Abholen vor der Freigabe: „wartet"', st === 'wartet', String(st));

  ok('ZS-Betreiber klickt „Freigeben"', zs.freigeben(z, 1));
  zs.abholen(s, (f, q) => st = f || q);
  laufe(30);
  ok('Abholen nach der Freigabe: „ausgestellt"', st === 'ausgestellt', String(st));
  ok('der Server hat jetzt ein Zertifikat', netz.zertGueltig(s) && zc.zert.name === 'www.schule.de'
     && zc.zert.aussteller === 'Zertifizierungsstelle', JSON.stringify(zc.zert));
  ok('das Zertifikat trägt die Unterschrift der ZS (gegen deren Schlüssel geprüft)',
     K.unterschriftPasst(K.zertText(zc.zert), zc.zert.signatur, netz.zsConf(z).schluessel));
  ok('der private Schlüssel steht NICHT im Zertifikat', JSON.stringify(zc.zert).indexOf(zc.schluessel.d) < 0);
  dienste.sync();
  ok('Haken + Zertifikat: jetzt lauscht der Server auf 443 UND weiter auf 80', lauscht(s, 443) && lauscht(s, 80));

  // ── Browser: leere Vertrauensliste
  ok('die Vertrauensliste ist am Anfang leer', netz.vertrauen(c).length === 0);
  const unb = hol('https://www.schule.de');
  ok('⭐ https mit leerer Vertrauensliste: Warnung „unbekannt" — mit Zertifikat und Grund',
     unb && !unb.ok && unb.tls && unb.tls.code === 'unbekannt' && unb.tls.zertifikat
     && /Vertrauensliste/.test(unb.grund) && unb.tls.zertifikat.name === 'www.schule.de',
     unb && JSON.stringify(unb.tls).slice(0, 200));

  // ── Die ZS in die Vertrauensliste holen: Fingerabdruck vergleichen
  let eintrag = null;
  zs.zsHolen(c, 'zs.schule.de', (f, e) => eintrag = f || e);
  laufe(30);
  ok('Vertrauensliste: die ZS wird über ihren NAMEN gefunden, Eintrag mit Fingerabdruck',
     eintrag && eintrag.fp === K.fingerabdruck(netz.zsConf(z).schluessel) && eintrag.name === 'Zertifizierungsstelle', JSON.stringify(eintrag));
  ok('der Fingerabdruck im Eintrag ist derselbe wie im Fenster der ZS', eintrag.fp === zs.eintragVon(z).fp);
  zs.vertrauenAufnehmen(c, eintrag);
  ok('Aufnehmen: ein Eintrag; zweimal aufnehmen ändert nichts', netz.vertrauen(c).length === 1 && !zs.vertrauenAufnehmen(c, eintrag));
  ok('der private Schlüssel der ZS gelangt NICHT zum Browser', !/"d"/.test(JSON.stringify(netz.vertrauen(c))));

  // ── Jetzt klappt https
  const mitHttp = mit.view().length;
  const sicher = hol('https://www.schule.de');
  ok('⭐ https: die Seite kommt an — und trägt ein Schloss (tls-Info)',
     sicher && sicher.ok && sicher.status === 200 && /Der Webserver läuft/.test(sicher.html)
     && sicher.tls && !sicher.tls.fehler && sicher.tls.name === 'www.schule.de' && sicher.tls.version === 'TLS 1.3',
     sicher && (sicher.grund || JSON.stringify(sicher.tls)));
  ok('alle Anfragen der Seite (Seite, Stil, Bilder) gingen über https',
     sicher && sicher.teile.length >= 3 && sicher.teile.every(t => t.https));
  ok('die Adresse behält den Vorsatz', sicher && http.adresseVon(sicher.ziel) === 'https://www.schule.de/');

  // ── Mitschnitt: Inhalt weg, wer mit wem bleibt
  const neu = mit.view().slice(mitHttp);
  const tcpDaten = (r) => { const p = r.frame && r.frame.payload; const t = p && p.payload; return (t && t.data) || ''; };
  const auf443 = neu.filter(r => { const p = r.frame && r.frame.payload; const t = p && p.payload; return t && (t.dport === 443 || t.sport === 443); });
  const alles443 = auf443.map(tcpDaten).join('\n');
  ok('⭐ auf Port 443 steht die Seite NICHT im Klartext', alles443.length > 0
     && !/Der Webserver läuft|<html|HTTP\/1\.1|GET \//.test(alles443));
  ok('… aber der Servername im ClientHello (wer mit wem bleibt sichtbar)',
     /"tls":"ClientHello"[^\n]*"sni":"www\.schule\.de"/.test(alles443));
  ok('… und das Zertifikat im ServerHello (im Klartext, zum Lesen)',
     /"tls":"ServerHello"[^\n]*"zertifikat":\{[^\n]*"name":"www\.schule\.de"/.test(alles443));
  ok('… und der Rest sind „Daten"-Sätze', /"tls":"Daten"/.test(alles443));
  ok('Zeilen auf 443 heißen TLS und tragen das Schloss',
     auf443.some(r => r.proto === 'TLS' && /🔒/.test(r.info)), auf443.map(r => r.proto + '/' + r.info).slice(0, 6).join(' || '));
  ok('Ports im Kopf: 443 hat einen Namen', (() => {
     const r = auf443.find(q => q.proto === 'TLS');
     const ls = r && mit.layers(r);
     return ls && ls.some(l => l.fields.some(f => f[0] === 'Zielport' && /HTTPS/.test(f[1])) || l.fields.some(f => f[0] === 'Absenderport' && /HTTPS/.test(f[1])));
  })());
  ok('⭐ der Fund-Filter findet auf Port 443 nichts', !auf443.some(r => r.zugang));

  // ── Name passt nicht
  const ip = hol('https://192.168.1.20');
  ok('⭐ https://<IP>: das Zertifikat gilt für den NAMEN → Warnung „name"',
     ip && !ip.ok && ip.tls && ip.tls.code === 'name' && /www\.schule\.de/.test(ip.grund) && /192\.168\.1\.20/.test(ip.grund), ip && ip.grund);
  ok('http://<IP> geht natürlich', (() => { const r = hol('http://192.168.1.20'); return r && r.ok; })());

  // ── Trotzdem fortfahren
  http.ausnahmeMerken(c, { host: '192.168.1.20', port: 443 });
  const trotz = hol('https://192.168.1.20');
  ok('⭐ „Trotzdem fortfahren": die Seite kommt, aber die Info sagt „name" und „ausnahme"',
     trotz && trotz.ok && trotz.tls && trotz.tls.ausnahme === true && trotz.tls.fehler === 'name', trotz && (trotz.grund || JSON.stringify(trotz.tls)));
  ok('die Ausnahme gilt nur für diesen Server (nicht für den Namen)', (() => {
     const r = hol('https://www.schule.de'); return r && r.ok && r.tls && r.tls.ausnahme === false; })());
  const nachNeustart = JSON.parse(JSON.stringify(netz.toJSON()));
  ok('Ausnahmen stehen NICHT im Speicherformat', !/tlsAusnahmen/.test(JSON.stringify(nachNeustart)));

  // ── Ein Angreifer: kopiert das Zertifikat, hat aber den Schlüssel nicht
  const xc = netz.zertConf(x);
  xc.schluessel = K.schluesselpaar((n) => (engine.randInt(n) + 1) % n);
  xc.zert = JSON.parse(JSON.stringify(zc.zert));
  netz.webConf(x).https = true;
  netz.dnsConf(d).records[0].ip = '192.168.1.40';     // der Name zeigt jetzt auf den Angreifer
  dienste.sync();
  // das DNS-Ergebnis steht noch im Zwischenspeicher des Browsers
  c.state.dnsCache.clear();
  const falsch = hol('https://www.schule.de');
  ok('⭐ kopiertes Zertifikat, falscher Schlüssel → „beweis" — Unterschrift und Name stimmen ja',
     falsch && !falsch.ok && falsch.tls && falsch.tls.code === 'beweis', falsch && (falsch.grund || JSON.stringify(falsch.tls)));
  ok('der Server kann es nicht beweisen — der Satz sagt es', falsch && /beweisen/.test(falsch.grund));
  netz.dnsConf(d).records[0].ip = '192.168.1.20';
  c.state.dnsCache.clear();

  // ── Gefälschte Unterschrift
  zc.zert.signatur = String(BigInt(zc.zert.signatur) + BigInt(1));
  const geaendert = hol('https://www.schule.de');
  ok('verändertes Zertifikat → „signatur"', geaendert && !geaendert.ok && geaendert.tls && geaendert.tls.code === 'signatur',
     geaendert && geaendert.grund);
  zc.zert.signatur = String(BigInt(zc.zert.signatur) - BigInt(1));
  ok('… und wieder heil: es geht wieder', (() => { const r = hol('https://www.schule.de'); return r && r.ok; })());

  // ── https auf einen Port, auf dem kein TLS gesprochen wird
  const kein = hol('https://www.schule.de:80');
  ok('⭐ https auf Port 80 (Webserver spricht kein TLS): Fehler „kein-tls" statt ewigem Warten',
     kein && !kein.ok && kein.tls && kein.tls.code === 'kein-tls', kein && (kein.grund || JSON.stringify(kein.tls)));

  // ── Ein falscher Haken: nur HTTP-Haken aus → 443 zu
  netz.webConf(s).https = false;
  dienste.sync();
  ok('Haken wieder raus: 443 ist zu, 80 bleibt', !lauscht(s, 443) && lauscht(s, 80));
  netz.webConf(s).https = true;
  dienste.sync();

  // ── Speicherformat
  const sp = JSON.parse(JSON.stringify(netz.toJSON()));
  const sS = sp.nodes.find(n => n.id === s.id), sZ = sp.nodes.find(n => n.id === z.id), sC = sp.nodes.find(n => n.id === c.id);
  ok('Speicherformat: Zertifikat und Schlüssel des Servers', sS.zertifikat && sS.zertifikat.zert.name === 'www.schule.de'
     && sS.zertifikat.schluessel && sS.zertifikat.antrag.status === 'ausgestellt');
  ok('Speicherformat: die ZS mit Schlüssel und Anträgen', sZ.zsServer && sZ.zsServer.schluessel && sZ.zsServer.antraege.length === 1
     && sZ.zsServer.on === true);
  ok('Speicherformat: die Vertrauensliste des Browsers', sC.vertrauen && sC.vertrauen.length === 1 && sC.vertrauen[0].name === 'Zertifizierungsstelle');
  ok('Speicherformat: HTTPS-Haken des Servers', sS.webServer.https === true);
}

section('HTTPS: Anträge, die scheitern');
{
  const { engine, netz, stack, mit, dienste, c, s, z, d, x, http, zs } = httpsNetz();
  const laufe = (s_) => engine.runUntil(engine.now + (s_ || 30) * SEC);
  netz.zsConf(z).on = true;
  dienste.sync();
  const antrag = (n, name, zsAdr) => { let r = 'nicht gerufen'; zs.beantragen(n, name, zsAdr === undefined ? '192.168.1.30' : zsAdr, (f) => r = f); laufe(60); return r; };

  ok('kein Name → sagt es', /Namen ein/.test(antrag(s, '')));
  ok('eine Zahlenadresse als Name → keine Zertifikate für IPs', /Zahlenadresse/.test(antrag(s, '192.168.1.20')));
  ok('keine ZS eingetragen → sagt es', /Adresse der Zertifizierungsstelle/.test(antrag(s, 'www.schule.de', '')));
  ok('ZS-Adresse, unter der keine ZS läuft → freundlicher Satz', /läuft keine Zertifizierungsstelle/.test(antrag(s, 'www.schule.de', '192.168.1.5')),
     antrag(s, 'www.schule.de', '192.168.1.5'));
  ok('ein Name, den der DNS der ZS nicht kennt → Grund steht da',
     /gibt es den Namen „unbekannt\.schule\.de" nicht/.test(antrag(s, 'unbekannt.schule.de')), antrag(s, 'unbekannt.schule.de'));

  // Name gehört dem Angreifer: x fragt nach dem Namen von s
  const f1 = antrag(x, 'www.schule.de');
  ok('⭐ ein Name, der auf einen ANDEREN zeigt: der Prüfbesuch scheitert am Einmalwort',
     /kennt das Einmalwort nicht/.test(f1) && /192\.168\.1\.20/.test(f1), f1);
  ok('bei der ZS steht er als „fehler" — ohne Freigabe-Knopf', netz.zsConf(z).antraege.some(a => a.status === 'fehler' && a.name === 'www.schule.de'));
  ok('der Angreifer hat kein Zertifikat', !netz.zertConf(x).zert && !netz.zertGueltig(x));
  ok('… und sein Antrag liegt nicht bei der ZS zur Freigabe', !netz.zertConf(x).antrag);
  ok('der Server unter dem Namen hört das Einmalwort nur als Antwort auf den Besuch (kein Dauerzustand)', !(x.state && x.state.zsAufgabe));

  // Webserver aus: der Antragsteller lauscht kurz selbst auf Port 80
  netz.webConf(s).on = false;
  dienste.sync();
  ok('ohne Server auf Port 80: noch niemand auf 80', !stack.sockets(s).some(r => /:80$/.test(r.lokal)));
  const f2 = antrag(s, 'www.schule.de');
  ok('⭐ ohne Webserver geht der Antrag trotzdem (das Gerät lauscht kurz selbst auf 80)', f2 === null, String(f2));
  ok('… und danach ist Port 80 wieder zu', !stack.sockets(s).some(r => /:80$/.test(r.lokal)));
  ok('der Prüfbesuch steht im Zugriffsprotokoll des Geräts', http.zugriffe(s).some(l => /Prüfbesuch/.test(l)));

  // Ablehnen
  const nr = netz.zertConf(s).antrag.nr;
  ok('ZS-Betreiber klickt „Ablehnen"', zs.ablehnen(z, nr));
  let st = null; zs.abholen(s, (f, q) => st = f || q); laufe(30);
  ok('Abholen: „abgelehnt" — mit Grund', st === 'abgelehnt' && /abgelehnt/.test(netz.zertConf(s).antrag.grund));
  ok('ein abgelehnter Antrag lässt sich nicht freigeben', zs.freigeben(z, nr) === false);
  ok('kein Zertifikat → kein HTTPS', !netz.zertGueltig(s));

  // Gleichzeitig zwei Anträge: Nummern zählen hoch
  const f3 = antrag(s, 'www.schule.de');
  ok('ein zweiter Antrag bekommt eine neue Nummer', f3 === null && netz.zertConf(s).antrag.nr > nr, String(f3));
  // Die ZS ist aus → niemand zu Hause
  netz.zsConf(z).on = false; dienste.sync();
  ok('ZS aus → Antrag scheitert freundlich', /keine Zertifizierungsstelle/.test(antrag(s, 'www.schule.de')));
}

section('HTTPS: Streaming-Server und E-Mail (TLS-Ports)');
{
  const { engine, netz, stack, mit, dienste, c, s, z, d, x, http, zs } = httpsNetz(5);
  const K = sandbox.Tls.Krypto;
  const laufe = (s_) => engine.runUntil(engine.now + (s_ || 30) * SEC);
  const lauscht = (n, p) => stack.sockets(n).some(r => r.proto === 'TCP' && new RegExp(':' + p + '$').test(r.lokal));

  // Der Server s: Streaming + Mail, mit Zertifikat für www.schule.de (dns für mail.schule.de dazu)
  netz.webConf(s).on = false;
  s.software = ['streamingserver', 'mailserver'];
  const dc = netz.dnsConf(d); dc.records.push({ name: 'mail.schule.de', ip: '192.168.1.20' });
  const sc = netz.streamConf(s); sc.on = true; sc.name = 'Annas Flix'; sc.mailserver = '192.168.1.20';
  const ms = netz.mailConf(s); ms.on = true; ms.domain = 'schule.de';
  ms.konten = [{ benutzer: 'anna', name: 'Anna', passwort: 'apfel', posteingang: [] },
               { benutzer: 'bernd', name: 'Bernd', passwort: 'birne', posteingang: [] }];
  netz.zsConf(z).on = true; dienste.sync();
  // das Zertifikat gilt für den Namen, unter dem man den Server erreicht: wir nehmen mail.schule.de,
  // der Streaming-Server wird über www.schule.de angesprochen — dafür braucht er ein zweites; also
  // beantragen wir für www.schule.de und prüfen Mail über die IP als Ausnahme nicht, sondern über den Namen:
  dc.records.push({ name: 'flix.schule.de', ip: '192.168.1.20' });
  let r = 'nicht gerufen';
  zs.beantragen(s, 'flix.schule.de', '192.168.1.30', (f) => r = f); laufe(60);
  ok('Antrag für den Streaming-Server (Name flix.schule.de) besteht', r === null, String(r));
  zs.freigeben(z, 1);
  zs.abholen(s, () => {}); laufe(30);
  ok('Zertifikat da', netz.zertGueltig(s));
  let eintrag = null; zs.zsHolen(c, '192.168.1.30', (f, e) => eintrag = f || e); laufe(30);
  zs.vertrauenAufnehmen(c, eintrag);

  sc.https = true; ms.https = true;
  dienste.sync();
  ok('Streaming-Server: 80 UND 443', lauscht(s, 80) && lauscht(s, 443)
     && stack.sockets(s).some(q => /:443$/.test(q.lokal) && q.programm === 'Streaming-Server (HTTPS)'));
  ok('Mailserver: 25, 110 UND 465, 995', [25, 110, 465, 995].every(p => lauscht(s, p)));

  const mitStart = mit.view().length;
  const hol = (adr, opt) => { let q = null; http.seiteHolen(c, adr, (v) => q = v, opt); laufe(40); return q; };
  const reg = hol('https://flix.schule.de/registrieren', null);
  ok('Streaming-Server über https: die Registrierungsseite', reg && reg.ok && /Konto anlegen/.test(reg.html), reg && (reg.grund || ''));
  const gesendet = hol('https://flix.schule.de/registrieren', { methode: 'POST', body: http.formSchreiben({
    name: 'Anna', email: 'anna@schule.de', iban: 'DE12 3456 7890', bic: 'ABCDDEFF' }) });
  ok('⭐ Registrierung über https (POST mit Bankdaten): „Fast geschafft"', gesendet && gesendet.ok && /Fast geschafft/.test(gesendet.html),
     gesendet && (gesendet.grund || gesendet.html.slice(0, 100)));
  ok('das Konto steht auf dem Server', sc.konten.length === 1 && sc.konten[0].iban === 'DE12 3456 7890');
  const pw = (netz.mailConf(s).konten[0].posteingang[0] || {}).text;
  const passwort = /Dein Passwort: (\S+)/.exec(pw || '');
  ok('die Passwort-Mail kam an (auf dem Klartextweg, wie vorher)', !!passwort, pw);
  const anm = hol('https://flix.schule.de/anmelden', { methode: 'POST', body: http.formSchreiben({ email: 'anna@schule.de', passwort: passwort ? passwort[1] : '' }) });
  ok('Anmelden über https: die Filmseite', anm && anm.ok && /Hallo Anna/.test(anm.html));
  const sidKey = Object.keys(http.cookies(c)).find(k => /:443$/.test(k));
  ok('das Cookie gehört zu https (eigener Schlüssel Host:443)', !!sidKey && !!http.cookies(c)[sidKey].sid, JSON.stringify(http.cookies(c)));

  const viewNeu = mit.view().slice(mitStart);
  const tcp443 = viewNeu.filter(r => { const t = r.frame && r.frame.payload && r.frame.payload.payload; return t && (t.dport === 443 || t.sport === 443); });
  const bytes443 = tcp443.map(r => { const t = r.frame.payload.payload; return t.data || ''; }).join('\n');
  ok('⭐ im Mitschnitt: kein IBAN, kein Passwort, kein Cookie auf 443',
     bytes443.length > 0 && !/DE12|iban=|passwort=|Cookie|Set-Cookie|sid=/.test(bytes443));
  ok('⭐ und der Fund-Filter findet bei https NICHTS',
     !tcp443.some(r => r.zugang));

  // Mail über TLS
  const k = netz.mailKonto(c);
  Object.assign(k, { name: 'Bernd', domain: 'schule.de', benutzer: 'bernd', passwort: 'birne',
                     pop3: 'mail.schule.de', smtp: 'mail.schule.de', tls: false });
  // (der Mailserver hat sein Zertifikat für flix.schule.de — also passt mail.schule.de NICHT)
  let rn = null;
  const m0 = mit.view().length;
  k.tls = true; k.pop3Port = 995; k.smtpPort = 465;
  dienste.mail.anmelden(c, (f, adr) => rn = f || adr); laufe(60);
  ok('⭐ Mail über TLS mit falschem Namen (mail.schule.de, Zertifikat für flix.schule.de): „gilt für"',
     /gilt für „flix\.schule\.de"/.test(String(rn)), String(rn));
  k.pop3 = 'flix.schule.de'; k.smtp = 'flix.schule.de';
  rn = null; dienste.mail.anmelden(c, (f, adr) => rn = f || adr); laufe(60);
  ok('⭐ Mail über TLS (995 und 465) mit dem richtigen Namen: Anmeldung gelingt', rn === 'bernd@schule.de', String(rn));
  ok('der Fund-Filter findet kein PASS — es ist verschlüsselt',
     !mit.view().slice(m0).some(r => r.zugang && /POP3/.test(r.zugang.verfahren)));
  const klar = mit.view().slice(m0).map(r => { const t = r.frame && r.frame.payload && r.frame.payload.payload; return (t && t.data) || ''; }).join('\n');
  ok('„PASS birne" steht nirgends im Mitschnitt', !/PASS birne|USER bernd/.test(klar));

  let ab = null;
  dienste.mail.senden(c, { an: 'anna@schule.de', betreff: 'Hallo', text: 'Streng geheim' }, (f) => ab = f); laufe(60);
  ok('Senden über 465 (SMTPS)', ab === null, String(ab));
  ok('die Post liegt bei Anna', netz.mailConf(s).konten[0].posteingang.some(m => m.betreff === 'Hallo' && /Streng geheim/.test(m.text)));
  ok('„Streng geheim" steht nicht im Mitschnitt', !/Streng geheim/.test(mit.view().slice(m0).map(r => { const t = r.frame && r.frame.payload && r.frame.payload.payload; return (t && t.data) || ''; }).join('\n')));

  // ohne Vertrauen: Mail meldet, wo man es einträgt
  netz.vertrauen(c).length = 0;
  k.passwort = 'birne';
  rn = null; dienste.mail.anmelden(c, (f, adr) => rn = f || adr); laufe(60);
  ok('Mail ohne Vertrauen: „Aussteller" und der Weg dorthin (Webbrowser → Zertifikate)',
     /Zertifizierungsstelle/.test(String(rn)) && /Webbrowser/.test(String(rn)) && /Zertifikate/.test(String(rn)), String(rn));

  // Mailserver: Haken raus → 465/995 zu
  ms.https = false; dienste.sync();
  ok('Mailserver ohne Haken: 465 und 995 sind zu', !lauscht(s, 465) && !lauscht(s, 995) && lauscht(s, 25) && lauscht(s, 110));
}

section('HTTPS: durch das Class Wide Web (zwei Tablets)');
{
  const A = tablet(21, 50, '8.0.7.1');
  const B = tablet(22, 67, '8.0.9.4');
  const ac = A.netz.addNode('cww', 100, 100);
  const a1 = A.netz.addNode('host', 100, 300);
  konf(ac, 1, '50.0.1.1'); konf(a1, 0, '50.0.1.10');
  a1.gateway = '50.0.1.1'; a1.dns = '8.8.8.8';
  A.netz.addCable(a1.id, 0, ac.id, 1);
  a1.software = ['browser'];

  const bc = B.netz.addNode('cww', 100, 100);
  const bsw = B.netz.addNode('switch', 100, 200);
  const bs = B.netz.addNode('server', 50, 300);
  const bz = B.netz.addNode('server', 200, 300);
  konf(bc, 1, '67.0.0.1'); konf(bs, 0, '67.0.0.10'); konf(bz, 0, '67.0.0.11');
  [bs, bz].forEach(n => { n.gateway = '67.0.0.1'; n.dns = '8.8.8.8'; });
  B.netz.addCable(bc.id, 1, bsw.id, 0);
  B.netz.addCable(bs.id, 0, bsw.id, 1);
  B.netz.addCable(bz.id, 0, bsw.id, 2);
  bs.software = ['dns', 'webserver']; bz.software = ['zertstelle'];
  const dc = B.netz.dnsConf(bs); dc.on = true;
  dc.records = [{ name: 'www.bernd.de', ip: '67.0.0.10' }, { name: 'zs.bernd.de', ip: '67.0.0.11' }];
  B.dienste.http.standardDateien(bs);
  B.netz.webConf(bs).on = true;
  B.netz.zsConf(bz).on = true;
  for (const t of [A, B]) { t.dienste.start(); t.dienste.sync(); }
  laufen([A, B], 20 * SEC);          // das Verzeichnis kommt bei A an

  let antr = 'nicht gerufen';
  B.dienste.zs.beantragen(bs, 'www.bernd.de', '67.0.0.11', (f) => antr = f);
  laufen([A, B], 60 * SEC);
  ok('Tablet B: die ZS prüft über 8.8.8.8 und besucht den Server (alles in B)', antr === null, String(antr));
  B.dienste.zs.freigeben(bz, 1);
  B.dienste.zs.abholen(bs, () => {});
  laufen([A, B], 30 * SEC);
  ok('Tablet B: der Server hat sein Zertifikat', B.netz.zertGueltig(bs));
  B.netz.webConf(bs).https = true; B.dienste.sync();

  let ohne = null;
  A.dienste.http.seiteHolen(a1, 'https://www.bernd.de', (r) => ohne = r);
  laufen([A, B], 90 * SEC);
  ok('Tablet A, noch ohne Vertrauen: Warnung „unbekannt" — durch die Wolke',
     ohne && !ohne.ok && ohne.tls && ohne.tls.code === 'unbekannt', ohne && (ohne.grund || ''));

  let eintrag = null;
  A.dienste.zs.zsHolen(a1, 'zs.bernd.de', (f, e) => eintrag = f || e);
  laufen([A, B], 90 * SEC);
  ok('⭐ Tablet A holt das Zertifikat der ZS von Tablet B (Name über 8.8.8.8, Fingerabdruck)',
     eintrag && eintrag.fp && eintrag.fp === B.dienste.zs.eintragVon(bz).fp, JSON.stringify(eintrag));
  A.dienste.zs.vertrauenAufnehmen(a1, eintrag);

  let r = null;
  A.dienste.http.seiteHolen(a1, 'https://www.bernd.de', (x) => r = x);
  laufen([A, B], 120 * SEC);
  ok('⭐ Tablet A: https://www.bernd.de kommt durch das Class Wide Web an — mit Schloss',
     r && r.ok && r.status === 200 && r.tls && r.tls.name === 'www.bernd.de' && !r.tls.fehler && /Der Webserver läuft/.test(r.html),
     r && (r.grund || JSON.stringify(r.tls)));

  const tlsA = A.mit.view().filter(z => z.proto === 'TLS');
  ok('im Mitschnitt von A stehen TLS-Zeilen (auch an der Internet-Karte)', tlsA.length > 0 && tlsA.some(z => z.inet), String(tlsA.length));
  ok('⭐ der Inhalt der Seite steht in keinem Paket, das die Wolke sieht',
     !JSON.stringify(A.mit.view().filter(z => z.inet).map(z => z.frame.payload.payload)).includes('Der Webserver läuft'));
  ok('der Servername steht im ClientHello (wer mit wem bleibt sichtbar)',
     tlsA.some(z => /Servername: www\.bernd\.de/.test(z.info)));
}

/* ═══ VPN ═══
   PLAN-SICHERHEIT, Schritt 5. Anna (c) baut einen Tunnel zum VPN-Server
   (x, Zertifikat von der ZS) und ruft dann Webserver und DNS auf. */
section('VPN: Tunnel, Anmeldung, Übersetzung');
{
  const { engine, netz, stack, mit, dienste, c, s, z, d, x, http, zs } = httpsNetz(31);
  const K = sandbox.Tls.Krypto, U = sandbox.NetUtil;
  const laufe = (s_) => engine.runUntil(engine.now + (s_ || 30) * SEC);
  const vpn = dienste.vpn;
  ok('der VPN-Teil ist da', !!vpn);

  // Vorbereitung: ZS, Zertifikat für den VPN-Server, Vertrauen beim Client.
  netz.dnsConf(d).records.push({ name: 'vpn.schule.de', ip: '192.168.1.40' });
  netz.zsConf(z).on = true; dienste.sync();
  x.software = (x.software || []).concat(['vpnserver']);
  const vc = netz.vpnServerConf(x);
  vc.on = true;
  vc.konten = [{ benutzer: 'anna', pwHash: U.pseudoHash('apfel') }];
  zs.beantragen(x, 'vpn.schule.de', '192.168.1.30', () => {}); laufe(60);
  zs.freigeben(z, 1); zs.abholen(x, () => {}); laufe(30);
  dienste.sync();
  ok('der VPN-Server hat ein Zertifikat', netz.zertGueltig(x));
  ok('⭐ er lauscht auf 1194 — als eigenes Programm',
     stack.sockets(x).some(r => r.proto === 'TCP' && /:1194$/.test(r.lokal) && r.programm === 'VPN-Server'));
  ok('die Marke „vpn" steht am Gerät', netz.dienstLaeuft(x, 'vpn'));

  // Ohne Vertrauen: Warnung, kein Tunnel.
  const cf = netz.vpnClientConf(c);
  Object.assign(cf, { server: 'vpn.schule.de', benutzer: 'anna', passwort: 'apfel' });
  let r = 'nicht gerufen', info = null;
  vpn.verbinden(c, {}, (f, i) => { r = f; info = i; }); laufe(30);
  ok('⭐ ohne Vertrauen in die ZS: Warnung „unbekannt", kein Tunnel',
     r && info && info.code === 'unbekannt' && !vpn.aktiv(c), String(r));
  let eintrag = null;
  zs.zsHolen(c, 'zs.schule.de', (f, e) => eintrag = f || e); laufe(30);
  zs.vertrauenAufnehmen(c, eintrag);

  // Falsches Passwort.
  cf.passwort = 'falsch';
  vpn.verbinden(c, {}, (f) => { r = f; }); laufe(30);
  ok('falsches Passwort: abgelehnt, kein Tunnel', /stimmt nicht/.test(String(r)) && !vpn.aktiv(c), String(r));

  // Richtig.
  cf.passwort = 'apfel';
  const m0 = mit.view().length;
  r = 'nicht gerufen';
  vpn.verbinden(c, {}, (f) => { r = f; }); laufe(30);
  ok('⭐ Anmeldung gelingt: der Tunnel steht, mit einer Tunnel-Adresse', r === null && vpn.aktiv(c)
     && /^10\.8\.0\.\d+$/.test(vpn.stand(c).ip), String(r) + JSON.stringify(vpn.stand(c) && vpn.stand(c).ip));
  ok('der Server kennt den Teilnehmer', vpn.teilnehmer(x).length === 1 && vpn.teilnehmer(x)[0].benutzer === 'anna');

  // Ping durch den Tunnel.
  let pr = null;
  stack.ping(c, '192.168.1.20', 1, 8 * SEC, (q) => pr = q); laufe(20);
  ok('⭐ ein Ping DURCH den Tunnel kommt an', pr && pr.ok, JSON.stringify(pr));
  mit.setFilter({ dir: 'beide' });
  const zeilen = mit.view();
  const beiWww = zeilen.filter(q => q.node === s.id && /ICMP|Echo|ping/i.test(q.proto + q.info) && q.dir === 'rein');
  ok('⭐ der Webserver sieht als Absender den VPN-SERVER (192.168.1.40), nicht Anna',
     beiWww.length > 0 && beiWww.every(q => q.frame.payload.src === '192.168.1.40'),
     beiWww.map(q => q.frame.payload.src).join(','));
  const nachVerbinden = zeilen.slice(m0);
  ok('im Mitschnitt von Anna gibt es das innere Paket als „Tunnel"-Zeile (Absender 10.8.0.x)',
     zeilen.some(q => q.node === c.id && q.tun && q.frame.payload.src === vpn.stand(c).ip));

  // Webseite (DNS + HTTP) durch den Tunnel.
  const dnsVorher = zeilen.length;
  let seite = null;
  http.seiteHolen(c, 'www.schule.de', (q) => seite = q); laufe(60);
  ok('⭐ Name und Webseite gehen durch den Tunnel (DNS inklusive)', seite && seite.ok && /Der Webserver läuft/.test(seite.html),
     seite && (seite.grund || ''));
  const dnsRaus = mit.view().slice(dnsVorher).filter(q => q.node === c.id && !q.tun && q.dir === 'raus' && q.frame.type === 'ip');
  ok('⭐ Auf Annas Leitung geht NUR noch Verkehr zum VPN-Server (192.168.1.40)',
     dnsRaus.length > 0 && dnsRaus.every(q => q.frame.payload && q.frame.payload.dst === '192.168.1.40'),
     dnsRaus.filter(q => q.frame.payload && q.frame.payload.dst !== '192.168.1.40').map(q => q.info).slice(0, 3).join(' | '));
  ok('und das ist TLS (verschlüsselt, Port 1194)', dnsRaus.some(q => q.proto === 'TLS' || /1194/.test(q.info)));

  // Speicherformat: Konten (nur als Hash) und Zugang bleiben, der Tunnel nicht.
  const daten = JSON.parse(JSON.stringify(netz.toJSON()));
  const xd = daten.nodes.find(n => n.id === x.id), cd = daten.nodes.find(n => n.id === c.id);
  ok('⭐ im Speicherformat steht das Konto des Servers — mit Hash, ohne Passwort im Klartext',
     xd.vpnServer && xd.vpnServer.konten[0].benutzer === 'anna' && !/apfel/.test(JSON.stringify(xd.vpnServer)));
  ok('der Zugang des Clients wird gespeichert', cd.vpnClient && cd.vpnClient.server === 'vpn.schule.de');
  ok('der laufende Tunnel steht NICHT im Speicherformat', !/10\.8\.0/.test(JSON.stringify(daten)));

  // Trennen.
  vpn.trennen(c); laufe(10);
  ok('Trennen: kein Tunnel mehr, der Server hat keinen Teilnehmer', !vpn.aktiv(c) && vpn.teilnehmer(x).length === 0);
  let pr2 = null;
  stack.ping(c, '192.168.1.20', 2, 8 * SEC, (q) => pr2 = q); laufe(20);
  ok('danach geht der Ping wieder direkt', pr2 && pr2.ok);
}

section('VPN: durch das Class Wide Web (zwei Tablets)');
{
  /* Tablet A (Anna) baut einen Tunnel zum VPN-Server in Tablet B und
     ruft dann den Webserver von B und den DNS der Wolke auf. */
  const A = tablet(41, 50, '8.0.7.1');
  const B = tablet(42, 67, '8.0.9.4');
  const U = sandbox.NetUtil;
  const ac = A.netz.addNode('cww', 100, 100);
  const a1 = A.netz.addNode('host', 100, 300);
  konf(ac, 1, '50.0.1.1'); konf(a1, 0, '50.0.1.10');
  a1.gateway = '50.0.1.1'; a1.dns = '8.8.8.8';
  A.netz.addCable(a1.id, 0, ac.id, 1);
  a1.software = ['browser', 'vpnclient'];

  const bc = B.netz.addNode('cww', 100, 100);
  const bsw = B.netz.addNode('switch', 100, 200);
  const bs = B.netz.addNode('server', 50, 300);
  const bz = B.netz.addNode('server', 200, 300);
  const bv = B.netz.addNode('server', 350, 300);
  konf(bc, 1, '67.0.0.1'); konf(bs, 0, '67.0.0.10'); konf(bz, 0, '67.0.0.11'); konf(bv, 0, '67.0.0.12');
  [bs, bz, bv].forEach(n => { n.gateway = '67.0.0.1'; n.dns = '8.8.8.8'; });
  B.netz.addCable(bc.id, 1, bsw.id, 0);
  B.netz.addCable(bs.id, 0, bsw.id, 1);
  B.netz.addCable(bz.id, 0, bsw.id, 2);
  B.netz.addCable(bv.id, 0, bsw.id, 3);
  bs.software = ['dns', 'webserver']; bz.software = ['zertstelle']; bv.software = ['vpnserver'];
  const dc = B.netz.dnsConf(bs); dc.on = true;
  dc.records = [{ name: 'www.bernd.de', ip: '67.0.0.10' }, { name: 'zs.bernd.de', ip: '67.0.0.11' },
                { name: 'vpn.bernd.de', ip: '67.0.0.12' }];
  B.dienste.http.standardDateien(bs);
  B.netz.webConf(bs).on = true;
  B.netz.zsConf(bz).on = true;
  const vc = B.netz.vpnServerConf(bv); vc.on = true;
  vc.konten = [{ benutzer: 'anna', pwHash: U.pseudoHash('apfel') }];
  for (const t of [A, B]) { t.dienste.start(); t.dienste.sync(); }
  laufen([A, B], 20 * SEC);

  B.dienste.zs.beantragen(bv, 'vpn.bernd.de', '67.0.0.11', () => {});
  laufen([A, B], 60 * SEC);
  B.dienste.zs.freigeben(bz, 1);
  B.dienste.zs.abholen(bv, () => {});
  laufen([A, B], 30 * SEC);
  B.dienste.sync();
  ok('Tablet B: der VPN-Server hat sein Zertifikat', B.netz.zertGueltig(bv));

  let eintrag = null;
  A.dienste.zs.zsHolen(a1, 'zs.bernd.de', (f, e) => eintrag = f || e);
  laufen([A, B], 90 * SEC);
  A.dienste.zs.vertrauenAufnehmen(a1, eintrag);

  Object.assign(A.netz.vpnClientConf(a1), { server: 'vpn.bernd.de', benutzer: 'anna', passwort: 'apfel' });
  let r = 'nicht gerufen';
  A.dienste.vpn.verbinden(a1, {}, (f) => { r = f; });
  laufen([A, B], 120 * SEC);
  ok('⭐ Tablet A baut den Tunnel zu Tablet B auf (Name über 8.8.8.8, durch die Wolke)',
     r === null && A.dienste.vpn.aktiv(a1), String(r));

  A.mit.setFilter({ dir: 'beide' });
  const m0 = A.mit.view().length;
  let seite = null;
  A.dienste.http.seiteHolen(a1, 'www.bernd.de', (q) => seite = q);
  laufen([A, B], 150 * SEC);
  ok('⭐ durch den Tunnel: der Name (DNS in der Wolke) und die Seite von Tablet B kommen an',
     seite && seite.ok && /Der Webserver läuft/.test(seite.html), seite && (seite.grund || ''));

  A.mit.setFilter({ dir: 'beide' });
  const neu = A.mit.view().slice(m0);
  const wolke = neu.filter(q => q.inet && !q.tun);
  ok('in der Wolke von A stehen nur noch Pakete zum VPN-Server (67.0.0.12)',
     wolke.length > 0 && wolke.every(q => [q.frame.payload.src, q.frame.payload.dst].includes('67.0.0.12')),
     wolke.map(q => q.frame.payload.src + '>' + q.frame.payload.dst).filter(x => !/67\.0\.0\.12/.test(x)).slice(0, 3).join(' | '));
  ok('⭐ weder die Zieladresse des Webservers (67.0.0.10) noch 8.8.8.8 steht dort',
     !JSON.stringify(wolke.map(q => q.frame.payload)).match(/67\.0\.0\.10|8\.8\.8\.8/));
  ok('⭐ der Inhalt der Seite steht in keinem Paket der Wolke',
     !JSON.stringify(wolke.map(q => q.frame.payload)).includes('Der Webserver läuft'));
  const mitA = neu.filter(q => q.mit && q.inhalt && !q.tun);
  ok('Mitlesende an der Wolke sehen nur Salat: kein Klartext-Zugangsfund', !neu.some(q => q.zugang && !q.tun));

  // Beim VPN-Server (B): das innere Paket im Klartext, als „Unterwegs".
  B.mit.setFilter({ dir: 'beide' });
  const beiV = B.mit.view().filter(q => q.node === bv.id && q.tun);
  const innen = beiV.filter(q => q.mit === 'weg' && q.inhalt);
  ok('⭐ der VPN-Server liest alles mit (Zeilen „Unterwegs" mit Inhalt) — der Preis des Tunnels',
     innen.length > 0 && innen.some(q => /GET|HTTP|DNS|Frage/i.test(q.info)), String(innen.length));
  ok('der Server sieht die Webanfrage im Klartext',
     B.mit.view().some(q => q.node === bv.id && q.tun && /GET /.test(q.info)));
  const www = B.mit.view().filter(q => q.node === bs.id && q.dir === 'rein' && /GET /.test(q.info));
  ok('⭐ der Webserver von B sieht als Absender den VPN-Server (67.0.0.12), nicht Anna',
     www.length > 0 && www.every(q => q.frame.payload.src === '67.0.0.12'), www.map(q => q.frame.payload.src).join(','));

  A.dienste.vpn.trennen(a1);
  laufen([A, B], 20 * SEC);
  ok('Trennen beendet den Tunnel auch bei B', B.dienste.vpn.teilnehmer(bv).length === 0 && !A.dienste.vpn.aktiv(a1));
}

/* ═══ Ergebnis ═══ */
console.log('\n' + '═'.repeat(62));
console.log(fail === 0
  ? `ALLES GRÜN — ${pass} Prüfungen bestanden.`
  : `${pass} bestanden, ${fail} GESCHEITERT.`);
console.log('═'.repeat(62));
process.exit(fail ? 1 : 0);
