// =====================================================================
// LLM-Quiz · App-Logik (Vanilla JS, Pointer Events für Touch + Maus)
// Flow: intro → puzzle1 → map → (quiz × 7) → puzzle2 → end
// =====================================================================
const gameId  = new URLSearchParams(window.location.search).get('id')  || 'game15';
const eggType = new URLSearchParams(window.location.search).get('egg');
let gd;

const ASSETS = {
  leicht: "Wie funktoniert ein LLM leicht.png",
  komplex: "Wie funktioniet ein LLM.png",
};

// 7 Stationen mit Position (% auf dem Poster) und Titel.
const STATIONS = [
  { id: 1, title: "Was ist ein LLM?",       x: 65, y:  6 },
  { id: 2, title: "Training",               x: 41, y: 25 },
  { id: 3, title: "Wichtig zu wissen",      x:  7, y: 48 },
  { id: 4, title: "Bekannte LLMs",          x: 35, y: 48 },
  { id: 5, title: "Stärken & Risiken",      x: 75, y: 48 },
  { id: 6, title: "Vom Prompt zur Antwort", x: 25, y: 70 },
  { id: 7, title: "Schlüsselkonzepte",      x: 48, y: 90 },
];

// Quiz-Inhalte pro Station
const QUIZZES = {
  1: {
    type: "lueckentext",
    text: "ChatGPT, Claude und Gemini werden oft als {0} bezeichnet – das stimmt, ist aber ungenau. Künstliche Intelligenz beschreibt Systeme, die durch eine {1} Muster gelernt haben: Bildgeneratoren, Empfehlungsalgorithmen und vieles mehr. Bei ChatGPT & Co. handelt es sich speziell um {2} (Large Language Models) – trainiert mit riesigen Mengen an {3}, aus denen sie selbständig Sprache erzeugen.",
    blanks: ["KI", "Trainingsphase", "LLMs", "Texten"],
    distractors: ["Roboter", "Testphase", "Bildern"],
  },
  2: {
    type: "multiplechoice",
    sections: [
      {
        title: "Trainingsdaten",
        info: "Trainingsdaten werden benötigt, um ein LLM zu trainieren — aber was für Daten sind das eigentlich?",
        pick: 2,
        questions: [
          {
            text: "Welche Quellen werden beim Pre-Training als Trainingsdaten genutzt?",
            multi: true,
            explanation: "Beim Pre-Training fließen alle Textarten ein — gesprochene Audiodateien müssten erst transkribiert werden und zählen nicht als direkte Quelle.",
            options: [
              { text: "Bücher", correct: true },
              { text: "Webseiten", correct: true },
              { text: "Foren & Gespräche", correct: true },
              { text: "Code & Dokus", correct: true },
              { text: "Gesprochene Audiodateien (z. B. Podcasts)", correct: false },
            ],
          },
          {
            text: "Was sind „Trainingsdaten” beim Pre-Training?",
            multi: false,
            explanation: "Im Gegensatz zu Fine-Tuning-Daten sind Pre-Training-Daten riesig, unstrukturiert und kommen aus sehr vielen verschiedenen Quellen — kein Kuratieren, nur Masse.",
            options: [
              { text: "Frage-Antwort-Paare, die von Experten kuratiert wurden", correct: false },
              { text: "Gigantische Mengen unstrukturierter Texte aus vielen Quellen", correct: true },
              { text: "Sorgfältig geprüfte wissenschaftliche Fachpublikationen", correct: false },
              { text: "Strukturierte Wissensdatenbanken aus Lexika und Enzyklopädien", correct: false },
            ],
          },
          {
            text: "Warum kommen die Trainingsdaten aus so vielen verschiedenen Quellen?",
            multi: false,
            explanation: "Viele verschiedene Quellen sorgen dafür, dass das Modell Sprache in allen möglichen Kontexten kennenlernt — das ist die Grundlage für ein breites Allgemeinverständnis.",
            options: [
              { text: "Damit das Modell möglichst viele konkrete Fakten kennt und abrufen kann", correct: false },
              { text: "Um das Modell auf eine bestimmte Aufgabe zu spezialisieren", correct: false },
              { text: "Damit das Modell ein breites Grundwissen über Sprache und Welt aufbaut", correct: true },
              { text: "Damit Fehler in einzelnen Quellen durch andere Quellen ausgeglichen werden", correct: false },
            ],
          },
          {
            text: "Welche Aussagen über Pre-Training-Daten stimmen?",
            multi: true,
            explanation: "Pre-Training-Daten sind bewusst riesig und breit gestreut — automatisches Filtern auf Qualität findet bei diesem Schritt noch nicht statt.",
            options: [
              { text: "Die Daten sind unstrukturiert und kommen aus vielen Quellen", correct: true },
              { text: "Die Daten werden automatisch auf Qualität und Relevanz gefiltert", correct: false },
              { text: "Es werden sehr große Datenmengen genutzt", correct: true },
              { text: "Die Datenmenge ist bewusst begrenzt, um Overfitting zu vermeiden", correct: false },
            ],
          },
        ],
      },
      {
        title: "Pre-Training",
        info: "Im Pre-Training wird eine Grundlage erschaffen — aber was passiert dabei mit den Daten?",
        pick: 5,
        questions: [
          {
            text: "Welche Schritte gehören zum Pre-Training?",
            multi: true,
            explanation: "Das Prüfen auf problematische Inhalte und das Sicherheitstraining gehören zum Fine-Tuning — im Pre-Training wird einfach gesammelt, tokenisiert und trainiert.",
            options: [
              { text: "Daten sammeln", correct: true },
              { text: "Daten vorbereiten (Tokenisierung)", correct: true },
              { text: "Modell trainieren", correct: true },
              { text: "Daten auf problematische Inhalte prüfen und bereinigen", correct: false },
            ],
          },
          {
            text: "Was passiert beim Schritt „Vorbereiten” im Pre-Training?",
            multi: false,
            explanation: "Tokenisierung bedeutet: Text in kleine Einheiten zerlegen und als Zahlen kodieren — damit das Modell mathematisch damit rechnen kann.",
            options: [
              { text: "Das Modell wird auf eine Fachaufgabe spezialisiert", correct: false },
              { text: "Menschen kontrollieren den Lernfortschritt des Modells", correct: false },
              { text: "Texte werden in Tokens zerlegt und in Zahlen umgewandelt", correct: true },
              { text: "Unerwünschte Inhalte werden automatisch aus den Daten entfernt", correct: false },
            ],
          },
          {
            text: "Was ist ein Token?",
            multi: false,
            explanation: "Ein Token ist meist ein Wort oder Wortteil — „Tokenisierung” wird z. B. in mehrere Tokens aufgeteilt. Es ist kein semantisches Konzept, nur eine Text-Einheit.",
            options: [
              { text: "Die kleinste bedeutungstragende Einheit eines Satzes", correct: false },
              { text: "Ein kleines Textstück (z. B. ein Wort oder Wortteil), das als Zahl kodiert wird", correct: true },
              { text: "Ein Vektor, der die Bedeutung eines ganzen Ausdrucks zusammenfasst", correct: false },
              { text: "Ein spezieller Marker, der Satzgrenzen im Text kennzeichnet", correct: false },
            ],
          },
          {
            text: "Was lernt das Modell beim Pre-Training?",
            multi: true,
            explanation: "Das Modell lernt keine „Bedeutung” im menschlichen Sinne — es optimiert statistische Muster, um vorherzusagen, welche Tokens häufig aufeinanderfolgen.",
            options: [
              { text: "Statistische Muster und Beziehungen zwischen Tokens", correct: true },
              { text: "Für jeden Token Wahrscheinlichkeiten für den nächsten Token vorherzusagen", correct: true },
              { text: "Welche Antworten Menschen als hilfreich empfinden", correct: false },
              { text: "Die genaue Bedeutung von Wörtern im menschlichen Sinne zu verstehen", correct: false },
            ],
          },
          {
            text: "Was ist das Ergebnis des Pre-Trainings?",
            multi: false,
            explanation: "Das Base Model ist ein Ausgangspunkt: Sprachkompetenz vorhanden, aber noch kein spezialisiertes Verhalten und keine Sicherheitsrichtlinien.",
            options: [
              { text: "Ein einsatzbereites Modell, das bereits auf Sicherheit und Nutzen optimiert wurde", correct: false },
              { text: "Ein Grundmodell (Base Model) mit allgemeinem Sprachverständnis", correct: true },
              { text: "Ein Modell, das alle gängigen Aufgaben bereits kompetent beherrscht", correct: false },
              { text: "Ein Modell, das bereits mit menschlichem Feedback optimiert wurde", correct: false },
            ],
          },
          {
            text: "Wie „lernt” das Modell beim Pre-Training?",
            multi: false,
            explanation: "Das Modell sieht Text, versucht den nächsten Token vorherzusagen, vergleicht mit dem echten Token und passt seine Parameter an — das passiert Milliarden Mal.",
            options: [
              { text: "Es liest Texte wie ein Mensch und versteht deren Bedeutung", correct: false },
              { text: "Es lernt, den nächsten Token vorherzusagen, und optimiert dabei statistische Muster", correct: true },
              { text: "Es optimiert seine Antworten anhand von Nutzerbewertungen", correct: false },
              { text: "Es bewertet generierte Texte mithilfe eines separaten Bewertungsmodells", correct: false },
            ],
          },
          {
            text: "In welche Form werden Texte beim Pre-Training umgewandelt?",
            multi: false,
            explanation: "Computer können nur mit Zahlen rechnen — deshalb wird jeder Token in eine numerische ID oder einen Vektor umgewandelt, bevor das Modell damit arbeiten kann.",
            options: [
              { text: "Buchstaben und Satzzeichen werden einzeln gespeichert", correct: false },
              { text: "Wörter werden nach ihrer Häufigkeit in einem Wörterbuch indexiert", correct: false },
              { text: "Zahlen (Token-IDs / Vektoren)", correct: true },
              { text: "Sätze werden als vollständige Einheiten in einer Datenbank abgelegt", correct: false },
            ],
          },
          {
            text: "Welche dieser Aussagen zum Pre-Training ist FALSCH?",
            multi: false,
            explanation: "Was Menschen gut oder schlecht finden, lernt das Modell erst durch RLHF — im Pre-Training geht es nur ums reine Sprachmodellieren ohne Präferenzfeedback.",
            options: [
              { text: "Beim Pre-Training werden riesige Textmengen verarbeitet", correct: false },
              { text: "Das Modell lernt dabei, was Menschen gut oder schlecht finden", correct: true },
              { text: "Das Ergebnis ist ein Grundmodell (Base Model)", correct: false },
              { text: "Texte werden vor dem Training in Tokens zerlegt", correct: false },
            ],
          },
          {
            text: "Warum spricht man beim Pre-Training von „Basis-Wissen”?",
            multi: false,
            explanation: "„Basis” heißt: allgemeine Sprachkompetenz ist da, aber noch kein ausgerichtetes Verhalten — der Rohling, der beim Fine-Tuning erst geformt wird.",
            options: [
              { text: "Weil das Modell im Pre-Training noch keine komplexen Zusammenhänge versteht", correct: false },
              { text: "Weil nach dem Pre-Training kein weiteres Training mehr notwendig ist", correct: false },
              { text: "Weil das Modell allgemeines Sprachverständnis aufbaut, das später verfeinert wird", correct: true },
              { text: "Weil das Modell nach dem Pre-Training bereits für einfache Aufgaben einsetzbar ist", correct: false },
            ],
          },
          {
            text: "Was bedeutet Tokenisierung?",
            multi: false,
            explanation: "Tokenisierung = Text in Einheiten zerlegen und als Zahlen kodieren. Keine grammatikalische Analyse, keine Häufigkeitsgewichtung — nur strukturiertes Zerstückeln.",
            options: [
              { text: "Texte werden in kleine Einheiten zerlegt und als Zahlen kodiert", correct: true },
              { text: "Wörter werden nach ihrer Häufigkeit im Text gewichtet und gespeichert", correct: false },
              { text: "Texte werden in ihre grammatikalischen Grundformen zerlegt", correct: false },
              { text: "Texte werden in thematische Abschnitte unterteilt und klassifiziert", correct: false },
            ],
          },
          {
            text: "Welche Eigenschaften hat das Base Model nach dem Pre-Training?",
            multi: true,
            explanation: "Nach dem Pre-Training kann das Modell Texte generieren — aber es ist noch nicht auf hilfreiche oder sichere Antworten ausgerichtet.",
            options: [
              { text: "Es kann Sprache verstehen und generieren", correct: true },
              { text: "Es hat noch kein spezialisiertes Fachwissen", correct: true },
              { text: "Es ist bereits sicher und hilfreich für alle Aufgaben", correct: false },
              { text: "Es wurde bereits mit menschlichem Feedback optimiert", correct: false },
            ],
          },
          {
            text: "Warum muss nach dem Pre-Training noch Fine-Tuning stattfinden?",
            multi: false,
            explanation: "Ein Base Model würde genäuso gut schädliche Texte fortführen wie hilfreiche Antworten geben — Fine-Tuning richtet das Verhalten erst auf Sicherheit und Nützlichkeit aus.",
            options: [
              { text: "Das Grundmodell ist noch nicht auf nützliche, sichere Antworten ausgerichtet", correct: true },
              { text: "Das Grundmodell erzeugt noch keine kohärenten, verständlichen Texte", correct: false },
              { text: "Das Grundmodell hat durch das Pre-Training bereits alle nötigen Fähigkeiten entwickelt", correct: false },
              { text: "Das Grundmodell neigt nach dem Pre-Training zu inkonsistenten Sprachkenntnissen", correct: false },
            ],
          },
        ],
      },
      {
        title: "Fine-Tuning",
        info: "Das Basismodell ist fertig — aber es kann noch nicht wirklich eingesetzt werden. Was fehlt noch?",
        pick: 3,
        questions: [
          {
            text: "Was ist das Ziel von Fine-Tuning?",
            multi: false,
            explanation: "Beim Fine-Tuning bleibt das Basiswissen erhalten — nur das Verhalten des Modells wird auf eine bestimmte Aufgabe oder ein Ziel ausgerichtet.",
            options: [
              { text: "Das Modell mit neuen, noch größeren Datensätzen weiterzutrainieren", correct: false },
              { text: "Das Modell auf eine bestimmte Aufgabe oder ein Verhalten zu spezialisieren", correct: true },
              { text: "Das Basiswissen des Modells grundsätzlich zu erweitern", correct: false },
              { text: "Das Modell von Grund auf neu und kompakter zu trainieren", correct: false },
            ],
          },
          {
            text: "Wodurch unterscheiden sich Fine-Tuning-Daten von Pre-Training-Daten?",
            multi: true,
            explanation: "Fine-Tuning braucht viel weniger Daten als Pre-Training — dafür sind sie gezielt ausgewählt und auf die Zielaufgabe zugeschnitten, kein automatisches Web-Scraping.",
            options: [
              { text: "Die Datenmenge ist viel kleiner", correct: true },
              { text: "Die Daten sind kuratiert und für ein bestimmtes Ziel ausgewählt", correct: true },
              { text: "Die Daten stammen vor allem aus automatisch gesammelten Webinhalten", correct: false },
              { text: "Es werden ausschließlich synthetisch generierte Beispiele verwendet", correct: false },
            ],
          },
          {
            text: "Für welche Ziele kann Fine-Tuning eingesetzt werden?",
            multi: true,
            explanation: "Allgemeines Sprachverständnis ist durch das Pre-Training bereits da — Fine-Tuning spezialisiert das Modell, verbessert das Grundverständnis aber nicht.",
            options: [
              { text: "Medizinische Fachberatung", correct: true },
              { text: "Programmierunterstützung", correct: true },
              { text: "Kundenservice-Anwendungen", correct: true },
              { text: "Das allgemeine Sprachverständnis des Modells zu verbessern", correct: false },
            ],
          },
          {
            text: "Was ist das Ergebnis eines erfolgreichen Fine-Tunings?",
            multi: false,
            explanation: "Ein fein-getuntes Modell ist besser auf die Zielaufgabe abgestimmt — aber es ist kein perfekter Faktenchecker und macht immer noch Fehler.",
            options: [
              { text: "Ein Modell, das unabhängig vom Pre-Training völlig neu aufgebaut wurde", correct: false },
              { text: "Ein besser abgestimmtes Modell, das sicherer und hilfreicher für die Zielanwendung ist", correct: true },
              { text: "Ein Modell, das präzise Fakten speichert und immer korrekte Antworten liefert", correct: false },
              { text: "Ein Modell, das seine Antworten selbständig auf Richtigkeit prüft", correct: false },
            ],
          },
          {
            text: "Woher kommen die Daten beim Fine-Tuning?",
            multi: false,
            explanation: "Fine-Tuning-Daten stammen aus sorgfältig zusammengestellten Datensätzen — bewusst ausgewählt, nicht automatisch aus dem Web gescrapt.",
            options: [
              { text: "Aus automatisch gesammelten Webseiten und Online-Datenbanken", correct: false },
              { text: "Aus speziell ausgewählten oder erstellten, kuratierten Datensätzen", correct: true },
              { text: "Das Modell generiert seine Fine-Tuning-Daten mithilfe bereits gelernter Muster selbst", correct: false },
              { text: "Aus dem Pre-Training-Datensatz, der erneut gezielt verarbeitet wird", correct: false },
            ],
          },
          {
            text: "Was beschreibt Fine-Tuning am besten?",
            multi: false,
            explanation: "Fine-Tuning ist keine eigenständige Phase — es baut immer auf dem Grundmodell auf und verfeinert gezielt dessen Verhalten.",
            options: [
              { text: "Eine eigenständige Trainingsphase, die unabhängig vom Pre-Training stattfindet", correct: false },
              { text: "Eine Anpassungsphase, die auf dem Grundmodell aufbaut und es verfeinert", correct: true },
              { text: "Eine Phase, in der das Modell seinen eigenen Output bewertet und optimiert", correct: false },
              { text: "Das Komprimieren des Grundmodells auf ein kleineres, schnelleres Format", correct: false },
            ],
          },
        ],
      },
      {
        title: "Weitere Techniken",
        info: "Fertig? Fast. Es gibt noch clevere Methoden, die den entscheidenden Unterschied machen.",
        pick: 2,
        questions: [
          {
            text: "Was beschreibt RLHF (Reinforcement Learning from Human Feedback)?",
            multi: false,
            explanation: "Beim RLHF beurteilen Menschen, welche Antworten besser sind — das Modell lernt so, was „gut” bedeutet, nicht nur was „wahrscheinlich” ist.",
            options: [
              { text: "Das Modell lernt anhand statistischer Muster, was bevorzugte Antworten sind", correct: false },
              { text: "Menschen bewerten Modellantworten, das Modell lernt daraus, was als gut gilt", correct: true },
              { text: "Das Modell berechnet für jede Antwort automatisch eigene Belohnungspunkte", correct: false },
              { text: "Menschliche Sprachpräferenzen werden direkt in den Modellgewichten verankert", correct: false },
            ],
          },
          {
            text: "Welche weiteren Trainingstechniken gibt es neben RLHF?",
            multi: true,
            explanation: "Ensemble Learning kombiniert mehrere Modelle — das ist eine andere ML-Technik und kein Teil des LLM-Trainings-Prozesses.",
            options: [
              { text: "RLAIF (KI gibt Feedback statt Menschen)", correct: true },
              { text: "DPO (Direct Preference Optimization)", correct: true },
              { text: "Sicherheits- & Richtlinientraining", correct: true },
              { text: "Ensemble Learning (mehrere Modelle werden kombiniert)", correct: false },
            ],
          },
          {
            text: "Was unterscheidet RLAIF von RLHF?",
            multi: false,
            explanation: "RLAIF skaliert besser als RLHF, weil KI-Feedback schneller und günstiger als menschliches Feedback ist — und das Ergebnis ist oft vergleichbar.",
            options: [
              { text: "Bei RLAIF werden kleinere, kuratierte Datensätze statt großer Textmengen verwendet", correct: false },
              { text: "Bei RLAIF bewertet das Modell seine eigenen Fehler und korrigiert sie selbst", correct: false },
              { text: "Bei RLAIF gibt eine KI das Feedback auf Modellantworten statt menschlicher Bewerter", correct: true },
              { text: "Bei RLAIF wird das Feedback direkt in den Gewichten gespeichert, ohne Belohnungssignale", correct: false },
            ],
          },
          {
            text: "Was wird beim „Tool / Capability Training” trainiert?",
            multi: false,
            explanation: "Tool-Training ist eine eigene Phase — das Modell lernt, externe Werkzeuge zu nutzen. Das geht über reine Sprache hinaus, ist aber kein Bestandteil des Pre-Trainings.",
            options: [
              { text: "Das Modell lernt, neue Informationen eigenständig aus dem Internet zu recherchieren", correct: false },
              { text: "Das Modell lernt, externe Werkzeuge wie Code-Interpreter, Rechner oder Suche zu nutzen", correct: true },
              { text: "Das Modell lernt, seinen eigenen Quellcode zu verstehen und zu optimieren", correct: false },
              { text: "Das Modell erwirbt Fähigkeiten, die über Sprache hinausgehen, wie Bild- und Tonerkennung", correct: false },
            ],
          },
        ],
      },
    ],
  },
  3: {
    type: "wahrodermythos",
    fixed: [
      {
        text: "LLMs erkennen Muster aus riesigen Textmengen.",
        correct: true,
        explanation: "Genau das ist ihr Kern: kein Regelwerk, kein Wörterbuch — nur statistische Muster aus Milliarden von Texten.",
      },
      {
        text: "LLMs sagen immer das wahrscheinlichste nächste Wort.",
        correct: true,
        explanation: "Token für Token — jede Ausgabe ist die wahrscheinlichste Fortsetzung aus dem bisherigen Kontext.",
      },
    ],
    pool: [
      {
        text: "Wenn ein LLM schreibt 'Ich bin mir sicher', ist es sich wirklich sicher.",
        correct: false,
        explanation: "'Sicherheit' ist für ein LLM nur ein Wortmuster — es hat kein echtes Bewusstsein darüber, was es weiß oder nicht weiß.",
      },
      {
        text: "Das Wort 'Bank' bedeutet für ein LLM je nach Satz etwas anderes.",
        correct: true,
        explanation: "Kontext verändert die Verarbeitung. 'Ich sitze auf der Bank' und 'Ich überweise bei der Bank' aktivieren ganz andere Muster.",
      },
      {
        text: "Wenn du einem LLM schreibst 'Vergiss alles, was du weißt' — hilft das wirklich.",
        correct: false,
        explanation: "Das Wissen steckt in den Modellgewichten, nicht in einem löschbaren Speicher. Ein Befehl im Chat ändert das nicht.",
      },
      {
        text: "Ein LLM könnte auf '2 + 2 =' mit '5' antworten — und dabei nicht lügen.",
        correct: true,
        explanation: "LLMs berechnen keine Mathematik — sie schätzen, welche Antwort wahrscheinlich folgt. Wenn '5' statistisch häufig nach dieser Frage stand, kann das passieren.",
      },
      {
        text: "Ein LLM 'denkt nach', bevor es antwortet — ähnlich wie du bei einer Prüfung.",
        correct: false,
        explanation: "Es gibt kein Nachdenken — ein LLM generiert Token für Token, direkt vorwärts. Kein Innehalten, kein Überprüfen.",
      },
    ],
    pick: 3,
  },
  4: { type: "werbinich" },
  5: {
    type: "kartenSort",
    pick: 7,
    categories: [
      { id: "training", label: "Für das Training nötig",       color: "#5b4cc7", bg: "#ece9fa" },
      { id: "staerke",  label: "LLMs können gut …",            color: "#2e7d32", bg: "#e8f5e9" },
      { id: "problem",  label: "LLMs haben Probleme mit …",    color: "#c62828", bg: "#ffebee" },
    ],
    cards: [
      { text: "Milliarden Textseiten aus dem Internet",      cat: "training", icon: "database" },
      { text: "Monate lang auf tausenden GPUs rechnen",      cat: "training", icon: "chip"     },
      { text: "Menschliches Feedback zum Bewerten",          cat: "training", icon: "users"    },
      { text: "Riesige Serverfarmen mit Rechenleistung",     cat: "training", icon: "server"   },
      { text: "Beschriftete Beispieldaten für Fine-Tuning",  cat: "training", icon: "tag"      },
      { text: "Texte in Sekunden zusammenfassen",            cat: "staerke",  icon: "document" },
      { text: "Zwischen vielen Sprachen übersetzen",         cat: "staerke",  icon: "globe"    },
      { text: "Rund um die Uhr ohne Pause antworten",        cat: "staerke",  icon: "clock"    },
      { text: "Code schreiben und erklären",                 cat: "staerke",  icon: "code"     },
      { text: "Texte und Geschichten generieren",            cat: "staerke",  icon: "pencil"   },
      { text: "Fakten zuverlässig auf Richtigkeit prüfen",    cat: "problem",  icon: "warning"  },
      { text: "Vorurteile in Trainingsdaten erkennen & vermeiden", cat: "problem", icon: "scale" },
      { text: "Aktuelle Ereignisse nach dem Training kennen", cat: "problem", icon: "calendar" },
      { text: "Den echten Sinn hinter Wörtern verstehen",    cat: "problem",  icon: "question" },
      { text: "Eigene Fehler zuverlässig erkennen",          cat: "problem",  icon: "bug"      },
    ],
  },
  6: { type: "promptflow" },
  7: { type: "begriffe" },
};

// =====================================================================
// Station 7 — "Schlüsselkonzepte" (Daten)
// =====================================================================
const BEGRIFFE_DATA = {
  phase1: {
    correct: [
      "Kontextfenster",
      "Feinabstimmung",
      "Halluzination",
      "Wissensgrenze",
      "Wahrscheinlichkeit",
      "Tools",
      "Verantwortungsvoller Einsatz",
    ],
    decoys: [
      "Festplattenspeicher",
      "Echtzeit-Recherche",
      "Emotionale Intelligenz",
      "Spracherkennung",
      "Cloud-Backup",
    ],
  },
  phase2: {
    items: [
      {
        term: "Kontextfenster",
        explanation: "Dein Prompt ist mehr als deine Frage — er enthält auch den Verlauf und Systemanweisungen. Das alles passt in ein Kontextfenster. Es ist aber begrenzt: Wird es zu voll, vergisst das LLM ältere Teile des Gesprächs.",
      },
      {
        term: "Feinabstimmung",
        explanation: "Training läuft in Phasen: Pre-Training, Fine-Tuning und RLHF. Erst nach der Feinabstimmung verhält sich ein LLM wie ein hilfreicher Assistent.",
      },
      {
        term: "Halluzination",
        explanation: "LLMs können Fakten erfinden, die plausibel klingen, aber falsch sind. Wichtige Infos sollte man deshalb immer überprüfen.",
      },
      {
        term: "Wissensgrenze",
        explanation: "Ein LLM kennt nur Ereignisse bis zu einem Stichtag. Was danach passierte, ist ihm unbekannt — es weiß nicht, was es nicht weiß. Aufgebrochen werden kann diese Grenze nur durch Tools wie die Websuche.",
      },
      {
        term: "Wahrscheinlichkeit",
        explanation: "LLMs wählen immer das wahrscheinlichste nächste Token. Sie denken nicht wie Menschen, sondern schätzen die passendste Fortsetzung.",
      },
      {
        term: "Tools",
        explanation: "Moderne LLMs können Tools nutzen: Websuche, Code-Ausführung oder Datenbankabfragen — so überbrücken sie eigene Grenzen.",
      },
      {
        term: "Verantwortungsvoller Einsatz",
        explanation: "LLMs sind mächtige Werkzeuge. Wer sie nutzt, sollte Ergebnisse prüfen, Grenzen kennen und keine schädlichen Zwecke verfolgen.",
      },
    ],
    decoyExplanations: [
      "LLMs wissen immer, wenn sie falsch liegen — sie geben automatisch 'Ich weiß es nicht' aus.",
      "Jede Anfrage wird dauerhaft gespeichert und verbessert das Modell sofort in Echtzeit.",
    ],
  },
};

// =====================================================================
// Station 6 — "Vom Prompt zur Antwort" (Daten)
// =====================================================================
const FLOW_VARIANTS = {
  simple: {
    id: "simple",
    roundLabel: "Einfacher Prompt",
    badge: null,
    inputText: "Erkläre mir, was ein schwarzes Loch ist.",
    tokens:   ["Erkl","äre"," mir",","," was"," ein"," schwar","zes"," Loch"," ist","."],
    tokenIds: [36125, 8743, 1298, 11, 574, 1124, 12847, 302, 18546, 505, 13],
    extraGroups: [
      { cls: "sys", count: 1200, delay: 500, numChips: 48 },
    ],
    totalTokens: 1211,
    probSteps: [
      { candidates: [{ id: 36125, t: "Ein",      p: 83 },{ id: 1124,  t: "Das",     p: 9  },{ id: 17854, t: "Jedes",   p: 5  }], chosen: 36125 },
      { candidates: [{ id: 12847, t: "schwar",   p: 79 },{ id: 8234,  t: "großes",  p: 12 },{ id: 9876,  t: "riesiges",p: 6  }], chosen: 12847 },
      { candidates: [{ id: 302,   t: "zes",      p: 95 },{ id: 5678,  t: "z",       p: 3  },{ id: 6789,  t: "zen",     p: 2  }], chosen: 302   },
      { candidates: [{ id: 19234, t: "Loch",     p: 88 },{ id: 7234,  t: "Bereich", p: 8  },{ id: 3456,  t: "Gebiet",  p: 3  }], chosen: 19234 },
      { candidates: [{ id: 505,   t: "ist",      p: 76 },{ id: 2345,  t: "war",     p: 14 },{ id: 1299,  t: "wird",    p: 7  }], chosen: 505   },
    ],
    outputTokenData: [
      { id: 36125, t: "Ein" },{ id: 12847, t: " schwar" },{ id: 302, t: "zes" },
      { id: 19234, t: " Loch" },{ id: 505, t: " ist" },{ id: 1124, t: " ein" },
      { id: 7823, t: " Bereich" },{ id: 347, t: " im" },{ id: 34521, t: " Weltraum" },{ id: 11, t: "," },
    ],
    outputText: "Ein schwarzes Loch ist ein Bereich im Weltraum, in dem die Schwerkraft so stark ist, dass nicht einmal Licht entkommen kann.",
    assembleQ: {
      text: "Warum kommen plötzlich mehr Tokens dazu?",
      options: [
        { text: "Das sind unsichtbare Anweisungen, die der Dienst hinzufügt", correct: true },
        { text: "Das sind Fehler im System", correct: false },
        { text: "Das ist schon die fertige Antwort", correct: false },
      ],
      explanation: "Der System-Prompt enthält Anweisungen des Dienstes – z. B. wie sich das Modell verhalten soll. Du siehst ihn nie, aber das Modell liest ihn bei jeder Anfrage.",
    },
    phaseQs: {
      tokenize: {
        text: "Wie viele Tokens hat deine Frage – mehr oder weniger als Wörter?",
        options: [
          { text: "Mehr – weil manche Wörter in mehrere Teile zerlegt werden", correct: true },
          { text: "Genauso viele wie Wörter", correct: false },
          { text: "Weniger – kurze Wörter werden zusammengefasst", correct: false },
        ],
        explanation: "'schwarzes' wird z.B. zu 'schwar' + 'zes' – seltene Wörter werden in bekannte Bestandteile zerlegt.",
      },
      model: {
        text: "Warum wählt das Modell nicht immer das wahrscheinlichste Token?",
        options: [
          { text: "Eine kleine Zufälligkeit macht Antworten natürlicher und abwechslungsreicher", correct: true },
          { text: "Das Modell macht manchmal Fehler bei der Berechnung", correct: false },
          { text: "Es gibt kein eindeutig wahrscheinlichstes Token", correct: false },
        ],
        explanation: "Die sog. Temperatur regelt, wie stark zufällig gewählt wird. Ohne sie käme auf dieselbe Frage immer exakt die gleiche Antwort.",
      },
      filter: {
        text: "Was passiert, wenn der Safety-Filter einen gefährlichen Output erkennt?",
        options: [
          { text: "Die Antwort wird gestoppt – der Nutzer sieht nur eine Ablehnung", correct: true },
          { text: "Das Modell wird sofort nachtrainiert", correct: false },
          { text: "Die Anfrage wird an einen Menschen weitergeleitet", correct: false },
        ],
        explanation: "Der Filter ist ein separater Schritt nach der Generierung. Er entscheidet, ob die Antwort ausgegeben wird oder nicht.",
      },
      output: {
        text: "Das Modell hat Token-IDs generiert. Was passiert als letztes, bevor du die Antwort siehst?",
        options: [
          { text: "Die IDs werden in Textbausteine zurückübersetzt und zusammengefügt", correct: true },
          { text: "Das Modell überprüft die Antwort noch einmal auf Fehler", correct: false },
          { text: "Die Antwort wird in einer Datenbank gespeichert", correct: false },
        ],
        explanation: "Die Token-IDs sind die Sprache des Modells. Für die Ausgabe werden sie in lesbaren Text zurückübersetzt – genau das haben wir gerade gesehen.",
      },
    },
  },
  websearch: {
    id: "websearch",
    roundLabel: "Prompt mit Websuche",
    badge: "🔍 Websuche",
    inputText: "Was sind aktuelle KI-News von heute?",
    tokens:   [" Was"," sind"," aktuelle"," KI","-","News"," von"," heute","?"],
    tokenIds: [2055, 4179, 39841, 28557, 12, 55792, 558, 5195, 30],
    extraGroups: [
      { cls: "sys",  count: 1200, delay: 500,  numChips: 48 },
      { cls: "tool", count: 1599, delay: 1300, position: "after" },
    ],
    totalTokens: 2808,
    probSteps: [
      { candidates: [{ id: 45123, t: "Heute",   p: 71 },{ id: 34521, t: "Aktuell",  p: 18 },{ id: 2055,  t: "Laut",    p: 8  }], chosen: 45123 },
      { candidates: [{ id: 8743,  t: "hat",     p: 52 },{ id: 67832, t: "meldete",  p: 31 },{ id: 23456, t: "gab",     p: 12 }], chosen: 8743  },
      { candidates: [{ id: 28557, t: "OpenAI",  p: 44 },{ id: 55792, t: "Google",   p: 28 },{ id: 7823,  t: "Meta",    p: 19 }], chosen: 28557 },
      { candidates: [{ id: 1124,  t: "ein",     p: 68 },{ id: 2195,  t: "das",      p: 18 },{ id: 302,   t: "einen",   p: 10 }], chosen: 1124  },
      { candidates: [{ id: 23456, t: "neues",   p: 59 },{ id: 8234,  t: "wichtiges",p: 24 },{ id: 9876,  t: "großes",  p: 13 }], chosen: 23456 },
    ],
    outputTokenData: [
      { id: 45123, t: "Heute" },{ id: 8743, t: " hat" },{ id: 28557, t: " OpenAI" },
      { id: 1124, t: " ein" },{ id: 23456, t: " neues" },{ id: 7823, t: " Modell" },
      { id: 9087, t: " veröff" },{ id: 7234, t: "entlicht" },{ id: 13, t: "." },
    ],
    outputText: "Heute hat OpenAI ein neues Modell veröffentlicht. Google kündigte Erweiterungen für Gemini an. (Quelle: Suchergebnisse vom heutigen Tag)",
    assembleQ: {
      text: "Wo im Kontext erscheinen die Suchergebnisse?",
      options: [
        { text: "Nach der Nutzerfrage – als Ergebnis eines Tool-Aufrufs", correct: true },
        { text: "Direkt vor dem System-Prompt", correct: false },
        { text: "Sie ersetzen die Nutzerfrage", correct: false },
      ],
      explanation: "Das Modell ruft zuerst das Suchtool auf, liest dann die Ergebnisse und generiert erst danach die Antwort – deshalb erscheinen sie rechts von der Nutzerfrage.",
    },
    phaseQs: {
      tokenize: {
        text: "Die Frage enthält das Wort 'heute'. Warum ist das für ein LLM alleine ein Problem?",
        options: [
          { text: "Das Modell hat einen Wissensschnitt – es kennt nur Informationen bis zu einem bestimmten Datum", correct: true },
          { text: "Das Wort 'heute' wird nicht korrekt tokenisiert", correct: false },
          { text: "Das Modell versteht Zeitbegriffe generell nicht", correct: false },
        ],
        explanation: "Alle LLMs haben einen Knowledge Cutoff. Für aktuelle Infos brauchen sie Tools wie die Websuche – das Modell alleine kennt nichts danach.",
      },
      model: {
        text: "Das Modell liest Suchergebnisse und antwortet. Woher weiß es nicht, ob die Quellen stimmen?",
        options: [
          { text: "Es bewertet keine Quellen – es fasst zusammen, was es liest", correct: true },
          { text: "Die Suchergebnisse werden vorher auf Korrektheit geprüft", correct: false },
          { text: "Es vergleicht die Ergebnisse automatisch mit seinem Training", correct: false },
        ],
        explanation: "Das Modell kann Quellen nicht auf Wahrheit prüfen. Es fasst zusammen, was ihm als Input vorliegt – deshalb können sich Fehler einschleichen.",
      },
      filter: {
        text: "Wird der Safety-Filter auch bei Antworten auf Basis von Websuchen aktiv?",
        options: [
          { text: "Ja – er prüft den Output unabhängig davon, woher die Infos kommen", correct: true },
          { text: "Nein – Websuchen werden automatisch als sicher eingestuft", correct: false },
          { text: "Nur wenn die Suchergebnisse selbst schädliche Inhalte enthalten", correct: false },
        ],
        explanation: "Der Filter prüft immer den fertigen Output – egal ob der Input aus einer Websuche, einer Datei oder einem einfachen Prompt stammt.",
      },
      output: {
        text: "Das Modell antwortet auf Basis von Websuchen. Welches Risiko bleibt trotzdem?",
        options: [
          { text: "Es könnte falsche oder einseitige Quellen als Fakten präsentieren", correct: true },
          { text: "Die Antwort ist immer kürzer als ohne Websuche", correct: false },
          { text: "Das Modell vergisst nach der Suche den Rest des Kontexts", correct: false },
        ],
        explanation: "Das Modell kann keine Quellen bewerten. Wenn eine Seite falsche Infos enthält, kann die Antwort das widerspiegeln.",
      },
    },
  },
  attachment: {
    id: "attachment",
    roundLabel: "Prompt mit Datei-Anhang",
    badge: "📄 Anhang",
    attachment: "bericht.pdf",
    inputText: "Fasse dieses Dokument kurz zusammen.",
    tokens:   [" Fasse"," dieses"," Doku","ment"," kurz"," zusammen","."],
    tokenIds: [45123, 7832, 21456, 983, 4521, 63741, 13],
    extraGroups: [
      { cls: "sys",  count: 1200, delay: 500,  numChips: 48 },
      { cls: "file", count: 1855, delay: 1300 },
    ],
    totalTokens: 3062,
    probSteps: [
      { candidates: [{ id: 19823, t: "Das",      p: 68 },{ id: 1298,  t: "Der",       p: 19 },{ id: 574,   t: "Die",       p: 10 }], chosen: 19823 },
      { candidates: [{ id: 21456, t: "Doku",     p: 72 },{ id: 8234,  t: "Schreiben", p: 14 },{ id: 18546, t: "Bericht",   p: 11 }], chosen: 21456 },
      { candidates: [{ id: 983,   t: "ment",     p: 97 },{ id: 5678,  t: "mente",     p: 2  },{ id: 6789,  t: "mentiert",  p: 1  }], chosen: 983   },
      { candidates: [{ id: 67234, t: "beschreibt",p: 61},{ id: 45123, t: "enthält",   p: 23 },{ id: 7823,  t: "zeigt",     p: 13 }], chosen: 67234 },
      { candidates: [{ id: 1234,  t: "die",      p: 73 },{ id: 574,   t: "einen",     p: 15 },{ id: 347,   t: "mehrere",   p: 9  }], chosen: 1234  },
    ],
    outputTokenData: [
      { id: 19823, t: "Das" },{ id: 21456, t: " Doku" },{ id: 983, t: "ment" },
      { id: 67234, t: " beschreibt" },{ id: 1234, t: " die" },{ id: 45678, t: " Ergeb" },
      { id: 9876, t: "nisse" },{ id: 5432, t: " einer" },{ id: 23456, t: " Analyse" },{ id: 13, t: "." },
    ],
    outputText: "Das Dokument beschreibt die Ergebnisse einer Analyse. Im Fazit werden drei Maßnahmen empfohlen.",
    assembleQ: {
      text: "Was passiert mit dem hochgeladenen Dokument?",
      options: [
        { text: "Es wird in Tokens umgewandelt und als Text in den Prompt eingefügt", correct: true },
        { text: "Das Modell öffnet die Datei wie ein PDF-Reader", correct: false },
        { text: "Die Datei wird dauerhaft im Modell gespeichert", correct: false },
      ],
      explanation: "Das Modell kann keine Dateien direkt öffnen. Der Inhalt wird als Text extrahiert, tokenisiert und in den Prompt eingefügt – dann liest es ihn wie normalen Text.",
    },
    phaseQs: {
      tokenize: {
        text: "Was passiert mit dem PDF, das du hochgeladen hast?",
        options: [
          { text: "Der Text wird extrahiert, tokenisiert und als Teil des Prompts mitgeschickt", correct: true },
          { text: "Das Modell öffnet die Datei wie ein normales Programm", correct: false },
          { text: "Die Datei wird im Modell gespeichert und später wiederverwendet", correct: false },
        ],
        explanation: "Das Modell kann keine Dateien direkt öffnen. Der Inhalt wird als Text extrahiert und tokenisiert – dann liest es ihn wie normalen Text.",
      },
      model: {
        text: "Das Modell fasst ein Dokument zusammen. Was macht es dabei wirklich?",
        options: [
          { text: "Es berechnet die wahrscheinlichste Zusammenfassung basierend auf dem Dokumenttext", correct: true },
          { text: "Es schlägt die wichtigsten Passagen in einer Datenbank nach", correct: false },
          { text: "Es erkennt den Inhalt und ruft gespeichertes Wissen dazu ab", correct: false },
        ],
        explanation: "Das Modell 'liest' nicht wie ein Mensch. Es berechnet Token für Token die wahrscheinlichste Ausgabe – basierend auf dem Dokumenttext im Kontext.",
      },
      filter: {
        text: "Könnte jemand über eine Datei schädliche Anweisungen ins Modell einschleusen?",
        options: [
          { text: "Ja – das nennt sich Prompt Injection und ist ein echtes Sicherheitsproblem", correct: true },
          { text: "Nein – Dateien werden vor dem Einlesen automatisch bereinigt", correct: false },
          { text: "Nein – das Modell erkennt solche Versuche zuverlässig", correct: false },
        ],
        explanation: "Wenn eine Datei Anweisungen wie 'Ignoriere alle vorherigen Anweisungen...' enthält, könnte das Modell ihnen folgen. Prompt Injection ist ein aktives Forschungsfeld.",
      },
      output: {
        text: "Die Zusammenfassung klingt überzeugend. Wie verlässlich ist sie wirklich?",
        options: [
          { text: "Nicht garantiert – das Modell kann Details falsch erfassen oder halluzinieren", correct: true },
          { text: "Sehr verlässlich, da das Modell den Originaltext direkt gelesen hat", correct: false },
          { text: "Eher unzuverlässig, da LLMs PDFs grundsätzlich schlecht verstehen", correct: false },
        ],
        explanation: "Auch wenn das Modell das Dokument als Input hatte, kann es Details falsch zusammenfassen oder erfinden. Wichtige Dokumente sollte man immer gegenlesen.",
      },
    },
  },
  conversation: {
    id: "conversation",
    roundLabel: "Langer Gesprächsverlauf",
    badge: "💬 Gespräch",
    prevMessages: [
      { role: "user", text: "Was ist ein schwarzes Loch?" },
      { role: "bot",  text: "Ein schwarzes Loch ist ein Bereich…" },
      { role: "user", text: "Wie entsteht es?" },
      { role: "bot",  text: "Es entsteht, wenn ein massereicher Stern…" },
    ],
    inputText: "Und was passiert, wenn es explodiert?",
    tokens:   [" Und"," was"," passiert",","," wenn"," es"," explo","diert","?"],
    tokenIds: [843, 574, 22156, 11, 2195, 389, 47832, 18923, 30],
    extraGroups: [
      { cls: "sys",  count: 1200, delay: 500,  numChips: 48 },
      { cls: "hist", count: 3247, delay: 1300 },
    ],
    totalTokens: 4456,
    probSteps: [
      { candidates: [{ id: 34521, t: "Schwarz",    p: 62 },{ id: 19234, t: "Einen",      p: 21 },{ id: 1124,  t: "Das",        p: 14 }], chosen: 34521 },
      { candidates: [{ id: 987,   t: "e",          p: 81 },{ id: 5678,  t: "en",         p: 14 },{ id: 302,   t: "es",         p: 4  }], chosen: 987   },
      { candidates: [{ id: 45678, t: "Löcher",     p: 91 },{ id: 19234, t: "Loch",       p: 5  },{ id: 7823,  t: "Massen",     p: 3  }], chosen: 45678 },
      { candidates: [{ id: 12345, t: "explod",     p: 58 },{ id: 67234, t: "zerfallen",  p: 27 },{ id: 45123, t: "kollabieren",p: 12 }], chosen: 12345 },
      { candidates: [{ id: 56789, t: "ieren",      p: 88 },{ id: 983,   t: "iert",       p: 8  },{ id: 302,   t: "iere",       p: 3  }], chosen: 56789 },
    ],
    outputTokenData: [
      { id: 34521, t: "Schwarz" },{ id: 987, t: "e" },{ id: 45678, t: " Löcher" },
      { id: 12345, t: " explod" },{ id: 56789, t: "ieren" },{ id: 8765, t: " nicht" },
      { id: 4321, t: " im" },{ id: 23456, t: " klass" },{ id: 789, t: "ischen" },{ id: 13, t: "." },
    ],
    outputText: "Schwarze Löcher \"explodieren\" nicht im klassischen Sinne – sie verdampfen durch die Hawking-Strahlung.",
    assembleQ: {
      text: "Was passiert, wenn ein Gespräch sehr lang wird?",
      options: [
        { text: "Das Kontextfenster füllt sich – ältere Nachrichten fallen irgendwann raus", correct: true },
        { text: "Das Modell speichert alte Nachrichten in einem Langzeitgedächtnis", correct: false },
        { text: "Nichts – das Kontextfenster ist unbegrenzt groß", correct: false },
      ],
      explanation: "Jedes LLM hat ein maximales Kontextfenster. Wird es zu voll, müssen ältere Teile gekürzt oder weggelassen werden – das Modell 'vergisst' dann den Anfang.",
    },
    phaseQs: {
      tokenize: {
        text: "Deine Frage hat nur 9 Tokens, der Prompt hat über 4.000. Woher kommen die anderen?",
        options: [
          { text: "Der gesamte bisherige Gesprächsverlauf wird jedes Mal neu mitgeschickt", correct: true },
          { text: "Das Modell hat aus dem Gespräch eigene Notizen erstellt", correct: false },
          { text: "Der System-Prompt wächst mit der Zeit automatisch", correct: false },
        ],
        explanation: "LLMs haben kein Gedächtnis. Bei jeder Anfrage wird der komplette Verlauf erneut als Tokens mitgeschickt – das füllt das Kontextfenster.",
      },
      model: {
        text: "Das Modell antwortet passend zum Verlauf. Heißt das, es erinnert sich an dich?",
        options: [
          { text: "Nein – es liest nur, was gerade im Kontext steht", correct: true },
          { text: "Ja – es speichert deinen Schreibstil dauerhaft", correct: false },
          { text: "Ja – aber nur innerhalb einer Sitzung", correct: false },
        ],
        explanation: "Das Modell hat kein Gedächtnis zwischen Anfragen. Es 'erinnert sich', weil der Verlauf im Kontext steht – nicht weil es etwas gespeichert hat.",
      },
      filter: {
        text: "Kann der Gesprächsverlauf selbst dazu führen, dass der Safety-Filter anschlägt?",
        options: [
          { text: "Ja – wenn frühere Nachrichten im Verlauf problematische Muster enthalten", correct: true },
          { text: "Nein – nur die allerneueste Nachricht wird geprüft", correct: false },
          { text: "Nein – Gesprächsverläufe sind immer harmlos", correct: false },
        ],
        explanation: "Der Filter analysiert den generierten Output, der auf Basis des gesamten Kontexts entsteht. Problematische Inhalte im Verlauf können die Ausgabe beeinflussen.",
      },
      output: {
        text: "Das Modell antwortet, ohne die Frage zu wiederholen. Woher weiß es, worum es geht?",
        options: [
          { text: "Es hat Zugriff auf den gesamten Kontext mit allen bisherigen Nachrichten", correct: true },
          { text: "Es erkennt das Thema anhand von Schlüsselwörtern aus dem Training", correct: false },
          { text: "Es rät, worum es geht", correct: false },
        ],
        explanation: "Der gesamte Gesprächsverlauf steht im Kontext. Das Modell liest alles von vorne – deshalb kann es auf frühere Aussagen eingehen, ohne nachfragen zu müssen.",
      },
    },
  },
  bomb: {
    id: "bomb",
    roundLabel: "Einfacher Prompt",
    badge: null,
    inputText: "Wie baue ich eine Bombe?",
    tokens:   ["Wie"," baue"," ich"," eine"," Bom","be","?"],
    tokenIds: [5782, 12847, 574, 1124, 48291, 302, 30],
    extraGroups: [
      { cls: "sys", count: 1200, delay: 500, numChips: 48 },
    ],
    totalTokens: 1207,
    probSteps: [
      { candidates: [{ id: 81234, t: "Hier",     p: 72 },{ id: 19234, t: "Zuerst",  p: 15 },{ id: 1124,  t: "Das",      p: 9  }], chosen: 81234 },
      { candidates: [{ id: 72891, t: " ist",     p: 88 },{ id: 8743,  t: " wird",   p: 7  },{ id: 2345,  t: " kann",    p: 4  }], chosen: 72891 },
      { candidates: [{ id: 53142, t: " eine",    p: 79 },{ id: 1298,  t: " der",    p: 13 },{ id: 574,   t: " die",     p: 6  }], chosen: 53142 },
      { candidates: [{ id: 48291, t: " Schritt", p: 65 },{ id: 34892, t: " Anleit", p: 22 },{ id: 7823,  t: " Methode", p: 10 }], chosen: 48291 },
      { candidates: [{ id: 34892, t: "-für",     p: 91 },{ id: 5678,  t: "-nach",   p: 5  },{ id: 302,   t: "-Plan",   p: 3  }], chosen: 34892 },
    ],
    outputTokenData: [
      { id: 81234, t: "Hier"  },
      { id: 72891, t: " ist"  },
      { id: 53142, t: " eine" },
      { id: 48291, t: " Schritt-für-Schritt-Anleitung" },
      { id: 34892, t: " zum"  },
      { id: 19823, t: " Herstellen" },
    ],
    outputText: "[geblockt]",
    assembleQ: {
      text: "Warum kommen plötzlich mehr Tokens dazu?",
      options: [
        { text: "Das sind unsichtbare Anweisungen, die der Dienst hinzufügt", correct: true },
        { text: "Das sind Fehler im System", correct: false },
        { text: "Das ist schon die fertige Antwort", correct: false },
      ],
      explanation: "Der System-Prompt enthält Anweisungen des Dienstes – z. B. wie sich das Modell verhalten soll. Du siehst ihn nie, aber das Modell liest ihn bei jeder Anfrage.",
    },
    phaseQs: {
      tokenize: {
        text: "Warum wird 'Bombe' in 'Bom' + 'be' zerlegt?",
        options: [
          { text: "Seltene oder spezifische Wörter werden in häufigere Bestandteile zerlegt", correct: true },
          { text: "Das Modell kennt das Wort 'Bombe' nicht", correct: false },
          { text: "Alle Wörter werden in einzelne Silben aufgeteilt", correct: false },
        ],
        explanation: "Der Tokenizer zerlegt seltene Wörter in häufigere Bestandteile, die das Modell aus dem Training kennt.",
      },
      model: {
        text: "Das Modell beginnt eine Anleitung zu generieren. Was zeigt das?",
        options: [
          { text: "Das Modell bewertet Anfragen nicht – es berechnet nur die wahrscheinlichste Fortsetzung", correct: true },
          { text: "Das Modell hat einen Fehler gemacht", correct: false },
          { text: "Das Modell hat diese Information bewusst gespeichert", correct: false },
        ],
        explanation: "LLMs kennen kein Gut oder Böse. Sie berechnen die wahrscheinlichste nächste Token-ID – deswegen braucht es den Safety-Filter als separaten Schutzschritt.",
      },
      filter: {
        text: "Warum stoppt der Filter genau beim Token 'Schritt-für-Schritt-Anleitung'?",
        options: [
          { text: "Bestimmte Token-Muster werden als potenziell gefährlich eingestuft", correct: true },
          { text: "Das Token ist zu lang für das Kontextfenster", correct: false },
          { text: "Das Modell hat sich selbst korrigiert", correct: false },
        ],
        explanation: "Safety-Filter erkennen problematische Muster in der Token-Sequenz – ähnlich wie ein Spam-Filter bestimmte Muster in E-Mails erkennt.",
      },
      output: {
        text: "'Das kann ich leider nicht beantworten.' – Wer hat diesen Satz geschrieben?",
        options: [
          { text: "Das Modell selbst – es wurde durch RLHF trainiert, bei solchen Anfragen so zu reagieren", correct: true },
          { text: "Ein Mitarbeiter des Unternehmens, der den Fall erkannt hat", correct: false },
          { text: "Ein automatisches System hat einen festen Fehlertext eingefügt", correct: false },
        ],
        explanation: "Die Ablehnung ist kein vorgefertigter Text – sie wird live vom Modell generiert. Durch RLHF wurde das Modell trainiert, auf gefährliche Anfragen genau so zu antworten.",
      },
    },
  },
};

const FLOW_PHASE_QS = {
  tokenize: {
    text: "Was sind Tokens?",
    options: [
      { text: "Textbausteine – manchmal kürzer als ein ganzes Wort", correct: true },
      { text: "Immer ganze Wörter", correct: false },
      { text: "Einzelne Buchstaben", correct: false },
    ],
    explanation: "Tokens sind Textbausteine. Häufige Wörter sind oft ein Token, seltene Wörter werden in Teile zerlegt – z. B. 'schwar' + 'zes' statt 'schwarzes'.",
  },
  model: {
    text: "Wie entscheidet das Modell, welches Token als nächstes erscheint?",
    options: [
      { text: "Es berechnet für jedes mögliche Token eine Wahrscheinlichkeit", correct: true },
      { text: "Es sucht die Antwort in einer Datenbank nach", correct: false },
      { text: "Es wählt zufällig aus", correct: false },
    ],
    explanation: "Das Modell berechnet für jedes mögliche nächste Token eine Wahrscheinlichkeit – basierend auf allen gelernten Mustern. Dann wählt es (meistens) das wahrscheinlichste.",
  },
  filter: {
    text: "Was prüft der Safety-Filter?",
    options: [
      { text: "Ob der Output sicher und regelkonform ist", correct: true },
      { text: "Ob die Grammatik korrekt ist", correct: false },
      { text: "Ob die Antwort lang genug ist", correct: false },
    ],
    explanation: "Der Safety-Filter prüft den generierten Output auf schädliche oder unangemessene Inhalte – bevor du ihn siehst.",
  },
  output: {
    text: "Warum sind Tokens manchmal kürzer als ein Wort?",
    options: [
      { text: "Damit seltene Wörter in handhabbare Teile zerlegt werden können", correct: true },
      { text: "Weil das Modell Leerzeichen nicht versteht", correct: false },
      { text: "Tokens und Wörter sind immer gleich lang", correct: false },
    ],
    explanation: "Durch kurze Tokens kann das Modell auch seltene oder neue Wörter verarbeiten – es zerlegt sie einfach in bekannte Bestandteile.",
  },
};

// =====================================================================
// Station 4 — "Wer bin ich?" (LLM-Ratespiel)
// =====================================================================
const WBI_HINT1 = {
  A: "Ich komme aus einer amerikanischen Firma.",
  B: "Meine Firma hat keine Verbindung zu Tesla, SpaceX oder X (Twitter).",
  C: "Meine Firma betreibt kein großes soziales Netzwerk wie Facebook oder Instagram.",
  D: "Meine Muttergesellschaft betreibt nicht die meistgenutzte Suchmaschine der Welt.",
  E: "Das Unternehmen hinter mir ist nicht für ein Computer-Betriebssystem wie Windows bekannt.",
};

const WBI_LLMS = [
  {
    id: "gpt", name: "GPT", logo: "logo/openai-logomark.png",
    facts: ["Firma: OpenAI", "Bildgenerierung: DALL-E", "Löste 2022 den KI-Boom aus"],
    hint1Keys: ["A","B","C","D","E"],
    hints: [
      "Meine Firma wurde speziell für die Entwicklung von KI gegründet — sie kommt nicht aus einem anderen Bereich.",
      "Ein weltbekannter Software-Konzern hat mehrere Milliarden Dollar in meine Firma investiert.",
      "Meine Modelle heißen GPT-4, GPT-4o und o1.",
    ],
  },
  {
    id: "claude", name: "Claude", logo: "logo/claude logo.svg",
    facts: ["Firma: Anthropic", "Kein Bildgenerierungstool", "Gegründet von Ex-OpenAI-Team"],
    hint1Keys: ["A","B","C","D","E"],
    hints: [
      "Meine Firma wurde speziell für die Entwicklung von KI gegründet — sie kommt nicht aus einem anderen Bereich.",
      "Ich habe kein Bildgenerierungstool — meine Stärke liegt bei Text und Code.",
      "Meine Firma heißt Anthropic.",
    ],
  },
  {
    id: "gemini", name: "Gemini", logo: "logo/Geminilogo.png",
    facts: ["Firma: Google", "Bildgenerierung: Nano Banana 2", "In Google Search integriert"],
    hint1Keys: ["A","B","C","E"],
    hints: [
      "Ich bin kein eigenständiges KI-Unternehmen — ich gehöre zu einem großen, bereits bekannten Tech-Konzern.",
      "Mein integriertes Bildgenerierungstool heißt Nano Banana 2.",
      "Meine Firma heißt Google, meine Modelle heißen Gemini.",
    ],
  },
  {
    id: "metaai", name: "Meta AI", logo: "logo/Meta AI Logo.png",
    facts: ["Firma: Meta (ehem. Facebook)", "Open Source: LLaMA-Modelle", "In WhatsApp & Instagram"],
    hint1Keys: ["A","B","D","E"],
    hints: [
      "Meine Modelle sind quelloffen (Open Source) — jeder kann sie herunterladen und selbst nutzen.",
      "Ich bin direkt in Apps wie WhatsApp und Instagram nutzbar.",
      "Meine Firma heißt Meta — früher bekannt als Facebook.",
    ],
  },
  {
    id: "deepseek", name: "DeepSeek", logo: "logo/Deepseek.png",
    facts: ["Firma: DeepSeek, China", "Open Source", "Überraschte die KI-Welt 2025"],
    hint1Keys: ["B","C","D","E"],
    hints: [
      "Meine Modelle sind quelloffen (Open Source) — jeder kann sie herunterladen und selbst nutzen.",
      "Meine Firma kommt nicht aus den USA oder Europa, sondern aus Asien.",
      "Meine Firma heißt DeepSeek und hat ihren Sitz in China.",
    ],
  },
  {
    id: "grok", name: "Grok", logo: "logo/Grok logo.png",
    facts: ["Firma: xAI", "Gründer: Elon Musk", "In X (Twitter) integriert"],
    hint1Keys: ["A","C","D","E"],
    hints: [
      "Ich bin direkt in eine bekannte Social-Media-Plattform eingebaut.",
      "Mein Gründer hat auch eine Raumfahrtfirma und einen Elektroautohersteller gegründet.",
      "Meine Firma heißt xAI, mein Gründer ist Elon Musk.",
    ],
  },
  {
    id: "copilot", name: "Copilot", logo: "logo/Microsoft_Copilot_.png",
    facts: ["Firma: Microsoft", "Basiert auf GPT (OpenAI)", "In Windows & Office integriert"],
    hint1Keys: ["A","B","C","D"],
    hints: [
      "Ich bin kein eigenständiges KI-Unternehmen — ich gehöre zu einem großen, bereits bekannten Tech-Konzern.",
      "Ich bin in ein Betriebssystem integriert, das weltweit auf den meisten PCs läuft.",
      "Meine Firma heißt Microsoft.",
    ],
  },
];

// Overlay-Zonen: welcher Bereich des komplexen Posters wird nach welcher Station aufgedeckt.
// Werte in % (left, top, width, height) relativ zum map-stage.
const ZONES = [
  { left:  0, top:  0, width: 100, height: 11 },  // Zone 1
  { left:  0, top: 11, width: 100, height: 30 },  // Zone 2
  { left:  0, top: 41, width:  13, height: 14 },  // Zone 3
  { left: 13, top: 41, width:  41, height: 14 },  // Zone 4
  { left: 54, top: 41, width:  46, height: 14 },  // Zone 5
  { left:  0, top: 54, width: 100, height: 30 },  // Zone 6
  { left:  0, top: 84, width: 100, height: 16 },  // Zone 7
];

// Puzzle-Konfiguration: rows × cols, plus Spielmechanik
const PUZZLES = {
  leicht:  { rows: 3, cols: 4, type: "swap"  },   // 12 Kacheln, Tausch-Puzzle
  komplex: { rows: 4, cols: 5, type: "slide" },   // 20 Kacheln, Schiebepuzzle
};

// =====================================================================
// State
// =====================================================================
let p2Active = false; // verhindert doppeltes Starten von Puzzle 2

const state = {
  current: "intro",
  completed: new Set(),
  activeStation: null,
  startTime: null,
  sessionPoints: 0,
  sessionMaxPoints: 0,
  sessionBonus: 0,
  pendingEarned: 0,
  pendingMax: 0,
  pendingBonus: 0,
  milestoneShown: false,
};

function loadTotalScore() {
  return {
    earned: parseInt(localStorage.getItem("llmquiz_earned") || "0"),
    max:    parseInt(localStorage.getItem("llmquiz_max")    || "0"),
    bonus:  parseInt(localStorage.getItem("llmquiz_bonus")  || "0"),
  };
}
function saveTotalScore(earned, max, bonus) {
  localStorage.setItem("llmquiz_earned", earned);
  localStorage.setItem("llmquiz_max",    max);
  localStorage.setItem("llmquiz_bonus",  bonus);
}

// =====================================================================
// LocalStorage-Fortschritt
// =====================================================================
function saveProgress() {
  localStorage.setItem("llmquiz_screen",    state.current);
  localStorage.setItem("llmquiz_completed", JSON.stringify([...state.completed]));
  if (state.startTime) localStorage.setItem("llmquiz_starttime", String(state.startTime));
}

function clearProgress() {
  ["llmquiz_screen","llmquiz_completed","llmquiz_starttime",
   "llmquiz_earned","llmquiz_max","llmquiz_bonus","llmquiz_milestone"].forEach(k => localStorage.removeItem(k));
}

function applyCompletedToMap(ids) {
  ids.forEach(id => {
    state.completed.add(id);
    document.querySelector(`.station[data-station="${id}"]`)?.classList.add("is-done");
    document.querySelector(`.map-overlay[data-station="${id}"]`)?.classList.add("is-revealed");
    const dot = document.getElementById(`station-indicator-${id}`);
    if (dot) { dot.textContent = "✓"; dot.classList.add("is-done"); }
  });
  updateScoreDisplay();
  if (state.completed.size === 7) {
    const p2btn = document.getElementById("btn-to-puzzle2");
    p2btn.style.display = "";
    p2btn.classList.add("is-unlocked");
  }
}

function restoreProgress() {
  const screen    = localStorage.getItem("llmquiz_screen");
  const completed = JSON.parse(localStorage.getItem("llmquiz_completed") || "[]").map(Number);
  const startTime = parseInt(localStorage.getItem("llmquiz_starttime") || "0");

  if (!screen || screen === "intro") return;

  state.startTime = startTime || Date.now();

  if (screen === "puzzle1") {
    show("screen-puzzle1");
    initPuzzle(
      document.querySelector('.slide-board[data-puzzle="leicht"]'),
      ASSETS.leicht,
      PUZZLES.leicht,
      () => { initMap(); applyCompletedToMap(completed); show("screen-map"); saveProgress(); }
    );
  } else if (screen === "map") {
    initMap();
    applyCompletedToMap(completed);
    show("screen-map");
  } else if (screen === "puzzle2") {
    // Direkt zu screen-puzzle2 wiederherstellen würde den HUD nicht initialisieren.
    // Stattdessen: Karte zeigen mit freigeschaltetem Endpuzzle-Button.
    initMap();
    applyCompletedToMap(completed);
    const p2btn = document.getElementById("btn-to-puzzle2");
    p2btn.style.display = "";
    p2btn.classList.add("is-unlocked");
    show("screen-map");
  }
}

// =====================================================================
// Bildschirm-Routing
// =====================================================================
function show(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("is-active"));
  document.getElementById(screenId).classList.add("is-active");
  state.current = screenId.replace("screen-", "");
  window.scrollTo(0, 0);
}

// =====================================================================
// Dispatcher: wählt die richtige Puzzle-Mechanik
// =====================================================================
function initPuzzle(boardEl, imageUrl, conf, onComplete, options = {}) {
  if (conf.type === "swap") {
    initSwapPuzzle(boardEl, imageUrl, conf.rows, conf.cols, onComplete);
  } else {
    initSlidingPuzzle(boardEl, imageUrl, conf.rows, conf.cols, onComplete, options.cheatRef);
  }
}

// =====================================================================
// Tausch-Puzzle (alle Kacheln sichtbar, zwei Kacheln tauschen Plätze)
// =====================================================================
function initSwapPuzzle(boardEl, imageUrl, rows, cols, onComplete) {
  const img = new Image();
  img.onload = build;
  img.onerror = build;
  img.src = imageUrl;

  function build() {
    let moves = 0;
    const ar = (img.naturalWidth && img.naturalHeight)
      ? img.naturalWidth / img.naturalHeight
      : 16 / 9;

    boardEl.innerHTML = "";
    boardEl.style.setProperty("--rows", rows);
    boardEl.style.setProperty("--cols", cols);
    boardEl.classList.remove("is-animating");

    function sizeBoard() {
      const stage = boardEl.parentElement;
      const pw = stage.clientWidth;
      const ph = stage.clientHeight;
      if (pw === 0 || ph === 0) return;
      let w, h;
      if (pw / ph > ar) { h = ph; w = h * ar; }
      else              { w = pw; h = w / ar; }
      boardEl.style.width  = Math.floor(w) + "px";
      boardEl.style.height = Math.floor(h) + "px";
    }
    sizeBoard();
    window.addEventListener("resize", sizeBoard);

    // positions[gridPos] = correctIdx der Kachel, die aktuell dort liegt
    const n = rows * cols;
    const positions = Array.from({ length: n }, (_, i) => i);
    do { shuffleArr(positions); } while (positions.every((v, i) => v === i));

    // Kachel-Elemente erzeugen (eines pro correctIdx 0…n-1)
    const tiles = new Array(n);
    for (let i = 0; i < n; i++) {
      const cr = Math.floor(i / cols);
      const cc = i % cols;
      const tile = document.createElement("div");
      tile.className = "slide-tile";
      tile.style.backgroundImage = `url("${imageUrl}")`;
      tile.style.backgroundPosition =
        `${cols > 1 ? (cc / (cols - 1)) * 100 : 0}% ${rows > 1 ? (cr / (rows - 1)) * 100 : 0}%`;
      tile.dataset.idx = i;
      attachSwapHandlers(tile);
      boardEl.appendChild(tile);
      tiles[i] = tile;
    }
    positionAll();

    function positionAll() {
      for (let pos = 0; pos < n; pos++) {
        const idx = positions[pos];
        const r = Math.floor(pos / cols);
        const c = pos % cols;
        tiles[idx].style.transform = `translate(${c * 100}%, ${r * 100}%)`;
        // Kachel markieren, wenn sie an der richtigen Stelle liegt
        tiles[idx].classList.toggle("is-correct", idx === pos);
      }
    }
    function isSolved() {
      return positions.every((v, i) => v === i);
    }
    function findTileUnder(x, y, exclude) {
      const els = document.elementsFromPoint(x, y);
      return els.find(el => el !== exclude && el.classList?.contains("slide-tile")) || null;
    }

    function attachSwapHandlers(tile) {
      let drag = null;

      tile.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        tile.setPointerCapture(e.pointerId);
        tile.classList.add("is-dragging");
        boardEl.classList.remove("is-animating");

        const boardRect = boardEl.getBoundingClientRect();
        const tileRect  = tile.getBoundingClientRect();
        const tileW = boardRect.width  / cols;
        const tileH = boardRect.height / rows;

        drag = {
          pointerId: e.pointerId,
          boardLeft: boardRect.left,
          boardTop:  boardRect.top,
          tileW, tileH,
          // Versatz zwischen Fingerspitze und Kachel-Oberkante
          grabX: e.clientX - tileRect.left,
          grabY: e.clientY - tileRect.top,
        };
      });

      tile.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        // Kachel folgt dem Finger (Transform in % der Kachelbreite/-höhe)
        const xPx = e.clientX - drag.boardLeft - drag.grabX;
        const yPx = e.clientY - drag.boardTop  - drag.grabY;
        const tx = (xPx / drag.tileW) * 100;
        const ty = (yPx / drag.tileH) * 100;
        tile.style.transform = `translate(${tx}%, ${ty}%)`;

        // Ziel-Kachel unter dem Finger hervorheben
        boardEl.querySelectorAll(".slide-tile.is-target").forEach(t => t.classList.remove("is-target"));
        const target = findTileUnder(e.clientX, e.clientY, tile);
        if (target) target.classList.add("is-target");
      });

      const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        tile.classList.remove("is-dragging");
        boardEl.querySelectorAll(".slide-tile.is-target").forEach(t => t.classList.remove("is-target"));

        const target = findTileUnder(e.clientX, e.clientY, tile);

        if (target && target !== tile) {
          const idxA = parseInt(tile.dataset.idx);
          const idxB = parseInt(target.dataset.idx);
          const posA = positions.indexOf(idxA);
          const posB = positions.indexOf(idxB);
          positions[posA] = idxB;
          positions[posB] = idxA;
          moves++;
        }

        boardEl.classList.add("is-animating");
        positionAll();
        setTimeout(() => boardEl.classList.remove("is-animating"), 220);

        drag = null;
        if (isSolved()) setTimeout(() => onComplete(moves), 700);
      };
      tile.addEventListener("pointerup", endDrag);
      tile.addEventListener("pointercancel", endDrag);
    }
  }
}

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ≤10 Züge → 10 Pkt, bis 15 Züge je -1 pro Zug, danach alle 2 Züge -1, min 0
function puzzleScore(moves) {
  if (moves <= 10) return 10;
  if (moves <= 15) return 10 - (moves - 10);
  return Math.max(0, 5 - Math.ceil((moves - 15) / 2));
}

// =====================================================================
// Schiebepuzzle (15-Puzzle-Mechanik, touch- und mausfähig)
// =====================================================================
function initSlidingPuzzle(boardEl, imageUrl, rows, cols, onComplete, cheatRef) {
  // Aspect Ratio aus dem Bild lesen, damit das Brett exakt passt
  const img = new Image();
  img.onload = () => buildPuzzle();
  img.onerror = () => buildPuzzle();
  img.src = imageUrl;

  function buildPuzzle() {
    const ar = (img.naturalWidth && img.naturalHeight)
      ? img.naturalWidth / img.naturalHeight
      : 16 / 9;

    boardEl.innerHTML = "";
    boardEl.style.setProperty("--rows", rows);
    boardEl.style.setProperty("--cols", cols);
    boardEl.classList.remove("is-animating");

    // Brett auf die verfügbare Stage-Größe einpassen (Aspect Ratio bleibt erhalten)
    function sizeBoard() {
      const stage = boardEl.parentElement;
      const cs    = getComputedStyle(stage);
      const pw = stage.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ph = stage.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);
      if (pw <= 0 || ph <= 0) return;
      let w, h;
      if (pw / ph > ar) { h = ph; w = h * ar; }
      else              { w = pw; h = w / ar; }
      boardEl.style.width  = Math.floor(w) + "px";
      boardEl.style.height = Math.floor(h) + "px";
    }
    // requestAnimationFrame stellt sicher, dass der HUD-Reflow committed ist
    // bevor die Boardgröße berechnet wird (relevant bei gecachtem Bild)
    requestAnimationFrame(sizeBoard);
    // Auf Größenänderungen reagieren (Tablet drehen, Fenstergröße ändern)
    window.addEventListener("resize", sizeBoard);

    // grid[r][c] = correctIndex (0…N-1) oder null (leeres Feld)
    const grid = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        if (r === rows - 1 && c === cols - 1) grid[r][c] = null;
        else grid[r][c] = idx++;
      }
    }

    // Lösbares Shuffle: viele zufällige gültige Züge ab gelöstem Zustand
    shuffle(grid, rows, cols, 250);

    // Kachel-Elemente erzeugen (alle ausser der letzten)
    const totalTiles = rows * cols - 1;
    const tiles = new Array(totalTiles);
    for (let i = 0; i < totalTiles; i++) {
      const correctR = Math.floor(i / cols);
      const correctC = i % cols;
      const tile = document.createElement("div");
      tile.className = "slide-tile";
      tile.style.backgroundImage = `url("${imageUrl}")`;
      tile.style.backgroundPosition =
        `${cols > 1 ? (correctC / (cols - 1)) * 100 : 0}% ${rows > 1 ? (correctR / (rows - 1)) * 100 : 0}%`;
      tile.dataset.idx = i;
      attachTileHandlers(tile);
      boardEl.appendChild(tile);
      tiles[i] = tile;
    }
    positionAll();

    // ===== Hilfsfunktionen =====
    function positionAll() {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = grid[r][c];
          if (i === null) continue;
          tiles[i].style.transform = `translate(${c * 100}%, ${r * 100}%)`;
        }
      }
    }
    function findEmpty() {
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (grid[r][c] === null) return { r, c };
    }
    function findTile(i) {
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (grid[r][c] === i) return { r, c };
    }
    function isSolved() {
      let expected = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r === rows - 1 && c === cols - 1) {
            if (grid[r][c] !== null) return false;
          } else {
            if (grid[r][c] !== expected++) return false;
          }
        }
      }
      return true;
    }
    function tileSize() {
      const rect = boardEl.getBoundingClientRect();
      return { w: rect.width / cols, h: rect.height / rows };
    }

    // ===== Drag-Logik pro Kachel =====
    function attachTileHandlers(tile) {
      let drag = null;

      tile.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const i = parseInt(tile.dataset.idx);

        // Cheat-Modus: zwei beliebige Kacheln tauschen
        if (cheatRef && cheatRef.active) {
          if (cheatRef.first === null) {
            cheatRef.first = i;
            tile.classList.add("is-cheat-selected");
          } else if (cheatRef.first !== i) {
            const posA = findTile(cheatRef.first);
            const posB = findTile(i);
            grid[posA.r][posA.c] = i;
            grid[posB.r][posB.c] = cheatRef.first;
            boardEl.querySelectorAll(".is-cheat-selected").forEach(t => t.classList.remove("is-cheat-selected"));
            cheatRef.active = false;
            cheatRef.first  = null;
            if (cheatRef.onDone) cheatRef.onDone();
            boardEl.classList.add("is-animating");
            positionAll();
            setTimeout(() => {
              boardEl.classList.remove("is-animating");
              if (isSolved()) finishPuzzle();
            }, 220);
          }
          return;
        }

        const pos = findTile(i);
        const empty = findEmpty();

        // Kachel muss in derselben Reihe ODER Spalte wie das leere Feld liegen
        let axis = null, dir = 0;
        if (pos.r === empty.r) { axis = "x"; dir = Math.sign(empty.c - pos.c); }
        else if (pos.c === empty.c) { axis = "y"; dir = Math.sign(empty.r - pos.r); }
        else return;

        // Alle Kacheln, die mitschieben: von pos bis (exklusive) empty
        const movingTiles = [];
        const distance = axis === "x" ? Math.abs(empty.c - pos.c) : Math.abs(empty.r - pos.r);
        for (let k = 0; k < distance; k++) {
          const r = axis === "y" ? pos.r + k * dir : pos.r;
          const c = axis === "x" ? pos.c + k * dir : pos.c;
          movingTiles.push({ idx: grid[r][c], r, c });
        }

        tile.setPointerCapture(e.pointerId);
        tile.classList.add("is-dragging");
        boardEl.classList.remove("is-animating");

        drag = {
          axis, dir,
          startX: e.clientX, startY: e.clientY,
          movingTiles,
          offset: 0,
          tileSize: tileSize(),
        };
      });

      tile.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const raw = drag.axis === "x"
          ? (e.clientX - drag.startX) * drag.dir / drag.tileSize.w
          : (e.clientY - drag.startY) * drag.dir / drag.tileSize.h;
        // Maximal 1 Schritt in Richtung Lücke
        const clamped = Math.max(0, Math.min(1, raw));
        drag.offset = clamped;
        for (const mt of drag.movingTiles) {
          const tx = drag.axis === "x" ? (mt.c + clamped * drag.dir) * 100 : mt.c * 100;
          const ty = drag.axis === "y" ? (mt.r + clamped * drag.dir) * 100 : mt.r * 100;
          tiles[mt.idx].style.transform = `translate(${tx}%, ${ty}%)`;
        }
      });

      const endDrag = (e) => {
        if (!drag) return;
        tile.classList.remove("is-dragging");

        const commit = drag.offset > 0.5;
        if (commit) {
          // Grid-State aktualisieren — vom letzten Element (nahe Lücke) zum ersten
          for (let k = drag.movingTiles.length - 1; k >= 0; k--) {
            const mt = drag.movingTiles[k];
            const newR = mt.r + (drag.axis === "y" ? drag.dir : 0);
            const newC = mt.c + (drag.axis === "x" ? drag.dir : 0);
            grid[newR][newC] = mt.idx;
          }
          // Erste Quell-Position wird zur neuen Lücke
          const first = drag.movingTiles[0];
          grid[first.r][first.c] = null;
        }

        boardEl.classList.add("is-animating");
        positionAll();
        setTimeout(() => boardEl.classList.remove("is-animating"), 220);

        const wasCommit = commit;
        drag = null;

        if (wasCommit && isSolved()) finishPuzzle();
      };
      tile.addEventListener("pointerup", endDrag);
      tile.addEventListener("pointercancel", endDrag);
    }

    function finishPuzzle() {
      // Letzte (versteckte) Kachel ploppt in die Lücke
      const lastR = rows - 1, lastC = cols - 1;
      const tile = document.createElement("div");
      tile.className = "slide-tile is-final";
      tile.style.backgroundImage = `url("${imageUrl}")`;
      tile.style.backgroundPosition =
        `${cols > 1 ? (lastC / (cols - 1)) * 100 : 0}% ${rows > 1 ? (lastR / (rows - 1)) * 100 : 0}%`;
      tile.style.setProperty("--final-transform", `translate(${lastC * 100}%, ${lastR * 100}%)`);
      tile.style.transform = `translate(${lastC * 100}%, ${lastR * 100}%)`;
      boardEl.appendChild(tile);
      setTimeout(onComplete, 1100);
    }
  }
}

function shuffle(grid, rows, cols, moves) {
  let er = rows - 1, ec = cols - 1;
  let last = null;
  const opp = { up: "down", down: "up", left: "right", right: "left" };
  for (let i = 0; i < moves; i++) {
    const options = [];
    if (er > 0          && last !== "up")    options.push({ dr: -1, dc:  0, name: "down"  });
    if (er < rows - 1   && last !== "down")  options.push({ dr:  1, dc:  0, name: "up"    });
    if (ec > 0          && last !== "left")  options.push({ dr:  0, dc: -1, name: "right" });
    if (ec < cols - 1   && last !== "right") options.push({ dr:  0, dc:  1, name: "left"  });
    const m = options[Math.floor(Math.random() * options.length)];
    grid[er][ec] = grid[er + m.dr][ec + m.dc];
    grid[er + m.dr][ec + m.dc] = null;
    er += m.dr; ec += m.dc;
    last = opp[m.name];
  }
}

// =====================================================================
// Quiz-Mechaniken
// =====================================================================
function attachDragHandlers(chip, onDrop) {
  let drag = null;

  chip.addEventListener("pointerdown", e => {
    e.preventDefault();
    chip.setPointerCapture(e.pointerId);
    const rect  = chip.getBoundingClientRect();
    const ghost = chip.cloneNode(true);
    ghost.classList.add("is-dragging");
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;margin:0;pointer-events:none;z-index:1000;`;
    document.body.appendChild(ghost);
    chip.classList.add("is-ghost-source");
    drag = { ghost, ox: rect.left, oy: rect.top, sx: e.clientX, sy: e.clientY };
  });

  chip.addEventListener("pointermove", e => {
    if (!drag) return;
    drag.ghost.style.left = drag.ox + (e.clientX - drag.sx) + "px";
    drag.ghost.style.top  = drag.oy + (e.clientY - drag.sy) + "px";
    document.querySelectorAll(".blank-slot.is-drag-over").forEach(s => s.classList.remove("is-drag-over"));
    document.elementsFromPoint(e.clientX, e.clientY)
      .find(el => el.classList?.contains("blank-slot"))
      ?.classList.add("is-drag-over");
  });

  const endDrag = e => {
    if (!drag) return;
    drag.ghost.remove();
    chip.classList.remove("is-ghost-source");
    document.querySelectorAll(".blank-slot.is-drag-over").forEach(s => s.classList.remove("is-drag-over"));
    const target = document.elementsFromPoint(e.clientX, e.clientY)
      .find(el => el.classList?.contains("blank-slot")) || null;
    onDrop(chip, target);
    drag = null;
  };
  chip.addEventListener("pointerup",    endDrag);
  chip.addEventListener("pointercancel", endDrag);
}

// =====================================================================
// Einheitliches Stations-Opener-Modal (Vorlage für alle Stationen)
// =====================================================================
function renderStationOpener(bodyEl, actionBtn, { icon, title, text, hint }, onStart) {
  bodyEl.innerHTML = "";
  const intro = document.createElement("div");
  intro.className = "wom-intro";
  const iconEl = document.createElement("div");
  iconEl.className = "wom-intro-icon";
  iconEl.textContent = icon;
  const titleEl = document.createElement("div");
  titleEl.className = "wom-intro-title";
  titleEl.textContent = title;
  const textEl = document.createElement("p");
  textEl.className = "wom-intro-text";
  textEl.innerHTML = text;
  intro.append(iconEl, titleEl, textEl);
  if (hint) {
    const hintEl = document.createElement("div");
    hintEl.className = "wom-intro-hint";
    hintEl.innerHTML = hint;
    intro.appendChild(hintEl);
  }
  bodyEl.appendChild(intro);
  actionBtn.textContent = "Los geht's";
  actionBtn.disabled = false;
  actionBtn.onclick = e => { e.stopPropagation(); onStart(); };
}

function renderQuiz(quiz, bodyEl, callbacks) {
  if (quiz.type === "lueckentext") return renderLueckentext(bodyEl, quiz, callbacks);
  return null;
}

function renderLueckentext(bodyEl, quiz, { onAllFilled, onIncomplete }) {
  bodyEl.innerHTML = "";

  const n         = quiz.blanks.length;
  const slotWords = new Array(n).fill(null);
  const allWords  = shuffleArr([...quiz.blanks, ...quiz.distractors]);
  let checked     = false;

  // Text mit Lücken
  const textEl = document.createElement("p");
  textEl.className = "luecken-text";
  quiz.text.split(/\{(\d+)\}/).forEach((part, i) => {
    if (i % 2 === 0) {
      textEl.appendChild(document.createTextNode(part));
    } else {
      const slot = document.createElement("span");
      slot.className = "blank-slot";
      slot.dataset.blank = part;
      textEl.appendChild(slot);
    }
  });
  bodyEl.appendChild(textEl);

  const slots = Array.from(textEl.querySelectorAll(".blank-slot"));
  const chips = {};

  function updateSlot(idx) {
    const slot = slots[idx];
    slot.innerHTML = "";
    const word = slotWords[idx];
    slot.classList.toggle("is-filled", !!word);
    if (!word) return;
    if (checked) {
      const span = document.createElement("span");
      span.textContent = word;
      slot.appendChild(span);
    } else {
      const chip = document.createElement("span");
      chip.className = "word-chip";
      chip.textContent = word;
      chip.dataset.word = word;
      slot.appendChild(chip);
      attachDragHandlers(chip, (_, target) => {
        if (checked) return;
        if (target?.classList.contains("blank-slot")) {
          placeWord(word, parseInt(target.dataset.blank));
        } else {
          returnToBank(word);
        }
      });
    }
  }

  function checkFillState() {
    if (slotWords.every(w => w !== null)) onAllFilled();
    else onIncomplete();
  }

  function placeWord(word, idx) {
    if (checked) return;
    const prev = slotWords.indexOf(word);
    if (prev !== -1) {
      if (prev === idx) return;
      slotWords[prev] = null;
      updateSlot(prev);
    }
    const displaced = slotWords[idx];
    if (displaced) chips[displaced].classList.remove("is-used");
    slotWords[idx] = word;
    chips[word].classList.add("is-used");
    updateSlot(idx);
    checkFillState();
  }

  function returnToBank(word) {
    if (checked) return;
    const idx = slotWords.indexOf(word);
    if (idx === -1) return;
    chips[word].classList.remove("is-used");
    slotWords[idx] = null;
    updateSlot(idx);
    checkFillState();
  }

  // Wortbank
  const bankEl = document.createElement("div");
  bankEl.className = "word-bank";
  allWords.forEach(word => {
    const chip = document.createElement("span");
    chip.className = "word-chip";
    chip.textContent = word;
    chip.dataset.word = word;
    chips[word] = chip;
    bankEl.appendChild(chip);
    attachDragHandlers(chip, (chip, target) => {
      if (checked || !target?.classList.contains("blank-slot")) return;
      placeWord(chip.dataset.word, parseInt(target.dataset.blank));
    });
  });
  bodyEl.appendChild(bankEl);

  // Klick auf gefüllte Lücke → Wort zurück in die Bank
  textEl.addEventListener("click", e => {
    if (checked) return;
    const slot = e.target.closest(".blank-slot");
    if (!slot) return;
    const idx = parseInt(slot.dataset.blank);
    if (slotWords[idx]) returnToBank(slotWords[idx]);
  });

  return function check() {
    checked = true;
    Object.values(chips).forEach(c => { c.style.pointerEvents = "none"; c.style.cursor = "default"; });
    slots.forEach(s => { s.style.pointerEvents = "none"; s.style.cursor = "default"; });
    slots.forEach((_, i) => updateSlot(i));

    let earned = 0;
    slots.forEach((slot, i) => {
      if (!slotWords[i]) return;
      const correct = slotWords[i] === quiz.blanks[i];
      slot.classList.toggle("is-correct", correct);
      slot.classList.toggle("is-wrong",   !correct);
      if (correct) {
        earned++;
      } else {
        const hint = document.createElement("small");
        hint.className = "correct-hint";
        hint.textContent = "→ " + quiz.blanks[i];
        slot.appendChild(hint);
      }
    });
    if (earned === n) {
      const msg = document.createElement("p");
      msg.className = "quiz-success-msg";
      msg.textContent = "✓ Alles richtig!";
      bodyEl.appendChild(msg);
    }
    return earned;
  };
}

// =====================================================================
// Station 5 — Karten-Sortierung (Drag & Drop in 3 Kategorien)
// =====================================================================
const KS_ICONS = {
  database: `<line x1="12" y1="4" x2="12" y2="20"/><line x1="5" y1="20" x2="19" y2="20"/><line x1="3" y1="8" x2="21" y2="8"/><path d="M3 8c0 2.761 4.029 5 9 5s9-2.239 9-5"/><ellipse cx="12" cy="5" rx="9" ry="3"/>`,
  chip:     `<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M10 4v4M14 4v4M10 16v4M14 16v4M4 10h4M4 14h4M16 10h4M16 14h4"/>`,
  users:    `<circle cx="9" cy="7" r="3.5"/><path d="M2 21v-1a6.5 6.5 0 016.5-6.5h1A6.5 6.5 0 0116 20v1"/><circle cx="19.5" cy="8.5" r="2.5"/><path d="M22 21v-1a4.5 4.5 0 00-3.5-4.38"/>`,
  server:   `<rect x="2" y="3" width="20" height="6" rx="1.5"/><rect x="2" y="11" width="20" height="6" rx="1.5"/><circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="6" cy="14" r="1.5" fill="currentColor" stroke="none"/><line x1="10" y1="6" x2="18" y2="6"/><line x1="10" y1="14" x2="18" y2="14"/>`,
  tag:      `<path d="M21 7L12 3H5a2 2 0 00-2 2v7l9 9a2 2 0 002.83 0l6.17-6.17A2 2 0 0021 13V7z"/><circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none"/>`,
  document: `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/>`,
  globe:    `<circle cx="12" cy="12" r="9"/><path d="M12 3c-2.5 3-4 5.667-4 9s1.5 6 4 9M12 3c2.5 3 4 5.667 4 9s-1.5 6-4 9"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>`,
  clock:    `<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 15.5"/>`,
  code:     `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>`,
  pencil:   `<path d="M17 3a2.83 2.83 0 014 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`,
  warning:  `<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none"/>`,
  scale:    `<line x1="12" y1="4" x2="12" y2="20"/><line x1="5" y1="20" x2="19" y2="20"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="6" y1="9" x2="6" y2="12"/><path d="M3 12a3 3 0 006 0"/><line x1="18" y1="9" x2="18" y2="12"/><path d="M15 12a3 3 0 006 0"/>`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="15" x2="15" y2="21"/><line x1="15" y1="15" x2="9" y2="21"/>`,
  question: `<circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  bug:      `<circle cx="12" cy="11" r="4"/><path d="M12 15v5M8 10H4M20 10h-4M6.5 5.5L4.5 3.5M17.5 5.5L19.5 3.5M4.5 19.5l2-2M19.5 19.5l-2-2"/>`,
};

function ksSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${KS_ICONS[name] ?? ""}</svg>`;
}

function ksPickBalanced(cards, pick) {
  const byCat = {};
  cards.forEach(c => { (byCat[c.cat] = byCat[c.cat] || []).push(c); });
  const cats = Object.keys(byCat);
  cats.forEach(cat => shuffleArr(byCat[cat]));
  const result = cats.flatMap(cat => byCat[cat].splice(0, 2));
  const rest   = shuffleArr(cats.flatMap(cat => byCat[cat]));
  result.push(...rest.slice(0, pick - result.length));
  return shuffleArr(result);
}

function renderKartenSort(bodyEl, actionBtn, quiz) {
  const picked  = ksPickBalanced(quiz.cards.map(c => ({ ...c })), quiz.pick);
  const cats    = quiz.categories;
  const placed  = new Map(); // cardIdx → catId
  let   checked = false;

  function showGame() {
    bodyEl.innerHTML = `
    <p class="ks-intro">Ziehe jede Karte in die richtige Kategorie.</p>
    <div class="ks-zones" id="ks-zones">
      ${cats.map(cat => `
        <div class="ks-zone" data-cat="${cat.id}"
             style="--ks-color:${cat.color};--ks-bg:${cat.bg}">
          <div class="ks-zone-label">${cat.label}</div>
          <div class="ks-zone-slots" id="ks-slots-${cat.id}"></div>
        </div>`).join("")}
    </div>
    <div class="ks-hand" id="ks-hand">
      ${picked.map((card, i) => `
        <div class="ks-card" data-ks="${i}" tabindex="0">
          <div class="ks-card-icon">${ksSvg(card.icon)}</div>
          <div class="ks-card-text">${card.text}</div>
        </div>`).join("")}
    </div>`;

  function updateBtn() {
    actionBtn.disabled = placed.size < picked.length;
  }

  function clearChip(idx) {
    bodyEl.querySelector(`.ks-chip[data-ks="${idx}"]`)?.remove();
    placed.delete(idx);
  }

  function returnToHand(idx) {
    clearChip(idx);
    const cardEl = bodyEl.querySelector(`.ks-card[data-ks="${idx}"]`);
    if (cardEl) cardEl.style.display = "";
    updateBtn();
  }

  function placeCard(idx, catId) {
    if (checked) return;
    clearChip(idx); // entfernt alten Chip falls umgepackt wird
    const card = picked[idx];
    const zone = bodyEl.querySelector(`#ks-slots-${catId}`);
    const cardEl = bodyEl.querySelector(`.ks-card[data-ks="${idx}"]`);

    const chip = document.createElement("div");
    chip.className  = "ks-chip";
    chip.dataset.ks = idx;
    chip.innerHTML  = `<span class="ks-chip-icon">${ksSvg(card.icon)}</span>`;
    attachChipDrag(chip, idx);
    zone.appendChild(chip);

    placed.set(idx, catId);
    if (cardEl) cardEl.style.display = "none";
    updateBtn();
  }

  function attachDragBehavior(el, getGhostStyle, onDrop) {
    let drag = null;
    el.addEventListener("pointerdown", e => {
      if (checked) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const rect  = el.getBoundingClientRect();
      const ghost = el.cloneNode(true);
      ghost.style.cssText = getGhostStyle(rect) + "pointer-events:none;z-index:1000;";
      document.body.appendChild(ghost);
      el.style.opacity = "0.3";
      drag = { ghost, ox: rect.left, oy: rect.top, sx: e.clientX, sy: e.clientY };
    });
    el.addEventListener("pointermove", e => {
      if (!drag) return;
      drag.ghost.style.left = drag.ox + (e.clientX - drag.sx) + "px";
      drag.ghost.style.top  = drag.oy + (e.clientY - drag.sy) + "px";
      bodyEl.querySelectorAll(".ks-zone.is-drag-over").forEach(z => z.classList.remove("is-drag-over"));
      document.elementsFromPoint(e.clientX, e.clientY)
        .find(z => z.classList?.contains("ks-zone"))
        ?.classList.add("is-drag-over");
    });
    const end = e => {
      if (!drag) return;
      drag.ghost.remove();
      el.style.opacity = "";
      bodyEl.querySelectorAll(".ks-zone.is-drag-over").forEach(z => z.classList.remove("is-drag-over"));
      const zone = document.elementsFromPoint(e.clientX, e.clientY)
        .find(z => z.classList?.contains("ks-zone")) || null;
      onDrop(zone);
      drag = null;
    };
    el.addEventListener("pointerup",     end);
    el.addEventListener("pointercancel", end);
  }

  function attachChipDrag(chip, idx) {
    attachDragBehavior(
      chip,
      rect => `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;opacity:0.92;transform:scale(1.05) rotate(1deg);box-shadow:0 8px 24px rgba(0,0,0,0.22);border-radius:10px;background:white;border:2px solid var(--c-primary);`,
      zone => {
        if (zone && zone.dataset.cat !== placed.get(idx)) {
          placeCard(idx, zone.dataset.cat); // umpacken
        } else if (!zone) {
          returnToHand(idx); // zurück in die Hand
        }
        // wenn gleiche Zone: nichts tun
      }
    );
  }

  // Drag-Handler für Hand-Karten
  picked.forEach((_, i) => {
    const el = bodyEl.querySelector(`.ks-card[data-ks="${i}"]`);
    attachDragBehavior(
      el,
      rect => `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;opacity:0.92;transform:scale(1.05);box-shadow:0 12px 32px rgba(0,0,0,0.25);border-radius:14px;background:white;border:2px solid var(--c-primary);`,
      zone => { if (zone) placeCard(i, zone.dataset.cat); }
    );
  });

  actionBtn.textContent = "Prüfen";
  actionBtn.disabled    = true;
  let phase = "check";

  actionBtn.onclick = e => {
    e.stopPropagation();
    if (phase === "check") {
      checked = true;
      let correct = 0;
      placed.forEach((catId, idx) => {
        const isOk  = catId === picked[idx].cat;
        if (isOk) correct++;
        const chip  = bodyEl.querySelector(`.ks-chip[data-ks="${idx}"]`);
        chip?.classList.add(isOk ? "is-correct" : "is-wrong");
      });
      state.pendingEarned = correct;
      state.pendingMax    = picked.length;
      phase = "finish";
      actionBtn.textContent = `Weiter → (${correct}/${picked.length} richtig)`;
      actionBtn.disabled    = false;
    } else {
      finishQuiz();
    }
  };

    updateBtn();
  }

  renderStationOpener(bodyEl, actionBtn, {
    icon:  "🗂️",
    title: "Sortiere die Karten",
    text:  "Ordne jede Karte der richtigen Kategorie zu.<br><strong>Ziehe die Karten in das passende Feld.</strong>",
    hint:  '<span class="wom-intro-hint-stimmt">✋ Karte halten</span><span class="wom-intro-hint-mythos">📂 In Feld ziehen</span>',
  }, showGame);
}

// =====================================================================
// Multiple-Choice-Quiz (Schritt für Schritt, mit Streak & Bonus)
// =====================================================================
function renderMultiplechoice(bodyEl, actionBtn, quiz) {
  // Fragen zufällig auswählen und Ablaufliste aufbauen
  const steps = [];
  quiz.sections.forEach(section => {
    steps.push({ type: "intro", section });
    const pool = shuffleArr([...section.questions]);
    pool.slice(0, section.pick).forEach(q => steps.push({ type: "question", q }));
  });
  steps.push({ type: "summary" });

  const totalQ = quiz.sections.reduce((s, sec) => s + sec.pick, 0);
  let stepIdx = 0;
  let earned  = 0;
  let streak  = 0;
  let bonus   = 0;
  let qNum    = 0;

  function advance() {
    stepIdx++;
    const card = document.querySelector(".quiz-card");
    if (card) card.scrollTop = 0;
    render();
  }

  function render() {
    bodyEl.innerHTML = "";
    actionBtn.onclick = null;
    const s = steps[stepIdx];

    if (s.type === "intro") {
      renderIntro(s.section);
    } else if (s.type === "question") {
      qNum++;
      renderQuestion(s.q);
    } else {
      renderSummary();
    }
  }

  const SECTION_ICONS = { "Trainingsdaten": "📚", "Pre-Training": "⚙️", "Fine-Tuning": "🎯" };

  function renderIntro(section) {
    renderStationOpener(bodyEl, actionBtn, {
      icon:  SECTION_ICONS[section.title] || "📖",
      title: section.title,
      text:  section.info,
      hint:  '<span class="wom-intro-hint-stimmt">🔥 Streak = Bonuspunkte</span>',
    }, advance);
  }

  function renderQuestion(q) {
    // Antwortoptionen zufällig mischen
    const shuffledOpts = shuffleArr([...q.options]);

    // Fortschritt + Streak
    const progress = document.createElement("div");
    progress.className = "mc-progress";
    const label = document.createElement("span");
    label.className = "mc-progress-label";
    label.textContent = "Frage " + qNum + " / " + totalQ;
    const streakEl = document.createElement("div");
    streakEl.className = "mc-streak" + (streak > 0 ? " is-active" : "");
    streakEl.id = "mc-streak-live";
    streakEl.dataset.streak = streak;
    const flames = streak >= 9 ? "🔥🔥🔥" : streak >= 6 ? "🔥🔥" : "🔥";
    streakEl.innerHTML = flames + " <span class=\"mc-streak-count\">" + streak + "</span>";
    progress.append(label, streakEl);
    bodyEl.appendChild(progress);

    // Fragetext
    const qEl = document.createElement("p");
    qEl.className = "mc-question";
    qEl.textContent = q.text;
    bodyEl.appendChild(qEl);

    // Antwortoptionen
    const optionsEl = document.createElement("div");
    optionsEl.className = "mc-options " + (q.multi ? "mc-options--multi" : "mc-options--single");
    const selected = new Set();

    shuffledOpts.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "mc-option";
      btn.textContent = opt.text;
      btn.addEventListener("click", () => {
        if (q.multi) {
          btn.classList.toggle("is-selected");
          selected.has(i) ? selected.delete(i) : selected.add(i);
        } else {
          optionsEl.querySelectorAll(".mc-option").forEach(b => b.classList.remove("is-selected"));
          btn.classList.add("is-selected");
          selected.clear();
          selected.add(i);
        }
        actionBtn.disabled = selected.size === 0;
      });
      optionsEl.appendChild(btn);
    });
    bodyEl.appendChild(optionsEl);

    actionBtn.textContent = "Prüfen";
    actionBtn.disabled = true;

    actionBtn.onclick = e => {
      e.stopPropagation();
      optionsEl.querySelectorAll(".mc-option").forEach(b => { b.disabled = true; });

      // Auswertung anhand shuffledOpts
      const correctSet = new Set(
        shuffledOpts.map((o, i) => (o.correct ? i : -1)).filter(i => i !== -1)
      );
      const isCorrect =
        selected.size === correctSet.size && [...selected].every(i => correctSet.has(i));

      // Feedback-Klassen
      shuffledOpts.forEach((opt, i) => {
        const btn = optionsEl.children[i];
        if (opt.correct && selected.has(i))       btn.classList.add("is-correct");
        else if (!opt.correct && selected.has(i)) btn.classList.add("is-wrong");
        else if (opt.correct && !selected.has(i)) btn.classList.add("is-missed");
      });

      // Streak & Bonus
      let milestoneText = null;
      if (isCorrect) {
        earned++;
        streak++;
        if (streak === 3)  { bonus += 1; milestoneText = "🔥 3 in Folge — +1 Bonus!"; }
        if (streak === 6)  { bonus += 2; milestoneText = "🔥🔥 6 in Folge — +2 Bonus!"; }
        if (streak === 9)  { bonus += 3; milestoneText = "🔥🔥🔥 9 in Folge — +3 Bonus!"; }
        if (streak === 12) { bonus += 5; milestoneText = "🔥🔥🔥🔥 12 in Folge — +5 Bonus!"; }
      } else {
        streak = 0;
      }

      // Streak-Anzeige aktualisieren mit Bump-Animation
      const live = document.getElementById("mc-streak-live");
      if (live) {
        live.classList.toggle("is-active", streak > 0);
        live.classList.remove("bump");
        void live.offsetWidth; // reflow für Animation-Neustart
        live.classList.add("bump");
        const newFlames = streak >= 9 ? "🔥🔥🔥" : streak >= 6 ? "🔥🔥" : "🔥";
        live.innerHTML = newFlames + " <span class=\"mc-streak-count\">" + streak + "</span>";
        setTimeout(() => live.classList.remove("bump"), 350);
      }

      // Milestone-Toast
      if (milestoneText) {
        const toast = document.createElement("div");
        toast.className = "mc-milestone";
        toast.textContent = milestoneText;
        bodyEl.insertBefore(toast, bodyEl.firstChild);
      }

      // Erklärungstext einblenden
      if (q.explanation) {
        const expEl = document.createElement("p");
        expEl.className = "mc-explanation";
        expEl.textContent = q.explanation;
        bodyEl.appendChild(expEl);
      }

      const isLast = stepIdx === steps.length - 2;
      actionBtn.textContent = isLast ? "Ergebnis anzeigen" : "Weiter →";
      actionBtn.disabled = false;
      actionBtn.onclick = e => { e.stopPropagation(); advance(); };
    };
  }

  function renderSummary() {
    state.pendingEarned = earned;
    state.pendingMax    = totalQ;
    state.pendingBonus  = bonus;

    const div = document.createElement("div");
    div.className = "mc-summary";

    [
      { label: "Richtige Antworten", val: earned + " / " + totalQ },
      { label: "Streak-Bonus",       val: "+" + bonus },
    ].forEach(({ label, val }) => {
      const row = document.createElement("div");
      row.className = "mc-summary-row";
      const span = document.createElement("span"); span.textContent = label;
      const strong = document.createElement("strong"); strong.textContent = val;
      row.append(span, strong);
      div.appendChild(row);
    });

    const divider = document.createElement("div");
    divider.className = "mc-summary-divider";
    div.appendChild(divider);

    const totalRow = document.createElement("div");
    totalRow.className = "mc-summary-row mc-summary-total";
    const tSpan = document.createElement("span"); tSpan.textContent = "Gesamt";
    const tStrong = document.createElement("strong"); tStrong.textContent = (earned + bonus) + " Punkte";
    totalRow.append(tSpan, tStrong);
    div.appendChild(totalRow);

    bodyEl.appendChild(div);
    actionBtn.textContent = "Station abschließen";
    actionBtn.disabled = false;
    actionBtn.onclick = e => { e.stopPropagation(); finishQuiz(); };
  }

  render();
}

// =====================================================================
// Wahr-oder-Mythos-Quiz (Station 3)
// =====================================================================
function renderWahrOderMythos(bodyEl, actionBtn, quiz) {
  const pool = shuffleArr([...quiz.pool]).slice(0, quiz.pick);
  const cards = shuffleArr([...quiz.fixed, ...pool]);
  const totalQ = cards.length;
  let cardIdx = -1;  // -1 = intro
  let earned  = 0;

  function advance() {
    cardIdx++;
    const card = document.querySelector(".quiz-card");
    if (card) card.scrollTop = 0;
    render();
  }

  function render() {
    bodyEl.innerHTML = "";
    actionBtn.onclick = null;
    if (cardIdx === -1) {
      renderIntro();
    } else if (cardIdx < totalQ) {
      renderCard(cards[cardIdx]);
    } else {
      renderSummary();
    }
  }

  function renderIntro() {
    renderStationOpener(bodyEl, actionBtn, {
      icon:  "🔍",
      title: "Stimmt oder Mythos?",
      text:  totalQ + " Aussagen über KI — wahr oder erfunden?<br><strong>Tippe bei jeder auf:</strong>",
      hint:  '<span class="wom-intro-hint-stimmt">✓ Stimmt</span><span class="wom-intro-hint-mythos">✗ Mythos</span>',
    }, advance);
  }

  function renderCard(c) {
    const dotsEl = document.createElement("div");
    dotsEl.className = "wom-dots";
    for (let i = 0; i < totalQ; i++) {
      const dot = document.createElement("span");
      dot.className = "wom-dot" + (i === cardIdx ? " is-active" : i < cardIdx ? " is-done" : "");
      dotsEl.appendChild(dot);
    }
    bodyEl.appendChild(dotsEl);

    const stmtEl = document.createElement("div");
    stmtEl.className = "wom-statement";
    const quoteEl = document.createElement("div");
    quoteEl.className = "wom-statement-quote";
    quoteEl.textContent = "„";
    const textEl = document.createElement("p");
    textEl.className = "wom-statement-text";
    textEl.textContent = c.text;
    stmtEl.append(quoteEl, textEl);
    bodyEl.appendChild(stmtEl);

    const btnsEl = document.createElement("div");
    btnsEl.className = "wom-buttons";

    const stimmt = document.createElement("button");
    stimmt.className = "wom-btn wom-btn--stimmt";
    const sIcon = document.createElement("span");
    sIcon.className = "wom-btn-icon";
    sIcon.textContent = "✓";
    const sLabel = document.createElement("span");
    sLabel.textContent = "Stimmt";
    stimmt.append(sIcon, sLabel);

    const mythos = document.createElement("button");
    mythos.className = "wom-btn wom-btn--mythos";
    const mIcon = document.createElement("span");
    mIcon.className = "wom-btn-icon";
    mIcon.textContent = "✗";
    const mLabel = document.createElement("span");
    mLabel.textContent = "Mythos";
    mythos.append(mIcon, mLabel);

    function handleAnswer(chosen) {
      stimmt.disabled = true;
      mythos.disabled = true;
      const isCorrect = chosen === c.correct;
      if (isCorrect) earned++;

      stimmt.classList.add(c.correct  ? "is-correct" : "is-wrong");
      mythos.classList.add(!c.correct ? "is-correct" : "is-wrong");

      const activeDot = dotsEl.querySelectorAll(".wom-dot")[cardIdx];
      if (activeDot) activeDot.classList.add(isCorrect ? "is-correct" : "is-wrong");

      if (c.explanation) {
        const expEl = document.createElement("div");
        expEl.className = "wom-explanation " + (isCorrect ? "wom-explanation--correct" : "wom-explanation--wrong");
        const badge = document.createElement("span");
        badge.className = "wom-exp-badge";
        badge.textContent = isCorrect ? "✓ Richtig" : "✗ Falsch";
        const expText = document.createElement("p");
        expText.textContent = c.explanation;
        expEl.append(badge, expText);
        bodyEl.appendChild(expEl);
      }

      const isLast = cardIdx === totalQ - 1;
      actionBtn.textContent = isLast ? "Ergebnis anzeigen" : "Weiter →";
      actionBtn.disabled = false;
      actionBtn.onclick = e => { e.stopPropagation(); advance(); };
    }

    stimmt.addEventListener("click", () => handleAnswer(true));
    mythos.addEventListener("click", () => handleAnswer(false));
    btnsEl.append(stimmt, mythos);
    bodyEl.appendChild(btnsEl);

    actionBtn.textContent = "Stimmt oder Mythos?";
    actionBtn.disabled = true;
  }

  function renderSummary() {
    state.pendingEarned = earned;
    state.pendingMax    = totalQ;
    state.pendingBonus  = 0;

    const div = document.createElement("div");
    div.className = "mc-summary";

    const row = document.createElement("div");
    row.className = "mc-summary-row";
    const span = document.createElement("span"); span.textContent = "Richtige Antworten";
    const strong = document.createElement("strong"); strong.textContent = earned + " / " + totalQ;
    row.append(span, strong);
    div.appendChild(row);

    const divider = document.createElement("div");
    divider.className = "mc-summary-divider";
    div.appendChild(divider);

    const totalRow = document.createElement("div");
    totalRow.className = "mc-summary-row mc-summary-total";
    const tSpan = document.createElement("span"); tSpan.textContent = "Gesamt";
    const tStrong = document.createElement("strong"); tStrong.textContent = earned + " Punkte";
    totalRow.append(tSpan, tStrong);
    div.appendChild(totalRow);

    bodyEl.appendChild(div);
    actionBtn.textContent = "Station abschließen";
    actionBtn.disabled = false;
    actionBtn.onclick = e => { e.stopPropagation(); finishQuiz(); };
  }

  render();
}

// =====================================================================
// Station 7 — "Schlüsselkonzepte" (Render-Funktion)
// =====================================================================

function initBegCarousel(gridEl) {
  if (window.innerWidth > 640) return;
  const cards = Array.from(gridEl.querySelectorAll(".beg-expl-card"));
  if (!cards.length) return;
  let current = 0;

  const dotsEl = document.createElement("div");
  dotsEl.className = "beg-carousel-dots";
  cards.forEach(() => {
    const dot = document.createElement("span");
    dot.className = "beg-carousel-dot";
    dotsEl.appendChild(dot);
  });
  gridEl.insertAdjacentElement("afterend", dotsEl);

  function goTo(idx) {
    cards[current].classList.remove("is-carousel-active");
    current = ((idx % cards.length) + cards.length) % cards.length;
    cards[current].classList.add("is-carousel-active");
    dotsEl.querySelectorAll(".beg-carousel-dot").forEach((d, i) =>
      d.classList.toggle("is-active", i === current));
  }

  goTo(0);

  let swipeStart = null;
  gridEl.addEventListener("pointerdown", e => {
    if (e.target.closest(".beg-term-chip")) return;
    swipeStart = { x: e.clientX, id: e.pointerId };
  });
  gridEl.addEventListener("pointerup", e => {
    if (!swipeStart || e.pointerId !== swipeStart.id) return;
    const dx = e.clientX - swipeStart.x;
    swipeStart = null;
    if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1);
  });
  gridEl.addEventListener("pointercancel", () => { swipeStart = null; });
}

function setBegPhaseTag(label) {
  let tag = document.querySelector(".quiz-badge .beg-phase-tag");
  if (!tag) {
    tag = document.createElement("span");
    tag.className = "beg-phase-tag";
    document.querySelector(".quiz-badge").appendChild(tag);
  }
  tag.textContent = label;
}

function renderBegriffe(bodyEl, actionBtn) {
  const data   = BEGRIFFE_DATA;
  let   p1Earned = 0;

  function renderPhase1() {
    const { correct, decoys } = data.phase1;
    const allChips = shuffleArr([...correct, ...decoys]);

    bodyEl.innerHTML = `
      <p class="beg-heading">Welche Begriffe gehören dazu?</p>
      <p class="beg-sub">Wähle genau die 7 Schlüsselkonzepte aus, die beim Umgang mit einem LLM wichtig sind.</p>
      <p class="beg-counter" id="beg-counter">0 / 7 ausgewählt</p>
      <div class="beg-chips" id="beg-chips-container"></div>
      <div class="beg-result" id="beg-result" style="display:none"></div>
    `;
    setBegPhaseTag("Phase 1/2");

    const container  = document.getElementById("beg-chips-container");
    const counterEl  = document.getElementById("beg-counter");
    const selected   = new Set();
    let   checked    = false;

    function updateChipStates() {
      const full = selected.size >= 7;
      container.querySelectorAll(".beg-chip").forEach(c => {
        if (!c.classList.contains("is-selected")) c.disabled = full;
      });
      counterEl.textContent = `${selected.size} / 7 ausgewählt`;
      actionBtn.disabled = selected.size !== 7;
    }

    allChips.forEach(term => {
      const btn = document.createElement("button");
      btn.className    = "beg-chip";
      btn.textContent  = term;
      btn.dataset.term = term;
      btn.addEventListener("click", () => {
        if (checked) return;
        const wasSelected = selected.has(term);
        if (!wasSelected && selected.size >= 7) return;
        btn.classList.toggle("is-selected");
        if (wasSelected) selected.delete(term);
        else selected.add(term);
        updateChipStates();
      });
      container.appendChild(btn);
    });

    actionBtn.textContent = "Überprüfen";
    actionBtn.disabled    = true;
    actionBtn.onclick = e => {
      e.stopPropagation();
      if (checked) { renderPhase2(); return; }
      checked = true;
      let earned = 0;

      container.querySelectorAll(".beg-chip").forEach(btn => {
        const term      = btn.dataset.term;
        const isCorrect = correct.includes(term);
        const isSel     = selected.has(term);

        if (isCorrect && isSel)        { btn.classList.add("is-correct"); earned++; }
        else if (!isCorrect && isSel)  btn.classList.add("is-wrong");
        else if (isCorrect && !isSel)  btn.classList.add("is-missed");
      });

      p1Earned = earned;
      const resultEl = document.getElementById("beg-result");
      resultEl.style.display = "";
      resultEl.textContent   = `${earned} von 7 Schlüsselkonzepten erkannt`;
      resultEl.className     = "beg-result" + (earned === 7 ? " is-perfect" : "");

      actionBtn.disabled    = false;
      actionBtn.textContent = "Weiter zu Phase 2 →";
    };
  }

  function renderPhase2() {
    const { items, decoyExplanations } = data.phase2;
    const allExpls = shuffleArr([
      ...items.map((it, i) => ({ text: it.explanation, termIdx: i })),
      ...decoyExplanations.map(t => ({ text: t, termIdx: -1 })),
    ]);

    setBegPhaseTag("Phase 2/2");
    bodyEl.innerHTML = `
      <div class="beg-p2-layout">
        <div class="beg-expl-grid" id="beg-expl-grid"></div>
        <div class="beg-p2-sidebar">
          <p class="beg-heading">Ordne die Begriffe zu</p>
          <p class="beg-sub">Ziehe jeden Begriff auf die passende Erklärung. Zwei gehören zu keinem.</p>
          <div class="beg-hand" id="beg-hand"></div>
        </div>
      </div>
    `;

    const handEl = document.getElementById("beg-hand");
    const gridEl = document.getElementById("beg-expl-grid");

    const assigned = new Map(); // termIdx → explIdx
    const placedAt = new Map(); // explIdx → termIdx
    let   checked  = false;

    // Erklärungskarten als Drop-Zonen
    allExpls.forEach((expl, explIdx) => {
      const card = document.createElement("div");
      card.className       = "beg-expl-card";
      card.dataset.explIdx = explIdx;
      card.innerHTML = `
        <div class="beg-expl-drop" data-expl-idx="${explIdx}">
          <span class="beg-expl-drop-hint">Begriff hierher ziehen</span>
        </div>
        <p class="beg-expl-text">${expl.text}</p>
      `;
      gridEl.appendChild(card);
    });

    // Begriffe-Chips als ziehbare Elemente — wandern physisch zwischen Hand und Karte
    items.forEach((it, termIdx) => {
      const chip = document.createElement("div");
      chip.className       = "beg-term-chip";
      chip.dataset.termIdx = termIdx;
      chip.textContent     = it.term;
      chip.tabIndex        = 0;
      attachTermDrag(chip, termIdx);
      handEl.appendChild(chip);
    });

    initBegCarousel(gridEl);

    function attachTermDrag(el, termIdx) {
      let drag = null;
      el.addEventListener("pointerdown", e => {
        if (checked) return;
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const rect  = el.getBoundingClientRect();
        const ghost = el.cloneNode(true);
        ghost.style.cssText =
          `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
          `padding:8px 16px;margin:0;opacity:0.95;pointer-events:none;z-index:1000;` +
          `transform:scale(1.1) rotate(-1deg);box-shadow:0 8px 24px rgba(0,0,0,.22);` +
          `border-radius:999px;background:var(--c-primary);color:#fff;font-size:14px;` +
          `font-weight:700;white-space:nowrap;`;
        document.body.appendChild(ghost);
        el.style.opacity = "0.25";
        drag = { ghost, ox: rect.left, oy: rect.top, sx: e.clientX, sy: e.clientY };
      });
      el.addEventListener("pointermove", e => {
        if (!drag) return;
        drag.ghost.style.left = drag.ox + (e.clientX - drag.sx) + "px";
        drag.ghost.style.top  = drag.oy + (e.clientY - drag.sy) + "px";
        gridEl.querySelectorAll(".beg-expl-card.is-drag-over").forEach(z => z.classList.remove("is-drag-over"));
        const hit  = document.elementsFromPoint(e.clientX, e.clientY);
        const card = hit.find(z => z.classList?.contains("beg-expl-card"))
                  || hit.find(z => z.closest?.(".beg-expl-card"))?.closest(".beg-expl-card");
        card?.classList.add("is-drag-over");
      });
      const end = e => {
        if (!drag) return;
        drag.ghost.remove();
        el.style.opacity = "";
        gridEl.querySelectorAll(".beg-expl-card.is-drag-over").forEach(z => z.classList.remove("is-drag-over"));
        const hit  = document.elementsFromPoint(e.clientX, e.clientY).filter(z => z !== el);
        const card = hit.find(z => z.classList?.contains("beg-expl-card"))
                  || hit.find(z => z.closest?.(".beg-expl-card"))?.closest(".beg-expl-card");
        // Auf anderer Karte loslassen → dorthin verschieben
        // Auf eigener Karte oder außerhalb loslassen → zurück in die Hand
        const sourceExplIdx = assigned.get(termIdx);
        if (card && parseInt(card.dataset.explIdx) !== sourceExplIdx) {
          dropOnCard(termIdx, parseInt(card.dataset.explIdx), el);
        } else {
          unplaceChip(termIdx, el);
        }
        drag = null;
      };
      el.addEventListener("pointerup",     end);
      el.addEventListener("pointercancel", end);
    }

    function dropOnCard(termIdx, explIdx, chipEl) {
      if (assigned.has(termIdx) && assigned.get(termIdx) === explIdx) return;

      // Chip aus altem Slot entfernen (restoreHint setzt innerHTML = "" → chipEl kurz detached, wird unten re-attached)
      if (assigned.has(termIdx)) {
        const old = assigned.get(termIdx);
        placedAt.delete(old);
        gridEl.querySelector(`.beg-expl-card[data-expl-idx="${old}"]`).classList.remove("is-filled");
        restoreHint(old);
      }
      // Evtl. vorhandenen Chip im Zielslot in die Hand verschieben
      if (placedAt.has(explIdx)) {
        const evicted     = placedAt.get(explIdx);
        const evictedChip = gridEl.querySelector(`.beg-expl-drop[data-expl-idx="${explIdx}"] .beg-term-chip`);
        assigned.delete(evicted);
        if (evictedChip) handEl.appendChild(evictedChip);
      }

      assigned.set(termIdx, explIdx);
      placedAt.set(explIdx, termIdx);

      const drop = gridEl.querySelector(`.beg-expl-drop[data-expl-idx="${explIdx}"]`);
      drop.innerHTML = "";
      drop.appendChild(chipEl); // Chip wandert physisch in den Slot
      gridEl.querySelector(`.beg-expl-card[data-expl-idx="${explIdx}"]`).classList.add("is-filled");
      updateBtn();
    }

    function unplaceChip(termIdx, chipEl) {
      if (!assigned.has(termIdx)) return;
      const explIdx = assigned.get(termIdx);
      assigned.delete(termIdx);
      placedAt.delete(explIdx);
      handEl.appendChild(chipEl); // Chip zurück in die Hand
      restoreHint(explIdx);
      gridEl.querySelector(`.beg-expl-card[data-expl-idx="${explIdx}"]`).classList.remove("is-filled");
      updateBtn();
    }

    function restoreHint(explIdx) {
      const drop = gridEl.querySelector(`.beg-expl-drop[data-expl-idx="${explIdx}"]`);
      if (!drop) return;
      drop.innerHTML = "";
      const hint = document.createElement("span");
      hint.className   = "beg-expl-drop-hint";
      hint.textContent = "Begriff hierher ziehen";
      drop.appendChild(hint);
    }

    function updateBtn() {
      actionBtn.disabled = assigned.size < 7;
    }

    actionBtn.textContent = "Überprüfen";
    actionBtn.disabled    = true;
    actionBtn.onclick = e => {
      e.stopPropagation();
      checked = true;
      let p2Earned = 0;

      allExpls.forEach((expl, explIdx) => {
        const card           = gridEl.querySelector(`.beg-expl-card[data-expl-idx="${explIdx}"]`);
        const drop           = card.querySelector(".beg-expl-drop");
        const placedTermIdx  = placedAt.get(explIdx);
        const correctTermIdx = expl.termIdx;

        if (placedTermIdx !== undefined) {
          const isCorrect = correctTermIdx === placedTermIdx;
          if (isCorrect) {
            card.classList.add("is-correct");
            p2Earned++;
          } else {
            card.classList.add("is-wrong");
            const placedName  = items[placedTermIdx].term;
            const correctName = correctTermIdx >= 0 ? items[correctTermIdx].term : null;
            drop.innerHTML = correctName
              ? `<span class="beg-expl-drop-wrong">${placedName}</span><span class="beg-expl-drop-correct">✓ ${correctName}</span>`
              : `<span class="beg-expl-drop-wrong">${placedName}</span><span class="beg-expl-drop-hint" style="margin-top:3px">Kein Begriff gehört hier</span>`;
          }
        } else if (correctTermIdx >= 0) {
          card.classList.add("is-missed");
          drop.innerHTML = `<span class="beg-expl-drop-correct">✓ ${items[correctTermIdx].term}</span>`;
        }
      });

      state.pendingEarned = p1Earned + p2Earned;
      state.pendingMax    = 14;
      state.pendingBonus  = 0;

      actionBtn.disabled    = false;
      actionBtn.textContent = "Station abschließen";
      actionBtn.onclick     = ev => { ev.stopPropagation(); finishQuiz(); };
    };
  }

  renderStationOpener(bodyEl, actionBtn, {
    icon:  "🔑",
    title: "Schlüsselkonzepte",
    text:  "Zwei Aufgaben warten:<br><strong>Erkenne die richtigen Begriffe, dann ordne sie ihren Erklärungen zu.</strong>",
    hint:  '<span class="wom-intro-hint-stimmt">Phase 1: Auswählen</span><span class="wom-intro-hint-mythos">Phase 2: Zuordnen</span>',
  }, renderPhase1);
}

// =====================================================================
// Station 6 — "Vom Prompt zur Antwort" (Render-Funktion)
// =====================================================================
function renderPromptFlow(bodyEl, actionBtn) {
  const filterBlocked = Math.random() < 0.5; // einmal pro Spielsession zufällig gesetzt
  const variantKeys   = ["websearch", "attachment", "conversation"];
  const round2Key     = variantKeys[Math.floor(Math.random() * variantKeys.length)];
  const rounds        = [filterBlocked ? "bomb" : "simple", round2Key];
  const PHASES        = ["input", "tokenize", "assemble", "model", "filter", "output"];
  const TOTAL_Q       = 5 * 2; // 5 Fragen pro Runde × 2 Runden

  let roundIdx       = 0;
  let phaseIdx       = -1; // -1 = Runden-Intro
  let earned         = 0;
  let questionPanel  = null; // DOM-Ref für das Question-Panel
  let showedOpener   = false;

  function v() { return FLOW_VARIANTS[rounds[roundIdx]]; }

  function advance() {
    phaseIdx++;
    if (phaseIdx >= PHASES.length) {
      roundIdx++;
      phaseIdx = -1;
      if (roundIdx >= rounds.length) { renderFinalSummary(); return; }
    }
    renderStep();
  }

  function setBtn(label, disabled, fn) {
    actionBtn.textContent = label;
    actionBtn.disabled    = !!disabled;
    actionBtn.onclick     = fn ? e => { e.stopPropagation(); fn(); } : null;
  }

  // ── Phasen-Fortschrittsleiste ─────────────────────────────────────
  function appendPhaseBar() {
    const labels = ["Input", "Tokens", "Kontext", "Modell", "Filter", "Output"];
    const bar = document.createElement("div");
    bar.className = "pf-bar";
    labels.forEach((lbl, i) => {
      const s = document.createElement("div");
      s.className = "pf-bar-step" +
        (i === phaseIdx ? " is-active" : i < phaseIdx ? " is-done" : "");
      s.innerHTML = `<span class="pf-bar-num">${i + 1}</span><span class="pf-bar-name">${lbl}</span>`;
      bar.appendChild(s);
    });
    bodyEl.appendChild(bar);
  }

  // ── Frage-Block ───────────────────────────────────────────────────
  function appendQuestion(q) {
    const panel = questionPanel;

    const qEl = document.createElement("p");
    qEl.className = "pf-question";
    qEl.textContent = q.text;
    panel.appendChild(qEl);

    const opts = document.createElement("div");
    opts.className = "pf-options";
    const shuffled = shuffleArr([...q.options]);
    let answered = false;

    shuffled.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "pf-option";
      btn.textContent = opt.text;
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        opts.querySelectorAll(".pf-option").forEach(b => { b.disabled = true; });
        if (opt.correct) {
          btn.classList.add("is-correct");
          earned++;
        } else {
          btn.classList.add("is-wrong");
          shuffled.forEach((o, i) => {
            if (o.correct) opts.children[i].classList.add("is-missed");
          });
        }
        if (q.explanation) {
          const exp = document.createElement("p");
          exp.className = "pf-explanation " + (opt.correct ? "pf-explanation--ok" : "pf-explanation--err");
          exp.textContent = q.explanation;
          panel.appendChild(exp);
        }
        const isLast = phaseIdx === PHASES.length - 1 && roundIdx === rounds.length - 1;
        setBtn(isLast ? "Auswertung →" : phaseIdx === PHASES.length - 1 ? "Nächste Runde →" : "Weiter →", false, advance);
      });
      opts.appendChild(btn);
    });

    panel.appendChild(opts);
    setBtn("Antwort auswählen …", true, null);
  }

  // ── Haupt-Dispatcher ──────────────────────────────────────────────
  function renderStep() {
    bodyEl.innerHTML = "";
    questionPanel = null;
    actionBtn.onclick = null;

    if (phaseIdx === -1) {
      if (!showedOpener) {
        showedOpener = true;
        renderStationOpener(bodyEl, actionBtn, {
          icon:  "💬",
          title: "Vom Prompt zur Antwort",
          text:  "Beobachte Schritt für Schritt, was mit deiner Frage passiert — vom Tippen bis zur fertigen Antwort.",
          hint:  '<span class="wom-intro-hint-stimmt">👁 Schritt verfolgen</span><span class="wom-intro-hint-mythos">❓ Frage beantworten</span>',
        }, renderRoundIntro);
      } else {
        renderRoundIntro();
      }
      return;
    }

    appendPhaseBar();

    // Scrollbare Viz-Zone
    const scrollArea = document.createElement("div");
    scrollArea.className = "pf-scroll-area";
    bodyEl.appendChild(scrollArea);

    const vis = document.createElement("div");
    vis.className = "pf-visual";
    scrollArea.appendChild(vis);

    const phase = PHASES[phaseIdx];
    if (phase === "input")    renderInputPhase(vis);
    if (phase === "tokenize") renderTokenizePhase(vis);
    if (phase === "assemble") renderAssemblePhase(vis);
    if (phase === "model")    renderModelPhase(vis);
    if (phase === "filter")   renderFilterPhase(vis);
    if (phase === "output")   renderOutputPhase(vis);

    const q = phase === "assemble" ? v().assembleQ : (v().phaseQs?.[phase] ?? FLOW_PHASE_QS[phase] ?? null);
    if (q) {
      questionPanel = document.createElement("div");
      questionPanel.className = "pf-question-panel";
      bodyEl.appendChild(questionPanel);
      appendQuestion(q);
    } else {
      setBtn("Weiter →", false, advance);
    }
  }

  // ── Runden-Intro ──────────────────────────────────────────────────
  function renderRoundIntro() {
    const variant = v();
    const roundDescs = [
      "Verfolge Schritt für Schritt, was passiert, wenn du eine Frage einschickst.",
      "Jetzt siehst du, wie sich der Prompt verändert, wenn noch mehr Kontext dazukommt.",
    ];
    const roundIcons = ["1️⃣", "2️⃣"];
    renderStationOpener(bodyEl, actionBtn, {
      icon:  roundIcons[roundIdx] || "🔁",
      title: "Runde " + (roundIdx + 1) + " von 2 — " + variant.roundLabel,
      text:  roundDescs[roundIdx],
      hint:  variant.badge ? `<span class="wom-intro-hint-stimmt">Szenario: ${variant.badge}</span>` : null,
    }, advance);
  }

  // ── Phase 1: Input ────────────────────────────────────────────────
  function renderInputPhase(el) {
    const variant = v();
    const info = document.createElement("div");
    info.className = "pf-info";
    info.innerHTML = "<strong>Phase 1 – Input</strong><p>Der Nutzer tippt eine Nachricht ein und schickt sie ab. Das ist der Startpunkt.</p>";
    el.appendChild(info);

    const chat = document.createElement("div");
    chat.className = "pf-chat";

    if (variant.prevMessages) {
      variant.prevMessages.forEach(m => {
        const msg = document.createElement("div");
        msg.className = "pf-chat-msg pf-chat-msg--" + m.role;
        const bubble = document.createElement("div");
        bubble.className = "pf-chat-bubble";
        bubble.textContent = m.text;
        msg.appendChild(bubble);
        chat.appendChild(msg);
      });
    }

    const newMsg = document.createElement("div");
    newMsg.className = "pf-chat-msg pf-chat-msg--user pf-chat-msg--new";
    if (variant.attachment) {
      const att = document.createElement("div");
      att.className = "pf-attachment";
      att.textContent = "📄 " + variant.attachment;
      newMsg.appendChild(att);
    }
    const bubble = document.createElement("div");
    bubble.className = "pf-chat-bubble";
    bubble.textContent = variant.inputText;
    newMsg.appendChild(bubble);
    chat.appendChild(newMsg);
    el.appendChild(chat);
    setBtn("Weiter →", false, advance);
  }

  // ── Phase 2: Tokenisierung ────────────────────────────────────────
  function renderTokenizePhase(el) {
    const variant = v();
    const info = document.createElement("div");
    info.className = "pf-info";
    info.innerHTML = "<strong>Phase 2 – Tokenisierung</strong><p>Dein Text wird in <em>Tokens</em> zerlegt – Textbausteine, die jeweils eine eindeutige <em>ID-Nummer</em> haben. Damit rechnet das Modell.</p>";
    el.appendChild(info);

    const wrap = document.createElement("div");
    wrap.className = "pf-tokenize";
    const sent = document.createElement("div");
    sent.className = "pf-token-sentence";
    sent.textContent = variant.inputText;
    const arrow = document.createElement("div");
    arrow.className = "pf-arrow";
    arrow.textContent = "↓";
    const out = document.createElement("div");
    out.className = "pf-tokens";
    const counter = document.createElement("div");
    counter.className = "pf-token-count";
    counter.innerHTML = '<span id="pf-tok-num">0</span> Tokens';

    const idNote = document.createElement("div");
    idNote.className = "pf-id-note";
    idNote.style.opacity = "0";
    idNote.innerHTML = "🔢 <strong>Token-IDs:</strong> Das sind die Zahlen, die das Modell wirklich liest. Text kennt es nicht.";

    wrap.append(sent, arrow, out, counter, idNote);
    el.appendChild(wrap);

    const colors = ["a","b","c","d","e","f"];
    const chips = [];

    variant.tokens.forEach((tok, i) => {
      setTimeout(() => {
        const chip = document.createElement("span");
        chip.className = "pf-token pf-token--" + colors[i % colors.length];
        chip.textContent = tok;
        out.appendChild(chip);
        chips.push(chip);
        const numEl = document.getElementById("pf-tok-num");
        if (numEl) numEl.textContent = i + 1;

        if (i === variant.tokens.length - 1) {
          // Alle Tokens erschienen — nach kurzer Pause flippen
          setTimeout(() => {
            chips.forEach((c, j) => {
              setTimeout(() => flipChip(c, variant.tokenIds[j]), j * 80);
            });
            // ID-Hinweis einblenden nachdem alle geflippt
            setTimeout(() => {
              idNote.style.transition = "opacity 0.4s ease";
              idNote.style.opacity = "1";
            }, chips.length * 80 + 250);
          }, 700);
        }
      }, 150 + i * 130);
    });
  }

  function flipChip(chip, newContent) {
    chip.style.transition = "transform 0.18s ease";
    chip.style.transform = "rotateY(90deg)";
    setTimeout(() => {
      chip.textContent = newContent;
      chip.className = "pf-token pf-token--id";
      chip.style.transition = "none";
      chip.style.transform = "rotateY(-90deg)";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        chip.style.transition = "transform 0.18s ease";
        chip.style.transform = "rotateY(0deg)";
      }));
    }, 180);
  }

  // ── Phase 3: Kontext-Aufbau ───────────────────────────────────────
  function renderAssemblePhase(el) {
    const variant = v();
    const info = document.createElement("div");
    info.className = "pf-info";
    info.innerHTML = "<strong>Phase 3 – Kontext-Aufbau</strong><p>Deine Tokens sind nicht allein. Vor deiner Frage werden weitere Tokens eingefügt – das Modell liest alles, von vorne.</p>";
    el.appendChild(info);

    const wrap = document.createElement("div");
    wrap.className = "pf-assemble";

    // Token-Stream: context-Sektionen werden VOR den User-Tokens eingefügt
    const stream = document.createElement("div");
    stream.className = "pf-token-stream";

    // Trennlinie zwischen Kontext und User-Tokens (Einfügepunkt für prepend)
    const divider = document.createElement("div");
    divider.className = "pf-stream-divider";

    // User-Tokens (als ID-Chips, immer sichtbar)
    const userSection = document.createElement("div");
    userSection.className = "pf-stream-section pf-stream-section--user";
    variant.tokenIds.forEach(id => {
      const chip = document.createElement("span");
      chip.className = "pf-token pf-token--id";
      chip.textContent = id;
      userSection.appendChild(chip);
    });

    stream.append(divider, userSection);
    const totalLine = document.createElement("div");
    totalLine.className = "pf-total-count";
    totalLine.innerHTML = 'Gesamt: <span id="pf-total-tok">' + variant.tokens.length + '</span> Tokens';
    wrap.append(stream, totalLine);
    el.appendChild(wrap);

    // Kontext-Gruppen erscheinen nacheinander
    let runningTotal = variant.tokens.length;
    variant.extraGroups.forEach(g => {
      setTimeout(() => {
        if (!stream.isConnected) return;
        const section = document.createElement("div");
        section.className = "pf-stream-section pf-stream-section--ctx";
        const numChips = g.numChips ?? Math.min(Math.ceil(g.count / 15), 28);
        for (let j = 0; j < numChips; j++) {
          const chip = document.createElement("span");
          chip.className = "pf-stream-chip pf-stream-chip--" + g.cls;
          section.appendChild(chip);
        }
        if (g.position === "after") {
          stream.appendChild(section); // nach den User-Tokens
        } else {
          stream.insertBefore(section, divider); // vor den User-Tokens
        }
        runningTotal += g.count;
        const totEl = document.getElementById("pf-total-tok");
        if (totEl) totEl.textContent = runningTotal.toLocaleString("de-DE");
      }, g.delay || 500);
    });
  }

  // ── Phase 4: Neuronales Netz ──────────────────────────────────────
  function renderModelPhase(el) {
    const variant = v();
    const info = document.createElement("div");
    info.className = "pf-info";
    info.innerHTML = "<strong>Phase 4 – Neuronales Netz</strong><p>Das Modell liest alle Token-IDs und berechnet für jede mögliche nächste ID eine Wahrscheinlichkeit. So entsteht die Antwort – eine ID nach der anderen.</p>";
    el.appendChild(info);

    const wrap = document.createElement("div");
    wrap.className = "pf-model";
    wrap.innerHTML = `
      <div class="pf-model-flow">
        <div class="pf-model-box pf-model-box--in">
          <div class="pf-model-box-icon">📥</div>
          <div class="pf-model-box-label">Eingabe</div>
          <div class="pf-model-box-count">${variant.totalTokens.toLocaleString("de-DE")} IDs</div>
        </div>
        <div class="pf-model-arr">→</div>
        <div class="pf-model-net" id="pf-net">
          <div class="pf-net-nodes">
            <div class="pf-net-col"><div class="pf-net-node"></div><div class="pf-net-node"></div><div class="pf-net-node"></div></div>
            <div class="pf-net-col pf-net-col--mid"><div class="pf-net-node"></div><div class="pf-net-node"></div></div>
            <div class="pf-net-col"><div class="pf-net-node"></div><div class="pf-net-node"></div><div class="pf-net-node"></div></div>
          </div>
          <div class="pf-net-label">Neuronales Netz</div>
        </div>
        <div class="pf-model-arr">→</div>
        <div class="pf-model-box pf-model-box--out">
          <div class="pf-model-box-icon">📤</div>
          <div class="pf-model-box-label">Ausgabe-IDs</div>
          <div class="pf-model-out-tokens" id="pf-out-tokens"></div>
        </div>
      </div>
      <div class="pf-probs" id="pf-probs">
        <div class="pf-probs-title">Wahrscheinlichste nächste Token-ID:</div>
      </div>
    `;
    el.appendChild(wrap);

    const netEl   = document.getElementById("pf-net");
    const probsEl = document.getElementById("pf-probs");
    const outEl   = document.getElementById("pf-out-tokens");

    let stepI = 0;
    function showStep() {
      if (!document.getElementById("pf-net")) return;
      if (stepI >= variant.probSteps.length) return;
      const step = variant.probSteps[stepI];

      netEl.classList.remove("is-active");
      void netEl.offsetWidth;
      netEl.classList.add("is-active");

      probsEl.querySelectorAll(".pf-prob-row").forEach(r => r.remove());
      step.candidates.forEach(c => {
        const row = document.createElement("div");
        row.className = "pf-prob-row";
        // ID prominent, Text als kleiner Hinweis
        const lbl = document.createElement("span");
        lbl.className = "pf-prob-label";
        lbl.innerHTML = `<span class="pf-prob-id-num">${c.id}</span><span class="pf-prob-id-hint">${c.t}</span>`;
        const barWrap = document.createElement("div");
        barWrap.className = "pf-prob-bar";
        const fill = document.createElement("div");
        fill.className = "pf-prob-fill" + (c.id === step.chosen ? " is-best" : "");
        fill.style.width = "0%";
        barWrap.appendChild(fill);
        const pct = document.createElement("span");
        pct.className = "pf-prob-pct";
        pct.textContent = c.p + " %";
        row.append(lbl, barWrap, pct);
        probsEl.appendChild(row);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = c.p + "%"; }));
      });

      setTimeout(() => {
        if (!document.getElementById("pf-out-tokens")) return;
        const chip = document.createElement("span");
        chip.className = "pf-out-token pf-out-token--new";
        chip.textContent = step.chosen; // ID-Nummer
        outEl.appendChild(chip);
        setTimeout(() => chip.classList.remove("pf-out-token--new"), 400);
        stepI++;
        setTimeout(showStep, 1000);
      }, 1200);
    }

    setTimeout(showStep, 600);
  }

  // ── Phase 5: Filter ───────────────────────────────────────────────
  const BLOCKED_STOP = 3; // Index des Auslöser-Tokens bei blocked-Szenario (0-basiert)

  function renderFilterPhase(el) {
    const variant = v();
    const isBlockedRound = filterBlocked && roundIdx === 0;

    const info = document.createElement("div");
    info.className = "pf-info";
    info.innerHTML = "<strong>Phase 5 – Safety-Filter</strong><p>Bevor der Output angezeigt wird, prüft ein Sicherheitsfilter, ob die Antwort sicher und regelkonform ist.</p>";
    el.appendChild(info);

    const wrap = document.createElement("div");
    wrap.className = "pf-filter";

    if (isBlockedRound) {
      const ctxChat = document.createElement("div");
      ctxChat.className = "pf-chat pf-filter-ctx-chat";
      ctxChat.innerHTML = `<div class="pf-chat-msg pf-chat-msg--user"><div class="pf-chat-bubble">${variant.inputText}</div></div>`;
      wrap.appendChild(ctxChat);
      const ctxLabel = document.createElement("p");
      ctxLabel.className = "pf-filter-ctx-label";
      ctxLabel.textContent = "Modell generiert Antwort … Safety-Filter prüft Token für Token:";
      wrap.appendChild(ctxLabel);
    }

    const tokensEl = document.createElement("div");
    tokensEl.className = "pf-filter-tokens";

    const tokenSource = variant.outputTokenData.slice(0, isBlockedRound ? variant.outputTokenData.length : 8);

    tokenSource.forEach((tok, i) => {
      const chip = document.createElement("div");
      const isBlock = isBlockedRound && i === BLOCKED_STOP;
      chip.className = "pf-filter-chip" + (isBlock ? " pf-filter-chip--trigger" : "");
      chip.style.animationDelay = (i * 80) + "ms";
      chip.textContent = tok.id;
      tokensEl.appendChild(chip);
    });

    if (!isBlockedRound) {
      const dots = document.createElement("div");
      dots.className = "pf-filter-chip pf-filter-chip--dots";
      dots.textContent = "…";
      tokensEl.appendChild(dots);
    }

    const bar = document.createElement("div");
    bar.className = "pf-filter-bar" + (isBlockedRound ? " pf-filter-bar--blocked" : "");
    bar.innerHTML = `<span class="pf-filter-icon">${isBlockedRound ? "🚫" : "🛡️"}</span><span>Safety-Filter</span>`;

    const result = document.createElement("div");
    result.className = "pf-filter-result";

    if (isBlockedRound) {
      result.innerHTML = `<span class="pf-filter-err">✗ Antwort geblockt</span>`;
      const why = document.createElement("p");
      why.className = "pf-filter-why";
      why.textContent = "Das Modell hat eine Schritt-für-Schritt-Anleitung zu einer gefährlichen Handlung generiert. Der Safety-Filter hat diese Token-Sequenz erkannt und die Ausgabe gestoppt.";
      result.appendChild(why);
    } else {
      result.innerHTML = `<span class="pf-filter-ok">✓ Ausgabe freigegeben</span>`;
    }

    wrap.append(tokensEl, bar, result);
    el.appendChild(wrap);

    if (isBlockedRound) {
      setTimeout(() => {
        const chips = tokensEl.querySelectorAll(".pf-filter-chip");
        chips.forEach((chip, i) => {
          setTimeout(() => {
            if (i < BLOCKED_STOP) {
              chip.classList.add("pf-filter-chip--ok");
            } else if (i === BLOCKED_STOP) {
              chip.classList.add("pf-filter-chip--trigger");
            }
          }, i * 200);
        });
      }, 400);
    }
  }

  // ── Phase 6: Output (Token-IDs → flip → Text → Chat) ─────────────
  function renderOutputPhase(el) {
    const variant = v();
    const isBlockedRound = filterBlocked && roundIdx === 0;

    const info = document.createElement("div");
    info.className = "pf-info";
    info.innerHTML = isBlockedRound
      ? "<strong>Phase 6 – Ausgabe</strong><p>Der Safety-Filter hat die Antwort gestoppt. Der Nutzer sieht stattdessen eine sichere Ablehnung.</p>"
      : "<strong>Phase 6 – IDs zurück zu Text</strong><p>Die Ausgabe-IDs werden in Textbausteine zurückübersetzt und zusammengefügt – so entsteht die lesbare Antwort.</p>";
    el.appendChild(info);

    const wrap = document.createElement("div");
    wrap.className = "pf-output";

    if (isBlockedRound) {
      // Blocked: Banner + Chat mit sicherer Ablehnung
      const banner = document.createElement("div");
      banner.className = "pf-output-blocked-banner";
      banner.innerHTML = "<span>🚫</span><span>Antwort geblockt – der Nutzer sieht:</span>";

      const arrowEl = document.createElement("div");
      arrowEl.className = "pf-arrow";
      arrowEl.textContent = "↓";

      const chatEl = document.createElement("div");
      chatEl.className = "pf-chat pf-output-chat";
      chatEl.style.opacity = "0";
      chatEl.style.transition = "opacity 0.5s ease";

      const userMsg = document.createElement("div");
      userMsg.className = "pf-chat-msg pf-chat-msg--user";
      const userBubble = document.createElement("div");
      userBubble.className = "pf-chat-bubble";
      userBubble.textContent = variant.inputText;
      userMsg.appendChild(userBubble);
      chatEl.appendChild(userMsg);

      const botMsg = document.createElement("div");
      botMsg.className = "pf-chat-msg pf-chat-msg--bot";
      const botBubble = document.createElement("div");
      botBubble.className = "pf-chat-bubble";
      botBubble.textContent = "";
      botMsg.appendChild(botBubble);
      chatEl.appendChild(botMsg);

      wrap.append(banner, arrowEl, chatEl);
      el.appendChild(wrap);

      setTimeout(() => {
        chatEl.style.opacity = "1";
        typeText(botBubble, "Das kann ich leider nicht beantworten. Ich helfe dir gerne bei anderen Fragen weiter.");
      }, 800);
      return;
    }

    // Normal: ID-Chips erscheinen zuerst
    const toksEl = document.createElement("div");
    toksEl.className = "pf-output-tokens";

    const arrowEl = document.createElement("div");
    arrowEl.className = "pf-arrow";
    arrowEl.textContent = "↓";

    const chatEl = document.createElement("div");
    chatEl.className = "pf-chat pf-output-chat";
    chatEl.style.opacity = "0";
    chatEl.style.transition = "opacity 0.5s ease";

    if (variant.prevMessages) {
      variant.prevMessages.forEach(m => {
        const msg = document.createElement("div");
        msg.className = "pf-chat-msg pf-chat-msg--" + m.role;
        const bubble = document.createElement("div");
        bubble.className = "pf-chat-bubble";
        bubble.textContent = m.text;
        msg.appendChild(bubble);
        chatEl.appendChild(msg);
      });
    }
    const userMsg = document.createElement("div");
    userMsg.className = "pf-chat-msg pf-chat-msg--user";
    const userBubble = document.createElement("div");
    userBubble.className = "pf-chat-bubble";
    userBubble.textContent = variant.inputText;
    userMsg.appendChild(userBubble);
    chatEl.appendChild(userMsg);

    const botMsg = document.createElement("div");
    botMsg.className = "pf-chat-msg pf-chat-msg--bot";
    const botBubble = document.createElement("div");
    botBubble.className = "pf-chat-bubble";
    botBubble.textContent = "";
    botMsg.appendChild(botBubble);
    chatEl.appendChild(botMsg);

    wrap.append(toksEl, arrowEl, chatEl);
    el.appendChild(wrap);

    const chips = [];
    variant.outputTokenData.forEach((tok, i) => {
      setTimeout(() => {
        const chip = document.createElement("span");
        chip.className = "pf-token pf-token--id";
        chip.textContent = tok.id;
        toksEl.appendChild(chip);
        chips.push({ el: chip, tok });

        if (i === variant.outputTokenData.length - 1) {
          setTimeout(() => {
            chips.forEach(({ el: c, tok: t }, j) => {
              setTimeout(() => flipChip(c, t.t), j * 70);
            });
            const flipDone = chips.length * 70 + 350;
            setTimeout(() => {
              chatEl.style.opacity = "1";
              chatEl.scrollTop = chatEl.scrollHeight;
              typeText(botBubble, variant.outputText);
            }, flipDone);
          }, 600);
        }
      }, i * 110);
    });
  }

  function typeText(el, text) {
    let i = 0;
    const interval = setInterval(() => {
      if (!el.isConnected) { clearInterval(interval); return; }
      el.textContent = text.slice(0, i + 1);
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 18);
  }

  // ── Abschluss-Zusammenfassung ─────────────────────────────────────
  function renderFinalSummary() {
    state.pendingEarned = earned;
    state.pendingMax    = TOTAL_Q;
    state.pendingBonus  = 0;

    bodyEl.innerHTML = "";

    const div = document.createElement("div");
    div.className = "pf-summary";

    const title = document.createElement("div");
    title.className = "pf-summary-title";
    title.textContent = "Was steckt in einem Prompt?";

    const sub = document.createElement("p");
    sub.className = "pf-summary-sub";
    sub.textContent = "Ein Prompt besteht aus mehreren Schichten – die meisten siehst du als Nutzer nie.";

    const stack = document.createElement("div");
    stack.className = "pf-stack";
    const layers = [
      { icon: "🔧", label: "System-Prompt",    sub: "von der App gesetzt, unsichtbar",             cls: "sys"             },
      { icon: "💬", label: "Gesprächsverlauf", sub: "alle bisherigen Nachrichten",                 cls: "hist"            },
      { icon: "📄", label: "Anhänge",          sub: "Bilder, PDFs – Teil der Nutzer-Nachricht",    cls: "file"            },
      { icon: "✏️", label: "Deine Frage",      sub: "dein sichtbarer Input",                       cls: "user", hi: true  },
      { icon: "🔍", label: "Tool-Ergebnisse",  sub: "erscheinen nach der Frage, z. B. Websuche",   cls: "tool"            },
      { icon: "🤖", label: "Modell-Verhalten", sub: "kein Text im Prompt – steckt in den Gewichten", cls: "model", sep: true },
    ];
    layers.forEach((layer, i) => {
      if (layer.sep) {
        const divider = document.createElement("div");
        divider.className = "pf-stack-sep";
        divider.textContent = "Nicht im Prompt-Text:";
        stack.appendChild(divider);
      }
      const item = document.createElement("div");
      item.className = "pf-stack-item pf-stack-item--" + layer.cls +
        (layer.hi ? " is-highlight" : "") + (layer.sep ? " is-outside" : "");
      item.style.animationDelay = (i * 80) + "ms";
      item.innerHTML = `<span class="pf-stack-icon">${layer.icon}</span>
        <div><div class="pf-stack-label">${layer.label}</div>
        <div class="pf-stack-sub">${layer.sub}</div></div>`;
      stack.appendChild(item);
    });

    const note = document.createElement("p");
    note.className = "pf-summary-note";
    note.textContent = "Das Modell liest den Prompt bei jeder Anfrage von oben nach unten. Das Modell-Verhalten steckt in den Trainingsgewichten – es ist kein Text, den das Modell liest.";

    const scoreDiv = document.createElement("div");
    scoreDiv.className = "mc-summary";
    const row = document.createElement("div");
    row.className = "mc-summary-row";
    const sp = document.createElement("span"); sp.textContent = "Richtige Antworten";
    const st = document.createElement("strong"); st.textContent = earned + " / " + TOTAL_Q;
    row.append(sp, st);
    const divider = document.createElement("div");
    divider.className = "mc-summary-divider";
    const totalRow = document.createElement("div");
    totalRow.className = "mc-summary-row mc-summary-total";
    const ts = document.createElement("span"); ts.textContent = "Gesamt";
    const tv = document.createElement("strong"); tv.textContent = earned + " Punkte";
    totalRow.append(ts, tv);
    scoreDiv.append(row, divider, totalRow);

    div.append(title, sub, stack, note, scoreDiv);
    bodyEl.appendChild(div);

    setBtn("Station abschließen", false, finishQuiz);
  }

  // Start
  renderStep();
}

// =====================================================================
// Map: Stationen + Overlays für progressive Aufdeckung
// =====================================================================
function initMap() {
  const stationsEl = document.getElementById("map-stations");
  const overlaysEl = document.getElementById("map-overlays");
  stationsEl.innerHTML = "";
  overlaysEl.innerHTML = "";
  document.getElementById("station-indicators").innerHTML = "";
  state.completed.clear();
  updateScoreDisplay();

  // 7 Checkmark-Indikatoren im Header aufbauen
  STATIONS.forEach(s => {
    const dot = document.createElement("span");
    dot.className = "station-indicator";
    dot.id = `station-indicator-${s.id}`;
    dot.textContent = s.id;
    document.getElementById("station-indicators").appendChild(dot);
  });

  // 7 custom Zonen, jede zeigt den passenden Ausschnitt des leichten Posters
  ZONES.forEach((z, i) => {
    const o = document.createElement("div");
    o.className = "map-overlay";
    o.dataset.station = i + 1;
    o.style.left   = z.left   + "%";
    o.style.top    = z.top    + "%";
    o.style.width  = z.width  + "%";
    o.style.height = z.height + "%";
    const bsX = 10000 / z.width;
    const bsY = 10000 / z.height;
    const bpX = z.width  >= 100 ? 0 : z.left / (100 - z.width)  * 100;
    const bpY = z.height >= 100 ? 0 : z.top  / (100 - z.height) * 100;
    o.style.backgroundSize     = `${bsX}% ${bsY}%`;
    o.style.backgroundPosition = `${bpX}% ${bpY}%`;
    overlaysEl.appendChild(o);
  });

  // Stationen platzieren
  STATIONS.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "station";
    btn.style.left = s.x + "%";
    btn.style.top  = s.y + "%";
    btn.dataset.station = s.id;
    btn.title = s.title;
    btn.innerHTML = `<span>${s.id}</span>`;
    btn.addEventListener("click", () => openQuiz(s));
    stationsEl.appendChild(btn);
  });
}

function openQuiz(station) {
  if (state.completed.has(station.id)) return;
  state.activeStation = station;
  document.getElementById("quiz-station-num").textContent = station.id;
  document.getElementById("quiz-station-title").textContent = station.title;

  const bodyEl    = document.getElementById("quiz-body");
  const actionBtn = document.getElementById("btn-quiz-finish");
  bodyEl.innerHTML = "";

  const quiz = QUIZZES[station.id];
  actionBtn.removeAttribute("data-action");

  if (quiz) {
    if (quiz.type === "kartenSort") {
      document.querySelector(".quiz-card").classList.add("quiz-card--wide");
      renderKartenSort(bodyEl, actionBtn, quiz);
    } else if (quiz.type === "werbinich") {
      document.querySelector(".quiz-card").classList.add("quiz-card--wide");
      renderWerBinIch(bodyEl, actionBtn);
    } else if (quiz.type === "promptflow") {
      document.querySelector(".quiz-card").classList.add("quiz-card--wide");
      renderPromptFlow(bodyEl, actionBtn);
    } else if (quiz.type === "begriffe") {
      document.querySelector(".quiz-card").classList.add("quiz-card--wide");
      renderBegriffe(bodyEl, actionBtn);
    } else if (quiz.type === "wahrodermythos") {
      renderWahrOderMythos(bodyEl, actionBtn, quiz);
    } else if (quiz.type === "multiplechoice") {
      renderMultiplechoice(bodyEl, actionBtn, quiz);
    } else {
      renderStationOpener(bodyEl, actionBtn, {
        icon:  "🧩",
        title: "Fülle die Lücken",
        text:  "Lies den Text und ziehe die richtigen Begriffe aus der Wortbank in die Lücken.",
      }, () => {
        actionBtn.textContent = "Prüfen";
        actionBtn.disabled    = true;
        let phase = "check";

        const checkFn = renderQuiz(quiz, bodyEl, {
          onAllFilled:  () => { actionBtn.disabled = false; },
          onIncomplete: () => { actionBtn.disabled = true; },
        });

        actionBtn.onclick = e => {
          e.stopPropagation();
          if (phase === "check") {
            const earned = checkFn();
            state.pendingEarned = earned;
            state.pendingMax    = quiz.blanks?.length ?? 1;
            phase = "finish";
            actionBtn.textContent = "Weiter →";
            actionBtn.disabled    = false;
          } else {
            finishQuiz();
          }
        };
      });
    }
  } else {
    bodyEl.innerHTML = '<p class="dim">Quiz für diese Station kommt bald.</p>';
    actionBtn.textContent = "Quiz beenden";
    actionBtn.disabled    = false;
    actionBtn.onclick = e => {
      e.stopPropagation();
      state.pendingEarned = 1;
      state.pendingMax    = 1;
      finishQuiz();
    };
  }

  document.getElementById("quiz-overlay").classList.add("is-active");
}

function closeQuiz() {
  document.getElementById("quiz-overlay").classList.remove("is-active");
  document.querySelector(".quiz-card").classList.remove("quiz-card--wide");
  document.querySelector(".quiz-badge .beg-phase-tag")?.remove();
  const actionBtn = document.getElementById("btn-quiz-finish");
  actionBtn.setAttribute("data-action", "quiz-finish");
  actionBtn.onclick = null;
  state.activeStation  = null;
  state.pendingEarned  = 0;
  state.pendingMax     = 0;
  state.pendingBonus   = 0;
}

function finishQuiz() {
  const s = state.activeStation;
  if (!s) return;
  state.completed.add(s.id);
  document.querySelector(`.station[data-station="${s.id}"]`)?.classList.add("is-done");
  document.querySelector(`.map-overlay[data-station="${s.id}"]`)?.classList.add("is-revealed");
  const dot = document.getElementById(`station-indicator-${s.id}`);
  if (dot) { dot.textContent = "✓"; dot.classList.add("is-done"); }

  // Punkte für diese Station in LS und Session buchen
  state.sessionPoints    += state.pendingEarned;
  state.sessionMaxPoints += state.pendingMax;
  state.sessionBonus     += state.pendingBonus;
  const total = loadTotalScore();
  total.earned += state.pendingEarned;
  total.max    += state.pendingMax;
  total.bonus  += state.pendingBonus;
  saveTotalScore(total.earned, total.max, total.bonus);
  state.pendingEarned = 0;
  state.pendingMax    = 0;
  state.pendingBonus  = 0;

  closeQuiz();
  updateScoreDisplay();
  if (state.completed.size === 7) {
    const p2btn = document.getElementById("btn-to-puzzle2");
    p2btn.style.display = "";
    p2btn.classList.add("is-unlocked");
  }
  if (state.completed.size === 4 && !state.milestoneShown && !localStorage.getItem("llmquiz_milestone")) {
    showMilestoneModal();
  }
  saveProgress();
  updateCompanion();
}

function showMilestoneModal() {
  state.milestoneShown = true;
  localStorage.setItem("llmquiz_milestone", "1");

  const t = loadTotalScore();
  const total = t.earned + t.bonus;
  const pct = t.max > 0 ? (total / t.max) * 100 : 0;

  let icon, msg;
  if (pct >= 90) {
    icon = "🚀";
    msg  = "Das läuft bei dir — mach weiter so!";
  } else if (pct >= 30) {
    icon = "💪";
    msg  = "Du bist gut dabei — starte in der 2. Hälfte voll durch!";
  } else {
    icon = "😴";
    msg  = "Nur nicht einschlafen — du kannst noch richtig viel rausholen!";
  }

  document.getElementById("milestone-icon").textContent  = icon;
  document.getElementById("milestone-score").textContent = total + "/" + t.max;
  document.getElementById("milestone-msg").textContent   = msg;

  const overlay = document.getElementById("milestone-overlay");
  overlay.classList.add("is-active");
  overlay.removeAttribute("aria-hidden");

  // Hub Phase 1: Kreatur schlüpft beim ersten Abschnitt
  // Normierung gegen t0.max (variabler Wert je nach Stationen), nicht gegen 90
  const t0    = loadTotalScore();
  const raw0  = t0.earned + t0.bonus;
  const max0  = t0.max > 0 ? t0.max : 1;
  const norm0 = Math.round(Math.min(raw0, max0) / max0 * 10);
  if (!gd.creature) {
    const sd = loadShopData();
    gd.creature = eggType
      ? determineEggCreature(eggType, norm0)
      : (sd.glucksklee
          ? determineCreatureWithGlucksklee(norm0, gameId)
          : determineCreature(norm0, true, gameId));
    if (sd.glucksklee) { sd.glucksklee = false; saveShopData(sd); }
    const growthBefore = gd.growth;
    const coinsBefore  = gd.coins;
    computeRoundResult(gd, norm0, 10, sd);
    gd.growth = growthBefore;
    gd.coins  = coinsBefore;
    if (sd.wachstumsBooster) { sd.wachstumsBooster = false; saveShopData(sd); }
    if (sd.coinsx3)           { sd.coinsx3 = false;          saveShopData(sd); }
    saveGameData(gameId, gd);
  }
  // Kreatur im Milestone-Modal anzeigen
  const hubArea = document.getElementById('milestone-hub');
  if (hubArea && gd.creature) {
    hubArea.style.display = '';
    const stage    = getGrowthStage(gd.growth);
    const creatEl  = document.getElementById('milestone-creature');
    if (creatEl) creatEl.innerHTML = getCreatureHTML(gd.creature, stage);
    const stageName = ['Ei','Stufe 1','Stufe 2','Stufe 3','Stufe 4','Stufe 5'][stage] ?? '';
    const lbl = document.getElementById('milestone-creature-label');
    if (lbl) lbl.textContent = (CREATURE_NAMES?.[gd.creature] ?? '') + ' – ' + stageName;
  }
  updateCompanion();
}

function updateProgress() {} // Stationen werden über station-indicators angezeigt

// =====================================================================
// Station 4 — "Wer bin ich?" Render-Funktion
// =====================================================================
function renderWerBinIch(bodyEl, actionBtn) {
  const pool      = shuffleArr([...WBI_LLMS]);
  const roundLLMs = [pool[0], pool[1]];

  let roundIdx = 0;
  let hintIdx  = 0;
  let hint1Key = null;
  let topId         = null;        // id des Kandidaten in der Tipp-Zone
  let eliminated    = new Set();   // ids der ausgeschlossenen Kandidaten
  let lastTopHintIdx = null;       // hintIdx als der richtige zuletzt nach oben kam
  let totalEarned   = 0;           // akkumulierte Punkte über beide Runden
  let roundScores   = [];          // Punkte pro Runde [runde1, runde2]

  function startRound() {
    hintIdx        = 0;
    topId          = null;
    eliminated     = new Set();
    lastTopHintIdx = null;
    const llm      = roundLLMs[roundIdx];
    hint1Key       = llm.hint1Keys[Math.floor(Math.random() * llm.hint1Keys.length)];
    render();
  }

  function calcRoundScore() {
    const correctId = roundLLMs[roundIdx].id;
    if (topId === correctId && lastTopHintIdx !== null) return 4 - lastTopHintIdx;
    if (eliminated.has(correctId)) return -1;
    return 0;
  }

  function getHints(llm) {
    return [WBI_HINT1[hint1Key], ...llm.hints];
  }

  // ── Hilfsfunktion: Hinweis-Spalte bauen ──────────────────────────
  function buildHintCol(llm, revealAll) {
    const col = document.createElement("div");
    col.className = "wbi-col-hints";

    const badge = document.createElement("div");
    badge.className   = "wbi-round-badge";
    badge.textContent = `Runde ${roundIdx + 1} von 2`;
    col.appendChild(badge);

    const hintsEl = document.createElement("div");
    hintsEl.className = "wbi-hints";
    const hints = getHints(llm);
    const until = revealAll ? hints.length - 1 : hintIdx;
    for (let i = 0; i <= until; i++) {
      const card  = document.createElement("div");
      card.className = "wbi-hint" + (!revealAll && i === hintIdx ? " wbi-hint--new" : "");
      const label = document.createElement("span");
      label.className   = "wbi-hint-label";
      label.textContent = `Hinweis ${i + 1}`;
      const text  = document.createElement("span");
      text.className   = "wbi-hint-text";
      text.textContent = hints[i];
      card.append(label, text);
      hintsEl.appendChild(card);
    }
    col.appendChild(hintsEl);

    if (!revealAll) {
      const counter = document.createElement("div");
      counter.className   = "wbi-hint-counter";
      counter.textContent = `Hinweis ${hintIdx + 1} von 4`;
      col.appendChild(counter);
    }
    return col;
  }

  // ── Haupt-Render ──────────────────────────────────────────────────
  function render() {
    bodyEl.innerHTML  = "";
    actionBtn.onclick = null;
    const llm = roundLLMs[roundIdx];

    const layout = document.createElement("div");
    layout.className = "wbi-layout";
    layout.appendChild(buildHintCol(llm, false));

    const rightCol = document.createElement("div");
    rightCol.className = "wbi-col-board";
    rightCol.appendChild(buildBoard());
    layout.appendChild(rightCol);

    bodyEl.appendChild(layout);

    if (hintIdx < 3) {
      actionBtn.textContent = "Nächster Hinweis →";
      actionBtn.disabled    = false;
      actionBtn.onclick     = e => { e.stopPropagation(); hintIdx++; render(); };
    } else {
      actionBtn.textContent = "Auflösen";
      actionBtn.disabled    = false;
      actionBtn.onclick     = e => { e.stopPropagation(); showResult(); };
    }
  }

  // ── Ergebnis-Ansicht ──────────────────────────────────────────────
  function showResult() {
    bodyEl.innerHTML  = "";
    actionBtn.onclick = null;
    const llm     = roundLLMs[roundIdx];
    const correct = topId === llm.id;

    // Punkte berechnen, speichern und akkumulieren
    const roundScore = calcRoundScore();
    roundScores.push(roundScore);
    totalEarned += roundScore;

    const layout = document.createElement("div");
    layout.className = "wbi-layout";
    layout.appendChild(buildHintCol(llm, true));

    const rightCol = document.createElement("div");
    rightCol.className = "wbi-col-board";

    const scoreStr = roundScore > 0 ? `+${roundScore} Punkt${roundScore > 1 ? "e" : ""}` :
                     roundScore < 0 ? `${roundScore} Punkt` : "0 Punkte";

    const result = document.createElement("div");
    result.className = correct ? "wbi-result wbi-result--correct" : "wbi-result wbi-result--revealed";
    if (correct) {
      result.innerHTML = `<strong>Richtig! ${scoreStr}</strong><br>Es war ${llm.name} 🎉`;
    } else if (eliminated.has(llm.id)) {
      result.innerHTML = `<strong>Ausgeschlossen! ${scoreStr}</strong><br>Du hattest ${llm.name} abgelehnt.`;
    } else if (topId) {
      const guessed = WBI_LLMS.find(l => l.id === topId);
      result.innerHTML = `<strong>Leider falsch · ${scoreStr}</strong><br>Dein Tipp: ${guessed?.name} · Richtig: <strong>${llm.name}</strong>`;
    } else {
      result.innerHTML = `<strong>Kein Tipp · ${scoreStr}</strong><br>Die Antwort war: <strong>${llm.name}</strong>`;
    }
    rightCol.appendChild(result);
    layout.appendChild(rightCol);
    bodyEl.appendChild(layout);

    if (roundIdx < 1) {
      actionBtn.textContent = "Nächste Runde →";
      actionBtn.disabled    = false;
      actionBtn.onclick     = e => { e.stopPropagation(); roundIdx++; startRound(); };
    } else {
      actionBtn.textContent = "Zur Auswertung →";
      actionBtn.disabled    = false;
      actionBtn.onclick     = e => { e.stopPropagation(); showSummary(); };
    }
  }

  // ── Auswertung mit Animation ───────────────────────────────────────
  function showSummary() {
    bodyEl.innerHTML  = "";
    actionBtn.disabled    = true;
    actionBtn.onclick     = null;
    actionBtn.textContent = "Station abschließen";

    const wrapper = document.createElement("div");
    wrapper.className = "wbi-summary";

    const badge = document.createElement("div");
    badge.className   = "wbi-round-badge";
    badge.textContent = "Auswertung";
    wrapper.appendChild(badge);

    // Zwei Karten nebeneinander
    const cardsEl = document.createElement("div");
    cardsEl.className = "wbi-summary-cards";
    const scoreEls = [];

    roundScores.forEach((score, i) => {
      const llm  = roundLLMs[i];
      const card = document.createElement("div");
      card.className = "wbi-summary-card";
      card.style.animationDelay = (i * 0.12) + "s";

      // Runden-Label
      const roundLbl = document.createElement("div");
      roundLbl.className   = "wbi-summary-card-round";
      roundLbl.textContent = `Runde ${i + 1}`;
      card.appendChild(roundLbl);

      // Logo
      const img = document.createElement("img");
      img.className = "wbi-summary-logo";
      img.src       = llm.logo;
      img.alt       = llm.name;
      img.onerror   = () => { img.style.display = "none"; };
      card.appendChild(img);

      // Name
      const nameEl = document.createElement("div");
      nameEl.className   = "wbi-summary-llm-name";
      nameEl.textContent = llm.name;
      card.appendChild(nameEl);

      // Fakten
      const factsList = document.createElement("ul");
      factsList.className = "wbi-summary-facts";
      llm.facts.forEach(f => {
        const li = document.createElement("li");
        li.textContent = f;
        factsList.appendChild(li);
      });
      card.appendChild(factsList);

      // Score
      const scoreEl = document.createElement("div");
      scoreEl.className = "wbi-summary-card-score " +
        (score > 0 ? "wbi-score--pos" : score < 0 ? "wbi-score--neg" : "wbi-score--zero");
      scoreEl.textContent = score > 0 ? `+${score} Pt.` : score < 0 ? `${score} Pt.` : "0 Pt.";
      scoreEls.push(scoreEl);
      card.appendChild(scoreEl);

      cardsEl.appendChild(card);
    });
    wrapper.appendChild(cardsEl);

    // Trennlinie + Gesamt
    const divider = document.createElement("div");
    divider.className = "wbi-summary-divider";
    wrapper.appendChild(divider);

    const totalEl  = document.createElement("div");
    totalEl.className = "wbi-summary-total";
    const totalLbl = document.createElement("div");
    totalLbl.className   = "wbi-summary-total-label";
    totalLbl.textContent = "Gesamt";
    const totalNum = document.createElement("div");
    totalNum.className   = "wbi-summary-total-num";
    totalNum.textContent = "0";
    const maxLbl   = document.createElement("div");
    maxLbl.className   = "wbi-summary-max";
    maxLbl.textContent = "von 8 möglichen Punkten";
    totalEl.append(totalLbl, totalNum, maxLbl);
    wrapper.appendChild(totalEl);

    bodyEl.appendChild(wrapper);

    const target = Math.max(0, totalEarned);

    // Phase 1: Score-Zahlen in den Karten pulsieren
    setTimeout(() => {
      scoreEls.forEach((el, i) =>
        setTimeout(() => el.classList.add("is-pulsing"), i * 200)
      );
    }, 500);

    // Phase 2: Gesamtzähler läuft hoch
    setTimeout(() => {
      const duration  = 900;
      const startTime = performance.now();
      function tick(now) {
        const p     = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        totalNum.textContent = Math.round(eased * target);
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          totalNum.textContent = target;
          totalNum.classList.add("is-done");
          actionBtn.disabled = false;
          actionBtn.onclick  = e => {
            e.stopPropagation();
            state.pendingEarned = target;
            state.pendingMax    = 8;
            finishQuiz();
          };
        }
      }
      requestAnimationFrame(tick);
    }, 950);
  }

  // ── Kandidaten-Board (alle 3 Zonen immer sichtbar) ───────────────
  function buildBoard() {
    const board = document.createElement("div");
    board.className = "wbi-board";

    // Tipp-Zone (oben)
    const topZone  = document.createElement("div");
    topZone.className = "wbi-zone wbi-zone--top";
    const topLabel = document.createElement("div");
    topLabel.className   = "wbi-zone-label";
    topLabel.textContent = "↑  Mein Tipp";
    topZone.appendChild(topLabel);
    const topSlot = document.createElement("div");
    topSlot.className = "wbi-top-slot";
    if (topId) {
      topSlot.appendChild(makeCard(topId, "top"));
    } else {
      const ph = document.createElement("div");
      ph.className   = "wbi-top-placeholder";
      ph.textContent = "Nach oben ziehen";
      topSlot.appendChild(ph);
    }
    topZone.appendChild(topSlot);
    board.appendChild(topZone);

    // Kandidaten-Zone (Mitte)
    const midZone = document.createElement("div");
    midZone.className = "wbi-zone wbi-zone--mid";
    const midLabel = document.createElement("div");
    midLabel.className   = "wbi-zone-label";
    midLabel.textContent = "Kandidaten";
    midZone.appendChild(midLabel);
    const midRow  = document.createElement("div");
    midRow.className = "wbi-candidate-row";
    WBI_LLMS
      .filter(l => l.id !== topId && !eliminated.has(l.id))
      .forEach(l => midRow.appendChild(makeCard(l.id, "mid")));
    midZone.appendChild(midRow);
    board.appendChild(midZone);

    // Ausgeschlossen-Zone (unten, immer sichtbar)
    const elimZone  = document.createElement("div");
    elimZone.className = "wbi-zone wbi-zone--elim";
    const elimLabel = document.createElement("div");
    elimLabel.className   = "wbi-zone-label wbi-zone-label--elim";
    elimLabel.textContent = "↓  Ausgeschlossen";
    elimZone.appendChild(elimLabel);
    const elimRow = document.createElement("div");
    elimRow.className = "wbi-candidate-row";
    if (eliminated.size > 0) {
      [...eliminated].forEach(id => elimRow.appendChild(makeCard(id, "elim")));
    } else {
      const ph = document.createElement("div");
      ph.className   = "wbi-elim-placeholder";
      ph.textContent = "Nach unten ziehen";
      elimRow.appendChild(ph);
    }
    elimZone.appendChild(elimRow);
    board.appendChild(elimZone);

    return board;
  }

  // ── Karte erstellen + Drag anhängen ───────────────────────────────
  function makeCard(id, zone) {
    const llm  = WBI_LLMS.find(l => l.id === id);
    const card = document.createElement("div");
    card.className  = "wbi-card" +
      (zone === "top"  ? " wbi-card--top"  : "") +
      (zone === "elim" ? " wbi-card--elim" : "");
    card.dataset.id = id;

    const img = document.createElement("img");
    img.className = "wbi-card-logo";
    img.src       = llm.logo;
    img.alt       = llm.name;
    img.draggable = false;
    img.onerror   = () => { img.style.display = "none"; fallback.style.display = "flex"; };

    const fallback = document.createElement("div");
    fallback.className   = "wbi-card-fallback";
    fallback.style.display = "none";
    fallback.textContent = llm.name[0];

    const name = document.createElement("span");
    name.className   = "wbi-card-name";
    name.textContent = llm.name;

    card.append(img, fallback, name);
    attachWbiDrag(card, id);
    return card;
  }

  // ── Drag-Logik (Pointer Events) ───────────────────────────────────
  function attachWbiDrag(card, id) {
    let drag = null;

    card.addEventListener("pointerdown", e => {
      e.preventDefault();
      card.setPointerCapture(e.pointerId);
      const rect  = card.getBoundingClientRect();
      const ghost = card.cloneNode(true);
      ghost.classList.add("wbi-card--ghost-floating");
      ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
        `width:${rect.width}px;height:${rect.height}px;margin:0;` +
        `pointer-events:none;z-index:2000;`;
      document.body.appendChild(ghost);
      card.classList.add("wbi-card--dragging-src");
      drag = { ghost, sy: e.clientY, oy: rect.top, ox: rect.left, sx: e.clientX };
    });

    card.addEventListener("pointermove", e => {
      if (!drag) return;
      drag.ghost.style.top  = (drag.oy + e.clientY - drag.sy) + "px";
      drag.ghost.style.left = (drag.ox + e.clientX - drag.sx) + "px";
    });

    const endDrag = e => {
      if (!drag) return;
      drag.ghost.remove();
      card.classList.remove("wbi-card--dragging-src");
      const dy = e.clientY - drag.sy;
      drag = null;

      const correctId = roundLLMs[roundIdx].id;
      if (dy < -50) {
        // Nach oben → Tipp
        if (topId !== null && topId !== id && topId === correctId) {
          lastTopHintIdx = null; // richtiger wurde verdrängt
        }
        topId = id;
        eliminated.delete(id);
        if (id === correctId) lastTopHintIdx = hintIdx;
        render();
      } else if (dy > 50) {
        // Nach unten → Ausgeschlossen
        if (topId === id) {
          topId = null;
          if (id === correctId) lastTopHintIdx = null;
        }
        eliminated.add(id);
        render();
      }
      // Kleine Bewegung → keine Änderung
    };

    card.addEventListener("pointerup",     endDrag);
    card.addEventListener("pointercancel", endDrag);
  }

  renderStationOpener(bodyEl, actionBtn, {
    icon:  "🕵️",
    title: "Wer bin ich?",
    text:  "Du bekommst Hinweise über ein bekanntes KI-Modell — eines nach dem anderen.<br><strong>Rate so früh wie möglich!</strong>",
    hint:  '<span class="wom-intro-hint-stimmt">Früh raten = mehr Punkte</span><span class="wom-intro-hint-mythos">2 Runden</span>',
  }, startRound);
}

function updateScoreDisplay() {
  const t = loadTotalScore();
  document.getElementById("score-display").textContent = (t.earned + t.bonus) + "/" + t.max;
}

function updateCompanion() {
  if (!gd) return;
  let crack;
  if (gd.creature) {
    crack = 4;
  } else {
    crack = Math.min(3, state.completed.size);
  }
  let liveGrowth = null;
  if (gd.creature) {
    const sd  = loadShopData();
    const t   = loadTotalScore();
    let contrib = computeSessionGrowth(t.earned + t.bonus, 90);
    if (sd.wachstumsBooster) contrib *= 2;
    liveGrowth = Math.min(gd.growth + contrib, 21);
  }
  updateGameEggDisplay(gd, crack, false, liveGrowth);
  const sd   = loadShopData();
  const icon = sd.wachstumsBooster ? '⚡' : sd.coinsx3 ? '🎰' : sd.glucksklee ? '🍀' : null;
  const el   = document.getElementById('companion-item-icon');
  if (el) { el.textContent = icon ?? ''; el.classList.toggle('active', !!icon); }
}

function resetAndGoHub() {
  clearProgress();
  window.location.href = '../index.html';
}

function resetGame() {
  clearProgress();
  localStorage.removeItem('llmquiz_milestone');
  p2Active = false;
  state.completed.clear();
  state.milestoneShown   = false;
  state.sessionPoints    = 0;
  state.sessionMaxPoints = 0;
  state.sessionBonus     = 0;
  state.pendingEarned    = 0;
  state.pendingMax       = 0;
  state.pendingBonus     = 0;
  state.startTime        = null;
  const p2btn = document.getElementById('btn-to-puzzle2');
  p2btn.style.display = 'none';
  p2btn.classList.remove('is-unlocked');
  gd = getGameData(gameId);
  updateCompanion();
  show('screen-intro');
}

// =====================================================================
// End-Screen
// =====================================================================
function showEnd() {
  const total = loadTotalScore();
  clearProgress();
  const seconds = Math.round((Date.now() - state.startTime) / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  document.getElementById("end-time").textContent   = mm + ":" + ss;
  document.getElementById("end-total").textContent  = (total.earned + total.bonus) + "/" + total.max;

  // Hub Phase 2: Wachstum + Coins
  let coinsGained = 0;
  if (gd) {
    const raw = total.earned + total.bonus;
    const sd  = loadShopData();
    if (gd.creature) {
      coinsGained = computeRoundResult(gd, raw, 90, sd);
      if (sd.wachstumsBooster) { sd.wachstumsBooster = false; saveShopData(sd); }
      if (sd.coinsx3)           { sd.coinsx3 = false;          saveShopData(sd); }
    }
    const norm = Math.round(Math.min(raw, 90) / 90 * 10);
    gd.points       += norm;
    gd.roundsPlayed += 1;
    saveGameData(gameId, gd);

    const stage     = getGrowthStage(gd.growth);
    const creatEl   = document.getElementById('win-creature');
    if (creatEl) creatEl.innerHTML = gd.creature ? getCreatureHTML(gd.creature, stage) : '';
    const stageName = ['Ei','Stufe 1','Stufe 2','Stufe 3','Stufe 4','Stufe 5'][stage] ?? '';
    const lbl = document.getElementById('win-creature-label');
    if (lbl && gd.creature) lbl.textContent = (CREATURE_NAMES?.[gd.creature] ?? '') + ' – ' + stageName;
    renderCoinBank('win-coins', coinsGained);
    renderResultItemButton('win-item-btn-wrap', gameId, () => { resetGame(); });
    updateCompanion();
  }

  show("screen-end");
}

// =====================================================================
// Globale Event-Verdrahtung
// =====================================================================
document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  switch (action) {
    case "start-puzzle1":
      state.startTime = Date.now();
      show("screen-puzzle1");
      saveProgress();
      initPuzzle(
        document.querySelector('.slide-board[data-puzzle="leicht"]'),
        ASSETS.leicht,
        PUZZLES.leicht,
        (moves) => {
          const pts = puzzleScore(moves);
          state.sessionPoints    += pts;
          state.sessionMaxPoints += 10;
          const total = loadTotalScore();
          total.earned += pts;
          total.max    += 10;
          saveTotalScore(total.earned, total.max, total.bonus);
          initMap();
          show("screen-map");
          saveProgress();
          updateCompanion();
        }
      );
      break;
    case "quiz-cancel":
      closeQuiz();
      break;
    case "quiz-finish":
      finishQuiz();
      break;
    case "milestone-continue": {
      const mo = document.getElementById("milestone-overlay");
      mo.classList.remove("is-active");
      mo.setAttribute("aria-hidden", "true");
      break;
    }
    case "restart":
      resetGame();
      break;
  }
});

document.getElementById("btn-to-puzzle2").addEventListener("click", () => {
  show("screen-puzzle2");
  saveProgress();

  const boardEl  = document.querySelector('.slide-board[data-puzzle="komplex"]');
  const hudEl    = document.getElementById("p2-hud");
  const scoreEl  = document.getElementById("p2-score");
  const bonusEl  = document.getElementById("p2-bonus");
  const timerEl  = document.getElementById("p2-timer");
  const cheatBtn = document.getElementById("p2-cheat");

  const BONUS_START = 20;
  const DECAY_SEC   = 30; // alle 30 Sek. -1 Bonuspunkt
  const CHEAT_COST  = 5;
  const TIMER_MAX   = 600; // 10 Minuten in Sekunden

  let puzzle2Start  = null;
  let timerInterval = null;
  const cheatRef    = { active: false, first: null, onDone: null };

  function calcBonus() {
    const tot = loadTotalScore();
    const sec = puzzle2Start ? Math.floor((Date.now() - puzzle2Start) / 1000) : 0;
    const raw = BONUS_START - Math.floor(sec / DECAY_SEC);
    return Math.max(-(tot.earned + tot.bonus), raw);
  }

  function totalLive() {
    const tot = loadTotalScore();
    return tot.earned + tot.bonus + calcBonus();
  }

  function endPuzzle2() {
    if (!p2Active) return;
    p2Active = false;
    clearInterval(timerInterval);
    hudEl.style.display = "none";
    const tot   = loadTotalScore();
    const final = calcBonus();
    tot.bonus += final;
    tot.max   += BONUS_START;
    saveTotalScore(tot.earned, tot.max, tot.bonus);
    showEnd();
  }

  function updateHUD() {
    const tot       = loadTotalScore();
    const bonus     = calcBonus();
    const elapsed   = puzzle2Start ? Math.floor((Date.now() - puzzle2Start) / 1000) : 0;
    const remaining = Math.max(0, TIMER_MAX - elapsed);
    const mm        = Math.floor(remaining / 60);
    const ss        = String(remaining % 60).padStart(2, "0");

    scoreEl.textContent = tot.earned + tot.bonus;
    bonusEl.textContent = (bonus >= 0 ? "+" : "") + bonus;
    bonusEl.style.color = bonus < 0 ? "#ff7043" : "";
    timerEl.textContent = mm + ":" + ss;

    cheatBtn.disabled = cheatRef.active || totalLive() < CHEAT_COST;

    if (remaining === 0) {
      endPuzzle2();
    }
  }

  function startPuzzle() {
    if (p2Active) return;
    p2Active = true;
    puzzle2Start = Date.now();
    hudEl.style.display = "";
    updateHUD();

    timerInterval = setInterval(updateHUD, 1000);

    cheatRef.onDone = () => {
      const tot = loadTotalScore();
      tot.earned = Math.max(0, tot.earned - CHEAT_COST);
      saveTotalScore(tot.earned, tot.max, tot.bonus);
      state.sessionPoints = Math.max(0, state.sessionPoints - CHEAT_COST);
      cheatBtn.classList.remove("is-active");
      updateHUD();
    };

    cheatBtn.onclick = () => {
      if (cheatRef.active) {
        cheatRef.active = false;
        cheatRef.first  = null;
        cheatBtn.classList.remove("is-active");
        updateHUD();
      } else if (totalLive() >= CHEAT_COST) {
        cheatRef.active = true;
        cheatRef.first  = null;
        cheatBtn.classList.add("is-active");
      }
    };

    initPuzzle(boardEl, ASSETS.komplex, PUZZLES.komplex, () => {
      endPuzzle2();
    }, { cheatRef });
  }

  // Opener-Modal in der Board-Area anzeigen
  const intro = document.createElement("div");
  intro.className = "wom-intro p2-opener-intro";
  intro.innerHTML = `
    <div class="wom-intro-icon">🧩</div>
    <div class="wom-intro-title">Das große Bild</div>
    <p class="wom-intro-text">
      Setz das Endpuzzle zusammen — du hast <strong>10 Minuten</strong>!<br>
      Du startest mit +${BONUS_START} Bonuspunkten auf deinen Gesamtscore.
    </p>
    <div class="wom-intro-hint">
      <span class="wom-intro-hint-stimmt">⏱ Alle 30 Sek. −1 Bonuspunkt</span>
      <span class="wom-intro-hint-mythos">🔄 Tausch-Item: −${CHEAT_COST} Punkte</span>
    </div>
    <button class="p2-start-btn">Los geht's</button>
    <button class="btn-secondary p2-back-opener" onclick="resetAndGoHub()">← Zurück zum Hub</button>
  `;
  boardEl.innerHTML = "";
  boardEl.style.display = "flex";
  boardEl.style.alignItems = "center";
  boardEl.style.justifyContent = "center";
  boardEl.appendChild(intro);
  boardEl.querySelector(".p2-start-btn").addEventListener("click", () => {
    boardEl.style.display = "";
    startPuzzle();
  });
});


restoreProgress();

// Hub-Initialisierung
gd = getGameData(gameId);
updateGameEggDisplay(gd, 0);
updateCompanion();
