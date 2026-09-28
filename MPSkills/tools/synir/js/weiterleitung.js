/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — weiterleitung.js  ·  Die Tabelle als Fenster
   ══════════════════════════════════════════════════════════════
   Die Weiterleitungstabelle steht im Gerätekärtchen — aber dort ist
   sie rund 90 px breit je Spalte, die Spaltennamen passen in keine
   Kopfzeile, und wer drei Router einrichten will, macht drei
   Fenster auf und wieder zu.

   Filius kennt dieses Problem und hat dafür einen Knopf: „Als
   Fenster öffnen" (jvermittlungsrechnerkonfiguration_msg14) macht
   aus der Tabelle einen eigenen Dialog, 600 × 400. Hier ist es
   eine Leiste unten über die ganze Breite — wie der Mitschnitt —
   mit einem REITER JE ROUTER. Das ist der Unterschied, um den der
   Nutzer gebeten hat:

     „Ich möchte nämlich, dass ich hier zwischen den ganzen
      Vermittlungsgeräten hin und her wechseln kann (durch Reiter).
      Auf der Karte ist immer das Gerät markiert, was ich gerade
      ausgewählt habe (sodass ich seine Subnetze sehe)."

   ── Vier Spalten, wie in Filius ───────────────────────────────
   Ziel · Netzmaske · Nächstes Gateway · Über Schnittstelle
   (jweiterleitungstabelle_msg3 bis msg6). Hier zum ersten Mal mit
   echter Kopfzeile — im Kärtchen stehen die Namen als eine Zeile
   Text unter der Tabelle, weil sie oben nicht hinpassen.

   ⭐ Die vierte Spalte bleibt eine AUSKUNFT und kein Feld. In
   Filius tippt man sie mit und kann damit eine Zeile bauen, die
   sich selbst widerspricht: ein Gateway im Netz der ersten Karte,
   eingetragen über die zweite. Sie FOLGT aus dem Gateway, also
   steht hier das Ergebnis — und zugleich die Rückmeldung, die man
   an dieser Stelle am meisten braucht („liegt in keinem Netz
   dieses Geräts").

   ── EINE Tabelle, nicht zwei ──────────────────────────────────
   ⚠️ Hier standen eine Runde lang zwei Tabellen untereinander:
   „Von Hand eingetragen" und „Alle Einträge". Vom Nutzer
   gestrichen — *„ich hätte da auch nur, wie in Filius, gerne einen
   sauberen Bereich für die Tabelle. Die Standards stehen auch
   drin, nur grau und nicht bearbeitbar. Mit einem Haken kann ich
   sie wegmachen wie in Filius."*

   Und das ist auch die ehrlichere Fassung. Ein Router hat EINE
   Weiterleitungstabelle; dass drei Zeilen darin aus drei Quellen
   kommen, ist der Unterricht — zwei Tabellen daraus zu machen
   hieße, die Frage „wer gewinnt?" auf zwei Blätter zu verteilen.
   Die Reihenfolge der Zeilen ist deshalb genau die aus
   `stack.routingTable()`, und die ist genau die Rangfolge, nach
   der `routeFor` entscheidet.

   Grau und gesperrt ist alles, was NICHT von Hand kommt: die
   direkten Netze, die gelernten Wege, das Standardgateway. Der
   Haken heißt wie in Filius **„Alle Einträge anzeigen"**
   (jvermittlungsrechnerkonfiguration_msg11) und ist wie dort
   ZUERST GESETZT. Wer ihn wegnimmt, sieht nur noch die eigenen
   Zeilen — und genau dieser Wechsel ist die Antwort auf „was davon
   habe ich eigentlich selbst gemacht?".

   ── Kein eigener Auswahlzustand ───────────────────────────────
   ⚠️ Ein Reiterklick wählt das Gerät auf der FLÄCHE aus
   (`flaeche.select`) — den gewöhnlichen Weg, den auch ein Klick
   auf die Kachel geht. Dadurch geschieht alles Übrige von selbst:
   die Fläche markiert, zeigt genau die Netze dieses Geräts, und
   `app.js` schlägt sein Kärtchen auf. Umgekehrt folgt der Reiter
   der Auswahl. Ein zweiter Zustand („welcher Reiter ist offen")
   neben dem ersten („was ist ausgewählt") wäre die Frage, welcher
   von beiden recht hat — und die stellt sich an dieser Stelle nie.

   Gemerkt wird nur `aktiv`: wird ein Endgerät ausgewählt, bleibt
   der Reiter stehen, wo er war. Sonst stünde das Fenster leer da,
   sobald jemand nebenbei auf einen Rechner tippt.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const U = window.NetUtil;
  const esc = U.escapeHtml;

  /* Die Spaltennamen. Die ersten vier wörtlich aus Filius
     (jweiterleitungstabelle_msg3 bis msg6), und als Tabelle und
     nicht im HTML verstreut: beim nächsten Blick in die
     Sprachdatei liest man eine Zeile statt fünf Stellen.

     ⭐ „Herkunft" hat Filius nicht — dort sind die Zeilen von Hand
     höchstens farblich abgesetzt. Sie ist der Grund, warum diese
     eine Tabelle im Unterricht etwas erklärt: drei Zeilen können
     dasselbe Ziel meinen, und welche gilt, hängt daran, woher sie
     kommt. */
  const SPALTEN = ['Ziel', 'Netzmaske', 'Nächstes Gateway', 'Über Schnittstelle', 'Herkunft'];

  /* Feldname im Formular → Feldname im Modell. Dieselbe Tabelle
     wie in konfig.js, und absichtlich mit ANDEREN Feldnamen
     (`wlt…` statt `weg…`): die zwei Formulare stehen gleichzeitig
     im Dokument, und ein Empfänger, der beide trifft, schriebe die
     Zeile zweimal. */
  const FELD = { wltnet: 'net', wltmask: 'mask', wltgw: 'gateway' };

  function Weiterleitung(refs, netz, stack, konfig, opts) {
    opts = opts || {};

    let aktiv = null;          // Id des gezeigten Routers
    let offen = false;

    /* Wer bekommt einen Reiter? Nur der Router. Der Heimrouter hat
       seit dieser Runde gar keine Weiterleitungstabelle mehr — er
       hat genau zwei Seiten und schickt alles Fremde nach draußen.
       Filius sieht es genauso: `JGatewayConfiguration` hat weder
       den Reiter noch den Haken. */
    /* Das cww bekommt auch einen: nach innen ist es ein Router,
       und die feste Zeile „alles andere → Internet" gehört genau
       hierher (schichten.js, routingTable). */
    const hatTabelle = (n) => !!n && (n.kind === 'router' || n.kind === 'cww');
    const router = () => netz.list().filter(hatTabelle);

    function gewaehlt() {
      const n = aktiv ? netz.get(aktiv) : null;
      if (hatTabelle(n)) return n;
      const rs = router();
      aktiv = rs.length ? rs[0].id : null;
      return rs.length ? rs[0] : null;
    }

    /* ─── Die Reiterzeile ───────────────────────────────────── */
    function malenReiter(node) {
      refs.wltTabs.innerHTML = router().map(n =>
        '<button class="wlt-tab' + (node && n.id === node.id ? ' is-on' : '') + '" '
        + 'data-wlt="' + esc(n.id) + '">'
        +   '<b>' + esc(netz.kurzName(n)) + '</b>'
        +   '<span>' + esc(n.name) + '</span>'
        + '</button>').join('');
    }

    /* Ist der Haken gesetzt? Er steht in der Kopfleiste und nicht
       im Körper — der Körper wird bei jedem `render()` neu
       geschrieben, ein Haken darin verlöre dabei seinen Stand. */
    const alleAn = () => !refs.wltAlle || refs.wltAlle.checked;

    /* ─── Die eine Tabelle ──────────────────────────────────────
       Zeile für Zeile in der Reihenfolge von `routingTable` — und
       das ist keine Bequemlichkeit, sondern die Aussage: so
       entscheidet `routeFor` auch. Was `idx` trägt, ist von Hand
       und wird zu Feldern; alles andere ist grau. */
    function malenTabelle(node) {
      const rs = node.routes || (node.routes = []);
      const alle = alleAn();
      const rt = stack.routingTable(node);
      const zeilen = alle ? rt : rt.filter(r => r.kind === 'eingetragen');

      /* ⚠️ Die Kopfzeile steht IMMER da, auch ohne eine einzige
         Zeile. Sie ist der halbe Grund für dieses Fenster: im
         Kärtchen passen die Namen in keine Kopfzeile. Wer hier
         aufmacht, soll zuerst lesen, was von ihm verlangt wird —
         und das geht nur, wenn die Namen vor der ersten Zeile
         dastehen. */
      let h = '<div class="wlt-tbl">';
      for (const t of SPALTEN) h += '<div class="wlt-th">' + esc(t) + '</div>';
      h += '<div class="wlt-th"></div>';

      for (const r of zeilen) {
        h += r.kind === 'eingetragen' ? zeileHand(node, r.idx, rs[r.idx]) : zeileGrau(node, r);
      }
      h += '</div>';

      if (!zeilen.length) {
        h += '<div class="wlt-leer">' + (alle
          ? 'Noch keine Wege — diesem Router fehlt eine IP-Adresse.'
          : 'Keine Zeile von Hand. <b>Neue Zeile</b> legt eine an.') + '</div>';
      }

      /* Der eine Satz unter der Tabelle. Mehr nicht: die Spalten
         sagen, was drinsteht, und die Farbe sagt, was davon
         jemandem gehört. Übrig bleibt die einzige Regel, die man
         an keiner Zeile ablesen kann. */
      h += '<div class="wlt-hint">' + (alle
        ? 'Grau steht, was der Router von selbst weiß — bei zwei Zeilen für dasselbe Ziel '
          + 'gewinnt die mit der längeren Maske, bei gleicher Maske die weiter oben.'
        : 'Bei zwei Zeilen für dasselbe Ziel gewinnt die mit der längeren Maske, bei '
          + 'gleicher Maske die weiter oben.') + '</div>';
      return h;
    }

    /* Eine Zeile von Hand: drei Felder, die Auskunft, die Herkunft
       und das ×. */
    function zeileHand(node, i, r) {
      const s = konfig.wegStand(node, r);
      return feld('wltnet',  i, r.net,     '192.168.3.0')
        +    feld('wltmask', i, r.mask,    '255.255.255.0')
        +    feld('wltgw',   i, r.gateway, '192.168.2.2')
        +    '<div class="wlt-w is-' + s.stand + '" data-wltw="' + i + '">' + esc(s.text) + '</div>'
        +    '<div class="wlt-c">von Hand</div>'
        +    '<button class="k-x" data-wltdel="' + i + '" title="Zeile löschen">&times;</button>';
    }

    /* Und eine, die niemand eingetragen hat. Kein `disabled`-Feld,
       sondern gar kein Feld: ein graues Eingabefeld lädt zum
       Hineinklicken ein und antwortet dann nicht. Text sagt
       dasselbe und verspricht nichts. */
    function zeileGrau(node, r) {
      const via = r.nic != null && r.nic >= 0 ? netz.portLabel(node, r.nic) : '—';
      return '<div class="wlt-c mono is-auto">' + esc(r.net) + '</div>'
        +    '<div class="wlt-c mono is-auto">' + esc(r.mask) + '</div>'
        +    '<div class="wlt-c mono is-auto">' + esc(r.gateway) + '</div>'
        +    '<div class="wlt-c is-auto">' + esc(via) + '</div>'
        +    '<div class="wlt-c is-auto">' + esc(r.kind)
        +      (r.hops != null ? ' ' + r.hops + (r.hops === 1 ? ' Sprung' : ' Sprünge') : '')
        +    '</div>'
        +    '<div class="wlt-c is-auto"></div>';
    }

    function feld(name, i, wert, ph) {
      return '<input class="f mono" data-f="' + name + '" data-wlt-i="' + i + '" '
        + 'value="' + esc(wert || '') + '" placeholder="' + esc(ph) + '" '
        + 'inputmode="decimal" spellcheck="false">';
    }

    /* ─── Alles neu ─────────────────────────────────────────── */
    function render() {
      if (!offen) return;
      const node = gewaehlt();

      if (!node) {
        /* Der letzte Router ist weg. Ein Fenster mit Reitern ohne
           Reiter ist kein Zustand, den man erklären möchte. */
        schliessen();
        return;
      }

      malenReiter(node);
      refs.wltBody.innerHTML = malenTabelle(node);
    }

    /* ⚠️ Beim Tippen wird NICHT neu gebaut — das Feld unter den
       Fingern dürfte dabei nicht neu entstehen. Erneuert werden nur
       die vierte Spalte und die Tabelle darunter. Dieselbe Regel
       wie `wegMalen` in konfig.js, und dieselbe Regel, die dieses
       Programm schon einmal einen Abend gekostet hat: ein Element,
       das zwischen `pointerup` und `click` ersetzt wird, bekommt
       seinen Klick nie. */
    function malen() {
      if (!offen) return;
      const node = gewaehlt();
      if (!node) return;

      const rs = node.routes || [];

      /* Die Felder zuerst: getippt wird in dieser Runde auch im
         Kärtchen, und dann steht hier sonst die Zahl von vorhin.
         Das Feld mit dem Schreibstrich bleibt unangetastet — sonst
         schriebe man sich beim Tippen den eigenen halb getippten
         Wert um. Dieselbe Regel wie `konfig.wegeMalen`. */
      for (const [f, key] of Object.entries(FELD)) {
        refs.wltBody.querySelectorAll('[data-f="' + f + '"]').forEach(inp => {
          const r = rs[+inp.dataset.wltI];
          if (!r || inp === document.activeElement) return;
          const v = r[key] || '';
          if (inp.value !== v) inp.value = v;
        });
      }

      refs.wltBody.querySelectorAll('[data-wltw]').forEach(el => {
        const r = rs[+el.dataset.wltw];
        if (!r) return;
        const s = konfig.wegStand(node, r);
        el.textContent = s.text;
        el.className = 'wlt-w is-' + s.stand;
      });

      /* ⚠️ Die grauen Zeilen werden beim Tippen NICHT angefasst.
         Sie hängen an den Netzwerkkarten, am Standardgateway und
         an RIP — an nichts davon ändert eine getippte Ziffer etwas.
         Und sie neu zu schreiben hieße, das Gitter neu zu bauen, in
         dem gerade jemand steht. */
    }

    /* ─── Auf und zu ────────────────────────────────────────── */
    function oeffnen(id) {
      if (id) aktiv = id;
      if (!gewaehlt()) {
        if (opts.toast) opts.toast('Dafür braucht es einen Router auf der Fläche.');
        return;
      }
      offen = true;
      refs.wlt.hidden = false;
      document.body.classList.add('wlt-open');
      /* Der gewöhnliche Weg: auswählen. Die Fläche markiert, zeigt
         die Netze dieses Geräts, und app.js schlägt das Kärtchen
         auf — nichts davon steht hier noch einmal. */
      if (opts.select) opts.select(aktiv);
      render();
      nachPlatz();
    }

    function schliessen() {
      if (!offen) return;
      offen = false;
      document.body.classList.remove('wlt-open');
      refs.wltBody.innerHTML = '';
      refs.wltTabs.innerHTML = '';
      /* Erst NACH der Bewegung ganz verschwinden, sonst springt die
         Fläche statt zu wachsen. */
      setTimeout(() => { if (!offen) refs.wlt.hidden = true; }, 240);
      nachPlatz();
    }

    /* Die Fläche ist eben höher oder niedriger geworden. Die
       Kärtchen liegen in Bildschirmpunkten neben ihrem Gerät und
       müssen mit — dieselbe Zeile steht beim Mitschnitt-Umschalter
       in app.js. */
    function nachPlatz() {
      setTimeout(() => { if (opts.nachPlatz) opts.nachPlatz(); }, 260);
    }

    /* Die Auswahl auf der Fläche hat sich geändert. Ist es ein
       Router, geht der Reiter mit; sonst bleibt er stehen. */
    function folgeAuswahl(id) {
      if (!offen || !id) return;
      const n = netz.get(id);
      if (!hatTabelle(n) || n.id === aktiv) return;
      aktiv = n.id;
      render();
    }

    /* ─── Empfänger ─────────────────────────────────────────────
       ⚠️ Einmal am BEHÄLTER, nicht je Zeile: der Körper wird bei
       jedem `render()` neu geschrieben, und Empfänger an seinen
       Kindern wären danach weg. Dieselbe Regel wie im Kärtchenvorrat
       von panels.js. */
    refs.wltTabs.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-wlt]');
      if (!b) return;
      aktiv = b.dataset.wlt;
      if (opts.select) opts.select(aktiv);
      render();
    });

    refs.wltBody.addEventListener('input', (ev) => {
      const inp = ev.target;
      const f = inp.dataset && inp.dataset.f;
      if (!f || !FELD[f]) return;
      const node = gewaehlt();
      if (!node) return;
      const r = (node.routes || [])[+inp.dataset.wltI];
      if (!r) return;
      r[FELD[f]] = inp.value.trim();
      malen();
      /* Das Kärtchen zeigt dieselbe Zeile — auch dort nur malen.
         Und speichern: eine eingetragene Zeile ist eine Änderung am
         Netz wie jede andere und gehört in den Verlauf. */
      if (opts.onDirty) opts.onDirty();
      if (opts.karteMalen) opts.karteMalen(node);
    });

    refs.wltBody.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-wltdel]');
      if (!b) return;
      const node = gewaehlt();
      if (!node) return;
      (node.routes || []).splice(+b.dataset.wltdel, 1);
      if (opts.onDirty) opts.onDirty();
      render();
      /* Eine gelöschte Zeile ändert die Wege des Geräts, und die
         Fläche zeigt an der Kachel, ob ein Gerät sein Ziel
         erreicht. */
      if (opts.redraw) opts.redraw();
    });

    refs.wltNeu.addEventListener('click', () => {
      const node = gewaehlt();
      if (!node) return;
      (node.routes || (node.routes = [])).push({ net: '', mask: '', gateway: '' });
      if (opts.onDirty) opts.onDirty();
      render();
      if (opts.karteBauen) opts.karteBauen(node);
      /* Der Fokus springt ins erste Feld der neuen Zeile — der
         einzige Fall, in dem er springen darf, und er kommt von
         einem Klick. */
      const felder = refs.wltBody.querySelectorAll('[data-f="wltnet"]');
      if (felder.length) felder[felder.length - 1].focus();
    });

    /* Der Haken „Alle Einträge anzeigen". Er ändert nur die
       Ansicht und nichts am Netz — deshalb kein `onDirty` und kein
       Eintrag im Verlauf. */
    if (refs.wltAlle) refs.wltAlle.addEventListener('change', render);

    refs.wltClose.addEventListener('click', schliessen);

    return {
      render, malen, oeffnen, schliessen, folgeAuswahl,
      get offen() { return offen; },
      get aktiv() { return aktiv; }
    };
  }

  window.Weiterleitung = Weiterleitung;
})();
