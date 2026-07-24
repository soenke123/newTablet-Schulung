// Game Loop + State-Maschine + Glue.
// States:  MENU  →  PLAY  →  STATS (Filterblase)  →  OVER  →  PLAY …
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};
  const { view, sfx, loadHigh, saveHigh, checkResize } = FE.util;

  const ST = { MENU: 0, PLAY: 1, STATS: 2, OVER: 3, PAUSED: 4 };

  // ── Difficulty-Rampe (2a): Kamera-Sog ──────────────────────────────
  // Nach einer Aufwärmzeit zieht die Kamera von selbst nach oben und
  // baut leichte Doomscroll-Pressure auf. Berührt keine Wurfphysik.
  const AUTOSCROLL_DELAY = 30;   // s — Ruhe vor der Rampe
  const AUTOSCROLL_RAMP  = 200;  // s — bis Vollgas erreicht
  const AUTOSCROLL_MAX   = 400;   // px/s — max. Kamera-Sog

  // ── Akku (2b) ──────────────────────────────────────────────────────
  const BATTERY_MAX       = 100;
  const BATTERY_DRAIN     = 1.5;  // %/s passiver Verlust
  const BATTERY_DASH_COST = 4;    // zusätzlicher %-Verlust pro Dash (halbiert auf 2% ab Combo 10)
  const BATTERY_LOW       = 20;   // %-Schwelle für Blinken

  const game = {
    state: ST.MENU,
    camY: 0,
    climb: 0,
    score: 0,
    highScore: loadHigh(),
    newBest: false,
    overCd: 0.6,
    statsCd: 0.3,     // Karenz vor Weiter-Tap auf End-Stats-Screen
    pauseCd: 0.2,     // Karenz vor Resume-Tap nach Pausen-Öffnung
    elapsed: 0,       // 2a: PLAY-Sekunden für Rampen-Berechnung
    autoScroll: 0,    // 2a: aktuelle Kamera-Sog-Geschwindigkeit
    battery: BATTERY_MAX  // 2b: aktueller Akkustand (0..100)
  };

  function getState(){ return game.state; }
  function canRestart(){ return game.state === ST.OVER && game.overCd <= 0; }

  function openStats(){
    if (game.state !== ST.PLAY) return;
    game.state = ST.PAUSED;
    game.pauseCd = 0.2;
  }
  function resumeGame(){
    if (game.state !== ST.PAUSED) return;
    if (game.pauseCd > 0) return;
    game.state = ST.PLAY;
  }

  function startGame(){
    const { W, H } = view;
    game.camY = 0;
    game.climb = 0;
    game.score = 0;
    game.newBest = false;
    game.overCd = 0.6;
    game.statsCd = 0.5;
    game.elapsed = 0;
    game.autoScroll = 0;
    game.battery = BATTERY_MAX;

    // Algorithmus zurücksetzen — jede Runde beginnt mit gleichmäßigem Feed.
    FE.algorithm.reset();

    // Plattformen zurücksetzen mit Start-Reihe
    const startY = H * 0.72;
    FE.platforms.reset(startY);
    // Erste Plattform garantiert grün (aus dem Starter-Pool) — sanfter Einstieg
    const firstCat = FE.categories.BY_ID[FE.categories.STARTER_GOOD[0]];
    FE.platforms.state.plats.push(FE.platforms.mkPlat(W / 2, startY, firstCat));

    // Spieler auf Startplattform
    FE.player.resetPlayer(W / 2, startY - view.U * 0.05, -FE.player.BOUNCE * 0.6);

    FE.platforms.fillAhead(game.camY, game.climb, game.elapsed);

    game.state = ST.PLAY;
  }

  function gameOver(){
    // Score endgültig berechnen (Höhe + Bonus-Summe)
    game.score = Math.max(0, Math.floor(game.climb / 28) + FE.platforms.state.bonus);
    if (game.score > game.highScore){
      game.highScore = game.score;
      game.newBest = true;
      saveHigh(game.score);
    }
    sfx.over();
    game.state = ST.STATS;
    game.statsCd = 0.5;
  }

  function statsToOver(){
    if (game.statsCd > 0) return;
    game.state = ST.OVER;
    game.overCd = 0.6;
  }

  function update(dt){
    if (game.state === ST.PLAY){
      game.elapsed += dt;

      // 2a: Kamera-Sog. Rampt sanft an, greift NICHT in die Wurfphysik ein.
      const rt = Math.max(0, game.elapsed - AUTOSCROLL_DELAY);
      game.autoScroll = Math.min(AUTOSCROLL_MAX, (rt / AUTOSCROLL_RAMP) * AUTOSCROLL_MAX);
      if (game.autoScroll > 0){
        const push = game.autoScroll * dt;
        game.camY  -= push;
        game.climb += push;
      }

      FE.player.updatePlayer(dt);
      FE.platforms.checkCollisions(dt);

      // 2b: Akku. Passiver Verlust + Dash-Extra + Kugeln als Nachfüllung.
      game.battery -= BATTERY_DRAIN * dt;
      if (FE.player.state.dashJustUsed){
        // Streak-Belohnung: Ab Combo 10 halbiert sich der Dash-Batteriemalus.
        const cost = FE.platforms.state.combo >= 10 ? BATTERY_DASH_COST * 0.5 : BATTERY_DASH_COST;
        game.battery -= cost;
        FE.player.state.dashJustUsed = false;
      }
      FE.platforms.updateOrbs(dt, game.camY);
      const orbGain = FE.platforms.checkOrbCollisions(FE.player.state.mon);
      if (orbGain > 0){
        game.battery = Math.min(BATTERY_MAX, game.battery + orbGain);
      }
      if (game.battery <= 0){ game.battery = 0; gameOver(); return; }

      // 2c: Realitätscheck-Balken. Kommt von oben, muss per Dash durchbrochen
      // werden, sonst Game Over.
      FE.platforms.updateBars(dt, game.camY, game.score);
      const dashActive = FE.player.state.dashGlow > 0;
      const barHit = FE.platforms.checkBarCollisions(FE.player.state.mon, dashActive);
      if (barHit){ gameOver(); return; }

      // Kamera zieht nach, sobald Monster über eine bestimmte Linie steigt
      const { mon } = FE.player.state;
      const screenY = mon.y - game.camY;
      const line = view.H * 0.42;
      if (screenY < line){
        const d = line - screenY;
        game.camY  -= d;
        game.climb += d;
      }
      // Live-Score-Anzeige (Höhe + laufender Bonus)
      game.score = Math.max(0, Math.floor(game.climb / 28) + FE.platforms.state.bonus);

      FE.platforms.updateFX(dt);
      FE.platforms.fillAhead(game.camY, game.climb, game.elapsed);
      FE.platforms.cull(game.camY);

      // Runter aus dem Bild → Game Over
      if ((mon.y - game.camY) > view.H + mon.r * 2){ gameOver(); return; }
    }
    else if (game.state === ST.STATS){
      if (game.statsCd > 0) game.statsCd -= dt;
      FE.platforms.updateFX(dt);
      FE.player.updatePlayer(dt);
    }
    else if (game.state === ST.PAUSED){
      if (game.pauseCd > 0) game.pauseCd -= dt;
      // Alle Physics eingefroren — bewusst nichts weiter updaten.
    }
    else if (game.state === ST.OVER){
      if (game.overCd > 0) game.overCd -= dt;
      FE.platforms.updateFX(dt);
    }
  }

  function render(dt){
    const ctx = view.ctx;
    // Canvas transparent halten — das Sunset-Gradient kommt via CSS auf #stage
    ctx.clearRect(0, 0, view.W, view.H);

    ctx.save();
    if (FE.platforms.state.shake > 0){
      const s = FE.platforms.state.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    // Ebene 1: verschwommener, atmosphärischer Feed (auch im Menü sichtbar)
    FE.render.drawBackdrop(game.camY);

    if (game.state !== ST.MENU){
      // Ebene 2: scharfe Post-Karten = eigentliche Plattformen
      for (const p of FE.platforms.state.plats) FE.render.drawPlat(p, game.camY);
      // 2b: Akku-Kugeln (auf Karten sichtbar, unter Monster)
      FE.render.drawOrbs(game.camY);
      FE.render.drawMon(game.camY);
      FE.render.drawFX(game.camY);
      // 2c: Realitätscheck-Balken — ganz oben in der Weltebene, damit die
      // Bedrohung deutlich ist.
      FE.render.drawBars(game.camY);
      FE.render.drawHUD(game.score, game.highScore, FE.platforms.state.combo);
      // 2b: Akku-Balken unter der Score-Pille
      FE.render.drawBattery(game.battery);
      // Dash-Button & Top-Buttons nur wenn spielbar (PLAY oder PAUSED)
      if (game.state === ST.PLAY || game.state === ST.PAUSED){
        FE.render.drawDashBtn();
        FE.render.drawTopButtons(game.state === ST.PAUSED);
      }
    }
    ctx.restore();

    if (game.state === ST.MENU)   FE.screens.drawMenu(game.highScore);
    if (game.state === ST.STATS)  FE.screens.drawFilterBubble(false);
    if (game.state === ST.PAUSED) FE.screens.drawFilterBubble(true);
    if (game.state === ST.OVER)   FE.screens.drawOver(game.score, game.highScore, game.newBest, game.overCd <= 0);
  }

  let last = performance.now();
  function frame(now){
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;  // Clamp gegen Frame-Spikes / Hintergrund-Tabs
    checkResize();
    update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  FE.main = { ST, getState, canRestart, startGame, statsToOver, openStats, resumeGame, game,
              BATTERY_MAX, BATTERY_LOW };

  // Boot
  FE.player.resetPlayer(view.W / 2, -100, 0);
  FE.platforms.reset(view.H * 0.72);
  FE.player.attachInput();
  requestAnimationFrame(frame);
})();
