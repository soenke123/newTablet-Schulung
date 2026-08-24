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

   Was noch keine Quelle hat: die Serie des VOLKES (die eigene kommt
   aus me.streak). Sie steht als „–" schon im Bild, damit später nur
   der Wert nachzureichen ist — der Client liest v.team_streak.

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
                          '#a855f7', '#06b6d4', '#d946a0', '#f472b6'];

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
  function computeBorderSegments(tiles, centerFn, hexR) {
    const ownerMap = new Map();
    tiles.forEach(t => ownerMap.set(t.r + ',' + t.c, t.team));
    const dirsEven = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    const dirsOdd  = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
    const segsByTeam = {};
    tiles.forEach(t => {
      const dirs = (t.r % 2 === 1) ? dirsOdd : dirsEven;
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
      const cls = (mine != null && t.team === mine) ? 'cm-hex cm-hex--mine' : 'cm-hex';
      poly += '<polygon class="' + cls + '" points="' + pts.join(' ') + '" style="--raw:' + fStroke(t.team) + '"></polygon>';
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
    '</div>';
  }
  function mapDom(prefix) {
    return {
      wrap:  root.querySelector('#' + prefix + 'Wrap'),
      svg:   root.querySelector('#' + prefix + 'Svg'),
      icons: root.querySelector('#' + prefix + 'Icons')
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

    if (els.hexsvg && els.icons) {
      renderHexMap({ wrap: els.mapWrap, svg: els.hexsvg, icons: els.icons }, lastView, { units: true });
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
    if (v.phase === 'lobby' || v.phase === 'countdown') unitSpots = {};
    ensureChannel(v.broadcast_key);
    if (role === 'presenter') renderPresenter(v); else renderParticipant(v);
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
              mapDomHTML('cmPMap') +
              '<div class="cm-mapovfoot" id="cmMapFoot"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Ausgeschieden: derselbe Blick wie beim Zuschauen auf dem
        // Beamer, nur ohne Tastatur — die Karte steht jetzt fest da,
        // statt hinter einem Knopf.
        '<div class="cm-pane cm-hide" id="cmOut">' +
          '<p class="cm-lead">Dein Volk ist ausgeschieden.</p>' +
          '<p class="cm-hint">Du siehst weiter zu, wie es weitergeht.</p>' +
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
      heroUnit: root.querySelector('#cmPUnit'),
      share: root.querySelector('#cmPShare'),
      shareLab: root.querySelector('#cmPShareLab'),
      shareBar: root.querySelector('#cmPBar'),
      streak: root.querySelector('#cmStreak'),
      teamStreak: root.querySelector('#cmTeamStreak'),
      mapBtn: root.querySelector('#cmMapBtn'),
      mapOv: root.querySelector('#cmMapOv'),
      mapFoot: root.querySelector('#cmMapFoot'),
      mapClose: root.querySelector('#cmMapClose'),
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
    els.mapBtn.addEventListener('click', openMap);
    els.mapClose.addEventListener('click', closeMap);
    // Klick auf die Fläche neben der Karte schließt ebenfalls — der
    // ✕ ist klein, und ein Kind, das die Karte wieder loswerden will,
    // tippt irgendwohin.
    els.mapOv.addEventListener('click', ev => { if (ev.target === els.mapOv) closeMap(); });
    document.addEventListener('keydown', onHardwareKey);
  }

  /* ─── Das Karten-Fenster ────────────────────────────────────────
     Die Karte ist standardmäßig ZU. Auf dem Spielbildschirm gehört der
     Platz der Aufgabe; wer wissen will, wie es steht, holt sie sich —
     und sieht dann dasselbe Bild wie die Klasse auf dem Beamer, nur
     ohne die wandernden Einheiten und mit dem eigenen Gebiet
     hervorgehoben. */
  function openMap() {
    if (!els.mapOv) return;
    mapOpen = true;
    els.mapOv.classList.remove('cm-hide');
    renderPlayerMap();
    // Zweimal: beim ersten Mal hat die gerade eingeblendete Fläche noch
    // keine verlässlichen Maße (clientWidth 0) — dieselbe Zweitmessung
    // wie beim Beamer.
    requestAnimationFrame(renderPlayerMap);
  }
  function closeMap() {
    mapOpen = false;
    if (els.mapOv) els.mapOv.classList.add('cm-hide');
  }
  function renderPlayerMap() {
    if (!mapOpen || !lastView || !els.pmap) return;
    const myTeam = lastView.me && lastView.me.team;
    renderHexMap(els.pmap, lastView, { units: false, highlight: myTeam });
    if (els.mapFoot && myTeam != null) {
      els.mapFoot.innerHTML = `<span class="cm-maplegend" style="--team:${fStroke(myTeam)}">` +
        '<i></i>Dein Gebiet — ' + ctx.esc(fLabel(myTeam)) + '</span>';
    }
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
      if (r.captured) msg = r.captured.castle ? '👑 Burg erobert!' : '✅ Feld erobert!';
      else if (r.castle_hit) msg = '💥 Burg getroffen! Noch ' + r.castle_hit.hp;
      setFeedback(msg, 'ok');
      flashInput('ok');
      // Eigene Antwort ist Wahrheit — lokal patchen statt auf den
      // nächsten Takt zu warten, und die anderen anstoßen.
      const hitAt = r.captured || r.castle_hit;
      if (lastView && hitAt) {
        const t = (lastView.tiles || []).find(x => x.r === hitAt.r && x.c === hitAt.c);
        if (t) {
          if (r.captured) {
            t.team = lastView.me.team;
            if (r.captured.castle) t.hp = r.captured.hp;   // übernommen ⇒ wieder voll
          } else t.hp = r.castle_hit.hp;
        }
        renderStandings(lastView);
        renderPlayerMap();
      }
      nudge();
    } else if (r.correct === false) {
      setFeedback('❌ Leider nicht.', 'warn');
      flashInput('warn');
    } else {
      setFeedback('', '');
    }
    if (r.streak != null) setStreak(r.streak);
    if (r.question) setQuestion(r.question);
  }

  /* Rückmeldung und Aufgabe stehen in EIGENEN Kästen mit fester Höhe:
     eine Zeile, die mal da ist und mal nicht, würde die Tastatur bei
     jeder Antwort um ihre eigene Höhe verschieben — und das genau in
     dem Moment, in dem der Finger schon zur nächsten Taste unterwegs
     ist. */
  let feedbackTimer = null;
  function setFeedback(text, kind) {
    if (!els.feedback) return;
    els.feedback.textContent = text;
    els.feedback.className = 'cm-feedback' + (kind ? ' cm-feedback--' + kind : '');
    if (feedbackTimer) clearTimeout(feedbackTimer);
    if (text) feedbackTimer = setTimeout(() => {
      if (els.feedback) els.feedback.textContent = '';
    }, 1800);
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
      const cls = 'cm-fchip' + (n === 0 ? ' cm-fchip--out' : '') + (i === myTeam ? ' cm-fchip--me' : '');
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

  function renderStandings(v) {
    const myTeam = v.me.team;
    const counts = tileCounts(v);
    renderFactionRow(v, myTeam, counts);

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
    if (!v.me.alive) {
      stopMatchTimer();
      show('out');
      renderHexMap(els.omap, v, { units: false, highlight: myTeam });
      requestAnimationFrame(() => renderHexMap(els.omap, v, { units: false, highlight: myTeam }));
      return;
    }
    show('game');
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
    // Die Serie des Volkes hat noch keine Quelle (siehe DOM-Kommentar).
    // Sobald der Server sie schickt, ist das hier die einzige Zeile,
    // die sich ändert.
    if (els.teamStreak) {
      els.teamStreak.querySelector('b').textContent =
        (v.team_streak != null) ? String(v.team_streak) : '–';
    }
    renderStandings(v);
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
    if (which !== 'game') { closeMap(); answerBuf = ''; }
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
              '<div class="cm-ring cm-hide" id="cmRing"></div>' +
            '</div>' +
            '<div class="cm-arena" id="cmArena">' +
              '<div class="cm-mapwrap cm-mapwrap--kingdoms" id="cmMapWrap">' +
                '<div class="cm-mapinner"><svg class="cm-hexsvg" id="cmHexSvg"></svg></div>' +
                '<div class="cm-iconlayer" id="cmIcons"></div>' +
              '</div>' +
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
      countdownP: root.querySelector('#cmCountdownP'),
      countNumP: root.querySelector('#cmCountNumP'),
      boardWrap: root.querySelector('#cmBoardWrap'),
      frame: root.querySelector('#cmFrame'),
      boardTop: root.querySelector('#cmBoardTop'),
      ring: root.querySelector('#cmRing'),
      arena: root.querySelector('#cmArena'),
      rosterLeft: root.querySelector('#cmRosterLeft'),
      rosterRight: root.querySelector('#cmRosterRight'),
      timerBar: root.querySelector('#cmTimerBar'),
      timerSel: root.querySelector('#cmTimerSel'),
      timerState: root.querySelector('#cmTimerState'),
      mapWrap: root.querySelector('#cmMapWrap'),
      hexsvg: root.querySelector('#cmHexSvg'),
      icons: root.querySelector('#cmIcons'),
      endedP: root.querySelector('#cmEndedP'),
      endTitleP: root.querySelector('#cmEndTitleP'),
      podium: root.querySelector('#cmPodium'),
      endRest: root.querySelector('#cmEndRest'),
      resetBtn: root.querySelector('#cmResetBtn')
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
  function rosterCardHTML(i, count, correct, members) {
    const dead = count === 0;
    // Namensliste. `team_members` kommt erst ab Migration 0096 — läuft
    // sie noch nicht, fehlt der Schlüssel einfach und das Panel zeigt
    // Bild/Name/Zahl wie zuvor, statt „undefined" zu schreiben.
    const names = Array.isArray(members) ? members : [];
    const memberHTML = names.length
      ? `<div class="cm-rmembers">${names.map(n => ctx.esc(n)).join(' · ')}</div>`
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
    return `<div class="cm-rcard${dead ? ' cm-rcard--out' : ''}" style="--team:${fStroke(i)}">` +
      '<div class="cm-rhead">' +
        `<div class="cm-rthumb"><img src="${esrc(fUnit(i))}" alt=""></div>` +
        '<div class="cm-rtitle">' +
          `<span class="cm-rname">${ctx.esc(fLabel(i))}</span>` +
          `<span class="cm-rcorr" title="richtige Antworten">✓ ${correct} richtig</span>` +
        '</div>' +
        `<span class="cm-rcount" title="Felder">${count}</span>` +
      '</div>' +
      memberHTML +
    '</div>';
  }

  function fillRosters(v) {
    if (!els.rosterLeft || !els.rosterRight) return;
    const members = v.team_members || {};
    const correct = v.team_correct_counts || {};
    let left = '', right = '';
    for (let i = 0; i < v.team_count; i++) {
      const n = (v.team_tile_counts && v.team_tile_counts[String(i)]) || 0;
      const c = parseInt(correct[String(i)], 10) || 0;
      const html = rosterCardHTML(i, n, c, members[String(i)]);
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
    }
  });
})();
