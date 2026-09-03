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
  // Stufe 6 — der Beweis, dass ein Tool ohne Migration dazukommt.
  poll:      { ready: false }
};
