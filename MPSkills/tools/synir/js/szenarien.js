/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — szenarien.js   ·   Vorbereitete Netze
   ══════════════════════════════════════════════════════════════
   Fünfzehn Ausgangslagen in zwei Spuren: Sek I (Klasse 8, I.1 bis
   I.7) und Sek II (Klasse 12, II.1 bis II.8). Jede ist ein Netz
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
        + o.hilfe.map(x => '<p><strong>' + x.begriff + '.</strong> ' + x.text + '</p>'
            + (x.liste ? '<ul>' + x.liste.map(z => '<li>' + z + '</li>').join('') + '</ul>' : '')).join('')
        + '</details>';
    }
    if (o.stern) h += '<p class="stern">★ <strong>Für Schnelle:</strong> ' + o.stern + '</p>';
    return h;
  }

  const SEK1 = 'Sek I · Klasse 8';
  const SEK2 = 'Sek II · Klasse 12';

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
        { begriff: 'Werkzeuge zum Erkunden', text: 'Unter <em>Ansicht &amp; Tools</em> kannst du Hilfsmittel einschalten, zum Beispiel '
          + '<em>Subnetze</em> (färbt die Netze) und <em>Mitschnitt</em> (zeigt jede Nachricht, nur im Modus Aktion). '
          + 'Probier sie aus — sie ändern nichts am Netz.' },
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

  /* ═══════════════════════════════════════════════════════════════
     SEK II · KLASSE 12 — vom Heimnetz zum Schichtenmodell
     Das Programm ist überall dasselbe: Mitschnitt, Subnetze,
     Weiterleitungstabellen und Geräte-Lerninformationen liegen in
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
  const WERKZEUG_SUB = { begriff: 'Werkzeug: Subnetze', text: 'Menü <em>Ansicht &amp; Tools → Subnetze</em>. '
    + 'Die Fläche zeigt alle Adressräume in Farbe, dazu eine Liste mit Netzadresse, Maske und Größe.' };

  /* ═══ II.1 · Fehler finden und wieder rein ══════════════════════
     Wie I.5, aber kleiner (zwei Router) und mit einem Fehler, den
     man nur im Mitschnitt findet: dieselbe Adresse zweimal. */
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
        + 'geht einiges nicht. Diesmal gibt es auch Fehler, die keine Warnung tragen.',
      aufgaben: [
        { typ: 'benutzen', text: 'Teste von <strong>E1</strong> aus, welche Geräte sich erreichen (Ping zu jedem Gerät, auch zum Handy). '
          + 'Notiere, wo es aufhört.' },
        { typ: 'veraendern', text: 'Es stecken <strong>fünf Fehler</strong> im Netz. Finde sie mit dem Mitschnitt und den Gerätefenstern '
          + 'und behebe sie, bis jedes Gerät jedes andere erreicht. Schreib zu jedem Fehler auf: Woran hast du ihn erkannt?' },
        { typ: 'erweitern', text: 'Bau ein Gästenetz dazu: ein zweites WLAN mit eigenem Netz (eigener Router-Anschluss, eigene Adressen), '
          + 'das die Endgeräte im Haus 1 <em>nicht</em> erreichen können sollen — oder begründe, warum das mit diesem Netz nicht '
          + 'geht.' }
      ],
      hilfe: [
        WERKZEUG_MITSCHNITT,
        { begriff: 'Doppelte Adresse', text: 'Fragt ein Gerät per ARP „Wer hat <code>192.168.1.10</code>?“ und <em>zwei</em> Geräte antworten, '
          + 'steht dieselbe IP zweimal im Netz. Im Mitschnitt siehst du zwei Antworten auf eine Frage.' },
        WERKZEUG_LERN,
        { begriff: 'Vorgehen', text: 'Von innen nach außen: dasselbe Netz → der eigene Router → das andere Haus. Wo der Ping aufhört, '
          + 'liegt der Fehler in der Nähe.' }
      ],
      stern: 'Ein Fehler lässt sich auf zwei Wegen beheben (am Gerät oder am Server). Welcher ist besser, und warum?'
    }),
    netz: { v: 2, nodes: ii1netz.nodes, cables: ii1netz.cables }
  };

  /* ═══ II.2 · Heimrouter ═════════════════════════════════════════
     Zwei Laptops an einem Heimrouter, der am Class Wide Web hängt.
     Alles ist leer, was von der Adresse des Kindes abhängt: die
     Adresse des Anbieters kennt erst das cww. */
  macN = 1600; cabN = 1600;
  const ii2 = {
    titel: 'II.2 · Heimrouter', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Zu Hause steht kein Router, sondern ein Heimrouter: Router, Switch und WLAN in einem Gehäuse. Am Kabel nach oben hängt der '
        + 'Anbieter, das <strong>cww</strong>. Zwei Laptops sind schon angeschlossen — noch kommt keiner ins Internet.',
      aufgaben: [
        { typ: 'benutzen', text: 'Öffne den Heimrouter. Welche Anschlüsse hat er (WAN, LAN)? Welche Adresse steht auf welcher Seite? '
          + 'Schick von <strong>Laptop 1</strong> einen Ping an <code>8.8.8.8</code> und lies die Fehlermeldung.' },
        { typ: 'veraendern', text: 'Spiele den Anbieter: gib dem cww eine Adresse aus deinem Bereich (steht im Reiter <em>Internet</em>) und richte dort einen '
          + '<em>DHCP-Server</em> ein. Der Heimrouter soll seine WAN-Adresse per DHCP bekommen. Dann geht der Ping. Sieh dir im Mitschnitt an, '
          + 'welche <em>Absenderadresse</em> die Nachricht beim Laptop und welche sie <em>hinter</em> dem Heimrouter hat.' },
        { typ: 'erweitern', text: 'Verbinde ein <strong>Handy</strong> über das WLAN des Heimrouters. Es braucht eine Adresse aus dem Heimnetz — '
          + 'gib sie ihm von Hand oder richte am Heimrouter DHCP ein. Beweise mit einem Ping, dass es ins Internet kommt.' }
      ],
      hilfe: [
        { begriff: 'Heimrouter', text: 'Drei Geräte in einem Gehäuse: ein <em>Router</em> (verbindet Heimnetz und Anbieter), ein <em>Switch</em> '
          + '(die LAN-Buchsen) und ein <em>Zugangspunkt</em> (das WLAN). Oben die Buchse WAN zum Anbieter, unten die LAN-Buchsen.' },
        { begriff: 'NAT', text: 'Das Heimnetz benutzt private Adressen (<code>192.168.x.x</code>), die es im Internet nicht gibt. Der Heimrouter tauscht deshalb '
          + 'beim Hinausgehen den Absender gegen seine eigene öffentliche WAN-Adresse aus und merkt sich, wer gefragt hat. Die Merktabelle '
          + 'heißt <em>NAT-Tabelle</em> und steht im Fenster des Heimrouters.' },
        WERKZEUG_MITSCHNITT
      ],
      stern: 'Kann jemand aus dem Internet einen Ping an deinen Laptop schicken? Probier es aus (ein Mitschüler aus dem cww) — und erkläre, warum das nicht geht.'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('h0', 'cww',        'Class Wide Web 1', 720, 190, { ports: 2 }),
        dev('h1', 'heimrouter', 'Heimrouter 1',     720, 400, {
          ports: 9, nics: [{ dhcp: true }, { ip: '192.168.1.1' }], wlan: { on: true, ssid: 'Heim-WLAN' }
        }),
        dev('h2', 'host', 'Laptop 1', 520, 600, { nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1', dns: '8.8.8.8' }),
        dev('h3', 'host', 'Laptop 2', 920, 600, { nics: [{ ip: '192.168.1.11' }], gateway: '192.168.1.1', dns: '8.8.8.8' })
      ],
      cables: [cab('h0', 1, 'h1', 0), cab('h1', 1, 'h2', 0), cab('h1', 2, 'h3', 0)]
    }
  };

  /* ═══ II.3 · Webseiten und E-Mail ═══════════════════════════════
     Ein Heimserver mit Webserver, DNS und Mailserver — alles
     installiert und gestartet, alles leer. Erst im Heimnetz, dann
     nach draußen: die Portfreigabe ist der Schritt, an dem ein
     privates Netz öffentlich wird. */
  macN = 1700; cabN = 1700;
  const ii3 = {
    titel: 'II.3 · Webseiten und E-Mail', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Im Heimnetz steht ein Server, der eine Webseite ausliefern, Namen auflösen und E-Mails verwalten kann. Alle drei Programme '
        + 'sind installiert und gestartet — aber noch leer. Auf den Laptops liegen Browser und E-Mail-Programm.',
      aufgaben: [
        { typ: 'benutzen', text: 'Ruf die Seite des Servers von <strong>Laptop 1</strong> über seine Adresse <code>192.168.1.20</code> auf. '
          + 'Welche Nachrichten gehen dabei über das Netz? (Mitschnitt, Filter HTTP und TCP.)' },
        { typ: 'veraendern', text: 'Trag im DNS-Server den Namen <code>www.heim.de</code> ein, ruf die Seite darüber auf und schreib sie um. Lege dann im Mailserver '
          + 'zwei Konten an (<code>anna@heim.de</code>, <code>ben@heim.de</code>), richte die E-Mail-Programme ein und schick eine Mail von Anna an Ben.' },
        { typ: 'erweitern', text: '<strong>Nach draußen:</strong> Richte das cww als Anbieter ein (Adresse, DHCP wie in II.2). Gib am Heimrouter den Port 80 '
          + 'für den Server frei (<em>Portfreigabe</em>) und melde deinen Namen bei <code>8.8.8.8</code> an. Ein Mitschüler soll deine Seite '
          + 'aus <em>seinem</em> Netz aufrufen.' }
      ],
      hilfe: [
        { begriff: 'E-Mail', text: 'Zwei Protokolle mit zwei Aufgaben: <em>SMTP</em> (Port 25) bringt eine Nachricht zum Server, <em>POP3</em> (Port 110) holt sie '
          + 'ab. Eine Mail wird nicht zugestellt, sie wird <em>abgeholt</em>: sie liegt auf dem Server, bis der Empfänger fragt.' },
        { begriff: 'Portfreigabe', text: 'Von außen kommt an der WAN-Adresse nur an, was ein Gerät im Heimnetz selbst angefragt hat. Damit ein Server von außen '
          + 'erreichbar ist, sagt eine Portfreigabe am Heimrouter: „Was auf Port 80 hereinkommt, geht an <code>192.168.1.20</code>.“ '
          + 'Sie steht im Fenster des Heimrouters.' },
        WERKZEUG_MITSCHNITT
      ],
      stern: 'Ein Mitschüler schickt dir eine Mail. Was muss außer dem Konto noch stimmen, damit sie bei dir ankommt?'
    }),
    netz: {
      v: 2,
      nodes: [
        dev('j0', 'cww',        'Class Wide Web 1', 720, 190, { ports: 2 }),
        dev('j1', 'heimrouter', 'Heimrouter 1',     720, 400, {
          ports: 9, nics: [{ dhcp: true }, { ip: '192.168.1.1' }], wlan: { on: true, ssid: 'Heim-WLAN' }
        }),
        dev('j2', 'host', 'Laptop 1', 500, 610, { nics: [{ ip: '192.168.1.10' }], gateway: '192.168.1.1', dns: '192.168.1.20',
          software: ['browser', 'mail'] }),
        dev('j3', 'host', 'Laptop 2', 720, 660, { nics: [{ ip: '192.168.1.11' }], gateway: '192.168.1.1', dns: '192.168.1.20',
          software: ['browser', 'mail'] }),
        dev('j4', 'server', 'Heimserver', 950, 610, {
          nics: [{ ip: '192.168.1.20' }], gateway: '192.168.1.1', dns: '192.168.1.20',
          software: ['dns', 'webserver', 'mailserver'], webServer: { on: true },
          dnsServer: { records: [] }, mailServer: { on: true, domain: 'heim.de', konten: [] },
          dateien: {
            '/webserver': { ordner: true },
            '/webserver/index.html': { text: window.Http ? window.Http.SEITE : '' },
            '/webserver/stil.css':   { text: window.Http ? window.Http.STIL : '' },
            '/webserver/logo.png':   { bild: '@schule' }
          }
        })
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
        { typ: 'bauen', label: 'Weiter bauen.', text: 'Schreib deine Seite, trag Namen im DNS ein und melde sie bei <code>8.8.8.8</code> an. '
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
     auf, mit Masken, die zur Größe des Bedarfs passen. */
  macN = 1900; cabN = 1900;
  const ii5 = {
    titel: 'II.5 · Subnetzmasken', gruppe: SEK2,
    aufgabe: auftrag({
      kontext: 'Das cww hat dir einen riesigen Bereich gegeben: <code>X.0.0.0</code> mit der Netzmaske <code>255.0.0.0</code> — über 16 Millionen '
        + 'Adressen. Deine Schule braucht nur ein paar hundert. Bisher hängt alles in <em>einem</em> Netz.',
      aufgaben: [
        { typ: 'benutzen', text: 'Gib allen Geräten Adressen aus deinem Bereich (<code>X.0.0.n</code>, Maske <code>255.0.0.0</code>) und prüfe, dass alle sich '
          + 'erreichen. Schalte dann <em>Subnetze</em> ein: Wie groß ist das eine Netz, in dem alles liegt?' },
        { typ: 'veraendern', text: 'Teile es auf. Verwaltung (bis <strong>50</strong> Geräte), Unterricht (bis <strong>200</strong>) und Server (bis <strong>10</strong>) '
          + 'bekommen je ein eigenes Netz, verbunden über einen Router. Wähle für jedes die <em>kleinste</em> Maske, in die es passt, und schreib '
          + 'einen Adressplan (Netz, Maske, erste und letzte Adresse).' },
        { typ: 'erweitern', text: 'Ein viertes Netz: das Gäste-WLAN für bis zu <strong>100</strong> Handys, ohne Zugriff auf Verwaltung und Server. '
          + 'Schaffst du es, dass das nur an der Aufteilung liegt?' }
      ],
      hilfe: [
        { begriff: 'Netzmaske', text: 'Die Maske legt fest, wie viele Bits zum Netz gehören. Eine „/24“ hat 24 Bits Netz und 8 Bits für Geräte: '
          + '<code>255.255.255.0</code>. Von den Adressen im Netz sind zwei reserviert: die <em>Netzadresse</em> (alles Geräte-Bits 0) und die '
          + '<em>Broadcastadresse</em> (alles 1).' },
        { begriff: 'Größen', text: 'Wie viele Geräte passen in ein Netz?', liste: [
          '<code>/24</code> = <code>255.255.255.0</code> → 254 Geräte',
          '<code>/25</code> = <code>255.255.255.128</code> → 126',
          '<code>/26</code> = <code>255.255.255.192</code> → 62',
          '<code>/27</code> = <code>255.255.255.224</code> → 30',
          '<code>/28</code> = <code>255.255.255.240</code> → 14'
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
        { typ: 'bauen', label: 'Muss.', text: 'Mindestens <strong>drei Netze</strong> (Verwaltung, Unterricht, Server), verbunden über Router, mit '
          + 'passend gewählten Subnetzmasken und einem Adressplan.' },
        { typ: 'bauen', label: 'Muss.', text: 'Mindestens <strong>15 Geräte</strong>; die Geräte im Unterricht bekommen ihre Adresse per <strong>DHCP</strong>, '
          + 'im Unterrichtsnetz gibt es zusätzlich ein <strong>WLAN</strong> mit Handys.' },
        { typ: 'bauen', label: 'Muss.', text: 'Ein Webserver mit eigener Seite und ein Mailserver mit zwei Konten. Beide Namen stehen im DNS und sind bei '
          + '<code>8.8.8.8</code> angemeldet. Jedes Gerät erreicht jedes andere und ruft deine Seite über den Namen auf.' },
        { typ: 'bauen', label: 'Kann.', text: 'Ein zweiter Weg zwischen zwei Routern, damit das Netz ein Kabelbruch überlebt.' },
        { typ: 'benutzen', label: 'Danach.', text: 'Schick <code>traceroute</code> zum Server eines Mitschülers. Was siehst du von seinem Netz — und was nicht?' }
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
            '/webserver/logo.png':   { bild: '@schule' }
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

  window.SZENARIEN = { i1, i2, i3, i4, i5, i6, i7, ii1, ii2, ii3, ii4, ii5, ii6, ii7, ii8 };
})();
