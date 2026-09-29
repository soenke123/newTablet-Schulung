/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — konfig.js   ·   Das Einstellformular
   ══════════════════════════════════════════════════════════════
   EIN Formular für alle Orte, an denen ein Gerät eingestellt wird:

     · das Fenster neben dem Gerät   (Entwurf, panels.js)
     · die Geräteoberfläche          (Aktion, geraet.js)

   ── Warum das eine eigene Datei ist ───────────────────────────
   Vorher stand dasselbe Formular zweimal da. Zwei Kopien heißt:
   eine neue Einstellung muss an zwei Stellen eingebaut werden,
   und beim dritten Mal vergisst man eine. Mit DHCP, DNS und den
   anbaubaren Anschlüssen wären daraus zwei Formulare mit je zehn
   Feldern geworden. Jetzt gibt es eines.

   ── KLEIN und GROSS ───────────────────────────────────────────
   Das Formular hat zwei Größen, und die Grenze dazwischen ist
   die wichtigste Entscheidung in dieser Datei:

     klein   MAC-Adresse · IP-Adresse · Netzmaske · Gateway ·
             Domain Name System. Genau die Zeilen, die Filius in
             JHostKonfiguration oben hat, und genau die, die man
             beim Aufbauen eines Netzes anfasst. Das Fenster ist
             so schmal, dass es neben das Gerät passt.

     groß    dazu: die Erklärung von Netz- und Geräteteil, DHCP
             (holen und verteilen), Netzwerkkarten an- und
             abbauen, die Tabellen, die das Gerät sich selbst
             gebaut hat, und „Gerät löschen". Das Fenster wandert
             dafür an den rechten Rand.

   Alles, was nicht zum ERSTEN Einrichten gehört, steht in der
   großen Ansicht. Ein Kind, das eine IP-Adresse eintragen soll,
   sieht ein Fenster mit fünf Zeilen — nicht eines mit fünfzehn.

   ── Netzteil und Geräteteil in Farbe ──────────────────────────
   Was die Maske zum Netz zählt und was zum Gerät: der Begriff, an
   dem in der Mittelstufe alles hängt, und aus vier Zahlen mit
   Punkten ist er nicht abzulesen.

   Das stand einmal als zweite, farbige Zeile UNTER dem Feld —
   dieselbe Adresse zweimal untereinander. Jetzt steht sie einmal
   da, nämlich im Feld selbst: hinter dem Eingabefeld liegt eine
   Spiegelschicht mit denselben Zeichen in denselben zwei Farben,
   das Feld darüber ist durchsichtig geschrieben. Zeichen für
   Zeichen deckungsgleich — deshalb dieselbe Schrift, dieselbe
   Größe, dieselbe Polsterung auf beiden Seiten. Der Schreibstrich
   bleibt sichtbar, getippt wird wie in jedem anderen Feld.

   ── Eine Zeile je Angabe ──────────────────────────────────────
   Beschriftung links, Feld rechts, alles auf einer Zeile:
   „MAC-Adresse: …", „IP-Adresse: …". Beschriftung über dem Feld
   kostete bei fünf Angaben fünf zusätzliche Zeilen, und das
   Fenster war höher als das Netz darunter.

   ── Das Schloss ───────────────────────────────────────────────
   Ein Feld, das nur ausgegraut ist, sieht aus wie ein Programm,
   das gerade nicht funktioniert. Ein Schloss davor sagt, dass das
   Absicht ist und wer den Schlüssel hat. Dasselbe Schloss steht
   auf der Fläche hinter der Adresse — damit man von außen sieht,
   welche Geräte ihre Adresse geliehen haben.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  /* Dasselbe Schloss wie auf der Fläche (flaeche.js), nur als
     Inline-SVG. Als Schriftzeichen (🔒) wäre es je nach Gerät
     bunt, verschieden groß und auf manchen Systemen gar nicht da. */
  const SCHLOSS =
    '<svg class="k-lock" viewBox="0 0 12 12" aria-hidden="true">'
    + '<path d="M 3.7 5.4 L 3.7 3.6 A 2.3 2.3 0 0 1 8.3 3.6 L 8.3 5.4" '
    +   'fill="none" stroke="currentColor" stroke-width="1.2"/>'
    + '<rect x="2.2" y="5.2" width="7.6" height="5.4" rx="1.4" fill="currentColor"/>'
    + '</svg>';

  /* Vorgaben für einen frisch angeschalteten DHCP-Server. Sie
     werden aus dem Anschluss abgeleitet, an dem er verteilen soll:
     wer den Schalter umlegt, soll einen sinnvollen Bereich
     vorfinden und nicht vier leere Felder. */
  function dhcpVorgabe(netz, node) {
    const conf = netz.dhcpConf(node);
    // Das cww verteilt nach innen, nie in die Wolke.
    if (netz.istInternet(node, conf.nic | 0)) conf.nic = 1;
    const nic = node.nics[conf.nic | 0] || node.nics[0];

    /* Die Netzmaske steht IMMER da — auch bei einem Server, der
       selbst noch keine Adresse hat. 255.255.255.0 ist die Maske
       jedes Netzes, das in dieser Simulation vorkommt; ein leeres
       Feld ist hier keine Frage, über die jemand entscheiden soll,
       sondern nur eine Lücke, die man vergessen kann. Deshalb steht
       diese Zeile vor dem Ausstieg weiter unten. */
    if (!conf.mask) conf.mask = (nic && nic.mask) || '255.255.255.0';

    if (!nic || !nic.ip) return conf;
    const ip = U.ip2int(nic.ip), mask = U.ip2int(nic.mask);
    if (ip === null || mask === null) return conf;
    const net = U.netOf(ip, mask), bcast = U.bcastOf(ip, mask);
    // Ein Bereich in der oberen Hälfte, aber nie über den Rundruf
    // hinaus: bei /24 ergibt das .100 bis .150, bei /28 das, was
    // hineinpasst.
    const von = Math.min(net + 100, bcast - 1);
    const bis = Math.min(net + 150, bcast - 1);
    if (!conf.von)  conf.von  = U.int2ip(Math.max(von, net + 1));
    if (!conf.bis)  conf.bis  = U.int2ip(Math.max(bis, net + 1));
    if (!conf.gateway) conf.gateway = nic.ip;
    return conf;
  }

  /* ─── Eine Adresse in Farbe, HINTER dem Eingabefeld ─────────
     Die Aufteilung kommt aus util.js (ipGruppen) — dieselbe
     Funktion, nach der sich auch die Fläche färbt, damit die
     Farben nicht an zwei Stellen auseinanderlaufen können.

     Was hier anders ist als bei einer freistehenden Zeile: keine
     seitliche Polsterung (siehe .k-ipin im Stylesheet). Jedes
     Pixel Polsterung würde die Zeichen gegen die des
     Eingabefelds verschieben, und dann steht der Schreibstrich
     nicht mehr am Zeichen.                                       */
  function ipInnenHtml(ip, mask) {
    const grp = U.ipGruppen(ip, mask);
    /* Solange die Adresse unvollständig ist, gibt es noch keine
       Grenze zwischen Netz- und Geräteteil — die Zeichen müssen
       aber trotzdem dastehen. Das Feld darüber schreibt
       durchsichtig; ohne diese Zeile tippt man ins Leere und sieht
       die Adresse erst in dem Augenblick, in dem sie fertig ist.
       Also ohne Farbe, aber sichtbar: die Färbung kommt dazu, wenn
       es etwas zu färben gibt. Unter dem Gerät macht es flaeche.js
       genauso (ipTspans). */
    if (!grp) return ip ? '<span class="ipp ipp--offen">' + esc(ip) + '</span>' : '';
    return grp.map(g =>
      '<span class="ipp ipp--' + g.teil + '">' + esc(g.text) + '</span>')
      .join('<span class="ipd">.</span>');
  }

  function Konfig(netz, stack, dienste) {

    /* Das Weiterleitungsfenster unten, sofern es eines gibt (app.js
       meldet es über `setWeiterleitung` an). Im kopflosen Prüfstand
       und auf der Geräteoberfläche gibt es keins. */
    let fenster = null;
    /* Das Anschlussstück ans Class Wide Web (js/internet.js), für
       die Liste von 8.8.8.8 im Reiter „Internet". app.js meldet es
       über `setInternet` an. */
    let inet = null;

    /* ═══ Bauen ══════════════════════════════════════════════
       opts:
         mehr      die große Ansicht (DHCP, Tabellen, Löschen)
         ro        nur lesen
         onDirty   etwas hat sich geändert → speichern
         redraw    Fläche und Nachbaransichten neu zeichnen
         rebuild   das Formular selbst neu aufbauen (nach Änderungen
                   an der Struktur: Anschluss dazu, DHCP an/aus)
         betonen   Kabel-ID (oder null) auf der Fläche hervorheben —
                   „zu dieser Netzwerkkarte gehört jenes Kabel".
                   Fehlt dort, wo keine Fläche zu sehen ist
                   (Geräteoberfläche im Aktionsmodus).
         toast     Kurzmeldung
         loeschen  Rückruf für „Gerät löschen" (nur groß)        */
    function bauen(node, box, opts) {
      opts = opts || {};
      const ro = !!opts.ro;
      const mehr = !!opts.mehr;
      const K = netz.KIND[node.kind];
      const dhcpIrgendwo = node.nics.some(k => k.dhcp);

      /* Die Einrichtung des DHCP-Servers ist eine eigene Seite,
         genau wie in Filius ein eigener Dialog („DHCP-Server
         einrichten"). Hier ist es kein Fenster über der Fläche,
         sondern eine Unterseite im selben Fenster mit einem
         Zurück-Knopf: dieselbe Gliederung, ohne dass das Netz
         dabei verdeckt wird. */
      if (box.dataset.seite === 'dhcp' && !ro) { bauDhcpSeite(node, box, opts); return; }

      /* ─ Subnetze ─ Damit jede Netzwerkkarte in der Farbe ihres
         Netzes umrandet werden kann. Dieselbe Rechnung wie auf der
         Fläche (subnetze.js), also dieselben Farben: wer im
         Fenster einen grünen Rahmen sieht, findet draußen den
         grünen Ring. */
      const sn = window.Subnetze ? window.Subnetze.berechnen(netz) : null;

      /* ─ Reiter ─ Nur beim Router, und dort aus einem klaren
         Grund: er ist das einzige Gerät, das mehrere Adressen hat
         UND allgemeine Einstellungen dazu. Bei drei Netzwerkkarten
         stand das Gateway bisher unter drei Kartenblöcken und war
         nur mit Bildlauf zu erreichen.

         Filius macht es genauso — JVermittlungsrechnerKonfiguration
         ist ein JTabbedPane mit „Allgemein", je einem Reiter pro
         Netzwerkkarte und „Weiterleitungstabelle". Der Wortlaut
         „Allgemein" ist von dort.

         ⚠️ Zwei bewusste Abweichungen:
         · Alle Karten stehen in EINEM Reiter untereinander, nicht
           in je einem eigenen. Ein Router mit drei Karten hätte
           sonst fünf Reiter, und der Vergleich „welche Adresse
           hat welche Karte" — die eigentliche Frage an einem
           Router — ginge nur noch durch Hin- und Herklicken.
         · Aufgeschlagen ist „Netzwerkkarten", nicht „Allgemein".
           Filius fängt bei „Allgemein" an; hier ist das die
           leerere der beiden Seiten, und ein Router, der beim
           Öffnen nichts zu zeigen hat, sieht kaputt aus. Gebaut
           wird an den Adressen. */
      /* ─ Und beim Heimrouter drei Reiter: WAN · LAN · Allgemein ─
         Filius hat dort ebenfalls ein Reiterband
         (JGatewayConfiguration), und auch mit drei Seiten. Nur
         heißen dort BEIDE Kartenreiter „Netzwerkkarte"
         (jgatewayconfiguration_msg10), und welcher welcher ist,
         verrät allein ihre Stelle im Band. Das ist eine Lücke, die
         man im Unterricht bezahlt: „trag die Adresse in der
         zweiten Netzwerkkarte ein" ist keine Anweisung, die ein
         Kind nachprüfen kann.

         Hier stehen deshalb die Wörter da, die auch auf dem
         Gehäuse stehen — WAN und LAN. Es ist die einzige
         Abweichung im Wortlaut, und sie ersetzt ein Filius-Wort
         nicht, sie füllt eine Leerstelle.

         ⚠️ „Allgemein" steht seit dieser Runde VORN — vom Nutzer
         verlangt: „Mach beim Heimrouter auch den Allgemeinreiter als
         erstes, wie beim Router." Danach WAN und LAN in der
         Reihenfolge des Geräts: oben der Anbieter, darunter das
         Haus. Aufgeschlagen bleibt LAN — dort wird gebaut, und ein
         Fenster, das mit der Anbieterseite aufgeht, zeigt beim
         Öffnen genau die zwei Felder, die niemand ausfüllen soll.
         Genau dasselbe Verhältnis wie beim Router, wo „Allgemein"
         vorn steht und „Netzwerkkarten" aufgeht: die Stelle im Band
         sagt, wohin etwas gehört, nicht, womit man anfängt. */
      const REITER = {
        router:     { auf: 'karten', liste: [['allgemein', 'Allgemein'], ['karten', 'Netzwerkkarten']] },
        heimrouter: { auf: 'lan',    liste: [['allgemein', 'Allgemein'], ['wan', 'WAN'], ['lan', 'LAN']] },
        /* Das cww: wie der Router, dazu ein Reiter für das, was
           es nach draußen hat — den eigenen Adressbereich und 8.8.8.8.
           Aufgeschlagen ist „Internet": beim ersten Öffnen ist die
           wichtigste Auskunft, welche Adressen einem gehören. */
        cww:        { auf: 'internet', liste: [['allgemein', 'Allgemein'], ['internet', 'Internet'],
                                               ['karten', 'Netzwerkkarten']] }
      };
      const rDef = REITER[node.kind] || null;
      const reiter = !!rDef;
      const seite = reiter
        ? (rDef.liste.some(r => r[0] === box.dataset.reiter) ? box.dataset.reiter : rDef.auf)
        : null;
      const zeig = (was) => !reiter || seite === was;

      let h = '';

      if (reiter) {
        h += '<div class="k-reiter" role="tablist">'
          + rDef.liste.map(([k, t]) =>
              '<button class="k-reiter-b' + (seite === k ? ' is-on' : '') + '" '
              + 'data-k="reiter" data-seite="' + k + '">' + esc(t) + '</button>').join('')
          + '</div>';
      }

      /* ─ Legende ─ Nur in der großen Ansicht, und nur dort, wo
         Adressen stehen. Die Farbzeile unter dem Feld benennt die
         beiden Teile; was sie bedeuten, gehört in den Unterricht
         und nicht in jedes Gerätefenster. */
      const heim = netz.istHeim(node);
      const adressSeite = heim ? (seite === 'wan' || seite === 'lan') : zeig('karten');

      if (mehr && node.kind !== 'switch' && adressSeite) {
        h += '<div class="kl">'
          +    '<span class="kl-i"><i class="ipp ipp--netz">Netz</i></span>'
          +    '<span class="kl-i"><i class="ipp ipp--host">Gerät</i></span>'
          +    '<span class="kl-t">teilt die Netzmaske</span>'
          + '</div>';
      }

      /* ─ Anschlüsse ─ */
      if (heim) {
        h += heimSeite(node, seite, ro, mehr, sn);
      } else if (netz.istCww(node) && seite === 'internet') {
        h += internetSeite(node, mehr);
      } else if (!zeig('karten')) {
        /* nichts — die Karten stehen im anderen Reiter */
      } else if (node.kind === 'switch') {
        /* ⚠️ Kein Erklärsatz und keine Buchsenreihe mehr — vom
           Nutzer gestrichen („die Anschlüsse brauch ich nicht").
           Beim Switch gibt es nichts einzustellen außer dem WLAN;
           die Buchse kommt ohnehin von selbst mit dem Kabel. */
        h += wlanBlock(node, ro, mehr);
      } else {
        /* Die Internet-Karte des cww steht im Reiter „Internet",
           nicht hier: an ihr gibt es nichts einzutragen. */
        node.nics.forEach((nic, i) => {
          if (netz.istInternet(node, i)) return;
          h += nicBlock(node, nic, i, ro, mehr, sn);
        });
      }

      /* Wortlaut wie in Filius (jvermittlungsrechnerkonfiguration_
         msg24), dort auch mit derselben Obergrenze. Im Reiter der
         Netzwerkkarten steht der Knopf auch in der KLEINEN Ansicht:
         er gehört zu dem, was auf dieser Seite steht, und ein
         Reiter „Netzwerkkarten", auf dem man keine hinzufügen
         kann, ist eine Lücke. */
      /* ⚠️ `!K.waechst` schließt den Switch aus: dort wächst eine
         Buchse von selbst mit dem Kabel (netz.js, `freieNic`), und
         ein Knopf daneben wäre die Frage „muss ich erst?" — genau
         die, die der Nutzer abbestellt hat. Router und Heimrouter
         behalten ihn: bei ihnen ist das Anbauen der Gegenstand. */
      if ((mehr || reiter) && !ro && !heim && !K.waechst && zeig('karten')
          && netz.feste(node).length < K.maxPorts) {
        h += '<button class="k-add" data-k="addnic">Schnittstelle hinzufügen</button>';
      }

      /* ─ Gateway und Domain Name System ─ Reihenfolge und
         Wortlaut wie in der Rechnerkonfiguration von Filius:
         MAC-Adresse, IP-Adresse, Netzmaske, Gateway, Domain Name
         Server, dann der DHCP-Schalter. Zwei Abweichungen:

         Das letzte Feld heißt in der großen Ansicht „Domain Name
         System (DNS)" — die Abkürzung ist das, was in jedem
         Schulbuch steht, und ohne sie ist „Domain Name Server" ein
         Begriff, den man erst einmal übersetzen muss. Klein steht
         dort nur „DNS": neben dem Feld ist die Zeile sonst länger
         als das Fenster breit.

         Und in beiden Feldern steht KEINE Beispieladresse mehr.
         Bei IP-Adresse und Netzmaske hilft eine blasse Vorgabe
         („so sieht so etwas aus"), hier stiftet sie Unfug: ein
         Kind, das 192.168.1.1 im Gatewayfeld stehen sieht, hält
         es für eingetragen und sucht den Fehler woanders. Beide
         Angaben dürfen leer bleiben — das ist der Normalfall in
         einem Netz ohne Router. */
      /* ⚠️ Die Reihenfolge in diesem Reiter ist vom Nutzer gesetzt
         und sie ist zugleich die aus Filius: erst die zwei Adressen,
         die jedes Gerät hat (Gateway, DNS), dann das, was nur dieses
         Gerät hat. Beim Router ist das der Haken „Automatisches
         Routing" — er steht dort ebenfalls direkt unter dem
         Gateway-Feld (JVermittlungsrechnerKonfiguration, msg26) —
         und erst danach die Weiterleitungstabelle. Vorher stand die
         Tabelle oben und der Haken darunter; das ist die falsche
         Richtung: der Haken ENTSCHEIDET, ob es die Tabelle braucht. */
      if (netz.istCww(node) && zeig('allgemein')) {
        /* Das cww hat kein Gateway und fragt keinen DNS-Server: es
           IST das Gateway, und draußen steht 8.8.8.8. Es hat die
           Netze, den RIP-Haken, die Tabelle — und einen DHCP-Server,
           denn beim Anbieter holt sich der Heimrouter seine Adresse. */
        h += netzeBlock(node, sn, mehr);
        h += ripBlock(node, ro, mehr);
        if (mehr) h += wegeBlock(node, ro);
        if (mehr) {
          const an = !!(node.dhcpServer && node.dhcpServer.on);
          h += sec('DHCP-Server', 'cww-dhcp', 'Wie beim echten Anbieter: ein Heimrouter, '
            + 'dessen WAN-Seite hier hängt, holt sich seine Adresse vom cww.');
          if (!ro) {
            h += '<button class="k-add" data-k="dhcpseite">'
              + 'DHCP-Server einrichten' + (an ? ' · <b>aktiv</b>' : '') + '</button>';
          } else if (an) {
            h += '<div class="k-hint">Dieses cww verteilt Adressen.</div>';
          }
        }
      } else if (node.kind !== 'switch' && zeig('allgemein')) {
        const gwRo = ro || dhcpIrgendwo;
        // Bei DHCP dieselbe blasse Herkunftsangabe wie in den zwei
        // Feldern der Netzwerkkarte — vier Felder, eine Auskunft.
        const gwPh = dhcpIrgendwo ? '— vom DHCP-Server' : '';
        h += feld('Gateway', 'gateway', node.gateway, gwRo, gwPh, gwRo && dhcpIrgendwo)
          +  feld(mehr || reiter ? 'Domain Name System (DNS)' : 'DNS',
                  'dns', node.dns, gwRo, gwPh, gwRo && dhcpIrgendwo);

        if (heim) {
          /* ─ NAT ─ Der eine Satz, der das ganze Gerät erklärt. Er
             steht unter „Allgemein", weil er zu keiner der beiden
             Seiten gehört, sondern zwischen ihnen sitzt.

             ⚠️ Hier stand einmal ein Kontrollkästchen. Es ist weg,
             vom Nutzer gestrichen: „Heimrouter nutzen immer NAT. das
             sollte dann auch da stehen." Damit fällt der Versuch
             „was passiert ohne NAT" aus der Oberfläche — in der
             Simulation gibt es ihn weiter (`node.nat.on`), und der
             kopflose Prüfstand fährt ihn auch weiter. Was
             verschwindet, ist die FRAGE: ein echtes Gerät stellt sie
             nicht, und ein Haken, den niemand jemals wegnimmt, ist
             eine Einladung zu einem Fehler ohne Lehrwert. */
          /* Und direkt darunter die Ausnahme von genau diesem
             letzten Satz. Nur in der großen Ansicht: eine
             Portfreigabe ist nichts, was man beim Eintragen einer
             Adresse nebenbei anklickt — dieselbe Regel wie beim
             DHCP-Server. */
          if (mehr) h += natBlock(node) + freiBlock(node, ro);
        } else if (K.routes) {
          /* ⚠️ `!heim`: der Heimrouter hat keine
             Weiterleitungstabelle mehr (vom Nutzer gestrichen — er
             hat genau zwei Seiten und schickt alles Fremde nach
             draußen). `KIND.heimrouter.routes` bleibt trotzdem
             `true`: daran entscheidet `schichten.js`, ob ein Gerät
             überhaupt weiterleitet. Geändert ist die Oberfläche,
             nicht das Gerät. */
          h += netzeBlock(node, sn, mehr);
          h += ripBlock(node, ro, mehr);
          /* Die Weiterleitungstabelle nur groß — vom Nutzer so
             getrennt: „Router: Weiterleitung nur im großen Modal". */
          if (mehr) h += wegeBlock(node, ro);
        }
      }

      /* ─ DHCP ─ Wie in Filius: ein Kontrollkästchen für „ich hole
         mir meine Adresse" und ein Knopf für „ich verteile welche".
         Beides gibt es nur beim Endgerät, nicht beim Router — auch
         das ist aus Filius übernommen, wo der Vermittlungsrechner
         gar keine DHCP-Einstellungen hat.

         Und beides steht in der großen Ansicht: DHCP ist nichts,
         was man beim Eintragen einer Adresse nebenbei anklickt. */
      /* Beim Heimrouter steht beides woanders, und zwar dort, wo es
         hingehört: der Haken „ich hole mir eine Adresse" auf der
         WAN-Seite (vom Anbieter), der Knopf „ich verteile welche"
         auf der LAN-Seite (ins Haus). Genau diese Aufteilung macht
         Filius auch — GatewayFirmware bindet den DHCP-Server an
         das LAN-Interface und erlaubt den DHCP-Client nur auf dem
         WAN-Port (dhcpEnabledMACAddress). */
      if (mehr && dhcpFaehig(node) && !netz.istHeim(node)) {
        const an = !!(node.dhcpServer && node.dhcpServer.on);
        h += '<div class="k-sec">DHCP</div>';
        h += '<label class="k-switch">'
          +    '<input type="checkbox" data-k="dhcp" data-nic="0"'
          +      (node.nics[0].dhcp ? ' checked' : '') + (ro ? ' disabled' : '') + '>'
          +    '<span>DHCP zur Konfiguration verwenden</span>'
          + '</label>';
        if (!ro) {
          h += '<button class="k-add" data-k="dhcpseite">'
            + 'DHCP-Server einrichten' + (an ? ' · <b>aktiv</b>' : '') + '</button>';
        } else if (an) {
          h += '<div class="k-hint">Dieses Gerät verteilt Adressen (DHCP-Server aktiv).</div>';
        }
      }

      /* ─ Was das Gerät sich selbst gebaut hat ─
         In einem eigenen Kasten, weil er allein aufgefrischt wird,
         während die Simulation läuft: eine ARP-Tabelle, die sich
         beim Ping füllt, ist der halbe Unterricht — aber das ganze
         Formular alle 400 ms neu zu bauen, würde jedem, der gerade
         eine Adresse tippt, das Feld unter den Fingern wegziehen. */
      if (mehr && zeig('allgemein')) h += '<div class="k-tab" data-tabellen>' + tabellen(node) + '</div>';

      if (mehr && zeig('allgemein') && opts.loeschen) {
        h += '<div class="k-acts"><button class="btn btn--ghost" data-k="del">Gerät löschen</button></div>';
      }

      box.innerHTML = h;
      wire(node, box, opts);
    }

    /* Wer darf DHCP? In Filius: Rechner und Notebook (und der
       Heimrouter, den es hier noch nicht gibt). Der
       Vermittlungsrechner nicht — und das ist keine Lücke, sondern
       die Aussage, dass DHCP ein Dienst ist und keine Eigenschaft
       des Vermittelns. */
    /* Alles, was kein Switch und kein Router ist — also jedes der
       drei Bilder desselben Endgeräts (Laptop, Server, Handy).
       Bewusst so herum gefragt und nicht als Aufzählung der drei:
       ein viertes Bild soll hier nichts zu ändern haben. Filius
       gibt dem Vermittlungsrechner ebenfalls keine
       DHCP-Einstellungen. */
    /* ═══ Das „i" ════════════════════════════════════════════
       Vom Nutzer: „Die Oberfläche sollte mit weniger Texten
       auskommen. Baue lieber i-Buttons ein, die die Erklärungen
       enthalten." Eine Überschrift mit einem runden „i" daneben;
       der Satz steht darunter, aber erst auf Tipp.

       Welche offen sind, merkt sich `offenInfo` über das Neubauen
       hinweg — sonst klappte jede Eingabe im Formular die gerade
       gelesene Erklärung wieder zu. `ohneTitel`: nur das „i", für
       eine Stelle, die schon eine Überschrift hat. */
    const offenInfo = new Set();
    function sec(titel, key, info, ohneTitel) {
      const auf = offenInfo.has(key);
      return '<div class="k-sec k-sec--i' + (ohneTitel ? ' k-sec--nur-i' : '') + '">'
        + '<span>' + titel + '</span>'
        + '<button type="button" class="k-i' + (auf ? ' is-on' : '') + '" data-info="' + key + '" '
        +   'title="Erklärung" aria-label="Erklärung" aria-expanded="' + auf + '">i</button></div>'
        + '<div class="k-note k-info" data-infotext="' + key + '"' + (auf ? '' : ' hidden') + '>'
        + info + '</div>';
    }
    function infoVerdrahten(box) {
      box.querySelectorAll('[data-info]').forEach(b =>
        b.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const k = b.dataset.info;
          const auf = !offenInfo.has(k);
          if (auf) offenInfo.add(k); else offenInfo.delete(k);
          b.classList.toggle('is-on', auf);
          b.setAttribute('aria-expanded', String(auf));
          const t = box.querySelector('[data-infotext="' + k + '"]');
          if (t) t.hidden = !auf;
        }));
    }

    const dhcpFaehig = (node) => node.kind !== 'switch' && node.kind !== 'router' && node.kind !== 'cww';

    /* ═══ Das cww: der Reiter „Internet" ══════════════════════
       Oben die zwei Zahlen, die dem Kind gehören und die es nicht
       ändern kann: der Adressbereich und die Adresse in der Wolke.
       Darunter, groß, was 8.8.8.8 weiß — nur lesen. */
    function internetSeite(node, mehr) {
      const c = netz.internetConf();
      let h = sec('Dein Adressbereich', 'cww-bereich', 'Nur Adressen aus diesem Bereich '
        + 'kommen ins Internet. Wem die anderen Bereiche gehören, weiß niemand — auch 8.8.8.8 nicht.');
      h += '<div class="k-cww-bereich mono">' + c.prefix + '.0.0.0<span class="dim"> /8</span></div>'
        + '<div class="k-hint dim">von ' + c.prefix + '.0.0.1 bis ' + c.prefix + '.255.255.254</div>';
      h += '<div class="k-sec">In der Wolke</div>'
        + '<div class="k-hint"><span class="mono">' + esc(c.backbone) + '</span> · Netzmaske '
        + '<span class="mono">255.0.0.0</span></div>';
      const m = inet ? inet.modus : 'solo';
      if (m === 'solo') {
        h += '<div class="k-hint warn">Kein Raum – andere Netze nicht erreichbar. '
          + '8.8.8.8 kennt nur deine eigenen Namen.</div>';
      } else if (m === 'aus') {
        h += '<div class="k-hint warn">Gespiegeltes Netz – hier geht nichts ins Internet.</div>';
      }
      if (!mehr) return h;

      h += sec('8.8.8.8 · öffentlicher DNS', 'cww-dns', 'Hier steht jeder Name, den ein '
        + '<b>DNS-Server im Internet</b> kennt: er muss laufen, eine Adresse aus seinem '
        + 'Bereich haben und vom cww erreichbar sein. Wer einen Namen zuerst anmeldet, '
        + 'bekommt ihn. Eintragen kann man hier nichts — das geht nur am eigenen DNS-Server.');
      const rows = inet ? inet.liste() : [];
      if (!rows.length) {
        h += '<div class="k-hint dim">8.8.8.8 kennt noch keinen Namen.</div>';
        return h;
      }
      const T = (window.Internet && window.Internet.STATUS_TEXT) || {};
      /* Zwei Zeilen je Eintrag statt vier Spalten: im Kärtchen ist
         kein Platz für Name, Typ, Adresse UND Grund nebeneinander —
         in der ersten Fassung brach „drucker.anna.de" mitten im Wort. */
      h += '<div class="k-dns">';
      for (const r of rows) {
        const gut = r.status === 'eigen' || r.status === 'fremd';
        h += '<div class="k-dns-z' + (gut ? '' : ' is-nicht') + '">'
          + '<span class="k-dns-n mono">' + esc(r.name) + '</span>'
          + '<span class="k-dns-w mono"><i>' + esc(r.typ) + '</i>' + esc(r.wert) + '</span>'
          + '<span class="k-dns-st">' + esc(T[r.status] || r.status) + '</span></div>';
      }
      h += '</div>';
      return h;
    }

    /* ═══ Der Heimrouter: eine Seite je Seite des Geräts ══════
       WAN und LAN sind nicht zwei Netzwerkkarten unter vielen,
       sondern die zwei Hälften, aus denen dieses Gerät besteht.
       Deshalb bekommt jede eine eigene Seite und nicht einen
       Kasten in einer Liste — und deshalb steht auf jeder oben in
       einem Satz, was sie ist. Ohne den Satz sind es zwei
       Adressfelder, und niemand weiß, welches wohin zeigt.      */
    function heimSeite(node, seite, ro, mehr, sn) {
      /* ⚠️ Die Sätze über die beiden Seiten stehen seit dieser Runde
         hinter einem „i" und nur in der großen Ansicht. Vom Nutzer:
         „Die Oberfläche sollte mit weniger Texten auskommen" und
         „Heimrouter: keine Erklärungen im kleinen Modal". */
      if (seite === 'wan') {
        const wan = node.nics[netz.WAN];
        let h = mehr ? sec('WAN', 'hr-wan', 'Die Seite zum <b>Anbieter</b>. Hier kommt das '
          + 'Internet herein — genau ein Anschluss, genau eine Adresse.') : '';
        h += nicBlock(node, wan, netz.WAN, ro, mehr, sn);
        /* Der Haken sitzt AUF dieser Seite und nicht in einem
           eigenen Abschnitt weiter unten: „wer gibt mir meine
           Adresse" ist eine Frage über genau diesen Anschluss.
           Wortlaut aus Filius (jhostkonfiguration_msg7), das
           Kontrollkästchen steht dort ebenfalls im WAN-Reiter. */
        if (!ro) {
          h += '<label class="k-switch">'
            +    '<input type="checkbox" data-k="dhcp" data-nic="' + netz.WAN + '"'
            +      (wan.dhcp ? ' checked' : '') + '>'
            +    '<span>DHCP zur Konfiguration verwenden</span>'
            + '</label>';
        }
        return h;
      }

      if (seite === 'lan') {
        const lan = node.nics[netz.LAN];
        /* Klein: nur LAN 1 mit seiner Adresse — „nur LAN1 und nicht
           der Rest". Buchsen, WLAN und DHCP-Server stehen groß. */
        if (!mehr) return nicBlock(node, lan, netz.LAN, ro, mehr, sn);

        const buchsenListe = netz.bruecke(node, netz.LAN).filter(i => !node.nics[i].funkPort);
        /* ⚠️ Kein „Schnittstelle hinzufügen" mehr: die acht
           LAN-Buchsen sind fest eingebaut (netz.js, KIND.heimrouter). */
        let h = sec('LAN', 'hr-lan', 'Die Seite zum <b>Haus</b>. Die '
          + buchsenListe.length + ' LAN-Buchsen sind ein eingebauter <b>Switch</b>: '
          + 'ein Netz, eine Adresse.');
        h += nicBlock(node, lan, netz.LAN, ro, mehr, sn);
        h += buchsen(node, buchsenListe);
        h += wlanBlock(node, ro, mehr);

        const an = !!(node.dhcpServer && node.dhcpServer.on);
        h += '<div class="k-sec">DHCP-Server</div>';
        if (!ro) {
          h += '<button class="k-add" data-k="dhcpseite">'
            + 'DHCP-Server einrichten' + (an ? ' · <b>aktiv</b>' : '') + '</button>';
        } else if (an) {
          h += '<div class="k-hint">Dieses Gerät verteilt Adressen im Heimnetz.</div>';
        }
        return h;
      }

      return '';
    }

    /* ═══ Weiterleitungstabelle und automatisches Routing ═════
       Der Teil, an dem ein Router aufhört, ein Gerät mit zwei
       Adressen zu sein. Zwei Wege, dasselbe zu erreichen, und
       deshalb stehen sie untereinander und nicht in zwei Reitern:

         von Hand      drei Zahlen eintragen. Umständlich, sichtbar,
                       und man versteht danach, WAS ein Router
                       eigentlich weiß.
         automatisch   einen Haken setzen. Bequem, unsichtbar — und
                       die Antwort auf „und bei zwanzig Routern?"

       ⚠️ Seit dieser Runde steht der HAKEN OBEN und die Tabelle
       darunter — vom Nutzer so gesetzt, und Filius macht es genauso
       (der Haken sitzt dort direkt unter dem Gateway-Feld). Der
       Grund ist stärker als die alte Unterrichtsreihenfolge: der
       Haken entscheidet, ob es die Tabelle überhaupt braucht. Ist er
       gesetzt, steht unter der Überschrift nur noch ein Satz; ist er
       es nicht, stehen dort die Zeilen und der Knopf ins große
       Fenster. Die Reihenfolge des Unterrichts (erst von Hand, dann
       die Einsicht, dass das nicht skaliert) ist damit nicht
       verloren — sie ist die Reihenfolge, in der man die beiden
       Zustände durchläuft, nicht die, in der sie untereinander
       stehen.

       ── Wortlaut aus Filius ──────────────────────────────────
       Überschrift „Weiterleitungstabelle" (jvermittlungsrechner-
       konfiguration_msg15), Spalten „Ziel · Netzmaske · Nächstes
       Gateway · Über Schnittstelle" (jweiterleitungstabelle_msg3
       bis msg6), Knopf „Neue Zeile" (msg2), Haken „Automatisches
       Routing" (msg26).

       ⚠️ **„Über Schnittstelle" ist hier kein Feld, sondern eine
       Auskunft.** In Filius tippt man es mit ein — und kann damit
       eine Zeile bauen, die sich selbst widerspricht: ein Gateway
       im Netz der ersten Karte, eingetragen über die zweite. Die
       Karte FOLGT aus dem Gateway (es muss in einem Netz liegen,
       das dieses Gerät erreicht), also steht sie hier als Ergebnis
       daneben. Das ist zugleich die Rückmeldung, die man an dieser
       Stelle am meisten braucht: wer ein Gateway einträgt, das in
       keinem eigenen Netz liegt, sieht sofort, dass die Zeile
       nichts tut — statt später zu suchen, warum das Paket nicht
       ankommt.                                                  */

    /* Über welche Karte ist diese Adresse zu erreichen? Dieselbe
       Frage wie `nicTowards` in schichten.js, und absichtlich hier
       noch einmal: die Antwort ist eine ANZEIGE, und die Anzeige
       darf nicht davon abhängen, dass die Weiterleitung gerade
       erreichbar ist (im Aktionsmodus gibt es kein `stack` für
       einzelne Zeilen). Wären die zwei je verschieden, wäre das
       ein Fehler — der Prüfstand vergleicht sie deshalb. */
    /* Feldname im Formular → Feldname im Modell. Als Tabelle und
       nicht als Kette von `else if`, damit beim nächsten Feld nur
       eine Zeile dazukommt — und weil die Namen im Formular
       eindeutig sein MÜSSEN: `data-f="mask"` gehört schon der
       Netzwerkkarte, und zwei Felder mit demselben Namen wären der
       Fehler, bei dem das Eintragen einer Route die Netzmaske einer
       Karte überschreibt. */
    const WEG_FELD  = { wegnet: 'net', wegmask: 'mask', weggw: 'gateway' };
    const FREI_FELD = { freiproto: 'proto', freiport: 'port',
                        freiip: 'lanIp', freilanport: 'lanPort' };

    function ueberKarte(node, gwStr) {
      const gw = U.ip2int(gwStr);
      if (gw === null) return null;
      for (const nic of node.nics) {
        if (!nic.ip || !nic.up) continue;
        const ip = U.ip2int(nic.ip), mask = U.ip2int(nic.mask);
        if (ip === null || mask === null) continue;
        if (U.netOf(gw, mask) === U.netOf(ip, mask)) return nic;
      }
      return null;
    }

    /* Was unter einer Zeile steht. Drei Zustände, und jeder sagt
       etwas anderes: fertig, unfertig, falsch. Der dritte ist der,
       um den es geht — ein Gateway, das in keinem eigenen Netz
       liegt, ist der häufigste Fehler an dieser Tabelle, und ohne
       diese Zeile fällt er erst beim Ping auf.

       ⚠️ Steht in EINER Funktion, weil zwei Stellen sie brauchen:
       der Aufbau des Formulars und `wegMalen` beim Tippen. Zweimal
       geschrieben sagten sie beim ersten Sonderfall Verschiedenes. */
    function wegStand(node, r) {
      if (!r.net || !r.mask || !r.gateway)
        return { text: 'noch nicht vollständig', stand: 'dim' };
      if (!U.isIp(r.net) || !U.isIp(r.mask) || !U.isIp(r.gateway))
        return { text: 'keine gültige Adresse', stand: 'bad' };
      /* 0.0.0.0 ist eine gültige Maske (sie meint „alles") und
         `mask2prefix` gibt dafür 0 zurück — geprüft wird also auf
         `null`, nicht auf falsy. Genau hier stand sonst der Fehler,
         dass eine Zeile für „alles Übrige" als kaputt gilt. */
      if (U.mask2prefix(r.mask) === null)
        return { text: 'diese Netzmaske gibt es nicht', stand: 'bad' };
      /* Am cww nur Ziele im eigenen /8 — nach draußen entscheidet
         die Wolke (schichten.js, routeFor übergeht solche Zeilen). */
      if (netz.istCww(node) && !netz.imEigenenNetz(r.net))
        return { text: 'nur Ziele in deinem Bereich (' + netz.internetConf().prefix
          + '.0.0.0/8) — alles andere geht ohnehin ins Internet', stand: 'bad' };
      const nic = ueberKarte(node, r.gateway);
      if (!nic)
        return { text: r.gateway + ' liegt in keinem Netz dieses Geräts', stand: 'bad' };
      return { text: 'über ' + netz.portLabel(node, nic.i) + ' · ' + nic.ip, stand: 'ok' };
    }

    /* ═══ Netze an diesem Gerät ═══════════════════════════════
       Eine Zeile im Reiter „Allgemein" — und der Grund, dass es sie
       gibt, ist ein Weg: wer im Weiterleitungsfenster unten den
       Reiter wechselt, bekommt das Kärtchen dieses Routers
       aufgeschlagen, und das steht auf „Allgemein". Dort stand über
       Netze bisher nichts. Im Reiter „Netzwerkkarten" gibt es die
       Auskunft längst je Karte (`k-nic-sub`); hier steht sie
       zusammengefasst, weil an dieser Stelle die Frage „welche Netze
       kenne ich von selbst" gestellt wird — sie ist die erste
       Hälfte jeder Weiterleitungstabelle.

       Dieselben Farben wie draußen am Ring und am Kabel. */
    function netzeBlock(node, sn, mehr) {
      const meine = (sn && sn.vonNode.get(node.id)) || [];
      let h = '<div class="k-sec">Netze an diesem Gerät</div>';
      if (!meine.length) {
        return h + '<div class="k-hint dim">noch keins</div>'
          + (mehr ? sec('', 'netze', 'Ein Netz entsteht erst, wenn an einer Karte etwas '
              + 'hängt, das dieselbe Netzadresse trägt.', true) : '');
      }
      h += '<div class="k-netze">';
      for (const s of meine) {
        h += '<span class="k-netz" style="--sub: var(--sn-' + s.slot + ')">'
          +    '<i class="k-nic-dot"></i>'
          +    '<span class="mono">' + window.Subnetze.kurzHtml(s) + '</span>'
          + '</span>';
      }
      h += '</div>';
      return h;
    }

    /* ═══ NAT am Heimrouter ═══════════════════════════════════
       Eine Aussage, kein Schalter — siehe die Begründung oben im
       Reiter „Allgemein". Zwei Sätze statt der vier Zeilen, die
       hier eine Runde lang standen: „Diese Erklärungen zu NAT und
       zur Portfreigabe sind richtig und genau richtig. Aber da ist
       zu viel Text." */
    function natBlock(node) {
      netz.natConf(node);          // legt an, falls es das noch nicht gibt
      return sec('NAT', 'nat', 'Ein Heimrouter übersetzt <b>immer</b>: innen viele '
        + 'Adressen, außen die eine vom Anbieter. Deshalb kann von außen niemand '
        + 'anfangen.')
        + '<div class="k-hint">immer an</div>';
    }

    /* ═══ Automatisches Routing ═══════════════════════════════
       Nur am Router. Filius hat den Haken ebenfalls nur dort und
       nicht in der Gateway-Konfiguration (siehe rip.js), und das
       ist auch sachlich richtig: ein Heimrouter, der dem Anbieter
       die Netze im Haus zuruft, stellt nichts nach, was es gibt. */
    function ripBlock(node, ro, mehr) {
      if (netz.istHeim(node) || !stack.ripKann || !stack.ripKann(node)) return '';
      const c = netz.ripConf(node);
      let h = mehr
        ? sec('Automatisches Routing', 'rip', 'Die Router sagen sich im Takt gegenseitig, '
            + 'welche Netze sie kennen und wie weit sie weg sind — <b>läuft nur im '
            + 'Aktionsmodus</b>.')
        : '<div class="k-sec">Automatisches Routing</div>';
      h += '<label class="k-switch">'
        +    '<input type="checkbox" data-k="rip"' + (c.on ? ' checked' : '')
        +      (ro ? ' disabled' : '') + '>'
        +    '<span>Automatisches Routing (RIP)</span>'
        + '</label>';
      /* Der Erklärsatz steht hinter dem „i" (siehe `sec`). */
      return h;
    }

    function wegeBlock(node, ro) {
      const rs = node.routes || (node.routes = []);
      const ripAn = !!(stack.ripKann && stack.ripKann(node) && netz.ripConf(node).on);

      let h = sec('Weiterleitungstabelle', 'wege', ripAn
        ? 'Die eingetragenen Zeilen bleiben gültig und gehen vor.'
        : 'Für jedes Netz, das nicht an seinen eigenen Karten hängt, braucht ein '
          + 'Router eine Zeile.');

      /* ─ Haken gesetzt ─
         Dann steht hier ein Satz und sonst nichts. Wortlaut vom
         Nutzer. Filius sperrt an dieser Stelle den ganzen Reiter
         (`setEnabledAt(…, !isRipEnabled())`) — dasselbe in Grün,
         nur dass ein ausgegrauter Reiter nicht sagt, WARUM. */
      if (ripAn) {
        h += '<div class="k-hint">Wird beim automatischen Routing nicht benötigt.</div>';
        /* ⚠️ Der Satz „die eingetragenen Zeilen bleiben gültig und
           gehen vor" stand hier sichtbar. Vom Nutzer gestrichen; er
           steht jetzt hinter dem „i" der Überschrift. Wichtig bleibt
           er: in Filius schaltet RIP die Tabelle von Hand aus. */
        return h;
      }

      /* ⚠️ EIN Satz, und darunter nichts als die Zeilen und der
         Knopf. Vom Nutzer so verlangt: *„Du schreibst mir in dem
         Modal für Router viel zu viel. Kein ‚Neue Zeile', kein
         Blabla drum herum. Maximal ein Erklärsatz."*

         Weggefallen sind drei Stellen, und jede war für sich
         richtig: die Aufzählung der drei Angaben (die Spalten im
         Fenster sagen dasselbe), die Zeile mit den Spaltennamen
         unter der Tabelle, und der Absatz „Keine Zeile
         eingetragen…". Sie standen alle in einem Kasten von 340 px
         Breite und ergaben zusammen mehr Text als Tabelle. */
      if (rs.length) {
        h += '<div class="k-recs">';
        rs.forEach((r, i) => {
          const s = wegStand(node, r);
          h += '<div class="k-weg">'
            + '<div class="k-weg-f">'
            +   '<input class="f mono" data-f="wegnet" data-weg="' + i + '" value="' + esc(r.net || '') + '" '
            +     'placeholder="192.168.3.0" inputmode="decimal" spellcheck="false"'
            +     (ro ? ' disabled' : '') + '>'
            +   '<input class="f mono" data-f="wegmask" data-weg="' + i + '" value="' + esc(r.mask || '') + '" '
            +     'placeholder="255.255.255.0" inputmode="decimal" spellcheck="false"'
            +     (ro ? ' disabled' : '') + '>'
            +   '<input class="f mono" data-f="weggw" data-weg="' + i + '" value="' + esc(r.gateway || '') + '" '
            +     'placeholder="192.168.2.2" inputmode="decimal" spellcheck="false"'
            +     (ro ? ' disabled' : '') + '>'
            + (ro ? '' : '<button class="k-x" data-k="wegdel" data-weg="' + i + '" title="Zeile löschen">×</button>')
            + '</div>'
            + '<div class="k-weg-w is-' + s.stand + '" data-wegw="' + i + '">' + esc(s.text) + '</div>'
            + '</div>';
        });
        h += '</div>';
      }

      /* ⭐ Kein Knopf „Neue Zeile" mehr. Angelegt wird im Fenster,
         und das ist auch der Ort dafür: dort stehen die
         Spaltennamen über den Feldern, dort steht daneben, was der
         Router ohnehin schon weiß, und dort kann man von Router zu
         Router wechseln. Zwei Orte zum Anlegen waren zwei Orte, an
         denen dieselbe Zeile anders aussah. */

      /* ─ Und der Weg ins große Fenster ─
         Filius hat an derselben Stelle „Als Fenster öffnen"
         (jvermittlungsrechnerkonfiguration_msg14), dort ein
         600×400-Dialog. Hier ist es die Leiste unten über die ganze
         Breite, mit einem Reiter je Router — der Unterschied, den
         der Nutzer daran wollte: mehrere Router nacheinander
         einrichten, ohne jedes Mal ein Fenster zu suchen.

         Der Knopf steht nur, wenn der Haken NICHT gesetzt ist. Bei
         eingeschaltetem automatischem Routing kommt dieser Zweig
         gar nicht erst vor (siehe oben). */
      if (fenster && !ro)
        h += '<button class="k-add k-add--gross" data-k="wegfenster">'
          + 'Zur Weiterleitungstabelle</button>';

      return h;
    }

    /* ═══ Portfreigaben am Heimrouter ═════════════════════════
       Die Gegenprobe zu NAT. Sie steht deshalb direkt unter dem
       NAT-Satz und nicht in einem eigenen Reiter (Filius hat dafür
       einen eigenen Dialog, JPortForwardingDialog): der Satz
       darüber behauptet „von außen kann niemand anfangen", und das
       hier ist die einzige Ausnahme davon. Zwei Klicks zwischen
       Behauptung und Ausnahme wären zwei zu viel.

       ⚠️ Die Erklärtexte sind gekürzt (Nutzer: „richtig und genau
       richtig. Aber da ist zu viel Text."). Weggefallen ist die
       Wiederholung dessen, was die Tabelle daneben ohnehin zeigt —
       nicht der Satz, der sagt, WOZU es das gibt.

       Der Zweig „ohne NAT gibt es nichts freizugeben" ist ebenfalls
       weg: seit NAT keine Frage mehr ist, ist er unerreichbar.

       Spalten und Wortlaut von dort: Protokoll · Portfreigabe ·
       LAN-Adresse · LAN-Port (jportforwarding_msg4 bis msg7).   */
    function freiBlock(node, ro) {
      const fs = netz.natConf(node).frei;

      let h = sec('Portfreigaben', 'frei', 'Die Ausnahme von NAT: eine Zeile, die '
        + '<b>dasteht, bevor das erste Paket kommt</b>. Nur so kann von außen jemand '
        + 'anfangen. Spalten: Protokoll · Portfreigabe · LAN-Adresse · LAN-Port — '
        + 'leerer LAN-Port heißt: derselbe.');

      if (fs.length) {
        h += '<div class="k-recs">';
        fs.forEach((f, i) => {
          h += '<div class="k-frei">'
            + '<select class="f" data-f="freiproto" data-frei="' + i + '"' + (ro ? ' disabled' : '') + '>'
            +   '<option value="tcp"' + (f.proto === 'tcp' ? ' selected' : '') + '>TCP</option>'
            +   '<option value="udp"' + (f.proto === 'udp' ? ' selected' : '') + '>UDP</option>'
            + '</select>'
            + '<input class="f mono" data-f="freiport" data-frei="' + i + '" value="' + esc(f.port || '') + '" '
            +   'placeholder="80" inputmode="numeric" spellcheck="false"' + (ro ? ' disabled' : '') + '>'
            + '<input class="f mono" data-f="freiip" data-frei="' + i + '" value="' + esc(f.lanIp || '') + '" '
            +   'placeholder="192.168.1.20" inputmode="decimal" spellcheck="false"' + (ro ? ' disabled' : '') + '>'
            /* ⚠️ Der Platzhalter im LAN-Port ist die FREIGEGEBENE
               Nummer und keine feste 80. Er sagt damit genau das,
               was passiert, wenn man das Feld leer lässt — und das
               Bild hat gezeigt, warum das nötig ist: bei einer
               Freigabe auf 25565 stand dort blass eine 80, also
               eine Zahl, die nirgends vorkommt. Solange noch kein
               Port eingetragen ist, bleibt die 80 als Beispiel. */
            + '<input class="f mono" data-f="freilanport" data-frei="' + i + '" value="' + esc(f.lanPort || '') + '" '
            +   'placeholder="' + esc(f.port || '80') + '" inputmode="numeric" spellcheck="false"'
            +   (ro ? ' disabled' : '') + '>'
            + (ro ? '' : '<button class="k-x" data-k="freidel" data-frei="' + i + '" title="Freigabe entfernen">×</button>')
            + '</div>';
        });
        h += '</div>';
      } else {
        h += '<div class="k-hint dim">keine Freigabe</div>';
      }

      if (!ro) h += '<button class="k-add" data-k="freineu">Neuer Eintrag</button>';
      return h;
    }

    /* ─── Die Buchsenreihe ───────────────────────────────────
       Beim Switch und auf der LAN-Seite des Heimrouters: eine
       Reihe Kästchen, gefüllt heißt „hier steckt etwas". Sie
       beantwortet die Frage, die man sonst nur durch Hinsehen auf
       die Fläche beantworten kann, und sie tut es an der Stelle,
       an der man ohnehin gerade ist.

       Funkbuchsen stehen NICHT in der Reihe — sie sind keine
       Löcher. Wie viele Geräte funken, sagt der WLAN-Abschnitt
       darunter.                                                */
    function buchsen(node, liste) {
      let h = '<div class="k-sec">' + liste.length + ' '
        + (netz.istHeim(node) ? 'LAN-Buchsen' : 'Anschlüsse') + '</div>';
      h += '<div class="k-ports">' + liste.map(i => {
        const p = netz.peerOf(node.id, i);
        // data-nicbox wie bei den Netzwerkkarten: darüberfahren
        // lässt das Kabel dieses Anschlusses aufleuchten.
        return '<div class="k-port' + (p ? ' is-on' : '') + '" data-nicbox="' + i + '" title="'
          + esc(p ? 'Kabel zu ' + p.node.name : 'frei') + '">'
          + esc(netz.istHeim(node) ? String(i) : String(i + 1)) + '</div>';
      }).join('') + '</div>';
      return h;
    }

    /* ─── WLAN ausstrahlen ────────────────────────────────────
       Am Switch und am Heimrouter. Aufbau und Wortlaut aus Filius
       (JSwitchKonfiguration): ein Feld „Name WLAN (SSID)", und
       ausgestrahlt wird, sobald etwas darinsteht.

       EINE Zutat gegenüber Filius: ein Schalter davor. In Filius
       ist ein leeres Namensfeld das Aus — das ist sparsam und
       didaktisch schlecht, denn „WLAN abschalten" heißt dort „den
       Namen löschen", und beim Wiedereinschalten ist er weg.
       Hier bleibt der Name stehen, wenn man das Netz ausmacht,
       genau wie an einem echten Gerät.                          */
    function wlanBlock(node, ro, mehr) {
      if (!netz.KIND[node.kind].wlan) return '';
      const c = netz.wlanConf(node);
      const gaeste = node.nics.filter(k => k.funkPort && k.cable).length;

      let h = mehr
        ? sec('WLAN', 'wlan', 'Ein Endgerät verbindet sich, wenn dort <em>Drahtlos (WLAN)</em> '
            + 'eingestellt und dieser Name gewählt ist.')
        : '<div class="k-sec">WLAN</div>';
      h += '<label class="k-switch">'
        +    '<input type="checkbox" data-k="wlan"' + (c.on ? ' checked' : '')
        +      (ro ? ' disabled' : '') + '>'
        +    '<span>WLAN ausstrahlen</span>'
        + '</label>';
      /* Das Namensfeld steht auch da, wenn das WLAN aus ist — nur
         gesperrt. Ein Feld, das beim Ankreuzen erst erscheint,
         lässt das Fenster springen, und man sieht nicht, dass man
         einen Namen vergeben MUSS. */
      h += '<label class="k-f' + (c.on ? '' : ' is-aus') + '">'
        + '<span class="k-f-l">Name WLAN (SSID):</span>'
        + '<input class="f" data-f="ssid" value="' + esc(c.ssid || '') + '" '
        + 'placeholder="' + esc(vorschlagSsid(node)) + '" spellcheck="false" maxlength="24"'
        + (ro || !c.on ? ' disabled' : '') + '></label>';

      if (c.on && !c.ssid) {
        h += '<div class="k-err">Ohne Namen findet dich niemand.</div>';
      } else if (c.on) {
        h += '<div class="k-hint dim">' + (gaeste
          ? gaeste + (gaeste === 1 ? ' Gerät' : ' Geräte') + ' verbunden'
          : 'noch kein Gerät verbunden') + '</div>';
      }
      return h;
    }

    /* Ein Vorschlag, der nicht eingetragen ist — er steht blass im
       leeren Feld. „WLAN-SW1" ist eindeutig (das Kürzel gibt es
       nur einmal) und trotzdem ein Name, den man ersetzen will:
       genau das soll er auslösen. */
    const vorschlagSsid = (node) => 'WLAN-' + netz.kurzName(node);

    /* ─── Ein Anschluss ─────────────────────────────────────── */
    function nicBlock(node, nic, i, ro, mehr, sn) {
      const err = nic.ip ? U.checkHostAddress(nic.ip, nic.mask) : null;
      const peer = netz.peerOf(node.id, i);
      const K = netz.KIND[node.kind];
      const lease = dienste ? dienste.leaseOf(node, i) : null;
      const sucht = dienste ? dienste.fragtGerade(node, i) : false;
      const feldRo = ro || nic.dhcp;

      /* ─ In welchem Netz liegt DIESE Karte? ─
         Ein Router hat mehrere, und welche zu welchem Netz gehört,
         war bisher nur durch Adressvergleich herauszufinden. Der
         farbige Rahmen sagt es direkt — und zwar in derselben
         Farbe, die draußen der Ring um das Gerät und das Kabel
         tragen. Drei Orte, eine Aussage.

         Keine Farbe heißt: diese Karte liegt in keinem Netz. Das
         ist kein Fehler (ein Router, an dem erst ein Kabel steckt,
         ist im Bau), aber es ist eine Auskunft. */
      const sub = sn ? sn.vonNic.get(node.id + '#' + i) : null;

      let h = '<div class="k-nic' + (err ? ' has-err' : '') + (sub ? ' has-sub' : '')
        + '" data-nicbox="' + i + '"'
        + (sub ? ' style="--sub: var(--sn-' + sub.slot + ')"' : '') + '>';

      /* „Netzwerkkarte", nicht „Anschluss" oder „Port": so heißt
         das Ding in Filius, und damit in dem Vokabular, in dem die
         Klasse ohnehin arbeitet. Die Überschrift steht nur da, wo
         es mehr als eine gibt — bei einem Endgerät ist sie eine
         Zeile, die nichts unterscheidet. */
      if (K.maxPorts > 1) {
        h += '<div class="k-nic-h"><span class="k-nic-t">' + esc(netz.portLabel(node, i)) + '</span>'
          + (sub
              ? '<span class="k-nic-sub" title="Diese Karte liegt im Netz '
                + esc(window.Subnetze.kurzText(sub)) + '.">'
                + '<i class="k-nic-dot"></i>'
                + esc(window.Subnetze.kurzText(sub)) + '</span>'
              : '')
          + '</div>';
      }

      /* Die MAC-Adresse steht oben, wie in Filius, und sie steht
         immer da — nicht auf Knopfdruck. Sie ist die einzige
         Adresse, die das Gerät von Anfang an hat, und ohne sie ist
         ARP eine Behauptung. Ein Feld ist sie nicht: sie lässt sich
         nicht ändern, und ein ausgegrautes Eingabefeld sieht aus
         wie ein Fehler. */
      h += '<div class="k-f k-f--ro">'
        +    '<span class="k-f-l">MAC-Adresse:'
        +      (mehr ? '<em>automatisch gesetzt</em>' : '') + '</span>'
        +    '<div class="k-ro mono" title="Fest eingebaute Adresse der Netzwerkkarte. '
        +      'Sie entsteht beim Anlegen des Geräts und ändert sich nie.">' + esc(nic.mac) + '</div>'
        + '</div>';

      /* ─ Kabel oder Funk? ─
         Steht zwischen MAC-Adresse und IP-Adresse, und zwar mit
         Absicht: „wie hängt diese Karte am Netz" ist eine Frage
         über die Karte selbst und gehört vor jede Frage nach
         Adressen. Filius stellt sie ebenfalls am Rechner und mit
         genau diesen zwei Wörtern (jhostkonfiguration_msg14 und
         msg13); die Auswahlliste darunter heißt dort
         „Drahtloses Netzwerk (SSID):" und fängt mit
         „Bitte auswählen" an.

         Ein Zugangspunkt bekommt diese Wahl nicht: er STRAHLT
         aus, er sucht nicht. Wer beides anböte, müsste erklären,
         was ein Switch tut, der sich in sein eigenes WLAN
         einwählt. */
      if (funkFaehig(node)) h += funkWahl(node, nic, i, ro, mehr);

      /* Das einzige Feld mit Farbe darunter — im Wortsinn: die
         Spiegelschicht liegt hinter dem Feld und färbt Netz- und
         Geräteteil. Eine Erklärzeile stand hier einmal auch noch
         („Netz 192.168.1.0/24 · Gerät Nr. 1 · Rundruf …"). Die ist
         weg: Präfixschreibweise kommt in Filius nirgends vor, und
         drei zusätzliche Begriffe unter einem Feld sind für den
         Einstieg zu viel. Die zwei Farben sagen dasselbe ohne ein
         einziges neues Wort. */
      /* Bei DHCP steht in BEIDEN Feldern dasselbe: nichts, und
         darunter blass, woher es kommt. Vorher trug das Adressfeld
         „— kommt vom Server —" und das Maskenfeld die Vorgabe
         255.255.255.0 — zwei Felder mit derselben Herkunft in zwei
         verschiedenen Zuständen. Wer das sieht, hält die Maske für
         eingetragen und die Adresse für vergessen. */
      const holt = nic.dhcp ? '— vom DHCP-Server' : null;

      h += eingabe('IP-Adresse', 'ip', nic.ip, feldRo, i,
                   holt || '192.168.1.10', nic.dhcp,
                   ipInnenHtml(nic.ip, nic.mask));

      h += eingabe('Netzmaske', 'mask', nic.mask, feldRo, i,
                   holt || '255.255.255.0', nic.dhcp);

      /* Der Platz für die Fehlermeldung steht IMMER da (leer und
         verborgen, wenn alles stimmt). Vorher wurde er beim
         Verlassen des Feldes nachgebaut — und weil dabei das ganze
         Formular neu entstand, sprang der Fokus heraus, sobald man
         mit der Tabulatortaste von der Adresse zur Maske wollte.
         Jetzt wird nur dieser eine Kasten gefüllt. */
      h += '<div class="k-err" data-err="' + i + '"' + (err ? '' : ' hidden') + '>'
        + esc(err || '') + '</div>';

      // Was DHCP gerade tut
      if (nic.dhcp) {
        if (sucht && !nic.ip) {
          h += '<div class="k-dhcp is-warten">Sucht einen DHCP-Server …</div>';
        } else if (lease) {
          h += '<div class="k-dhcp">Geliehen von ' + esc(lease.server)
            + ' · noch ' + esc(U.fmtTime(lease.rest)) + '</div>';
        } else if (!nic.ip) {
          /* Der Satz sagt ausdrücklich, dass alle vier Angaben von
             dort kommen. Sonst liest man „noch keine Adresse" und
             sucht, warum denn wenigstens die Netzmaske fehlt. */
          h += '<div class="k-dhcp is-warten">Noch keine Angaben. Adresse, Netzmaske, '
            + 'Gateway und DNS-Server holt sich dieses Gerät beim DHCP-Server — '
            + 'dazu muss die Uhr laufen, oben auf <em>Aktion</em>.</div>';
        }
        if (!ro) h += '<button class="k-lnk" data-k="dhcpneu" data-nic="' + i + '">Adresse neu holen</button>';
      }

      /* Kabel und Abbauen gehören zum Bauen, nicht zum Einrichten.
         Bei einer Funkkarte steht hier nichts: „kein Kabel
         eingesteckt" wäre bei ihr keine Auskunft, sondern der
         Normalzustand — und wo sie hängt, sagt die Zeile
         „Verbunden mit …" weiter oben.

         Beim Heimrouter steht es auch nicht: die LAN-Seite hat
         mehrere Buchsen, und „Kabel zu Endgerät 1" wäre dort die
         Auskunft über genau eine davon. Die Buchsenreihe darunter
         zeigt alle. */
      if (mehr && !nic.funk && !netz.istLan(node, i)) {
        h += '<div class="k-link">' + (peer
          ? 'Kabel zu <strong>' + esc(peer.node.name) + '</strong>'
          : '<span class="dim">kein Kabel eingesteckt</span>') + '</div>';
      }
      if (mehr && !nic.funk) {
        // Abbauen nur, wenn nichts dran hängt und genug übrig bleibt.
        if (!ro && K.maxPorts > 1 && !netz.istHeim(node)
            && netz.feste(node).length > 2 && !nic.cable) {
          h += '<button class="k-lnk k-lnk--weg" data-k="delnic" data-nic="' + i + '">Schnittstelle entfernen</button>';
        }
      }

      return h + '</div>';
    }

    /* Wer kann sich in ein WLAN einwählen? Alles, was weder
       ausstrahlt noch vermittelt — also genau die Endgeräte, in
       allen drei Bildern. Bewusst so herum gefragt und nicht als
       Aufzählung von host/server/handy: ein viertes Bild soll hier
       nichts zu ändern haben. */
    const funkFaehig = (node) => {
      const k = netz.KIND[node.kind] || {};
      return !k.wlan && !k.routes && node.kind !== 'switch';
    };

    function funkWahl(node, nic, i, ro, mehr) {
      const punkte = netz.zugangspunkte();
      const verbunden = nic.funk && nic.cable ? netz.peerOf(node.id, i) : null;

      /* ⚠️ Beim Handy gibt es die Wahl nicht — es hat keine
         Kabelbuchse (`netz.nurFunk`). Zwei Knöpfe, von denen
         einer nie geht, wären schlechter als keine: sie stellen
         eine Frage, auf die das Gerät schon geantwortet hat.
         Filius kennt diesen Fall nicht, kennt aber auch kein
         Handy; bei ihm hat jeder Rechner beide Knöpfe
         (jhostkonfiguration_msg13/14). */
      let h = '';
      if (!netz.nurFunk(node)) {
        h += '<div class="k-wahl" role="group" aria-label="Anschlussart">'
          + '<button class="k-wahl-b' + (nic.funk ? '' : ' is-on') + '" data-k="funk" '
          +   'data-nic="' + i + '" data-an="0"' + (ro ? ' disabled' : '') + '>Kabelgebunden (LAN)</button>'
          + '<button class="k-wahl-b' + (nic.funk ? ' is-on' : '') + '" data-k="funk" '
          +   'data-nic="' + i + '" data-an="1"' + (ro ? ' disabled' : '') + '>Drahtlos (WLAN)</button>'
          + '</div>';
      }

      if (!nic.funk) return h;

      /* Die Liste enthält NUR, was gerade ausgestrahlt wird — so
         wie die Liste auf einem Telefon. Ein Name, den man von
         Hand eintippen kann, wäre bequemer und würde die eine
         Aussage kaputtmachen, um die es geht: ein Gerät findet ein
         Funknetz, es erfindet keines. Steht in der Liste nichts,
         ist das die Antwort auf „warum verbindet er sich nicht". */
      const fehlt = nic.ssid && !punkte.some(p => p.ssid === nic.ssid);
      h += '<label class="k-f"><span class="k-f-l">'
        + (mehr ? 'Drahtloses Netzwerk (SSID)' : 'WLAN (SSID)') + ':</span>'
        + '<select class="f" data-f="nicssid" data-nic="' + i + '"' + (ro ? ' disabled' : '') + '>'
        + '<option value=""' + (nic.ssid ? '' : ' selected') + '>Bitte auswählen</option>'
        /* Ein Name, der einmal gewählt war und jetzt nicht mehr
           ausgestrahlt wird, bleibt in der Liste stehen — sonst
           spränge die Auswahl stillschweigend auf „Bitte
           auswählen" zurück, und niemand wüsste, dass hier einmal
           etwas stand. */
        + (fehlt ? '<option value="' + esc(nic.ssid) + '" selected>' + esc(nic.ssid)
                   + ' (nicht in Reichweite)</option>' : '')
        + punkte.map(p => '<option value="' + esc(p.ssid) + '"'
            + (p.ssid === nic.ssid ? ' selected' : '') + '>' + esc(p.ssid) + '</option>').join('')
        + '</select></label>';

      if (verbunden) {
        h += '<div class="k-wlan-ok">Verbunden mit <b>' + esc(verbunden.node.name) + '</b></div>';
      } else if (fehlt) {
        h += '<div class="k-err">Kein Gerät strahlt „' + esc(nic.ssid) + '" aus. Schalte '
          + 'an einem Switch oder Heimrouter das WLAN ein und gib ihm diesen Namen.</div>';
      } else if (!nic.ssid) {
        h += '<div class="k-hint">' + (punkte.length
          ? 'Wähle ein Netz aus der Liste.'
          : 'Es strahlt noch niemand. Schalte an einem Switch oder Heimrouter das '
            + 'WLAN ein — dann steht sein Name hier.') + '</div>';
      }
      return h;
    }

    /* Ein Eingabefeld, das zu einer bestimmten Netzwerkkarte
       gehört. `zu` heißt: gesperrt UND mit Schloss — nicht jedes
       gesperrte Feld bekommt eines, sondern nur die, die jemand
       anderes füllt. */
    function eingabe(label, f, value, ro, nic, ph, zu, farbe) {
      const inp = '<input class="f' + (farbe != null ? ' f--farbig' : '') + '" '
        + 'data-nic="' + nic + '" data-f="' + f + '" value="' + esc(value || '') + '" '
        + 'placeholder="' + esc(ph || '') + '" inputmode="decimal" spellcheck="false"'
        + (ro ? ' disabled' : '') + '>';
      return '<label class="k-f' + (zu ? ' is-zu' : '') + '">'
        + '<span class="k-f-l">' + esc(label) + ':' + (zu ? SCHLOSS : '') + '</span>'
        + (farbe != null
            ? '<span class="k-f-in">'
              + '<span class="k-ipin" data-show="' + nic + '" aria-hidden="true">' + farbe + '</span>'
              + inp + '</span>'
            : inp)
        + '</label>';
    }

    function feld(label, name, value, ro, ph, zu) {
      return '<label class="k-f' + (zu ? ' is-zu' : '') + '">'
        + '<span class="k-f-l">' + esc(label) + ':' + (zu ? SCHLOSS : '') + '</span>'
        + '<input class="f" data-f="' + name + '" value="' + esc(value || '') + '" '
        + 'placeholder="' + esc(ph || '') + '" spellcheck="false"' + (ro ? ' disabled' : '') + '></label>';
    }

    /* ═══ Was das Gerät gelernt hat ══════════════════════════
       Diese Tabellen standen bis eben in der Spalte am rechten
       Rand. Sie sind der halbe Unterricht — aber sie sind nichts,
       was dauerhaft danebenstehen muss: gefragt wird nach ihnen
       an zwei Stellen der Stunde, und dann sind sie einen Klick
       entfernt.                                                 */
    /* ⚠️ Nur auf Wunsch: für eine 8. Klasse ist dieser Block zu viel.
       Der Schalter „Geräte-Lerninformationen" im Menü Ansicht & Tools
       setzt `lernInfo` (app.js); ohne ihn bleibt der Kasten leer. */
    let lernInfo = false;

    function tabellen(node) {
      if (!lernInfo) return '';
      let h = '<div class="k-sec">Was dieses Gerät gelernt hat</div>';

      if (node.kind === 'switch') {
        const t = stack.macTable(node);
        h += '<div class="tbl-t">Welche MAC-Adresse hängt an welchem Anschluss</div>';
        h += t.length
          ? '<table class="tbl"><tr><th>Anschluss</th><th>MAC-Adresse</th></tr>'
            + t.map(r => '<tr><td>' + (r.nic + 1) + '</td><td class="mono">' + esc(r.mac) + '</td></tr>').join('')
            + '</table>'
          : '<div class="k-note dim">Noch nichts. Sobald Rahmen durchlaufen, füllt sich diese '
            + 'Tabelle — und der Switch hört auf, alles an alle zu schicken.</div>';
        return h;
      }

      const a = stack.arpTable(node);
      h += '<div class="tbl-t">ARP — welche MAC gehört zu welcher IP</div>';
      h += a.length
        ? '<table class="tbl"><tr><th>IP</th><th>MAC</th></tr>'
          + a.map(r => '<tr><td class="mono">' + esc(r.ip) + '</td><td class="mono">' + esc(r.mac) + '</td></tr>').join('')
          + '</table>'
        : '<div class="k-note dim">Noch leer. Der erste Ping füllt sie.</div>';

      const rt = stack.routingTable(node);
      h += '<div class="tbl-t">Wege</div>';
      h += rt.length
        // Netz und Maske in zwei Spalten, wie in der
        // Weiterleitungstabelle von Filius — nicht als /24.
        //
        // ⭐ Die Spalte „Herkunft" hat Filius nicht (dort sind
        // höchstens die manuellen Zeilen farblich abgesetzt), und
        // sie ist der Grund, warum diese Tabelle im Unterricht
        // etwas erklärt: drei Zeilen können dasselbe Ziel meinen,
        // und welche gilt, hängt daran, woher sie kommt. Bei einem
        // gelernten Weg steht die Zahl der Sprünge dabei — sie ist
        // der einzige Wert, den nur RIP hat.
        ? '<table class="tbl"><tr><th>Netz</th><th>Maske</th><th>über</th><th>Herkunft</th></tr>'
          + rt.map(r => '<tr><td class="mono">' + esc(r.net)
            + '</td><td class="mono">' + esc(r.mask)
            + '</td><td class="mono">' + esc(r.gateway)
            + '</td><td>' + esc(r.kind)
            + (r.hops != null ? ' <span class="dim">' + r.hops
                + (r.hops === 1 ? ' Sprung' : ' Sprünge') + '</span>' : '')
            + '</td></tr>').join('')
          + '</table>'
        : '<div class="k-note dim">Keine Wege — es fehlt eine IP-Adresse.</div>';

      /* ─ Was die Nachbarn gesagt haben ─
         Eine eigene Tabelle neben „Wege", und das ist Absicht: dort
         steht, was der Router BENUTZT, hier steht, was er WEISS.
         Der Unterschied ist genau der Unterricht — die eigenen
         Netze mit null Sprüngen stehen hier (sie werden angesagt,
         aber nicht gelernt), und ein abgelaufener Weg steht mit
         „unerreichbar" noch da, statt stillschweigend zu
         verschwinden.

         Filius zeigt dasselbe im Browser unter der Adresse des
         Routers, mit dem Satz „Diese Tabelle wird durch das Routing
         Information Protocol (RIP) aufgebaut und aktualisiert."
         (sw_vermittlungweb_msg1). */
      if (stack.ripAktiv && stack.ripAktiv(node)) {
        const rz = stack.ripZeilen(node);
        /* ⚠️ Die Überschrift hieß eine Runde lang „was die Nachbarn
           gesagt haben" — und war damit falsch, sobald nichts
           gelernt war: im Entwurfsmodus stehen dort NUR die eigenen
           Netze mit null Sprüngen, und die hat kein Nachbar gesagt.
           Der Prüfstand hat es gefunden. Jetzt deckt die
           Überschrift beides, und die Null ist die halbe Lehre:
           „das ist meins, und so weit weg ist alles andere." */
        h += '<div class="tbl-t">RIP — Netze und ihre Entfernung</div>';
        h += rz.length
          ? '<table class="tbl"><tr><th>Netz</th><th>über</th><th>Sprünge</th></tr>'
            + rz.map(r => '<tr' + (r.weg ? ' class="is-weg"' : '') + '>'
              + '<td class="mono">' + esc(r.net) + '</td>'
              + '<td class="mono">' + esc(r.gw || '— selbst —') + '</td>'
              + '<td>' + (r.weg ? 'unerreichbar' : r.hops) + '</td></tr>').join('')
            + '</table>'
          : '<div class="k-note dim">Noch nichts. Im Aktionsmodus rufen sich die Router '
            + 'im Takt zu, welche Netze sie kennen — nach wenigen Sekunden steht hier '
            + 'jedes Netz, das über einen Nachbarn zu erreichen ist.</div>';
      }

      /* ─ Die NAT-Tabelle ─
         Sie ist der Beweis für den Satz, den der Schalter oben
         behauptet: hier steht Zeile für Zeile, welches Gerät im
         Haus sich hinter welcher Portnummer draußen verbirgt. Ein
         Ping aus dem Heimnetz legt eine an, und wenn die Antwort
         kommt, sieht man, woran sie zurückgefunden hat.

         Filius zeigt dasselbe in einem eigenen Fenster
         (NatViewer). Hier steht es bei den anderen Tabellen, die
         ein Gerät sich selbst gebaut hat — denn genau das ist es,
         und ein eigenes Fenster wäre ein Ort mehr zum Suchen.

         Die Erklärung steht auch bei leerer Tabelle da: „noch
         nichts" ist an dieser Stelle die halbe Aussage (von außen
         kann niemand anfangen). */
      if (stack.natAktiv && stack.natAktiv(node)) {
        const nt = stack.natTabelle(node);
        h += '<div class="tbl-t">NAT — wer im Haus steckt hinter welchem Port</div>';
        /* ⭐ Die Spalte „woher" ist der ganze Punkt seit den
           Portfreigaben: dieselbe Übersetzung, aber die eine Zeile
           ist beim Hinausgehen ENTSTANDEN und die andere von Hand
           EINGETRAGEN. Ohne die Spalte stünden sie ununterscheidbar
           untereinander — und dann sähe eine Freigabe aus wie ein
           Gespräch, das gerade läuft. */
        h += nt.length
          ? '<table class="tbl"><tr><th>innen</th><th>außen</th><th>woher</th></tr>'
            + nt.map(r => '<tr><td class="mono">' + esc(r.innen + ':' + r.innenPort)
              + '</td><td class="mono">' + esc(r.aussen + ':' + r.aussenPort)
              + '</td><td>' + (r.frei
                  ? '<b>Freigabe</b> <span class="dim">' + esc(String(r.proto).toUpperCase()) + '</span>'
                  : '<span class="dim">Gespräch</span>')
              + '</td></tr>').join('')
            + '</table>'
          : '<div class="k-note dim">Noch leer. Jedes Paket aus dem Heimnetz legt eine '
            + 'Zeile an; ohne Zeile findet keine Antwort zurück — deshalb kann von '
            + 'außen niemand anfangen.</div>';
      }

      // Aufgelöste Namen: nur wenn es welche gibt. Eine leere
      // Tabelle mit Erklärung wäre bei DNS mehr Text als Nutzen.
      const dc = dienste ? dienste.dnsCache(node) : [];
      if (dc.length) {
        h += '<div class="tbl-t">Namen, die dieses Gerät kennt</div>'
          + '<table class="tbl"><tr><th>Name</th><th>Adresse</th></tr>'
          + dc.map(r => '<tr><td>' + esc(r.name) + '</td><td class="mono">' + esc(r.ip) + '</td></tr>').join('')
          + '</table>';
      }

      // Was dieses Gerät verliehen hat
      const ls = dienste && node.dhcpServer && node.dhcpServer.on ? dienste.leases(node) : [];
      if (ls.length) {
        h += '<div class="tbl-t">Als DHCP-Server verliehen</div>'
          + '<table class="tbl"><tr><th>Adresse</th><th>an MAC</th></tr>'
          + ls.map(r => '<tr><td class="mono">' + esc(r.ip) + '</td><td class="mono">'
            + esc(r.mac) + '</td></tr>').join('')
          + '</table>';
      }

      return h;
    }

    /* ═══ Unterseite: DHCP-Server einrichten ═════════════════
       Aufbau und Wortlaut aus dem Dialog von Filius
       (JDHCPKonfiguration): Adress-Untergrenze, Adress-Obergrenze,
       Netzmaske, Gateway, DNS-Server, „DHCP aktivieren".

       Filius hat dort noch einen Schalter „Manuelle
       Einstellungen": ohne ihn übernimmt der Server Maske, Gateway
       und DNS von sich selbst. Das ist hier genauso — die Felder
       werden beim Einschalten gefüllt und lassen sich danach
       ändern. Ein zweiter Schalter dafür wäre eine Frage, die sich
       ein Kind nicht stellt.                                    */
    function bauDhcpSeite(node, box, opts) {
      /* Die Vorgaben werden beim Öffnen gesetzt, nicht erst beim
         Einschalten: wer diese Seite aufschlägt, soll die Felder
         gefüllt sehen und entscheiden, ob es so passt — und nicht
         vier leere Kästchen ausfüllen müssen, um überhaupt
         anschalten zu können. Gefüllt wird nur, was leer ist. */
      const c = dhcpVorgabe(netz, node);
      const l = dienste ? dienste.leases(node) : [];

      let h = '<button class="k-zurueck" data-k="zurueck">‹ Zurück</button>'
        + '<div class="k-sec">DHCP-Server einrichten</div>';

      h += '<label class="k-switch">'
        +    '<input type="checkbox" data-k="dhcpsrv"' + (c.on ? ' checked' : '') + '>'
        +    '<span>DHCP aktivieren</span></label>';

      /* Beim Heimrouter gibt es hier nichts zu wählen: verteilt
         wird ins Haus, also auf der LAN-Seite. Filius bindet den
         Server ebenfalls fest dorthin (GatewayFirmware.setKnoten
         → bindAddress(holeLANInterface)). Eine Auswahlliste, in
         der auch WAN stünde, wäre die Einladung, dem ganzen
         Internet Adressen anzubieten. */
      if (netz.istHeim(node)) {
        h += '<div class="k-hint">Verteilt wird auf der <b>LAN-Seite</b> — ins Haus. '
          + 'Zum Anbieter hin kann ein Heimrouter keine Adressen vergeben.</div>';
      } else if (node.nics.length > 1) {
        /* Beim cww nie die Internet-Karte: Adressen verteilt der
           Anbieter an seine Kunden, nicht in die Wolke. */
        if (netz.istInternet(node, c.nic | 0)) c.nic = 1;
        const cww = netz.istCww(node);
        h += '<label class="k-f"><span class="k-f-l">Netzwerkkarte:</span>'
          + '<select class="f" data-f="dhcpnic">'
          + node.nics.map((nic, i) => netz.istInternet(node, i) ? '' : '<option value="' + i + '"'
              + ((c.nic | 0) === i ? ' selected' : '') + '>'
              + (cww ? esc(netz.portLabel(node, i)) : 'Netzwerkkarte ' + (i + 1))
              + (nic.ip ? ' · ' + esc(nic.ip) : ' · ohne Adresse') + '</option>').join('')
          + '</select></label>';
      }

      h += feld('Adress-Untergrenze', 'dhcpvon', c.von, false, '192.168.1.100')
        +  feld('Adress-Obergrenze', 'dhcpbis', c.bis, false, '192.168.1.150')
        +  feld('Netzmaske', 'dhcpmask', c.mask, false, '255.255.255.0')
        +  feld('Gateway', 'dhcpgw', c.gateway, false, '192.168.1.1')
        +  feld('DNS-Server', 'dhcpdns', c.dns, false, 'leer lassen, wenn keiner da ist');

      /* ─── Statische Adresszuweisung ────────────────────────
         Filius' zweiter Reiter im DHCP-Dialog, samt Wortlaut:
         „Statische Adresszuweisung" mit den Spalten „MAC-Adresse"
         und „IP-Adresse" und den Knöpfen „Hinzufügen" /
         „Entfernen" (jdhcpkonfiguration_msg11 bis msg15). Hier
         steht der Abschnitt untereinander statt hinter einem
         Reiter — dieselbe Entscheidung wie überall in diesem
         Programm: was hinter einem Reiter liegt, beantwortet die
         Frage „was hat dieser Server eigentlich eingestellt"
         nicht.

         ⚠️ Die Adresse muss NICHT im Bereich liegen. Auch das ist
         aus Filius übernommen (findStaticOffer fragt den Bereich
         gar nicht) und sachlich richtig: eine Reservierung ist
         eine Ausnahme von der Vergabe, und eine Ausnahme, die
         innerhalb der Regel liegen muss, ist keine. */
      const fest = c.statisch || (c.statisch = []);
      h += '<div class="k-sec">Statische Adresszuweisung</div>';
      if (fest.length) {
        h += '<div class="k-recs">' + fest.map((e, i) =>
          '<div class="k-rec">'
          + '<input class="f mono" data-f="festmac" data-fest="' + i + '" value="'
          +   esc(e.mac || '') + '" placeholder="02:1f:3c:…" spellcheck="false">'
          + '<input class="f mono" data-f="festip" data-fest="' + i + '" value="'
          +   esc(e.ip || '') + '" placeholder="192.168.1.20" inputmode="decimal" spellcheck="false">'
          + '<button class="k-x" data-k="festdel" data-fest="' + i + '" title="Entfernen">×</button>'
          + '</div>').join('') + '</div>';

        /* ⭐ Die MAC-Adressen der Geräte im Netz als anklickbare
           Kürzel. Das ist eine Zutat gegenüber Filius, wo man sie
           abtippt — und die Begründung ist ein gemessener Fehler
           und keine Bequemlichkeit: siebzehn Zeichen aus zwei
           Alphabeten abzuschreiben geht schief, und eine
           Reservierung, die wegen eines Zeichens nicht greift,
           sieht aus wie ein kaputtes DHCP.

           Es ist KEINE Vorbelegung: das Feld bleibt leer, bis
           jemand ein Kürzel antippt. Die Entscheidung, WELCHES
           Gerät eine feste Adresse bekommt, nimmt ihm niemand ab. */
        /* ⚠️ NUR Endgeräte (`!routes && !wlan` — also host, server,
           handy; Router, Heimrouter und Switch fallen heraus).
           Zwei Gründe, und der zweite wiegt schwerer:

             · Ein Router holt seine Adressen nicht per DHCP; eine
               Reservierung für ihn tut nichts.
             · Er hat MEHRERE Karten, und `feste(n)[0]` wäre die
               erste — nicht unbedingt die in DIESEM Netz. Das
               Kürzel hätte also manchmal die richtige MAC genannt
               und manchmal eine aus einem ganz anderen Netz, und
               dieser Fehler meldet sich nicht: die Reservierung
               greift einfach nie. */
        const kandidaten = netz.list()
          .filter(n => n.id !== node.id && netz.KIND[n.kind]
                       && !netz.KIND[n.kind].routes && !netz.KIND[n.kind].wlan)
          .map(n => ({ kurz: netz.kurzName(n), mac: (netz.feste(n)[0] || {}).mac }))
          .filter(x => !!x.mac);
        if (kandidaten.length) {
          h += '<div class="k-macs">' + kandidaten.map(x =>
            '<button class="sn-chip" data-k="festmacwahl" data-mac="' + esc(x.mac) + '" '
            + 'title="' + esc(x.mac) + '">' + esc(x.kurz) + '</button>').join('') + '</div>';
          h += '<div class="k-hint dim">Antippen setzt die MAC-Adresse in die '
            + '<em>letzte</em> Zeile. Welches Gerät eine feste Adresse bekommt, '
            + 'entscheidest du.</div>';
        }
      } else {
        h += '<div class="k-hint dim">Keine feste Zuweisung. Jedes Gerät bekommt '
          + 'irgendeine Adresse aus dem Bereich — welche, ist nicht vorhersehbar.</div>';
      }
      h += '<button class="k-add" data-k="festneu">Hinzufügen</button>';

      h += '<div class="k-sec">Vergebene Adressen</div>';
      h += l.length
        ? '<table class="tbl"><tr><th>IP-Adresse</th><th>MAC-Adresse</th></tr>'
          + l.map(r => '<tr><td class="mono">' + esc(r.ip) + '</td><td class="mono">'
            + esc(r.mac) + '</td></tr>').join('') + '</table>'
        : '<div class="k-hint">Noch nichts vergeben. Stell bei einem Endgerät '
          + '<em>DHCP zur Konfiguration verwenden</em> ein und lass die Uhr laufen.</div>';

      box.innerHTML = h;
      wire(node, box, opts);
    }

    /* ═══ Verdrahten ═════════════════════════════════════════
       Felder wirken beim Tippen, nicht auf Knopfdruck. Wo sich die
       Struktur ändert (Anschluss dazu, Dienst an), wird das
       Formular neu gebaut — das ist der einzige Fall, in dem der
       Fokus springen darf, und er kommt von einem Klick, nicht von
       einem Tastendruck. */
    function wire(node, box, opts) {
      const dirty = () => { if (opts.onDirty) opts.onDirty(); };
      const redraw = () => { if (opts.redraw) opts.redraw(); };
      const rebuild = () => { if (opts.rebuild) opts.rebuild(); else bauen(node, box, opts); };
      const toast = (m) => { if (opts.toast) opts.toast(m); };
      const sync = () => { if (dienste) dienste.sync(); };

      betonungVerdrahten(node, box, opts);
      infoVerdrahten(box);

      /* ─ Textfelder ─ */
      box.querySelectorAll('input.f, select.f').forEach(inp => {
        const ereignis = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(ereignis, () => {
          const f = inp.dataset.f;
          const v = String(inp.value).trim();

          if (f === 'ip' || f === 'mask') {
            const nic = node.nics[+inp.dataset.nic];
            if (nic) nic[f] = v;
            stack.clearTables(node);
            malen(node, box, +inp.dataset.nic);
          } else if (f === 'gateway') { node.gateway = v; }
          else if (f === 'dns')       { node.dns = v; }
          /* ─ Der Netzname, beim Tippen ─
             Er wirkt sofort: wer ihn ändert, sieht die Geräte
             abfallen, die den alten gewählt hatten, und beim
             letzten Buchstaben wieder aufspringen, wenn jemand
             denselben Namen sucht. Filius räumt beim Ändern
             ebenfalls alle Funkverbindungen ab
             (JSwitchKonfiguration.aenderungenAnnehmen) — nur erst
             beim Verlassen des Feldes, und dann ist es ein Sprung
             statt einer Bewegung.

             KEIN rebuild() hier: das Feld, in dem gerade getippt
             wird, dürfte dabei nicht neu entstehen. */
          else if (f === 'ssid') { netz.wlanConf(node).ssid = v; netz.funkAbgleich(); }
          else if (f === 'nicssid') {
            const k = node.nics[+inp.dataset.nic];
            if (k) { k.ssid = v; netz.funkAbgleich(); }
            sync(); dirty(); redraw(); rebuild();
            return;
          }
          /* ─ Eine Zeile der Weiterleitungstabelle ─
             Wirkt beim Tippen wie jedes andere Feld — aber die
             Auskunft darunter („über LAN 1 · 192.168.2.1") muss
             mitgehen, sonst steht beim halb getippten Gateway noch
             die Antwort von vorhin. `wegMalen` schreibt nur diese
             eine Zeile neu; ein `rebuild()` würde dem Feld unter
             den Fingern den Fokus nehmen. */
          else if (WEG_FELD[f]) {
            const r = (node.routes || [])[+inp.dataset.weg];
            if (r) r[WEG_FELD[f]] = v;
            wegMalen(node, box, +inp.dataset.weg);
            malenTabellen(node, box);
            /* Dieselbe Zeile steht unten im Fenster noch einmal.
               ⚠️ Auch dort nur MALEN, nicht neu bauen: sonst
               entstünde beim Tippen im Kärtchen das Feld im Fenster
               neu — und der Schreibstrich springt weg, wenn jemand
               umgekehrt dort tippt. */
            if (fenster) fenster.malen();
          }
          else if (FREI_FELD[f]) {
            const fr = netz.natConf(node).frei[+inp.dataset.frei];
            if (fr) fr[FREI_FELD[f]] = v;
            /* Der blasse Vorschlag im LAN-Port geht beim Tippen
               mit — sonst stünde dort die Nummer von vorhin, und
               ein Platzhalter, der die falsche Zahl nennt, ist
               schlimmer als gar keiner. */
            if (f === 'freiport') {
              const lp = box.querySelector(
                '[data-f="freilanport"][data-frei="' + inp.dataset.frei + '"]');
              if (lp) lp.placeholder = v || '80';
            }
            malenTabellen(node, box);
          }
          /* Eine Zeile der statischen Zuweisung. MAC-Adressen
             werden klein geschrieben — der Vergleich in
             `dienste.waehleIp` sieht ohnehin von Groß und Klein
             ab, aber im Feld soll stehen, was auch am Gerät
             steht. */
          else if (f === 'festmac' || f === 'festip') {
            const e = (netz.dhcpConf(node).statisch || [])[+inp.dataset.fest];
            if (e) e[f === 'festmac' ? 'mac' : 'ip'] =
              f === 'festmac' ? v.toLowerCase() : v;
          }
          else if (f === 'dhcpnic')   { netz.dhcpConf(node).nic = +v; sync(); rebuild(); }
          else if (f === 'dhcpvon')   { netz.dhcpConf(node).von = v; }
          else if (f === 'dhcpbis')   { netz.dhcpConf(node).bis = v; }
          else if (f === 'dhcpmask')  { netz.dhcpConf(node).mask = v; }
          else if (f === 'dhcpgw')    { netz.dhcpConf(node).gateway = v; }
          else if (f === 'dhcpdns')   { netz.dhcpConf(node).dns = v; }
          dirty(); redraw();
        });
      });

      /* ─ Schalter und Knöpfe ─ */
      box.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;

        if (k === 'dhcp') {
          el.addEventListener('change', () => {
            const nic = node.nics[+el.dataset.nic];
            if (!nic) return;
            /* Beim Einschalten fällt ALLES weg, was von Hand
               eingetragen war: Adresse, Netzmaske, Gateway, DNS.
               Etwas davon stehen zu lassen wäre die freundlichere
               Geste und die schlechtere Lehre — dann stünde in einem
               gesperrten Feld eine Angabe, die niemand vergeben hat.

               Vorher fiel nur die Adresse weg. Das Gateway blieb
               stehen, konnte ohne Adresse in keinem Netz mehr liegen,
               und das Gerät trug ab sofort ein „!" mit einer
               Fehlermeldung über ein Feld, das es gerade gesperrt
               hatte. Siehe netz.setDhcp. */
            netz.setDhcp(node, nic.i, el.checked);
            /* Ein Gerät, das sich seine Adresse holen lässt, kann
               keine verteilen. Filius macht dasselbe und schaltet
               den Server beim Ankreuzen ab — sonst verteilt ein
               Endgerät Adressen aus einem Bereich, der zu seiner
               eigenen gar nicht mehr passen muss. */
            if (nic.dhcp && node.dhcpServer && node.dhcpServer.on) node.dhcpServer.on = false;
            stack.clearTables(node);
            sync(); dirty(); redraw(); rebuild();
          });
          return;
        }

        /* ─ WLAN an und aus ─
           Beim Einschalten bekommt das Netz einen Namen, wenn noch
           keiner dasteht. Filius kennt keinen Schalter: dort IST
           der leere Name das Aus. Das ist sparsam und didaktisch
           schlecht — „WLAN abschalten" hieße dort „den Namen
           löschen", und beim Wiedereinschalten ist er weg. Ein
           echtes Gerät kommt mit einem Namen und behält ihn.

           Der Vorschlag ist absichtlich einer, den man ersetzen
           WILL: „WLAN-SW1" ist eindeutig und hässlich genug, dass
           jemand einen eigenen eintippt — und genau darum geht es
           bei dieser Einstellung. */
        if (k === 'wlan') {
          el.addEventListener('change', () => {
            const c = netz.wlanConf(node);
            c.on = el.checked;
            if (c.on && !c.ssid) c.ssid = vorschlagSsid(node);
            netz.funkAbgleich();
            dirty(); redraw(); rebuild();
          });
          return;
        }

        /* ─ Automatisches Routing an und aus ─
           `sync()` ist der einzige Weg, auf dem der Takt anläuft —
           dieselbe Regel wie bei DHCP und DNS. Und `ripLeeren` beim
           Ausschalten aus demselben Grund wie bei NAT: eine Tabelle,
           die stehen bleibt, kennt nach dem Wiedereinschalten Wege,
           die in diesem Durchlauf niemand bestätigt hat. */
        if (k === 'rip') {
          el.addEventListener('change', () => {
            netz.ripConf(node).on = el.checked;
            if (!el.checked && stack.ripLeeren) stack.ripLeeren(node);
            sync(); dirty(); redraw(); rebuild();
          });
          return;
        }

        if (k === 'dhcpsrv') {
          el.addEventListener('change', () => {
            const c = netz.dhcpConf(node);
            c.on = el.checked;
            if (c.on) {
              dhcpVorgabe(netz, node);
              /* Umgekehrt genauso: wer verteilt, holt sich nicht.
                 Über setDhcp, damit der Anschluss dabei seine
                 Netzmaske zurückbekommt — sonst steht der frisch
                 eingerichtete Server mit leerem Maskenfeld da. */
              for (const nic of node.nics) if (nic.dhcp) netz.setDhcp(node, nic.i, false);
            }
            sync(); dirty(); redraw(); rebuild();
          });
          return;
        }

        el.addEventListener('click', (ev) => {
          ev.preventDefault();

          if (k === 'dhcpseite') { box.dataset.seite = 'dhcp'; rebuild(); return; }
          if (k === 'zurueck')   { box.dataset.seite = ''; rebuild(); return; }

          /* Der Reiter steht am Kasten, nicht am Gerät: wer beim
             Router auf „Allgemein" umschaltet und dann ein
             Endgerät antippt, soll dort nicht auf einer leeren
             Seite landen. panels.js setzt ihn beim Gerätewechsel
             zurück — wie die DHCP-Unterseite auch. */
          if (k === 'reiter') { box.dataset.reiter = el.dataset.seite; rebuild(); return; }

          if (k === 'del') { if (opts.loeschen) opts.loeschen(); return; }

          if (k === 'addnic') {
            const r = netz.addNic(node.id);
            if (!r.ok) { toast(r.error); return; }
            dirty(); redraw(); rebuild();
            return;
          }

          if (k === 'delnic') {
            const r = netz.removeNic(node.id, +el.dataset.nic);
            if (!r.ok) { toast(r.error); return; }
            dirty(); redraw(); rebuild();
            return;
          }

          /* ─ Kabelgebunden oder drahtlos ─
             Ein Klick, eine Bedeutung. Das Umstellen auf Funk
             zieht ein gestecktes Kabel ab (netz.setFunk) — es
             GIBT keine Karte, die beides ist, und ein Kabel
             stillschweigend stecken zu lassen hieße, einen
             Zustand zu zeigen, den das Modell nicht kennt. */
          if (k === 'funk') {
            netz.setFunk(node, +el.dataset.nic, el.dataset.an === '1');
            stack.clearTables(node);
            sync(); dirty(); redraw(); rebuild();
            return;
          }

          /* ⭐ `wegneu` gibt es hier nicht mehr. Angelegt wird eine
             Zeile nur noch im Fenster (`#wltNeu`) — siehe die
             Begründung bei `wegeBlock`. Gelöscht wird weiterhin an
             beiden Orten: ein × neben einer Zeile, die dasteht, ist
             kein zweiter Ort zum Anlegen, sondern der kürzeste Weg
             weg von etwas Falschem. */

          /* ─ Ins große Fenster ─
             Es schlägt sich selbst auf und wählt dabei dieses Gerät
             auf der Fläche aus — deshalb steht hier nur die eine
             Zeile und keine Auswahl davor. */
          if (k === 'wegfenster') {
            if (fenster) fenster.oeffnen(node.id);
            return;
          }

          if (k === 'wegdel') {
            (node.routes || []).splice(+el.dataset.weg, 1);
            /* redraw(), weil eine gelöschte Zeile die Wege des
               Geräts ändert — und die Fläche zeigt an der Kachel,
               ob ein Gerät ein Ziel erreicht. */
            dirty(); redraw(); rebuild();
            return;
          }

          if (k === 'freineu') {
            /* Das Protokoll steht auf TCP, und das ist KEINE
               vorweggenommene Antwort, sondern die Bauart des
               Feldes: eine Auswahlliste hat immer einen gewählten
               Eintrag. Filius' Hinweis dazu lautet „Gültige
               Einträge: TCP, UDP, 6 (für TCP) und 17 (für UDP)" —
               hier ist es eine Liste mit zwei Einträgen, damit die
               Frage „was schreibe ich da hin" gar nicht entsteht. */
            netz.natConf(node).frei.push({ proto: 'tcp', port: '', lanIp: '', lanPort: '' });
            dirty(); rebuild();
            const felder = box.querySelectorAll('[data-f="freiport"]');
            if (felder.length) felder[felder.length - 1].focus();
            return;
          }

          if (k === 'freidel') {
            netz.natConf(node).frei.splice(+el.dataset.frei, 1);
            dirty(); redraw(); rebuild();
            return;
          }

          /* ─ Statische Adresszuweisung ─ */
          if (k === 'festneu') {
            netz.dhcpConf(node).statisch.push({ mac: '', ip: '' });
            dirty(); rebuild();
            const felder = box.querySelectorAll('[data-f="festmac"]');
            if (felder.length) felder[felder.length - 1].focus();
            return;
          }

          if (k === 'festdel') {
            netz.dhcpConf(node).statisch.splice(+el.dataset.fest, 1);
            dirty(); redraw(); rebuild();
            return;
          }

          /* Ein Kürzel antippen setzt die MAC in die LETZTE Zeile.
             Nicht in die erste: neu angelegt wird unten, und
             genau dort steht der Schreibstrich nach
             „Hinzufügen". */
          if (k === 'festmacwahl') {
            const liste = netz.dhcpConf(node).statisch;
            if (!liste.length) liste.push({ mac: '', ip: '' });
            liste[liste.length - 1].mac = String(el.dataset.mac || '').toLowerCase();
            dirty(); rebuild();
            const felder = box.querySelectorAll('[data-f="festip"]');
            if (felder.length) felder[felder.length - 1].focus();
            return;
          }

          if (k === 'dhcpneu') {
            if (!dienste) return;
            const r = dienste.erneuern(node, +el.dataset.nic);
            if (!r.ok) toast(r.error);
            else toast('Frage läuft …');
            redraw(); rebuild();
            return;
          }

        });
      });
    }

    /* ═══ Welches Kabel gehört zu dieser Netzwerkkarte? ══════
       Ein Gerät mit drei Netzwerkkarten hat drei Kabel, und im
       Formular steht nur „Kabel zu Switch 1" — bei drei Switches
       hilft das wenig. Also andersherum: sobald eine Netzwerkkarte
       angefasst wird, leuchtet draußen auf der Fläche IHR Kabel.

       Angefasst heißt beides — darüberfahren und darin stehen. Der
       Schreibstrich hat dabei Vorrang vor dem Zeiger: wer eine
       Adresse tippt und die Maus dabei irgendwohin schiebt,
       arbeitet immer noch an dieser Karte.

       Verankert ist das an [data-nicbox] — dem Kasten, den auch die
       Fehlermeldung benutzt. Beim Switch tragen die
       Anschlussfelder dieselbe Markierung.                        */
    function betonungVerdrahten(node, box, opts) {
      /* Alles andere in wire() hängt an den Feldern, und die sind
         nach jedem Aufbau neu. Diese vier Hörer hängen am Kasten
         selbst — der bleibt. Ohne Abmelden sammelten sie sich bei
         jedem Aufbau an und zeigten auf das Gerät von vorhin. */
      if (box.betonungAb) { box.betonungAb.abort(); box.betonungAb = null; }
      if (!opts.betonen) return;
      const ab = new AbortController();
      const hoer = { signal: ab.signal };
      box.betonungAb = ab;

      let unterZeiger = null;          // Kartennummer unter dem Zeiger

      const nrVon = (ziel) => {
        const kasten = ziel && ziel.closest ? ziel.closest('[data-nicbox]') : null;
        return kasten ? +kasten.dataset.nicbox : null;
      };
      const kabelVon = (nr) => {
        const nic = nr == null ? null : node.nics[nr];
        return (nic && nic.cable) || null;
      };
      const auffrischen = () => {
        const f = document.activeElement;
        const imFeld = f && box.contains(f) ? nrVon(f) : null;
        opts.betonen(kabelVon(imFeld != null ? imFeld : unterZeiger));
      };

      box.addEventListener('pointerover', (ev) => {
        unterZeiger = nrVon(ev.target); auffrischen();
      }, hoer);
      box.addEventListener('pointerleave', () => { unterZeiger = null; auffrischen(); }, hoer);
      box.addEventListener('focusin', auffrischen, hoer);
      /* Beim Verlassen eines Feldes steht der Fokus noch auf dem
         alten — erst danach ist zu sehen, wohin er geht. */
      box.addEventListener('focusout', () => setTimeout(() => {
        if (box.betonungAb === ab) auffrischen();   // nicht nach einem Neuaufbau
      }, 0), hoer);
    }

    /* ⚠️ Hier stand `namensform` („Endgerät 1" → „endgeraet1.schule").
       Gebraucht hat es genau eine Stelle: der Knopf „Alle Geräte
       eintragen" im DNS-Fenster, und der ist gestrichen (siehe
       geraet.js). Namen denkt sich jetzt aus, wer sie einträgt —
       ein erfundener Gerätename wäre ohnehin nicht der, den die
       Klasse dem Server gibt. */

    /* Die Färbung beim Tippen mitziehen, ohne das Formular neu zu
       bauen — sonst verliert das Feld den Fokus nach jedem
       Zeichen. Die Schicht liegt hinter dem Feld: geschrieben wird
       nur ihr Inhalt, das Feld selbst bleibt unangetastet. Auch
       die Maske ruft das auf — sie verschiebt die Grenze, ohne
       dass sich in der Adresse ein Zeichen ändert. */
    function malen(node, box, i) {
      const nic = node.nics[i];
      if (!nic) return;
      const show = box.querySelector('[data-show="' + i + '"]');
      if (show) show.innerHTML = ipInnenHtml(nic.ip, nic.mask);
      const fehler = nic.ip ? U.checkHostAddress(nic.ip, nic.mask) : null;
      const eb = box.querySelector('[data-err="' + i + '"]');
      if (eb) { eb.textContent = fehler || ''; eb.hidden = !fehler; }
      const bx = box.querySelector('[data-nicbox="' + i + '"]');
      if (bx) bx.classList.toggle('has-err', !!fehler);
    }

    /* Dasselbe Verfahren wie `malen` für die IP-Adresse: die
       Auskunft unter einer Zeile der Weiterleitungstabelle geht
       beim Tippen mit, ohne dass das Formular neu entsteht.

       ⚠️ Die Regel steht NUR in `wegeBlock` und wird hier gerufen,
       nicht noch einmal geschrieben. Zwei Stellen, die entscheiden,
       ob eine Zeile gültig ist, laufen beim ersten Sonderfall
       auseinander — und dann sagt das Formular beim Tippen etwas
       anderes als nach dem Aufbauen. */
    function wegMalen(node, box, i) {
      const w = box.querySelector('[data-wegw="' + i + '"]');
      const r = (node.routes || [])[i];
      if (!w || !r) return;
      const s = wegStand(node, r);
      w.textContent = s.text;
      w.className = 'k-weg-w is-' + s.stand;
    }

    /* Dieselbe Zeile steht seit dieser Runde an ZWEI Orten: im
       Kärtchen und unten im Fenster. Wer im einen tippt, ändert das
       Modell — und im anderen stünde weiter die Zahl von vorhin.

       ⚠️ Das ist genau der Fall aus [[feedback_modell_ist_nicht_dom]],
       nur zum zweiten Mal: eine Änderung im Modell ist noch keine
       Änderung im Bild. Gelöst wird er hier mit einem Nachmalen und
       NICHT mit einem Neubau — ein `rebuild()` würde den Bildlauf
       des Kärtchens zurücksetzen, und bei jedem Tastendruck.

       Felder, in denen gerade der Schreibstrich steht, werden
       ausgelassen: sonst schriebe man sich beim Tippen den eigenen
       halb getippten Wert um (aus „192.168.3." würde wieder
       „192.168.3"). */
    function wegeMalen(node, box) {
      const rs = node.routes || [];
      for (const [f, key] of Object.entries(WEG_FELD)) {
        box.querySelectorAll('[data-f="' + f + '"]').forEach(inp => {
          const r = rs[+inp.dataset.weg];
          if (!r || inp === document.activeElement) return;
          const v = r[key] || '';
          if (inp.value !== v) inp.value = v;
        });
      }
      rs.forEach((r, i) => wegMalen(node, box, i));
    }

    /* Nur den Tabellenkasten neu füllen. Wer gerade in einem Feld
       steht, merkt davon nichts.

       ⚠️ Gerufen wird das nicht nur von der Uhr, sondern auch beim
       TIPPEN in einer Weiterleitungszeile oder einer Portfreigabe —
       und das musste der Prüfstand erst finden. Beide Formulare
       versprechen im Kurzhinweis, dass unten in der Tabelle steht,
       was dabei herauskommt („Was dabei herauskommt, steht in der
       NAT-Tabelle"). Ohne diesen Aufruf stimmte das erst beim
       nächsten beliebigen Neuzeichnen, also irgendwann — und ein
       Versprechen, das später eingelöst wird, sieht aus wie ein
       Formular ohne Wirkung. Der Fokus ist dabei sicher: der
       Tabellenkasten liegt außerhalb der Eingabezeilen. */
    function malenTabellen(node, box) {
      if (!box) return;
      const t = box.querySelector('[data-tabellen]');
      if (t) t.innerHTML = tabellen(node);
    }

    /* ═══ Die kompakte Leseansicht (Aktionsmodus) ══════════════
       Für Router, Heimrouter und Switch — die Geräte ohne
       Bildschirm. Vom Nutzer gesetzt: „Einstellungen kann ich jetzt
       nicht mehr ändern! Terminal brauche ich hier nicht. Alle Infos
       aus den Modalen werden in einer kompakten Ansicht dargestellt."

       Also KEIN Formular mit gesperrten Feldern (ein ausgegrautes
       Feld sieht aus wie ein Fehler), keine Reiter, sondern eine
       Seite aus Zeilen „Angabe · Wert". Eingestellt wird im Entwurf.
       Darunter die Tabellen, die das Gerät sich baut — im selben
       `data-tabellen`-Kasten wie groß, damit `malenTabellen` sie
       beim Laufen auffrischt. */
    function kompakt(node, box) {
      const sn = window.Subnetze ? window.Subnetze.berechnen(netz) : null;
      const leer = '<span class="dim">—</span>';
      const z = (l, v) => '<div class="kk-z"><span class="kk-l">' + esc(l) + '</span>'
        + '<span class="kk-v">' + (v || leer) + '</span></div>';
      const ipz = (nic) => nic.ip
        ? '<span class="mono">' + ipInnenHtml(nic.ip, nic.mask) + '</span>'
        : (nic.dhcp ? '<span class="dim">vom DHCP-Server</span>' : '');
      const mono = (t) => t ? '<span class="mono">' + esc(t) + '</span>' : '';
      const anAus = (an, zusatz) => an
        ? '<b class="kk-an">an</b>' + (zusatz ? ' · ' + zusatz : '')
        : '<span class="dim">aus</span>';

      const karte = (nic, titel, extra) => {
        const sub = sn ? sn.vonNic.get(node.id + '#' + nic.i) : null;
        return '<div class="kk-nic' + (sub ? ' has-sub' : '') + '"'
          + (sub ? ' style="--sub: var(--sn-' + sub.slot + ')"' : '') + ' data-nicbox="' + nic.i + '">'
          + '<div class="kk-t">' + esc(titel) + '</div>'
          + z('IP-Adresse', ipz(nic))
          + z('Netzmaske', mono(nic.mask))
          + z('MAC-Adresse', mono(nic.mac))
          + (extra || '')
          + '</div>';
      };

      let h = '<div class="kk">';
      const K = netz.KIND[node.kind] || {};

      if (netz.istHeim(node)) {
        const wan = node.nics[netz.WAN], lan = node.nics[netz.LAN];
        const buchsenListe = netz.bruecke(node, netz.LAN).filter(i => !node.nics[i].funkPort);
        const belegt = buchsenListe.filter(i => netz.peerOf(node.id, i)).length;
        h += karte(wan, 'WAN');
        h += karte(lan, 'LAN', z('Buchsen', belegt + ' von ' + buchsenListe.length + ' belegt'));
      } else if (node.kind !== 'switch') {
        netz.feste(node).forEach(nic => { h += karte(nic, netz.portLabel(node, nic.i)); });
      }

      if (netz.istCww(node)) {
        h += '<div class="kk-g">'
          + z('Adressbereich', mono(netz.internetConf().prefix + '.0.0.0/8'))
          + z('Automatisches Routing', anAus(netz.ripConf(node).on))
          + '</div>';
      } else if (node.kind !== 'switch') {
        h += '<div class="kk-g">'
          + z('Gateway', mono(node.gateway))
          + z('DNS', mono(node.dns));
        if (K.routes && !netz.istHeim(node) && stack.ripKann && stack.ripKann(node))
          h += z('Automatisches Routing', anAus(netz.ripConf(node).on));
        h += '</div>';
      }

      if (K.wlan) {
        const c = netz.wlanConf(node);
        const gaeste = node.nics.filter(k => k.funkPort && k.cable).length;
        h += '<div class="kk-g">'
          + z('WLAN', anAus(c.on, c.ssid ? esc(c.ssid) : '')
              + (c.on ? ' <span class="dim">· ' + gaeste + ' verbunden</span>' : ''))
          + '</div>';
      }

      if (netz.istHeim(node)) {
        const ds = node.dhcpServer;
        const fs = netz.natConf(node).frei || [];
        h += '<div class="kk-g">'
          + z('NAT', '<b class="kk-an">immer an</b>')
          + z('DHCP-Server', anAus(ds && ds.on, ds && ds.on && ds.von
              ? '<span class="mono">' + esc(ds.von) + ' – ' + esc(ds.bis || '') + '</span>' : ''))
          + z('Portfreigaben', fs.length ? '' : '<span class="dim">keine</span>')
          + fs.map(f => '<div class="kk-zeile mono">' + esc(String(f.proto || 'tcp').toUpperCase())
              + ' ' + esc(f.port || '?') + ' → ' + esc(f.lanIp || '?') + ':' + esc(f.lanPort || f.port || '?')
              + '</div>').join('')
          + '</div>';
      } else if (K.routes) {
        const rs = node.routes || [];
        h += '<div class="k-sec">Weiterleitungstabelle</div>';
        h += rs.length
          ? '<table class="tbl"><tr><th>Ziel</th><th>Netzmaske</th><th>Gateway</th></tr>'
            + rs.map(r => '<tr><td class="mono">' + esc(r.net || '') + '</td><td class="mono">'
              + esc(r.mask || '') + '</td><td class="mono">' + esc(r.gateway || '') + '</td></tr>').join('')
            + '</table>'
          : '<div class="k-hint dim">keine Zeile von Hand</div>';
      }

      h += '</div>';
      h += '<div class="k-tab" data-tabellen>' + tabellen(node) + '</div>';
      box.innerHTML = h;
    }

    return {
      bauen, kompakt, ipInnenHtml, malenTabellen,
      dhcpVorgabe: (node) => dhcpVorgabe(netz, node),
      /* Das Weiterleitungsfenster entsteht in app.js NACH dieser
         Instanz und meldet sich hier an. Ohne Anmeldung gibt es den
         Knopf „Zur Weiterleitungstabelle" nicht — ein Knopf, der ins
         Leere führt, ist schlechter als keiner. */
      setWeiterleitung(f) { fenster = f || null; },
      setLernInfo(an) { lernInfo = !!an; },
      get lernInfo() { return lernInfo; },
      setInternet(i) { inet = i || null; },
      /* Dieselbe Frage darf nur an EINER Stelle beantwortet werden:
         das Fenster zeichnet dieselben Zeilen wie das Kärtchen und
         muss dazu dieselbe Auskunft geben. Ständen die zwei Funktionen
         zweimal da, sagten sie beim ersten Sonderfall Verschiedenes. */
      wegStand, ueberKarte, wegeMalen
    };
  }

  Konfig.ipInnenHtml = ipInnenHtml;
  Konfig.SCHLOSS = SCHLOSS;
  window.Konfig = Konfig;
})();
