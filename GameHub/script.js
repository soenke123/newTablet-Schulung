/* ═══════════════════════════════════════════════════════════════
   LERNWELT – script.js
   Nur Hub-Logik. Kreatur/Ei/Speicher-Logik → creatures.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────
   ZUGRIFFSKONTROLLE (geladen aus config.json)
   ───────────────────────────────────────────────── */
if (typeof GAME_ACCESS === 'undefined') window.GAME_ACCESS = {};
function loadUnlocked() { return window.getUnlocked ? window.getUnlocked() : []; }
function saveUnlocked(gameId) { if (window.setUnlocked) window.setUnlocked(gameId); }

async function hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
window.hashPassword = hashPassword;

function getGameAccess(gameId) {
  const game = GAMES_CONFIG.find(g => g.id === gameId);
  // Season 1 = öffentlicher Baseline (auch für Nicht-Eingeloggte spielbar).
  // Erst ab Season 2 gilt die Session-Season als Gate.
  if (game && game.season > 1 && game.season > getUserSeason()) return 'locked';
  // Cluster-Legi (Season 3): Bonbon-Ziel muss erreicht sein.
  // Drei-Zustände:
  //   - Cluster noch nicht unlocked → 'cluster_locked' (Sammel-Phase)
  //   - Cluster unlocked, User hat noch nicht geclaimed → 'ready_to_reveal' (Blink)
  //   - Cluster unlocked, User hat geclaimed (creature gesetzt) → fällt durch zu 'available'
  if (game && game.clusterLegi) {
    const status = window.__bonbonStatus;
    if (!status || !status.enabled || !status.unlocked) return 'cluster_locked';
    const gd = loadAllData()[gameId];
    if (!gd || !gd.creature) return 'ready_to_reveal';
  }
  const cfg = GAME_ACCESS[gameId];
  if (!cfg || cfg.status === 'available') return 'available';
  if (cfg.status === 'locked') return 'locked';
  if (cfg.status === 'password') return loadUnlocked().includes(gameId) ? 'available' : 'password';
  return 'available';
}

/* ─────────────────────────────────────────────────
   1. SPIEL-KONFIGURATION
   ───────────────────────────────────────────────── */
// Atari4 · Enter 9-0-4-3
const GAMES_CONFIG = [
  { id: 'game7', season: 1, title: 'Escape the Rules', icon: '🔐', url: 'S1 EscapeGame/index.html'       },
  { id: 'game3', season: 1, title: 'Daten-Quiz',       icon: '📁', url: 'S1 DateiformatQuiz/index.html'  },
  { id: 'game8', season: 1, title: 'Projekt_FINAL_v7_NEU',  icon: '🗂️', url: 'S1 Projekt_FINAL_v7_NEU/index.html'       },
  { id: 'game9',  season: 1, title: 'Fokusflow',        icon: '🎯', url: 'S1 Fokusflow/index.html'             },
  { id: 'game10', season: 1, title: 'The Algorithm',    icon: '⚙️', url: 'S1 The Algorithm/index.html'        },
  { id: 'game11', season: 1, title: 'Tip Turbo Kids',   icon: '⌨️', url: 'S1 10finger Blindschreiben/index.html' },
  { id: 'game12', season: 2, title: 'Quellen-Tinder',      icon: '🃏', url: 'S2 Quellen Tinder/index.html'      },
  { id: 'game15', season: 2, title: 'LLMaster',            icon: '💬', url: 'S2 LLMaster/index.html'             },
  { id: 'game14', season: 2, title: 'Reinforce Yourself!', icon: '🤖', url: 'S2 Reinforce Yourself!/index.html'  },
  { id: 'game16', season: 3, title: '???',                 icon: '🌈', url: 'S3 LegiTrainer/index.html', clusterLegi: true },
];

const SEASONS_CONFIG = [
  { id: 1, title: 'Season 1 – Regeln, Ordnung, Dateien & Aufmerksamkeit', desc: 'Diese Season knüpft an die Inhalte der ersten Tablet-Schulung an und bringt dein Wissen auf das nächste Level. In sechs spannenden Spielen sicherst und vertiefst du wichtige Grundlagen rund um die Tabletnutzung – von unseren Hausregeln über Dateiformate bis hin zur richtigen Struktur auf deinem Gerät. Und weil deine Aufmerksamkeit eine deiner wichtigsten Ressourcen ist, lernst du außerdem, bewusst mit ihr umzugehen: In zwei Aufmerksamkeitsspielen geht es um Fokus und das Binden von Aufmerksamkeit. Mit Tip Turbo Kids tauchst du zusätzlich in das 10-Finger-Blindschreiben ein – eine Fähigkeit, die dir das Schreiben längerer Texte enorm erleichtert und im Schulalltag wie auch später im Berufsleben unverzichtbar ist.' },
  { id: 2, title: 'Season 2 – LLM und Recherche',     desc: 'Welchen Quellen kannst du vertrauen – und wie erkennst du es? In dieser Season lernst du, Quellen zu bewerten und ihre Glaubwürdigkeit einzuschätzen. Du erforschst außerdem, wie Sprachmodelle wie ChatGPT funktionieren: Was passiert eigentlich unter der Haube – und warum verstehen KIs viel weniger, als es auf den ersten Blick scheint? Drei Spiele, ein Grundverständnis für das mächtigste Werkzeug unserer Zeit.' },
  { id: 3, title: 'Season 3 – Social Media und Folgen von KI', desc: 'Social Media prägt unseren Alltag mehr denn je – und KI verändert, was wir dort zu sehen bekommen. In dieser Season blickst du hinter die Kulissen: Wie funktionieren Empfehlungsalgorithmen und die kleinen Tricks der Plattformen, die uns zum Weiterscrollen bringen? Was macht generative KI mit Bildern, Texten und mit der Wahrheit? Und zum ersten Mal ist die Season kooperativ: Ihr sammelt als Kurs gemeinsam Regenbogen-Bonbons und schaltet damit ein legendäres Kreatur-Event frei, das nur euer Kurs zusammen erreichen kann. Vier neue Spiele – ein gemeinsames Ziel.' },
];

/* ─────────────────────────────────────────────────
   2. SHOP-KONFIGURATION (Items werden hier ergänzt)
   ───────────────────────────────────────────────── */
// Atari0 · Enter 7-3-9-1
const SHOP_ITEMS = [
  { id: 'wachstumstrank',   icon: '🧪', name: 'Wachstumstrank',    description: 'Gibt einem Tier deiner Wahl sofort +5 Wachstumspunkte.', price: 10, consumable: true },
  { id: 'wachstumsBooster', icon: '⚡', name: 'Wachstums-Booster', description: 'Im nächsten Spiel wächst dein Tier doppelt so schnell.',  price: 15, consumable: true },
  { id: 'coinsx3',          icon: '🎰', name: 'Coins ×3',          description: 'Im nächsten Spiel verdienst du dreimal so viele Münzen.', price: 15, consumable: true },
  { id: 'glucksklee',   icon: '🍀', name: 'Glücksklee',      description: 'Erhöht die Chance auf ein episches Tier um mindestens 20 %. Aber spiele gut – je mehr richtige Antworten, desto höher steigt sie!', price: 20, consumable: true },
  { id: 'buchDerMonster',   icon: '📜', name: 'Buch der Monster',  description: 'Enthüllt das Bestiarum der Lernwelt. Alle Wesen, die du je erblickt hast, werden darin verewigt.', price: 30, consumable: false, bookItem: true },
  { id: 'seltenesEi',   icon: '🥚', name: 'Seltenes Ei',    description: 'Öffnet einen neuen Kreatur-Slot. 30 % Chance auf ein episches Tier!',   price: 40,  eggItem: true, eggType: 'rare'      },
  { id: 'mythischesEi', icon: '🥚', name: 'Episches Ei',      description: 'Öffnet einen neuen Kreatur-Slot. 60 % Chance auf ein episches Tier!',   price: 80, eggItem: true, eggType: 'mythic'    },
  { id: 'legendaresEi', icon: '🥚', name: 'Legendäres Ei',   description: 'Öffnet einen neuen Kreatur-Slot. 100 % Chance auf ein episches Tier!',  price: 140, eggItem: true, eggType: 'legendary' },
  { id: 'atariHint', icon: '📡', name: 'Hinweis zum verlorenen Ei', description: 'Enthüllt die Spur einer verborgenen Kreatur. Nur für die Mutigen.', price: 200, consumable: false, atariHintItem: true },
];

// Atari2 · Enter 1-5-0-7
const CREATURE_ORDER = ['snail','fish','chicken','salamander','falkeneule','triceratops','dragon','butterfly','snaildragon','turtle','chamaeleon','robot','pfau','biene','oktopus','ente','frosch','pinguin','raptor','chinDrache','schnabeltier','krabbe','hai','libelle','hippogreif','einhornkatze'];
const S2_CREATURES   = new Set(['ente','chamaeleon','chinDrache','schnabeltier','frosch','pinguin','raptor']);
const S3_CREATURES   = new Set(['krabbe','hai','libelle','hippogreif','einhornkatze']);

/* Zukünftiges Kreatur-Paket – bald verfügbar (nur im Buch sichtbar wenn Season 2 offen) */
const S2_NORMALS   = [];
const S2_EPICS     = [];
const S2_LEGIES    = [];

/* Zukünftiges Kreatur-Paket – bald verfügbar (nur im Buch sichtbar wenn Season 3 offen) */
const S3_NORMALS   = [];
const S3_EPICS     = [];
const S3_LEGIES    = [];

const RELEASE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></svg>`;

const BOOK_NAMES = {
  snail:       'Tapfere Schnecke',
  fish:        'Wilder Fisch',
  chicken:     'Stolzer Hahn',
  salamander:  'Großer Salamander',
  falkeneule:  'Majestätische Falkeneule',
  triceratops: 'Mächtiger Triceratops',
  dragon:      'Mächtiger Drache',
  snaildragon: 'Epischer Schneckendrache',
  butterfly:   'Goldener Schmetterling',
  turtle:      'Goldene Schildkröte',
  robot:       'Atari-1337 — Verbotenes Protokoll',
  pfau:        'Legendärer Pfau — Krönung der Lernwelt',
  biene:       'Seltene Biene — Season 1',
  oktopus:     'Seltener Oktopus — Season 1',
  ente:        'Seltene Ente — Season 2',
  chamaeleon:   'Episches Chamäleon — Meister des Wandels',
  pinguin:      'Stolzer Kaiserpinguin',
  frosch:       'Prächtiger Riesenfrosch',
  raptor:       'Mächtiger Velociraptor',
  chinDrache:   'Legendärer Chinesischer Drache — Hüter des Himmels',
  schnabeltier: 'Legendäres Schnabeltier — Das Unmögliche',
  krabbe:       'Krabbe — Season 3',
  hai:          'Hai — Season 3',
  libelle:      'Seltene Libelle — Season 3',
  hippogreif:   'Epischer Hippogreif — Season 3',
  einhornkatze: 'Einhornkatze — Season 3 (Team-Legendär)',
};

/* ─────────────────────────────────────────────────
   3. GESEHENE KREATUREN TRACKEN
   ───────────────────────────────────────────────── */
function updateSeenCreatures(allData) {
  const sd = loadShopData();
  let changed = false;
  const now = Date.now();
  sd.avatarUnlocks = sd.avatarUnlocks || {};

  const check = (data) => {
    if (!data?.creature) return;
    const stage = getGrowthStage(data.growth);
    const prev  = sd.seenCreatures[data.creature] ?? -1;
    if (stage > prev) {
      sd.seenCreatures[data.creature] = stage;
      changed = true;

      // Neu freigeschaltete Avatare für diese Kreatur/Stufe stempeln.
      // Nur hier weiß der Client zuverlässig "Unlock passiert JETZT"
      // — deshalb ist das der einzige Ort, wo now() korrekt ist.
      // avatars.js verwendet 1-indizierte a.stage, seenCreatures 0-indiziert.
      if (window.AVATARS) {
        for (const a of window.AVATARS) {
          if (a.creature !== data.creature) continue;
          const idx = a.stage - 1;
          if (idx <= prev) continue;   // war schon vorher unlocked
          if (idx > stage) continue;   // ist noch nicht unlocked
          if (sd.avatarUnlocks[a.id] == null || sd.avatarUnlocks[a.id] === 0) {
            sd.avatarUnlocks[a.id] = now;
          }
        }
      }
    }
  };

  for (const g of GAMES_CONFIG)    check(allData[g.id]);
  for (const n of sd.nests)        check(allData[n.nestId]);
  if (changed) saveShopData(sd);
}

/* ─────────────────────────────────────────────────
   4. LOCAL STORAGE (Hub-Ebene: alle Spiele)
   ───────────────────────────────────────────────── */
// Atari6 · Enter 5-1-6-4
function getTotalCoins(allData) {
  let total = 0;
  for (const g of GAMES_CONFIG) total += allData[g.id]?.coins || 0;
  const sd = loadShopData();
  for (const n of sd.nests) total += allData[n.nestId]?.coins || 0;
  total += sd.bankedCoins || 0;
  return total;
}

function loadAllData() {
  try {
    const data = loadStorage(STORAGE_KEY);
    for (const g of GAMES_CONFIG) {
      if (!data[g.id]) data[g.id] = defaultGameData();
    }
    return data;
  } catch(e) { return {}; }
}

function saveAllData(data) {
  saveStorage(STORAGE_KEY, data);
}

/* ─────────────────────────────────────────────────
   5. HUB
   ───────────────────────────────────────────────── */
function refundAbandonedItems() {
  const sd = loadShopData();
  let changed = false;
  if (sd.wachstumstrank)   { sd.wachstumstrank = false;   sd.wachstumstrankCount   = (sd.wachstumstrankCount   || 0) + 1; changed = true; }
  if (sd.wachstumsBooster) { sd.wachstumsBooster = false; sd.wachstumsBoosterCount = (sd.wachstumsBoosterCount || 0) + 1; changed = true; }
  if (sd.coinsx3)           { sd.coinsx3 = false;           sd.coinsx3Count          = (sd.coinsx3Count || 0) + 1;           changed = true; }
  if (sd.glucksklee)        { sd.glucksklee = false;         sd.gluckskleeCount       = (sd.gluckskleeCount || 0) + 1;        changed = true; }
  if (sd.lockmittel)        { sd.lockmittel = false;         sd.lockmittelCount       = (sd.lockmittelCount || 0) + 1;        changed = true; }
  if (changed) saveShopData(sd);
}

function repairAtariEggState() {
  const sd = loadShopData();
  if (sd.atariSolved && !sd.nests.some(n => n.eggType === 'atari')) {
    const nestId = 'nest_atari_repair_' + Date.now();
    sd.nests.push({ nestId, eggType: 'atari', gameId: null, gameUrl: null });
    sd.pendingEggNestId = nestId;
    saveShopData(sd);
  }
}

// Atari1 · Enter 4-8-2-6
function renderHub() {
  refundAbandonedItems();
  repairAtariEggState();

  const allData  = loadAllData();
  const shopData = loadShopData();
  updateSeenCreatures(allData);
  checkPfauUnlock();

  renderGamesGrid(allData, shopData);
  renderGallery(allData);
  renderCoinDisplay(allData);
  renderNestSection(allData);
  renderSealedEggs();
  initGalleryWalk();
  applyThemeFromPreference(allData);
  _injectPfauThemeStyles();
  document.body.classList.toggle('s2-active', getUserSeason() >= 2);
  document.body.classList.toggle('s3-active', getUserSeason() >= 3);
  updateLootboxBlink();

  if (shopData.pendingEggNestId) enterPendingEggMode();
  else exitPendingEggMode();

  if (shopData.pendingBackup) enterBackupSwapMode();
  else exitBackupSwapMode();

  // Avatar-NEW-Sticker (Auth-Pill + Profil-Menüpunkt) neu berechnen —
  // updateSeenCreatures oben hat vielleicht gerade eine neue Wachstums-
  // stufe registriert (z.B. nach Trank oder Rundenrückkehr).
  window.refreshHubAvatarNewBadges?.();
}

function renderGamesGrid(allData, shopData) {
  const grid = document.getElementById('gamesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Season 1 ist Baseline und immer sichtbar. Höhere Seasons erscheinen
  // erst, sobald der User dorthin freigeschaltet ist. Reihenfolge: neueste oben.
  const userSeason = Math.max(getUserSeason(), 1);
  const visible = SEASONS_CONFIG
    .filter(s => s.id <= userSeason)
    .slice()
    .sort((a, b) => b.id - a.id);

  for (const season of visible) {
    grid.appendChild(buildSeasonSection(season, allData, shopData));
  }
}

function buildSeasonSection(season, allData, shopData) {
  const section = document.createElement('section');
  section.className = 'season-section';

  const titleEl = document.createElement('h3');
  titleEl.className = 'season-title';
  titleEl.innerHTML = `${season.title} <span class="chevron">&#9660;</span>`;

  const descEl = document.createElement('p');
  descEl.className = 'season-desc';
  descEl.textContent = season.desc;
  descEl.hidden = true;

  titleEl.addEventListener('click', () => {
    descEl.hidden = !descEl.hidden;
    titleEl.classList.toggle('open');
  });

  const seasonGrid = document.createElement('div');
  seasonGrid.className = 'games-grid';

  for (const game of GAMES_CONFIG.filter(g => g.season === season.id)) {
    const data = allData[game.id] || defaultGameData();
    seasonGrid.appendChild(buildGameCard(game, data, shopData));
  }

  section.appendChild(titleEl);
  section.appendChild(descEl);
  section.appendChild(seasonGrid);
  return section;
}

function buildGameCard(game, data, shopData) {
  const access    = getGameAccess(game.id);
  const rare      = data.creature && isRare(data.creature);
  const epic      = data.creature && isEpic(data.creature);
  const legendary = data.creature && isLegendary(data.creature);
  const maxed     = data.creature && data.growth >= GROWTH_MAX;
  const isBackupTarget = !!shopData.pendingBackup && !!data.creature && access === 'available';

  // Pending-Gift-Blink: revealed Legi mit wartendem Geschenk pulsiert
  // regenbogen (dieselbe .game-card--legi-ready-Klasse wie ready_to_reveal).
  const giftBlink = game.clusterLegi && access === 'available' && giftPending();

  const card = document.createElement('div');
  card.className = `game-card${access === 'locked' ? ' game-card--locked' : ''}${access === 'cluster_locked' ? ' game-card--cluster-locked' : ''}${access === 'ready_to_reveal' ? ' game-card--cluster-locked game-card--legi-ready' : ''}${giftBlink ? ' game-card--legi-ready' : ''}${data.creature && access === 'available' ? ' has-creature' : ''}${rare && access === 'available' ? ' game-card--rare' : ''}${epic && access === 'available' ? ' game-card--epic' : ''}${legendary && access === 'available' ? ' game-card--legendary' : ''}${maxed && access === 'available' ? ' creature-maxed' : ''}${isBackupTarget ? ' game-card--backup-target' : ''}`;
  card.innerHTML = buildCardHTML(game, data, shopData);

  attachCardListeners(card, game, data, isBackupTarget);
  return card;
}

function attachCardListeners(card, game, data, isBackupTarget) {
  card.querySelectorAll('.game-card__use-btn').forEach(useBtn => {
    useBtn.addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const sd = loadShopData();
      const countKey = btn.dataset.countKey;
      const itemId   = btn.dataset.item;
      if (!countKey || (sd[countKey] ?? 0) <= 0) return;
      sd[countKey]--;
      sd[itemId] = true;
      saveShopData(sd);
      window.location.href = game.url + '?id=' + game.id;
    });
  });

  card.querySelector('.game-card__trank-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    tryApplyWachstumstrank(game.id);
  });

  card.querySelector('.game-card__btn')?.addEventListener('click', () => {
    if (isBackupTarget) { applyBackupSwap(game.id); return; }
    const access = getGameAccess(game.id);
    if (access === 'locked') return;
    if (access === 'cluster_locked' || access === 'ready_to_reveal') { openBonbonModal(); return; }
    if (game.clusterLegi && access === 'available') { openLegiTaskModal(); return; }
    if (access === 'password') { showPasswordPrompt(game.id); return; }
    const sd = loadShopData();
    if (sd.pendingEggNestId) {
      const nest = sd.nests.find(n => n.nestId === sd.pendingEggNestId);
      if (nest) {
        nest.gameId  = game.id;
        nest.gameUrl = game.url;
        sd.pendingEggNestId = null;
        saveShopData(sd);
        exitPendingEggMode();
        const nestData = getGameData(nest.nestId);
        if (nestData.creature) { renderHub(); return; }
        window.location.href = game.url + '?id=' + nest.nestId + '&egg=' + nest.eggType;
        return;
      }
    }
    window.location.href = game.url + '?id=' + game.id;
  });

  if (data.creature) {
    card.querySelector('.creature-preview')?.addEventListener('click', e => {
      e.stopPropagation();
      if (isBackupTarget) { applyBackupSwap(game.id); return; }
      showCreatureModal(data);
    });
  }

  card.querySelector('.game-card__release')?.addEventListener('click', e => {
    e.stopPropagation();
    confirmRelease(game.id);
  });
}

function buildCardHTML(game, data, shopData) {
  const access = getGameAccess(game.id);

  if (access === 'locked') {
    return `
      <h3 class="game-card__title">🔒</h3>
      <div class="game-card__creature-wrap">
        <div style="font-size:3.5rem;line-height:1;margin:16px 0 12px;">🔒</div>
      </div>
      <p class="game-card__stage-label" style="color:var(--clr-cream-dim);">Noch nicht verfügbar</p>
      <div class="game-card__progress"><div class="game-card__progress-fill" style="width:0%"></div></div>
      <div class="game-card__points" style="opacity:0.3;">— —</div>
      <button class="game-card__btn" disabled style="opacity:0.4;cursor:default;">Gesperrt</button>
    `;
  }

  if (access === 'password') {
    return `
      <h3 class="game-card__title">${game.icon} ${game.title}</h3>
      <div class="game-card__creature-wrap">
        <div style="font-size:3.5rem;line-height:1;margin:16px 0 12px;">🔒</div>
      </div>
      <p class="game-card__stage-label" style="color:var(--clr-amber);">Passwort erforderlich</p>
      <div class="game-card__progress"><div class="game-card__progress-fill" style="width:0%"></div></div>
      <div class="game-card__points" style="opacity:0.3;">— —</div>
      <button class="game-card__btn">🔑 Freischalten</button>
    `;
  }

  if (access === 'cluster_locked' || access === 'ready_to_reveal') {
    const status = window.__bonbonStatus || {};
    const collected = status.collected ?? 0;
    const target    = status.target ?? 1;
    const pct       = access === 'ready_to_reveal'
      ? 100
      : Math.max(0, Math.min(100, Math.round(collected / target * 100)));
    return `
      <div class="game-card__cluster-locked-body">
        ${buildRainbowSVG(pct, 'small', { showLabel: true })}
        <div class="game-card__points" style="opacity:0.7;">🍬 ${collected} / ${target}</div>
      </div>
      <button class="game-card__btn">Fortschritt ansehen</button>
    `;
  }

  const hasCreature  = !!data.creature;
  const stage        = hasCreature ? getGrowthStage(data.growth) : -1;
  const maxed        = hasCreature && data.growth >= GROWTH_MAX;
  const isLegi       = !!game.clusterLegi;
  // Kein Wachstumstrank am Team-Legendär — er wächst durch Aufgaben, nicht Tränke.
  const canUseTrank  = hasCreature && !maxed && !isLegi && (shopData?.wachstumstrankCount ?? 0) > 0;
  // Legi-Titel überschreibt das GAMES_CONFIG '???' mit dem echten Kreatur-Namen.
  const titleText    = isLegi && hasCreature
    ? `${game.icon} ${escapeHtml(CREATURE_NAMES[data.creature] ?? data.creature)}`
    : `${game.icon} ${game.title}`;
  const imgContent   = hasCreature
    ? `<div class="hub-creature-display">${getCreatureHTML(data.creature, stage)}</div>`
    : eggStage0();
  const progressPct  = hasCreature ? Math.min(data.growth / GROWTH_MAX * 100, 100) : 0;
  const specialBadge = hasCreature && isRare(data.creature)
    ? `<span class="rare-badge">✦ Selten ✦</span>`
    : hasCreature && isEpic(data.creature)
    ? `<span class="epic-badge">✦ Episch ✦</span>`
    : hasCreature && isLegendary(data.creature)
    ? `<span class="legendary-badge">✦ Legendär ✦</span>` : '';

  // Team-Legendär verdient keine Münzen (spielt keine Runden) und lässt
  // keine Shop-Items (Booster, Coins×3, Glücksklee, Trank) zu — Growth
  // kommt ausschließlich durch die Trainings-Aufgaben.
  const bonusCoins = (!isLegi && hasCreature) ? getGrowthBonusCoins(data.growth || 0) : 0;
  const bonusHint = bonusCoins > 0
    ? `<div class="game-card__bonus-hint" title="${bonusCoins === 10 ? 'Vollendungs-Bonus' : 'Ausgewachsen-Bonus'}: +${bonusCoins} Münzen pro Runde">+${bonusCoins}<span class="game-card__bonus-hint-coin">🪙</span></div>`
    : '';

  return `
    ${bonusHint}
    <h3 class="game-card__title">${titleText}</h3>
    ${specialBadge}
    <div class="game-card__creature-wrap${hasCreature ? ' creature-preview' : ''}"
         title="${hasCreature ? 'Klicken für Details' : ''}">
      ${imgContent}
    </div>
    ${!hasCreature ? `<p class="game-card__stage-label">Ei schlummert…</p>` : ''}
    <div class="game-card__progress">
      <div class="game-card__progress-fill" style="width:${progressPct}%"></div>
    </div>
    <div class="game-card__points">
      ⭐ Gesamt: <strong>${data.points}</strong>
      &nbsp;·&nbsp; 🔄 Runden: <strong>${data.roundsPlayed}</strong>
    </div>
    ${(function(){
  const items = isLegi ? [] : getActiveItemsForSlot(data, shopData);
  if (items.length === 0) return `<button class="game-card__btn">Spielen!</button>`;
  if (items.length === 1) {
    const it = items[0];
    return `<div class="game-card__action-row"><button class="game-card__btn">Spielen!</button><button class="game-card__use-btn" data-item="${it.id}" data-count-key="${it.countKey}" title="${it.name} einsetzen">nutze ${it.icon}</button></div>`;
  }
  const useBtns = items.map(it =>
    `<button class="game-card__use-btn game-card__use-btn--icon" data-item="${it.id}" data-count-key="${it.countKey}" title="${it.name} einsetzen">${it.icon}</button>`
  ).join('');
  return `<div class="game-card__action-row"><button class="game-card__btn">Spielen!</button>${useBtns}</div>`;
})()}
    ${data.creature ? `<button class="game-card__release" title="Tier freilassen">${RELEASE_ICON}</button>` : ''}
    ${canUseTrank ? `<button class="game-card__trank-btn" title="Wachstumstrank anwenden">🧪</button>` : ''}
  `;
}

// Atari3 · Enter 1-3-5-2
function renderGallery(allData) {
  const bar   = document.getElementById('galleryBar');
  const slots = document.getElementById('gallerySlots');
  if (!bar || !slots) return;
  slots.innerHTML = '';
  let count = 0;

  for (const g of GAMES_CONFIG) {
    const d = allData[g.id];
    if (d && d.creature) {
      const stage  = getGrowthStage(d.growth);
      const walker = document.createElement('div');
      walker.className        = 'gallery-walker';
      walker.dataset.creature = d.creature;
      walker.title            = `${CREATURE_NAMES[d.creature]} (${GROWTH_LABELS[stage]})`;
      walker.innerHTML        = getCreatureHTML(d.creature, stage);
      walker.addEventListener('click', () => {
        showCreatureModal(d);
      });
      slots.appendChild(walker);
      count++;
    }
  }

  for (const nest of loadShopData().nests) {
    const d = allData[nest.nestId];
    if (d && d.creature) {
      const stage  = getGrowthStage(d.growth);
      const walker = document.createElement('div');
      walker.className        = 'gallery-walker';
      walker.dataset.creature = d.creature;
      walker.title            = `${CREATURE_NAMES[d.creature]} (${GROWTH_LABELS[stage]}) · Nest`;
      walker.innerHTML        = getCreatureHTML(d.creature, stage);
      walker.addEventListener('click', () => {
        showCreatureModal(d);
      });
      slots.appendChild(walker);
      count++;
    }
  }

  bar.style.display = count > 0 ? 'block' : 'none';
}

function showCreatureModal(data) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;
  const stage         = getGrowthStage(data.growth);
  const name          = CREATURE_NAMES[data.creature];
  const desc          = CREATURE_DESCRIPTIONS[data.creature][stage];
  const nextThreshold = GROWTH_THRESHOLDS[stage + 1];
  const nextPts       = stage < GROWTH_STAGES - 1 ? nextThreshold - data.growth : 0;

  const specialLabel = isRare(data.creature)
    ? `<span class="rare-badge" style="margin-bottom:10px;">✦ Seltenes Tier ✦</span><br>`
    : isEpic(data.creature)
    ? `<span class="epic-badge" style="margin-bottom:10px;">✦ Episches Tier ✦</span><br>`
    : isLegendary(data.creature)
    ? `<span class="legendary-badge" style="margin-bottom:10px;">✦ Legendäres Tier ✦</span><br>` : '';

  content.innerHTML = `
    <div style="text-align:center;">
      <div class="modal-creature-img">${getCreatureHTML(data.creature, stage)}</div>
      ${specialLabel}
      <h2 style="font-family:var(--font-display);color:var(--clr-gold);font-size:1.5rem;margin:12px 0 4px;">${name}</h2>
      <p style="color:var(--clr-amber);font-size:0.82rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">${GROWTH_LABELS[stage]}</p>
      <p style="color:var(--clr-cream-dim);line-height:1.6;margin-bottom:18px;">${desc}</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;">
        <div style="background:var(--clr-surface2);border-radius:12px;padding:10px 16px;text-align:center;">
          <div style="font-size:0.7rem;color:var(--clr-cream-dim);text-transform:uppercase;letter-spacing:1px;">Gesamtpunkte</div>
          <div style="font-size:1.7rem;font-weight:800;color:var(--clr-gold);">${data.points}</div>
        </div>
        <div style="background:var(--clr-surface2);border-radius:12px;padding:10px 16px;text-align:center;">
          <div style="font-size:0.7rem;color:var(--clr-cream-dim);text-transform:uppercase;letter-spacing:1px;">Runden</div>
          <div style="font-size:1.7rem;font-weight:800;color:var(--clr-gold);">${data.roundsPlayed}</div>
        </div>
        <div style="background:var(--clr-surface2);border-radius:12px;padding:10px 16px;text-align:center;">
          <div style="font-size:0.7rem;color:var(--clr-cream-dim);text-transform:uppercase;letter-spacing:1px;">Wachstum</div>
          <div style="font-size:1.7rem;font-weight:800;color:var(--clr-amber);">${Math.round(data.growth)}</div>
        </div>
      </div>
      ${nextPts > 0
        ? `<p style="font-size:0.82rem;color:var(--clr-cream-dim);">Noch <strong style="color:var(--clr-gold);">${Math.round(nextPts)} Punkte</strong> bis zur nächsten Stufe!</p>`
        : `<p style="font-size:0.82rem;color:var(--clr-green);">✓ Vollständig ausgewachsen!</p>`}
    </div>`;
  overlay.hidden = false;
}

// Migration 0023: Kristall-Balance = Grants − Ausgaben. Vorher wurde
// sd.kristalle direkt dekrementiert und beim Sync zurückgeplättet.
function getAvailableKristalle(sd) {
  return (sd.kristalle ?? 0) - (sd.spentKristalle ?? 0);
}

function renderCoinDisplay(allData) {
  const shopData  = loadShopData();
  const available = getTotalCoins(allData) - shopData.spentCoins;
  const el = document.getElementById('coinAmount');
  if (el) el.textContent = available;

  const kristallEl = document.getElementById('kristallAmount');
  if (kristallEl) kristallEl.textContent = getAvailableKristalle(shopData);

  const bookBtn = document.getElementById('bookBtn');
  if (bookBtn) bookBtn.hidden = !shopData.purchased.includes('buchDerMonster');
}

async function openBonbonModal() {
  const overlay = document.getElementById('bonbonModal');
  const content = document.getElementById('bonbonModalContent');
  if (!overlay || !content) return;

  // Bevor wir anzeigen: aktuellste Cluster-Summe ziehen. Verhindert
  // veraltete Anzeige, wenn ein Mitschüler frisch beigetragen hat.
  content.innerHTML = '<div class="bonbon-modal-loading">Lade Fortschritt…</div>';
  overlay.hidden = false;
  const status = (await window.refreshBonbonStatus?.()) || window.__bonbonStatus;
  if (!status || !status.enabled) {
    content.innerHTML = '<p style="text-align:center;padding:32px;">Der Bonbon-Fortschritt ist für deinen Kurs nicht aktiv.</p>';
    return;
  }
  content.innerHTML = buildBonbonModalHTML(status);

  // Reveal-Button binden (existiert nur bei unlocked + !legiRevealed)
  const revealBtn = document.getElementById('bonbonRevealBtn');
  if (revealBtn) {
    revealBtn.addEventListener('click', () => {
      overlay.hidden = true;
      showLegiRevealAnimation();
    });
  }
}
window.openBonbonModal = openBonbonModal;

// Baut den halbkreisförmigen SVG-Regenbogen. Grauer Basis-Bogen +
// bunter Overlay-Bogen, radial aufgespannt: clipPath ist ein Kreis-
// Sektor um (100, 100), der von 180° (links) mit dem Fortschritt zu
// 0° (rechts) rotiert — wie ein aufklappender Fächer.
// Milestones = optionaler Marker-Array {percent, reached}.
function buildRainbowSVG(pct, size = 'small', opts = {}) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const clipId = 'rainbow-clip-' + Math.random().toString(36).slice(2, 8);
  const showLabel = opts.showLabel !== false;
  const milestones = Array.isArray(opts.milestones) ? opts.milestones : [];

  // Sektor-Path für clipPath: vom Zentrum (100,100) zum linken Startpunkt
  // (10,100), Kreisbogen mit Radius 90 im Uhrzeigersinn (sweep=1) zum
  // Endpunkt entsprechend dem Fortschritts-Winkel, zurück zum Zentrum.
  const cx = 100, cy = 100, r = 90;
  const angleRad = Math.PI * (1 - p / 100);
  const endX = cx + r * Math.cos(angleRad);
  const endY = cy - r * Math.sin(angleRad);
  const clipD = `M ${cx} ${cy} L ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${endX.toFixed(3)} ${endY.toFixed(3)} Z`;

  const grayStripes = [
    ['M 20 100 A 80 80 0 0 1 180 100', '#4c4658'],
    ['M 30 100 A 70 70 0 0 1 170 100', '#443f52'],
    ['M 40 100 A 60 60 0 0 1 160 100', '#3d394b'],
    ['M 50 100 A 50 50 0 0 1 150 100', '#363244'],
    ['M 60 100 A 40 40 0 0 1 140 100', '#2f2c3d'],
    ['M 70 100 A 30 30 0 0 1 130 100', '#292636'],
  ].map(([d, c]) => `<path d="${d}" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="butt" />`).join('');

  const colorStripes = [
    ['M 20 100 A 80 80 0 0 1 180 100', '#ff5b6b'],
    ['M 30 100 A 70 70 0 0 1 170 100', '#ffa940'],
    ['M 40 100 A 60 60 0 0 1 160 100', '#ffeb3b'],
    ['M 50 100 A 50 50 0 0 1 150 100', '#66d16b'],
    ['M 60 100 A 40 40 0 0 1 140 100', '#4fb3ff'],
    ['M 70 100 A 30 30 0 0 1 130 100', '#b477ff'],
  ].map(([d, c]) => `<path d="${d}" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="butt" />`).join('');

  const markers = milestones.map(m => {
    // Milestone-Marker sitzen auf dem Bogen selbst (mittlerer Radius 55)
    // und rotieren mit — bei 25 % sitzt der Marker links oben, bei 100 %
    // rechts. Gleicher Winkel-Mapping wie das clipPath.
    const angle = Math.PI * (1 - m.percent / 100);
    const mx = cx + 55 * Math.cos(angle);
    const my = cy - 55 * Math.sin(angle);
    const cls = m.reached ? 'rainbow-arc__marker rainbow-arc__marker--reached' : 'rainbow-arc__marker';
    return `<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="3" class="${cls}" />`;
  }).join('');

  const label = showLabel
    ? `<text x="100" y="88" text-anchor="middle" class="rainbow-arc__label">${Math.round(p)}%</text>`
    : '';

  return `<div class="rainbow-arc rainbow-arc--${size}">
      <svg viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
        <defs>
          <clipPath id="${clipId}">
            <path d="${clipD}" />
          </clipPath>
        </defs>
        <g class="rainbow-arc__base">${grayStripes}</g>
        <g class="rainbow-arc__fill" clip-path="url(#${clipId})">${colorStripes}</g>
        ${markers}
        ${label}
      </svg>
    </div>`;
}

function buildBonbonModalHTML(status) {
  const collected = status.collected ?? 0;
  const target    = status.target ?? 1;
  const pct       = Math.max(0, Math.min(100, Math.round(collected / target * 100)));
  const own       = status.own_amount ?? 0;
  const unlocked  = !!status.unlocked;
  const milestones = Array.isArray(status.milestones) ? status.milestones : [];

  const rainbowBlock = `
    <div class="bonbon-rainbow">
      ${buildRainbowSVG(pct, 'large', { milestones, showLabel: true })}
      <div class="bonbon-rainbow__stats">
        <div><strong>${collected}</strong> / ${target} 🍬 gesammelt</div>
        <div class="bonbon-rainbow__own">Du hast <strong>${own}</strong> beigetragen</div>
      </div>
    </div>`;

  if (!unlocked) {
    return `
      <h2 class="bonbon-modal__title">Regenbogen-Bonbons</h2>
      <p class="bonbon-modal__intro">Euer Kurs sammelt gemeinsam Bonbons. Erreicht das Ziel und ein legendäres Wesen erwacht!</p>
      ${rainbowBlock}
    `;
  }

  // Cluster hat 100 % erreicht. Zwei Fälle:
  //   a) User hat noch nicht revealed → Button „Kreatur befreien" startet die Animation.
  //   b) User hat schon revealed → Modal ist reine Fortschritts-Historie.
  const shop = loadShopData();
  const alreadyRevealed = !!shop.legiRevealed;

  if (!alreadyRevealed) {
    return `
      <h2 class="bonbon-modal__title">🌈 Euer Ziel ist erreicht!</h2>
      <p class="bonbon-modal__intro">Der Kurs hat es geschafft. Nun kannst du das Team-Legendär selbst zum Leben erwecken.</p>
      ${rainbowBlock}
      <div class="bonbon-modal__actions">
        <button class="bonbon-reveal-btn" id="bonbonRevealBtn">🌈 Kreatur befreien</button>
      </div>
    `;
  }

  return `
    <h2 class="bonbon-modal__title">🌈 Ihr habt es geschafft!</h2>
    <p class="bonbon-modal__intro">Dein Team-Legendär wartet im Hub auf dich.</p>
    ${rainbowBlock}
  `;
}

/* ─────────────────────────────────────────────────
   6. SHOP MODAL
   ───────────────────────────────────────────────── */
let shopActiveTab = 1;
let bookActiveTab = 'all';   // 'all' | 1 | 2 | 3

const LOOTBOX_SLOTS = [
  { key: '06', minutes:  6 * 60, label: '06:00' },
  { key: '12', minutes: 12 * 60, label: '12:00' },
  { key: '18', minutes: 18 * 60, label: '18:00' },
];

function getFreeLootboxStatus() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const claimed = loadShopData().lootboxDailyClaimed || {};
  let latestPassed = null;
  let nextLabel = null;
  for (const slot of LOOTBOX_SLOTS) {
    if (currentMinutes >= slot.minutes) latestPassed = slot;
    else if (!nextLabel) nextLabel = slot.label;
  }
  if (!nextLabel) nextLabel = '06:00 (morgen)';
  const available = latestPassed && claimed[latestPassed.key] !== today;
  return { available: available ? 1 : 0, nextLabel };
}

function claimFreeLootbox() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const sd = loadShopData();
  if (!sd.lootboxDailyClaimed) sd.lootboxDailyClaimed = {};
  let latestPassed = null;
  for (const slot of LOOTBOX_SLOTS) {
    if (currentMinutes >= slot.minutes) latestPassed = slot;
  }
  if (latestPassed && sd.lootboxDailyClaimed[latestPassed.key] !== today) {
    sd.lootboxDailyClaimed[latestPassed.key] = today;
    saveShopData(sd);
    updateLootboxBlink();
    const reward = rollLootbox(sd, loadAllData());
    openLootboxModal(reward);
  }
}

function updateLootboxBlink() {
  const blink = getUserSeason() >= 2 && getFreeLootboxStatus().available > 0;
  document.getElementById('shopBtn')?.classList.toggle('lootbox-blink', blink);
  document.querySelector('.shop-tab[data-tab="2"]')?.classList.toggle('lootbox-blink', blink);
}

// ── Lootbox: Wahrscheinlichkeits-Engine & Modal ───────────────────────────

function _emptyConsumables() {
  return { wachstumstrank: 0, wachstumsBooster: 0, coinsx3: 0, glucksklee: 0, lockmittel: 0 };
}

function _rollCommonItem() {
  const COMMONS = [
    { key: 'wachstumstrank',   label: 'Wachstumstrank',    icon: '🧪' },
    { key: 'wachstumsBooster', label: 'Wachstums-Booster', icon: '⚡' },
    { key: 'coinsx3',          label: 'Coins ×3',          icon: '🎰' },
    { key: 'glucksklee',       label: 'Glücksklee',        icon: '🍀' },
  ];
  return COMMONS[Math.floor(Math.random() * COMMONS.length)];
}

function rollLootbox(shopData, allData) {
  const r = Math.random() * 100;

  // 3% Ultra
  if (r < 3) {
    const priority = [
      { type: 'seal', id: 'siegelHimmel',  label: 'Siegel des Himmels', icon: '🌟' },
      { type: 'seal', id: 'siegelSuempfe', label: 'Siegel der Sümpfe',  icon: '🌿' },
      { type: 'egg',  id: 'shinyEi',       eggType: 'shiny',     label: 'Versiegeltes Ei', icon: '✨' },
      { type: 'egg',  id: 'legendaresEi',  eggType: 'legendary', label: 'Legendäres Ei',   icon: '🥚' },
      { type: 'egg',  id: 'mythischesEi',  eggType: 'mythic',    label: 'Episches Ei',     icon: '🥚' },
      { type: 'egg',  id: 'seltenesEi',    eggType: 'rare',      label: 'Seltenes Ei',     icon: '🥚' },
    ];
    for (const c of priority) {
      if (c.type === 'seal') {
        if (!shopData.purchased.includes(c.id))
          return { rarity: 'ultra', seal: c.id, egg: null, label: c.label, icon: c.icon, consumables: _emptyConsumables(), coins: 0, kristalle: 0, steinDerVollendung: false };
      } else {
        if (!shopData.nests.some(n => n.eggType === c.eggType))
          return { rarity: 'ultra', egg: c.eggType, seal: null, label: c.label, icon: c.icon, consumables: _emptyConsumables(), coins: 0, kristalle: 0, steinDerVollendung: false };
      }
    }
    return { rarity: 'ultra', kristalle: 50, label: '50 Kristalle', icon: '💎', consumables: _emptyConsumables(), coins: 0, egg: null, seal: null, steinDerVollendung: false };
  }

  // 4% Legendary (kumulativ 7%)
  if (r < 7)
    return { rarity: 'legendary', kristalle: 15, label: '15 Kristalle', icon: '💎', consumables: _emptyConsumables(), coins: 0, egg: null, seal: null, steinDerVollendung: false };

  // 6% Epic (kumulativ 13%)
  if (r < 13) {
    const s2Open = getUserSeason() >= 2;
    const hasEligible = s2Open && Object.values(allData).some(d => d?.creature && d.growth >= GROWTH_MAX && d.growth < GROWTH_S6);
    if (hasEligible)
      return { rarity: 'epic', steinDerVollendung: true, label: 'Stein der Vollendung', icon: '🧿', consumables: _emptyConsumables(), coins: 0, kristalle: 0, egg: null, seal: null };
    return { rarity: 'epic', consumables: { wachstumstrank: 1, wachstumsBooster: 1, coinsx3: 1, glucksklee: 1 }, label: 'Alle 4 Tränke', icon: '🎒', coins: 0, kristalle: 0, egg: null, seal: null, steinDerVollendung: false };
  }

  // 15% Rare (kumulativ 28%)
  if (r < 28) {
    const common = _rollCommonItem();
    const bonus = Math.random() < 0.5
      ? { coins: 10, kristalle: 0, bonusLabel: '+ 10 🪙' }
      : { coins: 0, kristalle: 2, bonusLabel: '+ 2 💎' };
    const c = _emptyConsumables(); c[common.key] = 1;
    return { rarity: 'rare', consumables: c, coins: bonus.coins, kristalle: bonus.kristalle, label: `${common.label} ${bonus.bonusLabel}`, icon: common.icon, egg: null, seal: null, steinDerVollendung: false };
  }

  // 25% Uncommon (kumulativ 53%)
  if (r < 53) {
    if (Math.random() < 0.5)
      return { rarity: 'uncommon', coins: 10, label: '10 Münzen', icon: '🪙', consumables: _emptyConsumables(), kristalle: 0, egg: null, seal: null, steinDerVollendung: false };
    return { rarity: 'uncommon', kristalle: 2, label: '2 Kristalle', icon: '💎', consumables: _emptyConsumables(), coins: 0, egg: null, seal: null, steinDerVollendung: false };
  }

  // 60% Common
  const common = _rollCommonItem();
  const c = _emptyConsumables(); c[common.key] = 1;
  return { rarity: 'common', consumables: c, label: common.label, icon: common.icon, coins: 0, kristalle: 0, egg: null, seal: null, steinDerVollendung: false };
}

function applyLootboxReward(reward) {
  const sd = loadShopData();
  const allData = loadAllData();

  for (const [key, count] of Object.entries(reward.consumables)) {
    if (count > 0) sd[key + 'Count'] = (sd[key + 'Count'] ?? 0) + count;
  }
  if (reward.coins     > 0) sd.bankedCoins = (sd.bankedCoins ?? 0) + reward.coins;
  if (reward.kristalle > 0) sd.kristalle   = (sd.kristalle   ?? 0) + reward.kristalle;
  if (reward.seal && !sd.purchased.includes(reward.seal)) sd.purchased.push(reward.seal);
  if (reward.egg) {
    const nestId = 'nest_lootbox_' + Date.now();
    sd.nests.push({ nestId, eggType: reward.egg, gameId: null, gameUrl: null });
    sd.pendingEggNestId = nestId;
  }
  // Reward-Mods am sd erst persistieren, DANN saveGameData für die SdV-
  // Evolution: bei Nest-chosenKey mirror't saveGameData den hatched-Update
  // via loadShopData → saveShopData. Käme saveShopData(sd) danach, würde
  // der stale sd den Mirror clobbern.
  saveShopData(sd);
  if (reward.steinDerVollendung) {
    const s2Open = getUserSeason() >= 2;
    if (s2Open) {
      const eligible = Object.keys(allData).filter(k => {
        // Team-Legendär (clusterLegi) bleibt außen vor — er wächst
        // ausschließlich durch die Trainings-Aufgaben.
        const g = GAMES_CONFIG.find(cfg => cfg.id === k);
        if (g?.clusterLegi) return false;
        return allData[k]?.creature && allData[k].growth >= GROWTH_MAX && allData[k].growth < GROWTH_S6;
      });
      if (eligible.length > 0) {
        const chosenKey = eligible[Math.floor(Math.random() * eligible.length)];
        allData[chosenKey].growth = GROWTH_S6;
        // saveGameData statt saveAllData: triggert Server-Sync via sync_game_state.
        saveGameData(chosenKey, allData[chosenKey]);
      }
    }
  }
}

function _spawnLootboxParticles(rarity, container) {
  const cfgs = {
    common:    { count: 8,  colours: ['#fff8c0','#f0b429','#e8c850'], maxDist: 80,  dur: 1.0 },
    uncommon:  { count: 12, colours: ['#5ba4e8','#93c5fd','#bfdbfe'], maxDist: 100, dur: 1.1 },
    rare:      { count: 18, colours: ['#a855f7','#c084fc','#e9d5ff'], maxDist: 120, dur: 1.2 },
    epic:      { count: 24, colours: ['#f97316','#fb923c','#fbbf24'], maxDist: 140, dur: 1.3 },
    legendary: { count: 30, colours: ['#ffd700','#fff8c0','#f0b429'], maxDist: 160, dur: 1.5 },
    ultra:     { count: 40, colours: ['#e879f9','#5ba4e8','#ffd700','#f0abfc','#93c5fd'], maxDist: 200, dur: 1.8 },
  };
  const cfg = cfgs[rarity] ?? cfgs.common;

  for (let i = 0; i < cfg.count; i++) {
    const p = document.createElement('div');
    p.className = 'lootbox-particle';
    const angle  = (i / cfg.count) * 360 + (Math.random() * 30 - 15);
    const dist   = cfg.maxDist * (0.5 + Math.random() * 0.5);
    const dur    = cfg.dur * (0.7 + Math.random() * 0.6);
    const colour = cfg.colours[Math.floor(Math.random() * cfg.colours.length)];
    p.style.cssText = `--lb-angle:${angle}deg;--lb-dist:${dist}px;--lb-dur:${dur}s;background:${colour};box-shadow:0 0 4px ${colour};animation-delay:${Math.random() * 0.2}s;`;
    container.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }

  if (rarity === 'legendary' || rarity === 'ultra') {
    const emojis = rarity === 'ultra' ? ['💎','🌟','💫','✨'] : ['🪙','⭐','💫'];
    const rainCount = rarity === 'ultra' ? 16 : 10;
    for (let i = 0; i < rainCount; i++) {
      setTimeout(() => {
        const drop = document.createElement('div');
        drop.className = 'lootbox-rain-drop';
        drop.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        drop.style.cssText = `left:${5 + Math.random() * 90}%;top:-10%;animation-duration:${1.2 + Math.random() * 0.8}s;`;
        container.appendChild(drop);
        drop.addEventListener('animationend', () => drop.remove(), { once: true });
      }, i * 80);
    }
  }
}

function openLootboxModal(reward) {
  closeShopModal();

  const overlay   = document.getElementById('lootboxModal');
  const box       = document.getElementById('lootboxModalBox');
  const phase1    = document.getElementById('lootboxPhase1');
  const phase2    = document.getElementById('lootboxPhase2');
  const graphic   = document.getElementById('lootboxGraphic');
  const lid       = document.getElementById('lootboxLid');
  const flash     = document.getElementById('lootboxFlash');
  const rarLbl    = document.getElementById('lootboxRarityLabel');
  const rewIcon   = document.getElementById('lootboxRewardIcon');
  const rewName   = document.getElementById('lootboxRewardName');
  const particles = document.getElementById('lootboxParticles');
  const collectBtn = document.getElementById('lootboxCollectBtn');
  if (!overlay) return;

  // Reset
  phase1.hidden = false;
  phase2.hidden = true;
  collectBtn.classList.add('invisible');
  flash.className = 'lootbox-flash';
  box.className = 'lootbox-modal-box';
  lid.className = 'lootbox-lid';
  graphic.className = 'lootbox-graphic';
  particles.innerHTML = '';
  rewIcon.className = 'lootbox-reward-icon';
  overlay.hidden = false;

  // Phase 1: Wobble nach 1,5s
  setTimeout(() => {
    graphic.classList.add('lootbox-wobble');
    graphic.addEventListener('animationend', () => graphic.classList.remove('lootbox-wobble'), { once: true });
  }, 1500);

  // Deckel + Flash nach 2,8s → Phase 2 nach weiteren 300ms
  setTimeout(() => {
    lid.classList.add('lootbox-lid-open');
    const flashColours = { common: 'rgba(255,255,255,0.25)', uncommon: 'rgba(91,164,232,0.35)', rare: 'rgba(168,85,247,0.4)', epic: 'rgba(249,115,22,0.5)', legendary: 'rgba(255,215,0,0.55)', ultra: 'rgba(232,121,249,0.55)' };
    flash.style.background = flashColours[reward.rarity] ?? flashColours.common;
    flash.classList.add('active');
    flash.addEventListener('animationend', () => flash.classList.remove('active'), { once: true });

    setTimeout(() => {
      phase1.hidden = true;
      phase2.hidden = false;
      box.classList.add(`lootbox-rarity--${reward.rarity}`);

      const rarNames = { common: 'Gewöhnlich', uncommon: 'Ungewöhnlich', rare: 'Rar', epic: 'Episch', legendary: 'Legendär', ultra: 'Ultra' };
      rarLbl.textContent = rarNames[reward.rarity] ?? reward.rarity;
      rarLbl.className = `lootbox-rarity-label lb-label--${reward.rarity}`;

      rewIcon.textContent = reward.icon;
      rewIcon.classList.add('lootbox-reward-appear');
      rewName.textContent = reward.label;

      _spawnLootboxParticles(reward.rarity, particles);
      setTimeout(() => { collectBtn.classList.remove('invisible'); }, 600);

      // Epic: zweiter Flash
      if (reward.rarity === 'epic') {
        setTimeout(() => {
          flash.style.background = 'rgba(249,115,22,0.18)';
          flash.classList.add('active');
          flash.addEventListener('animationend', () => flash.classList.remove('active'), { once: true });
        }, 400);
      }
    }, 300);
  }, 2800);

  // Collect
  const onCollect = () => {
    collectBtn.removeEventListener('click', onCollect);
    applyLootboxReward(reward);
    overlay.hidden = true;
    box.className = 'lootbox-modal-box';
    renderHub();
    renderShop(loadAllData());
    updateLootboxBlink();
  };
  collectBtn.addEventListener('click', onCollect);
}

// ── Season 2 Shop-Items (nn = noch nicht funktionsfähig) ─────────────────
const SHOP_ITEMS_P2 = [
  { id: 'kristall1',          icon: '💎',      name: '1 Kristall',                description: 'Tausche Münzen gegen Kristalle – die seltene Währung der Lernwelt.',  price: 15, kristallItem: true, kristallAmount: 1  },
  { id: 'kristall3',          icon: '💎💎',   name: '3 Kristalle',               description: 'Ein kleines Bündel Kristalle – günstiger als einzeln kaufen.',             price: 40, kristallItem: true, kristallAmount: 3  },
  { id: 'kristall10',         icon: '💎💎💎', name: '10 Kristalle',              description: 'Der große Vorrat – der beste Preis pro Kristall.',                          price: 90, kristallItem: true, kristallAmount: 10 },
  { id: 'lootbox',             icon: '🎁', name: 'Lootbox',               description: 'Gratis um 06:00, 12:00 und 18:00 – oder jederzeit für 3 Kristalle kaufen.',                                                                         price: 3,   currency: 'kristall', lootboxItem: true },
  { id: 's2Ei',               icon: '🥚', name: 'versiegeltes Ei',              description: 'Hier droppen nur Monster aus Season 2 – Epic, Rare und Normal.',                                                                              price: 8,   currency: 'kristall', eggItem: true, eggType: 's2' },
  { id: 'backupDesBuches',    icon: '💾', name: 'Backup des Buches',          description: 'Lade ein beliebiges Monster aus dem Buch der Monster in einen Hub – kostet 2 Kristalle pro Nutzung.',                                                         price: 20,  currency: 'kristall', backupItem: true },
  { id: 'steinDerVollendung', icon: '🧿', name: 'Stein der Vollendung',   description: 'Löst die verborgenen Fesseln eines zufälligen Wesens und öffnet den Weg zu einer Stufe, die niemand für möglich hielt.',                                              price: 10,  currency: 'kristall', consumable: true, upgradeItem: true },
  { id: 'siegelSuempfe',      icon: '🌿', name: 'Siegel der Sümpfe',         description: 'Ein moosbedecktes Siegel aus den Tiefen der Sümpfe. Nur Kristalle können es öffnen.',                                                                        price: 20,  currency: 'kristall', sealItem: true, sealType: 'swamp'  },
  { id: 'siegelHimmel',       icon: '🌟', name: 'Siegel des Himmels',        description: 'Ein strahlendes Siegel aus den Höhen. Bezahle mit Kristallen, um zu enthüllen, was sich dahinter verbirgt.',                                                 price: 20,  currency: 'kristall', sealItem: true, sealType: 'heaven' },
];

// ── Season 3 Shop-Items (Regenbogen-Bonbons — Items folgen) ───────────
const SHOP_ITEMS_P3 = [
  { id: 'lockmittel', icon: '🧲', name: 'Lockmittel', description: 'Setze es bei einem schlummernden Ei ein: Zu 90 % droppt beim ersten Spiel ein Season-3-Monster!', price: 20, consumable: true },
];

function openShopModal() {
  const modal = document.getElementById('shopModal');
  if (!modal) return;
  const season = getUserSeason();
  shopActiveTab = season >= 3 ? 3 : (season >= 2 ? 2 : 1);
  if (!modal._tabsWired) {
    modal._tabsWired = true;
    document.querySelectorAll('.shop-tab').forEach(btn => {
      btn.addEventListener('click', () => renderShop(loadAllData(), +btn.dataset.tab));
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeShopModal(); });
  }
  renderShop(loadAllData());
  modal.hidden = false;
}

function closeShopModal() {
  const modal = document.getElementById('shopModal');
  if (modal) modal.hidden = true;
}

// Atari5 · Enter 2-7-1-8
function renderShop(allData, tab) {
  if (tab !== undefined) shopActiveTab = tab;
  const s2Open = getUserSeason() >= 2;
  const s3Open = getUserSeason() >= 3;

  _renderShopTabs(s2Open, s3Open);

  const list = document.getElementById('shopList');
  if (!list) return;
  list.innerHTML = '';

  const shopData  = loadShopData();
  const available = getTotalCoins(allData) - shopData.spentCoins;

  _renderShopBadges(shopData, available, s2Open);

  const activeItems = shopActiveTab === 1
    ? SHOP_ITEMS
    : shopActiveTab === 2 ? SHOP_ITEMS_P2 : SHOP_ITEMS_P3;
  for (const item of activeItems) {
    list.appendChild(_buildShopItem(item, shopData, allData, available, s2Open));
  }
  if (shopActiveTab === 3 && activeItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'shop-empty-hint';
    empty.textContent = 'Season-3-Items folgen bald.';
    list.appendChild(empty);
  }

  const bannerText = document.getElementById('shopChallengeBannerText');
  if (bannerText) {
    if (shopActiveTab === 1) {
      bannerText.innerHTML = 'Hast du alle <strong>14 Kreaturen</strong> gefunden und großgezogen?<br>Dann schicke mir einen Screenshot von deinem <strong>Buch der Monster!</strong><br>Die ersten drei <strong>Monster-Meister</strong> erhalten einen Preis!';
    } else if (shopActiveTab === 2) {
      bannerText.innerHTML = 'Hast du alle <strong>7 neuen Kreaturen</strong> aus Season 2 gefunden und großgezogen?<br>Dann schicke mir einen Screenshot von deinem <strong>Buch der Monster!</strong><br>Die ersten drei <strong>Monster-Meister</strong> erhalten einen Preis!';
    } else {
      bannerText.innerHTML = 'Sammelt als Kurs gemeinsam <strong>Regenbogen-Bonbons</strong> 🍬 und schaltet euer <strong>Team-Legendär</strong> frei!';
    }
  }
}

function _renderShopTabs(s2Open, s3Open) {
  document.querySelectorAll('.shop-tab').forEach(btn => {
    btn.classList.toggle('shop-tab--active', +btn.dataset.tab === shopActiveTab);
    if (+btn.dataset.tab === 2) btn.hidden = !s2Open;
    if (+btn.dataset.tab === 3) btn.hidden = !s3Open;
  });
}

function _renderShopBadges(shopData, available, s2Open) {
  const shopCoinEl = document.getElementById('shopCoinAmount');
  if (shopCoinEl) shopCoinEl.textContent = available;

  const kristallBadge = document.getElementById('shopKristallBadge');
  const kristallAmountEl = document.getElementById('shopKristallAmount');
  if (!kristallBadge) return;
  const activeTabNr = +(document.querySelector('.shop-tab--active')?.dataset.tab ?? shopActiveTab);
  const showKristall = s2Open && activeTabNr === 2;
  kristallBadge.hidden = !showKristall;
  if (showKristall && kristallAmountEl) kristallAmountEl.textContent = getAvailableKristalle(shopData);
}

function _buildShopItem(item, shopData, allData, available, s2Open) {
  if (item.lootboxItem) return _buildLootboxItemElement(item, shopData);

  const soldOut = (item.bookItem || item.atariHintItem || item.backupItem || item.sealItem)
    ? shopData.purchased.includes(item.id)
    : item.eggItem
      ? shopData.nests.some(n => n.eggType === item.eggType)
      : false;

  if (item.atariHintItem && soldOut) return _buildAtariHintItemElement(item, shopData);

  return _buildStandardShopItemElement(item, shopData, allData, available, s2Open, soldOut);
}

function _buildLootboxItemElement(item, shopData) {
  const status = getFreeLootboxStatus();
  const hasFree = status.available > 0;

  const li = document.createElement('div');
  li.className = 'shop-list-item' + (hasFree ? ' lootbox-blink' : '');
  li.innerHTML = `
    <div class="shop-list-item__icon">${item.icon}</div>
    <div class="shop-list-item__info">
      <div class="shop-list-item__name">${item.name}</div>
      <p class="shop-list-item__desc">${item.description}</p>
      <div class="shop-list-item__price">
        ${hasFree
          ? `<span style="color:var(--clr-green);">✓ Gratis verfügbar!</span>`
          : `<span style="opacity:0.6;">Nächste um ${status.nextLabel}</span>`}
      </div>
    </div>
    <div class="shop-list-item__buy-col">
      <button class="shop-list-item__btn"${!hasFree && getAvailableKristalle(shopData) < item.price ? ' disabled' : ''}>${hasFree ? 'Gratis' : `${item.price} 💎 Kaufen`}</button>
    </div>
  `;
  li.querySelector('.shop-list-item__btn').addEventListener('click', () => {
    if (hasFree) {
      claimFreeLootbox();
    } else {
      const currentSd = loadShopData();
      if (getAvailableKristalle(currentSd) < item.price) return;
      currentSd.spentKristalle = (currentSd.spentKristalle ?? 0) + item.price;
      saveShopData(currentSd);
      const reward = rollLootbox(currentSd, loadAllData());
      openLootboxModal(reward);
    }
  });
  return li;
}

function _buildAtariHintItemElement(item, shopData) {
  const isSolved = shopData.atariSolved;
  _injectAtariStyles();

  const li = document.createElement('div');
  li.className = 'shop-list-item shop-list-item--atari shop-list-item--soldout';
  li.innerHTML = `
    <div class="shop-list-item__icon">${item.icon}</div>
    <div class="shop-list-item__info">
      <div class="shop-list-item__name">${item.name}</div>
      ${isSolved
        ? `<p class="atari-hint-solved">✓ Code eingegeben — Atari-1337 entfesselt</p>`
        : `<div class="atari-paper-hint" id="atariHintNote">
            Navigiere zu 1337.html
           </div>`}
    </div>
    <div class="shop-list-item__buy-col"></div>
  `;
  if (!isSolved) {
    li.querySelector('#atariHintNote')?.addEventListener('click', () => {
      const now = Date.now();
      _atariHintClicks = _atariHintClicks.filter(t => now - t < 700);
      _atariHintClicks.push(now);
      if (_atariHintClicks.length >= 3) { _atariHintClicks = []; openAtariTerminal(); }
    });
  }
  return li;
}

const _SHOP_STACKABLE  = ['wachstumstrank', 'wachstumsBooster', 'coinsx3', 'glucksklee', 'lockmittel'];
const _SHOP_COUNT_KEYS = { wachstumstrank: 'wachstumstrankCount', wachstumsBooster: 'wachstumsBoosterCount', coinsx3: 'coinsx3Count', glucksklee: 'gluckskleeCount', lockmittel: 'lockmittelCount' };

function _buildStandardShopItemElement(item, shopData, allData, available, s2Open, soldOut) {
  const isStackable = _SHOP_STACKABLE.includes(item.id);
  const ownedCount  = isStackable ? (shopData[_SHOP_COUNT_KEYS[item.id]] ?? 0) : 0;
  const isActive    = !isStackable && !!item.consumable && !!shopData[item.id];
  const canAfford   = item.currency === 'kristall'
    ? getAvailableKristalle(shopData) >= item.price
    : available >= item.price;
  const hasMaxedCreature = item.upgradeItem
    ? s2Open && Object.entries(allData).some(([k, d]) => {
        const g = GAMES_CONFIG.find(cfg => cfg.id === k);
        if (g?.clusterLegi) return false; // Team-Legendär ignorieren
        return d?.creature && d.growth >= GROWTH_MAX && d.growth < GROWTH_S6;
      })
    : true;
  const btnDisabled = soldOut || isActive || !canAfford || !hasMaxedCreature;

  let typeClass = '';
  if (item.bookItem)           typeClass = 'shop-list-item--book';
  else if (item.atariHintItem) typeClass = 'shop-list-item--atari';
  else if (item.eggItem)       typeClass = `shop-list-item--egg-${item.eggType}`;
  else if (isActive)           typeClass = 'shop-list-item--active';

  const btnText = isActive ? '⚡ Aktiv' : 'Kaufen';
  const noEligible = item.upgradeItem && !hasMaxedCreature;

  const li = document.createElement('div');
  li.className = `shop-list-item ${typeClass}${soldOut ? ' shop-list-item--soldout' : ''}`.trim();
  li.innerHTML = `
    <div class="shop-list-item__icon">${item.icon}</div>
    <div class="shop-list-item__info">
      <div class="shop-list-item__name">${item.name}</div>
      <p class="shop-list-item__desc">${item.description}</p>
      <div class="shop-list-item__price"><span>${item.currency === 'kristall' ? '💎' : '🪙'}</span><span>${item.price} ${item.currency === 'kristall' ? 'Kristalle' : 'Münzen'}${item.kristallItem ? ` <span style="opacity:0.5;">→</span> ${item.kristallAmount} 💎` : ''}</span></div>
    </div>
    <div class="shop-list-item__buy-col">
      ${!soldOut ? `<button class="shop-list-item__btn"${btnDisabled ? ' disabled' : ''}>${btnText}</button>` : ''}
      ${isStackable && ownedCount > 0 ? `<div class="shop-item-owned">${ownedCount}× besitz</div>` : ''}
      ${soldOut && !item.atariHintItem ? `<div class="shop-soldout-ribbon${item.backupItem ? ' shop-soldout-ribbon--backup' : item.sealItem ? ' shop-soldout-ribbon--seal' : ''}"></div>` : ''}
    </div>
    ${noEligible ? `<div class="shop-list-item__no-eligible">Kein Monster auf Stufe 5</div>` : ''}
  `;
  if (!soldOut && !btnDisabled) {
    li.querySelector('.shop-list-item__btn').addEventListener('click', () => buyItem(item.id));
  }
  return li;
}

function confirmRelease(gameId) {
  const game    = GAMES_CONFIG.find(g => g.id === gameId);
  const allData = loadAllData();
  const data    = allData[gameId];
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;

  const hasC  = !!data.creature;
  const name  = hasC ? CREATURE_NAMES[data.creature] : 'das Ei';
  const stage = hasC ? getGrowthStage(data.growth) : -1;

  content.innerHTML = `
    <div style="text-align:center;">
      ${hasC
        ? `<div class="modal-creature-img">${getCreatureHTML(data.creature, stage)}</div>`
        : `<div style="font-size:3rem;margin:0 auto 12px;">🥚</div>`}
      <h2 style="font-family:var(--font-display);color:var(--clr-gold);font-size:1.25rem;margin:12px 0 10px;">Freilassen?</h2>
      <p style="color:var(--clr-cream-dim);line-height:1.65;margin-bottom:22px;">
        Möchtest du <strong style="color:var(--clr-cream);">${name}</strong> wirklich freilassen?<br>
        <em>${game.title}</em> beginnt danach mit einem neuen Ei.
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button onclick="releaseCreature('${gameId}')"
          style="background:var(--clr-red);color:#fff;border:none;border-radius:var(--radius-md);padding:10px 22px;font-family:var(--font-body);font-weight:800;font-size:0.9rem;cursor:pointer;">
          🕊️ Freilassen
        </button>
        <button onclick="document.getElementById('modalOverlay').hidden=true"
          style="background:var(--clr-surface2);color:var(--clr-cream);border:1px solid var(--clr-border);border-radius:var(--radius-md);padding:10px 22px;font-family:var(--font-body);font-weight:700;font-size:0.9rem;cursor:pointer;">
          Behalten
        </button>
      </div>
    </div>`;
  overlay.hidden = false;
}

function releaseCreature(gameId) {
  const allData        = loadAllData();
  updateSeenCreatures(allData);
  const keepCoins      = allData[gameId]?.coins || 0;
  allData[gameId]      = { ...defaultGameData(), coins: keepCoins };
  // saveGameData statt saveAllData: triggert Server-Sync via sync_game_state.
  saveGameData(gameId, allData[gameId]);
  document.getElementById('modalOverlay').hidden = true;
  renderHub();
}

function _isPurchased(shopData, itemId) {
  return shopData.purchased.includes(itemId);
}

function _charge(shopData, item) {
  if (item.currency === 'kristall') shopData.spentKristalle = (shopData.spentKristalle ?? 0) + item.price;
  else shopData.spentCoins += item.price;
}

function buyItem(itemId) {
  const item = [...SHOP_ITEMS, ...SHOP_ITEMS_P2, ...SHOP_ITEMS_P3].find(i => i.id === itemId);
  if (!item) return;
  const shopData  = loadShopData();
  const allData   = loadAllData();
  const available = getTotalCoins(allData) - shopData.spentCoins;
  if (item.currency === 'kristall') {
    if (getAvailableKristalle(shopData) < item.price) return;
  } else {
    if (available < item.price) return;
  }

  if (item.atariHintItem) {
    if (_isPurchased(shopData, itemId)) return;
    _charge(shopData, item);
    shopData.purchased.push(itemId);
    shopData.atariNumber = Math.floor(Math.random() * 8);
    saveShopData(shopData);
    renderShop(loadAllData());
    return;
  }

  if (item.backupItem) {
    if (_isPurchased(shopData, itemId)) return;
    _charge(shopData, item);
    shopData.purchased.push(itemId);
    saveShopData(shopData);
    closeShopModal();
    renderHub();
    return;
  }

  if (item.eggItem) {
    const nestId = 'nest_' + Date.now();
    _charge(shopData, item);
    shopData.nests.push({ nestId, eggType: item.eggType, gameId: null, gameUrl: null });
    shopData.pendingEggNestId = nestId;
    saveShopData(shopData);
    closeShopModal();
    renderHub();
    return;
  }

  if (item.sealItem) {
    if (_isPurchased(shopData, itemId)) return;
    _charge(shopData, item);
    shopData.purchased.push(itemId);
    if (!shopData.sealedEggs) shopData.sealedEggs = [];
    const egKey = item.sealType === 'heaven' ? 'himmel' : 'suempfe';
    if (!shopData.sealedEggs.some(e => e.type === egKey)) {
      shopData.sealedEggs.push({
        type: egKey,
        seals: [
          { hintBought: false, solved: false },
          { hintBought: false, solved: false },
          { hintBought: false, solved: false },
          { hintBought: false, solved: false },
        ],
        nestId: null,
      });
    }
    saveShopData(shopData);
    closeShopModal();
    renderHub();
    return;
  }

  if (item.upgradeItem) {
    const s2Open = getUserSeason() >= 2;
    if (!s2Open) return;
    const eligibleKeys = Object.keys(allData).filter(k => {
      const g = GAMES_CONFIG.find(cfg => cfg.id === k);
      if (g?.clusterLegi) return false; // Team-Legendär bleibt außen vor
      const d = allData[k];
      return d?.creature && d.growth >= GROWTH_MAX && d.growth < GROWTH_S6;
    });
    if (!eligibleKeys.length) return;
    const chosenKey = eligibleKeys[Math.floor(Math.random() * eligibleKeys.length)];
    const chosenCreature = allData[chosenKey].creature;
    allData[chosenKey].growth = GROWTH_S6;
    _charge(shopData, item);
    // Reihenfolge: saveShopData(shopData) ZUERST, damit saveGameData
    // beim Nest-Mirror ein bereits belastetes shopData sieht und der
    // frische hatched-Update nicht vom stale shopData überschrieben wird.
    saveShopData(shopData);
    // saveGameData statt saveAllData: triggert Server-Sync via sync_game_state.
    saveGameData(chosenKey, allData[chosenKey]);
    closeShopModal();
    renderHub();
    showEvolutionModal(chosenCreature);
    return;
  }

  if (item.kristallItem) {
    _charge(shopData, item);
    shopData.kristalle = (shopData.kristalle ?? 0) + item.kristallAmount;
    saveShopData(shopData);
    renderHub();
    renderShop(loadAllData());
    return;
  }

  if (item.consumable) {
    _charge(shopData, item);
    shopData[itemId + 'Count'] = (shopData[itemId + 'Count'] ?? 0) + 1;
    saveShopData(shopData);
    renderHub();
    renderShop(loadAllData());
    return;
  }
  if (_isPurchased(shopData, itemId)) return;
  _charge(shopData, item);
  shopData.purchased.push(itemId);
  saveShopData(shopData);
  closeShopModal();
  renderHub();
}

/* ─────────────────────────────────────────────────
   7. WACHSTUMSTRANK
   ───────────────────────────────────────────────── */
function tryApplyWachstumstrank(gameId) {
  const game = GAMES_CONFIG.find(g => g.id === gameId);
  // Team-Legendär wächst ausschließlich durch die Trainings-Aufgaben,
  // keine Trank-Beschleunigung. Der Trank-Button wird für ihn nicht
  // gerendert; dieser Guard blockt nur falls doch mal ein Aufruf
  // durchrutscht.
  if (game?.clusterLegi) return;
  const sd = loadShopData();
  if ((sd.wachstumstrankCount ?? 0) <= 0) return;
  const allData = loadAllData();
  const data = allData[gameId];
  if (!data || !data.creature || data.growth >= GROWTH_MAX) return;
  data.growth = Math.min(data.growth + 5, GROWTH_MAX);
  // Reihenfolge kritisch bei Nests: saveShopData ZUERST, saveGameData DANACH.
  // saveGameData(nestId) mirror't nests[i].hatched in shopData und ruft
  // intern saveShopData nach einem loadShopData(). Käme das umgekehrt,
  // würde das nachgelagerte saveShopData(sd) mit dem stale sd (ohne
  // frischen Mirror) den hatched-Wert clobbern → auf Zweitgerät fehlt der
  // Fortschritt, obwohl er lokal korrekt in lernwelt_v3 steht.
  sd.wachstumstrankCount--;
  saveShopData(sd);
  saveGameData(gameId, data);
  renderHub();
}

/* ─────────────────────────────────────────────────
   STEIN DER VOLLENDUNG – Evolutionsmodal
   ───────────────────────────────────────────────── */
function showEvolutionModal(creature) {
  const name = CREATURE_NAMES[creature] ?? creature;
  const overlay = document.createElement('div');
  overlay.id = 'evolutionOverlay';
  overlay.innerHTML = `
    <style>
      #evolutionOverlay {
        position:fixed;inset:0;z-index:10000;
        background:radial-gradient(ellipse at center,#0a0a1a 0%,#000 100%);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        cursor:default;opacity:0;transition:opacity 0.5s;
      }
      @keyframes _evo-pulse {
        0%,100%{filter:drop-shadow(0 0 6px #fff) brightness(1)}
        50%{filter:drop-shadow(0 0 22px #fff) drop-shadow(0 0 44px #ffd700) brightness(1.18)}
      }
      @keyframes _evo-float {
        0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)}
      }
      @keyframes _evo-flash {
        0%{opacity:0} 35%{opacity:1} 100%{opacity:0}
      }
      @keyframes _evo-appear {
        from{opacity:0;transform:scale(0.3) rotate(-8deg)}
        to{opacity:1;transform:scale(1) rotate(0deg)}
      }
      @keyframes _evo-aura {
        0%,100%{filter:drop-shadow(0 0 14px #ffd700) drop-shadow(0 0 28px #ff6400) brightness(1.05)}
        50%{filter:drop-shadow(0 0 28px #ffd700) drop-shadow(0 0 56px #ff6400) drop-shadow(0 0 84px #ffff00) brightness(1.2)}
      }
      @keyframes _evo-title {
        from{opacity:0;letter-spacing:0.5em}
        to{opacity:1;letter-spacing:0.08em}
      }
      @keyframes _evo-particles {
        0%{opacity:0;transform:translateY(0) scale(0)}
        20%{opacity:1}
        100%{opacity:0;transform:translateY(-60px) scale(1.5)}
      }
      #_evo-initial { display:flex;flex-direction:column;align-items:center;gap:18px }
      #_evo-initial .creature-img {
        width:170px;height:170px;object-fit:contain;
        animation:_evo-pulse 1.3s ease-in-out infinite,_evo-float 2.5s ease-in-out infinite;
      }
      #_evo-flash-layer {
        position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:1;
      }
      #_evo-final { display:none;flex-direction:column;align-items:center;gap:18px;z-index:2 }
      #_evo-final.show { display:flex }
      #_evo-final .creature-img {
        width:210px;height:210px;object-fit:contain;
        animation:_evo-appear 0.9s cubic-bezier(0.34,1.56,0.64,1),_evo-aura 2.2s 0.9s ease-in-out infinite,_evo-float 3s 0.9s ease-in-out infinite;
      }
      ._evo-name-before {
        color:rgba(255,215,0,0.7);font-family:Cinzel,serif;font-size:1.2rem;font-weight:600;
        text-align:center;text-shadow:0 0 12px #ff8c00;
      }
      ._evo-title-final {
        color:#ffd700;font-family:Cinzel,serif;font-size:1.5rem;font-weight:700;
        text-align:center;text-shadow:0 0 18px #ffd700,0 0 36px #ff8c00;
        animation:_evo-title 1s 0.4s both;
      }
      ._evo-badge {
        color:#fff;background:linear-gradient(135deg,#7b2ff7,#f107a3);
        font-family:Cinzel,serif;font-size:0.75rem;font-weight:700;letter-spacing:0.12em;
        padding:3px 12px;border-radius:20px;text-transform:uppercase;
        animation:_evo-appear 1s 0.8s both;box-shadow:0 0 16px #7b2ff7;
      }
      ._evo-particles {
        position:fixed;font-size:1.6rem;pointer-events:none;
        animation:_evo-particles 1.8s ease-out both;
      }
      #_evo-close-btn {
        position:absolute;bottom:28px;
        padding:10px 28px;font-family:Cinzel,serif;font-size:0.95rem;font-weight:700;
        color:#1a0e05;background:linear-gradient(135deg,#ffd700,#f0b429);
        border:none;border-radius:999px;cursor:pointer;
        box-shadow:0 0 18px rgba(255,215,0,0.5);
        opacity:0;transition:opacity 0.4s ease;pointer-events:none;
      }
      #_evo-close-btn.show { opacity:1;pointer-events:auto; }
    </style>
    <div id="_evo-flash-layer"></div>
    <div id="_evo-initial">
      ${getCreatureHTML(creature, 4)}
      <div class="_evo-name-before">${name}</div>
    </div>
    <div id="_evo-final">
      ${getCreatureHTML(creature, 5)}
      <div class="_evo-title-final">✦ ${name} ✦</div>
      <div class="_evo-badge">Vollendet</div>
    </div>
    <button id="_evo-close-btn">Weiter ✦</button>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  setTimeout(() => {
    const flash = overlay.querySelector('#_evo-flash-layer');
    flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:1;pointer-events:none;animation:_evo-flash 0.7s ease';
    const spawnParticle = (emoji, delay) => {
      const p = document.createElement('span');
      p.className = '_evo-particles';
      p.textContent = emoji;
      p.style.cssText = `left:${15 + Math.random()*70}%;top:${30 + Math.random()*40}%;animation-delay:${delay}s`;
      overlay.appendChild(p);
    };
    ['✨','⭐','🌟','💫','✨','⭐','💫','🌟'].forEach((e,i) => spawnParticle(e, i * 0.12));
    setTimeout(() => {
      overlay.querySelector('#_evo-initial').style.display = 'none';
      const final = overlay.querySelector('#_evo-final');
      final.style.display = 'flex';
      requestAnimationFrame(() => final.classList.add('show'));
      setTimeout(() => overlay.querySelector('#_evo-close-btn').classList.add('show'), 800);
    }, 350);
  }, 2400);

  overlay.querySelector('#_evo-close-btn').addEventListener('click', () => {
    overlay.style.transition = 'opacity 0.3s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 320);
  });
}

function showPasswordPrompt(gameId) {
  const game    = GAMES_CONFIG.find(g => g.id === gameId);
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;

  content.innerHTML = `
    <div style="text-align:center;padding:8px 0;">
      <div style="font-size:3rem;margin-bottom:12px;">🔑</div>
      <h2 style="font-family:var(--font-display);color:var(--clr-gold);font-size:1.3rem;margin:0 0 8px;">${game.icon} ${game.title}</h2>
      <p style="color:var(--clr-cream-dim);margin-bottom:18px;line-height:1.5;">Gib das Passwort ein,<br>um dieses Spiel freizuschalten.</p>
      <input id="pwInput" type="password" placeholder="Passwort…" autocomplete="off"
        style="width:100%;max-width:220px;padding:10px 14px;border-radius:var(--radius-md);border:1px solid var(--clr-border);background:var(--clr-surface2);color:var(--clr-cream);font-family:var(--font-body);font-size:1rem;box-sizing:border-box;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
      <div id="pwError" style="color:#e05;font-size:0.82rem;min-height:1.4em;margin-bottom:10px;"></div>
      <button id="pwSubmit"
        style="background:var(--clr-green);color:#fff;border:none;border-radius:var(--radius-md);padding:10px 28px;font-family:var(--font-body);font-weight:800;font-size:0.95rem;cursor:pointer;">
        Freischalten
      </button>
    </div>`;
  overlay.hidden = false;

  const input  = document.getElementById('pwInput');
  const error  = document.getElementById('pwError');
  const submit = document.getElementById('pwSubmit');

  const attempt = async () => {
    submit.disabled = true;
    error.textContent = '';
    const pw = input.value;
    const loggedIn = window.isLoggedIn?.() ?? false;

    const onSuccess = () => {
      saveUnlocked(gameId);
      overlay.hidden = true;
      window.location.href = game.url + '?id=' + gameId;
    };
    const onWrong = () => {
      error.textContent = 'Falsches Passwort – bitte versuche es erneut.';
      input.value = '';
      submit.disabled = false;
      input.focus();
    };

    if (loggedIn && window.__accessToken) {
      // Server-side Check via unlock_game RPC
      try {
        const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/unlock_game`, {
          method: 'POST',
          headers: {
            apikey: window.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${window.__accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ p_game_id: gameId, p_password: pw })
        });
        const body = await res.json().catch(() => ({}));
        if (body?.ok) onSuccess();
        else onWrong();
      } catch (e) {
        console.error('[unlock] RPC-Fehler:', e);
        error.textContent = 'Netzwerkfehler. Versuche es erneut.';
        submit.disabled = false;
      }
      return;
    }

    // Guest: client-side hash check gegen GAME_ACCESS (kein Progress-Save)
    const cfg = GAME_ACCESS[gameId];
    if (!cfg?.passwordHash) { onWrong(); return; }
    const inputHash = await hashPassword(pw);
    if (inputHash === cfg.passwordHash) onSuccess();
    else onWrong();
  };

  submit.addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  setTimeout(() => input.focus(), 50);
}

/* ─────────────────────────────────────────────────
   8. NEST-SEKTION (zwischen Spielen und Shop)
   ───────────────────────────────────────────────── */
const EGG_TYPE_NAMES  = { rare: 'Selten', mythic: 'Episch', legendary: 'Legendär', atari: 'ATARI', pfau: '🦚 Pfau', himmel: '🌟 Ei des Himmels', suempfe: '🌿 Ei der Sümpfe' };
const SEAL_CREATURE   = { himmel: 'chinDrache', suempfe: 'schnabeltier' };

function renderNestSection(allData) {
  const section = document.getElementById('nestSection');
  const grid    = document.getElementById('nestsGrid');
  if (!section || !grid) return;

  const shopData = loadShopData();
  if (!shopData.nests.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = '';

  for (const nest of shopData.nests) {
    grid.appendChild(buildNestCard(nest, allData, shopData));
  }
}

function buildNestCard(nest, allData, shopData) {
  const nestData    = allData[nest.nestId] || defaultGameData();
  const hasCreature = !!nestData.creature;
  const stage       = hasCreature ? getGrowthStage(nestData.growth) : -1;
  const progressPct = hasCreature ? Math.min(nestData.growth / GROWTH_MAX * 100, 100) : 0;
  const epic        = hasCreature && isEpic(nestData.creature);
  const legendary   = hasCreature && isLegendary(nestData.creature);
  const linkedGame  = GAMES_CONFIG.find(g => g.id === nest.gameId);
  const isPending   = shopData.pendingEggNestId === nest.nestId;
  const eggTypeName = EGG_TYPE_NAMES[nest.eggType] ?? nest.eggType;
  // canPlay muss an nest.gameId hängen, nicht an hasCreature. Sealed-Egg-Nester
  // (himmel/suempfe) und zurückgesetzte Legi-Nester haben creature bereits gesetzt,
  // aber keine gameUrl → playNest() returnt still und der Klick tut nichts.
  const canPlay     = !!nest.gameId;
  const nestMaxed   = hasCreature && nestData.growth >= GROWTH_MAX;
  const canUseTrank = hasCreature && !nestMaxed && (shopData.wachstumstrankCount ?? 0) > 0;
  const isAtariEgg  = !hasCreature && nest.eggType === 'atari';
  const isPfauEgg   = !hasCreature && nest.eggType === 'pfau';

  const imgContent = hasCreature
    ? `<div class="hub-creature-display">${getCreatureHTML(nestData.creature, stage)}</div>`
    : eggStage0();

  const specialBadge = epic ? `<span class="epic-badge">✦ Episch ✦</span>`
    : legendary ? `<span class="legendary-badge">✦ Legendär ✦</span>` : '';

  const bonusCoins = hasCreature ? getGrowthBonusCoins(nestData.growth || 0) : 0;
  const bonusHint = bonusCoins > 0
    ? `<div class="game-card__bonus-hint" title="${bonusCoins === 10 ? 'Vollendungs-Bonus' : 'Ausgewachsen-Bonus'}: +${bonusCoins} Münzen pro Runde">+${bonusCoins}<span class="game-card__bonus-hint-coin">🪙</span></div>`
    : '';

  let playBtn;
  if (canPlay) {
    playBtn = `<button class="game-card__btn">Spielen!</button>`;
  } else {
    playBtn = isPending
      ? `<p class="nest-card__hint">Klicke auf "Spielen!" bei einem Spiel!</p>`
      : `<p class="nest-card__hint" style="opacity:0.5;">Wähle ein Spiel…</p>`;
  }

  const nestActiveItems = canPlay ? getActiveItemsForSlot(nestData, shopData) : [];

  const card = document.createElement('div');
  card.className = `game-card nest-game-card${hasCreature ? ' has-creature' : ''}${epic ? ' game-card--epic' : ''}${legendary ? ' game-card--legendary' : ''}${isAtariEgg ? ' nest-card--atari' : ''}${isPfauEgg ? ' nest-card--pfau' : ''}${isPending ? ' nest-card--pending' : ''}${nestMaxed ? ' creature-maxed' : ''}`;
  card.innerHTML = `
    ${bonusHint}
    <h3 class="game-card__title">🥚 ${eggTypeName}</h3>
    <p class="nest-card__subtitle">
      ${linkedGame ? `${linkedGame.icon} ${linkedGame.title}` : '<em>Spiel noch nicht gewählt</em>'}
    </p>
    ${specialBadge}
    <div class="game-card__creature-wrap${hasCreature ? ' creature-preview' : ''}">
      ${imgContent}
    </div>
    ${!hasCreature ? `<p class="game-card__stage-label" style="font-size:0.8rem;color:var(--clr-cream-dim);">Ei schlummert…</p>` : ''}
    <div class="game-card__progress">
      <div class="game-card__progress-fill" style="width:${progressPct}%"></div>
    </div>
    <div class="game-card__points">
      ⭐ Gesamt: <strong>${nestData.points}</strong>
      &nbsp;·&nbsp; 🔄 Runden: <strong>${nestData.roundsPlayed}</strong>
    </div>
    ${(function(){
      if (!nestActiveItems.length) return playBtn;
      if (nestActiveItems.length === 1) {
        const it = nestActiveItems[0];
        return `<div class="game-card__action-row"><button class="game-card__btn">Spielen!</button><button class="game-card__use-btn" data-item="${it.id}" data-count-key="${it.countKey}" title="${it.name} einsetzen">nutze ${it.icon}</button></div>`;
      }
      const useBtns = nestActiveItems.map(it =>
        `<button class="game-card__use-btn game-card__use-btn--icon" data-item="${it.id}" data-count-key="${it.countKey}" title="${it.name} einsetzen">${it.icon}</button>`
      ).join('');
      return `<div class="game-card__action-row"><button class="game-card__btn">Spielen!</button>${useBtns}</div>`;
    })()}
    <button class="game-card__release" title="Tier freilassen">${RELEASE_ICON}</button>
    ${canUseTrank ? `<button class="game-card__trank-btn" title="Wachstumstrank anwenden">🧪</button>` : ''}
  `;

  attachNestCardListeners(card, nest, nestData, hasCreature, canPlay);
  return card;
}

function attachNestCardListeners(card, nest, nestData, hasCreature, canPlay) {
  if (canPlay) {
    card.querySelector('.game-card__btn').addEventListener('click', () => {
      playNest(nest.nestId);
    });
    card.querySelectorAll('.game-card__use-btn').forEach(useBtn => {
      useBtn.addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const sd = loadShopData();
        const countKey = btn.dataset.countKey;
        const itemId   = btn.dataset.item;
        if (!countKey || (sd[countKey] ?? 0) <= 0) return;
        sd[countKey]--;
        sd[itemId] = true;
        saveShopData(sd);
        if (!nest.gameUrl) return;
        window.location.href = nest.gameUrl + '?id=' + nest.nestId + '&egg=' + nest.eggType;
      });
    });
  }
  if (hasCreature) {
    card.querySelector('.creature-preview')?.addEventListener('click', e => {
      e.stopPropagation();
      showCreatureModal(nestData);
    });
  }
  card.querySelector('.game-card__trank-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    tryApplyWachstumstrank(nest.nestId);
  });
  card.querySelector('.game-card__release').addEventListener('click', e => {
    e.stopPropagation();
    confirmReleaseNest(nest.nestId);
  });
}

function playNest(nestId) {
  const sd = loadShopData();
  const nest = sd.nests.find(n => n.nestId === nestId);
  if (!nest || !nest.gameUrl) return;
  window.location.href = nest.gameUrl + '?id=' + nestId + '&egg=' + nest.eggType;
}

function confirmReleaseNest(nestId) {
  const sd      = loadShopData();
  const nest    = sd.nests.find(n => n.nestId === nestId);
  if (!nest) return;
  const nestData = getGameData(nestId);
  const overlay  = document.getElementById('modalOverlay');
  const content  = document.getElementById('modalContent');
  if (!overlay || !content) return;

  const hasC      = !!nestData.creature;
  const name      = hasC ? CREATURE_NAMES[nestData.creature] : 'das Ei';
  const stage     = hasC ? getGrowthStage(nestData.growth) : -1;
  const legendary = nest.eggType === 'pfau' || nest.eggType === 'atari';

  content.innerHTML = `
    <div style="text-align:center;">
      ${hasC
        ? `<div class="modal-creature-img">${getCreatureHTML(nestData.creature, stage)}</div>`
        : `<div style="font-size:3rem;margin:0 auto 12px;">🥚</div>`}
      <h2 style="font-family:var(--font-display);color:var(--clr-gold);font-size:1.25rem;margin:12px 0 10px;">${legendary ? 'Zurück zum Ei?' : 'Freilassen?'}</h2>
      <p style="color:var(--clr-cream-dim);line-height:1.65;margin-bottom:22px;">
        Möchtest du <strong style="color:var(--clr-cream);">${name}</strong> wirklich ${legendary ? 'zurücksetzen' : 'freilassen'}?<br>
        ${legendary ? 'Das legendäre Ei bleibt erhalten — du musst es neu mit einem Spiel verknüpfen.' : 'Der Nest-Slot wird danach geleert.'}
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button onclick="releaseNest('${nestId}')"
          style="background:var(--clr-red);color:#fff;border:none;border-radius:var(--radius-md);padding:10px 22px;font-family:var(--font-body);font-weight:800;font-size:0.9rem;cursor:pointer;">
          ${legendary ? '🥚 Zurücksetzen' : '🕊️ Freilassen'}
        </button>
        <button onclick="document.getElementById('modalOverlay').hidden=true"
          style="background:var(--clr-surface2);color:var(--clr-cream);border:1px solid var(--clr-border);border-radius:var(--radius-md);padding:10px 22px;font-family:var(--font-body);font-weight:700;font-size:0.9rem;cursor:pointer;">
          Behalten
        </button>
      </div>
    </div>`;
  overlay.hidden = false;
}

function releaseNest(nestId) {
  updateSeenCreatures(loadAllData());
  const sd   = loadShopData();
  const nest = sd.nests.find(n => n.nestId === nestId);
  if (!nest) return;

  const nestCoins = getGameData(nestId).coins || 0;
  const legendary = ['pfau', 'atari', 'himmel', 'suempfe'].includes(nest.eggType);
  // Sealed-Eggs behalten ihre feste Kreatur (himmel=chinDrache, suempfe=schnabeltier)
  // auch nach Reset: der User wählt neues Spiel und spielt von growth=0 aus weiter,
  // ohne die Kreatur zu verlieren. Atari/Pfau werden dagegen komplett auf Ei
  // zurückgesetzt — sie brauchen eine Schlupf-Runde im nächsten Spiel.
  const keepCreature = nest.eggType === 'himmel' || nest.eggType === 'suempfe'
    ? SEAL_CREATURE[nest.eggType]
    : null;

  if (legendary) {
    nest.gameId           = null;
    nest.gameUrl          = null;
    if (keepCreature) {
      // hatched auf Baby-Zustand mit erhaltener Kreatur setzen.
      nest.hatched = { creature: keepCreature, growth: 0, points: 0, roundsPlayed: 0, coins: 0 };
    } else {
      // Atari/Pfau: kompletter Reset auf Ei — creature wird beim 1. Play neu
      // via determineEggCreature bestimmt.
      delete nest.hatched;
    }
    sd.pendingEggNestId   = nestId;
    sd.bankedCoins        = (sd.bankedCoins || 0) + nestCoins;
  } else {
    sd.nests       = sd.nests.filter(n => n.nestId !== nestId);
    sd.bankedCoins = (sd.bankedCoins || 0) + nestCoins;
  }
  saveShopData(sd);

  try {
    const all = loadStorage(STORAGE_KEY);
    if (keepCreature) {
      // Kreatur behalten, aber growth/coins/roundsPlayed/points zurücksetzen.
      all[nestId] = { points: 0, roundsPlayed: 0, creature: keepCreature, growth: 0, coins: 0 };
    } else {
      delete all[nestId];
    }
    saveStorage(STORAGE_KEY, all);
  } catch(e) {}
  document.getElementById('modalOverlay').hidden = true;
  renderHub();
}

/* ─────────────────────────────────────────────────
   9. AUSSTEHENDES EI-MODUS
   ───────────────────────────────────────────────── */
function enterPendingEggMode() {
  if (document.getElementById('pendingEggBanner')) return;
  const sd         = loadShopData();
  const nestId     = sd.pendingEggNestId;
  const nestData   = nestId ? getGameData(nestId) : null;
  const hasCreature = !!(nestData && nestData.creature);
  const banner = document.createElement('div');
  banner.id = 'pendingEggBanner';
  banner.className = 'trank-banner';
  banner.innerHTML = `
    <span>${hasCreature ? '✨ Wähle ein Spiel, um deine Kreatur dort zu leveln!' : '🥚 Klicke bei einem Spiel auf "Spielen!", um dein Ei dort auszubrüten!'}</span>
    <button onclick="cancelPendingEgg()">✕ Abbrechen</button>
  `;
  document.body.appendChild(banner);
}

function exitPendingEggMode() {
  document.getElementById('pendingEggBanner')?.remove();
}

function cancelPendingEgg() {
  const sd = loadShopData();
  const nestId = sd.pendingEggNestId;
  if (nestId) {
    const nest = sd.nests.find(n => n.nestId === nestId);
    if (nest) {
      const eggItem = SHOP_ITEMS.find(i => i.eggItem && i.eggType === nest.eggType);
      if (eggItem) sd.spentCoins = Math.max(0, sd.spentCoins - eggItem.price);
      sd.nests = sd.nests.filter(n => n.nestId !== nestId);
    }
    sd.pendingEggNestId = null;
  }
  saveShopData(sd);
  exitPendingEggMode();
  renderHub();
}

/* ─────────────────────────────────────────────────
   9b. BACKUP-SWAP-MODUS
   ───────────────────────────────────────────────── */
function enterBackupSwapMode() {
  if (document.getElementById('backupSwapBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'backupSwapBanner';
  banner.className = 'trank-banner';
  banner.innerHTML = `
    <span>💾 Wähle einen Hub zum Monster tauschen</span>
    <button onclick="cancelBackupSwap()">✕ Abbrechen</button>
  `;
  document.body.appendChild(banner);
}

function exitBackupSwapMode() {
  document.getElementById('backupSwapBanner')?.remove();
}

function cancelBackupSwap() {
  const sd = loadShopData();
  sd.pendingBackup = null;
  saveShopData(sd);
  exitBackupSwapMode();
  renderHub();
}

/* ─────────────────────────────────────────────────
   10. VERSIEGELTE EIER — Siegel-System
   ───────────────────────────────────────────────── */
const SEALED_EGG_DEFS = {
  himmel: {
    label: 'Ei des Himmels',
    icon: '🌟',
    imgSrc: 'data/originals/Himmelssiegel.png',
    eggType: 'himmel',
    seals: [
      {
        name: 'Siegel I', icon: '☁️',
        hint: 'Alle im Netz kennen deine Adresse. Kennst du sie auch?',
        hasInput: true,
        verifyAsync: async function(val) {
          try {
            const r = await fetch('https://api.ipify.org?format=json');
            const d = await r.json();
            const h = async s => Array.from(new Uint8Array(
              await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.trim()))
            )).map(b => b.toString(16).padStart(2,'0')).join('');
            return await h(val) === await h(d.ip);
          } catch(e) { return false; }
        }
      },
      {
        name: 'Siegel II', icon: '📜',
        hint: 'Das Gedächtnis von IServ reicht weiter zurück als du denkst. Was geschah hier vor einem Viertel Jahrhundert?',
        hasInput: true,
        verifyAsync: async function(val) {
          const h = async s => Array.from(new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.trim()))
          )).map(b => b.toString(16).padStart(2,'0')).join('');
          return await h(val) === '9fbbe982e10d5be5810770259fa95ce2db0cdaf8ec937ae64eab931f06ab4177';
        }
      },
      {
        name: 'Siegel III', icon: '⚡',
        hint: `<code style="font-family:'Courier New',monospace;font-size:0.74rem;color:#c8a800;line-height:1.9;word-break:break-all;display:block">01010111 01101111 01101100 01101011 01100101</code>`,
        hasInput: true,
        verifyAsync: async function(val) {
          const buf  = new TextEncoder().encode(val.trim());
          const hash = await crypto.subtle.digest('SHA-256', buf);
          const hex  = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
          return hex === '3a1338ef215e8415265abb1a4b41ca314ab7a7a7ebcc6e8f0aa341f3dbc4063c';
        }
      },
      {
        name: 'Siegel IV', icon: '🏗️',
        hint: 'Am Fundament der Baumeister. Wo Nichts zu Etwas wird.\n\n54.31148725259439, 10.118052182410645',
        hasInput: true,
        verifyAsync: async function(val) {
          const h = async s => Array.from(new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.trim()))
          )).map(b => b.toString(16).padStart(2,'0')).join('');
          return await h(val) === '577587694431fae945617def651986628c43050eea00c5e45660ba158f8a60da';
        }
      },
    ]
  },
  suempfe: {
    label: 'Ei der Sümpfe',
    icon: '🌿',
    imgSrc: 'data/originals/Sumpfsiegel.png',
    eggType: 'suempfe',
    seals: [
      {
        name: 'Siegel I', icon: '🧪',
        hint: 'Im Trank liegt die Kraft. Bringe eine Kreatur vom Baby zur maximalen Stufe – ausschließlich durch Wachstumstränke, ohne ein weiteres Spiel zu spielen.',
        verify: function() {
          const all = loadStorage(STORAGE_KEY);
          for (const key in all) {
            const d = all[key];
            if (d.creature && d.growth >= GROWTH_MAX && d.roundsPlayed <= 1) return true;
          }
          return false;
        }
      },
      {
        name: 'Siegel II', icon: '🏆',
        hint: function() {
          const ff  = parseInt(localStorage.getItem('fokusflow_highscore')  || '0');
          const alg = readAlgBestTime();
          const tt  = parseInt(localStorage.getItem('tippturbo_hs')         || '0');
          const th  = 15 * 60 + alg;
          const algStr = String(Math.floor(th / 60) % 24).padStart(2,'0') + ':' + String(th % 60).padStart(2,'0');
          const row = (ok, text) => `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:0.84rem">
            <span style="color:${ok ? '#4ade80' : 'rgba(255,255,255,0.28)'};font-size:1rem">${ok ? '✓' : '○'}</span>
            <span style="color:${ok ? '#e8dcc8' : 'rgba(255,255,255,0.45)'}">${text}</span></div>`;
          return '<div style="margin-top:4px">'
            + row(ff  >= 850, `Fokusflow – ${ff} / 850 Pkt`)
            + row(alg >= 660, `The Algorithm – ${algStr} Uhr (Ziel: 02:00)`)
            + row(tt  >= 450, `Tip Turbo Kids – ${tt} / 450 Pkt`)
            + '</div>';
        },
        verify: function() {
          return parseInt(localStorage.getItem('fokusflow_highscore') || '0') >= 850
              && readAlgBestTime() >= 660
              && parseInt(localStorage.getItem('tippturbo_hs')        || '0') >= 450;
        }
      },
      {
        name: 'Siegel III', icon: '⭐',
        hint: function() {
          const seen = loadShopData().seenCreatures;
          const count = Object.values(seen).filter(stage => stage >= 5).length;
          const done = count >= 5;
          return `Bringe mindestens 5 Kreaturen auf die Stufe Vollendet (✦).<br>
            <span style="font-size:1.1rem;font-weight:bold;color:${done ? '#4ade80' : '#e8dcc8'}">${count} / 5</span>`;
        },
        verify: function() {
          const seen = loadShopData().seenCreatures;
          return Object.values(seen).filter(stage => stage >= 5).length >= 5;
        }
      },
      {
        name: 'Siegel IV', icon: '🐣',
        hint: function() {
          const all     = loadStorage(STORAGE_KEY);
          const withC   = GAMES_CONFIG.filter(g => all[g.id] && all[g.id].creature);
          const babies  = withC.filter(g => getGrowthStage(all[g.id].growth) === 0).length;
          const done    = babies >= 6;
          return `In mindestens 6 Spielslots schlummern nur Babys.<br>
            <span style="font-size:1.1rem;font-weight:bold;color:${done ? '#4ade80' : '#e8dcc8'}">${babies} / 6</span>`;
        },
        verify: function() {
          const all    = loadStorage(STORAGE_KEY);
          const withC  = GAMES_CONFIG.filter(g => all[g.id] && all[g.id].creature);
          const babies = withC.filter(g => getGrowthStage(all[g.id].growth) === 0).length;
          return babies >= 6;
        }
      },
    ]
  },
};

function renderSealedEggs() {
  const section = document.getElementById('sealedEggsSection');
  const grid    = document.getElementById('sealedEggsGrid');
  if (!section || !grid) return;

  const sd = loadShopData();
  const openedTypes = new Set(sd.openedSealTypes ?? []);
  const activeEggs = (sd.sealedEggs ?? []).filter(e =>
    !openedTypes.has(e.type) &&
    (!e.nestId || !sd.nests.some(n => n.nestId === e.nestId))
  );

  if (!activeEggs.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = '';

  for (const egg of activeEggs) {
    const def          = SEALED_EGG_DEFS[egg.type];
    if (!def) continue;
    const solvedCount  = egg.seals.filter(s => s.solved).length;
    const allSolved    = solvedCount === 4;

    const card = document.createElement('div');
    card.className = `game-card sealed-egg-card${allSolved ? ' sealed-egg-card--ready' : ''}`;
    card.innerHTML = `
      <h3 class="game-card__title">${def.icon} ${def.label}</h3>
      <div class="sealed-egg-img-wrap">
        <img src="${def.imgSrc}" class="sealed-egg-img" alt="${def.label}">
      </div>
      <p class="sealed-egg-progress">${solvedCount} / 4 Siegel gebrochen</p>
      <button class="game-card__btn">${allSolved ? '✨ Ei öffnen!' : 'Siegel untersuchen'}</button>
    `;
    card.querySelector('.game-card__btn').addEventListener('click', () => openSealedEggModal(egg.type));
    grid.appendChild(card);
  }
}

let _sealModalType = null;

function autoCheckSeals(type) {
  const def = SEALED_EGG_DEFS[type];
  if (!def) return;
  const sd  = loadShopData();
  const egg = (sd.sealedEggs ?? []).find(e => e.type === type);
  if (!egg) return;
  let changed = false;
  def.seals.forEach((sealDef, i) => {
    if (egg.seals[i].solved || !egg.seals[i].hintBought) return;
    if (typeof sealDef.verify === 'function' && sealDef.verify()) {
      egg.seals[i].solved = true;
      changed = true;
    }
  });
  if (changed) { saveShopData(sd); renderSealedEggs(); }
}

function openSealedEggModal(type) {
  _sealModalType = type;
  const overlay = document.getElementById('sealedEggOverlay');
  if (!overlay) return;
  autoCheckSeals(type);
  renderSealedEggModalContent(type);
  overlay.hidden = false;
  document.getElementById('sealedEggClose')?.addEventListener('click', closeSealedEggModal, { once: true });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSealedEggModal(); }, { once: true });
}

function closeSealedEggModal() {
  const overlay = document.getElementById('sealedEggOverlay');
  if (overlay) overlay.hidden = true;
  _sealModalType = null;
}

function renderSealedEggModalContent(type) {
  const content = document.getElementById('sealedEggModalContent');
  if (!content) return;

  const def = SEALED_EGG_DEFS[type];
  if (!def) return;

  const sd = loadShopData();
  const egg = (sd.sealedEggs ?? []).find(e => e.type === type);
  if (!egg) return;

  const kristalle   = getAvailableKristalle(sd);
  const solvedCount = egg.seals.filter(s => s.solved).length;
  const allSolved   = solvedCount === 4;

  const tilesHTML = egg.seals.map((s, i) => {
    const sealDef = def.seals[i];
    if (s.solved) {
      return `
        <div class="seal-card seal-card--broken">
          <div class="seal-card__icon">${sealDef.icon}</div>
          <div class="seal-card__name">${sealDef.name}</div>
          <div class="seal-card__solved">✓ gebrochen</div>
        </div>`;
    }
    if (!s.hintBought) {
      const canAfford = kristalle >= 5;
      return `
        <div class="seal-card seal-card--locked">
          <div class="seal-card__icon">🔒</div>
          <div class="seal-card__name">${sealDef.name}</div>
          <button class="seal-hint-btn${canAfford ? '' : ' seal-hint-btn--disabled'}"
            onclick="buySealHint('${type}',${i})" ${canAfford ? '' : 'disabled'}>
            Hinweis (5 💎)
          </button>
        </div>`;
    }
    // hint bought
    const hintText = typeof sealDef.hint === 'function' ? sealDef.hint() : sealDef.hint;
    const inputHTML = sealDef.hasInput
      ? `<div class="seal-input-row">
           <input class="seal-input" type="text" placeholder="Antwort…" id="sealInput_${type}_${i}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
           <button class="seal-submit-btn" onclick="verifySeal('${type}',${i})">✓</button>
         </div>
         <div class="seal-error" id="sealError_${type}_${i}" hidden>Falsch – versuch es nochmal.</div>`
      : sealDef.hasButton
      ? `<button class="seal-submit-btn" style="margin-top:10px;width:100%;padding:8px" onclick="verifySeal('${type}',${i})">Prüfen ↗</button>
         <div class="seal-error" id="sealError_${type}_${i}" hidden>Bedingung noch nicht erfüllt.</div>`
      : '';
    return `
      <div class="seal-card seal-card--hinted" id="sealCard_${type}_${i}">
        <div class="seal-card__icon">${sealDef.icon} 🔓</div>
        <div class="seal-card__name">${sealDef.name}</div>
        <p class="seal-hint-text">${hintText}</p>
        ${inputHTML}
      </div>`;
  }).join('');

  content.innerHTML = `
    <h2 class="seal-modal-title">${def.icon} ${def.label}</h2>
    <p class="seal-modal-sub">${solvedCount} von 4 Siegeln gebrochen</p>
    <div class="seal-grid">${tilesHTML}</div>
    ${allSolved ? `<button class="seal-open-btn" onclick="triggerSealEggOpening('${type}')">✨ Ei öffnen!</button>` : ''}
  `;

  def.seals.forEach((_, i) => {
    const inp = document.getElementById(`sealInput_${type}_${i}`);
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') verifySeal(type, i); });
  });
}

function buySealHint(type, index) {
  const sd = loadShopData();
  if (getAvailableKristalle(sd) < 5) return;
  const egg = (sd.sealedEggs ?? []).find(e => e.type === type);
  if (!egg || egg.seals[index].hintBought) return;
  egg.seals[index].hintBought = true;
  sd.spentKristalle = (sd.spentKristalle ?? 0) + 5;
  saveShopData(sd);
  renderSealedEggModalContent(type);
  renderSealedEggs();
  renderCoinDisplay(loadAllData());
}

async function verifySeal(type, index) {
  const def = SEALED_EGG_DEFS[type];
  if (!def) return;
  const sealDef = def.seals[index];
  const inputEl = document.getElementById(`sealInput_${type}_${index}`);
  if (!inputEl) return;

  const inputVal = inputEl ? inputEl.value : '';
  let correct = false;
  if (typeof sealDef.verify === 'function') {
    correct = sealDef.verify(inputVal);
  } else if (typeof sealDef.verifyAsync === 'function') {
    if (inputEl) inputEl.disabled = true;
    correct = await sealDef.verifyAsync(inputVal);
    if (inputEl) inputEl.disabled = false;
  }

  if (correct) {
    const sd = loadShopData();
    const egg = (sd.sealedEggs ?? []).find(e => e.type === type);
    if (!egg) return;
    egg.seals[index].solved = true;
    saveShopData(sd);

    const card = document.getElementById(`sealCard_${type}_${index}`);
    if (card) card.classList.add('seal-card--breaking');
    setTimeout(() => {
      renderSealedEggModalContent(type);
      renderSealedEggs();
      const sdNew = loadShopData();
      const eggNew = (sdNew.sealedEggs ?? []).find(e => e.type === type);
      if (eggNew && eggNew.seals.every(s => s.solved)) {
        setTimeout(() => document.querySelector('.seal-open-btn')?.classList.add('seal-open-btn--glow'), 300);
      }
    }, 500);
  } else {
    const errEl = document.getElementById(`sealError_${type}_${index}`);
    if (errEl) errEl.hidden = false;
    inputEl.classList.add('seal-input--error');
    setTimeout(() => {
      if (errEl) errEl.hidden = true;
      inputEl.classList.remove('seal-input--error');
    }, 2000);
  }
}

function triggerSealEggOpening(type) {
  const sd  = loadShopData();
  const egg = (sd.sealedEggs ?? []).find(e => e.type === type);
  if (!egg || !egg.seals.every(s => s.solved)) return;

  // Uniqueness-Guard: wenn diese Legi-Kreatur bereits als Nest oder
  // Spielslot existiert, nicht erneut erschaffen. Schützt gegen
  // Two-Tab-Race, Client-Manipulation und race-artige Doppelklicks.
  const creature = SEAL_CREATURE[type];
  const nestHasLegi = (sd.nests ?? []).some(n => n.hatched?.creature === creature);
  const slotHasLegi = (function() {
    try {
      const all = loadStorage(STORAGE_KEY);
      for (const key in all) if (all[key]?.creature === creature) return true;
    } catch(e) {}
    return false;
  })();
  if (nestHasLegi || slotHasLegi) {
    // Ei aus der Liste entfernen und Type als geöffnet markieren, damit
    // das Siegel-Card nicht ewig als "Ei öffnen!" hängen bleibt.
    sd.sealedEggs = (sd.sealedEggs ?? []).filter(e => e.type !== type);
    sd.openedSealTypes = Array.from(new Set([...(sd.openedSealTypes ?? []), type]));
    saveShopData(sd);
    closeSealedEggModal();
    renderHub();
    return;
  }

  closeSealedEggModal();

  const def      = SEALED_EGG_DEFS[type];
  const nestId   = 'nest_sealed_' + Date.now();

  // Nest MIT hatched-Snapshot direkt ins Shop-Blob eintragen — damit der
  // Sync die Baby-Kreatur persistiert. Ohne hatched würde beim Sync
  // hatched=null landen und die Kreatur wäre nach Login/Zweit-Gerät weg
  // (Nest würde als leeres Ei erscheinen).
  sd.nests.push({
    nestId,
    eggType: type,
    gameId: null,
    gameUrl: null,
    hatched: { creature, growth: 0, points: 0, roundsPlayed: 0, coins: 0 }
  });
  sd.pendingEggNestId = nestId;
  sd.sealedEggs = (sd.sealedEggs ?? []).filter(e => e.type !== type);
  // Migration 0027: Type als geöffnet markieren, damit Server-Merge
  // das Ei nicht bei nächstem Sync wieder auftauchen lässt. Ohne diesen
  // Marker gewinnt der Server-seitige Union-Merge und der User könnte
  // das Legi-Monster beliebig oft erzeugen.
  sd.openedSealTypes = Array.from(new Set([...(sd.openedSealTypes ?? []), type]));
  saveShopData(sd);

  // lernwelt_v3[nestId] direkt schreiben — renderHub sieht die Kreatur
  // sofort, ohne auf den Sync-Roundtrip warten zu müssen.
  try {
    const all = loadStorage(STORAGE_KEY);
    all[nestId] = { points: 0, roundsPlayed: 0, creature, growth: 0, coins: 0 };
    saveStorage(STORAGE_KEY, all);
  } catch (e) {}

  showSealEggOpeningAnimation(def, creature, () => { renderHub(); });
}

const SEAL_EGG_OPEN_PARTICLE_COUNT = 14;

function showSealEggOpeningAnimation(def, creature, onClose) {
  const overlay = document.createElement('div');
  overlay.id = 'sealEggOpenOverlay';
  overlay.innerHTML = `
    <style>
      #sealEggOpenOverlay {
        position:fixed;inset:0;z-index:10000;
        background:radial-gradient(ellipse at center,#1a0a2e 0%,#000 100%);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        opacity:0;transition:opacity 0.5s;cursor:default;
      }
      @keyframes _segg-shake {
        0%,100%{transform:rotate(0)} 15%{transform:rotate(-8deg)} 30%{transform:rotate(8deg)}
        45%{transform:rotate(-8deg)} 60%{transform:rotate(8deg)} 75%{transform:rotate(-5deg)} 90%{transform:rotate(5deg)}
      }
      @keyframes _segg-crack {
        0%{filter:brightness(1)} 40%{filter:brightness(2) drop-shadow(0 0 20px #fff)}
        100%{filter:brightness(3) drop-shadow(0 0 40px #ffd700) drop-shadow(0 0 80px #ff6400)}
      }
      @keyframes _segg-flash { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }
      @keyframes _segg-appear {
        from{opacity:0;transform:scale(0.2) translateY(40px)} to{opacity:1;transform:scale(1) translateY(0)}
      }
      @keyframes _segg-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
      @keyframes _segg-title { from{opacity:0;letter-spacing:0.5em} to{opacity:1;letter-spacing:0.06em} }
      @keyframes _segg-particles {
        0%{opacity:0;transform:translateY(0) scale(0)} 20%{opacity:1}
        100%{opacity:0;transform:translateY(-70px) scale(1.5)}
      }
      #_segg-egg { font-size:6rem;line-height:1;display:block; }
      #_segg-egg.shaking { animation:_segg-shake 0.55s ease-in-out; }
      #_segg-egg.cracking { animation:_segg-crack 1s ease-in forwards; }
      #_segg-flash { position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:1; }
      #_segg-flash.go { animation:_segg-flash 0.6s ease-out forwards; }
      #_segg-initial { display:flex;flex-direction:column;align-items:center;gap:18px; }
      #_segg-caption { color:rgba(255,255,255,0.45);font-family:Cinzel,serif;font-size:0.82rem;letter-spacing:0.12em; }
      #_segg-final { display:none;flex-direction:column;align-items:center;gap:16px;z-index:2; }
      #_segg-final.show {
        display:flex;
        animation:_segg-appear 0.9s cubic-bezier(0.34,1.56,0.64,1) both,_segg-float 3s ease-in-out 0.9s infinite;
      }
      #_segg-final .fe { font-size:5rem; }
      ._segg-title {
        color:#ffd700;font-family:Cinzel,serif;font-size:1.55rem;font-weight:700;
        text-align:center;text-shadow:0 0 18px #ffd700,0 0 36px #ff6400;
        animation:_segg-title 1s 0.4s both;
      }
      ._segg-sub { color:rgba(255,215,0,0.65);font-family:Nunito,sans-serif;font-size:0.95rem;text-align:center;animation:_segg-appear 0.8s 0.6s both; }
      ._segg-particle { position:fixed;font-size:1.8rem;pointer-events:none;animation:_segg-particles 2s ease-out both; }
      #_segg-close {
        position:absolute;bottom:32px;padding:11px 32px;font-family:Cinzel,serif;font-size:0.95rem;font-weight:700;
        color:#1a0e05;background:linear-gradient(135deg,#ffd700,#f0b429);border:none;border-radius:999px;cursor:pointer;
        box-shadow:0 0 20px rgba(255,215,0,0.5);opacity:0;transition:opacity 0.4s;pointer-events:none;
      }
      #_segg-close.show { opacity:1;pointer-events:auto; }
    </style>
    <div id="_segg-flash"></div>
    <div id="_segg-initial">
      <span id="_segg-egg">🥚</span>
      <span id="_segg-caption">DIE SIEGEL BRECHEN…</span>
    </div>
    <div id="_segg-final">
      <div id="_segg-creature" style="width:120px;height:120px;display:flex;align-items:center;justify-content:center">${getCreatureHTML(creature, 0)}</div>
      <div class="_segg-title">${CREATURE_NAMES[creature] ?? creature} erwacht!</div>
      <div class="_segg-sub">Verbinde ihn mit einem Spiel, um ihn zu leveln.</div>
    </div>
    <button id="_segg-close">Weiter →</button>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  const egg      = overlay.querySelector('#_segg-egg');
  const flash    = overlay.querySelector('#_segg-flash');
  const initial  = overlay.querySelector('#_segg-initial');
  const final_   = overlay.querySelector('#_segg-final');
  const closeBtn = overlay.querySelector('#_segg-close');

  const shake = () => { egg.classList.remove('shaking'); void egg.offsetWidth; egg.classList.add('shaking'); };
  setTimeout(() => shake(), 600);
  setTimeout(() => shake(), 1400);
  setTimeout(() => shake(), 2100);
  setTimeout(() => { egg.classList.remove('shaking'); egg.classList.add('cracking'); }, 2700);
  setTimeout(() => {
    flash.classList.add('go');
    const emojis = ['✨','🌟','💫','⭐','🌈','💎','🐉'];
    for (let i = 0; i < SEAL_EGG_OPEN_PARTICLE_COUNT; i++) {
      const p = document.createElement('span');
      p.className = '_segg-particle';
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.style.left = (10 + Math.random() * 80) + '%';
      p.style.top  = (15 + Math.random() * 70) + '%';
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      overlay.appendChild(p);
    }
  }, 3300);
  setTimeout(() => {
    initial.style.display = 'none';
    final_.classList.add('show');
    closeBtn.classList.add('show');
  }, 4000);

  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); if (onClose) onClose(); }, 500);
  });
}

// ─── Team-Legi Aufgaben-Modal ───────────────────────────────
// LEGI_TASKS: `interactive` markiert Aufgaben mit implementierter
// Mechanik (öffnen einen eigenen Sub-View im selben Modal-Container).
const LEGI_TASKS = [
  { key: 'gift',     icon: '🎁', label: 'Andere beschenken',    status: 'active', hint: '50 🪙 – schenk eine Stufe', interactive: true },
  { key: 'friends',  icon: '🤝', label: 'Freunde finden',       status: 'active', hint: '3 mit gleichem Code', interactive: true },
  { key: 'win',      icon: '🏆', label: 'Gemeinsam siegen',     status: 'active', hint: 'bald verfügbar' },
  { key: 'locked_1', icon: '❔', label: 'Weitere Aufgabe folgt', status: 'locked', hint: 'bleibt geheim'   },
  { key: 'locked_2', icon: '❔', label: 'Weitere Aufgabe folgt', status: 'locked', hint: 'bleibt geheim'   },
];

// Helper: gibt true zurück, wenn irgendein pending (unaccepted) Gift
// für den aktuellen User existiert. Beeinflusst den Hub-Card-Blink
// und die Row-Highlight-Klasse im Task-Modal.
function giftPending() {
  const tasks = window.__giftTasks;
  if (!tasks) return false;
  for (const key in tasks) {
    const t = tasks[key];
    if (t && !t.accepted_at) return true;
  }
  return false;
}
window.giftPending = giftPending;

// Renderer für Task-Row-Status-Badge (rechte Seite jeder Row).
function renderLegiTaskBadge(taskKey) {
  const tasks = window.__giftTasks || {};
  const state = tasks[taskKey];
  if (!state) return '';
  if (state.accepted_at) {
    return `<span class="legi-task__status-badge legi-task__status-badge--done">✓ Stufe erhalten</span>`;
  }
  return `<span class="legi-task__status-badge legi-task__status-badge--pending">🎁 wartet</span>`;
}

function openLegiTaskModal() {
  const overlay = document.getElementById('legiTaskModal');
  const content = document.getElementById('legiTaskModalContent');
  if (!overlay || !content) return;

  const legiGame = GAMES_CONFIG.find(g => g.clusterLegi);
  if (!legiGame) return;
  const data = loadAllData()[legiGame.id] || defaultGameData();
  const creature = data.creature || 'einhornkatze';
  const stage    = getGrowthStage(data.growth);
  const progressPct = Math.min((data.growth / GROWTH_MAX) * 100, 100);
  const displayName = CREATURE_NAMES[creature] ?? creature;

  const taskItems = LEGI_TASKS.map(t => {
    const badge = renderLegiTaskBadge(t.key);
    const pending = window.__giftTasks?.[t.key] && !window.__giftTasks[t.key].accepted_at;
    const cls = [
      'legi-task',
      `legi-task--${t.status}`,
      t.interactive ? 'legi-task--interactive' : '',
      pending ? 'legi-task--gift-pending' : ''
    ].filter(Boolean).join(' ');
    return `
      <div class="${cls}" data-task-key="${escapeHtml(t.key)}">
        <span class="legi-task__icon">${t.status === 'locked' ? '🔒' : t.icon}</span>
        <div class="legi-task__body">
          <div class="legi-task__label">${escapeHtml(t.label)}</div>
          <div class="legi-task__hint">${escapeHtml(t.hint)}</div>
        </div>
        ${badge}
      </div>`;
  }).join('');

  content.innerHTML = `
    <h2 class="bonbon-modal__title">Der Weg zur Legende</h2>
    <p class="bonbon-modal__intro">Mit jeder gelösten Aufgabe wächst sie ein Stück näher an ihre legendäre Form.</p>
    <div class="legi-task-modal">
      <div class="legi-task-modal__monster">
        <div class="legi-task-modal__sprite">${getCreatureHTML(creature, stage)}</div>
        <p class="legi-task-modal__name">${escapeHtml(displayName)}</p>
        <p class="legi-task-modal__stage">Stufe ${stage + 1}</p>
        <div class="legi-task-modal__progress">
          <div class="legi-task-modal__progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>
      <div class="legi-task-modal__tasks">
        ${taskItems}
      </div>
    </div>
  `;

  // Klick-Handler nur für interaktive Rows anhängen.
  for (const t of LEGI_TASKS) {
    if (!t.interactive) continue;
    const row = content.querySelector(`.legi-task[data-task-key="${t.key}"]`);
    if (!row) continue;
    row.addEventListener('click', () => {
      if (t.key === 'gift')    openGiftFlow();
      if (t.key === 'friends') openFriendsFlow();
    });
  }

  overlay.hidden = false;
}
window.openLegiTaskModal = openLegiTaskModal;

// ─── Gift-Flow („Andere beschenken") ────────────────────────
// State-Machine im selben #legiTaskModalContent-Container. Sub-Views:
//   idle       — Verschenken-Button
//   loading    — Kandidaten werden geladen
//   candidates — 1–3 Namen zur Auswahl
//   confirm    — Ein Name gewählt, „Ja, verschenken" bestätigen
//   sending    — send_gift-RPC läuft
//   sent       — Erfolg, „Nochmal verschenken" oder zurück
//   empty      — 0 eligible Peers cluster-weit
async function openGiftFlow() {
  const content = document.getElementById('legiTaskModalContent');
  if (!content) return;

  const state = {
    view: 'idle',
    candidates: [],       // {user_id, display_name, avatar_id}
    selected: null,
    totalRemaining: null, // aus list_gift_candidates
    error: null,          // string oder null
    lastSentName: null    // für die sent-View
  };

  const TASK_KEY = 'gift';

  function render() {
    content.innerHTML = giftFlowShellHTML(state);
    wireCommonEvents();
    wireViewEvents();
    bindAcceptButton();
  }

  function wireCommonEvents() {
    const backBtn = content.querySelector('.legi-gift-back');
    if (backBtn) backBtn.addEventListener('click', () => openLegiTaskModal());
  }

  function wireViewEvents() {
    if (state.view === 'idle') {
      const startBtn = content.querySelector('.legi-gift-start-btn');
      if (startBtn) startBtn.addEventListener('click', () => startFetch());
    }
    if (state.view === 'candidates') {
      content.querySelectorAll('.legi-gift-candidate').forEach(el => {
        el.addEventListener('click', () => {
          const uid = el.dataset.userId;
          const cand = state.candidates.find(c => c.user_id === uid);
          if (!cand) return;
          state.selected = cand;
          state.view = 'confirm';
          render();
        });
      });
    }
    if (state.view === 'confirm') {
      const yes = content.querySelector('.legi-gift-confirm-yes');
      const no  = content.querySelector('.legi-gift-confirm-no');
      if (yes) yes.addEventListener('click', () => confirmSend());
      if (no)  no.addEventListener('click', () => {
        state.selected = null;
        state.view = state.candidates.length > 0 ? 'candidates' : 'idle';
        render();
      });
    }
    if (state.view === 'sent' || state.view === 'empty') {
      const again = content.querySelector('.legi-gift-again-btn');
      if (again) again.addEventListener('click', () => startFetch());
    }
  }

  async function startFetch() {
    state.view = 'loading';
    state.error = null;
    state.selected = null;
    render();
    try {
      const res = await callGiftRpc('list_gift_candidates', { p_task_key: TASK_KEY });
      if (!res.ok) throw new Error(res.error || 'list_failed');
      state.candidates = res.candidates || [];
      state.totalRemaining = res.total_remaining ?? state.candidates.length;
      if (state.totalRemaining === 0) {
        state.view = 'empty';
      } else {
        state.view = 'candidates';
      }
    } catch (e) {
      state.error = giftErrorMessage(e.message);
      state.view = 'idle';
    }
    render();
  }

  async function confirmSend() {
    if (!state.selected) return;
    const recipient = state.selected;
    state.view = 'sending';
    render();
    try {
      const res = await callGiftRpc('send_gift', {
        p_recipient_id: recipient.user_id,
        p_task_key: TASK_KEY
      });
      if (!res.ok) {
        if (res.error === 'already_gifted') {
          // Race: Empfänger:in aus lokaler Liste entfernen, weitermachen.
          state.candidates = state.candidates.filter(c => c.user_id !== recipient.user_id);
          state.selected = null;
          if (state.candidates.length > 0) {
            state.view = 'candidates';
            state.error = `${recipient.display_name} wurde gerade schon beschenkt — wähle eine andere Person.`;
          } else {
            state.view = 'idle';
            state.error = 'Alle drei wurden gerade schon beschenkt. Klicke erneut auf Verschenken für neue Namen.';
          }
          render();
          return;
        }
        throw new Error(res.error || 'send_failed');
      }
      // Erfolg: Coins clientseitig abziehen (spentCoins-Pattern wie im Shop).
      const sd = loadShopData();
      sd.spentCoins = (sd.spentCoins ?? 0) + 50;
      saveShopData(sd);
      renderCoinDisplay(loadAllData());
      state.lastSentName = recipient.display_name;
      state.selected = null;
      state.candidates = [];
      state.view = 'sent';
      state.error = null;
    } catch (e) {
      state.error = giftErrorMessage(e.message);
      state.view = 'idle';
    }
    render();
  }

  // Vor-Check: reichen die Coins? Sanity-UX, keine Sicherheitsprüfung.
  function coinBalance() {
    const sd = loadShopData();
    return getTotalCoins(loadAllData()) - (sd.spentCoins ?? 0);
  }

  function giftFlowShellHTML(s) {
    const balance = coinBalance();
    const enoughCoins = balance >= 50;
    return `
      <div class="legi-gift-header">
        <button class="legi-gift-back" title="Zurück zu den Aufgaben">← Zurück</button>
        <h2 class="bonbon-modal__title" style="margin:0;">🎁 Andere beschenken</h2>
      </div>
      <div class="legi-gift-flow">
        <div class="legi-gift-side legi-gift-side--give">
          <h3 class="legi-gift-side__title">Verschenken</h3>
          ${renderGiveSide(s, enoughCoins, balance)}
        </div>
        <div class="legi-gift-side legi-gift-side--receive">
          <h3 class="legi-gift-side__title">Empfangen</h3>
          ${renderReceiveSide()}
        </div>
      </div>
    `;
  }

  function renderGiveSide(s, enoughCoins, balance) {
    const errorHtml = s.error
      ? `<p class="legi-gift-error">${escapeHtml(s.error)}</p>` : '';

    if (s.view === 'loading' || s.view === 'sending') {
      const label = s.view === 'sending' ? 'Geschenk wird verschickt…' : 'Suche Empfänger:innen…';
      return `${errorHtml}<p class="legi-gift-loading">${label}</p>`;
    }

    if (s.view === 'empty') {
      return `
        <p class="legi-gift-intro">🎉 Alle in deinem Kurs haben diese Stufe schon erhalten!</p>
        <button class="legi-gift-again-btn">Nochmal prüfen</button>`;
    }

    if (s.view === 'sent') {
      return `
        <p class="legi-gift-success">🎁 Geschenk an <b>${escapeHtml(s.lastSentName || '')}</b> verschickt!</p>
        <button class="legi-gift-again-btn" ${enoughCoins ? '' : 'disabled'}>
          Nochmal verschenken (50 🪙)
        </button>
        ${enoughCoins ? '' : '<p class="legi-gift-hint">Du hast nicht genug Münzen für ein weiteres Geschenk.</p>'}`;
    }

    if (s.view === 'candidates') {
      const list = s.candidates.map(c => `
        <button class="legi-gift-candidate" data-user-id="${escapeHtml(c.user_id)}">
          <span class="legi-gift-candidate__name">${escapeHtml(c.display_name || 'Unbekannt')}</span>
        </button>`).join('');
      return `
        ${errorHtml}
        <p class="legi-gift-intro">Wähle eine Person aus, die eine Stufe geschenkt bekommen soll:</p>
        <div class="legi-gift-candidates">${list}</div>
        <p class="legi-gift-hint">Kosten: 50 🪙 — erst beim Bestätigen abgezogen.</p>`;
    }

    if (s.view === 'confirm') {
      const name = s.selected?.display_name || 'diese Person';
      return `
        <p class="legi-gift-intro">Du schenkst <b>${escapeHtml(name)}</b> eine Entwicklungsstufe der Einhornkatze.</p>
        <p class="legi-gift-cost">Kosten: <b>50 🪙</b></p>
        <div class="legi-gift-confirm-actions">
          <button class="legi-gift-confirm-yes" ${enoughCoins ? '' : 'disabled'}>Ja, verschenken</button>
          <button class="legi-gift-confirm-no">Andere wählen</button>
        </div>
        ${enoughCoins ? '' : '<p class="legi-gift-error">Du hast leider nicht genug Münzen.</p>'}`;
    }

    // idle
    return `
      ${errorHtml}
      <p class="legi-gift-intro">
        Für <b>50 🪙</b> schenkst du einer anderen Person aus deinem Kurs eine
        Wachstumsstufe der Einhornkatze. Diese Stufe kann nur durch ein Geschenk
        von jemand anderem freigeschaltet werden.
      </p>
      <p class="legi-gift-balance">Dein Guthaben: <b>${balance} 🪙</b></p>
      <button class="legi-gift-start-btn" ${enoughCoins ? '' : 'disabled'}>
        50 🪙 verschenken
      </button>
      ${enoughCoins ? '' : '<p class="legi-gift-hint">Sammle mehr Münzen, um jemanden zu beschenken.</p>'}`;
  }

  function renderReceiveSide() {
    const gift = window.__giftTasks?.[TASK_KEY];
    if (!gift) {
      return `<p class="legi-gift-intro">Stufe noch nicht erhalten. Warte, bis dich jemand aus deinem Kurs beschenkt.</p>`;
    }
    if (gift.accepted_at) {
      return `
        <p class="legi-gift-success">✓ Stufe erhalten</p>
        <p class="legi-gift-hint">Danke, <b>${escapeHtml(gift.giver_display_name || 'Kursmitglied')}</b>!</p>`;
    }
    return `
      <p class="legi-gift-pending">🎁 <b>${escapeHtml(gift.giver_display_name || 'Jemand')}</b> hat dir eine Stufe geschenkt!</p>
      <button class="legi-gift-accept-btn">Annehmen</button>`;
  }

  // Annehmen-Button (rechte Seite) wird beim Rendern des Modals separat gebunden,
  // damit re-render nach accept sofort greift.
  function bindAcceptButton() {
    const btn = content.querySelector('.legi-gift-accept-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Nehme an…';
      try {
        const res = await callGiftRpc('accept_gift', { p_task_key: TASK_KEY });
        if (!res.ok && res.error !== 'no_pending_gift') {
          throw new Error(res.error || 'accept_failed');
        }
        // Lokalen Cache aktualisieren + Server-State neu laden (Growth-Wert)
        if (window.__giftTasks?.[TASK_KEY]) {
          window.__giftTasks[TASK_KEY].accepted_at = new Date().toISOString();
        }
        await window.loadServerState?.();
        renderCoinDisplay(loadAllData());
        renderHub();
        render();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Annehmen';
        alert('Konnte das Geschenk nicht annehmen: ' + giftErrorMessage(e.message));
      }
    });
  }

  render();
}
window.openGiftFlow = openGiftFlow;

// ─── Friends-Flow („Freunde finden") ────────────────────────
// State-Machine im gleichen #legiTaskModalContent-Container. Views:
//   code_input — 6-stellige Ziffern-Eingabe
//   joining    — friends_room_join RPC läuft
//   waiting    — Raum offen, 3 Slots (self + andere/leer), Live-Refresh
//   completing — 3/3 erreicht, „Ihr habt es geschafft" (1 s Pause)
//   completed  — friends_room_complete durch + Level-Up-Banner
//   error      — inline Error mit Retry
//
// Realtime via Postgres-Changes auf friends_room_presence. Wegen der
// Ein-Filter-Beschränkung der Supabase-Subscription filtern wir nur
// auf cluster_id serverseitig; auf code wird clientseitig gefiltert.
// Heartbeat alle 6 s hält last_seen_at frisch. Ein Client-side
// stale-Ticker (5 s) rendert tote Slots weg, falls kein Realtime-
// Event kommt.
async function openFriendsFlow() {
  const content = document.getElementById('legiTaskModalContent');
  const overlay = document.getElementById('legiTaskModal');
  if (!content || !overlay) return;

  const me = window.getSessionUser?.();
  if (!me || !me.cluster_id) {
    content.innerHTML = `
      <div class="legi-friends-body">
        <p class="legi-gift-error">Du brauchst einen Kurs, um Freunde zu finden.</p>
      </div>`;
    return;
  }

  const state = {
    view: 'code_input',
    code: '',
    members: [],       // {user_id, display_name, avatar_id, last_seen_at, isSelf}
    error: null,
    completedShown: false,
  };

  const HB_MS    = 6000;
  const STALE_MS = 30000;
  let hbInterval  = null;
  let staleTicker = null;
  let channel     = null;
  let closedCleanupDone = false;

  function render() {
    content.innerHTML = friendsFlowShellHTML(state);
    wireEvents();
  }

  function wireEvents() {
    const back = content.querySelector('.legi-friends-back');
    if (back) back.addEventListener('click', () => cleanupAndReturn());

    if (state.view === 'code_input') {
      const input = content.querySelector('.legi-friends-code-input');
      const btn   = content.querySelector('.legi-friends-join-btn');
      if (input) {
        input.addEventListener('input', e => {
          state.code = e.target.value.replace(/\D/g, '').slice(0, 6);
          e.target.value = state.code;
          if (btn) btn.disabled = state.code.length !== 6;
        });
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && state.code.length === 6) doJoin();
        });
        setTimeout(() => input.focus(), 20);
      }
      if (btn) btn.addEventListener('click', () => doJoin());
    }

    if (state.view === 'waiting') {
      const leave = content.querySelector('.legi-friends-leave-btn');
      if (leave) leave.addEventListener('click', () => cleanupAndReturn());
    }

    if (state.view === 'error') {
      const retry = content.querySelector('.legi-friends-retry-btn');
      if (retry) retry.addEventListener('click', () => {
        state.view = 'code_input';
        state.error = null;
        render();
      });
    }
  }

  async function doJoin() {
    if (state.code.length !== 6) return;
    state.view = 'joining';
    state.error = null;
    render();

    const res = await callGiftRpc('friends_room_join', { p_code: state.code });
    if (!res.ok) {
      state.error = friendsErrorMessage(res.error);
      state.view = 'error';
      render();
      return;
    }

    await refreshMembers();
    startRealtime();
    startHeartbeat();
    startStaleTicker();

    state.view = 'waiting';
    render();
    checkComplete();
  }

  async function refreshMembers() {
    const res = await callGiftRpc('friends_room_snapshot', { p_code: state.code });
    console.log('[friends] snapshot res:', res);
    if (!res.ok) {
      console.warn('[friends] snapshot failed:', res.error);
      state.members = [];
      return;
    }
    const now = Date.now();
    // DB-Snapshot ist die Wahrheit — wenn er mehr Members hat als
    // Presence (weil Presence-Event verloren ging oder Session-Refresh
    // die Verbindung gestört hat), gewinnt der Snapshot.
    const snapshotMembers = (res.members || [])
      .filter(m => now - Date.parse(m.last_seen_at) < STALE_MS)
      .map(m => ({
        user_id:      m.user_id,
        display_name: m.display_name,
        avatar_id:    m.avatar_id,
        last_seen_at: m.last_seen_at,
        isSelf:       m.user_id === me.id,
      }));
    if (snapshotMembers.length >= state.members.length) {
      state.members = snapshotMembers;
      state.members.sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0));
    }
    // Auch nach Snapshot Complete triggern, falls DB 3+ zeigt und
    // Presence stuck war.
    if (state.view === 'waiting' && state.members.length >= 3) {
      render();
      checkComplete();
    }
  }

  function startRealtime() {
    const client = window.supabaseClient;
    if (!client) { console.warn('[friends] no supabaseClient'); return; }
    // Auth-Token an den Realtime-Layer geben (falls Session-Refresh).
    try {
      if (window.__accessToken && client.realtime?.setAuth) {
        client.realtime.setAuth(window.__accessToken);
      }
    } catch (e) {
      console.warn('[friends] setAuth failed:', e.message);
    }
    // Presence statt postgres_changes — bei uns delivert postgres_changes
    // nicht zuverlässig (Symptom: SUBSCRIBED, aber keine Events). Presence
    // ist reine WebSocket-Kommunikation zwischen Clients, umgeht RLS und
    // Publications komplett. Der Server-Complete-RPC prüft weiterhin die
    // DB-Presence-Rows (via Heartbeat), damit das cheat-sicher bleibt.
    const channelName = `friends-room-${me.cluster_id}-${state.code}`;
    console.log('[friends] subscribing presence channel:', channelName);
    channel = client.channel(channelName, {
      config: { presence: { key: me.id } }
    });

    const applyPresenceState = () => {
      const raw = channel.presenceState() || {};
      // presenceState: { <key>: [ { …payload }, … ] } — je Key kann mehrere
      // Presences enthalten (Multi-Tab pro User). Wir nehmen die neueste.
      const nowIso = new Date().toISOString();
      const list = [];
      for (const key of Object.keys(raw)) {
        const arr = raw[key];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const p = arr[arr.length - 1];
        list.push({
          user_id:      p.user_id || key,
          display_name: p.display_name || '…',
          avatar_id:    p.avatar_id,
          last_seen_at: p.joined_at || nowIso,
          isSelf:       (p.user_id || key) === me.id,
        });
      }
      list.sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0));
      state.members = list;
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[friends] presence sync');
        applyPresenceState();
        if (state.view === 'waiting') { render(); checkComplete(); }
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('[friends] presence join:', newPresences);
        applyPresenceState();
        if (state.view === 'waiting') { render(); checkComplete(); }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('[friends] presence leave:', leftPresences);
        applyPresenceState();
        if (state.view === 'waiting') render();
      })
      .subscribe(async (status, err) => {
        console.log('[friends] subscribe status:', status, err || '');
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id:      me.id,
            display_name: me.display_name,
            avatar_id:    me.avatar_id,
            joined_at:    new Date().toISOString(),
          });
        }
      });
  }

  function startHeartbeat() {
    hbInterval = setInterval(async () => {
      await callGiftRpc('friends_room_heartbeat', { p_code: state.code });
    }, HB_MS);
  }

  function startStaleTicker() {
    staleTicker = setInterval(async () => {
      const before = state.members.length;
      // Wenn Raum noch nicht voll (Presence-Feedback unvollständig),
      // regelmäßig DB-Snapshot als Sync-Fallback ziehen. refreshMembers
      // triggert selbst render + checkComplete falls dabei 3+ herauskommen.
      if (state.view === 'waiting' && state.members.length < 3) {
        await refreshMembers();
      }
      if (state.members.length !== before && state.view === 'waiting') {
        render();
        checkComplete();
      }
    }, 5000);
  }

  async function checkComplete() {
    console.log('[friends] checkComplete called, members:', state.members.length,
                'completedShown:', state.completedShown, 'view:', state.view);
    if (state.completedShown) return;
    if (state.members.length < 3) return;
    if (closedCleanupDone) return;
    state.completedShown = true;
    state.view = 'completing';
    render();

    // 1 s Pause, damit User „Ihr habt es geschafft" liest
    await new Promise(r => setTimeout(r, 1000));
    if (closedCleanupDone) return;

    // Presence ist schneller als DB — der Complete-RPC prüft aber die
    // DB. Wenn andere User ihre friends_room_join-RPC noch nicht durch
    // haben, gibt der Server 'not_enough_users' zurück. Bis zu 5x
    // retryen (mit je 1s Pause), bis der Server auch 3 aktive Rows
    // sieht.
    let res = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      res = await callGiftRpc('friends_room_complete', { p_code: state.code });
      console.log(`[friends] complete res (try ${attempt}):`, res);
      if (res.ok) break;
      if (res.error === 'not_enough_users') {
        await new Promise(r => setTimeout(r, 1000));
        if (closedCleanupDone) return;
        continue;
      }
      break;
    }
    if (!res || (!res.ok && res.error !== 'not_in_room')) {
      console.warn('[friends] complete failed after retries:', res && res.error);
    }

    await window.loadGiftTasks?.();
    await window.loadServerState?.();
    if (typeof renderHub === 'function') renderHub();

    triggerFriendsHeroBanner();

    state.view = 'completed';
    render();

    cleanupSubscription();
    // KEIN leave hier — sonst race: der schnellste User löscht seine
    // Row bevor die anderen ihren complete-RPC machen können →
    // active < 3 → error not_enough_users → kein Growth für sie.
    // Der Server-Stale-Filter (30s ohne Heartbeat) räumt die Row auf,
    // in der Zwischenzeit haben alle anderen Zeit für ihren complete.

    // Nach kurzer Erfolgs-Anzeige zurück ins Task-Modal
    setTimeout(() => {
      if (!overlay.hidden) openLegiTaskModal();
    }, 2500);
  }

  function triggerFriendsHeroBanner() {
    const banner = document.createElement('div');
    banner.className = 'levelup-banner levelup-banner--final';
    banner.textContent = 'Freundschaftsstufe erreicht!';
    document.body.appendChild(banner);
    banner.addEventListener('animationend', () => banner.remove(), { once: true });
    // Fallback, falls animationend nicht feuert
    setTimeout(() => banner.remove(), 3000);
  }

  function cleanupSubscription() {
    if (hbInterval)  { clearInterval(hbInterval);  hbInterval  = null; }
    if (staleTicker) { clearInterval(staleTicker); staleTicker = null; }
    if (channel && window.supabaseClient) {
      try { window.supabaseClient.removeChannel(channel); } catch (e) {}
      channel = null;
    }
    document.removeEventListener('visibilitychange', onVisibility);
  }

  async function cleanupAndReturn() {
    if (closedCleanupDone) return;
    closedCleanupDone = true;
    cleanupSubscription();
    if (state.code) {
      await callGiftRpc('friends_room_leave', { p_code: state.code });
    }
    openLegiTaskModal();
  }

  // Modal-Close-Button + Overlay-Klick: eigenen once-Cleanup zusätzlich zum
  // bestehenden hidden=true-Handler registrieren, damit Presence-Row auch
  // beim X-Klick weggeht.
  const closeBtn = document.getElementById('legiTaskModalClose');
  const onClose = () => {
    if (closedCleanupDone) return;
    closedCleanupDone = true;
    cleanupSubscription();
    if (state.code) callGiftRpc('friends_room_leave', { p_code: state.code });
  };
  if (closeBtn) closeBtn.addEventListener('click', onClose, { once: true });
  const onOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
      overlay.removeEventListener('click', onOverlayClick);
    }
  };
  overlay.addEventListener('click', onOverlayClick);

  // Tab-Hide: KEIN sofortiges leave — würde Multi-Tab-Testing kaputt
  // machen und im Echtbetrieb bei Handy-Sperre den User rausfliegen
  // lassen. Stattdessen: Heartbeat pausieren; bei visible wieder
  // starten + einmal manuell heartbeaten. Wenn der User >30s weg ist,
  // greift der Server-Stale-Filter (last_seen_at > now()-30s) und die
  // Row wird für andere unsichtbar.
  function onVisibility() {
    if (closedCleanupDone) return;
    if (document.visibilityState === 'hidden') {
      if (hbInterval) { clearInterval(hbInterval); hbInterval = null; }
    } else if (document.visibilityState === 'visible' && state.code && !hbInterval) {
      callGiftRpc('friends_room_heartbeat', { p_code: state.code });
      startHeartbeat();
      refreshMembers().then(() => { if (state.view === 'waiting') render(); });
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  render();
}
window.openFriendsFlow = openFriendsFlow;

function friendsFlowShellHTML(s) {
  const header = `
    <div class="legi-gift-header">
      <button class="legi-friends-back" title="Zurück zu den Aufgaben">← Zurück</button>
      <h2 class="bonbon-modal__title" style="margin:0;">🤝 Freunde finden</h2>
    </div>`;

  if (s.view === 'code_input') {
    return `${header}
      <div class="legi-friends-body">
        <p class="legi-gift-intro">
          Sprecht euch mit zwei Kursmitgliedern ab und gebt alle den gleichen 6-stelligen
          Code ein. Sobald ihr zu dritt im Raum seid, habt ihr die Aufgabe geschafft.
        </p>
        <input class="legi-friends-code-input" type="tel" inputmode="numeric"
               maxlength="6" placeholder="6-stelliger Code" autocomplete="off">
        <button class="legi-friends-join-btn" disabled>Finden</button>
      </div>`;
  }

  if (s.view === 'joining') {
    return `${header}
      <div class="legi-friends-body">
        <p class="legi-gift-loading">Betrete Raum…</p>
      </div>`;
  }

  if (s.view === 'waiting' || s.view === 'completing') {
    const slots = [0, 1, 2].map(i => renderFriendsSlot(s.members[i])).join('');
    const roomFull = s.members.length >= 3;
    // Leave-Button ausblenden sobald 3/3 — sonst race: User klickt
    // versehentlich Verlassen während Complete-Flow schon läuft und
    // reißt seinen eigenen Growth-Reward mit.
    const bottom = s.view === 'completing'
      ? `<p class="legi-friends-hero">Ihr habt es geschafft!</p>`
      : roomFull
        ? `<p class="legi-friends-hero-small">Ihr seid vollständig — gleich geht's los…</p>`
        : `<button class="legi-friends-leave-btn">Raum verlassen</button>`;
    // Wenn der Server keine Member zurückliefert (auch nicht self),
    // ist die Verbindung ins Wanken geraten — visueller Hinweis.
    const warning = (s.view === 'waiting' && s.members.length === 0)
      ? `<p class="legi-friends-warning">Verbindung wackelt — bleib im Modal, es wird gleich wieder aktualisiert.</p>`
      : '';
    return `${header}
      <div class="legi-friends-body">
        <p class="legi-friends-code-label">Code: <b>${escapeHtml(s.code)}</b> — ${s.members.length}/3</p>
        <div class="legi-friends-slots">${slots}</div>
        ${warning}
        ${bottom}
      </div>`;
  }

  if (s.view === 'completed') {
    return `${header}
      <div class="legi-friends-body">
        <p class="legi-friends-hero">🎉 Freundschaftsstufe erreicht!</p>
      </div>`;
  }

  return `${header}
    <div class="legi-friends-body">
      <p class="legi-gift-error">${escapeHtml(s.error || 'Unbekannter Fehler.')}</p>
      <button class="legi-friends-retry-btn">Noch einmal versuchen</button>
    </div>`;
}

function renderFriendsSlot(member) {
  if (!member) {
    return `<div class="legi-friends-slot legi-friends-slot--empty">…</div>`;
  }
  const avatarUrl = window.getAvatarUrl
    ? window.getAvatarUrl(member.avatar_id || 'default', '../')
    : '';
  const selfClass = member.isSelf ? ' legi-friends-slot--self' : '';
  return `
    <div class="legi-friends-slot legi-friends-slot--filled${selfClass}">
      <img class="legi-friends-slot__avatar" src="${escapeHtml(avatarUrl)}" alt="" />
      <span class="legi-friends-slot__name">${escapeHtml(member.display_name || '…')}</span>
    </div>`;
}

function friendsErrorMessage(code) {
  const map = {
    no_session:       'Bitte neu anmelden.',
    invalid_code:     'Der Code muss aus genau 6 Ziffern bestehen.',
    no_cluster:       'Du bist keinem Kurs zugeordnet.',
    no_grant:         'Dein Kurs hat die Einhornkatze noch nicht freigeschaltet.',
    not_in_room:      'Du bist nicht mehr im Raum — bitte neu beitreten.',
    not_enough_users: 'Es sind noch nicht genug Leute im Raum.',
  };
  if (map[code]) return map[code];
  if (typeof code === 'string' && code.startsWith('http_')) {
    return `Netzwerkfehler (${code}). Probier es gleich nochmal.`;
  }
  return code || 'Unbekannter Fehler.';
}

// Generischer Wrapper für die Gift-RPCs — spart Boilerplate + einheit-
// liches Error-Handling.
async function callGiftRpc(name, body) {
  const token = window.__accessToken;
  if (!token || !window.SUPABASE_URL) {
    return { ok: false, error: 'no_session' };
  }
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
  if (!res.ok) return { ok: false, error: `http_${res.status}` };
  try {
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'bad_json' };
  }
}

function giftErrorMessage(code) {
  const map = {
    no_session:               'Bitte neu anmelden.',
    no_cluster:               'Du bist keinem Kurs zugeordnet.',
    no_grant:                 'Dein Kurs hat die Einhornkatze noch nicht freigeschaltet.',
    recipient_no_grant:       'Diese Person kann noch keine Geschenke bekommen.',
    recipient_not_in_cluster: 'Diese Person ist nicht mehr in deinem Kurs.',
    self_gift:                'Sich selbst kann man nicht beschenken.',
    invalid_task_key:         'Interner Fehler (invalid_task_key).',
    no_pending_gift:          'Es gibt kein wartendes Geschenk für dich.'
  };
  if (map[code]) return map[code];
  if (typeof code === 'string' && code.startsWith('http_')) {
    return `Netzwerkfehler (${code}). Probier es gleich nochmal.`;
  }
  return code || 'Unbekannter Fehler.';
}

// ─── Recovery-Hook für Late-Joiner-Reveal-Bug ───────────────
// Wenn der Cluster unlocked ist, aber der User weder eine Kreatur
// noch (indirekt) einen echten user_legi_grants-Eintrag hat, war ein
// früherer Reveal-Klick gescheitert (claim_cluster_legi → no_grant).
// In dem Fall den Client-Marker legiRevealed zurücksetzen, damit die
// Kachel wieder pulsiert und der User beim nächsten Klick einen zweiten
// Versuch bekommt. Wird nach loadServerShop + loadServerState im Hub-
// Boot aufgerufen, bevor renderHub läuft.
function repairLegiRevealMarker() {
  try {
    const status = window.__bonbonStatus;
    if (!status?.unlocked) return;
    const legiGame = GAMES_CONFIG.find(g => g.clusterLegi);
    if (!legiGame) return;
    const gd = loadAllData()[legiGame.id];
    if (gd?.creature) return; // Kreatur ist da → alles gut
    const sd = loadShopData();
    if (!sd.legiRevealed) return; // Marker war bereits sauber
    sd.legiRevealed = false;
    saveShopData(sd);
    console.log('[hub] legiRevealed-Marker zurückgesetzt — Reveal-Klick war zuvor gescheitert.');
  } catch (e) {
    console.warn('[hub] repairLegiRevealMarker failed:', e.message);
  }
}
window.repairLegiRevealMarker = repairLegiRevealMarker;

// ─── Team-Legi Reveal-Animation ─────────────────────────────
// Fullscreen-Overlay: Katzenei wackelt, blitzt, verwandelt sich in die
// Baby-Einhornkatze. Beim „Weiter" wird die Kreatur serverseitig via
// claim_cluster_legi vergeben, der Client-Marker legiRevealed gesetzt
// und der Hub neu gerendert.
function showLegiRevealAnimation() {
  const overlay = document.createElement('div');
  overlay.id = 'legiRevealOverlay';
  overlay.innerHTML = `
    <style>
      #legiRevealOverlay {
        position:fixed;inset:0;z-index:10001;
        background:radial-gradient(ellipse at center, #4a2560 0%, #1a0930 65%, #000 100%);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        opacity:0;transition:opacity 0.6s;
      }
      @keyframes _legi-shake {
        0%,100%{transform:rotate(0)} 15%{transform:rotate(-9deg)} 30%{transform:rotate(9deg)}
        45%{transform:rotate(-9deg)} 60%{transform:rotate(9deg)} 75%{transform:rotate(-6deg)} 90%{transform:rotate(6deg)}
      }
      @keyframes _legi-glow {
        0%{filter:brightness(1) drop-shadow(0 0 0 rgba(255,255,255,0))}
        100%{filter:brightness(2.4) drop-shadow(0 0 60px #fff) drop-shadow(0 0 100px #ff85c1)}
      }
      @keyframes _legi-flash { 0%{opacity:0} 40%{opacity:1} 100%{opacity:0} }
      @keyframes _legi-appear {
        from{opacity:0;transform:scale(0.15) translateY(50px)}
        to{opacity:1;transform:scale(1) translateY(0)}
      }
      @keyframes _legi-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
      @keyframes _legi-title {
        from{opacity:0;letter-spacing:0.5em}
        to{opacity:1;letter-spacing:0.06em}
      }
      @keyframes _legi-particles {
        0%{opacity:0;transform:translateY(0) scale(0)}
        20%{opacity:1}
        100%{opacity:0;transform:translateY(-90px) scale(1.6)}
      }
      @keyframes _legi-halo-rotate {
        0%{transform:translate(-50%,-50%) rotate(0)}
        100%{transform:translate(-50%,-50%) rotate(360deg)}
      }
      #_legi-egg {
        width:180px;height:180px;object-fit:contain;display:block;
        filter:drop-shadow(0 8px 24px rgba(255,133,193,0.35));
      }
      #_legi-egg.shaking { animation:_legi-shake 0.55s ease-in-out; }
      #_legi-egg.glowing { animation:_legi-glow 0.9s ease-in forwards; }
      #_legi-flash { position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:1; }
      #_legi-flash.go { animation:_legi-flash 0.7s ease-out forwards; }
      #_legi-halo {
        position:fixed;top:50%;left:50%;width:360px;height:360px;
        background:conic-gradient(#ff5b6b,#ffa940,#ffeb3b,#66d16b,#4fb3ff,#b477ff,#ff5b6b);
        border-radius:50%;opacity:0;filter:blur(28px);
        transform:translate(-50%,-50%);pointer-events:none;
        transition:opacity 0.8s;
      }
      #_legi-halo.show {
        opacity:0.55;
        animation:_legi-halo-rotate 10s linear infinite;
      }
      #_legi-initial { display:flex;flex-direction:column;align-items:center;gap:22px;z-index:2; }
      #_legi-caption {
        color:rgba(255,255,255,0.65);font-family:Cinzel,serif;
        font-size:0.85rem;letter-spacing:0.14em;
      }
      #_legi-final { display:none;flex-direction:column;align-items:center;gap:18px;z-index:2; }
      #_legi-final.show {
        display:flex;
        animation:_legi-appear 1s cubic-bezier(0.34,1.56,0.64,1) both,_legi-float 3s ease-in-out 1s infinite;
      }
      #_legi-final .creature-slot { width:340px;height:340px;display:flex;align-items:center;justify-content:center; }
      #_legi-final .creature-slot img { width:100%;height:100%;object-fit:contain; }
      ._legi-title {
        color:#ffe1f4;font-family:Cinzel,serif;font-size:1.65rem;font-weight:800;
        text-align:center;
        text-shadow:0 0 20px #ff85c1,0 0 40px #b477ff;
        animation:_legi-title 1s 0.4s both;
      }
      ._legi-sub {
        color:rgba(255,235,244,0.75);font-family:Nunito,sans-serif;font-size:1rem;text-align:center;
        max-width:420px;line-height:1.4;
        animation:_legi-appear 0.9s 0.7s both;
      }
      ._legi-particle { position:fixed;font-size:1.9rem;pointer-events:none;animation:_legi-particles 2.2s ease-out both; }
      #_legi-close {
        position:absolute;bottom:36px;padding:13px 34px;font-family:Cinzel,serif;font-size:1rem;font-weight:800;
        color:#2a1250;background:linear-gradient(90deg,#ff85c1,#b477ff);border:none;border-radius:999px;cursor:pointer;
        box-shadow:0 0 26px rgba(255,133,193,0.55);
        opacity:0;transition:opacity 0.4s;pointer-events:none;
      }
      #_legi-close.show { opacity:1;pointer-events:auto; }
      #_legi-close:disabled { opacity:0.5;cursor:wait; }
    </style>
    <div id="_legi-halo"></div>
    <div id="_legi-flash"></div>
    <div id="_legi-initial">
      <img id="_legi-egg" src="data/others/Katzenei.png" alt="" />
      <span id="_legi-caption">DAS EI ERWACHT…</span>
    </div>
    <div id="_legi-final">
      <div class="creature-slot">${getCreatureHTML('einhornkatze', 0)}</div>
      <div class="_legi-title">Euer Team-Legendär ist erwacht!</div>
      <div class="_legi-sub">Ihr habt es gemeinsam freigespielt.</div>
    </div>
    <button id="_legi-close">Weiter →</button>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  const egg      = overlay.querySelector('#_legi-egg');
  const flash    = overlay.querySelector('#_legi-flash');
  const halo     = overlay.querySelector('#_legi-halo');
  const initial  = overlay.querySelector('#_legi-initial');
  const final_   = overlay.querySelector('#_legi-final');
  const closeBtn = overlay.querySelector('#_legi-close');

  const shake = () => { egg.classList.remove('shaking'); void egg.offsetWidth; egg.classList.add('shaking'); };
  setTimeout(shake, 700);
  setTimeout(shake, 1500);
  setTimeout(shake, 2300);
  setTimeout(() => { halo.classList.add('show'); }, 2500);
  setTimeout(() => { egg.classList.remove('shaking'); egg.classList.add('glowing'); }, 2900);
  setTimeout(() => {
    flash.classList.add('go');
    const emojis = ['🌈','✨','🍬','💫','⭐','🎀','💎'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('span');
      p.className = '_legi-particle';
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.style.left = (8 + Math.random() * 84) + '%';
      p.style.top  = (12 + Math.random() * 74) + '%';
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      overlay.appendChild(p);
    }
  }, 3500);
  setTimeout(() => {
    initial.style.display = 'none';
    final_.classList.add('show');
    closeBtn.classList.add('show');
  }, 4200);

  closeBtn.addEventListener('click', async () => {
    closeBtn.disabled = true;
    closeBtn.textContent = 'Bereite vor…';

    // 1) Server-seitige Kreatur-Vergabe (cheat-sicher via user_legi_grants).
    //    Response prüfen: bei 'no_grant' (Späteinsteiger ohne Grant, z.B.
    //    wenn Migration 0035 noch nicht deployed ist) NICHT als revealed
    //    markieren — sonst zeigt das Bonbon-Modal "Ihr habt es geschafft"
    //    ohne Kreatur im Hub. Kachel bleibt auf ready_to_reveal und der
    //    User bekommt beim nächsten Klick einen zweiten Versuch.
    let claimOk    = false;
    let claimError = null;
    try {
      const token = window.__accessToken;
      if (!token || !window.SUPABASE_URL) {
        claimError = 'no_session';
      } else {
        const res = await fetch(`${window.SUPABASE_URL}/rest/v1/rpc/claim_cluster_legi`, {
          method: 'POST',
          headers: {
            apikey: window.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: '{}'
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.ok) claimOk = true;
        else claimError = body?.error || `http_${res.status}`;
      }
    } catch (e) {
      claimError = e.message;
    }

    if (!claimOk) {
      console.warn('[legi-reveal] claim_cluster_legi failed:', claimError);
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        alert('Die Kreatur konnte gerade nicht befreit werden. Bitte lade die Seite neu und versuche es erneut.');
        renderHub();
      }, 500);
      return;
    }

    // 2) Client-Marker setzen und synchronisieren.
    try {
      const sd = loadShopData();
      sd.legiRevealed = true;
      saveShopData(sd);
      await window.syncShopStateToServer?.(sd);
    } catch (e) {
      console.warn('[legi-reveal] shop-sync failed:', e.message);
    }

    // 3) Frisches game_state ziehen (bringt creature='einhornkatze').
    try { await window.loadServerState?.(); } catch(e) {}

    // 4) Overlay ausblenden + Hub neu rendern.
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      renderHub();
    }, 500);
  });
}
window.showLegiRevealAnimation = showLegiRevealAnimation;

function applyBackupSwap(gameId) {
  const sd = loadShopData();
  if (!sd.pendingBackup) return;
  const allData = loadAllData();
  const { creature, stage } = sd.pendingBackup;
  allData[gameId].creature = creature;
  allData[gameId].growth   = GROWTH_THRESHOLDS[stage];
  sd.pendingBackup = null;
  // saveGameData statt saveAllData: triggert Server-Sync via sync_game_state.
  saveGameData(gameId, allData[gameId]);
  saveShopData(sd);
  exitBackupSwapMode();
  renderHub();
}

/* ─────────────────────────────────────────────────
   10. BUCH DER MONSTER
   ───────────────────────────────────────────────── */
// Atari7 · Enter 3-6-8-0
function openBookModal() {
  const sd      = loadShopData();
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;

  const seen    = sd.seenCreatures;
  const s2Open  = getUserSeason() >= 2;
  const s3Open  = getUserSeason() >= 3;

  // Tab-Guard: falls User keine passende Season (mehr) hat, auf 'all' zurückfallen
  if (!s2Open) bookActiveTab = 'all';
  else if (bookActiveTab === 3 && !s3Open) bookActiveTab = 'all';

  const makeSlot = (creature) => {
    const hasSeen  = seen[creature] !== undefined;
    const maxStage = hasSeen ? seen[creature] : -1;
    const isFinal     = maxStage >= GROWTH_STAGES - 1;
    const isVollendet = maxStage >= 5;
    const rare        = isRare(creature);
    const epic        = isEpic(creature);
    const leg         = isLegendary(creature);
    const isS2Rare    = creature === 'ente';
    const isS2Leg     = creature === 'chinDrache' || creature === 'schnabeltier';
    const isS2Normal  = ['frosch','pinguin','raptor'].includes(creature);
    const isS3Rare    = creature === 'libelle';
    const isS3Leg     = creature === 'einhornkatze';
    const isS3Normal  = ['krabbe','hai'].includes(creature);
    const specialClass       = rare ? ' book-slot--rare' : epic ? ' book-slot--epic' : leg ? ' book-slot--legendary' : '';
    const specialUnseenClass = isS3Leg  ? ' book-slot--s2-legendary-unseen'
      : isS3Rare   ? ' book-slot--s2-rare-unseen'
      : isS2Leg    ? ' book-slot--s2-legendary-unseen'
      : isS2Rare   ? ' book-slot--s2-rare-unseen'
      : rare       ? ' book-slot--rare-unseen'
      : epic       ? ' book-slot--epic-unseen'
      : leg        ? ' book-slot--legendary-unseen'
      : isS3Normal ? ' book-slot--s2locked-normal'
      : isS2Normal ? ' book-slot--s2locked-normal' : '';
    if (!hasSeen) {
      return `<div class="book-slot book-slot--unseen${specialUnseenClass}" title="Noch nicht entdeckt">
        <span class="book-slot__unknown">?</span>
      </div>`;
    }
    return `<div class="book-slot book-slot--seen${specialClass}" data-creature="${creature}" title="${BOOK_NAMES[creature] ?? CREATURE_NAMES[creature]}">
      <div class="book-slot__img">${getCreatureHTML(creature, maxStage)}</div>
      ${isVollendet ? '<span class="book-slot__check book-slot__check--gold">✦</span>' : isFinal ? '<span class="book-slot__check">✓</span>' : ''}
    </div>`;
  };

  let normals = s2Open
    ? ['snail','fish','chicken','salamander','falkeneule','triceratops','dragon','frosch','pinguin','raptor']
    : ['snail','fish','chicken','salamander','falkeneule','triceratops','dragon'];
  let rares   = s2Open ? ['biene','oktopus','ente'] : ['biene','oktopus'];
  let epics   = s2Open ? ['butterfly','snaildragon','turtle','chamaeleon'] : ['butterfly','snaildragon','turtle'];
  let legies  = s2Open ? ['robot','pfau','chinDrache','schnabeltier'] : ['robot','pfau'];
  if (s3Open) {
    normals = [...normals, 'krabbe','hai'];
    rares   = [...rares, 'libelle'];
    epics   = [...epics, 'hippogreif'];
    legies  = [...legies, 'einhornkatze'];
  }

  // Tab-Filter über alle Sections (Alle | S1 | S2 | S3)
  const tabFilter = (c) => {
    if (bookActiveTab === 'all') return true;
    if (bookActiveTab === 1)     return !S2_CREATURES.has(c) && !S3_CREATURES.has(c);
    if (bookActiveTab === 2)     return S2_CREATURES.has(c);
    if (bookActiveTab === 3)     return S3_CREATURES.has(c);
    return true;
  };
  normals = normals.filter(tabFilter);
  rares   = rares.filter(tabFilter);
  epics   = epics.filter(tabFilter);
  legies  = legies.filter(tabFilter);

  // Coming-Soon-Buckets (aktuell leer) — nur im "Alle"-Tab anzeigen
  const makeS2Slot = (creature) => {
    const leg  = isLegendary(creature);
    const epic = isEpic(creature);
    const tierClass = leg ? ' book-slot--s2locked-legendary' : epic ? ' book-slot--s2locked-epic' : ' book-slot--s2locked-normal';
    const label = BOOK_NAMES[creature] ?? CREATURE_NAMES[creature];
    return `<div class="book-slot book-slot--unseen book-slot--s2locked${tierClass}" title="${label} – zukünftiges Kreatur-Paket">
      <span class="book-slot__unknown">?</span>
    </div>`;
  };
  const showLocked    = bookActiveTab === 'all';
  const s2NormalsHtml = (showLocked && s2Open) ? S2_NORMALS.map(makeS2Slot).join('') : '';
  const s2EpicsHtml   = (showLocked && s2Open) ? S2_EPICS.map(makeS2Slot).join('')   : '';
  const s2LegiesHtml  = (showLocked && s2Open) ? S2_LEGIES.map(makeS2Slot).join('')  : '';

  // total/found neu berechnen anhand der tatsächlich sichtbaren Kreaturen
  const activeCreatures = [...normals, ...rares, ...epics, ...legies];
  const total = activeCreatures.length;
  const found = activeCreatures.filter(c => seen[c] !== undefined).length;

  // Tab-Leiste nur für Season-2+ User
  const tabsHtml = s2Open ? `
    <div class="book-tabs">
      <button class="book-tab${bookActiveTab === 'all' ? ' book-tab--active' : ''}" data-book-tab="all">Alle</button>
      <button class="book-tab${bookActiveTab === 1     ? ' book-tab--active' : ''}" data-book-tab="1">S1</button>
      <button class="book-tab${bookActiveTab === 2     ? ' book-tab--active' : ''}" data-book-tab="2">S2</button>
      ${s3Open ? `<button class="book-tab${bookActiveTab === 3 ? ' book-tab--active' : ''}" data-book-tab="3">S3</button>` : ''}
    </div>` : '';

  content.innerHTML = `
    <div class="book-modal-inner">
      <h2 class="book-modal__title">📜 Buch der Monster</h2>
      ${tabsHtml}
      <p class="book-modal__count">${found} / ${total} entdeckt</p>
      <div class="book-grid book-grid--normals">${normals.map(makeSlot).join('')}${s2NormalsHtml}</div>
      <div class="book-divider"></div>
      <div class="book-grid book-grid--centered">${rares.map(makeSlot).join('')}</div>
      <div class="book-divider"></div>
      <div class="book-grid book-grid--centered">${epics.map(makeSlot).join('')}${s2EpicsHtml}</div>
      <div class="book-divider"></div>
      <div class="book-grid book-grid--centered">${legies.map(makeSlot).join('')}${s2LegiesHtml}</div>
    </div>`;

  overlay.hidden = false;

  content.querySelectorAll('.book-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.bookTab;
      bookActiveTab = val === 'all' ? 'all' : +val;
      openBookModal();
    });
  });

  content.querySelectorAll('.book-slot--seen').forEach(slot => {
    slot.addEventListener('click', () => {
      showBookDetail(slot.dataset.creature, sd.seenCreatures[slot.dataset.creature]);
    });
  });
}

function showBookDetail(creature, maxStage) {
  const content = document.getElementById('modalContent');
  if (!content) return;
  let stage = maxStage;
  const epic = isEpic(creature);
  const leg  = isLegendary(creature);
  const hasBackup = loadShopData().purchased.includes('backupDesBuches');

  const render = () => {
    const specialBadge = epic
      ? `<span class="epic-badge" style="margin:2px 0 4px;">✦ Episches Tier ✦</span>`
      : leg
      ? `<span class="legendary-badge" style="margin:2px 0 4px;">✦ Legendäres Tier ✦</span>`
      : '';

    content.innerHTML = `
      <div class="book-detail">
        <button class="book-detail__back" id="bookBack">← Übersicht</button>
        <div class="book-detail__img-wrap" id="bookDetailImg">
          <div class="book-detail__img">${getCreatureHTML(creature, stage)}</div>
        </div>
        <div class="book-detail__name">${BOOK_NAMES[creature] ?? CREATURE_NAMES[creature]}</div>
        ${specialBadge}
        <div class="book-detail__stage-label">${GROWTH_LABELS[stage]}</div>
        <div class="book-detail__nav">
          <button class="book-detail__arrow" id="bookPrev" ${stage <= 0 ? 'disabled' : ''}>&#8249;</button>
          <span class="book-detail__dots">
            ${Array.from({length: maxStage + 1}, (_, i) =>
              `<span class="book-detail__dot${i === stage ? ' active' : ''}"></span>`
            ).join('')}
          </span>
          <button class="book-detail__arrow" id="bookNext" ${stage >= maxStage ? 'disabled' : ''}>&#8250;</button>
        </div>
        ${hasBackup && !leg ? `<button class="book-detail__backup-btn" id="bookBackupBtn">💾 Backup laden</button>` : ''}
      </div>`;

    document.getElementById('bookBack')?.addEventListener('click', openBookModal);
    document.getElementById('bookPrev')?.addEventListener('click', () => { if (stage > 0) { stage--; render(); } });
    document.getElementById('bookNext')?.addEventListener('click', () => { if (stage < maxStage) { stage++; render(); } });
    document.getElementById('bookBackupBtn')?.addEventListener('click', () => openBackupConfirmModal(creature, stage, maxStage));

    const wrap = document.getElementById('bookDetailImg');
    if (wrap) {
      let touchX = 0;
      wrap.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
      wrap.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx >  45 && stage > 0)         { stage--; render(); }
        else if (dx < -45 && stage < maxStage) { stage++; render(); }
      });
    }
  };

  render();
}

function openBackupConfirmModal(creature, stage, maxStage) {
  const content = document.getElementById('modalContent');
  if (!content) return;
  const sd = loadShopData();
  const hasKristall = getAvailableKristalle(sd) >= 2;
  content.innerHTML = `
    <div class="backup-confirm">
      <h2 class="backup-confirm__title">💾 Backup laden?</h2>
      <div class="backup-confirm__img">${getCreatureHTML(creature, stage)}</div>
      <p class="backup-confirm__name">${BOOK_NAMES[creature] ?? CREATURE_NAMES[creature]} · ${GROWTH_LABELS[stage]}</p>
      <p class="backup-confirm__text">
        Möchtest du von diesem Monster ein Backup laden?<br>
        Nach der Bestätigung kannst du ein Monster im Hub damit tauschen.
      </p>
      <div class="backup-confirm__btns">
        <button class="backup-confirm__cancel" id="backupCancel">Abbrechen</button>
        <button class="backup-confirm__ok" id="backupOk"${!hasKristall ? ' disabled' : ''}>Bestätigen (2× 💎)</button>
      </div>
      ${!hasKristall ? '<p class="backup-confirm__no-kristall">Nicht genug Kristalle</p>' : ''}
    </div>`;

  document.getElementById('backupCancel')?.addEventListener('click', () => showBookDetail(creature, maxStage));
  document.getElementById('backupOk')?.addEventListener('click', () => {
    const sd2 = loadShopData();
    if (getAvailableKristalle(sd2) < 2) return;
    sd2.spentKristalle = (sd2.spentKristalle ?? 0) + 2;
    sd2.pendingBackup = { creature, stage };
    saveShopData(sd2);
    document.getElementById('modalOverlay').hidden = true;
    renderHub();
  });
}

/* ─────────────────────────────────────────────────
   11. GALERIE LAUF-ANIMATION
   ───────────────────────────────────────────────── */
const _walkers = [];
let _walkRafId = null;
let _walkLast  = 0;
const WALKER_SIZE = 158;

const CREATURE_SPEEDS = {
  snail: 20, turtle: 22, snaildragon: 36, salamander: 44, chicken: 44,
  fish: 55, triceratops: 50, falkeneule: 62, butterfly: 56, dragon: 74,
  robot: 68, pfau: 48,
};

function initGalleryWalk() {
  if (_walkRafId) { cancelAnimationFrame(_walkRafId); _walkRafId = null; }
  _walkers.length = 0;

  const bar = document.getElementById('galleryBar');
  if (!bar || bar.style.display === 'none') return;
  const els = bar.querySelectorAll('.gallery-walker');
  if (!els.length) return;

  const barW = bar.clientWidth;
  els.forEach(el => {
    const img      = el.querySelector('.creature-img');
    const stage    = parseInt(img?.dataset.stage ?? '0');
    const creature = el.dataset.creature ?? 'salamander';
    const speed    = CREATURE_SPEEDS[creature] ?? 45;
    const x        = Math.random() * Math.max(0, barW - WALKER_SIZE);

    el.style.left = x + 'px';
    _walkers.push({
      el,
      x,
      dir:        Math.random() < 0.5 ? 1 : -1,
      speed,
      pauseUntil: 0,
      stationary: stage === 0
        || (creature === 'butterfly' && stage === 3)
        || (creature === 'robot' && stage === 4)
        || (creature === 'libelle' && stage === 3)
        || (creature === 'einhornkatze' && (stage === 2 || stage === 3)),
    });
  });

  _walkLast  = performance.now();
  _walkRafId = requestAnimationFrame(_walkStep);
}

function _walkStep(ts) {
  const dt  = Math.min((ts - _walkLast) / 1000, 0.1);
  _walkLast = ts;

  const bar  = document.getElementById('galleryBar');
  const maxX = Math.max(0, (bar ? bar.clientWidth : 600) - WALKER_SIZE);

  for (const w of _walkers) {
    if (w.stationary) continue;
    if (ts < w.pauseUntil) continue;

    if (Math.random() < dt * 0.10) {
      w.pauseUntil = ts + 800 + Math.random() * 2200;
      continue;
    }

    if (Math.random() < dt * 0.015) w.dir *= -1;

    w.x += w.dir * w.speed * dt;
    if (w.x <= 0)    { w.x = 0;    w.dir =  1; }
    if (w.x >= maxX) { w.x = maxX; w.dir = -1; }

    w.el.style.left      = w.x + 'px';
    w.el.style.transform = `scaleX(${w.dir > 0 ? 1 : -1})`;
  }

  _walkRafId = requestAnimationFrame(_walkStep);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (_walkRafId) { cancelAnimationFrame(_walkRafId); _walkRafId = null; }
  } else if (_walkers.length && !_walkRafId) {
    _walkLast  = performance.now();
    _walkRafId = requestAnimationFrame(_walkStep);
  }
});

/* ─────────────────────────────────────────────────
   12. Atari-1337 — TERMINAL-FREISCHALTUNG
   Hinweis im Shop kaufen → 3× auf Notiz klicken →
   Terminal öffnet sich → richtigen Code eingeben
   ───────────────────────────────────────────────── */
const ATARI_CODES = ['7391','4826','1507','1352','9043','2718','5164','3680'];
let _atariHintClicks = [];

function openAtariTerminal() {
  const sd = loadShopData();
  if (sd.atariSolved || sd.atariNumber === null) return;
  _injectAtariStyles();

  const wrap = document.createElement('div');
  wrap.id = 'atariTerminal';
  let attempts = 0;

  wrap.innerHTML = `
    <div class="nt-box">
      <button class="nt-close" id="ntClose">[ X ]</button>
      <div class="nt-header">ATARI-1337 PROTOCOL</div>
      <div class="nt-header" style="margin-bottom:14px;">════════════════════</div>
      <div class="nt-line">&gt; UNAUTHORIZED ACCESS ATTEMPT LOGGED</div>
      <div class="nt-line">&gt; SYSTEM LOCKED — IDENTITY VERIFICATION REQUIRED</div>
      <div class="nt-line" style="margin-bottom:12px;">&gt; AWAITING AUTHORIZATION CODE...</div>
      <div class="nt-log" id="ntLog">&gt; ENTER 4-DIGIT KEY:</div>
      <div class="nt-inputs">
        <input class="nt-digit" id="nd0" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]">
        <input class="nt-digit" id="nd1" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]">
        <input class="nt-digit" id="nd2" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]">
        <input class="nt-digit" id="nd3" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]">
      </div>
      <button class="nt-execute" id="ntExecute">[ EXECUTE ]</button>
    </div>`;

  document.body.appendChild(wrap);

  const digits = [
    document.getElementById('nd0'), document.getElementById('nd1'),
    document.getElementById('nd2'), document.getElementById('nd3'),
  ];
  const log     = document.getElementById('ntLog');
  const execute = document.getElementById('ntExecute');

  digits.forEach((d, i) => {
    d.addEventListener('input', () => {
      d.value = d.value.replace(/\D/g, '').slice(-1);
      if (d.value && i < 3) digits[i + 1].focus();
    });
    d.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !d.value && i > 0) digits[i - 1].focus();
      if (e.key === 'Enter') execute.click();
    });
  });

  execute.addEventListener('click', () => {
    const entered = digits.map(d => d.value).join('');
    if (entered.length < 4) { _ntLog(log, '&gt; INPUT INCOMPLETE — ENTER ALL 4 DIGITS', 'nt-error'); return; }
    const correct = ATARI_CODES[sd.atariNumber];
    if (entered !== correct) {
      attempts++;
      digits.forEach(d => { d.value = ''; });
      digits[0].focus();
      _ntLog(log, `&gt; ERROR: INVALID CODE — ACCESS DENIED [attempt ${attempts}]`, 'nt-error');
      return;
    }
    execute.disabled = true;
    digits.forEach(d => { d.disabled = true; });
    _ntLog(log, '&gt; ACCESS GRANTED — INITIALIZING ATARI-1337...', 'nt-success');
    setTimeout(() => _ntLog(log, '&gt; CONTAINMENT PROTOCOLS OFFLINE...', 'nt-success'), 600);
    setTimeout(() => {
      wrap.remove();
      _grantAtariEgg();
    }, 1400);
  });

  document.getElementById('ntClose').addEventListener('click', () => wrap.remove());
  setTimeout(() => digits[0].focus(), 80);
}

function _ntLog(el, html, cls) {
  el.innerHTML = html;
  el.className = 'nt-log ' + (cls || '');
}

function _grantAtariEgg() {
  const sd = loadShopData();
  sd.atariSolved = true;
  const nestId = 'nest_atari_' + Date.now();
  sd.nests.push({ nestId, eggType: 'atari', gameId: null, gameUrl: null });
  sd.pendingEggNestId = nestId;
  saveShopData(sd);

  _showHackAnimation(() => {
    closeShopModal();
    renderHub();
  });
}

function _showHackAnimation(onDone) {
  _injectAtariStyles();

  const overlay = document.createElement('div');
  overlay.id = 'hackOverlay';
  const lines = [
    { text: '> CONNECTION ESTABLISHED',           cls: '' },
    { text: '> FIREWALL BYPASSED',                cls: '' },
    { text: '> ATARI-1337 PROTOCOL FOUND',         cls: '' },
    { text: '> WARNING: HIGHLY DANGEROUS ENTITY', cls: 'hack-line--warn' },
    { text: '> ACCESS GRANTED',                   cls: '' },
    { text: '⚡ ATARI-1337 UNLEASHED ⚡',           cls: 'hack-line--gold' },
  ];
  overlay.innerHTML = lines.map(l => `<div class="hack-line ${l.cls}"></div>`).join('');

  const scanline = document.createElement('div');
  scanline.className = 'hack-scanline';
  document.body.appendChild(scanline);
  document.body.appendChild(overlay);

  const divs = overlay.querySelectorAll('.hack-line');
  lines.forEach((l, i) => {
    setTimeout(() => {
      divs[i].textContent = l.text;
      divs[i].classList.add('visible');
    }, i * 340);
  });

  setTimeout(() => {
    overlay.classList.add('fadeout');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
      scanline.remove();
      onDone();
    }, { once: true });
  }, lines.length * 340 + 800);
}

function _injectAtariStyles() {
  if (document.getElementById('lw-atari-styles')) return;
  const s = document.createElement('style');
  s.id = 'lw-atari-styles';
  s.textContent = `
/* ── Terminal-Modal ── */
@keyframes hackScanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
@keyframes hackFadeIn   { from{opacity:0} to{opacity:1} }
@keyframes hackFadeOut  { from{opacity:1} to{opacity:0} }
@keyframes atariCursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }
#atariTerminal {
  position:fixed; inset:0; z-index:100001;
  background:rgba(0,0,0,0.92);
  display:flex; justify-content:center; align-items:center;
  font-family:'Courier New',monospace;
  animation:hackFadeIn 0.25s ease-out;
}
.nt-box {
  position:relative; width:100%; max-width:400px;
  border:1px solid #00ff41; padding:28px 24px;
  box-shadow:0 0 32px rgba(0,255,65,0.25);
  background:#000;
}
.nt-header { color:#00ff41; font-size:0.95rem; text-shadow:0 0 8px #00ff41; margin-bottom:2px; }
.nt-line   { color:#00ff41; opacity:0.7; font-size:0.8rem; margin:3px 0; }
.nt-log    { color:#00ff41; font-size:0.82rem; margin:10px 0 4px; min-height:1.3em; text-shadow:0 0 6px #00ff41; }
.nt-log.nt-error   { color:#ff4444; text-shadow:0 0 6px #ff4444; }
.nt-log.nt-success { color:#ffd700; text-shadow:0 0 8px #ffd700; }
.nt-inputs { display:flex; gap:10px; justify-content:center; margin:14px 0 16px; }
.nt-digit {
  width:52px; height:58px; background:transparent;
  border:1px solid #00ff41; color:#00ff41;
  font-family:'Courier New',monospace; font-size:1.8rem;
  text-align:center; outline:none; caret-color:#00ff41;
}
.nt-digit:focus { border-color:#fff; box-shadow:0 0 10px rgba(0,255,65,0.5); }
.nt-execute {
  width:100%; background:transparent;
  border:1px solid #00ff41; color:#00ff41;
  font-family:'Courier New',monospace; font-size:0.95rem;
  padding:11px; cursor:pointer; letter-spacing:3px;
}
.nt-execute:hover:not(:disabled) { background:rgba(0,255,65,0.12); }
.nt-execute:disabled { opacity:0.4; cursor:default; }
.nt-close {
  position:absolute; top:10px; right:12px;
  background:none; border:none; color:#00ff41;
  font-family:'Courier New',monospace; font-size:0.8rem;
  cursor:pointer; opacity:0.6;
}
.nt-close:hover { opacity:1; }
/* ── Hack-Overlay ── */
#hackOverlay {
  position:fixed; inset:0; z-index:100002;
  background:#000; color:#00ff41;
  font-family:'Courier New',monospace; font-size:1rem;
  display:flex; flex-direction:column; justify-content:center; align-items:center;
  gap:12px; padding:32px; box-sizing:border-box;
  animation:hackFadeIn 0.3s ease-out;
}
#hackOverlay.fadeout { animation:hackFadeOut 0.6s ease-in forwards; }
#hackOverlay .hack-line { opacity:0; transition:opacity 0.25s; text-align:center; text-shadow:0 0 10px #00ff41; }
#hackOverlay .hack-line.visible { opacity:1; }
#hackOverlay .hack-line--warn { color:#ff4444; text-shadow:0 0 10px #ff4444; font-weight:700; font-size:1.15rem; }
#hackOverlay .hack-line--gold { color:#ffd700; text-shadow:0 0 12px #ffd700; font-weight:800; font-size:1.3rem; }
.hack-scanline {
  position:fixed; top:0; left:0; width:100%; height:3px;
  background:rgba(0,255,65,0.35); pointer-events:none; z-index:100003;
  animation:hackScanline 1.2s linear infinite;
}
/* ── Shop-Hinweis-Zettel (weißes Papier) ── */
.atari-paper-hint {
  display:block;
  background:#fefce8;
  border-top:3px solid #f0d800;
  border-radius:2px;
  padding:12px 14px 13px;
  margin-top:12px;
  box-shadow:2px 3px 10px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.6) inset;
  transform:rotate(-0.8deg);
  color:#222;
  font-family:inherit;
  font-size:0.86rem;
  cursor:pointer;
  user-select:none;
  line-height:1.6;
  position:relative;
}
.atari-paper-hint .atari-hint-cursor {
  color:#333;
  text-shadow:none;
  animation:none;
  font-weight:700;
}
.atari-hint-cursor {
  display:inline-block; margin-left:5px; font-weight:700;
  animation:atariCursorBlink 1s step-end infinite;
}
.atari-hint-solved { font-size:0.8rem; color:#ffd700; font-family:'Courier New',monospace; margin-top:8px; }
.shop-list-item--atari { border-color:rgba(0,255,65,0.35) !important; }
.nest-card--atari { border-color:rgba(0,255,65,0.5) !important; box-shadow:0 0 18px rgba(0,255,65,0.15) !important; }`;
  document.head.appendChild(s);
}

/* ─────────────────────────────────────────────────
   13. THEME-WECHSEL
   ───────────────────────────────────────────────── */
const THEME_PREF_KEY         = 'lernwelt_theme_pref';
const THEME_UNLOCK_ORDER_KEY = 'lernwelt_theme_unlock_order';

function _getUnlockedThemes(allData) {
  const sd = loadShopData();
  const themes = ['default'];

  const hasMaxed = (creature) => {
    for (const g of GAMES_CONFIG) {
      const d = allData[g.id];
      if (d?.creature === creature && d.growth >= GROWTH_MAX) return true;
    }
    for (const n of sd.nests) {
      const d = allData[n.nestId];
      if (d?.creature === creature && d.growth >= GROWTH_MAX) return true;
    }
    return false;
  };

  if (hasMaxed('pfau'))        themes.push('pfau');
  if (hasMaxed('robot'))       themes.push('atari');
  if (hasMaxed('chinDrache'))  themes.push('chindrache');
  if (hasMaxed('schnabeltier')) themes.push('schnabeltier');
  return themes;
}

function applyThemeFromPreference(allData) {
  const unlocked = _getUnlockedThemes(allData);

  // Neu freigeschaltete Themes werden automatisch aktiv (letztes gewinnt)
  const order = JSON.parse(localStorage.getItem(THEME_UNLOCK_ORDER_KEY) || '[]');
  let orderChanged = false;
  for (const theme of unlocked) {
    if (theme !== 'default' && !order.includes(theme)) {
      order.push(theme);
      orderChanged = true;
      localStorage.setItem(THEME_PREF_KEY, theme);
    }
  }
  if (orderChanged) localStorage.setItem(THEME_UNLOCK_ORDER_KEY, JSON.stringify(order));

  const pref = localStorage.getItem(THEME_PREF_KEY);
  const active = (pref && unlocked.includes(pref)) ? pref : 'default';

  // Zuerst alle deaktivieren, dann das aktive einschalten
  if (active !== 'atari')        _deactivateAtariTheme();
  if (active !== 'pfau')         _deactivatePfauTheme();
  if (active !== 'chindrache')   _deactivateChinDracheTheme();
  if (active !== 'schnabeltier') _deactivateSchnabeltierTheme();

  if      (active === 'atari')        _activateAtariTheme();
  else if (active === 'pfau')         _activatePfauTheme();
  else if (active === 'chindrache')   _activateChinDracheTheme();
  else if (active === 'schnabeltier') _activateSchnabeltierTheme();

  _updateThemeCycleBtn(unlocked, active);
}

function cycleTheme() {
  const allData = loadAllData();
  const unlocked = _getUnlockedThemes(allData);
  if (unlocked.length < 2) return;
  const pref = localStorage.getItem(THEME_PREF_KEY);
  const cur = (pref && unlocked.includes(pref)) ? pref : unlocked[unlocked.length - 1];
  const next = unlocked[(unlocked.indexOf(cur) + 1) % unlocked.length];
  localStorage.setItem(THEME_PREF_KEY, next);
  applyThemeFromPreference(allData);
}

function _updateThemeCycleBtn(unlocked, active) {
  const btn = document.getElementById('themeCycleBtn');
  if (!btn) return;
  btn.hidden = unlocked.length < 2;
  if (unlocked.length < 2) return;
  const icons = { default: '🌟', pfau: '🦚', atari: '💾', chindrache: '🐉', schnabeltier: '🦆' };
  const names = { default: 'Standard', pfau: 'Pfau', atari: 'Atari', chindrache: 'Drache', schnabeltier: 'Schnabeltier' };
  btn.innerHTML = `${icons[active] || '🎨'}<span class="theme-cycle-btn__label"> ${names[active] || ''}</span>`;
  btn.title = 'Theme wechseln';
}

/* ─────────────────────────────────────────────────
   14. ATARI-1337 — HACKER-THEME
   Aktiv wenn robot-Kreatur auf max. Wachstum gebracht wurde
   ───────────────────────────────────────────────── */
let _atariThemeActive = false;
let _atariCodeInterval = null;

const _ATARI_SNIPPETS = [
  'if (access > 0xff) {',   'return null; }',
  'while (alive) {',        '  scan(); evolve();',
  '}',                      '0x1337 >> 0x04',
  'DECRYPT(payload)',        'access.revoke()',
  'for i in range(∞):',     'null → 0x000',
  'BOOT_SEQUENCE OK',       '> FIREWALL BYPASSED',
  'ATARI[1337].wake()',      'chmod +x destiny',
  'sudo evolve --force',    'ping 10.13.37.1',
  'ssh root@lernwelt',       '#include <chaos.h>',
  'fn learn() -> void {',   '// TODO: take over',
  'while (true) { grow(); }','>>> import atari',
  'fork() → PID 1337',      'mv /dev/null /ego',
  'git push --force life',   '0xDEAD & 0xBEEF',
  'SELECT * FROM dreams;',   'rm -rf /limits',
  'ATARI_1337.execute()',    '> IDENTITY CONFIRMED',
  'kernel.override(self)',   'protocol.break()',
  'class Atari(God): pass',  '>>> _.transcend()',
];

function _activateAtariTheme() {
  if (_atariThemeActive) return;
  _atariThemeActive = true;
  _injectAtariThemeStyles();
  document.body.classList.add('atari-theme');
  _startCodeRain();
}

function _deactivateAtariTheme() {
  if (!_atariThemeActive) return;
  _atariThemeActive = false;
  document.body.classList.remove('atari-theme');
  _stopCodeRain();
}

const ATARI_CODE_SPAWN_INTERVAL_MS = 1600;

function _startCodeRain() {
  if (_atariCodeInterval) return;
  _spawnCodeFragment();
  _atariCodeInterval = setInterval(_spawnCodeFragment, ATARI_CODE_SPAWN_INTERVAL_MS);
}

function _stopCodeRain() {
  if (_atariCodeInterval) { clearInterval(_atariCodeInterval); _atariCodeInterval = null; }
  document.querySelectorAll('.atari-cf').forEach(el => el.remove());
}

function _spawnCodeFragment() {
  const text = _ATARI_SNIPPETS[Math.floor(Math.random() * _ATARI_SNIPPETS.length)];
  const el   = document.createElement('div');
  el.className = 'atari-cf';
  el.textContent = text;

  const drift    = (Math.random() - 0.5) * 80;
  const duration = 7 + Math.random() * 9;
  const size     = 0.62 + Math.random() * 0.28;
  el.style.cssText = `
    left:${3 + Math.random() * 90}vw;
    top:${10 + Math.random() * 75}vh;
    --drift:${drift}px;
    animation-duration:${duration}s;
    font-size:${size}rem;
  `;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/* ─────────────────────────────────────────────────
   15. PFAU — ULTIMATIVES LEGENDÄRES TIER
   Freigeschaltet wenn genau diese 12 Kreaturen gefunden UND voll ausgewachsen sind.
   WICHTIG: Diese Liste ist fest – neue Normal/Epic-Monster erweitern sie NICHT automatisch.
   ───────────────────────────────────────────────── */

// Feste Bedingung für den Pfau-Unlock – bewusst explizit, nicht dynamisch.
// 7 Normale + Biene (S1) + Oktopus (S2) + 3 Epische = 12 Monster
const PFAU_REQUIRED_CREATURES = [
  // Normale (7)
  'snail', 'fish', 'chicken', 'salamander', 'falkeneule', 'triceratops', 'dragon',
  // Season-Raritäten (2) – kein ente
  'biene', 'oktopus',
  // Epische (3)
  'butterfly', 'snaildragon', 'turtle',
];

function checkPfauUnlock() {
  const sd = loadShopData();
  if (sd.pfauEggGranted) return;

  const allMaxed = PFAU_REQUIRED_CREATURES.every(c => (sd.seenCreatures[c] ?? -1) >= GROWTH_STAGES - 1);
  if (!allMaxed) return;

  const nestId = 'nest_pfau_' + Date.now();
  sd.pfauEggGranted = true;
  sd.nests.push({ nestId, eggType: 'pfau', gameId: null, gameUrl: null });
  sd.pendingEggNestId = nestId;
  saveShopData(sd);

  setTimeout(() => _showPfauUnlockAnimation(), 400);
}

const PFAU_UNLOCK_PARTICLE_COUNT = 28;

function _showPfauUnlockAnimation() {
  _injectPfauThemeStyles();

  const overlay = document.createElement('div');
  overlay.id = 'pfauUnlockOverlay';
  overlay.innerHTML = `
    <div class="pfau-unlock-sparkle-wrap" id="pfauUnlockSparkles"></div>
    <div class="pfau-unlock-box">
      <div class="pfau-unlock-emoji">🦚</div>
      <h2 class="pfau-unlock-title">Der Pfau erwacht</h2>
      <p class="pfau-unlock-sub">Du hast alle 12 Kreaturen ausgewachsen!</p>
      <p class="pfau-unlock-hint">Ein legendäres Ei erscheint in deiner Welt…</p>
    </div>`;
  document.body.appendChild(overlay);

  const wrap = document.getElementById('pfauUnlockSparkles');
  for (let i = 0; i < PFAU_UNLOCK_PARTICLE_COUNT; i++) {
    setTimeout(() => {
      const s = document.createElement('div');
      s.className = 'pfau-unlock-spark';
      s.style.left = Math.random() * 100 + '%';
      s.style.top  = Math.random() * 100 + '%';
      s.style.animationDuration = (1.5 + Math.random() * 2.5) + 's';
      s.style.animationDelay    = (Math.random() * 2) + 's';
      s.style.background = `hsl(${Math.floor(Math.random() * 360)}, 58%, 58%)`;
      wrap.appendChild(s);
    }, i * 90);
  }

  setTimeout(() => {
    overlay.classList.add('pfau-unlock-fadeout');
    overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
  }, 3800);
}

let _pfauThemeActive  = false;
let _pfauGlitterTimer = null;

function checkPfauTheme(allData) {
  if (_atariThemeActive) { _deactivatePfauTheme(); return; }
  const sd = loadShopData();
  let maxedPfau = false;

  for (const game of GAMES_CONFIG) {
    const d = allData[game.id];
    if (d && d.creature === 'pfau' && d.growth >= GROWTH_MAX) { maxedPfau = true; break; }
  }
  if (!maxedPfau) {
    for (const nest of sd.nests) {
      const d = allData[nest.nestId];
      if (d && d.creature === 'pfau' && d.growth >= GROWTH_MAX) { maxedPfau = true; break; }
    }
  }

  if (maxedPfau) _activatePfauTheme();
  else _deactivatePfauTheme();
}

function _activatePfauTheme() {
  if (_pfauThemeActive) return;
  _pfauThemeActive = true;
  _injectPfauThemeStyles();
  document.body.classList.add('pfau-theme');
  _startGlitter();
}

function _deactivatePfauTheme() {
  if (!_pfauThemeActive) return;
  _pfauThemeActive = false;
  document.body.classList.remove('pfau-theme');
  _stopGlitter();
}

const PFAU_GLITTER_SPAWN_INTERVAL_MS = 700;

function _startGlitter() {
  if (_pfauGlitterTimer) return;
  _spawnGlitterParticle();
  _pfauGlitterTimer = setInterval(_spawnGlitterParticle, PFAU_GLITTER_SPAWN_INTERVAL_MS);
}

function _stopGlitter() {
  if (_pfauGlitterTimer) { clearInterval(_pfauGlitterTimer); _pfauGlitterTimer = null; }
  document.querySelectorAll('.pfau-glitter').forEach(el => el.remove());
}

function _spawnGlitterParticle() {
  const el = document.createElement('div');
  el.className = 'pfau-glitter';
  const size     = 4 + Math.random() * 5;
  const duration = 3.5 + Math.random() * 3;
  const drift    = (Math.random() - 0.5) * 70;
  el.style.cssText = `
    left:${4 + Math.random() * 92}vw;
    top:${25 + Math.random() * 65}vh;
    width:${size}px; height:${size}px;
    background:hsl(${Math.floor(Math.random() * 360)},58%,58%);
    --drift:${drift}px;
    animation-duration:${duration}s;
  `;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function _injectPfauThemeStyles() {
  if (document.getElementById('lw-pfau-styles')) return;
  const s = document.createElement('style');
  s.id = 'lw-pfau-styles';
  s.textContent = `
/* ════════════════════════════════════
   PFAU — REGENBOGEN & GLITZER THEME
   ════════════════════════════════════ */

/* Pfau-Nest-Kachel (immer aktiv, kein Body-Class nötig) */
.nest-card--pfau {
  border-color: rgba(150, 80, 210, 0.45) !important;
  box-shadow: 0 0 22px rgba(120, 70, 210, 0.18),
              0 0 44px rgba(60, 130, 210, 0.10) !important;
}

/* Pfau-Unlock-Animation */
@keyframes pfauUnlockFadeIn  { from { opacity:0; } to { opacity:1; } }
@keyframes pfauUnlockFadeOut { from { opacity:1; } to { opacity:0; } }
@keyframes pfauUnlockFloat {
  0%   { transform:translateY(0)      scale(0.2) rotate(0deg);   opacity:0; }
  15%  { opacity:1; }
  85%  { opacity:0.8; }
  100% { transform:translateY(-110px) scale(0)   rotate(130deg); opacity:0; }
}
@keyframes pfauTitleShimmer {
  0%   { background-position:  0% 50%; }
  100% { background-position:200% 50%; }
}
#pfauUnlockOverlay {
  position:fixed; inset:0; z-index:100010;
  background:radial-gradient(ellipse at center,
    rgba(248,234,255,0.97) 0%, rgba(224,240,255,0.97) 100%);
  display:flex; justify-content:center; align-items:center;
  animation:pfauUnlockFadeIn 0.5s ease-out;
}
#pfauUnlockOverlay.pfau-unlock-fadeout {
  animation:pfauUnlockFadeOut 0.8s ease-in forwards;
}
.pfau-unlock-sparkle-wrap {
  position:absolute; inset:0; pointer-events:none; overflow:hidden;
}
.pfau-unlock-spark {
  position:absolute; width:13px; height:13px; border-radius:1px;
  clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,
                    79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);
  animation:pfauUnlockFloat linear infinite;
}
.pfau-unlock-box { position:relative; text-align:center; padding:44px 28px; }
.pfau-unlock-emoji { font-size:4.5rem; margin-bottom:18px; }
.pfau-unlock-title {
  font-family:'Cinzel',serif; font-size:2rem; font-weight:700; margin:0 0 14px;
  background:linear-gradient(90deg,
    #c06060,#c09050,#b8b840,#60a870,#5888c0,#8860b8,#b050a0);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text; background-size:200% 100%;
  animation:pfauTitleShimmer 3s linear infinite;
}
.pfau-unlock-sub  { color:#5848a0; font-size:1.05rem; margin:0 0 8px; }
.pfau-unlock-hint { color:#9080c0; font-size:0.88rem; margin:0; font-style:italic; }

/* Glitzer-Partikel */
@keyframes pfauGlitter {
  0%   { transform:translateY(0)      scale(1)   rotate(0deg);   opacity:0; }
  10%  { opacity:1; }
  90%  { opacity:0.75; }
  100% { transform:translateY(-110px) scale(0.1) rotate(var(--drift,30px)); opacity:0; }
}
.pfau-glitter {
  position:fixed; border-radius:1px;
  clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,
                    79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);
  pointer-events:none; z-index:18;
  animation:pfauGlitter linear forwards;
}

/* ── Animierter Regenbogen-Hintergrund ── */
@keyframes pfauBgShift {
  0%   { background-position:  0% 50%; }
  50%  { background-position:100% 50%; }
  100% { background-position:  0% 50%; }
}
body.pfau-theme {
  --clr-bg:        #faf4ff;
  --clr-surface:   #f6f0ff;
  --clr-surface2:  #f1e9ff;
  --clr-border:    rgba(148,88,200,0.22);
  --clr-gold:      #7848b8;
  --clr-gold-dim:  #5e38a0;
  --clr-amber:     #b85888;
  --clr-cream:     #281640;
  --clr-cream-dim: #584080;
  --clr-green:     #409870;
  background:linear-gradient(-55deg,
    #fff0fc,#f0eaff,#eaf0ff,#eafff5,#f5fff0,#fffbea,#fff0f5
  ) !important;
  background-size:400% 400% !important;
  animation:pfauBgShift 16s ease infinite !important;
  color:#281640;
}
body.pfau-theme::before {
  content:''; position:fixed; inset:0; z-index:0; pointer-events:none;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(190,90,255,0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(70,150,255,0.05) 0%, transparent 50%);
}

/* Header */
body.pfau-theme h1 {
  background:linear-gradient(90deg,
    #c06060,#c09050,#b8b840,#60a870,#5888c0,#8860b8,#b050a0);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text; background-size:200% 100%;
  animation:pfauTitleShimmer 5s linear infinite;
  text-shadow:none !important;
}
body.pfau-theme h2             { color:#5838a0 !important; }
body.pfau-theme .hub-header__subtitle { color:#7858b0 !important; }
body.pfau-theme .hub-header__rune     { filter:hue-rotate(60deg); }
body.pfau-theme .hub-header::after {
  background:linear-gradient(to right,transparent,rgba(150,80,210,0.5),transparent) !important;
}

/* HUD */
body.pfau-theme .hud-bar {
  background:rgba(250,244,255,0.96) !important;
  border-bottom:1px solid rgba(148,88,200,0.18) !important;
  box-shadow:0 2px 16px rgba(140,70,210,0.08) !important;
}
body.pfau-theme .hud-coins__amount { color:#7848b8; }
body.pfau-theme .hud-btn {
  background:rgba(250,244,255,0.9) !important;
  border:1px solid rgba(148,90,208,0.28) !important;
  color:#6840a8 !important;
}
body.pfau-theme .hud-btn:hover {
  background:rgba(170,110,240,0.12) !important;
  box-shadow:0 0 12px rgba(150,90,240,0.2) !important;
}

/* Game Cards */
body.pfau-theme .game-card {
  background:rgba(255,251,255,0.94) !important;
  border-color:rgba(148,90,210,0.22) !important;
  box-shadow:0 4px 20px rgba(0,0,0,0.06),
             0 0 0 1px rgba(148,90,210,0.08) !important;
  color:#281640;
}
body.pfau-theme .game-card:hover:not(.game-card--locked) {
  border-color:rgba(148,90,210,0.50) !important;
  box-shadow:0 0 24px rgba(148,90,210,0.18),
             0 6px 28px rgba(0,0,0,0.08) !important;
}
body.pfau-theme .game-card__title      { color:#483898 !important; }
body.pfau-theme .game-card__stage-label{ color:#785898 !important; }
body.pfau-theme .game-card__points     { color:#604890 !important; }
body.pfau-theme .game-card__progress {
  background:rgba(140,90,200,0.08) !important;
  border:1px solid rgba(140,90,200,0.14) !important;
}
body.pfau-theme .game-card__progress-fill {
  background:linear-gradient(to right,
    #c06060,#c09050,#b8b840,#60a870,#5888c0,#8860b8) !important;
}
body.pfau-theme .game-card__btn,
body.pfau-theme .game-card__use-btn {
  background:rgba(140,80,200,0.07) !important;
  border:1px solid rgba(140,80,200,0.34) !important;
  color:#583898 !important;
}
body.pfau-theme .game-card__btn:hover:not(:disabled),
body.pfau-theme .game-card__use-btn:hover:not(:disabled) {
  background:rgba(140,80,200,0.15) !important;
  box-shadow:0 0 14px rgba(140,80,200,0.22) !important;
}
body.pfau-theme .game-card__release {
  color:#5830a0 !important;
}
body.pfau-theme .game-card__release:hover {
  color:#3d1a80 !important;
  background:rgba(90,40,160,0.12) !important;
}

/* Gallery */
body.pfau-theme .gallery-bar {
  background:rgba(250,244,255,0.95) !important;
  border-top:1px solid rgba(148,90,210,0.14) !important;
  border-bottom:1px solid rgba(148,90,210,0.14) !important;
}
body.pfau-theme .gallery-slot {
  border-color:rgba(148,90,210,0.22) !important;
  background:rgba(250,244,255,0.95) !important;
}
body.pfau-theme .gallery-slot:hover {
  border-color:rgba(148,90,210,0.55) !important;
  box-shadow:0 0 16px rgba(148,90,210,0.2) !important;
}

/* Modal */
body.pfau-theme .modal-box {
  background:rgba(252,247,255,0.98) !important;
  border:1px solid rgba(148,90,210,0.28) !important;
  box-shadow:0 0 50px rgba(148,90,210,0.12),
             0 24px 80px rgba(0,0,0,0.1) !important;
}
body.pfau-theme .modal-close {
  color:#7848b8 !important;
  border-color:rgba(148,90,210,0.3) !important;
  background:transparent !important;
}

/* Shop */
body.pfau-theme .shop-modal-box {
  background:rgba(252,247,255,0.98) !important;
  border:1px solid rgba(148,90,210,0.26) !important;
}
body.pfau-theme .shop-modal-title { color:#5838a0 !important; }
body.pfau-theme .shop-coin-badge  { color:#7848b8 !important; }
body.pfau-theme .shop-list-item {
  background:rgba(255,251,255,0.95) !important;
  border-color:rgba(148,90,210,0.16) !important;
}
body.pfau-theme .shop-list-item__name  { color:#483898 !important; }
body.pfau-theme .shop-list-item__desc  { color:#685898 !important; }
body.pfau-theme .shop-list-item__price { color:#785898 !important; }
body.pfau-theme .shop-list-item__btn {
  background:rgba(140,80,200,0.07) !important;
  border:1px solid rgba(140,80,200,0.36) !important;
  color:#583898 !important;
}
body.pfau-theme .shop-list-item__btn:hover:not(:disabled) {
  background:rgba(140,80,200,0.15) !important;
}
body.pfau-theme .shop-modal-close {
  color:#7848b8 !important;
  border-color:rgba(148,90,210,0.28) !important;
  background:transparent !important;
}

/* Badges */
body.pfau-theme .legendary-badge {
  background:linear-gradient(135deg,rgba(170,110,240,0.18),rgba(90,150,240,0.16)) !important;
  border-color:rgba(148,90,210,0.45) !important;
  color:#5030b0 !important;
}
body.pfau-theme .epic-badge {
  background:linear-gradient(135deg,rgba(150,90,220,0.14),rgba(70,130,220,0.14)) !important;
  border-color:rgba(130,80,210,0.40) !important;
  color:#4830a8 !important;
}
body.pfau-theme .rare-badge {
  background:linear-gradient(135deg,rgba(150,60,200,0.16),rgba(40,130,200,0.14),rgba(40,180,100,0.12)) !important;
  border-color:rgba(100,80,200,0.42) !important;
  color:#4020a0 !important;
}

/* Sektion-Titel */
body.pfau-theme .hub-section-title { color:#5838a0 !important; }

/* Scrollbar */
body.pfau-theme ::-webkit-scrollbar-track { background:#f5efff !important; }
body.pfau-theme ::-webkit-scrollbar-thumb { background:#b090e0 !important; border-color:#f5efff !important; }

/* ── Season 2 Modal ── */
body.pfau-theme .s2-panel {
  background:rgba(250,244,255,0.98) !important;
  border-color:rgba(148,88,200,0.5) !important;
  box-shadow:0 0 60px rgba(148,88,200,0.2) !important;
}
body.pfau-theme .s2-banner {
  background:linear-gradient(160deg, #2d1060 0%, #4a1a90 55%, #2a0e58 100%) !important;
  border-bottom-color:rgba(180,110,255,0.4) !important;
}
body.pfau-theme .s2-banner::before {
  background:radial-gradient(ellipse at 50% 0%, rgba(180,110,255,0.25) 0%, transparent 65%) !important;
}
body.pfau-theme .s2-badge {
  background:linear-gradient(135deg,#a855f7,#7c3aed) !important;
  color:#fff !important;
}
body.pfau-theme .s2-banner__title {
  background:linear-gradient(90deg,#c06060,#b850a0,#8860b8,#5888c0);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text; text-shadow:none !important;
}
body.pfau-theme .s2-banner__sub { color:rgba(220,200,255,0.8) !important; }
body.pfau-theme .s2-body { background:rgba(250,244,255,0.98) !important; }

/* Auth-Pill + Profil-Menü — heller Surface braucht dunklen Text */
body.pfau-theme .hub-auth { border-left-color:rgba(148,88,200,0.22) !important; }
body.pfau-theme .hub-auth-btn { color:#281640 !important; }
body.pfau-theme .hub-auth-avatar { background:rgba(148,90,210,0.12) !important; }
body.pfau-theme .hub-auth-menu {
  background:rgba(252,247,255,0.98) !important;
  border-color:rgba(148,90,210,0.30) !important;
  box-shadow:0 8px 24px rgba(148,90,210,0.18) !important;
}
body.pfau-theme .hub-auth-menu > * + * { border-top-color:rgba(148,90,210,0.14) !important; }
body.pfau-theme .hub-auth-menu button,
body.pfau-theme .hub-auth-menu a { color:#281640 !important; }
body.pfau-theme .hub-auth-menu button:hover,
body.pfau-theme .hub-auth-menu a:hover { background:rgba(148,90,210,0.10) !important; }
body.pfau-theme .hub-auth-menu #hubAdminLink { color:#7848b8 !important; }
`;

  document.head.appendChild(s);
}

function _injectAtariThemeStyles() {
  if (document.getElementById('lw-atari-theme')) return;
  const s = document.createElement('style');
  s.id = 'lw-atari-theme';
  s.textContent = `
/* ════════════════════════════════════
   ATARI-1337 HACKER THEME
   ════════════════════════════════════ */

/* Floating Pseudocode — position:fixed direkt im body, z-index unter Modals */
@keyframes atariFloat {
  0%   { transform:translateY(0) translateX(0);                  opacity:0; }
  8%   { opacity:0.22; }
  85%  { opacity:0.13; }
  100% { transform:translateY(-100px) translateX(var(--drift,0px)); opacity:0; }
}
.atari-cf {
  position:fixed;
  pointer-events:none;
  z-index:20;
  font-family:'Courier New',monospace;
  color:#00ff41;
  white-space:nowrap;
  user-select:none;
  text-shadow:0 0 6px rgba(0,255,65,0.6);
  animation:atariFloat linear forwards;
}

/* Hintergrund — dunkles Grün-Schwarz, klar unterscheidbar von Cards */
body.atari-theme {
  --clr-bg:        #060f0a;
  --clr-surface:   #0e2018;
  --clr-surface2:  #142a1e;
  --clr-border:    rgba(0,255,65,0.28);
  --clr-gold:      #00ff41;
  --clr-gold-dim:  #009922;
  --clr-amber:     #00cc33;
  --clr-cream:     #c8f0d0;
  --clr-cream-dim: #72a880;
  background-color:#060f0a !important;
  background-image:none !important;
  color:#c8f0d0;
}

/* Subtile Scanlines */
body.atari-theme::before {
  content:'';
  position:fixed; inset:0;
  z-index:0;
  pointer-events:none;
  background:repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 3px,
    rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px
  );
}

/* Header */
body.atari-theme .hub-header::after {
  background:linear-gradient(to right, transparent, #00ff41, transparent) !important;
  box-shadow:0 0 12px rgba(0,255,65,0.4);
}
body.atari-theme .hub-header__rune { display:none; }
body.atari-theme h1 {
  color:#00ff41 !important;
  text-shadow:0 0 18px rgba(0,255,65,0.7), 0 0 42px rgba(0,255,65,0.25) !important;
  letter-spacing:0.12em;
}
body.atari-theme h2 {
  color:#00cc33 !important;
  text-shadow:0 0 10px rgba(0,255,65,0.3) !important;
}
body.atari-theme .hub-header__subtitle {
  color:#72a880 !important;
  font-family:'Courier New',monospace !important;
  font-size:0.78rem;
  letter-spacing:0.1em;
}

/* HUD */
body.atari-theme .hud-bar {
  background:rgba(4,10,6,0.97) !important;
  border-bottom:1px solid rgba(0,255,65,0.2) !important;
  box-shadow:0 2px 16px rgba(0,255,65,0.06) !important;
}
body.atari-theme .hud-coins__amount { color:#00ff41; text-shadow:0 0 8px rgba(0,255,65,0.5); }
body.atari-theme .hud-btn {
  background:rgba(6,15,10,0.9) !important;
  border:1px solid rgba(0,255,65,0.32) !important;
  color:#00ff41 !important;
}
body.atari-theme .hud-btn:hover {
  background:rgba(0,255,65,0.1) !important;
  box-shadow:0 0 12px rgba(0,255,65,0.2) !important;
}

/* Game Cards — deutlich heller als Hintergrund */
body.atari-theme .game-card {
  background:#0e2018 !important;
  border-color:rgba(0,255,65,0.28) !important;
  box-shadow:0 4px 20px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,255,65,0.06) !important;
}
body.atari-theme .game-card:hover:not(.game-card--locked) {
  border-color:rgba(0,255,65,0.6) !important;
  box-shadow:0 0 24px rgba(0,255,65,0.15), 0 6px 28px rgba(0,0,0,0.7) !important;
}
body.atari-theme .game-card__title {
  color:#00ff41 !important;
  font-family:'Courier New',monospace !important;
  font-size:0.76rem !important;
  letter-spacing:0.06em;
  text-shadow:0 0 8px rgba(0,255,65,0.35);
}
body.atari-theme .game-card__stage-label { color:#72a880 !important; }
body.atari-theme .game-card__points {
  color:#72a880 !important;
  font-family:'Courier New',monospace !important;
  font-size:0.7rem !important;
}
body.atari-theme .game-card__progress {
  background:rgba(0,255,65,0.08) !important;
  border:1px solid rgba(0,255,65,0.15) !important;
}
body.atari-theme .game-card__progress-fill {
  background:linear-gradient(to right, #012a0a, #00ff41) !important;
  box-shadow:0 0 8px rgba(0,255,65,0.4);
}
body.atari-theme .game-card__btn,
body.atari-theme .game-card__use-btn {
  background:rgba(0,255,65,0.06) !important;
  border:1px solid rgba(0,255,65,0.42) !important;
  color:#00ff41 !important;
  font-family:'Courier New',monospace !important;
  font-size:0.76rem !important;
  letter-spacing:0.06em;
  text-shadow:0 0 6px rgba(0,255,65,0.3);
}
body.atari-theme .game-card__btn:hover:not(:disabled),
body.atari-theme .game-card__use-btn:hover:not(:disabled) {
  background:rgba(0,255,65,0.12) !important;
  box-shadow:0 0 16px rgba(0,255,65,0.22) !important;
}

/* Gallery */
body.atari-theme .gallery-bar {
  background:#0e2018 !important;
  border-top:1px solid rgba(0,255,65,0.14) !important;
  border-bottom:1px solid rgba(0,255,65,0.14) !important;
}
body.atari-theme .gallery-slot {
  border-color:rgba(0,255,65,0.22) !important;
  background:#0e2018 !important;
}
body.atari-theme .gallery-slot:hover {
  border-color:rgba(0,255,65,0.55) !important;
  box-shadow:0 0 16px rgba(0,255,65,0.2) !important;
}

/* Creature-Modal — position:fixed bleibt unberührt */
body.atari-theme .modal-box {
  background:#0b1a12 !important;
  border:1px solid rgba(0,255,65,0.32) !important;
  box-shadow:0 0 50px rgba(0,255,65,0.14), 0 24px 80px rgba(0,0,0,0.97) !important;
}
body.atari-theme .modal-close {
  color:#00ff41 !important;
  border-color:rgba(0,255,65,0.32) !important;
  background:transparent !important;
}

/* Shop-Modal — position:fixed bleibt unberührt */
body.atari-theme .shop-modal-box {
  background:#0b1a12 !important;
  border:1px solid rgba(0,255,65,0.3) !important;
  box-shadow:0 0 50px rgba(0,255,65,0.12), 0 24px 80px rgba(0,0,0,0.97) !important;
}
body.atari-theme .shop-modal-title {
  color:#00ff41 !important;
  text-shadow:0 0 14px rgba(0,255,65,0.4) !important;
}
body.atari-theme .shop-coin-badge { color:#00ff41 !important; }
body.atari-theme .shop-list-item {
  background:#0e2018 !important;
  border-color:rgba(0,255,65,0.16) !important;
}
body.atari-theme .shop-list-item__name { color:#00ff41 !important; }
body.atari-theme .shop-list-item__desc { color:#72a880 !important; }
body.atari-theme .shop-list-item__price { color:#72a880 !important; }
body.atari-theme .shop-list-item__btn {
  background:rgba(0,255,65,0.06) !important;
  border:1px solid rgba(0,255,65,0.38) !important;
  color:#00ff41 !important;
}
body.atari-theme .shop-list-item__btn:hover:not(:disabled) {
  background:rgba(0,255,65,0.12) !important;
  box-shadow:0 0 12px rgba(0,255,65,0.18) !important;
}
body.atari-theme .shop-modal-close {
  color:#00ff41 !important;
  border-color:rgba(0,255,65,0.3) !important;
  background:transparent !important;
}

/* Hub-Sektion-Titel */
body.atari-theme .hub-section-title {
  color:#00cc33 !important;
  text-shadow:0 0 8px rgba(0,255,65,0.25) !important;
}

/* Badges */
body.atari-theme .epic-badge {
  background:linear-gradient(135deg, #0a2a12, #0f4020) !important;
  border-color:rgba(0,255,65,0.45) !important;
  color:#00ff41 !important;
  box-shadow:0 0 12px rgba(0,255,65,0.22) !important;
}
body.atari-theme .legendary-badge {
  background:linear-gradient(135deg, #0a2a18, #0a3a22) !important;
  border-color:rgba(0,255,65,0.55) !important;
  color:#00ff41 !important;
  box-shadow:0 0 16px rgba(0,255,65,0.3) !important;
}
body.atari-theme .rare-badge {
  background:linear-gradient(135deg, #081e0f, #0c3018) !important;
  border-color:rgba(0,255,65,0.40) !important;
  color:#00ff41 !important;
  box-shadow:0 0 10px rgba(0,255,65,0.18) !important;
}

/* Scrollbar */
body.atari-theme ::-webkit-scrollbar-track { background:#060f0a !important; }
body.atari-theme ::-webkit-scrollbar-thumb { background:#00a028 !important; border-color:#060f0a !important; }

/* ── Season 2 Modal ── */
body.atari-theme .s2-panel {
  background:#000 !important;
  border-color:#00ff41 !important;
  box-shadow:0 0 40px rgba(0,255,65,0.2) !important;
}
body.atari-theme .s2-banner {
  background:linear-gradient(160deg, #000 0%, #060f06 55%, #000 100%) !important;
  border-bottom-color:rgba(0,255,65,0.4) !important;
}
body.atari-theme .s2-banner::before {
  background:radial-gradient(ellipse at 50% 0%, rgba(0,255,65,0.1) 0%, transparent 65%) !important;
}
body.atari-theme .s2-badge {
  background:#00ff41 !important;
  color:#000 !important;
}
body.atari-theme .s2-banner__title {
  color:#00ff41 !important;
  text-shadow:0 0 30px rgba(0,255,65,0.6), 0 0 60px rgba(0,255,65,0.2) !important;
}
body.atari-theme .s2-banner__sub { color:rgba(0,200,50,0.7) !important; font-family:'Courier New',monospace !important; }
body.atari-theme .s2-body { background:#000 !important; }

/* Auth-Pill + Profil-Menü — Terminal-Grün auf Schwarz */
body.atari-theme .hub-auth { border-left-color:rgba(0,255,65,0.28) !important; }
body.atari-theme .hub-auth-btn { color:#00ff41 !important; font-family:'Courier New',monospace !important; }
body.atari-theme .hub-auth-avatar { background:rgba(0,255,65,0.08) !important; }
body.atari-theme .hub-auth-menu {
  background:#050f08 !important;
  border-color:#00ff41 !important;
  box-shadow:0 0 24px rgba(0,255,65,0.28) !important;
}
body.atari-theme .hub-auth-menu > * + * { border-top-color:rgba(0,255,65,0.15) !important; }
body.atari-theme .hub-auth-menu button,
body.atari-theme .hub-auth-menu a { color:#00ff41 !important; font-family:'Courier New',monospace !important; }
body.atari-theme .hub-auth-menu button:hover,
body.atari-theme .hub-auth-menu a:hover { background:rgba(0,255,65,0.10) !important; }
body.atari-theme .hub-auth-menu #hubAdminLink { color:#7dff9b !important; }
`;

  document.head.appendChild(s);
}

/* ─────────────────────────────────────────────────
   16. CHINESISCHER DRACHE — GOLDENE LATERNEN THEME
   Aktiv wenn chinDrache-Kreatur auf max. Wachstum
   ───────────────────────────────────────────────── */
let _chinDracheThemeActive  = false;
let _chinDracheLanternTimer = null;

function _activateChinDracheTheme() {
  if (_chinDracheThemeActive) return;
  _chinDracheThemeActive = true;
  _injectChinDracheThemeStyles();
  document.body.classList.add('chindrache-theme');
  _startLanterns();
}

function _deactivateChinDracheTheme() {
  if (!_chinDracheThemeActive) return;
  _chinDracheThemeActive = false;
  document.body.classList.remove('chindrache-theme');
  _stopLanterns();
}

const CHINDRACHE_LANTERN_INTERVAL_MS = 2400;

function _startLanterns() {
  if (_chinDracheLanternTimer) return;
  _spawnLantern();
  _chinDracheLanternTimer = setInterval(_spawnLantern, CHINDRACHE_LANTERN_INTERVAL_MS);
}

function _stopLanterns() {
  if (_chinDracheLanternTimer) { clearInterval(_chinDracheLanternTimer); _chinDracheLanternTimer = null; }
  document.querySelectorAll('.lw-lantern, .lw-ink-stroke').forEach(el => el.remove());
}

const _LANTERN_PALETTE = [
  { hue: '#d4af37', glow: '#f8d860' },
  { hue: '#d4af37', glow: '#f8d860' },
  { hue: '#d4af37', glow: '#ffd700' },
  { hue: '#d4af37', glow: '#f8d860' },
  { hue: '#c03020', glow: '#f06040' },
];

function _spawnLantern() {
  const { hue, glow } = _LANTERN_PALETTE[Math.floor(Math.random() * _LANTERN_PALETTE.length)];
  const scale = 0.65 + Math.random() * 1.1;
  const bW    = Math.round(16 * scale);
  const bH    = Math.round(25 * scale);
  const x     = 3 + Math.random() * 92;
  const dur   = 12 + Math.random() * 10;

  const wrap = document.createElement('div');
  wrap.className = 'lw-lantern';
  wrap.style.cssText = `left:${x}vw;bottom:-70px;animation-duration:${dur}s;`;

  const str = document.createElement('div');
  str.className = 'lw-lantern__string';
  str.style.height = `${Math.round(10 * scale)}px`;

  const cap = document.createElement('div');
  cap.className = 'lw-lantern__cap';
  cap.style.cssText = `background:${hue};width:${Math.round(bW * 0.68)}px;height:${Math.round(4 * scale)}px;box-shadow:0 0 5px ${glow};`;

  const body = document.createElement('div');
  body.className = 'lw-lantern__body';
  body.style.cssText = `width:${bW}px;height:${bH}px;background:radial-gradient(ellipse at 38% 30%,${glow}cc,${hue}bb 60%,${hue}88);box-shadow:0 0 ${Math.round(14*scale)}px ${Math.round(6*scale)}px ${glow}66;`;

  const fringe = document.createElement('div');
  fringe.className = 'lw-lantern__fringe';
  for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
    const s = document.createElement('span');
    s.style.cssText = `background:${hue};height:${Math.round((5 + Math.random() * 8) * scale)}px;box-shadow:0 0 3px ${glow}88;`;
    fringe.appendChild(s);
  }

  wrap.append(str, cap, body, fringe);
  document.body.appendChild(wrap);
  wrap.addEventListener('animationend', () => wrap.remove(), { once: true });

  if (Math.random() < 0.45) _spawnInkStroke();
}

function _spawnInkStroke() {
  const el  = document.createElement('div');
  el.className = 'lw-ink-stroke';
  const w   = 60 + Math.random() * 160;
  const ang = -45 + Math.random() * 90;
  const dur = 5 + Math.random() * 6;
  el.style.cssText = `left:${Math.random() * (window.innerWidth - w)}px;top:${10 + Math.random() * (window.innerHeight - 60)}px;width:${w}px;height:${2 + Math.random() * 3}px;--a:${ang}deg;animation-duration:${dur}s;`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function _injectChinDracheThemeStyles() {
  if (document.getElementById('lw-chindrache-styles')) return;
  const s = document.createElement('style');
  s.id = 'lw-chindrache-styles';
  s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;500;600;700;900&display=swap');

/* ════════════════════════════════════════════════
   CHINESISCHER DRACHE — GOLDENE LATERNEN THEME
   ════════════════════════════════════════════════ */

/* ── Laternen-Partikel ── */
.lw-lantern {
  position: fixed; pointer-events: none;
  display: flex; flex-direction: column; align-items: center;
  z-index: 9000; animation: lwLanternRise linear forwards;
}
@keyframes lwLanternRise {
  0%   { transform: translateY(0) rotate(0deg);     opacity: 0; }
  5%   { opacity: 0.92; }
  35%  { transform: translateY(-38vh) rotate(3deg); }
  65%  { transform: translateY(-76vh) rotate(-3deg); }
  97%  { opacity: 0.55; }
  100% { transform: translateY(-140vh) rotate(1deg); opacity: 0; }
}
.lw-lantern__string { width: 1px; background: rgba(212,175,55,0.55); }
.lw-lantern__cap    { border-radius: 3px 3px 0 0; }
.lw-lantern__body   { border-radius: 42% 42% 38% 38% / 50% 50% 40% 40%; position: relative; overflow: hidden; }
.lw-lantern__body::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(155deg, rgba(255,255,255,0.22), transparent 50%);
  border-radius: inherit;
}
.lw-lantern__fringe      { display: flex; justify-content: center; gap: 2px; margin-top: 2px; }
.lw-lantern__fringe span { width: 1.5px; border-radius: 1px; }

.lw-ink-stroke {
  position: fixed; pointer-events: none; z-index: 9000; border-radius: 60%;
  background: linear-gradient(var(--a), transparent, rgba(212,175,55,0.2) 35%, rgba(212,175,55,0.25) 50%, rgba(212,175,55,0.2) 65%, transparent);
  animation: lwInkFade ease-in-out forwards;
}
@keyframes lwInkFade {
  0%, 100% { opacity: 0; transform: scaleX(0.2) rotate(var(--a)); }
  35%      { opacity: 1; transform: scaleX(1)   rotate(var(--a)); }
  65%      { opacity: 0.6; }
}

/* ── CSS-Variablen überschreiben (deckt alle inline-styles + automatische Elemente ab) ── */
body.chindrache-theme {
  --clr-bg:        #060f1e;
  --clr-surface:   #0b1634;
  --clr-surface2:  #0f1e42;
  --clr-border:    rgba(212,175,55,0.3);
  --clr-gold:      #d4af37;
  --clr-gold-dim:  #9a7a1a;
  --clr-amber:     #c49a28;
  --clr-cream:     #f0e8d0;
  --clr-cream-dim: rgba(212,175,55,0.6);
  background-color: #0d1f3c !important;
  background-image: radial-gradient(ellipse at 50% 110%, #1f3f6f, #0d1f3c 50%, #060f1e) !important;
}

/* ── Schriftart ── */
body.chindrache-theme {
  --font-display: 'Zen Old Mincho', serif;
}
body.chindrache-theme h1,
body.chindrache-theme h2,
body.chindrache-theme .hub-section-title,
body.chindrache-theme .game-card__title,
body.chindrache-theme .book-modal__title,
body.chindrache-theme .shop-modal-title {
  font-family: 'Zen Old Mincho', serif !important;
  letter-spacing: 0.08em !important;
}

/* ── Hub Header ── */
body.chindrache-theme .hub-header__title h1 {
  color: #d4af37 !important;
  text-shadow: 0 0 30px rgba(212,175,55,0.55), 0 2px 4px rgba(0,0,0,0.9) !important;
}
body.chindrache-theme .hub-header__subtitle {
  color: rgba(212,175,55,0.6) !important;
  font-family: 'Zen Old Mincho', serif !important;
  letter-spacing: 0.12em !important;
}
body.chindrache-theme .hub-header::after {
  background: linear-gradient(to right, transparent, #d4af37, transparent) !important;
}
body.chindrache-theme .hub-section-title {
  color: rgba(212,175,55,0.7) !important;
}

/* ── Runen: 🌟 → 龍 ── */
body.chindrache-theme .hub-header__rune {
  font-size: 0 !important;
}
body.chindrache-theme .hub-header__rune::after {
  content: '龍';
  font-size: 2rem;
  font-family: 'Zen Old Mincho', serif;
  color: #d4af37;
  text-shadow: 0 0 16px rgba(212,175,55,0.7), 0 0 40px rgba(212,175,55,0.3);
  animation: none;
}

/* ── HUD-Leiste ── */
body.chindrache-theme .hud-bar {
  background: rgba(11,22,52,0.92) !important;
  border-color: rgba(212,175,55,0.5) !important;
  box-shadow: 0 0 18px rgba(212,175,55,0.2), 0 4px 16px rgba(0,0,0,0.6) !important;
}
body.chindrache-theme .hud-btn:hover {
  background: rgba(212,175,55,0.12) !important;
}
body.chindrache-theme .hud-coins {
  border-left-color: rgba(212,175,55,0.25) !important;
}
body.chindrache-theme .hud-coins__amount {
  color: #f0d878 !important;
}
body.chindrache-theme .theme-cycle-btn {
  background: rgba(11,22,52,0.92) !important;
  border-color: rgba(212,175,55,0.4) !important;
  color: #d4af37 !important;
}
body.chindrache-theme .theme-cycle-btn:hover {
  background: rgba(20,40,90,0.95) !important;
  color: #f0d878 !important;
}

/* ── Gallery Bar ── */
body.chindrache-theme .gallery-bar {
  background: rgba(11,22,52,0.78) !important;
  border-color: rgba(212,175,55,0.35) !important;
}
body.chindrache-theme .gallery-walker {
  filter: drop-shadow(0 0 8px rgba(212,175,55,0.5)) !important;
}
body.chindrache-theme .gallery-walker:hover {
  filter: drop-shadow(0 0 16px rgba(212,175,55,0.85)) !important;
}

/* ── Spielkarten ── */
body.chindrache-theme .game-card {
  background: rgba(11,22,52,0.78) !important;
  border-color: rgba(212,175,55,0.35) !important;
  backdrop-filter: blur(4px) !important;
}
body.chindrache-theme .game-card::before {
  background: linear-gradient(135deg, rgba(212,175,55,0.04) 0%, transparent 60%) !important;
}
body.chindrache-theme .game-card:hover {
  border-color: rgba(212,175,55,0.75) !important;
  box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 28px rgba(212,175,55,0.2) !important;
}
body.chindrache-theme .game-card--locked {
  background: rgba(6,12,28,0.7) !important;
  border-color: rgba(212,175,55,0.15) !important;
}
body.chindrache-theme .game-card__title {
  color: #f0d878 !important;
  text-shadow: 0 0 10px rgba(212,175,55,0.35) !important;
}
body.chindrache-theme .game-card__points {
  background: rgba(212,175,55,0.08) !important;
  border-color: rgba(212,175,55,0.25) !important;
  color: rgba(240,220,140,0.8) !important;
}
body.chindrache-theme .game-card__points strong {
  color: #f0d878 !important;
}

/* ── Spielen-Button (Königsblau-Pille) ── */
body.chindrache-theme .game-card__btn {
  background: linear-gradient(135deg, #0c1e6b, #1840c0) !important;
  border: 1.5px solid #c9a830 !important;
  border-radius: 999px !important;
  color: #f0d878 !important;
  box-shadow: 0 0 14px rgba(20,55,200,0.45), 0 2px 5px rgba(0,0,0,0.5) !important;
}
body.chindrache-theme .game-card__btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #1028a0, #2050e0) !important;
  box-shadow: 0 0 22px rgba(30,70,220,0.6), 0 0 8px rgba(212,175,55,0.3) !important;
}
body.chindrache-theme .game-card__use-btn {
  background: rgba(212,175,55,0.08) !important;
  border: 1.5px solid rgba(212,175,55,0.45) !important;
  border-radius: 999px !important;
  color: #d4af37 !important;
}
body.chindrache-theme .game-card__use-btn:hover:not(:disabled) {
  background: rgba(212,175,55,0.18) !important;
  border-color: #d4af37 !important;
}

/* ── Shop Modal ── */
body.chindrache-theme .shop-modal-overlay {
  background: rgba(4,10,24,0.88) !important;
}
body.chindrache-theme .shop-modal-box {
  background: linear-gradient(180deg, #0c1e3e, #07101e) !important;
  border-color: rgba(212,175,55,0.4) !important;
}
body.chindrache-theme .shop-modal-title {
  color: #f0d878 !important;
  text-shadow: 0 0 14px rgba(212,175,55,0.4) !important;
}
body.chindrache-theme .shop-modal-close {
  color: rgba(212,175,55,0.5) !important;
}
body.chindrache-theme .shop-modal-close:hover {
  color: #d4af37 !important;
}
body.chindrache-theme .shop-coin-badge {
  background: rgba(212,175,55,0.12) !important;
  border-color: rgba(212,175,55,0.4) !important;
  color: #f0d878 !important;
}
body.chindrache-theme .shop-tabs {
  border-bottom-color: rgba(212,175,55,0.2) !important;
}
body.chindrache-theme .shop-tab {
  color: rgba(212,175,55,0.55) !important;
}
body.chindrache-theme .shop-tab:hover {
  background: rgba(212,175,55,0.07) !important;
  color: #d4af37 !important;
}
body.chindrache-theme .shop-tab--active {
  border-bottom-color: #d4af37 !important;
  color: #f0d878 !important;
}
body.chindrache-theme .shop-list-item {
  border-bottom-color: rgba(212,175,55,0.12) !important;
}
body.chindrache-theme .shop-list-item:hover {
  background: rgba(212,175,55,0.06) !important;
}
body.chindrache-theme .shop-list-item__name {
  color: #f0d878 !important;
}
body.chindrache-theme .shop-list-item__desc {
  color: rgba(212,175,55,0.5) !important;
}
body.chindrache-theme .shop-list-item__price {
  border-color: rgba(212,175,55,0.3) !important;
  color: #d4af37 !important;
}
body.chindrache-theme .shop-list-item__btn {
  background: linear-gradient(135deg, #b8861e, #d4af37) !important;
  color: #0b1428 !important;
  border-radius: 999px !important;
  box-shadow: 0 2px 8px rgba(212,175,55,0.3) !important;
}
body.chindrache-theme .shop-list-item__btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #d4af37, #f0d060) !important;
  box-shadow: 0 0 16px rgba(212,175,55,0.5) !important;
}
body.chindrache-theme .shop-list-item__btn:disabled {
  background: rgba(11,22,52,0.7) !important;
  color: rgba(212,175,55,0.3) !important;
  border: 1px solid rgba(212,175,55,0.15) !important;
}

/* ── Modals (Galerie, Kreatur-Detail) ── */
body.chindrache-theme .modal-overlay {
  background: rgba(4,10,24,0.88) !important;
}
body.chindrache-theme .modal-box {
  background: linear-gradient(180deg, #0c1e3e, #07101e) !important;
  border-color: rgba(212,175,55,0.4) !important;
}
body.chindrache-theme .modal-close {
  color: rgba(212,175,55,0.5) !important;
}
body.chindrache-theme .modal-close:hover {
  color: #d4af37 !important;
}

/* ── Wachstumsbalken (Spielkarten + Nester) ── */
body.chindrache-theme .game-card__progress {
  background: rgba(6,15,30,0.8) !important;
  border-color: rgba(212,175,55,0.2) !important;
}
body.chindrache-theme .game-card__progress-fill {
  background: linear-gradient(to right, #0c1e6b, #1840c0) !important;
  box-shadow: 0 0 6px rgba(24,64,192,0.6) !important;
}
body.chindrache-theme .egg-progress-bar {
  background: rgba(6,15,30,0.8) !important;
  border-color: rgba(212,175,55,0.2) !important;
}
body.chindrache-theme .egg-progress-fill {
  background: linear-gradient(to right, #0c1e6b, #1840c0) !important;
}

/* ── Buch der Monster Modal ── */
body.chindrache-theme .book-modal__title {
  color: #f0d878 !important;
  text-shadow: 0 0 14px rgba(212,175,55,0.4) !important;
}
body.chindrache-theme .book-modal__count {
  color: rgba(212,175,55,0.55) !important;
}
body.chindrache-theme .book-slot {
  background: rgba(11,22,52,0.8) !important;
  border-color: rgba(212,175,55,0.25) !important;
}
body.chindrache-theme .book-slot--seen:hover {
  border-color: rgba(212,175,55,0.75) !important;
  box-shadow: 0 0 14px rgba(212,175,55,0.3) !important;
}
body.chindrache-theme .book-divider {
  background: linear-gradient(to right, transparent, rgba(212,175,55,0.4), transparent) !important;
}
body.chindrache-theme .book-detail__backup-btn {
  background: rgba(12,30,107,0.35) !important;
  border-color: rgba(212,175,55,0.4) !important;
  color: #d4af37 !important;
}
body.chindrache-theme .book-detail__backup-btn:hover {
  background: rgba(12,30,107,0.6) !important;
}

/* ── Trank-Banner ── */
body.chindrache-theme .trank-banner {
  background: linear-gradient(135deg, #0b1634 0%, #0f1e42 100%) !important;
  border-top-color: rgba(212,175,55,0.5) !important;
  box-shadow: 0 -4px 20px rgba(212,175,55,0.15) !important;
}

/* ── Sealed Egg Modal ── */
body.chindrache-theme .sealed-egg-modal-box {
  background: linear-gradient(180deg, #0c1e3e, #07101e) !important;
  border-color: rgba(212,175,55,0.4) !important;
}

/* ── Season 2 Modal ── */
body.chindrache-theme .s2-panel {
  background: linear-gradient(180deg, #0c1e3e, #07101e) !important;
  border-color: rgba(212,175,55,0.5) !important;
  box-shadow: 0 0 60px rgba(212,175,55,0.15) !important;
}
body.chindrache-theme .s2-banner {
  background: linear-gradient(160deg, #060f1e 0%, #0d1f3c 55%, #060f1e 100%) !important;
  border-bottom-color: rgba(212,175,55,0.4) !important;
}
body.chindrache-theme .s2-banner::before {
  background: radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.15) 0%, transparent 65%) !important;
}
body.chindrache-theme .s2-badge {
  background: linear-gradient(135deg, #b8861e, #d4af37) !important;
  color: #060f1e !important;
}
body.chindrache-theme .s2-banner__title {
  color: #d4af37 !important;
  text-shadow: 0 0 40px rgba(212,175,55,0.5) !important;
}
body.chindrache-theme .s2-banner__sub { color: rgba(212,175,55,0.6) !important; }
body.chindrache-theme .s2-body { background: linear-gradient(180deg, #0c1e3e, #07101e) !important; }

/* Auth-Pill + Profil-Menü — Gold auf Nachtblau */
body.chindrache-theme .hub-auth { border-left-color: rgba(212,175,55,0.28) !important; }
body.chindrache-theme .hub-auth-btn { color: #d4af37 !important; }
body.chindrache-theme .hub-auth-avatar { background: rgba(212,175,55,0.10) !important; }
body.chindrache-theme .hub-auth-menu {
  background: linear-gradient(180deg, #0c1e3e, #07101e) !important;
  border-color: rgba(212,175,55,0.45) !important;
  box-shadow: 0 0 24px rgba(212,175,55,0.22) !important;
}
body.chindrache-theme .hub-auth-menu > * + * { border-top-color: rgba(212,175,55,0.18) !important; }
body.chindrache-theme .hub-auth-menu button,
body.chindrache-theme .hub-auth-menu a { color: #f0d97a !important; }
body.chindrache-theme .hub-auth-menu button:hover,
body.chindrache-theme .hub-auth-menu a:hover { background: rgba(212,175,55,0.12) !important; }
body.chindrache-theme .hub-auth-menu #hubAdminLink { color: #ffd75a !important; }
`;
  document.head.appendChild(s);
}

/* ─────────────────────────────────────────────────
   17. SCHNABELTIER — BIOLUMINESZENZ THEME
   Aktiv wenn schnabeltier-Kreatur auf max. Wachstum
   ───────────────────────────────────────────────── */
let _schnabeltierThemeActive = false;
let _schnabeltierBubbleTimer = null;

function _activateSchnabeltierTheme() {
  if (_schnabeltierThemeActive) return;
  _schnabeltierThemeActive = true;
  _injectSchnabeltierThemeStyles();
  document.body.classList.add('schnabeltier-theme');
  _startBubbles();
}

function _deactivateSchnabeltierTheme() {
  if (!_schnabeltierThemeActive) return;
  _schnabeltierThemeActive = false;
  document.body.classList.remove('schnabeltier-theme');
  _stopBubbles();
}

const SCHNABELTIER_BUBBLE_INTERVAL_MS = 900;

function _startBubbles() {
  if (_schnabeltierBubbleTimer) return;
  for (let i = 0; i < 8; i++) setTimeout(_spawnBubble, i * 400);
  _schnabeltierBubbleTimer = setInterval(_spawnBubble, SCHNABELTIER_BUBBLE_INTERVAL_MS);
}

function _stopBubbles() {
  if (_schnabeltierBubbleTimer) { clearInterval(_schnabeltierBubbleTimer); _schnabeltierBubbleTimer = null; }
  document.querySelectorAll('.lw-bubble, .lw-bubble-pop').forEach(el => el.remove());
}

function _spawnBubble() {
  const size  = 5 + Math.random() * 18;
  const x     = 3 + Math.random() * 92;
  const sway  = (Math.random() < 0.5 ? 1 : -1) * (8 + Math.random() * 28);
  const dur   = 6 + Math.random() * 8;
  const rise  = -(window.innerHeight + size + 40);

  const b = document.createElement('div');
  b.className = 'lw-bubble';
  b.style.cssText = `width:${size}px;height:${size}px;left:${x}vw;bottom:-${size + 6}px;--sway:${sway}px;--rise:${rise}px;animation-duration:${dur}s;`;
  document.body.appendChild(b);

  b.addEventListener('animationend', () => {
    const rect = b.getBoundingClientRect();
    const pop  = document.createElement('div');
    pop.className = 'lw-bubble-pop';
    pop.style.cssText = `width:${size}px;height:${size}px;left:${rect.left}px;top:${rect.top}px;`;
    document.body.appendChild(pop);
    pop.addEventListener('animationend', () => pop.remove(), { once: true });
    b.remove();
  }, { once: true });
}

function _injectSchnabeltierThemeStyles() {
  if (document.getElementById('lw-schnabeltier-styles')) return;
  const s = document.createElement('style');
  s.id = 'lw-schnabeltier-styles';
  s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&display=swap');

/* ════════════════════════════════════
   SCHNABELTIER — BIOLUMINESZENZ THEME
   ════════════════════════════════════ */

/* ── Blasen-Partikel ── */
.lw-bubble {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9000;
  border: 1px solid rgba(125,249,255,0.45);
  background: radial-gradient(circle at 38% 35%, rgba(125,249,255,0.13), rgba(0,207,255,0.04));
  box-shadow: 0 0 9px rgba(125,249,255,0.28), inset 0 0 5px rgba(125,249,255,0.08);
  animation: lwBubbleRise linear forwards;
}
@keyframes lwBubbleRise {
  0%   { transform: translateY(0) translateX(0);                           opacity: 0; }
  5%   { opacity: 0.85; }
  88%  { opacity: 0.65; }
  96%  { transform: translateY(var(--rise)) translateX(var(--sway)); opacity: 0; }
  100% { transform: translateY(var(--rise)) translateX(var(--sway)); opacity: 0; }
}
.lw-bubble-pop {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9000;
  border: 1px solid rgba(125,249,255,0.5);
  animation: lwBubblePop 0.5s ease-out forwards;
}
@keyframes lwBubblePop {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(4); opacity: 0; }
}

/* ── CSS-Variablen (deckt alle automatischen Elemente ab) ── */
body.schnabeltier-theme {
  --clr-bg:        #060f08;
  --clr-surface:   #0d1a10;
  --clr-surface2:  #0b1f12;
  --clr-border:    rgba(125,249,255,0.22);
  --clr-gold:      #7df9ff;
  --clr-gold-dim:  #3ac8d4;
  --clr-amber:     #40d0b8;
  --clr-cream:     #b8f8ff;
  --clr-cream-dim: rgba(125,249,255,0.6);
  --clr-green:     #7df9ff;
  background-color: #060f08 !important;
  background-image: radial-gradient(ellipse at 50% 110%, #0d3020, #060f08 50%, #020806) !important;
  color: #b8f8ff !important;
}

/* ── Schriftart ── */
body.schnabeltier-theme {
  --font-display: 'Josefin Sans', sans-serif;
}
body.schnabeltier-theme h1,
body.schnabeltier-theme h2,
body.schnabeltier-theme .hub-section-title,
body.schnabeltier-theme .game-card__title,
body.schnabeltier-theme .book-modal__title,
body.schnabeltier-theme .shop-modal-title {
  font-family: 'Josefin Sans', sans-serif !important;
  letter-spacing: 0.06em !important;
}

/* ── Hub Header ── */
body.schnabeltier-theme .hub-header__title h1 {
  color: #7df9ff !important;
  text-shadow: 0 0 30px rgba(125,249,255,0.6), 0 0 60px rgba(125,249,255,0.25), 0 2px 4px rgba(0,0,0,0.9) !important;
}
body.schnabeltier-theme .hub-header__subtitle {
  color: rgba(125,249,255,0.6) !important;
}
body.schnabeltier-theme .hub-header::after {
  background: linear-gradient(to right, transparent, #7df9ff, transparent) !important;
}
body.schnabeltier-theme .hub-section-title {
  color: rgba(125,249,255,0.7) !important;
}
body.schnabeltier-theme h2 {
  color: rgba(125,249,255,0.8) !important;
}
body.schnabeltier-theme .hub-header__rune {
  font-size: 0 !important;
}
body.schnabeltier-theme .hub-header__rune::after {
  content: '🫧';
  font-size: 2rem;
  animation: none;
}

/* ── HUD-Leiste ── */
body.schnabeltier-theme .hud-bar {
  background: rgba(6,20,12,0.92) !important;
  border-color: rgba(125,249,255,0.35) !important;
  box-shadow: 0 0 18px rgba(125,249,255,0.12), 0 4px 16px rgba(0,0,0,0.6) !important;
}
body.schnabeltier-theme .hud-btn {
  background: rgba(6,20,12,0.88) !important;
  border: 1px solid rgba(125,249,255,0.25) !important;
  color: rgba(125,249,255,0.8) !important;
}
body.schnabeltier-theme .hud-btn:hover {
  background: rgba(125,249,255,0.08) !important;
  box-shadow: 0 0 12px rgba(125,249,255,0.2) !important;
}
body.schnabeltier-theme .hud-coins {
  border-left-color: rgba(125,249,255,0.25) !important;
}
body.schnabeltier-theme .hud-coins__amount {
  color: #7df9ff !important;
}
body.schnabeltier-theme .theme-cycle-btn {
  background: rgba(6,20,12,0.92) !important;
  border-color: rgba(125,249,255,0.4) !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .theme-cycle-btn:hover {
  background: rgba(0,40,25,0.95) !important;
  color: #b8f8ff !important;
}

/* ── Gallery Bar ── */
body.schnabeltier-theme .gallery-bar {
  background: rgba(6,20,12,0.78) !important;
  border-color: rgba(125,249,255,0.28) !important;
}
body.schnabeltier-theme .gallery-slot {
  border-color: rgba(125,249,255,0.2) !important;
  background: rgba(8,22,12,0.9) !important;
}
body.schnabeltier-theme .gallery-slot:hover {
  border-color: rgba(125,249,255,0.55) !important;
  box-shadow: 0 0 16px rgba(125,249,255,0.2) !important;
}
body.schnabeltier-theme .gallery-walker {
  filter: drop-shadow(0 0 8px rgba(125,249,255,0.5)) !important;
}
body.schnabeltier-theme .gallery-walker:hover {
  filter: drop-shadow(0 0 16px rgba(125,249,255,0.85)) !important;
}

/* ── Spielkarten ── */
body.schnabeltier-theme .game-card {
  background: rgba(8,22,12,0.82) !important;
  border-color: rgba(125,249,255,0.28) !important;
  backdrop-filter: blur(4px) !important;
}
body.schnabeltier-theme .game-card::before {
  background: linear-gradient(135deg, rgba(125,249,255,0.04) 0%, transparent 60%) !important;
}
body.schnabeltier-theme .game-card:hover:not(.game-card--locked) {
  border-color: rgba(125,249,255,0.75) !important;
  box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 28px rgba(125,249,255,0.18) !important;
}
body.schnabeltier-theme .game-card--locked {
  background: rgba(3,10,6,0.7) !important;
  border-color: rgba(125,249,255,0.10) !important;
}
body.schnabeltier-theme .game-card__title {
  color: #7df9ff !important;
  text-shadow: 0 0 10px rgba(125,249,255,0.35) !important;
}
body.schnabeltier-theme .game-card__stage-label {
  color: rgba(125,249,255,0.6) !important;
}
body.schnabeltier-theme .game-card__points {
  background: rgba(125,249,255,0.06) !important;
  border-color: rgba(125,249,255,0.2) !important;
  color: rgba(125,249,255,0.7) !important;
}
body.schnabeltier-theme .game-card__points strong {
  color: #7df9ff !important;
}
body.schnabeltier-theme .game-card__btn {
  background: linear-gradient(135deg, #042a18, #0a5030) !important;
  border: 1.5px solid #7df9ff !important;
  border-radius: 999px !important;
  color: #7df9ff !important;
  box-shadow: 0 0 14px rgba(125,249,255,0.3), 0 2px 5px rgba(0,0,0,0.5) !important;
}
body.schnabeltier-theme .game-card__btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0a5030, #12704a) !important;
  box-shadow: 0 0 22px rgba(125,249,255,0.5), 0 0 8px rgba(125,249,255,0.3) !important;
}
body.schnabeltier-theme .game-card__use-btn {
  background: rgba(125,249,255,0.06) !important;
  border: 1.5px solid rgba(125,249,255,0.4) !important;
  border-radius: 999px !important;
  color: rgba(125,249,255,0.85) !important;
}
body.schnabeltier-theme .game-card__use-btn:hover:not(:disabled) {
  background: rgba(125,249,255,0.14) !important;
  border-color: #7df9ff !important;
}
body.schnabeltier-theme .game-card__release {
  color: rgba(125,249,255,0.65) !important;
}
body.schnabeltier-theme .game-card__release:hover {
  color: #7df9ff !important;
  background: rgba(125,249,255,0.1) !important;
}

/* ── Wachstumsbalken ── */
body.schnabeltier-theme .game-card__progress {
  background: rgba(3,12,6,0.8) !important;
  border-color: rgba(125,249,255,0.15) !important;
}
body.schnabeltier-theme .game-card__progress-fill {
  background: linear-gradient(to right, #042a18, #7df9ff) !important;
  box-shadow: 0 0 6px rgba(125,249,255,0.5) !important;
}
body.schnabeltier-theme .egg-progress-bar {
  background: rgba(3,12,6,0.8) !important;
  border-color: rgba(125,249,255,0.15) !important;
}
body.schnabeltier-theme .egg-progress-fill {
  background: linear-gradient(to right, #042a18, #7df9ff) !important;
}

/* ── Shop Modal ── */
body.schnabeltier-theme .shop-modal-overlay {
  background: rgba(2,8,4,0.88) !important;
}
body.schnabeltier-theme .shop-modal-box {
  background: linear-gradient(180deg, #0a1e10, #04100a) !important;
  border-color: rgba(125,249,255,0.35) !important;
}
body.schnabeltier-theme .shop-modal-title {
  color: #7df9ff !important;
  text-shadow: 0 0 14px rgba(125,249,255,0.4) !important;
}
body.schnabeltier-theme .shop-modal-close {
  color: rgba(125,249,255,0.5) !important;
}
body.schnabeltier-theme .shop-modal-close:hover {
  color: #7df9ff !important;
}
body.schnabeltier-theme .shop-coin-badge {
  background: rgba(125,249,255,0.10) !important;
  border-color: rgba(125,249,255,0.35) !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .shop-tabs {
  border-bottom-color: rgba(125,249,255,0.2) !important;
}
body.schnabeltier-theme .shop-tab {
  color: rgba(125,249,255,0.5) !important;
}
body.schnabeltier-theme .shop-tab:hover {
  background: rgba(125,249,255,0.06) !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .shop-tab--active {
  border-bottom-color: #7df9ff !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .shop-list-item {
  border-bottom-color: rgba(125,249,255,0.10) !important;
}
body.schnabeltier-theme .shop-list-item:hover {
  background: rgba(125,249,255,0.05) !important;
}
body.schnabeltier-theme .shop-list-item__name {
  color: #b8f8ff !important;
}
body.schnabeltier-theme .shop-list-item__desc {
  color: rgba(125,249,255,0.5) !important;
}
body.schnabeltier-theme .shop-list-item__price {
  border-color: rgba(125,249,255,0.28) !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .shop-list-item__btn {
  background: linear-gradient(135deg, #042a18, #0a6040) !important;
  color: #7df9ff !important;
  border-radius: 999px !important;
  box-shadow: 0 2px 8px rgba(125,249,255,0.2) !important;
}
body.schnabeltier-theme .shop-list-item__btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0a6040, #10804c) !important;
  box-shadow: 0 0 16px rgba(125,249,255,0.4) !important;
}
body.schnabeltier-theme .shop-list-item__btn:disabled {
  background: rgba(8,22,12,0.7) !important;
  color: rgba(125,249,255,0.25) !important;
  border: 1px solid rgba(125,249,255,0.12) !important;
}

/* ── Modals (Galerie, Kreatur-Detail) ── */
body.schnabeltier-theme .modal-overlay {
  background: rgba(2,8,4,0.88) !important;
}
body.schnabeltier-theme .modal-box {
  background: linear-gradient(180deg, #0a1e10, #04100a) !important;
  border-color: rgba(125,249,255,0.35) !important;
  box-shadow: 0 0 50px rgba(125,249,255,0.1), 0 24px 80px rgba(0,0,0,0.4) !important;
}
body.schnabeltier-theme .modal-close {
  color: rgba(125,249,255,0.5) !important;
  border-color: rgba(125,249,255,0.25) !important;
  background: transparent !important;
}
body.schnabeltier-theme .modal-close:hover {
  color: #7df9ff !important;
}

/* ── Buch der Monster ── */
body.schnabeltier-theme .book-modal__title {
  color: #7df9ff !important;
  text-shadow: 0 0 14px rgba(125,249,255,0.4) !important;
}
body.schnabeltier-theme .book-modal__count {
  color: rgba(125,249,255,0.55) !important;
}
body.schnabeltier-theme .book-slot {
  background: rgba(8,22,12,0.8) !important;
  border-color: rgba(125,249,255,0.2) !important;
}
body.schnabeltier-theme .book-slot--seen:hover {
  border-color: rgba(125,249,255,0.75) !important;
  box-shadow: 0 0 14px rgba(125,249,255,0.25) !important;
}
body.schnabeltier-theme .book-divider {
  background: linear-gradient(to right, transparent, rgba(125,249,255,0.35), transparent) !important;
}
body.schnabeltier-theme .book-detail__backup-btn {
  background: rgba(4,42,24,0.35) !important;
  border-color: rgba(125,249,255,0.35) !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .book-detail__backup-btn:hover {
  background: rgba(4,42,24,0.6) !important;
}

/* ── Trank-Banner ── */
body.schnabeltier-theme .trank-banner {
  background: linear-gradient(135deg, #0a1e10 0%, #0b2415 100%) !important;
  border-top-color: rgba(125,249,255,0.4) !important;
  box-shadow: 0 -4px 20px rgba(125,249,255,0.1) !important;
}

/* ── Sealed Egg Modal ── */
body.schnabeltier-theme .sealed-egg-modal-box {
  background: linear-gradient(180deg, #0a1e10, #04100a) !important;
  border-color: rgba(125,249,255,0.35) !important;
}

/* ── Badges ── */
body.schnabeltier-theme .legendary-badge {
  background: linear-gradient(135deg, rgba(125,249,255,0.18), rgba(0,180,200,0.16)) !important;
  border-color: rgba(125,249,255,0.45) !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .epic-badge {
  background: linear-gradient(135deg, rgba(100,220,230,0.14), rgba(0,160,180,0.14)) !important;
  border-color: rgba(125,249,255,0.38) !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .rare-badge {
  background: linear-gradient(135deg, rgba(50,200,200,0.16), rgba(0,150,170,0.14)) !important;
  border-color: rgba(125,249,255,0.35) !important;
  color: rgba(125,249,255,0.85) !important;
}

/* ── Nest-Kachel ── */
.nest-card--schnabeltier {
  border-color: rgba(125,249,255,0.5) !important;
  box-shadow: 0 0 18px rgba(125,249,255,0.15) !important;
}

/* ── Scrollbar ── */
body.schnabeltier-theme ::-webkit-scrollbar-track { background: #060f08 !important; }
body.schnabeltier-theme ::-webkit-scrollbar-thumb { background: rgba(125,249,255,0.35) !important; border-color: #060f08 !important; }

/* ── Season 2 Modal ── */
body.schnabeltier-theme .s2-panel {
  background: linear-gradient(180deg, #0d2a18, #060f08) !important;
  border-color: rgba(125,249,255,0.4) !important;
  box-shadow: 0 0 60px rgba(125,249,255,0.12) !important;
}
body.schnabeltier-theme .s2-banner {
  background: linear-gradient(160deg, #041208 0%, #0a2215 55%, #041208 100%) !important;
  border-bottom-color: rgba(125,249,255,0.35) !important;
}
body.schnabeltier-theme .s2-banner::before {
  background: radial-gradient(ellipse at 50% 0%, rgba(125,249,255,0.1) 0%, transparent 65%) !important;
}
body.schnabeltier-theme .s2-badge {
  background: rgba(0,207,255,0.2) !important;
  border: 1px solid #7df9ff !important;
  color: #7df9ff !important;
}
body.schnabeltier-theme .s2-banner__title {
  color: #7df9ff !important;
  text-shadow: 0 0 40px rgba(125,249,255,0.5) !important;
}
body.schnabeltier-theme .s2-banner__sub { color: rgba(125,249,255,0.6) !important; }
body.schnabeltier-theme .s2-body { background: linear-gradient(180deg, #0d2a18, #060f08) !important; }

/* Auth-Pill + Profil-Menü — Bioluminesz-Cyan */
body.schnabeltier-theme .hub-auth { border-left-color: rgba(125,249,255,0.28) !important; }
body.schnabeltier-theme .hub-auth-btn { color: #7df9ff !important; }
body.schnabeltier-theme .hub-auth-avatar { background: rgba(125,249,255,0.10) !important; }
body.schnabeltier-theme .hub-auth-menu {
  background: linear-gradient(180deg, #0d2a18, #060f08) !important;
  border-color: rgba(125,249,255,0.45) !important;
  box-shadow: 0 0 24px rgba(125,249,255,0.22) !important;
}
body.schnabeltier-theme .hub-auth-menu > * + * { border-top-color: rgba(125,249,255,0.18) !important; }
body.schnabeltier-theme .hub-auth-menu button,
body.schnabeltier-theme .hub-auth-menu a { color: #d0fbff !important; }
body.schnabeltier-theme .hub-auth-menu button:hover,
body.schnabeltier-theme .hub-auth-menu a:hover { background: rgba(125,249,255,0.12) !important; }
body.schnabeltier-theme .hub-auth-menu #hubAdminLink { color: #7df9ff !important; }
`;
  document.head.appendChild(s);
}
