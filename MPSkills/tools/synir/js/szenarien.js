/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — szenarien.js   ·   Vorbereitete Netze
   ══════════════════════════════════════════════════════════════
   Achtzehn Ausgangslagen in drei Spuren: Sek I (Klasse 8, I.1 bis
   I.7), Sek II (Klasse 12, II.1 bis II.8) und „Andere“ (schlicht
   1., 2., … durchgezählt — Themen, die in keine der beiden
   Klassenstufen-Reihen gehören). Jede ist ein Netz
   plus ein Auftrag — und
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
      // Eine Karte, die ein Funknetz sucht (Handy): nur setzen, wenn gewollt.
      if (c.funk) { nics[i].funk = true; nics[i].ssid = c.ssid || ''; }
    }
    const d = {
      id, kind, name, x, y,
      gateway: cfg.gateway || '', dns: cfg.dns || '', on: true, routes: cfg.routes || [],
      nics
    };
    // Dienste nur, wenn das Szenario sie braucht — sonst stünde in
    // jedem gespeicherten Netz bei jedem Gerät ein leerer Dienst.
    if (cfg.wlan) d.wlan = Object.assign({ on: true, ssid: '' }, cfg.wlan);
    if (cfg.rip)  d.rip  = { on: true };   // Sek I: die Router lernen die Wege selbst
    if (cfg.dhcpServer) d.dhcpServer = Object.assign({ on: true, nic: 0, lease: 600 }, cfg.dhcpServer);
    if (cfg.dnsServer)  d.dnsServer  = Object.assign({ on: true, records: [] }, cfg.dnsServer);
    if (cfg.mailServer) d.mailServer = Object.assign({ on: true, domain: '', konten: [] }, cfg.mailServer);
    if (cfg.webServer)  d.webServer  = Object.assign({ on: true }, cfg.webServer);
    if (cfg.streamServer) d.streamServer = Object.assign({ on: true }, JSON.parse(JSON.stringify(cfg.streamServer)));
    if (cfg.mailKonto)  d.mailKonto  = JSON.parse(JSON.stringify(cfg.mailKonto));
    if (cfg.nat)        d.nat        = JSON.parse(JSON.stringify(cfg.nat));
    // Sicherheit (Firewall, ZS, Zertifikat, Vertrauen, VPN): reine Daten, unverändert übernommen.
    for (const f of ['firewall', 'zsServer', 'zertifikat', 'vertrauen', 'vpnServer', 'vpnClient']) {
      if (cfg[f]) d[f] = JSON.parse(JSON.stringify(cfg[f]));
    }
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

  /* ─── Der Aufbau eines Auftrags ────────────────────────────────
     Jeder Auftrag hat dieselben Bausteine, damit man sich in jedem
     Szenario auf Anhieb zurechtfindet:

       kontext    2–3 Sätze: was ist das für ein Netz, warum gibt es das
       aufgaben   [{ typ, text, eigen?, label? }]  Die Aufgaben heißen
                  „Aufgabe 1.", „Aufgabe 2." … — nicht „Benutzen",
                  „Verändern", „Erweitern" (vom Nutzer so verlangt: die
                  Schüler sollen Aufgaben abarbeiten, keine Fachwörter
                  der Didaktik lesen). `typ` bleibt im Modell: er
                  bestimmt nur die Farbe des Randes (aufg-b/v/e).
                  Nur mit `eigen: true` gilt `label` (II.7: Muss/Kann).
       hilfe      [{ begriff, text }]  eingeklappt. Erklärt das NEUE
                  Element, keine Klickfolge: es soll nicht am Wort
                  scheitern, aber die Aufgabe bleibt die des Kindes.
       stern      eine offene Frage für die Schnellen (optional)

     Das Ergebnis ist ein HTML-Text — dieselbe Form wie zuvor, damit
     Speichern, Teilen im Raum und der Aufgaben-Editor unverändert
     weiterarbeiten. Alle Klassen kennt der Türsteher (aufgabe.js). */
  const AUFG = {
    benutzen:   { k: 'aufg-b', label: 'Benutzen.' },
    veraendern: { k: 'aufg-v', label: 'Verändern.' },
    erweitern:  { k: 'aufg-e', label: 'Erweitern.' },
    bauen:      { k: 'aufg-e', label: 'Bauen.' }
  };
  function auftrag(o) {
    let h = '<p class="kontext">' + o.kontext + '</p>';
    let nr = 0;
    for (const a of o.aufgaben) {
      const t = AUFG[a.typ];
      const name = a.eigen && a.label ? a.label : 'Aufgabe ' + (++nr) + '.';
      h += '<p class="' + t.k + '"><strong>' + name + '</strong> ' + a.text + '</p>';
    }
    if (o.hilfe && o.hilfe.length) {
      h += '<details><summary>Hilfe: ' + o.hilfe.map(x => x.begriff).join(' · ') + '</summary>'
        + o.hilfe.map(x => '<p><strong>' + x.begriff + '.</strong> ' + x.text + '</p>'
            + (x.liste ? '<ul>' + x.liste.map(z => '<li>' + z + '</li>').join('') + '</ul>' : '')).join('')
        + '</details>';
    }
    if (o.stern) h += '<p class="stern">★ <strong>Für Schnelle:</strong> ' + o.stern + '</p>';
    return h;
  }

  const SEK1 = 'Sek I · Klasse 8';
  const SEK2 = 'Sek II · Klasse 12';
  const ANDERE = 'Andere';

  let cabN = 0;
  const cab = (an, ai, bn, bi, opt) => Object.assign({
    id: 'c' + (++cabN), a: { node: an, nic: ai }, b: { node: bn, nic: bi },
    delay: 100000, loss: 0, up: true   // 100 ms, siehe KABEL_MS in netz.js
  }, opt || {});

  /* ═══════════════════════════════════════════════════════════════
     SEK I · KLASSE 8 — ein Netz wächst
     Kein Routing von Hand, keine unterschiedlichen Masken (immer
     255.255.255.0). Wo mehrere Router im Spiel sind (I.4 ff.), ist
     das automatische Routing eingeschaltet: die Router lernen die
     Wege selbst, und ein Kind sieht davon nichts.
     ═══════════════════════════════════════════════════════════════ */

  /* ═══ I.1 · Zwei Geräte ═════════════════════════════════════════
     Nichts ist verbunden. Kein Kabel, kein Switch: das Kind holt den
     Switch selbst aufs Feld und steckt beide Geräte daran — so, wie
     jedes Netz im Raum gebaut ist. Weil ein Endgerät nur EINE Buchse
     hat, ist der Switch keine Erklärung mehr, sondern die Lösung.
     Danach kommt das neue Gerät und der Ping in Zeitlupe: an ihm
     sieht man, wie der Switch lernt. Über die Netzmaske wird hier
     nicht geredet — sie ist in Klasse 8 kein Unterrichtsgegenstand;
     „selbes Netz" heißt hier: die ersten drei Zahlen sind gleich. */
  macN = 800; cabN = 800;
  const i1 = {
    titel: 'I.1 · Zwei Geräte', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Im Computerraum stehen zwei Rechner, aber sie sind nicht verbunden. '
        + 'Du baust das kleinste Netzwerk der Welt — und lernst dabei, was ein Switch kann.',
      aufgaben: [
        { typ: 'bauen', text: 'Hol einen <strong>Switch</strong> aufs Feld und verbinde <strong>E1</strong> und <strong>E2</strong> '
          + 'über den Switch: je ein Kabel von jedem Endgerät zum Switch. Gib beiden eine IP-Adresse aus demselben Netz, '
          + 'zum Beispiel <code>192.168.1.10</code> und <code>192.168.1.11</code> (die Netzmaske ist schon eingetragen, '
          + 'lass sie so). Prüfe mit einem Ping, ob sie sich erreichen.' },
        { typ: 'erweitern', text: 'Jetzt sollen <strong>fünf</strong> Geräte miteinander reden. Baue E3 bis E5 dazu und stecke sie an den Switch. '
          + '<strong>Jedes Gerät braucht eine eigene Adresse</strong> — passe die IP-Adressen an, zum Beispiel '
          + '<code>192.168.1.12</code>, <code>192.168.1.13</code> und <code>192.168.1.14</code>. Zwei Geräte mit derselben Adresse '
          + 'stören sich. Prüfe mit Pings, dass jedes Gerät jedes andere erreicht.' },
        { typ: 'benutzen', text: 'Schau dem Switch beim <strong>Lernen</strong> zu: Baue ein <strong>neues Gerät</strong> (E6) an den Switch, '
          + 'gib ihm eine freie Adresse, schalte auf <em>Aktion</em> und drehe unten das <strong>Tempo</strong> auf <em>Zeitlupe</em>. '
          + 'Schick von E6 einen Ping an E1 und sieh dir an, wohin die Nachricht läuft. Beim ersten Mal weiß E6 noch nicht, an welcher '
          + 'MAC-Adresse E1 zu finden ist, und ruft deshalb in den Raum: „Wer hat diese Adresse?“ Wohin schickt der Switch diesen '
          + 'Rundruf — und was merkt er sich dabei über E6? Schick den Ping gleich noch einmal: Was ist jetzt anders?' }
      ],
      hilfe: [
        { begriff: 'IP-Adresse', text: 'Die „Hausnummer“ eines Geräts im Netz: vier Zahlen von 0 bis 255, durch Punkte '
          + 'getrennt. Zwei Geräte im selben Netz dürfen nie dieselbe haben.' },
        { begriff: 'Selbes Netz?', text: 'Bei der Netzmaske <code>255.255.255.0</code> (so ist sie hier eingetragen) gilt: Geräte können sich direkt erreichen, wenn die <strong>ersten drei Zahlen</strong> ihrer Adresse gleich sind: '
          + '<code>192.168.1.10</code> und <code>192.168.1.11</code> gehören zusammen, <code>192.168.2.11</code> nicht. Nur die letzte '
          + 'Zahl ist bei jedem Gerät anders.' },
        { begriff: 'Ping', text: 'Ein „Bist du da?“ an eine Adresse. Kommt die Antwort zurück, funktioniert die Verbindung. '
          + 'Im Modus <em>Aktion</em> tippst du das Gerät an und schreibst im Terminal <code>ping</code> und die Adresse.' },
        { begriff: 'Switch', text: 'Ein Verteiler mit vielen Buchsen. Alle Geräte stecken am Switch, und er leitet '
          + 'jede Nachricht an das Gerät weiter, für das sie gedacht ist. Ein Endgerät selbst hat nur eine Buchse. '
          + 'Ein Switch <em>lernt</em>: Bei jeder Nachricht merkt er sich, an welcher Buchse der Absender hängt. Kennt er das Ziel noch nicht, '
          + 'schickt er die Nachricht an alle — danach nur noch dorthin, wo das Ziel steckt. Einen <em>Rundruf</em> („Wer hat …?“) '
          + 'bekommen immer alle.' },
        { begriff: 'Tempo', text: 'Der Regler unten in der Mitte stellt ein, wie schnell die Nachrichten über die Kabel laufen. '
          + 'Auf <em>Zeitlupe</em> siehst du jede Nachricht einzeln wandern.' },
        { begriff: 'Was der Switch gelernt hat', text: 'Wer es genau sehen will: <em>Ansicht &amp; Tools → Geräte-Lerninformationen</em> einschalten und den Switch '
          + 'antippen. Dort steht, welches Gerät an welcher Buchse hängt.' }
      ],
      stern: 'Schick einen Ping an eine Adresse, die es im Netz nicht gibt. Was passiert — und woher weiß dein Gerät, '
        + 'dass niemand antwortet?'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('p1', 'host', 'Endgerät 1', 500, 460),
        dev('p2', 'host', 'Endgerät 2', 900, 460)
      ],
      cables: []
    }
  };

  /* ═══ I.2 · Zwei Netze, ein Router ══════════════════════════════
     Zwei Netze, die für sich funktionieren. Der Router fehlt — und
     mit ihm das Gateway. Wer beides einträgt, hat den Sprung vom
     Raum zum Netz der Netze gemacht. */
  macN = 900; cabN = 900;
  const i2 = {
    titel: 'I.2 · Zwei Netze, ein Router', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Die Klassen 8b und 8c haben je ein eigenes Netz. Jedes funktioniert für sich, '
        + 'aber die beiden wissen nichts voneinander.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schick Pings von <strong>E1</strong> zu E2 und von <strong>E3</strong> zu E4. '
          + 'Dann von E1 zu E3. Was klappt, was nicht?' },
        { typ: 'veraendern', text: 'Baue einen <strong>Router</strong> zwischen die beiden Switches. Gib ihm in jedem Netz '
          + 'eine Adresse (<code>192.168.1.1</code> und <code>192.168.2.1</code>). Der Ping von E1 zu E3 klappt noch '
          + 'nicht. Finde heraus, was den Endgeräten noch fehlt, und trag es ein.' },
        { typ: 'erweitern', text: 'Baue ein <strong>drittes Netz</strong> für den Serverraum (<code>192.168.3.x</code>) an '
          + 'denselben Router: ein Switch und ein Server. Der Server soll von allen Endgeräten erreichbar sein.' }
      ],
      hilfe: [
        { begriff: 'Router', text: 'Verbindet Netze miteinander. Er hat in jedem Netz, an dem er hängt, eine eigene Adresse.' },
        { begriff: 'Gateway', text: 'Ein Endgerät kennt nur sein eigenes Netz. Alles, was woanders hin soll, schickt es an das '
          + '<em>Gateway</em> — das ist die Adresse des Routers in seinem eigenen Netz.' },
        { begriff: 'Selbes Netz?', text: 'Bei der Netzmaske <code>255.255.255.0</code> gehören Adressen zusammen, wenn die ersten drei Zahlen gleich sind: '
          + '<code>192.168.1.10</code> und <code>192.168.1.11</code> ja, <code>192.168.1.10</code> und <code>192.168.2.10</code> nein.' }
      ],
      stern: 'Lösche bei E1 das Gateway wieder. Was geht dann noch, was nicht mehr? Sag es vorher voraus.'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('q1', 'host',   'Endgerät 1', 175, 450, { nics: [{ ip: '192.168.1.10' }] }),
        dev('q2', 'host',   'Endgerät 2', 175, 680, { nics: [{ ip: '192.168.1.11' }] }),
        dev('q3', 'switch', 'Switch 1',  420, 565),
        dev('q4', 'switch', 'Switch 2',  790, 565),
        dev('q5', 'host',   'Endgerät 3', 1030, 450, { nics: [{ ip: '192.168.2.10' }] }),
        dev('q6', 'host',   'Endgerät 4', 1030, 680, { nics: [{ ip: '192.168.2.11' }] })
      ],
      cables: [
        cab('q1', 0, 'q3', 0), cab('q2', 0, 'q3', 1),
        cab('q4', 0, 'q5', 0), cab('q4', 1, 'q6', 0)
      ]
    }
  };

  /* ═══ I.3 · DHCP und WLAN ═══════════════════════════════════════
     Ein Raum mit zehn Geräten: von Hand wäre das ein Nachmittag.
     Der Server steht schon da und teilt Adressen aus; das Kind
     stellt um. Danach kommt das WLAN — und mit ihm die Handys, die
     keine Buchse haben und ohne DHCP gar nicht ins Netz fänden. */
  macN = 1000; cabN = 1000;
  const i3nodes = [], i3cables = [];
  for (let k = 0; k < 10; k++) {
    const links = k < 5;
    // Versetzt in zwei Spalten, damit fünf Geräte übereinander nicht
    // aufeinander sitzen und die Marke „keine IP" lesbar bleibt.
    const y = 440 + (k % 5) * 75, versatz = (k % 2) * 150;
    i3nodes.push(dev('s' + (k + 1), 'host', 'Endgerät ' + (k + 1), links ? 170 + versatz : 1100 - versatz, y));
    i3cables.push(cab('s' + (k + 1), 0, 's0', k));
  }
  const i3 = {
    titel: 'I.3 · DHCP und WLAN', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Im Computerraum stehen zehn Endgeräte am Switch, noch ohne Adresse. Jedem von Hand eine zu geben '
        + 'wäre mühsam — auf dem <strong>Server</strong> läuft deshalb ein DHCP-Server, der Adressen verteilt.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schau dir den DHCP-Server am Server an: Welcher Adressbereich ist eingestellt? '
          + 'Stell dann <strong>E1</strong> auf <em>DHCP zur Konfiguration verwenden</em> und schau, welche Adresse es bekommt.' },
        { typ: 'veraendern', text: 'Ändere am DHCP-Server den Bereich auf <code>192.168.1.50</code> bis <code>192.168.1.70</code> '
          + 'und lass E1 eine neue Adresse holen. Sag vorher voraus, welche es bekommt.' },
        { typ: 'erweitern', text: 'Binde <strong>alle zehn</strong> Endgeräte per DHCP ein. Ein Ping von E1 zu E10 muss klappen.' },
        { typ: 'erweitern', text: 'Lass den Switch ein <strong>WLAN</strong> ausstrahlen und bring drei '
          + '<strong>Handys</strong> ins Netz. Auch sie sollen ihre Adresse per DHCP bekommen und E1 anpingen können.' }
      ],
      hilfe: [
        { begriff: 'DHCP', text: 'Ein Dienst, der Geräten automatisch eine Adresse zuteilt — aus einem festen Bereich. '
          + 'Ein Gerät ruft beim Start „Ich brauche eine Adresse!“ ins Netz, und der Server antwortet.' },
        { begriff: 'Feste Adresse', text: 'Was andere finden müssen, wie der Server selbst, darf seine Adresse nicht '
          + 'wechseln. Deshalb liegt seine Adresse außerhalb des Bereichs, den er verteilt.' },
        { begriff: 'WLAN', text: 'Ein Switch kann zusätzlich ein Funknetz ausstrahlen. Es hat einen Namen (SSID), '
          + 'den Handys auswählen. Ein Handy hat keine Kabelbuchse — es kommt nur über WLAN ins Netz.' }
      ],
      stern: 'Der Server verteilt nur 51 Adressen (.100 bis .150). Was passiert, wenn der Raum mit 60 Handys voll ist? '
        + 'Was würdest du ändern?'
    }),
    netz: {
      v: 2,
      nodes: i3nodes.concat([
        dev('s0', 'switch', 'Switch 1', 600, 570, { ports: 12 }),
        dev('sv', 'server', 'Server', 600, 400, {
          nics: [{ ip: '192.168.1.20' }],
          dhcpServer: { nic: 0, von: '192.168.1.100', bis: '192.168.1.150', mask: '255.255.255.0', gateway: '', dns: '' }
        })
      ]),
      cables: i3cables.concat([cab('sv', 0, 's0', 10)])
    }
  };

  /* ─── Baukasten für Netze mit mehreren Routern ─────────────────
     I.4 bis I.6 (und später Sek II) haben dieselbe Bauart: eine
     Reihe von Häusern, je ein Router mit einem Switch und ein paar
     Geräten daran, dazwischen Kabel von Router zu Router. Damit die
     Adressen in jedem Szenario dieselbe Logik haben (und ein Kind
     den Plan nur einmal lernen muss), entstehen sie hier aus einer
     Vorschrift:

       Haus i        192.168.i.0    Router-Karte zum Haus: .1
       Geräte        .10, .11, …    Server .20
       Verbindung k  192.168.(100+k).0   niedrigerer Router .1, anderer .2

     Die Router stehen im Zickzack (gerade Nummern oben, ungerade
     etwas tiefer), damit die Querverbindungen zwischen Nachbarn
     nicht durch einen dritten Router laufen. */
  function vermascht(o) {
    const n = o.n, P = o.p || '';
    const nodes = [], cables = [];
    const xr = (i) => n === 1 ? 600 : n === 2 ? 320 + i * 560 : Math.round(160 + i * 880 / (n - 1));
    const grad = Array.from({ length: n }, () => 0);
    o.links.forEach(([a, b]) => { grad[a]++; grad[b]++; });
    const karte = Array.from({ length: n }, () => 1);     // nächste freie Karte je Router
    const rnics = Array.from({ length: n }, (_, i) =>
      [{ ip: o.leer ? '' : '192.168.' + (i + 1) + '.1' }]);
    o.links.forEach(([a, b], k) => {
      rnics[a].push({ ip: o.leer ? '' : '192.168.' + (101 + k) + '.1' });
      rnics[b].push({ ip: o.leer ? '' : '192.168.' + (101 + k) + '.2' });
    });
    let hn = 0;
    for (let i = 0; i < n; i++) {
      const x = xr(i), gerade = i % 2 === 0;
      const yr = gerade ? 440 : 520, ys = yr + 90, yh = yr + 180;
      const lan = (o.lan && o.lan(i)) || { hosts: [] };
      const rid = P + 'r' + (i + 1), sid = P + 's' + (i + 1);
      nodes.push(dev(rid, 'router', 'Router ' + (i + 1), x, yr, {
        ports: 1 + grad[i], nics: rnics[i], rip: o.rip !== false
      }));
      const draht = lan.hosts.filter(h => h.kind !== 'handy' && !h.ohneKabel);
      nodes.push(dev(sid, 'switch', 'Switch ' + (i + 1), x, ys, {
        ports: Math.max(5, draht.length + 1), wlan: lan.wlan ? { on: true, ssid: lan.wlan } : undefined
      }));
      cables.push(cab(rid, 0, sid, 0));
      const k = lan.hosts.length;
      let port = 1;
      lan.hosts.forEach((h, j) => {
        const id = P + 'h' + (++hn);
        const kind = h.kind || 'host';
        const name = h.name || (kind === 'handy' ? 'Handy ' : 'Endgerät ') + hn;
        const cfg = Object.assign({}, h.cfg || {});
        const gw = h.dhcp ? '' : '192.168.' + (i + 1) + '.1';
        cfg.nics = [h.dhcp ? { dhcp: true } : { ip: '192.168.' + (i + 1) + '.' + (h.ip || 10 + j) }];
        if (h.funk) cfg.nics = [{ dhcp: true, funk: true, ssid: h.funk }];
        if (!h.dhcp && !h.funk) cfg.gateway = cfg.gateway !== undefined ? cfg.gateway : gw;
        if (h.dhcpServer) cfg.dhcpServer = { nic: 0, von: '192.168.' + (i + 1) + '.100', bis: '192.168.' + (i + 1) + '.150',
          mask: '255.255.255.0', gateway: '192.168.' + (i + 1) + '.1', dns: h.dhcpServer.dns || '' };
        nodes.push(dev(id, kind, name, Math.round(x + (j - (k - 1) / 2) * (k > 4 ? 118 : k > 2 ? 130 : 105)), yh, cfg));
        if (kind !== 'handy' && !h.ohneKabel) cables.push(cab(id, 0, sid, port++));
      });
    }
    // Die Kabel zwischen den Routern, in der Reihenfolge der Adressen.
    o.links.forEach(([a, b]) => {
      cables.push(cab(P + 'r' + (a + 1), karte[a]++, P + 'r' + (b + 1), karte[b]++));
    });
    return { nodes, cables };
  }
  const nach = (netz, name) => netz.nodes.find(n => n.name === name);

  /* ═══ I.4 · Mehrere Router ══════════════════════════════════════
     Drei Häuser in einer Reihe. Alles steht schon da — nur die
     Router sind leer: keine Adressen. Das automatische Routing ist
     an: das Kind trägt nur die Adressen ein und sieht, dass die
     Router die Wege selbst finden. */
  macN = 1100; cabN = 1100;
  const i4netz = vermascht({
    p: 'm', n: 3, links: [[0, 1], [1, 2]], leer: true,
    lan: (i) => [
      { hosts: [{}, {}] },
      { hosts: [{ kind: 'server', name: 'DHCP-Server', ip: 20, dhcpServer: {} }, { dhcp: true }, { dhcp: true }] },
      { hosts: [{}, {}] }
    ][i]
  });
  const i4 = {
    titel: 'I.4 · Mehrere Router', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Die Schule hat drei Häuser, jedes mit eigenem Netz und eigenem Router. Die Router sind mit einem Kabel '
        + 'in einer Reihe verbunden — aber noch <strong>leer</strong>: sie haben keine Adressen.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schick einen Ping von <strong>E1</strong> (Haus 1) zu E2 im selben Haus, dann zu einem '
          + 'Endgerät in Haus 3. Was klappt, was nicht? Schau dir auch an, welche Adresse die Geräte in Haus 2 bekommen haben.' },
        { typ: 'veraendern', text: 'Trag die Adressen der drei Router nach dem <strong>Adressplan</strong> ein (siehe Hilfe). '
          + 'Warte ein paar Sekunden und teste den Ping von Haus 1 nach Haus 3 noch einmal. Wie viele Router liegen auf dem Weg?' },
        { typ: 'erweitern', text: 'Baue ein <strong>viertes Haus</strong> an Router 3: Router, Switch und zwei Endgeräte, '
          + 'Adressen nach demselben Plan. Jedes Gerät soll jedes andere erreichen.' }
      ],
      hilfe: [
        { begriff: 'Adressplan', text: 'Haus 1 hat das Netz <code>192.168.1.x</code>, Haus 2 <code>192.168.2.x</code>, Haus 3 '
          + '<code>192.168.3.x</code>. Die Router-Karte zum Haus hat immer die Endung <code>.1</code>. Die Kabel zwischen den '
          + 'Routern sind eigene kleine Netze: R1–R2 ist <code>192.168.101.x</code> (R1 = <code>.1</code>, R2 = <code>.2</code>), '
          + 'R2–R3 ist <code>192.168.102.x</code> (R2 = <code>.1</code>, R3 = <code>.2</code>).' },
        { begriff: 'Automatisches Routing', text: 'Ein Router kennt zuerst nur die Netze, an denen er selbst hängt. Beim automatischen '
          + 'Routing rufen sich die Router im Takt zu, welche Netze sie kennen, und lernen so den ganzen Weg. Das dauert einen '
          + 'Moment — bei Router 3 kommt Haus 1 erst nach zwei Runden an.' },
        { begriff: 'Weg', text: 'Ein Paket geht von Router zu Router, bis es im Zielnetz ankommt. Jeder Router, den es dabei '
          + 'durchläuft, ist ein „Sprung“.' }
      ],
      stern: 'Ziehe das Kabel zwischen Router 1 und Router 2 heraus. Was geht noch, was nicht mehr? Und wie könntest du das '
        + 'Netz so bauen, dass trotzdem alles weiterläuft?'
    }),
    netz: { v: 2, nodes: i4netz.nodes, cables: i4netz.cables }
  };

  /* ═══ I.5 · Fehler finden ═══════════════════════════════════════
     Vier Häuser, teilvermascht: zwischen den Routern gibt es mehr
     als einen Weg. WLAN und DHCP laufen — eigentlich. Neun Dinge
     sind falsch oder leer, und zwei davon stecken zwischen den
     Routern, wo ein zweiter Weg sie verdeckt: wer nur pingt, findet
     sie nicht — wer die Subnetze anschaut, schon. Die Schüler
     bekommen keine Zahl genannt; sie sollen ALLE finden und jede
     Korrektur aufschreiben. Keins davon steckt in einer Netzmaske:
     in Sek I gibt es nur die eine. */
  macN = 1200; cabN = 1200;
  const i5netz = vermascht({
    p: 'f', n: 4, links: [[0, 1], [1, 2], [2, 3], [0, 2], [1, 3]],
    lan: (i) => [
      { hosts: [{}, { ohneKabel: true }] },                                            // Fehler 6: Kabel fehlt
      { wlan: 'Schul-WLAN', hosts: [{ kind: 'server', name: 'DHCP-Server', ip: 20, dhcpServer: {} },
                                    { dhcp: true }, { dhcp: true },
                                    { kind: 'handy', name: 'Handy 1', funk: 'Schule-WLAN' }] },   // Fehler 4: SSID
      { hosts: [{}, {}] },
      { hosts: [{ cfg: { gateway: '192.168.1.1' } }, {}] }                             // Fehler 2: Gateway
    ][i]
  });
  nach(i5netz, 'Router 3').nics[0].ip = '';                                           // Fehler 1: leer
  nach(i5netz, 'DHCP-Server').dhcpServer.on = false;                                  // Fehler 3: Dienst aus
  nach(i5netz, 'Router 4').rip = { on: false };                                       // Fehler 5: kein Routing
  nach(i5netz, 'Endgerät 8').nics[0].ip = '192.168.2.11';                             // Fehler 7: Adresse aus dem Nachbarnetz
  nach(i5netz, 'Router 4').nics[2].ip = '192.168.150.2';                              // Fehler 8: Tippfehler am Kabel R2–R4 (105)
  i5netz.cables.find(c => c.a.node === 'fr1' && c.b.node === 'fr3').up = false;       // Fehler 9: Kabel R1–R3 gezogen
  const i5 = {
    titel: 'I.5 · Fehler finden', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Die Schule hat vier Häuser mit einem Netz aus vier Routern, Kabeln in mehr als einer Richtung, WLAN und DHCP. '
        + 'Beim Umbau ist einiges schiefgegangen. Manches ist nicht falsch, sondern einfach <strong>leer</strong> — und manches '
        + 'fällt nicht auf, weil das Netz einen zweiten Weg hat.',
      aufgaben: [
        { typ: 'benutzen', text: 'Teste, welche Geräte sich erreichen. Ping von <strong>E1</strong> zu jedem anderen Gerät, auch '
          + 'zum Handy. Schreib auf, was <em>nicht</em> klappt — das sind deine Spuren.' },
        { typ: 'veraendern', text: 'Finde <strong>alle Fehler</strong> im Netz und behebe sie. Es sind mehr als drei, und sie stecken an '
          + 'ganz verschiedenen Stellen: bei Endgeräten, bei Diensten, bei den Routern und zwischen den Routern. '
          + '<strong>Dokumentiere jede Korrektur</strong>: Wo war der Fehler, was war falsch, was hast du geändert? '
          + 'Am Ende muss <strong>jedes Gerät erreichbar</strong> sein (Ausnahme: ein Gerät, das gar nicht gebraucht wird, darf fehlen) '
          + 'und in deiner Liste darf kein Fehler fehlen, den du gefunden hast.' }
      ],
      hilfe: [
        { begriff: 'Fehlersuche', text: 'Geh von innen nach außen vor: Kommt ein Ping zu einem Gerät im <em>selben</em> Netz? '
          + 'Dann zum Router im eigenen Haus? Dann zum Nachbarhaus? Die Stelle, an der es aufhört, ist der Ort des Fehlers.' },
        { begriff: 'Adressplan', text: 'Haus <em>n</em> hat das Netz <code>192.168.n.x</code>, die Router-Karte zum Haus hat die '
          + 'Endung <code>.1</code>. Kabel zwischen zwei Routern haben eigene Netze <code>192.168.101.x</code>, '
          + '<code>192.168.102.x</code>, … — die Nummer zählt die Kabel durch.' },
        { begriff: 'Werkzeug: Subnetze', text: 'Unter <em>Ansicht &amp; Tools → Subnetze</em> färbt sich jedes Netz in einer eigenen Farbe, '
          + 'und links steht eine Liste aller Netze mit den Geräten darin. Alles in einer Farbe kann sich direkt erreichen. '
          + 'Ein Gerät, das nicht zu den Farben seiner Nachbarn passt, oder ein Kabel, das grau bleibt, ist verdächtig — '
          + 'dort stimmt eine Adresse nicht oder ein Kabel fehlt. Auch die Kabel <em>zwischen den Routern</em> siehst du hier. '
          + 'Zum Suchen sehr nützlich; es ändert nichts am Netz.' },
        { begriff: 'Weitere Werkzeuge', text: 'Ebenfalls unter <em>Ansicht &amp; Tools</em>: der <em>Mitschnitt</em> (zeigt jede Nachricht, '
          + 'nur im Modus Aktion). Probier sie aus — sie ändern nichts am Netz.' },
        { begriff: 'Was leer oder falsch sein kann', text: 'Eine Adresse, die fehlt oder aus einem anderen Netz stammt, ein Gateway, ein Dienst, der nicht läuft, ein Häkchen '
          + 'bei „Automatisches Routing“, ein Kabel, das gar nicht steckt oder herausgezogen ist. Auch ein WLAN-Name muss <em>genau</em> stimmen. '
          + 'Ein zweiter Weg zwischen den Routern kann einen Fehler verstecken: Das Netz läuft, aber ein Kabel tut nichts.' }
      ],
      stern: 'Ziehe zwei Kabel zwischen Routern heraus. Wann bricht das Netz auseinander — und wann nicht? Was ist der '
        + 'Vorteil davon, dass die Router mehr als einen Weg haben?'
    }),
    netz: { v: 2, nodes: i5netz.nodes, cables: i5netz.cables }
  };

  /* ═══ I.6 · Webseiten und DNS ═══════════════════════════════════
     Fünf Häuser, alles läuft. Neu ist der Inhalt: Ein Haus hat den
     Webserver, eines den DNS-Server. Das Kind ruft die Seite erst
     mit der Adresse auf und holt dann den Namen dazu. */
  macN = 1300; cabN = 1300;
  const i6dns = '192.168.4.20';
  const i6netz = vermascht({
    p: 'w', n: 5, links: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 2], [2, 4], [1, 3]],
    lan: (i) => [
      { hosts: [{ cfg: { dns: i6dns, software: ['browser'] } }, { cfg: { dns: i6dns, software: ['browser'] } }] },
      { hosts: [{ kind: 'server', name: 'DHCP-Server', ip: 20, dhcpServer: { dns: i6dns } },
                { dhcp: true, cfg: { software: ['browser'] } }] },
      { hosts: [{ kind: 'server', name: 'Webserver', ip: 20, cfg: { dns: i6dns } }] },
      { hosts: [{ kind: 'server', name: 'DNS-Server', ip: 20, cfg: { dns: i6dns } }] },
      { hosts: [{ cfg: { dns: i6dns, software: ['browser'] } }] }
    ][i]
  });
  Object.assign(nach(i6netz, 'Webserver'), {
    software: ['webserver'], webServer: { on: true },
    dateien: Object.assign(nach(i6netz, 'Webserver').dateien || {}, {
      '/webserver': { ordner: true },
      '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
      '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
      '/webserver/mpskills-logo.png': { bild: '@drache' },
      '/webserver/synir-logo.png':    { bild: '@synir' }
    })
  });
  Object.assign(nach(i6netz, 'DNS-Server'), { software: ['dns'], dnsServer: { on: true, records: [] } });
  const i6 = {
    titel: 'I.6 · Webseiten und DNS', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Das Schulnetz mit fünf Häusern läuft. Jetzt kommt Inhalt dazu: In Haus 3 steht der '
        + '<strong>Webserver</strong>, in Haus 4 der <strong>DNS-Server</strong>. Auf den Endgeräten liegt ein Webbrowser.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schalte auf <em>Aktion</em>, öffne bei <strong>E1</strong> den Webbrowser und ruf den Webserver '
          + 'über seine <em>Adresse</em> auf: <code>192.168.3.20</code>.' },
        { typ: 'veraendern', text: 'Trag beim DNS-Server den Namen <code>www.schule.de</code> für die Adresse des Webservers ein '
          + 'und ruf die Seite jetzt über den Namen auf. Öffne dann auf dem Webserver den Datei-Explorer, bearbeite '
          + '<code>/webserver/index.html</code> (schreib deine eigene Überschrift hinein) und lade die Seite neu.' },
        { typ: 'erweitern', text: 'Baue in <strong>Haus 5</strong> einen zweiten Webserver mit einer eigenen Seite und gib '
          + 'ihm einen eigenen Namen im DNS, zum Beispiel <code>mensa.schule.de</code>. Beide Seiten sollen von allen Endgeräten '
          + 'erreichbar sein. Gib der neuen Seite außerdem ein <strong>eigenes Bild</strong>: Tausche das Bild aus (ein anderes aus dem Ordner '
          + '<code>/Bilder</code>) oder <strong>lade ein eigenes Bild hoch</strong> (im Datei-Explorer: <em>Datei hochladen</em>), lege es in den '
          + 'Ordner <code>/webserver</code> und schreib den Namen der Bilddatei in die <code>index.html</code> (bei <code>&lt;img src=…&gt;</code>).' }
      ],
      hilfe: [
        { begriff: 'Webserver', text: 'Ein Programm, das Webseiten ausliefert. Die Seite ist eine Datei auf dem Server '
          + '(<code>index.html</code>). Der Browser fragt sie ab und zeigt sie an.' },
        { begriff: 'DNS', text: 'Das Namensverzeichnis des Netzes. Menschen merken sich Namen, Geräte brauchen Adressen — der '
          + 'DNS-Server übersetzt. Ein Name existiert nur, wenn jemand ihn eingetragen hat.' },
        { begriff: 'Bild auf der Seite', text: 'Ein Bild ist eine Datei im Ordner des Webservers, die die Seite mit <code>&lt;img src="dateiname.png"&gt;</code> einbindet. '
          + 'Ein anderes Bild heißt also: Datei in <code>/webserver</code> legen und den Namen in <code>index.html</code> ändern.' },
        { begriff: 'Adresse des DNS', text: 'Ein Gerät muss wissen, <em>wo</em> der DNS-Server steht. Bei den Endgeräten steht seine '
          + 'Adresse im Feld „DNS-Server“, per DHCP kommt sie von selbst mit.' }
      ],
      stern: 'Schalte den DNS-Server aus. Was geht noch, was nicht mehr? Was sagt dir das darüber, wovon eine Webseite abhängt?'
    }),
    netz: { v: 2, nodes: i6netz.nodes, cables: i6netz.cables }
  };

  /* ═══ I.7 · Class Wide Web ══════════════════════════════════════
     Dein eigenes Netz im Internet der Klasse. Der öffentliche DNS
     (8.8.8.8) steht schon; alles andere ist leer, auch jede
     Adresse — denn welcher Bereich dir gehört, sagt erst der Raum
     (siehe Szenario „Ins Internet“ unten). */
  macN = 1400; cabN = 1400;
  const i7 = {
    titel: 'I.7 · Class Wide Web', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Dein Netz hängt jetzt am <strong>Class Wide Web</strong>, dem Internet der Klasse. Der öffentliche DNS '
        + '<code>8.8.8.8</code> steht schon. Alles andere ist noch leer — auch alle Adressen.',
      aufgaben: [
        { typ: 'benutzen', text: 'Öffne das <strong>cww</strong> oben: Im Reiter <em>Internet</em> steht <strong>dein Adressbereich</strong> '
          + '(zum Beispiel <code>X.0.0.0/8</code>). Nur Adressen daraus kommen ins Internet. Trag ihn dir auf.' },
        { typ: 'veraendern', text: 'Gib dem cww, dem Switch-Netz und allen Geräten Adressen aus deinem Bereich. Der Server bekommt '
          + '<code>X.0.0.20</code> mit dem Gateway <code>X.0.0.1</code> (die Adresse des cww). Trag als DNS <code>8.8.8.8</code> ein '
          + 'und melde einen Namen an, zum Beispiel <code>www.deinname.de</code>.' },
        { typ: 'erweitern', text: 'Baue deine Webseite auf dem Server und erweitere dein Netz: weitere Endgeräte, ein zweiter Raum. '
          + 'Dann <strong>besuche die Seite von jemand anderem</strong> aus der Klasse — und lass ihn deine besuchen.' }
      ],
      hilfe: [
        { begriff: 'Adressbereich', text: 'Jeder hat einen eigenen Bereich, wie ein Internetanbieter ihn bekommt. Nur er kommt ins '
          + 'Internet. Den anderer kennst du nicht — du findest sie über den Namen.' },
        { begriff: '8.8.8.8', text: 'Ein öffentlicher DNS-Server, der viele Namen kennt. Wenn dein Name dort steht, findet ihn '
          + 'jeder. Steht er nicht dort, kennt dich niemand.' },
        { begriff: 'traceroute', text: 'Im Terminal zeigt <code>traceroute</code> die Stationen auf dem Weg zu einem Ziel.' }
      ],
      stern: 'Welche Adresse hat die Seite deines Nachbarn? Wem gehört sie — und wie könntest du das herausfinden?'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('c1', 'cww',    'Class Wide Web 1', 720, 190, { ports: 2 }),
        dev('c2', 'switch', 'Switch 1',          720, 380),
        dev('c3', 'server', 'Server 1',          980, 540, {
          software: ['dns', 'webserver'], webServer: { on: true }, dnsServer: { records: [] },
          dateien: {
            '/webserver': { ordner: true },
            '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
            '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
            '/webserver/mpskills-logo.png': { bild: '@drache' },
            '/webserver/synir-logo.png':    { bild: '@synir' }
          }
        }),
        dev('c4', 'host', 'Endgerät 1', 460, 540, { software: ['browser'] }),
        dev('c5', 'host', 'Endgerät 2', 720, 640, { software: ['browser'] })
      ],
      cables: [cab('c1', 1, 'c2', 0), cab('c2', 1, 'c3', 0), cab('c2', 2, 'c4', 0), cab('c2', 3, 'c5', 0)]
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     SEK II · KLASSE 12 — vom Heimnetz zum Schichtenmodell
     Das Programm ist überall dasselbe: Mitschnitt, Subnetze,
     Weiterleitungstabellen, Geräte-Lerninformationen und
     Binärdarstellung liegen in
     jedem Szenario unter „Ansicht & Tools" und werden von den
     Schülern selbst eingeschaltet. Die Aufträge sagen nur, wo sie
     zu finden sind — und jedes Kind darf sie überall erkunden.
     ═══════════════════════════════════════════════════════════════ */
  const WERKZEUG_MITSCHNITT = { begriff: 'Werkzeug: Mitschnitt', text: 'Menü <em>Ansicht &amp; Tools → Mitschnitt</em> '
    + '(sichtbar im Modus Aktion). Er zeigt jede Nachricht, die im Netz unterwegs ist: Absender, Ziel, Protokoll. '
    + 'Die Filter oben (ARP, ICMP, DHCP, DNS …) sortieren nach Protokoll.' };
  const WERKZEUG_LERN = { begriff: 'Werkzeug: Geräte-Lerninformationen', text: 'Menü <em>Ansicht &amp; Tools → Geräte-Lerninformationen</em>. '
    + 'In den Gerätefenstern erscheint dann, was ein Gerät gelernt hat: welche MAC zu welcher IP gehört (ARP), '
    + 'welche Adresse an welcher Buchse des Switches hängt.' };
  const WERKZEUG_WLT = { begriff: 'Werkzeug: Weiterleitungstabellen', text: 'Menü <em>Ansicht &amp; Tools → Weiterleitungstabellen</em>. '
    + 'Unten erscheint je Router eine Tabelle: welches Netz erreicht er über welchen Nachbarn.' };
  const WERKZEUG_BIN = { begriff: 'Werkzeug: Binärdarstellung', text: 'Menü <em>Ansicht &amp; Tools → Binärdarstellung</em>. '
    + 'IP-Adressen und Netzmasken stehen dann als Nullen und Einsen da, vier Gruppen zu je acht. Die Farben bleiben: '
    + '<strong>blau</strong> ist der Netzteil (dort hat die Netzmaske eine 1), <strong>braun</strong> der Geräteteil (dort hat sie eine 0). '
    + 'Auch die Grenze mitten in einer Zahl, etwa bei <code>255.255.255.192</code>, ist so zu sehen. Ein- und ausschaltbar.' };
  const WERKZEUG_SUB = { begriff: 'Werkzeug: Subnetze', text: 'Menü <em>Ansicht &amp; Tools → Subnetze</em>. '
    + 'Die Fläche zeigt alle Adressräume in Farbe, dazu eine Liste mit Netzadresse, Maske und Größe.' };

  /* ═══ II.1 · Fehler finden und wieder rein ═════════════════════
     Wie I.5, aber kleiner (zwei Router) — und der Wiedereinstieg in
     Klasse 12: die Schüler kennen die Begriffe aus der Mittelstufe
     nur noch halb. Deshalb steht hier nichts Neues (kein Mitschnitt,
     keine Lerninformationen), dafür eine Anleitung Schritt für
     Schritt und eine Auffrischung der Begriffe. Ein Fehler trägt
     keine Warnung: dieselbe Adresse zweimal — er fällt auf, wenn man
     die Adressen der Geräte eines Hauses nebeneinanderlegt. */
  macN = 1500; cabN = 1500;
  const ii1netz = vermascht({
    p: 'e', n: 2, links: [[0, 1]],
    lan: (i) => [
      { hosts: [{}, { ip: 10 }, { ip: 12, ohneKabel: true }] },                           // Fehler 1: doppelt; Fehler 5: Kabel fehlt
      { wlan: 'Schul-WLAN', hosts: [{ kind: 'server', name: 'DHCP-Server', ip: 20, dhcpServer: {} },
                                    { dhcp: true }, { dhcp: true },
                                    { ip: 30, cfg: { gateway: '192.168.1.1' } },             // Fehler 2: Gateway
                                    { kind: 'handy', name: 'Handy 1', funk: 'SchulWLAN' }] } // Fehler 4: SSID
    ][i]
  });
  nach(ii1netz, 'DHCP-Server').dhcpServer.von = '192.168.3.100';                           // Fehler 3: falsches Netz
  nach(ii1netz, 'DHCP-Server').dhcpServer.bis = '192.168.3.150';
  const ii1 = {
    titel: 'II.1 · Fehler finden und wieder rein', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Zwei Häuser, zwei Router, WLAN, DHCP und ein paar Kabelgeräte: ein Netz, das eigentlich laufen sollte. Nach einem Umbau '
        + 'geht einiges nicht. Die Begriffe kennst du aus der 8. Klasse — hier frischst du sie auf, indem du das Netz '
        + 'wieder zum Laufen bringst. Unten in der <em>Hilfe</em> stehen die Begriffe und eine Anleitung.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schau dir das Netz an: Welche Geräte gibt es (Endgeräte, Switch, Router, DHCP-Server, Handy)? '
          + 'Schalte auf <em>Aktion</em> und schick von <strong>E1</strong> aus Pings: erst an ein Gerät im <em>selben</em> Haus, dann an den '
          + 'Router, dann ins <em>andere</em> Haus, zuletzt an das Handy. Notiere zu jedem Ziel: klappt / klappt nicht.' },
        { typ: 'veraendern', text: 'Im Netz stecken <strong>fünf Fehler</strong>. Geh nach der Anleitung „Vorgehen“ vor: Immer dort nachsehen, wo der Ping '
          + 'aufhört — bei Adresse, Gateway, Kabel, DHCP-Server und WLAN-Name. Behebe die Fehler, bis jedes Gerät jedes andere erreicht. '
          + 'Schreib zu jedem Fehler auf: Wo war er, was war falsch, wie hast du ihn behoben?' },
        { typ: 'erweitern', text: 'Baue selbst <strong>einen neuen Fehler</strong> ein (zum Beispiel ein falsches Gateway) und lass jemanden neben dir ihn suchen. '
          + 'Tauscht danach die Rollen.' }
      ],
      hilfe: [
        { begriff: 'Begriffe zum Auffrischen', text: 'Das kennst du:', liste: [
          '<strong>IP-Adresse</strong> — die „Hausnummer“ eines Geräts. Im selben Netz hat jedes Gerät eine andere.',
          '<strong>Switch</strong> — verbindet Geräte <em>innerhalb</em> eines Netzes.',
          '<strong>Router</strong> — verbindet <em>verschiedene</em> Netze und hat in jedem Netz eine eigene Adresse.',
          '<strong>Gateway</strong> — die Adresse des Routers im eigenen Netz. Alles, was in ein anderes Netz soll, schickt ein Gerät dorthin.',
          '<strong>DHCP</strong> — ein Dienst, der Adressen verteilt. Sein Adressbereich muss zu dem Netz passen, in dem er steht.',
          '<strong>WLAN-Name (SSID)</strong> — der Name des Funknetzes. Er muss beim Handy <em>genau</em> so stehen wie am Switch.'
        ] },
        { begriff: 'Vorgehen', text: 'Von innen nach außen:', liste: [
          'Klappt der Ping zu einem Gerät im <em>selben</em> Netz? Wenn nicht: Kabel, Adresse (Netz stimmt? Adresse doppelt?), WLAN-Name.',
          'Klappt der Ping zum <em>Router</em> im eigenen Haus? Wenn nicht: hat der Router dort eine Adresse?',
          'Klappt der Ping ins <em>andere Haus</em>? Wenn nicht: Gateway des Geräts prüfen.',
          'Bekommt ein Gerät gar keine oder eine seltsame Adresse? Dann schau in den <em>DHCP-Server</em>: Passt sein Bereich zum Netz?',
          'Hilfreich: <em>Ansicht &amp; Tools → Subnetze</em> färbt die Netze. Ein Gerät in der falschen Farbe hat eine Adresse aus dem falschen Netz.'
        ] },
        { begriff: 'Doppelte Adresse', text: 'Haben zwei Geräte im selben Netz dieselbe IP-Adresse, stören sie sich: mal klappt ein Ping, mal nicht. '
          + 'Lege dazu die Adressen der Geräte eines Hauses nebeneinander (Gerätefenster öffnen) und vergleiche.' }
      ],
      stern: 'Ein Fehler lässt sich auf zwei Wegen beheben (am Gerät oder am Server). Welcher ist besser, und warum?'
    }),
    netz: { v: 2, nodes: ii1netz.nodes, cables: ii1netz.cables }
  };

  /* ═══ II.2 · Heimnetz und Internet ══════════════════════════════
     Links ein Heimnetz mit Heimrouter (zwei Laptops, ein Handy im
     WLAN), rechts ein ganz normales öffentliches Netz: ein Router
     des Anbieters, ein Switch, ein Webserver und ein fremder
     Rechner, alle mit öffentlichen Adressen (84.12.x.x). Vom Heimnetz
     nach draußen pingen, von draußen wieder hinein — und dabei die
     Fehler finden:

       1 · der Heimrouter hat ein falsches Gateway (.11 statt .1)
       2 · Laptop 2 hat gar kein Gateway
       3 · der fremde Rechner hat kein Gateway: der Ping kommt an,
           aber die Antwort findet nicht zurück (hin ja, zurück nein)

     Erst danach kommt das Class Wide Web: es ersetzt den Anbieter
     (letzte Aufgabe). */
  macN = 1600; cabN = 1600;
  const ii2 = {
    titel: 'II.2 · Heimnetz und Internet', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Links steht ein <strong>Heimnetz</strong>: ein Heimrouter (Router, Switch und WLAN in einem Gehäuse) mit zwei Laptops und einem Handy. '
        + 'Rechts liegt das <strong>öffentliche Netz</strong> des Anbieters mit einem Webserver und einem fremden Rechner. '
        + 'Das Heimnetz benutzt private Adressen (<code>192.168.1.x</code>), das öffentliche Netz Adressen wie <code>84.12.6.20</code>.',
      aufgaben: [
        { typ: 'benutzen', text: 'Öffne den Heimrouter. Welche Anschlüsse hat er (WAN, LAN)? Welche Adresse steht auf welcher Seite? '
          + 'Schalte auf <em>Aktion</em> und schick von <strong>Laptop 1</strong> Pings an Laptop 2 und an das Handy — beide im Heimnetz.' },
        { typ: 'veraendern', text: '<strong>Raus:</strong> Schick von <strong>Laptop 1</strong> und von <strong>Laptop 2</strong> je einen Ping an den '
          + '<strong>Webserver</strong> (<code>84.12.6.20</code>) und an den <strong>fremden Rechner</strong> (<code>84.12.6.30</code>). '
          + 'Nicht alles klappt: Im Netz stecken <strong>Fehler</strong>. Finde sie und behebe sie, bis beide Laptops beide Ziele erreichen. '
          + 'Notiere zu jedem Fehler, woran du ihn erkannt hast. Tipp: Bei einem Ping muss auch die <em>Antwort</em> zurückfinden.' },
        { typ: 'veraendern', text: '<strong>Wieder hinein:</strong> Schick vom <strong>fremden Rechner</strong> einen Ping an die WAN-Adresse des Heimrouters '
          + '(<code>84.12.5.2</code>) und dann an <strong>Laptop 1</strong> (<code>192.168.1.10</code>). Was klappt, was nicht? '
          + 'Schau in der NAT-Tabelle des Heimrouters nach und im Mitschnitt: Welche Absenderadresse sieht der Webserver, wenn Laptop 1 ihn anpingt? '
          + 'Erkläre, warum ein Ping an den Laptop von draußen nicht ankommt.' },
        { typ: 'erweitern', text: '<strong>Jetzt das Class Wide Web:</strong> Ziehe ein <strong>cww</strong> aufs Feld und ersetze damit den Anbieter. '
          + 'Verbinde es mit dem Heimrouter, gib ihm eine Adresse aus deinem Bereich (steht im Reiter <em>Internet</em>) und richte dort einen '
          + '<em>DHCP-Server</em> ein. Stelle die WAN-Seite des Heimrouters auf <em>DHCP zur Konfiguration verwenden</em>. '
          + 'Beweise mit einem Ping an <code>8.8.8.8</code>, dass Laptop 1 im Internet der Klasse ist.' }
      ],
      hilfe: [
        { begriff: 'Heimrouter', text: 'Drei Geräte in einem Gehäuse: ein <em>Router</em> (verbindet Heimnetz und Anbieter), ein <em>Switch</em> '
          + '(die LAN-Buchsen) und ein <em>Zugangspunkt</em> (das WLAN). Oben die Buchse WAN zum Anbieter, unten die LAN-Buchsen.' },
        { begriff: 'Hin und zurück', text: 'Ein Ping braucht zwei Wege: hin <em>und</em> zurück. Damit die Antwort ein anderes Netz erreicht, braucht jedes Gerät '
          + 'ein <em>Gateway</em>, auch der Server draußen. Kommt die Anfrage an, aber keine Antwort, fehlt oft ein Gateway am Ziel.' },
        { begriff: 'Öffentliches und privates Netz', text: 'Adressen wie <code>192.168.x.x</code> sind <em>privat</em>: es gibt sie in jedem Heimnetz, und die Router im Internet '
          + 'leiten sie nicht weiter. Im öffentlichen Netz hat jedes Gerät eine Adresse, die es nur einmal gibt.' },
        { begriff: 'NAT', text: 'Der Heimrouter tauscht beim Hinausgehen den Absender gegen seine eigene öffentliche WAN-Adresse aus und merkt sich, wer gefragt hat. '
          + 'Die Merktabelle heißt <em>NAT-Tabelle</em> und steht im Fenster des Heimrouters. Von außen kommt nur an, wozu es einen Eintrag gibt.' },
        WERKZEUG_SUB,
        WERKZEUG_MITSCHNITT
      ],
      stern: 'Zwei Laptops rufen gleichzeitig denselben Webserver auf. Woran erkennt der Heimrouter, welche Antwort zu welchem Laptop gehört? (Tipp: NAT-Tabelle, Ports)'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('h1', 'heimrouter', 'Heimrouter 1', 470, 440, {
          ports: 9, nics: [{ ip: '84.12.5.2' }, { ip: '192.168.1.1' }], gateway: '84.12.5.11',   // Fehler 1
          wlan: { on: true, ssid: 'Heim-WLAN' }
        }),
        dev('h2', 'host', 'Laptop 1', 240, 620, { nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1' }),
        dev('h3', 'host', 'Laptop 2', 470, 680, { nics: [{ ip: '192.168.1.11' }] }),            // Fehler 2: kein Gateway
        dev('h4', 'handy', 'Handy 1', 700, 620, {
          nics: [{ ip: '192.168.1.12', funk: true, ssid: 'Heim-WLAN' }], gateway: '192.168.1.1'
        }),
        dev('h5', 'router', 'Anbieter-Router', 780, 440, { nics: [{ ip: '84.12.5.1' }, { ip: '84.12.6.1' }] }),
        dev('h6', 'switch', 'Switch 1', 1030, 440),
        dev('h7', 'server', 'Webserver', 1170, 600, {
          nics: [{ ip: '84.12.6.20' }], gateway: '84.12.6.1', software: ['webserver'], webServer: { on: true },
          dateien: {
            '/webserver': { ordner: true },
            '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
            '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
            '/webserver/mpskills-logo.png': { bild: '@drache' },
            '/webserver/synir-logo.png':    { bild: '@synir' }
          }
        }),
        dev('h8', 'host', 'Fremder Rechner', 940, 620, { nics: [{ ip: '84.12.6.30' }] })         // Fehler 3: kein Gateway
      ],
      cables: [
        cab('h1', 0, 'h5', 0), cab('h1', 1, 'h2', 0), cab('h1', 2, 'h3', 0),
        cab('h5', 1, 'h6', 0), cab('h6', 1, 'h7', 0), cab('h6', 2, 'h8', 0)
      ]
    }
  };

  /* ═══ II.3 · Webseiten und E-Mail ═══════════════════════════════
     Ein Heimnetz, in dem ALLES dynamisch ist: der Heimrouter teilt
     per DHCP Adressen aus (.100 bis .150), auch der Server holt sich
     seine Adresse so. Die Falle steht im DHCP: es verteilt als
     DNS-Server schon die Adresse 192.168.1.20 — die der Server erst
     bekommt, wenn ein Kind ihn auf eine feste Adresse stellt. Wer
     den Namen im DNS einträgt, merkt: geht nicht. Erst mit der
     statischen Adresse klappt er. Das E-Mail-System ist die
     Sprinter-Aufgabe (★). Danach nach draußen: die Portfreigabe ist
     der Schritt, an dem ein privates Netz öffentlich wird. */
  macN = 1700; cabN = 1700;
  const ii3 = {
    titel: 'II.3 · Webseiten und E-Mail', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Im Heimnetz holen sich alle Geräte ihre Adresse <strong>dynamisch</strong> per DHCP vom Heimrouter — auch der Server, '
        + 'der eine Webseite ausliefern, Namen auflösen und E-Mails verwalten kann. Alle drei Programme sind installiert und gestartet, '
        + 'aber noch leer. Auf den Laptops liegen Browser und E-Mail-Programm.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schalte auf <em>Aktion</em> und warte, bis alle Geräte eine Adresse haben. Schau am <strong>Heimserver</strong> nach, welche '
          + 'Adresse er bekommen hat, und ruf seine Seite von <strong>Laptop 1</strong> im Browser über diese Adresse auf. '
          + 'Welche Nachrichten gehen dabei über das Netz? (Mitschnitt, Filter DHCP, HTTP und TCP.)' },
        { typ: 'veraendern', text: 'Trag im DNS-Server den Namen <code>www.heim.de</code> für die Adresse des Servers ein und versuche, die Seite '
          + 'über den <em>Namen</em> aufzurufen. Es klappt <strong>nicht</strong>. Finde den Grund: Welchen DNS-Server kennt Laptop 1 '
          + '(Gerätefenster) — und unter welcher Adresse steht der DNS-Server in Wirklichkeit?' },
        { typ: 'erweitern', text: '<strong>Dynamisch oder statisch?</strong> Gib dem Heimserver eine <em>feste</em> Adresse: <code>192.168.1.20</code> '
          + '(DHCP aus, Gateway <code>192.168.1.1</code>, DNS-Server <code>192.168.1.20</code>) — sie liegt außerhalb des DHCP-Bereichs. '
          + 'Lass die Laptops ihre Adresse neu holen und trag den Namen im DNS mit der neuen Adresse neu ein. Jetzt muss <code>www.heim.de</code> gehen. '
          + 'Schreib dann die Seite um. Warum sollte ein Server eine feste Adresse haben — und ein Laptop lieber nicht?' },
        { typ: 'erweitern', text: '<strong>Nach draußen:</strong> Richte das cww als Anbieter ein (Adresse, DHCP wie in II.2). Gib am Heimrouter den Port 80 '
          + 'für den Server frei (<em>Portfreigabe</em>) und melde deinen Namen bei <code>8.8.8.8</code> an. Ein Mitschüler soll deine Seite '
          + 'aus <em>seinem</em> Netz aufrufen.' }
      ],
      hilfe: [
        { begriff: 'Dynamisch und statisch', text: '<em>Dynamisch</em> heißt: Die Adresse kommt vom DHCP-Server und kann sich ändern (wenn die Leihzeit abläuft oder das Gerät neu startet). '
          + '<em>Statisch</em> heißt: Du trägst sie selbst ein, und sie bleibt. Was andere <em>finden</em> müssen — ein Server, ein DNS-Server — braucht eine '
          + 'statische Adresse, denn Namen im DNS und Einstellungen an anderen Geräten verweisen auf sie.' },
        { begriff: 'Adresse außerhalb des Bereichs', text: 'Der DHCP-Server verteilt nur Adressen aus seinem Bereich (hier <code>.100</code> bis <code>.150</code>). Eine feste Adresse '
          + 'wählst du <em>außerhalb</em>, sonst könnte er sie noch einmal an ein anderes Gerät vergeben.' },
        { begriff: 'Neue Adresse holen', text: 'Ein Gerät, das per DHCP kommt, behält seine Angaben, bis es sie neu holt: im Gerätefenster <em>Adresse neu holen</em> '
          + 'oder im Terminal <code>dhcp neu</code>. Erst dann kennt es einen geänderten DNS-Server.' },
        { begriff: 'Portfreigabe', text: 'Von außen kommt an der WAN-Adresse nur an, was ein Gerät im Heimnetz selbst angefragt hat. Damit ein Server von außen '
          + 'erreichbar ist, sagt eine Portfreigabe am Heimrouter: „Was auf Port 80 hereinkommt, geht an <code>192.168.1.20</code>.“ '
          + 'Sie steht im Fenster des Heimrouters.' },
        WERKZEUG_MITSCHNITT,
        { begriff: 'E-Mail', text: 'Zwei Protokolle mit zwei Aufgaben: <em>SMTP</em> (Port 25) bringt eine Nachricht zum Server, <em>POP3</em> (Port 110) holt sie '
          + 'ab. Eine Mail wird nicht zugestellt, sie wird <em>abgeholt</em>: sie liegt auf dem Server, bis der Empfänger fragt.' }
      ],
      stern: '<strong>E-Mail:</strong> Lege im Mailserver zwei Konten an (<code>anna@heim.de</code>, <code>ben@heim.de</code>), richte auf den Laptops die '
        + 'E-Mail-Programme ein und schick eine Mail von Anna an Ben. Und dann: Was muss außer dem Konto noch stimmen, damit auch eine Mail '
        + 'von einem Mitschüler bei dir ankommt?'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('j0', 'cww',        'Class Wide Web 1', 720, 190, { ports: 2 }),
        dev('j1', 'heimrouter', 'Heimrouter 1',     720, 400, {
          ports: 9, nics: [{ dhcp: true }, { ip: '192.168.1.1' }], wlan: { on: true, ssid: 'Heim-WLAN' },
          dhcpServer: { nic: 1, von: '192.168.1.100', bis: '192.168.1.150', mask: '255.255.255.0',
                        gateway: '192.168.1.1', dns: '192.168.1.20' }
        }),
        dev('j2', 'host', 'Laptop 1', 470, 610, { nics: [{ dhcp: true }], software: ['browser', 'mail'] }),
        dev('j3', 'host', 'Laptop 2', 690, 670, { nics: [{ dhcp: true }], software: ['browser', 'mail'] }),
        dev('j4', 'server', 'Heimserver', 930, 610, {
          nics: [{ dhcp: true }],
          software: ['dns', 'webserver', 'mailserver'], webServer: { on: true },
          dnsServer: { records: [] }, mailServer: { on: true, domain: 'heim.de', konten: [] },
          dateien: {
            '/webserver': { ordner: true },
            '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
            '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
            '/webserver/mpskills-logo.png': { bild: '@drache' },
            '/webserver/synir-logo.png':    { bild: '@synir' }
          }
        }),
        dev('j5', 'handy', 'Handy 1', 1130, 500, { nics: [{ dhcp: true, funk: true, ssid: 'Heim-WLAN' }] })
      ],
      cables: [cab('j0', 1, 'j1', 0), cab('j1', 1, 'j2', 0), cab('j1', 2, 'j3', 0), cab('j1', 3, 'j4', 0)]
    }
  };

  /* ═══ II.4 · Web und E-Mail im CWW ══════════════════════════════
     Jeder baut sein eigenes kleines Rechenzentrum am cww: Server
     mit Web, DNS und Mail, alles aus den eigenen Adressen. Nichts
     ist installiert, nichts eingetragen. */
  macN = 1800; cabN = 1800;
  const ii4 = {
    titel: 'II.4 · Web und E-Mail im CWW', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Du betreibst jetzt selbst einen kleinen Anbieter im Class Wide Web: ein Server soll deine Webseite und deine E-Mails '
        + 'für die Klasse bereitstellen. Alles hängt am cww — aber nichts ist installiert oder eingetragen.',
      aufgaben: [
        { typ: 'bauen', text: 'Gib dem cww, dem Server und den beiden Endgeräten Adressen aus deinem Bereich (steht im cww). '
          + 'Installiere auf dem Server Webserver, DNS-Server und E-Mail-Server und auf den Endgeräten Browser und E-Mail-Programm.' },
        { typ: 'bauen', text: 'Schreib deine Seite, trag Namen im DNS ein und melde sie bei <code>8.8.8.8</code> an. '
          + 'Lege zwei Mailkonten an. Schick eine Mail an einen Mitschüler und ruf seine Seite auf.' },
        { typ: 'erweitern', text: 'Erweitere dein Netz: ein zweiter Server (zum Beispiel nur für die Mail), ein zweites Netz mit eigenem Switch und weiteren '
          + 'Endgeräten. Alles soll weiter funktionieren, und alle Namen sollen im Mitschnitt nachvollziehbar sein.' }
      ],
      hilfe: [
        { begriff: 'Mailadresse', text: 'Eine Adresse besteht aus Name und Domain: <code>anna@deinname.de</code>. Die Domain muss im DNS stehen, sonst '
          + 'findet niemand deinen Mailserver.' },
        { begriff: 'Ein Server, viele Dienste', text: 'Ein Gerät kann mehrere Dienste anbieten. Unterschieden werden sie über den <em>Port</em>: 80 für '
          + 'Web, 25 und 110 für E-Mail, 53 für DNS.' },
        WERKZEUG_MITSCHNITT
      ],
      stern: 'Wie viele Mitschüler kommen an deine Seite — und wie viele von ihnen kommen auch an deine Mail? Was fehlt bei den anderen?'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('k0', 'cww',    'Class Wide Web 1', 720, 190, { ports: 2 }),
        dev('k1', 'switch', 'Switch 1',          720, 380),
        dev('k2', 'server', 'Server 1',          980, 540),
        dev('k3', 'host',   'Endgerät 1',        460, 540),
        dev('k4', 'host',   'Endgerät 2',        720, 640)
      ],
      cables: [cab('k0', 1, 'k1', 0), cab('k1', 1, 'k2', 0), cab('k1', 2, 'k3', 0), cab('k1', 3, 'k4', 0)]
    }
  };

  /* ═══ II.5 · Subnetzmasken ══════════════════════════════════════
     Aus dem Class Wide Web: der eigene Bereich ist ein /8 —
     16 Millionen Adressen für ein paar Rechner. Das Kind teilt ihn
     auf, mit Masken, die zur Größe des Bedarfs passen.

     Die Erklärung hängt am Bild, nicht an Rechenregeln: Adresse =
     Netzteil (blau) + Geräteteil (braun), die Maske setzt die
     Grenze. Die Verbindung zur Praxis: braucht ein Netz mehr als
     250 Geräte, wandern die letzten ZWEI Zahlen in den Geräteteil
     (255.255.0.0). Das Werkzeug „Binärdarstellung" zeigt dieselbe
     Grenze als Nullen und Einsen. */
  macN = 1900; cabN = 1900;
  const ii5 = {
    titel: 'II.5 · Subnetzmasken', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Das cww hat dir einen riesigen Bereich gegeben: <code>X.0.0.0</code> mit der Netzmaske <code>255.0.0.0</code> — über 16 Millionen '
        + 'Adressen. Deine Schule braucht nur ein paar hundert. Bisher hängt alles in <em>einem</em> Netz. Die <strong>Netzmaske</strong> '
        + 'legt fest, wie groß ein Netz ist und wie viele Geräte hineinpassen.',
      aufgaben: [
        { typ: 'benutzen', text: 'Gib allen Geräten Adressen aus deinem Bereich (<code>X.0.0.n</code>, Maske <code>255.0.0.0</code>) und prüfe, dass alle sich '
          + 'erreichen. Öffne ein Gerätefenster: Ein Teil der Adresse ist <strong>blau</strong> (Netzteil), der Rest <strong>braun</strong> (Geräteteil). '
          + 'Wie viele Zahlen gehören zum Netz, wie viele zum Gerät? Schalte <em>Subnetze</em> ein: Wie groß ist das eine Netz, in dem alles liegt?' },
        { typ: 'benutzen', text: 'Schalte <em>Ansicht &amp; Tools → Binärdarstellung</em> ein. Adresse und Netzmaske stehen jetzt als Nullen und Einsen da: '
          + 'Wo die Netzmaske eine <strong>1</strong> hat, gehört das Bit zum Netz (blau), wo sie eine <strong>0</strong> hat, zum Gerät (braun). '
          + 'Ändere bei <em>allen</em> Geräten (auch beim cww) die Netzmaske auf <code>255.255.0.0</code> und dann auf <code>255.255.255.0</code>. '
          + 'Wie verschiebt sich die Grenze zwischen blau und braun? Wie viele Geräte passen jeweils hinein?' },
        { typ: 'veraendern', text: 'Teile es auf. Verwaltung (bis <strong>50</strong> Geräte), Unterricht (bis <strong>200</strong>) und Server (bis <strong>10</strong>) '
          + 'bekommen je ein eigenes Netz, verbunden über einen Router. Wähle für jedes die <em>kleinste</em> Maske, in die es passt, und schreib '
          + 'einen Adressplan (Netz, Maske, erste und letzte Adresse). Prüfe dich mit <em>Subnetze</em> und der Binärdarstellung.' },
        { typ: 'erweitern', text: 'Ein viertes Netz: das Gäste-WLAN für bis zu <strong>100</strong> Handys, ohne Zugriff auf Verwaltung und Server. '
          + 'Schaffst du es, dass das nur an der Aufteilung liegt?' }
      ],
      hilfe: [
        { begriff: 'Netzteil und Geräteteil', text: 'Jede Adresse hat zwei Teile: vorne den <em>Netzteil</em> (in welchem Netz liegt das Gerät?), hinten den <em>Geräteteil</em> '
          + '(welches Gerät in diesem Netz?). Die Netzmaske legt die Grenze fest. Im Gerätefenster ist der Netzteil blau und der Geräteteil braun. '
          + 'Je mehr Zahlen im Geräteteil stehen, desto mehr Geräte passen ins Netz:', liste: [
          '<code>255.255.255.0</code> → <strong>eine</strong> Zahl Geräteteil (<code>192.168.1.<b>n</b></code>) → bis zu 254 Geräte',
          '<code>255.255.0.0</code> → <strong>zwei</strong> Zahlen Geräteteil (<code>192.168.<b>n.n</b></code>) → bis zu 65 534 Geräte',
          '<code>255.0.0.0</code> → <strong>drei</strong> Zahlen Geräteteil → über 16 Millionen Geräte'
        ] },
        { begriff: 'Wozu die große Maske?', text: 'Sollen <strong>mehr als 250 Geräte</strong> in ein Netz (eine Firma, eine große Schule), reicht die letzte Zahl nicht: Sie kann nur 254 Geräte zählen. '
          + 'Dann gehören die <em>letzten beiden</em> Zahlen zum Geräteteil, also <code>255.255.0.0</code>. Umgekehrt ist ein Netz mit 10 Geräten in einer '
          + '<code>255.255.255.0</code> verschwendet — dafür gibt es kleinere Netze.' },
        { begriff: 'Mitten in einer Zahl', text: 'Die Grenze muss nicht zwischen zwei Zahlen liegen. Bei <code>255.255.255.192</code> gehört ein Teil der letzten Zahl noch zum Netz — '
          + 'im Gerätefenster ist sie gestreift. Die genaue Grenze zeigt die Binärdarstellung.' },
        WERKZEUG_BIN,
        { begriff: 'Größen', text: 'Wie viele Geräte passen in ein Netz? Hat der Geräteteil <em>n</em> Bit, sind es 2<sup>n</sup> − 2 Geräte (zwei Adressen sind reserviert: '
          + 'die <em>Netzadresse</em> mit lauter Nullen im Geräteteil und die <em>Broadcastadresse</em> mit lauter Einsen).', liste: [
          '<code>255.255.255.0</code> → 254 Geräte',
          '<code>255.255.255.128</code> → 126',
          '<code>255.255.255.192</code> → 62',
          '<code>255.255.255.224</code> → 30',
          '<code>255.255.255.240</code> → 14'
        ] },
        WERKZEUG_SUB
      ],
      stern: 'Warum sind zwei Netze, die sich überschneiden, ein Problem? Zeig es an einem Beispiel mit dem Werkzeug <em>Subnetze</em>.'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('u0', 'cww',    'Class Wide Web 1', 720, 190, { ports: 2 }),
        dev('u1', 'switch', 'Switch 1',          720, 400, { ports: 12 }),
        dev('u2', 'host',   'Verwaltung 1',      420, 560),
        dev('u3', 'host',   'Verwaltung 2',      560, 640),
        dev('u4', 'host',   'Unterricht 3',      720, 660),
        dev('u5', 'host',   'Unterricht 4',      880, 640),
        dev('u6', 'host',   'Unterricht 5',      1020, 560),
        dev('u7', 'server', 'Server 1',          1050, 400)
      ],
      cables: [cab('u0', 1, 'u1', 0), cab('u1', 1, 'u2', 0), cab('u1', 2, 'u3', 0), cab('u1', 3, 'u4', 0),
               cab('u1', 4, 'u5', 0), cab('u1', 5, 'u6', 0), cab('u1', 6, 'u7', 0)]
    }
  };

  /* ═══ II.6 · Routing-Tabelle ════════════════════════════════════
     Dasselbe Netz wie I.4 (drei Häuser in einer Reihe) — aber alles
     eingerichtet und das automatische Routing AUS. Wer die Wege
     nicht einträgt, kommt nicht weit. */
  macN = 2000; cabN = 2000;
  const ii6netz = vermascht({
    p: 't', n: 3, links: [[0, 1], [1, 2]], rip: false,
    lan: (i) => [{ hosts: [{}, {}] }, { hosts: [{}] }, { hosts: [{}, {}] }][i]
  });
  const ii6 = {
    titel: 'II.6 · Routing-Tabelle', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Dasselbe Netz mit drei Häusern in einer Reihe. Alle Geräte und alle Router-Karten sind eingerichtet, aber ohne automatisches Routing: '
        + 'die Router kennen nur die Netze, an denen sie selbst hängen.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schalte <em>Weiterleitungstabellen</em> ein und schau, was jeder Router kennt. Schick einen Ping von <strong>E1</strong> zu '
          + 'einem Endgerät in Haus 2. Was meldet das Netz, und bei welchem Router bleibt die Nachricht hängen?' },
        { typ: 'veraendern', text: 'Trag an jedem Router die fehlenden Wege ein, bis E1 jedes Endgerät erreicht — <em>und</em> jedes zurück. '
          + 'Ein Eintrag besteht aus Zielnetz, Maske und dem Nachbarn, über den man dorthin kommt.' },
        { typ: 'erweitern', text: 'Ziehe ein zusätzliches Kabel von Router 1 zu Router 3 (neues Netz <code>192.168.103.x</code>). Trag eine Route '
          + 'ein, die Haus 3 jetzt <em>direkt</em> erreicht. Wie entscheidet der Router, welchen der beiden Wege er nimmt?' }
      ],
      hilfe: [
        WERKZEUG_WLT,
        { begriff: 'Route', text: 'Ein Eintrag der Form „Ziel: <code>192.168.3.0/24</code> — über Nachbar: <code>192.168.101.2</code>“. Der Nachbar muss in einem Netz '
          + 'liegen, an dem der Router selbst angeschlossen ist.' },
        { begriff: 'Standardroute', text: 'Ein Sammeleintrag für „alles andere“: Ziel <code>0.0.0.0</code>, Maske <code>0.0.0.0</code>. Bei einem Router am '
          + 'Rand des Netzes spart er viele einzelne Einträge.' },
        { begriff: 'Hin- und Rückweg', text: 'Ein Ping braucht zwei Wege: hin <em>und</em> zurück. Fehlt die Rückroute, kommt die Anfrage an, '
          + 'aber keine Antwort.' }
      ],
      stern: 'Wie viele Einträge brauchst du insgesamt? Und wie viele wären es bei zehn Häusern? Was hat das automatische Routing dagegen zu bieten?'
    }),
    netz: { v: 2, nodes: ii6netz.nodes, cables: ii6netz.cables }
  };

  /* ═══ II.7 · Großes eigenes Netz ════════════════════════════════
     Leeres Feld. Nur das cww steht da, und eine Liste, was das
     Netz können muss. Danach traceroute zu den Nachbarn. */
  macN = 2100; cabN = 2100;
  const ii7 = {
    titel: 'II.7 · Großes eigenes Netz', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Du bist der Netzwerkadministrator einer Schule und baust das Netz <strong>ganz allein</strong>. Nur der Anschluss ans '
        + 'Class Wide Web steht schon. Was das Netz können muss, steht unten — wie du es baust, entscheidest du.',
      aufgaben: [
        { typ: 'bauen', eigen: true, label: 'Muss.', text: 'Mindestens <strong>drei Netze</strong> (Verwaltung, Unterricht, Server), verbunden über Router, mit '
          + 'passend gewählten Subnetzmasken und einem Adressplan.' },
        { typ: 'bauen', eigen: true, label: 'Muss.', text: 'Mindestens <strong>15 Geräte</strong>; die Geräte im Unterricht bekommen ihre Adresse per <strong>DHCP</strong>, '
          + 'im Unterrichtsnetz gibt es zusätzlich ein <strong>WLAN</strong> mit Handys.' },
        { typ: 'bauen', eigen: true, label: 'Muss.', text: 'Ein Webserver mit eigener Seite und ein Mailserver mit zwei Konten. Beide Namen stehen im DNS und sind bei '
          + '<code>8.8.8.8</code> angemeldet. Jedes Gerät erreicht jedes andere und ruft deine Seite über den Namen auf.' },
        { typ: 'bauen', eigen: true, label: 'Kann.', text: 'Ein zweiter Weg zwischen zwei Routern, damit das Netz ein Kabelbruch überlebt.' },
        { typ: 'benutzen', eigen: true, label: 'Danach.', text: 'Schick <code>traceroute</code> zum Server eines Mitschülers. Was siehst du von seinem Netz — und was nicht?' }
      ],
      hilfe: [
        { begriff: 'Abnahme', text: 'Ein Netz ist fertig, wenn die Liste oben stimmt <em>und</em> du es beweisen kannst: mit Pings, einem Mitschnitt und '
          + 'einer Seite im Browser eines fremden Netzes.' },
        WERKZEUG_SUB, WERKZEUG_WLT, WERKZEUG_MITSCHNITT,
        { begriff: 'traceroute', text: 'Im Terminal: <code>traceroute Adresse</code> zeigt die Router auf dem Weg. Jede Zeile ist ein Sprung, Antwortzeiten '
          + 'stehen daneben.' }
      ],
      stern: 'Vergleiche dein Netz mit dem eines Mitschülers: Wer hat weniger Router, wer weniger Einträge, wer das robustere? Warum?'
    }),
    netz: { v: 2, nodes: [dev('z0', 'cww', 'Class Wide Web 1', 720, 190, { ports: 4 })], cables: [] }
  };

  /* ═══ II.8 · Schichtenmodell ════════════════════════════════════
     Ein Netz, in dem alles läuft und alles Wichtige drin ist: drei
     Häuser im Dreieck, DHCP, DNS, Web, WLAN. Man liest es nur —
     im Mitschnitt, Zeile für Zeile, Schicht für Schicht. */
  macN = 2200; cabN = 2200;
  const ii8dns = '192.168.2.21';
  const ii8netz = vermascht({
    p: 'y', n: 3, links: [[0, 1], [1, 2], [0, 2]],
    lan: (i) => [
      { hosts: [{ cfg: { dns: ii8dns, software: ['browser'] } }, { cfg: { dns: ii8dns, software: ['browser'] } }] },
      { wlan: 'Schul-WLAN', hosts: [
        { kind: 'server', name: 'DHCP-Server', ip: 20, dhcpServer: { dns: ii8dns } },
        { kind: 'server', name: 'DNS-Server', ip: 21, cfg: { dns: ii8dns, software: ['dns'],
          dnsServer: { on: true, records: [{ name: 'www.schule.de', ip: '192.168.3.20' }] } } },
        { kind: 'handy', name: 'Handy 1', funk: 'Schul-WLAN', cfg: { software: ['browser'] } }] },
      { hosts: [{ kind: 'server', name: 'Webserver', ip: 20, cfg: { dns: ii8dns, software: ['webserver'], webServer: { on: true },
          dateien: {
            '/webserver': { ordner: true },
            '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
            '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
            '/webserver/mpskills-logo.png': { bild: '@drache' },
            '/webserver/synir-logo.png':    { bild: '@synir' }
          } } }] }
    ][i]
  });
  const ii8 = {
    titel: 'II.8 · Schichtenmodell', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Ein Netz, in dem alles läuft: drei Häuser im Dreieck, DHCP, DNS, WLAN und ein Webserver. Diesmal baust du nichts, '
        + 'sondern <strong>liest</strong>, was passiert, wenn jemand eine Seite aufruft.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schalte den <em>Mitschnitt</em> ein, leere ihn und ruf von <strong>E1</strong> im Browser <code>www.schule.de</code> auf. '
          + 'Lies die Zeilen von oben nach unten: Welche Protokolle kommen in welcher Reihenfolge vor?' },
        { typ: 'veraendern', text: 'Ordne <strong>jedes Protokoll</strong> aus deinem Mitschnitt einer Schicht zu (Hilfe unten). Schalte dann '
          + '<em>Geräte-Lerninformationen</em> ein und sieh nach, welche Schicht der Switch und welche der Router „liest“.' },
        { typ: 'erweitern', text: 'Zeichne dein eigenes Schichtendiagramm für <em>eine</em> Nachricht deiner Wahl (etwa die erste HTTP-Anfrage): wie sie beim '
          + 'Absender durch die Schichten <em>nach unten</em> läuft, jeweils mit einem Kopf mehr, und beim Empfänger <em>nach oben</em>.' }
      ],
      hilfe: [
        { begriff: 'Die Schichten', text: 'Von oben nach unten:', liste: [
          '<strong>Anwendung</strong> — HTTP, DNS, DHCP, SMTP: was Programme miteinander besprechen',
          '<strong>Transport</strong> — TCP und UDP: Ports, Verbindung, Reihenfolge',
          '<strong>Vermittlung</strong> — IP, ICMP: Adressen und der Weg durch mehrere Netze (Router)',
          '<strong>Sicherung</strong> — Ethernet, ARP, MAC-Adressen: der Weg im selben Netz (Switch)',
          '<strong>Bitübertragung</strong> — Kabel und Funk: die Signale selbst'
        ] },
        { begriff: 'Kopf (Header)', text: 'Jede Schicht packt vor die Daten der oberen Schicht ihren eigenen Kopf: Ports (Transport), IP-Adressen '
          + '(Vermittlung), MAC-Adressen (Sicherung). Der Empfänger packt sie in umgekehrter Reihenfolge wieder aus.' },
        WERKZEUG_MITSCHNITT, WERKZEUG_LERN
      ],
      stern: 'Welche Schichten sieht der Router nie an? Und warum kann der Switch nichts mit einer IP-Adresse anfangen?'
    }),
    netz: { v: 2, nodes: ii8netz.nodes, cables: ii8netz.cables }
  };

  /* ═══ 1. · DHCP-Spoofing (früher II.9) ══════════════════════════
     Ein öffentliches WLAN mit vier Geräten am selben Switch: ein
     echter, per Kabel angeschlossener DHCP-Server, zwei „normale"
     Endgeräte (E1, E2 — eines davon ein Handy) — und ein drittes
     Gerät (E3), das AUCH einen DHCP-Server anbietet, mit eigenem
     DNS-Eintrag für denselben Namen und einer eigenen, GLEICH
     AUSSEHENDEN Webseite. Jenseits eines Routers steht das echte
     Portal (eigener DNS- und Webserver) — das Netz funktioniert
     vollständig, nichts ist kaputt.

     ⚠️ Bewusst neutral benannt: E1, E2, E3 — keine „Opfer", kein
     „Angreifer". Vom Nutzer verlangt: das Netz soll harmlos
     aussehen, nicht wie eine Aufgabe über Hacking angekündigt
     werden. Die Klasse soll die Rollen selbst herausfinden.

     Der Lerneffekt entsteht aus dem Zufall, der in dienste.js
     absichtlich eingebaut ist (siehe dort: „bei zwei Servern …
     wessen OFFER zuerst ankommt und gewinnt"): jeder Wechsel nach
     <em>Aktion</em> vergibt neu, und manchmal gewinnt der echte
     Server, manchmal der andere. Deshalb sieht E1 mal die eine,
     mal die andere — optisch identische — Seite, ohne dass am Netz
     irgendjemand etwas verändert hat.

     Die Aufgabe nennt das Wort „Angriff" absichtlich nicht: Die
     Klasse soll erst beobachten, dann beschreiben, dann erläutern
     (die Operatoren aus dem Unterricht). Das Formularfeld auf der
     Seite ist reine Kulisse — dieser Simulator kennt kein POST
     (siehe Kopf von http.js), es gibt nichts, das eine Eingabe
     irgendwohin schicken könnte. Beide Seiten benutzen das Logo
     und den Namen des Projekts selbst (`@drache`) und keine echte
     Marke. */
  const spoofSeite =
    '<html>\n'
    + '  <head>\n'
    + '    <title>MPS-Portal — Anmeldung</title>\n'
    + '    <link rel="stylesheet" href="stil.css">\n'
    + '  </head>\n'
    + '  <body>\n'
    + '    <div class="kasten">\n'
    + '      <img src="logo.png" alt="MPS-Portal" class="logo">\n'
    + '      <h1>MPS-Portal</h1>\n'
    + '      <p class="u">Anmeldung</p>\n'
    + '      <label>Benutzername<input type="text" disabled placeholder="deinname"></label>\n'
    + '      <label>Kennwort<input type="password" disabled placeholder="••••••••"></label>\n'
    + '      <button disabled>Anmelden</button>\n'
    + '      <p class="hinweis">Die Felder sind hier ohne Funktion — es gibt in diesem Programm '
    + '        kein Formular, das etwas verschickt.</p>\n'
    + '    </div>\n'
    + '  </body>\n'
    + '</html>\n';
  const spoofStil =
    'body  { font-family: sans-serif; background: #eef1fb; color: #1e2536;\n'
    + '        margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }\n'
    + '.kasten { background: #fff; border-radius: 14px; padding: 32px 36px; width: 260px;\n'
    + '        box-shadow: 0 4px 24px rgba(30,37,54,.12); text-align: center; }\n'
    + '.logo { width: 64px; height: 64px; border-radius: 12px; }\n'
    + 'h1    { font-size: 20px; margin: 10px 0 2px; color: #2a3050; }\n'
    + '.u    { color: #6b7290; margin: 0 0 18px; font-size: 13px; }\n'
    + 'label { display: block; text-align: left; font-size: 12px; color: #555; margin: 10px 0 4px; }\n'
    + 'input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ccd; border-radius: 8px; }\n'
    + 'button{ width: 100%; margin-top: 16px; padding: 9px; border: 0; border-radius: 8px;\n'
    + '        background: #4a5fd9; color: #fff; font-weight: 600; }\n'
    + '.hinweis { font-size: 10.5px; color: #9aa; margin-top: 14px; }\n';
  const spoofDateien = () => ({
    '/webserver': { ordner: true },
    '/webserver/index.html': { text: spoofSeite },
    '/webserver/stil.css':   { text: spoofStil },
    '/webserver/logo.png':   { bild: '@drache' }
  });

  /* ⚠️ Der Schlüssel bleibt `ii9`, obwohl das Szenario jetzt unter
     „Andere“ steht: die ID `builtin:ii9` steht in Räumen, in denen
     die Lehrkraft es schon geteilt hat. Ein neuer Schlüssel ließe
     die Freigabe ins Leere zeigen. */
  macN = 2300; cabN = 2300;
  const ii9 = {
    titel: '1. DHCP-Spoofing', gruppe: ANDERE,
    aufgabe: auftrag({
      kontext: 'Ein <strong>öffentliches WLAN</strong> — vier Geräte hängen am selben Switch, eines per Kabel, drei über Funk (<strong>E1</strong>, '
        + '<strong>E2</strong>, <strong>E3</strong>). Dazu, über einen Router, ein zweites Netz mit dem <strong>DNS-Server</strong> und dem '
        + '<strong>Webserver</strong> des „MPS-Portals". Das Netz ist vollständig eingerichtet — nichts fehlt, nichts ist abgeschaltet. Die drei '
        + 'WLAN-Geräte holen sich ihre Adresse per <strong>DHCP</strong>.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schalte mehrmals hintereinander zwischen <em>Entwurf</em> und <em>Aktion</em> hin und her (immer ein paar Sekunden warten). '
          + 'Öffne nach jedem Wechsel die Fenster von <strong>E1</strong> und <strong>E2</strong>: Welche IP-Adresse, welches Gateway, welcher '
          + 'DNS-Server steht dort?' },
        { typ: 'benutzen', text: 'Ruf nach jedem Wechsel im Browser von <strong>E1</strong> <code>portal.schule.de</code> auf. Sieht die Seite immer gleich aus? '
          + 'Prüfe genau: Titel, Logo, Text.' },
        { typ: 'veraendern', text: 'Öffne den <em>Mitschnitt</em>, leere ihn und ruf die Seite bei E1 noch einmal auf: '
          + '<strong>Verfolge den Weg der Pakete</strong> — wer fragt, wer antwortet, in welcher Reihenfolge? <strong>Beschreibe</strong>, was du siehst. '
          + 'Schau dir dazu auch die Geräte am Switch genau an: Gibt es dort etwas, das es eigentlich nur <em>einmal</em> geben sollte? Vergleiche die '
          + 'Gerätefenster von „DHCP-Server" und <strong>E3</strong> genau — auch dort, wo du zuerst nicht hinschaust (DHCP-Server-Einrichtung, '
          + 'DNS-Einträge). <strong>Erläutere</strong>, was hier passieren könnte.' }
      ],
      hilfe: [
        { begriff: 'DHCP', text: 'Ein Dienst, der Geräten automatisch eine Adresse zuteilt. Ein Gerät fragt beim Start ins Netz hinein, ohne zu wissen, '
          + '<em>wer genau</em> antwortet — es nimmt die erste Antwort, die ankommt.' },
        { begriff: 'DNS', text: 'Übersetzt einen Namen (<code>portal.schule.de</code>) in eine Adresse. Welcher DNS-Server gefragt wird, steht im '
          + 'Gerätefenster — und diese Angabe kommt bei DHCP-Geräten automatisch mit.' },
        { begriff: 'Zwei Server, eine Frage', text: 'Was passiert, wenn im selben Netz <em>zwei</em> Geräte auf dieselbe Anfrage antworten können? '
          + 'Woher weiß das fragende Gerät, welche Antwort die „richtige" ist?' },
        WERKZEUG_MITSCHNITT, WERKZEUG_LERN
      ],
      stern: 'Wie könnte man dafür sorgen, dass in einem Netz nur ein bestimmtes, bekanntes Gerät auf DHCP-Anfragen antworten darf? '
        + 'Recherchiere den Begriff <em>DHCP-Snooping</em>.'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('g1', 'switch', 'Switch 1', 700, 400, { ports: 6, wlan: { on: true, ssid: 'Frei-WLAN' } }),
        dev('g2', 'server', 'DHCP-Server', 470, 260, {
          nics: [{ ip: '192.168.1.5' }], gateway: '192.168.1.1', dns: '192.168.2.10',
          dhcpServer: { von: '192.168.1.100', bis: '192.168.1.150', mask: '255.255.255.0',
                        gateway: '192.168.1.1', dns: '192.168.2.10' }
        }),
        dev('g3', 'host', 'E1', 470, 560, { nics: [{ dhcp: true, funk: true, ssid: 'Frei-WLAN' }], software: ['browser'] }),
        dev('g4', 'handy', 'E2', 930, 560, { nics: [{ dhcp: true, funk: true, ssid: 'Frei-WLAN' }], software: ['browser'] }),
        dev('g5', 'host', 'E3', 930, 260, {
          nics: [{ ip: '192.168.1.6', funk: true, ssid: 'Frei-WLAN' }], gateway: '192.168.1.1', dns: '192.168.1.6',
          software: ['dns', 'webserver'], webServer: { on: true },
          dhcpServer: { von: '192.168.1.200', bis: '192.168.1.210', mask: '255.255.255.0',
                        gateway: '192.168.1.1', dns: '192.168.1.6' },
          dnsServer: { records: [{ name: 'portal.schule.de', ip: '192.168.1.6' }] },
          dateien: spoofDateien()
        }),
        dev('g6', 'router', 'Router 1', 700, 660, { nics: [{ ip: '192.168.1.1' }, { ip: '192.168.2.1' }] }),
        dev('g7', 'switch', 'Switch 2', 700, 800, { ports: 4 }),
        dev('g8', 'server', 'DNS-Server', 520, 880, {
          nics: [{ ip: '192.168.2.10' }], gateway: '192.168.2.1', dns: '192.168.2.10',
          software: ['dns'], dnsServer: { records: [{ name: 'portal.schule.de', ip: '192.168.2.20' }] }
        }),
        dev('g9', 'server', 'Webserver', 880, 880, {
          nics: [{ ip: '192.168.2.20' }], gateway: '192.168.2.1', dns: '192.168.2.10',
          software: ['webserver'], webServer: { on: true }, dateien: spoofDateien()
        })
      ],
      cables: [
        cab('g2', 0, 'g1', 0), cab('g1', 1, 'g6', 0),
        cab('g6', 1, 'g7', 0), cab('g7', 1, 'g8', 0), cab('g7', 2, 'g9', 0)
      ]
    }
  };

  /* ═══ 2. · Der Handschlag ═══════════════════════════════════════
     Drei Geräte an einem Switch, ein Netz, kein Router, kein DNS,
     kein DHCP. Das ist Absicht: im Mitschnitt soll vor den drei
     TCP-Zeilen nur ARP stehen, damit der Handschlag nicht zwischen
     DNS-Fragen und DHCP-Rundrufen verschwindet. Die Seite des
     Webservers hat KEIN Bild und KEIN Stylesheet — jedes davon wäre
     eine eigene Verbindung (http.js holt erst das HTML, dann alles,
     was darin steht), und aus einem Handschlag würden drei.

     Der „Mailserver“ ist ein Server, auf dem nichts läuft: auf
     Port 80 hört niemand, also kommt sofort ein RST zurück
     (tcp.js, Punkt 4 im Kopf). Der Name ist die Falle — ein Rechner
     heißt, wie er will; ob dort ein Webserver hört, sagt `netstat`.

     Der Paketverlust (Aufgabe 5) sitzt auf dem Kabel Switch –
     Webserver. Höchstens 50 %: bei einem verlorenen SYN wiederholt
     TCP genau einmal (TCP_WIEDER), dann gibt der Browser auf — auch
     das ist eine Beobachtung und kein Fehler. */
  const hsSeite =
    '<html>\n'
    + '  <head><title>Hallo</title></head>\n'
    + '  <body>\n'
    + '    <h1>Verbunden!</h1>\n'
    + '    <p>Bevor du diesen Satz lesen konntest, haben dein Gerät und der Webserver\n'
    + '       sich dreimal etwas zugerufen. Schau in den Mitschnitt.</p>\n'
    + '  </body>\n'
    + '</html>\n';

  macN = 2400; cabN = 2400;
  const handschlag = {
    titel: '2. Der Handschlag', gruppe: ANDERE,
    aufgabe: auftrag({
      kontext: 'Bevor zwei Rechner Daten austauschen, vergewissern sie sich — wie am Telefon: <em>„Hallo, hörst du mich?“ – '
        + '„Ja, ich höre dich. Hörst du mich auch?“ – „Ja.“</em> Erst dann wird geredet. Bei <strong>TCP</strong> heißt das '
        + '<strong>Dreiwege-Handschlag</strong>. Das Netz ist fertig: <strong>Anna</strong> (E1), ein <strong>Webserver</strong> (S1) und ein '
        + '<strong>Mailserver</strong> (S2) an einem Switch. Auf dem Feld stehen die Kürzel, im Gerätefenster die Namen.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schalte auf <em>Aktion</em>, öffne den <em>Mitschnitt</em>, leere ihn und stell das <strong>Tempo</strong> auf '
          + '<em>Zeitlupe</em>. Tippe <strong>Anna (E1)</strong> an — der Mitschnitt zeigt dann nur noch ihre Nachrichten (↑ gesendet, ↓ empfangen). '
          + 'Ruf bei Anna im Browser <code>192.168.1.20</code> auf. Schreib die ersten drei '
          + '<strong>TCP</strong>-Zeilen ab: Wer schickt an wen? Welche Flags stehen in den Klammern? Welche Zahlen stehen bei '
          + '<em>Seq</em> und <em>Ack</em>? Wie viele Nachrichten fliegen, bevor das erste Byte der Webseite unterwegs ist?' },
        { typ: 'benutzen', text: '<strong>Rechne nach:</strong> Wie hängt das <em>Ack</em> der zweiten Zeile mit der <em>Seq</em> der ersten zusammen — '
          + 'und das <em>Ack</em> der dritten mit der <em>Seq</em> der zweiten? Sag dann <strong>vorher</strong>, welche Seq die HTTP-Anfrage '
          + '(<code>GET /</code>) tragen wird, und prüfe es im Mitschnitt.' },
        { typ: 'benutzen', text: 'Leere den Mitschnitt und ruf die Seite noch einmal auf — diesmal <strong>Schritt für Schritt</strong>: '
          + 'Leertaste hält die Uhr an, der <strong>Punkt</strong> macht einen Einzelschritt. Gib zwischendurch im Terminal von Anna und '
          + 'vom Webserver <code>netstat</code> ein. Welchen <em>Zustand</em> hat die Verbindung nach dem SYN, welchen nach dem letzten ACK?' },
        { typ: 'veraendern', text: 'Ruf bei Anna jetzt <code>192.168.1.30</code> auf, den <strong>Mailserver (S2)</strong>. Was kommt statt '
          + '<em>SYN, ACK</em> zurück — und wie schnell? Gib am Mailserver <code>netstat</code> ein und erkläre, was du siehst.' },
        { typ: 'veraendern', text: 'Tippe auf das <strong>Kabel zwischen Switch und Webserver (S1)</strong> und stell den <em>Paketverlust</em> auf '
          + '<strong>50 %</strong>. Ruf die Seite mehrmals auf. Wann steht ein <strong>SYN zweimal</strong> im Mitschnitt? Warum wartet Anna, '
          + 'bevor sie es noch einmal schickt — und was passiert, wenn auch das zweite verloren geht?' },
        { typ: 'erweitern', text: 'Stell den Paketverlust wieder auf 0 %. Such am Ende einer Übertragung den <strong>Abbau</strong> der Verbindung '
          + '(Zeilen mit <em>FIN</em>). Zeichne Aufbau und Abbau als <strong>Pfeildiagramm</strong>: Anna links, Webserver rechts, die Zeit '
          + 'läuft nach unten, jeder Pfeil mit Flags, Seq und Ack.' }
      ],
      hilfe: [
        { begriff: 'Die Flags', text: 'Kurze Kennzeichen im TCP-Kopf. Sie behalten ihre englischen Namen:', liste: [
          '<strong>SYN</strong> — „synchronisieren“: Ich möchte eine Verbindung und fange bei dieser Nummer an zu zählen.',
          '<strong>ACK</strong> — „bestätigt“: Bis hierhin habe ich alles bekommen.',
          '<strong>FIN</strong> — „fertig“: Ich habe nichts mehr zu sagen.',
          '<strong>RST</strong> — „zurücksetzen“: Abgelehnt, hier ist niemand.'
        ] },
        { begriff: 'Seq und Ack', text: '<em>Seq</em> (Sequenznummer) zählt die Bytes, die ein Gerät schickt. Die Startzahl wird '
          + 'ausgewürfelt. <em>Ack</em> sagt der Gegenseite: „Als Nächstes erwarte ich diese Nummer.“ Ein SYN und ein FIN zählen dabei '
          + 'wie <strong>ein</strong> Byte, obwohl sie keine Daten tragen.' },
        { begriff: 'Port', text: 'Die Adresse bringt ein Paket zum Rechner, der <strong>Port</strong> zum Programm: 80 ist der Webserver. '
          + 'Der Browser bekommt für jede Verbindung eine zufällige Nummer ab 49152.' },
        { begriff: 'netstat', text: 'Ein Befehl im Terminal. Er zeigt, welches Programm auf welchem Port hört und in welchem '
          + '<em>Zustand</em> eine Verbindung gerade ist.' },
        { begriff: 'Werkzeug: Mitschnitt', text: 'Menü <em>Ansicht &amp; Tools → Mitschnitt</em> (sichtbar im Modus Aktion). Mit dem Filter '
          + '<strong>TCP</strong> oben siehst du nur Aufbau, Bestätigungen und Abbau; die Webseite selbst steht unter <strong>HTTP</strong>. '
          + 'Ohne gewähltes Gerät steht jede Nachricht zweimal da: einmal vom Absender, einmal vom Switch, der sie weitergibt. '
          + 'Ein hohler Punkt auf dem Kabel trägt keine Daten (Handschlag), ein gefüllter schon. Vor dem ersten SYN fragt Anna per '
          + '<strong>ARP</strong> nach der MAC-Adresse des Webservers.' }
      ],
      stern: 'Warum reichen für den Aufbau <strong>drei</strong> Nachrichten, für den Abbau braucht es aber <strong>vier</strong>? '
        + 'Und was würde schiefgehen, wenn man den Handschlag weglässt und gleich die Daten schickt?'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('h1', 'host',   'Anna',       520, 480, { nics: [{ ip: '192.168.1.10' }], software: ['browser'] }),
        dev('h2', 'switch', 'Switch 1',   800, 480, { ports: 4 }),
        dev('h3', 'server', 'Webserver', 1080, 360, {
          nics: [{ ip: '192.168.1.20' }], software: ['webserver'], webServer: { on: true },
          dateien: { '/webserver': { ordner: true }, '/webserver/index.html': { text: hsSeite } }
        }),
        dev('h4', 'server', 'Mailserver', 1080, 620, { nics: [{ ip: '192.168.1.30' }] })
      ],
      cables: [
        cab('h1', 0, 'h2', 0), cab('h2', 1, 'h3', 0), cab('h2', 2, 'h4', 0)
      ]
    }
  };


  /* ═══ 3. · Das große Netz ═══════════════════════════════════════
     Das Schaufenster: alles, was SYNIR kann, in einem einzigen,
     fertig eingerichteten Netz — zum Vorführen und zum Testen, damit
     niemand erst eine Stunde einrichten muss. Neue Funktionen
     kommen hier dazu, wenn es sie gibt.

     ── Der Plan ──────────────────────────────────────────────────
     Sechs Router in einem Teilgitter (Ring plus Querverbindungen,
     fällt ein Kabel aus, geht es auf anderen Wegen weiter), das cww
     an zwei Routern. Die Router lernen die Wege selbst (RIP).

       Verbindung        50.0.10x.0   (Router .1 / .2, nach Nummer)
       cww – Router      50.0.110.0 und 50.0.111.0
       Büro (Router 4)   50.0.4.0     Geräte per DHCP, Lehrer-PC fest
       Serverraum (R5)   50.0.5.0     alles feste Adressen
       Anbieter (R6)     50.0.6.0     DHCP für die zwei Heimrouter
       Heimnetz 1        192.168.1.0  Heimrouter 1, Webseite mit Portfreigabe
       Heimnetz 2        192.168.2.0  Heimrouter 2
       Internat (FW)     50.0.7.0     hinter dem Firewall-Router (an Router 4, 50.0.108.0)

     ⚠️ Kein kürzester Weg zwischen zwei Netzen mit Geräten darf durch
     das cww führen. Im Raum hat das cww einen eigenen Bereich und
     schickt alles mit 50.… hinaus ins Klassen-Internet — dort kommt es
     nie an. Am Anfang hing der Firewall-Router an Router 1; der Weg
     zum VPN-Server lief dann über das cww, und im Raum ging kein
     Tunnel (auch nicht ohne Firewall). Deshalb hängt er an Router 4.

     ── Sicherheit (seit 2026-10-02) ──────────────────────────────
       · ZS „MPS-Zertifizierungsstelle" im Serverraum. Zertifikate
         haben das Schulportal, der Mailserver, Filmwelt und der
         VPN-Server. Ihr vertrauen Laptop 1, der Lehrer-PC und
         Laptop 5 — alle anderen sehen die Warnung (gewollt).
       · MPSflix bleibt bei HTTP (Klartext zum Mitlesen), Filmwelt
         spricht HTTPS. Anna holt ihre Post verschlüsselt (995/465),
         Ben, Carla und Frau Meier im Klartext.
       · Mitlesen: das „Lauscher-Handy 5" ist Gast im MPS-WLAN, wie Handy 1
         (Carla). Funk ist ein gemeinsames Medium.
       · Der Firewall-Router sperrt mpsflix.de und filmwelt.de (Namen,
         Blacklist, ablehnen) — in beide Richtungen. Der VPN-Server
         steht beim Anbieter, also außerhalb: Laptop 5 kommt durch
         den Tunnel trotzdem an die Filme.

     ⚠️ Schlüssel und Zertifikate stehen als feste Zahlen da (gr.zs …):
     ein Szenario ist reine Datei. Erzeugt mit Tls.Krypto.schluesselpaar
     und zertAusstellen; kerntest prüft, dass die Unterschriften passen.

     ⚠️ Alle öffentlichen Adressen beginnen mit 50. — das ist der
     Bereich des Übungsnetzes (ohne Raum). Wer im Raum einen anderen
     Bereich hat, ersetzt überall die 50 durch seine Zahl. Deshalb
     gibt es keine einzige Adresse, die sich nicht aus 50.0.x.y
     ergibt, und die Heimnetze bleiben ohnehin privat.

     Zwei Dinge sind Absicht und stehen im Auftrag:
       · Heimrouter 1 bekommt vom Anbieter immer 50.0.6.10 (feste
         Zuweisung über die MAC-Adresse) — sonst wüsste der DNS-Eintrag
         der Heimseite nach einem Neustart nicht mehr, wohin.
       · Der Streaming-Server und der Webserver wollen beide Port 80.
         Deshalb haben sie zwei Geräte. */
  const grPraefix = '50.0.';
  const grMacHeim1 = '02:00:5e:77:00:01';
  const grMacAnna  = '02:00:5e:77:00:02';
  const grDns = grPraefix + '5.53';

  /* Die Schlüssel der Zertifizierungsstelle und der vier Server (siehe
     oben). `zert(…)` baut den Block `zertifikat` eines Servers, `zsAntrag`
     den passenden, schon freigegebenen Antrag in der Liste der ZS. */
  const grZsName = 'MPS-Zertifizierungsstelle';
  const grZsFp = '05CB-B162-75D9-3CA6';
  const grZsIp = grPraefix + '5.70';
  const grZsSchluessel = { n: '288269120251829929', e: '65537', d: '90826083615466853' };
  const grSrv = {
    'www.mps-schule.de':  { nr: 1, ip: grPraefix + '5.80', n: '288258361567365841', d: '41279044100770133',  sig: '102708927624405023' },
    'mail.mps-schule.de': { nr: 2, ip: grPraefix + '5.25', n: '288302475605153473', d: '138377445395057153', sig: '85570679175775247' },
    'filmwelt.de':        { nr: 3, ip: grPraefix + '5.91', n: '288265354492591423', d: '127270976718075713', sig: '177034002708165979' },
    'vpn.tunnelfix.de':   { nr: 4, ip: grPraefix + '6.20', n: '288305703685788193', d: '127442760649204553', sig: '193763399872954656' }
  };
  const grZertVon = (name) => {
    const s = grSrv[name];
    return { nr: s.nr, name: name, besitzer: { n: s.n, e: '65537' },
             aussteller: grZsName, ausstellerFp: grZsFp, signatur: s.sig };
  };
  const grZert = (name) => ({
    name: name, zs: grZsIp, schluessel: { n: grSrv[name].n, e: '65537', d: grSrv[name].d },
    zert: grZertVon(name),
    antrag: { nr: grSrv[name].nr, zs: grZsIp, name: name, status: 'ausgestellt', grund: '' }
  });
  /* = NetUtil.pseudoHash('Tunnel2026'); der VPN-Server speichert nur den Hash. */
  const grPwLena = '7b11dd76a2c88b86';

  const grVertrauen = [{ name: grZsName, n: grZsSchluessel.n, e: grZsSchluessel.e, fp: grZsFp }];

  const grStilSchule =
    'body { margin: 0; font-family: sans-serif; background: #eef3fb; color: #1e2536; }\n'
    + 'header { background: #1b2a5c; color: #fff; padding: 22px 28px; }\n'
    + 'header img { height: 54px; vertical-align: middle; margin-right: 14px; }\n'
    + 'header h1 { display: inline; font-size: 26px; vertical-align: middle; }\n'
    + 'main { max-width: 640px; margin: 24px auto; padding: 0 20px; }\n'
    + '.kachel { background: #fff; border-left: 6px solid #2ad0c9; border-radius: 10px;\n'
    + '          padding: 14px 20px; margin-bottom: 14px; }\n'
    + 'h2 { color: #1b2a5c; margin: 0 0 6px; }\n'
    + 'footer { text-align: center; color: #6b7488; font-size: 13px; padding: 18px; }\n';
  const grSeiteSchule =
    '<html>\n'
    + '  <head>\n'
    + '    <title>MPS Schulportal</title>\n'
    + '    <link rel="stylesheet" href="stil.css">\n'
    + '  </head>\n'
    + '  <body>\n'
    + '    <header>\n'
    + '      <img src="mpskills-logo.png" alt="MPSkills">\n'
    + '      <h1>MPS Schulportal</h1>\n'
    + '    </header>\n'
    + '    <main>\n'
    + '      <div class="kachel"><h2>Willkommen</h2>\n'
    + '        <p>Die Webseite der Schule. Sie liegt auf dem <b>Webserver</b> im Serverraum '
    + '(feste Adresse 50.0.5.80), und du hast sie über den Namen <b>www.mps-schule.de</b> gefunden.</p></div>\n'
    + '      <div class="kachel"><h2>Aktuelles</h2>\n'
    + '        <p>Tablet-Schulung für alle Klassen. Ein Konto für den Schulserver bekommst du bei Frau Meier.</p></div>\n'
    + '      <div class="kachel"><h2>Auch im Netz</h2>\n'
    + '        <p>Filme gibt es bei <b>mpsflix.de</b>, die Heimseite der Familie unter <b>www.heimseite.de</b>.</p></div>\n'
    + '    </main>\n'
    + '    <footer>Schulportal · Serverraum · Router 5</footer>\n'
    + '  </body>\n'
    + '</html>\n';

  const grStilHeim =
    'body { margin: 0; font-family: Georgia, serif; background: #fff4e0; color: #4a3320; text-align: center; }\n'
    + 'h1 { font-size: 40px; color: #c2410c; margin: 36px 0 4px; }\n'
    + '.unter { color: #9a6b3d; font-style: italic; margin-bottom: 28px; }\n'
    + '.zettel { display: inline-block; width: 280px; margin: 10px; padding: 18px; vertical-align: top;\n'
    + '          background: #fffdf7; border: 2px dashed #e0a458; border-radius: 4px; }\n'
    + '.zettel h2 { color: #c2410c; margin-top: 0; }\n'
    + 'p.fuss { margin-top: 30px; font-size: 13px; color: #9a6b3d; }\n';
  const grSeiteHeim =
    '<html>\n'
    + '  <head>\n'
    + '    <title>Familie Beispiel</title>\n'
    + '    <link rel="stylesheet" href="stil.css">\n'
    + '  </head>\n'
    + '  <body>\n'
    + '    <h1>Familie Beispiel</h1>\n'
    + '    <div class="unter">Unsere kleine Seite — gehostet im Wohnzimmer</div>\n'
    + '    <div class="zettel"><h2>Omas Rezepte</h2>\n'
    + '      <p>Pfannkuchen, Rübenkraut und der berühmte Apfelkuchen.</p></div>\n'
    + '    <div class="zettel"><h2>Urlaubsfotos</h2>\n'
    + '      <p>Dieses Jahr: Ostsee. Bilder folgen, sobald der Drucker wieder geht.</p></div>\n'
    + '    <p class="fuss">Diese Seite liegt hinter einem Heimrouter. Von draußen kommt man nur '
    + 'hierher, weil am Router der Port 80 freigegeben ist (192.168.1.20).</p>\n'
    + '  </body>\n'
    + '</html>\n';

  const grMailAnna = [
    { von: 'frau.meier@mps-schule.de', an: 'anna@mps-schule.de', betreff: 'Willkommen im Schulnetz',
      text: 'Hallo Anna,\nschön, dass du dabei bist. Dein Postfach liegt auf dem Mailserver im Serverraum.\nViele Grüße\nFrau Meier', zeit: 0 },
    { von: 'ben@mps-schule.de', an: 'anna@mps-schule.de', betreff: 'Hausaufgaben',
      text: 'Hi Anna,\nweißt du, bis wann wir das Netzwerkblatt abgeben müssen?\nBen', zeit: 0 },
    { von: 'service@mpsflix.de', an: 'anna@mps-schule.de', betreff: 'Willkommen bei MPSflix',
      text: 'Hallo Anna,\nwillkommen bei MPSflix!\nDein Passwort: Fuchs42\nMelde dich mit deiner E-Mail-Adresse und diesem Passwort an.', zeit: 0 }
  ];
  const grKonto = (name, benutzer, passwort, posteingang) => ({
    name: name, adresse: benutzer + '@mps-schule.de', domain: 'mps-schule.de',
    pop3: 'mail.mps-schule.de', pop3Port: 110, smtp: 'mail.mps-schule.de', smtpPort: 25,
    benutzer: benutzer, passwort: passwort, angemeldet: false,
    posteingang: posteingang || [], gesendet: []
  });

  macN = 2500; cabN = 2500;
  const grHeim1 = dev('n21', 'heimrouter', 'Heimrouter 1', 1800, 1000, {
    ports: 9, nics: [{ dhcp: true }, { ip: '192.168.1.1' }], wlan: { on: true, ssid: 'Heim-WLAN' },
    dhcpServer: { nic: 1, von: '192.168.1.100', bis: '192.168.1.150', mask: '255.255.255.0',
                  gateway: '192.168.1.1', dns: grDns },
    nat: { on: true, frei: [{ proto: 'tcp', port: 80, lanIp: '192.168.1.20', lanPort: 80 }] }
  });
  grHeim1.nics[0].mac = grMacHeim1;
  const grAnna = dev('n12', 'host', 'Laptop 1', 480, 1100, {
    nics: [{ dhcp: true }], software: ['browser', 'mail'], vertrauen: grVertrauen,
    mailKonto: Object.assign(grKonto('Anna', 'anna', 'Sonne2026', grMailAnna), { tls: true, pop3Port: 995, smtpPort: 465 })
  });
  grAnna.nics[0].mac = grMacAnna;

  const grNetz = {
    v: 2,
    nodes: [
      // Das Class Wide Web: Karte 0 = Internet, Karten 1 und 2 zu Router 1 und Router 3
      dev('n0', 'cww', 'Class Wide Web 1', 1200, 230, {
        ports: 3, rip: true, nics: [{}, { ip: grPraefix + '110.1' }, { ip: grPraefix + '111.1' }]
      }),
      // Sechs Router, Teilgitter
      dev('n1', 'router', 'Router 1', 780, 420, { ports: 3, rip: true,
        nics: [{ ip: grPraefix + '110.2' }, { ip: grPraefix + '101.1' }, { ip: grPraefix + '103.1' }] }),
      dev('n2', 'router', 'Router 2', 1200, 560, { ports: 3, rip: true,
        nics: [{ ip: grPraefix + '101.2' }, { ip: grPraefix + '102.1' }, { ip: grPraefix + '104.1' }] }),
      dev('n3', 'router', 'Router 3', 1620, 420, { ports: 3, rip: true,
        nics: [{ ip: grPraefix + '111.2' }, { ip: grPraefix + '102.2' }, { ip: grPraefix + '105.1' }] }),
      dev('n4', 'router', 'Router 4', 780, 800, { ports: 4, rip: true,
        nics: [{ ip: grPraefix + '103.2' }, { ip: grPraefix + '106.1' }, { ip: grPraefix + '4.1' }, { ip: grPraefix + '108.1' }] }),
      dev('n5', 'router', 'Router 5', 1200, 880, { ports: 4, rip: true,
        nics: [{ ip: grPraefix + '104.2' }, { ip: grPraefix + '106.2' }, { ip: grPraefix + '107.1' }, { ip: grPraefix + '5.1' }] }),
      dev('n6', 'router', 'Router 6', 1620, 800, { ports: 3, rip: true,
        nics: [{ ip: grPraefix + '105.2' }, { ip: grPraefix + '107.2' }, { ip: grPraefix + '6.1' }] }),

      // Büro: Geräte holen sich ihre Adresse (Anna: reserviert), der Lehrer-PC ist fest
      dev('n7', 'switch', 'Switch 1', 540, 900, { ports: 6, wlan: { on: true, ssid: 'MPS-WLAN' } }),
      dev('n8', 'server', 'DHCP-Server', 300, 820, {
        nics: [{ ip: grPraefix + '4.5' }], gateway: grPraefix + '4.1', dns: grDns,
        dhcpServer: { von: grPraefix + '4.100', bis: grPraefix + '4.150', mask: '255.255.255.0',
                      gateway: grPraefix + '4.1', dns: grDns,
                      statisch: [{ mac: grMacAnna, ip: grPraefix + '4.50' }] }
      }),
      dev('n9', 'host', 'Lehrer-PC', 300, 1000, {
        nics: [{ ip: grPraefix + '4.10' }], gateway: grPraefix + '4.1', dns: grDns,
        software: ['browser', 'mail'], vertrauen: grVertrauen,
        mailKonto: grKonto('Frau Meier', 'frau.meier', 'Komet2026')
      }),
      grAnna,
      dev('n13', 'host', 'Laptop 2', 680, 1100, {
        nics: [{ dhcp: true }], software: ['browser', 'mail'],
        mailKonto: grKonto('Ben', 'ben', 'Mond2026')
      }),
      dev('n14', 'handy', 'Handy 1', 880, 1060, {
        nics: [{ dhcp: true, funk: true, ssid: 'MPS-WLAN' }], software: ['browser', 'mail'],
        mailKonto: grKonto('Carla', 'carla', 'Blume2026')
      }),
      // Die Stelle zum Mitlesen: ein Gast im selben Funknetz wie Carla
      dev('n29', 'handy', 'Lauscher-Handy 5', 560, 1250, {
        nics: [{ dhcp: true, funk: true, ssid: 'MPS-WLAN' }], software: ['browser']
      }),

      // Serverraum: alles feste Adressen
      dev('n15', 'switch', 'Switch 2', 1200, 1080, { ports: 8 }),
      dev('n16', 'server', 'DNS-Server', 880, 1280, {
        nics: [{ ip: grDns }], gateway: grPraefix + '5.1', dns: grDns, software: ['dns'],
        dnsServer: {
          records: [
            { name: 'www.mps-schule.de',  ip: grPraefix + '5.80' },
            { name: 'mail.mps-schule.de', ip: grPraefix + '5.25' },
            { name: 'dns.mps-schule.de',  ip: grDns },
            { name: 'mpsflix.de',         ip: grPraefix + '5.90' },
            { name: 'www.mpsflix.de',     ip: grPraefix + '5.90' },
            { name: 'www.heimseite.de',   ip: grPraefix + '6.10' },
            { name: 'filmwelt.de',        ip: grPraefix + '5.91' },
            { name: 'zs.mps-schule.de',   ip: grZsIp },
            { name: 'vpn.tunnelfix.de',   ip: grPraefix + '6.20' }
          ],
          mx: [{ domain: 'mps-schule.de', server: 'mail.mps-schule.de' }]
        }
      }),
      dev('n17', 'server', 'Webserver Schule', 1090, 1330, {
        nics: [{ ip: grPraefix + '5.80' }], gateway: grPraefix + '5.1', dns: grDns, software: ['webserver'],
        webServer: { on: true, https: true }, zertifikat: grZert('www.mps-schule.de'),
        dateien: {
          '/webserver': { ordner: true },
          '/webserver/index.html': { text: grSeiteSchule },
          '/webserver/stil.css': { text: grStilSchule },
          '/webserver/mpskills-logo.png': { bild: '@drache' }
        }
      }),
      dev('n18', 'server', 'Mailserver', 1310, 1330, {
        nics: [{ ip: grPraefix + '5.25' }], gateway: grPraefix + '5.1', dns: grDns, software: ['mailserver'],
        zertifikat: grZert('mail.mps-schule.de'),
        mailServer: {
          domain: 'mps-schule.de', https: true,
          konten: [
            { benutzer: 'carla', passwort: 'Blume2026', posteingang: [
              { von: 'frau.meier@mps-schule.de', an: 'carla@mps-schule.de', betreff: 'Dein Schulkonto',
                text: 'Hallo Carla,\ndein Postfach ist eingerichtet. Ruf es ruhig auch unterwegs über das WLAN ab.\nFrau Meier', zeit: 0 }
            ] },
            { benutzer: 'anna', passwort: 'Sonne2026', posteingang: [] },
            { benutzer: 'ben', passwort: 'Mond2026', posteingang: [
              { von: 'anna@mps-schule.de', an: 'ben@mps-schule.de', betreff: 'Re: Hausaufgaben',
                text: 'Hi Ben,\nFreitag, glaube ich. Frag Frau Meier lieber noch einmal.\nAnna', zeit: 0 },
              { von: 'frau.meier@mps-schule.de', an: 'ben@mps-schule.de', betreff: 'Netzwerkblatt',
                text: 'Hallo Ben,\ndas Arbeitsblatt zum Netzwerk liegt im Schulportal (www.mps-schule.de).\nFrau Meier', zeit: 0 }
            ] },
            { benutzer: 'frau.meier', passwort: 'Komet2026', posteingang: [
              { von: 'ben@mps-schule.de', an: 'frau.meier@mps-schule.de', betreff: 'Frage zur Abgabe',
                text: 'Guten Tag Frau Meier,\nbis wann muss das Netzwerkblatt fertig sein?\nBen', zeit: 0 }
            ] }
          ]
        }
      }),
      dev('n19', 'server', 'MPSflix', 1520, 1280, {
        nics: [{ ip: grPraefix + '5.90' }], gateway: grPraefix + '5.1', dns: grDns, software: ['streamingserver'],
        streamServer: {
          name: 'MPSflix', mailserver: 'mail.mps-schule.de', filme: [1, 2],
          konten: [{ name: 'Anna', email: 'anna@mps-schule.de', iban: 'DE02 1203 0000 0000 2020 51',
                     bic: 'BYLADEM1001', passwort: 'Fuchs42' },
                   { name: 'Lena', email: 'lena@mps-schule.de', iban: 'DE89 3704 0044 0532 0130 00',
                     bic: 'COBADEFFXXX', passwort: 'Kino55' }]
        }
      }),
      // Der zweite Streaming-Dienst: HTTPS mit Zertifikat
      dev('n30', 'server', 'Filmwelt', 1430, 1470, {
        nics: [{ ip: grPraefix + '5.91' }], gateway: grPraefix + '5.1', dns: grDns, software: ['streamingserver'],
        zertifikat: grZert('filmwelt.de'),
        streamServer: {
          name: 'Filmwelt', mailserver: 'mail.mps-schule.de', filme: [3, 4], farbe: 'ozean', https: true,
          konten: [{ name: 'Lena', email: 'lena@mps-schule.de', iban: 'DE89 3704 0044 0532 0130 00',
                     bic: 'COBADEFFXXX', passwort: 'Popcorn9' }]
        }
      }),
      // Die Zertifizierungsstelle: hat die vier Zertifikate oben schon ausgestellt
      dev('n31', 'server', 'Zertifizierungsstelle', 980, 1470, {
        nics: [{ ip: grZsIp }], gateway: grPraefix + '5.1', dns: grDns, software: ['zertstelle'],
        zsServer: {
          on: true, name: grZsName, dns: grDns, schluessel: grZsSchluessel, serial: 5,
          antraege: Object.keys(grSrv).map(name => ({
            nr: grSrv[name].nr, name: name, n: grSrv[name].n, e: '65537',
            status: 'freigegeben', grund: '', ip: grSrv[name].ip, zert: grZertVon(name)
          }))
        }
      }),

      // Anbieter: verteilt die Adressen für die Heimrouter, Heimrouter 1 immer dieselbe
      dev('n20', 'switch', 'Switch 3', 1900, 780, { ports: 5 }),
      dev('n22', 'server', 'Anbieter-DHCP', 1900, 580, {
        nics: [{ ip: grPraefix + '6.5' }], gateway: grPraefix + '6.1', dns: grDns,
        dhcpServer: { von: grPraefix + '6.100', bis: grPraefix + '6.150', mask: '255.255.255.0',
                      gateway: grPraefix + '6.1', dns: grDns,
                      statisch: [{ mac: grMacHeim1, ip: grPraefix + '6.10' }] }
      }),
      // Der VPN-Server: steht außerhalb der Firewall, beim Anbieter
      dev('n32', 'server', 'VPN-Server', 2120, 600, {
        nics: [{ ip: grPraefix + '6.20' }], gateway: grPraefix + '6.1', dns: grDns, software: ['vpnserver'],
        zertifikat: grZert('vpn.tunnelfix.de'),
        vpnServer: { on: true, konten: [{ benutzer: 'lena', pwHash: grPwLena }] }
      }),

      // Heimnetz 1: Webseite hinter Portfreigabe
      grHeim1,
      dev('n23', 'server', 'Webserver Heim', 1640, 1250, {
        nics: [{ ip: '192.168.1.20' }], gateway: '192.168.1.1', dns: grDns, software: ['webserver'],
        webServer: { on: true },
        dateien: {
          '/webserver': { ordner: true },
          '/webserver/index.html': { text: grSeiteHeim },
          '/webserver/stil.css': { text: grStilHeim }
        }
      }),
      dev('n24', 'host', 'Laptop 3', 1820, 1270, { nics: [{ dhcp: true }], software: ['browser', 'mail'] }),
      dev('n25', 'handy', 'Handy 2', 1990, 1140, {
        nics: [{ dhcp: true, funk: true, ssid: 'Heim-WLAN' }], software: ['browser']
      }),

      // Heimnetz 2
      dev('n26', 'heimrouter', 'Heimrouter 2', 2200, 900, {
        ports: 9, nics: [{ dhcp: true }, { ip: '192.168.2.1' }], wlan: { on: true, ssid: 'Familie-WLAN' },
        dhcpServer: { nic: 1, von: '192.168.2.100', bis: '192.168.2.150', mask: '255.255.255.0',
                      gateway: '192.168.2.1', dns: grDns }
      }),
      dev('n27', 'host', 'Laptop 4', 2150, 1180, { nics: [{ dhcp: true }], software: ['browser', 'mail'] }),
      dev('n28', 'handy', 'Handy 3', 2330, 1080, {
        nics: [{ dhcp: true, funk: true, ssid: 'Familie-WLAN' }], software: ['browser']
      }),

      // Internat: hinter dem Firewall-Router, Streaming gesperrt
      dev('n33', 'router', 'Firewall-Router', 560, 600, {
        ports: 2, rip: true, dns: grDns,
        nics: [{ ip: grPraefix + '108.2' }, { ip: grPraefix + '7.1' }],
        dhcpServer: { nic: 1, von: grPraefix + '7.100', bis: grPraefix + '7.150', mask: '255.255.255.0',
                      gateway: grPraefix + '7.1', dns: grDns },
        firewall: { on: true, typ: 'blacklist', ablehnen: true,
                    regeln: [{ adresse: 'mpsflix.de', maske: '' }, { adresse: 'filmwelt.de', maske: '' }] }
      }),
      dev('n34', 'switch', 'Switch 4', 330, 600, { ports: 5, wlan: { on: true, ssid: 'Internat-WLAN' } }),
      dev('n35', 'host', 'Laptop 5', 110, 600, {
        nics: [{ dhcp: true }], software: ['browser', 'vpnclient'], vertrauen: grVertrauen,
        vpnClient: { server: 'vpn.tunnelfix.de', benutzer: 'lena', passwort: 'Tunnel2026' }
      }),
      dev('n36', 'handy', 'Handy 4', 170, 760, {
        nics: [{ dhcp: true, funk: true, ssid: 'Internat-WLAN' }], software: ['browser']
      })
    ],
    cables: [
      // cww – Router 1 und Router 3
      cab('n0', 1, 'n1', 0), cab('n0', 2, 'n3', 0),
      // Teilgitter
      cab('n1', 1, 'n2', 0), cab('n2', 1, 'n3', 1), cab('n1', 2, 'n4', 0),
      cab('n2', 2, 'n5', 0), cab('n3', 2, 'n6', 0), cab('n4', 1, 'n5', 1), cab('n5', 2, 'n6', 1),
      // Büro, Serverraum, Anbieter
      cab('n4', 2, 'n7', 0), cab('n7', 1, 'n8', 0), cab('n7', 2, 'n9', 0),
      cab('n7', 3, 'n12', 0), cab('n7', 4, 'n13', 0),
      cab('n5', 3, 'n15', 0), cab('n15', 1, 'n16', 0), cab('n15', 2, 'n17', 0),
      cab('n15', 3, 'n18', 0), cab('n15', 4, 'n19', 0),
      cab('n6', 2, 'n20', 0), cab('n20', 1, 'n22', 0), cab('n20', 2, 'n21', 0), cab('n20', 3, 'n26', 0),
      cab('n15', 5, 'n30', 0), cab('n15', 6, 'n31', 0), cab('n20', 4, 'n32', 0),
      // Internat hinter dem Firewall-Router
      cab('n4', 3, 'n33', 0), cab('n33', 1, 'n34', 0), cab('n34', 1, 'n35', 0),
      // Heimnetze (WAN = Buchse 0, LAN ab 1)
      cab('n21', 1, 'n23', 0), cab('n21', 2, 'n24', 0),
      cab('n26', 1, 'n27', 0)
    ]
  };

  const grListen =
    '<p><strong>Was hier alles läuft</strong></p><ul>'
    + '<li><strong>6 Router</strong> im Teilgitter mit automatischem Routing (RIP); das <strong>cww</strong> hängt an Router 1 und Router 3. '
    + 'Dazu der <strong>Firewall-Router</strong> vor dem <em>Internat</em> (an Router 4).</li>'
    + '<li><strong>2 Heimrouter</strong> mit NAT und WLAN, per DHCP vom Anbieter versorgt. Heimrouter 1 bekommt immer <code>50.0.6.10</code> (feste Zuweisung).</li>'
    + '<li><strong>DHCP</strong> im Büro (Bereich .100 bis .150, Laptop 1 hat eine Reservierung auf <code>50.0.4.50</code>), beim Anbieter und in beiden Heimnetzen. Statisch: der Lehrer-PC, alle Server.</li>'
    + '<li><strong>2 Webseiten</strong> mit festen Adressen und verschiedenem Aussehen: das Schulportal im Serverraum und die Heimseite von Familie Beispiel hinter Heimrouter 1 (Portfreigabe Port 80 auf <code>192.168.1.20</code>).</li>'
    + '<li><strong>DNS-Server</strong> mit allen Namen unten und einem MX-Eintrag für die Post.</li>'
    + '<li><strong>E-Mail:</strong> Mailserver mit drei Konten und Post darin; auf Laptop 1, Laptop 2 und dem Lehrer-PC ist das Mailprogramm eingerichtet.</li>'
    + '<li><strong>2 Streaming-Dienste:</strong> <em>MPSflix</em> (nur HTTP, alles im Klartext) und <em>Filmwelt</em> (HTTPS).</li>'
    + '<li><strong>Zertifizierungsstelle</strong> im Serverraum (<code>zs.mps-schule.de</code>). Zertifikate haben Schulportal, Mailserver, Filmwelt und VPN-Server. '
    + 'Ihr <strong>vertrauen</strong> nur Laptop 1, der Lehrer-PC und Laptop 5 — alle anderen Geräte zeigen bei <code>https://</code> eine Warnung.</li>'
    + '<li><strong>Mitlesen:</strong> das <em>Lauscher-Handy 5</em> ist Gast im <em>MPS-WLAN</em>, genau wie Handy 1 (Carla). Funk hört jeder im selben WLAN.</li>'
    + '<li><strong>Firewall:</strong> der Firewall-Router sperrt <code>mpsflix.de</code> und <code>filmwelt.de</code> (Blacklist, in beide Richtungen). '
    + 'Im Internat kommt man an keinen der beiden Dienste.</li>'
    + '<li><strong>VPN:</strong> der VPN-Server <code>vpn.tunnelfix.de</code> steht beim Anbieter, also <em>vor</em> der Firewall. '
    + 'Auf Laptop 5 ist der VPN-Client schon eingerichtet.</li>'
    + '<li>WLAN: <em>MPS-WLAN</em> (Büro), <em>Internat-WLAN</em>, <em>Heim-WLAN</em> und <em>Familie-WLAN</em>.</li></ul>'
    + '<p><strong>E-Mail-Konten</strong> (Mailserver <code>mail.mps-schule.de</code>)</p><ul>'
    + '<li><code>anna@mps-schule.de</code> · Passwort <code>Sonne2026</code> (Laptop 1, drei Mails schon im Postfach, <strong>verschlüsselt</strong> über 995/465)</li>'
    + '<li><code>carla@mps-schule.de</code> · Passwort <code>Blume2026</code> (Handy 1 im WLAN, eine Mail wartet auf dem Server)</li>'
    + '<li><code>ben@mps-schule.de</code> · Passwort <code>Mond2026</code> (Laptop 2, zwei Mails warten auf dem Server)</li>'
    + '<li><code>frau.meier@mps-schule.de</code> · Passwort <code>Komet2026</code> (Lehrer-PC, eine Mail wartet auf dem Server)</li></ul>'
    + '<p><strong>Streaming-Konten</strong></p><ul>'
    + '<li>MPSflix: <code>anna@mps-schule.de</code> · <code>Fuchs42</code> und <code>lena@mps-schule.de</code> · <code>Kino55</code></li>'
    + '<li>Filmwelt: <code>lena@mps-schule.de</code> · <code>Popcorn9</code></li></ul>'
    + '<p><strong>VPN-Konto</strong> (VPN-Server <code>vpn.tunnelfix.de</code>): <code>lena</code> · Passwort <code>Tunnel2026</code> (Laptop 5)</p>'
    + '<p><strong>Zertifizierungsstelle:</strong> <em>MPS-Zertifizierungsstelle</em>, Fingerabdruck <code>' + grZsFp + '</code></p>'
    + '<p><strong>Namen im DNS</strong> (DNS-Server <code>50.0.5.53</code>)</p><ul>'
    + '<li><code>www.mps-schule.de</code> → <code>50.0.5.80</code> (Schulportal)</li>'
    + '<li><code>mail.mps-schule.de</code> → <code>50.0.5.25</code> (Mailserver, MX von <code>mps-schule.de</code>)</li>'
    + '<li><code>dns.mps-schule.de</code> → <code>50.0.5.53</code></li>'
    + '<li><code>mpsflix.de</code> und <code>www.mpsflix.de</code> → <code>50.0.5.90</code> (Streaming-Server)</li>'
    + '<li><code>www.heimseite.de</code> → <code>50.0.6.10</code> (Heimrouter 1, weiter an <code>192.168.1.20</code>)</li>'
    + '<li><code>filmwelt.de</code> → <code>50.0.5.91</code> (Streaming-Server, HTTPS)</li>'
    + '<li><code>zs.mps-schule.de</code> → <code>50.0.5.70</code> (Zertifizierungsstelle)</li>'
    + '<li><code>vpn.tunnelfix.de</code> → <code>50.0.6.20</code> (VPN-Server)</li></ul>';

  const grossesnetz = {
    titel: '3. Das große Netz', gruppe: ANDERE,
    aufgabe: auftrag({
      kontext: 'Ein <strong>fertig eingerichtetes</strong> Netz, in dem alles läuft, was SYNIR kann — auch HTTPS mit Zertifizierungsstelle, Mitlesen im WLAN, Firewall und VPN. '
        + 'Zum Ausprobieren und Testen, ohne dass du etwas einrichten musst. '
        + 'Es hat keine Aufgabe außer: <strong>probier etwas aus</strong>. Unten steht, was wo läuft, mit allen Konten, Passwörtern und Namen zum Nachlesen.',
      aufgaben: [
        { typ: 'benutzen', text: 'Schalte auf <em>Aktion</em> und ruf auf <strong>Laptop 1</strong> im Browser <code>www.mps-schule.de</code>, '
          + '<code>www.heimseite.de</code> und <code>mpsflix.de</code> auf. Hol dann im Mailprogramm die Post ab.' },
        { typ: 'benutzen', text: 'Ruf <code>https://www.mps-schule.de</code> einmal auf <strong>Laptop 1</strong> und einmal auf <strong>Laptop 2</strong> auf. '
          + 'Warum warnt nur einer der beiden Browser?' },
        { typ: 'benutzen', text: 'Hol auf <strong>Handy 1</strong> die Post ab. Öffne dann den Mitschnitt beim <strong>Lauscher-Handy 5</strong> und wähle <em>👁 Mitlesende</em>: '
          + 'Was hat er mitbekommen?' },
        { typ: 'benutzen', text: 'Versuch auf <strong>Laptop 5</strong> im Internat <code>mpsflix.de</code> und <code>https://filmwelt.de</code> zu öffnen. '
          + 'Verbinde dann im <em>VPN-Client</em> und versuch es noch einmal.' }
      ],
      hilfe: [
        { begriff: 'Adressplan', text: 'Alle öffentlichen Adressen beginnen mit <code>50.0.</code>:', liste: [
          'Verbindungen zwischen den Routern: <code>50.0.101.0</code> bis <code>50.0.107.0</code>; cww – Router: <code>50.0.110.0</code> und <code>50.0.111.0</code>',
          'Büro (Router 4): <code>50.0.4.0</code> · Serverraum (Router 5): <code>50.0.5.0</code> · Anbieter (Router 6): <code>50.0.6.0</code>',
          'Internat (Firewall-Router): <code>50.0.7.0</code>, angebunden an Router 4 über <code>50.0.108.0</code>',
          'Heimnetze: <code>192.168.1.0</code> (Heimrouter 1) und <code>192.168.2.0</code> (Heimrouter 2)'
        ] },
        { begriff: 'Auf dein cww umstellen', text: 'Im Raum hat dein cww einen eigenen Bereich (Fenster des cww, Reiter <em>Internet</em>). Ersetze in diesem Netz die erste Zahl <code>50</code> '
          + 'durch deine: an allen Routern und am cww, an den festen Adressen der Server, im DHCP-Bereich, bei Gateway und DNS, bei den DNS-Einträgen, '
          + 'bei der festen Zuweisung für Heimrouter 1 und bei den Mail-Einstellungen (dort stehen nur Namen, die brauchen nichts).' },
        { begriff: 'Die Heimseite von innen', text: 'Aus <em>Heimnetz 1</em> selbst klappt <code>www.heimseite.de</code> nicht: Der Name führt zur öffentlichen Adresse des Heimrouters, '
          + 'und der übersetzt nur, was von <em>außen</em> hereinkommt. Wer im Heimnetz sitzt, ruft <code>192.168.1.20</code> auf.' },
        { begriff: 'Firewall und VPN', text: 'Die Firewall sieht nur Absender und Ziel. Mit VPN geht von Laptop 5 alles als verschlüsselter Tunnel '
          + 'zum VPN-Server — das Ziel <code>mpsflix.de</code> steht erst drinnen. Der VPN-Server holt den Film und schickt ihn durch den Tunnel zurück. '
          + 'Dafür sieht jetzt der VPN-Server alles, was Laptop 5 tut.' },
        WERKZEUG_MITSCHNITT, WERKZEUG_LERN
      ]
    }).replace('<details>', grListen + '<details>'),
    netz: grNetz
  };

  window.SZENARIEN = { i1, i2, i3, i4, i5, i6, i7, ii1, ii2, ii3, ii4, ii5, ii6, ii7, ii8, ii9, handschlag, grossesnetz };
})();
