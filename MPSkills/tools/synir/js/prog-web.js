/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — prog-web.js   ·   Webbrowser und Webserver
   ══════════════════════════════════════════════════════════════
   Das Protokoll steht in `http.js` und ist kopflos prüfbar; hier
   stehen die zwei Fenster.

   ── Die Seite wird in einem <iframe sandbox srcdoc> gezeigt ───
   Das ist die Entscheidung mit den meisten Folgen, und sie hat
   vier Gründe:

   1. **Echtes HTML und echtes CSS**, ohne einen eigenen Renderer.
      Der Browser des Kindes zeichnet die Seite des Kindes — und
      genau das soll er.
   2. **`sandbox` OHNE `allow-scripts` heißt: JavaScript läuft
      nicht.** Der Wunsch („der akzeptiert kein JS") ist damit
      keine Prüfung, die man umgehen kann, sondern eine
      Eigenschaft der Umgebung. `http.js` ersetzt Skriptblöcke
      zusätzlich durch einen Kommentar — das ist die Auskunft,
      nicht die Sicherung.
   3. **Kein Weg in die Oberfläche.** Ein `body { display:none }`
      auf der Schülerseite kann den Simulator nicht treffen, und
      ein `<a href>` kann das Fenster nicht wegnavigieren.
   4. **Nichts verlässt den Rechner.** Was die Seite nachlädt, hat
      der Simulator schon geholt und steht als `<style>` bzw. als
      Daten-URI drin. Der echte Browser stellt dafür keine einzige
      Anfrage ins Netz.

   ── Seit 2026-09-30: Formulare und Links (PLAN-SICHERHEIT 2) ──
   Damit sich ein Kind auf einer Seite anmelden kann, muss der
   Browser Formulare abschicken und Links verfolgen können. Die
   Sandbox lautet deshalb `allow-scripts allow-forms` — weiterhin
   OHNE `allow-same-origin` —, und in jede Seite kommt eine
   **Content-Security-Policy mit Einmalschlüssel**: `script-src
   'nonce-…'`. Der Schlüssel wird bei jedem Anzeigen neu gewürfelt
   und steht nur im Brückenskript des Simulators. Was die Seite des
   Kindes an Skript mitbringt (`<script>`, `onclick=`, `onerror=`,
   `javascript:`), hat ihn nicht und wird vom BROWSER blockiert.
   Die Brücke fängt `submit` und Linkklicks ab und meldet sie per
   `postMessage`; der Simulator nimmt nur Meldungen an, die aus dem
   eigenen Rahmen kommen und den richtigen Schlüssel tragen.
   Geprüft in Chromium (Probeseite), Ergebnis in PLAN-SICHERHEIT.

   ── https:// und das Schloss (seit 2026-10-01) ────────────────
   Der Vorsatz vor dem Feld ist ein Knopf (http ⇄ https, auch
   getippt); hinter dem Feld steht, was aus der geladenen Seite
   wurde: „Sicher" (grün), „Nicht sicher" (http) oder „Unsicher"
   (Warnung übergangen). Ein Zertifikatsfehler ersetzt die Seite
   durch eine WARNSEITE (nicht durch einen Fehlertext): Grund,
   Fakten, „Zurück" und der kleine Knopf „Trotzdem fortfahren
   (unsicher)". Der Schild-Knopf öffnet die Vertrauensliste
   (`prog-zert.js`). Alles ohne modalen Dialog.

   ⚠️ Für den Prüfstand heißt das: Aussagen über die gezeigte
   Seite gehen über `frameLocator`. Eine Prüfung sichert, dass ein
   eingeschmuggeltes `<script>` NICHT läuft (es bleibt so, auch
   mit der Brücke).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  /* Je Gerät ein Browserzustand. Wie beim Datei-Explorer außerhalb
     der Bauen-Funktion, weil jedes `render()` das Fenster neu
     aufbaut — eine Adresse, die das nicht übersteht, wäre beim
     ersten Paket weg. */
  /* `schema` ist das, was VOR dem Eingabefeld steht (http oder https),
     `adresse` das, was im Feld steht — ohne Vorsatz. `warn` ist die
     Warnseite eines Zertifikatsfehlers, `ansicht` 'seite' oder 'zert'
     (die Vertrauensliste), `infoOffen` die Fläche unter dem Schloss. */
  const leerBr = (nodeId) => ({ node: nodeId, adresse: '', geladen: '', schema: 'http', seite: null, fehler: '',
    laden: false, verlauf: [], rahmen: null, nonce: '', folge: null,
    warn: null, ansicht: 'seite', infoOffen: false });
  let br = leerBr(null);

  function frisch(nodeId) { br = leerBr(nodeId); }

  /* Eine Adresse mit oder ohne Vorsatz → Vorsatz und Rest. */
  function teile(voll) {
    const t = String(voll || '').trim();
    if (/^https:\/\//i.test(t)) return { schema: 'https', adresse: t.slice(8) };
    return { schema: 'http', adresse: t.replace(/^http:\/\//i, '') };
  }
  const volle = () => (br.schema === 'https' ? 'https://' : '') + br.adresse;
  /* `adresse` ist der Text im Feld (auch halb getippt), `geladen` die
     letzte Adresse, die wirklich geholt wurde — nur sie gehört in den
     Verlauf und ist der Bezug für relative Links. */

  /* ─── Die Brücke ──────────────────────────────────────────────
     Läuft IM Rahmen, mit dem Schlüssel der Seite. Sie tut nichts
     außer zu melden: `submit` (auch mit Enter) und Klicks auf
     Links. Was daraus wird, entscheidet der Simulator. */
  const BRUECKE = "(function(){var N='%N';"
    + "function m(o){o.synir=true;o.nonce=N;parent.postMessage(o,'*');}"
    + "document.addEventListener('submit',function(e){e.preventDefault();"
    + "var f=e.target,d={};new FormData(f).forEach(function(v,k){d[k]=String(v);});"
    + "m({art:'form',action:f.getAttribute('action')||'',methode:(f.getAttribute('method')||'get').toLowerCase(),daten:d});},true);"
    + "document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');"
    + "if(a){e.preventDefault();m({art:'link',href:a.getAttribute('href')});}},true);})();";

  function neuerNonce() {
    const z = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(z)
      : z.forEach((_, i) => { z[i] = Math.floor(Math.random() * 256); });
    return Array.from(z).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* Die Seite in ihr Gerüst: zuerst die Richtlinie und die Brücke,
     dann die Seite des Kindes — was davor steht, kann sie nicht
     mehr ändern. `img-src data:`, weil die Bilder schon als
     Daten-URI eingesetzt sind. */
  function verpacken(html, nonce) {
    return '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
      + 'style-src \'unsafe-inline\'; img-src data:; script-src \'nonce-' + nonce + '\'">'
      + '<script nonce="' + nonce + '">' + BRUECKE.replace('%N', nonce) + '<\/script>'
      + '</head><body>' + html + '</body></html>';
  }

  /* Eine Meldung aus dem Rahmen: nur vom eigenen Rahmen, nur mit dem
     richtigen Schlüssel. Einmal für das ganze Programm. */
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!br.rahmen || !br.folge || ev.source !== br.rahmen.contentWindow) return;
    if (!d || d.synir !== true || d.nonce !== br.nonce) return;
    br.folge(d);
  });

  /* ═══ Der Webbrowser ═════════════════════════════════════════ */

  function bauBrowser(node, box, ctx) {
    if (br.node !== node.id) frisch(node.id);
    const http = ctx.http;

    /* Wie sicher war die Seite, die gerade dasteht? `null` = keine
       Seite da (leer, lädt, Fehler, Warnung). */
    const vertraut = ctx.netz.vertrauen(node).length;
    const sicher = (br.ansicht === 'seite' && br.seite && br.seite.ziel)
      ? (br.seite.ziel.schema === 'https'
          ? (br.seite.tls && br.seite.tls.ausnahme ? 'ausnahme' : 'sicher') : 'http')
      : null;
    const sicherheitsText = (art) => {
      const t = (br.seite && br.seite.tls) || {};
      if (art === 'http')
        return '<strong>Nicht sicher.</strong> Diese Seite kam <em>unverschlüsselt</em> an (HTTP). '
          + 'Wer an der Leitung sitzt, kann alles mitlesen — auch ein Passwort, das du hier eintippst.';
      if (art === 'ausnahme')
        return '<strong>Unsicher — du hast eine Warnung übergangen.</strong> Die Verbindung ist verschlüsselt, '
          + 'aber ' + esc(t.fehlerText || 'das Zertifikat ist nicht in Ordnung') + ' Du weißt nicht, mit wem du sprichst.';
      return '<strong>Sichere Verbindung</strong> (' + esc(t.version || 'TLS') + '). Das Zertifikat gilt für <strong>'
        + esc(t.name || '') + '</strong>, ausgestellt von <strong>' + esc(t.aussteller || '') + '</strong>. '
        + 'Was du schickst und bekommst, kann unterwegs niemand lesen — wer mit wem spricht, sieht man trotzdem.';
    };

    box.innerHTML =
      '<div class="wb-leiste">'
      +   '<button class="wb-zurueck" id="wbZurueck"' + (br.verlauf.length ? '' : ' disabled')
      +     ' title="eine Seite zurück">‹</button>'
      +   '<div class="wb-adr">'
      /* `http://` steht als fester Vorsatz VOR dem Feld und nicht
         darin. Filius schreibt es in das Feld (`webbrowser`,
         Startwert "http://") — dann muss ein Kind auf einem Tablet
         erst hinter den Text tippen, und die halbe Klasse
         überschreibt ihn. Das Wissen ist dasselbe, die Handhabung
         nicht. */
      /* ⭐ Der Vorsatz ist jetzt ein Knopf: ein Tipp wechselt
         zwischen http:// und https://. HTTP ist der Standard (so
         steht es beim Öffnen da); wer https:// will, schaltet es
         um — oder tippt es einfach ins Feld. Das Schloss dahinter
         sagt, was aus der LETZTEN Seite geworden ist. */
      +     '<button class="wb-vor wb-vor--' + br.schema + '" id="wbSchema" '
      +       'title="Tippen: zwischen http:// und https:// wechseln">'
      +       (br.schema === 'https' ? U.icon('schloss') : '') + br.schema + '://</button>'
      +     '<input class="f" id="wbAdr" value="' + esc(br.adresse) + '" '
      +       'placeholder="www.schule.de" spellcheck="false" autocomplete="off">'
      +     (sicher ? '<button class="wb-sl wb-sl--' + sicher + '" id="wbSchloss" title="Sicherheit dieser Seite">'
                      + (sicher === 'sicher' ? U.icon('schloss') + ' Sicher'
                         : sicher === 'ausnahme' ? '⚠ Unsicher' : 'Nicht sicher') + '</button>' : '')
      +   '</div>'
      +   '<button class="k-add" id="wbStart">Start</button>'
      /* Das Schild sagt auf einen Blick, ob dieses Gerät irgendeiner
         Zertifizierungsstelle glaubt: orange, solange die Vertrauensliste
         leer ist (dann zeigt jede HTTPS-Seite eine Warnung), grün, sobald
         mindestens eine drinsteht. */
      +   '<button class="wb-zert ' + (vertraut ? 'wb-zert--ok' : 'wb-zert--leer')
      +     (br.ansicht === 'zert' ? ' is-on' : '') + '" id="wbZert" '
      +     'title="' + (vertraut ? 'Zertifikate — dieses Gerät vertraut ' + vertraut + ' Zertifizierungsstelle' + (vertraut === 1 ? '' : 'n')
                                  : 'Zertifikate — noch keiner Zertifizierungsstelle vertraut: HTTPS-Seiten zeigen eine Warnung')
      +     '" aria-label="Zertifikate">'
      +     U.icon('schild') + '</button>'
      + '</div>'
      + (sicher && br.infoOffen ? '<div class="wb-info wb-info--' + sicher + '">' + sicherheitsText(sicher) + '</div>' : '')
      + '<div class="wb-seite" id="wbSeite"></div>'
      + '<div class="wb-fuss" id="wbFuss"></div>';

    const rahmen = box.querySelector('#wbSeite');
    const fuss = box.querySelector('#wbFuss');

    if (br.ansicht === 'zert') {
      window.ProgZert.vertrauenAnsicht(node, rahmen, ctx, () => { br.ansicht = 'seite'; ctx.render(); });
    } else if (br.warn) {
      rahmen.innerHTML = warnSeite(br.warn);
    } else if (br.laden) {
      rahmen.innerHTML = '<div class="wb-leer">Die Seite wird geholt …</div>';
    } else if (br.fehler) {
      /* Der Wortlaut ist der von Filius (`sw_webbrowser_msg1`),
         weil es genau derselbe Fall ist: es kam gar keine
         Verbindung zustande. */
      rahmen.innerHTML = '<div class="wb-fehler"><strong>'
        + esc(br.fehler) + '</strong></div>';
    } else if (br.seite) {
      /* Der Rahmen wird als Element gebaut und nicht als Text:
         `srcdoc` als Eigenschaft zu setzen spart das Entschärfen
         der Anführungszeichen, und `sandbox` muss genau so
         dastehen — leer. */
      const f = document.createElement('iframe');
      f.className = 'wb-rahmen';
      f.setAttribute('sandbox', 'allow-scripts allow-forms');
      f.setAttribute('title', 'Seite');
      br.nonce = neuerNonce();
      br.rahmen = f;
      f.srcdoc = verpacken(br.seite.html, br.nonce);
      rahmen.appendChild(f);
    } else {
      rahmen.innerHTML = '<div class="wb-leer">Trag oben eine Adresse ein — '
        + 'einen Namen wie <code>www.schule.de</code> oder eine IP-Adresse.</div>';
    }

    if (br.ansicht === 'seite' && br.seite && br.seite.teile) {
      /* ⭐ Die Liste, um die es geht: EINE Seite, MEHRERE
         Anfragen. Im echten Browser steht das in einem Werkzeug,
         das kein Kind je aufmacht; hier steht es unter der Seite. */
      fuss.innerHTML = '<div class="wb-teile">'
        + br.seite.teile.map(t =>
            '<span class="wb-teil' + (t.status === 200 ? '' : ' is-bad') + '">'
            + (t.methode === 'POST' ? 'POST ' : '') + esc(t.pfad) + ' <em>' + (t.status || '—') + '</em></span>').join('')
        + '</div>'
        + '<div class="k-hint">' + br.seite.teile.length + ' Anfrage'
        + (br.seite.teile.length === 1 ? '' : 'n') + ' für eine Seite — '
        + 'jede Datei wird einzeln geholt.</div>';
    } else fuss.innerHTML = '';

    /* Zu einer Adresse gehen — getippt, verfolgt oder als Formular
       abgeschickt (`opt`, siehe http.js). Nach einer Weiterleitung
       steht oben die Adresse, bei der der Browser gelandet ist. */
    const gehe = (adr, opt) => {
      if (br.geladen && br.geladen !== adr) br.verlauf.push(br.geladen);
      br.geladen = adr;
      const t = teile(adr);
      br.schema = t.schema; br.adresse = t.adresse;
      br.fehler = '';
      br.warn = null;
      br.ansicht = 'seite';
      br.infoOffen = false;
      br.seite = null;
      br.laden = true;
      ctx.render();
      http.seiteHolen(node, adr, (r) => {
        br.laden = false;
        if (r.ok) {
          br.seite = r; br.fehler = '';
          if (r.ziel) {
            const n = teile(http.adresseVon(r.ziel));
            br.schema = n.schema; br.adresse = n.adresse; br.geladen = http.adresseVon(r.ziel);
          }
        } else if (r.tls && r.ziel && /^(unbekannt|name|signatur|beweis)$/.test(r.tls.code)) {
          /* Ein Zertifikatsfehler ist keine Fehlermeldung, sondern eine
             WARNSEITE — mit dem Grund und der Wahl: zurück oder trotzdem. */
          br.seite = null; br.fehler = ''; br.warn = { tls: r.tls, ziel: r.ziel, adr: adr, grund: r.grund };
        } else { br.seite = null; br.fehler = r.grund; }
        ctx.render();
      }, opt);
    };

    const los = () => {
      const feld = box.querySelector('#wbAdr');
      const adr = feld.value.trim();
      if (!adr) return;
      // Ein getippter Vorsatz gewinnt gegen den Knopf davor.
      gehe(/^https?:\/\//i.test(adr) ? adr : (br.schema === 'https' ? 'https://' : '') + adr);
    };

    /* Was die Brücke aus dem Rahmen meldet. */
    br.folge = (d) => {
      const von = br.geladen || volle();
      if (d.art === 'link') {
        const ziel = http.adresseAufloesen(von, d.href);
        if (ziel) gehe(ziel);
        return;
      }
      if (d.art !== 'form') return;
      const ziel = http.adresseAufloesen(von, d.action || '/' + (http.zerlegeAdresse(von) || { pfad: '' }).pfad.replace(/^\//, ''));
      if (!ziel) return;
      if (d.methode === 'post') gehe(ziel, { methode: 'POST', body: http.formSchreiben(d.daten || {}) });
      else gehe(ziel.split('?')[0] + '?' + http.formSchreiben(d.daten || {}));
    };

    box.querySelector('#wbStart').addEventListener('click', los);
    box.querySelector('#wbAdr').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') los();
    });
    box.querySelector('#wbAdr').addEventListener('input', (ev) => {
      br.adresse = ev.target.value;
      /* Tippt jemand „https://" ins Feld, wandert es nach vorn — und
         zwar OHNE neu zu zeichnen: ein neues Fenster nähme dem Feld
         mitten im Tippen den Cursor. Nur der Vorsatz und der Text
         ändern sich. */
      const t = /^(https?):\/\//i.exec(ev.target.value);
      if (t) {
        br.schema = t[1].toLowerCase();
        br.adresse = ev.target.value.slice(t[0].length);
        ev.target.value = br.adresse;
        const chip = box.querySelector('#wbSchema');
        chip.className = 'wb-vor wb-vor--' + br.schema;
        chip.innerHTML = (br.schema === 'https' ? U.icon('schloss') : '') + br.schema + '://';
      }
    });
    box.querySelector('#wbSchema').addEventListener('click', () => {
      br.schema = br.schema === 'https' ? 'http' : 'https';
      ctx.render();
    });
    const sl = box.querySelector('#wbSchloss');
    if (sl) sl.addEventListener('click', () => { br.infoOffen = !br.infoOffen; ctx.render(); });
    box.querySelector('#wbZert').addEventListener('click', () => {
      br.ansicht = br.ansicht === 'zert' ? 'seite' : 'zert';
      ctx.render();
    });
    box.querySelector('#wbZurueck').addEventListener('click', () => {
      const vorige = br.verlauf.pop();
      if (!vorige) return;
      br.geladen = '';
      gehe(vorige);
    });

    const wz = box.querySelector('#wbWarnZurueck');
    if (wz) wz.addEventListener('click', () => { br.warn = null; ctx.render(); });
    const wf = box.querySelector('#wbWarnWeiter');
    if (wf) wf.addEventListener('click', () => {
      http.ausnahmeMerken(node, br.warn.ziel);
      const adr = br.warn.adr;
      br.warn = null;
      gehe(adr);
    });
  }

  /* ─── Die Warnseite ───────────────────────────────────────────
     Der Satz oben sagt in einem Atemzug, WAS los ist; darunter
     stehen die Fakten (was gewollt war, was das Zertifikat sagt);
     „Zurück" ist der große Knopf, „Trotzdem fortfahren" der kleine —
     und er heißt, was er ist: unsicher. Nach dem Fortfahren
     verschlüsselt die Verbindung trotzdem; man weiß nur nicht mehr,
     MIT WEM. */
  const WARN_KOPF = {
    unbekannt: 'Dein Gerät kennt die Zertifizierungsstelle nicht, die dieses Zertifikat unterschrieben hat. '
      + 'Jeder kann sich ein Zertifikat ausstellen — es zählt nur, wenn man der Stelle vertraut.',
    name: 'Das Zertifikat gehört zu einem anderen Namen als dem, den du wolltest. '
      + 'Vielleicht bist du bei dem falschen Server gelandet.',
    signatur: 'Die Unterschrift unter dem Zertifikat stimmt nicht. Es wurde verändert oder gefälscht.',
    beweis: 'Der Server zeigt ein Zertifikat vor, kann aber nicht beweisen, dass es ihm gehört. '
      + 'Vielleicht hat es jemand abgeschrieben.'
  };
  function warnSeite(w) {
    const z = w.tls.zertifikat || {};
    const z1 = http_ziel(w);
    return '<div class="wb-warn"><div class="wb-warn-k"><span class="wb-warn-ic">⚠</span>'
      + '<h3>Die Verbindung ist nicht sicher</h3></div>'
      + '<p>' + esc(WARN_KOPF[w.tls.code] || w.tls.text) + '</p>'
      + '<div class="wb-warn-f">'
      +   '<div><span>Du wolltest</span><code>' + esc(z1) + '</code></div>'
      +   '<div><span>Das Zertifikat gilt für</span><code>' + esc(z.name || '—') + '</code></div>'
      +   '<div><span>Ausgestellt von</span><code>' + esc(z.aussteller || '—') + '</code></div>'
      + '</div>'
      + '<div class="wb-warn-b"><button class="sw-ok zt-b" id="wbWarnZurueck">Zurück</button>'
      + '<button class="wb-weiter" id="wbWarnWeiter">Trotzdem fortfahren (unsicher)</button></div></div>';
  }
  const http_ziel = (w) => (w.ziel && w.ziel.host) || '—';

  /* ═══ Der Webserver ══════════════════════════════════════════ */

  const ZERT_WEB = { titel: 'Verschlüsselung (HTTPS)', haken: 'HTTPS anbieten (Port 443)',
                     hakenHinweis: 'HTTP auf Port 80 bleibt daneben offen.' };

  function bauServer(node, box, ctx) {
    const http = ctx.http;
    const c = ctx.netz.webConf(node);
    const D = window.Dateien;
    const dateien = D.list(node, http.ORDNER);
    const zugriffe = http.zugriffe(node);
    const belegt = ctx.netz.dienstLaeuft(node, 'stream');

    box.innerHTML =
      '<div class="dns-kopf">'
      +   '<span class="k-dot' + (c.on ? ' is-on' : '') + '"></span>'
      +   '<span class="dns-stand">' + (c.on ? 'läuft' : 'gestoppt') + '</span>'
      +   '<button class="btn' + (c.on ? ' btn--ghost' : '') + '" id="wsStart"'
      +     (!c.on && belegt ? ' disabled' : '') + '>'
      +     (c.on ? 'Beenden' : 'Starten') + '</button>'
      + '</div>'
      + (!c.on && belegt ? '<div class="k-hint">Port 80 ist belegt: auf diesem Gerät läuft der '
          + '<strong>Streaming-Server</strong>. Beende ihn zuerst.</div>' : '')
      /* Ordner und Port sind ANGABEN, keine Felder — sie sind
         festgelegt wie die MAC-Adresse. In Filius gibt es dafür
         ebenfalls kein Eingabefeld. */
      + '<div class="ws-fakten">'
      +   '<div><span>Ordner</span><code>' + esc(http.ORDNER) + '</code></div>'
      +   '<div><span>Port</span><code>' + http.PORT + '</code></div>'
      + '</div>'
      + window.ProgZert.abschnitt(node, ctx, c, ZERT_WEB)
      + '<div class="dt-sec">Dateien</div>'
      + (dateien.length
          ? '<div class="ws-dateien">' + dateien.map(e =>
              '<button class="ws-datei" data-datei="' + esc(e.pfad) + '">'
              + esc(e.name) + '</button>').join('') + '</div>'
              + '<div class="k-hint">Ein Klick öffnet die Datei im Datei-Explorer. '
              + '<code>' + esc(http.START) + '</code> ist die Seite, die kommt, wenn '
              + 'jemand nur die Adresse eingibt.</div>'
          : '<div class="k-hint">Der Ordner ist leer — dieser Server hat nichts '
            + 'anzubieten. Lege im Datei-Explorer eine <code>index.html</code> an.</div>')
      + '<div class="dt-sec">Zugriffe</div>'
      + (zugriffe.length
          ? '<div class="ws-log">' + zugriffe.slice(-12).reverse()
              .map(z => '<div>' + esc(z) + '</div>').join('') + '</div>'
          : '<div class="k-hint">Noch hat niemand gefragt.</div>');

    window.ProgZert.bindAbschnitt(box, node, ctx, c, ZERT_WEB);

    box.querySelector('#wsStart').addEventListener('click', () => {
      c.on = !c.on;
      ctx.sync();
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });

    box.querySelectorAll('[data-datei]').forEach(b => b.addEventListener('click', () => {
      window.ProgDateien.zeigen(node.id, b.dataset.datei);
      ctx.starte('dateien');
    }));
  }

  /* ═══ Der Streaming-Server ═══════════════════════════════════
     Zwei Angaben des Betreibers — der Name seines Dienstes (steht
     als Kopfzeile auf jeder Seite) und der Mailserver, über den die
     Passwörter verschickt werden — und die Wahl der zwei Filme. */

  function bauStream(node, box, ctx) {
    const c = ctx.netz.streamConf(node);
    const http = ctx.http;
    const filme = window.Stream.FILME;
    const zugriffe = http.zugriffe(node);
    const belegt = ctx.netz.dienstLaeuft(node, 'web');

    box.innerHTML =
      '<div class="dns-kopf">'
      +   '<span class="k-dot' + (c.on ? ' is-on' : '') + '"></span>'
      +   '<span class="dns-stand">' + (c.on ? 'läuft' : 'gestoppt') + '</span>'
      +   '<button class="btn' + (c.on ? ' btn--ghost' : '') + '" id="stStart"'
      +     (!c.on && belegt ? ' disabled' : '') + '>'
      +     (c.on ? 'Beenden' : 'Starten') + '</button>'
      + '</div>'
      + (!c.on && belegt ? '<div class="k-hint">Port 80 ist belegt: auf diesem Gerät läuft der '
          + '<strong>Webserver</strong>. Beende ihn zuerst.</div>' : '')
      + '<label class="ml-f ml-f--breit"><span>Name deines Dienstes:</span>'
      +   '<input class="f" id="stName" value="' + esc(c.name) + '" placeholder="z. B. Annas Flix" '
      +   'spellcheck="false" autocomplete="off"></label>'
      + '<label class="ml-f"><span>Mailserver (Name oder Adresse):</span>'
      +   '<input class="f" id="stMail" value="' + esc(c.mailserver) + '" placeholder="mail.schule.de" '
      +   'spellcheck="false" autocomplete="off"></label>'
      + '<div class="k-hint">Darüber schickt der Server seinen Kunden das Passwort.</div>'
      + window.ProgZert.abschnitt(node, ctx, c, ZERT_WEB)
      + '<div class="dt-sec">Filme</div>'
      + '<div class="ws-dateien">' + filme.map(f =>
          '<button class="ws-datei st-film' + (c.filme.indexOf(f.id) >= 0 ? ' is-on' : '')
          + '" data-film="' + f.id + '">' + esc(f.titel) + '</button>').join('') + '</div>'
      + '<div class="k-hint">Genau zwei Filme sind auf deiner Seite zu sehen.</div>'
      + '<div class="dt-sec">Farbschema</div>'
      + '<div class="ws-dateien">' + window.Stream.FARBEN.map(f =>
          '<button class="ws-datei st-farbe' + (c.farbe === f.id ? ' is-on' : '')
          + '" data-farbe="' + f.id + '"><span class="st-sw" style="background:' + f.akz
          + ';border-color:' + f.fl + '"></span>' + esc(f.name) + '</button>').join('') + '</div>'
      + '<div class="dt-sec">Kunden</div>'
      + (c.konten.length
          ? '<div class="ml-liste">' + c.konten.map((k, i) =>
              '<div class="ml-zeile ml-zeile--srv"><span>' + esc(k.name) + ' · ' + esc(k.email) + '</span>'
              + '<button class="fx-x" data-weg="' + i + '" title="Konto entfernen">×</button></div>').join('')
            + '</div>'
          : '<div class="k-hint">Noch niemand hat sich angemeldet.</div>')
      + '<div class="dt-sec">Zugriffe</div>'
      + (zugriffe.length
          ? '<div class="ws-log">' + zugriffe.slice(-12).reverse()
              .map(z => '<div>' + esc(z) + '</div>').join('') + '</div>'
          : '<div class="k-hint">Noch hat niemand gefragt.</div>');

    window.ProgZert.bindAbschnitt(box, node, ctx, c, ZERT_WEB);

    box.querySelector('#stStart').addEventListener('click', () => {
      c.on = !c.on;
      ctx.sync();
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });
    box.querySelector('#stName').addEventListener('input', (ev) => {
      c.name = ev.target.value.slice(0, 30);
      if (ctx.onDirty) ctx.onDirty();
    });
    box.querySelector('#stMail').addEventListener('input', (ev) => {
      c.mailserver = ev.target.value.trim();
      if (ctx.onDirty) ctx.onDirty();
    });
    /* Genau zwei: ein dritter Tipp ersetzt den ÄLTESTEN der beiden,
       ein Tipp auf einen, der schon an ist, tut nichts (es blieben
       sonst weniger als zwei). */
    box.querySelectorAll('[data-film]').forEach(b => b.addEventListener('click', () => {
      const id = +b.dataset.film;
      if (c.filme.indexOf(id) >= 0) return;
      c.filme = c.filme.concat([id]).slice(-2);
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
    box.querySelectorAll('[data-farbe]').forEach(b => b.addEventListener('click', () => {
      c.farbe = b.dataset.farbe;
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
    box.querySelectorAll('[data-weg]').forEach(b => b.addEventListener('click', () => {
      c.konten.splice(+b.dataset.weg, 1);
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
  }

  window.ProgWeb = { bauBrowser: bauBrowser, bauServer: bauServer, bauStream: bauStream };
})();
