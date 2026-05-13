const THEMES = ['Memes', 'Gossip', 'Beauty', 'Film', 'Fitness', 'Sport', 'Technik', 'Lernen'];

const THEME_ICONS = {
  Memes:   '😂',
  Gossip:  '🗣️',
  Beauty:  '💄',
  Film:    '🎬',
  Fitness: '💪',
  Sport:   '⚽',
  Technik: '💻',
  Lernen:  '📚',
};

const INTEREST_LEVELS = [
  { level: 'Haupt', weight: 3, count: 1 },
  { level: 'Hoch',  weight: 2, count: 2 },
  { level: 'Gering',weight: 1, count: 5 },
];

function hasPerfectFlow() {
  return gameState.feedSlots.some(c => c?.effekt?.perfectFlow);
}

function calcFeedInterestStats() {
  let relevant = 0, total = 0;
  gameState.feedSlots.filter(Boolean).forEach(card => {
    const isUninteresting = card.effekt?.uninteresting === true;
    Object.entries(card.interestPoints).forEach(([theme, pts]) => {
      total += pts;
      if (!isUninteresting) {
        const entry = gameState.interests.find(i => i.theme === theme);
        if (entry && (entry.level === 'Haupt' || entry.level === 'Hoch')) relevant += pts;
      }
    });
  });
  return { relevant, total };
}

function calcFeedInterestRatio() {
  if (hasPerfectFlow()) return 0.35;
  const { relevant, total } = calcFeedInterestStats();
  return total === 0 ? 0 : relevant / total;
}

function dopaminTarget(ratio) {
  const pct = ratio * 100;
  if (pct < 20) return 0;
  if (pct <= 35) return 80 + (pct - 20) * (20 / 15);
  if (pct <= 50) return 100 - (pct - 35) * (20 / 15);
  if (pct <= 60) return 50;
  return 0;
}

function generateInterests() {
  const shuffled = [...THEMES].sort(() => Math.random() - 0.5);
  const interests = [];
  let i = 0;
  for (const { level, weight, count } of INTEREST_LEVELS) {
    for (let j = 0; j < count; j++) {
      interests.push({ theme: shuffled[i++], level, weight });
    }
  }
  gameState.interests = interests;
  return interests;
}
