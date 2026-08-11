/* LocalStorage-Persistence. Throttled Save an state:changed, synchroner
   Flush bei beforeunload.

   Seit Migration 0061 ist localStorage NICHT mehr die Wahrheit, sondern
   dreierlei: Gast-Speicher (ohne Login), Offline-Puffer und Cache. Die
   Wahrheit für eingeloggte User liegt in user_game_saves — siehe
   js/cloud.js. Dieses Modul bleibt bewusst rein lokal und synchron; es
   setzt nur den Dirty-Marker, den cloud.js auswertet.                   */
(function (RT) {
  'use strict';

  var KEY = 'startupStoryV3';
  // v2: Ruf → Trend. Alte Stände enthalten kein trendMods und werden verworfen.
  var VERSION = 2;
  var SAVE_DEBOUNCE_MS = 1000;
  var saveTimer = null;
  var wiped = false;
  // Zweiter, langsamerer Takt: speichern, WÄHREND nur produziert wird.
  //
  // ⚠️ Der Tick zählt Stapel, Zyklen, fertige Modelle und phase2Sec hoch,
  // ohne 'state:changed' zu feuern — an dem Event hängt aber das Speichern.
  // Ohne diesen Takt gibt es in reinen Produktionsphasen gar keinen
  // Speicherpunkt, und ein Reload fällt auf die letzte AKTION zurück
  // („springt an bestimmte Ereignisse zurück"). Mit Phase 3 wurde das
  // deutlich sichtbar: eine Umwandlung läuft 100 s ohne jeden Klick.
  var TICK_SAVE_MS = 5000;
  var lastTickSave = 0;

  function writeLocal() {
    // Nach wipe() (z. B. Debug-Neustart) kein Rebound aus dem beforeunload-Flush.
    if (wiped) return;
    try {
      // Zeitstempel mitschreiben — daraus berechnet main.js den Offline-
      // Aufholpass, WENN kein Serverstand da ist. Mit Login gewinnt die
      // Serveruhr (age_sec aus load_game_save), weil savedAt sonst von der
      // womöglich falsch gestellten Uhr des anderen Geräts käme.
      RT.state.current.savedAt = Date.now();
      // owner steht im Umschlag, NICHT in data — der Blob, der zum Server
      // geht, bleibt dadurch genau der Spielstand und trägt keine Id mit
      // sich, die dort ohnehin aus dem JWT kommt.
      var payload = {
        v: VERSION,
        owner: (RT.cloud && RT.cloud.owner()) || null,
        data: RT.state.current
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) { /* Quota / Private-Mode — ignorieren */ }
  }

  function save() {
    if (wiped) return;
    writeLocal();
    // „Der lokale Stand ist nie beim Server angekommen." Der Push selbst
    // läuft über den eigenen Takt in cloud.js, nicht hier — ein RPC je
    // Sekunde wäre absurd.
    if (RT.cloud && RT.cloud.isServerMode()) RT.cloud.markDirty();
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      save();
    }, SAVE_DEBOUNCE_MS);
  }

  /* Gehört der Stand im localStorage dem, der gerade am Gerät sitzt?

     ⚠️ Das ist die Antwort auf „ich spiele eingeloggt weit, komme ohne
     Konto im selben Browser zurück": ein Spielstand aus einem Konto ist
     OHNE dieses Konto nicht spielbar. Sonst hat jeder, der das Tablet
     aufklappt, den Konzern des Vorgängers vor sich — ganz ohne Login.
     `clearLocalGameState()` in session.js deckt das nicht ab: es läuft
     nur bei explizitem Logout, fehlendem Profil oder erkanntem
     User-Wechsel. Läuft ein Token einfach ab, passiert dort nichts.

     Umgekehrt gilt dasselbe: ein Gast-Spielstand (owner null) gehört
     keinem Konto und wird nach dem Login nicht mitgenommen.

     ⚠️ Offline heißt NICHT „kein Konto": owner() liest die Id aus dem
     JWT, nicht aus dem Profil. Wer mit gültigem Token ohne Netz startet,
     spielt seinen eigenen Stand normal weiter — daran hängt die Rettung
     der Offline-Runde.

     ⚠️ Ein fremder Stand wird NICHT gelöscht. War er dirty, ist der
     nächste Login die einzige verbliebene Chance, ihn noch
     hochzuschieben; ein Löschen hier wäre endgültig.

     Stände von vor dieser Änderung haben keinen owner und gelten damit
     als Gast-Stände. Für eingeloggte User heißt das einmalig: lokaler
     Stand wird verworfen, der Serverstand gilt. Genau richtig — anonyme
     Blobs sind der Zustand, den diese Prüfung abschafft.              */
  function ownsLocal(saveOwner) {
    var me = (RT.cloud && RT.cloud.owner()) || null;
    var his = saveOwner || null;
    if (me === his) return true;
    console.log('[storage] Spielstand gehört ' + (his ? 'einem anderen Konto' : 'keinem Konto') +
                ' — wird nicht geladen.');
    return false;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== VERSION || !parsed.data) return false;
      if (!ownsLocal(parsed.owner)) return false;
      // Shallow-Merge: neue Felder in initial bleiben mit ihrem Default erhalten.
      Object.keys(parsed.data).forEach(function (k) {
        RT.state.current[k] = parsed.data[k];
      });
      migrate();
      return true;
    } catch (e) { return false; }
  }

  /* Serverstand übernehmen (js/cloud.js → load_game_save). Läuft durch
     dieselben zwei Schritte wie load(): Shallow-Merge, damit neue Felder
     aus `initial` ihren Default behalten, danach migrate().

     ⚠️ Die Versionsprüfung ist dieselbe wie beim lokalen Stand — ein Blob
     mit anderer VERSION wird verworfen, nicht migriert. Sonst wäre der
     Server der einzige Ort, an dem ein VERSION-Bump nicht greift.        */
  function applyServerSave(payload) {
    if (!payload || !payload.save) return false;
    if (payload.save_version !== VERSION) {
      console.warn('[storage] Serverstand hat Version ' + payload.save_version +
                   ' (erwartet ' + VERSION + ') — verworfen.');
      return false;
    }
    try {
      Object.keys(payload.save).forEach(function (k) {
        RT.state.current[k] = payload.save[k];
      });
      migrate();
      // Einmal lokal durchschreiben, damit ein Absturz oder ein Wechsel in
      // den Gast-Modus nicht auf den alten Gerätestand zurückfällt.
      // writeLocal() statt save(): der Stand kommt gerade VOM Server, er
      // ist also nicht dirty.
      writeLocal();
      return true;
    } catch (e) {
      console.warn('[storage] applyServerSave fehlgeschlagen:', e.message);
      return false;
    }
  }

  // Kleine Anpassungen an geladenen Ständen, die keinen VERSION-Bump (und
  // damit das Löschen aller Spielstände) rechtfertigen.
  function migrate() {
    var s = RT.state.current;
    // Werbeagentur-Umbau: der alte globale 'werbung'-Modifikator aus der
    // Slider-Ära wird nicht mehr gesetzt, hat aber expiresAt 0 und würde
    // sonst ewig im Trend hängenbleiben. Die Deals registrieren stattdessen
    // pro Agentur einen eigenen Modifikator ('werbe:<instanceId>').
    if (s.trendMods) delete s.trendMods.werbung;
    // Negativer Trend rechnet jetzt im Trend-Takt ab statt kontinuierlich —
    // der Bruchteil-Akkumulator wird nicht mehr gebraucht.
    delete s.trendDrainAcc;
    // Trend-Umbau: es gibt keine dauerhaften Modifikatoren mehr. Alte Stände
    // tragen noch 'basis' (jetzt berechnet aus phase2Sec) und UNBEFRISTETE
    // Boni mit sich — beides raus, sonst hängen sie ewig im Trend. Erkannt
    // werden sie am fehlenden holdUntil, nicht an ihrer Id.
    //
    // ⚠️ Hier stand bis zum 2026-08-11 zusätzlich `id.indexOf('node:') === 0`.
    // Das war derselbe Fehler wie bei der VOL_MAP und der 'schaf'-Umbenennung
    // weiter unten: die Quellmenge der Migration war identisch mit der
    // AKTUELL GÜLTIGEN Menge, und migrate() läuft bei JEDEM Laden.
    // techtree.js setzt den Node-Bonus als 'node:<id>' mit sauberem
    // holdUntil (applyTrendBonus) — jeder Reload hat ihn also gelöscht.
    // Sichtbar war nur ein Trend, der nach dem Neuladen niedriger stand.
    //
    // Der Schaden war nicht klein: der Bonus hält TREND_HOLD_NODE_SEC = 60 s
    // voll an und klingt danach mit 0,005/s ab. „Videos hochladen" (+12,0)
    // wirkt damit gut 40 Minuten lang — in diesem ganzen Fenster hat ein
    // Neuladen den größten positiven Trend-Posten des Baums stillschweigend
    // einkassiert.
    //
    // Die Lehre steht in CLAUDE.md §6: eine Migration, die über IDs geht,
    // braucht einen Marker oder eine Zielmenge, die sich von der Quellmenge
    // unterscheidet. Das fehlende holdUntil IST dieser Marker.
    if (s.trendMods) {
      delete s.trendMods.basis;
      Object.keys(s.trendMods).forEach(function (id) {
        var m = s.trendMods[id];
        if (!m || typeof m.holdUntil !== 'number') delete s.trendMods[id];
      });
    }
    if (typeof s.phase2Sec !== 'number') s.phase2Sec = 0;
    // Phase 3 (KI-Labor, User-Modelle, Metadaten). Alte Stände kennen weder
    // das Flag noch das Lager; ein Spielstand über der Schwelle löst den
    // Meilenstein beim nächsten Tick regulär aus, statt ihn zu überspringen.
    if (typeof s.phase3Triggered !== 'boolean') s.phase3Triggered = false;
    // ⚠️ Stände, die den Meilenstein schon hinter sich haben, bekommen den
    // Griff NICHT rückwirkend abgezogen — das Geld ist längst ausgegeben, und
    // eine nachträgliche Abbuchung wäre für den Spieler eine unerklärte Strafe.
    // Der laufende Werbe-Abzug (adRevenueMult) greift dagegen sofort, weil er
    // nur die Zukunft betrifft.
    if (typeof s.investorCutAmount !== 'number') s.investorCutAmount = 0;
    // Phase 4 (Ereigniskarten). Ein Spielstand, der die Schwelle schon
    // überschritten hat, löst den Meilenstein beim nächsten Tick regulär aus
    // — inklusive Modal und Tour. Das ist hier richtig: es wird nichts
    // nachgeholt und nichts abgebucht, es fängt nur etwas an.
    if (typeof s.phase4Triggered !== 'boolean') s.phase4Triggered = false;
    if (typeof s.phase4TourSeen  !== 'boolean') s.phase4TourSeen  = false;
    if (typeof s.events === 'undefined') s.events = null;
    // ⚠️ Eine Runde, die während der Abwesenheit fällig geworden wäre, wird
    // NICHT nachgeholt: nextAt ist ein absoluter Zeitstempel, und der Tick
    // zieht daraus genau EINE Runde. Alles andere hieße, nach einer Nacht
    // acht Karten hintereinander spielen zu müssen — und die Krisen darin
    // hätten nie eine Frist gehabt, in der man sie hätte abwenden können.
    //
    // Ein mitten in der Runde geschlossenes Spiel steht beim Laden wieder vor
    // demselben Tisch: pending bleibt gesetzt, und der erste Tick öffnet ihn
    // erneut (events.js). Die Beträge darauf sind eingefroren und bleiben es.
    if (typeof s.metadata !== 'number') s.metadata = 0;
    if (typeof s.models   !== 'number') s.models   = 0;
    // Zwischenstand aufräumen: Modelle lagen kurzzeitig PRO FARM und belegten
    // dort einen ganzen Tier-Slot. Jetzt sind sie eine globale Zahl mit
    // 1 Modell = 1 Kapazität. Die alten Stückzahlen lassen sich nicht sinnvoll
    // umrechnen (ein Slot war je nach Stufe 500 bis 50 Mio Kapazität), deshalb
    // werden sie verworfen statt geraten — betroffen ist nur, wer die eine
    // Zwischenversion gespielt hat.
    (s.placedBuildings || []).forEach(function (b) {
      if (!b || b.id !== 'farm' || !b.state) return;
      delete b.state.models;
      delete b.state.metaStacks;
      delete b.state.metaCycleTime;
      // Serverkosten: alte Farmen starten mit voller Versorgung (0 verbrauchte
      // Zyklen). ⚠️ Bewusst KEIN zufälliger oder anteiliger Startwert — der
      // Posten ist neu, und die erste Begegnung damit soll die Erklärung sein
      // und nicht eine Rechnung, die schon offen war, als der Spieler das
      // Spiel zuletzt geschlossen hat.
      if (typeof b.state.upkeepCycles !== 'number') b.state.upkeepCycles = 0;
    });
    // „Anteil ×5" ist mit wb_rtb weggefallen: ein Deal auf dieser Stufe rutscht
    // auf „Anteil ×3". Eindeutig UND idempotent, weil die 4 als Stufen-ID nicht
    // mehr vergeben ist — ein zweiter Durchlauf findet nichts mehr. Alle
    // übrigen IDs bleiben in Ruhe, statt durchgeschlüsselt zu werden.
    //
    // ⚠️ Die frühere VOL_MAP { 1:1, 3:2, 5:3, 10:4 } ist ERSATZLOS RAUS. Sie
    // bildete die Nummerierung von vor dem Anteils-Umbau ab (`volume` war der
    // Multiplikator selbst), lief aber unbedingt bei JEDEM Laden und hat dabei
    // die aktuelle Nummerierung mit umgeschrieben: „Anteil" (2) fiel über
    // `|| 1` auf „fest" zurück, „Anteil ×3" (3) auf „Anteil". Die gemerkte
    // Volumen-Wahl war dadurch nach jedem Neuladen weg, und ein laufender
    // Anteils-Deal wurde mitten im Deal zur festen Stufe.
    var VOL_DROP = { 4: 3 };
    (s.placedBuildings || []).forEach(function (b) {
      if (!b || b.id !== 'werbe' || !b.state) return;
      ['deal', 'lastDeal'].forEach(function (key) {
        var d = b.state[key];
        if (!d || typeof d.volume !== 'number') return;
        if (VOL_DROP[d.volume]) d.volume = VOL_DROP[d.volume];
      });
      // grossWt kannten alte Deals nicht. Ein laufender Zyklus gilt als
      // bezahlt (charged), sein Ertrag würde also ohne Wert 0 auszahlen —
      // deshalb den Wert der gebuchten Stufe nachtragen.
      if (b.state.deal && typeof b.state.deal.grossWt !== 'number') {
        b.state.deal.grossWt =
          RT.state.adWatchtimeGross(b.state.deal.typeId, b.state.deal.volume);
      }
      // Dauerbetrieb: alte Deals bekommen ihn AN. Er ist die neue Vorgabe
      // (siehe bookAdDeal), und genau die Stände, die hier ankommen, sind
      // die, denen das Nachbuchen im Weg stand. Wer ihn nicht will, schaltet
      // ihn bei der nächsten Buchung ab — die Wahl bleibt in lastDeal stehen.
      ['deal', 'lastDeal'].forEach(function (key) {
        var d = b.state[key];
        if (d && typeof d.autoRenew !== 'boolean') d.autoRenew = true;
      });
    });
    // Das KI-Labor hat seit demselben Umbau einen eigenen State (wie die
    // Werbeagentur). Alte Instanzen haben ein leeres Objekt.
    (s.placedBuildings || []).forEach(function (b) {
      if (!b || b.id !== 'kilabor') return;
      if (!b.state) b.state = {};
      if (typeof b.state.conv        === 'undefined') b.state.conv = null;
      if (typeof b.state.modelsReady !== 'number')    b.state.modelsReady = 0;
      if (typeof b.state.lastConv    === 'undefined') b.state.lastConv = null;
    });
    // Einzeln gekaufte Grid-Felder gab es in älteren Ständen noch nicht.
    if (!Array.isArray(s.ownedTiles)) s.ownedTiles = [];
    // Die Phase-2-Freizone ist von 4×4 auf 5×4 gewachsen. Wer Spalte 4 schon
    // gekauft hatte, hätte die Felder weiter in ownedTiles stehen — und weil
    // die Array-Länge der Preis-Zähler ist, würde er für geschenktes Land
    // dauerhaft Aufschlag zahlen. isTileOwned() prüft die Freizone zuerst,
    // sichtbar wäre der Fehler also nicht.
    s.ownedTiles = s.ownedTiles.filter(function (key) {
      var p = String(key).split(',');
      var col = parseInt(p[0], 10), row = parseInt(p[1], 10);
      return !(col >= 0 && col < 5 && row >= 0 && row < 4);
    });
    // PR ist von der Werbeagentur ins Marketing-Center gewandert: dieselben
    // zwei Kampagnen, aber als CAMPAIGNS mit kind 'trend' und mit dem
    // Modifikator 'mk:<instanceId>'. Beides aus der Zwischenversion raus —
    // der alte 'pr:'-Modifikator würde sonst neben dem neuen mitzählen.
    if (s.trendMods) {
      Object.keys(s.trendMods).forEach(function (id) {
        if (id.indexOf('pr:') === 0) delete s.trendMods[id];
      });
    }
    (s.placedBuildings || []).forEach(function (b) {
      if (b && b.id === 'werbe' && b.state) delete b.state.pr;
    });
    // PR läuft jetzt über eine feste, kleine Zahl plattformweiter Plätze statt
    // über einen Modifikator je Marketing-Center ('mk:<instanceId>'). Genau
    // diese Stände sind der Grund für die Umstellung: wer viele Center hatte,
    // liegt womöglich mit einem Dutzend abklingender PR-Modifikatoren am
    // Trend-Cap. Sie werden deshalb weggeräumt — und was gerade WIRKLICH läuft,
    // bekommt seinen Platz zurück, damit niemand eine bezahlte Kampagne verliert.
    if (s.trendMods) {
      var mkMods = {};
      Object.keys(s.trendMods).forEach(function (id) {
        if (id.indexOf('mk:') !== 0) return;
        mkMods[id.slice(3)] = s.trendMods[id];
        delete s.trendMods[id];
      });
      var slotNodes = RT.state.PR_SLOT_NODES, total = 0;
      for (var n = 0; n < slotNodes.length; n++) {
        var se = (s.techtree || {})[slotNodes[n]];
        if (se && se.status === 'done') total++;
      }
      var prSlot = 0;
      (s.placedBuildings || []).forEach(function (b) {
        if (!b || b.id !== 'marketing' || !b.state || !b.state.active) return;
        var old = mkMods[b.instanceId];
        if (!old) return;                      // Reichweiten-Kampagne
        // Mehr laufende PR-Kampagnen als Plätze kann ein alter Stand durchaus
        // haben. Die überzähligen laufen ohne Platz zu Ende: sie verlieren
        // ihren Trend, blockieren aber wenigstens keinen Platz.
        if (prSlot >= total) return;
        prSlot++;
        b.state.active.prSlot = prSlot;
        s.trendMods['prslot:' + prSlot] = old;
      });
      // Die Zielgruppen-Offensive ist von einer Reichweiten- zu einer
      // PR-Kampagne geworden (kind 'users' → 'trend'). Eine Buchung, die noch
      // unter den alten Regeln läuft, hat weder einen PR-Platz noch einen
      // Modifikator und würde beim Ablauf ins Leere zahlen — der Tick zahlt bei
      // kind 'trend' keine User aus. Deshalb hier abbrechen: das Gebäude ist
      // sofort wieder frei, statt 60 s lang etwas zu tun, das nichts bewirkt.
      (s.placedBuildings || []).forEach(function (b) {
        if (!b || b.id !== 'marketing' || !b.state || !b.state.active) return;
        if (b.state.active.campaignId === 'zielgruppe' && !b.state.active.prSlot) {
          b.state.active = null;
        }
      });
      // PR klingt seit dem Vertrags-Umbau in fester Zeit aus (PR_DECAY_SEC)
      // statt über die globale Rate. Laufende Modifikatoren haben das Feld
      // noch nicht und würden sonst zehn Minuten nachhallen — genau das, was
      // die Umstellung abschafft. Rate aus dem Buchungswert, wie beim Setzen.
      Object.keys(s.trendMods).forEach(function (id) {
        if (id.indexOf('prslot:') !== 0) return;
        var m = s.trendMods[id];
        if (m && !m.decay) m.decay = Math.abs(m.value) / RT.state.PR_DECAY_SEC;
      });
    }
    // Entwicklungs-Plätze: eine laufende Node merkt sich jetzt, in welchem
    // Gebäude sie entwickelt wird (entry.slot) — vorher gab es nur das HQ,
    // also keinen Grund für die Angabe. Ohne slot fiele sie zwar über
    // RT.techtree.slotOf() ohnehin aufs HQ zurück; hier festgeschrieben, damit
    // der Eintrag nach dem ersten Bürokauf nicht plötzlich woanders hängt.
    // Das gilt für ALLE Reiter: Marketing- und Werbung-Nodes belegen zwar
    // keinen Platz, zeigen ihren Fortschritt aber genauso auf einem Gebäude.
    var hqInst = (s.placedBuildings || []).filter(function (b) { return b && b.id === 'hq'; })[0];
    if (hqInst) {
      Object.keys(s.techtree || {}).forEach(function (nid) {
        var e = s.techtree[nid];
        if (!e || e.slot) return;
        if (e.status !== 'in_progress' && e.status !== 'ready') return;
        e.slot = hqInst.instanceId;
      });
    }
    // Die Intro-Tour (Grid, HQ, Zahlen, Shop) gab es früher nicht. Wer schon
    // spielt, hat den Anfang hinter sich — ihm die Tour beim nächsten Laden
    // vorzusetzen wäre nur verwirrend. Neue Spielstände starten mit false.
    if (typeof s.introTourSeen !== 'boolean') s.introTourSeen = true;
    // Dieselbe Regel für die Karte zum Watchtime-Multiplikator: wer die Achse
    // schon angefangen hat, sieht den ×-Chip längst — die Erklärung käme zu
    // spät. Wer noch keine solche Node hat, bekommt sie beim ersten Mal ganz
    // normal, deshalb hier kein pauschales true.
    if (typeof s.watchtimeMultSeen !== 'boolean') {
      s.watchtimeMultSeen = RT.state.watchtimeMult() > 1;
    }
    // Netzwerkeffekt (2026-08-06). Beide Karten nach derselben Regel wie oben:
    // wer den Zustand schon hat, dem käme die Erklärung zu spät.
    if (typeof s.networkTourSeen !== 'boolean') {
      s.networkTourSeen = RT.state.networkEffect() > 2;
    }
    if (typeof s.whitePatternSeen !== 'boolean') {
      s.whitePatternSeen = RT.state.networkKMods().length > 0;
    }
    // ⚠️ Der Ansage-Merker MUSS auf den Istwert und nicht auf 0. Eine große
    // bestehende Plattform steht sofort bei +8,0 — bei 0 würde der Tick beim
    // ersten Laden sechzehn Toasts hintereinander feuern.
    if (typeof s.networkSeen !== 'number') {
      s.networkSeen = RT.state.networkEffect();
    }
    // Sättigung (2026-08-07). Dieselbe Regel: wer schon über 1 Mrd Usern
    // steht, hat den Übergang nie erlebt — die Ansage käme zu spät und würde
    // einen Zustand melden, der für ihn längst normal ist.
    if (typeof s.networkSatSeen !== 'boolean') {
      s.networkSatSeen = RT.state.networkSaturating();
    }
    // ⚠️ Hier stand bis zum 2026-08-10 eine Umbenennung der Stufen 4 und 5
    // ({ schaf: 'ziege', schwein: 'schaf' }). Sie ist KOMPLETT RAUS — der
    // 'schaf'-Eintrag hat aktive Spielstände beschädigt, der 'schwein'-Eintrag
    // war ohne ihn wirkungslos.
    //
    // Der Schaden: migrate() läuft bei JEDEM Laden, und die 'schaf' der
    // Zielmenge war dieselbe wie die 'schaf' der Quellmenge. Eine echte
    // Schaf-Farm (Stufe 5) fiel dadurch bei jedem Reload auf Ziege (Stufe 4)
    // zurück — beliebig oft wiederholbar, wer neu hochstufte, verlor die
    // 10,8 Mio € beim nächsten Laden erneut. Sichtbar war nur die Farm, nie die
    // Ursache. Dass das Lookup KETTENFREI war (ein Durchlauf schlüsselt jede
    // Farm höchstens einmal um), hat nichts geholfen: der Durchlauf selbst kam
    // ja pro Reload wieder.
    //
    // Derselbe Fehler wie bei der VOL_MAP oben, und dieselbe Lehre: eine
    // Migration, die IDs durchschlüsselt, braucht einen Marker oder eine
    // Zielmenge, die sich von der Quellmenge unterscheidet (CLAUDE.md §6).
    //
    // Warum 'schwein' gleich mit ging: es ist als Stufen-ID nirgends mehr
    // vergeben, das Mapping konnte also nur auf einem Stand feuern, der die
    // Umbenennung noch nie gesehen hat. Genau dessen Nichtexistenz ist aber die
    // Begründung dafür, den 'schaf'-Eintrag streichen zu dürfen — beides
    // zugleich geht nicht. Gäbe es solche Stände noch, bräuchte es statt einer
    // ID-Tabelle einen VERSION-Bump.
    // Reichweiten-Kampagnen heißen jetzt wie in v1. Eine laufende Kampagne
    // referenziert ihre alte ID — ohne Mapping fände campaignById() sie nicht
    // und der Spieler bekäme nach Ablauf nichts für sein Geld.
    var CAMP_RENAMES = { zettel: 'stadtaktion', insta: 'empfehlung', tv: 'hypeburst' };
    (s.placedBuildings || []).forEach(function (b) {
      if (!b || b.id !== 'marketing' || !b.state || !b.state.active) return;
      var old = b.state.active.campaignId;
      if (CAMP_RENAMES[old]) b.state.active.campaignId = CAMP_RENAMES[old];
    });

    // --- Community Center abgeschafft (2026-08-09) ------------------------
    // Von allem, was für das Gebäude entworfen war, hatte es nur die
    // Umsatzbeteiligung ins Spiel geschafft; sie lebt als Creator-Beteiligung
    // in der Anziehungskraft-Spalte weiter (CLAUDE.md §7.2). Bestehende
    // Gebäude fliegen raus — ihre Felder werden dadurch automatisch wieder
    // frei, weil die Belegung aus placedBuildings kommt.
    s.placedBuildings = (s.placedBuildings || []).filter(function (b) {
      return !b || b.id !== 'community';
    });
    // Der Modifikator der laufenden Beteiligung. Ohne das Löschen bliebe er im
    // Trend-Modal stehen und würde ewig weiterzählen: den Wert schob der Tick
    // des Gebäudes nach, und den gibt es nicht mehr.
    if (s.trendMods) delete s.trendMods['cc:creator'];
    // Der Node „KI-Agents" ist ersatzlos gestrichen. programmCapacity() läuft
    // über NODES und ignoriert verwaiste Einträge ohnehin — der Eintrag wird
    // trotzdem entfernt, damit ein alter Stand nicht dauerhaft eine Node mit
    // sich trägt, die es nicht mehr gibt.
    if (s.techtree) delete s.techtree.ki_agents;
    // Die Creator-Beteiligung ist von einer festen Buchung (40.000 € → +3,0)
    // zu einer Regler-Kampagne geworden. Eine Buchung, die noch unter den alten
    // Regeln läuft, hat den Wert nicht gespeichert — sie hat aber für das
    // Maximum bezahlt, also bekommt sie genau das.
    (s.placedBuildings || []).forEach(function (b) {
      if (!b || b.id !== 'marketing' || !b.state || !b.state.active) return;
      var a = b.state.active;
      if (a.campaignId !== 'influencer' || typeof a.trend === 'number') return;
      var c = RT.state.campaignById('influencer');
      a.trend = c ? c.trend : 3;
    });
  }

  /* Den lokalen Stand wegwerfen, ohne den Speicher stillzulegen.

     Unterschied zu wipe(): dort ist danach Schluss (wiped = true, kein
     Rebound aus dem beforeunload-Flush, der Serverstand wird gelöscht).
     Hier fängt das Spiel nur von vorn an und speichert sofort wieder —
     gebraucht beim Boot, wenn der Server für dieses Konto keinen Stand
     hat und der Gerätestand deshalb nicht gelten darf (js/main.js).

     Der Dirty-Marker muss mit weg: er hieße sonst „diese Reste sind
     ungepushter Fortschritt", und der nächste Boot schöbe sie in den
     Account, den wir gerade frisch angefangen haben.                  */
  function dropLocal() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (RT.cloud) RT.cloud.clearDirty();
  }

  /* Gibt ein Promise zurück, weil der Serverstand per RPC weg muss und der
     Aufrufer (Debug-Neustart) direkt danach neu lädt. Ohne das Warten
     stirbt der RPC mit der Seite und der nächste Boot zöge den gerade
     gelöschten Stand wieder herunter — der Neustart wäre wirkungslos. */
  function wipe() {
    wiped = true;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (RT.cloud) return RT.cloud.reset();
    return Promise.resolve();
  }

  // Vom Tick aufgerufen, aber höchstens alle TICK_SAVE_MS — ein Save je
  // Sekunde wäre eine JSON-Serialisierung des ganzen States je Sekunde.
  function onTick() {
    if (wiped) return;
    var now = Date.now();
    if (now - lastTickSave < TICK_SAVE_MS) return;
    lastTickSave = now;
    save();
  }

  function init() {
    RT.bus.on('state:changed', scheduleSave);
    RT.bus.on('tick', onTick);
    window.addEventListener('beforeunload', save);
    // pagehide und visibilitychange feuern auf Tablets zuverlässig, wo
    // beforeunload oft übersprungen wird — beim Wegwischen der App, beim
    // Tab-Wechsel und beim Sperren des Bildschirms.
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') save();
    });
  }

  RT.storage = {
    VERSION: VERSION,          // cloud.js schickt sie als save_version mit
    save: save,
    load: load,
    applyServerSave: applyServerSave,
    dropLocal: dropLocal,
    wipe: wipe,
    init: init
  };
})(window.RT3);
