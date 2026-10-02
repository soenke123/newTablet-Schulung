/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — dienste.js   ·   DHCP und DNS
   ══════════════════════════════════════════════════════════════
   Die ersten zwei Programme, die auf der Anwendungsschicht sitzen.
   Beide sind nach ihren RFCs gebaut (2131 und 1035) und auf das
   eingekocht, was im Unterricht erklärt wird.

   ── Warum beide in einer Datei stehen ─────────────────────────
   Weil sie dasselbe Muster haben und dasselbe brauchen: einen
   Port, einen Behandler, einen Zeitgeber fürs Aufgeben. Wer die
   zwei nebeneinander liest, sieht das Muster — und das dritte
   Programm (Webserver) schreibt sich danach fast von selbst.

   ── Was DHCP im Unterricht leistet ────────────────────────────
   Es ist das erste Protokoll, bei dem ein Kind einen Nutzen SPÜRT,
   statt ihn erklärt zu bekommen: vier Rechner einrichten heißt
   nicht mehr zwölf Zahlen tippen, sondern einen Schalter umlegen.
   Und es ist das erste, das ohne Rundruf nicht funktionieren kann —
   ein Gerät ohne Adresse kann niemanden gezielt fragen. Genau
   deshalb steht in schichten.js der Sonderweg für
   255.255.255.255.

   ── Vier Nachrichten, nicht zwei ──────────────────────────────
   Discover → Offer → Request → Ack. Die Abkürzung auf zwei
   („frag, bekomm") wäre einfacher zu bauen und würde die Frage
   unbeantwortet lassen, die jede Klasse stellt: was passiert bei
   ZWEI Servern? Mit Offer und Request ist die Antwort sichtbar —
   der Rechner wählt eines der Angebote und sagt laut, welches.

   ── Was bewusst fehlt ─────────────────────────────────────────
   Verlängerung der Leihfrist (Renew/Rebind), Relay über
   Netzgrenzen, DHCPv6, DNS-Zonen, rückwärtige Auflösung, TTL im
   DNS-Eintrag, mehrere Antworten je Name. Nichts davon beantwortet
   die Frage, warum ein Rechner keine Adresse bekommt.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* Wartezeiten, alle in SIMULIERTER Zeit. Auf dem Bildschirm
     werden sie durch das Tempo geteilt: bei der Vorgabe 0,1 ist
     eine simulierte Sekunde eine echte Zehntelminute. Deshalb sind
     diese Zahlen klein.

     Wie bei ARP gilt: das Aufgeben muss VOR der Geduld des
     Menschen kommen, und der Grund muss dastehen. 3 × 1,2 s,
     danach steht „kein Server hat geantwortet" auf dem Gerät —
     nicht „keine Adresse" ohne Erklärung. DHCP braucht kein ARP
     (es ruft in den Raum) und kommt darum mit weniger aus. */
  const DHCP_WAIT  = 1200 * U.MS;
  const DHCP_TRIES = 3;

  /* ⚠️ DNS_WAIT muss LÄNGER sein als das, was eine erste Frage
     insgesamt braucht: ARP zum Gateway, ARP des Routers zum
     Server, und vier Kabelstrecken hin und zurück. Bei 1,5 s stand
     hier genau dieser Fehler — die Antwort war nach 1,6 s da, die
     Wiederholung ging nach 1,5 s hinaus. Im Mitschnitt stand die
     Frage dann zweimal, und die zweite Antwort kam auf einen Port
     zurück, der schon geschlossen war: „Port nicht erreichbar"
     als Schlusspunkt einer geglückten Auflösung. Ein Kind, das
     das liest, lernt etwas Falsches.

     2,5 s liegen über der schlimmsten ARP-Geduld (1,2 s) plus
     acht Kabelstrecken (0,8 s). */
  const DNS_WAIT   = 2500 * U.MS;
  const DNS_TRIES  = 2;
  const DNS_CACHE  = 30 * U.SEC;     // so lange gilt ein gelernter Name

  function Dienste(engine, netz, stack, opts) {
    opts = opts || {};
    const P = stack.PORT;

    let laeuft = false;          // sind die Dienste scharf? (= Aktionsmodus)

    const melde = (kind, node, data) => engine.emit('event', Object.assign(
      { kind: kind, node: node ? node.id : null, nodeName: node ? node.name : '', t: engine.now },
      data || {}));

    // Die Oberfläche muss eine geliehene Adresse sofort zeigen.
    const frisch = () => { if (opts.onUpdate) opts.onUpdate(); };
    /* Ein Dienst hat Daten verändert, die ins Speicherformat gehören
       (Konten, Likes, Kommentare, Post): speichern. */
    const geaendert = () => { if (opts.onDirty) opts.onDirty(); };

    /* ═══ Zustand ════════════════════════════════════════════
       Alles Laufzeitwissen, nichts davon in der gespeicherten
       Datei: Leihverträge und aufgelöste Namen gehören zu einem
       laufenden Netz, nicht zu seiner Bauanleitung. */
    function sv(node) {                    // Server-Seite
      const s = node.state || (node.state = {});
      if (!s.dhcpS) s.dhcpS = { leases: new Map() };   // mac → { ip, until }
      return s.dhcpS;
    }
    function cv(node) {                    // Client-Seite
      const s = node.state || (node.state = {});
      if (!s.dhcpC) s.dhcpC = new Map();   // nicIndex → { tries, ev, phase, angebot }
      return s.dhcpC;
    }
    function dnsv(node) {
      const s = node.state || (node.state = {});
      if (!s.dnsCache) s.dnsCache = new Map();         // name → { ip, exp }
      if (!s.dnsOpen)  s.dnsOpen  = new Map();         // sport → { ev, cb }
      return s;
    }

    /* ═══ An- und abschalten ═════════════════════════════════
       `sync` ist der einzige Weg, auf dem Dienste scharf werden,
       und er ist absichtlich stumpf: er schaut sich jedes Gerät an
       und stellt her, was dastehen soll. Damit ist er beliebig oft
       aufrufbar — nach jeder Änderung im Kärtchen, nach jedem
       Ein- und Ausschalten, beim Wechsel in den Aktionsmodus.

       Die Alternative wäre, an jeder Änderungsstelle das Richtige
       zu tun. Genau dort entstehen die Fehler, die man nicht
       findet: ein Dienst, der noch lauscht, obwohl der Schalter
       aus ist. */
    function sync() {
      for (const node of netz.list()) {
        /* Ein ausgeschaltetes Gerät hat keine offenen Verbindungen
           mehr. Das gehört hierher und nicht an den Ausschalter:
           `sync()` ist die Stelle, die nach JEDEM Ein- und
           Ausschalten ohnehin aufräumt, und eine zweite Stelle
           wäre die, die man beim nächsten Umbau vergisst. */
        if (!node.on || !laeuft) stack.tcpAufraeumen(node);

        /* Die Firewall löst die Namen auf ihrer Liste auf, sobald die Uhr
           läuft — `sync()` wird beim Start und nach jeder Änderung
           gerufen, und `namenHolen` fragt nur, wenn nichts Frisches da
           ist. Im Entwurf steht die Uhr, und dort wird nicht gefragt. */
        if (laeuft && node.on && netz.fwLaeuft(node)) stack.fwNamen(node);

        /* ⚠️ Ob ein Dienst laufen SOLL, steht seit der Marke unter
           der Kachel an einer einzigen Stelle: `netz.dienstLaeuft`
           (installiert UND gestartet UND Gerät an). Hier bleibt nur
           das `laeuft` dieser Datei davor — das ist die Uhr, nicht
           das Gerät: im Entwurfsmodus lauscht niemand, die Marke
           steht trotzdem da. Sonst wäre „welches Gerät ist der
           DNS-Server" genau in dem Modus unbeantwortbar, in dem man
           das Netz baut. */
        if (laeuft && netz.dienstLaeuft(node, 'dhcp')) stack.listen(node, P.dhcpServer, onServer, 'DHCP-Server');
        else stack.unlisten(node, P.dhcpServer);

        /* Zwei Bedingungen, nicht eine — und das ist der Punkt:
           der DNS-Server muss INSTALLIERT (Software-Installation,
           wie in Filius) und GESTARTET sein. Ein Programm, das man
           erst aufspielen und dann starten muss, ist das, was ein
           Kind von einem Rechner kennt. Ein Schalter im
           Einstellformular wäre bequemer und würde genau diese
           Erfahrung wegnehmen. */
        if (laeuft && netz.dienstLaeuft(node, 'dns')) stack.listen(node, P.dns, onDnsServer, 'DNS-Server');
        else stack.unlisten(node, P.dns);

        /* Der Webserver, nach demselben Muster: installiert UND
           gestartet. `http` steht am Ende dieser Datei — erzeugt
           ist es, bevor `sync` je gerufen wird. */
        /* ⚠️ Webserver UND Streaming-Server wollen Port 80 — es
           lauscht genau einer, der Streaming-Server hat Vorrang (die
           Fenster lassen den zweiten gar nicht erst starten; das
           hier ist die Sicherung im Netz). Ausgeschaltet wird EINMAL:
           zwei getrennte `Aus`-Aufrufe würden sich gegenseitig das
           Ohr abdrehen. */
        if (http) {
          const streamAn = !!(laeuft && stream && stream.laeuft(node));
          if (streamAn) stream.serverAn(node);
          else if (laeuft && http.laeuft(node)) http.serverAn(node);
          else http.serverAus(node);
        }

        // Der E-Mail-Server ist zwei Dienste auf zwei Ports (25
        // und 110, mit TLS 465 und 995) und wird trotzdem mit EINEM
        // Schalter geschaltet.
        if (mail) {
          if (laeuft && mail.laeuft(node)) mail.serverAn(node);
          else mail.serverAus(node);
        }

        // Die Zertifizierungsstelle: ein Port (8200), ein Schalter.
        if (zs) {
          if (laeuft && zs.laeuft(node)) zs.serverAn(node);
          else zs.serverAus(node);
        }

        /* Der VPN-Server (Port 1194). Und der Client-Tunnel: er gilt
           nur, solange das Gerät an ist und die Uhr läuft — sonst
           stünde ein Tunnel da, durch den nichts mehr fährt. */
        if (vpn) {
          if (laeuft && vpn.laeuft(node)) vpn.serverAn(node);
          else vpn.serverAus(node);
          if (!laeuft || !node.on) vpn.aufraeumen(node);
        }

        /* Das automatische Routing (RIP). Nach demselben stumpfen
           Muster: `ripAn` stellt her, was dastehen soll, `ripAus`
           räumt weg. Die Bedingung steckt in `stack.ripAktiv` —
           Router, Schalter an, Gerät an — und `ripAn` prüft sie
           selbst noch einmal; zwei Stellen mit derselben Frage
           wären hier eine zu viel.

           ⚠️ Nur im Aktionsmodus, und das ist bei RIP mehr als
           Formsache: es ist das erste Protokoll in diesem Programm,
           das OHNE Zutun redet. Im Entwurf liefe der Takt weiter,
           während jemand an einer Adresse tippt — und der
           Mitschnitt füllte sich mit Ansagen über ein Netz, das
           gerade umgebaut wird. */
        if (laeuft && stack.ripAktiv(node)) stack.ripAn(node);
        else stack.ripAus(node);

        const willClient = laeuft && node.on && node.nics.some(k => k.dhcp);
        if (willClient) stack.listen(node, P.dhcpClient, onClient, 'DHCP-Client');
        else stack.unlisten(node, P.dhcpClient);

        for (const nic of node.nics) {
          const c = cv(node);
          const lauf = c.get(nic.i);
          if (willClient && nic.up && nic.dhcp) {
            /* Noch keine Adresse und keine Anfrage unterwegs? Dann
               los — aber nur, wenn überhaupt ein Kabel dranhängt.

               Ein echter Rechner wartet auf das Signal auf der
               Leitung, und ohne Kabel wäre „kein DHCP-Server hat
               geantwortet" schlicht die falsche Auskunft: geantwortet
               hat niemand, weil niemand gefragt wurde. Sichtbar wird
               das beim Heimrouter, dessen WAN-Buchse beim Hinstellen
               noch leer ist — ohne diese Bedingung begrüßt er die
               Klasse mit drei Fehlermeldungen über einen Anbieter,
               den noch niemand angeschlossen hat. */
            if (!lauf && !nic.ip && nic.cable) discoverBald(node, nic.i);
          } else if (lauf) {
            engine.cancel(lauf.ev);
            c.delete(nic.i);
          }
        }
      }
    }

    /* Von vorn: Leihverträge weg, Namen weg, Adressen der
       DHCP-Anschlüsse weg. Das ist der Knopf „zeig das noch
       einmal" — und ohne das Löschen der Adressen zeigt er nichts,
       weil jeder Rechner seine Adresse schon hat. */
    function reset() {
      for (const node of netz.list()) {
        const s = node.state || {};
        if (s.dhcpS) s.dhcpS.leases.clear();
        if (s.dnsCache) s.dnsCache.clear();
        /* Warnungen, die jemand weggeklickt hat („Trotzdem fortfahren"),
           gelten nur für diesen Durchgang — von vorn heißt von vorn. */
        if (s.tlsAusnahmen) s.tlsAusnahmen = {};
        if (s.dhcpC) { for (const c of s.dhcpC.values()) engine.cancel(c.ev); s.dhcpC.clear(); }
        if (s.dnsOpen) { for (const o of s.dnsOpen.values()) engine.cancel(o.ev); s.dnsOpen.clear(); }
        /* Auch die NAT-Tabelle. Sie ist Laufzeitwissen wie alles
           andere hier, und ein Heimrouter, der nach „von vorn"
           noch die Gespräche von vorhin kennt, zeigt beim zweiten
           Durchlauf eine Tabelle, die schon voll ist. */
        if (stack.natLeeren) stack.natLeeren(node);
        /* Und die gelernten Wege. Aus demselben Grund: ein Router,
           der nach „von vorn" noch alle Netze kennt, zeigt die
           Tabelle fertig, statt sie sich füllen zu lassen — und
           genau das Füllen ist bei RIP der Unterricht. */
        if (stack.ripLeeren) stack.ripLeeren(node);
        /* Nicht nur die Adresse, sondern alles, was der Leihvertrag
           gebracht hat — sonst steht danach im Entwurf ein Gerät mit
           leerem Adressfeld, gefüllter Maske und einem Gateway aus
           dem letzten Durchgang. Siehe netz.dhcpLeeren. */
        netz.dhcpLeeren(node);
        /* Und die Anmeldung im Mailprogramm. „Von vorn" heißt auch
           hier von vorn: die Zugangsdaten bleiben stehen (sie sind
           eine Einstellung), aber ob sie stimmen, ist nach einem
           Neuanfang wieder offen — der Server könnte inzwischen
           aus sein, das Konto gelöscht, die Domain geändert.
           Ein grüner Haken, der aus dem vorigen Durchgang
           stehenbleibt, wäre eine Behauptung ohne Prüfung. */
        if (node.mailKonto) node.mailKonto.angemeldet = false;
      }
      frisch();
    }

    function start() { laeuft = true;  sync(); }
    function stop()  {
      laeuft = false;
      for (const node of netz.list()) {
        const s = node.state || {};
        if (s.dhcpC) { for (const c of s.dhcpC.values()) engine.cancel(c.ev); s.dhcpC.clear(); }
      }
      sync();
    }

    /* ═══ DHCP · die Seite, die fragt ════════════════════════ */

    /* ─── Erst einmal kurz warten ──────────────────────────────
       ⭐ Ein Client fragt NICHT in dem Augenblick, in dem er
       eingeschaltet wird, sondern nach einer gewürfelten kurzen
       Weile. Vom Nutzer verlangt: „Wenn sich zwei DHCP-Server in
       einem Netzwerk befinden … soll für uns Menschen nicht
       vorhersehbar sein, welches Endgerät welche IP-Adresse
       bekommt bzw. von welchem DHCP-Server."

       Das ist keine Zutat, sondern das echte Verhalten: RFC 2131
       verlangt ausdrücklich eine zufällige Wartezeit vor dem
       ersten DISCOVER, damit nicht alle Geräte nach einem
       Stromausfall gleichzeitig losschreien.

       ⚠️ Und es ist die Stelle, an der der ganze Zufall dieser
       Sache hängt. `sync()` läuft über `netz.list()`, also über
       die Reihenfolge, in der die Geräte angelegt wurden; früher
       ging von dort jedes DISCOVER sofort hinaus und die
       Reihenfolge auf der Leitung war damit die Reihenfolge auf
       der Fläche. Jetzt entscheidet der Würfel, wer zuerst fragt —
       und bei zwei Servern damit auch, wessen OFFER zuerst
       ankommt und gewinnt.

       Bearbeitet wird trotzdem eines nach dem anderen: die
       Ereigniswarteschlange führt immer genau ein Ereignis aus.
       Gewürfelt wird das WANN, nicht ein Nebeneinander.

       Der Eintrag entsteht schon hier und nicht erst in
       `discover`. Ohne ihn sähe das nächste `sync()` „keine
       Anfrage unterwegs" und legte eine zweite daneben. */
    const DHCP_START = 300 * U.MS;

    function discoverBald(node, nicIndex) {
      const c = cv(node);
      if (c.get(nicIndex)) return;
      const z = { tries: 0, ev: null, phase: 'wartet', angebot: null };
      c.set(nicIndex, z);
      z.ev = engine.at(engine.randInt(DHCP_START), () => {
        const jetzt = cv(node).get(nicIndex);
        if (!jetzt || jetzt.phase !== 'wartet') return;
        discover(node, nicIndex);
      }, 'dhcp-start', node.id);
    }

    function discover(node, nicIndex) {
      const nic = node.nics[nicIndex];
      if (!node.on || !nic || !nic.up || !nic.dhcp) return;

      const c = cv(node);
      let z = c.get(nicIndex);
      if (!z) { z = { tries: 0, ev: null, phase: 'discover', angebot: null }; c.set(nicIndex, z); }
      z.tries++;
      z.phase = 'discover';
      z.angebot = null;

      /* Die alten Angaben fallen weg, bevor gefragt wird. Sonst
         stünde während der ganzen Anfrage die Adresse vom letzten
         Durchgang auf der Fläche, und niemand sähe, dass sie gerade
         geholt wird. Nur DIESE Netzwerkkarte: ein Gerät mit zwei
         Anschlüssen an DHCP soll nicht den einen verlieren, weil
         der andere neu fragt. */
      if (netz.dhcpLeeren(node, nicIndex)) frisch();

      melde('dhcp-out', node, { art: 'discover', try: z.tries, nic: nicIndex });
      stack.sendUdp(node, '255.255.255.255', P.dhcpClient, P.dhcpServer,
        { art: 'discover', mac: nic.mac, name: node.name },
        { nic: nicIndex, src: '0.0.0.0' });

      z.ev = engine.at(DHCP_WAIT, () => {
        const jetzt = cv(node).get(nicIndex);
        if (!jetzt || jetzt.phase === 'fertig') return;
        if (jetzt.tries < DHCP_TRIES) discover(node, nicIndex);
        else aufgeben(node, nicIndex,
          'Kein DHCP-Server hat geantwortet. Läuft im Netz einer, und ist er eingeschaltet?');
      }, 'dhcp-wiederholung', node.id);
    }

    function aufgeben(node, nicIndex, warum) {
      const c = cv(node);
      const z = c.get(nicIndex);
      if (z) { engine.cancel(z.ev); c.delete(nicIndex); }
      melde('dhcp-fail', node, { why: warum, nic: nicIndex, level: 'warn' });
      melde('note', node, { text: warum, level: 'warn' });
      frisch();
    }

    function onClient(m) {
      const node = m.node;
      const nic = node.nics[m.nic];
      const d = m.data || {};
      if (!nic) return;

      /* Jede Antwort geht als Rundruf durchs Netz — jedes Gerät
         sieht sie also. Gemeint ist nur eines, und das steht in
         der Nachricht: die MAC-Adresse. Genau das ist der Grund,
         warum in einem DHCP-Paket eine MAC-Adresse steht, obwohl
         der Ethernet-Rahmen sie schon trägt. Ein Kind kann das im
         Mitschnitt nachlesen. */
      if (d.mac !== nic.mac) return;

      const z = cv(node).get(m.nic);
      if (!z) return;                      // gar nicht gefragt (oder schon fertig)

      if (d.art === 'offer' && z.phase === 'discover') {
        z.phase = 'request';
        z.angebot = { ip: d.ip, server: m.from };
        engine.cancel(z.ev);
        melde('dhcp-out', node, { art: 'request', ip: d.ip, server: m.from, nic: m.nic });
        stack.sendUdp(node, '255.255.255.255', P.dhcpClient, P.dhcpServer,
          { art: 'request', mac: nic.mac, ip: d.ip, server: m.from, name: node.name },
          { nic: m.nic, src: '0.0.0.0' });
        // Bleibt die Bestätigung aus, fängt alles von vorn an.
        z.ev = engine.at(DHCP_WAIT, () => {
          const jetzt = cv(node).get(m.nic);
          if (!jetzt || jetzt.phase === 'fertig') return;
          if (jetzt.tries < DHCP_TRIES) discover(node, m.nic);
          else aufgeben(node, m.nic, 'Der Server hat das Angebot nicht bestätigt.');
        }, 'dhcp-frist', node.id);
        return;
      }

      if (d.art === 'ack' && z.phase === 'request') {
        engine.cancel(z.ev);
        z.phase = 'fertig';
        nic.ip = d.ip;
        if (d.mask) nic.mask = d.mask;
        /* Gateway und DNS-Server gehören zum Gerät, nicht zum
           Anschluss — sie kommen aber über den Anschluss herein.
           Nur überschreiben, wenn der Server wirklich etwas
           mitschickt: ein Netz, in dem das Gateway schon von Hand
           eingetragen ist, soll es behalten. */
        if (d.gateway) node.gateway = d.gateway;
        if (d.dns) node.dns = d.dns;
        z.lease = { server: m.from, until: engine.now + (d.lease || 600) * U.SEC };
        melde('dhcp-ok', node, {
          ip: d.ip, mask: nic.mask, gateway: d.gateway || '', dns: d.dns || '',
          server: m.from, nic: m.nic
        });
        stack.clearTables(node);     // neue Adresse: alles Gelernte ist überholt
        frisch();
        return;
      }

      if (d.art === 'nak') {
        aufgeben(node, m.nic, d.grund || 'Der DHCP-Server hat abgelehnt.');
      }
    }

    /* ═══ DHCP · die Seite, die verteilt ═════════════════════ */

    function onServer(m) {
      const node = m.node;
      const conf = node.dhcpServer;
      const d = m.data || {};
      if (!conf || !conf.on) return;

      /* Verteilt wird in genau EINEM Netz — dem am eingestellten
         Anschluss. Bei einem Router ist das die Entscheidung, um
         die es geht: er hängt in zwei Netzen und soll nur in einem
         Adressen vergeben. Kommt die Anfrage am anderen Anschluss
         an, ist das kein Fehler des Kindes, sondern eine Frage —
         also antworten wir mit einer Erklärung statt mit Stille. */
      /* Gefragt wird nach dem ANSCHLUSS, nicht nach der Buchse.
         Beim Heimrouter sind die vier LAN-Buchsen ein Anschluss
         (netz.bruecke) — eine Anfrage an Buchse 3 gehört
         selbstverständlich zum LAN-Netz. Stand hier `m.nic !==
         conf.nic`, bekam nur das Gerät an der ersten Buchse eine
         Adresse, und die anderen drei bekamen eine Erklärung
         darüber, dass sie am falschen Anschluss hängen. */
      if (netz.bruecke(node, conf.nic | 0).indexOf(m.nic) < 0) {
        melde('note', node, {
          text: 'Eine DHCP-Anfrage kam an ' + netz.portLabel(node, m.nic)
            + ' an, verteilt wird aber nur im Netz an ' + netz.portLabel(node, conf.nic | 0) + '.',
          level: 'info'
        });
        return;
      }

      const eigen = node.nics[conf.nic | 0];
      if (!eigen || !eigen.ip) {
        melde('note', node, {
          text: 'Dieser DHCP-Server hat am verteilenden Anschluss selbst keine Adresse.',
          level: 'warn'
        });
        return;
      }

      if (d.art === 'discover') {
        const ip = waehleIp(node, conf, d.mac);
        if (!ip) {
          melde('dhcp-out', node, { art: 'nak', to: d.mac });
          antwort(node, conf, m.nic, { art: 'nak', mac: d.mac,
            grund: 'Der Adressbereich des Servers ist erschöpft.' });
          return;
        }
        melde('dhcp-out', node, { art: 'offer', ip: ip, to: d.mac });
        antwort(node, conf, m.nic, Object.assign({ art: 'offer', mac: d.mac, ip: ip }, mitgabe(node, conf)));
        return;
      }

      if (d.art === 'request') {
        /* Zwei Server im Netz: der Rechner nennt in der Anfrage,
           welches Angebot er nimmt. Wer nicht gemeint ist, hält
           still — und darf seine reservierte Adresse wieder
           freigeben. Das ist der Satz, für den Offer und Request
           überhaupt da sind. */
        if (d.server && d.server !== eigen.ip) {
          const s = sv(node);
          const hat = s.leases.get(d.mac);
          if (hat && !hat.bestaetigt) s.leases.delete(d.mac);
          melde('note', node, {
            text: 'Ein Endgerät hat das Angebot von ' + d.server + ' genommen, nicht unseres.',
            level: 'info'
          });
          return;
        }

        const s = sv(node);
        const hat = s.leases.get(d.mac);
        if (!hat || hat.ip !== d.ip) {
          melde('dhcp-out', node, { art: 'nak', to: d.mac });
          antwort(node, conf, m.nic, { art: 'nak', mac: d.mac,
            grund: 'Diese Adresse hat der Server nicht angeboten.' });
          return;
        }
        hat.bestaetigt = true;
        hat.until = engine.now + (conf.lease || 600) * U.SEC;
        melde('dhcp-out', node, { art: 'ack', ip: d.ip, to: d.mac });
        antwort(node, conf, m.nic, Object.assign({ art: 'ack', mac: d.mac, ip: d.ip }, mitgabe(node, conf)));
      }
    }

    // Was der Server außer der Adresse noch mitgibt.
    function mitgabe(node, conf) {
      const eigen = node.nics[conf.nic | 0];
      return {
        mask: conf.mask || (eigen && eigen.mask) || '255.255.255.0',
        gateway: conf.gateway || '',
        dns: conf.dns || '',
        lease: conf.lease || 600,
        server: eigen ? eigen.ip : ''
      };
    }

    /* ⭐ Der Server antwortet nach einer kurzen gewürfelten Weile,
       nicht im selben Augenblick.

       Das ist die zweite Hälfte der Frage „von welchem DHCP-Server
       bekommt dieses Gerät seine Adresse?", und ohne sie hat sie
       nur eine Antwort. Ein Client nimmt das ERSTE Angebot, das
       ankommt (siehe `onClient`) — und ohne Verzögerung kommt
       immer das Angebot des Servers zuerst an, der weiter vorn am
       Switch steckt. Bei zwei Servern mit verschiedenen Netzen
       landete damit jedes Gerät zuverlässig im selben Netz, und
       die Frage war beantwortet, bevor jemand sie gestellt hatte.

       Sachlich ist die Weile das Richtige: ein Server braucht Zeit
       zum Nachdenken, und wie lange, weiß man vorher nicht.

       ⚠️ Sie muss KLEINER sein als die Startverzögerung der
       Clients (DHCP_START). Sonst überholt die Antwort auf die
       eine Anfrage die nächste Anfrage, und im Mitschnitt stünde
       ein Offer vor dem Discover, zu dem es gehört. */
    const DHCP_ANTWORT = 120 * U.MS;

    function antwort(node, conf, nicIndex, data) {
      const eigen = node.nics[conf.nic | 0];
      engine.at(engine.randInt(DHCP_ANTWORT), () => {
        if (!node.on) return;
        stack.sendUdp(node, '255.255.255.255', P.dhcpServer, P.dhcpClient, data,
          { nic: nicIndex, src: eigen ? eigen.ip : '0.0.0.0' });
      }, 'dhcp-antwort', node.id);
    }

    /* Welche Adresse bekommt diese MAC?
       Dieselbe MAC bekommt dieselbe Adresse wieder — das ist nicht
       nur höflich, es macht den Unterricht wiederholbar: nach
       „Uhr auf null" steht bei jedem Rechner dieselbe Zahl wie
       vorhin. */
    function waehleIp(node, conf, mac) {
      const s = sv(node);

      /* ─── 1. Feste Zuweisung ───────────────────────────────
         Sie gewinnt vor allem anderen, auch vor einer schon
         laufenden Leihe: wer eine Reservierung einträgt, während
         das Gerät eine andere Adresse hat, will sie beim nächsten
         Durchgang sehen. Filius fragt sie ebenfalls zuerst
         (DHCPServer.offerAddress → findStaticOffer vor
         findDynamicOffer).

         ⚠️ MAC-Adressen werden ohne Rücksicht auf Groß- und
         Kleinschreibung verglichen. Das Programm schreibt sie
         klein, ein Mensch tippt sie groß ab — und eine
         Reservierung, die nur wegen zweier Großbuchstaben nicht
         greift, ist nicht zu finden. */
      const fest = (conf.statisch || [])
        .find(e => e && e.mac && String(e.mac).toLowerCase() === String(mac).toLowerCase());
      if (fest && U.isIp(fest.ip)) {
        s.leases.set(mac, {
          ip: fest.ip, until: engine.now + (conf.lease || 600) * U.SEC,
          bestaetigt: false, fest: true
        });
        return fest.ip;
      }

      /* ─── 2. Dieselbe MAC wie vorhin ───────────────────────*/
      const von = U.ip2int(conf.von), bis = U.ip2int(conf.bis);
      const hat = s.leases.get(mac);
      /* ⚠️ Nur, wenn die alte Adresse noch in den Bereich passt. Wer den
         Bereich ändert (II.1: DHCP verteilt Adressen aus dem falschen Netz),
         soll danach eine passende bekommen — sonst hielte der Server dem
         Gerät die Adresse aus dem alten Bereich für immer hin, und der Fehler
         ließe sich nicht mehr beheben. Ein echter DHCP-Server lehnt eine
         solche Verlängerung ebenfalls ab. */
      if (hat) {
        const alt = U.ip2int(hat.ip);
        if (von !== null && bis !== null && alt !== null && alt >= von && alt <= bis) return hat.ip;
        s.leases.delete(mac);
      }

      if (von === null || bis === null || bis < von) {
        melde('note', node, { text: 'Der Adressbereich des DHCP-Servers ist nicht gültig.', level: 'warn' });
        return null;
      }
      const vergeben = new Set([...s.leases.values()].map(l => l.ip));
      /* Auch reservierte Adressen sind belegt, selbst wenn das
         Gerät dazu noch nie da war. Sonst bekäme der Erste, der
         fragt, die Adresse, die für jemand anderen gedacht ist —
         und die Reservierung liefe ins Leere, ohne dass irgendwo
         etwas falsch aussieht. Filius hält es genauso
         (checkAddressAvailable prüft die statische Liste mit). */
      for (const e of conf.statisch || []) if (e && U.isIp(e.ip)) vergeben.add(e.ip);

      /* ─── 3. Aus dem Bereich, und zwar nicht von vorn ──────
         ⭐ Gewürfelt wird der STARTPUNKT, dann geht es ringförmig
         weiter. Vom Nutzer verlangt: „Die IP-Adressen sollen nicht
         immer in derselben Reihenfolge vergeben werden."

         Der Grund ist Unterricht und nicht Abwechslung: solange
         der Erste .100 bekam, der Zweite .101 und so fort, war die
         Zuteilung aus der Reihenfolge der Geräte ablesbar — und
         damit die Frage „welche Adresse hat E3 wohl?" beantwortet,
         bevor jemand nachgesehen hat. Filius zählt hier ebenfalls
         nicht stur von vorn, sondern einen Ring über
         `lastOfferedAddress` weiter (DHCPServer.nextAddress).

         ⚠️ `engine.randInt` und nicht `Math.random` — die ganze
         Simulation hängt an einem Startwert (siehe util.js). */
      const spanne = bis - von + 1;
      const start = von + (spanne > 0 ? engine.randInt(spanne) : 0);

      for (let n = 0; n < spanne; n++) {
        const a = von + ((start - von + n) % spanne);
        const ip = U.int2ip(a);
        if (vergeben.has(ip)) continue;
        if (U.checkHostAddress(ip, conf.mask || '255.255.255.0')) continue;
        /* Schon fest vergeben? Ein echter Server weiß das nicht und
           verteilt munter doppelt. Hier überspringen wir die
           Adresse und sagen es — die doppelte Adresse wäre ein
           Fehler, den ein Kind niemandem zuordnen kann, und der
           Satz „feste Adressen und DHCP-Bereich dürfen sich nicht
           überschneiden" steht damit im Mitschnitt statt im Buch. */
        if (netz.findByIp(ip)) {
          melde('note', node, {
            text: ip + ' ist schon fest vergeben — der Server nimmt die nächste.',
            level: 'info'
          });
          continue;
        }
        s.leases.set(mac, { ip: ip, until: engine.now + (conf.lease || 600) * U.SEC, bestaetigt: false });
        return ip;
      }
      return null;
    }

    /* ═══ DNS ════════════════════════════════════════════════
       Ein Name, eine Adresse, eine Frage, eine Antwort. Kein
       Zonentransfer, keine Delegation, keine Wurzelserver: der
       Unterrichtsgegenstand ist „warum tippt man nicht Zahlen",
       und der ist mit einem A-Eintrag erzählt.

       Der Server ist ein Gerät mit einer Liste. Dass diese Liste
       von Hand gefüllt wird, ist Absicht — wer sie füllt, versteht,
       dass irgendwo ein Mensch sitzt. */

    /* ⚠️ Zwei Arten von Frage, seit es E-Mail gibt: **A** („welche
       Adresse hat dieser Name") und **MX** („welcher Rechner nimmt
       die Post für diese Domain an"). Filius hat dafür zwei Reiter
       im DNS-Fenster, und der MX-Eintrag ist der Grund, warum DNS
       ein zweites Mal gebraucht wird — nicht, um eine Zahl zu
       sparen, sondern um eine Zuständigkeit nachzuschlagen.

       Ohne `typ` ist es eine A-Frage: alte Stände und der ganze
       vorhandene Code fragen weiter genau so. */
    function onDnsServer(m) {
      const node = m.node;
      const conf = node.dnsServer;
      const d = m.data || {};
      if (!conf || !conf.on || d.art !== 'frage') return;

      const name = String(d.name || '').toLowerCase();
      if (d.typ === 'MX') {
        const mx = (conf.mx || []).find(r => String(r.domain).toLowerCase() === name);
        melde('dns-antwort', node, { name: name, typ: 'MX', mx: mx ? mx.server : null, to: m.from });
        stack.sendUdp(node, m.from, P.dns, m.sport,
          { art: 'antwort', typ: 'MX', name: name, mx: mx ? mx.server : null });
        return;
      }
      const rec = (conf.records || []).find(r => String(r.name).toLowerCase() === name);
      melde('dns-antwort', node, { name: name, ip: rec ? rec.ip : null, to: m.from });
      stack.sendUdp(node, m.from, P.dns, m.sport,
        { art: 'antwort', name: name, ip: rec ? rec.ip : null });
    }

    /* Auflösen: Zwischenspeicher, dann fragen. Der Rückruf bekommt
       immer genau eine Antwort — Adresse, „gibt es nicht" oder
       „niemand hat geantwortet". Drei Fälle, drei Sätze: das ist
       der Unterschied zwischen „geht nicht" und Fehlersuche. */
    let portZaehler = 0;
    /* `typ` ist 'A' (Vorgabe) oder 'MX'. Ein eigener Auflöser für
       MX wäre dieselbe Funktion mit einem anderen Feldnamen —
       dieselbe Frist, dieselbe Wiederholung, derselbe Port. */
    /* `server` (freiwillig): FRAGE DIESEN DNS und nicht den des
       Geräts. So fragt die Zertifizierungsstelle — sie sucht sich den
       DNS aus, dem sie glaubt (zs.js). Dann gilt auch kein
       Zwischenspeicher: ein anderer DNS könnte etwas anderes wissen,
       und genau das soll die Prüfung merken. */
    function resolve(node, name, cb, typ, server) {
      name = String(name || '').trim().toLowerCase();
      const mx = typ === 'MX';
      const s = dnsv(node);
      const dnsIp = server || node.dns;

      /* Der Zwischenspeicher gilt nur für A. Ein MX-Ergebnis ist
         ein NAME und keine Adresse; beides in einer Tabelle wäre
         der Fehler, bei dem später „www.schule.de" als Mailserver
         herauskommt. */
      const c = (mx || server) ? null : s.dnsCache.get(name);
      if (c && c.exp > engine.now) {
        cb({ ok: true, ip: c.ip, name: name, cached: true });
        return;
      }
      if (!dnsIp) {
        cb({ ok: false, name: name,
             why: 'Dieses Gerät kennt keinen DNS-Server. Trag einen bei den Einstellungen ein.' });
        return;
      }
      if (!node.nics.some(k => k.ip)) {
        cb({ ok: false, name: name, why: 'Dieses Gerät hat noch keine IP-Adresse.' });
        return;
      }

      /* Ein eigener Absenderport je Frage — und genau deshalb kann
         die Antwort zugeordnet werden. Im echten DNS macht das die
         Kennung im Kopf; die Portnummer reicht hier und zeigt
         zugleich, wozu Absenderports gut sind. */
      const sport = 49152 + (portZaehler++ % 16000);
      let tries = 0;

      const fertig = (res) => {
        const o = s.dnsOpen.get(sport);
        if (!o) return;                     // schon beantwortet
        s.dnsOpen.delete(sport);
        engine.cancel(o.ev);
        stack.unlisten(node, sport);
        cb(res);
      };

      /* Der flüchtige Port des Auflösers bekommt auch einen Namen —
         er steht nur für den Augenblick einer Frage offen, und wer
         ihn in `netstat` erwischt, soll nicht rätseln müssen. */
      stack.listen(node, sport, (m) => {
        const d = m.data || {};
        if (d.art !== 'antwort' || String(d.name).toLowerCase() !== name) return;
        if (mx) {
          if (d.mx) fertig({ ok: true, mx: d.mx, name: name, from: m.from });
          else fertig({ ok: false, name: name,
                        why: 'Für „' + name + '" ist kein Mailserver eingetragen (MX).' });
          return;
        }
        if (d.ip) {
          if (!server) s.dnsCache.set(name, { ip: d.ip, exp: engine.now + DNS_CACHE });
          fertig({ ok: true, ip: d.ip, name: name, from: m.from });
        } else {
          fertig({ ok: false, name: name,
                   why: 'Der DNS-Server kennt den Namen „' + name + '" nicht.' });
        }
      }, 'DNS-Auflöser');

      const frage = () => {
        tries++;
        melde('dns-frage', node, { name: name, typ: mx ? 'MX' : 'A', server: dnsIp, try: tries });
        stack.sendUdp(node, dnsIp, sport, P.dns,
          mx ? { art: 'frage', typ: 'MX', name: name } : { art: 'frage', name: name });
        const ev = engine.at(DNS_WAIT * (stack.fern(node, dnsIp) ? stack.FERN_FAKTOR : 1), () => {
          if (!s.dnsOpen.has(sport)) return;
          if (tries < DNS_TRIES) { s.dnsOpen.get(sport).ev = null; frage(); }
          else fertig({ ok: false, name: name,
                        why: 'Der DNS-Server ' + dnsIp + ' hat nicht geantwortet.' });
        }, 'dns-frist', node.id);
        const o = s.dnsOpen.get(sport);
        if (o) o.ev = ev; else s.dnsOpen.set(sport, { ev: ev, cb: cb });
      };

      s.dnsOpen.set(sport, { ev: null, cb: cb });
      frage();
    }

    /* ─── Auskunft für die Oberfläche ─────────────────────────*/

    // Was weiß dieses Gerät über seine geliehene Adresse?
    function leaseOf(node, nicIndex) {
      const c = (node.state && node.state.dhcpC) || null;
      const z = c && c.get(nicIndex);
      if (!z || !z.lease) return null;
      return {
        server: z.lease.server,
        rest: Math.max(0, z.lease.until - engine.now),
        phase: z.phase
      };
    }

    // Läuft gerade eine Anfrage? (für „… wird geholt" im Kärtchen)
    function fragtGerade(node, nicIndex) {
      const c = (node.state && node.state.dhcpC) || null;
      const z = c && c.get(nicIndex);
      return !!(z && z.phase !== 'fertig');
    }

    // Was hat dieser Server verliehen?
    function leases(node) {
      const s = (node.state && node.state.dhcpS) || null;
      if (!s) return [];
      return [...s.leases.entries()].map(([mac, l]) => ({
        mac: mac, ip: l.ip, bestaetigt: !!l.bestaetigt,
        rest: Math.max(0, l.until - engine.now)
      })).sort((a, b) => U.ip2int(a.ip) - U.ip2int(b.ip));
    }

    // Aufgelöste Namen (für „Was dieses Gerät gelernt hat")
    function dnsCache(node) {
      const s = (node.state && node.state.dnsCache) || null;
      if (!s) return [];
      return [...s.entries()].filter(([, v]) => v.exp > engine.now)
        .map(([name, v]) => ({ name: name, ip: v.ip }));
    }

    /* Von Hand neu anfragen — der Knopf „Adresse neu holen" und
       der Terminalbefehl `dhcp neu`. Ohne den müsste ein Kind in
       den Entwurf und zurück, nur um DHCP noch einmal zu sehen. */
    function erneuern(node, nicIndex) {
      const c = cv(node);
      const z = c.get(nicIndex);
      if (z) { engine.cancel(z.ev); c.delete(nicIndex); }
      if (!laeuft) return { ok: false, error: 'Dazu muss die Uhr laufen — oben auf Aktion.' };
      const nic = node.nics[nicIndex];
      if (!nic || !nic.dhcp) return { ok: false, error: 'Dieser Anschluss holt seine Adresse nicht automatisch.' };
      stack.listen(node, P.dhcpClient, onClient, 'DHCP-Client');
      discover(node, nicIndex);
      return { ok: true };
    }

    /* ─── HTTP ────────────────────────────────────────────────
       Der Webserver ist ein Dienst wie DHCP und DNS und wird
       deshalb von hier aus an- und abgeschaltet (`sync`). Er
       steht trotzdem in einer eigenen Datei: er ist der erste
       Dienst auf TCP, und er bringt den halben Browser mit.

       ⚠️ Erzeugt am ENDE, denn er braucht `resolve` — das ist
       zwar eine Funktionsdeklaration und damit schon da, aber
       hier unten sieht man, dass er nichts anderes von dieser
       Datei bekommt als den Auflöser. */
    /* TLS zuerst: Browser, Mail und Zertifizierungsstelle stecken
       alle darauf. */
    const tls = window.Tls
      ? window.Tls.erzeugen(engine, netz, stack, {})
      : null;

    const http = window.Http
      ? window.Http.erzeugen(engine, netz, stack, { resolve: resolve, tls: tls })
      : null;

    /* Und E-Mail, nach demselben Muster. Es bekommt denselben
       Auflöser — und braucht ihn zweimal: einmal für den Namen
       seines eigenen Servers, einmal für den MX-Eintrag einer
       fremden Domain. */
    const mail = window.Mail
      ? window.Mail.erzeugen(engine, netz, stack, { resolve: resolve, tls: tls, onDirty: geaendert })
      : null;

    /* Der Streaming-Server braucht beide: den Browser-Teil von
       `http` (Anfragen lesen, Antworten schreiben) und den
       Mailversand. */
    const stream = window.Stream && http && mail
      ? window.Stream.erzeugen(engine, netz, stack, { http: http, mail: mail, onDirty: geaendert })
      : null;

    /* Die Zertifizierungsstelle (zs.js): sie fragt DNS (`resolve` mit
       eigenem Server), besucht Webserver (`http.holen`) und redet
       selbst auf Port 8200. */
    const zs = window.Zs && http
      ? window.Zs.erzeugen(engine, netz, stack, { resolve: resolve, http: http, tls: tls })
      : null;

    /* Der VPN-Tunnel (vpn.js): TLS für die Verbindung, der Auflöser für
       den Namen des Servers — und eingehängt in den Netzstapel. */
    const vpn = window.Vpn && tls
      ? window.Vpn.erzeugen(engine, netz, stack, { resolve: resolve, tls: tls, onDirty: geaendert })
      : null;
    if (vpn) stack.setVpn(vpn);


    /* Die Firewall (firewall.js) kennt den Auflöser nicht; hier lebt er.
       Das cww fragt 8.8.8.8 — es hat keinen eingetragenen DNS, es IST
       das Gateway; alle anderen fragen den DNS, den sie eingetragen
       haben. Ohne einen schlägt die Auflösung mit dem Satz fehl, der
       auch im Fenster der Firewall steht. */
    stack.fwAufloeser((node, name, cb) =>
      resolve(node, name, cb, 'A', netz.istCww(node) ? ((window.Internet && window.Internet.DNS_IP) || '8.8.8.8') : undefined));

    return {
      start, stop, sync, reset, resolve, erneuern,
      leaseOf, fragtGerade, leases, dnsCache, http, mail, stream, tls, zs, vpn,
      get laeuft() { return laeuft; }
    };
  }

  window.Dienste = Dienste;
})();
