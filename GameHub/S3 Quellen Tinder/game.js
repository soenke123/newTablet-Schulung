// ===== STATE =====
let state = {
  queue: [],
  current: 0,
  score: 0,
  results: [],
  total: 10
};

const SOURCE_LABELS = {
  "wikipedia":  "Wikipedia",
  "whatsapp":   "WhatsApp",
  "youtube":    "YouTube",
  "instagram":  "Instagram",
  "tiktok":     "TikTok",
  "news":       "Nachrichtenartikel",
  "news-fake":  "Nachrichtenwebseite",
  "book":       "Buch",
  "google-ai":  "Google KI"
};

// ===== INIT =====
function init() {
  document.getElementById('total-articles').textContent = ARTICLES.length;
  showScreen('start');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// ===== GAME START =====
function startGame() {
  const shuffled = [...ARTICLES].sort(() => Math.random() - 0.5);
  state.queue    = shuffled.slice(0, state.total);
  state.current  = 0;
  state.score    = 0;
  state.results  = [];
  updateProgress();
  showScreen('game');
  renderCard(state.queue[0]);
}

// ===== PROGRESS =====
function updateProgress() {
  const pct = (state.current / state.total) * 100;
  document.querySelector('.progress-bar-fill').style.width = pct + '%';
  document.querySelector('.progress-label').textContent =
    state.current + ' / ' + state.total;
}

// ===== RENDER CARD =====
function renderCard(article) {
  const area = document.getElementById('card-container');
  area.innerHTML = buildCardHTML(article);
}

function buildCardHTML(a) {
  const label = SOURCE_LABELS[a.type] || a.type;
  let html = `<div class="article-card card-${a.type}">`;

  // Google AI has special header
  if (a.type === 'google-ai') {
    html += `<div class="card-body">
      <div class="google-logo">
        <span class="g-blue">G</span><span class="g-red">o</span><span class="g-yellow">o</span><span class="g-blue">g</span><span class="g-green">l</span><span class="g-red">e</span>
      </div>
      <span class="google-ai-tag">✨ KI-Übersicht</span>
      <div class="source-badge">${label}</div>
      <h2>${a.title}</h2>
      <div class="card-meta">${a.author} · ${a.date}</div>
      <div class="card-content">${formatContent(a.content)}</div>
    </div>`;
    html += `</div>`;
    return html;
  }

  // WhatsApp has bubble layout
  if (a.type === 'whatsapp') {
    html += `<div class="card-body">
      <span class="source-badge">${label}</span>
      <h2>${a.title}</h2>
      <div class="card-meta">${a.subtitle}</div>
      <div class="whatsapp-bubble">
        ${formatContent(a.content)}
        <div class="whatsapp-time">${a.date} ✓✓</div>
      </div>
    </div>`;
    html += `</div>`;
    return html;
  }

  // Image (if any)
  if (a.image) {
    html += `<img src="${a.image}" alt="${a.title}" loading="lazy">`;
    if (a.imageCaption) {
      html += `<div class="img-caption">${a.imageCaption}</div>`;
    }
  }

  // TikTok
  if (a.type === 'tiktok') {
    html += `<div class="card-body">
      <span class="source-badge">${label}</span>
      <h2>${a.title}</h2>
      <div class="card-meta">${a.author} · ${a.date}</div>
      <div class="card-content">${formatContent(a.content)}</div>
      <div class="tiktok-actions">
        <span>❤️ 45.2K</span>
        <span>💬 1.8K</span>
        <span>↪️ Teilen</span>
      </div>
    </div>`;
    html += `</div>`;
    return html;
  }

  // YouTube
  if (a.type === 'youtube') {
    html += `<div class="card-body">
      <span class="source-badge">${label}</span>
      <h2>${a.title}</h2>
      <div class="card-meta">${a.author} · ${a.date}</div>
      <div class="yt-stats"><span>👁 ${a.subtitle.split('•')[1]?.trim() || ''}</span></div>
      <div class="card-content" style="margin-top:10px">${formatContent(a.content)}</div>
    </div>`;
    html += `</div>`;
    return html;
  }

  // Instagram
  if (a.type === 'instagram') {
    html += `<div class="card-body">
      <span class="source-badge">${label}</span>
      <h2>${a.title}</h2>
      <div class="card-meta">${a.subtitle}</div>
      <div class="card-content">${formatContent(a.content)}</div>
      <div class="insta-actions">❤️ 🔖 ✈️</div>
      <div class="card-meta" style="margin-top:6px">${a.author} · ${a.date}</div>
    </div>`;
    html += `</div>`;
    return html;
  }

  // Default (news, wikipedia, book, news-fake)
  html += `<div class="card-body">
    <span class="source-badge">${label}</span>
    <h2>${a.title}</h2>
    <div class="card-meta">${a.author} · ${a.date}</div>
    <div class="card-content">${formatContent(a.content)}</div>
  </div>`;
  html += `</div>`;
  return html;
}

function formatContent(text) {
  return text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

// ===== RATING =====
function rate(choice) {
  const article = state.queue[state.current];
  const correct = choice === article.credibility;

  // Partial credit: suspicious counts as "almost right" if article is suspicious
  let points = 0;
  let resultLabel = '';

  if (choice === article.credibility) {
    points = 1;
    resultLabel = 'correct';
  } else {
    points = 0;
    resultLabel = 'incorrect';
  }

  state.score += points;
  state.results.push({ article, choice, correct });

  showFeedback(article, choice, resultLabel);
}

function showFeedback(article, choice, resultLabel) {
  const labels = {
    correct:    'Glaubwürdig',
    incorrect:  'Nicht glaubwürdig',
    suspicious: 'Fragwürdig'
  };
  const credLabels = {
    correct:    'Glaubwürdig',
    incorrect:  'Fehlerhaft',
    suspicious: 'Fragwürdig'
  };

  const wasRight = (choice === article.credibility);
  const icon  = wasRight ? '✅' : '❌';
  const title = wasRight ? 'Richtig!' : 'Falsch!';
  const cls   = wasRight ? 'correct' : 'incorrect';

  let explanation = '';
  if (!wasRight) {
    explanation = `Du hast <strong>${labels[choice]}</strong> gewählt, aber diese Quelle ist <strong>${credLabels[article.credibility]}</strong>.`;
    if (article.error) {
      explanation += `<br><br>🔍 <strong>Warum:</strong> ${article.error}`;
    }
  } else {
    explanation = `Diese Quelle ist tatsächlich <strong>${credLabels[article.credibility]}</strong>.`;
    if (article.credibility !== 'correct' && article.error) {
      explanation += `<br><br>🔍 <strong>Grund:</strong> ${article.error}`;
    }
  }

  const overlay = document.createElement('div');
  overlay.className = 'feedback-overlay';
  overlay.innerHTML = `
    <div class="feedback-card">
      <div class="feedback-result ${cls}">${icon} ${title}</div>
      <div class="feedback-explanation">${explanation}</div>
      <button class="btn-next" onclick="nextCard()">Weiter →</button>
    </div>`;
  document.body.appendChild(overlay);
}

// ===== NEXT CARD =====
function nextCard() {
  // Remove overlay
  const overlay = document.querySelector('.feedback-overlay');
  if (overlay) overlay.remove();

  state.current++;
  if (state.current >= state.total) {
    showResults();
    return;
  }

  updateProgress();
  renderCard(state.queue[state.current]);
}

// ===== RESULTS =====
function showResults() {
  showScreen('end');
  const pct = Math.round((state.score / state.total) * 100);
  document.getElementById('score-big').textContent = state.score + '/' + state.total;
  document.getElementById('score-pct').textContent = pct + '% richtig';

  let msg = '';
  if (pct >= 80) msg = '🏆 Ausgezeichnet! Du kannst Quellen sehr gut bewerten.';
  else if (pct >= 60) msg = '👍 Gut gemacht! Mit etwas Übung wirst du noch besser.';
  else msg = '📚 Weiter üben! Quellen kritisch zu prüfen ist eine wichtige Fähigkeit.';
  document.getElementById('score-msg').textContent = msg;

  // Breakdown
  const correct    = state.results.filter(r => r.article.credibility === 'correct');
  const incorrect  = state.results.filter(r => r.article.credibility === 'incorrect');
  const suspicious = state.results.filter(r => r.article.credibility === 'suspicious');
  const correctHit    = correct.filter(r => r.correct).length;
  const incorrectHit  = incorrect.filter(r => r.correct).length;
  const suspiciousHit = suspicious.filter(r => r.correct).length;

  document.getElementById('breakdown').innerHTML = `
    <div class="result-breakdown">
      <h3>Ergebnis nach Kategorie</h3>
      <div class="result-item">
        <div class="result-dot" style="background:var(--correct)"></div>
        Glaubwürdige Quellen: ${correctHit}/${correct.length} erkannt
      </div>
      <div class="result-item">
        <div class="result-dot" style="background:var(--incorrect)"></div>
        Fehlerhafte Quellen: ${incorrectHit}/${incorrect.length} erkannt
      </div>
      <div class="result-item">
        <div class="result-dot" style="background:var(--suspicious)"></div>
        Fragwürdige Quellen: ${suspiciousHit}/${suspicious.length} erkannt
      </div>
    </div>`;
}

// ===== OVERVIEW =====
let overviewFilter = 'all';

function showOverview() {
  showScreen('overview');
  overviewFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });
  renderOverview();
}

function setFilter(btn, filter) {
  overviewFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOverview();
}

function renderOverview() {
  const grid = document.getElementById('overview-grid');
  const filtered = overviewFilter === 'all'
    ? ARTICLES
    : ARTICLES.filter(a => a.credibility === overviewFilter);

  const counts = {
    all:        ARTICLES.length,
    correct:    ARTICLES.filter(a => a.credibility === 'correct').length,
    incorrect:  ARTICLES.filter(a => a.credibility === 'incorrect').length,
    suspicious: ARTICLES.filter(a => a.credibility === 'suspicious').length
  };
  document.getElementById('count-all').textContent        = counts.all;
  document.getElementById('count-correct').textContent    = counts.correct;
  document.getElementById('count-incorrect').textContent  = counts.incorrect;
  document.getElementById('count-suspicious').textContent = counts.suspicious;

  const credLabels = { correct: 'Glaubwürdig', incorrect: 'Fehlerhaft', suspicious: 'Fragwürdig' };

  grid.innerHTML = filtered.map(a => `
    <div class="overview-card cred-${a.credibility}">
      <div class="overview-type-tag">${SOURCE_LABELS[a.type] || a.type} · #${a.id}</div>
      <div class="overview-card-header">
        <h3>${a.title}</h3>
        <span class="cred-badge ${a.credibility}">${credLabels[a.credibility]}</span>
      </div>
      ${a.error
        ? `<div class="overview-error">⚠️ ${a.error}</div>`
        : `<div class="overview-error" style="color:#16a34a">✓ Keine Fehler</div>`
      }
    </div>
  `).join('');
}

function backFromOverview() {
  showScreen('start');
}

// ===== START =====
init();
