/* ═══════════════════════════════════════════════════════════════
   LERNWELT – script.js
   Nur Hub-Logik. Kreatur/Ei/Speicher-Logik → creatures.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────
   ZUGRIFFSKONTROLLE (geladen aus config.json)
   ───────────────────────────────────────────────── */
let GAME_ACCESS = {};
const UNLOCK_KEY = 'lernwelt_unlocked';

function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem(UNLOCK_KEY)) || []; } catch(e) { return []; }
}
function saveUnlocked(gameId) {
  const list = loadUnlocked();
  if (!list.includes(gameId)) { list.push(gameId); localStorage.setItem(UNLOCK_KEY, JSON.stringify(list)); }
}
function getGameAccess(gameId) {
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
  { id: 'game1', season: 1, title: 'Finde Grün',       icon: '🟢', url: 'Finde Grün/index.html'          },
  { id: 'game7', season: 1, title: 'Escape Game',      icon: '🔐', url: 'S1 EscapeGame/index.html'       },
  { id: 'game3', season: 1, title: 'Daten-Quiz',       icon: '📁', url: 'S1 DateiformatQuiz/index.html'  },
  { id: 'game8', season: 1, title: 'Projekt_FINAL_v7_NEU',  icon: '🗂️', url: 'S1 Projekt_FINAL_v7_NEU/index.html'       },
  { id: 'game5',  season: 2, title: 'Finde Gelb',       icon: '🟡', url: 'Finde Gelb/index.html'                },
  { id: 'game9',  season: 2, title: 'Fokusflow',        icon: '🎯', url: 'S2 Fokusflow/index.html'             },
  { id: 'game10', season: 2, title: 'The Algorithm',    icon: '⚙️', url: 'S2 The Algorithm/index.html'        },
  { id: 'game11', season: 2, title: '10-Finger-Tippen', icon: '⌨️', url: 'S2 10finger Blindschreiben/index.html' },
  { id: 'game6',  season: 3, title: 'Finde nicht Grün', icon: '🚫', url: 'Finde nicht Grün/index.html' },
  { id: 'game12', season: 3, title: 'Quellen-Tinder',  icon: '🃏', url: 'S3 Quellen Tinder/index.html' },
  { id: 'game13', season: 3, title: 'KI 1',            icon: '🤖', url: 'S3 KI1/index.html'           },
  { id: 'game14', season: 3, title: 'KI 2',            icon: '🧠', url: 'S3 KI2/index.html'           },
];

const SEASONS_CONFIG = [
  { id: 1, title: 'Season 1 – Regeln, Ordnung, Dateien',      desc: 'Diese Season knüpft an die Inhalte der ersten Tablet-Schulung an und bringt dein Wissen auf das nächste Level. In drei spannenden Spielen sicherst und vertiefst du wichtige Grundlagen rund um die Tabletnutzung – von unseren Hausregeln über Dateiformate bis hin zur richtigen Struktur auf deinem Gerät. So wirst du Schritt für Schritt sicherer und schneller im Umgang mit deinem Tablet.' },
  { id: 2, title: 'Season 2 – Aufmerksamkeit und Schreiben', desc: 'Deine Aufmerksamkeit ist eine deiner wichtigsten Ressourcen – deshalb lohnt es sich, bewusst mit ihr umzugehen. Diese Season baut auf den Inhalten eines Workshops aus der ersten Schulung. In zwei Aufmerksamkeitsspielen geht es um Fokus und das Binden von Aufmerksamkeit. Außerdem tauchst du in das 10-Finger-Blindschreiben ein: Vielleicht nicht die wichtigste Methode zum Lernen, aber eine Fähigkeit, die dir das Schreiben längerer Texte enorm erleichtert und im Schulalltag wie auch später im Berufsleben unverzichtbar ist.' },
  { id: 3, title: 'Season 3 – KI und Recherche',     desc: 'coming soon' },
];

/* ─────────────────────────────────────────────────
   2. SHOP-KONFIGURATION (Items werden hier ergänzt)
   ───────────────────────────────────────────────── */
// Atari0 · Enter 7-3-9-1
const SHOP_ITEMS = [
  { id: 'wachstumstrank',   icon: '🧪', name: 'Wachstumstrank',    description: 'Gibt einem Tier deiner Wahl sofort +5 Wachstumspunkte.', price: 5,  consumable: true },
  { id: 'wachstumsBooster', icon: '⚡', name: 'Wachstums-Booster', description: 'Im nächsten Spiel wächst dein Tier doppelt so schnell.',  price: 15, consumable: true },
  { id: 'coinsx3',          icon: '🎰', name: 'Coins ×3',          description: 'Im nächsten Spiel verdienst du dreimal so viele Münzen.', price: 10, consumable: true },
  { id: 'glucksklee',   icon: '🍀', name: 'Glücksklee',      description: 'Erhöht die Chance auf ein episches Tier um mindestens 20 %. Aber spiele gut – je mehr richtige Antworten, desto höher steigt sie!', price: 30, consumable: true },
  { id: 'buchDerMonster',   icon: '📜', name: 'Buch der Monster',  description: 'Enthüllt das Bestiarum der Lernwelt. Alle Wesen, die du je erblickt hast, werden darin verewigt.', price: 40, consumable: false, bookItem: true },
  { id: 'seltenesEi',   icon: '🥚', name: 'Seltenes Ei',    description: 'Öffnet einen neuen Kreatur-Slot. 10 % Chance auf ein episches Tier!',   price: 40,  eggItem: true, eggType: 'rare'      },
  { id: 'mythischesEi', icon: '🥚', name: 'Episches Ei',      description: 'Öffnet einen neuen Kreatur-Slot. 50 % Chance auf ein episches Tier!',   price: 120, eggItem: true, eggType: 'mythic'    },
  { id: 'legendaresEi', icon: '🥚', name: 'Legendäres Ei',   description: 'Öffnet einen neuen Kreatur-Slot. 100 % Chance auf ein episches Tier!',  price: 200, eggItem: true, eggType: 'legendary' },
  { id: 'atariHint', icon: '📡', name: 'Hinweis zum verlorenen Ei', description: 'Enthüllt die Spur einer verborgenen Kreatur. Nur für die Mutigen.', price: 400, consumable: false, atariHintItem: true },
];

// Atari2 · Enter 1-5-0-7
const CREATURE_ORDER = ['snail','fish','chicken','salamander','falkeneule','triceratops','dragon','butterfly','snaildragon','turtle','robot','pfau','biene','oktopus','ente'];

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
  oktopus:     'Seltener Oktopus — Season 2',
  ente:        'Seltene Ente — Season 3',
};

/* ─────────────────────────────────────────────────
   3. GESEHENE KREATUREN TRACKEN
   ───────────────────────────────────────────────── */
function updateSeenCreatures(allData) {
  const sd = loadShopData();
  let changed = false;

  const check = (data) => {
    if (!data?.creature) return;
    const stage = getGrowthStage(data.growth);
    const prev  = sd.seenCreatures[data.creature] ?? -1;
    if (stage > prev) { sd.seenCreatures[data.creature] = stage; changed = true; }
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
    const raw  = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    for (const g of GAMES_CONFIG) {
      if (!data[g.id]) data[g.id] = defaultGameData();
    }
    return data;
  } catch(e) { return {}; }
}

function saveAllData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
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
  if (changed) saveShopData(sd);
}

// Atari1 · Enter 4-8-2-6
function renderHub() {
  const grid = document.getElementById('gamesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  refundAbandonedItems();
  const allData = loadAllData();
  updateSeenCreatures(allData);
  checkPfauUnlock();
  const shopData = loadShopData();

  for (const season of SEASONS_CONFIG) {
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
      const card = document.createElement('div');
      const access    = getGameAccess(game.id);
      const rare      = data.creature && isRare(data.creature);
      const epic      = data.creature && isEpic(data.creature);
      const legendary = data.creature && isLegendary(data.creature);
      const maxed     = data.creature && data.growth >= GROWTH_MAX;
      card.className = `game-card${access === 'locked' ? ' game-card--locked' : ''}${data.creature && access === 'available' ? ' has-creature' : ''}${rare && access === 'available' ? ' game-card--rare' : ''}${epic && access === 'available' ? ' game-card--epic' : ''}${legendary && access === 'available' ? ' game-card--legendary' : ''}${maxed && access === 'available' ? ' creature-maxed' : ''}`;
      card.innerHTML  = buildCardHTML(game, data, shopData);

      card.querySelector('.game-card__use-btn')?.addEventListener('click', e => {
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

      card.querySelector('.game-card__trank-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        tryApplyWachstumstrank(game.id);
      });

      card.querySelector('.game-card__btn')?.addEventListener('click', () => {
        const access = getGameAccess(game.id);
        if (access === 'locked') return;
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
            window.location.href = game.url + '?id=' + nest.nestId + '&egg=' + nest.eggType;
            return;
          }
        }
        window.location.href = game.url + '?id=' + game.id;
      });
      if (data.creature) {
        card.querySelector('.creature-preview')?.addEventListener('click', e => {
          e.stopPropagation();
          showCreatureModal(data);
        });
      }
      card.querySelector('.game-card__release')?.addEventListener('click', e => {
        e.stopPropagation();
        confirmRelease(game.id);
      });
      seasonGrid.appendChild(card);
    }

    section.appendChild(titleEl);
    section.appendChild(descEl);
    section.appendChild(seasonGrid);
    grid.appendChild(section);
  }

  renderGallery(allData);
  renderCoinDisplay(allData);
  renderNestSection(allData);
  initGalleryWalk();
  applyThemeFromPreference(allData);
  _injectPfauThemeStyles();

  if (shopData.pendingEggNestId) enterPendingEggMode();
  else exitPendingEggMode();
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

  const hasCreature  = !!data.creature;
  const stage        = hasCreature ? getGrowthStage(data.growth) : -1;
  const maxed        = hasCreature && data.growth >= GROWTH_MAX;
  const canUseTrank  = hasCreature && !maxed && (shopData?.wachstumstrankCount ?? 0) > 0;
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

  return `
    <h3 class="game-card__title">${game.icon} ${game.title}</h3>
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
  const it = getActiveItemForSlot(data, shopData);
  if (it) return `<div class="game-card__action-row"><button class="game-card__btn">Spielen!</button><button class="game-card__use-btn" data-item="${it.id}" data-count-key="${it.countKey}">nutze ${it.icon}</button></div>`;
  return `<button class="game-card__btn">Spielen!</button>`;
})()}
    ${data.roundsPlayed > 0 ? `<button class="game-card__release" title="Tier freilassen">${RELEASE_ICON}</button>` : ''}
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
          <div style="font-size:1.7rem;font-weight:800;color:var(--clr-amber);">${data.growth}</div>
        </div>
      </div>
      ${nextPts > 0
        ? `<p style="font-size:0.82rem;color:var(--clr-cream-dim);">Noch <strong style="color:var(--clr-gold);">${nextPts} Punkte</strong> bis zur nächsten Stufe!</p>`
        : `<p style="font-size:0.82rem;color:var(--clr-green);">✓ Vollständig ausgewachsen!</p>`}
    </div>`;
  overlay.hidden = false;
}

function renderCoinDisplay(allData) {
  const shopData  = loadShopData();
  const available = getTotalCoins(allData) - shopData.spentCoins;
  const el = document.getElementById('coinAmount');
  if (el) el.textContent = available;

  const bookBtn = document.getElementById('bookBtn');
  if (bookBtn) bookBtn.hidden = !shopData.purchased.includes('buchDerMonster');
}

/* ─────────────────────────────────────────────────
   6. SHOP MODAL
   ───────────────────────────────────────────────── */
function openShopModal() {
  const modal = document.getElementById('shopModal');
  if (!modal) return;
  renderShop(loadAllData());
  modal.hidden = false;
}

function closeShopModal() {
  const modal = document.getElementById('shopModal');
  if (modal) modal.hidden = true;
}

// Atari5 · Enter 2-7-1-8
function renderShop(allData) {
  const list = document.getElementById('shopList');
  if (!list) return;
  list.innerHTML = '';

  const shopData  = loadShopData();
  const available = getTotalCoins(allData) - shopData.spentCoins;

  const shopCoinEl = document.getElementById('shopCoinAmount');
  if (shopCoinEl) shopCoinEl.textContent = available;

  const STACKABLE = ['wachstumstrank', 'wachstumsBooster', 'coinsx3', 'glucksklee'];
  const COUNT_KEYS = { wachstumstrank: 'wachstumstrankCount', wachstumsBooster: 'wachstumsBoosterCount', coinsx3: 'coinsx3Count', glucksklee: 'gluckskleeCount' };

  for (const item of SHOP_ITEMS) {
    const soldOut = (item.bookItem || item.atariHintItem)
      ? shopData.purchased.includes(item.id)
      : item.eggItem
        ? shopData.nests.some(n => n.eggType === item.eggType)
        : false;

    const isStackable = STACKABLE.includes(item.id);
    const ownedCount  = isStackable ? (shopData[COUNT_KEYS[item.id]] ?? 0) : 0;
    const isActive    = !isStackable && !!item.consumable && !!shopData[item.id];
    const canAfford   = available >= item.price;
    const btnDisabled = soldOut || isActive || !canAfford;

    let typeClass = '';
    if (item.bookItem)          typeClass = 'shop-list-item--book';
    else if (item.atariHintItem) typeClass = 'shop-list-item--atari';
    else if (item.eggItem)      typeClass = `shop-list-item--egg-${item.eggType}`;
    else if (isActive)          typeClass = 'shop-list-item--active';

    const li = document.createElement('div');
    li.className = `shop-list-item ${typeClass}${soldOut ? ' shop-list-item--soldout' : ''}`.trim();

    let btnText = 'Kaufen';
    if (isActive) btnText = '⚡ Aktiv';

    if (item.atariHintItem && soldOut) {
      const isSolved = shopData.atariSolved;
      _injectAtariStyles();
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
        const note = li.querySelector('#atariHintNote');
        note.addEventListener('click', () => {
          const now = Date.now();
          _atariHintClicks = _atariHintClicks.filter(t => now - t < 700);
          _atariHintClicks.push(now);
          if (_atariHintClicks.length >= 3) { _atariHintClicks = []; openAtariTerminal(); }
        });
      }
    } else {
      li.innerHTML = `
        <div class="shop-list-item__icon">${item.icon}</div>
        <div class="shop-list-item__info">
          <div class="shop-list-item__name">${item.name}</div>
          <p class="shop-list-item__desc">${item.description}</p>
          <div class="shop-list-item__price"><span>🪙</span><span>${item.price} Münzen</span></div>
        </div>
        <div class="shop-list-item__buy-col">
          ${!soldOut ? `<button class="shop-list-item__btn"${btnDisabled ? ' disabled' : ''}>${btnText}</button>` : ''}
          ${isStackable && ownedCount > 0 ? `<div class="shop-item-owned">${ownedCount}× besitz</div>` : ''}
          ${soldOut && !item.atariHintItem ? '<div class="shop-soldout-ribbon"></div>' : ''}
        </div>
      `;
      if (!soldOut && !btnDisabled) {
        li.querySelector('.shop-list-item__btn').addEventListener('click', () => buyItem(item.id));
      }
    }

    list.appendChild(li);
  }
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
  saveAllData(allData);
  document.getElementById('modalOverlay').hidden = true;
  renderHub();
}

function buyItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  const shopData  = loadShopData();
  const allData   = loadAllData();
  const available = getTotalCoins(allData) - shopData.spentCoins;
  if (available < item.price) return;

  if (item.atariHintItem) {
    if (shopData.purchased.includes(itemId)) return;
    shopData.spentCoins += item.price;
    shopData.purchased.push(itemId);
    shopData.atariNumber = Math.floor(Math.random() * 8);
    saveShopData(shopData);
    renderShop(loadAllData());
    return;
  }

  if (item.eggItem) {
    const nestId = 'nest_' + Date.now();
    shopData.spentCoins += item.price;
    shopData.nests.push({ nestId, eggType: item.eggType, gameId: null, gameUrl: null });
    shopData.pendingEggNestId = nestId;
    saveShopData(shopData);
    closeShopModal();
    renderHub();
    return;
  }

  if (item.consumable) {
    shopData.spentCoins += item.price;
    shopData[itemId + 'Count'] = (shopData[itemId + 'Count'] ?? 0) + 1;
    saveShopData(shopData);
    renderHub();
    renderShop(loadAllData());
    return;
  }
  if (shopData.purchased.includes(itemId)) return;
  shopData.spentCoins += item.price;
  shopData.purchased.push(itemId);
  saveShopData(shopData);
  closeShopModal();
  renderHub();
}

/* ─────────────────────────────────────────────────
   7. WACHSTUMSTRANK
   ───────────────────────────────────────────────── */
function tryApplyWachstumstrank(gameId) {
  const sd = loadShopData();
  if ((sd.wachstumstrankCount ?? 0) <= 0) return;
  const allData = loadAllData();
  const data = allData[gameId];
  if (!data || !data.creature || data.growth >= GROWTH_MAX) return;
  data.growth = Math.min(data.growth + 5, GROWTH_MAX);
  saveAllData(allData);
  sd.wachstumstrankCount--;
  saveShopData(sd);
  renderHub();
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

  const attempt = () => {
    const cfg = GAME_ACCESS[gameId];
    if (input.value === cfg.password) {
      saveUnlocked(gameId);
      overlay.hidden = true;
      window.location.href = game.url + '?id=' + gameId;
    } else {
      error.textContent = 'Falsches Passwort – bitte versuche es erneut.';
      input.value = '';
      input.focus();
    }
  };

  submit.addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  setTimeout(() => input.focus(), 50);
}

/* ─────────────────────────────────────────────────
   8. NEST-SEKTION (zwischen Spielen und Shop)
   ───────────────────────────────────────────────── */
const EGG_TYPE_NAMES = { rare: 'Selten', mythic: 'Episch', legendary: 'Legendär', atari: 'ATARI', pfau: '🦚 Pfau' };

function renderNestSection(allData) {
  const section = document.getElementById('nestSection');
  const grid    = document.getElementById('nestsGrid');
  if (!section || !grid) return;

  const shopData = loadShopData();
  if (!shopData.nests.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = '';

  for (const nest of shopData.nests) {
    const nestData    = allData[nest.nestId] || defaultGameData();
    const hasCreature = !!nestData.creature;
    const stage       = hasCreature ? getGrowthStage(nestData.growth) : -1;
    const progressPct = hasCreature ? Math.min(nestData.growth / GROWTH_MAX * 100, 100) : 0;
    const epic       = hasCreature && isEpic(nestData.creature);
    const legendary  = hasCreature && isLegendary(nestData.creature);
    const linkedGame  = GAMES_CONFIG.find(g => g.id === nest.gameId);
    const isPending   = shopData.pendingEggNestId === nest.nestId;
    const eggTypeName = EGG_TYPE_NAMES[nest.eggType] ?? nest.eggType;
    const canPlay     = hasCreature || !!nest.gameId;

    const imgContent = hasCreature
      ? `<div class="hub-creature-display">${getCreatureHTML(nestData.creature, stage)}</div>`
      : eggStage0();

    const specialBadge = epic ? `<span class="epic-badge">✦ Episch ✦</span>`
      : legendary ? `<span class="legendary-badge">✦ Legendär ✦</span>` : '';

    let playBtn;
    if (canPlay) {
      playBtn = `<button class="game-card__btn">Spielen!</button>`;
    } else {
      playBtn = isPending
        ? `<p class="nest-card__hint">Klicke auf "Spielen!" bei einem Spiel!</p>`
        : `<p class="nest-card__hint" style="opacity:0.5;">Wähle ein Spiel…</p>`;
    }

    const nestMaxed = hasCreature && nestData.growth >= GROWTH_MAX;
    const canUseTrank = hasCreature && !nestMaxed && (shopData.wachstumstrankCount ?? 0) > 0;
    const card = document.createElement('div');
    const isAtariEgg = !hasCreature && nest.eggType === 'atari';
    const isPfauEgg  = !hasCreature && nest.eggType === 'pfau';
    card.className = `game-card nest-game-card${hasCreature ? ' has-creature' : ''}${epic ? ' game-card--epic' : ''}${legendary ? ' game-card--legendary' : ''}${isAtariEgg ? ' nest-card--atari' : ''}${isPfauEgg ? ' nest-card--pfau' : ''}${isPending ? ' nest-card--pending' : ''}${nestMaxed ? ' creature-maxed' : ''}`;

    const nestActiveItem = canPlay ? getActiveItemForSlot(nestData, shopData) : null;

    card.innerHTML = `
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
      ${nestActiveItem
        ? `<div class="game-card__action-row"><button class="game-card__btn">Spielen!</button><button class="game-card__use-btn" data-item="${nestActiveItem.id}" data-count-key="${nestActiveItem.countKey}">nutze ${nestActiveItem.icon}</button></div>`
        : playBtn}
      <button class="game-card__release" title="Tier freilassen">${RELEASE_ICON}</button>
      ${canUseTrank ? `<button class="game-card__trank-btn" title="Wachstumstrank anwenden">🧪</button>` : ''}
    `;

    if (canPlay) {
      card.querySelector('.game-card__btn').addEventListener('click', () => {
        playNest(nest.nestId);
      });
      card.querySelector('.game-card__use-btn')?.addEventListener('click', e => {
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
    grid.appendChild(card);
  }
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
  const legendary = nest.eggType === 'pfau' || nest.eggType === 'atari';

  if (legendary) {
    nest.gameId           = null;
    nest.gameUrl          = null;
    sd.pendingEggNestId   = nestId;
  } else {
    sd.nests       = sd.nests.filter(n => n.nestId !== nestId);
    sd.bankedCoins = (sd.bankedCoins || 0) + nestCoins;
  }
  saveShopData(sd);

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const all = JSON.parse(raw);
      delete all[nestId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  } catch(e) {}
  document.getElementById('modalOverlay').hidden = true;
  renderHub();
}

/* ─────────────────────────────────────────────────
   9. AUSSTEHENDES EI-MODUS
   ───────────────────────────────────────────────── */
function enterPendingEggMode() {
  if (document.getElementById('pendingEggBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'pendingEggBanner';
  banner.className = 'trank-banner';
  banner.innerHTML = `
    <span>🥚 Klicke bei einem Spiel auf "Spielen!", um dein Ei dort auszubrüten!</span>
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
   10. BUCH DER MONSTER
   ───────────────────────────────────────────────── */
// Atari7 · Enter 3-6-8-0
function openBookModal() {
  const sd      = loadShopData();
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;

  const seen  = sd.seenCreatures;
  const total = CREATURE_ORDER.length;
  const found = Object.keys(seen).length;

  const makeSlot = (creature) => {
    const hasSeen  = seen[creature] !== undefined;
    const maxStage = hasSeen ? seen[creature] : -1;
    const isFinal  = maxStage >= GROWTH_STAGES - 1;
    const rare     = isRare(creature);
    const epic     = isEpic(creature);
    const leg      = isLegendary(creature);
    const specialClass       = rare ? ' book-slot--rare' : epic ? ' book-slot--epic' : leg ? ' book-slot--legendary' : '';
    const specialUnseenClass = rare ? ' book-slot--rare-unseen' : epic ? ' book-slot--epic-unseen' : leg ? ' book-slot--legendary-unseen' : '';
    if (!hasSeen) {
      return `<div class="book-slot book-slot--unseen${specialUnseenClass}" title="Noch nicht entdeckt">
        <span class="book-slot__unknown">?</span>
      </div>`;
    }
    return `<div class="book-slot book-slot--seen${specialClass}" data-creature="${creature}" title="${BOOK_NAMES[creature] ?? CREATURE_NAMES[creature]}">
      <div class="book-slot__img">${getCreatureHTML(creature, maxStage)}</div>
      ${isFinal ? '<span class="book-slot__check">✓</span>' : ''}
    </div>`;
  };

  const normals = ['snail','fish','chicken','salamander','falkeneule','triceratops','dragon'];
  const rares   = ['biene','oktopus','ente'];
  const epics   = ['butterfly','snaildragon','turtle'];
  const legies  = ['robot','pfau'];

  content.innerHTML = `
    <div class="book-modal-inner">
      <h2 class="book-modal__title">📜 Buch der Monster</h2>
      <p class="book-modal__count">${found} / ${total} entdeckt</p>
      <div class="book-grid book-grid--normals">${normals.map(makeSlot).join('')}</div>
      <div class="book-divider"></div>
      <div class="book-grid book-grid--centered">${rares.map(makeSlot).join('')}</div>
      <div class="book-divider"></div>
      <div class="book-grid book-grid--centered">${epics.map(makeSlot).join('')}</div>
      <div class="book-divider"></div>
      <div class="book-grid book-grid--centered">${legies.map(makeSlot).join('')}</div>
    </div>`;

  overlay.hidden = false;

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
      </div>`;

    document.getElementById('bookBack')?.addEventListener('click', openBookModal);
    document.getElementById('bookPrev')?.addEventListener('click', () => { if (stage > 0) { stage--; render(); } });
    document.getElementById('bookNext')?.addEventListener('click', () => { if (stage < maxStage) { stage++; render(); } });

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
      stationary: stage === 0 || (creature === 'butterfly' && stage === 3) || (creature === 'robot' && stage === 4),
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
const THEME_PREF_KEY = 'lernwelt_theme_pref';

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

  if (hasMaxed('pfau'))  themes.push('pfau');
  if (hasMaxed('robot')) themes.push('atari');
  return themes;
}

function applyThemeFromPreference(allData) {
  const unlocked = _getUnlockedThemes(allData);
  const pref = localStorage.getItem(THEME_PREF_KEY);
  let active = (pref && unlocked.includes(pref)) ? pref
    : unlocked.includes('atari') ? 'atari'
    : unlocked.includes('pfau')  ? 'pfau'
    : 'default';

  if (active === 'atari') {
    _activateAtariTheme();
    _deactivatePfauTheme();
  } else if (active === 'pfau') {
    _deactivateAtariTheme();
    _activatePfauTheme();
  } else {
    _deactivateAtariTheme();
    _deactivatePfauTheme();
  }

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
  const icons = { default: '🌟', pfau: '🦚', atari: '💾' };
  const names = { default: 'Standard', pfau: 'Pfau', atari: 'Atari' };
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

function _startCodeRain() {
  if (_atariCodeInterval) return;
  _spawnCodeFragment();
  _atariCodeInterval = setInterval(_spawnCodeFragment, 1600);
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
   Freigeschaltet wenn alle normalen, seltenen und epischen Kreaturen ausgewachsen sind (nicht Legendary)
   ───────────────────────────────────────────────── */
function checkPfauUnlock() {
  const sd = loadShopData();
  if (sd.pfauEggGranted) return;

  const required = ['snail','fish','chicken','salamander','falkeneule','triceratops','dragon','butterfly','snaildragon','turtle','biene','oktopus','ente'];
  const allMaxed = required.every(c => (sd.seenCreatures[c] ?? -1) >= GROWTH_STAGES - 1);
  if (!allMaxed) return;

  const nestId = 'nest_pfau_' + Date.now();
  sd.pfauEggGranted = true;
  sd.nests.push({ nestId, eggType: 'pfau', gameId: null, gameUrl: null });
  sd.pendingEggNestId = nestId;
  saveShopData(sd);

  setTimeout(() => _showPfauUnlockAnimation(), 400);
}

function _showPfauUnlockAnimation() {
  _injectPfauThemeStyles();

  const overlay = document.createElement('div');
  overlay.id = 'pfauUnlockOverlay';
  overlay.innerHTML = `
    <div class="pfau-unlock-sparkle-wrap" id="pfauUnlockSparkles"></div>
    <div class="pfau-unlock-box">
      <div class="pfau-unlock-emoji">🦚</div>
      <h2 class="pfau-unlock-title">Der Pfau erwacht</h2>
      <p class="pfau-unlock-sub">Du hast alle Kreaturen ausgewachsen!</p>
      <p class="pfau-unlock-hint">Ein legendäres Ei erscheint in deiner Welt…</p>
    </div>`;
  document.body.appendChild(overlay);

  const wrap = document.getElementById('pfauUnlockSparkles');
  for (let i = 0; i < 28; i++) {
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

function _startGlitter() {
  if (_pfauGlitterTimer) return;
  _spawnGlitterParticle();
  _pfauGlitterTimer = setInterval(_spawnGlitterParticle, 700);
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
`;
  document.head.appendChild(s);
}
