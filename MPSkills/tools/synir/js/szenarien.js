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

  /* ─── Der Aufbau eines Auftrags ────────────────────────────────
     Jeder Auftrag hat dieselben Bausteine, damit man sich in jedem
     Szenario auf Anhieb zurechtfindet:

       kontext    2–3 Sätze: was ist das für ein Netz, warum gibt es das
       aufgaben   [{ typ, text, label? }]  nach „Benutzen – Verändern –
                  Erweitern" (Use – Modify – Create). `bauen` steht dort,
                  wo das Netz am Anfang noch leer ist.
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
    for (const a of o.aufgaben) {
      const t = AUFG[a.typ];
      h += '<p class="' + t.k + '"><strong>' + (a.label || t.label) + '</strong> ' + a.text + '</p>';
    }
    if (o.hilfe && o.hilfe.length) {
      h += '<details><summary>Hilfe: ' + o.hilfe.map(x => x.begriff).join(' · ') + '</summary>'
        + o.hilfe.map(x => '<p><strong>' + x.begriff + '.</strong> ' + x.text + '</p>').join('')
        + '</details>';
    }
    if (o.stern) h += '<p class="stern">★ <strong>Für Schnelle:</strong> ' + o.stern + '</p>';
    return h;
  }

  const SEK1 = 'Sek I · Klasse 8';
  const ALT  = 'Bisherige Szenarien (werden ersetzt)';

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
     Nichts ist verbunden. Kein Kabel, kein Switch: das Kind zieht
     das erste Kabel selbst. Weil ein Endgerät nur EINE Buchse hat,
     scheitert das Erweitern auf fünf Geräte von allein — und der
     Switch ist keine Erklärung mehr, sondern die Lösung. */
  macN = 800; cabN = 800;
  const i1 = {
    titel: 'I.1 · Zwei Geräte', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Im Computerraum stehen zwei Rechner, aber sie sind nicht verbunden. '
        + 'Du baust das kleinste Netzwerk der Welt.',
      aufgaben: [
        { typ: 'bauen', text: 'Verbinde <strong>E1</strong> und <strong>E2</strong> mit einem Kabel und gib '
          + 'beiden eine IP-Adresse aus demselben Netz, zum Beispiel <code>192.168.1.10</code> und '
          + '<code>192.168.1.11</code> (Netzmaske <code>255.255.255.0</code>). Prüfe mit einem Ping, ob sie sich erreichen.' },
        { typ: 'veraendern', text: 'Gib E2 die Adresse <code>192.168.2.11</code>. Sag vorher voraus, ob der Ping noch '
          + 'klappt — und warum (nicht). Teste, dann stell es wieder richtig ein.' },
        { typ: 'erweitern', text: 'Jetzt sollen <strong>fünf</strong> Geräte miteinander reden. Baue E3 bis E5 dazu, '
          + 'sodass jedes Gerät jedes andere erreicht. Prüfe mit Pings.' }
      ],
      hilfe: [
        { begriff: 'IP-Adresse', text: 'Die „Hausnummer“ eines Geräts im Netz: vier Zahlen von 0 bis 255, durch Punkte '
          + 'getrennt. Zwei Geräte im selben Netz dürfen nie dieselbe haben.' },
        { begriff: 'Netzmaske', text: 'Sie sagt, welcher Teil der Adresse zum Netz gehört. Bei <code>255.255.255.0</code> '
          + 'sind es die ersten drei Zahlen: <code>192.168.1.x</code> liegt im selben Netz, <code>192.168.2.x</code> nicht.' },
        { begriff: 'Ping', text: 'Ein „Bist du da?“ an eine Adresse. Kommt die Antwort zurück, funktioniert die Verbindung. '
          + 'Im Modus <em>Aktion</em> tippst du das Gerät an und schreibst im Terminal <code>ping</code> und die Adresse.' },
        { begriff: 'Switch', text: 'Ein Verteiler mit vielen Buchsen. Alle Geräte stecken am Switch, und er leitet '
          + 'jede Nachricht an das Gerät weiter, für das sie gedacht ist. Ein Endgerät selbst hat nur eine Buchse.' }
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
        { begriff: 'Selbes Netz?', text: 'Bei der Netzmaske <code>255.255.255.0</code> gehören Adressen zusammen, wenn die '
          + 'ersten drei Zahlen gleich sind.' }
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
        { typ: 'erweitern', label: 'Weiter erweitern.', text: 'Lass den Switch ein <strong>WLAN</strong> ausstrahlen und bring drei '
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
    const xr = (i) => n === 1 ? 600 : Math.round(160 + i * 880 / (n - 1));
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
        nodes.push(dev(id, kind, name, Math.round(x + (j - (k - 1) / 2) * (k > 3 ? 120 : 105)), yh, cfg));
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
     als einen Weg. WLAN und DHCP laufen — eigentlich. Sechs Dinge
     sind falsch oder leer. Keins davon steckt in einer Netzmaske:
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
  const i5 = {
    titel: 'I.5 · Fehler finden', gruppe: SEK1,
    aufgabe: auftrag({
      kontext: 'Die Schule hat vier Häuser mit einem Netz aus vier Routern, Kabeln in mehr als einer Richtung, WLAN und DHCP. '
        + 'Beim Umbau ist einiges schiefgegangen. Manches ist nicht falsch, sondern einfach <strong>leer</strong>.',
      aufgaben: [
        { typ: 'benutzen', text: 'Teste, welche Geräte sich erreichen. Ping von <strong>E1</strong> zu jedem anderen Gerät, auch '
          + 'zum Handy. Schreib auf, was <em>nicht</em> klappt — das sind deine Spuren.' },
        { typ: 'veraendern', text: 'Es stecken <strong>sechs Fehler</strong> im Netz. Finde sie und behebe sie, bis jedes Gerät '
          + 'jedes andere erreicht (Ausnahme: ein Gerät, das gar nicht gebraucht wird, darf fehlen).' },
        { typ: 'erweitern', text: 'Baue ein <strong>fünftes Haus</strong>: Router, Switch, zwei Endgeräte. Verbinde den Router '
          + 'mit <em>zwei</em> anderen Routern. Adressen nach dem Plan (Hilfe).' }
      ],
      hilfe: [
        { begriff: 'Fehlersuche', text: 'Geh von innen nach außen vor: Kommt ein Ping zu einem Gerät im <em>selben</em> Netz? '
          + 'Dann zum Router im eigenen Haus? Dann zum Nachbarhaus? Die Stelle, an der es aufhört, ist der Ort des Fehlers.' },
        { begriff: 'Adressplan', text: 'Haus <em>n</em> hat das Netz <code>192.168.n.x</code>, die Router-Karte zum Haus hat die '
          + 'Endung <code>.1</code>. Kabel zwischen zwei Routern haben eigene Netze <code>192.168.101.x</code>, '
          + '<code>192.168.102.x</code>, … — die Nummer zählt die Kabel durch.' },
        { begriff: 'Was leer sein kann', text: 'Eine Adresse, ein Gateway, ein Dienst, der nicht läuft, ein Häkchen bei „Automatisches Routing“ '
          + 'oder ein Kabel, das gar nicht steckt. Auch ein WLAN-Name muss <em>genau</em> stimmen.' }
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
      '/webserver/logo.png':   { bild: '@schule' }
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
          + 'erreichbar sein.' }
      ],
      hilfe: [
        { begriff: 'Webserver', text: 'Ein Programm, das Webseiten ausliefert. Die Seite ist eine Datei auf dem Server '
          + '(<code>index.html</code>). Der Browser fragt sie ab und zeigt sie an.' },
        { begriff: 'DNS', text: 'Das Namensverzeichnis des Netzes. Menschen merken sich Namen, Geräte brauchen Adressen — der '
          + 'DNS-Server übersetzt. Ein Name existiert nur, wenn jemand ihn eingetragen hat.' },
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
            '/webserver/logo.png':   { bild: '@schule' }
          }
        }),
        dev('c4', 'host', 'Endgerät 1', 460, 540, { software: ['browser'] }),
        dev('c5', 'host', 'Endgerät 2', 720, 640, { software: ['browser'] })
      ],
      cables: [cab('c1', 1, 'c2', 0), cab('c2', 1, 'c3', 0), cab('c2', 2, 'c4', 0), cab('c2', 3, 'c5', 0)]
    }
  };

  /* ═══ 1 · Zwei Endgeräte ═══════════════════════════════════════
     Das kleinste Netz, das es gibt. Bewusst OHNE Adressen: die
     erste Erfahrung soll sein, dass ein Kabel allein nichts
     nützt. */
  macN = 0; cabN = 0;
  const zwei = {
    gruppe: ALT,
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
    gruppe: ALT,
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
    gruppe: ALT,
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
    gruppe: ALT,
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
    gruppe: ALT,
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
    gruppe: ALT,
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
    gruppe: ALT,
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

  /* ═══ 8 · Ins Internet ═══════════════════════════════════════
     Das erste Szenario, das über die eigene Fläche hinausreicht:
     das Class Wide Web verbindet die Netze der ganzen Klasse.

     ⚠️ Die öffentlichen Adressen stehen hier NICHT drin — und das
     muss so sein: jedes Kind hat ein anderes /8, und welches, sagt
     erst der Raum (js/internet.js). Ein Szenario mit „67.0.0.20"
     wäre für genau ein Kind richtig und für alle anderen ein Netz,
     das nicht ins Internet kommt. Also trägt jedes Kind die Zahlen
     selbst ein — und genau das ist der Auftrag: nachsehen, welcher
     Bereich mir gehört, und ihn benutzen.

     Was schon steht, ist das, was man zu Hause vorfindet: ein
     Heimrouter mit Laptop dahinter, der sich seine WAN-Adresse
     holen will. Der Server daneben hat Webserver und DNS schon
     installiert und gestartet — die Lektion ist die Adresse, nicht
     das Aufspielen. */
  macN = 700; cabN = 700;
  const internet = {
    gruppe: ALT,
    titel: '8 · Ins Internet',
    aufgabe:
      '<p>Oben steht dein Anschluss ans <strong>Class Wide Web</strong> (CWW1). Öffne ihn: '
      + 'im Reiter <em>Internet</em> steht <strong>dein Adressbereich</strong> — nur Adressen '
      + 'daraus kommen hinaus. Im Beispiel unten heißt er <code>X.0.0.0/8</code>.</p>'
      + '<p><strong>Auftrag 1:</strong> Gib der Netzwerkkarte des cww die Adresse '
      + '<code>X.0.0.1</code> und dem Server <code>X.0.0.20</code> (Gateway <code>X.0.0.1</code>).</p>'
      + '<p><strong>Auftrag 2:</strong> Richte am cww den <em>DHCP-Server</em> ein '
      + '(<code>X.0.0.100</code> bis <code>X.0.0.150</code>, Gateway <code>X.0.0.1</code>, '
      + 'DNS <code>8.8.8.8</code>). So bekommt der Heimrouter seine Adresse — wie zu Hause vom Anbieter.</p>'
      + '<p><strong>Auftrag 3:</strong> Trag am <strong>Server</strong> im DNS einen eigenen Namen ein, '
      + 'etwa <code>www.deinname.de</code> → <code>X.0.0.20</code>. Schau nach, ob 8.8.8.8 ihn kennt.</p>'
      + '<p><strong>Auftrag 4:</strong> Schalte auf <em>Aktion</em>. Öffne am Laptop den Browser '
      + 'und besuche eine Seite, die in der Liste von 8.8.8.8 steht — aus einem <em>anderen</em> Netz.</p>'
      + '<p class="dim">Wem ein Adressbereich gehört, verrät dir niemand. Aber '
      + '<code>traceroute</code> zeigt dir den Weg.</p>',
    netz: {
      v: 2,
      nodes: [
        dev('i1', 'cww',        'Class Wide Web 1', 720, 190, { ports: 2 }),
        dev('i2', 'switch',     'Switch 1',          720, 360),
        dev('i3', 'server',     'Server 1',          980, 520, {
          dns: '8.8.8.8',
          software: ['dns', 'webserver'], webServer: { on: true },
          dnsServer: { records: [] },
          dateien: {
            '/webserver': { ordner: true },
            '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
            '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
            '/webserver/logo.png':   { bild: '@schule' }
          }
        }),
        dev('i4', 'heimrouter', 'Heimrouter 1',      460, 520, {
          ports: 9, nics: [{ dhcp: true }, { ip: '192.168.1.1' }]
        }),
        dev('i5', 'host',       'Endgerät 1',        460, 700, {
          nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1', dns: '8.8.8.8',
          software: ['browser']
        })
      ],
      cables: [
        cab('i1', 1, 'i2', 0), cab('i2', 1, 'i3', 0), cab('i2', 2, 'i4', 0), cab('i4', 1, 'i5', 0)
      ]
    }
  };

  window.SZENARIEN = { i1, i2, i3, i4, i5, i6, i7, zwei, lernen, router, fehler, automatisch, namen, web, internet };
})();
