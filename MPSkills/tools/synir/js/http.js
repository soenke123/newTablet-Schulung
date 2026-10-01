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
   warum die Standardseite aus VIER Dateien besteht: `index.html`
   holt sich über `<link>` noch die Stildatei und über `<img>` das
   Bild. Im Mitschnitt stehen vier GET-Zeilen untereinander. Fehlt
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
   kann das), die Plug-in-Schnittstelle, Zwischenspeicher. Der
   `Host:`-Kopf
   wird mitgeschickt und angezeigt, aber nicht ausgewertet: er ist
   die Antwort auf „woher weiß der Server, welche Seite gemeint
   ist, wenn er mehrere hat" — und diese Frage stellt sich erst
   mit virtuellen Hosts.

   ── POST, Cookies, Weiterleitungen (seit 2026-09-30) ──────────
   Der BROWSER kann jetzt Formulare abschicken (`POST` mit Körper
   `feld=wert&…`), sich Cookies merken und einer Weiterleitung
   (301/302/303 mit `Location`) folgen. Der WEBSERVER aus dieser
   Datei bleibt bei GET; POST und Cookies beantwortet der
   Streaming-Server (`stream.js`), der dafür `anfrageLesen`,
   `formLesen` und `senden` von hier benutzt. Grund:
   PLAN-SICHERHEIT, Schritt 2 — es soll im Mitschnitt etwas
   Geheimes geben, das über HTTP läuft.

   ── https:// (seit 2026-10-01, PLAN-SICHERHEIT Schritt 4) ─────
   Dieselbe Anfrage, nur durch die TLS-Schale (`tls.js`): `holen`
   verbindet mit `tls.verbinde`, wenn die Adresse `https://` hat
   (Port 443). Ein Fehler im Handschlag kommt als `{ ok: false,
   tls: { code, text, zertifikat } }` zurück — der Browser macht
   daraus die Warnseite. `ausnahmeMerken` ist „Trotzdem fortfahren".
   Server: `httpsSchalten` öffnet 443 NUR mit Haken UND Zertifikat.
   `pruefAntwort` beantwortet den Prüfbesuch der Zertifizierungsstelle.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const PORT = 80;
  const HTTPS_PORT = 443;
  /* Unter diesem Pfad antwortet ein Server beim Antrag auf ein
     Zertifikat mit dem Einmalwort der Zertifizierungsstelle
     (zs.js) — damit beweist er, dass der Name auf SEIN Gerät zeigt. */
  const PRUEF_PFAD = '/.well-known/zs-pruefung';
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

  const STATUS_TEXT = { 200: 'OK', 302: 'Found', 303: 'See Other', 400: 'Bad Request',
                        401: 'Unauthorized', 404: 'Not Found', 501: 'Not Implemented' };

  /* ─── Die Standardseite ───────────────────────────────────────
     Sie entsteht bei der INSTALLATION, wie in Filius („Diese Seite
     wurde automatisch mit der Installation des Webservers
     eingerichtet"). Das ist keine vorweggenommene Antwort, sondern
     die Eigenschaft des Programms: sie beantwortet „läuft der
     Server überhaupt", nicht eine Aufgabe.

     ⚠️ Eigener Text und eigene Bilder (die Logos von MPSkills und
     SYNIR), nicht der von Filius
     abgeschrieben: eine mitgelieferte Seite ist Inhalt und nicht
     Bedienmodell, und GPL-Text gehört nicht in unsere
     Auslieferung.

     Vier Dateien statt Filius' zwei — die Stildatei ist der Grund,
     aus dem der Browser ein zweites Mal fragt. */
  const SEITE =
    '<html>\n'
    + '  <head>\n'
    + '    <title>Startseite</title>\n'
    + '    <link rel="stylesheet" href="stil.css">\n'
    + '  </head>\n'
    + '  <body>\n'
    + '    <div class="karte">\n'
    + '      <div class="logos">\n'
    + '        <img class="drache" src="mpskills-logo.png" alt="MPSkills">\n'
    + '        <span class="mal">&times;</span>\n'
    + '        <img class="synir" src="synir-logo.png" alt="SYNIR">\n'
    + '      </div>\n'
    + '      <h1>Der Webserver läuft.</h1>\n'
    + '      <p>Diese Seite liegt als Datei auf diesem Rechner, im Ordner\n'
    + '         <b>/webserver</b>. Öffne sie im Datei-Explorer und schreib sie um.</p>\n'
    + '      <p class="fuss">Eine Startseite von MPSkills und SYNIR</p>\n'
    + '    </div>\n'
    + '  </body>\n'
    + '</html>\n';

  const STIL =
    'body   { font-family: sans-serif; color: #1e2536; margin: 0; padding: 24px;\n'
    + '         background: linear-gradient(160deg, #e6f7fb, #eef3fb 55%, #f5eefb); }\n'
    + '.karte { max-width: 560px; margin: 0 auto; padding: 24px 28px; text-align: center;\n'
    + '         background: #ffffff; border-radius: 16px; border-top: 6px solid #2ad0c9;\n'
    + '         box-shadow: 0 6px 20px rgba(30, 37, 54, 0.12); }\n'
    + '.logos { display: flex; align-items: center; justify-content: center; gap: 18px; }\n'
    + '.drache { height: 110px; }\n'
    + '.synir { height: 60px; }\n'
    + '.mal   { font-size: 28px; color: #9aa3b5; }\n'
    + 'h1     { color: #1b2a5c; margin: 18px 0 8px; }\n'
    + '.fuss  { font-size: 13px; color: #6b7488; margin-bottom: 0; }\n';

  function erzeugen(engine, netz, stack, dienste) {
    const D = window.Dateien;
    const tls = dienste && dienste.tls;

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

    function annahme(node) {
      return (conn) => {
        let puffer = '';
        conn.onDaten((text) => {
          puffer += text;
          // Der Kopf ist zu Ende, wenn eine Leerzeile kommt.
          if (puffer.indexOf('\r\n\r\n') < 0) return;
          const anfrage = puffer;
          puffer = '';
          antworten(node, conn, anfrage);
        });
      };
    }

    function serverAn(node) {
      stack.tcpHoeren(node, PORT, annahme(node), 'Webserver');
      httpsSchalten(node, netz.webConf(node), annahme(node), 'Webserver (HTTPS)');
    }

    /* ─── Port 443 ────────────────────────────────────────────────
       Für Webserver UND Streaming-Server dieselbe Regel: HTTPS läuft
       NUR, wenn der Betreiber den Haken gesetzt hat UND das Gerät ein
       Zertifikat hat. Ohne beides hört auf 443 niemand — HTTP ist der
       Standard, HTTPS muss man sich verdienen. Port 80 bleibt in
       jedem Fall offen: man soll beides vergleichen können. */
    function httpsSchalten(node, conf, handler, programm) {
      if (tls && conf && conf.https && netz.zertGueltig(node)) tls.hoeren(node, HTTPS_PORT, handler, programm);
      else stack.tcpNichtHoeren(node, HTTPS_PORT);
    }

    /* Läuft gerade ein Antrag auf ein Zertifikat, lauscht das Gerät
       VORÜBERGEHEND selbst auf Port 80 (zs.js) — `sync()` darf ihm
       das Ohr nicht abdrehen. */
    function serverAus(node) {
      const s = node.state || {};
      if (!s.zsAufgabe) stack.tcpNichtHoeren(node, PORT);
      stack.tcpNichtHoeren(node, HTTPS_PORT);
    }

    /* Das Einmalwort der Zertifizierungsstelle — oder `null`, wenn
       gerade kein Antrag läuft oder der Pfad ein anderer ist. */
    function pruefAntwort(node, pfad) {
      const s = node.state;
      return s && s.zsAufgabe && String(pfad).split('?')[0] === PRUEF_PFAD ? s.zsAufgabe : null;
    }

    function antworten(node, conn, roh) {
      const kopf = zerlegeAnfrage(roh);
      if (!kopf) { senden(node, conn, 400, 'text/plain', 'Diese Anfrage verstehe ich nicht.'); return; }
      const pruef = kopf.methode === 'GET' ? pruefAntwort(node, kopf.pfad) : null;
      if (pruef) {
        notieren(node, 'GET ' + kopf.pfad + '  →  200  (Prüfbesuch der Zertifizierungsstelle)');
        senden(node, conn, 200, 'text/plain', pruef);
        return;
      }
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


    /* ═══ Hilfen, die auch der Streaming-Server braucht ══════ */

    /* Eine vollständige Anfrage aus dem Puffer — oder nichts, solange
       noch etwas fehlt (Kopf nicht zu Ende, Körper kürzer als
       `Content-Length`). Die Cookies stehen als Tabelle da. */
    function anfrageLesen(roh) {
      const text = String(roh);
      const i = text.indexOf('\r\n\r\n');
      if (i < 0) return null;
      const zeilen = text.slice(0, i).split('\r\n');
      const m = /^([A-Z]+)\s+(\S+)\s+HTTP\/[\d.]+$/.exec(zeilen[0] || '');
      if (!m) return { fehler: true };
      const a = { methode: m[1], pfad: m[2], host: '', cookies: {}, laenge: 0, body: '' };
      for (const z of zeilen.slice(1)) {
        const h = /^([A-Za-z-]+):\s*(.*)$/.exec(z);
        if (!h) continue;
        const k = h[1].toLowerCase();
        if (k === 'host') a.host = h[2].trim();
        else if (k === 'content-length') a.laenge = parseInt(h[2], 10) || 0;
        else if (k === 'cookie') h[2].split(/;\s*/).forEach((c) => {
          const g = c.indexOf('=');
          if (g > 0) a.cookies[c.slice(0, g)] = c.slice(g + 1);
        });
      }
      const body = text.slice(i + 4);
      if (body.length < a.laenge) return null;
      a.body = body.slice(0, a.laenge);
      return a;
    }

    /* `user=anna&pass=geheim%21` ↔ { user: 'anna', pass: 'geheim!' }.
       Leerzeichen als „+", wie es ein Browser schickt. */
    const kodiere = (t) => encodeURIComponent(String(t)).replace(/%20/g, '+');
    const dekodiere = (t) => {
      try { return decodeURIComponent(String(t).replace(/\+/g, ' ')); }
      catch (e) { return String(t); }
    };
    function formSchreiben(felder) {
      return Object.keys(felder).map(k => kodiere(k) + '=' + kodiere(felder[k])).join('&');
    }
    function formLesen(text) {
      const out = {};
      String(text || '').split('&').forEach((p) => {
        if (!p) return;
        const g = p.indexOf('=');
        out[dekodiere(g < 0 ? p : p.slice(0, g))] = g < 0 ? '' : dekodiere(p.slice(g + 1));
      });
      return out;
    }

    /* Die Antwort eines Servers als Text. `kopf` sind zusätzliche
       Zeilen (Location, Set-Cookie). */
    function antwortText(status, typ, koerper, kopf) {
      return 'HTTP/1.1 ' + status + ' ' + (STATUS_TEXT[status] || '') + '\r\n'
        + 'Content-Type: ' + typ + '\r\n'
        + (kopf || []).map(z => z + '\r\n').join('')
        + 'Content-Length: ' + koerper.length + '\r\n'
        + '\r\n' + koerper;
    }

    /* ─── Cookies ─────────────────────────────────────────────
       Der Browser eines Geräts merkt sich je Server (Name bzw.
       Adresse und Port), was der ihm mit `Set-Cookie` gegeben hat,
       und schickt es bei JEDER weiteren Anfrage mit. Das steht auf
       `node.state` wie das Zugriffsprotokoll: Laufzeit, nicht
       Speicherformat — wer einen Stand lädt, ist wieder abgemeldet. */
    function cookies(node) {
      const s = node.state || (node.state = {});
      if (!s.cookies) s.cookies = {};
      return s.cookies;
    }
    const cookieKey = (ziel) => String(ziel.host).toLowerCase() + ':' + ziel.port;
    function cookieText(node, ziel) {
      const c = cookies(node)[cookieKey(ziel)] || {};
      return Object.keys(c).map(k => k + '=' + c[k]).join('; ');
    }
    function cookieMerken(node, ziel, setCookie) {
      const teile = String(setCookie).split(';')[0];
      const g = teile.indexOf('=');
      if (g <= 0) return;
      const k = cookieKey(ziel);
      const jar = cookies(node);
      const name = teile.slice(0, g).trim(), wert = teile.slice(g + 1).trim();
      if (!jar[k]) jar[k] = {};
      if (wert === '') delete jar[k][name]; else jar[k][name] = wert;
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
    /* `vorgabe` ('https') gilt, wenn die Adresse keinen Vorsatz hat —
       der Browser trägt ihn aus dem Schloss-Feld vor dem Eingabefeld
       ein. `schema` steht NUR bei https im Ergebnis: http ist der
       Normalfall und braucht kein Feld. */
    function zerlegeAdresse(text, vorgabe) {
      let s = String(text || '').trim();
      if (!s) return null;
      let https = vorgabe === 'https';
      const v = /^(https?):\/\//i.exec(s);
      if (v) { https = v[1].toLowerCase() === 'https'; s = s.slice(v[0].length); }
      const schraeg = s.indexOf('/');
      const wirt = schraeg < 0 ? s : s.slice(0, schraeg);
      const pfad = schraeg < 0 ? '/' : s.slice(schraeg);
      const doppel = wirt.lastIndexOf(':');
      const host = doppel > 0 ? wirt.slice(0, doppel) : wirt;
      const port = doppel > 0 ? parseInt(wirt.slice(doppel + 1), 10) : (https ? HTTPS_PORT : PORT);
      if (!host) return null;
      if (!(port > 0 && port < 65536)) return null;
      const z = { host: host, port: port, pfad: pfad || '/' };
      if (https) z.schema = 'https';
      return z;
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

    /* EINE Datei holen: Verbindung, Frage, Antwort, fertig.
       `opt` (alles freiwillig): `methode` ('GET' oder 'POST') und
       `body` (der fertige Formulartext `feld=wert&…`). Cookies des
       Geräts für diesen Server gehen von selbst mit. */
    /* `opt.ip` (die Zertifizierungsstelle) überspringt die Auflösung:
       sie hat den Namen schon bei IHREM DNS nachgeschlagen und will
       genau diese Adresse besuchen. */
    function holen(node, ziel, cb, opt) {
      opt = opt || {};
      const https = ziel.schema === 'https';
      const los = (fehler, ip) => {
        if (fehler) { cb({ ok: false, grund: fehler }); return; }
        let fertig = false;
        const verbunden = (err, c, info) => {
          if (err) {
            /* Ein Fehler im Handschlag trägt seinen Grund (`info`) —
               die Seite zeigt dafür die Warnung. Alles andere ist
               „nicht erreichbar", wie bei Filius. */
            if (!fertig) {
              fertig = true;
              cb(info ? { ok: false, grund: err, tls: info }
                      : { ok: false, grund: 'Server konnte nicht erreicht werden!' });
            }
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
            if (antwort.cookie) antwort.cookie.forEach(z => cookieMerken(node, ziel, z));
            cb({ ok: true, status: antwort.status, typ: antwort.typ,
                 koerper: antwort.koerper, von: ip, ort: antwort.ort, tls: c.tls || null });
          });
          const methode = opt.methode === 'POST' ? 'POST' : 'GET';
          const body = methode === 'POST' ? String(opt.body || '') : '';
          const ck = cookieText(node, ziel);
          c.senden(methode + ' ' + ziel.pfad + ' HTTP/1.1\r\n'
                 + 'Host: ' + ziel.host + '\r\n'
                 + (ck ? 'Cookie: ' + ck + '\r\n' : '')
                 + (methode === 'POST'
                     ? 'Content-Type: application/x-www-form-urlencoded\r\n'
                       + 'Content-Length: ' + body.length + '\r\n' : '')
                 + 'Connection: close\r\n\r\n' + body);
        };
        const conn = https && tls
          ? tls.verbinde(node, ip, ziel.port, 'Webbrowser',
                         { sni: ziel.host, ausnahme: ausnahme(node, ziel) }, verbunden)
          : stack.tcpVerbinde(node, ip, ziel.port, 'Webbrowser', verbunden);
        if (conn) conn.onZu((grund) => {
          if (fertig) return;
          fertig = true;
          cb({ ok: false, grund: grund || 'Die Verbindung wurde geschlossen, bevor etwas kam.' });
        });
      };
      if (opt.ip) los(null, opt.ip); else aufloesen(node, ziel.host, los);
    }

    /* ─── „Trotzdem fortfahren" ───────────────────────────────────
       Wer eine Zertifikatswarnung wegklickt, bekommt für diesen
       Server (Name und Port) eine Ausnahme — nur auf diesem Gerät
       und nur, solange das Netz läuft (node.state, nicht im
       Speicherformat). Verschlüsselt wird dann weiter; man weiß
       nur nicht mehr, MIT WEM. */
    const ausnahmeKey = (ziel) => String(ziel.host).toLowerCase() + ':' + ziel.port;
    function ausnahme(node, ziel) {
      const s = node.state || (node.state = {});
      return !!(s.tlsAusnahmen && s.tlsAusnahmen[ausnahmeKey(ziel)]);
    }
    function ausnahmeMerken(node, ziel) {
      const s = node.state || (node.state = {});
      if (!s.tlsAusnahmen) s.tlsAusnahmen = {};
      s.tlsAusnahmen[ausnahmeKey(ziel)] = true;
    }

    function zerlegeAntwort(roh) {
      const i = String(roh).indexOf('\r\n\r\n');
      if (i < 0) return null;
      const kopf = roh.slice(0, i).split('\r\n');
      const m = /^HTTP\/[\d.]+\s+(\d+)/.exec(kopf[0] || '');
      if (!m) return null;
      let typ = 'text/plain', laenge = null, ort = '';
      const cookie = [];
      for (const z of kopf.slice(1)) {
        const lo = /^Location:\s*(.+)$/i.exec(z);
        if (lo) ort = lo[1].trim();
        const sc = /^Set-Cookie:\s*(.+)$/i.exec(z);
        if (sc) cookie.push(sc[1].trim());
        const t = /^Content-Type:\s*(.+)$/i.exec(z);
        if (t) typ = t[1].trim();
        const l = /^Content-Length:\s*(\d+)$/i.exec(z);
        if (l) laenge = parseInt(l[1], 10);
      }
      const koerper = roh.slice(i + 4);
      if (laenge != null && koerper.length < laenge) return null;   // noch unterwegs
      return { status: parseInt(m[1], 10), typ: typ, koerper: koerper, ort: ort, cookie: cookie };
    }

    /* ═══ Eine ganze SEITE holen ═════════════════════════════
       Erst das HTML, dann alles, was darin steht. Der Rückruf
       bekommt eine fertige Seite und die Liste dessen, was dafür
       geholt wurde — die Liste ist im Unterricht die halbe Miete. */
    /* `opt` wie bei `holen`. Eine Weiterleitung (301/302/303 mit
       `Location`) folgt der Browser selbst — mit GET und höchstens
       viermal —, und die Liste der Anfragen zeigt jede einzelne. */
    function seiteHolen(node, adresse, cb, opt) {
      const ziel = zerlegeAdresse(adresse);
      if (!ziel) { cb({ ok: false, grund: 'Das ist keine gültige Adresse.' }); return; }
      seite(node, ziel, opt || {}, 0, [], cb);
    }

    function seite(node, ziel, opt, sprung, teile, cb) {
      holen(node, ziel, (r) => {
        if (!r.ok) { cb({ ok: false, grund: r.grund, ziel: ziel, tls: r.tls || null }); return; }
        teile.push({ pfad: ziel.pfad, status: r.status, typ: r.typ, laenge: r.koerper.length,
                     methode: opt.methode === 'POST' ? 'POST' : 'GET', https: ziel.schema === 'https' });

        if ((r.status === 301 || r.status === 302 || r.status === 303) && r.ort && sprung < 4) {
          const neu = zerlegeAdresse(adresseAufloesen(adresseVon(ziel), r.ort) || '');
          if (neu) { seite(node, neu, {}, sprung + 1, teile, cb); return; }
        }

        if (r.status !== 200 || !/text\/html/.test(r.typ)) {
          cb({ ok: true, status: r.status, ziel: ziel, teile: teile, tls: r.tls || null,
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
        if (!rest) { cb(fertigeSeite(r.koerper, [], teile, ziel, r.tls)); return; }

        const geholt = [];
        for (const o of offen) {
          holen(node, { host: ziel.host, port: ziel.port, pfad: o.pfad, schema: ziel.schema }, (t) => {
            geholt.push({ v: o.v, ok: t.ok && t.status === 200, inhalt: t.ok ? t.koerper : '' });
            teile.push({ pfad: o.pfad, status: t.ok ? t.status : 0,
                         typ: t.ok ? t.typ : '—', laenge: t.ok ? t.koerper.length : 0,
                         https: ziel.schema === 'https' });
            if (--rest === 0) cb(fertigeSeite(r.koerper, geholt, teile, ziel, r.tls));
          });
        }
      }, opt);
    }

    /* Die Adresse, wie sie oben im Browser steht (ohne `http://`). */
    /* Bei https steht der Vorsatz dabei, bei http nicht — http ist
       der Normalfall (und so lauteten alle Adressen bisher). */
    const adresseVon = (z) => (z.schema === 'https' ? 'https://' : '') + z.host
      + (z.port !== (z.schema === 'https' ? HTTPS_PORT : PORT) ? ':' + z.port : '') + z.pfad;

    /* Wohin zeigt ein Verweis, gesehen von der Seite `von` aus?
       Absolut (`/filme`), relativ (`konto`) oder mit Adresse
       (`http://…`). Alles andere (`javascript:`, `mailto:` …) ist
       keine Seite in diesem Netz und gibt nichts zurück. */
    function adresseAufloesen(von, href) {
      const h = String(href || '').trim();
      if (!h || h.charAt(0) === '#') return null;
      if (/^https:\/\//i.test(h)) return h;
      if (/^http:\/\//i.test(h)) return h.replace(/^http:\/\//i, '');
      if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null;
      const z = zerlegeAdresse(von);
      if (!z) return null;
      const pfad = h.charAt(0) === '/' ? h
        : window.Dateien.normieren(
            (z.pfad.slice(0, z.pfad.lastIndexOf('/') + 1) || '/') + h);
      return adresseVon({ schema: z.schema, host: z.host, port: z.port, pfad: pfad });
    }

    const fertigeSeite = (quelle, geholt, teile, ziel, tlsInfo) => ({
      ok: true, status: 200, ziel: ziel, teile: teile, tls: tlsInfo || null,
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
      if (!D.gibt(node, ORDNER + '/mpskills-logo.png')) D.anlegen(node, ORDNER, 'mpskills-logo.png', { bild: '@drache' });
      if (!D.gibt(node, ORDNER + '/synir-logo.png')) D.anlegen(node, ORDNER, 'synir-logo.png', { bild: '@synir' });
    }

    return {
      PORT, ORDNER, START,
      HTTPS_PORT, PRUEF_PFAD, httpsSchalten, pruefAntwort, ausnahme, ausnahmeMerken,
      laeuft, serverAn, serverAus, holen, seiteHolen, zerlegeAdresse,
      zerlegeAnfrage, zerlegeAntwort, verweise, einsetzen, fehlerSeite,
      anfrageLesen, formLesen, formSchreiben, antwortText, cookies,
      adresseVon, adresseAufloesen,
      standardDateien, zugriffe: log
    };
  }

  window.Http = { erzeugen: erzeugen, SEITE: SEITE, STIL: STIL, PORT: PORT, HTTPS_PORT: HTTPS_PORT, ORDNER: ORDNER };
})();
