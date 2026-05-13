const CARD_TYPES = { ROT: 'ROT', GRUEN: 'GRUEN', BLAU: 'BLAU', WEISS: 'WEISS' };

const TYPE_ICONS = { ROT: '🎬', GRUEN: '💬', BLAU: '🎮', WEISS: '🔔' };

const WIRKUNG_ICONS = {
  dopamin:        '💊',
  sozialdrang:    '👥',
  reizschwelle:   '🔥',
  reizToOptimal:  '🔥',
};

const WIRKUNG_LABELS = {
  dopamin:        'Dopamin',
  sozialdrang:    'Sozialdrang',
  reizschwelle:   'Reizschwelle',
  reizToOptimal:  'nähert sich dem Optimum an',
};

const CARD_DEFINITIONS = [
  // ROT – Video
  {
    id: 'rot_memes', type: CARD_TYPES.ROT, name: 'Meme-Video',
    interestPoints: { Memes: 3, Film: 1 },
    direkteWirkung: { },
    effekt: null,
    beschreibung: 'Endloser Strom lustiger Clips — der Schweinehund vergisst die Zeit.'
  },
  {
    id: 'rot_gossip', type: CARD_TYPES.ROT, name: 'Drama-Clip',
    interestPoints: { Gossip: 3, Beauty: 1 },
    direkteWirkung: { sozialdrang: 3 },
    effekt: null,
    beschreibung: 'Was andere machen, ist zu verlockend, um es zu ignorieren.'
  },
  {
    id: 'rot_sport', type: CARD_TYPES.ROT, name: 'Sport-Highlights',
    interestPoints: { Sport: 3, Fitness: 1 },
    direkteWirkung: { sozialdrang: 3 },
    effekt: null,
    beschreibung: 'Tore, Stunts, Siege — Adrenalin ohne Anstrengung.'
  },
  {
    id: 'rot_tech', type: CARD_TYPES.ROT, name: 'Tech-Review',
    interestPoints: { Technik: 3, Lernen: 1 },
    direkteWirkung: { },
    effekt: null,
    beschreibung: 'Neues Gadget, alter Trick: Kaufen löst das Problem nicht.'
  },
  {
    id: 'rot_beauty', type: CARD_TYPES.ROT, name: 'Beauty-Tutorial',
    interestPoints: { Beauty: 3, Gossip: 1 },
    direkteWirkung: { },
    effekt: null,
    beschreibung: 'Perfekte Haut in 60 Sekunden — der Vergleich nagt leise.'
  },
  {
    id: 'rot_film', type: CARD_TYPES.ROT, name: 'Trailer',
    interestPoints: { Film: 4 },
    direkteWirkung: {},
    effekt: null,
    beschreibung: 'Ein Film den man nie sehen wird — aber der Trailer läuft dreimal.'
  },
  // GRUEN – Messenger
  {
    id: 'gruen_chat', type: CARD_TYPES.GRUEN, name: 'Gruppenchat',
    interestPoints: { Memes: 2 },
    direkteWirkung: { sozialdrang: -12 },
    effekt: null,
    beschreibung: '27 ungelesene Nachrichten — endlich abgehakt.'
  },
  {
    id: 'gruen_foto', type: CARD_TYPES.GRUEN, name: 'Foto teilen',
    interestPoints: { Beauty: 2, Gossip: 2 },
    direkteWirkung: { sozialdrang: -8 },
    effekt: null,
    beschreibung: 'Ein geteilter Moment — die anderen fühlen sich einbezogen.'
  },
  {
    id: 'gruen_einl', type: CARD_TYPES.GRUEN, name: 'Einladung',
    interestPoints: { },
    direkteWirkung: { sozialdrang: -10 },
    effekt: null,
    beschreibung: 'Zusagen reicht — hingehen ist dann doch was anderes.'
  },
  // BLAU – Game
  {
    id: 'blau_loot', type: CARD_TYPES.BLAU, name: 'Lootbox',
    interestPoints: {},
    direkteWirkung: { reizschwelle: 8, dopamin: 15},
    effekt: null,
    beschreibung: 'Vielleicht diesmal das seltene Item — vielleicht auch nicht.'
  },
  {
    id: 'blau_bonus', type: CARD_TYPES.BLAU, name: 'Bonusrunde',
    interestPoints: {},
    direkteWirkung: { reizschwelle: 5, dopamin: 10 },
    effekt: null,
    beschreibung: 'Noch eine Runde. Dann aufhören. Versprochen.'
  },
  {
    id: 'blau_coop', type: CARD_TYPES.BLAU, name: 'Koop-Spiel',
    interestPoints: { Sport: 2, Technik: 2 },
    direkteWirkung: { reizschwelle: 5, sozialdrang: -5 },
    effekt: null,
    beschreibung: 'Zusammen zocken fühlt sich weniger wie Zeitverschwendung an.'
  },
  // ROT – Video (neue Karten)
  {
    id: 'rot_ai_slop', type: CARD_TYPES.ROT, name: 'AI-Slop',
    interestPoints: { Memes: 4 },
    direkteWirkung: {},
    effekt: { uninteresting: true, label: 'Uninteressant', beschreibung: 'Diese Punkte zählen nie als relevantes Interesse — sie senken die Ratio.' },
    beschreibung: 'Generierte Bilder mit seltsamen Händen — irgendwie schaut man trotzdem rein.'
  },
  {
    id: 'rot_katzen', type: CARD_TYPES.ROT, name: 'Süße Katzen',
    interestPoints: { Memes: 2 },
    direkteWirkung: { sozialdrang: -10 },
    effekt: { uninteresting: true, label: 'Uninteressant', beschreibung: 'Diese Punkte zählen nie als relevantes Interesse — sie senken die Ratio.' },
    beschreibung: 'Flauschig, hirnlos, herzerwärmend — und der Sozialdrang schmilzt kurz dahin.'
  },
  {
    id: 'rot_mr_mathe', type: CARD_TYPES.ROT, name: 'Mr. Mathe',
    interestPoints: { Lernen: 4 },
    direkteWirkung: {},
    effekt: null,
    beschreibung: 'Binomische Formeln — endlich mal erklärt, als wäre man dabei.'
  },
  {
    id: 'rot_liegestuetz', type: CARD_TYPES.ROT, name: 'Liegestütz-Tutorial',
    interestPoints: { Fitness: 3, Lernen: 1 },
    direkteWirkung: {},
    effekt: null,
    beschreibung: 'Rücken gerade, Ellenbogen ran — anschauen zählt leider nicht.'
  },
  {
    id: 'rot_sport_kommentar', type: CARD_TYPES.ROT, name: 'Sport kommentieren',
    interestPoints: { Sport: 2, Fitness: 2 },
    direkteWirkung: { sozialdrang: -10, reizschwelle: -10 },
    effekt: null,
    beschreibung: 'Du erklärst im Kommentar, wie man das richtig macht. Ob\'s jemand liest? Egal.'
  },
  {
    id: 'rot_trailer_kommentar', type: CARD_TYPES.ROT, name: 'Trailer kommentieren',
    interestPoints: { Film: 3, Gossip: 1 },
    direkteWirkung: { sozialdrang: -10, reizschwelle: -10 },
    effekt: null,
    beschreibung: 'Dieser Schauspieler passt nicht zur Rolle. Das musste jetzt jemand hören.'
  },
  // GRUEN – Messenger (neue Karten)
  {
    id: 'gruen_crush', type: CARD_TYPES.GRUEN, name: 'Crush-Anfrage',
    interestPoints: {},
    direkteWirkung: { sozialdrang: 15, dopamin: 30 },
    effekt: null,
    beschreibung: 'Ein Kaffee? Nur du und ich? Das Herz rast — aber das Handy hat Vorrang.'
  },
  // WEISS – System (neue Karten)
  {
    id: 'weiss_flow', type: CARD_TYPES.WEISS, name: 'Perfekter Flow',
    interestPoints: {},
    direkteWirkung: {},
    effekt: { perfectFlow: true, label: 'Perfekter Flow', beschreibung: 'Solange diese Karte im Feed ist, gilt die Interesse-Ratio fest als 35% — optimal für Dopamin.' },
    beschreibung: 'Du hast deinen User komplett durchschaut. Der Feed läuft wie von selbst.'
  },
  // GRÜN – Messenger
  {
    id: 'gruen_push', type: CARD_TYPES.GRUEN, name: 'Push-Nachricht',
    interestPoints: {},
    direkteWirkung: { sozialdrang: -15, dopamin: 10 },
    effekt: null,
    fähigkeit: { typ: 'notification', wirkung: { dopamin: 20 }, anzeige: '+20 Dopamin' },
    beschreibung: 'Vibration. Noch eine. Drei auf einmal. Ignorieren unmöglich.'
  },

  // WEISS – neue Karten
  {
    id: 'weiss_swap', type: CARD_TYPES.WEISS, name: 'Tausche Handkarten',
    interestPoints: {},
    direkteWirkung: {},
    effekt: { swapHand: true, label: 'Hand tauschen', beschreibung: 'Alle Handkarten werden sofort durch neue ersetzt.' },
    beschreibung: 'Frischer Start — manchmal hilft nur ein kompletter Reset der Hand.'
  },
  // BLAU – neue Karten
  {
    id: 'blau_new_features', type: CARD_TYPES.BLAU, name: 'Neue Features im Spiel',
    interestPoints: {},
    direkteWirkung: { sozialdrang: -5, reizschwelle: 15 },
    effekt: null,
    beschreibung: 'Die neuen Features sehen gut aus!'
  },
  {
    id: 'blau_new_season', type: CARD_TYPES.BLAU, name: 'Neue Season',
    interestPoints: {},
    direkteWirkung: { reizschwelle: 15 },
    effekt: null,
    beschreibung: 'Neue Season, neuer Loot!'
  },
  {
    id: 'blau_sport_quiz', type: CARD_TYPES.BLAU, name: 'Sport Quiz',
    interestPoints: { Lernen: 2, Sport: 1 },
    direkteWirkung: { reizschwelle: 10 },
    effekt: null,
    beschreibung: 'Sport Quiz entdeckt, das sieht spannend aus.'
  },
  {
    id: 'blau_promi_quiz', type: CARD_TYPES.BLAU, name: 'Promi Quiz',
    interestPoints: { Lernen: 2, Gossip: 1 },
    direkteWirkung: { reizschwelle: 12 },
    effekt: null,
    beschreibung: 'Promi Quiz entdeckt, das sieht spannend aus.'
  },
  {
    id: 'blau_loot_wahnsinn', type: CARD_TYPES.BLAU, name: 'Lootboxen Wahnsinn',
    interestPoints: {},
    direkteWirkung: { dopamin: 15, reizschwelle: 10 },
    effekt: null,
    beschreibung: 'Aus 10 Lootboxen ziehst du endlich den Legendary Skin — Dopamin auf Optimum.'
  },
  {
    id: 'blau_tilten', type: CARD_TYPES.BLAU, name: 'Tilten',
    interestPoints: {},
    direkteWirkung: {},
    effekt: { reizReset: true, label: 'Tilten', beschreibung: 'Solange diese Karte im Feed ist, wird die Reizschwelle auf den Optimalwert gesetzt.' },
    beschreibung: 'Dein Gegner nutzt vermutlich Cheats, du verlierst immer wieder. Dieser Mistkerl!'
  },
  {
    id: 'blau_makeup_game', type: CARD_TYPES.BLAU, name: 'Makeup-Game',
    interestPoints: { Beauty: 3 },
    direkteWirkung: { reizschwelle: 10 },
    effekt: null,
    beschreibung: 'Virtuelle Lippenstifte, echte Sucht. Das Ergebnis teilen macht alles schlimmer.'
  },
  {
    id: 'blau_fitness_game', type: CARD_TYPES.BLAU, name: 'Fitness-Trainer',
    interestPoints: { Fitness: 3 },
    direkteWirkung: { reizschwelle: 8 },
    effekt: null,
    beschreibung: 'Avatare trainieren lassen statt selbst aufzustehen — fühlt sich trotzdem produktiv an.'
  },
  {
    id: 'blau_technik_puzzle', type: CARD_TYPES.BLAU, name: 'Technik-Puzzle',
    interestPoints: { Technik: 4 },
    direkteWirkung: { reizschwelle: 10 },
    effekt: null,
    beschreibung: 'Schaltkreise löten, Code cracken, Highscore knacken — im Spiel geht das in Sekunden.'
  },
  {
    id: 'blau_achievement', type: CARD_TYPES.BLAU, name: 'Achievement freigeschaltet',
    interestPoints: { Sport: 2 },
    direkteWirkung: { reizschwelle: 12, dopamin: 10 },
    effekt: null,
    beschreibung: 'Das Symbol leuchtet auf. Etwas im Gehirn sagt: Du hast gewonnen. Du hast nicht gewonnen.'
  },
  // ROT – neue Karten
  {
    id: 'rot_rabbithole', type: CARD_TYPES.ROT, name: 'Rabbithole',
    interestPoints: {},
    direkteWirkung: { reizschwelle: 30 },
    effekt: { rabbithole: true, label: 'Rabbithole', beschreibung: 'Beim Einlegen wird Dopamin auf mindestens 50 gesetzt. Solange diese Karte aktiv ist, ändert sich Dopamin nicht.' },
    beschreibung: 'Viele Longvideos zu deinem Thema gefunden — die zieh ich mir rein!'
  },
  // GRUEN – neue Karten
  {
    id: 'gruen_geburtstag', type: CARD_TYPES.GRUEN, name: 'Neue Gruppe: Geburtstag',
    interestPoints: {},
    direkteWirkung: { sozialdrang: -25 },
    effekt: null,
    beschreibung: 'Die Party klingt nice! Lass mal zusammen was planen.'
  },
  {
    id: 'gruen_status', type: CARD_TYPES.GRUEN, name: 'Status checken',
    interestPoints: { Gossip: 2 },
    direkteWirkung: { sozialdrang: -15 },
    effekt: null,
    beschreibung: 'Erstmal schauen, was bei deinen Freunden so abgeht.'
  },
  {
    id: 'gruen_videocall', type: CARD_TYPES.GRUEN, name: 'Videocall mit Freunden',
    interestPoints: {},
    direkteWirkung: {},
    effekt: { socialFreeze: true, label: 'Sozialdrang eingefroren', beschreibung: 'Solange diese Karte im Feed ist, bleibt der Sozialdrang bei 0.' },
    beschreibung: 'Von dir habe ich ewig nichts gehört, wie geht\'s dir?'
  },
  {
    id: 'gruen_selfie_filter', type: CARD_TYPES.GRUEN, name: 'Selfie mit Filter',
    interestPoints: { Beauty: 3, Gossip: 1 },
    direkteWirkung: { sozialdrang: -10 },
    effekt: null,
    beschreibung: 'Der neue Filter macht aus jedem Schultag ein Shooting. Die Gruppe ist begeistert.'
  },
  {
    id: 'gruen_fitness_challenge', type: CARD_TYPES.GRUEN, name: 'Challenge angenommen',
    interestPoints: { Fitness: 3, Sport: 1 },
    direkteWirkung: { sozialdrang: -12 },
    effekt: null,
    beschreibung: '10.000 Schritte? Alles dabei. Der Screenshot im Chat überzeugt sofort.'
  },
  {
    id: 'gruen_technik_help', type: CARD_TYPES.GRUEN, name: 'Tech-Support im Chat',
    interestPoints: { Technik: 3 },
    direkteWirkung: { sozialdrang: -8 },
    effekt: null,
    beschreibung: 'Dein Freund hat WLAN-Probleme. Du hilfst per Chat. Bonuspunkte in der Freundschaft.'
  },
  {
    id: 'gruen_story_reaktion', type: CARD_TYPES.GRUEN, name: 'Story-Reaktion',
    interestPoints: { Gossip: 1 },
    direkteWirkung: { sozialdrang: -10, dopamin: 5 },
    effekt: null,
    beschreibung: 'Ein Emoji auf die Story — und schon läuft ein Gespräch von selbst.'
  },
  {
    id: 'gruen_sprachnachricht', type: CARD_TYPES.GRUEN, name: 'Sprachnachricht',
    interestPoints: {},
    direkteWirkung: { sozialdrang: -20 },
    effekt: null,
    beschreibung: 'Lange Sprachnachricht, viel gesagt, nichts erklärt — aber Nähe kommt trotzdem.'
  },
  // ROT – Notification-Karten
  {
    id: 'rot_viral', type: CARD_TYPES.ROT, name: 'Viraler Hit',
    interestPoints: { Film: 2, Memes: 2 },
    direkteWirkung: {},
    effekt: null,
    fähigkeit: { typ: 'notification', wirkung: { dopamin: 20 }, anzeige: '+20 Dopamin' },
    beschreibung: 'Dieser Clip geht gerade durch die Decke — und du hast ihn als Erster gesehen.'
  },
  {
    id: 'rot_schock', type: CARD_TYPES.ROT, name: 'Schock-Content',
    interestPoints: { Gossip: 2, Sport: 2 },
    direkteWirkung: {},
    effekt: null,
    fähigkeit: { typ: 'notification', wirkung: { reizschwelle: 15 }, anzeige: '+15 Reizschwelle' },
    beschreibung: 'Das sollte man eigentlich nicht sehen — aber der Feed wirft es einem hin.'
  },
  // GRUEN – Notification-Karten
  {
    id: 'gruen_like_regen', type: CARD_TYPES.GRUEN, name: 'Like-Regen',
    interestPoints: { Beauty: 1 },
    direkteWirkung: { sozialdrang: -12 },
    effekt: null,
    fähigkeit: { typ: 'notification', wirkung: { dopamin: 10, sozialdrang: -5 }, anzeige: '+10 Dopamin, -5 Sozialdrang' },
    beschreibung: 'Die Benachrichtigungen häufen sich — jeder Like stillt kurz den Drang.'
  },
  {
    id: 'gruen_unknown', type: CARD_TYPES.GRUEN, name: 'Unbekannte Nummer',
    interestPoints: { Gossip: 1 },
    direkteWirkung: { sozialdrang: -7 },
    effekt: null,
    fähigkeit: { typ: 'notification', wirkung: { dopamin: 8, sozialdrang: -10 }, anzeige: '+8 Dopamin, -6 Sozialdrang' },
    beschreibung: 'Unbekannte Nummer — gespannt warten, wer sich meldet.'
  },
  // BLAU – Notification-Karten
  {
    id: 'blau_easy_mode', type: CARD_TYPES.BLAU, name: 'Easy Mode',
    interestPoints: {},
    direkteWirkung: { reizToOptimal: 10 },
    effekt: null,
    fähigkeit: { typ: 'notification', wirkung: { reizToOptimal: 10 }, anzeige: '×2 Richtung Optimum' },
    beschreibung: 'Tutorial-Level wieder gestartet — der Kopf kann kurz abschalten.'
  },
  {
    id: 'blau_ranked', type: CARD_TYPES.BLAU, name: 'Ranked Match',
    interestPoints: {},
    direkteWirkung: { reizschwelle: 10 },
    effekt: null,
    fähigkeit: { typ: 'notification', wirkung: { sozialdrang: -10 }, anzeige: '-10 Sozialdrang' },
    beschreibung: 'Noch ein Ranked — die anderen sollen sehen, wie gut du bist.'
  },
  // WEISS – Spielmechanik-Karten
  {
    id: 'weiss_feed_reset', type: CARD_TYPES.WEISS, name: 'Neuer Feed',
    interestPoints: {}, direkteWirkung: {},
    effekt: { feedReset: true, label: 'Feed leeren', beschreibung: 'Der Feed wird geleert. Du darfst sofort 3 Karten spielen — dann läuft der Cooldown normal weiter.' },
    beschreibung: 'Zu viel Noise? Algorithmus-Reset — alles weg, neu anfangen.'
  },
  {
    id: 'weiss_event_skip', type: CARD_TYPES.WEISS, name: 'Ablenkung',
    interestPoints: {}, direkteWirkung: {},
    effekt: { eventSkip: true, label: 'Event beenden', beschreibung: 'Beendet das aktive Event sofort. Kann auch während gesperrter Events gespielt werden.' },
    beschreibung: 'Perfekte Ablenkung — der Schweinehund vergisst sofort, was er eigentlich tun wollte.'
  },
  {
    id: 'weiss_feed_copy', type: CARD_TYPES.WEISS, name: 'Kopieren',
    interestPoints: {}, direkteWirkung: {},
    effekt: { feedCopy: true, label: 'Feed-Karte kopieren', beschreibung: 'Wähle eine Karte aus dem Feed — sie kommt als Kopie auf deine Hand. Das Original bleibt.' },
    beschreibung: 'Der Algorithmus merkt sich was funktioniert — und spielt es nochmal aus.'
  },
  // WEISS – Dauerwirkung-Karten
  {
    id: 'weiss_dopamin_tick', type: CARD_TYPES.WEISS, name: 'Dopamin-Boost',
    interestPoints: {},
    direkteWirkung: {},
    effekt: { tickDelta: { dopamin: 1 }, label: 'Dopamin +1/s', beschreibung: 'Solange diese Karte im Feed ist, steigt Dopamin um +1 pro Sekunde.' },
    beschreibung: 'Das System hat einen perfekten Trigger-Moment erkannt — der Schweinehund kann nicht aufhören zu scrollen.'
  },
  {
    id: 'weiss_sozialdrang_tick', type: CARD_TYPES.WEISS, name: 'Soziale Flut',
    interestPoints: {},
    direkteWirkung: {},
    effekt: { tickDelta: { sozialdrang: -1.5 }, label: 'Sozialdrang -1,5/s', beschreibung: 'Solange diese Karte im Feed ist, sinkt der Sozialdrang um 1,5 pro Sekunde.' },
    beschreibung: 'Gruppen-Benachrichtigungen fluten den Feed — alle melden sich gleichzeitig.'
  },
  {
    id: 'weiss_reiz_tick', type: CARD_TYPES.WEISS, name: 'Overload-Modus',
    interestPoints: {},
    direkteWirkung: {},
    effekt: { tickDelta: { reizschwelle: 1 }, label: 'Reizschwelle +1/s', beschreibung: 'Solange diese Karte im Feed ist, steigt die Reizschwelle um +1 pro Sekunde.' },
    beschreibung: 'Zu viel auf einmal — der Schweinehund gewöhnt sich immer schneller an neue Reize.'
  },
];

const SPECIAL_CARD_IDS = new Set([
  'gruen_videocall',
  'blau_tilten',
  'rot_rabbithole',
  'weiss_flow',
  'weiss_feed_reset',
  'weiss_event_skip',
  'weiss_feed_copy',
]);

function getFeedSynergies() {
  const types = gameState.feedSlots.filter(Boolean).map(c => c.type);
  return {
    rainbow:     types.includes('ROT') && types.includes('GRUEN') && types.includes('BLAU'),
    tripleGruen: types.filter(t => t === 'GRUEN').length === 3,
    tripleRot:   types.filter(t => t === 'ROT').length  === 3,
    tripleBlau:  types.filter(t => t === 'BLAU').length === 3,
  };
}

let _deck = [];

function buildDeck() {
  _deck = [...CARD_DEFINITIONS].sort(() => Math.random() - 0.5);
  return _deck;
}

function drawHand() {
  while (gameState.hand.length < 5 && _deck.length > 0) {
    gameState.hand.push(_deck.shift());
    if (_deck.length === 0) buildDeck();
  }
}

function applyReizToOptimal(amount) {
  const diff = gameState.reizschwelleOptimalwert - gameState.reizschwelle;
  if (diff === 0) return;
  const step = Math.min(Math.abs(diff), amount) * Math.sign(diff);
  gameState.reizschwelle = Math.max(0, Math.min(100, gameState.reizschwelle + step));
}

function playCard(cardId) {
  const cardIdx = gameState.hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return;
  if (gameState.activeEvent) {
    const def = EVENT_DEFINITIONS.find(e => e.id === gameState.activeEvent.id);
    if (!def?.allowCards && !gameState.hand[cardIdx].effekt?.eventSkip) return;
  }
  gameState.secondsSinceLastCard = 0;
  const [card] = gameState.hand.splice(cardIdx, 1);

  for (const [stat, delta] of Object.entries(card.direkteWirkung ?? {})) {
    if (stat in gameState) {
      gameState[stat] = Math.max(0, Math.min(100, gameState[stat] + delta));
    }
  }
  if (card.direkteWirkung?.reizToOptimal) {
    applyReizToOptimal(card.direkteWirkung.reizToOptimal);
  }

  // FOMO: Messenger-Karten reduzieren Sozialdrang doppelt
  if (card.type === CARD_TYPES.GRUEN && gameState.activeEvent?.id === 'fomo') {
    const delta = card.direkteWirkung?.sozialdrang ?? 0;
    if (delta < 0) {
      gameState.sozialdrang = Math.max(0, Math.min(100, gameState.sozialdrang + delta));
    }
  }

  if (card.effekt?.swapHand) {
    gameState.hand = [];
    drawHand();
    return;
  }

  if (card.effekt?.feedReset) {
    gameState.feedSlots = [null, null, null];
    gameState.freeCardPlays = 3;
    drawHand();
    return;
  }

  if (card.effekt?.eventSkip) {
    if (gameState.activeEvent) endActiveEvent();
    drawHand();
    return;
  }

  if (card.effekt?.feedCopy) {
    if (gameState.feedSlots.some(Boolean)) {
      gameState.feedCopyMode = true;
    } else {
      drawHand();
    }
    renderFeed();
    return;
  }

  if (card.fähigkeit?.typ === 'notification') {
    const sameTypeInFeed = gameState.feedSlots.some(s => s?.type === card.type);
    if (!sameTypeInFeed) {
      for (const [stat, delta] of Object.entries(card.fähigkeit.wirkung)) {
        if (stat in gameState) {
          gameState[stat] = Math.max(0, Math.min(100, gameState[stat] + delta));
        }
      }
      if (card.fähigkeit.wirkung.reizToOptimal) {
        applyReizToOptimal(card.fähigkeit.wirkung.reizToOptimal);
      }
      showNotifBadge(TYPE_ICONS[card.type] ?? '🔔', card.fähigkeit.anzeige);
    }
  }

  gameState.feedCopyMode = false;

  gameState.feedSlots.shift();
  gameState.feedSlots.push(card);

  if (card.effekt?.rabbithole) {
    gameState.dopamin = Math.max(50, gameState.dopamin);
  }

  drawHand();
}
