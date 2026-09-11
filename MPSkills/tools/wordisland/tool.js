/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Myth of Wordisland"  ·  tool.js
   ══════════════════════════════════════════════════════════════
   Sechster Skill, erster im Fach Englisch, zweites Team-Spiel nach
   Kingdoms of Mathoria — und wie dieses eines mit EIGENEN Tabellen
   statt der generischen Inhaltsschicht (Migrationen 0130/0131/0133).

   ── Ein Modul, DREI Rollen ────────────────────────────────────
   Am Beamer steht das Pult (Völker wählen, Units wählen, starten,
   zusehen), am Tablet die Wartetafel, die Aufgabe und die Insel.
   Das ist dasselbe Werkzeug in zwei Rollen: ctx.role entscheidet,
   welches DOM gebaut wird, ctx.actions.call trägt die Rolle in den
   Server (p_token bzw. p_code, siehe lib/tool.js).

   Seit 0136 gibt es eine dritte: `solo` — die eigene Insel, auf
   der ein Kind ohne Raum und ohne Lehrkraft übt (MPSkills/insel.html).
   Sie steht HIER und nicht in einem eigenen Ordner, obwohl sie kein
   Raum ist: sie braucht dieselbe Karte, und die ist sechshundert
   Zeilen. Zwei Fassungen davon wären nach der ersten Verbesserung
   am Relief zwei verschiedene Karten — und die zweite die
   vergessene.

   Was die drei Rollen teilen, ist die Karte und der Antwortweg.
   Was sie NICHT teilen, ist alles darüber: das Pult, die
   Wartetafel und die Insel mit den Tieren sind je eigenes DOM.

   ── Die Tiere (Rolle solo) ────────────────────────────────────
   Jede Vokabel ist ein Tier, und seine Stufe ist ihr Lernstand:
   Ei → geschlüpft → gewachsen → ausgewachsen (fliegt) → funkelnd.
   Gezeichnet werden sie auf einer LEINWAND über dem Karten-SVG und
   nicht als SVG-Elemente: bei 400 Tieren, die alle laufen, wären
   das 400 Elemente, die sechzigmal in der Sekunde ihre Attribute
   ändern. Die Vorlage dafür ist solo-showroom.html — ein Prüfstand,
   der genau diese Frage beantwortet hat und weiter danebenliegt.

   ⚠️ Die Karte wird im Solo OHNE Nebel, Flaggen, besondere Orte und
   Schiffe gebaut (buildMap(..., { solo: true })): es gibt nichts zu
   erobern. Die Schalter dafür stehen in buildMap, reliefLand und
   frame und sind dort einzeln kommentiert.

   ── Der Stufensprung ist DER Moment ───────────────────────────
   Eine Vokabel steigt eine Stufe, wenn sie in BEIDE Richtungen
   sitzt (wi_solo_stages rechnet das Minimum). Das ist der einzige
   Augenblick des ganzen Werkzeugs, in dem jemand für etwas belohnt
   wird, das er weiß — und er bekommt deshalb Zeit und Platz:
   die Übungskarte spielt die Verwandlung ab (das Ei springt auf,
   das Tier wächst, der Flieger hebt ab), ein Satz sagt mit dem Wort
   darin, was passiert ist, ein Dreiklang steigt mit der Stufe, und
   die nächste Frage WARTET so lange. Draußen wirft das Tier auf der
   Insel im selben Moment einen Funkenkranz.
   Alles davon steht im Abschnitt „DIE ÜBUNGSKARTE" (kartZeichne)
   und in feierStufe. Der Server weiß davon nichts: er liefert seit
   0136 `level_before` und `level_after`, mehr braucht es nicht.

   ── Die Lobby ist die von Kingdoms ────────────────────────────
   Sönkes Vorgabe (2026-09-07). Beide Spiele stellen dieselbe Frage
   („wer spielt mit, und wie?"), und sie sollen sie gleich stellen:

     · Die Wappenreihe. Angeklickt heißt dabei, weggeklickt heißt
       raus — hier mit SECHS Völkern statt acht. Welche mitspielen,
       steht seit 0133 als `factions` im Server (factions[slot] =
       Volk); der Server selbst rechnet weiter in Slots.
     · Die Einstellungen als Segment-Schalter statt als Auswahl-
       felder: man sieht, wogegen man sich entscheidet.
     · Eine Spalte je Volk mit den Namen der Gruppe, am Beamer
       nebeneinander.
     · Am Tablet dieselbe Spalte für das EIGENE Volk, groß, und die
       anderen als schmale Zeile darunter.

   Ein Unterschied bleibt, und er ist inhaltlich: bei Kingdoms
   bekommt ein Kind, das gerade nicht online ist, beim Start kein
   Team. wi_room_start verteilt ausnahmslos alle Teilnehmer des
   Raums — die Lobby sagt deshalb „gerade nicht am Tablet" und
   nicht „spielt nicht mit".

   ── Warum ein eigener Takt ────────────────────────────────────
   Der Seiten-Poller ruft skill_view/skill_room_get — die generische
   Ansicht, in der von dieser Insel nichts steht. Wordisland fragt
   deshalb selbst (wi_view/wi_room_get), genau wie Clash. update()
   des Seiten-Pollers wird trotzdem angenommen: ein zusätzlicher
   Anstoß schadet nicht.

   ── Karte einmal bauen, Besitz je Takt malen ──────────────────
   Der Server schickt die Felder (`map`) nur, wenn man danach fragt,
   und danach je Takt eine Zeichenkette mit EINEM Zeichen je Feld
   (`own`: '.' = Nebel, '0'..'5' = SLOT). Bei 500 Feldern sind das
   500 Byte statt 12 KB — dreißigmal alle vier Sekunden. Das SVG
   wird deshalb einmal gebaut und danach nur noch umgefärbt und
   angehoben; neu gebaut wird es erst, wenn `map_key` wechselt
   (= neue Runde, neue Insel).

   Wie die Karte AUSSIEHT, steht im großen Abschnitt „DIE KARTE"
   weiter unten: Relief mit Tonstufen-Nebel, übernommen aus
   showroom.html (Sönke, 08.09.2026).

   ── Die Schiffe ───────────────────────────────────────────────
   Ein Landeplatz ist ein FELD, das Schiff davor ist keines. Es
   liegt im Wasser neben seinem Landeplatz und fährt beim Bau der
   Karte von draußen heran — also genau dann, wenn der Countdown
   läuft. Von dort führt eine Planke auf die Insel: von hier aus
   wird genommen. Der Server weiß von alldem nichts; er kennt nur
   `is_home`, und wo das Meer liegt, rechnet buildMap selbst aus.

   ── Die Bilder der Völker ─────────────────────────────────────
   Zwei Ordner, zwei Sorten Bild:
     · Einheit und Gruppenbild sind ⚠️ VORLÄUFIG aus
       tools/clash-of-math/sprites/ geliehen (TEAMS[].img/.team).
     · Die SCHIFFE liegen schon hier: tools/wordisland/sprites/
       (TEAMS[].ship). Sönke liefert eigene nach — dann ändert sich
       genau diese eine Spalte und sonst nichts.
   Der Pfad ist absichtlich der volle ab MPSkills/: ein in tool.js
   gebautes <img>/<image> löst relativ zur SEITE auf (j.html,
   lehrer.html), nicht relativ zu dieser Datei.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Die Völker ────────────────────────────────────────────
     Index = VOLK (nicht Slot), in allen Listen dieselbe
     Reihenfolge. Namen und Bilder kommen aus Kingdoms; die Farben
     sind dieselben wie dort, damit ein Kind, das beide Spiele
     kennt, sich nicht umgewöhnen muss.

     `img` ist die Einheit (Kopfzeile, Karte, Ergebnis), `team` das
     Gruppenbild mit Burg — es steht nur in der Lobby, wo Platz für
     ein Porträt ist. `ship` ist das Schiff auf der Karte.

     Die Dateinamen sind so, wie sie im Ordner stehen, samt Umlaut,
     samt großem S in „Schiff.png" und samt Tippfehler („yello
     Team.png"). Sie hier zu korrigieren hieße, auf Dateien zu
     zeigen, die es nicht gibt — und ein fehlendes <image> zeichnet
     in SVG stillschweigend NICHTS. Beim ersten Anlauf im Showroom
     lag die Karte deshalb einfach ohne Schiffe da. Der Prüfstand
     schlägt darauf an (uitest.js prüft, ob die DATEI liegt), das
     Auge erst beim Suchen.

     Die Schiffe sind seit dem 08.09.2026 Sönkes eigene: freigestellte
     RGBA-PNG statt der geliehenen JPG auf weißem Grund. ⚠️ Deshalb
     laufen sie NICHT mehr durch den Freistell-Filter — der schneidet
     nach Helligkeit, und die hellsten Stellen eines Schiffes sind
     seine Segel.                                                 */
  const ASSET_DIR = 'tools/clash-of-math/sprites/';
  const SHIP_DIR = 'tools/wordisland/sprites/';
  const TEAMS = [
    { name: 'Toast-Ritter',      color: '#ef4444', img: 'red ToastKnights.png',       team: 'red Team.png',     ship: 'red Schiff.png' },
    { name: 'Robo-Enten',        color: '#3b82f6', img: 'blue roboDucks.png',         team: 'blue Team.png',    ship: 'blue Schiff.png' },
    { name: 'Brokkoli-Giraffen', color: '#10b981', img: 'green BrokkoliGiraffen.png', team: 'green Team.png',   ship: 'green Schiff.png' },
    { name: 'Mal-Hasen',         color: '#f59e0b', img: 'yellow PainingBunnies.png',  team: 'yello Team.png',   ship: 'yellow Schiff.png' },
    { name: 'Kosmische Katzen',  color: '#a855f7', img: 'lila cosmicCat.png',         team: 'lila Team.png',    ship: 'lila Schiff.png' },
    { name: 'Okto-Pferdchen',    color: '#06b6d4', img: 'türkis OctoPferdchen.png',   team: 'türkis Team.png',  ship: 'türkis Schiff.png' },
    /* Die beiden letzten (Sönke, 09.09.2026): „ich hätte gerne 8
       Völker". Sie kommen ans ENDE und nirgends dazwischen — die
       Nummer ist die Kennung des Volkes und steht in laufenden
       Räumen in `wi_boards.factions`. Wer hier einschiebt, färbt
       jedes bestehende Spiel um.
       „margenta" ist der Dateiname im Ordner, nicht mein Tippfehler. */
    { name: 'Wolken-Piraten',    color: '#f472b6', img: 'rosa CloudBirdPiraten.png',  team: 'rosa Team.png',    ship: 'rosa Schiff.png' },
    { name: 'Spuk-Einhorn',      color: '#d946ef', img: 'margenta SpookieUnicorn.png', team: 'magenta Team.png', ship: 'magenta Schiff.png' }
  ];
  const TEAM_COUNT = TEAMS.length;
  const esrc = name => encodeURI(ASSET_DIR + name);
  const shipSrc = f => (TEAMS[f] && TEAMS[f].ship) ? encodeURI(SHIP_DIR + TEAMS[f].ship) : '';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const POLL_MS = { participant: 4000, presenter: 3000 };

  /* Eine Serie ab drei — dieselbe Zahl steht im Server
     (wi_answer). Hier nur für den Text „noch 2 bis zur freien
     Wahl"; entschieden wird es dort. */
  const STREAK_GOAL = 3;

  /* Die Spieldauer als Reihe statt als Auswahlfeld (Kingdoms-Muster:
     .cm-levelrow). Vier Knöpfe nebeneinander und EIN Satz darunter,
     der die gewählte erklärt. */
  const DURATIONS = [300, 600, 900, 1200];

  let root = null, ctx = null, role = null;
  let destroyed = false, busy = false, pollTimer = null;
  let view = null;          // letzte Antwort des Servers
  let mapKey = null;        // welche Insel gerade gezeichnet ist
  let cells = [];           // [[r,c,ruin,home], …] in der Reihenfolge von `own`
  let cellEls = [];         // die Polygone dazu, gleiche Reihenfolge
  let ships = {};           // Index des Landeplatzes → { g, img } des Schiffs
  let ownPainted = null;    // zuletzt gemalte Besitz-Zeichenkette
  let els = {};
  let sets = { list: [], chosen: [] };
  let setsBusy = 0;         // wie pickBusy: eigener Klick schlägt Server-Antwort
  let tab = 'units';
  let setsOpen = false;
  let submitting = false;
  let timerHandle = null;
  let onResize = null;
  let picking = false;      // Tablet: wartet auf einen Fingertipp aufs Feld
  let practice = false;     // Tablet: üben statt warten
  let lastPhase = null;

  /* ─── Slot → Volk (Migration 0133) ──────────────────────────
     `factions` ist die Übersetzungstabelle des Servers:
     factions[slot] = Volk. Der Rückfall auf den Slot ist der Zustand
     VOR 0133 (Volk = Slot) — er greift, solange die Migration nicht
     eingespielt ist, und macht dann genau das Alte.

     AB HIER nimmt jede Anzeigefunktion einen SLOT entgegen. Wer
     TEAMS direkt indiziert, muss vorher durch facOf() — die einzige
     Ausnahme ist die Wappenreihe der Lobby, die von Natur aus über
     Völker läuft und nicht über Slots. */
  let factions = [0, 1, 2, 3];
  const facOf = s => (factions[s] != null ? factions[s] : s);
  // Lobby-Auswahl der Lehrkraft (VÖLKER, nicht Slots) und ein Zähler
  // laufender Speicher-Aufrufe: solange der über 0 steht, hat die
  // Anzeige Vorrang vor einer Server-Antwort von vorhin.
  let pickSel = [], pickBusy = 0;

  const esc = s => (ctx ? ctx.esc(s) : String(s == null ? '' : s));
  const teamOf = s => TEAMS[facOf(s)] ||
    { name: 'Volk ' + (s + 1), color: '#888', img: '', team: '' };

  /* ══════════════════════════════════════════════════════════
     DAS ANTWORTFELD
     ══════════════════════════════════════════════════════════
     Es ist bewusst KEIN <input>, und der Grund liegt nicht im
     Aussehen, sondern über der Tastatur: Chrome auf Android legt
     über jedes fokussierte FORMULARFELD seine Ausfüll-Leiste —
     Passkey, Karte, Standort. Sie ist nicht abschaltbar;
     `autocomplete="off"` ignoriert Chrome für diese Leiste seit
     Jahren. Auf einem Telefon frisst sie eine Zeile genau dort, wo
     der Kasten ohnehin am engsten ist, und sie bietet einem Kind
     beim Vokabelüben Kreditkarten an (Sönke, 11.09.2026: „das
     brauche ich hier wirklich nicht").

     Ein `contenteditable` ist für die Ausfüllhilfe kein Feld: es
     gibt nichts, was sie auszufüllen hätte, und die Leiste bleibt
     weg. Bezahlt wird das mit den vier Dingen, die ein <input> von
     selbst mitbringt und die hier von Hand nachkommen:

       Wert         `textContent` statt `value` (feldWert/feldLeer)
       Platzhalter  ein ::before auf dem leeren Feld (tool.css)
       Enter        kein Formular, das absendet — keydown/beforeinput
       Sperre       eine Klasse statt `disabled`

     Die Sperre ist dabei kein Ersatz aus Verlegenheit, sondern die
     bessere Lösung: `disabled` nimmt dem Feld den Fokus, und auf
     dem Handy fährt damit zwischen zwei Fragen jedes Mal die
     Tastatur ein und wieder aus. Der Kasten wird bei jedem Wechsel
     zweimal neu vermessen (--vv-h), und das sah man. Die Klasse
     lässt den Fokus stehen; getippt wird trotzdem nichts, weil
     `beforeinput` abgewiesen wird.                                */
  const feldWert = el => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  const feldLeer = el => { if (el) el.innerHTML = ''; };
  const feldOffen = el => !!el && !el.classList.contains('is-locked');
  const feldZu = (el, an) => { if (el) el.classList.toggle('is-locked', !!an); };
  /* Nur holen, wenn es nicht schon steht: ein `focus()` auf ein
     Feld, in dem der Finger gerade tippt, setzt den Cursor an den
     Anfang. */
  const feldHer = el => { if (el && el.ownerDocument.activeElement !== el) el.focus(); };

  /* Verdrahtet ein Feld mit seinem Absenden. `senden` bekommt den
     fertigen Wert; ist das Feld leer oder gesperrt, passiert nichts. */
  function feldBauen(el, senden) {
    if (!el) return;
    /* `plaintext-only` hält Zeilenumbrüche und eingefügte
       Formatierung draußen. Ältere Browser kennen den Wert nicht —
       dort wirft die Zuweisung oder sie bleibt einfach nicht stehen,
       und `true` plus eigener Einfüge-Weg tut dasselbe von Hand.
       Der Rückfall MUSS sein: ein ungültiger Wert bedeutet „nicht
       editierbar", und dann steht das Kind vor einem Feld, in das
       es nicht tippen kann. */
    try { el.contentEditable = 'plaintext-only'; } catch (e) { /* gleich unten */ }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';

    const los = () => {
      if (!feldOffen(el)) return;
      const v = feldWert(el);
      if (v) senden(v);
    };

    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      los();
    });
    el.addEventListener('beforeinput', e => {
      /* Gesperrt heißt gesperrt — auch für die Tastatur, die noch
         steht. */
      if (!feldOffen(el)) { e.preventDefault(); return; }
      /* Zweiter Weg zum Absenden: manche Bildschirmtastaturen
         schicken für ihre Senden-Taste kein keydown, sondern nur
         diesen Eingabetyp. Doppelt abgeschickt wird deshalb nichts —
         wo keydown zuerst kommt, verhindert es die Eingabe, und
         damit auch dieses Ereignis. */
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        e.preventDefault();
        los();
      }
    });
    el.addEventListener('input', () => {
      /* Ein leergetipptes contenteditable behält im Browser ein
         <br>. Ohne diese Zeile ist es nicht mehr `:empty` — und der
         Platzhalter käme nach dem ersten Buchstaben nie wieder. */
      if (!el.textContent.trim() && el.innerHTML) el.innerHTML = '';
    });
    el.addEventListener('paste', e => {
      if (el.contentEditable === 'plaintext-only') return;   // macht der Browser
      e.preventDefault();
      const t = ((e.clipboardData || window.clipboardData || {}).getData('text') || '')
        .replace(/\s+/g, ' ');
      try { el.ownerDocument.execCommand('insertText', false, t); } catch (err) { /* egal */ }
    });
  }

  /* Der Knopf neben dem Feld. `mousedown` abzuweisen ist der ganze
     Trick: sonst nimmt der Knopf beim Antippen den Fokus, das Feld
     verliert ihn, und auf dem Handy fährt die Tastatur ein — für
     einen Klick, nach dem sofort die nächste Frage kommt. */
  function feldKnopf(btn, el, senden) {
    if (!btn) return;
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      if (!feldOffen(el)) return;
      const v = feldWert(el);
      if (v) senden(v);
    });
  }

  /* ══════════════════════════════════════════════════════════
     DIE KARTE
     ══════════════════════════════════════════════════════════
     Sönke, 08.09.2026, nach drei Runden Showroom: „wir nehmen
     relief mit tonstufen nebel". Das hier ist die Übernahme aus
     `showroom.html` — von fünf Kartenvarianten und fünf Nebelarten
     bleibt genau eine Paarung übrig, und alles, was nur zum
     Vergleichen da war, ist raus (Bänder, Verläufe, Schleier,
     Sturmfront, die Regler).

     Der Showroom bleibt trotzdem stehen. Er ist der Ort, an dem
     eine Gestaltungsfrage entschieden wird, ohne dafür das Spiel
     anzufassen; hier steht nur noch das Ergebnis.

     ── Was das Relief ausmacht ───────────────────────────────
     Jedes Feld ist ein flaches Prisma mit einer Höhe: Strand
     niedrig, Landesinneres höher, Fels am höchsten — die Insel
     fällt zum Wasser hin ab. Unter Wasser geht das Gefälle als
     Stufen weiter: vier Tiefenlinien, jede mit einer eigenen
     Kante, dahinter einfarbig tiefes Wasser. Verhülltes Land liegt
     flach, erobertes steht auf. Damit ist „erobert" eine Bewegung
     und nicht nur eine Farbe.

     ── Was die Tonstufen ausmachen ───────────────────────────
     Der Nebel deckt im Kern ganz und wird erst an den äußeren zwei
     Feldern durchsichtig — in zwei festen Stufen, ohne Verlauf.
     Was tief im Nebel liegt, bleibt unbekannt; was gleich an der
     Reihe ist, schimmert schon durch. Der Rand ist damit keine
     Grenze, sondern eine Ankündigung, und er wandert mit.

     ── Woher die Daten kommen ────────────────────────────────
     Der Showroom hat sich seine Insel selbst gewürfelt und den
     Fortschritt aus einem Regler gezogen. Hier kommt beides vom
     Server: die Felder als `map` ([r, c, ruin, home]) und je Takt
     eine Zeichenkette `own` mit EINEM Zeichen je Feld ('.' =
     Nebel, '0'..'5' = Slot). Was der Server NICHT schickt und was
     deshalb hier gerechnet wird:

       rand   Abstand zum Wasser (Breitensuche von der Küste) —
              daraus die Höhe der Säule und der Strand.
       boden  Sand, Wiese, Wald, Fels aus zwei überlagerten
              Sinusfeldern. Deren Phasen hängen am `map_key`:
              gleiche Runde, gleiches Gelände auf jedem Gerät —
              und trotzdem jede Runde eine andere Insel.
       Mitte  Der Server rechnet in seinen eigenen Koordinaten und
              nicht um den Nullpunkt. Alles, was „nach außen"
              braucht (Brandung, Schiffsrichtung, Fels in der
              Inselmitte), rechnet deshalb gegen den Schwerpunkt
              der Felder und nicht gegen 0,0.

     ── Warum eigene Filter-Nummern je Aufbau ─────────────────
     Die Filter liegen IM Karten-SVG und nicht im Dokument: so
     verschwinden sie mit der Karte, wenn eine neue Runde beginnt.
     Ihre Nummern tragen einen Zähler, damit zwei Karten, die sich
     kurz überlappen (Neuaufbau bei laufender Runde), sich nicht
     gegenseitig die Filter wegdefinieren.                       */

  const SQ3 = Math.sqrt(3);
  const n2 = v => Math.round(v * 100) / 100;

  /* Spitze oben, versetzte Reihen — dieselbe Geometrie wie im
     Server (wi_is_neighbor): waagerechter Abstand 1, senkrechter
     0.866, ungerade Zeilen um eine halbe Breite nach rechts. */
  const HEX = Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (30 + 60 * k);
    return [Math.cos(a) / SQ3, Math.sin(a) / SQ3];
  });
  /* Der Reihenabstand steht als eigene Konstante da und nicht als
     Zahl in cy(): der Insel-Würfel der Solo-Rolle rechnet ihn auch
     RÜCKWÄRTS (Weltpunkt → Reihe), und zwei Stellen mit derselben
     Zahl wären zwei Gitter. */
  const ROWH = 0.8660254;
  const cx = (r, c) => c + 0.5 * (((r % 2) + 2) % 2);
  const cy = r => r * ROWH;

  /* Nachbar-Nummer → Kanten-Nummer. Kante e liegt zwischen Ecke e
     und Ecke e+1. Falsch übersetzt umrandet man die falsche
     Kachelseite — und das sieht aus wie ein Fehler in den Daten. */
  const EDGE = [3, 4, 2, 5, 1, 0];

  /* Die sechs Nachbarn eines Feldes — dieselbe Versetzung wie im
     Server (wi_neighbors). */
  function neighbors(r, c) {
    const odd = (((r % 2) + 2) % 2) === 1;
    const d = odd ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
                  : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    return d.map(([dr, dc]) => [r + dr, c + dc]);
  }

  function hexPath(x, y, s) {
    let d = '';
    for (let i = 0; i < 6; i++) {
      d += (i ? 'L' : 'M') + n2(x + HEX[i][0] * s) + ' ' + n2(y + HEX[i][1] * s);
    }
    return d + 'Z';
  }
  function union(cs, gap) {
    let d = '';
    for (const z of cs) d += hexPath(z.x, z.y, gap);
    return d;
  }

  /* `null` heißt „dieses Merkmal nicht setzen" und nicht „setz es
     auf die Zeichenkette null". Der Unterschied ist hier kein
     Schönheitsfehler: filter="null" zeigt auf einen Filter, den es
     nicht gibt, und ein Element mit ungültiger Filterangabe wird
     GAR NICHT gezeichnet — die halbe Karte wäre weg. */
  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined) continue;
      n.setAttribute(k, v);
    }
    if (parent) parent.appendChild(n);
    return n;
  }
  function img(parent, href, attrs) {
    const n = el('image', attrs, parent);
    n.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    n.setAttribute('href', href);
    return n;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  /* Aus dem `map_key` eine Zahl. Gebraucht für das Gelände: gleiche
     Runde → gleiche Wälder, auf jedem Tablet und am Beamer. */
  function hashKey(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) || 1;
  }

  /* Farbe mischen und abdunkeln. Beides wird gebraucht, weil die
     Volksfarbe die Bodenfarbe EINFÄRBT statt sie zu überdecken —
     sonst wäre die ganze Insel-Struktur unter sechs Farbeimern
     weg. */
  function hx(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  const rgb = a => '#' + a.map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function mix(a, b, t) { const A = hx(a), B = hx(b); return rgb([0, 1, 2].map(i => A[i] + (B[i] - A[i]) * t)); }
  function shade(h, amt) { return rgb(hx(h).map(c => c * (1 + amt))); }

  /* ─── Die Palette ───────────────────────────────────────────
     Der Eintrag „Relief" aus dem Showroom, unverändert. Er steht
     als EIN Block hier und nicht verteilt in tool.css, weil die
     halbe Karte gemischte Farben braucht (Bodenfarbe × Volksfarbe,
     abgedunkelte Seitenflächen) — und Mischrechnung gehört dorthin,
     wo die Ausgangsfarben stehen.

     `ink` ist die Farbe der Stufenkante im Wasser — nicht Schwarz,
     sondern das dunkelste Blau: eine schwarze Kante im Meer liest
     sich als Riss, eine dunkelblaue als Schatten. Die vier
     Wassertöne liegen dicht beieinander; weiter auseinander wird
     aus dem Saum ein leuchtender Ring, der die Insel erschlägt. */
  const KARTE = {
    sea: {
      ink: '#02141f', deep: '#052131', deep2: '#083247', mid: '#0d4c64',
      shallow: '#176c82', shallow2: '#4096a4', foam: '#dff4fa', wob: .30
    },
    land: { sand: '#e3cf9c', gras: '#7fae5c', wald: '#4a8449', fels: '#9aa6ac' },
    fog: { body: '#e4eef5', puffL: '#ffffff', puffD: '#a3bacb', shadow: '#08283a', shadowOp: .38 },
    gold: '#ffbe2e', signInk: '#22323b',
    mix: .5
  };

  /* Wie weit die MITTE eines Schiffes vor der Mitte seines
     Landeplatzes liegt. Steht hier und nicht zweimal im Text: der
     Bildausschnitt muss die Schiffsplätze mitfassen, sonst säbelt er
     die Masten ab. */
  const SHIPD = 2.0;

  /* ─── Die besonderen Orte ───────────────────────────────────
     Ein Ort ist ein PLATZ, kein Bild: Sockel, Schatten und Größe
     gehören der Karte, das Bild darin ist austauschbar. Sobald
     `img` auf eine Datei zeigt, sitzt das Sprite im Platz und das
     gezeichnete Zeichen verschwindet — ohne dass sonst irgendetwas
     anzufassen wäre. Der Pfad ist der volle ab MPSkills/, weil ein
     hier gebautes <image> relativ zur SEITE auflöst.

     `hoch` ist das Verhältnis von Bildhöhe zur Sockelbreite: ein
     Leuchtfeuer ist schlank und hoch, eine Ruine breit und flach.
     `gross` ist die Übergröße — die Orte stehen absichtlich größer
     als eine Kachel da, sonst sind sie am Beamer nicht zu finden. */
  const PLACES = {
    1: { name: 'Leuchtfeuer', img: null, gross: 1.20, hoch: 1.55 },
    2: { name: 'Ruine',       img: null, gross: 1.45, hoch: 1.30 },
    3: { name: 'Tempel',      img: null, gross: 1.85, hoch: 1.40 }
  };
  /* Die Platzhalter-Zeichen, solange keine Sprites da sind. Nicht
     drei Größen desselben Punktes: ein Kind soll aus zehn Metern
     sehen, WAS dort steht, nicht nur DASS dort etwas steht. */
  const MARK = {
    1: 'M0 -.30 C .17 -.12 .21 .04 .09 .16 C .07 .04 .02 .01 -.03 .16 C -.18 .02 -.11 -.14 0 -.30 Z',
    2: 'M-.30 .22 L-.30 -.12 L-.16 -.18 L-.16 .22 Z M .04 .22 L .04 -.24 L .20 -.30 L .20 .22 Z '
     + 'M-.30 -.12 L-.16 -.18 L-.16 -.06 L-.30 -.02 Z',
    3: 'M-.36 .24 L .36 .24 L .36 .14 L-.36 .14 Z M-.26 .14 L-.26 -.06 L-.16 -.06 L-.16 .14 Z '
     + 'M-.05 .14 L-.05 -.06 L .05 -.06 L .05 .14 Z M .16 .14 L .16 -.06 L .26 -.06 L .26 .14 Z '
     + 'M-.34 -.06 L0 -.30 L .34 -.06 Z'
  };

  /* ─── Die Filter-Werkstatt ──────────────────────────────────
     ⚠️ Bei ALLEN: die Werte rechnen in BENUTZEREINHEITEN, und eine
     Einheit ist hier eine Kachel. stdDeviation="3" wäre kein
     Weichzeichner, sondern ein Nebel über der halben Insel.

     Nur die acht, die Relief + Tonstufen wirklich braucht. Im
     Showroom liegen mehr; die gehören zu den Varianten, die wir
     nicht genommen haben. */
  let FID = 'wi_';
  const F = n => 'url(#' + FID + n + ')';

  function buildDefs(svg) {
    const defs = el('defs', {}, svg);
    const filt = (id, attrs, kinder) => {
      const f = el('filter', Object.assign({
        id: FID + id, 'color-interpolation-filters': 'sRGB'
      }, attrs), defs);
      kinder(f);
      return f;
    };

    /* Hier stand ein Freistell-Filter („Weiß raus"). Er ist raus,
       seit Sönkes eigene Schiffe da sind: die sind freigestellte
       RGBA-PNG, und der Filter schneidet nach HELLIGKEIT — die
       hellsten Stellen eines Schiffes sind seine Segel, die wären
       als Erstes weg gewesen.

       Falls je wieder ein JPG auf weißem Grund einziehen sollte:
       der Filter steht noch in showroom.html (#wiCut), samt der
       Begründung, warum der naheliegende Weg (feColorMatrix
       luminanceToAlpha direkt auf das Bild) einen SCHWARZEN Kasten
       liefert und nicht ein freigestelltes Schiff. Nachgemessen in
       tools/cuttest.html. */

    /* Die Wolke: verzerren und weichzeichnen. Erst beides zusammen
       macht aus einer Fläche einen Ballen. Mit weniger Auslenkung
       überleben die 120-Grad-Ecken der Sechsecke den Filter, und
       man sieht dem Nebel an, dass er aus Kacheln besteht. 0.9 ist
       knapp eine Kachel — mehr wäre schön und würde anfangen zu
       lügen, welches Feld noch verdeckt ist. */
    const wolke = (id, blur) => filt(id, { x: '-18%', y: '-18%', width: '136%', height: '136%' }, f => {
      el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.13 0.17', numOctaves: 4, seed: 4, result: 'n' }, f);
      el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '0.90', xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' }, f);
      el('feGaussianBlur', { in: 'd', stdDeviation: blur }, f);
    });
    wolke('cloud', '0.15');
    /* Der Schatten der Wolke: dieselbe Verzerrung, damit er unter
       DIESE Wolke passt, nur weicher. */
    wolke('cloudsh', '0.30');

    /* Die drei Rauschlagen im Nebel. Der Grund, warum die erste
       Fassung wie ein Haufen Kugeln aussah: sie WAR ein Haufen
       Kugeln. Nebel hat keine Ballen, er hat Schlieren — und die
       macht kein Kreis, sondern Rauschen, das QUER gröber ist als
       LÄNGS.

       Die Turbulenz erzeugt hier nur eine MASKE; die Farbe kommt
       vom Rechteck darunter. Sonst wäre der Nebel immer weiß, egal
       welche Palette darunter liegt.

       Die dritte Lage (`fogc`, sehr grob, Wellenlänge um fünfzehn
       Kacheln) ist die gegen die Gleichförmigkeit: sie macht keine
       Schlieren, sondern Ballungen — hier steht der Nebel dicht,
       zwei Kacheln weiter reißt er auf. */
    const rausch = (id, freq, oct, seed, tab) =>
      filt(id, { x: '0%', y: '0%', width: '100%', height: '100%' }, f => {
        el('feTurbulence', { type: 'fractalNoise', baseFrequency: freq, numOctaves: oct, seed, stitchTiles: 'stitch', result: 't' }, f);
        el('feColorMatrix', { in: 't', type: 'luminanceToAlpha', result: 'a' }, f);
        const ct = el('feComponentTransfer', { in: 'a', result: 'm' }, f);
        el('feFuncA', { type: 'table', tableValues: tab }, ct);
        el('feComposite', { in: 'SourceGraphic', in2: 'm', operator: 'in' }, f);
      });
    rausch('foga', '0.19 0.30', 4, 12, '0 0 .18 .62 1');
    rausch('fogb', '0.38 0.10', 3, 27, '0 0 0 .45 1');
    rausch('fogc', '0.052 0.07', 2, 44, '0 0 .15 .95 1');

    const blur = (id, sd, m) => filt(id, { x: m, y: m, width: (100 - 2 * parseFloat(m)) + '%', height: (100 - 2 * parseFloat(m)) + '%' }, f => {
      el('feGaussianBlur', { stdDeviation: sd }, f);
    });
    blur('b1', '0.10', '-30%');
    blur('b2', '0.22', '-30%');
  }

  /* ─── Aus der Feldliste eine Insel ──────────────────────────
     Alles, was der Server nicht schickt, aber jede Schicht braucht.
     Einmal je Runde, nicht je Takt. */
  function inselDaten(list, key) {
    const cells = [];
    const idx = new Map();
    list.forEach(([r, c, ruin, home], i) => {
      idx.set(r + ',' + c, i);
      cells.push({
        i, r, c, x: cx(r, c), y: cy(r),
        ruin: ruin | 0, home: !!home, rand: 1e9, boden: 'gras'
      });
    });
    const at = (r, c) => idx.has(r + ',' + c) ? cells[idx.get(r + ',' + c)] : null;

    /* Der Schwerpunkt. Der Server rechnet in seinen Koordinaten,
       nicht um den Nullpunkt — und „nach außen" ohne Mitte ist
       geraten. */
    let sx = 0, sy = 0;
    for (const z of cells) { sx += z.x; sy += z.y; }
    const ctr = { x: sx / cells.length, y: sy / cells.length };
    let R = 0;
    for (const z of cells) R = Math.max(R, Math.hypot(z.x - ctr.x, z.y - ctr.y));
    R = R || 1;

    /* Wie weit ist ein Feld vom Wasser entfernt? Breitensuche vom
       Rand nach innen. 1 = Küstenfeld. Daraus kommt die Höhe der
       Säule und damit das Gefälle zur Küste. */
    let f = cells.filter(z => neighbors(z.r, z.c).some(([nr, nc]) => !idx.has(nr + ',' + nc)));
    f.forEach(z => { z.rand = 1; });
    while (f.length) {
      const next = [];
      for (const z of f) for (const [nr, nc] of neighbors(z.r, z.c)) {
        const n = at(nr, nc);
        if (n && n.rand > z.rand + 1) { n.rand = z.rand + 1; next.push(n); }
      }
      f = next;
    }

    /* Der Boden. Zwei überlagerte Sinusfelder statt Würfeln: Wald
       soll in Stücken stehen und nicht als Konfetti über die Insel
       gestreut sein. Der Strand ergibt sich AUS `rand` und wird
       nicht hingemalt — deshalb liegt er zwangsläufig am Rand. */
    const rnd = mulberry32(hashKey(String(key || 'wi')));
    const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    for (const z of cells) {
      const dx = z.x - ctr.x, dy = z.y - ctr.y;
      const d = Math.hypot(dx, dy);
      const n1 = (Math.sin(dx * .62 + ph[0]) + Math.sin(dy * .71 + ph[1]) + Math.sin((dx + dy) * .43 + ph[2])) / 3;
      const n2v = (Math.sin(dx * .31 - ph[3]) + Math.cos(dy * .38 + ph[0])) / 2;
      z.boden = z.rand <= 1 ? 'sand'
              : (z.rand === 2 && n1 > .05) ? 'sand'
              : (d < R * .55 && n2v < -.28) ? 'fels'
              : n1 > .34 ? 'wald'
              : 'gras';
      /* Wie hoch die Säule dieses Feldes steht, wenn es AUFSTEHT.
         Der Strand bleibt niedriger als das Landesinnere — dadurch
         fällt die Insel zum Wasser hin ab, statt als Platte im Meer
         zu schwimmen.

         Steht hier und nicht mehr in reliefLand, seit die Tiere sie
         auch brauchen: ein Tier, das die Geländehöhe nicht mitnimmt,
         steckt im Fels bis zum Bauch. Zwei Formeln dafür wären zwei
         Gelände. */
      z.hoch = z.boden === 'sand' ? .20 : z.boden === 'fels' ? .78 : z.rand === 2 ? .40 : .56;
    }

    /* Auf welcher Seite eines Landeplatzes liegt das Meer? Die
       Summe der Wege zu allen Nachbarn, die kein Land sind
       (Landeplätze sind laut wi_build_island immer Küstenfelder,
       also gibt es mindestens einen). Fällt das aus, zeigt der Weg
       von der Inselmitte nach außen — auch der endet im Wasser. */
    const homes = cells.filter(z => z.home);
    for (const h of homes) {
      let dx = 0, dy = 0;
      for (const [nr, nc] of neighbors(h.r, h.c)) {
        if (idx.has(nr + ',' + nc)) continue;
        dx += cx(nr, nc) - h.x; dy += cy(nr) - h.y;
      }
      if (Math.hypot(dx, dy) < 0.01) { dx = h.x - ctr.x; dy = h.y - ctr.y; }
      const L = Math.hypot(dx, dy) || 1;
      h.sx = dx / L; h.sy = dy / L;
    }

    return { cells, idx, at, homes, ctr, R };
  }

  /* ─── Die Küstenlinie als geschlossener Zug ─────────────────
     Sie wird gebraucht, weil ein Strich auf der Vereinigung nicht
     das tut, wonach es aussieht: eine Vereinigung ist ein Pfad aus
     dreihundert einzelnen Sechsecken. Gefüllt ergibt das eine
     Fläche, aber ein STRICH umrandet jedes Sechseck einzeln — die
     bekannte Bienenwabe.

     Also: alle Kanten sammeln, an denen Land ans Wasser stößt, und
     zu Ringen zusammenhängen. Herauskommen PUNKTE und kein Pfad —
     das Wasser stapelt seine Tiefenstufen darauf, die Brandung
     setzt ihre Wellen darauf ab, und beide brauchen die Stellen
     und nicht die Zeichenkette. */
  function coastRings(isl, gap) {
    /* Die Ecken auf HUNDERTSTEL runden, nicht feiner. Zwei Kanten,
       die von verschiedenen Feldern aus gerechnet wurden, treffen
       sonst nicht denselben Schlüssel — und die Kette reißt. Als
       Strich sähe man den Fehler nicht (jedes Stück wird ja
       gezeichnet), als FLÄCHE wäre die Insel weg. */
    const K = (x, y) => Math.round(x * 100) + ',' + Math.round(y * 100);
    const von = new Map();
    const alle = [];
    for (const z of isl.cells) {
      const nb = neighbors(z.r, z.c);
      for (let i = 0; i < 6; i++) {
        if (isl.at(nb[i][0], nb[i][1])) continue;
        const e = EDGE[i], a = HEX[e], b = HEX[(e + 1) % 6];
        const s = {
          ax: z.x + a[0] * gap, ay: z.y + a[1] * gap,
          bx: z.x + b[0] * gap, by: z.y + b[1] * gap, used: false
        };
        alle.push(s);
        const k = K(s.ax, s.ay);
        if (!von.has(k)) von.set(k, []);
        von.get(k).push(s);
      }
    }
    const ringe = [];
    for (const s0 of alle) {
      if (s0.used) continue;
      let s = s0; s.used = true;
      const pts = [[s.ax, s.ay]];
      for (let guard = 0; guard < 20000; guard++) {
        pts.push([s.bx, s.by]);
        const next = (von.get(K(s.bx, s.by)) || []).find(t => !t.used);
        if (!next) break;
        next.used = true; s = next;
      }
      /* Der letzte Punkt IST der erste — die Ringe kommen ohne
         Doppelpunkt heraus, sonst muss jeder, der sie benutzt,
         daran denken. */
      if (pts.length > 4) ringe.push(pts.slice(0, -1));
    }
    return ringe;
  }

  /* Auslenkung des Küstenzugs. Gebraucht wird sie im Relief nur für
     die WASSERSTUFEN: die sind mehrere Kopien desselben Zuges, und
     mit derselben Auslenkung liefen sie exakt parallel — das sähe
     aus wie der Rand eines Aufklebers. Mit verschobener Phase
     kriecht jede Tiefenlinie anders um die Insel. */
  const wOX = (x, y, ph) => Math.sin(x * 1.31 + y * .77 + ph) * .62 + Math.sin(x * .53 - y * 1.11 + ph * 1.7) * .38;
  const wOY = (x, y, ph) => Math.cos(x * .91 - y * 1.23 + ph) * .62 + Math.cos(x * 1.43 + y * .61 + ph * 1.7) * .38;

  function warpRing(pts, wob, ph) {
    if (!wob) return pts;
    return pts.map(([x, y]) => [x + wob * wOX(x, y, ph || 0), y + wob * wOY(x, y, ph || 0)]);
  }

  function ringsPath(ringe, wob, smooth, ph) {
    let d = '';
    for (const pts0 of ringe) {
      const pts = warpRing(pts0, wob, ph);
      const n = pts.length;
      if (!smooth) {
        d += 'M' + pts.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L') + 'Z';
        continue;
      }
      /* Der Weg läuft durch die KANTENMITTEN und zieht die Ecken
         nur an — dadurch verschwinden die 120-Grad-Ecken von
         allein. */
      const mid = i => [(pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2];
      let m = mid(0);
      d += `M${n2(m[0])} ${n2(m[1])}`;
      for (let i = 1; i <= n; i++) {
        const p = pts[i % n], q = mid(i % n);
        d += `Q${n2(p[0])} ${n2(p[1])} ${n2(q[0])} ${n2(q[1])}`;
      }
      d += 'Z';
    }
    return d;
  }

  /* ══════════════════════════════════════════════════════════
     Das Meer
     ══════════════════════════════════════════════════════════
     Was Wasser zu Wasser macht, ist nicht die Farbe, sondern der
     ÜBERGANG: flach an der Küste, tief draußen, Brandung
     dazwischen. Im Relief ist der Meeresgrund dasselbe Bauteil wie
     die Insel darüber — gestapelte Platten. Das Relief hört damit
     nicht am Strand auf.

     Eine Stufe ist EIN Strich auf dem Küstenzug mit der doppelten
     Breite ihres Abstands: die innere Hälfte verschwindet unter der
     Insel, sichtbar bleibt ein Saum, der außen genau beim Abstand
     endet. Reihenfolge: von tief nach flach, breit nach schmal.

     Wie laut das Ganze ist, steckt in der Breite der Kante hier
     unten, ihrer Deckung, und dem Abstand der vier Wasserfarben in
     KARTE.sea. Sönkes Vorgabe nach der ersten Showroom-Runde:
     leiser.

     [Abstand von der Küste, Farbe, Breite der Kante]            */
  const SHELF = [[2.55, 'deep2', .24], [1.66, 'mid', .20], [1.00, 'shallow', .17], [.46, 'shallow2', .14]];

  function seaLayer(svg, isl, vb, dCoast, rings, opt) {
    const g = el('g', { class: 'wi-sea' }, svg);
    const M = 9;
    const box = { x: n2(vb[0] - M), y: n2(vb[1] - M), width: n2(vb[2] + 2 * M), height: n2(vb[3] + 2 * M) };
    el('rect', Object.assign({ fill: KARTE.sea.deep }, box), g);

    SHELF.forEach(([off, key, shw], i) => {
      /* Jede Stufe mit eigener Phase und nach außen hin stärker
         ausgelenkt: die tiefste Linie ist die krummste. */
      const amp = KARTE.sea.wob * (1 + (SHELF.length - 1 - i) * .22);
      const d = ringsPath(rings, amp, true, 1.7 + i * 2.3);
      /* Die Kante in zwei Lagen: außen breit und blass, innen
         schmal und dunkel. Zusammen ist das ein Schattenverlauf
         ohne einen einzigen Weichzeichner — und Weichzeichner sind
         genau das, was diese Kante kaputt machen würde. */
      el('path', { d, fill: 'none', stroke: KARTE.sea.ink, 'stroke-width': n2(2 * off + 2 * shw), 'stroke-linejoin': 'round', opacity: .13 }, g);
      el('path', { d, fill: 'none', stroke: KARTE.sea.ink, 'stroke-width': n2(2 * off + shw), 'stroke-linejoin': 'round', opacity: .17 }, g);
      el('path', { d, fill: 'none', stroke: KARTE.sea[key], 'stroke-width': n2(2 * off), 'stroke-linejoin': 'round' }, g);
    });

    swellMarks(g, isl, vb, opt);

    /* Die Schaumlinie. Sie läuft — eine stehende Schaumlinie sieht
       aus wie ein Rand um einen Aufkleber. */
    el('path', {
      class: 'wi-foam', d: dCoast, fill: 'none', stroke: KARTE.sea.foam,
      'stroke-width': .15, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      'stroke-dasharray': '.62 .48', opacity: .8
    }, g);

    surfMarks(g, isl, rings, opt);
    return g;
  }

  /* ─── Die Brandung ──────────────────────────────────────────
     Eine gestrichelte Linie an der Küste ist Schaum, aber keine
     Welle: sie hat keine Richtung. Hier läuft je Marke ein kleiner
     Bogen von außen auf das Land zu und verläuft dort — angehalten
     sieht man Schaumkämme, in Bewegung sieht man Brandung.

     Die Marken sitzen in gleichmäßigem Abstand AUF DEM WEG und
     nicht auf den Eckpunkten des Küstenzugs: in einer Bucht liegen
     die Punkte dicht, auf einer geraden Strecke weit auseinander —
     nach Punkten verteilt bekäme die Bucht Schaumklumpen und die
     Gerade nichts. */
  function surfMarks(g, isl, rings, opt) {
    const gg = el('g', {}, g);
    const r = mulberry32(8123);
    const step = opt.dicht ? 3.4 : 2.5;
    for (const ring of rings) {
      if (ring.length < 8) continue;
      let t = r() * step;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const seg = Math.hypot(dx, dy) || 1e-6;
        while (t < seg) {
          const f = t / seg;
          const x = a[0] + dx * f, y = a[1] + dy * f;
          /* Die Senkrechte zur Küste — und zwar die, die nach
             AUSSEN zeigt. Welche der beiden das ist, verrät der
             Punkt selbst: die richtige zeigt von der Inselmitte
             weg. (Im Showroom stand hier der Nullpunkt; der Server
             legt seine Insel aber nicht um 0,0.) */
          let nx = -dy / seg, ny = dx / seg;
          if (nx * (x - isl.ctr.x) + ny * (y - isl.ctr.y) < 0) { nx = -nx; ny = -ny; }
          const s = .78 + r() * .5;
          const gm = el('g', {
            transform: `translate(${n2(x + nx * .34)} ${n2(y + ny * .34)}) `
                     + `rotate(${n2(Math.atan2(ny, nx) * 180 / Math.PI)}) scale(${n2(s)})`
          }, gg);
          const gi = el('g', { class: 'wi-surf' }, gm);
          gi.style.animationDelay = n2(-r() * 4.6) + 's';
          /* Zwei Bögen, nach außen gewölbt: der Wellenkopf und der
             Schaum dahinter. Nach der Drehung zeigt die örtliche
             X-Achse nach außen, deshalb wölbt sich der Bogen nach
             +X. */
          el('path', { d: 'M0 -.52Q.30 0 0 .52', fill: 'none', stroke: KARTE.sea.foam, 'stroke-width': .12, 'stroke-linecap': 'round', opacity: .85 }, gi);
          el('path', { d: 'M0 -.29Q.15 0 0 .29', fill: 'none', stroke: KARTE.sea.foam, 'stroke-width': .075, 'stroke-linecap': 'round', opacity: .5 }, gi);
          t += step * (.55 + r() * .95);
        }
        t -= seg;
      }
    }
    return gg;
  }

  /* ─── Wellen auf hoher See ──────────────────────────────────
     Vereinzelt, klein, weit genug draußen — und ECKIG (Sönke: „mach
     die eher eckig wie ein Dach, so wie richtige Wellen"). Ein
     weicher Bogen ist eine Dünung; eine Welle hat einen Kamm.

     Sie tauchen auf und verschwinden wieder. Das erledigt die
     Bewegung in tool.css; hier bekommt nur jede Welle ihre eigene
     Dauer und ihren eigenen Beginn — sonst blinkt das ganze Meer im
     Takt. Weil jede über die halbe Runde unsichtbar ist, dürfen es
     mehr sein, als man gleichzeitig sieht.

     Nicht dicht an die Küste: dort ist die Brandung zuständig. */
  function swellMarks(g, isl, vb, opt) {
    const gg = el('g', {}, g);
    const r = mulberry32(5150);
    const want = opt.dicht ? 12 : 20;
    const put = [];
    /* Abstand zur Insel = Abstand zum nächsten Feldmittelpunkt. Das
       ist billiger als jede Umrissrechnung und für „weit draußen"
       genau genug. */
    const frei = (x, y) => {
      for (const z of isl.cells) if (Math.hypot(z.x - x, z.y - y) < 3.4) return false;
      for (const h of isl.homes) if (Math.hypot(h.x + h.sx * SHIPD - x, h.y + h.sy * SHIPD - y) < 2.4) return false;
      return true;
    };
    for (let tries = 0; tries < 600 && put.length < want; tries++) {
      const x = vb[0] + .7 + r() * (vb[2] - 1.4);
      const y = vb[1] + .7 + r() * (vb[3] - 1.4);
      if (!frei(x, y)) continue;
      if (put.some(p => Math.hypot(p[0] - x, p[1] - y) < 2.0)) continue;
      put.push([x, y]);
      const s = .8 + r() * .5;
      /* Ein bisschen aus der Waagerechten gekippt: zwanzig Dächer,
         alle exakt gerade, sähen aus wie ein Muster. */
      const gm = el('g', {
        transform: `translate(${n2(x)} ${n2(y)}) rotate(${n2(-9 + r() * 18)}) scale(${n2(s)})`
      }, gg);
      const gi = el('g', { class: 'wi-swell' }, gm);
      const dur = 6.5 + r() * 5;
      gi.style.animationDuration = n2(dur) + 's';
      gi.style.animationDelay = n2(-r() * dur) + 's';
      /* Zwei Dächer, das zweite kleiner und versetzt: eine einzelne
         Spitze liest sich als Vogel, zwei als Wellenkamm.
         `stroke-linejoin: miter` ist der Punkt der ganzen Sache —
         mit `round` wäre die Ecke wieder ein Bogen. */
      el('path', {
        d: 'M-.58 .17L-.29 -.15L0 .17M.14 .34L.32 .14L.5 .34',
        fill: 'none', stroke: KARTE.sea.foam, 'stroke-width': .085,
        'stroke-linejoin': 'miter', 'stroke-linecap': 'butt', opacity: .62
      }, gi);
    }
    return gg;
  }

  /* ══════════════════════════════════════════════════════════
     Das Land
     ══════════════════════════════════════════════════════════
     Im Relief steht jede Kachel für sich, weil sie eine Höhe hat.
     Ein Vereinigungspfad ginge hier nicht: eine Seitenfläche gehört
     zu genau EINEM Feld. Dafür bekommt man etwas, das keine flache
     Karte kann — Land, das beim Erobern wächst. */

  /* Die Marken EINES Feldes: Bäume, Felsen, Grasbüschel, Kiesel.
     Immer dieselben — der Würfel hängt an der Feldnummer und nicht
     am Spielstand, sonst tanzten die Bäume bei jedem Takt. */
  function dTree(x, y, s) {
    const w = .13 * s, h = .30 * s, b = .12 * s;
    return `M${n2(x - w)} ${n2(y + b)}L${n2(x)} ${n2(y - h)}L${n2(x + w)} ${n2(y + b)}Z`;
  }
  function dRock(x, y, s) {
    return `M${n2(x - .13 * s)} ${n2(y + .09 * s)}L${n2(x - .06 * s)} ${n2(y - .09 * s)}`
         + `L${n2(x + .05 * s)} ${n2(y - .11 * s)}L${n2(x + .13 * s)} ${n2(y + .04 * s)}`
         + `L${n2(x + .08 * s)} ${n2(y + .10 * s)}Z`;
  }
  function dTuft(x, y, s) {
    let d = '';
    for (let i = -1; i <= 1; i++) {
      const bx = x + i * .07 * s;
      d += `M${n2(bx)} ${n2(y + .07 * s)}Q${n2(bx + i * .03 * s)} ${n2(y)} ${n2(bx + i * .06 * s)} ${n2(y - .10 * s)}`;
    }
    return d;
  }
  function dDot(x, y, s) {
    const r = .04 * s;
    return `M${n2(x - r)} ${n2(y)}a${n2(r)} ${n2(r)} 0 1 0 ${n2(2 * r)} 0a${n2(r)} ${n2(r)} 0 1 0 ${n2(-2 * r)} 0`;
  }
  function cellDetail(z) {
    if (z.home) return '';                      // dort steht die Fahne
    const r = mulberry32(z.r * 7919 + z.c * 104729 + 17);
    const k = z.boden;
    const cnt = k === 'wald' ? 2 + (r() < .5 ? 1 : 0)
              : k === 'fels' ? 1 + (r() < .5 ? 1 : 0)
              : k === 'sand' ? 2 : 3;
    let d = '';
    for (let i = 0; i < cnt; i++) {
      const a = r() * 6.283, rad = .10 + r() * .28;
      const x = z.x + Math.cos(a) * rad, y = z.y + Math.sin(a) * rad * .82;
      const s = .75 + r() * .55;
      d += k === 'wald' ? dTree(x, y, s)
         : k === 'fels' ? dRock(x, y, s)
         : k === 'sand' ? dDot(x, y, s)
         : dTuft(x, y, s);
    }
    return d;
  }

  function reliefLand(svg, isl, opt) {
    const g = el('g', {}, svg);
    const nodes = [];
    /* Füllung und Strich je Bodenart: Gras wird gestrichelt
       (Halme), alles andere gefüllt. */
    const DK = {
      wald: [shade(KARTE.land.wald, -.45), 'none'],
      fels: [shade(KARTE.land.fels, -.30), 'none'],
      sand: [shade(KARTE.land.sand, -.34), 'none'],
      gras: ['none', shade(KARTE.land.gras, -.34)]
    };
    /* Malerreihenfolge: von hinten nach vorn, sonst steht eine
       hintere Säule vor einer vorderen. */
    for (const z of isl.cells.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
      const gg = el('g', {}, g);
      const base = z.ruin
        ? el('ellipse', { class: 'wi-det', cx: n2(z.x), cy: n2(z.y + .34), rx: .62, ry: .22, fill: 'rgba(0,0,0,.40)', filter: F('b1') }, gg)
        : null;
      const side = el('path', { class: 'wi-side', d: '', fill: '#123240' }, gg);
      const top = el('path', {
        class: 'wi-cell', d: '', fill: KARTE.land[z.boden],
        stroke: 'rgba(0,0,0,.16)', 'stroke-width': .015
      }, gg);
      top.dataset.i = z.i; top.dataset.r = z.r; top.dataset.c = z.c; top.dataset.t = '.';
      /* Die Marken fahren mit der Deckfläche nach oben. Ohne sie
         wäre das Relief die einzige Schicht ohne Insel-Struktur.

         Sie liegen ÜBER der Deckfläche und müssen deshalb für den
         Finger durchlässig sein (tool.css, .wi-det): bei der freien
         Wahl sucht onMapClick das nächste `.wi-cell` nach oben, und
         ein Bäumchen ist keines — ein Tipp genau auf einen Baum
         täte sonst gar nichts, und zwar nur manchmal. */
      const det = opt.dicht ? null : el('path', {
        class: 'wi-det', d: cellDetail(z), fill: DK[z.boden][0], stroke: DK[z.boden][1],
        'stroke-width': .035, 'stroke-linecap': 'round', opacity: .75
      }, gg);
      nodes.push({ z, base, side, top, det });
      cellEls[z.i] = top;
    }

    /* Die Seitenfläche: der untere Rand des Sechsecks, um die Höhe
       nach unten verlängert. Die unteren Ecken sind bei dieser
       Ausrichtung 2, 1 und 0 (y wächst nach unten). */
    function sidePath(x, y, s, h) {
      const pts = [2, 1, 0].map(i => [x + HEX[i][0] * s, y + HEX[i][1] * s]);
      let d = `M${n2(pts[0][0])} ${n2(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) d += `L${n2(pts[i][0])} ${n2(pts[i][1])}`;
      for (let i = pts.length - 1; i >= 0; i--) d += `L${n2(pts[i][0])} ${n2(pts[i][1] + h)}`;
      return d + 'Z';
    }

    /* `own === null` heißt SOLO: kein Nebel, kein Besitz, keine
       Volksfarbe. Jede Kachel steht von Anfang an auf ihrer
       Geländehöhe und behält ihre eigene Bodenfarbe — auf der
       eigenen Insel gibt es nichts zu erobern. Gemalt wird dann
       einmal beim Aufbau und nie wieder.

       Als Sonderfall IN paint und nicht als zweite Funktion: die
       vierzig Zeilen darunter (Säule, Deckfläche, Kleinteile,
       Malerreihenfolge) sind in beiden Fällen dieselben, und die
       zweite Fassung wäre die, die beim nächsten Umbau stehen
       bleibt. */
    return function paint(own) {
      for (const n of nodes) {
        const z = n.z, ch = own ? own[z.i] : null;
        /* Nur was sich geändert hat. Bei 500 Feldern und einem Takt
           alle vier Sekunden ist das der Unterschied zwischen
           „lebt" und „ruckelt". */
        if (own && ownPainted && ownPainted[z.i] === ch) continue;
        const on = own ? ch !== '.' : true;
        const t = (own && on) ? facOf(+ch) : -1;
        const farbe = (own && on) ? (TEAMS[t] || { color: '#888' }).color : null;
        /* Nebel liegt flach, erobertes Land steht auf. */
        const h = on ? z.hoch : .10;
        const y = z.y - h + .1;
        n.top.setAttribute('d', hexPath(z.x, y, 1.0));
        n.side.setAttribute('d', sidePath(z.x, y, 1.0, h + .06));
        const deck = farbe ? mix(KARTE.land[z.boden], farbe, KARTE.mix * (z.boden === 'sand' ? .62 : 1)) : KARTE.land[z.boden];
        n.top.setAttribute('fill', deck);
        n.side.setAttribute('fill', shade(deck, farbe ? -.45 : -.5));
        n.top.dataset.t = farbe ? String(t) : '.';
        if (n.det) n.det.setAttribute('transform', `translate(0 ${n2(-h + .1)})`);
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
     Der Nebel — Tonstufen
     ══════════════════════════════════════════════════════════
     Der Nebel ist kein Zustand einer Kachel, sondern ein Ding, das
     ÜBER dem Feld liegt: Fläche, Struktur darin, ein Schatten auf
     dem Land. Reihenfolge im Bild: Schatten → Nebel → alles andere.
     Der Schatten liegt bewusst NICHT im selben Filter wie der
     Nebel, sonst verschluckt der Nebel ihn.

     Zieltöne von außen nach innen: Randfeld, zweites Feld, Kern.
     0.55 heißt „der Nebel deckt zu 55 %", das Land scheint also mit
     45 % durch — genug zum Erahnen, zu wenig zum Erkennen. DAS ist
     die Zahl, an der man dreht, wenn es zu viel oder zu wenig
     verrät; alles andere bleibt, wie es ist. */
  const FOG_TOENE = [.55, .82, 1];

  /* Wie tief liegt ein verhülltes Feld im Nebel? Breitensuche vom
     Nebelrand nach innen. 1 = Randfeld, also: mindestens ein
     Nachbar ist nicht verhüllt. Dass dazu auch das offene Meer
     zählt, ist Absicht — an der Küste ist der Nebel genauso außen
     wie an der Front, und dort schimmert dann der Strand durch. */
  function fogDepth(isl, verhuellt) {
    const drin = new Set(verhuellt);
    const tiefe = new Map();
    let front = [];
    for (const z of verhuellt) {
      if (neighbors(z.r, z.c).some(([nr, nc]) => { const n = isl.at(nr, nc); return !n || !drin.has(n); })) {
        tiefe.set(z, 1); front.push(z);
      }
    }
    while (front.length) {
      const next = [];
      for (const z of front) for (const [nr, nc] of neighbors(z.r, z.c)) {
        const n = isl.at(nr, nc);
        if (!n || !drin.has(n) || tiefe.has(n)) continue;
        tiefe.set(n, tiefe.get(z) + 1); next.push(n);
      }
      front = next;
    }
    return tiefe;
  }

  /* Aus Zieltönen die Deckung der einzelnen Schichten.
     Die Schichten liegen ÜBEREINANDER und nicht nebeneinander: die
     unterste ist der ganze Nebel, die nächste alles ab dem zweiten
     Feld, die oberste der Kern. Nebeneinander gelegte Bänder
     müssten sich eine Kante teilen, und an geteilten Kanten steht
     in SVG immer eine Naht.

     Übereinander addiert sich aber die Deckung, also muss jede
     Schicht wissen, was unter ihr schon liegt: von .55 auf .82 zu
     kommen kostet nicht .82, sondern .60 — sonst sind die Töne, die
     in der Tabelle stehen, nicht die, die man sieht. */
  function stufenDeckung(toene) {
    let vor = 0;
    return toene.map(t => {
      const a = vor >= 1 ? 1 : (t - vor) / (1 - vor);
      vor = t;
      return n2(Math.max(0, Math.min(1, a)));
    });
  }

  /* Eine Rauschfläche: Rechteck über die ganze Karte, Farbe vom
     Rechteck, Form vom Filter, Bewegung von der Klasse. */
  function wispRect(parent, opt, cls, filt, col, op) {
    const bb = opt.box;
    const gw = el('g', { class: cls }, parent);
    el('rect', { x: bb.x, y: bb.y, width: bb.w, height: bb.h, fill: col, filter: filt, opacity: op }, gw);
    return gw;
  }

  function fogLayer(svg, isl, opt, lift) {
    const gap = 1.06;
    const gWrap = el('g', { class: 'wi-fog', transform: `translate(0 ${n2(-lift)})` }, svg);

    /* Der Schatten muss weit genug unter dem Nebel hervorkommen, um
       überhaupt gesehen zu werden — sonst verschluckt ihn dessen
       eigener weicher Rand, und der Nebel liegt wieder IM Feld
       statt darüber. */
    const gSh = el('g', { filter: F('cloudsh'), opacity: n2(KARTE.fog.shadowOp * .85) }, gWrap);
    const shadow = el('path', { d: '', fill: KARTE.fog.shadow, transform: 'translate(.16 .62)' }, gSh);

    const gCloud = el('g', { filter: F('cloud') }, gWrap);
    const body = el('path', { class: 'wi-fogbody', d: '', fill: KARTE.fog.body }, gCloud);

    /* ── Die Tonstufen ────────────────────────────────────────
       Eine Maske über dem GANZEN Nebel — Körper und Schwaden
       zusammen. Das ist der Punkt: würde man nur den Körper
       durchsichtig machen, bliebe die Rauschlage darüber voll
       stehen, und der Rand wäre genauso blickdicht wie vorher, nur
       heller.

       Die Maske rechnet mit Helligkeit: weiß deckt, dunkelgrau
       lässt durch. Statt grauer Flächen liegen hier weiße in
       Gruppen mit `opacity` — Grau wäre eine Wette darauf, in
       welchem Farbraum der Browser die Helligkeit ausrechnet (SVG
       1.1 sagt linearRGB, CSS Masking sagt sRGB), und die beiden
       Antworten liegen weit auseinander. Weiß mit Deckung ist in
       beiden dasselbe.

       Und die Maske läuft durch DENSELBEN Wolkenfilter wie der
       Nebel. Ohne das hätte man weiche Nebelränder mit
       schnurgeraden Sechseck-Stufen darin — eine Bienenwabe im
       Wattebausch. Mit ihm wandern beide gleich, weil die Turbulenz
       denselben Startwert hat. */
    const bb = opt.box;
    const mk = el('mask', {
      id: FID + 'fm', maskUnits: 'userSpaceOnUse',
      x: bb.x, y: bb.y, width: bb.w, height: bb.h
    }, el('defs', {}, gWrap));
    const gM = el('g', { filter: F('cloud') }, mk);
    const stufen = stufenDeckung(FOG_TOENE).map(op =>
      el('path', { d: '', fill: '#fff' }, el('g', { opacity: op }, gM)));
    gCloud.setAttribute('mask', `url(#${FID}fm)`);

    /* Was IM Nebel steckt. Es sitzt in der Nebelform
       (Schnittmaske), und die Maske sitzt INNEN, der Filter AUSSEN
       — andersherum schnitte die Maske die verzerrte Form wieder
       scharf ab, und der ganze Rand wäre umsonst. */
    const cp = el('clipPath', { id: FID + 'fc' }, el('defs', {}, gCloud));
    const clip = el('path', { d: '' }, cp);
    const gIn = el('g', { class: 'wi-fogin', 'clip-path': `url(#${FID}fc)` }, gCloud);
    wispRect(gIn, opt, 'wi-fogc', F('fogc'), KARTE.fog.puffD, .3);
    wispRect(gIn, opt, 'wi-foga', F('foga'), KARTE.fog.puffL, .6);
    if (!opt.dicht) wispRect(gIn, opt, 'wi-fogb', F('fogb'), KARTE.fog.puffD, .45);

    let last = null;
    return function paint(own) {
      if (own === last) return;
      last = own;
      const fog = isl.cells.filter(z => own[z.i] === '.');
      const d = union(fog, gap);
      /* Schicht i deckt alles ab Tiefe i+1 — die unterste also den
         ganzen Nebel, die oberste nur den Kern. Die Tiefe wird bei
         JEDEM Takt neu gerechnet, und das muss sie auch: der
         Nebelrand wandert ja gerade. */
      const tiefe = fogDepth(isl, fog);
      stufen.forEach((s, i) => {
        s.setAttribute('d', i === 0 ? d : union(fog.filter(z => (tiefe.get(z) || 99) > i), gap));
      });
      body.setAttribute('d', d);
      clip.setAttribute('d', d);
      shadow.setAttribute('d', d);
    };
  }

  /* ══════════════════════════════════════════════════════════
     Orte, Fahnen, Schiffe
     ══════════════════════════════════════════════════════════ */

  function placeLayer(svg, isl) {
    const g = el('g', { class: 'wi-places' }, svg);
    const marks = [];
    for (const z of isl.cells) {
      if (!z.ruin) continue;
      const def = PLACES[z.ruin] || PLACES[1];
      const sc = def.gross;
      const gg = el('g', { class: 'wi-place', transform: `translate(${n2(z.x)} ${n2(z.y)})` }, g);
      /* Was durch die Wolke dringt, ist der SCHEIN. Der Ort selbst
         bleibt verdeckt — sonst wäre der Nebel nur ein Farbfilter.
         Klein halten: mit dem Radius einer ganzen Kachel stehen auf
         dem Nebel zehn gelbe Flecken, die aussehen wie ein Fehler
         im Bild. Ein Licht im Nebel ist ein PUNKT mit Schein, keine
         Scheibe. */
      const halo = el('circle', { class: 'wi-halo', r: n2(.3 * sc), fill: KARTE.gold, opacity: .6, filter: F('b2') }, gg);
      const gBody = el('g', { opacity: 0 }, gg);
      el('ellipse', { cx: 0, cy: n2(.30 * sc), rx: n2(.66 * sc), ry: n2(.22 * sc), fill: 'rgba(0,0,0,.38)', filter: F('b1') }, gBody);
      /* Der Sockel: gerodeter Boden, auf dem der Ort steht. Er
         gehört der Karte und bleibt, egal welches Bild darauf
         kommt. */
      const plate = el('path', {
        class: 'wi-plate', d: hexPath(0, 0, sc * 1.02), fill: KARTE.land.sand,
        stroke: shade(KARTE.land.sand, -.35), 'stroke-width': .05
      }, gBody);
      el('path', { d: hexPath(0, 0, sc * 1.02), fill: 'none', stroke: KARTE.gold, 'stroke-width': .06, opacity: .8 }, gBody);
      const w = 1.55 * sc, h = w * def.hoch;
      if (def.img) {
        img(gBody, def.img, {
          x: n2(-w / 2), y: n2(.22 * sc - h), width: n2(w), height: n2(h),
          preserveAspectRatio: 'xMidYMax meet'
        });
      } else {
        /* Das Platzhalter-Zeichen bekommt eine helle Kontur:
           dunkles Grau auf sandfarbenem Sockel ist sonst kaum von
           der Bodentextur zu unterscheiden. */
        el('path', {
          d: MARK[z.ruin], fill: KARTE.signInk, opacity: .92,
          stroke: 'rgba(255,255,255,.75)', 'stroke-width': .045, 'paint-order': 'stroke',
          transform: `scale(${n2(sc * 1.3)})`
        }, gBody);
      }
      marks.push({ z, halo, gBody, plate });
    }

    return function paint(own) {
      for (const m of marks) {
        const ch = own[m.z.i];
        if (ownPainted && ownPainted[m.z.i] === ch) continue;
        const on = ch !== '.';
        const t = on ? facOf(+ch) : -1;
        /* Der Sockel nimmt die Farbe des Volkes an, sobald der Ort
           gehört — das ist die Meldung „erobert", ohne eine Zahl. */
        m.plate.setAttribute('fill', on
          ? mix(KARTE.land.sand, (TEAMS[t] || { color: '#888' }).color, .55)
          : KARTE.land.sand);
        m.gBody.setAttribute('opacity', on ? 1 : 0);
        m.halo.setAttribute('opacity', on ? .3 : .6);
      }
    };
  }

  /* Der Landeplatz. Hier standen einmal Burgen — die sind raus, sie
     gehören woandershin. Ganz leer darf die Stelle trotzdem nicht
     bleiben: die gestrichelte Planke vom Schiff braucht ein Ziel,
     und sechs Anlandungen müssen auf der Karte zu finden sein, ohne
     die Schiffe abzuzählen.

     Was bleibt, ist das kleinstmögliche Zeichen: ein Stab mit einer
     Fahne in der Volksfarbe. Kein Bild, kein Sockel — sonst
     konkurriert der Landeplatz mit den besonderen Orten, und die
     sind das, worum auf dieser Karte gespielt wird. */
  function flagLayer(svg, isl) {
    const g = el('g', { class: 'wi-flags' }, svg);
    const flags = [];
    for (const h of isl.homes) {
      /* Etwas nach oben gesetzt: im Relief steht die Kachel als
         Säule, und eine Fahne auf Höhe der Grundfläche steckte im
         Hang. */
      const gg = el('g', { class: 'wi-flag', transform: `translate(${n2(h.x)} ${n2(h.y - .3)})` }, g);
      el('ellipse', { cx: 0, cy: .12, rx: .34, ry: .12, fill: 'rgba(0,0,0,.34)', filter: F('b1') }, gg);
      el('path', {
        d: 'M0 .1L0 -1.02', stroke: shade(KARTE.land.sand, -.62),
        'stroke-width': .1, 'stroke-linecap': 'round', fill: 'none'
      }, gg);
      /* Die Fahne weht zur Wasserseite — dorthin, wo das Schiff
         liegt. Sonst zeigt sie bei der Hälfte der Völker ins
         Landesinnere und sieht aus, als hätte jemand vergessen, sie
         zu drehen. */
      const s = h.sx < 0 ? -1 : 1;
      const tuch = el('path', {
        d: `M0 -1.0L${n2(s * .62)} -.82L0 -.62Z`, fill: '#94a3b8',
        stroke: 'rgba(0,0,0,.28)', 'stroke-width': .04, 'stroke-linejoin': 'round'
      }, gg);
      flags.push({ z: h, tuch });
    }
    return function paint(own) {
      for (const f of flags) {
        const ch = own[f.z.i];
        if (ownPainted && ownPainted[f.z.i] === ch) continue;
        const on = ch !== '.';
        f.tuch.setAttribute('fill', on ? (TEAMS[facOf(+ch)] || { color: '#94a3b8' }).color : '#94a3b8');
      }
    };
  }

  /* ─── Die Schiffe ───────────────────────────────────────────
     Sönke, 08.09.2026: „Die Schiffe sind keine Felder auf dem
     Spielfeld. Sie fahren von außen an das Spielfeld ran (beim
     Start) und dann werden von da aus die Felder markiert und
     eingenommen."

     Also liegt das Schiff im WASSER neben seinem Landeplatz, nicht
     darauf, und fährt beim Aufbau der Karte von draußen heran — das
     ist genau der Moment, in dem der Countdown läuft. Vom Schiff
     führt eine Planke auf die Insel: von hier aus wird genommen.

     Welches Bild darauf liegt, weiß erst `own`: der Server kennt
     nur `is_home`, welchem Volk der Landeplatz gehört, steht in der
     Besitz-Zeichenkette. Deshalb ist der Bildpfad kein Merkmal des
     Aufbaus, sondern des Malens.

     ── Der Ankerpunkt ist die MITTE des Schiffes ─────────────
     Vorher war es der untere Bildrand („Wasserlinie"), und das war
     der Fehler, den Sönke am 09.09.2026 gemeldet hat: „die Schiffe
     (gerade an der oberen Kante) sind viel zu weit vom Festland
     entfernt."

     Der Grund ist, dass ein Bildkasten in SVG nicht mitdreht. Er
     hing unter dem Anker, also lag der Schiffskörper IMMER
     oberhalb davon — egal, auf welcher Seite der Insel der
     Landeplatz liegt. Im Norden zeigte das Schiff damit von der
     Insel weg und stand scheinbar doppelt so weit draußen; im
     Süden ragte es über das Land. Ein Abstand, der nur nach
     Süden stimmt, ist kein Abstand.

     Mit dem Anker in der Bildmitte heißt „zwei Kacheln vor dem
     Landeplatz" in alle sechs Richtungen dasselbe. Erst dadurch
     lässt sich der Abstand überhaupt einstellen — vorher hätte
     jede Zahl eine Himmelsrichtung bevorzugt.                  */
  const SHIP_START = 9;      // von so weit draußen fährt es an
  /* Kantenlänge des Bildkastens. Mit SHIPD = 2.0 endet er bei 0.6
     vom Mittelpunkt des Landeplatzes — die Kachel selbst reicht bis
     0.5, das Schiff liegt also längsseits. */
  const SHIP_BOX = 2.8;

  function shipLayer(svg, isl) {
    const g = el('g', { class: 'wi-ships' }, svg);
    const glides = [];
    for (const h of isl.homes) {
      const ax = h.x + h.sx * SHIPD, ay = h.y + h.sy * SHIPD;
      const sh = el('g', { class: 'wi-ship', transform: `translate(${n2(ax)} ${n2(ay)})` }, g);
      sh.dataset.t = '.';
      /* Zwei Hüllen: die äußere fährt herein (Übergang), die innere
         schaukelt (Endlos-Bewegung). Getrennt, weil sich sonst
         beide dieselbe transform-Eigenschaft streitig machen. */
      const glide = el('g', { class: 'wi-shipglide' }, sh);
      glide.style.transform = `translate(${n2(h.sx * SHIP_START)}px, ${n2(h.sy * SHIP_START)}px)`;
      const bob = el('g', { class: 'wi-shipbob' }, glide);
      bob.style.animationDelay = (isl.homes.indexOf(h) * -0.7) + 's';
      /* Kielwasser: ein heller Fleck unter dem Rumpf. Ohne ihn
         klebt das Schiff auf dem Wasser statt darin zu liegen — mit
         zu viel davon liegt es auf einer grauen Pille. Es sitzt
         bewusst blass und breit: Sönkes PNG haben unterschiedlich
         viel durchsichtigen Rand (2 % bis 15 %), der Kiel liegt
         also nicht bei allen auf derselben Höhe. Ein scharfer
         Fleck säße bei der Hälfte der Schiffe daneben. */
      el('ellipse', { cx: 0, cy: 1.02, rx: 1.05, ry: .24, fill: KARTE.sea.foam, opacity: .18, filter: F('b2') }, bob);
      /* Ohne href — der kommt beim Malen. Ein <image href=""> ist
         nicht „leer", sondern ein Verweis auf die SEITE: der
         Browser lädt j.html und versucht, HTML als Bild zu
         zeichnen. Das kostet einen Abruf und eine rote Zeile in
         der Konsole für nichts. */
      const bild = el('image', {
        class: 'wi-shipimg',
        x: n2(-SHIP_BOX / 2), y: n2(-SHIP_BOX / 2), width: SHIP_BOX, height: SHIP_BOX,
        preserveAspectRatio: 'xMidYMid meet'
      }, bob);
      /* Die Planke: der Weg vom Schiff auf die Insel. Blass — sie
         erklärt etwas, sie will nicht mit den Feldern
         konkurrieren. */
      const plank = el('path', {
        class: 'wi-plank', d: `M${n2(h.x)} ${n2(h.y)} L${n2(ax)} ${n2(ay)}`,
        'stroke-width': .11, 'stroke-linecap': 'round', 'stroke-dasharray': '.28 .3',
        fill: 'none', opacity: .32
      }, g);
      plank.dataset.t = '.';
      ships[h.i] = { g: sh, img: bild, plank, glide };
      glides.push(glide);
    }
    /* Und los: im nächsten Bild steht der Zielwert, der Übergang in
       tool.css macht daraus die Anfahrt. Im selben Bild gesetzt wäre
       es keine Fahrt, sondern ein Sprung. */
    if (glides.length) {
      setTimeout(() => {
        if (destroyed) return;
        glides.forEach(gl => { gl.style.transform = 'translate(0px, 0px)'; });
      }, 60);
    }

    return function paint(own) {
      for (const key in ships) {
        const i = +key, sh = ships[i], ch = own[i];
        if (ownPainted && ownPainted[i] === ch) continue;
        if (ch === '.') continue;               // noch niemand gelandet
        const t = String(facOf(+ch));
        const want = shipSrc(facOf(+ch));
        if (sh.img.getAttribute('href') !== want) {
          sh.img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', want);
          sh.img.setAttribute('href', want);
        }
        if (sh.g.dataset.t !== t) { sh.g.dataset.t = t; sh.plank.dataset.t = t; }
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
     Eine Karte zusammensetzen
     ══════════════════════════════════════════════════════════ */

  /* Im Solo ein größerer Rand: die ausgewachsenen Echsen fliegen
     über das offene Wasser hinaus, und ein Ausschnitt, der am
     Strand endet, schneidet sie ab. Im Raum bleibt es bei einer
     halben Kachel — dort ist jeder Millimeter Wasser Platz, der
     der Insel fehlt. */
  const RAND = { raum: 0.5, solo: 2.4 };

  function frame(svg, isl, solo) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const z of isl.cells) {
      a = Math.min(a, z.x); b = Math.max(b, z.x);
      c = Math.min(c, z.y); d = Math.max(d, z.y);
    }
    /* Das Schiffsbild steht um seinen Ankerpunkt herum — ein
       Ausschnitt, der nur bis zum Anker reicht, säbelt die Masten
       ab. Seit der Anker in der Bildmitte sitzt, ist der Zuschlag
       nach allen vier Seiten derselbe: die halbe Kastenbreite.
       (Im Solo läuft die Schleife leer: es gibt keine Landeplätze.) */
    const m = SHIP_BOX / 2 + .1;
    for (const h of isl.homes) {
      a = Math.min(a, h.x + h.sx * SHIPD - m); b = Math.max(b, h.x + h.sx * SHIPD + m);
      c = Math.min(c, h.y + h.sy * SHIPD - m); d = Math.max(d, h.y + h.sy * SHIPD + m);
    }
    const p = solo ? RAND.solo : RAND.raum;
    const vb = [a - p, c - p, b - a + 2 * p, d - c + 2 * p];
    svg.setAttribute('viewBox', vb.map(v => n2(v)).join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return vb;
  }

  let mapSeq = 0;
  let mapPaint = null;      // die Malfunktion der aufgebauten Karte

  /* `mopt.solo` lässt vier Schichten weg — Nebel, Flaggen, besondere
     Orte, Schiffe. Alle vier gehören zum Erobern, und im
     Einzelspieler gibt es nichts zu erobern. Ein Schalter statt
     einer zweiten Fassung: was übrig bleibt (Meer, Brandung,
     Wellen, Relief) ist der weitaus größere Teil, und er soll in
     beiden Rollen derselbe sein. */
  function buildMap(svg, list, key, mopt) {
    const solo = !!(mopt && mopt.solo);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    cellEls = []; ships = {}; ownPainted = null; mapPaint = null;

    /* In der Lobby gibt es noch keine Insel (wi_tiles ist leer, bis
       wi_room_start würfelt). Ohne diesen Ausgang stünde im viewBox
       „Infinity -Infinity NaN NaN" — und das SVG wäre danach kaputt,
       nicht bloß leer. */
    if (!list.length) { svg.setAttribute('viewBox', '0 0 1 1'); return; }

    FID = 'wi' + (++mapSeq) + '_';
    buildDefs(svg);

    const isl = inselDaten(list, key);
    const vb = frame(svg, isl, solo);
    /* „dicht" ist eine Notbremse für sehr große Inseln, und zwar
       ausdrücklich eine für die RECHENLAST und nicht für die
       Sichtbarkeit: der Ausschnitt wächst mit der Insel mit, eine
       Kachel bleibt auf dem Beamer also ungefähr gleich groß, egal
       ob 200 oder 900 Felder darauf liegen. Sichtbar wären die
       Bäumchen auch dann noch.

       Zu bezahlen sind sie aber je Feld: bei 900 Feldern kommen
       900 Pfade dazu, die bei jedem Aufstehen einer Kachel neu
       verschoben werden. wi_build_island rechnet mit rund 1,6
       Feldern je Kind und Minute — eine Doppelstunde mit 30 Kindern
       liegt also durchaus bei 900. Ab 700 fallen deshalb die
       Kleinteile weg, dazu die dritte Nebellage und ein Teil der
       Brandung. Nachgezählt: 520 Felder ergeben 2500 Elemente MIT
       Kleinteilen, 1050 Felder 3700 OHNE. Das Neumalen je Takt
       kostet dabei rund fünf Millisekunden — teuer ist der Aufbau,
       und der passiert einmal, während der Countdown läuft. */
    const opt = {
      box: { x: n2(vb[0] - 2), y: n2(vb[1] - 2), w: n2(vb[2] + 4), h: n2(vb[3] + 4) },
      dicht: isl.cells.length > 700
    };

    /* Die Küstenringe EINMAL. Das Wasser stapelt vier Tiefenstufen
       darauf und die Brandung setzt ihre Wellen darauf ab — jedes
       Mal neu aus den Kacheln zu suchen wäre fünfmal dieselbe
       Arbeit. */
    const rings = coastRings(isl, 1.0);
    const dCoast = ringsPath(rings, 0, false, 0);

    seaLayer(svg, isl, vb, dCoast, rings, opt);
    const land = reliefLand(svg, isl, opt);

    if (solo) {
      /* Einmal malen und fertig. `null` sagt dem Relief „kein
         Besitz": jede Kachel steht auf ihrer Geländehöhe in ihrer
         eigenen Farbe. Danach ändert sich an dieser Karte nichts
         mehr — was sich bewegt, sind die Tiere auf der Leinwand
         darüber. */
      mapPaint = null;
      land(null);
      return isl;
    }

    /* Der Nebel schwebt eine Fingerbreite über dem flachen Land —
       sonst liegt er IM Feld statt darüber. */
    const fog = fogLayer(svg, isl, opt, .22);
    const flag = flagLayer(svg, isl);
    const place = placeLayer(svg, isl);
    const ship = shipLayer(svg, isl);

    mapPaint = own => { land(own); fog(own); place(own); flag(own); ship(own); };
    return isl;
  }

  /* Nur was sich geändert hat — jede Schicht vergleicht selbst
     gegen `ownPainted`, deshalb wird das hier ZULETZT gesetzt.

     `own` trägt SLOTS, alles Gemalte trägt VÖLKER: welches Volk auf
     Slot 1 sitzt, entscheidet die Lehrkraft. Ohne die Übersetzung
     (facOf) hätte ein Raum mit den Völkern 4 und 5 zwei rot-blaue
     Gebiete und daneben eine lila Kopfzeile. */
  function paintOwn(own) {
    if (!own || !mapPaint || own.length !== cells.length) return;
    mapPaint(own);
    ownPainted = own;
  }

  /* ─── Zoom und Schieben ─────────────────────────────────────
     Auf dem Tablet ist eine Kachel sonst zu klein zum Treffen —
     und beim Zeigen der freien Wahl muss man sie treffen.

     Die Zeiger-Ereignisse hängen in der EINFANG-Phase (Regel:
     feedback_field_gestures_capture_phase): sonst schluckt ein
     stopPropagation() weiter innen die Geste genau über dem
     Inhalt, um den es geht. */
  function attachPanZoom(wrap, svg) {
    let scale = 1, tx = 0, ty = 0;
    const pts = new Map();
    let base = null;

    const apply = () => { svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    const dist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const down = e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) base = { d: dist(), m: mid(), scale, tx, ty };
    };
    const move = e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size === 2 && base) {
        const f = dist() / (base.d || 1);
        scale = Math.min(6, Math.max(1, base.scale * f));
        const m = mid();
        tx = base.tx + (m.x - base.m.x);
        ty = base.ty + (m.y - base.m.y);
        apply();
        e.preventDefault();
      } else if (pts.size === 1 && scale > 1.02 && e.buttons !== 0) {
        tx += e.clientX - prev.x;
        ty += e.clientY - prev.y;
        apply();
        e.preventDefault();
      }
    };
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) base = null; };

    wrap.addEventListener('pointerdown', down, { capture: true });
    wrap.addEventListener('pointermove', move, { capture: true, passive: false });
    wrap.addEventListener('pointerup', up, { capture: true });
    wrap.addEventListener('pointercancel', up, { capture: true });
    // Doppeltipp setzt zurück — der einfachste Ausweg aus jedem
    // verrutschten Bild, und man findet ihn ohne Erklärung.
    wrap.addEventListener('dblclick', () => { scale = 1; tx = ty = 0; apply(); });
  }

  /* ══════════════════════════════════════════════════════════
     Gemeinsame Bausteine
     ══════════════════════════════════════════════════════════ */
  function teamRow(v) {
    const teams = v.teams || [];
    return teams.map(t => {
      const T = teamOf(t.i);
      return `<div class="wi-team${v.winner_team === t.i ? ' is-win' : ''}"
                   style="--wi-team:${T.color}">
                <img src="${esc(esrc(T.img))}" alt="">
                <b>${esc(T.name)}</b>
                <span class="wi-score">${t.score}</span>
                <span class="wi-sub">${t.tiles} Felder · ${t.ruins} aus Ruinen · ${t.people} Kinder</span>
              </div>`;
    }).join('');
  }

  /* Eine Spalte je Volk: Gruppenbild, Name mit Kopfzahl, darunter die
     Kinder. Dasselbe Stück am Beamer (eine Spalte je Volk) und am
     Tablet (nur die eigene, dafür groß) — Kingdoms macht es genauso
     und aus demselben Grund: es ist dieselbe Auskunft.

     `members` ist eine Liste aus {name, me?, online?}. Wer nicht am
     Tablet ist, steht blass da und bleibt trotzdem stehen: beim
     Start verteilt der Server ausnahmslos alle. */
  function teamColHTML(slot, members, opts) {
    const T = teamOf(slot);
    const o = opts || {};
    const li = m => {
      const cls = [m.me ? 'wi-lteamme' : '', m.online === false ? 'wi-lteamoff' : ''].filter(Boolean);
      return `<li${cls.length ? ` class="${cls.join(' ')}"` : ''}>${esc(m.name)}</li>`;
    };
    const list = (members && members.length)
      ? members.map(li).join('')
      : '<li class="wi-lteamempty">noch niemand</li>';
    return `<div class="wi-lteam${o.mine ? ' wi-lteam--mine' : ''}" style="--wi-team:${T.color}">
              <div class="wi-lteampic"><img src="${esc(esrc(T.team || T.img))}" alt=""></div>
              <div class="wi-lteamname">
                <span>${esc(T.name)}</span>
                <span class="wi-lteamn">${o.count != null ? o.count : (members || []).length}</span>
              </div>
              <ul class="wi-lteamlist">${list}</ul>
            </div>`;
  }

  function fmtLeft(iso) {
    if (!iso) return '–';
    const s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /* Läuft unabhängig vom Takt: eine Restzeit, die nur alle vier
     Sekunden springt, sieht kaputt aus. */
  function startTimer() {
    stopTimer();
    timerHandle = setInterval(() => {
      if (!view) return;
      if (els.clock) els.clock.textContent = fmtLeft(view.ends_at);
      if (view.countdown_ends_at && view.phase === 'countdown') {
        const s = Math.max(0, Math.ceil((new Date(view.countdown_ends_at).getTime() - Date.now()) / 1000));
        if (els.big) els.big.textContent = s > 0 ? s : 'Los!';
        if (s <= 0) tick(true);
      }
    }, 250);
  }
  function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; }

  /* ══════════════════════════════════════════════════════════
     Pult
     ══════════════════════════════════════════════════════════
     Aufbau der Lobby von oben nach unten, wie in Kingdoms:
       Einstellungen (Segment-Schalter) → Kopfzeile mit den drei
       Knöpfen → Wappenreihe + gewählte Wörter → die Spalten der
       Völker → wer noch nicht dabei ist.
     Die Unit-Auswahl liegt in einem Fenster darüber: die Liste ist
     lang, und die Lobby soll ihre Übersicht behalten.            */
  const PULT_HTML = `
    <div class="wi wi--pult">
      <section class="wi-lobby" data-part="lobby">
        <div class="wi-setup">
          <div class="wi-modebar">
            <div class="wi-modegrp">
              <span class="wi-modelab">Abfrage</span>
              <div class="wi-modeseg" data-part="modeseg">
                <button type="button" class="wi-modebtn" data-mode="type">⌨️ Tippen mit Hilfe</button>
                <button type="button" class="wi-modebtn" data-mode="choice">🔤 Nur auswählen</button>
              </div>
            </div>
            <div class="wi-modegrp">
              <span class="wi-modelab">Richtung</span>
              <div class="wi-modeseg" data-part="dirseg">
                <button type="button" class="wi-modebtn" data-dir="mixed">gemischt</button>
                <button type="button" class="wi-modebtn" data-dir="de_en">Deutsch → Englisch</button>
                <button type="button" class="wi-modebtn" data-dir="en_de">Englisch → Deutsch</button>
              </div>
            </div>
            <div class="wi-modegrp wi-modegrp--wide">
              <span class="wi-modelab">Spieldauer</span>
              <div class="wi-levelrow" data-part="durrow"></div>
              <div class="wi-leveltext" data-part="durtext"></div>
            </div>
          </div>

          <div class="wi-setuphead">
            <h3 class="wi-setuptitle">Welche Völker?</h3>
            <button type="button" class="wi-btn wi-btn--ghost" data-part="setsbtn">📚 Wörter wählen</button>
            <button type="button" class="wi-btn wi-btn--ghost" data-part="shuffle">🔀 Völker mischen</button>
            <button type="button" class="wi-btn" data-part="start">⛵ Schiffe klarmachen</button>
          </div>

          <div class="wi-pickrow">
            <div class="wi-pick" data-part="pick"></div>
            <div class="wi-setsum" data-part="setsum"></div>
          </div>

          <div class="wi-lobbyteams" data-part="lobbyteams"></div>
          <div class="wi-waiting" data-part="waiting" hidden></div>
        </div>
      </section>

      <section class="wi-play" data-part="play" hidden>
        <header class="wi-bar">
          <div class="wi-teams" data-part="teams-row"></div>
          <div class="wi-clock"><b data-part="clock">–</b>
            <button class="wi-btn wi-btn--ghost" data-part="stop">Runde beenden</button></div>
        </header>
        <div class="wi-mapwrap" data-part="mapwrap"><svg class="wi-map" data-part="map"></svg></div>
        <div class="wi-big" data-part="big" hidden></div>
      </section>

      <section class="wi-end" data-part="end" hidden>
        <h2 data-part="winner"></h2>
        <div class="wi-teams" data-part="end-teams"></div>
        <div class="wi-card wi-hard">
          <h3>Diese Wörter sind der Klasse am häufigsten durchgegangen</h3>
          <div data-part="hard"></div>
        </div>
        <!-- Führt in die LOBBY, nicht in die nächste Runde (0134):
             zwischen zwei Runden ändert sich fast immer etwas, und
             gestartet wird dort mit „Schiffe klarmachen". -->
        <button class="wi-btn wi-btn--go" data-part="again">⚓ Neue Runde vorbereiten</button>
        <p class="wi-endhint">Zurück in die Lobby — dort lassen sich Wörter, Völker,
          Richtung und Dauer ändern. Gestartet wird von dort.</p>
      </section>

      <!-- Die Wörter-Auswahl. Ein Fenster über der Lobby, kein
           weiterer Abschnitt darin: die Listen sind lang, und die
           Lobby soll ihre Übersicht behalten. Muster wie .cm-poolov —
           das Overlay scrollt, der Kasten sitzt mit margin:auto
           darin (Regel: feedback_modal_viewport_pattern). -->
      <div class="wi-ov" data-part="setsov" hidden>
        <div class="wi-ovbox">
          <div class="wi-ovhead">
            <span class="wi-ovtitle">📚 Welche Wörter?</span>
            <button type="button" class="wi-ovclose" data-part="setsclose" aria-label="Auswahl schließen">✕</button>
          </div>
          <p class="wi-ovhint">Mehrere Listen lassen sich mischen — Wiederholung über zwei Themen
            ist der Normalfall. Mindestens eine muss gewählt sein.</p>
          <div class="wi-tabs" role="tablist">
            <button type="button" class="wi-tab is-on" data-tab="units">Units</button>
            <button type="button" class="wi-tab" data-tab="own">Eigene</button>
          </div>
          <div class="wi-ovbody">
            <div class="wi-sets" data-part="sets"></div>
            <form class="wi-import" data-part="import" hidden>
              <input class="wi-in" data-part="imp-title" maxlength="60" placeholder="Name der Liste, z. B. Unit 3">
              <textarea class="wi-in wi-ta" data-part="imp-text" rows="6"
                placeholder="Eine Zeile je Wortpaar:&#10;Haus - house&#10;der Schüler - pupil / student&#10;Tafel;board"></textarea>
              <button class="wi-btn" type="submit">Liste anlegen</button>
            </form>
          </div>
        </div>
      </div>
    </div>`;

  function q(part) { return root.querySelector(`[data-part="${part}"]`); }

  function buildPult() {
    root.innerHTML = PULT_HTML;
    els = {
      lobby: q('lobby'), play: q('play'), end: q('end'),
      sets: q('sets'), imp: q('import'),
      setsOv: q('setsov'), setSum: q('setsum'),
      modeSeg: q('modeseg'), dirSeg: q('dirseg'),
      durRow: q('durrow'), durText: q('durtext'),
      pick: q('pick'), lobbyTeams: q('lobbyteams'), waiting: q('waiting'),
      start: q('start'),
      teamsRow: q('teams-row'), clock: q('clock'), big: q('big'),
      map: q('map'), mapwrap: q('mapwrap'),
      winner: q('winner'), endTeams: q('end-teams'), hard: q('hard')
    };

    root.querySelectorAll('.wi-tab').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      root.querySelectorAll('.wi-tab').forEach(x => x.classList.toggle('is-on', x === b));
      els.imp.hidden = (tab !== 'own');
      renderSets();
    }));

    els.sets.addEventListener('click', onSetClick);
    els.imp.addEventListener('submit', onImport);

    /* ── Die Einstellungen ─────────────────────────────────────
       Ein Zuhörer je Behälter, nicht je Knopf: die Segmente werden
       bei jedem Takt neu gezeichnet, einzeln angeheftete Zuhörer
       wären damit jedes Mal weg. Dieselbe Bauweise wie in Kingdoms. */
    els.modeSeg.addEventListener('click', ev => {
      const b = ev.target.closest('.wi-modebtn');
      if (b) setNow({ mode: b.dataset.mode }, { p_mode: b.dataset.mode });
    });
    els.dirSeg.addEventListener('click', ev => {
      const b = ev.target.closest('.wi-modebtn');
      if (b) setNow({ direction: b.dataset.dir }, { p_direction: b.dataset.dir });
    });
    els.durRow.addEventListener('click', ev => {
      const b = ev.target.closest('.wi-levelbtn');
      if (b) setNow({ duration: +b.dataset.secs }, { p_duration: +b.dataset.secs });
    });
    els.pick.addEventListener('click', onPickClick);

    q('setsbtn').addEventListener('click', () => openSets());
    q('setsclose').addEventListener('click', () => closeSets());
    // Klick neben den Kasten schließt. Der Kasten selbst nicht, sonst
    // ginge das Fenster bei jeder gewählten Liste zu.
    els.setsOv.addEventListener('click', ev => { if (ev.target === els.setsOv) closeSets(); });

    q('shuffle').addEventListener('click', async () => {
      const r = await ctx.actions.call('wi_room_shuffle', {});
      if (!r.ok) return ctx.toast(ctx.errText(r.error));
      tick(true);
    });
    q('start').addEventListener('click', onStart);
    q('again').addEventListener('click', onBackToLobby);
    q('stop').addEventListener('click', async () => {
      if (!await ctx.confirm('Runde jetzt beenden?')) return;
      await ctx.actions.call('wi_room_end', {});
      tick(true);
    });

    attachPanZoom(els.mapwrap, els.map);
    loadSets();
  }

  function openSets() { setsOpen = true; els.setsOv.hidden = false; }
  function closeSets() { setsOpen = false; els.setsOv.hidden = true; }

  async function loadSets() {
    const r = await ctx.actions.call('wi_sets_list', {});
    if (!r || !r.ok) return;
    sets.list = r.sets || [];
    sets.chosen = (r.chosen || []).map(String);
    renderSets();
    renderSetSum();
  }

  function renderSets() {
    const mine = tab === 'own';
    const list = sets.list.filter(s => (s.mine === '1') === mine);
    if (!list.length) {
      els.sets.innerHTML = `<p class="wi-empty">${mine
        ? 'Noch keine eigene Liste. Füge unten eine ein — eine Zeile je Wortpaar.'
        : 'Keine mitgelieferten Units gefunden.'}</p>`;
      return;
    }
    els.sets.innerHTML = list.map(s => `
      <button class="wi-set${sets.chosen.includes(String(s.id)) ? ' is-on' : ''}"
              data-id="${esc(s.id)}">
        <b>${esc(s.title)}</b>
        <span>${s.count} Wörter${s.level ? ' · Klasse ' + esc(s.level) : ''}</span>
        ${mine ? `<i class="wi-del" data-del="${esc(s.id)}" title="Liste löschen">×</i>` : ''}
      </button>`).join('');
  }

  /* Die Kurzform neben den Wappen: welche Listen gewählt sind und wie
     viele Wörter zusammenkommen. Sie steht dort, wo in Kingdoms die
     Aufgabenarten stehen, und beantwortet dieselbe Frage über die
     Lobby hinweg: „was üben die gleich?"

     Ohne Wörter kein Spiel — dann sagt dieselbe Zeile auch, warum der
     Startknopf grau ist. */
  function renderSetSum() {
    if (!els.setSum) return;
    const chosen = sets.list.filter(s => sets.chosen.includes(String(s.id)));
    if (els.start) els.start.disabled = !sets.chosen.length;
    els.setSum.classList.toggle('wi-setsum--warn', !sets.chosen.length);
    if (!sets.chosen.length) {
      els.setSum.innerHTML = '<b>Keine Wörter gewählt</b>';
      return;
    }
    // Die Titel kennen wir nur, wenn die Liste schon da ist. Solange
    // nicht, steht die Zahl allein da — sie ist die ehrlichere
    // Auskunft als ein leerer Kasten.
    if (!chosen.length) {
      els.setSum.innerHTML = `<b>${sets.chosen.length} ${sets.chosen.length === 1 ? 'Liste' : 'Listen'}</b>`;
      return;
    }
    const words = chosen.reduce((n, s) => n + (parseInt(s.count, 10) || 0), 0);
    els.setSum.innerHTML =
      '<div class="wi-setsumgrp"><b>Wörter</b><span class="wi-setsumops">' +
        chosen.map(s => `<i>${esc(s.title)}</i>`).join('') +
      `</span></div><div class="wi-setsumn">${words} Wörter im Topf</div>`;
  }

  async function onSetClick(e) {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.preventDefault();
      if (!await ctx.confirm('Diese Liste endgültig löschen?')) return;
      const r = await ctx.actions.call('wi_set_delete', { p_id: del.dataset.del });
      if (!r.ok) return ctx.toast(ctx.errText(r.error));
      await loadSets();
      return;
    }
    const b = e.target.closest('.wi-set');
    if (!b) return;
    const id = b.dataset.id;
    sets.chosen = sets.chosen.includes(id)
      ? sets.chosen.filter(x => x !== id)
      : sets.chosen.concat(id);
    if (!sets.chosen.length) {
      // Ein Raum ohne Wörter ist kein Raum. Die letzte Unit lässt
      // sich deshalb nicht abwählen — nur durch eine andere
      // ersetzen.
      sets.chosen = [id];
      ctx.toast('Mindestens eine Liste muss gewählt sein.');
    }
    renderSets();
    renderSetSum();
    setsBusy++;
    await saveSetup({ p_sets: sets.chosen });
    setsBusy--;
  }

  /* Die Auswahl steht in JEDER Antwort des Servers (`sets`) — nicht
     nur in wi_sets_list. Sie hier zu übernehmen ist der Grund, warum
     die Kurzform neben den Wappen nach einem Neuladen sofort stimmt
     und nicht erst, wenn die Listen nachgeladen sind. Verglichen wird
     als MENGE: die Reihenfolge aus jsonb_agg ist beliebig, und ein
     Unterschied allein darin wäre keiner. */
  function syncSetsFromView(v) {
    if (setsBusy || !Array.isArray(v.sets)) return;
    const srv = v.sets.map(String).sort();
    if (srv.join(',') === sets.chosen.slice().sort().join(',')) return;
    sets.chosen = srv;
    renderSets();
  }

  async function onImport(e) {
    e.preventDefault();
    const title = q('imp-title').value.trim();
    const text  = q('imp-text').value;
    if (!title || !text.trim()) return ctx.toast('Name und Wortliste fehlen.');
    const r = await ctx.actions.call('wi_set_import', { p_title: title, p_text: text });
    if (!r.ok) {
      return ctx.toast(r.error === 'no_pairs'
        ? 'Keine Zeile war lesbar. Zwischen Wort und Übersetzung gehört „ - “, ein Semikolon oder ein Tabulator.'
        : ctx.errText(r.error));
    }
    q('imp-title').value = ''; q('imp-text').value = '';
    ctx.toast(r.bad
      ? `${r.added} Wörter übernommen, ${r.bad} Zeilen nicht verstanden.`
      : `${r.added} Wörter übernommen.`);
    await loadSets();
  }

  /* Sofort umschalten, den Server danach fragen. Ein Schalter, der
     eine halbe Sekunde nichts tut, wird ein zweites Mal gedrückt —
     und der zweite Druck ist dann der falsche. Geht der Aufruf
     schief, holt der nächste Takt die Wahrheit zurück. */
  function setNow(local, args) {
    if (view) { Object.assign(view, local); renderModes(view); }
    saveSetup(args);
  }

  async function saveSetup(args) {
    const r = await ctx.actions.call('wi_room_setup', args);
    if (!r.ok) ctx.toast(ctx.errText(r.error));
    tick(true);
  }

  /* ── Ein Volk an- oder abwählen (Migration 0133) ─────────────
     Sofort umschalten, ohne auf den Server zu warten: ein Klick, der
     eine halbe Sekunde nichts tut, wird ein zweites Mal geklickt.
     Solange die Antwort aussteht (pickBusy), darf ein
     dazwischenfunkender Takt die Auswahl nicht zurückdrehen — die
     Spalten darunter bleiben derweil auf dem Stand des Servers, weil
     ihre Verteilung nur von dort kommen kann. */
  async function onPickClick(ev) {
    const btn = ev.target.closest('.wi-pickbtn');
    if (!btn) return;
    const fac = parseInt(btn.dataset.fac, 10);
    if (!Number.isInteger(fac)) return;

    const on   = pickSel.indexOf(fac) >= 0;
    const next = on ? pickSel.filter(f => f !== fac) : pickSel.concat([fac]);
    if (next.length < 2) return ctx.toast('Mindestens zwei Völker müssen mitspielen.');
    if (next.length > TEAM_COUNT) return;
    next.sort((a, b) => a - b);   // dieselbe Ordnung, die der Server speichert

    pickSel = next;
    pickBusy++;
    renderPick();
    const r = await ctx.actions.call('wi_room_set_factions', { p_factions: next });
    pickBusy--;
    if (!r || !r.ok) {
      // fn_missing heißt hier immer dasselbe, und es lohnt sich, das
      // hinzuschreiben: die Wappenreihe ist die Oberfläche von
      // Migration 0133. Steht die nicht in der Datenbank, kann JEDER
      // Klick nur scheitern — und ohne diesen Satz sieht das aus wie
      // ein Netzproblem (Vorfall 08.09.2026).
      ctx.toast(r && r.error === 'fn_missing'
        ? 'Die Völker-Auswahl kennt der Server noch nicht: In der Datenbank fehlt '
          + 'Migration 0133. Bis dahin bleibt es bei der bisherigen Aufstellung.'
        : ctx.errText((r && r.error) || 'network'));
      if (!pickBusy) syncPickFromView(view);
      renderPick();
      return;
    }
    if (Array.isArray(r.factions)) {
      factions = r.factions;
      ownPainted = null;              // andere Völker, andere Farben
      if (!pickBusy) pickSel = r.factions.slice();
    }
    renderPick();
    tick(true);
  }

  function syncPickFromView(v) {
    if (!v) return;
    pickSel = (Array.isArray(v.factions) && v.factions.length)
      ? v.factions.slice()
      : Array.from({ length: v.team_count || 2 }, (_, i) => i);
  }

  /* Die sechs Wappen zum An- und Abwählen. Nicht Gewählte sind grau
     und blass, Gewählte tragen ihre Farbe und einen Schein — dieselbe
     Aussage wie in Kingdoms, nur mit sechs Völkern.
     `title` und `aria-label` tragen den Namen, den die Reihe
     absichtlich nicht hinschreibt: sechs Namen nebeneinander
     sprengen die Reihe, und der Name steht ohnehin unten an der
     Spalte. */
  function renderPick() {
    if (!els.pick) return;
    const locked = pickSel.length <= 2;
    let out = '';
    for (let f = 0; f < TEAM_COUNT; f++) {
      const on = pickSel.indexOf(f) >= 0;
      out += `<button type="button" class="wi-pickbtn${on ? ' is-on' : ''}" ` +
        `data-fac="${f}" aria-pressed="${on}" aria-label="${esc(TEAMS[f].name)}" ` +
        `title="${esc(TEAMS[f].name)}" style="--wi-team:${TEAMS[f].color}"` +
        `${on && locked ? ' data-locked="1"' : ''}>` +
        `<img src="${esc(esrc(TEAMS[f].img))}" alt=""></button>`;
    }
    els.pick.innerHTML = out;
  }

  function renderModes(v) {
    els.modeSeg.querySelectorAll('.wi-modebtn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.mode === v.mode));
    els.dirSeg.querySelectorAll('.wi-modebtn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.dir === v.direction));

    els.durRow.innerHTML = DURATIONS.map(s =>
      `<button type="button" class="wi-levelbtn${s === v.duration ? ' is-on' : ''}" ` +
      `data-secs="${s}" aria-pressed="${s === v.duration}">${s / 60}</button>`).join('');
    els.durText.textContent = durText(v);
  }

  /* Der Satz unter der Dauer wird ERZEUGT, nicht getippt: die Größe
     der Insel folgt aus Kinderzahl und Dauer (wi_build_island, 1,6
     Felder je Kind und Minute, gedeckelt auf 80..900). Stünde hier
     eine feste Zahl, liefe sie beim ersten Nachjustieren des Faktors
     im Server auseinander. */
  function durText(v) {
    const min = Math.round((v.duration || 600) / 60);
    const kids = (v.people || []).length;
    const tiles = Math.round(Math.max(80, Math.min(900, Math.max(kids, 4) * 1.6 * min)));
    return `${min} Minuten` + (kids
      ? ` — bei ${kids} ${kids === 1 ? 'Kind' : 'Kindern'} eine Insel aus etwa ${tiles} Feldern.`
      : ' — die Größe der Insel folgt aus Dauer und Zahl der Kinder.') +
      ' Der Nebel ist nach knapp der halben Zeit weg; danach nimmt man sich Land.';
  }

  /* Eine Spalte je Volk, nebeneinander. Ein Volk ohne Anwesende
     bleibt stehen: es SPIELT mit, es ist nur noch niemand da. */
  function renderLobbyTeams(v) {
    const people = v.people || [];
    let out = '';
    for (let slot = 0; slot < v.team_count; slot++) {
      const mine = people.filter(p => p.team === slot);
      out += teamColHTML(slot, mine.map(p => ({ name: p.name, online: p.online !== false })));
    }
    els.lobbyTeams.innerHTML = out;
  }

  /* Wer noch kein Volk hat und wer gerade nicht am Tablet ist. Zwei
     Sätze, eine Zeile — und beide sagen ausdrücklich, dass niemand
     dadurch außen vor bleibt: wi_room_start verteilt alle Teilnehmer
     des Raums, anders als in Kingdoms. Die Zeile verschwindet ganz,
     wenn es nichts zu sagen gibt; eine leere Überschrift wäre nur
     Lärm. */
  function renderWaiting(v) {
    const people = v.people || [];
    const ohne = people.filter(p => p.team == null);
    const off  = people.filter(p => p.team != null && p.online === false);
    if (!ohne.length && !off.length) {
      els.waiting.hidden = true;
      els.waiting.innerHTML = '';
      return;
    }
    let out = '';
    if (ohne.length) {
      out += `<span class="wi-waitlabel">Noch ohne Volk (${ohne.length}) — beim Start werden sie mit verteilt:</span>` +
        ohne.map(p => `<span class="wi-waitname">${esc(p.name)}</span>`).join('');
    }
    if (off.length) {
      out += `<span class="wi-waitlabel">Gerade nicht am Tablet (${off.length}) — sie spielen trotzdem mit:</span>` +
        off.map(p => `<span class="wi-waitname">${esc(p.name)}</span>`).join('');
    }
    els.waiting.hidden = false;
    els.waiting.innerHTML = out;
  }

  /* Aus der Auswertung zurück in die Lobby (Migration 0134). Nicht
     „neu starten": zwischen zwei Runden wird fast immer etwas
     geändert, und die Insel steht erst, wenn jemand ausdrücklich
     „Schiffe klarmachen" drückt.

     mapKey auf null, weil der Server die Insel abräumt — sonst
     bliebe die alte Karte im SVG stehen, bis die nächste Runde
     einen neuen map_key bringt. */
  async function onBackToLobby() {
    const r = await ctx.actions.call('wi_room_to_lobby', {});
    if (!r.ok) {
      return ctx.toast(
        r.error === 'round_running' ? 'Die Runde läuft noch — beende sie zuerst.'
      : r.error === 'fn_missing'    ? 'Der Weg zurück in die Lobby kennt der Server noch nicht: '
                                      + 'In der Datenbank fehlt Migration 0134.'
      : ctx.errText(r.error));
    }
    mapKey = null;
    tick(true);
  }

  async function onStart() {
    const r = await ctx.actions.call('wi_room_start', {});
    if (!r.ok) {
      return ctx.toast(r.error === 'no_sets'
        ? 'Wähle zuerst mindestens eine Wortliste.'
        : ctx.errText(r.error));
    }
    mapKey = null;              // neue Runde = neue Insel
    tick(true);
  }

  function renderPult(v) {
    const lobby = (v.phase === 'lobby');
    const ended = (v.phase === 'ended');
    els.lobby.hidden = !lobby;
    els.play.hidden  = lobby || ended;
    els.end.hidden   = !ended;
    // Ein Fenster, das beim Start offen stünde, böte Knöpfe an, die
    // der Server ablehnt.
    if (!lobby && setsOpen) closeSets();

    if (lobby) {
      renderModes(v);
      if (!pickBusy) { syncPickFromView(v); renderPick(); }
      renderLobbyTeams(v);
      renderWaiting(v);
      syncSetsFromView(v);
      renderSetSum();
      return;
    }

    if (ended) {
      const win = (v.teams || []).find(t => t.i === v.winner_team);
      els.winner.innerHTML = win
        ? `<img src="${esc(esrc(teamOf(win.i).img))}" alt="">
           ${esc(teamOf(win.i).name)} — ${win.score} Punkte`
        : 'Runde beendet.';
      els.endTeams.innerHTML = teamRow(v);
      loadHard();
      return;
    }

    els.teamsRow.innerHTML = teamRow(v);
    els.clock.textContent = fmtLeft(v.ends_at);
    els.big.hidden = (v.phase !== 'countdown');
  }

  async function loadHard() {
    const r = await ctx.actions.call('wi_hard_words', {});
    if (!r || !r.ok) return;
    els.hard.innerHTML = r.words.length
      ? r.words.map(w => `<div class="wi-hardrow">
            <b>${esc(w.term)}</b><span>${esc(w.trans)}</span>
            <i>${w.wrong}× daneben</i></div>`).join('')
      : '<p class="wi-empty">Nichts ist reihenweise schiefgegangen — schöner Tag.</p>';
  }

  /* ══════════════════════════════════════════════════════════
     Tablet
     ══════════════════════════════════════════════════════════
     Vier Tafeln, wie in Kingdoms: warten · Countdown · spielen ·
     (üben). Die Wartetafel zeigt das EIGENE Volk groß und mit den
     Namen der Gruppe — vor dem Start ist das die einzige Auskunft,
     die am Tablet wirklich zählt; die anderen Völker stehen als
     schmale Zeile darunter.

     Das Üben bleibt erreichbar (die Einzelübung läuft im Server
     ohnehin weiter), aber es steht hinter einem Knopf: wer eine
     Aufgabe vor der Nase hat, sieht nicht mehr, wo er hingehört. */
  const TAB_HTML = `
    <div class="wi wi--tab">
      <section class="wi-pane wi-pane--lobby" data-part="tlobby" hidden>
        <div class="wi-wait"><span class="wi-waitdots"><i></i><i></i><i></i></span>
          <span data-part="waittext">Warten auf den Spielstart …</span></div>
        <div class="wi-myteamwrap" data-part="myteam"></div>
        <div class="wi-others" data-part="othersbox" hidden>
          <div class="wi-otherslabel">Diese Völker landen mit euch</div>
          <div class="wi-otherlist" data-part="others"></div>
        </div>
        <p class="wi-hint" data-part="onlinehint" hidden></p>
        <button type="button" class="wi-btn wi-btn--ghost" data-part="practice">Bis dahin üben</button>
      </section>

      <section class="wi-pane wi-pane--count" data-part="tcount" hidden>
        <div class="wi-countnum" data-part="big">5</div>
        <p class="wi-hint">Gleich geht’s los …</p>
      </section>

      <section class="wi-pane" data-part="tplay" hidden>
        <header class="wi-me" data-part="me"></header>

        <section class="wi-task" data-part="task">
          <p class="wi-ask" data-part="ask"></p>
          <p class="wi-word" data-part="word"></p>
          <!-- Kein <form> und kein <input>: warum, steht bei
               feldBauen() weiter oben. -->
          <div class="wi-type" data-part="typeform">
            <span class="wi-in" data-part="input" contenteditable="true"
                  role="textbox" aria-label="Antwort" data-ph="Antwort"
                  autocapitalize="off" autocorrect="off" spellcheck="false"
                  enterkeyhint="send" inputmode="text"></span>
            <button class="wi-btn" type="button" data-part="typego">Prüfen</button>
          </div>
          <div class="wi-opts" data-part="opts" hidden></div>
          <p class="wi-fb" data-part="fb" hidden></p>
          <button type="button" class="wi-btn wi-btn--ghost wi-back" data-part="back" hidden>
            ← Zurück zur Aufstellung</button>
        </section>

        <div class="wi-pickbar" data-part="pickbar" hidden></div>
        <div class="wi-mapwrap" data-part="mapwrap"><svg class="wi-map" data-part="map"></svg></div>
      </section>
    </div>`;

  function buildTab() {
    root.innerHTML = TAB_HTML;
    els = {
      tlobby: q('tlobby'), tcount: q('tcount'), tplay: q('tplay'),
      waitText: q('waittext'), myTeam: q('myteam'),
      othersBox: q('othersbox'), others: q('others'), onlineHint: q('onlinehint'),
      big: q('big'), back: q('back'),
      me: q('me'), ask: q('ask'), word: q('word'),
      form: q('typeform'), input: q('input'), opts: q('opts'), fb: q('fb'),
      pickbar: q('pickbar'), map: q('map'), mapwrap: q('mapwrap')
    };

    feldBauen(els.input, send);
    feldKnopf(q('typego'), els.input, send);
    els.opts.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) send(b.dataset.v);
    });
    q('practice').addEventListener('click', () => { practice = true; if (view) renderTab(view); });
    els.back.addEventListener('click', () => { practice = false; if (view) renderTab(view); });
    els.map.addEventListener('click', onMapClick);
    attachPanZoom(els.mapwrap, els.map);
  }

  async function send(value) {
    if (submitting) return;
    submitting = true;
    feldZu(els.input, true);
    try {
      const r = await ctx.actions.call('wi_answer', { p_input: value });
      if (!r.ok) {
        if (r.error === 'too_fast') {
          feedback('warn', `Kurz durchatmen — noch ${r.locked_for} Sekunden.`);
          lockInput(r.locked_for);
        } else {
          ctx.toast(ctx.errText(r.error));
        }
        return;
      }

      if (r.result === 'spell') {
        feedback('near', 'Fast! Welche Schreibweise stimmt?');
      } else if (r.result === 'choice') {
        feedback('warn', 'Welches Wort ist es?');
      } else if (r.result === 'correct') {
        feedback('ok', r.tile ? 'Richtig — ein Feld ist frei!' : 'Richtig!');
      } else {
        feedback('bad', 'Es heißt: ' + r.solution);
        lockInput(r.locked_for);
      }

      if (view) {
        view.me.task   = r.task;
        view.me.streak = r.streak;
        view.me.picks  = r.picks;
      }
      feldLeer(els.input);
      renderTask(r.task, r.streak, r.picks);
      // Die Karte hat sich bewegt — sofort nachfragen, nicht bis
      // zum nächsten Takt warten. Ein Feld, das vier Sekunden
      // später auftaucht, gehört gefühlt zur nächsten Antwort.
      if (r.result === 'correct') tick(true);
    } finally {
      submitting = false;
      if (!els.input.dataset.locked) feldZu(els.input, false);
      feldHer(els.input);
    }
  }

  function lockInput(secs) {
    if (!secs) return;
    feldZu(els.input, true);
    els.input.dataset.locked = '1';
    setTimeout(() => {
      if (destroyed || !els.input) return;
      delete els.input.dataset.locked;
      feldZu(els.input, false);
      feldHer(els.input);
    }, secs * 1000);
  }

  function feedback(kind, text) {
    els.fb.hidden = false;
    els.fb.className = 'wi-fb is-' + kind;
    els.fb.textContent = text;
  }

  function renderTask(task, streak, picks) {
    const has = task && task.prompt;
    els.ask.textContent = !has ? ''
      : (task.dir === 'en_de' ? 'Wie heißt das auf Deutsch?' : 'Wie heißt das auf Englisch?');
    els.word.textContent = has ? task.prompt : 'Keine Wörter gewählt.';

    const opts = (has && task.options) || [];
    els.opts.hidden = !opts.length;
    els.form.hidden = !has || opts.length > 0;
    if (opts.length) {
      els.opts.innerHTML = opts
        .map(o => `<button type="button" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    }

    /* Dieselbe Leiste trägt zwei Sachen, und das ist Absicht: sie ist
       der Ort, an dem die Serie sichtbar wird. Erst zählt sie hin
       („noch 2"), dann fordert sie auf („zeig, wohin"). Zwei
       getrennte Kästen hätten einen davon immer leer stehen lassen. */
    const goal = Math.max(0, STREAK_GOAL - (streak || 0));
    els.pickbar.hidden = !(picks > 0 || (streak > 0 && goal > 0));
    els.pickbar.classList.toggle('is-pick', picks > 0);
    if (picks > 0) {
      els.pickbar.innerHTML =
        `<b>Zeig, wohin!</b> Tipp auf ein Feld an eurem Rand${picks > 1 ? ` (${picks} frei)` : ''}.`;
    } else if (streak > 0 && goal > 0) {
      els.pickbar.innerHTML =
        `Serie ${streak} — noch ${goal} richtige, dann zeigst du selbst, welches Feld fällt.`;
    }
    picking = picks > 0;
    els.map.classList.toggle('is-picking', picking);
  }

  /* Die anderen Völker: Bild, Name, Kopfzahl. Mehr nicht — wer sonst
     noch mitspielt, ist eine Nebeninformation, und die NAMEN der
     anderen Kinder bekommt das Tablet gar nicht erst (0133). */
  function othersHTML(v, myTeam) {
    let out = '';
    (v.teams || []).forEach(t => {
      if (t.i === myTeam) return;
      const T = teamOf(t.i);
      out += `<div class="wi-other" style="--wi-team:${T.color}">
                <div class="wi-otherpic"><img src="${esc(esrc(T.img))}" alt=""></div>
                <span class="wi-othername">${esc(T.name)}</span>
                <span class="wi-othern">${t.people}</span>
              </div>`;
    });
    return out;
  }

  function renderTabLobby(v) {
    const myTeam = v.me.team;
    const mine = (v.teams || []).find(t => t.i === myTeam);
    els.waitText.textContent = (v.phase === 'ended')
      ? 'Runde vorbei — warten auf die nächste …'
      : 'Warten auf den Spielstart …';

    // myTeam ist für den Aufrufer praktisch immer gesetzt (wer
    // wi_view aufruft, ist per Definition online) — die Prüfung ist
    // trotzdem defensiv, statt eine Spalte in der Farbe von „Volk
    // NaN" zu zeichnen.
    els.myTeam.innerHTML = (myTeam == null)
      ? '<p class="wi-hint">Dein Volk bekommst du gleich zugeteilt.</p>'
      : teamColHTML(myTeam, v.my_team_members || [],
                    { mine: true, count: mine ? mine.people : null });

    els.others.innerHTML = othersHTML(v, myTeam);
    els.othersBox.hidden = ((v.teams || []).length <= (myTeam == null ? 0 : 1));

    // Der leere Absatz muss WEG, nicht nur leer sein: die Tafel ist
    // eine Flex-Spalte mit Abstand, ein leerer Absatz darin wäre eine
    // sichtbare Lücke unter der Liste.
    const hint = (v.online_count != null && v.room_total != null && v.room_total > v.online_count)
      ? `${v.online_count} von ${v.room_total} im Raum sind gerade am Tablet — beim Start sind alle dabei.`
      : '';
    els.onlineHint.textContent = hint;
    els.onlineHint.hidden = !hint;
  }

  function renderTab(v) {
    const arena = (v.phase === 'running');
    const count = (v.phase === 'countdown');
    // Ein Phasenwechsel beendet das Üben: nach dem Ende einer Runde
    // soll die Klasse wieder auf dieselbe Tafel sehen.
    if (v.phase !== lastPhase) { practice = false; lastPhase = v.phase; }

    const showPlay = arena || (!count && practice);
    els.tlobby.hidden = arena || count || practice;
    els.tcount.hidden = !count;
    els.tplay.hidden  = !showPlay;
    if (count) return;          // fünf Sekunden nur die Zahl
    if (!showPlay) { renderTabLobby(v); return; }

    const T = teamOf(v.me.team);
    const mine = (v.teams || []).find(t => t.i === v.me.team);

    els.me.style.setProperty('--wi-team', T.color);
    els.me.innerHTML = `
      <img src="${esc(esrc(T.img))}" alt="">
      <div>
        <b>${esc(T.name)}</b>
        <span>${arena ? `${mine ? mine.score : 0} Punkte · Serie ${v.me.streak}` : 'Übungsrunde'}</span>
      </div>
      <span class="wi-time">${arena ? fmtLeft(v.ends_at) : ''}</span>`;

    els.mapwrap.hidden = !arena;
    els.back.hidden = arena;
    if (!arena && els.fb.hidden) {
      feedback('idle', 'Die Arena läuft gerade nicht — üben kannst du trotzdem.');
    }
    renderTask(v.me.task, v.me.streak, v.me.picks);
    if (v.me.locked_for > 0) lockInput(v.me.locked_for);
  }

  async function onMapClick(e) {
    if (!picking) return;
    const cell = e.target.closest('.wi-cell');
    if (!cell) return;
    const r = await ctx.actions.call('wi_pick_tile',
      { p_r: +cell.dataset.r, p_c: +cell.dataset.c });
    if (!r.ok) {
      ctx.toast(r.error === 'not_reachable'
        ? 'Das Feld grenzt nicht an euer Gebiet.'
        : r.error === 'tile_busy'
          ? 'Zu spät — da war gerade jemand anders.'
          : ctx.errText(r.error));
      return;
    }
    if (view) view.me.picks = r.picks;
    renderTask(view && view.me.task, view && view.me.streak, r.picks);
    tick(true);
  }

  /* ══════════════════════════════════════════════════════════
     Takt
     ══════════════════════════════════════════════════════════ */
  async function tick(force) {
    if (destroyed || busy) return;
    if (!force && document.hidden) return;
    busy = true;
    try {
      const fn = role === 'presenter' ? 'wi_room_get' : 'wi_view';
      // Die Karte nur holen, wenn wir sie brauchen: beim ersten Mal
      // und nach jeder neuen Runde.
      const v = await ctx.actions.call(fn, { p_full: (mapKey === null) });
      if (destroyed || !v) return;
      if (!v.ok) {
        // Netzfehler und room_gone unterscheiden sich hier nicht in
        // der Behandlung: beim nächsten Takt noch einmal. Eine
        // Meldung je Takt wäre eine Meldung alle vier Sekunden.
        return;
      }
      applyView(v);
    } finally {
      busy = false;
    }
  }

  function applyView(v) {
    view = v;

    // Erst die Völker, dann alles, was Farben und Namen daraus zieht.
    if (Array.isArray(v.factions) && v.factions.length &&
        v.factions.join(',') !== factions.join(',')) {
      factions = v.factions.slice();
      ownPainted = null;      // dieselben Slots, andere Farben
    }

    /* Eine Antwort MIT `map` ist die Antwort auf unsere Frage danach —
       auch wenn die Liste leer ist. Genau das ist der Zustand der
       Lobby: das Board steht, die Insel wird erst beim Start
       gewürfelt. Stünde hier `v.map.length`, fiele die leere Liste in
       den Zweig darunter, forderte die Karte wieder an, bekäme wieder
       eine leere — und käme nie bis zum Zeichnen: die Lobby am Pult
       bliebe leer, solange in dem Raum noch keine Runde lief. */
    if (Array.isArray(v.map)) {
      cells = v.map;
      /* Der `map_key` geht mit hinein: aus ihm würfelt die Karte
         ihr Gelände (Wald, Fels, Strandbreite). Gleiche Runde →
         gleiche Insel auf jedem Tablet und am Beamer. */
      buildMap(els.map, cells, v.map_key);
      mapKey = v.map_key;
    } else if (v.map_key && v.map_key !== mapKey) {
      // Neue Insel, aber wir haben nur die Besitzverhältnisse: die
      // Karte muss nachgefordert werden. Passiert genau einmal je
      // Runde.
      //
      // Der Nachschlag geht über setTimeout und nicht direkt: wir
      // stecken hier IM Takt, und `busy` ist noch gesetzt — ein
      // tick() von hier aus fiele lautlos durch die eigene Sperre,
      // und die neue Insel käme erst beim übernächsten Takt.
      mapKey = null;
      setTimeout(() => tick(true), 0);
      return;
    }
    if (mapKey) paintOwn(v.own);

    if (role === 'presenter') renderPult(v); else { renderTab(v); soloClaim(); }
  }

  /* ─── Der Haken zur eigenen Insel (Migration 0136) ──────────
     Wer in diesem Raum sitzt, bekommt dessen Units auf seine eigene
     Insel — als Eier, additiv, über Schuljahre und Lehrkräfte
     hinweg. Das ist der ganze Mechanismus; alles Weitere passiert
     auf insel.html.

     Zeitgesteuert und nicht ereignisgesteuert, und das hat einen
     Grund: eine Lehrkraft darf ihre Units MITTEN in der Runde
     wechseln (wi_room_setup), das Tablet erfährt davon aber nichts
     — in wi_view steht kein Unit-Merkmal. Eine Signatur dafür
     müsste in wi_view hinein, und dessen Neufassung wäre eine
     Kopie der Fassung aus 0134 samt allem, was seither daran
     hängt. Ein idempotenter Aufruf alle anderthalb Minuten ist der
     billigere Preis: neben dem Vier-Sekunden-Takt fällt er nicht
     auf, und eine nachgereichte Unit ist spätestens dann da.

     Fehler werden geschluckt und geloggt. Die Runde darf daran
     nicht hängen — und wenn 0136 noch nicht eingespielt ist, soll
     ein Kind, das gerade spielt, davon gar nichts merken. */
  const SOLO_CLAIM_MS = 90000;
  let soloClaimAt = 0;

  function soloClaim() {
    if (role !== 'participant' || !window.MPRoom) return;
    const now = Date.now();
    if (now - soloClaimAt < SOLO_CLAIM_MS) return;
    soloClaimAt = now;

    ctx.actions.call('wi_solo_claim', { p_solo: window.MPRoom.soloToken() })
      .then(r => {
        if (!r || !r.ok) {
          if (r && r.error !== 'fn_missing') console.warn('[wordisland] Insel-Haken:', r.error);
          return;
        }
        /* Frisch vergebener Token: ohne ihn findet niemand diese
           Insel je wieder. Bei einem angemeldeten Kind ist er null
           — dort führt das Konto zur Insel, und rememberSolo legt
           dann bewusst nichts ab. */
        if (r.token) window.MPRoom.rememberSolo(r.token);
      })
      .catch(e => console.warn('[wordisland] Insel-Haken:', e.message));
  }

  /* ══════════════════════════════════════════════════════════
     DIE EIGENE INSEL  ·  Rolle `solo`  (Migration 0136)
     ══════════════════════════════════════════════════════════
     Ab hier ist kein Raum mehr. Ein Kind öffnet MPSkills/insel.html,
     sieht seine Insel und übt darauf die Units, die ihm Lehrkräfte
     über die Jahre freigespielt haben.

     Die Metapher ist EINE Zeile lang: jede Vokabel ist ein Tier, und
     seine Stufe ist ihr Lernstand.

       0  Ei              liegt da und wippt
       1  geschlüpft      läuft
       2  gewachsen       läuft, größer
       3  ausgewachsen    FLIEGT, darf die Insel verlassen
       4  funkelnd        wie 3, dazu Funken — kein eigenes Bild

     ── Warum eine Leinwand und kein SVG ──────────────────────
     400 Tiere, die alle laufen, wären 400 SVG-Knoten, deren
     Attribute sechzigmal je Sekunde neu geschrieben werden. Das
     hält kein iPad. Auf einer Leinwand ist ein Tier ein
     drawImage — und die acht Farbfassungen jedes Bildes werden
     EINMAL beim Start gerechnet statt in jedem Bild.

     Die Karte darunter bleibt ein SVG (dieselbe wie im Raum, nur
     ohne Nebel/Flaggen/Orte/Schiffe). Beide werden von DERSELBEN
     Kamera bewegt: das SVG per CSS-transform, die Leinwand, indem
     sie ihre Tiere je Bild an der gerechneten Stelle malt. Deshalb
     bleiben die Tiere beim Hineinzoomen scharf.

     ── Der Prüfstand ─────────────────────────────────────────
     Die Vorlage für alles ab hier ist solo-showroom.html. Sie
     bleibt liegen und beantwortet weiter die eine Frage, die man
     nicht ausrechnen kann: sieht die Insel mit 500 Tieren noch nach
     Insel aus? Was hier steht, ist ihr Inhalt ohne die Reglertafel
     — und mit einem Server statt mit Zufallszahlen.
     ══════════════════════════════════════════════════════════ */

  /* ─── Die Bilder ────────────────────────────────────────────
     Neun Vorlagen, alle auf DEMSELBEN Blatt gezeichnet: gemeinsame
     Grundlinie, gemeinsamer Maßstab. Daraus folgt die Regel, an der
     der erste Anlauf gescheitert ist: verkleinert wird mit dem
     BLATT und nicht mit dem einzelnen Tier — sonst wächst die
     zusammengerollte Schlaf-Echse beim Einschlafen auf die Größe
     der stehenden.

     Die Zahlen darunter kommen aus dem Zuschnitt und werden von
     tools/solosprites.mjs HINEINGESCHRIEBEN. Von Hand geändert
     stehen sie beim nächsten Zuschnitt falsch da, und ein Tier, das
     um sechs Bildpunkte im Boden steckt, sucht man lange. */
  const TIER_DIR = 'tools/wordisland/sprites/tier/';

  /* ERZEUGT VON tools/solosprites.mjs — nicht von Hand ändern */
  const ECHSE = {
    blatt: { w: 312.6, h: 340, ankerX: 159.81, ankerY: 290.12 },
    bilder: {
      ei:    { x: 118.37, y: 177.73, w:  89, h: 113 },
      s1:    { x:  88.51, y: 181.94, w: 146, h: 109 },
      s1z:   { x: 108.18, y: 191.43, w: 130, h: 110 },
      s2:    { x:   28.8, y: 110.29, w: 252, h: 179 },
      s2z:   { x:  11.94, y: 177.38, w: 290, h: 123 },
      s3a:   { x:  35.83, y:  32.31, w: 247, h: 224 },
      s3az:  { x:  16.51, y: 170.35, w: 282, h: 122 },
      s3b:   { x:  35.48, y:  26.69, w: 248, h: 282 },
      s3bz:  { x:  54.09, y: 166.49, w: 226, h: 131 }
    }
  };
  /* ENDE ERZEUGT */

  const BILDER = ['ei', 's1', 's1z', 's2', 's2z', 's3a', 's3az', 's3b', 's3bz'];

  /* Die acht Farben als ZIEL-Farbton in Grad; die Vorlage liegt bei
     rund 95° (dieses Grün). Der erste Eintrag lässt das Bild in
     Ruhe — eine der acht Echsen soll aussehen wie die gezeichnete. */
  const FARBEN = [
    { name: 'Grün', h: 95, orig: true }, { name: 'Türkis', h: 165 },
    { name: 'Blau', h: 208 },  { name: 'Violett', h: 264 },
    { name: 'Magenta', h: 312 }, { name: 'Koralle', h: 352 },
    { name: 'Orange', h: 26 },   { name: 'Gold', h: 52 }
  ];
  const BASIS_H = 95;

  /* Wie breit das BLATT einer Stufe im Gelände ist, in Kacheln — und
     nicht, wie hoch das Tier ist. Eine Stufe hat EINEN Maßstab, und
     wie groß das Tier darin erscheint, entscheidet die Zeichnung. */
  const STUFE_EINHEIT = [1.75, 1.90, 2.05, 2.25, 2.25];
  /* Ein gemeinsamer Faktor über ALLE Stufen — er verschiebt die
     Verhältnisse also nicht. Die Zahl kommt aus dem Solo-Showroom
     (Regler „Größe der Tiere"): dort hat Sönke die Insel eingestellt,
     hier steht das Ergebnis. Vier Zahlen gehören zusammen und stehen
     deshalb beieinander: GROESSE, TAG_SEK, GLOW_STAERKE, NACHT_TIEFE. */
  const TIER_GROESSE = .75;
  /* Wie hoch ein Flieger schwebt. Klein, weil die Vorlage von
     Echse3a den Abstand schon enthält — hier kommt nur dazu, was
     BEWEGUNG ist. */
  const FLUG_HOEHE = .55;
  const LAUF_TEMPO = [0, .30, .40, 0, 0];
  const FLUG_TEMPO = 1.15;
  /* Wie stark eine Stufe bei Nacht leuchtet. Bewusst ungleichmäßig:
     von 1 auf 2 soll man einen Unterschied ahnen, von 2 auf 3 soll
     man ihn SEHEN. Eine gleichmäßige Rampe wäre keine Auskunft. */
  const GLUEHEN = [0, .20, .42, 1.00, 1.35];
  /* Wie viele Funken je Stufe steigen. Auch das ist Auskunft und
     keine Zierde — „geschafft" soll man von weitem sehen. */
  const FUNKEN = [0, 2, 3, 5, 9];
  /* Wie stark das Leuchten insgesamt ausfällt (Showroom-Regler
     „Leuchtstärke"). Er sitzt hier und nicht in GLUEHEN, weil die
     Tabelle das VERHÄLTNIS der Stufen festlegt und diese Zahl die
     Lautstärke — zwei Fragen, zwei Regler. */
  const GLOW_STAERKE = 2.0;

  /* Ein Tag-und-Nacht-Umlauf. Aus dem Solo-Showroom übernommen
     („Runde dauert", „Dunkelheit der Karte"): rund halb so lang wie
     der erste Entwurf, dafür wird die Nacht deutlicher — sonst
     wartet man eine Minute darauf, dass die Insel etwas erzählt. */
  const TAG_SEK = 80;
  const NACHT_TIEFE = .85;

  /* ─── Wie die Insel wächst ──────────────────────────────────
     Die Hauptinsel steht immer. Die sechs Satelliten tauchen nach
     Wortzahl auf — dadurch wächst die Welt mit dem Wortschatz,
     ohne dass sich die Hauptinsel je umformt.

     Das ist der Kern: `wuerfelInseln` setzt die Inseln in FESTER
     Reihenfolge, gezeigt werden die ersten k. Damit ist das
     Wachsen von allein monoton — eine Insel, die sich beim
     Dazulernen umformt, wäre nicht mehr die eigene.

     Die Schwellen sind Richtwerte und ausdrücklich zum Drehen da:
     eine Unit hat rund 30 Wörter, die erste Insel kommt also nach
     zwei Units. */
  const SAT_SCHWELLEN = [60, 140, 240, 360, 500, 660];

  /* Wie viele Felder die Hauptinsel hat und wie groß die Satelliten
     werden. In FELDERN und nicht in Radien (siehe blobMitZiel). */
  const HAUPT_FELDER = [200, 220];
  const SAT_FELDER = [25, 60];
  const WASSER = 2.6;      // offenes Wasser zwischen zwei Küsten
  const AUSSEN = 1.05;     // blobCells lenkt den Radius um bis zu +5 % aus

  /* ─── Farben rechnen ────────────────────────────────────────── */
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) { const v = l * 255; return [v, v, v]; }
    const q = l < .5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
  }

  function neuCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }

  function ladeBild(src) {
    return new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error('Bild fehlt: ' + src));
      im.src = src;
    });
  }

  /* Acht eingefärbte Fassungen eines Bildes, luminanzerhaltend.

     Der Farbton wird gedreht, die Helligkeit bleibt — und zwar
     gewichtet:

       · nach Sättigung: was fast grau ist, bleibt grau. Sonst
         bekämen die weißen Augäpfel und der helle Bauch einen
         Farbstich.
       · nach Helligkeit: was sehr dunkel ist, bleibt dunkel und
         unbunt. Das ist der braune Umriss — und er ist es, der die
         Zeichnung zusammenhält. Dreht man ihn mit, sieht das Tier
         bei Violett aus wie ein Aufkleber.

     Der eingebaute `hue-rotate`-Filter wäre eine Zeile, aber eine
     Näherung mit einer Matrix: er nimmt Umriss und Augen mit und
     verschiebt nebenbei die Helligkeit. Der Prüfstand hat beide
     Verfahren nebeneinander gezeigt; hier steht das gewählte.

     Das Farbmodell wird EINMAL je Bild gerechnet und danach nur
     noch zusammengesetzt — andersherum wäre es achtmal dieselbe
     Arbeit. */
  function faerbeSatz(basis) {
    const w = basis.width, h = basis.height;
    const bx = basis.getContext('2d', { willReadFrequently: true });
    const src = bx.getImageData(0, 0, w, h);

    const n = w * h;
    const H = new Float32Array(n), S = new Float32Array(n),
          L = new Float32Array(n), W = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      if (src.data[p + 3] < 4) { W[i] = -1; continue; }
      const [hh, ss, ll] = rgb2hsl(src.data[p], src.data[p + 1], src.data[p + 2]);
      H[i] = hh; S[i] = ss; L[i] = ll;
      const wS = Math.min(1, Math.max(0, (ss - .10) / .18));
      const wL = Math.min(1, Math.max(0, (ll - .26) / .16)) * Math.min(1, Math.max(0, (.985 - ll) / .05));
      W[i] = wS * wL;
    }

    return FARBEN.map(f => {
      const c = neuCanvas(w, h);
      const x = c.getContext('2d');
      if (f.orig) { x.drawImage(basis, 0, 0); return c; }
      const out = x.createImageData(w, h);
      const delta = f.h - BASIS_H;
      for (let i = 0; i < n; i++) {
        const p = i * 4;
        out.data[p + 3] = src.data[p + 3];
        if (W[i] < 0) continue;
        const wgt = W[i];
        if (wgt <= 0) {
          out.data[p] = src.data[p]; out.data[p + 1] = src.data[p + 1];
          out.data[p + 2] = src.data[p + 2];
          continue;
        }
        const [r, g, b] = hsl2rgb(H[i] + delta * wgt, S[i], L[i]);
        /* Zurückmischen statt hart ersetzen: an der Kante zwischen
           „wird gedreht" und „bleibt" gäbe es sonst einen sichtbaren
           Absatz mitten im Tier. */
        out.data[p]     = src.data[p]     + (r - src.data[p])     * wgt;
        out.data[p + 1] = src.data[p + 1] + (g - src.data[p + 1]) * wgt;
        out.data[p + 2] = src.data[p + 2] + (b - src.data[p + 2]) * wgt;
      }
      x.putImageData(out, 0, 0);
      return c;
    });
  }

  /* Leuchtflecken und Funken werden vorgerendert: ein
     createRadialGradient je Tier und Bild wäre bei 500 Tieren der
     mit Abstand teuerste Posten der ganzen Schleife. */
  function leuchtFleck(farbe) {
    const S = 128, c = neuCanvas(S, S);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    const [r, gg, b] = hsl2rgb(farbe.h, .95, .62);
    const rr = Math.round(r), rg = Math.round(gg), rb = Math.round(b);
    g.addColorStop(0, `rgba(${rr},${rg},${rb},1)`);
    g.addColorStop(.22, `rgba(${rr},${rg},${rb},.62)`);
    g.addColorStop(.55, `rgba(${rr},${rg},${rb},.17)`);
    g.addColorStop(1, `rgba(${rr},${rg},${rb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return c;
  }
  /* Der weiße Kern der obersten Stufe. Bei acht Farbvarianten wird
     Farbe allein nie „heller als die anderen" — Weiß schon. */
  function funkeFleck() {
    const S = 64, c = neuCanvas(S, S);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.3, 'rgba(255,250,225,.55)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return c;
  }
  /* Härter als der Leuchtfleck: ein Funke hat einen KERN, ein
     Schein hat keinen — mit demselben weichen Verlauf sähen die
     Funken aus wie kleine Kopien des Glühens. */
  function funkenFleck(farbe) {
    const S = 64, c = neuCanvas(S, S);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    const [r, gg, b] = hsl2rgb(farbe.h, .90, .74);
    const rr = Math.round(r), rg = Math.round(gg), rb = Math.round(b);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(.20, `rgba(${rr},${rg},${rb},.85)`);
    g.addColorStop(.50, `rgba(${rr},${rg},${rb},.24)`);
    g.addColorStop(1, `rgba(${rr},${rg},${rb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return c;
  }

  let sprites = null;   // Bildschlüssel → [8 Leinwände]
  let flecken = null;   // Leuchtfleck je Farbe
  let funken = null;    // Funke je Farbe
  let funke = null;     // der weiße Kern

  async function ladeSprites() {
    if (sprites) return sprites;
    const roh = await Promise.all(BILDER.map(k => ladeBild(TIER_DIR + k + '.png')));
    const satz = {};
    BILDER.forEach((k, i) => {
      /* Nichts wird skaliert. Jedes Skalieren an dieser Stelle
         zerstörte genau den gemeinsamen Maßstab, für den das ganze
         Blatt da ist. */
      const c = neuCanvas(roh[i].width, roh[i].height);
      c.getContext('2d').drawImage(roh[i], 0, 0);
      satz[k] = faerbeSatz(c);
    });
    flecken = FARBEN.map(leuchtFleck);
    funken = FARBEN.map(funkenFleck);
    funke = funkeFleck();
    sprites = satz;
    return sprites;
  }

  /* ─── Die Insel würfeln ─────────────────────────────────────
     Nicht der Radius wird vorgegeben, sondern die FELDZAHL: Felder
     sind das, was man an der fertigen Karte nachzählen kann. Die
     Form steht fest, der Radius wird per Intervallhalbierung so
     lange eingeengt, bis die Feldzahl passt. */
  function blobForm(rnd) {
    const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    return a => .76 + .14 * Math.sin(a * 3 + ph[0]) + .09 * Math.sin(a * 5 + ph[1])
              + .06 * Math.sin(a * 2 + ph[2]);
  }

  function blobCells(cr, cc, R, wob) {
    const raus = [];
    const x0 = cx(cr, cc), y0 = cy(cr);
    const rowSpan = Math.ceil(R / ROWH) + 2, colSpan = Math.ceil(R) + 2;
    for (let r = cr - rowSpan; r <= cr + rowSpan; r++) {
      for (let c = cc - colSpan; c <= cc + colSpan; c++) {
        const dx = cx(r, c) - x0, dy = cy(r) - y0;
        const d = Math.hypot(dx, dy);
        if (d > R * wob(Math.atan2(dy, dx))) continue;
        raus.push([r, c]);
      }
    }
    return raus;
  }

  function blobMitZiel(cr, cc, ziel, wob) {
    let lo = .5, hi = 24;
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2;
      if (blobCells(cr, cc, m, wob).length < ziel) lo = m; else hi = m;
    }
    return { R: hi, zellen: blobCells(cr, cc, hi, wob) };
  }

  /* Grobe Umkehrung für die PLATZIERUNG: wie groß wird eine Insel
     mit so vielen Feldern ungefähr? Nachgemessen rund 2,1 Felder je
     Radiusquadrat. Genauer muss es nicht sein — der Abstand hat
     ohnehin einen Sicherheitszuschlag (WASSER). */
  const rAus = ziel => Math.sqrt(ziel / 2.1);

  /* Hauptinsel plus `satelliten` Satelliten, immer dieselbe
     Reihenfolge aus demselben Startwert. Genau daran hängt das
     monotone Wachsen: mit einem Satelliten mehr kommt EINE Insel
     dazu, und alle vorigen liegen unverändert da, wo sie lagen. */
  function wuerfelInseln(seed, satelliten) {
    const rnd = mulberry32(seed >>> 0 || 1);
    const out = [], have = new Set();

    const setze = (cr, cc, ziel, wob) => {
      const b = blobMitZiel(cr, cc, ziel, wob);
      for (const [r, c] of b.zellen) {
        const k = r + ',' + c;
        if (have.has(k)) continue;
        have.add(k); out.push([r, c]);
      }
      return b.R;
    };

    const hauptZiel = HAUPT_FELDER[0] + rnd() * (HAUPT_FELDER[1] - HAUPT_FELDER[0]);
    const hauptR = setze(0, 0, hauptZiel, blobForm(rnd));

    /* Platz würfeln, prüfen, ob er zu allen bisherigen genug Abstand
       hat, sonst neu würfeln. Eine feste Formel müsste den
       schlimmsten Fall einrechnen und schöbe alle Inseln unnötig
       weit hinaus.

       ⚠️ Die Schleife läuft über ALLE sechs, auch wenn nur zwei
       gezeigt werden: sonst hinge die Lage der zweiten Insel daran,
       wie viele Wörter das Kind gerade hat — und die Insel
       verschöbe sich beim Dazulernen. */
    const gesetzt = [{ x: 0, y: 0, R: hauptR }];
    const a0 = rnd() * 6.283;
    for (let i = 0; i < SAT_SCHWELLEN.length; i++) {
      const ziel = SAT_FELDER[0] + rnd() * (SAT_FELDER[1] - SAT_FELDER[0]);
      const R = rAus(ziel);
      let platz = null;
      for (let versuch = 0; versuch < 240 && !platz; versuch++) {
        const weite = versuch / 240;
        const a = a0 + (i + (rnd() - .5) * .5) * 6.283 / SAT_SCHWELLEN.length;
        const D = hauptR + WASSER + R * AUSSEN + rnd() * 3.5 + weite * 9;
        const x = Math.cos(a) * D, y = Math.sin(a) * D;
        const frei = gesetzt.every(g =>
          Math.hypot(g.x - x, g.y - y) >= (g.R + R) * AUSSEN + WASSER);
        if (frei) platz = { x, y, R };
      }
      // Kein Platz gefunden: diese Insel wird ausgelassen. Lieber
      // fünf Inseln als zwei, die zusammengewachsen sind.
      if (!platz) continue;
      gesetzt.push(platz);
      if (i >= satelliten) continue;   // gewürfelt, aber noch nicht sichtbar
      const r = Math.round(platz.y / ROWH);
      const c = Math.round(platz.x - 0.5 * (((r % 2) + 2) % 2));
      setze(r, c, ziel, blobForm(rnd));
    }
    return out;
  }

  /* Zusammenhängende Landmassen. Die Tiere brauchen sie: ein Läufer
     bleibt auf der Hauptinsel (der ersten in der Liste), ein Flieger
     sucht sich zum Schlafen irgendeine. */
  function findeInseln(isl) {
    const seen = new Set(), inseln = [];
    for (const z of isl.cells) {
      if (seen.has(z.i)) continue;
      const stack = [z], grp = [];
      seen.add(z.i);
      while (stack.length) {
        const q = stack.pop();
        grp.push(q);
        for (const [nr, nc] of neighbors(q.r, q.c)) {
          const n = isl.at(nr, nc);
          if (n && !seen.has(n.i)) { seen.add(n.i); stack.push(n); }
        }
      }
      let sx2 = 0, sy2 = 0;
      for (const q of grp) { sx2 += q.x; sy2 += q.y; }
      inseln.push({ cells: grp, cx: sx2 / grp.length, cy: sy2 / grp.length });
    }
    // Die größte zuerst — das ist die Hauptinsel, und auf ihr wohnt
    // alles, was nicht fliegen kann.
    inseln.sort((a, b) => b.cells.length - a.cells.length);
    return inseln;
  }

  /* ─── Die Welt ──────────────────────────────────────────────── */
  const welt = {
    isl: null, vb: null, inseln: null, haupt: null,
    tiere: [], nachStufe: new Map()   // item-id → Tier
  };

  function feldAt(x, y) {
    const r0 = Math.round(y / ROWH);
    let best = null, bd = 1e9;
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      const c = Math.round(x - 0.5 * (((r % 2) + 2) % 2));
      for (let dc = -1; dc <= 1; dc++) {
        const z = welt.isl.at(r, c + dc);
        if (!z) continue;
        const d = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
        if (d < bd) { bd = d; best = z; }
      }
    }
    return (best && bd < .36) ? best : null;
  }
  /* Die Bodenhöhe. Ein Tier, das sie nicht mitnimmt, steckt im Fels
     bis zum Bauch. `hoch` kommt aus inselDaten — dieselbe Zahl, aus
     der auch das Relief seine Säule baut. */
  function bodenY(x, y) {
    const z = feldAt(x, y);
    return z ? -z.hoch + .1 : 0;
  }

  function aufHauptinsel(z) {
    if (!welt.haupt) welt.haupt = new Set(welt.inseln[0].cells);
    return welt.haupt.has(z);
  }

  /* Ein Punkt IN einem Feld. Die Auslenkung bleibt unter einer
     halben Kachel — der Innenkreis des Sechsecks, der Punkt liegt
     also sicher im Feld und nicht im Wasser nebenan. */
  function zufallsPunktAuf(insel, rnd) {
    const z = insel.cells[(rnd() * insel.cells.length) | 0];
    const a = rnd() * 6.283, rad = rnd() * .34;
    return { x: z.x + Math.cos(a) * rad, y: z.y + Math.sin(a) * rad * .8 };
  }

  /* Für Läufer: ein Ziel in der NÄHE statt irgendwo auf der Insel.
     Nicht aus Gemütlichkeit, sondern wegen der Küste — ein Läufer
     geht geradeaus, und eine Gerade quer über die Insel führt bei
     jeder Bucht durchs Wasser. */
  const NAH = 3.2;
  function zufallsPunktNahe(t) {
    const insel = welt.inseln[t.inselIdx] || welt.inseln[0];
    const nah = [];
    for (const z of insel.cells) {
      if (Math.abs(z.x - t.x) < NAH && Math.abs(z.y - t.y) < NAH) nah.push(z);
    }
    const feld = nah.length ? nah[(Math.random() * nah.length) | 0]
                            : insel.cells[(Math.random() * insel.cells.length) | 0];
    const a = Math.random() * 6.283, rad = Math.random() * .34;
    return { x: feld.x + Math.cos(a) * rad, y: feld.y + Math.sin(a) * rad * .8 };
  }

  function naechsteInsel(x, y) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < welt.inseln.length; i++) {
      const d = Math.hypot(welt.inseln[i].cx - x, welt.inseln[i].cy - y);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  function neuesZiel(t) {
    if (t.stufe === 0) { t.zx = t.x; t.zy = t.y; return; }
    if (t.stufe >= 3) {
      /* Flieger dürfen aufs offene Wasser. Der Bereich ist der
         Bildausschnitt plus etwas — weiter draußen sähe man sie
         nicht mehr, und ein Tier, das nie zurückkommt, fehlt auf
         der Insel. */
      const vb = welt.vb, m = 1.5;
      t.zx = vb[0] - m + Math.random() * (vb[2] + 2 * m);
      t.zy = vb[1] - m + Math.random() * (vb[3] + 2 * m);
      return;
    }
    const p = zufallsPunktNahe(t);
    t.zx = p.x; t.zy = p.y;
  }

  /* Zum Schlafen braucht ein Flieger festen Boden — und die
     NÄCHSTGELEGENE Insel, nicht einfach die Hauptinsel: sonst läge
     nachts die ganze Herde auf einem Haufen. */
  function schlafZiel(t) {
    const i = naechsteInsel(t.x, t.y);
    t.inselIdx = i;
    const p = zufallsPunktAuf(welt.inseln[i], Math.random);
    t.zx = p.x; t.zy = p.y;
  }

  /* Ein Tier gehört zu EINEM Wort, und alles Feste an ihm kommt aus
     dessen id: Farbe und Flügelform sind damit über Geräte und
     Sitzungen hinweg dieselben, ohne dass sie jemand speichern
     müsste. Zufällig ist nur, wo es gerade steht. */
  function neuesTier(id, stufe) {
    const h = hashKey(String(id));
    const rnd = mulberry32(h);
    const insel = welt.inseln[0];
    const p = zufallsPunktAuf(insel, Math.random);
    const t = {
      id, stufe,
      farbe: h % FARBEN.length,
      variante: (h >>> 8) % 2 ? 'a' : 'b',
      x: p.x, y: p.y, z: 0, zx: p.x, zy: p.y,
      inselIdx: 0,
      flip: rnd() < .5,
      phase: rnd() * 6.283,
      zustand: 'laufen',
      schlafBis: 0, pop: 0, burst: 0,
      tempo: .85 + rnd() * .3
    };
    if (stufe >= 3) { t.zustand = 'fliegen'; t.z = FLUG_HOEHE; }
    if (stufe === 0) t.zustand = 'ei';
    return t;
  }

  function schritt(t, dt, jetzt) {
    if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 1.6);
    if (t.burst > 0) t.burst = Math.max(0, t.burst - dt * .85);
    if (t.stufe === 0) return;                       // Eier tun nichts

    if (t.zustand === 'schlafen') {
      if (t.stufe >= 3) t.z += (0 - t.z) * Math.min(1, dt * 3);
      if (jetzt >= t.schlafBis) {
        t.zustand = t.stufe >= 3 ? 'fliegen' : 'laufen';
        neuesZiel(t);
      }
      return;
    }

    const flieger = t.stufe >= 3;
    t.z += ((flieger ? FLUG_HOEHE : 0) - t.z) * Math.min(1, dt * 2.2);

    const dx = t.zx - t.x, dy = t.zy - t.y;
    const d = Math.hypot(dx, dy);
    const v = (flieger ? FLUG_TEMPO : LAUF_TEMPO[t.stufe]) * t.tempo;

    if (d < .10) {
      if (t.zustand === 'zumSchlafen') {
        t.zustand = 'schlafen';
        t.schlafBis = jetzt + 4 + Math.random() * 12;
        return;
      }
      if (Math.random() < (flieger ? .30 : .42)) {
        if (flieger) { t.zustand = 'zumSchlafen'; schlafZiel(t); }
        else { t.zustand = 'schlafen'; t.schlafBis = jetzt + 3 + Math.random() * 10; }
      } else {
        neuesZiel(t);
      }
      return;
    }

    const s = Math.min(1, v * dt / d);
    const nx = t.x + dx * s, ny = t.y + dy * s;

    /* Der Riegel an der Küste. Für Läufer wird JEDER Schritt
       geprüft: ginge er ins Wasser, wird er nicht gegangen, sondern
       ein neues Ziel gesucht. Das Tier prallt damit ab, statt
       hindurchzugehen — und weil ein Läufer immer auf einem Feld
       STEHT, kann er auch nicht darin stecken bleiben.

       Geprüft wird „Hauptinsel" und nicht bloß „Land": nur Flieger
       verlassen sie, alles andere bleibt zu Hause. */
    if (!flieger) {
      const z = feldAt(nx, ny);
      if (!z || !aufHauptinsel(z)) { neuesZiel(t); return; }
    }

    t.x = nx; t.y = ny;
    // Erst ab einer spürbaren Auslenkung umdrehen, sonst flackert
    // ein Tier, das fast senkrecht läuft.
    if (Math.abs(dx) > .02) t.flip = dx < 0;
  }

  /* Landen heißt: auf die HAUPTINSEL. Gerufen beim Absteigen unter
     Stufe 3 — wer nicht mehr fliegen kann, gehört nach Hause, sonst
     säße nach ein paar falschen Vokabeln ein Baby auf einem
     Satelliten fest. Steht es schon auf der Hauptinsel, bleibt es:
     das Zurückfallen soll man am Tier sehen und nicht daran, dass
     es plötzlich woanders ist. */
  function landeAufLand(t) {
    t.z = 0; t.inselIdx = 0;
    const z = feldAt(t.x, t.y);
    if (z && aufHauptinsel(z)) return;
    const p = zufallsPunktAuf(welt.inseln[0], Math.random);
    t.x = p.x; t.y = p.y;
  }

  /* Der Stufenwechsel — die eine Stelle, an der ein Tier den Zustand
     wechseln MUSS: wer auf 3 steigt, hebt ab; wer von 3 auf 2 fällt,
     muss landen, und zwar auf Land und nicht dort, wo er gerade über
     dem Meer stand. */
  function setzeStufe(t, s, mitPop) {
    s = Math.max(0, Math.min(4, s));
    const vorher = t.stufe;
    t.stufe = s;
    if (mitPop) t.pop = 1;
    /* Der Funkenkranz gehört zum AUFSTIEG. Beim Absteigen zuckt das
       Tier zwar auch, aber es feiert nicht — sonst sähen Erfolg und
       Rückfall aus dem Augenwinkel gleich aus, und genau das darf
       eine Rückmeldung nie. */
    if (mitPop && s > vorher) t.burst = 1;

    if (s === 0) {
      t.zustand = 'ei'; t.z = 0;
      if (vorher >= 3) landeAufLand(t);
      return;
    }
    if (s >= 3) {
      if (vorher < 3 || t.zustand === 'ei') { t.zustand = 'fliegen'; neuesZiel(t); }
      return;
    }
    if (vorher >= 3 || t.zustand === 'ei' || t.zustand === 'fliegen' || t.zustand === 'zumSchlafen') {
      landeAufLand(t);
      t.zustand = 'laufen';
      neuesZiel(t);
    }
  }

  /* ══════════════════════════════════════════════════════════
     DU SELBST  ·  Figur und Schiff  (11.09.2026)
     ══════════════════════════════════════════════════════════
     Sönke: „Ich würde gerne, dass man selbst auch auf der Insel
     repräsentiert wird. […] Schritt 1 ist aber erstmal, dass man ein
     Charakter und ein Schiff bekommt."

     Bis hierher war die Insel ein Schaukasten: lauter Vokabeln, die
     herumlaufen, und niemand, der dort wohnt. Die Figur ist der
     Unterschied zwischen „meine Vokabeln" und „mein Ort".

     ── Zwei Dinge, ein Volk ──────────────────────────────────
     Figur und Schiff hängen an EINER Zahl: der Volksnummer aus
     TEAMS (0…7, dieselbe wie in wi_boards.factions). Sie steht in
     wi_solo_learners.settings.faction; solange Migration 0143 nicht
     eingespielt ist, merkt sie sich das Gerät allein (siehe
     volkSetzen).

     Die Figur ist das ERSTE Bild der Crew ihres Volkes. Später
     kommt hier das eigene Level dazu und mit ihm ein anderes Bild —
     deshalb geht alles, was das Aussehen bestimmt, schon jetzt durch
     `volkBild()` und nicht direkt durch den Dateinamen.

     ── Warum auf der Leinwand und nicht im SVG ───────────────
     Die Schiffe im RAUM sind SVG-Knoten (sie stehen still und
     schaukeln nur). Hier fahren sie. Auf der Leinwand liegen sie in
     derselben Kamera und derselben Tiefenordnung wie die Tiere —
     und eine Figur, die hinter einer Echse verschwindet, während
     sie an ihr vorbeiläuft, ist der halbe Grund, warum die Insel
     lebendig aussieht.                                          */

  const HELD_DIR = 'tools/wordisland/sprites/held/';
  const BOOT_DIR = 'tools/wordisland/sprites/boot/';

  /* Die Voreinstellung ist Sönkes Vorgabe: „Diese sind Default von
     den Brokkoli Giraffen." Das ist Volk 2 in TEAMS. */
  const VOLK_STD = 2;

  /* Maße in KACHELN, wie überall auf dieser Insel. Die Figur ist
     etwas größer als eine ausgewachsene Echse (2.25) — man soll sie
     in der Herde finden, ohne dass sie darüber thront. */
  const HELD_HOCH  = 2.6;
  const BOOT_BREIT = 3.6;
  /* Wie weit der Kiel vom äußersten Feld der Hauptinsel wegbleibt.
     Gemessen am größten Radius und nicht an der nächsten Küste: eine
     Bahn, die jeder Bucht folgt, ist kein Kurs, sondern ein Zickzack. */
  const BOOT_ABSTAND = 1.8;

  const HELD_TEMPO = .42;      // Kacheln je Sekunde
  const BOOT_TEMPO = .30;      // dito, auf der BAHN und nicht im Winkel

  const WI_VOLK_KEY = 'mpskills.wordisland.volk';

  let spieler = null;
  /* Gegen Bilder, die zu spät kommen: wer zweimal schnell
     umschaltet, bekäme sonst das Schiff des ersten Klicks unter die
     Figur des zweiten. */
  let volkGen = 0;
  /* Hat der Server das Volk abgelehnt, weil er die Funktion nicht
     kennt? Dann steht es im Kasten — „gemerkt" und „nur hier
     gemerkt" dürfen nicht gleich aussehen. */
  let volkNurHier = false;

  const volkName = n => (TEAMS[n] && TEAMS[n].name) || ('Volk ' + (n + 1));
  const volkBild  = n => HELD_DIR + n + '.png';
  const volkDaumen = n => HELD_DIR + n + 'k.png';
  const volkBoot  = n => BOOT_DIR + n + '.png';

  /* Woher das Volk kommt, in dieser Reihenfolge: Server, Gerät,
     Voreinstellung. Der Server gewinnt — er ist der Ort, an dem die
     Insel steht. Das Gerät ist nur der Notnagel für den Fall, dass
     0143 noch nicht eingespielt ist. */
  function volkAusStand() {
    const s = solo && solo.settings ? solo.settings.faction : null;
    if (Number.isInteger(s) && s >= 0 && s < TEAMS.length) return s;
    try {
      const v = parseInt(localStorage.getItem(WI_VOLK_KEY), 10);
      if (v >= 0 && v < TEAMS.length) return v;
    } catch (e) { /* egal */ }
    return VOLK_STD;
  }

  function volkBilderLaden() {
    const n = spieler.volk, gen = ++volkGen;
    const nimm = (pfad, feld) => ladeBild(pfad).then(im => {
      if (gen === volkGen && spieler) spieler[feld] = im;
    }).catch(e => {
      /* Ein fehlendes Bild zeichnet still NICHTS — genau die Falle,
         die bei den Schiffen im Raum schon einmal eine Stunde
         gekostet hat. Also sagt es wenigstens die Konsole. */
      console.warn('[wordisland] ' + e.message);
    });
    nimm(volkBild(n), 'imHeld');
    nimm(volkBoot(n), 'imBoot');
  }

  /* Figur und Schiff aufstellen. Gerufen aus soloBuild, NACH den
     Inseln: beide brauchen die Hauptinsel — die eine, um darauf zu
     laufen, das andere, um sie zu umrunden. */
  function spielerAufstellen() {
    const insel = welt.inseln[0];
    const p = zufallsPunktAuf(insel, Math.random);
    let R = 0;
    for (const z of insel.cells) {
      R = Math.max(R, Math.hypot(z.x - insel.cx, z.y - insel.cy));
    }
    spieler = {
      volk: volkAusStand(),
      imHeld: null, imBoot: null,
      held: {
        x: p.x, y: p.y, zx: p.x, zy: p.y,
        flip: false, ruheBis: 0, held: true, stufe: 0, _a: 1, _hell: false
      },
      boot: { winkel: Math.random() * 6.283, r: R + BOOT_ABSTAND, x: 0, y: 0, flip: false }
    };
    /* Die Bahn gleich einmal ausrechnen. Im ersten Bild ist dt noch
       null, bootSchritt läuft also nicht — und ein Schiff, das einen
       Wimpernschlag lang mitten auf der Insel liegt, sieht aus wie
       ein Fehler, weil es einer wäre. */
    bootOrt();
    volkBilderLaden();
  }

  function heldZiel() {
    const h = spieler.held;
    /* Dasselbe Ziel-in-der-Nähe wie bei den Läufern, und aus
       demselben Grund: eine Gerade quer über die Insel führt bei
       jeder Bucht durchs Wasser. */
    const p = zufallsPunktNahe({ x: h.x, y: h.y, inselIdx: 0 });
    h.zx = p.x; h.zy = p.y;
  }

  function heldSchritt(dt, jetzt) {
    const h = spieler.held;
    if (jetzt < h.ruheBis) return;
    const dx = h.zx - h.x, dy = h.zy - h.y;
    const d = Math.hypot(dx, dy);
    if (d < .10) {
      // Stehenbleiben ist die Hälfte des Gehens: eine Figur, die
      // ununterbrochen unterwegs ist, wirkt gehetzt.
      if (Math.random() < .45) h.ruheBis = jetzt + 2 + Math.random() * 7;
      heldZiel();
      return;
    }
    const s = Math.min(1, HELD_TEMPO * dt / d);
    const nx = h.x + dx * s, ny = h.y + dy * s;
    /* Derselbe Küsten-Riegel wie bei den Läufern: ginge der Schritt
       ins Wasser, wird er nicht gegangen. Die Figur prallt ab und
       sucht sich ein neues Ziel. */
    const z = feldAt(nx, ny);
    if (!z || !aufHauptinsel(z)) { heldZiel(); return; }
    h.x = nx; h.y = ny;
    if (Math.abs(dx) > .02) h.flip = dx < 0;
  }

  /* Wo das Schiff auf seiner Bahn gerade liegt — und in welche
     Richtung es schaut. */
  function bootOrt() {
    const b = spieler.boot, insel = welt.inseln[0];
    for (let i = 0; i < 8; i++) {
      b.x = insel.cx + Math.cos(b.winkel) * b.r;
      b.y = insel.cy + Math.sin(b.winkel) * b.r;
      /* Land unterm Kiel: hinausrücken. Der Radius wächst dabei und
         schrumpft nie wieder — nach einer Runde umfährt die Bahn
         alles. Ließe man ihn zurückfedern, führe das Schiff bei
         jeder Umrundung an derselben Stelle wieder auf Grund. */
      if (!feldAt(b.x, b.y)) break;
      b.r += .5;
    }
    /* Das Bild schaut nach LINKS (der Bug liegt links), gespiegelt
       wird also bei Fahrt nach rechts. Gelesen wird das aus dem
       WINKEL und nicht aus „x ist größer als vorhin": die Insel
       liegt um (0,0), das Schiff fährt zweimal je Runde durch x ≈ 0
       — und genau dort stünde ein Vergleich still. */
    b.flip = Math.sin(b.winkel) < 0;
  }

  function bootSchritt(dt) {
    const b = spieler.boot;
    /* Der Winkel wächst mit der BAHNgeschwindigkeit geteilt durch den
       Radius. Ein fester Winkel je Sekunde ließe das Schiff um eine
       große Insel rasen und um eine kleine kriechen — dieselbe Zahl
       hieße dann nicht mehr dasselbe. */
    b.winkel = (b.winkel + BOOT_TEMPO / Math.max(1, b.r) * dt) % 6.283185;
    bootOrt();
  }

  /* Das Schiff. Es wird VOR allem anderen gemalt: es liegt auf dem
     Wasser, also hinter jedem Tier, das gerade darüber hinwegfliegt.

     Gemalt wird um die Bildmitte und gedreht wird ein wenig — beides
     zusammen ist das Schaukeln. Der Kiel sitzt auf der Wasserlinie,
     weil der Zuschnitt unten am Rumpf endet (heldsprites.mjs). */
  function bootMalen(P) {
    const b = spieler.boot, im = spieler.imBoot;
    if (!im || !im.width) return;
    const w = BOOT_BREIT * P, h = w * (im.height / im.width);
    const wiege = Math.sin(simZeit * .55 + 1.3) * .055 * P;
    const px = sxp(b.x), py = syp(b.y) + wiege;
    b._mx = px; b._my = py - h / 2; b._w = w; b._h = h;
    if (px < -w || px > sicht.w + w || py < -h || py > sicht.h + h) return;

    // Der Schatten auf dem Wasser. Ohne ihn klebt das Schiff auf dem
    // Meer, statt darin zu liegen.
    c2d.beginPath();
    c2d.ellipse(px, py - h * .02, w * .34, h * .05, 0, 0, 6.2832);
    c2d.fillStyle = 'rgba(6, 26, 45, .22)';
    c2d.fill();

    c2d.save();
    c2d.translate(px, py);
    c2d.rotate(Math.sin(simZeit * .42) * .035);
    if (b.flip) c2d.scale(-1, 1);
    c2d.drawImage(im, -w / 2, -h, w, h);
    c2d.restore();
  }

  /* Die Figur wird nicht selbst gemalt, sondern in die Liste der
     Tiere GEHÄNGT (zuMalen). Nur so steht sie richtig zwischen
     ihnen: vor dem, was weiter hinten ist, hinter dem, was weiter
     vorn steht.

     Sie trägt dafür `stufe: 0` und `_hell: false` — damit gehen
     Glühen, Funken und der goldene Ring von allein an ihr vorbei,
     ohne dass in jeder der vier Schleifen eine Ausnahme steht. */
  function heldMasse(P) {
    const h = spieler.held, im = spieler.imHeld;
    if (!im || !im.width) return null;
    const hoch = HELD_HOCH * P, breit = hoch * (im.width / im.height);
    const gy = bodenY(h.x, h.y);
    const px = sxp(h.x), py = syp(h.y + gy);
    h._im = im;
    h._w = breit; h._h = hoch;
    h._x = px - breit / 2; h._y = py - hoch;
    h._px = px; h._by = py;
    h._mx = px; h._my = py - hoch / 2;
    return h;
  }

  function heldSchatten(h) {
    c2d.beginPath();
    c2d.ellipse(h._px, h._by, h._w * .30, h._h * .055, 0, 0, 6.2832);
    c2d.fillStyle = 'rgba(12, 30, 20, .26)';
    c2d.fill();
  }

  /* Wer liegt unter diesem Punkt — die Figur oder das Schiff?
     Die Figur zuerst: sie ist kleiner, und wo sich beide
     überschneiden, ist sie die nähere. */
  function spielerBei(x, y) {
    if (!spieler) return null;
    const drin = e => e && e._w
      && x >= e._mx - e._w / 2 && x <= e._mx + e._w / 2
      && y >= e._my - e._h / 2 && y <= e._my + e._h / 2;
    if (drin(spieler.held)) return 'held';
    if (drin(spieler.boot)) return 'boot';
    return null;
  }

  /* ─── Kamera ────────────────────────────────────────────────
     Ansicht und Kamera getrennt: die ANSICHT ist die Einpassung des
     viewBox in die Bühne (rechnet nach, was preserveAspectRatio
     ="meet" im SVG tut), die KAMERA ist das Schieben und Zoomen.
     Zusammen ergeben sie „Kachelkoordinate → Bildschirmpunkt".

     Eigene Fassung neben attachPanZoom, und zwar aus einem Grund:
     dort bewegt sich nur ein SVG, hier müssen SVG und Leinwand im
     Gleichschritt bleiben — und dafür müssen die Kamerawerte als
     ZAHLEN vorliegen und nicht bloß als CSS-transform. */
  const sicht = { s: 1, ox: 0, oy: 0, w: 0, h: 0 };
  const kamera = { k: 1, tx: 0, ty: 0 };
  const sxp = x => kamera.tx + kamera.k * (sicht.ox + x * sicht.s);
  const syp = y => kamera.ty + kamera.k * (sicht.oy + y * sicht.s);
  const ppu = () => kamera.k * sicht.s;

  function passeAn() {
    if (!els.stage || !els.cvs) return;
    const r = els.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    sicht.w = r.width; sicht.h = r.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    els.cvs.width = Math.round(r.width * dpr);
    els.cvs.height = Math.round(r.height * dpr);
    els.cvs.style.width = r.width + 'px';
    els.cvs.style.height = r.height + 'px';
    c2d = els.cvs.getContext('2d');
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!welt.vb) return;
    const vb = welt.vb;
    const s = Math.min(r.width / vb[2], r.height / vb[3]);
    sicht.s = s;
    sicht.ox = (r.width - vb[2] * s) / 2 - vb[0] * s;
    sicht.oy = (r.height - vb[3] * s) / 2 - vb[1] * s;
  }

  function kameraAnwenden() {
    if (els.mapwrap2) {
      els.mapwrap2.style.transform =
        `translate(${kamera.tx}px, ${kamera.ty}px) scale(${kamera.k})`;
    }
  }

  /* Der Startausschnitt zeigt die EIGENE Insel und nicht das ganze
     Archipel: passte man ihn an alle Landmassen an, wäre die
     Hauptinsel ein Drittel des Bildes — und genau sie ist das, was
     ein Kind ansieht. Dass es die kleinen gibt, verrät der Ring, auf
     dem die Flieger verschwinden. */
  function kameraAufHauptinsel() {
    if (!welt.inseln || !welt.inseln.length || !sicht.w) return;
    const cs = welt.inseln[0].cells;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const z of cs) {
      a = Math.min(a, z.x); b = Math.max(b, z.x);
      c = Math.min(c, z.y); d = Math.max(d, z.y);
    }
    /* Wasser rundum — und zwar so viel, dass das eigene Schiff im
       Startbild MIT drauf ist. Es fährt eine knappe Kachel weiter
       draußen als das äußerste Feld (BOOT_ABSTAND), und ein
       Ausschnitt, der am Strand endet, versteckt genau das, was man
       anklicken soll. Die Insel wird dadurch etwas kleiner; das ist
       der Preis dafür, dass man zu Hause ist und nicht nur hinsieht. */
    const rand = 2 * (BOOT_ABSTAND + 1.1);
    const w = (b - a) + rand, h = (d - c) + rand;
    const mx = (a + b) / 2, my = (c + d) / 2;
    /* Gerechnet wird gegen das FREIE Fenster: die Unit-Leiste liegt
       über der Bühne, und eine Insel, die brav in der Mitte der
       Leinwand sitzt, säße zur Hälfte hinter der Leiste. Sie steht
       links, das freie Fenster fängt also erst bei `randLinks` an —
       darum die Verschiebung vor der halben Breite. */
    const frei = Math.max(80, sicht.w - randLinks);
    kamera.k = Math.min(4, Math.max(.6,
      Math.min(frei * .92 / (w * sicht.s), sicht.h * .92 / (h * sicht.s))));
    kamera.tx = randLinks + frei / 2 - kamera.k * (sicht.ox + mx * sicht.s);
    kamera.ty = sicht.h / 2 - kamera.k * (sicht.oy + my * sicht.s);
    kameraAnwenden();
  }

  /* Die Zeiger-Ereignisse hängen in der EINFANG-Phase (Regel:
     feedback_field_gestures_capture_phase). */
  function soloPanZoom(stage) {
    const pts = new Map();
    let basis = null, letzterTipp = 0, letzterOrt = null;
    /* Ein Tipp ist ein Ziehen, das nicht stattgefunden hat. Gemessen
       wird der weiteste Weg und nicht der Abstand zwischen Anfang und
       Ende: wer hin und zurück wischt, hat gezogen und nicht getippt.

       `tippAus` sperrt den zweiten Tipp eines Doppeltipps. Der setzt
       die Kamera zurück — und würde sonst zusätzlich ein Tier
       auswählen, das nach dem Sprung ganz woanders steht. */
    let start = null, weg = 0, startZeit = 0, tippAus = false;

    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const mitte = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    const lokal = e => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    stage.addEventListener('pointerdown', e => {
      const p = lokal(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2) basis = { d: dist(), m: mitte(), k: kamera.k, tx: kamera.tx, ty: kamera.ty };
      if (pts.size === 1) { start = p; weg = 0; startZeit = performance.now(); tippAus = false; }
      else { tippAus = true; }
      /* Doppeltipp setzt zurück — der einfachste Ausweg aus jedem
         verrutschten Bild, und man findet ihn ohne Erklärung.

         Seit 10.09.2026 zählt dabei auch der ORT: zwei Tipps sind
         nur dann einer, wenn sie fast an derselben Stelle liegen.
         Vorher genügte die Zeit — und seit man Tiere antippen kann,
         wäre das falsch: wer zwei Echsen kurz hintereinander
         ansieht, hätte statt der zweiten Auskunft einen Kamerasprung
         bekommen. */
      const jetzt = performance.now();
      const nah = letzterOrt && Math.hypot(p.x - letzterOrt.x, p.y - letzterOrt.y) < 30;
      if (jetzt - letzterTipp < 320 && nah && pts.size === 1) {
        kameraAufHauptinsel();
        tippAus = true;
      }
      letzterTipp = jetzt;
      letzterOrt = p;
    }, { capture: true });

    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const vor = pts.get(e.pointerId);
      const jetzt = lokal(e);
      pts.set(e.pointerId, jetzt);
      if (start) weg = Math.max(weg, Math.hypot(jetzt.x - start.x, jetzt.y - start.y));

      if (pts.size === 2 && basis) {
        const f = dist() / (basis.d || 1);
        const k = Math.min(8, Math.max(.55, basis.k * f));
        const m = mitte();
        /* Um die Mitte der beiden Finger zoomen UND der Verschiebung
           dieser Mitte folgen. Nur eines von beidem, und die Karte
           rutscht unter den Fingern weg. */
        kamera.tx = m.x - (k / basis.k) * (basis.m.x - basis.tx);
        kamera.ty = m.y - (k / basis.k) * (basis.m.y - basis.ty);
        kamera.k = k;
        kameraAnwenden();
        e.preventDefault();
      } else if (pts.size === 1 && (e.buttons !== 0 || e.pointerType !== 'mouse')) {
        kamera.tx += jetzt.x - vor.x;
        kamera.ty += jetzt.y - vor.y;
        kameraAnwenden();
        e.preventDefault();
      }
    }, { capture: true, passive: false });

    /* Der Tipp auf ein Tier. Er wird beim LOSLASSEN entschieden und
       nicht beim Aufsetzen: vorher weiß niemand, ob daraus ein Ziehen
       wird — und ein Kärtchen, das beim Wischen aufspringt, machte
       das Verschieben der Insel unbenutzbar.

       Getroffen wird gegen das letzte gezeichnete Bild (tierBei).
       Daneben getippt heißt: Kärtchen zu. Das ist der Griff, den man
       ohne Erklärung findet. */
    const hoch = e => {
      const war = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) basis = null;
      if (e.type !== 'pointerup' || pts.size || !war || !start) { start = null; return; }
      const kurz = performance.now() - startZeit < 700;
      if (!tippAus && kurz && weg < 10 && solo && welt.isl) {
        /* Erst du selbst, dann die Vokabeln. Figur und Schiff sind
           größer als eine Echse und liegen im Zweifel obenauf — wer
           auf sein Schiff tippt, meint sein Schiff. */
        if (spielerBei(war.x, war.y)) volkOeffnen();
        else tierWaehlen(tierBei(war.x, war.y));
      }
      start = null;
    };
    stage.addEventListener('pointerup', hoch, { capture: true });
    stage.addEventListener('pointercancel', hoch, { capture: true });

    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const f = Math.exp(-e.deltaY * .0016);
      const k = Math.min(8, Math.max(.55, kamera.k * f));
      kamera.tx = px - (k / kamera.k) * (px - kamera.tx);
      kamera.ty = py - (k / kamera.k) * (py - kamera.ty);
      kamera.k = k;
      kameraAnwenden();
    }, { passive: false });
  }

  /* ─── Zeichnen ──────────────────────────────────────────────── */
  let c2d = null, raf = 0, letzterT = 0, simZeit = 0, nacht = 0;
  /* Die Tiere des letzten Bildes, in Zeichenreihenfolge. Nur sie
     haben frische Bildschirmkoordinaten — und nur auf sie kann ein
     Finger deshalb zeigen. */
  let sichtbar = [];

  /* Das wache Bild. Eigene Funktion, weil es einen zweiten Ort gibt,
     der es braucht und dem der Schlaf egal ist: das kleine Monster in
     der Vokabelliste (monsterUrl). Ein schlafendes Tier in einer
     Liste sähe aus wie ein anderes Tier. */
  function wachSchluessel(stufe, variante) {
    if (stufe === 0) return 'ei';
    if (stufe === 1) return 's1';
    if (stufe === 2) return 's2';
    return 's3' + variante;
  }

  function schluesselFuer(t) {
    const k = wachSchluessel(t.stufe, t.variante);
    return (t.zustand === 'schlafen' && t.stufe > 0) ? k + 'z' : k;
  }
  const bildFuer = t => sprites[schluesselFuer(t)][t.farbe];

  /* ─── Blass, weil abgewählt ─────────────────────────────────
     Sönke: „auf der Insel sind Echsen von deaktivierten Units leicht
     entsättigt." Das ist die ehrlichste Anzeige für „gehört dir,
     kommt aber gerade nicht dran": das Tier verschwindet nicht (es
     ist ja da), es tritt nur zurück.

     Gerechnet wird das EINMAL je Bildschlüssel und Farbe, mit
     derselben Technik wie das Einfärben (faerbeSatz): Bildpunkte
     lesen, zur Helligkeit hin mischen, zurückschreiben. Höchstens
     neun mal acht Bilder, und gebaut nur für das, was wirklich
     abgewählt ist.

     Kein ctx.filter: der ist auf älteren iPads nicht verlässlich, und
     ein Filter je Tier und Bild wäre bei fünfhundert Tieren ohnehin
     der teuerste Posten der Schleife. */
  /* .60 und nicht .55 (Sönke, 10.09.2026: „kann 5 % doller sein"):
     der Unterschied zwischen „übe ich gerade" und „ruht" muss man im
     Vorbeigehen sehen, nicht suchen. */
  const GRAU = .60;

  function grauBild(k, farbe) {
    const schl = k + '|' + farbe;
    if (grauCache.has(schl)) return grauCache.get(schl);
    const im = sprites[k][farbe];
    let out = im;
    try {
      const c = neuCanvas(im.width, im.height);
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, im.width, im.height);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        if (!p[i + 3]) continue;
        const l = p[i] * .30 + p[i + 1] * .59 + p[i + 2] * .11;
        p[i]     += (l - p[i])     * GRAU;
        p[i + 1] += (l - p[i + 1]) * GRAU;
        p[i + 2] += (l - p[i + 2]) * GRAU;
      }
      x.putImageData(d, 0, 0);
      out = c;
    } catch (e) {
      // Kein Grund, deshalb die Insel abzuschalten: dann ist das
      // Tier eben bunt wie die anderen.
      out = im;
    }
    grauCache.set(schl, out);
    return out;
  }

  /* Ein Wort ohne Unit ist NICHT abgewählt, sondern von einer
     Datenbank ohne Migration 0142. Solche Tiere bleiben bunt. */
  function tierBlass(t) {
    if (!solo) return false;
    const u = solo.setVon.get(t.id);
    return u ? !solo.aktiv.has(u) : false;
  }

  /* Die Ringe unter den hervorgehobenen Tieren. Sie liegen VOR den
     Tieren auf dem Boden — ein Ring über dem Tier wäre ein Reifen um
     den Bauch. Das einzelne angetippte Tier pulst, die Tiere einer
     Unit stehen ruhig: „diese eine" muss sich von „alle diese"
     unterscheiden, ohne dass es jemand erklärt. */
  function ringeMalen(liste, zeit) {
    for (const t of liste) {
      if (!t._hell) continue;
      const einzeln = t.id === tierOffen;
      const puls = einzeln ? .86 + .14 * Math.sin(zeit * 3.2) : 1;
      const r = t._h * .40 * puls;
      c2d.beginPath();
      c2d.ellipse(t._px, t._by, r, r * .42, 0, 0, 6.2832);
      c2d.fillStyle = einzeln ? 'rgba(255,226,140,.22)' : 'rgba(255,207,77,.14)';
      c2d.fill();
      c2d.lineWidth = Math.max(1.4, t._h * (einzeln ? .05 : .035));
      c2d.strokeStyle = einzeln ? 'rgba(255,232,160,.95)' : 'rgba(255,207,77,.60)';
      c2d.stroke();
    }
  }

  /* Welches Tier liegt unter diesem Punkt? Die Zeichenschleife legt
     die Geometrie jedes sichtbaren Tieres ohnehin schon hin (_mx,
     _my, _w, _h — in CSS-Pixeln der Bühne), hier wird sie nur noch
     gelesen. Rückwärts, weil das ZULETZT gemalte oben liegt.

     Die Zugabe von sechs Pixeln ist für die Eier: sie sind klein,
     und ein Finger ist es nicht. */
  function tierBei(x, y) {
    for (let i = sichtbar.length - 1; i >= 0; i--) {
      const t = sichtbar[i];
      // Die eigene Figur läuft in derselben Liste mit, ist aber
      // keine Vokabel — für sie gibt es spielerBei().
      if (t.held) continue;
      const hw = t._w / 2 + 6, hh = t._h / 2 + 6;
      if (x >= t._mx - hw && x <= t._mx + hw && y >= t._my - hh && y <= t._my + hh) return t;
    }
    return null;
  }

  function zeichne(now) {
    if (destroyed || role !== 'solo') { raf = 0; return; }
    raf = requestAnimationFrame(zeichne);
    if (!sprites || !welt.isl) return;

    /* Die Bühne kann beim Aufbau noch keine Größe haben: lib/tool.js
       wartet bewusst NICHT auf das Stylesheet des Werkzeugs
       („ungestylt und da ist besser als schön und zu spät"), und
       ohne dessen Regeln ist der Kasten null Pixel hoch. Dann steht
       in sicht.s eine Division durch null und jeder Bildschirmpunkt
       ist NaN — sichtbar als leeres Meer, das nie wieder aufhört.

       Also so lange nachmessen, bis es etwas zu messen gibt. Danach
       kostet die Zeile nichts. */
    if (!sicht.w || !sicht.h) {
      passeAn();
      if (!sicht.w || !sicht.h) return;
      kameraAufHauptinsel();
    }
    if (!c2d) return;

    const dtRoh = letzterT ? (now - letzterT) / 1000 : 0;
    letzterT = now;
    /* Nach oben begrenzen: kommt die Seite aus dem Hintergrund
       zurück, wäre dt sonst zwanzig Sekunden — und die halbe Herde
       stünde schlagartig woanders. */
    const dt = Math.min(.05, dtRoh);
    simZeit += dt;

    /* Tag und Nacht: rund vier Zehntel hell, ein Zehntel Übergang,
       vier Zehntel dunkel, ein Zehntel zurück. Weich gemacht — eine
       gerade Rampe knickt an beiden Enden sichtbar, und der Knick
       liest sich als Fehler im Bild. */
    const p = (simZeit % TAG_SEK) / TAG_SEK;
    const rampe = (a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
    const w0 = p < .5 ? rampe(.40, .50) : 1 - rampe(.90, 1.0);
    nacht = w0 * w0 * (3 - 2 * w0);
    if (els.veil) els.veil.style.opacity = (nacht * NACHT_TIEFE).toFixed(3);

    const tiere = welt.tiere;
    if (dt > 0) for (let i = 0; i < tiere.length; i++) schritt(tiere[i], dt, simZeit);
    if (dt > 0 && spieler) { heldSchritt(dt, simZeit); bootSchritt(dt); }

    c2d.clearRect(0, 0, sicht.w, sicht.h);
    const P = ppu();

    /* Das eigene Schiff ganz hinten: es liegt auf dem Wasser, und
       alles andere ist entweder an Land oder fliegt darüber. */
    if (spieler) bootMalen(P);

    /* Was nicht auf dem Schirm ist, wird nicht gemalt. Ohne das
       kostet das Hineinzoomen genauso viel wie die Übersicht. */
    const rand = 2.5 * P;
    const l0 = -rand, l1 = sicht.w + rand, t0 = -rand, t1 = sicht.h + rand;

    /* Die ganze Geometrie EINMAL je Tier und Bild — Lichtschein,
       Glühen und Funken brauchen alle dasselbe, und viermal
       gerechnet wäre bei 500 Tieren der teuerste Posten. */
    /* Hervorgehoben wird über die Insel und nicht am Tier: solange
       niemand etwas ausgewählt hat, sind ALLE hell — sonst müsste man
       den Normalfall erst herstellen. */
    const etwasHervor = !!(markiert || tierOffen);

    const zuMalen = [];
    for (let i = 0; i < tiere.length; i++) {
      const t = tiere[i];
      const gy = bodenY(t.x, t.y);
      const px = sxp(t.x), py = syp(t.y + gy - t.z);
      if (px < l0 || px > l1 || py < t0 || py > t1) continue;

      const schl = schluesselFuer(t);
      const blass = tierBlass(t);
      const im = blass ? grauBild(schl, t.farbe) : sprites[schl][t.farbe];
      const m = ECHSE.bilder[schl];
      t._hell = !etwasHervor
        || (markiert && markiert.has(t.id))
        || t.id === tierOffen;
      /* Hervorheben heißt AUFHELLEN und nicht Abdunkeln (Sönke,
         10.09.2026): die anderen Tiere bleiben, wie sie sind — sie
         bekommen nur keinen Ring. Eine halbdurchsichtige Insel als
         Preis für eine Auskunft wäre ein schlechter Tausch.

         Bleibt die eine Blässe, die etwas BEDEUTET: „diese Unit
         kommt gerade nicht dran". Glühen und Funken lesen sie mit,
         sonst leuchtete nachts ein abgewähltes Tier so hell wie ein
         bearbeitetes. */
      t._a = blass ? .82 : 1;
      // Der Maßstab hängt an der STUFE, nicht am Bild — deshalb
      // wächst nichts beim Einschlafen.
      let e = STUFE_EINHEIT[t.stufe] * TIER_GROESSE * P / ECHSE.blatt.h;
      // Das Zucken beim Wachsen: kurz über das Ziel hinaus und
      // zurück. Ein Sprung ohne Überschwingen liest sich als
      // Ruckler und nicht als Belohnung.
      if (t.pop > 0) e *= 1 + Math.sin(t.pop * Math.PI) * .34;
      // Das Wippen der Eier. Ein völlig reglos liegendes Ei sieht
      // aus wie ein Fehler.
      const wob = t.stufe === 0 ? Math.sin(simZeit * 1.6 + t.phase) * .022 * P : 0;

      t._im = im;
      t._w = im.width * e;
      t._h = im.height * e;
      // Der Anker sitzt auf der Grundlinie des Blattes. Alles
      // andere steht in der Zeichnung und nicht hier.
      t._x = px + (m.x - ECHSE.blatt.ankerX) * e;
      t._y = py + (m.y - ECHSE.blatt.ankerY) * e + wob;
      t._px = px;
      t._by = syp(t.y + gy);
      t._mx = t.flip ? 2 * px - t._x - t._w / 2 : t._x + t._w / 2;
      t._my = t._y + t._h / 2;
      zuMalen.push(t);
    }
    /* Und du selbst, mitten unter ihnen. */
    if (spieler) {
      const h = heldMasse(P);
      if (h) zuMalen.push(h);
    }
    /* Von hinten nach vorn, dieselbe Regel wie beim Relief.
       Sortiert nach der WELT-Reihe und nicht nach dem
       Bildschirmpunkt: sonst schöbe sich ein fliegendes Tier vor
       eines, das weiter vorne steht, nur weil es hoch in der Luft
       ist. */
    zuMalen.sort((a, b) => a.y - b.y);
    // Ab hier steht fest, was auf dem Schirm ist und wo — genau das
    // braucht der Finger (tierBei).
    sichtbar = zuMalen;

    const glow = nacht * GLOW_STAERKE;

    // 1 · Lichtschein auf dem Boden — VOR den Tieren, sonst läge das
    //     Licht auf dem Tier statt unter ihm.
    if (glow > .01) {
      c2d.globalCompositeOperation = 'lighter';
      for (const t of zuMalen) {
        const g = GLUEHEN[t.stufe];
        if (g <= 0) continue;
        const w = t._h * 1.9;
        c2d.globalAlpha = Math.min(.6, g * glow * .22 * t._a);
        c2d.drawImage(flecken[t.farbe], t._mx - w / 2, t._by - w * .19, w, w * .38);
      }
      c2d.globalAlpha = 1;
      c2d.globalCompositeOperation = 'source-over';
    }

    // 2 · Die Ringe der Hervorgehobenen — unter den Tieren.
    if (etwasHervor) ringeMalen(zuMalen, simZeit);

    // 3 · Die Tiere.
    for (const t of zuMalen) {
      // Die Figur bekommt als einzige einen Bodenschatten: sie ist
      // groß genug, dass sie ohne ihn über dem Gelände schwebt.
      if (t.held) heldSchatten(t);
      c2d.globalAlpha = t._a;
      if (t.flip) {
        /* Gespiegelt wird um den ANKER und nicht um die Bildmitte:
           sonst rutscht ein Tier beim Richtungswechsel seitlich weg,
           und zwar umso weiter, je unsymmetrischer es ist. */
        c2d.save();
        c2d.translate(t._px, 0); c2d.scale(-1, 1);
        c2d.drawImage(t._im, t._x - t._px, t._y, t._w, t._h);
        c2d.restore();
      } else {
        c2d.drawImage(t._im, t._x, t._y, t._w, t._h);
      }
    }
    c2d.globalAlpha = 1;

    /* 4 · Die Nacht auf den Tieren. `source-atop` und nicht
           `multiply`: eine Mischart malte auch dorthin, wo gar kein
           Tier steht, und machte aus der halben Bühne einen blauen
           Kasten. */
    if (nacht > .01) {
      c2d.globalCompositeOperation = 'source-atop';
      c2d.fillStyle = `rgba(9,22,40,${(nacht * NACHT_TIEFE * .78).toFixed(3)})`;
      c2d.fillRect(0, 0, sicht.w, sicht.h);
      c2d.globalCompositeOperation = 'source-over';
    }

    // 5 · Das Eigenglühen — nach dem Schleier, sonst löschte er es
    //     gleich wieder aus.
    if (glow > .01) {
      c2d.globalCompositeOperation = 'lighter';
      for (const t of zuMalen) {
        const g = GLUEHEN[t.stufe];
        if (g <= 0) continue;
        /* Eng. Bei 320 Tieren addieren sich weite Scheine über
           `lighter` zu einem milchigen Nebel, und die Insel darunter
           ist weg — ein Leuchten, das die Insel auslöscht, sagt
           nichts mehr darüber aus, WO etwas leuchtet. */
        const w = t._h * 1.6;
        // Ein leises Atmen. Dreihundert exakt gleich helle Punkte
        // sähen aus wie eine Lichterkette.
        const puls = .82 + .18 * Math.sin(simZeit * 1.5 + t.phase);
        c2d.globalAlpha = Math.min(1, g * glow * .38 * puls * t._a);
        c2d.drawImage(flecken[t.farbe], t._mx - w / 2, t._my - w / 2, w, w);
      }

      /* 6 · Die Funken. Sie gehören nicht nur zur Stufe 4: schon ein
             geschlüpftes Tier lässt zwei Fünkchen steigen, und mit
             jeder Stufe werden es mehr — dadurch liest sich der
             Fortschritt nachts nicht nur an der Helligkeit ab,
             sondern auch an der Betriebsamkeit.

             Aufgesetzt wird die Bewegung auf die Zeit und nicht
             gespeichert: fünfhundert Tiere mal acht Funken wären
             viertausend Kleinteile, die verwaltet werden wollen —
             gerechnet kosten sie eine Zeile. */
      for (const t of zuMalen) {
        const n = FUNKEN[t.stufe];
        if (!n) continue;
        const H = t._h, spark = funken[t.farbe];
        for (let k = 0; k < n; k++) {
          const eigen = t.phase + k * 2.3994;              // goldener Winkel
          const dauer = 2.2 + (k % 3) * .55;
          const u = ((simZeit / dauer + eigen) % 1 + 1) % 1;
          const fx = t._mx + Math.sin(eigen * 3.1 + u * 3.4) * H * .30;
          const fy = t._my + H * (.22 - 1.15 * u);
          const auf = Math.sin(u * Math.PI);
          const flackern = .55 + .45 * Math.sin(simZeit * 5.3 + eigen * 7);
          const fs = H * (.20 - .09 * u) * (.7 + .3 * auf);
          c2d.globalAlpha = Math.min(1, glow * auf * flackern * t._a * (t.stufe >= 4 ? .95 : .62));
          c2d.drawImage(spark, fx - fs / 2, fy - fs / 2, fs, fs);
          if (t.stufe >= 4) {
            const ws = fs * .5;
            c2d.drawImage(funke, fx - ws / 2, fy - ws / 2, ws, ws);
          }
        }
      }
      c2d.globalAlpha = 1;
      c2d.globalCompositeOperation = 'source-over';
    }

    /* 7 · Der Jubel. Ein Tier, das gerade eine Stufe gestiegen ist,
           wirft einen Funkenkranz — und zwar zu JEDER Tageszeit und
           nach dem Nachtschleier, damit man ihn auch am hellen Tag
           sieht.

           Der Kasten mit der Vokabel steht zwar davor, aber er ist
           schmal: das Aufblitzen liegt im Augenwinkel, und genau
           dorthin gehört es. Man soll merken, dass draußen etwas
           passiert ist — nachsehen kann man später. */
    let jubel = false;
    for (const t of zuMalen) if (t.burst > 0) { jubel = true; break; }
    if (jubel) {
      c2d.globalCompositeOperation = 'lighter';
      for (const t of zuMalen) {
        if (!(t.burst > 0)) continue;
        const u = 1 - t.burst;                    // 0 → frisch, 1 → vorbei
        const R = t._h * (.30 + 1.25 * u);
        const spark = funken[t.farbe];
        for (let k = 0; k < 7; k++) {
          const a = t.phase + k * .8976;          // goldener Winkel
          const gr = t._h * .30 * (1 - .5 * u);
          const fx = t._mx + Math.cos(a) * R;
          const fy = t._my + Math.sin(a) * R * .75 + t._h * .5 * u * u;
          c2d.globalAlpha = Math.min(1, 1.8 * (1 - u));
          c2d.drawImage(spark, fx - gr / 2, fy - gr / 2, gr, gr);
        }
      }
      c2d.globalAlpha = 1;
      c2d.globalCompositeOperation = 'source-over';
    }
  }

  /* ─── Die Oberfläche der eigenen Insel ──────────────────────
     Die Bühne füllt die Seite, die Leiste liegt darüber. Zwei
     Kästen kommen bei Bedarf davor: die Einstellungen und das Üben.
     Beide sind Overlays und keine zweite Ansicht — man soll seine
     Insel dabei noch sehen, das ist der halbe Grund, warum man
     übt. */
  const SOLO_HTML = `
    <div class="wi wi--solo">
      <div class="wi-stage" data-part="stage">
        <div class="wi-cam" data-part="mapwrap2"><svg class="wi-map" data-part="map"></svg></div>
        <div class="wi-night" data-part="veil"></div>
        <canvas class="wi-cvs" data-part="cvs"></canvas>
        <div class="wi-load" data-part="load">
          <b>Deine Insel wird gebaut …</b>
          <span data-part="loadtxt">Tiere werden eingefärbt</span>
        </div>
      </div>

      <!-- ── Die Unit-Leiste ────────────────────────────────────
           Sie liegt ÜBER der Bühne und ist trotzdem deren
           Geschwister und nicht ihr Kind: soloPanZoom hängt in der
           Einfang-Phase an der Bühne und schluckte sonst jeden Tipp
           auf die Leiste (Regel: feedback_field_gestures_capture_phase).

           Die Insel wird nicht verkleinert, sondern auf den REST
           zentriert — die Tiere laufen weiter über die ganze
           Leinwand, nur die Kamera weiß von einem linken Rand. -->
      <aside class="wi-units" data-part="units" hidden>
        <!-- Der Kopf sagt, worüber die Liste darunter spricht: alle
             Units zusammen, so viele Wörter, so weit gewachsen. Bis
             10.09.2026 stand dieselbe Auskunft unten in der Leiste —
             also woanders als das, was sie erklärt. -->
        <button type="button" class="wi-ugriff" data-part="ugriff" aria-expanded="true">
          <span>Units <b data-part="swords">0</b></span>
          <i class="wi-uchev" aria-hidden="true"></i>
        </button>
        <div class="wi-slegend wi-usum" data-part="slegend"></div>
        <div class="wi-ubody" data-part="ubody">
          <div class="wi-ulist" data-part="ulist"></div>
          <div class="wi-udet" data-part="udet" hidden></div>
        </div>
      </aside>

      <!-- Das Kärtchen zur angetippten Echse. Es hat einen FESTEN
           Platz unten rechts und steht nicht mehr am Finger: neben
           dem Tier lag es zwangsläufig auf anderen Tieren, und wer
           eins nach dem anderen antippt, will die Auskunft immer an
           derselben Stelle lesen und nicht suchen. -->
      <div class="wi-tcard" data-part="card" hidden></div>

      <!-- Der Kasten unten RECHTS. Er ging bis 10.09.2026 als Balken
           über die ganze Breite und hätte damit die Unit-Leiste
           unten abgeschnitten, seit die bis zur unteren Kante
           reicht. Jetzt ist er nur so breit wie seine zwei Knöpfe;
           der Abstandhalter, der sie ans rechte Ende schob, ist
           deshalb weg. -->
      <header class="wi-sbar" data-part="sbar">
        <!-- Beide gesperrt, bis die Insel steht: davor gibt es weder
             Units zum Auswählen noch ein Tier zum Anzeigen, und ein
             Knopf, der ins Leere greift, ist schlimmer als einer,
             der kurz grau ist. soloBuild macht sie frei.

             Die Einstellungen sind seit 11.09.2026 nur noch das
             Zahnrad (Sönke). Das Wort daneben machte den Kasten auf
             dem Telefon fast so breit wie die halbe Bühne, und ein
             Zahnrad muss niemand lesen. Für die Vorlesefunktion ist
             ein Bild leer — deshalb bleibt die Beschriftung als
             aria-label stehen. -->
        <button type="button" class="wi-btn wi-btn--ghost wi-sgear" data-part="ssets"
                disabled aria-label="Einstellungen" title="Einstellungen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="3.2"></circle>
            <path d="M19.9 15.2a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56v.18a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3.4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3.4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03h.18a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.03z"></path>
          </svg>
        </button>
        <button type="button" class="wi-btn" data-part="sgo" disabled>Vokabeln üben</button>
      </header>

      <!-- Einstellungen: die zwei Schalter, die nicht auf die Insel
           gehören. Kasten, Kopfzeile und Schließer sind wörtlich die
           des Pults (.wi-ov*) — wer beide Seiten benutzt, soll nichts
           Neues lernen müssen, und die Regeln dafür stehen schon da.

           Die Unit-Kacheln standen bis 10.09.2026 hier oben drüber.
           Sie sind in die Leiste umgezogen: dort sieht man, was das
           Auswählen auf der Insel BEWIRKT, und zwei Orte für denselben
           Schalter wären eine Frage zu viel. -->
      <div class="wi-ov" data-part="setsov" hidden>
        <div class="wi-ovbox">
          <div class="wi-ovhead">
            <span class="wi-ovtitle">Wie übe ich?</span>
            <button type="button" class="wi-ovclose" data-part="setsclose" aria-label="Schließen">×</button>
          </div>
          <div class="wi-ovbody">
            <span class="wi-modelab">Richtung</span>
            <div class="wi-modeseg" data-part="solodir"></div>
            <span class="wi-modelab">Wie gefragt wird</span>
            <div class="wi-modeseg" data-part="solomode"></div>
            <p class="wi-hint" data-part="modehint"></p>
          </div>
        </div>
      </div>

      <!-- ── Wer bin ich? ───────────────────────────────────────
           Aufgemacht wird er von der INSEL aus: ein Tipp auf die
           Figur oder auf das Schiff. Einen Knopf dafür gibt es
           bewusst nicht — die Figur IST der Knopf, und wer sie
           antippt, hat die Frage schon gestellt.

           Im Kasten steht die Figur und nicht das Schiff (Sönkes
           Vorgabe): das Schiff ist das, was man von weitem sieht,
           die Figur das, was man ist. Das Schiff ändert sich mit. -->
      <div class="wi-ov" data-part="volkov" hidden>
        <div class="wi-ovbox wi-ovbox--volk">
          <div class="wi-ovhead">
            <span class="wi-ovtitle">Wer bist du?</span>
            <button type="button" class="wi-ovclose" data-part="volkclose" aria-label="Schließen">×</button>
          </div>
          <div class="wi-ovbody">
            <div class="wi-vhero">
              <img class="wi-vbig" data-part="vbig" alt="" />
              <div class="wi-vtxt">
                <b data-part="vname"></b>
                <span data-part="vsub"></span>
              </div>
            </div>
            <span class="wi-modelab">Zu welchem Volk gehörst du?</span>
            <div class="wi-vrow" data-part="vrow"></div>
            <p class="wi-hint" data-part="vhint" hidden></p>
          </div>
        </div>
      </div>

      <!-- Üben. Das Tier steht ÜBER der Frage und nicht daneben:
           es ist die Rückmeldung, und die soll man sehen, ohne den
           Blick zu bewegen.

           Die Leinwand ist doppelt so groß, wie sie gezeigt wird
           (600×460 auf höchstens 340×260): auf dem iPad ist genau
           das der Unterschied zwischen einem gezeichneten Tier und
           einem verwaschenen. Wie groß sie WIRKLICH erscheint,
           entscheidet der Platz: der Tierkasten ist das einzige
           Kind des Kastens, das nachgibt (tool.css, .wi-pmon).
           Steht die Tastatur, gibt das Tier Platz ab; Rückmeldung
           und Eingabefeld geben keinen ab. -->
      <div class="wi-ov" data-part="playov" hidden>
        <div class="wi-ovbox wi-ovbox--play">
          <div class="wi-ovhead">
            <span class="wi-ovtitle" data-part="pmeta">Vokabeln üben</span>
            <button type="button" class="wi-ovclose wi-pton" data-part="pton"
                    aria-label="Ton an oder aus">♪</button>
            <button type="button" class="wi-ovclose" data-part="pclose" aria-label="Schließen">×</button>
          </div>
          <!-- Der Balken der Runde. Er steht ÜBER dem scrollenden
               Rumpf, damit er auf dem iPad neben der Tastatur nicht
               weggeschoben wird — er ist die einzige Auskunft im
               Kasten, die über die eine Frage hinausgeht.

               Bis 10.09.2026 stand hier „Runde 2 · noch 30 von 30".
               Sönke: „die versteht man ja nicht." Der Balken sagt
               dasselbe ohne Zahlenpaar — und er zählt Kopien statt
               Wörter, geht also bei JEDER Antwort ein Stück hoch
               (Migration 0141). -->
          <div class="wi-prog" data-part="pprog" role="progressbar"
               aria-valuemin="0" aria-valuemax="100" hidden>
            <div class="wi-progbar"><i data-part="pprogi"></i></div>
            <b class="wi-progn" data-part="pprogn"></b>
          </div>
          <div class="wi-pmon" data-part="pmon">
            <canvas data-part="pcvs" width="600" height="460"></canvas>
            <span class="wi-pstage" data-part="pstage"></span>
            <!-- Das „i" sitzt beim Tier, weil die Frage dahinter beim
                 Tier entsteht: „wie oft hatte ich das schon?" -->
            <button type="button" class="wi-pinfo" data-part="pinfo"
                    aria-label="Wie oft hattest du dieses Wort?">i</button>
            <!-- Die gefragte Richtung, mehr nicht: „EN→DE". Sie sitzt
                 dem Stufennamen (unten links) gegenüber und ersetzt
                 die ausgeschriebene Frage über dem Wort — zwei Zeilen
                 für dieselbe Auskunft sind eine zu viel.

                 Bis 10.09.2026 standen hier zusätzlich drei Kästchen
                 (Punktekonto der Richtung bis zur nächsten Stufe).
                 Sönke: „der Kasten en-de mit den 3 quadraten versteht
                 keiner und der ist auch manchmal falsch." Sie sind
                 raus — und mit ihnen die einzige Anzeige, die von
                 einer Zahl abhing, die zwischen Antwort und nächster
                 Frage veralten konnte.

                 Die Zahl daneben (+3 / +1 / −3) kommt nur für einen
                 Augenblick — sie sagt, WARUM sich gerade etwas
                 bewegt hat, und verschwindet mit der nächsten
                 Frage. -->
            <div class="wi-pdir" data-part="pdir" hidden></div>
            <b class="wi-pdelta" data-part="pdelta" hidden></b>
            <div class="wi-stats" data-part="pstats" hidden></div>
          </div>
          <!-- ── Was scrollt und was steht ────────────────────────
               Nur die Frage und die acht Kacheln liegen im
               scrollenden Teil. Rückmeldung und Eingabefeld sind
               GESCHWISTER davon und stehen fest am unteren Rand des
               Kastens.

               Der Grund ist die Bildschirmtastatur: sie schiebt den
               sichtbaren Bereich auf einen Streifen zusammen
               (--vv-h), und alles, was dann noch mitscrollt,
               verschwindet als Erstes. Das Eingabefeld war genau das
               — man tippte in etwas, das man nicht sah (Sönke,
               10.09.2026). Das Wort bleibt trotzdem im Blick: es
               klebt oben am Scroller (position: sticky). -->
          <div class="wi-ovbody wi-pbody">
            <p class="wi-word" data-part="pword"></p>
            <div class="wi-opts" data-part="popts" hidden></div>
          </div>
          <p class="wi-fb" data-part="pfb" hidden></p>
          <!-- Kein <form> und kein <input>: warum, steht bei
               feldBauen() weiter oben. Auf dem Telefon ist das der
               Unterschied zwischen einer Zeile Kasten und einer
               Zeile Chrome-Ausfüllhilfe. -->
          <div class="wi-type" data-part="pform">
            <span class="wi-in" data-part="pin" contenteditable="true"
                  role="textbox" aria-label="Antwort" data-ph="Antwort"
                  autocapitalize="off" autocorrect="off" spellcheck="false"
                  enterkeyhint="send" inputmode="text"></span>
            <button class="wi-btn" type="button" data-part="pgo">Prüfen</button>
          </div>
        </div>
      </div>

      <!-- ── Die Bühne für den Stufensprung ──────────────────────
           Sönkes Ansage (10.09.2026): „ich würde diese Animation
           gerne auf dem Display sehen als direkt in der Ansicht, in
           der ich die Vokabeln trainiere."

           Und er hat recht, und zwar aus einem Grund, den man am
           Schreibtisch nicht sieht: beim Tippen steht auf dem iPad
           die Tastatur, der Übungskasten ist auf einen Streifen
           zusammengeschoben, und die kleine Karte darin liegt genau
           dort, wo gerade niemand hinsieht. Eine Belohnung, die man
           suchen muss, ist keine.

           Also liegt sie jetzt ÜBER allem, groß, mit der eigenen
           Insel als Hintergrund — der Übungskasten tritt dafür kurz
           zurück. Dieselbe Zeichenschleife, nur eine andere
           Leinwand. -->
      <div class="wi-cheer" data-part="cheer" hidden>
        <canvas data-part="ccvs"></canvas>
        <div class="wi-plevel" data-part="plevel" hidden>
          <b data-part="plevelb"></b>
          <span data-part="plevels"></span>
        </div>
      </div>
    </div>`;

  /* Der Stand der eigenen Insel. Anders als im Raum gibt es hier
     keinen Poller: außer dem Kind selbst ändert niemand etwas
     daran. Geholt wird einmal beim Öffnen, danach führt der Client
     die Stufen selbst nach — die Antwort des Servers sagt ihm ja,
     was aus dem Wort geworden ist. */
  let solo = null;          // { seed, words, sets, settings, stufen: Map, setVon: Map, aktiv: Set }
  let soloTask = null;
  let soloLockT = 0;

  /* ─── Was gerade hervorgehoben ist ──────────────────────────
     Drei Zustände nebeneinander, und sie meinen verschiedene Dinge:

       markiert   die Tiere EINER Unit (das „i" in der Leiste)
       tierOffen  das EINE angetippte Tier (das Kärtchen)
       randLinks  wie viel Platz die Leiste der Insel wegnimmt

     Sie liegen hier draußen und nicht in `solo`, weil die
     Zeichenschleife sie bei jedem Bild anfasst — und weil sie eine
     Insel überdauern dürfen, ohne dass jemand sie mitschleppt. */
  let unitsAuf = false;
  let unitOffen = null;     // { id, daten|null, auf: Set<itemId> }
  let markiert = null;      // Set<itemId> | null
  let tierOffen = null;     // itemId
  let randLinks = 0;
  const unitCache = new Map();   // setId → Antwort von wi_solo_unit
  const grauCache = new Map();   // `${schlüssel}|${farbe}` → blasse Leinwand
  const monsCache = new Map();   // `${schlüssel}|${farbe}` → data:-URL für die Liste

  const WI_UNITS_KEY = 'mpskills.wordisland.units';

  const SOLO_DIR = [
    ['mixed', 'gemischt'], ['de_en', 'Deutsch → Englisch'], ['en_de', 'Englisch → Deutsch']
  ];
  const SOLO_MODE = [['type', 'tippen'], ['choice', 'auswählen']];
  const STUFEN_NAME = ['Eier', 'geschlüpft', 'gewachsen', 'ausgewachsen', 'funkelnd'];

  function buildSolo() {
    root.innerHTML = SOLO_HTML;
    // Frischer Kasten, frischer Balken: der leere Balken im neuen
    // DOM und ein stehengebliebener Rundenstand aus dem alten wären
    // sonst uneins, und der erste Sprung liefe als Bewegung ab.
    rundeNo = 0; rundePct = 0;
    els = {
      stage: q('stage'), mapwrap2: q('mapwrap2'), map: q('map'),
      veil: q('veil'), cvs: q('cvs'), load: q('load'), loadTxt: q('loadtxt'),
      sWords: q('swords'), sLegend: q('slegend'),
      units: q('units'), uGriff: q('ugriff'), uBody: q('ubody'),
      uList: q('ulist'), uDet: q('udet'), card: q('card'), sBar: q('sbar'),
      setsOv: q('setsov'),
      volkOv: q('volkov'), vBig: q('vbig'), vName: q('vname'),
      vSub: q('vsub'), vRow: q('vrow'), vHint: q('vhint'),
      soloDir: q('solodir'), soloMode: q('solomode'), modeHint: q('modehint'),
      playOv: q('playov'), pMeta: q('pmeta'), pMon: q('pmon'),
      pProg: q('pprog'), pProgI: q('pprogi'), pProgN: q('pprogn'),
      pCvs: q('pcvs'), pStage: q('pstage'),
      pInfo: q('pinfo'), pStats: q('pstats'),
      pDir: q('pdir'), pDelta: q('pdelta'),
      cheer: q('cheer'), cCvs: q('ccvs'),
      pLevel: q('plevel'), pLevelB: q('plevelb'), pLevelS: q('plevels'),
      pTon: q('pton'),
      pWord: q('pword'), pForm: q('pform'), pIn: q('pin'),
      pOpts: q('popts'), pFb: q('pfb')
    };

    q('ssets').addEventListener('click', () => { els.setsOv.hidden = false; renderSoloSets(); });
    q('setsclose').addEventListener('click', () => { els.setsOv.hidden = true; });
    q('volkclose').addEventListener('click', () => { els.volkOv.hidden = true; });
    // Am umschließenden Kasten und nicht an den acht Knöpfen: die
    // Reihe wird bei jeder Wahl neu geschrieben.
    els.vRow.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) volkSetzen(+b.dataset.v);
    });
    q('sgo').addEventListener('click', soloStart);
    q('pclose').addEventListener('click', () => {
      els.playOv.hidden = true;
      soloTask = null;
      /* Auch der wartende Zeitgeber muss weg. Sonst reicht er nach
         einer Sekunde die nächste Frage in einen Kasten nach, den
         gerade jemand zugemacht hat — und beim nächsten Öffnen
         stünde dort ein Wort ohne Anfang. */
      clearTimeout(feierT);
      feiernd = false;
      zeigeStats(false);
      zeigeDelta(0);
      kartHalt();
      /* Wer geübt hat, hat Zahlen verändert — und die Übersichten in
         der Leiste sind eine Momentaufnahme von vorher. Der Cache
         geht weg, das Offene wird neu geholt. Beim Üben selbst
         passiert das absichtlich NICHT: ein Aufruf je Antwort für
         eine Liste, die gerade niemand ansieht, wäre der teuerste
         Weg, dasselbe zu erfahren. */
      unitVergessen();
      if (unitOffen) unitDetail(unitOffen.id, true);
      if (tierOffen) kartenNeu();
    });

    els.pInfo.addEventListener('click', e => {
      e.stopPropagation();
      zeigeStats(els.pStats.hidden);
    });
    // Ein Tipp irgendwo auf das Tier schließt die Übersicht wieder.
    // Ein zweiter Knopf zum Zumachen wäre ein Knopf zu viel.
    els.pMon.addEventListener('click', () => { if (!els.pStats.hidden) zeigeStats(false); });

    tonLaden();
    zeigeTonKnopf();
    els.pTon.addEventListener('click', () => {
      tonSetzen(!tonAn);
      zeigeTonKnopf();
      // Wer den Ton einschaltet, soll ihn sofort hören — sonst weiß
      // er erst bei der nächsten richtigen Antwort, ob er laut ist.
      if (tonAn) tonSpiel(2);
    });
    // Ein Tipp neben den Kasten schließt ihn. Auf dem Tablet ist das
    // der Griff, den man ohne Erklärung findet.
    for (const ov of [els.setsOv, els.playOv, els.volkOv]) {
      ov.addEventListener('click', e => { if (e.target === ov) ov.hidden = true; });
    }

    feldBauen(els.pIn, soloSend);
    feldKnopf(q('pgo'), els.pIn, soloSend);
    els.pOpts.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) soloSend(b.dataset.v);
    });

    /* Die Leiste. Alle drei Zuhörer sitzen an den UMSCHLIESSENDEN
       Kästen: ihr Inhalt wird bei jeder Änderung neu geschrieben, an
       den Zeilen selbst wären sie nach dem ersten Klick weg. */
    els.uGriff.addEventListener('click', () => unitsSetzen(!unitsAuf));
    els.uList.addEventListener('click', unitListeClick);
    els.uDet.addEventListener('click', unitDetailClick);
    els.card.addEventListener('click', e => {
      if (e.target.closest('[data-zu]')) kartenZu();
    });
    unitsLaden();

    soloPanZoom(els.stage);
  }

  /* Die Insel aufbauen. Drei Dinge in einer festen Reihenfolge, und
     die Reihenfolge ist keine Bequemlichkeit: die Felder kommen aus
     dem Startwert, das Relief aus den Feldern, und die Tiere
     brauchen das Relief (Bodenhöhe). */
  async function soloBuild(v) {
    solo = {
      seed: v.learner.seed | 0,
      words: v.learner.words | 0,
      grown: v.learner.grown | 0,
      sets: v.learner.sets || [],
      settings: v.learner.settings || {},
      stufen: new Map(),
      /* Wort → Unit. Ohne diese Karte wäre jedes Tier namenlos: die
         Leiste könnte weder hervorheben noch blass zeichnen, und ein
         Tipp auf eine Echse wüsste nicht, wo er nachfragen soll.
         Kommt seit Migration 0142 als `u` mit (feld leer = ältere
         Datenbank, siehe unitsAlt). */
      setVon: new Map(),
      /* Und dieselbe Zuordnung andersherum. Sie wird bei JEDER
         Antwort gebraucht (die Stufenpunkte je Unit), und über
         achthundert Wörter zu laufen, um dreißig zu finden, wäre der
         teuerste Weg zu einer Zahl, die sich nie ändert: welches
         Wort in welcher Unit liegt, steht für diese Sitzung fest. */
      proSet: new Map(),
      aktiv: new Set()
    };
    for (const w of (v.words_list || [])) {
      solo.stufen.set(w.i, w.s | 0);
      if (!w.u) continue;
      solo.setVon.set(w.i, w.u);
      if (!solo.proSet.has(w.u)) solo.proSet.set(w.u, []);
      solo.proSet.get(w.u).push(w.i);
    }
    aktivMerken();

    /* Wie viele Satelliten schon aufgetaucht sind. Die Hauptinsel
       steht immer — die kleinen kommen mit dem Wortschatz. */
    const sat = SAT_SCHWELLEN.filter(s => solo.words >= s).length;
    const list = wuerfelInseln(solo.seed, sat);

    /* Derselbe Startwert für das Gelände wie für die Form: Wald,
       Fels und Strandbreite sollen zur Insel gehören und nicht bei
       jedem Öffnen anders liegen. */
    welt.haupt = null;
    welt.isl = buildMap(els.map, list, 'solo' + solo.seed, { solo: true });
    welt.vb = els.map.getAttribute('viewBox').split(' ').map(Number);
    welt.inseln = findeInseln(welt.isl);

    /* Ein Tier je Wort. Reihenfolge und Zuordnung kommen aus der
       id — dieselbe Vokabel ist auf jedem Gerät dasselbe Tier. */
    welt.tiere = [];
    welt.nachStufe = new Map();
    for (const [id, st] of solo.stufen) {
      const t = neuesTier(id, st);
      /* Frisch aufgestellte Flieger übers Archipel verteilen. Sie
         entstehen auf der Hauptinsel und würden sonst als Haufen
         dastehen, während sechs Inseln leer sind — im Spiel ist das
         richtig (wer aufsteigt, hebt dort ab, wo er steht), beim
         AUFBAU sieht es falsch aus. */
      if (st >= 3 && welt.inseln.length > 1) {
        const j = (Math.random() * welt.inseln.length) | 0;
        const p = zufallsPunktAuf(welt.inseln[j], Math.random);
        t.inselIdx = j; t.x = p.x; t.y = p.y;
      }
      neuesZiel(t);
      welt.tiere.push(t);
      welt.nachStufe.set(id, t);
    }

    /* Und zuletzt du selbst. Nach den Inseln, weil Figur und Schiff
       beide die Hauptinsel brauchen — und nach den Tieren, weil die
       Figur zwischen ihnen steht und nicht vor ihnen. */
    spielerAufstellen();

    /* Erst jetzt: vorher stünde die Leiste über „Deine Insel wird
       gebaut …" und behauptete „Noch nichts freigespielt" — über eine
       Insel, die es in diesem Augenblick noch gar nicht gibt. */
    els.units.hidden = false;
    passeAn();
    randMessen();
    kameraAufHauptinsel();
    renderSoloBar();
    renderUnits();
    q('ssets').disabled = false;
    q('sgo').disabled = false;
    els.load.hidden = true;
    if (!raf) raf = requestAnimationFrame(zeichne);
  }

  /* Die Stufen als Punktreihe. Einmal für die ganze Insel (untere
     Leiste), einmal je Unit (Leiste links) — dieselbe Auskunft in
     derselben Form, damit man sie nicht zweimal lesen lernen muss. */
  function stufenLegende(ids) {
    const zaehl = [0, 0, 0, 0, 0];
    for (const id of ids) {
      const s = solo.stufen.get(id);
      if (s === undefined) continue;
      zaehl[Math.max(0, Math.min(4, s | 0))]++;
    }
    /* Die Legende ist eine AUSKUNFT und keine Zierde: sie sagt, wo
       die Arbeit noch liegt. Stufen ohne Tiere werden weggelassen —
       eine Null erklärt nichts. */
    return zaehl.map((n, s) => !n ? '' :
      `<span class="wi-lg wi-lg--${s}" title="${esc(STUFEN_NAME[s])}">
         <i></i>${n}</span>`).join('');
  }

  function renderSoloBar() {
    if (!solo) return;
    /* „Units (118)" — dieselbe Form wie über einer einzelnen Unit
       („Schule (24)"). Die Klammer steht hier und nicht im HTML,
       damit nicht doch einmal ein „Units ()" über einer leeren Insel
       hängen bleibt. */
    els.sWords.textContent = solo.words ? '(' + solo.words + ')' : '';
    els.sLegend.innerHTML = stufenLegende(solo.stufen.keys());
    // Nach einem Stufensprung stimmen auch die Punkte an der Unit
    // sofort — es ist dieselbe Zahl, nur enger gefasst.
    renderUnits();
  }

  /* ─── Das eigene Menü ───────────────────────────────────────
     Nur noch zwei Schalter: WIE gefragt wird. WORAN gearbeitet wird,
     steht seit 10.09.2026 in der Leiste links — dort sieht man, was
     das Auswählen auf der Insel bewirkt. */
  function soloChosen() {
    const s = (solo.settings && solo.settings.sets) || [];
    return s.length ? s : solo.sets.map(x => x.id);
  }

  /* Die gewählten Units als Menge, EINMAL gerechnet: die
     Zeichenschleife fragt sie bei jedem Tier und jedem Bild ab, und
     `Array.includes` wäre dort fünfhundertmal je Sechzigstel. */
  function aktivMerken() {
    if (!solo) return;
    solo.aktiv = new Set(soloChosen());
  }

  function renderSoloSets() {
    if (!solo) return;

    const seg = (host, paare, jetzt, beiWahl) => {
      host.innerHTML = paare.map(([v, t]) =>
        `<button type="button" class="wi-modebtn${v === jetzt ? ' is-on' : ''}" ` +
        `data-v="${v}" aria-pressed="${v === jetzt}">${esc(t)}</button>`).join('');
      host.onclick = e => {
        const b = e.target.closest('button');
        if (b) beiWahl(b.dataset.v);
      };
    };
    seg(els.soloDir, SOLO_DIR, solo.settings.dir || 'mixed', v => soloSetzen({ p_dir: v }));
    seg(els.soloMode, SOLO_MODE, solo.settings.mode || 'type', v => soloSetzen({ p_mode: v }));

    /* Der Satz unter den Schaltern erklärt die FOLGE und nicht den
       Knopf. „gemischt" ist voreingestellt, weil ein Tier erst
       schlüpft, wenn sein Wort in BEIDE Richtungen saß — wer nur
       eine Richtung übt, sieht auf seiner Insel nichts passieren,
       und das wäre die undurchschaubarste Enttäuschung von allen. */
    /* Dazu der Satz zum Abfrage-Modus. Er muss die Folge erklären,
       ohne zu rechnen: „zählt ein Drittel" ist wahr und trotzdem
       falsch formuliert — ein Bruch in einem Menü, das ein Kind
       allein bedient, ist eine Hürde und keine Auskunft. */
    els.modeHint.textContent = ((solo.settings.dir || 'mixed') === 'mixed'
      ? 'Ein Tier schlüpft erst, wenn du sein Wort in beide Richtungen kannst.'
      : 'Achtung: In nur einer Richtung wachsen deine Tiere nicht weiter.')
      + ' ' + ((solo.settings.mode || 'type') === 'choice'
        ? 'Beim Auswählen wachsen deine Tiere langsamer — dafür kostet ein Fehler fast nichts.'
        : 'Was du selbst tippst, bringt dein Tier am weitesten. Mit Hilfe zählt es weniger.');
  }

  async function soloSetzen(args) {
    const r = await ctx.actions.call('wi_solo_settings', args);
    if (!r.ok) { ctx.toast(ctx.errText(r.error)); return; }
    solo.settings = r.settings || {};
    // Die laufende Aufgabe ist am Server weggefallen (sie könnte aus
    // einer abgewählten Unit stammen) — hier auch.
    soloTask = null;
    aktivMerken();
    renderSoloSets();
    renderUnits();
  }

  /* ─── Dein Volk ─────────────────────────────────────────────
     Der Kasten hinter der Figur. Er zeigt sie groß und darunter die
     acht Völker zur Wahl — mehr steht hier noch nicht, und das ist
     Absicht: das eigene Level kommt als Nächstes, und es gehört
     genau hierher. */
  function volkOeffnen() {
    if (!spieler || !els.volkOv) return;
    /* Das Kärtchen der zuletzt angetippten Echse geht mit zu. Beide
       beantworten dieselbe Frage („was ist das da?"), und wer auf
       sich selbst tippt, hat die alte Antwort damit weggelegt — ein
       Kärtchen, das unter dem offenen Kasten stehen bleibt, ist beim
       Schließen eine Überraschung. */
    kartenZu();
    els.volkOv.hidden = false;
    renderVolk();
  }

  function renderVolk() {
    if (!spieler || !els.volkOv || els.volkOv.hidden) return;
    const n = spieler.volk;
    els.vBig.src = volkBild(n);
    els.vBig.alt = volkName(n);
    els.vName.textContent = volkName(n);
    els.vSub.textContent = 'Deine Figur läuft über die Insel, dein Schiff fährt davor.';

    /* Die Reihe zeigt die FIGUR jedes Volkes und nicht sein Wappen:
       gewählt wird, wer man ist. Der Daumennagel ist derselbe
       Zuschnitt, nur klein (heldsprites.mjs) — also genau das Bild,
       das man danach auf der Insel wiederfindet. */
    els.vRow.innerHTML = TEAMS.map((t, i) =>
      `<button type="button" class="wi-vbtn${i === n ? ' is-on' : ''}" data-v="${i}"
               style="--vf:${t.color}" aria-pressed="${i === n}">
         <img src="${esc(volkDaumen(i))}" alt="" loading="lazy" />
         <span>${esc(t.name)}</span>
       </button>`).join('');

    /* „Gemerkt" und „nur hier gemerkt" dürfen nie gleich aussehen.
       Fehlt Migration 0143, funktioniert die Wahl trotzdem — sie
       bleibt dann aber an diesem Gerät, und das steht dann da. */
    els.vHint.hidden = !volkNurHier;
    els.vHint.textContent = volkNurHier
      ? 'Dein Volk merkt sich gerade nur dieses Gerät — in der Datenbank fehlt die neueste Migration.'
      : '';
  }

  async function volkSetzen(n) {
    if (!spieler || !(n >= 0 && n < TEAMS.length) || n === spieler.volk) return;
    /* Sofort umschalten, den Server danach fragen — dasselbe Muster
       wie bei den Wappen in der Lobby. Ein Kind, das sein Volk
       wechselt, soll die Figur wechseln sehen und nicht auf eine
       Antwort warten. */
    spieler.volk = n;
    volkBilderLaden();
    if (solo) solo.settings = Object.assign({}, solo.settings, { faction: n });
    try { localStorage.setItem(WI_VOLK_KEY, String(n)); } catch (e) { /* egal */ }
    renderVolk();

    const r = await ctx.actions.call('wi_solo_avatar', { p_faction: n });
    if (r.ok) {
      if (r.settings) solo.settings = r.settings;
      volkNurHier = false;
    } else {
      /* Eine fehlende Migration ist kein Netzfehler und keine
         Ablehnung: die Wahl steht, sie steht nur nicht am Server.
         Alles andere ist ein echter Fehler und gehört in den Toast. */
      volkNurHier = true;
      if (r.error !== 'fn_missing') ctx.toast(ctx.errText(r.error));
    }
    renderVolk();
  }

  /* ══════════════════════════════════════════════════════════
     Die Unit-Leiste
     ══════════════════════════════════════════════════════════
     Sönke, 10.09.2026: „am Rand die Unit-Liste […] Ich kann eine
     durch Draufklicken aktivieren oder deaktivieren. Man spielt nur
     die aktivierten Units, auf der Insel sind Echsen von
     deaktivierten Units leicht entsättigt."

     Der Schalter gab es schon (settings.sets), aber er lag als
     Kachelgitter in einem Overlay: man wählte im Dunkeln und sah
     nichts davon. Hier steht er neben der Insel, und die Insel
     antwortet — blass ist, was gerade nicht drankommt.

     Die Leiste macht darüber hinaus etwas, das keine Einstellung
     kann: sie ERKLÄRT die Insel. Welches Tier gehört zu welcher
     Unit, wie weit ist die Unit, welche Wörter stecken darin. */

  /* Zugeklappt bleibt nur der Griff. Der Zustand hängt am GERÄT und
     nicht am Kind: am Telefon ist die Insel schmal, am Rechner
     breit — das ist eine Frage des Bildschirms und keine des
     Kontos, und deshalb steht sie im localStorage. */
  function unitsLaden() {
    let auf = null;
    try {
      const v = localStorage.getItem(WI_UNITS_KEY);
      if (v === '0' || v === '1') auf = v === '1';
    } catch (e) { /* egal */ }
    if (auf === null) {
      let schmal = false;
      try {
        schmal = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
      } catch (e) { /* egal */ }
      auf = !schmal;
    }
    unitsSetzen(auf);
  }

  function unitsSetzen(auf) {
    unitsAuf = !!auf;
    if (!els.units) return;
    els.units.classList.toggle('is-zu', !unitsAuf);
    els.uGriff.setAttribute('aria-expanded', unitsAuf ? 'true' : 'false');
    els.uBody.hidden = !unitsAuf;
    // Die Stufenpunkte gehören zur Liste und nicht zum Griff: sie
    // erklären, was darunter steht.
    if (els.sLegend) els.sLegend.hidden = !unitsAuf;
    // Zugeklappt gibt es nichts mehr, worauf sich ein Hervorheben
    // beziehen könnte. Ein goldener Kranz ohne die Liste dazu wäre
    // ein Rätsel.
    if (!unitsAuf && unitOffen) unitZurueck();
    try { localStorage.setItem(WI_UNITS_KEY, unitsAuf ? '1' : '0'); } catch (e) { /* egal */ }

    const alt = randLinks;
    randMessen();
    /* Nicht auf die Hauptinsel zurückspringen, sondern SCHIEBEN: wer
       die Leiste aufmacht, will die Liste sehen und nicht seinen
       Ausschnitt verlieren. Die Leiste steht links — wird sie
       breiter, rutscht die Mitte des freien Fensters nach RECHTS. */
    if (sicht.w && randLinks !== alt) {
      kamera.tx += (randLinks - alt) / 2;
      kameraAnwenden();
    }
  }

  /* Wie viel Platz die Leiste der Insel wegnimmt. Die Bühne selbst
     bleibt so groß, wie sie ist — die Tiere laufen weiter über die
     ganze Leinwand, auch hinter der Leiste. Nur die KAMERA weiß von
     einem linken Rand und zentriert auf den Rest.

     Dieselbe Zahl bekommt das Stylesheet als `--wi-rand`: das
     Kärtchen steht rechts und darf auf einem schmalen Gerät nicht
     unter die Leiste wachsen — wie breit die gerade ist, weiß nur,
     wer sie gemessen hat.

     Der Knopf-Kasten liest die Zahl NICHT mehr (Sönke, 11.09.2026:
     „die soll stabil bleiben"). Er hatte daraus eine Höchstbreite
     gemacht, und weil seine zwei Knöpfe nicht schrumpfen, quollen
     sie beim Aufklappen der Unit-Leiste rechts aus ihrem eigenen
     Kasten heraus — es sah aus, als würde er weggeschoben. Er steht
     jetzt fest an der rechten unteren Ecke; untereinander geraten
     die beiden trotzdem nie, weil die Unit-Leiste auf schmalen
     Geräten über ihm endet (tool.css, @media). */
  function randMessen() {
    randLinks = 0;
    if (unitsAuf && els.units && sicht.w) {
      const b = els.units.getBoundingClientRect();
      // Der Deckel ist der Riegel gegen einen Kasten, der (etwa im
      // Prüfstand) so breit meldet wie die ganze Bühne.
      if (b.width) randLinks = Math.min(b.width + 20, sicht.w * .5);
    }
    if (root && root.style) {
      root.style.setProperty('--wi-rand', Math.round(randLinks) + 'px');
    }
    /* Wie hoch der Knopf-Kasten ist. Kärtchen und Unit-Leiste enden
       DARÜBER, und dafür stand bis 11.09.2026 an zwei Stellen im
       Stylesheet eine 76 — geraten aus Polsterung und Schriftgröße.
       Die Rechnung ging knapp auf, und „knapp" heißt: das Kärtchen
       saß dem Kasten auf. Gemessen hält der Abstand auch dann, wenn
       die Schrift größer wird. */
    if (els.sBar && root && root.style) {
      const s = els.sBar.getBoundingClientRect();
      if (s.height) root.style.setProperty('--wi-sbar-h', Math.round(s.height) + 'px');
    }
  }

  /* Fehlt `u` an den Wörtern, ist die Datenbank älter als dieses
     Werkzeug — und NICHT „die Wörter gehören zu keiner Unit". Die
     beiden zu verwechseln kostet eine halbe Stunde Suche an der
     falschen Stelle (Regel: feedback_missing_migration_looks_like_network). */
  function unitsAlt() {
    return !!solo && solo.stufen.size > 0 && solo.setVon.size === 0;
  }
  const MIG_HINWEIS = 'Diese Übersicht braucht die neueste Fassung der '
    + 'Datenbank (Migration 0142).';

  const idsVon = setId => (solo && solo.proSet.get(setId)) || [];

  function renderUnits() {
    if (!solo || !els.uList) return;
    els.uList.innerHTML = solo.sets.length
      ? solo.sets.map(s => {
          const an = solo.aktiv.has(s.id);
          const ids = idsVon(s.id);
          return `
            <div class="wi-urow${an ? ' is-on' : ''}">
              <button type="button" class="wi-utoggle" data-an="${esc(s.id)}"
                      aria-pressed="${an}">
                <b>${esc(s.title)} <span class="wi-uzahl">(${
                  ids.length || (s.count | 0)})</span></b>
                <span class="wi-slegend">${stufenLegende(ids)}</span>${
                  /* „pausiert" steht in einer eigenen Zeile und nicht
                     hinter dem Titel: der Titel wird bei Bedarf
                     abgeschnitten, und ausgerechnet der Zustand darf
                     das nicht sein. */
                  an ? '' : '<span class="wi-umeta">pausiert</span>'}
              </button>
              <button type="button" class="wi-uinfo${
                unitOffen && unitOffen.id === s.id ? ' is-on' : ''}"
                      data-info="${esc(s.id)}"
                      aria-label="Übersicht zu ${esc(s.title)}">i</button>
            </div>`;
        }).join('')
        + '<p class="wi-uhint">Abgefragt wird nur, was an ist. Die anderen Tiere '
        + 'bleiben auf deiner Insel — sie sind nur blass.</p>'
      : '<p class="wi-uhint">Noch nichts freigespielt. Deine Insel wächst, sobald '
        + 'du bei einer Wordisland-Stunde dabei warst.</p>';

    if (unitOffen) renderUnitDetail();
  }

  function unitListeClick(e) {
    const an = e.target.closest('[data-an]');
    if (an) { unitToggle(an.dataset.an); return; }
    const info = e.target.closest('[data-info]');
    if (info) unitOeffnen(info.dataset.info);
  }

  /* Am Server heißt „nichts gewählt" nämlich „alles" (wi_solo_chosen,
     0136). Wer die letzte Unit ausschaltet, bekäme also alle zurück —
     das sähe aus wie ein Fehler und wäre keiner. Also lassen wir die
     letzte stehen und sagen es. */
  function unitToggle(id) {
    const gewaehlt = new Set(soloChosen());
    if (gewaehlt.has(id)) {
      if (gewaehlt.size <= 1) {
        ctx.toast('Eine Unit muss anbleiben — sonst gibt es nichts zu üben.');
        return;
      }
      gewaehlt.delete(id);
    } else {
      gewaehlt.add(id);
    }
    soloSetzen({ p_sets: [...gewaehlt] });
  }

  /* ─── Eine Unit im Einzelnen ────────────────────────────────
     Sie ersetzt die Liste IN der Leiste und nicht die Insel: die
     hervorgehobenen Tiere sind der halbe Sinn der Übersicht, und ein
     Vollbild-Kasten läge genau darüber. */
  function unitOeffnen(id) {
    if (unitOffen && unitOffen.id === id) { unitZurueck(); return; }
    unitOffen = { id, daten: null, fehler: null, auf: new Set() };
    // Sofort, ohne auf den Server zu warten: die Zugehörigkeit steht
    // schon auf dem Gerät.
    markiert = new Set(idsVon(id));
    kartenZu();
    els.uList.hidden = true;
    els.uDet.hidden = false;
    renderUnitDetail();
    unitDetail(id);
  }

  function unitZurueck() {
    unitOffen = null;
    markiert = null;
    if (!els.uList) return;
    els.uList.hidden = false;
    els.uDet.hidden = true;
    els.uDet.innerHTML = '';
    renderUnits();
  }

  async function unitDetail(id, nurWennOffen) {
    if (nurWennOffen && !(unitOffen && unitOffen.id === id)) return;
    const d = await unitDaten(id);
    if (!unitOffen || unitOffen.id !== id) return;
    if (d && d.ok) { unitOffen.daten = d; unitOffen.fehler = null; }
    else { unitOffen.daten = null; unitOffen.fehler = (d && d.error) || 'network'; }
    renderUnitDetail();
  }

  function renderUnitDetail() {
    if (!unitOffen || !els.uDet) return;
    const s = solo.sets.find(x => x.id === unitOffen.id) || {};
    const an = solo.aktiv.has(unitOffen.id);
    const ids = idsVon(unitOffen.id);
    const d = unitOffen.daten;
    const rumpf = d
      ? statsGitter(d.total, true)
        + `<div class="wi-wlist">${(d.words || []).map(wortZeile).join('')}</div>`
      : `<p class="wi-stnote">${unitOffen.fehler
          ? esc(unitOffen.fehler === 'fn_missing' ? MIG_HINWEIS : ctx.errText(unitOffen.fehler))
          : 'Einen Moment …'}</p>`;

    els.uDet.innerHTML = `
      <div class="wi-uhead">
        <button type="button" class="wi-uback" data-zurueck>‹ Alle Units</button>
        <button type="button" class="wi-uswitch${an ? ' is-on' : ''}"
                data-an="${esc(unitOffen.id)}" aria-pressed="${an}">${
          an ? 'wird geübt' : 'pausiert'}</button>
      </div>
      <b class="wi-utitle">${esc(s.title || 'Unit')} <span class="wi-uzahl">(${
        ids.length || (s.count | 0)})</span></b>
      <div class="wi-slegend">${stufenLegende(ids)}</div>
      ${rumpf}`;
  }

  /* Eine Zeile der Vokabelliste: Tier, Wort, vier Zahlen. Die vier
     sind die Summe BEIDER Richtungen — für den Überblick ist „wie
     oft hatte ich das" die Frage und nicht „in welcher Richtung".
     Wer es genauer will, tippt die Zeile an. */
  function wortZeile(w) {
    const auf = unitOffen.auf.has(w.i);
    const z = summeVon(w.st);
    const bild = monsterUrl(w.i);
    return `
      <button type="button" class="wi-wrow${auf ? ' is-auf' : ''}" data-i="${esc(w.i)}">
        ${bild ? `<img class="wi-wmon" src="${bild}" alt="" width="34">`
               : '<span class="wi-wmon"></span>'}
        <span class="wi-wtext"><b>${esc(w.t)}</b><i>→</i><span>${esc(w.x)}</span></span>
        <em class="wi-wnum">
          <b class="is-gut">${z[0]}</b><b class="is-hilf">${z[1]}</b>
          <b class="is-bad">${z[2]}</b><b class="is-alle">${z[3]}</b>
        </em>
      </button>
      ${auf ? `<div class="wi-wdet">${statsGitter(w.st, true)}</div>` : ''}`;
  }

  function unitDetailClick(e) {
    if (e.target.closest('[data-zurueck]')) { unitZurueck(); return; }
    const an = e.target.closest('[data-an]');
    if (an) { unitToggle(an.dataset.an); return; }
    const row = e.target.closest('[data-i]');
    if (!row || !unitOffen) return;
    const id = row.dataset.i;
    if (unitOffen.auf.has(id)) unitOffen.auf.delete(id);
    else unitOffen.auf.add(id);
    renderUnitDetail();
  }

  /* Der Speicher der Units. Eine Unit ist zwischen zwei Übungen
     unveränderlich — sie zweimal zu holen, weil jemand zweimal
     hinsieht, wäre verschenkte Zeit. Nach dem Üben wird der ganze
     Speicher weggeworfen (siehe pclose), denn dann stimmt er nicht
     mehr.

     `unitGen` fängt den Fall ab, dass eine Antwort noch unterwegs
     ist, während der Speicher geleert wird: sie darf nicht mehr
     hinein. */
  let unitGen = 0;
  const unitFlug = new Map();

  function unitVergessen() {
    unitGen++;
    unitCache.clear();
    unitFlug.clear();
  }

  function unitDaten(setId) {
    if (unitCache.has(setId)) return Promise.resolve(unitCache.get(setId));
    if (unitFlug.has(setId)) return unitFlug.get(setId);
    const gen = unitGen;
    const p = ctx.actions.call('wi_solo_unit', { p_set: setId }).then(r => {
      unitFlug.delete(setId);
      if (r && r.ok && gen === unitGen) unitCache.set(setId, r);
      return r;
    }).catch(() => {
      unitFlug.delete(setId);
      return { ok: false, error: 'network' };
    });
    unitFlug.set(setId, p);
    return p;
  }

  /* ─── Das Kärtchen zur Echse ────────────────────────────────
     Sönke: „ich kann sie anklicken und sehe dann daneben die Vokabel
     und auch alle States von dieser."

     „Daneben" war zuerst wörtlich gemeint: das Kärtchen stand an der
     Tippstelle. Das hat sich in der Hand nicht bewährt — neben dem
     Tier liegen andere Tiere, und wer eins nach dem anderen antippt,
     sucht die Auskunft jedes Mal woanders. Seit dem 10.09.2026 hat
     es einen festen Platz unten rechts (Sönke: „wird unten rechts
     angeheftet und taucht nicht mehr bei den Monstern auf");
     verbunden bleiben Karte und Tier über den Ring, der mitläuft.

     Deshalb braucht es hier auch keine Koordinaten mehr — der Platz
     steht im Stylesheet. */
  function tierWaehlen(t) {
    if (!t) { kartenZu(); return; }
    tierOffen = t.id;
    kartenNeu();
  }

  function kartenZu() {
    tierOffen = null;
    if (els.card) { els.card.hidden = true; els.card.innerHTML = ''; }
  }

  function kartenNeu() {
    const id = tierOffen;
    if (!id || !els.card) return;
    const setId = solo.setVon.get(id);
    // Erst das, was schon da ist — auf dem iPad soll der Tipp nicht
    // ins Leere greifen, während der Server antwortet.
    kartenSchreiben(id, setId ? unitCache.get(setId) : null);
    if (setId && !unitCache.has(setId)) {
      unitDaten(setId).then(d => { if (tierOffen === id) kartenSchreiben(id, d); });
    }
  }

  function kartenSchreiben(id, d) {
    const stufe = solo.stufen.get(id) | 0;
    const w = d && d.ok ? (d.words || []).find(x => x.i === id) : null;
    const titel = d && d.ok && d.set ? d.set.title : '';
    let kopf;
    if (w) {
      kopf = `<b class="wi-cword">${esc(w.t)}</b>
              <span class="wi-ctrans">${esc(w.x)}</span>`;
    } else if (unitsAlt() || (d && !d.ok && d.error === 'fn_missing')) {
      kopf = `<b class="wi-cword">Dieses Tier</b>
              <span class="wi-ctrans">${esc(MIG_HINWEIS)}</span>`;
    } else {
      kopf = '<b class="wi-cword">…</b><span class="wi-ctrans">wird geholt</span>';
    }
    els.card.innerHTML = `
      <button type="button" class="wi-cclose" data-zu aria-label="Schließen">×</button>
      ${kopf}
      <span class="wi-cmeta">${titel ? esc(titel) + ' · ' : ''}${
        esc(STUFEN_NAME[Math.max(0, Math.min(4, stufe))])}</span>
      ${w ? statsGitter(w.st, true) : ''}`;
    els.card.hidden = false;
  }

  /* ─── Das kleine Monster in der Liste ───────────────────────
     Dieselben eingefärbten Bilder wie auf der Insel, einmal je
     Bildschlüssel und Farbe auf Listengröße gerechnet und als
     data:-URL gemerkt. Höchstens neun mal acht Einträge — und kein
     zweites Bilderladen. */
  const MONSTER_H = 44;

  function monsterUrl(id) {
    const t = welt.nachStufe.get(id);
    if (!t || !sprites) return '';
    const k = wachSchluessel(t.stufe, t.variante);
    const schl = k + '|' + t.farbe;
    if (monsCache.has(schl)) return monsCache.get(schl);
    const im = sprites[k] && sprites[k][t.farbe];
    if (!im) return '';
    const w = Math.max(1, Math.round(im.width * MONSTER_H / (im.height || 1)));
    let url = '';
    try {
      const c = neuCanvas(w, MONSTER_H);
      c.getContext('2d').drawImage(im, 0, 0, w, MONSTER_H);
      url = c.toDataURL('image/png');
    } catch (e) { url = ''; }
    monsCache.set(schl, url);
    return url;
  }

  /* ─── Die Zahlen ────────────────────────────────────────────
     Ein Zeichner für drei Orte: das „i" beim Üben, das Kärtchen an
     der Echse und die Unit-Übersicht. Dieselbe Form heißt: man liest
     sie einmal und versteht sie überall. */
  function summeVon(st) {
    const z = [0, 0, 0, 0];                       // gut, mit Hilfe, falsch, gesamt
    for (const [dir] of STAT_ZEILEN) {
      const a = (st && st[dir]) || [0, 0, 0, 0];
      const gut = a[0] | 0, hilf = a[1] | 0, alle = a[2] | 0;
      const bad = a.length > 3 ? (a[3] | 0) : Math.max(0, alle - gut - hilf);
      z[0] += gut; z[1] += hilf; z[2] += bad; z[3] += alle;
    }
    return z;
  }

  function statsGitter(st, hell) {
    const zeilen = STAT_ZEILEN.map(([dir, von, nach]) => {
      const z = (st && st[dir]) || [0, 0, 0, 0];
      const gut = z[0] | 0, hilf = z[1] | 0, alle = z[2] | 0;
      /* Vier Zahlen seit 0139. Kommen nur drei an, ist die Datenbank
         älter — dann wird „falsch" wie früher als Rest gerechnet.
         Das ist die schlechtere Auskunft, aber immer noch besser als
         eine leere Spalte. */
      const bad = z.length > 3 ? (z[3] | 0) : Math.max(0, alle - gut - hilf);
      const p = n => (alle ? n / alle * 100 : 0).toFixed(2) + '%';
      return `
        <span class="wi-stdir">${von}<i>→</i>${nach}</span>
        <b class="wi-stn is-gut">${gut}</b>
        <b class="wi-stn is-hilf">${hilf}</b>
        <b class="wi-stn is-bad">${bad}</b>
        <b class="wi-stn is-alle">${alle}</b>
        <div class="wi-stbar${alle ? '' : ' is-leer'}">
          <i class="is-gut"  style="width:${p(gut)}"></i>
          <i class="is-hilf" style="width:${p(hilf)}"></i>
          <i class="is-bad"  style="width:${p(bad)}"></i>
        </div>`;
    }).join('');
    return `
      <div class="wi-stgrid${hell ? ' wi-stgrid--hell' : ''}">
        <span></span>
        <span class="wi-sthead">richtig</span>
        <span class="wi-sthead">mit Hilfe</span>
        <span class="wi-sthead">falsch</span>
        <span class="wi-sthead">gesamt</span>
        ${zeilen}
      </div>`;
  }

  /* ─── Üben ──────────────────────────────────────────────────
     Derselbe Antwortweg wie im Raum: tippen, bei „fast" die
     Schreibweisen, bei „daneben" acht Wörter. Geprüft wird am
     Server (wi_solo_answer) — ein Client, der die Lösung kennt,
     damit er sie vergleichen kann, hat sie auch im Netzwerk-Tab. */
  async function soloStart() {
    if (!solo) return;
    els.setsOv.hidden = true;
    els.playOv.hidden = false;
    soloFeedback(null);
    zeigeDelta(0);
    buehneZu();
    clearTimeout(feierT); feiernd = false;
    const r = await ctx.actions.call('wi_solo_start', {});
    if (!r.ok) { ctx.toast(ctx.errText(r.error)); els.playOv.hidden = true; return; }
    soloTask = r.task;
    soloRenderTask();
    feldHer(els.pIn);
  }

  async function soloSend(value) {
    /* `feiernd` ist kein Zierriegel: die acht Wahlknöpfe der eben
       beantworteten Frage stehen während der Verwandlung noch da,
       und ein zweiter Tipp darauf schickte eine Antwort auf ein Wort,
       das schon durch ist. */
    if (submitting || feiernd) return;
    submitting = true;
    feldZu(els.pIn, true);
    try {
      const r = await ctx.actions.call('wi_solo_answer', { p_input: value });
      if (!r.ok) {
        if (r.error === 'too_fast') {
          soloFeedback('warn', `Kurz durchatmen — noch ${r.locked_for} Sekunden.`);
          soloLock(r.locked_for);
        } else {
          ctx.toast(ctx.errText(r.error));
        }
        return;
      }

      /* „Richtig — mit Hilfe" statt nur „Richtig": die Antwort war
         richtig, sie zählt nur weniger, und ein Kind, dem die
         Kästchen nur ein Drittel weiterrücken, hat ein Recht darauf
         zu erfahren, warum. Der Server sagt es (r.helped) — der
         Client rät es nicht aus der Zwischenstufe zusammen. */
      if (r.result === 'spell')       soloFeedback('near', 'Fast! Welche Schreibweise stimmt?');
      else if (r.result === 'choice') soloFeedback('warn', 'Welches Wort ist es?');
      else if (r.result === 'correct') soloFeedback('ok', r.helped ? 'Richtig — mit Hilfe.' : 'Richtig!');
      else                            soloFeedback('bad', 'Es heißt: ' + r.solution);

      // Die Zahl kommt SOFORT, auch wenn gleich eine Feier
      // dazwischenkommt: sie gehört zur Antwort von eben, und
      // soloTask trägt bis zum Ende der Pause noch das alte Wort.
      if (r.delta) zeigeDelta(r.delta);

      // Das Tier zuerst, dann die nächste Frage: was gerade passiert
      // ist, gehört zum Wort von eben. Das gefragte Wort muss JETZT
      // gelesen werden — gleich steht in soloTask das nächste.
      const wort = soloTask && soloTask.prompt;
      const halt = (r.item && r.level_after != null)
        ? soloWachsen(r.item, r.level_after, wort) : 0;
      if (r.result === 'wrong') soloLock(r.locked_for);

      feldLeer(els.pIn);

      /* Die Pause. Sie ist der Unterschied zwischen „es lief eine
         Bewegung" und „ich habe etwas geschafft": solange die
         Verwandlung läuft, kommt keine neue Frage und das Feld
         bleibt zu.

         Auch beim Zurückfallen. Dort ist sie kürzer und still, aber
         ohne sie schnitte die nächste Frage das Schrumpfen mitten
         entzwei — und ein Kind, das nicht sieht, was es verloren
         hat, hat es nicht verloren, sondern nur nicht gewonnen. */
      if (halt > 0) {
        feiernd = true;
        // Die Frage von eben tritt zurück, statt zu verschwinden: ein
        // Kasten, der mitten in der Feier zusammenklappt, nimmt ihr
        // den Platz.
        els.pOpts.classList.add('is-wait');
        els.pForm.classList.add('is-wait');
        const naechste = r.task;
        clearTimeout(feierT);
        feierT = setTimeout(() => {
          feiernd = false;
          if (destroyed || !els.pIn) return;
          buehneZu();
          soloTask = naechste;
          soloRenderTask();
          if (!els.pIn.dataset.locked) { feldZu(els.pIn, false); feldHer(els.pIn); }
        }, halt);
      } else {
        soloTask = r.task;
        soloRenderTask();
      }
    } finally {
      submitting = false;
      if (!els.pIn.dataset.locked && !feiernd) { feldZu(els.pIn, false); feldHer(els.pIn); }
    }
  }

  /* Die eigentliche Belohnung. Der Server hat die neue Stufe schon
     gerechnet — hier wird sie ins Bild getragen: auf die Insel (mit
     `pop` und einem Funkenkranz) und auf die Übungskarte, wo die
     Verwandlung ABGESPIELT wird.

     Zurück kommt, wie lange die nächste Frage noch warten soll. Das
     ist die eine Zahl, die soloSend braucht — die Feier selbst
     verwaltet sich hier. */
  function soloWachsen(id, stufe, wort) {
    /* Ein Wort, das die geladene Insel gar nicht kennt, wird
       ignoriert statt nachgetragen: es hätte kein Tier, und die
       Zahlen in der Leiste liefen gegen die gezeigten Tiere
       auseinander. Vorkommen kann das nur, wenn zwischen dem Öffnen
       und dieser Antwort eine Unit dazugekommen ist — und dafür
       muss man diese Seite verlassen haben. */
    if (!solo.stufen.has(id)) return 0;
    const alt = solo.stufen.get(id);
    if (alt === stufe) return 0;
    solo.stufen.set(id, stufe);
    const t = welt.nachStufe.get(id);
    if (t) setzeStufe(t, stufe, true);
    solo.grown = [...solo.stufen.values()].filter(s => s >= 3).length;
    renderSoloBar();
    return feierStufe(id, alt, stufe, wort);
  }

  /* ─── Der Moment ────────────────────────────────────────────
     Hier ist der ganze Sinn der Metapher zu Hause. Eine Vokabel,
     die man in BEIDE Richtungen kann, hebt die Stufe des Tieres —
     und das ist der einzige Augenblick, in dem das Kind etwas
     bekommt, das es weder erwarten noch erzwingen kann.

     Drei Dinge zusammen, weil eines allein untergeht:
       · die Verwandlung auf der Karte (das Ei bricht auf, das Tier
         wächst, der Flieger hebt ab),
       · ein Satz, der SAGT, was passiert ist, mit dem Wort darin,
       · ein Dreiklang, der mit der Stufe steigt.
     Dazu hält die nächste Frage kurz an. Ohne diese Pause liefe die
     Belohnung zwar ab, aber angesehen hätte sie niemand: das neue
     Wort stünde schon da, und der Blick wäre unten. */
  /* EINE Zahl je Verwandlung, und sie ist zugleich die Pause bis zur
     nächsten Frage. Zwei Zahlen wären verlockend — „die Feier darf
     noch nachklingen, während schon weitergefragt wird" —, aber die
     Karte zeigt dann längst das Tier des NÄCHSTEN Wortes: der
     Nachklang würde nicht ausklingen, sondern abgeschnitten.

     Deshalb sind sie gleich, und deshalb sind sie kurz. Sie kosten
     nur bei einem Stufensprung Zeit, nicht bei jeder Antwort. */
  const FEIER_DAUER = { hatch: 1400, grow: 1150, shrink: 750 };

  const FEIER_TEXT = [
    null,
    ['Geschlüpft!',            w => w ? `»${w}« kannst du jetzt in beide Richtungen.` : 'In beide Richtungen richtig.'],
    ['Gewachsen!',             w => w ? `»${w}« sitzt immer besser.` : 'Es sitzt immer besser.'],
    ['Ausgewachsen — es fliegt!', w => w ? `»${w}« kannst du. Jetzt darf es die Insel verlassen.` : 'Jetzt darf es die Insel verlassen.'],
    ['Es funkelt!',            w => w ? `»${w}« sitzt. Richtig gut.` : 'Sitzt. Richtig gut.']
  ];

  function feierStufe(id, von, nach, wort) {
    const art = nach < von ? 'shrink' : (von <= 0 ? 'hatch' : 'grow');
    const dauer = FEIER_DAUER[art];

    /* Die Karte zeigt bis eben das Tier der beantworteten Vokabel.
       Sie behält es — nur die Stufe darin wandert jetzt von `von`
       nach `nach`. Steht dort gerade gar nichts (kein Bildersatz,
       kein Tier), bleibt der Satz trotzdem: er ist die Auskunft, das
       Bild ist die Zugabe. */
    if (kart && kart.id === id) {
      kartAnim = {
        art, von, nach, t0: null, dauer,
        teile: kartFunkenSatz(art === 'shrink' ? 0 : 26,
                              mulberry32(hashKey(String(id)) ^ nach))
      };
      kart.stufe = nach;
      els.pStage.textContent = STUFEN_NAME[Math.max(0, Math.min(4, nach))];
      els.pStage.className = 'wi-pstage is-' + nach;
      zeigeStats(false);
      buehneAuf();
      kartLauf();
    }
    feierText(art === 'shrink' ? null : nach, wort);
    tonSpiel(art === 'shrink' ? 'ab' : nach);
    return dauer;
  }

  function feierText(nach, wort) {
    if (!els.pLevel) return;
    const t = nach != null && FEIER_TEXT[Math.max(0, Math.min(4, nach))];
    if (!t) { els.pLevel.hidden = true; return; }
    els.pLevelB.textContent = t[0];
    els.pLevelS.textContent = t[1](wort);
    els.pLevel.hidden = false;
    /* Neu anstoßen, nicht nur einblenden: zweimal dieselbe Klasse
       spielt keine zweite Bewegung ab, und genau das passiert bei
       zwei Stufensprüngen hintereinander. */
    els.pLevel.classList.remove('is-on');
    void els.pLevel.offsetWidth;
    els.pLevel.classList.add('is-on');
  }

  /* ─── Der Ton ───────────────────────────────────────────────
     Kein Tonschnipsel im Deployment: drei Sinustöne aus dem
     Webaudio-Baukasten kosten keine Datei, kein Laden und keinen
     Rechtefall — und ein Dreiklang, der mit der Stufe HÖHER wird,
     sagt dasselbe wie das Bild, nur schneller.

     Angelegt wird der Tonapparat erst beim ersten Ton, und der
     kommt immer aus einem Tipp des Kindes. Anders ließe iOS ihn
     ohnehin nicht laufen. */
  const TON_FOLGE = {
    1:  [523.25, 659.25, 783.99],
    2:  [587.33, 739.99, 880.00],
    3:  [659.25, 830.61, 987.77, 1318.51],
    4:  [783.99, 987.77, 1174.66, 1567.98, 2093.00],
    ab: [392.00, 311.13]
  };
  const TON_KEY = 'mpskills_wi_ton';
  let audio = null;
  let tonAn = true;

  function tonLaden() {
    try { tonAn = localStorage.getItem(TON_KEY) !== '0'; } catch (e) { tonAn = true; }
  }
  function tonSetzen(an) {
    tonAn = !!an;
    try { localStorage.setItem(TON_KEY, tonAn ? '1' : '0'); } catch (e) { /* egal */ }
  }
  function zeigeTonKnopf() {
    if (!els.pTon) return;
    els.pTon.classList.toggle('is-off', !tonAn);
    els.pTon.setAttribute('aria-pressed', tonAn ? 'true' : 'false');
    els.pTon.title = tonAn ? 'Ton aus' : 'Ton an';
  }

  function tonSpiel(art) {
    if (!tonAn) return;
    const noten = TON_FOLGE[art];
    if (!noten) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime + .02;
      const leise = art === 'ab';
      noten.forEach((f, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        const letzte = i === noten.length - 1;
        const a = t0 + i * (leise ? .11 : .075);
        const d = letzte ? .55 : .30;
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, a);
        /* Kein harter Einsatz: ein Rechteck-Start knackt, und ein
           Knacken hört man als Fehler und nicht als Belohnung. */
        g.gain.setValueAtTime(.0001, a);
        g.gain.exponentialRampToValueAtTime(leise ? .06 : .16, a + .014);
        g.gain.exponentialRampToValueAtTime(.0001, a + d);
        o.connect(g); g.connect(audio.destination);
        o.start(a); o.stop(a + d + .03);
      });
    } catch (e) { /* Der Ton ist Zugabe, nicht Bedingung. */ }
  }

  function soloLock(secs) {
    if (!secs) return;
    feldZu(els.pIn, true);
    els.pIn.dataset.locked = '1';
    clearTimeout(soloLockT);
    soloLockT = setTimeout(() => {
      if (destroyed || !els.pIn) return;
      delete els.pIn.dataset.locked;
      feldZu(els.pIn, false);
      feldHer(els.pIn);
    }, secs * 1000);
  }

  function soloFeedback(kind, text) {
    if (!els.pFb) return;
    els.pFb.hidden = !kind;
    if (!kind) return;
    els.pFb.className = 'wi-fb is-' + kind;
    els.pFb.textContent = text;
  }

  /* Über dem Wort steht KEINE ausgeschriebene Frage mehr („Wie heißt
     das auf Deutsch?"). Die Richtung steht als EN→DE am Tier, und
     zweimal dasselbe in zwei Zeilen macht den Kasten nur voller, nicht
     klarer (Sönke, 10.09.2026). Im Raum bleibt die Frage stehen —
     dort gibt es das Tier mit dem Schildchen nicht. */
  function soloRenderTask() {
    const has = soloTask && soloTask.prompt;
    els.pWord.textContent = has ? soloTask.prompt : 'Keine Wörter gewählt.';

    const opts = (has && soloTask.options) || [];
    els.pOpts.hidden = !opts.length;
    els.pForm.hidden = !has || opts.length > 0;
    els.pOpts.classList.remove('is-wait');
    els.pForm.classList.remove('is-wait');
    // Die Übersicht gehört zum Wort, nicht zum Kasten: neues Wort,
    // zugeklappt.
    zeigeStats(false);
    els.pInfo.hidden = !has;
    if (opts.length) {
      els.pOpts.innerHTML = opts
        .map(o => `<button type="button" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    }
    zeigeRunde();
    zeigeRichtung();
    zeichneTierKarte();
  }

  /* ─── Der Stand der Runde ───────────────────────────────────
     Sönkes Wunsch: „ich will schon mal eine ganze Unit
     durchballern." Genau dafür ist das hier da — es beantwortet „bin
     ich einmal rum?", und ohne diese Anzeige merkt niemand, dass der
     Beutel überhaupt einer ist.

     Ein Zahlenpaar war dafür das falsche Mittel. „Noch 30 von 30"
     stand am Anfang jeder Runde, und dann sechs Antworten lang
     unverändert da — ein Wort verlässt den Beutel ja erst mit seiner
     letzten Kopie. Sönke (10.09.2026): „die versteht man ja nicht.
     lieber einen % balken, der dann bei jeder Vokabel etwas hoch
     geht."

     Der Balken zählt deshalb KOPIEN und nicht Wörter — die Zahl
     dafür kommt seit 0141 aus dem Server (`pass.pct`, siehe dort,
     warum sie nicht ausrechenbar ist). In der Kopfzeile steht nur
     noch die Runde. */
  let rundeNo = 0;
  let rundePct = 0;

  function zeigeRunde() {
    const p = soloTask && soloTask.pass;
    const an = !!(p && p.gesamt);
    if (els.pMeta) els.pMeta.textContent = an ? `Runde ${p.no}` : 'Vokabeln üben';
    if (!els.pProg) return;
    els.pProg.hidden = !an;
    if (!an) return;

    let pct = anteil(p);
    if (p.no !== rundeNo) {
      /* Rundenwechsel: der Balken fängt von vorn an. Ohne diese vier
         Zeilen LÄUFT er dabei zurück — eine halbe Sekunde lang sieht
         es aus, als wäre etwas verloren gegangen, und das ist das
         Gegenteil dessen, was gerade passiert ist. Also ohne
         Bewegung setzen. */
      rundeNo = p.no;
      rundePct = pct;
      els.pProgI.style.transition = 'none';
      els.pProgI.style.width = pct.toFixed(1) + '%';
      void els.pProgI.offsetWidth;
      els.pProgI.style.transition = '';
    } else {
      /* INNERHALB einer Runde geht der Balken nie zurück.
         Er muss das können, denn die Rechnung erledigt / (erledigt +
         offen) kann fallen: ein Fehler beim Tippen legt zwei Kopien
         zurück, wo er eine genommen hat, und ab der Hälfte der Runde
         wiegt der längere Weg schwerer als der eine Schritt. Es geht
         um Zehntelprozent — aber ein Balken, der nach einer falschen
         Antwort schrumpft, bestraft zweimal, und Sönkes Ansage war
         „geht bei jeder Vokabel etwas hoch".

         Er STOCKT dann, statt zu fallen, und zwar genau eine
         Antwort lang: die nächste richtige bringt mehr ein, als der
         Fehler gekostet hat. */
      pct = rundePct = Math.max(rundePct, pct);
    }
    /* Der Balken bekommt den Nachkommawert, die Zahl daneben nicht.
       Eine Runde hat gut 180 Kopien, eine Antwort ist also ein halbes
       Prozent: gerundet stünde der Balken bei jeder zweiten Antwort
       still, und „geht bei jeder Vokabel etwas hoch" wäre wieder
       dahin. Die Zahl mit Komma zu schreiben wäre die schlechtere
       Hälfte des Tauschs — sie soll man im Vorbeisehen lesen. */
    els.pProgI.style.width = pct.toFixed(1) + '%';
    els.pProgN.textContent = Math.round(pct) + ' %';
    els.pProg.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  /* Wie weit die Runde ist, in Prozent.

     Der Rückfallweg ist für eine Datenbank ohne 0141 da. Er rechnet
     in Wörtern, ist also grob (Sprünge von 3 % statt .5 %) — aber
     ein grober Balken ist immer noch die bessere Auskunft als gar
     keiner, und „kaputt" sieht er nicht aus. */
  function anteil(p) {
    if (typeof p.pct === 'number') return Math.max(0, Math.min(100, p.pct));
    const gesamt = p.gesamt | 0;
    const offen = Math.min(p.offen | 0, gesamt);
    return gesamt ? (gesamt - offen) / gesamt * 100 : 0;
  }

  /* ─── Das Schildchen am Tier ────────────────────────────────
     Es sagt EIN Ding: in welche Richtung gerade gefragt wird. Damit
     ist es der Ersatz für die ausgeschriebene Frage über dem Wort und
     nicht deren Ergänzung.

     Es hängt bewusst nur an `dir` und an keiner gerechneten Zahl. Die
     drei Kästchen davor hingen am Punktekonto, das zwischen Antwort
     und nächster Frage aus zwei Quellen kam — genau daher kam Sönkes
     „der ist auch manchmal falsch". Was nichts rechnet, kann sich
     nicht verrechnen. */
  const DIR_KURZ = { de_en: 'DE→EN', en_de: 'EN→DE' };

  function zeigeRichtung(dirNeu) {
    if (!els.pDir) return;
    const dir = dirNeu || (soloTask && soloTask.dir);
    els.pDir.hidden = !DIR_KURZ[dir];
    if (!DIR_KURZ[dir]) return;
    els.pDir.textContent = DIR_KURZ[dir];
  }

  /* Die kleine Zahl. Sie gehört zur Antwort von eben und geht nach
     einem Augenblick von selbst.

     Sie darf ausdrücklich NICHT von soloRenderTask weggenommen
     werden: ohne Stufensprung steht die nächste Frage sofort da, und
     die Zahl wäre schon weg, bevor jemand sie gesehen hat. Sie darf
     aber auch nicht bleiben — neben dem NÄCHSTEN Wort läse sie sich
     wie dessen Ausbeute. Also ein Zeitgeber. */
  let deltaT = 0;

  function zeigeDelta(d) {
    if (!els.pDelta) return;
    clearTimeout(deltaT);
    if (!d) { els.pDelta.hidden = true; return; }
    deltaT = setTimeout(() => {
      if (destroyed || !els.pDelta) return;
      els.pDelta.hidden = true;
    }, 1400);
    els.pDelta.textContent = (d > 0 ? '+' : '−') + Math.abs(d);
    els.pDelta.className = 'wi-pdelta is-' + (d > 0 ? 'plus' : 'minus');
    els.pDelta.hidden = false;
    // Neu anstoßen — zweimal dieselbe Klasse spielt sonst keine
    // zweite Bewegung ab (wie bei feierText).
    els.pDelta.classList.remove('is-on');
    void els.pDelta.offsetWidth;
    els.pDelta.classList.add('is-on');
  }

  /* ══════════════════════════════════════════════════════════
     DIE ÜBUNGSKARTE
     ══════════════════════════════════════════════════════════
     Das Tier zur laufenden Vokabel, groß. Eigene kleine Leinwand
     statt eines Ausschnitts der großen: hier soll es GANZ zu sehen
     sein und in Ruhe stehen, und beides kann die Bühne nicht.

     Sie ist bewusst mehr als ein Standbild. Auf der Insel ist ein
     Tier zwei Zentimeter groß und läuft irgendwo herum; hier ist es
     das Bild dieser einen Vokabel — und wenn es die Stufe wechselt,
     ist das der einzige Augenblick des ganzen Werkzeugs, in dem
     jemand für etwas belohnt wird, das er WEISS.

     ── Der gemeinsame Anker ──────────────────────────────────
     Gezeichnet wird am ANKER des Blattes und nicht bildmittig. Der
     Unterschied ist die halbe Aussage: am Anker steht das Ei unten
     am Boden, das gewachsene Tier daneben ist größer, und der
     Flieger schwebt darüber. Bildmittig wären alle drei gleich groß
     an derselben Stelle — und die Verwandlung wäre ein Austausch
     statt einer Entwicklung. */

  let kart = null;      // { id, farbe, variante, stufe } — das gezeigte Tier
  let kartAnim = null;  // die laufende Verwandlung
  let kartRaf = 0;
  let feierT = 0;       // Timer, der die nächste Frage nachreicht
  let feiernd = false;  // solange bleibt das Eingabefeld zu

  /* Wer Bewegung abbestellt hat, bekommt die Auskunft trotzdem: das
     neue Tier, den Satz, den Ton — nur ohne Zittern, Funken und
     Schweben. */
  const sparsam = (() => {
    try {
      return !!(window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  })();

  /* Der GEMEINSAME Maßstab, nicht „füll den Kasten": ein Ei muss
     kleiner aussehen als ein Flieger. Eingepasst wird das größte
     Blatt, alles andere bekommt seinen Anteil daran. */
  function kartMasse(c, fuell) {
    // größtes Blatt plus Rand; `fuell` < 1 lässt es kleiner werden,
    // ohne dass sich die Verhältnisse der Stufen verschieben.
    const MAX = STUFE_EINHEIT[4] * 1.16 / (fuell || 1);
    const P = Math.min(c.height / MAX, c.width / (MAX * ECHSE.blatt.w / ECHSE.blatt.h));
    const bh = STUFE_EINHEIT[4] * P;
    return {
      P,
      ax: c.width / 2,
      ay: (c.height - bh) / 2 + bh * (ECHSE.blatt.ankerY / ECHSE.blatt.h)
    };
  }

  /* Wo ein Tier einer Stufe auf der Karte läge — gerechnet, nicht
     gemalt. Zwei Dinge brauchen dieselbe Rechnung: das Malen und
     die aufspringende Eischale. */
  function kartGeo(m, stufe, variante, farbe, s) {
    const st = Math.max(0, Math.min(4, stufe));
    const key = st === 0 ? 'ei' : st === 1 ? 's1' : st === 2 ? 's2' : 's3' + variante;
    const im = sprites[key][farbe], b = ECHSE.bilder[key];
    const e = STUFE_EINHEIT[st] * m.P / ECHSE.blatt.h * (s || 1);
    return {
      im, e,
      x: m.ax + (b.x - ECHSE.blatt.ankerX) * e,
      y: m.ay + (b.y - ECHSE.blatt.ankerY) * e,
      w: im.width * e, h: im.height * e
    };
  }

  /* Gedreht wird um den ANKER und nicht um die Bildmitte — dieselbe
     Regel wie beim Spiegeln auf der Insel, und aus demselben Grund:
     sonst rutscht das Tier beim Kippen seitlich weg. */
  function kartMal(x, m, g, dy, dreh, alpha) {
    x.save();
    x.globalAlpha = alpha;
    if (dreh) { x.translate(m.ax, m.ay); x.rotate(dreh); x.translate(-m.ax, -m.ay); }
    x.drawImage(g.im, g.x, g.y + dy, g.w, g.h);
    x.restore();
    x.globalAlpha = 1;
  }

  /* Der Schatten macht aus dem leeren Kasten einen Boden. Ohne ihn
     hängt ein Ei im Nichts, und der Flieger schwebt über gar
     nichts. */
  function kartSchatten(x, m, breite, staerke) {
    if (breite <= 0 || staerke <= 0) return;
    const g = x.createRadialGradient(m.ax, m.ay, 0, m.ax, m.ay, breite);
    g.addColorStop(0, `rgba(1,10,17,${staerke.toFixed(3)})`);
    g.addColorStop(.55, `rgba(1,10,17,${(staerke * .42).toFixed(3)})`);
    g.addColorStop(1, 'rgba(1,10,17,0)');
    x.save();
    x.translate(m.ax, m.ay); x.scale(1, .28); x.translate(-m.ax, -m.ay);
    x.fillStyle = g;
    x.beginPath(); x.arc(m.ax, m.ay, breite, 0, 6.2832); x.fill();
    x.restore();
  }

  /* Die Eischale springt auf. Geschnitten wird NACH dem Verschieben
     und Drehen: der Schnitt gehört zum Bruchstück und nicht zum
     Bildschirm — andersherum wüchse die obere Hälfte, während sie
     wegfliegt. */
  function kartSchalen(x, m, g, u) {
    const mitte = g.y + g.h * .46;
    for (const oben of [true, false]) {
      const dx = (oben ? -1 : 1) * g.w * .40 * u;
      const dy = oben ? (-g.h * .75 * u + g.h * 1.15 * u * u) : g.h * .16 * u;
      x.save();
      x.globalAlpha = Math.max(0, 1 - u * 1.3);
      x.translate(g.x + g.w / 2 + dx, mitte + dy);
      x.rotate((oben ? -1 : 1) * 1.6 * u);
      x.translate(-(g.x + g.w / 2), -mitte);
      x.beginPath();
      if (oben) x.rect(g.x - g.w, g.y - g.h * 2, g.w * 3, mitte - g.y + g.h * 2);
      else      x.rect(g.x - g.w, mitte, g.w * 3, g.h * 2);
      x.clip();
      x.drawImage(g.im, g.x, g.y, g.w, g.h);
      x.restore();
    }
    x.globalAlpha = 1;
  }

  /* Die Funken der Verwandlung. Aus dem Wort gewürfelt und nicht aus
     dem Zufall: derselbe Sprung sieht zweimal gleich aus, und das
     macht ihn zu einem Ereignis statt zu einem Effekt. */
  function kartFunkenSatz(n, rnd) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        a: (i / n) * 6.2832 + rnd() * .55,
        v: .55 + rnd() * .95,
        r: rnd(),
        t0: rnd() * .14
      });
    }
    return out;
  }

  // Sanftes Überschwingen: kurz über das Ziel hinaus und zurück. Ein
  // Sprung ohne Überschwingen liest sich als Ruckler.
  function ueber(q) {
    if (q <= 0) return 0;
    if (q >= 1) return 1;
    const p = q - 1;
    return 1 + 2.9 * p * p * p + 1.9 * p * p;
  }

  /* ─── Die große Bühne ───────────────────────────────────────
     Dieselbe Zeichenschleife, nur eine andere Leinwand: `kartZiel`
     sagt, wohin gemalt wird. Ein zweiter Zeichner für dasselbe Tier
     wäre nach der ersten Verbesserung ein anderes Tier — dieselbe
     Überlegung wie bei der Karte im Raum und im Solo.

     `BUEHNE_FUELL` ist der einzige Unterschied im Bild: es darf
     nicht die ganze Höhe füllen, sonst steht da eine Tapete und
     kein Tier, und der Satz darüber hätte keinen Platz. */
  const BUEHNE_FUELL = .62;
  let kartZiel = 'karte';

  function buehneAuf() {
    if (!els.cheer || !els.cCvs) return;
    els.cheer.hidden = false;
    // Der Übungskasten tritt zurück, statt zu verschwinden: er kommt
    // gleich wieder, und ein Kasten, der weg ist und wiederkommt,
    // liest sich als Sprung.
    els.playOv.classList.add('is-cheer');
    buehneMessen();
    kartZiel = 'buehne';
  }

  /* ⚠️ Gemessen wird ERST, wenn der Kasten offen ist. Ein `hidden`
     Element ist null mal null Bildpunkte groß, und eine Leinwand,
     die man in diesem Moment misst, bleibt für immer leer.

     Und gemessen wird in JEDEM Bild der Feier. Das ist kein
     Übereifer: auf dem iPad schließt sich die Tastatur genau in
     diesem Moment (das Eingabefeld wird gesperrt), `--vv-h` springt
     dabei um mehrere hundert Punkte, und das kommt als
     visualViewport-Ereignis und nicht immer als `resize` am Fenster
     an. Eine Leinwand mit altem Seitenverhältnis wird vom
     Browser GEZOGEN — das Tier wäre in der Mitte der Feier plötzlich
     zu lang. Die Zeile darunter macht daraus einen Vergleich, der
     fast immer nichts tut. */
  function buehneMessen() {
    const c = els.cCvs;
    if (!c || !els.cheer || els.cheer.hidden) return;
    const r = els.cheer.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (c.width === w && c.height === h) return;
    c.width = w; c.height = h;
  }

  function buehneZu() {
    kartZiel = 'karte';
    if (!els.cheer) return;
    els.cheer.hidden = true;
    els.playOv.classList.remove('is-cheer');
    feierText(null);
  }

  function kartHalt() {
    if (kartRaf) cancelAnimationFrame(kartRaf);
    kartRaf = 0;
    kartAnim = null;
    buehneZu();
  }

  function kartLauf() {
    if (kartRaf || destroyed) return;
    kartRaf = requestAnimationFrame(kartSchleife);
  }

  function kartSchleife(now) {
    kartRaf = 0;
    if (destroyed || role !== 'solo') return;
    const buehne = kartZiel === 'buehne';
    const c = buehne ? els.cCvs : els.pCvs;
    if (!c) return;
    if (buehne) buehneMessen();
    kartZeichne(now, c, buehne ? BUEHNE_FUELL : 1);

    /* Ist die Verwandlung durch und wartet auch niemand mehr auf
       sie, geht die Bühne von selbst zu. Im Normalfall macht das
       der Zeitgeber in soloSend — das hier ist der Riegel für den
       Fall, dass es ihn nicht gibt. */
    if (buehne && !kartAnim && !feiernd) { buehneZu(); return; }

    /* Steht der Übungskasten zu, hört auch die Karte auf. Und wer
       keine Bewegung will, bekommt nach der Verwandlung wieder ein
       Standbild statt einer Schleife, die nichts tut. */
    if (!buehne && els.playOv && els.playOv.hidden) return;
    if (sparsam && !kartAnim) return;
    kartRaf = requestAnimationFrame(kartSchleife);
  }

  function kartZeichne(now, c, fuell) {
    const x = c && c.getContext('2d');
    // Ohne Leinwand geht die Übung trotzdem weiter: die Frage steht
    // im DOM, das Tier ist die Zugabe. Ein Absturz hier nähme beides.
    if (!x) return;
    x.clearRect(0, 0, c.width, c.height);
    if (!sprites || !kart) return;

    const m = kartMasse(c, fuell);
    const t = (now || 0) / 1000;
    const ruhe = sparsam ? 0 : 1;

    /* Die Verwandlung. `u` läuft von 0 bis 1 durch die ganze Feier;
       alles darunter sind Abschnitte davon. */
    let a = kartAnim;
    let u = 1;
    if (a) {
      if (a.t0 == null) a.t0 = now;
      u = Math.min(1, (now - a.t0) / a.dauer);
      if (u >= 1) { kartAnim = null; a = null; }
    }

    const stufe = kart.stufe;
    const farbe = kart.farbe, vari = kart.variante;
    const flieger = stufe >= 3;

    /* ── Das ruhende Bild ──────────────────────────────────────
       Auch ohne Verwandlung steht das Tier nicht still: das Ei
       wippt, der Läufer atmet, der Flieger schwebt. Ein völlig
       reglos liegendes Ei sieht aus wie ein Fehler — dieselbe
       Beobachtung wie auf der Insel. */
    let dy = 0, dreh = 0, s = 1;
    if (stufe === 0)      dreh = .055 * Math.sin(t * 1.7) * ruhe;
    else if (stufe <= 2)  { dy = -m.P * .02 * (1 + Math.sin(t * 2.3)) * ruhe;
                            s = 1 + .012 * Math.sin(t * 2.3 + 1.6) * ruhe; }
    else                  { dy = -m.P * .05 * (1 + Math.sin(t * 1.5)) * ruhe;
                            dreh = .028 * Math.sin(t * .9) * ruhe; }

    // Der Flieger wirft einen kleineren, weicheren Schatten — daran
    // sieht man die Höhe, ohne dass es jemand sagen muss.
    kartSchatten(x, m, m.P * (flieger ? .42 : .55), flieger ? .30 : .46);

    /* ── Der Schein dahinter ───────────────────────────────────
       Er gehört zur Stufe und nicht zur Feier: eine Vokabel, die
       sitzt, LEUCHTET auch im Ruhezustand. Genau das ist die
       Auskunft, für die die Karte da ist. */
    const scheinB = m.P * 1.5;
    let schein = GLUEHEN[stufe] * .26 * (.86 + .14 * Math.sin(t * 1.4) * ruhe);
    if (a && a.art !== 'shrink') {
      // Beim Sprung blüht er kurz auf.
      schein += 1.5 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (u - .22) / .5)) * Math.PI));
    }
    if (schein > .01) {
      x.save();
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = Math.min(1, schein);
      x.drawImage(flecken[farbe], m.ax - scheinB / 2, m.ay - scheinB * .62, scheinB, scheinB);
      x.restore();
      x.globalAlpha = 1;
    }

    if (!a) {
      kartMal(x, m, kartGeo(m, stufe, vari, farbe, s), dy, dreh, 1);
      kartIdleFunken(x, m, stufe, farbe, t, ruhe);
      return;
    }

    /* ── Die drei Verwandlungen ────────────────────────────────
       Sie haben denselben Aufbau: das alte Tier tritt ab, ein Blitz
       trennt beide, das neue kommt mit Überschwingen. Unterschieden
       wird nur, WIE das alte abtritt — und das ist der ganze
       Unterschied zwischen „es ist geschlüpft" und „es ist
       gewachsen". */
    const altGeo = q => kartGeo(m, a.von, vari, farbe, q);
    const neuAb  = a.art === 'hatch' ? .34 : a.art === 'shrink' ? .30 : .28;
    const neuU   = Math.max(0, (u - neuAb) / (1 - neuAb));

    if (a.art === 'hatch') {
      if (u < .30) {
        /* Es zittert. Schneller und weiter, je näher der Bruch —
           das ist die ganze Spannung, die diese Karte hat. */
        const auf = u / .30;
        const g = altGeo(1 + .05 * auf);
        kartMal(x, m, g, 0, .11 * auf * Math.sin(u * 78) * ruhe, 1);
      } else {
        kartSchalen(x, m, altGeo(1.05), Math.min(1, (u - .30) / .45));
      }
    } else if (a.art === 'shrink') {
      // Kein Spektakel. Ein Zurückfallen soll man sehen und nicht
      // vorgeführt bekommen.
      if (u < .40) kartMal(x, m, altGeo(1 - .35 * (u / .40)), m.P * .10 * (u / .40),
                           0, Math.max(0, 1 - u / .40));
    } else {
      if (u < .22) {
        // Ausholen: kurz kleiner werden, bevor es größer wird.
        kartMal(x, m, altGeo(1 - .12 * Math.sin(u / .22 * Math.PI)), 0, 0, 1);
      } else if (u < .42) {
        const q = (u - .22) / .20;
        kartMal(x, m, altGeo(1 + .38 * q), 0, 0, 1 - q);
      }
    }

    if (neuU > 0) {
      const e = ueber(Math.min(1, neuU / .62));
      /* Wer auf Stufe 3 steigt, HEBT AB: das neue Bild kommt vom
         Boden herauf an seinen Schwebeplatz. Der Aufstieg ist die
         Belohnung, also muss man ihn sehen. */
      const hebt = a.nach >= 3 && a.von < 3 ? (1 - e) * m.P * .75 : 0;
      const gN = kartGeo(m, a.nach, vari, farbe, .28 + .72 * e);
      kartMal(x, m, gN, dy + hebt, dreh, Math.min(1, neuU * 4));
    }

    /* Der Blitz. Er trennt die beiden Bilder — ohne ihn sieht man
       zwei Tiere übereinander, mit ihm eine Verwandlung. */
    if (a.art !== 'shrink') {
      const f = Math.max(0, 1 - Math.abs(u - neuAb) / .14);
      if (f > .01) {
        const R = m.P * 2.6;
        x.save();
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = Math.min(1, f * f * .95);
        x.drawImage(funke, m.ax - R, m.ay - m.P * .55 - R, R * 2, R * 2);
        x.restore();
        x.globalAlpha = 1;
      }
    }

    /* Ring und Funken. Beide laufen auf DERSELBEN Uhr wie das neue
       Tier (`neuU`) und nicht auf der der ganzen Feier: sie sind die
       Folge des Bruchs und nicht seine Ankündigung. */
    const uu = neuU;
    if (uu > 0 && a.teile.length && !sparsam) {
      const cx = m.ax, cy = m.ay - m.P * .55;
      x.save();
      x.globalCompositeOperation = 'lighter';

      if (uu < .8) {
        const rU = uu / .8;
        x.strokeStyle = `rgba(255,246,214,${(.5 * (1 - rU)).toFixed(3)})`;
        x.lineWidth = Math.max(1, m.P * .10 * (1 - rU));
        x.beginPath();
        x.arc(cx, cy, m.P * (.22 + 1.7 * rU), 0, 6.2832);
        x.stroke();
      }

      const spark = funken[farbe];
      const R = m.P * 1.7;
      for (const p of a.teile) {
        const pu = (uu - p.t0) / (1 - p.t0);
        if (pu <= 0 || pu >= 1) continue;
        const px = cx + Math.cos(p.a) * p.v * R * pu;
        const py = cy + Math.sin(p.a) * p.v * R * pu + R * .95 * pu * pu;
        const gr = m.P * .26 * (1 - .45 * pu) * (.55 + .45 * p.r);
        x.globalAlpha = Math.min(1, 2.4 * (1 - pu));
        x.drawImage(spark, px - gr / 2, py - gr / 2, gr, gr);
        if (a.nach >= 4) {
          const ws = gr * .45;
          x.drawImage(funke, px - ws / 2, py - ws / 2, ws, ws);
        }
      }
      x.restore();
      x.globalAlpha = 1;
    }
  }

  /* Die Funken im Ruhezustand — dieselbe Rechnung wie auf der Insel,
     nur leiser. Sie sind auch hier Auskunft und keine Zierde: je
     besser das Wort sitzt, desto betriebsamer ist sein Tier. */
  function kartIdleFunken(x, m, stufe, farbe, t, ruhe) {
    const n = FUNKEN[stufe];
    if (!n || !ruhe) return;
    const spark = funken[farbe], H = m.P * 1.3;
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const eigen = k * 2.3994;
      const dauer = 2.4 + (k % 3) * .55;
      const q = ((t / dauer + eigen) % 1 + 1) % 1;
      const fx = m.ax + Math.sin(eigen * 3.1 + q * 3.4) * H * .38;
      const fy = m.ay - m.P * .5 + H * (.30 - 1.25 * q);
      const auf = Math.sin(q * Math.PI);
      const fs = H * (.20 - .09 * q) * (.7 + .3 * auf);
      x.globalAlpha = Math.min(1, auf * (stufe >= 4 ? .8 : .5));
      x.drawImage(spark, fx - fs / 2, fy - fs / 2, fs, fs);
      if (stufe >= 4) {
        const ws = fs * .5;
        x.drawImage(funke, fx - ws / 2, fy - ws / 2, ws, ws);
      }
    }
    x.restore();
    x.globalAlpha = 1;
  }

  /* Die Karte auf die laufende Vokabel stellen. Gemalt wird SOFORT
     einmal und danach in der Schleife: was zu sehen ist, soll nicht
     erst beim nächsten Bild da sein. */
  function zeichneTierKarte() {
    /* pMeta gehört seit 0139 dem Rundenzähler (zeigeRunde) und wird
       hier NICHT mehr geleert: diese Funktion läuft am Ende von
       soloRenderTask und wischte die Zeile sonst gleich wieder weg,
       nachdem sie eben geschrieben wurde. */
    feierText(null);
    kartAnim = null;
    if (!sprites || !soloTask || !soloTask.item) {
      kart = null;
      els.pStage.textContent = '';
      if (els.pCvs && els.pCvs.getContext) {
        const x = els.pCvs.getContext('2d');
        if (x) x.clearRect(0, 0, els.pCvs.width, els.pCvs.height);
      }
      return;
    }

    const t = welt.nachStufe.get(soloTask.item)
           || neuesTier(soloTask.item, soloTask.level | 0);
    const stufe = solo.stufen.has(soloTask.item)
      ? solo.stufen.get(soloTask.item) : (soloTask.level | 0);

    kart = { id: soloTask.item, farbe: t.farbe, variante: t.variante, stufe };
    els.pStage.textContent = STUFEN_NAME[stufe];
    els.pStage.className = 'wi-pstage is-' + stufe;

    kartZeichne(typeof performance !== 'undefined' ? performance.now() : Date.now(),
                els.pCvs, 1);
    kartLauf();
  }

  /* ─── Wie oft hattest du dieses Wort? ───────────────────────
     Sönkes Vorgabe: zwei Zeilen, oben EN→DE, unten DE→EN; die
     Spalten richtig, mit Hilfe, falsch und gesamt.

     „Falsch" hat seit 0139 eine eigene Spalte und wird nicht mehr
     als Rest gerechnet. Der Unterschied ist nicht kosmetisch: für
     alles, was vor der Chronik geübt wurde, war der Rest zu hoch —
     die Übersicht behauptete Fehler, die niemand gemacht hatte. Was
     jetzt in der Summe fehlt, bleibt im Balken grau: ehrlich
     unbekannt.

     Die Zahlen fahren in der Aufgabe mit (`stats`), es geht also
     kein Ruf zum Server — die Übersicht ist SOFORT da. */
  const STAT_ZEILEN = [['en_de', 'EN', 'DE'], ['de_en', 'DE', 'EN']];

  function zeigeStats(an) {
    if (!els.pStats) return;
    if (an) renderStats();
    els.pStats.hidden = !an;
    els.pInfo.classList.toggle('is-on', !!an);
    /* Der Tierkasten schrumpft mit der Tastatur (siehe --wi-monmax in
       tool.css). Die Tabelle liegt aber IN ihm und braucht ihre zwei
       Zeilen — also bekommt er für diese Zeit eine Untergrenze. Ohne
       sie stünden bei offener Tastatur zwei Zahlenreihen in einem
       60 px hohen Streifen. */
    if (els.pMon) els.pMon.classList.toggle('is-stats', !!an);
  }

  function renderStats() {
    const st = soloTask && soloTask.stats;
    /* Fehlt das Feld ganz, ist nicht „noch nichts geübt", sondern
       die Datenbank ist älter als dieses Werkzeug. Die beiden zu
       verwechseln kostet eine halbe Stunde Suche an der falschen
       Stelle (Regel: feedback_missing_migration_looks_like_network),
       darum steht die Nummer hier im Klartext. */
    if (!st) {
      els.pStats.innerHTML = '<p class="wi-stnote">Diese Übersicht braucht die '
        + 'neueste Fassung der Datenbank (Migration 0139).</p>';
      return;
    }
    /* Gezeichnet wird woanders (statsGitter): dieselbe Tabelle steht
       seit 10.09.2026 auch im Kärtchen an der Echse und über der
       Vokabelliste einer Unit. Drei Orte, ein Zeichner — sonst
       driften sie auseinander, und der Unterschied fiele erst
       jemandem auf, der beide nebeneinander hält. */
    els.pStats.innerHTML = statsGitter(st)
      + (soloTask && soloTask.pass ? '' :
         '<p class="wi-stnote">Der Rundenzähler braucht Migration 0139.</p>');
  }

  /* ══════════════════════════════════════════════════════════
     Werkzeug-Schnittstelle
     ══════════════════════════════════════════════════════════ */
  window.MPTool.register('wordisland', {
    /* Leer, und zwar mit Absicht: Units, Richtung, Dauer und Völker
       stehen im Pult und nicht im generischen Einstellungen-Fach. Die
       Lehrkraft soll die Unit MITTEN im Kurs wechseln können — ein
       Formular beim Anlegen des Raums kann das nicht, und zwei Orte
       für dieselbe Einstellung wären eine Frage zu viel. */
    settingsFields: [],

    /* Der erste Wert heißt `host` und nicht `el`: `el()` ist seit
       dem Umbau auf die Reliefkarte der Bauhelfer für SVG-Knoten,
       und ein gleichnamiger Parameter verdeckte ihn hier drin. */
    mount(host, c) {
      root = host; ctx = c; role = ctx.role;
      destroyed = false; busy = false; view = null;
      mapKey = null; cells = []; cellEls = []; ships = {}; mapPaint = null;
      ownPainted = null; submitting = false; picking = false;
      sets = { list: [], chosen: [] }; setsBusy = 0; tab = 'units'; setsOpen = false;
      factions = [0, 1, 2, 3]; pickSel = []; pickBusy = 0;
      practice = false; lastPhase = null; soloClaimAt = 0;
      solo = null; soloTask = null; simZeit = 0; letzterT = 0; nacht = 0;
      spieler = null; volkGen = 0; volkNurHier = false;
      unitOffen = null; markiert = null; tierOffen = null; randLinks = 0;
      sichtbar = []; unitVergessen();
      kart = null; kartAnim = null; feiernd = false; kartZiel = 'karte';
      welt.isl = null; welt.vb = null; welt.inseln = null; welt.haupt = null;
      welt.tiere = []; welt.nachStufe = new Map();

      /* ── Die eigene Insel ──────────────────────────────────
         Kein Raum, kein Poller, kein Takt: außer dem Kind selbst
         ändert niemand etwas an dieser Insel. Geholt wird EINMAL,
         danach führt jede Antwort den Stand selbst nach. */
      if (role === 'solo') {
        buildSolo();
        if (!ctx.preview) document.body.classList.add('tool-fill');
        onResize = () => {
          passeAn(); randMessen(); kameraAnwenden(); buehneMessen();
        };
        window.addEventListener('resize', onResize);

        (async () => {
          try {
            /* Erst die Bilder, dann die Insel. Andersherum stünde
               die Karte kurz ohne ein einziges Tier da, und das
               sieht aus wie „ist noch nichts drauf". */
            els.loadTxt.textContent = 'Tiere werden eingefärbt';
            await ladeSprites();
            if (destroyed) return;
            els.loadTxt.textContent = 'Insel wird gezeichnet';
            const v = await ctx.actions.call('wi_solo_view', {});
            if (destroyed) return;
            /* Zwei Ausgänge und nicht einer: „es gibt noch keine
               Insel" ist eine Antwort, „der Server kennt den Aufruf
               nicht" ist ein Fehler. Zusammengefasst suchte man nach
               einer fehlenden Migration in der Freischaltung — das
               hat am 08.09.2026 eine halbe Stunde gekostet (Regel:
               feedback_missing_migration_looks_like_network). */
            if (!v.ok) {
              els.load.innerHTML = '<b>Das hat nicht geklappt.</b><span>'
                + esc(ctx.errText(v.error)) + '</span>';
              return;
            }
            if (!v.learner) {
              els.load.innerHTML =
                '<b>Hier ist noch nichts.</b><span>Deine Insel entsteht, sobald du bei '
                + 'einer Wordisland-Stunde dabei warst.</span>';
              return;
            }
            await soloBuild(v);
          } catch (e) {
            console.warn('[wordisland] Insel konnte nicht aufgebaut werden:', e.message);
            els.load.innerHTML = '<b>Das hat nicht geklappt.</b><span>Lade die Seite neu.</span>';
          }
        })();
        return;
      }

      if (role === 'presenter') buildPult(); else buildTab();

      // Am Beamer soll die Insel allen Platz bekommen — dieselbe
      // Klasse wie bei NeuroLab, Cäsar und Clash.
      if (role === 'presenter' && !(ctx && ctx.preview)) {
        document.body.classList.add('tool-fill');
      }

      onResize = () => { if (view) { /* das SVG skaliert selbst */ } };
      window.addEventListener('resize', onResize);

      startTimer();
      pollTimer = setInterval(() => tick(false), POLL_MS[role] || 4000);
      tick(true);
    },

    // Der Seiten-Poller hat etwas Neues gesehen. Für uns meist
    // bedeutungslos, aber ein billiger zusätzlicher Anstoß.
    update() { tick(false); },

    unmount() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      stopTimer();
      /* Die Zeichenschleife hält sich selbst an (`destroyed` ganz
         oben in zeichne) — abbestellt wird sie trotzdem hier: sonst
         läuft bis zum nächsten Bild noch eines durch, und das
         greift auf `els` zu, das gleich leer ist. */
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      kartHalt();
      clearTimeout(soloLockT);
      clearTimeout(feierT);
      clearTimeout(deltaT);
      feiernd = false;
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      root = ctx = null; role = null; view = null;
      els = {}; cells = []; cellEls = []; ships = {}; ownPainted = null; mapPaint = null;
      /* Die eingefärbten Bilder bleiben. Sie hängen an keinem Raum
         und an keinem Kind, kosten aber eine gute Sekunde Rechnen —
         wer die Insel schließt und wieder öffnet, soll nicht warten.
         Der Weltzustand geht dagegen weg: er gehört zu einer
         bestimmten Insel. */
      solo = null; soloTask = null; c2d = null; kart = null;
      /* Figur und Schiff gehören zu EINER Insel — anders als die
         eingefärbten Tierbilder, die an keinem Kind hängen. */
      spieler = null;
      welt.isl = null; welt.vb = null; welt.inseln = null; welt.haupt = null;
      welt.tiere = []; welt.nachStufe = new Map();
    }
  });
})();
