/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — prog-zert.js   ·   Zertifikate in der Oberfläche
   ══════════════════════════════════════════════════════════════
   Die Protokolle stehen in `tls.js` und `zs.js`, kopflos prüfbar.
   Hier stehen drei Stücke Oberfläche, die zusammen HTTPS ergeben:

     `abschnitt`      der Kasten „Verschlüsselung" in den Fenstern von
                      Webserver, Streaming-Server und E-Mail-Server:
                      Zertifikat beantragen, abholen, HTTPS einschalten.
     `bauZS`          das Fenster der Zertifizierungsstelle: Name, DNS
                      für die Prüfung, Anträge mit „Freigeben".
     `vertrauenAnsicht`  die Vertrauensliste im Browser: welcher ZS
                      glaubt dieses Gerät.

   ── Wie es sich anfühlen soll ─────────────────────────────────
   Drei Zustände am Server, und man sieht sofort, in welchem man ist:
     kein Zertifikat → Formular (Name und ZS schon ausgefüllt, wenn
                       es sich aus dem Netz ergibt)
     Antrag wartet   → „Antrag Nr. 3 liegt bei …" und EIN Knopf:
                       Zertifikat abholen
     Zertifikat da   → 🔒 „gültig für …" und der Haken HTTPS
   Der Haken ist AUSGEGRAUT, solange das Zertifikat fehlt, und sagt
   warum. HTTP ist der Standard; HTTPS muss man sich verdienen.

   ⚠️ Alles, was etwas im Netz tut (Antrag, Abholen, Vertrauensliste
   füllen), braucht die laufende Uhr — die Pakete fahren ja nur dann.
   Ohne sie steht dieselbe Auskunft wie im Terminal da, statt dass
   ein Knopf stumm nichts tut.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;
  const esc = U.escapeHtml;

  const UHR_AUS = 'Dazu muss die Uhr laufen — oben auf Aktion.';

  /* ─── Was die Formulare vorbelegen ────────────────────────────
     „Er sollte das Wichtigste ausfüllen." Beides ist eine
     Bequemlichkeit der Oberfläche, KEIN Wissen, das im Netz
     steckt: ein Betreiber weiß, wie sein Server heißt und wo die
     ZS steht — hier schauen wir dafür in die Geräte DIESES Netzes. */
  const ipsVon = (n) => (n.nics || []).map(k => k.ip).filter(Boolean);

  function vorbelegterName(node, netz) {
    const meine = ipsVon(node);
    for (const n of netz.list()) {
      const recs = (n.dnsServer && n.dnsServer.records) || [];
      const r = recs.find(x => x && meine.indexOf(x.ip) >= 0 && x.name);
      if (r) return String(r.name).toLowerCase();
    }
    return '';
  }

  function vorbelegteZs(node, netz) {
    const zsn = netz.list().filter(n => n !== node && netz.dienstLaeuft(n, 'zs'));
    if (!zsn.length) return '';
    const z = zsn[0], ips = ipsVon(z);
    for (const n of netz.list()) {
      const recs = (n.dnsServer && n.dnsServer.records) || [];
      const r = recs.find(x => x && ips.indexOf(x.ip) >= 0 && x.name);
      if (r) return String(r.name).toLowerCase();
    }
    return ips[0] || '';
  }

  /* ═══ 1 · Der Kasten im Serverfenster ════════════════════════ */

  let zst = null;
  function zustand(node, ctx) {
    if (!zst || zst.node !== node.id) {
      zst = { node: node.id, name: null, zs: null, meldung: '', fehler: false, busy: false, info: false, neu: false };
    }
    if (zst.name === null) zst.name = vorbelegterName(node, ctx.netz);
    if (zst.zs === null) zst.zs = vorbelegteZs(node, ctx.netz);
    return zst;
  }

  const INFO_ABSCHNITT =
    '<strong>HTTPS braucht ein Zertifikat.</strong> Das stellt eine <em>Zertifizierungsstelle</em> '
    + '(ZS) aus — ein Programm auf einem Gerät im Netz. Du trägst den <em>Namen</em> deines Servers '
    + 'und die <em>Adresse der ZS</em> ein. Die ZS prüft, ob der Name wirklich auf dein Gerät zeigt '
    + '(sie besucht dich dafür kurz auf Port 80), und ihr Betreiber gibt den Antrag frei. Danach '
    + 'holst du das Zertifikat ab und kannst den Haken setzen. Ohne Zertifikat bleibt es bei HTTP.'
    + '<br><strong>Der Browser</strong> glaubt einem Zertifikat nur, wenn er die ZS kennt — das '
    + 'stellst du dort unter „Zertifikate" ein.';

  /* `was`: { titel, haken, hakenHinweis } */
  function abschnitt(node, ctx, conf, was) {
    const s = zustand(node, ctx);
    const zc = ctx.netz.zertConf(node);
    const hat = ctx.netz.zertGueltig(node);
    const an = zc.antrag;
    const wartet = an && an.status === 'wartet';
    const zeigeFormular = !wartet && (!hat || s.neu);

    let h = '<div class="dt-sec zt-kopf">' + esc(was.titel)
      + '<button class="ml-i' + (s.info ? ' is-on' : '') + '" id="ztInfo" title="Was ist ein Zertifikat?" aria-label="Erklärung">i</button></div>';
    if (s.info) h += '<div class="k-note">' + INFO_ABSCHNITT + '</div>';

    // 1 · Das Zertifikat — oder was ihm fehlt
    if (hat) {
      h += '<div class="zt-karte zt-karte--ok"><span class="zt-sl">🔒</span><div>'
        + '<strong>Zertifikat für ' + esc(zc.zert.name) + '</strong>'
        + '<small>ausgestellt von ' + esc(zc.zert.aussteller) + ' · Nr. ' + esc(String(zc.zert.nr)) + '</small>'
        + '</div></div>';
    } else if (wartet) {
      h += '<div class="zt-karte zt-karte--wart"><span class="zt-sl">⏳</span><div>'
        + '<strong>Antrag Nr. ' + esc(String(an.nr)) + ' für ' + esc(an.name) + '</strong>'
        + '<small>liegt bei ' + esc(an.zs) + ' — wartet auf die Freigabe dort</small>'
        + '</div></div>'
        + '<div class="zt-knoepfe"><button class="sw-ok zt-b" id="ztAbholen"' + (s.busy ? ' disabled' : '') + '>'
        +   (s.busy ? 'Einen Moment …' : 'Zertifikat abholen') + '</button>'
        + '<button class="sw-nein zt-b" id="ztZurueck" title="Antrag zurückziehen">Zurückziehen</button></div>';
    } else if (an && an.status === 'abgelehnt') {
      h += '<div class="zt-karte zt-karte--bad"><span class="zt-sl">✗</span><div>'
        + '<strong>Antrag Nr. ' + esc(String(an.nr)) + ' wurde abgelehnt</strong>'
        + '<small>' + esc(an.grund || '') + '</small></div></div>';
    } else {
      h += '<div class="zt-karte"><span class="zt-sl">🔓</span><div>'
        + '<strong>Noch kein Zertifikat</strong>'
        + '<small>Ohne Zertifikat spricht dieser Server nur HTTP — unverschlüsselt.</small></div></div>';
    }

    // 2 · Das Formular
    if (zeigeFormular) {
      h += '<label class="ml-f"><span>Name deines Servers:</span>'
        + '<input class="f" id="ztName" value="' + esc(s.name) + '" placeholder="www.schule.de" '
        + 'spellcheck="false" autocomplete="off"></label>'
        + '<label class="ml-f"><span>Zertifizierungsstelle (Name oder Adresse):</span>'
        + '<input class="f" id="ztZs" value="' + esc(s.zs) + '" placeholder="zs.schule.de" '
        + 'spellcheck="false" autocomplete="off"></label>'
        + '<button class="sw-ok zt-b" id="ztBeantragen"' + (s.busy ? ' disabled' : '') + '>'
        + (s.busy ? 'Antrag läuft …' : 'Zertifikat beantragen') + '</button>'
        + (hat && s.neu ? ' <button class="sw-nein zt-b" id="ztNeuAus">Abbrechen</button>' : '');
    } else if (hat) {
      h += '<div class="zt-knoepfe"><button class="sw-nein zt-b" id="ztNeu">Neues Zertifikat beantragen</button></div>';
    }

    if (s.meldung) h += '<div class="zt-meld' + (s.fehler ? ' zt-meld--fehler' : '') + '">' + esc(s.meldung) + '</div>';

    // 3 · Der Haken
    h += '<label class="zt-haken' + (hat ? '' : ' is-zu') + '">'
      + '<input type="checkbox" id="ztHaken"' + (conf.https && hat ? ' checked' : '') + (hat ? '' : ' disabled') + '>'
      + '<span><strong>' + esc(was.haken) + '</strong>'
      + '<small>' + (hat ? esc(was.hakenHinweis) : 'Erst mit Zertifikat — ohne eines bleibt es bei HTTP.') + '</small></span></label>';
    return h;
  }

  function bindAbschnitt(box, node, ctx, conf, was) {
    const s = zustand(node, ctx);
    const zc = ctx.netz.zertConf(node);
    const q = (id) => box.querySelector(id);
    const neu = () => { if (ctx.onDirty) ctx.onDirty(); ctx.render(); };

    const info = q('#ztInfo');
    if (info) info.addEventListener('click', () => { s.info = !s.info; ctx.render(); });

    const name = q('#ztName'), zsF = q('#ztZs');
    if (name) name.addEventListener('input', () => { s.name = name.value; });
    if (zsF) zsF.addEventListener('input', () => { s.zs = zsF.value; });

    const nb = q('#ztNeu');
    if (nb) nb.addEventListener('click', () => { s.neu = true; s.meldung = ''; ctx.render(); });
    const na = q('#ztNeuAus');
    if (na) na.addEventListener('click', () => { s.neu = false; s.meldung = ''; ctx.render(); });

    const b = q('#ztBeantragen');
    if (b) b.addEventListener('click', () => {
      if (!ctx.laeuft()) { s.meldung = UHR_AUS; s.fehler = true; ctx.render(); return; }
      s.busy = true; s.meldung = ''; ctx.render();
      ctx.zs.beantragen(node, s.name, s.zs, (fehler) => {
        s.busy = false;
        if (fehler) { s.meldung = fehler; s.fehler = true; }
        else { s.meldung = 'Der Antrag ist bei der Zertifizierungsstelle. Wenn ihr Betreiber ihn freigegeben hat, kannst du das Zertifikat abholen.'; s.fehler = false; s.neu = false; }
        neu();
      });
    });

    const a = q('#ztAbholen');
    if (a) a.addEventListener('click', () => {
      if (!ctx.laeuft()) { s.meldung = UHR_AUS; s.fehler = true; ctx.render(); return; }
      s.busy = true; s.meldung = ''; ctx.render();
      ctx.zs.abholen(node, (fehler, stand) => {
        s.busy = false;
        if (fehler) { s.meldung = fehler; s.fehler = true; }
        else if (stand === 'wartet') { s.meldung = 'Noch nicht freigegeben — der Betreiber der Zertifizierungsstelle muss den Antrag erst bestätigen.'; s.fehler = false; }
        else if (stand === 'abgelehnt') { s.meldung = ''; s.fehler = false; }
        else { s.meldung = 'Das Zertifikat ist da. Jetzt kannst du den Haken setzen.'; s.fehler = false; ctx.sync(); }
        neu();
      });
    });

    const z = q('#ztZurueck');
    if (z) z.addEventListener('click', () => { zc.antrag = null; s.meldung = ''; neu(); });

    const hk = q('#ztHaken');
    if (hk) hk.addEventListener('change', () => {
      conf.https = hk.checked;
      ctx.sync();
      neu();
    });
  }

  /* ═══ 2 · Das Fenster der Zertifizierungsstelle ══════════════ */

  let zsUi = { node: null, info: false };
  const STATUS = {
    prueft:      { t: 'wird geprüft', c: '' },
    wartet:      { t: 'Name geprüft ✓', c: 'ok' },
    fehler:      { t: 'Prüfung ✗', c: 'bad' },
    freigegeben: { t: 'Zertifikat ausgestellt', c: 'ok' },
    abgelehnt:   { t: 'abgelehnt', c: 'bad' }
  };

  const INFO_ZS =
    '<strong>Was eine Zertifizierungsstelle tut:</strong> Sie bestätigt, dass ein Name zu einem Server '
    + 'gehört — mit ihrer Unterschrift. Wer einen Antrag stellt, bekommt Besuch: die ZS fragt <em>ihren</em> '
    + 'DNS nach dem Namen und prüft, ob das Gerät hinter der Adresse ihr Einmalwort kennt. '
    + 'Stimmt das, steht der Antrag hier mit <em>Name geprüft ✓</em> — und <strong>du</strong> entscheidest, '
    + 'ob er freigegeben wird.<br>Damit ein Browser dieser ZS glaubt, trägt man sie dort unter '
    + '„Zertifikate" ein — und vergleicht den <em>Fingerabdruck</em> mit dem, der hier steht.';

  function bauZS(node, box, ctx) {
    if (zsUi.node !== node.id) zsUi = { node: node.id, info: false };
    const c = ctx.netz.zsConf(node);
    const fp = c.schluessel ? window.Tls.Krypto.fingerabdruck(c.schluessel) : '—';
    const antraege = c.antraege.slice().reverse();

    box.innerHTML =
      '<div class="dns-kopf">'
      +   '<span class="k-dot' + (c.on ? ' is-on' : '') + '"></span>'
      +   '<span class="dns-stand">' + (c.on ? 'läuft' : 'gestoppt') + '</span>'
      +   '<button class="ml-i' + (zsUi.info ? ' is-on' : '') + '" id="zsInfo" title="Was tut eine Zertifizierungsstelle?" aria-label="Erklärung">i</button>'
      +   '<button class="btn' + (c.on ? ' btn--ghost' : '') + '" id="zsStart">' + (c.on ? 'Beenden' : 'Starten') + '</button>'
      + '</div>'
      + (zsUi.info ? '<div class="k-note">' + INFO_ZS + '</div>' : '')
      + '<label class="ml-f ml-f--breit"><span>Name dieser Zertifizierungsstelle:</span>'
      +   '<input class="f" id="zsName" value="' + esc(c.name) + '" spellcheck="false" autocomplete="off"></label>'
      + '<label class="ml-f"><span>DNS-Server für die Prüfung:</span>'
      +   '<input class="f" id="zsDns" value="' + esc(c.dns) + '" placeholder="' + esc(node.dns || '8.8.8.8') + '" '
      +   'spellcheck="false" autocomplete="off"></label>'
      + '<div class="k-hint">Bei diesem DNS schlägt die ZS die Namen nach. Leer: der DNS dieses Geräts.</div>'
      + '<div class="ws-fakten">'
      +   '<div><span>Port</span><code>' + window.Zs.PORT + '</code></div>'
      +   '<div><span>Fingerabdruck</span><code id="zsFp">' + esc(fp) + '</code></div>'
      + '</div>'
      + '<div class="k-hint">Den Fingerabdruck liest du jedem vor, der dir vertrauen will — er vergleicht ihn im Browser.</div>'
      + '<div class="dt-sec">Anträge</div>'
      + (antraege.length
          ? '<div class="zt-liste">' + antraege.map(a => {
              const st = STATUS[a.status] || { t: a.status, c: '' };
              return '<div class="zt-antrag">'
                + '<div class="zt-ak"><strong>Nr. ' + a.nr + ' · ' + esc(a.name) + '</strong>'
                +   '<span class="zt-st zt-st--' + st.c + '">' + esc(st.t) + '</span></div>'
                + (a.status === 'wartet'
                    ? '<div class="zt-as">Der Name zeigt auf <code>' + esc(a.ip) + '</code>, und dort kannte jemand das Einmalwort.</div>'
                      + '<div class="zt-knoepfe"><button class="sw-ok zt-b" data-frei="' + a.nr + '">Freigeben</button>'
                      + '<button class="sw-nein zt-b" data-ab="' + a.nr + '">Ablehnen</button></div>'
                    : a.status === 'fehler' || a.status === 'abgelehnt'
                      ? '<div class="zt-as">' + esc(a.grund || '') + '</div>' : '')
                + '</div>';
            }).join('') + '</div>'
          : '<div class="k-hint">Noch hat niemand ein Zertifikat beantragt.</div>');

    box.querySelector('#zsInfo').addEventListener('click', () => { zsUi.info = !zsUi.info; ctx.render(); });
    box.querySelector('#zsStart').addEventListener('click', () => {
      c.on = !c.on;
      ctx.sync();
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });
    box.querySelector('#zsName').addEventListener('input', (ev) => {
      c.name = ev.target.value.slice(0, 40) || 'Zertifizierungsstelle';
      if (ctx.onDirty) ctx.onDirty();
    });
    box.querySelector('#zsDns').addEventListener('input', (ev) => {
      c.dns = ev.target.value.trim();
      if (ctx.onDirty) ctx.onDirty();
    });
    box.querySelectorAll('[data-frei]').forEach(b => b.addEventListener('click', () => {
      ctx.zs.freigeben(node, +b.dataset.frei);
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
    box.querySelectorAll('[data-ab]').forEach(b => b.addEventListener('click', () => {
      ctx.zs.ablehnen(node, +b.dataset.ab);
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
  }

  /* ═══ 3 · Die Vertrauensliste im Browser ═════════════════════ */

  let vt = { node: null, adresse: '', fund: null, meldung: '', fehler: false, busy: false };

  /* Füllt `el` (die Fläche, auf der sonst die Seite steht). `zurueck`
     bringt den Browser zur Seite zurück. */
  function vertrauenAnsicht(node, el, ctx, zurueck) {
    if (vt.node !== node.id) vt = { node: node.id, adresse: vorbelegteZs(node, ctx.netz), fund: null, meldung: '', fehler: false, busy: false };
    const liste = ctx.netz.vertrauen(node);

    el.innerHTML =
      '<div class="zt-vert">'
      + '<div class="zt-v-kopf"><h3>Zertifikate</h3><button class="sw-nein zt-b" id="vtZurueck">Zur Seite</button></div>'
      + '<div class="k-hint">Diesen Zertifizierungsstellen glaubt dieses Gerät. Ein Zertifikat zählt nur, '
      + 'wenn eine ZS aus dieser Liste es unterschrieben hat — der Browser kennt am Anfang keine.</div>'
      + (liste.length
          ? '<div class="zt-liste">' + liste.map(v =>
              '<div class="zt-antrag"><div class="zt-ak"><strong>' + esc(v.name) + '</strong>'
              + '<button class="fx-x" data-weg="' + esc(v.fp) + '" title="Nicht mehr vertrauen">×</button></div>'
              + '<div class="zt-as">Fingerabdruck <code>' + esc(v.fp) + '</code></div></div>').join('') + '</div>'
          : '<div class="zt-leer">Noch leer — dieses Gerät vertraut niemandem. HTTPS-Seiten zeigen deshalb eine Warnung.</div>')
      + '<div class="dt-sec">Zertifizierungsstelle hinzufügen</div>'
      + '<label class="ml-f"><span>Name oder Adresse der ZS:</span>'
      +   '<input class="f" id="vtAdr" value="' + esc(vt.adresse) + '" placeholder="zs.schule.de" spellcheck="false" autocomplete="off"></label>'
      + '<button class="sw-ok zt-b" id="vtSuchen"' + (vt.busy ? ' disabled' : '') + '>' + (vt.busy ? 'Suche …' : 'Zertifikat der ZS holen') + '</button>'
      + (vt.meldung ? '<div class="zt-meld' + (vt.fehler ? ' zt-meld--fehler' : '') + '">' + esc(vt.meldung) + '</div>' : '')
      + (vt.fund
          ? '<div class="zt-fund"><div><strong>' + esc(vt.fund.name) + '</strong></div>'
            + '<div class="zt-as">Fingerabdruck <code>' + esc(vt.fund.fp) + '</code></div>'
            + '<div class="zt-warn">Vergleiche diese Zahl mit der im Fenster der Zertifizierungsstelle. '
            + 'Stimmt sie nicht, hat sich jemand dazwischengeschoben — dann nicht vertrauen!</div>'
            + '<div class="zt-knoepfe"><button class="sw-ok zt-b" id="vtOk">Vertrauen</button>'
            + '<button class="sw-nein zt-b" id="vtNein">Abbrechen</button></div></div>'
          : '');

    const q = (id) => el.querySelector(id);
    q('#vtZurueck').addEventListener('click', zurueck);
    q('#vtAdr').addEventListener('input', (ev) => { vt.adresse = ev.target.value; });
    q('#vtSuchen').addEventListener('click', () => {
      if (!ctx.laeuft()) { vt.meldung = UHR_AUS; vt.fehler = true; ctx.render(); return; }
      vt.busy = true; vt.meldung = ''; vt.fund = null; ctx.render();
      ctx.zs.zsHolen(node, vt.adresse, (fehler, e) => {
        vt.busy = false;
        if (fehler) { vt.meldung = fehler; vt.fehler = true; }
        else if (liste.some(v => v.fp === e.fp)) { vt.meldung = '„' + e.name + '" steht schon in der Liste.'; vt.fehler = false; }
        else { vt.fund = e; vt.meldung = ''; }
        ctx.render();
      });
    });
    const ok = q('#vtOk');
    if (ok) ok.addEventListener('click', () => {
      ctx.zs.vertrauenAufnehmen(node, vt.fund);
      vt.meldung = '„' + vt.fund.name + '" steht jetzt in der Liste.'; vt.fehler = false; vt.fund = null;
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    });
    const nein = q('#vtNein');
    if (nein) nein.addEventListener('click', () => { vt.fund = null; ctx.render(); });
    el.querySelectorAll('[data-weg]').forEach(b => b.addEventListener('click', () => {
      ctx.zs.vertrauenEntfernen(node, b.dataset.weg);
      if (ctx.onDirty) ctx.onDirty();
      ctx.render();
    }));
  }

  window.ProgZert = {
    abschnitt: abschnitt, bindAbschnitt: bindAbschnitt,
    bauZS: bauZS, vertrauenAnsicht: vertrauenAnsicht,
    vorbelegterName: vorbelegterName, vorbelegteZs: vorbelegteZs
  };
})();
