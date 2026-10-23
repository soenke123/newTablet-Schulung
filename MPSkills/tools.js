/* ══════════════════════════════════════════════════════════════
   MPSkills — tools.js
   ══════════════════════════════════════════════════════════════
   BEWUSST KEIN Spiegel von skill_tools.

   Titel, Icon, Beschreibung, Grenzen und Sortierung kommen aus der
   Datenbank (Migration 0078) — sie sind die Wahrheit, und sie
   ändern sich, ohne dass etwas ausgeliefert werden muss. Hier steht
   nur, was die Datenbank NICHT wissen kann:

     ready  — Liegt das Frontend dieses Tools im Deployment?
              Das ist eine Eigenschaft des ausgelieferten Codes und
              keine Eigenschaft des Tools. Stünde es in der DB,
              bräuchte jede Auslieferung eine Migration — und ein
              Rollback des Frontends würde Kacheln zeigen, die ins
              Leere führen.

     hidden — Kachel und Verlinkung komplett weg, ohne die Zeile in
              skill_tools anzurühren. Für einen Skill, der im
              Hintergrund weiterleben, aber niemandem mehr angeboten
              werden soll — anders als ready:false, das die Kachel
              als „in Vorbereitung" zeigt.

     beta   — Zeigt einen „Beta"-Sticker: der Skill läuft, ist aber
              noch nicht rund.

     editor — Adresse einer Seite, auf der sich der Inhalt des Skills
              OHNE Raum vorbereiten lässt. Die Kachel bekommt dann
              neben „+ Raum öffnen" einen zweiten Knopf. Bisher nur
              Knowledge Stack (quiz.html, der Quiz-Editor).

   standalone — Adresse einer Seite, die der Skill SELBST ist: kein Raum,
              keine Tür, nichts Gemeinsames. Die Kachel zeigt „Öffnen"
              statt „+ Raum öffnen" (für Gäste auch), und im Dropdown
              für neue Räume fehlt der Skill. Bisher nur Master PDF.

   Ein Tool, das hier nicht steht, gilt als ready:false. Ein Tool,
   das hier steht, aber nicht in der Datenbank, wird nicht
   angezeigt — die Registry entscheidet, was es gibt.

   Anders als GameHub/script.js (GAMES_CONFIG) ist das hier also
   keine Konfiguration, sondern eine dünne Auslieferungs-Notiz.
   ══════════════════════════════════════════════════════════════ */

window.TOOLS_OVERLAY = {
  // Stufe 4 — Engine aus „Warum Tablets?" portiert, liegt unter
  // tools/wordcloud/ (tool.js + tool.css).
  wordcloud: { ready: true },
  // Zweiter Skill (Migration 0089). Liegt unter tools/NeuroLab/ —
  // Großschreibung, weil der Ordner so aus seinem eigenen Repository
  // kam; dass die id davon abweichen darf, ist genau der Grund für
  // die folder-Spalte in skill_tools.
  neurolab:  { ready: true },
  // Dritter Skill (Migration 0092). Liegt unter tools/Caesercode/ —
  // wieder ein Ordner, dessen Name nicht die id ist, diesmal wegen
  // eines Drehers darin. Anders als NeuroLab ist die Scheibe
  // PORTIERT und nicht eingerahmt (Begründung im Kopf ihrer tool.js).
  caesar:    { ready: true },
  // Vierter Skill (Migration 0093), erstes Team-Spiel und der erste,
  // der eigene Tabellen statt der generischen Inhaltsschicht benutzt.
  // Grundgerüst-Stand: Platzhalterfarben, keine Fraktionsbilder.
  'clash-of-math': { ready: true },
  // Fünfter Skill (Migration 0129). Liegt unter tools/wildclusters/ —
  // hier stimmt der Ordnername ausnahmsweise mit der id überein, weil
  // er beim Einzug umbenannt wurde (er hieß „wild Clusters", mit
  // Leerzeichen). Zweiter eingerahmter Skill nach NeuroLab, aber der
  // erste, in dem der Raum wirklich etwas steuert: die Lehrkraft
  // schaltet die Phase, und die Brücke (js/ui/bridge.js) trägt sie in
  // den Rahmen hinein.
  wildclusters: { ready: true },
  // Sechster Skill (Migrationen 0130–0132), erster im Fach Englisch.
  // Zweites Team-Spiel mit eigenen Tabellen — und das erste, dessen
  // INHALT nicht ihm gehört: die Vokabelsätze liegen in vocab_*
  // daneben, damit das Alleine-Lernen später auf denselben Listen
  // üben kann.
  wordisland: { ready: true },
  // Siebter Skill (Migration 0174) — Live-Quiz mit 40 Wesen & Leaderboard.
  // beta: zeigt einen „Beta"-Sticker auf der Kachel (26.09.2026) — der
  // Skill läuft, ist aber noch nicht rund; das ist eine Auskunft über die
  // Auslieferung, nicht über die Datenbankzeile, gehört also hierher.
  knowledgestack: { ready: true, beta: true, editor: 'quiz.html' },
  // Achter Skill (Migration 0180) — Netzwerksimulator, dritter
  // eingerahmter nach NeuroLab und Wild Clusters. Die Lehrkraft gibt
  // Szenarien frei, holt Netze auf den Beamer und schaltet die
  // Tablets blind. beta: die Integration ist frisch (28.09.2026).
  synir: { ready: true, beta: true },
  // Neunter Skill (Migration 0196) — Scrum Werkstatt, ein Raum je
  // Team, eingerahmt wie NeuroLab (tools/ScrumWerkstatt/index.html).
  // beta: frisch aus dem Prototyp in den Raum gezogen (06.10.2026).
  scrum: { ready: true, beta: true },
  // Zehnter Skill (Migration 0200) — Projektarbeit: ein Raum = eine
  // Klasse. Lobby, Gruppen per Drag & Drop, je Gruppe ein Planungsraum
  // (Projektziel, Board, Stunden, Anträge, Team, Regeln). Eingerahmt
  // wie die Scrum Werkstatt (tools/Projektarbeit/index.html).
  // beta: frisch gebaut (07.10.2026).
  projekt: { ready: true, beta: true },
  // Elfter Skill (Migration 0210) — Tiny LM, ein Mini-Sprachmodell
  // zum Aufschrauben. Eingerahmt wie NeuroLab (tools/TinyLM/index.html),
  // nichts geteilt. beta: noch eine einzige Ansicht für alle, die
  // Trennung Lehrkraft/Schüler kommt später. Schaufenster: preview/tinylm.js.
  tinylm: { ready: true, beta: true },
  // Zwölfter Skill (Migration 0211) — Master PDF Skill: PDFs lesen und
  // bearbeiten. KEIN Raum: die Kachel öffnet die eigenständige App unter
  // tools/Master PDF Skill/ direkt, ohne Anmeldung (läuft lokal im
  // Browser). beta: noch in Arbeit (16.10.2026). `windows`: Ordner mit
  // dem Windows-Installer (gebaut von .github/workflows/master-pdf-windows.yml,
  // ausgeliefert von Vercel): version.json + MasterPDFSkill-Setup.exe.
  masterpdf: { ready: true, beta: true, standalone: 'tools/Master%20PDF%20Skill/index.html',
               windows: '../downloads/master-pdf/' },
  // Dreizehnter Skill (Migration 0213) — Balance of Nature: Ökosystem
  // auf einer Insel, eingerahmt wie SYNIR (tools/balance of nature/,
  // Ordner mit Leerzeichen, weil er so aus seinem eigenen Repository
  // kam). Vier feste Szenarien, die Lehrkraft teilt und entzieht sie
  // (skill_room_state.data.shared). beta: frisch eingezogen (18.10.2026).
  balance: { ready: true, beta: true },
  // Vierzehnter Skill (Migration 0220) — SQL Studio: Datenbanken wie
  // mit phpMyAdmin, SQLite im Browser (tools/SQLStudio/, sql.js im
  // Worker). Nur für Admins sichtbar — das entscheidet die Datenbank
  // (skill_tools.admin_only), `adminOnly` hier setzt nur das Schild auf
  // die Kachel. beta: Etappe 1, noch ohne Teilen (23.10.2026).
  sqlstudio: { ready: true, beta: true, adminOnly: true },
  // Stufe 6 — der Beweis, dass ein Tool ohne Migration dazukommt.
  // hidden (26.09.2026): Sönke will Kachel und Verlinkung weg, die
  // Datenbankzeile und der Ordner aber stehen lassen. `hidden` blendet
  // die Kachel komplett aus renderTools() aus — anders als `ready:false`,
  // das die Kachel nur als „in Vorbereitung" zeigt, aber sichtbar lässt.
  poll:      { ready: false, hidden: true }
};
