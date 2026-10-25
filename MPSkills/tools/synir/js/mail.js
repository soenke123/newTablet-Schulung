/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — mail.js   ·   E-Mail-Server, Senden und
   Lesen
   ══════════════════════════════════════════════════════════════
   Zwei Aufgaben, zwei Protokolle, zwei Ports — und genau deshalb
   ist E-Mail das Beispiel, an dem „ein Port gehört zu einem
   PROGRAMM" endgültig sitzt:

     **SMTP (25)** bringt eine Nachricht HIN. Von meinem Rechner
     zu meinem Server, und von dort zum Server des Empfängers.
     **IMAP (143)** zeigt das Postfach, das AUF DEM SERVER liegt.
     Nur der Empfänger, nur mit Benutzername und Passwort.

   Zwischen den beiden liegt die Aussage, die im Unterricht am
   meisten überrascht: **eine E-Mail wird nicht zugestellt.** Sie
   liegt auf dem Server, und das Programm schaut dort nach. Bei
   IMAP bleibt sie dort auch liegen — deshalb sehen Laptop und
   Handy dieselbe Post, und was man auf dem einen löscht, ist auf
   dem anderen auch weg.

   ── POP3 (110): das ältere Verfahren, nur auf Wunsch ──────────
   ⭐ Vom Nutzer verlangt (2026-10-25): „IMAP ist der Standard.
   POP3 nur eine Option, die man am Anfang, wenn E-Mail in Sek II
   neu ist, einmal testen kann. Für Sek I ist das nichts, da soll
   EIN Weg gehen."

   Deshalb hört ein Mailserver auf 110 nur, wenn in seinem Fenster
   der Haken „Auch POP3 anbieten" sitzt (`mailServer.pop3`), und
   das E-Mail-Programm zeigt die Wahl IMAP/POP3 nur, wenn im Netz
   ein solcher Server steht. Vorbelegt ist das allein in II.3. POP3
   HOLT die Post AB und löscht sie danach auf dem Server — genau
   der Unterschied, den man einmal gesehen haben soll.

   ── Zeilendialog, und das ist der halbe Grund ─────────────────
   Alle drei Protokolle sind lesbarer Text, Zeile für Zeile. Im
   Mitschnitt steht `MAIL FROM: <anna@schule.de>` und darunter
   `250 OK` — man liest das Gespräch mit, ohne dass jemand es
   übersetzen muss. Deshalb geht jede Zeile als eigenes Segment
   hinaus und nicht alles in einem Rutsch.

   ⭐ Und deshalb steht `a1 LOGIN anna geheim` im Klartext im
   Mitschnitt (bei POP3 `PASS geheim`). Das ist kein Mangel der
   Nachbildung — so sind beide Protokolle ohne TLS, und es ist
   eine der wenigen Stellen, an denen Sicherheit ohne Zusatzstoff
   vorkommt.

   ── Was bewusst fehlt ─────────────────────────────────────────
   Adressbuch, CC und BCC, Anhänge, APOP, STARTTLS (TLS gibt es nur
   „implizit": Port 465, 993 und 995, siehe `tls.js`), TLS zwischen
   zwei Mailservern, mehrere Konten je Gerät (Filius hat auch nur
   eines), bei POP3 `TOP`, `NOOP`, `RSET`. Bei IMAP nur der eine
   Ordner INBOX, kein „gelesen" (`\Seen`), kein IDLE, keine
   UIDVALIDITY; die Befehle sind LOGIN, SELECT, UID SEARCH,
   UID FETCH, UID STORE, EXPUNGE und LOGOUT — genau die, die das
   Programm braucht, und jeder davon steht im Mitschnitt.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SMTP = 25, IMAP = 143, POP3 = 110;
  /* Dieselben Dienste mit TLS von der ersten Zeile an („implizites
     TLS", wie es SMTPS, IMAPS und POP3S heißen): 465, 993 und 995.
     Die Zeilen darin sind die alten — nur dass sie verschlüsselt
     gehen. */
  const SMTPS = 465, IMAPS = 993, POP3S = 995;

  /* Der Port, der zu einer Art und einer Verschlüsselung gehört.
     Eine Stelle, damit Programm, Umschalter und Prüfstand nicht
     jeder ihre eigene Tabelle führen. */
  const eingangsPort = (art, mitTls) => art === 'pop3'
    ? (mitTls ? POP3S : POP3) : (mitTls ? IMAPS : IMAP);
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
    const tls = api && api.tls;

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

    function smtpHandler(node) {
      return (conn) => {
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
      };
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
      uidsSicher(k);
      if (api && api.onDirty) api.onDirty();
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

    /* ═══ Der IMAP-Server (Port 143) ═════════════════════════
       Jede Nachricht im Postfach hat eine feste Nummer, die UID.
       Sie ändert sich nicht, wenn davor etwas gelöscht wird — die
       laufende Nummer (1, 2, 3 …) schon. Mit der UID merkt sich das
       Programm, was es schon kennt, und holt beim nächsten Abrufen
       nur das Neue.

       ⚠️ Nachrichten aus Szenarien und älteren Ständen haben noch
       keine UID. Sie bekommen sie hier, beim ersten Hinsehen —
       und `uidNext` zählt nur weiter, nie zurück: eine UID, die
       einmal vergeben war, darf nicht für eine ANDERE Nachricht
       wiederkommen, sonst hielte ein Programm die neue für die
       alte und zeigte sie nie. */
    function uidsSicher(k) {
      k.posteingang = k.posteingang || [];
      let naechste = k.uidNext || 1;
      for (const m of k.posteingang) if (m.uid >= naechste) naechste = m.uid + 1;
      for (const m of k.posteingang) if (!m.uid) m.uid = naechste++;
      k.uidNext = naechste;
    }

    /* Wörter einer IMAP-Zeile: einfache Wörter oder "in Anführungs-
       zeichen" (ein Passwort mit Leerzeichen). Andersherum, beim
       Senden, setzt `imapWort` die Anführungszeichen nur, wo nötig —
       `LOGIN anna apfel` liest sich im Mitschnitt besser als
       `LOGIN "anna" "apfel"`. */
    function imapWorte(zeile) {
      const out = [];
      const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
      let m;
      while ((m = re.exec(zeile))) out.push(m[1] != null ? m[1].replace(/\\(.)/g, '$1') : m[2]);
      return out;
    }
    const imapWort = (s) => /^[A-Za-z0-9._@+-]+$/.test(String(s))
      ? String(s) : '"' + String(s).replace(/(["\\])/g, '\\$1') + '"';

    /* „1,4,7" oder „3:*" — welche UIDs gemeint sind. */
    function uidMenge(text, uids) {
      const max = uids.length ? Math.max.apply(null, uids) : 0;
      const raus = new Set();
      for (const teil of String(text || '').split(',')) {
        const [a, b] = teil.split(':');
        const von = a === '*' ? max : parseInt(a, 10);
        const bis = b == null ? von : (b === '*' ? max : parseInt(b, 10));
        if (!(von > 0) || !(bis > 0)) continue;
        for (const u of uids) if (u >= Math.min(von, bis) && u <= Math.max(von, bis)) raus.add(u);
      }
      return raus;
    }

    function imapHandler(node) {
      return (conn) => {
        const z = { benutzer: null, gewaehlt: false };
        const sag = (s) => conn.senden(s + EOL);
        sag('* OK IMAP bereit');

        /* Jede Zeile des Programms beginnt mit einer Marke (a1, a2 …),
           und die letzte Antwort darauf trägt dieselbe Marke: „a1 OK"
           oder „a1 NO …". Was dazwischen kommt, beginnt mit „*" —
           das sind die eigentlichen Auskünfte. So weiß das Programm
           genau, wann eine Antwort fertig ist. */
        zeilen(conn, (zeile) => {
          const w = imapWorte(zeile);
          const tag = w[0] || '*';
          const bef = (w[1] || '').toUpperCase();

          if (bef === 'LOGOUT') {
            sag('* BYE Tschüss');
            sag(tag + ' OK LOGOUT fertig');
            conn.schliessen();
            return;
          }
          if (bef === 'LOGIN') {
            const k = konto(node, w[2] || '');
            /* ⭐ Benutzer UND Passwort stehen hier in EINER Zeile im
               Klartext — und damit im Mitschnitt. */
            if (k && String(k.passwort || '') === (w[3] || '')) {
              z.benutzer = k.benutzer;
              sag(tag + ' OK Angemeldet');
            } else sag(tag + ' NO Benutzer oder Passwort falsch');
            return;
          }
          if (!z.benutzer) { sag(tag + ' NO Erst anmelden'); return; }
          // Das Konto kann inzwischen gelöscht sein — jedes Mal neu suchen.
          const k = konto(node, z.benutzer);
          if (!k) { sag(tag + ' NO Dieses Postfach gibt es nicht mehr'); return; }
          uidsSicher(k);
          const post = k.posteingang;

          if (bef === 'SELECT') {
            if (String(w[2] || '').toUpperCase() !== 'INBOX') {
              sag(tag + ' NO Diesen Ordner gibt es nicht'); return;
            }
            z.gewaehlt = true;
            sag('* ' + post.length + ' EXISTS');
            sag('* OK [UIDNEXT ' + k.uidNext + ']');
            sag(tag + ' OK [READ-WRITE] Posteingang gewählt');
            return;
          }
          if (!z.gewaehlt) { sag(tag + ' NO Erst den Posteingang wählen (SELECT INBOX)'); return; }

          const unter = bef === 'UID' ? String(w[2] || '').toUpperCase() : bef;
          const arg = bef === 'UID' ? w.slice(3) : w.slice(2);
          const uids = post.map(m => m.uid);

          if (bef === 'UID' && unter === 'SEARCH') {
            sag('* SEARCH' + (uids.length ? ' ' + uids.join(' ') : ''));
            sag(tag + ' OK SEARCH fertig');
            return;
          }
          if (bef === 'UID' && unter === 'FETCH') {
            /* ⭐ Die Nachricht kommt als „Literal": `{312}` sagt, wie
               viele Zeichen jetzt folgen. Dann weiß das Programm,
               wo der Brief aufhört — ein Punkt am Ende wie bei SMTP
               und POP3 braucht es dafür nicht. */
            const welche = uidMenge(arg[0], uids);
            post.forEach((m, i) => {
              if (!welche.has(m.uid)) return;
              const text = alsText(m);
              sag('* ' + (i + 1) + ' FETCH (UID ' + m.uid + ' BODY[] {' + (text.length + EOL.length) + '}');
              for (const zeileText of text.split(EOL)) sag(zeileText);
              sag(')');
            });
            sag(tag + ' OK FETCH fertig');
            return;
          }
          if (bef === 'UID' && unter === 'STORE') {
            /* Löschen geht bei IMAP in zwei Schritten: markieren
               (\Deleted) und dann aufräumen (EXPUNGE). */
            const welche = uidMenge(arg[0], uids);
            const loeschen = /\\Deleted/i.test(arg.slice(2).join(' '));
            const plus = String(arg[1] || '').charAt(0) !== '-';
            post.forEach((m, i) => {
              if (!welche.has(m.uid)) return;
              if (loeschen) m.weg = plus;
              sag('* ' + (i + 1) + ' FETCH (UID ' + m.uid + ' FLAGS (' + (m.weg ? '\\Deleted' : '') + '))');
            });
            sag(tag + ' OK STORE fertig');
            return;
          }
          if (bef === 'EXPUNGE') {
            /* Von hinten nach vorn gemeldet: jede Zeile nennt die
               laufende Nummer, die vor DIESEM Löschen galt. */
            for (let i = post.length - 1; i >= 0; i--) if (post[i].weg) sag('* ' + (i + 1) + ' EXPUNGE');
            const vorher = post.length;
            k.posteingang = post.filter(m => !m.weg);
            if (k.posteingang.length !== vorher && api && api.onDirty) api.onDirty();
            sag(tag + ' OK EXPUNGE fertig');
            return;
          }
          sag(tag + ' BAD Kenne ich nicht');
        });
      };
    }

    /* ═══ Der POP3-Server (Port 110) ═════════════════════════
       Nur, wenn der Haken „Auch POP3 anbieten" sitzt (siehe Kopf). */

    function popHandler(node) {
      return (conn) => {
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
      };
    }

    /* Bis zu sechs Ports, zwei Sorten: 25 und 143 immer, 110 nur mit
       dem POP3-Haken; 465, 993 (und 995) nur mit Haken UND Zertifikat
       — wie bei den Webservern (`http.httpsSchalten`). */
    function serverAn(node) {
      const c = netz.mailConf(node);
      stack.tcpHoeren(node, SMTP, smtpHandler(node), 'E-Mail-Server');
      stack.tcpHoeren(node, IMAP, imapHandler(node), 'E-Mail-Server');
      if (c.pop3) stack.tcpHoeren(node, POP3, popHandler(node), 'E-Mail-Server');
      else stack.tcpNichtHoeren(node, POP3);
      if (tls && c.https && netz.zertGueltig(node)) {
        tls.hoeren(node, SMTPS, smtpHandler(node), 'E-Mail-Server (TLS)');
        tls.hoeren(node, IMAPS, imapHandler(node), 'E-Mail-Server (TLS)');
        if (c.pop3) tls.hoeren(node, POP3S, popHandler(node), 'E-Mail-Server (TLS)');
        else stack.tcpNichtHoeren(node, POP3S);
      } else {
        for (const p of [SMTPS, IMAPS, POP3S]) stack.tcpNichtHoeren(node, p);
      }
    }
    function serverAus(node) {
      for (const p of [SMTP, IMAP, POP3, SMTPS, IMAPS, POP3S]) stack.tcpNichtHoeren(node, p);
    }

    /* ═══ Die Client-Seite ═══════════════════════════════════
       Ein Gespräch ist eine LISTE von Schritten: auf diese
       Antwort hin jene Zeile. Das ist kurz genug zu lesen und
       zeigt zugleich, was ein Protokoll ist — eine verabredete
       Reihenfolge. */
    /* `opt.tls` verschlüsselt das Gespräch (Servername in `opt.sni`).
       Ein Fehler im Handschlag kommt als Klartext zurück — mit dem
       Hinweis, wo die Vertrauensliste liegt, wenn der Aussteller
       unbekannt ist. */
    const tlsFehler = (err, info) => (info && info.code === 'unbekannt')
      ? err + ' (Die Vertrauensliste verwaltest du im Webbrowser unter „Zertifikate".)' : err;

    function gespraech(node, ip, port, programm, schritte, cb, opt) {
      let i = 0;
      let fertig = false;
      const ende = (fehler) => {
        if (fertig) return;
        fertig = true;
        cb(fehler || null);
      };
      const verbunden = (err, c) => {
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
      };
      const conn = opt && opt.tls && tls
        ? tls.verbinde(node, ip, port, programm, { sni: opt.sni },
            (err, c, info) => verbunden(err && tlsFehler(err, info), c))
        : stack.tcpVerbinde(node, ip, port, programm, verbunden);
      if (conn) conn.onZu(() => ende(fertig ? null : 'Die Verbindung ging zu.'));
      return conn;
    }

    /* Eine Nachricht abschicken: das SMTP-Gespräch von oben. */
    function smtpSenden(node, ip, port, m, cb, programm, opt) {
      const schritte = [
        { erwartet: /^220/, sende: () => 'HELO ' + (node.name || 'rechner') },
        { erwartet: /^250/, sende: () => 'MAIL FROM: <' + m.von + '>' },
        { erwartet: /^250/, sende: () => 'RCPT TO: <' + m.an + '>' },
        { erwartet: /^250/, sende: () => 'DATA' },
        { erwartet: /^354/, sende: () => alsText(m).split(EOL).concat(['.']) },
        { erwartet: /^250/, sende: () => 'QUIT' },
        { erwartet: /^221/, ende: true }
      ];
      return gespraech(node, ip, port, programm || 'E-Mail-Programm', schritte, cb, opt);
    }

    /* Wie spricht dieses Konto — und mit wem (Servername für TLS)? */
    const tlsOpt = (k, wirt) => k.tls ? { tls: true, sni: wirt } : null;
    const portSmtp = (k) => k.smtpPort || (k.tls ? SMTPS : SMTP);
    const portEin  = (k) => k.eingangPort || eingangsPort(k.art, k.tls);
    const istPop   = (k) => k.art === 'pop3';

    /* ═══ Ein IMAP-Gespräch ══════════════════════════════════
       Anders als bei SMTP und POP3 ist das keine feste Liste aus
       „auf diese Antwort jene Zeile": eine Antwort sind hier
       BELIEBIG viele Zeilen mit „*" und am Ende eine mit der Marke
       des Befehls. Dazu kommt das Literal (`{312}`), das sagt, wie
       viele Zeichen Brief jetzt folgen.

       `plan(befehl)` stellt die ersten Befehle in die Schlange;
       `befehl(text, danach)` ruft `danach(zeilen, briefe)`, sobald
       das OK da ist — und `danach` darf weitere Befehle anhängen
       (erst nach dem SEARCH steht fest, was zu holen ist). Am Ende
       kommt von selbst ein LOGOUT. Ein NO oder BAD beendet das
       Gespräch, und der Grund ist die Zeile des Servers. */
    function imapSitzung(node, ip, port, plan, cb, opt) {
      let fertig = false, nr = 0, offen = null, gruss = false, literal = null;
      const schlange = [];
      const ende = (fehler) => {
        if (fertig) return;
        fertig = true;
        cb(fehler || null);
      };
      const befehl = (text, danach) => { schlange.push({ text: text, danach: danach }); };

      const verbunden = (err, c) => {
        if (err) { ende(err); return; }
        const naechster = () => {
          const b = schlange.shift() || { text: 'LOGOUT', logout: true };
          offen = { tag: 'a' + (++nr), b: b, zeilen: [], briefe: [] };
          c.senden(offen.tag + ' ' + b.text + EOL);
        };
        zeilen(c, (zeile) => {
          if (fertig) return;
          // Mitten im Brief: sammeln, bis die angesagte Länge erreicht ist.
          if (literal) {
            literal.zeilen.push(zeile);
            literal.rest -= zeile.length + EOL.length;
            if (literal.rest <= 0) {
              if (offen) offen.briefe.push({ kopf: literal.kopf, text: literal.zeilen.join(EOL) });
              literal = null;
            }
            return;
          }
          if (!gruss) {
            gruss = true;
            if (!/^\* OK/.test(zeile)) { ende(zeile); return; }
            plan(befehl);
            naechster();
            return;
          }
          if (!offen) return;
          const lit = /^\*.*\{(\d+)\}$/.exec(zeile);
          if (lit) { literal = { kopf: zeile, rest: +lit[1], zeilen: [] }; return; }
          if (zeile.indexOf(offen.tag + ' ') !== 0) { offen.zeilen.push(zeile); return; }

          const o = offen;
          offen = null;
          if (!/^\S+ OK\b/.test(zeile)) {
            // NO oder BAD: Gespräch vorbei, Verbindung zu (sonst stünde sie in netstat weiter offen).
            ende(zeile);
            c.schliessen();
            return;
          }
          if (o.b.logout) { ende(null); return; }
          if (o.b.danach) o.b.danach(o.zeilen, o.briefe);
          if (!fertig) naechster();
        });
      };
      const conn = opt && opt.tls && tls
        ? tls.verbinde(node, ip, port, 'E-Mail-Programm', { sni: opt.sni },
            (err, c, info) => verbunden(err && tlsFehler(err, info), c))
        : stack.tcpVerbinde(node, ip, port, 'E-Mail-Programm', verbunden);
      if (conn) conn.onZu(() => ende(fertig ? null : 'Die Verbindung ging zu.'));
      return conn;
    }

    const imapLogin = (k) => 'LOGIN ' + imapWort(k.benutzer || '') + ' ' + imapWort(k.passwort || '');

    /* ─── Der Spiegel ─────────────────────────────────────────
       Bei IMAP ist der Posteingang des Programms ein SPIEGEL des
       Postfachs auf dem Server: jede Nachricht darin trägt ihre
       UID. Nachrichten OHNE UID hat früher POP3 abgeholt — die gibt
       es nur noch auf diesem Gerät, und sie bleiben stehen.

       ⚠️ Der Spiegel gehört zu EINEM Postfach. Wer Server oder
       Benutzer wechselt, darf die UIDs des alten nicht behalten:
       UID 3 auf dem neuen Server ist eine ganz andere Nachricht. */
    const spiegelVon = (k) => (String(k.eingang || '') + '|' + String(k.benutzer || '')).toLowerCase();
    function spiegelLeeren(k) {
      k.posteingang = (k.posteingang || []).filter(m => !m.uid);
      k.spiegel = '';
    }

    /* ─── Was die Oberfläche ruft ─────────────────────────────*/

    function senden(node, m, cb) {
      const k = netz.mailKonto(node);
      if (!k.adresse || !k.smtp) { cb('Es ist noch kein Konto eingerichtet.'); return; }
      const brief = { von: k.adresse, an: m.an, betreff: m.betreff, text: m.text };
      zumServer(node, k.smtp, portSmtp(k), (fehler, ip, port, wirt) => {
        if (fehler) { cb(fehler); return; }
        smtpSenden(node, ip, port, brief, (f) => {
          if (!f) {
            k.gesendet = k.gesendet || [];
            k.gesendet.push(Object.assign({ zeit: engine.now }, brief));
          }
          cb(f);
        }, null, tlsOpt(k, wirt));
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

         IMAP   LOGIN (bei POP3: USER/PASS) — die einzige echte
                Anmeldung, die es hier gibt. Falsches Passwort →
                „a1 NO Benutzer oder Passwort falsch" (bei POP3
                „-ERR …").
         SMTP   HELO/MAIL FROM/RCPT TO auf die EIGENE Adresse.
                SMTP kennt kein AUTH (auch im echten Leben erst
                seit RFC 2554); was es beantwortet, ist „bedient
                dieser Server diese Domain und kennt er dieses
                Konto" — mit „550 Empfänger unbekannt", wenn
                nicht.

       (Damals hieß der erste Teil noch POP3; seit 2026-10-25 ist
       es IMAP, POP3 nur noch, wenn das Konto darauf steht.)

       ⚠️ Der Grund für die zweite Hälfte: IMAP allein prüft nur
       das Lesen. Wer sich anmeldet und dann nicht senden kann,
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
        : !k.eingang ? (istPop(k) ? 'der POP3-Server' : 'der IMAP-Server')
        : !k.smtp ? 'der SMTP-Server' : null;
      if (fehlt) { cb('Es fehlt noch ' + fehlt + '.'); return; }

      const adresse = adresseVon(k);

      /* Der erste Teil: bei IMAP `LOGIN` (und gleich wieder
         `LOGOUT`), bei POP3 `USER`/`PASS`/`QUIT`. */
      const eingangPruefen = (ip, port, opt, fertig) => istPop(k)
        ? gespraech(node, ip, port, 'E-Mail-Programm', [
            { erwartet: /^\+OK/, sende: () => 'USER ' + k.benutzer },
            { erwartet: /^\+OK/, sende: () => 'PASS ' + k.passwort },
            { erwartet: /^\+OK/, sende: () => 'QUIT' },
            { erwartet: /^\+OK/, ende: true }
          ], fertig, opt)
        : imapSitzung(node, ip, port, (befehl) => befehl(imapLogin(k)), fertig, opt);

      zumServer(node, k.eingang, portEin(k), (f1, ip1, port1, wirt1) => {
        if (f1) { cb(f1); return; }
        eingangPruefen(ip1, port1, tlsOpt(k, wirt1), (f2) => {
          if (f2) { cb(f2); return; }
          zumServer(node, k.smtp, portSmtp(k), (f3, ip2, port2, wirt2) => {
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
            }, tlsOpt(k, wirt2));
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

    /* „E-Mails abrufen". Bei IMAP: nachsehen, was auf dem Server
       liegt, das Neue holen, das dort Gelöschte hier wegnehmen —
       auf dem Server bleibt alles. Bei POP3: alles holen und dort
       löschen. */
    function abholen(node, cb) {
      const k = netz.mailKonto(node);
      if (!k.adresse || !k.eingang) { cb('Es ist noch kein Konto eingerichtet.'); return; }
      zumServer(node, k.eingang, portEin(k), (fehler, ip, port, wirt) => {
        if (fehler) { cb(fehler); return; }
        if (!istPop(k)) { imapAbholen(node, ip, port, k, cb, tlsOpt(k, wirt)); return; }
        // POP3 kennt keine UIDs: ein alter IMAP-Spiegel würde doppelt dastehen.
        spiegelLeeren(k);
        holeSchleife(node, ip, port, k, (f, neue) => {
          if (!f && neue && neue.length) {
            k.posteingang = (k.posteingang || []).concat(neue);
          }
          cb(f, neue ? neue.length : 0);
        }, tlsOpt(k, wirt));
      });
    }

    function imapAbholen(node, ip, port, k, cb, opt) {
      if (k.spiegel !== spiegelVon(k)) { spiegelLeeren(k); k.spiegel = spiegelVon(k); }
      let aufServer = null;
      const geholt = new Map();
      imapSitzung(node, ip, port, (befehl) => {
        befehl(imapLogin(k));
        befehl('SELECT INBOX');
        befehl('UID SEARCH ALL', (antwort) => {
          const z = antwort.find(x => /^\* SEARCH\b/.test(x)) || '* SEARCH';
          aufServer = z.split(/\s+/).slice(2).map(Number).filter(n => n > 0);
          const bekannt = new Set((k.posteingang || []).filter(m => m.uid).map(m => m.uid));
          const neu = aufServer.filter(u => !bekannt.has(u));
          /* ⭐ Nur das Neue wird geholt. Beim zweiten Abrufen steht
             im Mitschnitt deshalb kein Brief mehr — nur die Frage
             „was liegt da?" und die Antwort. */
          if (neu.length) befehl('UID FETCH ' + neu.join(',') + ' (BODY[])', (z2, briefe) => {
            for (const b of briefe) {
              const u = /UID (\d+)/.exec(b.kopf);
              if (u) geholt.set(+u[1], Object.assign({ uid: +u[1], zeit: engine.now }, ausText(b.text)));
            }
          });
        });
      }, (f) => {
        if (f || !aufServer) { cb(f || 'Der Server hat das Postfach nicht gezeigt.', 0); return; }
        const alt = new Map((k.posteingang || []).filter(m => m.uid).map(m => [m.uid, m]));
        const lokal = (k.posteingang || []).filter(m => !m.uid);
        /* Reihenfolge wie auf dem Server. Was dort fehlt, ist woanders
           gelöscht worden — und fehlt jetzt auch hier. */
        const spiegel = aufServer.map(u => alt.get(u) || geholt.get(u)).filter(Boolean);
        k.posteingang = lokal.concat(spiegel);
        cb(null, geholt.size);
      }, opt);
    }

    /* Eine Nachricht löschen. Bei IMAP auf dem SERVER (markieren,
       aufräumen) — und damit auf jedem Gerät, das dieses Postfach
       zeigt. Was POP3 schon abgeholt hat, liegt nur noch hier; das
       wird nur hier gelöscht, ohne Gespräch. */
    function loeschen(node, m, cb) {
      const k = netz.mailKonto(node);
      const weg = () => { k.posteingang = (k.posteingang || []).filter(x => x !== m); };
      if (!m || !m.uid || istPop(k)) { weg(); cb(null, false); return; }
      zumServer(node, k.eingang, portEin(k), (fehler, ip, port, wirt) => {
        if (fehler) { cb(fehler); return; }
        imapSitzung(node, ip, port, (befehl) => {
          befehl(imapLogin(k));
          befehl('SELECT INBOX');
          befehl('UID STORE ' + m.uid + ' +FLAGS (\\Deleted)');
          befehl('EXPUNGE');
        }, (f) => {
          if (!f) weg();
          cb(f, true);
        }, tlsOpt(k, wirt));
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
    function holeSchleife(node, ip, port, k, cb, opt) {
      const neue = [];
      let gesamt = 0, geholt = 0, zustand = 'start', sammeln = null, fertig = false;
      const ende = (f) => { if (!fertig) { fertig = true; cb(f, neue); } };

      const verbunden = (err, c) => {
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
      };
      const conn = opt && opt.tls && tls
        ? tls.verbinde(node, ip, port, 'E-Mail-Programm', { sni: opt.sni },
            (err, c, info) => verbunden(err && tlsFehler(err, info), c))
        : stack.tcpVerbinde(node, ip, port, 'E-Mail-Programm', verbunden);
      if (conn) conn.onZu(() => ende(null));
      return conn;
    }

    /* Name oder Adresse — wie beim Browser. */
    function zumServer(node, wirt, port, cb) {
      if (window.NetUtil.ip2int(wirt) !== null) { cb(null, wirt, port, wirt); return; }
      if (!api.resolve) { cb('Dieses Gerät kann keine Namen auflösen.'); return; }
      api.resolve(node, wirt, (r) => {
        if (r.ok) cb(null, r.ip, port, wirt);
        else cb(r.why || ('Der Name „' + wirt + '" ist nicht aufzulösen.'));
      });
    }

    return {
      SMTP, IMAP, POP3, SMTPS, IMAPS, POP3S, eingangsPort,
      laeuft, serverAn, serverAus, senden, abholen, loeschen, spiegelLeeren,
      anmelden, abmelden, adresseVon, smtpSenden, zumServer,
      alsText, ausText, konten, konto, domainVon, benutzerVon
    };
  }

  window.Mail = { erzeugen: erzeugen, SMTP: SMTP, IMAP: IMAP, POP3: POP3,
                  SMTPS: SMTPS, IMAPS: IMAPS, POP3S: POP3S, eingangsPort: eingangsPort };
})();
