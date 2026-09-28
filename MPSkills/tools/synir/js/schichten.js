/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — schichten.js   ·   Ethernet · ARP · IP · ICMP
   ══════════════════════════════════════════════════════════════
   Die Protokolle. Nach den RFCs gebaut und auf das eingedampft,
   was im Unterricht erklärt wird — Filius diente dabei als
   didaktisches Vorbild (welche Vereinfachung trägt, was man
   weglassen darf), nicht als Vorlage zum Abschreiben.

   ── Was bewusst fehlt ─────────────────────────────────────────
   Fragmentierung, IP-Optionen, VLAN-Tags, Spanning Tree,
   Prüfsummen. Nichts davon beantwortet die Frage, warum ein Ping
   nicht ankommt — und genau die ist der Unterrichtsgegenstand.

   ── Was bewusst DA ist ────────────────────────────────────────
   ARP mit Wartewarteschlange, TTL mit Zeitüberschreitung, „Ziel
   nicht erreichbar" als echte ICMP-Antwort. Das sind die drei
   Stellen, an denen Schüler ihre eigenen Fehler sehen können —
   wenn das Programm sie meldet, statt still nichts zu tun.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  const ARP_TTL      = 60 * U.SEC;   // Eintrag hält eine Minute
  /* ⚠️ ARP_WAIT × ARP_RETRIES muss KLEINER sein als die Frist
     eines Pings (PING_FRIST in terminal.js). Sonst läuft die
     Ping-Uhr zuerst ab, und das Kind liest „Zeitüberschreitung —
     keine Antwort" statt „Niemand hat sich auf die ARP-Anfrage
     gemeldet".

     Genau dieser Fehler stand hier zuerst drin (2 s × 3 = 6 s
     gegen 4 s Ping-Frist) und ist beim Prüfen aufgefallen. Er ist
     kein Schönheitsfehler: die erste Meldung schickt die Suche zum
     Ziel, die zweite lässt sie im Nebel.

     ⚠️ Und die andere Richtung, die hier schon einmal falsch
     stand: ARP_WAIT muss LÄNGER sein als eine Antwortrunde durch
     den Rundrufbereich. Bei 0,4 s war sie genau so lang wie vier
     Kabelstrecken (Rechner → Switch → Ziel → Switch → Rechner) —
     die Antwort kam im selben Augenblick, in dem die Wiederholung
     hinausging, und im Mitschnitt stand jede ARP-Anfrage zweimal.

     0,8 s deckt auch zwei hintereinander gehängte Switches ab
     (sechs Strecken) und bleibt mit 3 × 0,8 = 2,4 s unter der
     Ping-Frist von 3 s. */
  const ARP_WAIT     = 800 * U.MS;
  const ARP_RETRIES  = 3;
  /* Wie lange ein gescheitertes ARP nachwirkt. Ohne diese Zeile
     zahlt JEDE der vier Ping-Anfragen die vollen 2,4 s Geduld —
     bei Tempo 0,1 sind das anderthalb Minuten Warten auf eine
     Adresse, die es im Netz gar nicht gibt. Mit ihr zahlt die
     erste Anfrage, die drei anderen scheitern sofort und mit
     demselben Satz. Echte Betriebssysteme machen dasselbe. */
  const ARP_FAIL_TTL = 2 * U.SEC;
  const MAC_TTL      = 60 * U.SEC;   // Switch vergisst nach einer Minute
  const DEFAULT_TTL  = 64;
  const PROC         = 50;           // µs, die ein Gerät fürs Denken braucht

  function Stack(engine, netz) {

    /* Die Übersetzung an der Haustür des Heimrouters. Eigene
       Datei, weil sie ein abgeschlossenes Thema ist und weil sie
       genau zwei Berührungspunkte mit dieser hier hat: einen auf
       dem Weg hinaus, einen auf dem Weg herein. Beide sind unten
       mit ⟨NAT⟩ markiert. */
    const nat = window.Nat ? window.Nat.erzeugen(engine, netz) : null;

    /* Und die verbindliche Hälfte von Schicht 4. Aus demselben
       Grund eine eigene Datei: UDP ist hier unten in dreißig
       Zeilen erledigt, TCP ist ein Zustandsautomat je Verbindung.
       Es bekommt genau das, was es zum Senden braucht — mehr
       Berührung gibt es nicht, und der Rückweg ist die eine Zeile
       in `handleIpLocal`.

       ⚠️ `sendIp` und `say` sind Funktions-DEKLARATIONEN weiter
       unten und stehen hier deshalb schon zur Verfügung. */
    const tcp = window.Tcp
      ? window.Tcp.erzeugen(engine, netz, { sendIp: sendIp, say: say, PROC: PROC })
      : null;

    /* Und das automatische Routing. Es sitzt eine Etage HÖHER als
       die beiden darüber — RIP ist ein Anwendungsprotokoll über
       UDP, so wie DHCP und DNS — und steht trotzdem hier und nicht
       in `dienste.js`. Der Grund ist die eine Stelle, an der es
       wirkt: `routeFor`. Ein Dienst, dessen Ergebnis die
       Vermittlungsschicht bei jedem Paket braucht, gehört dorthin,
       wo diese Schicht ihn ohne Umweg fragen kann.

       Geschaltet wird es von `dienste.sync()` über `ripAn`/`ripAus`
       — genau wie TCP über `tcpAufraeumen`. */
    const rip = window.Rip
      ? window.Rip.erzeugen(engine, netz, {
          sendUdp: sendUdp, listen: listen, unlisten: unlisten,
          say: say, PROC: PROC
        })
      : null;

    /* ─── Zustand je Gerät ────────────────────────────────────
       Liegt in node.state und NICHT in der gespeicherten Datei:
       ARP-Cache und MAC-Tabelle sind Laufzeitwissen. Wer ein
       Szenario lädt, fängt mit leeren Tabellen an — genau wie ein
       frisch eingeschaltetes Netz. */
    function st(node) {
      if (!node.state) node.state = {};
      const s = node.state;
      if (!s.arp)      s.arp = new Map();      // ip(int) → { mac, exp }
      if (!s.macTable) s.macTable = new Map(); // mac → { nic, exp }
      if (!s.waiting)  s.waiting = new Map();  // ip(int) → { pkts:[], tries, ev }
      if (!s.pings)    s.pings = new Map();    // "id:seq" → { ev, cb, sent }
      /* Die Anwendungsschicht in einer Zeile: Port → wer darauf
         lauscht. Mehr ist ein Socket in diesem Programm nicht, und
         mehr braucht es auch nicht — DHCP (67/68), DNS (53) und
         später HTTP (80) sind alle nur „ein Programm hört auf einer
         Nummer zu".

         Dass das VOR DHCP gebaut wurde, ist Absicht: wer DHCP
         direkt an die IP-Schicht schraubt, baut denselben
         Zustellweg bei DNS ein zweites und bei HTTP ein drittes
         Mal — und kann einer Klasse nie zeigen, warum ein Paket
         eine Portnummer braucht. */
      if (!s.sockets)  s.sockets = new Map();  // Port → Behandler
      if (!s.ipId)     s.ipId = 1;
      return s;
    }

    function clearTables(node) {
      const s = st(node);
      s.arp.clear(); s.macTable.clear();
      if (s.arpFail) s.arpFail.clear();
      for (const w of s.waiting.values()) engine.cancel(w.ev);
      s.waiting.clear();
    }

    /* Ändert sich die Verkabelung, stimmen gelernte MAC-Tabellen
       nicht mehr — ein Gerät, das umgesteckt wurde, wäre sonst
       eine Minute lang unerreichbar. Im echten Netz ist das ein
       bekanntes Ärgernis; im Unterricht ist es nur verwirrend. */
    netz.onChange(() => { for (const n of netz.list()) clearTables(n); });

    /* ─── Meldungen nach oben ─────────────────────────────────
       Alles, was die Oberfläche wissen will, geht als Ereignis
       heraus. Die Protokolle kennen kein DOM. */
    function say(kind, node, data) {
      engine.emit('event', Object.assign(
        { kind: kind, node: node ? node.id : null, nodeName: node ? node.name : '', t: engine.now },
        data || {}));
    }

    /* ═══ Schicht 2 — Ethernet ═══════════════════════════════ */

    /* ─── Welche Karte trägt Adresse und MAC? ─────────────────
       Bei jedem Gerät die, an der das Kabel steckt — bis auf die
       LAN-Seite eines Heimrouters. Dort sind vier Buchsen EINE
       Netzwerkkarte mit einer Adresse (siehe netz.js: die Buchsen
       sind ein eingebauter Switch). Jede Stelle, die früher
       `node.nics[i]` schrieb, fragt seither hier. */
    const karte = (node, i) => netz.brueckeNic(node, i);

    function sendOnNic(node, nicIndex, dstMac, type, payload) {
      const nic = karte(node, nicIndex);
      if (!nic) return;
      const frame = { src: nic.mac, dst: dstMac, type: type, payload: payload };

      /* Auf der LAN-Seite eines Heimrouters ist nicht klar, aus
         welchem Loch der Rahmen soll — es sind vier. Also dieselbe
         Frage wie bei einem Switch: kenne ich diese MAC-Adresse?
         Ja → nur dorthin. Nein oder Rundruf → an alle LAN-Buchsen.
         Das IST der eingebaute Switch; er steht hier und nicht in
         einem zweiten Gerät. */
      if (netz.istLan(node, nicIndex)) { brueckeRaus(node, dstMac, frame); return; }

      const r = netz.sendFrame(node.id, nicIndex, frame, deliver);
      if (!r.ok && r.why === 'no_cable') {
        say('note', node, { text: 'An ' + netz.portLabel(node, nicIndex) + ' steckt kein Kabel.', level: 'warn' });
      }
    }

    function brueckeRaus(node, dstMac, frame) {
      const s = st(node);
      const buchsen = netz.bruecke(node, netz.LAN);
      const e = s.macTable.get(dstMac);
      const ziel = e && e.exp > engine.now && buchsen.indexOf(e.nic) >= 0 ? e.nic : null;

      if (ziel !== null && !U.isBroadcastMac(dstMac)) {
        netz.sendFrame(node.id, ziel, frame, deliver);
        return;
      }
      let raus = 0;
      for (const i of buchsen) {
        if (netz.sendFrame(node.id, i, frame, deliver).ok) raus++;
      }
      if (!raus) {
        say('note', node, { text: 'An keiner LAN-Buchse steckt etwas.', level: 'warn' });
      }
    }

    /* Der Einstieg: hier kommt jeder Rahmen an, den ein Kabel
       abliefert. */
    function deliver(node, nicIndex, frame) {
      if (!node.on) return;

      if (node.kind === 'switch') { switchIt(node, nicIndex, frame); return; }

      const nic = karte(node, nicIndex);
      if (!nic) return;

      /* ─ Die LAN-Seite eines Heimrouters tut ZWEI Dinge ─
         Sie ist ein Switch UND eine Netzwerkkarte. Ein Rahmen von
         Buchse 1 nach Buchse 3 geht durch, ohne dass die IP-Schicht
         ihn je sieht — genau deshalb erreichen sich zwei Rechner im
         Heimnetz, ohne „ins Internet" zu gehen. Und ein Rahmen an
         die Adresse des Heimrouters selbst geht nach oben.

         Beides kann gleichzeitig gelten: ein Rundruf (eine
         ARP-Anfrage, ein DHCP-Discover) wird an die anderen Buchsen
         verteilt UND hier oben bearbeitet. Wer nur eines von beiden
         tut, bekommt ein Netz, in dem entweder DHCP oder das
         Gespräch unter Geschwistern funktioniert. */
      if (netz.istLan(node, nicIndex)) {
        const s = st(node);
        s.macTable.set(frame.src, { nic: nicIndex, exp: engine.now + MAC_TTL });
        const anMich = frame.dst === nic.mac;
        const rundruf = U.isBroadcastMac(frame.dst);
        if (!anMich) {
          engine.at(PROC, () => brueckeWeiter(node, nicIndex, frame), 'lan-brücke', node.id);
        }
        if (!anMich && !rundruf) return;     // reine Durchreiche
      } else if (frame.dst !== nic.mac && !U.isBroadcastMac(frame.dst)) {
        // Nicht an mich und kein Rundruf? Eine echte Netzwerkkarte
        // wirft ihn weg. Wir auch — aber der Mitschnitt hat ihn
        // schon, denn gesehen hat sie ihn.
        return;
      }

      engine.at(PROC, () => {
        if (frame.type === 'arp') onArp(node, nicIndex, frame);
        else if (frame.type === 'ip') onIp(node, nicIndex, frame);
      }, 'empfang', node.id);
    }

    /* Von einer LAN-Buchse zu den anderen — dieselben drei Regeln
       wie beim Switch, nur auf die Buchsen der Brücke beschränkt.
       Auf die WAN-Seite darf hier nichts: das wäre kein Switch
       mehr, sondern ein Loch in der Haustür. */
    function brueckeWeiter(node, inNic, frame) {
      const s = st(node);
      const buchsen = netz.bruecke(node, netz.LAN);
      const e = s.macTable.get(frame.dst);
      const bekannt = e && e.exp > engine.now && buchsen.indexOf(e.nic) >= 0;

      if (U.isBroadcastMac(frame.dst) || !bekannt) {
        say('flood', node, {
          reason: U.isBroadcastMac(frame.dst) ? 'broadcast' : 'unbekannt',
          dst: frame.dst
        });
        for (const i of buchsen) {
          if (i === inNic) continue;
          netz.sendFrame(node.id, i, frame, deliver);
        }
      } else if (e.nic !== inNic) {
        say('forward', node, { dst: frame.dst, nic: e.nic });
        netz.sendFrame(node.id, e.nic, frame, deliver);
      }
    }

    /* ─── Switch ──────────────────────────────────────────────
       Drei Regeln, mehr ist ein Switch nicht:
         1. Absender merken (an welchem Anschluss hängt diese MAC)
         2. Ziel bekannt → nur dorthin
         3. Ziel unbekannt oder Rundruf → an alle außer zurück

       Regel 3 ist der Grund, warum ein Switch am Anfang „wie ein
       Hub" wirkt und nach dem ersten Antwortrahmen plötzlich
       nicht mehr. Das lässt sich im Mitschnitt wunderbar zeigen,
       deshalb melden wir beide Fälle getrennt. */
    function switchIt(node, inNic, frame) {
      const s = st(node);
      const now = engine.now;

      s.macTable.set(frame.src, { nic: inNic, exp: now + MAC_TTL });

      engine.at(PROC, () => {
        const entry = s.macTable.get(frame.dst);
        const known = entry && entry.exp > engine.now;

        if (U.isBroadcastMac(frame.dst) || !known) {
          say('flood', node, {
            reason: U.isBroadcastMac(frame.dst) ? 'broadcast' : 'unbekannt',
            dst: frame.dst
          });
          for (let i = 0; i < node.nics.length; i++) {
            if (i === inNic) continue;
            netz.sendFrame(node.id, i, frame, deliver);
          }
        } else {
          say('forward', node, { dst: frame.dst, nic: entry.nic });
          netz.sendFrame(node.id, entry.nic, frame, deliver);
        }
      }, 'switch', node.id);
    }

    /* ═══ ARP ════════════════════════════════════════════════
       „Wer hat 192.168.1.5? Sag es 192.168.1.2."

       Der Request geht als Rundruf an alle, die Antwort kommt
       direkt zurück. Das ist die eine Stelle, an der man einem
       Netz beim Nachdenken zusehen kann — deshalb ist sie hier
       vollständig und nicht abgekürzt. */

    function arpLookup(node, ipInt) {
      const e = st(node).arp.get(ipInt);
      return (e && e.exp > engine.now) ? e.mac : null;
    }

    function arpLearn(node, ipInt, mac) {
      st(node).arp.set(ipInt, { mac: mac, exp: engine.now + ARP_TTL });
    }

    /* Auflösen und dann weitermachen. Ist die Adresse bekannt,
       geht es ohne Umweg weiter; sonst wartet das Paket in der
       Schlange, bis die Antwort da ist — oder es fällt nach drei
       Versuchen heraus.

       Filius verwirft ein Paket, dessen ARP noch läuft. Das ist
       der Grund, warum dort der erste Ping fast immer daneben
       geht. Wir halten es fest: didaktisch ist „der erste Ping
       dauert länger" richtig, „der erste Ping geht verloren" ist
       ein Werkzeugfehler, den Schüler sich als Regel merken. */
    function resolveThen(node, nicIndex, ipInt, go) {
      const mac = arpLookup(node, ipInt);
      if (mac) { go(mac); return; }

      const s = st(node);

      // Eben erst vergeblich gefragt? Dann nicht noch einmal die
      // volle Geduld abwarten — dieselbe Antwort, sofort.
      const schlecht = s.arpFail && s.arpFail.get(ipInt);
      if (schlecht && schlecht.exp > engine.now) { go(null, schlecht.why); return; }

      let w = s.waiting.get(ipInt);
      if (!w) {
        w = { pkts: [], tries: 0, ev: null, nic: nicIndex };
        s.waiting.set(ipInt, w);
        arpAsk(node, nicIndex, ipInt, w);
      }
      w.pkts.push(go);
    }

    function arpAsk(node, nicIndex, ipInt, w) {
      const nic = karte(node, nicIndex);
      if (!nic || !nic.ip) { arpGiveUp(node, ipInt, 'Diese Karte hat noch keine IP-Adresse.'); return; }

      w.tries++;
      say('arp-req', node, { target: U.int2ip(ipInt), try: w.tries });

      sendOnNic(node, nicIndex, U.MAC_BROADCAST, 'arp', {
        op: 'request',
        senderMac: nic.mac, senderIp: nic.ip,
        targetMac: '00:00:00:00:00:00', targetIp: U.int2ip(ipInt)
      });

      w.ev = engine.at(ARP_WAIT, () => {
        if (!st(node).waiting.has(ipInt)) return;    // inzwischen beantwortet
        if (w.tries < ARP_RETRIES) arpAsk(node, nicIndex, ipInt, w);
        else arpGiveUp(node, ipInt, 'Niemand hat sich auf die ARP-Anfrage gemeldet.');
      }, 'arp-wiederholung', node.id);
    }

    function arpGiveUp(node, ipInt, why) {
      const s = st(node);
      const w = s.waiting.get(ipInt);
      if (!w) return;
      s.waiting.delete(ipInt);
      engine.cancel(w.ev);
      if (!s.arpFail) s.arpFail = new Map();
      s.arpFail.set(ipInt, { why: why, exp: engine.now + ARP_FAIL_TTL });
      say('arp-fail', node, { target: U.int2ip(ipInt), why: why, level: 'warn' });
      for (const go of w.pkts) go(null, why);
    }

    function onArp(node, nicIndex, frame) {
      const a = frame.payload;
      const nic = karte(node, nicIndex);
      const myIp = nic.ip ? U.ip2int(nic.ip) : null;
      const senderIp = U.ip2int(a.senderIp);

      // Wer mich anspricht, den merke ich mir — egal ob Frage
      // oder Antwort. Das spart dem Gegenüber später die eigene
      // Anfrage und ist genau das, was RFC 826 vorsieht.
      if (senderIp !== null) arpLearn(node, senderIp, a.senderMac);

      if (a.op === 'request') {
        const target = U.ip2int(a.targetIp);
        if (myIp === null || target !== myIp) return;    // nicht gemeint
        say('arp-reply', node, { to: a.senderIp });
        sendOnNic(node, nicIndex, a.senderMac, 'arp', {
          op: 'reply',
          senderMac: nic.mac, senderIp: nic.ip,
          targetMac: a.senderMac, targetIp: a.senderIp
        });
        return;
      }

      // Antwort: die Wartenden loslassen.
      const s = st(node);
      const w = s.waiting.get(senderIp);
      if (w) {
        s.waiting.delete(senderIp);
        engine.cancel(w.ev);
        say('arp-ok', node, { ip: a.senderIp, mac: a.senderMac });
        for (const go of w.pkts) go(a.senderMac);
      }
    }

    /* ═══ Schicht 3 — IP ═════════════════════════════════════ */

    /* Wo muss das hin? Vier Fragen in dieser Reihenfolge:
         1. Liegt das Ziel in einem meiner eigenen Netze?
         2. Steht eine passende Zeile in meiner Tabelle — von Hand?
         3. Hat mir ein Nachbar einen Weg dorthin gesagt (RIP)?
         4. Habe ich ein Standardgateway?

       ── Zwei Regeln, und die Reihenfolge zählt ────────────────
       **Zuerst die längste passende Maske.** Das ist die Regel,
       die jeder Router anwendet: ein Eintrag für 192.168.2.0/24
       ist genauer als einer für 192.168.0.0/16 und gewinnt, ganz
       egal, woher er kommt. Einfach genug für den Unterricht und
       schon vorher die einzige Regel hier.

       **Bei gleicher Maske gewinnt die bessere HERKUNFT** — und
       die Rangfolge ist die von echten Geräten (dort heißt sie
       „administrative Distanz"): was von Hand eingetragen ist,
       schlägt das, was ein Nachbar zugerufen hat.

         0  direkt           an meiner eigenen Karte, nichts ist
                             näher dran
         1  eingetragen      hat ein Mensch hingeschrieben; wer das
                             tut, will es auch so
         2  RIP              hat ein Nachbar gesagt
         3  Standardgateway  „alles Übrige dorthin" (0.0.0.0/0)

       ⚠️ Der Rang wird erst bei GLEICHER Maske gefragt. Andernfalls
       gewönne ein Standardgateway gegen einen gelernten Weg, nur
       weil ein Mensch es eingetragen hat — und dann wäre RIP für
       nichts eingeschaltet.

       ⚠️ Und genau deshalb ist RIP hier eine ERGÄNZUNG und kein
       Ersatz. Filius schaltet bei eingeschaltetem RIP auf die
       dynamische Tabelle UM (`holeWeiterleitungsEintrag`: entweder
       die eine oder die andere) — wer dort einen Eintrag von Hand
       macht und danach das automatische Routing anschaltet, sieht
       seinen Eintrag stillschweigend außer Kraft treten. Das ist
       genau die Sorte Fehler, die eine Klasse nicht findet. */
    const RANG = { direkt: 0, eingetragen: 1, RIP: 2, Standardgateway: 3 };

    function routeFor(node, dstInt) {
      let best = null;

      /* Besser als das Bisherige? Erst die Maske, dann der Rang.
         In EINER Funktion, damit die Regel an einer Stelle steht
         und nicht viermal danebengeschrieben wird. */
      const nimm = (kand) => {
        if (!best || kand.prefix > best.prefix
            || (kand.prefix === best.prefix && RANG[kand.why] < RANG[best.why])) best = kand;
      };

      for (const nic of node.nics) {
        if (!nic.ip || !nic.up) continue;
        const ip = U.ip2int(nic.ip), mask = U.ip2int(nic.mask);
        if (ip === null || mask === null) continue;
        if (U.netOf(dstInt, mask) === U.netOf(ip, mask))
          nimm({ nic: nic.i, nextHop: dstInt, prefix: U.mask2prefix(mask) || 0, why: 'direkt' });
      }

      for (const r of node.routes || []) {
        const net = U.ip2int(r.net), mask = U.ip2int(r.mask), gw = U.ip2int(r.gateway);
        if (net === null || mask === null || gw === null) continue;
        if (U.netOf(dstInt, mask) !== net) continue;
        const out = nicTowards(node, gw);
        if (out === null) continue;
        nimm({ nic: out, nextHop: gw, prefix: U.mask2prefix(mask) || 0, why: 'eingetragen' });
      }

      /* Was die Nachbarn gesagt haben. `rip.wege` gibt nur die
         gelernten und nur die erreichbaren Wege heraus — ein Weg
         mit 16 Sprüngen ist keiner, und die eigenen Netze stehen
         schon in der Schleife ganz oben. */
      if (rip) for (const r of rip.wege(node)) {
        const net = U.ip2int(r.net), mask = U.ip2int(r.mask), gw = U.ip2int(r.gw);
        if (net === null || mask === null || gw === null) continue;
        if (U.netOf(dstInt, mask) !== net) continue;
        const out = nicTowards(node, gw);
        if (out === null) continue;
        nimm({ nic: out, nextHop: gw, prefix: U.mask2prefix(mask) || 0, why: 'RIP', hops: r.hops });
      }

      /* Das Standardgateway ist 0.0.0.0/0 und gewinnt damit von
         selbst nur, wenn nichts Genaueres passt. Vorher stand hier
         `if (!best)` — das ergab dasselbe Ergebnis (eine Maske
         kürzer als /0 gibt es nicht), aber es war eine zweite
         Regel neben der Rangfolge. */
      if (node.gateway) {
        const gw = U.ip2int(node.gateway);
        const out = gw === null ? null : nicTowards(node, gw);
        if (out !== null) nimm({ nic: out, nextHop: gw, prefix: 0, why: 'Standardgateway' });
      }

      return best;
    }

    // Über welche Karte erreiche ich diese (direkt benachbarte)
    // Adresse? Ein Gateway, das in keinem eigenen Netz liegt, ist
    // ein Konfigurationsfehler — und einer, den wir benennen.
    function nicTowards(node, ipInt) {
      for (const nic of node.nics) {
        if (!nic.ip || !nic.up) continue;
        const ip = U.ip2int(nic.ip), mask = U.ip2int(nic.mask);
        if (ip === null || mask === null) continue;
        if (U.netOf(ipInt, mask) === U.netOf(ip, mask)) return nic.i;
      }
      return null;
    }

    /* Ein IP-Paket losschicken — von hier aus, als Absender. */
    function sendIp(node, dstIp, proto, payload, opts) {
      opts = opts || {};
      const dst = U.ip2int(dstIp);
      if (dst === null) { say('note', node, { text: 'Keine gültige Zieladresse.', level: 'warn' }); return false; }

      /* ─ Rundruf an alle (255.255.255.255) ─────────────────────
         Der eine Fall, der die Wegsuche überspringt — und der
         Grund, warum DHCP überhaupt funktioniert: ein Gerät ohne
         Adresse kann nichts nachschlagen, keine Maske vergleichen
         und niemanden per ARP fragen. Es ruft in den Raum.

         TTL 1, weil kein Router das weiterträgt: ein Rundruf
         gehört genau einem Netz. Genau deshalb braucht jedes Netz
         seinen eigenen DHCP-Server (oder einen Relay, den wir
         bewusst weglassen). */
      if (dst === 0xFFFFFFFF) {
        let nicIndex = opts.nic;
        if (nicIndex == null) nicIndex = node.nics.findIndex(k => k.up && k.cable);
        const nic = karte(node, nicIndex);
        if (!nic) {
          say('note', node, { text: 'Kein Anschluss, über den ein Rundruf hinausgehen könnte.', level: 'warn' });
          if (opts.onFail) opts.onFail('no_nic', 'Kein brauchbarer Anschluss.');
          return false;
        }
        sendOnNic(node, nicIndex, U.MAC_BROADCAST, 'ip', {
          src: opts.src != null ? opts.src : (nic.ip || '0.0.0.0'),
          dst: dstIp, ttl: 1, proto: proto, id: st(node).ipId++, payload: payload
        });
        return true;
      }

      const route = routeFor(node, dst);
      if (!route) {
        const why = node.gateway
          ? 'Das Standardgateway ' + node.gateway + ' liegt in keinem Netz dieses Geräts.'
          : 'Kein Weg dorthin — es fehlt ein Standardgateway.';
        say('unreachable', node, { dst: dstIp, why: why, level: 'warn' });
        if (opts && opts.onFail) opts.onFail('no_route', why);
        return false;
      }

      const nic = karte(node, route.nic);
      const pkt = {
        src: (opts && opts.src) || nic.ip,
        dst: dstIp,
        ttl: (opts && opts.ttl) || DEFAULT_TTL,
        proto: proto,
        id: st(node).ipId++,
        payload: payload
      };

      // An sich selbst: gar nicht erst auf die Leitung.
      if (nic.ip === dstIp) {
        engine.at(PROC, () => handleIpLocal(node, route.nic, pkt), 'loopback', node.id);
        return true;
      }

      shipIp(node, route, pkt, opts);
      return true;
    }

    /* Der gemeinsame letzte Schritt für eigene und weitergeleitete
       Pakete: MAC des nächsten Sprungs besorgen, dann raus. */
    function shipIp(node, route, pkt, opts) {
      say('ip-out', node, {
        dst: pkt.dst, via: U.int2ip(route.nextHop), nic: route.nic,
        why: route.why, proto: pkt.proto
      });

      resolveThen(node, route.nic, route.nextHop, (mac, why) => {
        if (!mac) {
          say('unreachable', node, {
            dst: pkt.dst, why: why || ('Die MAC-Adresse von ' + U.int2ip(route.nextHop) + ' ist nicht zu bekommen.'),
            level: 'warn'
          });
          if (opts && opts.onFail) opts.onFail('arp', why);
          return;
        }
        sendOnNic(node, route.nic, mac, 'ip', pkt);
      });
    }

    function onIp(node, nicIndex, frame) {
      const pkt = frame.payload;
      const nic = karte(node, nicIndex);

      /* ⟨NAT⟩ Rückweg. Muss VOR „für mich?" stehen, und das ist
         der ganze Witz daran: die Antwort aus dem Internet trägt
         als Ziel die Adresse des Heimrouters, ist aber nicht für
         ihn. Stünde die Frage zuerst, verschluckte er jede Antwort
         auf jede Anfrage aus dem Heimnetz — und zwar ohne
         Fehlermeldung, denn formal war das Paket ja an ihn
         gerichtet. Siehe js/nat.js. */
      if (nat && netz.istWan(node, nicIndex)) nat.herein(node, pkt, say);

      const dst = U.ip2int(pkt.dst);

      // Für mich? (Jede eigene Adresse zählt, nicht nur die der
      // Karte, an der es ankam — so verhält sich ein Router.)
      for (const k of node.nics) {
        if (k.ip && U.ip2int(k.ip) === dst) { handleIpLocal(node, nicIndex, pkt); return; }
      }

      /* Rundruf an alle: für mich, und zwar AUCH ohne eigene
         Adresse. Diese Reihenfolge ist der Unterschied zwischen
         funktionierendem und nicht funktionierendem DHCP — vorher
         hing die Annahme an `nic.ip`, und ein Gerät ohne Adresse
         warf die Antwort weg, die ihm gerade eine geben wollte. */
      if (dst === 0xFFFFFFFF) { handleIpLocal(node, nicIndex, pkt); return; }

      // Rundruf im eigenen Netz? Auch für mich.
      if (nic.ip && nic.mask) {
        const mask = U.ip2int(nic.mask);
        if (dst === U.bcastOf(U.ip2int(nic.ip), mask)) {
          handleIpLocal(node, nicIndex, pkt); return;
        }
      }

      // Nicht für mich. Ein Rechner wirft weg, ein Router leitet
      // weiter — das ist der ganze Unterschied zwischen den
      // beiden, und im Unterricht der Kernsatz.
      if (!netz.KIND[node.kind].routes) {
        say('drop-notmine', node, { dst: pkt.dst });
        return;
      }

      pkt.ttl--;
      if (pkt.ttl <= 0) {
        say('ttl', node, { dst: pkt.dst, level: 'warn' });
        sendIcmp(node, pkt.src, 11, 0, { orig: origKopf(pkt) });
        return;
      }

      const route = routeFor(node, dst);
      if (!route) {
        say('unreachable', node, { dst: pkt.dst, why: 'Dieser Router kennt keinen Weg dorthin.', level: 'warn' });
        sendIcmp(node, pkt.src, 3, 0, { orig: origKopf(pkt) });
        return;
      }

      /* ⟨NAT⟩ Hinweg. Geht das Paket aus dem Heimnetz hinaus,
         bekommt es die eine Adresse, die der Anbieter vergeben
         hat. Hier und nicht früher: erst jetzt steht fest, dass es
         über die WAN-Karte geht. */
      if (nat && netz.istWan(node, route.nic)) {
        nat.hinaus(node, pkt, karte(node, route.nic), say);
      }

      say('route', node, { dst: pkt.dst, via: U.int2ip(route.nextHop), ttl: pkt.ttl });
      engine.at(PROC, () => shipIp(node, route, pkt), 'weiterleiten', node.id);
    }

    /* ═══ ICMP ═══════════════════════════════════════════════ */

    function sendIcmp(node, dstIp, type, code, extra) {
      sendIp(node, dstIp, 'icmp', Object.assign({ type: type, code: code }, extra || {}));
    }

    /* ⭐ Was eine ICMP-Fehlermeldung vom ausgelösten Paket
       mitnimmt. Bis hierher waren das Absender und Ziel; dazu
       kommen jetzt Kennung und Folgenummer des ICMP-Kopfes.

       Das ist keine Zutat: ein echtes ICMP-Fehlerpaket trägt den
       IP-Kopf des Originals PLUS dessen erste acht Datenbytes mit
       — und bei einem Ping stehen genau dort Kennung und
       Folgenummer. Genau dafür sind sie da.

       Ohne sie ging jede Fehlermeldung an den „ersten offenen
       Ping" (so stand es hier, mit dem Vermerk, Genaueres sei
       mehr Buchhaltung als Gewinn). Für ein einzelnes `ping`
       stimmte das; für `traceroute` stimmt es nicht mehr, denn
       dort sind mehrere Anfragen gleichzeitig unterwegs und die
       Frage IST, welche Station auf welche geantwortet hat. */
    function origKopf(pkt) {
      const p = pkt.payload || {};
      return { src: pkt.src, dst: pkt.dst, id: p.id, seq: p.seq };
    }

    function handleIpLocal(node, nicIndex, pkt) {
      if (pkt.proto === 'udp') { handleUdp(node, nicIndex, pkt); return; }
      if (pkt.proto === 'tcp' && tcp) { tcp.empfangen(node, nicIndex, pkt); return; }

      if (pkt.proto !== 'icmp') {
        say('note', node, { text: 'Paket mit Protokoll „' + pkt.proto + '" angekommen — dafür läuft hier nichts.', level: 'info' });
        return;
      }
      const m = pkt.payload;

      if (m.type === 8) {                    // Echo Request
        say('ping-in', node, { from: pkt.src, seq: m.seq });
        engine.at(PROC, () => {
          sendIp(node, pkt.src, 'icmp',
            { type: 0, code: 0, id: m.id, seq: m.seq, data: m.data },
            { src: pkt.dst });               // mit der Adresse antworten, die angesprochen wurde
        }, 'echo-antwort', node.id);
        return;
      }

      if (m.type === 0) {                    // Echo Reply
        const s = st(node);
        const key = m.id + ':' + m.seq;
        const p = s.pings.get(key);
        if (!p) return;                      // zu spät, schon abgeschrieben
        s.pings.delete(key);
        engine.cancel(p.ev);
        p.cb({ ok: true, from: pkt.src, rtt: engine.now - p.sent, ttl: pkt.ttl, seq: m.seq });
        return;
      }

      if (m.type === 3 || m.type === 11) {   // Unerreichbar / TTL abgelaufen
        const s = st(node);
        const text = m.type === 3
          ? 'Ziel nicht erreichbar (Meldung von ' + pkt.src + ')'
          : 'Zeit abgelaufen unterwegs (Meldung von ' + pkt.src + ')';

        /* ⭐ Die Meldung geht an DEN Ping, der sie ausgelöst hat —
           erkannt an Kennung und Folgenummer aus dem beigefügten
           Originalkopf (`origKopf`). Hier stand einmal „der erste
           offene Ping bekommt sie"; das stimmte, solange immer nur
           einer unterwegs war.

           `traceroute` schickt mehrere mit verschiedenen TTLs
           gleichzeitig los, und die Antworten kommen in beliebiger
           Reihenfolge zurück — die Zuordnung IST dort die Frage.
           Mit „der erste offene" stünde in der Ausgabe die
           Reihenfolge, in der gefragt wurde, und daneben die
           Stationen, in der Reihenfolge, in der geantwortet wurde.
           Zwei Spalten, die nichts miteinander zu tun haben. */
        const o = m.orig || {};
        const key = (o.id != null && o.seq != null) ? (o.id + ':' + o.seq) : null;
        const p = key ? s.pings.get(key) : null;
        if (p) {
          s.pings.delete(key);
          engine.cancel(p.ev);
          /* Die Laufzeit gehört dazu: eine Station, die „Zeit
             abgelaufen" meldet, hat das Paket ja tatsächlich
             bekommen — wie lange das gedauert hat, ist bei
             traceroute genau die zweite Spalte. */
          p.cb({ ok: false, error: text, from: pkt.src, icmp: m.type,
                 seq: o.seq, rtt: engine.now - p.sent });
        } else {
          /* Kein passender Ping: das Original war kein Echo (etwa
             ein UDP-Paket), oder die Frist ist schon abgelaufen.
             Dann steht die Meldung im Terminal — und NICHT bei
             irgendeinem anderen Ping, der zufällig noch offen ist.
             Der hätte sonst einen Fehler gemeldet, der ihn gar
             nichts angeht. */
          say('note', node, { text: text, level: 'warn' });
        }
      }
    }

    /* ═══ Schicht 4 — UDP ════════════════════════════════════
       Was hier fehlt, fehlt mit Absicht: Prüfsumme, Länge,
       Fragmentierung. Was da ist, ist der ganze Unterrichtsstoff —
       zwei Portnummern. Die Absenderport-Nummer sagt, wohin die
       Antwort geht; die Zielport-Nummer sagt, welches Programm
       gemeint ist. Damit lassen sich DHCP und DNS ehrlich bauen.

       TCP kommt später und ist ein anderes Thema (Verbindung,
       Reihenfolge, Wiederholung). UDP zuerst, weil DHCP und DNS
       darauf sitzen und weil ein Kind bei UDP die Portnummer sieht,
       ohne durch einen Verbindungsaufbau hindurchzumüssen. */

    const PORT = { dhcpServer: 67, dhcpClient: 68, dns: 53, rip: 520, ripClient: 521 };

    /* `programm` ist nur für die Auskunft da — `netstat` beantwortet
       damit die Frage, an der in Filius das Ausprobieren anfängt:
       wer hört eigentlich auf dieser Nummer? Die Zustellung kümmert
       sich nicht darum, deshalb steht der Name in einer eigenen
       Tabelle und nicht im Behandler. */
    function listen(node, port, fn, programm) {
      const s = st(node);
      s.sockets.set(port, fn);
      if (!s.sockNamen) s.sockNamen = new Map();
      s.sockNamen.set(port, programm || '');
    }
    function unlisten(node, port) {
      const s = st(node);
      s.sockets.delete(port);
      if (s.sockNamen) s.sockNamen.delete(port);
    }
    function listens(node, port)    { return st(node).sockets.has(port); }

    /* ─── Wer hört auf welcher Nummer? ────────────────────────
       UDP-Sockets und TCP-Verbindungen in EINER Liste, weil
       `netstat` genau diese eine Frage stellt. Die Spalte
       „Programm" hat Filius nicht — und sie ist der Grund, warum
       das dort so viel Ausprobieren war. */
    function sockets(node) {
      const s = st(node);
      const eigen = (node.nics.find(k => k.ip) || {}).ip || '0.0.0.0';
      const out = [];
      for (const port of s.sockets.keys())
        out.push({
          proto: 'UDP', lokal: eigen + ':' + port, fern: '—', zustand: 'hört zu',
          programm: (s.sockNamen && s.sockNamen.get(port)) || ''
        });
      if (tcp) for (const z of tcp.zeilen(node)) out.push(z);
      return out;
    }

    function sendUdp(node, dstIp, sport, dport, data, opts) {
      return sendIp(node, dstIp, 'udp', { sport: sport, dport: dport, data: data }, opts);
    }

    function handleUdp(node, nicIndex, pkt) {
      const u = pkt.payload || {};
      const fn = st(node).sockets.get(u.dport);

      if (!fn) {
        /* Niemand lauscht. Bei einem Rundruf ist das normal und
           still (jedes Gerät im Netz sieht jede DHCP-Anfrage), bei
           einer gezielten Sendung ist es eine Meldung wert —
           „Port nicht erreichbar" ist die Antwort, an der man im
           echten Netz erkennt, dass der Dienst nicht läuft. */
        if (pkt.dst !== '255.255.255.255') {
          say('port-zu', node, { port: u.dport, from: pkt.src, level: 'info' });
          sendIcmp(node, pkt.src, 3, 3, { orig: Object.assign(origKopf(pkt), { port: u.dport }) });
        }
        return;
      }

      engine.at(PROC, () => {
        if (!node.on) return;
        fn({
          node: node, nic: nicIndex,
          from: pkt.src, to: pkt.dst,
          sport: u.sport, dport: u.dport,
          data: u.data
        });
      }, 'udp-zustellung', node.id);
    }

    /* ─── ping ────────────────────────────────────────────────
       Eine Anfrage, eine Antwort, eine Zeitüberschreitung. Der
       Rückruf bekommt immer genau eines davon. */
    let pingId = 1;
    /* ─── Die Ping-Frist ──────────────────────────────────────
       Sie muss zwischen zwei Zahlen liegen, und beide sind schon
       einmal falsch herum gestanden:

       ⬆ ÜBER dem, was ein ERSTER Ping über einen Router ehrlich
         braucht. Der zahlt zwei Adressauflösungen mit: der Rechner
         sucht das Gateway, der Router sucht das Ziel. Bei acht
         Kabelstrecken (0,8 s) plus zwei ARP-Runden (0,8 s) sind
         das 1,6 s. Mit einer Frist von 1,6 s stand im Bild dann
         „Zeitüberschreitung" bei Ping Nr. 1 und „Antwort" bei Nr.
         2 bis 4 — ein Kind lernt daraus, dass Netze manchmal eben
         nicht gehen. Genau das Gegenteil des Ziels.

       ⬇ UNTER dem, was der Mensch davor aushält. Die Frist zählt
         in simulierter Zeit; bei Tempo 0,1 wird aus jeder Sekunde
         eine echte Zehntelminute.

       3 s: über dem ehrlichen Weg (1,6 s) und über ARP_WAIT ×
       ARP_RETRIES (2,4 s) — sonst meldete ein Ping
       „keine Antwort", wo „niemand kennt diese Adresse" die
       Wahrheit wäre. Zwei Prüfungen wachen über beide Richtungen
       (tests/kerntest.js, Abschnitt „Fristen"). */
    const PING_FRIST = 3000 * U.MS;
    /* `ttl` ist neu und normalerweise nicht gesetzt — dann gilt
       DEFAULT_TTL (64). Gebraucht wird es von `traceroute`: mit
       TTL 1 kommt das Paket bis zum ersten Router und keinen
       Schritt weiter, der meldet „Zeit abgelaufen", und schon
       kennt man die erste Station. Mit 2 die zweite, und so fort.

       Das ist der ganze Trick, und er ist der Grund, warum es TTL
       überhaupt gibt — ein Feld, das nur Schleifen abbricht,
       könnte auch ein Zähler im Router sein. */
    function ping(node, dstIp, seq, timeoutUs, cb, ttl) {
      const s = st(node);
      const id = pingId++;
      const key = id + ':' + seq;
      const sent = engine.now;

      const ev = engine.at(timeoutUs || PING_FRIST, () => {
        if (!s.pings.has(key)) return;
        s.pings.delete(key);
        cb({ ok: false, error: 'Zeitüberschreitung — keine Antwort.', seq: seq });
      }, 'ping-frist', node.id);

      s.pings.set(key, { ev, cb, sent });

      const ok = sendIp(node, dstIp, 'icmp', { type: 8, code: 0, id: id, seq: seq, data: 32 }, {
        ttl: ttl,
        onFail: (code, why) => {
          if (!s.pings.has(key)) return;
          s.pings.delete(key);
          engine.cancel(ev);
          cb({ ok: false, error: why || 'Kein Weg zum Ziel.', seq: seq });
        }
      });

      if (!ok && s.pings.has(key)) {
        s.pings.delete(key);
        engine.cancel(ev);
      }
    }

    /* ─── Auskunft für die Oberfläche ─────────────────────────*/
    function arpTable(node) {
      const out = [];
      for (const [ip, e] of st(node).arp) {
        if (e.exp <= engine.now) continue;
        out.push({ ip: U.int2ip(ip), mac: e.mac, rest: e.exp - engine.now });
      }
      return out.sort((a, b) => U.ip2int(a.ip) - U.ip2int(b.ip));
    }

    function macTable(node) {
      const out = [];
      for (const [mac, e] of st(node).macTable) {
        if (e.exp <= engine.now) continue;
        out.push({ mac, nic: e.nic, rest: e.exp - engine.now });
      }
      return out.sort((a, b) => a.nic - b.nic);
    }

    /* Die Weiterleitungstabelle so, wie das Gerät sie sieht —
       inklusive der Zeilen, die sich aus den eigenen Karten von
       selbst ergeben. Genau das ist der Punkt, den Schüler
       übersehen: ein Gerät kennt seine eigenen Netze, ohne dass
       jemand sie einträgt. */
    function routingTable(node) {
      const rows = [];
      for (const nic of node.nics) {
        if (!nic.ip || !nic.up) continue;
        const mask = U.ip2int(nic.mask);
        if (mask === null) continue;
        rows.push({
          net: U.int2ip(U.netOf(U.ip2int(nic.ip), mask)),
          mask: nic.mask, gateway: '—', nic: nic.i, kind: 'direkt'
        });
      }
      /* ⚠️ `idx` ist die Nummer der Zeile in `node.routes` — und sie
         steht hier, weil die Oberfläche genau EINE Tabelle zeigt
         (weiterleitung.js): die eingetragenen Zeilen sind dort
         Felder zum Tippen, alles andere ist grau. Ohne diese Zahl
         müsste das Fenster die Zeilen mitzählen und hätte damit
         eine zweite Annahme über die Reihenfolge hier drin. */
      (node.routes || []).forEach((r, i) =>
        rows.push({ net: r.net, mask: r.mask, gateway: r.gateway, idx: i,
                    nic: nicTowards(node, U.ip2int(r.gateway)), kind: 'eingetragen' }));
      /* Was die Nachbarn gesagt haben, steht in derselben Tabelle
         wie alles andere — mit der Zahl der Sprünge dahinter. Sie
         ist der einzige Wert, den nur diese Herkunft hat, und sie
         ist der Grund, warum die Zeile so aussieht und nicht
         anders. Getrennte Tabellen für „von Hand" und „gelernt"
         wären zwei Antworten auf die Frage, die ein Router beim
         Weiterleiten genau einmal stellt. */
      if (rip) for (const r of rip.wege(node))
        rows.push({ net: r.net, mask: r.mask, gateway: r.gw, nic: r.nic,
                    kind: 'RIP', hops: r.hops });
      if (node.gateway)
        rows.push({ net: '0.0.0.0', mask: '0.0.0.0', gateway: node.gateway, nic: nicTowards(node, U.ip2int(node.gateway)), kind: 'Standard' });
      return rows;
    }

    return {
      deliver, sendIp, ping, clearTables, arpTable, macTable, routingTable, routeFor,
      sendUdp, listen, unlisten, listens, sockets, PORT, PING_FRIST,

      /* TCP nach außen. Die Namen sagen, dass es TCP ist — ein
         `listen`, das mal das eine und mal das andere meint, wäre
         der Fehler, den man erst im Mitschnitt findet. */
      tcpHoeren:      (node, port, fn, programm) => { if (tcp) tcp.hoeren(node, port, fn, programm); },
      tcpNichtHoeren: (node, port) => { if (tcp) tcp.nichtHoeren(node, port); },
      tcpHoert:       (node, port) => !!(tcp && tcp.hoert(node, port)),
      tcpVerbinde:    (node, ip, port, programm, cb) =>
                        (tcp ? tcp.verbinde(node, ip, port, programm, cb)
                             : (cb && cb('TCP ist nicht geladen.', null), null)),
      tcpAufraeumen:  (node) => { if (tcp) tcp.aufraeumen(node); },
      TCP_FRIST:      tcp ? tcp.TCP_FRIST : 0,
      natTabelle: (node) => (nat ? nat.tabelle(node) : []),
      natLeeren:  (node) => { if (nat) nat.leeren(node); },
      natAktiv:   (node) => !!(nat && nat.aktiv(node)),

      /* Das automatische Routing. `ripAn`/`ripAus` ruft
         `dienste.sync()`, alles andere fragt die Oberfläche. */
      ripAn:      (node) => { if (rip) rip.an(node); },
      ripAus:     (node) => { if (rip) rip.aus(node); },
      ripZeilen:  (node) => (rip ? rip.zeilen(node) : []),
      ripLeeren:  (node) => { if (rip) rip.leeren(node); },
      ripAktiv:   (node) => !!(rip && rip.aktiv(node)),
      ripKann:    (node) => !!(rip && rip.kannRip(node)),
      RIP_TAKT:   rip ? rip.RIP_TAKT : 0,
      RIP_FRIST:  rip ? rip.RIP_FRIST : 0,
      RIP_UNENDLICH: rip ? rip.UNENDLICH : 16
    };
  }

  window.Stack = Stack;
})();
