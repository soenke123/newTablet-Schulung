/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Kingdoms of Mathoria" (intern: clash-of-math)
   ══════════════════════════════════════════════════════════════
   Hieß bis Migration 0095 „Clash of Math" — nur der Anzeigename hat
   sich geändert (siehe 0095). Ordner, tools.js-Eintrag und alle
   clash_*-RPC-Namen bleiben bewusst 'clash-of-math': der technische
   Schlüssel zieht nicht mit, das wäre eine eigene Aufräum-Migration.

   Vierter Skill, erster im Fach „Mathematik", und der erste, der
   NICHT über die generische Inhaltsschicht (0080/0086/0087) läuft —
   Clash of Math bringt eigene Tabellen und eigene RPC-Namen mit
   (Migration 0093). Wie jedes Werkzeug EIN Modul für beide Rollen
   (ctx.role unterscheidet Teilnehmer/Beamer), aber weil die
   generischen Verben (upsert/vote/…) hier keine Rolle spielen,
   benutzt dieses Werkzeug ausschließlich `ctx.actions.call(fn, args)`
   — den generischen Durchreich-Baustein aus lib/tool.js, der Token
   bzw. Code automatisch mitgibt, ohne dass lib/tool.js einen
   Clash-RPC-Namen kennen müsste.

   ── Eigener Takt statt der Seiten-Aktualisierung ───────────────
   Der Aufrufer (j.js/lehrer.js) pollt bereits die GENERISCHEN RPCs
   (skill_view/skill_room_get) und ruft update(view) bei jeder
   Änderung — aber solange Clash nichts an der generischen Schicht
   anfasst, ändert sich deren Signatur während einer laufenden Runde
   kaum. Dieses Werkzeug führt deshalb SEINEN EIGENEN, unabhängigen
   Takt: eine billige Signatur (clash_sig/clash_room_sig) alle paar
   Sekunden als Sicherheitsnetz, plus einen Realtime-Broadcast-Kanal
   als schnellen Weg — jede erfolgreiche Eroberung sendet ein „jetzt
   nachfragen"-Signal an alle im selben Raum, OHNE dass der Inhalt des
   Broadcasts selbst als Wahrheit gilt (das bleibt ausschließlich die
   RPC-Antwort). Ein verpasstes oder gefälschtes Broadcast-Event kostet
   höchstens einen überflüssigen Abruf, nie einen falschen Spielstand.

   ── Grundgerüst-Umfang ──────────────────────────────────────────
   Team-Zuordnung (Vorschau vor dem Start), Board-Erzeugung, 5s-
   Countdown, einfache Addition bis 100, Eroberung, Elimination
   (Zuschauer-Platzhalter), Sieg. Platzhalterfarben statt der acht
   Fraktionsbilder im Ordner — die kommen mit Sönkes Ausbau-Punkt 1.

   ── Fixes aus dem ersten Feature-Feedback (Migration 0094) ──────
   (1) Rundenende auf Zeit (5s Test / 1..5 Min, siehe cmTimerSet/
       cmTimerRun) — Sieger ist dann, wer die meisten Felder besitzt.
   (2) Die Beamer-Karte füllt den freien Platz (fitPresenterMap,
       body.tool-fill) statt an einer festen Breite zu stehen — der
       Teilnehmer behält seine begrenzte Karte in der Seite.
   (3) Die Tastatur bleibt beim Antworten offen (onSubmit fokussiert
       das Feld direkt nach dem Absenden erneut).
   (4) Team-Zuordnung hängt an „online" (last_seen_at < 90s, wie
       0079) statt an „dem Raum zugeordnet" — reine Server-Änderung
       (0094), hier nichts Neues außer den online_count/room_total-
       Feldern in der Lobby-Anzeige.

   ── Die Lobby wählt Völker, nicht mehr eine Zahl (Migration 0097) ──
   Das Zahlenfeld „Teams: [4]" ist weg. Stattdessen stehen die acht
   Wappen zum Anklicken da, darunter je gewähltem Volk eine Spalte mit
   Gruppenbild, Namen und den Kindern, die dazugehören — und ganz
   unten, wer im Raum, aber gerade nicht online ist.

   Dadurch fällt eine Gleichung, die vorher überall stillschweigend
   galt: Volk = Team-Slot. Der Server rechnet unverändert in Slots
   0..n-1 (Spielfeld-Layout, Team-Verteilung, clash_players); WELCHES
   Volk auf einem Slot sitzt, steht in `factions` und wird hier über
   facOf()/fStroke()/fLabel()/… nachgeschlagen. Wer eine der
   FACTION_*-Listen direkt mit einer Zahl indiziert, die vom Server
   kommt, macht mit ziemlicher Sicherheit einen Fehler.

   ── Der Spielbildschirm des Teilnehmers (UI-Durchgang) ─────────
   Bis hierher war das Tablet die Restrampe: eine Canvas-Karte mit
   Platzhalterfarben, ein <input type=number> mit Gerätetastatur und
   ein Absende-Knopf. Vier Änderungen, alle im Teilnehmer-Teil:

   (1) EINE Karte für beide Rollen (renderHexMap). Die Canvas-Fassung
       ist weg; das Tablet sieht dasselbe Bild wie die Klasse am
       Beamer, nur ohne wandernde Einheiten und mit dem eigenen
       Gebiet hervorgehoben.
   (2) Die Karte ist standardmäßig ZU und hängt hinter einem Knopf
       (openMap) — auf dem Spielbildschirm gehört der Platz der
       Aufgabe.
   (3) Eigene Tastatur statt der des Geräts (KEY_BASE/KEY_EXTRA/
       MODES, siehe dort). Sie ist als Beschreibung angelegt, weil
       die kommenden Aufgabenarten — Brüche, Vorzeichen, Variablen,
       Potenzen, Wurzeln, Sinus/Kosinus, Binär, Hexadezimal — je ein
       eigenes Tastenbündel brauchen, aber denselben Grundblock.
   (4) Die Aufteilung, die Sönke vorgegeben hat: untere Hälfte
       Tastatur (Bestätigen unten rechts), darüber Aufgabe und
       Eingabe, darüber ein Viertel das eigene Volk mit Feldanteil
       und Serien, ganz oben die Völker mit Strich durch die
       ausgeschiedenen. Der Bildschirm ist dafür `fixed` auf dem
       sichtbaren Bereich — die Anteile beziehen sich auf den ganzen
       Bildschirm, in einem Kasten in der Seite ergäben sie nichts.

   Die Serie des VOLKES (v.team_streak) stand hier lange als „–" ohne
   Quelle — seit Migration 0106 liefert der Server sie: ein geteilter
   Zähler je Team (nicht die Summe der Einzel-Serien), der bei 20, 40,
   60 … automatisch fünf Felder erobert (bis 0108: sieben). Die eigene
   Serie (me.streak) gibt bei 12, 24, 36 … (bis 0108: alle zehn) zwei
   offene manuelle Picks (pending_picks) — die Karte öffnet sich dafür
   von selbst (siehe openMap(forced), onMapTileClick), mit kurzer
   Frist, nach der der Server ungenutzte Picks selbst zufällig einlöst
   (muss „schnell gehen", darf das Spiel nicht aufhalten). Beide Boni
   benachrichtigen das eigene Team über my_team_events
   (applyTeamEvents/showFireToast) — andere Völker sehen davon nichts.

   ── Ausgeschieden heißt weiterspielen (Ruinen-Modus, 0108) ──────
   Bis 0107 war ein Volk ohne Kachel raus: keine Aufgabe mehr, nur die
   Zuschauer-Tafel #cmOut. In einer Klasse hieß das, dass ein Viertel
   der Kinder minutenlang nichts zu tun hatte — und die Runde zog sich,
   weil das Feld gleich groß blieb. Seit 0108 bekommt ein
   ausgeschiedenes Volk WEITER Aufgaben (clash_view liefert sie jetzt
   unabhängig von me.alive), und zwar auf demselben Spielbildschirm,
   nur mit .cm-play--ruin und einem Banner darüber:

     • Jede richtige Antwort zählt wie bisher in correct_count und
       damit in die Endwertung — unter den Ausgeschiedenen entscheidet
       genau diese Zahl den Platz (endRows: alle stehen bei null
       Feldern).
     • Zusätzlich sammelt sie Ruinen-Punkte (v.ruin). Je 10 Punkte
       verschwindet EIN Feld beim größten lebenden Volk — höchstens
       bis das Startfeld halbiert ist (v.board.floor_reached).
     • Die Serien-Boni zählen dabei wie richtige Antworten: Team-Serie
       fünf Punkte, Einzel-Serie zwei. In correct_count gehen sie
       NICHT ein, die Endwertung bleibt die echte Zahl beantworteter
       Aufgaben.

   #cmOut gibt es weiterhin — aber nur noch für den einen Fall, für
   den es nie gedacht war und der trotzdem eintritt: jemand ohne Volk
   (nach dem Start dazugekommen, noch nicht gelost).

   ── Effekte: was gerade passiert, muss man SEHEN (UI 18) ────────
   Bis hierher änderte sich bei einer Eroberung nur eine Farbe auf der
   Karte — auf einem Beamer, den zwanzig Kinder aus vier Metern
   ansehen, ist das kein Ereignis, sondern ein Standbild, das anders
   aussieht als vorher. Fünf Anlässe bekommen deshalb einen Effekt:

     Feld erobert     ein kurzer Ring + Funken in der Farbe des neuen
                      Besitzers („pling")
     Burg getroffen   ein kleiner Aufschlag mit den Herzen darunter
     Burg erobert     der größte Augenblick des Spiels: goldener
                      Doppelring, Funkenkranz, aufsteigende Krone —
                      plus eine Ankündigung über der Karte
     Volk raus        Ankündigung + das Panel am Rand zuckt, bevor es
                      grau wird
     „on fire"        Serien-Bonus (0106): das Panel des Volkes leuchtet
                      acht Sekunden, bei einer EINZEL-Serie stattdessen
                      der Name des Kindes in der Namensliste
     Feld versinkt    Ruinen-Modus (0108): eine absackende Staubwolke,
                      ein fallender Brocken und Bröckchen nach außen —
                      in der Farbe des Volkes, dem die Kachel GEHÖRTE.
                      Dazu eine Ankündigung, wer sie hat versinken
                      lassen (das steht nicht auf der Karte, sondern
                      nur im Ereignis)

   Zwei Entscheidungen dahinter:

   (1) Die Spielfeld-Ereignisse werden NICHT aus RPC-Antworten
       gelesen, sondern aus dem VERGLEICH zweier Kartenstände
       (boardFx). Sonst bräuchte jeder Weg, auf dem sich eine Kachel
       ändern kann, seine eigene Meldung — und seit 0106 sind das
       vier (eigene Antwort, manueller Pick, Team-Bonus, Auto-Ablauf
       der Frist), von denen der Beamer ohnehin nur die Karte sieht.
       Ein Vergleich deckt alle ab, auch künftige — 0108 hat mit dem
       verschwindenden Feld („gone") genau davon profitiert: eine
       Zeile im Vergleich, kein fünfter Meldeweg.
   (2) Die Effekte liegen in einer EIGENEN Ebene (.cm-fxlayer) neben
       Sechsecken und Figuren, nicht darin: renderHexMap ersetzt bei
       jedem Takt das ganze SVG und die ganze Figurenebene — eine
       Animation darin wäre nach spätestens 8 Sekunden abgeschnitten,
       oft nach wenigen Millisekunden.

   Das „Leuchten" am Rand ist dagegen ein ZUSTAND mit Ablaufzeit
   (teamFireUntil/memberFireUntil/teamOutUntil), kein einmaliges
   Anhängen einer Klasse: fillRosters zeichnet die Panels bei jedem
   Takt neu, eine angehängte Klasse wäre beim nächsten Takt weg.

   Zum Anschauen ohne Raum: vorschau.html im selben Ordner. Sie lädt
   dieses tool.js und tool.css und erfindet nur den Server.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Die acht Völker ──────────────────────────────────────────────
     ACHTUNG, seit Migration 0097: der Index in diesen Listen ist das
     VOLK (0..7), NICHT mehr der Team-Slot auf dem Spielfeld. Solange
     die Lehrkraft „die ersten vier" spielen ließ, waren beide
     dasselbe; seit sie beliebige Völker an- und abwählen kann, hat ein
     Board mit den Brokkoli-Giraffen und dem Spuk-Einhorn die Slots 0/1,
     aber die Völker 2/6. Die Übersetzung macht `facOf` weiter unten —
     hier NIE direkt mit einem Slot indizieren. */
  /* Eine Farbe je Volk, nicht zwei. Bis zum UI-Durchgang stand hier
     zusätzlich eine FACTION_FILL-Liste (dieselben Farben, halb
     durchsichtig) — sie gehörte allein der Canvas-Karte des
     Teilnehmers, und die gibt es nicht mehr (siehe renderHexMap).
     Die gemalte Karte mischt ihre Flächen aus dieser einen Farbe. */
  const FACTION_STROKE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b',
                          '#a855f7', '#06b6d4', '#9a1f6e', '#f9a8d4'];

  /* ── Kingdoms of Mathoria: Fraktionsgrafiken ──────────────────────
     Reihenfolge deckungsgleich mit FACTION_STROKE — auch
     hier ist der Index das VOLK, nicht der Slot. ASSET_DIR ist
     absichtlich der volle Pfad ab MPSkills/ (nicht „sprites/…"): ein
     in tool.js gebautes <img src> wird relativ zur SEITE aufgelöst
     (lehrer.html/j.html liegen in MPSkills/), nicht relativ zu
     tool.js selbst — anders als url(...) in tool.css, das relativ zur
     Stylesheet-Datei auflöst. */
  const ASSET_DIR = 'tools/clash-of-math/sprites/';
  const FACTION_CASTLE = ['red carstle.png', 'blue carstle.png', 'green carstle.png', 'yellow carstle.png',
                           'lila carstle.png', 'türkis carstle.png', 'magenta carstle.png', 'rosa carstle.png'];
  const FACTION_UNIT   = ['red units.png', 'blue units.png', 'green units.png', 'yellow units.png',
                           'lila units.png', 'türkis units.png', 'magenta units.png', 'rosa units.png'];
  // Burg UND Einheiten in einem Bild — das Gruppenporträt des Volkes.
  // Nur die Lobby benutzt es (eine Spalte je gewähltem Volk); auf dem
  // Spielfeld bleiben Burg und Einheiten getrennt, weil sie dort auf
  // verschiedenen Kacheln stehen. Der Dateiname von Gelb ist wirklich
  // „yello Team.png" — Tippfehler im Ordner, nicht hier.
  const FACTION_TEAM   = ['red Team.png', 'blue Team.png', 'green Team.png', 'yello Team.png',
                           'lila Team.png', 'türkis Team.png', 'magenta Team.png', 'rosa Team.png'];
  // Der Name des Volkes. Er hat die Farbbezeichnung („Rot", „Blau")
  // als Anzeigename abgelöst: das Panel TRÄGT die Farbe, sie muss
  // nicht auch noch danebenstehen.
  const FACTION_LABEL  = ['Toast-Ritter', 'Robo-Enten', 'Brokkoli-Giraffen', 'Mal-Hasen',
                           'Kosmische Katzen', 'Okto-Pferdchen', 'Spuk-Einhorn', 'Wolkenvogel-Piraten'];
  // Sieben Namen sind Mehrzahl („Toast-Ritter gewinnen"), einer ist es
  // nicht („Spuk-Einhorn gewinnt"). Eine Liste statt einer Regel auf dem
  // Namen: „…-Einhorn" wäre eine Regel, die beim nächsten Volk wieder
  // falsch ist. Index ist das VOLK, wie in allen Listen hier.
  const FACTION_PLURAL = [true, true, true, true, true, true, false, true];
  const FACTION_COUNT  = 8;
  const esrc = name => encodeURI(ASSET_DIR + name);

  /* ─── Slot → Volk ────────────────────────────────────────────────
     `factions` ist die Übersetzungstabelle des Servers (0097):
     factions[slot] = Volk. Sie kommt in jeder Ansicht mit und wird in
     applyView gesetzt. Der Rückfall auf `slot` ist der Zustand vor
     0097 (Volk = Slot) — er greift nur, falls die Migration noch nicht
     gelaufen ist, und macht dann exakt das Alte.

     AB HIER nehmen alle Anzeigefunktionen einen SLOT entgegen. Wer
     eine der FACTION_*-Listen direkt indiziert, muss vorher durch
     facOf() — die einzige Ausnahme ist die Völker-Auswahl in der
     Lobby, die von Natur aus über Völker läuft, nicht über Slots. */
  let factions = [0, 1, 2, 3];
  const facOf    = s => (factions[s] != null ? factions[s] : s);
  const fStroke  = s => FACTION_STROKE[facOf(s)] ?? '#999';
  const fLabel   = s => FACTION_LABEL[facOf(s)]  ?? ('Team ' + (s + 1));
  const fCastle  = s => FACTION_CASTLE[facOf(s)] || FACTION_CASTLE[0];
  const fUnit    = s => FACTION_UNIT[facOf(s)]   || FACTION_UNIT[0];
  const fTeamPic = s => FACTION_TEAM[facOf(s)]   || FACTION_TEAM[0];
  /* Nicht jedes Volk ist gleich groß gebaut. Die Einheiten aller
     Völker laufen mit derselben Höhe über das Feld (UNIT_H) — bei den
     Brokkoli-Giraffen sah das falsch aus: eine Giraffe, die genauso
     hoch ist wie ein Toast-Ritter, liest sich nicht als Giraffe.
     Deshalb ein Faktor je VOLK (nicht je Slot, wie alle Listen hier),
     der nur die Einheit betrifft — die Burg bleibt unangetastet, sie
     ist das Maß, an dem die Kachelgröße hängt. */
  const FACTION_UNIT_SCALE = [1, 1, 1.2, 1, 1, 1, 1, 1];
  const fUnitScale = s => FACTION_UNIT_SCALE[facOf(s)] || 1;
  // „gewinnt" oder „gewinnen" — siehe FACTION_PLURAL. Unbekanntes Volk
  // (Rückfall „Team 3") ist Einzahl.
  const fVerb    = s => (FACTION_PLURAL[facOf(s)] ? 'gewinnen' : 'gewinnt');
  /* Dasselbe für jedes andere Zeitwort, das eine Ankündigung braucht
     („ist/sind ausgeschieden", „erobert/erobern eine Burg"). fVerb
     bleibt daneben stehen, weil es an genau einer Stelle im Siegerbild
     hängt und dort lesbarer ist als fV(slot, 'gewinnen', 'gewinnt'). */
  const fV = (s, plural, singular) => (FACTION_PLURAL[facOf(s)] ? plural : singular);

  let root = null, ctx = null, role = null;
  let els = {};
  let pollTimer = null, countdownTimer = null, matchTimerHandle = null, resizeObs = null, onWinResize = null;
  let channel = null, channelKey = null;
  let lastSig = null, lastView = null, busy = false, destroyed = false;
  let submitting = false;
  let matchEndsAtMs = 0, matchPeakMs = 1;
  // Lobby-Auswahl der Lehrkraft (Völker, nicht Slots) und ein Zähler
  // laufender Speicher-Aufrufe — solange der über 0 steht, hat die
  // Anzeige Vorrang vor der Antwort des Servers, siehe Klick-Zuhörer.
  let pickSel = [], pickBusy = 0;
  // Teilnehmer: der getippte Antwort-Text (Zeichenkette, nicht Zahl —
  // „-" und „0," sind gültige Zwischenstände, die keine Zahl sind),
  // die gerade aufgebaute Tastatur und ob das Karten-Fenster offen ist.
  let answerBuf = '', keyMode = null, mapOpen = false;
  // Serien-Boni (Migration 0106): offene manuelle Picks aus dem
  // Einzel-Bonus (10er-Serie), ihre Frist, der Countdown-Timer dafür,
  // die höchste bereits gezeigte Team-Event-id (Toast-Dedupe) und der
  // Auto-Dismiss-Timer des Toasts. Unabhängig von pickSel/pickBusy
  // oben — die gehören der Lehrkraft-Lobby (Völker-Auswahl), nicht
  // dem Spielbildschirm.
  let myPendingPicks = 0, pendingPickDeadlineMs = 0, pickCountdownTimer = null;
  let lastTeamEventId = 0, fireToastTimer = null, mapCloseTimer = null;

  /* ── Effekte (UI 18) ──────────────────────────────────────────────
     `fxTiles`/`fxCounts` sind der Kartenstand des letzten Abgleichs —
     aus ihrem Vergleich mit dem neuen Stand entstehen die Ereignisse
     (siehe boardFx). null heißt „noch nichts gesehen": der erste
     Abgleich einer Runde erzeugt nie Effekte, sonst käme beim Betreten
     eines laufenden Raums die halbe Karte auf einmal hoch.

     Die drei `*Until`-Ablagen sind ZUSTÄNDE mit Ablaufzeit, keine
     Klassen am DOM: die Panels am Rand werden bei jedem Takt neu
     geschrieben (fillRosters), eine angehängte Klasse wäre dann weg.
     Wer sie liest, fragt „leuchtet das gerade?" — nicht „wurde da mal
     eine Klasse gesetzt?". */
  let fxTiles = null, fxCounts = null;
  const FIRE_MS = 8000;    // Sönkes Vorgabe: „leuchtet … für 8 Sekunden"
  const OUT_MS  = 3400;    // so lange zuckt ein ausgeschiedenes Volk nach
  let teamFireUntil = {}, memberFireUntil = {}, teamOutUntil = {};
  let glowTimer = null;
  // Ereignis-Ids, die schon verarbeitet sind. Die `primed`-Schalter
  // verhindern, dass der ERSTE Abruf die letzten 20 Einträge des Logs
  // (0106 trimmt darauf) als frische Nachrichten abfeuert.
  let lastRoomEventId = 0, roomEventsPrimed = false, teamEventsPrimed = false;
  let announceQueue = [], announceTimer = null;

  const MAP_GAP = 12, MAP_MIN = 260, MAP_MAX = 2000;

  // Höhe der Figuren, in Vielfachen des Sechseck-Radius. Sie stehen
  // mit den Füßen auf dem Kachel-Mittelpunkt und ragen deshalb über
  // ihre Kachel hinaus — die Burg deutlich, damit sie als Hauptstadt
  // liest, die Einheiten knapp, damit sie das Feld nicht zustellen.
  const CASTLE_H = 2.22;
  const UNIT_H   = 1.28;
  // Die Burg rutscht um diesen Anteil IHRER EIGENEN Höhe nach unten,
  // sitzt also tiefer in ihrer Kachel statt nur darauf zu stehen.
  // Der Wert geht als `--drop` ins style-Attribut; die Verschiebung
  // rechnet tool.css daraus. Er steht bewusst nur hier, weil die
  // Kopffreiheit unten davon abhängt.
  const CASTLE_DROP = 0.20;
  // Was die Burg nach dem Absacken noch über den Kachel-Mittelpunkt
  // ragt — genau so viel Platz muss boardExtent über der obersten
  // Kachelreihe frei lassen, sonst wird sie oben abgeschnitten.
  const CASTLE_HEADROOM = CASTLE_H * (1 - CASTLE_DROP);

  /* ─── EINE Karte für beide Rollen ───────────────────────────────
     Bis zum UI-Durchgang gab es zwei: der Beamer bekam die gemalte
     Karte (SVG-Sechsecke, echte Fraktionsgrafiken, Territoriums-
     grenzen), das Tablet ein Canvas mit Platzhalterfarben und einem
     🏰-Zeichen. Zwei Bilder derselben Sache, von denen eines deutlich
     schlechter war — und ausgerechnet das stand vor dem Kind.

     Die Canvas-Fassung (paintBoard) ist deshalb ersatzlos weg. Beide
     Rollen zeichnen jetzt mit renderHexMap(); was sie unterscheidet,
     sind zwei Schalter:

       units      Einheiten und Burgen laufen mit (Beamer) oder das
                  Feld bleibt leer bis auf die Burgen (Tablet — der
                  Blick soll auf die Gebiete gehen, nicht auf Figuren)
       highlight  ein Team-Slot, dessen Kacheln hervorgehoben werden
                  (auf dem Tablet das eigene Volk)

     Zwei Lehren aus dem Showroom (MPSkills/tools/clash-of-math/
     showroom.html, dort ausführlich dokumentiert):
     (1) Zentrierung (translate(-50%,-100%), unten-mittig) und
         Wander-Animation dürfen NICHT beide auf derselben
         `transform`-Eigenschaft desselben Elements sitzen — eine
         CSS-Animation ersetzt `transform` komplett, statt sich mit
         dem statischen Wert zu kombinieren. Deshalb zwei
         verschachtelte Elemente: cm-sprite (Position, statisch) und
         cm-spriteinner (Animation).
     (2) Die Territoriumsgrenze kommt aus den echten Nachbarschafts-
         kanten (Winkel zum Nachbar-Kachelmittelpunkt), nicht aus
         einer angenommenen Reihenfolge der Nachbar-Richtungen. */
  // Hoch gezogen aus computeBorderSegments (waren dort inline), damit
  // legalPickTargets (Migration 0106) dieselbe Nachbarschaftsregel wie
  // clash_is_neighbor/clash_capture_random nutzen kann, ohne sie ein
  // drittes Mal hinzuschreiben.
  const HEX_DIRS_EVEN = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  const HEX_DIRS_ODD  = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];

  function computeBorderSegments(tiles, centerFn, hexR) {
    const ownerMap = new Map();
    tiles.forEach(t => ownerMap.set(t.r + ',' + t.c, t.team));
    const segsByTeam = {};
    tiles.forEach(t => {
      const dirs = (t.r % 2 === 1) ? HEX_DIRS_ODD : HEX_DIRS_EVEN;
      const p = centerFn(t.r, t.c);
      dirs.forEach(d => {
        const nr = t.r + d[0], nc = t.c + d[1];
        const neighborTeam = ownerMap.get(nr + ',' + nc);
        if (neighborTeam === t.team) return;
        const np = centerFn(nr, nc);
        const angleDeg = Math.atan2(np.y - p.y, np.x - p.x) * 180 / Math.PI;
        let edgeIdx = Math.round(angleDeg / 60);
        edgeIdx = ((edgeIdx % 6) + 6) % 6;
        const a1 = Math.PI / 3 * edgeIdx - Math.PI / 6;
        const a2 = Math.PI / 3 * (edgeIdx + 1) - Math.PI / 6;
        const v1 = { x: p.x + hexR * Math.cos(a1), y: p.y + hexR * Math.sin(a1) };
        const v2 = { x: p.x + hexR * Math.cos(a2), y: p.y + hexR * Math.sin(a2) };
        (segsByTeam[t.team] = segsByTeam[t.team] || []).push([v1, v2]);
      });
    });
    return segsByTeam;
  }

  function borderLayerHTML(segsByTeam) {
    let out = '';
    Object.keys(segsByTeam).forEach(team => {
      const d = segsByTeam[team].map(s =>
        'M' + s[0].x.toFixed(1) + ',' + s[0].y.toFixed(1) + ' L' + s[1].x.toFixed(1) + ',' + s[1].y.toFixed(1)
      ).join(' ');
      const raw = fStroke(parseInt(team, 10));
      out += '<path class="cm-border" d="' + d + '" style="--raw:' + raw + '"></path>';
      out += '<path class="cm-border cm-border--inner" d="' + d + '" style="--raw:' + raw + '"></path>';
    });
    return out;
  }

  /* ─── Legale Zielfelder für den manuellen Serien-Bonus (0106) ────
     Dieselbe Regel wie clash_is_neighbor/clash_capture_random: jedes
     fremde oder neutrale Feld, das an eine eigene Kachel angrenzt.
     Reine Anzeige-Hilfe (welche Kacheln pulsieren) — der Server prüft
     beim Antippen (clash_pick_tile) alles noch einmal von Grund auf. */
  function legalPickTargets(tiles, myTeam) {
    const mineSet = new Set();
    (tiles || []).forEach(t => { if (t.team === myTeam) mineSet.add(t.r + ',' + t.c); });
    const out = new Set();
    (tiles || []).forEach(t => {
      if (t.team === myTeam) return;
      const dirs = (t.r % 2 === 1) ? HEX_DIRS_ODD : HEX_DIRS_EVEN;
      if (dirs.some(d => mineSet.has((t.r + d[0]) + ',' + (t.c + d[1])))) out.add(t.r + ',' + t.c);
    });
    return out;
  }

  /* ─── Ausdehnung des Spielfelds, in Kachel-Einheiten ─────────────
     Die Layouts aus clash_layouts (0093) füllen ihr rows×cols-Raster
     nie ganz aus — sie sind aus einem Vieleck geschnitten, je nach
     Team-Zahl mit unterschiedlich viel Luft am Rand. Wer auf das
     ganze Raster mittet, verschenkt diese Luft doppelt: das Feld
     sitzt außermittig UND bleibt kleiner als nötig. Deshalb das
     Umfassungsrechteck der TATSÄCHLICHEN Kacheln.

     `spanX`/`spanY` sind die Ausdehnung in Vielfachen einer halben
     Kachelbreite bzw. -höhe; renderHexMap teilt die verfügbare
     Fläche durch sie und bekommt daraus seine beiden Maßstäbe.

     Oben ist mehr Platz nötig als unten: die Burg ragt über ihre
     Kachel hinaus, weil sie mit den Füßen auf deren Mittelpunkt steht
     — genau CASTLE_HEADROOM viel (siehe dort). */
  const SQ3 = Math.sqrt(3);
  const hexUnit = (r, c) => ({
    x: (c + 0.5) * SQ3 + (r % 2 === 1 ? SQ3 / 2 : 0),
    y: (r + 0.5) * 1.5
  });

  function boardExtent(tiles) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    tiles.forEach(t => {
      const u = hexUnit(t.r, t.c);
      if (u.x < minX) minX = u.x;
      if (u.x > maxX) maxX = u.x;
      if (u.y < minY) minY = u.y;
      if (u.y > maxY) maxY = u.y;
    });
    minX -= SQ3 / 2; maxX += SQ3 / 2;   // halbe Kachelbreite links/rechts
    minY -= CASTLE_HEADROOM;             // Kopffreiheit für die Burg
    maxY += 1.0;                         // halbe Kachelhöhe unten
    return {
      minX: minX, minY: minY,
      spanX: Math.max(0.001, maxX - minX),
      spanY: Math.max(0.001, maxY - minY)
    };
  }

  // Der Bodenschein ist ein Oval unter der Figur. Breite und Höhe
  // kommen getrennt herein, damit er der (in der Breite gestreckten)
  // Kachelform folgt statt der unverzerrten Figur.
  function groundGlowHTML(p, w, h, raw) {
    return '<div class="cm-groundglow" style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + w + 'px;height:' + h + 'px;--raw:' + raw + '"></div>';
  }

  /* ─── Die Leben einer Burg ────────────────────────────────────
     Drei Herzen dicht unter der Burg, verbrauchte bleiben als
     leere Umrisse stehen — „noch zwei" liest sich nur, wenn auch
     zu sehen ist, wie viele es einmal waren. Der Wert kommt als
     `hp` an der Kachel vom Server (Migration 0100); fehlt er (alte
     Fassung noch nicht eingespielt), stehen alle drei da und die
     Anzeige sagt schlicht nichts Falsches.

     Die Herzen sitzen im UNTEREN Teil der Kachel: die Burg steht mit
     den Füßen auf dem Kachel-Mittelpunkt und ragt von dort nach oben,
     unter ihr ist Platz. */
  const CASTLE_LIVES = 3;
  function heartsHTML(p, scale, hp, z) {
    const left = Math.max(0, Math.min(CASTLE_LIVES, hp == null ? CASTLE_LIVES : hp));
    let out = '<div class="cm-hearts" style="left:' + p.x.toFixed(1) + 'px;top:' + (p.y + scale * 0.42).toFixed(1) + 'px;' +
      'font-size:' + Math.max(8, scale * 0.46).toFixed(1) + 'px;z-index:' + z + '">';
    for (let i = 0; i < CASTLE_LIVES; i++) {
      out += '<span class="cm-heart' + (i < left ? '' : ' cm-heart--lost') + '">♥</span>';
    }
    return out + '</div>';
  }

  /* ─── Wie viele Einheiten ein Volk zeigt und WO sie stehen ─────
     Bis zum Feature-Durchgang waren es feste „bis zu 3", und ihr Ort
     wurde bei jedem Zeichnen neu aus der sortierten Feldliste
     gerechnet (`(k+0.5) * länge / anzahl`). Beides war falsch:

     (1) Die Zahl sagte nichts über das Volk aus — zwei Felder trugen
         so viele Einheiten wie zwanzig.
     (2) Weil der Index aus der LÄNGE der Liste kam, rückte jede
         einzelne Eroberung sämtliche Einheiten des Volkes auf andere
         Kacheln: sie sprangen bei jedem Takt über die Karte.

     Jetzt: eine Einheit je vier eigenen Feldern (2 Felder → 0,
     5 → 1, 20 → 5), und die einmal vergebenen Plätze BLEIBEN. Verliert
     ein Volk eine Kachel, auf der eine Einheit steht, fällt genau
     diese Einheit weg und wird — wenn die Feldzahl sie noch trägt —
     auf einer freien eigenen Kachel neu aufgestellt. Wer zusieht,
     sieht eine Einheit umziehen statt aller auf einmal.

     `unitSpots` hält den Stand zwischen zwei Zeichnungen: Volk → Liste
     von "r,c". Er ist reine Anzeige, steht bewusst nicht auf dem
     Server (dort ist eine Einheit kein Ding, nur ein Bild) und heilt
     sich selbst: Schlüssel, die dem Volk nicht mehr gehören, fallen
     beim nächsten Zeichnen heraus. */
  const TILES_PER_UNIT = 4;
  let unitSpots = {};

  function planUnits(team, teamTiles) {
    const key = String(team);
    const byKey = new Map();
    teamTiles.forEach(t => byKey.set(t.r + ',' + t.c, t));
    // Auf einer Burgkachel steht keine Einheit — dort steht die Burg.
    const open = teamTiles.filter(t => !t.castle).sort((a, b) => (a.r - b.r) || (a.c - b.c));
    const want = Math.min(Math.floor(teamTiles.length / TILES_PER_UNIT), open.length);

    const kept = [];
    (unitSpots[key] || []).forEach(k => {
      const t = byKey.get(k);
      if (t && !t.castle && kept.indexOf(k) < 0) kept.push(k);
    });
    while (kept.length > want) kept.pop();

    if (kept.length < want) {
      const free = open.filter(t => kept.indexOf(t.r + ',' + t.c) < 0);
      while (kept.length < want && free.length) {
        // Neue Einheiten stellen sich möglichst weit von den schon
        // stehenden auf, damit sich das Gebiet gleichmäßig füllt statt
        // alle in einer Ecke zu drängen. Ohne schon stehende Einheiten
        // entscheidet die (sortierte, also stabile) Reihenfolge.
        let best = 0, bestD = -1;
        for (let i = 0; i < free.length; i++) {
          const u = hexUnit(free[i].r, free[i].c);
          let d = Infinity;
          kept.forEach(k => {
            const o = byKey.get(k);
            if (!o) return;
            const uo = hexUnit(o.r, o.c);
            d = Math.min(d, Math.hypot(u.x - uo.x, u.y - uo.y));
          });
          if (!isFinite(d)) d = 0;
          if (d > bestD) { bestD = d; best = i; }
        }
        const t = free.splice(best, 1)[0];
        kept.push(t.r + ',' + t.c);
      }
    }

    unitSpots[key] = kept;
    return kept.map(k => byKey.get(k)).filter(Boolean);
  }

  /* dom  = { wrap, svg, icons } — drei Elemente, die zusammengehören
             (siehe mapDomHTML/mapDom weiter unten)
     opts = { units: bool, highlight: slot|null } */
  function renderHexMap(dom, view, opts) {
    opts = opts || {};
    if (!view || !view.rows || !view.cols || !dom || !dom.wrap || !dom.svg || !dom.icons) return;
    const W = dom.wrap.clientWidth, H = dom.wrap.clientHeight;
    if (W < 10 || H < 10) return;
    const tiles = view.tiles || [];
    if (!tiles.length) { dom.svg.innerHTML = ''; dom.icons.innerHTML = ''; return; }
    const gap = 2.5;
    const withUnits = opts.units !== false;
    const mine = (opts.highlight == null) ? null : opts.highlight;

    /* ─── EIN Maßstab: die Sechsecke bleiben regelmäßig ────────────
       Ausprobiert und wieder verworfen war, waagerecht und senkrecht
       getrennt zu skalieren, damit das Feld die Fläche restlos füllt —
       das zieht die Kacheln in die Breite und war sofort zu sehen.
       Also der kleinere der beiden Maßstäbe für beide Richtungen; was
       dann links und rechts frei bleibt, ist Pergament und darf das
       auch sein. Das Feld wird trotzdem so groß wie möglich, weil die
       Fläche selbst (siehe fitPresenterMap) alles einnimmt, was
       zwischen den Völker-Spalten liegt. */
    const ext = boardExtent(tiles);
    const scale = Math.min(W / ext.spanX, H / ext.spanY);
    const offX = (W - ext.spanX * scale) / 2;
    const offY = (H - ext.spanY * scale) / 2;
    const center = (r, c) => {
      const u = hexUnit(r, c);
      return { x: (u.x - ext.minX) * scale + offX, y: (u.y - ext.minY) * scale + offY };
    };

    let poly = '';
    tiles.forEach(t => {
      const p = center(t.r, t.c);
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i - Math.PI / 6;
        pts.push((p.x + (scale - gap) * Math.cos(a)).toFixed(1) + ',' + (p.y + (scale - gap) * Math.sin(a)).toFixed(1));
      }
      // Das eigene Gebiet wird HELLER, nicht andersfarbig: die Farbe
      // sagt bereits, wem die Kachel gehört: das darf die Hervorhebung
      // nicht überschreiben, sonst gehört das eigene Feld plötzlich
      // niemandem mehr.
      // cm-hex--pickable (0106): legales Ziel für den offenen manuellen
      // Serien-Bonus — nur gesetzt, wenn der Aufrufer ein opts.pickable-
      // Set mitgibt (renderPlayerMap tut das nur, solange pending_picks
      // offen sind).
      const pickable = opts.pickable && opts.pickable.has(t.r + ',' + t.c);
      const cls = 'cm-hex' + (mine != null && t.team === mine ? ' cm-hex--mine' : '') +
                  (pickable ? ' cm-hex--pickable' : '');
      poly += '<polygon class="' + cls + '" data-r="' + t.r + '" data-c="' + t.c + '" points="' +
        pts.join(' ') + '" style="--raw:' + fStroke(t.team) + '"></polygon>';
    });
    const segs = computeBorderSegments(tiles, center, scale - Math.min(gap, 1));
    dom.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    /* Das eigene Gebiet bekommt seine AUSSENGRENZE weiß — und zwar
       ganz zuletzt, also im Vordergrund (SVG malt in Dokument-
       reihenfolge). Vorher trug jedes eigene Sechseck eine helle
       Kante: dadurch leuchteten ausgerechnet die Linien ZWISCHEN den
       eigenen Kacheln, das Gebiet zerfiel optisch in Einzelteile statt
       als ein Land zu lesen. Die Grenzsegmente aus
       computeBorderSegments sind genau die Kanten nach draußen — die
       gehören hervorgehoben, die inneren nicht. */
    let mineBorder = '';
    if (mine != null && segs[mine]) {
      const d = segs[mine].map(s =>
        'M' + s[0].x.toFixed(1) + ',' + s[0].y.toFixed(1) + ' L' + s[1].x.toFixed(1) + ',' + s[1].y.toFixed(1)
      ).join(' ');
      mineBorder = '<path class="cm-border cm-border--mineglow" d="' + d + '"></path>' +
                   '<path class="cm-border cm-border--mine" d="' + d + '"></path>';
    }
    dom.svg.innerHTML = poly + borderLayerHTML(segs) + mineBorder;

    const byTeam = {};
    tiles.forEach(t => (byTeam[t.team] = byTeam[t.team] || []).push(t));
    let icons = '';
    Object.keys(byTeam).forEach(teamKey => {
      const team = parseInt(teamKey, 10);
      // Neutrale Felder (slot -1, siehe Migration 0105 — sie füllen das
      // Loch, das gleich große Völker in der Mitte offen ließen) gehören
      // niemandem: keine Burg, keine Einheit, nur die graue Kachel aus
      // dem poly-Durchlauf oben. fUnit(-1) fiele sonst auf Rot zurück
      // und ein Volk stünde unbemannt auf fremden Feldern.
      if (team < 0) return;
      const teamTiles = byTeam[teamKey];
      const raw = fStroke(team);
      // MEHRZAHL, seit eine Burg übernommen statt zerstört wird
      // (Migration 0100): wer die letzte Herzkammer einer fremden Burg
      // trifft, bekommt sie — und hat dann zwei. `find` zeichnete
      // damals nur die erste und ließ die eroberte unsichtbar auf der
      // Karte stehen.
      teamTiles.filter(t => t.castle).forEach(castleTile => {
        const p = center(castleTile.r, castleTile.c);
        const h = scale * CASTLE_H;
        const z = 1000 + castleTile.r * 10 + 9;
        icons += groundGlowHTML(p, scale * 1.7, scale * 0.94, raw);
        icons += '<div class="cm-sprite" style="left:' + p.x + 'px;top:' + p.y + 'px;height:' + h + 'px;' +
          '--drop:' + (CASTLE_DROP * 100) + '%;z-index:' + z + '">' +
          '<div class="cm-spriteinner cm-spriteinner--castle"><img src="' + esrc(fCastle(team)) + '" alt=""></div></div>';
        icons += heartsHTML(p, scale, castleTile.hp, z + 1);
        // KEINE Beschriftung über der Burg. Der Showroom hatte dort die
        // Farbbezeichnung („Rot", „Türkis") — die ist weg, seit das
        // Volk „Toast-Ritter" heißt und die Farbe allein die
        // Zugehörigkeit trägt. Der Volksname an ihrer Stelle ist
        // ausprobiert und wieder verworfen: bei acht Völkern stehen
        // die Burgen so dicht, dass „Spuk-Einhorn" und
        // „Wolkenvogel-Piraten" ineinanderlaufen. Identifiziert wird
        // ein Gebiet ohnehin doppelt — über die Farbe der Umrandung
        // und über dieselben Figuren, die auf dem Panel am Rand
        // stehen. Und was hier nicht steht, verdeckt keine Figur.
      });
      // Nicht jedes eroberte Feld bekommt eine eigene Einheit (bei 40+
      // Feldern wäre das nur noch Gewusel) — die Zahl wächst mit dem
      // Gebiet (siehe planUnits), die Plätze bleiben stehen.
      // Auf dem Tablet fallen sie ganz weg (units:false): dort ist die
      // Karte eine Auskunft („wie steht es?"), keine Bühne.
      if (!withUnits) return;
      const uscale = fUnitScale(team);
      planUnits(team, teamTiles).forEach((t, k) => {
        const p = center(t.r, t.c);
        const h = scale * UNIT_H * uscale;
        icons += groundGlowHTML(p, scale * 0.94, scale * 0.52, raw);
        icons += '<div class="cm-sprite" style="left:' + p.x + 'px;top:' + p.y + 'px;height:' + h + 'px;z-index:' + (1000 + t.r * 10 + 5) + '">' +
          '<div class="cm-spriteinner cm-spriteinner--unit" style="animation-delay:' + ((k % 6) * 0.5) + 's"><img src="' + esrc(fUnit(team)) + '" alt=""></div></div>';
      });
    });
    dom.icons.innerHTML = icons;

    /* Der Maßstab bleibt an der Karte hängen, damit ein Effekt später
       (spawnTileFx) den Ort einer Kachel in Bildpunkten wiederfinden
       kann, ohne die ganze Rechnung zu wiederholen. Deshalb muss der
       Aufrufer ein STABILES dom-Objekt mitgeben und nicht bei jedem
       Zeichnen ein frisch gebautes — sonst wäre die Ablage jedes Mal
       weg (siehe els.bmap in buildPresenterDOM). */
    dom.geo = { center: center, scale: scale };
  }

  /* ══════════════════════════════════════════════════════════
     Effekte (UI 18) — siehe Kopfkommentar der Datei
     ══════════════════════════════════════════════════════════ */

  /* ─── Was hat sich auf der Karte geändert? ───────────────────────
     Ein reiner Vergleich zweier Kartenstände. Er kennt keine RPC und
     keinen Absender — deshalb gilt er gleichermaßen für die eigene
     Antwort, einen manuellen Pick, die 7 Felder des Team-Bonus und
     die Felder, die der Server nach Fristablauf selbst erobert.

     Rückgabe ist eine Liste; Zustandsänderungen an der Anzeige macht
     erst noteFxState, gezeichnet wird erst in flushFx. Diese Trennung
     ist nicht Zierde: „ausgeschieden" muss VOR dem Neuzeichnen der
     Panels feststehen, die Ringe und Funken erst DANACH entstehen. */
  function boardFx(v) {
    const tiles = (v && v.tiles) || [];
    const next = new Map();
    const counts = {};
    tiles.forEach(t => {
      next.set(t.r + ',' + t.c, { team: t.team, hp: t.hp, castle: !!t.castle });
      counts[t.team] = (counts[t.team] || 0) + 1;
    });

    // Kein Vergleichsstand (erster Takt, gerade erst gestartet) oder
    // gar keine Karte: nur merken, nichts zeigen.
    const prev = fxTiles, prevCounts = fxCounts;
    fxTiles = next; fxCounts = counts;
    if (!prev || !tiles.length || (v && v.phase !== 'running')) return [];

    const out = [];
    next.forEach((t, key) => {
      const p = prev.get(key);
      if (!p) return;                       // neue Kachel: kein Ereignis
      if (p.team !== t.team) {
        // Neutrale Felder (Slot -1, 0105) können erobert WERDEN, aber
        // eine Kachel fällt nie an niemanden zurück — der Fall bliebe
        // sonst als Effekt in der Farbe „kein Volk" stehen.
        if (t.team < 0) return;
        const c = key.split(',');
        out.push({ kind: t.castle ? 'castle' : 'capture',
                   r: +c[0], c: +c[1], team: t.team, prev: p.team });
      } else if (t.castle && p.hp != null && t.hp != null && t.hp < p.hp) {
        const c = key.split(',');
        out.push({ kind: 'hit', r: +c[0], c: +c[1], team: t.team, hp: t.hp });
      }
    });

    /* 0108: Kacheln, die es vorher gab und jetzt nicht mehr — der
       Ruinen-Modus lässt sie vom Spielfeld verschwinden. Bis dahin
       konnte eine Kachel nur den Besitzer wechseln, nie weggehen;
       deshalb sah der Vergleich oben nur in EINE Richtung. Die Farbe
       ist die des VERLIERENDEN Volkes — wer sie hat versinken lassen,
       steht nicht auf der Karte, sondern im Ereignis (board_shrink,
       siehe applyRoomEvents/applyTeamEvents). */
    prev.forEach((p, key) => {
      if (next.has(key)) return;
      const c = key.split(',');
      out.push({ kind: 'gone', r: +c[0], c: +c[1], team: p.team });
    });

    // Ausgeschieden: hatte Felder, hat keine mehr. Über prevCounts,
    // nicht über die Kacheln — ein Volk verschwindet ja gerade daraus.
    Object.keys(prevCounts || {}).forEach(k => {
      const slot = parseInt(k, 10);
      if (slot < 0) return;
      if ((prevCounts[k] || 0) > 0 && !(counts[k] > 0)) out.push({ kind: 'out', team: slot });
    });
    return out;
  }

  function resetFx() {
    fxTiles = null; fxCounts = null;
    teamFireUntil = {}; memberFireUntil = {}; teamOutUntil = {};
    if (glowTimer) { clearTimeout(glowTimer); glowTimer = null; }
  }

  // Zustand, den das Zeichnen gleich lesen wird — muss deshalb VOR dem
  // Zeichnen laufen.
  function noteFxState(list) {
    if (!list || !list.length) return;
    const until = Date.now() + OUT_MS;
    list.forEach(e => { if (e.kind === 'out') teamOutUntil[e.team] = until; });
    scheduleGlowRepaint();
  }

  /* ─── Welche Karten stehen gerade vor jemandem? ──────────────────
     Der Beamer hat immer dieselbe; der Teilnehmer hat zwei, von denen
     meist keine sichtbar ist (die Karte ist standardmäßig zu). Ein
     Effekt in eine unsichtbare Karte zu hängen wäre nicht falsch, nur
     nutzlos — und er liefe dort trotzdem und würde später auf einem
     inzwischen ganz anderen Kartenausschnitt sichtbar. */
  function fxTargets() {
    if (role === 'presenter') {
      return (els.bmap && els.boardWrap && !els.boardWrap.classList.contains('cm-hide'))
        ? [els.bmap] : [];
    }
    const out = [];
    if (mapOpen && els.pmap && els.pmap.fx) out.push(els.pmap);
    if (els.out && !els.out.classList.contains('cm-hide') && els.omap && els.omap.fx) out.push(els.omap);
    return out;
  }

  function addFx(dom, cls, x, y, size, raw, ms, text, angle) {
    const el = document.createElement('div');
    el.className = 'cm-fx ' + cls;
    el.style.left = x.toFixed(1) + 'px';
    el.style.top  = y.toFixed(1) + 'px';
    el.style.setProperty('--fx', size.toFixed(1) + 'px');
    if (raw)   el.style.setProperty('--raw', raw);
    if (angle != null) el.style.setProperty('--a', angle + 'deg');
    if (text)  el.textContent = text;
    dom.fx.appendChild(el);
    // Aufräumen über die Zeit statt über 'animationend': ein Element
    // mit mehreren Animationen meldet mehrfach, und eine Karte, die
    // während des Laufs unsichtbar wird, meldet gar nicht mehr.
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, ms);
  }

  const SPARKS_SMALL = 6, SPARKS_BIG = 12;
  function spawnTileFx(dom, e) {
    if (!dom || !dom.fx || !dom.geo) return;
    const p = dom.geo.center(e.r, e.c);
    const s = dom.geo.scale;
    const raw = fStroke(e.team);
    if (e.kind === 'castle') {
      // Der größte Augenblick des Spiels — und der einzige Effekt, der
      // GOLD statt Volksfarbe trägt: eine eroberte Burg gehört jetzt
      // zwar einem Volk, das Ereignis selbst gehört aber der Runde.
      addFx(dom, 'cm-fx--flash',  p.x, p.y, s * 4.4, raw, 900);
      addFx(dom, 'cm-fx--ring cm-fx--ring--gold', p.x, p.y, s * 5.2, raw, 1400);
      addFx(dom, 'cm-fx--ring cm-fx--ring--gold cm-fx--ring--late', p.x, p.y, s * 3.6, raw, 1400);
      for (let i = 0; i < SPARKS_BIG; i++) {
        addFx(dom, 'cm-fx--spark cm-fx--spark--gold', p.x, p.y, s * 2.6, raw, 1200, '', (360 / SPARKS_BIG) * i);
      }
      addFx(dom, 'cm-fx--crown', p.x, p.y - s * 0.5, s * 1.5, raw, 1500, '👑');
    } else if (e.kind === 'hit') {
      addFx(dom, 'cm-fx--ring cm-fx--ring--hit', p.x, p.y, s * 2.2, raw, 620);
      addFx(dom, 'cm-fx--burst', p.x, p.y, s * 1.15, raw, 700, '💥');
    } else if (e.kind === 'gone') {
      // 0108: die Kachel ist WEG, nicht erobert — also kein Ring nach
      // außen (der erzählt „hier ist etwas dazugekommen"), sondern eine
      // Wolke, die absackt, und Bröckchen, die nach außen fallen. In
      // der Farbe dessen, der sie verloren hat.
      addFx(dom, 'cm-fx--dust', p.x, p.y, s * 2.6, raw, 900);
      addFx(dom, 'cm-fx--burst cm-fx--burst--dust', p.x, p.y, s * 1.2, raw, 900, '🪨');
      for (let i = 0; i < SPARKS_SMALL; i++) {
        addFx(dom, 'cm-fx--crumb', p.x, p.y, s * 1.4, raw, 880, '', (360 / SPARKS_SMALL) * i + 30);
      }
    } else {
      // Das „Pling" beim gewöhnlichen Feld: knapp unter einer Sekunde,
      // in der Farbe des NEUEN Besitzers — es erzählt, wer gerade
      // gewonnen hat, nicht wer verloren hat.
      addFx(dom, 'cm-fx--ring', p.x, p.y, s * 2.9, raw, 820);
      addFx(dom, 'cm-fx--pop',  p.x, p.y, s * 1.5, raw, 620);
      for (let i = 0; i < SPARKS_SMALL; i++) {
        addFx(dom, 'cm-fx--spark', p.x, p.y, s * 1.7, raw, 760, '', (360 / SPARKS_SMALL) * i + 15);
      }
    }
  }

  function flushFx(list) {
    if (!list || !list.length) return;
    const targets = fxTargets();
    list.forEach(e => {
      if (e.kind === 'out') {
        if (role === 'presenter') {
          announce(fLabel(e.team) + ' ' + fV(e.team, 'sind', 'ist') + ' ausgeschieden', 'cm-announce--out');
        }
        return;
      }
      targets.forEach(dom => spawnTileFx(dom, e));
      if (e.kind === 'castle' && role === 'presenter') {
        announce(fLabel(e.team) + ' ' + fV(e.team, 'erobern', 'erobert') + ' eine Burg!', 'cm-announce--castle');
      }
    });
  }

  /* ─── Ankündigungen über der Karte (nur Beamer) ──────────────────
     Nacheinander, nicht übereinander: bei einer Burgübernahme, die
     zugleich ein Volk auslöscht, kommen zwei auf einmal — und zwei
     Sätze an derselben Stelle sind keiner. Die Schlange ist auf drei
     gedeckelt, denn was vier Meldungen alt ist, erklärt das Bild auf
     der Karte längst selbst. */
  function announce(text, cls) {
    if (role !== 'presenter' || !els.announce) return;
    announceQueue.push({ text: text, cls: cls });
    if (announceQueue.length > 3) announceQueue = announceQueue.slice(-3);
    if (!announceTimer) runAnnounce();
  }
  function runAnnounce() {
    if (!els.announce) { announceTimer = null; return; }
    const a = announceQueue.shift();
    if (!a) { announceTimer = null; els.announce.classList.add('cm-hide'); return; }
    els.announce.className = 'cm-announce' + (a.cls ? ' ' + a.cls : '');
    els.announce.textContent = a.text;
    void els.announce.offsetWidth;   // Neustart der Einblendung erzwingen
    els.announce.classList.add('cm-announce--show');
    announceTimer = setTimeout(() => {
      if (els.announce) els.announce.classList.remove('cm-announce--show');
      announceTimer = setTimeout(runAnnounce, 280);
    }, 2200);
  }
  function stopAnnounce() {
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = null;
    announceQueue = [];
    if (els.announce) { els.announce.className = 'cm-announce cm-hide'; els.announce.textContent = ''; }
  }

  /* ─── „on fire" (0106) als leuchtender Zustand ───────────────────
     Ein Serien-Bonus feuert genau einmal; sichtbar sein soll er acht
     Sekunden. Deshalb ein Ablaufzeitpunkt je Volk bzw. je Kind statt
     einer Klasse am Element: die Panels am Rand werden bei jedem Takt
     neu geschrieben, und ein Takt kommt spätestens alle 8 Sekunden. */
  function noteFireEvent(slot, e) {
    if (slot == null || slot < 0) return;
    const until = Date.now() + FIRE_MS;
    if (e.kind === 'team_fire') {
      teamFireUntil[slot] = until;
    } else if (e.kind === 'individual_fire') {
      const name = e.payload && e.payload.name;
      // Zugeordnet wird über den ANZEIGENAMEN, weil genau er auch in
      // der Namensliste des Panels steht (beide aus skill_seat_name).
      // Zwei Kinder mit demselben Namen in einem Volk leuchten damit
      // gemeinsam — was auf dem Bildschirm nicht falsch ist: dort
      // steht der Name zweimal, und einer von beiden ist gemeint.
      if (name) memberFireUntil[slot + ' ' + name] = until;
    }
  }
  const isFire   = (m, k) => (m[k] || 0) > Date.now();
  const teamFire = slot => isFire(teamFireUntil, slot);
  const memberFire = (slot, name) => isFire(memberFireUntil, slot + ' ' + name);

  /* Ein Leuchten hört von selbst auf — aber nur, wenn danach noch
     einmal gezeichnet wird. Der reguläre Takt kommt bis zu 8 Sekunden
     später (und in einer ruhigen Minute gar nicht, weil sich die
     Signatur nicht ändert), also holt dieser Zeitgeber das Zeichnen
     genau zum Ablauf nach. */
  function scheduleGlowRepaint() {
    if (glowTimer) { clearTimeout(glowTimer); glowTimer = null; }
    const now = Date.now();
    let next = Infinity;
    [teamFireUntil, memberFireUntil, teamOutUntil].forEach(m => {
      Object.keys(m).forEach(k => { if (m[k] > now && m[k] < next) next = m[k]; });
    });
    if (next === Infinity) return;
    glowTimer = setTimeout(glowRepaint, Math.max(80, next - now + 50));
  }
  function glowRepaint() {
    glowTimer = null;
    if (destroyed || !lastView) return;
    if (role === 'presenter') {
      if (lastView.phase === 'running') fillRosters(lastView);
    } else if (lastView.me && lastView.phase === 'running') {
      renderFactionRow(lastView, lastView.me.team, tileCounts(lastView));
      applyHeroGlow(lastView.me.team, lastView.me.name);
    }
    scheduleGlowRepaint();
  }

  /* Das Gegenstück zu den Panels am Rand auf dem Tablet: dort gibt es
     keine Namensliste, also leuchtet das eigene Volk am eigenen Kopf
     (die Einheit mit Feldanteil) und die eigene Serie am eigenen
     Abzeichen. „Ist ein User on fire, dann leuchtet er auch" — hier ist
     der User man selbst. */
  function applyHeroGlow(myTeam, myName) {
    const mine = myName && memberFire(myTeam, myName);
    if (els.hero)   els.hero.classList.toggle('cm-phero--fire', teamFire(myTeam));
    if (els.streak) els.streak.classList.toggle('cm-pstreak--fire', !!mine);
    if (els.teamStreak) els.teamStreak.classList.toggle('cm-pstreak--fire', teamFire(myTeam));
  }

  /* Beamer: dieselben Ereignisse wie beim Teilnehmer, nur für ALLE
     Völker (clash_room_get.team_events, Migration 0107). Läuft 0107
     noch nicht, fehlt der Schlüssel — dann bleibt es beim Spielfeld,
     ohne dass hier etwas kaputtgeht. */
  function applyRoomEvents(v) {
    const events = Array.isArray(v.team_events) ? v.team_events : [];
    let maxId = lastRoomEventId;
    events.forEach(e => { if ((e.id || 0) > maxId) maxId = e.id; });
    if (!roomEventsPrimed) { roomEventsPrimed = true; lastRoomEventId = maxId; return; }
    events.forEach(e => {
      if ((e.id || 0) <= lastRoomEventId) return;
      noteFireEvent(e.team, e);
      // 0108: Nur HIER steht, WER das Feld hat versinken lassen — der
      // Kartenvergleich (boardFx) weiß bloß, wer es verloren hat. Die
      // Ankündigung gehört deshalb ans Ereignis, der Staub an die Karte.
      if (e.kind === 'board_shrink') {
        announce(fLabel(e.team) + ' ' + fV(e.team, 'lassen', 'lässt') + ' ein Feld versinken!',
                 'cm-announce--shrink');
      }
    });
    lastRoomEventId = maxId;
    scheduleGlowRepaint();
  }

  /* Die drei zusammengehörenden Elemente einer Karte — einmal als
     HTML, einmal als Nachschlag. Sie stehen dreimal in der Seite
     (Beamer, Karten-Fenster des Teilnehmers, Zuschauer-Ansicht), und
     dreimal dasselbe von Hand zu schreiben ist dreimal die Gelegenheit,
     eine Id zu vertippen. */
  function mapDomHTML(prefix, cls) {
    return '<div class="cm-hexmap ' + (cls || '') + '" id="' + prefix + 'Wrap">' +
      '<div class="cm-mapinner"><svg class="cm-hexsvg" id="' + prefix + 'Svg"></svg></div>' +
      '<div class="cm-iconlayer" id="' + prefix + 'Icons"></div>' +
      // Die Effekt-Ebene ist bewusst die DRITTE und liegt über beiden:
      // renderHexMap ersetzt svg und icons bei jedem Takt komplett, eine
      // laufende Animation darin wäre sofort abgeschnitten.
      '<div class="cm-fxlayer" id="' + prefix + 'Fx"></div>' +
    '</div>';
  }
  function mapDom(prefix) {
    return {
      wrap:  root.querySelector('#' + prefix + 'Wrap'),
      svg:   root.querySelector('#' + prefix + 'Svg'),
      icons: root.querySelector('#' + prefix + 'Icons'),
      fx:    root.querySelector('#' + prefix + 'Fx')
    };
  }

  /* ─── Beamer: Karte nimmt den ganzen freien Platz ───────────
     „Volles Bild" statt einer festen Kartenbreite, wie beim
     Teilnehmer — anders als NeuroLab/Cäsar aber kein Vollbild-
     Fenster mit Zoom/Pan, sondern ein möglichst großes Quadrat
     (Höhe UND Breite ausnutzen, nicht nur eine Achse). Dieselbe
     spaceBelow()-Rechnung wie dort — jetzt ein viertes Mal im
     Projekt (siehe MEMORY „spaceBelow() steht jetzt dreimal"). */
  function spaceBelow(el) {
    let sum = 0;
    for (let n = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
      const pcs = getComputedStyle(n.parentElement);
      sum += (parseFloat(pcs.paddingBottom) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
      sum += (parseFloat(getComputedStyle(n).marginBottom) || 0);
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        const scs = getComputedStyle(s);
        if (scs.display === 'none' || scs.position === 'fixed' || scs.position === 'absolute') continue;
        sum += s.offsetHeight + (parseFloat(scs.marginTop) || 0) + (parseFloat(scs.marginBottom) || 0);
      }
    }
    return sum;
  }

  function fitPresenterMap() {
    if (role !== 'presenter' || !els.boardWrap || !els.mapWrap) return;
    if (els.boardWrap.classList.contains('cm-hide')) return; // unsichtbar hat keine verlässlichen Maße
    const top = els.boardWrap.getBoundingClientRect().top;
    const h = Math.max(MAP_MIN, window.innerHeight - top - spaceBelow(els.boardWrap) - MAP_GAP);
    els.boardWrap.style.height = h + 'px';

    // Höhe: alles abziehen, was im Rahmen ÜBER und UNTER der Arena
    // steht (Kopfzeile, Timer-Leiste) plus die Polsterung von Kulisse
    // und Rahmen — sonst wächst die Karte über den Bildschirm hinaus.
    const padOf = el => {
      if (!el) return 0;
      const cs = getComputedStyle(el);
      return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) +
             (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    };
    const chrome = (els.boardTop ? els.boardTop.offsetHeight : 0) +
                   (els.timerBar ? els.timerBar.offsetHeight : 0) +
                   padOf(els.boardWrap) + padOf(els.frame);
    const availH = Math.max(160, h - chrome - MAP_GAP);

    /* ─── Breite: alles, was zwischen den Völker-Spalten frei ist ──
       Die Spalten behalten ihre Breite aus tool.css; der Rahmen füllt
       den Rest, und das Spielfeld füllt den Rahmen — in BEIDEN
       Richtungen. Dass ein fast quadratisches Feld dabei in die Breite
       gezogen wird, ist gewollt (siehe renderHexMap): auf einem
       16:9-Beamer bliebe sonst zwangsläufig Pergament links und rechts
       stehen. Deshalb hier kein Seitenverhältnis mehr, nur noch die
       zwei verfügbaren Maße. */
    const stageCS = getComputedStyle(els.boardWrap);
    const stagePadX = (parseFloat(stageCS.paddingLeft) || 0) + (parseFloat(stageCS.paddingRight) || 0);
    const innerW = els.boardWrap.clientWidth - stagePadX;
    const gapPx = parseFloat(stageCS.columnGap) || 0;
    let framePadX = 0;
    if (els.frame) {
      const fcs = getComputedStyle(els.frame);
      framePadX = (parseFloat(fcs.paddingLeft) || 0) + (parseFloat(fcs.paddingRight) || 0) +
                  (parseFloat(fcs.borderLeftWidth) || 0) + (parseFloat(fcs.borderRightWidth) || 0);
    }
    const sideW = (els.rosterLeft ? els.rosterLeft.offsetWidth : 0) +
                  (els.rosterRight ? els.rosterRight.offsetWidth : 0);
    const availW = Math.max(160, innerW - sideW - gapPx * 2 - framePadX);

    els.mapWrap.style.width  = Math.min(availW, MAP_MAX) + 'px';
    els.mapWrap.style.height = Math.min(availH, MAP_MAX) + 'px';

    // els.bmap statt eines hier gebauten Objekts: renderHexMap legt
    // seinen Maßstab am dom-Objekt ab (dom.geo), und den brauchen die
    // Effekte später wieder. Ein bei jedem Aufruf frisch gebautes
    // Objekt hätte die Ablage jedes Mal mitgenommen.
    if (els.bmap && els.bmap.svg && els.bmap.icons) {
      renderHexMap(els.bmap, lastView, { units: true });
    }
  }

  /* ─── Rundenende-Timer (Anzeige) ─────────────────────────────
     Eigenständig von der 5s-Start-Countdown-Anzeige (startCountdown),
     die nur während phase='countdown' läuft — dieser Timer läuft nur
     während phase='running' und mit match_ends_at gesetzt. Die
     tatsächliche Phase kommt weiterhin ausschließlich vom Server
     (clash_maybe_advance_phase); hier wird nur mitgezählt. */
  function fmtMMSS(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function startMatchTimer(endsAtIso) {
    const endsAt = new Date(endsAtIso).getTime();
    // Neues Rundenende ⇒ neuer Nenner für den Ring (siehe renderRing).
    // Dasselbe Ende ⇒ weiterlaufen lassen, sonst würde der Ring bei
    // jedem Takt (8s Poll bzw. Broadcast) wieder auf „voll" springen.
    if (endsAt !== matchEndsAtMs) {
      matchEndsAtMs = endsAt;
      matchPeakMs = Math.max(1, endsAt - Date.now());
    }
    if (matchTimerHandle) return; // läuft schon, nur das Ende war neu
    const step = () => {
      const leftMs = matchEndsAtMs - Date.now();
      const txt = fmtMMSS(leftMs / 1000);
      if (role === 'presenter') {
        if (els.ring) els.ring.classList.remove('cm-hide');
        renderRing(leftMs / matchPeakMs, txt);
      }
      if (els.timeLeftP) { els.timeLeftP.textContent = '⏱ ' + txt; els.timeLeftP.classList.remove('cm-hide'); }
      if (leftMs <= 0) { stopMatchTimer(); tick(true); }
    };
    step();
    matchTimerHandle = setInterval(step, 500);
  }
  function stopMatchTimer() {
    if (matchTimerHandle) clearInterval(matchTimerHandle);
    matchTimerHandle = null;
    matchEndsAtMs = 0;
    if (els.ring) els.ring.classList.add('cm-hide');
    if (els.timeLeftP) els.timeLeftP.classList.add('cm-hide');
  }

  /* ─── Eigener Takt ──────────────────────────────────────────
     sig zuerst (billig), volle Ansicht nur bei Änderung — dasselbe
     Muster wie MPRoom.poll, nur unabhängig davon getaktet. */
  async function tick(force) {
    if (destroyed || busy) return;
    if (!force && document.hidden) return;
    busy = true;
    try {
      const sigFn = role === 'presenter' ? 'clash_room_sig' : 'clash_sig';
      const s = await ctx.actions.call(sigFn, {});
      if (destroyed) return;
      if (!s || !s.ok) return; // Netzfehler/room_gone: beim nächsten Takt erneut versuchen
      if (s.sig === lastSig && !force) return;

      const viewFn = role === 'presenter' ? 'clash_room_get' : 'clash_view';
      const v = await ctx.actions.call(viewFn, {});
      if (destroyed || !v || !v.ok) return;
      lastSig = s.sig;
      applyView(v);
    } finally {
      busy = false;
    }
  }

  function applyView(v) {
    lastView = v;
    // Die Übersetzungstabelle zuerst — jede Anzeigefunktion darunter
    // schlägt ihre Farben, Namen und Bilder darüber nach.
    if (Array.isArray(v.factions) && v.factions.length) factions = v.factions;
    // Vor der Runde die Einheiten-Plätze vergessen: eine neue Partie
    // beginnt mit einem neuen Spielfeld, alte Plätze wären dort nur
    // zufällig noch gültig. Bei 'ended' bleiben sie ABSICHTLICH
    // stehen — das Siegerbild zeigt dieselbe Karte, die eben noch da
    // war, und die soll sich nicht im letzten Moment neu sortieren.
    // Dieselbe Begründung gilt für die Effekte: eine neue Partie hat
    // ein neues Spielfeld, der alte Vergleichsstand wäre dort nur
    // zufällig noch gültig — und ein „ausgeschieden" aus der letzten
    // Runde gehört nicht in die neue.
    if (v.phase === 'lobby' || v.phase === 'countdown') { unitSpots = {}; resetFx(); }
    ensureChannel(v.broadcast_key);
    // Erkennen · merken · zeichnen · zeigen. Die Reihenfolge ist nicht
    // beliebig: noteFxState setzt den „ausgeschieden"-Zustand, den die
    // Panels beim Zeichnen lesen, und flushFx braucht den Maßstab, den
    // das Zeichnen erst anlegt.
    const fx = boardFx(v);
    noteFxState(fx);
    if (role === 'presenter') { applyRoomEvents(v); renderPresenter(v); }
    else renderParticipant(v);
    flushFx(fx);
  }

  /* ─── Broadcast: Signal, nicht Wahrheit ─────────────────────
     `self:false`, weil die eigene Antwort schon aus der RPC selbst
     kommt — ein zweiter Abruf für die eigene Aktion wäre doppelte
     Arbeit. Empfangen wird das Event nur als Anstoß, sofort
     nachzufragen; sein Inhalt wird nirgends gelesen. */
  function ensureChannel(key) {
    if (!key || !window.supabaseClient || channelKey === key) return;
    if (channel) {
      try { window.supabaseClient.removeChannel(channel); } catch (e) { /* egal */ }
    }
    channelKey = key;
    channel = window.supabaseClient.channel('clash:' + key, {
      config: { broadcast: { self: false } }
    });
    channel.on('broadcast', { event: 'move' }, () => tick(true));
    channel.subscribe();
  }

  function nudge() {
    if (!channel) return;
    try { channel.send({ type: 'broadcast', event: 'move', payload: {} }); }
    catch (e) { /* egal — der Sicherheits-Poll holt es nach */ }
  }

  /* ─── Countdown ─────────────────────────────────────────────
     Eigene 1s-Anzeige aus countdown_ends_at; sobald die Zeit um ist,
     wird nicht selbst umgeschaltet, sondern tick(true) angestoßen —
     die tatsächliche Phase kommt vom Server (clash_maybe_advance_phase). */
  function startCountdown(endsAtIso) {
    stopCountdown();
    const endsAt = new Date(endsAtIso).getTime();
    const step = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (els.countNum)  els.countNum.textContent  = String(left);
      if (els.countNumP) els.countNumP.textContent = String(left);
      if (left <= 0) { stopCountdown(); tick(true); }
    };
    step();
    countdownTimer = setInterval(step, 250);
  }
  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  /* ─── Die Völker der anderen (Lobby, Teilnehmer) ─────────────
     `teams` ist {team_index: anzahl} — als Objekt, weil jsonb_object_agg
     die Schlüssel als Zeichenketten liefert.

     Bewusst nur Einheit, Name und Kopfzahl: wer sonst noch mitspielt,
     ist eine Nebeninformation. Das eigene Volk steht darüber groß, und
     die Namen der anderen Kinder bekommt das Tablet gar nicht erst
     (siehe Migration 0098). */
  function othersHTML(v, myTeam) {
    let out = '';
    for (let i = 0; i < v.team_count; i++) {
      if (i === myTeam) continue;
      const n = (v.teams && v.teams[String(i)]) || 0;
      out += `<div class="cm-other" style="--team:${fStroke(i)}">` +
        `<div class="cm-otherpic"><img src="${esrc(fUnit(i))}" alt=""></div>` +
        `<span class="cm-othername">${ctx.esc(fLabel(i))}</span>` +
        `<span class="cm-othern">${n}</span>` +
      '</div>';
    }
    return out;
  }

  /* ─── Das eigene Volk (Lobby, Teilnehmer) ────────────────────
     Derselbe Aufbau wie eine Spalte in der Lehrkraft-Lobby
     (renderLobbyTeams): Gruppenbild, Name mit Kopfzahl, darunter die
     Kinder — nur breiter, weil hier genau EINE Spalte steht. Der eigene
     Eintrag ist hervorgehoben; welcher das ist, sagt der Server
     (my_team_members[].me), nicht ein Namensvergleich — in einer Klasse
     mit zwei „Lena" wäre der schlicht falsch. */
  function myTeamHTML(v, myTeam) {
    const members = Array.isArray(v.my_team_members) ? v.my_team_members : [];
    const n = (v.teams && v.teams[String(myTeam)]) || members.length;
    const list = members.length
      ? members.map(m => `<li${m && m.me ? ' class="cm-lteamme"' : ''}>${ctx.esc((m && m.name) || '')}</li>`).join('')
      : '<li class="cm-lteamempty">noch niemand</li>';
    return `<div class="cm-lteam cm-lteam--mine" style="--team:${fStroke(myTeam)}">` +
      `<div class="cm-lteampic"><img src="${esrc(FACTION_TEAM[facOf(myTeam)] || FACTION_TEAM[0])}" alt=""></div>` +
      '<div class="cm-lteamname">' +
        `<span>${ctx.esc(fLabel(myTeam))}</span>` +
        `<span class="cm-lteamn">${n}</span>` +
      '</div>' +
      `<ul class="cm-lteamlist">${list}</ul>` +
    '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     Die Tastatur des Spiels
     ══════════════════════════════════════════════════════════
     Die Gerätetastatur ist raus. Sie war für „12 + 34" gerade noch
     tragfähig, aber sie kann nichts von dem, was noch kommt: Brüche,
     Vorzeichen, Variablen, Potenzen, Wurzeln, Sinus/Kosinus, Binär-
     und Hexadezimalzahlen. Dazu nimmt sie auf einem Tablet die halbe
     Höhe, ohne dass das Layout es erfährt, und sie schließt sich bei
     jeder Gelegenheit wieder.

     Der Aufbau ist deshalb bewusst eine BESCHREIBUNG, kein festes
     HTML, damit jede kommende Aufgabenart nur eine Zeile hier braucht:

       KEY_BASE    der Grundblock, den ALLE Arten teilen. Die Ziffern
                   stehen bei jeder Art an derselben Stelle — wer
                   „Brüche" bekommt, muss die 7 nicht neu suchen.
       KEY_EXTRA   Zusatztasten, nach Thema gebündelt. Sie hängen sich
                   als weitere Zeile UNTER den Grundblock, statt ihn
                   umzustellen.
       MODES       welche Bündel eine Aufgabenart mitbringt, und
                   welche Ziffern sie überhaupt zulässt.

     Der Grundblock (4 Spalten × 4 Zeilen):

        7  8  9  ⌫
        4  5  6  C
        1  2  3  ✓   ← über zwei Zeilen, unten rechts (Sönkes Vorgabe)
        ‹—— 0 ——›

     Welche Art gerade gilt, sagt später der Server je Frage
     (`question.input`). Heute schickt er nur `{a, b}` — eine Addition
     bis 100 —, also greift überall der Rückfall 'natural'. Die
     übrigen Arten stehen schon da, weil sie beim Hinzufügen sonst
     wieder eine Layout-Diskussion auslösen würden; erreichbar sind
     sie erst, wenn der Server sie benennt. */
  const KEY_BASE = [
    { lab: '7', ins: '7', r: 1, c: 1 }, { lab: '8', ins: '8', r: 1, c: 2 }, { lab: '9', ins: '9', r: 1, c: 3 },
    { lab: '4', ins: '4', r: 2, c: 1 }, { lab: '5', ins: '5', r: 2, c: 2 }, { lab: '6', ins: '6', r: 2, c: 3 },
    { lab: '1', ins: '1', r: 3, c: 1 }, { lab: '2', ins: '2', r: 3, c: 2 }, { lab: '3', ins: '3', r: 3, c: 3 },
    { lab: '0', ins: '0', r: 4, c: 1, cs: 3 },
    { lab: '⌫', act: 'back',   r: 1, c: 4, cls: 'cm-key--util', aria: 'Letzte Eingabe löschen' },
    { lab: 'C', act: 'clear',  r: 2, c: 4, cls: 'cm-key--util', aria: 'Eingabe leeren' },
    { lab: '✓', act: 'submit', r: 3, c: 4, rs: 2, cls: 'cm-key--go', aria: 'Antwort abschicken' }
  ];

  /* Die Zusatzbündel. Sie tragen KEINE Position — die verteilt
     buildKeypad() der Reihe nach auf die Zeilen unter dem Grundblock,
     damit ein neues Bündel nirgends nachgerechnet werden muss. */
  const KEY_EXTRA = {
    sign:  [{ lab: '±', act: 'sign', aria: 'Vorzeichen wechseln' }],
    dec:   [{ lab: ',', ins: ',' }],
    frac:  [{ lab: '/', ins: '/', aria: 'Bruchstrich' }],
    pow:   [{ lab: 'x²', ins: '^2' }, { lab: 'xⁿ', ins: '^' }, { lab: '√', ins: '√' }],
    trig:  [{ lab: 'sin', ins: 'sin(' }, { lab: 'cos', ins: 'cos(' }, { lab: 'tan', ins: 'tan(' },
            { lab: ')', ins: ')' }, { lab: 'π', ins: 'π' }],
    vars:  [{ lab: 'x', ins: 'x' }, { lab: 'y', ins: 'y' }],
    // ⚠️ Wenn die Hexadezimal-Aufgaben tatsächlich kommen: das „C"
    // hier trifft auf das „C" (Leeren) im Grundblock. Zwei gleich
    // beschriftete Tasten nebeneinander sind eine Falle — dann die
    // Leeren-Taste umbenennen (z. B. „AC"), nicht die Ziffer.
    hex:   [{ lab: 'A', ins: 'A' }, { lab: 'B', ins: 'B' }, { lab: 'C', ins: 'C' },
            { lab: 'D', ins: 'D' }, { lab: 'E', ins: 'E' }, { lab: 'F', ins: 'F' }]
  };

  /* `digits` grenzt den Grundblock ein (Binär kennt nur 0 und 1);
     fehlt der Schlüssel, sind alle zehn Ziffern erlaubt.
     `base` ist die Zahlenbasis, mit der parseAnswer liest. */
  const MODES = {
    natural: { extra: [],                       base: 10 },
    integer: { extra: ['sign'],                 base: 10 },
    decimal: { extra: ['sign', 'dec'],          base: 10 },
    fraction:{ extra: ['sign', 'frac'],         base: 10 },
    binary:  { extra: [],  digits: '01',        base: 2  },
    hexa:    { extra: ['hex'],                  base: 16 },
    algebra: { extra: ['sign', 'vars', 'pow'],  base: 10 },
    trig:    { extra: ['dec', 'pow', 'trig'],   base: 10 }
  };
  const modeOf = name => MODES[name] || MODES.natural;

  function buildKeypad(mode) {
    const m = modeOf(mode);
    const extras = (m.extra || []).reduce((all, k) => all.concat(KEY_EXTRA[k] || []), []);
    const cols = 4;
    let rows = 4, html = '';

    const cell = (k, r, c) => {
      const disabled = (k.ins && m.digits && /^[0-9]$/.test(k.ins) && m.digits.indexOf(k.ins) < 0);
      const style = 'grid-area:' + r + '/' + c + '/span ' + (k.rs || 1) + '/span ' + (k.cs || 1);
      return '<button type="button" class="cm-key ' + (k.cls || '') + '" style="' + style + '"' +
        (k.ins ? ' data-ins="' + ctx.esc(k.ins) + '"' : '') +
        (k.act ? ' data-act="' + k.act + '"' : '') +
        (disabled ? ' disabled' : '') +
        ' aria-label="' + ctx.esc(k.aria || k.lab) + '">' + ctx.esc(k.lab) + '</button>';
    };

    KEY_BASE.forEach(k => { html += cell(k, k.r, k.c); });
    extras.forEach((k, i) => {
      const r = 5 + Math.floor(i / cols);
      html += cell(k, r, (i % cols) + 1);
      rows = Math.max(rows, r);
    });

    els.keys.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    els.keys.style.gridTemplateRows    = 'repeat(' + rows + ', 1fr)';
    els.keys.innerHTML = html;
    keyMode = mode;
  }

  /* Aus dem getippten Text eine Zahl machen. Heute reicht dafür die
     Basis der Aufgabenart; sobald Brüche oder Terme dazukommen, ist
     das die Stelle, an der aus „3/4" etwas anderes wird als eine Zahl
     — und dann ändert sich auch, was clash_submit_answer entgegen-
     nimmt (heute: ein int). Bis dahin bewusst schlicht. */
  function parseAnswer(mode, buf) {
    const s = String(buf || '').trim();
    if (!s || s === '-') return null;
    const n = parseInt(s, modeOf(mode).base);
    return Number.isFinite(n) ? n : null;
  }

  const ANSWER_MAX = 12;   // mehr tippt niemand versehentlich sinnvoll

  function keyPress(k) {
    if (k.act === 'submit') { onSubmit(); return; }
    if (k.act === 'back')   { answerBuf = answerBuf.slice(0, -1); }
    else if (k.act === 'clear') { answerBuf = ''; }
    else if (k.act === 'sign')  {
      answerBuf = answerBuf.startsWith('-') ? answerBuf.slice(1) : ('-' + answerBuf);
    }
    else if (k.ins != null && answerBuf.length < ANSWER_MAX) {
      // Führende Nullen wegräumen: „007" ist als Antwort dasselbe wie
      // „7", sieht aber aus wie ein Vertipper.
      if (k.ins === '0' && (answerBuf === '0' || answerBuf === '-0')) return;
      if (/^-?0$/.test(answerBuf) && /^[1-9]$/.test(k.ins)) {
        answerBuf = answerBuf.replace(/0$/, k.ins);
      } else {
        answerBuf += k.ins;
      }
    }
    renderAnswer();
  }

  function renderAnswer() {
    if (!els.input) return;
    els.input.textContent = answerBuf;
    els.input.classList.toggle('cm-in--empty', !answerBuf);
  }

  /* Eine echte Tastatur darf trotzdem mit — am Rechner der Lehrkraft
     und beim Ausprobieren ist das der schnellste Weg. Sie ist nur ein
     zweiter Zugang zu denselben Tasten, kein eigener Pfad: für ein
     Zeichen wird die zugehörige BILDSCHIRMTASTE gesucht, und gibt es
     sie in dieser Aufgabenart nicht (oder ist sie gesperrt, wie die
     2..9 bei Binärzahlen), passiert nichts. Sonst könnte man über die
     Hardware etwas eintippen, was die Aufgabe gar nicht zulässt. */
  function onHardwareKey(e) {
    if (!els.game || els.game.classList.contains('cm-hide')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (mapOpen) { if (e.key === 'Escape') { closeMap(); e.preventDefault(); } return; }
    const k = e.key;
    if (k === 'Enter')                         keyPress({ act: 'submit' });
    else if (k === 'Backspace')                keyPress({ act: 'back' });
    else if (k === 'Escape' || k === 'Delete') keyPress({ act: 'clear' });
    else if (k === '-')                        keyPress({ act: 'sign' });
    else if (k.length === 1 && els.keys) {
      const btn = els.keys.querySelector('.cm-key[data-ins="' + k.toUpperCase() + '"]');
      if (!btn || btn.disabled) return;
      keyPress({ ins: btn.dataset.ins });
    }
    else return;
    e.preventDefault();
  }

  /* ══════════════════════════════════════════════════════════
     Teilnehmer
     ══════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════
     Das Siegerbild — für BEIDE Rollen dieselben Bausteine
     ══════════════════════════════════════════════════════════
     Der Beamer zeigt alle Völker (Podest aus 1·2·3, der Rest als
     schmale Zeilen daneben), das Tablet nur zwei davon: den Sieger und
     das eigene Volk. Die Karte selbst, der Platz und die Zahl der
     richtigen Antworten sind in beiden Fällen dasselbe Stück HTML —
     was am Beamer steht, soll das Kind auf seinem Gerät wiedererkennen.

     Die Reihenfolge kommt aus tileCounts (Felder am Ende) und
     team_correct_counts (0099). Der SIEGER steht dabei nicht in dieser
     Rechnung: welches Volk gewonnen hat, entscheidet der Server
     (winner_team) — bei Feld-Gleichstand per Zufall, siehe
     clash_maybe_advance_phase. Ihn hier neu auszurechnen könnte ein
     anderes Ergebnis liefern als die große Überschrift daneben. */

  const ORDINAL = ['', 'Erster', 'Zweiter', 'Dritter', 'Vierter',
                   'Fünfter', 'Sechster', 'Siebter', 'Achter'];
  const MEDAL   = { 1: '🥇', 2: '🥈', 3: '🥉' };

  function endRows(v) {
    const counts  = tileCounts(v);
    const correct = v.team_correct_counts || {};
    const rows = [];
    for (let i = 0; i < v.team_count; i++) {
      rows.push({
        slot: i,
        tiles: counts[i] || 0,
        correct: parseInt(correct[String(i)], 10) || 0
      });
    }
    const win = v.winner_team;
    rows.sort((a, b) => {
      if (a.slot === win) return -1;
      if (b.slot === win) return 1;
      return (b.tiles - a.tiles) || (b.correct - a.correct) || (a.slot - b.slot);
    });
    // Gleiche Felder UND gleich viele richtige Antworten ⇒ derselbe
    // Platz, der nächste überspringt ihn (4·4·6, nicht 4·5·6). Das
    // trifft vor allem die ausgeschiedenen Völker, die alle bei null
    // Feldern stehen — eine erfundene Reihenfolge unter ihnen wäre
    // nichts als die Slot-Nummer, groß auf die Wand geworfen.
    // Platz 1 kann dabei niemand teilen: es gibt genau einen Sieger.
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      r.place = (i > 1 && prev.tiles === r.tiles && prev.correct === r.correct)
        ? prev.place : i + 1;
    });
    return rows;
  }

  // Eine Podest-Karte: Gruppenbild, Name, darunter Platz und richtige
  // Antworten. `cls` bestimmt allein die Größe und den Platz in der
  // Reihe (tool.css) — der Inhalt ist überall derselbe.
  function podCardHTML(row, cls) {
    return `<div class="cm-pod ${cls}" style="--team:${fStroke(row.slot)}">` +
      `<div class="cm-podmedal">${MEDAL[row.place] || row.place}</div>` +
      `<div class="cm-podpic"><img src="${esrc(fTeamPic(row.slot))}" alt=""></div>` +
      `<div class="cm-podname">${ctx.esc(fLabel(row.slot))}</div>` +
      '<div class="cm-podfoot">' +
        `<span class="cm-podplace">Platz ${row.place}</span>` +
        `<span class="cm-podcorr"><b>${row.correct}</b> richtig</span>` +
      '</div>' +
    '</div>';
  }

  // Ab Platz 4: eine schmale Zeile statt einer Karte. Dieselben drei
  // Angaben, nur nebeneinander gelegt.
  function endRowHTML(row) {
    return `<div class="cm-erow" style="--team:${fStroke(row.slot)}">` +
      `<span class="cm-eplace">${row.place}.</span>` +
      `<span class="cm-ethumb"><img src="${esrc(fUnit(row.slot))}" alt=""></span>` +
      `<span class="cm-ename">${ctx.esc(fLabel(row.slot))}</span>` +
      `<span class="cm-ecorr"><b>${row.correct}</b> richtig</span>` +
    '</div>';
  }

  function endTitleHTML(slot) {
    return `<span class="cm-endname">${ctx.esc(fLabel(slot))}</span> ` +
           `<span class="cm-endverb">${fVerb(slot)}!</span>`;
  }

  function buildParticipantDOM() {
    root.innerHTML =
      '<div class="cm-host">' +
        // ── Warten auf den Spielstart ──────────────────────────────
        // Bis zum UI-Durchgang stand hier eine Zeile Text („Dein
        // vorläufiges Team: …") und darunter ein Chip je Volk. Das war
        // dieselbe Auskunft für alle acht Völker — nur dass genau eines
        // davon das eigene ist, und das interessiert am Tablet als
        // einziges wirklich. Jetzt: das eigene Volk groß und mit den
        // Namen der Gruppe (wie auf dem Beamer), die anderen als kleine
        // Zeile darunter.
        '<div class="cm-pane cm-pane--lobby" id="cmLobby">' +
          '<div class="cm-wait"><span class="cm-waitdots"><i></i><i></i><i></i></span>' +
            'Warten auf den Spielstart …</div>' +
          '<div class="cm-myteamwrap" id="cmMyTeam"></div>' +
          '<div class="cm-others cm-hide" id="cmOthersBox">' +
            '<div class="cm-otherslabel">Diese Völker spielen mit</div>' +
            '<div class="cm-otherlist" id="cmOthers"></div>' +
          '</div>' +
          '<p class="cm-hint" id="cmOnlineHint"></p>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmCountdown">' +
          '<div class="cm-countdown">' +
            '<div class="cm-count" id="cmCountNum">5</div>' +
            '<p class="cm-hint">Gleich geht’s los …</p>' +
          '</div>' +
        '</div>' +
        /* ── Der Spielbildschirm ────────────────────────────────────
           Er füllt den sichtbaren Bereich vollständig (position:fixed
           auf --vv-top/--vv-h, siehe tool.css) — nicht aus Effekt-
           hascherei, sondern weil Sönkes Aufteilung sich auf den
           GANZEN Bildschirm bezieht: untere Hälfte Tasten, darüber
           Aufgabe, oben ein Fünftel die eigene Einheit. In einem
           Kasten mitten in der Seite ergäben diese Anteile nichts.
           Dass die Seite darunter verschwindet, ist dabei kein
           Verlust: während einer laufenden Runde gibt es dort nichts
           zu tun, und die Gerätetastatur, die den Platz sonst
           zerschnitten hätte, öffnet sich nicht mehr.

           Von oben nach unten:
             cm-pfactions  die Völker, winzig — wer noch da ist
             cm-phero      eigene Einheit, Anteil am Spielfeld, Serien
             cm-pask       Aufgabe und Eingabe (ohne Absende-Knopf,
                           der sitzt in der Tastatur)
             cm-keys       die Tastatur, untere Hälfte */
        '<div class="cm-pane cm-hide cm-play" id="cmGame">' +
          '<div class="cm-pbg"></div>' +
          '<div class="cm-pinner">' +
            // Die Restzeit steht als Kind der Völker-Reihe da, obwohl
            // renderFactionRow die Reihe bei jedem Takt neu füllt: die
            // Anzeige wird danach wieder angehängt (der Verweis bleibt
            // gültig, auch wenn das Element kurz aus dem Baum fällt).
            // So braucht sie keinen eigenen Kasten und keine eigene
            // Zeile Bildschirmhöhe.
            '<div class="cm-pfactions" id="cmPFactions">' +
              '<span class="cm-timeleft cm-hide" id="cmTimeLeftP"></span>' +
            '</div>' +
            // Der Ruinen-Banner (0108). Steht nur da, solange das eigene
            // Volk ausgeschieden ist — und dann als ERSTES, noch über
            // dem eigenen Kopf: er ist die Antwort auf die Frage, die
            // sich in dem Moment jedes Kind stellt („warum tippe ich
            // hier noch?"). Sönkes Vorgabe: „steht ganz klar, dass
            // weiter spielen sich lohnt".
            '<div class="cm-ruinbar cm-hide" id="cmRuinBar"></div>' +
            '<div class="cm-phero">' +
              '<div class="cm-pherounit"><img id="cmPUnit" src="" alt=""></div>' +
              '<div class="cm-pherostats">' +
                '<div class="cm-pstatline">' +
                  '<div class="cm-pshare">' +
                    '<b id="cmPShare">0 %</b>' +
                    '<span class="cm-psharelab" id="cmPShareLab">des Spielfelds</span>' +
                  '</div>' +
                  // Zwei Serien-Anzeigen. Die eigene füttert der Server
                  // heute schon (me.streak); die des Volkes hat noch
                  // keine Quelle — sie steht bewusst schon da, mit „–"
                  // statt einer erfundenen Zahl, damit später nur der
                  // Wert nachzureichen ist und nicht das Layout.
                  '<div class="cm-pstreaks">' +
                    '<span class="cm-pstreak" id="cmStreak" title="Deine Serie richtiger Antworten">' +
                      '<span class="cm-pstreakico">🔥</span><b>0</b></span>' +
                    '<span class="cm-pstreak cm-pstreak--team" id="cmTeamStreak" title="Serie deines Volkes">' +
                      '<span class="cm-pstreakico">⚔️</span><b>–</b></span>' +
                  '</div>' +
                '</div>' +
                '<div class="cm-pbar"><i id="cmPBar"></i></div>' +
              '</div>' +
              '<button type="button" class="cm-pmapbtn" id="cmMapBtn">' +
                '<span class="cm-pmapico">🗺️</span><span>Karte</span></button>' +
            '</div>' +
            '<div class="cm-pask">' +
              '<div class="cm-eq">' +
                '<span class="cm-q" id="cmQ">? + ?</span>' +
                '<span class="cm-eqop">=</span>' +
                '<span class="cm-in cm-in--empty" id="cmIn"></span>' +
              '</div>' +
              '<div class="cm-feedback" id="cmFeedback"></div>' +
            '</div>' +
            '<div class="cm-keys" id="cmKeys"></div>' +
          '</div>' +
          // Das Karten-Fenster. Es gehört in den Spielbildschirm und
          // nicht daneben: es liegt über ihm und übernimmt denselben
          // sichtbaren Bereich.
          '<div class="cm-mapov cm-hide" id="cmMapOv">' +
            '<div class="cm-mapovbox">' +
              '<div class="cm-mapovhead">' +
                '<span class="cm-mapovtitle">Kingdoms of Mathoria</span>' +
                '<button type="button" class="cm-mapovclose" id="cmMapClose" aria-label="Karte schließen">✕</button>' +
              '</div>' +
              // Nur sichtbar, solange der Einzel-Serienbonus offene Picks
              // hat (0106) — der Countdown steht hier, weil er direkt über
              // der Karte den größten Sinn ergibt.
              '<div class="cm-pickbanner cm-hide" id="cmPickBanner"></div>' +
              mapDomHTML('cmPMap') +
              '<div class="cm-mapovfoot" id="cmMapFoot"></div>' +
            '</div>' +
          '</div>' +
          // Team-Toast (0106): Geschwister von .cm-mapov, damit „<Name>
          // ist on fire"/„Ihr seid on fire" auch sichtbar ist, wenn die
          // Karte gerade zu ist — die meisten Teammitglieder bekommen
          // den Bonus ja gar nicht selbst, nur die Nachricht darüber.
          '<div class="cm-firetoast cm-hide" id="cmFireToast"></div>' +
        '</div>' +
        // Zuschauen: seit 0108 NUR noch für den, der gar kein Volk hat
        // (nach dem Start dazugekommen und noch nicht gelost — er
        // bekommt vom Server auch keine Aufgabe). Ein ausgeschiedenes
        // VOLK landet hier nicht mehr, es spielt im Ruinen-Modus
        // weiter (siehe renderParticipant).
        '<div class="cm-pane cm-hide" id="cmOut">' +
          '<p class="cm-lead">Du gehörst noch zu keinem Volk.</p>' +
          '<p class="cm-hint">Beim nächsten Spielstart bist du dabei — bis dahin siehst du zu.</p>' +
          '<div class="cm-obsmap">' + mapDomHTML('cmOMap', 'cm-hexmap--square') + '</div>' +
        '</div>' +
        // Das Siegerbild. Dieselben Bausteine wie am Beamer, nur ohne
        // die Völker, die das Kind nichts angehen: ganz oben, wer
        // gewonnen hat, darunter das Siegervolk groß und — wenn es
        // nicht das eigene war — das eigene daneben, kleiner. Zum
        // Schluss der eigene Platz in Worten.
        '<div class="cm-pane cm-hide cm-endstage cm-endstage--me" id="cmEnded">' +
          '<h2 class="cm-endtitle" id="cmEndTitle"></h2>' +
          '<div class="cm-podium cm-podium--me" id="cmEndPodium"></div>' +
          '<p class="cm-endplace" id="cmEndPlace"></p>' +
        '</div>' +
      '</div>';

    els = {
      lobby: root.querySelector('#cmLobby'),
      countdown: root.querySelector('#cmCountdown'),
      countNum: root.querySelector('#cmCountNum'),
      game: root.querySelector('#cmGame'),
      factionRow: root.querySelector('#cmPFactions'),
      hero: root.querySelector('.cm-phero'),
      heroUnit: root.querySelector('#cmPUnit'),
      share: root.querySelector('#cmPShare'),
      shareLab: root.querySelector('#cmPShareLab'),
      shareBar: root.querySelector('#cmPBar'),
      streak: root.querySelector('#cmStreak'),
      teamStreak: root.querySelector('#cmTeamStreak'),
      ruinBar: root.querySelector('#cmRuinBar'),
      mapBtn: root.querySelector('#cmMapBtn'),
      mapOv: root.querySelector('#cmMapOv'),
      pickBanner: root.querySelector('#cmPickBanner'),
      mapFoot: root.querySelector('#cmMapFoot'),
      mapClose: root.querySelector('#cmMapClose'),
      fireToast: root.querySelector('#cmFireToast'),
      q: root.querySelector('#cmQ'),
      input: root.querySelector('#cmIn'),
      keys: root.querySelector('#cmKeys'),
      feedback: root.querySelector('#cmFeedback'),
      out: root.querySelector('#cmOut'),
      ended: root.querySelector('#cmEnded'),
      endTitle: root.querySelector('#cmEndTitle'),
      endPodium: root.querySelector('#cmEndPodium'),
      endPlace: root.querySelector('#cmEndPlace'),
      myTeam: root.querySelector('#cmMyTeam'),
      othersBox: root.querySelector('#cmOthersBox'),
      others: root.querySelector('#cmOthers'),
      onlineHint: root.querySelector('#cmOnlineHint'),
      timeLeftP: root.querySelector('#cmTimeLeftP')
    };
    els.pmap = mapDom('cmPMap');    // Karten-Fenster über dem Spiel
    els.omap = mapDom('cmOMap');    // Zuschauer-Ansicht nach dem Ausscheiden

    // EIN Zuhörer auf der ganzen Tastatur statt einem je Taste: die
    // Tasten werden bei jedem Wechsel der Aufgabenart neu gezeichnet.
    els.keys.addEventListener('click', ev => {
      const btn = ev.target.closest('.cm-key');
      if (!btn || btn.disabled) return;
      keyPress({ ins: btn.dataset.ins, act: btn.dataset.act });
    });
    // Arrow-Wrapper statt der Funktionen direkt (0106): openMap/closeMap
    // haben jetzt einen Parameter (forced/force) — ohne den Wrapper würde
    // das MouseEvent des Klicks als erstes Argument durchrutschen und
    // fälschlich als truthy forced/force gelesen.
    els.mapBtn.addEventListener('click', () => openMap());
    els.mapClose.addEventListener('click', () => closeMap());
    // Klick auf die Fläche neben der Karte schließt ebenfalls — der
    // ✕ ist klein, und ein Kind, das die Karte wieder loswerden will,
    // tippt irgendwohin. Während eines offenen Serien-Bonus verweigert
    // closeMap() das (siehe dort).
    els.mapOv.addEventListener('click', ev => { if (ev.target === els.mapOv) closeMap(); });
    els.pmap.svg.addEventListener('click', onMapTileClick);   // 0106: manueller Pick
    document.addEventListener('keydown', onHardwareKey);
  }

  /* ─── Das Karten-Fenster ────────────────────────────────────────
     Die Karte ist standardmäßig ZU. Auf dem Spielbildschirm gehört der
     Platz der Aufgabe; wer wissen will, wie es steht, holt sie sich —
     und sieht dann dasselbe Bild wie die Klasse auf dem Beamer, nur
     ohne die wandernden Einheiten und mit dem eigenen Gebiet
     hervorgehoben. */
  // `forced` (0106): true, wenn ein offener Serien-Bonus die Karte
  // selbst öffnet (nicht der 🗺️-Knopf) — bekommt eine auffälligere
  // Umrandung (.cm-mapov--forced), die zeigt, dass hier eine Aktion
  // erwartet wird, kein bloßes Nachschauen.
  function openMap(forced) {
    if (!els.mapOv) return;
    mapOpen = true;
    els.mapOv.classList.remove('cm-hide');
    els.mapOv.classList.toggle('cm-mapov--forced', !!forced || myPendingPicks > 0);
    renderPlayerMap();
    // Zweimal: beim ersten Mal hat die gerade eingeblendete Fläche noch
    // keine verlässlichen Maße (clientWidth 0) — dieselbe Zweitmessung
    // wie beim Beamer.
    requestAnimationFrame(renderPlayerMap);
  }
  // `force` (0106): während ein Serien-Bonus offene Picks hat, lässt
  // sich die Karte nicht wegtippen (✕/Backdrop) — sie muss erst
  // beantwortet oder abgelaufen sein. applyPendingPicks/show() rufen
  // hier mit force=true durch, wenn das wirklich gewollt ist.
  function closeMap(force) {
    if (!force && myPendingPicks > 0) return;
    if (mapCloseTimer) { clearTimeout(mapCloseTimer); mapCloseTimer = null; }
    mapOpen = false;
    if (els.mapOv) els.mapOv.classList.add('cm-hide');
  }
  function renderPlayerMap() {
    if (!mapOpen || !lastView || !els.pmap) return;
    const myTeam = lastView.me && lastView.me.team;
    // Nur während eines offenen Einzel-Bonus (0106) markiert die Karte
    // die legalen Ziele — sonst ist sie reine Auskunft, kein Angebot.
    const pickable = myPendingPicks > 0 ? legalPickTargets(lastView.tiles || [], myTeam) : null;
    renderHexMap(els.pmap, lastView, { units: false, highlight: myTeam, pickable });
    if (els.mapFoot && myTeam != null) {
      els.mapFoot.innerHTML = `<span class="cm-maplegend" style="--team:${fStroke(myTeam)}">` +
        '<i></i>Dein Gebiet — ' + ctx.esc(fLabel(myTeam)) + '</span>';
    }
  }

  /* ─── Manueller Pick aus dem Einzel-Serienbonus (0106) ───────────
     onMapTileClick sitzt auf dem SVG der Karte (Delegation statt eines
     Zuhörers je Sechseck, das bei jedem Zeichnen neu entstünde).
     applyPendingPicks/updatePickBanner/startPickCountdown bilden
     zusammen den Zustandsautomaten: Karte öffnet sich, wenn neue Picks
     da sind, Countdown läuft, läuft er ab, hat der Server den Rest
     längst automatisch erobert (clash_expire_pending_picks) — der
     Client muss dafür nichts Eigenes tun, nur neu abfragen. */
  async function onMapTileClick(ev) {
    if (myPendingPicks <= 0) return;
    const poly = ev.target.closest('polygon.cm-hex--pickable');
    if (!poly) return;
    const r = parseInt(poly.dataset.r, 10), c = parseInt(poly.dataset.c, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    poly.classList.add('cm-hex--pickbusy');
    const res = await ctx.actions.call('clash_pick_tile', { p_r: r, p_c: c });
    if (res && res.ok) {
      // Wie in onSubmit: eigene Antwort ist Wahrheit, lokal patchen statt
      // auf den nächsten Takt zu warten. Zwei Ausgänge wie bei jeder
      // Eroberung (Burg-3-Leben, Migration 0100): entweder wechselt der
      // Besitzer, oder eine Burg verliert „nur" ein Leben.
      const hitAt = res.captured || res.castle_hit;
      if (lastView && hitAt) {
        const t = (lastView.tiles || []).find(x => x.r === r && x.c === c);
        if (t) {
          if (res.captured) { t.team = lastView.me.team; if (res.captured.castle) t.hp = res.captured.hp; }
          else t.hp = res.castle_hit.hp;
        }
        // Der Effekt kommt aus demselben Vergleich wie beim Takt (der
        // eigene Broadcast schließt einen selbst aus, sonst käme das
        // eigene Pling erst 8 Sekunden später oder gar nicht).
        const fx = boardFx(lastView);
        noteFxState(fx);
        renderStandings(lastView);
        renderPlayerMap();
        flushFx(fx);
      }
      applyPendingPicks(res.pending_picks, res.pick_deadline);
      renderPlayerMap();
      nudge();
    } else {
      // Ziel war inzwischen ungültig (z. B. schon vom Auto-Ablauf
      // erobert) — kein Fehlerbild, nur neu abgleichen.
      poly.classList.remove('cm-hex--pickbusy');
      tick(true);
    }
  }

  function applyPendingPicks(n, deadlineIso) {
    const wasPending = myPendingPicks > 0;
    myPendingPicks = n || 0;
    if (myPendingPicks > 0) {
      if (mapCloseTimer) { clearTimeout(mapCloseTimer); mapCloseTimer = null; }
      pendingPickDeadlineMs = deadlineIso ? new Date(deadlineIso).getTime() : (Date.now() + 6000);
      if (!mapOpen) openMap(true);
      updatePickBanner();
      startPickCountdown();
    } else if (wasPending) {
      stopPickCountdown();
      updatePickBanner();
      // Nicht sofort zu: der LETZTE Pick hat gerade ein Feld erobert,
      // und sein Effekt (UI 18) spielt auf genau dieser Karte. Ginge
      // sie im selben Wimpernschlag zu, wäre die eine Eroberung, die
      // das Kind selbst ausgesucht hat, die einzige, die es nie sieht.
      if (mapCloseTimer) clearTimeout(mapCloseTimer);
      mapCloseTimer = setTimeout(() => { mapCloseTimer = null; closeMap(true); }, 850);
    }
  }

  function updatePickBanner() {
    if (!els.pickBanner) return;
    if (myPendingPicks <= 0) { els.pickBanner.classList.add('cm-hide'); return; }
    els.pickBanner.classList.remove('cm-hide');
    const leftS = Math.max(0, Math.ceil((pendingPickDeadlineMs - Date.now()) / 1000));
    els.pickBanner.innerHTML =
      '<b>🔥 Wähle ' + myPendingPicks + (myPendingPicks === 1 ? ' Feld' : ' Felder') + ' deiner Wahl!</b>' +
      '<span class="cm-pickbanner-time">' + leftS + 's</span>';
  }

  function startPickCountdown() {
    stopPickCountdown();
    pickCountdownTimer = setInterval(() => {
      updatePickBanner();
      if (Date.now() >= pendingPickDeadlineMs) { stopPickCountdown(); tick(true); }
    }, 250);
  }
  function stopPickCountdown() {
    if (pickCountdownTimer) clearInterval(pickCountdownTimer);
    pickCountdownTimer = null;
  }

  /* ─── Team-Toast (0106) ───────────────────────────────────────────
     Passiv — kein Zutun nötig, nur ein paar Sekunden sichtbar. Zeigt
     nur das JÜNGSTE Ereignis (kein Stapel): zwei Treffer im selben
     Poll sind selten genug, dass das keine Information verschluckt,
     die nicht kurz danach ohnehin wieder auftaucht. */
  function showFireToast(text) {
    if (!els.fireToast) return;
    els.fireToast.textContent = text;
    els.fireToast.classList.remove('cm-hide');
    void els.fireToast.offsetWidth;   // Neustart der Übergangsanimation erzwingen
    els.fireToast.classList.add('cm-firetoast--show');
    if (fireToastTimer) clearTimeout(fireToastTimer);
    fireToastTimer = setTimeout(() => {
      if (els.fireToast) els.fireToast.classList.remove('cm-firetoast--show');
      fireToastTimer = setTimeout(() => {
        if (els.fireToast) els.fireToast.classList.add('cm-hide');
      }, 300);
    }, 3500);
  }

  function applyTeamEvents(v) {
    const events = Array.isArray(v.my_team_events) ? v.my_team_events : [];
    const myTeam = v.me && v.me.team;
    let maxId = lastTeamEventId;
    events.forEach(e => { if ((e.id || 0) > maxId) maxId = e.id; });

    /* Der ERSTE Abruf zeigt nichts an. clash_view liefert die letzten
       20 Einträge des Team-Logs (0106) — wer mitten in einer Runde
       dazukommt oder die Seite neu lädt, bekäme sonst zwanzig
       „on fire"-Meldungen auf einmal, von denen keine gerade
       passiert ist. */
    if (!teamEventsPrimed) { teamEventsPrimed = true; lastTeamEventId = maxId; return; }

    events.forEach(e => {
      if ((e.id || 0) <= lastTeamEventId) return;
      noteFireEvent(myTeam, e);   // UI 18: acht Sekunden Leuchten
      if (e.kind === 'individual_fire') {
        const name = (e.payload && e.payload.name) || 'Jemand';
        showFireToast('🔥 ' + name + ' ist on fire!');
      } else if (e.kind === 'team_fire') {
        showFireToast('🔥🔥 Ihr seid on fire!');
      } else if (e.kind === 'board_shrink') {
        // 0108: Das Ereignis steht beim AUSLÖSENDEN Volk — auf dem
        // Tablet liest es also genau die Gruppe, die es geschafft hat.
        showFireToast('💥 Ihr habt ein Feld versinken lassen!');
      }
    });
    lastTeamEventId = maxId;
    scheduleGlowRepaint();
  }

  async function onSubmit() {
    if (submitting) return;
    const val = parseAnswer(keyMode, answerBuf);
    if (val == null) { flashInput('warn'); return; }
    submitting = true;
    answerBuf = '';
    renderAnswer();
    const r = await ctx.actions.call('clash_submit_answer', { p_answer: val });
    submitting = false;
    if (!r || !r.ok) {
      setFeedback(ctx.errText((r && r.error) || 'network'), 'warn');
      if (r && r.error === 'team_eliminated') tick(true);
      return;
    }
    if (r.correct === true) {
      // Drei Ausgänge, seit eine Burg drei Leben hat (Migration 0100):
      // ein gewöhnliches Feld erobert, eine Burg getroffen (sie bleibt
      // vorerst beim Gegner) oder eine Burg übernommen. Der letzte Fall
      // ist der größte Augenblick des Spiels und bekommt eigene Worte —
      // „Feld erobert!" hätte ihn verschluckt.
      let msg = '✅ Richtig!';
      // 0108: Im Ruinen-Modus erobert eine richtige Antwort nichts —
      // sie kann aber ein Feld der Gegner versinken lassen. Der Server
      // schickt je Schrumpfversuch einen Eintrag; die erfolglosen
      // (Halbierungsgrenze erreicht) interessieren die Anzeige nicht.
      const gone = Array.isArray(r.shrunk) ? r.shrunk.filter(s => s && s.shrunk) : [];
      if (r.captured) msg = r.captured.castle ? '👑 Burg erobert!' : '✅ Feld erobert!';
      else if (r.castle_hit) msg = '💥 Burg getroffen! Noch ' + r.castle_hit.hp;
      else if (gone.length) msg = '💥 Ein Feld der Gegner versinkt!';
      setFeedback(msg, 'ok');
      flashInput('ok');
      // Eigene Antwort ist Wahrheit — lokal patchen statt auf den
      // nächsten Takt zu warten, und die anderen anstoßen.
      const hitAt = r.captured || r.castle_hit;
      if (lastView) {
        if (hitAt) {
          const t = (lastView.tiles || []).find(x => x.r === hitAt.r && x.c === hitAt.c);
          if (t) {
            if (r.captured) {
              t.team = lastView.me.team;
              if (r.captured.castle) t.hp = r.captured.hp;   // übernommen ⇒ wieder voll
            } else t.hp = r.castle_hit.hp;
          }
        }
        // Versunkene Kacheln aus der eigenen Kopie nehmen — genau
        // daraus baut boardFx gleich das „gone"-Ereignis, ohne einen
        // zweiten Meldeweg.
        if (gone.length) {
          lastView.tiles = (lastView.tiles || []).filter(
            t => !gone.some(s => s.r === t.r && s.c === t.c));
        }
        // Ruinen-Punkte und Spielfeldgröße kommen in derselben Antwort
        // mit: ohne sie stünde der Fortschrittsbalken bis zum nächsten
        // Takt auf dem alten Wert (derselbe Grund wie bei team_streak).
        if (r.ruin)  lastView.ruin  = r.ruin;
        if (r.board) lastView.board = r.board;

        if (hitAt || gone.length) {
          // 0108: Der Beweis, dass Weiterspielen wirkt, ist das
          // versinkende Feld selbst — und die Karte ist am Tablet
          // normalerweise zu. Also einmal kurz aufmachen und von selbst
          // wieder schließen, wie nach dem letzten Serien-Pick. NICHT
          // „forced": dort wird eine Handlung erwartet, hier wird nur
          // etwas gezeigt.
          if (gone.length && !mapOpen) {
            openMap(false);
            if (mapCloseTimer) clearTimeout(mapCloseTimer);
            mapCloseTimer = setTimeout(() => { mapCloseTimer = null; closeMap(true); }, 1800);
          }
          // Wie beim manuellen Pick: derselbe Vergleich wie im Takt, nur
          // sofort — die eigene Eroberung darf nicht auf den Server
          // warten, um zu funkeln.
          const fx = boardFx(lastView);
          noteFxState(fx);
          renderStandings(lastView);
          renderRuinBar(lastView);
          renderPlayerMap();
          flushFx(fx);
        } else if (r.ruin) {
          // Ruinen-Antwort ohne Wirkung auf der Karte: nur der
          // Fortschritt rückt vor. Kein boardFx — es hat sich keine
          // Kachel geändert, und ein Vergleich mit sich selbst würde
          // hier nur den Vergleichsstand verschieben.
          renderStandings(lastView);
          renderRuinBar(lastView);
        }
      }
      nudge();
    } else if (r.correct === false) {
      // Zwei Versuche je Aufgabe (Migration 0101): der erste
      // Fehlversuch bekommt nur den Hinweis, die Aufgabe steht noch
      // (kein r.question ⇒ setQuestion unten tut nichts). Erst der
      // zweite Fehlversuch löst auf — reveal.sum ist die Summe der
      // gescheiterten, nicht der neuen Aufgabe.
      if (r.retry) {
        setFeedback('❌ Leider falsch, versuch’s nochmal!', 'warn');
      } else {
        // Länger stehen lassen als die üblichen 1800ms — hier steht
        // die richtige Zahl, die soll auch gelesen werden können.
        const sum = r.reveal && r.reveal.sum;
        setFeedback(sum != null ? ('❌ Leider falsch. Richtig wäre ' + sum + '.') : '❌ Leider falsch.', 'warn', 3200);
      }
      flashInput('warn');
    } else {
      setFeedback('', '');
    }
    if (r.streak != null) setStreak(r.streak);
    if (r.question) setQuestion(r.question);
    // 0106: aus der eigenen Antwort direkt, ohne auf den nächsten Takt
    // zu warten — genau das macht den Einzel-Bonus „schnell". Die
    // Team-Serie ebenso: der eigene Broadcast schließt den Absender
    // selbst aus (siehe setTeamStreak), sonst stünde sie bis zum
    // nächsten Takt auf dem alten Wert.
    if (r.team_streak != null) setTeamStreak(r.team_streak);
    if (r.pending_picks != null) applyPendingPicks(r.pending_picks, r.pick_deadline);
  }

  /* Rückmeldung und Aufgabe stehen in EIGENEN Kästen mit fester Höhe:
     eine Zeile, die mal da ist und mal nicht, würde die Tastatur bei
     jeder Antwort um ihre eigene Höhe verschieben — und das genau in
     dem Moment, in dem der Finger schon zur nächsten Taste unterwegs
     ist. */
  let feedbackTimer = null;
  function setFeedback(text, kind, ms) {
    if (!els.feedback) return;
    els.feedback.textContent = text;
    els.feedback.className = 'cm-feedback' + (kind ? ' cm-feedback--' + kind : '');
    if (feedbackTimer) clearTimeout(feedbackTimer);
    if (text) feedbackTimer = setTimeout(() => {
      if (els.feedback) els.feedback.textContent = '';
    }, ms || 1800);
  }
  let flashTimer = null;
  function flashInput(kind) {
    if (!els.input) return;
    els.input.classList.remove('cm-in--ok', 'cm-in--warn');
    // Erzwingt einen Neustart der Animation, wenn zweimal hintereinander
    // dasselbe Ergebnis kommt.
    void els.input.offsetWidth;
    els.input.classList.add('cm-in--' + kind);
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (els.input) els.input.classList.remove('cm-in--ok', 'cm-in--warn');
    }, 600);
  }
  function setStreak(n) {
    if (!els.streak) return;
    els.streak.querySelector('b').textContent = String(n || 0);
    els.streak.classList.toggle('cm-pstreak--hot', (n || 0) >= 3);
  }
  // Geteilte Team-Serie (0106). Eigene Funktion statt nur in
  // renderParticipant inline, weil onSubmit sie ZUSÄTZLICH sofort aus
  // der eigenen RPC-Antwort setzen muss: der Broadcast-Kanal schließt
  // den Absender selbst aus (`broadcast:{self:false}`, siehe
  // ensureChannel), die eigene Antwort löst also KEIN eigenes tick()
  // aus — ohne diesen Aufruf bliebe das Team-Serien-Badge bis zum
  // nächsten 8s-Sicherheitsnetz-Takt stehen.
  function setTeamStreak(n) {
    if (!els.teamStreak) return;
    els.teamStreak.querySelector('b').textContent = (n != null) ? String(n) : '–';
    els.teamStreak.classList.toggle('cm-pstreak--hot', (n || 0) >= 3);
  }
  function setQuestion(q) {
    if (!els.q || !q) return;
    // Heute schickt der Server nur {a, b} für eine Addition. Ein
    // späterer `text` (fertig gesetzte Aufgabe) hat Vorrang, damit
    // neue Aufgabenarten hier nichts mehr ändern müssen.
    els.q.textContent = q.text ? q.text : (q.a + ' + ' + q.b);
    const mode = q.input || 'natural';
    if (mode !== keyMode) buildKeypad(mode);
  }

  /* ─── Wer wie viel hat ──────────────────────────────────────────
     Der Server schickt dem Tablet ohnehin alle Kacheln (clash_view →
     `tiles`) — die Feldzahlen daraus zu zählen ist billiger und immer
     deckungsgleich mit der Karte, die aus denselben Kacheln entsteht.
     Eine eigene Zahl vom Server (wie team_tile_counts beim Beamer)
     könnte dagegen einen Takt älter sein als die Karte daneben. */
  function tileCounts(v) {
    const counts = {};
    (v.tiles || []).forEach(t => { counts[t.team] = (counts[t.team] || 0) + 1; });
    return counts;
  }

  /* Die Völker ganz oben: winzig, nur das Wappen und die Zahl der
     Felder. Ausgeschieden (kein Feld mehr) heißt grau und
     durchgestrichen — dieselbe Aussage wie am Beamer-Rand
     (.cm-rcard--out), nur auf Daumennagelgröße. Namen stehen bewusst
     nicht dabei: acht davon nebeneinander wären auf einem Tablet
     entweder unlesbar klein oder abgeschnitten, und das eigene Volk
     steht direkt darunter in voller Größe. Für Vorlese-Werkzeuge und
     als Kurzhinweis tragen die Wappen den Namen im aria-label. */
  function renderFactionRow(v, myTeam, counts) {
    if (!els.factionRow) return;
    const correct = v.team_correct_counts || {};
    let out = '';
    for (let i = 0; i < v.team_count; i++) {
      const n = counts[i] || 0;
      // Zwei Zahlen je Plättchen: Felder groß, richtige Antworten
      // klein darunter (0099). Sie sagen Verschiedenes — wer viel
      // Feld hat, muss nicht der Fleißigste gewesen sein — und die
      // kleine Zahl trägt darum das Häkchen als Erklärung mit.
      const c = parseInt(correct[String(i)], 10) || 0;
      const cls = 'cm-fchip' + (n === 0 ? ' cm-fchip--out' : '') + (i === myTeam ? ' cm-fchip--me' : '') +
                  (isFire(teamOutUntil, i) ? ' cm-fchip--justout' : '') +
                  (teamFire(i) ? ' cm-fchip--fire' : '');
      out += `<span class="${cls}" style="--team:${fStroke(i)}" ` +
        `title="${ctx.esc(fLabel(i))}" ` +
        `aria-label="${ctx.esc(fLabel(i))}: ${n} Felder, ${c} richtige Antworten">` +
        `<img src="${esrc(fUnit(i))}" alt="">` +
        `<span class="cm-fchipnums"><b>${n}</b><i>✓${c}</i></span>` +
      '</span>';
    }
    els.factionRow.innerHTML = out;
    // Die Restzeit hängt hinten an derselben Reihe — sie gehört zum
    // Überblick, nicht zur Aufgabe, und nimmt hier keine eigene Zeile.
    if (els.timeLeftP) els.factionRow.appendChild(els.timeLeftP);
  }

  /* Ausgeschieden, aber mit einem Volk — der Ruinen-Modus (0108).
     Bewusst NICHT über `tileCounts(v)[myTeam] === 0` bestimmt: der
     Server sagt es mit me.alive, und das ist auch dann noch richtig,
     wenn eine Antwort gerade das letzte Feld gekostet hat und die
     Karte im Client einen Takt hinterherhinkt. */
  function isRuin(v) {
    return !!(v && v.me && v.me.team != null && v.me.alive === false);
  }

  function renderStandings(v) {
    const myTeam = v.me.team;
    const counts = tileCounts(v);
    renderFactionRow(v, myTeam, counts);

    if (isRuin(v)) {
      // Dieselben drei Elemente, andere Bedeutung: statt „wie viel vom
      // Feld gehört uns" (null — das ist ja der Punkt) steht hier, wie
      // weit es bis zum nächsten versinkenden Feld ist.
      const ru    = v.ruin || {};
      const board = v.board || {};
      const step  = (ru.points || 0) % 10;
      if (board.floor_reached) {
        if (els.share)    els.share.textContent = '✓';
        if (els.shareBar) els.shareBar.style.width = '100%';
        if (els.shareLab) els.shareLab.textContent =
          'Spielfeld am Minimum — eure Antworten zählen für die Wertung';
      } else {
        if (els.share)    els.share.textContent = step + '/10';
        if (els.shareBar) els.shareBar.style.width = (step * 10) + '%';
        if (els.shareLab) els.shareLab.textContent =
          'bis ein Feld der Gegner versinkt';
      }
      return;
    }

    const total = (v.tiles || []).length || 1;
    const own   = counts[myTeam] || 0;
    // Aufgerundet nur bis 1 %: „0 %" neben einem noch vorhandenen Feld
    // wäre eine Falschauskunft, „100 %" bei einer fehlenden Kachel
    // ebenso.
    let pct = own / total * 100;
    pct = (own > 0 && pct < 1) ? 1 : (own < total && pct > 99) ? 99 : Math.round(pct);
    if (els.share)    els.share.textContent = pct + ' %';
    if (els.shareBar) els.shareBar.style.width = pct + '%';
    if (els.shareLab) els.shareLab.textContent = 'des Spielfelds · ' + own + ' von ' + total;
  }

  /* Der Banner über dem Spielbildschirm. Er sagt in drei Sätzen, warum
     Weiterspielen sich lohnt — und wird dabei konkret: die Zahl der
     schon versunkenen Felder ist der Beweis, dass es wirkt. Ist die
     Halbierungsgrenze erreicht, verschwindet das Versprechen und es
     bleibt der Teil, der weiter gilt: die Endwertung. */
  function renderRuinBar(v) {
    if (!els.ruinBar) return;
    const ruin = isRuin(v);
    els.ruinBar.classList.toggle('cm-hide', !ruin);
    if (!ruin) { els.ruinBar.innerHTML = ''; return; }
    const board = v.board || {};
    const gone  = board.removed || 0;
    const goneT = gone ? ` Schon <b>${gone}</b> ${gone === 1 ? 'Feld' : 'Felder'} versunken.` : '';
    els.ruinBar.innerHTML = board.floor_reached
      ? '<b>🏚️ Ausgeschieden — aber noch lange nicht fertig.</b>' +
        '<span>Das Spielfeld ist so klein, wie es werden kann.' + goneT +
        ' Jede richtige Antwort zählt weiter für euren Platz in der Endwertung.</span>'
      : '<b>🏚️ Ausgeschieden — und trotzdem am Drücker.</b>' +
        '<span>Alle <b>10</b> richtigen Antworten versinkt ein Feld der Gegner.' + goneT +
        ' Und eure richtigen Antworten entscheiden über euren Platz.</span>';
  }

  /* Das Siegerbild am Tablet: der Sieger groß, das eigene Volk daneben
     (nur wenn es ein anderes ist — sonst stünde dasselbe Volk zweimal
     da), darunter der eigene Platz als Satz. Ohne eigenes Volk (wer
     erst nach dem Start dazukam) bleibt es beim Sieger allein. */
  function renderEndParticipant(v, myTeam) {
    const rows = endRows(v);
    const win  = rows[0];
    const mine = rows.find(r => r.slot === myTeam);
    // Die ganze Tafel nimmt einen Hauch der Siegerfarbe an — dezent,
    // weil das Bild darauf schon farbig genug ist.
    els.ended.style.setProperty('--cm-win', fStroke(win.slot));
    els.endTitle.innerHTML = endTitleHTML(win.slot);
    els.endPodium.innerHTML = podCardHTML(win, 'cm-pod--1') +
      ((mine && mine.slot !== win.slot) ? podCardHTML(mine, 'cm-pod--mine') : '');
    els.endPlace.innerHTML = !mine
      ? ''
      : (mine.slot === win.slot)
        ? 'Ihr habt gewonnen! 🎉'
        : `Ihr seid <b>${ORDINAL[mine.place] || (mine.place + '.')}</b>.`;
    els.endPlace.classList.toggle('cm-hide', !mine);
  }

  function renderParticipant(v) {
    const teamCount = v.team_count;
    const myTeam = v.me.team;

    if (v.phase === 'lobby') {
      show('lobby');
      // myTeam ist für den Aufrufer selbst praktisch immer gesetzt
      // (wer clash_view gerade aufruft, ist per Definition online) —
      // die Prüfung ist trotzdem defensiv statt eine Karte in der Farbe
      // von „Team NaN" zu zeichnen. Ohne Volk bleibt die Liste der
      // anderen als vollständige Aufzählung stehen, weil dann keines
      // davon das eigene ist.
      els.myTeam.innerHTML = (myTeam == null)
        ? '<p class="cm-hint">Dein Volk bekommst du gleich zugeteilt.</p>'
        : myTeamHTML(v, myTeam);
      els.others.innerHTML = othersHTML(v, myTeam);
      els.othersBox.classList.toggle('cm-hide', teamCount <= (myTeam == null ? 0 : 1));
      if (els.onlineHint) {
        // Der leere Absatz muss WEG, nicht nur leer sein: die Tafel ist
        // eine Flex-Spalte mit Abstand, ein leerer Absatz darin wäre
        // eine sichtbare Lücke unter der Liste.
        const hint = (v.online_count != null && v.room_total != null && v.room_total > v.online_count)
          ? `${v.online_count} von ${v.room_total} im Raum sind bereit (online).`
          : '';
        els.onlineHint.textContent = hint;
        els.onlineHint.classList.toggle('cm-hide', !hint);
      }
      return;
    }
    if (v.phase === 'countdown') {
      show('countdown');
      startCountdown(v.countdown_ends_at);
      return;
    }
    stopCountdown();
    // stopMatchTimer() steht bewusst NICHT hier, sondern in jedem Zweig
    // einzeln: der Takt läuft mehrmals pro Minute durch diese Funktion,
    // und ein Stopp-Start-Paar setzt den Nenner des Rings jedes Mal auf
    // die verbliebene Restzeit zurück (siehe startMatchTimer) — der Ring
    // stünde dann dauerhaft auf „voll".
    if (v.phase === 'ended') {
      stopMatchTimer();
      show('ended');
      renderEndParticipant(v, myTeam);
      return;
    }
    // running
    // 0108: Ein ausgeschiedenes VOLK spielt weiter (Ruinen-Modus) und
    // bleibt auf dem Spielbildschirm. Zuschauen bleibt allein für den,
    // der gar keinem Volk angehört — der bekommt vom Server auch keine
    // Aufgabe, ein Spielbildschirm ohne Aufgabe wäre eine leere Bühne.
    if (myTeam == null) {
      stopMatchTimer();
      show('out');
      renderHexMap(els.omap, v, { units: false, highlight: null });
      requestAnimationFrame(() => renderHexMap(els.omap, v, { units: false, highlight: null }));
      return;
    }
    show('game');
    // Der Ruinen-Zustand hängt am Spielbildschirm, nicht am Banner
    // allein: Kopf, Tastatur und Rahmen nehmen daraus ihre gedämpfte
    // Fassung (tool.css), damit auf den ersten Blick klar ist, dass
    // hier gerade nichts mehr zu erobern ist.
    els.game.classList.toggle('cm-play--ruin', isRuin(v));
    // Der ganze Bildschirm trägt die Farbe des eigenen Volkes: Tasten,
    // Rahmen, Schein. Sie steht als eine Variable am Spielbildschirm,
    // alles Weitere mischt tool.css daraus.
    els.game.style.setProperty('--cm-team', fStroke(myTeam));
    if (els.heroUnit) {
      const src = esrc(fUnit(myTeam));
      // Nur bei Wechsel neu setzen — ein erneutes `src` startet das
      // Laden neu und lässt die Figur bei jedem Takt kurz blinken.
      if (els.heroUnit.getAttribute('src') !== src) els.heroUnit.setAttribute('src', src);
      els.heroUnit.alt = fLabel(myTeam);
    }
    setStreak(v.me.streak || 0);
    setTeamStreak(v.team_streak);   // 0106: geteilter Team-Zähler statt „–"
    applyTeamEvents(v);   // 0106: Toast für „<Name>/Ihr seid on fire"
    applyPendingPicks((v.me && v.me.pending_picks) || 0, v.me && v.me.pick_deadline);
    renderRuinBar(v);   // 0108 — vor renderStandings, es teilt sich die Zeile darunter
    renderStandings(v);
    // Muss NACH renderStandings stehen: die Völker-Reihe wird dort neu
    // geschrieben, und applyHeroGlow schaltet Klassen an Elementen, die
    // das überstehen (Kopf und Abzeichen) — die Reihe selbst holt sich
    // ihren Leuchtzustand beim Zeichnen aus denselben Ablagen.
    applyHeroGlow(myTeam, v.me && v.me.name);
    if (v.match_ends_at) startMatchTimer(v.match_ends_at); else stopMatchTimer();
    if (v.me.question) setQuestion(v.me.question);
    if (!keyMode) buildKeypad('natural');
    renderAnswer();
    renderPlayerMap();
  }

  function show(which) {
    ['lobby', 'countdown', 'game', 'out', 'ended'].forEach(k => {
      if (els[k]) els[k].classList.toggle('cm-hide', k !== which);
    });
    if (which !== 'countdown') stopCountdown();
    // Der Spielbildschirm liegt über der Seite und ist selbst so hoch
    // wie der sichtbare Bereich — was dahinter noch scrollen kann, ist
    // dann nur eine Falle für den Daumen.
    document.body.classList.toggle('cm-locked', which === 'game');
    // force=true (0106): ein Phasenwechsel (Runde vorbei, ausgeschieden…)
    // muss die Karte auch mitten in einem offenen Serien-Bonus schließen.
    if (which !== 'game') { closeMap(true); answerBuf = ''; }
  }

  /* ══════════════════════════════════════════════════════════
     Beamer / Lehrkraft
     ══════════════════════════════════════════════════════════ */
  function buildPresenterDOM() {
    root.innerHTML =
      '<div class="cm-host cm-host--presenter">' +
        // ── Lobby der Lehrkraft ──────────────────────────────────
        // Bis 0097 stand hier ein Zahlenfeld „Teams: [4]". Die Zahl
        // sagte aber nur, WIE VIELE mitspielen, nie WELCHE — die Völker
        // ergaben sich still aus der Reihenfolge. Jetzt sind es die acht
        // Wappen selbst: anklicken heißt dabei, wegklicken heißt raus.
        // Ohne Beschriftung, weil die Figuren selbst erkennbar sind und
        // acht Namen nebeneinander die Reihe sprengen würden; der Name
        // steht unten an der Spalte, wo Platz dafür ist.
        '<div class="cm-pane" id="cmSetup">' +
          '<div class="cm-setup">' +
            '<div class="cm-setuphead">' +
              '<h3 class="cm-setuptitle">Welche Teams?</h3>' +
              '<button type="button" class="cm-btn cm-btn--ghost" id="cmShuffleBtn">🔀 Teams mischen</button>' +
              '<button type="button" class="cm-btn" id="cmStartBtn">▶ Spiel starten</button>' +
            '</div>' +
            '<div class="cm-pick" id="cmPick"></div>' +
            '<div class="cm-lobbyteams" id="cmLobbyTeams"></div>' +
            '<div class="cm-offline cm-hide" id="cmOffline"></div>' +
          '</div>' +
        '</div>' +
        '<div class="cm-pane cm-hide" id="cmCountdownP">' +
          '<div class="cm-countdown">' +
            '<div class="cm-count" id="cmCountNumP">5</div>' +
          '</div>' +
        '</div>' +
        // Der Spielbildschirm ist 1:1 der Aufbau aus dem Showroom,
        // Variante 03 „Kingdoms of Mathoria" (siehe showroom.html):
        // Kulisse (cm-stage) → Zierrahmen (cm-frame--board) mit
        // Wappenbanner → Kopfzeile mit Titel/Phase/Ring → Arena aus
        // Fraktionsliste LINKS, Karte MITTE, Fraktionsliste RECHTS.
        // Die Timer-Bedienung der Lehrkraft gibt es im Showroom nicht
        // (das war ein Standbild) — sie sitzt unter der Arena, wo sie
        // den Blick auf die Karte nicht zerschneidet.
        // Die beiden Völker-Spalten hängen NICHT im Rahmen, sondern
        // stehen als seine Geschwister links und rechts daneben — die
        // Bühne ist eine Flex-Reihe (tool.css). Die Reihenfolge hier
        // IST die Anordnung auf dem Bildschirm: links · Rahmen · rechts.
        '<div class="cm-pane cm-hide cm-stage" id="cmBoardWrap">' +
          '<div class="cm-roster cm-roster--left"  id="cmRosterLeft"></div>' +
          '<div class="cm-frame cm-frame--board" id="cmFrame">' +
            '<div class="cm-fantasytitle">⚔ Kingdoms of Mathoria ⚔</div>' +
            '<div class="cm-boardtop" id="cmBoardTop">' +
              '<span class="cm-boardtitle">Kingdoms of Mathoria</span>' +
              // 0108: Erscheint erst, wenn das Feld tatsächlich
              // geschrumpft ist — vorher wäre „48 von 48" eine Zahl
              // ohne Aussage, die nur den Titel verkürzt.
              '<span class="cm-boardsize cm-hide" id="cmBoardSize"></span>' +
              '<div class="cm-ring cm-hide" id="cmRing"></div>' +
            '</div>' +
            '<div class="cm-arena" id="cmArena">' +
              '<div class="cm-mapwrap cm-mapwrap--kingdoms" id="cmMapWrap">' +
                '<div class="cm-mapinner"><svg class="cm-hexsvg" id="cmHexSvg"></svg></div>' +
                '<div class="cm-iconlayer" id="cmIcons"></div>' +
                // Dritte Ebene für Ringe, Funken und Kronen (UI 18) —
                // sie überlebt das Neuzeichnen der beiden darunter.
                '<div class="cm-fxlayer" id="cmFx"></div>' +
              '</div>' +
              // Die Ankündigung gehört der ARENA, nicht der Karte: sie
              // steht mittig über dem Feld und darf beim Umrechnen der
              // Kartengröße (fitPresenterMap) nicht mitwandern.
              '<div class="cm-announce cm-hide" id="cmAnnounce"></div>' +
            '</div>' +
            // Ein Auswahlfeld statt sechs Knöpfen — das war eine ganze
            // Zeile Bildschirmhöhe, die jetzt dem Spielfeld gehört.
            // Das Feld ist ein BEFEHL, keine Zustandsanzeige: es springt
            // nach jeder Wahl auf den Platzhalter zurück, und was gerade
            // gilt, steht daneben (und im Ring oben rechts). So kann es
            // nach einem Neuladen nichts Falsches behaupten — die
            // gewählte Dauer steht nirgends auf dem Server (0094).
            '<div class="cm-timerbar" id="cmTimerBar">' +
              '<span class="cm-hint" id="cmTimerState"></span>' +
              '<label class="cm-timerpick">' +
                '<select id="cmTimerSel">' +
                  '<option value="" selected>Rundenende</option>' +
                  '<option value="0">ohne Zeitlimit</option>' +
                  '<option value="5">5 Sekunden (Test)</option>' +
                  '<option value="60">1 Minute</option>' +
                  '<option value="120">2 Minuten</option>' +
                  '<option value="180">3 Minuten</option>' +
                  '<option value="240">4 Minuten</option>' +
                  '<option value="300">5 Minuten</option>' +
                '</select>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="cm-roster cm-roster--right" id="cmRosterRight"></div>' +
        '</div>' +
        // ── Das Siegerbild ───────────────────────────────────────
        // Dieselbe Bühne wie das Spielfeld (gemalte Kulisse, nur in
        // der Farbe des Siegers eingefärbt) — die Runde endet nicht
        // damit, dass die Spielwelt verschwindet und eine Zeile Text
        // dasteht.
        // Aufbau: Überschrift, darunter das Podest (2 · 1 · 3, der
        // Sieger in der Mitte und größer), rechts daneben die
        // restlichen Völker als schmale Reihe. Der „Neues Spiel"-Knopf
        // sitzt oben rechts, außerhalb des Podests: er gehört der
        // Lehrkraft und nicht dem Ergebnis.
        '<div class="cm-pane cm-hide cm-endstage" id="cmEndedP">' +
          '<button type="button" class="cm-newgame" id="cmResetBtn">' +
            '<span class="cm-newgameico">🔄</span>Neues Spiel</button>' +
          '<div class="cm-endinner">' +
            '<h2 class="cm-endtitle" id="cmEndTitleP"></h2>' +
            '<div class="cm-endboard">' +
              '<div class="cm-podium" id="cmPodium"></div>' +
              '<div class="cm-endrest cm-hide" id="cmEndRest"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    els = {
      setup: root.querySelector('#cmSetup'),
      pick: root.querySelector('#cmPick'),
      lobbyTeams: root.querySelector('#cmLobbyTeams'),
      offline: root.querySelector('#cmOffline'),
      startBtn: root.querySelector('#cmStartBtn'),
      shuffleBtn: root.querySelector('#cmShuffleBtn'),
      countdownP: root.querySelector('#cmCountdownP'),
      countNumP: root.querySelector('#cmCountNumP'),
      boardWrap: root.querySelector('#cmBoardWrap'),
      frame: root.querySelector('#cmFrame'),
      boardTop: root.querySelector('#cmBoardTop'),
      ring: root.querySelector('#cmRing'),
      boardSize: root.querySelector('#cmBoardSize'),
      arena: root.querySelector('#cmArena'),
      rosterLeft: root.querySelector('#cmRosterLeft'),
      rosterRight: root.querySelector('#cmRosterRight'),
      timerBar: root.querySelector('#cmTimerBar'),
      timerSel: root.querySelector('#cmTimerSel'),
      timerState: root.querySelector('#cmTimerState'),
      mapWrap: root.querySelector('#cmMapWrap'),
      hexsvg: root.querySelector('#cmHexSvg'),
      icons: root.querySelector('#cmIcons'),
      announce: root.querySelector('#cmAnnounce'),
      endedP: root.querySelector('#cmEndedP'),
      endTitleP: root.querySelector('#cmEndTitleP'),
      podium: root.querySelector('#cmPodium'),
      endRest: root.querySelector('#cmEndRest'),
      resetBtn: root.querySelector('#cmResetBtn')
    };
    // Die Beamer-Karte als EIN dauerhaftes Objekt (siehe fitPresenterMap):
    // renderHexMap legt seinen Maßstab daran ab, und die Effekte holen
    // ihn sich später von dort zurück.
    els.bmap = {
      wrap:  els.mapWrap,
      svg:   els.hexsvg,
      icons: els.icons,
      fx:    root.querySelector('#cmFx')
    };

    // Ein Auswahlfeld für beide Richtungen: „ohne Zeitlimit" (Wert 0)
    // löscht den Timer, jede andere Zahl setzt ihn. Danach springt das
    // Feld auf den Platzhalter zurück — es zeigt keinen Zustand an,
    // sondern löst eine Handlung aus (siehe Kommentar am DOM).
    els.timerSel.addEventListener('change', async () => {
      const raw = els.timerSel.value;
      els.timerSel.value = '';
      if (raw === '') return;
      const secs = parseInt(raw, 10);
      els.timerSel.disabled = true;
      const r = secs > 0
        ? await ctx.actions.call('clash_room_set_match_timer', { p_seconds: secs })
        : await ctx.actions.call('clash_room_clear_match_timer', {});
      els.timerSel.disabled = false;
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });

    /* ── Ein Volk an- oder abwählen ────────────────────────────────
       Ein Zuhörer auf der ganzen Reihe statt acht einzelner: die
       Knöpfe werden bei jedem Takt neu gezeichnet, einzeln
       angeheftete Zuhörer wären damit jedes Mal weg. */
    els.pick.addEventListener('click', async ev => {
      const btn = ev.target.closest('.cm-pickbtn');
      if (!btn || btn.disabled) return;
      const fac = parseInt(btn.dataset.fac, 10);
      if (!Number.isInteger(fac)) return;

      const on   = pickSel.indexOf(fac) >= 0;
      const next = on ? pickSel.filter(f => f !== fac) : pickSel.concat([fac]);
      if (next.length < 2) { ctx.toast('Mindestens zwei Völker müssen mitspielen.', true); return; }
      if (next.length > FACTION_COUNT) return;
      next.sort((a, b) => a - b);   // dieselbe Ordnung, die der Server speichert

      // Sofort umschalten, ohne auf den Server zu warten — ein Klick,
      // der eine halbe Sekunde nichts tut, wird ein zweites Mal
      // geklickt. Solange die Antwort aussteht (pickBusy), darf ein
      // dazwischenfunkender Takt die Auswahl NICHT zurückdrehen; die
      // Spalten darunter bleiben derweil auf dem Stand des Servers,
      // weil ihre Verteilung nur von dort kommen kann.
      pickSel = next;
      pickBusy++;
      renderPick();
      const r = await ctx.actions.call('clash_room_set_factions', { p_factions: next });
      pickBusy--;
      if (!r || !r.ok) {
        ctx.toast(ctx.errText((r && r.error) || 'network'), true);
        // Fehlgeschlagen ⇒ die Wahrheit des Servers wieder zulassen.
        if (!pickBusy) syncPickFromView(lastView);
        renderPick();
        return;
      }
      if (Array.isArray(r.factions)) { factions = r.factions; if (!pickBusy) pickSel = r.factions.slice(); }
      renderPick();
      tick(true);
    });

    els.startBtn.addEventListener('click', async () => {
      els.startBtn.disabled = true;
      const r = await ctx.actions.call('clash_room_start', {});
      els.startBtn.disabled = false;
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });

    // Würfelt nur die VORSCHAU neu (der Server dreht clash_boards.
    // shuffle_seed, clash_preview_teams tut den Rest) — die Spalten
    // darunter zeigen die neue Verteilung, sobald der Takt zurück ist.
    els.shuffleBtn.addEventListener('click', async () => {
      els.shuffleBtn.disabled = true;
      const r = await ctx.actions.call('clash_room_shuffle_teams', {});
      els.shuffleBtn.disabled = false;
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });

    els.resetBtn.addEventListener('click', async () => {
      if (!(await ctx.confirm('Neues Spiel starten? Der bisherige Spielstand geht verloren.'))) return;
      const r = await ctx.actions.call('clash_room_reset', {});
      if (!r || !r.ok) { ctx.toast(ctx.errText((r && r.error) || 'network'), true); return; }
      nudge();
      tick(true);
    });
  }

  /* ─── Fraktionsliste links/rechts neben der Karte ────────────────
     Ersetzt die frühere Statuszeile über der Karte (cm-statusbar):
     im Showroom stehen die Fraktionen in zwei Spalten neben dem Feld,
     mit Wappenbild, Fraktionsnamen und Feldzahl. Teams wechseln sich
     ab (gerade nach links, ungerade nach rechts), damit beide Spalten
     gleich lang bleiben. */
  function rosterCardHTML(i, count, correct, members, ruin) {
    const dead = count === 0;
    // Namensliste. `team_members` kommt erst ab Migration 0096 — läuft
    // sie noch nicht, fehlt der Schlüssel einfach und das Panel zeigt
    // Bild/Name/Zahl wie zuvor, statt „undefined" zu schreiben.
    // Jeder Name in einem eigenen Element, nicht mehr als eine
    // zusammengeklebte Zeile: nur so lässt sich EIN Kind hervorheben,
    // wenn es eine Einzel-Serie geschafft hat (UI 18). Der Trenner
    // steht deshalb in tool.css (::after) statt im Text.
    const names = Array.isArray(members) ? members : [];
    const memberHTML = names.length
      ? `<div class="cm-rmembers">${names.map(n =>
          `<span class="cm-rmember${memberFire(i, n) ? ' cm-rmember--fire' : ''}">${ctx.esc(n)}</span>`
        ).join('')}</div>`
      : '';
    // EINE Einheit mit dem Namen daneben (nicht das Gruppenbild über
    // die volle Breite): so bleibt die Kopfzeile flach und der Platz
    // darunter gehört den Namen der Kinder.
    // Unter dem Namen die richtigen Antworten des Volkes (0099): die
    // große Zahl rechts sagt, wem das Feld gehört — sie sagt aber
    // nicht, wer gerechnet hat. Ein Volk kann viel Feld halten, ohne
    // gerade fleißig zu sein, und umgekehrt. Beide Zahlen stehen
    // deshalb nebeneinander, die Antwort-Zahl klein und mit Häkchen,
    // damit sie nicht mit der Feldzahl verwechselt wird.
    // Drei Zustände können gleichzeitig gelten: raus (grau), gerade
    // erst rausgeflogen (zuckt) und „on fire" (leuchtet). Sie schließen
    // sich nicht aus — ein Volk kann eine Serie schaffen und in
    // derselben Sekunde sein letztes Feld verlieren.
    const cls = 'cm-rcard' + (dead ? ' cm-rcard--out' : '') +
                // 0108: ausgeschieden UND noch am Rechnen. Das Panel
                // bleibt grau, aber weniger blass — wer weiterspielt,
                // darf nicht so aussehen wie einer, der aufgehört hat.
                ((dead && ruin) ? ' cm-rcard--ruin' : '') +
                (isFire(teamOutUntil, i) ? ' cm-rcard--justout' : '') +
                (teamFire(i) ? ' cm-rcard--fire' : '');
    /* Die große Zahl rechts ist bei einem lebenden Volk die Feldzahl.
       Bei einem ausgeschiedenen wäre sie dauerhaft „0" — eine Zahl, die
       nichts mehr erzählt, während das Volk gerade weiterrechnet. An
       ihrer Stelle steht seit 0108 der Ruinen-Fortschritt: so sieht die
       Klasse am Beamer, WARUM dort noch getippt wird, und wie nah das
       nächste versinkende Feld ist. `ruin` fehlt, solange 0108 nicht
       läuft — dann bleibt es bei der Null wie zuvor. */
    const scoreHTML = (dead && ruin)
      ? `<span class="cm-rruin" title="Ruinen: noch ${ruin.to_next} richtige Antworten, bis ein Feld verschwindet">` +
          `<b>${(ruin.points || 0) % 10}</b><i>/10</i></span>`
      : `<span class="cm-rcount" title="Felder">${count}</span>`;
    return `<div class="${cls}" style="--team:${fStroke(i)}">` +
      '<div class="cm-rhead">' +
        `<div class="cm-rthumb"><img src="${esrc(fUnit(i))}" alt=""></div>` +
        '<div class="cm-rtitle">' +
          `<span class="cm-rname">${ctx.esc(fLabel(i))}</span>` +
          `<span class="cm-rcorr" title="richtige Antworten">✓ ${correct} richtig</span>` +
        '</div>' +
        scoreHTML +
      '</div>' +
      memberHTML +
    '</div>';
  }

  function fillRosters(v) {
    if (!els.rosterLeft || !els.rosterRight) return;
    const members = v.team_members || {};
    const correct = v.team_correct_counts || {};
    const ruin    = v.ruin || {};   // 0108, fehlt ohne die Migration
    let left = '', right = '';
    for (let i = 0; i < v.team_count; i++) {
      const n = (v.team_tile_counts && v.team_tile_counts[String(i)]) || 0;
      const c = parseInt(correct[String(i)], 10) || 0;
      const html = rosterCardHTML(i, n, c, members[String(i)], ruin[String(i)]);
      if (i % 2 === 0) left += html; else right += html;
    }
    els.rosterLeft.innerHTML = left;
    els.rosterRight.innerHTML = right;
  }

  /* ─── Restzeit-Ring oben rechts ──────────────────────────────────
     Der Server kennt nur `match_ends_at`, nicht die gewählte Dauer
     (0094 legt keine Spalte dafür an) — der Füllstand braucht aber
     einen Nenner. Statt dafür eine Migration zu bauen, merkt sich der
     Client die größte Restzeit, die er für DIESES Rundenende gesehen
     hat: beim Setzen des Timers ist das die volle Dauer, und wer die
     Seite mitten in der Runde neu lädt, sieht den Ring bei „voll"
     anfangen und sauber leerlaufen. Nie falsch, höchstens optimistisch
     — und die Zahl in der Mitte stimmt in jedem Fall. */
  function renderRing(fraction, label) {
    if (!els.ring) return;
    const size = 46, thickness = 5;
    const r = (size / 2) - thickness / 2 - 1;
    const circ = 2 * Math.PI * r;
    const off = circ * (1 - Math.max(0, Math.min(1, fraction)));
    els.ring.innerHTML =
      `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="cm-ringtrack" stroke-width="${thickness}" fill="none"/>` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="cm-ringbar" stroke-width="${thickness}" fill="none" ` +
          `stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" ` +
          `transform="rotate(-90 ${size / 2} ${size / 2})"/>` +
      '</svg>' +
      `<span class="cm-ringlabel">${label}</span>`;
  }

  /* ══════════════════════════════════════════════════════════
     Lobby der Lehrkraft: Auswahlreihe, Volk-Spalten, Nicht-Online
     ══════════════════════════════════════════════════════════ */

  /* Die acht Wappen zum An- und Abwählen. Nicht Gewählte sind grau und
     blass, Gewählte tragen ihre Farbe und einen Schein — dieselbe
     Aussage wie beim ausgeschiedenen Volk auf dem Spielfeld
     (.cm-rcard--out), nur andersherum gelesen.
     `title` und `aria-label` tragen den Volksnamen, den die Reihe
     absichtlich nicht hinschreibt: für die Maus als Kurzhinweis, für
     Vorlese-Werkzeuge als einzige Auskunft überhaupt. */
  function renderPick() {
    if (!els.pick) return;
    const locked = pickSel.length <= 2;   // die letzten zwei sind nicht abwählbar
    let out = '';
    for (let f = 0; f < FACTION_COUNT; f++) {
      const on   = pickSel.indexOf(f) >= 0;
      const name = FACTION_LABEL[f];
      out += `<button type="button" class="cm-pickbtn${on ? ' cm-pickbtn--on' : ''}" ` +
        `data-fac="${f}" aria-pressed="${on}" aria-label="${ctx.esc(name)}" title="${ctx.esc(name)}" ` +
        `style="--team:${FACTION_STROKE[f]}"${on && locked ? ' data-locked="1"' : ''}>` +
        `<img src="${esrc(FACTION_UNIT[f])}" alt="">` +
      '</button>';
    }
    els.pick.innerHTML = out;
  }

  // Die Auswahl des Servers übernehmen. Läuft nur, wenn gerade kein
  // eigener Klick unterwegs ist — sonst würde eine Antwort von vorhin
  // die frischere Anzeige überschreiben.
  function syncPickFromView(v) {
    if (!v) return;
    if (Array.isArray(v.factions) && v.factions.length) pickSel = v.factions.slice();
    else pickSel = Array.from({ length: v.team_count || 2 }, (_, i) => i);
  }

  /* Eine Spalte je gewähltem Volk: Gruppenbild, Name mit Kopfzahl,
     darunter die Kinder. Nebeneinander statt untereinander — die Lobby
     hängt am Beamer, und nebeneinander sieht die Klasse auf einen
     Blick, wer zu wem gehört, statt vier Listen abwärts lesen zu
     müssen. Ein Volk ohne Anwesende bleibt trotzdem stehen: es
     SPIELT mit, es ist nur noch niemand da. */
  function renderLobbyTeams(v) {
    if (!els.lobbyTeams) return;
    const members = v.team_members || {};
    let out = '';
    for (let slot = 0; slot < v.team_count; slot++) {
      const names = Array.isArray(members[String(slot)]) ? members[String(slot)] : [];
      const n = (v.teams && v.teams[String(slot)]) || names.length;
      const list = names.length
        ? names.map(x => `<li>${ctx.esc(x)}</li>`).join('')
        : '<li class="cm-lteamempty">noch niemand</li>';
      out += `<div class="cm-lteam" style="--team:${fStroke(slot)}">` +
        `<div class="cm-lteampic"><img src="${esrc(FACTION_TEAM[facOf(slot)] || FACTION_TEAM[0])}" alt=""></div>` +
        '<div class="cm-lteamname">' +
          `<span>${ctx.esc(fLabel(slot))}</span>` +
          `<span class="cm-lteamn">${n}</span>` +
        '</div>' +
        `<ul class="cm-lteamlist">${list}</ul>` +
      '</div>';
    }
    els.lobbyTeams.innerHTML = out;
  }

  /* Wer im Raum ist, aber gerade nicht online: eine eigene Reihe ganz
     unten, nebeneinander. Bewusst NICHT in die Völker-Spalten
     einsortiert — beim Start bekommen genau diese Kinder kein Team
     (clash_room_start), und was auf dem Beamer bei einem Volk steht,
     soll auch dort mitspielen. Die Reihe verschwindet ganz, wenn alle
     online sind: eine leere Überschrift wäre nur Lärm. */
  function renderOffline(v) {
    if (!els.offline) return;
    const names = Array.isArray(v.offline_members) ? v.offline_members : [];
    if (!names.length) { els.offline.classList.add('cm-hide'); els.offline.innerHTML = ''; return; }
    els.offline.classList.remove('cm-hide');
    els.offline.innerHTML =
      `<span class="cm-offlabel">Gerade nicht online (${names.length}) — sie bekommen beim Start kein Team:</span>` +
      names.map(x => `<span class="cm-offname">${ctx.esc(x)}</span>`).join('');
  }

  /* Das Siegerbild am Beamer: alle Völker, die ersten drei auf dem
     Podest, der Rest daneben. Die Podest-Karten stehen in der DOM in
     der Reihenfolge 1·2·3 und werden erst von tool.css auf 2·1·3
     umgestellt — wer die Seite vorlesen lässt, hört den Sieger zuerst
     und nicht den Zweiten. */
  function renderEndPresenter(v) {
    const rows = endRows(v);
    const win  = rows[0];
    els.endedP.style.setProperty('--cm-win', fStroke(win.slot));
    els.endTitleP.innerHTML = endTitleHTML(win.slot);

    const top = rows.slice(0, 3);
    els.podium.innerHTML = top.map((r, i) => podCardHTML(r, 'cm-pod--' + (i + 1))).join('');
    // Zwei Völker sind kein Podest: ohne dritte Stufe stünde der
    // Sieger sonst rechts außen statt in der Mitte.
    els.podium.classList.toggle('cm-podium--duo', top.length < 3);

    const rest = rows.slice(3);
    els.endRest.innerHTML = rest.map(endRowHTML).join('');
    els.endRest.classList.toggle('cm-hide', !rest.length);
  }

  function renderPresenter(v) {
    if (v.phase === 'lobby') {
      show2('setup');
      if (!pickBusy) syncPickFromView(v);
      renderPick();
      renderLobbyTeams(v);
      renderOffline(v);
      return;
    }
    if (v.phase === 'countdown') {
      show2('countdownP');
      startCountdown(v.countdown_ends_at);
      return;
    }
    stopCountdown();
    // Kein unbedingtes stopMatchTimer() — Begründung bei
    // renderParticipant (der Ring stünde sonst immer auf „voll").
    if (v.phase === 'ended') {
      stopMatchTimer();
      show2('endedP');
      renderEndPresenter(v);
      return;
    }
    show2('boardWrap');
    fillRosters(v);
    // 0108: Wie klein ist das Feld inzwischen? Steht nur da, sobald
    // wirklich etwas verschwunden ist.
    if (els.boardSize) {
      const b = v.board || {};
      const shrunk = (b.removed || 0) > 0;
      els.boardSize.textContent = shrunk
        ? '🏚️ Spielfeld: ' + b.tiles + ' von ' + b.initial_tiles +
          (b.floor_reached ? ' — am Minimum' : '')
        : '';
      els.boardSize.classList.toggle('cm-hide', !shrunk);
    }
    // Ohne Timer steht hier nichts: dass kein Zeitlimit gesetzt ist,
    // sagt schon der fehlende Ring oben rechts.
    if (els.timerState) {
      els.timerState.textContent = v.match_ends_at
        ? 'Bei Ablauf gewinnt, wer am meisten Feld hat.'
        : '';
    }
    if (v.match_ends_at) startMatchTimer(v.match_ends_at); else stopMatchTimer();
    fitPresenterMap();
    requestAnimationFrame(fitPresenterMap);
  }

  function show2(which) {
    ['setup', 'countdownP', 'boardWrap', 'endedP'].forEach(k => {
      const el = { setup: els.setup, countdownP: els.countdownP,
                   boardWrap: els.boardWrap, endedP: els.endedP }[k];
      if (el) el.classList.toggle('cm-hide', k !== which);
    });
    if (which !== 'countdownP') stopCountdown();
  }

  /* ══════════════════════════════════════════════════════════
     Werkzeug-Schnittstelle
     ══════════════════════════════════════════════════════════ */
  window.MPTool.register('clash-of-math', {
    // Die Völker-Auswahl lebt bewusst NICHT im generischen
    // Einstellungen-Fach: sie ist über eine eigene RPC gesperrt,
    // solange phase<>lobby, und das lässt sich mit has_participants/
    // has_entries (0084) nicht ausdrücken. Außerdem ist sie eine Reihe
    // anklickbarer Bilder, kein Formularfeld. Sie steht deshalb im
    // Werkzeug selbst (Fach 3, Beamer-Rolle) — leere Liste = „keine
    // Angabe hier".
    settingsFields: [],

    mount(el, c) {
      root = el; ctx = c; role = ctx.role;
      destroyed = false; lastSig = null; lastView = null; channelKey = null;
      // 0106: neuer Raum, neue Serien-Boni-Historie.
      myPendingPicks = 0; pendingPickDeadlineMs = 0; lastTeamEventId = 0;
      // UI 18: neuer Raum, kein Vergleichsstand und keine offenen
      // Ereignisse. Die `primed`-Schalter sorgen dafür, dass der erste
      // Abruf nur mitschreibt und nichts abfeuert.
      resetFx();
      lastRoomEventId = 0; roomEventsPrimed = false; teamEventsPrimed = false;
      announceQueue = [];

      if (role === 'presenter') buildPresenterDOM(); else buildParticipantDOM();

      // Beamer: die Karte soll den ganzen freien Platz nehmen (Fix 2)
      // — dieselbe „tool-fill"-Klasse wie bei NeuroLab/Cäsar, hier nur
      // für die Lehrkraft-Rolle. Der Teilnehmer behält seine begrenzte
      // Karte in der Seite, siehe Kopfkommentar der Datei.
      if (role === 'presenter' && !(ctx && ctx.preview)) {
        document.body.classList.add('tool-fill');
        onWinResize = () => fitPresenterMap();
        window.addEventListener('resize', onWinResize);
      }

      // Der Spielbildschirm des Teilnehmers hängt am SICHTBAREN Bereich
      // (position:fixed auf --vv-h), nicht an der Größe von `root` —
      // ein ResizeObserver auf root bekommt eine Drehung des Tablets
      // deshalb gar nicht mit. Für ihn ist window.resize der richtige
      // Anlass; der Beobachter bleibt für die Zuschauer-Karte, die
      // ganz normal in der Seite steht.
      if (role !== 'presenter') {
        onWinResize = () => {
          if (!lastView) return;
          renderPlayerMap();
        };
        window.addEventListener('resize', onWinResize);
      }

      resizeObs = new ResizeObserver(() => {
        if (!lastView) return;
        if (role === 'presenter') { fitPresenterMap(); }
        else if (els.omap && els.out && !els.out.classList.contains('cm-hide')) {
          const myTeam = lastView.me && lastView.me.team;
          renderHexMap(els.omap, lastView, { units: false, highlight: myTeam });
        }
      });
      resizeObs.observe(root);

      // Sicherheitsnetz: alle 8s eine billige Signatur — der schnelle
      // Weg ist der Broadcast-Kanal (siehe ensureChannel/nudge).
      pollTimer = setInterval(() => tick(false), 8000);
      tick(true);
    },

    // Wird vom generischen Seiten-Poller aufgerufen (skill_view/
    // skill_room_get) — für Clash meist ohne eigene Bedeutung, aber
    // ein billiger zusätzlicher Anstoß schadet nicht: irgendjemand
    // im Raum ist gerade aktiv genug, dass sich die generische
    // Ansicht geändert hat.
    update() { tick(false); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      stopCountdown();
      stopMatchTimer();
      stopPickCountdown();   // 0106
      stopAnnounce();        // UI 18 — muss vor dem Leeren von els laufen
      if (fireToastTimer) clearTimeout(fireToastTimer);
      fireToastTimer = null;
      if (mapCloseTimer) clearTimeout(mapCloseTimer);
      mapCloseTimer = null;
      if (onWinResize) window.removeEventListener('resize', onWinResize);
      onWinResize = null;
      document.removeEventListener('keydown', onHardwareKey);
      if (feedbackTimer) clearTimeout(feedbackTimer);
      if (flashTimer) clearTimeout(flashTimer);
      feedbackTimer = flashTimer = null;
      document.body.classList.remove('tool-fill', 'cm-locked');
      if (resizeObs) { try { resizeObs.disconnect(); } catch (e) {} }
      resizeObs = null;
      if (channel && window.supabaseClient) {
        try { window.supabaseClient.removeChannel(channel); } catch (e) {}
      }
      channel = null; channelKey = null;
      root = ctx = null; role = null;
      els = {}; lastView = null; lastSig = null; busy = false; submitting = false;
      unitSpots = {};   // die Einheiten-Plätze gehören zu DIESEM Raum
      pickSel = []; pickBusy = 0; factions = [0, 1, 2, 3];
      answerBuf = ''; keyMode = null; mapOpen = false;
      myPendingPicks = 0; pendingPickDeadlineMs = 0; lastTeamEventId = 0;   // 0106
      resetFx();                                                            // UI 18
      lastRoomEventId = 0; roomEventsPrimed = false; teamEventsPrimed = false;
    }
  });
})();
