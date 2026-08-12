/* Loop + Actions — arbeiten pro Instanz (mehrere Farmen/Werbe/Marketing möglich).
   Actions nehmen instanceId; placeBuilding erzeugt neue Instanz. */
(function (RT) {
  'use strict';

  var INVESTOR_USER_THRESHOLD = 1000;
  // Phase 3. Die Zahl steht als Versprechen im Phase-2-Investorentext
  // („Ausschüttungen … sagen wir bei X Usern"). Der Text liest sie inzwischen
  // AUS DIESER KONSTANTEN (ui.js, showInvestorModal) — vorher stand sie dort
  // ausgeschrieben, und wer hier drehte, machte Marcus zum Lügner.
  var PHASE3_USER_THRESHOLD   = 1000000;
  // Phase 4 — ab hier schaut die Welt zurück (js/events.js). Die Schwelle
  // ist mit Absicht weit hinter Phase 3: die Ereigniskarten rechnen ihre
  // Beträge in Prozent vom Firmenwert, und der muss dafür etwas hergeben.
  var PHASE4_USER_THRESHOLD   = 40000000;
  var FLYER_TICK_MS  = 8000;
  var FLYER_MULT     = 1.10;

  // Ganzzahl mit Tausenderpunkten für Toasts und Fehlermeldungen. Die
  // Formatierer in ui.js sind dort lokal und kürzen ("20k") — in einer
  // Fehlermeldung soll aber die exakte Zahl stehen, gegen die der Spieler
  // rechnet.
  function fmtInt(n) {
    return Math.floor(n).toLocaleString('de-DE');
  }

  // Die Werbe-Formeln liegen in state.js (adMoneyPerCycle / adTrendMalus) —
  // Loop und UI rechnen beide darüber, damit es keine Duplikate gibt.

  // Id des Trend-Modifikators einer Werbeagentur. Pro Instanz einer, damit
  // das Trend-Info-Modal jede Agentur einzeln auflistet.
  function adTrendModId(instanceId) { return 'werbe:' + instanceId; }
  // PR hat KEINE Id je Instanz — dort hängt der Modifikator am PR-Platz
  // (RT.state.prSlotModId). Der Unterschied ist Absicht: Werbeagenturen
  // bezahlen ihren Malus selbst, PR-Trend wäre sonst über die Zahl der
  // Marketing-Center beliebig käuflich.

  // --- Tick ---
  function tick(payload) {
    var dt = payload.dt / 1000;
    var s  = RT.state.current;
    var phase = RT.state.currentPhase();

    // 1) Serverfarm — Watchtime-Produktion erst ab Phase 2.
    // In Phase 0/1 gibt es keine Sanduhr-Ökonomie.
    if (phase >= 2) {
      // Phase-2-Spielzeit — daran hängt das Verebben des Grundinteresses.
      // Bewusst nur echte Spielzeit: offline verebbt nichts.
      s.phase2Sec = (s.phase2Sec || 0) + dt;

      var cap = RT.state.WATCHTIME_STACK_MAX;
      var farms = RT.state.instancesByType('farm');
      for (var i = 0; i < farms.length; i++) {
        var fs = farms[i].state;
        var usersInThisFarm = RT.state.usersInFarm(farms[i]);
        // ⚠️ Der Stapel-Zähler trägt BEIDES: Watchtime aus den Usern und
        // Metadaten aus den Modellen. Eine Farm, in der nur Modelle liegen,
        // muss deshalb weiterticken — sonst stünde ihr Zähler bei 0 und die
        // Metadaten wären nicht zu ernten, obwohl sie produziert werden.
        var modelsInThisFarm = RT.state.modelsInFarm(farms[i]);
        if (usersInThisFarm <= 0 && modelsInThisFarm <= 0) {
          fs.cycleTime = 0;
          continue;
        }
        if (fs.stacks < cap) {
          // Serverkosten: unversorgte Farmen laufen langsamer (1 → 0,5 → 0,2).
          // Der Faktor wird einmal je Tick bestimmt; dass er sich innerhalb der
          // while-Schleife theoretisch ändern könnte, ist unterhalb eines Ticks
          // und nicht wahrnehmbar.
          fs.cycleTime += dt * RT.state.farmSpeedFactor(farms[i]);
          while (fs.cycleTime >= RT.state.WATCHTIME_CYCLE_SEC && fs.stacks < cap) {
            fs.cycleTime -= RT.state.WATCHTIME_CYCLE_SEC;
            fs.stacks   += 1;
            // ⚠️ Verbraucht wird je PRODUZIERTEM Zyklus, nicht je Sekunde. Eine
            // Farm mit vollem Stapel produziert nicht und kostet deshalb auch
            // nichts — genau das macht die Serverkosten zum „Preis für
            // Watchtime" statt zu einer laufenden Uhr, die auch über Nacht tickt.
            //
            // Gedeckelt beim Sparflammen-Punkt: darunter ändert sich weder Tempo
            // noch Rechnung, und der Zähler bliebe sonst unbegrenzt wachsen.
            fs.upkeepCycles = Math.min((fs.upkeepCycles || 0) + 1,
                                       RT.state.serverUpkeepCrawlAt());
          }
          if (fs.stacks >= cap) fs.cycleTime = 0;
        }
      }

      // Serverprobleme: EIN Modifikator für zwei Ursachen (unversorgte belegte
      // Farm ODER volle Kapazität), bewusst nicht additiv. Er wird gehalten,
      // solange das Problem besteht, und klingt danach mit der normalen
      // Negativ-Rate ab — Abstellen ist also keine Sofort-Amnestie.
      if (RT.state.serverTrouble()) {
        RT.state.setTrendMod(RT.state.SERVER_TROUBLE_MOD, '🔌 Serverprobleme',
                             RT.state.SERVER_TROUBLE_TREND,
                             RT.state.SERVER_TROUBLE_HOLD_SEC);
      }

      // 1b) KI-Labore — laufende Umwandlungen Watchtime → User-Modelle.
      // Die Metadaten selbst brauchen keinen eigenen Tick: sie hängen am
      // Stapel-Zähler der Farm, der oben schon läuft.
      if (phase >= 3) tickKiLabore(s, dt);

      // 2) Werbeagenturen — laufende Werbedeals abarbeiten.
      tickAdAgencies(s, dt);

      // 2b) Trend — positiv stapeln, negativ abfließen lassen.
      tickTrend(s, dt);
    }

    // 3) Marketing-Kampagnen (in allen Phasen aktiv, sofern Marketing-Center gebaut).
    var mks = RT.state.instancesByType('marketing');
    for (var k = 0; k < mks.length; k++) {
      var mkS = mks[k].state;
      if (mkS.active) {
        var elapsed = (Date.now() - mkS.active.startAt) / 1000;
        if (elapsed >= mkS.active.duration) {
          var camp = RT.state.campaignById(mkS.active.campaignId);
          // Nur Reichweiten-Kampagnen zahlen aus. PR hat seine Wirkung schon
          // beim Start abgegeben; der Modifikator klingt jetzt von allein ab
          // und wird hier bewusst nicht angefasst.
          // Die beim Buchen festgehaltene Stückzahl; alte Spielstände ohne
          // active.users fallen auf den festen Wert der Kampagne zurück.
          if (camp && camp.kind !== 'trend') {
            mkS.ready += (typeof mkS.active.users === 'number') ? mkS.active.users
                                                               : (camp.users || 0);
          }
          mkS.active = null;
        }
      }
    }

    // 3b) Techtree — Zeit läuft ab → Node wechselt in 'ready' (nicht auto 'done')
    var tt = s.techtree || {};
    var nodes = (RT.techtree && RT.techtree.NODES) || {};
    // Streik (Ereigniskarte): die Uhr steht still. Umgesetzt, indem der
    // Startzeitpunkt mitwandert — dadurch friert der Fortschrittsring
    // sichtbar ein, statt dass eine zweite Zeitrechnung nötig wäre.
    var strike = RT.events && RT.events.devBlocked && RT.events.devBlocked();
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var entry = tt[nid];
      if (!entry || entry.status !== 'in_progress') continue;
      var def = nodes[nid];
      if (!def) continue;
      if (strike) { entry.startAt += payload.dt; continue; }
      if (Date.now() - entry.startAt >= def.durationSec * 1000) {
        entry.status = 'ready';
        entry.readyAt = Date.now();
        RT.bus.emit('techtree:ready', { nodeId: nid });
        RT.bus.emit('state:changed');
      }
    }

    // 4) Flyerbonus — alle 8 s User × 1,10 (Zinseszins).
    // Aktiv solange mk_flyer 'done' UND users < 1000 UND Phase < 2.
    var now = Date.now();
    if (RT.state.flyerBonusActive()) {
      if (!s.lastFlyerTick) s.lastFlyerTick = now;
      if (now - s.lastFlyerTick >= FLYER_TICK_MS) {
        s.lastFlyerTick = now;
        var before = s.users || 0;
        var after  = Math.floor(before * FLYER_MULT);
        if (after <= before) after = before + 1; // Fortschritt bei sehr kleinen Zahlen
        s.users = after;
        maybeTriggerInvestor();
        RT.bus.emit('state:changed');
      }
    } else {
      // Zurücksetzen, damit der Timer beim nächsten Aktivieren frisch startet.
      s.lastFlyerTick = 0;
    }

    // 5) Peak für die Lernwelt. Ein Choke-Point statt sechs, aus demselben
    // Grund wie beim Phase-3-Meilenstein darunter: die Userzahl ändert sich
    // ausschließlich über Wege, die durch den Tick laufen.
    trackUsersPeak();

    // 6) Phase-3-Meilenstein. Einmal pro Tick statt an jeder User-Quelle:
    // in die Nähe von PHASE3_USER_THRESHOLD kommt man ausschließlich über
    // Trend-Ernte und Kampagnen — beide laufen über den Tick, und ein
    // einzelner Tick Verzögerung ist bei der Zahl nicht wahrnehmbar.
    maybeTriggerPhase3();
    maybeTriggerPhase4();
    maybeAnnounceNetwork();
    maybeAnnounceSaturation();

    // 7) Ereigniskarten — die Runden-Uhr. Sie prüft selbst, ob Phase 4 läuft.
    if (RT.events && RT.events.tick) RT.events.tick();
  }

  /* Höchststand der Userzahl mitschreiben — siehe state.js, `usersPeak`.
     Der Aufholpass ruft es selbst noch einmal, weil er User gutschreibt,
     ohne durch tick() zu laufen. */
  function trackUsersPeak() {
    var s = RT.state.current;
    if (s.users > (s.usersPeak || 0)) s.usersPeak = s.users;
  }

  // Trend-Tick.
  //   Trend > 0: stapelt bis TREND_STACK_MAX Zyklen und wartet dann auf den
  //              Klick — die Stapel sind das, was der Spieler erntet.
  //   Trend < 0: stapelt NICHT, sondern lässt User kontinuierlich abfließen.
  //              Der Klick hat dort die andere Bedeutung "Schadensbegrenzung"
  //              und halbiert den Abfluss (siehe actions.trendShield).
  //   Trend = 0: nichts passiert, gebunkerte Stapel bleiben liegen.
  // Ein einziger TREND_CYCLE_SEC-Takt für beide Richtungen: pro Zyklus wird
  // entweder ein Stapel gebunkert (positiver Trend) oder einmal Abwanderung
  // abgerechnet (negativer). Der Negativ-Fall lief früher kontinuierlich und
  // hat User in unregelmäßigen Häppchen abgezogen — das passte weder zur
  // Anzeige ("−500 / 12 s") noch zum Gefühl. Jetzt fällt genau ein Brocken
  // pro Zyklus.
  function tickTrend(s, dt) {
    RT.state.pruneTrendMods();
    var trend = RT.state.trendValue();
    var max   = RT.state.TREND_STACK_MAX;

    // Kein Trend, oder positiv und Stapel voll → Takt steht still.
    if (trend === 0 || (trend > 0 && s.trendStacks >= max)) {
      s.trendCycleTime = 0;
      return;
    }

    s.trendCycleTime += dt;
    while (s.trendCycleTime >= RT.state.TREND_CYCLE_SEC) {
      s.trendCycleTime -= RT.state.TREND_CYCLE_SEC;
      if (trend > 0) {
        s.trendStacks += 1;
        if (s.trendStacks >= max) { s.trendCycleTime = 0; break; }
      } else {
        var lost = trendCycleLoss(s);
        if (lost <= 0) break;
        s.users -= lost;
        RT.bus.emit('trend:lost', { amount: lost });
      }
    }
  }

  // Abwanderung eines einzelnen Negativ-Zyklus. Basis ist derselbe Wert, den
  // die Trend-Kachel anzeigt; die Schadensbegrenzung halbiert ihn.
  function trendCycleLoss(s) {
    if (s.users <= 0) return 0;
    var base   = Math.abs(RT.state.trendUsersPerCycle());
    var shield = RT.state.trendShieldActive() ? 0.5 : 1;
    return Math.min(s.users, Math.max(1, Math.round(base * shield)));
  }

  // --- Werbeagenturen ---
  // Ein Deal läuft AD_CYCLES_MAX Zyklen. Jeder Zyklus wird VORAB mit Watchtime
  // bezahlt; reicht sie nicht, bricht der Deal ab — bereits erwirtschaftetes
  // Geld bleibt liegen.
  //
  // ── DAUERBETRIEB (deal.autoRenew) ─────────────────────────────────────
  // Mit gesetztem Flag beginnt der Deal nach dem letzten Zyklus einfach wieder
  // bei 1, statt zu enden. Er läuft dann, bis die Watchtime nicht mehr reicht
  // oder der Spieler abbricht. Zwei Gründe, beide gemessen:
  //
  //   1. KLICK-LAST. Bei ~1 Mio Usern (3 Farmen, 6 Agenturen, 3 PR-Plätze)
  //      lag sie bei 14,9 Klicks/min — alle vier Sekunden einer, dauerhaft.
  //      Allein das Nachbuchen der Deals war 2,9 davon.
  //
  //   2. DIE ANTEILS-STUFE KAM NIE INS GLEICHGEWICHT. Ein anteiliger Deal
  //      nimmt pct des Lagers je Zyklus; das Lager pendelt sich erst bei
  //      Produktion × Zyklusdauer/pct ein. Einschwingzeit gegen Deal-Länge:
  //          Feed   2.000 s vs. 100 s → 5 %
  //          Search 1.200 s vs. 300 s → 25 %
  //          Video    313 s vs. 125 s → 40 %
  //      Der Deal war jedes Mal vorbei, bevor der Anteil die Produktion
  //      überhaupt abnehmen konnte — die Watchtime stapelte sich, obwohl
  //      wb_adserver längst stand. Genau das, wogegen die Stufe gebaut wurde
  //      (CLAUDE.md §6), konnte sie ohne Dauerbetrieb nicht leisten.
  //
  // ⚠️ Der Trend-Malus bleibt dabei durchgehend scharf — Schritt 4 unten
  // schiebt die Haltezeit weiter nach vorn. Das ist der Preis und soll es
  // sein: der frühere Puls „Deal endet → Trend erholt sich" ist beim
  // Dauerbetrieb bewusst abgeschaltet, nicht versehentlich verlorengegangen.
  // Wer ihn will, schaltet das Flag im Buchungs-Modal ab.
  //
  // ⚠️ Auf einer Anteils-Stufe kann ein Dauerbetrieb-Deal nicht „leerlaufen":
  // die Kosten schrumpfen mit dem Lager und nähern sich der Produktion an.
  // Abbrechen mangels Watchtime trifft deshalb praktisch nur Stufe „fest".
  //
  // Der Trend-Malus wird beim Buchen gesetzt und hier nur noch am Leben
  // gehalten: solange der Deal produziert, wird die Haltezeit immer wieder auf
  // TREND_HOLD_AD_SEC nach vorn geschoben. Endet der Deal — regulär, durch
  // Abbruch oder mangels Watchtime — hört das Nachschieben auf, der Malus
  // steht noch 30 s voll an und klingt danach ab. Deshalb wird er hier
  // nirgends mehr entfernt.
  function tickAdAgencies(s, dt) {
    var werben = RT.state.instancesByType('werbe');
    for (var j = 0; j < werben.length; j++) {
      var inst  = werben[j];
      var ws    = inst.state;
      var modId = adTrendModId(inst.instanceId);

      if (!ws.deal) continue;

      var type = RT.state.adTypeById(ws.deal.typeId);
      if (!type) { // unbekannte Werbeart (z. B. alter Stand) — sauber aufräumen
        ws.deal = null;
        RT.state.removeTrendMod(modId);
        continue;
      }

      // 1) Schon durch? Zuerst prüfen, sonst würde für einen 6. Zyklus gezahlt.
      //    Greift vor allem für Stände, die fertig aus dem Speicher kommen.
      if (ws.deal.cyclesDone >= RT.state.AD_CYCLES_MAX) {
        if (!renewDeal(inst, type)) continue;
      }

      // 2) Watchtime — und bei personalisierten Deals Metadaten — für den
      //    laufenden Zyklus vorab abbuchen. Reicht eines von beiden nicht,
      //    bricht der Deal ab; das schon verdiente Geld bleibt liegen.
      if (!ws.deal.charged) {
        // grossWt merken: bei einer Anteils-Stufe hängt die Menge am Lager,
        // und das ist bei der Auszahlung am Zyklus-Ende ein anderes.
        var wtGross  = RT.state.adWatchtimeGross(type.id, ws.deal.volume);
        var wtCost   = RT.state.adWatchtimePerCycle(type.id, ws.deal.volume);
        var metaCost = RT.state.adMetadataPerCycle(type.id, ws.deal.volume, ws.deal.targeting);
        if (s.watchtime < wtCost) {
          ws.deal = null;
          RT.bus.emit('toast', 'Watchtime leer — ' + type.name + '-Deal abgebrochen');
          RT.bus.emit('state:changed');
          continue;
        }
        if (metaCost > 0 && (s.metadata || 0) < metaCost) {
          ws.deal = null;
          RT.bus.emit('toast', 'Metadaten leer — personalisierter ' + type.name + '-Deal abgebrochen');
          RT.bus.emit('state:changed');
          continue;
        }
        s.watchtime -= wtCost;
        if (metaCost > 0) s.metadata = (s.metadata || 0) - metaCost;
        ws.deal.charged = true;
        ws.deal.grossWt = wtGross;
      }

      // 3) Zyklus ticken.
      ws.deal.cycleTime += dt;
      if (ws.deal.cycleTime >= type.duration) {
        ws.deal.cycleTime  -= type.duration;
        ws.deal.cyclesDone += 1;
        ws.deal.charged     = false;
        ws.moneyReady      += RT.state.adMoneyPerCycle(type.id, ws.deal.intensity,
                                                       ws.deal.volume, ws.deal.targeting,
                                                       ws.deal.grossWt);
        if (ws.deal.cyclesDone >= RT.state.AD_CYCLES_MAX) {
          if (!renewDeal(inst, type)) continue;
        }
      }

      // 4) Malus am Leben halten, solange der Deal produziert.
      RT.state.holdTrendMod(modId, RT.state.TREND_HOLD_AD_SEC);
    }
  }

  function finishDeal(inst, type) {
    inst.state.deal = null;
    RT.bus.emit('ad:finished', { instanceId: inst.instanceId, typeId: type ? type.id : null });
    RT.bus.emit('state:changed');
  }

  // Ein durchgelaufener Deal am Ende seiner AD_CYCLES_MAX Zyklen.
  // Rückgabe true = läuft weiter (Zähler steht wieder auf 0), false = beendet.
  //
  // Bewusst OHNE eigene Watchtime-Prüfung: der nächste Zyklus wird oben in
  // Schritt 2 abgebucht und bricht dort ab, wenn nichts da ist. Hier zusätzlich
  // zu prüfen hieße, dieselbe Bedingung an zwei Stellen zu pflegen — und auf
  // einer Anteils-Stufe wären die beiden Beträge nicht einmal gleich, weil das
  // Lager sich zwischen den beiden Momenten ändert.
  //
  // ⚠️ 'ad:finished' feuert beim Verlängern NICHT. Daran hängt das Feuerwerk;
  // eine Rakete alle 125 s, für immer, wäre kein Abschluss-Signal mehr,
  // sondern Hintergrundrauschen.
  function renewDeal(inst, type) {
    if (!inst.state.deal.autoRenew) {
      finishDeal(inst, type);
      return false;
    }
    inst.state.deal.cyclesDone = 0;
    RT.bus.emit('state:changed');
    return true;
  }

  // Offline-Aufholpass: spult Watchtime- und Trend-Stapel um die Abwesenheit
  // vor — aber höchstens um die jeweilige Stapel-Obergrenze. Dieselbe Regel
  // gilt in beide Richtungen: auch negativer Trend kostet maximal 5 Zyklen,
  // sonst kommt man nach einer Nacht auf null User zurück.
  function offlineCatchUp(elapsedMs) {
    var s = RT.state.current;
    if (!(elapsedMs > 1000))            return null;
    if (RT.state.currentPhase() < 2)    return null;

    // Die Abwesenheit wird auf OFFLINE_CATCHUP_SEC gedeckelt — eine Nacht
    // bringt dasselbe wie zwei Minuten. `report.seconds` bleibt die ECHTE
    // Abwesenheit, weil das Rückkehr-Fenster sie so nennt.
    var elapsedSec = elapsedMs / 1000;
    var budgetSec  = Math.min(elapsedSec, RT.state.OFFLINE_CATCHUP_SEC);
    var report = { seconds: Math.floor(elapsedSec),
                   watchtime: 0, metadata: 0, wtStacks: 0,
                   trendStacks: 0, usersGained: 0, usersLost: 0, adMoney: 0 };

    var wtCycles = Math.floor(budgetSec / RT.state.WATCHTIME_CYCLE_SEC);
    if (wtCycles > 0) {
      var farms = RT.state.instancesByType('farm');
      for (var i = 0; i < farms.length; i++) {
        var farm = farms[i];
        var fs   = farm.state;
        // Gleiche Regel wie im Tick: Modelle allein halten den Stapel am Leben.
        if (RT.state.usersInFarm(farm) <= 0 &&
            RT.state.modelsInFarm(farm) <= 0) continue;

        var before  = fs.stacks;
        fs.stacks    = Math.min(RT.state.WATCHTIME_STACK_MAX, before + wtCycles);
        fs.cycleTime = 0;
        var stacked = fs.stacks - before;
        var surplus = wtCycles - stacked;
        report.wtStacks += stacked;

        // ⚠️ Der Überschuss über die Stapelgrenze hinaus wird DIREKT
        // gutgeschrieben, statt zu verfallen. Die Grenze „max 5 Stapel, dann
        // steht die Produktion" ist eine Live-Regel: sie erzwingt das Ernten.
        // Offline kann niemand ernten, also wäre sie dort keine Entscheidung,
        // sondern nur eine Deckelung — und genau die hat den Rückkomm-Moment
        // gekostet. Gerechnet wird mit derselben Formel wie harvestFarm(),
        // inklusive watchtimeMult(): der Multiplikator greift beim Ernten.
        if (surplus > 0) {
          var offUsers = RT.state.usersInFarm(farm);
          var offWt = Math.floor(surplus * offUsers * RT.state.WATCHTIME_PER_USER_PER_CYCLE
                                 * RT.state.watchtimeMult());
          if (offWt > 0) { s.watchtime += offWt; report.watchtime += offWt; }
          // ⚠️ Die Metadaten MÜSSEN mit. Sie hängen am selben Stapel
          // (harvestFarmMetadata); rechnete nur die Watchtime den Überschuss,
          // liefen die beiden Pfade für Farmen mit Modellen auseinander.
          if (RT.state.currentPhase() >= 3) {
            var offMetaGain = Math.floor(surplus * RT.state.metadataPerCycle(farm));
            if (offMetaGain > 0) {
              s.metadata = (s.metadata || 0) + offMetaGain;
              report.metadata += offMetaGain;
            }
          }
        }

        // ⚠️ Serverkosten laufen NICHT über die ganze Abwesenheit weiter,
        // sondern nur über die Zyklen, die der Aufholpass wirklich produziert
        // hat — also über wtCycles, Stapel UND Überschuss. Sonst wäre der
        // Überschuss gratis erzeugte Watchtime. Der Deckel auf
        // serverUpkeepCrawlAt() bleibt: mehr als „bis Sparflamme" kann eine
        // Abwesenheit weiterhin nicht kosten. Eine rückwirkende Rechnung über
        // acht Stunden wäre die Strafe fürs Wiederkommen, und sie stünde quer
        // zu der Regel, dass bezahlt wird, was produziert wurde.
        fs.upkeepCycles = Math.min((fs.upkeepCycles || 0) + wtCycles,
                                   RT.state.serverUpkeepCrawlAt());
      }
    }

    // Laufende Werbedeals nachziehen — höchstens EINEN Deal weit. Jeder
    // simulierte Zyklus wird wie im Live-Betrieb vorab mit Watchtime bezahlt;
    // reicht sie nicht, bricht der Deal genauso ab. Offline erntet niemand die
    // Farmen ab, es steht also nur das gespeicherte Lager zur Verfügung.
    //
    // ⚠️ Eine Obergrenze muss seit dem Dauerbetrieb AUSDRÜCKLICH dastehen.
    // Vorher ergab sie sich von selbst — ein Deal war nach fünf Zyklen zu Ende,
    // und mehr konnte der Aufholpass gar nicht rechnen. Ein autoRenew-Deal hat
    // dieses natürliche Ende nicht: über eine Nacht wären das ~2.900
    // Video-Zyklen, also Geld drucken im Schlaf.
    //
    // Die Grenze ist jetzt das Offline-Fenster, mindestens aber AD_CYCLES_MAX
    // Zyklen — sonst stünde eine Werbeart mit langen Zyklen (Video: 25 s)
    // schlechter da als vor der Umstellung. Banner (10 s) kommt damit auf 12
    // statt 5 Zyklen, Video auf 5 wie bisher.
    //
    // ⚠️ Die Reihenfolge im Aufholpass bekommt dadurch Gewicht: die Farmen
    // haben oben ihren Überschuss schon INS LAGER gelegt, die Deals können ihn
    // hier also verbrauchen. Genau das ist der Rückkomm-Effekt — und die
    // Stelle, an der ein deutlich größeres Fenster zuerst kippen würde.
    var werben = RT.state.instancesByType('werbe');
    for (var w = 0; w < werben.length; w++) {
      var wInst = werben[w];
      var wSt   = wInst.state;
      if (!wSt.deal) continue;
      var adType = RT.state.adTypeById(wSt.deal.typeId);
      if (!adType) { wSt.deal = null; RT.state.removeTrendMod(adTrendModId(wInst.instanceId)); continue; }

      var budget = budgetSec + (wSt.deal.cycleTime || 0);
      var offLeft = Math.max(RT.state.AD_CYCLES_MAX,
                             Math.ceil(RT.state.OFFLINE_CATCHUP_SEC / adType.duration));
      while (wSt.deal && budget >= adType.duration && offLeft > 0) {
        if (!wSt.deal.charged) {
          // Dieselben beiden Posten wie im Live-Tick — sonst liefen die Pfade
          // auseinander und ein personalisierter Deal wäre über Nacht gratis.
          var offGross = RT.state.adWatchtimeGross(adType.id, wSt.deal.volume);
          var offWt   = RT.state.adWatchtimePerCycle(adType.id, wSt.deal.volume);
          var offMeta = RT.state.adMetadataPerCycle(adType.id, wSt.deal.volume, wSt.deal.targeting);
          if (s.watchtime < offWt)                        { wSt.deal = null; break; }
          if (offMeta > 0 && (s.metadata || 0) < offMeta) { wSt.deal = null; break; }
          s.watchtime -= offWt;
          if (offMeta > 0) s.metadata = (s.metadata || 0) - offMeta;
          wSt.deal.charged = true;
          wSt.deal.grossWt = offGross;
        }
        budget              -= adType.duration;
        offLeft             -= 1;
        wSt.deal.cyclesDone += 1;
        wSt.deal.charged     = false;
        var earned = RT.state.adMoneyPerCycle(adType.id, wSt.deal.intensity,
                                              wSt.deal.volume, wSt.deal.targeting,
                                              wSt.deal.grossWt);
        wSt.moneyReady  += earned;
        report.adMoney  += earned;
        // Durchgelaufen: im Dauerbetrieb von vorn, sonst raus. Dieselbe
        // Verzweigung wie renewDeal() im Live-Tick, nur ohne die Events —
        // während des Aufholpasses steht die UI noch gar nicht.
        if (wSt.deal.cyclesDone >= RT.state.AD_CYCLES_MAX) {
          if (!wSt.deal.autoRenew) { wSt.deal = null; break; }
          wSt.deal.cyclesDone = 0;
        }
      }
      if (wSt.deal) {
        // Rest-Zeit übernehmen, aber nicht mehr als einen angefangenen Zyklus:
        // bei einem Dauerbetrieb-Deal ist `budget` nach der Zyklen-Obergrenze
        // noch die halbe Nacht groß, und die würde beim ersten Live-Tick
        // sofort in weitere Zyklen umgesetzt — die Obergrenze wäre umgangen.
        wSt.deal.cycleTime = Math.min(budget, adType.duration - 0.001);
        // Deal läuft weiter → Malus wieder scharf stellen, sonst wäre er
        // über die Abwesenheit hinweg abgeklungen.
        RT.state.holdTrendMod(adTrendModId(wInst.instanceId), RT.state.TREND_HOLD_AD_SEC);
      }
    }

    var trend   = RT.state.trendValue();
    var tCycles = Math.floor(budgetSec / RT.state.TREND_CYCLE_SEC);
    if (tCycles > 0 && trend > 0) {
      var stBefore = s.trendStacks || 0;
      s.trendStacks    = Math.min(RT.state.TREND_STACK_MAX, stBefore + tCycles);
      s.trendCycleTime = 0;
      report.trendStacks = s.trendStacks - stBefore;

      // Überschuss über die Stapelgrenze: direkt gutschreiben, dieselbe
      // Begründung wie bei der Watchtime oben. Gerechnet über
      // trendUsersFor() — die Formel, die auch collectTrend() benutzt —
      // und mit demselben Kapazitätsdeckel: der Aufholpass darf die Aussage
      // „Serverkapazität ist der Engpass" nicht umgehen. Was nicht mehr
      // hineinpasst, verfällt; das Rückkehr-Fenster zeigt nur, was ankam.
      var tSurplus = tCycles - report.trendStacks;
      if (tSurplus > 0) {
        var want = RT.state.trendUsersFor(tSurplus);
        var free = RT.state.freeUserCapacity();
        var add  = Math.max(0, Math.min(want, free));
        if (add > 0) { s.users += add; report.usersGained = add; }
      }
    } else if (tCycles > 0 && trend < 0) {
      // Zyklusweise über dieselbe Funktion wie im Live-Betrieb — damit können
      // die beiden Pfade nicht auseinanderlaufen.
      //
      // ⚠️ Der Verlust bleibt bei TREND_STACK_MAX Zyklen, obwohl das
      // Offline-Fenster größer ist. Die Asymmetrie ist gewollt: das Fenster
      // ist eine Belohnung fürs Wiederkommen und darf nicht ausgerechnet den
      // härter treffen, der ohnehin schon im Minus steht. Auch eine ganze
      // Nacht kostet damit weiterhin nur 5 Zyklen.
      var negCycles = Math.min(tCycles, RT.state.TREND_STACK_MAX);
      var drop = 0;
      for (var c = 0; c < negCycles; c++) {
        var l = trendCycleLoss(s);
        if (l <= 0) break;
        s.users -= l;
        drop    += l;
      }
      s.trendCycleTime = 0;
      report.usersLost = drop;
    }

    // Der Aufholpass schreibt User gut, ohne durch tick() zu laufen — der
    // Peak für die Lernwelt muss deshalb hier selbst nachgezogen werden.
    trackUsersPeak();

    RT.bus.emit('state:changed');
    return report;
  }

  // Investor-Meilenstein: einmalig bei ≥ INVESTOR_USER_THRESHOLD Usern.
  // UI hört auf 'investor:trigger' und öffnet das Modal.
  function maybeTriggerInvestor() {
    var s = RT.state.current;
    if (s.investorTriggered) return;
    if ((s.users || 0) < INVESTOR_USER_THRESHOLD) return;
    s.investorTriggered = true;
    RT.bus.emit('investor:trigger');
    RT.bus.emit('state:changed');
  }

  // Phase-3-Meilenstein: einmalig bei ≥ PHASE3_USER_THRESHOLD Usern.
  // Die Schwelle steht so auch im Phase-2-Text des Investors („Sagen wir …
  // bei X Usern") — der liest sie inzwischen aus derselben Konstanten.
  // Daran hängt Marcus' Rückkehr (ui.js, showPhase3Modal) samt Ausschüttung.
  // Der Netzwerkeffekt wächst so langsam, dass man ihn ohne Ansage nie
  // bemerkt — er ist die einzige Trend-Quelle ganz ohne Klick. Alle 0,5
  // Punkte gibt es deshalb eine kurze Rückmeldung; das macht aus einer Zahl,
  // die im Hintergrund hochkriecht, wiederkehrendes Lob fürs Wachsen.
  //
  // ⚠️ Der Merker liegt im Spielstand, nicht im Modul: sonst käme nach jedem
  // Neuladen die ganze Leiter noch einmal als Toast-Salve. Er wird beim
  // Ansagen auf ABGERUNDETE Halbschritte gesetzt und nicht auf den Istwert,
  // damit ein Sprung über mehrere Stufen (Offline-Aufholpass, frisch
  // eingesammelte Trend-Stapel) genau eine Meldung erzeugt statt keiner.
  var NETWORK_STEP = 0.5;
  function maybeAnnounceNetwork() {
    var s   = RT.state.current;
    var now = RT.state.networkEffect();
    if (typeof s.networkSeen !== 'number') { s.networkSeen = now; return; }
    if (now < s.networkSeen + NETWORK_STEP) {
      // Schrumpft die Plattform, wandert der Merker mit nach unten — sonst
      // bliebe die nächste Ansage aus, bis der alte Höchststand wieder da ist.
      if (now < s.networkSeen) s.networkSeen = now;
      return;
    }
    s.networkSeen = Math.floor(now / NETWORK_STEP) * NETWORK_STEP;
    RT.bus.emit('toast', '🌐 Netzwerkeffekt +' + s.networkSeen.toFixed(1).replace('.', ',')
                       + ' — deine Plattform zieht von allein.');
  }

  // Der Moment, in dem der Netzwerkeffekt zum ersten Mal FÄLLT statt zu
  // steigen. Genau eine Ansage, dann nie wieder: ein Posten, der jahrelang
  // nur hochging und sich ohne Vorwarnung umdreht, sieht sonst aus wie ein
  // Fehler im Spiel. Die Aufschlüsselung dahinter steht im Trend-Modal.
  //
  // ⚠️ Der Merker liegt wie networkSeen im Spielstand, nicht im Modul —
  // sonst käme die Ansage nach jedem Neuladen wieder.
  function maybeAnnounceSaturation() {
    var s = RT.state.current;
    if (s.networkSatSeen) return;
    if (!RT.state.networkSaturating()) return;
    s.networkSatSeen = true;
    RT.bus.emit('toast', '🌍 Die Welt füllt sich — ab hier bringt jeder weitere '
                       + 'User weniger Netzwerkeffekt.');
  }

  // ⚠️ Marcus holt sich seinen Anteil HIER, nicht im Modal. Der Griff hängt am
  // Setzen von phase3Triggered und ist damit deterministisch: wer mitten im
  // Modal neu lädt, hat trotzdem bezahlt. Läge die Abbuchung am „Weiter"-Knopf,
  // wäre das Flag gesetzt und das Geld nie geholt — und der Moment kommt genau
  // einmal, es gäbe also keine Reparatur.
  //
  // Der abgebuchte Betrag wandert nach investorCutAmount, damit das Modal die
  // ECHTE Zahl zeigen kann statt sie ein zweites Mal zu rechnen.
  function maybeTriggerPhase3() {
    var s = RT.state.current;
    if (s.phase3Triggered) return;
    if (!s.investorTriggered) return;
    if ((s.users || 0) < PHASE3_USER_THRESHOLD) return;
    s.phase3Triggered = true;
    var cut = Math.max(0, s.money || 0) * RT.state.INVESTOR_PAYOUT_SHARE;
    s.money = Math.max(0, (s.money || 0) - cut);
    s.investorCutAmount = cut;
    RT.bus.emit('phase3:trigger');
    RT.bus.emit('state:changed');
  }

  // Phase-4-Meilenstein: einmalig bei ≥ PHASE4_USER_THRESHOLD Usern.
  // Anders als Phase 3 ist damit KEINE Abbuchung und keine neue Ressource
  // verbunden — es öffnet nur das Kartensystem. Deshalb steht hier auch
  // nichts als das Flag und das Event; alles Weitere macht das Modal
  // (ui.js, showPhase4Modal) und danach die Tour.
  //
  // ⚠️ Die erste Runde wird bewusst NICHT hier ausgelöst. Der Tick in
  // js/events.js zieht sie, sobald nextAt fällig ist; das Phase-4-Modal
  // startet die Uhr beim Schließen mit FIRST_ROUND_SEC Vorlauf, damit die
  // erste Karte nach der Erklärung kommt — aber nicht in derselben Sekunde.
  function maybeTriggerPhase4() {
    var s = RT.state.current;
    if (s.phase4Triggered) return;
    if (!s.phase3Triggered) return;
    if ((s.users || 0) < PHASE4_USER_THRESHOLD) return;
    s.phase4Triggered = true;
    // ⚠️ Die Uhr MUSS hier schon stehen. Der Ereignis-Tick läuft im selben
    // Durchlauf ein paar Zeilen weiter (tick(), oben) — mit dem frischen
    // nextAt = 0 („sofort fällig") zöge er die erste Karte über das
    // Gratulations-Modal hinweg, also noch vor jeder Erklärung. Das Modal
    // setzt den Vorlauf beim Schließen neu, damit er komplett nach der Tour
    // liegt; diese Zeile ist die Absicherung für den Weg dorthin.
    if (RT.events && RT.events.state) {
      RT.events.state().nextAt = Date.now() + RT.events.FIRST_ROUND_SEC * 1000;
    }
    RT.bus.emit('phase4:trigger');
    RT.bus.emit('state:changed');
  }

  // KI-Labore: laufende Umwandlungen abarbeiten. Baugleich zu
  // tickAdAgencies() — jeder Zyklus wird VORAB mit Watchtime bezahlt und legt
  // nach Ablauf seiner Dauer Modelle zum Einsammeln bereit.
  //
  // Reicht die Watchtime beim Start eines Zyklus nicht, bricht die Umwandlung
  // ab; die bereits fertigen Modelle bleiben liegen. Dieselbe Regel wie beim
  // Werbedeal, damit beide Konverter sich gleich verhalten.
  function tickKiLabore(s, dt) {
    var labs = RT.state.instancesByType('kilabor');
    for (var i = 0; i < labs.length; i++) {
      var st = labs[i].state;
      if (!st.conv) continue;
      var type = RT.state.convTypeById(st.conv.typeId);
      if (!type) { st.conv = null; continue; }

      // Kosten und Ertrag hängen an der aktuellen User-Zahl und am freien
      // Platz auf den Servern — sie werden deshalb je Zyklus neu berechnet,
      // nicht beim Buchen eingefroren.
      //
      // Ist kein Platz mehr frei, liefert der Zyklus nichts mehr: dann endet
      // die Umwandlung, statt Watchtime für 0 Modelle zu verbrennen.
      if (!st.conv.charged) {
        var cost = RT.state.convWatchtimePerCycle(type.id);
        if (cost <= 0) {
          st.conv = null;
          RT.bus.emit('toast', '🧠 Serverkapazität voll — mehr Serverfarmen bauen!');
          RT.bus.emit('state:changed');
          continue;
        }
        if ((s.watchtime || 0) < cost) {
          st.conv = null;
          RT.bus.emit('toast', '🧠 Umwandlung abgebrochen — zu wenig Watchtime');
          RT.bus.emit('state:changed');
          continue;
        }
        s.watchtime         -= cost;
        st.conv.charged      = true;
        st.conv.chargedModels = RT.state.convModelsPerCycle(type.id);
      }

      st.conv.cycleTime += dt;
      while (st.conv && st.conv.cycleTime >= type.duration) {
        st.conv.cycleTime -= type.duration;
        st.conv.cyclesDone += 1;
        st.conv.charged     = false;
        // Ausgeliefert wird, was beim Bezahlen vereinbart war — sonst könnte
        // eine User-Änderung während des Zyklus den Ertrag unter das drücken,
        // wofür der Spieler schon gezahlt hat.
        st.modelsReady = (st.modelsReady || 0) + (st.conv.chargedModels || 0);

        if (st.conv.cyclesDone >= RT.state.CONV_CYCLES_MAX) {
          st.conv = null;
          RT.bus.emit('conv:finished', { instanceId: labs[i].instanceId });
          break;
        }
        // Nächsten Zyklus sofort bezahlen, sonst liefe er eine Runde gratis.
        var next = RT.state.convWatchtimePerCycle(type.id);
        if (next <= 0) {
          st.conv = null;
          RT.bus.emit('toast', '🧠 Serverkapazität voll — mehr Serverfarmen bauen!');
          break;
        }
        if ((s.watchtime || 0) < next) {
          st.conv = null;
          RT.bus.emit('toast', '🧠 Umwandlung abgebrochen — zu wenig Watchtime');
          break;
        }
        s.watchtime          -= next;
        st.conv.charged       = true;
        st.conv.chargedModels = RT.state.convModelsPerCycle(type.id);
      }
    }
  }

  // --- Actions ---
  RT.actions = {
    // Erntet BEIDES: Watchtime aus den Tieren und Metadaten aus den Modellen.
    // Beide hängen am selben Stapel-Zähler, deshalb muss die Metadaten-Zeile
    // VOR dem Zurücksetzen von fs.stacks laufen. Der Rückgabewert bleibt die
    // Watchtime, damit bestehende Aufrufer (Fly-Animation, Konfetti)
    // unverändert weiterrechnen.
    harvestFarm: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'farm') return 0;
      var fs = inst.state;
      var meta = RT.actions.harvestFarmMetadata(instanceId);
      if (fs.stacks <= 0) return 0;
      var users = RT.state.usersInFarm(inst);
      // Multiplikator aus den Watchtime-Nodes greift bei der Ernte, nicht beim
      // Stapeln — dadurch wirkt er auch auf Stapel, die vorher entstanden sind.
      var total = Math.floor(fs.stacks * users * RT.state.WATCHTIME_PER_USER_PER_CYCLE
                             * RT.state.watchtimeMult());
      s.watchtime += total;
      fs.stacks    = 0;
      fs.cycleTime = 0;
      if (!meta) RT.bus.emit('effect', { where: instanceId, icon: '⏳', text: '+' + total });
      RT.bus.emit('state:changed');
      return total;
    },

    // Metadaten der Modelle in dieser Farm. Sie hängen am SELBEN Stapel wie
    // die Watchtime — deshalb liest diese Action nur, sie setzt den Zähler
    // nicht zurück. Das macht harvestFarm(), sobald beides gutgeschrieben ist.
    harvestFarmMetadata: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'farm') return 0;
      if (RT.state.currentPhase() < 3) return 0;
      var total = Math.floor(inst.state.stacks * RT.state.metadataPerCycle(inst));
      if (total <= 0) return 0;
      s.metadata = (s.metadata || 0) + total;
      RT.bus.emit('effect', { where: instanceId, icon: '🗃️', text: '+' + fmtInt(total) });
      return total;
    },

    // ── Serverkosten: Strom, Wasser und Wartung bezahlen ────────────────────
    //
    // Eine Farm wieder auf volle Versorgung bringen. Bezahlt wird anteilig nach
    // verbrauchten Zyklen (serverUpkeepDueCost) — wer früh drückt, zahlt wenig.
    payServerUpkeep: function (instanceId) {
      var s    = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'farm') return { ok: false, msg: 'Keine Serverfarm' };
      var used = inst.state.upkeepCycles || 0;
      if (used <= 0) return { ok: false, msg: 'Versorgung ist voll' };

      var cost = Math.ceil(RT.state.serverUpkeepDueCost(inst));
      if (s.money < cost) {
        return { ok: false, msg: 'Zu wenig 💰 — ' + fmtInt(cost) + ' € für Strom, Wasser und Wartung' };
      }
      s.money -= cost;
      inst.state.upkeepCycles = 0;
      RT.bus.emit('effect', { where: instanceId, icon: RT.assets.iconHtml('stromWasser'), text: '−' + fmtInt(cost) + ' €' });
      RT.bus.emit('state:changed');
      return { ok: true, cost: cost, farms: 1 };
    },

    // Der Sammelklick des Energiewerks. Er deckt NUR die großen Farmen ab
    // (RT.state.energyPlantCovers) — die kleinen bleiben Handarbeit, und genau
    // das ist der Konsolidierungs-Anreiz, den das Werk mitbringt.
    //
    // ⚠️ Alles oder nichts: reicht das Geld nicht für ALLE abgedeckten Farmen,
    // wird nichts abgebucht. Eine Teilzahlung wäre nicht nachvollziehbar — der
    // Spieler drückt einen Knopf und sähe hinterher zufällig halb versorgte
    // Farmen, ohne zu wissen, welche.
    payServerUpkeepAll: function () {
      var s = RT.state.current;
      if (!RT.state.hasEnergyPlant()) return { ok: false, msg: 'Kein Strom- & Wasserwerk' };
      var farms = RT.state.farmsAwaitingUpkeep(true);
      if (!farms.length) return { ok: false, msg: 'Alle großen Farmen sind versorgt' };

      var total = 0, i;
      for (i = 0; i < farms.length; i++) total += RT.state.serverUpkeepDueCost(farms[i]);
      total = Math.ceil(total);
      if (s.money < total) {
        return { ok: false, msg: 'Zu wenig 💰 — ' + fmtInt(total) + ' € für alle Farmen' };
      }
      s.money -= total;
      for (i = 0; i < farms.length; i++) farms[i].state.upkeepCycles = 0;

      var plant = RT.state.instancesByType('energie')[0];
      if (plant) {
        RT.bus.emit('effect', { where: plant.instanceId, icon: RT.assets.iconHtml('stromWasser'),
                                text: '−' + fmtInt(total) + ' €' });
      }
      RT.bus.emit('toast', '⚡ ' + farms.length + ' Farmen versorgt — ' + fmtInt(total) + ' €');
      RT.bus.emit('state:changed');
      return { ok: true, cost: total, farms: farms.length };
    },

    // Eine Umwandlung im KI-Labor buchen. Läuft CONV_CYCLES_MAX Zyklen.
    startConversion: function (instanceId, typeId) {
      var s    = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'kilabor') return { ok: false, msg: 'Kein KI-Labor' };
      if (inst.state.conv) return { ok: false, msg: 'Es läuft schon eine Umwandlung' };
      var type = RT.state.convTypeById(typeId);
      if (!type) return { ok: false, msg: 'Unbekannte Umwandlung' };
      if (type.unlockedBy && !RT.state.nodeDone(type.unlockedBy)) {
        return { ok: false, msg: 'Erst im KI-Reiter freischalten' };
      }
      // ⚠️ Der Platz wird schon beim BUCHEN geprüft, nicht erst beim
      // Einsammeln. Sonst zahlt der Spieler Watchtime für Modelle, die
      // hinterher nirgends landen können — der Ausbau-Druck muss vorher
      // ankommen, nicht als Quittung.
      var cost = RT.state.convWatchtimePerCycle(typeId);
      if (cost <= 0) {
        return { ok: false, msg: RT.state.modelsPendingTotal() > 0
          ? 'Erst die fertigen Modelle einsammeln'
          : 'Serverkapazität voll — bau mehr Serverfarmen' };
      }
      if ((s.watchtime || 0) < cost) {
        return { ok: false, msg: 'Zu wenig Watchtime — ' + fmtInt(cost) + ' je Zyklus' };
      }
      // Der erste Zyklus wird sofort bezahlt, damit die Buchung nicht eine
      // Runde lang gratis läuft (gleiche Regel wie beim Werbedeal).
      var got = RT.state.convModelsPerCycle(typeId);
      s.watchtime -= cost;
      inst.state.conv = { typeId: typeId, cyclesDone: 0, cycleTime: 0,
                          charged: true, chargedModels: got };
      inst.state.lastConv = typeId;
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    cancelConversion: function (instanceId) {
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'kilabor' || !inst.state.conv) return { ok: false };
      inst.state.conv = null;
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Fertige Modelle einsammeln. Sie belegen Serverkapazität wie User,
    // deshalb wird hier gedeckelt — passen nicht alle rein, bleibt der Rest
    // liegen, statt still zu verschwinden.
    collectModels: function (instanceId) {
      var s    = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'kilabor') return 0;
      var ready = Math.floor(inst.state.modelsReady || 0);
      if (ready <= 0) return 0;
      // Der freie Platz ist der einzige Deckel. Er kann zwischen Buchung und
      // Einsammeln geschrumpft sein — die User wachsen ja weiter und nehmen
      // sich denselben Platz.
      var add = Math.min(ready, RT.state.freeUserCapacity());
      if (add <= 0) {
        RT.bus.emit('toast', 'Serverkapazität voll — mehr Serverfarmen bauen!');
        return 0;
      }
      s.models = (s.models || 0) + add;
      inst.state.modelsReady = ready - add;
      if (add < ready) {
        RT.bus.emit('toast', 'Serverkapazität voll — ' + fmtInt(ready - add) +
                             ' Modelle warten noch');
      }
      RT.bus.emit('effect', { where: instanceId, icon: '🧠', text: '+' + fmtInt(add) });
      RT.bus.emit('state:changed');
      return add;
    },

    // Gebunkerte Trend-Stapel einlösen — die User strömen zu.
    // Nur bei positivem Trend; bei negativem übernimmt trendShield().
    collectTrend: function () {
      var s = RT.state.current;
      if (RT.state.trendValue() <= 0)  return { ok: false, msg: 'Trend ist nicht positiv' };
      if ((s.trendStacks || 0) <= 0)   return { ok: false, msg: 'Noch nichts angesammelt' };

      var want = RT.state.trendUsersReady();
      var free = RT.state.freeUserCapacity();
      if (free <= 0) {
        RT.bus.emit('toast', 'Serverkapazität voll — mehr Serverfarmen bauen!');
        return { ok: false, msg: 'Serverkapazität voll' };
      }
      var add = Math.min(want, free);
      s.users         += add;
      s.trendStacks    = 0;
      s.trendCycleTime = 0;
      if (add < want) {
        RT.bus.emit('toast', 'Serverkapazität voll — ' + (want - add) + ' User passten nicht mehr rein');
      }
      maybeTriggerInvestor();
      RT.bus.emit('trend:collected', { amount: add });
      RT.bus.emit('state:changed');
      return { ok: true, amount: add };
    },

    // Schadensbegrenzung bei negativem Trend: halbiert den Abfluss für
    // TREND_SHIELD_SEC, danach Cooldown bis TREND_SHIELD_CD_SEC.
    trendShield: function () {
      var s = RT.state.current;
      if (RT.state.trendValue() >= 0)   return { ok: false, msg: 'Gerade kein Schaden abzuwenden' };
      if (!RT.state.trendShieldReady()) return { ok: false, msg: 'Noch im Cooldown' };
      var now = Date.now();
      s.trendShieldUntil   = now + RT.state.TREND_SHIELD_SEC * 1000;
      s.trendShieldReadyAt = now + RT.state.TREND_SHIELD_CD_SEC * 1000;
      RT.bus.emit('trend:shield');
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Wird beim Laden aus main.js aufgerufen.
    offlineCatchUp: offlineCatchUp,

    collectWerbeMoney: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'werbe') return 0;
      var ws = inst.state;
      var amount = Math.floor(ws.moneyReady);
      if (amount <= 0) return 0;
      s.money       += amount;
      ws.moneyReady -= amount;
      RT.bus.emit('effect', { where: instanceId, icon: '💰', text: '+' + amount + '€' });
      RT.bus.emit('state:changed');
      return amount;
    },

    // Neuen Werbedeal buchen. Der erste Zyklus wird sofort bezahlt — damit
    // kann kein Deal ohne Watchtime-Deckung gestartet werden.
    bookAdDeal: function (instanceId, typeId, intensity, volume, targeting, autoRenew) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'werbe') return { ok: false, msg: 'Keine Werbeagentur' };
      var ws = inst.state;
      if (ws.deal)                       return { ok: false, msg: 'Es läuft schon ein Deal' };
      var type = RT.state.adTypeById(typeId);
      if (!type)                          return { ok: false, msg: 'Unbekannte Werbeart' };
      if (!RT.state.adTypeUnlocked(typeId)) return { ok: false, msg: 'Werbeart noch nicht erforscht' };

      // Volumen und Targeting rasten auf das ein, was tatsächlich
      // freigeschaltet ist — die UI kann nichts anbieten, was hier durchfiele.
      var vol  = RT.state.clampAdVolume(volume);
      var targ = !!targeting && RT.state.adTargetingUnlocked();

      var wtGross  = RT.state.adWatchtimeGross(type.id, vol);
      var wtCost   = RT.state.adWatchtimePerCycle(type.id, vol);
      var metaCost = RT.state.adMetadataPerCycle(type.id, vol, targ);
      if (s.watchtime < wtCost)          return { ok: false, msg: 'Zu wenig Watchtime' };
      if (metaCost > 0 && (s.metadata || 0) < metaCost) {
        return { ok: false, msg: 'Zu wenig Metadaten für einen personalisierten Deal' };
      }

      var i = RT.state.clampAdIntensity(intensity);
      s.watchtime -= wtCost;
      if (metaCost > 0) s.metadata = (s.metadata || 0) - metaCost;
      // Dauerbetrieb ist die Vorgabe: ohne ihn kommt eine Anteils-Stufe nie
      // ins Gleichgewicht (Begründung bei tickAdAgencies). `undefined` heißt
      // deshalb an, nicht aus — nur ein ausdrückliches false schaltet ab.
      var renew = (autoRenew !== false);
      ws.deal = {
        typeId:     type.id,
        intensity:  i,
        volume:     vol,
        targeting:  targ,
        autoRenew:  renew,
        cyclesDone: 0,
        cycleTime:  0,
        charged:    true,   // erster Zyklus ist bezahlt
        grossWt:    wtGross
      };
      ws.lastDeal = { typeId: type.id, intensity: i, volume: vol, targeting: targ,
                      autoRenew: renew };
      // Malus greift sofort beim Buchen. Die Haltezeit schiebt der Tick
      // nach, solange der Deal läuft — hier reicht der Startwert.
      // Der Volumen-Faktor steckt im Malus (linear), das Targeting nicht.
      RT.state.setTrendMod(
        adTrendModId(instanceId),
        type.name + ' (' + Math.round(i * 100) + ' %'
          + (RT.state.adIsBaseVolume(vol) ? '' : ', ' + RT.state.adStepLabel(type.id, vol)) + ')',
        -RT.state.adTrendMalus(type.id, i, vol),
        RT.state.TREND_HOLD_AD_SEC
      );
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Laufenden Deal abbrechen. Bereits erwirtschaftetes Geld bleibt liegen,
    // die Watchtime des angefangenen Zyklus ist verloren. Der Trend-Malus
    // bleibt bewusst stehen und klingt ab — Abbrechen ist kein Notausgang
    // aus dem Rufschaden.
    cancelAdDeal: function (instanceId) {
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'werbe' || !inst.state.deal) return false;
      inst.state.deal = null;
      RT.bus.emit('state:changed');
      return true;
    },


    upgradeFarm: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'farm') return false;
      var fs = inst.state;
      var next = RT.state.nextTier(fs.tierId);
      if (!next) return false;
      // Der Sprung auf Stufe 2 kostet nichts — er IST der Investor-Deal
      // (investorUpgrade). Vor Phase 2 ist er deshalb gesperrt, sonst nimmt
      // sich der Spieler sein Geschenk selbst und der Investor liefert
      // stattdessen den viel größeren Sprung auf Stufe 3.
      if (fs.tierId === 'kueken' && RT.state.currentPhase() < 2) return false;
      var cost = RT.state.TIER_UPGRADE_COST[fs.tierId];
      if (s.money < cost) return false;
      s.money  -= cost;
      fs.tierId = next.id;
      var stufe = RT.state.tierStufe(next.id);
      RT.bus.emit('effect', { where: instanceId, icon: '⬆️', text: 'Stufe ' + stufe });
      RT.bus.emit('state:changed');
      return true;
    },

    // Startet eine Kampagne. Reichweiten-Kampagnen (kind 'users') zahlen nach
    // Ablauf User aus, die eingesammelt werden wollen — das erledigt der Tick.
    // PR-Kampagnen (kind 'trend') wirken dagegen SOFORT: der Modifikator wird
    // hier gesetzt und hält genau die Laufzeit, danach klingt er wie jeder
    // andere ab (Sektion 8). Deshalb braucht PR keine eigene Tick-Logik und
    // hinterlässt auch nichts zum Abholen.
    // trendVal ist der Reglerwert der Creator-Beteiligung. Ohne Angabe (und bei
    // jeder Kampagne ohne Regler) liefert clampCampaignTrend() das Maximum —
    // ein Aufrufer, der von Reglern nichts weiß, bucht also die volle Kampagne.
    startCampaign: function (instanceId, campaignId, trendVal) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'marketing') return false;
      var mkS = inst.state;
      if (mkS.active) return false;
      var camp = RT.state.campaignById(campaignId);
      if (!camp) return false;
      if (!RT.state.campaignUnlocked(campaignId)) return false;
      // ⚠️ Preis über campaignCost() statt camp.cost: bei einer Regler-Kampagne
      // hängt er am gewählten Wert und an der Marktplatz-Provision. Beide Zahlen
      // aus derselben Funktion, sonst prüft der Kauf gegen einen anderen Preis,
      // als auf der Karte steht.
      var trend = RT.state.clampCampaignTrend(campaignId, trendVal);
      var cost  = RT.state.campaignCost(campaignId, trend);
      if (s.money < cost) return false;
      // Metadaten-Kosten (Zielgruppen-Offensive). Sie ziehen aus demselben
      // Strom wie das Targeting in der Werbeagentur — „Trend" steht damit
      // direkt gegen „mehr Geld je Werbedeal".
      // ⚠️ Über campaignMetadata(), nicht camp.metadata: der Preis ist dort
      // ein Betrag je User und wächst mit der Plattform mit.
      var metaCost = RT.state.campaignMetadata(campaignId);
      if (metaCost > 0 && (s.metadata || 0) < metaCost) return false;
      // PR braucht einen freien Platz. Die Plätze sind plattformweit (state.js,
      // PR_SLOT_NODES) — mehr Marketing-Center kaufen hilft hier NICHT, sonst
      // wäre der Trend schlicht käuflich.
      var prSlot = 0;
      if (camp.kind === 'trend') {
        prSlot = RT.state.nextFreePrSlot();
        if (!prSlot) {
          RT.bus.emit('toast', 'Alle PR-Plätze belegt — warte, bis eine PR-Kampagne ausläuft.');
          return false;
        }
      }
      s.money -= cost;
      if (metaCost > 0) s.metadata = (s.metadata || 0) - metaCost;
      mkS.active = {
        campaignId: campaignId,
        startAt:    Date.now(),
        duration:   camp.duration,
        // Bei prozentualen Kampagnen die Stückzahl JETZT festhalten. Sonst
        // schrumpft eine schon bezahlte Kampagne nachträglich, wenn während
        // ihrer Laufzeit User abwandern — und die Karte hätte gelogen.
        users:      RT.state.campaignUsers(campaignId),
        // Dieselbe Regel für den Reglerwert: was bezahlt wurde, gilt bis zum
        // Ende. Sonst zeigte die laufende Karte etwas anderes an als den Posten
        // im Trend-Modal, sobald der Regler danach bewegt wird.
        trend:      trend,
        // Belegt den PR-Platz für die Laufzeit. Nur bei kind 'trend' gesetzt.
        prSlot:     prSlot || undefined
      };
      if (camp.kind === 'trend') {
        // ⚠️ Die Id hängt am PLATZ, nicht am Gebäude. Eine neue Buchung
        // ersetzt dadurch den auslaufenden Modifikator desselben Platzes,
        // statt einen zweiten danebenzustellen — sonst summierten sich die
        // Abkling-Schwänze über beliebig viele Center auf (siehe state.js).
        // Fester Ausklang statt der globalen Rate: die Kampagne ist ein
        // Vertrag, der endet, kein Feature, das nachhallt. Rate aus dem
        // BUCHUNGSwert, damit sie linear in PR_DECAY_SEC auf 0 läuft.
        RT.state.setTrendMod(RT.state.prSlotModId(prSlot), camp.icon + ' ' + camp.name,
                             trend, camp.duration,
                             trend / RT.state.PR_DECAY_SEC);
        // Reglerstellung merken, damit sie beim nächsten Öffnen wieder steht —
        // dieselbe Bequemlichkeit wie lastDeal in der Werbeagentur.
        if (camp.trendMin) mkS.lastTrend = trend;
      }
      RT.bus.emit('state:changed');
      return true;
    },

    collectMarketingUsers: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'marketing') return 0;
      var mkS = inst.state;
      if (mkS.ready <= 0) return 0;
      // ⚠️ freeUserCapacity() und NICHT von Hand `cap - users - prog`: seit
      // Phase 3 belegen auch die User-Modelle Serverplatz. Ohne sie zählte
      // diese Stelle den Platz der Modelle als frei, die User liefen über die
      // Kapazität hinaus — und farmFills() kippte den Überhang in die ZULETZT
      // gekaufte Farm, die dadurch sofort voll war.
      var free = RT.state.freeUserCapacity();
      var add  = Math.min(mkS.ready, free);
      if (add <= 0) {
        RT.bus.emit('toast', 'Serverkapazität voll — mehr Serverfarmen bauen!');
        return 0;
      }
      s.users   += add;
      mkS.ready -= add;
      RT.bus.emit('effect', { where: instanceId, icon: '👥', text: '+' + add });
      maybeTriggerInvestor();
      RT.bus.emit('state:changed');
      return add;
    },

    placeBuilding: function (typeId, col, row) {
      var s = RT.state.current;
      var type = RT.state.BUILDING_TYPES[typeId];
      if (!type)                                return { ok: false, msg: 'Unbekannter Gebäudetyp' };
      if (!RT.state.canPlace(typeId, col, row)) return { ok: false, msg: 'Kein Platz' };
      var cost = RT.state.buildingCost(typeId);
      if (s.money < cost)                       return { ok: false, msg: 'Zu wenig 💰' };

      s.money -= cost;
      var instanceId = RT.state.newInstanceId(typeId);
      var instState  = RT.state.defaultInstanceState(typeId);
      // Ab Phase 2 starten neu gekaufte Serverfarmen direkt als Huhn.
      if (typeId === 'farm' && RT.state.currentPhase() >= 2) {
        instState.tierId = 'huhn';
      }
      s.placedBuildings.push({
        instanceId: instanceId,
        id:    typeId,
        col:   col,
        row:   row,
        size:  type.size,
        state: instState
      });
      RT.bus.emit('state:changed');
      RT.bus.emit('effect', { where: instanceId, icon: '✨', text: '-' + cost + '€' });
      return { ok: true };
    },

    // Kauft ein einzelnes Grid-Feld. Kaufbar ist nur, was rechtwinklig an
    // eigenes Gelände grenzt; der Preis steigt mit jedem gekauften Feld
    // (RT.state.nextTileCost).
    buyTile: function (col, row) {
      var s = RT.state.current;
      if (!RT.state.isTilePurchasable(col, row)) return { ok: false, msg: 'Dieses Feld grenzt nicht an dein Gelände' };
      var cost = RT.state.nextTileCost();
      if (s.money < cost)                        return { ok: false, msg: 'Zu wenig 💰' };

      s.money -= cost;
      if (!Array.isArray(s.ownedTiles)) s.ownedTiles = [];
      s.ownedTiles.push(RT.state.tileKey(col, row));
      RT.bus.emit('state:changed');
      RT.bus.emit('tile:bought', { col: col, row: row, cost: cost });
      return { ok: true, cost: cost };
    },

    // Kauft ein Hardware-Item (aktuell nur 'rechner'). Löst HQ-Sprite-Wechsel aus.
    purchaseItem: function (itemId) {
      var s = RT.state.current;
      var catalog = { rechner: { price: 600, name: 'Rechner' } };
      var item = catalog[itemId];
      if (!item)                        return { ok: false, msg: 'Unbekanntes Item' };
      if (s.purchases[itemId])          return { ok: false, msg: 'Schon gekauft' };
      if (s.money < item.price)         return { ok: false, msg: 'Zu wenig 💰' };
      s.money -= item.price;
      s.purchases[itemId] = true;
      if (itemId === 'rechner') {
        var hq = RT.state.instancesByType('hq')[0];
        if (hq) hq.state.level = 1;
      }
      RT.bus.emit('state:changed');
      RT.bus.emit('toast', item.name + ' gekauft (−' + item.price + ' €)');
      return { ok: true };
    },

    // Startet einen Techtree-Node. Prüft Voraussetzungen (requires, requiresPurchase,
    // requiresBuilding, requiresGoLive, requiresUsers), Kosten und den
    // Entwicklungs-Platz.
    //
    // Ein Platz ist ein Gebäude, in dem entwickelt werden kann: das HQ plus
    // jedes gekaufte Bürogebäude. Nur entwicklung-Nodes belegen einen —
    // Marketing und Werbung laufen weiter parallel und ohne Gebäude.
    //
    // preferredBuildingId = das Gebäude, aus dem der Spieler das Modal
    // geöffnet hat. Ist es frei, läuft die Node dort; sonst übernimmt der
    // nächste freie Platz. Die Zuordnung landet als entry.slot am Eintrag —
    // daran hängen Ring, Abhol-Button und Feuerwerk.
    startTechNode: function (nodeId, preferredBuildingId) {
      var s = RT.state.current;
      var def = (RT.techtree && RT.techtree.NODES) ? RT.techtree.NODES[nodeId] : null;
      if (!def) return { ok: false, msg: 'Unbekannter Node' };

      // Doppelt-Start verhindern
      var self = s.techtree[nodeId];
      if (self && self.status === 'in_progress') return { ok: false, msg: 'Läuft bereits' };
      if (self && self.status === 'ready')       return { ok: false, msg: 'Erst abholen' };

      // Streik (Ereigniskarte): es wird gar nichts entwickelt. Gilt für alle
      // Reiter — auch Marketing und Werbung sind Arbeit des Teams.
      if (RT.events && RT.events.devBlocked && RT.events.devBlocked()) {
        return { ok: false, msg: '👥 Streik — es wird gerade nichts entwickelt' };
      }

      // Entwicklung braucht einen FREIEN Platz. Marketing und Werbung belegen
      // keinen, bekommen aber trotzdem ein Gebäude zugewiesen — sonst hätten
      // Ring und Abhol-Button keinen Ort, an dem sie erscheinen können.
      var slotId;
      if (def.tab === 'entwicklung') {
        slotId = RT.techtree.freeDevBuilding(preferredBuildingId);
        if (!slotId) return { ok: false, msg: 'Alle Entwicklungs-Plätze sind belegt' };
      } else {
        slotId = RT.techtree.devBuildingOr1st(preferredBuildingId);
      }

      var status = RT.techtree.nodeStatus(nodeId);
      if (status === 'done')        return { ok: false, msg: 'Schon fertig' };
      if (status === 'locked')      return { ok: false, msg: 'Voraussetzung fehlt' };
      if (s.money < def.cost)       return { ok: false, msg: 'Zu wenig 💰' };

      // Metadaten-Kosten (Phase 3). Sie sind der Grund, warum die KI-Achse
      // sich selbst finanzieren muss: wer sie vertiefen will, muss die
      // Maschine vorher betrieben haben. Bewusst eine eigene Meldung — „zu
      // teuer" würde auf das Konto zeigen, wo nichts fehlt.
      var metaCost = def.metadata || 0;
      if (metaCost > 0 && (s.metadata || 0) < metaCost) {
        return { ok: false, msg: 'Zu wenig Metadaten (' + fmtInt(Math.floor(s.metadata || 0))
                               + ' / ' + fmtInt(metaCost) + ')' };
      }

      // Server-Kapazität prüfen (nur wenn Node welche belegt).
      // Das ist die zentrale Bremse des Hauptbaums: eine fertige Node hält
      // ihren Server-Anteil DAUERHAFT (programmCapacity zählt 'done' mit),
      // jedes Feature kostet also bleibend Platz für User. Deshalb muss die
      // Meldung auch die konkreten Zahlen nennen — sie ist die einzige
      // Stelle, an der der Spieler den Zielkonflikt schwarz auf weiß sieht.
      if (def.server > 0) {
        var free = RT.state.freeUserCapacity();
        if (def.server > free) {
          return { ok: false, msg: 'Zu wenig Server-Kapazität (frei: ' + fmtInt(free)
                                 + ', benötigt: ' + fmtInt(def.server) + ')' };
        }
      }

      s.money -= def.cost;
      if (metaCost > 0) s.metadata = (s.metadata || 0) - metaCost;
      s.techtree[nodeId] = { status: 'in_progress', startAt: Date.now(), slot: slotId };
      RT.bus.emit('state:changed');
      return { ok: true, slot: slotId };
    },

    // Holt eine fertige Node ab (Node im 'ready'-Status → 'done').
    // Wendet Belohnungen an: usersBonus, moneyBonus (einmalig) und trendBonus
    // (befristeter Modifikator, 60 s voll und dann abklingend).
    completeTechNode: function (nodeId) {
      var s = RT.state.current;
      var entry = s.techtree[nodeId];
      if (!entry || entry.status !== 'ready') return { ok: false, msg: 'Nicht abholbereit' };
      var def = (RT.techtree && RT.techtree.NODES) ? RT.techtree.NODES[nodeId] : null;
      entry.status = 'done';
      entry.doneAt = Date.now();

      if (def) {
        if (def.moneyBonus) s.money += def.moneyBonus;
        if (def.usersBonus) {
          // Server-Cap respektieren — Überschuss geht verloren (Toast).
          var free = RT.state.freeUserCapacity();
          var add  = Math.min(def.usersBonus, free);
          s.users += add;
          if (add < def.usersBonus) {
            RT.bus.emit('toast', 'Serverkapazität voll — ' + (def.usersBonus - add) + ' User konnten nicht aufgenommen werden');
          }
        }
      }

      // Trend-Bonus der Node — greift erst beim Einsammeln, nicht schon wenn
      // die Entwicklung durchgelaufen ist.
      if (RT.techtree && RT.techtree.applyTrendBonus) RT.techtree.applyTrendBonus(nodeId);

      maybeTriggerInvestor();
      RT.bus.emit('techtree:completed', { nodeId: nodeId });
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Investor-Belohnung: die erste Küken-Serverfarm (nach Kauf-Reihenfolge)
    // wird kostenlos auf die nächste Stufe (Huhn) hochgestuft. Fallback: falls
    // keine Küken-Farm mehr existiert (Spieler hat manuell upgegradet),
    // wird die niedrigste vorhandene Farm eine Stufe erhöht.
    investorUpgrade: function () {
      var farms = RT.state.instancesByType('farm');
      if (!farms.length) return { ok: false, msg: 'Keine Serverfarm vorhanden' };
      var target = null;
      for (var i = 0; i < farms.length; i++) {
        if (farms[i].state.tierId === 'kueken') { target = farms[i]; break; }
      }
      if (!target) {
        // Niedrigste Stufe suchen (falls Spieler die Küken-Farm schon manuell hochgestuft hat).
        var lowestIdx = Infinity;
        for (var j = 0; j < farms.length; j++) {
          var idx = RT.state.tierIndex(farms[j].state.tierId);
          if (idx >= 0 && idx < lowestIdx) { lowestIdx = idx; target = farms[j]; }
        }
      }
      if (!target) return { ok: false, msg: 'Keine passende Serverfarm gefunden' };
      var next = RT.state.nextTier(target.state.tierId);
      if (!next) return { ok: false, msg: 'Farm ist schon auf höchster Stufe' };
      target.state.tierId = next.id;
      var stufe = RT.state.tierStufe(next.id);
      RT.bus.emit('effect', { where: target.instanceId, icon: '⬆️', text: 'Stufe ' + stufe });
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Setzt goLiveUnlocked und öffnet damit das 5×5-Grid + Werbe/Marketing-Shop-Einträge.
    goLive: function () {
      var s = RT.state.current;
      if (s.goLiveUnlocked) return { ok: false, msg: 'Schon online' };
      // Voraussetzung: alle 5 Phase-0-Nodes done
      var reqIds = ['frontend1', 'backend1', 'account', 'feed', 'bilder'];
      for (var i = 0; i < reqIds.length; i++) {
        var e = s.techtree[reqIds[i]];
        if (!e || e.status !== 'done') return { ok: false, msg: 'Erst alle 5 Kern-Nodes entwickeln' };
      }
      s.goLiveUnlocked = true;
      RT.bus.emit('state:changed');
      return { ok: true };
    }
  };

  // Die Schwelle steht auch im Go-Live-Kärtchen ("nächstes Ziel") — von dort
  // hierher gelesen, damit nicht zwei Zahlen auseinanderlaufen können.
  RT.actions.INVESTOR_USER_THRESHOLD = INVESTOR_USER_THRESHOLD;
  RT.actions.PHASE3_USER_THRESHOLD   = PHASE3_USER_THRESHOLD;
  RT.actions.PHASE4_USER_THRESHOLD   = PHASE4_USER_THRESHOLD;

  RT.bus.on('tick', tick);
})(window.RT3);
