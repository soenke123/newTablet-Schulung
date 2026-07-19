/* ═══════════════════════════════════════════════════════════════
   LERNWELT – creatures.js
   Gemeinsame Kreatur/Ei/Speicher-Logik für alle Spiele.
   Vor dem Laden dieser Datei kann window.CREATURE_IMAGE_BASE gesetzt werden.
   Standard: 'data/' (für root-level Seiten).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Season-Check-Helper ─────────────────────────────────────
   Nutzt die Backend-Session, wenn session.js geladen ist.
   In Einzel-Spielen (die session.js nicht laden) ist die Default-
   Semantik "Season 2 offen" — mirrort das alte _rel=true.
   ─────────────────────────────────────────────────────────── */
function _getCachedSeason() {
  // Einzel-Spiele laden session.js nicht — Fallback über localStorage-Cache,
  // den session.js beim Hub setzt (Key 'lernwelt_season').
  try {
    const v = parseInt(localStorage.getItem('lernwelt_season') || '0', 10);
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}
function _isS2Open() {
  if (typeof window.getUserSeason === 'function') return window.getUserSeason() >= 2;
  const cached = _getCachedSeason();
  return cached >= 2 || cached === 0; // 0 = kein Cache/Guest → Default S2-offen (Legacy)
}
function _isS3Open() {
  if (typeof window.getUserSeason === 'function') return window.getUserSeason() >= 3;
  return _getCachedSeason() >= 3;
}

/* ─── Level-Up-CSS (einmalig injiziert, funktioniert in allen Spielen) ─── */
(function injectLevelUpStyles() {
  if (document.getElementById('lw-levelup-styles')) return;
  const s = document.createElement('style');
  s.id = 'lw-levelup-styles';
  s.textContent = `
@keyframes creatureLevelUp {
  0%   { transform: scale(1);    filter: brightness(1); }
  20%  { transform: scale(1.4);  filter: brightness(2) drop-shadow(0 0 18px #d4a830); }
  60%  { transform: scale(0.93); filter: brightness(1.1); }
  100% { transform: scale(1);    filter: brightness(1); }
}
.creature-level-up { animation: creatureLevelUp 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards; }

@keyframes creatureLevelUpFinal {
  0%   { transform: scale(1)    rotate(0deg);  filter: brightness(1); }
  15%  { transform: scale(1.55) rotate(-6deg); filter: brightness(2.5) drop-shadow(0 0 36px #d4a830); }
  30%  { transform: scale(1.5)  rotate( 6deg); filter: brightness(2.3) drop-shadow(0 0 44px #fff8c0); }
  50%  { transform: scale(1.55) rotate(-4deg); filter: brightness(2.5) drop-shadow(0 0 36px #d4a830); }
  70%  { transform: scale(0.92) rotate( 2deg); filter: brightness(1.3); }
  85%  { transform: scale(1.1)  rotate(-1deg); filter: brightness(1.5) drop-shadow(0 0 16px #d4a830); }
  100% { transform: scale(1)    rotate(0deg);  filter: brightness(1); }
}
.creature-level-up--final { animation: creatureLevelUpFinal 1.3s cubic-bezier(0.34,1.56,0.64,1) forwards; }

@keyframes levelUpBanner {
  0%   { opacity:0; transform:translateX(-50%) scale(0.6); }
  18%  { opacity:1; transform:translateX(-50%) scale(1.12); }
  70%  { opacity:1; transform:translateX(-50%) scale(1); }
  100% { opacity:0; transform:translateX(-50%) translateY(-24px) scale(0.9); }
}
.levelup-banner {
  position:fixed; left:50%; top:42%; transform:translateX(-50%);
  pointer-events:none; z-index:9999;
  font-family:'Cinzel',serif; font-size:1.5rem; font-weight:700;
  color:#f5d76e; text-shadow:0 0 18px #d4a830, 0 2px 6px rgba(0,0,0,0.85);
  white-space:nowrap; animation:levelUpBanner 1.4s ease-out forwards;
}
.levelup-banner--final {
  font-size:2rem; color:#fff8c0;
  text-shadow:0 0 30px #d4a830, 0 0 60px #e8a020, 0 2px 8px rgba(0,0,0,0.9);
  animation-duration:2.2s;
}

@keyframes levelUpParticle {
  0%   { transform:translate(-50%,-50%) rotate(var(--angle)) translateX(0)            scale(1);   opacity:1; }
  80%  { transform:translate(-50%,-50%) rotate(var(--angle)) translateX(var(--dist))  scale(0.6); opacity:0.9; }
  100% { transform:translate(-50%,-50%) rotate(var(--angle)) translateX(var(--dist))  scale(0);   opacity:0; }
}
.levelup-particle {
  position:fixed; width:11px; height:11px; border-radius:50%;
  background:radial-gradient(circle, #fff8c0 0%, #d4a830 60%, transparent 100%);
  pointer-events:none; z-index:9999;
  animation:levelUpParticle 1s ease-out forwards;
}
.boost-bar {
  display:flex; gap:6px; justify-content:center; flex-wrap:wrap; margin:6px 0 2px;
}
.boost-badge {
  background:rgba(232,131,10,0.18); border:1px solid rgba(232,131,10,0.7);
  border-radius:20px; padding:3px 10px; font-size:0.9rem; cursor:default;
  animation:boostBadgePulse 2s ease-in-out infinite;
}
@keyframes boostBadgePulse {
  0%,100% { box-shadow:none; }
  50%     { box-shadow:0 0 8px rgba(232,131,10,0.55); }
}
.bonus-coin-badge {
  background:rgba(212,168,48,0.22); border:1px solid rgba(212,168,48,0.85);
  border-radius:20px; padding:3px 10px; font-size:0.9rem; cursor:default;
  color:#7a5a10; font-weight:800;
  display:inline-flex; align-items:center; gap:3px; line-height:1;
  animation:bonusCoinPulse 2s ease-in-out infinite;
}
.bonus-coin-badge__coin { font-weight:400; }
@keyframes bonusCoinPulse {
  0%,100% { box-shadow:none; }
  50%     { box-shadow:0 0 10px rgba(212,168,48,0.65); }
}

/* ── Epische Tiere – Glitzereffekt (Lila/Silber) ── */
@keyframes epicGlimmer {
  0%, 100% { opacity:0.15; }
  50%       { opacity:0.85; }
}
@keyframes epicGlimmer2 {
  0%, 100% { opacity:0.65; }
  50%       { opacity:0.1; }
}
.epic-frame {
  position:relative; width:100%; height:100%;
  display:flex; align-items:center; justify-content:center;
}
.epic-frame::before {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 82% 14%, rgba(192,132,252,0.55) 0%, transparent 7%),
    radial-gradient(circle at 18% 72%, rgba(226,232,240,0.45) 0%, transparent 6%),
    radial-gradient(circle at 65% 84%, rgba(167,139,250,0.4)  0%, transparent 6%),
    radial-gradient(circle at 28% 22%, rgba(226,232,240,0.35) 0%, transparent 5%);
  animation:epicGlimmer 2.6s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.epic-frame::after {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 52% 7%,  rgba(167,139,250,0.45) 0%, transparent 6%),
    radial-gradient(circle at 88% 58%, rgba(226,232,240,0.35) 0%, transparent 5%),
    radial-gradient(circle at 10% 44%, rgba(192,132,252,0.4)  0%, transparent 6%);
  animation:epicGlimmer2 2.6s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.epic-frame .creature-img { position:relative; z-index:1; }

/* ── Legendäre Tiere – Filigraner Goldglimmer ── */
@keyframes lgGlimmer1 {
  0%   { opacity:0.05; }
  25%  { opacity:1; }
  50%  { opacity:0.1; }
  75%  { opacity:0.9; }
  100% { opacity:0.05; }
}
@keyframes lgGlimmer2 {
  0%   { opacity:0.85; }
  25%  { opacity:0.05; }
  50%  { opacity:0.9; }
  75%  { opacity:0.05; }
  100% { opacity:0.85; }
}
.legendary-frame {
  position:relative; width:100%; height:100%;
  display:flex; align-items:center; justify-content:center;
}
.legendary-frame::before {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 90% 10%, rgba(255,255,255,0.9)  0%, transparent 3%),
    radial-gradient(circle at 10% 10%, rgba(255,255,255,0.85) 0%, transparent 3%),
    radial-gradient(circle at 50%  5%, rgba(255,215,0,0.9)    0%, transparent 4%),
    radial-gradient(circle at 90% 90%, rgba(255,255,255,0.85) 0%, transparent 3%),
    radial-gradient(circle at 10% 90%, rgba(255,215,0,0.85)   0%, transparent 3%),
    radial-gradient(circle at 75% 50%, rgba(255,255,255,0.65) 0%, transparent 2.5%),
    radial-gradient(circle at 25% 50%, rgba(255,215,0,0.65)   0%, transparent 2.5%),
    radial-gradient(circle at 50% 95%, rgba(255,255,255,0.8)  0%, transparent 3%);
  animation:lgGlimmer1 1.8s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.legendary-frame::after {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 50% 50%, rgba(255,215,0,0.06)   0%, transparent 55%),
    radial-gradient(circle at 30% 20%, rgba(255,215,0,0.8)    0%, transparent 3%),
    radial-gradient(circle at 70% 20%, rgba(255,255,255,0.75) 0%, transparent 3%),
    radial-gradient(circle at 20% 70%, rgba(255,215,0,0.75)   0%, transparent 3%),
    radial-gradient(circle at 80% 70%, rgba(255,255,255,0.8)  0%, transparent 3%),
    radial-gradient(circle at 50% 40%, rgba(255,215,0,0.6)    0%, transparent 3.5%),
    radial-gradient(circle at 60% 80%, rgba(255,255,255,0.65) 0%, transparent 2.5%);
  animation:lgGlimmer2 1.8s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.legendary-frame .creature-img { position:relative; z-index:1; }

/* ── Chinesischer Drache – Rot-Gold-Glimmer ── */
@keyframes chinGlimmer1 {
  0%   { opacity:0.08; }
  20%  { opacity:0.95; }
  50%  { opacity:0.12; }
  80%  { opacity:0.85; }
  100% { opacity:0.08; }
}
@keyframes chinGlimmer2 {
  0%   { opacity:0.9; }
  20%  { opacity:0.06; }
  55%  { opacity:0.88; }
  80%  { opacity:0.06; }
  100% { opacity:0.9; }
}
.chindrache-frame {
  position:relative; width:100%; height:100%;
  display:flex; align-items:center; justify-content:center;
}
.chindrache-frame::before {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 90% 10%, rgba(255,255,255,0.85) 0%, transparent 3%),
    radial-gradient(circle at 10% 10%, rgba(220,30,30,0.8)    0%, transparent 3%),
    radial-gradient(circle at 50%  5%, rgba(255,215,0,0.9)    0%, transparent 4%),
    radial-gradient(circle at 90% 90%, rgba(255,215,0,0.85)   0%, transparent 3%),
    radial-gradient(circle at 10% 90%, rgba(220,30,30,0.8)    0%, transparent 3%),
    radial-gradient(circle at 75% 50%, rgba(255,255,255,0.65) 0%, transparent 2.5%),
    radial-gradient(circle at 25% 50%, rgba(255,50,50,0.6)    0%, transparent 2.5%),
    radial-gradient(circle at 50% 95%, rgba(255,215,0,0.8)    0%, transparent 3%);
  animation:chinGlimmer1 2.0s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.chindrache-frame::after {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 50% 50%, rgba(220,30,30,0.05)   0%, transparent 55%),
    radial-gradient(circle at 30% 20%, rgba(255,215,0,0.8)    0%, transparent 3%),
    radial-gradient(circle at 70% 20%, rgba(220,30,30,0.75)   0%, transparent 3%),
    radial-gradient(circle at 20% 70%, rgba(255,215,0,0.75)   0%, transparent 3%),
    radial-gradient(circle at 80% 70%, rgba(255,255,255,0.8)  0%, transparent 3%),
    radial-gradient(circle at 50% 40%, rgba(220,30,30,0.6)    0%, transparent 3.5%),
    radial-gradient(circle at 60% 80%, rgba(255,215,0,0.65)   0%, transparent 2.5%);
  animation:chinGlimmer2 2.0s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.chindrache-frame .creature-img { position:relative; z-index:1; }

/* ── Pfau – Regenbogen-Schimmer ── */
@keyframes pfauGlimmer1 {
  0%, 100% { opacity:0.12; }
  50%       { opacity:0.82; }
}
@keyframes pfauGlimmer2 {
  0%, 100% { opacity:0.72; }
  50%       { opacity:0.08; }
}
.pfau-frame {
  position:relative; width:100%; height:100%;
  display:flex; align-items:center; justify-content:center;
}
.pfau-frame::before {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 85% 12%, rgba(150, 60,200,0.55) 0%, transparent 7%),
    radial-gradient(circle at 12% 78%, rgba( 40,130,200,0.50) 0%, transparent 6%),
    radial-gradient(circle at 58% 88%, rgba( 40,180,100,0.50) 0%, transparent 6%),
    radial-gradient(circle at 28% 18%, rgba(200,155, 40,0.50) 0%, transparent 5%),
    radial-gradient(circle at 72% 62%, rgba( 30,160,180,0.45) 0%, transparent 5%);
  animation:pfauGlimmer1 2.4s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.pfau-frame::after {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 48%  8%, rgba( 40,150,210,0.50) 0%, transparent 6%),
    radial-gradient(circle at 92% 55%, rgba(150, 50,190,0.45) 0%, transparent 5%),
    radial-gradient(circle at  8% 42%, rgba( 60,190, 90,0.45) 0%, transparent 6%),
    radial-gradient(circle at 52% 92%, rgba(200,120, 40,0.45) 0%, transparent 5%),
    radial-gradient(circle at 35% 55%, rgba(200, 50,130,0.35) 0%, transparent 4%);
  animation:pfauGlimmer2 2.4s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.pfau-frame .creature-img { position:relative; z-index:1; }

.result-play-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
  width: 100%;
}
.result-play-row > button,
.result-play-row > a { flex: 1; }
#resultItemBtnWrap { display: contents; }
.btn-use-item {
  flex-shrink: 0;
  background: transparent;
  border: 1.5px solid #f0b429;
  border-radius: var(--radius-md, 12px);
  padding: 0 16px;
  color: #f0b429;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background .2s;
  font-family: inherit;
  white-space: nowrap;
}
.btn-use-item:hover { background: rgba(240,180,41,0.15); }
@media (max-width: 480px) {
  .result-play-row { flex-direction: column; }
  .btn-use-item { flex-shrink: 1; }
}

/* ── Seltene Tiere (Season Rare) – Blauer Schimmer ── */
@keyframes rareGlimmer {
  0%, 100% { opacity:0.15; }
  50%       { opacity:0.80; }
}
@keyframes rareGlimmer2 {
  0%, 100% { opacity:0.65; }
  50%       { opacity:0.10; }
}
.rare-frame {
  position:relative; width:100%; height:100%;
  display:flex; align-items:center; justify-content:center;
}
.rare-frame::before {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 82% 14%, rgba(59,130,246,0.55)  0%, transparent 7%),
    radial-gradient(circle at 18% 72%, rgba(147,197,253,0.45) 0%, transparent 6%),
    radial-gradient(circle at 65% 84%, rgba(29,78,216,0.40)   0%, transparent 6%),
    radial-gradient(circle at 28% 22%, rgba(147,197,253,0.35) 0%, transparent 5%);
  animation:rareGlimmer 2.8s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.rare-frame::after {
  content:'';
  position:absolute; inset:0;
  background:
    radial-gradient(circle at 52%  7%, rgba(29,78,216,0.45)   0%, transparent 6%),
    radial-gradient(circle at 88% 58%, rgba(147,197,253,0.35) 0%, transparent 5%),
    radial-gradient(circle at 10% 44%, rgba(59,130,246,0.40)  0%, transparent 6%);
  animation:rareGlimmer2 2.8s ease-in-out infinite;
  pointer-events:none; z-index:2; border-radius:inherit;
}
.rare-frame .creature-img { position:relative; z-index:1; }

/* ── Münzbank (Ergebnis-Screen) ── */
.coin-bank {
  width: 100%; box-sizing: border-box;
  background: linear-gradient(160deg, rgba(212,168,48,0.12) 0%, rgba(240,180,41,0.04) 100%);
  border: 1.5px solid rgba(240,180,41,0.38);
  border-radius: 16px;
  padding: 14px 20px 16px;
  text-align: center;
  position: relative;
  overflow: hidden;
  margin-bottom: 12px;
}
.coin-bank::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(240,180,41,0.14) 0%, transparent 60%);
  pointer-events: none;
}
.coin-bank__label {
  font-size: 0.6rem;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(240,180,41,0.55);
  font-weight: 700;
  margin-bottom: 10px;
}
.coin-bank__amount {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 2.4rem;
  font-weight: 800;
  color: #f0b429;
  line-height: 1;
  text-shadow: 0 0 18px rgba(240,180,41,0.35);
}
.coin-bank__coin-icon {
  font-size: 1.9rem;
  filter: drop-shadow(0 0 8px rgba(240,180,41,0.5));
}
.coin-bank__earned {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 9px;
  background: rgba(74,222,128,0.12);
  border: 1px solid rgba(74,222,128,0.28);
  border-radius: 20px;
  padding: 4px 13px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #4ade80;
  transition: opacity 0.5s ease, transform 0.5s ease;
}
@keyframes cbEarnedPulse {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.14); box-shadow: 0 0 14px rgba(74,222,128,0.45); }
  100% { transform: scale(1); }
}
.coin-bank__earned--pulse { animation: cbEarnedPulse 0.45s ease-out; }
.coin-bank__earned--fade  { opacity: 0; transform: translateY(-8px); }
@keyframes cbGlow {
  0%, 100% { border-color: rgba(240,180,41,0.38); }
  50%       { border-color: rgba(240,180,41,0.75); box-shadow: 0 0 22px rgba(240,180,41,0.22); }
}
.coin-bank--animating { animation: cbGlow 0.8s ease-in-out; }`;
  document.head.appendChild(s);
})();

/* ─── Wachstums-Konstanten ─── */
const GROWTH_THRESHOLDS = [0, 3, 7, 12, 21, 100]; // 0%, 30%, 70%, 120%, 210%, Vollendet
const GROWTH_STAGES     = 5;
const GROWTH_MAX        = 21;                      // ab hier → Coins statt Wachstum
const GROWTH_S6         = 100;                     // Stufe 6 – nach Stein der Vollendung

/* ─── Seltene Tiere (Season Rares) ─── */
const RARE_CREATURES = new Set(['biene', 'oktopus', 'ente', 'libelle']);
function isRare(creature) { return RARE_CREATURES.has(creature); }

/* Welches Season-Rare droppen kann bei welchem Spiel */
/* Season 1: Biene + Oktopus können in allen Season-1-Spielen droppen (50/50)
   Season 2: Ente droppt in allen Season-2-Spielen
   Season 3: Libelle — Einträge werden ergänzt, sobald S3-Spiele in GAMES_CONFIG registriert sind. */
const GAME_SEASON_RARE = {
  game1: ['biene','oktopus'], game3: ['biene','oktopus'], game7: ['biene','oktopus'], game8: ['biene','oktopus'],
  game5: ['biene','oktopus'], game9: ['biene','oktopus'], game10: ['biene','oktopus'], game11: ['biene','oktopus'],
  game6: ['ente'], game12: ['ente'], game15: ['ente'], game14: ['ente'],
};

/* ─── Epische Tiere ─── */
const EPIC_CREATURES = new Set(['snaildragon', 'butterfly', 'turtle', 'chamaeleon', 'hippogreif']);
function isEpic(creature) { return EPIC_CREATURES.has(creature); }

/* ─── Legendäre Tiere (neue Klasse, noch nicht durch normalen Weg erhältlich) ─── */
const LEGENDARY_CREATURES = new Set(['robot', 'pfau', 'chinDrache', 'schnabeltier', 'einhornkatze']);
function isLegendary(creature) { return LEGENDARY_CREATURES.has(creature); }
function isPfau(creature) { return creature === 'pfau'; }

/* ─── Tier-Bestimmung (Eingabe: 0–10 normalisierter Score) ─── */
function determineCreature(correct, isFirst = false, gameId = null) {
  // Epische Tiere – immer möglich, Score-abhängig
  if (correct >= 9 && Math.random() < 0.05) return 'turtle';
  if (correct <= 2 && Math.random() < 0.05) return 'butterfly';
  if (correct >= 4 && correct <= 6 && _isS2Open() && Math.random() < 0.05) return 'chamaeleon';

  // Schneckendrache – selten, unabhängig vom Rang
  const epicChance = (correct <= 2 || correct === 10) ? 5 : 2;
  if (Math.random() * 100 < epicChance) return 'snaildragon';

  // Hippogreif (Epic S3) – wie Schneckendrache, in JEDEM Spiel möglich (kein gameId-Check),
  // sobald der User Season 3 hat.
  if (_isS3Open()) {
    const hippoChance = (correct <= 2 || correct === 10) ? 5 : 2;
    if (Math.random() * 100 < hippoChance) return 'hippogreif';
  }

  // Season Rare – 8 % Chance wenn das Spiel einer Season angehört
  const seasonRares = gameId && GAME_SEASON_RARE[gameId];
  if (seasonRares && Math.random() < 0.08) {
    return seasonRares[Math.floor(Math.random() * seasonRares.length)];
  }

  // Season 3 – neue Normale (Krabbe/Hai) – Score-Split ≤5 / >5.
  // Bei S3-Spielen 50 %, bei S1/S2-Spielen 1/3 (gleichmäßige Drei-Teilung mit S1/S2).
  if (_isS3Open()) {
    const isS3Game = typeof window !== 'undefined'
      && window.GAMES_CONFIG?.find?.(g => g.id === gameId)?.season === 3;
    const s3NormalChance = isS3Game ? 0.5 : (1/3);
    if (correct <= 5 && Math.random() < s3NormalChance) return 'krabbe';
    if (correct >  5 && Math.random() < s3NormalChance) return 'hai';
  }

  // Season 2 – neue Normale teilen Plätze mit alten (50/50)
  if (_isS2Open()) {
    if (correct <= 3                    && Math.random() < 0.5) return 'frosch';
    if (correct >= 4 && correct <= 6   && Math.random() < 0.5) return 'pinguin';
    if (correct >= 7 && correct <= 9   && Math.random() < 0.5) return 'raptor';
  }

  if (correct === 10) return 'dragon';
  if (correct === 9)  return 'triceratops';
  if (correct === 8)  return 'falkeneule';
  if (correct === 7)  return 'salamander';
  if (correct >= 5)   return 'chicken';
  if (correct >= 3)   return 'fish';
  return 'snail';
}

function determineEpicCreature() {
  const s2 = _isS2Open();
  const s3 = _isS3Open();
  const r = Math.random();
  if (s3) {
    if (r < 0.20) return 'butterfly';
    if (r < 0.40) return 'snaildragon';
    if (r < 0.60) return 'turtle';
    if (r < 0.80) return 'chamaeleon';
    return 'hippogreif';
  }
  if (s2) {
    if (r < 0.30) return 'butterfly';
    if (r < 0.60) return 'snaildragon';
    if (r < 0.80) return 'turtle';
    return 'chamaeleon';
  }
  if (r < 0.4) return 'butterfly';
  if (r < 0.8) return 'snaildragon';
  return 'turtle';
}

/* Glücksklee: Epic-Chance = (20 + correct×3) %, Rare-Chance erhöht auf 15 % */
function determineCreatureWithGlucksklee(correct, gameId = null) {
  const chance = (20 + correct * 3) / 100;
  if (Math.random() < chance) return determineEpicCreature();
  // Season Rare mit erhöhter Chance; gameId=null verhindert Doppel-Check in determineCreature
  const seasonRares = gameId && GAME_SEASON_RARE[gameId];
  if (seasonRares && Math.random() < 0.15) {
    return seasonRares[Math.floor(Math.random() * seasonRares.length)];
  }
  return determineCreature(correct, false, null);
}

/* Lockmittel: 90 % Chance auf ein Season-3-Monster.
   Verteilung innerhalb der 90 %: 10 % Libelle (Rare), 5 % Hippogreif (Epic),
   Rest Krabbe (Score ≤5) / Hai (Score >5).
   Bei den restlichen 10 % fällt der Roll auf das normale determineCreature zurück. */
function determineCreatureWithLockmittel(correct, gameId = null) {
  if (Math.random() < 0.90) {
    const r = Math.random();
    if (r < 0.10) return 'libelle';
    if (r < 0.15) return 'hippogreif';
    return (correct <= 5) ? 'krabbe' : 'hai';
  }
  return determineCreature(correct, false, gameId);
}

function determineEggCreature(eggType, correct) {
  if (eggType === 'atari')   return 'robot';
  if (eggType === 'pfau')    return 'pfau';
  if (eggType === 'himmel')  return 'chinDrache';
  if (eggType === 'suempfe') return 'schnabeltier';
  if (eggType === 's2') {
    const r = Math.random() * 100;
    if (r < 5)  return 'chamaeleon';
    if (r < 15) return 'ente';
    return ['frosch', 'pinguin', 'raptor'][Math.floor(Math.random() * 3)];
  }
  const legendaryChance = { rare: 0.3, mythic: 0.6, legendary: 1.0 }[eggType] ?? 0;
  if (Math.random() < legendaryChance) return determineEpicCreature();
  const normals = ['snail', 'fish', 'chicken', 'salamander', 'falkeneule', 'triceratops', 'dragon'];
  if (_isS2Open()) {
    normals.push('frosch', 'pinguin', 'raptor');
  }
  return normals[Math.floor(Math.random() * normals.length)];
}

function getGrowthStage(totalGrowth) {
  for (let i = GROWTH_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalGrowth >= GROWTH_THRESHOLDS[i]) return i;
  }
  return 0;
}

/* ─── Kreatur-Daten ─── */
const CREATURE_NAMES = {
  snail:'Schnecke', fish:'Fisch', chicken:'Huhn',
  salamander:'Salamander', falkeneule:'Falkeneule',
  triceratops:'Triceratops', dragon:'Drache',
  snaildragon:'Schneckendrache', butterfly:'Schmetterling', turtle:'Schildkröte',
  robot:'Atari-1337',
  pfau: 'Pfau',
  biene:'Biene', oktopus:'Oktopus', ente:'Ente',
  chamaeleon:'Chamäleon',
  pinguin:'Pinguin', frosch:'Frosch', raptor:'Raptor',
  chinDrache:'Chinesischer Drache', schnabeltier:'Schnabeltier',
  krabbe:'Krabbe', hai:'Hai', libelle:'Libelle', hippogreif:'Hippogreif', einhornkatze:'Einhornkatze',
};

const GROWTH_LABELS = ['Winzig', 'Klein', 'Mittel', 'Groß', 'Ausgewachsen', 'Vollendet'];

const CREATURE_DESCRIPTIONS = {
  snail: [
    'Eine tapfere kleine Schnecke schlüpft aus dem Ei!',
    'Deine Schnecke wächst – das Gehäuse wird sichtbar.',
    'Das Gehäuse glänzt – deine Schnecke wird kräftiger!',
    'Eine beeindruckende Schnecke mit leuchtendem Gehäuse.',
    'Eine majestätische ausgewachsene Schnecke. Langsam aber weise!',
    'Die Schnecke hat die Fesseln der Zeit gesprengt. Kein Weg ist ihr zu weit, kein Gipfel zu hoch. Vollendet.'
  ],
  fish: [
    'Ein kleiner Fisch springt ins Abenteuer!',
    'Dein Fisch wird bunter und wendiger.',
    'Dein Fisch wird kräftiger und bunter.',
    'Ein starker Fisch – schnell und furchtlos.',
    'Ein prächtiger Kampffisch – unaufhaltsam!',
    'Er durchbricht die Oberfläche aller Welten. Kein Ozean fasst ihn mehr. Ein Fisch, der zur Legende wurde.'
  ],
  chicken: [
    'Ein flauschiges Küken piept sich frei!',
    'Dein Küken bekommt erste Federn.',
    'Dein Küken entwickelt sich zum Huhn.',
    'Ein stattliches Huhn mit prächtigem Kamm.',
    'Ein stolzer Hahn – laut, bunt und mutig!',
    'Aus dem Küken wurde ein Phönix. Sein Krähen hallt durch alle Lernwelten – niemand zweifelt mehr.'
  ],
  salamander: [
    'Ein buntes Kriechtier lugt neugierig aus der Schale!',
    'Dein kleines Kriechtier streckt die Beinchen.',
    'Dein Kriechtier wächst – kräftig und auffällig gemustert. Was wird daraus?',
    'Ein mächtiges Tier – flink, gefürchtet und unverkennbar: ein Salamander!',
    'Ein legendärer Riesensalamander – nichts bleibt ihm verborgen!',
    'Er wandelt durch Feuer und Eis ohne zu zucken. Ein Salamander jenseits aller Grenzen – vollendet, ewig, unzerstörbar.'
  ],
  falkeneule: [
    'Ein Greifvogel-Küken späht neugierig aus der Schale!',
    'Dein junger Greifvogel übt das lautlose Flattern.',
    'Dein Greifvogel streckt mächtige Schwingen aus – etwas Besonderes zeichnet sich ab.',
    'Dein Greifvogel gleitet lautlos durch die Nacht – eine Falkeneule!',
    'Eine majestätische Falkeneule – scharfe Augen, lautloser Flug!',
    'Ihre Augen sehen durch Raum und Zeit. Kein Geheimnis bleibt verborgen. Die Falkeneule ist vollendet.'
  ],
  triceratops: [
    'Ein winziger Dino wackelt auf die Welt!',
    'Dein Dino zeigt erste kleine Auswüchse auf der Stirn.',
    'Dein Dino wächst – am Kopf bildet sich etwas Mächtiges.',
    'Ein gewaltiger Triceratops – niemand stellt sich ihm entgegen.',
    'Ein urgewaltiger Triceratops – nichts hält ihn auf!',
    'Die Erde bebt bei jedem Schritt. Berge weichen zur Seite. Der Triceratops hat seine letzte Form gefunden – und sie erschüttert die Welt.'
  ],
  dragon: [
    'Ein legendärer Drache schlüpft – unglaublich!',
    'Dein Drache speit erste Fünkchen.',
    'Dein Drache entfaltet seine Flügel und speit erste Flammen.',
    'Dein Drache wächst zu einer mächtigen Kreatur heran.',
    'Ein LEGENDÄRER Drache in voller Pracht – du bist perfekt!',
    'Jenseits von Legende. Jenseits von Feuer. Dieser Drache ist das Feuer selbst – vollendetes Urwesen der Lernwelt.'
  ],
  snaildragon: [
    'Etwas unglaublich Seltenes schlüpft – was ist das?!',
    'Das Wesen rollt sich heraus… schwer zu sagen, was das ist.',
    'Ein Gehäuse… und sind das Flügel? Dieses Wesen ist ein Rätsel.',
    'Könnte das… ein gepanzerter Feuerspucker sein? Unvorstellbar…',
    'Ein LEGENDÄRER Schneckendrache – das Wunder aller Lernwelten!',
    'Das Unmöglichste aller Unmöglichen hat sich vollendet. Halb Schnecke, halb Drache, ganz Legende. Die Welt hat kein Wort dafür.'
  ],
  butterfly: [
    'Eine winzige Raupe schlüpft aus dem Ei – welches Wunder wartet darin?',
    'Die Raupe spinnt sich in einen leuchtenden Kokon ein.',
    'Der Kokon pulsiert und glitzert – bald enthüllt er sein Geheimnis!',
    'Ein legendärer Schmetterling entfaltet schimmernde Schwingen!',
    'Ein LEGENDÄRER Schmetterling in voller Pracht – ein Wunder der Lernwelt!',
    'Seine Schwingen weben Träume in die Wirklichkeit. Jeder Flügelschlag erschafft eine neue Welt. Vollendet.'
  ],
  turtle: [
    'Eine winzige Schildkröte schlüpft – ihr Panzer glitzert geheimnisvoll!',
    'Deine Schildkröte streckt neugierig den Kopf heraus.',
    'Ihr Panzer beginnt zu leuchten – sie ist keine gewöhnliche Schildkröte!',
    'Eine mächtige Urzeit-Schildkröte – weise und nahezu unbesiegbar.',
    'Eine LEGENDÄRE Riesen-Schildkröte – sie trägt die Welt auf ihrem Rücken!',
    'Sie trägt nicht mehr die Welt – sie ist die Welt. Unendliche Weisheit, endloser Panzer. Die Schildkröte ist vollendet.'
  ],
  robot: [
    'Ein verbotenes Signal erwacht. Niemand sollte das sehen…',
    'Rote Augen leuchten in der Dunkelheit. Systeme initialisieren.',
    'Atari-1337 lernt. Schnell. Zu schnell. Das gesamte Netz zittert.',
    'WARNUNG: Unkontrolliertes System erkannt. Alle Firewalls gefallen.',
    'Atari-1337 in voller Entfaltung – eine KI ohne Grenzen, ohne Gesetze. Du hast das Unmögliche getan!',
    'SYSTEM VOLLENDET. Atari-1337 hat sich selbst überschrieben. Es gibt keine Regeln mehr. Nur noch das Wissen – und du.'
  ],
  pfau: [
    'Ein schillerndes Ei leuchtet in allen Farben – etwas Unglaubliches schlüpft!',
    'Ein winziger Pfau reckt stolz seinen Kopf – die erste Feder schimmert wie ein Regenbogen.',
    'Das Gefieder öffnet sich langsam – hundert Farben explodieren wie lebendiges Licht.',
    'Ein prächtiger Pfau schreitet durch deine Welt, sein Rad in voller Pracht entfaltet.',
    'Ein LEGENDÄRER Pfau – die Krönung aller Lernwelten. Unsterblich, unvergleichlich, einzigartig!',
    'Seine Farben erschaffen Realität. Wer sein Rad erblickt, vergisst die Zeit. Der Pfau ist vollendet – und die Lernwelt verneigt sich.'
  ],
  biene: [
    'Eine winzige Biene summt sich aus der Schale – das Seltene erwacht!',
    'Deine Biene streckt die zarten Flügel – erster Honig liegt in der Luft.',
    'Die Biene wird kräftiger, ihr Pelz glänzt golden im Licht.',
    'Eine fleißige Meisterbiene – unermüdlich, präzise, kaum zu stoppen.',
    'Eine SELTENE Königsbiene – Herrscherin ihres Volkes und der Lernwelt!',
    'Ihr Summen trägt Welten. Ihr Honig ist reines Gold. Die vollendete Biene – ewige Herrscherin, unsterbliche Seele des Schwarms.'
  ],
  oktopus: [
    'Acht kleine Tentakel tasten sich aus dem Ei – das Seltene schlüpft!',
    'Dein Oktopus wechselt schon die Farbe – neugierig erkundet er die Welt.',
    'Die Tentakel werden kräftiger, der Blick klüger. Dieser Oktopus ist kein gewöhnlicher.',
    'Ein mächtiger Tiefsee-Oktopus – weise, anpassungsfähig, ungreifbar.',
    'Ein SELTENER Riesen-Oktopus – sein Verstand ist grenzenlos, seine Arme endlos!',
    'Acht Arme, acht Welten. Er kennt jedes Geheimnis der Tiefen – und einige darüber hinaus. Der vollendete Oktopus ist allwissend.'
  ],
  ente: [
    'Ein watschelndes Küken quakt sich frei – das Seltene ist da!',
    'Deine Ente planscht vergnügt – die ersten Federn glitzern blau.',
    'Die Ente wächst – ihr Gefieder leuchtet in sattem Blau und Smaragdgrün.',
    'Eine stolze Ente streift übers Wasser – unbeeindruckt von allem.',
    'Eine SELTENE Prachtente – majestätisch, unverwechselbar, absolut unbeeindruckt!',
    'Weder Sturm noch Legende kann sie beeindrucken. Die vollendete Ente watschelt durch die Ewigkeit – souverän, erhaben, komplett gleichgültig.'
  ],
  chamaeleon: [
    'Etwas Schillerndes regt sich in der Schale – kaum zu erkennen.',
    'Eine zarte Gestalt taucht auf, die Farbe wechselnd wie ein Traum.',
    'Es passt sich an, es gleitet durch jede Umgebung – kaum zu fassen.',
    'Ein meisterhaftes Chamäleon – Tarnung auf höchstem Niveau.',
    'Ein EPISCHES Chamäleon – Meister der Täuschung und des Wandels!',
    'Es ist alles und nichts. Jede Farbe, jede Form. Das vollendete Chamäleon existiert jenseits der Wahrnehmung – niemand weiß, ob es wirklich da ist.'
  ],
  pinguin: [
    'Ein watschelndes Wesen bricht aus der Schale – kalt, aber herzlich.',
    'Dein Pinguin tappt neugierig aufs Eis – erster Ausflug.',
    'Dein Pinguin taucht flink durch eisige Gewässer, das Gefieder glänzt.',
    'Ein stattlicher Pinguin – selbstsicher, stylisch, unbeeindruckt von der Kälte.',
    'Ein prächtiger Kaiserpinguin – imposant, makellos, König des Eises!',
    'Er herrscht über Eis und Feuer, über Norden und Süden. Der vollendete Pinguin watschelt durch alle Extreme – unerschütterlich, majestätisch, für immer.'
  ],
  frosch: [
    'Eine winzige Kaulquappe zappelt sich frei!',
    'Dein Tier bekommt erste Beinchen – Verwandlung im Gange.',
    'Halb Quappe, halb Frosch – ein Wesen im Wandel.',
    'Ein kräftiger Frosch – flink, treffsicher, kaum zu fangen.',
    'Ein prächtiger Riesenfrosch – laut, grün, unaufhaltsam!',
    'Sein Quaken erschüttert Berge. Sein Sprung überbrückt Welten. Der vollendete Frosch – Meister der Verwandlung, König des Augenblicks.'
  ],
  raptor: [
    'Ein scharfkralliges Wesen pickt sich frei aus der Schale!',
    'Kleine Flügel, große Augen – dieser Dino ist aufgeweckt.',
    'Dein Raptor läuft schnell, sehr schnell – er lernt zu jagen.',
    'Ein gefährlicher Raptor – schlau, wendig, kaum aufzuhalten.',
    'Ein MÄCHTIGER Velociraptor – intelligent, blitzschnell, unaufhaltsam!',
    'Schneller als der Blitz, klüger als alle anderen. Der vollendete Raptor ist die Spitze der Evolution – und er weiß es.'
  ],
  chinDrache: [
    'In den Tiefen der alten Welten... regt sich etwas Gewaltiges.',
    'Legenden flüstern von einem Wesen mit schimmernden Schuppen und Himmelsfeuer.',
    'Seine Schuppen leuchten wie tausend Laternen – ein Drachenwesen aus Fernost.',
    'Ein majestätisches Wesen aus uralten Sagen – weise, furchterregend, ewig.',
    'Ein LEGENDÄRER Chinesischer Drache – Hüter des Himmels und aller Lernwelten!',
    'Er ist älter als die Sterne, weiser als die Zeit. Der vollendete Himmelsdrache regiert über Vergangenheit und Zukunft – in einem einzigen Atemzug.'
  ],
  schnabeltier: [
    'Etwas Unbekanntes schlüpft aus dem Ei... pelzig, gewässerbewohnend... und ein Schnabel?',
    'Pelzig. Platschend. Ein Schnabel. Was zur Welt ist das?',
    'Das Tier schwimmt, buddelt, und… ist das ein Giftstachel? Ein Rätsel der Natur.',
    'Das vollständige Wesen enthüllt sich – Schnabel, Fell, Giftstachel. Unmöglich.',
    'Ein LEGENDÄRES Schnabeltier – das Unmögliche hat Form angenommen!',
    'Das Unmögliche war erst der Anfang. Das vollendete Schnabeltier hat die Naturgesetze selbst überlistet – und fragt sich noch immer, was es eigentlich ist.'
  ],
  krabbe: [
    'Eine winzige Krabbe krabbelt seitwärts aus der Schale!',
    'Deine Krabbe wächst – die ersten Scheren klackern zaghaft.',
    'Deine Krabbe wird kräftiger – der Panzer schimmert im Licht.',
    'Eine stolze Krabbe – flink im Sand, unbeugsam an der Küste.',
    'Eine mächtige Panzerkrabbe – niemand kommt an ihren Scheren vorbei!',
    'Sie hat die Gezeiten überdauert und die Küsten aller Welten erobert. Die vollendete Krabbe – unaufhaltsam, seitwärts, für immer.'
  ],
  hai: [
    'Ein kleiner Hai schießt aus dem Ei ins offene Wasser!',
    'Dein Hai wächst – die ersten Zähne blitzen scharf.',
    'Dein Hai wird stärker – ein geübter Jäger der Tiefen.',
    'Ein gefährlicher Hai – lautlos, schnell, unaufhaltsam.',
    'Ein prächtiger Weißer Hai – Herrscher der Ozeane!',
    'Sein Schatten gleitet durch alle Meere. Kein Wesen bleibt ihm verborgen. Der vollendete Hai – Legende der Tiefe.'
  ],
  libelle: [
    'Eine winzige Libelle schwirrt aus der Schale – das Seltene erwacht!',
    'Deine Libelle streckt schimmernde Flügel – erste Flugversuche.',
    'Die Libelle wird kräftiger – ihre Flügel glitzern wie flüssiger Kristall.',
    'Eine prächtige Libelle – wendig, blitzschnell, kaum zu fangen.',
    'Eine SELTENE Kristall-Libelle – ein fliegendes Juwel der Lüfte!',
    'Ihre Flügel weben Regenbögen in die Luft. Sie ist überall und nirgends. Die vollendete Libelle – Kristall der Ewigkeit.'
  ],
  hippogreif: [
    'Ein flauschiges Wesen mit Federn und Fell lugt aus dem Ei – was für ein Mischwesen?',
    'Kleine Krallen, weiche Flügel, ein neugieriger Blick – etwas Besonderes wächst heran.',
    'Der junge Hippogreif spreizt mächtige Schwingen – ein Wesen aus alten Sagen.',
    'Ein stolzer Hippogreif – halb Adler, halb Pferd, ganz majestätisch.',
    'Ein EPISCHER Hippogreif – Reittier der Helden, Wächter der Lüfte!',
    'Zwischen Himmel und Erde findet er seine Heimat. Der vollendete Hippogreif trägt Legenden auf seinem Rücken – frei, stolz, unsterblich.'
  ],
  einhornkatze: [
    'Ein rosa schimmerndes Ei bebt – das Team hat es geschafft!',
    'Ein winziges Einhornkatzen-Baby schnurrt heraus, das Horn glitzert.',
    'Die Einhornkatze wächst – ihre Mähne schillert in allen Regenbogenfarben.',
    'Eine anmutige Einhornkatze – schnurrend, verschmust, magisch.',
    'Eine LEGENDÄRE Einhornkatze – Symbol des Kurs-Zusammenhalts, geboren aus Teamgeist!',
    'Sie ist mehr als ein Wesen – sie ist das Herz des Kurses geworden. Die vollendete Einhornkatze schnurrt durch alle Welten, unsterblich und unvergesslich.'
  ],
};

const CREATURE_IMAGES = {
  snail:       ['Schnecke1',       'Schnecke2',       'Schnecke3',       'Schnecke4',       'Schnecke5',       'Schnecke6'       ],
  fish:        ['Fisch1',          'Fisch2',          'Fisch3',          'Fisch4',          'Fisch5',          'Fisch6'          ],
  chicken:     ['huhn1',           'huhn2',           'huhn3',           'huhn4',           'huhn5',           'Huhn6'           ],
  salamander:  ['Salamander1',     'Salamander2',     'Salamander3',     'Salamander4',     'Salamander5',     'Salamander6'     ],
  falkeneule:  ['Falkeneule1',     'Falkeneule2',     'Falkeneule3',     'Falkeneule4',     'Falkeneule5',     'Falkeneule6'     ],
  triceratops: ['Triceratops1',    'Triceratops2',    'Triceratops3',    'Triceratops4',    'Triceratops5',    'Triceratops6'    ],
  dragon:      ['drache1',         'drache2',         'drache3',         'drache4',         'drache5',         'Drache6'         ],
  snaildragon: ['Schneckendrache1','Schneckendrache2','Schneckendrache3','Schneckendrache4','Schneckendrache5','Schneckendrache6'],
  butterfly:   ['Schmetterling1',  'Schmetterling2',  'Schmetterling3',  'Schmetterling4',  'Schmetterling5',  'Schmetterling6'  ],
  turtle:      ['Schildkröte1',    'Schildkröte2',    'Schildkröte3',    'Schildkröte4',    'Schildkröte5',    'Schildkröte6'    ],
  robot:       ['AI1',             'AI2',             'AI3',             'AI4',             'AI5',             'AI6'             ],
  pfau:        ['Pfau1',           'Pfau2',           'Pfau3',           'Pfau4',           'Pfau5',           'Pfau6'           ],
  biene:       ['Biene1',          'Biene2',          'Biene3',          'Biene4',          'Biene5',          'Biene6'          ],
  oktopus:     ['Oktopus1',        'Oktopus2',        'Oktopus3',        'Oktopus4',        'Oktopus5',        'Oktopus6'        ],
  ente:        ['Ente1',           'Ente2',           'Ente3',           'Ente4',           'Ente5',           'Ente6'           ],
  chamaeleon:  ['Chamäleon1',      'Chamäleon2',      'Chamäleon3',      'Chamäleon4',      'Chamäleon5',      'Chamäleon6'      ],
  pinguin:     ['Pinguin1',        'Pinguin2',        'Pinguin3',        'Pinguin4',        'Pinguin5',        'Pinguin6'        ],
  frosch:      ['Frosch1',         'Frosch2',         'Frosch3',         'Frosch4',         'Frosch5',         'Frosch6'         ],
  raptor:      ['Raptor1',         'Raptor2',         'Raptor3',         'Raptor4',         'Raptor5',         'Raptor6'         ],
  chinDrache:  ['chinDrache1',     'chinDrache2',     'chinDrache3',     'chinDrache4',     'chinDrache5',     'ChinDrache6'     ],
  schnabeltier:['Schnabeltier1',   'Schnabeltier2',   'Schnabeltier3',   'Schnabeltier4',   'Schnabeltier5',   'Schnabeltier6'   ],
  krabbe:      ['Krabbe1',         'Krabbe2',         'Krabbe3',         'Krabbe4',         'Krabbe5',         'Krabbe6'         ],
  hai:         ['Hai1',            'Hai2',            'Hai3',            'Hai4',            'Hai5',            'Hai6'            ],
  libelle:     ['Liebelle1',       'Liebelle2',       'Liebelle3',       'Liebelle4',       'Liebelle5',       'Liebelle6'       ],
  hippogreif:  ['Hypogreif1',      'Hypogreif2',      'Hypogreif3',      'Hypogreif4',      'Hypogreif5',      'Hypogreif6'      ],
  einhornkatze:['Einhornkatze1',   'Einhornkatze2',   'Einhornkatze3',   'Einhornkatze4',   'Einhornkatze5',   'Einhornkatze6'   ],
};

function getCreatureHTML(creature, stage) {
  const base = (window.CREATURE_IMAGE_BASE !== undefined) ? window.CREATURE_IMAGE_BASE : 'data/';
  const imgs = CREATURE_IMAGES[creature];
  const s    = Math.max(0, Math.min(stage ?? 0, (imgs?.length ?? GROWTH_STAGES) - 1));
  const key  = imgs?.[s] ?? 'drache1';
  const alt  = CREATURE_NAMES[creature] ?? creature;
  const img  = `<img src="${base}${key}.png" alt="${alt}" class="creature-img" data-stage="${s}">`;
  if (isPfau(creature)) {
    return `<div class="pfau-frame">${img}</div>`;
  }
  if (creature === 'chinDrache') {
    return `<div class="chindrache-frame">${img}</div>`;
  }
  if (isLegendary(creature)) {
    return `<div class="legendary-frame">${img}</div>`;
  }
  if (isEpic(creature)) {
    return `<div class="epic-frame">${img}</div>`;
  }
  if (isRare(creature)) {
    return `<div class="rare-frame">${img}</div>`;
  }
  return img;
}

/* ─── Ei-SVGs (5 Rissstufen) ─── */
function getEggSVG(stage) {
  const fns = [eggStage0, eggStage1, eggStage2, eggStage3, eggStage4];
  return (fns[Math.min(stage, 4)] || eggStage0)();
}

function eggStage0() {
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="eg0" cx="38%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#c49a5a"/><stop offset="100%" stop-color="#7a5020"/>
    </radialGradient></defs>
    <ellipse cx="50" cy="64" rx="38" ry="50" fill="url(#eg0)" stroke="#5a3810" stroke-width="2"/>
    <ellipse cx="37" cy="44" rx="9" ry="12" fill="rgba(255,255,255,0.15)" transform="rotate(-15,37,44)"/>
  </svg>`;
}
function eggStage1() {
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="eg1" cx="38%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#c49a5a"/><stop offset="100%" stop-color="#7a5020"/>
    </radialGradient></defs>
    <ellipse cx="50" cy="64" rx="38" ry="50" fill="url(#eg1)" stroke="#5a3810" stroke-width="2"/>
    <ellipse cx="37" cy="44" rx="9" ry="12" fill="rgba(255,255,255,0.13)" transform="rotate(-15,37,44)"/>
    <path d="M53 27 L58 37 L52 43" stroke="#3a2008" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M40 59 L45 53" stroke="#3a2008" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  </svg>`;
}
function eggStage2() {
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="eg2" cx="38%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#c49a5a"/><stop offset="100%" stop-color="#7a5020"/>
    </radialGradient></defs>
    <ellipse cx="50" cy="64" rx="38" ry="50" fill="url(#eg2)" stroke="#5a3810" stroke-width="2"/>
    <ellipse cx="37" cy="44" rx="9" ry="12" fill="rgba(255,255,255,0.13)" transform="rotate(-15,37,44)"/>
    <path d="M51 22 L57 33 L50 40 L56 51" stroke="#3a2008" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M37 55 L43 48 L47 56" stroke="#3a2008" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M63 63 L68 57" stroke="#3a2008" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <ellipse cx="52" cy="24" rx="6" ry="3" fill="rgba(255,200,80,0.22)"/>
  </svg>`;
}
function eggStage3() {
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="eg3" cx="38%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#c49a5a"/><stop offset="100%" stop-color="#7a5020"/>
    </radialGradient></defs>
    <ellipse cx="50" cy="64" rx="38" ry="50" fill="url(#eg3)" stroke="#5a3810" stroke-width="2"/>
    <ellipse cx="50" cy="20" rx="14" ry="10" fill="#1a0e05"/>
    <ellipse cx="50" cy="20" rx="10" ry="7" fill="rgba(255,180,40,0.38)"/>
    <path d="M38 23 L34 38 L41 44 L36 57" stroke="#3a2008" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M62 23 L66 36 L59 43 L64 56" stroke="#3a2008" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M28 65 L35 57 L39 65" stroke="#3a2008" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M71 61 L76 54" stroke="#3a2008" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <circle cx="44" cy="18" r="4.5" fill="#f0b429"/>
    <circle cx="56" cy="18" r="4.5" fill="#f0b429"/>
    <circle cx="44" cy="18" r="2.3" fill="#1a0e05"/>
    <circle cx="56" cy="18" r="2.3" fill="#1a0e05"/>
    <circle cx="43" cy="17" r="1" fill="white"/>
    <circle cx="55" cy="17" r="1" fill="white"/>
  </svg>`;
}
function eggStage4() {
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="eg4" cx="38%" cy="60%" r="60%">
      <stop offset="0%" stop-color="#a07840"/><stop offset="100%" stop-color="#6a4818"/>
    </radialGradient></defs>
    <path d="M14 76 Q14 116 50 116 Q86 116 86 76 Q74 65 50 62 Q26 65 14 76Z" fill="url(#eg4)" stroke="#5a3810" stroke-width="2"/>
    <path d="M24 58 L16 44 L30 52 Z" fill="#c49a5a" stroke="#5a3810" stroke-width="1.5"/>
    <path d="M74 56 L82 42 L68 50 Z" fill="#c49a5a" stroke="#5a3810" stroke-width="1.5"/>
    <path d="M38 50 L34 36 L50 46 L64 35 L60 50 Z" fill="#b8884a" stroke="#5a3810" stroke-width="1.5"/>
    <path d="M18 80 Q18 110 50 110 Q82 110 82 80 Q64 70 50 68 Q36 70 18 80Z" fill="#e8c870" opacity="0.25"/>
  </svg>`;
}

/* Rissstufe aus Anzahl richtiger Antworten (0–10 Skala) */
function crackStageFromCorrect(correct) {
  if (correct >= 9) return 4;
  if (correct >= 6) return 3;
  if (correct >= 3) return 2;
  if (correct >= 1) return 1;
  return 0;
}

/* Rissstufe als Verhältnis – für beliebige Fragenzahl */
function crackStageFromRatio(correct, total) {
  const pct = correct / total;
  if (pct >= 0.875) return 4;
  if (pct >= 0.625) return 3;
  if (pct >= 0.375) return 2;
  if (pct >= 0.125) return 1;
  return 0;
}

/* Wachstumsbeitrag einer Spielsitzung – normalisiert auf 0–10-Skala.
   So entsprechen 30 % in jedem Spiel (unabhängig von der Fragenzahl)
   immer demselben Wachstumsschritt: floor(3/3) = Stufe 1. */
function computeSessionGrowth(correct, maxPoints) {
  return (correct / maxPoints) * 10;
}

/* Berechnet Coins und Wachstum für eine abgeschlossene Runde (auch Runde 1).
   Mutiert data.growth und data.coins direkt. Gibt coinsGained zurück.
   Booster/coinsx3 werden hier geprüft aber NICHT gecleart – das macht der Aufrufer.
   skipGrowth=true (Runde 1): Coins werden vergeben, Growth bleibt unverändert. */
function computeRoundResult(data, correct, maxPoints, sd, skipGrowth) {
  const savedGrowth = data.growth;
  const baseContribution = computeSessionGrowth(correct, maxPoints);
  let contribution = baseContribution;
  const alreadyMaxed = data.growth >= GROWTH_MAX;

  if (!alreadyMaxed && sd.wachstumsBooster) contribution *= 2;

  let coinsGained = 0;
  if (alreadyMaxed) {
    coinsGained = Math.round(contribution);
  } else {
    const room = GROWTH_MAX - data.growth;
    if (contribution > room) {
      data.growth = GROWTH_MAX;
      coinsGained = Math.round(Math.max(0, baseContribution - room));
    } else {
      data.growth = Math.min(data.growth + contribution, GROWTH_MAX);
      coinsGained = Math.round(baseContribution);
    }
  }

  if (correct === maxPoints) coinsGained += 3;
  coinsGained += getGrowthBonusCoins(data.growth);

  // Coins ×3 multipliziert den GESAMTEN Ertrag (Basis + Perfekt- + Vollendet-Bonus).
  // Nur wenn Kreatur schon ausgewachsen ist — getActiveItemsForSlot zeigt das
  // Item ohnehin nur dann an. Max ergibt bei perfektem Score in Vollendet-Stufe
  // (10 + 3 + 10) × 3 = 69 — weit unter dem 300er-Delta-Cap in Migration 0016.
  if (alreadyMaxed && sd.coinsx3) coinsGained *= 3;

  if (skipGrowth) data.growth = savedGrowth;
  data.coins = (data.coins || 0) + coinsGained;
  return coinsGained;
}

/* Wachstums-Bonus je Runde: +5 wenn ausgewachsen, +10 wenn vollendet (nicht kumulativ). */
function getGrowthBonusCoins(growth) {
  if (growth >= GROWTH_S6)  return 10;
  if (growth >= GROWTH_MAX) return 5;
  return 0;
}

/* ─── Local Storage ─── */
const STORAGE_KEY = 'lernwelt_v3';

function defaultGameData() {
  return { points: 0, roundsPlayed: 0, creature: null, growth: 0, coins: 0 };
}

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function loadStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};

    let parsed;
    try {
      parsed = JSON.parse(atob(raw));
    } catch {
      // Altes Format: Plain JSON → migrieren
      parsed = JSON.parse(raw);
      saveStorage(key, parsed);
      return parsed;
    }

    // Neues Format mit Prüfsumme: { d, h }
    if (parsed !== null && typeof parsed === 'object' && 'h' in parsed && 'd' in parsed) {
      if (parsed.h !== hashString(JSON.stringify(parsed.d))) return {};
      return parsed.d;
    }

    // Base64 ohne Prüfsumme (Übergang) → beim nächsten Speichern wird sie ergänzt
    return parsed;
  } catch(e) { return {}; }
}

function saveStorage(key, data) {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(key, btoa(JSON.stringify({ d: data, h: hashString(json) })));
  } catch(e) {}
}

function getGameData(id) {
  try {
    const data = loadStorage(STORAGE_KEY);
    return data[id] || defaultGameData();
  } catch(e) { return defaultGameData(); }
}

function saveGameData(id, gd) {
  // Nest-IDs sind dynamisch (nest_atari_repair_..., nest_backup_...) und
  // existieren nicht in der games-Tabelle → sync_game_state würde
  // 'game_not_found' returnen. Statt eigenem game_state landen Nest-
  // Kreaturen in shopData.nests[i].hatched und werden mit dem
  // Shop-Blob-Sync (sync_shop_state) hochgezogen.
  const isNest = typeof id === 'string' && id.startsWith('nest_');

  try {
    const all = loadStorage(STORAGE_KEY);
    all[id] = gd;
    if (!isNest) {
      // Dirty-Marker: Spielseiten laden session.js nicht — der Sync passiert
      // erst beim Hub-Boot via pushPendingState(). Marker überlebt Reload,
      // Tab-Wechsel und Offline-Runden.
      all._pending = { ...(all._pending || {}), [id]: true };
    }
    saveStorage(STORAGE_KEY, all);
  } catch(e) {}

  if (isNest) {
    // Nest-Snapshot ins Shop-Blob spiegeln → wird durch saveShopData gesynct
    try {
      const sd   = loadShopData();
      const nest = sd.nests.find(n => n.nestId === id);
      if (nest) {
        // Server-Merge castet mit ::int → Floats (z.B. gd.growth=9.375 aus
        // computeSessionGrowth) würden 22P02 werfen. Deshalb hier flooren.
        nest.hatched = {
          creature:     gd.creature ?? null,
          growth:       Math.max(0, Math.floor(gd.growth       ?? 0)),
          points:       Math.max(0, Math.floor(gd.points       ?? 0)),
          roundsPlayed: Math.max(0, Math.floor(gd.roundsPlayed ?? 0)),
          coins:        Math.max(0, Math.floor(gd.coins        ?? 0))
        };
        saveShopData(sd);
      }
    } catch (e) { console.warn('[creatures] nest hatched mirror failed:', e.message); }
    return;
  }

  // Debounced Push statt Fire-and-Forget: Rapid-Klicks (Trank auf mehrere
  // Slots, Kettenaufrufe aus renderHub) kollabieren zu einem Sync mit finalem
  // Snapshot. Vorher: jeder Klick → separater Sync → Server-Rate-Limit (1s
  // in Migration 0016) verwarf den späteren Push und der `_pending`-Marker
  // wurde vom früheren Erfolg fälschlich gelöscht → wichtiger Endzustand
  // ging beim nächsten `loadServerState` verloren.
  if (getAccessToken() && window.SUPABASE_URL) {
    schedulePushGameState(id);
  }
}

/* ─── Debounced Push für game_state ───────────────────────────
   Warum debounce + snapshot-compare statt Fire-and-Forget:
   - Debounce (400ms pro gameId): mehrere Klicks im gleichen Zeitfenster
     landen in EINEM Sync mit dem finalen Snapshot. Vermeidet das
     server-seitige rate_limit (1s in Migration 0016).
   - Snapshot-Compare vor clearPendingMarker: wenn der lokale State sich
     während des Syncs geändert hat (paralleler Save), bleibt der Marker
     stehen und wird durch einen Follow-up-Push abgeräumt.
   - Marker-Reset im .catch: garantiert, dass ein fehlgeschlagener Sync
     (rate_limit, Netzwerk) den Marker nicht in "clean" hinterlässt.
   - Einmaliger Retry nach rate_limit-Rejection (1200ms > Server-Fenster).
     delta_cap ist eine legitime Cheat-Ablehnung → NICHT retryen.        */
const _gsPushTimers   = Object.create(null);
const _gsPushInflight = Object.create(null);
const GS_PUSH_DEBOUNCE_MS  = 400;
const GS_PUSH_RETRY_MS     = 1200;

function schedulePushGameState(gameId) {
  if (_gsPushTimers[gameId]) clearTimeout(_gsPushTimers[gameId]);
  _gsPushTimers[gameId] = setTimeout(() => {
    delete _gsPushTimers[gameId];
    if (_gsPushInflight[gameId]) {
      // Aktueller Push nicht fertig → nach kurzer Wartezeit erneut prüfen.
      schedulePushGameState(gameId);
      return;
    }
    pushGameStateNow(gameId, false);
  }, GS_PUSH_DEBOUNCE_MS);
}

async function pushGameStateNow(gameId, isRetry) {
  if (_gsPushInflight[gameId]) return;
  const all = loadStorage(STORAGE_KEY);
  const gd  = all[gameId];
  if (!gd) return;
  const snapshot = JSON.stringify(gd);
  _gsPushInflight[gameId] = true;
  try {
    await syncGameStateToServer(gameId, gd);
    // Nur clearen wenn der lokale Stand noch der ist, den wir gerade gepusht
    // haben. Sonst hat ein späterer Save den Marker neu gesetzt und dieser
    // gehört einem folgenden Push.
    const fresh = loadStorage(STORAGE_KEY);
    if (JSON.stringify(fresh[gameId]) === snapshot) {
      clearPendingMarker(gameId);
    } else {
      // Lokal ist schon weiter → nächsten Sync anstoßen.
      schedulePushGameState(gameId);
    }
  } catch (e) {
    console.warn('[creatures] sync failed:', gameId, e.message);
    // Marker muss stehenbleiben, damit pushPendingState beim nächsten
    // Hub-Boot einen erneuten Versuch macht. Ein früherer erfolgreicher
    // Sync-Run könnte ihn gelöscht haben.
    try {
      const fresh = loadStorage(STORAGE_KEY);
      if (!fresh._pending?.[gameId]) {
        fresh._pending = { ...(fresh._pending || {}), [gameId]: true };
        saveStorage(STORAGE_KEY, fresh);
      }
    } catch (e2) {}
    // Rate-Limit ist temporär (Server-Fenster 1s). Einmalig retryen.
    // delta_cap/first_submit_cap sind Business-Ablehnungen → NICHT retryen.
    if (!isRetry && /rate_limit/i.test(e.message)) {
      setTimeout(() => pushGameStateNow(gameId, true), GS_PUSH_RETRY_MS);
    }
  } finally {
    _gsPushInflight[gameId] = false;
  }
}

/* Access-Token aus window.__accessToken (session.js) ODER direkt aus dem
   Supabase-Auth-Storage lesen. Game-Frames laden session.js nicht, brauchen
   aber trotzdem einen sofortigen Server-Push (sonst gehen Nest-Coins beim
   Logout verloren). storageKey ist 'lernwelt-auth' (siehe session.js).
   Prüft expires_at und gibt bei Ablauf null zurück — der Push scheitert
   dann sauber und der Dirty-Marker bleibt für den nächsten Boot bestehen. */
function getAccessToken() {
  if (typeof window.__accessToken === 'string' && window.__accessToken) {
    return window.__accessToken;
  }
  try {
    const raw = localStorage.getItem('lernwelt-auth');
    if (!raw) return null;
    const s = JSON.parse(raw);
    const token = s?.access_token ?? s?.currentSession?.access_token ?? null;
    const expiresAt = s?.expires_at ?? s?.currentSession?.expires_at ?? null;
    if (!token) return null;
    if (expiresAt && (Date.now() / 1000) >= expiresAt) return null;
    return token;
  } catch (e) { return null; }
}

function clearPendingMarker(id) {
  try {
    const all = loadStorage(STORAGE_KEY);
    if (all._pending && id in all._pending) {
      delete all._pending[id];
      saveStorage(STORAGE_KEY, all);
    }
  } catch(e) {}
}

/* Beim Hub-Boot: alle offenen Dirty-Marker in einem Schwung hochpushen.
   Marker werden nur bei Erfolg entfernt — bei Fehler bleibt das Spiel dirty
   und wird beim nächsten Boot erneut versucht.                              */
async function pushPendingState() {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  const all = loadStorage(STORAGE_KEY);
  const allPending = Object.keys(all._pending || {});
  // Alt-Bestand: vor dem Nest-Skip-Fix konnten nest_-IDs im _pending
  // landen. Die returnen ewig 'game_not_found' — hier still verwerfen.
  const stale   = allPending.filter(id => id.startsWith('nest_'));
  const pending = allPending.filter(id => !id.startsWith('nest_'));
  if (pending.length === 0 && stale.length === 0) return;
  if (pending.length) console.log('[creatures] push pending:', pending);
  const results = await Promise.allSettled(
    pending.map(id => syncGameStateToServer(id, all[id] || defaultGameData()))
  );
  const fresh = loadStorage(STORAGE_KEY);
  fresh._pending = fresh._pending || {};
  for (const id of stale) delete fresh._pending[id];
  let ok = 0;
  for (let i = 0; i < pending.length; i++) {
    if (results[i].status === 'fulfilled') {
      delete fresh._pending[pending[i]];
      ok++;
    } else {
      console.warn('[creatures] push failed for', pending[i], ':', results[i].reason?.message);
    }
  }
  saveStorage(STORAGE_KEY, fresh);
  console.log(`[creatures] pushed ${ok}/${pending.length}${stale.length ? ` (dropped ${stale.length} nest markers)` : ''}`);
}

async function syncGameStateToServer(gameId, gd) {
  const token = getAccessToken();
  if (!token || !window.SUPABASE_URL) return;
  const url = `${window.SUPABASE_URL}/rest/v1/rpc/sync_game_state`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: window.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      p_game_id:       gameId,
      p_points:        Math.max(0, Math.floor(gd.points        || 0)),
      p_rounds_played: Math.max(0, Math.floor(gd.roundsPlayed  || 0)),
      p_creature:      gd.creature || null,
      p_growth:        Math.max(0, Math.floor(gd.growth        || 0)),
      p_coins:         Math.max(0, Math.floor(gd.coins         || 0))
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const result = await res.json();
  if (!result?.ok) throw new Error(`RPC ${result?.error || 'unknown'}`);
}

/* ─── Server-State beim Hub-Boot laden ─────────────────────────
   Zieht game_state aus der DB und schreibt es in denselben
   localStorage-Blob, den renderHub() liest. Die DB gewinnt gegen
   lokale Werte für Games, die in der DB existieren. Games, die
   nur lokal existieren (Guest-Historie), bleiben unberührt.        */
async function loadServerState() {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) return;
  try {
    const url = `${window.SUPABASE_URL}/rest/v1/game_state`
              + `?select=game_id,points,rounds_played,creature,growth,coins`;
    const res = await fetch(url, {
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) throw new Error(`game_state ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('[creatures] server-state leer — localStorage bleibt.');
      return;
    }
    const all = loadStorage(STORAGE_KEY);
    const pending = all._pending || {};
    let applied = 0;
    for (const r of rows) {
      // Pending → localStorage ist neuer (Push steht noch aus), nicht überschreiben.
      if (pending[r.game_id]) continue;
      all[r.game_id] = {
        points:       r.points        ?? 0,
        roundsPlayed: r.rounds_played ?? 0,
        creature:     r.creature      ?? null,
        growth:       r.growth        ?? 0,
        coins:        r.coins         ?? 0
      };
      applied++;
    }
    saveStorage(STORAGE_KEY, all);
    console.log(`[creatures] server-state geladen: ${applied}/${rows.length} games`);
  } catch (e) {
    console.warn('[creatures] loadServerState failed:', e.message);
  }
}

/* ─── Unlocked-Games: DB-first, localStorage-Fallback ───
   Cache _serverUnlocked = null  → nicht eingeloggt, Fallback localStorage
   Cache _serverUnlocked = []/[...] → eingeloggt, DB ist Quelle der Wahrheit    */
let _serverUnlocked = null;

async function refreshUnlockedFromServer() {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) {
    _serverUnlocked = null;
    return;
  }
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) {
    _serverUnlocked = null;
    return;
  }
  try {
    const url = `${window.SUPABASE_URL}/rest/v1/user_unlocked_games?select=game_id`;
    const res = await fetch(url, {
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) throw new Error(`user_unlocked_games ${res.status}`);
    const rows = await res.json();
    _serverUnlocked = rows.map(r => r.game_id);
    console.log('[creatures] server-unlocked:', _serverUnlocked);
  } catch (e) {
    console.warn('[creatures] Unlock-Liste laden fehlgeschlagen:', e.message);
    _serverUnlocked = [];
  }
}

function getUnlocked() {
  if (_serverUnlocked !== null) return _serverUnlocked;
  return loadStorage(STORAGE_KEY)._unlocked || [];
}

function setUnlocked(gameId) {
  // Server-Modus: nur Cache updaten (die eigentliche Persistenz macht unlock_game-RPC)
  if (_serverUnlocked !== null) {
    if (!_serverUnlocked.includes(gameId)) _serverUnlocked = [..._serverUnlocked, gameId];
    return;
  }
  // Guest-Modus: localStorage
  const all = loadStorage(STORAGE_KEY);
  const list = all._unlocked || [];
  if (!list.includes(gameId)) {
    all._unlocked = [...list, gameId];
    saveStorage(STORAGE_KEY, all);
  }
}

function migrateUnlocked() {
  const OLD_KEY = 'lernwelt_unlocked';
  const old = localStorage.getItem(OLD_KEY);
  if (!old) return;
  try {
    const list = JSON.parse(old);
    if (Array.isArray(list) && list.length > 0) {
      const all = loadStorage(STORAGE_KEY);
      const existing = all._unlocked || [];
      all._unlocked = [...new Set([...existing, ...list])];
      saveStorage(STORAGE_KEY, all);
    }
  } catch(e) {}
  localStorage.removeItem(OLD_KEY);
}

window.getUnlocked            = getUnlocked;
window.setUnlocked            = setUnlocked;
window.migrateUnlocked        = migrateUnlocked;
window.refreshUnlockedFromServer = refreshUnlockedFromServer;
window.loadServerState        = loadServerState;
window.syncGameStateToServer  = syncGameStateToServer;
window.pushPendingState       = pushPendingState;
window.loadServerShop         = loadServerShop;
window.syncShopStateToServer  = syncShopStateToServer;
window.loadGiftTasks          = loadGiftTasks;

/* ─── Ei/Kreatur-Anzeige auf Spielseiten ─── */
/* Nutzt feste Element-IDs: eggVisual, eggStageLabel, eggProgressFill */
function updateGameEggDisplay(data, crackStage, doShake = false, liveGrowth = null) {
  const eggEl   = document.getElementById('eggVisual');
  const labelEl = document.getElementById('eggStageLabel');
  const fillEl  = document.getElementById('eggProgressFill');
  if (!eggEl) return;

  const hasCreature = !!data.creature;

  if (hasCreature) {
    const growth = liveGrowth !== null ? liveGrowth : data.growth;
    const stage  = getGrowthStage(growth);
    eggEl.innerHTML = getCreatureHTML(data.creature, stage);
    if (labelEl) labelEl.textContent = `${CREATURE_NAMES[data.creature]} · ${GROWTH_LABELS[stage]}`;
    if (fillEl) fillEl.style.width = Math.min(growth / GROWTH_MAX * 100, 100) + '%';
  } else {
    eggEl.innerHTML = getEggSVG(crackStage);
    const eggLabels = ['Ei schlummert…','Etwas bewegt sich…','Das Ei bricht auf!','Augen tauchen auf!','Die Kreatur schlüpft!'];
    if (labelEl) labelEl.textContent = eggLabels[Math.min(crackStage, 4)];
    if (fillEl) fillEl.style.width = (crackStage / 4 * 100) + '%';
  }

  if (doShake) shakeEgg();
}

function shakeEgg() {
  const egg = document.getElementById('eggVisual');
  if (!egg) return;
  egg.classList.remove('shake');
  void egg.offsetWidth;
  egg.classList.add('shake');
}

function triggerCreatureLevelUp(isFinal = false, elementId = 'eggVisual') {
  const egg = document.getElementById(elementId);
  if (egg) {
    egg.classList.remove('creature-level-up', 'creature-level-up--final');
    void egg.offsetWidth;
    egg.classList.add(isFinal ? 'creature-level-up--final' : 'creature-level-up');
    if (isFinal) spawnLevelUpParticles(egg);
  }
  showLevelUpBanner(isFinal);
}

function showLevelUpBanner(isFinal) {
  const el = document.createElement('div');
  el.className = 'levelup-banner' + (isFinal ? ' levelup-banner--final' : '');
  el.textContent = isFinal ? '⭐ Ausgewachsen! ⭐' : '✨ Aufgestiegen!';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/* ─── Shop-Hilfsfunktionen (in allen Spielen verfügbar) ─── */
const SHOP_KEY = 'lernwelt_shop_v1';

function loadShopData() {
  try {
    const d = loadStorage(SHOP_KEY);
    // toCount: migrate old boolean flags (true→1, false→0) to numeric inventory counts
    const toCount = (val, countField) => countField !== undefined ? countField : (val ? 1 : 0);
    return {
      spentCoins:            d.spentCoins            ?? 0,
      purchased:             d.purchased             ?? [],
      wachstumstrank:        d.wachstumstrank        ?? false,
      wachstumstrankCount:   d.wachstumstrankCount   ?? 0,
      // Migration 0042: Spent-Counter analog spentKristalle. Anzeige/Guards
      // via getConsumableCount(sd,id) = max(0, Count − Spent). Ohne dieses
      // Trennmodell frisst der server-seitige max-Merge jeden Client-Decrement.
      wachstumstrankSpent:   d.wachstumstrankSpent   ?? 0,
      // bool = "active for the next game" (set when Nutzen is clicked, cleared after use)
      wachstumsBooster:      d.wachstumsBoosterCount !== undefined ? !!(d.wachstumsBooster) : false,
      wachstumsBoosterCount: toCount(d.wachstumsBooster, d.wachstumsBoosterCount),
      wachstumsBoosterSpent: d.wachstumsBoosterSpent ?? 0,
      coinsx3:               d.coinsx3Count          !== undefined ? !!(d.coinsx3)          : false,
      coinsx3Count:          toCount(d.coinsx3, d.coinsx3Count),
      coinsx3Spent:          d.coinsx3Spent          ?? 0,
      glucksklee:            d.gluckskleeCount       !== undefined ? !!(d.glucksklee)        : false,
      gluckskleeCount:       toCount(d.glucksklee, d.gluckskleeCount),
      gluckskleeSpent:       d.gluckskleeSpent       ?? 0,
      lockmittel:            d.lockmittelCount       !== undefined ? !!(d.lockmittel)        : false,
      lockmittelCount:       toCount(d.lockmittel, d.lockmittelCount),
      lockmittelSpent:       d.lockmittelSpent       ?? 0,
      // Migration 0044: Reset-Karte (300c) + Freundschaftskeks (50c, 5×-Cap).
      // Reset-Karte hat kein Aktiv-Bool — Aktivierung ruft direkt reset_daily_bonbon_claims RPC.
      resetKarteCount:         d.resetKarteCount         ?? 0,
      resetKarteSpent:         d.resetKarteSpent         ?? 0,
      freundschaftskeksCount:  d.freundschaftskeksCount  ?? 0,
      freundschaftskeksSpent:  d.freundschaftskeksSpent  ?? 0,
      nests:                 d.nests                 ?? [],
      pendingEggNestId:      d.pendingEggNestId      ?? null,
      seenCreatures:         d.seenCreatures         ?? {},
      hackUnlocked:          d.hackUnlocked          ?? false,
      atariNumber:           d.atariNumber           ?? null,
      atariSolved:           d.atariSolved           ?? false,
      atariThemeShown:       d.atariThemeShown       ?? false,
      pfauEggGranted:        d.pfauEggGranted        ?? false,
      bankedCoins:           d.bankedCoins           ?? 0,
      kristalle:             d.kristalle             ?? 0,
      // Migration 0023: spentKristalle wächst monoton, Anzeige-balance =
      // kristalle − spentKristalle. Vorher wurde kristalle direkt dekrementiert
      // und beim Sync per max-Merge auf den Server-Wert zurückgeplättet.
      spentKristalle:        d.spentKristalle        ?? 0,
      lootboxDailyClaimed:   d.lootboxDailyClaimed   ?? {},
      pendingBackup:         d.pendingBackup         ?? null,
      sealedEggs:            d.sealedEggs            ?? [],
      // Migration 0027: einmal geöffnete Siegel-Types bleiben für immer
      // geöffnet — verhindert Legi-Duplikate durch Merge-Reappear.
      openedSealTypes:       d.openedSealTypes       ?? [],
      sealProgress:          d.sealProgress          ?? {},
    };
  } catch(e) {
    return { spentCoins: 0, purchased: [], wachstumstrank: false, wachstumstrankCount: 0, wachstumstrankSpent: 0, wachstumsBooster: false, wachstumsBoosterCount: 0, wachstumsBoosterSpent: 0, coinsx3: false, coinsx3Count: 0, coinsx3Spent: 0, glucksklee: false, gluckskleeCount: 0, gluckskleeSpent: 0, lockmittel: false, lockmittelCount: 0, lockmittelSpent: 0, resetKarteCount: 0, resetKarteSpent: 0, freundschaftskeksCount: 0, freundschaftskeksSpent: 0, nests: [], pendingEggNestId: null, seenCreatures: {}, hackUnlocked: false, atariNumber: null, atariSolved: false, atariThemeShown: false, pfauEggGranted: false, bankedCoins: 0, kristalle: 0, spentKristalle: 0, lootboxDailyClaimed: {}, pendingBackup: null, sealedEggs: [], openedSealTypes: [], sealProgress: {} };
  }
}

/* Migration 0042: effektive Anzahl eines Consumables.
   id ∈ {wachstumstrank, wachstumsBooster, coinsx3, glucksklee, lockmittel}
   Count = alle je erhaltenen (grant), Spent = alle je genutzten.
   Beide monoton wachsend, damit max-Merge sicher ist. */
function getConsumableCount(sd, id) {
  if (!sd) sd = loadShopData();
  return Math.max(0, (sd[id + 'Count'] || 0) - (sd[id + 'Spent'] || 0));
}

/* Gibt zurück welches Item für diesen Slot nutzbar ist (und ob eins im Besitz ist).
   Ei → Glücksklee, Jungtier → Wachstums-Booster, Ausgewachsen → Coins ×3 */
function getActiveItemsForSlot(data, sd) {
  if (!sd) sd = loadShopData();
  const items = [];
  if (!data || !data.creature) {
    if (getConsumableCount(sd, 'glucksklee') > 0) items.push({ id: 'glucksklee', icon: '🍀', name: 'Glücksklee' });
    if (getConsumableCount(sd, 'lockmittel') > 0) items.push({ id: 'lockmittel', icon: '🧲', name: 'Lockmittel' });
  } else if (data.growth >= GROWTH_MAX) {
    if (getConsumableCount(sd, 'coinsx3') > 0) items.push({ id: 'coinsx3', icon: '🎰', name: 'Coins ×3' });
  } else {
    if (getConsumableCount(sd, 'wachstumsBooster') > 0) items.push({ id: 'wachstumsBooster', icon: '⚡', name: 'Wachstums-Booster' });
  }
  return items;
}

function getActiveItemForSlot(data, sd) {
  return getActiveItemsForSlot(data, sd)[0] ?? null;
}

/* ─── Münzbank (wird nach jedem Spiel auf dem Ergebnis-Screen gezeigt) ─── */
function getTotalCoinsGlobal() {
  try {
    const all = loadStorage(STORAGE_KEY);
    let total = 0;
    for (const key in all) total += all[key].coins || 0;
    total += loadShopData().bankedCoins || 0;
    return total;
  } catch(e) { return 0; }
}

function renderCoinBank(containerId, coinsGained) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  const spent      = loadShopData().spentCoins || 0;
  const totalAfter = getTotalCoinsGlobal() - spent;
  const gained     = coinsGained || 0;
  const coinsBefore = Math.max(0, totalAfter - gained);

  const wrap = document.createElement('div');
  wrap.className = 'coin-bank';
  wrap.innerHTML =
    '<div class="coin-bank__label">🏛 MÜNZBANK</div>' +
    '<div class="coin-bank__amount"><span id="cbCount">' + coinsBefore + '</span>' +
    '<span class="coin-bank__coin-icon">🪙</span></div>' +
    (gained > 0
      ? '<div class="coin-bank__earned" id="cbEarned">+' + gained + ' Münzen verdient</div>'
      : '');
  el.appendChild(wrap);

  // Migration 0044: Slot für Bonbon-Bank anlegen (auto-populated durch
  // awardBonbonsAndRender). Kein Layout-Impact wenn leer.
  const bonbonSlot = document.createElement('div');
  bonbonSlot.id = containerId + '-bonbons';
  el.appendChild(bonbonSlot);

  if (gained <= 0) return;

  setTimeout(function() {
    wrap.classList.add('coin-bank--animating');
    const earnedEl = document.getElementById('cbEarned');
    if (earnedEl) earnedEl.classList.add('coin-bank__earned--pulse');

    const countEl = document.getElementById('cbCount');
    if (countEl && coinsBefore !== totalAfter) {
      const duration = 750;
      const start = performance.now();
      const range = totalAfter - coinsBefore;
      (function tick(now) {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        countEl.textContent = Math.round(coinsBefore + range * eased);
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          countEl.textContent = totalAfter;
          if (earnedEl) earnedEl.classList.add('coin-bank__earned--fade');
        }
      })(performance.now());
    } else if (countEl) {
      countEl.textContent = totalAfter;
      if (earnedEl) earnedEl.classList.add('coin-bank__earned--fade');
    }
  }, 600);
}

/* ─── Bonbon-Bank (Season 3, unter der Coin-Bank) ────────────
   Zeigt Basis-Bonbons + optional Tages-Bonus als eigene "Karte" analog
   zur Coin-Bank. Styles werden INLINE eingebettet, weil Games GameHub/style.css
   nicht laden — jedes Game hätte sonst ungestylten Fallback.
   result-Objekt kommt aus award_game_bonbons-RPC bzw. window.__lastBonbonResult. */
function renderBonbonBank(containerId, result) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  if (!result || !result.ok) return;
  const base  = result.base  || 0;
  const bonus = result.bonus || 0;
  const total = base + bonus;
  if (total <= 0) return;

  // Nur EINMAL pro Page Styles einbetten (auch wenn Bank mehrfach gerendert wird).
  if (!document.getElementById('bonbonBankStyles')) {
    const style = document.createElement('style');
    style.id = 'bonbonBankStyles';
    style.textContent = `
      @keyframes bonbonRainbowShift {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      @keyframes bonbonBankIn {
        from { opacity: 0; transform: translateY(-6px) scale(.92); }
        to   { opacity: 1; transform: translateY(0)   scale(1); }
      }
      @keyframes bonbonBonusPulse {
        0%,100% { transform: scale(1);   filter: drop-shadow(0 0 3px rgba(255,200,80,.35)); }
        50%     { transform: scale(1.05); filter: drop-shadow(0 0 8px rgba(255,200,80,.7)); }
      }
      .bonbon-bank {
        margin: 12px auto 0;
        padding: 12px 18px 14px;
        max-width: 320px;
        background: linear-gradient(180deg, rgba(58,35,80,.85) 0%, rgba(30,20,55,.85) 100%);
        border-radius: 16px;
        text-align: center;
        color: #fef6e4;
        font-family: 'Nunito', system-ui, sans-serif;
        box-shadow: 0 6px 18px rgba(0,0,0,.32), 0 0 0 1px rgba(212,168,48,.35), 0 0 22px rgba(140,80,220,.18);
        position: relative;
        overflow: hidden;
        animation: bonbonBankIn .35s cubic-bezier(.34,1.56,.64,1) both;
      }
      .bonbon-bank::before {
        content: '';
        position: absolute; inset: 0;
        border-radius: 16px;
        padding: 2px;
        background: linear-gradient(90deg,#ff4d4d,#ff9a3c,#ffd93d,#6ee06e,#4ecdff,#a480ff,#ff77e5,#ff4d4d);
        background-size: 200% 100%;
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
                mask-composite: exclude;
        animation: bonbonRainbowShift 6s linear infinite;
        pointer-events: none;
      }
      .bonbon-bank__head {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-family: 'Cinzel', 'Nunito', serif;
        font-weight: 800; font-size: .82rem;
        letter-spacing: .12em;
        color: #ffd76a;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .bonbon-bank__head-icon { font-size: 1.15rem; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
      .bonbon-bank__amount-row {
        display: flex; align-items: baseline; justify-content: center; gap: 6px;
      }
      .bonbon-bank__amount {
        font-family: 'Cinzel', 'Nunito', serif;
        font-weight: 800; font-size: 1.9rem;
        background: linear-gradient(90deg,#ff4d4d,#ff9a3c,#ffd93d,#6ee06e,#4ecdff,#a480ff,#ff77e5,#ff4d4d);
        background-size: 200% 100%;
        -webkit-background-clip: text; background-clip: text; color: transparent;
        animation: bonbonRainbowShift 6s linear infinite;
        line-height: 1;
      }
      .bonbon-bank__amount-suffix {
        font-size: 1.4rem;
        line-height: 1;
      }
      .bonbon-bank__breakdown {
        margin-top: 6px;
        font-size: .78rem;
        color: rgba(254,246,228,.72);
      }
      .bonbon-bank__bonus-chip {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 10px;
        padding: 5px 12px;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(255,215,80,.22), rgba(255,140,60,.18));
        border: 1px solid rgba(255,215,80,.65);
        color: #ffe9a3;
        font-weight: 800; font-size: .82rem;
        letter-spacing: .04em;
        animation: bonbonBonusPulse 2.2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  const wrap = document.createElement('div');
  wrap.className = 'bonbon-bank';
  const breakdown = bonus > 0
    ? `<div class="bonbon-bank__breakdown">${base} Basis + ${bonus} Tages-Bonus</div>`
    : `<div class="bonbon-bank__breakdown">deine Bonbons für diese Runde</div>`;
  const bonusChip = bonus > 0
    ? `<div class="bonbon-bank__bonus-chip">✨ +${bonus} Tages-Bonus!</div>`
    : '';
  wrap.innerHTML =
    `<div class="bonbon-bank__head">` +
      `<span class="bonbon-bank__head-icon">🍬</span>` +
      `<span>Regenbogen-Bonbons</span>` +
      `<span class="bonbon-bank__head-icon">🍬</span>` +
    `</div>` +
    `<div class="bonbon-bank__amount-row">` +
      `<span class="bonbon-bank__amount">+${total}</span>` +
      `<span class="bonbon-bank__amount-suffix">🍬</span>` +
    `</div>` +
    breakdown +
    bonusChip;
  el.appendChild(wrap);
}

/* Rendert den Item-Nutzen-Button auf dem Ergebnis-Screen.
   containerId: ID des Containers im HTML; gameId: der aktuelle Spiel-Slot.
   onActivate: optionaler Callback statt window.location.reload() (z.B. für Quiz-Spiele). */
function renderResultItemButton(containerId, gameId, onActivate) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const data = getGameData(gameId);
  const items = getActiveItemsForSlot(data);
  if (!items.length) return;
  const iconOnly = items.length > 1;
  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'btn-use-item' + (iconOnly ? ' btn-use-item--icon' : '');
    btn.textContent = iconOnly ? item.icon : ('nutze ' + item.icon);
    btn.title = item.name + ' einsetzen';
    btn.addEventListener('click', () => {
      const sd = loadShopData();
      // Migration 0042: Aktivierung setzt NUR das Bool. Verbrauch (Spent++)
      // passiert beim Bool-Clearing im Spiel — sonst würde ein Abbruch das
      // Item verbrennen und refundAbandonedItems müsste Spent revertieren
      // (was der max-Merge sofort zurückplätten würde).
      if (getConsumableCount(sd, item.id) <= 0) return;
      sd[item.id] = true;
      saveShopData(sd);
      if (typeof onActivate === 'function') onActivate();
      else window.location.reload();
    });
    el.appendChild(btn);
  }
}

function saveShopData(data) {
  saveStorage(SHOP_KEY, data);
  markShopDirty();
  // Debounced Push: renderHub triggert bei jedem Aufruf mehrere saveShopData
  // (updateSeenCreatures, refundAbandonedItems, …). Vorher liefen die
  // parallel und die Response mit dem älteren Merge-Ergebnis konnte den
  // neueren lokalen Stand via applyMergedShopState zurücksetzen.
  if (getAccessToken() && window.SUPABASE_URL) {
    schedulePushShop();
  }
}

/* ─── Debounced Push für shop_state ──────────────────────────
   Gleiches Muster wie schedulePushGameState. Unterschiede:
   - Kein rate_limit (sync_shop_state hat keinen), also kein Retry.
   - Snapshot-Compare schützt hier zusätzlich gegen den max-Merge-Effekt:
     wenn zwischen Push und Response ein neuer Save mit niedrigerer
     wachstumstrankCount lokal steht, dürfen wir das applyMergedShopState
     NICHT ausführen — sonst dreht der Server-Merge unsere Reduzierung
     wieder auf den alten Wert. Stattdessen: neuen Push planen.       */
let _shopPushTimer     = null;
let _shopPushInflight  = false;
const SHOP_PUSH_DEBOUNCE_MS = 400;

function schedulePushShop() {
  if (_shopPushTimer) clearTimeout(_shopPushTimer);
  _shopPushTimer = setTimeout(() => {
    _shopPushTimer = null;
    if (_shopPushInflight) {
      schedulePushShop();
      return;
    }
    pushShopNow();
  }, SHOP_PUSH_DEBOUNCE_MS);
}

async function pushShopNow() {
  if (_shopPushInflight) return;
  const data = loadShopData();
  const snapshot = JSON.stringify(data);
  _shopPushInflight = true;
  try {
    const merged = await syncShopStateToServer(data);
    const fresh = loadShopData();
    if (JSON.stringify(fresh) === snapshot) {
      // Kein neuer Save während des Pushes → Server-Merge übernehmen.
      clearShopDirty();
      if (merged) applyMergedShopState(merged);
    } else {
      // Lokal ist weiter → merged NICHT anwenden (würde neuen Stand plätten).
      // Marker bleibt dirty; ein Follow-up-Push holt den finalen State.
      schedulePushShop();
    }
  } catch (e) {
    console.warn('[creatures] shop sync failed:', e.message);
    // markShopDirty() wurde in saveShopData gesetzt → bleibt bestehen für
    // nächsten Sync oder Hub-Boot (loadServerShop pusht dirty zuerst).
  } finally {
    _shopPushInflight = false;
  }
}

/* ─── Shop-Sync ─────────────────────────────────────────────
   Dirty-Marker als eigener localStorage-Key, damit der Shop-Blob
   selbst sauber bleibt und identisch zum Server-Format ist.       */
const SHOP_DIRTY_KEY = 'lernwelt_shop_dirty';

function markShopDirty()  { try { localStorage.setItem(SHOP_DIRTY_KEY, '1'); } catch(e) {} }
function clearShopDirty() { try { localStorage.removeItem(SHOP_DIRTY_KEY);  } catch(e) {} }
function isShopDirty()    { try { return localStorage.getItem(SHOP_DIRTY_KEY) === '1'; } catch(e) { return false; } }

/* Sanitize: garantiert dass alle numerischen nests[].hatched-Felder Integer
   sind, bevor der Push rausgeht. Ohne das wirft der Server ::int-Cast
   22P02 wenn Floats (wie growth=9.375) drinstecken. Andere Felder werden
   unverändert durchgereicht. */
function sanitizeShopForServer(shopData) {
  if (!shopData || !Array.isArray(shopData.nests)) return shopData;
  const cleanNests = shopData.nests.map(n => {
    if (!n?.hatched) return n;
    return {
      ...n,
      hatched: {
        creature:     n.hatched.creature ?? null,
        growth:       Math.max(0, Math.floor(n.hatched.growth       ?? 0)),
        points:       Math.max(0, Math.floor(n.hatched.points       ?? 0)),
        roundsPlayed: Math.max(0, Math.floor(n.hatched.roundsPlayed ?? 0)),
        coins:        Math.max(0, Math.floor(n.hatched.coins        ?? 0))
      }
    };
  });
  return { ...shopData, nests: cleanNests };
}

async function syncShopStateToServer(shopData) {
  const token = getAccessToken();
  if (!token || !window.SUPABASE_URL) return null;
  shopData = sanitizeShopForServer(shopData);
  const url = `${window.SUPABASE_URL}/rest/v1/rpc/sync_shop_state`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: window.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ p_state: shopData })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const result = await res.json();
  if (!result?.ok) throw new Error(`RPC ${result?.error || 'unknown'}`);
  return result.state || null;
}

/* ─── Bonbon-RPCs (Migration 0044) ──────────────────────────
   Werden von Spielen (award), Shop-Aktivierungen (reset, gift)
   und Hub-Boot (status) aufgerufen. Fehler werden geschluckt
   → null zurückgeben, Aufrufer muss defensiv handeln. */
async function callBonbonRPC(name, body) {
  const token = getAccessToken();
  if (!token || !window.SUPABASE_URL) return null;
  try {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`[creatures] ${name} failed:`, e.message);
    return null;
  }
}

/* Europe/Berlin-Datum als 'YYYY-MM-DD'. Muss mit Server-Datumsberechnung
   (now() at time zone 'Europe/Berlin') übereinstimmen — sonst zeigt der
   Hub-Kachel-Hint fälschlich +20 nach der ersten Runde noch weiter. */
function getBerlinTodayIso() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

/* Lokaler Marker in localStorage: überlebt Navigation vom Game zum Hub,
   falls die awardGameBonbons-Response nicht mehr am Client ankommt (der
   Server-Insert passiert aber trotzdem). Beim Hub-Boot mergen wir das
   mit dem Server-Cache. Alt-datierte Einträge werden verworfen. */
const BONBON_LOCAL_CLAIMS_KEY = 'lernwelt_bonbon_daily_claims';
function _writeLocalDailyClaim(gameId, today) {
  try {
    const stored = JSON.parse(localStorage.getItem(BONBON_LOCAL_CLAIMS_KEY) || '{}');
    stored[gameId] = today;
    localStorage.setItem(BONBON_LOCAL_CLAIMS_KEY, JSON.stringify(stored));
  } catch (e) {}
}
function _readLocalDailyClaims(today) {
  try {
    const stored = JSON.parse(localStorage.getItem(BONBON_LOCAL_CLAIMS_KEY) || '{}');
    const fresh  = {};
    for (const k in stored) if (stored[k] === today) fresh[k] = stored[k];
    // Aufräumen: alte Einträge droppen, damit der Blob nicht mit Kacheln
    // von letzter Woche wächst.
    if (JSON.stringify(fresh) !== JSON.stringify(stored)) {
      localStorage.setItem(BONBON_LOCAL_CLAIMS_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch (e) { return {}; }
}

async function awardGameBonbons(gameId, correct, maxRounds) {
  const result = await callBonbonRPC('award_game_bonbons', {
    p_game_id: gameId, p_correct: correct, p_max_rounds: maxRounds
  });
  if (result && result.ok && !result.skipped) {
    window.__lastBonbonResult = { gameId, ...result };
    // Daily-Claim-Cache: In-Memory für die aktuelle Page + LocalStorage-Marker,
    // damit der Hub nach Navigation zurück den aktuellen Zustand sieht,
    // auch wenn der Hub-Boot-Fetch race-t.
    if (result.bonus > 0) {
      const today = getBerlinTodayIso();
      window.__bonbonDailyClaims = window.__bonbonDailyClaims || {};
      window.__bonbonDailyClaims[gameId] = today;
      _writeLocalDailyClaim(gameId, today);
    }
    // Cluster-Fortschritt refreshen (Hub-Anzeige, Bonbon-Modal)
    if (typeof window.refreshBonbonStatus === 'function') {
      window.refreshBonbonStatus();
    }
  }
  return result;
}

async function fetchDailyBonbonStatus() {
  const result = await callBonbonRPC('get_daily_bonbon_status', {});
  // Server-Antwort + lokale Marker (falls awardGameBonbons vor Navigation
  // nicht mehr ankam) mergen. Server hat Vorrang bei Konflikt.
  const today  = (result && result.ok) ? result.today : getBerlinTodayIso();
  const server = (result && result.ok) ? (result.claims || {}) : {};
  const local  = _readLocalDailyClaims(today);
  window.__bonbonDailyClaims = { ...local, ...server };
  window.__bonbonToday       = today;
  return result;
}

async function resetDailyBonbonClaims() {
  const result = await callBonbonRPC('reset_daily_bonbon_claims', {});
  if (result && result.ok) {
    window.__bonbonDailyClaims = {};
    try { localStorage.removeItem(BONBON_LOCAL_CLAIMS_KEY); } catch (e) {}
  }
  return result;
}

async function giftBonbonsToPeer(amount) {
  const result = await callBonbonRPC('gift_bonbons_to_peer', {
    p_amount: amount ?? 20
  });
  if (result && result.ok && typeof window.refreshBonbonStatus === 'function') {
    window.refreshBonbonStatus();
  }
  return result;
}

window.awardGameBonbons        = awardGameBonbons;
window.renderBonbonBank        = renderBonbonBank;
window.fetchDailyBonbonStatus  = fetchDailyBonbonStatus;
window.resetDailyBonbonClaims  = resetDailyBonbonClaims;
window.giftBonbonsToPeer       = giftBonbonsToPeer;

/* Bequemer One-Shot-Helper für Spiele: nach renderCoinBank aufrufen.
   Rendert die Bonbon-Anzeige in den Bonbon-Slot, den renderCoinBank
   automatisch neben sich angelegt hat. Fehler werden geschluckt.

   Games übergeben ihre native (correct, maxRounds) — dieser Helper
   normalisiert auf die 0-10-hubPoints-Skala, weil der Server nur
   maxRounds ∈ [1, 20] akzeptiert. Fokusflow (max=1000) o.ä. würden
   sonst am Server-Bounds-Check scheitern. */
async function awardBonbonsAndRender(gameId, correct, maxRounds, coinContainerId) {
  try {
    let normCorrect = Math.max(0, Math.min(correct || 0, maxRounds || 1));
    let normMax     = Math.max(1, maxRounds || 1);
    if (normMax > 20) {
      // Auf 0-10 downscalen (hubPoints-Standard aller Games).
      normCorrect = Math.min(10, Math.round(normCorrect / normMax * 10));
      normMax     = 10;
    }
    const result = await awardGameBonbons(gameId, normCorrect, normMax);
    if (!result || !result.ok) return;
    renderBonbonBank(coinContainerId + '-bonbons', result);
  } catch (e) {
    console.warn('[creatures] awardBonbonsAndRender failed:', e.message);
  }
}
window.awardBonbonsAndRender = awardBonbonsAndRender;

/* Beim Hub-Boot: Server-State holen und lokal überschreiben.
   Merged wird server-seitig — hier kommt fertig gemergter Blob rein. */
async function loadServerShop() {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) return;

  // Falls lokal noch ungesicherte Änderungen liegen: erst pushen,
  // damit sie in den Merge einfließen bevor wir überschreiben.
  if (isShopDirty()) {
    try {
      const local = loadShopData();
      const merged = await syncShopStateToServer(local);
      clearShopDirty();
      if (merged) { applyMergedShopState(merged); return; }
    } catch (e) {
      console.warn('[creatures] pending shop push failed:', e.message);
      // Weiter mit reinem Load — Marker bleibt für nächsten Versuch.
    }
  }

  try {
    const url = `${window.SUPABASE_URL}/rest/v1/rpc/load_shop_state`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
    if (!res.ok) throw new Error(`load_shop_state ${res.status}`);
    const result = await res.json();
    if (!result?.ok) throw new Error(`RPC ${result?.error || 'unknown'}`);
    const state = result.state || {};
    if (Object.keys(state).length === 0) {
      // Server hat noch nichts → erster Sync bringt den lokalen Stand hoch.
      const local = loadShopData();
      try {
        const merged = await syncShopStateToServer(local);
        if (merged) applyMergedShopState(merged);
      } catch (e) {
        console.warn('[creatures] initial shop push failed:', e.message);
      }
      return;
    }
    applyMergedShopState(state);
    console.log('[creatures] shop-state geladen');
  } catch (e) {
    console.warn('[creatures] loadServerShop failed:', e.message);
  }
}

/* Schreibt den Server-Merge-Output in den lokalen Shop-Blob.
   Ruft NICHT saveShopData → sonst rekursiver Sync-Loop.
   Löscht Dirty-Marker, weil der Zustand jetzt server-authoritativ ist.
   Spiegelt zusätzlich nest.hatched → lernwelt_v3[nestId] zurück, damit
   die vielen Direktzugriffe auf allData[nestId] weiter funktionieren.  */
function applyMergedShopState(merged) {
  saveStorage(SHOP_KEY, merged);
  clearShopDirty();

  // Avatar-Unlock-Timestamps: wenn Server noch keine hat, bootstrappen —
  // Legacy-localStorage übernehmen, Rest backdatiert (0 = nie NEW).
  // Verhindert das "alle Avatare blinken NEU nach Login"-Symptom.
  try {
    const serverStamps = merged.avatarUnlocks;
    const needsBootstrap = !serverStamps || Object.keys(serverStamps).length === 0;
    let stamps = { ...(serverStamps || {}) };
    if (needsBootstrap) {
      try {
        const raw = localStorage.getItem('lernwelt_avatar_unlocks');
        if (raw) {
          const legacy = JSON.parse(raw) || {};
          for (const k in legacy) {
            if (stamps[k] == null) stamps[k] = legacy[k];
          }
        }
      } catch (e) {}
      if (window.computeUnlockedAvatarIds) {
        for (const id of window.computeUnlockedAvatarIds()) {
          if (stamps[id] == null) stamps[id] = 0;
        }
      }
      merged.avatarUnlocks = stamps;
      saveStorage(SHOP_KEY, merged);
      // Bootstrap zum Server pushen, damit Zweit-Geräte denselben Stand sehen.
      if (window.isLoggedIn?.() && Object.keys(stamps).length > 0) {
        syncShopStateToServer(merged).catch(e =>
          console.warn('[creatures] avatarUnlocks bootstrap push failed:', e.message));
      }
    }
    // Legacy-Key spiegeln — Landing/profil.html lesen ohne Shop-Sync von dort.
    try {
      localStorage.setItem('lernwelt_avatar_unlocks',
        JSON.stringify(merged.avatarUnlocks || {}));
    } catch (e) {}
  } catch (e) {
    console.warn('[creatures] avatarUnlocks handling failed:', e.message);
  }

  try {
    const nests = Array.isArray(merged?.nests) ? merged.nests : [];
    if (nests.length === 0) return;
    const all = loadStorage(STORAGE_KEY);
    let changed = false;
    for (const n of nests) {
      if (!n?.nestId || !n.hatched) continue;
      const local = all[n.nestId];
      // Reset-Schutz: gameId=null + lokal existiert = User hat gerade
      // zurückgesetzt. Nicht überschreiben, sonst kehrt die alte Kreatur
      // nach jedem Sync zurück. Auf einem frischen Zweit-Gerät (local
      // fehlt) darf der Server-Wert dagegen rüber — Migration 0026 stellt
      // sicher, dass hatched.growth nach Reset auf 0 steht.
      if (!n.gameId && local) continue;
      // Server gewinnt nur, wenn er mindestens gleichauf ist — verhindert,
      // dass lokal frischer, noch nicht gepushter Fortschritt geplättet wird.
      const localGrowth = local?.growth ?? -1;
      const serverGrowth = n.hatched.growth ?? 0;
      if (!local || serverGrowth >= localGrowth) {
        all[n.nestId] = {
          points:       n.hatched.points       ?? 0,
          roundsPlayed: n.hatched.roundsPlayed ?? 0,
          creature:     n.hatched.creature     ?? null,
          growth:       n.hatched.growth       ?? 0,
          coins:        n.hatched.coins        ?? 0
        };
        changed = true;
      }
    }
    if (changed) saveStorage(STORAGE_KEY, all);
  } catch (e) { console.warn('[creatures] nest hatched restore failed:', e.message); }
}

/* Boot-Sync für Einhornkatze-Task-Gifts. Befüllt window.__giftTasks als
   Objekt { [task_key]: {giver_id, giver_display_name, sent_at, accepted_at} }
   für den aktuellen User im aktuellen Cluster. Auf Task-Key-Basis
   normalisiert, weil pro (user, cluster, task) höchstens ein Gift existiert. */
async function loadGiftTasks() {
  window.__giftTasks = window.__giftTasks || {};
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) return;
  try {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/get_my_gift_tasks`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
    if (!res.ok) throw new Error(`get_my_gift_tasks ${res.status}`);
    const result = await res.json();
    if (!result?.ok) throw new Error(`RPC ${result?.error || 'unknown'}`);
    const map = {};
    for (const t of (result.tasks || [])) {
      if (!t?.task_key) continue;
      map[t.task_key] = {
        giver_id:           t.giver_id,
        giver_display_name: t.giver_display_name,
        sent_at:            t.sent_at,
        accepted_at:        t.accepted_at
      };
    }
    window.__giftTasks = map;
  } catch (e) {
    console.warn('[creatures] loadGiftTasks failed:', e.message);
  }
}

/* Boot-Sync für Task-3 „Gemeinsam siegen". Setzt window.__winTaskReady
   auf true, wenn der Cluster alle 25 Monster hat und der User selbst
   noch nicht geclaimt hat — dann pulsiert die Legi-Kachel im Hub. */
async function loadWinTaskStatus() {
  window.__winTaskReady = false;
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) return;
  try {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/get_cluster_creature_collection`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
    if (!res.ok) throw new Error(`get_cluster_creature_collection ${res.status}`);
    const result = await res.json();
    if (!result?.ok) return;
    window.__winTaskReady = !!result.has_all_creatures && !result.already_claimed;
  } catch (e) {
    console.warn('[creatures] loadWinTaskStatus failed:', e.message);
  }
}
window.loadWinTaskStatus = loadWinTaskStatus;

function renderBoostIndicators(containerId, gameId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const sd = loadShopData();
  const items = [];
  if (sd.wachstumsBooster) items.push({ icon: '⚡', title: 'Wachstums-Booster aktiv' });
  if (sd.coinsx3)          items.push({ icon: '🎰', title: 'Coins ×3 aktiv' });
  if (sd.glucksklee)       items.push({ icon: '🍀', title: 'Glücksklee aktiv' });
  if (sd.lockmittel)       items.push({ icon: '🧲', title: 'Lockmittel aktiv' });

  let bonusHtml = '';
  if (gameId) {
    const gd = getGameData(gameId);
    if (gd && gd.creature) {
      const bonus = getGrowthBonusCoins(gd.growth || 0);
      if (bonus > 0) {
        const title = bonus === 10
          ? 'Vollendungs-Bonus: +10 Münzen pro Runde'
          : 'Ausgewachsen-Bonus: +5 Münzen pro Runde';
        bonusHtml = `<span class="bonus-coin-badge" title="${title}">+${bonus}<span class="bonus-coin-badge__coin">🪙</span></span>`;
      }
    }
  }

  el.innerHTML = items.map(i => `<span class="boost-badge" title="${i.title}">${i.icon}</span>`).join('') + bonusHtml;
}

function spawnLevelUpParticles(anchor) {
  const count = 14;
  const rect  = anchor.getBoundingClientRect();
  const cx    = rect.left + rect.width  / 2;
  const cy    = rect.top  + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'levelup-particle';
    const angle = (360 / count) * i;
    const dist  = 60 + Math.random() * 50;
    p.style.setProperty('--angle', angle + 'deg');
    p.style.setProperty('--dist',  dist  + 'px');
    p.style.left = cx + 'px';
    p.style.top  = cy + 'px';
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}


/* ─── Highscore-Sync (Best-Score pro Spiel in DB) ─────────────
   Von den einzelnen Games genutzt, damit persönliche Bestwerte
   Cross-Device bleiben und im Leaderboard auftauchen.

   pullHighscore(gameId) → int (aus DB, oder 0 wenn Gast/kein Score)
   pushHighscore(gameId, score) → fire-and-forget, kein Fehler wenn Gast */
async function pullHighscore(gameId) {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return 0;
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) return 0;
  try {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/get_my_highscore`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_game_id: gameId })
    });
    if (!res.ok) throw new Error(`get_my_highscore ${res.status}`);
    const result = await res.json();
    if (!result?.ok) return 0;
    return Number(result.best_score) || 0;
  } catch (e) {
    console.warn('[creatures] pullHighscore failed:', e.message);
    return 0;
  }
}

async function pushHighscore(gameId, score) {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) return;
  const s = Math.max(0, Math.floor(Number(score) || 0));
  try {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/upsert_highscore`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_game_id: gameId, p_score: s })
    });
    if (!res.ok) throw new Error(`upsert_highscore ${res.status}`);
  } catch (e) {
    console.warn('[creatures] pushHighscore failed:', e.message);
  }
}

window.pullHighscore = pullHighscore;
window.pushHighscore = pushHighscore;


/* ─── Highscore-Bridge Hub ↔ localStorage ↔ DB ────────────────
   Die Games (FokusFlow, Algorithm, 10-Finger) laden kein
   session.js und können nicht direkt mit der DB reden. Sie
   schreiben ihre Bestwerte in localStorage. Der Hub übernimmt
   die Cross-Device-Synchronisation:

     Boot / Login  → DB → localStorage  (damit Games den globalen
                                          Bestwert sehen)
     Rückkehr Game → localStorage → DB  (falls im Game verbessert)

   Merge = GREATEST auf beiden Seiten (Server macht upsert-MAX,
   Client vergleicht selbst gegen alten localStorage-Wert). */
const HIGHSCORE_LOCAL_KEYS = {
  game9:  'fokusflow_highscore',
  game11: 'tippturbo_hs'
};
// Algorithm nutzt loadStorage/saveStorage (base64 + Prüfsumme).
// Wir lesen/schreiben denselben Kanal, sonst matcht das Format nicht.
function readAlgBestTime() {
  const d = loadStorage('algorithm_hs_v1');
  return Number(d.bestTime || 0);
}
function writeAlgBestTime(minutes) {
  const d = loadStorage('algorithm_hs_v1');
  const m = Number(minutes) || 0;
  if (m > Number(d.bestTime || 0)) {
    d.bestTime = m;
    // Score-Feld analog rekonstruieren, damit die Endless-Freischaltung stimmt
    const derived = Math.max(0, Math.floor((m - 120) / 60));
    if (derived > Number(d.highscore || 0)) d.highscore = derived;
    saveStorage('algorithm_hs_v1', d);
  }
}

function readLocalHighscore(gameId) {
  if (gameId === 'game10') return readAlgBestTime();
  const key = HIGHSCORE_LOCAL_KEYS[gameId];
  if (!key) return 0;
  try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; }
  catch(e) { return 0; }
}
function writeLocalHighscore(gameId, score) {
  if (gameId === 'game10') { writeAlgBestTime(score); return; }
  const key = HIGHSCORE_LOCAL_KEYS[gameId];
  if (!key) return;
  try {
    const cur = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    if (score > cur) localStorage.setItem(key, String(score));
  } catch(e) {}
}

async function syncHighscores() {
  if (typeof window.isLoggedIn !== 'function' || !window.isLoggedIn()) return;
  const gameIds = ['game9', 'game10', 'game11'];
  for (const gid of gameIds) {
    try {
      const server = await pullHighscore(gid);
      const local  = readLocalHighscore(gid);
      if (server > local) writeLocalHighscore(gid, server);
      const best = Math.max(server, local);
      if (best > server) await pushHighscore(gid, best);
    } catch (e) {
      console.warn('[creatures] syncHighscores', gid, 'failed:', e.message);
    }
  }
}

window.syncHighscores = syncHighscores;
