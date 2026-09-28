/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — terminal.js   ·   Die Kommandozeile
   ══════════════════════════════════════════════════════════════
   Wenige Befehle, dafür mit erklärenden Antworten. Eine
   Kommandozeile im Unterricht hat einen anderen Auftrag als eine
   echte: sie soll nicht knapp sein, sondern verständlich.

   Deshalb sagt dieses Programm bei einem fehlgeschlagenen Ping
   nicht „Request timed out", sondern warum — kein Gateway, ARP
   ohne Antwort, Adresse in einem anderen Netz. Das ist der
   Unterschied zwischen einem Werkzeug und einem Lernmittel.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* Takt zwischen zwei Ping-Anfragen, in simulierter Zeit. Er ist
     da, damit man die vier Anfragen EINZELN sieht und merkt, dass
     die erste länger dauert als die anderen (ARP!).

     Stand einmal auf einer ganzen Sekunde — wie beim echten ping.
     Bei Tempo 0,1 (der neuen Vorgabe) wären das zehn echte
     Sekunden Pause zwischen zwei Zeilen und vierzig Sekunden für
     einen Ping, der gelingt. 0,2 s sind bei diesem Tempo zwei echte
     Sekunden: getrennt genug, um sie zu zählen, kurz genug, um
     dabei zu bleiben. */
  const PING_TAKT = 200 * U.MS;

  /* `opts.onDirty` meldet, dass sich am Stand etwas geändert hat
     — seit es Dateibefehle gibt, kann das Terminal das nämlich.
     Vorher war es ein reines Auskunftsprogramm (ping, arp, route)
     und brauchte den Rückweg nicht. */
  function Terminal(engine, netz, stack, dienste, opts) {
    opts = opts || {};

    /* Jedes Gerät hat seine eigene Sitzung: Ausgabe, Verlauf und
       ein Merker, ob gerade ein Ping läuft. */
    const sessions = new Map();

    function session(nodeId) {
      let s = sessions.get(nodeId);
      if (!s) {
        s = { lines: [], history: [], hpos: -1, busy: false, watchers: [] };
        sessions.set(nodeId, s);
        const node = netz.get(nodeId);
        write(nodeId, 'Netzwerk-Terminal auf ' + (node ? node.name : '?'), 'sys');
        write(nodeId, 'Tippe  hilfe  für die Liste der Befehle.', 'dim');
      }
      return s;
    }

    function write(nodeId, text, cls) {
      const s = sessions.get(nodeId) || session(nodeId);
      s.lines.push({ text: String(text), cls: cls || '' });
      if (s.lines.length > 400) s.lines = s.lines.slice(-400);
      for (const w of s.watchers.slice()) { try { w(); } catch (e) {} }
    }

    /* ─── Befehle ─────────────────────────────────────────────*/
    const CMDS = {};

    CMDS.hilfe = {
      help: 'zeigt diese Liste',
      run(node) {
        write(node.id, '', '');
        for (const k of Object.keys(CMDS))
          write(node.id, '  ' + k.padEnd(12) + CMDS[k].help, 'dim');
        write(node.id, '', '');
      }
    };
    CMDS.help = { help: 'dasselbe wie hilfe', run: (n) => CMDS.hilfe.run(n) };

    CMDS.ipconfig = {
      help: 'zeigt die eigenen Adressen',
      run(node) {
        write(node.id, '', '');
        /* ⚠️ Aufgezählt werden ANSCHLÜSSE, nicht Löcher. Beim
           Heimrouter sind die vier LAN-Buchsen eine einzige
           Netzwerkkarte mit einer Adresse; sie einzeln
           hinzuschreiben ergäbe drei Blöcke „— keine —" unter
           einem mit Adresse, und ein Kind läse daraus, dass an
           diesem Gerät drei Karten kaputt sind. Funkbuchsen
           stehen aus demselben Grund nicht da: sie gehören zu
           einer Verbindung und nicht zum Gerät. */
        const anschluesse = node.nics.filter(k =>
          !k.funkPort && (!netz.istLan(node, k.i) || k.i === netz.LAN));

        anschluesse.forEach((nic) => {
          const i = nic.i;
          const buchsen = netz.bruecke(node, i).filter(j => !node.nics[j].funkPort);
          write(node.id, netz.portLabel(node, i)
            + (buchsen.length > 1 ? '   (' + buchsen.length + ' Buchsen)' : '')
            + (nic.up ? '' : '   (ausgeschaltet)'), 'head');
          write(node.id, '   Herkunft . . . . : '
            + (nic.dhcp ? 'automatisch (DHCP)' : 'von Hand eingetragen'), 'dim');
          write(node.id, '   IP-Adresse . . . : ' + (nic.ip || '— keine —'), nic.ip ? '' : 'warn');
          write(node.id, '   Netzmaske  . . . : ' + (nic.mask || '—'));
          write(node.id, '   MAC-Adresse  . . : ' + nic.mac, 'dim');
          if (nic.dhcp && dienste) {
            const l = dienste.leaseOf(node, i);
            if (l) write(node.id, '   geliehen von . . : ' + l.server
              + '   (noch ' + U.fmtTime(l.rest) + ')', 'dim');
          }
        });
        write(node.id, 'Standardgateway  . . : ' + (node.gateway || '— keines —'),
              node.gateway ? '' : 'dim');
        write(node.id, 'DNS-Server . . . . . : ' + (node.dns || '— keiner —'),
              node.dns ? '' : 'dim');
        write(node.id, '', '');
      }
    };

    CMDS.ping = {
      help: 'ping <adresse|name>  — schickt vier Anfragen',
      run(node, args) {
        const ziel = args[0];
        if (!ziel) { write(node.id, 'Wohin? Beispiel:  ping 192.168.1.2', 'warn'); return; }

        const s = session(node.id);
        if (s.busy) { write(node.id, 'Es läuft schon ein Ping.', 'warn'); return; }

        // Kein eigenes Netz, kein Ping. Das früh und deutlich zu
        // sagen erspart vier Zeitüberschreitungen und die falsche
        // Vermutung, das Ziel sei schuld.
        const hasIp = node.nics.some(k => k.ip);
        if (!hasIp) {
          write(node.id, node.nics.some(k => k.dhcp)
            ? 'Dieses Gerät hat noch keine Adresse — es wartet auf den DHCP-Server.'
            : 'Dieses Gerät hat noch keine IP-Adresse. Trag sie im Kärtchen ein.', 'warn');
          return;
        }

        /* Ein Name? Dann erst fragen, dann pingen — und beides
           sichtbar. Genau dafür ist DNS da, und genau das soll man
           lesen können: „Ich frage 192.168.2.20 nach
           www.schule.de" steht als eigene Zeile da, bevor der
           erste Ping losgeht.

           Ein echtes ping macht das still. Hier nicht: der Schritt
           IST der Unterrichtsgegenstand. */
        if (!U.isIp(ziel)) {
          if (!dienste) { write(node.id, 'Namen kann dieses Netz nicht auflösen.', 'warn'); return; }
          write(node.id, '', '');
          write(node.id, 'Erst der Name: frage ' + (node.dns || '—') + ' nach ' + ziel + ' …', 'head');
          s.busy = true;
          dienste.resolve(node, ziel, (r) => {
            s.busy = false;
            if (!r.ok) {
              write(node.id, '   ⚠ ' + r.why, 'fail');
              if (!node.dns)
                write(node.id, 'Tipp: Ein DNS-Server muss im Kärtchen des Geräts eingetragen sein.', 'hint');
              return;
            }
            write(node.id, '   ' + ziel + ' ist ' + r.ip
              + (r.cached ? '   (schon bekannt, keine Frage nötig)' : ''), 'ok');
            los(node, r.ip, ziel);
          });
          return;
        }

        los(node, ziel, null);
      }
    };

    /* ═══ traceroute ═══════════════════════════════════════════
       Filius hat den Befehl (`sw_terminal_traceroute`, in der
       Hilfe „analysiere Stationen des Übertragungsweges"), und er
       ist der Grund, warum TTL mehr ist als eine Notbremse gegen
       Schleifen: mit TTL 1 kommt das Paket bis zum ersten Router
       und keinen Schritt weiter. Der meldet „Zeit abgelaufen" —
       und nennt sich dabei selbst. Mit TTL 2 die zweite Station,
       und so fort, bis das Ziel antwortet.

       ⚠️ Eine Station nach der anderen, nicht alle auf einmal.
       Echte Werkzeuge schicken drei Pakete je Stufe gleichzeitig;
       hier soll man zusehen können, wie das Paket jedes Mal ein
       Stück weiter kommt. Das IST die Erklärung.

       Die Obergrenze ist 15 und nicht 30 wie im echten Leben: ein
       Netz, das im Unterricht auf einen Tisch passt, hat keine
       fünfzehn Stationen, und wer eine Schleife gebaut hat, soll
       nicht dreißig Zeilen lang zusehen. */
    const TRACE_MAX = 15;

    CMDS.traceroute = {
      help: 'traceroute <adresse|name>  — die Stationen auf dem Weg',
      run(node, args) {
        const ziel = args[0];
        if (!ziel) {
          write(node.id, 'Wohin? Beispiel:  traceroute 192.168.2.20', 'warn');
          return;
        }
        const s = session(node.id);
        if (s.busy) { write(node.id, 'Es läuft schon etwas.', 'warn'); return; }
        if (!node.nics.some(k => k.ip)) {
          write(node.id, 'Dieses Gerät hat noch keine IP-Adresse.', 'warn');
          return;
        }
        // Namen wie beim Ping: erst fragen, dann laufen.
        if (!U.isIp(ziel)) {
          if (!dienste) { write(node.id, 'Namen kann dieses Netz nicht auflösen.', 'warn'); return; }
          write(node.id, '', '');
          write(node.id, 'Erst der Name: frage ' + (node.dns || '—') + ' nach ' + ziel + ' …', 'head');
          s.busy = true;
          dienste.resolve(node, ziel, (r) => {
            s.busy = false;
            if (!r.ok) { write(node.id, '   ⚠ ' + r.why, 'fail'); return; }
            write(node.id, '   ' + ziel + ' ist ' + r.ip, 'ok');
            spur(node, r.ip, ziel);
          });
          return;
        }
        spur(node, ziel, null);
      }
    };
    CMDS.tracert = {
      help: 'dasselbe wie traceroute',
      run: (n, a) => CMDS.traceroute.run(n, a)
    };

    function spur(node, target, name) {
      const s = session(node.id);
      s.busy = true;
      write(node.id, '', '');
      write(node.id, 'Weg zu ' + (name ? name + ' [' + target + ']' : target)
        + ' — höchstens ' + TRACE_MAX + ' Stationen', 'head');

      let ttl = 1;
      let seq = 1;

      const fertig = (satz, cls) => {
        s.busy = false;
        write(node.id, '', '');
        if (satz) write(node.id, satz, cls || 'ok');
        write(node.id, '', '');
      };

      const stufe = () => {
        if (ttl > TRACE_MAX) {
          fertig('Nach ' + TRACE_MAX + ' Stationen immer noch nicht da. Läuft das '
            + 'Paket im Kreis?', 'warn');
          return;
        }
        const meine = ttl;
        stack.ping(node, target, seq++, stack.PING_FRIST, (r) => {
          /* Drei Ausgänge, und sie sind der ganze Befehl:
               ok           → das ZIEL hat geantwortet, fertig
               icmp 11      → eine Station unterwegs, weiter
               sonst        → hier hört der Weg auf            */
          if (r.ok) {
            write(node.id, '  ' + String(meine).padStart(2) + '  ' + r.from
              + '   ' + U.fmtTime(r.rtt) + '   ← Ziel', 'ok');
            fertig('Angekommen nach ' + meine
              + (meine === 1 ? ' Station.' : ' Stationen.'), 'ok');
            return;
          }
          if (r.icmp === 11 && r.from) {
            write(node.id, '  ' + String(meine).padStart(2) + '  ' + r.from
              + (r.rtt != null ? '   ' + U.fmtTime(r.rtt) : ''), 'dim');
            ttl++;
            engine.at(PING_TAKT, stufe, 'trace-takt', node.id);
            return;
          }
          /* ⚠️ Hier stand die Adresse des Absenders VOR dem Text —
             und der Text nennt sie schon („Meldung von …"). Im
             Bild las sich die Zeile dann als zwei Stationen:
             „2  192.168.1.1   Ziel nicht erreichbar (Meldung von
             192.168.1.1)". Eine Adresse, zweimal, in einer Spalte,
             in der jede Zeile für eine Station steht. */
          write(node.id, '  ' + String(meine).padStart(2) + '  '
            + (r.error || 'keine Antwort'), 'fail');
          fertig('Weiter kommt das Paket nicht.', 'fail');
        }, meine);
      };

      stufe();
    }

    /* Der eigentliche Ping. Herausgezogen, weil er zweimal
       angestoßen wird: gleich (bei einer Adresse) oder nach der
       Namensauflösung. */
    function los(node, target, name) {
        const s = session(node.id);
        s.busy = true;
        write(node.id, '', '');
        write(node.id, 'Ping an ' + (name ? name + ' [' + target + ']' : target) + ' …', 'head');

        let seq = 1, ok = 0, sum = 0;
        const N = 4;

        const next = () => {
          if (seq > N) { finish(); return; }
          const mySeq = seq++;
          stack.ping(node, target, mySeq, stack.PING_FRIST, (r) => {
            if (r.ok) {
              ok++; sum += r.rtt;
              write(node.id, '   Antwort von ' + r.from + ': Nr. ' + r.seq
                + ', Zeit ' + U.fmtTime(r.rtt) + ', TTL ' + r.ttl, 'ok');
            } else {
              write(node.id, '   ' + (r.error || 'Keine Antwort.'), 'fail');
            }
            /* Ein Takt Pause zwischen den Anfragen — aber nur nach
               einer Antwort. Nach einem Fehlschlag sofort weiter:
               die Pause ist dazu da, zwei Antworten auseinander zu
               halten, und vier Fehlschläge hintereinander sagen
               nicht mehr als einer. Wer auf eine falsche Adresse
               pingt, hat schon gewartet. */
            engine.at(r.ok ? PING_TAKT : 0, next, 'ping-takt', node.id);
          });
        };

        const finish = () => {
          s.busy = false;
          write(node.id, '', '');
          write(node.id, 'Ergebnis: ' + ok + ' von ' + N + ' angekommen'
            + (ok ? ', im Schnitt ' + U.fmtTime(Math.round(sum / ok)) : ''),
            ok === N ? 'ok' : ok ? 'warn' : 'fail');
          if (!ok) hint(node, target);
          write(node.id, '', '');
        };

        next();
    }

    /* Wenn gar nichts ankommt: die drei häufigsten Ursachen
       durchgehen und die wahrscheinlichste nennen. Das ist der
       Teil, den Filius nicht hat — dort steht viermal „Zeit
       überschritten" und der Rest ist Raten. */
    function hint(node, target) {
      const dst = U.ip2int(target);
      const nic = node.nics.find(k => k.ip);
      if (!nic) return;
      const mask = U.ip2int(nic.mask);
      const mine = U.ip2int(nic.ip);

      const ziel = netz.findByIp(target);

      if (!ziel) {
        write(node.id, 'Tipp: Im ganzen Netz hat kein Gerät die Adresse ' + target + '.', 'hint');
        return;
      }
      if (U.netOf(dst, mask) !== U.netOf(mine, mask)) {
        if (!node.gateway) {
          write(node.id, 'Tipp: ' + target + ' liegt in einem anderen Netz — dafür braucht '
            + node.name + ' ein Standardgateway.', 'hint');
        } else {
          write(node.id, 'Tipp: Der Weg führt über das Gateway ' + node.gateway
            + '. Prüfe, ob der Router dorthin zurückfindet.', 'hint');
        }
        return;
      }
      write(node.id, 'Tipp: ' + target + ' liegt im selben Netz. Prüfe die Kabel und ob '
        + ziel.node.name + ' eingeschaltet ist.', 'hint');
    }

    /* ─── nslookup ────────────────────────────────────────────
       Fragt den DNS-Server und sagt, was zurückkam. Der Befehl
       heißt wie im echten Leben, damit ein Kind ihn später
       wiedererkennt — aber er antwortet in Sätzen.

       Warum er neben `ping <name>` überhaupt nötig ist: damit sich
       die zwei Schritte TRENNEN lassen. Kommt ein Ping nicht durch,
       ist die erste Frage „ist der Name falsch oder der Weg?", und
       nslookup beantwortet genau die Hälfte davon. */
    CMDS.nslookup = {
      help: 'nslookup <name>  — fragt den DNS-Server',
      run(node, args) {
        const name = args[0];
        if (!name) { write(node.id, 'Welchen Namen? Beispiel:  nslookup www.schule.de', 'warn'); return; }
        if (!dienste) { write(node.id, 'Namen kann dieses Netz nicht auflösen.', 'warn'); return; }
        write(node.id, '', '');
        write(node.id, 'Server: ' + (node.dns || '— keiner eingetragen —'), 'head');
        dienste.resolve(node, name, (r) => {
          if (r.ok) {
            write(node.id, '   ' + r.name + '   →   ' + r.ip, 'ok');
            if (r.cached) write(node.id, '   (aus dem Zwischenspeicher — es ging kein Paket hinaus)', 'dim');
          } else {
            write(node.id, '   ' + r.why, 'fail');
          }
          write(node.id, '', '');
        });
      }
    };
    CMDS.dns = { help: 'dasselbe wie nslookup', run: (n, a) => CMDS.nslookup.run(n, a) };

    /* ─── dhcp ────────────────────────────────────────────────
       `dhcp` zeigt, woher die Adresse kommt; `dhcp neu` holt sie
       noch einmal. Der zweite ist der wichtigere: er macht aus
       DHCP etwas, das man beobachten kann, statt etwas, das beim
       Start einmal passiert ist. */
    CMDS.dhcp = {
      help: 'dhcp [neu]  — Herkunft der Adresse, oder neu holen',
      run(node, args) {
        if (!dienste) { write(node.id, 'DHCP gibt es hier nicht.', 'warn'); return; }
        write(node.id, '', '');
        const welche = node.nics.filter(k => k.dhcp);
        if (!welche.length) {
          write(node.id, 'Dieses Gerät holt seine Adresse nicht automatisch.', 'dim');
          write(node.id, 'Umstellen: Gerät antippen → Einstellungen → '
            + '„Adresse automatisch holen".', 'hint');
          write(node.id, '', '');
          return;
        }
        if ((args[0] || '').toLowerCase() === 'neu') {
          for (const nic of welche) {
            const r = dienste.erneuern(node, nic.i);
            write(node.id, r.ok
              ? 'Anschluss ' + (nic.i + 1) + ': frage nach einer Adresse …'
              : 'Anschluss ' + (nic.i + 1) + ': ' + r.error, r.ok ? 'head' : 'warn');
          }
          write(node.id, '', '');
          return;
        }
        for (const nic of welche) {
          const l = dienste.leaseOf(node, nic.i);
          write(node.id, 'Anschluss ' + (nic.i + 1), 'head');
          write(node.id, '   Adresse  . . . . : ' + (nic.ip || '— noch keine —'), nic.ip ? '' : 'warn');
          write(node.id, '   Server . . . . . : ' + (l ? l.server : '— unbekannt —'), l ? '' : 'dim');
          if (l) write(node.id, '   Leihfrist  . . . : noch ' + U.fmtTime(l.rest), 'dim');
        }
        write(node.id, 'Neu holen:  dhcp neu', 'hint');
        write(node.id, '', '');
      }
    };

    CMDS.arp = {
      help: 'zeigt, welche MAC-Adressen bekannt sind',
      run(node) {
        const t = stack.arpTable(node);
        write(node.id, '', '');
        if (!t.length) {
          write(node.id, 'Noch nichts gelernt. Nach dem ersten Ping steht hier etwas.', 'dim');
        } else {
          write(node.id, '  IP-Adresse        MAC-Adresse          gilt noch', 'head');
          for (const r of t)
            write(node.id, '  ' + r.ip.padEnd(18) + r.mac.padEnd(21) + U.fmtTime(r.rest));
        }
        write(node.id, '', '');
      }
    };

    CMDS.route = {
      help: 'zeigt die Weiterleitungstabelle',
      run(node) {
        const t = stack.routingTable(node);
        write(node.id, '', '');
        write(node.id, '  Netz              Maske             über              Karte  Herkunft', 'head');
        for (const r of t)
          write(node.id, '  ' + String(r.net).padEnd(18) + String(r.mask).padEnd(18)
            + String(r.gateway).padEnd(18) + String(r.nic == null ? '?' : r.nic + 1).padEnd(7)
            /* Bei einem gelernten Weg gehört die Zahl der Sprünge
               in die Herkunftsspalte und nicht in eine eigene: sie
               steht nur bei RIP, und eine Spalte, die in vier von
               fünf Zeilen leer ist, macht die Tabelle breiter statt
               verständlicher. `route` ist mit 72 Zeichen ohnehin zu
               breit für das Gerätefenster (siehe netstat). */
            + r.kind + (r.hops != null ? ' (' + r.hops + ')' : ''));
        write(node.id, '', '');
      }
    };

    /* ─── netstat ─────────────────────────────────────────────
       Der Befehl, der die Frage beantwortet, an der in Filius das
       Ausprobieren anfängt: **wer hört auf dieser Nummer?** Die
       Spalte *Programm* hat Filius nicht, und sie ist der Grund,
       warum es dort so viel Ausprobieren war.

       ⚠️ **Vier Spalten, nicht fünf** — und das hat nur das Bild
       gezeigt. Filius' Kopfzeile (`sw_terminal_msg49`: Proto ·
       Lokale Adresse · Entfernte Adresse · Zustand) ist 72 Zeichen
       breit. Das Terminal steht hier aber auch IM Gerätefenster,
       und das ist rund 330 px schmal: die Tabelle brach mitten im
       Wort um, jede Zeile wurde zu zweien, und von einer Tabelle
       war nichts mehr zu erkennen.

       Deshalb steht die eigene Adresse nicht in jeder Zeile — sie
       steht ohnehin in der Kopfzeile des Geräts und ist für alle
       Zeilen dieselbe. Die Gegenstelle bekommt eine eigene
       Folgezeile, und die gibt es nur, wo es sie wirklich gibt. */
    CMDS.netstat = {
      help: 'zeigt, welches Programm auf welchem Port hört',
      run(node) {
        const rows = stack.sockets(node);
        write(node.id, '', '');
        if (!rows.length) {
          write(node.id, 'Kein Programm wartet hier auf Daten.', 'dim');
          write(node.id, 'Ein Serverprogramm muss installiert UND gestartet sein.', 'dim');
          write(node.id, '', '');
          return;
        }
        write(node.id, '  Proto  Port   Zustand     Programm', 'head');
        for (const r of rows) {
          const port = String(r.lokal).split(':').pop();
          write(node.id, '  ' + String(r.proto).padEnd(7) + String(port).padStart(4) + '   '
            + String(r.zustand).padEnd(12) + (r.programm || '—'));
          if (r.fern && r.fern !== '—')
            write(node.id, '         ↳ mit ' + r.fern, 'dim');
        }
        write(node.id, '', '');
      }
    };

    CMDS.mactabelle = {
      help: 'nur bei einem Switch: was er gelernt hat',
      run(node) {
        if (node.kind !== 'switch') { write(node.id, 'Nur ein Switch hat so eine Tabelle.', 'warn'); return; }
        const t = stack.macTable(node);
        write(node.id, '', '');
        if (!t.length) write(node.id, 'Noch nichts gelernt.', 'dim');
        else for (const r of t)
          write(node.id, '  Anschluss ' + (r.nic + 1) + '   ' + r.mac + '   ' + U.fmtTime(r.rest));
        write(node.id, '', '');
      }
    };

    /* ─── Die Dateibefehle ────────────────────────────────────
       Sechs der neun Filius-Befehle, die dort nur am Dateisystem
       hingen. Sie kosten je zehn Zeilen, weil `dateien.js` die
       Arbeit macht — und sie sind mehr wert als ihre Größe: wer
       `cd webserver` und `cat index.html` tippt, hat verstanden,
       dass die Seite eine DATEI auf einem RECHNER ist und nicht
       etwas, das im Browser wohnt.

       Der aktuelle Ordner steht in der Sitzung des Geräts (`cwd`)
       und nicht am Gerät: zwei Kinder an zwei Terminals desselben
       Rechners gibt es hier nicht, aber ein Ordner, der einen
       Neustart der Seite überlebt, wäre eine Behauptung über
       etwas, das gar nicht gespeichert wird. */
    const D = () => window.Dateien;
    const cwd = (node) => {
      const s = session(node.id);
      if (!s.cwd || !D().gibt(node, s.cwd)) s.cwd = D().WURZEL;
      return s.cwd;
    };
    // Ein Argument darf absolut („/webserver") oder relativ
    // („webserver", „..") sein — wie in jeder Kommandozeile.
    const zielPfad = (node, arg) => {
      const a = String(arg || '').trim();
      if (!a) return cwd(node);
      return a.charAt(0) === '/' ? D().normieren(a) : D().normieren(cwd(node) + '/' + a);
    };

    CMDS.pwd = {
      help: 'zeigt den aktuellen Ordner',
      run(node) { write(node.id, cwd(node)); }
    };

    CMDS.ls = {
      help: 'listet den aktuellen Ordner auf',
      run(node, args) {
        const p = zielPfad(node, args[0]);
        if (D().art(node, p) !== 'ordner') { write(node.id, p + ' ist kein Ordner.', 'warn'); return; }
        const l = D().list(node, p);
        if (!l.length) { write(node.id, 'Der Ordner ist leer.', 'dim'); return; }
        for (const e of l)
          write(node.id, '  ' + (e.art === 'ordner' ? '[' + e.name + ']' : e.name).padEnd(26)
            + (e.art === 'ordner' ? 'Ordner' : e.art === 'bild' ? 'Bild' : 'Text'));
      }
    };
    CMDS.dir = { help: 'dasselbe wie ls', run: (n, a) => CMDS.ls.run(n, a) };

    CMDS.cd = {
      help: 'wechselt den Ordner  (cd .. geht zurück)',
      run(node, args) {
        const p = zielPfad(node, args[0] || '/');
        if (D().art(node, p) !== 'ordner') { write(node.id, 'Diesen Ordner gibt es nicht.', 'warn'); return; }
        session(node.id).cwd = p;
        write(node.id, p, 'dim');
      }
    };

    CMDS.cat = {
      help: 'zeigt den Inhalt einer Datei',
      run(node, args) {
        if (!args[0]) { write(node.id, 'Welche Datei?  cat index.html', 'warn'); return; }
        const p = zielPfad(node, args[0]);
        const art = D().art(node, p);
        if (art === null) { write(node.id, 'Diese Datei gibt es nicht.', 'warn'); return; }
        if (art === 'ordner') { write(node.id, 'Das ist ein Ordner.', 'warn'); return; }
        if (art === 'bild') { write(node.id, 'Das ist ein Bild — im Datei-Explorer anzusehen.', 'warn'); return; }
        const e = D().lesen(node, p);
        const text = String((e && e.text) || '');
        if (!text) { write(node.id, '(leer)', 'dim'); return; }
        for (const z of text.split('\n')) write(node.id, z);
      }
    };
    CMDS.type = { help: 'dasselbe wie cat', run: (n, a) => CMDS.cat.run(n, a) };

    CMDS.mkdir = {
      help: 'legt einen Ordner an',
      run(node, args) {
        if (!args[0]) { write(node.id, 'Wie soll er heißen?  mkdir bilder', 'warn'); return; }
        const r = D().ordnerAnlegen(node, cwd(node), args[0]);
        write(node.id, r.ok ? 'Angelegt: ' + r.pfad : r.fehler, r.ok ? 'dim' : 'warn');
        if (r.ok && opts.onDirty) opts.onDirty();
      }
    };

    CMDS.touch = {
      help: 'legt eine leere Textdatei an',
      run(node, args) {
        if (!args[0]) { write(node.id, 'Wie soll sie heißen?  touch notiz.txt', 'warn'); return; }
        const r = D().anlegen(node, cwd(node), args[0], { text: '' });
        write(node.id, r.ok ? 'Angelegt: ' + r.pfad : r.fehler, r.ok ? 'dim' : 'warn');
        if (r.ok && opts.onDirty) opts.onDirty();
      }
    };

    CMDS.rm = {
      help: 'löscht eine Datei oder einen Ordner',
      run(node, args) {
        if (!args[0]) { write(node.id, 'Was denn?  rm notiz.txt', 'warn'); return; }
        const p = zielPfad(node, args[0]);
        if (!D().gibt(node, p) || p === D().WURZEL) { write(node.id, 'Das gibt es nicht.', 'warn'); return; }
        const war = D().art(node, p);
        D().loeschen(node, p);
        // Wer den Ordner löscht, in dem er steht, steht danach
        // eine Stufe höher — und nicht im Nichts.
        if (cwd(node).indexOf(p) === 0) session(node.id).cwd = D().elternteil(p);
        write(node.id, (war === 'ordner' ? 'Ordner' : 'Datei') + ' gelöscht: ' + p, 'dim');
        if (opts.onDirty) opts.onDirty();
      }
    };
    CMDS.del = { help: 'dasselbe wie rm', run: (n, a) => CMDS.rm.run(n, a) };

    CMDS.leeren = {
      help: 'löscht diese Ausgabe',
      run(node) { const s = session(node.id); s.lines = []; for (const w of s.watchers) w(); }
    };

    CMDS.vergiss = {
      help: 'wirft ARP- und MAC-Tabellen weg',
      run(node) {
        stack.clearTables(node);
        write(node.id, 'Tabellen geleert. Der nächste Ping fängt wieder mit ARP an.', 'dim');
      }
    };

    /* ─── Eingabe ─────────────────────────────────────────────*/
    function submit(nodeId, line) {
      const node = netz.get(nodeId);
      if (!node) return;
      const s = session(nodeId);

      write(nodeId, '> ' + line, 'echo');
      const t = String(line).trim();
      if (!t) return;

      s.history.push(t); s.hpos = s.history.length;

      const parts = t.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const c = CMDS[cmd];
      if (!c) {
        write(nodeId, '„' + parts[0] + '" kenne ich nicht. Tippe  hilfe', 'warn');
        return;
      }
      if (!node.on) { write(nodeId, 'Dieses Gerät ist ausgeschaltet.', 'warn'); return; }
      c.run(node, parts.slice(1));
    }

    function historyStep(nodeId, dir) {
      const s = session(nodeId);
      if (!s.history.length) return null;
      s.hpos = U.clamp(s.hpos + dir, 0, s.history.length);
      return s.hpos < s.history.length ? s.history[s.hpos] : '';
    }

    const linesOf = (nodeId) => session(nodeId).lines;
    const onChange = (nodeId, fn) => {
      const s = session(nodeId); s.watchers.push(fn);
      return () => { const i = s.watchers.indexOf(fn); if (i >= 0) s.watchers.splice(i, 1); };
    };
    const forget = (nodeId) => sessions.delete(nodeId);

    return { submit, linesOf, onChange, historyStep, write, forget, CMDS };
  }

  window.Terminal = Terminal;
})();
