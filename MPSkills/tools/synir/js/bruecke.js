/* ══════════════════════════════════════════════════════════════
   SYNIR — bruecke.js   ·   Die Brücke in den Raum
   ══════════════════════════════════════════════════════════════
   SYNIR läuft in MPSkills in einem <iframe> (tools/synir/tool.js),
   genau wie Wild Clusters. Diese Datei ist die Tür im Rahmen: sie
   nimmt Befehle von draußen an und meldet nach draußen, was der
   Mensch hier tut. Den Server kennt sie nicht — das tut tool.js.

   Ohne Rahmen tut sie NICHTS: kein Zuhörer, kein DOM, keine Sperre
   (dieselbe Regel wie js/ui/bridge.js bei Wild Clusters). Wer die
   index.html direkt öffnet, merkt von ihr nichts.

   ── Nach innen (type 'synir:cmd') ─────────────────────────────
     menue:   { private, shared, sharedListe }   das Szenario-Menü
     laden:   { id, titel, aufgabe, netz }       ein Szenario auflegen
     watch:   { name, stand } | null             Spiegelung (Beamer)
     blind:   true | false                       Schleier (Tablet)
     gespeichert: { id }                         „Als Szenario" ging durch
     toast:   '…'
     vollbild: true | false                      Stand des Vollbilds (Knopf)
     cwwNetz: { prefix, backbone }               Adressbereich vom Server
     cwwRein: { pakete, unzustellbar,            Antwort auf einen Tausch
                verzeichnis, vergeben, bereiche }

   ── Nach außen (type 'synir:event', Feld ev) ──────────────────
     ready                                       Brücke steht
     pick     { id, lokal }                      Szenario gewählt
     share    { id, an, titel }                  (Lehrkraft)
     loeschen { id }                             (Lehrkraft)
     alsSzenario { id, name, titel, aufgabe, stand }  (Lehrkraft)
     stand    { stand }                          (Tablet, gebremst)
     lehrerstand { stand }                       (Lehrkraft, gebremst; nur für die Karte)
     selbst                                      Lehrkraft übernimmt
                                                 beim Zusehen
     vollbild                                    Knopf „Vollbild“ gedrückt
     cww      { pakete, namen?, aktiv }          was hinaus soll; `namen`
                                                 nur, wenn sie sich geändert
                                                 haben; `aktiv` = ein cww
                                                 liegt auf der Fläche

   ── Das Class Wide Web ────────────────────────────────────────
   Die Brücke trägt nur: Pakete aus dem Ausgang von internet.js
   hinaus, die Antwort des Servers hinein. Getauscht wird in
   tool.js. In der Spiegelung (Beamer sieht einem Kind zu) ist der
   Anschluss AUS — die Lehrkraft funkt nie im Namen eines Kindes.

   ── Die Spiegelung ────────────────────────────────────────────
   Das Muster von Wild Clusters (watchEid / sentGroups / takeover):
   Solange die Lehrkraft zusieht, legt jeder neue Stand des Kindes
   sich über den Beamer. Sobald sie SELBST etwas tut (`gemeldet` in
   app.js: Netz, Auftrag, Aktion), ist es ab da ihre Kopie — die
   Brücke hört auf zu laden und meldet `selbst`. Was sie ändert,
   geht nirgendwohin: die Lehrkraft schreibt nie in den Stand eines
   Kindes (siehe synir_work in Migration 0180).

   Vor dem ersten Zusehen wird der eigene Stand der Lehrkraft
   beiseitegelegt und beim Beenden (ohne Übernahme) zurückgelegt —
   wer kurz bei Mia hineinsieht, soll danach sein eigenes Netz
   wiederfinden.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (window.parent === window) return;

  const TAKT_MS = 1500;          // Bremse für „stand": wie Wild Clusters
  const DECKEL  = 250000;        // Zeichen; der Server nimmt 300 KB

  window.addEventListener('DOMContentLoaded', () => {
    const SIM = window.SIM;
    if (!SIM || !SIM.IM_RAUM) return;

    const ROLLE = SIM.ROLLE;
    const $ = (id) => document.getElementById(id);

    function post(ev, extra) {
      const m = Object.assign({ type: 'synir:event', ev }, extra || {});
      try { window.parent.postMessage(m, location.origin); } catch (e) { /* zu */ }
    }

    /* ─── Zustand ──────────────────────────────────────────── */
    let watching = null;         // { name } solange gespiegelt wird
    let eigenerStand = null;     // was vor dem Zusehen auflag
    let applying = false;        // ein Laden von draußen läuft
    let blind = false;
    let sharedAnzahl = 0;
    let lastSent = '';
    let sendTimer = 0;

    /* ─── Leere Fläche ─────────────────────────────────────── */
    function leerText() {
      if (ROLLE === 'presenter') {
        return 'Wähle oben rechts unter <strong>Szenario laden</strong> ein Netz und teile es mit der Klasse '
          + '— oder baue selbst eines.';
      }
      if (!sharedAnzahl) {
        return '<strong>Noch kein Szenario freigegeben.</strong><br>'
          + 'Du kannst trotzdem schon frei bauen: zieh ein Gerät aus der Leiste links auf die Fläche.';
      }
      return 'Oben rechts unter <strong>Szenario laden</strong> findest du, was deine Lehrkraft freigegeben hat.';
    }
    function leerZeigen() {
      const h = $('leerHinweis');
      if (!h) return;
      const leer = SIM.netz.count === 0 && !SIM.aktuell.aufgabe;
      h.hidden = !leer;
      if (leer) h.innerHTML = leerText();
    }
    SIM.netz.onChange(leerZeigen);

    /* ─── Den Stand nach draußen (nur Tablet) ──────────────── */
    function standText() {
      let st = SIM.standJson();
      let txt = JSON.stringify(st);
      if (txt.length > DECKEL && st.blobs) {
        /* Große hochgeladene Dateien bleiben auf dem Gerät. Am Beamer
           steht dann statt des Bildes ein Platzhalter — das Netz, um
           das es geht, kommt trotzdem an. */
        st = Object.assign({}, st);
        delete st.blobs;
        st.blobsWeg = true;
        txt = JSON.stringify(st);
      }
      return txt.length > DECKEL ? null : txt;
    }
    function senden() {
      sendTimer = 0;
      /* Die Lehrkraft meldet ihren eigenen Stand unter anderem Namen
         (`lehrerstand`): er landet NICHT in synir_work, sondern nur
         beim Pult — für die Karte. Beim Zusehen zeigt die Fläche das
         Netz eines Kindes, und das ist nicht ihr eigenes. */
      const teil = ROLLE === 'participant' && !blind;
      const lehr = ROLLE === 'presenter' && !watching;
      if (!teil && !lehr) return;
      const txt = standText();
      if (!txt || txt === lastSent) return;
      lastSent = txt;
      post(teil ? 'stand' : 'lehrerstand', { stand: JSON.parse(txt) });
    }
    function spaeterSenden() {
      clearTimeout(sendTimer);
      sendTimer = setTimeout(senden, TAKT_MS);
    }

    /* ─── Was der Mensch hier getan hat ────────────────────── */
    SIM.extern.beiAenderung.push((was) => {
      leerZeigen();
      if (applying) return;
      if (ROLLE === 'participant') { spaeterSenden(); return; }
      if (ROLLE === 'presenter' && watching) {
        // Übernahme: ab hier ist es die Kopie der Lehrkraft.
        watching = null;
        eigenerStand = null;
        SIM.speichern(true);
        post('selbst', { was });
      } else if (ROLLE === 'presenter') {
        spaeterSenden();
      }
    });

    /* ─── Rückwege des Menüs ───────────────────────────────── */
    SIM.extern.pick = (id) => {
      const lokal = SIM.eingebaut(id);
      if (lokal) {
        if (watching) zuseheEnde(false);
        if (SIM.szenarioLaden(lokal, { fragen: true })) post('pick', { id, lokal: true });
        return true;
      }
      if (!SIM.VORSCHAU && SIM.netz.count && !window.confirm('Das aktuelle Netz wird ersetzt. Weiter?')) return true;
      if (watching) zuseheEnde(false);
      post('pick', { id });
      return true;
    };
    if (ROLLE === 'presenter') {
      SIM.extern.share = (id, an, it) => post('share', { id, an, titel: (it && it.titel) || '' });
      SIM.extern.loeschen = (id) => post('loeschen', { id });
      SIM.extern.alsSzenario = (o) => post('alsSzenario', o);
    }

    /* ─── Spiegelung ───────────────────────────────────────── */
    /* Kam ein Stand ohne seine großen Dateien (`blobsWeg`, siehe
       standText), zeigt jede fehlende Datei am Beamer ein Schild
       statt eines leeren Rahmens: sichtbar, DASS dort etwas liegt,
       nur eben auf dem Tablet. */
    const PLATZHALTER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">'
      + '<rect width="320" height="200" rx="14" fill="#eef0f6" stroke="#c6cbdb" stroke-dasharray="8 6"/>'
      + '<text x="160" y="94" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#5a6376">'
      + 'Datei liegt nur auf dem Tablet</text>'
      + '<text x="160" y="122" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#8891a6">'
      + '(zu groß für die Übertragung)</text></svg>');
    function platzhalter(st) {
      if (!st || !st.blobsWeg) return st;
      const b = Object.assign({}, st.blobs || {});
      for (const n of st.nodes || []) {
        for (const k of Object.keys(n.dateien || {})) {
          const e = n.dateien[k] || {};
          for (const w of [e.bild, e.daten]) {
            if (typeof w === 'string' && w.indexOf('blob:') === 0 && b[w.slice(5)] == null) b[w.slice(5)] = PLATZHALTER;
          }
        }
      }
      return Object.assign({}, st, { blobs: b });
    }

    function laden(s) {
      applying = true;
      try { SIM.szenarioLaden(s, { still: true }); }
      finally { applying = false; }
      leerZeigen();
    }
    function zuseheEnde(zurueck) {
      const alt = eigenerStand;
      watching = null;
      eigenerStand = null;
      if (zurueck && alt) laden(alt);
      SIM.speichern(true);
      cwwModus();
      spaeterSenden();
    }
    function zusehen(w) {
      if (!w) { if (watching) zuseheEnde(true); return; }
      if (!watching) {
        eigenerStand = SIM.standJson();
        SIM.speichern(false);
      }
      watching = { name: w.name };
      cwwModus();
      if (w.stand) laden(platzhalter(w.stand));
    }

    /* ─── Das Class Wide Web ───────────────────────────────── */
    const INET = SIM.internet;
    let cwwConf = null;            // { prefix, backbone }, sobald der Server ihn vergeben hat
    let cwwTimer = 0;
    let lastNamen = '';
    let lastAktiv = null;

    function cwwModus() {
      if (!INET) return;
      INET.setModus(!cwwConf || SIM.VORSCHAU ? 'solo' : watching ? 'aus' : 'raum');
    }
    /* Ein kleiner Aufschub (30 ms): ein Ping-Paar, ein TCP-Handschlag
       oder ein Rundruf gehen dann in EINER Nachricht hinaus statt in
       fünf. */
    function cwwMelden(sofort) {
      if (!INET || !cwwConf || watching || SIM.VORSCHAU) return;
      if (cwwTimer && !sofort) return;
      clearTimeout(cwwTimer);
      cwwTimer = setTimeout(() => {
        cwwTimer = 0;
        if (watching) return;
        const namen = INET.veroeffentlicht();
        const nk = JSON.stringify(namen);
        const aktiv = !!SIM.netz.cwwVon();
        const extra = { pakete: INET.nehmen(), aktiv };
        if (nk !== lastNamen) extra.namen = namen;
        lastNamen = nk;
        lastAktiv = aktiv;
        post('cww', extra);
      }, sofort ? 0 : 30);
    }
    if (INET) {
      SIM.extern.cwwRaus = () => cwwMelden(false);
      /* Namen und „liegt ein cww da?" ändern sich ohne Paket — ein
         DNS-Eintrag, ein Dienst, der startet, ein cww, das gelöscht
         wird. Einmal je anderthalb Sekunden nachsehen ist billiger
         als an jeder dieser Stellen einen Haken anzubringen. */
      setInterval(() => {
        if (!cwwConf || watching || blind) return;
        const nk = JSON.stringify(INET.veroeffentlicht());
        const aktiv = !!SIM.netz.cwwVon();
        if (nk !== lastNamen || aktiv !== lastAktiv) cwwMelden(true);
      }, 1500);
    }

    /* ─── Schleier ─────────────────────────────────────────── */
    let schleier = null;
    function schleierBauen() {
      schleier = document.createElement('div');
      schleier.className = 'blind-schleier';
      schleier.setAttribute('role', 'alert');
      schleier.innerHTML =
          '<img class="blind-logo blind-logo--hell" src="bilder/synir-logo.png" alt="SYNIR">'
        + '<img class="blind-logo blind-logo--dunkel" src="bilder/synir-logo-dunkel.png" alt="SYNIR">'
        + '<p>Wir machen jetzt am Beamer weiter.</p>';
      document.body.appendChild(schleier);
    }
    function blindSetzen(an) {
      an = !!an;
      if (an === blind) return;
      blind = an;
      if (!schleier) schleierBauen();
      schleier.classList.toggle('is-on', an);
      document.body.classList.toggle('ist-blind', an);
      if (an) {
        // Die Uhr hält an, offene Fenster gehen zu: wer wieder
        // hinsieht, soll nicht in einen halben Dialog fallen.
        SIM.setModus('entwurf', true);
        document.querySelectorAll('.sy-dlg').forEach(d => d.remove());
        SIM.menue.zu();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      } else {
        spaeterSenden();
      }
    }
    // Der Schleier fängt Zeiger; Tasten fängt er hier ab — sonst
    // liefe Strg+Z oder das Terminal unter ihm weiter.
    const schlucken = (e) => { if (blind) { e.preventDefault(); e.stopPropagation(); } };
    ['keydown', 'keyup', 'keypress', 'wheel', 'paste', 'drop'].forEach(t =>
      document.addEventListener(t, schlucken, { capture: true, passive: false }));

    /* ─── Befehle von draußen ──────────────────────────────── */
    /* Vollbild: schalten tut der Rahmen draußen (tool.js). Er
       nimmt den ganzen Kasten ins Vollbild und hat einen Notbehelf
       für Tablets, die gar kein Vollbild können. */
    const vollBtn = $('vollBtn');
    if (vollBtn) vollBtn.addEventListener('click', () => post('vollbild'));

    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || e.origin !== location.origin) return;
      const m = e.data;
      if (!m || m.type !== 'synir:cmd') return;

      if (m.menue) {
        const c = m.menue;
        if (c.sharedListe) sharedAnzahl = c.sharedListe.length;
        SIM.menue.setzen({
          private: c.private,
          shared: c.shared,
          sharedListe: c.sharedListe
        });
        leerZeigen();
      }
      if (m.laden) {
        if (watching) zuseheEnde(false);
        laden(m.laden);
        // Das war die Wahl des Menschen hier (pick) — beim Tablet also
        // ein neuer Stand, der nach vorn gehört.
        spaeterSenden();
      }
      if ('watch' in m && ROLLE === 'presenter') zusehen(m.watch);
      if ('blind' in m && ROLLE === 'participant') blindSetzen(m.blind);
      if (m.gespeichert && m.gespeichert.id) {
        SIM.aktuell.id = m.gespeichert.id;
        SIM.save();
      }
      if (m.toast) SIM.toast(m.toast);
      if ('vollbild' in m) {
        const vb = $('vollBtn');
        if (vb) {
          vb.setAttribute('aria-pressed', String(!!m.vollbild));
          vb.title = m.vollbild ? 'Vollbild beenden' : 'Vollbild — nur SYNIR zeigen';
        }
      }

      if (m.cwwNetz && INET) {
        cwwConf = { prefix: m.cwwNetz.prefix | 0, backbone: String(m.cwwNetz.backbone || '') };
        SIM.netz.setInternet(cwwConf);
        cwwModus();
        lastNamen = '';
        lastAktiv = null;
        SIM.neuZeichnen();
        SIM.internetNeu();
        cwwMelden(true);
      }
      if (m.cwwRein && INET && cwwConf && !watching) {
        INET.rein(m.cwwRein);
        SIM.internetNeu();
      }
    });

    leerZeigen();
    post('ready', { rolle: ROLLE });
    // Der Stand, der beim Öffnen schon auf dem Gerät lag, gehört
    // gleich nach vorn — sonst sieht der Beamer ihn erst nach der
    // ersten Änderung.
    spaeterSenden();
  });
})();
