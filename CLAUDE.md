# Startup Story — Design v3

Farm-Loop mit Watchtime als Zwischen-Ressource. Kein Ersatz für v2, sondern eine strukturelle Weiterentwicklung nach dem MVP-Test.

---

## 1. Kernidee — warum v3 ≠ v2

In v1 und v2 sind User eine abstrakte Zahl, und Geld tropft direkt aus einer "Werbe-Coin". Das fühlt sich schnell wie ein Zähler an, den man antippt.

v3 baut eine echte **Produktionskette** ein: Tiere leben sichtbar auf Farmen und produzieren **Watchtime** (Sanduhren-Sprudel). Die Werbeagentur **konvertiert** Watchtime in Geld — nicht als Magie, sondern als sichtbare Maschine. Das schafft zwei Sachen, die v2 fehlen:

1. **Etwas zu ernten** (Watchtime auf den Farmen)
2. **Etwas zu konvertieren** (Watchtime → Geld in der Werbeagentur)

Zusätzlich: **der Trend hat echte Konsequenzen**. Jede Konvertierung drückt ihn — hoher Trend bringt passive User dazu, negativer vertreibt sie. Damit wird die Wahl des Werbedeals (Werbeart + Intensität) eine echte Entscheidung, nicht eine Kosmetik.

Die HayDay-Zug ist bewusst: sichtbare Tiere, physische Ressourcen, tap-to-collect. Aber wir behalten strategische Tiefe an drei Stellen: Trend-Trade-off, Marketing-vs-Passiv-Wachstum, Techtree-Wahl (später).

---

## 2. Der Produktionskreislauf

```
   ┌──────────────┐    produzieren    ┌──────────────┐
   │   TIERE      │ ────Watchtime───> │  FARM-STACK  │
   │ (Küken/Huhn/ │                   │ (max 5×/Tier)│
   │  Schwein…)   │                   └──────┬───────┘
   └──────▲───────┘                          │
          │                        Klick     │
    kaufen│                      (ernten)    │
          │                                  ▼
   ┌──────┴───────┐                   ┌──────────────┐
   │   MARKETING  │ <───Geld──── ┌────│ WATCHTIME-   │
   │    CENTER    │              │    │   LAGER      │
   │ (Kampagne    │              │    └──────┬───────┘
   │  kostet €,   │              │           │
   │  gibt User)  │              │           │ Deal zahlt je Zyklus
   └──────────────┘              │           ▼
                                 │    ┌──────────────┐
                                 │    │ WERBEAGENTUR │
                                 │    │ Deal: Art +  │
                                 │    │ Intensität   │
                                 │    │ 5 Zyklen     │
                                 │    │ drückt Trend │
                                 │    └──────┬───────┘
                                 │           │
                                 │           │ Klick (ernten)
                                 │           ▼
                                 │    ┌──────────────┐
                                 └────┤   GELD       │
                                      └──────────────┘

   TREND ist die User-Wachstumsrate in Prozentpunkten:
   > 0  → alle 15 s stapelt sich ein Schub (max 5), Klick = User einsammeln
   < 0  → User wandern laufend ab; Klick = Schadensbegrenzung (halbiert 45 s)
```

Das ist der komplette v3-MVP-Loop. Keine Feature-Timer, keine HQ-Module — die kommen erst mit dem Techtree in Phase 2.

---

## 3. Ressourcen-Übersicht

| Ressource     | Sichtbar wo?                | Ändert sich durch                                          |
|---------------|-----------------------------|------------------------------------------------------------|
| **Geld €**    | Ressourcen-Bar oben         | Werbeagentur-Ernte (+), Marketing-Kampagne (-), Farm-Kauf (-), Tier-Upgrade (-) |
| **User**      | Ressourcen-Bar oben (Summe aller Tiere) | Marketing-Kampagne (+), Trend-Ernte bei positivem Trend (+), Abwanderung bei negativem Trend (-) |
| **Watchtime** | Ressourcen-Bar oben + Sprudel auf Tieren + Zahl auf Werbeagentur | Tiere produzieren (+), Werbeagentur verbraucht (-) |
| **Trend**     | Ressourcen-Bar oben (in %), mit Ernte-Button darunter | Summe aller aktiven Modifikatoren: laufende Werbedeals (-), Grundinteresse (+), später Features/Events |

Watchtime und Trend sind **die zwei neuen zentralen Ressourcen** gegenüber v2. Alles andere existierte schon.

---

## 4. Serverfarm & Tier-Tiers

**Kernregel: Eine Farm = ein Tier-Typ.** Auf einer Kükenfarm leben nur Küken, auf einer Elefantenfarm nur Elefanten. Jede Farm ist optisch ein eigenes Gebäude, das seine Stufe zeigt (Küken-Farm = kleiner Stall, Elefanten-Farm = riesiges Rechenzentrum).

**Kapazität:** 5 Slots pro Farm (einheitlich für alle Stufen im MVP). **Die Tierart bestimmt damit direkt die Farm-Kapazität** — eine Kükenfarm fasst 500 User, eine Elefantenfarm 50 Mio.

**Tier-Stufen** (User pro Tier, ×5–×10 Wachstum je Stufe):

| Icon | Tier    | User/Stück  | Farm-Kapazität (5×) |
|------|---------|-------------|---------------------|
| 🐣   | Küken   | 100         | 500                 |
| 🐔   | Huhn    | 500         | 2.500               |
| 🪿    | Gans    | 8.000       | 40.000              |
| 🐑   | Schaf   | 50.000      | 250.000             |
| 🐷   | Schwein | 500.000     | 2.500.000           |
| 🐄   | Kuh     | 1.000.000   | 5.000.000           |
| 🐘   | Elefant | 10.000.000  | 50.000.000          |

MVP: Icons/Emojis reichen. Sprites erstellst du parallel.

### Zwei Wachstumspfade (Spielerwahl):

**A) Farm hochstufen** — bestehende Farm inkl. aller Tiere eine Stufe höher.
- Beispiel: Kükenfarm mit 10 Küken (1.000 User) → Hühnerfarm mit 10 Hühnern (5.000 User)
- Kosten skalieren mit Zieltier: z.B. 5.000 € für Küken→Huhn, 40.000 € für Huhn→Gans usw.
- Voraussetzung: Farm ist voll besetzt (sonst upgraded man leere Slots mit)

**B) Neue Farm direkt kaufen** — höherstufige Farm auf einen freien Grid-Slot setzen.
- Wenn Zieltier bereits einmal freigeschaltet wurde (also mind. eine Farm der Stufe existiert oder existiert hat), kann man direkt eine leere neue Farm dieser Stufe kaufen und mit Tieren befüllen.
- Kosten: pauschal höher als Upgrade-Weg — dafür ohne Vorlauf.
- Neue Slots im Grid freischalten (siehe Grid-Sektion) kostet extra.

Damit hat der Spieler eine echte Entscheidung: **weiter aufsteigen mit was ich habe** vs. **breiter aufstellen**.

### Grid — worauf die Farmen stehen

Alle Gebäude (Serverfarmen, Werbeagentur, Marketing-Center) stehen auf einem **Grid**, das mitwächst.

- **Start**: 2×2 = 4 Slots. Belegt mit 1 Kükenfarm + 1 Werbeagentur + 1 Marketing-Center. 1 Slot frei.
- **Erweiterung**: Neuen Slot freischalten kostet Geld. Preis steigt pro freigeschaltetem Slot.
- **Layout wächst nach unten/rechts**, scrollbar sobald das Grid größer als der Sichtbereich wird.

Das Grid ist selbst ein sichtbares Fortschritts-Signal ("mein Konzern wächst").

---

## 5. Watchtime-Produktion & Ernte

**Produktion:**
- Jedes Tier produziert **1 Watchtime pro User pro 5 Sekunden**.
- Beispiel: Kükenfarm mit 3 Küken (300 User) = 300 Watchtime alle 5 s = 60 Watchtime/s. Voll besetzt (5 Küken = 500 User) = 100 Watchtime/s.

**Stack-Limit:**
- Pro Tier stacken bis zu **5 Zyklen** (= 25 Sekunden Produktion). Danach steht die Produktion still, bis geerntet wird.
- Anzeige: kleines Sanduhr-Icon über jedem Tier mit Zahl. Bei Vollstand blinkt oder pulsiert es.

**Ernten:**
- **Klick auf die Farm** → gesamte Watchtime aller Tiere fließt in ein globales **Watchtime-Lager**.
- Feedback: Sanduhr-Sprudel, Konfetti, große Zahl fliegt in die Ressourcen-Bar.
- Sound: kurzer positiver Cling (in Umsetzung optional).

**Warum globales Lager, nicht direkt in die Werbeagentur?**
- Der Spieler entscheidet frei, ob er die Werbeagentur laufen lässt (Trend-kostend) oder Watchtime hortet.
- Weniger Klicks im Loop (kein "Watchtime zur Werbeagentur bringen"-Schritt).
- Techtree kann später andere Konvertierungen freischalten, die auch aus dem Lager ziehen.

Das ist **Offene Frage 1** aus dem Plan — hier als Vorschlag notiert.

---

## 6. Werbeagentur — buchbare Werbedeals

**Was sie tut:** Der Spieler bucht einen **Werbedeal** — eine Werbeart plus eine Intensität. Der Deal läuft `AD_CYCLES_MAX` = 5 Zyklen und ist dann vorbei. Jeder Zyklus wird **vorab** mit Watchtime bezahlt und wirft nach Ablauf seiner Dauer Geld ab, das sich auf der Agentur stapelt und eingesammelt werden will.

Der frühere Dauer-Slider ist damit weg: eine idle Agentur kostet keinen Trend, und der Loop pulsiert — buchen → Trend sackt → Deal endet → Trend erholt sich.

### Die drei Werbearten

Definiert in `AD_TYPES` (`js/state.js`), alle drei von Anfang an verfügbar.

| Art | Icon | Watchtime / Zyklus | Dauer / Zyklus | € @ 50 % | Trend @ 50 % |
|-----|------|--------------------|----------------|----------|--------------|
| **Banner** | 🪧 | 10.000 | 10 s | 500 € | −5,0 |
| **Feed-Werbung** | 📰 | 40.000 | 20 s | 4.000 € | −2,0 |
| **Werbevideo** | 🎬 | 150.000 | 45 s | 7.000 € | −1,0 |

Daraus abgeleitet:

| Art | €/Watchtime | €/s | Watchtime-Bedarf | € je Trend·Sekunde | Ganzer Deal (5 Zyklen) |
|-----|-------------|-----|------------------|--------------------|------------------------|
| Banner | 0,050 | 50 €/s | 1.000 wt/s | 10 | 50.000 wt · 50 s · 2.500 € |
| Feed | **0,100** | **200 €/s** | 2.000 wt/s | 100 | 200.000 wt · 100 s · 20.000 € |
| Video | 0,047 | 156 €/s | 3.333 wt/s | **156** | 750.000 wt · 225 s · 35.000 € |

- **Banner** — billigster Einstieg (10.000 Watchtime = ein halber Küken-Farm-Stack), sonst überall von Feed geschlagen, und **10× so viel Trend-Schaden je Euro** wie Feed. Der Starter, den man später wegwirft.
- **Feed** — bestes €/Watchtime und bestes €/s. Das Arbeitspferd, solange Watchtime der Engpass ist.
- **Video** — gewinnt nur eine Achse, dafür deutlich: **Trend-Effizienz**. Der Deal fürs Spätspiel, wenn die Farmen ins Absurde skalieren und der Trend (±20) die einzige echte Schranke bleibt.

### Intensität (1–50 %)

```
moneyPerCycle = eur50   × (i / 0.5)        ← linear
trendMalus    = trend50 × (i / 0.5)²       ← quadratisch
```

Watchtime-Kosten und Zyklusdauer sind von der Intensität **unabhängig** — ein Deal kostet immer dasselbe. Daraus entsteht der beidseitige Trade-off: hohe Intensität holt mehr Geld aus derselben Watchtime, kostet aber überproportional Trend. Also **Watchtime knapp → hochdrehen, Trend knapp → runterdrehen**.

Beispiel Banner: 10 % → 100 € / −0,2 · 25 % → 250 € / −1,25 · 50 % → 500 € / −5,0.

Die Formeln stehen **einmal** in `js/state.js` (`adMoneyPerCycle` / `adTrendMalus`); Loop und UI rechnen beide darüber. Die Getter `adRevenueMult()` / `adTrendMult()` liefern aktuell 1 und sind die Schnittstelle für spätere Techtree-Nodes.

### Trend-Malus

Jede Agentur registriert **ihren eigenen** Modifikator `werbe:<instanceId>`, solange ihr Deal produziert — das Trend-Info-Modal listet sie dadurch einzeln auf. Kein Deal = kein Modifikator.

### Watchtime-Abbruch

Reicht das Lager beim Start eines Zyklus nicht, **bricht der Deal ab**. Bereits erwirtschaftetes Geld bleibt zum Einsammeln liegen, der Rest verfällt. Ein Toast sagt Bescheid.

### Visualisierung

- Ring auf dem Gebäude (`.wb-ui`, gleiche Optik wie Marketing) zeigt den laufenden Zyklus, der Ring-Text den Zähler `3/5`.
- Gold-Button darunter, drei Zustände: **einsammeln** (`💰 +900 €`) → **Ein-Klick-Wiederbuchung** des letzten Deals (`🔁 Banner 30 %`) → versteckt.
- Einsammeln lässt das Geld sichtbar zur Geld-Kachel fliegen, Deal-Abschluss feuert ein Feuerwerk.

**Später:** Trend als Multiplikator auf die Werbeerträge, Techtree-Nodes auf `adRevenueMult` / `adTrendMult`, weitere Werbearten.

---

## 7. Wachstumsmechanik — wie kommen neue User

Zwei parallele Systeme, statt einem "Freunden erzählen"-Knopf:

### 7.1 Marketing-Center (aktives Wachstum)

**Was:** Ein Gebäude neben der Werbeagentur. Klick → Modal mit Kampagnen-Auswahl.

**Beispiel-Kampagnen (MVP):**

| Kampagne         | Kosten  | Dauer | Ergebnis            |
|------------------|---------|-------|---------------------|
| Poster im Kiez   | 300 €   | 30 s  | +200 User           |
| Uni-Kampagne     | 1.500 € | 60 s  | +1.500 User         |
| Insta-Ads        | 5.000 € | 90 s  | +8.000 User         |

Läuft in der Slot-Sidebar sichtbar (Progress-Bar) — genau wie in v2 HQ-Feature-Slots.

**Warum das besser ist als der Freunde-Button:**
- Kostet echte Ressourcen (Geld) — Trade-off mit Werbeagentur-Einnahmen.
- Skaliert (verschiedene Kampagnen-Größen).
- Nicht auf Cooldown, sondern auf Budget begrenzt.

### 7.2 Trend-getriebenes Wachstum

Ohne aktives Zutun sammelt der Trend Schübe an, die der Spieler abholt — siehe Sektion 8.

---

## 8. Trend — die Wachstumsrate (ersetzt den früheren "Ruf")

Der Trend ist **wörtlich die User-Wachstumsrate in Prozentpunkten**: Trend +3 heißt, dass pro Zyklus 3 % der aktuellen User dazukommen. Er ersetzt den alten Ruf-Wert vollständig.

**Er wird nie direkt hoch- oder runtergezählt**, sondern ist immer die Summe der aktiven Modifikatoren in `state.current.trendMods` (`id → { label, value, expiresAt }`). Dadurch ist die Aufschlüsselung im Info-Modal per Konstruktion korrekt, und neue Effekte registrieren einfach einen weiteren Modifikator.

| Größe                | Wert |
|----------------------|------|
| Zyklus               | 15 s |
| Stapel               | max 5 (= 75 s gebunkert) |
| Spanne               | −20 … +20, Alltagsbereich ±10 |
| Einlösen             | linear: `User += User × Trend% × Stapel` |
| Negativ-Abfluss      | kontinuierlich, `User × |Trend|% × (dt / 15 s)` |
| Schadensbegrenzung   | Klick → 45 s halber Abfluss, Cooldown 60 s |

**Positiver Trend** stapelt bis 5 Zyklen und wartet dann auf den Klick. Der Ernte-Button sitzt **unter** der Trend-Kachel in der Ressourcen-Bar (nicht auf einem Gebäude) und zeigt die absolute User-Zahl. Beim Klick fliegen die User sichtbar zur User-Kachel.

**Negativer Trend** stapelt nicht — User sickern laufend ab, mit fallender Zahl aus der Kachel heraus. Der Klick wechselt dort die Bedeutung: statt Ernte gibt es **Schadensbegrenzung**, die den Abfluss halbiert. Gebunkerte Stapel bleiben erhalten, lassen sich aber erst wieder einlösen, wenn der Trend positiv ist.

**Offline** (`actions.offlineCatchUp`, aufgerufen aus `main.js`): Watchtime- und Trend-Stapel werden um die Abwesenheit vorgespult — aber höchstens um die jeweilige Stapel-Obergrenze. Dieselbe Regel in beide Richtungen: auch negativer Trend kostet maximal 5 Zyklen.

**Wodurch steigt der Trend?** Grundinteresse (+3 als Startmodifikator); später Features aus dem Techtree, Kampagnen, Community-Aktionen.
**Wodurch sinkt er?** Laufende Werbedeals (`trend50 × (i/0.5)²` je Agentur, siehe Sektion 6); später Metadaten-Verkauf, aggressive Kampagnen, Shitstorm-Events.

**Bewusst noch nicht drin** (kommt später):
- Malus bei voller Serverkapazität ("keiner hat Bock mehr")
- Trend als Multiplikator auf die Werbeerträge — gehört in den Werbeagentur-Umbau, damit er dort auch angezeigt wird
- Trend-Events (Shitstorm/Viral)

---

## 9. Techtree — nur Kategorien, keine Nodes

Für den MVP **kein** Techtree. Aber die Kategorien, die später kommen:

- **Farm-Upgrades** — mehr Kapazität pro Farm, günstigere Tier-Upgrades, Wasser/Strom-Ausbau
- **Konvertierungs-Upgrades** — bessere €/Watchtime-Ratio, geringerer Trend-Malus, alternative Konvertierungs-Wege (KI-Labor: Watchtime → Metadaten)
- **Marketing-Upgrades** — günstigere Kampagnen, neue Kampagnen-Typen, virale Multiplikatoren
- **Trend-Werkzeuge** — Community-Center, PR-Abteilung, Krisen-Management

Konkrete Node-Liste kommt, wenn der Kern-Loop steht und wir wissen was Spaß macht.

---

## 10. UI-Skizze — Grid-basiert

Alle Gebäude stehen auf einem 2D-Grid. Start: 2×2. Neue Slots kosten Geld. Grid scrollt sobald größer als Sichtbereich.

```
┌───────────────────────────────────────────────────────────────┐
│  👥 1.200   💰 3.240 €   ⏳ 8.900   ⭐ +3%                    │  Ressourcen-Bar
├────────────────────────────────────────────┬──────────────────┤
│  ┌─────────────┐  ┌─────────────┐          │  ▶ Laufende Slots │
│  │  KÜKENFARM  │  │ WERBEAGENTUR│          │  ────────────── │
│  │  🐣🐣🐣 . . │  │   ◕ 3/5     │          │  📢 Uni-Kampagne │
│  │  (3/5 voll) │  │  💰 +900 €  │          │  ▓▓▓░░ 45s      │
│  │  ⏳ 1.500   │  │             │          │                 │
│  └─────────────┘  └─────────────┘          │                 │
│  ┌─────────────┐  ┌─────────────┐          │                 │
│  │  MARKETING  │  │   [ + ]     │          │                 │
│  │   CENTER    │  │  neuer      │          │                 │
│  │  [Starten]  │  │  Slot       │          │                 │
│  └─────────────┘  └─────────────┘          │                 │
│                                            │                 │
│  Grid wächst nach unten/rechts →           │                 │
└────────────────────────────────────────────┴──────────────────┘
```

- **Ressourcen-Bar** oben: User, Geld, Watchtime, Trend
- **Grid** (Hauptbereich): Gebäude in Zellen. Leere Zellen mit `[ + ]` — klick öffnet Kauf-Modal (Farm-Stufe wählen, Werbeagentur, Marketing-Center, weitere je nach Freischaltung)
- **Farm-Klick** = Watchtime ernten (Konfetti). Doppel-Klick oder Info-Button = Farm-Details (Upgrade, Tiere kaufen)
- **Werbeagentur-Klick** = Modal mit laufendem Deal + Buchung. Gold-Button auf dem Feld = Geld ernten bzw. letzten Deal erneut buchen
- **Marketing-Klick** = Kampagnen-Modal
- **Sidebar rechts**: laufende Kampagnen mit Progress-Bar
- **Grid-Expansion**: Rand-Slot mit `[ + Slot kaufen ]` — Preis steigt pro freigeschaltetem Slot

Sieht bewusst anders aus als v2's HQ-zentriertes Layout — es gibt einen wachsenden Konzern mit vielen Gebäuden.

---

## 11. MVP-Scope für v3

Was wir zuerst bauen (in `v3/`-Ordner, parallel zu `v2/`):

- [x] Grid-Layout 2×2, Start-Belegung: 1 Kükenfarm + 1 Werbeagentur + 1 Marketing-Center + 1 leerer Slot
- [x] Kükenfarm mit 5 Slots, initial 3 Küken (= 300 User, Kapazität 500)
- [x] Tiere kaufen (klick auf freien Slot in Farm)
- [x] Watchtime-Produktion (1 W/User/5s, Stack max 5×), Ernte durch Klick auf Farm, mit Konfetti — landet in globalem Lager
- [x] Werbeagentur mit buchbaren Werbedeals: 3 Werbearten, Intensität 1–50%, 5 Zyklen pro Deal, Trend-Malus je Agentur, Ring + Gold-Button auf dem Feld, Klick-Ernte
- [x] Marketing-Center mit 3 Kampagnen (Kiez / Uni / Insta), läuft in Sidebar-Slot
- [x] Trend-Feedback: Ernte-Schübe bei positivem Trend, Abwanderung bei negativem
- [x] Farm-Upgrade (ganze Farm eine Stufe hoch, wenn voll besetzt)
- [x] Neuer Grid-Slot kaufbar
- [x] Neue Farm auf leerem Slot kaufbar (Stufe wählen aus freigeschalteten)
- [x] Ressourcen-Bar mit allen 4 Ressourcen (User, Geld, Watchtime, Trend)

**Nicht im MVP:**
- Techtree (nur Skizze der Kategorien vorhanden)
- Strom/Wasser-Upkeep
- Metadaten-Ressource
- KI-Labor, Community-Center
- Trend-Events (Shitstorm/Viral)
- Story/Investoren
- Programme auf Farmen
- Save/Load

---

## 12. Später-Liste (bewusst geparkt)

| Idee                     | Warum nicht jetzt                                              |
|--------------------------|----------------------------------------------------------------|
| Strom/Wasser-Upkeep      | Loop muss ohne funktionieren. Kommt als "Härte-Stufe" in v3.1  |
| Metadaten als Ressource  | Deine eigene Formulierung "später". Ist ein ganzes Sub-System. |
| KI-Labor                 | Hängt an Metadaten. Braucht seinen eigenen Design-Pass.        |
| Community-Center         | Braucht Trend-Events als Gegenstück, die selbst noch nicht da sind. |
| Techtree-Nodes           | Zuerst muss der Kern-Loop Spaß machen. Techtree macht guten Loop besser, kann keinen retten. |
| Investoren / Story       | Seit v2 geparkt. Kommt zurück wenn der Loop trägt.             |
| Programme auf Farmen     | Du warst selbst unsicher was sie tun sollen — Konzept unklar.  |
| Trend-Events (Shitstorm) | Reizvoll, aber Balance-intensiv. Nach dem Feel-Test.           |

---

## 13. Offene Fragen

Diese zwei Punkte will ich bewusst nicht allein entscheiden:

**Q1: Watchtime-Fluss — globales Lager oder direkt zur Werbeagentur "bringen"?**
Mein Vorschlag: globales Lager (siehe Sektion 5). Werbeagentur zieht automatisch. Weniger Klicks im Loop, saubere Skalierung wenn später mehrere Konvertierungs-Gebäude dazukommen. Alternative wäre: pro Farm eine "Fracht" ernten, die zur Werbeagentur getragen wird — sehr HayDay, aber verdreifacht die Klicks pro Zyklus.
auf jeden fall globales lager!

**Q2: Farm-Kauf-Ökonomie — wie teuer soll die zweite Farm sein?**
Wenn zu billig, verliert der Spieler das "Meine erste Farm ist voll — jetzt brauche ich Platz"-Erlebnis. Wenn zu teuer, blockt es Progression.
Vorschlag: zweite Farm bei 5.000 Gesamt-User verfügbar, kostet 8.000 € (etwa 10–15 Minuten Spielzeit). Wird beim Balancen justiert.  machen wir so balance kommt später.
 
---

## Wenn du das absegnest

Baue ich `v3/`-Ordner nach dem MVP-Scope aus Sektion 11. `v2/` bleibt zum Vergleich stehen, damit du beide Loops direkt gegeneinander spielen kannst.
