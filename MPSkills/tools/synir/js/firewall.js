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

   ── Eine Liste, ein Typ ───────────────────────────────────────
   Es gibt EINE Liste von Adressen und einen Schalter, was sie
   bedeutet (vom Nutzer so gesetzt — vorher stand eine Aktion an
   jeder Zeile, und beides gemischt ergab keinen Sinn):

     Blacklist   Was auf der Liste steht, wird GESPERRT.
                 Alles andere kommt durch.
     Whitelist   Nur was auf der Liste steht, kommt DURCH.
                 Alles andere wird gesperrt.

   Eine Zeile trifft ein Paket, wenn ihre Adresse der ABSENDER
   oder das ZIEL ist („alles von und zu diesem Bereich"). Damit
   gilt eine Zeile in beide Richtungen, und ein Wort wie „rein"
   oder „raus" gibt es nicht: bei einem Router mit drei Karten
   gibt es kein Außen. Eine Folge, die man gern übersieht: die
   Antwort auf ein erlaubtes Paket trägt dieselbe Adresse, und
   deshalb braucht es hier kein „Verbindungen merken".

   ── Was eine Zeile sein kann ──────────────────────────────────
     Adresse + Netzmaske    192.0.0.0 / 255.0.0.0 → das ganze Netz
     Adresse allein         192.168.2.1 → genau dieses Gerät
     ein Name               www.beispiel.de → siehe unten

   ⚠️ Eine Adresse ohne Maske ist EIN Gerät, nicht „das Netz, in dem
   sie liegt". Aus „192.0.0.0" das Netz 192.x.x.x zu erraten wäre
   Magie, und genau die Zahlen mit den Nullen sind die, bei denen
   Kinder die Maske vergessen. Im Fenster steht unter jeder Zeile,
   was daraus folgt („von 192.0.0.0 bis 192.255.255.255").

   ── Namen ─────────────────────────────────────────────────────
   Eine Firewall sieht nur Adressen. Ein Name wird deshalb IN eine
   Adresse aufgelöst — mit dem DNS, den der Router ohnehin kennt —,
   und gesperrt wird DIESE Adresse. Das ist die Aussage:
     · ändert der Name seine Adresse, greift die Sperre erst nach
       der nächsten Auflösung (alle 60 s Simulationszeit);
     · teilen sich zwei Namen eine Adresse, ist der zweite mit
       gesperrt;
     · ist der Name nicht aufzulösen, tut die Zeile NICHTS — und das
       steht im Fenster, mit dem Grund.
   Aufgelöst wird, sobald die Uhr läuft und die Firewall an ist;
   davor (im Entwurf) steht dort „noch nicht aufgelöst".

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

   ── Wie gesperrt wird ─────────────────────────────────────────
     verwerfen  Das Paket verschwindet ohne ein Wort. Der Absender
                wartet bis zur Zeitüberschreitung — wie bei DROP.
     ablehnen   Es verschwindet, und der Absender bekommt SOFORT
                „Ziel nicht erreichbar … verboten" (ICMP Typ 3,
                Code 13) — wie bei REJECT. Der Unterschied
                zwischen beiden ist eine der schönsten Beobachtungen
                im Mitschnitt: einmal Stille, einmal eine Antwort.
   Das ist eine Einstellung der ganzen Firewall, nicht der Zeile.

   ── Was hier bewusst fehlt ────────────────────────────────────
   Ports, Protokolle und Schnittstellen („nur TCP 80", „nur von
   WAN"): vom Nutzer gestrichen — die Firewall soll einfach alles
   blockieren. Ausnahmen innerhalb einer Liste und damit eine
   Reihenfolge fehlen ebenfalls. Länder-Datenbanken: die „Länder"
   sind hier benannte Bereiche im Szenario, nicht GeoIP.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* Wie lange eine aufgelöste Adresse gilt, bevor neu gefragt wird. */
  const NAMEN_US = 60 * U.SEC;

  const TYPEN = ['blacklist', 'whitelist'];

  /* Die Netzmaske: leer (= genau diese Adresse), „255.255.0.0", und
     nachsichtig auch „16" oder „/16" — wer sie so tippt, meint es. */
  function maske(text) {
    const t = String(text == null ? '' : text).trim().replace(/^\//, '');
    if (!t) return 0xFFFFFFFF;
    if (/^\d{1,2}$/.test(t)) { const m = U.prefix2mask(+t); return m === null || m === undefined ? null : m >>> 0; }
    const m = U.ip2int(t);
    if (m === null || U.mask2prefix(m) === null) return null;
    return m >>> 0;
  }

  const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  const istName = (t) => {
    t = String(t == null ? '' : t).trim().toLowerCase();
    return NAME_RE.test(t) && /[a-z]/.test(t);
  };

  /* Eine Zeile aus dem Formular, geprüft. `null` heißt: unfertig —
     sie tut nichts, und im Fenster ist sie als unfertig zu sehen
     (dieselbe Regel wie bei den Portfreigaben in nat.js).

       { art: 'netz', net, mask }     eine Adresse oder ein Bereich
       { art: 'name', name }          ein Name (die Adresse kommt vom DNS)

     Eine leere Adresse ist NICHT „beliebig": eine Liste, in der
     eine leere Zeile alles trifft, wäre eine, die man mit einem
     Klick auf „+ Adresse" versehentlich scharfstellt. */
  function eintrag(r) {
    if (!r) return null;
    const a = String(r.adresse == null ? '' : r.adresse).trim();
    if (!a) return null;
    const ip = U.ip2int(a);
    if (ip !== null) {
      const m = maske(r.maske);
      if (m === null) return null;
      return { art: 'netz', net: U.netOf(ip, m), mask: m };
    }
    if (istName(a)) return { art: 'name', name: a.toLowerCase() };
    return null;
  }

  /* Was ein Bereich umfasst, als Text und Zahlen — für die Zeile
     unter dem Feld. Nur für Adressen; ein Name hat dort die
     aufgelöste Adresse stehen. */
  function bereich(e) {
    if (!e || e.art !== 'netz') return null;
    const bis = U.bcastOf(e.net, e.mask);
    const anzahl = bis - e.net + 1;
    return { von: U.int2ip(e.net), bis: U.int2ip(bis), anzahl: anzahl };
  }

  function erzeugen(engine, netzwerk) {

    /* Wer Namen auflösen kann (dienste.js trägt es nach — dort lebt
       der Auflöser, und diese Datei kennt ihn nicht). */
    let aufloeser = null;

    /* Laufzeitwissen, nicht gespeichert — wie die NAT-Tabelle. */
    function tb(node) {
      const s = node.state || (node.state = {});
      if (!s.fw) s.fw = {
        namen: new Map(),                // Name → { ip, why, exp, offen }
        zaehler: { erlaubt: 0, verworfen: 0, abgelehnt: 0 },
        treffer: [],                     // je Zeile
        zuletzt: null                    // { t, regel, aktion, text }
      };
      return s.fw;
    }

    const kann = (node) => !!(node && netzwerk.KIND[node.kind] && netzwerk.KIND[node.kind].routes);
    const aktiv = (node) => !!(kann(node) && node.firewall && node.firewall.on);

    /* Die Liste als Auskunft: geprüft, mit der Nummer, unter der
       die Zeile im Fenster steht (1-basiert). Unfertige fehlen. */
    function liste(node) {
      const out = [];
      const l = node.firewall && Array.isArray(node.firewall.regeln) ? node.firewall.regeln : [];
      l.forEach((r, i) => { const e = eintrag(r); if (e) { e.nr = i + 1; out.push(e); } });
      return out;
    }

    /* ─── Namen auflösen ──────────────────────────────────────
       Gefragt wird nur, wenn nichts Frisches da ist und nicht schon
       gefragt wird. Das Ergebnis steht im Zwischenspeicher dieser
       Firewall, nicht im DNS-Zwischenspeicher des Geräts: die
       Sperre soll nach dem Ablauf neu fragen, auch wenn ein
       anderes Programm dieselbe Antwort noch hat. */
    function namenHolen(node) {
      if (!aufloeser || !aktiv(node) || !node.on) return;
      const t = tb(node);
      for (const e of liste(node)) {
        if (e.art !== 'name') continue;
        const z = t.namen.get(e.name);
        if (z && (z.offen || (z.exp > engine.now))) continue;
        const neu = { ip: z ? z.ip : null, why: '', exp: 0, offen: true };
        t.namen.set(e.name, neu);
        aufloeser(node, e.name, (res) => {
          neu.offen = false;
          neu.exp = engine.now + NAMEN_US;
          if (res && res.ok && U.isIp(res.ip)) { neu.ip = res.ip; neu.why = ''; }
          else { neu.ip = null; neu.why = (res && res.why) || 'Der Name ist nicht aufzulösen.'; }
        });
      }
    }

    const passt = (e, ip, t) => {
      if (e.art === 'netz') return U.netOf(ip, e.mask) === e.net;
      const z = t.namen.get(e.name);
      return !!(z && z.ip && z.ip === U.int2ip(ip));
    };

    /* ─── Die Prüfung ─────────────────────────────────────────
       Gibt IMMER eine Antwort zurück:
         { ok, aktion, regel, text }
       `regel` ist die Nummer der Zeile, die getroffen hat, sonst 0.
       Ist die Firewall aus, ist es { ok: true, aus: true } und es
       wird nichts gezählt. */
    function pruefen(node, nicIn, pkt, say, frame) {
      if (!aktiv(node)) return { ok: true, aktion: 'erlauben', aus: true };
      const c = node.firewall, t = tb(node);
      const src = U.ip2int(pkt.src), dst = U.ip2int(pkt.dst);
      namenHolen(node);

      let gew = null;
      for (const e of liste(node)) {
        if (passt(e, src, t) || passt(e, dst, t)) { gew = e; break; }
      }
      const weiss = c.typ === 'whitelist';
      const gesperrt = weiss ? !gew : !!gew;
      const nr = gew ? gew.nr : 0;
      if (gew) t.treffer[gew.nr - 1] = (t.treffer[gew.nr - 1] || 0) + 1;

      if (!gesperrt) {
        t.zaehler.erlaubt++;
        const text = weiss ? 'Zeile ' + nr + ' (Whitelist)' : 'nicht auf der Blacklist';
        t.zuletzt = { t: engine.now, regel: nr, aktion: 'erlauben', text: text };
        return { ok: true, aktion: 'erlauben', regel: nr, text: text };
      }

      const aktion = c.ablehnen ? 'ablehnen' : 'verwerfen';
      const text = weiss ? 'nicht auf der Whitelist' : 'Zeile ' + nr + ' (Blacklist)';
      if (aktion === 'ablehnen') t.zaehler.abgelehnt++; else t.zaehler.verworfen++;
      t.zuletzt = { t: engine.now, regel: nr, aktion: aktion, text: text };
      if (say) say('fw-drop', node, {
        nic: nicIn, dst: pkt.dst, src: pkt.src, proto: pkt.proto, regel: nr, aktion: aktion,
        text: text, pkt: JSON.parse(JSON.stringify(pkt)), frame: frame || null, level: 'warn'
      });
      return { ok: false, aktion: aktion, regel: nr, text: text };
    }

    /* Zahlen und Zustand für das Fenster. */
    function auskunft(node) {
      const t = tb(node);
      const namen = {};
      for (const [n, z] of t.namen) namen[n] = { ip: z.ip, why: z.why, offen: !!z.offen };
      return {
        erlaubt: t.zaehler.erlaubt, verworfen: t.zaehler.verworfen, abgelehnt: t.zaehler.abgelehnt,
        treffer: t.treffer.slice(), zuletzt: t.zuletzt, namen: namen
      };
    }

    /* „Zähler zurücksetzen" — und beim Ändern der Liste, denn die
       Treffer je Zeile gehören zu dieser Zeile an dieser Stelle.
       Die aufgelösten Namen bleiben (`auchNamen` wirft sie weg). */
    function leeren(node, auchNamen) {
      const s = node.state;
      if (!s || !s.fw) return;
      s.fw.zaehler = { erlaubt: 0, verworfen: 0, abgelehnt: 0 };
      s.fw.treffer = []; s.fw.zuletzt = null;
      if (auchNamen) s.fw.namen.clear();
    }

    return {
      pruefen, auskunft, leeren, aktiv, kann, liste, namenHolen,
      setAufloeser: (fn) => { aufloeser = fn; }
    };
  }

  window.Firewall = { erzeugen, eintrag, bereich, maske, istName, TYPEN };
})();
