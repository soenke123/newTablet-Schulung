/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — panels.js   ·   Gerätefenster · Mitschnitt ·
                                       Terminal
   ══════════════════════════════════════════════════════════════
   Die Flächen um das Netz herum — und das Fenster mitten darin.

   ── Wer wo einstellt ──────────────────────────────────────────
   Es gibt genau EIN Einstellformular (konfig.js) und zwei Orte,
   an denen es auftaucht:

     Fenster   neben dem Gerät, im Entwurf. Hier wird gebaut.
     Gerät     in der Geräteoberfläche, im Aktionsmodus
               (geraet.js). Hier wird im Betrieb nachgestellt.

   Es gab einmal einen dritten: eine Inspektorspalte am rechten
   Rand, die dieselben Adressen noch einmal zeigte, nur zum Lesen.
   Sie ist weg. Zwei Ansichten derselben Adresse sind keine
   Hilfe — man sucht dann erst die richtige. Und die Spalte nahm
   der Fläche 340 px ab, auch wenn gar nichts ausgewählt war.

   Was nur sie konnte, die Tabellen eines Geräts, steht jetzt im
   selben Fenster hinter „Mehr". Der Knopf schiebt das Fenster an
   den rechten Rand — an die Stelle, an der die Spalte stand. Wer
   die alte Ansicht will, hat sie; wer sie nicht will, hat die
   ganze Fläche.

   ── Mehrere Kärtchen auf einmal ───────────────────────────────
   Wörtlich verlangt: „Halte ich Strg gedrückt und ich klicke
   mehrere Geräte an, dann markiere ich auch mehrere Geräte aber ich
   öffne bei allen das Minimodal, so kann ich die Einstellungen von
   mehreren Geräten gleichzeitig einsehen."

   Das ist mehr als eine Bequemlichkeit, es ist der Kern des
   Unterrichts: „warum reden E1 und E2 nicht miteinander" ist eine
   Frage über ZWEI Geräte, und bisher konnte man immer nur eines
   ansehen. Mit zwei Kärtchen nebeneinander stehen die beiden
   Adressen untereinander und die Antwort steht da, ohne dass sie
   jemand vorlesen muss. Genau dafür gibt es die Subnetzfarben
   auch — dies ist ihr Gegenstück in Zahlen.

   ⚠️ Der Vorrat, nicht das Klonen bei jedem Öffnen: das Kärtchen
   steht als EIN Element in index.html und behält dort seine
   Kennungen (`#karte`, `#karteBody`, …). Wer ein zweites braucht,
   bekommt einen Abzug davon OHNE Kennungen — zwei Elemente mit
   derselben id wären im Dokument schlicht falsch, und jedes
   `getElementById` würde ab dann eines von beiden treffen, ohne zu
   sagen welches. Geschlossene Kärtchen gehen in den Vorrat zurück
   statt weggeworfen zu werden; damit bleibt das Element aus
   index.html das erste, das wieder benutzt wird.

   ⚠️ „Mehr ›" gibt es nur, solange EIN Kärtchen offen ist. Die
   große Ansicht ist ein Brett am rechten Rand über die ganze Höhe —
   zwei davon können nicht nebeneinander stehen. Ein Knopf, der
   sichtbar ist und dann etwas anderes tut als versprochen, ist
   schlimmer als einer, der weg ist.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  function Panels(refs, engine, netz, stack, mit, term, konfig, dienste, opts) {
    opts = opts || {};

    let termNode = null;   // welches Gerät hat das Terminal offen
    let unTerm = null;

    /* ─── Die offenen Kärtchen ──────────────────────────────────
       Schlüssel ist `art:kennung` ('node:n-3', 'cable:c-1'), damit
       ein Gerät und ein Kabel mit gleicher Nummer nicht dasselbe
       Kärtchen bekommen. Die Reihenfolge der Map ist die des
       Öffnens — daran hängt, welches Kärtchen beim Platzieren
       zuerst seinen Platz bekommt und welches ausweichen muss.

       Zwei Zustände je Kärtchen, und beide gehören dem Menschen
       davor, nicht dem Programm:

         mehr   groß und am rechten Rand. Bleibt eingeschaltet,
                wenn man das nächste Gerät antippt — wer die
                Tabellen sehen will, will sie beim nächsten Gerät
                auch sehen.
         frei   selbst hingeschoben. Dann rechnet placeKarte()
                nicht mehr dazwischen. Gilt bis das Kärtchen zugeht
                oder ein anderes Gerät drankommt: eine Hand, die
                etwas hingelegt hat, will es dort wiederfinden —
                aber nur, solange es um dasselbe Ding geht.       */
    const karten = new Map();
    /* `mehr` überlebt das Schließen: es ist eine Vorliebe („ich
       will die Tabellen sehen"), kein Zustand eines Geräts. Vorher
       war es eine Veränderliche neben dem einen Fenster und tat
       dasselbe. */
    let mehrWunsch = false;
    let zuletzt = null;    // Schlüssel des Kärtchens, um das es geht

    /* Freie Elemente. Das erste ist das aus index.html — mit seinen
       Kennungen, auf die der Prüfstand und `refs` zeigen. */
    const vorrat = [refs.karte];
    const vonEl = new Map();          // Element → Kärtchen

    const aktion = () => (opts.modus ? opts.modus() === 'aktion' : false);

    /* Das Kärtchen, um das es gerade geht — für alles, was nach
       „der Auswahl" fragt und mit einer Antwort auskommt. */
    const einKarte = () => karten.get(zuletzt) || null;

    /* ─── Ein Element aus dem Vorrat ────────────────────────────
       Beim Abzug fallen ALLE Kennungen weg, auch die der Kinder:
       `#karteBody` darf es im Dokument genau einmal geben. Die
       Teile werden danach über ihre Klasse gesucht, und das ist
       auch der Grund, warum das im Original schon so aussieht. */
    function holElement() {
      /* ⚠️ Das Element aus index.html hat VORRANG, solange es frei
         ist. Nur es trägt die Kennungen (`#karte`, `#karteBody`),
         und genau die sind der Weg, auf dem die Oberfläche von
         außen befragt werden kann — vom Prüfstand und von der
         Konsole. Ein Vorrat, der einfach das letzte
         zurückgegebene Element nimmt, würde nach dem ersten
         Strg-Klick dauerhaft den Abzug benutzen und das benannte
         Element versteckt liegen lassen: dann steht ein Kärtchen
         sichtbar auf dem Bildschirm und `#karte` ist unsichtbar.
         Nichts wäre kaputt, und doch wäre jede Aussage über
         `#karte` falsch. */
      const i = vorrat.indexOf(refs.karte);
      if (i >= 0) return vorrat.splice(i, 1)[0];
      if (vorrat.length) return vorrat.pop();
      const el = refs.karte.cloneNode(true);
      el.removeAttribute('id');
      el.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
      el.querySelector('.karte-b').innerHTML = '';
      refs.karte.parentElement.appendChild(el);
      return el;
    }

    function teile(el) {
      return {
        el,
        head: el.querySelector('.karte-h'),
        ic:   el.querySelector('.karte-ic'),
        kurz: el.querySelector('.karte-kurz'),
        name: el.querySelector('.karte-name'),
        pw:   el.querySelector('.karte-pw'),
        mehrBtn: el.querySelector('.karte-mehr'),
        x:    el.querySelector('.karte-x'),
        warn: el.querySelector('.karte-warn'),
        body: el.querySelector('.karte-b')
      };
    }

    /* ═══ Das Gerätefenster ══════════════════════════════════
       Neben dem Gerät. Im Entwurf öffnet es ein Klick auf ein
       Gerät oder ein Kabel; im Aktionsmodus tritt die
       Geräteoberfläche an seine Stelle.                          */

    /* Ein Kärtchen aufmachen (oder das vorhandene wiedergeben). */
    function oeffnen(kind, id) {
      const key = kind + ':' + id;
      let k = karten.get(key);
      if (!k) {
        k = teile(holElement());
        k.key = key; k.kind = kind; k.id = id;
        /* „Mehr" gilt nur für Geräte und nur, solange dieses eine
           Kärtchen allein steht — mehrere große Bretter am rechten
           Rand lägen übereinander. */
        k.mehr = kind === 'node' && mehrWunsch && karten.size === 0;
        k.frei = null;
        k.body.dataset.seite = '';
        k.body.dataset.reiter = '';
        vonEl.set(k.el, k);
        verdrahten(k);
        karten.set(key, k);
      }
      zuletzt = key;
      return k;
    }

    /* Ein einzelnes Kärtchen zu. Das Element geht in den Vorrat
       zurück — versteckt und leer, damit kein Formular eines
       Geräts weiterlebt, das gar nicht mehr gezeigt wird. */
    function closeEine(key) {
      const k = karten.get(key);
      if (!k) return;
      k.el.hidden = true;
      k.el.classList.remove('is-mehr', 'is-zieh');
      k.body.innerHTML = '';
      karten.delete(key);
      vonEl.delete(k.el);
      vorrat.push(k.el);
      if (zuletzt === key) zuletzt = [...karten.keys()].pop() || null;
      // Das hervorgehobene Kabel gehörte zum Fenster. Geht das
      // Fenster zu, bleibt sonst ein Kabel hell, das niemand mehr
      // erklärt.
      if (opts.betonen) opts.betonen(null);
    }

    function closeKarte() {
      for (const key of [...karten.keys()]) closeEine(key);
      // Kein Gerät mehr angesehen, also auch keine Einschränkung
      // im Mitschnitt.
      traceFolgen();
    }

    /* Alle offenen Kärtchen neu aufbauen. Im Aktionsmodus gibt es
       keine Gerätekärtchen — dort tritt die Geräteoberfläche an
       ihre Stelle.

       ⚠️ Für KABEL gilt das nicht, und das war ein Fehler: ein
       Kabel hat keine Geräteoberfläche, an deren Stelle es treten
       könnte. Sein Kärtchen ging im Aktionsmodus auf und beim
       nächsten beliebigen Neuzeichnen wieder zu — es sah aus wie
       ein Klick, der manchmal wirkt und manchmal nicht. Und die
       zwei Regler darin (Laufzeit, Paketverlust) gehören
       ausgerechnet dorthin, wo etwas LÄUFT. */
    function renderKarte() {
      if (aktion()) {
        for (const key of [...karten.keys()])
          if (karten.get(key).kind !== 'cable') closeEine(key);
        for (const key of [...karten.keys()]) renderEine(karten.get(key));
        placeKarte();
        traceFolgen();
        return;
      }
      if (opts.betonen) opts.betonen(null);
      for (const key of [...karten.keys()]) renderEine(karten.get(key));
      placeKarte();
    }

    function renderEine(k) {
      if (!k) return;
      /* Mehrere Kärtchen und eines davon groß geht nicht auf (siehe
         Kopf der Datei). Hier ist die einzige Stelle, an der das
         entschieden wird — auch beim Neuzeichnen, denn dazwischen
         kann ein zweites aufgegangen sein. */
      const allein = karten.size === 1;
      if (!allein) k.mehr = false;
      k.el.classList.toggle('is-mehr', k.mehr && k.kind === 'node');

      if (k.kind === 'cable') {
        const c = netz.getCable(k.id);
        if (!c) { closeEine(k.key); return; }
        const A = netz.get(c.a.node), B = netz.get(c.b.node);
        k.ic.textContent = '╱';
        k.kurz.textContent = 'Kabel';
        k.name.textContent = (A ? netz.kurzName(A) : '?') + ' ⟷ ' + (B ? netz.kurzName(B) : '?');
        k.pw.hidden = true;
        // Ein Kabel hat keine zweite Ansicht — zwei Regler und
        // zwei Knöpfe sind schon alles.
        k.mehrBtn.hidden = true;
        k.warn.hidden = true;
        bauKabel(k, c);
      } else {
        const n = netz.get(k.id);
        if (!n) { closeEine(k.key); return; }
        // Dasselbe Symbol wie auf der Fläche und in der Leiste —
        // aus dem einen Zeichensatz in index.html.
        k.ic.innerHTML = U.icon((netz.KIND[n.kind] || {}).icon || 'host');
        /* Groß steht das Kürzel, klein der ausgeschriebene Name —
           dieselbe Rangfolge wie auf der Fläche. Änderbar ist
           weder das eine noch das andere: ein Gerätename, den man
           umbenennen kann, ist ein Name, über den eine Klasse
           diskutiert, statt über Adressen. */
        k.kurz.textContent = netz.kurzName(n);
        k.name.textContent = n.name;
        k.pw.hidden = false;
        k.pw.classList.toggle('is-on', !!n.on);
        k.pw.title = n.on ? 'ausschalten' : 'einschalten';
        k.mehrBtn.hidden = !allein;
        k.mehrBtn.textContent = k.mehr ? '‹ Weniger' : 'Mehr ›';
        k.mehrBtn.title = k.mehr
          ? 'zurück zum kleinen Fenster neben dem Gerät'
          : 'DHCP, Tabellen und Erklärungen — am rechten Rand';

        warnAuffrischen(k, n);

        konfig.bauen(n, k.body, {
          mehr: k.mehr,
          onDirty: opts.onDirty,
          /* Die Warnzeile MUSS beim Tippen mitziehen. Sie wurde
             bisher nur beim Aufbauen des Fensters gesetzt — und
             stand dann über einem Feld, in dem längst eine Adresse
             stand: „Dieses Gerät hat noch keine IP-Adresse." Das
             Formular selbst wird dabei nicht neu gebaut, sonst
             springt der Fokus aus dem Feld. */
          redraw: () => { warnAuffrischen(k, n); if (opts.redraw) opts.redraw(); },
          rebuild: () => { renderEine(k); placeKarte(); },
          betonen: opts.betonen,
          toast: opts.toast,
          loeschen: () => loeschen(n)
        });
      }

      k.el.hidden = false;
    }

    /* Was an diesem Gerät gerade nicht stimmt — dasselbe, was auf
       der Fläche das Warnzeichen setzt (app.js: problemOf). */
    function warnAuffrischen(k, n) {
      const prob = opts.problemOf ? opts.problemOf(n) : null;
      k.warn.hidden = !prob;
      k.warn.textContent = prob || '';
    }

    function loeschen(n) {
      if (!window.confirm(n.name + ' wirklich löschen?')) return;
      if (termNode === n.id) closeTerminal();
      netz.removeNode(n.id);
      closeEine('node:' + n.id);
      if (opts.redraw) opts.redraw();
      if (opts.onDirty) opts.onDirty();
      if (opts.deselect) opts.deselect();
    }

    /* ─── Wohin das Fenster gehört ────────────────────────────
       Klein: neben das Gerät, nicht darauf. Rechts, wenn dort
       Platz ist, sonst links; senkrecht auf Höhe des Geräts, aber
       immer ganz auf der Fläche. Beim Verschieben des Geräts zieht
       es mit.

       Groß: an den rechten Rand, dorthin, wo bis eben der
       Inspektor stand. Das ist kein Zufall — der Blick sucht
       Tabellen dort, wo er sie kennt.

       Selbst hingeschoben: gar nicht. Dann gilt, was die Hand
       gemacht hat; nur der Rand wird noch geprüft, damit das
       Fenster nach einer Größenänderung nicht halb draußen liegt.

       Die Ecke links oben bleibt frei, wenn dort der Auftrag
       liegt: das ist derselbe Fehler, der schon einmal E1 des
       ersten Szenarios unanklickbar gemacht hat. */
    function placeKarte() {
      if (!karten.size) return;
      const stage = refs.karte.parentElement.getBoundingClientRect();
      /* Die schon vergebenen Plätze. Ein Kärtchen, das selbst
         hingeschoben wurde, steht mit drin: die anderen sollen ihm
         ausweichen, nicht es ihnen. */
      const belegt = [];
      for (const k of karten.values()) belegt.push(platzEines(k, stage, belegt));
    }

    function platzEines(k, stage, belegt) {
      const kw = k.el.offsetWidth  || 320;
      const kh = k.el.offsetHeight || 320;

      if (k.frei) {
        return setzen(k, U.clamp(k.frei.left, 8, Math.max(8, stage.width - kw - 8)),
                         U.clamp(k.frei.top, 8, Math.max(8, stage.height - 46)), kw, kh);
      }

      if (k.mehr && k.kind === 'node') {
        return setzen(k, Math.max(8, stage.width - kw - 12), 12, kw, kh);
      }

      const anker = opts.ankerOf ? opts.ankerOf(k.kind, k.id) : null;
      if (!anker) return { x: -1e6, y: -1e6, w: 0, h: 0 };

      /* ─── Zwei Kärtchen dürfen sich nicht deckungsgleich legen ──
         Zwei Geräte, die 30 Punkte auseinanderstehen, bekämen sonst
         zwei Kärtchen auf demselben Fleck: das obere wäre zu lesen,
         das untere gar nicht, und niemand sähe, dass da zwei sind.
         Genau dieser Fall ist der häufigste, denn verglichen werden
         Nachbarn.

         ⚠️ Hier stand zuerst eine Schleife, die nach unten
         auswich und, wenn unten kein Platz war, nach oben — bei
         jedem Durchgang neu entschieden. Das PENDELTE: nach unten
         passte es nicht, nach oben stieß es an, nach unten passte es
         wieder nicht … und nach vierzehn Durchgängen lag das
         Kärtchen genau dort, wo es angefangen hatte. Der Prüfstand
         hat es gefunden; im Code sah jeder der beiden Zweige für
         sich richtig aus. Die Lehre: bei einer Ausweichsuche gehört
         die Richtung in die LISTE der Kandidaten und nicht in eine
         Entscheidung, die in jedem Durchgang neu fällt.

         Die Kandidaten, in dieser Reihenfolge — und die Reihenfolge
         ist die Aussage:

           1. neben seinem Gerät, in Stufen nach unten und oben.
              Zuerst, weil die Nähe zum Gerät sagt, WOZU das
              Kärtchen gehört. Das ist die wichtigste Auskunft, die
              seine Lage überhaupt trägt.
           2. auf der anderen Seite des Geräts, ebenso gestuft.
           3. neben ein Kärtchen, das schon liegt. Der Ausweg, wenn
              senkrecht nichts mehr geht — und bei zwei Geräten
              übereinander ist das der Normalfall, denn zwei
              Kärtchen von 316 Punkten Höhe passen in 832 Punkte
              Bühne nur, wenn sie günstig liegen. Eine REIHE
              Kärtchen ist ohnehin das, was man beim Vergleichen
              will.

         Findet sich nichts, bleibt der erste Platz. Dann sind mehr
         Kärtchen offen, als der Bildschirm hergibt — und dafür lässt
         sich jedes am Kopf packen und hinlegen. */
      const luft = 16, stufe = 34;
      const maxL = Math.max(8, stage.width - kw - 8);
      const maxT = Math.max(8, stage.height - kh - 8);
      const rechts = anker.x + anker.w / 2 + luft;
      const links  = anker.x - anker.w / 2 - kw - luft;
      const yMitte = anker.y - kh / 2;

      const kandidaten = [];
      const seiten = rechts + kw <= stage.width - 8 ? [rechts, links] : [links, rechts];
      for (const x of seiten)
        for (const dy of [0, stufe, -stufe, 2 * stufe, -2 * stufe, 3 * stufe, -3 * stufe,
                          4 * stufe, -4 * stufe])
          kandidaten.push([x, yMitte + dy]);
      // Zuletzt gelegte zuerst: die Reihe wächst nach rechts.
      for (const b of [...belegt].reverse()) {
        kandidaten.push([b.x + b.w + 8, b.y]);
        kandidaten.push([b.x - kw - 8, b.y]);
      }

      let left = U.clamp(kandidaten[0][0], 8, maxL);
      let top  = U.clamp(kandidaten[0][1], 8, maxT);
      for (const [x, y] of kandidaten) {
        const cx = U.clamp(x, 8, maxL), cy = U.clamp(y, 8, maxT);
        if (!stoesst(cx, cy, kw, kh, belegt)) { left = cx; top = cy; break; }
      }
      return setzen(k, left, top, kw, kh);
    }

    /* Berühren sich zwei Kärtchen? Mit ein paar Punkten Luft — zwei
       Fenster, deren Kanten aneinanderkleben, sehen aus wie eines. */
    function stoesst(x, y, w, h, belegt) {
      const luft = 6;
      return belegt.some(b =>
        x < b.x + b.w + luft && x + w + luft > b.x &&
        y < b.y + b.h + luft && y + h + luft > b.y);
    }

    function setzen(k, left, top, w, h) {
      k.el.style.left = Math.round(left) + 'px';
      k.el.style.top = Math.round(top) + 'px';
      return { x: left, y: top, w: w || k.el.offsetWidth, h: h || k.el.offsetHeight };
    }

    /* ─── Kabel im Kärtchen ───────────────────────────────────*/
    function bauKabel(k, c) {
      const box = k.body;
      box.innerHTML =
        /* Beschriftung links, Regler rechts — dasselbe Raster wie
           im Einstellformular (.k-f, konfig.js). Der Wert steht im
           Feldteil unter dem Regler, nicht in einer eigenen
           Gitterzeile. */
        '<label class="k-f"><span class="k-f-l">Laufzeit</span><span class="k-f-in">'
        +   '<input type="range" id="cDelay" min="10" max="600" step="10" value="' + Math.round(c.delay / 1000) + '">'
        +   '<span class="rangeval" id="cDelayV">' + Math.round(c.delay / 1000) + ' ms</span></span></label>'
        /* ⚠️ Hier stand „Wie lange ein RAHMEN auf dieser Leitung
           unterwegs ist." Das Wort ist richtig (Ethernet-Frame, so
           heißt es im Mitschnitt und am Switch) — an dieser Stelle
           beantwortet es aber die falsche Frage. Vom Nutzer: „Ich
           verstehe hier die Formulierung mit ‚Rahmen' nicht. Was
           meinst du damit?", und in derselben Zeile: „Kann ich damit
           Glasfaser vs Kupfer darstellen?"

           Beides hat eine Ursache: der Regler sieht aus wie eine
           GESCHWINDIGKEIT und ist eine DAUER. Er verzögert (netz.js,
           `sendFrame`), er überträgt nicht. Eine Datenrate gibt es
           hier nicht und kann es nicht geben, solange eine Datei als
           EIN Paket über die Leitung geht (keine MSS, keine
           Fragmentierung — siehe den Kopf von schichten.js). Also
           sagt der Satz jetzt selbst, was die Zahl NICHT ist: das
           ist die Antwort auf die Glasfaser-Frage genau dort, wo sie
           entsteht. */
        + '<div class="k-hint">Wie lange ein Paket auf dieser Leitung unterwegs ist. '
        +   'Ein Kabel im Raum ist kurz, eine Leitung über Land lang — es ist '
        +   '<strong>keine Datenrate</strong> (kein Mbit/s).</div>'
        + '<label class="k-f"><span class="k-f-l">Paketverlust</span><span class="k-f-in">'
        +   '<input type="range" id="cLoss" min="0" max="50" value="' + Math.round(c.loss * 100) + '">'
        +   '<span class="rangeval" id="cLossV">' + Math.round(c.loss * 100) + ' %</span></span></label>'
        + '<div class="k-hint">Für Aufgaben: eine Leitung, die manchmal etwas verschluckt.</div>'
        + '<div class="k-acts">'
        +   '<button class="btn" id="cUp">' + (c.up ? 'Kabel ziehen' : 'Kabel einstecken') + '</button>'
        +   '<button class="btn btn--ghost" id="cDel">Kabel löschen</button>'
        + '</div>';

      const d = box.querySelector('#cDelay');
      d.addEventListener('input', () => {
        c.delay = +d.value * 1000;
        box.querySelector('#cDelayV').textContent = d.value + ' ms';
        if (opts.onDirty) opts.onDirty();
        if (opts.redraw) opts.redraw();
      });
      const l = box.querySelector('#cLoss');
      l.addEventListener('input', () => {
        c.loss = +l.value / 100;
        box.querySelector('#cLossV').textContent = l.value + ' %';
        if (opts.onDirty) opts.onDirty();
        if (opts.redraw) opts.redraw();
      });
      box.querySelector('#cUp').addEventListener('click', () => {
        c.up = !c.up;
        renderEine(k); placeKarte();
        if (opts.redraw) opts.redraw();
        if (opts.onDirty) opts.onDirty();
      });
      /* Löschen geht über app.js und nicht hier — dieselbe Stelle,
         die auch die Entf-Taste bedient. Zwei Wege zum selben
         Ergebnis dürfen nicht zwei verschiedene Schritte in den
         Verlauf legen: vorher meldete der Knopf „Einstellung
         geändert", und wer danach Strg+Z drückte, wusste nicht,
         dass damit ein Kabel zurückkommt. */
      box.querySelector('#cDel').addEventListener('click', () => {
        if (opts.onKabelWeg) opts.onKabelWeg(c.id);
      });
    }

    /* ─── Kopfzeile eines Kärtchens ───────────────────────────
       Einmal je ELEMENT verdrahtet, nicht je Öffnen: die Elemente
       kommen aus dem Vorrat zurück, und ein zweites Mal
       angehängter Empfänger würde beim nächsten Klick alles doppelt
       tun (aus- und wieder einschalten zum Beispiel — ein Fehler,
       der wie „der Knopf tut nichts" aussieht). Welches Kärtchen
       gemeint ist, sagt `vonEl`. */
    function verdrahten(k) {
      if (k.el.dataset.verdrahtet) return;
      k.el.dataset.verdrahtet = '1';
      const self = () => vonEl.get(k.el);

      k.pw.addEventListener('click', () => {
        const c = self();
        if (!c || c.kind !== 'node') return;
        const n = netz.get(c.id);
        if (!n) return;
        n.on = !n.on;
        // Ein ausgeschaltetes Gerät vergisst alles. Das ist nicht
        // nur richtig, es ist auch der einfachste Weg, einer Klasse
        // ARP noch einmal zu zeigen: aus, an, ping.
        stack.clearTables(n);
        engine.dropOwner(n.id);
        if (dienste) dienste.sync();
        renderEine(c); placeKarte();
        if (opts.redraw) opts.redraw();
        if (opts.onDirty) opts.onDirty();
      });

      /* „Mehr" ist kein zweites Fenster, sondern dasselbe in groß.
         Deshalb fällt beim Umschalten auch eine selbst gewählte
         Stelle weg: das Fenster wird breiter und höher und läge
         sonst zur Hälfte außerhalb der Fläche. */
      k.mehrBtn.addEventListener('click', () => {
        const c = self();
        if (!c) return;
        c.mehr = !c.mehr;
        mehrWunsch = c.mehr;
        c.frei = null;
        // Die Unterseite „DHCP-Server einrichten" gibt es nur groß.
        // Beim Zuklappen bleibt sie sonst als leere Seite stehen.
        if (!c.mehr) c.body.dataset.seite = '';
        renderEine(c); placeKarte();
      });

      k.x.addEventListener('click', () => {
        const c = self();
        if (!c) return;
        closeEine(c.key);
        knoepfeAbgleich();
        placeKarte();
        /* Abgewählt wird nur, wenn das letzte Kärtchen zugeht. Bei
           drei offenen Kärtchen ist „dieses hier weg" keine Aussage
           über die Auswahl — sonst verlöre man mit einem × die
           anderen beiden Markierungen mit. */
        if (!karten.size && opts.deselect) opts.deselect();
      });

      /* ─── Am Kopf festhalten und hinschieben ────────────────
         Dasselbe wie bei der Geräteoberfläche (geraet.js). Nötig,
         weil auf einem vollen Netzplan JEDE ausgerechnete Stelle
         irgendwann über dem Gerät liegt, um das es gerade geht —
         und weil eine Lehrkraft am Beamer das Fenster dorthin legen
         will, wo die Klasse hinsieht. Mit mehreren Kärtchen ist es
         der Weg, sie nebeneinanderzulegen. */
      let zieh = null;
      k.head.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('button')) return;
        const c = self();
        if (!c) return;
        const r = c.el.getBoundingClientRect();
        const s = c.el.parentElement.getBoundingClientRect();
        zieh = { c, dx: ev.clientX - r.left, dy: ev.clientY - r.top, s, w: r.width };
        k.head.setPointerCapture(ev.pointerId);
        c.el.classList.add('is-zieh');
        /* Nach vorn holen: wer ein Kärtchen anfasst, will es
           obenauf haben. Ohne das läge ein verschobenes Kärtchen
           unter einem, das es gerade freilegen sollte. */
        zuletzt = c.key;
        obenauf(c);
      });
      k.head.addEventListener('pointermove', (ev) => {
        if (!zieh) return;
        zieh.c.frei = {
          left: U.clamp(ev.clientX - zieh.dx - zieh.s.left, 8, Math.max(8, zieh.s.width - zieh.w - 8)),
          top:  U.clamp(ev.clientY - zieh.dy - zieh.s.top, 8, Math.max(8, zieh.s.height - 46))
        };
        setzen(zieh.c, zieh.c.frei.left, zieh.c.frei.top);
      });
      const ziehEnde = () => {
        if (zieh) zieh.c.el.classList.remove('is-zieh');
        zieh = null;
      };
      k.head.addEventListener('pointerup', ziehEnde);
      k.head.addEventListener('pointercancel', ziehEnde);
    }

    /* ─── „Mehr ›" gilt für ALLE Kärtchen, nicht nur für das neue ─
       ⚠️ Das hat der Prüfstand gefunden, und es ist die Sorte
       Fehler, die beim Bauen unsichtbar ist: wer ein zweites
       Kärtchen aufmacht, baut nur DIESES auf — und das erste behielt
       seinen Knopf „Mehr ›". Gedrückt hätte er ein Brett über die
       ganze Höhe aufgeschlagen und das zweite Kärtchen darunter
       begraben. Jede der beiden Stellen sah für sich richtig aus;
       die Regel „nur allein gibt es Mehr" gilt aber für den
       ZUSTAND aller Kärtchen und nicht für einen Vorgang.

       Ein Kärtchen, das schon groß war, muss dabei neu gebaut
       werden: die große Ansicht hat Felder, die die kleine nicht
       hat. Nur das Kennzeichen umzuhängen ließe ein 400 px breites
       Kärtchen mit DHCP-Abschnitt stehen, an dem „Mehr ›" fehlt. */
    function knoepfeAbgleich() {
      const allein = karten.size === 1;
      for (const k of [...karten.values()]) {
        if (k.kind !== 'node') continue;
        if (!allein && k.mehr) { k.mehr = false; renderEine(k); }
        k.mehrBtn.hidden = !allein;
      }
    }

    /* Die Stapelfolge. `z-index` steht im Stylesheet bei 6; hier
       wird nur innerhalb dieser sechs sortiert, damit das angefasste
       Kärtchen über den anderen liegt. */
    function obenauf(k) {
      let i = 0;
      for (const c of karten.values()) c.el.style.zIndex = String(6 + (++i));
      k.el.style.zIndex = String(6 + karten.size + 1);
    }

    /* ═══ Auswahl ════════════════════════════════════════════*/

    /* ─── Der Mitschnitt folgt der Auswahl ────────────────────
       Filius' Bedienmodell, mit unserer Geste: dort ist es ein
       Rechtsklick aufs Gerät → „Datenaustausch anzeigen", hier
       genügt das Antippen, das man ohnehin macht.

       Die Regel ist bewusst schlicht: GENAU EIN Kärtchen offen →
       der Mitschnitt zeigt dieses Gerät. Keines oder mehrere →
       er zeigt wieder das ganze Netz. Bei zwei markierten Geräten
       auf eines davon einzuschränken wäre geraten, und die Frage,
       für die man zwei Geräte nebeneinander legt („warum reden
       die beiden nicht"), ist ohnehin eine über den Verkehr
       ZWISCHEN ihnen — also über die ungefilterte Liste.

       Nur bei einer echten Änderung neu zeichnen. Sonst baut
       jeder Klick auf dasselbe Gerät die ganze Liste noch einmal
       auf, und wer gerade eine Zeile aufgeklappt hat, verliert
       seinen Platz. */
    function traceFolgen() {
      const nodes = [...karten.keys()].filter(k => k.indexOf('node:') === 0);
      const id = nodes.length === 1 ? nodes[0].slice(5) : null;
      if ((mit.filter.node || null) === id) return;
      mit.setGeraet(id);
      renderTrace();
    }

    /* Ein Gerät ansehen und alle anderen Kärtchen zumachen — der
       gewöhnliche Klick. */
    function showNode(id) {
      if (!id) { closeKarte(); return; }
      const behalten = 'node:' + id;
      for (const key of [...karten.keys()]) if (key !== behalten) closeEine(key);
      const k = oeffnen('node', id);
      renderEine(k);
      obenauf(k);
      placeKarte();
      traceFolgen();
    }

    /* Strg-Klick: dazunehmen — oder, wenn es schon offen ist, wieder
       zumachen. Dieselbe Umkehrbarkeit wie beim Markieren selbst;
       eine Geste, die nur in eine Richtung wirkt, wäre bei fünf
       Geräten eine Sackgasse. */
    function dazuNode(id) {
      if (!id) return;
      const key = 'node:' + id;
      if (karten.has(key)) { closeEine(key); knoepfeAbgleich(); placeKarte(); traceFolgen(); return; }
      const k = oeffnen('node', id);
      renderEine(k);
      knoepfeAbgleich();
      obenauf(k);
      placeKarte();
      traceFolgen();
    }

    function showCable(id) {
      closeKarte();
      const k = oeffnen('cable', id);
      renderEine(k);
      placeKarte();
      // Ein Kabel ist kein Gerät: die Einschränkung fällt weg.
      traceFolgen();
    }

    /* Nur die Kärtchen behalten, die zu diesen Geräten gehören —
       und keine neuen aufmachen. Das braucht die Rechteckauswahl:
       sie soll KEINE Fenster aufschlagen, aber eines, das zu einem
       nun nicht mehr markierten Gerät gehört, darf auch nicht
       stehenbleiben. */
    function nurBehalten(ids) {
      const drin = new Set((ids || []).map(i => 'node:' + i));
      let weg = false;
      for (const key of [...karten.keys()]) {
        if (key.indexOf('node:') === 0 && !drin.has(key)) { closeEine(key); weg = true; }
      }
      if (weg) { knoepfeAbgleich(); placeKarte(); traceFolgen(); }
    }

    /* ═══ Mitschnitt ═════════════════════════════════════════ */

    /* Welcher Rahmen ist angefasst. In der Zeilenansicht heißt das
       „aufgeklappt", in der Schichtenansicht „hervorgehoben" —
       dasselbe Merkmal, weil es dieselbe Frage beantwortet: um
       welchen Rahmen geht es gerade. */
    let openRow = null;

    /* Die Richtung als Pfeil. ↑ ging hinaus, ↓ kam an. Ein Pfeil
       statt eines Wortes, weil die Spalte sonst breiter wäre als
       der Gerätename daneben — und weil man eine Spalte aus
       Pfeilen senkrecht lesen kann, eine aus Wörtern nicht. */
    const pfeil = (r) => r.dir === 'rein'
      ? '<span class="tr-d tr-d--rein" title="hier angekommen">↓</span>'
      : '<span class="tr-d" title="von hier hinausgegangen">↑</span>';

    function renderTrace() {
      const rows = mit.view();
      const body = refs.traceBody;
      kopfAbgleich(rows);

      if (!rows.length) {
        body.innerHTML = '<div class="tr-empty">' + (mit.total
          ? 'Nichts, was zu diesem Filter passt.'
          : 'Noch nichts auf der Leitung. Öffne ein Terminal und schick einen Ping los.')
          + '</div>';
        return;
      }

      /* Nur die letzten 300 Rahmen zeichnen: darüber wird die
         Liste zäh, und gelesen wird ohnehin von unten. In der
         Schichtenansicht sind das bis zu fünfmal so viele
         ZEILEN — deshalb dort weniger Rahmen, damit die Zahl der
         Elemente im Dokument dieselbe bleibt. */
      const schichten = mit.modus === 'schichten';
      const show = rows.slice(schichten ? -120 : -300);

      /* ⚠️ Nur ans Ende rollen, wenn man schon am Ende WAR. Vom
         Nutzer: „Wenn ich scrolle und ein neuer Eintrag kommt, soll
         sich die Leiste nicht verschieben." Vorher sprang die Liste
         bei jedem Rahmen nach unten, und wer weiter oben las, verlor
         seine Zeile. Sonst bleibt die oberste sichtbare Zeile, wo sie
         war — gemessen an ihrer Nummer und nicht an `scrollTop`,
         denn oben fallen beim Kappen (`slice`) Zeilen weg. */
      const unten = !body.clientHeight
        || body.scrollHeight - body.scrollTop - body.clientHeight < 24;
      let anker = null;
      if (!unten) {
        const oben = body.getBoundingClientRect().top;
        for (const d of body.querySelectorAll('[data-n]')) {
          const r = d.getBoundingClientRect();
          if (r.bottom > oben + 1) { anker = { n: d.dataset.n, dy: r.top - oben }; break; }
        }
      }

      body.innerHTML = schichten ? malenSchichten(show) : malenZeilen(show);

      const ziel = anker && body.querySelector('[data-n="' + anker.n + '"]');
      if (ziel) {
        body.scrollTop += ziel.getBoundingClientRect().top - body.getBoundingClientRect().top - anker.dy;
      } else {
        body.scrollTop = body.scrollHeight;
      }

      body.querySelectorAll('[data-n]').forEach(d => {
        d.addEventListener('click', () => {
          const n = +d.dataset.n;
          openRow = (openRow === n) ? null : n;
          renderTrace();
        });
      });
    }

    /* Die Leiste über der Liste: Anzahl, gewähltes Gerät,
       Richtungs- und Ansichtsknopf. Das läuft bei JEDEM Zeichnen
       mit und nicht nur beim Klicken, weil sich zwei davon auch
       ohne Klick ändern — die Anzahl ohnehin, und die Richtung,
       wenn ein Gerät gewählt wird. */
    function kopfAbgleich(rows) {
      const f = mit.filter;

      refs.traceCount.textContent = rows.length
        ? rows.length + (mit.total > rows.length ? ' von ' + mit.total : '')
        : (mit.total ? '0 von ' + mit.total : 'nichts aufgezeichnet');

      if (refs.traceGeraet) {
        const n = f.node && netz.get(f.node);
        refs.traceGeraet.hidden = !n;
        if (n) refs.traceGeraet.innerHTML = 'nur ' + esc(n.name) + ' <b>×</b>';
      }
      /* Kurze Beschriftungen, und der ganze Satz steht im
         Tooltip. Die Leiste ist EINE Zeile fester Höhe (siehe
         `.trace-h` im Stylesheet) — was hier zu lang wird, drückt
         „Kopieren" und „Leeren" aus dem Bild. */
      if (refs.traceDir) {
        const beide = f.dir === 'beide';
        const v = mit.versteckt;
        refs.traceDir.textContent = beide ? '↕ beide' : '↑ gesendet' + (v ? ' +' + v : '');
        refs.traceDir.title = beide
          ? 'Gesendete und empfangene Rahmen. Wie Filius, das an jeder '
            + 'Netzwerkkarte beide Richtungen aufzeichnet. Klick: nur Gesendetes.'
          : 'Nur gesendete Rahmen'
            + (v ? ' — ' + v + ' empfangene sind ausgeblendet' : '')
            + '. Über das ganze Netz stünde sonst jeder Rahmen mehrfach da. '
            + 'Klick: auch Empfangenes.';
        refs.traceDir.classList.toggle('is-on', beide);
      }
      if (refs.traceModus) {
        const s = mit.modus === 'schichten';
        refs.traceModus.textContent = s ? 'Schichten' : 'Zeilen';
        refs.traceModus.title = s
          ? 'Eine Zeile je Schicht, wie im Datenaustausch-Fenster von Filius — '
            + 'Quelle und Ziel wechseln mit der Schicht: MAC, dann IP, dann Port. '
            + 'Klick: eine Zeile je Rahmen.'
          : 'Eine Zeile je Rahmen, Schichten beim Anklicken. '
            + 'Klick: Filius-Ansicht mit einer Zeile je Schicht.';
        refs.traceModus.classList.toggle('is-on', s);
        // Neun Spalten brauchen mehr Breite als die Leiste hat —
        // die Marke am Körper schaltet das waagerechte Scrollen
        // der Liste ein (und nur der Liste, nie der Seite).
        document.body.classList.toggle('trace-schichten', s);
      }
    }

    /* ─── Ansicht „Zeilen" ────────────────────────────────────
       Eine Zeile je Rahmen, Schichten beim Aufklappen. Die
       kompakte Ansicht — hier liest man die Geschichte. */
    function malenZeilen(show) {
      let h = '';
      for (const r of show) {
        const open = openRow === r.n;
        h += '<div class="tr' + (r.lost ? ' is-lost' : '') + (open ? ' is-open' : '') + '" data-n="' + r.n + '">'
          + '<span class="tr-t">' + esc(U.fmtTime(r.t)) + '</span>'
          + pfeil(r)
          + '<span class="tr-n">' + esc(r.nodeName) + '</span>'
          + '<span class="tr-p tr-p--' + esc(r.proto.toLowerCase()) + '">' + esc(r.proto) + '</span>'
          + '<span class="tr-i">' + esc(r.info)
          //  „× 4" heißt: derselbe Rahmen ging gleichzeitig über
          //  vier Anschlüsse hinaus. So sieht man das Fluten eines
          //  Switches, ohne dass es die Liste zuschüttet.
          + (r.mal > 1 ? ' <b class="tr-x" title="derselbe Rahmen ging über '
              + r.mal + ' Anschlüsse gleichzeitig hinaus">× ' + r.mal + '</b>' : '')
          + (r.lost ? ' <em>— verloren</em>' : '') + '</span>'
          + '</div>';
        if (open) h += renderLayers(r);
      }
      return h;
    }

    /* ─── Ansicht „Schichten" ─────────────────────────────────
       Filius' Datenaustausch-Fenster: eine Zeile je Schicht, alle
       Zeilen eines Rahmens unter derselben Nummer, nach Schicht
       eingefärbt.

       Der Kopf ist klebrig — anders als bei Filius, wo die
       Tabelle in einem eigenen Fenster steht und man die Spalten
       immer sieht. Hier liegt die Liste in einer flachen Leiste am
       unteren Rand, und ohne klebenden Kopf hätte man nach zehn
       Zeilen neun Spalten ohne Namen vor sich. */
    function malenSchichten(show) {
      let h = '<div class="trs trs--kopf">'
        + '<span>Nr.</span><span>Zeit</span><span></span><span>Gerät</span>'
        + '<span>Quelle</span><span>Ziel</span><span>Protokoll</span>'
        + '<span title="Filius nennt die vier Schichten des TCP/IP-Modells so">Schicht</span>'
        + '<span>Bemerkungen / Details</span></div>';

      for (const r of show) {
        const ls = mit.layers(r);
        const sel = openRow === r.n;
        ls.forEach((l, i) => {
          h += '<div class="trs l--' + esc(String(l.schicht).toLowerCase())
            + (i === 0 ? ' is-first' : '')
            + (sel ? ' is-sel' : '') + (r.lost ? ' is-lost' : '')
            + '" data-n="' + r.n + '">'
            //  Die Nummer steht nur in der ERSTEN Zeile eines
            //  Rahmens. Filius wiederholt sie in jeder; dort ist
            //  sie aber auch das einzige, was die Zusammengehörig-
            //  keit zeigt. Hier tun das die Farbe und der Strich
            //  darüber, und eine viermal wiederholte Zahl sähe aus
            //  wie vier Rahmen.
            + '<span class="trs-n">' + (i === 0 ? r.n : '') + '</span>'
            + '<span class="trs-t">' + (i === 0 ? esc(U.fmtTime(r.t)) : '') + '</span>'
            + (i === 0 ? pfeil(r) : '<span class="tr-d"></span>')
            + '<span class="trs-g">' + (i === 0 ? esc(r.nodeName) : '') + '</span>'
            + '<span class="trs-q">' + esc(l.quelle) + '</span>'
            + '<span class="trs-z">' + esc(l.ziel) + '</span>'
            + '<span class="trs-p">' + esc(l.proto) + '</span>'
            + '<span class="trs-s"><i>' + esc(l.schicht) + '</i></span>'
            + '<span class="trs-b">' + esc(l.details)
            + (i === 0 && r.mal > 1 ? ' <b class="tr-x" title="derselbe Rahmen ging über '
                + r.mal + ' Anschlüsse gleichzeitig hinaus">× ' + r.mal + '</b>' : '')
            + (i === 0 && r.lost ? ' <em>— verloren</em>' : '') + '</span>'
            + '</div>';
        });
      }
      return h;
    }

    /* Das aufgeklappte Paket. Der Grund, warum es diesen
       Mitschnitt gibt: ein Rahmen ist eine Zwiebel, und hier
       sieht man ihre Schalen. */
    function renderLayers(r) {
      const ls = mit.layers(r);
      let h = '<div class="tr-det">';
      for (const l of ls) {
        // Dieselbe Farbe je Schicht wie in der Schichtenansicht.
        h += '<div class="tr-lay l--' + esc(String(l.schicht).toLowerCase()) + '">'
          + '<div class="tr-lay-h">Schicht ' + l.n + ' · ' + esc(l.name)
          + ' <span class="tr-lay-s">' + esc(l.schicht) + '</span></div>';
        for (const [k, v] of l.fields)
          h += '<div class="tr-f"><span>' + esc(k) + '</span><span class="mono">' + esc(v) + '</span></div>';
        h += '</div>';
      }
      return h + '</div>';
    }

    /* ═══ Terminal ═══════════════════════════════════════════ */

    function openTerminal(nodeId) {
      const n = netz.get(nodeId);
      if (!n) return;
      termNode = nodeId;
      menuZu();
      refs.term.classList.add('is-open');
      refs.termTitle.textContent = n.name;
      if (unTerm) unTerm();
      unTerm = term.onChange(nodeId, renderTerm);
      renderTerm();
      setTimeout(() => refs.termInput.focus(), 30);
    }

    function closeTerminal() {
      termNode = null;
      menuZu();
      refs.termStop.hidden = true;
      refs.term.classList.remove('is-open');
      if (unTerm) { unTerm(); unTerm = null; }
    }

    function renderTerm() {
      if (!termNode) return;
      const lines = term.linesOf(termNode);
      refs.termOut.innerHTML = lines
        .map(l => '<div class="tl ' + (l.cls ? 'tl--' + l.cls : '') + '">' + esc(l.text || ' ') + '</div>')
        .join('');
      refs.termOut.scrollTop = refs.termOut.scrollHeight;
      refs.termStop.hidden = !term.isBusy(termNode);
    }

    refs.termInput.addEventListener('keydown', (ev) => {
      if (!termNode) return;
      if (ev.key === 'Escape') {
        // Erst das Menü, dann den laufenden Befehl.
        if (!refs.termMenu.hidden) { menuZu(); ev.stopPropagation(); return; }
        if (term.abort(termNode)) ev.stopPropagation();
        return;
      }
      if (ev.key === 'Enter') {
        const v = refs.termInput.value;
        refs.termInput.value = '';
        term.submit(termNode, v);
        return;
      }
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        const v = term.historyStep(termNode, ev.key === 'ArrowUp' ? -1 : 1);
        if (v !== null) refs.termInput.value = v;
      }
    });
    refs.termClose.addEventListener('click', closeTerminal);

    /* Die Befehle in einem kleinen Menü oben im Terminal, statt
       als Knopfreihe unter der Ausgabe (die nahm eine ganze Zeile
       weg). Tippen auf einem Tablet ist mühsam, und „ipconfig"
       schreibt sich in der 8. Klasse nicht von selbst — deshalb
       bleibt es ein Tippen und kein Nachschlagen.

       ⚠️ Das Menü liegt ÜBER der Ausgabe und nicht als Ausklapper
       über dem Terminal: das Terminal hat `overflow: hidden`, und
       im Gerätefenster würde ein Ausklapper abgeschnitten. */
    function menuZu() {
      refs.termMenu.hidden = true;
      refs.termCmds.setAttribute('aria-expanded', 'false');
    }
    refs.termCmds.addEventListener('click', () => {
      const auf = refs.termMenu.hidden;
      refs.termMenu.hidden = !auf;
      refs.termCmds.setAttribute('aria-expanded', String(auf));
    });
    refs.termMenu.querySelectorAll('[data-cmd]').forEach(b => {
      b.addEventListener('click', () => {
        menuZu();
        if (!termNode) return;
        const c = b.dataset.cmd;
        if (b.hasAttribute('data-fill')) {
          refs.termInput.value = c + ' ';
          refs.termInput.focus();
        } else {
          term.submit(termNode, c);
          refs.termInput.focus();
        }
      });
    });

    // Läuft ein Befehl, gibt es einen Knopf zum Abbrechen — auf dem
    // Tablet gibt es kein Esc.
    refs.termStop.addEventListener('click', () => {
      if (termNode) term.abort(termNode);
      refs.termInput.focus();
    });

    /* Während die Uhr läuft: nur die Tabellen im Fenster
       nachziehen, nicht das ganze Formular. */
    function tabellenAuffrischen() {
      for (const k of karten.values()) {
        if (k.kind !== 'node' || !k.mehr) continue;
        if (k.body.dataset.seite) continue;
        const n = netz.get(k.id);
        if (n) konfig.malenTabellen(n, k.body);
      }
    }

    /* ⚠️ Die Weiterleitungszeilen stehen seit 2026-09-28 an zwei
       Orten: im Kärtchen und unten im Fenster. Tippt jemand im
       Fenster, muss das Kärtchen mitgehen — aber nachmalen und
       nicht neu bauen, sonst springt bei jedem Tastendruck sein
       Bildlauf. Gerufen aus `weiterleitung.js` über app.js.

       Ohne `k.mehr`-Bedingung, anders als oben: die
       Weiterleitungstabelle steht im Reiter „Allgemein" und damit
       auch in der kleinen Ansicht. */
    function wegeAuffrischen(node) {
      if (!node) return;
      for (const k of karten.values()) {
        if (k.kind !== 'node' || k.id !== node.id) continue;
        if (k.body.dataset.seite) continue;
        konfig.wegeMalen(node, k.body);
      }
      tabellenAuffrischen();
    }

    return {
      showNode, dazuNode, showCable, nurBehalten,
      renderTrace, tabellenAuffrischen, wegeAuffrischen,
      renderKarte, closeKarte, placeKarte,
      openTerminal, closeTerminal, renderTerm,
      get termNode() { return termNode; },
      /* Worum es gerade geht — das zuletzt aufgemachte Kärtchen.
         Eine Auswahl aus fünf Geräten hat trotzdem genau ein
         „gerade angefasst", und alles, was hier fragt, will das. */
      get selection() {
        const k = einKarte();
        return k ? { kind: k.kind, id: k.id } : null;
      },
      /* Steht überhaupt ein Kärtchen offen? Die Fläche fragt danach,
         wenn ein Gerät angetippt wird: dasselbe Gerät ein zweites
         Mal antippen heißt zumachen. */
      get karteOffen() { return karten.size > 0; },
      /* Welche Geräte haben ein Kärtchen offen? Für den Prüfstand
         und für app.js, das beim Rückgängigmachen aufräumt. */
      get offeneKarten() { return [...karten.keys()]; },
      istOffen(kind, id) { return karten.has(kind + ':' + id); }
    };
  }

  window.Panels = Panels;
})();
