/**
 * =====================================================================
 * SLIDEEFFECT – APPLIKATIONSLOGIK
 * =====================================================================
 */

const QUESTIONS_PER_ROUND = 8;
const MAX_ERROR_PERCENT = 20.0;
const BASE_MAX_POINTS = 100;
const EXACT_BONUS_POINTS = 20; // Gesamt 120 Punkte bei Volltreffer (100 Basis + 20 Bonus)

// Spielzustand
let roundQuestions = [];
let currentIndex = 0;
let totalScore = 0;
let roundHistory = [];

// DOM-Elemente
const screens = {
  start: document.getElementById('start-screen'),
  game: document.getElementById('game-screen'),
  feedback: document.getElementById('feedback-screen'),
  end: document.getElementById('end-screen')
};

const headerScoreVal = document.getElementById('header-score-val');

// Game Screen Elemente
const progressFill = document.getElementById('progress-fill');
const questionCounter = document.getElementById('question-counter');
const questionUnitTag = document.getElementById('question-unit-tag');
const questionText = document.getElementById('question-text');
const guessValueDisplay = document.getElementById('guess-value-display');
const guessUnitDisplay = document.getElementById('guess-unit-display');
const guessSlider = document.getElementById('guess-slider');
const rangeMinLabel = document.getElementById('range-min-label');
const rangeMaxLabel = document.getElementById('range-max-label');
const btnStepMinus = document.getElementById('btn-step-minus');
const btnStepPlus = document.getElementById('btn-step-plus');
const btnSubmitGuess = document.getElementById('btn-submit-guess');

// Feedback Screen Elemente
const feedbackBanner = document.getElementById('feedback-banner');
const feedbackStatusTitle = document.getElementById('feedback-status-title');
const feedbackStatusSubtitle = document.getElementById('feedback-status-subtitle');
const comparisonDiffBar = document.getElementById('comparison-diff-bar');
const pinGuess = document.getElementById('pin-guess');
const pinGuessLabel = document.getElementById('pin-guess-label');
const pinActual = document.getElementById('pin-actual');
const pinActualLabel = document.getElementById('pin-actual-label');
const statGuessVal = document.getElementById('stat-guess-val');
const statActualVal = document.getElementById('stat-actual-val');
const statPointsVal = document.getElementById('stat-points-val');
const feedbackExplanation = document.getElementById('feedback-explanation');
const feedbackSourceLink = document.getElementById('feedback-source-link');
const feedbackSourceText = document.getElementById('feedback-source-text');
const btnNextQuestion = document.getElementById('btn-next-question');

// End Screen Elemente
const finalRank = document.getElementById('final-rank');
const finalScoreVal = document.getElementById('final-score-val');
const reviewTabs = document.getElementById('review-tabs');
const reviewActiveCard = document.getElementById('review-active-card');
const reviewNavCounter = document.getElementById('review-nav-counter');
const btnPrevReview = document.getElementById('btn-prev-review');
const btnNextReview = document.getElementById('btn-next-review');
const btnRestartGame = document.getElementById('btn-restart-game');
const btnStartGame = document.getElementById('btn-start-game');

let activeReviewIndex = 0;

// Theme- & Farbmodus-Erkennung und Initialisierung
function initTheme() {
  const urlParams = new URLSearchParams(window.location.search);
  const themeParam = urlParams.get('theme');
  const savedTheme = localStorage.getItem('quiz_theme');

  // Standardmäßig Retro Arcade nutzen
  const activeTheme = themeParam || savedTheme || 'arcade';
  document.documentElement.setAttribute('data-theme', activeTheme);
  localStorage.setItem('quiz_theme', activeTheme);

  // Farbmodus für Arcade (magenta, green, orange)
  const savedArcadeColor = localStorage.getItem('quiz_arcade_color') || 'magenta';
  setArcadeColor(savedArcadeColor, false);
}

function setArcadeColor(color, save = true) {
  document.documentElement.setAttribute('data-arcade-color', color);
  if (document.body) {
    document.body.setAttribute('data-arcade-color', color);
  }
  if (save) {
    localStorage.setItem('quiz_arcade_color', color);
  }

  // Aktive Farbfläche hervorheben
  document.querySelectorAll('.color-swatch-btn').forEach(btn => {
    if (btn.dataset.color === color) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Slider-Farbe anpassen falls vorhanden
  if (typeof updateSliderDisplay === 'function') {
    const sliderEl = document.getElementById('guess-slider');
    if (sliderEl) {
      updateSliderDisplay();
    }
  }
}
// Global verfügbar machen für inline onclick
window.setArcadeColor = setArcadeColor;

/**
 * Wechselt den angezeigten Bildschirm
 */
function showScreen(screenKey) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  if (screens[screenKey]) {
    screens[screenKey].classList.add('active');
  }
}

/**
 * Array zufällig mischen (Fisher-Yates)
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Zahl formatiert ausgeben (unterstützt Nachkommastellen je nach Schrittweite)
 */
function formatNumber(num, step = 1) {
  if (typeof num !== 'number') num = parseFloat(num);
  if (isNaN(num)) return '0';
  if (typeof step === 'number' && step < 0.05) {
    return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof step === 'number' && step < 1) {
    return num.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  if (Number.isInteger(num)) {
    return num.toLocaleString('de-DE');
  }
  return num.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/**
 * Startet eine neue Quiz-Runde
 */
function startNewQuiz() {
  if (!QUESTION_POOL || QUESTION_POOL.length === 0) {
    alert("Keine Fragen im Fragenkatalog gefunden!");
    return;
  }

  // Wähle 8 Fragen zufällig aus dem Pool
  const shuffledPool = shuffleArray(QUESTION_POOL);
  roundQuestions = shuffledPool.slice(0, Math.min(QUESTIONS_PER_ROUND, shuffledPool.length));
  
  currentIndex = 0;
  totalScore = 0;
  roundHistory = [];
  updateHeaderScore();

  loadQuestion(currentIndex);
  showScreen('game');
}

/**
 * Aktualisiert den Header-Punktestand
 */
function updateHeaderScore() {
  headerScoreVal.textContent = totalScore;
}

/**
 * Lädt Frage an Index
 */
function loadQuestion(index) {
  const q = roundQuestions[index];
  if (!q) return;

  // Fortschritt
  const progressPercent = ((index) / roundQuestions.length) * 100;
  progressFill.style.width = `${progressPercent}%`;
  questionCounter.textContent = `Frage ${index + 1} von ${roundQuestions.length}`;
  questionUnitTag.textContent = `Einheit: ${q.unit}`;

  // Fragetext
  questionText.textContent = q.question;

  // Slider konfigurieren
  guessSlider.min = q.min;
  guessSlider.max = q.max;
  guessSlider.step = q.step || 1;

  // Startwert: Bei negativem Min zu positivem Max idealerweise 0, sonst Mittelwert
  const step = q.step || 1;
  let steppedMid;
  if (q.min < 0 && q.max > 0) {
    steppedMid = 0;
  } else {
    const rawMid = (q.min + q.max) / 2;
    steppedMid = Math.round(rawMid / step) * step;
  }
  guessSlider.value = steppedMid;

  rangeMinLabel.textContent = `${formatNumber(q.min, q.step)} ${q.unit}`;
  rangeMaxLabel.textContent = `${formatNumber(q.max, q.step)} ${q.unit}`;
  guessUnitDisplay.textContent = q.unit;

  updateSliderDisplay();
}

/**
 * Aktualisiert die visuelle Anzeige des Schiebereglers
 */
function updateSliderDisplay() {
  const q = roundQuestions[currentIndex];
  const step = q ? (q.step || 1) : 1;
  const val = parseFloat(guessSlider.value);
  guessValueDisplay.textContent = formatNumber(val, step);

  // Hintergrund-Füllung des Sliders bis zum Daumen (Thumb)
  const min = parseFloat(guessSlider.min);
  const max = parseFloat(guessSlider.max);
  const percent = ((val - min) / (max - min)) * 100;

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'arcade';
  if (currentTheme === 'arcade') {
    const currentColor = document.documentElement.getAttribute('data-arcade-color') || 'magenta';
    let pColor = '#ec4899';
    let sColor = '#06b6d4';
    if (currentColor === 'green') {
      pColor = '#10b981';
      sColor = '#06b6d4';
    } else if (currentColor === 'orange') {
      pColor = '#ff5500';
      sColor = '#facc15';
    }
    guessSlider.style.background = `linear-gradient(to right, ${pColor} 0%, ${sColor} ${percent}%, rgba(0, 0, 0, 0.6) ${percent}%)`;
  } else {
    guessSlider.style.background = `linear-gradient(to right, #6366f1 0%, #38bdf8 ${percent}%, rgba(255, 255, 255, 0.12) ${percent}%)`;
  }

  // Live-Vergleich für Frage 11 (GW Kraftwerke)
  const liveComparisonHint = document.getElementById('live-comparison-hint');
  if (q && q.hasPowerComparison && liveComparisonHint) {
    let compText = '';
    if (val === 0) {
      compText = '0 GW (Keine Rechenleistung)';
    } else if (val < 0.1) {
      compText = `≈ ${(val * 1000).toFixed(0)} MW (Industriebetriebe)`;
    } else if (val < 0.8) {
      compText = `≈ ${(val * 10).toFixed(0)} große Wind-/Solarparks (je 100 MW)`;
    } else if (val >= 0.8 && val < 1.3) {
      compText = `≈ 1 großes Kern-/Kohlekraftwerk (1 GW)`;
    } else if (val >= 1.3 && val < 1.7) {
      compText = `≈ 1,5 große Kraftwerke`;
    } else if (val >= 1.7 && val < 2.3) {
      compText = `≈ 2 große Großkraftwerke (je 1 GW)`;
    } else {
      compText = `≈ ${val.toFixed(1).replace('.', ',')} große Großkraftwerke (je 1 GW)`;
    }
    liveComparisonHint.innerHTML = `<span class="comp-icon">⚡</span> <span class="comp-label">Vergleich:</span> <span class="comp-val">${compText}</span>`;
    liveComparisonHint.style.display = 'inline-flex';
  } else if (liveComparisonHint) {
    liveComparisonHint.style.display = 'none';
  }
}

/**
 * Stepper (- / +) Funktion für Touchscreens & Tablets
 */
function stepSlider(direction) {
  const step = parseFloat(guessSlider.step) || 1;
  const min = parseFloat(guessSlider.min);
  const max = parseFloat(guessSlider.max);
  let current = parseFloat(guessSlider.value);

  // Gleitkomma-Präzisionsrundung
  current = Math.round((current + direction * step) * 10000) / 10000;
  if (current < min) current = min;
  if (current > max) current = max;

  guessSlider.value = current;
  updateSliderDisplay();
}

/**
 * Antwort einloggen und Punkte berechnen
 */
function submitGuess() {
  if (!screens.game.classList.contains('active')) return;
  const q = roundQuestions[currentIndex];
  const guess = parseFloat(guessSlider.value);
  const actual = q.actual;

  // Mathematische Abweichung berechnen (mit Rundung gegen Gleitkomma-Ungenauigkeit)
  const diff = Math.round(Math.abs(guess - actual) * 1000000) / 1000000;
  let errorPercent = (diff / Math.abs(actual)) * 100;

  let points = 0;
  let isExact = false;

  if (q.rangeMin !== undefined && q.rangeMax !== undefined) {
    // 1. Bereichsfrage (z.B. TikTok 23 - 34 Mio. Videos)
    if (guess >= q.rangeMin && guess <= q.rangeMax) {
      isExact = true;
      points = BASE_MAX_POINTS + EXACT_BONUS_POINTS; // 150 Volltreffer
      errorPercent = 0;
    } else if (guess < q.rangeMin) {
      // Teilpunkte nur bis +-10% Toleranz unter dem Bereich (10% von 23 = 2,3)
      const tol = q.rangeMin * 0.10;
      const underDiff = Math.round((q.rangeMin - guess) * 1000000) / 1000000;
      errorPercent = (underDiff / q.rangeMin) * 100;
      if (underDiff <= tol) {
        const fraction = 1 - (underDiff / tol);
        points = Math.max(0, Math.round(BASE_MAX_POINTS * fraction));
      } else {
        points = 0;
      }
    } else {
      // Teilpunkte nur bis +-10% Toleranz über dem Bereich (10% von 34 = 3,4)
      const tol = q.rangeMax * 0.10;
      const overDiff = Math.round((guess - q.rangeMax) * 1000000) / 1000000;
      errorPercent = (overDiff / q.rangeMax) * 100;
      if (overDiff <= tol) {
        const fraction = 1 - (overDiff / tol);
        points = Math.max(0, Math.round(BASE_MAX_POINTS * fraction));
      } else {
        points = 0;
      }
    }
  } else if (q.exactTolerance !== undefined) {
    // 2. Frage mit Volltreffer-Toleranz (z.B. Meta 3,58 +- 0,1)
    if (diff <= q.exactTolerance) {
      isExact = true;
      points = BASE_MAX_POINTS + EXACT_BONUS_POINTS;
      errorPercent = (diff / Math.abs(actual)) * 100;
    } else if (errorPercent > MAX_ERROR_PERCENT) {
      points = 0;
    } else {
      const fraction = 1 - (errorPercent / MAX_ERROR_PERCENT);
      points = Math.max(0, Math.round(BASE_MAX_POINTS * fraction));
    }
  } else {
    // 3. Standard-Fragen
    if (guess === actual || diff === 0) {
      isExact = true;
      points = BASE_MAX_POINTS + EXACT_BONUS_POINTS;
    } else if (errorPercent > MAX_ERROR_PERCENT) {
      points = 0;
    } else {
      const fraction = 1 - (errorPercent / MAX_ERROR_PERCENT);
      points = Math.max(0, Math.round(BASE_MAX_POINTS * fraction));
    }
  }

  if (isExact) {
    triggerConfetti();
  }

  totalScore += points;
  updateHeaderScore();

  // Für Historie speichern
  roundHistory.push({
    question: q.question,
    unit: q.unit,
    step: q.step || 1,
    guess: guess,
    actual: actual,
    actualDisplay: q.actualDisplay,
    diff: diff,
    errorPercent: errorPercent,
    points: points,
    isExact: isExact,
    explanation: q.explanation,
    sourceUrl: q.sourceUrl,
    sourceName: q.sourceName,
    sourceDate: q.sourceDate
  });

  // Feedback-Screen vorbereiten & anzeigen
  renderFeedback(q, guess, actual, errorPercent, points, isExact);
}

/**
 * Visualisierung des Feedbacks mit Schiebebalken und Quelle
 */
function renderFeedback(q, guess, actual, errorPercent, points, isExact) {
  // 1. Status-Banner konfigurieren
  feedbackBanner.className = 'feedback-status-banner';
  if (isExact) {
    feedbackBanner.classList.add('exact');
    feedbackStatusTitle.textContent = "🎯 VOLLTREFFER!";
    feedbackStatusSubtitle.textContent = `Exakt getroffen! Du erhältst das Maximum von ${points} Punkten (inkl. ${EXACT_BONUS_POINTS} Bonus)!`;
  } else if (points > 0) {
    feedbackBanner.classList.add('points');
    feedbackStatusTitle.textContent = "👍 Gut geschätzt!";
    feedbackStatusSubtitle.textContent = `Nur ${errorPercent.toFixed(1)}% Abweichung – Das gibt ${points} Punkte!`;
  } else {
    feedbackBanner.classList.add('zero');
    feedbackStatusTitle.textContent = "❌ Leider daneben!";
    feedbackStatusSubtitle.textContent = `Mit ${errorPercent.toFixed(1)}% Abweichung über der Toleranz (0 Punkte).`;
  }

  // 2. Skalen-Pins & Verbindungsstrecke (unterstützt negative Minima)
  const rangeSpan = q.max - q.min;
  const rawGuessPos = Math.max(0, Math.min(100, ((guess - q.min) / rangeSpan) * 100));
  const rawActualPos = Math.max(0, Math.min(100, ((actual - q.min) / rangeSpan) * 100));

  // Pins leicht einrücken (1.5% bis 98.5%), damit die Kreise nie über den Schienenrand ragen
  const guessPos = Math.max(1.5, Math.min(98.5, rawGuessPos));
  const actualPos = Math.max(1.5, Math.min(98.5, rawActualPos));

  pinGuess.style.left = `${guessPos}%`;
  pinGuessLabel.textContent = `Dein Tipp: ${formatNumber(guess, q.step)}`;

  pinActual.style.left = `${actualPos}%`;
  pinActualLabel.textContent = `Richtig: ${q.actualDisplay || (formatNumber(actual, q.step) + ' ' + q.unit)}`;

  // Dynamische Verschiebung der Bubbles, damit sie an den Rändern NIEMALS aus dem Kasten ragen
  function getBubbleShift(pos) {
    if (pos <= 20) {
      // Am linken Rand: Von 0% (linksbündig mit Pin) bis -50% (voll zentriert bei 20%)
      return (pos / 20) * -50;
    } else if (pos >= 80) {
      // Am rechten Rand: Von -50% (voll zentriert bei 80%) bis -100% (rechtsbündig mit Pin bei 100%)
      return -50 - ((pos - 80) / 20) * 50;
    }
    // Dazwischen: Voll mittig zentriert
    return -50;
  }

  pinGuessLabel.style.transform = `translateX(${getBubbleShift(guessPos)}%)`;
  pinActualLabel.style.transform = `translateX(${getBubbleShift(actualPos)}%)`;

  // Streckenbalken zwischen Tipp und Wahrheit
  const leftPos = Math.min(guessPos, actualPos);
  const widthPos = Math.abs(guessPos - actualPos);
  comparisonDiffBar.style.left = `${leftPos}%`;
  comparisonDiffBar.style.width = `${Math.max(1, widthPos)}%`;
  comparisonDiffBar.className = 'comparison-diff-bar ' + (points > 0 ? 'diff-bar-valid' : 'diff-bar-invalid');

  // 3. Stats Grid
  statGuessVal.textContent = `${formatNumber(guess, q.step)} ${q.unit}`;
  statActualVal.textContent = q.actualDisplay ? q.actualDisplay : `${formatNumber(actual, q.step)} ${q.unit}`;
  statPointsVal.textContent = `+${points} Pkt (${isExact ? 'Volltreffer' : errorPercent.toFixed(1) + '%'})`;

  // 4. Erklärung
  feedbackExplanation.textContent = q.explanation || "Keine weitere Erklärung hinterlegt.";

  // 5. Button zur Quelle mit Name & Datum
  if (q.sourceUrl) {
    feedbackSourceLink.style.display = 'flex';
    feedbackSourceLink.href = q.sourceUrl;
    const dateStr = q.sourceDate ? ` (${q.sourceDate})` : '';
    feedbackSourceText.textContent = `📖 Zur Quelle: ${q.sourceName || 'Mehr Informationen'}${dateStr}`;
  } else {
    feedbackSourceLink.style.display = 'none';
  }

  // Button für nächste Frage anpassen
  if (currentIndex === roundQuestions.length - 1) {
    btnNextQuestion.innerHTML = `
      Ergebnis ansehen
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
    `;
  } else {
    btnNextQuestion.innerHTML = `
      Nächste Frage
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
    `;
  }

  showScreen('feedback');
}

/**
 * Nächste Frage oder Spielende
 */
function nextStep() {
  if (!screens.feedback.classList.contains('active')) return;
  currentIndex++;
  if (currentIndex < roundQuestions.length) {
    loadQuestion(currentIndex);
    showScreen('game');
  } else {
    renderEndScreen();
  }
}

/**
 * End-Screen anzeigen mit Auswertung aller 8 Fragen
 */
function renderEndScreen() {
  const maxPossible = roundQuestions.length * (BASE_MAX_POINTS + EXACT_BONUS_POINTS); // 8 * 150 = 1200
  finalScoreVal.textContent = totalScore;
  const maxScoreEl = document.querySelector('.final-score-max');
  if (maxScoreEl) {
    maxScoreEl.textContent = `/ ${maxPossible} Pkt`;
  }

  // Rang bestimmen (geschlechtsneutral & zeitgemäß)
  const percentOfMax = (totalScore / maxPossible) * 100;
  if (percentOfMax >= 80) {
    finalRank.textContent = "Fakten-Genie";
    triggerConfetti();
  } else if (percentOfMax >= 60) {
    finalRank.textContent = "Präzisions-Profi";
  } else if (percentOfMax >= 40) {
    finalRank.textContent = "Schätz-Talent";
  } else if (percentOfMax >= 20) {
    finalRank.textContent = "Zahlen-Talent";
  } else {
    finalRank.textContent = "Quiz-Fan";
  }

  // Erste Frage standardmäßig als aktiv setzen
  activeReviewIndex = 0;
  renderReviewTabs();
  renderActiveReviewCard();

  showScreen('end');
}

/**
 * Erzeugt die Tabs [1] [2] ... [8] oben in der Auswertung
 */
function renderReviewTabs() {
  if (!reviewTabs) return;
  reviewTabs.innerHTML = '';

  roundHistory.forEach((item, idx) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'review-tab-btn';

    if (item.isExact) {
      tabBtn.classList.add('exact');
    } else if (item.points > 0) {
      tabBtn.classList.add('good');
    } else {
      tabBtn.classList.add('zero');
    }

    if (idx === activeReviewIndex) {
      tabBtn.classList.add('active');
    }

    tabBtn.textContent = (idx + 1).toString();
    tabBtn.setAttribute('aria-label', `Frage ${idx + 1}`);
    tabBtn.onclick = () => selectReview(idx);

    reviewTabs.appendChild(tabBtn);
  });
}

/**
 * Wählt eine Frage für die Detailkarte aus
 */
function selectReview(idx) {
  if (idx < 0 || idx >= roundHistory.length) return;
  activeReviewIndex = idx;
  renderReviewTabs();
  renderActiveReviewCard();
}

/**
 * Blättert eine Frage vor oder zurück
 */
function navigateReview(direction) {
  const newIndex = activeReviewIndex + direction;
  if (newIndex >= 0 && newIndex < roundHistory.length) {
    selectReview(newIndex);
  }
}

/**
 * Rendert die eine aktive Detail-Karte
 */
function renderActiveReviewCard() {
  if (!reviewActiveCard || roundHistory.length === 0) return;

  const item = roundHistory[activeReviewIndex];
  if (!item) return;

  let badgeClass = 'zero';
  let badgeText = `${item.errorPercent.toFixed(1)}% Abweichung`;
  if (item.isExact) {
    badgeClass = 'exact';
    badgeText = '🎯 Volltreffer!';
  } else if (item.points > 0) {
    badgeClass = 'good';
    badgeText = `👍 ${item.errorPercent.toFixed(1)}% Abweichung`;
  } else {
    badgeText = `❌ ${item.errorPercent.toFixed(1)}% Abweichung`;
  }

  const actualText = item.actualDisplay || `${formatNumber(item.actual, item.step)} ${item.unit}`;
  const dateStr = item.sourceDate ? ` (${item.sourceDate})` : '';

  reviewActiveCard.innerHTML = `
    <div class="review-card-header">
      <div class="review-card-qnum">Frage ${activeReviewIndex + 1} von ${roundHistory.length}</div>
      <div class="review-card-badge ${badgeClass}">${badgeText} (+${item.points} Pkt)</div>
    </div>

    <h3 class="review-card-question">${item.question}</h3>

    <div class="review-card-answers">
      <div class="review-answer-box guess-box">
        <div class="review-ans-label">Dein Tipp</div>
        <div class="review-ans-value">${formatNumber(item.guess, item.step)} ${item.unit}</div>
      </div>
      <div class="review-answer-box actual-box">
        <div class="review-ans-label">Richtige Antwort</div>
        <div class="review-ans-value">${actualText}</div>
      </div>
    </div>

    <div class="review-card-explanation">
      <div class="review-expl-title">
        <strong>Erklärung & Hintergrund</strong>
      </div>
      <div class="review-expl-body">${item.explanation || 'Keine weitere Erklärung vorhanden.'}</div>
    </div>

    ${item.sourceUrl ? `
      <div class="review-card-source">
        <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn-review-source">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          <span>📖 Zur Quelle: ${item.sourceName || 'Mehr Informationen'}${dateStr}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      </div>
    ` : ''}
  `;

  // Navigation Toolbar aktualisieren
  if (reviewNavCounter) {
    reviewNavCounter.textContent = `Frage ${activeReviewIndex + 1} von ${roundHistory.length}`;
  }
  if (btnPrevReview) {
    btnPrevReview.disabled = activeReviewIndex === 0;
  }
  if (btnNextReview) {
    btnNextReview.disabled = activeReviewIndex === roundHistory.length - 1;
  }
}

/**
 * Führt den Benutzer vom End-Screen zurück zur Startseite
 */
function goToStartScreen() {
  showScreen('start');
}

window.selectReview = selectReview;
window.navigateReview = navigateReview;
window.goToStartScreen = goToStartScreen;

/**
 * Schlankes Canvas-Konfetti für Volltreffer & Spielende (ohne externe CDNs)
 */
function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#6366f1', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#ffffff'];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }

  let animationFrame;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let activeParticles = 0;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // Schwerkraft
      p.rotation += p.vRotation;
      p.opacity -= 0.012;

      if (p.opacity > 0) {
        activeParticles++;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (activeParticles > 0) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationFrame);
    }
  }

  animate();
}

// =====================================================================
// EVENT LISTENER
// =====================================================================

// Schieberegler Event
guessSlider.addEventListener('input', updateSliderDisplay);

// Stepper Buttons (+ / -)
btnStepMinus.addEventListener('click', () => stepSlider(-1));
btnStepPlus.addEventListener('click', () => stepSlider(1));

// Tastatursteuerung für PC (Pfeiltasten & Enter)
window.addEventListener('keydown', (e) => {
  if (screens.game.classList.contains('active')) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepSlider(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      stepSlider(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitGuess();
    }
  } else if (screens.feedback.classList.contains('active')) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      nextStep();
    }
  } else if (screens.end.classList.contains('active')) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateReview(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateReview(1);
    }
  }
});

// Button Aktionen
btnStartGame.addEventListener('click', startNewQuiz);
btnSubmitGuess.addEventListener('click', submitGuess);
btnNextQuestion.addEventListener('click', nextStep);
btnRestartGame.addEventListener('click', goToStartScreen);

// Farbmodus Buttons (Retro Arcade Farbflächen)
document.querySelectorAll('.color-swatch-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const chosenColor = btn.dataset.color;
    if (chosenColor) {
      setArcadeColor(chosenColor);
    }
  });
});

// Globale Handler für maximale Ausfallsicherheit (inline onclick)
window.startNewQuiz = startNewQuiz;
window.submitGuess = submitGuess;
window.nextStep = nextStep;

/**
 * Initialisiert das wischbare Regel-Karussell auf dem Handy mit Dots-Synchronisation
 */
function initRulesCarousel() {
  const rulesGrid = document.getElementById('rules-grid');
  const dots = document.querySelectorAll('.rule-dot');
  if (!rulesGrid || dots.length === 0) return;

  // Scroll-Event auf dem Grid zum Aktualisieren der aktiven Dots
  rulesGrid.addEventListener('scroll', () => {
    const scrollLeft = rulesGrid.scrollLeft;
    const cardWidth = rulesGrid.clientWidth;
    if (cardWidth === 0) return;
    const activeIndex = Math.min(dots.length - 1, Math.max(0, Math.round(scrollLeft / cardWidth)));

    dots.forEach((dot, idx) => {
      if (idx === activeIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }, { passive: true });

  // Klick auf Dots zum direkten Anspringen der jeweiligen Karte
  dots.forEach((dot) => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(dot.dataset.index, 10);
      const cardWidth = rulesGrid.clientWidth;
      rulesGrid.scrollTo({
        left: idx * cardWidth,
        behavior: 'smooth'
      });
    });
  });
}

// Initialer Theme- & Screen-Aufruf
initTheme();
initRulesCarousel();
showScreen('start');
