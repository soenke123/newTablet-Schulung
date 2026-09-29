/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — internet.js   ·   Das Class Wide Web (cww)
   ══════════════════════════════════════════════════════════════
   Was hinter der Internet-Karte des cww liegt. Die EINZIGE Datei
   im Simulationskern, die weiß, dass es andere Tablets gibt.

   ── Das Bild, das dahintersteht ───────────────────────────────
   Jedes Kind bekommt einen Adressbereich, wie ein Anbieter ihn von
   der Vergabestelle bekommt: ein /8, also z. B. 67.0.0.0 bis
   67.255.255.255. Welches /8 wem gehört, erfährt niemand — so wie
   im echten Internet niemand am Telefon sagt, welche Adressen der
   Nachbar hat. Das eigene steht im Einstellfenster des cww.

   Alle cwws hängen im 8er-Netz (8.0.0.0/8) zusammen — dem Knoten,
   an dem sich im echten Internet die Anbieter treffen. Dort steht
   auch 8.8.8.8, der öffentliche DNS.

   ── Wie ein Paket zu einem anderen Tablet kommt ───────────────
   Gar nicht direkt. Es verlässt dieses Tablet über den Raum
   (bruecke.js → tool.js → Server), wartet dort auf den Empfänger,
   und dessen Tablet holt es bei der nächsten Abfrage ab und
   speist es an SEINER Internet-Karte ein (stack.vonInternet). Auf
   beiden Tablets läuft die Simulation ganz normal weiter — jedes
   mit seiner eigenen Uhr. Deshalb warten Fristen für fremde Ziele
   länger (FERN_FAKTOR in schichten.js).

   ── 8.8.8.8 ───────────────────────────────────────────────────
   Der echte 8.8.8.8 ist ein Auflöser: er fragt auf Anfrage die
   zuständigen Server (Wurzel → .de → Server der Domain). Hier ist
   er ein SAMMELVERZEICHNIS: jedes Tablet meldet die Einträge
   seiner DNS-Server, die von draußen erreichbar sind, und 8.8.8.8
   kennt sie alle. Die Vereinfachung ist gewollt — man kann
   hineinschauen, und die Lehre bleibt dieselbe: wer seinen
   DNS-Server nicht ins Internet stellt, den kennt dort niemand.

   Ein Name gehört dem, der ihn zuerst angemeldet hat (wie bei der
   echten Domainvergabe). Wer denselben Namen später anmeldet,
   sieht ihn als „vergeben".

   ── Drei Betriebsarten ────────────────────────────────────────
     solo   ohne Raum: nur das eigene Netz und 8.8.8.8 mit den
            eigenen Einträgen. Alles andere „nicht erreichbar".
     raum   im Raum: Pakete gehen über `opts.senden` hinaus.
     aus    in der Spiegelung am Beamer: die Lehrkraft funkt nie
            im Namen eines Kindes. Nichts geht hinaus.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  const DNS_IP = '8.8.8.8';
  const TYPEN  = { A: true, MX: true };

  function erzeugen(engine, netz, stack, opts) {
    opts = opts || {};

    let modus = 'solo';
    let fremd = [];                 // Verzeichnis vom Server: [{ typ, name, wert }]
    let vergeben = new Set();       // "typ|name", die jemand anderes hat
    let bereiche = [];              // die /8 der anderen Tablets im Raum: [13, 14, …]
    const ausgang = [];             // Pakete, die noch hinaus müssen
    let ipId = 1;

    const melde = (kind, node, data) => engine.emit('event', Object.assign(
      { kind: kind, node: node ? node.id : null, nodeName: node ? node.name : '', t: engine.now },
      data || {}));

    /* ═══ Hinaus ═══════════════════════════════════════════════ */
    function raus(node, pkt) {
      if (pkt.dst === DNS_IP) { achtAcht(node, pkt); return; }
      if (modus === 'aus') {
        melde('note', node, { level: 'info',
          text: 'Gespiegeltes Netz — ins Internet geht von hier aus nichts.' });
        return;
      }
      if (modus === 'solo') { stack.internetUnzustellbar(node, pkt); return; }
      ausgang.push(pkt);
      if (opts.senden) opts.senden();
    }

    /* Was die Brücke abholt. Leert den Ausgang. */
    function nehmen() {
      return ausgang.splice(0, ausgang.length);
    }

    /* ═══ Herein ═══════════════════════════════════════════════
       Was vom Server kommt, ist fremd: ein anderes Tablet hat es
       gebaut, und dazwischen lag das Netz. Also wird es geprüft,
       bevor die Simulation es anfasst — ein Paket, das sie nicht
       versteht, darf hier liegenbleiben und nicht drei Schichten
       tiefer umfallen. */
    function pruefen(p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
      if (U.ip2int(p.src) === null || U.ip2int(p.dst) === null) return false;
      if (['icmp', 'udp', 'tcp'].indexOf(p.proto) < 0) return false;
      if (typeof p.ttl !== 'number' || p.ttl < 1 || p.ttl > 255) return false;
      if (!p.payload || typeof p.payload !== 'object') return false;
      let text;
      try { text = JSON.stringify(p); } catch (e) { return false; }
      return text.length <= stack.INET_DECKEL;
    }

    /* Die Antwort des Raums auf eine Abfrage:
         pakete        an mein /8 (oder an meine 8er-Adresse)
         unzustellbar  meine eigenen, die niemand nehmen wollte
         verzeichnis   alle Namen, die 8.8.8.8 kennt
         vergeben      meine Namen, die schon jemand anderes hat
         bereiche      die /8 der anderen Tablets, die gerade da sind —
                       nur die Zahlen, nie, wem sie gehören */
    function rein(d) {
      d = d || {};
      if (modus !== 'raum') return;
      for (const p of d.pakete || []) {
        if (pruefen(p)) stack.vonInternet(p);
      }
      for (const p of d.unzustellbar || []) {
        if (pruefen(p)) stack.internetUnzustellbar(null, p);
      }
      if (Array.isArray(d.verzeichnis)) {
        fremd = d.verzeichnis
          .filter(e => e && TYPEN[e.typ] && typeof e.name === 'string' && typeof e.wert === 'string')
          .map(e => ({ typ: e.typ, name: e.name.toLowerCase().slice(0, 120), wert: e.wert.slice(0, 120) }));
      }
      if (Array.isArray(d.bereiche)) {
        bereiche = Array.from(new Set(d.bereiche.map(b => b | 0)))
          .filter(b => b >= 1 && b <= 223 && b !== 8 && b !== 10 && b !== 127)
          .sort((a, b) => a - b);
      }
      if (Array.isArray(d.vergeben)) {
        vergeben = new Set(d.vergeben.filter(e => e && TYPEN[e.typ])
          .map(e => e.typ + '|' + String(e.name).toLowerCase()));
      }
    }

    /* ═══ Das eigene Verzeichnis ═══════════════════════════════
       Welche Einträge meiner DNS-Server stehen draußen? Drei
       Bedingungen, und jede ist eine Lektion:

         1. Der DNS-Server läuft (installiert, gestartet, an).
         2. Er hat eine Adresse in MEINEM /8 und das cww kennt
            einen Weg zu ihm. Sonst kann 8.8.8.8 ihn nicht fragen.
         3. Der Eintrag zeigt in MEIN /8. Einen Namen auf eine
            private Adresse (192.168.…) anzumelden, hilft
            niemandem draußen; einen auf eine fremde Adresse
            anzumelden, hieße, für jemand anderen zu sprechen.

       Jeder Eintrag kommt mit einem Zustand heraus, damit das
       Fenster sagen kann, WARUM ein Name fehlt. */
    function eigene() {
      const cww = netz.cwwVon();
      const out = [];
      for (const n of netz.list()) {
        if (!n.dnsServer) continue;
        const laeuft = netz.dienstLaeuft(n, 'dns');
        const oeffentlich = n.nics.find(k => k.ip && netz.imEigenenNetz(k.ip));
        let erreicht = false;
        if (cww && oeffentlich && laeuft) {
          if (n.id === cww.id) erreicht = true;
          else {
            const r = stack.routeFor(cww, U.ip2int(oeffentlich.ip));
            erreicht = !!r && !netz.istInternet(cww, r.nic);
          }
        }
        const serverStatus = !laeuft ? 'aus' : !cww ? 'kein-cww'
          : !oeffentlich ? 'privat-server' : !erreicht ? 'unerreichbar' : null;

        for (const r of n.dnsServer.records || []) {
          const name = String(r.name || '').trim().toLowerCase();
          if (!name) continue;
          const wert = String(r.ip || '').trim();
          let status = serverStatus;
          if (!status) {
            if (U.ip2int(wert) === null) status = 'ungueltig';
            else if (!netz.imEigenenNetz(wert)) status = istPrivat(wert) ? 'privat' : 'fremde-adresse';
            else if (vergeben.has('A|' + name)) status = 'vergeben';
            else status = 'oeffentlich';
          }
          out.push({ typ: 'A', name: name, wert: wert, status: status, server: n.name });
        }
        for (const r of n.dnsServer.mx || []) {
          const name = String(r.domain || '').trim().toLowerCase();
          if (!name) continue;
          const wert = String(r.server || '').trim().toLowerCase();
          let status = serverStatus;
          if (!status) status = vergeben.has('MX|' + name) ? 'vergeben' : 'oeffentlich';
          out.push({ typ: 'MX', name: name, wert: wert, status: status, server: n.name });
        }
      }
      return out;
    }

    /* Was an den Server geht: nur die öffentlichen, jeder Name
       einmal (der erste gewinnt, wie draußen auch). */
    function veroeffentlicht() {
      const gesehen = new Set();
      const out = [];
      for (const e of eigene()) {
        if (e.status !== 'oeffentlich' && e.status !== 'vergeben') continue;
        const k = e.typ + '|' + e.name;
        if (gesehen.has(k)) continue;
        gesehen.add(k);
        out.push({ typ: e.typ, name: e.name, wert: e.wert });
      }
      return out;
    }

    /* Was 8.8.8.8 weiß. Im Raum das Verzeichnis des Servers; dazu
       die eigenen öffentlichen Namen, die der Server noch nicht
       gesehen hat (sonst wäre ein frisch eingetragener Name bis zur
       nächsten Abfrage unbekannt — auch für das eigene Netz). */
    function bekannt() {
      const map = new Map();
      if (modus === 'raum') for (const e of fremd) map.set(e.typ + '|' + e.name, e);
      for (const e of eigene()) {
        if (e.status !== 'oeffentlich') continue;
        const k = e.typ + '|' + e.name;
        if (!map.has(k)) map.set(k, { typ: e.typ, name: e.name, wert: e.wert });
      }
      return map;
    }

    /* Für das Fenster „8.8.8.8": alles, was 8.8.8.8 kennt, plus die
       eigenen Einträge, die es NICHT kennt — mit dem Grund. Keine
       Spalte „wem gehört das": das weiß 8.8.8.8 auch nicht. */
    function liste() {
      const eig = eigene();
      const eigSchl = new Set(eig.map(e => e.typ + '|' + e.name + '|' + e.wert));
      const rows = [];
      for (const e of bekannt().values()) {
        rows.push({ typ: e.typ, name: e.name, wert: e.wert,
                    status: eigSchl.has(e.typ + '|' + e.name + '|' + e.wert) ? 'eigen' : 'fremd' });
      }
      for (const e of eig) {
        if (e.status === 'oeffentlich') continue;
        rows.push({ typ: e.typ, name: e.name, wert: e.wert, status: e.status, server: e.server });
      }
      rows.sort((a, b) => a.name.localeCompare(b.name) || a.typ.localeCompare(b.typ));
      return rows;
    }

    /* ═══ 8.8.8.8 ═════════════════════════════════════════════
       Steht in der Wolke und nicht auf der Fläche: es ist ein
       Dienst des Class Wide Web, kein Gerät eines Kindes. Es
       beantwortet DNS-Fragen (UDP 53) und Pings — `ping 8.8.8.8`
       ist seit jeher der erste Test, ob „das Internet geht". */
    function achtAcht(node, pkt) {
      const antwort = (payload, proto) => {
        stack.vonInternet({
          src: DNS_IP, dst: pkt.src, ttl: 58, proto: proto,
          id: ipId++, payload: payload
        });
      };
      if (pkt.proto === 'icmp' && pkt.payload && pkt.payload.type === 8) {
        const m = pkt.payload;
        antwort({ type: 0, code: 0, id: m.id, seq: m.seq, data: m.data }, 'icmp');
        return;
      }
      if (pkt.proto !== 'udp' || !pkt.payload || pkt.payload.dport !== stack.PORT.dns) return;
      const u = pkt.payload;
      const d = u.data || {};
      if (d.art !== 'frage') return;
      const name = String(d.name || '').toLowerCase();
      const map = bekannt();
      let data;
      if (d.typ === 'MX') {
        const e = map.get('MX|' + name);
        data = { art: 'antwort', typ: 'MX', name: name, mx: e ? e.wert : null };
      } else {
        const e = map.get('A|' + name);
        data = { art: 'antwort', name: name, ip: e ? e.wert : null };
      }
      melde('note', node, { level: 'info',
        text: '8.8.8.8 beantwortet „' + name + '"' + (d.typ === 'MX' ? ' (MX)' : '') + ': '
          + (data.ip || data.mx || 'unbekannt') });
      antwort({ sport: stack.PORT.dns, dport: u.sport, data: data }, 'udp');
    }

    function istPrivat(ip) {
      const v = U.ip2int(ip);
      if (v === null) return false;
      const a = v >>> 24, b = (v >>> 16) & 255;
      return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }

    /* ─── Einstellen ──────────────────────────────────────────*/
    function setModus(m) {
      modus = m === 'raum' || m === 'aus' ? m : 'solo';
      if (modus !== 'raum') { fremd = []; vergeben = new Set(); bereiche = []; ausgang.length = 0; }
    }

    /* Die Bereiche der anderen, die über das cww erreichbar sind —
       ohne den eigenen. Ohne Raum (und in der Spiegelung) ist die
       Liste leer: dann gibt es niemanden. */
    function andere() {
      const eigen = netz.internetConf().prefix;
      return modus === 'raum' ? bereiche.filter(b => b !== eigen) : [];
    }

    const api = {
      DNS_IP,
      raus, nehmen, rein, eigene, veroeffentlicht, liste, andere, setModus,
      get modus() { return modus; },
      get wartend() { return ausgang.length; }
    };
    stack.setInternet(api);
    return api;
  }

  /* Die Sätze zu den Zuständen — hier und nicht im Fenster, damit
     der Prüfstand sie ohne DOM lesen kann. */
  const STATUS_TEXT = {
    eigen:            'aus deinem Netz',
    fremd:            'aus einem anderen Netz',
    vergeben:         'Name ist schon vergeben',
    privat:           'private Adresse — draußen nicht erreichbar',
    'fremde-adresse': 'Adresse liegt nicht in deinem Bereich',
    ungueltig:        'keine gültige Adresse',
    aus:              'DNS-Server läuft nicht',
    'kein-cww':       'kein cww im Netz',
    'privat-server':  'DNS-Server hat keine Adresse aus deinem Bereich',
    unerreichbar:     'cww kennt keinen Weg zum DNS-Server'
  };

  window.Internet = { erzeugen, DNS_IP, STATUS_TEXT };
})();
