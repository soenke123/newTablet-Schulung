// ── Play Window ────────────────────────────────
let _gameInterval  = null;
let _playWindowOpen = false;
let _spriteTimeout = null;

function stopSpriteAnimation() {
  clearTimeout(_spriteTimeout);
  _spriteTimeout = null;
}

// ── Synergie-Tracking ──────────────────────────
let _prevRainbowActive     = false;
let _prevTripleBlauActive  = false;
let _prevTripleGruenActive = false;
let _prevTripleRotActive   = false;

const SYNERGY_DISPLAY = {
  rainbow:     { colorClass: 'syn-rainbow', text: 'Perfekter Mix! Dopamin +10, Sozialdruck −10' },
  tripleRot:   { colorClass: 'syn-rot',     text: 'Video-Sucht! Dopamin-Ziel auf 70+' },
  tripleGruen: { colorClass: 'syn-gruen',   text: 'Soziale Sättigung! Sozialdrang sinkt' },
  tripleBlau:  { colorClass: 'syn-blau',    text: 'Overload! Reizschwelle sinkt' },
};

// ── Trend-Pfeile ───────────────────────────────
let _prevScaleValues = { dopamin: null, sozialdrang: null, reiz: null };


// ── Notification-Badge ─────────────────────────
let _notifTimer = null;

// ── Endless-Partikel ───────────────────────────
let _endlessParticleInterval = null;

// ── Hub Integration ─────────────────────────────
const _urlParams    = new URLSearchParams(window.location.search);
const ALG_GAME_ID   = _urlParams.get('id') || 'game10';
const ALG_EGG_TYPE  = _urlParams.get('egg') || null;
const ALG_MAX_SCORE = 10;
let _algGameData    = null;
let _algCoinsGained = 0;
let _algHubSaved    = false;

function spawnEndlessParticle() {
  const label = document.getElementById('endless-label');
  if (!label) return;
  const p = document.createElement('div');
  p.className = 'endless-spark';
  const size = (2 + Math.random() * 3.5).toFixed(1) + 'px';
  p.style.width  = size;
  p.style.height = size;
  p.style.left   = (5 + Math.random() * 90) + '%';
  p.style.bottom = '0';
  const colors = ['#FFD700', '#FFA500', '#FFFACD', '#FFB347', '#FF8C00', '#fff'];
  p.style.background = colors[Math.floor(Math.random() * colors.length)];
  p.style.setProperty('--dx',  (Math.random() * 22 - 11).toFixed(1) + 'px');
  p.style.setProperty('--dur', (0.55 + Math.random() * 0.7).toFixed(2) + 's');
  p.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
  label.appendChild(p);
  p.addEventListener('animationend', () => p.remove(), { once: true });
}

function startEndlessGlow() {
  _endlessParticleInterval = setInterval(spawnEndlessParticle, 260);
}

// ── Hub-Funktionen ─────────────────────────────
function initHubState() {
  _algGameData = getGameData(ALG_GAME_ID);
  updateGameEggDisplay(_algGameData, crackStageFromCorrect(0), false, null);
  renderBoostIndicators('pf-boost-bar', ALG_GAME_ID);
}

function saveAlgorithmHubData(score) {
  if (_algHubSaved) return;
  const gd = getGameData(ALG_GAME_ID);
  const sd = loadShopData();
  const s  = Math.min(10, Math.max(0, score));
  const isFirst = !gd.creature;

  if (isFirst) {
    if (ALG_EGG_TYPE) {
      gd.creature = determineEggCreature(ALG_EGG_TYPE, s);
    } else if (sd.glucksklee) {
      gd.creature = determineCreatureWithGlucksklee(s, ALG_GAME_ID);
      sd.glucksklee = false;
      saveShopData(sd);
    } else {
      gd.creature = determineCreature(s, true, ALG_GAME_ID);
    }
    gd.growth = 0;
    // Nest-Slot: Game-URL eintragen damit der Hub zurückleiten kann
    if (ALG_GAME_ID.startsWith('nest_')) {
      const nest = sd.nests.find(n => n.nestId === ALG_GAME_ID);
      if (nest && !nest.gameUrl) {
        nest.gameUrl = 'S1 The Algorithm/index.html';
        saveShopData(sd);
      }
    }
  }
  _algCoinsGained += computeRoundResult(gd, s, ALG_MAX_SCORE, sd, isFirst);
  if (sd.wachstumsBooster) { sd.wachstumsBooster = false; saveShopData(sd); }
  if (sd.coinsx3)           { sd.coinsx3 = false;          saveShopData(sd); }

  gd.points      = (gd.points      || 0) + s;
  gd.roundsPlayed = (gd.roundsPlayed || 0) + 1;
  saveGameData(ALG_GAME_ID, gd);
  _algGameData = gd;
  _algHubSaved = true;
}

function renderAlgHubWidgets(type) {
  const pre = { gameover: 'alg-go', win: 'alg-win', endless: 'alg-ee' }[type];
  if (!pre) return;
  const gd = _algGameData || defaultGameData();

  const wrap = document.getElementById(pre + '-creature-wrap');
  if (wrap) {
    if (gd.creature) {
      const stage = getGrowthStage(gd.growth);
      wrap.innerHTML =
        '<div style="width:120px;height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden">'
        + getCreatureHTML(gd.creature, stage) + '</div>'
        + '<div class="alg-creature-name">' + (CREATURE_NAMES[gd.creature] || '') + ' · ' + (GROWTH_LABELS[stage] || '') + '</div>';
    } else {
      const cs = crackStageFromCorrect(gameState.score);
      wrap.innerHTML =
        '<div style="width:120px;height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden">'
        + getEggSVG(cs) + '</div>'
        + '<div class="alg-creature-name">Ei schlummert…</div>';
    }
  }

  renderCoinBank(pre + '-coin-bank', _algCoinsGained);
  renderResultItemButton(pre + '-result-item', ALG_GAME_ID, () => location.reload());
}

function updateAlgCreatureDisplay() {
  if (!_algGameData) return;
  const gd = _algGameData;
  const s  = gameState.score;
  const cs = crackStageFromCorrect(s);
  const liveGrowth = gd.creature
    ? Math.min(gd.growth + computeSessionGrowth(s, ALG_MAX_SCORE), GROWTH_MAX)
    : null;
  updateGameEggDisplay(gd, cs, false, liveGrowth);
  renderBoostIndicators('pf-boost-bar', ALG_GAME_ID);
}

// ── Karten-State ───────────────────────────────
let _expandedCardId      = null;
let _expandedFeedSlots   = new Set();
let _feedBackdropHandler = null;
let _handBackdropHandler = null;
let _lastDragEndTime     = 0;

// ── Recovery-State ─────────────────────────────
let _recoveryTimer      = null;
let _recoveryCardPlayed = false;
let _recoveryPosX       = 0;
let _recoveryGoLeft     = false;
let _recoveryIngameMin  = 0;

function openPlayWindow() {
  _playWindowOpen = true;
  renderHand();
  renderWindowStatus();
}

function closePlayWindow() {
  _playWindowOpen = false;
  renderHand();
  renderWindowStatus();
}

// ── Game Loop ──────────────────────────────────
function triggerGameOver() {
  gameState.isRunning = false;
  clearInterval(_gameInterval);
  clearTimeout(_spriteTimeout);

  renderStatusBars();
  renderTime();
  renderScore();

  const sprite        = document.getElementById('user-sprite');
  const handy         = document.getElementById('handy-sprite');
  const ingameMinutes = realToIngameMinutes(gameState.elapsedSeconds);

  sprite.src = 'data/überlegen.png';

  setTimeout(() => {
    sprite.src = 'data/aufstehen.png';
    handy.style.display = 'block';

    setTimeout(() => {
      const room    = document.getElementById('room');
      const roomW   = room.offsetWidth;
      const spriteW = sprite.offsetWidth;
      let posX = Math.round(roomW * 0.53 - spriteW / 2);

      sprite.style.transform = 'none';
      sprite.style.left = posX + 'px';

      const goLeft = ingameMinutes >= 480;

      if (goLeft) {
        sprite.style.transform = 'scaleX(-1)';
      } else {
        const bgOpen  = ingameMinutes < 240 ? 'raumTagOpen'      : ingameMinutes < 360 ? 'raumAbendOpen'      : 'raumNachtOpen';
        const bgFront = ingameMinutes < 240 ? 'raumTagOpenFront' : ingameMinutes < 360 ? 'raumAbendOpenFront' : 'raumNachtOpenFront';
        document.querySelector('.image-wrapper').style.backgroundImage = `url('data/${bgOpen}.png')`;
        const frontImg = document.getElementById('room-front');
        frontImg.src = `data/${bgFront}.png`;
        frontImg.style.display = 'block';
      }

      const halfX      = goLeft ? roomW * 0.35 : roomW * 0.75;
      const walkFrames = ['gehen1', 'gehen2', 'gehen3', 'gehen4'];
      let   frame      = 0;

      function walkToHalf() {
        sprite.src = `data/${walkFrames[frame % 4]}.png`;
        frame++;
        posX += goLeft ? -22 : 22;
        sprite.style.left = posX + 'px';

        const reachedHalf = goLeft ? posX <= halfX : posX >= halfX;
        if (!reachedHalf) {
          setTimeout(walkToHalf, 140);
        } else {
          onHalfwayReached(posX, goLeft, ingameMinutes);
        }
      }

      walkToHalf();
    }, 1000);
  }, 1000);
}

function showGameOverBanner() {
  saveHighscore();
  if (gameState.endlessGameOver) {
    saveAlgorithmHubData(10);
    renderAlgHubWidgets('endless');
    document.getElementById('endless-end-overlay').style.display = 'flex';
    return;
  }
  const ingameMinutes = realToIngameMinutes(gameState.elapsedSeconds);
  const timeStr = ingameMinutesToString(ingameMinutes) + ' Uhr';
  document.getElementById('gameover-time').textContent = timeStr;

  saveAlgorithmHubData(gameState.score);
  renderAlgHubWidgets('gameover');
  const goScoreEl = document.getElementById('alg-go-score');
  if (goScoreEl) goScoreEl.textContent = gameState.score;
  document.getElementById('gameover-overlay').style.display = 'flex';
}

// ── Recovery-System ────────────────────────────
function isInSurvivalZone() {
  if (gameState.dopamin <= 0) return false;
  if (gameState.sozialdrang >= 100) return false;
  const x = gameState.reizschwelleOptimalwert;
  return !(gameState.reizschwelle < x - 30 || gameState.reizschwelle > x + 30);
}

function showRecoveryOverlay() {
  document.getElementById('recovery-count-left').textContent = 2 - gameState.recoveryCount;
  document.getElementById('recovery-timer').textContent = '10';
  document.getElementById('recovery-overlay').style.display = 'flex';
}

function hideRecoveryOverlay() {
  document.getElementById('recovery-overlay').style.display = 'none';
}

function onHalfwayReached(posX, goLeft, ingameMinutes) {
  if (gameState.recoveryCount < 2) {
    startRecoveryPhase(posX, goLeft, ingameMinutes);
  } else {
    continueWalkToEnd(posX, goLeft, ingameMinutes);
  }
}

function startRecoveryPhase(posX, goLeft, ingameMinutes) {
  gameState.recoveryCount++;
  gameState.isInRecovery = true;
  gameState.secondsSinceLastCard = 0;
  _recoveryCardPlayed = false;
  _recoveryPosX      = posX;
  _recoveryGoLeft    = goLeft;
  _recoveryIngameMin = ingameMinutes;

  const sprite = document.getElementById('user-sprite');
  sprite.src = 'data/umdrehen.png';

  _playWindowOpen = true;
  renderHand();
  showRecoveryOverlay();

  let timeLeft = 10;
  _recoveryTimer = setInterval(() => {
    timeLeft--;
    document.getElementById('recovery-timer').textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(_recoveryTimer);
      hideRecoveryOverlay();
      _playWindowOpen = false;
      renderHand();
      continueWalkToEnd(_recoveryPosX, _recoveryGoLeft, _recoveryIngameMin);
    }
  }, 1000);
}

function applyRecoveryFeedEffects() {
  const syn = getFeedSynergies();
  updateFeedSynergyGlow(syn);

  // Synergie-Einmalboni (wie in tick, aber unabhängig vom _prev*Active-State)
  if (syn.rainbow) {
    gameState.dopamin     = Math.min(100, gameState.dopamin + 10);
    gameState.sozialdrang = Math.max(0,   gameState.sozialdrang - 10);
    const opt = gameState.reizschwelleOptimalwert;
    gameState.reizschwelle = gameState.reizschwelle < opt
      ? Math.min(opt, gameState.reizschwelle + 10)
      : Math.max(opt, gameState.reizschwelle - 10);
    showSynergyToast(SYNERGY_DISPLAY.rainbow.text, 'syn-rainbow');
  } else {
    if (syn.tripleRot)   showSynergyToast(SYNERGY_DISPLAY.tripleRot.text,   'syn-rot');
    if (syn.tripleGruen) showSynergyToast(SYNERGY_DISPLAY.tripleGruen.text, 'syn-gruen');
    if (syn.tripleBlau)  showSynergyToast(SYNERGY_DISPLAY.tripleBlau.text,  'syn-blau');
  }

  // tripleGruen: Sozialdrang senken (5 Ticks simuliert)
  if (syn.tripleGruen) {
    gameState.sozialdrang = Math.max(0, gameState.sozialdrang - 5);
  }

  // tripleBlau: Optimalwert senken (wie in tick)
  if (syn.tripleBlau && gameState.reizschwelleOptimalwert > 30) {
    gameState.reizschwelleOptimalwert -= 5;
  }

  // Feed-Interesse-Ratio → Dopamin-Zielwert (5 Ticks simuliert)
  if (!gameState.feedSlots.some(c => c?.effekt?.rabbithole)) {
    const ratio  = calcFeedInterestRatio();
    let   target = dopaminTarget(ratio);
    if (syn.tripleRot) target = Math.max(70, target);
    const step = 2;
    for (let i = 0; i < 5; i++) {
      if (gameState.dopamin < target)      gameState.dopamin = Math.min(target, gameState.dopamin + step);
      else if (gameState.dopamin > target) gameState.dopamin = Math.max(target, gameState.dopamin - step);
    }
    gameState.dopamin = Math.max(0, gameState.dopamin);
  }

  renderStatusBars();
  renderFeed();
}

function onRecoveryCardPlayed() {
  clearInterval(_recoveryTimer);
  _recoveryCardPlayed = true;
  _playWindowOpen = false;
  renderHand();
  hideRecoveryOverlay();

  applyRecoveryFeedEffects();

  if (isInSurvivalZone()) {
    walkBackToCenter(_recoveryPosX, _recoveryGoLeft);
  } else {
    continueWalkToEnd(_recoveryPosX, _recoveryGoLeft, _recoveryIngameMin);
  }
}

function walkBackToCenter(posX, goLeft) {
  const sprite  = document.getElementById('user-sprite');
  const room    = document.getElementById('room');
  const roomW   = room.offsetWidth;
  const centerX = Math.round(roomW * 0.53 - sprite.offsetWidth / 2);

  sprite.style.transform = goLeft ? 'none' : 'scaleX(-1)';

  const walkFrames = ['gehen1', 'gehen2', 'gehen3', 'gehen4'];
  let frame = 0;

  function stepBack() {
    sprite.src = `data/${walkFrames[frame % 4]}.png`;
    frame++;
    posX += goLeft ? 22 : -22;
    sprite.style.left = posX + 'px';

    const reached = goLeft ? posX >= centerX : posX <= centerX;
    if (!reached) {
      setTimeout(stepBack, 140);
    } else {
      sprite.style.left = '';
      sprite.style.transform = '';

      if (!goLeft) {
        const m  = realToIngameMinutes(gameState.elapsedSeconds);
        const bg = m < 240 ? 'raumTag' : m < 360 ? 'raumAbend' : 'raumNacht';
        document.querySelector('.image-wrapper').style.backgroundImage = `url('data/${bg}.png')`;
        const frontImg = document.getElementById('room-front');
        frontImg.style.display = 'none';
        frontImg.src = '';
      }

      document.getElementById('handy-sprite').style.display = 'none';

      gameState.isInRecovery = false;
      gameState.isRunning    = true;
      animateUser();
      _gameInterval = setInterval(tick, 1000);
      openPlayWindow();
    }
  }

  stepBack();
}

function continueWalkToEnd(posX, goLeft, ingameMinutes) {
  const sprite     = document.getElementById('user-sprite');
  const room       = document.getElementById('room');
  const roomW      = room.offsetWidth;
  const walkFrames = ['gehen1', 'gehen2', 'gehen3', 'gehen4'];
  let   frame      = 0;

  gameState.isInRecovery = false;
  gameState.isGameOver   = true;

  function step() {
    sprite.src = `data/${walkFrames[frame % 4]}.png`;
    frame++;
    posX += goLeft ? -22 : 22;
    sprite.style.left = posX + 'px';

    const keepWalking = goLeft ? posX > roomW * 0.2 : posX < roomW + 20;
    if (keepWalking) {
      setTimeout(step, 140);
    } else if (goLeft) {
      sprite.style.transform = 'none';
      sprite.style.display   = 'none';
      document.getElementById('bad-sprite').src = 'data/BettmitSchwein.png';
      setTimeout(showGameOverBanner, 2500);
    } else {
      sprite.style.display = 'none';
      setTimeout(showGameOverBanner, 2500);
    }
  }

  step();
}

function triggerWin() {
  gameState.isRunning = false;
  clearInterval(_gameInterval);
  clearTimeout(_spriteTimeout);

  renderTime();
  renderScore();

  const sprite = document.getElementById('user-sprite');

  sprite.src = 'data/gewonnen0.png';

  setTimeout(() => {
    sprite.src = 'data/gewonnen.png';

    setTimeout(() => {
      showWinBanner();
    }, 2500);
  }, 2000);
}

function showWinBanner() {
  saveHighscore();
  saveAlgorithmHubData(10);
  renderAlgHubWidgets('win');
  document.getElementById('win-overlay').style.display = 'flex';
}

function tick() {
  gameState.elapsedSeconds++;

  gameState.secondsSinceLastCard++;
  if (gameState.secondsSinceLastCard === 30 ||
      gameState.secondsSinceLastCard === 35 ||
      gameState.secondsSinceLastCard === 40) {
    const idx = gameState.feedSlots.findIndex(c => c !== null);
    if (idx !== -1) {
      gameState.feedSlots[idx] = null;
      renderFeed();
    }
  }

  if (gameState.elapsedSeconds >= 360 && !gameState.endlessMode) { triggerWin(); return; }
  if (gameState.elapsedSeconds >= 540 &&  gameState.endlessMode) { triggerEndlessEnd(); return; }
  if (gameState.elapsedSeconds === 360 &&  gameState.endlessMode) startEndlessGlow();

  const syn = getFeedSynergies();
  updateFeedSynergyGlow(syn);

  if (syn.rainbow     && !_prevRainbowActive)     showSynergyToast(SYNERGY_DISPLAY.rainbow.text,     'syn-rainbow');
  if (syn.tripleRot   && !_prevTripleRotActive)   showSynergyToast(SYNERGY_DISPLAY.tripleRot.text,   'syn-rot');
  if (syn.tripleGruen && !_prevTripleGruenActive) showSynergyToast(SYNERGY_DISPLAY.tripleGruen.text, 'syn-gruen');
  if (syn.tripleBlau  && !_prevTripleBlauActive)  showSynergyToast(SYNERGY_DISPLAY.tripleBlau.text,  'syn-blau');

  if (syn.rainbow && !_prevRainbowActive) {
    gameState.dopamin     = Math.min(100, gameState.dopamin + 10);
    gameState.sozialdrang = Math.max(0,   gameState.sozialdrang - 10);
    const opt = gameState.reizschwelleOptimalwert;
    gameState.reizschwelle = gameState.reizschwelle < opt
      ? Math.min(opt, gameState.reizschwelle + 10)
      : Math.max(opt, gameState.reizschwelle - 10);
  }

  const activeEventDef = gameState.activeEvent
    ? EVENT_DEFINITIONS.find(e => e.id === gameState.activeEvent.id)
    : null;

  if (!gameState.feedSlots.some(c => c?.effekt?.rabbithole) && !activeEventDef?.bypassFeedDopamin) {
    const ratio  = calcFeedInterestRatio();
    let   target = dopaminTarget(ratio);
    if (syn.tripleRot) target = Math.max(70, target);
    const hauptInterest = gameState.interests.find(i => i.level === 'Haupt');
    const hauptInFeed = hauptInterest
      ? gameState.feedSlots.filter(Boolean).some(c => (c.interestPoints[hauptInterest.theme] ?? 0) > 0)
      : false;
    if (hauptInFeed) target = Math.min(100, target + 5);
    const step   = 2;
    if (gameState.dopamin < target)      gameState.dopamin = Math.min(target, gameState.dopamin + step);
    else if (gameState.dopamin > target) gameState.dopamin = Math.max(target, gameState.dopamin - step);
    gameState.dopamin = Math.max(0, gameState.dopamin);
  }
  if (gameState.dopamin === 0) { triggerGameOver(); return; }

  if (syn.tripleGruen) {
    gameState.sozialdrang = Math.max(0, gameState.sozialdrang - 1);
  } else {
    gameState.sozialdrang = Math.min(100, gameState.sozialdrang + 0.9);
  }
  if (gameState.feedSlots.some(c => c?.effekt?.socialFreeze)) {
    gameState.sozialdrang = 0;
  }
  if (gameState.sozialdrang >= 100) { triggerGameOver(); return; }
  gameState.reizschwelle = Math.max(0, Math.min(100, gameState.reizschwelle - 0.45));
  if (gameState.feedSlots.some(c => c?.effekt?.reizReset)) {
    gameState.reizschwelle = gameState.reizschwelleOptimalwert;
  }

  if (gameState.elapsedSeconds % 20 === 0) {
    gameState.reizschwelleOptimalwert = Math.min(95, gameState.reizschwelleOptimalwert + 5);
  }

  if (syn.tripleBlau && !_prevTripleBlauActive) {
    if (gameState.reizschwelleOptimalwert > 30) {
      gameState.reizschwelleOptimalwert -= 5;
    }
  }

  const x = gameState.reizschwelleOptimalwert;
  if (activeEventDef?.specialEffects?.reizFloorOffset !== undefined) {
    gameState.reizschwelle = Math.max(
      x + activeEventDef.specialEffects.reizFloorOffset,
      gameState.reizschwelle
    );
  }
  if (gameState.reizschwelle < x - 30 || gameState.reizschwelle > x + 30) {
    triggerGameOver();
    return;
  }

  const rabbitholeActive = gameState.feedSlots.some(c => c?.effekt?.rabbithole);
  if (!gameState.activeEvent) {
    for (const card of gameState.feedSlots) {
      if (!card?.effekt?.tickDelta) continue;
      for (const [stat, delta] of Object.entries(card.effekt.tickDelta)) {
        if (rabbitholeActive && stat === 'dopamin') continue;
        if (stat in gameState) {
          gameState[stat] = Math.max(0, Math.min(100, gameState[stat] + delta));
        }
      }
    }
  }

  _prevRainbowActive     = syn.rainbow;
  _prevTripleBlauActive  = syn.tripleBlau;
  _prevTripleGruenActive = syn.tripleGruen;
  _prevTripleRotActive   = syn.tripleRot;

  tickEvents();

  renderStatusBars();
  renderTime();
  renderScore();
  renderBackground();
  renderWindowStatus();

  if (gameState.elapsedSeconds % 10 === 0 && gameState.freeCardPlays === 0) {
    closePlayWindow();
    openPlayWindow();
  }
}

function _startGameLoop() {
  gameState.isRunning = true;
  openPlayWindow();
  animateUser();
  _gameInterval = setInterval(tick, 1000);
}

function startGame() {
  scheduleEvents();
  document.getElementById('start-overlay').style.display = 'none';
  showTutorial();
}

function triggerEndlessEnd() {
  clearInterval(_endlessParticleInterval);
  _endlessParticleInterval = null;
  gameState.recoveryCount   = 2;
  gameState.endlessGameOver = true;
  triggerGameOver();
}

function startEndlessMode() {
  gameState.endlessMode = true;
  startGame();
  document.getElementById('endless-label').style.display = '';

  const pool  = [...EVENT_DEFINITIONS].sort(() => Math.random() - 0.5).slice(0, 5);
  const START = 361, END = 534;
  const slot  = Math.floor((END - START) / 5);

  pool.forEach((def, i) => {
    const lo     = START + i * slot;
    const hi     = lo + slot - def.duration - 5;
    const second = hi > lo ? Math.floor(Math.random() * (hi - lo + 1)) + lo : lo;
    gameState.scheduledEventTimes.push({ second, eventId: def.id });
  });
  gameState.scheduledEventTimes.sort((a, b) => a.second - b.second);
}

// ── Karte Expand / Collapse ────────────────────
function onCardExpandClick(e) {
  if (!gameState.isRunning) return;
  if (Date.now() - _lastDragEndTime < 300) return;
  e.stopPropagation();
  const cardId = e.currentTarget.dataset.cardId;
  _expandedCardId = (_expandedCardId === cardId) ? null : cardId;
  renderHand();
}

// ── Drag-System (Pointer Events) ───────────────
function initCardDrag(el, cardId) {
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((!gameState.isRunning && !gameState.isInRecovery) || !_playWindowOpen) return;

    const startX = e.clientX, startY = e.clientY;
    let dragStarted = false;
    let ghostEl = null;

    function onMove(ev) {
      if (!dragStarted) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 15) return;
        dragStarted = true;
        el.classList.add('card-dragging');
        ghostEl = el.cloneNode(true);
        ghostEl.classList.add('card-ghost');
        ghostEl.classList.remove('card-dragging', 'card-expanded');
        document.body.appendChild(ghostEl);
        document.getElementById('feed-panel').classList.add('feed-drop-active');
        document.getElementById('room').classList.add('room-drop-active');
      }
      if (ghostEl) {
        ghostEl.style.left = (ev.clientX - 47) + 'px';
        ghostEl.style.top  = (ev.clientY - 66) + 'px';
      }
    }

    function cleanup() {
      document.removeEventListener('pointermove',   onMove);
      document.removeEventListener('pointerup',     onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.getElementById('feed-panel').classList.remove('feed-drop-active');
      document.getElementById('room').classList.remove('room-drop-active');
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
      el.classList.remove('card-dragging');
    }

    function onCancel() {
      cleanup();
    }

    function onUp(ev) {
      cleanup();

      if (dragStarted) {
        _lastDragEndTime = Date.now();
        const bottomUI  = document.getElementById('bottom-ui');
        const feedPanel = document.getElementById('feed-panel');
        const bottomRect = bottomUI.getBoundingClientRect();
        const feedRect   = feedPanel.getBoundingClientRect();
        const overRoom = ev.clientY < bottomRect.top;
        const overFeed = ev.clientX >= feedRect.left && ev.clientX <= feedRect.right &&
                         ev.clientY >= feedRect.top  && ev.clientY <= feedRect.bottom;
        const over = overRoom || overFeed;
        const canPlay = (gameState.isRunning || gameState.isInRecovery)
                      && _playWindowOpen
                      && !(gameState.isInRecovery && _recoveryCardPlayed);
        if (over && canPlay) {
          const prevFreeCardPlays = gameState.freeCardPlays;
          const cardPlayed = playCard(cardId);
          _expandedCardId = null;
          _expandedFeedSlots.clear();
          document.getElementById('feed-card-portal').innerHTML = '';
          document.getElementById('hand-card-portal').innerHTML = '';
          if (!cardPlayed) {
            // Karte durch Event geblockt — Fenster bleibt offen
            renderHand();
            renderWindowStatus();
          } else {
            renderFeedAnimated();
            if (prevFreeCardPlays > 0) {
              // Freisspiel verbraucht
              gameState.freeCardPlays--;
              renderHand();
              renderWindowStatus();
            } else if (gameState.freeCardPlays > 0) {
              // Diese Karte hat Freisspiele aktiviert — nicht dekrementieren
              renderHand();
              renderWindowStatus();
            } else if (gameState.isInRecovery) {
              onRecoveryCardPlayed();
            } else {
              closePlayWindow();
            }
          }
        }
      }
    }

    document.addEventListener('pointermove',   onMove);
    document.addEventListener('pointerup',     onUp);
    document.addEventListener('pointercancel', onCancel);
    el.setPointerCapture(e.pointerId);
  });
}

// ── Render ─────────────────────────────────────
function renderReizGradient() {
  const x = gameState.reizschwelleOptimalwert;
  const lo1 = Math.max(0, x - 30);
  const loMid = Math.max(0, x - 25);
  const lo2 = Math.max(0, x - 10);
  const hi1 = Math.min(100, x + 10);
  const hiMid = Math.min(100, x + 25);
  const hi2 = Math.min(100, x + 30);

  const stops = [];
  if (lo1 > 0) stops.push(`#414141 0% ${lo1}%`);
  if (loMid > lo1) stops.push(`#8B0000 ${lo1}% ${loMid}%`);
   if (lo2 > loMid) stops.push(`#f5a623 ${loMid}% ${lo2}%`);
  stops.push(`#27ae60 ${lo2}% ${hi1}%`);
  if (hiMid > hi1) stops.push(`#f5a623 ${hi1}% ${hiMid}%`);
  if (hi2 > hiMid) stops.push(`#8B0000 ${hiMid}% ${hi2}%`);
  if (hi2 < 100) stops.push(`#414141 ${hi2}% 100%`);

  const el = document.querySelector('.zones-reiz');
  if (el) el.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
}

function renderStatusBars() {
  renderValueScales();
  renderReizGradient();
}

function renderValueScales() {
  const map = {
    'dopamin':     gameState.dopamin,
    'sozialdrang': gameState.sozialdrang,
    'reiz':        gameState.reizschwelle,
  };
  for (const [key, val] of Object.entries(map)) {
    const el = document.getElementById(`marker-${key}`);
    if (el) el.style.left = val + '%';
  }
  const dopaminCritical     = gameState.dopamin < 30;
  const sozialdrangCritical = gameState.sozialdrang > 80;
  const reizCritical        = Math.abs(gameState.reizschwelle - gameState.reizschwelleOptimalwert) > 25;

  const allGreen = gameState.dopamin > 85
                && gameState.sozialdrang < 30
                && Math.abs(gameState.reizschwelle - gameState.reizschwelleOptimalwert) < 10;
  document.getElementById('values-widget').classList.toggle('all-green', allGreen);

  document.getElementById('scale-dopamin')
    .classList.toggle('dopamin-critical', dopaminCritical);
  document.getElementById('scale-sozialdrang')
    .classList.toggle('sozialdrang-critical', sozialdrangCritical);
  document.getElementById('scale-reiz-container')
    .classList.toggle('reiz-critical', reizCritical);

  _updateTrendArrows(map);
  _prevScaleValues = { ...map };
}

function _updateTrendArrows(current) {
  const THRESHOLD = 0.3;
  const optimal   = gameState.reizschwelleOptimalwert;

  const configs = {
    dopamin:     { higherGood: true,  dangerLo: 10,  dangerHi: null },
    sozialdrang: { higherGood: false, dangerLo: null, dangerHi: 90  },
    reiz:        { higherGood: null,  dangerLo: null, dangerHi: null },
  };

  for (const [key, val] of Object.entries(current)) {
    const prev = _prevScaleValues[key];
    if (prev === null) continue;

    const el = document.getElementById(`arrow-${key}`);
    if (!el) continue;

    const delta = val - prev;
    const cfg   = configs[key];

    el.classList.remove('arrow-stable', 'arrow-good', 'arrow-bad', 'arrow-blink');

    let colorClass;
    if (Math.abs(delta) < THRESHOLD) {
      el.textContent = '▶';
      colorClass = 'arrow-stable';
    } else if (delta > 0) {
      el.textContent = '▲';
      if (key === 'reiz') {
        colorClass = Math.abs(val - optimal) < Math.abs(prev - optimal) ? 'arrow-good' : 'arrow-bad';
      } else {
        colorClass = cfg.higherGood ? 'arrow-good' : 'arrow-bad';
      }
    } else {
      el.textContent = '▼';
      if (key === 'reiz') {
        colorClass = Math.abs(val - optimal) < Math.abs(prev - optimal) ? 'arrow-good' : 'arrow-bad';
      } else {
        colorClass = cfg.higherGood ? 'arrow-bad' : 'arrow-good';
      }
    }

    el.classList.add(colorClass);

    const inDanger = (cfg.dangerLo !== null && val < cfg.dangerLo)
                  || (cfg.dangerHi !== null && val > cfg.dangerHi)
                  || (key === 'reiz' && Math.abs(val - optimal) > 20);
    if (inDanger) el.classList.add('arrow-blink');
  }
}

function updateFeedSynergyGlow(syn) {
  const feedEl = document.getElementById('feed');
  if (!feedEl) return;
  feedEl.classList.remove('syn-rainbow', 'syn-rot', 'syn-gruen', 'syn-blau');
  if (syn.rainbow)     feedEl.classList.add('syn-rainbow');
  else if (syn.tripleRot)   feedEl.classList.add('syn-rot');
  else if (syn.tripleGruen) feedEl.classList.add('syn-gruen');
  else if (syn.tripleBlau)  feedEl.classList.add('syn-blau');
}

let _synergyToastTimer = null;

function showSynergyToast(text, colorClass) {
  const toast = document.getElementById('synergy-toast');
  if (!toast) return;
  clearTimeout(_synergyToastTimer);
  toast.className = 'synergy-toast-visible ' + colorClass;
  toast.textContent = text;
  toast.style.opacity = '1';
  spawnSynergyParticles(colorClass);
  _synergyToastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.className = ''; }, 400);
  }, 3000);
}

function spawnSynergyParticles(colorClass) {
  const panel = document.getElementById('feed-panel');
  if (!panel) return;
  const colorMap = {
    'syn-rot':     '#ff5555',
    'syn-gruen':   '#44dd88',
    'syn-blau':    '#5599ff',
    'syn-rainbow': '#cc88ff',
  };
  const color = colorMap[colorClass] ?? '#ffffff';
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    p.className = 'synergy-particle';
    p.style.left             = (10 + Math.random() * 80) + '%';
    p.style.bottom           = '0';
    p.style.background       = color;
    p.style.animationDelay    = (Math.random() * 0.6) + 's';
    p.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    panel.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}


function getFeedEffektIcon(card) {
  if (!card?.effekt) return null;
  const e = card.effekt;
  if (e.perfectFlow || e.rabbithole) return WIRKUNG_ICONS.dopamin;
  if (e.socialFreeze)                return WIRKUNG_ICONS.sozialdrang;
  if (e.reizReset)                   return WIRKUNG_ICONS.reizschwelle;
  if (e.tickDelta) {
    const stat = Object.keys(e.tickDelta)[0];
    return WIRKUNG_ICONS[stat] ?? null;
  }
  return null;
}

function showNotifBadge(icon, text) {
  const badge  = document.getElementById('notif-badge');
  const iconEl = document.getElementById('notif-card-icon');
  const textEl = document.getElementById('notif-effect-text');
  if (!badge) return;
  iconEl.textContent = icon;
  textEl.textContent = text;
  badge.style.display = 'flex';
  badge.style.animation = 'none';
  badge.offsetHeight;
  badge.style.animation = '';
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => { badge.style.display = 'none'; }, 2200);
}

function createCardElement(card, opts = {}) {
  const { expanded = false, draggable = false, expandable = false, onExpand, disabled = false, feedMode = false } = opts;

  const el = document.createElement('div');
  el.className = `card card-${card.type.toLowerCase()}${SPECIAL_CARD_IDS.has(card.id) ? ' card-special' : ''}`;
  if (disabled) el.classList.add('card-disabled');
  if (expanded)  el.classList.add('card-expanded');
  el.dataset.cardId = card.id;

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'card-header';

  const iconEl = document.createElement('span');
  iconEl.className = 'card-icon';
  iconEl.textContent = TYPE_ICONS[card.type] ?? '?';

  const nameEl = document.createElement('span');
  nameEl.className = 'card-name';
  nameEl.textContent = card.name;

  header.appendChild(iconEl);
  header.appendChild(nameEl);
  el.appendChild(header);

  // ── Kompakt-Ansicht ──
  const compact = document.createElement('div');
  compact.className = 'card-compact-only';

  const pts = Object.entries(card.interestPoints);
  const isUninteresting = card.effekt?.uninteresting === true;
  if (pts.length > 0) {
    const ipRow = document.createElement('div');
    ipRow.className = 'card-compact-interests';
    pts.forEach(([theme, val]) => {
      const entry = gameState.interests.find(i => i.theme === theme);
      const isRelevant = !isUninteresting && entry && (entry.level === 'Haupt' || entry.level === 'Hoch');
      const span = document.createElement('span');
      span.className = 'card-ip-item' + (isRelevant ? ' card-ip-relevant' : '');
      span.textContent = isUninteresting ? `+${val}` : `${THEME_ICONS[theme] ?? theme}+${val}`;
      ipRow.appendChild(span);
    });
    compact.appendChild(ipRow);
  }

  const wirkungEntries = Object.entries(card.direkteWirkung ?? {});
  if (!feedMode && wirkungEntries.length > 0) {
    if (pts.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'card-compact-divider';
      compact.appendChild(divider);
    }
    const wRow = document.createElement('div');
    wRow.className = 'card-compact-wirkung';
    wirkungEntries.forEach(([stat, val]) => {
      const item = document.createElement('span');
      item.className = 'card-compact-wirkung-item';
      item.textContent = stat === 'reizToOptimal'
        ? `${WIRKUNG_ICONS.reizToOptimal}+/-${val}`
        : `${WIRKUNG_ICONS[stat] ?? stat}${val >= 0 ? '+' : ''}${val}`;
      wRow.appendChild(item);
    });
    compact.appendChild(wRow);
  }

  const badgesEl = document.createElement('div');
  badgesEl.className = 'card-compact-badges';
  if (card.effekt) {
    const effEl = document.createElement('div');
    effEl.className = 'card-compact-effekt';
    effEl.textContent = '+Effekt';
    badgesEl.appendChild(effEl);
  }
  if (!feedMode && card.fähigkeit) {
    const fähigkeitEl = document.createElement('div');
    fähigkeitEl.className = 'card-compact-fähigkeit';
    fähigkeitEl.textContent = 'Notification';
    badgesEl.appendChild(fähigkeitEl);
  }
  if (card.effekt || (!feedMode && card.fähigkeit)) compact.appendChild(badgesEl);

  el.appendChild(compact);

  // ── Detail-Ansicht ──
  const detail = document.createElement('div');
  detail.className = 'card-detail-only';

  if (pts.length > 0) {
    const labelI = document.createElement('div');
    labelI.className = 'card-section-label';
    labelI.textContent = 'Interessen';
    detail.appendChild(labelI);

    pts.forEach(([theme, val]) => {
      const entry = gameState.interests.find(i => i.theme === theme);
      const isRelevant = !isUninteresting && entry && (entry.level === 'Haupt' || entry.level === 'Hoch');
      const row = document.createElement('div');
      row.className = 'card-detail-row' + (isRelevant ? ' detail-relevant' : '');
      row.textContent = isUninteresting ? `+${val}` : `${THEME_ICONS[theme] ?? theme} ${theme} +${val}`;
      detail.appendChild(row);
    });
  }

  if (wirkungEntries.length > 0) {
    const labelW = document.createElement('div');
    labelW.className = 'card-section-label';
    labelW.textContent = 'Wirkung';
    detail.appendChild(labelW);

    wirkungEntries.forEach(([stat, val]) => {
      const row = document.createElement('div');
      row.className = 'card-detail-row';
      row.textContent = stat === 'reizToOptimal'
        ? `${WIRKUNG_ICONS.reizToOptimal} +/-${val} — ${WIRKUNG_LABELS.reizToOptimal}`
        : `${WIRKUNG_ICONS[stat] ?? stat} ${WIRKUNG_LABELS[stat] ?? stat} ${val >= 0 ? '+' : ''}${val}`;
      detail.appendChild(row);
    });
  }

  if (card.effekt) {
    const labelE = document.createElement('div');
    labelE.className = 'card-section-label';
    labelE.textContent = 'Effekt';
    detail.appendChild(labelE);

    const effText = document.createElement('div');
    effText.className = 'card-effekt-text';
    effText.textContent = card.effekt.beschreibung;
    detail.appendChild(effText);
  }

  if (card.fähigkeit) {
    const labelF = document.createElement('div');
    labelF.className = 'card-section-label';
    labelF.textContent = 'Fähigkeit';
    detail.appendChild(labelF);

    const rule = document.createElement('div');
    rule.className = 'card-fähigkeit-rule';
    rule.textContent = 'Wird aktiviert, wenn keine Karte dieser Farbe im Feed liegt';
    detail.appendChild(rule);

    const effLine = document.createElement('div');
    effLine.className = 'card-fähigkeit-effect';
    effLine.textContent = card.fähigkeit.anzeige;
    detail.appendChild(effLine);
  }

  if (card.beschreibung) {
    const desc = document.createElement('div');
    desc.className = 'card-beschreibung';
    desc.textContent = card.beschreibung;
    detail.appendChild(desc);
  }

  el.appendChild(detail);

  if (expandable) {
    el.addEventListener('click', onExpand ?? onCardExpandClick);
  }
  if (draggable) {
    initCardDrag(el, card.id);
  }

  return el;
}

function fitHandToContainer() {
  const container = document.getElementById('hand');
  const parent    = container?.parentElement;
  if (!container || !parent) return;

  const cards = Array.from(container.querySelectorAll('.card'));
  if (cards.length === 0) return;

  cards.forEach(c => { c.style.width = ''; c.style.height = ''; });
  container.style.gap = '';

  const available   = parent.clientWidth - 8;
  const actualWidth = container.scrollWidth;
  if (actualWidth <= available) return;

  const scale = available / actualWidth;
  cards.forEach(c => {
    c.style.width  = Math.floor(c.offsetWidth  * scale) + 'px';
    c.style.height = Math.floor(c.offsetHeight * scale) + 'px';
  });
  const gapPx = parseFloat(getComputedStyle(container).gap) || 6;
  container.style.gap = Math.max(2, Math.floor(gapPx * scale)) + 'px';

  console.warn('[hand] overflow abgefangen', {
    available, actualWidth, scale: scale.toFixed(3), cards: cards.length,
  });
}

function renderHand() {
  if (_handBackdropHandler) {
    document.removeEventListener('click', _handBackdropHandler);
    _handBackdropHandler = null;
  }

  const container = document.getElementById('hand');
  const portal    = document.getElementById('hand-card-portal');
  container.innerHTML = '';
  portal.innerHTML    = '';

  gameState.hand.forEach(card => {
    const el = createCardElement(card, {
      expanded:   false,
      draggable:  true,
      expandable: true,
      disabled:   !_playWindowOpen && gameState.freeCardPlays === 0 || (!!gameState.activeEvent && !EVENT_DEFINITIONS.find(e => e.id === gameState.activeEvent.id)?.allowCards && !card.effekt?.eventSkip),
    });
    if (card.id === _expandedCardId) el.classList.add('card-hand-active');
    container.appendChild(el);
  });

  fitHandToContainer();

  if (_expandedCardId) {
    const card   = gameState.hand.find(c => c.id === _expandedCardId);
    const cardEl = card ? container.querySelector(`[data-card-id="${_expandedCardId}"]`) : null;
    if (card && cardEl) {
      const portalCardEl = createCardElement(card, {
        expanded:   true,
        draggable:  false,
        expandable: false,
      });
      portalCardEl.addEventListener('click', e => e.stopPropagation());
      portal.appendChild(portalCardEl);

      const rect = cardEl.getBoundingClientRect();
      portal.style.left      = rect.left + 'px';
      portal.style.bottom    = (window.innerHeight - rect.top + 8) + 'px';
      portal.style.top       = '';
      portal.style.transform = '';
    }

    _handBackdropHandler = e => {
      if (!e.target.closest('#hand') && !e.target.closest('#hand-card-portal')) {
        _expandedCardId = null;
        renderHand();
      }
    };
    document.addEventListener('click', _handBackdropHandler);
  }
}

function renderFeedAnimated() {
  const feed = document.getElementById('feed');
  const firstSlot = feed.querySelector('.feed-slot');
  const step = firstSlot ? firstSlot.offsetHeight + 8 : 0;

  renderFeed();

  if (step === 0) return;

  feed.querySelectorAll('.feed-slot').forEach(el => {
    el.style.transition = 'none';
    el.style.transform = `translateY(${step}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.28s ease';
        el.style.transform = 'translateY(0)';
      });
    });
  });
}

function renderFeedRatio() {
  const el = document.getElementById('feed-ratio');
  if (!el) return;
  if (hasPerfectFlow()) {
    el.innerHTML = '<span class="feed-ratio-num">35%</span><span class="feed-ratio-label">Perfekter Flow</span>';
    el.className = 'feed-ratio good';
    return;
  }
  const { relevant, total } = calcFeedInterestStats();
  const pct = total === 0 ? 0 : Math.round(relevant / total * 100);
  el.innerHTML = total === 0
    ? '<span class="feed-ratio-num">—</span>'
    : `<span class="feed-ratio-num">${relevant}/${total} (${pct}%)</span><span class="feed-ratio-label">interessant</span>`;
  el.className = pct >= 20 && pct <= 50 ? 'feed-ratio good'
               : pct > 0                ? 'feed-ratio bad'
               : 'feed-ratio';
}

function renderFeed() {
  document.removeEventListener('click', _feedBackdropHandler);
  _feedBackdropHandler = null;

  const portal    = document.getElementById('feed-card-portal');
  const feedPanel = document.getElementById('feed-panel');
  portal.innerHTML = '';

  feedPanel.classList.toggle('feed-copy-mode', gameState.feedCopyMode);

  gameState.feedSlots.forEach((card, i) => {
    const el = document.getElementById(`feed-slot-${i}`);
    el.innerHTML = '';
    if (card) {
      const isExpanded = _expandedFeedSlots.has(i);
      el.className = 'feed-slot' + (isExpanded ? ' feed-slot-active' : '');

      const slotCardEl = createCardElement(card, {
        expanded:   false,
        draggable:  false,
        expandable: true,
        feedMode:   true,
        onExpand:   (e) => {
          e?.stopPropagation();
          if (gameState.feedCopyMode) {
            gameState.hand.push({ ...card });
            gameState.feedCopyMode = false;
            renderHand();
            renderFeed();
            return;
          }
          if (_expandedFeedSlots.has(i)) {
            _expandedFeedSlots.delete(i);
          } else {
            _expandedFeedSlots.clear();
            _expandedFeedSlots.add(i);
          }
          renderFeed();
        },
      });
      el.appendChild(slotCardEl);

      const effektIcon = getFeedEffektIcon(card);
      if (effektIcon) {
        const badge = document.createElement('div');
        badge.className = 'feed-effekt-badge';
        badge.textContent = effektIcon;
        el.appendChild(badge);
      }

      if (isExpanded) {
        const portalCardEl = createCardElement(card, {
          expanded:   true,
          draggable:  false,
          expandable: false,
        });
        portalCardEl.addEventListener('click', e => e.stopPropagation());
        portal.appendChild(portalCardEl);

        // Portal dynamisch über dem angeklickten Slot positionieren
        const slotEl = document.getElementById(`feed-slot-${i}`);
        const rect = slotEl.getBoundingClientRect();
        const cardWidth = 185;
        const margin = 8;
        const clampedLeft = Math.min(rect.left, window.innerWidth - cardWidth - margin);
        portal.style.left   = clampedLeft + 'px';
        portal.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        portal.style.top    = '';
        portal.style.transform = '';
      }
    } else {
      el.className = 'feed-slot empty';
      el.textContent = '—';
    }
  });
  renderFeedRatio();

  if (_expandedFeedSlots.size > 0 || gameState.feedCopyMode) {
    _feedBackdropHandler = (e) => {
      if (!e.target.closest('#feed-panel') && !e.target.closest('#feed-card-portal')) {
        _expandedFeedSlots.clear();
        gameState.feedCopyMode = false;
        renderFeed();
      }
    };
    document.addEventListener('click', _feedBackdropHandler);
  }
}

function renderTime() {
  document.getElementById('clock').textContent =
    ingameMinutesToString(realToIngameMinutes(gameState.elapsedSeconds));
}

function currentScore() {
  const mins = realToIngameMinutes(gameState.elapsedSeconds);
  return Math.max(0, Math.floor((mins - 120) / 60));
}

function loadAlgHighscores() {
  const d = loadStorage('algorithm_hs_v1');
  return { highscore: Number(d.highscore || 0), bestTime: Number(d.bestTime || 0) };
}

function renderScore() {
  const s = currentScore();
  gameState.score = s;
  document.getElementById('score-value').textContent = s;
  const hs = loadAlgHighscores().highscore;
  document.getElementById('highscore-value').textContent = hs;
  updateAlgCreatureDisplay();
}

function saveHighscore() {
  const stored = loadAlgHighscores();
  if (gameState.score > stored.highscore) stored.highscore = gameState.score;
  const t = Math.floor(realToIngameMinutes(gameState.elapsedSeconds));
  if (t > stored.bestTime) stored.bestTime = t;
  saveStorage('algorithm_hs_v1', stored);
  // Cross-Device: Ingame-Zeit in Minuten als DB-Highscore (Server macht GREATEST).
  window.pushHighscore?.('game10', stored.bestTime);
}

function renderBackground() {
  const m  = realToIngameMinutes(gameState.elapsedSeconds);
  const bg = m < 240 ? 'raumTag'
           : m < 360 ? 'raumAbend'
           : m < 960 ? 'raumNacht'
           :            'raumAbend';
  document.querySelector('.image-wrapper').style.backgroundImage = `url('data/${bg}.png')`;
}

function renderUser() {
  document.getElementById('user-sprite').src = getSpriteFrames('IDLE')[0];
}

function animateUser() {
  clearTimeout(_spriteTimeout);
  const ingameMinutes = realToIngameMinutes(gameState.elapsedSeconds);

  let frames = ingameMinutes >= 421 ? getSpriteFrames('TIRED') : getSpriteFrames('IDLE');

  const isAllGreen = gameState.dopamin > 85
                  && gameState.sozialdrang < 30
                  && Math.abs(gameState.reizschwelle - gameState.reizschwelleOptimalwert) < 10;

  if (isAllGreen) {
    const emotionFrames = ingameMinutes < 480
      ? getSpriteFrames('EMOTION')
      : ['data/user1.png', 'data/user3.png'];
    frames = [...frames, ...emotionFrames];
  }

  document.getElementById('user-sprite').src = frames[Math.floor(Math.random() * frames.length)];
  const delay = (2 + Math.random() * 2) * 1000;
  _spriteTimeout = setTimeout(animateUser, delay);
}

function renderInterestPyramid() {
  const row1 = document.getElementById('row-haupt');
  const row2 = document.getElementById('row-hoch');
  const row3 = document.getElementById('row-gering-1');
  const row4 = document.getElementById('row-gering-2');
  [row1, row2, row3, row4].forEach(r => { if (r) r.innerHTML = ''; });

  const byLevel = { Haupt: [], Hoch: [], Gering: [] };
  gameState.interests.forEach(({ theme, level }) => {
    if (byLevel[level]) byLevel[level].push(theme);
  });

  const addIcon = (row, theme) => {
    const icon = document.createElement('span');
    icon.className = 'interest-icon';
    icon.textContent = THEME_ICONS[theme] ?? '?';
    row.appendChild(icon);
  };

  byLevel.Haupt.forEach(t => addIcon(row1, t));
  byLevel.Hoch.forEach(t  => addIcon(row2, t));
  byLevel.Gering.slice(0, 2).forEach(t => addIcon(row3, t));
  byLevel.Gering.slice(2).forEach(t    => addIcon(row4, t));

  const tooltip = document.getElementById('interest-tooltip');
  tooltip.innerHTML = [
    { key: 'Haupt',  label: 'Haupt',  cls: 'haupt'  },
    { key: 'Hoch',   label: 'Hoch',   cls: 'hoch'   },
    { key: 'Gering', label: 'Gering', cls: 'gering' },
  ].map(({ key, label, cls }) =>
    `<div class="tip-section">
      <div class="tip-header">
        <span class="tip-dot ${cls}"></span>
        <span class="tip-level-name">${label}</span>
      </div>
      ${byLevel[key].map(t => `<div class="tip-item">${THEME_ICONS[t] ?? ''} ${t}</div>`).join('')}
    </div>`
  ).join('');
}

function initValueInfoPanels() {
  const panel = document.getElementById('value-info-panel');
  const text  = document.getElementById('value-info-text');
  let activeId = null;

  const infos = {
    'scale-dopamin':
      'Sinkt ständig.<br><br>' +
      '<strong>Videokarten (ROT)</strong> heben ihn am stärksten – besonders bei passenden <strong>Interessen</strong>.<br><br>' +
      'Nicht nur interessante Karten spielen – ein <strong>gutes Verhältnis</strong> ist wichtiger.',
    'scale-sozialdrang':
      'Steigt ständig. Zu hoch → User legt das Handy weg.<br><br>' +
      '<strong>Messenger-Karten (GRÜN)</strong> senken ihn am effektivsten.',
    'scale-reiz-container':
      'Der <strong>grüne Bereich</strong> steigt im Spielverlauf.<br><br>' +
      'Der Marker sinkt ständig – er muss im grünen Bereich bleiben.<br><br>' +
      '<strong>Gaming-Karten (BLAU)</strong> helfen am meisten.',
  };

  ['scale-dopamin', 'scale-sozialdrang', 'scale-reiz-container'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      e.stopPropagation();
      if (activeId === id) {
        panel.classList.remove('visible');
        activeId = null;
        return;
      }
      text.innerHTML = infos[id];
      panel.classList.add('visible');
      activeId = id;
    });
  });

  panel.addEventListener('click', () => {
    panel.classList.remove('visible');
    activeId = null;
  });

  document.addEventListener('click', () => {
    panel.classList.remove('visible');
    activeId = null;
  });
}

function initFeedInfoPanel() {
  const panel = document.getElementById('feed-info-panel');
  const text  = document.getElementById('feed-info-text');
  const header = document.getElementById('feed-header');
  let open = false;

  text.innerHTML =
    '<strong>Was macht der Feed?</strong><br>' +
    'Die drei Karten im Feed beeinflussen ständig die Basiswerte – solange sie liegen.<br><br>' +
    '<strong>Interessenverhältnis</strong><br>' +
    'Karten, die zu deinen Interessen passen, treiben Dopamin stärker.<br>' +
    'Das <strong>optimale Verhältnis liegt bei ~35 %</strong> interessanter Karten im Feed.';

  header.addEventListener('click', e => {
    e.stopPropagation();
    open = !open;
    panel.classList.toggle('visible', open);
  });

  panel.addEventListener('click', e => e.stopPropagation());

  document.addEventListener('click', () => {
    open = false;
    panel.classList.remove('visible');
  });
}

function initPyramidTooltip() {
  const widget  = document.getElementById('interest-widget');
  const tooltip = document.getElementById('interest-tooltip');
  widget.addEventListener('click', e => {
    e.stopPropagation();
    tooltip.classList.toggle('visible');
  });
  document.addEventListener('click', () => tooltip.classList.remove('visible'));
}

function renderWindowStatus() {
  const label = document.getElementById('window-label');
  const bar   = document.getElementById('window-bar');
  const secsInCycle = gameState.elapsedSeconds % 10;
  const remaining   = secsInCycle === 0 ? 10 : 10 - secsInCycle;

  if (gameState.freeCardPlays > 0) {
    label.textContent = `Freizug! (${gameState.freeCardPlays} übrig)`;
    label.className = 'window-label open';
    bar.style.width = (gameState.freeCardPlays / 3 * 100) + '%';
    bar.className = 'window-bar open';
  } else if (_playWindowOpen) {
    label.textContent = `Karte ziehen! (${remaining}s)`;
    label.className = 'window-label open';
    bar.style.width = (remaining / 10 * 100) + '%';
    bar.className = 'window-bar open';
  } else {
    label.textContent = `Warte… (${remaining}s)`;
    label.className = 'window-label closed';
    bar.style.width = (remaining / 10 * 100) + '%';
    bar.className = 'window-bar closed';
  }
}

// ── Kartenübersicht ────────────────────────────
const CATEGORY_LABELS = {
  ROT:   'ROT – Video',
  GRUEN: 'GRÜN – Messenger',
  BLAU:  'BLAU – Game',
  WEISS: 'WEISS – System',
};

function openCardsOverview() {
  const grid = document.getElementById('cards-overview-grid');
  grid.innerHTML = '';

  document.querySelector('#cards-overview-header h2').textContent =
    `Kartenübersicht (${CARD_DEFINITIONS.length} Karten)`;

  ['ROT', 'GRUEN', 'BLAU', 'WEISS'].forEach(type => {
    const col = document.createElement('div');
    col.className = `cards-category cat-${type.toLowerCase()}`;

    const count = CARD_DEFINITIONS.filter(c => c.type === type).length;
    const title = document.createElement('div');
    title.className = 'cards-category-title';
    title.textContent = `${CATEGORY_LABELS[type]} (${count})`;
    col.appendChild(title);

    CARD_DEFINITIONS.filter(c => c.type === type).forEach(card => {
      const wrap = document.createElement('div');
      wrap.className = 'cards-overview-card-wrap';
      const cardEl = createCardElement(card, {
        expanded:   true,
        draggable:  false,
        expandable: false,
      });
      wrap.appendChild(cardEl);
      col.appendChild(wrap);
    });

    grid.appendChild(col);
  });

  // Interessen-Zusammenfassung
  const totals = {};
  CARD_DEFINITIONS.forEach(card => {
    Object.entries(card.interestPoints).forEach(([theme, pts]) => {
      totals[theme] = (totals[theme] || 0) + pts;
    });
  });

  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const max = sorted[0]?.[1] || 1;

  const summary = document.getElementById('cards-interest-summary');
  summary.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'summary-title';
  title.textContent = 'Interesse-Abdeckung (Gesamtpunkte über alle Karten)';
  summary.appendChild(title);

  const bars = document.createElement('div');
  bars.className = 'summary-bars';

  sorted.forEach(([theme, pts]) => {
    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <span class="summary-label">${theme}</span>
      <div class="summary-bar-bg">
        <div class="summary-bar-fill" style="width:${(pts / max * 100).toFixed(1)}%"></div>
      </div>
      <span class="summary-value">${pts}</span>
    `;
    bars.appendChild(row);
  });

  summary.appendChild(bars);

  // Wirkungsübersicht
  const wirkungTotals = {};
  CARD_DEFINITIONS.forEach(card => {
    Object.entries(card.direkteWirkung ?? {}).forEach(([stat, val]) => {
      if (!wirkungTotals[stat]) wirkungTotals[stat] = { pos: 0, neg: 0 };
      if (val > 0) wirkungTotals[stat].pos += val;
      else         wirkungTotals[stat].neg += val;
    });
  });

  const wirkungDivider = document.createElement('div');
  wirkungDivider.className = 'summary-section-divider';
  summary.appendChild(wirkungDivider);

  const wirkungTitle = document.createElement('div');
  wirkungTitle.className = 'summary-title';
  wirkungTitle.textContent = 'Direkte Wirkungen (Summe über alle Karten)';
  summary.appendChild(wirkungTitle);

  const wirkungGrid = document.createElement('div');
  wirkungGrid.className = 'wirkung-summary-grid';

  Object.entries(wirkungTotals).forEach(([stat, { pos, neg }]) => {
    const row = document.createElement('div');
    row.className = 'wirkung-summary-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'wirkung-summary-label';
    labelEl.textContent = `${WIRKUNG_ICONS[stat] ?? stat} ${WIRKUNG_LABELS[stat] ?? stat}`;

    const posEl = document.createElement('span');
    posEl.className = 'wirkung-summary-pos';
    posEl.textContent = pos > 0 ? `+${pos}` : '—';

    const negEl = document.createElement('span');
    negEl.className = 'wirkung-summary-neg';
    negEl.textContent = neg < 0 ? String(neg) : '—';

    row.appendChild(labelEl);
    row.appendChild(posEl);
    row.appendChild(negEl);
    wirkungGrid.appendChild(row);
  });

  summary.appendChild(wirkungGrid);

  // Wirkungen nach Kategorie
  const catDivider = document.createElement('div');
  catDivider.className = 'summary-section-divider';
  summary.appendChild(catDivider);

  const catTitle = document.createElement('div');
  catTitle.className = 'summary-title';
  catTitle.textContent = 'Direkte Wirkungen nach Kategorie';
  summary.appendChild(catTitle);

  const allStats = [...new Set(
    CARD_DEFINITIONS.flatMap(c => Object.keys(c.direkteWirkung ?? {}))
  )];

  const catTotals = {};
  ['ROT', 'GRUEN', 'BLAU', 'WEISS'].forEach(t => { catTotals[t] = {}; });
  CARD_DEFINITIONS.forEach(card => {
    Object.entries(card.direkteWirkung ?? {}).forEach(([stat, val]) => {
      catTotals[card.type][stat] = (catTotals[card.type][stat] || 0) + val;
    });
  });

  const catTable = document.createElement('div');
  catTable.className = 'wirkung-cat-table';

  const headerRow = document.createElement('div');
  headerRow.className = 'wirkung-cat-row';
  const emptyTh = document.createElement('div');
  emptyTh.className = 'wirkung-cat-label';
  headerRow.appendChild(emptyTh);
  allStats.forEach(stat => {
    const th = document.createElement('div');
    th.className = 'wirkung-cat-cell wirkung-cat-head';
    th.textContent = `${WIRKUNG_ICONS[stat] ?? stat} ${WIRKUNG_LABELS[stat] ?? stat}`;
    headerRow.appendChild(th);
  });
  catTable.appendChild(headerRow);

  const CAT_COLORS = { ROT: '#e74c3c', GRUEN: '#2ecc71', BLAU: '#3498db', WEISS: '#bdc3c7' };
  ['ROT', 'GRUEN', 'BLAU', 'WEISS'].forEach(type => {
    const row = document.createElement('div');
    row.className = 'wirkung-cat-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'wirkung-cat-label';
    labelEl.textContent = CATEGORY_LABELS[type].split('–')[0].trim();
    labelEl.style.color = CAT_COLORS[type];
    row.appendChild(labelEl);

    allStats.forEach(stat => {
      const val = catTotals[type][stat] ?? null;
      const cell = document.createElement('div');
      cell.className = 'wirkung-cat-cell';
      if (val === null || val === 0) {
        cell.textContent = '—';
        cell.classList.add('wirkung-cat-empty');
      } else if (val > 0) {
        cell.textContent = `+${val}`;
        cell.classList.add('wirkung-cat-pos');
      } else {
        cell.textContent = String(val);
        cell.classList.add('wirkung-cat-neg');
      }
      row.appendChild(cell);
    });

    catTable.appendChild(row);
  });

  summary.appendChild(catTable);

  document.getElementById('cards-overview-overlay').style.display = 'flex';
}

function closeCardsOverview() {
  document.getElementById('cards-overview-overlay').style.display = 'none';
}

// ── Init ───────────────────────────────────────
function init() {
  generateInterests();
  buildDeck();
  drawHand();

  window.addEventListener('resize', fitHandToContainer);
  window.addEventListener('orientationchange', fitHandToContainer);

  renderStatusBars();
  renderHand();
  renderFeed();
  renderTime();
  renderScore();
  renderBackground();
  renderUser();
  renderInterestPyramid();
  renderWindowStatus();
  initPyramidTooltip();
  initValueInfoPanels();
  initFeedInfoPanel();

  const hs = loadAlgHighscores().highscore;
  if (hs >= 10) {
    document.getElementById('endless-mode-btn').style.display = '';
    document.getElementById('cards-overview-btn').style.display = '';
  }

  initHubState();

  // Cross-Device: bei Login den DB-Highscore holen und ggf. lokal übernehmen.
  // Score-Feld in DB = bestTime (Ingame-Minuten); rekonstruiere daraus den
  // Score-Wert für den Endless-Freischalt-Check.
  (async () => {
    if (!window.pullHighscore) return;
    const doPull = async () => {
      const serverBestTime = await window.pullHighscore('game10');
      if (!serverBestTime) return;
      const stored = loadAlgHighscores();
      let dirty = false;
      if (serverBestTime > stored.bestTime) {
        stored.bestTime = serverBestTime;
        // Score aus Zeit rekonstruieren: floor((minutes - 120) / 60), min 0
        const derivedScore = Math.max(0, Math.floor((serverBestTime - 120) / 60));
        if (derivedScore > stored.highscore) stored.highscore = derivedScore;
        dirty = true;
      }
      if (dirty) {
        saveStorage('algorithm_hs_v1', stored);
        renderScore();
        if (stored.highscore >= 10) {
          document.getElementById('endless-mode-btn').style.display = '';
          document.getElementById('cards-overview-btn').style.display = '';
        }
      }
    };
    if (window.waitForSession) window.waitForSession().then(doPull);
    else setTimeout(doPull, 500);
  })();
}


document.addEventListener('DOMContentLoaded', init);
