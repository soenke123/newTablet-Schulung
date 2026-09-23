/* Session-Stub + Spielstand-Seed für die Prüfstände (responsivecheck.js,
 * probe375.js). Läuft VOR allen Seiten-Skripten.
 *
 * Warum überhaupt: der GameHub springt ohne Login auf die Landing zurück.
 * Und session.js kommt ohne echtes Supabase nicht durch seinen IIFE — dann
 * wäre isLoggedIn undefined, was auf dasselbe hinausläuft. Deshalb werden
 * die Session-Funktionen hier selbst gestellt.
 *
 * Der DOMContentLoaded-Listener unten wird als ERSTER registriert und läuft
 * deshalb vor dem der Seite. Das ist der Trick: zu diesem Zeitpunkt sind
 * creatures.js und script.js geparst (ihre Server-Lader existieren also),
 * aber der await-Reigen der Seite ist noch nicht gelaufen.
 */
(() => {
  const USER = {
    id: 'stub-user-0001',
    account_name: 'testkind',
    // Absichtlich lang: genau daran wächst die HUD-Pille.
    display_name: 'Maximilian Mustermann',
    avatar_id: null,
    is_admin: false,
    season: 3,
    school_id: 'stub-school',
    cluster_id: 'stub-cluster',
    avatars_seen_at: new Date().toISOString(),
  };

  // hashString + saveStorage aus creatures.js nachgebaut — der Spielstand
  // liegt base64-kodiert mit Prüfsumme, ein nackter JSON-Seed würde beim
  // Lesen verworfen.
  const hashString = (str) => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const put = (key, data) => {
    const json = JSON.stringify(data);
    localStorage.setItem(key, btoa(JSON.stringify({ d: data, h: hashString(json) })));
  };

  const gd = (creature, growth, coins, points) =>
    ({ points, roundsPlayed: 4, creature, growth, coins });

  put('lernwelt_v3', {
    game20: gd('snail', 100, 10, 40),
    game7:  gd('turtle', 60, 25, 120),
    game3:  gd('chicken', 100, 30, 200),
    game8:  gd('fish', 40, 15, 80),
    game9:  gd('salamander', 80, 20, 150),
    game10: gd('dragon', 100, 45, 300),
    game11: gd('butterfly', 100, 35, 260),
    game12: gd('robot', 60, 20, 140),
    game15: gd('pfau', 100, 40, 280),
    game14: gd('triceratops', 20, 10, 60),
    game16: { ...gd('einhornkatze', 100, 50, 0), variant: 'rainbow' },
    game18: gd('snaildragon', 100, 30, 900),
    game17: gd('falkeneule', 80, 25, 170),
    game19: gd('libelle', 100, 20, 90),
    // growth 0 = frisch geschlüpftes Baby (stage 0). Muss im Seed sein:
    // die Galerie behandelt stage-0-Tiere als STEHEND, und genau dieser
    // Zweig wird in initGalleryWalk/_walkStep anders behandelt.
    game21: gd('fish', 0, 15, 75),
  });

  // Zwei Nester, damit die Nest-Sektion nicht leer bleibt — sie nutzt
  // dasselbe .games-grid wie die Spiele und muss mitgemessen werden.
  put('lernwelt_shop_v1', {
    bankedCoins: 320, kristalle: 12, kristalleSpent: 0,
    book: true,
    nests: [
      { nestId: 'nest_stub_1', eggType: 'normal', gameId: 'game7', gameUrl: 'S1 EscapeGame/index.html' },
      { nestId: 'nest_stub_2', eggType: 'gold',   gameId: 'game3', gameUrl: 'S1 DateiformatQuiz/index.html' },
    ],
    avatarUnlocks: {}, openedSealTypes: [],
    releasedNestIds: [], lootboxDailyClaimed: {},
  });
  localStorage.setItem('lernwelt_season', '3');

  // Das Season-Modal geht beim Start von selbst auf (3-Tage-Kühlung) und
  // legt sich über den ganzen Hub — die Startansicht wäre sonst nie zu
  // sehen. Stempel setzen; geprüft wird das Modal im eigenen Zustand.
  const now = String(Date.now());
  localStorage.setItem(`season_modal_seen_s2_${USER.id}`, now);
  localStorage.setItem(`season_modal_seen_s3_${USER.id}`, now);

  const install = () => {
    window.__session      = USER;
    window.isLoggedIn     = () => true;
    window.getSessionUser = () => USER;
    window.getUserSeason  = () => 3;
    window.waitForSession = () => Promise.resolve(USER);
    /* Ohne diese zwei Zeilen ist JEDE Kachel 'admin_locked' (getGameAccess
       → isGameOpenForCluster). Gemessen würde dann das Schloss-Layout —
       und damit nie das, was ein Kind wirklich sieht: Play-Knopf,
       Fortschrittsbalken, Hints, Freilassen. */
    window.isGameOpenForCluster = () => true;
    window.__bonbonStatus = {
      enabled: true, unlocked: true, total: 500, goal: 500,
      daily_claimed: false, milestones: [], members: [],
    };
    window.getBonbonStatus = () => window.__bonbonStatus;
    window.getClusterJokerStatus = () => null;
    window.escapeHtml = window.escapeHtml || (s => String(s ?? '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

    // Alles, was den Server fragen würde, auf No-Op. Sonst bricht der
    // await-Reigen im DOMContentLoaded der Seite ab und renderHub()
    // wird nie erreicht.
    for (const fn of [
      'pushPendingState', 'refreshUnlockedFromServer', 'initAdminClusters',
      'refreshClusterGamesFromServer', 'loadServerState', 'loadServerShop',
      'loadGiftTasks', 'loadWinTaskStatus', 'loadVirusProgress', 'syncHighscores',
      'fetchDailyBonbonStatus', 'syncStartupStory', 'syncRealityCheck',
      'syncWordcloud', 'refreshBonbonStatus', 'refreshClusterJokerStatus',
      'pushLocalHighscoresToServer', 'pushShopNow', 'syncShopStateToServer',
      'claimBonbonMilestone', 'loadServerLeaderboard',
    ]) window[fn] = async () => null;
  };

  install();
  document.addEventListener('DOMContentLoaded', install);
  window.addEventListener('load', install);
})();
