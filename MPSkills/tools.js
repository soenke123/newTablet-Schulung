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
  // Stufe 4 — Engine aus „Warum Tablets?" wird portiert.
  wordcloud: { ready: false },
  // Stufe 6 — der Beweis, dass ein Tool ohne Migration dazukommt.
  poll:      { ready: false }
};
