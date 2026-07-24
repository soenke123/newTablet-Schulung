// Monster-Physik, Dash und Input (Touch/Pointer + Tastatur).
// Wichtig: Pointer-Steuerung ist RELATIV — pointerdown darf das Monster
// niemals auf die Touch-Position teleportieren, sonst zuckt es beim
// jeden Fingertap. Nur pointermove verschiebt es (dx * SENS).
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};
  const { view, ensureAudio, sfx, audio } = FE.util;

  // Physik-Konstanten (aus Prototyp — Apex ~194px matcht Row-Gaps)
  const G        = 1900;
  const BOUNCE   = 860;
  const DASHV    = 1230;
  const DASH_CD  = 0.9;
  const SENS     = 1.15;
  const KEYSPD   = 430;

  const state = {
    mon: null,
    dashCd: 0,
    dashGlow: 0,
    dashJustUsed: false,  // Flag für main.js — Akku-Abzug pro Dash
    parts: [],            // Partikel-Puffer für Dash-FX
    // Input
    dragId: null,
    lastPX: 0,
    keyDir: 0,
    // Swipe-Up-Dash: startY/startTime werden bei pointerdown gesetzt,
    // pointermove prüft nur innerhalb des Fensters, ob eine schnelle
    // Aufwärts-Geste erkannt wird. Nach dem Trigger (oder Ablauf) bleibt
    // das Drag als reine Horizontal-Steuerung erhalten.
    swipeStartX: 0,
    swipeStartY: 0,
    swipeStartTime: 0,
    swipeWindowOpen: false
  };

  // Schneller Aufwärts-Swipe als alternative Dash-Geste:
  // - dy nach oben ≥ 60 px in ≤ 250 ms
  // - vertikale Bewegung muss horizontale klar dominieren (1.3×)
  // Danach ist das Swipe-Fenster für diesen Drag geschlossen — der
  // gleiche Drag darf nicht mehrere Dashes triggern.
  const SWIPE_MIN_DY_PX = 60;
  const SWIPE_MAX_MS    = 250;
  const SWIPE_MIN_RATIO = 1.3;

  function newMon(){
    const { W } = view;
    return { x: W/2, y: 0, vy: 0, r: view.U * 0.05, squash: 0, face: 1 };
  }

  function resetPlayer(startX, startY, startVy){
    state.mon = newMon();
    state.mon.x = startX;
    state.mon.y = startY;
    state.mon.vy = startVy;
    state.dashCd = 0;
    state.dashGlow = 0;
    state.dashJustUsed = false;
    state.parts.length = 0;
  }

  function mkPart(x, y, col){
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 180;
    return { x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 40,
             life: 0.5 + Math.random()*0.3, r: 2 + Math.random()*3, col };
  }

  function doDash(){
    if (FE.main.getState() !== FE.main.ST.PLAY) return;
    if (state.dashCd > 0) return;
    state.mon.vy = -DASHV;
    state.dashCd = DASH_CD;
    state.dashGlow = 0.4;
    state.dashJustUsed = true;   // wird von main.js abgeräumt (Akku-Kosten)
    sfx.dash();
    for (let i = 0; i < 10; i++){
      state.parts.push(mkPart(state.mon.x, state.mon.y + state.mon.r, '#A78BFA'));
    }
  }

  // Bounces das Monster von einer grünen Plattform nach oben.
  // mult: optionaler Streak-Boost aus platforms.js (1.0 = normal, bis ~1.06).
  function bounce(mult){
    const m = mult || 1;
    state.mon.vy = -BOUNCE * m;
    state.mon.squash = 1;
    sfx.bounce();
  }

  // Update pro Frame — nur horizontale Bewegung + Gravitation. Kollisionen
  // laufen in platforms.js. Rückgabe: nichts.
  function updatePlayer(dt){
    const { mon } = state;
    const { W } = view;

    // Tastatur-Steuerung
    if (state.keyDir !== 0){
      mon.x += state.keyDir * KEYSPD * dt;
      mon.face = state.keyDir;
    }
    // Bildschirm-Wraparound wie Doodle Jump
    if (mon.x < -mon.r) mon.x = W + mon.r;
    if (mon.x >  W + mon.r) mon.x = -mon.r;

    mon.vy += G * dt;
    mon.y  += mon.vy * dt;

    if (mon.squash > 0) mon.squash -= dt * 6;
    if (state.dashGlow > 0) state.dashGlow -= dt;
    if (state.dashCd > 0)   state.dashCd -= dt;

    // Partikel
    for (const p of state.parts){
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 340 * dt; p.life -= dt;
    }
    state.parts = state.parts.filter(p => p.life > 0);
  }

  // ── Input ───────────────────────────────────────────────────────────
  function dashBtnRect(){
    const r = view.U * 0.11;
    return { x: view.W - r - 18, y: view.H - r - 22, r };
  }
  function localXY(ev){
    const r = view.canvas.getBoundingClientRect();
    return { x: (ev.clientX || 0) - r.left, y: (ev.clientY || 0) - r.top };
  }
  // Top-right Buttons: Stats-Chart (Pause) + Mute — nebeneinander
  function statsBtnRect(){
    const r = view.U * 0.055;
    return { x: view.W - r - 14, y: r + 14, r };
  }
  function muteBtnRect(){
    const r = view.U * 0.055;
    const s = statsBtnRect();
    return { x: s.x - s.r * 2 - 10, y: s.y, r };
  }
  function hitCircle(x, y, b, slack){
    return Math.hypot(x - b.x, y - b.y) < b.r * (slack || 1.2);
  }
  function muteBtnHit(x, y){ return hitCircle(x, y, muteBtnRect()); }
  function statsBtnHit(x, y){ return hitCircle(x, y, statsBtnRect()); }

  function attachInput(){
    const { canvas } = view;

    canvas.addEventListener('pointerdown', ev => {
      ensureAudio();
      const { x, y } = localXY(ev);
      // Mute-Toggle (funktioniert immer)
      if (muteBtnHit(x, y)){ audio.muted = !audio.muted; return; }

      const st = FE.main.getState();
      // Menu → Start
      if (st === FE.main.ST.MENU){ FE.main.startGame(); return; }
      // Ende-Stats → weiter zum Over-Screen
      if (st === FE.main.ST.STATS){ FE.main.statsToOver(); return; }
      // Pause → weiterspielen (Tap irgendwo)
      if (st === FE.main.ST.PAUSED){ FE.main.resumeGame(); return; }
      // Over → Restart (mit kurzer Karenzzeit)
      if (st === FE.main.ST.OVER){ if (FE.main.canRestart()) FE.main.startGame(); return; }

      // In PLAY: Stats/Chart-Button (Pause)?
      if (statsBtnHit(x, y)){ FE.main.openStats(); return; }
      // Dash-Button?
      const b = dashBtnRect();
      if (Math.hypot(x - b.x, y - b.y) < b.r * 1.25){ doDash(); return; }

      // Sonst: Drag beginnen — nur Startpunkt merken, NICHT springen!
      if (state.dragId === null){
        state.dragId = ev.pointerId;
        state.lastPX = x;
        // Swipe-Fenster oeffnen fuer Aufwaerts-Wisch-Dash.
        state.swipeStartX     = x;
        state.swipeStartY     = y;
        state.swipeStartTime  = performance.now();
        state.swipeWindowOpen = true;
      }
    });

    canvas.addEventListener('pointermove', ev => {
      if (ev.pointerId !== state.dragId) return;
      if (FE.main.getState() !== FE.main.ST.PLAY) return;
      const { x, y } = localXY(ev);

      // Swipe-Up-Detection (laeuft PARALLEL zur horizontalen Steuerung).
      // Nur innerhalb des Zeitfensters aktiv; sobald der Dash getriggert
      // oder das Fenster abgelaufen ist, faellt es raus.
      if (state.swipeWindowOpen){
        const elapsed = performance.now() - state.swipeStartTime;
        if (elapsed > SWIPE_MAX_MS){
          state.swipeWindowOpen = false;
        } else {
          const dyUp  = state.swipeStartY - y;              // positiv = nach oben
          const dxAbs = Math.abs(x - state.swipeStartX);
          if (dyUp > SWIPE_MIN_DY_PX && dyUp > dxAbs * SWIPE_MIN_RATIO){
            doDash();
            state.swipeWindowOpen = false;
          }
        }
      }

      const dx = x - state.lastPX;
      state.lastPX = x;
      state.mon.x += dx * SENS;
      if (Math.abs(dx) > 0.3) state.mon.face = dx > 0 ? 1 : -1;
      ev.preventDefault();
    }, { passive: false });

    function endDrag(ev){
      if (ev.pointerId === state.dragId){
        state.dragId = null;
        state.swipeWindowOpen = false;
      }
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // Tastatur (Desktop)
    window.addEventListener('keydown', e => {
      if (e.key === 'm' || e.key === 'M'){ audio.muted = !audio.muted; ensureAudio(); return; }
      const st = FE.main.getState();
      // P oder Escape: Pause togglen (nur PLAY ↔ PAUSED)
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape'){
        if (st === FE.main.ST.PLAY) FE.main.openStats();
        else if (st === FE.main.ST.PAUSED) FE.main.resumeGame();
        return;
      }
      if (st !== FE.main.ST.PLAY){
        if ((e.key === ' ' || e.key === 'Enter')){
          if (st === FE.main.ST.MENU) FE.main.startGame();
          else if (st === FE.main.ST.STATS) FE.main.statsToOver();
          else if (st === FE.main.ST.PAUSED) FE.main.resumeGame();
          else if (st === FE.main.ST.OVER && FE.main.canRestart()) FE.main.startGame();
        }
        return;
      }
      if (e.key === 'ArrowLeft')  state.keyDir = -1;
      if (e.key === 'ArrowRight') state.keyDir =  1;
      if (e.key === ' ' || e.key === 'ArrowUp'){ doDash(); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      if ((e.key === 'ArrowLeft'  && state.keyDir < 0) ||
          (e.key === 'ArrowRight' && state.keyDir > 0)) state.keyDir = 0;
    });
  }

  FE.player = {
    state, newMon, resetPlayer, updatePlayer, doDash, bounce,
    dashBtnRect, statsBtnRect, muteBtnRect, attachInput,
    G, BOUNCE, DASHV, DASH_CD, SENS, KEYSPD
  };
})();
