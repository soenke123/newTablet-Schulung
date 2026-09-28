/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — subnetze.js   ·   Wer liegt mit wem im Netz
   ══════════════════════════════════════════════════════════════
   Die eine Neuerung dieses Programms gegenüber Filius: Subnetze
   sind SICHTBAR. Nicht als Zahl, die man aus vier Blöcken und
   einer Maske im Kopf ausrechnet, sondern als Farbe auf der
   Fläche — Geräte, Kabel und Netzwerkkarten desselben Netzes
   tragen dieselbe.

   Filius zeigt davon nichts. Ein Netzplan dort ist grau, und ob
   192.168.1.10 und 192.168.2.10 zusammengehören, muss man rechnen.
   Genau daran scheitert der Einstieg in Schicht 3: die Klasse
   verkabelt richtig, trägt Adressen ein, und nichts geht — weil
   zwei Geräte im selben Draht in zwei verschiedenen Netzen liegen.
   Das ist unsichtbar, solange niemand es färbt.

   ── Was ein Subnetz hier ist ──────────────────────────────────
   Zwei Bedingungen, beide nötig, und das ist der Unterrichtsstoff:

     1. ÜBER KABEL ERREICHBAR, ohne dass ein Router dazwischen
        liegt. Ein Switch reicht durch (Schicht 2 — er verbindet
        alle seine Anschlüsse zu einem Draht). Ein Endgerät oder
        ein Router tut das NICHT: seine Netzwerkkarten sind
        voneinander getrennt. Genau deshalb ist ein Router in
        mehreren Netzen und ein Switch in gar keinem.

     2. GLEICHER NETZANTEIL. Netzadresse UND Netzmaske müssen
        übereinstimmen. Zwei Geräte mit 192.168.1.10/255.255.255.0
        und 192.168.1.20/255.255.255.128 liegen NICHT zusammen,
        auch wenn die ersten drei Blöcke gleich aussehen — und
        dass sie dann verschiedene Farben tragen (bzw. gar keine),
        ist die Antwort auf „warum geht das nicht".

   ── Und was keines ist ────────────────────────────────────────
   Ein Gerät allein bildet kein Subnetz. „Netz" heißt: mindestens
   zwei Geräte, die sich erreichen könnten. Ein Rechner am Switch,
   an dem sonst nichts hängt, bleibt deshalb ohne Farbe — und das
   ist die richtige Aussage, nicht eine fehlende.

   Switche bekommen selbst keine Farbe. Sie haben keine
   IP-Adresse; sie in ein Netz zu malen, würde die Aussage von
   Schicht 2 zerstören, die sie verkörpern. Ihre KABEL sind
   gefärbt — durch sie läuft ja das Netz.

   ── Kabel und Strom ───────────────────────────────────────────
   Ein gezogenes Kabel (`up: false`) und ein abgeschalteter
   Anschluss trennen. Ein ausgeschaltetes GERÄT nicht: es steckt
   weiter im selben Draht, es antwortet nur nicht. Die Färbung
   beschreibt die Verkabelung, nicht den Betrieb — sonst
   verschwände beim Ausschalten eines Switches das halbe Netz vom
   Bild, und das wäre eine Aussage über Strom, nicht über Adressen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  /* Sechs Farbplätze. Mehr Subnetze hat kein Netzplan, den eine
     Klasse in einer Stunde baut — und mehr Farben hält niemand
     über die Breite einer Fläche auseinander. Es waren acht; die
     zwei stumpfsten davon haben beim Prüfen im Bild genau das
     zunichte gemacht, wofür es die Färbung gibt (siehe
     --sn-0 … --sn-5 im Stylesheet).

     Die Werte selbst stehen dort und nicht hier: sie müssen in
     Hell und Dunkel verschieden sein, und die Umschaltung kennt
     nur CSS. Hier gibt es nur die Nummer. */
  const SLOTS = 6;

  /* Welche Nummer ein Netz bekommt, hängt an seiner Adresse —
     nicht an der Reihenfolge des Anlegens. Sonst würde ein neu
     dazugestelltes Netz alle anderen umfärben, und eine Klasse,
     die „das blaue Netz" sagt, meinte zwei Minuten später ein
     anderes. Gleicher Adressraum ⇒ gleiche Farbe, solange die
     Seite offen ist und darüber hinaus.

     FNV-1a: klein und ohne Bibliothek. Kollisionen (zwei Netze
     auf demselben Platz) werden aufgelöst, indem das zweite auf
     den nächsten freien Platz rutscht — zwei gleichfarbige Netze
     wären der eine Fehler, den diese ganze Datei nicht machen
     darf. */
  function hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* ═══ Die Rechnung ═══════════════════════════════════════════
     Zwei Durchgänge:

       1. Welche Netzwerkkarten hängen im selben Draht?
          (Verbandsuche über Kabel und Switche)
       2. Welche davon haben denselben Netzanteil?

     Beides zusammen ergibt ein Subnetz. Die Reihenfolge ist
     wichtig: erst die Physik, dann die Adressen. Wer umgekehrt
     anfängt, hält zwei Rechner mit 192.168.1.x in zwei getrennten
     Räumen für ein Netz — sie sind es nicht.                     */
  function berechnen(netz) {
    const nodes = netz.list();
    const kabel = netz.cableList();

    /* ─ 1 · Verbandsuche (union-find) über Netzwerkkarten ───── */
    const vater = new Map();
    const kkey = (nodeId, i) => nodeId + '#' + i;
    const find = (k) => {
      while (vater.get(k) !== k) {
        vater.set(k, vater.get(vater.get(k)));   // Pfad halbieren
        k = vater.get(k);
      }
      return k;
    };
    const union = (a, b) => {
      a = find(a); b = find(b);
      if (a !== b) vater.set(a, b);
    };

    for (const n of nodes) for (const nic of n.nics) {
      const k = kkey(n.id, nic.i);
      vater.set(k, k);
    }

    /* Wer verbindet seine eigenen Anschlüsse? Das IST die
       Definition von Schicht 2, und es sind genau zwei Fälle:

         · der Switch — alle seine Anschlüsse,
         · der Heimrouter — seine LAN-Buchsen, und NUR die.
           Seine WAN-Karte bleibt getrennt; genau dadurch ist er
           ein Router und kein langer Draht.

       Dass beides hier und an einer Stelle steht, ist Absicht:
       „welche Löcher hängen intern zusammen" ist eine Frage, die
       nur einmal beantwortet werden darf. */
    for (const n of nodes) {
      if (n.kind === 'switch') {
        for (let i = 1; i < n.nics.length; i++) union(kkey(n.id, 0), kkey(n.id, i));
      } else if (n.kind === 'heimrouter') {
        const lan = (window.Netz && window.Netz.LAN) || 1;
        for (let i = lan + 1; i < n.nics.length; i++) union(kkey(n.id, lan), kkey(n.id, i));
      }
    }

    for (const c of kabel) {
      if (c.up === false) continue;                 // gezogenes Kabel trennt
      const na = netz.nicOf(c.a), nb = netz.nicOf(c.b);
      if (!na || !nb || na.up === false || nb.up === false) continue;
      union(kkey(c.a.node, c.a.nic), kkey(c.b.node, c.b.nic));
    }

    /* ─ 2 · Im Draht nach Netzanteil gruppieren ─────────────── */
    const roh = new Map();            // "draht|netz|maske" → Gruppe
    for (const n of nodes) {
      if (n.kind === 'switch') continue;             // hat keine Adresse
      for (const nic of n.nics) {
        /* Die Internet-Karte des cww liegt im 8er-Netz der Wolke,
           nicht auf dieser Fläche — sie bekommt keinen Ring. */
        if (window.Netz && window.Netz.istInternet(n, nic.i)) continue;
        const ip = U.ip2int(nic.ip), mask = U.ip2int(nic.mask);
        if (ip === null || mask === null) continue;
        if (U.mask2prefix(mask) === null) continue;  // krumme Maske: kein Netz
        const draht = find(kkey(n.id, nic.i));
        const net = U.netOf(ip, mask);
        const k = draht + '|' + net + '|' + mask;
        let g = roh.get(k);
        if (!g) {
          g = {
            key: k, draht: draht, net: net, mask: mask,
            netStr: U.int2ip(net), maskStr: U.int2ip(mask),
            nics: [], nodes: []
          };
          roh.set(k, g);
        }
        g.nics.push({ node: n, nic: nic, i: nic.i });
        if (!g.nodes.includes(n)) g.nodes.push(n);
      }
    }

    /* Ein Gerät allein ist kein Netz. Zwei Netzwerkkarten
       DESSELBEN Geräts im selben Draht übrigens auch nicht — das
       ist ein Kabel im Kreis und keine Verbindung zu jemandem. */
    const liste = [...roh.values()].filter(g => g.nodes.length >= 2);

    /* Sortiert nach Adresse, nicht nach Fundreihenfolge: in der
       Liste am Rand sollen 192.168.1.x, 192.168.2.x, 10.0.0.x
       untereinander stehen wie im Heft. */
    liste.sort((a, b) => (a.net - b.net) || (a.mask - b.mask));

    // Farbplätze vergeben
    const belegt = new Array(SLOTS).fill(false);
    for (const s of liste) {
      let i = hash(s.netStr + '/' + s.maskStr) % SLOTS;
      for (let n = 0; n < SLOTS && belegt[i]; n++) i = (i + 1) % SLOTS;
      belegt[i] = true;
      s.slot = i;
    }

    /* ─ 3 · Nachschlagewerke ────────────────────────────────── */
    const vonNic = new Map();          // "id#i" → Subnetz
    const vonNode = new Map();         // Geräte-ID → [Subnetz, …]
    for (const s of liste) {
      for (const x of s.nics) {
        vonNic.set(kkey(x.node.id, x.i), s);
        const l = vonNode.get(x.node.id) || [];
        if (!l.includes(s)) l.push(s);
        vonNode.set(x.node.id, l);
      }
    }

    // Welche Subnetze liegen in welchem Draht?
    const imDraht = new Map();
    for (const s of liste) {
      const l = imDraht.get(s.draht) || [];
      l.push(s);
      imDraht.set(s.draht, l);
    }

    /* ─ 4 · Kabel ───────────────────────────────────────────────
       Ein Kabel gehört zu einem Subnetz, wenn BEIDE Enden dazu
       gehören. Für eine Netzwerkkarte heißt das: sie ist eine der
       Karten dieses Netzes. Für einen Switch heißt es: immer — er
       leitet weiter, egal was.

       Die zweite Bedingung ist der Grund, warum das Kabel zu
       einem Rechner ohne Adresse grau bleibt, obwohl es am selben
       Switch hängt wie zwei Rechner, die ein Netz bilden. Das
       Kabel liegt da, aber es führt nirgendwohin — und genau so
       sieht es dann aus.

       ⚠️ Der Fall, der beim Prüfen eine Annahme umgeworfen hat:
       hängen an EINEM Switch zwei Adressräume, dann ist trotzdem
       jedes Kabel zu einem Rechner eindeutig — es endet ja an
       genau einem Rechner, und der liegt in genau einem Netz. Am
       Switch treffen dann zwei blaue und zwei orange Kabel
       aufeinander, und DAS ist die Fehlermeldung: der Bruch ist zu
       sehen, statt gelesen werden zu müssen. Nur das Kabel
       ZWISCHEN zwei Switches bleibt grau — dort endet an beiden
       Seiten etwas, das zu beiden Netzen gehören könnte.        */
    const gehoert = (s, ref) => {
      const n = netz.get(ref.node);
      if (!n) return false;
      if (n.kind === 'switch') return true;
      /* Beim Heimrouter zählt nicht die BUCHSE, sondern der
         Anschluss: alle vier LAN-Löcher gehören zu der einen
         Netzwerkkarte, die die Adresse trägt. Ohne diese Zeile
         bliebe das Kabel an LAN 3 grau, während das an LAN 1
         farbig ist — zwei Kabel in dasselbe Netz, verschieden
         gemalt, und niemand könnte sagen warum. */
      const k = window.Netz ? window.Netz.brueckeNic(n, ref.nic) : n.nics[ref.nic];
      const i = k ? k.i : ref.nic;
      return s.nics.some(x => x.node.id === ref.node && x.i === i);
    };

    const vonKabel = new Map();
    for (const c of kabel) {
      if (c.up === false) continue;
      const kandidaten = (imDraht.get(find(kkey(c.a.node, c.a.nic))) || [])
        .filter(s => gehoert(s, c.a) && gehoert(s, c.b));
      // Genau einer, sonst keiner: ein Kabel, das zu zwei Netzen
      // gehören könnte, in einer der beiden Farben zu malen wäre
      // geraten.
      if (kandidaten.length === 1) vonKabel.set(c.id, kandidaten[0]);
    }

    /* ─ 5 · Zwei Adressräume an einem Draht ─────────────────────
       Der häufigste Fehler nach der doppelten Adresse: an einem
       Switch hängen zwei Netze. Es sieht aus wie ein Netz, es ist
       verkabelt wie eines, und nichts davon spricht miteinander.
       Die Liste am Rand sagt es ausdrücklich — auf der Fläche
       sieht man nur, dass die Kabel dazwischen grau bleiben. */
    const gemischt = [...imDraht.values()].filter(l => l.length > 1);

    return { liste, vonNic, vonNode, vonKabel, gemischt, SLOTS };
  }

  /* ═══ Wie schreibt man einen Adressraum auf? ══════════════════
     Die Frage, an der jede Darstellung hängt, sobald die Maske
     nicht auf einer Blockgrenze endet.

     Bei 255.255.255.0 ist es leicht: „192.168.1.__" — drei Blöcke
     Netz, ein Block frei. Bei 255.255.255.192 geht das nicht mehr,
     denn die Grenze liegt MITTEN im letzten Block, und
     „192.168.1.6_" wäre schlicht falsch.

     Deshalb steht hier nicht eine Schreibweise, sondern drei
     Zeilen, und die letzte stimmt immer:

       Kurzform     192.168.1.__   bzw. 192.168.1.64 mit gestreiftem
                    letztem Block, wenn die Grenze darin liegt.
                    Gestreift heißt: dieser Block gehört beiden.
       Netz + Maske zwei Spalten nebeneinander, wie in der
                    Weiterleitungstabelle von Filius. KEINE
                    Präfixschreibweise (/26) — die kommt in Filius
                    nirgends vor.
       Adressen     von der ersten bis zur letzten, die ein Gerät
                    bekommen darf. Das ist die Zeile, die eine
                    krumme Maske beantwortet, ohne dass jemand
                    Bits zählen muss: 192.168.1.65 – 192.168.1.126.

     Netzadresse und Rundrufadresse fallen aus dem Bereich heraus —
     sie bekommt kein Gerät (siehe checkHostAddress in util.js).
     Bei /31 und /32 gibt es sie nicht, dann bleibt der Bereich
     ungekürzt; sonst stünde dort „von .1 bis .0".               */
  function bereich(sub) {
    const p = U.mask2prefix(sub.mask);
    const rundruf = U.bcastOf(sub.net, sub.mask);
    const eng = p > 30;
    const von = eng ? sub.net : sub.net + 1;
    const bis = eng ? rundruf : rundruf - 1;
    return {
      netz: U.int2ip(sub.net),
      maske: U.int2ip(sub.mask),
      von: U.int2ip(von),
      bis: U.int2ip(bis),
      rundruf: eng ? null : U.int2ip(rundruf),
      platz: Math.max(0, bis - von + 1)
    };
  }

  /* Die Kurzform als Gruppen wie in util.js (ipGruppen), nur mit
     Unterstrichen statt Nullen im Geräteteil: nicht „192.168.1.0",
     sondern „192.168.1.__". Die Null ist eine Adresse, der
     Unterstrich ist ein Platz — und genau der Unterschied wird
     gemeint.

     Der geteilte Block behält seine Zahl. Dort steht eben KEIN
     Platzhalter, weil ein Teil der Ziffern schon zum Netz gehört;
     wie das gemeint ist, sagt die Adressbereich-Zeile darunter. */
  function kurzGruppen(sub) {
    const grp = U.ipGruppen(U.int2ip(sub.net), U.int2ip(sub.mask));
    if (!grp) return [];
    return grp.map(g => g.teil === 'host'
      ? { teil: 'host', text: g.text.split('.').map(() => '__').join('.'), bits: null }
      : g);
  }

  function kurzText(sub) {
    return kurzGruppen(sub).map(g => g.text).join('.');
  }

  function kurzHtml(sub) {
    const g = kurzGruppen(sub);
    if (!g.length) return '';
    return g.map(x => '<span class="ipp ipp--' + x.teil + '"'
      + (x.bits ? ' title="Die ersten ' + x.bits + ' Bit dieses Blocks gehören noch zum Netz."' : '')
      + '>' + esc(x.text) + '</span>').join('<span class="ipd">.</span>');
  }

  /* ═══ Die Liste am linken Rand ═══════════════════════════════
     Was der Knopf „Subnetze" aufschlägt. Sie beantwortet die eine
     Frage, die eine Farbe allein nicht beantwortet: welcher
     Adressraum steckt hinter welcher Farbe.

     Sie liegt links, weil rechts das Gerätefenster steht — und
     unter dem Auftrag, weil der zuerst gelesen wird.            */
  function Panel(refs, netz, opts) {
    opts = opts || {};
    let offen = false;
    let daten = null;

    function render() {
      if (!offen) { refs.box.hidden = true; return; }
      daten = berechnen(netz);
      refs.box.hidden = false;
      if (refs.count) {
        refs.count.textContent = daten.liste.length === 1
          ? '1 Netz' : daten.liste.length + ' Netze';
      }
      refs.body.innerHTML = html(daten);
      verdrahten();
      platzieren();
    }

    function html(sn) {
      if (!sn.liste.length) {
        return '<div class="sn-leer">Noch kein Subnetz.<br><br>'
          + 'Ein Netz entsteht, wenn sich <b>zwei</b> Geräte über Kabel erreichen '
          + 'und denselben Netzanteil haben. Ein Gerät allein bekommt keine Farbe.</div>';
      }

      let h = '';
      for (const s of sn.liste) {
        const b = bereich(s);
        const sel = opts.selected && opts.selected() &&
          s.nodes.some(n => n.id === opts.selected());
        h += '<div class="sn-e' + (sel ? ' is-sel' : '') + '" style="--sub: var(--sn-' + s.slot + ')">'
          +    '<div class="sn-e-h">'
          +      '<span class="sn-dot"></span>'
          +      '<span class="sn-kurz">' + kurzHtml(s) + '</span>'
          +      '<span class="sn-n">' + s.nodes.length + ' Geräte</span>'
          +    '</div>'
          /* Netz und Maske als zwei Spalten nebeneinander — genau
             so steht es in der Weiterleitungstabelle von Filius,
             und genau so schreibt es eine Klasse ins Heft. */
          +    '<div class="sn-f"><span>Netz</span><span class="mono">' + esc(b.netz) + '</span></div>'
          +    '<div class="sn-f"><span>Netzmaske</span><span class="mono">' + esc(b.maske) + '</span></div>'
          +    '<div class="sn-f"><span>Adressen</span><span class="mono">'
          +      esc(b.von) + ' – ' + esc(b.bis) + '</span></div>'
          + (b.rundruf
              ? '<div class="sn-f sn-f--klein"><span>Rundruf</span><span class="mono">'
                + esc(b.rundruf) + '</span></div>'
              : '')
          +    '<div class="sn-g">' + s.nodes.map(n =>
                 '<button class="sn-chip" data-node="' + esc(n.id) + '">'
                 + esc(netz.kurzName(n)) + '</button>').join('') + '</div>'
          + '</div>';
      }

      if (sn.gemischt.length) {
        /* Der teuerste Fehler im Unterricht nach der doppelten
           Adresse: es ist richtig verkabelt, es sieht aus wie ein
           Netz, und die eine Hälfte erreicht die andere nicht. Auf
           der Fläche sieht man ihn an den Farben, die am selben
           Switch zusammenstoßen; hier steht, was sie bedeuten. */
        h += '<div class="sn-warn">An <b>einem</b> Kabelstrang hängen zwei '
          + 'Adressräume: '
          + sn.gemischt.map(l => l.map(s => esc(kurzText(s))).join(' und ')).join(' · ')
          + '. Die Geräte hängen am selben Draht, sprechen aber nicht miteinander — '
          + 'dafür bräuchten sie einen Router. Auf der Fläche stoßen deshalb zwei '
          + 'Farben am selben Switch zusammen.</div>';
      }

      return h;
    }

    function verdrahten() {
      refs.body.querySelectorAll('[data-node]').forEach(b => {
        b.addEventListener('click', () => {
          if (opts.waehlen) opts.waehlen(b.dataset.node);
        });
      });
    }

    /* Die Liste beginnt unter dem Auftrag, wenn einer da ist.
       Beides links übereinander zu legen war der erste Versuch und
       der erste Fehler: die Auftragskarte verdeckte genau die
       Farbtafel, die erklärt, was man auf der Fläche sieht. */
    function platzieren() {
      if (refs.box.hidden) return;
      const auf = refs.aufgabe;
      const s = refs.box.parentElement.getBoundingClientRect();
      let top = 18;
      /* Nur, solange der Auftrag an seinem Platz liegt. Wer ihn
         weggezogen hat (`body.auf-frei`), hat die Ecke frei gemacht. */
      if (auf && !auf.hidden && !document.body.classList.contains('auf-frei')) {
        const a = auf.getBoundingClientRect();
        if (a.height) top = Math.round(a.bottom - s.top + 10);
      }
      refs.box.style.top = top + 'px';
      /* Und was darunter noch Platz hat. Ohne diese Zeile rechnet
         die Höhe weiter von der Oberkante der Bühne, und bei
         einem langen Auftrag reicht die Liste unten aus dem Bild
         hinaus — mitsamt dem letzten Netz. */
      refs.box.style.maxHeight = Math.max(120, Math.round(s.height - top - 18)) + 'px';
    }

    return {
      render, platzieren,
      get offen() { return offen; },
      setOffen(v) { offen = !!v; render(); },
      toggle() { offen = !offen; render(); return offen; },
      get daten() { return daten; }
    };
  }

  window.Subnetze = {
    SLOTS, berechnen, bereich, kurzGruppen, kurzText, kurzHtml, Panel
  };
})();
