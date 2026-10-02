/* ══════════════════════════════════════════════════════════════
   SYNIR — firewall.js   ·   Die Wand im Weg
   ══════════════════════════════════════════════════════════════
   Eine Firewall entscheidet bei jedem Paket, das durch einen
   Router WEITERGELEITET wird: durchlassen oder nicht. Mehr ist
   sie nicht — und genau darin liegt der Unterricht. „Geoblocking"
   ist kein eigenes Verfahren, sondern eine Liste von Adressbereichen,
   die jemand einem Land zugeordnet hat.

   Sie gibt es an den drei Geräten, die Wege vermitteln: Router,
   Heimrouter und cww. Ein Switch sieht keine IP-Adressen und kann
   hier nichts ausrichten; ein Rechner ist kein Weg, sondern ein Ziel.

   ── Wo sie sitzt ──────────────────────────────────────────────
   In `schichten.js`, in `onIp`, GENAU eine Stelle: nachdem der
   Router den Weg gewählt hat und bevor NAT das Paket umschreibt.
   Das ist die Stelle, an der iptables die Kette FORWARD prüft, und
   sie hat eine Folge, die man im Unterricht gern vergisst:

     hinaus   Die Regeln sehen noch die PRIVATE Adresse (192.168.1.37).
     herein   NAT hat die Antwort schon zurückübersetzt, die Regeln
              sehen also die private Zieladresse — nicht die des
              Routers.

   ⚠️ Pakete, die an den Router SELBST gehen (ein Ping auf seine
   Adresse) und Pakete, die er selbst losschickt, prüft die Firewall
   NICHT. Sie schützt das Netz HINTER dem Gerät, nicht das Gerät.
   Wer das einer Klasse zeigen will, braucht erst einen zweiten
   Router dahinter — und das ist ein guter Auftrag.

   ── Die Regeln ────────────────────────────────────────────────
   Je Zeile: Eingang · Quelle · Ziel · Protokoll · Port · Aktion.
   Von oben nach unten, die ERSTE passende gewinnt, und wenn keine
   passt, gilt die Standardaktion. Das ist die ganze Idee, und sie
   ist bei der echten Firewall dieselbe.

   ⭐ **Standard „verwerfen" macht aus der Liste eine Whitelist,
   „erlauben" eine Blacklist.** Beides in einer Tabelle, nur der
   Schalter ist ein anderer.

   Der EINGANG ist eine Schnittstelle des Geräts (Netzwerkkarte 2,
   WAN, Internet …), nicht das Wort „rein"/„raus": bei einem Router
   mit drei Karten gibt es kein Außen. Beim Heimrouter und beim cww
   steht hinter der Schnittstelle in Klammern, was gemeint ist.

   Drei Aktionen:
     erlauben   Das Paket geht weiter.
     verwerfen  Es verschwindet ohne ein Wort. Der Absender wartet
                bis zur Zeitüberschreitung — wie bei DROP.
     ablehnen   Es verschwindet, und der Absender bekommt SOFORT
                „Ziel nicht erreichbar … verboten" (ICMP Typ 3,
                Code 13) — wie bei REJECT. Der Unterschied
                zwischen beiden ist eine der schönsten Beobachtungen
                im Mitschnitt: einmal Stille, einmal eine Antwort.

   ── Verbindungen merken ───────────────────────────────────────
   Ein erlaubtes Paket wird notiert, und das ANTWORT-Paket dazu
   geht ohne weitere Prüfung durch. Ohne das müsste man bei einer
   Whitelist jede Regel zweimal schreiben (hin UND zurück), und die
   meisten Kinder würden die Rückrichtung vergessen. Mit dem Haken
   lässt sich beides zeigen: AN = „zurück geht von allein", AUS =
   „jede Richtung ist eine eigene Frage".

   Eine Zeile gilt 5 Minuten Simulationszeit nach dem LETZTEN Paket.

   ── Was hier bewusst fehlt ────────────────────────────────────
   Zustand für TCP-Flags (nur SYN prüfen, wie Filius es kennt),
   Protokolle über ICMP-Typ hinaus, Bandbreitenbegrenzung und
   Länder-Datenbanken: die „Länder" sind hier benannte Bereiche im
   Szenario, nicht GeoIP.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  const MERK_US = 300 * U.SEC;

  const AKTIONEN = ['erlauben', 'verwerfen', 'ablehnen'];
  const PROTOS   = ['*', 'tcp', 'udp', 'icmp'];

  /* „203.0.113.0/24", „203.0.113.0 255.255.255.0" oder eine einzelne
     Adresse. Leer heißt „beliebig". Beides — Präfix und Netzmaske —
     geht, weil der Unterricht beides schreibt (das cww zeigt
     „13.0.0.0/8", die Karten „255.255.255.0").

     Gerechnet wird mit dem NETZ der Angabe: wer „203.0.113.77/24"
     schreibt, meint das Netz 203.0.113.0, und das ist auch das, was
     ein echter Router daraus macht. */
  function netz(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t) return { any: true };
    let ip, mask;
    const m = t.match(/^(\S+?)\s*(?:\/\s*(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))$/);
    if (m) {
      ip = U.ip2int(m[1]);
      if (m[2] != null) mask = U.prefix2mask(+m[2]);
      else { mask = U.ip2int(m[3]); if (mask !== null && U.mask2prefix(mask) === null) mask = null; }
    } else {
      ip = U.ip2int(t); mask = 0xFFFFFFFF;
    }
    if (ip === null || mask === null || mask === undefined) return null;
    return { net: U.netOf(ip, mask), mask: mask >>> 0 };
  }

  /* „80" oder „1000-2000". Leer heißt „beliebig". */
  function port(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t) return { any: true };
    const m = t.match(/^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/);
    if (!m) return null;
    const von = +m[1], bis = m[2] != null ? +m[2] : von;
    if (von < 1 || bis > 65535 || von > bis) return null;
    return { von: von, bis: bis };
  }

  /* Eine Zeile aus dem Formular, geprüft. `null` heißt: unfertig —
     sie tut nichts, und im Fenster ist sie als unfertig zu sehen
     (dieselbe Regel wie bei den Portfreigaben in nat.js). */
  function regel(r) {
    if (!r) return null;
    const q = netz(r.quelle), z = netz(r.ziel), p = port(r.port);
    if (!q || !z || !p) return null;
    const proto = String(r.proto || '*').toLowerCase();
    if (PROTOS.indexOf(proto) < 0) return null;
    const aktion = String(r.aktion || 'verwerfen');
    if (AKTIONEN.indexOf(aktion) < 0) return null;
    return { ein: r.ein == null || r.ein === '' ? '*' : String(r.ein),
             q: q, z: z, proto: proto, p: p, aktion: aktion };
  }

  const passt = (n, ip) => n.any || U.netOf(ip, n.mask) === n.net;

  /* Welche Nummer im Paket steht für „welches Gespräch"? Wie in
     nat.js: Ports bei UDP/TCP, die Kennung beim ICMP-Echo. Alles
     andere (Fehlermeldungen) hat keine und wird nur über die
     Regeln geprüft. */
  function ports(pkt) {
    const p = pkt.payload || {};
    if (pkt.proto === 'tcp' || pkt.proto === 'udp') return { s: p.sport, d: p.dport };
    if (pkt.proto === 'icmp' && (p.type === 8 || p.type === 0) && p.id != null) return { s: p.id, d: p.id };
    return null;
  }

  function erzeugen(engine, netzwerk) {

    /* Laufzeitwissen, nicht gespeichert — wie die NAT-Tabelle. */
    function tb(node) {
      const s = node.state || (node.state = {});
      if (!s.fw) s.fw = {
        flows: new Map(),                // Schlüssel → Ablaufzeit
        zaehler: { erlaubt: 0, verworfen: 0, abgelehnt: 0, antworten: 0 },
        treffer: [],                     // je Regelzeile
        zuletzt: null                    // { t, regel, aktion, text }
      };
      return s.fw;
    }

    const kann = (node) => !!(node && netzwerk.KIND[node.kind] && netzwerk.KIND[node.kind].routes);
    const aktiv = (node) => !!(kann(node) && node.firewall && node.firewall.on);

    /* Schnittstelle normieren: die Buchsen der LAN-Brücke eines
       Heimrouters sind EINE Karte. */
    const eingangNr = (node, i) => netzwerk.istLan(node, i) ? netzwerk.LAN : (i | 0);

    function schluessel(pkt, umgekehrt) {
      const pp = ports(pkt);
      if (!pp) return null;
      return umgekehrt
        ? [pkt.proto, pkt.dst, pp.d, pkt.src, pp.s].join('|')
        : [pkt.proto, pkt.src, pp.s, pkt.dst, pp.d].join('|');
    }

    /* Die Regeln als Auskunft: geprüft, in der Reihenfolge der Zeilen,
       mit der Nummer, unter der sie im Fenster stehen (1-basiert). */
    function regeln(node) {
      const out = [];
      const liste = node.firewall && Array.isArray(node.firewall.regeln) ? node.firewall.regeln : [];
      liste.forEach((r, i) => { const g = regel(r); if (g) { g.nr = i + 1; out.push(g); } });
      return out;
    }

    /* ─── Die Prüfung ─────────────────────────────────────────
       Gibt IMMER eine Antwort zurück:
         { ok, aktion, regel, antwort, text }
       `regel` ist die Zeilennummer, 0 heißt Standardaktion;
       `antwort` ist wahr, wenn das Paket die Antwort auf ein schon
       erlaubtes Gespräch war. Ist die Firewall aus, ist es
       { ok: true, aus: true } und es wird nichts gezählt. */
    function pruefen(node, nicIn, pkt, say, frame) {
      if (!aktiv(node)) return { ok: true, aktion: 'erlauben', aus: true };
      const c = node.firewall, t = tb(node);
      const jetzt = engine.now;
      const src = U.ip2int(pkt.src), dst = U.ip2int(pkt.dst);
      const ein = String(eingangNr(node, nicIn));

      /* ─ Antwort auf ein erlaubtes Gespräch ─ */
      if (c.merken !== false) {
        const k = schluessel(pkt, true);
        const bis = k ? t.flows.get(k) : null;
        if (bis != null && bis > jetzt) {
          t.flows.set(k, jetzt + MERK_US);
          t.zaehler.antworten++;
          t.zuletzt = { t: jetzt, regel: 0, aktion: 'erlauben', text: 'Antwort auf ein erlaubtes Gespräch' };
          return { ok: true, aktion: 'erlauben', regel: 0, antwort: true,
                   text: 'Antwort auf ein erlaubtes Gespräch' };
        }
      }

      /* ─ Von oben nach unten ─ */
      let gew = null;
      for (const r of regeln(node)) {
        if (r.ein !== '*' && r.ein !== ein) continue;
        if (r.proto !== '*' && r.proto !== pkt.proto) continue;
        if (!passt(r.q, src) || !passt(r.z, dst)) continue;
        if (!r.p.any) {
          const pp = ports(pkt);
          if (!pp || pkt.proto === 'icmp' || pp.d < r.p.von || pp.d > r.p.bis) continue;
        }
        gew = r; break;
      }

      const std = AKTIONEN.indexOf(c.standard) >= 0 ? c.standard : 'erlauben';
      const aktion = gew ? gew.aktion : std;
      const nr = gew ? gew.nr : 0;
      const text = gew ? 'Regel ' + gew.nr + ' (' + aktion + ')' : 'Standard (' + aktion + ')';

      if (gew) t.treffer[gew.nr - 1] = (t.treffer[gew.nr - 1] || 0) + 1;
      t.zuletzt = { t: jetzt, regel: nr, aktion: aktion, text: text };

      if (aktion === 'erlauben') {
        t.zaehler.erlaubt++;
        const k = c.merken !== false ? schluessel(pkt, false) : null;
        if (k) t.flows.set(k, jetzt + MERK_US);
        return { ok: true, aktion: aktion, regel: nr, text: text };
      }

      if (aktion === 'ablehnen') t.zaehler.abgelehnt++; else t.zaehler.verworfen++;
      if (say) say('fw-drop', node, {
        nic: nicIn, dst: pkt.dst, src: pkt.src, proto: pkt.proto, regel: nr, aktion: aktion,
        text: text, pkt: JSON.parse(JSON.stringify(pkt)), frame: frame || null, level: 'warn'
      });
      return { ok: false, aktion: aktion, regel: nr, text: text };
    }

    /* Zahlen und Zustand für das Fenster. */
    function auskunft(node) {
      const t = tb(node);
      return {
        erlaubt: t.zaehler.erlaubt, verworfen: t.zaehler.verworfen,
        abgelehnt: t.zaehler.abgelehnt, antworten: t.zaehler.antworten,
        treffer: t.treffer.slice(), zuletzt: t.zuletzt, offen: t.flows.size
      };
    }

    /* „Zähler zurücksetzen" — und beim Ändern der Regeln, denn die
       Treffer je Zeile gehören zu dieser Zeile an dieser Stelle.
       Die gemerkten Gespräche bleiben stehen: sie sind eine
       Aussage über den Verkehr, nicht über die Regeln. */
    function leeren(node, auchGespraeche) {
      const s = node.state;
      if (!s || !s.fw) return;
      s.fw.zaehler = { erlaubt: 0, verworfen: 0, abgelehnt: 0, antworten: 0 };
      s.fw.treffer = []; s.fw.zuletzt = null;
      if (auchGespraeche) s.fw.flows.clear();
    }

    /* Die wählbaren Eingänge für das Fenster. `*` ist „beliebig". */
    function eingaenge(node) {
      const out = [{ wert: '*', text: 'beliebig' }];
      if (netzwerk.istHeim(node)) {
        out.push({ wert: String(netzwerk.WAN), text: 'WAN (von draußen)' });
        out.push({ wert: String(netzwerk.LAN), text: 'LAN (von innen)' });
      } else if (netzwerk.istCww(node)) {
        out.push({ wert: String(netzwerk.INET), text: 'Internet (von draußen)' });
        netzwerk.feste(node).forEach(k => {
          if (!netzwerk.istInternet(node, k.i)) out.push({ wert: String(k.i), text: netzwerk.portLabel(node, k.i) + ' (von innen)' });
        });
      } else {
        netzwerk.feste(node).forEach(k => out.push({ wert: String(k.i), text: netzwerk.portLabel(node, k.i) }));
      }
      return out;
    }

    return { pruefen, auskunft, leeren, eingaenge, aktiv, kann, regeln };
  }

  window.Firewall = { erzeugen, netz, port, regel, AKTIONEN, PROTOS };
})();
