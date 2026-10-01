/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — util.js   ·   Rechnen, Ordnen, Würfeln
   ══════════════════════════════════════════════════════════════
   Alles, was keine Meinung über Netzwerke hat: Adressrechnen,
   ein Haufen für die Ereigniswarteschlange, ein Würfel mit
   Gedächtnis.

   ── Warum ein eigener Würfel ──────────────────────────────────
   Math.random() darf in diesem Programm nirgends vorkommen. Die
   ganze Simulation soll aus demselben Startwert zweimal dasselbe
   ergeben — sonst lässt sich ein Fehler nicht zweimal ansehen,
   und später kann der Beamer nicht zeigen, was auf dem Tablet
   passiert ist.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Würfel mit Gedächtnis ─────────────────────────────────
     mulberry32: klein, schnell, gut genug. Wichtig ist nicht die
     Qualität der Zufallszahlen, sondern dass derselbe Startwert
     dieselbe Folge liefert. */
  function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    return f;
  }

  /* ─── Haufen (Min-Heap) ─────────────────────────────────────
     Die Ereigniswarteschlange braucht „hol das früheste" in
     logarithmischer Zeit. Ein sortiertes Array wäre bei jedem
     Einfügen O(n) — und es werden viele Ereignisse.

     less(a,b) entscheidet, kommt von außen: die Engine vergleicht
     nach Zeit UND laufender Nummer, damit Gleichstände nicht der
     Reihenfolge des Einfügens ausgeliefert sind. */
  function Heap(less) {
    const a = [];
    return {
      get size() { return a.length; },
      push(x) {
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (!less(a[i], a[p])) break;
          [a[i], a[p]] = [a[p], a[i]];
          i = p;
        }
      },
      peek() { return a[0]; },
      pop() {
        if (!a.length) return undefined;
        const top = a[0];
        const last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]];
            i = m;
          }
        }
        return top;
      },
      clear() { a.length = 0; },
      /* Für „alles von diesem Gerät wegwerfen", wenn ein Gerät
         verschwindet. Selten genug, dass O(n) in Ordnung ist. */
      removeWhere(pred) {
        const keep = a.filter(x => !pred(x));
        a.length = 0;
        for (const x of keep) this.push(x);
      },
      toArray() { return a.slice(); }
    };
  }

  /* ─── IPv4 ──────────────────────────────────────────────────
     Intern ist eine Adresse eine vorzeichenlose 32-Bit-Zahl.
     Zeichenketten gibt es nur an der Oberfläche.

     ⚠️ In JavaScript sind Bit-Operatoren VORZEICHENBEHAFTET:
     `192<<24` ist negativ. Deshalb steht hinter jeder Rechnung
     ein `>>> 0`. Ohne das stimmt jeder Vergleich mit einer
     Adresse ab 128.x.x.x nicht mehr. */
  function ip2int(s) {
    const m = String(s).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    let v = 0;
    for (let i = 1; i <= 4; i++) {
      const o = +m[i];
      if (o > 255) return null;
      v = (v * 256) + o;
    }
    return v >>> 0;
  }

  function int2ip(v) {
    v = v >>> 0;
    return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
  }

  const isIp = (s) => ip2int(s) !== null;

  /* Netzmaske → Präfixlänge und zurück. Beides wird gebraucht:
     der Unterricht schreibt 255.255.255.0, die Rechnung will /24. */
  function mask2prefix(m) {
    const v = typeof m === 'number' ? (m >>> 0) : ip2int(m);
    if (v === null) return null;
    // Eine gültige Maske ist eine ununterbrochene Folge von Einsen.
    // ~v + 1 muss eine Zweierpotenz sein (oder 0 bei /32).
    const inv = (~v) >>> 0;
    if (((inv + 1) & inv) !== 0) return null;
    let n = 0, x = v;
    while (x) { n += x & 1; x >>>= 1; }
    return n;
  }

  function prefix2mask(p) {
    if (p < 0 || p > 32) return null;
    return p === 0 ? 0 : ((0xFFFFFFFF << (32 - p)) >>> 0);
  }

  const netOf  = (ip, mask) => ((ip >>> 0) & (mask >>> 0)) >>> 0;
  const bcastOf = (ip, mask) => (((ip >>> 0) & (mask >>> 0)) | ((~mask) >>> 0)) >>> 0;
  const sameNet = (a, b, mask) => netOf(a, mask) === netOf(b, mask);

  /* Taugt die Adresse als Adresse eines Geräts? Netz- und
     Rundrufadresse sind es nicht — und genau dieser Fehler
     passiert Schülern ständig, deshalb prüfen wir ihn und
     erklären ihn, statt ihn stillschweigend zuzulassen. */
  function checkHostAddress(ipStr, maskStr) {
    const ip = ip2int(ipStr), mask = ip2int(maskStr);
    if (ip === null)   return 'Das ist keine gültige IP-Adresse.';
    if (mask === null) return 'Das ist keine gültige Netzmaske.';
    if (mask2prefix(mask) === null)
      return 'Eine Netzmaske besteht vorne aus lauter Einsen — 255.255.255.0 zum Beispiel.';
    const p = mask2prefix(mask);
    if (p <= 30) {
      if (ip === netOf(ip, mask))   return 'Das ist die Adresse des Netzes selbst — die bekommt kein Gerät.';
      if (ip === bcastOf(ip, mask)) return 'Das ist die Rundrufadresse des Netzes — die bekommt kein Gerät.';
    }
    if ((ip >>> 24) === 127) return '127.x.x.x spricht immer nur mit sich selbst.';
    if ((ip >>> 24) === 0)   return 'Eine Adresse fängt nicht mit 0 an.';
    if ((ip >>> 28) === 14)  return 'Das ist eine Multicast-Adresse (224–239), kein einzelnes Gerät.';
    return null;
  }

  /* ─── Netzteil und Geräteteil einer Adresse ─────────────────
     Die Maske sagt, welcher Teil der Adresse das NETZ benennt und
     welcher das Gerät darin. Genau das ist der Begriff, an dem im
     Unterricht alles hängt — und genau der, der sich aus vier
     Zahlen mit Punkten nicht ablesen lässt.

     Deshalb gibt diese Funktion je Block zurück, wozu er gehört,
     und die Oberfläche färbt danach (konfig.js für die Kärtchen,
     flaeche.js für die Geräte). Drei Fälle, nicht zwei:

       netz     der ganze Block gehört zum Netz    (Maskenbyte 255)
       host     der ganze Block gehört zum Gerät   (Maskenbyte 0)
       geteilt  die Grenze liegt IM Block          (alles dazwischen)

     Der dritte Fall ist der Grund, warum hier nicht einfach nach
     Punkten geschnitten wird: bei /26 endet das Netz mitten im
     vierten Block. Das zu verschweigen wäre bequem und falsch —
     eine Klasse, die /26 rechnet, muss genau dort hinsehen. */
  function ipParts(ipStr, maskStr) {
    const ip = ip2int(ipStr);
    if (ip === null) return null;
    const mask = ip2int(maskStr);
    const bytes = [(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255];
    const mb = mask === null ? [0, 0, 0, 0]
      : [(mask >>> 24) & 255, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255];
    return bytes.map((b, i) => ({
      text: String(b),
      teil: mb[i] === 255 ? 'netz' : mb[i] === 0 ? 'host' : 'geteilt',
      /* Nur beim geteilten Block gebraucht: wie viele Bits dieses
         Blocks noch zum Netz gehören. Die Oberfläche schreibt das
         in den Tooltip, statt es zu verstecken. */
      bits: mb[i] === 255 || mb[i] === 0 ? null : bitsOf(mb[i])
    }));
  }

  /* Dieselbe Aufteilung, aber zusammengefasst: aufeinander
     folgende Blöcke derselben Zugehörigkeit werden EIN Stück, die
     Punkte dazwischen eingeschlossen — aus 192 · 168 · 1 · 10 wird
     „192.168.1" und „10".

     Gebraucht wird das überall dort, wo die Adresse nicht als
     Liste steht, sondern als ein Stück Text mit farbigem Grund:
     im Eingabefeld (konfig.js) und unter dem Gerät (flaeche.js).
     Vier einzelne Kästchen sähen dort aus wie ein Zaun, und der
     Punkt zwischen zwei Blöcken desselben Teils wäre ein Loch.

     Der geteilte Block bleibt für sich stehen: er gehört beiden
     Seiten und darf mit keiner verschmelzen. */
  function ipGruppen(ipStr, maskStr) {
    const parts = ipParts(ipStr, maskStr);
    if (!parts) return null;
    const grp = [];
    for (const p of parts) {
      const letzt = grp[grp.length - 1];
      if (letzt && letzt.teil === p.teil && p.teil !== 'geteilt') letzt.text += '.' + p.text;
      else grp.push({ teil: p.teil, text: p.text, bits: p.bits });
    }
    return grp;
  }

  /* ─── Dieselbe Aufteilung, aber Bit für Bit ─────────────────
     Das Werkzeug „Binärdarstellung" (Ansicht & Tools). Die Farben
     sind dieselben wie bei ipGruppen — Netzteil blau, Geräteteil
     braun —, aber sie gelten hier je BIT und nicht je Block. Erst
     so sieht man, wo die Grenze bei einer Maske wie 255.255.254.0
     wirklich liegt: mitten in einem Block, ohne Streifen.

     `wertStr` ist die Zahl, die dargestellt wird (eine IP, die
     Netzadresse oder die Maske selbst), `maskStr` bestimmt die
     Färbung. Ohne gültige Maske stehen die Bits ungefärbt da. */
  function binHtml(wertStr, maskStr) {
    const v = ip2int(wertStr);
    if (v === null) return '';
    const m = ip2int(maskStr);
    const p = m === null ? null : mask2prefix(m);
    const okt = [];
    for (let o = 0; o < 4; o++) {
      let html = '', lauf = '', art = null;
      for (let b = 0; b < 8; b++) {
        const pos = o * 8 + b;
        const teil = p === null ? 'offen' : pos < p ? 'netz' : 'host';
        if (art !== null && teil !== art) {
          html += '<span class="ipp ipp--' + art + '">' + lauf + '</span>';
          lauf = '';
        }
        art = teil;
        lauf += (v >>> (31 - pos)) & 1;
      }
      html += '<span class="ipp ipp--' + art + '">' + lauf + '</span>';
      okt.push('<span class="bo">' + html + '</span>');
    }
    return okt.join('<span class="ipd">.</span>');
  }

  // Wie viele führende Einsen hat dieses Maskenbyte?
  function bitsOf(b) {
    let n = 0;
    for (let bit = 7; bit >= 0; bit--) { if (b & (1 << bit)) n++; else break; }
    return n;
  }

  /* ─── MAC ───────────────────────────────────────────────────
     Intern eine Zeichenkette in Kleinbuchstaben — MAC-Adressen
     werden nur verglichen und angezeigt, nie gerechnet. */
  const MAC_BROADCAST = 'ff:ff:ff:ff:ff:ff';

  function macFrom(rand) {
    // Lokal verwaltet (Bit 1 des ersten Bytes) und Unicast (Bit 0
    // aus) — so sieht sie echt aus und kollidiert mit keinem
    // Hersteller.
    const b = [0x02];
    for (let i = 0; i < 5; i++) b.push(rand.int(256));
    return b.map(x => x.toString(16).padStart(2, '0')).join(':');
  }

  const isBroadcastMac = (m) => m === MAC_BROADCAST;

  /* ─── Zeit ──────────────────────────────────────────────────
     Die Simulation rechnet in Mikrosekunden als ganzen Zahlen.
     Gleitkomma wäre bei langen Läufen nicht mehr exakt gleich —
     und Determinismus ist der Grund, warum es diese Engine gibt. */
  const MS = 1000, SEC = 1000000;

  function fmtTime(us) {
    if (us < 1000) return us + ' µs';
    if (us < 1000000) return (us / 1000).toFixed(us < 10000 ? 2 : 1) + ' ms';
    return (us / 1000000).toFixed(3) + ' s';
  }

  /* ─── Kleinkram ─────────────────────────────────────────────*/
  let idCounter = 0;
  const nextId = (p) => p + '-' + (++idCounter).toString(36);
  // Beim Laden eines Szenarios muss der Zähler über die höchste
  // vergebene Nummer springen, sonst kollidieren neue IDs mit
  // geladenen.
  const bumpId = (n) => { idCounter = Math.max(idCounter, n); };

  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const deepCopy = (o) => JSON.parse(JSON.stringify(o));

  /* ─── Ein Pseudo-Hash ─────────────────────────────────────────
     KEINE echte Kryptografie — nur das Verhalten, das zählt: aus
     demselben Text wird immer dieselbe Zeichenfolge, und aus der
     Zeichenfolge kommt man nicht zurück zum Text. Zwei FNV-1a-Läufe
     mit verschiedenem Startwert, 16 Hex-Zeichen. */
  function pseudoHash(text) {
    const t = 'synir|' + String(text == null ? '' : text);
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0;
      b = (b ^ (b >>> 13)) >>> 0;
    }
    const hex = (n) => ('00000000' + n.toString(16)).slice(-8);
    return hex(a) + hex(b);
  }

  /* ─── Ein Symbol aus dem Zeichensatz ────────────────────────
     Der Satz steht EINMAL in index.html als <defs> und wird von
     überall her geholt. Vorher standen an drei Stellen im Code
     Emoji-Tabellen ({ host: '🖥', server: '🗄', … }) — drei
     Tabellen, die auseinanderlaufen konnten, und ein Zeichensatz,
     der auf jedem Betriebssystem anders aussieht.

     Die Gerätearten heißen hier genauso wie in `netz.KIND`
     (host · server · handy · switch · router); dazu kommen die
     Programmsymbole (term · gear · box · globe) und die Werkzeuge. */
  const icon = (name, cls) =>
    '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" '
    + 'aria-hidden="true"><use href="#ic-' + name + '"/></svg>';

  window.NetUtil = {
    rng, Heap,
    ip2int, int2ip, isIp, mask2prefix, prefix2mask,
    netOf, bcastOf, sameNet, checkHostAddress, ipParts, ipGruppen, binHtml,
    MAC_BROADCAST, macFrom, isBroadcastMac,
    MS, SEC, fmtTime,
    nextId, bumpId, clamp, escapeHtml, deepCopy, pseudoHash, icon
  };
})();
