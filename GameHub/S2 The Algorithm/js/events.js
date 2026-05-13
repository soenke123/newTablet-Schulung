// ── Konfiguration ──────────────────────────────────────────────────────────
// 6 Ingame-Stunden = 180 Echtzeitsekunden (1s real = 2 Ingame-Minuten)
const EVENTS_FIRST_HALF  = 2;   // 15:00–21:00
const EVENTS_SECOND_HALF = 4;   // 21:00–03:00
const HALF_REAL_SECONDS  = 180;
const GAME_DURATION      = 360;

// ── Eventdefinitionen ──────────────────────────────────────────────────────
const EVENT_DEFINITIONS = [
  {
    id:         'kein_wlan',
    type:       'PFLICHT',
    duration:   15,
    sprite:     'noWLAN.png',
    timeWindow: null,
    allowCards: false,
    message:    'Kein Netzwerk – der Algorithmus hat keinen Einfluss auf den User. Keine Karten spielbar.',
  },
  {
    id:            'sport',
    type:          'OPTIONAL',
    duration:      10,
    sprite:        'überlegen.png',
    timeWindow:    { lo: 1, hi: 90 },
    preferredHalf: 1,
    allowCards:    true,
    tickEffects:   { sozialdrang: 4 },
    message:       'Sport-Training geht los. Soll ich dahin gehen? Sozialdrang steigt jeden Tick.',
  },
  {
    id:            'komische_nachricht',
    type:          'OPTIONAL',
    duration:      10,
    sprite:        'schlechtercontent.png',
    timeWindow:    { lo: 210, hi: 360 },
    preferredHalf: 2,
    allowCards:    true,
    tickEffects:   { sozialdrang: -2, dopamin: -5 },
    message:       'Unangemessene Nachricht – komische Menschen… komisches Internet. Dopamin sinkt, Sozialdrang etwas runter.',
  },
  {
    id:            'müde',
    type:          'PFLICHT',
    duration:      10,
    sprite:        'gewonnen0.png',
    timeWindow:    { lo: 270, hi: 345 },
    preferredHalf: 2,
    allowCards:    true,
    tickEffects:   { dopamin: -2, reizschwelle: -4 },
    message:       'Sooo Müde… Ich sollte ins Bett. Dopamin und Reizschwelle sinken jeden Tick.',
  },
  {
    id:                'staffelfinale',
    type:              'OPTIONAL',
    duration:          20,
    sprite:            'Finale.png',
    timeWindow:        { lo: 90, hi: 215 },
    preferredHalf:     1,
    allowCards:        false,
    bypassFeedDopamin: true,
    specialEffects: {
      sozialdrangFreeze: true,
      dopaminPerTick:    2,
      dopaminFloor:      30,
      reizFloorOffset:   -28,
    },
    message: 'Endlich das Staffelfinale ist online! Dopamin steigt automatisch, Sozialdrang eingefroren – aber keine Karten spielbar.',
  },
  {
    id:            'bildschirmzeit',
    type:          'OPTIONAL',
    duration:      8,
    sprite:        'Handyzeit.png',
    timeWindow:    { lo: 180, hi: 340 },
    preferredHalf: 2,
    allowCards:    true,
    tickEffects:   { dopamin: -2, reizschwelle: 3 },
    message:       'Du warst heute bereits 4 Stunden online. Vielleicht mal kurz Pause? Dopamin sinkt, Reizschwelle steigt.',
  },
  {
    id:             'fomo',
    type:           'OPTIONAL',
    duration:       12,
    sprite:         'FOMO.png',
    timeWindow:     { lo: 60, hi: 330 },
    allowCards:     true,
    onStartEffects: { sozialdrang: 20 },
    tickEffects:    { dopamin: -2, sozialdrang: 2 },
    message:        'Alle feiern gerade ohne dich. Du verpasst alles! Sozialdrang +20 sofort – Messenger-Karten wirken doppelt.',
  },
  {
    id:             'kurz_eingeschlafen',
    type:           'OPTIONAL',
    duration:       8,
    sprite:         'schlafen1.png',
    timeWindow:     { lo: 270, hi: 350 },
    preferredHalf:  2,
    allowCards:     false,
    specialEffects: { clearFeed: true, clearHand: true },
    message:        'Kurz eingeschlafen… Wo bin ich gerade? Feed und Hand werden komplett geleert.',
  },
  {
    id:             'augen_brennen',
    type:           'OPTIONAL',
    duration:       12,
    sprite:         'Augenschmerzen1.png',
    timeWindow:     { lo: 240, hi: 350 },
    preferredHalf:  2,
    allowCards:     true,
    specialEffects: { blur: true },
    tickEffects:    { reizschwelle: 5, dopamin: -1 },
    message:        'Augen brennen. Schon wieder zu lang draufgeschaut. Reizschwelle steigt schnell – und alles verschwimmt.',
  },
];

// ── Scheduler ──────────────────────────────────────────────────────────────
function _buildPool(count, half, usedIds = new Set()) {
  const pflicht  = EVENT_DEFINITIONS.filter(e => e.type === 'PFLICHT'  && (!e.preferredHalf || e.preferredHalf === half) && !usedIds.has(e.id));
  const optional = EVENT_DEFINITIONS.filter(e => e.type === 'OPTIONAL' && (!e.preferredHalf || e.preferredHalf === half) && !usedIds.has(e.id)).sort(() => Math.random() - 0.5);
  const pool     = [...pflicht, ...optional];
  while (pool.length < count) {
    pool.push(...pflicht.sort(() => Math.random() - 0.5));
  }
  return pool.slice(0, count).sort(() => Math.random() - 0.5);
}

function scheduleEvents() {
  const SAFETY = 5;

  function assignSeconds(pool, defaultLo, defaultHi) {
    return pool.map(event => {
      const lo       = event.timeWindow ? event.timeWindow.lo : defaultLo;
      const hi       = event.timeWindow ? event.timeWindow.hi : defaultHi;
      const maxStart = hi - event.duration - SAFETY;
      const second   = Math.floor(Math.random() * (maxStart - lo + 1)) + lo;
      return { second, eventId: event.id, duration: event.duration };
    });
  }

  const firstPool  = _buildPool(EVENTS_FIRST_HALF, 1);
  const usedIds    = new Set(firstPool.map(e => e.id));
  const secondPool = _buildPool(EVENTS_SECOND_HALF, 2, usedIds);

  const firstHalf  = assignSeconds(firstPool,  1,                HALF_REAL_SECONDS - 1);
  const secondHalf = assignSeconds(secondPool, HALF_REAL_SECONDS, GAME_DURATION - 1);

  const times = [...firstHalf, ...secondHalf].sort((a, b) => a.second - b.second);

  // Mindestabstand: vorheriges Event muss beendet sein
  for (let i = 1; i < times.length; i++) {
    const minStart = times[i - 1].second + times[i - 1].duration + 1;
    if (times[i].second < minStart) times[i].second = minStart;
  }

  gameState.scheduledEventTimes = times.map(({ second, eventId }) => ({ second, eventId }));
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
function startActiveEvent(eventId) {
  const def = EVENT_DEFINITIONS.find(e => e.id === eventId);
  if (!def) return;

  gameState.activeEvent = {
    id:               def.id,
    remainingSeconds: def.duration,
    sprite:           def.sprite,
    message:          def.message,
  };

  if (def.onStartEffects) {
    for (const [stat, delta] of Object.entries(def.onStartEffects)) {
      if (stat in gameState) {
        gameState[stat] = Math.max(0, Math.min(100, gameState[stat] + delta));
      }
    }
  }
  if (def.specialEffects?.clearFeed) {
    gameState.feedSlots = [null, null, null];
    renderFeed();
  }
  if (def.specialEffects?.clearHand) {
    gameState.hand = [];
    drawHand();
  }
  if (def.specialEffects?.blur) {
    document.body.classList.add('augen-brennen');
  }

  stopSpriteAnimation();
  if (def.sprite) {
    document.getElementById('user-sprite').src = 'data/' + def.sprite;
  }
  showEventOverlay(def.message);

  const wrap = document.getElementById('event-duration-wrap');
  const bar  = document.getElementById('event-duration-bar');
  if (wrap && bar) {
    bar.style.transition = 'none';
    bar.style.width = '100%';
    wrap.style.display = 'block';
    bar.offsetHeight;
    bar.style.transition = 'width 0.9s linear';
  }

  renderHand();
}

function endActiveEvent() {
  const def = EVENT_DEFINITIONS.find(e => e.id === gameState.activeEvent?.id);
  gameState.activeEvent = null;
  document.getElementById('event-duration-wrap').style.display = 'none';
  if (def?.specialEffects?.blur) {
    document.body.classList.remove('augen-brennen');
  }
  hideEventOverlay();
  if (gameState.isRunning) animateUser();
  renderHand();
}

// ── Overlay ────────────────────────────────────────────────────────────────
function showEventOverlay(message) {
  const el = document.getElementById('event-overlay');
  el.textContent = message;
  el.style.display = 'block';
}

function hideEventOverlay() {
  document.getElementById('event-overlay').style.display = 'none';
}

// ── Pro-Tick-Hook ──────────────────────────────────────────────────────────
function tickEvents() {
  const next = gameState.scheduledEventTimes[0];
  if (next && gameState.elapsedSeconds === next.second && !gameState.activeEvent) {
    gameState.scheduledEventTimes.shift();
    startActiveEvent(next.eventId);
    return;
  }

  if (gameState.activeEvent) {
    const def = EVENT_DEFINITIONS.find(e => e.id === gameState.activeEvent.id);
    if (def?.tickEffects) {
      if (def.tickEffects.sozialdrang !== undefined)
        gameState.sozialdrang = Math.max(0, Math.min(100, gameState.sozialdrang + def.tickEffects.sozialdrang));
      if (def.tickEffects.dopamin !== undefined)
        gameState.dopamin = Math.max(0, Math.min(100, gameState.dopamin + def.tickEffects.dopamin));
      if (def.tickEffects.reizschwelle !== undefined)
        gameState.reizschwelle = Math.max(0, Math.min(100, gameState.reizschwelle + def.tickEffects.reizschwelle));
    }
    if (def?.specialEffects) {
      const sp = def.specialEffects;
      if (sp.sozialdrangFreeze)
        gameState.sozialdrang = 0;
      if (sp.dopaminPerTick !== undefined)
        gameState.dopamin = Math.max(sp.dopaminFloor ?? 0, Math.min(100, gameState.dopamin + sp.dopaminPerTick));
    }
    gameState.activeEvent.remainingSeconds--;
    const bar = document.getElementById('event-duration-bar');
    if (bar && def) {
      const pct = Math.max(0, (gameState.activeEvent.remainingSeconds / def.duration) * 100);
      bar.style.width = pct + '%';
    }
    if (gameState.activeEvent.remainingSeconds <= 0) {
      endActiveEvent();
    }
  }
}
