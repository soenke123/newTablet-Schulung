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

   ── Woher der Inhalt kommt ───────────────────────────────────
   Zwei Karten je Bereich, ausgewählt von Sönke. Alle Quellen stehen im
   Quellenverzeichnis zur Schulung 3 (Dokumente/Quellenverzeichnis_
   Tabletschulung S3.pdf), Kapitel II „Reality Check" — dort in genau
   dieser Bereichsreihenfolge. Wer eine Karte ändert, ändert sie dort
   mit, sonst zeigt das Board eine Quelle, die im Handout fehlt.

   Eine Karte trägt genau EINE Quelle. Wo Sönkes Vorlage zwei Studien
   nannte, steht hier nur die Aussage, die die verlinkte Quelle selbst
   deckt — auf einer Recherche-Karte soll der Text durch den Link zu
   belegen sein, das ist der ganze Punkt der Kartenart.

   Vier Quellen nennen im Verzeichnis nur das Jahr. Der Monat ist unten
   je Karte als „Monat geschätzt" markiert; er beeinflusst nur die
   Anzeige (formatMonthYear zeigt MM.JJJJ), nicht die Zuordnung.     */
window.BOARD_PRESETS = [

  /* ── 🧍 Persönlich ─────────────────────────────────────── */
  { kind: 'fakt', category: 'persoenlich', stance: 'risiko',
    topics: ['socialmedia'],
    text: 'Ab mehr als 3 Stunden Social Media am Tag verdoppelt sich bei Jugendlichen das Risiko für Ängste und depressive Symptome.',
    source_url: 'https://www.hhs.gov/surgeongeneral/priorities/youth-mental-health/index.html',
    source_author: 'U.S. Surgeon General (Vivek H. Murthy)', source_date: '2023-05' },

  { kind: 'fakt', category: 'persoenlich', stance: 'risiko',
    topics: ['socialmedia', 'ki'],
    text: 'Jugendliche sind im Schnitt 231 Minuten am Tag am Smartphone — knapp 4 Stunden. 74 % nutzen KI-Tools für Schularbeiten, ChatGPT sogar 84 %.',
    source_url: 'https://mpfs.de/app/uploads/2025/11/PM_JIM-2025.pdf',
    source_author: 'Medienpädagogischer Forschungsverbund Südwest (mpfs)', source_date: '2025-11' },

  /* ── 👥 Gesellschaftlich ───────────────────────────────── */
  { kind: 'fakt', category: 'gesellschaftlich', stance: 'chance',
    topics: ['socialmedia'],
    text: 'Ein britisches Pilotprojekt zeigt: Eine App-Sperre von 21 bis 7 Uhr war für Familien am besten machbar — und brachte sofort mehr Schlaf, Konzentration und gemeinsame Zeit.',
    source_url: 'https://www.gov.uk/government/publications/social-media-restriction-pilots-qualitative-research-with-13-to-17-year-olds-in-the-uk',
    source_author: 'UK Department for Science, Innovation and Technology (DSIT) & Savanta', source_date: '2026-02' },

  { kind: 'fakt', category: 'gesellschaftlich', stance: 'chance',
    topics: ['socialmedia'],
    text: 'Staaten ziehen Grenzen: Australien hat Social Media für unter 16-Jährige verboten. Das Gesetz nimmt dabei die Plattformen in die Pflicht, nicht die Jugendlichen.',
    source_url: 'https://www.legislation.gov.au/',
    source_author: 'Parliament of Australia', source_date: '2024-11' },

  /* ── 🏛️ Politisch ──────────────────────────────────────── */
  { kind: 'fakt', category: 'politisch', stance: 'risiko',
    topics: ['socialmedia'],
    /* Monat geschätzt: Verzeichnis nennt nur 2021 (Annals of the ICA 45/3). */
    text: 'Wer nur Inhalte konsumiert, die die eigene Meinung spiegeln, driftet messbar zu extremeren Haltungen. Eine Auswertung vieler Studien sieht darin einen Treiber gesellschaftlicher Spaltung.',
    source_url: 'https://academic.oup.com/anncom/article/45/3/188/7912664',
    source_author: 'Kubin, Emily / von Sikorski, Christian', source_date: '2021-07' },

  { kind: 'fakt', category: 'politisch', stance: 'risiko',
    topics: ['ki'],
    /* Monat geschätzt: Verzeichnis nennt nur 2024 (Nature Communications 15, 8168). */
    text: 'Gefälschte Videos politischer Reden erkennen Menschen noch halbwegs. Bei reinem Audio versagt das Gehör: KI-Fälschungen sind kaum noch sicher von echten Aufnahmen zu unterscheiden.',
    source_url: 'https://www.nature.com/articles/s41467-024-51998-z',
    source_author: 'Groh, Matthew et al.', source_date: '2024-09' },

  /* ── 💶 Wirtschaftlich ─────────────────────────────────── */
  { kind: 'fakt', category: 'wirtschaftlich', stance: 'vermutung',
    topics: ['ki'],
    text: 'Rund 40 % der Jobs weltweit sind von KI betroffen, in reichen Ländern sogar 60 %. Der IWF betont: Aufgaben werden umgebaut und aufgewertet — ganze Berufe verschwinden meist nicht.',
    source_url: 'https://www.imf.org/en/blogs/articles/2024/01/14/ai-will-transform-the-global-economy-lets-make-sure-it-benefits-humanity',
    source_author: 'Georgieva, Kristalina / Internationaler Währungsfonds (IWF)', source_date: '2024-01' },

  { kind: 'fakt', category: 'wirtschaftlich', stance: 'chance',
    topics: ['ki'],
    text: 'In einem Experiment mit beruflichen Schreibaufgaben senkte ChatGPT die Bearbeitungszeit um 40 % — und die Qualität der Texte stieg dabei um 18 %.',
    source_url: 'https://www.science.org/doi/10.1126/science.adh2586',
    source_author: 'Noy, Shakked / Zhang, Whitney', source_date: '2023-07' },

  /* ── 📚 Wissen & Bildung ───────────────────────────────── */
  { kind: 'fakt', category: 'bildung', stance: 'risiko',
    topics: [],
    /* Monat geschätzt: Verzeichnis nennt nur 2025 (Computers in Human Behavior 162). */
    text: 'Wer beim Lernen nebenbei am Handy etwas anderes macht, erinnert sich danach deutlich schlechter. 27 Experimente mit 2.245 Teilnehmenden zeigen einen mittleren bis starken Negativeffekt.',
    source_url: 'https://doi.org/10.1016/j.chb.2024.108432',
    source_author: 'Chen, Q. / Yan, Z. / Moeyaert, M. / Bangert-Drowns, R.', source_date: '2025-01' },

  { kind: 'fakt', category: 'bildung', stance: 'risiko',
    topics: ['ki'],
    text: 'Eine Standard-KI, die nur vorsagt, senkte die spätere Prüfungsleistung um 17 %. Ein KI-Tutor mit Leitplanken, der zum Selberdenken zwingt, steigerte das Verständnis dagegen um 127 %.',
    source_url: 'https://doi.org/10.1073/pnas.2422633122',
    source_author: 'Bastani, Hamsa et al.', source_date: '2025-02' },

  /* ── 🌱 Umwelt ─────────────────────────────────────────── */
  { kind: 'fakt', category: 'umwelt', stance: 'vermutung',
    topics: ['ki'],
    /* Monat geschätzt: Verzeichnis nennt 2024/2025 (IEA „Energy and AI"). */
    text: 'Der Hunger der KI-Server treibt den weltweiten Stromverbrauch von Rechenzentren bis 2030 auf rund 945 TWh — fast 3 % des gesamten Strombedarfs der Welt.',
    source_url: 'https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai',
    source_author: 'International Energy Agency (IEA)', source_date: '2025-04' },

  { kind: 'fakt', category: 'umwelt', stance: 'risiko',
    topics: [],
    text: '62 % der Klimabelastung eines Smartphones entstehen bei Rohstoffen und Produktion, nicht beim Laden. Wer es 3 statt 2 Jahre nutzt, spart pro Jahr rund 25–30 % CO2.',
    source_url: 'https://link.springer.com/article/10.1111/jiec.13119',
    source_author: 'Cordella, Mauro / Alfieri, Felice / Sanfelix, Javier', source_date: '2021-04' }

  /* Post-It-Vorlagen (kind: 'idee') kämen genauso hier hinein — ohne
     Quellenfelder. Der Wähler im Formular filtert nach kind und würde
     sie in Phase 1 zeigen. Bisher gibt es keine: Post-Its soll der Kurs
     selbst schreiben, das ist der Punkt von Phase 1.                 */
];
