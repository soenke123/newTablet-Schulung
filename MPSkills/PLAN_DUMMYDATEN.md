# Plan: Dummy-Daten für YourSozialNet (Entwurf 04.11.2026)

> **Stand nach Rückmeldung 04.11.2026** – gilt vor allem Folgenden:
> - **70 User**, Liste in `MPSkills/tools/SocialHub/dummy/LISTE.md` (dort gelten Namen, Zahlen, Bilder).
> - Kein Account, der nur Minderjährigen folgt. **Kein „Hitler“** – stattdessen Trolle, die Leute zu
>   „Echsenmenschen von der Rückseite des Mondes“ erklären (auch Streit mit dem Flacherdler; harmlose Falle: Bartagame bei katzenkram).
> - **Passwort per INSERT/UPDATE bleibt Klartext** (Migration 0271), gehasht nur beim Registrieren.
> - **Befüllen**: jede Tabelle bekommt im Diagramm der Lehrkraft einen Knopf **„Daten laden“**.
> - Namen frei gewählt, ~25 % nicht-deutsch – **nicht** bei Trollen/Fake News.
> - Arbeitsblatt wird **noch nicht** angefasst; für 3h später „… die vor 17 Jahren geboren sind“.

Gesprächsgrundlage, noch nichts gebaut. Ziel: Jedes neue Netzwerk startet nicht leer, sondern mit einer
glaubwürdigen kleinen Plattform – mit Content Creators, Mitläufern, Trollen, Minderjährigen und
Datenfehlern –, sodass **jede Aufgabe des Begleitdokuments „Datenbanksysteme“ (If Q1, Sep. 26)
eine eindeutige, interessante Antwort hat** und die Einheiten Analytics und Werbung echte Zielgruppen finden.

---

## 1. Grundidee in fünf Sätzen

1. **70 User** in vier Rollen: Content Creator (posten viel, haben Fans), Normalos (2–3 private Fotos,
   folgen, liken, kommentieren), Stille/Kommentierer (posten nichts, liken/kommentieren, einige mit Hass
   in pädagogisch vertretbarer Form) und Pflichtfiguren aus dem Arbeitsblatt (Levi Schumacher, Erna, Alina Keller …).
2. **Themenwelten** mit je 2–3 Creators, damit Zielgruppen entstehen: Gaming, Fußball/Fitness, Lifestyle/Fashion,
   Reisen, Kreativ (Zeichnen/Fotografie), Food/Backen, Tiere, Segeln/Kiel – und als Gegenpol
   **Flache Erde** gegen **Wissenschaft erklärt**.
3. **Alle Zeiten sind relativ** zum Stichtag (= Raum erstellt): Geburtstage als „Alter in Tagen“, Posts als
   „vor n Tagen“. Wer heute 15 ist, ist es in jedem Schuljahr; die Minderjährigen bleiben minderjährig.
4. **Fehler sind Absicht**: „Germany“ neben „Deutschland“, „hamburg“ neben „Hamburg“, zwei Levi Schumacher,
   ein Elisa, die bei `LIKE '%Lisa%'` mitgelöscht wird, ein Geschichtskommentar mit „Hitler“, der beim
   pauschalen Löschen mit verschwindet, schwache Passwörter, die man trotz Hash per `PASSWORD_VERIFY` findet.
5. **Handgeschrieben** werden User, Fotos, Beschreibungen und die wichtigen Kommentare/Diskussionen;
   **nach Regeln erzeugt** (fest mit Seed, in allen Netzwerken eines Raums gleich) werden Likes, Follows,
   Füll-Kommentare, sessions und views.

---

## 2. Zeit: Alles wächst mit dem Raum mit

Gespeichert wird nie ein festes Datum, sondern ein Abstand zum **Stichtag**.

| Feld | gespeichert als | wird beim Befüllen zu |
|---|---|---|
| `users.birthday` | Alter in Tagen am Stichtag (z. B. 15 J. 203 T.) | Stichtag − Alter |
| `users.created_at` | Tage vor Stichtag (30–900) | Stichtag − n, Uhrzeit fest |
| `photos.created_at` | Tage vor Stichtag + Uhrzeit | immer nach `users.created_at` des Besitzers |
| `photos.taken_at` | Minuten vor `created_at` (meist 5 Min.–3 Tage, Urlaubsfotos Wochen) | — |
| `comments/likes/follows.created_at` | nach dem Foto bzw. nach beiden Registrierungen | — |
| `sessions/views` | letzte 30 Tage vor Stichtag | — |

**Stichtag = Erstellung des Raums**, nicht des Netzwerks – sonst hätten zwei Schüler desselben Kurses
verschiedene Geburtstage und die Lösungen passten nicht zusammen.

Gewollte Grenzfälle beim Alter:

- **Wird morgen 18** – `FLOOR(DATEDIFF(NOW(), birthday)/365)` sagt schon 18 (Schaltjahre!), richtig ist 17.
  Gut für 3g „Gibt es Minderjährige?“ und 9d „Lösche alle unter 18“.
- **Hatte gestern Geburtstag, 18** – Gegenstück.
- **Zwei User mit gleichem Geburtstag** (4f), einmal sogar gleiches Datum mit anderem Jahr (Falle: nur Tag+Monat vergleichen?).
- **Eine 12-Jährige** – die Plattform verlangt 13 (Diskussion Altersgrenze/DSGVO Art. 8).
- **Erna, 78** – die Älteste (4b).

⚠ **Arbeitsblatt anpassen**: 3h „die 2006 geboren sind“ funktioniert mit wanderndem Datum nicht. Vorschlag:
„… die genau 17 Jahre alt sind“ oder „… die im selben Jahr wie Levi Schumacher geboren sind“.

---

## 3. Die User (~80)

> Die Tabellen in Abschnitt 3 sind der erste Entwurf; verbindlich ist `dummy/LISTE.md`.

### 3.1 Altersverteilung

| Alter | Anteil | Warum |
|---|---|---|
| 12–15 | ~15 % (12 User) | Zielgruppe der Schüler selbst, Jugendschutz-Fragen |
| 16–17 | ~20 % (16) | „knapp minderjährig“, 9d löscht spürbar viele |
| 18–25 | ~40 % (32) | Creators, Studenten, Azubis |
| 26–50 | ~20 % (16) | Eltern, Trainer, Reisende |
| 50+ | ~5 % (4) | Erna, ein Opa-Angler, eine Lehrerin |

### 3.2 Content Creators (22) – je 6–9 Fotos, viele Follower

| Thema | Creator (Arbeitstitel) | Kurzprofil | Stadt |
|---|---|---|---|
| **Gaming** | `pixelpaul` Paul Brandt, 19 | Streamer, Setup-Fotos, Turniere | Leipzig |
| | `noobqueen` Mia Sander, 17 | Nintendo/Cozy-Games, Fanart | Kiel |
| | `xXhugoXx` Hugo Wendt, 15 | Ranked-Screens, prahlt, Beef mit pixelpaul | Berlin |
| **Fußball / Fitness** | `levi.kicks` **Levi Schumacher**, 17 | Jugendfußball, Training | Kiel |
| | `fitbyfee` Fee Lorenz, 24 | Gym, Rezepte, „Motivation“ | München |
| | `coach_ralf` Ralf Opitz, 46 | Trainer der C-Jugend, Spielberichte | Kiel |
| **Lifestyle / Fashion** | `alina.daily` **Alina Keller**, 21 | Outfits, Kaffee, Sonnenuntergang | Hamburg |
| | `jona.style` Jona Petersen, 18 | Sneaker, Thrift-Hauls | Köln |
| | `glowwithgina` Gina Rossi, 20 | Make-up (nur Produkte/Hände) | München |
| **Reisen** | `lostwithlena` Lena Vogt, 26 | Rucksack, Tag `abenteuerlust` | Freiburg |
| | `vanlife_tom` Tom Kowalski, 31 | Bulli, Norwegen, Portugal; **VPN-Nutzer** | (wechselt) |
| | `alex.achen` **Alexander Achen**, 29 | Städtereisen – 9b „lösche seine Bilder“ | Aachen |
| **Kreativ** | `inkandmila` Mila Hoffmann, 16 | Zeichnungen, Sketchbook | Leipzig |
| | `linsenlinus` Linus Graf, 22 | Fotografie, Langzeitbelichtung, seascape | Rostock |
| | `beatsbyjas` Jasmin Akın, 19 | Musik, Studio-Fotos | Berlin |
| **Food / Backen** | `backmitbrigitte` Brigitte Lang, 52 | Torten, Omas Rezepte | Stuttgart |
| | `studentenkueche` Ole Jansen, 23 | 3-€-Gerichte | Münster |
| **Tiere** | `wuffi_und_ich` Henriette Zimmerman, 34 | Hund Bruno – 9c „lösche alles von ihr“ | Kiel |
| | `katzenkram` Sofia Weber, 14 | Katzen, Hamster | Hannover |
| **Segeln / Küste** | `kielwasser` Finn Lüdtke, 27 | Boote, Regatta – 8f „auf hoher See“ | Kiel |
| **Flache Erde** | `wachtauf_kai` Kai Brenner, 38 | „Horizont ist gerade“, Wasserwaage am Strand | Dresden |
| **Wissenschaft** | `frag_frieda` Frieda Ahrens, 25 | Physik-Studentin, widerlegt Kai freundlich | Göttingen |

Kiel bekommt bewusst viele aktive User (Beispiel im Arbeitsblatt: Kiel mit > 5 Fotos → Levi, Ralf, Finn,
Henriette erfüllen es, Mia nicht ganz).

### 3.3 Normalos (~35) – 0–3 private Fotos

Schüler, Azubis, Eltern. Fotos: Haustier, Pizza, Urlaubsstrand, Konzert, Schulweg. Jeder hat **1–2
Interessen** (Themen von oben), aus denen die Likes/Follows erzeugt werden → saubere Zielgruppen für die Werbung.
Darunter die Arbeitsblatt-Figuren:

| Figur | wofür |
|---|---|
| Levi Schumacher **(zweiter!)**, 34, Berlin | 3d „Zeige nur Levi Schumacher“ → zwei Treffer; 3k „Levi aus Kiel“ |
| Levi Nowak, Kiel | 3k: nicht jeder Levi aus Kiel heißt Schumacher |
| Felix Brandt (Berlin), Felix Ude (Bremen), Felix-Maximilian Roth (Berlin) | 3m „Felix, nicht aus Berlin“ – `name LIKE 'Felix%'` |
| **Erna Lüders**, 78, Lübeck | 3o: folgt ihrem Enkel, kommentiert „Schön, mein Junge ❤️ Oma“ |
| Lasse Lüders, 16, Berlin | Ernas Enkel |
| Lars Peters, 17, Hamburg / Lars-Ole Kunz, 19, Berlin | Fallen für 3o (`LIKE 'Lars%'`) |
| Lisa Meier, Lisa-Marie Kraft, **Elisa** Brandt, Annalisa Ferri | 9a „Lösche alle Lisas“ – `%Lisa%` trifft Elisa und Annalisa |
| **Laura Mauer**, **Marlo Eberhart** | Übung h: liken viel Reisen/Food |
| User aus München (6), Leipzig (5) | 6a, 6b |
| 3 Konten ganz ohne Aktivität | LEFT JOIN, „Karteileichen“, 4a |
| 1 halb gelöschtes Konto: Name „Gelöschter Nutzer“, fast alles NULL | NULL-Werte |

### 3.4 Stille, Kommentierer, Trolle (~15) – keine Fotos

| Typ | Beispiel | Verhalten |
|---|---|---|
| Fan | `levi_fan_09` | liked alles von Levi, „🔥🔥🔥“ |
| **Troll / Hater** | **`aaron183`** Aaron K., 16 | Übung g: „cringe“, „Geh lieber lernen“, „Wer kauft sowas 😂“ |
| | `realtalk_dennis`, 22 | Body-/Style-Kritik in mild („Das Outfit ist echt ein Verbrechen“) |
| | `n0name_88` | kein Name, keine Stadt, Kommentare unter Flacherde-Posts, **Nazi-Vergleich** (s. u.) |
| Verteidiger | `nina.netz` | stellt sich gegen Hater („Lass sie doch, sieht doch gut aus“) |
| Spam-Bot | `gewinn_jetzt_2026` | gleicher Kommentar unter 40 Fotos („Gratis Follower 👉 Link in Bio“) – GROUP BY body |
| Stalker-artig | `beobachter_kl` | liked jedes Foto einer 14-Jährigen, folgt nur Minderjährigen (Gespräch Schutz, analytics: lange Verweildauer) |

**Hass, pädagogisch verträglich**: keine Schimpfwörter gegen Gruppen, keine Slurs. Stufen:
Abwertung („cringe“, „peinlich“) · Body/Style-Shaming in mild · Pile-on (mehrere gegen eine Person) ·
**Nazi-Vergleich** statt Antisemitismus. Für 6d/9e mit dem Begriff „Hitler“ drei Kommentare:

1. `n0name_88` unter Friedas Erklärpost: „Du laberst wie Hitler, nur Propaganda“ (Nazi-Vergleich, löschen ✔)
2. `n0name_88` unter einem Kai-Post: „Hitler hatte auch nicht in allem unrecht“ (Relativierung, löschen ✔) – evtl. zu scharf, s. Fragen
3. `coach_ralf` unter einem Geschichts-Ausflugsfoto (Normalo): „Starke Doku über Hitlers Aufstieg – sollte jeder sehen“ → **falsch-positiv**: `DELETE … LIKE '%Hitler%'` löscht einen guten Kommentar mit. Schöne Diskussion „Filter vs. Moderation“.

---

## 4. Diskussionen nachverfolgen

Das Schema hat keine Antwort-Spalte – braucht es auch nicht: Antworten stehen wie bei Instagram mit
`@username` vorne, die Reihenfolge ergibt `ORDER BY created_at`. Abfragebar mit
`WHERE photo_id = … ORDER BY created_at` bzw. `body LIKE '%@wachtauf_kai%'`.

Geplante Threads (handgeschrieben, 6–15 Kommentare):

| Thread | Wer | Inhalt |
|---|---|---|
| „Die Wasserwaage lügt nicht 🌊“ | Kai, Frieda, n0name_88, 2 Normalos, Kai-Fans | Kai behauptet, Frieda erklärt Erdkrümmung, Fans feiern Kai, ein Normalo wird überzeugt (!), einer macht Witze |
| Beef Gaming | xXhugoXx vs. pixelpaul, deren Fans | „Du bist doch nur Silber“ – endet mit Versöhnung/Duell-Ankündigung |
| Outfit-Pile-on | Alina, realtalk_dennis, aaron183, nina.netz, Alina-Fans | drei Hater, dann kippt die Stimmung, Alina antwortet souverän |
| Gewinnspiel | Gina: „Markiere 2 Freunde“ | 25 Kommentare mit @-Markierungen → wer kennt wen (Netzwerk ohne follows ablesbar) |
| Oma Erna | Erna unter Lasse-Fotos | rührend + Lasses Freunde „haha Oma 😂“ – Lasse löscht? (DELETE-Aufgabe) |
| Spam | Bot | Aufräumaufgabe |

---

## 5. Daten mit Absicht „schmutzig“

| Spalte | Fehler | Aufgabe |
|---|---|---|
| `country` | „Deutschland“ (meist), „Germany“ (6), „deutschland“ (2), „DE“ (1), NULL (5), „Österreich“, „Schweiz“, „Dänemark“, „Türkei“, „Polen“ | 3c, IN, Aufgabe a (LEFT-JOIN-Blatt) |
| `city` | „Hamburg“, „hamburg“, „Hamburg “ (Leerzeichen), „HH“ | Beispiel `LIKE 'HAMBURG%'`, Gruppierung kaputt |
| `email` | Mehrheit `@<netz>.test`, dazu gmx/web/gmail-artig `.test`, Großbuchstaben | 3j, Übung c |
| `centimeter` | NULL bei 8 Usern, ein Troll mit 250 | AVG ignoriert NULL, Bundeswehr 3n |
| `gender` | NULL bei einigen, `diverse` bei 3 | 4e zählt nicht alle |
| `bio` | leer, Emojis, eine mit Handynummer (!) und Schule | Datenschutz-Gespräch |
| Passwörter | ~10 User haben `123456`, `passwort`, `hallo123`, ihren Benutzernamen | `WHERE PASSWORD_VERIFY('123456', password)` – Hash sicher, Passwort nicht |
| Tags | `Abenteuerlust`, `abenteuerlust`, `abenteuer_lust` | „Wie viele Bilder haben den Tag abenteuerlust?“ |
| Fotos | 5 ohne Like, 8 ohne Tag, 3 ohne Beschreibung | LEFT/RIGHT JOIN-Aufgaben b–d |

**Passwort-Falle Aufgabe 7c**: seit 0266 hasht der Server Klartext von selbst – das „Aha, ich habe das Passwort
im Klartext gespeichert“ fällt weg. Entweder so lassen (dann Frage umdrehen: „Warum steht da nicht 123passwort?“)
oder pro Raum abschaltbar machen. Entscheidung nötig.

---

## 6. Analytics (sessions, views)

Erzeugt nach Regeln für die letzten 30 Tage:

- **Geräte**: Teenager meist Handy (iPhone/Samsung/Xiaomi), Creators zusätzlich Desktop (Chrome/Firefox/Edge/Safari),
  Erna ein altes iPad, Kai Windows + Edge.
- **VPN**: `vanlife_tom` mit 9 IPs aus verschiedenen Ländern (Zeitzone passt nicht zur Sprache) → Aufgabe e.
- **Gleicher Ort**: Lasse Lüders und Lars-Ole Kunz (beide Berlin, Nachbarn) teilen eine Heim-IP; die Schüler-IP der Schule taucht
  bei den echten Usern auf (Kontrast).
- **Nachtaktiv**: zwei 14-Jährige um 2–3 Uhr online.
- **Verweildauer**: `views.duration_ms` passt zu den Interessen (Gamer bleiben an Gaming-Fotos lange) – Grundlage
  für personalisierte Werbung, und `beobachter_kl` fällt auf.
- **Erlaubnis-Haken**: Mehrheit hat „Standort zulassen“ geklickt.

Umfang etwa 1 500 sessions, 15 000 views (Deckel 5 000 / 100 000 je Netzwerk eingehalten).

⚠ **Arbeitsblatt anpassen**: Kapitel 6 nennt eine Tabelle `analytics` mit `brand_family` usw.; bei uns heißen sie
`sessions` + `views` (andere Spalten).

---

## 7. Werbung (Vorbereitung)

Die Themenwelten sind der Kern: jede Zielgruppe ist per SQL eindeutig fassbar, z. B.

- „Gamer“ = hat ≥ 3 Fotos mit Tag `gaming` gelikt oder folgt ≥ 2 Gaming-Creators
- „Minderjährige Sportler in Kiel“ (Ethik-Frage: darf man das?)
- „Reisende mit Desktop“ (Laptop-Werbung)
- „Leute, die Kai glauben“ (liken Flacherde und kommentieren positiv) → Verschwörungs-Werbung als Warnbeispiel

Die `ads`-Tabelle selbst ist das nächste Thema.

---

## 8. Schema-Abgleich Arbeitsblatt ↔ YourSozialNet

| Arbeitsblatt | YourSozialNet | Folge |
|---|---|---|
| `centimeters` | `centimeter` | Blatt anpassen |
| `photos.url` | `photos.image` | Beispiel `url = "photos/seascape-…jpg"` anpassen |
| `tags.photo_id` (1:n) | `tags` + `photo_tag` (n:m) | ER-Bild S. 10/11 und JOIN-Aufgaben (3 Tabellen) |
| `followers(following_id, follower_id, id)` | `follows` ohne id | fast gleich |
| `is_active`, `remember_token`, `updated_at` | gibt es nicht | streichen |
| `analytics` | `sessions` + `views` | Kapitel 6 neu |
| 4c `SELECT name, MAX(centimeters)` | SQLite liefert hier den richtigen Namen | **Aha-Effekt fällt weg!** In MySQL kommt ein falscher Name/Fehler. Aufgabe umformulieren oder im Kern nachbilden |
| 8a „Geschlecht auf ‚keine Angabe‘“ | ENUM erlaubt das nicht → Fehler | gut so (Erkenntnis ENUM), oder NULL |

---

## 9. Bilder – was gebraucht wird

### Umfang

| Gruppe | Anzahl |
|---|---|
| Creator-Fotos (22 × 6–9) | ~160 |
| Normalo-Fotos (35 × 0–3) | ~70 |
| Profilbilder | ~55 (der Rest bleibt NULL/Standard) |
| **Summe** | **~285 Bilder** |

### Regeln

- **Keine realistischen Gesichter von Kindern/Jugendlichen** – weder KI noch Foto. Minderjährige zeigen Hände,
  Rücken, Silhouetten, Objekte, Haustiere, Fanart. Profilbilder: Tiere, Gegenstände, Comic-Avatare, Landschaften.
  (KI-Gesichter von Kindern wirken echt und können echten Kindern ähneln.)
- Erwachsene Creators gern mit Gesicht, aber dann **KI-generiert** (keine echten Personen aus Stockfotos, die
  plötzlich als „Flacherdler“ dastehen – Persönlichkeitsrecht).
- Freie Fotos nur Unsplash/Pexels/Pixabay-Lizenz, **Quelle je Bild in einer Liste** (CSV) festhalten.
- Hochformat **4:5, 1080 × 1350**, WebP ≤ 250 KB (wie Uploads); Profilbilder 1:1, 400 px.
- Stimmiger Look je Creator (gleicher Filter/Licht), damit man „Accounts“ erkennt.
- Dateiname = Schlüssel: `gaming_pixelpaul_01.webp`, `avatar_pixelpaul.webp`.
- 1–2 Bilder **mit „verräterischem“ Detail**: Schulname auf dem Pulli, Hausnummer, Bordkarte mit Name – für
  „Was verrät ein Foto?“.

### Liste

Die vollständige Bildliste (je Bild: Datei, Motiv, KI-Prompt, Beschreibung im Post, Tags) erzeuge ich, sobald die
User feststehen – als `MPSkills/tools/SocialHub/dummy/bilder.csv`. Beispielzeilen:

| Datei | Motiv | Post-Text | Tags |
|---|---|---|---|
| gaming_pixelpaul_01 | Gaming-Setup, RGB, Nacht, zwei Monitore | „Neues Setup ist endlich fertig 😍“ | gaming, setup |
| flat_kai_03 | Wasserwaage auf Strandmauer vor Horizont | „Erklärt mir das mal, Physiker 🤔 #wachtauf“ | flacheerde, wahrheit |
| travel_lena_02 | Rucksack auf Felsen, Fjord | „Drei Tage kein Netz. Bestes Gefühl.“ | abenteuerlust, norwegen |
| sail_finn_01 | Jolle bei Kieler Woche | „Regatta Tag 2 – Platz 4!“ | segeln, boot, kiel |
| normal_lasse_01 | Döner in der Hand, Berlin-Straße | „Bester in Kreuzberg“ | food, berlin |
| science_frieda_04 | Schiff verschwindet am Horizont, Teleobjektiv | „Warum sieht man erst den Mast? 🧵“ | physik, erde |

---

## 10. Technik (Vorschlag)

- **Daten als Datei**: `MPSkills/tools/SocialHub/dummy/dummy.json` (User, Fotos, Threads mit relativen Zeiten) +
  Bilder unter `dummy/img/` (~285 × ≤ 250 KB ≈ 50 MB; evtl. auf 150 KB drücken).
- **Regel-Teil** (Likes, Follows, Füll-Kommentare, sessions, views) in einem Generator mit festem Seed → überall gleich.
- **Befüllen** in einer RPC `sh_seed(p_code, p_hub)` (Migration 027x): beim Erstellen eines Netzwerks automatisch
  oder per Knopf der Lehrkraft („Mit Beispiel-Usern füllen“), Tabellen, die noch nicht erstellt sind, werden
  trotzdem befüllt und nur ausgeblendet (wie bisher).
- **IDs**: Dummy-User vor dem Admin anlegen → Admin bekommt z. B. id 81; oder Admin = id 1 und Dummies danach. Wichtig
  für Aufgaben wie „User mit id 3“ (9-Beispiel) und „zuletzt hinzugefügt“ (8b).
- **Bilder**: Spalte `image` verweist auf `lib:<datei>` statt auf `sh_media` – App lädt statisch.
- **Passwörter**: bcrypt-Hashes vorab berechnet, damit das Befüllen schnell ist.
- **Lösungsblatt**: Ein Prüfstand führt alle Arbeitsblatt-Abfragen gegen die Dummy-Daten aus und schreibt die
  erwarteten Ergebnisse – damit sofort auffällt, wenn eine Änderung an den Daten eine Aufgabe kaputt macht.

---

## 11. Offene Fragen an Sönke

1. **Anzahl**: 80 User okay, oder lieber 100 (mehr Rauschen) bzw. 60 (weniger Bilder)?
2. **Hitler-Kommentare**: Nazi-Vergleich + falsch-positiver Geschichtskommentar reicht? Oder auch die Relativierung (#2)?
3. **Passwort-Falle 7c**: Klartext-Hashing so lassen oder pro Raum abschaltbar?
4. **Stichtag**: Raum erstellt (Vorschlag) oder Netzwerk erstellt?
5. **Wann befüllen**: automatisch beim Erstellen oder per Knopf der Lehrkraft (auch später nachfüllen/zurücksetzen)?
6. **E-Mail-Domain**: `@<netzwerkname>.test` (passt zu jedem Netzwerk) oder fest `@yoursozial.test`?
7. **Bilder**: Du suchst/generierst – soll ich die komplette Liste mit KI-Prompts schreiben (Vorschlag ja)?
8. **Werden die Arbeitsblatt-Namen** (Levi Schumacher, Alina Keller, aaron183 …) **beibehalten** – oder schreiben
   wir das Blatt passend zu ganz neuen Figuren um?
