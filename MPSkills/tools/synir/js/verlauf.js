/* ══════════════════════════════════════════════════════════════
   Netzwerk-Prototyp — verlauf.js   ·   Rückgängig und Wiederher-
                                        stellen (Strg + Z / Strg + Y)
   ══════════════════════════════════════════════════════════════
   Der Wunsch war knapp: „Ich will die Standard Office short Cuts
   haben. Vor allem bei Geräten. Strg z und strg y." Genau das —
   ohne einen einzigen Knopf in der Oberfläche, weil es keinen
   braucht: ein Kind, das je ein Textprogramm bedient hat, kennt
   diese beiden Tasten.

   Filius hat das NICHT. Wer dort ein Gerät löscht, baut es neu,
   mitsamt allen Adressen, die darin standen. Das ist einer der
   Punkte, an denen eine Klasse aufgibt — und einer der wenigen,
   an denen von Filius abzuweichen nichts kostet: das Bedienmodell
   bleibt, es kommt nur eine Umkehrtaste dazu.

   ── ZUSTÄNDE, nicht Befehle ───────────────────────────────────
   Es gibt zwei Bauarten für so etwas. Die eine merkt sich jeden
   BEFEHL („Gerät n-7 gelöscht") und kann ihn umkehren. Die andere
   merkt sich nach jeder Änderung den ganzen ZUSTAND und stellt ihn
   wieder her. Hier ist es die zweite, und zwar aus einem Grund,
   der schwerer wiegt als der Speicherverbrauch:

   ⚠️ Ein Netz wird an ungefähr zwanzig Stellen verändert —
   konfig.js (jedes Adressfeld, DHCP, Netzwerkkarten an- und
   abbauen), panels.js (Kabel, Ein/Aus, Löschen), geraet.js
   (Einstellungen im Betrieb), flaeche.js (Verschieben, Verkabeln),
   app.js (Anlegen, Einfügen). Jede dieser Stellen müsste ihren
   Gegenbefehl selbst mitliefern und beim nächsten Umbau
   mitpflegen. Eine vergessene Stelle fällt nicht auf: der Stapel
   ist dann nicht leer, sondern FALSCH — Strg+Z stellt einen Stand
   her, den es nie gab. Das ist die schlimmste Sorte Fehler, weil
   niemand ihm mehr traut.

   `netz.toJSON()` gibt es dagegen schon, es ist geprüft, und es
   ist genau die Bauanleitung des Netzes: was nicht darin steht
   (geliehene DHCP-Angaben, Funkbuchsen, ARP-Tabellen), gehört auch
   nicht in den Verlauf. Ein Stand ist bei zwanzig Geräten wenige
   Kilobyte Text; sechzig davon sind nichts.

   ── Was ein Schritt ist ───────────────────────────────────────
   Nicht jeder Tastendruck. Wer „192.168.1.10" in ein Adressfeld
   tippt, löst zwölf Änderungen aus — zwölfmal Strg+Z zu drücken,
   um eine Adresse zurückzunehmen, wäre die Sorte Genauigkeit, die
   keiner will. Änderungen mit derselben Bezeichnung, die innerhalb
   von ZUSAMMEN_MS aufeinander folgen, werden deshalb zu EINEM
   Schritt verschmolzen (der obere Stand wird ersetzt, nicht ein
   neuer aufgelegt). Dieselbe Regel hat jedes Textprogramm.

   ⚠️ Und: ein Stand, der mit dem obersten wörtlich übereinstimmt,
   wird gar nicht erst aufgelegt. Ohne diese Zeile stünden im
   Stapel lauter leere Schritte — jeder Klick auf ein Gerät ruft
   irgendwo save(), und der DHCP-Server frischt viermal je Sekunde
   auf. Strg+Z hätte dann sichtbar nichts getan, und zwar
   mehrfach hintereinander.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Wie viele Schritte zurück. Sechzig ist großzügig gewählt: eine
     Unterrichtsstunde an einem Netz sind vielleicht dreißig
     Änderungen, und mehr als „bis zum Anfang der Stunde" will
     niemand. Darüber fällt der älteste weg. */
  const TIEFE = 60;

  /* Wie lange zwei gleichartige Änderungen noch als eine gelten.
     600 ms ist länger als der Abstand zwischen zwei Tastendrücken
     und kürzer als die Pause, nach der jemand etwas anderes tut. */
  const ZUSAMMEN_MS = 600;

  function Verlauf(netz, opts) {
    opts = opts || {};

    /* Ein Eintrag: { text, label }. `text` ist der Stand als JSON-
       Zeichenkette — als Zeichenkette und nicht als Objekt, weil
       der Vergleich „hat sich überhaupt etwas geändert?" damit ein
       Zeichenkettenvergleich ist und nicht ein Baumvergleich. */
    let stapel = [];
    let i = -1;                 // welcher Eintrag gilt gerade
    let zuletzt = 0;            // Zeitpunkt des letzten merken()
    let letztesLabel = '';
    /* Während ein Stand wiederhergestellt wird, feuern netz.changed
       und save() — und damit wieder merken(). Ohne diese Sperre
       legte jedes Rückgängig einen neuen Eintrag auf den Stapel und
       man käme nie zurück. */
    let stellt = false;

    const stand = () => JSON.stringify(netz.toJSON());

    /* Der Anfang, und der Rückweg nach „neu" oder „Szenario
       geladen": ein Stapel mit genau einem Eintrag, dem jetzigen
       Stand. Ohne ihn hätte der erste Strg+Z nichts, wohin er
       zurückkönnte — der Zustand VOR der ersten Änderung ist selbst
       ein Schritt. */
    function leeren() {
      stapel = [{ text: stand(), label: '' }];
      i = 0;
      zuletzt = 0;
      letztesLabel = '';
      melden();
    }

    /* Nach einer Änderung aufrufen, nicht davor. `label` ist das,
       was in der Kurzmeldung steht („Gerät verschoben") und
       zugleich der Schlüssel fürs Verschmelzen. */
    function merken(label) {
      if (stellt) return;
      if (i < 0) { leeren(); return; }

      const text = stand();
      if (text === stapel[i].text) return;      // nichts passiert

      /* Alles, was nach dem jetzigen Stand lag, ist mit dieser
         Änderung Geschichte: wer zurückgeht und dann etwas Neues
         tut, hat den alten Zweig verworfen. So macht es jedes
         Programm mit einem Verlauf. */
      if (i < stapel.length - 1) stapel.length = i + 1;

      const jetzt = Date.now();
      const verschmelzen = i > 0
        && label && label === letztesLabel
        && (jetzt - zuletzt) < ZUSAMMEN_MS;

      if (verschmelzen) {
        stapel[i] = { text, label };
      } else {
        stapel.push({ text, label: label || 'Änderung' });
        i = stapel.length - 1;
        if (stapel.length > TIEFE) { stapel.shift(); i--; }
      }
      zuletzt = jetzt;
      letztesLabel = label || '';
      melden();
    }

    /* Einen Stand herstellen. `fromJSON` baut das Netz neu auf —
       also sind danach alle Tabellen leer und alle Fenster zeigen
       auf Geräte, die es vielleicht nicht mehr gibt. Beides räumt
       der Rückruf auf (app.js); hier wird nur dafür gesorgt, dass
       das Herstellen selbst keinen neuen Eintrag erzeugt. */
    function herstellen(eintrag, was, richtung) {
      stellt = true;
      try {
        netz.fromJSON(JSON.parse(eintrag.text));
      } finally {
        stellt = false;
      }
      /* Nach dem Herstellen fängt das Verschmelzen von vorn an:
         sonst würde die nächste Änderung mit dem Schritt
         verschmolzen, den man gerade zurückgenommen hat. */
      zuletzt = 0;
      letztesLabel = '';
      melden();
      if (opts.onApply) opts.onApply(was, richtung);
    }

    function undo() {
      if (i <= 0) return false;
      const was = stapel[i].label;       // DIESER Schritt wird zurückgenommen
      i--;
      herstellen(stapel[i], was, 'zurueck');
      return true;
    }

    function redo() {
      if (i < 0 || i >= stapel.length - 1) return false;
      i++;
      herstellen(stapel[i], stapel[i].label, 'vor');
      return true;
    }

    function melden() { if (opts.onChange) opts.onChange(); }

    return {
      leeren, merken, undo, redo,
      get kannZurueck() { return i > 0; },
      get kannVor() { return i >= 0 && i < stapel.length - 1; },
      // Für den Prüfstand und die Fehlersuche.
      get tiefe() { return stapel.length; },
      get stelle() { return i; },
      get naechstesZurueck() { return i > 0 ? stapel[i].label : ''; }
    };
  }

  window.Verlauf = Verlauf;
})();
