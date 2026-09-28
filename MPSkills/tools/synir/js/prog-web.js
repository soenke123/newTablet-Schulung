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

   ⚠️ Für den Prüfstand heißt das: Aussagen über die gezeigte
   Seite gehen über `frameLocator`. Eine Prüfung sichert, dass ein
   eingeschmuggeltes `<script>` NICHT läuft.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  /* Je Gerät ein Browserzustand. Wie beim Datei-Explorer außerhalb
     der Bauen-Funktion, weil jedes `render()` das Fenster neu
     aufbaut — eine Adresse, die das nicht übersteht, wäre beim
     ersten Paket weg. */
  let br = { node: null, adresse: '', seite: null, fehler: '', laden: false, verlauf: [] };

  function frisch(nodeId) {
    br = { node: nodeId, adresse: '', seite: null, fehler: '', laden: false, verlauf: [] };
  }

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
      f.setAttribute('sandbox', '');
      f.setAttribute('title', 'Seite');
      f.srcdoc = br.seite.html;
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
            + esc(t.pfad) + ' <em>' + (t.status || '—') + '</em></span>').join('')
        + '</div>'
        + '<div class="k-hint">' + br.seite.teile.length + ' Anfrage'
        + (br.seite.teile.length === 1 ? '' : 'n') + ' für eine Seite — '
        + 'jede Datei wird einzeln geholt.</div>';
    } else fuss.innerHTML = '';

    const los = () => {
      const feld = box.querySelector('#wbAdr');
      const adr = feld.value.trim();
      if (!adr) return;
      if (br.adresse && br.adresse !== adr) br.verlauf.push(br.adresse);
      br.adresse = adr;
      br.fehler = '';
      br.seite = null;
      br.laden = true;
      ctx.render();
      http.seiteHolen(node, adr, (r) => {
        br.laden = false;
        if (r.ok) { br.seite = r; br.fehler = ''; }
        else { br.seite = null; br.fehler = r.grund; }
        ctx.render();
      });
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

    box.innerHTML =
      '<div class="dns-kopf">'
      +   '<span class="k-dot' + (c.on ? ' is-on' : '') + '"></span>'
      +   '<span class="dns-stand">' + (c.on ? 'läuft' : 'gestoppt') + '</span>'
      +   '<button class="btn' + (c.on ? ' btn--ghost' : '') + '" id="wsStart">'
      +     (c.on ? 'Beenden' : 'Starten') + '</button>'
      + '</div>'
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

  window.ProgWeb = { bauBrowser: bauBrowser, bauServer: bauServer };
})();
