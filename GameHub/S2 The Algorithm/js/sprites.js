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
