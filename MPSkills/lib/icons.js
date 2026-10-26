/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/icons.js
   ══════════════════════════════════════════════════════════════
   Jeder Skill hat ein eigenes Zeichen statt eines Emojis.

   Warum überhaupt weg vom Emoji: es ist nicht unseres. Es sieht auf
   jedem Gerät anders aus (🧠 ist auf dem iPad ein anderes Bild als
   auf Windows), es bringt seine eigene Farbe mit und stellt sich
   damit quer zu einer Seite, die mit EINEM Akzent auskommt — und es
   ist nicht eindeutig: NeuroLab und Knowledge Stack trugen beide
   🧠. Ein gezeichnetes Zeichen ist überall dasselbe, nimmt die
   Farbe der Umgebung an (currentColor, also auch im Darkmode) und
   gehört genau einem Skill.

   Einfarbig und aus Linien, in der Bildsprache des Showrooms:
   24er-Raster, Strichstärke 1.8, runde Enden. Die Strichstärke
   steht NICHT hier, sondern in style.css (.mpic) — sie gehört dem
   Kleid und nicht der Zeichnung.

   ── Nachgeschlagen wird über die tool_id ──────────────────────
   NICHT über das Emoji aus der Datenbank. Das Emoji ist eine
   Anzeige und kein Schlüssel: zwei Skills dürfen dasselbe tragen,
   und wer es in skill_tools ändert, würde sonst das Zeichen
   austauschen. skill_room_json liefert überall `tool_id` mit, also
   ist der Schlüssel immer zur Hand.

   Ein unbekannter Skill (neu in der Datenbank, hier noch nicht
   gezeichnet) bekommt `skill` — das neutrale Rasterzeichen. Kein
   Rückfall auf das Emoji: eine Kachel mit Emoji zwischen lauter
   gezeichneten Kacheln fiele mehr auf als ein neutrales Zeichen.

   ── Was NICHT umgestellt wurde ────────────────────────────────
   Reiner Text: die <option>-Liste der Skill-Auswahl und die
   „Kontingent voll"-Zeile auf der Landing. In ein <option> passt
   kein SVG, und in einem Satz wäre ein Zeichen eine Marke ohne
   Aufgabe. Dort steht jetzt nur der Titel.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Ein gefüllter Punkt. Braucht stroke="none": die Sammelregel in
     style.css setzt allen Kindern den Strich, und ein Punkt mit
     Strich ist ein größerer Punkt. */
  const dot = (x, y, r) =>
    `<circle cx="${x}" cy="${y}" r="${r || 1.5}" fill="currentColor" stroke="none"/>`;

  const GLYPHS = {

    /* Wortwolke — „viele kurze Antworten, was die Klasse am meisten
       trägt steht am größten in der Mitte". Also drei Wörter in
       drei Größen, um eine Mittelachse gesetzt: die Staffelung IST
       die Auswertung. Kein Wetter-Wölkchen — das zeigte den Namen
       und nicht die Sache.

       Die drei stehen schief. Das ist keine Verzierung: liegen sie
       gerade übereinander, ist das Zeichen ein Drucker (mittig) oder
       eine Liste (linksbündig) — erst die Drehung macht aus den
       Balken hingeworfene Wörter. */
    wordcloud:
      '<rect x="8.4" y="3.6" width="9.4" height="3.8" rx="1.2" transform="rotate(7 13.1 5.5)"/>' +
      '<rect x="2.8" y="9.2" width="15" height="5.6" rx="1.6" transform="rotate(-4 10.3 12)"/>' +
      '<rect x="5.4" y="16.6" width="11.6" height="4" rx="1.2" transform="rotate(-5 11.2 18.6)"/>',

    /* NeuroLab — das künstliche Neuron selbst: drei Eingänge, ein
       Körper, ein Ausgang mit Pfeil. Ein Gehirn wäre das Fach und
       nicht das Werkzeug; gerechnet wird hier an EINER Zelle.

       Die Eingänge sind offene Kreise und keine vollen Punkte, und
       der Körper ist groß: drei gefüllte Punkte, aus denen Linien
       auf einen kleinen Kreis zulaufen, ergeben eine Pfeilspitze.
       Als Kreise ist es eine Schicht Knoten. */
    neurolab:
      '<circle cx="4.9" cy="5.6" r="2.1"/><circle cx="4.9" cy="12" r="2.1"/>' +
      '<circle cx="4.9" cy="18.4" r="2.1"/>' +
      '<path d="M6.7 6.7 12 10M7 12h4.4M6.7 17.3 12 14"/>' +
      '<circle cx="15.2" cy="12" r="3.8"/>' +
      '<path d="M19 12h2.4M20.3 10.8 21.5 12l-1.2 1.2"/>',

    /* Tiny LM — eine Sprechblase, die sich selbst schreibt: eine
       volle Zeile Wörter, in der zweiten ein Wort und daneben der
       Kasten für das NÄCHSTE Wort, das gerade vorhergesagt wird.
       Genau das tut ein Sprachmodell, und nichts anderes. */
    tinylm:
      '<path d="M5.2 3.8h13.6a2.2 2.2 0 0 1 2.2 2.2v8.4a2.2 2.2 0 0 1-2.2 2.2H10l-4.2 3.6v-3.6h-.6A2.2 2.2 0 0 1 3 14.4V6a2.2 2.2 0 0 1 2.2-2.2z"/>' +
      '<path d="M6.8 8.2h4.2M13 8.2h4.2M6.8 12.2h3.4"/>' +
      '<rect x="12.4" y="10.6" width="4.8" height="3.2" rx=".8"/>',

    /* Definitions Derby — zwei übereinanderliegende Karten (die hintere nur
       als Rand, der von der vorderen verdeckt wird), die vordere mit
       drei Textzeilen. Keine
       Schrift im Zeichen: bei 20 Pixeln wäre sie nicht lesbar. */
    derby:
      '<path d="M7.2 8.4V5.6a2.2 2.2 0 0 1 2.2-2.2h9a2.2 2.2 0 0 1 2.2 2.2v5.8a2.2 2.2 0 0 1-2.2 2.2h-1.6"/>' +
      '<rect x="3.4" y="8.4" width="13.4" height="10.2" rx="2.2"/>' +
      '<path d="M6.6 12.2h5.2M6.6 14.6h7M6.6 16.8h4.4"/>',

    /* Master PDF — ein Blatt mit umgeknickter Ecke und drei Textzeilen,
       die letzte kurz. Kein „PDF"-Schriftzug: bei 20 Pixeln ist das
       Blatt lesbar, Buchstaben darin nicht. */
    masterpdf:
      '<path d="M6 3.2h8.2L19 8v12.8H6z"/>' +
      '<path d="M14 3.4V8.2h4.8"/>' +
      '<path d="M9 12.4h7M9 15.4h7M9 18.2h4"/>',

    /* Cäsar-Scheibe — zwei Ringe übereinander: außen die Teilung,
       innen EINE Marke, und die steht zwischen zwei Zähnen. Genau
       das ist der Schlüssel: die beiden Räder stehen gegeneinander
       verdreht. Ein Schloss (🔐) meint Sicherheit, hier geht es ums
       Drehen.

       Kein Strich vom Mittelpunkt nach oben — Kreis mit Stab in der
       Mitte ist der Einschaltknopf, und den hat jeder im Auge. */
    caesar:
      '<circle cx="12" cy="12" r="8.6"/>' +
      '<circle cx="12" cy="12" r="4.6"/>' +
      '<path d="M12 3.4v1.7M19.5 7.7 18 8.6M19.5 16.3 18 15.4' +
      'M12 20.6v-1.7M4.5 16.3 6 15.4M4.5 7.7 6 8.6"/>' +
      '<path d="M14.3 8 13.5 9.5"/>',

    /* Kingdoms of Mathoria — die Burg mit Zinnen und Tor. Gekreuzte
       Schwerter (⚔️) sagen „Kampf"; erobert werden aber Felder mit
       einem Königreich darauf, und das Tor ist die Form, an der man
       eine Burg auch bei 20 Pixeln noch erkennt. */
    'clash-of-math':
      '<path d="M6 20.4V7h2.4v2.2h2.4V7h2.4v2.2h2.4V7H18v13.4"/>' +
      '<path d="M10.1 20.4v-4.5a1.9 1.9 0 0 1 3.8 0v4.5"/>' +
      '<path d="M3.6 20.4h16.8"/>',

    /* Wild Clusters — Punkte, und zwei Schlingen darum: die Klasse
       entscheidet, wer zusammengehört. Eine Pfote (🐾) zeigte die
       Tiere, nicht die Frage.

       Durchgezogen und nicht gestrichelt: gestrichelt hieße „nur
       behauptet" und wäre inhaltlich richtig — bei 18 Pixeln
       zerfällt der Kreis dabei aber in Krümel, und dann ist gar
       nichts mehr behauptet.

       Schräg liegende Ellipsen und keine Kreise: ein Kreis mit drei
       Punkten darin ist ein Würfelbild, zwei davon nebeneinander
       sind zwei Würfel. Eine gekippte Ellipse ist immer eine
       Umrandung von etwas. */
    wildclusters:
      '<ellipse cx="7.4" cy="7.6" rx="5.4" ry="4.1" transform="rotate(-18 7.4 7.6)"/>' +
      dot(5.2, 6.6, 1.2) + dot(9.4, 6.2, 1.2) + dot(7.3, 9.6, 1.2) +
      '<ellipse cx="16.4" cy="16.6" rx="5.2" ry="3.9" transform="rotate(22 16.4 16.6)"/>' +
      dot(14.6, 15.4, 1.2) + dot(18.4, 15.9, 1.2) + dot(16.2, 19.2, 1.2),

    /* Myth of Wordisland — die Insel. Sie ist der Ort, um den
       gespielt wird, und sie ist auch das Bild der Alleine-Seite
       (insel.html). Eine Welle darunter, damit der Hügel eine Insel
       wird und kein Berg.

       Die Palme steht schief und trägt drei ungleiche Wedel: zwei
       gleiche links und rechts an einem geraden Stamm ergeben einen
       Sonnenschirm. */
    wordisland:
      '<path d="M4.6 16.2c1.3-2.8 3.7-4.4 7.4-4.4s6.1 1.6 7.4 4.4Z"/>' +
      '<path d="M13.4 11.8c-.9-2.5-1.3-4.3-1-5.6"/>' +
      '<path d="M12.4 6.2c-1.9-1.4-4-.9-5.1.8' +
      'M12.4 6.2c2.2-.9 4.1.3 4.6 2.1' +
      'M12.4 6.2c.3-2 1.8-3.1 3.6-3.1"/>' +
      '<path d="M3.4 19.2c1.4 0 1.4 1.2 2.9 1.2s1.4-1.2 2.9-1.2 1.4 1.2 2.9 1.2' +
      ' 1.4-1.2 2.9-1.2 1.4 1.2 2.9 1.2 1.4-1.2 2.9-1.2"/>',

    /* Knowledge Stack — der Stapel aus dem Namen: drei Lagen, von
       schräg oben gesehen. Die oberste ist die Frage, die gerade am
       Beamer steht. */
    knowledgestack:
      '<path d="M12 3.2 3.1 7.6 12 12l8.9-4.4z"/>' +
      '<path d="M3.1 12 12 16.4l8.9-4.4"/>' +
      '<path d="M3.1 16.4 12 20.8l8.9-4.4"/>',

    /* SYNIR — ein kleines Netz: zwei Endgeräte oben, verkabelt mit
       einem Switch darunter. Die Kabel sind das Wesentliche (dass
       Geräte VERBUNDEN werden), deshalb laufen sie sichtbar bis in
       die Kästen hinein und nicht nur bis an ihren Rand. */
    synir:
      '<rect x="2.8" y="3.4" width="6.8" height="5" rx="1.2"/>' +
      '<rect x="14.4" y="3.4" width="6.8" height="5" rx="1.2"/>' +
      '<rect x="7.4" y="15.4" width="9.2" height="4.8" rx="1.2"/>' +
      '<path d="M6.2 8.4v3.4h11.6V8.4M12 11.8v3.6"/>',

    /* Balance of Nature — zwei versetzte Wellen: Beute und Räuber.
       Die zweite läuft der ersten eine Viertelwelle hinterher und
       ist flacher — genau das, was die Diagramme auf der Insel
       zeigen. Kein Tier und keine Insel: das Verhalten ist die
       Sache, nicht die Landschaft. */
    balance:
      '<path d="M2.6 12.0L3.5 8.6 4.5 6.0 5.4 4.7 6.4 5.0 7.3 6.9 8.2 9.9 9.2 13.4 10.1 16.6 11.1 18.7 12.0 19.4 12.9 18.4 13.9 16.0 14.8 12.7 15.8 9.2 16.7 6.4 17.6 4.8 18.6 4.8 19.5 6.4 20.5 9.3 21.4 12.7"/>' +
      '<path d="M2.6 16.6L3.5 16.1 4.5 14.7 5.4 12.7 6.4 10.5 7.3 8.7 8.2 7.6 9.2 7.5 10.1 8.4 11.1 10.1 12.0 12.2 12.9 14.3 13.9 15.9 14.8 16.6 15.8 16.3 16.7 15.0 17.6 13.1 18.6 10.9 19.5 9.0 20.5 7.7 21.4 7.4" opacity=".55"/>',

    /* SQL Studio — die Tonne, das Zeichen für Datenbank seit
       jeher: oben der Deckel, zwei Ringe, und rechts unten ein
       Schlüssel — der Primärschlüssel, um den sich alles dreht. */
    sqlstudio:
      '<ellipse cx="10.5" cy="5.6" rx="7" ry="2.6"/>' +
      '<path d="M3.5 5.6v12.2c0 1.4 3.1 2.6 7 2.6.7 0 1.3 0 1.9-.1"/>' +
      '<path d="M17.5 5.6v4.6M3.5 11.7c0 1.4 3.1 2.6 7 2.6 1 0 2-.1 2.8-.2"/>' +
      '<circle cx="16.6" cy="15.4" r="2.3"/><path d="M18.3 17l2.4 2.4M19.8 18.5l-1 1"/>',

    /* Scrum Werkstatt — das Board: drei Spalten, in den ersten
       beiden je ein Zettel, die letzte mit einem Haken (fertig). */
    scrum:
      '<rect x="3" y="3.6" width="18" height="16.8" rx="2"/>' +
      '<path d="M9 3.6v16.8M15 3.6v16.8"/>' +
      '<rect x="4.6" y="6.4" width="2.8" height="2.8" rx=".5"/>' +
      '<rect x="10.6" y="9.6" width="2.8" height="2.8" rx=".5"/>' +
      '<path d="M16.4 8.2l1.2 1.2 2-2.2"/>',

    /* Projektarbeit — ein Kompass: das Projektziel gibt die Richtung,
       die Nadel zeigt schräg nach oben (unterwegs, nicht am Ziel). */
    projekt:
      '<circle cx="12" cy="12" r="8.8"/>' +
      '<path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>' +
      '<path d="M12 3.2v1.6M12 19.2v1.6M3.2 12h1.6M19.2 12h1.6"/>',

    /* Abstimmung — Balken in Echtzeit, genau wie es im Text steht.
       Sie stehen auf einer Linie, sonst schwebten sie. */
    poll:
      '<path d="M6.2 19.3V11.4M12 19.3V5.6M17.8 19.3v-5.4"/>' +
      '<path d="M3.6 19.3h16.8"/>',

    /* Der Rückfall: ein Raster aus vier Feldern, von denen eins
       anders ist. „Irgendein Werkzeug" — ohne so zu tun, als wäre
       es schon das eigene. */
    skill:
      '<rect x="3.4" y="3.4" width="7.4" height="7.4" rx="2.2"/>' +
      '<rect x="13.2" y="3.4" width="7.4" height="7.4" rx="2.2"/>' +
      '<rect x="3.4" y="13.2" width="7.4" height="7.4" rx="2.2"/>' +
      '<circle cx="16.9" cy="16.9" r="3.7"/>'
  };

  /* Ein Skill kann unter mehreren Namen auftauchen: in der
     Datenbank steht die id, im Ordner manchmal etwas anderes
     (KnowledgeStack, Caesercode). Wer den Ordnernamen zur Hand hat,
     soll damit auch ans Zeichen kommen. */
  const ALIAS = {
    'KnowledgeStack': 'knowledgestack',
    'Caesercode':     'caesar',
    'NeuroLab':       'neurolab',
    'ScrumWerkstatt': 'scrum',
    'Projektarbeit':  'projekt',
    'TinyLM':         'tinylm',
    'DefinitionsDerby': 'derby',
    'SQLStudio':      'sqlstudio',
    'MasterPDF':      'masterpdf',
    'Master PDF Skill': 'masterpdf'
  };

  function key(id) {
    const k = String(id || '').trim();
    return GLYPHS[k] ? k : (GLYPHS[ALIAS[k]] ? ALIAS[k] : 'skill');
  }

  /* Gibt HTML zurück und kein Element: alle Aufrufstellen bauen
     ihre Kacheln als Zeichenkette zusammen. Wer ein Element
     braucht, setzt das hier per innerHTML ein.

     aria-hidden, weil daneben immer der Name des Skills steht — ein
     vorgelesenes „Bild" wäre dort nur Lärm. */
  function svg(id, extraClass) {
    const cls = 'mpic' + (extraClass ? ' ' + extraClass : '');
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
         + GLYPHS[key(id)] + '</svg>';
  }

  /* Zeichen + Name als ein Stück, für die Reiter und die Tür: dort
     stand bisher „🧩 Wortwolke" in einem einzigen textContent. */
  function label(id, text, extraClass) {
    const t = String(text == null ? '' : text);
    const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return svg(id, extraClass) + `<span class="mpic-t">${esc}</span>`;
  }

  window.MPIcons = { svg, label, has: (id) => key(id) !== 'skill' };
})();
