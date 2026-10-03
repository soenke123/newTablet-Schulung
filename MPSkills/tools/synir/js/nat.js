/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — nat.js   ·   Die Übersetzung an der Haustür
   ══════════════════════════════════════════════════════════════
   Ein Heimrouter hat innen viele Adressen und außen genau eine.
   Wie das zusammengeht, ist die Frage, mit der bei fast jedem
   Kind der Netzwerkunterricht zu Hause ankommt: „Warum hat mein
   Handy 192.168.1.37, und wieso steht bei wieistmeineip.de etwas
   ganz anderes?"

   NAT beantwortet sie. Genauer: NAPT (RFC 3022 nennt es
   „Network Address Port Translation") — nicht nur die Adresse
   wird getauscht, sondern auch die Portnummer, und erst die macht
   den Rückweg eindeutig.

   ── Der ganze Vorgang in vier Zeilen ──────────────────────────
     hinaus   Absender 192.168.1.37:51000  →  84.12.5.9:40001
              und diese Zeile wird aufgeschrieben.
     herein   Ziel     84.12.5.9:40001     →  192.168.1.37:51000
              und zwar NUR, weil die Zeile dasteht.

   Genau daran hängt die zweite Einsicht: **von außen kann niemand
   anfangen.** Ein Paket aus dem Internet an 84.12.5.9:40001, zu
   dem keine Zeile existiert, weiß nicht, wohin — und wird
   verworfen. Das ist der Grund, warum ein Heimnetz „von selbst"
   geschützt ist, ohne dass jemand eine Firewall eingeschaltet
   hätte.

   ── Und die Gegenprobe: die Portfreigabe ──────────────────────
   Wenn doch einmal jemand von außen anfangen soll — ein Webserver
   im Haus, den die Klasse von draußen aufrufen will —, dann muss
   die Zeile eben schon DASTEHEN, bevor das erste Paket kommt.
   Genau das ist eine Portfreigabe, und deshalb steht sie in
   diesem Programm auch nicht woanders: es ist **dieselbe
   Übersetzung, nur von Hand eingetragen statt beim Hinausgehen
   entstanden.**

     Freigabe   TCP 80  →  192.168.1.20:80
     herein     84.12.5.9:80  →  192.168.1.20:80    (ohne Zeile
                                 wäre das verworfen worden)
     hinaus     192.168.1.20:80  →  84.12.5.9:80    (und NICHT
                                 auf eine vergebene 40001 —
                                 sonst käme die Antwort an einem
                                 Port heraus, nach dem draußen
                                 niemand gefragt hat)

   ⭐ Die dritte Zeile ist die, die man vergisst, und sie ist auch
   der Grund, warum die Freigabe hier keine künstliche Zeile in
   der dynamischen Tabelle anlegt: beide Richtungen fragen
   DIESELBE Liste, und damit kann die eine nicht anders antworten
   als die andere.

   Wortlaut aus Filius (`JPortForwardingDialog`): der Reiter heißt
   **Portfreigaben** (jgatewayconfiguration_msg19), die Spalten
   **Protokoll · Portfreigabe · LAN-Adresse · LAN-Port**
   (jportforwarding_msg4, 5, 6, 7).

   ── Was hier bewusst fehlt ────────────────────────────────────
   Verschiedene NAT-Spielarten (full cone, symmetric — eine
   Unterscheidung für Leute, die Videotelefonie bauen), und die
   Übersetzung der Adressen INNEN in ICMP-Fehlermeldungen, die von
   außen kommen. Der letzte Punkt ist der einzige, der auffallen
   kann: ein „Ziel nicht erreichbar" aus dem Internet landet beim
   Heimrouter und nicht beim Rechner, der gefragt hat. Dafür
   müsste der eingepackte Originalkopf mitübersetzt werden — mehr
   Buchhaltung, als der Unterricht dafür zurückgibt.

   ── Was übersetzt wird ────────────────────────────────────────
     UDP   Absenderport (hinaus) bzw. Zielport (herein)
     TCP   dasselbe. Ohne das käme aus dem Internet keine einzige
           Antwort auf eine Anfrage aus dem Haus zurück.
     ICMP  die Kennung des Echos. Sie steht im Paket genau
           deshalb: damit ein Rechner seine eigenen Antworten
           wiedererkennt. NAT benutzt sie als Portnummer — das
           tun echte Geräte auch, und im Mitschnitt ist es
           nachzulesen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* Wie lange eine Zeile gilt. Echte Geräte halten UDP-Zeilen
     ein bis fünf Minuten. Zwei Minuten sind hier lang genug, dass
     während einer Unterrichtsstunde nichts unter den Händen
     verschwindet, und kurz genug, dass die Tabelle sich sichtbar
     leert, wenn man sie einmal beobachtet. */
  const NAT_TTL = 120 * U.SEC;

  /* Ab welcher Nummer die Außenports vergeben werden. Über 32768,
     damit sie auf den ersten Blick von den Ports der Dienste
     (67, 68, 53, 80) zu unterscheiden sind: wer im Mitschnitt
     40001 liest, weiß, dass diese Nummer niemandem gehört,
     sondern vergeben wurde. */
  const PORT_VON = 40000, PORT_BIS = 49999;

  function erzeugen(engine, netz) {

    function tb(node) {
      const s = node.state || (node.state = {});
      if (!s.nat) s.nat = {
        hin:  new Map(),    // "proto|innenIp|innenPort" → Zeile
        zur:  new Map(),    // "proto|aussenPort"        → Zeile
        next: PORT_VON
      };
      return s.nat;
    }

    /* Übersetzt wird nur, wenn das Gerät es kann UND es
       eingeschaltet ist. Beides getrennt zu fragen ist kein
       Umweg: `nat.on` ist ein Schalter im Fenster, und ein
       ausgeschaltetes NAT ist ein Unterrichtsgegenstand für sich
       (dann kommt vom Heimnetz nichts mehr zurück, und man sieht
       im Mitschnitt genau warum). */
    const aktiv = (node) =>
      !!(node && window.Netz && window.Netz.istHeim(node) && node.nat && node.nat.on);

    /* ─── Die Portfreigaben, geprüft ──────────────────────────
       Was im Formular steht, ist Text — hier wird daraus etwas,
       auf das sich die Übersetzung verlassen kann. Eine halb
       ausgefüllte Zeile fällt heraus und tut nichts; sie ist im
       Fenster als unfertig zu sehen, und sie soll auch nichts tun.

       ⭐ **Leerer LAN-Port heißt „derselbe".** Das ist keine
       vorweggenommene Antwort (das Feld bleibt leer und ein Text
       unter der Liste sagt es), sondern der Normalfall: wer Port
       80 freigibt, will fast immer auch innen die 80. Filius
       verlangt dort beide Zahlen. Damit trotzdem nichts unsichtbar
       passiert, steht die Zeile in der NAT-Tabelle mit der Nummer,
       die dabei herauskommt. */
    function frei(node) {
      const out = [];
      if (!node.nat || !Array.isArray(node.nat.frei)) return out;
      for (const f of node.nat.frei) {
        const proto = String(f.proto || '').toLowerCase();
        if (proto !== 'tcp' && proto !== 'udp') continue;
        const port = parseInt(f.port, 10);
        if (!(port >= 1 && port <= 65535)) continue;
        if (!U.isIp(f.lanIp)) continue;
        const lp = parseInt(f.lanPort, 10);
        out.push({
          proto: proto, port: port, lanIp: f.lanIp,
          lanPort: (lp >= 1 && lp <= 65535) ? lp : port
        });
      }
      return out;
    }

    /* Welche Nummer im Paket steht für „welches Gespräch"?
       Bei UDP und TCP der Port, bei ICMP die Kennung des Echos.
       ICMP-Fehlermeldungen haben keine eigene Nummer; sie werden
       über den mitgebrachten Kopf übersetzt (`fehlerHerein`).

       ⚠️ TCP steht hier nicht der Vollständigkeit halber: ohne
       diese Zeile käme aus dem Internet keine einzige Antwort auf
       eine Anfrage aus dem Haus zurück — der Rückweg wäre nicht
       eindeutig, weil alle Rechner hinter derselben WAN-Adresse
       stehen. Es ist zugleich die Vorarbeit für die Portfreigabe:
       die ist nichts anderes als eine Zeile in dieser Tabelle,
       die von Hand eingetragen wird statt beim Hinausgehen zu
       entstehen. */
    function kennung(pkt, richtung) {
      const p = pkt.payload || {};
      if (pkt.proto === 'udp' || pkt.proto === 'tcp') return richtung === 'hin' ? p.sport : p.dport;
      if (pkt.proto === 'icmp') {
        // Nur Echo — Anfrage hinaus (Typ 8), Antwort herein (Typ 0).
        if (p.type !== 8 && p.type !== 0) return null;
        return p.id == null ? null : p.id;
      }
      return null;
    }

    function kennungSetzen(pkt, richtung, wert) {
      const p = pkt.payload || {};
      if (pkt.proto === 'udp' || pkt.proto === 'tcp') {
        if (richtung === 'hin') p.sport = wert; else p.dport = wert;
      } else if (pkt.proto === 'icmp') {
        p.id = wert;
      }
    }

    /* Eine freie Außennummer suchen. Der Zähler läuft weiter und
       springt am Ende zurück; belegte Nummern werden übersprungen.
       Ein Zufallswert wäre realistischer und im Unterricht
       schlechter: zwei Durchläufe desselben Netzes sollen dieselbe
       Tabelle zeigen, sonst ist der Mitschnitt nicht vergleichbar. */
    function freiePort(t) {
      for (let n = 0; n <= PORT_BIS - PORT_VON; n++) {
        const p = t.next;
        t.next = t.next >= PORT_BIS ? PORT_VON : t.next + 1;
        const alt = t.zur.get('x|' + p);
        if (!alt || alt.exp <= engine.now) return p;
      }
      return null;
    }

    function alteWegraeumen(t) {
      for (const [k, z] of [...t.hin]) if (z.exp <= engine.now) t.hin.delete(k);
      for (const [k, z] of [...t.zur]) if (z.exp <= engine.now) t.zur.delete(k);
    }

    /* ═══ Hinaus: aus dem Heimnetz ins Internet ══════════════
       `pkt` wird AN ORT UND STELLE geändert — es ist auf dem Weg
       nach draußen und niemand sonst hält es mehr in der Hand.
       (Der Rahmen wurde beim Ankommen schon kopiert, siehe
       netz.sendFrame.)                                         */
    /* ═══ ICMP-Fehlermeldungen ════════════════════════════════
       „Zeit abgelaufen" (11) und „nicht erreichbar" (3) tragen
       keine eigene Nummer, die in der Tabelle stünde — aber sie
       bringen den Kopf des Pakets mit, um das es geht (`orig`).
       Ein echter NAT-Router liest genau diesen Kopf und übersetzt
       ihn mit. Ohne das endet `traceroute` aus dem Heimnetz nach
       der ersten Station, obwohl der Ping durchkommt — und das Kind
       liest eine falsche Ursache.

       Herein: die Meldung ist an die WAN-Adresse gerichtet und
       nennt im Kopf als ABSENDER die WAN-Adresse mit der äußeren
       Nummer. Beides wird auf das Gerät im Haus zurückgedreht.
       Hinaus: umgekehrt — ein Gerät im Haus meldet einen Fehler
       über ein Paket, das von draußen hereinkam; dessen ZIEL war
       vor der Übersetzung die WAN-Adresse. */
    const istFehler = (pkt) => pkt.proto === 'icmp' && pkt.payload
      && (pkt.payload.type === 3 || pkt.payload.type === 11)
      && pkt.payload.orig && typeof pkt.payload.orig === 'object';

    function origNummer(o, feld) {
      if (o.proto === 'tcp' || o.proto === 'udp') return o[feld];
      return o.id;                     // Echo (oder ein alter Kopf ohne proto)
    }
    function origSetzen(o, feld, wert) {
      if (o.proto === 'tcp' || o.proto === 'udp') o[feld] = wert; else o.id = wert;
    }
    const origProto = (o) => o.proto || 'icmp';

    function fehlerHerein(node, pkt, say) {
      const o = pkt.payload.orig;
      const nr = origNummer(o, 'sport');
      if (nr == null) return false;
      const proto = origProto(o);
      const t = tb(node);
      const z = t.zur.get('x|' + nr);
      let innen = null, innenPort = null;
      if (z && z.exp > engine.now && z.proto === proto && o.src === z.aussen && pkt.dst === z.aussen) {
        innen = z.innen; innenPort = z.innenPort;
      } else {
        const wan = node.nics[netz.WAN];
        if (!wan || !wan.ip || pkt.dst !== wan.ip || o.src !== wan.ip) return false;
        const f = frei(node).find(x => x.proto === proto && x.port === nr);
        if (!f) return false;
        innen = f.lanIp; innenPort = f.lanPort;
      }
      say('nat', node, {
        dir: 'herein', proto: 'icmp',
        von: pkt.dst + ':' + nr, nach: innen + ':' + innenPort, src: pkt.src
      });
      pkt.dst = innen;
      o.src = innen;
      origSetzen(o, 'sport', innenPort);
      return true;
    }

    function fehlerHinaus(node, pkt, wanNic, say) {
      const o = pkt.payload.orig;
      const nr = origNummer(o, 'dport');
      if (nr == null || pkt.src === wanNic.ip) return false;
      const proto = origProto(o);
      let aussenPort = null;
      const fh = frei(node).find(x => x.proto === proto && x.lanIp === o.dst && x.lanPort === nr);
      if (fh) aussenPort = fh.port;
      else {
        const z = tb(node).hin.get(proto + '|' + o.dst + '|' + nr);
        if (!z || z.exp <= engine.now) return false;
        aussenPort = z.aussenPort;
      }
      say('nat', node, {
        dir: 'hinaus', proto: 'icmp',
        von: pkt.src + ':' + nr, nach: wanNic.ip + ':' + aussenPort, dst: pkt.dst
      });
      pkt.src = wanNic.ip;
      o.dst = wanNic.ip;
      origSetzen(o, 'dport', aussenPort);
      return true;
    }

    function hinaus(node, pkt, wanNic, say) {
      if (!aktiv(node) || !wanNic || !wanNic.ip) return false;
      if (istFehler(pkt)) return fehlerHinaus(node, pkt, wanNic, say);
      const nr = kennung(pkt, 'hin');
      if (nr == null) return false;

      /* Ein Paket, das der Heimrouter selbst geschickt hat, trägt
         schon die WAN-Adresse. Es zweimal zu übersetzen hieße,
         eine Zeile für etwas anzulegen, das keine braucht. */
      if (pkt.src === wanNic.ip) return false;

      /* ⟨Portfreigabe⟩ Der Rückweg einer freigegebenen Sache. Er
         MUSS vor der Tabelle stehen: sonst bekäme die Antwort des
         Webservers im Haus eine frisch vergebene Nummer (40001),
         und draußen wartet jemand auf eine Antwort von Port 80.
         Dieselbe Liste wie in `herein` — deshalb kann die eine
         Richtung nicht anders antworten als die andere. */
      const fh = frei(node).find(x =>
        x.proto === pkt.proto && x.lanIp === pkt.src && x.lanPort === nr);
      if (fh) {
        say('nat', node, {
          dir: 'hinaus', proto: pkt.proto, frei: true,
          von: pkt.src + ':' + nr, nach: wanNic.ip + ':' + fh.port, dst: pkt.dst
        });
        pkt.src = wanNic.ip;
        kennungSetzen(pkt, 'hin', fh.port);
        return true;
      }

      const t = tb(node);
      alteWegraeumen(t);

      const k = pkt.proto + '|' + pkt.src + '|' + nr;
      let z = t.hin.get(k);
      if (!z || z.exp <= engine.now) {
        const aussen = freiePort(t);
        if (aussen === null) {
          say('note', node, { text: 'Die NAT-Tabelle ist voll — so viele Gespräche '
            + 'gleichzeitig hält dieses Gerät nicht aus.', level: 'warn' });
          return false;
        }
        z = { proto: pkt.proto, innen: pkt.src, innenPort: nr, aussenPort: aussen, exp: 0 };
        t.hin.set(k, z);
        t.zur.set('x|' + aussen, z);
      }
      z.exp = engine.now + NAT_TTL;
      z.aussen = wanNic.ip;

      say('nat', node, {
        dir: 'hinaus', proto: pkt.proto,
        von: pkt.src + ':' + nr, nach: wanNic.ip + ':' + z.aussenPort, dst: pkt.dst
      });

      pkt.src = wanNic.ip;
      kennungSetzen(pkt, 'hin', z.aussenPort);
      return true;
    }

    /* ═══ Herein: aus dem Internet ins Heimnetz ══════════════
       Gibt `true` zurück, wenn übersetzt wurde. Passiert nichts,
       ist das KEIN Fehler: an die Adresse des Heimrouters kann
       auch etwas gerichtet sein, das wirklich für ihn ist (eine
       Antwort des DHCP-Servers beim Anbieter zum Beispiel). */
    function herein(node, pkt, say) {
      if (!aktiv(node)) return false;
      if (istFehler(pkt)) return fehlerHerein(node, pkt, say);
      const nr = kennung(pkt, 'zur');
      if (nr == null) return false;

      const t = tb(node);
      const z = t.zur.get('x|' + nr);
      /* Die Zeile gilt für die Adresse, unter der sie angelegt
         wurde. Kommt das Paket an eine andere Adresse desselben
         Geräts, ist es nicht die Antwort, die hier erwartet wird. */
      if (z && z.exp > engine.now && (!z.aussen || pkt.dst === z.aussen)) {
        z.exp = engine.now + NAT_TTL;

        say('nat', node, {
          dir: 'herein', proto: pkt.proto,
          von: pkt.dst + ':' + nr, nach: z.innen + ':' + z.innenPort, src: pkt.src
        });

        pkt.dst = z.innen;
        kennungSetzen(pkt, 'zur', z.innenPort);
        return true;
      }

      /* ⟨Portfreigabe⟩ Keine Zeile aus einem Gespräch — aber
         vielleicht eine, die von Hand dasteht. Das ist der eine
         Fall, in dem von außen jemand anfangen darf.

         ⚠️ Gefragt wird gegen die WAN-Adresse und nicht bloß gegen
         „irgendeine Adresse dieses Geräts": freigegeben ist ein
         Port an der Adresse, die der Anbieter vergeben hat. Ein
         Paket, das über das WAN-Kabel an die LAN-Adresse gerichtet
         ist, hat mit der Freigabe nichts zu tun. */
      const wan = node.nics[netz.WAN];
      if (!wan || !wan.ip || pkt.dst !== wan.ip) return false;

      const f = frei(node).find(x => x.proto === pkt.proto && x.port === nr);
      if (!f) return false;

      say('nat', node, {
        dir: 'herein', proto: pkt.proto, frei: true,
        von: pkt.dst + ':' + nr, nach: f.lanIp + ':' + f.lanPort, src: pkt.src
      });

      pkt.dst = f.lanIp;
      kennungSetzen(pkt, 'zur', f.lanPort);
      return true;
    }

    /* Was in der Tabelle steht — für das Gerätefenster. Filius
       zeigt dasselbe in einem eigenen Fenster (NatViewer); hier
       steht es bei den anderen Tabellen, die ein Gerät sich selbst
       gebaut hat, denn genau das ist es. */
    function tabelle(node) {
      /* ⚠️ Ohne eingeschaltetes NAT gibt es diese Tabelle NICHT —
         auch nicht die Freigaben darin. Sie stehen zwar weiter in
         den Einstellungen (und sollen es, man schaltet NAT ja
         wieder an), aber sie übersetzen nichts, und eine Zeile, die
         nichts tut, darf nicht in der Tabelle der Übersetzungen
         stehen. Der Prüfstand hat das gefunden: das Fenster zeigt
         die Tabelle ohnehin nur bei aktivem NAT, also wäre es lange
         niemandem aufgefallen — bis der nächste Aufrufer ihr
         glaubt. */
      if (!aktiv(node)) return [];

      /* ⭐ Die Freigaben stehen OBEN und immer, auch bei leerer
         Tabelle: sie sind der Teil, der schon dasteht, bevor das
         erste Paket kommt. Genau das ist der Unterschied, um den
         es bei ihnen geht — darunter die Zeilen, die aus einem
         Gespräch entstanden sind und mit ihm ablaufen. */
      const out = [];
      const wan = (node.nics && node.nics[netz.WAN]) || {};
      for (const f of frei(node)) {
        out.push({
          proto: f.proto,
          innen: f.lanIp, innenPort: f.lanPort,
          aussen: wan.ip || '', aussenPort: f.port,
          rest: null, frei: true
        });
      }

      if (!node.state || !node.state.nat) return out;
      const t = node.state.nat;
      const dyn = [];
      for (const z of t.hin.values()) {
        if (z.exp <= engine.now) continue;
        dyn.push({
          proto: z.proto,
          innen: z.innen, innenPort: z.innenPort,
          aussen: z.aussen || '', aussenPort: z.aussenPort,
          rest: z.exp - engine.now, frei: false
        });
      }
      dyn.sort((a, b) => a.aussenPort - b.aussenPort);
      return out.concat(dyn);
    }

    function leeren(node) {
      if (node) { if (node.state) node.state.nat = null; return; }
      for (const n of netz.list()) if (n.state) n.state.nat = null;
    }

    return { aktiv, hinaus, herein, tabelle, leeren, frei, NAT_TTL, PORT_VON };
  }

  window.Nat = { erzeugen, NAT_TTL, PORT_VON, PORT_BIS };
})();
