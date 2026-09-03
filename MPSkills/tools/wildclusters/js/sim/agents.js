/**
 * Was alle Tiere gemeinsam haben: Zustandsnamen, individuelle Streuung,
 * Tagesform und die Fortbewegung Schritt fuer Schritt.
 *
 * Die Streuung ist kein Beiwerk, sondern Voraussetzung fuer die spaetere
 * Gruppierungsaufgabe: laufen alle Tiere einer Art exakt gleich, wird das
 * Clustering zum Ablesen. Deshalb bekommt jedes Individuum feste Abweichungen
 * (Tempo, Beduerfnisse, Scheu) und obendrauf eine ueber Minuten driftende
 * Tagesform.
 *
 * Die Zustandsnummern sind Teil des Datenformats der Aufzeichnung - neue
 * Zustaende werden hinten angehaengt, nie dazwischen eingefuegt.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  var STATES = {
    schlafen: 0,
    ruhen: 1,
    gruendeln: 2,
    schwimmen: 3,
    ausweichen: 4,
    fliehen: 5,
    fliegen: 6,
    aesen: 7,
    gehen: 8,
    trinken: 9,
    sichern: 10,
    wuehlen: 11,
    suhlen: 12,
    // Der Bau des Kaninchens ist kein Schlaf: das Tier ist wach, sitzt aber
    // drin und ist unerreichbar. Genau deshalb braucht er einen eigenen
    // Zustand - "schlafen" waere gelogen, "ruhen" verwechselbar mit dem
    // naechtlichen Kreisen des Barsches.
    bau: 13,
    hoppeln: 14,
    // Das zackige Jagen der Fledermaus im Jagdgebiet - eigens von "fliegen"
    // getrennt, weil "fliegen" schon der geradlinige Reiseflug zwischen zwei
    // festen Orten ist (Ente, spaeter auch die Fledermaus selbst zwischen
    // Schlafplatz und Jagdgebiet). Beides ist airborne, aber messbar anders.
    jagen: 15,
    // Die Hetze des Fuchses hinter einer Ente oder einem Kaninchen her. Nicht
    // 'jagen' (15) mitbenutzt, obwohl das Wort passt: dessen AIRBORNE-Eintrag
    // steht auf true, weil es das Jagen der *Fledermaus* meint - ein hetzender
    // Fuchs zaehlte damit als "Zeit ueber Land (Flug)", und den Eintrag
    // umzustellen braeche die gemessenen 38 % der Fledermaus.
    hetzen: 16,
    // Das Tier gehoert zur Welt, ist aber noch nicht da: ein Nachzuegler vor
    // dem Bruch bei Tag 5. Es steht schon in agents (damit die Nummern und die
    // Aufzeichnung von Anfang an vollstaendig sind), wird aber nicht
    // aktualisiert, nicht gezeichnet und von keiner Abfrage gesehen.
    //
    // Ein eigener Zustand und nicht 'bau' mitbenutzt, obwohl beide "nicht
    // erreichbar" heissen: 'bau' ist ein wacher Dachs unter der Erde und wird
    // gemessen, 'abwesend' ist gar kein Tierleben. Zaehlte der Tracker es mit,
    // haette jeder Nachzuegler fuenf Tage Schlaf im Merkmalsvektor stehen.
    abwesend: 17,
    // Der Suchflug des Bussards: eine lange Schleife ueber einer offenen
    // Flaeche. Eigens von 'fliegen' (6) getrennt, obwohl beides in der Luft
    // stattfindet - 'fliegen' ist der *gerade* Zielflug (Ente, Fledermaus, und
    // beim Bussard die Strecke zwischen zwei Kreisen), und der Unterschied
    // zwischen Gerade und Schleife ist genau das, was diese Art ausmacht.
    // Sein enger Jagdkreis ueber einem Kaninchenbau benutzt dagegen 'jagen'
    // (15) mit: dessen AIRBORNE-Eintrag steht auf true und stimmt hier, anders
    // als beim hetzenden Fuchs, der deshalb einen eigenen Zustand brauchte.
    kreisen: 18,
    // Das reglose Lauern des Hechts im Uferkraut. Nicht 'ruhen' (1)
    // mitbenutzt, obwohl beides "bewegt sich kaum" heisst: 'ruhen' ist das
    // naechtliche Kreisen des Barschschwarms, also ein Feierabend. Der Hecht
    // hat keinen - er ist Tag und Nacht wach, und das Lauern *ist* seine
    // Taetigkeit. Und nicht 'sichern' (10), das beim Reh ein kurzes Stutzen
    // und beim Bussard die Sitzpause meint: hier ist es der Zustand, in dem
    // diese Art zwei Drittel ihres Lebens verbringt, und die Kontrollanzeige
    // soll ihn beim Namen nennen.
    lauern: 19,
    // Der Igel rollt sich bei Gefahr ein (data/tiere.md §2, Reaktionstyp
    // 'erstarrt'). Nicht 'sichern' (10) mitbenutzt, obwohl beides "steht
    // still" heisst: 'sichern' ist ein *freiwilliger* Halt (das Stutzen des
    // Rehs, die Sitzpause des Bussards), das Einrollen ist die Antwort auf
    // eine Stoerung - es steht an derselben Stelle des Ablaufs wie 'fliehen'
    // bei jeder anderen Art. Der Igel ist die einzige Art des Katalogs, die
    // bei Gefahr *langsamer* wird statt schneller, und genau das soll die
    // Kontrollanzeige beim Namen nennen koennen.
    einrollen: 20
  };

  var STATE_NAMES = ['schlafen', 'ruhen', 'gruendeln', 'schwimmen', 'ausweichen', 'fliehen',
    'fliegen', 'aesen', 'gehen', 'trinken', 'sichern', 'wuehlen', 'suhlen', 'bau', 'hoppeln',
    'jagen', 'hetzen', 'abwesend', 'kreisen', 'lauern', 'einrollen'];

  /** Fuer die Anzeige - die UI ist deutsch, der Code bleibt ASCII. */
  var STATE_LABELS = ['schläft', 'ruht', 'gründelt', 'schwimmt', 'weicht aus', 'flieht', 'fliegt',
    'äst', 'geht', 'trinkt', 'sichert', 'wühlt', 'suhlt sich', 'sitzt im Bau', 'hoppelt', 'jagt',
    'hetzt', 'noch nicht da', 'kreist', 'lauert', 'rollt sich ein'];

  /** Zustaende, in denen sich das Tier ueber Land bewegt (fuer Spur und Merkmale). */
  var AIRBORNE = [false, false, false, false, false, false, true, false, false, false, false,
    false, false, false, false, true, false, false, true, false, false];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /** Winkeldifferenz auf [-PI, PI] normieren. */
  function angleDelta(from, to) {
    var d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function turnTowards(from, to, maxStep) {
    var d = angleDelta(from, to);
    if (d > maxStep) d = maxStep;
    if (d < -maxStep) d = -maxStep;
    return from + d;
  }

  /**
   * Ist das Tier zu dieser Zeit wach? spec.awake ist ein Anteil des Tages, kein
   * Zeitpunkt - dadurch bleibt die Angabe lesbar, wenn sich die Tageslaenge
   * einmal aendert.
   *
   * Bei einem nachtaktiven Tier laeuft das Fenster ueber Mitternacht: es
   * beginnt spaeter am Tag (0.72) als es endet (0.28). Dann ist "wach" nicht
   * mehr der Bereich *zwischen* den beiden Werten, sondern der ausserhalb.
   */
  function isAwake(time, species) {
    var f = WL.SimTime.dayFraction(time);
    var from = species.awake[0];
    var to = species.awake[1];
    if (from <= to) return f >= from && f < to;
    return f >= from || f < to;
  }

  /**
   * Die Zeit zwischen "Feierabend" und dem Beginn des naechsten Wachfensters.
   * Ein Tier bricht schon vor der Ruhephase zum Schlafplatz auf, damit der Weg
   * dorthin nicht in die Ruhezeit faellt - beim Reh war das der Unterschied
   * zwischen 4 % und 15 % gemessener Nachtaktivitaet.
   *
   * Wie isAwake haelt auch das den Umschlag ueber Mitternacht aus; das Reh
   * rechnet den Vergleich weiterhin selbst, damit seine bereits justierten
   * Werte nachweisbar unberuehrt bleiben.
   */
  function isSettling(time, species, leaveAt) {
    var f = WL.SimTime.dayFraction(time);
    var wake = species.awake[0];
    if (leaveAt <= wake) return f >= leaveAt && f < wake;
    return f >= leaveAt || f < wake;
  }

  /** Feste Abweichungen dieses Individuums, aus data/tiere.md abgeleitet. */
  function createTraits(rng, species) {
    var v = species.variation;
    return {
      speed: 1 + rng.range(-v.speed, v.speed),
      needs: 1 + rng.range(-v.needs, v.needs),
      shyness: 1 + rng.range(-v.shyness, v.shyness)
    };
  }

  /**
   * Tagesform: ein Faktor, der ueber Minuten zwischen zwei Werten wandert.
   * Dadurch ist dieselbe Ente morgens traeger als mittags, ohne dass ein
   * Zustandswechsel noetig waere.
   */
  function updateMood(agent, species, dt) {
    agent.moodTimer -= dt;
    if (agent.moodTimer <= 0) {
      agent.moodFrom = agent.mood;
      agent.moodTo = agent.rng.range(species.mood.min, species.mood.max);
      agent.moodSpan = species.mood.driftSeconds * agent.rng.range(0.6, 1.6);
      agent.moodTimer = agent.moodSpan;
    }
    var t = 1 - clamp(agent.moodTimer / agent.moodSpan, 0, 1);
    // Weiche Kurve, damit der Wechsel nicht als Knick sichtbar wird.
    var s = t * t * (3 - 2 * t);
    agent.mood = agent.moodFrom + (agent.moodTo - agent.moodFrom) * s;
  }

  /**
   * Tempo fuer einen Zustand: Spanne aus dem Katalog, einmal pro Abschnitt
   * gezogen ("mal schneller, mal langsamer"), mal Individuum, mal Tagesform.
   */
  function drawSpeed(agent, species, state) {
    var range = species.speed[state];
    if (!range) return 0;
    return agent.rng.range(range[0], range[1]);
  }

  function effectiveSpeed(agent, base) {
    return base * agent.traits.speed * agent.mood;
  }

  /**
   * Ein Bewegungsschritt im Wasser, der das Gewaesser nicht verlaesst.
   *
   * Die Teiche sind rundlich, aber nicht konvex - eine gerade Linie zum Ziel
   * kann ans Ufer stossen. Statt eines Wegfinders wird der Kurs faecherfoermig
   * ausgewichen; das sieht aus wie ein Tier, das am Ufer entlangzieht, und
   * kostet fast nichts. Findet sich gar keine Richtung, meldet die Funktion
   * "blockiert" und der Aufrufer sucht sich ein neues Ziel.
   *
   * @returns {'moving'|'blocked'}
   */
  var FAN = [0, 0.35, -0.35, 0.75, -0.75, 1.2, -1.2, 1.9, -1.9];

  /**
   * Welcher Boden traegt dieses Tier? Zwei Domaenen teilen sich denselben
   * Faecher: Wasser (bleib in diesem Gewaesser) und Land (alles ausser Wasser).
   * Uebergeben wird die Funktion, nicht eine Closure - der Faecher laeuft
   * 30 000 Ticks lang fuer jedes Tier, da soll nichts angelegt werden.
   */
  function inWater(habitat, body, x, y) { return habitat.inBody(body, x, y); }
  function onLand(land, unused, x, y) { return land.walkable(x, y); }

  /** Der Faecher allein, ausgehend von der schon gesetzten Blickrichtung. */
  function fanMove(agent, canEnter, domain, body, step) {
    for (var i = 0; i < FAN.length; i++) {
      var a = agent.heading + FAN[i];
      var nx = agent.x + Math.cos(a) * step;
      var ny = agent.y + Math.sin(a) * step;
      if (canEnter(domain, body, nx, ny)) {
        agent.x = nx;
        agent.y = ny;
        if (i > 0) agent.heading = a;
        return 'moving';
      }
    }
    return 'blocked';
  }

  function moveStep(agent, canEnter, domain, body, dt, step, wanted, turnRate) {
    agent.heading = turnTowards(agent.heading, wanted, turnRate * dt);
    if (step <= 0) return 'moving';
    return fanMove(agent, canEnter, domain, body, step);
  }

  /** Auf einen Zielpunkt zulaufen - dasselbe wie swimStep, nur an Land. */
  function walkStep(agent, land, dt, speed, turnRate, arriveRadius) {
    var dx = agent.tx - agent.x;
    var dy = agent.ty - agent.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= (arriveRadius || 2)) return 'arrived';
    return moveStep(agent, onLand, land, null, dt, Math.min(speed * dt, dist),
      Math.atan2(dy, dx), turnRate);
  }

  /** In eine Richtung laufen, ohne Ziel (Flucht, zielloses Weiterziehen). */
  function roamStep(agent, land, dt, speed, wanted, turnRate) {
    return moveStep(agent, onLand, land, null, dt, speed * dt, wanted, turnRate);
  }

  /**
   * Auf einen Zielpunkt (agent.tx/ty) zuschwimmen.
   * @returns {'moving'|'arrived'|'blocked'}
   */
  function swimStep(agent, habitat, body, dt, speed, turnRate, arriveRadius) {
    var dx = agent.tx - agent.x;
    var dy = agent.ty - agent.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= (arriveRadius || 2)) return 'arrived';
    return moveStep(agent, inWater, habitat, body, dt, Math.min(speed * dt, dist),
      Math.atan2(dy, dx), turnRate);
  }

  /**
   * In eine Richtung schwimmen, ohne Ziel. Das ist der Schritt fuer alles
   * Kraftbasierte: ein Schwarm hat keinen Punkt, den er ansteuert, sondern
   * eine Wunschrichtung, die sich in jedem Tick aus Nachbarn, Ufer und
   * gemeinsamem Ziel neu ergibt.
   *
   * @returns {'moving'|'blocked'}
   */
  function steerStep(agent, habitat, body, dt, speed, wanted, turnRate) {
    return moveStep(agent, inWater, habitat, body, dt, speed * dt, wanted, turnRate);
  }

  /**
   * Ein Schritt mit Traegheit: das Tier hat eine Geschwindigkeit (vx/vy), auf
   * die Kraefte wirken, statt einer Richtung, auf die es eindreht.
   *
   * Der Unterschied ist nicht kosmetisch. `steerStep` filtert eine
   * Wunschrichtung und kann sie deshalb nie ueberschreiten - ein Tier, das zum
   * Schwarmmittelpunkt gezogen wird, kommt dort an und bleibt. Mit Traegheit
   * schiesst es hindurch und wird zurueckgeholt. Genau dieses Ueberschiessen
   * ist der Unterschied zwischen einem wogenden Schwarm und einer Formation,
   * die geschlossen ueber den See gleitet.
   *
   * Die Beschleunigung kommt vom Aufrufer; hier wird nur integriert, das Tempo
   * in sein Band gezwungen und gefahren. Lenkt der Faecher am Ufer den Kurs ab,
   * dreht die Geschwindigkeit mit - das ist das Abprallen, und es mischt den
   * Schwarm zusaetzlich durch.
   *
   * @returns {'moving'|'blocked'}
   */
  function driftStep(agent, habitat, body, dt, ax, ay, minSpeed, maxSpeed) {
    agent.vx += ax * dt;
    agent.vy += ay * dt;

    var v = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
    if (v < 1e-6) {
      // Voellig ausgebremst: in der bisherigen Blickrichtung wieder anfahren.
      agent.vx = Math.cos(agent.heading) * minSpeed;
      agent.vy = Math.sin(agent.heading) * minSpeed;
      v = minSpeed;
    } else if (v < minSpeed || v > maxSpeed) {
      var target = v < minSpeed ? minSpeed : maxSpeed;
      agent.vx = agent.vx / v * target;
      agent.vy = agent.vy / v * target;
      v = target;
    }

    agent.heading = Math.atan2(agent.vy, agent.vx);
    var result = fanMove(agent, inWater, habitat, body, v * dt);
    if (result === 'moving') {
      agent.vx = Math.cos(agent.heading) * v;
      agent.vy = Math.sin(agent.heading) * v;
    }
    return result;
  }

  // ------------------------------------------------ Beitritt zu einer Art
  //
  // Zwei Abfragen, mit denen ein spawn() herausfindet, ob es gerade das erste
  // Tier seiner Art anlegt oder ein spaeteres dazustellt.

  /**
   * Die schon lebenden Tiere derselben Art - und damit die Antwort auf die
   * Frage "bin ich ein Nachzuegler?", ohne dass jemand sie stellen muss.
   *
   * Beim Aufbau der Welt ist diese Liste *immer* leer: spawn() bekommt dort nur
   * die frueheren Arten zu sehen, die eigenen Tiere wandern erst nach der
   * Rueckkehr in ctx.agents (js/sim/simulation.js). Gefuellt ist sie nur am
   * Bruch bei Tag 5, wenn spawnLate ein einzelnes Tier in eine laufende Welt
   * setzt. Ein Verhaltensmodul braucht deshalb kein Flag im Kontext und keine
   * zweite Einstiegsfunktion - es fragt nach seinesgleichen und findet sie
   * genau dann, wenn es spaet dran ist.
   */
  function livingOf(agents, speciesId) {
    var out = [];
    var list = agents || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].speciesId === speciesId) out.push(list[i]);
    }
    return out;
  }

  /**
   * Die verschiedenen Gruppenobjekte, die diese Art schon hat - Familien,
   * Rotten, Schwaerme, je nach Feldname.
   *
   * Das ist die Bedingung, unter der eine Art ueberhaupt nachtraeglich
   * dazukommen darf (spec.lateArrival in js/sim/species.js): **was der ganzen
   * Art gehoert, wird abgeholt statt neu angelegt.** Ein Nachzuegler, der sich
   * einen eigenen Bau sucht, setzt einen zweiten Punkt auf die Karte - und ein
   * Punkt, der an Tag 6 auftaucht, ist genau der Hinweis, den die
   * Gruppierungsaufgabe nicht geben darf. Der Renderer wuerde ihn auch wirklich
   * zeichnen: collectHomes in js/render/agentRenderer.js unterscheidet Baue an
   * der Objektidentitaet, nicht an den Koordinaten.
   *
   * Aus demselben Grund wird auch hier an der Identitaet unterschieden: zwei
   * Familien koennen auf denselben Zahlen sitzen, das Objekt ist die Wahrheit.
   */
  function groupsOf(agents, speciesId, key) {
    var out = [];
    var living = livingOf(agents, speciesId);
    for (var i = 0; i < living.length; i++) {
      var group = living[i][key];
      if (!group || out.indexOf(group) >= 0) continue;
      out.push(group);
    }
    return out;
  }

  WL.Agents = {
    STATES: STATES,
    STATE_NAMES: STATE_NAMES,
    STATE_LABELS: STATE_LABELS,
    AIRBORNE: AIRBORNE,
    isAwake: isAwake,
    isSettling: isSettling,
    livingOf: livingOf,
    groupsOf: groupsOf,
    createTraits: createTraits,
    updateMood: updateMood,
    drawSpeed: drawSpeed,
    effectiveSpeed: effectiveSpeed,
    swimStep: swimStep,
    steerStep: steerStep,
    driftStep: driftStep,
    walkStep: walkStep,
    roamStep: roamStep,
    turnTowards: turnTowards,
    angleDelta: angleDelta,
    clamp: clamp
  };

  /** Verhaltensmodule, je Art eines. Gefuellt von js/sim/<tier>.js. */
  WL.Brains = WL.Brains || {};
})(typeof window !== 'undefined' ? window : globalThis);
