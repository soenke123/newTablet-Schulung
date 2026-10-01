/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — stream.js   ·   Der Streaming-Server
   ══════════════════════════════════════════════════════════════
   PLAN-SICHERHEIT, Schritt 2: eine Web-Anwendung mit Anmeldung,
   damit es im Mitschnitt etwas Geheimes gibt, das über HTTP läuft.
   Der Dienst ist ein Netflix-/Spotify-artiger Filmkatalog:

     /                 Startseite mit „Anmelden" und „Registrieren"
     /registrieren     Formular: Name, E-Mail, IBAN, BIC (ausgedacht!)
     /anmelden         Formular: E-Mail und Passwort
     /filme            die Filme des Betreibers — nur mit Anmeldung
     /konto            „Mein Konto": die gespeicherten Bankdaten
     /plakat/N.svg     die Plakate (ohne Anmeldung, wie Bilder so sind)

   ── Was dabei im Mitschnitt steht ─────────────────────────────
   ALLES im Klartext: `POST /registrieren` mit `iban=DE…`, `POST
   /anmelden` mit `passwort=…`, danach bei jeder Anfrage das
   `Cookie: sid=…`. Das ist Absicht und die Lernaussage: wer an der
   Leitung sitzt, liest mit. Schritt 4 (HTTPS) schließt genau das:
   mit Haken und Zertifikat lauscht der Server zusätzlich auf Port 443
   (`http.httpsSchalten`) — Port 80 bleibt daneben offen.

   ── Das Passwort kommt per E-Mail ─────────────────────────────
   Der Server wählt es selbst und schickt es über den Mailserver,
   den der Betreiber im Fenster einträgt (SMTP, `mail.smtpSenden`).
   Abgeholt wird es im E-Mail-Programm des Kunden (POP3). Ist kein
   Mailserver eingetragen oder nimmt der die Post nicht an, sagt die
   Seite es in Klartext — der Kunde sieht WARUM, und das Konto
   entsteht nicht.

   ── Bewusst nicht gebaut ──────────────────────────────────────
   Konten ändern oder löschen, „Passwort vergessen", eigene Filme
   eintragen. Die vier Filme sind fest, der Betreiber wählt, welche
   zwei angeboten werden.

   ⚠️ Port 80 teilt sich dieser Dienst mit dem Webserver — es kann
   nur einer von beiden laufen (Fenster und `dienste.sync` sorgen
   dafür). Konten, Likes und Kommentare stehen im Speicherformat
   (`node.streamServer`); die Sitzungen (Cookies) nicht — wer einen
   Stand lädt, ist wieder abgemeldet.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const PORT = 80;
  const esc = (t) => window.NetUtil.escapeHtml(t);

  /* Die vier Filme. Plakat = Bild als Daten-URI (`bild`, aus filme.js);
     fehlt die Datei, zeichnet `plakat()` einen Verlauf mit dem Titel. */
  const PL = window.FilmPlakate || {};
  const FILME = [
    { id: 1, titel: 'Chicken Park',     bild: PL[1], farben: ['#d97706', '#ef4444'] },
    { id: 2, titel: 'Herr der Dinge',   bild: PL[2], farben: ['#6d28d9', '#ec4899'] },
    { id: 3, titel: 'König der Möwen',  bild: PL[3], farben: ['#0284c7', '#22d3ee'] },
    { id: 4, titel: 'Titanic 3',        bild: PL[4], farben: ['#059669', '#a3e635'] }
  ];
  const film = (id) => FILME.find(f => f.id === +id) || null;

  function plakat(f) {
    if (f.bild) return f.bild;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">'
      + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="' + f.farben[0] + '"/><stop offset="1" stop-color="' + f.farben[1] + '"/>'
      + '</linearGradient></defs><rect width="300" height="420" fill="url(#g)"/>'
      + '<text x="150" y="230" font-family="sans-serif" font-size="34" font-weight="700" '
      + 'fill="#ffffff" text-anchor="middle">' + esc(f.titel) + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  const WOERTER = ['Fuchs', 'Mond', 'Stern', 'Wolke', 'Tiger', 'Pixel', 'Zebra', 'Komet'];
  function neuesPasswort() {
    return WOERTER[Math.floor(Math.random() * WOERTER.length)] + (10 + Math.floor(Math.random() * 90));
  }
  function neueSitzung() {
    let s = '';
    for (let i = 0; i < 12; i++) s += Math.floor(Math.random() * 36).toString(36);
    return s;
  }

  const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'streaming';

  /* ─── Aussehen der Seiten ─────────────────────────────────────
     Eine Stildatei im Kopf jeder Seite (kein eigener Abruf): die
     Seiten sind dynamisch, eine Datei im Ordner gibt es nicht. */
  /* Drei Farbschemata zur Wahl des Betreibers (`streamServer.farbe`).
     Jedes ist nur eine Reihe von Farbwerten; die Form der Seiten
     bleibt gleich. `akz` = Hauptfarbe (Marke, Knöpfe), `akzT` = Schrift
     darauf, `fl` = Seitengrund, `kopf` = Kopfzeile, `kart` = Kacheln,
     `t` / `t2` = Schrift / blasse Schrift, `lin` = Linien, `ein` =
     Eingabefelder, `grau` = zweite Knöpfe. */
  const FARBEN = [
    { id: 'kino',  name: 'Kino-Rot',    akz: '#e50914', akzT: '#fff',    fl: '#141414', kopf: '#0b0b0b', kart: '#1f1f1f',
      t: '#f2f2f2', t2: '#c8c8c8', lin: '#333', ein: '#2b2b2b', einL: '#444', grau: '#3a3a3a', grauT: '#fff',
      feh: '#4a1518', ok: '#14361f' },
    { id: 'ozean', name: 'Ozean-Blau',  akz: '#22b8e0', akzT: '#04202b', fl: '#0b1a2e', kopf: '#071222', kart: '#13294a',
      t: '#eaf4ff', t2: '#a9c3df', lin: '#24406a', ein: '#0f2340', einL: '#35588a', grau: '#2a4670', grauT: '#fff',
      feh: '#4a1a2a', ok: '#103a38' },
    { id: 'hell',  name: 'Hell & Lila', akz: '#7c3aed', akzT: '#fff',    fl: '#f6f3fb', kopf: '#ffffff', kart: '#ffffff',
      t: '#231a36', t2: '#5b5170', lin: '#ddd6ec', ein: '#ffffff', einL: '#b9aedb', grau: '#e7e1f3', grauT: '#3b2d63',
      feh: '#fde2e4', ok: '#dcf5e3' }
  ];
  const farbe = (id) => FARBEN.find(f => f.id === id) || FARBEN[0];

  /* ─── Aussehen der Seiten ─────────────────────────────────────
     Eine Stildatei im Kopf jeder Seite (kein eigener Abruf): die
     Seiten sind dynamisch, eine Datei im Ordner gibt es nicht. */
  const stil = (f) =>
    'body{margin:0;background:' + f.fl + ';color:' + f.t + ';font-family:sans-serif;font-size:15px}'
    + '.kopf{display:flex;align-items:center;gap:6px 14px;padding:8px 14px;background:' + f.kopf + ';'
    +   'border-bottom:2px solid ' + f.akz + ';flex-wrap:wrap}'
    + '.marke{font-size:22px;font-weight:800;color:' + f.akz + ';margin-right:auto}'
    + '.kopf a{color:' + f.t + ';text-decoration:none;padding:8px 4px}'
    + '.kopf form{margin:0}'
    + '.inhalt{max-width:980px;margin:0 auto;padding:12px 14px}'
    + 'h1{margin:4px 0 10px;font-size:24px}'
    + '.held{text-align:center;padding:28px 14px}'
    + '.held h1{font-size:34px;color:' + f.akz + '}'
    + '.held p{color:' + f.t2 + '}'
    + '.knopf,button{display:inline-block;background:' + f.akz + ';color:' + f.akzT + ';border:0;border-radius:6px;'
    +   'padding:9px 16px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;'
    +   'min-height:40px;box-sizing:border-box}'
    + '.knopf--grau,button.grau{background:' + f.grau + ';color:' + f.grauT + '}'
    + '.karte{background:' + f.kart + ';border-radius:10px;padding:14px 18px;max-width:440px;margin:10px auto;'
    +   'border:1px solid ' + f.lin + '}'
    + '.karte a{color:' + f.akz + '}'
    + 'label{display:block;margin:8px 0 3px;color:' + f.t2 + '}'
    + 'input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid ' + f.einL + ';'
    +   'background:' + f.ein + ';color:' + f.t + ';font-size:15px;min-height:40px}'
    + '.fehler{background:' + f.feh + ';border-left:5px solid ' + f.akz + ';padding:12px 14px;margin:12px 0;border-radius:4px}'
    + '.ok{background:' + f.ok + ';border-left:5px solid #2ea043;padding:12px 14px;margin:12px 0;border-radius:4px}'
    + '.filme{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}'
    + '.film{background:' + f.kart + ';border-radius:10px;padding:10px;border:1px solid ' + f.lin + '}'
    + '.film img{width:100%;border-radius:8px;display:block}'
    + '.film h2{margin:8px 0 4px;font-size:17px}'
    + '.film .gefaellt{margin:4px 0 6px}'
    + '.kommentare{margin:6px 0;padding:0;list-style:none;color:' + f.t2 + ';font-size:13px}'
    + '.kommentare li{padding:4px 0;border-top:1px solid ' + f.lin + '}'
    + '.kommentare b{color:' + f.t + '}'
    + 'table{border-collapse:collapse;width:100%}td{padding:7px 8px;border-top:1px solid ' + f.lin + '}'
    + 'td:first-child{color:' + f.t2 + ';width:38%}'
    + '.klein{color:' + f.t2 + ';font-size:13px}';

  function erzeugen(engine, netz, stack, api) {
    const http = api.http;
    const mail = api.mail;

    const laeuft = (node) => netz.dienstLaeuft(node, 'stream');
    const conf = (node) => netz.streamConf(node);
    const dienstName = (node) => (conf(node).name || '').trim() || 'Streaming';

    const sitzungen = (node) => {
      const s = node.state || (node.state = {});
      if (!s.streamSitzungen) s.streamSitzungen = {};
      return s.streamSitzungen;
    };
    const kontoVon = (node, email) =>
      conf(node).konten.find(k => k.email === String(email || '').trim().toLowerCase());
    const angemeldet = (node, a) => {
      const email = sitzungen(node)[a.cookies.sid];
      return email ? kontoVon(node, email) : null;
    };

    /* ═══ Die Seiten ═════════════════════════════════════════ */

    function seite(node, titel, inhalt, konto) {
      const name = esc(dienstName(node));
      return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(titel) + ' – ' + name
        + '</title><style>' + stil(farbe(conf(node).farbe)) + '</style></head><body>'
        + '<div class="kopf"><span class="marke">' + name + '</span>'
        + (konto
            ? '<a href="/filme">Filme</a><a href="/konto">Mein Konto</a>'
              + '<form method="post" action="/abmelden"><button class="grau">Abmelden</button></form>'
            : '<a href="/">Start</a>')
        + '</div><div class="inhalt">' + inhalt + '</div></body></html>';
    }

    const startSeite = (node) => seite(node, 'Willkommen',
      '<div class="held"><h1>' + esc(dienstName(node)) + '</h1>'
      + '<p>Filme, wann du willst. Melde dich an oder lege ein Konto an.</p>'
      + '<p><a class="knopf" href="/anmelden">Anmelden</a> '
      + '<a class="knopf knopf--grau" href="/registrieren">Registrieren</a></p></div>');

    const feld = (name, text, wert, typ, platz) =>
      '<label for="f-' + name + '">' + text + '</label>'
      + '<input id="f-' + name + '" name="' + name + '" type="' + (typ || 'text') + '" value="'
      + esc(wert || '') + '" placeholder="' + esc(platz || '') + '" autocomplete="off" spellcheck="false">';

    const meldung = (art, text) => text ? '<div class="' + art + '">' + esc(text) + '</div>' : '';

    const anmeldeSeite = (node, fehler, email) => seite(node, 'Anmelden',
      '<div class="karte"><h1>Anmelden</h1>' + meldung('fehler', fehler)
      + '<form method="post" action="/anmelden">'
      + feld('email', 'E-Mail', email, 'text', 'anna@schule.de')
      + feld('passwort', 'Passwort', '', 'password', '')
      + '<p><button>Anmelden</button></p></form>'
      + '<p class="klein">Noch kein Konto? <a href="/registrieren">Registrieren</a></p></div>');

    const registerSeite = (node, fehler, w) => { w = w || {}; return seite(node, 'Registrieren',
      '<div class="karte"><h1>Registrieren</h1>' + meldung('fehler', fehler)
      + '<form method="post" action="/registrieren">'
      + feld('name', 'Name', w.name, 'text', 'Anna Beispiel')
      + feld('email', 'E-Mail', w.email, 'text', 'anna@schule.de')
      + feld('iban', 'IBAN (ausgedacht!)', w.iban, 'text', 'DE00 0000 0000 0000 00')
      + feld('bic', 'BIC (ausgedacht!)', w.bic, 'text', 'ABCDDEFF')
      + '<p><button>Konto anlegen</button></p></form>'
      + '<p class="klein">Dein Passwort bekommst du per E-Mail.</p></div>'); };

    const fertigSeite = (node, email) => seite(node, 'Fast geschafft',
      '<div class="karte"><h1>Fast geschafft</h1>'
      + meldung('ok', 'Wir haben dir eine E-Mail an ' + email + ' geschickt. Darin steht dein Passwort.')
      + '<p><a class="knopf" href="/anmelden">Zur Anmeldung</a></p></div>');

    function filmeSeite(node, konto) {
      const c = conf(node);
      const kacheln = c.filme.map(film).filter(Boolean).map((f) => {
        const likes = (c.likes[f.id] || []);
        const meine = likes.indexOf(konto.email) >= 0;
        const kommentare = c.kommentare.filter(k => k.film === f.id).slice(-5);
        return '<div class="film"><img src="/plakat/' + f.id + '.svg" alt="' + esc(f.titel) + '">'
          + '<h2>' + esc(f.titel) + '</h2>'
          + '<form class="gefaellt" method="post" action="/like">'
          +   '<input type="hidden" name="film" value="' + f.id + '">'
          +   '<button class="' + (meine ? '' : 'grau') + '">♥ ' + likes.length + (meine ? ' · gefällt dir' : ' · gefällt mir') + '</button></form>'
          + '<ul class="kommentare">' + kommentare.map(k =>
              '<li><b>' + esc(k.von) + ':</b> ' + esc(k.text) + '</li>').join('') + '</ul>'
          + '<form method="post" action="/kommentar">'
          +   '<input type="hidden" name="film" value="' + f.id + '">'
          +   '<input name="text" placeholder="Schreib einen Kommentar" autocomplete="off" maxlength="140">'
          +   '<p><button>Senden</button></p></form></div>';
      }).join('');
      return seite(node, 'Filme',
        '<h1>Hallo ' + esc(konto.name) + '</h1>'
        + (kacheln ? '<div class="filme">' + kacheln + '</div>'
                   : '<p>Der Betreiber hat noch keine Filme ausgewählt.</p>'), konto);
    }

    const kontoSeite = (node, konto) => seite(node, 'Mein Konto',
      '<div class="karte"><h1>Mein Konto</h1><table>'
      + '<tr><td>Name</td><td>' + esc(konto.name) + '</td></tr>'
      + '<tr><td>E-Mail</td><td>' + esc(konto.email) + '</td></tr>'
      + '<tr><td>IBAN</td><td>' + esc(konto.iban) + '</td></tr>'
      + '<tr><td>BIC</td><td>' + esc(konto.bic) + '</td></tr>'
      + '<tr><td>Passwort</td><td>' + esc(konto.passwort) + '</td></tr></table>'
      + '<p class="klein">Diese Daten sind geheim. Nur du siehst sie hier.</p></div>', konto);

    const nichtGefunden = (node) => seite(node, 'Nicht gefunden',
      '<div class="karte"><h1>Nicht gefunden</h1><p>Diese Seite gibt es hier nicht (HTTP-Status: 404).</p>'
      + '<p><a class="knopf" href="/">Zur Startseite</a></p></div>');

    /* ═══ Der Server ═════════════════════════════════════════ */

    function annahme(node) {
      return (conn) => {
        let puffer = '';
        conn.onDaten((text) => {
          puffer += text;
          const a = http.anfrageLesen(puffer);
          if (!a) return;
          puffer = '';
          if (a.fehler) { senden(node, conn, 400, 'text/plain', 'Diese Anfrage verstehe ich nicht.'); return; }
          try { behandeln(node, conn, a); }
          catch (e) { senden(node, conn, 500, 'text/plain', 'Interner Fehler.'); }
        });
      };
    }
    /* Port 80 immer; Port 443 nur mit Haken und Zertifikat
       (`http.httpsSchalten`) — dieselbe Regel wie beim Webserver. */
    function serverAn(node) {
      stack.tcpHoeren(node, PORT, annahme(node), 'Streaming-Server');
      http.httpsSchalten(node, conf(node), annahme(node), 'Streaming-Server (HTTPS)');
    }
    const serverAus = (node) => {
      stack.tcpNichtHoeren(node, PORT);
      stack.tcpNichtHoeren(node, http.HTTPS_PORT);
    };

    function senden(node, conn, status, typ, koerper, kopf, kurz) {
      const l = http.zugriffe(node);
      l.push((kurz || '') + '  →  ' + status);
      if (l.length > 60) l.splice(0, l.length - 60);
      conn.senden(http.antwortText(status, typ, koerper, kopf));
      conn.schliessen();
    }
    const html = (node, conn, a, status, text, kopf) =>
      senden(node, conn, status, 'text/html', text, kopf, a.methode + ' ' + a.pfad);
    const weiter = (node, conn, a, ziel, kopf) =>
      senden(node, conn, 303, 'text/html', '', ['Location: ' + ziel].concat(kopf || []),
             a.methode + ' ' + a.pfad);

    function behandeln(node, conn, a) {
      const pfad = a.pfad.split('?')[0];
      const konto = angemeldet(node, a);
      const c = conf(node);

      if (a.methode === 'GET') {
        // Prüfbesuch der Zertifizierungsstelle (zs.js) — vor allem anderen.
        const pruef = http.pruefAntwort(node, a.pfad);
        if (pruef) return senden(node, conn, 200, 'text/plain', pruef, null, 'GET ' + a.pfad + '  (Prüfbesuch der Zertifizierungsstelle)');
        const m = /^\/plakat\/(\d+)\.svg$/.exec(pfad);
        if (m) {
          const f = film(m[1]);
          if (!f) return html(node, conn, a, 404, nichtGefunden(node));
          return senden(node, conn, 200, f.bild ? 'image/jpeg' : 'image/svg+xml', plakat(f), null, 'GET ' + a.pfad);
        }
        if (pfad === '/') return konto ? weiter(node, conn, a, '/filme') : html(node, conn, a, 200, startSeite(node));
        if (pfad === '/anmelden') return konto ? weiter(node, conn, a, '/filme') : html(node, conn, a, 200, anmeldeSeite(node));
        if (pfad === '/registrieren') return konto ? weiter(node, conn, a, '/filme') : html(node, conn, a, 200, registerSeite(node));
        if (pfad === '/filme') return konto ? html(node, conn, a, 200, filmeSeite(node, konto)) : weiter(node, conn, a, '/');
        if (pfad === '/konto') return konto ? html(node, conn, a, 200, kontoSeite(node, konto)) : weiter(node, conn, a, '/');
        return html(node, conn, a, 404, nichtGefunden(node));
      }

      if (a.methode !== 'POST') return senden(node, conn, 501, 'text/plain', 'Nur GET und POST kann dieser Server.', null, a.methode + ' ' + a.pfad);
      const f = http.formLesen(a.body);

      if (pfad === '/anmelden') {
        const k = kontoVon(node, f.email);
        if (!k || k.passwort !== String(f.passwort || '')) {
          return html(node, conn, a, 401, anmeldeSeite(node, 'E-Mail oder Passwort stimmt nicht.', f.email));
        }
        const sid = neueSitzung();
        sitzungen(node)[sid] = k.email;
        return weiter(node, conn, a, '/filme', ['Set-Cookie: sid=' + sid + '; Path=/']);
      }

      if (pfad === '/registrieren') return registrieren(node, conn, a, f);

      if (pfad === '/abmelden') {
        if (a.cookies.sid) delete sitzungen(node)[a.cookies.sid];
        return weiter(node, conn, a, '/', ['Set-Cookie: sid=; Path=/']);
      }

      // Ab hier nur mit Anmeldung.
      if (!konto) return weiter(node, conn, a, '/');

      if (pfad === '/like') {
        const fi = film(f.film);
        if (fi && c.filme.indexOf(fi.id) >= 0) {
          const l = c.likes[fi.id] = c.likes[fi.id] || [];
          const i = l.indexOf(konto.email);
          if (i >= 0) l.splice(i, 1); else l.push(konto.email);
        }
        return weiter(node, conn, a, '/filme');
      }

      if (pfad === '/kommentar') {
        const fi = film(f.film);
        const text = String(f.text || '').trim().slice(0, 140);
        if (fi && c.filme.indexOf(fi.id) >= 0 && text) {
          c.kommentare.push({ film: fi.id, von: konto.name, text: text });
          if (c.kommentare.length > 100) c.kommentare.splice(0, c.kommentare.length - 100);
        }
        return weiter(node, conn, a, '/filme');
      }

      return html(node, conn, a, 404, nichtGefunden(node));
    }

    /* ─── Registrieren ────────────────────────────────────────
       Prüfen, Passwort wählen, Mail abschicken — und erst wenn die
       Mail beim Mailserver angenommen wurde, gibt es das Konto. */
    function registrieren(node, conn, a, f) {
      const c = conf(node);
      const w = {
        name: String(f.name || '').trim(),
        email: String(f.email || '').trim().toLowerCase(),
        iban: String(f.iban || '').trim(),
        bic: String(f.bic || '').trim()
      };
      const fehl = (t) => html(node, conn, a, 400, registerSeite(node, t, w));
      if (!w.name || !w.email || !w.iban || !w.bic) return fehl('Bitte alle Felder ausfüllen.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w.email)) return fehl('Das ist keine gültige E-Mail-Adresse.');
      if (kontoVon(node, w.email)) return fehl('Zu dieser E-Mail-Adresse gibt es schon ein Konto.');

      const ms = String(c.mailserver || '').trim();
      const kaputt = (t) => html(node, conn, a, 500, registerSeite(node, t, w));
      if (!ms) return kaputt('Der Betreiber hat noch keinen Mailserver eingetragen. Wir können dir dein Passwort nicht schicken.');

      const pw = neuesPasswort();
      mail.zumServer(node, ms, mail.SMTP, (fehler, ip, port) => {
        if (fehler) return kaputt('Der Mailserver ist nicht erreichbar: ' + fehler);
        mail.smtpSenden(node, ip, port, {
          von: 'service@' + slug(c.name) + '.de', an: w.email,
          betreff: 'Willkommen bei ' + dienstName(node),
          text: 'Hallo ' + w.name + ',\r\nwillkommen bei ' + dienstName(node) + '!\r\n'
            + 'Dein Passwort: ' + pw + '\r\nMelde dich mit deiner E-Mail-Adresse und diesem Passwort an.'
        }, (f2) => {
          if (f2) return kaputt('Die E-Mail wurde nicht angenommen: ' + f2);
          c.konten.push({ name: w.name, email: w.email, iban: w.iban, bic: w.bic, passwort: pw });
          if (api.onDirty) api.onDirty();
          html(node, conn, a, 200, fertigSeite(node, w.email));
        }, 'Streaming-Server');
      });
    }

    return { PORT, laeuft, serverAn, serverAus, conf, FILME };
  }

  window.Stream = { erzeugen: erzeugen, FILME: FILME, FARBEN: FARBEN, PORT: PORT };
})();
