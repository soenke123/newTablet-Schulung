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
   Ei → geschlüpft → gewachsen → ausgewachsen (verlässt die Insel)
   → funkelnd. Ab der gewachsenen Stufe gibt es VARIANTEN (VAR2/VAR3):
   drei gewachsene, fünf ausgewachsene — vier davon fliegen, die
   fünfte schwimmt von Insel zu Insel. Zu jeder ausgewachsenen
   Fassung gehört seit 13.09.2026 eine funkelnde mit demselben
   Buchstaben: ein Wort behält sein Tier, es wird nur größer.
   ⚠️ Auf dem Schirm heißen die Stufen EINS bis FÜNF (stufeText) —
   im Quelltext und am Server bleiben sie 0…4.
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
   Seit dem 14.09.2026 sind alle aus diesem Ordner; aus
   clash-of-math ist NICHTS mehr geliehen (Sönke: „auf der Landing
   page sind noch Sprites von Kingdoms of Mathoria"). Zwei Sorten,
   und sie sagen zwei verschiedene Sachen:
     · Ein VOLK ist seine Figur — die Crew auf Stufe 1
       (sprites/held/<n>_1.png, klein `<n>_1k.png`). Immer Stufe 1:
       im Raum gibt es kein eigenes Level, das gehört der Insel.
     · Ein TEAM ist sein SCHIFF (sprites/boot/<n>.png). Dort, wo
       eine Gruppe gemeint ist (Lobby-Spalte, Punktestand am
       Beamer, Podest-Karte am Rundenende), steht das Schiff — es
       ist das Bild, mit dem die Gruppe an der Insel ankommt.
   Burgen und Gruppenbilder gibt es nicht mehr; das Wappenbild vom
   Landeplatz ist schon am 08.09.2026 zur Fahne geworden.
   Der Pfad ist absichtlich der volle ab MPSkills/: ein in tool.js
   gebautes <img>/<image> löst relativ zur SEITE auf (j.html,
   lehrer.html), nicht relativ zu dieser Datei.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Die Völker ────────────────────────────────────────────
     Index = VOLK (nicht Slot), in allen Listen dieselbe
     Reihenfolge. Namen und Farben sind die aus Kingdoms, damit ein
     Kind, das beide Spiele kennt, sich nicht umgewöhnen muss — die
     BILDER sind seit dem 14.09.2026 eigene (siehe oben).

     In der Tabelle steht deshalb nur noch Name und Farbe: welches
     Bild ein Volk hat, folgt aus seiner NUMMER (`held/<n>_1.png`,
     `boot/<n>.png`) und muss nicht dabeistehen. Vorher standen hier
     drei Dateinamen je Zeile, jeder mit Sönkes Schreibweise samt
     Umlaut und Tippfehler — die leben jetzt nur noch im Erzeuger
     (tools/heldsprites.mjs), der aus ihnen die numerierten
     Zuschnitte backt.

     ⚠️ Die Reihenfolge ist die Kennung: Volk 6 und 7 (Sönke,
     09.09.2026: „ich hätte gerne 8 Völker") stehen am ENDE und
     nirgends dazwischen. Die Nummer steht in laufenden Räumen in
     `wi_boards.factions` — wer hier einschiebt, färbt jedes
     bestehende Spiel um.                                          */
  const HELD_DIR = 'tools/wordisland/sprites/held/';
  const BOOT_DIR = 'tools/wordisland/sprites/boot/';
  /* `viele` sagt, ob der Name eine Mehrzahl ist — „Toast-Ritter
     GEWINNEN", aber „Spuk-Einhorn GEWINNT". Das braucht allein das
     Siegerbild (18.09.2026) und es ist dasselbe Feld wie
     FACTION_PLURAL in Kingdoms. Es steht hier und nicht in einer
     zweiten Liste daneben, damit ein neues Volk seine Beugung nicht
     vergessen kann. */
  const TEAMS = [
    { name: 'Toast-Ritter',      color: '#ef4444', viele: true  },
    { name: 'Robo-Enten',        color: '#3b82f6', viele: true  },
    { name: 'Brokkoli-Giraffen', color: '#10b981', viele: true  },
    { name: 'Mal-Hasen',         color: '#f59e0b', viele: true  },
    { name: 'Kosmische Katzen',  color: '#a855f7', viele: true  },
    { name: 'Okto-Pferdchen',    color: '#06b6d4', viele: true  },
    { name: 'Wolken-Piraten',    color: '#f472b6', viele: true  },
    { name: 'Spuk-Einhorn',      color: '#d946ef', viele: false }
  ];
  const TEAM_COUNT = TEAMS.length;

  /* Die drei Bildwege. Getrennte Funktionen und kein Feld in der
     Tabelle: so gibt es für „Volk klein", „Volk groß" und „Schiff"
     je EINE Stelle, an der der Pfad entsteht.

     Im RAUM trägt die Figur immer Stufe 1 — das eigene Level gehört
     der Insel (0145) und nicht dem Volk, dem die Lehrkraft ein Kind
     zuteilt. `_1` steht deshalb fest da und kommt nicht aus einer
     Variablen.

     ⚠️ Das Schiff kommt seit dem 14.09.2026 aus `boot/` und nicht
     mehr aus der Vorlage `sprites/<Farbe> Schiff.png`: die ist
     1984 × 2176 groß (3,4 MB je Volk), gezeichnet wird sie 2,6
     Kacheln breit. Bei 30 Tablets war das eine halbe Gigabyte je
     Runde. Der Zuschnitt hat dasselbe Seitenverhältnis, das Bild
     sitzt also unverändert. */
  const volkSrc  = f => HELD_DIR + (f | 0) + '_1.png';
  const volkMini = f => HELD_DIR + (f | 0) + '_1k.png';
  const shipSrc  = f => BOOT_DIR + (f | 0) + '.png';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const POLL_MS = { participant: 4000, presenter: 3000 };

  /* ─── Der Serien-Takt ────────────────────────────────────────
     Seit Migration 0148 ist die Serie ein TAKT und keine Schwelle:
     jede `step`-te sofort richtige Antwort in Folge bringt eine freie
     Feldwahl, die dazwischen ein zufälliges Nachbarfeld. Jede VIERTE
     dieser Serien zählt doppelt (0149) — das ist `big`.

     Seit 0151 hängen beide Zahlen am MODUS und kommen deshalb vom
     Server (`streak_goals` in wi_view und in jeder Antwort):

        tippen     3 / 12
        auswählen  5 / 20

     Eine Auswahl aus acht Wörtern trifft man auch mit halbem Wissen,
     ein getipptes Wort nicht — derselbe Takt hieße, dass der
     bequemere Modus schneller Felder verteilt.

     Hier steht nur noch der RÜCKFALL, und er ist der Tipp-Modus:
     fehlt 0151 in der Datenbank, zählt der Server weiter in Dreien
     und das Abzeichen zeigt genau das. Gerechnet wird ohnehin
     ausschließlich im Server; das Gerät zählt mit und kündigt an. */
  const TAKT_RUECKFALL = { step: 3, big: 12 };
  let takt = { ...TAKT_RUECKFALL };

  /* Zwei Zahlen, drei Wege hinein (wi_view, jede Antwort, die
     Zwischenstufe) — deshalb eine Stelle, die prüft, statt drei, die
     zuweisen. Unsinn vom Server (0, negativ, fehlend) darf das
     Abzeichen nicht in eine Division durch null schicken. */
  function setzeTakt(g) {
    if (!g) return;
    const step = Math.max(1, g.step | 0);
    const big  = Math.max(step, g.big | 0);
    takt = { step, big };
  }

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
  /* `zu` sind die zugeklappten Units im Wörter-Fenster (0150). Sie
     leben in der SITZUNG und nicht im localStorage: anders als das
     Kind an seiner Insel macht die Lehrkraft dieses Fenster für eine
     Auswahl auf und danach wieder zu. */
  let sets = { list: [], chosen: [], zu: new Set() };
  let setsBusy = 0;         // wie pickBusy: eigener Klick schlägt Server-Antwort
  let tab = 'units';
  let setsOpen = false;
  /* Die offene Wörterliste einer Station (0154): {id, daten, fehler}
     oder null, wenn die Auswahl zu sehen ist. Der Speicher daneben
     lebt so lange wie der Listen-Stand — geleert wird er in
     loadSets(), also nach jedem Import und jedem Löschen. */
  let woerter = null;
  const wortCache = new Map();
  let submitting = false;
  let timerHandle = null;
  let onResize = null;
  let picking = false;      // Tablet: wartet auf einen Fingertipp aufs Feld
  let shadowPick = 0;       // offene Nebelkränze aus dem Schattentempel (0146)
  let pickHand = false;     // hat das Kind den Wahl-Kasten selbst zugemacht?
  let pickWar = 0;          // wie viele Wahlen standen beim letzten Malen offen
  let pickGrund = 'serie';  // woher die offenen Wahlen kommen: 'serie' | 'arena'
  let flashTimer = null;    // die kurze Nachricht (Lichttempel) räumt sich selbst weg
  let lockTimer = null;     // wann die Antwort-Sperre (0151) wieder aufgeht
  let panInline = null, panPick = null;   // die zwei Zoom-Hüllen der Karte
  let markPaint = null;     // malt die erreichbaren Felder (freie Wahl)
  let practice = false;     // Tablet: üben statt warten
  let lastPhase = null;
  let lastSetsChangedAt = null; // 0157: zuletzt gesehener sets_changed_at-Wert

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
  const teamOf = s => TEAMS[facOf(s)] || { name: 'Volk ' + (s + 1), color: '#888', viele: false };

  /* ══════════════════════════════════════════════════════════
     JAHRGANG → UNIT → STATION (Migration 0150)
     ══════════════════════════════════════════════════════════
     Seit 0150 ist ein Vokabelsatz eine STATION und hängt unter
     einer Unit. Beide Auswahl-Oberflächen gruppieren danach — das
     Wörter-Fenster am Pult und die Unit-Leiste der eigenen Insel —,
     und beide bekommen dieselben Felder vom Server
     (vocab_sets_list / wi_solo_open). Die Gruppierung steht deshalb
     HIER und nicht zweimal: sonst sortiert die Lehrkraft nach einer
     anderen Ordnung als das Kind, dem sie die Wörter freischaltet.

     Die Reihenfolge kommt schon richtig vom Server (Jahrgang, Unit,
     Station); eine Map behält sie bei.

     ⚠️ Ein Satz OHNE `unit` — Datenbank ohne 0150 — wird seine
     eigene Gruppe und damit eine Unit am Stück. Die Oberfläche
     sieht dann aus wie vorher, statt alles in einen Topf
     „undefined" zu werfen. */
  function gruppiereNachUnit(liste) {
    const grp = new Map();
    for (const s of (liste || [])) {
      const uid = s.unit || ('einzeln:' + s.id);
      let g = grp.get(uid);
      if (!g) {
        g = { id: uid, title: s.utitle || s.title,
              grade: (s.grade === 0 || s.grade) ? s.grade : null, sets: [] };
        grp.set(uid, g);
      }
      g.sets.push(s);
    }
    // Eine Unit mit genau EINER Station ist eine Unit am Stück.
    for (const g of grp.values()) g.stueck = g.sets.length === 1;
    return [...grp.values()];
  }

  /* Die Überschrift einer Jahrgangs-Gruppe. Eine eigene Liste hat
     keinen Jahrgang — „Jahrgang null" wäre eine Behauptung. */
  const jahrgangText = g =>
    g == null ? 'Eigene Listen' : 'Jahrgang ' + esc(String(g));

  /* Ab wie vielen Stationen die Units zugeklappt starten — „so viel
     passt in die Ansicht, ohne dass man sucht". Ein ganzer Jahrgang
     (~40 Stationen) kommt damit zu, die Testdaten stehen offen. */
  const SETS_AUF_MAX = 12;
  /* Bild eines SLOTS. Die beiden Wege oben nehmen ein Volk; hier
     steht die Übersetzung, damit sie nicht an jeder Aufrufstelle
     wiederholt wird — genau da ist sie beim ersten Bau der Lobby
     einmal vergessen worden (0133). */
  const slotMini = s => volkMini(facOf(s));
  const slotBild = s => volkSrc(facOf(s));
  const slotShip = s => shipSrc(facOf(s));

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

  /* Dieselbe Wabe mit RUNDEN Ecken. Sie gehört der flachen Karte
     (Tablet): ohne Relief, ohne Nebel und ohne Kleinteile wäre ein
     spitzes Sechsecknetz ein Tabellenblatt. Die Rundung kostet
     zwölf Wegbefehle statt sechs und keinen einzigen Filter —
     „schematisch" soll freundlich heißen und nicht technisch. */
  function wabe(x, y, s, rad) {
    const p = HEX.map(([hx_, hy_]) => [x + hx_ * s, y + hy_ * s]);
    const zu = (a, b, t) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L = Math.hypot(dx, dy) || 1;
      return [a[0] + dx / L * t, a[1] + dy / L * t];
    };
    const r = rad * s;
    let d = '';
    for (let i = 0; i < 6; i++) {
      const A = p[i], V = p[(i + 5) % 6], N = p[(i + 1) % 6];
      const e1 = zu(A, V, r), e2 = zu(A, N, r);
      d += (i ? 'L' : 'M') + n2(e1[0]) + ' ' + n2(e1[1])
         + 'Q' + n2(A[0]) + ' ' + n2(A[1]) + ' ' + n2(e2[0]) + ' ' + n2(e2[1]);
    }
    return d + 'Z';
  }

  /* Ein Feld, wie es die jeweilige Karte zeichnet: am Beamer das
     spitze Sechseck, am Tablet die runde Wabe. Gebraucht von allem,
     was AUF einem Feld sitzt und dessen Form treffen muss — der
     Sockel einer Ruine und die Marke der freien Wahl. Stünde dort
     hexPath, säße auf der flachen Karte ein spitzer Sockel auf einer
     runden Kachel. */
  const feldPfad = (x, y, s) => FLACH ? wabe(x, y, s * MINI.wabe, MINI.ecke) : hexPath(x, y, s);

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
    /* ── Wie stark die Volksfarbe den Boden einfärbt ──────────
       Sönke, 14.09.2026: „Man kann am Boden nicht gut erkennen, was
       zu welchem Volk gehört — gelber Strand und grüner Wald sind
       sehr nah an dem dran, was Team Grün und Team Rot haben. Hier
       muss die UI sich besser abheben, dass ich die Felder eindeutig
       erkenne."

       Der Grund stand in dieser einen Zahl: bei .5 war eine eroberte
       Kachel halb Boden und halb Volk. Grasgrün (#7fae5c) und die
       Brokkoli-Giraffen (#10b981) treffen sich dann in der Mitte, und
       wildes Land sieht aus wie erobertes. Bei .82 gewinnt die
       Volksfarbe eindeutig; die 18 % Boden reichen weiter für den
       Unterschied zwischen Strand, Wiese, Wald und Fels — sichtbar
       als HELLIGKEIT, und die kollidiert mit keiner Volksfarbe.

       Der Strand hatte bis dahin einen eigenen, KLEINEREN Anteil
       (.62 davon), weil er so hell ist. Genau er war der zweite Teil
       der Meldung — ein Strand, der nur zu 31 % eingefärbt ist,
       bleibt ein Strand. Die Ausnahme ist weg; was von der Bodenart
       bleiben soll, bleibt für alle vier gleich viel. */
    mix: .82
  };

  /* Wie weit die MITTE eines Schiffes vor der Mitte seines
     Landeplatzes liegt. Steht hier und nicht zweimal im Text: der
     Bildausschnitt muss die Schiffsplätze mitfassen, sonst säbelt er
     die Masten ab. */
  const SHIPD = 2.0;

  /* ─── Die besonderen Orte ───────────────────────────────────
     Ein Ort ist ein PLATZ, kein Bild: Sockel, Schatten und Größe
     gehören der Karte, das Bild darin ist austauschbar.

     Der PLATZ kennt seit den Ruinen (0146) nur noch zwei Größen —
     die KLASSE, die auch der Server schickt: 1 klein (Klo,
     Torbogen), 2 groß (Arena, Tempel). Mehr steht nicht in der
     Karte, und das ist der Kern der Regel: im Nebel sieht man, dass
     sich ein Angriff lohnt, aber nicht, worauf.

     ⚠️ Der SOCKEL ist seit dem 14.09.2026 genau EINE Kachel groß,
     und zwar in beiden Klassen. Sönke: „Die Ruinen sind nicht gut
     klickbar, da sie zu viel Platz wegnehmen. Mach sie mal so groß
     wie alle Felder … die Felder sind gleich groß." Vorher war der
     Sockel selbst 1,3 bzw. 1,8 Kacheln breit — ein großer Ort lag
     damit über seinen sechs Nachbarn, und wer einen davon antippen
     wollte, traf die Ruine. Die Kachel ist die Trefferfläche, also
     muss sie so groß sein wie jede andere.

     Überlappen darf nur noch das BILD, und das ist der Unterschied
     zwischen den Klassen: `bild` ist die Breite des Gebäudes in
     Kacheln (klein leicht darüber, groß etwas mehr — genau Sönkes
     Abstufung), `hoch` das Verhältnis von Bildhöhe zur Breite. Ein
     Gebäude, das über den Rand ragt, verdeckt einen Nachbarn ein
     wenig, nimmt ihm aber keinen Fingertipp weg: die Orte-Schicht ist
     für Zeiger durchlässig (tool.css).

     `halo` ist der Lichtpunkt im Nebel — er trägt die Klasse. Er
     darf größer sein als der Sockel: er verrät nur, DASS dort etwas
     ist. */
  const PLACES = {
    1: { bild: 1.16, hoch: 1.05, halo: .30 },
    2: { bild: 1.44, hoch: 1.05, halo: .40 }
  };
  /* Das Feld, auf dem ein Ort steht — dieselbe 1.0 wie im Relief.
     Als Konstante und nicht als Zahl an vier Stellen: sie IST die
     Zusage „die Felder sind gleich groß". */
  const PLACE_PLATTE = 1.0;
  /* Wo die Herzenreihe auf dem Gebäude sitzt, als Anteil der
     Bildhöhe über dem Sockel. Sönke, 14.09.2026: „Die Herzen der
     Ruinen sollten auf der Ruine sein." Siehe placeLayer. */
  const HERZ_HOCH = .42;
  /* Die Platzhalter-Zeichen, solange kein Sprite geladen ist: eine
     Mauer für die kleinen, ein Tempel für die großen. Ein Kind soll
     aus zehn Metern sehen, WAS dort steht, nicht nur DASS dort
     etwas steht. */
  const MARK = {
    1: 'M-.30 .22 L-.30 -.12 L-.16 -.18 L-.16 .22 Z M .04 .22 L .04 -.24 L .20 -.30 L .20 .22 Z '
     + 'M-.30 -.12 L-.16 -.18 L-.16 -.06 L-.30 -.02 Z',
    2: 'M-.36 .24 L .36 .24 L .36 .14 L-.36 .14 Z M-.26 .14 L-.26 -.06 L-.16 -.06 L-.16 .14 Z '
     + 'M-.05 .14 L-.05 -.06 L .05 -.06 L .05 .14 Z M .16 .14 L .16 -.06 L .26 -.06 L .26 .14 Z '
     + 'M-.34 -.06 L0 -.30 L .34 -.06 Z'
  };

  /* ─── Die fünf Ruinen ───────────────────────────────────────
     Der Schlüssel ist das Zeichen aus `ruins` (wi_ruin_string), die
     Zahlen sind die von wi_ruin_def in Migration 0146.

     ⚠️ Dieselbe Balance steht damit zwangsläufig in zwei Dateien —
     im Browser und in Postgres. Prüfstand `uitest.js` liest BEIDE
     und vergleicht sie; ohne das zeigt die Lobby irgendwann fünf
     Herzen an, während der Server mit vieren rechnet, und beides
     sieht für sich plausibel aus.

     `leben` ist Sönkes Zahl (das Feld selbst zählt mit), `herzen`
     die Anzeige — ein Herz weniger. */
  const RUIN_DIR = 'tools/wordisland/sprites/ruine/';
  const RUINEN = {
    K: { art: 'klo',      name: 'Klo',            leben: 2, herzen: 1, wert: 5,
         gross: false, img: 'klo.png',      kann: null },
    T: { art: 'tor',      name: 'Torbogen',       leben: 3, herzen: 2, wert: 10,
         gross: false, img: 'tor.png',      kann: null },
    A: { art: 'arena',    name: 'Arena',          leben: 4, herzen: 3, wert: 4,
         gross: true,  img: 'arena.png',    kann: 'Nimm mehr Land ein' },
    L: { art: 'licht',    name: 'Lichttempel',    leben: 5, herzen: 4, wert: 5,
         gross: true,  img: 'licht.png',    kann: 'Schütze deine Felder' },
    S: { art: 'schatten', name: 'Schattentempel', leben: 5, herzen: 4, wert: 5,
         gross: true,  img: 'schatten.png', kann: 'Hol den Nebel zurück' }
  };
  const ruinSrc = k => RUINEN[k] ? encodeURI(RUIN_DIR + RUINEN[k].img) : '';

  /* Ein Herz. Gezeichnet und nicht als Zeichen gesetzt: auf der
     Karte wird alles in Kacheln gerechnet, und ein ❤ in einem
     <text> hinge an der Schriftart des Geräts. */
  const HERZ = 'M0 .26 C-.36 .02 -.30 -.30 -.10 -.30 C-.03 -.30 0 -.24 0 -.19 '
             + 'C0 -.24 .03 -.30 .10 -.30 C .30 -.30 .36 .02 0 .26 Z';

  /* ─── Die Filter-Werkstatt ──────────────────────────────────
     ⚠️ Bei ALLEN: die Werte rechnen in BENUTZEREINHEITEN, und eine
     Einheit ist hier eine Kachel. stdDeviation="3" wäre kein
     Weichzeichner, sondern ein Nebel über der halben Insel.

     Nur die acht, die Relief + Tonstufen wirklich braucht. Im
     Showroom liegen mehr; die gehören zu den Varianten, die wir
     nicht genommen haben. */
  let FID = 'wi_';
  const F = n => 'url(#' + FID + n + ')';

  /* ⚠️ Auf dem Tablet gibt es KEINE Filter (siehe „DIE FLACHE
     KARTE" weiter unten). `FB` ist deshalb der Weg, auf dem die
     gemeinsamen Schichten — Orte, Fahnen, Schiffe — ihre kleinen
     Weichzeichner anfordern: am Beamer bekommen sie einen, am
     Tablet `null`, und `el()` lässt das Merkmal dann weg.

     Nicht „filter=''" und nicht „url(#gibtsnicht)": ein Element mit
     ungültiger Filterangabe wird GAR NICHT gezeichnet. */
  let FLACH = false;
  const FB = n => FLACH ? null : F(n);

  function buildDefs(svg, mini) {
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
    /* Die acht teuren gibt es nur am Beamer. Auf dem Tablet ist
       nicht bloß der Nebel weg, der sie bräuchte — ein gefiltertes
       SVG muss bei JEDER Zoomstufe neu gerastert werden, und genau
       das ist der Grund, warum das Zoomen auf dem Handy hakt.
       Der Farbfilter der Ruinen bleibt in beiden Rollen: er liegt
       auf zehn kleinen Bildern und trägt eine Auskunft (wem die
       Ruine gehört). */
    if (mini) {
      TEAMS.forEach((tm, i) => filt('tint' + i, { x: '0%', y: '0%', width: '100%', height: '100%' }, f => {
        el('feFlood', { 'flood-color': tm.color, result: 'c' }, f);
        el('feComposite', { in: 'c', in2: 'SourceGraphic', operator: 'in' }, f);
      }));
      return;
    }

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

    /* ─── Die Ruine in der Volksfarbe ──────────────────────────
       Sönke, 14.09.2026: „Können auch die Bilder der Ruinen die
       Farbe des Volkes einnehmen?" — Ja, und zwar als WASCHE über
       dem Bild und nicht als Ersatz dafür: `feFlood` füllt die
       Fläche mit der Volksfarbe, `feComposite operator="in"` schneidet
       sie auf die Silhouette des Bildes zu. Darüber gelegt (halb
       durchsichtig, RUIN_TON) behält der Tempel seine Schattierung
       und bekommt trotzdem eindeutig die Farbe.

       Warum nicht `feBlend mode="color"`, was genau das eine
       könnte? Weil die erweiterten Mischarten auf älteren iPads
       fehlen, und dort stünde dann ein Tempel ganz ohne Einfärbung
       — also genau der Zustand, der hier abgeschafft werden soll.
       feFlood und feComposite gibt es überall.

       Acht Filter, einer je Volk: ein Filter ist geteilt, seine
       Farbe kann also nicht am Element hängen. Sie kosten nichts,
       solange kein Bild sie benutzt. */
    TEAMS.forEach((tm, i) => filt('tint' + i, { x: '0%', y: '0%', width: '100%', height: '100%' }, f => {
      el('feFlood', { 'flood-color': tm.color, result: 'c' }, f);
      el('feComposite', { in: 'c', in2: 'SourceGraphic', operator: 'in' }, f);
    }));
  }

  /* Wie stark die Volksfarbe über dem Ruinenbild liegt. Eine Zahl,
     und sie ist ein Kompromiss mit sich selbst: darunter erkennt man
     die Farbe nicht, darüber das Gebäude nicht mehr. */
  const RUIN_TON = .58;

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
  /* Seit der flachen Karte (16.09.2026) ist die Frage nach dem
     Nachbarn ein Parameter: `dazu(r, c)` sagt, ob dort dieselbe
     Menge weitergeht. Für die Küste heißt das „ist da Land", für
     den Rahmen um ein Volksgebiet „gehört das demselben Volk".
     Eine Funktion, zwei Umrisse. */
  function umriss(menge, dazu, gap) {
    /* Die Ecken auf HUNDERTSTEL runden, nicht feiner. Zwei Kanten,
       die von verschiedenen Feldern aus gerechnet wurden, treffen
       sonst nicht denselben Schlüssel — und die Kette reißt. Als
       Strich sähe man den Fehler nicht (jedes Stück wird ja
       gezeichnet), als FLÄCHE wäre die Insel weg. */
    const K = (x, y) => Math.round(x * 100) + ',' + Math.round(y * 100);
    const von = new Map();
    const alle = [];
    for (const z of menge) {
      const nb = neighbors(z.r, z.c);
      for (let i = 0; i < 6; i++) {
        if (dazu(nb[i][0], nb[i][1])) continue;
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

  /* Die Küste: Land gegen Meer. */
  const coastRings = (isl, gap) => umriss(isl.cells, (r, c) => !!isl.at(r, c), gap);

  /* Das Gebiet eines Volkes: eigene Kachel gegen alles andere —
     gegen fremde Völker, gegen Nebel und gegen das Meer. Liegen zwei
     Stücke getrennt, kommen zwei Ringe heraus; ein eingeschlossenes
     fremdes Feld bekommt seinen eigenen Innenring. Beides fällt beim
     Ketten von selbst an. */
  function gebietsRinge(isl, own, ch, gap) {
    const menge = isl.cells.filter(z => own[z.i] === ch);
    if (!menge.length) return [];
    return umriss(menge, (r, c) => {
      const n = isl.at(r, c);
      return !!n && own[n.i] === ch;
    }, gap);
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
      /* Die sechs Nachbarn als INDEX, einmal beim Aufbau. Der
         Grenzstrich (unten) braucht sie bei jedem Takt, und
         `isl.at` je Feld und Takt wäre dreitausendmal dieselbe
         Suche. -1 heißt „da ist Meer". */
      const nb = neighbors(z.r, z.c).map(([nr, nc]) => {
        const m = isl.at(nr, nc);
        return m ? m.i : -1;
      });
      nodes.push({ z, nb, gg, base, side, top, det, kante: null });
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

    /* ─── Der Grenzstrich ───────────────────────────────────────
       Die zweite Hälfte von Sönkes Meldung („dass ich die Felder
       eindeutig erkenne"). Die kräftigere Einfärbung sagt, WELCHES
       Volk eine Kachel hat; der Strich sagt, WO sein Gebiet aufhört
       — und das ist die Auskunft, die man auf dem Beamer aus zehn
       Metern braucht.

       Gezogen wird KANTENWEISE und nicht als Umriss der Vereinigung.
       Der naheliegende Weg (alle eigenen Kacheln in einen Pfad, den
       umranden) kann es hier gar nicht geben: im Relief steht jede
       Kachel auf ihrer eigenen Geländehöhe, ein gemeinsamer Umriss
       läge also quer durch die Säulen. Kante für Kante liegt jeder
       Strich auf der Deckfläche, zu der er gehört.

       Eine Kante wird gezogen, wenn der Nachbar dahinter NICHT
       demselben Volk gehört — also auch gegen Nebel und gegen Meer.
       Gegen den Nebel ist das Absicht: dort steht die Front, und
       genau die will man sehen. Zwei benachbarte Völker ziehen jedes
       seinen eigenen Strich in seiner eigenen Farbe; die Doppellinie
       IST die Grenze.

       Aufgehellt statt abgedunkelt: ein dunkler Strich verschwindet
       im Schatten der Säule dahinter, ein heller steht auf jeder
       Bodenart. */
    function kantenPfad(n, own, ch, y) {
      const z = n.z;
      let d = '';
      for (let i = 0; i < 6; i++) {
        const j = n.nb[i];
        if (j >= 0 && own[j] === ch) continue;
        const e = EDGE[i], a = HEX[e], b = HEX[(e + 1) % 6];
        d += `M${n2(z.x + a[0])} ${n2(y + a[1])}L${n2(z.x + b[0])} ${n2(y + b[1])}`;
      }
      return d;
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
           „lebt" und „ruckelt".
           ⚠️ Seit dem Grenzstrich reicht „meine Kachel ist gleich
           geblieben" nicht mehr: verliert der NACHBAR sein Feld,
           ändert sich mein Strich, ohne dass sich mein Zeichen
           ändert. Ohne die zweite Zeile bliebe eine Grenze stehen,
           die es nicht mehr gibt — und zwar bis diese Kachel selbst
           den Besitzer wechselt. */
        if (own && ownPainted && ownPainted[z.i] === ch
            && n.nb.every(j => j < 0 || ownPainted[j] === own[j])) continue;
        const on = own ? ch !== '.' : true;
        const t = (own && on) ? facOf(+ch) : -1;
        const farbe = (own && on) ? (TEAMS[t] || { color: '#888' }).color : null;
        /* Nebel liegt flach, erobertes Land steht auf. */
        const h = on ? z.hoch : .10;
        const y = z.y - h + .1;
        n.top.setAttribute('d', hexPath(z.x, y, 1.0));
        n.side.setAttribute('d', sidePath(z.x, y, 1.0, h + .06));
        const deck = farbe ? mix(KARTE.land[z.boden], farbe, KARTE.mix) : KARTE.land[z.boden];
        n.top.setAttribute('fill', deck);
        n.side.setAttribute('fill', shade(deck, farbe ? -.45 : -.5));
        n.top.dataset.t = farbe ? String(t) : '.';
        if (n.det) n.det.setAttribute('transform', `translate(0 ${n2(-h + .1)})`);

        /* Der Grenzstrich, und zwar SPÄT angelegt: Nebelfelder und
           das Innere eines Gebiets bekommen nie einen, und das sind
           die allermeisten. Ein leerer Pfad je Kachel wäre auf einer
           großen Insel ein halbes Tausend Knoten für nichts. */
        const dK = farbe ? kantenPfad(n, own, ch, y) : '';
        if (dK && !n.kante) {
          n.kante = el('path', { class: 'wi-edge', d: '', fill: 'none' }, n.gg);
        }
        if (n.kante) {
          n.kante.setAttribute('d', dK);
          if (dK) n.kante.setAttribute('stroke', mix(farbe, '#ffffff', .52));
        }
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
     DIE FLACHE KARTE (Tablet)
     ══════════════════════════════════════════════════════════
     Sönke, 16.09.2026: „Ich möchte, dass die Map auf den Handys der
     Schüler bisschen einfacher designt ist: kein Nebel (nur anders
     farbende Waben), auch die Felder sind simpler und die Höhen-
     unterschiede sind weg … schneller geladen, flüssiger beim
     Zoomen und Scrollen. Die Sprites der Ruinen und der Schiffe
     sowie die Landungspunkte können beibehalten werden."

     Entschieden am Standbild in `mini-showroom.html`. Am BEAMER
     bleibt alles, wie es war — dort steht ein Rechner, die Karte
     wird nicht angefasst, und das Relief trägt über zehn Meter.

     ── Was das Tablet nicht mehr bekommt ────────────────────────
       · keinen einzigen Filter (Wolke, Rauschen, Weichzeichner):
         ein gefiltertes SVG rastert bei JEDER Zoomstufe neu, und
         genau daran hakt das Schieben auf dem Handy;
       · keinen Nebel als Wolke — verhülltes Land ist eine gedeckt
         eingefärbte Wabe;
       · kein Relief: eine Kachel ist EIN Pfad statt vier Knoten;
       · keine Kleinteile und keine laufende Brandung (bis zu
         dreihundert bewegte Gruppen an der Küste).
     Gemessen: rund 500 Elemente für 430 Felder statt gut 2500.

     ── Was es dafür bekommt ─────────────────────────────────────
     Einen RAHMEN um jedes Volksgebiet (Sönke, 16.09.2026: „damit
     man sofort sieht, das gehört zusammen"). Am Beamer geht das
     nicht — dort steht jede Kachel auf ihrer eigenen Geländehöhe,
     ein gemeinsamer Umriss läge quer durch die Säulen, deshalb
     zieht das Relief seinen Grenzstrich Kante für Kante. Flach ist
     der geschlossene Zug möglich, und er sagt etwas, das fünfhundert
     Strichlein nie sagen können.                                  */

  /* Kachelbreite und Eckenrundung. Der Rest bis 1.0 ist die NAHT:
     durch sie scheint die dunkle Unterlage, und daraus entsteht das
     Wabenmuster — ohne dass eine einzige Kante gezeichnet wird. */
  const MINI = {
    wabe: .93, ecke: .16,
    naht: '#0c2233',
    /* Wohin wildes (verhülltes) Land entsättigt wird. Es soll
       zurückstehen, ohne zu verschwinden: was man sieht, ist die
       Insel, was man liest, sind die Gebiete. */
    wild: '#7f8f96', wildAnt: .26,
    /* Das Meer in drei Tönen statt in fünf, jeder ein Strich auf dem
       Küstenzug. Ohne Auslenkung: die vier parallelen Tiefenlinien
       brauchten sie, drei Säume kommen ohne aus. */
    see: [[3.4, '#11516b'], [1.3, '#2b86a2']],
    /* Der Rahmen um ein Gebiet, in zwei Lagen: darunter breit und
       dunkel (damit die Linie auf jeder Bodenfarbe steht), darüber
       schmal in der aufgehellten Volksfarbe — die Volksfarbe selbst
       wäre auf dem eigenen Gebiet unsichtbar. Das EIGENE Volk
       bekommt den kräftigeren Zug; es ist die einzige Stelle, die
       „ich" von „die anderen" unterscheidet. */
    randDunkel: 'rgba(7,22,33,.50)',
    randBreit: [.21, .27], randSchmal: [.11, .16], randHell: [.46, .62]
  };

  /* Die Farbe einer Kachel. Dieselbe Mischung wie im Relief
     (KARTE.mix), damit ein Volk auf beiden Karten dieselbe Farbe
     hat — am Beamer und auf dem Tablet wird über dasselbe Spiel
     geredet. */
  function miniFill(z, ch) {
    const grund = KARTE.land[z.boden];
    if (ch === '.') return mix(grund, MINI.wild, MINI.wildAnt);
    const t = facOf(+ch);
    return mix(grund, (TEAMS[t] || { color: '#888' }).color, KARTE.mix);
  }

  /* Das Meer: Hintergrund, zwei Säume, eine Schaumlinie. Die
     Schaumlinie läuft weiter (CSS, ein Element) — eine stehende
     sieht aus wie der Rand eines Aufklebers. Brandung und Wellen
     gibt es hier nicht. */
  function flachSee(svg, vb, dCoast) {
    const g = el('g', { class: 'wi-sea' }, svg);
    const M = 9;
    el('rect', {
      x: n2(vb[0] - M), y: n2(vb[1] - M), width: n2(vb[2] + 2 * M), height: n2(vb[3] + 2 * M),
      fill: KARTE.sea.deep
    }, g);
    for (const [w, col] of MINI.see) {
      el('path', { d: dCoast, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linejoin': 'round' }, g);
    }
    el('path', {
      class: 'wi-foam', d: dCoast, fill: 'none', stroke: KARTE.sea.foam,
      'stroke-width': .13, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      'stroke-dasharray': '.7 .5', opacity: .75
    }, g);
    return g;
  }

  /* Das Land. Eine Unterlage, ein Pfad je Feld, ein Umriss je Volk.
     Zurück kommt dieselbe Malfunktion wie beim Relief: paint(own). */
  function flachLand(svg, isl) {
    /* Die Unterlage: die ganze Insel einmal in Tintenblau, unter den
       Waben. Sie ist der Grund, warum in der Naht kein Meerblau
       durchblitzt. */
    let dU = '';
    for (const z of isl.cells) dU += hexPath(z.x, z.y, 1.02);
    el('path', { class: 'wi-naht', d: dU, fill: MINI.naht }, svg);

    const gLand = el('g', {}, svg);
    /* EIN Pfad-Text für alle Kacheln, jede verschoben: das spart bei
       900 Feldern 900 lange `d`-Angaben, und geändert wird ohnehin
       nur die Farbe. */
    const dWabe = wabe(0, 0, MINI.wabe, MINI.ecke);
    const nodes = [];
    for (const z of isl.cells) {
      const t = el('path', {
        class: 'wi-cell', transform: `translate(${n2(z.x)} ${n2(z.y)})`,
        d: dWabe, fill: miniFill(z, '.')
      }, gLand);
      t.dataset.i = z.i; t.dataset.r = z.r; t.dataset.c = z.c; t.dataset.t = '.';
      nodes.push({ z, top: t });
      cellEls[z.i] = t;
    }

    /* Die Rahmen liegen ÜBER den Kacheln und unter allem anderen.
       Zwei Pfade je Volk, angelegt beim ersten Auftreten. */
    const gRing = el('g', { class: 'wi-areas' }, svg);
    const rahmen = new Map();

    return function paint(own) {
      /* Hat sich gar nichts bewegt, ist nichts zu tun — und das ist
         der Normalfall, denn der Takt läuft alle vier Sekunden und
         nicht jedes Kind antwortet in jedem. `ownPainted` ist dabei
         genau die richtige Bezugsgröße: es steht auf `null`, wenn
         die Völker gewechselt haben, und erzwingt dann den vollen
         Neuanstrich. */
      if (ownPainted === own) return;
      for (const n of nodes) {
        const ch = own[n.z.i];
        if (ownPainted && ownPainted[n.z.i] === ch) continue;
        n.top.setAttribute('fill', miniFill(n.z, ch));
        n.top.dataset.t = ch === '.' ? '.' : String(facOf(+ch));
      }

      /* Die Rahmen: je Volk ein geschlossener Zug. Die Kantenkette
         sieht jede Kachel einmal an, das ist billig genug für einen
         Takt alle vier Sekunden — und rückwärts gerechnet lässt sich
         ein Umriss nicht: verliert ein Volk ein Feld irgendwo, ändert
         sich der ganze Ring. */
      for (let s = 0; s < TEAM_COUNT; s++) {
        const ch = String(s);
        const ringe = gebietsRinge(isl, own, ch, 1.0);
        let k = rahmen.get(s);
        if (!ringe.length) {
          if (k) { k.dunkel.setAttribute('d', ''); k.hell.setAttribute('d', ''); }
          continue;
        }
        const d = ringsPath(ringe, 0, true, 0);
        const mein = meinSlot() === s;
        const i = mein ? 1 : 0;
        if (!k) {
          k = {
            dunkel: el('path', { class: 'wi-area', fill: 'none', stroke: MINI.randDunkel }, gRing),
            hell: el('path', { class: 'wi-area', fill: 'none' }, gRing)
          };
          rahmen.set(s, k);
        }
        k.dunkel.setAttribute('d', d);
        k.dunkel.setAttribute('stroke-width', MINI.randBreit[i]);
        k.hell.setAttribute('d', d);
        k.hell.setAttribute('stroke-width', MINI.randSchmal[i]);
        k.hell.setAttribute('stroke',
          mix((TEAMS[facOf(s)] || { color: '#888' }).color, '#ffffff', MINI.randHell[i]));
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

  /* Eine Reihe Herzen über einem Ort. Sie werden bei jeder Änderung
     neu gesetzt und nicht ein- und ausgeblendet: es sind höchstens
     vier Pfade, und ein Vorrat versteckter Herzen wäre genau die
     Sorte Zustand, die man beim nächsten Umbau übersieht. */
  function herzReihe(g, anzahl, y, gr, platte) {
    while (g.firstChild) g.removeChild(g.firstChild);
    if (!anzahl) return;
    const b = gr * 1.15;
    const x0 = -(anzahl - 1) * b / 2;
    /* Ein dunkles Kissen darunter — nur dort, wo die Reihe AUF einem
       Bild liegt (seit die Herzen auf der Ruine sitzen). Ein weiß
       umrandetes Herz steht für sich zwar auf jedem Untergrund, aber
       auf einer gezeichneten Tempelfassade mit Fugen und Schatten
       zerfällt die Reihe optisch — und abzählen soll man sie. Auf
       einem einfarbigen Feld (Schutzherzen) wäre das Kissen dagegen
       ein Fleck ohne Grund, deshalb der Schalter. */
    if (platte) {
      const w = (anzahl - 1) * b + gr * 1.22;
      el('rect', {
        x: n2(-w / 2), y: n2(y - gr * .58), width: n2(w), height: n2(gr * 1.16),
        rx: n2(gr * .58), fill: 'rgba(9,18,26,.52)'
      }, g);
    }
    for (let i = 0; i < anzahl; i++) {
      el('path', {
        d: HERZ, fill: '#e23c50', stroke: 'rgba(255,255,255,.92)',
        'stroke-width': .07, 'paint-order': 'stroke',
        transform: `translate(${n2(x0 + i * b)} ${n2(y)}) scale(${n2(gr)})`
      }, g);
    }
  }

  function placeLayer(svg, isl) {
    const g = el('g', { class: 'wi-places' }, svg);
    const marks = [];
    for (const z of isl.cells) {
      if (!z.ruin) continue;
      const def = PLACES[z.ruin] || PLACES[1];
      /* `sc` war bis zum 14.09.2026 die Übergröße des ganzen Platzes
         und steckte in jeder Zahl hier drin. Jetzt ist der Platz eine
         Kachel; was mit der Klasse wächst, sind Bild, Lichtpunkt und
         Herzenreihe — und die stehen einzeln da. */
      const gg = el('g', { class: 'wi-place', transform: `translate(${n2(z.x)} ${n2(z.y)})` }, g);
      /* Was durch die Wolke dringt, ist der SCHEIN. Der Ort selbst
         bleibt verdeckt — sonst wäre der Nebel nur ein Farbfilter.
         Klein halten: mit dem Radius einer ganzen Kachel stehen auf
         dem Nebel zehn gelbe Flecken, die aussehen wie ein Fehler
         im Bild. Ein Licht im Nebel ist ein PUNKT mit Schein, keine
         Scheibe. */
      const halo = el('circle', { class: 'wi-halo', r: n2(def.halo), fill: KARTE.gold, opacity: .6, filter: FB('b2') }, gg);
      const gBody = el('g', { opacity: 0 }, gg);
      el('ellipse', { cx: 0, cy: .30, rx: n2(.42 * def.bild), ry: .16, fill: 'rgba(0,0,0,.38)', filter: FB('b1') }, gBody);
      /* Der Sockel: gerodeter Boden, auf dem der Ort steht. Er
         gehört der Karte und bleibt, egal welches Bild darauf
         kommt — und er ist genau eine Kachel. */
      const plate = el('path', {
        class: 'wi-plate', d: feldPfad(0, 0, PLACE_PLATTE), fill: KARTE.land.sand,
        stroke: shade(KARTE.land.sand, -.35), 'stroke-width': .05
      }, gBody);
      el('path', { d: feldPfad(0, 0, PLACE_PLATTE), fill: 'none', stroke: KARTE.gold, 'stroke-width': .06, opacity: .8 }, gBody);
      const w = def.bild, h = w * def.hoch;
      /* EIN Bildknoten je Ort, dessen Quelle erst beim Aufdecken
         gesetzt wird. Fünf Knoten je Ort (einer je Ruinenart) wären
         fünfmal so viel Ladung für vier Bilder, die nie zu sehen
         sind; ein leeres <image> lädt nichts. */
      /* Die Unterkante steht auf dem Sockel (.22 unter der Mitte,
         also im vorderen Drittel der Kachel) — das Gebäude wächst von
         dort nach oben aus dem Feld heraus. */
      const fuss = .22;
      const masse = {
        x: n2(-w / 2), y: n2(fuss - h), width: n2(w), height: n2(h),
        preserveAspectRatio: 'xMidYMax meet'
      };
      const bild = img(gBody, '', Object.assign({ opacity: 0 }, masse));
      /* Dasselbe Bild ein zweites Mal, nur durch den Farbfilter —
         die Wasche in der Volksfarbe (Sönke, 14.09.2026: „Können auch
         die Bilder der Ruinen die Farbe des Volkes einnehmen?").
         Sie liegt ÜBER dem Bild und deckt es nicht ab: RUIN_TON, und
         die Schattierung des Gebäudes scheint durch. Solange die
         Ruine niemandem gehört, steht sie auf 0 und lädt zwar
         dieselbe Datei, kostet aber nichts weiter. */
      const wasche = img(gBody, '', Object.assign({ opacity: 0 }, masse));
      /* Das Platzhalter-Zeichen bekommt eine helle Kontur: dunkles
         Grau auf sandfarbenem Sockel ist sonst kaum von der
         Bodentextur zu unterscheiden. Es steht, solange das Sprite
         nicht da ist — und bei einem Ordner ohne Bilder für immer. */
      const zeichen = el('path', {
        d: MARK[z.ruin] || MARK[1], fill: KARTE.signInk, opacity: .92,
        stroke: 'rgba(255,255,255,.75)', 'stroke-width': .045, 'paint-order': 'stroke',
        transform: `scale(${n2(w)})`
      }, gBody);
      /* Die Herzen hängen AM ORT und nicht am Körper: sie sollen
         auch dann stehen, wenn das Gebäude gerade niemandem gehört.
         Ihre Größe hängt NICHT mehr an der Klasse: vier Herzen über
         einem Tempel und eines über einem Klo sind dieselbe Auskunft
         und sollen gleich groß dastehen.

         ⚠️ Seit dem 14.09.2026 liegen sie AUF dem Gebäude (Sönke:
         „die Herzen der Ruinen sollten auf der Ruine sein") und nicht
         mehr darüber in der Luft. Das ist mehr als Geschmack: über
         dem Bild lagen sie bei einem hohen Tempel schon auf dem
         Nachbarfeld, und wer vier Herzen sah, konnte nicht sagen, zu
         welcher der beiden Kacheln sie gehören. HERZ_HOCH ist der
         Anteil der Bildhöhe über dem Sockel — .42 trifft die untere
         Hälfte, wo bei allen fünf Ruinen Mauerwerk steht und keine
         Silhouette. */
      const herzen = el('g', { class: 'wi-hearts' }, gg);
      marks.push({ z, halo, gBody, plate, bild, wasche, zeichen, herzen,
                   hy: n2(fuss - h * HERZ_HOCH), last: null, quelle: '' });
    }

    return function paint(own, ruins, hearts) {
      for (const m of marks) {
        const ch = own[m.z.i];
        const art = ruins[m.z.i];
        const hp = (hearts.charCodeAt(m.z.i) - 48) | 0;
        /* Drei Zeichenketten, ein Vergleich: der Ort malt sich neu,
           wenn sich SEIN Zustand geändert hat — Besitz, Art oder
           Herzen. Der Vergleich gegen `ownPainted` allein hätte
           einen Treffer ohne Besitzwechsel verschluckt. */
        const jetzt = ch + art + hp;
        if (m.last === jetzt) continue;
        m.last = jetzt;

        const on = ch !== '.';
        const auf = art !== '.';
        const t = on ? facOf(+ch) : -1;
        /* Der Sockel nimmt die Farbe des Volkes an, sobald der Ort
           gehört — das ist die Meldung „erobert", ohne eine Zahl. */
        /* Derselbe Anteil wie im Relief (KARTE.mix) und nicht mehr
           ein eigener: bei .55 gegen .82 sah der Sockel einer
           eroberten Ruine aus wie ein Feld eines ANDEREN Volkes —
           blasser als alles ringsum, aber in derselben Farbfamilie. */
        m.plate.setAttribute('fill', on
          ? mix(KARTE.land.sand, (TEAMS[t] || { color: '#888' }).color, KARTE.mix)
          : KARTE.land.sand);

        /* Sichtbar wird das Gebäude mit dem ERSTEN TREFFER, nicht
           mit dem Besitz: „aber was verbirgt sich da?" ist die Frage,
           die der Schein im Nebel stellt, und ein Angriff ist die
           Antwort darauf. Der Nebel bleibt dabei liegen — die
           Orte-Schicht liegt über ihm. */
        m.gBody.setAttribute('opacity', auf ? 1 : 0);
        m.halo.setAttribute('opacity', on ? .3 : auf ? .45 : .6);

        if (auf && RUINEN[art] && m.quelle !== art) {
          m.quelle = art;
          for (const nd of [m.bild, m.wasche]) {
            nd.setAttributeNS('http://www.w3.org/1999/xlink', 'href', ruinSrc(art));
            nd.setAttribute('href', ruinSrc(art));
          }
          m.bild.setAttribute('opacity', 1);
          m.zeichen.setAttribute('opacity', 0);
        }
        /* Die Wasche in der Volksfarbe. Sie hängt am BESITZ und nicht
           am Aufdecken: eine Ruine, die noch niemandem gehört, hat
           keine Farbe zu tragen. Der Filter wird hier gesetzt und
           nicht beim Aufbau — er ist einer von acht, und welcher
           gilt, entscheidet sich erst mit dem Volk. */
        m.wasche.setAttribute('opacity', on && m.quelle ? RUIN_TON : 0);
        if (on) m.wasche.setAttribute('filter', F('tint' + t));
        herzReihe(m.herzen, auf ? hp : 0, m.hy, .30, true);
      }
    };
  }

  /* ─── Schutzherzen auf ganz normalen Feldern ────────────────
     Der Lichttempel verteilt sie; auf der Karte sind sie dieselbe
     Auskunft wie die Herzen einer Ruine — „hier musst du zweimal
     treffen". Deshalb dasselbe Zeichen, nur kleiner.

     Ruinenfelder überspringt diese Schicht immer: ihre Herzen malt
     placeLayer, und zwar erst, wenn sie aufgedeckt sind. */
  function guardLayer(svg, isl) {
    const g = el('g', { class: 'wi-guards' }, svg);
    const knoten = new Map();
    let last = null;
    return function paint(own, ruins, hearts) {
      if (hearts === last) return;
      last = hearts;
      for (const z of isl.cells) {
        if (z.ruin) continue;
        const hp = (hearts.charCodeAt(z.i) - 48) | 0;
        let k = knoten.get(z.i);
        if (!hp) {
          if (k) { g.removeChild(k); knoten.delete(z.i); }
          continue;
        }
        if (!k) {
          k = el('g', { transform: `translate(${n2(z.x)} ${n2(z.y - .42)})` }, g);
          knoten.set(z.i, k);
        }
        herzReihe(k, hp, 0, .26);
      }
    };
  }

  /* ─── Die erreichbaren Felder ───────────────────────────────
     Sönke, 14.09.2026: „Die klickbaren Felder sind leicht markiert.
     Der Nebel ist nicht weg! Der bleibt."

     Beides zusammen ist der eigentliche Entwurf. Bis dahin machte
     die Karte beim Wählen den Nebel durchsichtig (.is-picking .wi-fog
     auf .42) — damit verriet eine Serie, was unter der Decke liegt,
     und genau das soll sie nicht: „im Nebel sieht man, dass sich ein
     Angriff lohnt, aber nicht worauf" (0146). Der Ersatz ist eine
     Marke, die nicht ins Feld sieht, sondern es UMREISST.

     Sie liegt deshalb GANZ OBEN und nicht bei der Kachel: unter dem
     Nebel wäre der Ring im Kern unsichtbar, und ausgerechnet die
     erreichbaren Felder liegen am Nebelrand. Über allem gezogen ist
     er in jeder Lage gleich gut zu sehen.

     Gerechnet wird im Gerät und nicht gefragt: die Regel steht in
     wi_pick_tile (0146) und ist kurz — ein Feld gehört dazu, wenn es
     nicht Landeplatz ist, nicht dem eigenen Volk gehört und an ein
     eigenes Feld grenzt. Ein eigener RPC dafür wäre ein Gang zum
     Server je Antwort, und die Antwort stünde vier Sekunden zu spät
     da. ⚠️ Wer die Regel dort ändert, muss sie hier mitändern; der
     Server bleibt die Wahrheit, das hier ist nur der Hinweis.

     Beim Schattentempel gibt es keine Marken: dort ist die ganze
     Insel erlaubt, und eine Karte mit 400 goldenen Ringen sagt
     nichts. */
  function markLayer(svg, isl) {
    const g = el('g', { class: 'wi-marks' }, svg);
    const knoten = new Map();
    let last = '';
    return function paint(own, mein, an) {
      /* Ein Schlüssel aus allem, was die Marken bestimmt. Ohne ihn
         würden bei jedem Takt 400 Nachbarschaften durchgerechnet,
         obwohl sich meist nichts geändert hat. */
      const key = !an ? '' : mein + '|' + own;
      if (key === last) return;
      last = key;

      const zeigen = new Set();
      if (an && own && mein != null && mein >= 0) {
        const ich = String(mein);
        for (const z of isl.cells) {
          if (own[z.i] !== ich) continue;
          for (const [nr, nc] of neighbors(z.r, z.c)) {
            const n = isl.at(nr, nc);
            if (!n || n.home || own[n.i] === ich) continue;
            zeigen.add(n);
          }
        }
      }

      for (const [i, k] of knoten) {
        if (!zeigen.has(isl.cells[i])) { g.removeChild(k); knoten.delete(i); }
      }
      for (const z of zeigen) {
        /* Die Marke sitzt auf der DECKFLÄCHE und damit auf der Höhe,
           auf der die Kachel gerade steht: Nebel liegt flach (.10),
           erobertes Land steht auf. Dieselben zwei Zahlen wie im
           Relief — stünde hier eine dritte, läge der Ring in der
           Luft. Auf der flachen Karte gibt es keine Höhe und also
           auch keinen Versatz. */
        const h = FLACH ? .1 : (own[z.i] !== '.' ? z.hoch : .10);
        const d = feldPfad(z.x, z.y - h + .1, .88);
        let k = knoten.get(z.i);
        if (!k) {
          k = el('path', { class: 'wi-mark', d }, g);
          knoten.set(z.i, k);
        } else {
          k.setAttribute('d', d);
        }
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
      el('ellipse', { cx: 0, cy: .12, rx: .34, ry: .12, fill: 'rgba(0,0,0,.34)', filter: FB('b1') }, gg);
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
      el('ellipse', { cx: 0, cy: 1.02, rx: 1.05, ry: .24, fill: KARTE.sea.foam, opacity: .18, filter: FB('b2') }, bob);
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
    /* `mini` ist die flache Karte des Tablets. Sie steht als
       Schalter neben `solo` und nicht als eigene Datei: Ausschnitt,
       Insel-Daten, Küste, Orte, Fahnen, Schiffe und Marken sind in
       allen drei Fassungen dieselben — verschieden sind nur Meer und
       Land. Zwei Dateien wären nach der ersten Verbesserung zwei
       Karten. */
    const mini = !!(mopt && mopt.mini);
    FLACH = mini;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    cellEls = []; ships = {}; ownPainted = null; mapPaint = null; markPaint = null;
    svg.classList.toggle('wi-map--flach', mini);

    /* In der Lobby gibt es noch keine Insel (wi_tiles ist leer, bis
       wi_room_start würfelt). Ohne diesen Ausgang stünde im viewBox
       „Infinity -Infinity NaN NaN" — und das SVG wäre danach kaputt,
       nicht bloß leer. */
    if (!list.length) { svg.setAttribute('viewBox', '0 0 1 1'); return; }

    FID = 'wi' + (++mapSeq) + '_';
    buildDefs(svg, mini);

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
       und der passiert einmal, während der Countdown läuft.

       ⚠️ Auf der eigenen Insel liegt die Grenze höher (15.09.2026).
       Nicht aus Großzügigkeit: dort steht die Karte still, sie wird
       einmal gebaut und danach nur noch geschoben — es gibt gar
       kein Aufstehen einer Kachel, das je Takt Pfade verschöbe.
       Vor allem aber wächst sie mit dem Wortschatz, und mit der
       alten 700 hätte dasselbe Kind bei 300 Wörtern Bäumchen gehabt
       und bei 700 keine mehr. Eine Insel, die beim Dazulernen ihre
       Ausstattung verliert, ist genauso wenig die eigene wie eine,
       die sich umformt. 1100 liegt über allem, was hier entstehen
       kann (Hauptinsel 460 + drei Satelliten à 170 = 970). */
    const opt = {
      box: { x: n2(vb[0] - 2), y: n2(vb[1] - 2), w: n2(vb[2] + 4), h: n2(vb[3] + 4) },
      dicht: isl.cells.length > (solo ? 1100 : 700)
    };

    /* Die Küstenringe EINMAL. Das Wasser stapelt vier Tiefenstufen
       darauf und die Brandung setzt ihre Wellen darauf ab — jedes
       Mal neu aus den Kacheln zu suchen wäre fünfmal dieselbe
       Arbeit. */
    const rings = coastRings(isl, 1.0);
    const dCoast = ringsPath(rings, 0, false, 0);

    /* Auf dem Tablet ist die Küste GLATT gezogen (durch die
       Kantenmitten): ohne Brandung davor liest sich der harte
       Wabenrand als Fehler, mit weichem Zug als Strand. */
    const land = mini
      ? (flachSee(svg, vb, ringsPath(rings, 0, true, 0)), flachLand(svg, isl))
      : (seaLayer(svg, isl, vb, dCoast, rings, opt), reliefLand(svg, isl, opt));

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
       sonst liegt er IM Feld statt darüber. Auf dem Tablet gibt es
       ihn nicht: dort IST das verhüllte Feld seine eigene Farbe
       (Sönke, 16.09.2026: „kein Nebel, nur anders farbende Waben").
       Was er verbirgt, verbirgt die flache Karte genauso — eine
       gedeckte Wabe sagt „hier war noch niemand" und nichts sonst. */
    const fog = mini ? null : fogLayer(svg, isl, opt, .22);
    const flag = flagLayer(svg, isl);
    const place = placeLayer(svg, isl);
    const guard = guardLayer(svg, isl);
    const ship = shipLayer(svg, isl);
    /* Ganz oben, also NACH den Schiffen: die Marken der freien Wahl
       müssen auch über dem Nebel liegen (siehe markLayer). */
    const mark = markLayer(svg, isl);

    mapPaint = (own, ruins, hearts) => {
      land(own); if (fog) fog(own);
      place(own, ruins, hearts); guard(own, ruins, hearts);
      flag(own); ship(own);
      /* Die Marken hängen nicht nur am Besitz, sondern auch an
         `picks` — deshalb laufen sie über einen eigenen Aufruf
         (markieren) und werden hier nur mitgezogen, wenn sich die
         Karte bewegt hat. */
      mark(own, meinSlot(), picking && !shadowPick);
    };
    markPaint = mark;
    return isl;
  }

  /* Nur was sich geändert hat — jede Schicht vergleicht selbst
     gegen `ownPainted`, deshalb wird das hier ZULETZT gesetzt.

     `own` trägt SLOTS, alles Gemalte trägt VÖLKER: welches Volk auf
     Slot 1 sitzt, entscheidet die Lehrkraft. Ohne die Übersetzung
     (facOf) hätte ein Raum mit den Völkern 4 und 5 zwei rot-blaue
     Gebiete und daneben eine lila Kopfzeile. */
  /* Der eigene Slot — und `null`, wo es keinen gibt (Beamer, Lobby).
     Die Marken der freien Wahl brauchen ihn, und sie hängen an
     derselben Zahl wie die Aufgabe. */
  const meinSlot = () => (view && view.me && view.me.team != null) ? view.me.team : null;

  /* Nur die Marken neu, ohne die Karte anzufassen. Gerufen von
     renderTask (picks haben sich geändert) und nach jedem Malen. */
  function markieren() {
    if (!markPaint || !ownPainted) return;
    markPaint(ownPainted, meinSlot(), picking && !shadowPick);
  }

  function paintOwn(own, ruins, hearts) {
    if (!own || !mapPaint || own.length !== cells.length) return;
    /* Der Rückfallweg ohne Migration 0146 steht genau hier: ein
       Server, der `ruins`/`hearts` nicht kennt, bekommt lauter Punkte
       und lauter Nullen — die Karte zeichnet dann die Lichtpunkte von
       früher und keine Herzen. Alt, nicht kaputt. */
    const R = (typeof ruins === 'string' && ruins.length === own.length)
      ? ruins : '.'.repeat(own.length);
    const H = (typeof hearts === 'string' && hearts.length === own.length)
      ? hearts : '0'.repeat(own.length);
    mapPaint(own, R, H);
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
    const zurueck = () => { scale = 1; tx = ty = 0; pts.clear(); base = null; apply(); };
    wrap.addEventListener('dblclick', zurueck);
    /* Herausgegeben, weil die Karte am Tablet seit dem 14.09.2026
       zwischen zwei Hüllen wandert (der eingebetteten und dem
       Wahl-Kasten). Jede Hülle führt ihren eigenen Stand; beim
       Umhängen muss der abgebende auf null, sonst schreibt der
       andere sein „scale 1" über eine Karte, die dreifach gezoomt
       dasteht. */
    return { reset: zurueck };
  }

  /* ══════════════════════════════════════════════════════════
     Gemeinsame Bausteine
     ══════════════════════════════════════════════════════════ */
  /* Die Karte eines Teams: Schiff, Name, Punktestand, darunter die
     Aufschlüsselung. Sie steht am Beamer in den beiden Spalten links
     und rechts der Insel, WÄHREND die Runde läuft.

     Am Rundenende steht sie nicht mehr: dort sind es seit dem
     18.09.2026 Podest-Karten (podCard), die dieselben Zahlen tragen
     und zusätzlich den Platz. Die Reihe darunter (`teamRow`) ist
     damit weggefallen.

     Das Bild ist das SCHIFF (Sönke, 14.09.2026: „bei den Teams die
     Schiffe"). Es passt auch der Sache nach: was hier steht, ist
     nicht das Volk, sondern was die GRUPPE erobert hat. */
  function teamCard(t, v) {
    const T = teamOf(t.i);
    return `<div class="wi-team${v.winner_team === t.i ? ' is-win' : ''}"
                 style="--wi-team:${T.color}">
              <div class="wi-teampic"><img src="${esc(slotShip(t.i))}" alt=""></div>
              <b class="wi-teamname">${esc(T.name)}</b>
              <span class="wi-score">${t.score}</span>
              <span class="wi-sub">${t.tiles} Felder · ${t.ruins} aus Ruinen · ${t.people} Kinder</span>
            </div>`;
  }

  /* Eine Spalte je Volk: Schiff, Name mit Kopfzahl, darunter die
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
              <div class="wi-lteampic"><img src="${esc(slotShip(slot))}" alt=""></div>
              <div class="wi-lteamname">
                <span>${esc(T.name)}</span>
                <span class="wi-lteamn">${o.count != null ? o.count : (members || []).length}</span>
              </div>
              <ul class="wi-lteamlist">${list}</ul>
            </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     DAS SIEGERBILD  ·  für BEIDE Rollen dieselben Bausteine
     ══════════════════════════════════════════════════════════
     Sönke, 18.09.2026: „wir brauchen sowohl am Tablet als auch am
     Beamer ein richtig guten Siegerscreen (analog zu Mathoria)."

     Vorher stand am Pult eine Zeile (Bild, Name, Punkte) und am
     TABLET gar nichts: dort fiel die beendete Runde in die
     Wartetafel zurück („Runde vorbei — warten auf die nächste …").
     Das Kind erfuhr nicht einmal, wer gewonnen hatte.

     Jetzt wie in Kingdoms (endRows/podCardHTML/endRowHTML): der
     Beamer zeigt alle Völker — die ersten drei auf dem Podest, den
     Rest als schmale Zeilen —, das Tablet nur zwei davon, den Sieger
     und das eigene Volk. Die Karte, der Platz und die Zahlen sind in
     beiden Fällen dasselbe Stück HTML: was an der Wand steht, soll
     das Kind auf seinem Gerät wiedererkennen.

     ⚠️ Der SIEGER wird hier NICHT ausgerechnet. Welches Volk
     gewonnen hat, sagt der Server (`winner_team`, bei Gleichstand
     per Los in wi_maybe_advance). Eine zweite Rechnung im Gerät
     könnte der eigenen Überschrift widersprechen — sortiert wird
     deshalb um den gesetzten Sieger HERUM.                        */

  /* Mehrzahl, weil „ihr" eine Gruppe ist: „Ihr seid Dritte." */
  const ORDINAL = ['', 'Erste', 'Zweite', 'Dritte', 'Vierte',
                   'Fünfte', 'Sechste', 'Siebte', 'Achte'];
  const MEDAILLE = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const feldWort = n => (n === 1 ? 'Feld' : 'Felder');

  /* Die Rangliste am Rundenende. Sie sortiert nach PUNKTEN (Felder +
     Ruinenwert) — das ist die Zahl, die das Spiel entscheidet und die
     während der Runde schon in jeder Team-Karte steht. Stichentscheid
     sind die richtig beantworteten Wörter (`correct`, Migration
     0158): zwei Völker mit gleich vielen Feldern haben nicht gleich
     viel dafür getan.

     Geteilte Plätze ab Rang 2 (4·4·6 statt 4·5·6). Das trifft vor
     allem Völker, die bei null Punkten stehen — eine erfundene
     Reihenfolge unter ihnen wäre nichts als die Slot-Nummer, groß an
     die Wand geworfen. Platz 1 teilt niemand: es gibt genau einen
     Sieger, und den hat der Server bestimmt. */
  function endRows(v) {
    const sieger = v.winner_team;
    const rows = (v.teams || []).map(t => ({
      slot:    t.i,
      score:   t.score   | 0,
      tiles:   t.tiles   | 0,
      ruins:   t.ruins   | 0,
      // `correct` gibt es erst seit 0158. Ohne die Migration steht
      // hier null — und dann fällt die Angabe ganz weg, statt ein
      // falsches „0 richtig" zu behaupten.
      correct: (t.correct == null ? null : t.correct | 0)
    }));
    rows.sort((a, b) => {
      if (a.slot === sieger) return -1;
      if (b.slot === sieger) return 1;
      return (b.score - a.score)
          || ((b.correct || 0) - (a.correct || 0))
          || (a.slot - b.slot);
    });
    rows.forEach((r, i) => {
      const vor = rows[i - 1];
      r.platz = (i > 1 && vor.score === r.score && vor.correct === r.correct)
        ? vor.platz : i + 1;
    });
    return rows;
  }

  /* Eine Podest-Karte: Schiff, Name, darunter Medaille, Punkte und
     die Aufschlüsselung. `cls` bestimmt allein Größe und Platz in der
     Reihe (tool.css) — der Inhalt ist überall derselbe.

     Das Bild ist das SCHIFF und nicht die Crew: hier steht nicht das
     Volk, sondern was die GRUPPE erobert hat (14.09.2026, dieselbe
     Entscheidung wie in teamCard). */
  function podCard(r, cls) {
    const T = teamOf(r.slot);
    return `<div class="wi-pod ${cls}" style="--wi-team:${T.color}">
              <div class="wi-podmedal">${MEDAILLE[r.platz] || r.platz}</div>
              <div class="wi-podpic"><img src="${esc(slotShip(r.slot))}" alt=""></div>
              <div class="wi-podname">${esc(T.name)}</div>
              <div class="wi-podfoot">
                <span class="wi-podplace">Platz ${r.platz}</span>
                <span class="wi-podscore"><b>${r.score}</b> Punkte</span>
                <span class="wi-podsub">${r.tiles} ${feldWort(r.tiles)}${
                  r.ruins ? ` · ${r.ruins} aus Ruinen` : ''}${
                  r.correct == null ? '' : ` · ${r.correct} richtig`}</span>
              </div>
            </div>`;
  }

  /* Ab Platz 4: eine schmale Zeile statt einer Karte. Dieselben
     Angaben, nur nebeneinander gelegt. */
  function endRow(r) {
    const T = teamOf(r.slot);
    return `<div class="wi-erow" style="--wi-team:${T.color}">
              <span class="wi-eplace">${r.platz}.</span>
              <span class="wi-ethumb"><img src="${esc(slotShip(r.slot))}" alt=""></span>
              <span class="wi-ename">${esc(T.name)}</span>
              <span class="wi-enums">
                <span class="wi-escore"><b>${r.score}</b> Punkte</span>
                <span class="wi-esub">${r.tiles} ${feldWort(r.tiles)}${
                  r.correct == null ? '' : ` · ${r.correct} richtig`}</span>
              </span>
            </div>`;
  }

  function endTitel(slot) {
    const T = teamOf(slot);
    return `<span class="wi-endname">${esc(T.name)}</span> ` +
           `<span class="wi-endverb">${T.viele ? 'gewinnen' : 'gewinnt'}!</span>`;
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
      /* Seit dem 14.09.2026 hat auch das Tablet seine Uhr im Kopf —
         darum die Prüfung auf `hidden`: beim Üben läuft keine Runde,
         und eine Restzeit ohne Runde ist eine falsche Auskunft. */
      if (els.clock && !els.clock.hidden) els.clock.textContent = fmtLeft(view.ends_at);
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
          <!-- Dieselben zwei Kacheln wie am Tablet: was am Beamer
               steht, kann die Lehrkraft vorlesen. -->
          <div class="wi-rulwrap" data-part="rulwrap"></div>
        </div>
      </section>

      <!-- ── Das Spielbild am Beamer ──────────────────────────────
           Sönke, 14.09.2026: „Die Karte auf dem Beamer ganz zu sehen
           sein. Mache das Layout so wie bei Kingdoms of Mathoria …
           links und rechts die Teams, in der Mitte die Karte."

           Vorher war es eine Spalte: eine Völkerleiste ÜBER der
           Karte, die bei vier Völkern umbrach und der Insel damit
           zwei Zeilen Höhe wegnahm — auf einem 16:9-Beamer geht die
           Höhe der Karte aber genau einmal, und dann ist sie weg.
           Zwei Spalten kosten BREITE, und die ist übrig: die Insel
           ist rund.

           Die Reihenfolge hier IST die Anordnung: links · Arena ·
           rechts. Die Völker verteilen sich abwechselnd (0,2,4 …
           links, 1,3,5 … rechts), genau wie fillRosters in Kingdoms
           — so stehen bei zwei Völkern zwei Spalten da und nicht
           eine Spalte mit zwei Karten. -->
      <section class="wi-play" data-part="play" hidden>
        <!-- ⚠️ „wi-beam" und nicht „wi-stage": das ist schon die
             Bühne der eigenen Insel (SOLO_HTML), und eine tool.css
             bedient alle drei Rollen. Eine Höhe, die hier gesetzt
             wird, hätte dort die Leinwand verschoben.
             (Keine Backticks in Kommentaren dieser Zeichenkette —
             sie beenden das Template-Literal.) -->
        <div class="wi-beam" data-part="beam">
          <div class="wi-rost wi-rost--left" data-part="rost-left"></div>
          <div class="wi-arena">
            <header class="wi-bar">
              <span class="wi-arenatitle">⛵ Myth of Wordisland</span>
              <div class="wi-clock"><b data-part="clock">–</b>
                <button class="wi-btn wi-btn--ghost" data-part="stop">Runde beenden</button></div>
            </header>
            <div class="wi-mapwrap" data-part="mapwrap"><svg class="wi-map" data-part="map"></svg></div>
          </div>
          <div class="wi-rost wi-rost--right" data-part="rost-right"></div>
        </div>
        <div class="wi-big" data-part="big" hidden></div>
      </section>

      <!-- Das Siegerbild (18.09.2026). Die Podest-Karten stehen in
           der DOM in der Reihenfolge 1·2·3 und werden erst von
           tool.css auf 2·1·3 umgestellt — wer die Seite vorlesen
           lässt, hört den Sieger zuerst und nicht den Zweiten.
           Dieselbe Entscheidung wie bei .cm-podium in Kingdoms. -->
      <section class="wi-end" data-part="end" hidden>
        <h2 class="wi-endtitle" data-part="winner"></h2>
        <div class="wi-podium" data-part="podium"></div>
        <div class="wi-erows" data-part="end-rest" hidden></div>
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
        <div class="wi-ovbox" data-part="setsbox">
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

        <!-- Die Wörter EINER Station (0154). Sie ersetzt die Auswahl
             IM selben Fenster und liegt nicht darüber: zwei gestapelte
             Overlays wären zwei verdunkelte Hintergründe und zwei Wege
             zurück. Der Kasten ist breiter als die Auswahl — zwei
             Sprachspalten nebeneinander sind der ganze Zweck.

             Kopf, Zeile mit der Anzahl und Tabelle sind drei Stücke:
             nur die Tabelle scrollt, damit die Spaltenköpfe bei
             vierzig Wörtern stehen bleiben. -->
        <div class="wi-ovbox wi-ovbox--words" data-part="wordsbox" hidden>
          <div class="wi-ovhead">
            <button type="button" class="wi-vback" data-part="wordsback">‹ Zurück</button>
            <span class="wi-ovtitle" data-part="wordstitle">Wörter</span>
            <button type="button" class="wi-ovclose" data-part="wordsclose" aria-label="Fenster schließen">✕</button>
          </div>
          <p class="wi-ovhint" data-part="wordshint"></p>
          <div class="wi-ovbody" data-part="wordsbody"></div>
        </div>
      </div>
    </div>`;

  function q(part) { return root.querySelector(`[data-part="${part}"]`); }

  function buildPult() {
    root.innerHTML = PULT_HTML;
    els = {
      lobby: q('lobby'), play: q('play'), end: q('end'),
      sets: q('sets'), imp: q('import'),
      setsOv: q('setsov'), setSum: q('setsum'), setsBox: q('setsbox'),
      wordsBox: q('wordsbox'), wordsTitle: q('wordstitle'),
      wordsHint: q('wordshint'), wordsBody: q('wordsbody'),
      modeSeg: q('modeseg'), dirSeg: q('dirseg'),
      durRow: q('durrow'), durText: q('durtext'),
      pick: q('pick'), lobbyTeams: q('lobbyteams'), waiting: q('waiting'),
      start: q('start'),
      beam: q('beam'), rostLeft: q('rost-left'), rostRight: q('rost-right'),
      clock: q('clock'), big: q('big'),
      map: q('map'), mapwrap: q('mapwrap'),
      winner: q('winner'), podium: q('podium'), endRest: q('end-rest'), hard: q('hard'),
      rulWrap: q('rulwrap')
    };
    els.rulWrap.innerHTML = rulesHTML();
    bindRules(root);

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
    q('wordsback').addEventListener('click', () => wortZu());
    q('wordsclose').addEventListener('click', () => closeSets());
    // Klick neben den Kasten schließt. Der Kasten selbst nicht, sonst
    // ginge das Fenster bei jeder gewählten Liste zu. Steht die
    // Wörterliste offen, führt derselbe Klick eine Stufe zurück und
    // nicht ganz hinaus — sonst ist die mühsam aufgeklappte Unit weg.
    els.setsOv.addEventListener('click', ev => {
      if (ev.target !== els.setsOv) return;
      if (woerter) wortZu(); else closeSets();
    });

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
  function closeSets() { setsOpen = false; els.setsOv.hidden = true; wortZu(); }

  async function loadSets() {
    const r = await ctx.actions.call('wi_sets_list', {});
    if (!r || !r.ok) return;
    // Die Wortlisten gehören zu diesem Stand. Nach einem Import oder
    // einer gelöschten Liste wäre der Speicher eine Behauptung über
    // etwas, das es so nicht mehr gibt.
    wortCache.clear();
    sets.list = r.sets || [];
    sets.chosen = (r.chosen || []).map(String);

    /* Wie viele Stationen stünden aufgeklappt da? Bei einem ganzen
       Lehrwerk sind das leicht vierzig, und dann sucht die Lehrkraft
       ihre Unit im Gescrolle. Gezählt wird in Zeilen und nicht in
       Units: drei Units mit je einer Station sind drei Zeilen, drei
       Units eines Buchs sind zwölf. Dieselbe Zahl wie in der
       Unit-Leiste der Insel. */
    sets.zu = new Set();
    for (const t of ['0', '1']) {
      const baum = gruppiereNachUnit(sets.list.filter(s => s.mine === t));
      if (baum.reduce((n, g) => n + g.sets.length, 0) > SETS_AUF_MAX) {
        for (const g of baum) if (!g.stueck) sets.zu.add(g.id);
      }
    }

    renderSets();
    renderSetSum();
  }

  /* Eine Station als Kachel — die Form, die das Fenster seit 0131
     hat. Neu ist, wo sie steht (seit 0150: unter ihrer Unit) und das
     Listen-Zeichen rechts oben (0154): ein Blick in die Wörter, ohne
     die Station dafür wählen zu müssen.

     Es ist ein <i> und kein zweiter Knopf, weil die Kachel selbst
     schon ein <button> ist — verschachtelte Knöpfe sind ungültig.
     Genau die Bauart, die das Löschzeichen seit 0131 hat; der
     Klickweg unten fängt beide ab, bevor er die Auswahl umschaltet. */
  function setKachel(s, mine) {
    return `
      <button class="wi-set${mine ? ' wi-set--mine' : ''}${
                sets.chosen.includes(String(s.id)) ? ' is-on' : ''}"
              data-id="${esc(s.id)}">
        <b>${esc(s.title)}</b>
        <span>${s.count} Wörter${s.level ? ' · Klasse ' + esc(s.level) : ''}</span>
        <i class="wi-peek" data-peek="${esc(s.id)}" title="Wörter dieser Station ansehen">☰</i>
        ${mine ? `<i class="wi-del" data-del="${esc(s.id)}" title="Liste löschen">×</i>` : ''}
      </button>`;
  }

  /* Das Wörter-Fenster gliedert seit 0150 nach Jahrgang → Unit →
     Station. Sönke: „unit anklicken und auswählen und in der unit
     die unterkathegorien wählen … sowohl im solo mode als auch im
     multiplayer (lehrkraft)."

     Gebaut ist es wie die Leiste der Insel, nur in der Optik des
     Pults: Kopfzeile mit Sammelschalter und Aufklapp-Pfeil, darunter
     die Stations-Kacheln. Eine Unit am Stück bleibt eine einzelne
     Kachel — wie vor 0150.

     ⚠️ Nach außen ändert sich NICHTS: `saveSetup({p_sets})` bekommt
     weiterhin eine flache Liste von Satz-Nummern. Der Server kennt
     keine Units (wi_room_sets ist set-basiert), und das soll so
     bleiben. */
  function renderSets() {
    const mine = tab === 'own';
    const list = sets.list.filter(s => (s.mine === '1') === mine);
    if (!list.length) {
      els.sets.innerHTML = `<p class="wi-empty">${mine
        ? 'Noch keine eigene Liste. Füge unten eine ein — eine Zeile je Wortpaar.'
        : 'Keine mitgelieferten Units gefunden.'}</p>`;
      return;
    }

    const baum = gruppiereNachUnit(list);
    const mehrere = baum.some(g => g.grade !== baum[0].grade);
    let html = '';
    let jahrgang = false;

    /* Aufeinanderfolgende Units am Stück kommen in EINE Reihe und
       stehen darin nebeneinander — so wie das ganze Fenster vor
       0150 aussah. Untereinander wären fünf eigene Listen fünf
       Zeilen Gescrolle für fünf kurze Titel. */
    let reihe = [];
    const reiheAbschliessen = () => {
      if (!reihe.length) return;
      html += `<div class="wi-srow">${reihe.join('')}</div>`;
      reihe = [];
    };

    for (const g of baum) {
      if (mehrere && g.grade !== jahrgang) {
        reiheAbschliessen();
        jahrgang = g.grade;
        html += `<div class="wi-sgrp">${jahrgangText(g.grade)}</div>`;
      }

      if (g.stueck) { reihe.push(setKachel(g.sets[0], mine)); continue; }
      reiheAbschliessen();

      const an     = g.sets.filter(s => sets.chosen.includes(String(s.id))).length;
      const zu     = sets.zu.has(g.id);
      const woerter = g.sets.reduce((n, s) => n + (parseInt(s.count, 10) || 0), 0);
      html += `<div class="wi-sunit${zu ? '' : ' is-auf'}">
          <div class="wi-suhead${an === g.sets.length ? ' is-on' : ''}${
            an && an < g.sets.length ? ' is-halb' : ''}">
            <button type="button" class="wi-uchevb${zu ? '' : ' is-auf'}"
                    data-sauf="${esc(g.id)}" aria-expanded="${!zu}"
                    aria-label="Stationen ${zu ? 'ausklappen' : 'einklappen'}"
                    ><i class="wi-schev" aria-hidden="true"></i></button>
            <button type="button" class="wi-suall" data-sall="${esc(g.id)}"
                    aria-pressed="${an === g.sets.length}">
              <b>${esc(g.title)}</b>
              <span>${g.sets.length} Stationen · ${woerter} Wörter${
                an ? ` · <i>${an} gewählt</i>` : ''}</span>
            </button>
          </div>
          <div class="wi-sstats"${zu ? ' hidden' : ''}>${
            g.sets.map(s => setKachel(s, mine)).join('')}</div>
        </div>`;
    }
    reiheAbschliessen();
    els.sets.innerHTML = html;
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
    /* Das Listen-Zeichen zuerst: es liegt IN der Kachel, und ohne
       diesen Ausgang würde ein Blick in die Wörter die Station
       nebenbei an- oder abwählen. */
    const peek = e.target.closest('[data-peek]');
    if (peek) {
      e.preventDefault();
      wortAuf(peek.dataset.peek);
      return;
    }

    const del = e.target.closest('[data-del]');
    if (del) {
      e.preventDefault();
      if (!await ctx.confirm('Diese Liste endgültig löschen?')) return;
      const r = await ctx.actions.call('wi_set_delete', { p_id: del.dataset.del });
      if (!r.ok) return ctx.toast(ctx.errText(r.error));
      await loadSets();
      return;
    }

    /* Auf- und Zuklappen ändert an der Auswahl nichts und geht
       deshalb auch nicht an den Server. Es steht VOR dem
       Sammelschalter: der Pfeil liegt in derselben Kopfzeile, und
       wer zuerst nach dem Schalter sucht, klappt nie. */
    const auf = e.target.closest('[data-sauf]');
    if (auf) {
      const id = auf.dataset.sauf;
      if (sets.zu.has(id)) sets.zu.delete(id); else sets.zu.add(id);
      renderSets();
      return;
    }

    /* Der Sammelschalter einer Unit: alle an → alle aus, sonst alle
       an. Auch eine halb gewählte Unit geht also zuerst GANZ an —
       „teilweise" muss man ohne drei Klicks verlassen können. */
    const all = e.target.closest('[data-sall]');
    if (all) {
      const g = gruppiereNachUnit(sets.list).find(x => x.id === all.dataset.sall);
      if (!g) return;
      const ids = g.sets.map(s => String(s.id));
      const rest = sets.chosen.filter(x => !ids.includes(x));
      sets.chosen = ids.every(i => sets.chosen.includes(i)) ? rest : rest.concat(ids);
      if (!sets.chosen.length) {
        // Ein Raum ohne Wörter ist kein Raum.
        sets.chosen = ids;
        ctx.toast('Mindestens eine Liste muss gewählt sein.');
      }
      renderSets();
      renderSetSum();
      setsBusy++;
      await saveSetup({ p_sets: sets.chosen });
      setsBusy--;
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

  /* ══ Die Wörter einer Station (0154) ═══════════════════════════
     Sönkes Wunsch: „an jeder Station ein icon, was zu der
     vokabelliste führt … simple einfache tabelle, in der man die
     vokabeln gut lesen kann auch bei langen listen > als 30."

     Also eine Tabelle und keine Kärtchen: Nummer, Wort, Übersetzung,
     Zeile für Zeile. Die Spaltenköpfe bleiben beim Scrollen stehen
     (`position: sticky`), und weil nur der Tabellenteil scrollt,
     stehen Kopfzeile und Anzahl immer da. Die Nummer ist keine
     Zierde: sie beantwortet „wo bin ich" in einer Liste, die länger
     ist als der Bildschirm.

     Keine Zahlen zum Lernstand. Die Frage hier ist „welche Wörter
     stehen in Station 2", nicht „wer kann sie" — das steht am
     Rundenende (wi_hard_words) und dort ohne Namen. */
  const WORT_MIG = 'Diese Übersicht braucht die neueste Fassung der '
    + 'Datenbank (Migration 0154).';

  const SPRACHEN = {
    de: 'Deutsch', en: 'Englisch', fr: 'Französisch', es: 'Spanisch',
    la: 'Latein', it: 'Italienisch', tr: 'Türkisch', ru: 'Russisch'
  };
  // Unbekannte Kürzel groß hinschreiben statt zu raten: „NL" ist eine
  // ehrliche Spaltenüberschrift, „Deutsch" an falscher Stelle nicht.
  const sprachName = c =>
    SPRACHEN[String(c || '').toLowerCase()] || String(c || '').toUpperCase();

  function wortAuf(id) {
    woerter = { id, daten: wortCache.get(id) || null, fehler: null };
    els.setsBox.hidden = true;
    els.wordsBox.hidden = false;
    renderWords();
    if (!woerter.daten) ladeWoerter(id);
  }

  function wortZu() {
    woerter = null;
    if (!els.wordsBox) return;
    els.wordsBox.hidden = true;
    els.setsBox.hidden = false;
  }

  async function ladeWoerter(id) {
    const r = await ctx.actions.call('wi_set_words', { p_set: id });
    if (r && r.ok) wortCache.set(id, r);
    // Inzwischen zurückgeblättert oder eine andere Station geöffnet:
    // die Antwort ist dann nur noch für den Speicher gut.
    if (!woerter || woerter.id !== id) return;
    if (r && r.ok) { woerter.daten = r; woerter.fehler = null; }
    else { woerter.daten = null; woerter.fehler = (r && r.error) || 'network'; }
    renderWords();
  }

  /* Nebenformen klein hinter dem Wort. Sie wegzulassen wäre eine
     Behauptung: „pupil / student" steht im Import in EINER Zeile,
     und wer nur „pupil" liest, hält „student" für falsch. */
  function nebenform(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return ` <i class="wi-valt">${list.map(x => esc(x)).join(' · ')}</i>`;
  }

  function renderWords() {
    if (!woerter || !els.wordsBody) return;
    const kachel = sets.list.find(s => String(s.id) === String(woerter.id)) || {};
    const d = woerter.daten;
    const s = (d && d.set) || {};

    // Der Titel steht sofort, auch solange die Wörter unterwegs sind:
    // die Kachel, die eben angetippt wurde, kennt ihn schon.
    els.wordsTitle.textContent = s.title || kachel.title || 'Wörter';

    if (!d) {
      els.wordsHint.textContent = '';
      els.wordsBody.innerHTML = `<p class="wi-empty">${esc(woerter.fehler
        ? (woerter.fehler === 'fn_missing' ? WORT_MIG : ctx.errText(woerter.fehler))
        : 'Einen Moment …')}</p>`;
      return;
    }

    const ws = d.words || [];
    const teile = [`${ws.length} ${ws.length === 1 ? 'Wort' : 'Wörter'}`];
    if (s.utitle && s.utitle !== s.title) teile.push(esc(s.utitle));
    if (s.grade) teile.push(`Jahrgang ${esc(s.grade)}`);
    else if (kachel.level) teile.push(`Klasse ${esc(kachel.level)}`);
    els.wordsHint.innerHTML = teile.join(' · ');

    if (!ws.length) {
      els.wordsBody.innerHTML =
        '<p class="wi-empty">In dieser Station steht noch kein Wort.</p>';
      return;
    }

    const von  = sprachName(s.from || kachel.from || 'de');
    const nach = sprachName(s.to   || kachel.to   || 'en');
    els.wordsBody.innerHTML = `
      <div class="wi-vtab">
        <div class="wi-vrow wi-vhead">
          <span class="wi-vnum">#</span>
          <span>${esc(von)}</span>
          <span>${esc(nach)}</span>
        </div>
        ${ws.map((w, i) => `
          <div class="wi-vrow">
            <span class="wi-vnum">${i + 1}</span>
            <b>${esc(w.t)}${nebenform(w.at)}</b>
            <span>${esc(w.x)}${nebenform(w.a)}</span>
          </div>`).join('')}
      </div>`;
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
        `<img src="${esc(volkMini(f))}" alt=""></button>`;
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
    // Stillgelegte zählen nicht mit (0152) — der Server baut die
    // Insel für dieselbe Menge, und zwei Zahlen, die dasselbe meinen
    // und auseinanderlaufen, sind schlimmer als eine ungenaue.
    const kids = mitspieler(v).length;
    const tiles = Math.round(Math.max(80, Math.min(900, Math.max(kids, 4) * 1.6 * min)));
    return `${min} Minuten` + (kids
      ? ` — bei ${kids} ${kids === 1 ? 'Kind' : 'Kindern'} eine Insel aus etwa ${tiles} Feldern.`
      : ' — die Größe der Insel folgt aus Dauer und Zahl der Kinder.') +
      ' Der Nebel ist nach knapp der halben Zeit weg; danach nimmt man sich Land.';
  }

  /* Wer in dieser Runde überhaupt vorkommt. Ein stillgelegtes Tablet
     (skill_participants.blocked, 0081) bekommt seit Migration 0152
     kein Volk mehr und zählt für nichts — es steht am Pult aber
     weiter da, nur in einer eigenen Zeile. Ohne den Filter hier
     stünde ein gesperrter Name in einer Volksspalte, die er nie
     betritt.

     `p.blocked` fehlt, wenn 0152 nicht eingespielt ist: dann ist der
     Wert undefined, der Filter lässt alle durch, und es bleibt beim
     alten Verhalten. */
  function mitspieler(v) {
    return (v.people || []).filter(p => !p.blocked);
  }

  /* Eine Spalte je Volk, nebeneinander. Ein Volk ohne Anwesende
     bleibt stehen: es SPIELT mit, es ist nur noch niemand da. */
  function renderLobbyTeams(v) {
    const people = mitspieler(v);
    let out = '';
    for (let slot = 0; slot < v.team_count; slot++) {
      const mine = people.filter(p => p.team === slot);
      out += teamColHTML(slot, mine.map(p => ({ name: p.name, online: p.online !== false })));
    }
    els.lobbyTeams.innerHTML = out;
  }

  /* Wer noch kein Volk hat, wer gerade nicht am Tablet ist — und wer
     stillgelegt wurde. Drei Sätze, eine Zeile. Die ersten beiden
     sagen ausdrücklich, dass niemand dadurch außen vor bleibt:
     wi_room_start verteilt alle Teilnehmer des Raums, anders als in
     Kingdoms. Der dritte sagt genauso ausdrücklich das Gegenteil —
     das ist ja der Zweck des Knopfes.

     Stillgelegte werden nicht einfach ausgeblendet: die Lehrkraft hat
     sie gerade selbst gesperrt, und eine Liste, aus der jemand
     spurlos verschwindet, sieht aus wie ein Fehler.

     Die Zeile verschwindet ganz, wenn es nichts zu sagen gibt; eine
     leere Überschrift wäre nur Lärm. */
  function renderWaiting(v) {
    const spielen = mitspieler(v);
    const ohne  = spielen.filter(p => p.team == null);
    const off   = spielen.filter(p => p.team != null && p.online === false);
    const still = (v.people || []).filter(p => p.blocked);
    if (!ohne.length && !off.length && !still.length) {
      els.waiting.hidden = true;
      els.waiting.innerHTML = '';
      return;
    }
    const namen = list => list.map(p => `<span class="wi-waitname">${esc(p.name)}</span>`).join('');
    let out = '';
    if (ohne.length) {
      out += `<span class="wi-waitlabel">Noch ohne Volk (${ohne.length}) — beim Start werden sie mit verteilt:</span>`
           + namen(ohne);
    }
    if (off.length) {
      out += `<span class="wi-waitlabel">Gerade nicht am Tablet (${off.length}) — sie spielen trotzdem mit:</span>`
           + namen(off);
    }
    if (still.length) {
      out += `<span class="wi-waitlabel wi-waitlabel--off">Stillgelegt (${still.length}) — sie bekommen kein Volk:</span>`
           + still.map(p => `<span class="wi-waitname wi-waitname--off">🔇 ${esc(p.name)}</span>`).join('');
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
      // Ohne 0146 gibt es keine Ruinen — dann auch keine Erklärung.
      els.rulWrap.hidden = (v.ruins == null);
      return;
    }

    if (ended) {
      renderEndPult(v);
      loadHard();
      return;
    }

    fuelleRoster(v);
    els.clock.textContent = fmtLeft(v.ends_at);
    els.big.hidden = (v.phase !== 'countdown');
    /* Nach jedem Zeichnen messen: die Spalten werden gerade neu
       gefüllt, und ihre Breite entscheidet, wie breit die Karte sein
       darf. Ein `requestAnimationFrame` wäre hier falsch — die
       Auslage auf der Landing läuft in linkedom-Prüfständen ohne
       eines, und die Zahl muss auch dort stehen. */
    passeBeamAn();
  }

  /* Die Völker abwechselnd nach links und rechts — dasselbe wie
     fillRosters in Kingdoms. Zwei Spalten sind bei zwei Völkern eine
     Spiegelung und bei acht ein Rahmen; eine Liste nur links wäre
     beides nicht. */
  function fuelleRoster(v) {
    if (!els.rostLeft) return;
    let l = '', r = '';
    (v.teams || []).forEach((t, k) => { if (k % 2 === 0) l += teamCard(t, v); else r += teamCard(t, v); });
    els.rostLeft.innerHTML = l;
    els.rostRight.innerHTML = r;
    els.rostRight.hidden = !r;
  }

  /* ─── „Die Karte soll ganz zu sehen sein" ───────────────────
     Die Bühne bekommt eine Höhe in Bildpunkten. Das klingt nach
     einem Rückschritt hinter CSS, ist aber die einzige Rechnung, die
     stimmt: `flex: 1` braucht eine Kette von Eltern mit fester Höhe
     bis zum <body>, und die hat eine Werkzeugseite nicht — unter der
     Karte steht der Seitenfuß, darüber die Kopfzeile der Seite.
     Kingdoms rechnet aus demselben Grund seit 0094 selbst
     (fitPresenterMap); `spaceBelow` ist von dort übernommen.

     In der AUSLAGE gilt das nicht: dort steht das Werkzeug in einem
     Kasten mitten auf der Landingpage, und „bis zum Fensterrand"
     wäre der Rest der Seite — die Karte wüchse aus ihrem Schaufenster
     heraus. Deshalb dort eine feste Höhe. */
  const BEAM_MIN = 300, BEAM_LUFT = 14, VORSCHAU_HOCH = 430;

  function platzUnten(node) {
    let sum = 0;
    for (let n = node; n && n.parentElement && n !== document.body; n = n.parentElement) {
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

  function passeBeamAn() {
    if (role !== 'presenter' || !els.beam || !els.play || els.play.hidden) return;
    /* Ohne Messwerkzeug (linkedom im Prüfstand) gibt es nichts zu
       rechnen — und eine Höhe aus NaN wäre schlimmer als keine. */
    if (typeof getComputedStyle !== 'function' || !els.beam.getBoundingClientRect) return;
    const oben = els.beam.getBoundingClientRect().top;
    const h = (ctx && ctx.preview)
      ? VORSCHAU_HOCH
      : Math.max(BEAM_MIN, (window.innerHeight || 0) - oben - platzUnten(els.beam) - BEAM_LUFT);
    if (h > 0) els.beam.style.height = Math.round(h) + 'px';
  }

  /* Das Siegerbild am Beamer: alle Völker, die ersten drei auf dem
     Podest, der Rest als Zeilen darunter. Die ganze Tafel nimmt einen
     Hauch der Siegerfarbe an (--wi-win) — dezent, weil die Karten
     darauf schon farbig genug sind. */
  function renderEndPult(v) {
    const rows = endRows(v);
    if (!rows.length) {
      // Eine Runde ohne Völker gibt es nicht — außer der Server
      // antwortet gerade unvollständig. Dann lieber ein ehrlicher
      // Satz als ein leeres Podest.
      els.winner.textContent = 'Runde beendet.';
      els.podium.innerHTML = '';
      els.endRest.hidden = true;
      return;
    }
    const win = rows[0];
    els.end.style.setProperty('--wi-win', teamOf(win.slot).color);
    els.winner.innerHTML = endTitel(win.slot);

    const oben = rows.slice(0, 3);
    els.podium.innerHTML = oben.map((r, i) => podCard(r, 'wi-pod--' + (i + 1))).join('');
    // Zwei Völker sind kein Podest: ohne dritte Stufe stünde der
    // Sieger sonst rechts außen statt in der Mitte.
    els.podium.classList.toggle('wi-podium--duo', oben.length < 3);

    const rest = rows.slice(3);
    els.endRest.innerHTML = rest.map(endRow).join('');
    els.endRest.hidden = !rest.length;
  }

  /* Seit Migration 0153 zählt der Server die Strichliste DIESER Runde
     (wi_round_words) statt der Karteikasten-Summe des ganzen Raums.
     Der Unterschied ist nicht kosmetisch: ein Raum lebt 60 Tage, und
     vorher standen hier tagelang dieselben Wörter.

     `scope` sagt, worüber gezählt wurde. Fehlt der Schlüssel, ist die
     Migration nicht eingespielt — dann steht das als Satz darunter,
     statt dass die Überschrift still etwas Falsches behauptet
     (feedback_missing_migration_looks_like_network). */
  async function loadHard() {
    const r = await ctx.actions.call('wi_hard_words', {});
    if (!r || !r.ok) return;
    const alt = r.scope !== 'round'
      ? '<p class="wi-hint">Diese Liste zählt noch alle Runden dieses Raums zusammen — '
        + 'in der Datenbank fehlt die Migration 0153.</p>'
      : '';
    els.hard.innerHTML = (r.words.length
      ? r.words.map(w => `<div class="wi-hardrow">
            <b>${esc(w.term)}</b><span>${esc(w.trans)}</span>
            <i>${w.wrong}× daneben</i></div>`).join('')
      : '<p class="wi-empty">Nichts ist reihenweise schiefgegangen — schöner Tag.</p>') + alt;
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
        <!-- Die Sonderregeln. Leer im Rohbau und erst beim Bauen
             gefüllt: rulesHTML() steht weiter unten in dieser Datei,
             und ein Aufruf hier würde beim Laden ausgewertet. -->
        <div class="wi-rulwrap" data-part="rulwrap"></div>
        <p class="wi-hint" data-part="onlinehint" hidden></p>
        <button type="button" class="wi-btn wi-btn--ghost" data-part="practice">Bis dahin üben</button>
      </section>

      <!-- ── Das Siegerbild am Tablet (18.09.2026) ───────────────
           Bis dahin fiel die beendete Runde hier in die Wartetafel
           zurück: „Runde vorbei — warten auf die nächste …", und das
           war alles. Wer gewonnen hatte, stand nur am Beamer.

           Jetzt derselbe Aufbau wie dort, nur auf zwei Karten
           eingedampft: der Sieger und das EIGENE Volk. Die anderen
           fehlen mit Absicht — am Tablet zählt, wie die eigene
           Gruppe abgeschnitten hat, und die ganze Rangliste steht
           zwei Meter weiter an der Wand.

           Der Üben-Knopf steht auch hier: nach der Runde ist die
           Insel offen, und das ist genau der Moment, in dem ein Kind
           weitermachen darf. -->
      <section class="wi-pane wi-pane--end" data-part="tend" hidden>
        <h2 class="wi-endtitle" data-part="twinner"></h2>
        <div class="wi-podium wi-podium--tab" data-part="tpodium"></div>
        <p class="wi-endplace" data-part="tplace" hidden></p>
        <div class="wi-mytally" data-part="tmine" hidden></div>
        <p class="wi-hint">Gleich geht es weiter — die Lehrkraft macht die nächste Runde klar.</p>
        <button type="button" class="wi-btn wi-btn--ghost" data-part="epractice">Bis dahin üben</button>
      </section>

      <section class="wi-pane wi-pane--count" data-part="tcount" hidden>
        <div class="wi-countnum" data-part="big">5</div>
        <p class="wi-hint">Gleich geht’s los …</p>
      </section>

      <section class="wi-pane" data-part="tplay" hidden>
        <!-- ── Der eigene Kopf ────────────────────────────────────
             Er stand bis zum 14.09.2026 als eine Zeichenkette in
             renderTab und wurde bei jedem Takt neu gesetzt. Jetzt
             steht er im Rohbau und wird nur noch GEFÜLLT — denn das
             Serien-Abzeichen daneben ändert sich bei jeder Antwort
             und nicht alle vier Sekunden. Ein Knoten, der viermal
             die Minute neu entsteht, kann keinen eigenen Zustand
             tragen.

             Das Bild ist die Crew des eigenen Volkes auf Stufe 1
             (Sönke: „bei den Völkern die Level 1 Sprites der Crew").

             Das Abzeichen ist das Muster von Kingdoms (.cm-pstreak):
             Flamme, Zahl, Ziel. Sönke, 14.09.2026: „Die Streak-
             Anzeige muss klein nach rechts … der Text ist doof. Mache
             einfach eine Flamme und dann ein x von y." Der Satz, der
             bis dahin in der Leiste darunter stand, ist damit weg —
             er erklärte dreimal je Runde dasselbe. -->
        <header class="wi-me" data-part="me">
          <img class="wi-mepic" data-part="mepic" src="" alt="">
          <div class="wi-meinfo">
            <b data-part="mename"></b>
            <span data-part="mesub"></span>
          </div>
          <!-- Das Serien-Abzeichen stand hier bis zum 16.09.2026.
               Sönke: „Die Streak-Anzeige gehört ja zur Vokabel, also
               muss das eine Ebene weiter runter." Es sitzt jetzt in
               der Aufgabe, neben der Frage. Im Kopf steht dafür, was
               zum VOLK gehört: sein Name und sein Stand. -->
          <!-- Der Weg zurück zur Karte, wenn das Kind den Wahl-Kasten
               zugemacht hat. Er steht NUR dann da: ein Knopf, der
               meistens nichts zu öffnen hat, wäre eine Einladung ins
               Leere. -->
          <button type="button" class="wi-pickback" data-part="pickback" hidden>
            🎯 <span data-part="pickbackn"></span></button>
          <span class="wi-time" data-part="clock"></span>
        </header>

        <section class="wi-task" data-part="task">
          <!-- Frage und Serie in einer Zeile: beide gehören zu DIESER
               Vokabel. Die Serie zählt sofort richtige Antworten, und
               was sie zählt, steht direkt darüber. -->
          <div class="wi-taskhead">
            <p class="wi-ask" data-part="ask"></p>
            <span class="wi-streak" data-part="streak" hidden
                  title="Deine Serie richtiger Antworten">
              <span class="wi-streakico" aria-hidden="true">🔥</span
              ><b data-part="streakn">0</b
              ><i class="wi-streakgoal" data-part="streakgoal"></i>
            </span>
          </div>
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

        <div class="wi-mapwrap" data-part="mapwrap"><svg class="wi-map" data-part="map"></svg></div>
      </section>

      <!-- ── Der Wahl-Kasten ──────────────────────────────────────
           Sönke, 14.09.2026: „Sobald ich eine Streak habe, öffnet
           sich das Feld." Er geht von SELBST auf, sobald eine freie
           Wahl gutgeschrieben ist — und zwar als Kasten über allem
           und nicht als Karte unter der Aufgabe. Der Grund ist
           derselbe wie bei der Feier auf der Insel (10.09.2026):
           beim Tippen steht auf dem Tablet die Tastatur, und die
           eingebettete Karte liegt dann genau dort, wo niemand
           hinsieht.

           Die Karte darin ist DIESELBE — das SVG wandert beim
           Aufgehen aus „mapwrap" hierher und beim Zumachen zurück.
           Eine zweite Karte wäre eine zweite Wahrheit: cellEls,
           ships und mapPaint stehen einmal im Modul, zwei Inseln
           könnten sie sich nicht teilen. -->
      <div class="wi-ov wi-ov--pick" data-part="pickov" hidden>
        <div class="wi-ovbox wi-ovbox--pick">
          <!-- ⚠️ Drei Zeilen und keine vierte. Sönke, 15.09.2026:
               „Die Info, was ich auf dem Streak- oder Ruinen-Effekt-
               Bildschirm machen muss, ist nicht gut lesbar. Hier muss
               wenig Text sein und klare Worte. Und die Zahl groß."
               Darum: der Kopf sagt WOHER (und steht leer, wenn es die
               gewöhnliche Serie war — „Serie" sagt schon die Flamme
               im Kopf), die große Zeile sagt WAS, die kleine WIE.
               Die Ziffer ist ein eigener Knoten, weil sie die
               eigentliche Aussage ist. -->
          <div class="wi-ovhead">
            <span class="wi-ovtitle" data-part="picktitle"></span>
            <button type="button" class="wi-ovclose" data-part="pickclose"
                    aria-label="Karte schließen">✕</button>
          </div>
          <p class="wi-pickbig" data-part="pickbig"></p>
          <p class="wi-pickhint" data-part="pickhint"></p>
          <div class="wi-mapwrap wi-mapwrap--pick" data-part="pickwrap"></div>
        </div>
      </div>

      <!-- ── Die kurze Nachricht ────────────────────────────────
           Der Lichttempel verlangt nichts — er hat schon gewirkt.
           Sönke, 15.09.2026: „Beim Lichttempel kommt nur eine
           Nachricht kurz: du hast deine Felder beschützt oder so."
           Also kein Kasten, den jemand wegtippen muss, sondern eine
           Tafel, die von selbst wieder geht. Sie liegt über dem
           Wahl-Kasten (40) und unter Toast (60): eine Fehlermeldung
           darf sie nicht verdecken. -->
      <div class="wi-flash" data-part="flash" hidden aria-live="polite">
        <div class="wi-flashbox">
          <span class="wi-flashkick" data-part="flashkick"></span>
          <span class="wi-flashbig" data-part="flashbig"></span>
        </div>
      </div>
    </div>`;

  function buildTab() {
    root.innerHTML = TAB_HTML;
    els = {
      tlobby: q('tlobby'), tcount: q('tcount'), tplay: q('tplay'),
      tend: q('tend'), tWinner: q('twinner'), tPodium: q('tpodium'),
      tPlace: q('tplace'), tMine: q('tmine'),
      waitText: q('waittext'), myTeam: q('myteam'),
      othersBox: q('othersbox'), others: q('others'), onlineHint: q('onlinehint'),
      big: q('big'), back: q('back'),
      me: q('me'), mePic: q('mepic'), meName: q('mename'), meSub: q('mesub'),
      streak: q('streak'), streakN: q('streakn'), streakGoal: q('streakgoal'),
      pickBack: q('pickback'), pickBackN: q('pickbackn'), clock: q('clock'),
      ask: q('ask'), word: q('word'),
      form: q('typeform'), input: q('input'), opts: q('opts'), fb: q('fb'),
      map: q('map'), mapwrap: q('mapwrap'),
      pickOv: q('pickov'), pickWrap: q('pickwrap'),
      pickTitle: q('picktitle'), pickBig: q('pickbig'), pickHint: q('pickhint'),
      flash: q('flash'), flashKick: q('flashkick'), flashBig: q('flashbig'),
      rulWrap: q('rulwrap')
    };
    els.rulWrap.innerHTML = rulesHTML();
    bindRules(root);

    feldBauen(els.input, send);
    feldKnopf(q('typego'), els.input, send);
    els.opts.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) send(b.dataset.v);
    });
    // Zwei Knöpfe, ein Verhalten: vor der Runde (Wartetafel) und
    // nach ihr (Siegerbild) führt „üben" an dieselbe Stelle.
    [q('practice'), q('epractice')].forEach(b =>
      b.addEventListener('click', () => { practice = true; if (view) renderTab(view); }));
    els.back.addEventListener('click', () => { practice = false; if (view) renderTab(view); });
    els.map.addEventListener('click', onMapClick);
    /* Zwei Hüllen, ein SVG: die Geste gehört dem Kasten, in dem die
       Karte GERADE hängt. Beide Zuhörer schreiben `svg.style.
       transform`, deshalb setzt pickOffen/pickZu das Bild beim
       Umhängen auf null zurück — sonst rechnet der eine weiter auf
       dem Stand des anderen. */
    panInline = attachPanZoom(els.mapwrap, els.map);
    panPick   = attachPanZoom(els.pickWrap, els.map);
    q('pickclose').addEventListener('click', () => pickZu(true));
    els.pickBack.addEventListener('click', () => pickOeffnen());
  }

  /* ─── Der Wahl-Kasten geht auf und zu ───────────────────────
     Zwei Zustände und eine Regel dazwischen: aufgehen tut er von
     selbst (eine neue freie Wahl), zumachen darf ihn auch das Kind.
     `pickHand` merkt sich genau das — sonst stünde der Kasten beim
     nächsten Takt vier Sekunden später wieder da, und das sähe aus
     wie ein Fehler.

     Eine NEUE Wahl hebt die Handentscheidung auf: wer weiter tippt
     und sich die zweite Wahl verdient, will sie auch sehen. */
  const pickOffen = () => !!els.pickOv && els.pickOv.hidden === false;

  /* ⚠️ Die Tastatur muss WEG, wenn die Karte aufgeht (Sönke,
     16.09.2026). Das Antwortfeld behält seinen Fokus absichtlich über
     die Fragen hinweg — sonst fährt die Tastatur am iPad zwischen
     zwei Wörtern jedes Mal ein und aus (siehe „DAS ANTWORTFELD").
     Genau das schlägt hier ins Gegenteil um: der Wahl-Kasten zeigt
     eine Karte, auf die getippt werden soll, und die Tastatur deckt
     die untere Hälfte davon zu. Ein Kind, das erst wegtippen muss,
     um sein Feld zu sehen, verliert die Wahl zweimal — einmal an
     Zeit und einmal an Übersicht.

     `blur()` und nicht `is-locked`: die Klasse hält das Tippen an,
     aber die Tastatur steht weiter. Zurück kommt der Fokus beim
     Schließen (feldZurueck) — und nur dann, wenn überhaupt getippt
     wird. */
  function pickOeffnen() {
    if (!els.pickOv || els.pickOv.hidden === false) { pickHand = false; return; }
    pickHand = false;
    els.pickOv.hidden = false;
    if (els.input) els.input.blur();
    if (els.map.parentNode !== els.pickWrap) els.pickWrap.appendChild(els.map);
    if (panPick) panPick.reset();
    if (els.pickBack) els.pickBack.hidden = true;
  }
  function pickZu(vonHand) {
    if (vonHand) pickHand = true;
    if (!els.pickOv || els.pickOv.hidden) return;
    els.pickOv.hidden = true;
    if (els.map.parentNode !== els.mapwrap) els.mapwrap.appendChild(els.map);
    if (panInline) panInline.reset();
    feldZurueck();
  }

  /* Der Fokus zurück ins Feld — aber nur, wenn er dort auch etwas zu
     suchen hat. Zwei Fälle, in denen er das nicht hat: der Wahl-
     Kasten steht offen (dann holte er die Tastatur direkt wieder
     hoch, die pickOeffnen gerade weggeschickt hat), und es wird gar
     nicht getippt — im Auswahl-Modus und in der Zwischenstufe steht
     statt des Feldes die Vorschlagsreihe da. */
  function feldZurueck() {
    if (pickOffen()) return;
    if (!els.form || els.form.hidden) return;
    feldHer(els.input);
  }

  /* ─── Die große Ansage ──────────────────────────────────────
     „Nimm 1 Feld gezielt ein!" — und die Ziffer ist doppelt so groß
     wie der Satz drumherum. Deshalb steht sie als eigener Knoten da
     und nicht als Zeichen im Text: eine Zahl, die man mitten im Satz
     suchen muss, ist genau das, was Sönke am 15.09.2026 gemeldet
     hat. Ohne `zahl` bleibt es ein reiner Satz (Schattentempel). */
  function pickGross(vor, zahl, nach) {
    if (!els.pickBig) return;
    els.pickBig.textContent = '';
    if (vor) els.pickBig.appendChild(document.createTextNode(vor));
    if (zahl != null) {
      const b = document.createElement('b');
      b.className = 'wi-picknum';
      b.textContent = String(zahl);
      els.pickBig.appendChild(b);
    }
    if (nach) els.pickBig.appendChild(document.createTextNode(nach));
  }

  /* Die kurze Nachricht: aufblenden, stehenbleiben, weg. Sie räumt
     sich selbst ab — ein Kind, das sie wegtippen müsste, tippt in
     dem Augenblick auf die Karte darunter. */
  const FLASH_MS = 2800;
  function flash(oben, text) {
    if (!els.flash) return;
    els.flashKick.textContent = oben || '';
    els.flashKick.hidden = !oben;
    els.flashBig.textContent = text || '';
    els.flash.hidden = false;
    /* Neu anstoßen, auch wenn sie schon steht: ohne das Aus und Ein
       liefe die Einblendung beim zweiten Mal gar nicht. */
    els.flash.classList.remove('is-in');
    void els.flash.offsetWidth;
    els.flash.classList.add('is-in');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = null;
      if (destroyed || !els.flash) return;
      els.flash.hidden = true;
    }, FLASH_MS);
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
        /* Ein Zufallsgriff kann seit 0146 auch auf ein geschütztes
           Feld laufen: dann ist die Antwort richtig, aber das Feld
           bleibt, wo es war. Das MUSS dastehen — sonst sucht das
           Kind auf der Karte nach einem Feld, das es nicht gibt. */
        feedback('ok', !r.tile ? 'Richtig!'
          : r.tile.kind === 'guard' ? 'Richtig — aber das Feld ist geschützt. Ein Herz weniger!'
          : 'Richtig — ein Feld ist frei!');
      } else {
        feedback('bad', 'Es heißt: ' + r.solution);
        lockInput(r.locked_for);
      }

      /* Der Takt fährt bei JEDER Antwort mit (0151) — auch bei der
         Zwischenstufe. So stimmt das Abzeichen schon beim ersten
         Wort, ohne auf den nächsten wi_view-Takt zu warten. */
      setzeTakt(r.streak_goals);

      /* Eine Wahl, die aus der SERIE kommt — der Kasten soll dann
         nicht weiter von der Arena erzählen, die zwei Antworten
         vorher gefallen ist. */
      if (view && (r.picks | 0) > (view.me.picks | 0)) pickGrund = 'serie';
      if (view) {
        view.me.task   = r.task;
        view.me.streak = r.streak;
        view.me.picks  = r.picks;
      }
      feldLeer(els.input);
      renderTask(r.task, r.streak, r.picks, view && view.me.shadow_pick);
      // Die Karte hat sich bewegt — sofort nachfragen, nicht bis
      // zum nächsten Takt warten. Ein Feld, das vier Sekunden
      // später auftaucht, gehört gefühlt zur nächsten Antwort.
      if (r.result === 'correct') tick(true);
    } finally {
      submitting = false;
      if (!els.input.dataset.locked) feldZu(els.input, false);
      feldZurueck();
    }
  }

  /* Die Sperre sichtbar machen. Sie steht im Server (0151: „falsch
     ohne hinzusehen"), hier wird sie nur ANGEZEIGT — und das muss für
     BEIDE Eingaben gelten: im Tipp-Modus ist das Feld die Eingabe, im
     Auswahl-Modus sind es die acht Kacheln. Ohne die zweite Zeile
     tippt ein Kind im Auswahl-Modus weiter ins Leere und bekommt nur
     Fehlermeldungen zurück — eine Sperre, die man nicht sieht, wirkt
     wie ein kaputtes Spiel. */
  function lockInput(secs) {
    if (!secs) return;
    feldZu(els.input, true);
    els.input.dataset.locked = '1';
    if (els.opts) els.opts.classList.add('is-wait');
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      lockTimer = null;
      if (destroyed || !els.input) return;
      delete els.input.dataset.locked;
      feldZu(els.input, false);
      if (els.opts) els.opts.classList.remove('is-wait');
      feldZurueck();
    }, secs * 1000);
  }

  function feedback(kind, text) {
    els.fb.hidden = false;
    els.fb.className = 'wi-fb is-' + kind;
    els.fb.textContent = text;
  }

  function renderTask(task, streak, picks, shadow) {
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

    zeigeSerie(streak);

    /* ── Die freie Wahl ────────────────────────────────────────
       Der Nebelkranz hat VORRANG: er ist selten, er ist mächtig, und
       zwei Aufforderungen nebeneinander wären eine zu viel. Die
       freie Wahl wartet so lange — sie verfällt mit der Serie, der
       Kranz nicht. */
    /* ⚠️ Gewählt wird nur, wenn die Arena läuft. Beim ÜBEN (die Klasse
       wartet, das Kind übt weiter) gibt es keine Insel — ein
       Wahl-Kasten mit einer leeren Karte darin wäre eine Aufforderung,
       die ins Nichts führt. Erkennungsmerkmal ist die eingebettete
       Karte: renderTab blendet sie außerhalb der Arena aus. */
    const arena = !els.mapwrap.hidden;
    shadowPick = arena ? (shadow || 0) : 0;
    const frei = arena ? (picks || 0) + shadowPick : 0;
    picking = frei > 0;
    els.map.classList.toggle('is-picking', picking);
    els.map.classList.toggle('is-shadow', shadowPick > 0);

    els.pickOv.classList.toggle('is-shadow', shadowPick > 0);
    if (picking) {
      /* Drei Ansagen, je eine Zeile. Der Kopf steht LEER, wenn die
         Wahl aus der gewöhnlichen Serie kommt: „Serie" sagt schon die
         Flamme daneben, und ein Titel, der bei jeder dritten Antwort
         dasselbe wiederholt, ist genau der Text, der das Wesentliche
         zudeckt. */
      const n = Math.max(1, picks | 0);
      if (shadowPick > 0) {
        els.pickTitle.textContent = 'Schattentempel';
        pickGross('Erzeuge Nebel.');
        els.pickHint.textContent = 'Wähle ein Feld.';
        els.pickBackN.textContent = 'Nebel zurückholen';
      } else {
        els.pickTitle.textContent = pickGrund === 'arena' ? 'Arena eingenommen' : '';
        pickGross('Nimm ', n, n === 1 ? ' Feld gezielt ein!' : ' Felder gezielt ein!');
        els.pickHint.textContent = 'Tipp auf ein markiertes Feld.';
        els.pickBackN.textContent = n > 1 ? `${n} Felder wählen` : 'Feld wählen';
      }
      // Neu dazugekommen? Dann geht der Kasten auch dann wieder auf,
      // wenn er vorher von Hand zugemacht wurde.
      if (frei > pickWar) pickHand = false;
      if (pickHand) { els.pickBack.hidden = false; } else { pickOeffnen(); }
    } else {
      pickHand = false;
      els.pickBack.hidden = true;
      pickZu(false);
      // Alles verbraucht — die nächste Wahl kommt wieder aus der
      // Serie, bis eine Arena etwas anderes meldet.
      pickGrund = 'serie';
    }
    pickWar = frei;
    /* Die Marken sind eine eigene Schicht ÜBER dem Nebel und hängen
       deshalb nicht an paintOwn: sie ändern sich, sobald picks sich
       ändern, und nicht erst, wenn ein Feld den Besitzer wechselt. */
    markieren();
  }

  /* ─── Das Serien-Abzeichen ──────────────────────────────────
     Flamme, Zahl, Ziel — und das Ziel ist seit Migration 0148 das
     NÄCHSTE VIELFACHE von drei. Sönke, 14.09.2026: „Eine Streak ist
     alle 3 richtige. Also zuerst 3, dann 6 und so weiter. Gerade
     habe ich bei allem > 3 eine Streak, so soll das nicht. Das
     sollte auch die UI zeigen."

     Bis dahin stand hier eine SCHWELLE: unter drei „2/3", ab drei
     nur noch die brennende Zahl, weil von dort an jede Antwort eine
     Wahl brachte. Das war die getreue Anzeige des damaligen Servers.
     Jetzt zählt er im Takt, also zählt das Abzeichen mit — genau das
     Muster von Kingdoms (toNextStreak/paintStreakChip, dort seit
     0106): bei Serie 4 steht „4/6".

     Drei Zustände statt zweien:
       normal  es läuft, das Ziel steht daneben
       is-near noch EINE richtige, dann gibt es ein Feld
       is-hot  gerade eben verdient — das ist der Augenblick, den man
               am Tablet aus dem Augenwinkel sehen soll. Er hält
               genau eine Antwort lang, und das ist richtig so: er
               meldet ein Ereignis und keinen Dauerzustand.

     Bei Serie 0 ist das Abzeichen ganz weg: eine Flamme, die „0"
     sagt, ist keine Auskunft, sondern ein Vorwurf. */
  function zeigeSerie(streak) {
    if (!els.streak) return;
    const n = streak || 0;
    /* Wie viele richtige Antworten noch bis zur nächsten Wahl. Bei
       einem Vielfachen ist es wieder der volle Takt — die Wahl von
       eben ist ja schon gutgeschrieben. */
    const { step, big } = takt;
    const rest = step - (n % step);
    const ziel = n + rest;
    const eben = n > 0 && rest === step;
    /* Wie viele Felder das nächste (oder das gerade erreichte) Ziel
       bringt: jede vierte Serie ist doppelt so viel wert (0149). */
    const wert  = ziel % big === 0 ? 2 : 1;
    const wertJ = (eben ? n : ziel) % big === 0 ? 2 : 1;
    els.streak.hidden = (n <= 0);
    els.streakN.textContent = String(n);
    els.streakGoal.textContent = '/' + ziel;
    els.streak.classList.toggle('is-hot', eben);
    els.streak.classList.toggle('is-near', !eben && rest === 1);
    /* Der große Schritt wird ANGEKÜNDIGT und nicht überrascht: wer
       weiß, dass bei 12 zwei Felder warten, tippt die drei Wörter
       davor mit anderem Gesicht. */
    els.streak.classList.toggle('is-big', !eben && wert === 2);
    els.streak.title = eben
      ? `Serie ${n} — ${wertJ === 2 ? 'ZWEI Felder deiner Wahl sind' : 'ein Feld deiner Wahl ist'} dir gutgeschrieben`
      : rest === 1
        ? `Serie ${n} — noch eine richtige, dann zeigst du selbst, ${wert === 2 ? 'welche ZWEI Felder fallen' : 'welches Feld fällt'}`
        : `Serie ${n} von ${ziel} — jede ${step}. richtige bringt ein Feld deiner Wahl, jede ${big}. zwei`;
  }

  /* ─── „Was verbirgt sich da?" ───────────────────────────────
     Die Sonderregeln, wie Sönke sie vorgegeben hat: eine Frage, zwei
     Kacheln, und die Antwort erst auf Tippen. Wenig Text ist hier
     keine Sparsamkeit, sondern der Inhalt — in der Lobby wird nicht
     gelesen, sondern gewartet.

     Ein Baustein für ZWEI Oberflächen (Wartetafel am Tablet und
     Lobby am Beamer). Aufgeklappt wird im DOM, nicht im Zustand:
     welche Kachel offen ist, steht als Klasse am Knopf — ein Kasten,
     der in zwei Ansichten gleichzeitig lebt, hätte sonst zwei
     Wahrheiten.

     ⚠️ Die Zahlen kommen aus RUINEN und werden NICHT abgeschrieben.
     Eine Lobby, die vier Herzen verspricht, während der Server mit
     fünf rechnet, ist schlimmer als gar keine Erklärung. */
  const RUL_KLEIN = ['K', 'T'];
  const RUL_GROSS = ['L', 'S', 'A'];

  function ruinZeile(k) {
    const R = RUINEN[k];
    return `<li class="wi-rulitem">
        <img class="wi-rulmini" src="${esc(ruinSrc(k))}" alt="">
        <span class="wi-rulwer">${esc(R.name)}</span>
        <span class="wi-rulherz" aria-label="${R.leben} Leben">${'♥'.repeat(R.herzen)}</span>
        <span class="wi-rulpkt">${R.wert} Punkte</span>
        ${R.kann ? `<span class="wi-rulkann">${esc(R.kann)}</span>` : ''}
      </li>`;
  }

  function rulesHTML() {
    const bild = k => `<img src="${esc(ruinSrc(k))}" alt="">`;
    return `
      <div class="wi-rules" data-part="rules">
        <p class="wi-rultitle">Nimm mit richtigen Antworten Teile der Insel ein —
          aber was verbirgt sich da?</p>
        <div class="wi-rulrow">
          <button type="button" class="wi-rulcard" data-rul="klein" aria-expanded="false">
            <span class="wi-rulpic">${bild('K')}${bild('T')}</span>
            <span class="wi-rulname">Kleine Ruinen</span>
          </button>
          <button type="button" class="wi-rulcard" data-rul="gross" aria-expanded="false">
            <span class="wi-rulpic">${bild('L')}${bild('S')}</span>
            <span class="wi-rulname">Große Ruinen</span>
          </button>
        </div>
        <div class="wi-rulbody" data-part="rulbody" hidden></div>
      </div>`;
  }

  /* Ein Zuhörer an der Wurzel, kein Knopf-Karussell: die Kacheln
     entstehen mit dem HTML und verschwinden mit ihm. */
  function bindRules(wurzel) {
    wurzel.addEventListener('click', e => {
      const b = e.target.closest('.wi-rulcard');
      if (!b) return;
      const box = b.closest('.wi-rules');
      const body = box.querySelector('.wi-rulbody');
      const offen = b.getAttribute('aria-expanded') === 'true';
      box.querySelectorAll('.wi-rulcard').forEach(x => {
        x.setAttribute('aria-expanded', 'false');
        x.classList.remove('is-open');
      });
      if (offen) { body.hidden = true; return; }
      b.setAttribute('aria-expanded', 'true');
      b.classList.add('is-open');
      const klein = b.dataset.rul === 'klein';
      body.innerHTML = klein
        ? `<p class="wi-rulsatz">Die geben dir Bonus-Punkte, solange sie dir gehören.</p>
           <ul class="wi-rullist">${RUL_KLEIN.map(ruinZeile).join('')}</ul>
           <p class="wi-rulfuss">Ein Herz = ein Treffer mehr. Ruinen fallen nur mit einer Serie.</p>`
        : `<p class="wi-rulsatz">Nimm sie ein und erhalte ihre Fähigkeiten.</p>
           <ul class="wi-rullist">${RUL_GROSS.map(ruinZeile).join('')}</ul>
           <p class="wi-rulfuss">Ein Herz = ein Treffer mehr. Ruinen fallen nur mit einer Serie.</p>`;
      body.hidden = false;
    });
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
                <div class="wi-otherpic"><img src="${esc(slotMini(t.i))}" alt=""></div>
                <span class="wi-othername">${esc(T.name)}</span>
                <span class="wi-othern">${t.people}</span>
              </div>`;
    });
    return out;
  }

  function renderTabLobby(v) {
    const myTeam = v.me.team;
    const mine = (v.teams || []).find(t => t.i === myTeam);
    /* Seit dem 18.09.2026 kommt die beendete Runde hier nicht mehr an
       — sie hat ihre eigene Tafel (renderTabEnd). Die Wartetafel ist
       damit wieder das, was ihr Name sagt: die Zeit VOR dem Start. */
    els.waitText.textContent = 'Warten auf den Spielstart …';

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

    /* Ohne Migration 0146 gibt es die Ruinen nicht — dann darf die
       Lobby sie auch nicht versprechen. Erkennungsmerkmal ist das
       Feld, das erst 0146 mitschickt. */
    els.rulWrap.hidden = (v.ruins == null);
  }

  /* Das Siegerbild am Tablet: der Sieger groß, das eigene Volk
     daneben (nur wenn es ein anderes ist — sonst stünde dasselbe Volk
     zweimal da), darunter der eigene Platz als Satz und die eigene
     Wort-Bilanz dieser Runde.

     Die Bilanz ist Sönkes Wunsch vom 18.09.2026 und sie ist die
     einzige Zahl hier, die NUR diesem Kind gehört: alles andere auf
     der Tafel gilt für die ganze Gruppe. Sie kommt aus `me` und wird
     nicht aus der Volkszahl heruntergerechnet.

     Ohne eigenes Volk (wer erst nach dem Start dazukam) bleibt es
     beim Sieger allein — eine Karte in der Farbe von „Volk NaN" wäre
     schlimmer als eine Karte weniger. */
  function renderTabEnd(v) {
    const rows = endRows(v);
    if (!rows.length) {
      els.tWinner.textContent = 'Runde beendet.';
      els.tPodium.innerHTML = '';
      els.tPlace.hidden = true;
      els.tMine.hidden = true;
      return;
    }
    const win  = rows[0];
    const mein = v.me.team;
    const mine = (mein == null) ? null : rows.find(r => r.slot === mein);

    els.tend.style.setProperty('--wi-win', teamOf(win.slot).color);
    els.tWinner.innerHTML = endTitel(win.slot);
    els.tPodium.innerHTML = podCard(win, 'wi-pod--1') +
      ((mine && mine.slot !== win.slot) ? podCard(mine, 'wi-pod--mine') : '');

    els.tPlace.innerHTML = !mine ? '' : (mine.slot === win.slot
      ? 'Ihr habt gewonnen! 🎉'
      : `Ihr seid <b>${ORDINAL[mine.platz] || (mine.platz + '.')}</b>.`);
    els.tPlace.hidden = !mine;

    /* Die eigene Strichliste. `wrong` sagt nichts Schlimmes — bei
       Vokabeln ist eine falsche Antwort der Normalfall des Übens
       (siehe Kopf von 0151) —, deshalb steht sie klein daneben und
       nicht als Vorwurf. Wer kein einziges Wort beantwortet hat,
       bekommt die Zeile gar nicht: „0 richtig, 0 daneben" ist keine
       Bilanz, sondern eine leere Behauptung. */
    const r = v.me.correct | 0, f = v.me.wrong | 0;
    els.tMine.innerHTML = (r + f === 0) ? '' :
      `<span class="wi-tallylab">Deine Wörter</span>
       <span class="wi-tallyok"><b>${r}</b> richtig</span>
       <span class="wi-tallyno"><b>${f}</b> daneben</span>`;
    els.tMine.hidden = (r + f === 0);
  }

  function renderTab(v) {
    const arena = (v.phase === 'running');
    const count = (v.phase === 'countdown');
    // Ein Phasenwechsel beendet das Üben: nach dem Ende einer Runde
    // soll die Klasse wieder auf dieselbe Tafel sehen.
    if (v.phase !== lastPhase) { practice = false; lastPhase = v.phase; }

    // 0157: Lehrkraft hat ihre Units geändert → sofort wi_solo_claim auslösen.
    // sets_changed_at kommt nur dann, wenn 0157 eingespielt ist.
    if (v.sets_changed_at && v.sets_changed_at !== lastSetsChangedAt) {
      lastSetsChangedAt = v.sets_changed_at;
      soloClaimAt = 0;
    }

    /* Vier Tafeln statt drei (18.09.2026): das Rundenende hat seine
       eigene. Vorher fiel es in die Wartetafel — dieselbe Ansicht wie
       VOR dem Spiel, nur mit einem anderen Satz darüber.

       Das Üben sticht auch hier: wer nach der Runde weiterübt, sieht
       seine Aufgabe und nicht das Podest. Der Zurück-Knopf bringt ihn
       aufs Siegerbild, nicht in die Lobby. */
    const ended   = (v.phase === 'ended');
    const showPlay = arena || (!count && practice);
    const showEnd  = ended && !showPlay && !count;
    els.tlobby.hidden = arena || count || practice || ended;
    els.tend.hidden   = !showEnd;
    els.tcount.hidden = !count;
    els.tplay.hidden  = !showPlay;
    if (count) return;          // fünf Sekunden nur die Zahl
    if (showEnd)   { renderTabEnd(v); return; }
    if (!showPlay) { renderTabLobby(v); return; }

    const T = teamOf(v.me.team);
    const mine = (v.teams || []).find(t => t.i === v.me.team);

    els.me.style.setProperty('--wi-team', T.color);
    /* Nur bei Wechsel: `src` neu zuzuweisen ist auch mit demselben
       Wert ein Ladevorgang, und renderTab läuft viermal die Minute. */
    const wappen = slotBild(v.me.team);
    if (els.mePic.getAttribute('src') !== wappen) els.mePic.setAttribute('src', wappen);
    els.meName.textContent = T.name;
    /* Sönke, 16.09.2026: „Wie viele Felder (und wie viel % der Karte)
       das eigene Volk hat, sollte oben bei seinem Volk stehen, die
       anderen Völker sehe ich hier nicht."

       Der Anteil misst die GANZE Insel, nicht den schon erkämpften
       Teil — sonst stünde bei zwei Feldern am Anfang „50 %". Unter
       zehn Prozent mit einer Nachkommastelle: ein Feld von 430 sind
       0,23 %, auf ganze Prozent gerundet bliebe die Zahl in der
       ersten Viertelstunde auf null stehen, während die Karte schon
       sichtbar wächst. */
    const felder = mine ? mine.tiles : 0;
    const anteil = cells.length ? felder * 100 / cells.length : 0;
    const anteilText = anteil < 10 ? anteil.toFixed(1).replace('.', ',') : Math.round(anteil);
    els.meSub.textContent = arena
      ? `${felder} Felder · ${anteilText} % der Insel`
      : 'Übungsrunde';
    els.clock.textContent = arena ? fmtLeft(v.ends_at) : '';
    els.clock.hidden = !arena;

    els.mapwrap.hidden = !arena;
    els.back.hidden = arena;
    if (!arena && els.fb.hidden) {
      feedback('idle', 'Die Arena läuft gerade nicht — üben kannst du trotzdem.');
    }
    renderTask(v.me.task, v.me.streak, v.me.picks, v.me.shadow_pick);
    if (v.me.locked_for > 0) lockInput(v.me.locked_for);
  }

  /* Was nach einem Schlag dasteht. Die Zahl `hearts` ist das, was
     NACH diesem Treffer noch übrig ist — und weil das Feld selbst
     das letzte Leben ist, heißt „0 Herzen" nicht „kaputt", sondern
     „der nächste Schlag nimmt es". Genau so steht es da.

     ⚠️ Die drei Ruinen, die etwas AUSLÖSEN, stehen seit dem
     15.09.2026 nicht mehr hier: Arena und Schattentempel sagen sich
     im Wahl-Kasten an, der gleich darauf aufgeht, der Lichttempel als
     kurze Tafel. Zwei Meldungen über dasselbe sind eine zu viel —
     und die hier wäre die kleinere von beiden. */
  function schlagText(t) {
    const R = Object.values(RUINEN).find(x => x.art === t.ruin);
    const name = R ? R.name : 'Die Ruine';
    if (t.result === 'guard') return 'Ein Schutzherz weniger — das Feld hält noch.';
    if (t.result === 'hit') {
      return t.hearts > 0
        ? `Treffer! ${name}: noch ${t.hearts} ${t.hearts === 1 ? 'Herz' : 'Herzen'}.`
        : `Treffer! Der nächste Schlag nimmt ${name === 'Die Ruine' ? 'sie' : 'ihn'}.`;
    }
    return R ? `${name} gehört euch!` : 'Feld genommen!';
  }

  async function onMapClick(e) {
    if (!picking) return;
    const cell = e.target.closest('.wi-cell');
    if (!cell) return;
    const r_ = +cell.dataset.r, c_ = +cell.dataset.c;

    /* Der Nebelkranz zuerst — er hat in der Leiste Vorrang, also
       muss er ihn auch beim Tippen haben. Sonst verbrauchte derselbe
       Fingertipp eine freie Wahl. */
    if (shadowPick > 0) {
      const s = await ctx.actions.call('wi_shadow_strike', { p_r: r_, p_c: c_ });
      if (!s.ok) {
        ctx.toast(s.error === 'not_reachable' ? 'Dieses Feld gibt es nicht.'
          : s.error === 'fn_missing' ? 'Der Schattentempel braucht ein Update der Datenbank.'
          : ctx.errText(s.error));
        return;
      }
      feedback('ok', `Der Nebel ist zurück — ${s.fogged} Felder sind wieder frei zu haben.`);
      if (view) view.me.shadow_pick = s.shadow_pick;
      renderTask(view && view.me.task, view && view.me.streak,
                 view && view.me.picks, s.shadow_pick);
      tick(true);
      return;
    }

    const r = await ctx.actions.call('wi_pick_tile', { p_r: r_, p_c: c_ });
    if (!r.ok) {
      ctx.toast(r.error === 'not_reachable'
        ? 'Das Feld grenzt nicht an euer Gebiet.'
        : r.error === 'own_tile'
          ? 'Das gehört euch schon.'
          : r.error === 'home_tile'
            ? 'Landeplätze sind unantastbar.'
            : r.error === 'tile_busy'
              ? 'Zu spät — da war gerade jemand anders.'
              : ctx.errText(r.error));
      return;
    }
    /* Eine eingenommene Ruine sagt sich SELBST an, und zwar dort, wo
       es weitergeht: Arena und Schattentempel im Wahl-Kasten, der
       gleich darauf aufgeht (der Kopf trägt den Grund), der
       Lichttempel als kurze Tafel — er verlangt nichts, er hat schon
       gewirkt. Deshalb steht in diesen drei Fällen keine zusätzliche
       Zeile unter der Aufgabe: zwei Meldungen über dasselbe sind eine
       zu viel. */
    /* ⚠️ `effect` kommt bei JEDER eroberten Ruine mit, auch bei Klo
       und Tor (die können nichts, die zählen nur Punkte). Gemeint
       sind hier die drei, die etwas auslösen. */
    const eff = r.effect && r.effect.kind;
    if (eff === 'arena') pickGrund = 'arena';
    if (eff === 'licht') {
      flash('Lichttempel eingenommen', 'Deine Felder sind beschützt!');
    } else if (eff !== 'arena' && eff !== 'schatten'
               && r.tile && (r.tile.ruin || r.tile.result === 'guard')) {
      feedback('ok', schlagText(r.tile));
    }
    if (view) {
      view.me.picks = r.picks;
      if (r.shadow_pick != null) view.me.shadow_pick = r.shadow_pick;
    }
    renderTask(view && view.me.task, view && view.me.streak, r.picks,
               view && view.me.shadow_pick);
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

    /* Der Serien-Takt hängt am eingestellten Modus (0151) und kann
       sich zwischen zwei Runden ändern — die Lehrkraft stellt in der
       Lobby von „tippen" auf „auswählen" um. Deshalb bei jedem Blick
       nachführen und nicht einmal beim Öffnen. */
    setzeTakt(v.streak_goals);

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
      /* Am Beamer die reiche Karte, am Tablet die flache (16.09.2026).
         Die Rolle entscheidet und nicht die Bildschirmbreite: ein
         Pult in einem schmalen Fenster ist immer noch ein Rechner
         mit einem Beamer daran, und ein iPad im Querformat ist immer
         noch ein iPad. */
      buildMap(els.map, cells, v.map_key, { mini: role !== 'presenter' });
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
    if (mapKey) paintOwn(v.own, v.ruins, v.hearts);

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

        /* 0157: Benachrichtigung über neu hinzugefügte Stationen.
           Nur im Wartebereich (Lobby/ended), nicht während einer
           laufenden Runde oder im Countdown — dort hat das Kind
           Wichtigeres zu tun. */
        const newSets = Array.isArray(r.new_sets) ? r.new_sets : [];
        if (newSets.length > 0 && view &&
            view.phase !== 'running' && view.phase !== 'countdown') {
          const namen = newSets.map(s =>
            s.unit ? `${s.unit} – ${s.station}` : s.station
          );
          const auflistung = namen.length <= 3
            ? namen.join(', ')
            : namen.slice(0, 2).join(', ') + ` & ${namen.length - 2} weitere`;
          flash('🏝 Neue Vokabeln auf deiner Insel', auflistung);
        }
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
       4  funkelnd        eigene Zeichnung, dazu Funken bei TAG und Nacht

     ⚠️ Die Zahlen links sind die des Servers. Auf dem Schirm steht
     „Stufe 1" bis „Stufe 5" (stufeText) — Sönke, 13.09.2026:
     „Schüler fangen mit 0 an zu zählen :D".

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
     Einunddreißig Vorlagen (seit 13.09.2026; vorher zwanzig), alle auf
     DEMSELBEN Blatt gezeichnet: gemeinsame Grundlinie, gemeinsamer
     Maßstab. Daraus folgt die Regel, an der der erste Anlauf
     gescheitert ist: verkleinert wird mit dem BLATT und nicht mit
     dem einzelnen Tier — sonst wächst die zusammengerollte
     Schlaf-Echse beim Einschlafen auf die Größe der stehenden.

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
      s2a:   { x:   5.97, y:  59.01, w: 275, h: 232 },
      s2az:  { x:   0.35, y:  71.65, w: 290, h: 227 },
      s2b:   { x:  28.45, y:  87.81, w: 254, h: 201 },
      s2bz:  { x:   5.97, y: 125.39, w: 295, h: 131 },
      s3a:   { x:  35.83, y:  32.31, w: 247, h: 224 },
      s3az:  { x:  16.51, y: 170.35, w: 282, h: 122 },
      s3b:   { x:  35.48, y:  26.69, w: 248, h: 282 },
      s3bz:  { x:  54.09, y: 166.49, w: 226, h: 131 },
      s3c:   { x:  39.34, y:      0, w: 262, h: 339 },
      s3cz:  { x:   7.38, y: 108.53, w: 292, h: 231 },
      s3d:   { x:  34.07, y:  22.13, w: 250, h: 277 },
      s3dz:  { x:  23.88, y:  44.26, w: 265, h: 252 },
      s3e:   { x:  22.83, y:  21.78, w: 272, h: 292 },
      s3ez:  { x:  44.96, y:   56.9, w: 226, h: 227 },
      s3es:  { x:  31.26, y:  63.93, w: 271, h: 179 },
      s4a:   { x:  34.42, y:   27.4, w: 249, h: 299 },
      s4az:  { x:  35.83, y:  75.87, w: 233, h: 223 },
      s4b:   { x:  31.61, y:  25.99, w: 264, h: 303 },
      s4bz:  { x:  21.78, y:   57.6, w: 261, h: 252 },
      s4c:   { x:  40.04, y:    0.7, w: 242, h: 338 },
      s4cz:  { x:  40.04, y:   0.35, w: 243, h: 338 },
      s4d:   { x:  34.07, y:  11.94, w: 250, h: 321 },
      s4dz:  { x:  25.29, y:  42.85, w: 261, h: 259 },
      s4e:   { x:  13.35, y:  32.31, w: 279, h: 270 },
      s4ez:  { x:     13, y:  82.89, w: 288, h: 184 },
      s4es:  { x:  30.21, y:  31.96, w: 273, h: 207 }
    }
  };
  /* ENDE ERZEUGT */

  const BILDER = Object.keys(ECHSE.bilder);

  /* ─── Die Varianten ────────────────────────────────────────────
     Sönke, 11.09.2026: „damit die insel bunter wird." Aus zwei
     Fassungen der ausgewachsenen Echse sind fünf geworden, und die
     gewachsene (Stufe 2) hat jetzt drei.

     Gezogen wird aus einem TOPF und nicht aus einer Tabelle mit
     Gewichten: a, b und c liegen zweimal darin, d und e einmal —
     also kommen die beiden seltenen halb so oft wie die anderen
     drei, genau wie vorgegeben. Eine Zeile, die man nachzählen
     kann, statt einer Summe, die man nachrechnen muss.

     Gewürfelt wird aus der id des WORTES (siehe neuesTier): dieselbe
     Vokabel hat auf jedem Gerät dieselbe Echse. „Zufällig beim
     Wachsen" heißt für das Kind trotzdem zufällig — es sieht die
     Variante ja erst, wenn das Tier die Stufe erreicht.

     VAR3 gilt seit 13.09.2026 für ZWEI Stufen: die ausgewachsene
     (s3<v>) und die funkelnde (s4<v>). Ein zweiter Topf wäre der
     nächstliegende Fehler — dann würde aus der Echse beim letzten
     Aufstieg ein anderes Tier, und die Belohnung wäre ein Tausch. */
  const VAR2 = ['', 'a', 'b'];
  const VAR3 = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'e'];

  /* Die eine, die nicht fliegt. Sie läuft an Land, schläft an Land
     und schwimmt von Insel zu Insel — deshalb hat sie als einzige
     ein drittes Bild. Steht hier als Name und nicht als 'e' verstreut
     im Quelltext: wer später eine zweite Schwimmerin zeichnet, sucht
     genau diese Zeile. */
  const SCHWIMMT = 'e';

  /* ⚠️ Die Wasserlinie ist INS BILD gezeichnet. Bei Echse3eswim sind
     die Kringel das Unterste, was auf dem Blatt steht — und genau sie
     gehören auf die Meeresoberfläche, nicht die gemeinsame
     Grundlinie der Landtiere. Für dieses eine Bild ist der Anker
     deshalb seine eigene Unterkante; ohne das schwebte die
     Schwimmerin gut ein Viertel Kachel über dem Wasser.

     Als Tabelle und nicht als Abfrage in der Zeichenschleife: dort
     wäre es ein `if` je Tier und Bild, hier ist es ein Nachschlagen. */
  const ANKER_Y = {};
  for (const k of BILDER) ANKER_Y[k] = ECHSE.blatt.ankerY;
  /* Beide Wasserbilder der Schwimmerin — das ausgewachsene und seit
     13.09.2026 das funkelnde. Aus SCHWIMMT abgeleitet und nicht als
     zwei Zeilen hingeschrieben: wer die Schwimmerin später auf einen
     anderen Buchstaben legt, ändert dann eine Stelle. */
  for (const st of [3, 4]) {
    const k = 's' + st + SCHWIMMT + 's';
    if (ECHSE.bilder[k]) ANKER_Y[k] = ECHSE.bilder[k].y + ECHSE.bilder[k].h;
  }

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
  /* Die Schwimmerin ist langsamer als ein Flieger und schneller als
     ein Läufer — sonst wäre die Reise zum Nachbarinsel-Strand
     entweder keine Reise oder keine, die man abwartet. An Land
     bewegt sie sich wie eine gewachsene Echse. */
  const SCHWIMM_TEMPO = .62;
  const WATT_TEMPO = .40;
  /* Wie stark eine Stufe bei Nacht leuchtet. Bewusst ungleichmäßig:
     von 1 auf 2 soll man einen Unterschied ahnen, von 2 auf 3 soll
     man ihn SEHEN. Eine gleichmäßige Rampe wäre keine Auskunft. */
  const GLUEHEN = [0, .20, .42, 1.00, 1.35];
  /* Wie viele Funken je Stufe steigen. Auch das ist Auskunft und
     keine Zierde — „geschafft" soll man von weitem sehen. */
  const FUNKEN = [0, 2, 3, 5, 14];
  /* ─── „Die funkelnden erkennt man gar nicht" ─────────────────
     Sönke, 13.09.2026. Der Grund stand eine Ebene tiefer: die Funken
     hingen am Nachtwert (`glow`), und der ist vier Zehntel eines
     Umlaufs lang GENAU NULL. Wer bei Tag auf die Insel sah, sah
     überhaupt kein Funkeln — nur ein Tier, das damals auch noch
     dasselbe Bild trug wie ein ausgewachsenes.

     Die oberste Stufe funkelt deshalb jetzt AUCH AM TAG, mit dieser
     festen Stärke; die Stufen 1–3 bleiben eine Nacht-Auskunft. Das
     ist der Unterschied, den es zu sehen gibt: „kann ich" leuchtet
     rund um die Uhr, alles davor nur, wenn die Insel schläft. */
  const FUNKEL_TAG = .95;
  /* Und sie funkelt größer. Ein Funke in Läufergröße geht bei Sonne
     im Gelände unter, egal wie viele es sind. */
  const FUNKEL_GROSS = 1.45;
  /* Dazu die Glitzersterne AUF dem Tier (glitzerFleck): drei Stück,
     die nacheinander aufblitzen. Ein runder Funke ist bei Tag ein
     heller Fleck — vier Spitzen liest man auch dann als „funkelt".
     Die Zahl ist bewusst klein: drei Sterne je Tier sind bei 200
     funkelnden Wörtern schon 600 Bilder je Takt. */
  const GLITZER = 3;
  const GLITZER_GROSS = .40;   // Anteil der Tierhöhe
  const GLITZER_SEK = 2.1;     // ein Auf und Ab
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
     Die Hauptinsel steht immer. Die Satelliten tauchen nach
     Wortzahl auf — dadurch wächst die Welt mit dem Wortschatz,
     ohne dass sich die Hauptinsel je umformt.

     Das ist der Kern: `wuerfelInseln` setzt die Inseln in FESTER
     Reihenfolge, gezeigt werden die ersten k. Damit ist das
     Wachsen von allein monoton — eine Insel, die sich beim
     Dazulernen umformt, wäre nicht mehr die eigene.

     ⚠️ DREI GROSSE statt sechs kleiner (15.09.2026, Sönkes Ansage:
     „hauptinsel größer 3 große satelliten, einer gleich die anderen
     kommen mit der vokabel zahl"). Der Anlass ist ein Lehrwerk mit
     rund 1000 Vokabeln je Jahrgang, und der Engpass dabei war NICHT
     die Gesamtfläche, sondern die Hauptinsel: Ei, Stufe 1 und
     Stufe 2 sind an sie gebunden (`aufHauptinsel`), nur Flieger
     dürfen hinaus. Im September sind 1000 frische Wörter 1000 Eier —
     auf den alten ~210 Feldern wären das fünf je Sechseck, während
     sechs Satelliten leer danebenliegen. Darum wächst die
     HAUPTINSEL auf gut das Doppelte, und die Satelliten werden so
     groß, dass sie zusammen noch einmal dasselbe tragen.

     Der erste Satellit ist von Anfang an da (Schwelle 0): eine
     Insel ganz allein im Meer sieht nicht aus wie ein Archipel, das
     noch wächst, sondern wie eines, das es nicht gibt.

     ⚠️ Diese drei Zahlen zu ändern zeichnet JEDE bestehende Insel
     neu — die Form hängt am Würfelstrom, und der hängt an ihnen.
     Heute ist das gratis (es gibt noch keine Insel, die ein Kind
     wiedererkennen würde). Sobald in Etappe C jede Insel ihren
     eigenen Seed bekommt, braucht sie daneben eine `geo_version`,
     und dann gelten neue Maße nur noch für NEUE Inseln.

     Die Schwellen sind Richtwerte und ausdrücklich zum Drehen da:
     eine Unit hat rund 30 Wörter, der zweite Satellit kommt also
     nach rund zehn Units — etwa zur Halbzeit eines Jahrgangs. */
  const SAT_SCHWELLEN = [0, 300, 650];

  /* Wie viele Felder die Hauptinsel hat und wie groß die Satelliten
     werden. In FELDERN und nicht in Radien (siehe blobMitZiel). */
  const HAUPT_FELDER = [420, 460];
  const SAT_FELDER = [110, 170];
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
  /* Der Glitzerstern der obersten Stufe (13.09.2026). Vier Spitzen
     und ein heller Kern — die Form, die man als „das funkelt" liest,
     ohne dass es dunkel sein muss. Gezeichnet aus vier Bögen um die
     Mitte: eine Spitze, die schlank anfängt und in der Mitte dick
     wird, sieht aus wie ein Lichtreflex; vier gerade Dreiecke sähen
     aus wie ein Windrad.

     Wie alles hier: EINMAL vorgerendert. Ein Pfad je Tier und Bild
     wäre bei zweihundert funkelnden Wörtern der teuerste Posten. */
  function glitzerFleck() {
    const S = 64, c = neuCanvas(S, S);
    const x = c.getContext('2d');
    const m = S / 2, r = S / 2, w = S * .085;
    const g = x.createRadialGradient(m, m, 0, m, m, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.22, 'rgba(255,252,236,.85)');
    g.addColorStop(.6, 'rgba(255,244,196,.30)');
    g.addColorStop(1, 'rgba(255,238,170,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(m, m - r);
    x.quadraticCurveTo(m + w, m - w, m + r, m);
    x.quadraticCurveTo(m + w, m + w, m, m + r);
    x.quadraticCurveTo(m - w, m + w, m - r, m);
    x.quadraticCurveTo(m - w, m - w, m, m - r);
    x.closePath();
    x.fill();
    // Der Kern. Ohne ihn ist der Stern in der Mitte am dünnsten —
    // genau dort, wo das Licht herkommen soll.
    x.beginPath(); x.arc(m, m, S * .13, 0, 6.2832); x.fill();
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
  let glitzer = null;   // der vierzackige Stern der obersten Stufe

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
    glitzer = glitzerFleck();
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

  /* ⚠️ `hi` ist die obere Schranke der Suche. Liegt sie unter dem
     verlangten Radius, liefert die Halbierung still `hi` zurück und
     die Insel ist zu KLEIN — nichts meldet sich, die Zahl ist
     einfach falsch. Für die 460 Felder der Hauptinsel reichten die
     alten 24 noch (nachgemessen: dieselben 435 Felder wie mit 40),
     die Luft ist also Vorsorge für das nächste Mal. Abgefangen wird
     der Deckel inzwischen auch von außen — uitest besteht auf einer
     Hauptinsel von mindestens 400 Feldern. */
  function blobMitZiel(cr, cc, ziel, wob) {
    let lo = .5, hi = 40;
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

       ⚠️ Die Schleife läuft über ALLE drei, auch wenn nur einer
       gezeigt wird: sonst hinge die Lage der zweiten Insel daran,
       wie viele Wörter das Kind gerade hat — und die Insel
       verschöbe sich beim Dazulernen.

       Dass die Zahl der Plätze im WINKEL steckt, ist derselbe
       Gedanke von der anderen Seite: drei Satelliten teilen sich
       den Kreis in Drittel. Wer die Liste verlängert, dreht damit
       alle bestehenden Inseln — siehe die Warnung bei
       SAT_SCHWELLEN. */
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
    /* Die Schwimmerin reist von INSEL zu INSEL und nicht auf einen
       Punkt im offenen Meer. Das ist der Unterschied zwischen
       „schwimmt herum" und „schwimmt irgendwohin": ein Ziel an Land
       gibt der Fahrt ein Ende, an dem sie wieder läuft — und beim
       Ankommen sieht man den Wechsel der Bilder.

       Sie darf dabei auch die Insel wählen, auf der sie schon steht:
       eine Schwimmerin, die nach jeder Landung sofort wieder ablegen
       MÜSSTE, käme nie zur Ruhe. */
    if (t.stufe >= 3 && schwimmt(t)) {
      const i = (Math.random() * welt.inseln.length) | 0;
      t.inselIdx = i;
      const p = zufallsPunktAuf(welt.inseln[i], Math.random);
      t.zx = p.x; t.zy = p.y;
      return;
    }
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
     dessen id: Farbe und beide Varianten sind damit über Geräte und
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
      /* Zwei Varianten, zwei verschiedene Stellen im Hash: die eine
         entscheidet über die gewachsene Echse, die andere über die
         ausgewachsene. Aus DERSELBEN Stelle gezogen hinge die Stufe 3
         an der Stufe 2, und aus fünf Fassungen würden drei. */
      v2: VAR2[(h >>> 8) % VAR2.length],
      v3: VAR3[(h >>> 14) % VAR3.length],
      x: p.x, y: p.y, z: 0, zx: p.x, zy: p.y,
      inselIdx: 0,
      flip: rnd() < .5,
      phase: rnd() * 6.283,
      zustand: 'laufen',
      schlafBis: 0, pop: 0, burst: 0,
      tempo: .85 + rnd() * .3
    };
    if (stufe >= 3) {
      if (schwimmt(t)) { t.zustand = 'schwimmen'; t.z = 0; }
      else { t.zustand = 'fliegen'; t.z = FLUG_HOEHE; }
    }
    if (stufe === 0) t.zustand = 'ei';
    return t;
  }

  /* Die drei Fragen, die das Verhalten auseinanderhalten. `schwimmt`
     gilt auch unter Stufe 3 — dort läuft sie ohnehin wie jede andere,
     aber die Zeile bleibt so eine Aussage über das TIER und nicht
     über seinen jetzigen Zustand. */
  const schwimmt = t => t.v3 === SCHWIMMT;
  const fliegt = t => t.stufe >= 3 && !schwimmt(t);
  /* Unterwegs auf offenem Wasser — die Schwimmerin darf das als
     einziges Landtier, und nur daran hängt ihr drittes Bild. */
  const treibt = t => t.stufe >= 3 && schwimmt(t) && t.imWasser;

  function schritt(t, dt, jetzt) {
    if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 1.6);
    if (t.burst > 0) t.burst = Math.max(0, t.burst - dt * .85);
    if (t.stufe === 0) return;                       // Eier tun nichts

    if (t.zustand === 'schlafen') {
      if (t.stufe >= 3) t.z += (0 - t.z) * Math.min(1, dt * 3);
      if (jetzt >= t.schlafBis) {
        t.zustand = t.stufe < 3 ? 'laufen' : (schwimmt(t) ? 'schwimmen' : 'fliegen');
        neuesZiel(t);
      }
      return;
    }

    const flieger = fliegt(t);
    t.z += ((flieger ? FLUG_HOEHE : 0) - t.z) * Math.min(1, dt * 2.2);

    const dx = t.zx - t.x, dy = t.zy - t.y;
    const d = Math.hypot(dx, dy);
    /* Drei Gangarten. Die Schwimmerin hat zwei davon, und welche
       gilt, hängt nicht an ihrem Zustand, sondern daran, ob gerade
       Land unter ihr ist — dieselbe Frage, die auch ihr Bild
       auswählt. */
    const v = (flieger ? FLUG_TEMPO
             : t.stufe >= 3 ? (t.imWasser ? SCHWIMM_TEMPO : WATT_TEMPO)
             : LAUF_TEMPO[t.stufe]) * t.tempo;

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

       Geprüft wird „Hauptinsel" und nicht bloß „Land": wer die
       Hauptinsel verlässt, tut das als Belohnung fürs
       Ausgewachsensein — in der Luft oder seit dem 11.09.2026 auch
       auf dem Wasser. Beides ist Stufe 3, und genau daran hängt der
       Riegel: darunter läuft AUCH die Schwimmerin nur zu Hause. */
    if (t.stufe < 3) {
      const z = feldAt(nx, ny);
      if (!z || !aufHauptinsel(z)) { neuesZiel(t); return; }
    }

    t.x = nx; t.y = ny;
    /* Ob Land unter ihr ist, entscheidet bei der Schwimmerin über
       Bild UND Tempo. Einmal je Bild gefragt und gemerkt, statt an
       beiden Stellen noch einmal. */
    if (t.stufe >= 3 && schwimmt(t)) t.imWasser = !feldAt(t.x, t.y);
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
    t.z = 0; t.inselIdx = 0; t.imWasser = false;
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
      if (vorher < 3 || t.zustand === 'ei') {
        /* Vier von fünf heben ab, die fünfte geht ins Wasser. Beides
           ist derselbe Augenblick — „ab jetzt darfst du die Insel
           verlassen" —, nur mit zwei verschiedenen Bildern dafür. */
        t.zustand = schwimmt(t) ? 'schwimmen' : 'fliegen';
        neuesZiel(t);
      }
      return;
    }
    if (vorher >= 3 || t.zustand === 'ei' || t.zustand === 'fliegen'
        || t.zustand === 'schwimmen' || t.zustand === 'zumSchlafen') {
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

  /* HELD_DIR und BOOT_DIR stehen seit dem 14.09.2026 ganz oben bei
     den Völkern: seit die Raum-Rollen dieselben Bilder nehmen, gibt
     es die zwei Ordner nicht mehr nur für die Insel. */

  /* Die Voreinstellung ist Sönkes Vorgabe: „Diese sind Default von
     den Brokkoli Giraffen." Das ist Volk 2 in TEAMS. */
  const VOLK_STD = 2;

  /* Maße in KACHELN, wie überall auf dieser Insel. Die Figur ist
     etwas größer als eine ausgewachsene Echse (2.25) — man soll sie
     in der Herde finden, ohne dass sie darüber thront. */
  const HELD_HOCH  = 2.6;

  /* ⚠️ Eine Höhe für alle acht Völker geht NICHT auf. Gemessen wird
     die Figur an ihrer Höhe, und die Brokkoli-Giraffen sind lang und
     dünn — bei gleicher Höhe füllen alle anderen ein Vielfaches der
     Fläche und thronen über der Herde. Also ein Faktor je Volk,
     Reihenfolge wie in TEAMS.

     Sönkes Zahlen vom 11.09.2026 nach dem ersten Blick aufs Gerät:
     Giraffen 10 % kleiner, alle anderen 30 %. Sie stehen hier als
     Anteile von HELD_HOCH und nicht als fertige Kachelmaße, damit
     sich die Grundgröße an EINER Stelle nachregeln lässt. Ein
     neuntes Volk ohne Eintrag bekommt .7 — die Mehrheit. */
  const HELD_SKAL = [.7, .7, .9, .7, .7, .7, .7, .7];

  const BOOT_BREIT = 3.96;
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
  const volkBoot  = n => BOOT_DIR + n + '.png';

  /* ── Die Figur nach Level ────────────────────────────────────
     Vier gezeichnete Fassungen je Volk (Bildstufe 1…4), Level 5 ist
     die vierte mit einem goldenen Filter — kein eigenes fünftes
     Bild (HELD_GOLD_FILTER).

     Sönke, 14.09.2026: „ich bin mit meinem Charakter eigentlich
     Level 2, habe aber immer noch das Sprite von Level 1." Die
     Vorlagen lagen längst da (sprites/crew/<farbe> 1…4 crew.png),
     nur der Zuschnitt fehlte — heldsprites.mjs backt sie jetzt alle
     vier, und deshalb steht der Schalter unten seitdem auf `true`.

     ⚠️ Vier Bilder, FÜNF Level. `heldTier` deckelt bei 4, und das
     ist kein Notbehelf, sondern die Regel: wer Level 5 erreicht,
     bekommt keine neue Gestalt, sondern dieselbe in Gold. Wer hier
     eine fünfte Datei einträgt, muss auch den Filter herausnehmen —
     sonst steht ein goldenes Bild noch einmal unter Gold.

     HELD_LEVEL_BILDER bleibt als Notbremse stehen: auf `false`
     tragen wieder alle Level held/{volk}.png. Der Rückfall je Bild
     (onerror) fängt einzelne fehlende Dateien ohnehin ab — der
     Schalter ist für den Fall, dass der ganze Satz fehlt, denn
     achtmal ins Leere zu greifen ist kein Rückfall mehr, sondern
     eine fehlgeschlagene Anfrage je Aufbau und je Kind.          */
  const HELD_LEVEL_BILDER = true;
  const HELD_STUFEN = 4;
  const heldTier = lvl => Math.min(Math.max(lvl | 0 || 1, 1), HELD_STUFEN);
  const volkBildBasis = n => HELD_DIR + n + '.png';
  const volkBild = (n, lvl) => HELD_LEVEL_BILDER
    ? HELD_DIR + n + '_' + heldTier(lvl) + '.png'
    : volkBildBasis(n);

  /* Der Daumennagel derselben Fassung — derselbe Zuschnitt, nur
     klein (heldsprites.mjs). Sönke, 14.09.2026: „alle Icons in der
     Auswahl [sollen] auf Level 2 gehen." Die Auswahlreihe zeigt
     also nicht acht Anfängerfiguren, sondern acht Figuren auf DEM
     Stand, auf dem man selbst steht — sonst wählte man ein Bild und
     bekäme ein anderes. */
  const volkDaumenBasis = n => HELD_DIR + n + 'k.png';
  const volkDaumen = (n, lvl) => HELD_LEVEL_BILDER
    ? HELD_DIR + n + '_' + heldTier(lvl) + 'k.png'
    : volkDaumenBasis(n);

  const HELD_GOLD_FILTER =
    'sepia(.6) saturate(3.2) hue-rotate(-12deg) brightness(1.12)';
  /* Dasselbe Gold auf einem <img> statt auf der Leinwand. Es steht
     bewusst NICHT ein zweites Mal in der CSS: zwei Goldtöne, die
     auseinanderlaufen, wären an der Figur und an ihrem Daumennagel
     nebeneinander zu sehen. */
  const goldSetzen = (el, an) => { if (el) el.style.filter = an ? HELD_GOLD_FILTER : ''; };
  /* Das eigene Level, wo immer es gerade zu haben ist. Vor dem
     ersten Serverstand gibt es keines — dann ist es 1 und nicht 0:
     die Bildstufen fangen bei 1 an. */
  const meinLevel = () => (solo && solo.player && solo.player.level) || 1;

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
    const lvl = meinLevel();
    const nimm = (pfad, feld, basis) => ladeBild(pfad)
      // Fällt auf das alte einzelne Bild zurück, solange die vier
      // Level-Fassungen noch fehlen — kein Blocker fürs Übrige.
      .catch(() => basis ? ladeBild(basis) : Promise.reject(new Error('Bild fehlt: ' + pfad)))
      .then(im => { if (gen === volkGen && spieler) spieler[feld] = im; })
      .catch(e => {
        /* Ein fehlendes Bild zeichnet still NICHTS — genau die Falle,
           die bei den Schiffen im Raum schon einmal eine Stunde
           gekostet hat. Also sagt es wenigstens die Konsole. */
        console.warn('[wordisland] ' + e.message);
      });
    nimm(volkBild(n, lvl), 'imHeld', volkBildBasis(n));
    nimm(volkBoot(n), 'imBoot');
  }

  /* Figur und Schiff aufstellen. Gerufen aus soloBuild, NACH den
     Inseln: beide brauchen die Hauptinsel — die eine, um darauf zu
     laufen, das andere, um sie zu umrunden. */
  function spielerAufstellen() {
    const insel = welt.inseln[0];
    const p = zufallsPunktAuf(insel, Math.random);
    const volk = volkAusStand();
    let R = 0;
    for (const z of insel.cells) {
      R = Math.max(R, Math.hypot(z.x - insel.cx, z.y - insel.cy));
    }
    spieler = {
      volk,
      imHeld: null, imBoot: null,
      held: {
        x: p.x, y: p.y, zx: p.x, zy: p.y,
        flip: false, ruheBis: 0, held: true, stufe: 0, _a: 1, _hell: false,
        // Nur für den Funkenkranz eines Level-Aufstiegs gebraucht (die
        // Jubel-Passage im Zeichenschritt liest bei JEDEM Tier farbe
        // und phase) — die Volksfarbe, nicht die einer Vokabel.
        farbe: volk % FARBEN.length, phase: 0, burst: 0
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
    const hoch = HELD_HOCH * (HELD_SKAL[spieler.volk] || .7) * P;
    const breit = hoch * (im.width / im.height);
    const gy = bodenY(h.x, h.y);
    const px = sxp(h.x), py = syp(h.y + gy);
    h._im = im;
    h._w = breit; h._h = hoch;
    h._x = px - breit / 2; h._y = py - hoch;
    h._px = px; h._by = py;
    h._mx = px; h._my = py - hoch / 2;
    // Level 5 malt Stufe 4 mit einem goldenen Filter statt einem
    // eigenen fünften Bild (siehe HELD_GOLD_FILTER).
    h._gold = meinLevel() >= 5;
    // Der Funkenkranz eines Level-Aufstiegs (feierSpielerStart) —
    // zeitgestempelt statt gezählt, damit hier kein dt gebraucht wird.
    if (h.burstAt != null) {
      const dauer = h._burstDauer || 1.2;
      h.burst = Math.max(0, 1 - (simZeit - h.burstAt) / dauer);
      if (h.burst <= 0) h.burstAt = null;
    }
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

  /* ⚠️ ─── Der Klick, der HINTERHERKOMMT ──────────────────────
     Was auf der Insel aufgeht, geht beim LOSLASSEN auf (siehe oben:
     vorher weiß niemand, ob aus dem Tipp ein Ziehen wird). Der
     Browser ist damit aber noch nicht fertig: nach `pointerup`
     schickt er an DERSELBEN Bildschirmstelle noch die nachgereichten
     Maus-Ereignisse hinterher — auf dem Tablet ist das der übliche
     Weg, mit dem ein Tipp zum Klick wird. Getroffen wird dabei, was
     dort JETZT liegt, und das ist der Kasten, der gerade erschienen
     ist.

     Sönkes Meldung vom 11.09.2026: „wenn ich auf meine Figur klicke,
     wird das Volk gewählt, was genau an dieser Position ist." Genau
     das. Ein Tipp auf die eigene Figur macht den Kasten auf UND
     drückt den Knopf darunter; beim Echsen-Kärtchen fällt dasselbe
     als „geht auf und sofort wieder zu" auf.

     Was gerade von der Insel aus aufgegangen ist, hört deshalb einen
     Moment lang nicht zu. Es ist EIN Zeitstempel für alle drei
     Griffe, die unter dem Finger erscheinen können (die acht
     Völker, der Schließer, der Grund neben dem Kasten) und für das
     Schließkreuz des Kärtchens — ein Tipp, eine Sperre.

     ⚠️ Zwei naheliegende Griffe, die hier NICHT stehen:
     • `pointer-events: none` auf dem Kasten macht ihn nicht taub,
       sondern DURCHSICHTIG — der Klick landete auf der Insel
       dahinter, und der Zeiger-Buchführung von soloPanZoom (`pts`)
       fehlte das Loslassen zu einem gezählten Aufsetzen.
     • Ein Schlucker in der EINFANG-Phase an der Wurzel des Kastens
       wäre im Browser richtig, aber der Prüfstand kann ihn nicht
       sehen: linkedom kennt die Einfang-Phase nicht und ruft solche
       Zuhörer NACH dem Knopf. Ein grüner Prüfstand bei kaputtem
       Gerät ist schlimmer als gar keiner — also fragt jeder
       betroffene Zuhörer selbst.

     450 ms: der nachgereichte Klick kommt innerhalb von 300 ms. Wer
     in dieser Zeit absichtlich auf einen Knopf zielt, tippt ihn eben
     ein zweites Mal. */
  const NACHKLICK_MS = 450;
  let nachklickBis = 0;
  const nachklickSperren = () => { nachklickBis = performance.now() + NACHKLICK_MS; };
  const nachklick = () => performance.now() < nachklickBis;

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
  function wachSchluessel(stufe, v2, v3) {
    if (stufe === 0) return 'ei';
    if (stufe === 1) return 's1';
    if (stufe === 2) return 's2' + (v2 || '');
    const v = v3 || 'a';
    /* Seit 13.09.2026 hat die oberste Stufe ihre EIGENE Zeichnung —
       zu jeder der fünf ausgewachsenen Fassungen gehört eine
       funkelnde mit demselben Buchstaben. Vorher trug sie das Bild
       der Stufe 3 und unterschied sich nur durch Funken; genau
       deshalb hat Sönke sie „gar nicht erkannt".

       Fehlt das Bild (ältere Auslieferung, Ordner nicht mit
       hochgeladen), bleibt das der Stufe 3 stehen: ein kleineres
       Tier ist eine Ungenauigkeit, ein leeres Feld wäre ein Fehler. */
    if (stufe >= 4 && ECHSE.bilder['s4' + v]) return 's4' + v;
    return 's3' + v;
  }

  function schluesselFuer(t) {
    const k = wachSchluessel(t.stufe, t.v2, t.v3);
    if (t.zustand === 'schlafen' && t.stufe > 0) return k + 'z';
    /* Das dritte Bild der Schwimmerin. Es hängt am ORT und nicht am
       Zustand: sie trägt es, solange kein Feld unter ihr liegt —
       auch auf dem Weg zum Schlafplatz, solange der noch über dem
       Meer verläuft. */
    return treibt(t) ? k + 's' : k;
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

  /* Die Glitzersterne der obersten Stufe (13.09.2026). Drei Stück je
     Tier, die NACHEINANDER aufblitzen — gleichzeitig sähe es aus wie
     ein Blinklicht, versetzt sieht es aus wie ein Reflex, der über
     das Tier wandert.

     Die Plätze stehen fest (aus der Phase des Tieres gewürfelt) und
     wandern nicht mit der Zeit: ein Stern, der auch noch herumläuft,
     ist ein Funke — und die gibt es eine Zeile weiter oben schon.
     Erwartet wird `lighter` als Mischart; gesetzt hat sie der Aufrufer. */
  function glitzerMalen(t, gl) {
    const H = t._h;
    for (let k = 0; k < GLITZER; k++) {
      const eigen = t.phase * 1.7 + k * 2.3994;
      const q = ((simZeit / GLITZER_SEK + k / GLITZER + t.phase) % 1 + 1) % 1;
      // Ein kurzes Aufblitzen und ein langes Nichts: hoch potenziert
      // steht der Stern die meiste Zeit gar nicht da.
      const auf = Math.pow(Math.max(0, Math.sin(q * Math.PI)), 3);
      if (auf < .02) continue;
      const gx = t._mx + Math.cos(eigen * 2.7) * t._w * .30;
      const gy = t._my + Math.sin(eigen * 3.3) * H * .28;
      const gr = H * GLITZER_GROSS * (.5 + .5 * auf);
      c2d.globalAlpha = Math.min(1, gl * auf * .95 * t._a);
      c2d.drawImage(glitzer, gx - gr / 2, gy - gr / 2, gr, gr);
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
      t._y = py + (m.y - ANKER_Y[schl]) * e + wob;
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
      // Level 5: dasselbe Bild wie Level 4, nur golden — siehe
      // HELD_GOLD_FILTER (heldMasse setzt t._gold nur für die Figur).
      if (t._gold) c2d.filter = HELD_GOLD_FILTER;
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
      if (t._gold) c2d.filter = 'none';
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
      c2d.globalAlpha = 1;
      c2d.globalCompositeOperation = 'source-over';
    }

    /* 6 · Die Funken. Sie gehören nicht nur zur Stufe 4: schon ein
           geschlüpftes Tier lässt zwei Fünkchen steigen, und mit
           jeder Stufe werden es mehr — dadurch liest sich der
           Fortschritt nicht nur an der Helligkeit ab, sondern auch
           an der Betriebsamkeit.

           ⚠️ Dieser Block stand bis 13.09.2026 IM Nacht-Block und
           war damit vier Zehntel jedes Umlaufs lang gar nicht da.
           Für die Stufen 1–3 ist das richtig (ihr Funkeln ist die
           Nacht-Auskunft), für die oberste war es der Grund, warum
           man sie „gar nicht erkennt": am Tag funkelte nichts.
           Jetzt hat jedes Tier seinen eigenen Wert — die oberste
           Stufe mindestens FUNKEL_TAG, alle anderen den der Nacht.

           Aufgesetzt wird die Bewegung auf die Zeit und nicht
           gespeichert: fünfhundert Tiere mal acht Funken wären
           viertausend Kleinteile, die verwaltet werden wollen —
           gerechnet kosten sie eine Zeile. */
    let funkelt = glow > .01;
    if (!funkelt) {
      for (const t of zuMalen) if (t.stufe >= 4) { funkelt = true; break; }
    }
    if (funkelt) {
      c2d.globalCompositeOperation = 'lighter';
      for (const t of zuMalen) {
        const n = FUNKEN[t.stufe];
        if (!n) continue;
        const oben = t.stufe >= 4;
        // Die oberste Stufe funkelt auch bei Sonne; darunter ist das
        // Funkeln eine Nacht-Auskunft und bleibt es.
        const gl = oben ? Math.max(glow, FUNKEL_TAG) : glow;
        if (gl <= .01) continue;
        const H = t._h, spark = funken[t.farbe];
        for (let k = 0; k < n; k++) {
          const eigen = t.phase + k * 2.3994;              // goldener Winkel
          const dauer = 2.2 + (k % 3) * .55;
          const u = ((simZeit / dauer + eigen) % 1 + 1) % 1;
          const fx = t._mx + Math.sin(eigen * 3.1 + u * 3.4) * H * (oben ? .42 : .30);
          const fy = t._my + H * (.22 - 1.15 * u);
          const auf = Math.sin(u * Math.PI);
          const flackern = .55 + .45 * Math.sin(simZeit * 5.3 + eigen * 7);
          const fs = H * (.20 - .09 * u) * (.7 + .3 * auf) * (oben ? FUNKEL_GROSS : 1);
          c2d.globalAlpha = Math.min(1, gl * auf * flackern * t._a * (oben ? .95 : .62));
          c2d.drawImage(spark, fx - fs / 2, fy - fs / 2, fs, fs);
          if (oben) {
            const ws = fs * .55;
            c2d.drawImage(funke, fx - ws / 2, fy - ws / 2, ws, ws);
          }
        }
        /* Und die Glitzersterne auf dem Tier selbst. Sie sind der
           Teil, den man aus der Übersicht heraus erkennt: die Funken
           steigen auf und sind dabei klein, ein Stern sitzt auf dem
           Tier und blitzt. */
        if (oben) glitzerMalen(t, gl);
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

      <!-- Das eigene Level stand bis 13.09.2026 als Balken hier
           oben links — also genau dort, wo auch die Unit-Leiste
           beginnt, und die deckte ihn zu. Es sitzt jetzt als drei
           Kreise unten im Knopf-Kasten (siehe .wi-lvl dort). -->

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

      <!-- Der Kasten unten. Er war vom 10.09. bis zum 13.09.2026 nur
           so breit wie seine zwei Knöpfe und steht seit Sönkes
           Vorgabe „so dass das auf die volle Breite kommt" wieder
           über die ganze Breite — denn links in ihm wohnen jetzt die
           drei Level-Kreise, und die brauchen den Platz. Die
           Unit-Leiste endet dafür wieder ÜBER ihm (tool.css). -->
      <header class="wi-sbar" data-part="sbar">
        <!-- ── Das eigene Level: drei Kreise ───────────────────────
             Sönke, 13.09.2026: „3 Kreise. 1. Kreis ist das Leben
             [Level] einfach eine Zahl in einem coolen Kreis. 2. Kreis
             […] die durchschnittliche Spielzeit der letzten 7 Tage
             […] der Kreis ist gefüllt bis zu dem Punkt bis zum
             nächsten Level (Kreis ganz voll = nächstes Level). Kreis
             drei beinhaltet die heute Spielzeit."

             Die ganze Leiter über alle fünf Level gibt es weiter —
             aber im Kasten „Wer bist du?" (.wi-vbar), wo Platz für
             die Zeiten an den Grenzen ist. Hier unten steht nur, was
             ein Kind während des Übens wissen will: wo bin ich, wie
             weit ist das nächste Level, und was habe ich heute
             getan. Jeder der drei Kreise öffnet denselben Kasten.

             Ring 2 und 3 messen dasselbe und auf derselben Skala —
             dem Abschnitt des aktuellen Levels. Nur so sind sie
             vergleichbar: steht „Heute" voller als „Ø", zieht der
             Schnitt an. Dieselbe Aussage wie die zwei Zeiger am
             großen Balken. -->
        <div class="wi-lvl" data-part="lvl" hidden>
          <button type="button" class="wi-lvlc" data-part="lvlbtn" aria-label="Dein Level">
            <span class="wi-lvlring wi-lvlring--lvl">
              <b class="wi-lvlnum" data-part="lvlnum"></b>
              <i class="wi-lvlcrown" data-part="lvlcrown" hidden aria-hidden="true">👑</i>
            </span>
            <span class="wi-lvllab">Level</span>
          </button>

          <button type="button" class="wi-lvlc" data-part="avgbtn"
                  aria-label="Schnitt der letzten 7 Tage">
            <span class="wi-lvlring" data-part="avgring" role="progressbar"
                  aria-valuemin="0" aria-valuemax="100">
              <!-- Der Ring als SVG und nicht als conic-gradient: ein
                   Bogen aus zwei Zahlen (Länge, Versatz) ist
                   nachrechenbar, und der Bonus braucht einen zweiten
                   Bogen, der genau dort ansetzt, wo der erste endet. -->
              <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">
                <circle class="wi-lvltrack" cx="22" cy="22" r="19"></circle>
                <circle class="wi-lvlbonus" data-part="avgbonus" cx="22" cy="22" r="19"></circle>
                <circle class="wi-lvlarc" data-part="avgarc" cx="22" cy="22" r="19"></circle>
              </svg>
              <b class="wi-lvlnum" data-part="avgnum"></b>
            </span>
            <span class="wi-lvllab">Ø</span>
          </button>

          <button type="button" class="wi-lvlc" data-part="todaybtn"
                  aria-label="Heute gelernt">
            <span class="wi-lvlring wi-lvlring--heute">
              <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">
                <circle class="wi-lvltrack" cx="22" cy="22" r="19"></circle>
                <circle class="wi-lvlarc" data-part="todayarc" cx="22" cy="22" r="19"></circle>
              </svg>
              <b class="wi-lvlnum" data-part="lvltoday"></b>
            </span>
            <span class="wi-lvllab">heute</span>
          </button>

          <div class="wi-lvltoast" data-part="lvltoast" hidden></div>
        </div>

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
           die Figur das, was man ist. Das Schiff ändert sich mit.

           Seit 13.09.2026 geht es hier um das, was man ERREICHT hat,
           und nicht mehr ums Umziehen: die acht Völker sind in ihren
           eigenen Kasten gezogen (volkwov), erreichbar über das
           kleine Zeichen an der Figur. Sönke: „in der Charakter-
           Ansicht geht es in erster Linie um die ganzen States,
           welche man erreicht hat." -->
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
              <!-- Der Weg zum Umziehen. Er sitzt AN der Figur, weil
                   er sie meint — ein Knopf in einer Knopfreihe wäre
                   ein zweiter Hauptgegenstand in einem Kasten, der
                   von Erreichtem handeln soll. -->
              <button type="button" class="wi-vswap" data-part="vswap"
                      aria-label="Volk wechseln" title="Volk wechseln">⇄</button>
            </div>

            <!-- ── Das eigene Level, ausführlich ──────────────────
                 Hier und nicht im Balken oben: der Balken oben zeigt
                 den Augenblick, das hier zeigt die Woche. Die
                 Historie wird erst geladen, wenn der Kasten wirklich
                 aufgeht (wi_solo_level_history) — beim Üben braucht
                 sie niemand. -->
            <div class="wi-vlvl" data-part="vlvl"></div>
            <!-- Dieselbe Leiter wie oben, nur groß: mit den Zeiten an
                 den Grenzen, dem heutigen Stand und dem Schnitt, der
                 über das Level entscheidet. -->
            <div class="wi-vbar" data-part="vbar"></div>
            <div class="wi-vhist" data-part="vhist" hidden>
              <span class="wi-modelab">Deine Woche</span>
              <div class="wi-vdays" data-part="vdays"></div>
              <p class="wi-vweak" data-part="vweak"></p>
              <div class="wi-vtot" data-part="vtot"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Volk wechseln ──────────────────────────────────────
           Der zweite Kasten liegt ÜBER dem ersten (er steht später
           im DOM) und macht ihn nicht zu: wer sein Volk gewählt hat,
           ist wieder da, wo er hergekommen ist. -->
      <div class="wi-ov" data-part="volkwov" hidden>
        <div class="wi-ovbox wi-ovbox--volk">
          <div class="wi-ovhead">
            <span class="wi-ovtitle">Zu welchem Volk gehörst du?</span>
            <button type="button" class="wi-ovclose" data-part="volkwclose" aria-label="Schließen">×</button>
          </div>
          <div class="wi-ovbody">
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
            <!-- Die Uhr. Sönke, 13.09.2026: „ich hätte gerne eine
                 Anzeige, wie lange ich schon lerne … die hochzählt,
                 wenn ich aktiv lerne, und stoppt, wenn ich nichts
                 mache. Ein ehrlicher Hinweis."

                 Sie zeigt die HEUTIGE Lernzeit und damit dieselbe
                 Zahl wie der dritte Kreis unten — nur lebendig.
                 Zwei verschiedene Lernzeiten nebeneinander (heute /
                 diese Sitzung) wären eine Frage, die sich niemand
                 stellen sollte. Warum sie ehrlich ist und wann sie
                 stehen bleibt, steht bei zeigeUhr in tool.js.

                 Kein Knopf: ein anklickbares Ding in der Kopfzeile
                 nähme beim Üben den Fokus vom Antwortfeld, und auf
                 dem iPad heißt das, dass die Tastatur zufährt. -->
            <span class="wi-puhr" data-part="puhr" hidden>
              <i class="wi-puhrdot" aria-hidden="true"></i>
              <span class="wi-puhrlab">heute</span>
              <b class="wi-puhrnum" data-part="puhrnum">0:00</b>
            </span>
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

      <!-- ── Der eigene Aufstieg ─────────────────────────────────
           Sönke, 14.09.2026: „Level-up des Charakters funktioniert
           nicht. Hier muss das Spiel kurz unterbrochen werden und ich
           sehe, wie mein Charakter das nächste Level erreicht. Also
           da steht dann Level 2, das neue Sprite wird geladen."

           Bis dahin lief der Aufstieg NEBENHER — ein Banner über den
           Kreisen unten. Und das war genau die falsche Entscheidung,
           aus demselben Grund, aus dem der Stufensprung des Tieres
           eine eigene Bühne bekommen hat: beim Tippen steht auf dem
           Tablet die Tastatur, die Kreise liegen unter dem
           Übungskasten, und das Banner blitzte dort auf, wo in diesem
           Moment niemand hinsieht. Ein Erfolg, der vier Level lang
           auf sich warten lässt, darf nicht am Rand stattfinden.

           Eigener Kasten und nicht die Tier-Bühne: die Tier-Bühne ist
           eine Leinwand mit einem gezeichneten Tier darauf, hier
           steht ein Bild der Figur. Und beide können in derselben
           Antwort vorkommen — dann läuft erst das Tier, dann die
           Figur (siehe soloSend). -->
      <div class="wi-lvup" data-part="lvup" hidden>
        <div class="wi-lvup__rays" aria-hidden="true"></div>
        <div class="wi-lvup__box">
          <span class="wi-lvup__kicker">Level geschafft</span>
          <div class="wi-lvup__fig">
            <!-- Das Bild der Figur. Welches, entscheidet volkBild —
                 sobald die vier Level-Fassungen liegen, wechselt es
                 hier mitten in der Feier (siehe lvupSprung). -->
            <img class="wi-lvup__held" data-part="lvupimg" alt="" />
            <b class="wi-lvup__badge" data-part="lvupnum"></b>
          </div>
          <b class="wi-lvup__title" data-part="lvuptitle"></b>
          <span class="wi-lvup__sub" data-part="lvupsub"></span>
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
  /* Welche Unit auf- und welche zugeklappt ist, je Unit-Nummer.
     Eine Unit ohne Eintrag hat noch niemand angefasst und folgt der
     Voreinstellung (siehe unitAufgeklappt). */
  const WI_UKLAPP_KEY = 'mpskills.wordisland.unitklapp';

  const SOLO_DIR = [
    ['mixed', 'gemischt'], ['de_en', 'Deutsch → Englisch'], ['en_de', 'Englisch → Deutsch']
  ];
  const SOLO_MODE = [['type', 'tippen'], ['choice', 'auswählen']];
  /* ─── Wie eine Stufe heißt ──────────────────────────────────
     ⚠️ Der Index ist die Zahl des SERVERS (0…4). Auf dem Schirm
     steht eine Stufe HÖHER — Sönke, 13.09.2026: „Schüler fangen mit
     0 an zu zählen :D". Die oberste ist damit Stufe 5, und genau so
     steht sie auch im Satz über die Bonus-Zeit.

     Umgerechnet wird ausschließlich hier. Zwei Zahlen für dieselbe
     Sache sind eine zu viel: wer im Quelltext `stufe === 4` liest,
     soll nicht überlegen müssen, welche gemeint ist.

     ⚠️ Am Tier steht nur noch die ZAHL — Sönke, 14.09.2026: „Bei den
     Echsen steht jetzt ‚Level 4 ausgewachsen', schreibe nur Level 4,
     das reicht." Und er hat recht: neben dem Tier ist der Name
     überflüssig, weil das Bild ihn schon sagt. Ein Ei sieht aus wie
     ein Ei.

     Der Name bleibt genau an EINER Stelle stehen: im Tooltip der
     Stufenlegende (stufeLang). Dort stehen farbige Punkte ohne Bild
     daneben, und ein Punkt, der nur „Stufe 4" sagt, erklärt seine
     Farbe nicht. */
  const STUFEN_NAME = ['Ei', 'geschlüpft', 'gewachsen', 'ausgewachsen', 'funkelnd'];
  const STUFE_HOCH = STUFEN_NAME.length;      // die oberste, wie sie dasteht: 5
  const stufeZahl = s => Math.max(0, Math.min(4, s | 0)) + 1;
  const stufeText = s => 'Stufe ' + stufeZahl(s);
  const stufeLang = s => stufeText(s) + ' · ' + STUFEN_NAME[stufeZahl(s) - 1];

  function buildSolo() {
    root.innerHTML = SOLO_HTML;
    // Frischer Kasten, frischer Balken: der leere Balken im neuen
    // DOM und ein stehengebliebener Rundenstand aus dem alten wären
    // sonst uneins, und der erste Sprung liefe als Bewegung ab.
    rundeNo = 0; rundePct = 0;
    // Die Uhr gehört zu EINER Insel: ein neues Kind am selben Gerät
    // erbt keine Lernzeit.
    uhrBasis = 0; uhrAb = 0; uhrLauf(false);
    els = {
      stage: q('stage'), mapwrap2: q('mapwrap2'), map: q('map'),
      veil: q('veil'), cvs: q('cvs'), load: q('load'), loadTxt: q('loadtxt'),
      sWords: q('swords'), sLegend: q('slegend'),
      units: q('units'), uGriff: q('ugriff'), uBody: q('ubody'),
      uList: q('ulist'), uDet: q('udet'), card: q('card'), sBar: q('sbar'),
      setsOv: q('setsov'),
      lvl: q('lvl'), lvlBtn: q('lvlbtn'), lvlNum: q('lvlnum'),
      lvlCrown: q('lvlcrown'),
      avgRing: q('avgring'), avgArc: q('avgarc'), avgBonus: q('avgbonus'),
      avgNum: q('avgnum'), todayArc: q('todayarc'),
      lvlToday: q('lvltoday'), lvlToast: q('lvltoast'),
      volkOv: q('volkov'), vBig: q('vbig'), vName: q('vname'),
      vSub: q('vsub'), vSwap: q('vswap'),
      volkWOv: q('volkwov'), vRow: q('vrow'), vHint: q('vhint'),
      vLvl: q('vlvl'), vBar: q('vbar'), vHist: q('vhist'),
      vDays: q('vdays'), vWeak: q('vweak'), vTot: q('vtot'),
      soloDir: q('solodir'), soloMode: q('solomode'), modeHint: q('modehint'),
      playOv: q('playov'), pMeta: q('pmeta'), pMon: q('pmon'),
      pProg: q('pprog'), pProgI: q('pprogi'), pProgN: q('pprogn'),
      pCvs: q('pcvs'), pStage: q('pstage'),
      pInfo: q('pinfo'), pStats: q('pstats'),
      pDir: q('pdir'), pDelta: q('pdelta'),
      cheer: q('cheer'), cCvs: q('ccvs'),
      lvup: q('lvup'), lvupImg: q('lvupimg'), lvupNum: q('lvupnum'),
      lvupTitle: q('lvuptitle'), lvupSub: q('lvupsub'),
      pLevel: q('plevel'), pLevelB: q('plevelb'), pLevelS: q('plevels'),
      pTon: q('pton'), pUhr: q('puhr'), pUhrNum: q('puhrnum'),
      pWord: q('pword'), pForm: q('pform'), pIn: q('pin'),
      pOpts: q('popts'), pFb: q('pfb')
    };

    q('ssets').addEventListener('click', () => { els.setsOv.hidden = false; renderSoloSets(); });
    q('setsclose').addEventListener('click', () => { els.setsOv.hidden = true; });
    /* Derselbe Kasten wie beim Tipp auf die Figur — die Kreise sind
       nur ein zweiter Weg dorthin. Der Horcher hängt an der GRUPPE
       und nicht an den drei Knöpfen: welchen der drei man antippt,
       ändert nichts am Ziel. */
    if (els.lvl) els.lvl.addEventListener('click', () => volkOeffnen());
    q('volkclose').addEventListener('click', () => {
      if (nachklick()) return;
      els.volkOv.hidden = true;
    });
    /* Das Zeichen an der Figur. Auch hier der nachgereichte Klick:
       der Kasten geht beim Loslassen auf, und das Zeichen sitzt mitten
       im Bild — also genau dort, wo der Finger gerade war. */
    els.vSwap.addEventListener('click', () => {
      if (nachklick()) return;
      volkWechselOeffnen();
    });
    q('volkwclose').addEventListener('click', () => { els.volkWOv.hidden = true; });
    // Am umschließenden Kasten und nicht an den acht Knöpfen: die
    // Reihe wird bei jeder Wahl neu geschrieben.
    els.vRow.addEventListener('click', e => {
      // Der Klick, der dem Tipp auf die Figur hinterherkommt —
      // siehe nachklickSperren. Er zeigt auf den Knopf, der hier
      // gerade erschienen ist, und meint ihn nicht.
      if (nachklick()) return;
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
      clearTimeout(lvupT);
      feierWeiter = null;
      feiernd = false;
      lvupZu();
      zeigeStats(false);
      zeigeDelta(0);
      kartHalt();
      // Die Uhr läuft nur, solange man sie sehen kann. Der Stand
      // bleibt stehen, wo er ist — beim nächsten Öffnen geht es von
      // dort weiter.
      uhrLauf(false);
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

    /* Die Level-Feier lässt sich wegtippen. Anders als die Tier-
       Bühne (eine gute Sekunde, da gibt es nichts zu entscheiden)
       dauert sie rund drei — und wer zum zweiten Mal aufsteigt, hat
       sie schon gesehen.

       Aber erst NACH dem Sprung: ein Tipp, der sie in der ersten
       halben Sekunde wegnimmt, zeigt nur die alte Zahl und nimmt
       genau das weg, wofür sie da ist. Und der Tipp, mit dem eben
       die Antwort abgeschickt wurde, kommt manchmal noch hinterher
       (Regel: feedback_pointerup_opens_ghost_click) — beides deckt
       dieselbe Sperre ab. */
    if (els.lvup) els.lvup.addEventListener('click', () => {
      if (!lvupAb || performance.now() - lvupAb < LVUP_SPRUNG + 260) return;
      if (feierWeiter) feierWeiter();
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
    for (const ov of [els.setsOv, els.playOv, els.volkOv, els.volkWOv]) {
      ov.addEventListener('click', e => {
        // Nur der Volks-Kasten geht von der Insel aus auf; der
        // nachgereichte Klick trifft bei ihm den Grund genauso oft
        // wie einen Knopf. Die beiden anderen hängen an einem
        // Knopf und kennen das Problem nicht.
        if (ov === els.volkOv && nachklick()) return;
        if (e.target === ov) ov.hidden = true;
      });
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
      // Auch hier der nachgereichte Klick: das Kärtchen erscheint
      // unten rechts, und wer dort eine Echse antippt, drückt sonst
      // sein eigenes Schließkreuz.
      if (nachklick()) return;
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
      player: v.learner.player || null,
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
       steht immer, der erste Satellit auch (Schwelle 0) — die
       beiden anderen kommen mit dem Wortschatz. */
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
         dastehen, während die Satelliten leer sind — im Spiel ist
         das richtig (wer aufsteigt, hebt dort ab, wo er steht), beim
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
    renderLevel();
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
      `<span class="wi-lg wi-lg--${s}" title="${esc(stufeLang(s))}">
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
     Der Kasten hinter der Figur. Er zeigt sie groß, darunter die
     acht Völker zur Wahl — und seit 0145 das eigene Level: Name und
     Krone sofort, die Woche und die Gesamtstatistik erst, wenn der
     Kasten wirklich aufgeht (wi_solo_level_history, siehe unten). */
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
    ladeVolkHistorie();
    /* Der Tipp auf die Figur ist noch nicht zu Ende — siehe
       nachklickSperren. Ohne diese Zeile wählt er das Volk, dessen
       Knopf zufällig unter dem Finger erscheint. */
    nachklickSperren();
  }

  /* Der Kasten mit den acht Völkern. Er geht ÜBER dem „Wer bist
     du?"-Kasten auf und lässt ihn stehen — das Umziehen ist ein
     Abstecher und kein anderer Ort. */
  function volkWechselOeffnen() {
    if (!spieler || !els.volkWOv) return;
    els.volkWOv.hidden = false;
    renderVolkReihe();
  }

  function renderVolk() {
    if (!spieler || !els.volkOv || els.volkOv.hidden) return;
    const n = spieler.volk;
    const lvl = meinLevel();
    els.vBig.src = volkBild(n, lvl);
    els.vBig.onerror = () => { els.vBig.onerror = null; els.vBig.src = volkBildBasis(n); };
    els.vBig.alt = volkName(n);
    // Level 5 trägt kein eigenes Bild, sondern Gold (HELD_GOLD_FILTER)
    // — hier wie auf der Insel und wie in der Auswahlreihe.
    goldSetzen(els.vBig, lvl >= 5);
    els.vName.textContent = volkName(n);
    els.vSub.textContent = 'Deine Figur läuft über die Insel, dein Schiff fährt davor.';

    /* Die acht Knöpfe werden hier NICHT geschrieben: sie stehen im
       Wechsel-Kasten, und der schreibt sie sich beim Aufgehen selbst.
       Acht Bilder in einem Kasten vorzuhalten, den die meisten nie
       öffnen, ist Ladezeit für nichts. */
    renderVolkLevel();
  }

  function renderVolkReihe() {
    if (!spieler || !els.vRow) return;
    const n = spieler.volk;
    const lvl = meinLevel();
    /* Die Reihe zeigt die FIGUR jedes Volkes und nicht sein Wappen:
       gewählt wird, wer man ist. Der Daumennagel ist derselbe
       Zuschnitt, nur klein (heldsprites.mjs) — also genau das Bild,
       das man danach auf der Insel wiederfindet. Und zwar auf dem
       EIGENEN Stand: acht Figuren auf Level 2, wenn man Level 2 ist
       (Sönke, 14.09.2026). Das eigene Level ist nichts, was man mit
       dem Volk verliert — es hängt am Kind, nicht an der Fahne.

       Der Rückfall steht am Bild und nicht am Aufruf: fehlt eine
       einzelne Fassung, soll genau dieser eine Knopf die Grundfigur
       zeigen und nicht die ganze Reihe. */
    const goldStil = lvl >= 5 ? ` style="filter:${HELD_GOLD_FILTER}"` : '';
    els.vRow.innerHTML = TEAMS.map((t, i) =>
      `<button type="button" class="wi-vbtn${i === n ? ' is-on' : ''}" data-v="${i}"
               style="--vf:${t.color}" aria-pressed="${i === n}">
         <img src="${esc(volkDaumen(i, lvl))}" alt="" loading="lazy"${goldStil}
              data-basis="${esc(volkDaumenBasis(i))}" />
         <span>${esc(t.name)}</span>
       </button>`).join('');
    els.vRow.querySelectorAll('img[data-basis]').forEach(im => {
      im.onerror = () => { im.onerror = null; im.src = im.getAttribute('data-basis'); };
    });

    /* „Gemerkt" und „nur hier gemerkt" dürfen nie gleich aussehen.
       Fehlt Migration 0143, funktioniert die Wahl trotzdem — sie
       bleibt dann aber an diesem Gerät, und das steht dann da. */
    els.vHint.hidden = !volkNurHier;
    els.vHint.textContent = volkNurHier
      ? 'Dein Volk merkt sich gerade nur dieses Gerät — in der Datenbank fehlt die neueste Migration.'
      : '';
  }

  /* ─── Das eigene Level, im „Wer bist du?"-Kasten ────────────
     Name, Krone und die drei Stellgrößen (Schnitt, Bonus, die
     nächste bzw. die verlorene Grenze) — dieselben Zahlen wie im
     Balken oben, nur ausgeschrieben statt gemalt. */
  const LEVEL_NAME = ['', 'Anfänger', 'Lernende', 'Geübt', 'Erfahren', 'Meister'];

  function minSek(sekunden) {
    const s = Math.max(0, Math.round(sekunden || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + String(r).padStart(2, '0') + ' min';
  }
  // Dieselbe Zahl ohne die Einheit — für die sieben Tagesbalken und
  // die vier Grenzen, wo „min" siebenmal nebeneinander stünde.
  const minSekKurz = s => minSek(s).replace(' min', '');

  /* ══════════════════════════════════════════════════════════
     DIE LEITER DER FÜNF LEVEL
     ══════════════════════════════════════════════════════════
     Der Server (0145) schickt nur die ZWEI Grenzen des Levels, in
     dem man gerade steht (up_secs/down_secs) — er braucht nicht
     mehr. Ein Balken über alle fünf Level braucht alle vier, und
     hier ist die einzige Stelle, an der die Tabelle aus der
     Migration ein zweites Mal steht.

     ⚠️ Die Grenzen sind NICHT symmetrisch: zwischen Aufstiegs- und
     Abstiegsgrenze liegt der Puffer (0145 „schnell rauf, langsam
     runter"). Für jemanden auf Level 3 liegt die Grenze nach oben
     bei 7:00, die nach unten aber bei 3:00 und nicht bei 5:00. Die
     Striche WANDERN deshalb, sobald man auf- oder absteigt — genau
     das soll man sehen (Sönke, 13.09.2026).

     Und es geht auf: der Abschnitt, in dem der eigene Strich steht,
     ist immer genau das Level, das wi_solo_level_calc rechnet —
     auch über mehrere Stufen hinweg (die Kaskade in
     wi_solo_level_refresh benutzt dieselben Zahlen). */
  const LVL_AUF = [null, 120, 300, 420, 600, null];   // Index = Level
  const LVL_AB  = [null, null, 60, 180, 360, 480];    // Index = Level
  /* Das Ende der Skala: die höchste Schwelle (10:00 = Level 5) plus
     zwei Minuten Luft. Ohne die Luft wäre Level 5 ein Strich am Rand
     und kein Abschnitt, in dem man stehen kann. Die Skala ist fest
     und nicht mitwandernd: nur so bedeutet eine Länge auf diesem
     Balken morgen dasselbe wie heute. */
  const LVL_ENDE = 720;

  function lvlGrenzen(p) {
    const lvl = Math.max(1, Math.min(5, p.level || 1));
    const g = [];
    for (let k = 1; k <= 4; k++) g.push(k >= lvl ? LVL_AUF[k] : LVL_AB[k + 1]);
    /* Über die zwei Grenzen, die er selbst schickt, hat der Server
       das letzte Wort. Ändert eine spätere Migration die Schwellen,
       stimmt wenigstens die eigene Nachbarschaft sofort — und die
       ist die, an der man ablesen will, was noch fehlt. */
    if (lvl <= 4 && p.up_secs   != null) g[lvl - 1] = p.up_secs;
    if (lvl >= 2 && p.down_secs != null) g[lvl - 2] = p.down_secs;
    for (let k = 1; k < 4; k++) if (g[k] < g[k - 1]) g[k] = g[k - 1];
    return g;
  }

  /* Alles, was Leiter und Kreise brauchen — einmal gerechnet: die
     vier Grenzen, die fünf Abschnitte in Prozent und der eigene
     Stand mit und ohne Bonus.

     Der heutige Tag stand hier bis zum 13.09.2026 als eigene
     Position mit drin; er hat auf dieser Skala keinen Platz mehr
     (siehe renderVolkBalken). Der Ring unten rechnet ihn selbst und
     gegen eine andere Bezugsgröße — die Grenze zum nächsten Level. */
  function lvlLeiter(p) {
    const g = lvlGrenzen(p);
    const ende = Math.max(LVL_ENDE, g[3] + 60);
    const pos = s => Math.max(0, Math.min(100, 100 * Math.max(0, s || 0) / ende));
    const abschnitte = [];
    for (let k = 1; k <= 5; k++) {
      const von = k === 1 ? 0 : g[k - 2];
      const bis = k === 5 ? ende : g[k - 1];
      abschnitte.push({ k, von, bis, links: pos(von), breite: pos(bis) - pos(von) });
    }
    const avg = p.avg_secs || 0, bonus = p.bonus_secs || 0;
    return {
      g, ende, pos, abschnitte,
      lvl: Math.max(1, Math.min(5, p.level || 1)),
      avg: pos(avg), mitBonus: pos(avg + bonus)
    };
  }

  const pz = x => x.toFixed(1) + '%';

  function renderVolkLevel() {
    if (!els.vLvl) return;
    const p = solo && solo.player;
    if (!p) { els.vLvl.innerHTML = ''; renderVolkBalken(null); return; }
    const krone = p.level_max > p.level;
    els.vLvl.innerHTML =
      `<b>Level ${p.level} — ${esc(LEVEL_NAME[p.level] || '')}</b>` +
      (krone ? `<span class="wi-vlvlkrone">👑 Level ${p.level_max} schon erreicht</span>` : '') +
      `<span class="wi-vlvlzeile">Schnitt der letzten 7 Tage: ${minSek(p.avg_secs)}` +
      (p.bonus_secs ? ` <i>+ ${minSek(p.bonus_secs)} Bonus</i>` : '') + `</span>` +
      (p.up_secs != null
        ? `<span class="wi-vlvlzeile">Noch ${minSek(Math.max(0, p.up_secs - p.avg_secs - (p.bonus_secs || 0)))} bis Level ${p.level + 1}</span>`
        : `<span class="wi-vlvlzeile">Höchstes Level erreicht.</span>`) +
      (p.down_secs != null
        ? `<span class="wi-vlvlzeile wi-vlvlzeile--warn">Level ${p.level} geht verloren unter ${minSek(p.down_secs)}</span>`
        : '');
    renderVolkBalken(p);
  }

  /* Die große Leiter. Sie trägt EINEN Zeiger: den Schnitt — den
     Wert, der über das Level entscheidet.

     Bis zum 13.09.2026 stand hier eine zweite Nadel für den heutigen
     Tag. Sönke: „beim Levelbalken kannst du das ‚Heute 4:24'
     rausnehmen. Dafür mache unten im Balkendiagramm einen Kreis um
     den heutigen Tag." Beides zusammen ist eine Verschiebung und
     kein Verlust: heute entscheidet nichts, heute ist einer von
     sieben Tagen — und genau dort steht er jetzt, markiert als der
     von jetzt (.wi-vday.is-heute, ein Ring um den Wochentag). */
  function renderVolkBalken(p) {
    if (!els.vBar) return;
    if (!p) { els.vBar.innerHTML = ''; els.vBar.hidden = true; return; }
    els.vBar.hidden = false;
    const L = lvlLeiter(p);

    const segs = L.abschnitte.map(a =>
      `<span class="wi-vseg${a.k === L.lvl ? ' is-on' : ''}"
             style="left:${pz(a.links)};width:${pz(a.breite)}"><b>${a.k}</b></span>`).join('');
    const marken = L.g.map(s =>
      `<span class="wi-vmark" style="left:${pz(L.pos(s))}">${minSekKurz(s)}</span>`).join('');

    /* Der Zeiger klebt an seinem Wert — außer an den Rändern. Er
       ist um seinen Mittelpunkt gesetzt, und bei 0 % oder 100 %
       hinge damit die halbe Beschriftung außerhalb des Kastens: bei
       Level 1 mit wenig Schnitt links, bei Level 5 rechts. Dort
       wandert der Ankerpunkt an die Kante (is-links / is-rechts),
       die Zahl selbst bleibt, wo sie hingehört. */
    const zLinks = L.mitBonus;
    const zKlasse = zLinks < 14 ? ' is-links' : (zLinks > 86 ? ' is-rechts' : '');

    els.vBar.innerHTML =
      `<div class="wi-vmarks">${marken}</div>` +
      `<div class="wi-vtrack">` +
        `<i class="wi-vfill" style="width:${pz(L.avg)}"></i>` +
        `<i class="wi-vbonus" style="left:${pz(L.avg)};width:${pz(Math.max(0, L.mitBonus - L.avg))}"></i>` +
        segs +
      `</div>` +
      /* Das Ø steht auch am großen Balken (Sönke, 13.09.2026) — es
         ist dasselbe Zeichen wie am mittleren Kreis unten, und ein
         Wort dafür braucht es an keiner der beiden Stellen. */
      `<div class="wi-vzeiger">` +
        `<span class="wi-vz wi-vz--avg${zKlasse}" style="left:${pz(zLinks)}">` +
          `Ø ${minSekKurz((p.avg_secs || 0) + (p.bonus_secs || 0))}</span>` +
      `</div>` +
      /* ⚠️ Hier stand „% funkelnde Wörter" — ein Wort aus der
         Bilderwelt an der Stelle, an der es um eine Rechnung geht
         (Sönke, 13.09.2026: „müssen wir umformulieren"). Gemeint ist
         der Anteil der Wörter auf der HÖCHSTEN Stufe, und die heißt
         auf dem Schirm 5. Genau so steht es jetzt da. */
      `<p class="wi-vbonhint">` + (p.bonus_secs
        ? `<i class="wi-vbonchip"></i> <b>+ ${minSek(p.bonus_secs)}</b> Bonus — ` +
          `${Math.round(p.pct_max || 0)} % deiner Wörter stehen auf Stufe ${STUFE_HOCH}`
        : `Ab 50 % deiner Wörter auf Stufe ${STUFE_HOCH} gibt es Bonus-Zeit auf den ` +
          `Schnitt — du hast ${Math.round(p.pct_max || 0)} %.`) + `</p>`;
  }

  /* Die Woche als Säulen plus die Gesamtstatistik — ein eigener,
     erst bei Bedarf geholter Aufruf (wie wi_solo_unit), damit der
     heiße Pfad (jede Antwort) diese Auskunft nicht mitschleppt. */
  let volkHistGen = 0;

  /* Der schwächste der sieben Tage — der, den die 6-von-7-Regel
     herauswirft. ⚠️ Dieselbe Auswahl wie in wi_solo_level_avg_secs:
     `order by secs asc, day asc`. Die Liste kommt nach Tagen
     aufsteigend, ein striktes Kleiner behält bei Gleichstand also
     den FRÜHEREN. Ein anderer Tag hier als dort wäre schlimmer als
     gar keine Markierung: der Balken behauptete dann etwas über die
     Rechnung, das nicht stimmt. */
  const schwaechsterTag = days =>
    days.reduce((a, d) => (a == null || d.secs < a.secs ? d : a), null);

  /* Und der stärkste — der, der GOLD bekommt.

     Sönke, 14.09.2026: „der letzte Tag ist ja immer heute, der Kreis
     markiert es. Gerade ist er aber noch gold. Ich will, dass der
     beste Tag gold ist." Zwei Auszeichnungen an derselben Reihe
     müssen zwei verschiedene Dinge sagen: der Ring sagt WANN
     (heute), das Gold sagt WIE GUT. Solange beides am letzten Tag
     hing, hieß Gold nichts weiter als „rechts".

     Zwei Feinheiten, beide absichtlich:
     • Bei Gleichstand gewinnt der SPÄTERE (`>=` auf einer nach Tagen
       aufsteigenden Liste). Das ist genau andersherum als bei
       schwaechsterTag, und daran hängt mehr als Geschmack: der
       schwächste nimmt bei Gleichstand den früheren, der stärkste
       den späteren — so können in einer Woche aus lauter gleichen
       Tagen nie derselbe Balken blass UND golden sein.
     • Ein Tag ohne Lernzeit wird nie der beste. Eine goldene Null
       wäre ein Lob für nichts; in einer leeren Woche bleibt die
       Reihe lieber ganz ohne Gold. */
  const besterTag = days =>
    days.reduce((a, d) => (d.secs > 0 && (a == null || d.secs >= a.secs) ? d : a), null);

  const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  async function ladeVolkHistorie() {
    if (!els.vHist) return;
    const gen = ++volkHistGen;
    const r = await ctx.actions.call('wi_solo_level_history', {});
    if (gen !== volkHistGen || !els.volkOv || els.volkOv.hidden) return;
    if (!r.ok) { els.vHist.hidden = true; return; }
    els.vHist.hidden = false;

    /* Der stärkste Tag ist der Maßstab und nicht die Schwelle: eine
       Woche mit lauter kurzen Tagen soll trotzdem ein lesbares Bild
       geben. Die Untergrenze von einer Minute hält den Maßstab
       ruhig, solange fast nichts da ist. */
    const maxSecs = Math.max(60, ...r.days.map(d => d.secs));
    const heute = r.days[r.days.length - 1] && r.days[r.days.length - 1].day;
    const schwach = schwaechsterTag(r.days);
    const best = besterTag(r.days);

    els.vDays.innerHTML = r.days.map(d => {
      const hoch = Math.max(2, Math.round(100 * d.secs / maxSecs));
      const tag = WOCHENTAG[new Date(d.day + 'T00:00:00').getDay()];
      const klassen = (d.day === heute ? ' is-heute' : '')
                    + (best && d.day === best.day ? ' is-best' : '')
                    + (schwach && d.day === schwach.day ? ' is-schwach' : '');
      return `<div class="wi-vday${klassen}">
                <span class="wi-vday__val">${minSekKurz(d.secs)}</span>
                <span class="wi-vday__bar"><i style="height:${hoch}%"></i></span>
                <span class="wi-vday__lab">${tag}</span>
              </div>`;
    }).join('');

    /* Warum ein Tag blass ist, muss dastehen. Sonst sieht es aus wie
       ein Fehler — und der Satz ist zugleich die gute Nachricht des
       ganzen Levelsystems: ein schwacher Tag kostet nichts. */
    els.vWeak.textContent = schwach
      ? 'Der schwächste Tag (' + WOCHENTAG[new Date(schwach.day + 'T00:00:00').getDay()]
        + ') zählt nicht mit — ein einzelner schwacher Tag kostet dich kein Level.'
      : '';

    const t = r.totals;
    els.vTot.innerHTML =
      `<span><b>${t.active_days}</b> aktive Lerntage</span>` +
      `<span><b>${t.total_days}</b> Tage dabei</span>` +
      `<span><b>${minSek(t.total_secs)}</b> gesamte Lernzeit</span>`;
  }

  async function volkSetzen(n) {
    if (!spieler || !(n >= 0 && n < TEAMS.length) || n === spieler.volk) return;
    /* Sofort umschalten, den Server danach fragen — dasselbe Muster
       wie bei den Wappen in der Lobby. Ein Kind, das sein Volk
       wechselt, soll die Figur wechseln sehen und nicht auf eine
       Antwort warten. */
    spieler.volk = n;
    if (spieler.held) spieler.held.farbe = n % FARBEN.length;
    volkBilderLaden();
    if (solo) solo.settings = Object.assign({}, solo.settings, { faction: n });
    try { localStorage.setItem(WI_VOLK_KEY, String(n)); } catch (e) { /* egal */ }
    /* Beide Kästen: die Figur im einen, die Hervorhebung im anderen.
       Die Reihe wird eigens gerufen, weil renderVolk aussteigt,
       solange „Wer bist du?" zu ist — und der Wechsel-Kasten kann
       auch für sich allein offen stehen. */
    renderVolk();
    renderVolkReihe();

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
    renderVolkReihe();
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
    sbarMessen();
  }

  /* Wie hoch der Knopf-Kasten ist. Kärtchen und Unit-Leiste enden
     DARÜBER, und dafür stand bis 11.09.2026 an zwei Stellen im
     Stylesheet eine 76 — geraten aus Polsterung und Schriftgröße.
     Die Rechnung ging knapp auf, und „knapp" heißt: das Kärtchen saß
     dem Kasten auf. Gemessen hält der Abstand auch dann, wenn die
     Schrift größer wird.

     Eine eigene Funktion, seit die drei Level-Kreise im Kasten
     wohnen: die erscheinen erst mit der ersten Antwort des Servers
     und machen ihn dabei höher. renderLevel misst dann nach — aber
     nur die Höhe, nicht den linken Rand: randMessen verrechnet
     dessen Änderung mit der Kamera, und ein Sprung der Insel beim
     Erscheinen der Kreise wäre ein Fehler, den niemand hier suchen
     würde. */
  function sbarMessen() {
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

  /* ─── Der Unit-Baum ─────────────────────────────────────────
     Seit 0150 ist ein Satz eine STATION und hängt unter einer Unit
     (Jahrgang → Unit → Station). Das Lehrwerk bringt ~1000 Wörter je
     Jahrgang mit; flach wären das vierzig Zeilen untereinander, und
     die Leiste wäre nicht mehr zu bedienen.

     Gruppiert wird HIER und nicht im Server: `solo.sets` kommt schon
     in der richtigen Reihenfolge (Jahrgang, Unit, Station), und eine
     Map behält sie bei. Trägt ein Satz keine Unit — Datenbank ohne
     0150 —, wird er seine eigene Gruppe, und die Leiste sieht aus
     wie vorher. So sagt sie im Zweifel die Wahrheit, statt alles in
     einen Topf „undefined" zu werfen. */
  function unitBaum() {
    const baum = gruppiereNachUnit((solo && solo.sets) || []);
    for (const g of baum) {
      /* Die Zahl an der Unit ist die Summe ihrer Stationen — aus den
         TIEREN gerechnet, nicht aus `count`. Nur so stimmt sie nach
         einem Stufensprung sofort; `count` ist der Bestand der Liste
         und weiß von der Insel nichts. */
      g.ids    = [].concat(...g.sets.map(s => idsVon(s.id)));
      g.anzahl = g.ids.length || g.sets.reduce((n, s) => n + (s.count | 0), 0);
      g.an     = g.sets.filter(s => solo.aktiv.has(s.id)).length;
    }
    return baum;
  }

  /* Eine Zeile — für die Unit wie für die Station dieselbe Form.
     `ziel` ist, was der Schalter umlegt: eine Unit- oder eine
     Satz-Nummer. */
  function unitZeile(o) {
    const pfeil = o.auf === undefined ? '' :
      `<button type="button" class="wi-uchevb${o.auf ? ' is-auf' : ''}"
               data-auf="${esc(o.ziel)}" aria-expanded="${o.auf}"
               aria-label="Stationen ${o.auf ? 'einklappen' : 'ausklappen'}"
               ><i class="wi-schev" aria-hidden="true"></i></button>`;
    const knopf = `<button type="button" class="wi-utoggle"
              data-${o.unit ? 'anunit' : 'an'}="${esc(o.ziel)}"
              aria-pressed="${o.zustand === 'an'}">
        <b>${esc(o.titel)} <span class="wi-uzahl">(${o.anzahl})</span></b>
        <span class="wi-slegend">${stufenLegende(o.ids)}</span>${
          /* „pausiert" steht in einer eigenen Zeile und nicht hinter
             dem Titel: der Titel wird bei Bedarf abgeschnitten, und
             ausgerechnet der Zustand darf das nicht sein. */
          o.zustand === 'an' ? ''
            : `<span class="wi-umeta">${
                 o.zustand === 'halb' ? 'teilweise' : 'pausiert'}</span>`}
      </button>`;
    const i = !o.info ? '' : `<button type="button" class="wi-uinfo${
        unitOffen && unitOffen.id === o.info ? ' is-on' : ''}"
              data-info="${esc(o.info)}"
              aria-label="Übersicht zu ${esc(o.titel)}">i</button>`;
    return `<div class="${o.klasse}${o.zustand === 'an' ? ' is-on' : ''}${
      o.zustand === 'halb' ? ' is-halb' : ''}">${pfeil}${knopf}${i}</div>`;
  }

  function renderUnits() {
    if (!solo || !els.uList) return;
    const baum = unitBaum();
    if (!baum.length) {
      els.uList.innerHTML =
        '<p class="wi-uhint">Noch nichts freigespielt. Deine Insel wächst, sobald '
        + 'du bei einer Wordisland-Stunde dabei warst.</p>';
      return;
    }

    /* Überschriften nur, wenn es wirklich mehrere Jahrgänge gibt.
       Bei einem einzigen wäre die Zeile eine Trennung, die nichts
       trennt — und sie kostet in der schmalen Leiste eine Zeile. */
    const mehrere = baum.some(g => g.grade !== baum[0].grade);
    let html = '';
    let jahrgang = false;

    for (const g of baum) {
      if (mehrere && g.grade !== jahrgang) {
        jahrgang = g.grade;
        html += `<div class="wi-ugrp">${g.grade == null
          ? 'Eigene Listen' : 'Jahrgang ' + esc(String(g.grade))}</div>`;
      }

      /* Eine Unit am Stück bekommt keinen Aufklapp-Pfeil und trägt
         das „i" ihrer einzigen Station selbst. Ein Pfeil, der eine
         einzige Zeile freilegt, ist eine Bitte um einen Klick ohne
         Gegenwert. */
      if (g.stueck) {
        html += unitZeile({
          klasse: 'wi-urow wi-uone', ziel: g.sets[0].id, unit: false,
          titel: g.title, anzahl: g.anzahl, ids: g.ids,
          zustand: solo.aktiv.has(g.sets[0].id) ? 'an' : 'aus',
          info: g.sets[0].id });
        continue;
      }

      const auf = unitAufgeklappt(g.id, baum);
      const zustand = g.an === g.sets.length ? 'an' : g.an ? 'halb' : 'aus';
      /* ⚠️ `wi-ubox` und nicht `wi-unit`: die Leiste selbst heißt
         `.wi-units`, und `.wi-uhead` ist schon der Kopf der
         Detail-Ansicht weiter unten in dieser Datei
         (Regel: feedback_css_class_collision_one_stylesheet). */
      html += `<div class="wi-ubox${auf ? ' is-auf' : ''}">`
        + unitZeile({
            klasse: 'wi-urow wi-utop', ziel: g.id, unit: true,
            titel: g.title, anzahl: g.anzahl, ids: g.ids, zustand, auf })
        + `<div class="wi-ustats"${auf ? '' : ' hidden'}>`
        + g.sets.map(s => unitZeile({
            klasse: 'wi-urow wi-ustat', ziel: s.id, unit: false,
            titel: s.title, anzahl: idsVon(s.id).length || (s.count | 0),
            ids: idsVon(s.id),
            zustand: solo.aktiv.has(s.id) ? 'an' : 'aus', info: s.id })).join('')
        + '</div></div>';
    }

    els.uList.innerHTML = html
      + '<p class="wi-uhint">Abgefragt wird nur, was an ist. Die anderen Tiere '
      + 'bleiben auf deiner Insel — sie sind nur blass.</p>';

    if (unitOffen) renderUnitDetail();
  }

  function unitListeClick(e) {
    /* Reihenfolge nicht vertauschen: der Pfeil liegt IN der
       Unit-Zeile, und `data-anunit` ist auf demselben Weg nach oben
       erreichbar. Wer zuerst nach dem Schalter sucht, klappt nie. */
    const auf = e.target.closest('[data-auf]');
    if (auf) { unitKlappen(auf.dataset.auf); return; }
    const alle = e.target.closest('[data-anunit]');
    if (alle) { unitSammel(alle.dataset.anunit); return; }
    const an = e.target.closest('[data-an]');
    if (an) { unitToggle(an.dataset.an); return; }
    const info = e.target.closest('[data-info]');
    if (info) unitOeffnen(info.dataset.info);
  }

  /* ─── Auf- und Zuklappen ────────────────────────────────────
     Gemerkt wird je Unit eine ausdrückliche Entscheidung. Nur „was
     ist zu" zu speichern ginge auch, aber dann wäre eine Unit aus
     dem nächsten Halbjahr stumm zugeklappt, obwohl niemand sie je
     zugeklappt hat.

     Ohne Eintrag entscheidet, wie lang die Liste AUFGEKLAPPT wäre —
     gezählt in Zeilen und nicht in Units. Die Zahl der Units sagt
     darüber nichts: drei Units mit je einer Station sind drei
     Zeilen, drei Units eines Lehrwerks sind zwölf.

     Die Schwelle ist dieselbe wie im Wörter-Fenster der Lehrkraft
     (SETS_AUF_MAX): eine Zahl für „so viel passt in die Ansicht,
     ohne dass man sucht". Zwei verschiedene wären hier ein Rätsel —
     dieselbe Unit stünde beim Kind offen und bei der Lehrkraft zu. */
  function unitKlappStand() {
    try {
      const v = JSON.parse(localStorage.getItem(WI_UKLAPP_KEY) || '{}');
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  }

  function unitAufgeklappt(uid, baum) {
    const st = unitKlappStand();
    if (typeof st[uid] === 'boolean') return st[uid];
    return baum.reduce((n, g) => n + g.sets.length, 0) <= SETS_AUF_MAX;
  }

  function unitKlappen(uid) {
    const baum = unitBaum();
    const st = unitKlappStand();
    st[uid] = !unitAufgeklappt(uid, baum);
    try { localStorage.setItem(WI_UKLAPP_KEY, JSON.stringify(st)); } catch (e) { /* egal */ }
    renderUnits();
  }

  /* ─── Der Sammelschalter einer Unit ─────────────────────────
     Alle an → alle aus, sonst alle an. Auch eine halb angeschaltete
     Unit geht also zuerst GANZ an — „teilweise" ist ein Zustand, den
     man verlassen können muss, ohne dreimal zu tippen.

     Die Sperre aus unitToggle gilt hier genauso: am Server heißt
     „nichts gewählt" nämlich „alles" (wi_solo_chosen, 0136), und wer
     die letzte Station ausschaltet, bekäme sie alle zurück. */
  function unitSammel(uid) {
    const g = unitBaum().find(x => x.id === uid);
    if (!g) return;
    const gewaehlt = new Set(soloChosen());
    if (g.sets.every(s => gewaehlt.has(s.id))) {
      for (const s of g.sets) gewaehlt.delete(s.id);
      if (!gewaehlt.size) {
        ctx.toast('Eine Station muss anbleiben — sonst gibt es nichts zu üben.');
        return;
      }
    } else {
      for (const s of g.sets) gewaehlt.add(s.id);
    }
    soloSetzen({ p_sets: [...gewaehlt] });
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
    /* Dasselbe wie beim Volks-Kasten: wer unten rechts eine Echse
       antippt, bekommt das Kärtchen genau dorthin — und der
       nachgereichte Klick träfe sein Schließkreuz. Das Kärtchen
       ginge auf und im selben Augenblick wieder zu. */
    nachklickSperren();
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
        esc(stufeText(stufe))}</span>
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
    const k = wachSchluessel(t.stufe, t.v2, t.v3);
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
    /* Die Uhr übernimmt den Stand, den der Server zuletzt gesagt
       hat — `uhrAb` wird dabei NICHT zurückgesetzt. Wer den Kasten
       zumacht und gleich wieder aufmacht, hat durchgeübt, und der
       Server rechnet den Abstand über das Zumachen hinweg genauso.
       Eine Uhr, die beim Öffnen stehen bleibt, obwohl sie beim
       Server weiterläuft, wäre die erste Lüge. */
    uhrBasis = (solo.player && solo.player.today_secs) || 0;
    zeigeUhr();
    uhrLauf(true);
    soloFeedback(null);
    zeigeDelta(0);
    buehneZu();
    lvupZu();
    clearTimeout(feierT); clearTimeout(lvupT);
    feierWeiter = null; feiernd = false;
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

      /* Das eigene Level hängt an JEDER Antwort, nicht nur an
         entschiedenen — siehe 0145: der Server zählt schon die
         Zwischenstufe als aktive Zeit.

         ⚠️ Die Kreise werden SOFORT nachgeführt, gefeiert wird
         später: ein Aufstieg hält seit dem 14.09.2026 das Üben an
         (Sönke), und zwar HINTER der Tier-Feier, falls beides in
         derselben Antwort steckt. Zwei Feiern übereinander wären
         keine zwei Erfolge, sondern ein Durcheinander. */
      anwendenPlayer(r.player);
      const aufstieg = levelAufstieg(r.player);

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
      const tierHalt = (r.item && r.level_after != null)
        ? soloWachsen(r.item, r.level_after, wort) : 0;
      /* Die zweite Feier reiht sich HINTER die erste. Beide zusammen
         kommen selten vor (ein Wort, das die Stufe hebt, in genau
         der Antwort, die auch das eigene Level hebt) — aber wenn,
         dann sind es zwei Dinge, und zwei Dinge nacheinander sind
         zwei Dinge. Übereinander wären sie eins, und zwar ein
         unleserliches. */
      const lvHalt = aufstieg ? LVUP_DAUER(aufstieg.nach) : 0;
      const halt = tierHalt + lvHalt;
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
        clearTimeout(lvupT);

        /* Das Ende der ganzen Kette, an EINER Stelle. Es gibt zwei
           Wege hierher — der Zeitgeber und der Tipp auf die
           Level-Feier (vorspulen) —, und beide müssen dasselbe tun,
           sonst bleibt beim Abkürzen irgendwo ein Riegel zu. */
        feierWeiter = () => {
          feierWeiter = null;
          clearTimeout(feierT); feierT = 0;
          clearTimeout(lvupT);  lvupT = 0;
          feiernd = false;
          lvupZu();
          if (destroyed || !els.pIn) return;
          buehneZu();
          soloTask = naechste;
          soloRenderTask();
          if (!els.pIn.dataset.locked) { feldZu(els.pIn, false); feldHer(els.pIn); }
        };

        /* Der Aufstieg wartet, bis das Tier fertig ist. Steht keine
           Tier-Feier an (tierHalt = 0), fängt er sofort an — dann ist
           `setTimeout(…, 0)` genau richtig und nicht etwa ein
           direkter Aufruf: `feiernd` ist gesetzt, der Kasten tritt
           zurück, und beides soll im Bild stehen, bevor die Figur
           kommt. */
        if (aufstieg) {
          lvupT = setTimeout(() => {
            lvupT = 0;
            if (destroyed || !feiernd) return;
            // Die Bühne des Tieres geht zu, bevor die der Figur
            // aufgeht — sonst lägen zwei Feiern übereinander.
            buehneZu();
            feierSpielerStart(aufstieg.von, aufstieg.nach);
          }, tierHalt);
        }

        feierT = setTimeout(() => { if (feierWeiter) feierWeiter(); }, halt);
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
  /* Eine von acht ausgewachsenen Echsen fliegt nicht, sie schwimmt.
     Die Überschrift muss das sagen: sie steht genau neben dem Bild,
     auf dem kein Flügel und kein Propeller zu sehen ist — und eine
     Feier, die etwas anderes behauptet als das Bild daneben, liest
     sich als Fehler. Der zweite Satz stimmt für beide: die Insel
     verlassen dürfen sie ab hier so oder so. */
  const FEIER_TITEL3_SCHWIMM = 'Ausgewachsen — es schwimmt!';

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
      els.pStage.textContent = stufeText(nach);
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
    const stufe = Math.max(0, Math.min(4, nach));
    const t = nach != null && FEIER_TEXT[stufe];
    if (!t) { els.pLevel.hidden = true; return; }
    els.pLevelB.textContent = (stufe === 3 && kart && kart.v3 === SCHWIMMT)
      ? FEIER_TITEL3_SCHWIMM : t[0];
    els.pLevelS.textContent = t[1](wort);
    els.pLevel.hidden = false;
    /* Neu anstoßen, nicht nur einblenden: zweimal dieselbe Klasse
       spielt keine zweite Bewegung ab, und genau das passiert bei
       zwei Stufensprüngen hintereinander. */
    els.pLevel.classList.remove('is-on');
    void els.pLevel.offsetWidth;
    els.pLevel.classList.add('is-on');
  }

  /* ─── Das eigene Level ──────────────────────────────────────
     Die drei Kreise unten im Kasten. Sie werden bei JEDER Antwort
     nachgeführt, auch wenn sich nichts ändert — sie sind der Stand
     und nicht das Ereignis.

     Das Ereignis ist der Aufstieg, und der hält seit dem 14.09.2026
     das Üben an (lvupAuf, .wi-lvup): eigener Kasten über allem, die
     Figur, und die Zahl springt von der alten auf die neue. Bis
     dahin lief er nebenher — ein Banner über diesen Kreisen —, und
     das ist beim Tippen genau der Fleck, auf den niemand sieht.
     Der Funkenkranz an der Figur auf der Insel läuft weiter mit
     (dieselbe Zeichnung wie bei einem Tier, siehe die Jubel-Passage
     im Zeichenschritt und heldMasse) — er ist das, was übrig bleibt,
     wenn der Kasten wieder zu ist. */
  function renderLevel() {
    if (!els.lvl) return;
    const p = solo && solo.player;
    if (!p) { els.lvl.hidden = true; return; }
    const warWeg = els.lvl.hidden;
    els.lvl.hidden = false;
    els.lvlNum.textContent = String(p.level);
    els.lvlCrown.hidden = !(p.level_max > p.level);
    els.lvlBtn.setAttribute('aria-label', 'Dein Level: ' + p.level
      + (p.level_max > p.level ? ' (höchstes je erreichtes Level: ' + p.level_max + ')' : ''));

    /* Die Skala der zwei Ringe: von NULL bis zur Grenze, an der das
       nächste Level anfängt. Voller Kreis = nächstes Level (Sönkes
       Vorgabe), und beide Ringe messen dasselbe — Sekunden an einem
       Tag —, sind also unmittelbar vergleichbar.

       Von null und nicht vom unteren Ende des aktuellen Levels: ein
       Ring, der bei jedem Aufstieg auf leer zurückfällt und einen
       schwachen Tag als „nichts geschafft" zeichnet, sagt über das
       Üben weniger als einer, der einfach mitwächst. Die Grenze
       selbst kommt aus derselben Leiter wie der große Balken im
       Kasten (lvlLeiter) — auf Level 5 gibt es keine mehr, dann ist
       es das Ende der Skala. */
    const L = lvlLeiter(p);
    const ziel = Math.max(1, p.up_secs != null ? p.up_secs : L.abschnitte[4].bis);
    const anteil = s => Math.max(0, Math.min(100, 100 * Math.max(0, s || 0) / ziel));

    const avg = p.avg_secs || 0, bonus = p.bonus_secs || 0;
    const basis = anteil(avg);
    const gesamt = anteil(avg + bonus);
    ringSetzen(els.avgArc, basis);
    // Der Bonus als zweiter Bogen HINTER dem eigenen Stand und nicht
    // an dessen Stelle (wie am großen Balken): sonst sähe ein Kind
    // seine echte Lernzeit nicht mehr.
    ringSetzen(els.avgBonus, Math.max(0, gesamt - basis), basis);
    els.avgNum.textContent = minSekKurz(avg + bonus);
    els.avgRing.classList.toggle('is-max', p.up_secs == null);
    els.avgRing.setAttribute('aria-valuenow', String(Math.round(gesamt)));

    /* Der heutige Tag auf DERSELBEN Skala. Beide messen Sekunden an
       einem Tag und sind damit vergleichbar — steht „heute" voller
       als „Ø", zieht der Schnitt an. */
    ringSetzen(els.todayArc, anteil(p.today_secs));
    els.lvlToday.textContent = minSekKurz(p.today_secs);

    // Mit den Kreisen wird der Kasten unten höher, und auf dessen
    // Höhe rechnen Unit-Leiste und Kärtchen. Beim ersten Erscheinen
    // also neu messen — siehe sbarMessen.
    if (warWeg) sbarMessen();
  }

  /* Der Umfang des Rings (r = 19 im 44er-Feld). Er steht hier und
     nicht in der CSS, weil die Bogenlänge eine Rechnung ist:
     `pathLength="100"` wäre kürzer, wird von Safari an <circle> aber
     erst spät unterstützt — und ein Ring, der auf dem iPad immer
     voll ist, wäre schlimmer als eine Zeile Mathematik. */
  const RING_U = 2 * Math.PI * 19;

  function ringSetzen(el, pct, ab = 0) {
    if (!el) return;
    const len = RING_U * Math.max(0, Math.min(100, pct)) / 100;
    el.style.strokeDasharray = len.toFixed(2) + ' ' + RING_U.toFixed(2);
    // Negativer Versatz schiebt den Bogen NACH VORN — so setzt der
    // Bonus-Bogen genau dort an, wo der Basis-Bogen endet.
    el.style.strokeDashoffset = (-RING_U * ab / 100).toFixed(2);
    /* Bei Länge null bleibt der runde Abschluss als PUNKT stehen —
       ein Kringel auf zwölf Uhr, der aussieht wie ein angefangener
       Fortschritt, den es nicht gibt (heute 0:00, kein Bonus). */
    el.style.visibility = len > .01 ? '' : 'hidden';
  }

  /* ─── Die Uhr beim Üben ─────────────────────────────────────
     Sönke, 13.09.2026: „die Lernzeit wächst ja nur im Übungs-Kasten,
     und sobald der zugeht, ist das wieder weg. Ich hätte gerne eine
     Anzeige, wie lange ich schon lerne — eine Uhr, die hochzählt,
     wenn ich aktiv lerne, und stoppt, wenn ich nichts mache. Ein
     ehrlicher Hinweis."

     Ehrlich heißt: dieselbe Rechnung wie am Server. Der zählt nicht
     die Zeit, die der Kasten offen steht, sondern bei JEDER Antwort
     den Abstand zur vorigen — gedeckelt auf zwanzig Sekunden
     (wi_solo_time_add, Migration 0145). Wer die Frage ansieht und
     weggeht, bekommt dafür zwanzig Sekunden und keine Viertelstunde.

     Genau das tut die Uhr: nach einer Antwort läuft sie mit, nach
     zwanzig Sekunden ohne Antwort bleibt sie stehen. Kommt die
     nächste Antwort, schreibt der Server dieselbe Zahl fort, die
     hier schon steht — die Uhr springt nie zurück und läuft nie
     vor. Deshalb darf der Deckel hier keine eigene Zahl sein: er
     ist die aus 0145, und wenn die sich ändert, ändert sich beides.

     Der Preis dafür ist eine Uhr, die stillsteht, während jemand
     nachdenkt. Das ist kein Fehler, sondern die Aussage: gezählt
     wird Üben, nicht Dasitzen. Damit niemand sie für kaputt hält,
     sagt der Punkt daneben, ob sie läuft. */
  const UHR_DECKEL = 20;   // = wi_solo_time_add(prev, now), Migration 0145
  let uhrBasis = 0;        // today_secs, Stand der letzten Antwort
  let uhrAb = 0;           // Date.now() dieser Antwort; 0 = noch keine
  let uhrT = 0;

  function uhrStand() {
    if (!uhrAb) return uhrBasis;
    return uhrBasis + Math.min(UHR_DECKEL, Math.max(0, (Date.now() - uhrAb) / 1000));
  }

  function zeigeUhr() {
    if (!els.pUhr) return;
    const p = solo && solo.player;
    /* Ohne Migration 0145 gibt es keine Lernzeit — dann steht hier
       nichts. Eine Uhr, die 0:00 zeigt, weil der Server die Frage
       nicht kennt, sähe aus wie „du hast heute nichts getan"
       (siehe feedback_missing_migration_looks_like_network). */
    if (!p || p.today_secs == null) { els.pUhr.hidden = true; return; }
    els.pUhr.hidden = false;
    els.pUhrNum.textContent = minSekKurz(uhrStand());
    const laeuft = !!uhrAb && Date.now() - uhrAb < UHR_DECKEL * 1000;
    els.pUhr.classList.toggle('is-still', !laeuft);
    els.pUhr.title = laeuft
      ? 'Deine Lernzeit heute. Sie läuft, solange du antwortest.'
      : 'Deine Lernzeit heute. Die Uhr steht — sie läuft weiter, sobald du antwortest.';
  }

  /* Zweimal je Sekunde und nicht einmal: die Anzeige springt auf
     ganze Sekunden, und ein Zeitgeber im Sekundentakt läuft je nach
     Anfangszeitpunkt bis zu einer ganzen Sekunde daneben. */
  function uhrLauf(an) {
    if (uhrT) clearInterval(uhrT);
    uhrT = 0;
    if (an) uhrT = setInterval(zeigeUhr, 500);
  }

  // Server → Client: p ist { level, level_max, today_secs, avg_secs,
  // bonus_secs, pct_max, up_secs, down_secs[, level_before] } —
  // dieselbe Form aus wi_solo_open/_view (Laden) und wi_solo_answer
  // (jede Antwort), nur letztere trägt level_before dazu.
  function anwendenPlayer(p) {
    if (!p || !solo) return;
    const altesLevel = solo.player && solo.player.level;
    solo.player = p;
    /* Diese Stelle ist der ANTWORTWEG und nur er (soloSend) — beim
       Aufbau der Insel kommt der Spielerstand direkt in `solo`.
       Genau deshalb darf die Uhr hier anspringen: „es kam gerade
       eine Antwort" ist dasselbe Ereignis, das auch der Server
       verbucht hat. */
    uhrBasis = p.today_secs || 0;
    uhrAb = Date.now();
    zeigeUhr();
    renderLevel();
    if (!els.volkOv.hidden) renderVolk();
    /* Auch die acht Daumennägel hängen am eigenen Level. Sie stehen
       in einem zweiten Kasten, der für sich allein offen sein kann —
       renderVolk erreicht sie nicht. */
    if (els.volkWOv && !els.volkWOv.hidden) renderVolkReihe();
    /* Die Figur neu laden, wenn sich die Stufe ihres Bildes ändert —
       sonst liefe sie bis zum nächsten Öffnen noch in der alten.
       Ohne die Level-Bilder gibt es nichts nachzuladen: es wäre
       zweimal dasselbe Bild. */
    if (HELD_LEVEL_BILDER && spieler
        && heldTier(altesLevel) !== heldTier(p.level)) volkBilderLaden();
  }

  /* Hat diese Antwort das eigene Level gehoben? Nur die Auskunft,
     ohne zu feiern — WANN gefeiert wird, entscheidet soloSend: nach
     der Tier-Feier, wenn es eine gab. */
  function levelAufstieg(p) {
    if (!p || p.level_before == null || !(p.level > p.level_before)) return null;
    return { von: p.level_before, nach: p.level };
  }

  /* ─── Der eigene Aufstieg ───────────────────────────────────
     Sönke, 14.09.2026: „das Spiel [muss] kurz unterbrochen werden,
     und ich sehe, wie mein Charakter das nächste Level erreicht."

     Der Ablauf in drei Schlägen — die Zahlen unten sind der ganze
     Takt, die Bewegung selbst steht in der CSS:

       0 ms          die Figur steht da, mit dem ALTEN Level am
                     Abzeichen. Das ist der Ausgangspunkt, ohne den
                     ein Sprung kein Sprung ist, sondern nur eine
                     Zahl.
       LVUP_SPRUNG   der Schlag: die Zahl springt auf das neue
                     Level, das neue Bild der Figur wird
                     eingesetzt, der Kranz geht auf, der Dreiklang
                     kommt.
       LVUP_DAUER    Schluss, die nächste Frage kommt.

     Warum überhaupt zwei Zahlen und nicht einfach „neues Level
     zeigen": weil das Kind sonst nicht sieht, dass sich etwas
     geändert hat. Ein Abzeichen, das von Anfang an 3 sagt, ist eine
     Feststellung. Eines, das von 2 auf 3 springt, ist ein Ereignis. */
  const LVUP_SPRUNG = 760;
  const LVUP_DAUER = nach => 2200 + nach * 200;

  /* Ein Satz je Level. Er sagt, WOFÜR es das Level gab — und das ist
     bei diesem Level immer dasselbe: regelmäßig geübte Zeit, nicht
     richtige Antworten. Ein Kind, das für einen guten Tag ein Level
     erwartet, wartet sonst vergeblich und weiß nicht, warum. */
  const LVUP_SATZ = [
    null, null,
    'Du übst regelmäßig — und das sieht man dir an.',
    'Dein Wochenschnitt wächst. Weiter so.',
    'Starke Woche. So sieht Übung aus.',
    'Die höchste Stufe. Mehr geht nicht.'
  ];

  let lvlToastT = 0;
  let lvupT = 0;        // Zeitgeber bis zum Beginn der Feier
  let lvupSprungT = 0;  // Zeitgeber bis zum Sprung darin
  let lvupAb = 0;       // wann sie aufging — gegen den Nachklick
  let feierWeiter = null;   // die Fortsetzung, die der Tipp vorspulen darf

  function feierSpielerStart(von, nach) {
    /* Das Banner unten bleibt — es ist die Auskunft für den Fall,
       dass der große Kasten gar nicht erst aufgeht (kein DOM, keine
       Figur). Sichtbar ist es ohnehin nur, wenn der Übungskasten zu
       ist; während des Übens liegt der Kasten darüber. */
    if (els.lvlToast) {
      els.lvlToast.textContent = 'Level ' + nach + ' erreicht!' + (nach >= 5 ? ' 👑' : '');
      els.lvlToast.hidden = false;
      // Neu anstoßen wie bei feierText — zwei Aufstiege kurz
      // hintereinander sollen zweimal aufblitzen, nicht einmal.
      els.lvlToast.classList.remove('is-on');
      void els.lvlToast.offsetWidth;
      els.lvlToast.classList.add('is-on');
      clearTimeout(lvlToastT);
      lvlToastT = setTimeout(() => { if (els.lvlToast) els.lvlToast.hidden = true; }, 2600 + nach * 350);
    }
    if (spieler && spieler.held) {
      spieler.held.burstAt = simZeit;
      // „ein bisschen mehr und von Level zu Level ansteigend"
      // (Sönke) — die Dauer ist der ganze Hebel, die Zeichnung
      // selbst bleibt dieselbe wie beim Tier-Jubel.
      spieler.held._burstDauer = .9 + nach * .35;
    }
    lvupAuf(von, nach);
  }

  function lvupAuf(von, nach) {
    const box = els.lvup;
    if (!box) { tonSpiel('spieler' + nach); return; }

    const volk = (spieler && spieler.volk != null) ? spieler.volk : volkAusStand();

    /* Erst das ALTE Bild und die ALTE Zahl. Die Feier fängt da an,
       wo das Kind gerade steht. */
    lvupBild(volk, von);
    els.lvupNum.textContent = String(von);
    els.lvupNum.classList.remove('is-up');
    els.lvupTitle.textContent = 'Level ' + von;
    els.lvupSub.textContent = '';
    box.classList.remove('is-up');
    box.hidden = false;
    // Die Bewegung neu anstoßen (wie bei feierText): zweimal
    // dieselbe Klasse spielt keine zweite Bewegung ab.
    box.classList.remove('is-on');
    void box.offsetWidth;
    box.classList.add('is-on');
    lvupAb = performance.now();

    /* Das neue Bild wird JETZT geholt, nicht erst beim Sprung: ein
       Bild, das im Augenblick des Sprungs noch lädt, macht aus dem
       Schlag ein Flackern. Ist es nicht da (die Level-Fassungen
       liegen noch nicht, HELD_LEVEL_BILDER), bleibt einfach das
       alte stehen — die Zahl springt trotzdem. */
    const neu = volkBild(volk, nach);
    let bereit = false;
    ladeBild(neu).then(() => { bereit = true; }).catch(() => { bereit = false; });

    clearTimeout(lvupSprungT);
    lvupSprungT = setTimeout(() => {
      lvupSprungT = 0;
      if (destroyed || !els.lvup || els.lvup.hidden) return;
      if (bereit) els.lvupImg.src = neu;
      /* Auch wenn das Bild nicht kam: Level 5 ist golden. Der Sprung
         von 4 auf 5 hätte sonst als einziger gar nichts zu zeigen —
         dieselbe Gestalt, dieselbe Farbe, nur eine andere Zahl. */
      goldSetzen(els.lvupImg, nach >= 5);
      els.lvupNum.textContent = String(nach);
      els.lvupNum.classList.add('is-up');
      els.lvupTitle.textContent = 'Level ' + nach + (nach >= STUFE_HOCH ? ' 👑' : '');
      els.lvupSub.textContent = LVUP_SATZ[nach] || '';
      els.lvup.classList.add('is-up');
      tonSpiel('spieler' + nach);
    }, LVUP_SPRUNG);
  }

  /* Das Bild der Figur im Kasten — mit demselben Rückfall wie auf
     der Insel (volkBilderLaden): fehlt die Level-Fassung, steht das
     alte einzelne Bild da. Ein leerer Rahmen mitten in der Feier
     wäre das Schlechteste von allem. */
  function lvupBild(volk, lvl) {
    if (!els.lvupImg) return;
    const basis = volkBildBasis(volk);
    els.lvupImg.onerror = () => {
      els.lvupImg.onerror = null;
      if (els.lvupImg.src !== basis) els.lvupImg.src = basis;
    };
    els.lvupImg.src = volkBild(volk, lvl);
    /* Das Gold gehört zum Sprung und nicht zum Kasten: wer von 4 auf
       5 steigt, sieht dieselbe Gestalt — sie wird golden. Das IST
       hier der ganze Unterschied, also darf er nicht schon vorher
       dastehen. */
    goldSetzen(els.lvupImg, lvl >= 5);
  }

  function lvupZu() {
    clearTimeout(lvupSprungT);
    lvupSprungT = 0;
    lvupAb = 0;
    if (!els.lvup) return;
    els.lvup.hidden = true;
    els.lvup.classList.remove('is-on', 'is-up');
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
    ab: [392.00, 311.13],
    // Das eigene Level — dieselbe Reihe wie oben, eine Terz höher
    // angesetzt, damit sie sich vom Tier-Dreiklang unterscheidet.
    spieler2: [659.25, 830.61],
    spieler3: [698.46, 880.00, 1046.50],
    spieler4: [783.99, 987.77, 1174.66, 1567.98],
    spieler5: [880.00, 1108.73, 1318.51, 1760.00, 2217.46]
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

  let kart = null;      // { id, farbe, v2, v3, stufe } — das gezeigte Tier
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
  /* `vari` ist das gezeigte Tier selbst (es trägt v2 und v3) und
     nicht ein Buchstabe: die Karte zeigt IMMER dieselbe Echse, nur
     auf verschiedenen Stufen — und welches Bild eine Stufe hat, weiß
     wachSchluessel. Die Schwimmerin steht hier auf dem Trockenen;
     ihr Wasserbild gehört auf die Insel und nicht in einen Kasten
     ohne Meer. */
  function kartGeo(m, stufe, vari, farbe, s) {
    const st = Math.max(0, Math.min(4, stufe));
    const key = wachSchluessel(st, vari && vari.v2, vari && vari.v3);
    const im = sprites[key][farbe], b = ECHSE.bilder[key];
    const e = STUFE_EINHEIT[st] * m.P / ECHSE.blatt.h * (s || 1);
    return {
      im, e,
      x: m.ax + (b.x - ECHSE.blatt.ankerX) * e,
      y: m.ay + (b.y - ANKER_Y[key]) * e,
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
    const farbe = kart.farbe, vari = kart;
    /* Eine von fünf ausgewachsenen Echsen fliegt nicht. Auf der Karte
       ist das kein Nebensatz: sie bekommt den vollen Bodenschatten,
       atmet statt zu schweben, und beim Stufensprung hebt sie nicht
       ab. Alles drei hängt an DIESER Zeile — stünde überall `stufe >= 3`,
       müsste man die Ausnahme dreimal nachtragen. */
    const flieger = stufe >= 3 && kart.v3 !== SCHWIMMT;

    /* ── Das ruhende Bild ──────────────────────────────────────
       Auch ohne Verwandlung steht das Tier nicht still: das Ei
       wippt, der Läufer atmet, der Flieger schwebt. Ein völlig
       reglos liegendes Ei sieht aus wie ein Fehler — dieselbe
       Beobachtung wie auf der Insel. */
    let dy = 0, dreh = 0, s = 1;
    if (stufe === 0)  dreh = .055 * Math.sin(t * 1.7) * ruhe;
    else if (!flieger) { dy = -m.P * .02 * (1 + Math.sin(t * 2.3)) * ruhe;
                         s = 1 + .012 * Math.sin(t * 2.3 + 1.6) * ruhe; }
    else              { dy = -m.P * .05 * (1 + Math.sin(t * 1.5)) * ruhe;
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
      const hebt = a.nach >= 3 && a.von < 3 && flieger ? (1 - e) * m.P * .75 : 0;
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
    const oben = stufe >= 4;
    const spark = funken[farbe], H = m.P * 1.3;
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const eigen = k * 2.3994;
      const dauer = 2.4 + (k % 3) * .55;
      const q = ((t / dauer + eigen) % 1 + 1) % 1;
      const fx = m.ax + Math.sin(eigen * 3.1 + q * 3.4) * H * (oben ? .48 : .38);
      const fy = m.ay - m.P * .5 + H * (.30 - 1.25 * q);
      const auf = Math.sin(q * Math.PI);
      const fs = H * (.20 - .09 * q) * (.7 + .3 * auf) * (oben ? FUNKEL_GROSS : 1);
      x.globalAlpha = Math.min(1, auf * (oben ? .9 : .5));
      x.drawImage(spark, fx - fs / 2, fy - fs / 2, fs, fs);
      if (oben) {
        const ws = fs * .55;
        x.drawImage(funke, fx - ws / 2, fy - ws / 2, ws, ws);
      }
    }
    /* Dieselben Glitzersterne wie draußen auf der Insel — dieselbe
       Tabelle, dieselbe Rechnung, nur um den Anker des Kastens statt
       um die Bildmitte eines Tieres. Wer die Karte ansieht, soll
       dasselbe sehen, was ihm später auf der Insel auffällt. */
    if (oben) {
      for (let k = 0; k < GLITZER; k++) {
        const eigen = k * 2.3994;
        const q = ((t / GLITZER_SEK + k / GLITZER) % 1 + 1) % 1;
        const auf = Math.pow(Math.max(0, Math.sin(q * Math.PI)), 3);
        if (auf < .02) continue;
        const gx = m.ax + Math.cos(eigen * 2.7) * H * .34;
        const gy = m.ay - m.P * .55 + Math.sin(eigen * 3.3) * H * .30;
        const gr = H * GLITZER_GROSS * (.5 + .5 * auf);
        x.globalAlpha = Math.min(1, auf * .95);
        x.drawImage(glitzer, gx - gr / 2, gy - gr / 2, gr, gr);
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

    kart = { id: soloTask.item, farbe: t.farbe, v2: t.v2, v3: t.v3, stufe };
    els.pStage.textContent = stufeText(stufe);
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
      markPaint = null; pickHand = false; pickWar = 0; panInline = panPick = null;
      pickGrund = 'serie';
      if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
      if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
      takt = { ...TAKT_RUECKFALL };
      ownPainted = null; submitting = false; picking = false; shadowPick = 0;
      sets = { list: [], chosen: [], zu: new Set() };
      setsBusy = 0; tab = 'units'; setsOpen = false;
      factions = [0, 1, 2, 3]; pickSel = []; pickBusy = 0;
      practice = false; lastPhase = null; soloClaimAt = 0;
      solo = null; soloTask = null; simZeit = 0; letzterT = 0; nacht = 0;
      spieler = null; volkGen = 0; volkNurHier = false;
      unitOffen = null; markiert = null; tierOffen = null; randLinks = 0;
      sichtbar = []; unitVergessen();
      kart = null; kartAnim = null; feiernd = false; kartZiel = 'karte';
      feierWeiter = null; lvupAb = 0;
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

      /* Die Karte selbst skaliert mit ihrem viewBox — gemessen werden
         muss nur die Höhe der Beamer-Bühne (siehe passeBeamAn). */
      onResize = () => { passeBeamAn(); };
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
      uhrLauf(false);
      clearTimeout(soloLockT);
      clearTimeout(feierT);
      clearTimeout(deltaT);
      clearTimeout(lvupT);
      clearTimeout(lvupSprungT);
      clearTimeout(lvlToastT);
      clearTimeout(flashTimer);
      flashTimer = null;
      clearTimeout(lockTimer);
      lockTimer = null;
      feierWeiter = null;
      feiernd = false;
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;
      document.body.classList.remove('tool-fill');
      root = ctx = null; role = null; view = null;
      els = {}; cells = []; cellEls = []; ships = {}; ownPainted = null; mapPaint = null;
      markPaint = null; panInline = panPick = null;
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
