/* Ereigniskarten — Phase 4.
   ═══════════════════════════════════════════════════════════════════════
   Ab PHASE4_USER_THRESHOLD Usern ist die Plattform groß genug, dass die
   Welt zurückschaut. Alle EVENT_ROUND_SEC Sekunden liegen drei VERDECKTE
   Karten auf dem Tisch; der Spieler deckt genau eine auf und entscheidet.

   Die drei tragenden Regeln (aus dem Prototyp übernommen, dort gemessen):

     1. Was NICHT gewählt wird, geht UNGESEHEN zurück ins Deck. Es gibt
        keine Vorschau — eine schlechte Karte zu ziehen ist Pech, kein
        Fehler. Gespielte Chancen kommen nie wieder.

     2. Jede Entscheidung SEEDET Folgekarten: sie wandern ins Deck und
        werden danach ganz normal zufällig gezogen. Wer oft schlecht
        entscheidet, hat ein volleres Krisen-Deck — die Strafe ist eine
        Wahrscheinlichkeit, kein Skript.

     3. Eine ausgesessene Krise BLEIBT LIEGEN und belegt einen der drei
        Plätze. Solange sie liegt, läuft ihr Malus, und man zieht eine
        Karte weniger. Nach `runden` greift `ende`.

   ⚠️ Beträge stehen in den Daten als PROZENT VOM FIRMENWERT und werden
   beim Auflegen in eine feste Zahl übersetzt (betraegeFuer). Sie dürfen
   sich nicht ändern, während der Spieler die Karte liest.

   Die Wirkungen hängen an den echten Systemen: dauerhafte Trend-Schuld
   geht in state.trendBaseMods(), Watchtime-Faktoren in
   watchtimeMultMods(), networkK in networkKMods(). Dadurch tauchen sie
   ohne Zusatzarbeit in den Aufschlüsselungs-Modalen auf, die es schon
   gibt — genau da, wo der Spieler seine Zahlen sowieso nachliest. */
(function (RT) {
  'use strict';

  // ── Konstanten ────────────────────────────────────────────────────────
  var ROUND_SEC   = 180;   // 3 Minuten zwischen zwei Runden
  // Vorlauf bis zur ALLERERSTEN Runde. Kürzer als eine normale Runde, damit
  // Phase 4 nicht mit einer vollen Runde Leerlauf anfängt — aber nicht null: sonst
  // liegt der Tisch in der Sekunde auf dem Bildschirm, in der die Erklär-Tour
  // zugeht, und der Spieler entscheidet, bevor er die Regeln verdaut hat.
  var FIRST_ROUND_SEC = 60;
  var TABLE_SLOTS = 3;
  // € je User im Firmenwert. Bewusst klein: die Beträge auf den Karten
  // sind Prozente davon, und bei 50 € war die Hälfte davon unbezahlbar.
  var USER_WERT   = 2;
  // Laufzeit der befristeten Karten-Buffs (Preiskampf, Kampagnenplatz).
  var BUFF_SEC    = 600;
  // Wie lange ein Karten-Trend-Bonus voll anliegt, bevor er abklingt —
  // dieselbe Haltezeit wie ein eingesammelter Techtree-Node.
  function holdSec() { return RT.state.TREND_HOLD_NODE_SEC || 60; }

  // Zeitpunkt des letzten Ticks — nur dafür da, die Uhr während einer
  // Erklär-Tour mitzuschieben (siehe tick()). Bewusst NICHT im Spielstand:
  // über einen Neustart hinweg gibt es keine laufende Tour.
  var _lastTick = 0;

  // Die Dark Patterns, die Sogwirkung haben — nur die kann das Gericht im
  // Jugendschutz-Urteil abschalten lassen. Ids aus js/techtree.js.
  var DARK_WT = ['infiniteScroll', 'autoplay', 'ki_collab', 'ki_sog'];

  // ── Formate ───────────────────────────────────────────────────────────
  var F = RT.ledger ? RT.ledger.fmt : null;
  function euro(v) {
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2).replace('.', ',') + ' Mrd €';
    if (a >= 1e6) return s + Math.round(a / 1e6).toLocaleString('de-DE') + ' Mio €';
    if (a >= 1e3) return s + Math.round(a / 1e3).toLocaleString('de-DE') + ' Tsd €';
    return s + Math.round(a).toLocaleString('de-DE') + ' €';
  }
  function tr(v)  { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ','); }
  function pct(v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(v % 1 ? 1 : 0).replace('.', ',') + ' %'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Chips ─────────────────────────────────────────────────────────────
  var D = {
    trend: function (v, r) { return { k: 'trend', t: '⭐ ' + tr(v) + (r ? ' / ' + r + ' Runden' : '') }; },
    perm:  function (v)    { return { k: 'perm',  t: '🔒 ' + tr(v) + ' dauerhaft' }; },
    wt:    function (v)    { return { k: 'wt',    t: '∞ Watchtime ×' + v.toFixed(2).replace('.', ',') }; },
    wtl:   function (p)    { return { k: 'wt',    t: '⏳ Lager ' + pct(p) }; },
    user:  function (p)    { return { k: 'user',  t: '👥 User ' + pct(p) }; },
    netk:  function (v)    { return { k: 'gut',   t: '∞ Netzwerk-Steigung +' + v.toFixed(2).replace('.', ',') }; },
    meta:  function (p)    { return { k: 'wt',    t: '🗃️ Metadaten ' + pct(p) }; },
    platz: function (t)    { return { k: 'user',  t: '📣 ' + t }; },
    txt:   function (t)    { return { k: '',      t: t }; },
    gut:   function (t)    { return { k: 'gut',   t: t }; }
  };
  // Eine geseedete Karte wandert INS DECK und wird danach zufällig gezogen.
  // `ab` = frühestens so viele Runden später.
  function seed(id, p, ab) { return { id: id, p: p, ab: ab || 1 }; }

  // ── Zustandsabfragen an das echte Spiel ───────────────────────────────
  function nodeDone(id) { return RT.state.nodeDone(id); }
  function darkDone() {
    var nodes = (RT.techtree && RT.techtree.NODES) || {}, out = [];
    for (var nid in nodes) {
      if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
      if (!nodes[nid].darkPattern) continue;
      if (nodeDone(nid)) out.push(nodes[nid]);
    }
    return out;
  }
  // Die abschaltbaren Sog-Features, in fester Reihenfolge — das Gericht
  // greift sich das erste. Feste Reihenfolge, damit die Karte vorher sagen
  // kann, was verschwindet.
  function darkWtDone() {
    var nodes = (RT.techtree && RT.techtree.NODES) || {}, out = [];
    for (var i = 0; i < DARK_WT.length; i++) {
      if (nodes[DARK_WT[i]] && nodeDone(DARK_WT[i])) out.push(nodes[DARK_WT[i]]);
    }
    return out;
  }
  function users()      { return RT.state.current.users || 0; }
  function firmenwert() { return (RT.state.current.money || 0) + users() * USER_WERT; }
  function kapaFrei()   { return RT.state.freeUserCapacity() > 0; }
  function farmUnversorgt() {
    return RT.state.serverTroubleReasons().indexOf('supply') >= 0;
  }

  /* ═══════════════════════════════════════════════════════════════════
     DAS DECK
     art:      'chance' | 'krise'
     cond:     Ziehbarkeit (nur für nicht-geseedete Karten)
     condTxt:  die Begründung — steht in der Übersicht
     liegt:    Trend-Malus, solange die Krise offen liegt
     liegtTxt: zusätzlicher Malus in Worten (wenn er nicht am Trend hängt)
     runden:   wie viele Runden sie liegt, bevor `ende` greift
     ende:     'weg'     — klingt ab, erledigt
               'zurueck' — vom Tisch, aber zurück ins Deck (Ursache besteht)
               'zwang'   — Frist abgelaufen, zwangOpt wird vollstreckt
     wiederkehrend: nach so vielen Runden zurück ins Deck, statt endgültig
               verbraucht zu sein
     bild:     optionaler Sprite-Pfad, z. B. 'sprites/events/lobbyist.png'

     ⚠️ ZU `wiederkehrend`: Die Grundregel ist „gespielte Karten kommen nicht
     wieder". Ohne Ausnahme läuft das Deck aber nach gut 25 Runden leer
     (gemessen) — und Phase 4 ist das Endspiel, dort soll es nicht still
     werden. Die Ausnahme gilt deshalb genau für die Karten, bei denen ein
     zweites Mal auch inhaltlich stimmt: es kommt eine ANDERE Journalistin,
     eine ANDERE Katastrophe, ein ANDERER Käufer. Karten mit eigener
     Fortsetzung (Lobbyist → Das bessere Angebot), einmalige Angebote
     (Marcus) und alle geseedeten Folgekarten bleiben einmalig — sonst
     verlöre die Kette ihre Bedeutung.
     ═══════════════════════════════════════════════════════════════════ */
  var CARDS = {

  /* ─── CHANCEN ──────────────────────────────────────────────────── */
  lobby: { art: 'chance', icon: '🎭', name: 'Der Lobbyist',
    text: 'Eine politische Gruppe will ihre Themen bevorzugt ausgespielt bekommen.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Annehmen', geld: +1, wtMult: 1.10, trendBase: -0.5,
        fx: [D.perm(-0.5), D.wt(1.10)], seed: [seed('shitstorm_lobby', 0.85, 1)] },
      { name: 'Ablehnen', fx: [D.txt('nichts')], seed: [seed('lobby_besser', 1, 1)] },
      { name: 'Öffentlich machen', trend: +4, fx: [D.trend(4), D.gut('Angebot endgültig weg')] }
    ] },

  lobby_besser: { art: 'chance', icon: '🎭', name: 'Das bessere Angebot', nurGeseedet: true,
    text: 'Er kommt mit dem Dreifachen zurück. „Überlegen Sie es sich nochmal."',
    opts: [
      { name: 'Annehmen', geld: +3, wtMult: 1.10, trendBase: -1.0,
        fx: [D.perm(-1.0), D.wt(1.10)], seed: [seed('shitstorm_lobby', 1, 1)] },
      { name: 'Endgültig ablehnen', trend: +2,
        fx: [D.trend(2), D.gut('du bleibst standhaft — das spricht sich herum')] }
    ] },

  daten: { art: 'chance', icon: '💰', name: 'Daten verkaufen', wiederkehrend: 8,
    text: 'Ein Werbekonzern will eine Auswertung eures Datenbestands kaufen.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Verkaufen', geld: +2,
        fx: [D.gut('deine Daten bleiben bei dir — du verkaufst eine Kopie')],
        seed: [seed('shitstorm_daten', 0.85, 1)] },
      { name: 'Nur anonymisiert', geld: +1,
        fx: [D.gut('weniger Geld, weniger Angriffsfläche')],
        seed: [seed('shitstorm_daten', 0.50, 1)] },
      { name: 'Ablehnen', fx: [D.txt('nichts')] }
    ] },

  konkurrent: { art: 'chance', icon: '🏢', name: 'Konkurrent steht zum Verkauf', wiederkehrend: 10,
    text: 'Eine kleinere Plattform sucht einen Käufer.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Kaufen', geld: -10, userPct: +8,
        fx: [D.user(8), D.txt('⚠️ ohne freie Kapazität sofort „Serverprobleme"')],
        dyn: function () { return kapaFrei() ? [] : [D.trend(-2, 3)]; },
        serverRisk: true },
      { name: 'Kaufen und zerschlagen', geld: -6, userPct: +4, trend: -2,
        fx: [D.user(4), D.trend(-2)] },
      { name: 'Ablehnen', fx: [D.txt('nichts')], seed: [seed('konkurrent_stark', 0.70, 2)] }
    ] },

  hilfe: { art: 'chance', icon: '🌱', name: 'Hilfsorganisation bittet um Reichweite', wiederkehrend: 8,
    text: 'Eine Spendenorganisation fragt, ob sie auf eurer Plattform sichtbar sein darf.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Prominent platzieren', networkK: 0.1, prSlot: true,
        fx: [D.platz('1 Kampagnenplatz / 10 min'), D.netk(0.1)] },
      { name: 'Klein im Feed', trend: +1.5, fx: [D.trend(1.5)] },
      { name: 'Ablehnen', fx: [D.txt('nichts')], seed: [seed('shitstorm_hilfe', 0.50, 1)] }
    ] },

  spende: { art: 'chance', icon: '💰', name: 'Spendenaufruf', wiederkehrend: 6,
    text: 'Nach einer Katastrophe fragen Medien, ob euer Konzern etwas beiträgt.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Große Spende', geld: -1, trend: +3, fx: [D.trend(3)] },
      { name: 'Kleine Spende', geld: -0.5, trend: +1.5, fx: [D.trend(1.5)] },
      { name: 'Nichts tun', fx: [D.txt('nichts — und das ist hier in Ordnung')] }
    ] },

  kanal: { art: 'chance', icon: '🎭', name: 'Ein zugespitzter Kanal wächst rasant',
    text: 'Sehr scharfe Meinungen, sehr hohe Verweildauer. Soll der Algorithmus ihn hochspülen?',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Empfehlen', wtMult: 1.15, trendBase: -1.0,
        fx: [D.wt(1.15), D.perm(-1.0)], seed: [seed('shitstorm_radikal', 0.90, 1)] },
      { name: 'Laufen lassen', wtLager: +25, fx: [D.wtl(+25)],
        seed: [seed('shitstorm_radikal', 0.50, 1)] },
      { name: 'Sperren', trend: +2, wtLager: -10, fx: [D.trend(2), D.wtl(-10)] }
    ] },

  /* Das Porträt erscheint in JEDEM Fall — die Frage ist nur, wie du darin
     vorkommst. „Nichts" ist hier keine Option, das wäre unehrlich. */
  presse: { art: 'chance', icon: '📰', name: 'Journalistin bittet um ein Interview', wiederkehrend: 8,
    text: 'Ein großes Magazin schreibt ein Porträt über deine Plattform. Mit dir oder ohne dich.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Offen antworten',
        dynTrend: function () { return darkDone().length >= 3 ? -2 : 2.5; },
        dyn: function () {
          return darkDone().length >= 3
            ? [D.trend(-2), D.txt('„die Fragen waren andere als erwartet" — 3+ Dark Patterns')]
            : [D.trend(2.5), D.gut('ein freundliches Porträt')];
        } },
      { name: 'Ausweichen', trend: -1,
        fx: [D.trend(-1), D.txt('es erscheint trotzdem — dünn und distanziert')] },
      { name: 'Ablehnen', trend: -1.5,
        fx: [D.trend(-1.5), D.txt('„wollte sich nicht äußern" steht dann da')],
        seed: [seed('presse_recherche', 0.50, 2)] }
    ] },

  team: { art: 'chance', icon: '👥', name: 'Das Team fordert bessere Bedingungen',
    text: 'Die Entwicklung arbeitet seit Monaten am Anschlag.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Zustimmen', geld: -2, networkK: 0.05, trend: +2, fx: [D.netk(0.05), D.trend(2)] },
      { name: 'Teilweise', geld: -1, fx: [D.txt('vorerst Ruhe')] },
      { name: 'Ablehnen', fx: [D.txt('nichts')], seed: [seed('streik', 0.60, 1)] }
    ] },

  dsgvo_warnung: { art: 'chance', icon: '⚖️', name: 'Neue Datenschutzregel angekündigt',
    text: 'Die Aufsicht kündigt schärfere Regeln an. Ihr könnt vorher reagieren.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Freiwillig anpassen', metaPct: -20,
        fx: [D.meta(-20), D.gut('immun gegen die DSGVO-Strafe')], immun: 'dsgvo_strafe' },
      { name: 'Abwarten', fx: [D.txt('nichts — vorerst')],
        dynSeed: function () {
          return [seed('dsgvo_strafe',
            (nodeDone('ki_profile') || nodeDone('ki_collab')) ? 0.70 : 0.50, 2)];
        } }
    ] },

  marcus: { art: 'chance', icon: '💼', name: 'Marcus will nachlegen',
    text: 'Dein alter Investor bietet eine zweite Runde an — er erwartet dafür Wachstum.',
    cond: function () { return true; }, condTxt: 'ab Phase 4',
    opts: [
      { name: 'Annehmen', geld: +10, seed: [seed('investor_druck', 1, 3)] },
      { name: 'Ablehnen', fx: [D.txt('nichts')] }
    ] },

  /* ─── KRISEN ───────────────────────────────────────────────────── */
  shitstorm_lobby: { art: 'krise', icon: '🔥', name: 'Shitstorm: gekaufte Meinung',
    nurGeseedet: true, liegt: -6, runden: 3, ende: 'weg',
    ursache: 'deine Entscheidung beim Lobbyisten',
    text: 'Der Deal ist durchgesickert. #gekauft trendet seit zwei Stunden.',
    opts: 'SHITSTORM' },
  shitstorm_daten: { art: 'krise', icon: '🔥', name: 'Shitstorm: Datenverkauf',
    nurGeseedet: true, liegt: -6, runden: 3, ende: 'weg',
    ursache: 'deine Entscheidung „Daten verkaufen"',
    text: 'Ein Blog hat den Käufer identifiziert. Die Empörung läuft.',
    opts: 'SHITSTORM' },
  shitstorm_radikal: { art: 'krise', icon: '🔥', name: 'Shitstorm: Radikalisierung',
    nurGeseedet: true, liegt: -6, runden: 3, ende: 'weg',
    ursache: 'der hochgespülte Kanal',
    text: 'Der Kanal ist eskaliert. Werbekunden fragen nach.',
    opts: 'SHITSTORM' },
  shitstorm_hilfe: { art: 'krise', icon: '🔥', name: 'Shitstorm: „kein Herz"',
    nurGeseedet: true, liegt: -6, runden: 3, ende: 'weg',
    ursache: 'die abgelehnte Hilfsorganisation',
    text: 'Die Absage wurde öffentlich gemacht.',
    opts: 'SHITSTORM' },
  zweiter_anlauf: { art: 'krise', icon: '🔥', name: 'Shitstorm: zweiter Anlauf',
    nurGeseedet: true, liegt: -6, runden: 3, ende: 'weg',
    ursache: 'deine Gegenkampagne kam schlecht an',
    text: 'Die Kampagne wirkte gekauft — jetzt geht es erst richtig los.',
    opts: 'SHITSTORM' },
  greenwashing_fliegt_auf: { art: 'krise', icon: '🔥', name: 'Greenwashing aufgeflogen',
    nurGeseedet: true, liegt: -6, runden: 3, ende: 'weg',
    ursache: 'deine Greenwashing-Kampagne',
    text: 'Recherchen zeigen: an den Servern hat sich nichts geändert.',
    opts: 'SHITSTORM' },
  vertuschung_fliegt_auf: { art: 'krise', icon: '🔥', name: 'Vertuschung aufgeflogen',
    nurGeseedet: true, liegt: -9, runden: 3, ende: 'weg',
    ursache: 'du hast das Datenleck verschwiegen',
    text: 'Interne Mails sind öffentlich. Das wiegt schwerer als das Leck selbst.',
    opts: 'SHITSTORM' },

  presse_recherche: { art: 'krise', icon: '📰', name: 'Die Recherche kam trotzdem',
    nurGeseedet: true, liegt: -4, runden: 2, ende: 'weg',
    ursache: 'du hast das Interview abgelehnt',
    text: 'Sie haben ohne dich geschrieben — und mit deinen Ex-Mitarbeitern gesprochen.',
    opts: [
      { name: 'Jetzt doch Stellung nehmen', geld: -1, fx: [D.gut('sofort weg')], loesen: true },
      { name: 'Schweigen', fx: [D.txt('läuft aus')], loesen: false }
    ] },

  jugendschutz: { art: 'krise', icon: '⚖️', name: 'Verurteilt: Jugendschutz', wiederkehrend: 10,
    liegt: -3, runden: 3, ende: 'zwang', zwangOpt: 0, zwangFaktor: 2,
    zwangTxt: 'Frist abgelaufen — die Strafe wird vollstreckt, doppelt.',
    cond: function () { return darkWtDone().length > 0; },
    condTxt: 'braucht ein Sog-Feature (Autoplay, Infiniter Scroll, …)',
    ursacheDyn: function () {
      return darkWtDone().map(function (d) { return d.name; }).join(' · ');
    },
    text: 'Ein Gericht sieht die Sogwirkung eurer Oberfläche als jugendgefährdend an.',
    opts: [
      { name: 'Strafe zahlen', geld: -5, fx: [D.gut('Sache erledigt')], loesen: true },
      { name: 'Berufung', geld: -2,
        fx: [D.txt('die Frist läuft weiter — danach wird doppelt vollstreckt')], loesen: false },
      { name: 'Feature abschalten', abschalten: true,
        fx: [D.gut('das Sog-Feature wird deaktiviert'),
             D.txt('Watchtime fällt, die dauerhafte Trend-Schuld kommt zurück')],
        loesen: true }
    ] },

  bots: { art: 'krise', icon: '🤖', name: 'Bot-Netzwerke',
    liegt: -4, runden: 3, ende: 'zurueck',
    cond: function () { return !nodeDone('moderation'); },
    condTxt: 'kein Moderations-Team',
    ursache: 'fehlendes Moderations-Team',
    text: 'Zehntausende Konten verbreiten koordiniert extreme Inhalte.',
    opts: [
      { name: 'Bots löschen', userPct: -10, fx: [D.user(-10), D.txt('die Bots zählten als User')],
        loesen: true, wieder: 4 },
      { name: 'Externe Firma beauftragen', geld: -3,
        fx: [D.txt('Ruhe für 8 Runden — dann sind sie zurück')], loesen: true, wieder: 8 },
      // Bots vermehren sich. Aussitzen ist die einzige Option, bei der der
      // Malus WÄCHST statt nur zu laufen — sonst wäre Ignorieren gratis.
      { name: 'Ignorieren', fx: [D.trend(-4), D.txt('und jede Runde −2,0 schlimmer')],
        loesen: false, proRunde: { liegt: -2 } }
    ] },

  umwelt: { art: 'krise', icon: '🌍', name: 'Umweltkritik',
    liegt: -2.5, runden: 4, ende: 'zurueck',
    cond: function () { return !nodeDone('en_erneuerbar'); },
    condTxt: 'große Serverlast ohne Erneuerbare Energien',
    ursache: 'hohe Tarifstufe ohne Erneuerbare Energien',
    text: 'Eine Studie rechnet den Stromverbrauch eurer Farmen öffentlich vor.',
    opts: [
      { name: 'Umstellen', geld: -5, erneuerbar: true,
        fx: [D.gut('Erneuerbare Energien stehen — die Karte ist raus')], loesen: true },
      { name: 'Greenwashing-Kampagne', geld: -1, fx: [D.txt('Ruhe für 5 Runden')],
        loesen: true, wieder: 5, seed: [seed('greenwashing_fliegt_auf', 0.50, 3)] },
      { name: 'Aussitzen', fx: [D.txt('läuft aus — kommt wieder, solange nichts umgestellt ist')],
        loesen: false }
    ] },

  datenleck: { art: 'krise', icon: '🔓', name: 'Datenleck', wiederkehrend: 8,
    liegt: -5, runden: 3, ende: 'weg',
    cond: function () { return nodeDone('ki_profile') && !nodeDone('api'); },
    condTxt: 'Profilbildung ohne Offene Schnittstelle',
    ursache: 'Profilbildung ohne geprüfte Schnittstellen',
    text: 'Ein ungesicherter Server hat Profildaten offen im Netz stehen lassen.',
    opts: [
      { name: 'Öffentlich informieren', geld: -2, metaPct: -60,
        fx: [D.meta(-60), D.gut('sofort weg')], loesen: true },
      { name: 'Vertuschen', metaPct: -60, fx: [D.meta(-60), D.gut('sofort weg')], loesen: true,
        seed: [seed('vertuschung_fliegt_auf', 0.50, 2)] }
    ] },

  dsgvo_strafe: { art: 'krise', icon: '⚖️', name: 'DSGVO-Strafe', nurGeseedet: true,
    liegt: -2, runden: 2, ende: 'zwang', zwangOpt: 0, zwangFaktor: 1,
    zwangTxt: 'Das Bußgeld wird eingezogen.',
    ursache: 'du hast bei der Ankündigung abgewartet',
    text: 'Das Bußgeld ist rechtskräftig. Es gibt nichts zu verhandeln.',
    opts: [
      { name: 'Zur Kenntnis genommen', geld: -5, fx: [D.txt('ein Knopf, kein Ausweg')], loesen: true },
      { name: 'Ratenzahlung', trend: -2,
        fx: [D.trend(-2, 3), D.txt('immer drückbar, auch bei leerer Bank')], loesen: true }
    ] },

  streik: { art: 'krise', icon: '👥', name: 'Streik', nurGeseedet: true,
    liegt: 0, liegtTxt: 'alle Entwicklungs-Plätze stehen still', runden: 3, ende: 'weg',
    ursache: 'du hast die Forderungen abgelehnt',
    text: 'Die Entwicklung legt die Arbeit nieder. Laufende Entwicklungen stehen.',
    opts: [
      { name: 'Nachgeben', geld: -2, fx: [D.gut('sofort weg')], loesen: true },
      { name: 'Aussitzen', fx: [D.txt('3 Runden ohne Entwicklung')], loesen: false }
    ] },

  konkurrent_stark: { art: 'krise', icon: '🏢', name: 'Der Konkurrent wird stark',
    nurGeseedet: true, liegt: 0, liegtTxt: '−2 % User pro Runde', runden: 4, ende: 'weg',
    ursache: 'du hast den Kauf abgelehnt',
    text: 'Er hat frisches Geld bekommen und wirbt eure User ab.',
    opts: [
      { name: 'Jetzt teurer kaufen', geld: -15, userPct: +8, fx: [D.user(8)], loesen: true },
      { name: 'Preiskampf', geld: -2, adMalus: true,
        fx: [D.txt('Werbeerlöse −40 % für 10 min')], loesen: true },
      { name: 'Aussitzen', fx: [D.user(-2), D.txt('−2 % User pro Runde, 4 Runden')],
        loesen: false, proRunde: { userPct: -2 } }
    ] },

  zensur: { art: 'krise', icon: '🎭', name: 'Eine Regierung fordert Löschungen', wiederkehrend: 10,
    liegt: -2, runden: 3, ende: 'zwang', zwangOpt: 1, zwangFaktor: 1,
    zwangTxt: 'Keine Antwort ist auch eine Antwort — das Land sperrt euch.',
    cond: function () { return users() >= 100e6; }, condTxt: 'ab 100 Mio Usern',
    ursache: '— Pech. Das trifft jede große Plattform.',
    text: 'Ein Staat verlangt, Beiträge einer Oppositionsbewegung zu entfernen.',
    opts: [
      { name: 'Nachgeben', trendBase: -1.0, fx: [D.perm(-1.0)], loesen: true },
      { name: 'Verweigern', userPct: -12, trend: +3,
        fx: [D.user(-12), D.trend(3), D.txt('das Land sperrt euch')], loesen: true }
    ] },

  serverausfall: { art: 'krise', icon: '💥', name: 'Serverausfall', wiederkehrend: 6,
    liegt: 0, liegtTxt: 'halbe Watchtime-Produktion', runden: 2, ende: 'zurueck',
    cond: function () { return farmUnversorgt(); }, condTxt: 'braucht unversorgte Farmen',
    ursache: 'unversorgte Serverfarmen',
    text: 'Eine Farm ist ausgefallen. Die Produktion bricht ein.',
    opts: [
      { name: 'Sofort reparieren', geld: -2, fx: [D.gut('sofort weg')], loesen: true, wieder: 3 },
      { name: 'Aussitzen', fx: [D.wtl(-50), D.txt('2 Runden halbe Produktion')], loesen: false }
    ] },

  investor_druck: { art: 'krise', icon: '💼', name: 'Marcus will Zahlen sehen',
    nurGeseedet: true, liegt: -2, runden: 3, ende: 'weg',
    ursache: 'du hast sein Geld genommen',
    text: '„Ich sehe kein Wachstum. Wir hatten eine Abmachung."',
    opts: [
      // 10 % des Firmenwerts für 15 % aller künftigen Werbeerträge — die
      // einzige Karte, die eine dauerhafte Belastung wirklich abschafft.
      // Sie soll teuer sein und sich trotzdem lohnen; genau das ist der
      // Unterschied zwischen einer Strafe und einer Investition.
      { name: 'Anteile zurückkaufen', geld: -10, investorOut: true,
        fx: [D.gut('er ist raus — 15 % Werbeabzug fallen weg')], loesen: true },
      { name: 'Vertrösten', fx: [D.txt('bleibt 3 Runden')], loesen: false }
    ] }
  };

  // Der Shitstorm-Optionssatz — sieben Karten teilen ihn sich.
  var SHITSTORM_OPTS = [
    { name: 'Entschuldigen', geld: -1, fx: [D.gut('sofort weg')], loesen: true },
    { name: 'Gegenkampagne', geld: -3, fx: [D.gut('sofort weg')], loesen: true,
      seed: [seed('zweiter_anlauf', 0.50, 1)] },
    { name: 'Aussitzen', fx: [D.txt('läuft die vollen 3 Runden')], loesen: false }
  ];
  for (var _id in CARDS) {
    if (!Object.prototype.hasOwnProperty.call(CARDS, _id)) continue;
    CARDS[_id].id = _id;
    if (CARDS[_id].opts === 'SHITSTORM') CARDS[_id].opts = SHITSTORM_OPTS;
  }

  /* ═══════════════════════════════════════════════════════════════════
     ZUSTAND
     Liegt vollständig im Spielstand (s.events) — inklusive nextAt als
     absolutem Zeitstempel. Dadurch stimmt die Uhr nach einer Pause von
     allein, genau wie bei den Trend-Modifikatoren.
     ═══════════════════════════════════════════════════════════════════ */
  function fresh() {
    return {
      round:       0,
      nextAt:      0,          // absoluter Zeitstempel; 0 = sofort fällig
      table:       [null, null, null],
      inDeck:      {},         // geseedete Karten: id → ab dieser Runde
      used:        {},         // endgültig raus
      lockedUntil: {},         // id → Runde, ab der sie wieder ziehbar ist
      immune:      {},
      trendBase:   0,          // dauerhafte Trend-Verschiebung aus Karten
      wtMult:      1,
      networkK:    0,
      adMalusUntil: 0,         // Preiskampf
      prSlotUntil:  0,         // Hilfsorganisation prominent
      investorOut:  false,     // Marcus ausbezahlt (investor_druck)
      pending:     false,      // eine Karte MUSS gewählt werden
      log:         []
    };
  }
  function ev() {
    var s = RT.state.current;
    if (!s.events) s.events = fresh();
    return s.events;
  }
  function active() { return RT.state.currentPhase() >= 4; }

  /* ── Deck ────────────────────────────────────────────────────────── */
  function deckList() {
    var e = ev(), out = [];
    for (var id in CARDS) {
      if (!Object.prototype.hasOwnProperty.call(CARDS, id)) continue;
      var d = CARDS[id];
      if (e.used[id]) continue;
      if (e.lockedUntil[id] && e.lockedUntil[id] > e.round) continue;
      if (onTable(id)) continue;
      if (d.nurGeseedet) { if (!e.inDeck[id] || e.inDeck[id] > e.round) continue; }
      else if (d.cond && !d.cond()) continue;
      out.push(id);
    }
    return out;
  }
  function onTable(id) {
    var t = ev().table;
    for (var i = 0; i < t.length; i++) if (t[i] && t[i].id === id) return true;
    return false;
  }

  // Beträge werden beim Auflegen EINGEFROREN — sie dürfen sich nicht
  // ändern, während der Spieler die Karte liest.
  function betraegeFuer(def) {
    var w = firmenwert(), out = {};
    var opts = Array.isArray(def.opts) ? def.opts : [];
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].geld) out[i] = Math.round(w * opts[i].geld / 100);
    }
    return out;
  }

  function drawUp() {
    var e = ev(), pool = deckList();
    for (var i = 0; i < TABLE_SLOTS; i++) {
      if (e.table[i]) continue;                 // liegende Krise blockiert
      if (!pool.length) continue;
      var id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      e.table[i] = { id: id, verdeckt: true, liegend: false, weg: false,
                     alter: 0, zusatz: 0, proRunde: null, betraege: betraegeFuer(CARDS[id]) };
    }
  }

  /* ── Wirkung einer Option ────────────────────────────────────────── */
  function liegtWert(c) { return (CARDS[c.id].liegt || 0) + (c.zusatz || 0); }

  // Trend-Modifikator einer liegenden Krise. Eigene Id je Karte, damit die
  // Aufschlüsselung im Trend-Modal sie einzeln auflistet — genauso wie
  // jede Werbeagentur ihren eigenen Posten hat.
  function modId(cardId) { return 'event:' + cardId; }

  function apply(def, o, betrag) {
    var s = RT.state.current, e = ev(), zeilen = [];

    if (betrag) {
      s.money = Math.max(0, (s.money || 0) + betrag);
      zeilen.push((betrag < 0 ? '💸 ' : '💰 ') + euro(betrag));
    }
    if (o.userPct) {
      var before = s.users || 0;
      s.users = Math.max(1000, Math.round(before * (1 + o.userPct / 100)));
      zeilen.push('👥 ' + pct(o.userPct) + ' — '
                + (s.users >= before ? '+' : '−')
                + Math.abs(s.users - before).toLocaleString('de-DE') + ' User');
    }
    if (o.trendBase) {
      e.trendBase = Math.round((e.trendBase + o.trendBase) * 10) / 10;
      zeilen.push('🔒 ' + tr(o.trendBase) + ' Trend — dauerhaft');
    }
    if (o.wtMult) {
      e.wtMult = Math.round(e.wtMult * o.wtMult * 10000) / 10000;
      zeilen.push('∞ Watchtime ×' + o.wtMult.toFixed(2).replace('.', ','));
    }
    if (o.networkK) {
      e.networkK = Math.round((e.networkK + o.networkK) * 100) / 100;
      zeilen.push('∞ Netzwerk-Steigung +' + o.networkK.toFixed(2).replace('.', ','));
    }
    if (o.wtLager) {
      var wt = s.watchtime || 0;
      s.watchtime = Math.max(0, Math.round(wt * (1 + o.wtLager / 100)));
      zeilen.push('⏳ Watchtime-Lager ' + pct(o.wtLager));
    }
    if (o.metaPct) {
      var md = s.metadata || 0;
      s.metadata = Math.max(0, Math.round(md * (1 + o.metaPct / 100)));
      zeilen.push('🗃️ Metadaten ' + pct(o.metaPct));
    }
    if (o.erneuerbar && !nodeDone('en_erneuerbar')) {
      s.techtree.en_erneuerbar = { status: 'done', startAt: 0, slot: null };
      zeilen.push('✅ Erneuerbare Energien stehen');
    }
    // Befristete Buffs. Beide laufen über absolute Zeitstempel und
    // überstehen dadurch eine Pause, ohne nachgerechnet zu werden.
    if (o.adMalus) {
      e.adMalusUntil = Date.now() + BUFF_SEC * 1000;
      zeilen.push('📉 Werbeerlöse −40 % für ' + Math.round(BUFF_SEC / 60) + ' min');
    }
    if (o.prSlot) {
      e.prSlotUntil = Date.now() + BUFF_SEC * 1000;
      zeilen.push('📣 +1 Kampagnenplatz für ' + Math.round(BUFF_SEC / 60) + ' min');
    }
    var tv = o.dynTrend ? o.dynTrend() : o.trend;
    if (tv) {
      RT.state.setTrendMod('event:bonus:' + def.id, def.icon + ' ' + def.name, tv, holdSec());
      zeilen.push('⭐ ' + tr(tv) + ' Trend — befristet');
    }
    // Der Kauf ohne freie Kapazität: „Serverprobleme" ist derselbe
    // Modifikator, den auch eine volle Serverfarm auslöst (CLAUDE.md §8).
    if (o.serverRisk && !kapaFrei()) {
      RT.state.setTrendMod(RT.state.SERVER_TROUBLE_MOD, '🔌 Serverprobleme',
                           RT.state.SERVER_TROUBLE_TREND, RT.state.SERVER_TROUBLE_HOLD_SEC);
      zeilen.push('🔌 Serverprobleme — die neuen User passen nicht auf deine Farmen');
    }
    if (o.abschalten) {
      var wtN = darkWtDone()[0];
      if (wtN) {
        delete s.techtree[wtN.id];
        zeilen.push('⛔ ' + wtN.name + ' abgeschaltet — Watchtime fällt, '
                  + tr(-(wtN.trendBase || 0)) + ' Trend kommen zurück');
      }
    }
    if (o.investorOut && !e.investorOut) {
      e.investorOut = true;
      zeilen.push('🤝 Marcus ist raus — seine ' + Math.round(RT.state.INVESTOR_PAYOUT_SHARE * 100)
                + ' % auf die Werbeerträge entfallen');
    }
    if (o.immun) { e.immune[o.immun] = true; }

    // Folgekarten INS DECK legen — gezogen werden sie danach zufällig.
    var seeds = o.dynSeed ? o.dynSeed() : (o.seed || []);
    for (var i = 0; i < seeds.length; i++) {
      var sd = seeds[i];
      if (e.immune[sd.id]) { zeilen.push('🛡 ' + CARDS[sd.id].name + ' abgewehrt'); continue; }
      if (Math.random() < sd.p) {
        delete e.used[sd.id];
        e.inDeck[sd.id] = e.round + sd.ab;
      }
      // ⚠️ Bewusst KEINE Zeile über Treffer/Fehlschlag. Im Prototyp stand
      // sie drin, weil dort die Mechanik geprüft wurde. Im Spiel wäre sie
      // ein Blick in den Deckstapel — und genau der soll verdeckt bleiben.
    }
    return zeilen;
  }

  /* ── Entscheiden ─────────────────────────────────────────────────── */
  function reveal(i) {
    var e = ev(), c = e.table[i];
    if (!c || !e.pending) return;
    // ⚠️ Nur EINE Karte je Runde. Ohne diese Sperre könnte man alle drei
    // aufdecken und sich danach die beste aussuchen — die Regel „was du
    // nicht wählst, siehst du nie" wäre damit wertlos.
    if (anyPicked()) return;
    c.verdeckt = false;
    for (var j = 0; j < e.table.length; j++) {
      if (e.table[j]) e.table[j].gewaehlt = (j === i);
    }
    render();
  }

  function decide(i, oi) {
    // Kartenentscheidungen laufen nicht über RT.actions und brauchen deshalb
    // einen eigenen Pause-Riegel. Praktisch kaum erreichbar — der Tisch geht
    // in der Pause gar nicht erst auf, weil die Runden-Uhr steht —, aber eine
    // Entscheidung ist unumkehrbar, und die soll nirgends durchrutschen.
    if (RT.pause && RT.pause.blocked()) return;
    var e = ev(), c = e.table[i];
    if (!c || !e.pending) return;
    var def = CARDS[c.id], o = def.opts[oi];
    var betrag = c.betraege[oi] || 0;
    if (betrag < 0 && (RT.state.current.money || 0) < -betrag) return;   // nicht bezahlbar

    var zeilen = apply(def, o, betrag);

    if (def.art === 'krise' && !o.loesen) {
      // Die Frist läuft ab dem ERSTEN Aussitzen. Noch einmal auszusitzen
      // darf die Uhr nicht zurückdrehen — sonst liegt die Karte ewig.
      var rest = c.liegend ? def.runden - c.alter : def.runden;
      if (!c.liegend) { c.liegend = true; c.alter = 0; }
      c.gewaehlt = false;
      c.proRunde = o.proRunde || def.proRunde || null;
      zeilen.push('⏳ liegt noch ' + rest + ' ' + (rest === 1 ? 'Runde' : 'Runden') + ' auf dem Tisch');
    } else {
      c.weg = true;
      if (o.wieder) {
        e.lockedUntil[def.id] = e.round + o.wieder;
        zeilen.push('↩︎ kommt in ' + o.wieder + ' Runden zurück ins Deck');
      } else if (def.wiederkehrend) {
        // Kein Hinweis auf der Karte: dass so etwas wieder passieren kann,
        // soll der Spieler erleben und nicht angekündigt bekommen.
        e.lockedUntil[def.id] = e.round + def.wiederkehrend;
      } else {
        e.used[def.id] = true;
      }
      RT.state.removeTrendMod(modId(def.id));
    }

    e.log.unshift({ r: e.round, kopf: def.icon + ' ' + def.name + ' → „' + o.name + '"', zeilen: zeilen });
    if (e.log.length > 40) e.log.length = 40;

    // Runde beendet: die Uhr für die nächste läuft ab jetzt.
    e.pending = false;
    e.nextAt  = Date.now() + ROUND_SEC * 1000;
    syncMods();
    RT.bus.emit('state:changed');
    render();
  }

  /* ── Rundenwechsel ───────────────────────────────────────────────── */
  function nextRound() {
    var e = ev(), s = RT.state.current;
    e.round++;
    var keep = [];
    for (var i = 0; i < e.table.length; i++) {
      var c = e.table[i];
      if (!c || c.weg)   { keep.push(null); continue; }
      if (!c.liegend)    { keep.push(null); continue; }   // ungewählt → zurück ins Deck
      c.alter++;
      var pr = c.proRunde;
      if (pr && pr.userPct) {
        s.users = Math.max(1000, Math.round((s.users || 0) * (1 + pr.userPct / 100)));
        logLine('📉 ' + CARDS[c.id].name + ': ' + pct(pr.userPct) + ' User');
      }
      if (pr && pr.liegt) {
        c.zusatz = (c.zusatz || 0) + pr.liegt;
        logLine('📈 ' + CARDS[c.id].name + ' wird schlimmer: ⭐ ' + tr(liegtWert(c)) + ' laufend');
      }
      if (c.alter >= CARDS[c.id].runden) { endCrisis(c); keep.push(null); continue; }
      keep.push(c);
    }
    e.table = keep;
    drawUp();
    // ⚠️ Nur dann eine Runde verlangen, wenn überhaupt etwas auf dem Tisch
    // liegt. Das Deck KANN leerlaufen — gespielte Chancen kommen nie wieder,
    // und die Krisen hängen an Bedingungen, die man abgestellt haben kann.
    // Ohne diese Prüfung stünde der Spieler vor drei leeren Plätzen, könnte
    // nichts wählen, und weil ein offenes `pending` das Modal verriegelt,
    // wäre das ein Deadlock.
    e.pending = hasCard();
    if (!e.pending) e.nextAt = Date.now() + ROUND_SEC * 1000;
    syncMods();
    RT.bus.emit('state:changed');
    RT.bus.emit('events:round', { round: e.round });
  }

  function hasCard() {
    var t = ev().table;
    for (var i = 0; i < t.length; i++) if (t[i]) return true;
    return false;
  }

  function endCrisis(c) {
    var e = ev(), def = CARDS[c.id];
    RT.state.removeTrendMod(modId(def.id));
    if (def.ende === 'zwang') {
      var o = def.opts[def.zwangOpt];
      var betrag = c.betraege[def.zwangOpt] ? c.betraege[def.zwangOpt] * (def.zwangFaktor || 1) : 0;
      var zeilen = apply(def, o, betrag);
      zeilen.unshift('⚖️ ' + (def.zwangTxt || 'Frist abgelaufen.'));
      e.log.unshift({ r: e.round, kopf: '⌛ ' + def.name + ' → Zwang: „' + o.name + '"', zeilen: zeilen });
      if (def.wiederkehrend) e.lockedUntil[def.id] = e.round + def.wiederkehrend;
      else                   e.used[def.id] = true;
      RT.bus.emit('toast', '⚖️ ' + def.name + ' — Frist abgelaufen');
    } else if (def.ende === 'zurueck') {
      e.lockedUntil[def.id] = e.round + 2;
      logLine('⌛ ' + def.name + ' ist vom Tisch — die Ursache besteht weiter.');
    } else if (def.wiederkehrend) {
      e.lockedUntil[def.id] = e.round + def.wiederkehrend;
      logLine('⌛ ' + def.name + ' ist ausgelaufen.');
    } else {
      e.used[def.id] = true;
      logLine('⌛ ' + def.name + ' ist ausgelaufen.');
    }
  }

  function logLine(t) {
    var e = ev();
    e.log.unshift({ r: e.round, kopf: t, zeilen: [] });
    if (e.log.length > 40) e.log.length = 40;
  }

  /* ── Laufende Krisen ─────────────────────────────────────────────── */
  function lying() {
    var e = ev(), out = [];
    for (var i = 0; i < e.table.length; i++) {
      if (e.table[i] && e.table[i].liegend && !e.table[i].weg) out.push(e.table[i]);
    }
    return out;
  }
  function lyingHas(id) {
    var l = lying();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return true;
    return false;
  }

  // Der Trend-Malus einer liegenden Krise wird bei jedem Tick nachgehalten.
  // Wird die Krise gelöst oder läuft sie aus, nimmt decide() bzw.
  // endCrisis() den Posten SOFORT weg — nicht abklingend.
  //
  // ⚠️ Das weicht bewusst von „Serverprobleme" ab (dort klingt der Posten
  // nach dem Abstellen aus). Hier steht auf der Karte wörtlich „sofort weg",
  // und eine Option, die man teuer bezahlt, muss halten, was ihr Chip sagt.
  // Der Preis dafür ist die eigentliche Strafe, nicht ein Nachhall.
  function syncMods() {
    var l = lying();
    for (var i = 0; i < l.length; i++) {
      var v = liegtWert(l[i]);
      if (!v) continue;
      var def = CARDS[l[i].id];
      RT.state.setTrendMod(modId(def.id), def.icon + ' ' + def.name, v, 30);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     TICK — die Uhr. Läuft nur in Phase 4.
     ═══════════════════════════════════════════════════════════════════ */
  // Läuft gerade etwas, das dem Spieler das Kartensystem erklärt? Das ist
  // entweder eine Erklär-Tour oder das Phase-4-Gratulations-Modal davor.
  function erklaerungOffen() {
    if (RT.tour && RT.tour.isOpen && RT.tour.isOpen()) return true;
    return !!document.getElementById('rt-phase4-modal');
  }

  function tick() {
    var now = Date.now();
    var dt  = _lastTick ? now - _lastTick : 0;
    _lastTick = now;
    if (!active()) return;
    // Solange eine Erklär-Tour läuft, wartet der Tisch. Sonst ginge das
    // Karten-Modal genau über die Tour auf, die es gerade erklärt.
    //
    // ⚠️ Die Uhr wird dabei mitgeschoben, nicht nur ignoriert. Eine Tour, die
    // länger dauert als der Vorlauf, fräße ihn sonst vollständig auf, und die
    // erste Karte läge in dem Moment auf dem Tisch, in dem die Erklärung zugeht
    // — genau der Zustand, den FIRST_ROUND_SEC verhindern soll. Der Sprung wird
    // gedeckelt: nach einer Pause (Tab im Hintergrund) ist dt riesig, und die
    // Runde soll sich davon nicht endlos nach hinten schieben lassen.
    if (erklaerungOffen()) {
      var et = ev();
      if (et.nextAt && !et.pending && dt > 0 && dt < 2000) et.nextAt += dt;
      return;
    }
    var e = ev();
    syncMods();
    // ⚠️ Eine offene Runde öffnet den Tisch WIEDER, wenn er nicht steht.
    // Genau das passiert nach einem Neuladen mitten in der Runde — ohne
    // diese Zeile hinge der Spielstand mit pending=true fest und es käme
    // nie wieder eine Karte.
    if (e.pending) { if (!_overlay) open(); return; }
    // nextAt = 0 heißt „sofort fällig" — das setzt maybeTriggerPhase4()
    // im Moment des Auslösens. Der reguläre Weg setzt beim Schließen des
    // Phase-4-Modals stattdessen FIRST_ROUND_SEC in die Zukunft.
    if (Date.now() < (e.nextAt || 0)) return;
    nextRound();
    // Leergelaufenes Deck: nichts aufmachen, die Uhr läuft weiter. Der
    // Spieler merkt davon nichts außer einem Countdown, der neu beginnt —
    // und das ist richtig, es ist ja nichts passiert.
    if (e.pending) open();
  }

  // Sekunden bis zur nächsten Runde — für den Countdown auf dem Button.
  function secondsLeft() {
    var e = ev();
    if (e.pending) return 0;
    return Math.max(0, Math.ceil((e.nextAt - Date.now()) / 1000));
  }

  /* ═══════════════════════════════════════════════════════════════════
     SCHNITTSTELLEN ZUM RESTLICHEN SPIEL
     Alles, was von außen abgefragt wird, steht hier zusammen. Die
     aufrufenden Stellen (state.js, loop.js) müssen die Karten nicht kennen.
     ═══════════════════════════════════════════════════════════════════ */
  var api = {
    ROUND_SEC:   ROUND_SEC,
    FIRST_ROUND_SEC: FIRST_ROUND_SEC,
    CARDS:       CARDS,
    USER_WERT:   USER_WERT,
    tick:        tick,
    open:        open,
    active:      active,
    state:       ev,
    lying:       lying,
    secondsLeft: secondsLeft,
    isOpen:      function () { return !!_overlay; },
    pending:     function () { return active() && ev().pending; },
    firmenwert:  firmenwert,

    // Dauerhafte Trend-Verschiebung aus Kartenentscheidungen. Geht als
    // eigene Zeile in trendBaseMods() — ein unerklärter Sockel wäre nicht
    // nachvollziehbar, und die Karten sind genau die Stelle, an der der
    // Spieler sich das selbst eingebrockt hat.
    trendBase:   function () { return active() ? (ev().trendBase || 0) : 0; },
    wtMult:      function () { return active() ? (ev().wtMult || 1) : 1; },
    networkK:    function () { return active() ? (ev().networkK || 0) : 0; },

    // Preiskampf: −40 % auf die Werbeerträge, 10 Minuten lang.
    adRevenueMult: function () {
      return (active() && Date.now() < (ev().adMalusUntil || 0)) ? 0.6 : 1;
    },
    // Hilfsorganisation prominent: ein zusätzlicher Kampagnenplatz.
    prSlotBonus: function () {
      return (active() && Date.now() < (ev().prSlotUntil || 0)) ? 1 : 0;
    },
    // Marcus ist ausbezahlt („Anteile zurückkaufen") — sein dauerhafter
    // 15-%-Abzug auf die Werbeerträge entfällt.
    investorOut: function () { return active() && !!ev().investorOut; },
    // Serverausfall halbiert die Watchtime-Produktion aller Farmen.
    farmSpeedFactor: function () { return (active() && lyingHas('serverausfall')) ? 0.5 : 1; },
    // Streik: laufende Entwicklungen stehen still, neue lassen sich nicht
    // starten. Das ist der einzige Malus, der keine Zahl ist, sondern Zeit.
    devBlocked: function () { return active() && lyingHas('streik'); }
  };

  /* ═══════════════════════════════════════════════════════════════════
     DARSTELLUNG
     Eigenes Overlay statt des Standard-Modals: es muss sich verweigern
     können. Solange `pending` gesetzt ist, gibt es kein Schließen —
     weder über den Hintergrund noch über Escape.
     ═══════════════════════════════════════════════════════════════════ */
  var _overlay = null;
  var _timer   = null;

  function open() {
    if (_overlay) { render(); return; }
    _overlay = document.createElement('div');
    _overlay.className = 'rt-ev';
    _overlay.innerHTML = ''
      + '<div class="rt-ev__bg"></div>'
      + '<div class="rt-ev__box">'
      + '  <div class="rt-ev__head">'
      + '    <div class="rt-ev__title">🃏 Ereignisse</div>'
      + '    <div class="rt-ev__round" id="rt-ev-round"></div>'
      + '    <button class="rt-ev__close" id="rt-ev-close" type="button" aria-label="Schließen">✕</button>'
      + '  </div>'
      + '  <div class="rt-ev__body" id="rt-ev-body"></div>'
      + '</div>';
    document.body.appendChild(_overlay);

    _overlay.querySelector('#rt-ev-close').addEventListener('click', function () {
      if (ev().pending) return;
      close();
    });
    _overlay.querySelector('.rt-ev__bg').addEventListener('click', function () {
      if (ev().pending) return;
      close();
    });
    window.addEventListener('keydown', onKey);
    render();
  }

  function onKey(e) {
    if (e.key === 'Escape' && _overlay && !ev().pending) close();
  }

  function close() {
    if (!_overlay) return;
    window.removeEventListener('keydown', onKey);
    if (_overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    RT.bus.emit('state:changed');
  }

  function chipHtml(c) {
    return '<span class="rt-ev-chip' + (c.k ? ' rt-ev-chip--' + c.k : '') + '">' + c.t + '</span>';
  }

  // Eine Options-Zeile. Folgekarten stehen bewusst NICHT drin — im
  // Prototyp waren sie das Prüfwerkzeug, im Spiel wären sie ein Blick in
  // den Deckstapel.
  function optHtml(o, oi, betrag, ki) {
    var geldOk = !betrag || betrag > 0 || (RT.state.current.money || 0) >= -betrag;
    var chips  = (o.fx || []).concat(o.dyn ? o.dyn() : []).map(chipHtml).join('');
    return ''
      + '<button class="rt-ev-opt" ' + (geldOk ? '' : 'disabled ')
      +   'data-k="' + ki + '" data-o="' + oi + '">'
      + '  <div class="rt-ev-opt__name">' + esc(o.name) + '</div>'
      +    (betrag
            ? '<div class="rt-ev-opt__money ' + (betrag < 0 ? 'is-neg' : 'is-pos') + '">'
              + euro(betrag) + '</div>'
              + '<div class="rt-ev-opt__pct">≈ ' + pct(o.geld) + ' vom Firmenwert'
              + (geldOk ? '' : ' — Bank zu leer') + '</div>'
            : '')
      +    (chips ? '<div class="rt-ev-chips">' + chips + '</div>' : '')
      + '</button>';
  }

  function bildHtml(def) {
    var st = def.bild
      ? 'background-image:url(' + def.bild + ');background-size:cover;background-position:center'
      : '';
    return '<div class="rt-ev-card__img rt-ev-card__img--' + def.art + '" style="' + st + '">'
         + (def.bild ? '' : def.icon) + '</div>';
  }

  function cardHtml(c, i) {
    var e = ev();
    // Offen ist der Tisch nur, solange eine Runde läuft UND noch nichts
    // gewählt ist — danach sind die anderen Karten unerreichbar.
    var offenerTisch = e.pending && !anyPicked();
    if (!c) return '<div class="rt-ev-card rt-ev-card--empty"></div>';
    if (c.verdeckt) {
      return '<div class="rt-ev-card rt-ev-card--back' + (offenerTisch ? '' : ' is-out') + '"'
           + (offenerTisch ? ' data-reveal="' + i + '"' : '') + '>'
           + '<span class="rt-ev-card__back">🂠</span>'
           + (offenerTisch ? '<span class="rt-ev-card__hint">aufdecken</span>'
                           : '<span class="rt-ev-card__hint">zurück ins Deck</span>')
           + '</div>';
    }
    var def   = CARDS[c.id];
    var krise = def.art === 'krise';
    var offen = krise && c.liegend && offenerTisch;
    var h = '<div class="rt-ev-card rt-ev-card--' + def.art
          + (c.gewaehlt ? ' is-picked' : '') + (c.weg ? ' is-done' : '')
          + (offen ? ' is-clickable' : '') + '"'
          + (offen ? ' data-reveal="' + i + '"' : '') + '>';

    if (krise && c.liegend) {
      var rest = def.runden - c.alter;
      h += '<div class="rt-ev-card__frist">⏳ noch ' + rest + ' '
         + (rest === 1 ? 'Runde' : 'Runden') + '</div>';
    }
    h += bildHtml(def)
      + '<div class="rt-ev-card__head">'
      + '  <div class="rt-ev-card__art rt-ev-card__art--' + def.art + '">'
      +      (krise ? 'Krise' : 'Chance') + '</div>'
      + '  <h3>' + def.icon + ' ' + esc(def.name) + '</h3>'
      + '</div>'
      + '<div class="rt-ev-card__text">' + esc(def.text) + '</div>';

    if (krise) {
      var u = def.ursacheDyn ? def.ursacheDyn() : def.ursache;
      h += '<div class="rt-ev-card__cause"><b>Ausgelöst durch:</b> ' + esc(u || '—') + '</div>';
      if (c.liegend) {
        var ende = def.ende === 'zwang'
                 ? 'dann: ' + (def.zwangTxt || 'wird vollstreckt')
                 : def.ende === 'zurueck'
                 ? 'dann: zurück ins Deck, solange die Ursache besteht'
                 : 'dann: erledigt';
        var w = liegtWert(c);
        h += '<div class="rt-ev-card__lying">Liegt: '
           + (w ? '⭐ ' + tr(w) + ' laufend' : (def.liegtTxt || '—'))
           + (w && def.liegtTxt ? ' · ' + def.liegtTxt : '')
           + (c.zusatz ? ' · verschärft um ' + tr(c.zusatz) : '')
           + '<small>' + ende + '</small></div>';
      }
    }
    if (c.gewaehlt && e.pending) {
      h += '<div class="rt-ev-card__opts">';
      for (var oi = 0; oi < def.opts.length; oi++) {
        h += optHtml(def.opts[oi], oi, c.betraege[oi] || 0, i);
      }
      h += '</div>';
    } else if (offen) {
      h += '<div class="rt-ev-card__hint rt-ev-card__hint--inline">anklicken, um sie jetzt anzugehen</div>';
    }
    return h + '</div>';
  }

  // Die Zusammenfassung: alles, was gerade durch Karten an Boni und Mali
  // anliegt, an einer Stelle. Ohne sie wären die Wirkungen über vier
  // verschiedene Modale verstreut.
  function statusHtml() {
    var e = ev(), rows = [];
    var l = lying();
    for (var i = 0; i < l.length; i++) {
      var def = CARDS[l[i].id], w = liegtWert(l[i]);
      var rest = def.runden - l[i].alter;
      rows.push({ cls: 'bad', ico: def.icon, name: def.name,
                  val: (w ? '⭐ ' + tr(w) : (def.liegtTxt || '—')),
                  note: 'noch ' + rest + ' ' + (rest === 1 ? 'Runde' : 'Runden') });
    }
    if (e.trendBase) {
      rows.push({ cls: e.trendBase < 0 ? 'bad' : 'good', ico: '🔒',
                  name: 'Trend aus Entscheidungen', val: '⭐ ' + tr(e.trendBase),
                  note: 'dauerhaft' });
    }
    if (e.wtMult && e.wtMult !== 1) {
      rows.push({ cls: 'good', ico: '∞', name: 'Watchtime aus Entscheidungen',
                  val: '×' + e.wtMult.toFixed(2).replace('.', ','), note: 'dauerhaft' });
    }
    if (e.networkK) {
      rows.push({ cls: 'good', ico: '🌐', name: 'Netzwerk-Steigung',
                  val: '+' + e.networkK.toFixed(2).replace('.', ','), note: 'dauerhaft' });
    }
    if (e.investorOut) {
      rows.push({ cls: 'good', ico: '🤝', name: 'Marcus ausbezahlt',
                  val: 'kein Werbe-Abzug', note: 'dauerhaft' });
    }
    var now = Date.now();
    if (now < (e.adMalusUntil || 0)) {
      rows.push({ cls: 'bad', ico: '📉', name: 'Preiskampf', val: 'Werbeerlöse −40 %',
                  note: 'noch ' + Math.ceil((e.adMalusUntil - now) / 60000) + ' min' });
    }
    if (now < (e.prSlotUntil || 0)) {
      rows.push({ cls: 'good', ico: '📣', name: 'Hilfsorganisation', val: '+1 Kampagnenplatz',
                  note: 'noch ' + Math.ceil((e.prSlotUntil - now) / 60000) + ' min' });
    }
    if (!rows.length) {
      return '<div class="rt-ev-status rt-ev-status--empty">Gerade wirkt nichts aus den '
           + 'Karten auf deine Plattform.</div>';
    }
    var h = '<div class="rt-ev-status">';
    for (var r = 0; r < rows.length; r++) {
      h += '<div class="rt-ev-status__row is-' + rows[r].cls + '">'
         + '<span class="rt-ev-status__ico">' + rows[r].ico + '</span>'
         + '<span class="rt-ev-status__name">' + esc(rows[r].name) + '</span>'
         + '<span class="rt-ev-status__val">' + rows[r].val + '</span>'
         + '<span class="rt-ev-status__note">' + rows[r].note + '</span>'
         + '</div>';
    }
    return h + '</div>';
  }

  function logHtml() {
    var e = ev();
    if (!e.log.length) return '<div class="rt-ev-log rt-ev-log--empty">noch nichts entschieden</div>';
    var h = '<div class="rt-ev-log">';
    for (var i = 0; i < Math.min(e.log.length, 12); i++) {
      var l = e.log[i];
      h += '<div class="rt-ev-log__row"><b>R' + l.r + ' · ' + l.kopf + '</b>';
      for (var z = 0; z < l.zeilen.length; z++) h += '<small>' + l.zeilen[z] + '</small>';
      h += '</div>';
    }
    return h + '</div>';
  }

  function mmss(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function render() {
    if (!_overlay) return;
    var e = ev();
    var head = _overlay.querySelector('#rt-ev-round');
    var body = _overlay.querySelector('#rt-ev-body');
    var closeBtn = _overlay.querySelector('#rt-ev-close');

    head.innerHTML = 'Runde ' + e.round
      + (e.pending ? ' · <b class="rt-ev__wait">wähle eine Karte</b>'
                   : ' · nächste in <b>' + mmss(secondsLeft()) + '</b>');
    closeBtn.style.display = e.pending ? 'none' : '';
    _overlay.classList.toggle('is-locked', !!e.pending);

    var cards = '';
    for (var i = 0; i < e.table.length; i++) cards += cardHtml(e.table[i], i);

    var hint = e.pending
      ? (anyPicked()
          ? 'Triff die Entscheidung. Die Beträge sind beim Auflegen eingefroren.'
          : 'Eine Karte anklicken. Was du <b>nicht</b> wählst, geht ungesehen zurück ins Deck.')
      : 'Erledigt. Die nächste Runde kommt von allein.';

    body.innerHTML = ''
      + '<div class="rt-ev-table">' + cards + '</div>'
      + '<div class="rt-ev-hint">' + hint + '</div>'
      + '<div class="rt-ev-sec"><h4>Läuft gerade</h4>' + statusHtml() + '</div>'
      + '<div class="rt-ev-sec"><h4>Was passiert ist</h4>' + logHtml() + '</div>';

    var revs = body.querySelectorAll('[data-reveal]');
    for (var r = 0; r < revs.length; r++) {
      (function (el) {
        el.addEventListener('click', function () { reveal(parseInt(el.dataset.reveal, 10)); });
      })(revs[r]);
    }
    var opts = body.querySelectorAll('.rt-ev-opt');
    for (var o = 0; o < opts.length; o++) {
      (function (el) {
        el.addEventListener('click', function (evt) {
          evt.stopPropagation();
          decide(parseInt(el.dataset.k, 10), parseInt(el.dataset.o, 10));
        });
      })(opts[o]);
    }
  }

  function anyPicked() {
    var t = ev().table;
    for (var i = 0; i < t.length; i++) if (t[i] && t[i].gewaehlt) return true;
    return false;
  }

  // Der Countdown im Kopf läuft in Sekunden weiter, ohne dass dafür der
  // ganze Inhalt neu gebaut wird — ein Neuaufbau im Sekundentakt würde
  // sonst den halb gelesenen Kartentext unter dem Finger wegziehen.
  function startClock() {
    if (_timer) return;
    _timer = setInterval(function () {
      if (_overlay && !ev().pending) {
        var head = _overlay.querySelector('#rt-ev-round');
        if (head) head.innerHTML = 'Runde ' + ev().round
                                 + ' · nächste in <b>' + mmss(secondsLeft()) + '</b>';
      }
      // Nur in Phase 4 — davor gibt es nichts, was im Sekundentakt liefe.
      if (active()) RT.bus.emit('events:clock');
    }, 1000);
  }

  api.startClock = startClock;
  api.close      = close;
  api.render     = render;
  RT.events = api;
})(window.RT3);
