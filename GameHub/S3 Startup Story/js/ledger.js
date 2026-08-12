// Ledger — die einheitliche Kosten/Ertrag-Darstellung.
//
// Jedes "Angebot" im Spiel (Werbedeal, Techtree-Node, Marketing-Kampagne) ist
// dieselbe Frage: was zahle ich, was bekomme ich? Vorher hat jedes Modal das
// anders beantwortet — mal als Fließtext, mal als Chip-Stapel, in dem Kosten
// und Erträge nur farblich getrennt waren. Hier steht das Bauteil, das alle
// drei benutzen: links Kosten, rechts Ertrag.
//
// Reine String-Erzeugung, kein State, keine Listener. Die aufrufenden Module
// bleiben dafür zuständig, ihre Buttons zu verdrahten.
(function (RT) {
  'use strict';

  // ── Zahlenformate ───────────────────────────────────────────────────────
  // Bis 1 Mio steht die Zahl vollständig da — im Ledger vergleicht der Spieler
  // Angebote miteinander, und "40.000 €" ist die Zahl, die er sich merkt.
  //
  // ⚠️ Darüber wird gekürzt (2026-08-11). Ab Phase 3 stehen in denselben
  // Zellen Kapazitäten und Metadaten mit acht und neun Stellen; "2.304.512"
  // ist zwar exakt, aber in einer Ledger-Zelle nicht mehr lesbar und sprengt
  // auf schmalen Geräten die Spalte. Ab 1 Mio ist die Größenordnung ohnehin
  // die Information, nicht die letzte Stelle.
  //
  // ⚠️ Dadurch summieren sich gerundete Posten sichtbar nicht mehr exakt auf
  // (Belegungs-Balken der Farm: 2,3 Mio + 1,2 Mio gegen 3,4 Mio Kapazität).
  // Das ist der Preis der Lesbarkeit und bewusst in Kauf genommen.
  var fmt = {
    // 40000 → "40.000" · 2304512 → "2,3 Mio" · 1500000000 → "1,5 Mrd"
    num: function (n) {
      n = Math.round(n || 0);
      var neg = n < 0;
      var a   = Math.abs(n);
      // Die Mrd-Schwelle liegt knapp UNTER 1 Mrd: 999.950.000 rundet auf eine
      // Nachkommastelle sonst zu "1000 Mio" statt zu "1 Mrd".
      if (a >= 1000000) {
        var big  = a >= 999950000;
        var unit = big ? ' Mrd' : ' Mio';
        var val  = big ? a / 1000000000 : a / 1000000;
        // Eine Nachkommastelle, aber kein leeres ",0" — "2 Mio" statt "2,0 Mio".
        return (neg ? '−' : '') + val.toFixed(1).replace(/\.0$/, '').replace('.', ',') + unit;
      }
      var s = String(a);
      var out = '';
      for (var i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 === 0) out += '.';
        out += s.charAt(i);
      }
      return (neg ? '−' : '') + out;
    },

    // Geschütztes Leerzeichen: "16.000 €" soll nie zwischen Zahl und Einheit
    // umbrechen, auch wenn die Zelle schmal wird.
    money: function (n) { return fmt.num(n) + ' €'; },

    sec: function (n) { return Math.round(n) + ' s'; },

    // Immer mit Vorzeichen und einer Nachkommastelle: +1,0 / −2,0
    // (U+2212 Minus, nicht Bindestrich — passt zur Schriftbreite der Ziffern.)
    trend: function (v) {
      return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1).replace('.', ',');
    },

    // 1.15 → "+15 %"
    pctMult: function (m) {
      return (m >= 1 ? '+' : '−') + Math.round(Math.abs(m - 1) * 100) + ' %';
    }
  };

  // ── HTML-Bausteine ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Eine Zeile im Ledger. `id` hängt ein data-Attribut an die Wertzelle —
  // darüber patcht der Intensitäts-Slider der Werbeagentur den Wert, ohne die
  // ganze Karte neu zu bauen (ein Neuaufbau würde den Slider-Griff verlieren).
  //
  // `res` ist die Ressource (money/users/server/watchtime/trend/time) und
  // färbt Icon und Zahl. Die Farbe gehört zur Ressource, nicht zur Spalte:
  // ob ein Posten Kosten oder Ertrag ist, sagt schon die Überschrift darüber.
  function itemHtml(it) {
    if (!it) return '';
    var cls = 'rt-led__item'
            + (it.res  ? ' rt-led__item--' + it.res : '')
            + (it.text ? ' rt-led__item--text' : '')
            + (it.warn ? ' rt-led__item--warn' : '')
            + (it.short ? ' rt-led__item--short' : '');
    var idAttr = it.id ? ' data-led-val="' + esc(it.id) + '"' : '';
    return ''
      + '<div class="' + cls + '">'
      + '<span class="rt-led__ico">' + (it.icon || '') + '</span>'
      + '<span class="rt-led__val"' + idAttr + '>' + (it.value || '') + '</span>'
      + (it.label ? '<span class="rt-led__label">' + esc(it.label) + '</span>' : '')
      + '</div>';
  }

  // Eine Spalte. Leer heißt nicht "weglassen" — sonst rutscht die andere
  // Spalte auf die volle Breite und zwei Karten nebeneinander sehen aus, als
  // hätten sie verschiedene Struktur.
  function colHtml(kind, head, items) {
    var body = '';
    for (var i = 0; i < (items || []).length; i++) body += itemHtml(items[i]);
    if (!body) body = '<div class="rt-led__empty">—</div>';
    return ''
      + '<div class="rt-led__col rt-led__col--' + kind + '">'
      + '  <div class="rt-led__head">' + head + '</div>'
      + body
      + '</div>';
  }

  // ── Deckung: welcher Kostenposten ist gerade nicht bezahlbar ────────────
  // Jede Kauffläche im Spiel stellt dieselbe Frage, und bis zum 2026-08-12 hat
  // sie jede für sich beantwortet: der Shop sagte „Zu teuer" auch dann, wenn in
  // Wahrheit die Metadaten fehlten, die Werbeagentur kannte den richtigen Grund
  // und versteckte ihn in einem `title`, und der Techtree-Detail prüfte die
  // Serverkapazität gar nicht — der Knopf war grün und `startTechNode` sagte
  // erst beim Klick ab.
  //
  // Hier steht die eine Rechnung, aus der BEIDE Signale kommen: die blasse
  // Kachel in der Kostenspalte und die Beschriftung des Knopfs daneben. Sie
  // können dadurch nicht auseinanderlaufen.
  //
  // Ein Kostenposten bringt dafür neben `value` (Anzeigetext) ein `need`
  // (Zahl) mit. Ohne `need` wird nie markiert — Zeit und Trend haben kein
  // Konto, gegen das man sie prüfen könnte.
  var HAVE = {
    money:     function (s) { return s.money    || 0; },
    meta:      function (s) { return s.metadata || 0; },
    watchtime: function (s) { return s.watchtime || 0; },
    model:     function (s) { return s.models   || 0; },
    // ⚠️ Serverplatz ist kein Guthaben, sondern der freie REST der Kapazität —
    // was User, fertige Features und Modelle übrig lassen. Gegen die
    // Gesamtkapazität zu prüfen würde eine Node durchwinken, für die längst
    // kein Platz mehr ist.
    server:    function ()  { return RT.state.freeUserCapacity(); }
  };
  var RES_ICON = {
    money: '💰', meta: '🗃️', watchtime: '⏳', model: '🧠', server: '🖥️'
  };

  // Markiert die unterdeckten Posten in `cost` (in place — jede Aufrufstelle
  // baut ihr Array ohnehin frisch) und liefert die Knopfbeschriftung dazu.
  //
  //   var d = RT.ledger.cover(cost);
  //   ... (d.ok ? '' : 'disabled') ... (d.ok ? '▶ Buchen' : d.label)
  //
  // Die Reihenfolge der Icons in der Beschriftung ist die der Kostenspalte —
  // die ist an jeder Fläche bewusst gesetzt (Geld zuerst, dann die zweite
  // Währung), und zwei verschiedene Reihenfolgen für dieselbe Karte wären
  // genau die Art Unterschied, die man nicht bewusst wahrnimmt, aber merkt.
  function cover(cost) {
    var s = RT.state.current;
    var icons = [];
    for (var i = 0; i < (cost || []).length; i++) {
      var it = cost[i];
      if (!it || typeof it.need !== 'number' || !isFinite(it.need)) continue;
      var have = HAVE[it.res];
      if (!have) continue;
      // Der Istwert bleibt am Posten hängen: die Detail-Ansichten schreiben
      // daraus ihren „benötigt X, vorhanden Y"-Satz, ohne die Zuordnung
      // Ressource → Konto ein zweites Mal zu kennen.
      it.have  = have(s);
      it.short = it.have < it.need;
      if (it.short && icons.indexOf(RES_ICON[it.res]) < 0) icons.push(RES_ICON[it.res]);
    }
    return {
      ok:    icons.length === 0,
      icons: icons,
      label: icons.length ? 'Zu wenig ' + icons.join(' ') : ''
    };
  }

  // ── Die Karte ───────────────────────────────────────────────────────────
  // opts: { icon, title, chip, sub, subId, desc, body, variant,
  //         cost[], gain[], costHead, gainHead, action, progress, progressId, attrs }
  //
  // Immer zweispaltig: links WAS das Angebot ist (Icon, Name, Text, Button),
  // rechts WAS ES KOSTET UND BRINGT. Der Button gehört nach links — er
  // beantwortet die Frage, die der Text stellt.
  //
  // Drei Zusätze für Karten, die keine Angebote sind, sondern einen Zustand
  // zeigen (Belegung der Serverfarm):
  //   – `body`      freies HTML zwischen Text und Fortschrittsbalken. Der
  //                 Belegungs-Balken ist eine Fläche, kein Satz — er passt
  //                 nicht in das <p> von `desc`.
  //   – `costHead`  /  `gainHead`: eigene Spaltenköpfe ("Produziert").
  //   – `cost: false` / `gain: false`: Spalte ganz weglassen. Ein leeres
  //                 Array bleibt bewusst "—" (siehe colHtml) — nur ein
  //                 ausdrückliches false heißt "diese Karte hat keine".
  //                 Fallen beide weg, verschwindet die Zahlenspalte samt
  //                 Trennlinie und die Karte wird einspaltig.
  //
  // `actionRight` dreht die Button-Position: statt unter den Text rutscht er
  // unter die Zahlenspalte. Für den Shop — dort ist die Karte ein Eintrag in
  // einer Liste und nicht das Angebot, das das ganze Modal füllt. Der Text ist
  // ein einziger Satz, ein Button darunter würde die Zeile doppelt so hoch
  // machen, und die Frage lautet hier ohnehin "Preis? Ja/Nein" statt
  // "Was bringt mir das?".
  function card(opts) {
    opts = opts || {};

    // Mehrere Varianten dürfen sich stapeln ("pr locked") — jede bekommt ihre
    // eigene Modifier-Klasse.
    var variant = '';
    var vParts = String(opts.variant || '').split(/\s+/);
    for (var v = 0; v < vParts.length; v++) {
      if (vParts[v]) variant += ' rt-led-card--' + vParts[v];
    }
    var head = '';
    if (opts.icon || opts.title) {
      head = ''
        + '<div class="rt-led-card__head">'
        + (opts.icon ? '<div class="rt-led-card__ico">' + opts.icon + '</div>' : '')
        + '  <div class="rt-led-card__titles">'
        + '    <div class="rt-led-card__name">' + (opts.title || '')
        + (opts.chip ? '<span class="rt-led-card__chip">' + esc(opts.chip) + '</span>' : '')
        + '    </div>'
        + (opts.sub
            ? '<div class="rt-led-card__sub"' +
              (opts.subId ? ' id="' + esc(opts.subId) + '"' : '') + '>' + opts.sub + '</div>'
            : '')
        + '  </div>'
        + '</div>';
    }

    var prog = '';
    if (typeof opts.progress === 'number') {
      prog = ''
        + '<div class="rt-led-card__progress">'
        + '  <div class="rt-led-card__progress-bar"'
        + (opts.progressId ? ' id="' + esc(opts.progressId) + '"' : '')
        + ' style="width:' + Math.max(0, Math.min(100, opts.progress * 100)).toFixed(1) + '%"></div>'
        + '</div>';
    }

    var desc   = opts.desc   ? '<p class="rt-led-card__desc">' + opts.desc + '</p>' : '';
    var body   = opts.body   || '';
    var action = opts.action ? '<div class="rt-led-card__action">' + opts.action + '</div>' : '';

    var cols = '';
    if (opts.cost !== false) cols += colHtml('cost', opts.costHead || 'Kosten', opts.cost);
    if (opts.gain !== false) cols += colHtml('gain', opts.gainHead || 'Ertrag', opts.gain);
    var led = cols ? '<div class="rt-led">' + cols + '</div>' : '';

    // Die rechte Kartenhälfte. Normalerweise ist das die Zahlenspalte allein;
    // mit `actionRight` wandert der Button dazu und beide bekommen eine Hülle,
    // an der die Trennlinie hängt (sonst stünde der Button links davon).
    var side = led;
    var mainAction = action;
    if (opts.actionRight && action) {
      side = '<div class="rt-led-card__side">' + led + action + '</div>';
      mainAction = '';
    }

    return '<div class="rt-led-card' + (side ? '' : ' rt-led-card--solo') + variant + '"' + (opts.attrs || '') + '>'
         +   '<div class="rt-led-card__main">' + head + desc + body + prog + mainAction + '</div>'
         +   side
         + '</div>';
  }

  RT.ledger = { fmt: fmt, card: card, item: itemHtml, cover: cover };
})(window.RT3);
