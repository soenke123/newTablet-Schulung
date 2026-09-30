/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — mail.js   ·   E-Mail-Server und das Senden
   und Abholen
   ══════════════════════════════════════════════════════════════
   Zwei Protokolle, zwei Ports, zwei völlig verschiedene Aufgaben —
   und genau deshalb ist E-Mail das Beispiel, an dem „ein Port
   gehört zu einem PROGRAMM" endgültig sitzt:

     **SMTP (25)** bringt eine Nachricht HIN. Von meinem Rechner
     zu meinem Server, und von dort zum Server des Empfängers.
     **POP3 (110)** holt sie AB. Nur der Empfänger, nur von
     seinem eigenen Server, nur mit Benutzername und Passwort.

   Zwischen den beiden liegt die Aussage, die im Unterricht am
   meisten überrascht: **eine E-Mail wird nicht zugestellt, sie
   wird abgeholt.** Sie liegt so lange auf dem Server, bis jemand
   danach fragt.

   ── Zeilendialog, und das ist der halbe Grund ─────────────────
   Beide Protokolle sind lesbarer Text, Zeile für Zeile. Im
   Mitschnitt steht `MAIL FROM: <anna@schule.de>` und darunter
   `250 OK` — man liest das Gespräch mit, ohne dass jemand es
   übersetzen muss. Deshalb geht jede Zeile als eigenes Segment
   hinaus und nicht alles in einem Rutsch.

   ⭐ Und deshalb steht `PASS geheim` im Klartext im Mitschnitt.
   Das ist kein Mangel der Nachbildung — das IST POP3, und es ist
   eine der wenigen Stellen, an denen Sicherheit ohne Zusatzstoff
   vorkommt.

   ── Was bewusst fehlt ─────────────────────────────────────────
   Adressbuch, CC und BCC, Anhänge, APOP, TLS, mehrere Konten je
   Gerät (Filius hat auch nur eines), `TOP`, `NOOP`, `RSET`.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SMTP = 25, POP3 = 110;
  const EOL = '\r\n';

  /* Eine Nachricht als Text — das Format, das auch durch die
     Leitung geht. Die Köpfe stehen oben, dann eine Leerzeile,
     dann der Text; so ist es seit RFC 822, und man sieht es dem
     Mitschnitt an. */
  function alsText(m) {
    return 'From: ' + m.von + EOL + 'To: ' + m.an + EOL
      + 'Subject: ' + (m.betreff || '') + EOL + EOL + (m.text || '');
  }

  function ausText(text) {
    const i = String(text).indexOf(EOL + EOL);
    const kopf = i < 0 ? String(text) : String(text).slice(0, i);
    const rumpf = i < 0 ? '' : String(text).slice(i + 4);
    const lies = (name) => {
      const m = new RegExp('^' + name + ':\\s*(.*)$', 'im').exec(kopf);
      return m ? m[1].trim() : '';
    };
    return { von: lies('From'), an: lies('To'), betreff: lies('Subject'), text: rumpf };
  }

  function erzeugen(engine, netz, stack, api) {

    /* Ein Leser, der aus dem Strom einzelne ZEILEN macht. TCP
       kennt keine Zeilen — es kann zwei davon in einem Segment
       bringen oder eine auf zwei verteilen. Beides tritt hier
       auf, sobald jemand am Tempo dreht. */
    function zeilen(conn, fn) {
      let puffer = '';
      conn.onDaten((text) => {
        puffer += text;
        let i;
        while ((i = puffer.indexOf(EOL)) >= 0) {
          const z = puffer.slice(0, i);
          puffer = puffer.slice(i + 2);
          fn(z);
        }
      });
    }

    // Siehe `netz.dienstLaeuft`: installiert UND gestartet UND an.
    const laeuft = (node) => netz.dienstLaeuft(node, 'mail');

    const konten = (node) => (node.mailServer && node.mailServer.konten) || [];
    const konto = (node, benutzer) =>
      konten(node).find(k => String(k.benutzer).toLowerCase() === String(benutzer).toLowerCase());

    const domainVon = (adresse) => String(adresse || '').split('@')[1] || '';
    const benutzerVon = (adresse) => String(adresse || '').split('@')[0] || '';

    /* ═══ Der SMTP-Server (Port 25) ══════════════════════════ */

    function smtpAn(node) {
      stack.tcpHoeren(node, SMTP, (conn) => {
        const z = { von: '', an: [], daten: false, text: [] };
        const sag = (s) => conn.senden(s + EOL);
        sag('220 ' + (node.mailServer.domain || 'mailserver') + ' Willkommen');

        zeilen(conn, (zeile) => {
          if (z.daten) {
            /* Ein einzelner Punkt in einer Zeile beendet den Text.
               Diese Verabredung ist fast so alt wie das Internet
               und steht hier, weil sie im Mitschnitt zu sehen ist. */
            if (zeile === '.') {
              z.daten = false;
              const m = ausText(z.text.join(EOL));
              m.von = z.von || m.von;
              let alle = true;
              for (const an of z.an) alle = zustellen(node, an, m) && alle;
              sag(alle ? '250 OK, angenommen' : '550 Empfänger unbekannt');
              z.an = []; z.text = [];
              return;
            }
            z.text.push(zeile);
            return;
          }

          const gross = zeile.toUpperCase();
          if (gross.indexOf('HELO') === 0 || gross.indexOf('EHLO') === 0) { sag('250 Hallo'); return; }
          if (gross.indexOf('MAIL FROM') === 0) {
            z.von = adresse(zeile); sag('250 OK'); return;
          }
          if (gross.indexOf('RCPT TO') === 0) {
            const a = adresse(zeile);
            if (!a) { sag('501 Adresse fehlt'); return; }
            /* ⭐ Hier — und nicht erst nach dem Text. So macht es
               echtes SMTP, und es ist auch die bessere Lehre: der
               Server sagt bei DEM Befehl, in dem der Empfänger
               steht, ob er ihn kennt. Vorher stand im Mitschnitt
               ein „250 OK" auf einen Empfänger, den es nicht gab,
               und die Ablehnung kam zwanzig Zeilen später nach
               dem ganzen Brieftext.

               Dass die Prüfung beim Punkt am Ende NOCH EINMAL
               läuft, bleibt so: zwischen RCPT TO und dem Ende des
               Textes kann ein Konto gelöscht worden sein, und
               eine Nachricht, die dann ins Leere fiele, wäre
               schlimmer als eine doppelte Prüfung. */
            if (!kannZustellen(node, a)) { sag('550 Empfänger unbekannt'); return; }
            z.an.push(a); sag('250 OK'); return;
          }
          if (gross === 'DATA') { z.daten = true; sag('354 Schreib los, Ende mit einem Punkt'); return; }
          if (gross === 'QUIT') { sag('221 Tschüss'); conn.schliessen(); return; }
          sag('500 Kenne ich nicht');
        });
      }, 'E-Mail-Server');
    }

    const adresse = (zeile) => {
      const m = /<([^>]*)>/.exec(zeile);
      if (m) return m[1].trim();
      const n = /:\s*(\S+)/.exec(zeile);
      return n ? n[1].trim() : '';
    };

    /* ─── Zustellen oder weiterreichen ────────────────────────
       Die eine Entscheidung, die einen Mailserver ausmacht:
       gehört die Adresse zu MIR, dann lege ich sie ins Postfach.
       Sonst muss ich herausfinden, WER für diese Domain zuständig
       ist — und das steht im DNS als MX-Eintrag. */
    /* Dieselbe Frage ohne Nebenwirkung: KANN dieser Server mit
       dieser Adresse etwas anfangen? Gebraucht beim RCPT TO, wo
       noch gar keine Nachricht vorliegt.

       ⚠️ Eine fremde Domain ist KEIN Grund zur Ablehnung — sie
       wird weitergereicht, und genau dafür gibt es den
       MX-Eintrag. Abgelehnt wird nur, was in die eigene Domain
       gehört und dort kein Postfach hat. */
    function kannZustellen(node, an) {
      const dom = domainVon(an).toLowerCase();
      const meine = String((node.mailServer && node.mailServer.domain) || '').toLowerCase();
      if (dom && meine && dom !== meine) return true;
      return !!konto(node, benutzerVon(an));
    }

    function zustellen(node, an, m) {
      const dom = domainVon(an).toLowerCase();
      const meine = String((node.mailServer && node.mailServer.domain) || '').toLowerCase();

      if (dom && meine && dom !== meine) { weiterreichen(node, an, m); return true; }

      const k = konto(node, benutzerVon(an));
      if (!k) return false;
      k.posteingang = k.posteingang || [];
      k.posteingang.push({ von: m.von, an: an, betreff: m.betreff, text: m.text, zeit: engine.now });
      return true;
    }

    /* Der Server wird selbst zum Client. ⭐ Das ist die Stelle,
       an der DNS zum zweiten Mal gebraucht wird — und diesmal
       nicht, um eine Zahl zu sparen, sondern um eine
       ZUSTÄNDIGKEIT nachzuschlagen. */
    function weiterreichen(node, an, m) {
      const dom = domainVon(an);
      if (!api.resolve) return;
      api.resolve(node, dom, (r) => {
        if (!r.ok) {
          sagen(node, 'Für ' + dom + ' ist kein Mailserver eingetragen (MX-Eintrag fehlt).');
          return;
        }
        api.resolve(node, r.mx, (a) => {
          if (!a.ok) {
            sagen(node, 'Der Mailserver ' + r.mx + ' ist nicht aufzulösen.');
            return;
          }
          smtpSenden(node, a.ip, SMTP, { von: m.von, an: an, betreff: m.betreff, text: m.text },
            () => {}, 'E-Mail-Server');
        });
      }, 'MX');
    }

    const sagen = (node, text) => stack.sendIp && engine.emit('event', {
      kind: 'note', node: node.id, nodeName: node.name, text: text, level: 'warn', t: engine.now
    });

    /* ═══ Der POP3-Server (Port 110) ═════════════════════════ */

    function popAn(node) {
      stack.tcpHoeren(node, POP3, (conn) => {
        const z = { benutzer: '', angemeldet: false, weg: [] };
        const sag = (s) => conn.senden(s + EOL);
        sag('+OK POP3 bereit');

        zeilen(conn, (zeile) => {
          const teile = zeile.split(/\s+/);
          const bef = (teile[0] || '').toUpperCase();

          if (bef === 'USER') { z.benutzer = teile[1] || ''; sag('+OK Benutzer bekannt'); return; }
          if (bef === 'PASS') {
            const k = konto(node, z.benutzer);
            /* ⭐ Das Passwort steht hier im Klartext in der Zeile —
               und damit im Mitschnitt. Das IST POP3. */
            if (k && String(k.passwort || '') === (teile[1] || '')) {
              z.angemeldet = true;
              sag('+OK ' + (k.posteingang || []).length + ' Nachrichten');
            } else sag('-ERR Benutzer oder Passwort falsch');
            return;
          }
          if (!z.angemeldet) { sag('-ERR Erst anmelden'); return; }

          const k = konto(node, z.benutzer);
          const post = (k && k.posteingang) || [];

          if (bef === 'STAT') { sag('+OK ' + post.length); return; }
          if (bef === 'LIST') {
            sag('+OK ' + post.length + ' Nachrichten');
            post.forEach((m, i) => sag((i + 1) + ' ' + alsText(m).length));
            sag('.');
            return;
          }
          if (bef === 'RETR') {
            const nr = parseInt(teile[1], 10);
            const m = post[nr - 1];
            if (!m) { sag('-ERR Die gibt es nicht'); return; }
            sag('+OK Nachricht folgt');
            for (const zeileText of alsText(m).split(EOL)) sag(zeileText);
            sag('.');
            return;
          }
          if (bef === 'DELE') {
            const nr = parseInt(teile[1], 10);
            if (!post[nr - 1]) { sag('-ERR Die gibt es nicht'); return; }
            z.weg.push(nr - 1);
            sag('+OK gelöscht');
            return;
          }
          if (bef === 'QUIT') {
            /* Gelöscht wird erst beim QUIT — auch das ist POP3 und
               nicht Bequemlichkeit: wer die Verbindung vorher
               verliert, hat seine Post noch. */
            if (k && z.weg.length) {
              k.posteingang = post.filter((m, i) => z.weg.indexOf(i) < 0);
            }
            sag('+OK Tschüss');
            conn.schliessen();
            return;
          }
          sag('-ERR Kenne ich nicht');
        });
      }, 'E-Mail-Server');
    }

    function serverAn(node) { smtpAn(node); popAn(node); }
    function serverAus(node) {
      stack.tcpNichtHoeren(node, SMTP);
      stack.tcpNichtHoeren(node, POP3);
    }

    /* ═══ Die Client-Seite ═══════════════════════════════════
       Ein Gespräch ist eine LISTE von Schritten: auf diese
       Antwort hin jene Zeile. Das ist kurz genug zu lesen und
       zeigt zugleich, was ein Protokoll ist — eine verabredete
       Reihenfolge. */
    function gespraech(node, ip, port, programm, schritte, cb) {
      let i = 0;
      let fertig = false;
      const ende = (fehler) => {
        if (fertig) return;
        fertig = true;
        cb(fehler || null);
      };
      const conn = stack.tcpVerbinde(node, ip, port, programm, (err, c) => {
        if (err) { ende(err); return; }
        zeilen(c, (zeile) => {
          if (fertig || i >= schritte.length) return;
          const s = schritte[i];
          /* Eine Antwort, die nicht kommt wie verabredet, beendet
             das Gespräch — und der Grund ist die Zeile selbst.
             „550 Empfänger unbekannt" ist als Meldung besser als
             alles, was sich hier ausdenken ließe. */
          if (!s.erwartet.test(zeile)) { ende(zeile); return; }
          /* Eine Antwort kann die richtige FORM haben und trotzdem
             das Falsche sagen — die Begrüßung eines Mailservers
             nennt seine Domain, und ob das die erwartete ist,
             steht in keinem Statuscode. `pruefe` gibt in dem Fall
             einen Klartextgrund zurück; sonst nichts. */
          if (s.pruefe) { const warum = s.pruefe(zeile); if (warum) { ende(warum); return; } }
          /* ⚠️ Gesendet wird, was zu DIESEM Schritt gehört — nicht
             zum nächsten. Andersherum war es im ersten Entwurf,
             und dann fiel das HELO ganz aus: auf die Begrüßung
             ging gleich `MAIL FROM` hinaus, und das Gespräch lief
             einen Schritt versetzt weiter, bis es an der Antwort
             `354` scheiterte. Der Prüfstand hat es gefunden. */
          i++;
          if (s.sende) for (const z of [].concat(s.sende())) c.senden(z + EOL);
          if (s.ende) ende(null);
        });
      });
      if (conn) conn.onZu(() => ende(fertig ? null : 'Die Verbindung ging zu.'));
      return conn;
    }

    /* Eine Nachricht abschicken: das SMTP-Gespräch von oben. */
    function smtpSenden(node, ip, port, m, cb, programm) {
      const schritte = [
        { erwartet: /^220/, sende: () => 'HELO ' + (node.name || 'rechner') },
        { erwartet: /^250/, sende: () => 'MAIL FROM: <' + m.von + '>' },
        { erwartet: /^250/, sende: () => 'RCPT TO: <' + m.an + '>' },
        { erwartet: /^250/, sende: () => 'DATA' },
        { erwartet: /^354/, sende: () => alsText(m).split(EOL).concat(['.']) },
        { erwartet: /^250/, sende: () => 'QUIT' },
        { erwartet: /^221/, ende: true }
      ];
      return gespraech(node, ip, port, programm || 'E-Mail-Programm', schritte, cb);
    }

    /* ─── Was die Oberfläche ruft ─────────────────────────────*/

    function senden(node, m, cb) {
      const k = netz.mailKonto(node);
      if (!k.adresse || !k.smtp) { cb('Es ist noch kein Konto eingerichtet.'); return; }
      const brief = { von: k.adresse, an: m.an, betreff: m.betreff, text: m.text };
      zumServer(node, k.smtp, k.smtpPort || SMTP, (fehler, ip, port) => {
        if (fehler) { cb(fehler); return; }
        smtpSenden(node, ip, port, brief, (f) => {
          if (!f) {
            k.gesendet = k.gesendet || [];
            k.gesendet.push(Object.assign({ zeit: engine.now }, brief));
          }
          cb(f);
        });
      });
    }

    /* ═══ Anmelden ═══════════════════════════════════════════
       ⭐ Vom Nutzer verlangt: „Wenn der Login-Button gedrückt wird,
       soll das System prüfen, ob die eingegebenen Daten korrekt
       sind. Dabei sollen auch SMTP und POP3 geprüft werden."

       Filius hat das nicht — dort tippt man die Angaben ein und
       merkt beim ersten Senden, ob sie stimmen. Das ist die
       teuerste Stelle des ganzen Mailkapitels: ein Tippfehler im
       Servernamen sieht genauso aus wie ein fehlender MX-Eintrag
       wie ein nicht gestarteter Server. Ein Knopf, der EINMAL
       sagt „so geht es" oder „so nicht, und zwar deshalb", nimmt
       genau diese Verwechslung heraus.

       Zwei Gespräche, und beide sagen etwas Eigenes:

         POP3   USER/PASS — die einzige echte Anmeldung, die es
                hier gibt. Falsches Passwort → „-ERR Benutzer
                oder Passwort falsch".
         SMTP   HELO/MAIL FROM/RCPT TO auf die EIGENE Adresse.
                SMTP kennt kein AUTH (auch im echten Leben erst
                seit RFC 2554); was es beantwortet, ist „bedient
                dieser Server diese Domain und kennt er dieses
                Konto" — mit „550 Empfänger unbekannt", wenn
                nicht.

       ⚠️ Der Grund für die zweite Hälfte: POP3 allein prüft nur
       das Abholen. Wer sich anmeldet und dann nicht senden kann,
       hätte einen grünen Haken und ein Programm, das nicht tut,
       wofür man es aufgemacht hat.

       Der Fehlertext ist die ZEILE DES SERVERS. Siehe `gespraech`
       weiter oben: „550 Empfänger unbekannt" ist als Meldung
       besser als alles, was sich hier ausdenken ließe. */
    function anmelden(node, cb) {
      const k = netz.mailKonto(node);
      const fehlt = !k.benutzer ? 'der Benutzername'
        : !k.passwort ? 'das Passwort'
        : !k.domain ? 'die Maildomain'
        : !k.pop3 ? 'der POP3-Server'
        : !k.smtp ? 'der SMTP-Server' : null;
      if (fehlt) { cb('Es fehlt noch ' + fehlt + '.'); return; }

      const adresse = adresseVon(k);

      zumServer(node, k.pop3, k.pop3Port || POP3, (f1, ip1, port1) => {
        if (f1) { cb(f1); return; }
        gespraech(node, ip1, port1, 'E-Mail-Programm', [
          { erwartet: /^\+OK/, sende: () => 'USER ' + k.benutzer },
          { erwartet: /^\+OK/, sende: () => 'PASS ' + k.passwort },
          { erwartet: /^\+OK/, sende: () => 'QUIT' },
          { erwartet: /^\+OK/, ende: true }
        ], (f2) => {
          if (f2) { cb(f2); return; }
          zumServer(node, k.smtp, k.smtpPort || SMTP, (f3, ip2, port2) => {
            if (f3) { cb(f3); return; }
            gespraech(node, ip2, port2, 'E-Mail-Programm', [
              /* ⭐ Die Begrüßung eines SMTP-Servers nennt seine
                 Domain („220 schule.de Willkommen"). Damit ist
                 genau die Frage beantwortet, die der Nutzer
                 gestellt hat: endet meine Adresse auf die Domain,
                 die dieser Server bedient? Ein Statuscode kann
                 das nicht sagen — 220 heißt nur „ich bin da". */
              { erwartet: /^220/,
                pruefe: (z) => {
                  const dom = String(z.split(/\s+/)[1] || '').toLowerCase();
                  const meine = String(k.domain || '').toLowerCase();
                  return (dom && meine && dom !== meine)
                    ? 'Dieser Server bedient die Domain „' + dom + '" und nicht „'
                      + meine + '".'
                    : null;
                },
                sende: () => 'HELO ' + (node.name || 'rechner') },
              { erwartet: /^250/, sende: () => 'MAIL FROM: <' + adresse + '>' },
              { erwartet: /^250/, sende: () => 'RCPT TO: <' + adresse + '>' },
              { erwartet: /^250/, sende: () => 'QUIT' },
              { erwartet: /^221/, ende: true }
            ], (f4) => {
              if (f4) { cb(f4); return; }
              k.angemeldet = true;
              cb(null, adresse);
            });
          });
        });
      });
    }

    /* ⭐ Die eigene Adresse ergibt sich, sie wird nicht getippt.
       Vom Nutzer verlangt: „Die E-Mail-Adresse muss beim Login
       nicht extra angegeben werden … accountname@domain.de".

       ⚠️ `k.adresse` bleibt trotzdem im Modell stehen und wird
       hier bei jeder Gelegenheit nachgeführt. `senden` und
       `abholen` fragen sie, die Szenarien setzen sie, mehrere
       Prüfungen lesen sie — sie ist ab jetzt ABGELEITET und nicht
       mehr eingetippt, aber sie ist noch da. Ein Feld
       herauszureißen, das fünf Stellen lesen, um dieselbe
       Zeichenkette an sechster Stelle neu zu bilden, wäre Arbeit
       ohne Ertrag. */
    function adresseVon(k) {
      const a = k.benutzer && k.domain
        ? String(k.benutzer).trim() + '@' + String(k.domain).trim().toLowerCase()
        : '';
      k.adresse = a;
      return a;
    }

    function abmelden(node) {
      const k = netz.mailKonto(node);
      k.angemeldet = false;
    }

    function abholen(node, cb) {
      const k = netz.mailKonto(node);
      if (!k.adresse || !k.pop3) { cb('Es ist noch kein Konto eingerichtet.'); return; }
      zumServer(node, k.pop3, k.pop3Port || POP3, (fehler, ip, port) => {
        if (fehler) { cb(fehler); return; }
        holeSchleife(node, ip, port, k, (f, neue) => {
          if (!f && neue && neue.length) {
            k.posteingang = (k.posteingang || []).concat(neue);
          }
          cb(f, neue ? neue.length : 0);
        });
      });
    }

    /* Ein Gespräch, das alles abholt: anmelden, zählen, jede
       Nachricht holen und löschen, tschüss.

       ⚠️ Ausgeschrieben als kleiner Zustandsautomat und NICHT als
       Schrittliste wie beim Senden. Der Grund ist die Schleife:
       wie oft geholt wird, steht erst fest, wenn STAT geantwortet
       hat. Der erste Versuch hat das in die Liste gezwängt — und
       verschluckte dabei die Zeile „+OK Nachricht folgt", die
       daraufhin als erste Zeile IM Brief stand. */
    function holeSchleife(node, ip, port, k, cb) {
      const neue = [];
      let gesamt = 0, geholt = 0, zustand = 'start', sammeln = null, fertig = false;
      const ende = (f) => { if (!fertig) { fertig = true; cb(f, neue); } };

      const conn = stack.tcpVerbinde(node, ip, port, 'E-Mail-Programm', (err, c) => {
        if (err) { ende(err); return; }
        const sag = (s) => c.senden(s + EOL);
        zeilen(c, (zeile) => {
          if (fertig) return;

          // Mitten im Brief: sammeln, bis der Punkt kommt.
          if (zustand === 'daten') {
            if (zeile === '.') {
              neue.push(Object.assign({ zeit: engine.now }, ausText(sammeln.join(EOL))));
              sammeln = null;
              geholt++;
              zustand = 'dele';
              /* Immer die ERSTE: der Server rückt nach, sobald
                 gelöscht ist. Mit laufender Nummer zu arbeiten
                 wäre der Fehler, den man erst bei der zweiten
                 Nachricht sieht. */
              sag('DELE 1');
              return;
            }
            sammeln.push(zeile);
            return;
          }

          if (!/^\+OK/.test(zeile)) { ende(zeile); return; }

          switch (zustand) {
            case 'start': zustand = 'user'; sag('USER ' + k.benutzer); break;
            case 'user':  zustand = 'pass'; sag('PASS ' + (k.passwort || '')); break;
            case 'pass':  zustand = 'stat'; sag('STAT'); break;
            case 'stat':
              gesamt = parseInt(String(zeile).split(/\s+/)[1], 10) || 0;
              if (gesamt > 0) { zustand = 'retr'; sag('RETR 1'); }
              else { zustand = 'quit'; sag('QUIT'); }
              break;
            case 'retr': zustand = 'daten'; sammeln = []; break;
            case 'dele':
              if (geholt < gesamt) { zustand = 'retr'; sag('RETR 1'); }
              else { zustand = 'quit'; sag('QUIT'); }
              break;
            case 'quit': ende(null); break;
          }
        });
      });
      if (conn) conn.onZu(() => ende(null));
      return conn;
    }

    /* Name oder Adresse — wie beim Browser. */
    function zumServer(node, wirt, port, cb) {
      if (window.NetUtil.ip2int(wirt) !== null) { cb(null, wirt, port); return; }
      if (!api.resolve) { cb('Dieses Gerät kann keine Namen auflösen.'); return; }
      api.resolve(node, wirt, (r) => {
        if (r.ok) cb(null, r.ip, port);
        else cb(r.why || ('Der Name „' + wirt + '" ist nicht aufzulösen.'));
      });
    }

    return {
      SMTP, POP3, laeuft, serverAn, serverAus, senden, abholen,
      anmelden, abmelden, adresseVon, smtpSenden, zumServer,
      alsText, ausText, konten, konto, domainVon, benutzerVon
    };
  }

  window.Mail = { erzeugen: erzeugen, SMTP: SMTP, POP3: POP3 };
})();
