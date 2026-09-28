/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — rip.js   ·   Automatisches Routing
   ══════════════════════════════════════════════════════════════
   Ein Router kennt von sich aus nur die Netze, die an seinen
   eigenen Karten hängen. Alles andere muss ihm jemand sagen —
   und genau das ist die Frage, mit der die Weiterleitungstabelle
   von Hand aufhört und dieses Protokoll anfängt: **wer trägt die
   Einträge ein, wenn es zwanzig Router sind?**

   RIP (Routing Information Protocol) beantwortet sie mit dem
   einfachsten denkbaren Verfahren: jeder Router ruft im Takt
   allen Nachbarn zu, welche Netze er kennt und wie weit sie weg
   sind. Wer das hört, zählt eins dazu und trägt es ein, wenn er
   es nicht schon besser weiß. Nach ein paar Takten weiß jeder
   alles. Das heißt **Distanzvektor**, und es ist die ganze Idee.

   ── Der Ablauf in vier Zeilen ─────────────────────────────────
     R1 ruft:   „192.168.1.0/24 — 0 Sprünge"
     R2 hört:   trägt 192.168.1.0/24 über R1 ein, 1 Sprung.
     R2 ruft:   „192.168.1.0/24 — 1 Sprung"  (an alle AUSSER R1)
     R3 hört:   trägt es über R2 ein, 2 Sprünge.

   ── Warum das Rufen nie aufhört ───────────────────────────────
   Es gibt keine Abmeldung. Ein Weg, über den niemand mehr redet,
   läuft ab — deshalb trägt jede Ansage eine Frist mit, und
   deshalb muss weitergerufen werden, auch wenn sich nichts
   geändert hat. Wer im Mitschnitt zusieht, sieht genau das: es
   kommt immer wieder dasselbe, und das IST die Nachricht.

   ── Drei Regeln, die es dafür braucht ─────────────────────────
     Unendlich = 16   Ein Weg mit 16 Sprüngen gilt als nicht
                      vorhanden. Die Zahl ist klein und willkürlich
                      und begrenzt genau deshalb den Schaden, wenn
                      zwei Router sich gegenseitig hochzählen
                      („count to infinity"). Bei 16 ist Schluss.
     Split Horizon    Was ich über eine Karte GELERNT habe, sage
                      ich über diese Karte nicht zurück. Ohne das
                      erzählen sich zwei Nachbarn gegenseitig
                      wieder, was sie voneinander wissen — und ein
                      abgeschalteter Weg lebt zwischen ihnen weiter.
     Ansage sofort    Ändert sich etwas, wird nicht auf den nächsten
                      Takt gewartet. Sonst dauert eine Änderung im
                      schlechtesten Fall so lange, wie das Netz
                      Router hat, mal den Takt.

   ── Wortlaut und Zahlen aus Filius ────────────────────────────
   `filius/software/rip/` — `RIPTable.INFINITY = 16`, UDP-Port
   **520** (gesendet von 521, als Rundruf an 255.255.255.255),
   Split Horizon in `RIPBeacon.broadcast`, das Hochzählen in
   `RIPServerMitarbeiter.verarbeiteNachricht`. Der Schalter heißt
   dort **„Automatisches Routing"** (`jvermittlungsrechner-
   konfiguration_msg26`), und die Tabelle trägt den Satz
   „Diese Tabelle wird durch das Routing Information Protocol
   (RIP) aufgebaut und aktualisiert." (`sw_vermittlungweb_msg1`).

   ⚠️ **Nur am Router, nicht am Heimrouter** — und das ist aus
   Filius übernommen, nicht ausgedacht: dort hat allein die
   Vermittlungsrechner-Konfiguration diesen Schalter, die
   Gateway-Konfiguration nicht (`jgatewayconfiguration_msg*` hat
   kein Gegenstück zu msg26). Es ist auch die richtige Antwort:
   ein Heimrouter, der dem Anbieter die Netze im Haus zuruft,
   stellt etwas nach, was kein Heimrouter tut.

   ── Die Zeiten ────────────────────────────────────────────────
   Filius nimmt 30 s Takt und 75 s Frist — in ECHTEN Sekunden.
   Hier zählt simulierte Zeit, und bei Tempo 0,1 wären das fünf
   echte Minuten bis zur ersten Ansage. Also derselbe Bruch bei
   kleineren Zahlen: **5 s Takt, 12,5 s Frist** (Filius'
   Verhältnis 5/2). Damit ist ein Netz aus drei Routern in einer
   halben Minute simulierter Zeit fertig, und das Ablaufen eines
   Weges ist abzuwarten, ohne dass die Klasse einschläft.

   ── Was bewusst fehlt ─────────────────────────────────────────
   Poison Reverse (Filius hat es auch nicht: dort wird
   weggelassen, nicht vergiftet), Authentifizierung, RIPv2 mit
   Multicast statt Rundruf, und die Unterscheidung der
   Nachrichtenarten Request/Response — hier gibt es nur die
   Ansage. Ein Router, der beim Einschalten fragt statt zu warten,
   spart einen halben Takt und kostet ein zweites Konzept.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* Port 520 wie in Filius und wie im echten RIP. Gesendet wird
     von 521 — das ist die Nummer, unter der ein Router seine
     eigenen Ansagen von denen der Nachbarn unterscheiden könnte;
     gebraucht wird sie hier nicht, aber sie steht im Mitschnitt,
     und dort ist sie der Beweis, dass ein Rundruf einen Absender
     hat wie jedes andere Paket. */
  const PORT_SERVER = 520;
  const PORT_CLIENT = 521;

  /* 16 = nicht erreichbar. Siehe Dateikopf. */
  const UNENDLICH = 16;

  const RIP_TAKT  = 5 * U.SEC;
  const RIP_FRIST = RIP_TAKT * 5 / 2;      // 12,5 s — Filius' Verhältnis

  function erzeugen(engine, netz, deps) {
    const sendUdp  = deps.sendUdp;
    const listen   = deps.listen;
    const unlisten = deps.unlisten;
    const say      = deps.say;
    const PROC     = deps.PROC || 50;

    /* ─── Zustand je Router ───────────────────────────────────
       Laufzeitwissen, wie die ARP- und die NAT-Tabelle: nichts
       davon steht in der gespeicherten Datei. Wer ein Netz lädt,
       fängt mit leerer Tabelle an und sieht sie sich füllen —
       und das ist der Unterricht, um den es hier geht.

       GESPEICHERT wird nur der Schalter (`node.rip.on`), denn der
       ist eine Einstellung. */
    function tb(node) {
      const s = node.state || (node.state = {});
      if (!s.rip) s.rip = {
        routen: [],      // nur GELERNTE Wege; die eigenen rechnet `lokale`
        ev: null,        // der Takt
        sofort: null     // eine eingeplante Ansage außer der Reihe
      };
      return s.rip;
    }

    /* Wer darf das? Nur der Router — siehe Dateikopf. Gefragt
       wird nach der Geräteart und nicht nach `KIND[…].routes`:
       Letzteres trifft den Heimrouter mit, und der soll es
       ausdrücklich nicht können. */
    const kannRip = (node) => !!(node && node.kind === 'router');
    const aktiv   = (node) => !!(kannRip(node) && node.rip && node.rip.on && node.on);

    /* ─── Die eigenen Netze ───────────────────────────────────
       Sie stehen NICHT in der Tabelle, sondern werden bei jeder
       Ansage neu ausgerechnet. Filius legt sie einmal beim
       Starten hinein (`RIPTable.addLocalRoutes`) — dann steht
       dort nach dem Ändern einer Adresse das Netz von vorhin.

       Der zweite Grund ist wichtiger: so KANN ein gelernter Weg
       einen eigenen nicht überschreiben, weil sie nicht in
       derselben Liste liegen. Das ist der Fehler, den man nicht
       findet: ein Router, der sein eigenes Netz über den Nachbarn
       sucht, weil der es ihm zurückgerufen hat.

       ⚠️ `gesehen` hält doppelte Netze heraus. Beim Heimrouter
       zeigen vier Buchsen auf dieselbe Karte; am Router kann
       jemand zwei Karten ins selbe Netz stecken. Zweimal
       dasselbe Netz anzusagen wäre keine Lüge, aber es macht den
       Mitschnitt doppelt so lang. */
    function lokale(node) {
      const out = [];
      const gesehen = new Set();
      for (const nic of node.nics) {
        if (!nic.ip || !nic.up) continue;
        const ip = U.ip2int(nic.ip), mask = U.ip2int(nic.mask);
        if (ip === null || mask === null) continue;
        const net = U.int2ip(U.netOf(ip, mask));
        const k = net + '/' + nic.mask;
        if (gesehen.has(k)) continue;
        gesehen.add(k);
        out.push({ net: net, mask: nic.mask, gw: '', nic: nic.i, hops: 0, exp: 0 });
      }
      return out;
    }

    /* ─── Ansagen ─────────────────────────────────────────────
       Eine Ansage je Netzwerkkarte, und jede sagt etwas anderes —
       das ist Split Horizon (siehe Dateikopf).                 */
    function ansagen(node) {
      if (!aktiv(node)) return;
      const t = tb(node);
      const alle = lokale(node).concat(t.routen);

      for (const nic of node.nics) {
        if (!nic.ip || !nic.up || !nic.cable) continue;
        /* Beim Heimrouter gehören vier Buchsen zu einer Karte —
           dort darf nur EINMAL gerufen werden. Der Router hat
           keine Brücke, also ist das hier stets die Karte selbst;
           die Zeile steht trotzdem da, damit sie nicht fehlt,
           wenn eine Geräteart dazukommt. */
        if (netz.brueckeNic(node, nic.i) !== nic) continue;

        const routen = alle
          .filter(r => r.nic !== nic.i)          // ⭐ Split Horizon
          .map(r => ({ net: r.net, mask: r.mask, hops: Math.min(r.hops, UNENDLICH) }));

        /* Eine Ansage ohne Inhalt bleibt hier. Sie wäre nicht
           falsch — „ich weiß nichts, was dich angeht" ist eine
           Aussage —, aber sie steht bei einem Router mit einer
           einzigen Adresse in jedem Takt im Mitschnitt und
           beantwortet dort keine Frage. Filius schickt sie. */
        if (!routen.length) continue;

        sendUdp(node, '255.255.255.255', PORT_CLIENT, PORT_SERVER, {
          von: nic.ip, frist: RIP_FRIST, unendlich: UNENDLICH, routen: routen
        }, { nic: nic.i, src: nic.ip });
      }
    }

    /* Abgelaufene Wege. Sie werden NICHT gelöscht, sondern auf
       unendlich gesetzt — wie in Filius (`RIPTable.check`). Der
       Unterschied ist zu sehen und er ist der Unterricht: ein
       Weg, von dem niemand mehr redet, verschwindet nicht
       stillschweigend, er steht als „unerreichbar" da. Und weil
       er dasteht, wird er in der nächsten Ansage auch als solcher
       weitergesagt. */
    function pruefen(node) {
      for (const r of tb(node).routen) {
        if (r.exp > 0 && r.exp <= engine.now && r.hops < UNENDLICH) {
          r.hops = UNENDLICH;
          say('rip-weg', node, { net: r.net, mask: r.mask, level: 'warn' });
        }
      }
    }

    function takt(node) {
      const t = tb(node);
      t.ev = null;
      if (!aktiv(node)) return;
      pruefen(node);
      ansagen(node);
      planen(node);
    }

    /* Der Takt zittert, wie in Filius (`RIPTable.INTERVAL *
       (rand.nextFloat()/3 + 0.84)`) — also 0,84 bis 1,17 mal der
       Takt. Echte Router tun das, damit nicht alle gleichzeitig
       reden; hier ist der Gewinn ein lesbarer Mitschnitt, in dem
       die Ansagen nacheinander statt übereinander stehen.

       ⚠️ Gewürfelt wird mit `engine.randInt` und nicht mit
       `Math.random`: derselbe Startwert muss denselben Ablauf
       ergeben, sonst ist der ganze Prüfstand wertlos. */
    function planen(node) {
      const t = tb(node);
      if (t.ev) return;
      const jit = (84 + engine.randInt(34)) / 100;
      t.ev = engine.at(Math.round(RIP_TAKT * jit), () => takt(node), 'rip-takt', node.id);
    }

    /* Eine Ansage außer der Reihe, weil sich etwas geändert hat.
       Sie stört den Takt NICHT (Filius setzt dort den nächsten
       Takt auf sofort) — ein gleichmäßiger Grundrhythmus plus
       gelegentliche Zwischenrufe ist im Mitschnitt zu lesen, ein
       ständig verschobener Takt nicht.

       ⚠️ Höchstens eine gleichzeitig eingeplant. Ohne die Sperre
       löst eine Ansage mit zwanzig neuen Wegen zwanzig
       Zwischenrufe aus. */
    function sofortAnsagen(node) {
      const t = tb(node);
      if (t.sofort) return;
      t.sofort = engine.at(PROC * 4, () => {
        t.sofort = null;
        ansagen(node);
      }, 'rip-sofort', node.id);
    }

    /* ─── Zuhören ─────────────────────────────────────────────
       Das Herzstück: das Hochzählen. Schritt für Schritt wie in
       `RIPServerMitarbeiter.verarbeiteNachricht`.              */
    function empfangen(m) {
      const node = m.node;
      if (!aktiv(node)) return;
      const d = m.data || {};
      if (!Array.isArray(d.routen)) return;

      /* An welcher KARTE ist das angekommen? Nicht an welcher
         Buchse — beim Heimrouter wären das vier verschiedene
         Antworten auf dieselbe Frage. (Der Heimrouter macht hier
         nichts, aber `brueckeNic` ist die richtige Frage, und
         eine falsche Frage, die heute stimmt, ist ein Fehler auf
         Vorrat.) */
      const ein = netz.brueckeNic(node, m.nic);
      if (!ein || !ein.ip) return;
      /* Die eigene Ansage kommt über einen Switch nicht zurück —
         aber wer zwei Karten in dasselbe Netz steckt, hört sich
         selbst. Ohne diese Zeile trüge der Router sich seine
         eigenen Netze als einen Sprung entfernt ein. */
      if (m.from === ein.ip) return;

      const t = tb(node);
      const meine = new Set(lokale(node).map(r => r.net + '/' + r.mask));
      const frist = d.frist > 0 ? d.frist : RIP_FRIST;
      const unendlich = d.unendlich > 0 ? d.unendlich : UNENDLICH;
      let sofort = false;

      for (const e of d.routen) {
        if (!e || !e.net || !e.mask) continue;

        /* ⚠️ Das eigene Netz nie über einen Nachbarn. Split
           Horizon verhindert das zwischen ZWEI Routern; im Kreis
           aus drei kommt es trotzdem an. */
        if (meine.has(e.net + '/' + e.mask)) continue;

        /* Einen dazu — und bei 16 ist Schluss. Beide Grenzen,
           weil beide gemeint sind: was der Nachbar selbst schon
           für unerreichbar hält, ist es auch von hier aus, und
           was durch das Dazuzählen 16 erreicht, gilt ab jetzt
           als unerreichbar. */
        const hops = (e.hops >= unendlich || e.hops + 1 >= UNENDLICH)
          ? UNENDLICH : e.hops + 1;

        const r = t.routen.find(x => x.net === e.net && x.mask === e.mask);

        if (r) {
          /* Kennen wir schon. Übernommen wird nur, was BESSER
             ist — oder was vom selben Nachbarn kommt, über den
             der Weg ohnehin läuft. Der zweite Fall ist der
             wichtige: nur so erfährt man, dass ein Weg schlechter
             geworden oder weggefallen ist. */
          if (r.gw !== m.from && r.hops <= hops) continue;
          const vorher = r.hops;
          if (r.hops > hops) { r.gw = m.from; r.nic = ein.i; }
          else if (r.hops < hops) sofort = true;   // schlechter → sofort weitersagen
          r.hops = hops;
          r.exp = engine.now + frist;
          if (vorher < UNENDLICH && hops >= UNENDLICH)
            say('rip-weg', node, { net: r.net, mask: r.mask, level: 'warn' });
          else if (vorher > hops)
            say('rip-neu', node, { net: r.net, mask: r.mask, gw: m.from, hops: hops, besser: true });
        } else if (hops < UNENDLICH) {
          /* Neu. Ein unerreichbarer Weg, den wir nicht kennen,
             wird NICHT eingetragen — sonst füllt sich die Tabelle
             mit Nachrichten über Netze, die es nie gab. */
          t.routen.push({
            net: e.net, mask: e.mask, gw: m.from, nic: ein.i,
            hops: hops, exp: engine.now + frist
          });
          sofort = true;
          say('rip-neu', node, { net: e.net, mask: e.mask, gw: m.from, hops: hops });
        }
      }

      if (sofort) sofortAnsagen(node);
    }

    /* ─── An und aus ──────────────────────────────────────────
       Gerufen wird das aus `dienste.sync()`, und zwar stumpf bei
       jeder Gelegenheit — dieselbe Regel wie bei DHCP und DNS:
       eine Stelle, die herstellt, was dastehen soll, statt vieler
       Stellen, die das Richtige tun müssten.                   */
    function an(node) {
      if (!aktiv(node)) { aus(node); return; }
      listen(node, PORT_SERVER, empfangen, 'Automatisches Routing (RIP)');
      const t = tb(node);
      /* Die erste Ansage kommt nach einem Wimpernschlag und nicht
         erst nach einem Takt. Sonst steht ein gerade
         eingeschaltetes Netz fünf Sekunden lang still da, und
         eine Klasse hält das für „geht nicht". */
      if (!t.ev) t.ev = engine.at(PROC * 8, () => takt(node), 'rip-start', node.id);
    }

    function aus(node) {
      unlisten(node, PORT_SERVER);
      const s = node.state;
      if (!s || !s.rip) return;
      engine.cancel(s.rip.ev);
      engine.cancel(s.rip.sofort);
      /* Die Tabelle gehört zum eingeschalteten RIP — genau wie
         die NAT-Tabelle zum eingeschalteten NAT. Bliebe sie
         stehen, wüsste ein Router nach dem Ausschalten noch Wege,
         die ihm niemand mehr bestätigt. */
      s.rip = null;
    }

    /* ─── Was die Weiterleitung davon braucht ─────────────────
       Nur die GELERNTEN Wege, und nur die erreichbaren. Die
       eigenen Netze findet `routeFor` selbst (Zweig „direkt"),
       und ein Weg mit 16 Sprüngen ist kein Weg.               */
    function wege(node) {
      if (!aktiv(node) || !node.state || !node.state.rip) return [];
      return node.state.rip.routen.filter(r => r.hops > 0 && r.hops < UNENDLICH);
    }

    /* Und was das Gerätefenster zeigt: ALLES, auch die eigenen
       Netze (0 Sprünge) und die abgelaufenen (16). Denn genau
       daran ist das Verfahren zu lesen — die Null sagt „das ist
       meins", die Sechzehn sagt „das war einmal". */
    function zeilen(node) {
      if (!aktiv(node)) return [];
      const t = node.state && node.state.rip;
      const alle = lokale(node).concat(t ? t.routen : []);
      return alle.map(r => ({
        net: r.net, mask: r.mask, gw: r.gw, nic: r.nic, hops: r.hops,
        rest: r.exp > 0 ? Math.max(0, r.exp - engine.now) : null,
        weg: r.hops >= UNENDLICH
      })).sort((a, b) => (a.hops - b.hops) || (U.ip2int(a.net) - U.ip2int(b.net)));
    }

    function leeren(node) {
      if (node) { aus(node); return; }
      for (const n of netz.list()) aus(n);
    }

    return {
      an, aus, wege, zeilen, leeren, aktiv, kannRip,
      PORT_SERVER, PORT_CLIENT, UNENDLICH, RIP_TAKT, RIP_FRIST
    };
  }

  window.Rip = { erzeugen, PORT_SERVER, PORT_CLIENT, UNENDLICH, RIP_TAKT, RIP_FRIST };
})();
