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
  let br = { node: null, adresse: '', seite: null, fehler: '', laden: false, verlauf: [],
             rahmen: null, nonce: '', folge: null };

  function frisch(nodeId) {
    br = { node: nodeId, adresse: '', seite: null, fehler: '', laden: false, verlauf: [],
           rahmen: null, nonce: '', folge: null };
  }

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
      +     '<span class="wb-vor">http://</span>'
      +     '<input class="f" id="wbAdr" value="' + esc(br.adresse) + '" '
      +       'placeholder="www.schule.de" spellcheck="false" autocomplete="off">'
      +   '</div>'
      +   '<button class="k-add" id="wbStart">Start</button>'
      + '</div>'
      + '<div class="wb-seite" id="wbSeite"></div>'
      + '<div class="wb-fuss" id="wbFuss"></div>';

    const rahmen = box.querySelector('#wbSeite');
    const fuss = box.querySelector('#wbFuss');

    if (br.laden) {
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

    if (br.seite && br.seite.teile) {
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
      if (br.adresse && br.adresse !== adr) br.verlauf.push(br.adresse);
      br.adresse = adr;
      br.fehler = '';
      br.seite = null;
      br.laden = true;
      ctx.render();
      http.seiteHolen(node, adr, (r) => {
        br.laden = false;
        if (r.ok) {
          br.seite = r; br.fehler = '';
          if (r.ziel) br.adresse = http.adresseVon(r.ziel);
        } else { br.seite = null; br.fehler = r.grund; }
        ctx.render();
      }, opt);
    };

    const los = () => {
      const feld = box.querySelector('#wbAdr');
      const adr = feld.value.trim();
      if (!adr) return;
      gehe(adr);
    };

    /* Was die Brücke aus dem Rahmen meldet. */
    br.folge = (d) => {
      const von = br.adresse;
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
    box.querySelector('#wbZurueck').addEventListener('click', () => {
      const vorige = br.verlauf.pop();
      if (!vorige) return;
      box.querySelector('#wbAdr').value = vorige;
      br.adresse = '';
      los();
    });
  }

  /* ═══ Der Webserver ══════════════════════════════════════════ */

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
