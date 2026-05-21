/* ═══════════════════════════════════════════════════════════════
   LERNWELT – creatures.js
   Gemeinsame Kreatur/Ei/Speicher-Logik für alle Spiele.
   Vor dem Laden dieser Datei kann window.CREATURE_IMAGE_BASE gesetzt werden.
   Standard: 'data/' (für root-level Seiten).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

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
const GROWTH_THRESHOLDS = [0, 3, 7, 12, 21]; // 0%, 30%, 70%, 120%, 210% einer Max-Runde (10 Pkt)
const GROWTH_STAGES     = 5;
const GROWTH_MAX        = 21;                 // ab hier → Coins statt Wachstum

/* ─── Seltene Tiere (Season Rares) ─── */
const RARE_CREATURES = new Set(['biene', 'oktopus', 'ente']);
function isRare(creature) { return RARE_CREATURES.has(creature); }

/* Welches Season-Rare droppen kann bei welchem Spiel */
const GAME_SEASON_RARE = {
  game1:'biene', game3:'biene', game7:'biene', game8:'biene',
  game5:'oktopus', game9:'oktopus', game10:'oktopus', game11:'oktopus',
  game6:'ente', game12:'ente', game13:'ente', game14:'ente',
};

/* ─── Epische Tiere ─── */
const EPIC_CREATURES = new Set(['snaildragon', 'butterfly', 'turtle']);
function isEpic(creature) { return EPIC_CREATURES.has(creature); }

/* ─── Legendäre Tiere (neue Klasse, noch nicht durch normalen Weg erhältlich) ─── */
const LEGENDARY_CREATURES = new Set(['robot', 'pfau']);
function isLegendary(creature) { return LEGENDARY_CREATURES.has(creature); }
function isPfau(creature) { return creature === 'pfau'; }

/* ─── Tier-Bestimmung (Eingabe: 0–10 normalisierter Score) ─── */
function determineCreature(correct, isFirst = false, gameId = null) {
  // Epische Tiere – immer möglich, Score-abhängig
  if (correct >= 9 && Math.random() < 0.05) return 'turtle';
  if (correct <= 2 && Math.random() < 0.05) return 'butterfly';

  // Schneckendrache – selten, unabhängig vom Rang
  const epicChance = (correct <= 2 || correct === 10) ? 9 : 4;
  if (Math.random() * 100 < epicChance) return 'snaildragon';

  // Season Rare – 8 % Chance wenn das Spiel einer Season angehört
  const seasonRare = gameId && GAME_SEASON_RARE[gameId];
  if (seasonRare && Math.random() < 0.08) return seasonRare;

  if (correct === 10) return 'dragon';
  if (correct === 9)  return 'triceratops';
  if (correct === 8)  return 'falkeneule';
  if (correct === 7)  return 'salamander';
  if (correct >= 5)   return 'chicken';
  if (correct >= 3)   return 'fish';
  return 'snail';
}

function determineEpicCreature() {
  const r = Math.random();
  if (r < 0.4) return 'butterfly';
  if (r < 0.8) return 'snaildragon';
  return 'turtle';
}

/* Glücksklee: Epic-Chance = (20 + correct×3) %, Rare-Chance erhöht auf 15 % */
function determineCreatureWithGlucksklee(correct, gameId = null) {
  const chance = (20 + correct * 3) / 100;
  if (Math.random() < chance) return determineEpicCreature();
  // Season Rare mit erhöhter Chance; gameId=null verhindert Doppel-Check in determineCreature
  const seasonRare = gameId && GAME_SEASON_RARE[gameId];
  if (seasonRare && Math.random() < 0.15) return seasonRare;
  return determineCreature(correct, false, null);
}

function determineEggCreature(eggType, correct) {
  if (eggType === 'atari') return 'robot';
  if (eggType === 'pfau')  return 'pfau';
  const legendaryChance = { rare: 0.3, mythic: 0.6, legendary: 1.0 }[eggType] ?? 0;
  if (Math.random() < legendaryChance) return determineEpicCreature();
  const normals = ['snail', 'fish', 'chicken', 'salamander', 'falkeneule', 'triceratops', 'dragon'];
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
};

const GROWTH_LABELS = ['Winzig', 'Klein', 'Mittel', 'Groß', 'Ausgewachsen'];

const CREATURE_DESCRIPTIONS = {
  snail: [
    'Eine tapfere kleine Schnecke schlüpft aus dem Ei!',
    'Deine Schnecke wächst – das Gehäuse wird sichtbar.',
    'Das Gehäuse glänzt – deine Schnecke wird kräftiger!',
    'Eine beeindruckende Schnecke mit leuchtendem Gehäuse.',
    'Eine majestätische ausgewachsene Schnecke. Langsam aber weise!'
  ],
  fish: [
    'Ein kleiner Fisch springt ins Abenteuer!',
    'Dein Fisch wird bunter und wendiger.',
    'Dein Fisch wird kräftiger und bunter.',
    'Ein starker Fisch – schnell und furchtlos.',
    'Ein prächtiger Kampffisch – unaufhaltsam!'
  ],
  chicken: [
    'Ein flauschiges Küken piept sich frei!',
    'Dein Küken bekommt erste Federn.',
    'Dein Küken entwickelt sich zum Huhn.',
    'Ein stattliches Huhn mit prächtigem Kamm.',
    'Ein stolzer Hahn – laut, bunt und mutig!'
  ],
  salamander: [
    'Ein buntes Kriechtier lugt neugierig aus der Schale!',
    'Dein kleines Kriechtier streckt die Beinchen.',
    'Dein Kriechtier wächst – kräftig und auffällig gemustert. Was wird daraus?',
    'Ein mächtiges Tier – flink, gefürchtet und unverkennbar: ein Salamander!',
    'Ein legendärer Riesensalamander – nichts bleibt ihm verborgen!'
  ],
  falkeneule: [
    'Ein Greifvogel-Küken späht neugierig aus der Schale!',
    'Dein junger Greifvogel übt das lautlose Flattern.',
    'Dein Greifvogel streckt mächtige Schwingen aus – etwas Besonderes zeichnet sich ab.',
    'Dein Greifvogel gleitet lautlos durch die Nacht – eine Falkeneule!',
    'Eine majestätische Falkeneule – scharfe Augen, lautloser Flug!'
  ],
  triceratops: [
    'Ein winziger Dino wackelt auf die Welt!',
    'Dein Dino zeigt erste kleine Auswüchse auf der Stirn.',
    'Dein Dino wächst – am Kopf bildet sich etwas Mächtiges.',
    'Ein gewaltiger Triceratops – niemand stellt sich ihm entgegen.',
    'Ein urgewaltiger Triceratops – nichts hält ihn auf!'
  ],
  dragon: [
    'Ein legendärer Drache schlüpft – unglaublich!',
    'Dein Drache speit erste Fünkchen.',
    'Dein Drache entfaltet seine Flügel und speit erste Flammen.',
    'Dein Drache wächst zu einer mächtigen Kreatur heran.',
    'Ein LEGENDÄRER Drache in voller Pracht – du bist perfekt!'
  ],
  snaildragon: [
    'Etwas unglaublich Seltenes schlüpft – was ist das?!',
    'Das Wesen rollt sich heraus… schwer zu sagen, was das ist.',
    'Ein Gehäuse… und sind das Flügel? Dieses Wesen ist ein Rätsel.',
    'Könnte das… ein gepanzerter Feuerspucker sein? Unvorstellbar…',
    'Ein LEGENDÄRER Schneckendrache – das Wunder aller Lernwelten!'
  ],
  butterfly: [
    'Eine winzige Raupe schlüpft aus dem Ei – welches Wunder wartet darin?',
    'Die Raupe spinnt sich in einen leuchtenden Kokon ein.',
    'Der Kokon pulsiert und glitzert – bald enthüllt er sein Geheimnis!',
    'Ein legendärer Schmetterling entfaltet schimmernde Schwingen!',
    'Ein LEGENDÄRER Schmetterling in voller Pracht – ein Wunder der Lernwelt!'
  ],
  turtle: [
    'Eine winzige Schildkröte schlüpft – ihr Panzer glitzert geheimnisvoll!',
    'Deine Schildkröte streckt neugierig den Kopf heraus.',
    'Ihr Panzer beginnt zu leuchten – sie ist keine gewöhnliche Schildkröte!',
    'Eine mächtige Urzeit-Schildkröte – weise und nahezu unbesiegbar.',
    'Eine LEGENDÄRE Riesen-Schildkröte – sie trägt die Welt auf ihrem Rücken!'
  ],
  robot: [
    'Ein verbotenes Signal erwacht. Niemand sollte das sehen…',
    'Rote Augen leuchten in der Dunkelheit. Systeme initialisieren.',
    'Atari-1337 lernt. Schnell. Zu schnell. Das gesamte Netz zittert.',
    'WARNUNG: Unkontrolliertes System erkannt. Alle Firewalls gefallen.',
    'Atari-1337 in voller Entfaltung – eine KI ohne Grenzen, ohne Gesetze. Du hast das Unmögliche getan!'
  ],
  pfau: [
    'Ein schillerndes Ei leuchtet in allen Farben – etwas Unglaubliches schlüpft!',
    'Ein winziger Pfau reckt stolz seinen Kopf – die erste Feder schimmert wie ein Regenbogen.',
    'Das Gefieder öffnet sich langsam – hundert Farben explodieren wie lebendiges Licht.',
    'Ein prächtiger Pfau schreitet durch deine Welt, sein Rad in voller Pracht entfaltet.',
    'Ein LEGENDÄRER Pfau – die Krönung aller Lernwelten. Unsterblich, unvergleichlich, einzigartig!'
  ],
  biene: [
    'Eine winzige Biene summt sich aus der Schale – das Seltene erwacht!',
    'Deine Biene streckt die zarten Flügel – erster Honig liegt in der Luft.',
    'Die Biene wird kräftiger, ihr Pelz glänzt golden im Licht.',
    'Eine fleißige Meisterbiene – unermüdlich, präzise, kaum zu stoppen.',
    'Eine SELTENE Königsbiene – Herrscherin ihres Volkes und der Lernwelt!'
  ],
  oktopus: [
    'Acht kleine Tentakel tasten sich aus dem Ei – das Seltene schlüpft!',
    'Dein Oktopus wechselt schon die Farbe – neugierig erkundet er die Welt.',
    'Die Tentakel werden kräftiger, der Blick klüger. Dieser Oktopus ist kein gewöhnlicher.',
    'Ein mächtiger Tiefsee-Oktopus – weise, anpassungsfähig, ungreifbar.',
    'Ein SELTENER Riesen-Oktopus – sein Verstand ist grenzenlos, seine Arme endlos!'
  ],
  ente: [
    'Ein watschelndes Küken quakt sich frei – das Seltene ist da!',
    'Deine Ente planscht vergnügt – die ersten Federn glitzern blau.',
    'Die Ente wächst – ihr Gefieder leuchtet in sattem Blau und Smaragdgrün.',
    'Eine stolze Ente streift übers Wasser – unbeeindruckt von allem.',
    'Eine SELTENE Prachtente – majestätisch, unverwechselbar, absolut unbeeindruckt!'
  ],
};

const CREATURE_IMAGES = {
  snail:       ['Schnecke1',       'Schnecke2',       'Schnecke3',       'Schnecke4',       'Schnecke5'      ],
  fish:        ['Fisch1',          'Fisch2',          'Fisch3',          'Fisch4',          'Fisch5'         ],
  chicken:     ['huhn1',           'huhn2',           'huhn3',           'huhn4',           'huhn5'          ],
  salamander:  ['Salamander1',     'Salamander2',     'Salamander3',     'Salamander4',     'Salamander5'    ],
  falkeneule:  ['Falkeneule1',     'Falkeneule2',     'Falkeneule3',     'Falkeneule4',     'Falkeneule5'    ],
  triceratops: ['Triceratops1',    'Triceratops2',    'Triceratops3',    'Triceratops4',    'Triceratops5'   ],
  dragon:      ['drache1',         'drache2',         'drache3',         'drache4',         'drache5'        ],
  snaildragon: ['Schneckendrache1','Schneckendrache2','Schneckendrache3','Schneckendrache4','Schneckendrache5'],
  butterfly:   ['Schmetterling1',  'Schmetterling2',  'Schmetterling3',  'Schmetterling4',  'Schmetterling5'  ],
  turtle:      ['Schildkröte1',    'Schildkröte2',    'Schildkröte3',    'Schildkröte4',    'Schildkröte5'    ],
  robot:       ['AI1',             'AI2',             'AI3',             'AI4',             'AI5'             ],
  pfau:        ['Pfau1',           'Pfau2',           'Pfau3',           'Pfau4',           'Pfau5'           ],
  biene:       ['Biene1',          'Biene2',          'Biene3',          'Biene4',          'Biene5'          ],
  oktopus:     ['Oktopus1',        'Oktopus2',        'Oktopus3',        'Oktopus4',        'Oktopus5'        ],
  ente:        ['Ente1',           'Ente2',           'Ente3',           'Ente4',           'Ente5'           ],
};

function getCreatureHTML(creature, stage) {
  const base = (window.CREATURE_IMAGE_BASE !== undefined) ? window.CREATURE_IMAGE_BASE : 'data/';
  const s    = Math.max(0, Math.min(stage ?? 0, GROWTH_STAGES - 1));
  const key  = CREATURE_IMAGES[creature]?.[s] ?? 'drache1';
  const alt  = CREATURE_NAMES[creature] ?? creature;
  const img  = `<img src="${base}${key}.png" alt="${alt}" class="creature-img" data-stage="${s}">`;
  if (isPfau(creature)) {
    return `<div class="pfau-frame">${img}</div>`;
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

/* Berechnet Coins und Wachstum für eine abgeschlossene Runde (nicht Runde 1).
   Mutiert data.growth und data.coins direkt. Gibt coinsGained zurück.
   Booster/coinsx3 werden hier geprüft aber NICHT gecleart – das macht der Aufrufer. */
function computeRoundResult(data, correct, maxPoints, sd) {
  const baseContribution = computeSessionGrowth(correct, maxPoints);
  let contribution = baseContribution;
  const alreadyMaxed = data.growth >= GROWTH_MAX;

  if (!alreadyMaxed && sd.wachstumsBooster) contribution *= 2;

  let coinsGained = 0;
  if (alreadyMaxed) {
    coinsGained = Math.round(contribution);
    if (sd.coinsx3) coinsGained *= 3;
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

  data.coins = (data.coins || 0) + coinsGained;
  return coinsGained;
}

/* ─── Local Storage ─── */
const STORAGE_KEY = 'lernwelt_v3';

function defaultGameData() {
  return { points: 0, roundsPlayed: 0, creature: null, growth: 0, coins: 0 };
}

function getGameData(id) {
  try {
    const raw  = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data[id] || defaultGameData();
  } catch(e) { return defaultGameData(); }
}

function saveGameData(id, gd) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[id] = gd;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch(e) {}
}

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
    const raw = localStorage.getItem(SHOP_KEY);
    const d   = raw ? JSON.parse(raw) : {};
    // toCount: migrate old boolean flags (true→1, false→0) to numeric inventory counts
    const toCount = (val, countField) => countField !== undefined ? countField : (val ? 1 : 0);
    return {
      spentCoins:            d.spentCoins            ?? 0,
      purchased:             d.purchased             ?? [],
      wachstumstrank:        d.wachstumstrank        ?? false,
      wachstumstrankCount:   d.wachstumstrankCount   ?? 0,
      // bool = "active for the next game" (set when Nutzen is clicked, cleared after use)
      wachstumsBooster:      d.wachstumsBoosterCount !== undefined ? !!(d.wachstumsBooster) : false,
      wachstumsBoosterCount: toCount(d.wachstumsBooster, d.wachstumsBoosterCount),
      coinsx3:               d.coinsx3Count          !== undefined ? !!(d.coinsx3)          : false,
      coinsx3Count:          toCount(d.coinsx3, d.coinsx3Count),
      glucksklee:            d.gluckskleeCount       !== undefined ? !!(d.glucksklee)        : false,
      gluckskleeCount:       toCount(d.glucksklee, d.gluckskleeCount),
      nests:                 d.nests                 ?? [],
      pendingEggNestId:      d.pendingEggNestId      ?? null,
      seenCreatures:         d.seenCreatures         ?? {},
      hackUnlocked:          d.hackUnlocked          ?? false,
      atariNumber:           d.atariNumber           ?? null,
      atariSolved:           d.atariSolved           ?? false,
      atariThemeShown:       d.atariThemeShown       ?? false,
      pfauEggGranted:        d.pfauEggGranted        ?? false,
    };
  } catch(e) {
    return { spentCoins: 0, purchased: [], wachstumstrank: false, wachstumstrankCount: 0, wachstumsBooster: false, wachstumsBoosterCount: 0, coinsx3: false, coinsx3Count: 0, glucksklee: false, gluckskleeCount: 0, nests: [], pendingEggNestId: null, seenCreatures: {}, hackUnlocked: false, atariNumber: null, atariSolved: false, atariThemeShown: false, pfauEggGranted: false };
  }
}

/* Gibt zurück welches Item für diesen Slot nutzbar ist (und ob eins im Besitz ist).
   Ei → Glücksklee, Jungtier → Wachstums-Booster, Ausgewachsen → Coins ×3 */
function getActiveItemForSlot(data, sd) {
  if (!sd) sd = loadShopData();
  if (!data || !data.creature) {
    if (sd.gluckskleeCount > 0) return { id: 'glucksklee', icon: '🍀', name: 'Glücksklee', countKey: 'gluckskleeCount' };
  } else if (data.growth >= GROWTH_MAX) {
    if (sd.coinsx3Count > 0) return { id: 'coinsx3', icon: '🎰', name: 'Coins ×3', countKey: 'coinsx3Count' };
  } else {
    if (sd.wachstumsBoosterCount > 0) return { id: 'wachstumsBooster', icon: '⚡', name: 'Wachstums-Booster', countKey: 'wachstumsBoosterCount' };
  }
  return null;
}

/* ─── Münzbank (wird nach jedem Spiel auf dem Ergebnis-Screen gezeigt) ─── */
function getTotalCoinsGlobal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
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

/* Rendert den Item-Nutzen-Button auf dem Ergebnis-Screen.
   containerId: ID des Containers im HTML; gameId: der aktuelle Spiel-Slot.
   onActivate: optionaler Callback statt window.location.reload() (z.B. für Quiz-Spiele). */
function renderResultItemButton(containerId, gameId, onActivate) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const data = getGameData(gameId);
  const item = getActiveItemForSlot(data);
  if (!item) return;
  const btn = document.createElement('button');
  btn.className = 'btn-use-item';
  btn.textContent = 'nutze ' + item.icon;
  btn.addEventListener('click', () => {
    const sd = loadShopData();
    if ((sd[item.countKey] ?? 0) <= 0) return;
    sd[item.countKey]--;
    sd[item.id] = true;
    saveShopData(sd);
    if (typeof onActivate === 'function') onActivate();
    else window.location.reload();
  });
  el.appendChild(btn);
}

function saveShopData(data) {
  try { localStorage.setItem(SHOP_KEY, JSON.stringify(data)); } catch(e) {}
}

function renderBoostIndicators(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const sd = loadShopData();
  const items = [];
  if (sd.wachstumsBooster) items.push({ icon: '⚡', title: 'Wachstums-Booster aktiv' });
  if (sd.coinsx3)          items.push({ icon: '🎰', title: 'Coins ×3 aktiv' });
  if (sd.glucksklee)       items.push({ icon: '🍀', title: 'Glücksklee aktiv' });
  el.innerHTML = items.map(i => `<span class="boost-badge" title="${i.title}">${i.icon}</span>`).join('');
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
