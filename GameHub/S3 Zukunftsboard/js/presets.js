/* Reality Check — vorgefertigte Karten für die Lehrkraft.

   Zweck: In Phase 3 hängt das Gespräch daran, dass überhaupt etwas
   Belastbares auf dem Board liegt. Was der Kurs nicht selbst gefunden
   hat, wirft die Lehrkraft dazu — aber nicht, indem sie mitten in der
   Besprechung eine Quellenangabe abtippt. Die Karten stehen hier fertig
   und sind im Formular einen Klick entfernt.

   Bewusst eine Datei im Repo und keine Tabelle:
     • Sie gehören keinem Kurs und keiner Schule — sie sind Material,
       wie die PDFs in Dokumente/.
     • Sie sollen im Spiel NICHT editierbar sein. Was hier steht, ändert
       man hier, mit Blick auf alle Karten gleichzeitig.
     • Kein RPC, keine RLS, keine Migration für einen Textbaustein.

   Gelesen wird die Datei nur von Admins (board.js zeigt den Knopf nur
   ihnen); geladen wird sie trotzdem für alle — 6 KB, und ein zweiter
   Ladepfad wäre teurer als die Datei.

   ── Aufbau eines Eintrags ────────────────────────────────────
     kind          'fakt' (Recherche) oder 'idee' (Post-It).
                   Gefiltert wird nach kind UND category — man sieht im
                   Formular immer nur, was dorthin gehört.
     category      persoenlich · gesellschaftlich · politisch ·
                   bildung · wirtschaftlich · umwelt
     stance        chance · risiko · vermutung
     topics        [] bis ['ki','socialmedia','gaming'] — darf leer sein
     text          max. 200 Zeichen, min. 3
     source_url    Pflicht bei kind:'fakt', vollständige https-Adresse
     source_author Pflicht bei kind:'fakt' — wer den Text geschrieben hat
     source_date   Pflicht bei kind:'fakt', Format 'YYYY-MM'.
                   Darf nicht in der Zukunft liegen, sonst weist das
                   Formular die Karte ab (dieselbe Regel wie beim
                   Selbsteintragen).

   Alles hier ist Platzhalter — offensichtlicher Unsinn, damit niemand
   ihn versehentlich für einen echten Fund hält. Die Nummerierung läuft
   quer durch alle Bereiche durch (Fakt 1–18), damit man beim Testen
   sofort sieht, dass die Auswahl wirklich nach Bereich filtert:
   Persönlich hat 1–3, Gesellschaftlich 4–6, und so weiter.           */
window.BOARD_PRESETS = [

  /* ── 🧍 Persönlich ─────────────────────────────────────── */
  { kind: 'fakt', category: 'persoenlich', stance: 'risiko',
    topics: ['socialmedia'],
    text: 'Fakt 1 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.google.de',
    source_author: 'Mustermann, Max', source_date: '2025-01' },

  { kind: 'fakt', category: 'persoenlich', stance: 'chance',
    topics: ['ki'],
    text: 'Fakt 2 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://de.wikipedia.org',
    source_author: 'Musterfrau, Erika', source_date: '2025-02' },

  { kind: 'fakt', category: 'persoenlich', stance: 'vermutung',
    topics: ['gaming'],
    text: 'Fakt 3 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.tagesschau.de',
    source_author: 'Beispiel, Bea', source_date: '2025-03' },

  /* ── 👥 Gesellschaftlich ───────────────────────────────── */
  { kind: 'fakt', category: 'gesellschaftlich', stance: 'risiko',
    topics: ['socialmedia', 'ki'],
    text: 'Fakt 4 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.google.de',
    source_author: 'Mustermann, Max', source_date: '2025-04' },

  { kind: 'fakt', category: 'gesellschaftlich', stance: 'chance',
    topics: [],
    text: 'Fakt 5 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://de.wikipedia.org',
    source_author: 'Musterfrau, Erika', source_date: '2025-05' },

  { kind: 'fakt', category: 'gesellschaftlich', stance: 'vermutung',
    topics: ['socialmedia'],
    text: 'Fakt 6 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.tagesschau.de',
    source_author: 'Beispiel, Bea', source_date: '2025-06' },

  /* ── 🏛️ Politisch ──────────────────────────────────────── */
  { kind: 'fakt', category: 'politisch', stance: 'risiko',
    topics: ['ki'],
    text: 'Fakt 7 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.google.de',
    source_author: 'Mustermann, Max', source_date: '2025-07' },

  { kind: 'fakt', category: 'politisch', stance: 'chance',
    topics: ['socialmedia'],
    text: 'Fakt 8 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://de.wikipedia.org',
    source_author: 'Musterfrau, Erika', source_date: '2025-08' },

  { kind: 'fakt', category: 'politisch', stance: 'vermutung',
    topics: [],
    text: 'Fakt 9 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.tagesschau.de',
    source_author: 'Beispiel, Bea', source_date: '2025-09' },

  /* ── 📚 Wissen & Bildung ───────────────────────────────── */
  { kind: 'fakt', category: 'bildung', stance: 'chance',
    topics: ['ki'],
    text: 'Fakt 10 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.google.de',
    source_author: 'Mustermann, Max', source_date: '2025-10' },

  { kind: 'fakt', category: 'bildung', stance: 'risiko',
    topics: ['ki', 'socialmedia'],
    text: 'Fakt 11 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://de.wikipedia.org',
    source_author: 'Musterfrau, Erika', source_date: '2025-11' },

  { kind: 'fakt', category: 'bildung', stance: 'vermutung',
    topics: ['gaming'],
    text: 'Fakt 12 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.tagesschau.de',
    source_author: 'Beispiel, Bea', source_date: '2025-12' },

  /* ── 💶 Wirtschaftlich ─────────────────────────────────── */
  { kind: 'fakt', category: 'wirtschaftlich', stance: 'chance',
    topics: ['ki'],
    text: 'Fakt 13 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.google.de',
    source_author: 'Mustermann, Max', source_date: '2026-01' },

  { kind: 'fakt', category: 'wirtschaftlich', stance: 'risiko',
    topics: ['gaming'],
    text: 'Fakt 14 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://de.wikipedia.org',
    source_author: 'Musterfrau, Erika', source_date: '2026-02' },

  { kind: 'fakt', category: 'wirtschaftlich', stance: 'vermutung',
    topics: ['socialmedia'],
    text: 'Fakt 15 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.tagesschau.de',
    source_author: 'Beispiel, Bea', source_date: '2026-03' },

  /* ── 🌱 Umwelt ─────────────────────────────────────────── */
  { kind: 'fakt', category: 'umwelt', stance: 'risiko',
    topics: ['ki'],
    text: 'Fakt 16 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.google.de',
    source_author: 'Mustermann, Max', source_date: '2026-04' },

  { kind: 'fakt', category: 'umwelt', stance: 'chance',
    topics: [],
    text: 'Fakt 17 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://de.wikipedia.org',
    source_author: 'Musterfrau, Erika', source_date: '2026-05' },

  { kind: 'fakt', category: 'umwelt', stance: 'vermutung',
    topics: ['gaming'],
    text: 'Fakt 18 — Platzhalter, hier steht später ein echter Fund.',
    source_url: 'https://www.tagesschau.de',
    source_author: 'Beispiel, Bea', source_date: '2026-06' }

  /* Post-It-Vorlagen (kind: 'idee') kämen genauso hier hinein — ohne
     Quellenfelder. Der Wähler im Formular filtert nach kind und würde
     sie in Phase 1 zeigen. Bisher gibt es keine: Post-Its soll der Kurs
     selbst schreiben, das ist der Punkt von Phase 1.                 */
];
