// Plattform-Generierung und Kollision.
//
// NEUE Mechanik (v1):
// - JEDE Plattform (gut wie schlecht) bouncet das Monster nach oben.
// - "Schlecht" bricht NICHT mehr weg — sie gibt nur Minus-Punkte.
// - Kategorien-Wahl läuft komplett über den Algorithmus (gewichtet).
//   → Wer viel auf Klickbait springt, sieht immer mehr Klickbait.
// - Weniger Plattformen (größere Gaps, deutlich seltener Doppelreihen)
//   und schmaler → Doomscroll-Gefühl.
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};
  const { view } = FE.util;

  const state = {
    plats: [],
    floats: [],       // "+15" / "-20" Text-Overlays
    parts: [],        // Feedback-Partikel bei rotem Kontakt (sanft, nicht Crack)
    orbs: [],         // 2b: Akku-Kugeln in der Welt
    bars: [],         // 2c: Realitätscheck-Balken
    orbTimer: 0,      // Countdown bis zur nächsten Kugel
    barTimer: 0,      // Countdown bis zum nächsten Balken
    highestGen: 0,
    platId: 0,
    lastPlatId: -1,   // Combo-Guard: keine Punkte durch Selbst-Loop
    combo: 0,
    bonus: 0,
    shake: 0,
    rowIndex: 0
  };

  // 2b: Akku-Kugeln
  const ORB_GAIN         = 20;   // %-Ladung pro eingesammelter Kugel
  const ORB_INTERVAL_MIN = 5;    // s
  const ORB_INTERVAL_MAX = 10;   // s
  const ORB_RADIUS       = 0.028; // U-Anteil
  const ORB_FALL_SPEED   = 60;   // px/s — halb so schnell wie BAR_SPEED

  // 2c: Realitätscheck-Balken
  const BAR_SPEED     = 120;  // px/s Fall in Welt
  const BAR_THICKNESS = 80;   // px
  const BAR_RAMP_MIN  = 2000; // ab Score → häufiger
  const BAR_RAMP_MAX  = 5000; // ab Score → vollständig gerampt

  // ── Plattform-Rampe (Zeit-basiert, matcht 2a-Timing) ────────────────
  // Ab PLAT_DELAY Sekunden ins Spiel: Reihen werden linear weiter
  // auseinandergezogen und Doppelreihen (die "Wahl-Momente") werden
  // seltener. Feinjustierung ohne die Wurfphysik zu berühren.
  const PLAT_DELAY     = 30;    // s — Ruhe vor der Rampe (deckungsgleich mit 2a)
  const PLAT_RAMP      = 240;   // s — bis Vollgas erreicht
  const PLAT_GAP_EXTRA = 60;    // px — zusätzlicher Reihenabstand bei Vollgas
  const PLAT_DBL_BASE  = 0.12;  // Doppelreihen-Chance zu Beginn (früher 0.10..0.28)
  const PLAT_DBL_END   = 0.03;  // Doppelreihen-Chance bei Vollgas

  function reset(startY){
    state.plats.length = 0;
    state.floats.length = 0;
    state.parts.length = 0;
    state.orbs.length = 0;
    state.bars.length = 0;
    state.orbTimer = ORB_INTERVAL_MIN + Math.random() * (ORB_INTERVAL_MAX - ORB_INTERVAL_MIN);
    state.barTimer = nextBarInterval(0);
    state.highestGen = startY;
    state.platId = 0;
    state.lastPlatId = -1;
    state.combo = 0;
    state.bonus = 0;
    state.shake = 0;
    state.rowIndex = 0;
  }

  function nextBarInterval(score){
    // Linear rampt zwischen [20,40]s (Score<2000) und [10,30]s (Score>=5000).
    const t = Math.max(0, Math.min(1, (score - BAR_RAMP_MIN) / (BAR_RAMP_MAX - BAR_RAMP_MIN)));
    const min = 20 - 10 * t;
    const max = 40 - 10 * t;
    return min + Math.random() * (max - min);
  }

  function mkPlat(x, y, cat){
    return {
      id: state.platId++,
      x, y,
      // Breiter als der Prototyp — damit der Handle-Name in Zeile 1 komplett
      // lesbar ist (auch längere wie 'midjourney_daily'). Bewusst nicht so
      // breit, dass Doppelreihen kollidieren.
      w: view.U * 0.30,
      cat,
      handle: FE.categories.pickHandle(cat),
      sample: FE.categories.pickSampleText(cat),
      hitFlash: 0                       // kurzes visuelles Feedback nach Landung
    };
  }

  // Wählt eine Kategorie aus dem GLOBALEN Pool, gewichtet über den
  // Algorithmus. Am Rundenanfang alle 10 Kategorien gleich häufig
  // (BASE_WEIGHT sorgt für uniforme Startverteilung). Sobald der
  // Spieler mit einer Kategorie interagiert, steigt deren Gewicht.
  function pickCat(){
    return FE.algorithm.pickFrom(FE.categories.ALL);
  }

  function genRow(climb, elapsed){
    const { W, U } = view;
    // Zeit-Rampe: 0 während Delay, dann linear auf 1 über PLAT_RAMP Sekunden.
    const t = Math.max(0, Math.min(1, ((elapsed || 0) - PLAT_DELAY) / PLAT_RAMP));
    const extraGap = t * PLAT_GAP_EXTRA;

    // Etwas größere Gaps als im Prototyp (weniger Plattformen pro Bildschirm).
    // Apex bei Standard-Bounce ist ~194px — Max-Gap bleibt darunter, damit
    // Reihe zu Reihe ohne Dash erreichbar ist. Nur der climb-Anteil wächst
    // langsam mit der Höhe; extraGap kommt aus der Zeit-Rampe.
    const gap = 115 + Math.random() * 45 + Math.min(climb / 45, 15) + extraGap;
    const y = state.highestGen - gap;

    // Doppelreihen: der "Wahl-Moment". Rampt linear von PLAT_DBL_BASE nach
    // PLAT_DBL_END — später im Spiel deutlich seltener.
    const dblRate = PLAT_DBL_BASE + (PLAT_DBL_END - PLAT_DBL_BASE) * t;
    const cardHalfW = U * 0.15;              // w = U*0.30, halbe Karten-Breite
    const edgeMargin = cardHalfW + 4;        // Karte bleibt komplett auf dem Screen

    if (Math.random() < dblRate){
      // Zwei Karten: linke in linker Screen-Hälfte, rechte in rechter.
      // Mit sichtbarem Sicht-Zwischenraum in der Mitte.
      const cardGap = 6;
      const midX = W / 2;
      const leftMin  = edgeMargin;
      const leftMax  = midX - cardHalfW - cardGap / 2;
      const rightMin = midX + cardHalfW + cardGap / 2;
      const rightMax = W - edgeMargin;
      const xL = leftMin  + Math.random() * Math.max(0, leftMax  - leftMin);
      const xR = rightMin + Math.random() * Math.max(0, rightMax - rightMin);
      state.plats.push(mkPlat(xL, y, pickCat()));
      state.plats.push(mkPlat(xR, y, pickCat()));
    } else {
      const x = edgeMargin + Math.random() * (W - 2 * edgeMargin);
      state.plats.push(mkPlat(x, y, pickCat()));
    }
    state.highestGen = y;
    state.rowIndex++;
  }

  // Kollision. Nur beim Fallen (vy > 0). feetPrev/feet gegen Tunneling.
  function checkCollisions(dt){
    const { mon } = FE.player.state;
    if (mon.vy <= 0) return;
    const feetPrev = mon.y - mon.vy * dt + mon.r;
    const feet     = mon.y + mon.r;

    for (const p of state.plats){
      if (feetPrev <= p.y + 6 && feet >= p.y &&
          Math.abs(mon.x - p.x) < p.w / 2 + mon.r * 0.25){
        onHit(p);
        break;
      }
    }
  }

  // Bounce für ALLE Plattformen. Der Unterschied liegt nur im Score
  // und in Combo/FX.
  function onHit(p){
    const { mon } = FE.player.state;
    mon.y = p.y - mon.r;
    p.hitFlash = 0.4;

    const isRepeat = (p.id === state.lastPlatId);
    const isGood = p.cat.type === 'good';

    // Streak-Boost: Schwellenwert statt Rampe. Erst ab Combo 20 gibt es
    // +8% Sprunghöhe. Die Combo-10-Stufe belohnt der Dash-Rabatt in main.js.
    // Nur auf NEUE gute Plattformen — Selbst-Loops und schlechte Landungen
    // bleiben bei Standard-Bounce, sonst würde Camping belohnt bzw. wären
    // Bad-Hits durch den Boost aus dem vorherigen Sprung verschleiert.
    // Combo wird unten inkrementiert; hier vorwegnehmen, damit der Boost
    // schon auf DEN Sprung wirkt, der die neue Streak-Stufe abschließt.
    let mult = 1;
    if (isGood && !isRepeat && state.combo + 1 >= 20){
      mult = 1.08;
    }
    FE.player.bounce(mult);

    if (isRepeat) return;
    state.lastPlatId = p.id;

    FE.algorithm.recordInteraction(p.cat.id);

    if (isGood){
      state.combo++;
      const catBonus = p.cat.bonus;
      const comboBonus = state.combo >= 3 ? (state.combo - 2) * 2 : 0;
      const add = catBonus + comboBonus;
      state.bonus += add;
      state.floats.push({
        x: p.x, y: p.y - view.U * 0.04,
        t: '+' + add,
        life: 0.7, col: '#1E40AF'   // dunkelblau, passt zum guten Tint
      });
      // Milestone-Funken: kleine Feier bei 10 (Dash-Rabatt aktiv),
      // größere bei 20 (Sprung-Boost aktiv). Goldene Farbe passt zum
      // goldenen Glitzern von Dash-Button und Monster.
      const sparkN = state.combo >= 20 ? 8 : state.combo >= 10 ? 4 : 0;
      for (let i = 0; i < sparkN; i++){
        state.parts.push(mkPart(p.x + (Math.random() - 0.5) * p.w, p.y, '#FDE047'));
      }
    } else {
      // Schlecht: bouncet trotzdem, aber Malus + Combo weg + kleine Wolke
      state.combo = 0;
      state.bonus += p.cat.bonus;  // negativ
      state.shake = 3;             // kleiner Kick — kein Drama mehr
      state.floats.push({
        x: p.x, y: p.y - view.U * 0.04,
        t: String(p.cat.bonus),    // z.B. "-15"
        life: 0.9, col: '#155E75'  // dunkles Petrol, passt zum bad-Tint
      });
      for (let i = 0; i < 6; i++){
        state.parts.push(mkPart(p.x + (Math.random() - 0.5) * p.w, p.y, '#5EB8CC'));
      }
    }
  }

  function mkPart(x, y, col){
    const a = -Math.PI/2 + (Math.random() - 0.5) * Math.PI;
    const s = 40 + Math.random() * 100;
    return { x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
             life: 0.4 + Math.random()*0.3, r: 2 + Math.random()*2, col };
  }

  function updateFX(dt){
    for (const p of state.parts){
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 260 * dt; p.life -= dt;
    }
    state.parts = state.parts.filter(p => p.life > 0);
    for (const f of state.floats){ f.y -= 42 * dt; f.life -= dt; }
    state.floats = state.floats.filter(f => f.life > 0);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 36);
    for (const p of state.plats){ if (p.hitFlash > 0) p.hitFlash -= dt; }
  }

  function cull(camY){
    const { H } = view;
    state.plats = state.plats.filter(p => (p.y - camY) < H + 90);
    state.orbs  = state.orbs.filter(o => !o.collected && (o.y - camY) < H + 90);
    state.bars  = state.bars.filter(b => (b.y - camY) < H + 200);
  }

  function fillAhead(camY, climb, elapsed){
    while (state.highestGen > camY - view.H * 0.6) genRow(climb, elapsed);
  }

  // ── 2b: Akku-Kugeln ─────────────────────────────────────────────────
  function spawnOrb(camY){
    const { W, U } = view;
    const r = U * ORB_RADIUS;
    const edge = r + 6;
    const x = edge + Math.random() * (W - 2 * edge);
    // Ober-halb des sichtbaren Bereichs spawnen, damit der Spieler sie
    // im Aufstieg "entdeckt" statt sie überraschend zu treffen.
    const y = camY - view.H * 0.9 - Math.random() * view.H * 0.4;
    state.orbs.push({ x, y, r, collected: false, pulse: 0 });
  }

  function updateOrbs(dt, camY){
    state.orbTimer -= dt;
    if (state.orbTimer <= 0){
      spawnOrb(camY);
      state.orbTimer = ORB_INTERVAL_MIN + Math.random() * (ORB_INTERVAL_MAX - ORB_INTERVAL_MIN);
    }
    for (const o of state.orbs){
      o.y += ORB_FALL_SPEED * dt;
      o.pulse += dt;
    }
  }

  // Rückgabe: aufgenommener Akku-%-Wert (0 wenn nichts eingesammelt).
  function checkOrbCollisions(mon){
    let gain = 0;
    for (const o of state.orbs){
      if (o.collected) continue;
      const dx = mon.x - o.x, dy = mon.y - o.y;
      if (dx*dx + dy*dy < (mon.r + o.r) * (mon.r + o.r)){
        o.collected = true;
        gain += ORB_GAIN;
        // Score-Float als Feedback
        state.floats.push({
          x: o.x, y: o.y - view.U * 0.03,
          t: '+' + ORB_GAIN + '% ⚡',
          life: 0.9, col: '#EAB308'
        });
        // Kleine gelbe Partikelwolke
        for (let i = 0; i < 8; i++){
          state.parts.push(mkPart(o.x, o.y, '#FDE047'));
        }
      }
    }
    return gain;
  }

  // ── 2c: Realitätscheck-Balken ───────────────────────────────────────
  function spawnBar(camY){
    // Startet oberhalb des sichtbaren Bereichs, fällt nach unten.
    const y = camY - view.H * 1.0 - Math.random() * view.H * 0.2;
    state.bars.push({ y, passed: false, life: 0 });
  }

  function updateBars(dt, camY, score){
    state.barTimer -= dt;
    if (state.barTimer <= 0){
      spawnBar(camY);
      state.barTimer = nextBarInterval(score);
    }
    for (const b of state.bars){
      b.y += BAR_SPEED * dt;
      b.life += dt;
    }
  }

  // Rückgabe: true, wenn Spieler ohne Dash den Balken berührt → Game Over.
  function checkBarCollisions(mon, dashActive){
    for (const b of state.bars){
      if (b.passed) continue;
      const barTop    = b.y - BAR_THICKNESS / 2;
      const barBottom = b.y + BAR_THICKNESS / 2;
      const playerTop    = mon.y - mon.r;
      const playerBottom = mon.y + mon.r;
      // Overlap?
      if (playerBottom > barTop && playerTop < barBottom){
        if (dashActive){
          b.passed = true;
          state.floats.push({
            x: mon.x, y: mon.y - view.U * 0.04,
            t: 'DURCHBROCHEN!',
            life: 1.0, col: '#2563EB'
          });
          // Weiße Blitz-Partikel als Feedback
          for (let i = 0; i < 14; i++){
            state.parts.push(mkPart(mon.x, mon.y, '#ffffff'));
          }
          state.shake = 5;
        } else {
          return true;
        }
      }
    }
    return false;
  }

  FE.platforms = {
    state, reset, mkPlat, genRow,
    checkCollisions, updateFX, cull, fillAhead,
    updateOrbs, checkOrbCollisions,
    updateBars, checkBarCollisions,
    BAR_THICKNESS
  };
})();
