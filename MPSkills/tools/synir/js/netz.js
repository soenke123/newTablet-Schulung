/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — netz.js   ·   Geräte, Anschlüsse, Kabel
   ══════════════════════════════════════════════════════════════
   Was auf der Fläche liegt und wie es zusammenhängt. Diese Datei
   weiß nichts von Protokollen — sie transportiert Rahmen von
   einem Anschluss zum anderen und sonst nichts.

   ── Das Datenmodell IST das Speicherformat ────────────────────
   Ein Netz ist ein schlichtes Objekt aus Listen und Zahlen, das
   sich mit JSON.stringify wegschreiben lässt. Das ist Absicht:

     · localStorage im Prototyp
     · später skill_room_state.data in MPSkills
     · und damit zugleich das, was die Lehrkraft an die Klasse
       schickt, wenn sie eine Aufgabe verteilt

   Filius speichert stattdessen mit java.beans.XMLEncoder, also
   die Java-Klassenstruktur selbst. Genau deshalb bricht dort
   jedes Umbenennen eines Feldes alle alten Schülerdateien. Diesen
   Fehler machen wir nicht: das Format hat eine `v`-Nummer und ist
   von den Klassen unabhängig.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* Vorgabelaufzeit eines Kabels in Mikrosekunden. Steht hier
     oben, weil sie an zwei Stellen gebraucht wird (neues Kabel,
     Kabel aus einer Datei ohne Angabe) und die beiden einmal
     auseinandergelaufen sind. */
  const KABEL_MS = 100000;   // 100 ms

  /* ─── Der Heimrouter: welche Karte ist welche ───────────────
     Filius hat ihn als Klasse `Gateway` (hw_gateway_msg1 =
     „Heimrouter"): Karte 0 ist WAN, Karte 1 ist LAN, dazwischen
     NAT und Firewall, DHCP-Server auf der LAN-Seite und
     DHCP-Client auf der WAN-Seite. Die Reihenfolge ist von dort
     übernommen — `holeWANInterface()` gibt dort Karte 0 zurück.

     ⚠️ EINE bewusste Abweichung, vom Nutzer gesetzt: hier hat er
     MEHRERE LAN-Buchsen, „so wie richtige Heimrouter". Damit
     steht sofort die Frage im Raum, die Filius gar nicht erst
     stellt — vier Buchsen, aber nur eine Adresse?

     Die Antwort ist die Wahrheit über so ein Gerät und der
     eigentliche Gewinn dieser Abweichung: die LAN-Buchsen sind
     ein eingebauter SWITCH. Sie liegen in EINEM Rundrufbereich
     und teilen sich eine IP- und eine MAC-Adresse — die der
     ersten. Die übrigen sind Buchsen desselben Anschlusses und
     keine eigenen Netzwerkkarten. Wer das einmal gesehen hat,
     weiß, warum ein Heimrouter zwei Geräte im Haus verbindet,
     ohne dass sie „über das Internet" gehen. */
  const WAN = 0;                // die Karte zum Anbieter
  const LAN = 1;                // ab hier die Buchsen der LAN-Brücke

  /* ─── Gerätearten ───────────────────────────────────────────
     Bewusst wenige. Filius hat zusätzlich Notebook (= Rechner mit
     anderem Bild) und Modem (verbindet zwei Programminstanzen über
     echtes TCP — das macht in MPSkills der Raum). */
  /* `ports` ist die Zahl beim Anlegen, `maxPorts` die Obergrenze.
     Ein Router mit genau zwei Anschlüssen reicht für das dritte
     Szenario und für nichts darüber hinaus: sobald eine Klasse ein
     drittes Netz dazustellt, braucht derselbe Router eine dritte
     Adresse. Deshalb lassen sich Anschlüsse nachträglich anbauen
     (Router und Heimrouter; ein Rechner mit zwei Karten verwirrt an
     dieser Stelle mehr, als er erklärt).

     `waechst: true` heißt dagegen „hier baut niemand an, die Buchse
     kommt mit dem Kabel" — das hat nur der Switch (siehe
     `freieNic`). `dateien: true` heißt „dieses Gerät hat einen
     Bildschirm und damit ein Dateisystem" (siehe `addNode`). */
  /* ⚠️ `host` und `server` sind DASSELBE GERÄT mit zwei Bildern.
     Genau so hält es Filius mit Rechner und Notebook: gleiche
     Fähigkeiten, gleiche Software, nur ein anderes Bild auf der
     Fläche. Das ist keine Sparsamkeit, sondern die Aussage — ein
     Server ist kein Gerätetyp, sondern ein Rechner, auf dem ein
     Serverprogramm läuft. Wer das trennt, muss später erklären,
     warum ein „Rechner" keinen Webserver haben darf.

     Deshalb: nichts in diesem Programm darf `kind === 'server'`
     abfragen, um etwas zu erlauben oder zu verbieten. Das Bild
     unterscheidet sie und sonst nichts. */
  /* ── `kurz`: der Name, der auf der Fläche steht ──────────────
     Auf dem Beamer ist „Endgerät 1" unter einem 76-px-Kästchen
     eine graue Wurst, und bei sieben Geräten stehen sieben davon
     da. Ein Buchstabe und eine Zahl sind aus der letzten Reihe zu
     lesen und lassen sich vorlesen („ping von E1 nach E3"), ohne
     dass jemand mitschreibt. Der ausgeschriebene Name bleibt — im
     Fensterkopf und als Kurzhinweis am Gerät.

     Der Switch bekommt zwei Buchstaben, weil S schon beim Server
     steht. Lieber ein Kürzel, das aus der Reihe fällt, als zwei
     Geräte, die auf der Fläche gleich heißen. */
  const KIND = {
    host: {
      id: 'host', label: 'Endgerät', kurz: 'E', ports: 1, maxPorts: 1, routes: false,
      dateien: true, icon: 'host',
      hint: 'Ein Computer mit einer Netzwerkkarte. Kann Programme bekommen.'
    },
    /* `wlan: true` heißt „dieses Gerät KANN ein Funknetz
       ausstrahlen" — nicht, dass es das tut. In Filius heißt der
       Switch deshalb „Switch / WLAN" (hw_switch_msg1): es ist
       dasselbe Gerät, und ob es funkt, entscheidet ein Netzname im
       Einstellfenster. */
    /* ⭐ `maxPorts: 50` und `waechst: true` — der Switch ist das
       einzige Gerät, an dem eine Buchse VON SELBST nachkommt (siehe
       `freieNic`). Vorher waren es 16 zum Anbauen von Hand, und das
       war vom Nutzer abbestellt: „Bitte nimm die Begrenzung bei
       Switches raus, die können einfach Geräte verbinden und fertig.
       Vllt sagen wir maximal 50 Geräte und dann kommt eine Meldung."

       Die 50 sind kein technisches Maß, sondern ein Notausgang: wer
       so viele Geräte an einem Switch hat, hat sich verklickt, und
       eine Fläche mit 50 Kabeln an einem Punkt sagt nichts mehr.
       Filius hat feste 24 und dieselbe Meldung wie hier früher —
       die Abweichung ist gewollt (FILIUS-ABGLEICH.md). */
    switch: {
      id: 'switch', label: 'Switch', kurz: 'SW', ports: 5, maxPorts: 50, waechst: true, routes: false,
      icon: 'switch', wlan: true,
      hint: 'Verteilt Rahmen im selben Netz. Hat selbst keine IP-Adresse. '
        + 'Kann zusätzlich ein WLAN ausstrahlen.'
    },
    router: {
      id: 'router', label: 'Router', kurz: 'R', ports: 2, maxPorts: 8, routes: true, icon: 'router',
      hint: 'Verbindet Netze. Jede Netzwerkkarte hat eine eigene IP-Adresse.'
    },
    /* Das Gerät, das jedes Kind zu Hause stehen hat — und das
       einzige, das drei Dinge auf einmal ist: Router (es verbindet
       zwei Netze), Switch (die LAN-Buchsen) und Zugangspunkt (das
       WLAN). Genau deshalb steht es hier und nicht als Schalter am
       Router: an ihm lässt sich zeigen, dass „der Router" zu Hause
       gar kein Router ist, sondern vier Geräte in einem Gehäuse.

       `ports: 9` = 1 × WAN + 8 × LAN, FEST eingebaut — vom Nutzer
       gesetzt: „1 WAN und 8 LAN. Aber die sind fest drin alle."
       Anbauen gibt es nicht (maxPorts = ports), und ältere Stände
       mit weniger Buchsen füllt `fromJSON` auf. */
    heimrouter: {
      id: 'heimrouter', label: 'Heimrouter', kurz: 'HR', ports: 9, maxPorts: 9, routes: true,
      icon: 'heimrouter', wlan: true,
      hint: 'Router, Switch und WLAN-Zugangspunkt in einem Gehäuse. Oben ein '
        + 'WAN-Anschluss zum Anbieter, unten mehrere LAN-Buchsen fürs Heimnetz. '
        + 'Übersetzt mit NAT zwischen beiden Seiten.'
    },
    server: {
      id: 'server', label: 'Server', kurz: 'S', ports: 1, maxPorts: 1, routes: false,
      dateien: true, icon: 'server',
      hint: 'Dasselbe Endgerät, nur mit anderem Bild — für Geräte, auf denen '
        + 'ein Serverprogramm läuft.'
    },
    /* Das dritte Bild desselben Geräts. Es kann alles, was ein
       Endgerät kann — eine Netzwerkkarte, eine Adresse, ein
       Terminal, Software.

       Der EINE Unterschied liegt nicht hier, sondern in
       geraet.js: sein Bildschirm ist hochkant, die Programme
       liegen in einem dreispaltigen Raster, und ein Programm
       läuft im Vollbild. Das ist kein Schmuck — es ist das
       Gerät, das die Klasse in der Tasche hat, und es macht
       „ein Rechner ist ein Rechner" erfahrbar.

       ⭐ `nurFunk` ist seit dem 2026-09-27 der einzige Unterschied
       im MODELL, und er ist ein Merkmal am KIND und keine Abfrage
       auf `kind === 'handy'` — genau wie `routes` und `wlan`. Eine
       Prüfung wacht darüber (kerntest.js, Abschnitt „Handy"), denn
       eine solche Abfrage irgendwo im Programm wäre der Anfang
       davon, dass das Handy ein anderes Gerät wird als ein
       Rechner. Es ist keins; es hat nur keine Buchse.

       Vom Nutzer gesetzt: „Smartphones sollen ausschließlich über
       WLAN betrieben werden können." Filius kennt die
       Unterscheidung nicht (dort hat jeder Rechner die Wahl
       zwischen `Kabelgebunden (LAN)` und `Drahtlos (WLAN)`) — es
       kennt aber auch kein Handy. */
    handy: {
      id: 'handy', label: 'Handy', kurz: 'H', ports: 1, maxPorts: 1, routes: false,
      nurFunk: true, dateien: true, icon: 'handy',
      hint: 'Dasselbe Endgerät, nur mit anderem Bild und einem eigenen '
        + 'Bildschirmlayout — Raster statt Schreibtisch. Es geht ausschließlich '
        + 'über WLAN ins Netz; eine Kabelbuchse hat es nicht.'
    }
  };

  /* „Endgerät 3" → „E3".

     Die Zahl steht im Namen und wird von hinten gelesen — das ist
     der stabile Weg: `autoName` vergibt sie und achtet dabei schon
     darauf, dass keine zweimal vorkommt, und ein gelöschtes Gerät
     benennt die übrigen nicht um. Ein Auftrag, der „ping von E1
     nach E3" sagt, meint morgen noch dieselben Geräte.

     Ein Gerät, dessen Name keine Zahl trägt („Webserver",
     „DNS-Server" aus einem Szenario), wird nach seiner Stelle in
     der Liste gezählt — sonst hießen beide „S", und damit wäre
     der Sinn des Kürzels weg. */
  function kurzName(node, liste) {
    if (!node) return '';
    const k = KIND[node.kind] || KIND.host;
    const m = /(\d+)\s*$/.exec(String(node.name || ''));
    if (m) return k.kurz + m[1];
    if (liste) {
      let i = 0;
      for (const o of liste) {
        if (o.kind !== node.kind) continue;
        i++;
        if (o.id === node.id) return k.kurz + i;
      }
    }
    return k.kurz;
  }

  /* ─── WAN, LAN und die Brücke dazwischen ────────────────────
     Vier Fragen, die im ganzen Programm an genau dieser Stelle
     beantwortet werden. Stünde `kind === 'heimrouter' && i === 0`
     irgendwo sonst noch einmal, liefe es beim nächsten Umbau
     auseinander — und zwar lautlos, weil beide Zweige plausibel
     aussehen.                                                    */
  const istHeim = (node) => !!node && node.kind === 'heimrouter';
  const istWan  = (node, i) => istHeim(node) && (i | 0) === WAN;
  const istLan  = (node, i) => istHeim(node) && (i | 0) >= LAN;

  /* Welche Netzwerkkarte trägt Adresse und MAC für diese Buchse?
     Auf der LAN-Seite eines Heimrouters immer dieselbe: die
     Buchsen sind ein Switch, und ein Switch hat keine eigenen
     Adressen je Loch. */
  function brueckeNic(node, i) {
    return istLan(node, i) ? node.nics[LAN] : node.nics[i | 0];
  }

  /* Alle Buchsen, die mit dieser einen zusammen EINEN Anschluss
     bilden. Überall sonst ist das genau die eine. */
  function bruecke(node, i) {
    if (!istLan(node, i)) return [i | 0];
    return node.nics.filter(k => k.i >= LAN).map(k => k.i);
  }

  /* Wie heißt dieser Anschluss auf dem Bildschirm? Filius nennt
     beim Heimrouter beide Reiter „Netzwerkkarte" und unterscheidet
     sie nur über ihre Stelle im Reiterband — das ist eine Lücke,
     die man im Unterricht bezahlt. Hier stehen die Wörter da, die
     auch auf dem Gehäuse stehen. */
  function portLabel(node, i) {
    if (istHeim(node)) return (i | 0) === WAN ? 'WAN' : 'LAN ' + (i | 0);
    if (node && node.kind === 'switch') return 'Anschluss ' + ((i | 0) + 1);
    return 'Netzwerkkarte ' + ((i | 0) + 1);
  }

  /* ─── WLAN ──────────────────────────────────────────────────
     Ein Zugangspunkt ist kein eigenes Gerät, sondern eine
     Einstellung an einem, das es ohnehin gibt — genau wie in
     Filius, wo der Switch „Switch / WLAN" heißt und ein Feld
     „Name WLAN (SSID)" hat (jswitchkonfiguration_msg4).

     Ausgestrahlt wird nur mit NAMEN. Ein Funknetz ohne Namen
     könnte niemand auswählen, und ein Haken allein wäre ein
     Zustand, den man auf der Fläche nicht benennen kann.        */
  function wlanConf(node) {
    if (!node.wlan) node.wlan = { on: false, ssid: '' };
    return node.wlan;
  }
  const strahlt = (node) =>
    !!(node && KIND[node.kind] && KIND[node.kind].wlan
       && node.wlan && node.wlan.on && node.wlan.ssid);

  /* ─── Welche Dienste LAUFEN auf diesem Gerät? ────────────────
     Die Frage stellen zwei ganz verschiedene Stellen: die
     Simulation („wer lauscht auf welchem Port?", `dienste.sync`)
     und die Fläche („was schreibe ich als Marke unter die
     Kachel?"). Beantwortet wird sie deshalb hier, EINMAL. Zwei
     Stellen mit derselben Frage laufen beim nächsten Dienst
     auseinander, und dieser Fehler meldet sich nicht: eine Marke,
     die etwas behauptet, was nicht läuft, schickt die Fehlersuche
     genau dorthin, wo nichts zu finden ist.

     Drei Bedingungen — und die mittlere ist die, um die es geht:
     das Programm ist INSTALLIERT, es ist GESTARTET, und das Gerät
     ist an. Installiert allein heißt nur, dass eine Kachel auf dem
     Bildschirm liegt; ein Server, den niemand gestartet hat,
     antwortet auf nichts. Genau diese Unterscheidung ist der Grund
     für die Software-Installation (siehe `dienste.sync`) — eine
     Marke, die schon beim Aufspielen erscheint, nimmt sie wieder
     weg.

     ⚠️ Das Gerät gehört in die Bedingung, obwohl „aus" schon an
     der Kachel steht: ein ausgeschaltetes Gerät verteilt keine
     Adressen, und `sync()` schaltet die Dienste dort ebenfalls ab.

     DHCP hat kein Programm, weil es in Filius keines ist: ein
     Kontrollkästchen am Gerät, kein Eintrag in der
     Software-Installation. */
  const DIENSTE = {
    dhcp: { conf: 'dhcpServer', sw: null },
    dns:  { conf: 'dnsServer',  sw: 'dns' },
    web:  { conf: 'webServer',  sw: 'webserver' },
    mail: { conf: 'mailServer', sw: 'mailserver' }
  };
  function dienstLaeuft(node, art) {
    const d = DIENSTE[art];
    if (!node || !d || !node.on) return false;
    if (d.sw && (node.software || []).indexOf(d.sw) < 0) return false;
    return !!(node[d.conf] && node[d.conf].on);
  }
  /* In fester Reihenfolge, damit die Marken nicht die Plätze
     tauschen, sobald ein Dienst dazukommt oder weggeht. */
  const laufendeDienste = (node) =>
    Object.keys(DIENSTE).filter(art => dienstLaeuft(node, art));

  /* ─── Netz ──────────────────────────────────────────────────*/
  function Netz(engine) {
    const nodes  = new Map();   // id → Gerät
    const cables = new Map();   // id → Kabel

    /* Ein Anschluss ist kein eigenes Objekt in der Map, sondern
       lebt in seinem Gerät: { i, mac, ip, mask, cable }.
       Bei einem Switch bleiben ip/mask leer. */
    function makeNic(i, mac) {
      return {
        i: i,
        /* Die MAC-Adresse entsteht HIER und nur hier — beim
           Anlegen des Anschlusses, nicht erst beim ersten Rahmen.
           Das ist die physikalische Wahrheit (sie ist eingebrannt,
           lange bevor jemand eine IP einträgt) und didaktisch der
           halbe ARP-Unterricht: eine Karte hat immer eine MAC und
           erst dann vielleicht eine IP. Ein Gerät ohne MAC gibt es
           in diesem Programm nicht. */
        mac: mac || newMac(),
        ip: '',
        mask: '255.255.255.0',
        dhcp: false,        // Adresse automatisch holen?
        /* ─ Die zwei Funk-Merkmale ─ Sie sehen sich ähnlich und
           meinen Entgegengesetztes; deshalb stehen sie hier
           nebeneinander und nicht an zwei Stellen:

             funk     diese Karte SUCHT ein Funknetz. Steht am
                      Endgerät; `ssid` sagt, welches. In Filius
                      ist das der Knopf „Drahtlos (WLAN)" plus
                      die Auswahlliste (jhostkonfiguration_msg13
                      und msg15).
             funkPort diese Buchse GEHÖRT zu einem Funknetz. Steht
                      am Zugangspunkt, entsteht und vergeht mit
                      dem Gerät, das sich verbindet, und wird
                      nicht gespeichert (siehe funkAbgleich).   */
        funk: false,
        ssid: '',
        funkPort: false,
        cable: null,
        up: true            // Anschluss eingeschaltet? (für „Kabel ab"-Aufgaben)
      };
    }

    /* Die festen Buchsen — alles außer den Funkbuchsen, die sich
       der Abgleich selbst anbaut. Jede Obergrenze und jede
       Nummerierung zählt nur diese: ein Switch mit fünf Löchern
       hat fünf Löcher, auch wenn drei Handys darin funken. */
    const feste = (node) => node.nics.filter(k => !k.funkPort);

    /* ─── Geräte ohne Kabelbuchse ─────────────────────────────
       Beim Handy ist jede Karte eine Funkkarte. Das hier ist die
       EINE Stelle, an der das durchgesetzt wird — gerufen überall
       dort, wo eine Karte entsteht oder aus einer Datei kommt.

       ⚠️ Ohne diese Bündelung baut die eine Hälfte des Programms
       ein Handy mit Buchse und die andere eines ohne, und beide
       sähen für sich richtig aus. Besonders `fromJSON` braucht es:
       Stände von vor dem 2026-09-27 enthalten Handys mit Kabel,
       und die müssen beim Laden nachgezogen werden — genauso wie
       „Rechner 3" seinerzeit zu „Endgerät 3" wurde. */
    const nurFunk = (node) => !!(KIND[node.kind] || {}).nurFunk;

    function funkErzwingen(node) {
      if (!node || !nurFunk(node)) return;
      for (const k of feste(node)) {
        if (k.funk) continue;
        k.funk = true;
        if (k.cable) removeCable(k.cable);
      }
    }

    /* Aus dem Würfel der Engine, damit derselbe Startwert dieselben
       Adressen ergibt — und geprüft gegen alles, was schon vergeben
       ist. Zwei gleiche MAC-Adressen wären ein Fehler, den niemand
       findet: der Switch lernt dann zwei Anschlüsse für dieselbe
       Adresse und liefert abwechselnd falsch aus. */
    function newMac() {
      const rand = { int: (n) => engine.randInt(n) };
      const taken = new Set();
      for (const n of nodes.values()) for (const k of n.nics) taken.add(k.mac);
      for (let versuch = 0; versuch < 50; versuch++) {
        const m = U.macFrom(rand);
        if (!taken.has(m)) return m;
      }
      return U.macFrom(rand);
    }

    function addNode(kind, x, y, name) {
      const k = KIND[kind];
      if (!k) throw new Error('Unbekannte Geräteart: ' + kind);
      const id = U.nextId('n');
      const nics = [];
      for (let i = 0; i < k.ports; i++) nics.push(makeNic(i));
      const node = {
        id, kind, x: Math.round(x), y: Math.round(y),
        name: name || autoName(kind),
        nics,
        gateway: '',        // Standardgateway (nur bei host/server)
        dns: '',            // Adresse des DNS-Servers, den dieses Gerät fragt
        routes: [],         // statische Einträge, nur bei router
        /* Installierte Programme, wie in Filius: ein Rechner kann
           welche bekommen, ein Switch nicht. Eine Liste von
           Kennungen ('dns', später 'webserver', 'browser'); was
           dahintersteckt, weiß geraet.js. */
        software: [],
        on: true,           // eingeschaltet
        state: {}           // Platz für Protokollzustand (arp, macTable, …)
      };
      if (kind === 'heimrouter') heimVorgabe(node);
      funkErzwingen(node);
      /* ⭐ Der Ordner `/Bilder` ab Werk — nur bei Geräten mit
         Bildschirm (`dateien: true`), denn Router, Switch und
         Heimrouter haben weder Explorer noch Terminal.

         NUR hier und nicht in `fromJSON` oder `einfuegen`: dort
         bringt das Gerät sein Dateisystem mit, und wer den Ordner
         weggeworfen hat, will ihn nicht beim nächsten Laden wieder
         vorfinden. Die Begründung für den Bruch mit „ein neues Gerät
         hat nichts" steht im Kopf von dateien.js. */
      if (k.dateien && window.Dateien) window.Dateien.grundbestand(node);
      nodes.set(id, node);
      changed();
      return node;
    }

    /* ─── Ein Heimrouter kommt LEER aus dem Karton ──────────────
       ⚠️ Auch das ist einmal umgedreht worden. Bis hierher stand
       ein fertig eingerichtetes Gerät auf der Fläche: LAN-Adresse
       192.168.1.1, DHCP-Bereich .100 bis .150, Gateway, Maske —
       mit der Begründung „anstecken, läuft", so wie das Ding im
       eigenen Wohnzimmer. Filius macht es ebenso (42.0.0.10 steht
       im Konstruktor von Gateway.java).

       Vom Nutzer beanstandet: „Ein Heimrouter braucht nichts
       defaultmäßig ausgefüllt." Der Einwand trifft etwas, das die
       alte Begründung übersehen hat: ausgefüllte Felder sind hier
       keine Bequemlichkeit, sondern eine vorweggenommene Antwort.
       Wer ein Gerät auf die Fläche zieht, in dem die Adresse schon
       steht, hat die Frage „welche Adresse gibst du dem Netz im
       Haus" nicht mehr — und das ist die Aufgabe. Dazu kommt das
       Praktische: eine vorgetragene 192.168.1.1 steht im Weg, wenn
       die Klasse mit einem anderen Netz arbeiten soll.

       Was BLEIBT, und warum es kein Widerspruch ist:

         WAN = DHCP-Client   ist keine ausgefüllte Angabe, sondern
                             das, was ein WAN-Anschluss tut. Die
                             Adresse kommt vom Anbieter, und wer
                             sie von Hand einträgt, macht etwas
                             anderes als das, was er nachstellt.
         NAT an              ist die Natur des Geräts und der
                             Grund, warum es nicht „Router" heißt.
                             Abschaltbar bleibt es (der Mitschnitt
                             zeigt dann, dass nichts zurückkommt).
         WLAN aus            ein Funknetz, das sich von selbst
                             aufspannt, hätte einen Namen, den
                             niemand vergeben hat — und das
                             Benennen ist der Unterrichtsgegenstand.

       Der DHCP-Server ist damit eingerichtet, aber AUS und ohne
       Bereich: ein Server, der Adressen aus einem Netz verteilt,
       das es noch nicht gibt, verteilt Unsinn. */
    function heimVorgabe(node) {
      const wan = node.nics[WAN];
      /* Die WAN-Seite fragt, sie trägt nichts ein — und zwar auch
         keine Netzmaske. Im gesperrten Feld eine 255.255.255.0
         stehen zu lassen hieße: „das hat dir der Anbieter gegeben",
         und das hat er nicht (dieselbe Regel wie in dhcpLeeren). */
      wan.dhcp = true; wan.ip = ''; wan.mask = '';

      node.nat = { on: true };
      node.dhcpServer = {
        on: false, nic: LAN,
        von: '', bis: '', mask: '', gateway: '', dns: '',
        lease: 600
      };
      node.wlan = { on: false, ssid: '' };
    }

    /* Übersetzt zwischen Adressen im Heimnetz und der einen
       Adresse, die der Anbieter vergeben hat. Wie dhcpConf: der
       Block entsteht erst, wenn jemand ihn braucht.

       `frei` sind die **Portfreigaben** — die Gegenprobe zu „von
       außen kann niemand anfangen". Sie stehen hier und nicht in
       `node.state`, weil sie eine EINSTELLUNG sind und keine
       Tabelle, die sich von selbst füllt: das ist der ganze
       Unterschied zu den Zeilen, die beim Hinausgehen entstehen. */
    function natConf(node) {
      if (!node.nat) node.nat = { on: false };
      if (!node.nat.frei) node.nat.frei = [];
      return node.nat;
    }

    /* ⚠️ NAT beim Heimrouter ist seit 2026-09-28 keine Frage mehr,
       sondern die Natur des Geräts — der Haken ist aus der
       Oberfläche verschwunden (Nutzer: „Heimrouter nutzen immer
       NAT"). In der Simulation gibt es das Aus weiter, und der
       kopflose Prüfstand fährt es auch weiter: `hr.nat.on = false`
       zeigt, dass das Paket hinausgeht und die Antwort nie kommt.

       Was NICHT vorkommen darf, ist ein gespeicherter Stand mit
       ausgeschaltetem NAT: er käme herein, und niemand könnte es
       wieder anschalten. Deshalb steht diese eine Zeile an jeder
       Stelle, an der ein Gerät aus einer Datei entsteht. */
    function natLaden(node, kindId, d) {
      if (d && d.nat) node.nat = U.deepCopy(d.nat);
      if (kindId === 'heimrouter') natConf(node).on = true;
    }

    /* Automatisches Routing. Wie oben: der Block entsteht erst,
       wenn jemand ihn braucht — ein Router ohne RIP hat kein
       leeres RIP-Feld, sondern gar keines.

       ⚠️ Gespeichert wird nur `on`. Die gelernten Wege liegen in
       `node.state.rip` und gehören einem LAUFENDEN Netz, nicht
       seiner Bauanleitung (siehe rip.js). Wer ein Netz lädt, sieht
       die Tabelle sich füllen — und das ist der Unterricht. */
    function ripConf(node) {
      if (!node.rip) node.rip = { on: false };
      return node.rip;
    }

    // Fortlaufende Namen je Art: Endgerät 1, Endgerät 2, Switch 1 …
    function autoName(kind) {
      const base = KIND[kind].label;
      let n = 1;
      const taken = new Set([...nodes.values()].map(x => x.name));
      while (taken.has(base + ' ' + n)) n++;
      return base + ' ' + n;
    }

    /* ─── Anschlüsse nachträglich anbauen ─────────────────────
       Filius legt die Zahl der Anschlüsse beim Anlegen fest; wer
       ein drittes Netz an den Router hängen will, muss den Router
       wegwerfen und neu bauen — mitsamt allen Adressen, die schon
       darin standen. Das ist genau der Moment, in dem eine Klasse
       aufgibt.

       Ein neuer Anschluss bekommt seine eigene MAC-Adresse und
       keine IP: ein Router hat je Netz eine, und welche das ist,
       weiß nur der Mensch davor. */
    function addNic(nodeId) {
      const node = nodes.get(nodeId);
      if (!node) return { ok: false, error: 'Gerät nicht gefunden.' };
      const k = KIND[node.kind];
      if (feste(node).length >= k.maxPorts)
        return { ok: false, error: k.label + ': mehr als ' + k.maxPorts + ' Anschlüsse gehen nicht.' };
      /* Die neue Buchse gehört hinter die festen und VOR die
         Funkbuchsen — sonst stünde sie hinter ihnen und hieße
         „LAN 6", während die Klasse auf die fünfte Buchse zeigt.
         Der Abgleich baut die Funkbuchsen gleich neu; dass sie
         dabei ihre Nummer wechseln, sieht niemand, denn sie haben
         keine. */
      funkRaeumen();
      const nic = makeNic(node.nics.length);
      node.nics.push(nic);
      funkErzwingen(node);
      funkAbgleich();
      changed();
      return { ok: true, nic };
    }

    /* ─── Welcher Anschluss nimmt das nächste Kabel? ──────────
       ⭐ Die eine Stelle, an der ein Anschluss VON SELBST entsteht.
       Sie steht hier und nicht in flaeche.js, aus demselben Grund
       wie `istWan` und `bruecke`: die Frage „hat dieses Gerät noch
       eine Buchse?" darf nur EINE Antwort haben. Stünde
       `kind === 'switch'` auch in der Fläche, liefe es beim nächsten
       Umbau lautlos auseinander.

       `waechst` steht im KIND-Block und nicht als Abfrage auf die
       Geräteart: ein Switch verteilt, und wie viele Löcher sein
       Gehäuse hat, ist keine Aufgabe für den Unterricht. Beim Router
       ist es genau umgekehrt — dort IST das Anbauen der Gegenstand
       (jedes neue Netz braucht eine eigene Adresse), und beim
       Heimrouter zählt die Rückseite des echten Geräts. Die beiden
       behalten ihren Knopf. */
    function freieNic(nodeId) {
      const node = nodes.get(nodeId);
      if (!node) return -1;
      /* ⚠️ `!k.funkPort` gehört dazu. Hier stand einmal nur
         `findIndex(k => !k.cable)` — und das findet an einem Gerät,
         dessen fester Anschluss belegt ist, die FUNKBUCHSE. Aus
         `addCable` kam dann „… funkt": eine Auskunft über die Karte,
         wo die über das Gerät gebraucht wird. */
      const frei = () => node.nics.findIndex(k => !k.cable && !k.funkPort);
      const i = frei();
      if (i >= 0) return i;
      if (!KIND[node.kind].waechst) return -1;
      return addNic(nodeId).ok ? frei() : -1;
    }

    /* Der Satz, wenn keine Buchse mehr kommt. Beim Switch nennt er
       die Zahl, die der Deckel ist — ohne sie wäre „hat keinen
       freien Anschluss mehr" bei einem Gerät, das eben noch von
       selbst gewachsen ist, keine Auskunft, sondern ein Rätsel. */
    function keinAnschlussSatz(node) {
      const k = KIND[node.kind];
      return k.waechst ? node.name + ': mehr als ' + k.maxPorts + ' Geräte gehen nicht.'
                       : node.name + ' hat keinen freien Anschluss mehr.';
    }

    /* Abbauen geht nur, solange nichts daran steckt und die
       Geräteart ohne ihn noch Sinn hat. Ein Router mit einem
       Anschluss verbindet nichts mehr. */
    function removeNic(nodeId, i) {
      const node = nodes.get(nodeId);
      if (!node) return { ok: false, error: 'Gerät nicht gefunden.' };
      const nic = node.nics[i];
      if (!nic) return { ok: false, error: 'Diesen Anschluss gibt es nicht.' };
      if (nic.funkPort) return { ok: false, error: 'Eine Funkverbindung baut man am Gerät ab, nicht hier.' };
      if (nic.cable) return { ok: false, error: 'Hier steckt noch ein Kabel.' };
      const min = KIND[node.kind].ports === 1 ? 1 : 2;
      if (feste(node).length <= min)
        return { ok: false, error: 'Weniger als ' + min + ' Anschlüsse gehen nicht.' };
      node.nics.splice(i, 1);
      // Kabel merken sich ihren Anschluss als ZAHL. Rutscht ein
      // Anschluss nach vorn, muss jedes Kabel dahinter mitrutschen —
      // sonst hängt es plötzlich am falschen Loch.
      for (const c of cables.values()) {
        for (const end of [c.a, c.b]) {
          if (end.node === nodeId && end.nic > i) end.nic--;
        }
      }
      node.nics.forEach((k, j) => { k.i = j; });
      changed();
      return { ok: true };
    }

    /* ─── Dienste auf einem Gerät ─────────────────────────────
       Beide Einstellungsblöcke entstehen erst, wenn jemand sie
       aufschlägt. Sonst stünden in jeder gespeicherten Datei bei
       jedem Rechner zwei leere Dienste, die niemand benutzt — und
       das, was die Lehrkraft an die Klasse schickt, wäre zur
       Hälfte Leerlauf. */
    function dhcpConf(node) {
      if (!node.dhcpServer) node.dhcpServer = {
        on: false, nic: 0,
        von: '', bis: '', mask: '', gateway: '', dns: '',
        lease: 600,           // Sekunden, nur zur Anzeige
        /* Feste Zuweisungen: Liste aus { mac, ip }. In Filius der
           zweite Reiter des DHCP-Dialogs, „Statische
           Adresszuweisung" (jdhcpkonfiguration_msg11), und dort
           wie hier eine Liste und kein Bereich.

           ⚠️ Sie muss NICHT im Adressbereich liegen — auch das ist
           aus Filius übernommen (DHCPServer.findStaticOffer fragt
           den Bereich gar nicht). Das ist richtig so: eine
           Reservierung ist eine Ausnahme von der Vergabe, und eine
           Ausnahme, die innerhalb der Regel liegen muss, ist
           keine. */
        statisch: []
      };
      // Ein Stand von vor dem 2026-09-27 hat das Feld nicht.
      if (!node.dhcpServer.statisch) node.dhcpServer.statisch = [];
      return node.dhcpServer;
    }

    function dnsConf(node) {
      if (!node.dnsServer) node.dnsServer = { on: false, records: [] };
      return node.dnsServer;
    }

    /* Der Webserver hat nur einen Schalter — Ordner und Port sind
       festgelegt (`/webserver`, 80), wie in Filius. Sie stehen im
       Fenster als ANGABE da, nicht als Feld: sie sind eine
       Eigenschaft des Programms und keine Entscheidung. */
    function webConf(node) {
      if (!node.webServer) node.webServer = { on: false };
      return node.webServer;
    }

    /* ⚠️ Postfächer UND die Post darin gehören ins Speicherformat.
       Eine E-Mail, die nach dem Neuladen weg ist, wäre der eine
       Fehler, den ein Kind persönlich nimmt — und sie liegt ja
       auch im echten Leben auf dem Server, bis jemand sie abholt. */
    function mailConf(node) {
      if (!node.mailServer) node.mailServer = { on: false, domain: '', konten: [] };
      return node.mailServer;
    }

    /* Genau EIN Konto je Gerät, wie in Filius. Die Ports stehen
       darin, weil Filius sie als Feld führt (110 und 25,
       vorbelegt) — es ist die einzige Stelle im ganzen Programm,
       an der ein Kind eine Portnummer eintippt. */
    function mailKonto(node) {
      if (!node.mailKonto) node.mailKonto = {
        name: '', adresse: '', domain: '',
        pop3: '', pop3Port: 110, smtp: '', smtpPort: 25,
        benutzer: '', passwort: '', angemeldet: false,
        posteingang: [], gesendet: []
      };
      /* ⚠️ Zwei Felder, die es vor dem 2026-09-27 nicht gab.
         `domain` wird seither getippt und `adresse` daraus
         abgeleitet (siehe `mail.adresseVon`) — umgekehrt als
         vorher. Ein alter Stand hat nur die Adresse; die Domain
         steht darin hinter dem @ und wird hier herausgelesen,
         damit das Konto nach dem Laden nicht halb leer aussieht. */
      const k = node.mailKonto;
      if (k.domain == null) k.domain = '';
      if (!k.domain && k.adresse && k.adresse.indexOf('@') > 0) {
        k.domain = k.adresse.split('@').pop().toLowerCase();
        if (!k.benutzer) k.benutzer = k.adresse.split('@')[0];
      }
      return k;
    }

    /* ─── Was der Server bringt, gehört dem Server ────────────
       Bei einem Gerät mit DHCP sind Adresse, Netzmaske, Gateway
       und DNS-Server keine Einstellungen, sondern ein
       Leihvertrag. Endet er — weil das Netz von vorn anfängt,
       weil jemand den Haken setzt, weil gerade neu gefragt wird —,
       dann fällt ALLES weg, was er gebracht hat, und nicht nur
       die Adresse.

       Vorher fiel nur die Adresse weg. Übrig blieb ein Gerät mit
       leerem Adressfeld, aber ausgefüllter Netzmaske und einem
       Gateway aus dem letzten Durchgang: vier Felder in zwei
       verschiedenen Zuständen, von denen das Gerät keines selbst
       gesetzt hatte. Und weil ein Gateway ohne Adresse in keinem
       Netz liegen KANN, hing am Gerät obendrein ein „!" mit einer
       Meldung über etwas, das niemand eingetragen hat. Genau die
       Sorte Fehlmeldung, die ein Kind eine Viertelstunde kostet.

       `nur` schränkt auf eine Netzwerkkarte ein (beim erneuten
       Fragen ist nur die eine dran, nicht alle).                */
    function dhcpLeeren(node, nur) {
      if (!node.nics.some(k => k.dhcp)) return false;
      let etwas = false;
      for (const nic of node.nics) {
        if (!nic.dhcp) continue;
        if (nur != null && nic.i !== nur) continue;
        if (nic.ip || nic.mask) etwas = true;
        nic.ip = '';
        nic.mask = '';
      }
      /* Gateway und DNS-Server stehen am GERÄT, der Haken am
         Anschluss — sie kommen aber über einen Anschluss herein.
         Solange noch irgendeine Karte eine Adresse trägt, bleiben
         sie stehen: dann gehören sie zu der. */
      if (!node.nics.some(k => k.ip) && (node.gateway || node.dns)) {
        node.gateway = '';
        node.dns = '';
        etwas = true;
      }
      return etwas;
    }

    /* Den Haken umlegen — und zwar nur hier. Wer `nic.dhcp` von
       Hand setzt, bekommt ein Gerät mit halb geräumten Feldern, und
       genau das war der Fehler, den dhcpLeeren beseitigt. */
    function setDhcp(node, i, an) {
      const nic = node.nics[i | 0];
      if (!nic) return;
      nic.dhcp = !!an;
      if (nic.dhcp) {
        dhcpLeeren(node);
      } else if (!nic.mask) {
        /* Wieder von Hand: dieselbe Vorgabe wie bei einem frisch
           angelegten Anschluss (makeNic). Ein leeres Maskenfeld
           wäre hier eine Lücke, die man übersieht — bei DHCP war
           es eine Auskunft. */
        nic.mask = '255.255.255.0';
      }
      changed();
    }

    /* ═══ Funkverbindungen ═══════════════════════════════════
       Ein Funkkabel zieht niemand. Es entsteht und vergeht mit
       einer Einstellung: Karte auf „Drahtlos", Netzname gewählt,
       ein Zugangspunkt strahlt ihn aus — dann steht die
       Verbindung. Genau so macht es Filius
       (JHostKonfiguration.updateWifiConnection räumt beim Ändern
       des Netznamens die alte Verbindung ab und legt die neue an).

       ── Warum es trotzdem ein Kabel IST ────────────────────────
       Im Modell ist eine Funkverbindung ein ganz normales Kabel
       mit `funk: true`. Damit gelten für Funk dieselben Regeln wie
       für Draht: der Switch lernt MAC-Adressen, ARP läuft als
       Rundruf, jeder Rahmen steht im Mitschnitt, die
       Subnetzfärbung greift. Eine eigene Funkzustellung daneben
       wäre eine zweite Welt mit denselben Regeln — und hätte
       nichts zu erklären, was am Kabel nicht auch zu erklären ist.
       Was Funk vom Draht unterscheidet, ist für diesen Unterricht
       genau eines: man steckt es nicht. Deshalb der Strich statt
       der Linie und kein zweiter Protokollstapel.

       ── Warum abräumen und neu bauen ──────────────────────────
       Der Abgleich wirft ERST alles Funk weg (Kabel und Buchsen)
       und baut dann neu. Der bequemere Weg — nachsehen, was noch
       stimmt, und nur die Änderung anfassen — hat einen Haken,
       der sich nicht zeigt, sondern anwächst: bliebe eine Buchse
       stehen, die niemand mehr braucht, hätte der Switch nach
       zehn Schulstunden zwanzig Löcher. Bei einer Handvoll Geräte
       ist Neubauen ohnehin billiger als Buchführung darüber.

       Funkbuchsen stehen deshalb IMMER hinter den festen und
       werden nie gespeichert (siehe toJSON). Ihre Nummer darf
       sich ändern — sie haben keine, die jemand liest.          */

    let imAbgleich = false;

    function funkRaeumen() {
      for (const c of [...cables.values()]) if (c.funk) removeCable(c.id);
      for (const n of nodes.values()) {
        if (n.nics.some(k => k.funkPort)) {
          n.nics = n.nics.filter(k => !k.funkPort);
          n.nics.forEach((k, j) => { k.i = j; });
        }
      }
    }

    /* Wer strahlt gerade was aus? Für die Auswahlliste im
       Gerätefenster — in Filius füllt JHostKonfiguration.updateSsid
       sie genauso aus allen Zugangspunkten der Fläche. */
    function zugangspunkte() {
      return list().filter(strahlt).map(n => ({ node: n, ssid: n.wlan.ssid }));
    }

    function funkAbgleich() {
      if (imAbgleich) return { neu: 0, fehler: [] };
      imAbgleich = true;
      try {
        funkRaeumen();

        /* Gleicher Name zweimal? Dann gewinnt der erste in der
           Liste — nachvollziehbar und immer derselbe. Im echten
           Netz entschiede die Feldstärke; die gibt es hier nicht,
           und sie zu erfinden hieße, eine Verbindung zu erklären,
           die von einer unsichtbaren Zahl abhängt. */
        const ap = new Map();                 // ssid → Gerät
        for (const z of zugangspunkte()) if (!ap.has(z.ssid)) ap.set(z.ssid, z.node);

        let neu = 0;
        const fehler = [];
        for (const n of list()) {
          for (const nic of n.nics) {
            if (!nic.funk || !nic.ssid) continue;
            if (KIND[n.kind].wlan) continue;   // ein Zugangspunkt funkt nicht selbst als Gast
            const ziel = ap.get(nic.ssid);
            if (!ziel) {
              fehler.push({ node: n, nic: nic.i, why: 'Kein Gerät strahlt „' + nic.ssid + '" aus.' });
              continue;
            }
            if (ziel.id === n.id) continue;
            // Die Funkbuchse am Zugangspunkt — je Gast eine.
            const buchse = makeNic(ziel.nics.length);
            buchse.funkPort = true;
            ziel.nics.push(buchse);
            const r = addCable(n.id, nic.i, ziel.id, buchse.i, { funk: true });
            if (r.ok) neu++;
            else { ziel.nics.pop(); fehler.push({ node: n, nic: nic.i, why: r.error }); }
          }
        }
        return { neu, fehler };
      } finally {
        imAbgleich = false;
      }
    }

    /* Den Funkschalter einer Karte umlegen — und zwar nur hier,
       aus demselben Grund wie bei setDhcp: eine Karte, die funkt
       und gleichzeitig ein Kabel trägt, ist ein Zustand, den es
       nicht geben darf. Filius verbietet ihn ebenfalls (GUIEvents
       lässt eine drahtlose Karte gar nicht erst verkabeln). */
    function setFunk(node, i, an, ssid) {
      const nic = node.nics[i | 0];
      if (!nic) return;
      /* Bei einem Gerät ohne Kabelbuchse gibt es nichts
         umzuschalten. Die Oberfläche bietet den Knopf gar nicht
         erst an (konfig.js) — hier steht die Regel trotzdem, denn
         ein „nein" nur im Formular ist kein „nein" im Modell, und
         der nächste Aufrufer ist vielleicht ein anderer. Die SSID
         darf weiterhin gesetzt werden. */
      if (nurFunk(node) && !an) return;
      nic.funk = !!an;
      if (nic.funk) {
        if (ssid != null) nic.ssid = String(ssid);
        // Ein gestecktes Kabel geht ab: gefunkt wird ohne.
        if (nic.cable) {
          const c = cables.get(nic.cable);
          if (c && !c.funk) removeCable(c.id);
        }
      } else {
        nic.ssid = '';
      }
      funkAbgleich();
      changed();
    }

    function removeNode(id) {
      const node = nodes.get(id);
      if (!node) return;
      for (const nic of node.nics) if (nic.cable) removeCable(nic.cable);
      engine.dropOwner(id);       // eingeplante Zeitgeber dieses Geräts weg
      nodes.delete(id);
      /* Sonst bliebe am Zugangspunkt die Funkbuchse des gelöschten
         Geräts stehen — eine Buchse für einen Gast, den es nicht
         mehr gibt. Beim Löschen eines Zugangspunkts andersherum:
         seine Gäste suchen danach einen Namen, den niemand mehr
         ausstrahlt, und sagen das auch. */
      funkAbgleich();
      changed();
    }

    /* ─── Kabel ───────────────────────────────────────────────
       Ein Kabel verbindet genau zwei Anschlüsse. Die Verzögerung
       ist eine Eigenschaft des Kabels, nicht eine globale Zahl wie
       in Filius — damit lässt sich später „diese Leitung ist die
       langsame" zeigen, und eine Aufgabe kann eine WAN-Strecke
       nachstellen. */
    function addCable(aNodeId, aNic, bNodeId, bNic, opts) {
      const A = nodes.get(aNodeId), B = nodes.get(bNodeId);
      if (!A || !B) return { ok: false, error: 'Gerät nicht gefunden.' };
      if (A === B)  return { ok: false, error: 'Ein Kabel von einem Gerät zu sich selbst bringt nichts.' };
      const na = A.nics[aNic], nb = B.nics[bNic];
      if (!na || !nb) return { ok: false, error: 'Diesen Anschluss gibt es nicht.' };
      if (na.cable)   return { ok: false, error: 'An diesem Anschluss steckt schon ein Kabel.' };
      if (nb.cable)   return { ok: false, error: 'An diesem Anschluss steckt schon ein Kabel.' };
      /* Ein Kabel in eine Karte, die funkt — oder in die Funkbuchse
         eines Zugangspunkts. Beides gibt es nicht, und beides ist
         ein Missverständnis, das man benennen muss: sonst zieht
         jemand dreimal dasselbe Kabel und hält das Programm für
         kaputt. Filius lässt eine drahtlose Karte ebenfalls nicht
         verkabeln (GUIEvents, beim Ziehen einer Verbindung). */
      if (!(opts && opts.funk)) {
        for (const [n, k] of [[A, na], [B, nb]]) {
          /* ⚠️ Vor der allgemeinen Funkprüfung, weil der Rat darin
             beim Handy ins Leere geht: „Stell sie auf
             Kabelgebunden" — den Knopf gibt es dort nicht. Ein
             Hinweis, der auf etwas zeigt, was nicht da ist, ist
             schlimmer als keiner. */
          if (nurFunk(n)) return { ok: false, error: n.name + ' geht nur über WLAN — '
            + 'ein Smartphone hat keine Kabelbuchse. Lass einen Switch oder Heimrouter '
            + 'ein WLAN ausstrahlen und wähle es am Gerät aus.' };
          if (k.funk) return { ok: false, error: n.name + ' funkt — in eine drahtlose Karte '
            + 'steckt man kein Kabel. Stell sie auf „Kabelgebunden (LAN)", wenn du eines willst.' };
          if (k.funkPort) return { ok: false, error: 'Diese Buchse gehört zum WLAN von '
            + n.name + ' und ist keine Steckdose.' };
        }
      }

      const id = U.nextId('c');
      const cable = {
        id,
        a: { node: aNodeId, nic: aNic },
        b: { node: bNodeId, nic: bNic },
        /* 100 ms. Physikalisch ist das für ein LAN-Kabel absurd
           (dort sind es Mikrosekunden) — didaktisch ist es die
           wichtigste Zahl im ganzen Programm: eine Leitung muss
           man dauern SEHEN, sonst ist die Kernaussage der Schicht
           1 unsichtbar. Filius trifft dieselbe Entscheidung, nur
           kleiner (mindestens 5 ms).

           Warum nicht 10 ms wie zuerst: der Bildschirm zeichnet
           alle 16 ms ein Bild. Ein 10-ms-Kabel ist damit kürzer
           als ein Bild — man sieht das Paket gar nicht fliegen,
           sondern nur hier und da aufblitzen. Bei 100 ms sind es
           sechs Bilder je Kabel, und bei langsamem Tempo wird
           daraus eine Bewegung, der eine Klasse folgen kann.

           Je Kabel einstellbar, damit sich eine langsame Strecke
           zeigen lässt. */
        delay: (opts && opts.delay) || KABEL_MS,
        loss: (opts && opts.loss) || 0,       // 0..1 Verlustwahrscheinlichkeit
        /* Kein Kabel, sondern Luft. Ändert an der Zustellung
           nichts (siehe funkAbgleich) und an der Darstellung
           alles: gestrichelt statt durchgezogen. */
        funk: !!(opts && opts.funk),
        up: true
      };
      cables.set(id, cable);
      na.cable = id; nb.cable = id;
      changed();
      return { ok: true, cable };
    }

    function removeCable(id) {
      const c = cables.get(id);
      if (!c) return;
      const na = nicOf(c.a), nb = nicOf(c.b);
      if (na) na.cable = null;
      if (nb) nb.cable = null;
      cables.delete(id);
      changed();
    }

    const nicOf = (ref) => {
      const n = nodes.get(ref.node);
      return n ? n.nics[ref.nic] : null;
    };

    /* Das Gegenstück eines Anschlusses: wo landet ein Rahmen, den
       ich hier hineinschicke? */
    function peerOf(nodeId, nicIndex) {
      const node = nodes.get(nodeId);
      if (!node) return null;
      const nic = node.nics[nicIndex];
      if (!nic || !nic.cable) return null;
      const c = cables.get(nic.cable);
      if (!c) return null;
      const far = (c.a.node === nodeId && c.a.nic === nicIndex) ? c.b : c.a;
      return { cable: c, node: nodes.get(far.node), nic: far.nic };
    }

    /* ─── Rahmen über ein Kabel schicken ──────────────────────
       Hier und NUR hier entsteht Verzögerung. Alles andere in
       diesem Programm rechnet ohne Zeitverbrauch — das ist die
       Vereinfachung, die Filius genauso macht und die didaktisch
       richtig ist: gelernt werden soll, dass Leitungen dauern,
       nicht dass Rechner rechnen.

       Der Rahmen wird beim Übergeben KOPIERT. Ohne das hielten
       zwei Geräte dasselbe Objekt in der Hand, und eine Änderung
       am Ziel (TTL herunterzählen) würde die Aufzeichnung der
       Quelle nachträglich verfälschen. Filius macht dasselbe mit
       SerializationUtils.clone(); wir nehmen JSON, weil unsere
       Rahmen reine Daten sind. */
    function sendFrame(fromNodeId, fromNic, frame, onArrive) {
      const link = peerOf(fromNodeId, fromNic);
      const src = nodes.get(fromNodeId);
      const nic = src && src.nics[fromNic];

      if (!src || !src.on) return { ok: false, why: 'off' };
      if (!nic || !nic.up)  return { ok: false, why: 'nic_down' };
      if (!link)            return { ok: false, why: 'no_cable' };
      if (!link.cable.up)   return { ok: false, why: 'cable_down' };

      engine.emit('event', {
        kind: 'wire', dir: 'out', node: fromNodeId, nic: fromNic,
        cable: link.cable.id, frame: frame, t: engine.now
      });

      // Verlust: der Rahmen geht los und kommt nie an. Genau so
      // soll es sich anfühlen — die Aufzeichnung zeigt den
      // Abgang, nicht die Ankunft.
      if (link.cable.loss > 0 && engine.rand() < link.cable.loss) {
        engine.at(link.cable.delay, () => {
          engine.emit('event', {
            kind: 'drop', cable: link.cable.id, frame: frame, t: engine.now
          });
        }, 'verlust', fromNodeId);
        return { ok: true, lost: true };
      }

      const copy = U.deepCopy(frame);
      engine.at(link.cable.delay, () => {
        const dst = link.node;
        if (!dst || !dst.on) return;                       // ausgeschaltet: fällt weg
        const dnic = dst.nics[link.nic];
        if (!dnic || !dnic.up) return;
        engine.emit('event', {
          kind: 'wire', dir: 'in', node: dst.id, nic: link.nic,
          cable: link.cable.id, frame: copy, t: engine.now
        });
        if (onArrive) onArrive(dst, link.nic, copy);
      }, 'kabel', fromNodeId);

      return { ok: true };
    }

    /* ─── Auskunft ────────────────────────────────────────────*/
    const list       = () => [...nodes.values()];
    const cableList  = () => [...cables.values()];
    const get        = (id) => nodes.get(id) || null;
    const getCable   = (id) => cables.get(id) || null;
    const byName     = (nm) => list().find(n => n.name === nm) || null;

    /* Wem gehört diese IP? Wird für Ping-Ziele und für die
       Doppelvergabe-Warnung gebraucht. Gibt auch den Anschluss
       zurück, denn ein Router hat mehrere. */
    function findByIp(ipStr) {
      const ip = U.ip2int(ipStr);
      if (ip === null) return null;
      for (const n of nodes.values()) {
        for (const nic of n.nics) {
          if (nic.ip && U.ip2int(nic.ip) === ip) return { node: n, nic: nic };
        }
      }
      return null;
    }

    /* Doppelt vergebene Adressen finden — der häufigste Fehler im
       Unterricht, und einer, der sich als „geht halt nicht"
       äußert. Deshalb sagen wir es von selbst. */
    function duplicateIps() {
      const seen = new Map(), dups = [];
      for (const n of nodes.values()) {
        for (const nic of n.nics) {
          if (!nic.ip) continue;
          const key = nic.ip;
          if (seen.has(key)) dups.push({ ip: key, a: seen.get(key), b: { node: n, nic } });
          else seen.set(key, { node: n, nic });
        }
      }
      return dups;
    }

    /* ─── Speichern und Laden ─────────────────────────────────*/
    function toJSON() {
      return {
        v: 2,
        seed: engine.seed,
        nodes: list().map(n => {
          /* Eine geliehene Angabe ist KEINE Einstellung. Wer ein
             Netz speichert, in dem drei Rechner per DHCP an ihre
             Adresse gekommen sind, speichert „diese drei fragen
             nach" — nicht „diese drei haben .101 bis .103". Sonst
             stünde beim nächsten Öffnen eine Adresse da, die noch
             kein Server vergeben hat, und die Klasse sieht DHCP
             nie arbeiten.

             Das gilt für alle vier Angaben, nicht nur für die
             Adresse: Netzmaske, Gateway und DNS-Server kommen
             genauso vom Server. Stünden sie in der Datei, wäre
             beim nächsten Öffnen genau der halb ausgefüllte
             Zustand wieder da, den dhcpLeeren beseitigt. */
          const geliehen = n.nics.some(k => k.dhcp);
          return {
            id: n.id, kind: n.kind, x: n.x, y: n.y, name: n.name,
            gateway: geliehen ? '' : n.gateway,
            dns: geliehen ? '' : n.dns,
            on: n.on,
            routes: U.deepCopy(n.routes || []),
            software: U.deepCopy(n.software || []),
            /* Die Dateien des Geräts — nur, wenn es welche gibt.
               Ein leeres Dateisystem schreibt das Feld nicht, wie
               bei den Diensten auch: ein Stand soll nur enthalten,
               was jemand angelegt hat. */
            dateien: n.dateien && Object.keys(n.dateien).length
              ? U.deepCopy(n.dateien) : undefined,
            // Dienste nur, wenn welche eingerichtet sind.
            dhcpServer: n.dhcpServer ? U.deepCopy(n.dhcpServer) : undefined,
            dnsServer:  n.dnsServer  ? U.deepCopy(n.dnsServer)  : undefined,
            webServer:  n.webServer  ? U.deepCopy(n.webServer)  : undefined,
            mailServer: n.mailServer ? U.deepCopy(n.mailServer) : undefined,
            mailKonto:  n.mailKonto  ? U.deepCopy(n.mailKonto)  : undefined,
            nat:  n.nat  ? U.deepCopy(n.nat)  : undefined,
            /* Nur der Schalter. Die gelernten Wege stehen in
               node.state und sind Laufzeitwissen wie die ARP- und
               die NAT-Tabelle. */
            rip:  n.rip  ? { on: !!n.rip.on }  : undefined,
            wlan: n.wlan ? U.deepCopy(n.wlan) : undefined,
            /* Funkbuchsen stehen NICHT in der Datei. Sie gehören
               keinem Gerät, sondern einer Verbindung, und die baut
               funkAbgleich beim Laden neu — sonst wüchse der Switch
               bei jedem Sichern um die Buchsen des letzten Mals. */
            nics: n.nics.filter(k => !k.funkPort).map(k => ({
              i: k.i, mac: k.mac,
              ip:   k.dhcp ? '' : k.ip,
              mask: k.dhcp ? '' : k.mask,
              dhcp: !!k.dhcp, up: k.up,
              // Was die Karte SUCHT, gehört zur Bauanleitung.
              funk: !!k.funk, ssid: k.funk ? (k.ssid || '') : ''
            }))
          };
        }),
        // Und aus demselben Grund keine Funkkabel.
        cables: cableList().filter(c => !c.funk).map(c => ({
          id: c.id, a: c.a, b: c.b, delay: c.delay, loss: c.loss, up: c.up
        }))
      };
    }

    /* Gerätenamen sind nicht mehr von Hand änderbar, also darf ein
       gespeicherter Stand auch nachgezogen werden: aus „Rechner 3"
       wird „Endgerät 3". Ohne das stünde auf der Fläche E3, im
       Fensterkopf aber „Rechner 3" — und eine Klasse, die den alten
       Stand von gestern öffnet, hätte zwei Namen für ein Gerät. */
    function altName(d) {
      const m = /^Rechner(\s+\d+)?$/.exec(String(d.name || ''));
      if (m && d.kind === 'host') return 'Endgerät' + (m[1] || '');
      return d.name;
    }

    function fromJSON(data) {
      nodes.clear(); cables.clear();
      if (!data || !data.nodes) { changed(); return; }

      let maxN = 0;
      const num = (id) => parseInt(String(id).split('-')[1] || '0', 36) || 0;

      for (const d of data.nodes) {
        const k = KIND[d.kind] || KIND.host;
        const node = {
          id: d.id, kind: d.kind, x: d.x, y: d.y, name: altName(d),
          gateway: d.gateway || '', dns: d.dns || '',
          on: d.on !== false,
          routes: d.routes || [],
          software: d.software || [],
          nics: (d.nics || []).map((s, i) => ({
            /* `s.mac || newMac()`: eine Datei ohne MAC-Adresse darf
               nicht zu einem Anschluss ohne MAC führen. Vorher stand
               hier nur `s.mac` — ein Szenario, das die Adresse
               vergisst, hätte `undefined` in jeden Ethernet-Rahmen
               geschrieben, und ARP wäre auf eine Art gescheitert,
               die kein Kind deuten kann. */
            i: i, mac: s.mac || newMac(),
            /* Die Vorgabe 255.255.255.0 gilt nur für einen
               Anschluss, den jemand von Hand einrichtet. Ein
               Anschluss mit DHCP bekommt seine Maske vom Server —
               ihm hier eine hinzuschreiben, hieße: Adressfeld leer,
               Maskenfeld gefüllt, und beides angeblich „kommt vom
               Server". */
            ip: s.ip || '', mask: s.mask || (s.dhcp ? '' : '255.255.255.0'),
            dhcp: !!s.dhcp,
            funk: !!s.funk, ssid: s.ssid || '', funkPort: false,
            cable: null, up: s.up !== false
          })),
          state: {}
        };
        if (d.dhcpServer) node.dhcpServer = U.deepCopy(d.dhcpServer);
        if (d.dnsServer)  node.dnsServer  = U.deepCopy(d.dnsServer);
        if (d.webServer)  node.webServer  = U.deepCopy(d.webServer);
        if (d.mailServer) node.mailServer = U.deepCopy(d.mailServer);
        if (d.mailKonto)  node.mailKonto  = U.deepCopy(d.mailKonto);
        natLaden(node, k.id, d);
        if (d.rip)  node.rip  = { on: !!d.rip.on };
        if (d.wlan) node.wlan = U.deepCopy(d.wlan);
        if (d.dateien) node.dateien = U.deepCopy(d.dateien);
        // Fehlende Anschlüsse auffüllen, falls eine Geräteart
        // später mehr Ports bekommt als die Datei kennt.
        while (node.nics.length < k.ports) node.nics.push(makeNic(node.nics.length));
        /* Alte Stände nachziehen: ein gespeichertes Handy hat
           vielleicht noch eine Kabelkarte. Die wird hier zur
           Funkkarte; das Kabel dazu wird weiter unten gar nicht
           erst eingehängt. */
        funkErzwingen(node);
        nodes.set(node.id, node);
        maxN = Math.max(maxN, num(d.id));
      }

      for (const d of data.cables || []) {
        const c = {
          id: d.id, a: d.a, b: d.b,
          // Derselbe Vorgabewert wie bei addCable. Hier stand
          // einmal 200 (µs!) — ein Kabel aus einer Datei ohne
          // Laufzeitangabe war damit fünfhundertmal schneller als
          // ein frisch gezogenes, und niemand hätte den
          // Unterschied erklären können.
          delay: d.delay || KABEL_MS, loss: d.loss || 0, up: d.up !== false
        };
        const na = nicOf(c.a), nb = nicOf(c.b);
        // Ein Kabel ohne beide Enden ist kaputt — lieber weglassen
        // als eine halbe Verbindung zeichnen.
        if (!na || !nb) continue;
        /* ⚠️ Und keines in eine Funkkarte. Das trifft zwei Fälle:
           einen von Hand verbogenen Stand — und jeden Stand von
           vor dem 2026-09-27, in dem ein Handy noch am Kabel hing
           (siehe `funkErzwingen` oben). Ein Kabel an einer
           Funkkarte wäre ein Strich auf der Fläche, den kein
           Formular mehr erklärt und den niemand lösen kann. */
        if (na.funk || nb.funk) continue;
        cables.set(c.id, c);
        na.cable = c.id; nb.cable = c.id;
        maxN = Math.max(maxN, num(d.id));
      }

      U.bumpId(maxN);
      /* Funkverbindungen stehen nicht in der Datei — sie ergeben
         sich aus Netznamen und Karteneinstellung und werden hier
         hergestellt. Ein Stand, in dem ein Handy im WLAN hing,
         zeigt es nach dem Laden also wieder; ein Stand, in dem
         inzwischen der Netzname geändert wurde, nicht mehr. Genau
         das ist richtig: gespeichert wird, wonach gesucht wird,
         nicht, was gerade gefunden wurde. */
      funkAbgleich();
      changed();
    }

    /* ─── Ein Ausschnitt: was beim Kopieren mitkommt ────────────
       Dasselbe Format wie `toJSON`, nur eben für eine Handvoll
       Geräte statt für alle. Dass es dasselbe Format ist, ist die
       ganze Absicht: die Zwischenablage ist damit ein Netzstand im
       Kleinen, und `einfuegen` muss nichts kennen, was `fromJSON`
       nicht auch kennt.

       ⚠️ Mitgenommen werden nur Kabel, deren BEIDE Enden im
       Ausschnitt liegen. Ein halbes Kabel gibt es nicht, und ein
       Kabel, das man mitkopiert und beim Einfügen an das Original
       hängt, wäre eine Verbindung, die niemand gezogen hat. */
    function ausschnitt(ids) {
      const drin = new Set(ids);
      const all = toJSON();
      return {
        v: all.v,
        nodes: all.nodes.filter(d => drin.has(d.id)),
        cables: all.cables.filter(c => drin.has(c.a.node) && drin.has(c.b.node))
      };
    }

    /* ─── Einen Ausschnitt einfügen ─────────────────────────────
       Neue Kennungen, neue Namen, NEUE MAC-ADRESSEN — und sonst
       alles wie im Original.

       ⚠️ Die MAC-Adresse ist der Punkt, an dem eine bequeme
       Umsetzung lautlos kaputtgeht. Kopiert man sie mit, hängen
       zwei Karten mit derselben MAC am selben Switch; der lernt
       dann zwei Anschlüsse für eine Adresse und liefert abwechselnd
       an den Falschen aus. Das ist kein Fehler, den eine Klasse
       findet — und es ist genau der Fehler, vor dem `newMac` oben
       warnt. Die IP-Adresse wird dagegen MITKOPIERT: sie ist
       eingetragen, nicht eingebrannt — eine stille Änderung wäre
       hier die schlechtere Antwort. Zwei gleiche Adressen sind
       seit dem Heimrouter ohnehin kein Fehler mehr (die Fläche
       setzt dafür kein „!" mehr, siehe flaeche.js/problemOf); die
       Kurzmeldung beim Einfügen sagt es trotzdem.

       `dx`/`dy` verschieben den ganzen Ausschnitt, damit das
       Eingefügte nicht genau auf dem Original liegt. Wie weit,
       entscheidet der Rufer: nur er weiß, wo der Rand des Feldes
       liegt und was gerade im Bild ist (app.js, einfuegenVersatz). */
    function einfuegen(data, dx, dy) {
      if (!data || !data.nodes || !data.nodes.length) return [];
      dx = dx || 0; dy = dy || 0;

      const neuId = new Map();       // alte Kennung → neue
      const neu = [];

      for (const d of data.nodes) {
        const k = KIND[d.kind] || KIND.host;
        const node = addNode(d.kind, (d.x || 0) + dx, (d.y || 0) + dy);
        neuId.set(d.id, node.id);

        node.gateway = d.gateway || '';
        node.dns = d.dns || '';
        node.on = d.on !== false;
        node.routes = U.deepCopy(d.routes || []);
        node.software = U.deepCopy(d.software || []);
        if (d.dhcpServer) node.dhcpServer = U.deepCopy(d.dhcpServer);
        if (d.dnsServer)  node.dnsServer  = U.deepCopy(d.dnsServer);
        if (d.webServer)  node.webServer  = U.deepCopy(d.webServer);
        if (d.mailServer) node.mailServer = U.deepCopy(d.mailServer);
        if (d.mailKonto)  node.mailKonto  = U.deepCopy(d.mailKonto);
        natLaden(node, node.kind, d);
        if (d.rip)  node.rip  = { on: !!d.rip.on };
        if (d.wlan) node.wlan = U.deepCopy(d.wlan);
        /* Die Dateien kommen MIT — anders als die MAC-Adresse.
           Eine doppelte MAC ist der Fehler, den niemand findet;
           eine kopierte Datei ist genau das, was man beim
           Einfügen erwartet (und ein zweiter Webserver mit
           leerem Ordner wäre eine Überraschung). */
        if (d.dateien) node.dateien = U.deepCopy(d.dateien);

        /* Die Anschlüsse: so viele wie im Original (ein kopierter
           Router mit drei Karten hat drei), aber jeder mit seiner
           eigenen, frischen MAC-Adresse. `addNode` hat die
           Grundzahl schon angelegt, der Rest wird angebaut. */
        const quellen = (d.nics || []).filter(s => !s.funkPort);
        while (node.nics.length < quellen.length
               && feste(node).length < k.maxPorts) node.nics.push(makeNic(node.nics.length));
        quellen.forEach((s, i) => {
          const nic = node.nics[i];
          if (!nic) return;
          nic.ip = s.ip || '';
          nic.mask = s.mask || (s.dhcp ? '' : '255.255.255.0');
          nic.dhcp = !!s.dhcp;
          nic.funk = !!s.funk;
          nic.ssid = s.ssid || '';
          nic.up = s.up !== false;
        });
        // Eine kopierte Kabelkarte macht aus einem Handy kein
        // Gerät mit Buchse.
        funkErzwingen(node);
        neu.push(node.id);
      }

      for (const c of data.cables || []) {
        const a = neuId.get(c.a.node), b = neuId.get(c.b.node);
        if (!a || !b) continue;
        addCable(a, c.a.nic, b, c.b.nic, { delay: c.delay, loss: c.loss });
      }

      funkAbgleich();
      changed();
      return neu;
    }

    /* ─── Beobachter ──────────────────────────────────────────
       Ein einziges Signal „die Topologie hat sich geändert". Die
       Oberfläche zeichnet daraufhin neu; die Protokollschicht
       wirft ihre Tabellen weg, wo nötig. */
    const watchers = [];
    const onChange = (fn) => { watchers.push(fn); return () => {
      const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1);
    }; };
    function changed() {
      for (const fn of watchers.slice()) {
        try { fn(); } catch (e) { console.error('[netz] Beobachter:', e); }
      }
    }

    return {
      KIND, WAN, LAN,
      kurzName: (node) => kurzName(node, list()),
      addNode, removeNode, addCable, removeCable,
      addNic, removeNic, freieNic, keinAnschlussSatz, dhcpConf, dnsConf, webConf, mailConf, mailKonto, natConf, ripConf, wlanConf,
      dhcpLeeren, setDhcp, setFunk,
      // „Hat dieses Gerät überhaupt eine Kabelbuchse?" — wie
      // `istWan` und `strahlt` eine Frage, die NUR hier
      // beantwortet wird.
      nurFunk,
      funkAbgleich, zugangspunkte,
      istHeim, istWan, istLan, brueckeNic, bruecke, portLabel, strahlt,
      dienstLaeuft, laufendeDienste,
      feste: (node) => feste(node),
      peerOf, sendFrame, nicOf,
      list, cableList, get, getCable, byName, findByIp, duplicateIps,
      toJSON, fromJSON, ausschnitt, einfuegen, onChange, changed,
      get count() { return nodes.size; }
    };
  }

  Netz.KIND = KIND;
  Netz.kurzName = kurzName;
  Netz.WAN = WAN;
  Netz.LAN = LAN;
  Netz.istHeim = istHeim;
  Netz.istWan = istWan;
  Netz.istLan = istLan;
  Netz.brueckeNic = brueckeNic;
  Netz.bruecke = bruecke;
  Netz.portLabel = portLabel;
  Netz.strahlt = strahlt;
  Netz.dienstLaeuft = dienstLaeuft;
  Netz.laufendeDienste = laufendeDienste;
  window.Netz = Netz;
})();
