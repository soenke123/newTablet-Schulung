/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — app.js   ·   Zusammenbau
   ══════════════════════════════════════════════════════════════
   Verdrahtet Engine, Netz, Protokolle, Fläche und Leisten; hält
   den Stand im localStorage.

   ── Warum das Speicherformat jetzt schon zählt ────────────────
   Ein Szenario ist ein JSON-Objekt. Im Prototyp liegt es im
   localStorage. In MPSkills wird daraus ohne eine einzige
   Änderung am Format:

     · was die Lehrkraft als Szenario speichert (synir_scenarios)
     · was ein Kind zurückmeldet                (synir_work)
     · was der Beamer anzeigt, wenn er zusieht

   So ist es seit dem 2026-09-28 auch gekommen (Migration 0180,
   js/bruecke.js, tool.js; siehe LIESMICH „Im Raum").

   Genau das Muster von Wild Clusters. Deshalb wird hier nichts
   an Objekte gebunden, was nicht durch JSON.stringify passt.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  const U = window.NetUtil;

  /* ─── Im Raum oder für sich ─────────────────────────────────
     Dieselbe Seite läuft zweimal: für sich (index.html direkt
     geöffnet) und eingerahmt in MPSkills (tools/synir/tool.js).
     Eingerahmt steht in der Adresse, in welchem Raum und in
     welcher Rolle — und dann bekommt jeder Raum seinen EIGENEN
     Platz im Gerätespeicher. Sonst läge auf dem Tablet nach der
     Stunde in 7b das Netz aus 8c, und die Lehrkraft fände am
     Beamer das, woran sie gestern zu Hause gebaut hat.        */
  const PARAM   = new URLSearchParams(location.search);
  const IM_RAUM = window.parent !== window && !!PARAM.get('raum');
  const ROLLE   = !IM_RAUM ? 'solo'
                : (PARAM.get('rolle') === 'presenter' ? 'presenter' : 'participant');
  const KEY = 'netzsim.stand.v1' + (IM_RAUM ? ':' + ROLLE + ':' + PARAM.get('raum') : '');
  /* Das Schaufenster auf der MPSkills-Startseite (preview/synir.js):
     dort darf nichts im Gerät hängenbleiben und nichts von früher
     hereinragen — und keine Rückfrage das Drehbuch anhalten. */
  const VORSCHAU = IM_RAUM && PARAM.get('vorschau') === '1';

  /* ─── Tempostufen ───────────────────────────────────────────
     Geeicht an der Kabellaufzeit (100 ms, siehe KABEL_MS in
     netz.js). Rechts steht, wie lange ein Paket für EIN Kabel auf
     dem Bildschirm braucht — das ist die Zahl, die im Unterricht
     zählt:

       Zeitlupe       0,025 →  4 s je Kabel · ein Rahmen im Flug
       langsam        0,05  →  2 s
       normal         0,1   →  1 s   · Voreinstellung, Mitte
       schnell        0,4   →  250 ms
       Turbo          2     →  50 ms · Tabellen füllen, nicht zusehen

     ── Warum alles fünfmal langsamer ist als vorher ────────────
     Vorher war „normal" die Echtzeit (Tempo 1) und die Mitte des
     Reglers — physikalisch ehrlich und didaktisch falsch. Bei
     Echtzeit braucht ein Paket 100 ms je Kabel, ein Ping durch
     drei Geräte ist nach einer halben Sekunde durch, und von dem,
     was man sehen wollte, bleibt ein Flackern. Die ganze Anlage
     dieses Programms — der sichtbare Punkt, das leuchtende Kabel,
     die Reihenfolge der Kabel — setzt voraus, dass man mitkommt.

     Also ist „normal" jetzt das, was vorher „Zeitlupe" hieß: eine
     Sekunde je Kabel. Das ist die Geschwindigkeit, in der eine
     Klasse einem ARP-Request folgen kann, und damit die richtige
     Voreinstellung. Echtzeit gibt es weiter, sie heißt nur nicht
     mehr „normal" — Turbo ist das Doppelte davon.

     Der Regler läuft weiter von 0 bis 4, die Mitte (2) ist die
     Vorgabe. Dass das Langsame links UND die Vorgabe in der Mitte
     liegt, heißt: in beide Richtungen ist gleich viel Luft. */
  const TEMPI = [
    { v: 0.025, label: 'Zeitlupe' },
    { v: 0.05,  label: 'langsam' },
    { v: 0.1,   label: 'normal' },
    { v: 0.4,   label: 'schnell' },
    { v: 2,     label: 'Turbo' }
  ];
  const TEMPO_VORGABE = 2;

  window.addEventListener('DOMContentLoaded', () => {

    /* ─── Aufbau ──────────────────────────────────────────────*/
    const engine = new window.Engine({ seed: 20260924 });
    const netz   = new window.Netz(engine);
    const stack  = new window.Stack(engine, netz);

    /* Die Dienste (DHCP, DNS) stehen VOR dem Terminal, weil
       `ping www.schule.de` und `nslookup` sie brauchen. Ihr Weg
       zurück in die Oberfläche geht über onUpdate: eine geliehene
       Adresse muss sofort auf der Fläche stehen, sonst sieht eine
       Klasse den Erfolg nicht. Die Rückrufe greifen auf Dinge zu,
       die weiter unten entstehen — sie laufen erst, wenn alles
       gebaut ist. */
    const dienste = new window.Dienste(engine, netz, stack, {
      onUpdate: () => {
        neuZeichnen();
        if (panels) panels.renderKarte();
        if (geraet && geraet.isOpen) geraet.render();
      }
    });

    const mit    = new window.Mitschnitt(engine, netz);
    const term   = new window.Terminal(engine, netz, stack, dienste, {
      // Seit es `mkdir`, `touch` und `rm` gibt, ändert auch das
      // Terminal den Stand — und dann gehört das in den Verlauf.
      onDirty: () => aenderung('Dateien geändert')
    });

    const $ = (id) => document.getElementById(id);
    const refs = {
      traceBody: $('traceBody'), traceCount: $('traceCount'),
      traceGeraet: $('traceGeraet'), traceDir: $('traceDir'), traceModus: $('traceModus'),
      term: $('term'), termOut: $('termOut'), termInput: $('termInput'),
      termTitle: $('termTitle'), termClose: $('termClose'), termQuick: $('termQuick'),
      desktop: $('desktop'), dtHead: $('dtHead'), dtIcon: $('dtIcon'),
      dtName: $('dtName'), dtSub: $('dtSub'), dtPower: $('dtPower'),
      dtClose: $('dtClose'), dtApps: $('dtApps'), dtDock: $('dtDock'),
      dtWin: $('dtWin'), dtFenster: $('dtFenster'), dtScreen: $('dtScreen'),
      karte: $('karte'), karteHead: $('karteHead'), karteIcon: $('karteIcon'),
      karteKurz: $('karteKurz'), karteName: $('karteName'),
      kartePower: $('kartePower'), karteMehr: $('karteMehr'), karteClose: $('karteClose'),
      karteWarn: $('karteWarn'), karteBody: $('karteBody'),
      subBtn: $('subBtn'), subnetze: $('subnetze'),
      subnetzeBody: $('subnetzeBody'), subnetzeCount: $('subnetzeCount'),
      subnetzeClose: $('subnetzeClose'),
      wlt: $('wlt'), wltTabs: $('wltTabs'), wltBody: $('wltBody'),
      wltNeu: $('wltNeu'), wltAlle: $('wltAlle'), wltClose: $('wltClose')
    };

    /* Der Modus steht hier oben, weil fast alles darunter ihn
       liest. `umgebaut` merkt sich, ob im Entwurf etwas am Netz
       verändert wurde — dann läuft die Simulation beim Wechsel
       nach Aktion von vorn los. Ein Kabel umzustecken und dann
       eine ARP-Tabelle zu sehen, die noch den alten Weg kennt,
       ist der Sorte Fehler, die niemand findet. */
    let modus = null;
    let umgebaut = false;
    function gebaut() { if (modus === 'entwurf') umgebaut = true; }

    let panels = null, geraet = null;

    /* ─── Rückgängig ──────────────────────────────────────────────
       Der Verlauf hängt am Netz und an nichts sonst (verlauf.js).
       Er steht hier oben, weil `aenderung()` weiter unten von fast
       jedem Rückruf gerufen wird — und weil sein Rückruf beim
       Herstellen eines Standes die halbe Oberlfäche aufräumen muss.

       ⚠️ Gerufen wird `verlauf.merken()` an genau EINER Stelle
       (`aenderung`), und `aenderung` ersetzt überall das bisherige
       `save()`. Zwei Wege zum Speichern wären zwei Wege, den
       Verlauf zu vergessen. */
    let verlauf = null;

    /* Nach jeder Änderung am Netz: sichern, merken, und bei einem
       Umbau die laufende Simulation als überholt markieren.
       `label` steht in der Kurzmeldung beim Rückgängigmachen und
       entscheidet zugleich, was zu einem Schritt verschmilzt —
       zwölf Tastendrücke in einem Adressfeld sollen EIN Strg+Z
       sein (siehe verlauf.js). */
    function aenderung(label, umbau) {
      save();
      if (umbau) gebaut();
      if (verlauf) verlauf.merken(label);
      gemeldet('netz');
    }

    /* ─── Türen nach draußen ────────────────────────────────────
       Für die Brücke in den Raum (bruecke.js). Ohne Rahmen hängt
       hier niemand, und alles läuft wie vorher.

       `gemeldet` läuft nach JEDER Änderung, die der Mensch vor dem
       Bildschirm gemacht hat — am Netz, am Auftrag, oder weil er
       auf Aktion geschaltet hat. Das ist genau die Frage, die die
       Spiegelung stellt: „hat die Lehrkraft hier selbst etwas
       getan?" (dann gehört der Beamer ihr) bzw. „hat das Kind
       etwas getan?" (dann geht der Stand nach vorn).

       `extern.pick` usw. sind die Rückwege des Szenario-Menüs.
       Ohne Raum bleiben sie leer, und das Menü lädt selbst. */
    const extern = {
      beiAenderung: [],
      pick: null,          // (id, eintrag) → true, wenn draußen erledigt
      share: null,         // (id, an, eintrag)
      loeschen: null,      // (id, eintrag)
      alsSzenario: null,   // ({ id, name, titel, aufgabe, stand, neu })
      cwwRaus: null        // () → ein Paket wartet am cww auf den Raum
    };

    /* ─── Das Class Wide Web ────────────────────────────────────
       Der Anschluss hinter der Internet-Karte des cww (internet.js).
       Ohne Raum im Übungsbetrieb („solo"); im Raum schaltet ihn die
       Brücke um, sobald der Server einen Adressbereich vergeben hat. */
    const inet = window.Internet ? window.Internet.erzeugen(engine, netz, stack, {
      senden: () => { if (extern.cwwRaus) extern.cwwRaus(); }
    }) : null;
    /* Was 8.8.8.8 weiß, hat sich geändert: ein offenes Kärtchen auf
       dem Reiter „Internet" zeigt es gleich. Nur dann — ein Formular,
       in dem gerade jemand tippt, bleibt, wie es ist. */
    function internetNeu() {
      /* ⚠️ Nur im Entwurf: im Aktionsmodus räumt renderKarte die
         Gerätekärtchen ab (dort öffnet ein Gerät seine Oberfläche) —
         ein Auffrischen im Takt des Raums schloss dann das Kärtchen
         unter den Fingern. Aufgefallen im Raum-Prüfstand. */
      if (modus !== 'entwurf') return;
      const box = refs.karteBody;
      if (box && box.querySelector('.k-cww-bereich')
          && !(document.activeElement && box.contains(document.activeElement))) {
        panels.renderKarte();
      }
    }
    function gemeldet(was) {
      for (const f of extern.beiAenderung) {
        try { f(was); } catch (e) { console.warn('[app] Rückruf:', e.message); }
      }
    }

    /* Welches Szenario gerade aufliegt, und sein Auftrag. Beides
       gehört zum Stand (standJson) — vorher ging der Auftrag beim
       Speichern auf dem PC und beim Neuladen verloren, und wer ein
       gespeichertes Netz wieder öffnete, hatte die Aufgabe nicht
       mehr dazu. `id` ist „builtin:<schlüssel>", eine uuid (eigenes
       Szenario im Raum) oder null (selbst gebaut). */
    const aktuell = { id: null, titel: '', aufgabe: '' };

    const konfig = new window.Konfig(netz, stack, dienste);
    konfig.setInternet(inet);

    /* Die Liste der Adressräume steht hier oben, weil die Fläche
       sie beim Auswählen mitziehen muss — sie hebt das Netz des
       angetippten Geräts hervor. Gebaut wird sie erst unter
       „Subnetze"; bis dahin ist `subnetze` eine Attrappe, damit
       die Rückrufe der Fläche nicht ins Leere greifen. */
    let subnetze = { render() {}, platzieren() {} };
    /* Bis das Fenster wirklich entsteht (weiter unten — es braucht
       die Fläche, um ein Gerät auswählen zu können), steht hier ein
       Platzhalter. Ohne ihn müsste jede Stelle, die `render()` ruft,
       vorher fragen, ob es das Fenster schon gibt. */
    let weiterleitung = { render() {}, malen() {}, folgeAuswahl() {} };

    /* ─── Den Mitschnitt auf ein Gerät einschränken ───────────
       Im Entwurfsmodus leitet panels.js das aus den offenen
       Kärtchen ab (`traceFolgen`). Im Aktionsmodus gibt es keine,
       darum diese Stelle — und `null` löst die Einschränkung. */
    function mitschnittGeraet(id) {
      if ((mit.filter.node || null) === (id || null)) return;
      mit.setGeraet(id || null);
      if (panels) panels.renderTrace();
    }

    const flaeche = new window.Flaeche($('canvas'), engine, netz, {
      /* `still` kommt vom Aufsetzen des Zeigers: das Gerät ist
         ausgewählt (Ringe, Liste), aber ob daraus ein Tipp oder ein
         Zug wird, steht noch nicht fest. Erst der Tipp schlägt
         etwas auf — siehe onTapNode. */
      onSelect: (id, still) => {
        if (panels && !still) panels.showNode(id);
        subnetze.render();
        /* Der Reiter im Weiterleitungsfenster folgt der Auswahl —
           auch beim stillen Markieren: was unten steht, soll immer
           das Gerät sein, das oben hervorgehoben ist. */
        weiterleitung.folgeAuswahl(id);
      },
      onPickCable: (id) => panels && panels.showCable(id),
      /* ─── Ein Gerät wurde angetippt (und nicht gezogen) ──────
         Zweimal dasselbe Gerät antippen macht wieder zu. Das ist
         nicht nur bequem: bisher gab es gar keinen Weg, das Fenster
         mit derselben Geste loszuwerden, mit der man es geholt hat
         — man musste das × treffen, und das ist auf einem Tablet
         der kleinste Knopf auf dem Bildschirm.

         Welches Fenster gemeint ist, sagt der Modus: im Entwurf die
         Einstellungen neben dem Gerät, in der Aktion die
         Geräteoberfläche. */
      onTapNode: (id, g) => {
        if (modus === 'aktion') {
          /* Im Aktionsmodus bleibt es bei EINER Geräteoberfläche,
             auch mit Strg. Zwei Bildschirme nebeneinander wären
             nicht dasselbe wie zwei Einstellkärtchen: ein Kärtchen
             zeigt fünf Zeilen, ein Bildschirm ein ganzes
             Programmfenster mit Terminal. Die Frage „was hat E1 und
             was hat E2 eingestellt" wird im Entwurf gestellt. */
          /* Der Mitschnitt schränkt sich mit ein — das meldet
             `geraet.js` selbst über `onGeraet`, weil `close()`
             aus neun Richtungen gerufen wird. */
          if (geraet.isOpen && geraet.nodeId === id) geraet.close();
          else geraet.open(id);
          return;
        }
        /* ─── Strg-Klick: dazunehmen ──────────────────────────────
           Wörtlich verlangt: mehrere markieren UND bei allen das
           Kärtchen aufmachen. Das Markieren hat die Fläche schon
           getan (umschalten), hier kommt nur das Fenster dazu. */
        if (g && g.strg) { panels.dazuNode(id); return; }

        const s = panels.selection;
        if (s && s.kind === 'node' && s.id === id && panels.karteOffen) {
          panels.showNode(null);
          flaeche.select(null, true);
        } else {
          panels.showNode(id);
        }
      },
      /* Ein Rechteck aufgezogen: die Fläche hat markiert, ohne ein
         Fenster aufzuschlagen (so verlangt). Hier wird nur noch
         aufgeräumt — ein Kärtchen, dessen Gerät nicht mehr markiert
         ist, hat keinen Grund mehr, offen zu sein. */
      onRahmen: (anzahl) => {
        panels.nurBehalten(flaeche.auswahlIds);
        subnetze.render();
        if (anzahl) toast(anzahl === 1 ? '1 Gerät markiert.'
          : anzahl + ' Geräte markiert — zusammen verschiebbar, Strg+C kopiert.');
      },
      onMoved: (was) => {
        aenderung(was === 'verkabelt' ? 'verkabelt' : 'verschoben', was === 'verkabelt');
        subnetze.render();
      },
      onDrag: () => panels && panels.placeKarte(),
      /* ─── Der Ausschnitt hat sich bewegt ────────────────────
         Zoomen und Verschieben ändern, wo ein Gerät auf dem
         BILDSCHIRM liegt — und daran hängen drei Fenster, die in
         Bildschirmpunkten abgelegt sind: das Einstellkärtchen
         neben dem Gerät, die Subnetzliste und die Geräteober-
         fläche. Ohne diese Zeile bleiben sie stehen, während das
         Netz darunter wegfährt. */
      onView: (z) => {
        const l = $('zoomLabel');
        if (l) l.textContent = Math.round(z * 100) + ' %';
        if (panels) panels.placeKarte();
        subnetze.platzieren();
      },
      onToast: toast
    });

    /* Fläche und Liste gehören zusammen: wer eine Adresse ändert,
       ändert ein Subnetz, und dann müssen beide es wissen. Diese
       eine Zeile steht überall dort, wo bisher `flaeche.draw()`
       allein stand. */
    function neuZeichnen() { flaeche.draw(); subnetze.render(); weiterleitung.render(); cwwKnopf(); }
    /* Ist schon ein cww da, wird der Knopf grau — und erklärt
       sich beim Antippen trotzdem (das Kärtchen bleibt). */
    function cwwKnopf() {
      const b = document.querySelector('[data-add="cww"]');
      if (b) b.classList.toggle('is-aus', !netz.darfAnlegen('cww').ok);
    }

    panels = new window.Panels(refs, engine, netz, stack, mit, term, konfig, dienste, {
      problemOf: flaeche.problemOf,
      redraw: () => { neuZeichnen(); },
      onDirty: () => aenderung('Einstellung geändert', true),
      onKabelWeg: (id) => loeschenKabel(id),
      modus: () => modus,
      ankerOf: (kind, id) => flaeche.ankerOf(kind, id),
      deselect: () => flaeche.select(null),
      betonen: (id) => flaeche.betonen(id),
      toast: toast
    });

    /* ─── Die Weiterleitungstabelle unten ─────────────────────
       Sie steht hier und nicht weiter oben, weil sie beides
       braucht: die Fläche (ein Reiterklick wählt das Gerät aus) und
       die Kärtchen (dieselbe Zeile steht dort noch einmal). */
    weiterleitung = new window.Weiterleitung(refs, netz, stack, konfig, {
      select: (id) => flaeche.select(id),
      onDirty: () => aenderung('Weiterleitung geändert', true),
      redraw: () => neuZeichnen(),
      /* ⚠️ Zwei verschiedene Aufträge und deshalb zwei Rückrufe:
         beim TIPPEN darf das Kärtchen nur nachgemalt werden (sonst
         entsteht das Feld neu, in dem gerade jemand steht), beim
         Anlegen und Löschen einer Zeile muss es neu gebaut werden —
         es hat dann eine Zeile mehr oder weniger. */
      karteMalen: (n) => panels.wegeAuffrischen(n),
      karteBauen: () => panels.renderKarte(),
      nachPlatz: () => panels.placeKarte(),
      toast: toast
    });
    /* Und der Rückweg: der Knopf „Zur Weiterleitungstabelle" im
       Kärtchen. Ohne diese Zeile gibt es ihn gar nicht. */
    konfig.setWeiterleitung(weiterleitung);

    geraet = new window.Geraet(refs, engine, netz, stack, term, panels, konfig, dienste, {
      redraw: () => { neuZeichnen(); if (panels) panels.renderKarte(); },
      onDirty: () => aenderung('Einstellung geändert'),
      // Damit das Gerätefenster dem Gerät ausweichen kann, das man
      // gerade angetippt hat — nach oben, wenn es unten liegt.
      untenImBild: (n) => flaeche.untenImBild(n),
      // Die Geräteoberfläche ist im Aktionsmodus das, was
      // „dieses Gerät ansehen" heißt — der Mitschnitt folgt.
      onGeraet: (id) => mitschnittGeraet(id),
      toast: toast
    });

    /* ─── Der Verlauf ─────────────────────────────────────────
       Jetzt, wo Fläche und Fenster stehen, kann der Rückruf beim
       Herstellen eines Standes sie auch aufräumen.

       ⚠️ Nach `fromJSON` sind ALLE Geräteobjekte neu. Alles, was auf
       ein Gerät zeigt, zeigt damit ins Leere: das offene Kärtchen,
       die Geräteoberfläche, das Terminal, die fliegenden Punkte auf
       den Kabeln. Deshalb wird hier nicht „neu gezeichnet", sondern
       aufgeräumt — und zwar in dieser Reihenfolge, weil das
       Zeichnen die letzte Handlung sein muss. */
    verlauf = new window.Verlauf(netz, {
      onApply: (was, richtung) => {
        geraet.close();
        flaeche.clearDots();
        /* Die Kärtchen gehen NICHT alle zu: wer eine Adresse
           zurücknimmt, will das Feld noch sehen, in dem sie stand.
           Kärtchen zu Geräten, die es nicht mehr gibt, schließt
           renderKarte von selbst (renderEine findet sie nicht). */
        panels.renderKarte();
        /* Ein zurückgenommener Schritt ist ein Umbau wie jeder
           andere: hängt ein Kabel woanders, stimmt keine ARP-Tabelle
           mehr. Im Aktionsmodus heißt das „von vorn"; im Entwurf
           steht die Uhr ohnehin. */
        umgebaut = true;
        if (modus === 'aktion') vonVorn();
        neuZeichnen();
        save();
        gemeldet('netz');
        toast((richtung === 'zurueck' ? 'Rückgängig' : 'Wiederhergestellt')
          + (was ? ': ' + was : '') + ' · Strg+'
          + (richtung === 'zurueck' ? 'Y' : 'Z') + ' dreht es zurück.');
      }
    });

    /* ─── Subnetze ────────────────────────────────────────────
       Die Liste am linken Rand und der Knopf, der sie aufschlägt.
       Beides schaltet zusammen: es gibt keinen Zustand, in dem
       die Fläche bunt ist und die Legende fehlt — eine Farbe ohne
       Erklärung wäre Dekoration. */
    subnetze = window.Subnetze.Panel({
      box: refs.subnetze, body: refs.subnetzeBody,
      count: refs.subnetzeCount, aufgabe: $('aufgabe')
    }, netz, {
      selected: () => flaeche.selected,
      // Ein Kürzel in der Liste anzutippen wählt das Gerät aus —
      // „welches ist denn E3?" ist beim Suchen eines Fehlers die
      // häufigste Frage, und sie wird an der Liste gestellt.
      waehlen: (id) => { flaeche.select(id); }
    });

    /* Im Menü „Ansicht & Tools" sind Subnetze und Mitschnitt im
       Entwurf grau. Ein Eintrag, der gerade AN ist, bleibt bedienbar:
       sonst ließe er sich nach dem Wechsel in den Entwurf nicht mehr
       ausschalten. */
    function ansichtSync() {
      const entwurf = modus === 'entwurf';
      refs.subBtn.disabled = entwurf && !flaeche.zeigtSubnetze;
      $('traceBtn').disabled = entwurf;
    }

    function subnetzeZeigen(an) {
      /* Erst die Klasse am body: sie macht die Fläche schmaler
         (body.sub-open im Stylesheet). Die Fläche muss DANACH neu
         zeichnen, sonst rechnet sie das Gerätefenster noch gegen
         die alte Breite. */
      document.body.classList.toggle('sub-open', an);
      flaeche.setSubnetze(an);
      subnetze.setOffen(an);
      refs.subBtn.classList.toggle('is-on', an);
      refs.subBtn.setAttribute('aria-checked', String(an));
      ansichtSync();
      refs.subBtn.title = an
        ? 'Subnetze ausblenden'
        : 'Subnetze anzeigen — alle Adressräume farbig';
      /* Die Fläche wandert mit einem Übergang (.18 s). Vorher
         gemessen läge das Gerätefenster noch an der alten Stelle —
         derselbe Grund, aus dem der Mitschnitt es nachrücken
         lässt. */
      setTimeout(() => { panels.placeKarte(); subnetze.platzieren(); }, 220);
    }
    refs.subBtn.addEventListener('click',
      () => subnetzeZeigen(!flaeche.zeigtSubnetze));
    refs.subnetzeClose.addEventListener('click', () => subnetzeZeigen(false));

    /* ─── Takt ────────────────────────────────────────────────
       Die Tabellen folgen der Simulation: eine ARP-Tabelle, die
       sich beim Ping füllt, ist der halbe Unterricht. Nicht bei
       jedem Ereignis neu zeichnen — alle 400 ms reicht, sonst
       kostet das Zeichnen mehr als das Rechnen.

       Aufgefrischt wird nur der TABELLENKASTEN, nicht das ganze
       Formular: sonst zöge es jedem, der gerade eine Adresse
       tippt, das Feld unter den Fingern weg.

       Eine Anzeige der Simulationszeit gibt es hier nicht mehr.
       Sie stand in der Kopfzeile und war für den Unterricht nur
       eine Zahl, die zappelt. */
    let lastPaint = 0;
    engine.on('tick', () => {
      const t = performance.now();
      if (t - lastPaint > 400) {
        lastPaint = t;
        if (panels) panels.tabellenAuffrischen();
        if (geraet) geraet.tabellenAuffrischen();
      }
    });

    let traceDue = false;
    mit.onChange(() => {
      if (traceDue) return;
      traceDue = true;
      requestAnimationFrame(() => { traceDue = false; panels.renderTrace(); });
    });

    /* Meldungen der Protokolle, die keine Rahmen sind, gehen ins
       offene Terminal — dort sucht man sie.

       ⚠️ Das Terminal ist an ZWEI Stellen offen, und bis der
       Prüfstand es fand, kannte diese Stelle nur eine: das Kärtchen
       am Netzplan (`panels.termNode`). Router, Switch und
       Heimrouter haben aber keinen Bildschirm — ihr Terminal steht
       als Reiter im GERÄTEFENSTER, und genau dort sucht man, was
       ein Router gelernt hat. Ohne die zweite Bedingung schrieb
       `dhcp-ok` und alles Folgende dort nie etwas hin.

       Gefragt wird nach BEIDEN, denn zu jedem Zeitpunkt kann nur
       eines von beiden das Gerät zeigen — und welches, entscheidet
       nicht dieser Rückruf. */
    const termOffen = (id) =>
      (panels && panels.termNode === id)
      || (geraet && geraet.isOpen && geraet.nodeId === id);

    engine.on('event', (e) => {
      if (!e.node || !termOffen(e.node)) return;
      if (e.kind === 'unreachable')
        term.write(e.node, '   ⚠ ' + (e.why || 'Ziel nicht erreichbar.'), 'fail');
      /* ⚠️ Das TTL-Ereignis hatte bis zum 2026-09-27 gar keinen
         Empfänger. Wer eine Schleife gebaut hatte, sah im
         Mitschnitt das ICMP-Paket — aber auf dem Router selbst,
         wo man nachsieht, stand kein Wort darüber, dass er gerade
         etwas wegwirft. Genau dieselbe Lücke wie damals bei
         `dhcp-ok` und `arp-fail`. */
      else if (e.kind === 'ttl')
        term.write(e.node, '   ⚠ Zeit abgelaufen (TTL 0) — Paket an ' + e.dst
          + ' weggeworfen und Meldung zurückgeschickt.', 'warn');
      else if (e.kind === 'arp-fail')
        term.write(e.node, '   ⚠ ' + e.why, 'warn');
      else if (e.kind === 'note' && e.level === 'warn')
        term.write(e.node, '   ⚠ ' + e.text, 'warn');
      // DHCP läuft ohne Zutun — dann soll man auf dem Gerät auch
      // lesen können, dass es geklappt hat. Sonst erscheint eine
      // Adresse aus dem Nichts.
      // Adresse und Maske als zwei Angaben, nicht als „…/24":
      // Präfixschreibweise kommt in Filius nirgends vor, und die
      // Liste der Subnetze schreibt es genauso.
      else if (e.kind === 'dhcp-ok')
        term.write(e.node, '   ✓ ' + e.ip + ' · Netzmaske ' + e.mask
          + ' · vom DHCP-Server ' + e.server, 'ok');
      else if (e.kind === 'dhcp-fail')
        term.write(e.node, '   ⚠ ' + e.why, 'warn');
      /* ⭐ Und dasselbe für das automatische Routing: es läuft ohne
         Zutun, also muss auf dem Gerät zu lesen sein, was es
         gerade gelernt hat. Ein Router, in dessen Tabelle plötzlich
         Wege stehen, die niemand eingetragen hat, ist sonst genau
         die Art Magie, die dieses Programm vermeiden soll. Das
         Terminal steht beim Router als Reiter im Gerätefenster —
         daneben füllt sich die Tabelle, hier läuft mit, wann. */
      else if (e.kind === 'rip-neu')
        term.write(e.node, '   ✓ Weg zu ' + e.net + ' über ' + e.gw
          + ' · ' + e.hops + (e.hops === 1 ? ' Sprung' : ' Sprünge')
          + (e.besser ? ' (kürzer als vorher)' : ''), 'ok');
      else if (e.kind === 'rip-weg')
        term.write(e.node, '   ⚠ ' + e.net + ' ist unerreichbar — es redet niemand mehr '
          + 'darüber.', 'warn');
    });

    /* ─── Geräteleiste ────────────────────────────────────────
       Zwei Gesten, zwei Bedeutungen — dieselbe Unterscheidung wie
       auf der Fläche (flaeche.js):

         ziehen   legt das Gerät genau dort ab, wo es hingezogen
                  wurde. So macht es Filius auch.
         tippen   erklärt, was dieses Gerät tut. Und legt NICHTS an
                  — wer nachliest, was ein Switch ist, will keinen.

       Vorher legte der Klick das Gerät an eine ausgerechnete freie
       Stelle. Das war bequem und trotzdem falsch: die Stelle war
       nie die, an der man es haben wollte, und es gab keinen Weg,
       die Leiste zu lesen, ohne die Fläche zu verändern.       */

    /* Was in der Erklärung steht. Vier Absätze, je drei bis vier
       Sätze — mehr liest im Unterricht niemand, weniger beantwortet
       die Frage nicht. Wo Filius ein anderes Wort benutzt, steht es
       dabei: eine Lehrkraft, die von dort kommt, sucht sonst nach
       dem „Vermittlungsrechner". */
    const GERAETE_INFO = {
      /* ⚠️ „Laptop" ist der Name des BILDES, „Endgerät" der des
         Geräts. Auf der Fläche steht weiter E1, und in jedem
         gespeicherten Stand heißt es „Endgerät 1" — daran wird
         nichts geändert, dafür hängt zu viel daran (Aufträge,
         Kürzel, alte Dateien).

         Der letzte Satz sagt das ausdrücklich, denn sonst ist es
         genau die Sorte stiller Unstimmigkeit, über die eine
         Klasse stolpert: man zieht „Laptop" und bekommt „Endgerät
         1". Die Gruppe heißt „Endgeräte", ihre drei Mitglieder
         sind Bilder desselben Geräts. */
      host: { name: 'Laptop', ic: 'host',
        text: 'Ein Rechner am Netz — der Platz, an dem jemand sitzt. Er hat '
            + 'eine Netzwerkkarte mit MAC-Adresse und IP-Adresse, ein Terminal '
            + 'für Befehle wie ping und ipconfig, und Software, die man '
            + 'installieren kann. In Filius heißt er Rechner; auf der Fläche '
            + 'steht er als Endgerät 1, kurz E1.' },
      server: { name: 'Server', ic: 'server',
        text: 'Dasselbe Gerät wie der Laptop, nur mit einem anderen Bild — '
            + 'genau wie Rechner und Notebook in Filius. Er kann alles, was '
            + 'ein Endgerät kann. Server nennt man ihn, weil auf ihm die '
            + 'Dienste laufen, die die anderen benutzen: DNS, DHCP.' },
      /* Warum das Handy hier steht und nicht in einer eigenen
         Ecke: es ist die Gelegenheit, die Aussage „ein Server ist
         kein Gerätetyp" ein zweites Mal zu machen — diesmal mit
         einem Gerät, das jedes Kind in der Tasche hat. Wer
         begreift, dass sein Telefon dieselbe IP-Adresse, dieselbe
         Netzmaske und dasselbe Gateway braucht wie der Rechner im
         Computerraum, hat den halben Unterricht verstanden. */
      handy: { name: 'Handy', ic: 'handy',
        text: 'Wieder dasselbe Gerät — dieselbe Netzwerkkarte, dieselbe '
            + 'IP-Adresse, dasselbe Gateway. Zwei Dinge sind anders: sein '
            + 'Bildschirm sieht aus wie ein Telefon (Programme im Raster, '
            + 'Leiste unten, ein Programm im Vollbild), und es hat '
            + 'keine Kabelbuchse — ins Netz kommt es nur '
            + 'über WLAN. Lass dafür an einem Switch oder Heimrouter ein '
            + 'WLAN ausstrahlen und wähle den Namen am Handy aus. '
            + 'Filius kennt kein Handy; hier gibt es eines, weil es die Frage '
            + 'beantwortet, ob das eigene Telefon auch „so ein Rechner" ist.' },
      switch: { name: 'Switch', ic: 'switch',
        text: 'Verteilt Rahmen innerhalb EINES Netzes (Schicht 2). Er hat '
            + 'keine IP-Adresse und gehört zu keinem Subnetz — deshalb trägt '
            + 'er auf der Fläche auch keinen Farbring. Er merkt sich selbst, '
            + 'welche MAC-Adresse an welchem Anschluss hängt; bis er das weiß, '
            + 'schickt er einen Rahmen an alle hinaus. Er kann zusätzlich ein '
            + 'WLAN ausstrahlen — in Filius heißt er deshalb „Switch / WLAN".' },
      router: { name: 'Router', ic: 'router',
        text: 'Verbindet zwei oder mehr Netze (Schicht 3) — er ist die einzige '
            + 'Grenze zwischen Subnetzen. Für jedes Netz hat er eine eigene '
            + 'Netzwerkkarte mit eigener IP-Adresse; deshalb liegt er in '
            + 'mehreren Netzen und bekommt mehrere Farbringe. In Filius heißt '
            + 'er Vermittlungsrechner.' },
      /* Der Text sagt ausdrücklich, dass drei Geräte in einem
         Gehäuse stecken. Das ist der Grund, warum es dieses Gerät
         überhaupt gibt: „der Router zu Hause" ist gar kein Router,
         und wer das einmal auseinandergenommen gesehen hat,
         versteht anschließend jedes der drei Teile besser. */
      heimrouter: { name: 'Heimrouter', ic: 'heimrouter',
        text: 'Das Gerät aus dem eigenen Wohnzimmer — und in Wahrheit drei '
            + 'Geräte in einem Gehäuse: ein Router (oben WAN zum Anbieter, '
            + 'unten LAN ins Haus), ein Switch (die LAN-Buchsen teilen sich '
            + 'EINE Adresse) und ein WLAN-Zugangspunkt. Mit NAT übersetzt er '
            + 'die vielen Adressen innen auf die eine außen. Er kommt leer: '
            + 'die WAN-Seite fragt den Anbieter, alles andere trägst du ein. '
            + 'In Filius heißt er ebenfalls Heimrouter.' },
      /* Das Modem aus Filius — nur dass am anderen Ende die Netze
         der ganzen Klasse liegen. */
      cww: { name: 'Class Wide Web', ic: 'cww',
        text: 'Dein Anschluss ans Internet der Klasse. Du bekommst einen eigenen '
            + 'Adressbereich (ein /8, z. B. 67.0.0.0 bis 67.255.255.255) — nur '
            + 'Adressen daraus kommen hinaus. Alles, was nicht in deinem Bereich '
            + 'liegt, schickt das cww in die Wolke; nach innen trägst du die Wege '
            + 'selbst ein (oder schaltest RIP an). In der Wolke steht 8.8.8.8, ein '
            + 'öffentlicher DNS, der alle Namen kennt, die von draußen erreichbar '
            + 'sind. Jedes Netz hat höchstens ein cww. In Filius heißt es Modem.' }
    };

    /* Das Erklärkärtchen. Es hängt unter dem Knopf, den es
       erklärt — nicht in der Bildschirmmitte: die Frage „was ist
       das?" wird an einer bestimmten Stelle gestellt, und dort
       gehört die Antwort hin. */
    let infoFuer = null;
    function infoZeigen(kind, btn) {
      const d = GERAETE_INFO[kind];
      if (!d) return;
      infoFuer = kind;
      $('ginfoIcon').innerHTML = U.icon(d.ic);
      $('ginfoName').textContent = d.name;
      $('ginfoText').textContent = d.text;
      const box = $('ginfo');
      box.hidden = false;
      /* Seit die Leiste senkrecht am linken Rand steht, fliegt das
         Kärtchen nach RECHTS heraus und nicht mehr nach unten:
         unter dem Knopf stünde der nächste Knopf, und eingeklappt
         ist die Leiste keine 60 px breit — ein Kärtchen von 330 px
         hätte darin überhaupt keinen Platz.

         Es liegt deshalb in der Bühne (index.html) und misst gegen
         sie. Waagerecht setzt es an der Leiste an, senkrecht auf
         der Höhe des Knopfes; unten wird es an den Rand
         geschoben, damit es nicht aus dem Bild läuft. */
      const buehne = box.offsetParent || box.parentElement;
      const r = btn.getBoundingClientRect();
      const s = buehne.getBoundingClientRect();
      box.style.left = Math.round(U.clamp(
        r.right - s.left + 10, 8, Math.max(8, s.width - box.offsetWidth - 8))) + 'px';
      box.style.top = Math.round(U.clamp(
        r.top - s.top - 6, 8, Math.max(8, s.height - box.offsetHeight - 8))) + 'px';
    }
    function infoZu() { infoFuer = null; $('ginfo').hidden = true; }
    $('ginfoClose').addEventListener('click', infoZu);
    // Irgendwo sonst hin fassen macht zu. Ein Erklärkärtchen, das
    // stehen bleibt, verdeckt genau die Fläche, auf der man dann
    // arbeiten will.
    document.addEventListener('pointerdown', (ev) => {
      if (!infoFuer) return;
      if (ev.target.closest('#ginfo') || ev.target.closest('[data-add]')) return;
      infoZu();
    }, true);

    /* Das Schattengerät, das am Finger hängt, während man zieht.
       Ohne es zieht man ins Nichts und sieht erst beim Loslassen,
       ob etwas passiert — auf einem Tablet ist das der Unterschied
       zwischen „das geht" und „das geht wohl nicht". */
    let ziehGeraet = null;
    const ZUG = 5;

    document.querySelectorAll('[data-add]').forEach(b => {
      const kind = b.dataset.add;

      b.addEventListener('pointerdown', (ev) => {
        if (ev.button === 2) return;
        ev.preventDefault();
        b.setPointerCapture(ev.pointerId);
        ziehGeraet = { kind, btn: b, cx: ev.clientX, cy: ev.clientY, zug: false, geist: null };
      });

      b.addEventListener('pointermove', (ev) => {
        const z = ziehGeraet;
        if (!z || z.btn !== b) return;
        if (!z.zug) {
          if (Math.abs(ev.clientX - z.cx) <= ZUG && Math.abs(ev.clientY - z.cy) <= ZUG) return;
          z.zug = true;
          infoZu();
          document.body.classList.add('is-ziehen');
          const g = document.createElement('div');
          g.className = 'gdrag';
          g.innerHTML = '<span class="add-ic">' + U.icon(GERAETE_INFO[kind].ic) + '</span>'
            + U.escapeHtml(GERAETE_INFO[kind].name);
          document.body.appendChild(g);
          z.geist = g;
        }
        z.geist.style.left = ev.clientX + 'px';
        z.geist.style.top  = ev.clientY + 'px';
        // Zeigt an, ob hier abgelegt werden kann.
        z.geist.classList.toggle('is-ok', !!flaeche.ablegen(ev.clientX, ev.clientY));
      });

      const ende = (ev) => {
        const z = ziehGeraet;
        if (!z || z.btn !== b) return;
        ziehGeraet = null;
        document.body.classList.remove('is-ziehen');
        if (z.geist) z.geist.remove();

        if (!z.zug) {
          // Getippt: erklären. Zweimal tippen macht wieder zu —
          // dieselbe Regel wie beim Gerät auf der Fläche.
          if (infoFuer === kind) infoZu(); else infoZeigen(kind, b);
          return;
        }

        const p = flaeche.ablegen(ev.clientX, ev.clientY);
        if (!p) { toast('Dorthin kann kein Gerät. Auf die Fläche ziehen.'); return; }
        const darf = netz.darfAnlegen(kind);
        if (!darf.ok) { toast(darf.error); return; }
        const n = netz.addNode(kind, p.x, p.y);
        neuZeichnen();
        flaeche.select(n.id);
        aenderung(n.name + ' hinzugefügt', true);
        toast(n.name + ' hinzugefügt.');
      };
      b.addEventListener('pointerup', ende);
      b.addEventListener('pointercancel', () => {
        const z = ziehGeraet;
        if (!z || z.btn !== b) return;
        ziehGeraet = null;
        document.body.classList.remove('is-ziehen');
        if (z.geist) z.geist.remove();
      });
    });

    document.querySelectorAll('[data-tool]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.tool;
        flaeche.setTool(t);
        document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('is-on', x === b));
        $('toolHint').textContent = t === 'kabel'
          ? 'Von einem Gerät zum anderen ziehen.'
          : 'Geräte verschieben und auswählen.';
        /* Beim Verkabeln ist das Kärtchen im Weg — wortwörtlich:
           es liegt neben dem zuletzt angetippten Gerät, und man
           zieht mit der Maus quer über die Fläche. Beim Prüfen im
           Browser hat es genau das verhindert, ein Kabel vom
           Switch zum Router zu ziehen. Werkzeug wechseln heißt
           also auch: Einstellungen zuklappen. Mit dem Zeiger
           kommen sie zurück. */
        if (t === 'kabel') panels.closeKarte();
        else panels.renderKarte();
      });
    });

    /* ─── Die Leiste ein- und ausklappen ──────────────────────
       Der eine Knopf, der auch eingeklappt noch etwas anderes tut
       als „Gerät anlegen". Eingeklappt bleiben die Symbole stehen
       — eine Leiste, die ganz verschwindet, muss man erst
       wiederfinden, und auf einem Tablet gibt es dafür keinen
       Rand, an den man fahren könnte.

       Der Zustand hält über das Neuladen: wer am Beamer Platz
       braucht, will ihn nach dem nächsten Szenario auch noch
       haben. Er steht in einem eigenen Schlüssel und NICHT im
       Netzstand — sonst käme er mit einer Datei von jemand
       anderem mit, und das ist keine Eigenschaft des Netzes. */
    const RAIL_KEY = 'netzsim.leiste.v1';
    const rail = $('rail'), railFold = $('railFold');

    function leisteSetzen(zu) {
      rail.classList.toggle('is-zu', zu);
      railFold.setAttribute('aria-expanded', String(!zu));
      railFold.title = zu ? 'Leiste ausklappen' : 'Leiste einklappen';
      railFold.querySelector('.rail-fold-ic').textContent = zu ? '›' : '‹';
      if (zu) infoZu();
      try { localStorage.setItem(RAIL_KEY, zu ? '1' : '0'); } catch (e) {}
      /* Die Fläche ist jetzt breiter oder schmaler. Sie rechnet
         ihren Ausschnitt selbst nach (ResizeObserver), aber die
         Fenster darüber hängen an Bildschirmpunkten — die müssen
         nach dem Übergang (.18 s) noch einmal gelegt werden. */
      setTimeout(() => { panels.placeKarte(); subnetze.platzieren(); }, 220);
    }
    railFold.addEventListener('click', () => leisteSetzen(!rail.classList.contains('is-zu')));
    try { leisteSetzen(localStorage.getItem(RAIL_KEY) === '1'); } catch (e) {}

    /* ─── Der Ausschnitt ──────────────────────────────────────
       Drei Knöpfe und eine Zahl. Die Zahl ist zugleich der Knopf
       „wieder normal groß": eine Prozentanzeige, die man anfassen
       kann, spart den vierten Knopf und ist genau dort, wo man
       hinsieht, wenn man sich verzoomt hat. */
    document.querySelectorAll('[data-zoom]').forEach(b => {
      b.addEventListener('click', () => {
        const z = b.dataset.zoom;
        if (z === 'in') flaeche.zoomIn();
        else if (z === 'out') flaeche.zoomOut();
        else flaeche.einpassen();
      });
    });
    $('zoomLabel').addEventListener('click', () => flaeche.zoomZurueck());

    /* ─── Steuerung der Uhr ───────────────────────────────────*/
    const speedEl = $('speed'), speedLabel = $('speedLabel');
    function applySpeed() {
      const t = TEMPI[+speedEl.value];
      engine.speed = t.v;
      speedLabel.textContent = t.label;
      speedEl.title = 'Tempo: ' + t.label;
    }
    speedEl.addEventListener('input', applySpeed);
    speedEl.value = String(TEMPO_VORGABE);
    applySpeed();

    const playBtn = $('play');
    function setRunning(on) {
      // Im Entwurf läuft die Uhr nie. Sonst könnte ein Netz
      // halbverkabelt losrechnen und Fehlermeldungen ausspucken,
      // die nur daher rühren, dass man noch baut.
      if (on && modus !== 'aktion') on = false;
      if (on) engine.start(); else engine.stop();
      playBtn.textContent = on ? '❚❚' : '▶';
      playBtn.title = on ? 'anhalten' : 'weiterlaufen lassen';
      document.body.classList.toggle('is-running', on);
    }
    playBtn.addEventListener('click', () => setRunning(!engine.running));
    $('stepBtn').addEventListener('click', () => {
      engine.stepOnce();
      setRunning(false);
    });

    $('resetBtn').addEventListener('click', () => vonVorn());

    /* Uhr auf null, alles Gelernte weg, Mitschnitt leer — das
       Netz bleibt, wie es ist. Das ist der Knopf für „zeig das
       noch einmal", und der wird im Unterricht oft gedrückt. */
    /* ─── Der Startwert ────────────────────────────────────────
       ⭐ Jeder Durchgang würfelt neu. Vom Nutzer verlangt: bei zwei
       DHCP-Servern soll „für uns Menschen nicht vorhersehbar"
       sein, wer von wem seine Adresse bekommt — und das wäre es,
       wenn derselbe Startwert jedes Mal denselben Ablauf ergäbe.

       Die Quelle ist die Uhr und nicht `Math.random`. Die Regel
       aus util.js („Math.random darf in diesem Programm nirgends
       vorkommen") bleibt damit gewahrt: der Würfel selbst ist
       weiterhin der aus `engine.rand`, er bekommt nur bei jedem
       Durchgang einen anderen Anfang.

       ⚠️ `NETSIM_SEED` hält ihn fest. Das brauchen die Prüfstände —
       eine Prüfung, die eine bestimmte Adresse erwartet, wäre
       sonst Glückssache. Es ist zugleich der Weg, einen Durchgang
       noch einmal genau so zu zeigen. */
    function neuerStartwert() {
      if (window.NETSIM_SEED != null) return (window.NETSIM_SEED >>> 0);
      return (Date.now() >>> 0);
    }

    function vonVorn() {
      engine.reset(neuerStartwert());
      for (const n of netz.list()) stack.clearTables(n);
      /* Auch die Dienste fangen von vorn an: Leihverträge weg,
         gelernte Namen weg, und bei jedem Anschluss, der seine
         Adresse holt, die Adresse weg. Ohne den letzten Punkt
         zeigt dieser Knopf bei DHCP gar nichts — jeder Rechner
         hätte seine Adresse schon und fragte nicht mehr. */
      dienste.reset();
      flaeche.clearDots();
      mit.clear();
      panels.renderTrace();
      umgebaut = false;
      setRunning(modus === 'aktion');
      if (modus === 'aktion') dienste.start();
      neuZeichnen();
    }

    /* ─── Entwurf ⇄ Aktion ────────────────────────────────────
       Die zentrale Unterscheidung, und die einzige Stelle, an
       der sie gesetzt wird. Alles andere liest nur `modus` oder
       hängt am body-Attribut im Stylesheet. */
    function setModus(m, still) {
      if (m === modus) return;
      modus = m;
      document.body.dataset.modus = m;
      document.querySelectorAll('[data-modus]').forEach(
        b => b.classList.toggle('is-on', b.dataset.modus === m));
      flaeche.setModus(m);

      /* Die Geräteleiste folgt dem Modus: im Entwurf ist sie draußen
         (dort wird gebaut), in der Aktion eingeklappt (dort stünde
         nur ein Hinweis). Wer sie danach von Hand umlegt, behält das
         bis zum nächsten Wechsel. */
      leisteSetzen(m === 'aktion');
      ansichtSync();

      // Die Erklärung gehört zur Geräteleiste, und die gibt es nur
      // im Entwurf. Bliebe sie offen, hinge sie über einer Leiste,
      // die gar nicht mehr da ist.
      infoZu();

      if (m === 'entwurf') {
        setRunning(false);
        geraet.close();
        // Die Dienste stehen still, solange gebaut wird. Ein
        // DHCP-Server, der während des Verkabelns Adressen
        // verteilt, verteilt sie ins Halbfertige.
        dienste.stop();
        traceZeigen(false);
        if (!still) toast('Entwurf — bauen, verkabeln, Adressen eintragen. Die Uhr steht.');
      } else {
        // Aktion schaltet nur der Mensch (alle Aufrufe von hier aus
        // setzen den Entwurf) — und am Beamer heißt das „die
        // Lehrkraft macht selbst weiter".
        gemeldet('modus');
        panels.closeKarte();
        /* ⭐ JEDES Mal von vorn, nicht nur nach einem Umbau. Vom
           Nutzer verlangt: „Jedes Mal, wenn der Actions-Modus
           gestartet wird, sollen die IP-Adressen vom DHCP neu
           vergeben werden."

           Und es muss das ganze `vonVorn()` sein, nicht bloß
           `dienste.reset()`: neue Adressen zu verteilen, während
           ARP- und MAC-Tabellen noch die alten enthalten, wäre ein
           halber Zustand — ein Ping ginge dann an eine MAC-Adresse,
           hinter der inzwischen jemand anderes sitzt, und der
           Fehler sähe aus wie ein Fehler des Kindes.

           ⚠️ Das kostet den Mitschnitt bei jedem Wechsel nach
           Aktion. Das ist die ehrliche Bedeutung von „die
           Adressen werden neu vergeben": es ist ein neuer
           Durchgang, und ein neuer Durchgang fängt mit einem
           leeren Blatt an. */
        vonVorn();
        if (!still) {
          toast(umgebaut
            ? 'Aktion — von vorn, weil sich am Netz etwas geändert hat.'
            : 'Aktion — von vorn. Die Uhr läuft, DHCP vergibt neu.');
        }
        setRunning(true);
        dienste.start();
        traceZeigen(traceWunsch);
      }

      panels.renderKarte();
      neuZeichnen();
    }

    document.querySelectorAll('[data-modus]').forEach(b => {
      b.addEventListener('click', () => setModus(b.dataset.modus));
    });

    /* ─── Mitschnitt-Leiste ───────────────────────────────────
       Ein Knopf oben neben „Subnetze", nur im Aktionsmodus. Die
       Leiste unten gibt es nur, solange er an ist — im Entwurf gar
       nicht (dort läuft nichts, was man mitschneiden könnte). Der
       Wunsch überlebt den Umweg über den Entwurf: `traceWunsch`. */
    let traceWunsch = false;
    function traceZeigen(an) {
      const open = !!an && modus === 'aktion';
      document.body.classList.toggle('trace-open', open);
      $('traceBtn').classList.toggle('is-on', open);
      $('traceBtn').setAttribute('aria-checked', String(open));
      if (open) panels.renderTrace();
      // Der Mitschnitt macht die Fläche niedriger — das Kärtchen
      // hing danach halb darunter.
      setTimeout(() => panels.placeKarte(), 260);
    }
    $('traceBtn').addEventListener('click', () => {
      traceWunsch = !document.body.classList.contains('trace-open');
      traceZeigen(traceWunsch);
    });

    // Fenstergröße geändert: das SVG wird neu eingepasst, also
    // liegt das Gerät woanders — und das Kärtchen mit ihm.
    window.addEventListener('resize', () => {
      panels.placeKarte();
      subnetze.platzieren();
    });
    $('traceClear').addEventListener('click', () => { mit.clear(); panels.renderTrace(); });
    $('traceFilter').addEventListener('input', (e) => {
      mit.setFilter({ text: e.target.value });
      panels.renderTrace();
    });

    /* ─── Gerät, Richtung, Ansicht ────────────────────────────
       Drei Schalter, die alle dasselbe tun: den Filter ändern und
       neu zeichnen. Die Beschriftungen setzt `kopfAbgleich` in
       panels.js — hier steht nur, was ein Klick bedeutet. */
    refs.traceGeraet.addEventListener('click', () => mitschnittGeraet(null));
    refs.traceDir.addEventListener('click', () => {
      mit.setFilter({ dir: mit.filter.dir === 'beide' ? 'raus' : 'beide' });
      panels.renderTrace();
    });
    refs.traceModus.addEventListener('click', () => {
      mit.setModus(mit.modus === 'schichten' ? 'zeilen' : 'schichten');
      panels.renderTrace();
    });
    document.querySelectorAll('[data-proto]').forEach(b => {
      b.addEventListener('click', () => {
        const p = b.dataset.proto || null;
        document.querySelectorAll('[data-proto]').forEach(x => x.classList.toggle('is-on', x === b));
        mit.setFilter({ proto: p });
        panels.renderTrace();
      });
    });
    $('traceCopy').addEventListener('click', async () => {
      const txt = mit.toText();
      try {
        await navigator.clipboard.writeText(txt);
        toast('Mitschnitt kopiert.');
      } catch (e) {
        // Ohne sicheren Kontext (file://) gibt es keine
        // Zwischenablage — der alte Weg über ein Textfeld schon.
        const ta = document.createElement('textarea');
        ta.value = txt; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast('Mitschnitt kopiert.'); }
        catch (e2) { toast('Kopieren geht hier nicht.'); }
        ta.remove();
      }
    });

    /* ─── Speichern ───────────────────────────────────────────
       Gedrosselt: jeder Tastendruck im Inspektor löst ein
       Speichern aus, und localStorage ist synchron. */
    /* ⭐ Der vollständige Stand: das Netz PLUS die Inhalte der
       eingeführten Dateien.

       Die beiden stehen getrennt, und das ist Absicht:
       `netz.toJSON()` ist auch das Format des Verlaufs (sechzig
       Stände, bei jeder Änderung neu serialisiert), und ein
       eingeführtes Foto darin machte jedes Geräteverschieben zäh.
       Siehe den Kopf von `dateien.js`.

       ⚠️ Herauskommt trotzdem EIN JSON-Objekt. Das ist die
       Bedingung für den Weg nach MPSkills: was die Lehrkraft an
       die Klasse schickt, ist `skill_room_state.data` — ein
       Objekt, nicht zwei. */
    const D = window.Dateien;
    function standJson() {
      const j = netz.toJSON();
      if (D) {
        const b = D.blobsBenutzt(netz);
        if (Object.keys(b).length) j.blobs = b;
      }
      // Der Auftrag reist mit (siehe `aktuell`). netz.fromJSON liest
      // diese Felder nicht — alte Programmstände stören sie also nicht.
      if (aktuell.id) j.szenario = aktuell.id;
      if (aktuell.titel) j.titel = aktuell.titel;
      if (aktuell.aufgabe) j.aufgabe = aktuell.aufgabe;
      return j;
    }

    /* Den Auftrag aus einem Stand übernehmen und anzeigen. Ein
       Stand ohne Auftrag (selbst gebaut, oder aus der Zeit vor
       diesem Feld) räumt den alten weg — er gehörte zu einem
       anderen Netz. */
    function auftragAus(data) {
      aktuell.id = (data && data.szenario) || null;
      aktuell.titel = (data && data.titel) || '';
      aktuell.aufgabe = (data && data.aufgabe) || '';
      showAufgabe(aktuell.aufgabe ? aktuell : null);
    }

    /* ⚠️ Ein voller localStorage scheiterte hier bis zum
       2026-09-27 lautlos (`console.warn` und weiter). Das Netz sah
       gespeichert aus und war beim nächsten Öffnen der Stand von
       vorhin — der Fehler, den man erst am nächsten Tag bemerkt.
       Mit eingeführten Dateien wird er wahrscheinlich, also muss
       er sichtbar sein.

       Einmal je Sitzung: `save()` ist gedrosselt, läuft aber bei
       jedem Tastendruck wieder an, und eine Kurzmeldung alle
       250 ms wäre selbst der Fehler. */
    let vollGemeldet = false;
    let saveTimer = null;
    /* Beim Zusehen (Spiegelung am Beamer) liegt das Netz eines
       Kindes auf — das gehört nicht in den Speicher der Lehrkraft.
       bruecke.js schaltet das Sichern dafür ab und danach wieder an. */
    let nichtSpeichern = VORSCHAU;
    function save() {
      clearTimeout(saveTimer);
      if (nichtSpeichern) return;
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(KEY, JSON.stringify(standJson()));
          vollGemeldet = false;
        } catch (e) {
          console.warn('[app] Speichern ging nicht:', e.message);
          if (!vollGemeldet) {
            vollGemeldet = true;
            toast('Der Speicher ist voll — dieser Stand wurde NICHT gesichert. '
              + 'Lösche hochgeladene Dateien oder sichere das Netz als Datei.');
          }
        }
      }, 250);
    }

    function load() {
      if (VORSCHAU) return false;
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        // Erst die Inhalte, dann das Netz: die Einträge zeigen
        // schon beim Aufbauen auf sie.
        if (D) { D.blobsLeeren(); D.blobsLaden(data.blobs); }
        netz.fromJSON(data);
        auftragAus(data);
        return netz.count > 0 || !!aktuell.aufgabe;
      } catch (e) {
        console.warn('[app] Gespeicherter Stand ist unlesbar:', e.message);
        return false;
      }
    }

    /* ─── Szenarien ───────────────────────────────────────────
       Der Vorgriff auf MPSkills: das hier IST der Push der
       Lehrkraft, nur ohne Server. Eine Aufgabe ist ein Netz plus
       ein Text. */
    const SZENARIEN = window.SZENARIEN || {};

    /* Ein Szenario auflegen — egal woher es kommt: aus dem Code
       (die mitgelieferten), vom Server (ein eigenes, im Raum) oder
       von der Lehrkraft vorn (Spiegelung: dann ist `s` der Stand
       eines Kindes, mitsamt seiner Dateien).

       `s` = { id, titel, aufgabe, netz } oder ein ganzer Stand
       (dann ist `s.netz` leer und `s` selbst das Netz).

       `opt.fragen`: vorher nachfragen, wenn schon etwas daliegt.
       `opt.still`:  ohne Kurzmeldung und ohne `gemeldet` — das
                     Laden kam von draußen und ist keine Handlung
                     des Menschen hier (siehe bruecke.js). */
    function szenarioLaden(s, opt) {
      opt = opt || {};
      if (!s) return false;
      if (opt.fragen && !VORSCHAU && netz.count && !window.confirm('Das aktuelle Netz wird ersetzt. Weiter?')) return false;
      const data = s.netz ? U.deepCopy(s.netz) : U.deepCopy(s);
      engine.reset();
      /* Ein Szenario bringt seine eigenen Dateien mit (oder
         keine). Was das vorige Netz eingeführt hatte, wird hier
         weggeräumt — es ist die einzige Stelle neben „Neu" und
         „Öffnen", an der das gefahrlos geht, denn der Verlauf
         fängt gleich darunter ebenfalls von vorn an. */
      if (D) { D.blobsLeeren(); D.blobsLaden(data.blobs || s.blobs); }
      netz.fromJSON(data);
      mit.clear();
      flaeche.clearDots();
      flaeche.select(null);
      geraet.close();
      panels.closeKarte();
      // Eine neue Aufgabe fängt im Entwurf an: erst lesen und
      // einrichten, dann laufen lassen. Wer nur zusehen will,
      // schaltet mit einem Klick auf Aktion.
      setModus('entwurf', true);
      umgebaut = false;
      neuZeichnen();
      /* ⚠️ Der Verlauf fängt VON VORN an, er wird nicht fortgesetzt.
         Ein Strg+Z, das über ein geladenes Szenario hinweg in das
         vorige Netz zurückführt, wäre keine Rücknahme, sondern ein
         Sprung in eine andere Aufgabe — und würde die gerade
         verteilte Aufgabe der Lehrkraft lautlos wegnehmen. */
      verlauf.leeren();
      auftragAus({
        szenario: s.id !== undefined ? s.id : s.szenario,
        titel: s.titel, aufgabe: s.aufgabe
      });
      save();
      if (!opt.still) gemeldet('szenario');
      return true;
    }

    /* Das Menü (szmenue.js). Ohne Raum lädt es die mitgelieferten
       selbst; im Raum fragt es erst draußen (extern.pick) — dort
       wird entschieden, ob der Inhalt vom Server kommt, und dort
       endet eine laufende Spiegelung. */
    function eingebaut(id) {
      const k = String(id || '').replace(/^builtin:/, '');
      const s = SZENARIEN[k];
      return s ? { id: 'builtin:' + k, titel: s.titel, aufgabe: s.aufgabe, netz: s.netz } : null;
    }
    const menue = window.SzMenue({
      knopf: $('szenarioBtn'),
      pop: $('szenarioPop'),
      onPick: (id, it) => {
        if (window.MenuLeiste) window.MenuLeiste.zu();
        if (extern.pick && extern.pick(id, it)) return;
        const s = eingebaut(id);
        if (s) szenarioLaden(s, { fragen: true });
      },
      onShare: (id, an, it) => { if (extern.share) extern.share(id, an, it); },
      onLoeschen: (id, it) => {
        if (!extern.loeschen) return;
        if (!window.confirm('„' + ((it && it.titel) || 'Szenario') + '" endgültig löschen?')) return;
        extern.loeschen(id, it);
      }
    });

    /* ─── Der Auftrag ─────────────────────────────────────────
       Frei verschiebbar (am Kopf festhalten) und minimierbar. Vom
       Nutzer: „Das Aufgaben Fenster soll frei verschiebbar sein …
       Wenn ich auf ‚minimieren' klicke, dann springt die Aufgabe als
       kleine gelbe Kachel ‚Aufgabe' links neben Szenario." Ein ×
       gibt es nicht mehr — weg ist ein Auftrag nur, wenn ein anderer
       kommt. */
    const aufBox = $('aufgabe'), aufKachel = $('aufgabeKachel');
    let aufFrei = null;               // { left, top } nach dem Ziehen

    function aufLage() {
      if (aufFrei) {
        aufBox.style.left = aufFrei.left + 'px';
        aufBox.style.top = aufFrei.top + 'px';
      } else {
        aufBox.style.left = '';
        aufBox.style.top = '';
      }
      document.body.classList.toggle('auf-frei', !!aufFrei);
    }

    function aufZeigen(auf) {
      aufBox.hidden = !auf;
      aufKachel.hidden = auf;
      subnetze.platzieren();
    }

    function showAufgabe(s) {
      if (!s || !s.aufgabe) { aufBox.hidden = true; aufKachel.hidden = true; subnetze.platzieren(); return; }
      // Ein neuer Auftrag kommt immer offen und an seinem Platz —
      // er will gelesen werden, bevor jemand anfängt.
      aufFrei = null;
      aufLage();
      aufBox.hidden = false;
      aufKachel.hidden = true;
      $('aufgabeTitel').textContent = s.titel || '';
      /* Durch den Türsteher, immer: im Raum kommt dieser Text vom
         Server auf das Tablet eines Kindes (aufgabe.js). */
      $('aufgabeText').innerHTML = window.Aufgabe ? window.Aufgabe.reinigen(s.aufgabe) : s.aufgabe;
      // Erst messen, wenn der Text steht — vorher ist die Karte
      // noch so hoch wie der vorige Auftrag.
      requestAnimationFrame(() => subnetze.platzieren());
    }

    $('aufgabeMin').addEventListener('click', (ev) => {
      ev.stopPropagation();
      aufZeigen(false);
    });
    aufKachel.addEventListener('click', () => aufZeigen(true));

    /* Ziehen wie bei den Kärtchen (panels.js): am Kopf festhalten,
       innerhalb der Bühne bleiben. */
    (function () {
      const kopf = $('aufgabeHead');
      let zieh = null;
      kopf.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('button')) return;
        const r = aufBox.getBoundingClientRect();
        const b = aufBox.parentElement.getBoundingClientRect();
        zieh = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, b, w: r.width };
        kopf.setPointerCapture(ev.pointerId);
        aufBox.classList.add('is-zieh');
      });
      kopf.addEventListener('pointermove', (ev) => {
        if (!zieh) return;
        aufFrei = {
          left: Math.round(U.clamp(ev.clientX - zieh.dx - zieh.b.left, 8, Math.max(8, zieh.b.width - zieh.w - 8))),
          top:  Math.round(U.clamp(ev.clientY - zieh.dy - zieh.b.top, 8, Math.max(8, zieh.b.height - 46)))
        };
        aufLage();
        subnetze.platzieren();
      });
      const ende = () => { zieh = null; aufBox.classList.remove('is-zieh'); };
      kopf.addEventListener('pointerup', ende);
      kopf.addEventListener('pointercancel', ende);
    })();

    $('neuBtn').addEventListener('click', () => {
      if (netz.count && !window.confirm('Alles löschen und neu anfangen?')) return;
      engine.reset();
      if (D) D.blobsLeeren();
      netz.fromJSON({ nodes: [], cables: [] });
      mit.clear(); flaeche.clearDots(); flaeche.select(null); geraet.close();
      auftragAus(null);
      setModus('entwurf', true);
      umgebaut = false;
      neuZeichnen();
      save();
      verlauf.leeren();
      gemeldet('neu');
    });

    /* Export/Import als Datei — im Prototyp der Ersatz für „die
       Lehrkraft schickt" und zugleich das, was eine Klasse
       abgeben kann. */
    function aufPcSpeichern() {
      const blob = new Blob([JSON.stringify(standJson(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      // Der Dateiname sagt, was drin ist — zwanzig „netz (7).json"
      // im Download-Ordner sagen es nicht.
      const name = (aktuell.titel || 'netz').replace(/^\s*\d+\s*·\s*/, '')
        .replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'netz';
      a.download = name + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    /* „Sichern" legt das Netz als Datei auf den PC — für alle. Das
       Ablegen als eigenes Szenario ist ein zweiter Eintrag, den nur
       die Lehrkraft im Raum sieht („Als Szenario speichern"). Vorher
       stand hier eine Frage „wohin?" hinter EINEM Knopf. */
    $('exportBtn').addEventListener('click', aufPcSpeichern);

    $('szSaveBtn').addEventListener('click', async () => {
      if (!extern.alsSzenario) return;
      const eigen = !!aktuell.id && !/^builtin:/.test(aktuell.id)
        && menue.cfg.private.some(x => x.id === aktuell.id);
      const n = await window.Aufgabe.name({
        vorschlag: aktuell.titel || '',
        ueberschreiben: eigen
      });
      if (!n) return;
      extern.alsSzenario({
        id: (eigen && !n.neu) ? aktuell.id : null,
        name: n.name,
        titel: aktuell.titel || n.name,
        aufgabe: aktuell.aufgabe || '',
        stand: standJson()
      });
    });

    /* Der Aufgabentext (nur die Lehrkraft im Raum sieht den Knopf).
       Bearbeitet wird der Auftrag, der gerade aufliegt — oder, wenn
       keiner da ist, ein neuer. */
    $('aufgabeBtn').addEventListener('click', async () => {
      const r = await window.Aufgabe.editor({ titel: aktuell.titel, aufgabe: aktuell.aufgabe });
      if (!r) return;
      aktuell.titel = r.titel;
      aktuell.aufgabe = r.aufgabe;
      showAufgabe(aktuell.aufgabe || aktuell.titel ? aktuell : null);
      save();
      gemeldet('auftrag');
    });

    $('importBtn').addEventListener('click', () => $('importInput').click());
    $('importInput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          engine.reset();
          const data = JSON.parse(r.result);
          // Wie beim Laden aus dem Speicher: erst die Inhalte.
          // Eine Datei ohne `blobs` ist ein Stand von vor der
          // Einfuhr — dann bleibt der Speicher eben leer.
          if (D) { D.blobsLeeren(); D.blobsLaden(data.blobs); }
          netz.fromJSON(data);
          mit.clear(); flaeche.clearDots(); geraet.close();
          flaeche.select(null); panels.closeKarte();
          setModus('entwurf', true);
          umgebaut = false;
          auftragAus(data);
          neuZeichnen(); save(); verlauf.leeren();
          gemeldet('geoeffnet');
          toast('Netz geladen.');
        } catch (err) { toast('Diese Datei konnte ich nicht lesen.'); }
      };
      r.readAsText(f);
      e.target.value = '';
    });

    /* ─── Kurzmeldung ─────────────────────────────────────────*/
    let toastTimer = null;
    function toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
    }

    /* ─── Hell / Dunkel ───────────────────────────────────────
       Dieselbe Wahl wie in ganz MPSkills: Schlüssel und Werte sind
       die von MPSkills/lib/theme.js. Wer hier umschaltet, schaltet
       die Seite um (auch den Rahmen, in dem SYNIR im Raum steckt) —
       und umgekehrt: ändert sich der Eintrag von außen, zieht die
       Anwendung über das storage-Ereignis mit. Ohne Wahl gilt das
       Gerät (prefers-color-scheme). */
    const THEME_KEY = 'mpskills_theme';
    const themeMq = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
    function themeGewaehlt() {
      try {
        const v = localStorage.getItem(THEME_KEY);
        return (v === 'dark' || v === 'light') ? v : null;
      } catch (e) { return null; }
    }
    function themeAnzeigen() {
      const t = themeGewaehlt() || (themeMq && themeMq.matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = t;
      $('themeBtn').setAttribute('aria-checked', String(t === 'dark'));
      $('themeBtn').classList.toggle('is-on', t === 'dark');
    }
    $('themeBtn').addEventListener('click', () => {
      const neu = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, neu); } catch (e) {}
      /* Das storage-Ereignis feuert nur in ANDEREN Dokumenten: im Raum
         zieht so der Rahmen von MPSkills mit; die eigene Anzeige
         ziehen wir hier selbst nach. */
      themeAnzeigen();
    });
    window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) themeAnzeigen(); });
    if (themeMq && themeMq.addEventListener) {
      themeMq.addEventListener('change', () => { if (!themeGewaehlt()) themeAnzeigen(); });
    }
    themeAnzeigen();

    /* ═══ Die Zwischenablage ═════════════════════════════════════
       Verlangt waren „Copy Paste mit Strg V/C", und zwar ohne
       Knöpfe: „Das sind einfach Standard Effekte."

       ⚠️ Die Ablage ist PROGRAMMINTERN und nicht die des Systems.
       Das ist eine Entscheidung und keine Bequemlichkeit: über die
       Systemablage ginge ein Netzausschnitt nur als Text, und dann
       müsste jedes Strg+V aus jeder anderen Anwendung daraufhin
       untersucht werden, ob es vielleicht ein Netz ist. Ein Kind,
       das eine Adresse aus dem Aufgabenblatt kopiert hat und sie in
       ein Feld einfügen will, bekäme sonst Geräte. Innerhalb der
       Seite tut die interne Ablage genau, was man erwartet — und
       über Seiten hinweg gibt es Export/Import.

       Der Versatz wächst mit jedem Einfügen: zweimal Strg+V
       hintereinander legt zwei Kopien nebeneinander und nicht zwei
       aufeinander. Beim Kopieren fängt er von vorn an. */
    let ablage = null;         // { nodes, cables } oder null
    let ablageMal = 0;         // wie oft schon eingefügt
    const VERSATZ_X = 46, VERSATZ_Y = 38;

    function kopieren(schneiden) {
      const ids = flaeche.auswahlIds;
      if (!ids.length) { toast('Nichts markiert. Erst ein Gerät antippen oder ein Rechteck aufziehen.'); return; }
      ablage = netz.ausschnitt(ids);
      ablageMal = 0;
      const n = ablage.nodes.length;
      if (schneiden) {
        loeschenAuswahl('ausgeschnitten');
        return;
      }
      toast(n === 1 ? '1 Gerät kopiert — Strg+V fügt es ein.'
                    : n + ' Geräte kopiert — Strg+V fügt sie ein.');
    }

    /* Wohin die Kopie kommt. Zwei Bedingungen, und die zweite ist
       die, die man vergisst:

         1. versetzt, damit sie nicht auf dem Original liegt
         2. GANZ IM FELD — sonst steht ein eingefügtes Gerät hinter
            dem Rand, wo man es nicht mehr greifen kann. Geklemmt
            wird die Strecke am Hüllrechteck des Ausschnitts, nicht
            jedes Gerät einzeln: sonst rutschten die am Rand
            zusammen und die Kopie sähe anders aus als das Original.
            Dieselbe Rechnung wie beim Verschieben mehrerer Geräte
            (flaeche.js).                                          */
    function einfuegeVersatz(data) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const d of data.nodes) {
        x0 = Math.min(x0, d.x); x1 = Math.max(x1, d.x);
        y0 = Math.min(y0, d.y); y1 = Math.max(y1, d.y);
      }
      const f = flaeche.feld;
      return {
        dx: U.clamp(VERSATZ_X * ablageMal, f.randX - x0, f.w - f.randX - x1),
        dy: U.clamp(VERSATZ_Y * ablageMal, f.randY - y0, f.h - f.randY - y1)
      };
    }

    function einfuegen() {
      if (!ablage || !ablage.nodes.length) { toast('Die Ablage ist leer.'); return; }
      if (modus !== 'entwurf') {
        // Gebaut wird im Entwurf. Ein Gerät, das mitten in einer
        // laufenden Simulation erscheint, ist keine Erkenntnis,
        // sondern eine Überraschung.
        setModus('entwurf');
      }
      ablageMal++;
      const v = einfuegeVersatz(ablage);
      const neu = netz.einfuegen(ablage, v.dx, v.dy);
      if (!neu.length) { toast('Das ließ sich nicht einfügen.'); return; }
      /* Markiert, aber OHNE Kärtchen — es können acht Geräte sein.
         Dieselbe Regel wie bei der Rechteckauswahl. */
      panels.closeKarte();
      flaeche.setAuswahl(neu, true);
      neuZeichnen();
      aenderung(neu.length === 1 ? 'Gerät eingefügt' : neu.length + ' Geräte eingefügt', true);
      /* Zwei gleiche Adressen sind beim Einfügen die Regel und kein
         Versehen — aber man muss es sagen, sonst wundert sich
         jemand später über ein Netz, in dem zwei Geräte auf
         dieselbe Anfrage antworten. Die Fläche sagt es nicht mehr:
         das „!" für doppelte Adressen ist weg (flaeche.js,
         problemOf). Umso mehr gehört der Satz hierher. */
      const doppelt = netz.duplicateIps().length;
      toast(neu.length + (neu.length === 1 ? ' Gerät eingefügt' : ' Geräte eingefügt')
        + (doppelt ? ' — die Kopie trägt dieselben IP-Adressen wie das Original.' : '.'));
    }

    /* Entf: die Markierung weg. Ohne Rückfrage, und das ist erst
       seit dieser Runde zu verantworten — vorher gab es keinen Weg
       zurück, jetzt gibt es Strg+Z. Ein Bestätigungsfenster für
       etwas Umkehrbares ist eine Frage, auf die niemand „nein"
       antwortet; die Kurzmeldung sagt stattdessen, wie man es
       zurückholt. */
    function loeschenAuswahl(wort) {
      const ids = flaeche.auswahlIds;
      if (!ids.length) return;
      for (const id of ids) {
        if (panels.termNode === id) panels.closeTerminal();
        if (geraet.isOpen && geraet.nodeId === id) geraet.close();
        netz.removeNode(id);
      }
      panels.closeKarte();
      flaeche.select(null);
      neuZeichnen();
      aenderung(ids.length === 1 ? 'Gerät gelöscht' : ids.length + ' Geräte gelöscht', true);
      toast(ids.length + (ids.length === 1 ? ' Gerät ' : ' Geräte ')
        + (wort || 'gelöscht') + ' — Strg+Z holt sie zurück.');
    }

    /* Dasselbe für ein Kabel. EINE Stelle für beide Wege — die
       Entf-Taste und der Knopf im Kabelkärtchen. Vorher gab es nur
       den Knopf, und der meldete über `onDirty` den Schritt
       „Einstellung geändert": wer danach Strg+Z drückte, bekam
       wortlos sein Kabel zurück. */
    function loeschenKabel(id) {
      if (!netz.getCable(id)) return;
      netz.removeCable(id);
      panels.closeKarte();
      flaeche.kabelWaehlen(null);
      neuZeichnen();
      aenderung('Kabel gelöscht', true);
      toast('Kabel gelöscht — Strg+Z holt es zurück.');
    }

    /* ─── Tastatur ────────────────────────────────────────────*/
    window.addEventListener('keydown', (ev) => {
      /* ⚠️ In einem Eingabefeld gehören diese Tasten dem Feld. Strg+Z
         nimmt dort den letzten Tastendruck zurück (das macht der
         Browser selbst), Strg+C kopiert die markierte Zahl, Entf
         löscht ein Zeichen. Würde hier zugegriffen, löschte Entf im
         Adressfeld das ganze Gerät — der teuerste Fehlgriff, den
         diese Oberfläche zu bieten hätte. */
      if (/^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;

      /* ─── Die Bürokürzel ─────────────────────────────────────
         Gemeinsam geprüft, weil sie alle dasselbe Vorzeichen haben:
         Strg (auf einem Mac die Befehlstaste). Umschalt+Z ist die
         zweite Schreibweise für Wiederherstellen — sie ist auf
         Tastaturen ohne bequemes Y die einzige, und sie kostet
         nichts. */
      if (ev.ctrlKey || ev.metaKey) {
        const t = ev.key.toLowerCase();
        if (t === 'z' && !ev.shiftKey) {
          ev.preventDefault();
          if (!verlauf.undo()) toast('Weiter zurück geht es nicht.');
          return;
        }
        if (t === 'y' || (t === 'z' && ev.shiftKey)) {
          ev.preventDefault();
          if (!verlauf.redo()) toast('Weiter vor geht es nicht.');
          return;
        }
        if (t === 'c') { ev.preventDefault(); kopieren(false); return; }
        if (t === 'x') { ev.preventDefault(); kopieren(true);  return; }
        if (t === 'v') { ev.preventDefault(); einfuegen();     return; }
        if (t === 'a') {
          ev.preventDefault();
          /* Alles markieren — ohne Kärtchen. Bei zwölf Geräten wären
             zwölf Fenster keine Übersicht, sondern eine Wand. */
          panels.closeKarte();
          flaeche.setAuswahl(netz.list().map(n => n.id), true);
          subnetze.render();
          toast(netz.count + ' Geräte markiert.');
          return;
        }
        return;
      }

      /* Entf und Rücktaste löschen die Markierung — beide, weil auf
         einer Notebooktastatur je nach Modell nur eine davon
         bequem erreichbar ist.

         ⚠️ Hier stand `if (modus !== 'entwurf') return;` mit der
         Begründung, im Aktionsmodus werde nicht gebaut. Vom Nutzer
         beanstandet: „Mit der Entf möchte ich das bzw. die
         ausgewählten Geräte löschen." Ohne Modus im Satz — und zu
         Recht: eine Taste, die manchmal wirkt und manchmal nicht,
         ohne dass etwas sichtbar anders ist, liest sich als
         kaputte Tastatur und nicht als Regel. Verantworten lässt
         es sich, weil `removeNode` die Zeitgeber des Geräts
         mitnimmt (`engine.dropOwner`) und Strg+Z den ganzen Stand
         zurückholt. */
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        /* Geräte zuerst: die Kabel eines gelöschten Geräts gehen
           ohnehin mit. Beides zugleich markiert zu haben gibt es
           nicht (flaeche.js räumt das eine, wenn das andere
           kommt) — die Reihenfolge hier ist trotzdem festgelegt,
           damit sie nicht davon abhängt, was gerade zufällig
           stehengeblieben ist. */
        if (flaeche.auswahlIds.length) {
          ev.preventDefault();
          loeschenAuswahl();
          return;
        }
        if (flaeche.selKabel) {
          ev.preventDefault();
          loeschenKabel(flaeche.selKabel);
          return;
        }
        return;
      }

      // Leertaste und Punkt steuern die Uhr — und die gibt es nur
      // im Aktionsmodus. Im Entwurf holen sie einen dorthin, statt
      // wirkungslos zu bleiben: wer anhalten will, will laufen
      // lassen können.
      if (ev.key === ' ') {
        ev.preventDefault();
        if (modus !== 'aktion') setModus('aktion');
        else setRunning(!engine.running);
      }
      if (ev.key === '.') {
        ev.preventDefault();
        if (modus !== 'aktion') setModus('aktion');
        engine.stepOnce(); setRunning(false);
      }
      if (ev.key === 'Escape') {
        if (geraet.isOpen) geraet.close();
        else {
          // `select(null)` räumt die Kabelauswahl mit — beides
          // zugleich gibt es nicht. Hier steht es trotzdem
          // ausdrücklich: Escape soll alles loswerden, und wer
          // diese Zeile liest, soll sich nicht darauf verlassen
          // müssen, dass eine andere Datei mitdenkt.
          flaeche.select(null);
          flaeche.kabelWaehlen(null);
          panels.closeKarte(); panels.closeTerminal();
        }
      }
    });

    /* ─── Los ─────────────────────────────────────────────────*/
    // Szenarienliste füllen — die mitgelieferten sind „public".
    menue.setzen({
      rolle: ROLLE,
      public: Object.keys(SZENARIEN).map(k => ({ id: 'builtin:' + k, titel: SZENARIEN[k].titel }))
    });
    document.body.dataset.rolle = ROLLE;

    if (!load() && !IM_RAUM) {
      // Erster Besuch: das kleinste sinnvolle Netz steht schon da.
      // Eine leere Fläche ist der schlechteste Anfang — man weiß
      // nicht, was das Programm überhaupt kann.
      // (Im Raum nicht: dort entscheidet die Lehrkraft, womit
      // angefangen wird, und bis dahin ist die Fläche leer.)
      const s = eingebaut('zwei');
      if (s) { netz.fromJSON(U.deepCopy(s.netz)); auftragAus({ szenario: s.id, titel: s.titel, aufgabe: s.aufgabe }); }
    }

    // Anfangen wird immer im Entwurf — wie in Filius. Das Netz
    // steht dann still da und lässt sich in Ruhe ansehen, bevor
    // irgendetwas passiert.
    setModus('entwurf', true);
    neuZeichnen();
    panels.renderTrace();
    /* ⚠️ Der erste Eintrag des Verlaufs ist der Stand, mit dem
       angefangen wird — und zwar NACH dem Laden. Stünde er davor,
       führte das erste Strg+Z auf ein leeres Feld zurück: es hätte
       das Laden zurückgenommen, und das ist kein Schritt, den
       jemand getan hat. */
    verlauf.leeren();

    // Für die Fehlersuche von der Konsole aus.
    window.SIM = { engine, netz, stack, mit, term, flaeche, panels, geraet,
                   dienste, konfig, save, TEMPI, subnetze, subnetzeZeigen,
                   setModus, leisteSetzen, verlauf,
                   kopieren, einfuegen, loeschenAuswahl,
                   // Für den Raum (bruecke.js) und die Prüfstände.
                   standJson, szenarioLaden, eingebaut, showAufgabe, toast,
                   internet: inet, internetNeu, neuZeichnen,
                   setRunning, menue, extern, aktuell, ROLLE, IM_RAUM,
                   speichern(an) { nichtSpeichern = !an || VORSCHAU; if (!nichtSpeichern) save(); },
                   VORSCHAU,
                   get ablage() { return ablage; },
                   get modus() { return modus; },
                   get leisteZu() { return rail.classList.contains('is-zu'); } };
  });
})();
