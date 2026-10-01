/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — mitschnitt.js   ·   Was auf der Leitung war
   ══════════════════════════════════════════════════════════════
   Der Paketmitschnitt. In Filius heißt das „Lauscher" und ist
   das didaktisch wertvollste Stück des ganzen Programms: man
   sieht, dass vor jedem Ping eine ARP-Anfrage steht, dass ein
   Switch den ersten Rahmen an alle schickt und den zweiten nicht
   mehr, und dass ein Router die TTL verringert.

   ── Wie das Original und wie nicht ────────────────────────────
   Filius zeigt eine Tabelle je NETZWERKKARTE: Rechtsklick auf ein
   Gerät → „Datenaustausch anzeigen (192.168.1.10)", ein Eintrag je
   Karte. Wer verstehen will, wie ein Rahmen durch drei Geräte
   läuft, muss drei Reiter öffnen und die Zeitstempel selbst
   zusammenlegen.

   Hier ist der Mitschnitt EINE Liste über das ganze Netz — und
   ein Gerät anzutippen schränkt sie auf dieses Gerät ein. Damit
   gibt es beides: den Weg quer durchs Netz und Filius' Blick auf
   eine Station.

   ⚠️ Der Gerätefilter war bis zum 2026-09-26 zwar HIER gebaut,
   aber nirgends verdrahtet — dieser Kopf behauptete drei Jahre
   lang etwas, das die Oberfläche nie getan hat. Wer einen Filter
   baut, muss ihn auch anschließen; ein Kommentar ist keine
   Funktion.

   ── Zwei Ansichten ────────────────────────────────────────────
   `zeilen`     eine Zeile je Rahmen, Schichten beim Aufklappen.
                Kompakt — man liest die Geschichte.
   `schichten`  Filius' Ansicht: eine Zeile je SCHICHT, alle mit
                derselben Nummer, farbig hinterlegt. Länger, aber
                hier sieht man, dass Quelle und Ziel auf jeder
                Schicht etwas anderes bedeuten — MAC, dann IP,
                dann Portnummer. Das ist der Grund, warum Filius
                diese Ansicht hat, und er ist gut.

   ── Zwei Richtungen ───────────────────────────────────────────
   Aufgezeichnet wird beides, „raus" und „rein" — so wie Filius es
   an jeder Karte tut (`Ethernet.java` beim Senden,
   `EthernetThread.java` beim Empfangen).

   GEZEIGT wird voreingestellt nur „raus", denn über das ganze
   Netz gesehen steht sonst jeder Rahmen zwei- bis viermal da
   (Absender, Switch rein, Switch raus, Empfänger) und die
   Geschichte verschwindet in ihren eigenen Wiederholungen. Sobald
   ein Gerät gewählt ist, kippt die Voreinstellung auf „beide" —
   dann ist die Frage nämlich eine andere: nicht „was ist
   passiert", sondern „was hat DIESES Gerät gesehen", und darauf
   ist die halbe Antwort keine.

   Verlorene Rahmen stehen als eigene Zeile da, weil
   „losgeschickt und nie angekommen" genau das ist, was eine
   Klasse sehen soll.

   ── Warum eine Obergrenze ─────────────────────────────────────
   Ein Netz, das eine Minute lang läuft, erzeugt zehntausende
   Einträge. Die Liste ist ein Ringpuffer: älteste fallen hinten
   heraus. Für den Unterricht reicht das bei weitem — interessant
   sind immer die letzten Sekunden.

   Die Grenze ist mit der zweiten Richtung von 4000 auf 12000
   gestiegen. Nicht aus Großzügigkeit: derselbe Verkehr erzeugt
   jetzt zwei- bis dreimal so viele Zeilen, und ohne die Anhebung
   wäre die sichtbare Vergangenheit um genau diesen Faktor kürzer
   geworden — ein Rückschritt, den niemand bestellt hat.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  const MAX = 12000;

  /* Die vier Schichten, wie Filius sie nennt (`rp_lauscher_msg8…11`).
     Das ist das TCP/IP-Modell mit vier Schichten, nicht OSI mit
     sieben — beide werden unterrichtet, und beide stehen hier:
     die Spalte „Schicht" nennt den Filius-Namen, die aufgeklappte
     Schale die OSI-Nummer. Wer „Netzzugang" liest und „Schicht 2"
     daneben, hat die Zuordnung der beiden Modelle vor sich, statt
     sie auswendig lernen zu müssen. */
  const NETZZUGANG = 'Netzzugang', VERMITTLUNG = 'Vermittlung',
        TRANSPORT  = 'Transport',  ANWENDUNG   = 'Anwendung';

  function Mitschnitt(engine, netz) {
    let rows = [];
    let seq = 0;
    let paused = false;
    const watchers = [];

    /* ─── Aufzeichnen ─────────────────────────────────────────
       Beide Richtungen, gefiltert wird erst beim Ansehen. Das ist
       die einzig richtige Reihenfolge: was nicht aufgezeichnet
       wurde, kann man später nicht mehr einblenden, und die Frage
       „was hat dieses Gerät empfangen" stellt sich immer erst,
       nachdem es passiert ist. */
    engine.on('event', (e) => {
      if (paused) return;
      if (e.kind === 'wire') add(e, false, e.dir === 'in' ? 'rein' : 'raus');
      else if (e.kind === 'drop') add(e, true, 'raus');
      /* Durch die Internet-Karte des cww geht kein Rahmen über ein
         Kabel — aber ein Paket, und das gehört in den Mitschnitt
         wie jedes andere. Statt der MAC-Adressen steht „Wolke" da:
         im 8er-Netz gibt es hier keine Leitung, die man zeigen
         könnte. */
      else if (e.kind === 'inet-raus' || e.kind === 'inet-rein') {
        add({ t: e.t, node: e.node, nic: netz.INET, inet: true,
              frame: { src: 'Wolke', dst: 'Wolke', type: 'ip', payload: e.pkt } },
            false, e.kind === 'inet-rein' ? 'rein' : 'raus');
      }
    });

    /* Der Fingerabdruck eines Rahmens. Einmal gerechnet und an der
       Zeile gemerkt — sonst stünde er bei jedem Rundruf eines
       Switch fünfmal im Weg. */
    function sig(row) {
      if (row.sig === undefined) {
        try { row.sig = JSON.stringify(row.frame); } catch (e) { row.sig = null; }
      }
      return row.sig;
    }

    function add(e, lost, dir) {
      const node = e.node ? netz.get(e.node) : null;
      const row = {
        n: ++seq,
        t: e.t,
        node: e.node,
        nodeName: node ? node.name : '?',
        nic: e.nic,
        dir: dir,
        lost: !!lost,
        mal: 1,
        frame: e.frame,
        proto: protoOf(e.frame),
        info: describe(e.frame),
        inet: !!e.inet,
        zugang: zugangVon(e.frame, e.node)
      };

      /* ─── Fluten zusammenfassen ───────────────────────────────
         Ein Switch schickt einen Rundruf an ALLE seine Anschlüsse.
         Bei fünf Anschlüssen stehen dann vier gleiche Zeilen
         untereinander, zur selben Mikrosekunde, vom selben Gerät.
         Das ist die Wahrheit — und es macht genau die Geschichte
         unlesbar, für die es den Mitschnitt gibt: bei DHCP verschwand
         die Folge Discover → Offer → Request → Ack unter einem
         Dutzend identischer Ack-Zeilen.

         Also: gleiche Zeit, gleiches Gerät, gleicher RAHMEN → eine
         Zeile mit „× 4". Weggelassen wird nichts, nur
         zusammengezogen — und dass ein Rundruf an alle geht, sagt
         das „× 4" deutlicher als vier Zeilen, die man erst
         vergleichen muss.

         ⚠️ Verglichen wird der Rahmen und NICHT sein Text, seit es
         TCP gibt. Das hat nur das Bild gezeigt: zwei
         verschiedene Bestätigungen — eine für die Daten, eine für
         das FIN — gehen in derselben Mikrosekunde hinaus und
         lesen sich beide als „57967 → 80 [ACK]". Über den Text
         verglichen wurden sie zu einer Zeile mit „× 2", und damit
         behauptete der Mitschnitt, derselbe Rahmen sei zweimal
         gegangen. Unterschiedlich sind sie in der
         Bestätigungsnummer, und die steht (mit Absicht) nur in
         der aufgeklappten Schale.

         Der Vergleich ist erst dann teuer, wenn Zeit, Gerät und
         Text schon übereinstimmen — also so gut wie nie. */
      /* ⚠️ Die Richtung gehört mit in den Vergleich, seit beide
         aufgezeichnet werden. Ein Switch EMPFÄNGT einen Rundruf
         und schickt ihn in derselben Mikrosekunde wieder hinaus —
         ohne diese Bedingung würden Ankunft und Abgang zu einer
         Zeile „× 2" verschmelzen, und damit behauptete der
         Mitschnitt, ein Switch habe zweimal gesendet. Er hat
         einmal empfangen und einmal gesendet, und genau das ist
         die Lehre. */
      const letzte = rows[rows.length - 1];
      if (letzte && !lost && !letzte.lost
          && letzte.t === row.t && letzte.node === row.node
          && letzte.dir === row.dir
          && letzte.info === row.info && letzte.proto === row.proto
          && sig(letzte) === sig(row)) {
        letzte.mal++;
        seq--;                     // die Nummer war noch nicht vergeben
        fire();
        return;
      }

      rows.push(row);
      if (rows.length > MAX) rows = rows.slice(-MAX);
      fire();
    }

    /* ─── Zugangsdaten finden ─────────────────────────────────
       Der Fund-Filter (PLAN-SICHERHEIT, Schritt 1). Erkannt wird am
       INHALT, nicht an der Schicht darüber: was als Zeile
       `PASS …` auf Port 110 läuft, ist ein Passwort im Klartext —
       gleich, wer mitliest. Heute gibt es nur POP3 (SMTP kennt hier
       kein AUTH, siehe mail.js); neue Verfahren (HTTP Basic,
       Formularfelder, Cookies) kommen HIER dazu, und Chip, Marke und
       Schale ziehen von selbst mit.

       Der Benutzer steht in einem ANDEREN Segment davor (`USER anna`
       und `PASS geheim` gehen einzeln hinaus). Er wird in den
       letzten Zeilen desselben Geräts und derselben Verbindung
       gesucht — Adressen und Ports gleich, nur die Zeile anders. */
    function tcpVon(f) {
      if (!f || f.type !== 'ip' || !f.payload || f.payload.proto !== 'tcp') return null;
      return { ip: f.payload, s: f.payload.payload || {} };
    }
    function zeileMit(data, wort) {
      for (const z of String(data || '').split('\r\n'))
        if (z.slice(0, wort.length + 1) === wort + ' ') return z.slice(wort.length + 1);
      return null;
    }
    /* HTTP: Formularfelder (`passwort=`, `iban=` …) und Cookies. Die
       Felder stehen im Körper einer POST-Anfrage, `Cookie:` in jeder
       weiteren Anfrage, `Set-Cookie:` in der Antwort auf die
       Anmeldung. Nur Anfragen und Antworten — Handschlag und
       Bestätigungen tragen keine Daten und fallen vorher heraus. */
    const FORM_GEHEIM = ['iban', 'bic', 'karte', 'kartennummer', 'pin'];
    function httpZugang(data) {
      const d = String(data);
      const post = /^POST\s/.test(d);
      if (!post && !/^GET\s/.test(d) && !/^HTTP\/[\d.]+\s/.test(d)) return null;
      const teile = d.split('\r\n\r\n');
      const f = {};
      if (post) String(teile[1] || '').split('&').forEach((p) => {
        const g = p.indexOf('=');
        if (g < 0) return;
        try {
          f[decodeURIComponent(p.slice(0, g).replace(/\+/g, ' ')).toLowerCase()] =
            decodeURIComponent(p.slice(g + 1).replace(/\+/g, ' '));
        } catch (e) { /* kaputte Kodierung: kein Fund */ }
      });
      const pw = f.passwort != null ? f.passwort : f.password != null ? f.password : f.pass != null ? f.pass : null;
      const felder = [];
      FORM_GEHEIM.forEach(k => { if (f[k]) felder.push([k, f[k]]); });
      const ck = /^Cookie:\s*(.+)$/im.exec(teile[0]);
      if (ck) felder.push(['Cookie', ck[1].trim()]);
      const sc = /^Set-Cookie:\s*(.+)$/im.exec(teile[0]);
      if (sc && /=\s*[^;\s]/.test(sc[1])) felder.push(['Set-Cookie', sc[1].trim()]);
      if (pw == null && !felder.length) return null;
      return { verfahren: (pw != null || post) ? 'HTTP-Formular' : 'HTTP-Cookie',
               benutzer: f.email || f.benutzer || f.user || f.name || null,
               passwort: pw, felder: felder };
    }

    function zugangVon(f, nodeId) {
      const t = tcpVon(f);
      if (t && t.s.data && (t.s.sport === 80 || t.s.dport === 80)) return httpZugang(t.s.data);
      if (!t || !t.s.data || !(t.s.sport === 110 || t.s.dport === 110)) return null;
      const pw = zeileMit(t.s.data, 'PASS');
      if (pw == null) return null;
      let user = zeileMit(t.s.data, 'USER');
      for (let i = rows.length - 1; user == null && i >= 0 && i > rows.length - 200; i--) {
        const r = rows[i];
        if (r.node !== nodeId) continue;
        const v = tcpVon(r.frame);
        if (v && v.ip.src === t.ip.src && v.ip.dst === t.ip.dst
            && v.s.sport === t.s.sport && v.s.dport === t.s.dport)
          user = zeileMit(v.s.data, 'USER');
      }
      return { verfahren: 'POP3 (Port 110)', benutzer: user, passwort: pw };
    }

    /* ─── Beschreiben ─────────────────────────────────────────
       Eine Zeile Klartext je Rahmen. Der Ton ist absichtlich der
       eines Menschen, nicht der eines Protokollanalysators:
       „Wer hat 192.168.1.5?" statt „ARP op=1 tpa=…". Wireshark
       darf kryptisch sein, ein Lernprogramm nicht. */
    function describe(f) {
      if (!f) return '';
      if (f.type === 'arp') {
        const a = f.payload;
        return a.op === 'request'
          ? 'Wer hat ' + a.targetIp + '? Sag es ' + a.senderIp + '.'
          : a.senderIp + ' ist bei ' + a.senderMac + '.';
      }
      if (f.type === 'ip') {
        const p = f.payload;
        const head = p.src + ' → ' + p.dst;
        if (p.proto === 'icmp') {
          const m = p.payload || {};
          if (m.type === 8)  return head + '   Ping-Anfrage (Nr. ' + m.seq + ')';
          if (m.type === 0)  return head + '   Ping-Antwort (Nr. ' + m.seq + ')';
          if (m.type === 3 && m.code === 3) return head + '   Port nicht erreichbar';
          if (m.type === 3)  return head + '   Ziel nicht erreichbar';
          if (m.type === 11) return head + '   Zeit abgelaufen (TTL)';
          return head + '   ICMP Typ ' + m.type;
        }
        if (p.proto === 'udp') return head + '   ' + udpText(p.payload || {});
        if (p.proto === 'tcp') return head + '   ' + tcpText(p.payload || {});
        return head + '   ' + String(p.proto || '?').toUpperCase();
      }
      return f.type || '?';
    }

    /* DHCP und DNS in Klartext. Das ist der Punkt, an dem sich der
       Mitschnitt für DHCP auszahlt: die vier Nachrichten stehen
       untereinander und erzählen die Geschichte von selbst —
       „hat jemand eine Adresse für mich", „nimm .101", „ich nehme
       .101", „gilt". Wer das liest, braucht keine Folie dazu. */
    function udpText(u) {
      const d = u.data || {};
      if (u.dport === 67 || u.sport === 67) {
        const wer = d.mac ? ' (' + d.mac + ')' : '';
        if (d.art === 'discover') return 'DHCP Discover — hat jemand eine Adresse für mich?' + wer;
        if (d.art === 'offer')    return 'DHCP Offer — nimm ' + d.ip;
        if (d.art === 'request')  return 'DHCP Request — ich nehme ' + d.ip
                                    + (d.server ? ' von ' + d.server : '');
        if (d.art === 'ack')      return 'DHCP Ack — ' + d.ip + ' gilt für dich';
        if (d.art === 'nak')      return 'DHCP Nak — ' + (d.grund || 'abgelehnt');
        return 'DHCP';
      }
      if (u.dport === 53 || u.sport === 53) {
        /* Zwei Arten von Frage, seit es E-Mail gibt. Die MX-Frage
           lautet nicht „welche Adresse", sondern „wer ist
           zuständig" — und genau so muss sie im Mitschnitt
           stehen, sonst sieht sie aus wie die andere. */
        if (d.typ === 'MX') {
          if (d.art === 'frage')   return 'DNS-Frage (MX) — wer nimmt die Post für ' + d.name + '?';
          if (d.art === 'antwort') return d.mx
            ? 'DNS-Antwort (MX) — der Mailserver von ' + d.name + ' ist ' + d.mx
            : 'DNS-Antwort (MX) — für ' + d.name + ' ist kein Mailserver eingetragen';
        }
        if (d.art === 'frage')   return 'DNS-Frage — welche Adresse hat ' + d.name + '?';
        if (d.art === 'antwort') return d.ip
          ? 'DNS-Antwort — ' + d.name + ' ist ' + d.ip
          : 'DNS-Antwort — ' + d.name + ' kenne ich nicht';
        return 'DNS';
      }
      /* ─ RIP ─
         Die Ansage steht als SATZ da und nicht als Liste von
         Zahlenpaaren: „ich kenne diese drei Netze, so weit weg
         sind sie". Mehr als drei Netze werden gezählt statt
         aufgeschrieben — bei sechs Routern wäre die Zeile sonst
         breiter als das Fenster, und die aufgeklappte Schale hat
         ohnehin alle.

         ⭐ Die Sprünge stehen in der Zeile, und das ist der Grund,
         warum dieser Mitschnitt RIP überhaupt zeigen kann: wer
         zwei Ansagen desselben Netzes nacheinander liest und die
         Zahl von 1 auf 2 springen sieht, hat das Verfahren
         verstanden. */
      if (u.dport === 520 || u.sport === 520) {
        const rs = Array.isArray(d.routen) ? d.routen : [];
        if (!rs.length) return 'RIP-Ansage — nichts zu melden';
        const nenn = (r) => r.net + ' (' + (r.hops >= 16 ? 'unerreichbar' : r.hops) + ')';
        const kopf = rs.slice(0, 3).map(nenn).join(', ');
        return 'RIP-Ansage — ich kenne ' + kopf
          + (rs.length > 3 ? ' und ' + (rs.length - 3) + ' weitere' : '');
      }
      return 'UDP  Port ' + u.sport + ' → ' + u.dport;
    }

    /* ─── Portnummern, die jemandem gehören ───────────────────
       Nur die, die in diesem Programm wirklich vorkommen. Eine
       lange Liste aus dem Netz abzuschreiben wäre wohlfeil und
       hülfe niemandem: hier steht, was ein Kind hier auch
       antreffen kann. Alles andere ist eine Nummer ohne Besitzer
       — und genau das soll man an einem flüchtigen Port über
       49151 auch sehen. */
    const PORT_NAMEN = { 20: 'FTP-Daten', 21: 'FTP', 25: 'SMTP', 53: 'DNS',
                         67: 'DHCP-Server', 68: 'DHCP-Client', 80: 'HTTP', 110: 'POP3',
                         443: 'HTTPS = HTTP mit TLS', 465: 'SMTPS = SMTP mit TLS',
                         995: 'POP3S = POP3 mit TLS', 8200: 'Zertifizierungsstelle',
                         520: 'RIP', 521: 'RIP-Absender' };
    const portWem = (p) => PORT_NAMEN[p] ? '  (' + PORT_NAMEN[p] + ')' : '';

    /* SYN, ACK, FIN, RST bleiben bei ihren englischen Namen. Sie
       stehen so auf jedem Schaubild und in jedem echten
       Mitschnitt; sie zu übersetzen hieße, ein Kind vom Werkzeug
       abzuschneiden, das es später benutzt. Die ZUSTÄNDE einer
       Verbindung heißen dagegen deutsch (`netstat`) — die liest
       man, die Flags liest man ab. */
    function flagText(fl) {
      if (!fl) return '';
      const a = [];
      if (fl.syn) a.push('SYN');
      if (fl.ack) a.push('ACK');
      if (fl.fin) a.push('FIN');
      if (fl.rst) a.push('RST');
      return a.join(', ');
    }

    /* Die Zeile im Mitschnitt: Ports, Flags, bei Daten die Länge —
       und die Bestätigungsnummer.

       ⚠️ Die letzte stand zuerst NICHT hier, und das Bild hat
       gezeigt, warum sie hin muss: beim Abbau schickt eine Seite
       zwei Bestätigungen kurz hintereinander (eine für die Daten,
       eine für das FIN). Ohne die Nummer stehen zwei Zeilen
       untereinander, die Zeichen für Zeichen gleich aussehen —
       und ein Kind, das den Mitschnitt liest, hält die zweite für
       einen Anzeigefehler. Mit ihr ist zu sehen, dass die zweite
       eine Nummer weiter ist, und genau das ist die Aussage.

       Nur bei gesetztem ACK, denn nur dann trägt das Feld eine
       Bedeutung. Beim ersten SYN steht dort nichts — es gibt noch
       nichts zu bestätigen. */
    /* ─── TLS und die Zertifizierungsstelle (PLAN-SICHERHEIT, 4) ──
       Ein TLS-Datensatz steht als eine Zeile JSON im Segment
       (`{"tls":"ClientHello", …}`, siehe tls.js). Erkannt wird er am
       Anfang des INHALTS, nicht am Port — 443, 465 und 995 sind
       nur Verabredungen. Für die Zeile reicht der Anfang; der
       ganze Satz wird erst beim Aufklappen gelesen, denn ein
       Datensatz mit einer ganzen Seite darin ist 100 KB lang. */
    const TLS_ANFANG = '{"tls":"';
    const tlsArt = (s) => {
      if (!s || typeof s.data !== 'string' || s.data.indexOf(TLS_ANFANG) !== 0) return null;
      const m = /^\{"tls":"(\w+)"/.exec(s.data);
      return m ? m[1] : null;
    };
    function tlsSatz(s) {
      if (!tlsArt(s)) return null;
      try { return JSON.parse(String(s.data).replace(/\n$/, '')); } catch (e) { return null; }
    }
    const ZS_PORT = 8200;
    const zsPort = (s) => !!(s && s.data && !tlsArt(s) && (s.sport === ZS_PORT || s.dport === ZS_PORT));
    const kurz = (t, n) => String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t);

    function tlsText(s) {
      const art = tlsArt(s);
      if (!art) return null;
      if (art === 'Daten') {
        const m = /"laenge":(\d+)/.exec(s.data);
        return 'TLS  🔒 verschlüsselt' + (m ? ', ' + m[1] + ' Byte' : '');
      }
      const o = tlsSatz(s) || {};
      if (art === 'ClientHello')
        return 'TLS  🔒 ClientHello — Servername: ' + (o.sni ? o.sni : '(keiner, Zahlenadresse)');
      if (art === 'ServerHello') {
        const z = o.zertifikat || {};
        return 'TLS  🔒 ServerHello — Zertifikat für ' + (z.name || '?') + ', ausgestellt von ' + (z.aussteller || '?');
      }
      if (art === 'Alert') return 'TLS  Alert: ' + (o.grund || '');
      return 'TLS  ' + art;
    }

    function tcpText(s) {
      const f = flagText(s.fl);
      const tl = tlsText(s);
      if (tl) return tl;
      if (zsPort(s)) return 'ZS  ' + kurz(String(s.data).split('\r\n')[0], 90);
      /* Trägt das Segment eine HTTP-Nachricht, steht DIE in der
         Zeile — „GET /logo.png" beantwortet die Frage, die man an
         den Mitschnitt hat, und „TCP 49152 → 80 [ACK] 42 Byte"
         beantwortet sie nicht. Die Portnummern stehen weiter in
         der aufgeklappten Schale. */
      const h = httpErsteZeile(s);
      if (h) return 'HTTP  ' + h;
      /* Bei SMTP und POP3 steht die ZEILE da, die über die
         Leitung geht — man liest das Gespräch mit, ohne dass es
         jemand übersetzt. Genau dafür sind die beiden im
         Unterricht gut (und deshalb steht `PASS geheim` hier
         auch im Klartext). */
      if (s.data && (s.sport === 25 || s.dport === 25))
        return 'SMTP  ' + String(s.data).split('\r\n')[0];
      if (s.data && (s.sport === 110 || s.dport === 110))
        return 'POP3  ' + String(s.data).split('\r\n')[0];
      return 'TCP  ' + s.sport + ' → ' + s.dport
        + (f ? '  [' + f + ']' : '')
        + (s.data ? '  ' + s.data.length + ' Byte' : '')
        + (s.fl && s.fl.ack ? '  bestätigt ' + s.ack : '');
    }

    /* Die erste Zeile einer HTTP-Nachricht — oder nichts, wenn in
       dem Segment keine steckt. Erkannt wird sie am Inhalt und
       nicht an der Portnummer: ein Webserver auf 8080 ist immer
       noch einer. */
    function httpErsteZeile(s) {
      if (!s || !s.data) return null;
      const erste = String(s.data).split('\r\n')[0] || '';
      if (/^(GET|POST|HEAD|PUT|DELETE)\s+\S+\s+HTTP\//.test(erste))
        return erste.replace(/\s+HTTP\/[\d.]+$/, '');
      if (/^HTTP\/[\d.]+\s+\d+/.test(erste)) {
        const typ = /Content-Type:\s*([^\r\n;]+)/i.exec(s.data);
        const koerper = String(s.data).split('\r\n\r\n')[1];
        return erste.replace(/^HTTP\/[\d.]+\s+/, '')
          + (typ ? '  ' + typ[1].trim() : '')
          + (koerper != null ? ', ' + koerper.length + ' Byte' : '');
      }
      return null;
    }

    /* Die Spalte im Mitschnitt nennt das Protokoll, das ein Kind
       sucht — DHCP, nicht UDP. Dass DHCP „in" UDP steckt, steht
       beim Aufklappen als eigene Schale da; in der Zeile wäre es
       nur eine Hürde zwischen Frage und Antwort. */
    function protoOf(f) {
      if (!f) return '';
      if (f.type === 'arp') return 'ARP';
      if (f.type === 'ip') {
        const p = f.payload;
        if (p && p.proto === 'udp') {
          const u = p.payload || {};
          if (u.dport === 67 || u.sport === 67) return 'DHCP';
          if (u.dport === 53 || u.sport === 53) return 'DNS';
          if (u.dport === 520 || u.sport === 520) return 'RIP';
          return 'UDP';
        }
        /* Dieselbe Regel wie bei UDP: in der Spalte steht das
           Protokoll, das ein Kind SUCHT — also HTTP, sobald eine
           HTTP-Nachricht darin steckt, und TCP bei allem anderen
           (Handschlag, Bestätigungen, Abbau). */
        if (p && p.proto === 'tcp') {
          const s = p.payload || {};
          if (tlsArt(s)) return 'TLS';
          if (zsPort(s)) return 'ZS';
          if (httpErsteZeile(s)) return 'HTTP';
          /* SMTP und POP3 stehen in der Spalte, weil das die
             Wörter sind, die ein Kind sucht. Erkannt am PORT und
             nicht am Inhalt: ein Zeilendialog sieht in beide
             Richtungen gleich aus, und ein „250 OK" allein sagt
             nicht, welches der beiden Gespräche das ist.

             ⚠️ Nur Segmente MIT Inhalt. Handschlag, Bestätigungen
             und Abbau bleiben TCP — so wie es auch ein echter
             Mitschnitt hält. Sonst zeigt der Chip „SMTP" zur
             Hälfte Segmente ohne ein einziges Wort SMTP darin,
             und das Gespräch, um das es geht, steht verdünnt
             dazwischen. */
          if (s.data && (s.sport === 25  || s.dport === 25))  return 'SMTP';
          if (s.data && (s.sport === 110 || s.dport === 110)) return 'POP3';
          return 'TCP';
        }
        return p && p.proto ? p.proto.toUpperCase() : 'IP';
      }
      return String(f.type).toUpperCase();
    }

    /* ─── Die Schichten eines Rahmens ─────────────────────────
       Das eigentliche Lernstück. Ein Rahmen ist eine Zwiebel, und
       hier wird sie geschält — von außen nach innen, so wie das
       Kabel sie sieht.

       EINE Funktion für ZWEI Ansichten, und das mit Absicht:

         `fields`   die aufgeklappte Schale (Ansicht „Zeilen")
         `schicht`, `proto`, `quelle`, `ziel`, `details`
                    eine Tabellenzeile (Ansicht „Schichten")

       Zwei getrennte Funktionen wären zwei Wahrheiten über
       denselben Rahmen, und sie würden auseinanderlaufen — beim
       ersten Protokoll, das jemand nur an einer der beiden Stellen
       nachträgt.

       ── Quelle und Ziel wechseln mit der Schicht ──────────────
       Das ist der ganze Grund, warum Filius diese Ansicht hat, und
       er ist der beste didaktische Einfall des Programms: in der
       Ethernet-Zeile stehen MAC-Adressen, in der IP-Zeile
       IP-Adressen, in der TCP-Zeile Portnummern. Dieselben zwei
       Spalten, dreimal etwas anderes — und genau daran begreift
       man, dass jede Schicht ihr eigenes Adressierungssystem hat
       und die darunterliegende gar nicht kennt.

       ⚠️ Die OSI-Nummer (`n`) und der Filius-Name (`schicht`)
       sind zwei MODELLE derselben Sache, nicht zwei Meinungen.
       Netzzugang = OSI 1+2, Vermittlung = 3, Transport = 4,
       Anwendung = 5–7. Beide stehen da, weil beide unterrichtet
       werden. */
    /* Die TLS-Schale: was im Klartext steht (Servername, Zertifikat),
       steht da; was nicht, sagt es. Aufgeklappt sieht man genau das,
       worum es geht: der Inhalt ist weg, der Rest nicht. */
    function tlsSchale(o, s, vonPort, nachPort) {
      const art = o.tls;
      let fields, details;
      if (art === 'ClientHello') {
        details = 'ClientHello — Servername: ' + (o.sni || '(keiner)');
        fields = [
          ['Art', 'ClientHello — „ich möchte verschlüsselt reden"'],
          ['Version', String(o.version || '—')],
          ['Servername', (o.sni || '— (Zahlenadresse)') + '   (steht im KLARTEXT)'],
          ['Zufallszahl', String(o.zufall || '—')],
          ['Schlüsselanteil A', String(o.dh || '—') + '   (g^a mod p — a bleibt geheim)']
        ];
      } else if (art === 'ServerHello') {
        const z = o.zertifikat || {};
        details = 'ServerHello — Zertifikat für ' + (z.name || '?');
        fields = [
          ['Art', 'ServerHello — Zertifikat und Beweis'],
          ['Zufallszahl', String(o.zufall || '—')],
          ['Schlüsselanteil B', String(o.dh || '—') + '   (g^b mod p)'],
          ['Zertifikat für', String(z.name || '—') + '   (Nr. ' + (z.nr == null ? '—' : z.nr) + ')'],
          ['Ausgestellt von', String(z.aussteller || '—')],
          ['Fingerabdruck der ZS', String(z.ausstellerFp || '—')],
          ['Schlüssel des Servers', kurz((z.besitzer && z.besitzer.n) || '—', 24)],
          ['Unterschrift der ZS', kurz(z.signatur || '—', 24)],
          ['Beweis des Servers', kurz(o.beweis || '—', 24) + '   (mit dem privaten Schlüssel)']
        ];
      } else if (art === 'Daten') {
        const ch = String(o.chiffre || '');
        details = '🔒 verschlüsselt, ' + (o.laenge == null ? '?' : o.laenge) + ' Byte';
        fields = [
          ['Art', 'Daten — verschlüsselt'],
          ['Länge', (o.laenge == null ? '?' : o.laenge) + ' Byte Klartext'],
          ['Inhalt', '🔒 nicht lesbar — nur die beiden Enden haben den Schlüssel'],
          ['Chiffre (Anfang)', ch ? kurz(ch, 28) : '—'],
          ['Prüfsumme', String(o.tag || '—')]
        ];
      } else {
        details = 'Alert: ' + (o.grund || '');
        fields = [['Art', 'Alert — Abbruch'], ['Grund', String(o.grund || '—')]];
      }
      return {
        n: 6, name: 'TLS', schicht: ANWENDUNG, proto: 'TLS',
        quelle: vonPort, ziel: nachPort, details: details, fields: fields
      };
    }

    function layers(row) {
      const out = [];
      const f = row && row.frame;
      if (!f) return out;

      const rundruf = U.isBroadcastMac(f.dst);
      out.push({
        n: 2, name: 'Ethernet', schicht: NETZZUGANG,
        /* Filius lässt die Protokollspalte hier LEER (`ETHERNET = ""`,
           `Lauscher.java:58`), weil die Schichtspalte daneben schon
           „Netzzugang" sagt. Eine leere Zelle sieht aber aus wie ein
           Fehler, und sie beantwortet die Frage nicht, die ein Kind
           an die Spalte hat („welches Protokoll ist das"). Also
           steht hier das Wort. */
        proto: 'Ethernet',
        quelle: f.src, ziel: f.dst,
        details: (f.type === 'arp' ? 'ARP-Paket' : 'IP-Paket')
               + (rundruf ? '  —  Rundruf an alle' : ''),
        fields: [
          ['Absender (MAC)', f.src],
          ['Empfänger (MAC)', rundruf ? f.dst + '  (an alle)' : f.dst],
          ['Inhalt', f.type === 'arp' ? 'ARP' : 'IP-Paket']
        ].concat(row.inet ? [['Ort', 'Ausgang ins Internet — alles, was dein Netz verlässt']] : [])
      });

      if (f.type === 'arp') {
        const a = f.payload;
        out.push({
          /* ⚠️ ARP sitzt zwischen den Stühlen: es steckt DIREKT im
             Ethernet-Rahmen (kein IP-Kopf davor, also Schicht 2),
             aber es arbeitet ausschließlich für die
             Vermittlungsschicht — es übersetzt deren Adressen in
             die von Schicht 2. Filius ordnet es der Vermittlung zu
             (`PROTOKOLL_SCHICHTEN[1]`, `Lauscher.java:393`), und
             wir folgen dem: wer beide Programme nebeneinander
             legt, soll ARP nicht in zwei verschiedenen Zeilen
             suchen müssen. */
          n: 3, name: 'ARP', schicht: VERMITTLUNG, proto: 'ARP',
          quelle: a.senderIp, ziel: a.targetIp,
          details: a.op === 'request'
            ? 'Suche nach der MAC-Adresse für ' + a.targetIp
            : 'Die MAC-Adresse ist ' + a.senderMac,
          fields: [
            ['Art', a.op === 'request' ? 'Anfrage' : 'Antwort'],
            ['Fragt / antwortet', a.senderIp + '  (' + a.senderMac + ')'],
            ['Gesucht', a.targetIp]
          ]
        });
        return out;
      }

      if (f.type === 'ip') {
        const p = f.payload;
        out.push({
          n: 3, name: 'IP', schicht: VERMITTLUNG, proto: 'IP',
          quelle: p.src, ziel: p.dst,
          details: 'Protokoll: ' + String(p.proto).toUpperCase() + ',  TTL: ' + p.ttl,
          fields: [
            ['Absender', p.src],
            ['Empfänger', p.dst],
            ['TTL', String(p.ttl) + '   (zählt bei jedem Router herunter)'],
            ['Protokoll', String(p.proto).toUpperCase()]
          ]
        });
        if (p.proto === 'icmp') {
          const m = p.payload || {};
          const art = { 8: 'Ping-Anfrage (Echo Request)', 0: 'Ping-Antwort (Echo Reply)',
                        3: 'Ziel nicht erreichbar', 11: 'Zeit abgelaufen' }[m.type] || ('Typ ' + m.type);
          const fields = [['Art', art]];
          if (m.seq != null) fields.push(['Nummer', String(m.seq)]);
          if (m.id != null)  fields.push(['Kennung', String(m.id)]);
          if (m.data != null) fields.push(['Nutzdaten', m.data + ' Byte']);
          out.push({
            /* ⚠️ Stand bis zum 2026-09-26 auf Schicht 4 — das war
               schlicht falsch. ICMP ist kein Transportprotokoll:
               es hat keine Ports, es baut keine Verbindung auf,
               und es meldet Fehler der VERMITTLUNG (TTL
               abgelaufen, Ziel nicht erreichbar). Filius ordnet es
               richtig ein (`PROTOKOLL_SCHICHTEN[1]`). */
            n: 3, name: 'ICMP', schicht: VERMITTLUNG, proto: 'ICMP',
            quelle: p.src, ziel: p.dst,
            details: art + (m.seq != null ? ',  Nr. ' + m.seq : ''),
            fields
          });
        }
        if (p.proto === 'tcp') {
          const s = p.payload || {};
          const fl = flagText(s.fl);
          out.push({
            n: 4, name: 'TCP', schicht: TRANSPORT, proto: 'TCP',
            quelle: String(s.sport), ziel: String(s.dport),
            /* Dieselben Angaben wie bei Filius („SYN, SEQ: 7711,
               ACK: 8939") und in derselben Reihenfolge — nur die
               Flags in Klammern, so wie sie in der kompakten
               Ansicht und in jedem echten Mitschnitt stehen. Die
               Sequenznummer MUSS hier stehen: ohne sie ist der
               Handschlag in dieser Ansicht nicht nachzurechnen,
               und das Nachrechnen ist der Zweck der Übung. */
            details: (fl ? '[' + fl + ']  ' : '')
                   + 'Seq: ' + s.seq
                   + (s.fl && s.fl.ack ? ',  bestätigt: ' + s.ack : '')
                   + (s.data ? ',  ' + s.data.length + ' Byte' : ''),
            fields: [
              ['Absenderport', String(s.sport)],
              ['Zielport', String(s.dport) + portWem(s.dport)],
              ['Flags', fl || '—'],
              ['Sequenznummer', String(s.seq)],
              /* Die Bestätigungsnummer ist die NÄCHSTE erwartete
                 Nummer, nicht die letzte empfangene. Das ist der
                 Punkt, an dem beim Nachrechnen immer eine 1
                 danebenliegt — deshalb steht es dabei. */
              ['Bestätigt bis', s.fl && s.fl.ack ? String(s.ack) + '  (als Nächstes erwartet)' : '—'],
              ['Nutzdaten', s.data ? s.data.length + ' Byte' : '0 Byte']
            ]
          });
          /* Und wenn Nutzdaten drin sind, die auch HTTP sind: die
             fünfte Schale. Sie ist der Grund, warum es die vierte
             gibt — hier sieht man, dass eine Seite aus Text
             besteht, den man lesen kann. */
          const erste = String(s.data || '').split('\r\n')[0] || '';
          const vonPort = p.src + ':' + s.sport, nachPort = p.dst + ':' + s.dport;
          const tlsS = tlsArt(s) ? (tlsSatz(s) || { tls: tlsArt(s) }) : null;
          if (tlsS) {
            out.push(tlsSchale(tlsS, s, vonPort, nachPort));
          } else if (/^(GET|POST|HEAD)\s+\S+\s+HTTP\//.test(erste)) {
            const teile = erste.split(/\s+/);
            const host = /Host:\s*([^\r\n]+)/i.exec(s.data);
            out.push({
              n: 7, name: 'HTTP', schicht: ANWENDUNG, proto: 'HTTP',
              quelle: vonPort, ziel: nachPort,
              details: erste.replace(/\s+HTTP\/[\d.]+$/, ''),
              fields: [
                ['Art', teile[0] + '   (hole diese Datei)'],
                ['Pfad', teile[1]],
                ['Host', host ? host[1].trim() : '—']
              ]
            });
          } else if (/^HTTP\/[\d.]+\s+\d+/.test(erste)) {
            const typ = /Content-Type:\s*([^\r\n;]+)/i.exec(s.data);
            const koerper = String(s.data).split('\r\n\r\n').slice(1).join('\r\n\r\n');
            out.push({
              n: 7, name: 'HTTP', schicht: ANWENDUNG, proto: 'HTTP',
              quelle: vonPort, ziel: nachPort,
              details: erste.replace(/^HTTP\/[\d.]+\s+/, '')
                     + (typ ? ',  ' + typ[1].trim() : '')
                     + ',  ' + koerper.length + ' Byte',
              fields: [
                ['Antwort', erste.replace(/^HTTP\/[\d.]+\s+/, '')],
                ['Inhaltstyp', typ ? typ[1].trim() : '—'],
                ['Länge', koerper.length + ' Byte'],
                /* Der Anfang des Inhalts. Mehr wäre im Mitschnitt
                   nicht zu lesen, und weniger beantwortet die
                   Frage nicht, ob wirklich die Seite ankommt. */
                ['Anfang', koerper.slice(0, 60).replace(/\s+/g, ' ') + (koerper.length > 60 ? ' …' : '')]
              ]
            });
          } else if (zsPort(s)) {
            /* Der Zeilendialog mit der Zertifizierungsstelle (zs.js):
               ANTRAG, +AUFGABE, BEREIT, +GEPRUEFT, ABHOLEN,
               +ZERTIFIKAT. Lesbar wie SMTP — man liest mit, wie ein
               Name geprüft wird. */
            const zeilen = String(s.data).split('\r\n').filter(z => z !== '');
            out.push({
              n: 7, name: 'ZS', schicht: ANWENDUNG, proto: 'ZS',
              quelle: vonPort, ziel: nachPort,
              details: kurz(zeilen[0], 80),
              fields: zeilen.slice(0, 4).map((z, i) => [i === 0 ? 'Gesagt' : '', kurz(z, 90)])
            });
          } else if (s.data && (s.sport === 25 || s.dport === 25 ||
                                s.sport === 110 || s.dport === 110)) {
            /* ⚠️ SMTP und POP3 hatten bisher gar keine Schale —
               aufgeklappt endete ein Mailsegment bei TCP, und der
               Text, um den es geht, stand nur in der kompakten
               Zeile. Das war die Lücke, die beim Bau der
               Schichtenansicht auffiel: die Anwendungsschicht
               fehlte ausgerechnet bei den zwei Protokollen, die
               man im Unterricht MITLIEST.

               Beide sind Zeilendialoge, also steht hier die Zeile
               — und zwar ganz, auch `PASS geheim`. Das ist der
               Grund, warum SMTP und POP3 im Unterricht etwas
               taugen. */
            const smtp = (s.sport === 25 || s.dport === 25);
            const zeilen = String(s.data).split('\r\n').filter(z => z !== '');
            out.push({
              n: 7, name: smtp ? 'SMTP' : 'POP3', schicht: ANWENDUNG,
              proto: smtp ? 'SMTP' : 'POP3',
              quelle: vonPort, ziel: nachPort,
              details: zeilen[0] + (zeilen.length > 1 ? '   (+ ' + (zeilen.length - 1) + ' weitere)' : ''),
              fields: zeilen.slice(0, 6).map((z, i) =>
                [i === 0 ? 'Gesagt' : '', z]).concat(
                zeilen.length > 6 ? [['', '… und ' + (zeilen.length - 6) + ' weitere Zeilen']] : [])
            });
          }
        }

        if (p.proto === 'udp') {
          /* ⚠️ Diese Schale war vom 2026-09-24 bis zum 2026-09-26
             WEG — mit der Begründung, zwei Portnummern zwischen IP
             und DHCP machten das Paket unübersichtlicher. Vom
             Nutzer zurückgeholt, und der Grund trägt schwerer:
             sobald es HTTP und E-Mail gibt, IST der Port der
             Unterrichtsgegenstand („welches Programm ist
             gemeint"). Stünde er dann bei TCP und nicht bei UDP,
             hätte dasselbe Wort in zwei Zeilen zwei verschiedene
             Sichtbarkeiten — und das ist teurer als eine Schale
             mehr. */
          const u = p.payload || {};
          const d = u.data || {};
          const wem = (pt) => (PORT_NAMEN[pt] || String(pt));
          out.push({
            n: 4, name: 'UDP', schicht: TRANSPORT, proto: 'UDP',
            quelle: String(u.sport), ziel: String(u.dport),
            /* Filius lässt diese Zelle leer. Hier stehen die
               Besitzer der beiden Portnummern — das ist genau die
               Übersetzung, die ein Kind an dieser Stelle im Kopf
               machen soll („67, das war der Server"), und sie
               kostet keine Spalte. */
            details: wem(u.sport) + ' → ' + wem(u.dport),
            fields: [
              ['Absenderport', String(u.sport) + portWem(u.sport)],
              ['Zielport', String(u.dport) + portWem(u.dport)]
            ]
          });
          const vonPort = p.src + ':' + u.sport, nachPort = p.dst + ':' + u.dport;
          if (u.dport === 67 || u.sport === 67) {
            const fields = [['Art', { discover: 'Discover — Suche nach einem Server',
                                      offer: 'Offer — Angebot des Servers',
                                      request: 'Request — Annahme des Angebots',
                                      ack: 'Ack — Bestätigung',
                                      nak: 'Nak — Ablehnung' }[d.art] || String(d.art)]];
            /* Die MAC-Adresse steht im DHCP-Paket NOCH EINMAL,
               obwohl der Ethernet-Rahmen sie schon trägt. Genau
               diese Doppelung ist die Antwort auf „warum sehen alle
               Rechner die Antwort, und nur einer nimmt sie": die
               Antwort geht als Rundruf hinaus, gemeint ist die MAC
               hier drin. */
            if (d.mac) fields.push(['gilt für (MAC)', d.mac]);
            if (d.ip) fields.push(['Adresse', d.ip]);
            if (d.mask) fields.push(['Netzmaske', d.mask]);
            if (d.gateway) fields.push(['Gateway', d.gateway]);
            if (d.dns) fields.push(['DNS-Server', d.dns]);
            if (d.lease) fields.push(['Leihfrist', d.lease + ' s']);
            if (d.grund) fields.push(['Grund', d.grund]);
            /* ⚠️ Stand bis zum 2026-09-26 auf Schicht 4, direkt
               neben UDP. DHCP ist ein ANWENDUNGSPROTOKOLL — es
               benutzt UDP, so wie HTTP TCP benutzt, und HTTP stand
               (richtig) längst auf 7. Derselbe Fehler bei DNS. */
            out.push({
              n: 7, name: 'DHCP', schicht: ANWENDUNG, proto: 'DHCP',
              quelle: vonPort, ziel: nachPort,
              details: udpText(u), fields
            });
          } else if (u.dport === 53 || u.sport === 53) {
            const fields = [['Art', d.art === 'frage' ? 'Frage' : 'Antwort'],
                            ['Name', String(d.name || '')]];
            if (d.typ) fields.push(['Typ', String(d.typ)]);
            if (d.art === 'antwort' && d.typ === 'MX') fields.push(['Mailserver', d.mx || '— kein Eintrag —']);
            else if (d.art === 'antwort') fields.push(['Adresse', d.ip || '— kein Eintrag —']);
            out.push({
              n: 7, name: 'DNS', schicht: ANWENDUNG, proto: 'DNS',
              quelle: vonPort, ziel: nachPort,
              details: udpText(u), fields
            });
          } else if (u.dport === 520 || u.sport === 520) {
            /* ⚠️ Schicht 7, nicht 4 — genau wie DHCP und DNS. RIP
               BENUTZT UDP, es ist keins. Derselbe Fehler war bei
               den beiden anderen schon einmal drin (siehe
               UEBERGABE.md, Abschnitt zum Mitschnitt).

               Dass ein Protokoll, dessen ganzer Inhalt Wege und
               Masken sind, auf der ANWENDUNGSschicht liegt, ist
               dabei die überraschendste Aussage dieser Schale —
               und eine richtige: es redet über die Vermittlung,
               aber es redet nicht in ihr. */
            const rs = Array.isArray(d.routen) ? d.routen : [];
            const fields = [['Art', 'Ansage an alle Nachbarn'],
                            ['Absender', String(d.von || p.src)],
                            ['Netze darin', String(rs.length)]];
            /* Jedes Netz mit seiner Entfernung, und zwar ALLE —
               die Schale ist der Ort, an dem nichts gezählt statt
               aufgeschrieben wird. Bei mehr als acht wird es
               unübersichtlich, aber dann ist auch das Netz groß,
               und die Zahl darüber sagt, wie viele fehlen. */
            rs.slice(0, 8).forEach((r, i) => fields.push([
              i === 0 ? 'Netz' : '',
              r.net + ' / ' + r.mask + '  —  '
                + (r.hops >= 16 ? 'unerreichbar' : r.hops + (r.hops === 1 ? ' Sprung' : ' Sprünge'))
            ]));
            if (rs.length > 8) fields.push(['', '… und ' + (rs.length - 8) + ' weitere']);
            out.push({
              n: 7, name: 'RIP', schicht: ANWENDUNG, proto: 'RIP',
              quelle: vonPort, ziel: nachPort,
              details: udpText(u), fields
            });
          }
        }
      }
      return out;
    }

    /* ─── Filter ──────────────────────────────────────────────
       `dir` ist der einzige Filter mit einer VORGESCHICHTE: er
       steht auf 'raus', solange die Liste das ganze Netz zeigt,
       und springt auf 'beide', sobald ein Gerät gewählt wird
       (siehe `setGeraet`). Begründung im Dateikopf. */
    let filter = { node: null, proto: null, text: '', dir: 'raus' };

    /* Welche Ansicht: 'zeilen' (eine Zeile je Rahmen) oder
       'schichten' (Filius — eine Zeile je Schicht). Der Modus
       gehört hierher und nicht in die Oberfläche, weil `toText`
       ihn auch braucht: was kopiert wird, muss dem entsprechen,
       was auf dem Bildschirm steht. Sonst nimmt eine Klasse etwas
       anderes mit nach Hause, als sie besprochen hat. */
    let modus = 'zeilen';

    /* Alles außer der Richtung. Steht getrennt, weil zwei Stellen
       es brauchen: `view` (mit Richtung) und `versteckt` (die
       Richtung ist ja genau die Frage). Zweimal dieselbe
       Filterkette hinzuschreiben wäre die Garantie, dass die
       Zahl am Richtungsknopf irgendwann etwas anderes zählt als
       die Liste zeigt. */
    function gefiltert() {
      const f = filter;
      let r = rows;
      if (f.node)  r = r.filter(x => x.node === f.node);
      /* „ZUGANG" ist kein Protokoll, sondern ein Fund — der Chip
         läuft durch denselben Schalter, damit es nur EINEN Filter
         für die Protokollleiste gibt. */
      if (f.proto === 'ZUGANG') r = r.filter(x => x.zugang);
      else if (f.proto) r = r.filter(x => x.proto === f.proto);
      if (f.text) {
        const q = f.text.toLowerCase();
        r = r.filter(x => (x.info + ' ' + x.nodeName).toLowerCase().includes(q));
      }
      return r;
    }

    function view() {
      const r = gefiltert();
      return filter.dir === 'beide' ? r : r.filter(x => x.dir === 'raus');
    }

    function setFilter(patch) { Object.assign(filter, patch); fire(); }

    /* ─── Ein Gerät wählen ────────────────────────────────────
       Die eine Stelle, an der die Oberfläche den Gerätefilter
       setzt — und sie nimmt die Richtung gleich mit. Das ist die
       einzige Automatik im Mitschnitt, und sie hat einen Grund:
       „was hat dieses Gerät gesehen" ist eine andere Frage als
       „was ist im Netz passiert", und sie ist mit nur der Hälfte
       der Rahmen nicht zu beantworten.

       Sichtbar bleibt sie trotzdem: der Richtungsknopf in der
       Leiste zeigt danach „beide", und man kann ihn von Hand
       wieder umstellen. Eine Automatik, die man nicht sieht und
       nicht überstimmen kann, wäre eine Zumutung — eine, die
       beides zulässt, ist eine Abkürzung. */
    function setGeraet(id) {
      filter.node = id || null;
      filter.dir  = id ? 'beide' : 'raus';
      fire();
    }

    function setModus(m) { modus = (m === 'schichten') ? 'schichten' : 'zeilen'; fire(); }

    const clear = () => { rows = []; seq = 0; fire(); };
    const setPaused = (v) => { paused = !!v; fire(); };

    const pfeil = (r) => r.dir === 'rein' ? '↓' : '↑';

    /* Für eine Klasse, die das Ergebnis mitnehmen will — und der
       Anfang eines späteren pcap-Exports, mit dem Schüler ihr
       eigenes Netz in Wireshark öffnen könnten.

       Kopiert wird, was zu sehen ist: in der Schichtenansicht also
       auch die Schichtenzeilen, mit derselben Nummer davor wie auf
       dem Bildschirm. */
    function toText() {
      const rs = view();
      if (modus === 'schichten') {
        const kopf = ['  Nr.', '      Zeit', '', 'Gerät       ',
                      'Quelle             ', 'Ziel               ',
                      'Protokoll', 'Schicht     ', 'Bemerkungen'].join('  ');
        const zeilen = [kopf, '─'.repeat(kopf.length)];
        for (const r of rs) {
          for (const l of layers(r)) {
            zeilen.push([
              String(r.n).padStart(5), U.fmtTime(r.t).padStart(10), pfeil(r),
              r.nodeName.slice(0, 12).padEnd(12),
              String(l.quelle).padEnd(19), String(l.ziel).padEnd(19),
              l.proto.padEnd(9), l.schicht.padEnd(12),
              l.details + (r.lost ? '   [verloren]' : '')
            ].join('  '));
          }
        }
        return zeilen.join('\n');
      }
      return rs.map(r =>
        [String(r.n).padStart(5), U.fmtTime(r.t).padStart(10), pfeil(r),
         r.nodeName.padEnd(12), r.proto.padEnd(5),
         r.lost ? '[verloren] ' : '', r.info,
         r.mal > 1 ? '   (an ' + r.mal + ' Anschlüsse)' : ''].join('  ')
      ).join('\n');
    }

    function fire() { for (const w of watchers.slice()) { try { w(); } catch (e) {} } }
    const onChange = (fn) => { watchers.push(fn); return () => {
      const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); }; };

    return {
      view, layers, setFilter, setGeraet, setModus, clear, toText, onChange, setPaused,
      get filter() { return filter; },
      get modus()  { return modus; },
      get paused() { return paused; },
      get total()  { return rows.length; },
      /* Wie viele Zeilen die Voreinstellung verschweigt — bei
         SONST gleichem Filter. Die Leiste schreibt es an den
         Richtungsknopf, sonst ist nicht zu sehen, dass da noch
         etwas ist. Ein Knopf, der etwas verbirgt, muss sagen wie
         viel; „↑ nur gesendet" allein liest sich wie eine
         Feststellung und nicht wie ein Filter. */
      get versteckt() {
        if (filter.dir === 'beide') return 0;
        return gefiltert().filter(r => r.dir === 'rein').length;
      }
    };
  }

  window.Mitschnitt = Mitschnitt;
})();
