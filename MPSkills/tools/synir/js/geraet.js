/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — geraet.js   ·   Die Oberfläche eines Geräts
   ══════════════════════════════════════════════════════════════
   Im Aktionsmodus tippt man ein Gerät an und sieht, was darauf
   läuft. Filius nennt das den Desktop und hat recht damit: ein
   Rechner ist im Unterricht nicht nur ein Kästchen im Netzplan,
   sondern das Ding, auf dem man etwas TUT — ein Terminal öffnen,
   die Adresse nachsehen, später einen Browser starten.

   ── Warum das eine eigene Datei ist ───────────────────────────
   Weil hier die Liste steht, die in den nächsten Monaten wächst.
   Ein Programm ist ein Eintrag in PROGRAMME: ein Name, ein
   Zeichen, für welche Gerätearten es gilt, und eine Funktion, die
   seinen Inhalt in ein leeres <div> baut. Mehr nicht. DHCP-
   Einstellungen, DNS, Webbrowser, Webserver kommen genau so
   dazu — ohne dass an dieser Datei etwas umgebaut werden muss.

   ── Der Trick mit dem Terminal ────────────────────────────────
   Das Terminal gibt es schon, samt Verlauf, Tastenkürzeln und
   Schnellknöpfen (panels.js). Statt es hier ein zweites Mal zu
   bauen, wandert das vorhandene <section class="term"> per
   appendChild in das Programmfenster. Ein Element, das im DOM
   umzieht, behält alle seine Ereignisbehandler — es ist dasselbe
   Terminal, es steht nur woanders. Beim Schließen geht es an
   seinen alten Platz zurück.

   ── Wer hier KEINEN Bildschirm hat: Switch, Router, Heimrouter ─
   Und das ist eine Lernaussage, keine Lücke. An keinem dieser drei
   Kästen ist ein Bildschirm, keiner hat ein Betriebssystem, auf
   dem man ein Programm startet. Sie bekommen deshalb kein Raster
   aus Programmkacheln, sondern ein Gerätefenster: oben der Satz,
   was für ein Ding das ist, darunter die Einstellungen — und beim
   Router und Heimrouter ein Terminal, denn das ist kein Programm
   auf einem Bildschirm, sondern der Zugang von außen. Siehe
   OHNE_SCHIRM weiter unten.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  function Geraet(refs, engine, netz, stack, term, panels, konfig, dienste, opts) {
    opts = opts || {};

    let nodeId = null;     // welches Gerät ist offen
    let appId  = null;     // welches Programm darin

    /* ═══ Die Programme ══════════════════════════════════════
       `fuer` nennt die Gerätearten, bei denen das Programm auf
       dem Desktop liegt. `bauen` bekommt das Gerät und ein
       leeres Element und füllt es.

       ── Zwei Programme, nicht drei ────────────────────────────
       Hier stand einmal ein drittes: „Was ich gelernt habe", mit
       ARP-Tabelle und Wegen. Es ist wieder weg. Nicht, weil die
       Tabellen unwichtig wären — sie sind der halbe Unterricht —,
       sondern weil sie DOPPELT dastanden: im Inspektor am Rand
       sowieso, und der ist immer offen. Ein Kind, das zwischen
       zwei Ansichten derselben Tabelle wählen muss, lernt daran
       nichts über ARP.

       Auch die Einstellungen sind nur noch EIN Eintrag, obwohl
       darin Adressen, DHCP-Client, DHCP-Server und DNS-Server
       stecken. Ein Gerät mit fünf Kacheln sieht nach Arbeit aus. */
    /* `ic` nennt ein Symbol aus dem Zeichensatz in index.html.
       Es waren einmal Schriftzeichen (>_ ⚙ ⊞ ⌂) — auf dem
       Bildschirm eines Geräts sahen die aus wie Text und nicht
       wie Programme. Ein Symbol auf einer Kachel ist das, was
       jedes Kind von seinem eigenen Gerät kennt.

       ⚠️ `fuer` nennt ALLE DREI Bilder des Endgeräts (host,
       server, handy) und nicht etwa nur host: sie sind dasselbe
       Gerät, und ein Handy ohne Terminal wäre genau die Trennung,
       die dieses Programm nicht machen darf. */
    const PROGRAMME = [
      {
        id: 'terminal', name: 'Terminal', ic: 'term',
        fuer: ['host', 'server', 'handy'],
        hint: 'ping, ipconfig, arp, route',
        bauen: bauTerminal, schliessen: schliessTerminal
      },
      {
        /* ⚠️ OHNE `install: true` — der Datei-Explorer ist von
           Anfang an da. In Filius ist er eine der dreizehn
           Anwendungen, die man erst aufspielt; vom Nutzer zum
           Bestandteil des Geräts erklärt, und das stimmt auch:
           einen Rechner ohne Dateiverwaltung gibt es nicht.

           Texteditor und Bildbetrachter sind KEINE eigenen
           Einträge. In Filius sind sie es (samt eigenem
           Dateiauswahldialog, weil der Explorer dort gar keine
           Datei öffnen kann) — hier öffnet ein Klick auf eine
           Datei sie einfach. Siehe prog-dateien.js. */
        id: 'dateien', name: 'Datei-Explorer', kurz: 'Dateien', ic: 'ordner',
        fuer: ['host', 'server', 'handy'],
        hint: 'Ordner, Texte und Bilder auf diesem Gerät',
        /* `netz` braucht der Explorer seit der Einfuhr echter
           Dateien: der Platz zählt über ALLE Geräte, weil
           derselbe Inhalt auf zweien nur einmal im Speicher
           liegt. */
        bauen: (n, box) => window.ProgDateien.bauen(n, box, {
          render: render, onDirty: opts.onDirty, toast: opts.toast, netz: netz
        }),
        schliessen: (n) => window.ProgDateien.schliessen(n)
      },
      {
        /* `kurz` steht auf der Kachel, `name` im Fensterkopf. Der
           lange Name ist der aus Filius und bleibt deshalb — nur
           passt er nicht unter ein Symbol, ohne dreizeilig zu
           werden und die ganze Reihe auseinanderzuziehen. */
        id: 'software', name: 'Software-Installation', kurz: 'Software', ic: 'box',
        fuer: ['host', 'server', 'handy'],
        hint: 'Programme aufspielen und entfernen',
        bauen: bauSoftware
      },
      {
        id: 'dns', name: 'DNS-Server', ic: 'globe',
        fuer: ['host', 'server', 'handy'], install: true,
        hint: 'übersetzt Namen in IP-Adressen',
        bauen: bauDnsServer
      },
      {
        id: 'browser', name: 'Webbrowser', ic: 'browser',
        fuer: ['host', 'server', 'handy'], install: true,
        hint: 'holt Seiten von einem Webserver',
        bauen: (n, box) => window.ProgWeb.bauBrowser(n, box, webCtx())
      },
      {
        id: 'webserver', name: 'Webserver', ic: 'webserver',
        fuer: ['host', 'server', 'handy'], install: true,
        hint: 'bietet Dateien im Netz an (Port 80)',
        bauen: (n, box) => window.ProgWeb.bauServer(n, box, webCtx())
      },
      {
        id: 'mail', name: 'E-Mail-Programm', kurz: 'E-Mail', ic: 'mail',
        fuer: ['host', 'server', 'handy'], install: true,
        hint: 'Post senden (SMTP) und abholen (POP3)',
        bauen: (n, box) => window.ProgMail.bauProgramm(n, box, webCtx())
      },
      {
        id: 'mailserver', name: 'E-Mail-Server', kurz: 'Mailserver', ic: 'mailserver',
        fuer: ['host', 'server', 'handy'], install: true,
        hint: 'nimmt Post an (25) und gibt sie heraus (110)',
        bauen: (n, box) => window.ProgMail.bauServer(n, box, webCtx())
      }
    ];

    /* ⚠️ Ein Dienst, der an- oder ausgeht, ändert nicht nur dieses
       Fenster, sondern die FLÄCHE: die Marke unter der Kachel
       („DHCP", „DNS", „Web", „Mail") steht nur da, solange der
       Dienst wirklich läuft (`netz.dienstLaeuft`). `opts.onDirty`
       zeichnet die Fläche NICHT neu — es speichert und merkt den
       Schritt für Strg+Z. Deshalb geht jedes Starten, Stoppen,
       Aufspielen und Entfernen durch diese eine Tür.

       Ohne sie erschien die Marke erst beim nächsten beliebigen
       Neuzeichnen, also irgendwann: ein Zeichen, das lange nach
       der Handlung auftaucht, liest sich nicht mehr als deren
       Folge — und „Starten" sähe aus wie ein Knopf ohne Wirkung. */
    function dienstGeschaltet() {
      if (dienste) dienste.sync();
      if (opts.redraw) opts.redraw();
    }

    /* Was die zwei Webfenster von außen brauchen. Einmal an einer
       Stelle, damit die beiden Einträge oben einzeilig bleiben. */
    const webCtx = () => ({
      http: dienste && dienste.http,
      mail: dienste && dienste.mail,
      netz: netz,
      render: render,
      sync: () => dienstGeschaltet(),
      starte: (id) => { closeApp(); appId = id; render(); },
      onDirty: opts.onDirty,
      toast: opts.toast
    });

    /* ═══ Geräte OHNE Bildschirm ═════════════════════════════
       Vom Nutzer gesetzt: „Router, Switch und Heimrouter haben
       keine Desktop-Oberfläche." Das ist keine fehlende Funktion,
       sondern eine Aussage über die Geräte — und sie stimmt: an
       keinem dieser drei Kästen ist ein Bildschirm, keines davon
       hat ein Betriebssystem, auf dem man ein Programm startet.
       Bisher bekamen Router und Heimrouter trotzdem die Tapete
       mit Programmkacheln und Schnellzugriff; nur der Switch war
       ausgenommen.

       Das Stylesheet sagt es am kürzesten (app.css, Kopf): eine
       Geräteoberfläche SCHWEBT HOCH, hat einen Rahmen, eine
       Tapete und ein Dock — „das ist kein Fenster des Programms,
       das ist ein Bildschirm". Wer keinen Bildschirm hat, bekommt
       deshalb die Stufe darunter: ein Gerätefenster, also
       Werkzeug. Man fasst es an und stellt etwas ein.

       ⚠️ Das Terminal BLEIBT beim Router und beim Heimrouter — es
       ist kein Programm auf einem Bildschirm, sondern der Zugang
       von außen (bei einem echten Gerät die serielle Konsole oder
       SSH). Ohne es gäbe es an einem Router kein `route` und kein
       `ping`, und damit keinen Weg, seine Sicht zu prüfen. Der
       Switch bekommt keines, denn er hat auch keine Adresse.

       Was in dem Fenster steht, entscheidet nicht PROGRAMME: dort
       stehen die Kacheln eines Bildschirms, und genau die gibt es
       hier nicht mehr (`fuer` nennt deshalb nur noch die drei
       Bilder des Endgeräts). */
    /* ⚠️ Seit 2026-09-28 ohne Sätze, ohne Terminal und ohne
       Einstellen. Vom Nutzer: „Ein Router hat keinen Bildschirm …
       Raus! Einstellungen kann ich jetzt nicht mehr ändern!
       Terminal brauche ich hier nicht. Alle Infos aus den Modalen
       werden in einer kompakten Ansicht dargestellt." — und für den
       Switch: „das WLAN [lässt sich im Aktionsmodus] nicht mehr an
       und aus machen. Das bleibt jetzt so." Der Heimrouter geht
       denselben Weg. Eingestellt wird im Entwurf; im Aktionsmodus
       sieht man zu (konfig.kompakt). */
    const OHNE_SCHIRM = { switch: {}, router: {}, heimrouter: {} };
    const ohneSchirm = (n) => OHNE_SCHIRM[n.kind] || null;

    /* ═══ Was sich aufspielen lässt ══════════════════════════
       Filius hält diese Liste in einer Textdatei
       (config/Desktop_de_DE.txt) und zeigt sie im Dialog
       „Software-Installation" als zwei Spalten: Verfügbar und
       Installiert. Hier ist es dasselbe, nur ohne Datei — jeder
       Eintrag in PROGRAMME mit `install: true` taucht auf.

       Warum das überhaupt eine Installation braucht und kein
       Schalter im Einstellformular ist: weil „ein Programm
       aufspielen, dann starten" die Erfahrung ist, die ein Kind
       von einem Rechner hat. Ein Server ist kein Gerät, sondern
       ein Rechner, auf dem ein Serverprogramm läuft — und das
       merkt man nur, wenn man es selbst draufgespielt hat. */
    const installierbar = () => PROGRAMME.filter(p => p.install);
    const istInstalliert = (n, id) => (n.software || []).indexOf(id) >= 0;

    /* Was aufhört zu laufen, wenn ein Programm vom Rechner geht:
       Kennung des Programms → Name des Blocks am Gerät, dessen
       `on` dabei umfällt. Hier stand `if (id === 'dns' && …)`; mit
       Webserver und E-Mail-Server wären das drei gleichlautende
       Zeilen, und die dritte vergisst man. Jede weitere Anwendung
       mit einem Dienst trägt sich hier mit einer Zeile ein. */
    const STOPPT = { dns: 'dnsServer', webserver: 'webServer', mailserver: 'mailServer' };

    /* Und das Gegenstück: was beim AUFSPIELEN entsteht. Filius
       legt bei der Installation des Webservers Ordner und
       Standardseite an (`WebServer.erzeugeStandardVerzeichnis`);
       hier ist es dieselbe Zeile an derselben Stelle.

       ⚠️ Beim Entfernen bleiben die Dateien liegen — ein Rechner
       vergisst seine Dateien nicht, wenn ein Programm geht. */
    const BEIM_AUFSPIELEN = {
      webserver: (n) => {
        if (dienste && dienste.http) dienste.http.standardDateien(n);
      }
    };

    const programmeFuer = (n) => PROGRAMME.filter(p =>
      p.fuer.indexOf(n.kind) >= 0 && (!p.install || istInstalliert(n, p.id)));

    /* ═══ Öffnen und schließen ═══════════════════════════════ */

    function open(id) {
      const n = netz.get(id);
      if (!n) return;
      if (nodeId && nodeId !== id) closeApp();
      // Ein anderes Gerät fängt wieder auf der Hauptseite der
      // Einstellungen an, nicht auf der DHCP-Unterseite des
      // vorigen.
      if (nodeId !== id) refs.dtWin.dataset.seite = '';
      nodeId = id;
      refs.desktop.hidden = false;
      platziere(n);
      render();
      // Der Mitschnitt folgt mit — siehe `close()`.
      if (opts.onGeraet) opts.onGeraet(id);
    }

    /* Das Fenster darf nicht auf dem Gerät liegen, das man
       gerade angetippt hat — das ist beim Prüfen im Browser
       sofort passiert: das Fenster deckte genau die beiden
       Rechner zu, um die es ging.

       Es bleibt immer rechts (links oben liegt die Auftragskarte)
       und weicht nach oben oder unten aus, je nachdem, in welcher
       Hälfte das Gerät steht. Wer das Fenster selbst verschoben
       hat, behält seine Stelle — eine Hand, die etwas hingelegt
       hat, will es dort wiederfinden. */
    let selbstVerschoben = false;
    function platziere(n) {
      if (selbstVerschoben) return;
      /* „Liegt das Gerät in der unteren Hälfte?" — gemessen am
         sichtbaren Ausschnitt, nicht an einer festen Zahl. Hier
         stand `n.y > 380`, die halbe Höhe der alten Fläche; seit
         das Feld größer ist als das Fenster und sich verschieben
         lässt, sagt diese Zahl nichts mehr über das Bild. */
      const untenDrin = opts.untenImBild ? opts.untenImBild(n) : n.y > 380;
      refs.desktop.style.left = 'auto';
      refs.desktop.style.right = '16px';
      refs.desktop.style.top = untenDrin ? '16px' : 'auto';
      refs.desktop.style.bottom = untenDrin ? 'auto' : '16px';
    }

    function close() {
      closeApp();
      nodeId = null;
      refs.desktop.hidden = true;
      /* Wer die Geräteoberfläche zumacht, sieht kein Gerät mehr an
         — und der Mitschnitt soll dann wieder das ganze Netz
         zeigen. Die Meldung steht HIER und nicht bei den neun
         Stellen, die `close()` rufen (Moduswechsel, Löschen,
         Rückgängig, Zurücksetzen, Szenario laden …). Neun Aufrufer
         an dieselbe Nebenpflicht zu erinnern ist die Sorte
         Buchhaltung, bei der beim zehnten einer fehlt. */
      if (opts.onGeraet) opts.onGeraet(null);
    }

    /* Ein Programm verlassen: erst sein `schliessen` (das Terminal
       muss zurückziehen), dann das Fenster leeren. Ohne diesen
       Haken bliebe das Terminal in einem Element hängen, das
       gleich mit innerHTML überschrieben wird — und wäre damit
       für immer aus dem Dokument verschwunden. */
    function closeApp() {
      const p = PROGRAMME.find(x => x.id === appId);
      if (p && p.schliessen) p.schliessen(netz.get(nodeId));
      appId = null;
      swFrage = null;
      refs.dtWin.innerHTML = '';
    }

    function openApp(id) {
      if (appId === id) { closeApp(); render(); return; }
      closeApp();
      appId = id;
      refs.dtWin.dataset.seite = '';
      render();
    }

    /* ═══ Zeichnen ═══════════════════════════════════════════ */

    function render() {
      if (!nodeId) return;
      const n = netz.get(nodeId);
      if (!n) { close(); return; }

      refs.dtIcon.innerHTML = U.icon((netz.KIND[n.kind] || {}).icon || 'host');
      // Kürzel zuerst, ausgeschrieben dahinter — dieselbe Rangfolge
      // wie auf der Fläche und im Entwurfsfenster.
      refs.dtName.textContent = netz.kurzName(n) + ' · ' + n.name;

      untertitel(n);
      refs.dtPower.classList.toggle('is-on', !!n.on);
      refs.dtPower.title = n.on ? 'ausschalten' : 'einschalten';

      refs.desktop.classList.toggle('is-off', !n.on);
      /* ⚠️ Das Handy ist KEINE andere Geräteart — es ist dasselbe
         Gerät mit einem anderen Bildschirm. Diese eine Klasse ist
         der ganze Unterschied, und sie sitzt ausschließlich hier
         in der Darstellung. Nirgends im Programm entscheidet
         `kind === 'handy'` darüber, was ein Gerät KANN. */
      refs.desktop.classList.toggle('dt--handy', n.kind === 'handy');

      const kein = ohneSchirm(n);
      refs.desktop.classList.toggle('dt--kein', !!kein);
      if (kein) { rendereOhneSchirm(n); return; }

      /* ─ Programme ─ */
      const progs = programmeFuer(n);

      /* ─ Die Symbole auf dem Bildschirm ─────────────────────
         Sie liegen auf der Tapete, nicht in einer Leiste. Das ist
         der Unterschied zwischen „Bildschirm eines Rechners" und
         „noch ein Reiter dieser Anwendung", und er entscheidet
         darüber, ob ein Kind versteht, dass es gerade AUF einem
         Gerät arbeitet und nicht MIT dem Simulator.

         Auf der Kachel steht der kurze Name, im Tooltip der lange
         samt Erklärung.

         ⚠️ Die Kacheln bleiben stehen, auch wenn ein Programm
         läuft — das Fenster liegt darüber. Früher rückten sie in
         eine schmale Spalte nach links (Laptop, Server) oder
         verschwanden ganz (Handy); vom Nutzer beanstandet. Sie
         sind dann verdeckt und nicht anklickbar, und genau dafür
         gibt es den Schnellzugriff unten. */
      refs.dtApps.innerHTML = progs.map(p =>
        '<button class="dt-app' + (appId === p.id ? ' is-on' : '') + '" data-app="' + p.id + '"'
        + ' title="' + esc(p.name + ' — ' + p.hint) + '">'
        + '<span class="dt-app-ic">' + U.icon(p.ic) + '</span>'
        + '<span class="dt-app-n">' + esc(p.kurz || p.name) + '</span>'
        + '</button>').join('');

      refs.dtApps.querySelectorAll('[data-app]').forEach(b =>
        b.addEventListener('click', () => openApp(b.dataset.app)));

      /* ─ Der Schnellzugriff unten ───────────────────────────
         Dieselben Programme noch einmal, nur als Symbol und ohne
         Wort. Er ist kein zweites Menü, sondern das, was man
         braucht, WÄHREND ein Programm im Vollbild läuft: sonst
         wären die Symbole darunter verdeckt und man müsste erst
         schließen, um zu wechseln.

         Beim Handy ist er der einzige Weg dorthin — dort deckt
         ein Programm den ganzen Bildschirm. Genau so kennt man
         es von einem echten Telefon. */
      refs.dtDock.innerHTML = progs.map(p =>
        '<button class="dt-dapp' + (appId === p.id ? ' is-on' : '') + '" data-dock="' + p.id + '"'
        + ' title="' + esc(p.name) + '">' + U.icon(p.ic)
        + '<i class="dt-dpunkt"></i></button>').join('');

      refs.dtDock.querySelectorAll('[data-dock]').forEach(b =>
        b.addEventListener('click', () => openApp(b.dataset.dock)));

      /* ─ Das Fenster ────────────────────────────────────────
         Kein Programm offen heißt: KEIN Fenster. Hier stand
         einmal ein Kasten mit „Endgerät 1 ist eingeschaltet.
         Wähle unten ein Programm." — ein leeres Rechteck über
         der Tapete, das genau die Symbole verdeckte, auf die es
         hinwies. Ein eingeschalteter Bildschirm mit Symbolen
         darauf sagt dasselbe, ohne einen Satz. */
      if (!appId) { fenster(false); return; }

      // Ein ausgeschaltetes Gerät zeigt keine Programme. Sonst
      // tippt ein Kind einen Ping in ein totes Terminal und wartet.
      if (!n.on) {
        closeAppQuiet();
        fenster(true, 'Aus');
        refs.dtWin.innerHTML =
          '<div class="dt-leer">'
          + '<div class="dt-leer-ic">' + U.icon('power') + '</div>'
          + '<p><strong>Dieses Gerät ist ausgeschaltet.</strong></p>'
          + '<p class="dim">Oben rechts einschalten.</p>'
          + '</div>';
        return;
      }

      const p = PROGRAMME.find(x => x.id === appId);
      fenster(true, p ? p.name : '', p ? p.ic : '');
      refs.dtWin.innerHTML = '';
      if (p) p.bauen(n, refs.dtWin);
    }

    /* ═══ Ein Gerät ohne Bildschirm ══════════════════════════
       Kein Raster aus Programmkacheln, kein Schnellzugriff, keine
       Kopfzeile über dem Fenster: oben steht in einem Satz, was
       für ein Ding das ist, darunter — falls es mehr als eines
       gibt — eine Reihe schmaler Reiter, und darunter der Inhalt.

       ⚠️ Der Satz steht NICHT im Fenster, sondern darüber, und
       das ist der Unterschied zwischen einer Aussage über das
       GERÄT und einer Meldung eines Programms: wer aufs Terminal
       umschaltet, soll ihn nicht verlieren.

       Der Switch hat gar keine Reiter — er hat nur eine einzige
       Ansicht, und die Tabelle darin ist der ganze Inhalt des
       zweiten Szenarios („der Switch lernt"). Sie muss zu sehen
       sein, WÄHREND es läuft; seit die Inspektorspalte weg ist,
       gäbe es sonst im Aktionsmodus keine Stelle dafür. */
    function rendereOhneSchirm(n) {
      closeAppQuiet();
      refs.dtDock.innerHTML = '';
      refs.dtApps.innerHTML = '';
      fenster(true, '', '', true);
      refs.dtWin.innerHTML = '';
      bauKompakt(n, refs.dtWin);
    }

    /* Das Programmfenster auf- oder zudecken und ihm eine
       Kopfzeile geben. Die Kopfzeile ist nicht Schmuck: ohne sie
       ist auf einem Handy, wo das Programm den ganzen Bildschirm
       füllt, nicht mehr zu sehen, WELCHES Programm da läuft —
       und der Weg zurück auf den Startbildschirm fehlt auch.

       Sie entsteht hier und nicht im Markup, weil sie mit jedem
       Programmwechsel Text und Symbol tauscht; ein festes
       <div> im HTML hieße, dass drei Stellen es füllen müssten. */
    function fenster(auf, titel, ic, flach) {
      refs.dtWin.hidden = !auf;
      /* ⚠️ Der Kasten muss MIT verschwinden. Er liegt absolut über
         den Kacheln; bliebe er stehen, fingen seine unsichtbaren
         Ränder jeden Klick auf eine Kachel ab — ein
         Startbildschirm, auf dem nichts mehr geht, und nichts zu
         sehen, woran es liegt. */
      refs.dtFenster.hidden = !auf;
      refs.desktop.classList.toggle('is-app', !!auf);
      const alt = refs.dtWin.previousElementSibling;
      if (alt && alt.classList.contains('dt-winh')) alt.remove();
      /* `flach`: ein Gerät ohne Bildschirm hat kein Fenster IN
         einem Fenster. Sein Kopf steht schon oben am Gerät, und
         eine zweite Kopfzeile mit einem zweiten × wäre die Frage
         „welches von beiden schließt was". */
      if (!auf || flach) return;
      const h = document.createElement('div');
      h.className = 'dt-winh';
      h.innerHTML = (ic ? U.icon(ic) : '')
        + '<span class="dt-winh-t">' + esc(titel || '') + '</span>'
        + '<button class="dt-winh-x" title="Programm schließen">×</button>';
      h.querySelector('.dt-winh-x').addEventListener('click', () => {
        // Beim Switch und beim ausgeschalteten Gerät ist kein
        // Programm offen — dann schließt dasselbe × das Gerät.
        if (appId) { closeApp(); render(); } else close();
      });
      refs.dtWin.parentNode.insertBefore(h, refs.dtWin);
    }

    // Wie closeApp, aber ohne neu zu zeichnen (wir sind gerade drin).
    function closeAppQuiet() {
      const p = PROGRAMME.find(x => x.id === appId);
      if (p && p.schliessen) p.schliessen(netz.get(nodeId));
      appId = null;
      swFrage = null;
    }

    /* ═══ Programm: Terminal ═════════════════════════════════ */

    function bauTerminal(n, box) {
      box.appendChild(refs.term);
      refs.term.classList.add('term--in', 'is-open');
      panels.openTerminal(n.id);
    }

    function schliessTerminal() {
      refs.term.classList.remove('term--in');
      panels.closeTerminal();
      // Zurück an den alten Platz im Dokument, sonst verschwindet
      // das Terminal mit dem Fensterinhalt.
      document.body.appendChild(refs.term);
    }

    /* ═══ Router, Heimrouter, Switch im Aktionsmodus ═════════
       Nur lesen, alles auf einer Seite (konfig.kompakt). Hier
       stand das volle Einstellformular samt Reitern und daneben
       ein Terminal — vom Nutzer gestrichen, siehe OHNE_SCHIRM. */
    function bauKompakt(n, box) {
      konfig.kompakt(n, box);

      /* „Tabellen vergessen" bleibt: es ist keine Einstellung,
         sondern eine Handlung am laufenden Gerät — und der kürzeste
         Weg, einer Klasse ARP zweimal zu zeigen. Die Erklärung
         steht im Tooltip. */
      const acts = document.createElement('div');
      acts.className = 'k-acts';
      const b = document.createElement('button');
      b.className = 'btn btn--ghost';
      b.textContent = 'Tabellen vergessen';
      b.title = 'Leert ARP-Tabelle und Zwischenspeicher — danach lässt sich '
        + 'die Adressauflösung noch einmal von vorn zeigen.';
      b.addEventListener('click', () => {
        stack.clearTables(n);
        render();
        if (opts.redraw) opts.redraw();
      });
      acts.appendChild(b);
      box.appendChild(acts);
    }

    /* ═══ Programm: Software-Installation ════════════════════
       Ein Kachelraster, wie man es von einem Appstore kennt — in
       derselben Formensprache wie die Programmkacheln auf dem
       Bildschirm (`.dt-app`), nur hell, weil sie hier in einem
       Fenster liegen und nicht auf der Tapete.

       Hier standen zwei Spalten, „Verfügbar" und „Installiert",
       wie in Filius. Sie beantworteten eine Frage, die niemand
       hat: ein Programm ist entweder drauf oder nicht, und das
       sagt ein Haken auf der Kachel kürzer als eine zweite Spalte
       — samt dem Umherwandern eines Eintrags, dem man beim Klicken
       mit den Augen folgen muss. Was bleibt: Filius'
       Zwischenschritt „Änderungen annehmen" gibt es weiter nicht.

       ── Warum das Entfernen fragt und das Aufspielen nicht ─────
       Aufspielen ist umkehrbar und kostet nichts. Entfernen nimmt
       etwas weg, das jemand eingetragen hat — beim DNS-Server die
       Namensliste, beim Webserver später den laufenden Dienst.

       Gefragt wird IN der Kachel und nicht in einem `confirm()`:
       ein Systemdialog blockiert die Uhr, sieht nicht nach diesem
       Programm aus, und der Browser-Prüfstand nimmt Dialoge
       automatisch an — er wäre an genau dieser Stelle blind. */

    /* Welche Kachel gerade fragt. Steht außerhalb von bauSoftware,
       weil jedes `render()` den Fensterinhalt neu baut; eine Frage,
       die einen Neuaufbau nicht übersteht, verschwindet unter der
       Hand, sobald irgendwo sonst etwas passiert. */
    let swFrage = null;

    function bauSoftware(n, box) {
      const alle = installierbar().filter(p => p.fuer.indexOf(n.kind) >= 0);
      if (swFrage && !alle.some(p => p.id === swFrage && istInstalliert(n, p.id))) swFrage = null;

      const kachel = (p) => {
        const drauf = istInstalliert(n, p.id);
        /* Die fragende Kachel ist ein <div> und kein <button>:
           ein Knopf in einem Knopf ist kein gültiges HTML, und der
           Klick träfe beide. */
        if (swFrage === p.id) {
          return '<div class="sw-k is-frage">'
            + '<span class="sw-k-ic">' + U.icon(p.ic) + '</span>'
            + '<span class="sw-k-n">' + esc(p.name) + '</span>'
            + '<span class="sw-k-h">deinstallieren?</span>'
            /* Eigene kleine Knöpfe statt `.btn`: das dortige
               `flex: 1` würde die zwei in der Kachel
               auseinanderziehen, und `.btn--ghost` wird beim
               Überfahren rot — das ist die Farbe des Entfernens
               und gehört hier auf „Ja", nicht auf „Nein". */
            + '<span class="sw-k-wahl">'
            +   '<button class="sw-ja" data-swja="' + p.id + '">Ja</button>'
            +   '<button class="sw-nein" data-swnein="' + p.id + '">Nein</button>'
            + '</span>'
            + '</div>';
        }
        return '<button class="sw-k' + (drauf ? ' is-drauf' : '') + '" data-sw="' + p.id + '"'
          + ' title="' + esc(p.name + ' — ' + p.hint) + '">'
          + '<span class="sw-k-ic">' + U.icon(p.ic) + '</span>'
          + '<span class="sw-k-n">' + esc(p.name) + '</span>'
          /* Die Beschreibung unter dem Namen ist weg (vom Nutzer
             gestrichen) — sie steht im Tooltip. */
          + (drauf ? '<span class="sw-k-ok">' + U.icon('haken') + '</span>' : '')
          + '</button>';
      };

      box.innerHTML = '<div class="sw">' + alle.map(kachel).join('') + '</div>';

      /* Ein Klick auf eine ruhige Kachel spielt auf, ein Klick auf
         eine mit Haken stellt die Frage. Ein Klick auf eine ANDERE
         Kachel nimmt eine offene Frage zurück — sonst blieben zwei
         Kacheln in Verhandlung. */
      box.querySelectorAll('[data-sw]').forEach(b =>
        b.addEventListener('click', () => {
          const id = b.dataset.sw;
          if (istInstalliert(n, id)) { swFrage = id; render(); return; }
          swFrage = null;
          if (!n.software) n.software = [];
          if (n.software.indexOf(id) < 0) n.software.push(id);
          if (BEIM_AUFSPIELEN[id]) BEIM_AUFSPIELEN[id](n);
          dienstGeschaltet();
          if (opts.onDirty) opts.onDirty();
          render();
        }));

      box.querySelectorAll('[data-swnein]').forEach(b =>
        b.addEventListener('click', () => { swFrage = null; render(); }));

      box.querySelectorAll('[data-swja]').forEach(b =>
        b.addEventListener('click', () => {
          const id = b.dataset.swja;
          swFrage = null;
          n.software = (n.software || []).filter(x => x !== id);
          // Ein entferntes Serverprogramm hört auf zu laufen — und
          // wenn sein Fenster offen war, schließt es sich.
          const block = n[STOPPT[id]];
          if (block) block.on = false;
          if (appId === id) closeAppQuiet();
          dienstGeschaltet();
          if (opts.onDirty) opts.onDirty();
          render();
        }));
    }

    /* ═══ Programm: DNS-Server ═══════════════════════════════
       Aufbau aus dem DNS-Fenster von Filius: der Reiter
       „Adressen (A)" mit einer Tabelle aus Host-/Domainname und
       IP-Adresse, darunter zwei Eingabefelder und „Hinzufügen",
       und ein Knopf „Starten" / „Beenden".

       Die Reiter für Mailaustausch (MX) und Nameserver (NS) gibt
       es hier nicht — dafür fehlen Mailserver und die
       Weiterleitung an andere Nameserver. */

    function bauDnsServer(n, box) {
      const c = netz.dnsConf(n);
      const recs = c.records || [];
      // Filius führt MX als eigene Liste; hier ebenso, damit ein
      // A-Eintrag nie versehentlich als Mailserver gilt.
      const mx = c.mx || (c.mx = []);

      box.innerHTML =
        '<div class="dns-kopf">'
        +   '<span class="k-dot' + (c.on ? ' is-on' : '') + '"></span>'
        +   '<span class="dns-stand">' + (c.on ? 'läuft' : 'gestoppt') + '</span>'
        +   '<button class="btn' + (c.on ? ' btn--ghost' : '') + '" id="dnsStart">'
        +     (c.on ? 'Beenden' : 'Starten') + '</button>'
        + '</div>'
        + '<div class="dt-sec">Adressen (A)</div>'
        + (recs.length
            ? '<div class="k-recs">' + recs.map((r, i) =>
                '<div class="k-rec">'
                + '<input class="f" data-dnsf="name" data-rec="' + i + '" value="' + esc(r.name) + '" '
                + 'placeholder="www.schule.de" spellcheck="false">'
                + '<input class="f mono" data-dnsf="ip" data-rec="' + i + '" value="' + esc(r.ip) + '" '
                + 'placeholder="192.168.1.20" inputmode="decimal" spellcheck="false">'
                + '<button class="k-x" data-dnsdel="' + i + '" title="Eintrag entfernen">×</button>'
                + '</div>').join('') + '</div>'
            : '<div class="k-hint">Noch kein Name eingetragen. Ohne Eintrag antwortet '
              + 'dieser Server auf jede Frage mit „kenne ich nicht".</div>')
        /* ⚠️ Hier stand ein Knopf „Alle Geräte eintragen", der jedem
           Gerät mit Adresse auf einmal einen Namen gab — begründet
           mit der gesparten Tipparbeit. Vom Nutzer gestrichen:
           **jedes Gerät wird einzeln eingetragen.** Der Knopf nahm
           genau die Arbeit ab, die die Aufgabe IST — wer die Liste
           von Hand führt, merkt, dass sie jemand führen muss, und
           dass ein Tippfehler darin ein Netz ohne Fehler lahmlegt.
           Dieselbe Regel wie beim leeren Heimrouter: was ausgefüllt
           dasteht, ist eine vorweggenommene Antwort. */
        + '<button class="k-add" id="dnsAdd">Hinzufügen</button>'
        /* ─ Mailaustausch (MX) ───────────────────────────────
           Filius hat dafür einen eigenen Reiter neben „Adressen
           (A)", mit den Feldern „Maildomain" und „Domainname
           Mailserver". Hier steht er darunter statt dahinter —
           dieselbe Entscheidung wie überall in diesem Programm:
           ein Reiter, den man erst aufmachen muss, beantwortet
           die Frage „was weiß dieser Server eigentlich" nicht.

           ⭐ Das ist die Stelle, an der DNS ein zweites Mal
           gebraucht wird — und diesmal nicht, um eine Zahl zu
           sparen, sondern um eine ZUSTÄNDIGKEIT nachzuschlagen:
           wer nimmt die Post für diese Domain an? */
        + '<div class="dt-sec">Mailaustausch (MX)</div>'
        + (mx.length
            ? '<div class="k-recs">' + mx.map((r, i) =>
                '<div class="k-rec">'
                + '<input class="f" data-mxf="domain" data-rec="' + i + '" value="' + esc(r.domain) + '" '
                + 'placeholder="schule.de" spellcheck="false">'
                + '<input class="f" data-mxf="server" data-rec="' + i + '" value="' + esc(r.server) + '" '
                + 'placeholder="mail.schule.de" spellcheck="false">'
                + '<button class="k-x" data-mxdel="' + i + '" title="Eintrag entfernen">×</button>'
                + '</div>').join('') + '</div>'
            : '<div class="k-hint">Kein Eintrag. Post an eine fremde Domain bleibt damit liegen — '
              + 'der Server weiß nicht, wohin damit.</div>')
        + '<button class="k-add" id="mxAdd">Hinzufügen</button>';

      box.querySelector('#dnsStart').addEventListener('click', () => {
        c.on = !c.on;
        dienstGeschaltet();
        if (opts.onDirty) opts.onDirty();
        render();
      });

      box.querySelectorAll('[data-dnsf]').forEach(inp =>
        inp.addEventListener('input', () => {
          const r = c.records[+inp.dataset.rec];
          if (!r) return;
          r[inp.dataset.dnsf] = inp.value.trim();
          if (opts.onDirty) opts.onDirty();
        }));

      box.querySelectorAll('[data-dnsdel]').forEach(b =>
        b.addEventListener('click', () => {
          c.records.splice(+b.dataset.dnsdel, 1);
          if (opts.onDirty) opts.onDirty();
          render();
        }));

      box.querySelectorAll('[data-mxf]').forEach(inp =>
        inp.addEventListener('input', () => {
          const r = mx[+inp.dataset.rec];
          if (!r) return;
          r[inp.dataset.mxf] = inp.value.trim().toLowerCase();
          if (opts.onDirty) opts.onDirty();
        }));

      box.querySelectorAll('[data-mxdel]').forEach(b =>
        b.addEventListener('click', () => {
          mx.splice(+b.dataset.mxdel, 1);
          if (opts.onDirty) opts.onDirty();
          render();
        }));

      box.querySelector('#mxAdd').addEventListener('click', () => {
        mx.push({ domain: '', server: '' });
        if (opts.onDirty) opts.onDirty();
        render();
      });

      box.querySelector('#dnsAdd').addEventListener('click', () => {
        c.records.push({ name: '', ip: '' });
        if (opts.onDirty) opts.onDirty();
        render();
        const felder = refs.dtWin.querySelectorAll('[data-dnsf="name"]');
        if (felder.length) felder[felder.length - 1].focus();
      });

    }

    function untertitel(n) {
      /* Beim Heimrouter zwei Adressen ohne Beschriftung
         nebeneinanderzustellen wäre die eine Auskunft, die er
         NICHT geben darf: welche von beiden nach draußen zeigt,
         ist die Frage an diesem Gerät. Also stehen die Wörter
         dabei — und wenn die WAN-Seite noch nichts hat, steht das
         auch da, statt dass die Zeile stillschweigend kürzer wird. */
      if (netz.istHeim(n)) {
        const wan = n.nics[netz.WAN], lan = n.nics[netz.LAN];
        refs.dtSub.textContent =
          'WAN ' + (wan.ip || (wan.dhcp ? '— wartet auf den Anbieter' : '—'))
          + '  ·  LAN ' + (lan.ip || '—');
        return;
      }
      const ips = n.nics.filter(k => k.ip).map(k => k.ip);
      refs.dtSub.textContent = n.kind === 'switch'
        ? netz.KIND[n.kind].label
        : (ips.length ? ips.join(' · ')
            : (n.nics.some(k => k.dhcp) ? 'wartet auf eine Adresse (DHCP)' : 'keine IP-Adresse'));
    }

    /* ═══ Kopfzeile des Fensters ═════════════════════════════ */

    refs.dtClose.addEventListener('click', close);

    refs.dtPower.addEventListener('click', () => {
      const n = netz.get(nodeId);
      if (!n) return;
      n.on = !n.on;
      stack.clearTables(n);
      engine.dropOwner(n.id);
      /* Aus und wieder an heißt: die Dienste fangen von vorn an —
         ein Rechner, der beim Einschalten nach einer Adresse fragt,
         ist genau das, was im Klassenzimmer täglich passiert. */
      if (dienste) dienste.sync();
      render();
      if (opts.redraw) opts.redraw();
      if (opts.onDirty) opts.onDirty();
    });

    /* Das Fenster lässt sich am Kopf verschieben. Auf einem
       Beamer liegt es sonst irgendwann über dem Gerät, um das es
       geht — beim Prüfen im Browser war das schon einmal der
       Grund, warum eine Karte unbrauchbar war. */
    let zieh = null;
    refs.dtHead.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;
      const r = refs.desktop.getBoundingClientRect();
      const s = refs.desktop.parentElement.getBoundingClientRect();
      zieh = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, s, w: r.width, h: r.height };
      refs.dtHead.setPointerCapture(ev.pointerId);
    });
    refs.dtHead.addEventListener('pointermove', (ev) => {
      if (!zieh) return;
      const x = U.clamp(ev.clientX - zieh.dx - zieh.s.left, 4, zieh.s.width - zieh.w - 4);
      const y = U.clamp(ev.clientY - zieh.dy - zieh.s.top, 4, zieh.s.height - 46);
      refs.desktop.style.left = x + 'px';
      refs.desktop.style.top = y + 'px';
      refs.desktop.style.right = 'auto';
      refs.desktop.style.bottom = 'auto';
      selbstVerschoben = true;
    });
    refs.dtHead.addEventListener('pointerup', () => { zieh = null; });
    refs.dtHead.addEventListener('pointercancel', () => { zieh = null; });

    /* Während die Uhr läuft: nur den Tabellenkasten in den
       Einstellungen nachziehen. Ein voller `render()` würde hier
       das Terminal aus dem Dokument reißen und jedes Feld, in dem
       gerade jemand steht, neu aufbauen. */
    function tabellenAuffrischen() {
      if (!nodeId || refs.desktop.hidden) return;
      // Auf der DHCP-Unterseite gibt es keinen Tabellenkasten; und
      // wo keiner ist, tut malenTabellen nichts. Die Abfrage spart
      // nur den Weg dorthin.
      if (refs.dtWin.dataset.seite) return;
      const n = netz.get(nodeId);
      if (n) konfig.malenTabellen(n, refs.dtWin);
    }

    return {
      open, close, render, tabellenAuffrischen,
      get nodeId() { return nodeId; },
      get isOpen() { return !!nodeId; }
    };
  }

  window.Geraet = Geraet;
})();
