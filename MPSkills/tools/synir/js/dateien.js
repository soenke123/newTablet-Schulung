/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — dateien.js   ·   Das Dateisystem eines Geräts
   ══════════════════════════════════════════════════════════════
   Vier der dreizehn Filius-Anwendungen hängen daran, und dazu
   die Inhalte des Webservers und die Anhänge der E-Mail. Es ist
   nach TCP die zweite Voraussetzung für alles Weitere.

   ── Flach statt Baum, und warum ───────────────────────────────
   Filius führt einen echten Baum (`DefaultMutableTreeNode` in
   `software/system/Dateisystem.java`). Hier ist es eine flache
   Zuordnung **Pfad → Eintrag**:

       node.dateien = {
         '/webserver':            { ordner: true },
         '/webserver/index.html': { text: '<html>…' },
         '/webserver/logo.png':   { bild: '@schule' }
       }

   Der Grund ist das Speicherformat: diese Zuordnung IST schon
   JSON und geht ohne Umbau durch `toJSON`/`fromJSON`, durch
   Strg+Z und durch Kopieren und Einfügen. Ein Baum bräuchte an
   jeder dieser vier Stellen eine Übersetzung. Was ein Baum
   besser kann — einen ganzen Ast an eine andere Stelle hängen —
   gibt es hier nicht: verschoben wird nichts, umbenannt schon
   (und das zieht die Kinder mit, siehe `umbenennen`).

   ⚠️ Ein Ordner ist ein EIGENER Eintrag mit `ordner: true` und
   nicht bloß ein Pfadanfang. Sonst könnte es keinen **leeren**
   Ordner geben — und genau der ist der erste, den ein Kind
   anlegt.

   ── Ein neues Gerät hat EINEN Ordner: /Bilder ─────────────────
   Kein `/home`, kein `/eigene` — aber seit dem 2026-09-28 die
   eingebauten Bilder als Ordner (`grundbestand`, gerufen aus
   `netz.addNode` für alle Geräte mit `dateien: true`).

   ⚠️ Das ist eine Abkehr von Filius (dort besteht der Baum aus
   `root` und sonst nichts) und von der eigenen Regel „was dasteht,
   hat jemand hingestellt". Vom Nutzer gesetzt: „Es gibt
   standardmäßig einen Ordner ‚Bilder' auf dem Gerät. Da sind die
   default Bilder drin." Und der Widerspruch ist kleiner, als er
   aussieht: die Regel richtet sich gegen vorweggenommene
   ANTWORTEN — eine eingetragene IP-Adresse nimmt die Frage weg, um
   die es geht. Bilder nehmen keine Frage weg, sie sind MATERIAL.
   Ohne sie ist der Bildbetrachter auf einem frischen Gerät ein
   Programm ohne Gegenstand, und vor der ersten Webseite stünde
   „hol dir erst ein Bild von der Festplatte".

   Sie kosten dabei keinen Platz im Inhaltsspeicher (siehe unten):
   es sind Verweise, keine Daten. Und sie lassen sich löschen wie
   jede andere Datei — weggeworfen bleiben sie weg, denn
   `grundbestand` läuft nur beim Anlegen des Geräts und nicht beim
   Laden (`fromJSON`) oder Einfügen.

   Die übrigen Ordner entstehen weiter mit der Installation eines
   Programms — `/webserver` beim Webserver, `/mailserver` beim
   E-Mail-Server, genau wie dort.

   ── Bilder ────────────────────────────────────────────────────
   `bild: '@schule'` verweist auf die kleine eingebaute Sammlung
   weiter unten (SVG als Daten-URI).

   ── ⭐ Eingeführte Dateien und der Inhaltsspeicher ─────────────
   Seit dem 2026-09-27 lassen sich echte Dateien von der Platte
   einführen. Dabei gilt eine Regel, die nicht offensichtlich ist
   und ohne die das ganze Programm zäh wird:

     TEXT   (bis 64 KB) steht INLINE im Eintrag (`text: '…'`).
            Nur so kann der Editor sie öffnen — und eine
            eingeführte HTML-Seite zu bearbeiten ist genau der
            Grund, aus dem man sie einführt.
     ALLES  ANDERE liegt im INHALTSSPEICHER; der Eintrag hält nur
            einen Schlüssel (`bild: 'blob:7f3a2c…'`).

   ⚠️ Warum der Umweg? `netz.toJSON()` ist nicht nur das
   Speicherformat, sondern auch der Verlauf: `verlauf.js` legt bei
   JEDER Änderung einen vollständigen Stand als Zeichenkette ab und
   hält sechzig davon. Ein eingeführtes Foto von 2 MB wäre als
   Base64 rund 2,7 MB — sechzigmal im Speicher, und bei jedem
   Verschieben eines Geräts neu serialisiert. Der Kopf von
   verlauf.js rechnet mit „wenige Kilobyte je Stand", und das soll
   so bleiben.

   ⭐ Der Schlüssel ist ein Streuwert über den Inhalt, wie bei git:
   dieselbe Datei zweimal eingeführt kostet einmal Platz, und
   Kopieren/Einfügen eines Geräts kopiert von selbst nur den
   Schlüssel.

   ⚠️ Und deshalb wird im laufenden Betrieb NIE ein Inhalt
   gelöscht: nach einem Strg+Z muss die eben gelöschte Datei noch
   da sein. Aufgeräumt wird nur dort, wo auch der Verlauf geleert
   wird — „Neu", Szenario laden, Datei öffnen (`blobsLeeren`).

   Gespeichert und ausgetauscht wird trotzdem alles: `app.js`
   schreibt `{ …netz.toJSON(), blobs: … }` in einem Stück. Das
   bleibt EIN JSON-Objekt — wichtig für den Weg nach MPSkills, wo
   der Stand als `skill_room_state.data` zur Klasse reist.

   Filius deckelt die Einfuhr bei 150 000 Bytes
   (FileExplorer.java:85). Hier sind es 2 MB je Datei und 4 MB je
   Netz, gemessen an der LÄNGE DER DATEN-URI und nicht an
   `file.size` — Base64 bläht um ein Drittel, und die Grenze muss
   das meinen, was wirklich im Speicher landet.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Welche Endung ist was? ──────────────────────────────────
     Übernommen aus `config/filetypes.txt` von Filius:
         text;txt,cfg,bat,sh,html,htm,ini,php,xml
         image;jpeg,jpg,bmp,tiff,png
     ⚠️ Eine Zutat: **css**. Filius kennt die Endung nicht (sein
     Browser kann ohnehin kaum CSS); hier gehört sie dazu, weil
     eine Seite mit eigener Stildatei der Grund ist, aus dem ein
     Browser zweimal fragt. */
  const TEXT_ENDUNGEN = ['txt', 'cfg', 'bat', 'sh', 'html', 'htm', 'ini', 'php', 'xml', 'css'];
  const BILD_ENDUNGEN = ['jpeg', 'jpg', 'bmp', 'tiff', 'png', 'gif', 'svg', 'webp'];

  /* ─── Die drei Grenzen ────────────────────────────────────────
     Filius deckelt bei 150 000 Bytes (FileExplorer.java:85) — für
     ein Foto aus einer Handykamera zu wenig, und genau das war der
     Anlass, es anders zu machen.

     Gemessen wird die LÄNGE DER DATEN-URI und nicht `file.size`:
     Base64 bläht um ein Drittel auf, und die Grenze muss das
     meinen, was wirklich im Speicher landet.

     ⚠️ Der begrenzende Faktor ist nicht die Leitung, sondern der
     localStorage (rund 5 MB je Herkunft für den GANZEN Stand).
     4 MB je Netz stehen darüber — bewusst. Vom Nutzer am
     2026-09-28: „Das wird ja später nicht im localStorage
     gespeichert, wir wechseln bald auf eine Datenbank. Also mach
     4 MB." Bis dahin kann also der Toast „Speicher ist voll"
     (app.js) kommen; er ist gebaut und verliert nichts, und die
     Grenze richtet sich nach dem Ziel und nicht nach dem
     Zwischenschritt. 2 MB je Datei sind ein Foto aus einer
     Handykamera, ohne dass man vorher verkleinern muss.

     GRENZE_TEXT ist die dritte und die unauffälligste: darüber
     bliebe eine Textdatei nicht mehr im Eintrag stehen, und der
     Editor könnte sie nicht mehr öffnen (siehe Kopf der Datei). */
  const GRENZE_DATEI = 2 * 1024 * 1024;    // 2 MB je Datei
  const GRENZE_NETZ  = 4 * 1024 * 1024;    // 4 MB je Netz
  const GRENZE_TEXT  = 64 * 1024;          // darüber nicht mehr inline

  /* ─── Die eingebaute Bildersammlung ───────────────────────────
     Vier SVG-Bilder als Daten-URI. SVG, weil es in ein paar
     hundert Zeichen passt und in jeder Größe scharf bleibt; als
     Daten-URI, weil derselbe String sowohl im Bildbetrachter als
     auch später im Webbrowser (als `<img src>`) und im
     E-Mail-Anhang steht — ohne Datei und ohne Netzzugriff.

     Bewusst schlicht und flach: sie sollen als „ein Bild" zu
     erkennen sein, nicht schön. Wer eigene Bilder will, lädt eine
     Datei hoch.

     ⭐ Seit dem 2026-09-28 liegt diese Sammlung als ORDNER `/Bilder`
     auf jedem Endgerät (siehe `grundbestand`). Vorher steckte sie
     hinter einem Knopf *Bild einfügen*, der eine Galerie aufschlug —
     ein zweiter Weg, eine Datei anzulegen, den es sonst nirgends
     gibt. Als Ordner ist sie das, was sie ist: Material, das dasteht
     und das man wegwerfen kann. */
  const SAMMLUNG = {
    '@schule': {
      name: 'Schule',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">'
         + '<rect width="160" height="120" fill="#dceaf7"/>'
         + '<rect x="30" y="50" width="100" height="55" fill="#c96f4a"/>'
         + '<path d="M22 50 80 20l58 30z" fill="#8c4a30"/>'
         + '<rect x="70" y="72" width="20" height="33" fill="#f2e3c9"/>'
         + '<rect x="42" y="62" width="16" height="16" fill="#f2e3c9"/>'
         + '<rect x="102" y="62" width="16" height="16" fill="#f2e3c9"/>'
         + '<rect x="0" y="105" width="160" height="15" fill="#7fae60"/></svg>'
    },
    '@foto': {
      name: 'Landschaft',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">'
         + '<rect width="160" height="120" fill="#a8d4ef"/>'
         + '<circle cx="126" cy="30" r="14" fill="#ffd66b"/>'
         + '<path d="M0 90 44 48l30 30 22-18 64 42z" fill="#6f9e5a"/>'
         + '<path d="M44 48 74 78 58 78z" fill="#f5f7fb"/>'
         + '<rect x="0" y="96" width="160" height="24" fill="#4d7a45"/></svg>'
    },
    '@logo': {
      name: 'Marke',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">'
         + '<rect width="160" height="120" fill="#ffffff"/>'
         + '<circle cx="80" cy="60" r="38" fill="none" stroke="#2a6df4" stroke-width="10"/>'
         + '<path d="M62 60 76 74 100 46" fill="none" stroke="#2a6df4" '
         + 'stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    },
    '@smiley': {
      name: 'Smiley',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">'
         + '<rect width="160" height="120" fill="#fff6d8"/>'
         + '<circle cx="80" cy="60" r="42" fill="#ffd34d"/>'
         + '<circle cx="66" cy="50" r="5" fill="#4a3a10"/>'
         + '<circle cx="94" cy="50" r="5" fill="#4a3a10"/>'
         + '<path d="M60 72c8 10 32 10 40 0" fill="none" stroke="#4a3a10" '
         + 'stroke-width="5" stroke-linecap="round"/></svg>'
    }
  };

  const datenUri = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

  /* ─── Pfade ───────────────────────────────────────────────────
     Immer absolut, immer mit „/" am Anfang, nie mit „/" am Ende
     — außer der Wurzel, die genau „/" heißt. Die Wurzel gibt es
     immer und sie steht nie im Speicherformat. */
  const WURZEL = '/';

  function normieren(pfad) {
    let p = String(pfad == null ? '' : pfad).trim().replace(/\\/g, '/');
    if (p.charAt(0) !== '/') p = '/' + p;
    const teile = [];
    for (const t of p.split('/')) {
      if (!t || t === '.') continue;
      if (t === '..') { teile.pop(); continue; }
      teile.push(t);
    }
    return teile.length ? '/' + teile.join('/') : WURZEL;
  }

  const verbinden = (ordner, name) => normieren((ordner === WURZEL ? '' : ordner) + '/' + name);
  const elternteil = (pfad) => {
    const p = normieren(pfad);
    if (p === WURZEL) return WURZEL;
    const i = p.lastIndexOf('/');
    return i <= 0 ? WURZEL : p.slice(0, i);
  };
  const basis = (pfad) => {
    const p = normieren(pfad);
    return p === WURZEL ? WURZEL : p.slice(p.lastIndexOf('/') + 1);
  };
  const endung = (pfad) => {
    const b = basis(pfad);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i + 1).toLowerCase() : '';
  };

  function erzeugen() {

    const raum = (node) => (node.dateien || (node.dateien = {}));
    const gibt = (node, pfad) => normieren(pfad) === WURZEL || !!raum(node)[normieren(pfad)];

    function eintrag(node, pfad) {
      const p = normieren(pfad);
      if (p === WURZEL) return { ordner: true };
      return raum(node)[p] || null;
    }

    /* Was für ein Ding ist das? Der Ordner entscheidet sich am
       Eintrag, alles andere an der Endung — wie in Filius. Eine
       Datei ohne bekannte Endung ist `unbekannt` und lässt sich
       nicht öffnen; das ist ehrlicher, als sie als Text
       anzuzeigen und Unsinn zu zeigen. */
    function art(node, pfad) {
      const e = eintrag(node, pfad);
      if (!e) return null;
      if (e.ordner) return 'ordner';
      if (e.bild != null) return 'bild';
      /* Eine eingeführte Datei, die dieses Gerät nicht anzeigen
         kann. Sie steht in der Liste, sie lässt sich kopieren und
         übertragen — sie geht nur nicht auf. Das ist ehrlicher,
         als sie als Text zu zeigen und Zeichensalat anzuzeigen
         (dieselbe Begründung wie bei `unbekannt` weiter unten). */
      if (e.daten != null) return 'unbekannt';
      const en = endung(pfad);
      if (BILD_ENDUNGEN.indexOf(en) >= 0) return 'bild';
      if (TEXT_ENDUNGEN.indexOf(en) >= 0) return 'text';
      return e.text != null ? 'text' : 'unbekannt';
    }

    /* Was in EINEM Ordner liegt — nicht, was darunter alles
       hängt. Ordner zuerst, dann nach Namen; so steht die
       Gliederung oben und nicht zwischen den Dateien. */
    function list(node, ordner) {
      const o = normieren(ordner);
      const praefix = o === WURZEL ? '/' : o + '/';
      const out = [];
      for (const p of Object.keys(raum(node))) {
        if (p.indexOf(praefix) !== 0) continue;
        const rest = p.slice(praefix.length);
        if (!rest || rest.indexOf('/') >= 0) continue;     // liegt tiefer
        out.push({ pfad: p, name: rest, art: art(node, p) });
      }
      out.sort((a, b) => (a.art === 'ordner' ? 0 : 1) - (b.art === 'ordner' ? 0 : 1)
        || a.name.localeCompare(b.name, 'de'));
      return out;
    }

    const lesen = (node, pfad) => {
      const e = eintrag(node, pfad);
      if (!e || e.ordner) return null;
      return e;
    };

    function schreiben(node, pfad, text) {
      const p = normieren(pfad);
      const e = raum(node)[p];
      if (!e || e.ordner) return false;
      e.text = String(text);
      return true;
    }

    /* ─── Namen prüfen ────────────────────────────────────────
       Gibt einen SATZ zurück, wenn etwas nicht geht, und `null`,
       wenn es geht. Ein Wahrheitswert hieße, dass die Oberfläche
       sich den Grund selbst ausdenkt — und dann steht bei zwei
       verschiedenen Fehlern derselbe Satz. */
    function pruefeName(node, ordner, name) {
      const n = String(name == null ? '' : name).trim();
      if (!n) return 'Der Name darf nicht leer sein.';
      if (n.indexOf('/') >= 0) return 'Ein Name darf keinen Schrägstrich enthalten.';
      if (n === '.' || n === '..') return 'Dieser Name ist vergeben.';
      if (n.length > 40) return 'Der Name ist zu lang (höchstens 40 Zeichen).';
      if (gibt(node, verbinden(ordner, n))) return '„' + n + '" gibt es hier schon.';
      return null;
    }

    function ordnerAnlegen(node, ordner, name) {
      const fehler = pruefeName(node, ordner, name);
      if (fehler) return { ok: false, fehler: fehler };
      const p = verbinden(ordner, String(name).trim());
      raum(node)[p] = { ordner: true };
      return { ok: true, pfad: p };
    }

    function anlegen(node, ordner, name, inhalt) {
      const fehler = pruefeName(node, ordner, name);
      if (fehler) return { ok: false, fehler: fehler };
      const p = verbinden(ordner, String(name).trim());
      /* Drei Inhaltsformen, und genau eine je Eintrag:
           bild  ein anzeigbares Bild (@sammlung, blob: oder URI)
           daten eine eingeführte Datei, die dieses Gerät nicht
                 anzeigen kann — sie ist da, sie lässt sich
                 übertragen, aber nicht öffnen (so hält es Filius
                 auch: es führt jede Datei ein und kann nur die
                 bekannten Endungen darstellen)
           text  alles andere                                    */
      raum(node)[p] = inhalt && inhalt.bild != null
        ? { bild: String(inhalt.bild) }
        : inhalt && inhalt.daten != null
          ? { daten: String(inhalt.daten) }
          : { text: String((inhalt && inhalt.text) || '') };
      return { ok: true, pfad: p };
    }

    /* Ein Ordner nimmt beim Löschen alles mit, was in ihm liegt.
       Die Alternative — „Ordner ist nicht leer" — ist in Filius
       nicht anders und wäre hier eine Hürde ohne Lernwert: es
       gibt Strg+Z. */
    function loeschen(node, pfad) {
      const p = normieren(pfad);
      if (p === WURZEL) return false;
      const r = raum(node);
      if (!r[p]) return false;
      const praefix = p + '/';
      for (const k of Object.keys(r)) if (k === p || k.indexOf(praefix) === 0) delete r[k];
      return true;
    }

    /* Umbenennen zieht die Kinder mit — das ist die eine Stelle,
       an der die flache Zuordnung mehr Arbeit macht als ein Baum,
       und es sind acht Zeilen. */
    function umbenennen(node, pfad, neuerName) {
      const p = normieren(pfad);
      if (p === WURZEL) return { ok: false, fehler: 'Die Wurzel hat keinen Namen.' };
      const r = raum(node);
      if (!r[p]) return { ok: false, fehler: 'Das gibt es nicht mehr.' };
      const eltern = elternteil(p);
      const n = String(neuerName == null ? '' : neuerName).trim();
      if (n === basis(p)) return { ok: true, pfad: p };          // nichts zu tun
      const fehler = pruefeName(node, eltern, n);
      if (fehler) return { ok: false, fehler: fehler };

      const neu = verbinden(eltern, n);
      const praefix = p + '/';
      for (const k of Object.keys(r)) {
        if (k === p) { r[neu] = r[k]; delete r[k]; }
        else if (k.indexOf(praefix) === 0) { r[neu + k.slice(p.length)] = r[k]; delete r[k]; }
      }
      return { ok: true, pfad: neu };
    }

    /* Für den Webserver und den Bildbetrachter: der anzeigbare
       Inhalt eines Bildes. Drei Herkünfte, eine Ausgabe —
       heraus kommt immer etwas, das in ein `src` passt:

         @name       aus der eingebauten Sammlung
         blob:…      aus dem Inhaltsspeicher (eingeführte Datei)
         alles sonst ist schon eine Daten-URI                    */
    function bildQuelle(wert) {
      if (wert == null) return null;
      const w = String(wert);
      if (w.charAt(0) === '@') {
        const b = SAMMLUNG[w];
        return b ? datenUri(b.svg) : null;
      }
      if (w.indexOf('blob:') === 0) return blobs[w.slice(5)] || null;
      return w;
    }

    /* ═══ Der Inhaltsspeicher ════════════════════════════════
       Siehe den Kopf der Datei: er liegt NEBEN dem Netz und nicht
       darin, damit der Verlauf klein bleibt. */
    const blobs = Object.create(null);     // schlüssel → Daten-URI

    /* FNV-1a. Es geht nicht um Sicherheit, sondern darum, dass
       derselbe Inhalt denselben Schlüssel bekommt — dann kostet
       dieselbe Datei zweimal eingeführt nur einmal Platz. Die
       Länge kommt dazu, weil sie fast nichts kostet und
       Zusammenstöße noch unwahrscheinlicher macht. */
    function streuwert(text) {
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      return h.toString(16) + '-' + text.length.toString(36);
    }

    function ablegen(datenUri) {
      const s = String(datenUri);
      const k = streuwert(s);
      blobs[k] = s;
      return 'blob:' + k;
    }

    /* Nur die Inhalte, auf die im Netz wirklich noch jemand
       zeigt. Alles andere ist Verlaufsballast und gehört nicht in
       die Datei — im Speicher darf es bleiben (Strg+Z), auf der
       Platte nicht. */
    function blobsBenutzt(netz) {
      const out = {};
      for (const n of netz.list()) {
        for (const p of Object.keys(n.dateien || {})) {
          const e = n.dateien[p] || {};
          for (const w of [e.bild, e.daten]) {
            if (typeof w === 'string' && w.indexOf('blob:') === 0) {
              const k = w.slice(5);
              if (blobs[k] != null) out[k] = blobs[k];
            }
          }
        }
      }
      return out;
    }

    function blobsLaden(obj) {
      if (!obj) return;
      for (const k of Object.keys(obj)) blobs[k] = String(obj[k]);
    }

    function blobsLeeren() {
      for (const k of Object.keys(blobs)) delete blobs[k];
    }

    /* Wie viel Platz die eingeführten Dateien dieses Netzes
       belegen — für die Anzeige im Datei-Explorer. Gezählt wird
       die Länge der Daten-URI, also das, was wirklich gespeichert
       wird. Ein Inhalt, auf den zwei Geräte zeigen, zählt einmal. */
    function verbrauch(netz) {
      const b = blobsBenutzt(netz);
      let n = 0;
      for (const k of Object.keys(b)) n += b[k].length;
      return n;
    }

    /* ═══ Eine echte Datei einführen ═════════════════════════
       Der Aufrufer (prog-dateien.js) hat sie schon gelesen — als
       Text oder als Daten-URI, je nach Endung. Hier stehen die
       Regeln, und sie stehen HIER und nicht im Fenster: eine
       Größengrenze, die nur eine Oberfläche kennt, gilt beim
       nächsten Aufrufer nicht mehr. */
    function einfuehren(node, ordner, name, roh, netz) {
      const fehler = pruefeName(node, ordner, name);
      if (fehler) return { ok: false, fehler: fehler };

      /* Text bleibt INLINE — nur so kann der Editor ihn öffnen,
         und eine eingeführte HTML-Seite zu bearbeiten ist der
         Grund, aus dem man sie einführt. Dafür muss er klein
         bleiben: er steht in jedem der sechzig Verlaufsstände. */
      if (roh && roh.text != null) {
        const t = String(roh.text);
        if (t.length > GRENZE_TEXT) {
          return { ok: false, fehler: 'Diese Textdatei ist zu groß (über '
            + kurzMass(GRENZE_TEXT) + '). Textdateien werden hier zum Bearbeiten '
            + 'offen gehalten, und das geht nur mit kleinen.' };
        }
        return anlegen(node, ordner, name, { text: t });
      }

      const uri = String((roh && roh.datenUri) || '');
      if (!uri) return { ok: false, fehler: 'Diese Datei ist leer.' };
      if (uri.length > GRENZE_DATEI) {
        // Filius: „Datei existiert nicht oder ist zu groß (> 150KB)"
        return { ok: false, fehler: 'Datei ist zu groß (über '
          + kurzMass(GRENZE_DATEI) + ').' };
      }

      /* ⚠️ Die Gesamtprüfung entfällt, wenn dieser Inhalt schon im
         Speicher liegt: dieselbe Datei ein zweites Mal einzuführen
         kostet keinen Platz (gleicher Streuwert, gleicher
         Eintrag). Ohne diese Zeile meldete das Programm „voll",
         obwohl nichts dazukäme. */
      const k = streuwert(uri);
      if (blobs[k] == null && netz
          && verbrauch(netz) + uri.length > GRENZE_NETZ) {
        return { ok: false, fehler: 'Der Platz für hochgeladene Dateien ist voll ('
          + kurzMass(GRENZE_NETZ) + ' je Netz). Lösche eine, bevor du eine neue '
          + 'hochlädst.' };
      }

      const bild = BILD_ENDUNGEN.indexOf(endung(name)) >= 0;
      const r = anlegen(node, ordner, name,
        bild ? { bild: ablegen(uri) } : { daten: ablegen(uri) });
      if (r.ok) raum(node)[r.pfad].groesse = uri.length;
      return r;
    }

    /* ⚠️ Unterhalb eines Kilobytes in BYTES. `Math.round(n/1024)`
       allein schrieb bei einem kleinen Bild „0 KB von 3 MB
       belegt" — eine Anzeige, die behauptet, es liege nichts da,
       während die Datei in der Liste darüber steht. Das hat erst
       das Bild gezeigt. */
    const kurzMass = (n) => n >= 1024 * 1024
      ? (Math.round(n / (1024 * 1024) * 10) / 10) + ' MB'
      : n >= 1024
        ? Math.round(n / 1024) + ' KB'
        : n + ' Byte';

    /* Hier stand `sammlung()` — die Liste der eingebauten Bilder mit
       Name und fertiger Quelle, für die Galerie beim Anlegen. Mit
       der Galerie ist sie am 2026-09-28 weggefallen; wer die Bilder
       sehen will, öffnet `/Bilder`. `bildQuelle` bleibt der einzige
       Weg von `@name` zu einem anzeigbaren Bild. */

    /* ─── Was ab Werk auf dem Gerät liegt ─────────────────────────
       Der Ordner `/Bilder` mit der eingebauten Sammlung. Gerufen aus
       `netz.addNode`, und NUR dort: nicht aus `fromJSON` und nicht
       aus `einfuegen`, sonst käme ein weggeworfener Ordner beim
       Laden oder beim Einfügen wieder (siehe Kopf der Datei).

       Die Endung ist `.svg` und nicht `.png`: es SIND SVG-Bilder,
       und eine Datei, die anders heißt als sie ist, wäre genau die
       Art stiller Unwahrheit, die ein Kind später einen Nachmittag
       kostet. Der Webserver kennt die Endung (http.js).

       ⚠️ `GRUNDBILDER` und `SAMMLUNG` sind ZWEI Listen, und wer eine
       anfasst, muss an die andere denken. Sie aus `SAMMLUNG` zu
       rechnen (Name kleingeschrieben + `.svg`) wäre kürzer und
       wurde absichtlich nicht gemacht: dann hinge der DATEINAME am
       Anzeigenamen, und wer „Marke" in „Logo" umbenennt, hätte auf
       neuen Geräten `logo.svg` und auf allen gespeicherten weiter
       `marke.svg` — dieselbe Datei unter zwei Namen, ohne dass es
       jemand merkt. Ein vergessener Eintrag hier fällt dagegen
       sofort auf: das Bild fehlt im Ordner. */
    const BILDER_ORDNER = '/Bilder';
    const GRUNDBILDER = [
      ['schule.svg',      '@schule'],
      ['landschaft.svg',  '@foto'],
      ['marke.svg',       '@logo'],
      ['smiley.svg',      '@smiley']
    ];

    function grundbestand(node) {
      ordnerAnlegen(node, WURZEL, basis(BILDER_ORDNER));
      for (const [name, id] of GRUNDBILDER) {
        anlegen(node, BILDER_ORDNER, name, { bild: id });
      }
    }

    return {
      WURZEL, normieren, verbinden, elternteil, basis, endung,
      raum, gibt, eintrag, art, list, lesen, schreiben,
      pruefeName, anlegen, ordnerAnlegen, loeschen, umbenennen,
      bildQuelle, grundbestand, BILDER_ORDNER,
      // Einfuhr und der Inhaltsspeicher
      einfuehren, ablegen, blobsBenutzt, blobsLaden, blobsLeeren,
      verbrauch, kurzMass,
      GRENZE_DATEI, GRENZE_NETZ, GRENZE_TEXT,
      TEXT_ENDUNGEN, BILD_ENDUNGEN
    };
  }

  window.Dateien = erzeugen();
})();
