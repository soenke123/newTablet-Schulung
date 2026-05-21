(function () {
  // dir values:
  //   'from-right'     → arrow right of spotlight, pointing LEFT; label right of arrow
  //   'from-above'     → arrow above spotlight, pointing DOWN; label above arrow
  //   'inside-top-up'  → arrow at top-inside spotlight, pointing UP; label above spotlight
  const STEPS = [
    {
      targetId: 'interest-widget',
      label: 'Die <strong>Interessen</strong> des Users. Das richtige Maß an interessanten Inhalten im Feed ist für das Dopamin perfekt. <strong>(35%)</strong>',
      dir: 'from-right',
    },
    {
      targetId: 'values-widget',
      label: 'Die <strong>Basiswerte</strong>: Dopamin nicht auf 0 sinken lassen. Sozialdrang nicht auf 100 steigen lassen. Reizschwelle im grünen Bereich halten.',
      dir: 'from-right',
    },
    {
      targetId: 'feed-panel',
      label: 'Der <strong>Feed</strong> – Karten, die du hier platzierst, beeinflussen ständig alle Basiswerte.',
      dir: 'from-above',
    },
    {
      targetId: 'hand-area',
      label: 'Ziehe eine Karte aufs Spielfeld, damit sie im Feed landet. Dann beginnt das Spiel.',
      dir: 'inside-top-up',
      isLast: true,
    },
  ];

  let _step = 0;
  let _resizeHandler = null;
  let _clickHandler = null;

  function showTutorial() {
    if (typeof gameState !== 'undefined' && gameState.endlessMode) {
      _startGameLoop();
      return;
    }
    _step = 0;
    document.getElementById('tutorial-overlay').style.display = 'block';
    _renderStep();

    _clickHandler = function (e) {
      if (e.target.closest('#tutorial-skip-wrap')) return;
      _advance();
    };
    document.getElementById('tutorial-overlay').addEventListener('click', _clickHandler);

    _resizeHandler = function () { _renderStep(); };
    window.addEventListener('resize', _resizeHandler);
  }

  function tutorialSkipToLast(e) {
    if (e) e.stopPropagation();
    _step = STEPS.length - 1;
    _renderStep();
  }

  function _advance() {
    _step++;
    if (_step >= STEPS.length) {
      _dismissTutorial();
    } else {
      _renderStep();
    }
  }

  function _dismissTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (_clickHandler)  overlay.removeEventListener('click', _clickHandler);
    if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
    _clickHandler  = null;
    _resizeHandler = null;
    overlay.style.display = 'none';
    _startGameLoop();
  }

  function _renderStep() {
    const step     = STEPS[_step];
    const targetEl = document.getElementById(step.targetId);
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const PAD  = 10;
    const GAP  = 12;

    // ── Spotlight ─────────────────────────────────────
    const spotEl   = document.getElementById('tutorial-spotlight');
    const spotLeft = rect.left  - PAD;
    const spotTop  = rect.top   - PAD;
    const spotW    = rect.width  + PAD * 2;
    const spotH    = rect.height + PAD * 2;
    spotEl.style.left   = spotLeft + 'px';
    spotEl.style.top    = spotTop  + 'px';
    spotEl.style.width  = spotW    + 'px';
    spotEl.style.height = spotH    + 'px';

    // ── Arrow dimensions ──────────────────────────────
    const arrowEl = document.getElementById('tutorial-arrow');
    const arrowW  = arrowEl.offsetWidth  || 56;
    const arrowH  = arrowEl.offsetHeight || 70;
    const spotCX  = spotLeft + spotW / 2;
    const spotCY  = spotTop  + spotH / 2;

    let arrowTop, arrowLeft, arrowRot;

    if (step.dir === 'from-right') {
      // Arrow to the right of spotlight, pointing LEFT (270°)
      arrowRot  = 270;
      arrowLeft = spotLeft + spotW + GAP;
      arrowTop  = spotCY - arrowH / 2;
    } else if (step.dir === 'from-above') {
      // Arrow above spotlight, pointing DOWN (180°)
      arrowRot  = 180;
      arrowLeft = spotCX - arrowW / 2;
      arrowTop  = spotTop - arrowH - GAP;
    } else {
      // inside-top-up: arrow at top of spotlight, pointing UP (0°)
      arrowRot  = 0;
      arrowLeft = spotCX - arrowW / 2;
      arrowTop  = spotTop + GAP;
    }

    arrowEl.style.left = Math.max(4, Math.min(window.innerWidth - arrowW - 4, arrowLeft)) + 'px';
    arrowEl.style.top  = Math.max(4, arrowTop) + 'px';
    arrowEl.style.setProperty('--tut-rot', arrowRot + 'deg');

    // ── Label ─────────────────────────────────────────
    const labelEl   = document.getElementById('tutorial-label-box');
    const textEl    = document.getElementById('tutorial-label-text');
    const labelMaxW = Math.min(300, window.innerWidth * 0.55);

    textEl.innerHTML = step.label
      + (!step.isLast ? '<div class="tut-tap-hint">Tippen zum Weiter</div>' : '');

    labelEl.style.maxWidth = labelMaxW + 'px';

    if (window.innerWidth < 600) {
      // Mobil: Label über dem Schwein-Sprite zentrieren
      const spriteRect = document.getElementById('user-sprite').getBoundingClientRect();
      const roomRect   = document.getElementById('room').getBoundingClientRect();
      const mobileMaxW = Math.min(Math.round(roomRect.width * 0.88), window.innerWidth - 16);
      labelEl.style.maxWidth = mobileMaxW + 'px';
      const lLeft = Math.max(8, roomRect.left + roomRect.width / 2 - mobileMaxW / 2);
      labelEl.style.left = lLeft + 'px';
      labelEl.style.top  = '0px';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const labelH    = labelEl.offsetHeight || 80;
        const spriteCY  = spriteRect.top + spriteRect.height / 2;
        const idealTop  = spriteCY - labelH / 2;
        const clampedTop = Math.max(roomRect.top + 6, Math.min(roomRect.bottom - labelH - 6, idealTop));
        labelEl.style.top = clampedTop + 'px';
      }));
    } else if (step.dir === 'from-right') {
      // Label rechts neben dem Pfeil, vertikal auf Spotlight-Mitte
      const lLeft = Math.min(window.innerWidth - labelMaxW - 8, arrowLeft + arrowW + 10);
      labelEl.style.left = Math.max(8, lLeft) + 'px';
      labelEl.style.top  = '0px';
      requestAnimationFrame(() => {
        const labelH   = labelEl.offsetHeight || 80;
        labelEl.style.top = Math.max(8, spotCY - labelH / 2) + 'px';
      });
    } else {
      // from-above / inside-top-up: Label zentriert über Pfeil/Spotlight
      const lLeft = Math.max(8, Math.min(window.innerWidth - labelMaxW - 8, spotCX - labelMaxW / 2));
      labelEl.style.left = lLeft + 'px';
      labelEl.style.top  = '0px';
      requestAnimationFrame(() => {
        const labelH  = labelEl.offsetHeight || 80;
        const anchor  = step.dir === 'inside-top-up' ? (spotTop + GAP) : (spotTop - arrowH - GAP);
        labelEl.style.top = Math.max(8, anchor - labelH - GAP) + 'px';
      });
    }

    // Skip button: hide on last step
    document.getElementById('tutorial-skip-btn').style.visibility =
      step.isLast ? 'hidden' : 'visible';
  }

  window.showTutorial       = showTutorial;
  window.tutorialSkipToLast = tutorialSkipToLast;
})();
