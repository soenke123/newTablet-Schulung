# Startup Story v2 — Design

**Genre:** HayDay-Loop mit BWL-/Medienkompetenz-Inhalt
**Zielgruppe:** SuS 14-18 Jahre, iPad-Safari
**Session-Länge:** 10-30 Min, endless mit Meilenstein-Struktur
**Kern-Lerninhalt:** Wie eine gute Idee schrittweise zur User-Ausbeutungs-Maschine wird (Attention Economy)

---

## 1. Kernidee in einem Absatz

Der Spieler baut ein Startup von der Garage zum globalen Konzern (z.B. bis 6 Mrd. User). User sind seine **Herde** — er wirbt sie an, hält sie bei Laune, und melkt sie über Werbung. Was harmlos anfängt (paar Banner-Anzeigen), wird über den Techtree immer effizienter: Datenverkauf, KI-Personalisierung, Dark Patterns. Das Spiel belohnt Extraktion mechanisch — und zeigt am Ende, was das gekostet hat.

---

## 2. Kern-Metapher: Der Extraktions-Gradient

Extraktion ist **keine Design-Entscheidung** des Spielers, sondern eine **Evolution über die Spielzeit**. In drei Stufen:

### Phase A — Naiver Start (Garage bis Mid-Campus)
- Ressourcen: **User, Geld, Ruf**
- Einnahme-Modell: simple Werbung. Werbe-Slider bestimmt Aggressivität.
- Kein Daten-System, keine Metadaten. Wie Web der 2000er.
- **Lernmoment:** "Werbung ist ein Trade-off."

### Phase B — Datenkrake (nach Metadaten-Node im Techtree)
- Neue Ressource: **Daten** (💾)
- Server produzieren jetzt zusätzlich Daten-Pakete aus User-Aktivität
- Daten haben zwei Verwendungen:
  1. **Verkaufen** → sofort Geld, aber Risiko: Presse-Event bei zu häufigem Verkauf → massiver Ruf-Malus + Kündigungswelle
  2. **Behalten** → wird später für KI-Labor gebraucht
- **Lernmoment:** "Deine User sind das Produkt."

### Phase C — Optimierte Ausbeutung (nach KI-Labor + Dark Patterns)
- KI-Labor verwandelt Daten in **Zielgruppen** → personalisierte Werbung
- Gleiche Werbe-Menge, 3× Geld, aber 2× Ruf-Malus
- Dark Patterns (Autoplay, Infinite Scroll, Push) verstärken Watchtime → Daten-Produktion
- **Lernmoment:** "Optimierte Extraktion ist gruselig effizient."

---

## 3. Ressourcen

| Ressource | Typ | Bedeutung | Sichtbar |
|---|---|---|---|
| User | Bestand (Herde) | Hauptzahl, produziert alles andere | von Anfang an |
| Geld | Fluss (Einnahmen) | Investitionsmittel | von Anfang an |
| Ruf | Modifier (-20% bis +20%) | steuert Wachstum/Verlust der Herde | von Anfang an, aber am Anfang neutral |
| Server-Kapazität | Cap für Herde | max. User-Zahl | von Anfang an |
| Daten (💾) | Bestand (Puffer) | Rohstoff für Verkauf und KI | ab Phase B |
| Watchtime (Std./Tag) | Multiplikator | verstärkt Werbe- und Daten-Ausbeute | ab Phase B, aber Werte schon getrackt |

### Startwerte
- User: 0
- Geld: 1.000 €
- Ruf: neutral (0.02 = +2%/Zyklus organisch)
- Server-Kap: 3.000 (kleine Garage-Server)

### Zielwerte (Endgame)
- User: **3-6 Mrd.** (halb-Weltbevölkerung, "Global Domination"-Meilenstein)
- Geld: unbegrenzt, wächst logarithmisch
- Ruf: kann bis -20% fallen (Kündigungswelle-Zone)

---

## 4. Gebäude als Farm-Zellen

Jedes Gebäude ist eine **Produktionszelle mit Timer**. Mitarbeiter sind der Aktivator (steckst du einen rein → läuft).

### HQ (Werkstatt) — von Anfang an
- **Rolle:** Techtree — Features/Nodes entwickeln
- **Loop:** Node auswählen → Timer 30-180 Sek → "🎉 Klicken!" → Effekt permanent aktiv
- **Sichtbarkeit:** Fortschrittsbalken auf dem HQ-Sprite

### Marketing-Studio (Tier-Handel) — ab Campus
- **Rolle:** User-Akquise
- **Loop:** Kampagne wählen (Flyer / Empfehlung / Sprint / Kooperation) → 30-90 Sek Timer → tap → **+N User dauerhaft in Herde**
- **Slots:** je nach Team-Stufe 1-5 Kampagnen parallel
- **Analog:** Hühner kaufen in HayDay

### Werbeagentur (Melkstand) — ab Campus
- **Rolle:** kontinuierliche Werbe-Einnahmen aus Herde
- **Loop:**
  - Slider für Werbe-Intensität (0-50%)
  - Alle 20 Sek erscheint 💰-Icon zum Tappen — Wert = User × Faktor × Watchtime
  - Puffer für ~2 Min (Offline-Progression!)
- **Kosten:** höhere Intensität = mehr Geld/Sek, aber Ruf-Malus/Sek
- **Analog:** Milch aus Kuh sammeln

### Serverfarm (Stall + später Datenkrake)
- **Rolle Phase A:** User-Kapazität (max. Herdengröße)
- **Rolle Phase B:** zusätzlich Daten-Extraktion aus User-Aktivität
  - Alle 15 Sek erscheint 💾-Paket zum Tappen
  - Menge = User × Watchtime × Server-Level
  - Puffer bei Overflow
- **Upgrades:** Kleine Serverfarm → Serverfarm → Rechenzentrum (skaliert bis 100M+ User-Kap)

### KI-Labor (Molkerei) — Phase C, spät
- **Rolle:** Daten → Personalisierungs-Multiplikator für Werbung
- **Loop:** Daten reinstecken → nach X Sek "Zielgruppen-Modell fertig" → Werbeagentur-Output × 3 solange Modell aktiv
- **Modelle verfallen** nach Y Sek → neue Daten nötig → wiederkehrender Loop
- **Analog:** Käse aus Milch in HayDay-Molkerei

### Community Center (Weide-Pflege) — ab Mid-Campus
- **Rolle:** Ruf-Reparatur, Krisenmanagement
- **Aktionen:**
  - Support-Programm (dauerhaft, kostet Mitarbeiter+Geld, reduziert Ruf-Malus)
  - Spendenaktion (einmalig, Cooldown 12 Ingame-Zyklen)
  - Community Event (12 Zyklen Timer, +2% Herde, +3% Ruf)
  - Image-Kampagne (4 Zyklen, Ruf kann nicht sinken)

---

## 5. Techtree — neu kategorisiert nach Wirkung

Die ~25 bestehenden Nodes bleiben inhaltlich. Sortiert nach **Hebel im Loop**:

### 🎨 Attraktions-Features (mehr User pro Kampagne)
Frontend v2 (Mobile), Logo Redesign, Bilder, Videos hochladen
→ Wirkung: Marketing-Kampagnen bringen +X%

### 💬 Bindungs-Features (User bleiben länger → mehr Daten)
Like, Kommentar, Teilen, DM, Gruppen, Suche, News-Feed, Account
→ Wirkung: Watchtime steigt → Daten-Produktion × Faktor

### 🗄️ Data-Features (schalten Datenextraktion frei)
Backend v2, **Metadatenspeicherung** (Kern-Freischaltung Phase B!)
→ Wirkung: Serverfarm produziert überhaupt erst Daten

### 🌀 Dark Patterns (starke Watchtime-Boosts, sichtbarer Ruf-Malus)
Infinite Scroll, Push-Benachrichtigungen, Stories, Autoplay, Live-Streaming
→ Wirkung: Watchtime × 1.3 bis 3, Ruf pro Aktivierung -1 bis -2%
→ **Der schwarze Herzschlag** — hier merkt der Spieler moralisch was er tut

### 📢 Werbe-Features (mehr Anzeigetypen freischalten)
Erste Kooperation, Feed-Werbefläche, Search-Ad, Video-Ad
→ Werbeagentur bekommt neue Slots mit höheren Faktoren

### 🏙️ Marketing-Features (neue Kampagnen-Typen)
Langzeit-Kampagnen, Sprint-Kampagnen, Langzeit-Kooperation
→ Marketing-Studio bekommt neue Kampagnen mit unterschiedlichen Profilen
→ EU / Amerika / Asien-Expansion: erweitert Herden-Potential

### 🎧 Community-Features (Ruf-Reparatur)
Feedback-System, PR-Abteilung
→ Community-Center-Aktionen freischalten

---

## 6. Kern-Loop pro Session-Minute

Was der Spieler dauerhaft alle 10-30 Sek tut:
1. **💰 Coin auf Werbeagentur tappen** (jede ~20 Sek) — sofortiges Feedback, Geld wächst
2. **💾 Daten-Paket auf Server tappen** (jede ~15 Sek, ab Phase B) — Daten für Verkauf/KI
3. **🎉 Fertige Kampagne / Feature tappen** (alle 30-90 Sek) — großer Wachstumsschub
4. **Kampagne pflanzen** (immer wenn Slot frei wird) — Entscheidung: welche?
5. **Feature entwickeln** (alle paar Min) — was ist der nächste strategische Hebel?
6. **Werbe-Slider justieren** (gelegentlich) — Trade-off spüren
7. **Ruf-Krise managen** (bei Warnungen) — Community-Center-Aktion

---

## 7. Zwei konkrete Zeitfenster

### Sek 0-60 (Solo, Garage)
1. Sek 0: Onboarding-Screen "Deine Garage" — nur HQ sichtbar
2. Sek 5: HQ tap → Techtree → Frontend v1 entwickeln (30 Sek Timer)
3. Sek 10: Marketing-Tab → "Freunden erzählen" (0 Kosten, sofort) → +200 User
4. Sek 30: Backend v1 anfangen
5. Sek 60: erste ~300-400 User in Herde, Werbe-Coin noch nicht (weil noch keine Werbeagentur)
6. Sek 90: "Plattform online stellen"-Button erscheint

### Min 5-10 (Campus, Team ~4 Slots)
- 3-5 Kampagnen parallel in Marketing-Studio (verschiedene Timer)
- Werbeagentur läuft: alle 20 Sek 💰 tappen (Basis-Einnahme steigt sichtbar)
- HQ läuft: Feed → Like → Kommentar → Videos (Bindungs-Features)
- Erste Ruf-Warnung wenn Werbe-Slider zu aggressiv → Support-Programm einrichten
- Herde bei 50k-500k User, Geld 100k€+, Ruf schwankt zwischen 0 und +3%

### Endgame (30+ Min, mehrfach reingekommen)
- Metadaten aktiv → Daten strömen rein
- KI-Labor läuft, Werbe-Multiplikator ×3
- Dark Patterns aktiviert, Watchtime bei 4-6 Std./Tag
- Marktexpansion in alle Regionen
- Herde bei Milliarden User, Ruf bei -10 bis -15%
- Bei 6 Mrd. User: **"Global Domination"-Meilenstein-Modal** mit Score:
  - Wie viele User hast du aufgebaut?
  - Wie viel Geld hast du verdient?
  - Wie viel Ruf hast du dafür geopfert?
  - Wie viele Dark Patterns hast du aktiviert?
  - Wie oft Daten verkauft?
  - **"Deine Herde ist die Welt. Was ist dein Preis dafür?"** — offener Diskussions-Anlass für den Klassenraum.
- Spiel geht **endless** weiter — Werbekunden werden immer wählerischer, KI-Modelle verfallen schneller, aber es gibt kein hartes Ende.

---

## 8. Ruf als Verlust-Mechanik (der neue Bissen)

Aktuell (v1): Ruf sinkt still im Hintergrund.
Neu (v2): Ruf hat sichtbare, dramatische Konsequenzen.

**Regeln:**
- Ruf > +3%: organischer User-Zuwachs pro Sek (Mundpropaganda)
- Ruf zwischen -3% und +3%: neutrale Herde
- Ruf < -5%: pro Sek verlassen 0.1% der User die Plattform (sichtbar sinkende Zahl!)
- Ruf < -12%: **Kündigungswelle-Event** — pop-up mit Bild, "500.000 User haben deine Plattform verlassen — die Presse berichtet", Story-Log-Eintrag
- Ruf < -18%: **Boykott-Event** — Marketing-Kampagnen bringen für X Sek weniger User, Werbekunden zahlen weniger

Der Spieler soll die Herde **sehen** schrumpfen wenn er zu gierig ist.

---

## 9. Endgame-Skalierung: 3-6 Mrd. User

- Wachstumsformel muss über mehrere Größenordnungen skalieren
- Marktexpansion vervielfacht Potential (EU +400 Mio, Amerika +1.6 Mrd, Asien +3 Mrd)
- Kampagnen skalieren automatisch mit (users_percent statt users_flat)
- KI-Labor + Dark Patterns bringen exponentielle Multiplikatoren
- Server-Farm-Upgrades bis 100M+ User-Kap pro Farm, mehrere Farmen möglich
- Endless-Modus: keine Bankrott-Mechanik, keine harte Grenze — nur Meilensteine ("1 Mrd.", "3 Mrd.", "6 Mrd. — Global Domination")

---

## 10. Recycling aus v1 (was wir mitnehmen)

**Vollständig übernehmen:**
- Alle Sprites (Team, Gebäude, Avatars, Investoren)
- Techtree-Node-Content (Namen, Icons, Beschreibungen, Effekte)
- Team-Stufen (Solo → Duo → Quartet → Kleines Team → Team → Großes Team → Studio)
- Werbeagentur-Slider-UI (Frequenz 0-50%, Preview, Übernehmen)
- Community-Center-Aktionen (Support-Programm, Spende, Event, Image)
- Marketing-Kampagnen-Definitionen (Stadtaktion, Sprint, Empfehlung, Nachhall)
- Slot-Sidebar-UI (rechter Rand mit Team-Portrait und Live-Progress)
- Building-Grid mit Sprites und Progress-Bars pro Slot
- Investor-Modals (Marcus Bär, Deal-Konditionen)
- Story-Log-System
- Sparkline-History für Ressourcen
- Ressourcen-Bar oben
- Confetti bei Node-Fertigstellung
- Assets-Modul, Bus, State-Reducer-Pattern, Screens-Framework
- Persistence (localStorage)

**Umbauen:**
- `tick.js`: kein Monats-Batch mehr, kein `advanceMonth` — stattdessen kontinuierlicher Sek-Tick mit Modul-eigenen Timern
- `clock.js`: bleibt als Sek-Uhr, aber "Monatsring" wird zu einem allgemeinen atmosphärischen Element (Datum anzeigen für Story-Feel)
- Team-Monatskosten → **entfernen**. Team-Upgrade kostet Geld (Investition), Halten nichts.
- Server-Betriebskosten → deutlich reduzieren oder auf 0
- Bankrupt-Mechanik → weg (endless, keine Verlust-Zustand)
- User-Wachstum: von monatlichem Batch zu kontinuierlichem Sek-Fluss basierend auf Ruf
- Kampagnen-Effekte: von "pro Monat" zu "pro Sek" umskaliert

**Neu bauen:**
- Tap-to-Collect für Werbeagentur (💰-Icon-System mit Puffer)
- Tap-to-Collect für Server-Daten (💾-Icon-System, ab Phase B)
- **Neue Ressource: Daten** (State + UI)
- **KI-Labor-Modul** (Datenverbrauch, Modell-Timer, Werbe-Multiplikator)
- **Datenverkauf-System** (Verkaufen-Aktion, Presse-Event bei Häufigkeit)
- Ruf-Kündigungswelle-Events (visuell dramatisch)
- Offline-Progression (Zeit-Delta bei Rückkehr rechnen, Willkommens-Modal mit Zusammenfassung)
- Endgame-Score-Modal ("Global Domination" bei 6 Mrd. User)
- Ambient-Life (subtile Animationen: Team-Wackeln, Gebäude-Lichter, User-Pop-ups)

---

## 11. Prototyp-Umfang (nächster Schritt)

**Ziel:** Ein spielbarer Loop in einem neuen Ordner (`v2/`) mit **nur diesen Elementen**:
- Garage-Screen mit HQ-Sprite
- Ressourcen-Bar (User, Geld)
- Ein Marketing-Node ("Freunden erzählen") als Sofort-Aktion
- Eine Werbeagentur (nach 1 Feature) mit einfachem Slider und Tap-to-Collect 💰
- Ein Feature-Node im HQ mit Timer
- Slot-Sidebar (vereinfacht)

**Ausdrücklich noch nicht drin:** Community Center, KI-Labor, Marktexpansion, Dark Patterns, Daten, Serverfarm-Details, mehrere Gebäude, komplette Techtree.

**Testfrage nach Prototyp:** "Fühlt sich das nach 5 Min noch spannend an — will ich weitermachen?"
Wenn ja → weiterbauen. Wenn nein → zurück zum Papier, was fehlt?
