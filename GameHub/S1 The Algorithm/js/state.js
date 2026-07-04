const gameState = {
  dopamin:        80,
  reizschwelle:             0,
  reizschwelleOptimalwert:  0,
  sozialdrang:              0,

  elapsedSeconds: 0,

  interests: [],
  hand:      [],
  feedSlots: [null, null, null],

  isRunning:     false,
  isGameOver:    false,
  isInRecovery:  false,
  recoveryCount: 0,
  score:         0,

  secondsSinceLastCard: 0,

  freeCardPlays: 0,
  feedCopyMode:  false,
  endlessMode:      false,
  endlessGameOver:  false,

  activeEvent:         null,
  scheduledEventTimes: [],
};
