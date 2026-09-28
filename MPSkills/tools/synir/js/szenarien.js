/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — szenarien.js   ·   Vorbereitete Netze
   ══════════════════════════════════════════════════════════════
   Vier Ausgangslagen. Jede ist ein Netz plus ein Auftrag — und
   genau in dieser Form wird die Lehrkraft sie später an die
   Klasse schicken (Muster Wild Clusters: die Lehrkraft setzt den
   Stand, jedes Kind arbeitet an seiner eigenen Kopie, vorne läuft
   der Stand der Klasse).

   Deshalb ist ein Szenario hier schon jetzt reine Datei: kein
   Code, keine Funktionen, nichts, was nicht durch JSON passt.

   ── Der Aufbau eines Auftrags ─────────────────────────────────
   Kurz, in Du-Form, mit einem prüfbaren Ziel. „Sorge dafür, dass
   der Ping durchkommt" ist ein besserer Auftrag als „konfiguriere
   das Netz", weil das Kind selbst merkt, wann es fertig ist.

   ⚠️ ── Die linke obere Ecke bleibt frei ─────────────────────────
   Kein Gerät gehört nach x < 430 oder y < 280: dort liegt die
   Auftragskarte. Beim ersten Prüflauf im Browser stand E1
   des ersten Szenarios genau darunter und war nicht anklickbar —
   ausgerechnet das Gerät, mit dem die Aufgabe anfängt. Die Karte
   lässt sich zwar einklappen, aber ein Kind, das nicht weiß, dass
   dort etwas liegt, klappt sie nicht ein.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Kleine Helfer, damit die Netze unten lesbar bleiben und sich
     keine Tippfehler in MAC-Adressen einschleichen. */
  let macN = 0;
  const mac = () => '02:00:5e:' + [++macN, macN * 7 % 256, macN * 31 % 256]
    .map(x => (x % 256).toString(16).padStart(2, '0')).join(':');

  function dev(id, kind, name, x, y, cfg) {
    cfg = cfg || {};
    const ports = cfg.ports || { host: 1, server: 1, handy: 1, switch: 5, router: 2 }[kind];
    const nics = [];
    for (let i = 0; i < ports; i++) {
      const c = (cfg.nics && cfg.nics[i]) || {};
      nics.push({
        /* Kein Vorgabewert für die Maske, wenn dieser Anschluss
           sie sich holt: sonst steht im fünften Szenario schon im
           Entwurf eine 255.255.255.0 in einem Feld, das „kommt vom
           Server" behauptet. */
        i, mac: mac(), ip: c.ip || '',
        mask: c.mask || (c.dhcp ? '' : '255.255.255.0'),
        dhcp: !!c.dhcp, up: true
      });
    }
    const d = {
      id, kind, name, x, y,
      gateway: cfg.gateway || '', dns: cfg.dns || '', on: true, routes: cfg.routes || [],
      nics
    };
    // Dienste nur, wenn das Szenario sie braucht — sonst stünde in
    // jedem gespeicherten Netz bei jedem Gerät ein leerer Dienst.
    if (cfg.dhcpServer) d.dhcpServer = Object.assign({ on: true, nic: 0, lease: 600 }, cfg.dhcpServer);
    if (cfg.dnsServer)  d.dnsServer  = Object.assign({ on: true, records: [] }, cfg.dnsServer);
    if (cfg.webServer)  d.webServer  = Object.assign({ on: true }, cfg.webServer);
    /* ⭐ Der Ordner `/Bilder` auch hier. Ein Szenario geht durch
       `netz.fromJSON` und nicht durch `addNode` — der Grundbestand
       käme sonst NICHT mit, und ein Kind hätte im ersten Szenario
       ein Gerät ohne Bilder und auf dem selbstgezogenen Gerät
       daneben vier. Genau das hat der Browser-Prüfstand gemeldet,
       eine Stunde nachdem der Ordner gebaut war.

       Hier und nicht in `fromJSON`: dort bringt das Gerät sein
       Dateisystem mit, und ein weggeworfener Ordner muss
       weggeworfen bleiben (siehe den Kopf von dateien.js). Ein
       Szenario dagegen wird hier GEBAUT — das ist dieselbe Stelle
       im Ablauf wie `addNode`. */
    if (window.Netz && window.Netz.KIND[kind].dateien && window.Dateien) {
      window.Dateien.grundbestand(d);
    }
    /* Dateien eines Szenarios: hier steht, was schon auf dem
       Gerät liegt. Ein Szenario, das einen Webserver anbietet,
       muss auch seine Seite mitbringen — die Installation legt
       sie sonst erst beim Aufspielen an, und aufgespielt ist sie
       in einem fertigen Netz ja schon. Sie kommen zu den Bildern
       DAZU und ersetzen sie nicht. */
    if (cfg.dateien) {
      d.dateien = Object.assign(d.dateien || {}, JSON.parse(JSON.stringify(cfg.dateien)));
    }
    // Installierte Programme — ein DNS-Server muss aufgespielt
    // sein, sonst nützt die schönste Eintragsliste nichts.
    if (cfg.software) d.software = cfg.software.slice();
    return d;
  }

  let cabN = 0;
  const cab = (an, ai, bn, bi, opt) => Object.assign({
    id: 'c' + (++cabN), a: { node: an, nic: ai }, b: { node: bn, nic: bi },
    delay: 100000, loss: 0, up: true   // 100 ms, siehe KABEL_MS in netz.js
  }, opt || {});

  /* ═══ 1 · Zwei Endgeräte ═══════════════════════════════════════
     Das kleinste Netz, das es gibt. Bewusst OHNE Adressen: die
     erste Erfahrung soll sein, dass ein Kabel allein nichts
     nützt. */
  macN = 0; cabN = 0;
  const zwei = {
    titel: '1 · Zwei Endgeräte',
    aufgabe:
      '<p>Zwei Endgeräte hängen an einem Switch. Die Kabel stecken — aber ein Ping kommt nicht an.</p>'
      + '<p><strong>Dein Auftrag:</strong> Gib <strong>E1</strong> und <strong>E2</strong> je eine IP-Adresse im selben Netz '
      + '(zum Beispiel <code>192.168.1.10</code> und <code>192.168.1.11</code>, Netzmaske '
      + '<code>255.255.255.0</code>). Schalte dann oben auf <em>Aktion</em>, tippe <strong>E1</strong> an und tippe im Terminal '
      + '<code>ping 192.168.1.11</code>.</p>'
      + '<p class="dim">Schau dabei in den Mitschnitt: Vor der ersten Ping-Anfrage steht immer '
      + 'noch etwas anderes. Was fragt das Endgerät da?</p>',
    netz: {
      v: 1,
      nodes: [
        dev('n1', 'host',   'Endgerät 1', 300, 420),
        dev('n2', 'host',   'Endgerät 2', 900, 420),
        dev('n3', 'switch', 'Switch 1',  600, 620)
      ],
      cables: [cab('n1', 0, 'n3', 0), cab('n2', 0, 'n3', 1)]
    }
  };

  /* ═══ 2 · Der Switch lernt ═══════════════════════════════════
     Alles fertig konfiguriert. Hier geht es nicht ums Einrichten,
     sondern ums Zusehen: der erste Rahmen geht an alle, der
     zweite nur noch dorthin, wo er hingehört. */
  macN = 100; cabN = 100;
  const lernen = {
    titel: '2 · Der Switch lernt',
    aufgabe:
      '<p>Vier Endgeräte an einem Switch, alles ist eingerichtet.</p>'
      + '<p><strong>Dein Auftrag:</strong> Stell das Tempo auf <em>Zeitlupe</em> (Regler ganz links) und schick von '
      + '<strong>E1</strong> einen <code>ping 192.168.1.13</code>. Sieh dir an, wohin die ersten Pakete '
      + 'laufen — und wohin die späteren.</p>'
      + '<p><strong>Frage:</strong> Warum bekommen am Anfang alle Endgeräte etwas ab, später aber '
      + 'nur noch <strong>E4</strong>? Tippe <strong>SW1</strong> an, während es läuft — sein Gedächtnis '
      + 'füllt sich vor deinen Augen.</p>',
    netz: {
      v: 1,
      nodes: [
        dev('m1', 'host',   'Endgerät 1', 230, 350, { nics: [{ ip: '192.168.1.10' }] }),
        dev('m2', 'host',   'Endgerät 2', 230, 610, { nics: [{ ip: '192.168.1.11' }] }),
        dev('m3', 'host',   'Endgerät 3', 970, 350, { nics: [{ ip: '192.168.1.12' }] }),
        dev('m4', 'host',   'Endgerät 4', 970, 610, { nics: [{ ip: '192.168.1.13' }] }),
        dev('m5', 'switch', 'Switch 1',  600, 480)
      ],
      cables: [
        cab('m1', 0, 'm5', 0), cab('m2', 0, 'm5', 1),
        cab('m3', 0, 'm5', 2), cab('m4', 0, 'm5', 3)
      ]
    }
  };

  /* ═══ 3 · Zwei Netze, ein Router ═════════════════════════════
     Der entscheidende Schritt. Die Endgeräte haben Adressen, die
     Gateways fehlen — damit ist der Fehler genau der, den jede
     Klasse an dieser Stelle macht. */
  macN = 200; cabN = 200;
  const router = {
    titel: '3 · Zwei Netze, ein Router',
    aufgabe:
      /* Keine Präfixschreibweise („/24") — sie kommt in Filius
         nirgends vor, und seit es den Knopf „Subnetze" gibt,
         stünde sie hier gegen das, was die Liste am Rand zeigt:
         Netz und Maske als zwei Angaben. */
      '<p>Links das Netz <code>192.168.1.__</code>, rechts <code>192.168.2.__</code>, '
      + 'beide mit der Netzmaske <code>255.255.255.0</code>. '
      + 'Dazwischen ein Router, der in beiden Netzen eine Adresse hat.</p>'
      + '<p><strong>Dein Auftrag:</strong> Innerhalb einer Seite klappt der Ping schon. Von links '
      + 'nach rechts nicht. Finde heraus, was den Endgeräten fehlt, und trag es ein.</p>'
      + '<p class="dim">Tipp: Der Router hat die Adressen <code>192.168.1.1</code> und '
      + '<code>192.168.2.1</code>. Ein Endgerät muss wissen, wohin es alles schickt, was nicht '
      + 'in sein eigenes Netz gehört.</p>',
    netz: {
      v: 1,
      nodes: [
        dev('r1', 'host',   'Endgerät 1', 175, 340, { nics: [{ ip: '192.168.1.10' }] }),
        dev('r2', 'host',   'Endgerät 2', 175, 590, { nics: [{ ip: '192.168.1.11' }] }),
        dev('r3', 'switch', 'Switch 1',  395, 465),
        dev('r4', 'router', 'Router 1',  600, 465, {
          nics: [{ ip: '192.168.1.1' }, { ip: '192.168.2.1' }]
        }),
        dev('r5', 'switch', 'Switch 2',  805, 465),
        dev('r6', 'host',   'Endgerät 3', 1025, 340, { nics: [{ ip: '192.168.2.10' }] }),
        dev('r7', 'server', 'Server 1',  1025, 590, { nics: [{ ip: '192.168.2.20' }] })
      ],
      cables: [
        cab('r1', 0, 'r3', 0), cab('r2', 0, 'r3', 1), cab('r3', 2, 'r4', 0),
        cab('r4', 1, 'r5', 0), cab('r5', 1, 'r6', 0), cab('r5', 2, 'r7', 0)
      ]
    }
  };

  /* ═══ 4 · Fehlersuche ════════════════════════════════════════
     Alles sieht richtig aus, drei Dinge sind es nicht. Der Typ
     Aufgabe, für den es einen Simulator überhaupt gibt — und der
     in MPSkills am Beamer am meisten hergibt, weil die Klasse
     gemeinsam suchen kann. */
  macN = 300; cabN = 300;
  const fehler = {
    titel: '4 · Fehlersuche',
    aufgabe:
      '<p>Dieses Netz ist fast richtig eingerichtet. <strong>Drei Fehler</strong> sind drin.</p>'
      + '<p><strong>Dein Auftrag:</strong> Finde sie und bring es zum Laufen. Am Ende muss jedes '
      + 'Gerät jedes andere erreichen — prüfe es mit <code>ping</code>.</p>'
      /* ⚠️ Hier stand „Zwei Fehler tragen ein Warnzeichen". Seit
         die doppelt vergebene Adresse keines mehr trägt (sie ist
         mit Heimroutern und privaten Adressen kein Fehler an
         sich), ist es nur noch eines — und ein Auftrag, der auf
         ein Zeichen zeigt, das es nicht gibt, schickt eine Klasse
         auf die Suche nach der Oberfläche statt nach dem Fehler. */
      + '<p class="dim">Ein Fehler trägt ein Warnzeichen. Die beiden anderen nicht: dort ist '
      + 'alles gültig eingetragen und trotzdem falsch. Die findest du nur im Mitschnitt — '
      + 'sieh genau hin, wer auf eine Frage antwortet und wie oft.</p>',
    netz: {
      v: 1,
      nodes: [
        /* Fehler 1: dieselbe Adresse zweimal. Sie trägt KEIN
           Warnzeichen mehr — zu finden ist sie im Mitschnitt, wo
           auf eine ARP-Frage zwei Antworten kommen. Das ist der
           ehrlichere Weg: eine doppelte Adresse ist nicht an sich
           falsch (in zwei Häusern hinter zwei Heimroutern ist sie
           die Regel), falsch ist sie erst in EINEM Netz. Genau
           diesen Unterschied kann ein Zeichen an der Kachel nicht
           ausdrücken und der Mitschnitt schon. */
        dev('f1', 'host',   'Endgerät 1', 175, 340, { nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1' }),
        dev('f2', 'host',   'Endgerät 2', 175, 590, { nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1' }),
        dev('f3', 'switch', 'Switch 1',  395, 465),
        /* Fehler 2: /28 statt /24 auf der rechten Karte. Die Maske
           ist gültig, .1 ist darin eine erlaubte Adresse — es gibt
           also nichts anzumeckern. Nur reicht 192.168.2.0/28 bis
           .15, und der Server steht auf .20. Der Router meldet
           „kenne keinen Weg", und das steht im Mitschnitt. Genau
           der Fehlertyp, für den man einen Simulator baut. */
        dev('f4', 'router', 'Router 1',  600, 465, {
          nics: [{ ip: '192.168.1.1' }, { ip: '192.168.2.1', mask: '255.255.255.240' }]
        }),
        dev('f5', 'switch', 'Switch 2',  805, 465),
        // Fehler 3: Gateway zeigt ins falsche Netz — trägt ein Warnzeichen
        dev('f6', 'host',   'Endgerät 3', 1025, 340, { nics: [{ ip: '192.168.2.10' }], gateway: '192.168.1.1' }),
        dev('f7', 'server', 'Server 1',  1025, 590, { nics: [{ ip: '192.168.2.20' }], gateway: '192.168.2.1' })
      ],
      cables: [
        cab('f1', 0, 'f3', 0), cab('f2', 0, 'f3', 1), cab('f3', 2, 'f4', 0),
        cab('f4', 1, 'f5', 0), cab('f5', 1, 'f6', 0), cab('f5', 2, 'f7', 0)
      ]
    }
  };

  /* ═══ 5 · Adressen automatisch ═══════════════════════════════
     Ein Server verteilt Adressen, drei Endgeräte holen sie sich. Das
     erste Szenario, in dem NICHTS einzutragen ist — und genau
     deshalb das erste, in dem ein Kind den Nutzen eines Protokolls
     spürt statt ihn erklärt zu bekommen.

     ⚠️ Der DHCP-Server sitzt auf einem ENDGERÄT, nicht auf dem
     Router. Das ist aus Filius übernommen: dort hat der
     Vermittlungsrechner gar keine DHCP-Einstellungen, Rechner und
     Notebook dagegen beide. Die Aussage dahinter ist die, um die
     es geht — DHCP ist ein Dienst, den ein Gerät anbietet, und
     keine Eigenschaft des Vermittelns.

     Der Server hat bewusst eine FESTE Adresse (.20, außerhalb des
     Bereichs .100–.150). Das ist die Regel hinter DHCP, die man
     nur an einem Gegenbeispiel lernt: was von außen gefunden
     werden muss, darf sich nicht jeden Tag ändern. */
  macN = 400; cabN = 400;
  const automatisch = {
    titel: '5 · Adressen automatisch (DHCP)',
    aufgabe:
      '<p>Drei Endgeräte ohne Adresse. Auf <strong>S1</strong> läuft ein DHCP-Server, der welche '
      + 'verteilt; bei E1 bis E3 steht <em>DHCP zur Konfiguration verwenden</em>.</p>'
      + '<p><strong>Dein Auftrag:</strong> Schalte oben auf <em>Aktion</em> und sieh zu, '
      + 'wie die Adressen erscheinen. Öffne den <em>Mitschnitt</em> und lies die vier Zeilen, '
      + 'mit denen ein Endgerät zu seiner Adresse kommt.</p>'
      + '<p><strong>Fragen:</strong> Warum ist die erste Nachricht an <em>alle</em> gerichtet? '
      + 'Und warum hat S1 die <code>192.168.1.20</code> von Hand bekommen, die Endgeräte aber nicht?</p>'
      + '<p class="dim">Den Bereich siehst du bei S1 unter <em>Einstellungen → '
      + 'DHCP-Server einrichten</em>. Im Terminal eines Endgeräts: <code>dhcp neu</code> — '
      + 'dann geht es noch einmal von vorn.</p>',
    netz: {
      v: 2,
      nodes: [
        dev('a1', 'host',   'Endgerät 1', 200, 330, { nics: [{ dhcp: true }] }),
        dev('a2', 'host',   'Endgerät 2', 200, 500, { nics: [{ dhcp: true }] }),
        dev('a3', 'host',   'Endgerät 3', 200, 665, { nics: [{ dhcp: true }] }),
        dev('a4', 'switch', 'Switch 1',  520, 500),
        dev('a5', 'router', 'Router 1',  800, 660, {
          nics: [{ ip: '192.168.1.1' }, { ip: '10.0.0.2' }]
        }),
        dev('a6', 'server', 'Server',    830, 330, {
          nics: [{ ip: '192.168.1.20' }], gateway: '192.168.1.1',
          dhcpServer: {
            nic: 0, von: '192.168.1.100', bis: '192.168.1.150',
            mask: '255.255.255.0', gateway: '192.168.1.1', dns: ''
          }
        })
      ],
      cables: [
        cab('a1', 0, 'a4', 0), cab('a2', 0, 'a4', 1), cab('a3', 0, 'a4', 2),
        cab('a4', 3, 'a5', 0), cab('a4', 4, 'a6', 0)
      ]
    }
  };

  /* ═══ 6 · Namen statt Zahlen ═════════════════════════════════
     DNS mit genau einem Eintrag. Der zweite fehlt, und das ist die
     Aufgabe: einen Namen selbst eintragen. Wer das einmal getan
     hat, weiß für immer, dass hinter jedem Namen im Internet
     jemand sitzt, der ihn eingetragen hat. */
  macN = 500; cabN = 500;
  const namen = {
    titel: '6 · Namen statt Zahlen (DNS)',
    aufgabe:
      '<p>Auf <strong>S2</strong> rechts unten ist das Programm <em>DNS-Server</em> installiert und '
      + 'gestartet. Es übersetzt Namen in Adressen; ein Name ist schon eingetragen.</p>'
      + '<p><strong>Auftrag 1:</strong> Schalte auf <em>Aktion</em>, öffne bei <strong>E1</strong> das '
      + 'Terminal und tippe <code>ping www.schule.de</code>. Lies im Mitschnitt, was <em>vor</em> '
      + 'dem ersten Ping passiert.</p>'
      + '<p><strong>Auftrag 2:</strong> Tippe den DNS-Server an, öffne <em>DNS-Server</em> und '
      + 'trag einen zweiten Namen ein — <code>drucker.schule</code> für '
      + '<code>192.168.2.30</code>. Dann ping ihn von E1 an.</p>'
      + '<p class="dim">Mit <code>nslookup name</code> fragst du nur den Namen ab, ohne zu pingen. '
      + 'Nützlich, wenn du wissen willst, welcher der beiden Schritte schiefgeht.</p>',
    netz: {
      v: 2,
      nodes: [
        dev('d1', 'host',   'Endgerät 1', 180, 330, {
          nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1', dns: '192.168.2.20'
        }),
        dev('d2', 'host',   'Endgerät 2', 180, 560, {
          nics: [{ ip: '192.168.1.11' }], gateway: '192.168.1.1', dns: '192.168.2.20'
        }),
        dev('d3', 'switch', 'Switch 1',  400, 445),
        dev('d4', 'router', 'Router 1',  605, 445, {
          nics: [{ ip: '192.168.1.1' }, { ip: '192.168.2.1' }]
        }),
        dev('d5', 'switch', 'Switch 2',  810, 445),
        dev('d6', 'server', 'Webserver', 1030, 330, {
          nics: [{ ip: '192.168.2.30' }], gateway: '192.168.2.1'
        }),
        dev('d7', 'server', 'DNS-Server', 1030, 600, {
          nics: [{ ip: '192.168.2.20' }], gateway: '192.168.2.1',
          software: ['dns'],
          dnsServer: { records: [{ name: 'www.schule.de', ip: '192.168.2.30' }] }
        })
      ],
      cables: [
        cab('d1', 0, 'd3', 0), cab('d2', 0, 'd3', 1), cab('d3', 2, 'd4', 0),
        cab('d4', 1, 'd5', 0), cab('d5', 1, 'd6', 0), cab('d5', 2, 'd7', 0)
      ]
    }
  };

  /* ═══ 7 · Eine Seite im Schulnetz ════════════════════════════
     Der erste Auftrag, bei dem ein Kind etwas herstellt, das es
     danach ANSEHEN kann. Alles andere in diesem Simulator ist
     Diagnose; das hier ist Bauen.

     Aufgebaut ist er so, dass jeder Schritt genau eine Sache
     hinzufügt: erst die Adresse (geht der Server überhaupt?),
     dann der Name (wozu DNS?), dann der Inhalt (es ist eine
     Datei auf einem Rechner). Der Webserver ist deshalb schon
     installiert und gestartet, der Browser auch — das Aufspielen
     hat Szenario 6 schon gezeigt, und zwei Lernsachen in einem
     Auftrag sind eine zu viel. */
  macN = 600; cabN = 600;
  const web = {
    titel: '7 · Eine Seite im Schulnetz',
    aufgabe:
      '<p>Auf <strong>S1</strong> läuft ein <em>Webserver</em>, auf <strong>E1</strong> liegt '
      + 'ein <em>Webbrowser</em> bereit. Der DNS-Server kennt den Namen noch nicht.</p>'
      + '<p><strong>Auftrag 1:</strong> Schalte auf <em>Aktion</em>, öffne bei <strong>E1</strong> '
      + 'den Webbrowser und ruf den Server über seine <em>Adresse</em> auf: '
      + '<code>192.168.2.30</code>. Zähl unter der Seite, wie viele Anfragen für '
      + '<em>eine</em> Seite nötig waren — und schau im Mitschnitt nach, wie sie heißen.</p>'
      + '<p><strong>Auftrag 2:</strong> Trag beim <strong>DNS-Server</strong> den Namen '
      + '<code>www.schule.de</code> ein und ruf die Seite darüber auf.</p>'
      + '<p><strong>Auftrag 3:</strong> Öffne auf <strong>S1</strong> den <em>Datei-Explorer</em>, '
      + 'bearbeite <code>/webserver/index.html</code> und schreib deine eigene Überschrift '
      + 'hinein. Lade die Seite im Browser noch einmal.</p>'
      + '<p class="dim">Der Browser führt kein JavaScript aus — HTML und CSS schon. '
      + 'Im Editor siehst du das: Skripte stehen durchgestrichen da.</p>',
    netz: {
      v: 2,
      nodes: [
        dev('w1', 'host',   'Endgerät 1', 180, 330, {
          nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1', dns: '192.168.2.20',
          software: ['browser']
        }),
        dev('w2', 'host',   'Endgerät 2', 180, 560, {
          nics: [{ ip: '192.168.1.11' }], gateway: '192.168.1.1', dns: '192.168.2.20',
          software: ['browser']
        }),
        dev('w3', 'switch', 'Switch 1',  400, 445),
        dev('w4', 'router', 'Router 1',  605, 445, {
          nics: [{ ip: '192.168.1.1' }, { ip: '192.168.2.1' }]
        }),
        dev('w5', 'switch', 'Switch 2',  810, 445),
        dev('w6', 'server', 'Webserver', 1030, 330, {
          nics: [{ ip: '192.168.2.30' }], gateway: '192.168.2.1',
          software: ['webserver'], webServer: { on: true },
          dateien: {
            '/webserver': { ordner: true },
            '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
            '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
            '/webserver/logo.png':   { bild: '@schule' }
          }
        }),
        dev('w7', 'server', 'DNS-Server', 1030, 600, {
          nics: [{ ip: '192.168.2.20' }], gateway: '192.168.2.1',
          software: ['dns'],
          // Leer: den Namen trägt das Kind selbst ein (Auftrag 2).
          dnsServer: { records: [] }
        })
      ],
      cables: [
        cab('w1', 0, 'w3', 0), cab('w2', 0, 'w3', 1), cab('w3', 2, 'w4', 0),
        cab('w4', 1, 'w5', 0), cab('w5', 1, 'w6', 0), cab('w5', 2, 'w7', 0)
      ]
    }
  };

  window.SZENARIEN = { zwei, lernen, router, fehler, automatisch, namen, web };
})();
