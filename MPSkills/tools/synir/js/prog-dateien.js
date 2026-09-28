/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — prog-dateien.js   ·   Datei-Explorer,
   Texteditor und Bildbetrachter
   ══════════════════════════════════════════════════════════════
   Das Modell steht in `dateien.js` und ist kopflos prüfbar; hier
   steht nur, wie man es anfasst. Deshalb zwei Dateien: der
   Prüfstand in Node hat kein DOM, und die Frage „legt anlegen den
   Eintrag richtig an" soll nicht an einem Browser hängen.

   ── EIN Programm, drei Ansichten ──────────────────────────────
   In Filius sind das DREI Einträge in `Desktop_de_DE.txt`:
   Datei-Explorer, Text-Editor, Bildbetrachter. Man installiert
   sie einzeln, startet sie einzeln, und jeder von beiden
   Betrachtern bringt einen EIGENEN Dateiauswahldialog mit
   (`DMTNFileChooser`), in dem man sich noch einmal durch den Baum
   klickt. Der Datei-Explorer selbst kann dort gar keine Datei
   öffnen — kein Doppelklick, nichts. Das Handbuch muss deshalb
   ausdrücklich erklären, dass man zum Bearbeiten der
   `index.html` zusätzlich einen Texteditor installiert.

   ⚠️ Hier ist es **eine** Kachel, und ein Klick auf eine Datei
   öffnet sie. Vom Nutzer so gesetzt: „Bildbetrachter und
   Texteditor sind keine richtigen Programme, ich kann Bilder und
   Texte einfach öffnen." Das spart zwei Kacheln, einen Dialog und
   eine Erklärung — und es stimmt auch: ein Kind startet keinen
   Bildbetrachter, es öffnet ein Bild.

   Die Wörter bleiben von dort: *Neuer Ordner*, *Umbenennen*,
   *Neuer Name:*, *Sicher?*, *Speichern*.

   ── Kein prompt(), kein confirm() ─────────────────────────────
   Gefragt wird IN der Zeile. Ein Systemdialog blockiert die Uhr,
   sieht nicht nach diesem Programm aus — und der Browser-
   Prüfstand nimmt Dialoge automatisch an und wäre an genau
   diesen Stellen blind. Dasselbe Muster wie im Appstore.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;
  const D = window.Dateien;

  /* Was gerade offen ist. Steht außerhalb von `bauen`, weil jedes
     `render()` des Geräts den Fensterinhalt neu aufbaut — ein
     Pfad, der das nicht übersteht, springt beim ersten Ereignis
     zurück in die Wurzel. Beim Gerätewechsel wird zurückgesetzt:
     der Ordner eines anderen Rechners geht niemanden etwas an. */
  let stand = { node: null, pfad: D.WURZEL, offen: null,
                frage: null, umbenennen: null, neu: null, fehler: '' };

  /* Was im Editor steht, aber noch nicht in der Datei. Gesichert
     wird beim Speichern, beim Zurückgehen und beim Schließen des
     Programms — dafür gibt es `schliessen()`. */
  let entwurf = null;   // { node, pfad, text }

  function zuruecksetzen(nodeId) {
    stand = { node: nodeId, pfad: D.WURZEL, offen: null,
              frage: null, umbenennen: null, neu: null, fehler: '' };
  }

  /* ═══ Hervorhebung ═══════════════════════════════════════════
     Ein kleiner Zerteiler für HTML und CSS. Er muss nicht
     vollständig sein — er muss die vier Sorten auseinanderhalten,
     die ein Kind beim Schreiben verwechselt: Marke, Eigenschaft,
     Wert und Text.

     ⚠️ JavaScript wird eingefärbt wie „wird nicht ausgeführt".
     Das ist keine Warnung über einen erlaubten Zustand, sondern
     die Auskunft über eine Grenze dieses Programms — ohne sie
     sucht ein Kind den Fehler in seinem Skript. */
  function zerteileHtml(text) {
    const out = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
      if (text.startsWith('<!--', i)) {
        const e = text.indexOf('-->', i + 4);
        const bis = e < 0 ? n : e + 3;
        out.push({ k: 'kom', s: text.slice(i, bis) }); i = bis; continue;
      }
      /* Ein Skriptblock am Stück, samt Marken. Als EIN Stück,
         weil der Satz darunter von „dieser Seite" spricht und
         nicht von einer Zeile. */
      const skript = /^<script\b/i.exec(text.slice(i));
      if (skript) {
        const e = text.toLowerCase().indexOf('</script>', i);
        const bis = e < 0 ? n : e + 9;
        out.push({ k: 'js', s: text.slice(i, bis) }); i = bis; continue;
      }
      if (text.charAt(i) === '<') {
        const e = text.indexOf('>', i);
        const bis = e < 0 ? n : e + 1;
        zerteileMarke(text.slice(i, bis), out);
        i = bis; continue;
      }
      const naechste = text.indexOf('<', i);
      const bis = naechste < 0 ? n : naechste;
      out.push({ k: 'txt', s: text.slice(i, bis) });
      i = bis;
    }
    return out;
  }

  /* Innerhalb einer Marke: Name, Attributnamen, Werte. */
  function zerteileMarke(s, out) {
    const m = /^<\/?\s*[a-zA-Z0-9-]*/.exec(s);
    const kopf = m ? m[0] : '<';
    out.push({ k: 'tag', s: kopf });
    let rest = s.slice(kopf.length);
    const re = /([a-zA-Z-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?|([\s>/]+)/g;
    let t;
    let letzte = 0;
    while ((t = re.exec(rest)) !== null) {
      if (t.index > letzte) out.push({ k: 'tag', s: rest.slice(letzte, t.index) });
      if (t[4] !== undefined) out.push({ k: 'tag', s: t[4] });
      else {
        out.push({ k: 'attr', s: t[1] });
        if (t[2]) out.push({ k: 'tag', s: t[2] });
        if (t[3]) out.push({ k: 'wert', s: t[3] });
      }
      letzte = re.lastIndex;
    }
    if (letzte < rest.length) out.push({ k: 'tag', s: rest.slice(letzte) });
  }

  function zerteileCss(text) {
    const out = [];
    let i = 0;
    const n = text.length;
    let drin = false;               // zwischen { und }
    while (i < n) {
      if (text.startsWith('/*', i)) {
        const e = text.indexOf('*/', i + 2);
        const bis = e < 0 ? n : e + 2;
        out.push({ k: 'kom', s: text.slice(i, bis) }); i = bis; continue;
      }
      const c = text.charAt(i);
      if (c === '{') { drin = true;  out.push({ k: 'tag', s: c }); i++; continue; }
      if (c === '}') { drin = false; out.push({ k: 'tag', s: c }); i++; continue; }
      /* ⚠️ Dieselben Farben bedeuten in beiden Sprachen dasselbe:
         der SELEKTOR steht da, wo in HTML die Marke steht
         (blau), die EIGENSCHAFT da, wo das Attribut steht
         (violett), der WERT bleibt der Wert (orange). Umgekehrt
         herum war es eine Runde lang, und dann lernt ein Kind
         beim Wechsel von der Seite zur Stildatei zweierlei. */
      if (!drin) {
        const bis = naechstesVon(text, i, ['{', '}', '/*']);
        out.push({ k: 'tag', s: text.slice(i, bis) }); i = bis; continue;
      }
      const doppel = text.indexOf(':', i);
      const ende = naechstesVon(text, i, ['}', '/*']);
      if (doppel < 0 || doppel >= ende) {
        out.push({ k: 'wert', s: text.slice(i, ende) }); i = ende; continue;
      }
      out.push({ k: 'attr', s: text.slice(i, doppel + 1) });
      const strichpunkt = text.indexOf(';', doppel);
      const bis = strichpunkt >= 0 && strichpunkt < ende ? strichpunkt + 1 : ende;
      out.push({ k: 'wert', s: text.slice(doppel + 1, bis) });
      i = bis;
    }
    return out;
  }

  function naechstesVon(text, ab, marken) {
    let best = text.length;
    for (const m of marken) {
      const i = text.indexOf(m, ab);
      if (i >= 0 && i < best) best = i;
    }
    return best === ab ? ab + 1 : best;
  }

  function faerben(text, art) {
    const stuecke = art === 'css' ? zerteileCss(text)
                  : art === 'html' ? zerteileHtml(text)
                  : [{ k: 'txt', s: text }];
    /* Das abschließende Leerzeichen ist kein Versehen: ohne es
       endet der Spiegel eine Zeile früher als das Eingabefeld,
       sobald der Text mit einem Zeilenumbruch aufhört — und dann
       steht der Textcursor eine Zeile unter seiner Farbe. */
    return stuecke.map(t => '<span class="sy sy--' + t.k + '">' + esc(t.s) + '</span>').join('') + ' ';
  }

  const editorArt = (pfad) => {
    const e = D.endung(pfad);
    if (e === 'html' || e === 'htm') return 'html';
    if (e === 'css') return 'css';
    return 'roh';
  };

  /* ═══ Aufbau ═════════════════════════════════════════════════ */

  function bauen(node, box, ctx) {
    ctx = ctx || {};
    ctxNetz = ctx.netz || null;
    if (stand.node !== node.id) zuruecksetzen(node.id);
    // Was es nicht mehr gibt, kann auch nicht offen sein.
    if (stand.offen && !D.gibt(node, stand.offen)) stand.offen = null;
    if (!D.gibt(node, stand.pfad)) stand.pfad = D.WURZEL;

    if (stand.offen) {
      const art = D.art(node, stand.offen);
      if (art === 'bild') { bauBild(node, box, ctx); return; }
      if (art === 'text') { bauEditor(node, box, ctx); return; }
      stand.offen = null;
    }
    bauListe(node, box, ctx);
  }

  /* ─── Die Liste ───────────────────────────────────────────── */

  function bauListe(node, box, ctx) {
    const eintraege = D.list(node, stand.pfad);

    const teile = stand.pfad === D.WURZEL ? [] : stand.pfad.slice(1).split('/');
    let auf = '';
    const krumen = ['<button class="fx-krume" data-gehe="/">Gerät</button>']
      .concat(teile.map(t => {
        auf += '/' + t;
        return '<span class="fx-pfeil">›</span>'
          + '<button class="fx-krume" data-gehe="' + esc(auf) + '">' + esc(t) + '</button>';
      })).join('');

    const zeile = (e) => {
      if (stand.frage === e.pfad) {
        return '<div class="fx-zeile is-frage">'
          + '<span class="fx-ic">' + U.icon(symbol(e.art)) + '</span>'
          + '<span class="fx-n">' + esc(e.name) + '</span>'
          + '<span class="fx-frage">Sicher?</span>'
          + '<button class="sw-ja" data-weg="' + esc(e.pfad) + '">Ja</button>'
          + '<button class="sw-nein" data-nein="1">Nein</button>'
          + '</div>';
      }
      if (stand.umbenennen === e.pfad) {
        return '<div class="fx-zeile is-um">'
          + '<span class="fx-ic">' + U.icon(symbol(e.art)) + '</span>'
          + '<input class="f fx-feld" id="fxUm" value="' + esc(e.name) + '" spellcheck="false">'
          + '<button class="sw-ok" data-um="' + esc(e.pfad) + '">OK</button>'
          + '<button class="sw-nein" data-nein="1">Abbrechen</button>'
          + '</div>';
      }
      return '<div class="fx-zeile">'
        + '<button class="fx-auf" data-auf="' + esc(e.pfad) + '">'
        +   '<span class="fx-ic">' + U.icon(symbol(e.art)) + '</span>'
        +   '<span class="fx-n">' + esc(e.name) + '</span>'
        +   '<span class="fx-art">' + artWort(e.art) + '</span>'
        + '</button>'
        + '<button class="fx-x" data-umstart="' + esc(e.pfad) + '" title="Umbenennen">✎</button>'
        + '<button class="fx-x" data-wegstart="' + esc(e.pfad) + '" title="Löschen">×</button>'
        + '</div>';
    };

    box.innerHTML =
      '<div class="fx-kopf">' + krumen + '</div>'
      + (eintraege.length
          ? '<div class="fx-liste">' + eintraege.map(zeile).join('') + '</div>'
          /* ⚠️ Hier stand „Ein neues Gerät hat ein leeres
             Dateisystem". Seit `/Bilder` ab Werk dasteht, wäre das an
             der Wurzel eine Behauptung, die die Zeile darüber
             widerlegt. Der Satz sagt jetzt, was er sagen soll: in
             DIESEM Ordner liegt nichts, und wie etwas hereinkommt. */
          : '<div class="k-hint fx-leer">Hier liegt noch nichts. '
            + 'Was in einem Ordner liegt, hat jemand angelegt, hochgeladen '
            + 'oder ein Programm mitgebracht.</div>')
      + neuBlock()
      + (stand.fehler ? '<div class="fx-fehler">' + esc(stand.fehler) + '</div>' : '');

    const neuZeichnen = () => { stand.fehler = ''; ctx.render && ctx.render(); };
    const fertig = () => { if (ctx.onDirty) ctx.onDirty(); ctx.render && ctx.render(); };

    box.querySelectorAll('[data-gehe]').forEach(b => b.addEventListener('click', () => {
      stand.pfad = b.dataset.gehe; stand.frage = stand.umbenennen = stand.neu = null;
      neuZeichnen();
    }));

    box.querySelectorAll('[data-auf]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.auf;
      const art = D.art(node, p);
      stand.frage = stand.umbenennen = stand.neu = null;
      if (art === 'ordner') stand.pfad = p;
      else if (art === 'bild' || art === 'text') stand.offen = p;
      else stand.fehler = 'Diese Art von Datei kann dieses Gerät nicht öffnen.';
      ctx.render && ctx.render();
    }));

    box.querySelectorAll('[data-wegstart]').forEach(b => b.addEventListener('click', () => {
      stand.frage = b.dataset.wegstart; stand.umbenennen = stand.neu = null; neuZeichnen();
    }));
    box.querySelectorAll('[data-umstart]').forEach(b => b.addEventListener('click', () => {
      stand.umbenennen = b.dataset.umstart; stand.frage = stand.neu = null; neuZeichnen();
    }));
    box.querySelectorAll('[data-nein]').forEach(b => b.addEventListener('click', () => {
      stand.frage = stand.umbenennen = null; neuZeichnen();
    }));

    box.querySelectorAll('[data-weg]').forEach(b => b.addEventListener('click', () => {
      D.loeschen(node, b.dataset.weg);
      stand.frage = null;
      fertig();
    }));

    const umBestaetigen = () => {
      const feld = box.querySelector('#fxUm');
      if (!feld) return;
      const r = D.umbenennen(node, stand.umbenennen, feld.value);
      stand.fehler = r.ok ? '' : r.fehler;
      if (r.ok) stand.umbenennen = null;
      fertig();
    };
    box.querySelectorAll('[data-um]').forEach(b => b.addEventListener('click', umBestaetigen));
    const umFeld = box.querySelector('#fxUm');
    if (umFeld) {
      umFeld.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') umBestaetigen(); });
      umFeld.focus();
      umFeld.select();
    }

    verdrahteNeu(node, box, ctx);
  }

  const symbol = (art) => art === 'ordner' ? 'ordner' : art === 'bild' ? 'bild' : 'datei';
  const artWort = (art) => art === 'ordner' ? 'Ordner' : art === 'bild' ? 'Bild'
                         : art === 'text' ? 'Text' : '—';

  /* ─── Neu anlegen ─────────────────────────────────────────── */

  /* Was die Dateiauswahl vorschlagen soll: alles, was das Gerät
     hinterher auch öffnen kann. Aus dateien.js abgeleitet und nicht
     abgeschrieben — sonst stünde dieselbe Liste zweimal da. */
  const ACCEPT = D.BILD_ENDUNGEN.concat(D.TEXT_ENDUNGEN).map(e => '.' + e).join(',');

  function neuBlock() {
    if (!stand.neu) {
      /* ⭐ „Datei hochladen" ist ein verstecktes <input type=file>
         in einem <label>, das wie ein Knopf aussieht — dasselbe
         Muster wie „Öffnen" in der Kopfzeile (index.html). Kein
         eigener Klick-Handler nötig, und auf einem Tablet öffnet
         es die Dateiauswahl des Geräts.

         ⚠️ DREI Knöpfe, nicht vier. Hier standen bis zum
         2026-09-28 zwei nebeneinander, die beide eine Datei
         anlegten: *Bild einfügen* schlug eine Galerie der
         eingebauten Bilder auf, *Datei einführen* las eine echte
         von der Platte. Vom Nutzer zusammengelegt: „Es gibt die
         Knöpfe ‚Ordner erstellen', ‚neue Text Datei', ‚Datei
         hochladen'. Das vereint die Buttons, die du als 2 hast."
         Möglich wurde das erst dadurch, dass die eingebauten Bilder
         jetzt als Ordner `/Bilder` auf dem Gerät LIEGEN — die
         Galerie war nur der Umweg dorthin.

         Filius nennt den Vorgang „importieren"
         (sw_fileexplorer_msg2: „Datei erfolgreich importiert!").
         Auf dem Knopf steht das Wort des Nutzers: „hochladen" ist
         das, was ein Kind aus jedem anderen Programm kennt.

         `accept` nennt genau die Endungen, die dateien.js kennt —
         die Dateiauswahl zeigt damit vorher, was geht, statt
         hinterher eine Datei abzulegen, die sich nicht öffnen
         lässt. Es ist ein Vorschlag und keine Sperre (jeder
         Browser erlaubt „Alle Dateien"); die Endung entscheidet
         weiterhin erst in `einfuehren`. */
      return '<div class="fx-knoepfe">'
        + '<button class="k-add" data-neu="ordner">Ordner erstellen</button>'
        + '<button class="k-add" data-neu="text">Neue Textdatei</button>'
        + '<label class="k-add fx-einfuhr">Datei hochladen'
        +   '<input type="file" id="fxDatei" accept="' + ACCEPT + '" hidden>'
        + '</label>'
        + '</div>'
        + platzBlock();
    }
    /* ⚠️ Der Platzhalter hieß „bilder", und er ist auch der Name,
       den ein leeres Feld annimmt. Seit `/Bilder` ab Werk dasteht,
       hätte ein Kind mit einem Tastendruck einen zweiten Ordner
       daneben gelegt, der fast genauso heißt. */
    const platz = stand.neu === 'ordner' ? 'aufgaben' : 'seite.html';
    return '<div class="fx-neu">'
      + '<div class="fx-neu-t">' + (stand.neu === 'ordner' ? 'Ordner erstellen'
          : 'Neue Textdatei') + '</div>'
      + '<div class="fx-neu-r">'
      +   '<input class="f" id="fxNeu" placeholder="' + platz + '" spellcheck="false">'
      +   '<button class="sw-ok" id="fxNeuOk">Anlegen</button>'
      +   '<button class="sw-nein" data-neu="">Abbrechen</button>'
      + '</div>'
      + (stand.neu === 'text'
          ? '<div class="k-hint">Die <strong>Endung</strong> entscheidet, was es ist: '
            + '<code>.html</code> und <code>.css</code> werden beim Öffnen eingefärbt, '
            + '<code>.txt</code> bleibt schlichter Text.</div>'
          : '')
      + '</div>';
  }

  /* Wie viel Platz die hochgeladenen Dateien belegen. Steht nur
     da, wenn überhaupt welche hochgeladen wurden — eine Anzeige
     „0 von 4 MB" auf einem leeren Gerät beantwortet keine Frage
     und stellt dafür eine neue. Die eingebauten Bilder in `/Bilder`
     zählen nicht mit: sie sind Verweise und liegen nicht im
     Inhaltsspeicher. */
  function platzBlock() {
    if (!ctxNetz) return '';
    const belegt = D.verbrauch(ctxNetz);
    if (!belegt) return '';
    const voll = belegt / D.GRENZE_NETZ;
    return '<div class="fx-platz' + (voll > 0.85 ? ' is-eng' : '') + '">'
      + '<div class="fx-platz-b"><i style="width:'
      +   Math.min(100, Math.round(voll * 100)) + '%"></i></div>'
      + '<span>' + esc(D.kurzMass(belegt)) + ' von ' + esc(D.kurzMass(D.GRENZE_NETZ))
      +   ' für hochgeladene Dateien belegt</span>'
      + '</div>';
  }

  /* ⚠️ Das Netz wird gebraucht, um den Platz über ALLE Geräte zu
     zählen — derselbe Inhalt auf zwei Geräten liegt nur einmal im
     Speicher. Gesetzt beim Bauen des Fensters, damit `platzBlock`
     und die Einfuhr es haben, ohne es durchreichen zu müssen. */
  let ctxNetz = null;

  /* Eine echte Datei einlesen. Die Endung entscheidet, WIE:
     Textendungen als Text (dann lässt sie sich im Editor öffnen),
     alles andere als Daten-URI. Genau diese Unterscheidung macht
     Filius auch (FileExplorer.java: zeilenweise lesen gegen
     Base64.encodeFromFile). */
  function einfuehren(node, datei, ctx, render) {
    const name = String(datei.name || 'datei').split(/[\\/]/).pop();
    const istText = D.TEXT_ENDUNGEN.indexOf(D.endung(name)) >= 0;
    const leser = new FileReader();
    leser.onerror = () => {
      stand.fehler = 'Datei konnte nicht hochgeladen werden.';
      render();
    };
    leser.onload = () => {
      const roh = istText ? { text: String(leser.result) }
                          : { datenUri: String(leser.result) };
      const r = D.einfuehren(node, stand.pfad, name, roh, ctxNetz);
      stand.fehler = r.ok ? '' : r.fehler;
      if (r.ok) {
        stand.neu = null;
        if (ctx.toast) ctx.toast('„' + name + '" hochgeladen.');
        if (ctx.onDirty) ctx.onDirty();
      }
      render();
    };
    if (istText) leser.readAsText(datei);
    else leser.readAsDataURL(datei);
  }

  function verdrahteNeu(node, box, ctx) {
    /* ⚠️ `e.target.value = ''` NICHT vergessen: sonst lässt sich
       dieselbe Datei kein zweites Mal wählen (der Browser meldet
       keine Änderung, wenn derselbe Pfad noch darin steht).
       Dieselbe Zeile steht beim Netzplan-Import in app.js. */
    const dateiFeld = box.querySelector('#fxDatei');
    if (dateiFeld) dateiFeld.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (f) einfuehren(node, f, ctx, () => ctx.render && ctx.render());
    });

    box.querySelectorAll('[data-neu]').forEach(b => b.addEventListener('click', () => {
      stand.neu = b.dataset.neu || null;
      stand.frage = stand.umbenennen = null;
      stand.fehler = '';
      ctx.render && ctx.render();
    }));

    const anlegen = () => {
      const feld = box.querySelector('#fxNeu');
      if (!feld) return;
      const name = feld.value.trim() || feld.placeholder;
      const r = stand.neu === 'ordner'
        ? D.ordnerAnlegen(node, stand.pfad, name)
        : D.anlegen(node, stand.pfad, name, { text: '' });

      stand.fehler = r.ok ? '' : r.fehler;
      if (r.ok) {
        stand.neu = null;
        // Eine frisch angelegte Textdatei geht gleich auf — man
        // legt sie ja an, um etwas hineinzuschreiben.
        if (D.art(node, r.pfad) === 'text') stand.offen = r.pfad;
        if (ctx.onDirty) ctx.onDirty();
      }
      ctx.render && ctx.render();
    };

    const ok = box.querySelector('#fxNeuOk');
    if (ok) ok.addEventListener('click', anlegen);
    const feld = box.querySelector('#fxNeu');
    if (feld) {
      feld.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') anlegen(); });
      feld.focus();
    }
  }

  /* ─── Der Texteditor ──────────────────────────────────────── */

  function bauEditor(node, box, ctx) {
    const e = D.lesen(node, stand.offen);
    const text = entwurf && entwurf.pfad === stand.offen ? entwurf.text : String((e && e.text) || '');
    const art = editorArt(stand.offen);
    const hatJs = art === 'html' && /<script\b/i.test(text);

    box.innerHTML =
      leiste(D.basis(stand.offen), '<button class="k-add" id="fxSpeichern">Speichern</button>')
      + '<div class="ed" data-art="' + art + '">'
      +   '<pre class="ed-spiegel" id="fxSpiegel">' + faerben(text, art) + '</pre>'
      +   '<textarea class="ed-in" id="fxText" spellcheck="false" '
      +     'autocomplete="off" autocapitalize="off">' + esc(text) + '</textarea>'
      + '</div>'
      + '<div class="k-hint" id="fxJs"' + (hatJs ? '' : ' hidden') + '>'
      +   'Diese Seite enthält <strong>JavaScript</strong>. Der Webbrowser auf diesen '
      +   'Geräten führt es nicht aus — HTML und CSS schon.'
      + '</div>';

    const feld = box.querySelector('#fxText');
    const spiegel = box.querySelector('#fxSpiegel');
    const jsHinweis = box.querySelector('#fxJs');

    /* Nur der Spiegel wird nachgezogen, nicht das Fenster — ein
       voller Neuaufbau bei jedem Tastendruck risse den Textcursor
       aus dem Feld. Dasselbe Verfahren wie bei der zweifarbigen
       IP-Adresse in `konfig.malen()`. */
    const nachziehen = () => {
      entwurf = { node: node.id, pfad: stand.offen, text: feld.value };
      spiegel.innerHTML = faerben(feld.value, art);
      spiegel.scrollTop = feld.scrollTop;
      if (jsHinweis) jsHinweis.hidden = !(art === 'html' && /<script\b/i.test(feld.value));
    };
    feld.addEventListener('input', nachziehen);
    feld.addEventListener('scroll', () => { spiegel.scrollTop = feld.scrollTop; });

    box.querySelector('#fxSpeichern').addEventListener('click', () => {
      sichern(node);
      if (ctx.toast) ctx.toast('Gespeichert.');
      if (ctx.onDirty) ctx.onDirty();
    });
    zurueckKnopf(node, box, ctx);
  }

  /* ─── Der Bildbetrachter ──────────────────────────────────── */

  function bauBild(node, box, ctx) {
    const e = D.lesen(node, stand.offen);
    const quelle = e ? D.bildQuelle(e.bild) : null;
    box.innerHTML =
      leiste(D.basis(stand.offen), '')
      + (quelle
          ? '<div class="bv"><img src="' + quelle + '" alt="' + esc(D.basis(stand.offen)) + '"></div>'
          : '<div class="k-hint">Dieses Bild lässt sich nicht anzeigen.</div>');
    zurueckKnopf(node, box, ctx);
  }

  const leiste = (name, rechts) =>
    '<div class="fx-leiste">'
    + '<button class="fx-zurueck" id="fxZurueck">‹ Zurück</button>'
    + '<span class="fx-titel">' + esc(name) + '</span>'
    + rechts + '</div>';

  function zurueckKnopf(node, box, ctx) {
    const b = box.querySelector('#fxZurueck');
    if (!b) return;
    b.addEventListener('click', () => {
      sichern(node);
      stand.offen = null;
      if (ctx.onDirty) ctx.onDirty();
      ctx.render && ctx.render();
    });
  }

  /* Was im Feld steht, in die Datei schreiben. Gerufen beim
     Speichern, beim Zurückgehen und beim Schließen des Programms
     — ein Text, den ein Kind getippt und dann das Fenster
     zugemacht hat, darf nicht weg sein. */
  function sichern(node) {
    if (!entwurf) return;
    const n = node && node.id === entwurf.node ? node : null;
    if (n) D.schreiben(n, entwurf.pfad, entwurf.text);
    entwurf = null;
  }

  window.ProgDateien = {
    bauen: bauen,
    /* Von außen eine Datei aufschlagen — der Webserver verweist
       so auf seine `index.html`. Es setzt nur den Zustand; das
       Fenster baut ohnehin gleich neu auf. */
    zeigen: (nodeId, pfad) => {
      if (stand.node !== nodeId) zuruecksetzen(nodeId);
      stand.pfad = D.elternteil(pfad);
      stand.offen = pfad;
      stand.frage = stand.umbenennen = stand.neu = null;
    },
    /* Gerufen aus geraet.js, wenn das Programm zugeht. Das Gerät
       kommt mit, weil `entwurf` nur seine Kennung kennt. */
    schliessen: (node) => { sichern(node); },
    // Für den Prüfstand und für spätere Programme.
    faerben: faerben, editorArt: editorArt,
    _stand: () => stand
  };
})();
