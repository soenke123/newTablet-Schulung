/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — zs.js   ·   Die Zertifizierungsstelle (ZS)
   ══════════════════════════════════════════════════════════════
   PLAN-SICHERHEIT, Schritt 4. Ein Programm wie der Mailserver —
   „Zertifizierungsstelle" im Appstore, auf jedem Gerät
   installierbar, mit eigenem Port (8200). Es gibt KEINE eingebaute
   globale ZS: wer HTTPS will, braucht eine, der der Browser
   glaubt, und muss sie selbst aufsetzen und einrichten.

   ── Was eine ZS tut ───────────────────────────────────────────
   Sie beantwortet eine einzige Frage: „Gehört dieser Name dem, der
   danach fragt?" — und unterschreibt, wenn ja: „Der Schlüssel (n, e)
   gehört zum Namen X". Diese Unterschrift ist das Zertifikat.
   Der Browser glaubt ihr, wenn er die ZS in seiner Vertrauensliste
   hat (`node.vertrauen`).

   ── Der Ablauf eines Antrags (wie ACME, HTTP-01) ──────────────
     Server → ZS   ANTRAG stream.meinname.de <n> <e>
     ZS → Server   +AUFGABE <Einmalwort>
     Server → ZS   BEREIT
        … die ZS fragt IHREN DNS nach dem Namen, bekommt eine IP,
        besucht http://<IP>/.well-known/zs-pruefung und erwartet
        das Einmalwort …
     ZS → Server   +GEPRUEFT 7            (oder -FEHLER <Grund>)
     — Antrag Nr. 7 liegt jetzt bei der ZS: „Name geprüft ✓" —
     … der Betreiber der ZS klickt „Freigeben" (oder „Ablehnen") …
     Server → ZS   ABHOLEN 7
     ZS → Server   +ZERTIFIKAT {…}        (oder +WARTET / -ABGELEHNT)

   Warum ausgerechnet so:
   · Der DNS ist der, den DIE ZS eingetragen hat — nicht der des
     Antragstellers. Wer sich einen Namen in einen Fantasie-DNS
     einträgt, kommt damit bei einer ZS nicht durch, die anderen
     glaubt.
   · Das Einmalwort kann nur liefern, wer die Maschine hinter der
     IP des Namens kontrolliert. Das ist der ganze Beweis.
   · Zertifikat ABHOLEN, nicht zustellen — wie Post bei POP3.
   · Freigeben ist ein MENSCHENKLICK: sonst wäre die ZS ein
     Automat, und die Frage „wer entscheidet?" hätte keine Antwort.

   ⚠️ Beim Antrag lauscht das Gerät kurz selbst auf Port 80, wenn
   dort kein Server hängt (wie `certbot --standalone`) — so
   bekommt auch ein reiner Mailserver ein Zertifikat. Läuft ein
   Webserver oder Streaming-Server, antwortet der mit
   (`http.pruefAntwort`). Hinter einem Heimrouter muss Port 80
   weitergeleitet sein, sonst scheitert die Prüfung — das steht
   dann im Mitschnitt der ZS.

   ── Das Vertrauen ─────────────────────────────────────────────
   Der Browser FINDET die ZS nicht, er KENNT sie. Wer eine in seine
   Liste aufnimmt, fragt sie mit `ZS-ZERTIFIKAT` nach ihrem
   Schlüssel und sieht den FINGERABDRUCK — der steht auch im Fenster
   der ZS, und man soll ihn vergleichen. (Dass man das über eine
   unverschlüsselte Verbindung holt und den Fingerabdruck
   anderswoher bestätigen lässt, ist genau die Lage im echten
   Leben: irgendwo muss man jemandem glauben.)
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  const PORT = 8200;
  const EOL = '\r\n';
  const WOERTER = ['Fuchs', 'Mond', 'Stern', 'Wolke', 'Tiger', 'Pixel', 'Zebra', 'Komet'];

  function erzeugen(engine, netz, stack, api) {
    const K = window.Tls.Krypto;
    const http = api.http;

    const laeuft = (node) => netz.dienstLaeuft(node, 'zs');
    const conf = (node) => netz.zsConf(node);

    /* Zeilen aus einem Strom — wie in mail.js. */
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

    /* Der Schlüssel entsteht beim ersten Gebrauch — und bleibt. */
    function schluesselSicherstellen(node) {
      const z = conf(node);
      if (!z.schluessel) z.schluessel = K.schluesselpaar(engine.randInt);
      return z;
    }

    const eintragVon = (node) => {
      const z = schluesselSicherstellen(node);
      return { name: z.name, n: z.schluessel.n, e: z.schluessel.e, fp: K.fingerabdruck(z.schluessel) };
    };

    const einmalwort = () => WOERTER[engine.randInt(WOERTER.length)] + '-' + (1000 + engine.randInt(9000));

    const gueltigerName = (name) =>
      /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(name) && name.length <= 80;

    /* ═══ Die Seite der ZS ═══════════════════════════════════════ */

    function annahme(node) {
      return (conn) => {
        const sag = (t) => conn.senden(t + EOL);
        let antrag = null, token = '', zustand = 'bereit';

        zeilen(conn, (zeile) => {
          const teile = zeile.trim().split(/\s+/);
          const bef = (teile[0] || '').toUpperCase();
          const z = conf(node);

          if (zustand === 'wartet-auf-bereit') {
            if (bef !== 'BEREIT') { sag('-FEHLER Ich habe auf BEREIT gewartet'); conn.schliessen(); return; }
            zustand = 'prueft';
            pruefen(node, antrag, token, (fehler) => {
              if (fehler) {
                antrag.status = 'fehler';
                antrag.grund = fehler;
                sag('-FEHLER ' + fehler);
                conn.schliessen();
              } else {
                antrag.status = 'wartet';
                sag('+GEPRUEFT ' + antrag.nr);
              }
              zustand = 'fertig';
              if (api.onDirty) api.onDirty();
            });
            return;
          }
          if (zustand === 'prueft') return;

          if (bef === 'ZS-ZERTIFIKAT') {
            sag('+ZS ' + JSON.stringify(eintragVon(node)));
            return;
          }

          if (bef === 'ANTRAG') {
            const name = String(teile[1] || '').toLowerCase();
            if (!gueltigerName(name)) { sag('-FEHLER Das ist kein gültiger Name'); return; }
            if (U.ip2int(name) !== null) {
              sag('-FEHLER Für eine Zahlenadresse gibt es kein Zertifikat — nur für Namen');
              return;
            }
            if (!/^\d{1,30}$/.test(teile[2] || '') || !/^\d{1,30}$/.test(teile[3] || '')) {
              sag('-FEHLER Der öffentliche Schlüssel fehlt');
              return;
            }
            schluesselSicherstellen(node);
            antrag = { nr: z.serial++, name: name, n: teile[2], e: teile[3],
                       status: 'prueft', grund: '', ip: '', zert: null };
            z.antraege.push(antrag);
            if (z.antraege.length > 40) {
              const alt = z.antraege.findIndex(a => a.status !== 'wartet' && a.status !== 'prueft');
              if (alt >= 0) z.antraege.splice(alt, 1);
            }
            token = einmalwort();
            zustand = 'wartet-auf-bereit';
            sag('+AUFGABE ' + token);
            return;
          }

          if (bef === 'ABHOLEN') {
            const a = z.antraege.find(x => x.nr === parseInt(teile[1], 10));
            if (!a) { sag('-FEHLER Diesen Antrag kenne ich nicht'); return; }
            if (a.status === 'freigegeben') sag('+ZERTIFIKAT ' + JSON.stringify(a.zert));
            else if (a.status === 'abgelehnt') sag('-ABGELEHNT ' + (a.grund || 'Die Zertifizierungsstelle hat den Antrag abgelehnt'));
            else sag('+WARTET Der Antrag liegt bei uns und wartet auf die Freigabe');
            return;
          }

          if (bef === 'QUIT') { sag('+OK Tschüss'); conn.schliessen(); return; }
          sag('-FEHLER Kenne ich nicht');
        });
      };
    }

    /* Die Prüfung: DNS fragen (den der ZS), IP besuchen, Einmalwort
       vergleichen. `cb(null)` heißt bestanden, sonst der Grund in
       einem Satz, den ein Kind versteht. */
    function pruefen(node, antrag, token, cb) {
      const z = conf(node);
      const dns = (z.dns || '').trim() || node.dns;
      if (!dns) { cb('Diese Zertifizierungsstelle hat keinen DNS-Server eingetragen, bei dem sie den Namen nachschlagen kann.'); return; }
      api.resolve(node, antrag.name, (r) => {
        if (!r.ok) { cb('Beim DNS ' + dns + ' gibt es den Namen „' + antrag.name + '" nicht (' + (r.why || 'keine Antwort') + ').'); return; }
        antrag.ip = r.ip;
        http.holen(node, { host: antrag.name, port: 80, pfad: http.PRUEF_PFAD }, (h) => {
          if (!h.ok) {
            cb('Der Name zeigt auf ' + r.ip + ', aber dort antwortet auf Port 80 niemand (läuft der Server, ist der Port weitergeleitet?).');
            return;
          }
          if (h.status !== 200 || String(h.koerper).trim() !== token) {
            cb('Der Rechner unter ' + r.ip + ' kennt das Einmalwort nicht — der Name „' + antrag.name + '" gehört nicht diesem Antragsteller.');
            return;
          }
          cb(null);
        }, { ip: r.ip });
      }, undefined, dns);
    }

    function serverAn(node) {
      schluesselSicherstellen(node);
      stack.tcpHoeren(node, PORT, annahme(node), 'Zertifizierungsstelle');
    }
    const serverAus = (node) => stack.tcpNichtHoeren(node, PORT);

    /* Der Klick des Betreibers. */
    function freigeben(node, nr) {
      const z = schluesselSicherstellen(node);
      const a = z.antraege.find(x => x.nr === nr && x.status === 'wartet');
      if (!a) return false;
      a.zert = K.zertAusstellen(z, a.nr, a.name, { n: a.n, e: a.e });
      a.status = 'freigegeben';
      return true;
    }
    function ablehnen(node, nr, grund) {
      const a = conf(node).antraege.find(x => x.nr === nr && x.status === 'wartet');
      if (!a) return false;
      a.status = 'abgelehnt';
      a.grund = grund || 'Die Zertifizierungsstelle hat den Antrag abgelehnt.';
      return true;
    }

    /* ═══ Die Seite des Antragstellers ═══════════════════════════ */

    function zumHost(node, wirt, cb) {
      wirt = String(wirt || '').trim();
      if (!wirt) { cb('Es ist keine Zertifizierungsstelle eingetragen.'); return; }
      if (U.ip2int(wirt) !== null) { cb(null, wirt); return; }
      api.resolve(node, wirt, (r) => {
        if (r.ok) cb(null, r.ip);
        else cb(r.why || ('Der Name „' + wirt + '" ist nicht aufzulösen.'));
      });
    }

    const freundlich = (err, wirt) => /hört niemand/.test(String(err))
      ? 'Unter ' + wirt + ' läuft keine Zertifizierungsstelle (Port ' + PORT + ' ist zu).' : err;

    /* Ein Gespräch mit der ZS: `schritt(zeile, sag, ende)` bekommt
       jede Antwortzeile; `ende(fehler, ergebnis)` beendet. */
    function gespraech(node, wirt, erste, schritt, cb) {
      zumHost(node, wirt, (fehler, ip) => {
        if (fehler) { cb(fehler); return; }
        let fertig = false;
        const ende = (f, erg) => { if (fertig) return; fertig = true; cb(f || null, erg); };
        const conn = stack.tcpVerbinde(node, ip, PORT, 'Zertifikat-Antrag', (err, c) => {
          if (err) { ende(freundlich(err, wirt)); return; }
          const sag = (t) => c.senden(t + EOL);
          zeilen(c, (zeile) => {
            if (fertig) return;
            schritt(zeile, sag, (f, erg) => { ende(f, erg); c.senden('QUIT' + EOL); });
          });
          sag(erste);
        });
        if (conn) conn.onZu(() => ende('Die Zertifizierungsstelle hat die Verbindung geschlossen.'));
      });
    }

    /* Beim Antrag lauscht das Gerät auf Port 80 — selbst, falls dort
       sonst niemand ist. Siehe Dateikopf. */
    function aufgabeStart(node, token) {
      const s = node.state || (node.state = {});
      s.zsAufgabe = token;
      if (!stack.tcpHoert(node, 80)) {
        s.zsEigenerPort = true;
        stack.tcpHoeren(node, 80, (conn) => {
          let puffer = '';
          conn.onDaten((text) => {
            puffer += text;
            const a = http.anfrageLesen(puffer);
            if (!a) return;
            puffer = '';
            const t = a.fehler ? null : http.pruefAntwort(node, a.pfad);
            http.zugriffe(node).push((a.fehler ? '?' : a.methode + ' ' + a.pfad) + '  →  ' + (t ? '200  (Prüfbesuch der Zertifizierungsstelle)' : '404'));
            conn.senden(t ? http.antwortText(200, 'text/plain', t)
                          : http.antwortText(404, 'text/plain', 'Nicht gefunden'));
            conn.schliessen();
          });
        }, 'Zertifikat-Prüfung');
      }
    }
    function aufgabeEnde(node) {
      const s = node.state || {};
      delete s.zsAufgabe;
      if (s.zsEigenerPort) { s.zsEigenerPort = false; stack.tcpNichtHoeren(node, 80); }
    }

    /* Ein Zertifikat beantragen. `cb(fehler)`: bei Erfolg liegt der
       Antrag bei der ZS und der Betreiber wartet auf die Freigabe. */
    function beantragen(node, name, zsAdresse, cb) {
      name = String(name || '').trim().toLowerCase();
      zsAdresse = String(zsAdresse || '').trim();
      if (!name) { cb('Trag den Namen ein, für den das Zertifikat gelten soll.'); return; }
      if (!gueltigerName(name)) { cb('„' + name + '" ist kein gültiger Name.'); return; }
      if (U.ip2int(name) !== null) { cb('Für eine Zahlenadresse gibt es kein Zertifikat — nur für Namen.'); return; }
      if (!zsAdresse) { cb('Trag die Adresse der Zertifizierungsstelle ein.'); return; }

      const zc = netz.zertConf(node);
      if (!zc.schluessel) zc.schluessel = K.schluesselpaar(engine.randInt);

      gespraech(node, zsAdresse,
        'ANTRAG ' + name + ' ' + zc.schluessel.n + ' ' + zc.schluessel.e,
        (zeile, sag, ende) => {
          let m;
          if ((m = /^\+AUFGABE\s+(\S+)/.exec(zeile))) { aufgabeStart(node, m[1]); sag('BEREIT'); return; }
          if ((m = /^\+GEPRUEFT\s+(\d+)/.exec(zeile))) {
            aufgabeEnde(node);
            zc.name = name; zc.zs = zsAdresse; zc.zert = null;
            zc.antrag = { nr: parseInt(m[1], 10), zs: zsAdresse, name: name, status: 'wartet', grund: '' };
            ende(null);
            return;
          }
          if (/^-/.test(zeile)) { aufgabeEnde(node); ende(zeile.replace(/^-\w+\s*/, '')); }
        },
        (fehler) => { aufgabeEnde(node); cb(fehler); });
    }

    /* Nachsehen, ob der Antrag freigegeben ist — und das Zertifikat
       mitnehmen. `cb(fehler, zustand)` mit zustand 'wartet' · 'abgelehnt'
       · 'ausgestellt'. */
    function abholen(node, cb) {
      const zc = netz.zertConf(node);
      if (!zc.antrag || zc.antrag.status === 'ausgestellt') { cb('Es liegt kein Antrag bei einer Zertifizierungsstelle.'); return; }
      gespraech(node, zc.antrag.zs, 'ABHOLEN ' + zc.antrag.nr, (zeile, sag, ende) => {
        let m;
        if (/^\+WARTET/.test(zeile)) { ende(null, 'wartet'); return; }
        if ((m = /^-ABGELEHNT\s*(.*)$/.exec(zeile))) {
          zc.antrag.status = 'abgelehnt';
          zc.antrag.grund = m[1] || 'Die Zertifizierungsstelle hat den Antrag abgelehnt.';
          ende(null, 'abgelehnt');
          return;
        }
        if ((m = /^\+ZERTIFIKAT\s+(.+)$/.exec(zeile))) {
          let z = null;
          try { z = JSON.parse(m[1]); } catch (e) { z = null; }
          if (!K.zertGestalt(z) || z.besitzer.n !== zc.schluessel.n || z.name !== zc.antrag.name) {
            ende('Das Zertifikat passt nicht zu deinem Antrag.');
            return;
          }
          zc.zert = z;
          zc.antrag.status = 'ausgestellt';
          ende(null, 'ausgestellt');
          return;
        }
        if (/^-/.test(zeile)) ende(zeile.replace(/^-\w+\s*/, ''));
      }, cb);
    }

    /* Den Schlüssel einer ZS holen (für die Vertrauensliste des
       Browsers). Der Fingerabdruck wird HIER aus dem Schlüssel
       gerechnet — dem, was die ZS behauptet, glaubt man dabei nichts. */
    function zsHolen(node, adresse, cb) {
      gespraech(node, adresse, 'ZS-ZERTIFIKAT', (zeile, sag, ende) => {
        const m = /^\+ZS\s+(.+)$/.exec(zeile);
        if (!m) { if (/^-/.test(zeile)) ende(zeile.replace(/^-\w+\s*/, '')); return; }
        let e = null;
        try { e = JSON.parse(m[1]); } catch (x) { e = null; }
        if (!e || !/^\d{1,30}$/.test(String(e.n)) || !/^\d{1,30}$/.test(String(e.e)) || typeof e.name !== 'string') {
          ende('Die Antwort der Zertifizierungsstelle ist unlesbar.');
          return;
        }
        ende(null, { name: e.name.slice(0, 60), n: String(e.n), e: String(e.e),
                     fp: K.fingerabdruck({ n: String(e.n), e: String(e.e) }) });
      }, cb);
    }

    /* ─ Die Vertrauensliste eines Geräts ─ */
    function vertrauenAufnehmen(node, eintrag) {
      const l = netz.vertrauen(node);
      if (l.some(v => v.fp === eintrag.fp)) return false;
      l.push({ name: eintrag.name, n: eintrag.n, e: eintrag.e, fp: eintrag.fp });
      return true;
    }
    function vertrauenEntfernen(node, fp) {
      const l = netz.vertrauen(node);
      const i = l.findIndex(v => v.fp === fp);
      if (i >= 0) l.splice(i, 1);
    }

    return {
      PORT, laeuft, conf, serverAn, serverAus, schluesselSicherstellen, eintragVon,
      freigeben, ablehnen, beantragen, abholen, zsHolen,
      vertrauenAufnehmen, vertrauenEntfernen
    };
  }

  window.Zs = { erzeugen: erzeugen, PORT: PORT };
})();
