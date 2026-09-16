// Hub-Bridge: verheiratet die Bubble-Bounce-Runde mit dem Lernwelt-Hub.
// Wird von main.js an drei Stellen angezogen: initial (Boot), beim
// MENU→PLAY-Wechsel (Companion ausblenden), bei gameOver() (commitRun).
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};

  const MAX_SCORE = 15000;         // 15000 In-Game-Punkte = 10 Hub-Punkte
  const params    = new URLSearchParams(window.location.search);
  const gameId    = params.get('id')  || 'game17';
  const eggType   = params.get('egg') || null;

  const state = {
    gd: null,
    hubSaved: false,
    lastResult: null,
    // liveGrowth: mid-run Vorschau des Growth-Werts (aktueller Score in
    // Growth-Punkte umgerechnet + gd.growth). render.js nutzt das, um die
    // Kreatur im Hintergrund live wachsen zu lassen. Nach commitRun/reset
    // wieder null, damit die tatsächliche gd.growth den Ausschlag gibt.
    liveGrowth: null
  };

  function setLivePreview(rawScore){
    const gd = state.gd;
    if (!gd) return;
    const capped = Math.max(0, Math.min(Number(rawScore) || 0, MAX_SCORE));
    const gain = (typeof computeSessionGrowth === 'function')
      ? computeSessionGrowth(capped, MAX_SCORE) : 0;
    const cap  = (typeof GROWTH_MAX === 'number') ? GROWTH_MAX : 21;
    state.liveGrowth = Math.min((gd.growth || 0) + gain, cap);
  }
  function clearLivePreview(){ state.liveGrowth = null; }

  function readGd(){
    if (typeof getGameData !== 'function') return null;
    return getGameData(gameId) || defaultGameData();
  }

  function renderMenuCompanion(){
    const wrap = document.getElementById('bb-menu-companion');
    if (!wrap) return;
    const gd = state.gd || readGd();
    if (!gd) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (gd.creature) {
      const stage = getGrowthStage(gd.growth);
      wrap.innerHTML =
        '<div class="bb-menu-companion__img">' + getCreatureHTML(gd.creature, stage) + '</div>' +
        '<div class="bb-menu-companion__name">' +
          (CREATURE_NAMES[gd.creature] || '') +
          ' · ' + (GROWTH_LABELS[stage] || '') +
        '</div>';
    } else {
      wrap.innerHTML =
        '<div class="bb-menu-companion__img">' + getEggSVG(0) + '</div>' +
        '<div class="bb-menu-companion__name">Dein Ei wartet…</div>';
    }
  }

  function showMenu(){
    const wrap = document.getElementById('bb-menu-companion');
    if (wrap) wrap.hidden = false;
    renderMenuCompanion();
  }
  function hideMenu(){
    const wrap = document.getElementById('bb-menu-companion');
    if (wrap) wrap.hidden = true;
  }

  // Wird von main.gameOver aufgerufen. Cappt Score, ermittelt Kreatur beim
  // Erstlauf, verbucht Coins/Growth via computeRoundResult, schreibt gd zurück
  // und pusht den ungecappten Rohscore ans Highscore-Board.
  function commitRun(rawScore){
    if (state.hubSaved) return state.lastResult;
    if (typeof getGameData !== 'function') return null;

    const gd      = readGd();
    const isFirst = !gd.creature;
    const sd      = loadShopData();
    const capped  = Math.max(0, Math.min(Number(rawScore) || 0, MAX_SCORE));
    const norm    = Math.min(10, Math.round(capped / MAX_SCORE * 10));

    if (isFirst) {
      if (eggType) {
        gd.creature = determineEggCreature(eggType, norm);
      } else if (sd.lockmittel) {
        gd.creature = determineCreatureWithLockmittel(norm, gameId);
      } else if (sd.glucksklee) {
        gd.creature = determineCreatureWithGlucksklee(norm, gameId);
      } else {
        gd.creature = determineCreature(norm, true, gameId);
      }
      gd.growth = 0;
    }

    const coinsGained = computeRoundResult(gd, capped, MAX_SCORE, sd, isFirst);

    // Consumables VOR saveGameData clearen (Memory: Stale-sd-Nest-Clobber +
    // Consumables-spent-counter, Migration 0042).
    if (sd.wachstumsBooster) {
      sd.wachstumsBooster      = false;
      sd.wachstumsBoosterSpent = (sd.wachstumsBoosterSpent || 0) + 1;
      saveShopData(sd);
    }
    if (sd.coinsx3) {
      sd.coinsx3      = false;
      sd.coinsx3Spent = (sd.coinsx3Spent || 0) + 1;
      saveShopData(sd);
    }
    if (isFirst && sd.lockmittel) {
      sd.lockmittel      = false;
      sd.lockmittelSpent = (sd.lockmittelSpent || 0) + 1;
      saveShopData(sd);
    } else if (isFirst && sd.glucksklee) {
      sd.glucksklee      = false;
      sd.gluckskleeSpent = (sd.gluckskleeSpent || 0) + 1;
      saveShopData(sd);
    }

    gd.points       += norm;
    gd.roundsPlayed += 1;
    saveGameData(gameId, gd);
    state.gd       = gd;
    state.hubSaved = true;

    if (typeof window.pushHighscore === 'function') {
      window.pushHighscore(gameId, Math.max(0, Math.floor(Number(rawScore) || 0)));
    }

    state.lastResult = {
      isFirst,
      score:       Math.max(0, Math.floor(Number(rawScore) || 0)),
      capped,
      hubPoints:   norm,
      coinsGained,
      creature:    gd.creature,
      growthStage: getGrowthStage(gd.growth)
    };
    // Aktive Items sind verbraucht → Boost-Bar refreshen, damit die
    // Icons verschwinden.
    refreshBoostBar();
    return state.lastResult;
  }

  function renderEndscreen(highScore){
    const r = state.lastResult;
    if (!r) return;
    const es = document.getElementById('bb-endscreen');
    if (!es) return;

    const creatureEl = document.getElementById('bb-es-creature');
    const nameEl     = document.getElementById('bb-es-name');
    const scoreEl    = document.getElementById('bb-es-score');
    const bestEl     = document.getElementById('bb-es-best');
    const hubEl      = document.getElementById('bb-es-hub');

    if (creatureEl) creatureEl.innerHTML = r.creature ? getCreatureHTML(r.creature, r.growthStage) : getEggSVG(4);
    if (nameEl) {
      nameEl.textContent = r.creature
        ? `${CREATURE_NAMES[r.creature] || ''} · ${GROWTH_LABELS[r.growthStage] || ''}`
        : '';
    }
    if (scoreEl) scoreEl.textContent = r.score.toLocaleString('de-DE');
    if (bestEl)  bestEl.textContent  = Math.max(highScore || 0, r.score).toLocaleString('de-DE');
    if (hubEl)   hubEl.textContent   = String(r.hubPoints);

    if (typeof renderCoinBank === 'function') {
      renderCoinBank('bb-es-coinbank', r.coinsGained);
    }
    if (typeof window.awardBonbonsAndRender === 'function') {
      window.awardBonbonsAndRender(gameId, r.capped, MAX_SCORE, 'bb-es-coinbank');
    }
    if (typeof renderResultItemButton === 'function') {
      renderResultItemButton('bb-es-item', gameId, () => location.reload());
    }

    es.hidden = false;
    es.classList.add('open');
  }

  function hideEndscreen(){
    const es = document.getElementById('bb-endscreen');
    if (!es) return;
    es.classList.remove('open');
    es.hidden = true;
  }

  function resetForNewRun(){
    state.hubSaved   = false;
    state.lastResult = null;
    state.liveGrowth = null;
    hideEndscreen();
  }

  function refreshBoostBar(){
    if (typeof renderBoostIndicators === 'function') {
      renderBoostIndicators('bb-boost-bar', gameId);
    }
  }

  function boot(){
    state.gd = readGd();
    renderMenuCompanion();
    refreshBoostBar();
    // Nochmal-Button im Endscreen.
    const again = document.getElementById('bb-es-again');
    if (again) {
      again.addEventListener('click', () => {
        resetForNewRun();
        if (FE.main && typeof FE.main.startGame === 'function') FE.main.startGame();
      });
    }
  }

  FE.hub = {
    gameId,
    MAX_SCORE,
    commitRun,
    renderEndscreen,
    hideEndscreen,
    resetForNewRun,
    showMenu,
    hideMenu,
    setLivePreview,
    clearLivePreview,
    refreshBoostBar,
    boot,
    state
  };

  // Wenn creatures.js schon geladen ist, sofort booten — sonst nach DOMContentLoaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
