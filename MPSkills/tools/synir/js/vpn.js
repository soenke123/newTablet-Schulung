/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — vpn.js   ·   Der Tunnel
   ══════════════════════════════════════════════════════════════
   PLAN-SICHERHEIT, Schritt 5. Ein VPN-Server (Programm „VPN-Server",
   wie der Mailserver: Konten, ein Schalter) und ein VPN-Client
   (Programm „VPN-Client": Server, Konto, Passwort, Verbinden).

   ── Was ein Tunnel ist ────────────────────────────────────────
   Der Client bekommt vom Server eine zweite Adresse (10.8.0.x, die
   „Tunnel-Adresse"). Solange der Tunnel steht, geht ALLES, was der
   Client sendet — Webseiten, Mail, DNS —, nicht mehr auf sein Kabel,
   sondern als fertiges IP-Paket in den Tunnel. Der Tunnel ist eine
   TLS-Verbindung zum Server (TCP, Port 1194); das Paket steht darin
   als verschlüsselter Datensatz. Wer an der Leitung mitliest, sieht
   nur: dieses Gerät spricht mit dem VPN-Server, und wie viel.

   Der Server packt aus, tauscht den Absender gegen SEINE Adresse
   (NAT, wie beim Heimrouter) und schickt das Paket weiter — ab da ist
   es wieder, wie es war: unverschlüsselt (HTTP) oder mit eigenem
   HTTPS. Die Antwort kommt zum Server zurück, er sucht in seiner
   Tabelle, wem sie gehört, und packt sie in den Tunnel.

   ⭐ Das ist die Lehre: das Vertrauen wandert. Der Router sieht das
   Ziel nicht mehr — dafür sieht der VPN-Server alles.

   ── Warum TLS wiederverwendet wird ────────────────────────────
   Der Server beweist sich mit einem Zertifikat (von einer ZS, wie
   Web- und Mailserver); der Client prüft es gegen die Vertrauens-
   liste seines Geräts, mit denselben Warnungen und derselben
   Ausnahme „Trotzdem verbinden". Die Anmeldung (Konto, Passwort)
   läuft erst danach, schon verschlüsselt — ein Mitleser sieht sie
   nicht. Das ist nicht echtes OpenVPN, aber so ähnlich wie ein
   „SSL-VPN" (OpenVPN über TCP, SSTP).

   ── Auf der Leitung ───────────────────────────────────────────
   Innen (Klartext, nur an den Enden): { vpn: 'Anmelden', benutzer,
   passwort } · { vpn: 'OK', ip, gateway } · { vpn: 'Fehler', grund }
   · { vpn: 'Paket', pkt }. Der Mitschnitt zeigt das innere Paket als
   Zeile am Gerät („Tunnel"), und außen die TLS-Datensätze.

   ── Bewusst nicht gebaut ──────────────────────────────────────
   Mehrere Tunnel je Gerät, Ausnahmen („nur dieses Netz durch den
   Tunnel"), Verbindungsabbruch mit Wiederaufbau, Verkehr zwischen
   zwei Teilnehmern über denselben Server (er geht, aber ohne
   Eigenheiten), Ablauf von NAT-Zeilen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  const PORT = 1194;
  const TUNNEL_VORSATZ = '10.8.0.';
  const SERVER_TUNNEL = '10.8.0.1';
  /* Außenports der Übersetzung: unter 49152 (dort fangen die
     flüchtigen Ports der Geräte an) und über den Diensten — wer 40001
     liest, weiß, dass die Nummer vergeben wurde. */
  const NAT_VON = 40000, NAT_BIS = 49000;
  const ANMELDE_FRIST = 8000 * U.MS;

  function erzeugen(engine, netz, stack, api) {
    api = api || {};
    const tls = api.tls;

    const sagen = (node, text, level) => engine.emit('event', {
      kind: 'note', node: node.id, nodeName: node.name, text: text,
      level: level || 'info', t: engine.now
    });
    const geaendert = (node) => {
      engine.emit('event', { kind: 'vpn', node: node.id, t: engine.now });
      if (api.onDirty) api.onDirty();
    };

    const eigeneIp = (node, ip) => node.nics.some(k => k.ip && k.ip === ip);
    const json = (o) => JSON.stringify(o);

    /* Das innere Paket als Zeile im Mitschnitt. `server` heißt: dieses
       Gerät trägt es weiter (und sieht es deshalb im Klartext) — der
       Mitschnitt zählt das als „Unterwegs". */
    function zeile(node, richtung, pkt, server) {
      engine.emit('event', {
        kind: 'tun', dir: richtung, node: node.id, pkt: pkt, server: !!server, t: engine.now
      });
    }

    /* ═══ Server ═════════════════════════════════════════════════ */

    function srv(node) {
      const s = node.state || (node.state = {});
      if (!s.vpnSrv) s.vpnSrv = {
        sessions: new Map(),        // Tunnel-Adresse → Sitzung
        hin: new Map(),             // "proto|ip|port" → Zeile
        zur: new Map(),             // "proto|aussenport" → Zeile
        next: NAT_VON
      };
      return s.vpnSrv;
    }

    const laeuft = (node) => netz.dienstLaeuft(node, 'vpn');

    function serverAn(node) {
      if (!tls || stack.tcpHoert(node, PORT)) return;
      tls.hoeren(node, PORT, (tc) => annahme(node, tc), 'VPN-Server');
    }

    function serverAus(node) {
      if (stack.tcpHoert(node, PORT)) stack.tcpNichtHoeren(node, PORT);
      const s = node.state && node.state.vpnSrv;
      if (!s) return;
      for (const t of [...s.sessions.values()]) { try { t.conn.schliessen(); } catch (e) {} }
      s.sessions.clear(); s.hin.clear(); s.zur.clear();
    }

    function freieAdresse(s) {
      for (let i = 2; i < 250; i++) {
        if (!s.sessions.has(TUNNEL_VORSATZ + i)) return TUNNEL_VORSATZ + i;
      }
      return null;
    }

    function annahme(node, tc) {
      const s = srv(node);
      let sitzung = null;

      tc.onDaten((text) => {
        let m = null;
        try { m = JSON.parse(text); } catch (e) { m = null; }
        if (!m) return;

        if (!sitzung) {
          const antwort = (o) => tc.senden(json(o));
          if (m.vpn !== 'Anmelden') {
            antwort({ vpn: 'Fehler', grund: 'Erst anmelden.' }); tc.schliessen(); return;
          }
          const konto = netz.vpnServerConf(node).konten
            .find(k => k.benutzer === String(m.benutzer || '').trim());
          if (!konto || konto.pwHash !== U.pseudoHash(String(m.passwort || ''))) {
            sagen(node, 'VPN: Anmeldung von „' + String(m.benutzer || '') + '" abgelehnt.', 'warn');
            antwort({ vpn: 'Fehler', grund: 'Benutzer oder Passwort stimmt nicht.' });
            tc.schliessen();
            return;
          }
          const ip = freieAdresse(s);
          if (!ip) { antwort({ vpn: 'Fehler', grund: 'Der Server hat keine freie Tunnel-Adresse.' }); tc.schliessen(); return; }
          sitzung = { conn: tc, benutzer: konto.benutzer, ip: ip, seit: engine.now };
          s.sessions.set(ip, sitzung);
          sagen(node, 'VPN: ' + konto.benutzer + ' ist verbunden (Tunnel-Adresse ' + ip + ').');
          antwort({ vpn: 'OK', ip: ip, gateway: SERVER_TUNNEL });
          geaendert(node);
          return;
        }
        if (m.vpn === 'Paket' && m.pkt) ausTunnel(node, sitzung, m.pkt);
      });

      tc.onZu(() => {
        if (!sitzung) return;
        if (s.sessions.get(sitzung.ip) === sitzung) s.sessions.delete(sitzung.ip);
        for (const [k, z] of [...s.hin]) if (z.sitzung === sitzung) { s.hin.delete(k); s.zur.delete(z.proto + '|' + z.aussen); }
        sagen(node, 'VPN: ' + sitzung.benutzer + ' hat den Tunnel beendet.');
        geaendert(node);
      });
    }

    const senden = (sitzung, pkt) => sitzung.conn.senden(json({ vpn: 'Paket', pkt: pkt }));

    function antwortPaket(node, sitzung, art, code, orig) {
      const pkt = {
        src: SERVER_TUNNEL, dst: sitzung.ip, ttl: stack.DEFAULT_TTL, proto: 'icmp',
        id: stack.ipKennung(node), payload: { type: art, code: code, orig: orig }
      };
      zeile(node, 'raus', pkt, true);
      senden(sitzung, pkt);
    }

    /* Ein Paket kommt aus dem Tunnel: wohin soll es? */
    function ausTunnel(node, sitzung, pkt) {
      if (!pkt || pkt.src !== sitzung.ip || typeof pkt.dst !== 'string') return;
      zeile(node, 'rein', pkt, true);
      const p = pkt.payload || {};
      const orig = { src: pkt.src, dst: pkt.dst, id: p.id, seq: p.seq };

      pkt.ttl = (pkt.ttl | 0) - 1;
      if (pkt.ttl <= 0) { antwortPaket(node, sitzung, 11, 0, orig); return; }

      // Für den Server selbst (seine Tunnel-Adresse oder eine seiner Karten).
      if (pkt.dst === SERVER_TUNNEL || eigeneIp(node, pkt.dst)) { stack.ipLokal(node, pkt); return; }

      // Für einen anderen Teilnehmer desselben Servers.
      if (pkt.dst.indexOf(TUNNEL_VORSATZ) === 0) {
        const t = srv(node).sessions.get(pkt.dst);
        if (t) { zeile(node, 'raus', pkt, true); senden(t, pkt); } else antwortPaket(node, sitzung, 3, 0, orig);
        return;
      }

      const route = stack.routeFor(node, U.ip2int(pkt.dst));
      if (!route) { antwortPaket(node, sitzung, 3, 0, orig); return; }
      hinaus(node, sitzung, pkt, node.nics[route.nic]);
      stack.ipWeiter(node, route, pkt);
    }

    /* ─── Die Übersetzung ─────────────────────────────────────
       Wie beim Heimrouter (nat.js), nur für den Tunnel: der Absender
       10.8.0.2:51000 wird zu <Adresse des Servers>:40001, und die
       Zeile wird aufgeschrieben. Eine Antwort an 40001 ist ohne sie
       nicht zuzuordnen. */
    function hinaus(node, sitzung, pkt, nic) {
      const s = srv(node);
      const p = pkt.payload || {};
      const proto = pkt.proto;
      let innen = null;
      if (proto === 'tcp' || proto === 'udp') innen = p.sport;
      else if (proto === 'icmp' && p.type === 8) innen = p.id;
      if (innen != null) {
        const key = proto + '|' + pkt.src + '|' + innen;
        let z = s.hin.get(key);
        if (!z) {
          let aussen = s.next++;
          if (s.next > NAT_BIS) s.next = NAT_VON;
          z = { proto: proto, ip: pkt.src, port: innen, aussen: aussen, sitzung: sitzung };
          s.hin.set(key, z); s.zur.set(proto + '|' + aussen, z);
        }
        if (proto === 'icmp') p.id = z.aussen; else p.sport = z.aussen;
      }
      if (nic && nic.ip) pkt.src = nic.ip;
    }

    /* Eine Antwort ist beim Server angekommen. Gehört sie zu einer
       Zeile der Übersetzung? Dann zurück in den Tunnel — und zwar
       VOR der Frage „für mich?", denn formal ist sie an den Server
       gerichtet. */
    function herein(node, pkt) {
      const s = node.state && node.state.vpnSrv;
      if (!s || !s.zur.size || !eigeneIp(node, pkt.dst)) return false;
      const p = pkt.payload || {};
      let port = null;
      if (pkt.proto === 'tcp' || pkt.proto === 'udp') port = p.dport;
      else if (pkt.proto === 'icmp' && p.type === 0) port = p.id;
      if (port == null) return false;
      const z = s.zur.get(pkt.proto + '|' + port);
      if (!z || s.sessions.get(z.sitzung.ip) !== z.sitzung) return false;
      pkt.dst = z.ip;
      if (pkt.proto === 'icmp') p.id = z.port; else p.dport = z.port;
      senden(z.sitzung, pkt);
      zeile(node, 'raus', pkt, true);
      return true;
    }

    /* ═══ Client ═════════════════════════════════════════════════ */

    const stand = (node) => (node.state && node.state.vpn) || null;
    const aktiv = (node) => { const c = stand(node); return !!(c && c.an); };

    /* Nimmt `opt.ausnahme` (Zertifikatsfehler übergehen). Rückruf
       `cb(fehlertext, info)`: bei einem Zertifikatsfehler ist `info`
       { code, text, zertifikat, sni } — die Oberfläche bietet dann
       „Trotzdem verbinden" an. */
    function verbinden(node, opt, cb) {
      opt = opt || {};
      cb = cb || function () {};
      const cf = netz.vpnClientConf(node);
      const name = String(opt.server != null ? opt.server : cf.server).trim().toLowerCase();
      if (!tls) { cb('VPN braucht TLS.'); return; }
      if (!name) { cb('Trag zuerst den Server ein.'); return; }
      if (aktiv(node)) { cb('Der Tunnel steht schon.'); return; }

      const los = (ip) => {
        let fertig = false, timer = null;
        const ende = (fehler, info) => {
          if (fertig) return;
          fertig = true;
          if (timer) engine.cancel(timer);
          cb(fehler || null, info || null);
        };
        tls.verbinde(node, ip, PORT, 'VPN-Client', { sni: name, ausnahme: !!opt.ausnahme }, (fehler, tc, info) => {
          if (fehler) { ende(fehler, info); return; }
          let st = null;
          tc.onDaten((text) => {
            let m = null;
            try { m = JSON.parse(text); } catch (e) { m = null; }
            if (!m) return;
            if (!st) {
              if (m.vpn === 'OK') {
                st = { an: true, conn: tc, ip: m.ip, serverIp: ip, serverName: name,
                       benutzer: cf.benutzer, tls: tc.tls, seit: engine.now };
                node.state = node.state || {};
                node.state.vpn = st;
                sagen(node, 'VPN: Tunnel zu ' + name + ' steht. Tunnel-Adresse ' + m.ip + ' — ab jetzt geht alles hindurch.');
                geaendert(node);
                ende(null);
              } else {
                tc.schliessen();
                ende(m.grund || 'Der Server hat die Anmeldung abgelehnt.');
              }
              return;
            }
            if (m.vpn === 'Paket' && m.pkt && m.pkt.dst === st.ip) {
              zeile(node, 'rein', m.pkt, false);
              stack.ipLokal(node, m.pkt);
            }
          });
          tc.onZu(() => {
            if (st && node.state.vpn === st) {
              st.an = false; node.state.vpn = null;
              sagen(node, 'VPN: Der Tunnel zu ' + name + ' ist zu.', 'warn');
              geaendert(node);
            } else if (!fertig) ende('Der Server hat die Verbindung geschlossen.');
          });
          tc.senden(json({ vpn: 'Anmelden', benutzer: cf.benutzer, passwort: cf.passwort }));
          const faktor = stack.fern && stack.fern(node, ip) ? (stack.FERN_FAKTOR || 10) : 1;
          timer = engine.at(ANMELDE_FRIST * faktor, () => {
            if (fertig) return;
            tc.schliessen();
            ende('Der Server antwortet nicht auf die Anmeldung.');
          }, 'vpn-frist', node.id);
        });
      };

      if (U.ip2int(name) !== null) { los(name); return; }
      if (!api.resolve) { cb('Kein Namensdienst.'); return; }
      api.resolve(node, name, (r) => {
        if (!r || !r.ok) { cb((r && r.why) || ('Der Name „' + name + '" ist nicht aufzulösen.')); return; }
        los(r.ip);
      });
    }

    function trennen(node) {
      const c = stand(node);
      if (!c) return;
      node.state.vpn = null;
      c.an = false;
      try { c.conn.schliessen(); } catch (e) {}
      sagen(node, 'VPN: Tunnel zu ' + c.serverName + ' beendet.');
      geaendert(node);
    }

    /* Das Gerät ist aus oder die Uhr steht: der Tunnel ist weg. */
    function aufraeumen(node) {
      if (stand(node)) {
        const c = node.state.vpn;
        node.state.vpn = null;
        c.an = false;
      }
    }

    /* ⟨Hinweg⟩ — vom Netzstapel bei jedem `sendIp` gefragt. */
    function umleiten(node, dstIp, proto, payload, opts) {
      const c = stand(node);
      if (c && c.an) {
        if (dstIp === c.serverIp) return false;                 // das Gespräch mit dem Server selbst
        if (eigeneIp(node, dstIp) || dstIp === c.ip) return false;
        if (dstIp.indexOf('127.') === 0) return false;
        const pkt = {
          src: c.ip, dst: dstIp, ttl: (opts && opts.ttl) || stack.DEFAULT_TTL,
          proto: proto, id: stack.ipKennung(node), payload: payload
        };
        zeile(node, 'raus', pkt, false);
        c.conn.senden(json({ vpn: 'Paket', pkt: pkt }));
        return true;
      }
      const s = node.state && node.state.vpnSrv;
      if (s && s.sessions.size && dstIp.indexOf(TUNNEL_VORSATZ) === 0) {
        const t = s.sessions.get(dstIp);
        if (t) {
          const pkt = {
            src: (opts && opts.src) || SERVER_TUNNEL, dst: dstIp,
            ttl: (opts && opts.ttl) || stack.DEFAULT_TTL,
            proto: proto, id: stack.ipKennung(node), payload: payload
          };
          zeile(node, 'raus', pkt, true);
          senden(t, pkt);
          return true;
        }
      }
      return false;
    }

    /* Wer ist gerade am Server angemeldet? Für das Serverfenster. */
    const teilnehmer = (node) => {
      const s = node.state && node.state.vpnSrv;
      return s ? [...s.sessions.values()].map(t => ({ benutzer: t.benutzer, ip: t.ip, seit: t.seit })) : [];
    };

    return {
      PORT, SERVER_TUNNEL, TUNNEL_VORSATZ,
      laeuft, serverAn, serverAus, teilnehmer,
      verbinden, trennen, aktiv, stand, aufraeumen,
      umleiten, herein
    };
  }

  window.Vpn = { erzeugen: erzeugen, PORT: PORT, SERVER_TUNNEL: SERVER_TUNNEL };
})();
