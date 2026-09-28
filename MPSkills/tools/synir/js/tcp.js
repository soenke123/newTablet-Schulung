/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — tcp.js   ·   Schicht 4, die verbindliche
   ══════════════════════════════════════════════════════════════
   UDP steht in `schichten.js` und ist dort in dreißig Zeilen
   erledigt: zwei Portnummern, fertig. TCP ist das Gegenteil und
   deshalb eine eigene Datei — nicht wegen der Länge, sondern weil
   es eine andere ART von Sache ist.

   `schichten.js` ist zustandsloses Weiterleiten: ein Rahmen kommt
   an, wird zugestellt oder weitergegeben, und danach weiß das
   Gerät nichts mehr davon. TCP ist ein **Zustandsautomat je
   Verbindung**, mit Nummern, die mitzählen, und Fristen, die
   ablaufen. In dieselbe Datei gelegt wäre die Grenze zwischen
   „Weg" und „Verbindung" nicht mehr zu sehen — dieselbe
   Begründung wie bei `nat.js`.

   ── Was ein Kind hier sehen soll ──────────────────────────────
   1. Ein Port sagt, WELCHES PROGRAMM gemeint ist. Die Adresse
      bringt das Paket zum Rechner, der Port zum Webserver (80)
      und nicht zum E-Mail-Server (25).
   2. Vor dem ersten Byte reden die beiden dreimal miteinander
      (SYN → SYN,ACK → ACK). Das steht als drei Zeilen im
      Mitschnitt, bevor überhaupt etwas übertragen wird.
   3. Jedes Byte wird BESTÄTIGT. Bleibt die Bestätigung aus, wird
      wiederholt. Genau das kann UDP nicht — und genau deshalb
      liegt HTTP auf TCP und DNS auf UDP.
   4. Hört auf dem Port niemand, kommt ein RST zurück, und zwar
      sofort. Bei UDP ist es ein ICMP „Port nicht erreichbar";
      beide sagen dasselbe, und der Unterschied ist zu sehen.

   ── Was bewusst fehlt ─────────────────────────────────────────
   Fenstergröße und Flusskontrolle, Überlastregelung, Nagle,
   selektive Bestätigung, der Puffer für Segmente, die in der
   falschen REIHENFOLGE ankommen (in diesem Simulator nimmt jedes
   Segment denselben Weg, also kann das nur bei Verlust passieren
   — und dann wiederholt der Absender ohnehin), TIME-WAIT.
   Prüfsumme und Länge fehlen wie bei UDP.

   ⚠️ **Die Sequenznummer zählt BYTES**, und SYN und FIN
   verbrauchen je eine Nummer — genau wie im echten TCP. Das ist
   keine Pedanterie: nur so geht die Rechnung „Seq 1000, 24 Byte,
   also als Nächstes 1024" im Mitschnitt auf, und genau die soll
   ein Kind nachrechnen können. Die Anfangsnummer ist vierstellig
   und gewürfelt (echt sind es 32 Bit) — sie soll ablesbar sein.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* ─── Die Frist, und warum sie ausgerechnet so lang ist ──────
     Sie muss ÜBER der Geduld der Adressauflösung liegen. Ein
     erstes SYN wartet, bis ARP die MAC-Adresse hat; gibt ARP erst
     nach ARP_WAIT × ARP_RETRIES (0,8 s × 3 = 2,4 s) auf, dann
     hätte eine kürzere TCP-Frist mittendrin ein zweites SYN
     losgeschickt — auf einen Weg, der noch gar nicht offen war.
     Im Mitschnitt stünde dann zweimal SYN, und die Lehre daraus
     wäre falsch: es ist nichts verloren gegangen.

     Und sie muss UNTER dem liegen, was ein Mensch aushält: die
     Frist zählt in simulierter Zeit und wird auf dem Bildschirm
     durch das Tempo geteilt. Bei Tempo 0,1 sind 3 s schon eine
     halbe echte Minute.

     EINE Wiederholung, nicht drei. Ein verlorenes Segment ist ein
     Versuch wert — die Lehre („TCP holt das nach") steht nach dem
     ersten. Beim zweiten und dritten sieht man dieselbe Zeile noch
     einmal und wartet neunzehn Sekunden länger.

     Zwei kopflose Prüfungen wachen über beide Richtungen.        */
  const TCP_FRIST  = 3000 * U.MS;
  const TCP_WIEDER = 1;

  /* Flüchtige Ports, aus denen ein Client seinen Absender zieht —
     dieselbe Spanne wie in Filius (`TransportProtokoll`) und im
     echten Netz. Über 49151, damit im Mitschnitt auf einen Blick
     zu unterscheiden ist, welche der beiden Nummern jemandem
     GEHÖRT (80, 25, 110) und welche nur vergeben wurde. */
  const FLUECHTIG_VON = 49152, FLUECHTIG_BIS = 65535;

  /* Wie ein Zustand heißt, wenn ihn jemand liest (`netstat`).
     Deutsch, wie alles andere in diesem Programm auch; die FLAGS
     bleiben dagegen bei SYN/ACK/FIN/RST — das sind die Wörter,
     die auf jedem Schaubild und in jedem Mitschnitt stehen, und
     sie zu übersetzen hieße, ein Kind vom echten Werkzeug
     abzuschneiden. */
  const ZUSTAND_TEXT = {
    hoert:     'hört zu',
    aufbau:    'baut auf',
    verbunden: 'verbunden',
    abbau:     'schließt',
    zu:        'zu'
  };

  function erzeugen(engine, netz, api) {
    const sendIp = api.sendIp;
    const say    = api.say;
    const PROC   = api.PROC || 50;

    let laufNr = 1;

    /* ─── Zustand je Gerät ────────────────────────────────────
       Wie alles in `node.state`: Laufzeitwissen, das nicht in die
       gespeicherte Datei gehört. Wer einen Stand lädt, hat keine
       offenen Verbindungen — genau wie ein Netz, das gerade
       eingeschaltet wurde. */
    function tz(node) {
      const s = node.state || (node.state = {});
      if (!s.tcp) s.tcp = {
        verb:   new Map(),   // "lport|fernIp|fport" → Verbindung
        hoeren: new Map()    // Port → { fn, programm }
      };
      return s.tcp;
    }

    const schluessel = (lport, fernIp, fport) => lport + '|' + fernIp + '|' + fport;

    /* Was ein Segment an Sequenznummern verbraucht. SYN und FIN
       zählen je eine mit, obwohl sie kein Byte tragen — sonst
       könnte die Gegenseite ihre Bestätigung nicht von der für das
       erste echte Byte unterscheiden. */
    function verbrauch(seg) {
      return (seg.data ? seg.data.length : 0)
        + (seg.fl && seg.fl.syn ? 1 : 0)
        + (seg.fl && seg.fl.fin ? 1 : 0);
    }

    const anfangsNummer = () => 1000 + engine.randInt(9000);

    /* ─── Einen freien Absenderport finden ────────────────────
       Gewürfelt wie im echten Netz, aber aus dem gesäten
       Zufallsgenerator der Uhr: zwei Durchläufe desselben
       Szenarios zeigen denselben Mitschnitt, sonst wäre er nicht
       vergleichbar. */
    function freierPort(node) {
      const t = tz(node);
      const spanne = FLUECHTIG_BIS - FLUECHTIG_VON + 1;
      const start = engine.randInt(spanne);
      for (let i = 0; i < spanne; i++) {
        const p = FLUECHTIG_VON + ((start + i) % spanne);
        if (t.hoeren.has(p)) continue;
        let belegt = false;
        for (const c of t.verb.values()) if (c.lokalPort === p) { belegt = true; break; }
        if (!belegt) return p;
      }
      return null;
    }

    /* ═══ Ein Segment hinausgeben ════════════════════════════ */

    function raus(conn, seg) {
      return sendIp(conn.node, conn.fernIp, 'tcp', seg, {
        src: conn.lokalIp || undefined,
        /* Kommt das Paket gar nicht erst auf die Leitung (kein
           Weg, keine MAC-Adresse), ist die Verbindung sofort
           erledigt. Auf die Frist zu warten wäre hier nur
           Zeitverschwendung — es ist nichts unterwegs, das noch
           ankommen könnte. */
        onFail: (code, why) => abbruch(conn, why || 'Der Weg dorthin ist zu.')
      });
    }

    function segment(conn, fl, data) {
      return {
        sport: conn.lokalPort, dport: conn.fernPort,
        seq: conn.seq, ack: conn.ack,
        fl: Object.assign({ syn: false, ack: false, fin: false, rst: false }, fl || {}),
        data: data || null
      };
    }

    /* Ein Segment, das Sequenzraum verbraucht, wird gemerkt und
       wiederholt. Eine reine Bestätigung wird NICHT gemerkt — sie
       verbraucht keine Nummer, und ein verlorenes ACK holt die
       Gegenseite durch ihre eigene Wiederholung zurück. Wer auch
       ACKs wiederholt, baut sich eine Schleife aus zwei Geräten,
       die einander ewig bestätigen. */
    function sende(conn, fl, data) {
      const seg = segment(conn, fl, data);
      const n = verbrauch(seg);
      conn.seq += n;
      raus(conn, seg);
      if (n) merken(conn, seg);
      return seg;
    }

    function merken(conn, seg) {
      const e = { seg: seg, ende: seg.seq + verbrauch(seg), versuche: 0, ev: null };
      conn.offen.push(e);
      planen(conn, e);
    }

    function planen(conn, e) {
      e.ev = engine.at(TCP_FRIST, () => {
        if (conn.zustand === 'zu') return;
        if (conn.offen.indexOf(e) < 0) return;      // inzwischen bestätigt
        if (e.versuche >= TCP_WIEDER) {
          abbruch(conn, 'Keine Bestätigung für ' + (e.seg.data ? 'die Daten' : 'den Verbindungsaufbau')
            + ' — die Gegenstelle antwortet nicht.');
          return;
        }
        e.versuche++;
        say('note', conn.node, {
          text: 'Keine Bestätigung von ' + conn.fernIp + ':' + conn.fernPort
              + ' — Segment wird wiederholt.',
          level: 'warn'
        });
        raus(conn, e.seg);
        planen(conn, e);
      }, 'tcp-frist', conn.node.id);
    }

    function bestaetigt(conn, bisNr) {
      for (const e of conn.offen.slice()) {
        if (e.ende <= bisNr) {
          engine.cancel(e.ev);
          conn.offen.splice(conn.offen.indexOf(e), 1);
        }
      }
    }

    /* ═══ Eine Verbindung ════════════════════════════════════ */

    function neueVerbindung(node, lokalIp, lokalPort, fernIp, fernPort, programm) {
      const conn = {
        id: 'tcp-' + (laufNr++),
        node: node, lokalIp: lokalIp, lokalPort: lokalPort,
        fernIp: fernIp, fernPort: fernPort,
        programm: programm || '',
        zustand: 'aufbau',
        seq: anfangsNummer(),
        ack: 0,
        offen: [],
        /* ⚠️ Der Abbau braucht ZWEI Merker, und der erste Entwurf
           hatte keinen davon. Er warf die Verbindung weg, sobald
           das eigene FIN bestätigt war — also bevor das FIN der
           Gegenseite überhaupt ankam. Das traf dann auf eine
           Verbindung, die es nicht mehr gab, und der Abbau endete
           mit einem RST statt mit einem ACK. Genau dafür hat das
           echte TCP seinen TIME-WAIT-Zustand.

           Weggeworfen wird erst, wenn BEIDE Seiten ihr FIN
           geschickt haben und nichts mehr unbestätigt ist. Der
           Prüfstand hat es gefunden, das Bild hätte es nie
           gezeigt. */
        finRein: false, finRaus: false, zuGemeldet: false,
        daten: null, zuCb: null, aufbauCb: null,
        /* Was eine Anwendung von einer Verbindung sieht. Mehr
           braucht ein Programm nicht: schicken, zuhören, zumachen. */
        senden(text) {
          if (conn.zustand !== 'verbunden') return false;
          sende(conn, { ack: true }, String(text));
          return true;
        },
        schliessen() { schliessen(conn); },
        onDaten(fn) { conn.daten = fn; },
        onZu(fn) { conn.zuCb = fn; }
      };
      tz(node).verb.set(schluessel(lokalPort, fernIp, fernPort), conn);
      return conn;
    }

    function wegwerfen(conn) {
      for (const e of conn.offen) engine.cancel(e.ev);
      conn.offen.length = 0;
      conn.zustand = 'zu';
      tz(conn.node).verb.delete(schluessel(conn.lokalPort, conn.fernIp, conn.fernPort));
    }

    /* Abbruch heißt: es geht nicht mehr weiter, und jemand muss es
       erfahren. Wer noch auf den Verbindungsaufbau wartet, bekommt
       den Grund; wer schon verbunden war, bekommt `onZu`. */
    function abbruch(conn, grund) {
      if (conn.zustand === 'zu') return;
      const wartet = conn.aufbauCb;
      wegwerfen(conn);
      say('note', conn.node, { text: grund, level: 'warn' });
      if (wartet) { conn.aufbauCb = null; wartet(grund, null); }
      else meldeZu(conn, grund);
    }

    function schliessen(conn) {
      if (conn.zustand === 'verbunden') {
        conn.zustand = 'abbau';
        conn.finRaus = true;
        sende(conn, { ack: true, fin: true });
      } else if (conn.zustand !== 'zu') {
        wegwerfen(conn);
      }
    }

    /* Fertig ist der Abbau erst, wenn beide ihr FIN geschickt
       haben UND nichts mehr auf eine Bestätigung wartet. */
    function pruefeFertig(conn) {
      if (conn.zustand === 'zu') return;
      if (conn.finRein && conn.finRaus && !conn.offen.length) wegwerfen(conn);
    }

    /* `onZu` genau einmal. Beim Abbau kommen zwei Segmente an, die
       beide „es ist vorbei" bedeuten (das FIN und die Bestätigung
       des eigenen FIN) — ein Programm, das zweimal aufräumt, ist
       der Fehler, den man erst drei Schritte später sieht. */
    function meldeZu(conn, grund) {
      if (conn.zuGemeldet) return;
      conn.zuGemeldet = true;
      const zu = conn.zuCb;
      if (zu) melden(conn, () => zu(grund || null));
    }

    /* ═══ Hinhören und verbinden — die zwei Seiten ═══════════ */

    function hoeren(node, port, fn, programm) {
      tz(node).hoeren.set(port, { fn: fn, programm: programm || '' });
    }

    function nichtHoeren(node, port) {
      const t = tz(node);
      t.hoeren.delete(port);
      /* Ein Serverprogramm, das beendet wird, nimmt seine offenen
         Verbindungen mit. Sonst stünden sie in `netstat`, während
         niemand mehr dahinter sitzt. */
      for (const c of [...t.verb.values()]) if (c.lokalPort === port) wegwerfen(c);
    }

    const hoert = (node, port) => tz(node).hoeren.has(port);

    function verbinde(node, zielIp, zielPort, programm, cb) {
      cb = cb || function () {};
      if (!node.on) { cb('Das Gerät ist ausgeschaltet.', null); return null; }
      if (U.ip2int(zielIp) === null) { cb('Keine gültige Zieladresse.', null); return null; }
      const port = freierPort(node);
      if (port === null) { cb('Kein freier Absenderport mehr.', null); return null; }

      const conn = neueVerbindung(node, null, port, zielIp, zielPort, programm);
      conn.aufbauCb = cb;
      sende(conn, { syn: true });
      return conn;
    }

    /* ═══ Was ankommt ════════════════════════════════════════ */

    function empfangen(node, nicIndex, pkt) {
      if (!node.on) return;
      const seg = pkt.payload || {};
      const t = tz(node);

      const conn = t.verb.get(schluessel(seg.dport, pkt.src, seg.sport));
      if (conn) { anVerbindung(conn, pkt, seg); return; }

      const l = t.hoeren.get(seg.dport);
      if (l && seg.fl && seg.fl.syn && !seg.fl.ack) {
        const c = neueVerbindung(node, pkt.dst, seg.dport, pkt.src, seg.sport, l.programm);
        c.ack = seg.seq + verbrauch(seg);
        c.annahme = l.fn;
        sende(c, { syn: true, ack: true });
        return;
      }

      /* Niemand da. ⚠️ Auf ein RST folgt kein RST — sonst werfen
         sich zwei Geräte die Absage gegenseitig zu, bis eines
         aufhört, und im Mitschnitt stünde eine Schleife statt einer
         Antwort. */
      if (seg.fl && seg.fl.rst) return;
      say('port-zu', node, { port: seg.dport, from: pkt.src, level: 'info', proto: 'tcp' });
      sendIp(node, pkt.src, 'tcp', {
        sport: seg.dport, dport: seg.sport,
        seq: seg.ack || 0, ack: seg.seq + verbrauch(seg),
        fl: { syn: false, ack: true, fin: false, rst: true }, data: null
      }, { src: pkt.dst });
    }

    function anVerbindung(conn, pkt, seg) {
      const fl = seg.fl || {};

      if (fl.rst) {
        const wartet = conn.aufbauCb;
        wegwerfen(conn);
        const grund = 'Auf Port ' + conn.fernPort + ' von ' + conn.fernIp + ' hört niemand zu.';
        say('note', conn.node, { text: grund, level: 'warn' });
        if (wartet) { conn.aufbauCb = null; wartet(grund, null); }
        else meldeZu(conn, grund);
        return;
      }

      if (fl.ack) bestaetigt(conn, seg.ack);

      /* ─ Der Client bekommt SYN,ACK ─ Damit steht die Verbindung
         von seiner Seite aus; sein ACK ist das dritte der drei. */
      if (conn.zustand === 'aufbau' && fl.syn && fl.ack) {
        conn.ack = seg.seq + verbrauch(seg);
        conn.zustand = 'verbunden';
        /* Die Bestätigung des Handschlags trägt keine Daten und
           verbraucht deshalb keine Nummer — sie wird nicht
           wiederholt (siehe `sende`). */
        sende(conn, { ack: true });
        melden(conn, () => {
          const cb = conn.aufbauCb; conn.aufbauCb = null;
          if (cb) cb(null, conn);
        });
        return;
      }

      /* ─ Der Server bekommt das dritte ─ Jetzt erst darf das
         Programm etwas von dieser Verbindung wissen. */
      if (conn.zustand === 'aufbau' && fl.ack && !fl.syn) {
        conn.zustand = 'verbunden';
        const annahme = conn.annahme; conn.annahme = null;
        if (annahme) melden(conn, () => annahme(conn));
        // Ein erstes Segment darf zusammen mit dem ACK kommen.
        if (!seg.data) return;
      }

      /* ─ Daten ─ */
      if (seg.data) {
        if (seg.seq === conn.ack) {
          conn.ack += seg.data.length;
          const text = seg.data;
          melden(conn, () => { if (conn.daten) conn.daten(text, conn); });
          sende(conn, { ack: true });
        } else {
          /* Nicht das erwartete Stück: entweder schon gehabt
             (Wiederholung) oder eine Lücke davor. Beides wird mit
             derselben Bestätigung beantwortet — „ich bin immer
             noch hier". Einen Puffer für die falsche Reihenfolge
             gibt es hier nicht, siehe Dateikopf. */
          sende(conn, { ack: true });
        }
      }

      /* ─ Die Gegenseite macht zu ─ Erst bestätigen, dann selbst
         zumachen: zwei Segmente, nicht eines. So stehen die vier
         Schritte des Abbaus einzeln im Mitschnitt, und genau so
         zeichnet sie jedes Schulbuch. */
      if (fl.fin) {
        conn.finRein = true;
        conn.ack += 1;
        sende(conn, { ack: true });
        if (!conn.finRaus) {
          conn.zustand = 'abbau';
          conn.finRaus = true;
          sende(conn, { ack: true, fin: true });
        }
        meldeZu(conn);
        pruefeFertig(conn);
        return;
      }

      pruefeFertig(conn);
    }

    /* Rückrufe an die Anwendung laufen NICHT mitten in der
       Zustellung, sondern als eigenes Ereignis kurz danach. Sonst
       könnte ein Programm, das in `onDaten` gleich wieder sendet,
       mitten in der Bearbeitung des ankommenden Segments ein neues
       losschicken — und die Reihenfolge im Mitschnitt stimmte
       nicht mehr mit der Geschichte überein. */
    function melden(conn, fn) {
      engine.at(PROC, () => { if (conn.node.on) fn(); }, 'tcp-melden', conn.node.id);
    }

    /* ═══ Auskunft ═══════════════════════════════════════════ */

    /* Für `netstat` und für die Tabellen im Gerätefenster. */
    function zeilen(node) {
      const t = tz(node);
      const eigen = (node.nics.find(k => k.ip) || {}).ip || '0.0.0.0';
      const out = [];
      for (const [port, l] of t.hoeren)
        out.push({ proto: 'TCP', lokal: eigen + ':' + port, fern: '—',
                   zustand: ZUSTAND_TEXT.hoert, programm: l.programm });
      for (const c of t.verb.values())
        out.push({ proto: 'TCP', lokal: (c.lokalIp || eigen) + ':' + c.lokalPort,
                   fern: c.fernIp + ':' + c.fernPort,
                   zustand: ZUSTAND_TEXT[c.zustand] || c.zustand, programm: c.programm });
      return out;
    }

    /* Ein Gerät, das ausgeschaltet wird, hat keine Verbindungen
       mehr. Gerufen aus `dienste.sync()` — der einen Stelle, die
       ohnehin nach jedem Ein- und Ausschalten aufräumt. */
    function aufraeumen(node) {
      const t = tz(node);
      for (const c of [...t.verb.values()]) wegwerfen(c);
      t.hoeren.clear();
    }

    return {
      empfangen, hoeren, nichtHoeren, hoert, verbinde, zeilen, aufraeumen,
      TCP_FRIST, TCP_WIEDER, ZUSTAND_TEXT
    };
  }

  window.Tcp = { erzeugen: erzeugen };
})();
