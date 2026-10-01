/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — prog-vpn.js   ·   VPN-Server und VPN-Client
   ══════════════════════════════════════════════════════════════
   Die Logik steht in `vpn.js`, kopflos prüfbar. Hier stehen zwei
   Fenster:

     `bauServer`  Starten, Zertifikat (derselbe Kasten wie beim Web-
                  und Mailserver), Konten, wer gerade verbunden ist.
     `bauClient`  Server, Konto, Passwort, Verbinden. Steht der Tunnel,
                  zeigt es die Tunnel-Adresse; bei einem Zertifikats-
                  fehler die Warnung mit „Trotzdem verbinden".

   Der Server startet erst mit Zertifikat — ein Tunnel zu einem
   Server, dem man nicht glauben kann, ist keiner.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  const UHR_AUS = 'Dazu muss die Uhr laufen — oben auf Aktion.';

  const INFO_SERVER =
    '<strong>Was ein VPN-Server tut:</strong> Wer sich bei ihm anmeldet, schickt von da an <em>alles</em> '
    + 'verschlüsselt zu ihm. Der Server packt die Pakete aus und schickt sie in seinem Namen weiter — '
    + 'Webseiten sehen nur seine Adresse. Wer unterwegs mitliest, sieht nur, dass der Client mit dem Server '
    + 'spricht. <strong>Du</strong> dagegen siehst als Betreiber alles, was durch den Server geht, wenn es '
    + 'nicht schon selbst verschlüsselt ist (HTTPS).';
  const INFO_ZERT =
    '<strong>Der VPN-Server braucht ein Zertifikat.</strong> Es sagt dem Client: „Dieser Name gehört wirklich '
    + 'diesem Server" — sonst könnte sich jemand als Server ausgeben und alles mitlesen. Das Zertifikat '
    + 'stellt eine <em>Zertifizierungsstelle</em> aus (wie bei Webserver und E-Mail-Server): Name und Adresse '
    + 'der ZS eintragen, beantragen, nach der Freigabe abholen.';
  const INFO_CLIENT =
    '<strong>Was der Client tut:</strong> Er meldet sich beim VPN-Server an und bekommt eine Tunnel-Adresse. '
    + 'Danach geht <em>alles</em> durch den Tunnel — auch Namensabfragen. Der Server muss ein Zertifikat haben, '
    + 'und deine Vertrauensliste muss die Zertifizierungsstelle kennen (Knopf „Zertifikate").';

  /* ═══ Server ═════════════════════════════════════════════════ */

  let sUi = { node: null, info: false, user: '', pw: '', meldung: '' };

  function bauServer(node, box, ctx) {
    if (sUi.node !== node.id) sUi = { node: node.id, info: false, user: '', pw: '', meldung: '' };
    const c = ctx.netz.vpnServerConf(node);
    const hat = ctx.netz.zertGueltig(node);
    const leute = ctx.vpn ? ctx.vpn.teilnehmer(node) : [];

    box.innerHTML =
      '<div class="dns-kopf">'
      +   '<span class="k-dot' + (c.on ? ' is-on' : '') + '"></span>'
      +   '<span class="dns-stand">' + (c.on ? 'läuft' : 'gestoppt') + '</span>'
      +   '<button class="ml-i' + (sUi.info ? ' is-on' : '') + '" id="vsInfo" title="Was tut ein VPN-Server?" aria-label="Erklärung">i</button>'
      +   '<button class="btn' + (c.on ? ' btn--ghost' : '') + '" id="vsStart"' + (!c.on && !hat ? ' disabled' : '') + '>'
      +     (c.on ? 'Beenden' : 'Starten') + '</button>'
      + '</div>'
      + (sUi.info ? '<div class="k-note">' + INFO_SERVER + '</div>' : '')
      + (!hat && !c.on ? '<div class="k-hint">Erst ein Zertifikat holen — der Client prüft, ob er diesem Server glauben kann.</div>' : '')
      + '<div class="ws-fakten">'
      +   '<div><span>Port</span><code>' + window.Vpn.PORT + '</code></div>'
      +   '<div><span>Tunnel-Netz</span><code>10.8.0.0/24</code></div>'
      + '</div>'
      + '<div class="dt-sec">Konten</div>'
      + (c.konten.length
          ? '<div class="zt-liste">' + c.konten.map((k, i) =>
              '<div class="zt-antrag"><div class="zt-ak"><strong>' + esc(k.benutzer) + '</strong>'
              + '<button class="fx-x" data-weg="' + i + '" title="Konto löschen">×</button></div></div>').join('') + '</div>'
          : '<div class="k-hint">Noch kein Konto — ohne Konto kann sich niemand verbinden.</div>')
      + '<div class="vs-neu">'
      +   '<input class="f" id="vsUser" placeholder="Benutzer" value="' + esc(sUi.user) + '" spellcheck="false" autocomplete="off">'
      +   '<input class="f" id="vsPw" placeholder="Passwort" value="' + esc(sUi.pw) + '" spellcheck="false" autocomplete="off">'
      +   '<button class="sw-ok zt-b" id="vsAdd">Anlegen</button>'
      + '</div>'
      + (sUi.meldung ? '<div class="zt-meld zt-meld--fehler">' + esc(sUi.meldung) + '</div>' : '')
      + '<div class="dt-sec">Verbunden</div>'
      + (leute.length
          ? '<div class="zt-liste">' + leute.map(t =>
              '<div class="zt-antrag"><div class="zt-ak"><strong>' + esc(t.benutzer) + '</strong>'
              + '<span class="zt-st zt-st--ok">' + esc(t.ip) + '</span></div></div>').join('') + '</div>'
          : '<div class="k-hint">Im Moment ist niemand verbunden.</div>')
      + window.ProgZert.abschnitt(node, ctx, c, {
          titel: 'Zertifikat', ohneHaken: true, info: INFO_ZERT,
          ohne: 'Ohne Zertifikat kann dieser Server nicht starten.'
        });

    const q = (id) => box.querySelector(id);
    q('#vsInfo').addEventListener('click', () => { sUi.info = !sUi.info; ctx.render(); });
    q('#vsStart').addEventListener('click', () => {
      c.on = !c.on;
      ctx.sync();
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });
    q('#vsUser').addEventListener('input', (ev) => { sUi.user = ev.target.value; });
    q('#vsPw').addEventListener('input', (ev) => { sUi.pw = ev.target.value; });
    q('#vsAdd').addEventListener('click', () => {
      const u = sUi.user.trim(), p = sUi.pw;
      if (!u || !p) { sUi.meldung = 'Benutzer und Passwort eintragen.'; ctx.render(); return; }
      if (c.konten.some(k => k.benutzer === u)) { sUi.meldung = 'Dieser Benutzer existiert schon.'; ctx.render(); return; }
      c.konten.push({ benutzer: u, pwHash: U.pseudoHash(p) });
      sUi.user = ''; sUi.pw = ''; sUi.meldung = '';
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });
    box.querySelectorAll('[data-weg]').forEach(b => b.addEventListener('click', () => {
      c.konten.splice(+b.dataset.weg, 1);
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
    window.ProgZert.bindAbschnitt(box, node, ctx, c, { titel: 'Zertifikat', ohneHaken: true, info: INFO_ZERT });
  }

  /* ═══ Client ═════════════════════════════════════════════════ */

  let cUi = { node: null, info: false, busy: false, meldung: '', fehler: false, warnung: null, zert: false };

  function bauClient(node, box, ctx) {
    if (cUi.node !== node.id) cUi = { node: node.id, info: false, busy: false, meldung: '', fehler: false, warnung: null, zert: false };
    const vpn = ctx.vpn;
    const cf = ctx.netz.vpnClientConf(node);

    // Die Vertrauensliste liegt am Gerät — dieselbe wie im Browser.
    if (cUi.zert) {
      window.ProgZert.vertrauenAnsicht(node, box, ctx, () => { cUi.zert = false; ctx.render(); });
      return;
    }

    const st = vpn ? vpn.stand(node) : null;
    const an = !!(st && st.an);

    let h =
      '<div class="dns-kopf">'
      +   '<span class="k-dot' + (an ? ' is-on' : '') + '"></span>'
      +   '<span class="dns-stand">' + (an ? 'Tunnel steht' : 'nicht verbunden') + '</span>'
      +   '<button class="ml-i' + (cUi.info ? ' is-on' : '') + '" id="vcInfo" title="Was tut der VPN-Client?" aria-label="Erklärung">i</button>'
      +   '<button class="btn btn--ghost" id="vcZert" title="Welchen Zertifizierungsstellen glaubt dieses Gerät?">Zertifikate</button>'
      + '</div>'
      + (cUi.info ? '<div class="k-note">' + INFO_CLIENT + '</div>' : '');

    if (an) {
      const z = st.tls && st.tls.zertifikat;
      h += '<div class="zt-karte zt-karte--ok"><span class="zt-sl">◯</span><div>'
        + '<strong>Verbunden mit ' + esc(st.serverName) + '</strong>'
        + '<small>Tunnel-Adresse <code>' + esc(st.ip) + '</code>'
        + (z ? ' · Zertifikat von ' + esc(z.aussteller) : '') + '</small></div></div>'
        + '<div class="k-hint">Ab jetzt geht alles durch den Tunnel — Webseiten, Mail und DNS. '
        + 'Wer unterwegs mitliest, sieht nur den Verkehr zum VPN-Server.</div>'
        + '<div class="zt-knoepfe"><button class="sw-nein zt-b" id="vcTrennen">Trennen</button></div>';
    } else {
      h += '<label class="ml-f"><span>Server (Name oder Adresse):</span>'
        +   '<input class="f" id="vcServer" value="' + esc(cf.server) + '" placeholder="vpn.schule.de" spellcheck="false" autocomplete="off"></label>'
        + '<label class="ml-f"><span>Benutzer:</span>'
        +   '<input class="f" id="vcUser" value="' + esc(cf.benutzer) + '" spellcheck="false" autocomplete="off"></label>'
        + '<label class="ml-f"><span>Passwort:</span>'
        +   '<input class="f" id="vcPw" type="password" value="' + esc(cf.passwort) + '" spellcheck="false" autocomplete="off"></label>'
        + '<button class="sw-ok zt-b" id="vcVerbinden"' + (cUi.busy ? ' disabled' : '') + '>'
        +   (cUi.busy ? 'Verbinde …' : 'Verbinden') + '</button>';
      if (cUi.warnung) {
        h += '<div class="zt-karte zt-karte--bad"><span class="zt-sl">!</span><div>'
          + '<strong>Dem Server wird nicht geglaubt</strong>'
          + '<small>' + esc(cUi.warnung.text) + '</small></div></div>'
          + '<div class="zt-knoepfe"><button class="sw-nein zt-b" id="vcTrotzdem">Trotzdem verbinden (unsicher)</button></div>';
      } else if (cUi.meldung) {
        h += '<div class="zt-meld' + (cUi.fehler ? ' zt-meld--fehler' : '') + '">' + esc(cUi.meldung) + '</div>';
      }
    }
    box.innerHTML = h;

    const q = (id) => box.querySelector(id);
    q('#vcInfo').addEventListener('click', () => { cUi.info = !cUi.info; ctx.render(); });
    q('#vcZert').addEventListener('click', () => { cUi.zert = true; ctx.render(); });
    const tr = q('#vcTrennen');
    if (tr) tr.addEventListener('click', () => { vpn.trennen(node); cUi.meldung = ''; cUi.warnung = null; ctx.render(); });
    if (an) return;

    const feld = (id, key) => q(id).addEventListener('input', (ev) => {
      cf[key] = ev.target.value; cUi.warnung = null;
      if (ctx.onDirty) ctx.onDirty();
    });
    feld('#vcServer', 'server'); feld('#vcUser', 'benutzer'); feld('#vcPw', 'passwort');

    const los = (ausnahme) => {
      if (!ctx.laeuft()) { cUi.meldung = UHR_AUS; cUi.fehler = true; ctx.render(); return; }
      cUi.busy = true; cUi.meldung = ''; cUi.warnung = null; ctx.render();
      vpn.verbinden(node, { ausnahme: !!ausnahme }, (fehler, info) => {
        cUi.busy = false;
        if (fehler && info && info.zertifikat !== undefined && info.code && info.code !== 'kein-tls' && info.code !== 'alert') {
          cUi.warnung = info;
        } else if (fehler) { cUi.meldung = fehler; cUi.fehler = true; }
        else { cUi.meldung = ''; }
        ctx.render();
      });
    };
    q('#vcVerbinden').addEventListener('click', () => los(false));
    const tz = q('#vcTrotzdem');
    if (tz) tz.addEventListener('click', () => los(true));
  }

  window.ProgVpn = { bauServer: bauServer, bauClient: bauClient };
})();
