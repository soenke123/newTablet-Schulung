const SPRITE_STATES = {
  IDLE:        ['user1', 'user2', 'user3'],
  TIRED:       ['userTired1', 'userTired2', 'userTired3'],
  WALK_RIGHT:  ['gehen1', 'gehen2', 'gehen3', 'gehen4'],
  WALK_LEFT:   ['umdrehen', 'gehen1', 'gehen2', 'gehen3', 'gehen4'],
  THINKING:    ['überlegen'],
  WON:         ['gewonnen', 'gewonnen0'],
  BED:         ['Bett'],
  BED_SCHWEIN: ['BettmitSchwein'],
  STANDING_UP: ['aufstehen'],
  EMOTION:     ['emotion', 'emotion2'],
};

function getSpriteFrames(state) {
  return (SPRITE_STATES[state] || SPRITE_STATES.IDLE).map(name => `data/${name}.png`);
}

// Alle Sprites vorladen, damit `sprite.src = ...` später sofort greift
// und die Aufsteh-/Lauf-Sequenz nicht durch Netz-Ladezeiten ruckelt.
const _PRELOAD_NAMES = [
  ...SPRITE_STATES.IDLE,
  ...SPRITE_STATES.TIRED,
  ...SPRITE_STATES.WALK_RIGHT,
  'umdrehen',
  'überlegen', 'aufstehen',
  'gewonnen', 'gewonnen0',
  'Bett', 'BettmitSchwein', 'schlafen1',
  'emotion', 'emotion2',
  'raumTag', 'raumTagOpen', 'raumTagOpenFront',
  'raumAbend', 'raumAbendOpen', 'raumAbendOpenFront',
  'raumNacht', 'raumNachtOpen', 'raumNachtOpenFront',
  'handy', 'noWLAN', 'schlechtercontent',
  'Augenschmerzen1', 'FOMO', 'Finale', 'Handyzeit',
];

const _preloadedSpriteCache = _PRELOAD_NAMES.map(name => {
  const img = new Image();
  img.src = `data/${name}.png`;
  return img;
});
