/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — http.js   ·   Webserver und das Holen einer
   Seite
   ══════════════════════════════════════════════════════════════
   Der Punkt, an dem der Simulator zum ersten Mal zeigt, was ein
   Kind täglich tut. Alles, was dafür nötig war, steht schon da:
   TCP (`tcp.js`), das Dateisystem (`dateien.js`) und der
   Namensauflöser (`dienste.js`).

   ── Eine Seite sind MEHRERE Anfragen ──────────────────────────
   Das ist die Lernaussage dieser Datei, und sie ist der Grund,
   warum die Standardseite aus DREI Dateien besteht: `index.html`
   holt sich über `<link>` noch die Stildatei und über `<img>` das
   Bild. Im Mitschnitt stehen drei GET-Zeilen untereinander. Fehlt
   das Bild, sagt genau EINE davon `404` — und der Rest der Seite
   steht trotzdem da. Diese Erfahrung hat ein Kind sonst nur als
   kaputtes Bildsymbol im echten Browser, ohne zu wissen, warum.

   ── Eine Verbindung je Anfrage (HTTP/1.0) ─────────────────────
   Der Server schließt, sobald er geantwortet hat. Echte Browser
   halten die Verbindung offen und holen mehrere Dateien darüber
   (HTTP/1.1), und Filius macht es wie hier.

   ⚠️ Der Preis steht im Mitschnitt: drei Dateien sind dreimal
   Handschlag, Frage, Antwort und Abbau. Der Gewinn ist, dass
   „aufbauen · fragen · antworten · schließen" eine vollständige
   Geschichte ist, die man dreimal nebeneinander lesen kann —
   und dass die Verbindung genau einer Anfrage entspricht. Wer
   das ändert, muss vorher den Mitschnitt entlasten (siehe
   UEBERGABE.md, Abschnitt 3).

   ── Was bewusst fehlt ─────────────────────────────────────────
   Virtuelle Hosts (mehrere Domains auf einer Adresse — Filius
   kann das), die Plug-in-Schnittstelle, POST und Formulare,
   Umleitungen, Zwischenspeicher, Keks-Krümel. Der `Host:`-Kopf
   wird mitgeschickt und angezeigt, aber nicht ausgewertet: er ist
   die Antwort auf „woher weiß der Server, welche Seite gemeint
   ist, wenn er mehrere hat" — und diese Frage stellt sich erst
   mit virtuellen Hosts.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const PORT = 80;
  const ORDNER = '/webserver';          // wie in Filius (`WebServer.java`)
  const START = 'index.html';

  /* Welcher Inhaltstyp gehört zu welcher Endung? Nur das, was in
     diesem Programm vorkommen kann — eine abgeschriebene Liste
     aus dem Netz hülfe niemandem. */
  /* ⚠️ `svg`, `gif` und `webp` fehlten hier, obwohl `dateien.js` sie
     als Bildendungen kennt — ein eingeführtes GIF im Ordner des
     Webservers wäre ohne Inhaltstyp ausgeliefert worden. Seit die
     eingebauten Bilder als `.svg` in `/Bilder` liegen, ist genau
     das der Normalfall: eines davon in den Webserver-Ordner zu
     kopieren ist der kürzeste Weg zu einer Seite mit Bild. */
  const TYPEN = {
    html: 'text/html', htm: 'text/html', css: 'text/css', txt: 'text/plain',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp',
    svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp'
  };

  const STATUS_TEXT = { 200: 'OK', 400: 'Bad Request', 404: 'Not Found',
                        501: 'Not Implemented' };

  /* ─── Die Standardseite ───────────────────────────────────────
     Sie entsteht bei der INSTALLATION, wie in Filius („Diese Seite
     wurde automatisch mit der Installation des Webservers
     eingerichtet"). Das ist keine vorweggenommene Antwort, sondern
     die Eigenschaft des Programms: sie beantwortet „läuft der
     Server überhaupt", nicht eine Aufgabe.

     ⚠️ Eigener Text und eigenes Bild, nicht der von Filius
     abgeschrieben: eine mitgelieferte Seite ist Inhalt und nicht
     Bedienmodell, und GPL-Text gehört nicht in unsere
     Auslieferung.

     Drei Dateien statt Filius' zwei — die Stildatei ist der Grund,
     aus dem der Browser ein zweites Mal fragt. */
  const SEITE =
    '<html>\n'
    + '  <head>\n'
    + '    <title>Startseite</title>\n'
    + '    <link rel="stylesheet" href="stil.css">\n'
    + '  </head>\n'
    + '  <body>\n'
    + '    <h1>Der Webserver läuft.</h1>\n'
    + '    <p>Diese Seite liegt als Datei auf diesem Rechner, im Ordner\n'
    + '       <b>/webserver</b>. Öffne sie im Datei-Explorer und schreib sie um.</p>\n'
    + '    <p><img src="logo.png" alt="Schule"></p>\n'
    + '  </body>\n'
    + '</html>\n';

  const STIL =
    'body  { font-family: sans-serif; background: #eef3fb; color: #1e2536;\n'
    + '        margin: 24px; }\n'
    + 'h1    { color: #2a6df4; }\n'
    + 'img   { border: 4px solid #ffffff; border-radius: 8px; }\n';

  function erzeugen(engine, netz, stack, dienste) {
    const D = window.Dateien;

    /* Installiert UND gestartet UND das Gerät an — die Bedingung
       steht in `netz.dienstLaeuft`, weil die Fläche dieselbe
       Auskunft für ihre Marke unter der Kachel braucht. */
    const laeuft = (node) => netz.dienstLaeuft(node, 'web');

    /* Das Protokoll der Anfragen liegt auf `node.state` und nicht
       im Speicherformat: es ist Laufzeitwissen wie die ARP-Tabelle
       — wer einen Stand lädt, fängt mit einem leeren Protokoll an. */
    function log(node) {
      const s = node.state || (node.state = {});
      if (!s.httpLog) s.httpLog = [];
      return s.httpLog;
    }

    function notieren(node, zeile) {
      const l = log(node);
      l.push(zeile);
      if (l.length > 60) l.splice(0, l.length - 60);
    }

    /* ═══ Der Server ═════════════════════════════════════════ */

    function serverAn(node) {
      stack.tcpHoeren(node, PORT, (conn) => {
        let puffer = '';
        conn.onDaten((text) => {
          puffer += text;
          // Der Kopf ist zu Ende, wenn eine Leerzeile kommt.
          if (puffer.indexOf('\r\n\r\n') < 0) return;
          const anfrage = puffer;
          puffer = '';
          antworten(node, conn, anfrage);
        });
      }, 'Webserver');
    }

    const serverAus = (node) => stack.tcpNichtHoeren(node, PORT);

    function antworten(node, conn, roh) {
      const kopf = zerlegeAnfrage(roh);
      if (!kopf) { senden(node, conn, 400, 'text/plain', 'Diese Anfrage verstehe ich nicht.'); return; }
      if (kopf.methode !== 'GET') {
        notieren(node, kopf.methode + ' ' + kopf.pfad + '  →  501');
        senden(node, conn, 501, 'text/plain', 'Nur GET kann dieser Server.');
        return;
      }

      /* „/" meint die Startseite — wie überall. Das ist der ganze
         Unterschied zwischen einer Adresse, die ein Mensch tippt,
         und einem Dateinamen. */
      let pfad = kopf.pfad;
      if (pfad === '/' || pfad === '') pfad = '/' + START;
      const datei = D.normieren(ORDNER + pfad);

      /* Kein Ausbruch aus dem Ordner: `/../geheim.txt` darf nicht
         die Dateien des Rechners preisgeben. `normieren` löst „.."
         schon auf, geprüft wird das Ergebnis. */
      if (datei !== ORDNER && datei.indexOf(ORDNER + '/') !== 0) {
        notieren(node, 'GET ' + kopf.pfad + '  →  404');
        senden(node, conn, 404, 'text/html', fehlerSeite(404));
        return;
      }

      const art = D.art(node, datei);
      if (art === null || art === 'ordner') {
        notieren(node, 'GET ' + kopf.pfad + '  →  404');
        senden(node, conn, 404, 'text/html', fehlerSeite(404));
        return;
      }

      const e = D.lesen(node, datei);
      const inhalt = art === 'bild' ? (D.bildQuelle(e.bild) || '') : String(e.text || '');
      const typ = art === 'bild' ? (TYPEN[D.endung(datei)] || 'image/png')
                                 : (TYPEN[D.endung(datei)] || 'text/plain');
      notieren(node, 'GET ' + kopf.pfad + '  →  200  (' + inhalt.length + ' Byte)');
      senden(node, conn, 200, typ, inhalt);
    }

    function senden(node, conn, status, typ, koerper) {
      const antwort = 'HTTP/1.1 ' + status + ' ' + (STATUS_TEXT[status] || '') + '\r\n'
        + 'Content-Type: ' + typ + '\r\n'
        + 'Content-Length: ' + koerper.length + '\r\n'
        + '\r\n' + koerper;
      conn.senden(antwort);
      // HTTP/1.0: der Server macht zu, sobald er geantwortet hat.
      conn.schliessen();
    }

    function zerlegeAnfrage(roh) {
      const zeilen = String(roh).split('\r\n');
      const m = /^([A-Z]+)\s+(\S+)\s+HTTP\/[\d.]+$/.exec(zeilen[0] || '');
      if (!m) return null;
      const kopf = { methode: m[1], pfad: m[2], host: '' };
      for (const z of zeilen.slice(1)) {
        const h = /^Host:\s*(.+)$/i.exec(z);
        if (h) kopf.host = h[1].trim();
      }
      return kopf;
    }

    /* ─── Die Fehlerseite ─────────────────────────────────────
       Aufbau aus Filius' Vorlage `tmpl/http_fehler_de_DE.txt`:
       die Meldung als Überschrift, darunter ein Satz mit dem
       Statuscode. Der Code steht dabei, weil er die Zahl ist, die
       ein Kind später im echten Netz wiedersieht. */
    const fehlerSeite = (status) =>
      '<html><head><title>Fehler ' + status + '</title></head><body>'
      + '<h1>' + (STATUS_TEXT[status] || 'Fehler') + '</h1>'
      + '<p>Es ist ein Fehler aufgetreten (HTTP-Status: ' + status + ')</p>'
      + '</body></html>';

    /* ═══ Der Browser: eine Datei holen ══════════════════════ */

    /* `www.schule.de:8080/unterordner/seite.html` in seine drei
       Teile. Ohne Port ist es 80 — das ist eine Eigenschaft von
       HTTP und keine Entscheidung, die jemand treffen müsste. */
    function zerlegeAdresse(text) {
      let s = String(text || '').trim();
      if (!s) return null;
      s = s.replace(/^https?:\/\//i, '');
      const schraeg = s.indexOf('/');
      const wirt = schraeg < 0 ? s : s.slice(0, schraeg);
      const pfad = schraeg < 0 ? '/' : s.slice(schraeg);
      const doppel = wirt.lastIndexOf(':');
      const host = doppel > 0 ? wirt.slice(0, doppel) : wirt;
      const port = doppel > 0 ? parseInt(wirt.slice(doppel + 1), 10) : PORT;
      if (!host) return null;
      if (!(port > 0 && port < 65536)) return null;
      return { host: host, port: port, pfad: pfad || '/' };
    }

    /* Name oder Adresse? Eine Zahlenadresse geht direkt, ein Name
       über den Auflöser — und genau deshalb ist der Webbrowser das
       Programm, an dem sich zeigt, wozu DNS gut ist. */
    function aufloesen(node, host, cb) {
      if (window.NetUtil.ip2int(host) !== null) { cb(null, host); return; }
      if (!dienste) { cb('Dieses Gerät kann keine Namen auflösen.', null); return; }
      dienste.resolve(node, host, (r) => {
        if (r.ok) cb(null, r.ip);
        else cb(r.why || ('Der Name „' + host + '" ist nicht aufzulösen.'), null);
      });
    }

    /* EINE Datei holen: Verbindung, GET, Antwort, fertig. */
    function holen(node, ziel, cb) {
      aufloesen(node, ziel.host, (fehler, ip) => {
        if (fehler) { cb({ ok: false, grund: fehler }); return; }
        let fertig = false;
        const conn = stack.tcpVerbinde(node, ip, ziel.port, 'Webbrowser', (err, c) => {
          if (err) {
            if (!fertig) { fertig = true; cb({ ok: false, grund: 'Server konnte nicht erreicht werden!' }); }
            return;
          }
          let puffer = '';
          c.onDaten((text) => {
            puffer += text;
            const antwort = zerlegeAntwort(puffer);
            if (!antwort) return;            // noch nicht vollständig
            if (fertig) return;
            fertig = true;
            c.schliessen();
            cb({ ok: true, status: antwort.status, typ: antwort.typ,
                 koerper: antwort.koerper, von: ip });
          });
          c.senden('GET ' + ziel.pfad + ' HTTP/1.1\r\n'
                 + 'Host: ' + ziel.host + '\r\n'
                 + 'Connection: close\r\n\r\n');
        });
        if (conn) conn.onZu((grund) => {
          if (fertig) return;
          fertig = true;
          cb({ ok: false, grund: grund || 'Die Verbindung wurde geschlossen, bevor etwas kam.' });
        });
      });
    }

    function zerlegeAntwort(roh) {
      const i = String(roh).indexOf('\r\n\r\n');
      if (i < 0) return null;
      const kopf = roh.slice(0, i).split('\r\n');
      const m = /^HTTP\/[\d.]+\s+(\d+)/.exec(kopf[0] || '');
      if (!m) return null;
      let typ = 'text/plain', laenge = null;
      for (const z of kopf.slice(1)) {
        const t = /^Content-Type:\s*(.+)$/i.exec(z);
        if (t) typ = t[1].trim();
        const l = /^Content-Length:\s*(\d+)$/i.exec(z);
        if (l) laenge = parseInt(l[1], 10);
      }
      const koerper = roh.slice(i + 4);
      if (laenge != null && koerper.length < laenge) return null;   // noch unterwegs
      return { status: parseInt(m[1], 10), typ: typ, koerper: koerper };
    }

    /* ═══ Eine ganze SEITE holen ═════════════════════════════
       Erst das HTML, dann alles, was darin steht. Der Rückruf
       bekommt eine fertige Seite und die Liste dessen, was dafür
       geholt wurde — die Liste ist im Unterricht die halbe Miete. */
    function seiteHolen(node, adresse, cb) {
      const ziel = zerlegeAdresse(adresse);
      if (!ziel) { cb({ ok: false, grund: 'Das ist keine gültige Adresse.' }); return; }

      holen(node, ziel, (r) => {
        if (!r.ok) { cb({ ok: false, grund: r.grund, ziel: ziel }); return; }
        const teile = [{ pfad: ziel.pfad, status: r.status, typ: r.typ, laenge: r.koerper.length }];

        if (r.status !== 200 || !/text\/html/.test(r.typ)) {
          cb({ ok: true, status: r.status, ziel: ziel, teile: teile,
               html: r.status === 200 ? alsSeite(r.typ, r.koerper) : r.koerper });
          return;
        }

        /* Was die Seite noch braucht. Der Ordner der Seite ist der
           Bezug für einen relativen Verweis — `logo.png` neben
           `unterordner/seite.html` meint `unterordner/logo.png`. */
        const basis = ziel.pfad.slice(0, ziel.pfad.lastIndexOf('/') + 1) || '/';
        const offen = verweise(r.koerper).map(v => ({
          v: v, pfad: v.wert.charAt(0) === '/' ? v.wert : window.Dateien.normieren(basis + v.wert)
        }));

        let rest = offen.length;
        if (!rest) { cb(fertigeSeite(r.koerper, [], teile, ziel)); return; }

        const geholt = [];
        for (const o of offen) {
          holen(node, { host: ziel.host, port: ziel.port, pfad: o.pfad }, (t) => {
            geholt.push({ v: o.v, ok: t.ok && t.status === 200, inhalt: t.ok ? t.koerper : '' });
            teile.push({ pfad: o.pfad, status: t.ok ? t.status : 0,
                         typ: t.ok ? t.typ : '—', laenge: t.ok ? t.koerper.length : 0 });
            if (--rest === 0) cb(fertigeSeite(r.koerper, geholt, teile, ziel));
          });
        }
      });
    }

    const fertigeSeite = (quelle, geholt, teile, ziel) => ({
      ok: true, status: 200, ziel: ziel, teile: teile,
      quelle: quelle, html: einsetzen(quelle, geholt)
    });

    /* Etwas, das kein HTML ist, trotzdem zeigen: Text in ein
       <pre>, ein Bild in ein <img>. */
    function alsSeite(typ, koerper) {
      if (/^image\//.test(typ)) return '<html><body><img src="' + koerper + '"></body></html>';
      return '<html><body><pre>' + koerper
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        + '</pre></body></html>';
    }

    /* ─── Was eine Seite nachlädt ─────────────────────────────
       Nur zwei Sorten: `<link href>` für Stildateien und
       `<img src>` für Bilder. Absolute Adressen (`http://…`)
       werden NICHT geholt — dieser Browser kennt nur das
       simulierte Netz, und ein Verweis nach draußen wäre eine
       Anfrage ins echte Internet. */
    function verweise(html) {
      const out = [];
      const re = /<(link|img)\b[^>]*>/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const marke = m[0];
        const attr = m[1].toLowerCase() === 'link' ? 'href' : 'src';
        const w = new RegExp(attr + '\\s*=\\s*"([^"]*)"|' + attr + "\\s*=\\s*'([^']*)'", 'i').exec(marke);
        const wert = w ? (w[1] !== undefined ? w[1] : w[2]) : '';
        if (!wert || /^[a-z]+:/i.test(wert)) continue;
        if (attr === 'href' && !/stylesheet/i.test(marke)) continue;
        out.push({ marke: marke, attr: attr, wert: wert, art: attr === 'href' ? 'css' : 'bild' });
      }
      return out;
    }

    /* Das Geholte in die Seite einsetzen — und JavaScript
       entfernen.

       ⚠️ Das Entfernen ist NICHT die Sicherung. Die ist der
       `<iframe sandbox>` ohne `allow-scripts` (siehe
       prog-web.js): er führt auch das nicht aus, was hier
       durchrutschen würde. Hier wird das Skript nur sichtbar
       ersetzt, damit die Auskunft „dieser Browser führt kein
       JavaScript aus" an der Stelle steht, an der man sie sucht. */
    function einsetzen(quelle, geholt) {
      let html = String(quelle);
      for (const g of geholt) {
        if (!g.ok) continue;
        if (g.v.art === 'css') html = html.replace(g.v.marke, '<style>' + g.inhalt + '</style>');
        else html = html.replace(g.v.marke,
          g.v.marke.replace(g.v.wert, g.inhalt.replace(/"/g, '&quot;')));
      }
      html = html.replace(/<script\b[\s\S]*?<\/script>/gi,
        '<!-- JavaScript wird von diesem Browser nicht ausgeführt -->');
      return html;
    }

    /* ═══ Bei der Installation ═══════════════════════════════ */

    function standardDateien(node) {
      if (!D.gibt(node, ORDNER)) D.ordnerAnlegen(node, '/', ORDNER.slice(1));
      if (!D.gibt(node, ORDNER + '/' + START)) D.anlegen(node, ORDNER, START, { text: SEITE });
      if (!D.gibt(node, ORDNER + '/stil.css')) D.anlegen(node, ORDNER, 'stil.css', { text: STIL });
      if (!D.gibt(node, ORDNER + '/logo.png')) D.anlegen(node, ORDNER, 'logo.png', { bild: '@schule' });
    }

    return {
      PORT, ORDNER, START,
      laeuft, serverAn, serverAus, holen, seiteHolen, zerlegeAdresse,
      zerlegeAnfrage, zerlegeAntwort, verweise, einsetzen, fehlerSeite,
      standardDateien, zugriffe: log
    };
  }

  window.Http = { erzeugen: erzeugen, SEITE: SEITE, STIL: STIL, PORT: PORT, ORDNER: ORDNER };
})();
