/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — tls.js   ·   Die TLS-Schale
   ══════════════════════════════════════════════════════════════
   PLAN-SICHERHEIT, Schritt 4. TLS sitzt ZWISCHEN TCP und dem
   Programm: HTTP, SMTP und POP3 wissen nichts davon. Sie bekommen
   dasselbe Verbindungsobjekt wie sonst (`senden`, `onDaten`,
   `onZu`, `schliessen`) — nur dass dahinter ein Handschlag lief
   und alles verschlüsselt über die Leitung geht.

   ── Der Ablauf (TLS 1.3 in der Form, die man an die Tafel malt) ─
     Client → `ClientHello`   Servername (IM KLARTEXT), Zufallszahl,
                              Schlüsselanteil A
     Server → `ServerHello`   Zufallszahl, Schlüsselanteil B,
                              ZERTIFIKAT, BEWEIS
     ab hier: beide haben denselben Sitzungsschlüssel, und was
     über die Leitung geht, ist `🔒 verschlüsselt, N Byte`.

   Drei Dinge werden damit gezeigt, und jedes steht im Mitschnitt:
     1. Der INHALT ist weg (Passwort, Cookie, IBAN, Seite).
     2. WER mit wem spricht, bleibt sichtbar: Adressen, Ports und
        der Servername im ClientHello.
     3. Verschlüsseln allein reicht nicht — man muss wissen, MIT
        WEM man spricht. Dafür sind Zertifikat und Beweis da.

   ── Was welcher Teil tut ──────────────────────────────────────
   **Schlüsselaustausch = Diffie-Hellman.** Beide würfeln eine
   geheime Zahl (a, b) und schicken nur g^a bzw. g^b mod p. Daraus
   rechnet jeder dasselbe Geheimnis g^(ab) — wer nur mitliest, hat
   die Anteile, aber nicht a oder b.

   **Zertifikat = eine Unterschrift der Zertifizierungsstelle (ZS)**
   darunter: „Der Schlüssel (n, e) gehört zum Namen X". Der Browser
   prüft die Unterschrift mit dem Schlüssel der ZS aus seiner
   Vertrauensliste (`node.vertrauen`).

   **Beweis = eine Unterschrift des Servers** über den ganzen
   Handschlag, mit dem PRIVATEN Schlüssel zum Zertifikat. Ohne ihn
   könnte jeder ein mitgelesenes Zertifikat vorzeigen — das
   Zertifikat ist ja öffentlich. Er ist der Grund, warum das
   Kopieren eines Zertifikats nichts nützt.

   Der Browser prüft in dieser Reihenfolge: kennt er den
   Aussteller? · stimmt dessen Unterschrift? · passt der Name zum
   gewünschten Namen? · hat der Server den privaten Schlüssel?
   Der erste Fehler wird gemeldet (`code`: unbekannt · signatur ·
   name · beweis · kaputt · kein-tls).

   ── ⚠️ ALLES HIER IST SPIELZEUG ───────────────────────────────
   Die Zahlen sind winzig, damit man sie ablesen kann: p = 2³¹−1
   (echt: 2048 Bit oder Kurven), RSA-Modul ≈ 58 Bit (echt: 2048+),
   „Hashfunktion" = zwei FNV-Läufe (echt: SHA-256), Datenstrom =
   Xorshift (echt: AES-GCM / ChaCha20). Jede dieser Größen ließe
   sich in Sekunden brechen. Es geht um die STRUKTUR — wer wen
   überzeugt, was im Klartext steht, was nicht —, nicht um
   Sicherheit. Niemand soll diesen Code für etwas Echtes benutzen.

   Zufall kommt nur aus `engine.randInt`: zwei Durchläufe
   desselben Szenarios zeigen denselben Mitschnitt.

   ── Bewusst nicht gebaut ──────────────────────────────────────
   Zertifikatsketten, Ablauf und Widerruf, Sitzungswiederaufnahme
   (jede Verbindung macht den Handschlag neu), Fragmentierung (ein
   `senden` ist ein Datensatz), Aushandeln der Verfahren. Das
   Zertifikat steht im ServerHello offen, damit man es im
   Mitschnitt lesen kann — echtes TLS 1.3 verschlüsselt es.

   ── Die Hilfe für Schritt 5 (VPN) ─────────────────────────────
   `Krypto.versiegeln` / `Krypto.oeffnen` sind zustandslos: Schlüssel,
   Richtung und laufende Nummer hinein, Chiffretext heraus. Der
   Tunnel braucht dieselbe Funktion wieder.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* ═══ Krypto: reine Funktionen, kopflos prüfbar ══════════════ */

  const BI = BigInt;
  const P = BI(2147483647);     // 2³¹ − 1, eine Primzahl
  const G = BI(16807);          // 7⁵, eine Primitivwurzel dazu
  const E = BI(65537);          // der übliche öffentliche Exponent

  /* Zwei davon ergeben ein RSA-Modul von etwa 58 Bit. Geprüft ist
     jede (kerntest) — und keine ist ≡ 1 mod 65537, sonst gäbe es
     zu e keinen privaten Exponenten. */
  const PRIMZAHLEN = [
    536870923, 536872927, 536873929, 536874931, 536878939, 536882947,
    536887957, 536895973, 536899981, 536902987, 536903989, 536911003,
    536915011, 536916013, 536934049, 536936053, 536938057, 536939059,
    536951083, 536969119, 536976133, 536978137, 536979139, 536980141
  ];

  function potenz(b, e, m) {
    let r = BI(1);
    b = b % m;
    while (e > BI(0)) {
      if (e & BI(1)) r = (r * b) % m;
      b = (b * b) % m;
      e >>= BI(1);
    }
    return r;
  }

  function ggT(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

  /* Erweiterter Euklid: x mit a·x ≡ 1 (mod m). */
  function invers(a, m) {
    let [r0, r1] = [m, a % m], [t0, t1] = [BI(0), BI(1)];
    while (r1 !== BI(0)) {
      const q = r0 / r1;
      [r0, r1] = [r1, r0 - q * r1];
      [t0, t1] = [t1, t0 - q * t1];
    }
    return ((t0 % m) + m) % m;
  }

  /* FNV-1a über die Zeichen. Zwei Läufe mit verschiedenem
     Startwert ergeben 64 Bit. Keine kryptografische Hashfunktion. */
  function fnv(text, start) {
    let h = start >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  const hex8 = (z) => ('00000000' + (z >>> 0).toString(16)).slice(-8);
  const hashHex = (text) => hex8(fnv(text, 2166136261)) + hex8(fnv(text, 0x9e3779b9));
  const hash64 = (text) => (BI(fnv(text, 2166136261)) << BI(32)) | BI(fnv(text, 0x9e3779b9));

  /* ─ Schlüsselpaare (RSA) ─ `zufall(n)` liefert eine Ganzzahl in
     [0, n) — im Programm `engine.randInt`. Zahlen als Dezimaltext,
     damit sie ins Speicherformat (JSON) passen. */
  function schluesselpaar(zufall) {
    for (let versuch = 0; versuch < 50; versuch++) {
      const i = zufall(PRIMZAHLEN.length), j = zufall(PRIMZAHLEN.length);
      if (i === j) continue;
      const p = BI(PRIMZAHLEN[i]), q = BI(PRIMZAHLEN[j]);
      const phi = (p - BI(1)) * (q - BI(1));
      if (ggT(E, phi) !== BI(1)) continue;
      return { n: String(p * q), e: String(E), d: String(invers(E, phi)) };
    }
    return null;
  }

  function unterschreiben(text, schluessel) {
    const n = BI(schluessel.n);
    return String(potenz(hash64(text) % n, BI(schluessel.d), n));
  }

  function unterschriftPasst(text, unterschrift, schluessel) {
    try {
      const n = BI(schluessel.n);
      const s = BI(String(unterschrift));
      if (s < BI(0) || s >= n) return false;
      return potenz(s, BI(schluessel.e), n) === (hash64(text) % n);
    } catch (e) { return false; }
  }

  /* „A3F2-91BC-77D0-14EE" — kurz genug zum Vergleichen am Telefon. */
  function fingerabdruck(schluessel) {
    const h = hashHex(schluessel.n + ':' + schluessel.e).toUpperCase();
    return h.slice(0, 4) + '-' + h.slice(4, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16);
  }

  /* ─ Diffie-Hellman ─ */
  const dhAnteil  = (a) => String(potenz(G, BI(a), P));
  const dhGeheim  = (anteil, a) => String(potenz(BI(anteil), BI(a), P));
  const dhGueltig = (anteil) => {
    try { const x = BI(String(anteil)); return x >= BI(2) && x <= P - BI(2); }
    catch (e) { return false; }
  };
  const sitzungsschluessel = (geheim, zufallC, zufallS) =>
    hashHex(geheim + '|' + zufallC + '|' + zufallS);

  /* ─ Text ↔ Bytes ↔ Base64, ohne TextEncoder (der Prüfstand
     läuft in einer nackten vm) ─ */
  function utf8Bytes(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function utf8Text(b) {
    let s = '';
    for (let i = 0; i < b.length;) {
      const c = b[i++];
      let z;
      if (c < 0x80) z = c;
      else if (c < 0xE0) z = ((c & 31) << 6) | (b[i++] & 63);
      else if (c < 0xF0) { z = ((c & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63); i += 2; }
      else { z = ((c & 7) << 18) | ((b[i] & 63) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; }
      if (z > 0xFFFF) { z -= 0x10000; s += String.fromCharCode(0xD800 + (z >> 10), 0xDC00 + (z & 1023)); }
      else s += String.fromCharCode(z);
    }
    return s;
  }
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function base64(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 3) {
      const x = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      s += B64[(x >> 18) & 63] + B64[(x >> 12) & 63]
         + (i + 1 < b.length ? B64[(x >> 6) & 63] : '=')
         + (i + 2 < b.length ? B64[x & 63] : '=');
    }
    return s;
  }
  function ausBase64(t) {
    const out = [];
    const s = String(t).replace(/=+$/, '');
    for (let i = 0; i < s.length; i += 4) {
      const a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]);
      const c = i + 2 < s.length ? B64.indexOf(s[i + 2]) : -1;
      const d = i + 3 < s.length ? B64.indexOf(s[i + 3]) : -1;
      if (a < 0 || b < 0 || (i + 2 < s.length && c < 0) || (i + 3 < s.length && d < 0)) return null;
      const x = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
      out.push((x >> 16) & 255);
      if (c >= 0) out.push((x >> 8) & 255);
      if (d >= 0) out.push(x & 255);
    }
    return out;
  }

  /* ─ Der Datenstrom ─ Xorshift, angesetzt mit Schlüssel, Richtung
     und laufender Nummer des Datensatzes. Richtung 'c' = Client →
     Server, 's' = Server → Client: ohne sie hätten beide Seiten
     denselben Strom, und zwei Datensätze ließen sich gegeneinander
     abziehen. */
  function strom(ansatz) {
    let s = fnv(ansatz, 2166136261) || 0x1234567;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s >>>= 0;
      return (s >>> 11) & 255;
    };
  }

  function versiegeln(text, schluessel, richtung, nr) {
    const b = utf8Bytes(String(text));
    const ks = strom(schluessel + '|' + richtung + '|' + nr);
    for (let i = 0; i < b.length; i++) b[i] ^= ks();
    const c = base64(b);
    return { laenge: b.length, chiffre: c,
             tag: hashHex(schluessel + '|' + richtung + '|' + nr + '|' + c).slice(0, 8) };
  }

  /* Klartext — oder `null`, wenn die Prüfsumme nicht passt (falscher
     Schlüssel, verändert, falsche Nummer). */
  function oeffnen(satz, schluessel, richtung, nr) {
    if (!satz || typeof satz.chiffre !== 'string' || typeof satz.tag !== 'string') return null;
    const soll = hashHex(schluessel + '|' + richtung + '|' + nr + '|' + satz.chiffre).slice(0, 8);
    if (soll !== satz.tag) return null;
    const b = ausBase64(satz.chiffre);
    if (!b) return null;
    const ks = strom(schluessel + '|' + richtung + '|' + nr);
    for (let i = 0; i < b.length; i++) b[i] ^= ks();
    return utf8Text(b);
  }

  /* ─ Zertifikate ─ Eine Zeile Text, über die unterschrieben wird.
     Was nicht darin steht, ist nicht unterschrieben. */
  const zertText = (z) => ['ZERT', z.nr, z.name, z.besitzer.n, z.besitzer.e,
                           z.aussteller, z.ausstellerFp].join('|');

  function zertAusstellen(zs, nr, name, besitzer) {
    const z = {
      nr: nr, name: String(name).toLowerCase(),
      besitzer: { n: String(besitzer.n), e: String(besitzer.e) },
      aussteller: zs.name, ausstellerFp: fingerabdruck(zs.schluessel)
    };
    z.signatur = unterschreiben(zertText(z), zs.schluessel);
    return z;
  }

  const zertGestalt = (z) => !!(z && typeof z === 'object'
    && z.besitzer && typeof z.besitzer.n === 'string' && typeof z.besitzer.e === 'string'
    && typeof z.name === 'string' && typeof z.aussteller === 'string'
    && typeof z.ausstellerFp === 'string' && typeof z.signatur === 'string');

  /* Was der Browser prüft — in der Reihenfolge, in der ein Mensch
     fragen würde. Gibt `null` zurück oder { code, text }. `ziel`
     ist der Name, den man haben wollte; `beweis` der Text, über den
     der Server unterschrieben haben muss. */
  function zertPruefen(z, vertrauen, ziel, beweis, beweisSignatur) {
    if (!zertGestalt(z)) return { code: 'kaputt', text: 'Das Zertifikat des Servers ist unlesbar.' };
    const eintrag = (vertrauen || []).find(v => v.fp === z.ausstellerFp);
    if (!eintrag)
      return { code: 'unbekannt',
               text: 'Das Zertifikat stammt von „' + z.aussteller + '". Diese Zertifizierungsstelle steht nicht in der Vertrauensliste dieses Geräts.' };
    if (!unterschriftPasst(zertText(z), z.signatur, eintrag))
      return { code: 'signatur',
               text: 'Die Unterschrift unter dem Zertifikat stimmt nicht — es kommt nicht von „' + eintrag.name + '" oder wurde verändert.' };
    if (String(ziel || '').toLowerCase() !== z.name)
      return { code: 'name',
               text: 'Das Zertifikat gilt für „' + z.name + '", aber gewollt war „' + (ziel || '—') + '".' };
    if (!unterschriftPasst(beweis, beweisSignatur, z.besitzer))
      return { code: 'beweis',
               text: 'Der Server kann nicht beweisen, dass das Zertifikat zu ihm gehört (der private Schlüssel fehlt).' };
    return null;
  }

  const Krypto = {
    P: String(P), G: String(G), E: String(E), PRIMZAHLEN: PRIMZAHLEN,
    potenz: potenz, schluesselpaar: schluesselpaar,
    unterschreiben: unterschreiben, unterschriftPasst: unterschriftPasst,
    fingerabdruck: fingerabdruck, hashHex: hashHex,
    dhAnteil: dhAnteil, dhGeheim: dhGeheim, dhGueltig: dhGueltig,
    sitzungsschluessel: sitzungsschluessel,
    versiegeln: versiegeln, oeffnen: oeffnen,
    zertText: zertText, zertAusstellen: zertAusstellen, zertGestalt: zertGestalt,
    zertPruefen: zertPruefen
  };

  /* ═══ Die Schale an einer TCP-Verbindung ═════════════════════ */

  /* Wie lange der Client auf das ServerHello wartet. Spricht die
     Gegenstelle gar kein TLS (Webserver auf Port 80), antwortet sie
     nie — und ohne Frist hinge der Browser ewig. */
  const TLS_FRIST = 4000 * U.MS;
  const VERSION = 'TLS 1.3';

  /* Datensätze stehen als eine Zeile JSON auf der Leitung. Das ist
     keine Nachbildung der echten Bytes, sondern LESBAR: der
     Mitschnitt zeigt die Felder, und ein Kind sieht, was im
     Klartext geht (Servername, Zertifikat) und was nicht. */
  const satz = (o) => JSON.stringify(o) + '\n';
  function saetze(roh) {
    const out = [];
    let rest = roh;
    let i;
    while ((i = rest.indexOf('\n')) >= 0) {
      const z = rest.slice(0, i);
      rest = rest.slice(i + 1);
      if (!z) continue;
      let o = null;
      try { o = JSON.parse(z); } catch (e) { o = null; }
      out.push(o && typeof o === 'object' && typeof o.tls === 'string' ? o : { kaputt: true });
    }
    return { saetze: out, rest: rest };
  }

  function erzeugen(engine, netz, stack, api) {
    api = api || {};

    const sagen = (node, text, level) => engine.emit('event', {
      kind: 'note', node: node.id, nodeName: node.name, text: text,
      level: level || 'info', t: engine.now
    });

    const zufall8 = () => hex8(engine.randInt(4294967296));
    /* Die geheime Zahl a bzw. b aus Diffie-Hellman: 2 … p−2. */
    const geheimzahl = () => 2 + engine.randInt(2147483647 - 3);

    /* Das Verbindungsobjekt, das ein Programm zu sehen bekommt.
       Es entsteht SOFORT (der Aufrufer hängt `onZu` daran, bevor der
       Handschlag fertig ist) und wird nach dem Handschlag benutzbar. */
    function neuesObjekt(node, richtung) {
      const tc = {
        node: node, tls: null,
        _tcp: null, _schluessel: null, _aus: 0, _ein: 0,
        _daten: null, _zu: null, _zuGemeldet: false,
        senden(text) {
          if (!tc._schluessel || !tc._tcp) return false;
          const v = versiegeln(text, tc._schluessel, richtung, tc._aus++);
          return tc._tcp.senden(satz({ tls: 'Daten', laenge: v.laenge, chiffre: v.chiffre, tag: v.tag }));
        },
        schliessen() { const t = tc._tcp || tc._handle; if (t) t.schliessen(); },
        onDaten(fn) { tc._daten = fn; },
        onZu(fn) { tc._zu = fn; },
        _meldeZu(grund) {
          if (tc._zuGemeldet) return;
          tc._zuGemeldet = true;
          if (tc._zu) tc._zu(grund || null);
        }
      };
      return tc;
    }

    /* Ein Datensatz mit Nutzdaten kommt an. Falsche Prüfsumme =
       jemand hat etwas verändert oder der Schlüssel stimmt nicht:
       Verbindung zu, mit Grund. */
    function nutzdaten(node, tc, s, gegenRichtung) {
      const klar = oeffnen(s, tc._schluessel, gegenRichtung, tc._ein++);
      if (klar === null) {
        sagen(node, 'TLS: Ein Datensatz ließ sich nicht entschlüsseln (Prüfsumme falsch) — die Verbindung wird geschlossen.', 'warn');
        tc._tcp.senden(satz({ tls: 'Alert', grund: 'Prüfsumme falsch' }));
        tc._tcp.schliessen();
        tc._meldeZu('Prüfsumme falsch');
        return;
      }
      if (tc._daten) tc._daten(klar, tc);
    }

    /* ═══ Client ═════════════════════════════════════════════════
       `opt.sni`        der Name, den man haben wollte (steht im
                        ClientHello im Klartext)
       `opt.ausnahme`   Fehler des Zertifikats übergehen („Trotzdem
                        fortfahren") — verschlüsselt wird trotzdem
       Rückruf `cb(fehlertext, verbindung, info)`. Bei einem
       Zertifikatsfehler ist `info` { code, text, zertifikat, sni }. */
    function verbinde(node, ip, port, programm, opt, cb) {
      opt = opt || {};
      const tc = neuesObjekt(node, 'c');
      let fertig = false, puffer = '', timer = null;

      const ende = (fehler, info) => {
        if (fertig) return;
        fertig = true;
        if (timer) engine.cancel(timer);
        cb(fehler, fehler ? null : tc, info || null);
      };

      const a = geheimzahl();
      const anteil = dhAnteil(a);
      const zufallC = zufall8();
      const sni = String(opt.sni || '').toLowerCase();
      /* Unter einer Zahlenadresse schickt ein Client keinen Namen
         mit (SNI gibt es nur für Namen). Geprüft wird trotzdem
         gegen das, was man eingetippt hat. */
      const gesendet = U.ip2int(sni) !== null ? '' : sni;

      const tcp = stack.tcpVerbinde(node, ip, port, programm, (err, c) => {
        if (err) { ende(err); return; }
        tc._tcp = c;
        c.onZu((g) => {
          if (!fertig) ende(g || 'Die Verbindung ging zu, bevor der Handschlag fertig war.');
          tc._meldeZu(g);
        });
        c.onDaten((text) => {
          puffer += text;
          const r = saetze(puffer);
          puffer = r.rest;
          for (const s of r.saetze) {
            if (tc._schluessel && s.tls === 'Daten') { nutzdaten(node, tc, s, 's'); continue; }
            if (fertig) continue;
            serverHello(c, s);
          }
        });
        c.senden(satz({ tls: 'ClientHello', version: VERSION, sni: gesendet,
                        zufall: zufallC, dh: anteil }));
        const faktor = stack.fern && stack.fern(node, ip) ? (stack.FERN_FAKTOR || 10) : 1;
        timer = engine.at(TLS_FRIST * faktor, () => {
          if (fertig) return;
          c.schliessen();
          ende('Der Server antwortet nicht auf den Verschlüsselungs-Handschlag — spricht Port ' + port + ' überhaupt TLS?',
               { code: 'kein-tls', text: 'Die Gegenstelle spricht auf diesem Port kein TLS.', sni: sni });
        }, 'tls-frist', node.id);
      });

      function serverHello(c, s) {
        if (s.kaputt || s.tls === 'Alert' || s.tls !== 'ServerHello') {
          c.schliessen();
          const text = s.tls === 'Alert' ? 'Der Server bricht ab: ' + (s.grund || 'ohne Grund') + '.'
                                         : 'Die Gegenstelle spricht auf diesem Port kein TLS.';
          ende(text, { code: s.tls === 'Alert' ? 'alert' : 'kein-tls', text: text, sni: sni });
          return;
        }
        if (typeof s.zufall !== 'string' || !dhGueltig(s.dh)) {
          c.schliessen();
          ende('Das ServerHello ist unlesbar.', { code: 'kaputt', text: 'Das ServerHello ist unlesbar.', sni: sni });
          return;
        }
        const beweisText = ['SH', gesendet, zufallC, anteil, s.zufall, String(s.dh)].join('|');
        const fehler = zertPruefen(s.zertifikat, node.vertrauen, sni, beweisText, s.beweis);
        const z = zertGestalt(s.zertifikat) ? s.zertifikat : null;
        const info = fehler && { code: fehler.code, text: fehler.text, zertifikat: z, sni: sni };
        if (fehler) {
          sagen(node, 'TLS zu ' + (sni || ip) + ': ' + fehler.text, 'warn');
          if (!opt.ausnahme) { c.schliessen(); ende(fehler.text, info); return; }
        }
        tc._schluessel = sitzungsschluessel(dhGeheim(s.dh, a), zufallC, s.zufall);
        tc.tls = {
          version: VERSION, sni: sni, zertifikat: z,
          name: z ? z.name : '', aussteller: z ? z.aussteller : '',
          fehler: fehler ? fehler.code : null, fehlerText: fehler ? fehler.text : '',
          ausnahme: !!fehler
        };
        ende(null);
      }

      /* Das Handle kommt SOFORT zurück; benutzbar wird es mit dem
         Rückruf. Fehlt TCP, hat `tcpVerbinde` den Rückruf schon
         mit einem Fehler gerufen. */
      tc._handle = tcp;
      return tc;
    }

    /* ═══ Server ═════════════════════════════════════════════════
       `annahme(verbindung)` wird gerufen, sobald der Handschlag
       steht — dann sieht das Programm nur noch Klartext. */
    function hoeren(node, port, annahme, programm) {
      stack.tcpHoeren(node, port, (conn) => serverAnnehmen(node, conn, annahme), programm);
    }

    function serverAnnehmen(node, conn, annahme) {
      const tc = neuesObjekt(node, 's');
      tc._tcp = conn;
      let puffer = '', hallo = false;

      conn.onZu((g) => tc._meldeZu(g));
      conn.onDaten((text) => {
        puffer += text;
        const r = saetze(puffer);
        puffer = r.rest;
        for (const s of r.saetze) {
          if (tc._schluessel && s.tls === 'Daten') { nutzdaten(node, tc, s, 'c'); continue; }
          if (hallo) continue;
          if (s.kaputt || s.tls !== 'ClientHello' || typeof s.zufall !== 'string' || !dhGueltig(s.dh)) {
            conn.senden(satz({ tls: 'Alert', grund: 'Das war kein TLS-Handschlag' }));
            conn.schliessen();
            return;
          }
          hallo = true;
          clientHello(s);
        }
      });

      function clientHello(s) {
        const z = netz.zertConf(node);
        if (!z.zert || !z.schluessel) {
          conn.senden(satz({ tls: 'Alert', grund: 'Dieser Server hat kein Zertifikat' }));
          conn.schliessen();
          return;
        }
        const b = geheimzahl();
        const anteil = dhAnteil(b);
        const zufallS = zufall8();
        const sni = String(s.sni || '').toLowerCase();
        /* Auch bei falschem Namen schickt der Server SEIN Zertifikat —
           wie ein echter Webserver, der unter einer IP-Adresse
           erreicht wird. Dass es nicht passt, merkt der Client. */
        const beweisText = ['SH', sni, s.zufall, String(s.dh), zufallS, anteil].join('|');
        const sh = { tls: 'ServerHello', version: VERSION, zufall: zufallS, dh: anteil,
                     zertifikat: z.zert, beweis: unterschreiben(beweisText, z.schluessel) };
        tc._schluessel = sitzungsschluessel(dhGeheim(s.dh, b), s.zufall, zufallS);
        tc.tls = { version: VERSION, sni: sni, zertifikat: z.zert, name: z.zert.name,
                   aussteller: z.zert.aussteller, fehler: null, fehlerText: '', ausnahme: false };
        conn.senden(satz(sh));
        annahme(tc);
      }
    }

    return { verbinde, hoeren, VERSION, TLS_FRIST, Krypto };
  }

  window.Tls = { erzeugen: erzeugen, Krypto: Krypto, VERSION: VERSION };
})();
