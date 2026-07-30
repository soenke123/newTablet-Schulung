# Startup Story — Design v3

Farm-Loop mit Watchtime als Zwischen-Ressource. Kein Ersatz für v2, sondern eine strukturelle Weiterentwicklung nach dem MVP-Test.

---

## 1. Kernidee — warum v3 ≠ v2

In v1 und v2 sind User eine abstrakte Zahl, und Geld tropft direkt aus einer "Werbe-Coin". Das fühlt sich schnell wie ein Zähler an, den man antippt.

v3 baut eine echte **Produktionskette** ein: Tiere leben sichtbar auf Farmen und produzieren **Watchtime** (Sanduhren-Sprudel). Die Werbeagentur **konvertiert** Watchtime in Geld — nicht als Magie, sondern als sichtbare Maschine. Das schafft zwei Sachen, die v2 fehlen:

1. **Etwas zu ernten** (Watchtime auf den Farmen)
2. **Etwas zu konvertieren** (Watchtime → Geld in der Werbeagentur)

Zusätzlich: **Ruf hat echte Konsequenzen**. Jede Konvertierung kostet Ruf — hoher Ruf bringt passive User dazu, niedriger vertreibt sie. Damit wird der Slider in der Werbeagentur eine echte Entscheidung, nicht eine Kosmetik.

Die HayDay-Zug ist bewusst: sichtbare Tiere, physische Ressourcen, tap-to-collect. Aber wir behalten strategische Tiefe an drei Stellen: Ruf-Trade-off, Marketing-vs-Passiv-Wachstum, Techtree-Wahl (später).

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
   │  gibt User)  │              │           │ automatisch
   └──────────────┘              │           ▼
                                 │    ┌──────────────┐
                                 │    │ WERBEAGENTUR │
                                 │    │ Slider 0–50% │
                                 │    │ Watchtime→€  │
                                 │    │ kostet Ruf   │
                                 │    └──────┬───────┘
                                 │           │
                                 │           │ Klick (ernten)
                                 │           ▼
                                 │    ┌──────────────┐
                                 └────┤   GELD       │
                                      └──────────────┘

   RUF wirkt passiv:
   > +5%  → langsam neue User (Zufriedenheit)
   < -10% → User wandern ab, Konvertierung schlechter
```

Das ist der komplette v3-MVP-Loop. Keine Feature-Timer, keine HQ-Module — die kommen erst mit dem Techtree in Phase 2.

---

## 3. Ressourcen-Übersicht

| Ressource     | Sichtbar wo?                | Ändert sich durch                                          |
|---------------|-----------------------------|------------------------------------------------------------|
| **Geld €**    | Ressourcen-Bar oben         | Werbeagentur-Ernte (+), Marketing-Kampagne (-), Farm-Kauf (-), Tier-Upgrade (-) |
| **User**      | Ressourcen-Bar oben (Summe aller Tiere) | Marketing-Kampagne (+), passives Wachstum bei hohem Ruf (+), Abwanderung bei niedrigem Ruf (-) |
| **Watchtime** | Ressourcen-Bar oben + Sprudel auf Tieren + Zahl auf Werbeagentur | Tiere produzieren (+), Werbeagentur verbraucht (-) |
| **Ruf**       | Ressourcen-Bar oben (in %)  | Werbeagentur-Slider konsumiert Ruf (-), Passiv-Regeneration wenn Slider niedrig (+) |

Watchtime und Ruf sind **die zwei neuen zentralen Ressourcen** gegenüber v2. Alles andere existierte schon.

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
- Der Spieler entscheidet frei, ob er die Werbeagentur laufen lässt (Ruf-kostend) oder Watchtime hortet.
- Weniger Klicks im Loop (kein "Watchtime zur Werbeagentur bringen"-Schritt).
- Techtree kann später andere Konvertierungen freischalten, die auch aus dem Lager ziehen.

Das ist **Offene Frage 1** aus dem Plan — hier als Vorschlag notiert.

---

## 6. Werbeagentur — die zentrale Konverter-Maschine

**Was sie tut:** Zieht Watchtime aus dem Lager und wandelt sie in Geld um. Läuft kontinuierlich, sobald freigeschaltet.

**Slider (0–50%):**
- Der Slider ist eigentlich **die Intensität** der Werbeauslieferung.
- Niedrig (10%) = wenig Geld pro Watchtime, wenig Ruf-Kosten.
- Hoch (50%) = viel Geld pro Watchtime, deutliche Ruf-Kosten.

**Konvertierungs-Formel (Vorschlag, zum Balancen):**

```
€ pro Watchtime = 0.01 × (1 + slider × 4)
   Beispiel bei slider = 10%: 0.01 × 1.4 = 0.014 €/Watchtime
   Beispiel bei slider = 50%: 0.01 × 3.0 = 0.03 €/Watchtime

Ruf-Kosten pro Sekunde = slider × 0.001
   Beispiel bei slider = 10%: -0.01 % Ruf/s
   Beispiel bei slider = 50%: -0.05 % Ruf/s
```

Die Formeln sind Startwerte — echte Balance kommt beim Spielen.

**Visualisierung des Geld-Aufbaus:**
- Auf der Werbeagentur türmt sich sichtbar eine kleine Geldstapel-Grafik (wie HayDay-Silo).
- Anzeige "247 € bereit" oder ähnlich.
- Klick auf die Werbeagentur → Geld fliegt in die Ressourcen-Bar mit Konfetti.

**Optional (nicht MVP):** Werbeagentur kann pausiert werden (kein Ruf-Verbrauch, kein Geld). Für MVP läuft sie einfach immer, wenn Watchtime da ist.

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

### 7.2 Passive Zufriedenheit (Ruf-getrieben)

Ohne aktives Zutun:
- Bei Ruf > +5% → alle 10 s +0.5% aktuelle User (langsame Compound-Wachstum durch "Mundpropaganda")
- Bei Ruf zwischen -10% und +5% → nix
- Bei Ruf < -10% → alle 10 s -0.3% aktuelle User (Abwanderung)

Das macht Ruf **spürbar**, nicht nur eine hübsche Zahl.

---

## 8. Ruf-Feedback-Loop

Ruf startet bei **0%**, Bereich **-30% bis +15%**.

| Ruf-Bereich    | Konsequenz                                                    |
|----------------|---------------------------------------------------------------|
| > +5%          | Passiv +0.5% User alle 10 s                                   |
| -10% bis +5%   | Neutral                                                       |
| < -10%         | Passiv -0.3% User alle 10 s; Werbeagentur-Ertrag -20%         |
| < -20%         | Zusätzlich: Marketing-Kampagnen 50% teurer                    |

**Wodurch steigt Ruf?**
- Wenn Werbeagentur-Slider auf 0 steht: +0.005% Ruf/s (langsame Regeneration).
- Wenn Slider auf > 0 steht: Ruf-Verbrauch schlägt Regeneration → Ruf sinkt netto.

**Wodurch sinkt Ruf?**
- Werbeagentur-Slider (siehe Formel oben).
- Später (Phase 2): Metadaten-Verkauf, aggressive Kampagnen, KI-Training auf User-Daten.

**Warum keine Ruf-Events im MVP?**
Events (Shitstorm/Viral) sind toll aber komplex — verzögern den Feel-Test. Kommen in v3.1 wenn der Loop steht.

---

## 9. Techtree — nur Kategorien, keine Nodes

Für den MVP **kein** Techtree. Aber die Kategorien, die später kommen:

- **Farm-Upgrades** — mehr Kapazität pro Farm, günstigere Tier-Upgrades, Wasser/Strom-Ausbau
- **Konvertierungs-Upgrades** — bessere €/Watchtime-Ratio, geringere Ruf-Kosten, alternative Konvertierungs-Wege (KI-Labor: Watchtime → Metadaten)
- **Marketing-Upgrades** — günstigere Kampagnen, neue Kampagnen-Typen, virale Multiplikatoren
- **Ruf-Werkzeuge** — Community-Center, PR-Abteilung, Krisen-Management

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
│  │  🐣🐣🐣 . . │  │  ▓▓▓░░ 30%  │          │  📢 Uni-Kampagne │
│  │  (3/5 voll) │  │  💰 247 €   │          │  ▓▓▓░░ 45s      │
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

- **Ressourcen-Bar** oben: User, Geld, Watchtime, Ruf
- **Grid** (Hauptbereich): Gebäude in Zellen. Leere Zellen mit `[ + ]` — klick öffnet Kauf-Modal (Farm-Stufe wählen, Werbeagentur, Marketing-Center, weitere je nach Freischaltung)
- **Farm-Klick** = Watchtime ernten (Konfetti). Doppel-Klick oder Info-Button = Farm-Details (Upgrade, Tiere kaufen)
- **Werbeagentur-Klick** = Geld ernten. Info-Button = Slider öffnen
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
- [x] Werbeagentur zieht automatisch aus Lager: Slider 0–50%, Ruf-Kosten, Watchtime→€-Konvertierung, sichtbarer Geldstapel, Klick-Ernte
- [x] Marketing-Center mit 3 Kampagnen (Kiez / Uni / Insta), läuft in Sidebar-Slot
- [x] Ruf-Feedback: Passiv-User bei hohem Ruf, Abwanderung bei niedrigem
- [x] Farm-Upgrade (ganze Farm eine Stufe hoch, wenn voll besetzt)
- [x] Neuer Grid-Slot kaufbar
- [x] Neue Farm auf leerem Slot kaufbar (Stufe wählen aus freigeschalteten)
- [x] Ressourcen-Bar mit allen 4 Ressourcen (User, Geld, Watchtime, Ruf)

**Nicht im MVP:**
- Techtree (nur Skizze der Kategorien vorhanden)
- Strom/Wasser-Upkeep
- Metadaten-Ressource
- KI-Labor, Community-Center
- Ruf-Events (Shitstorm/Viral)
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
| Community-Center         | Braucht Ruf-Events als Gegenstück, die selbst noch nicht da sind. |
| Techtree-Nodes           | Zuerst muss der Kern-Loop Spaß machen. Techtree macht guten Loop besser, kann keinen retten. |
| Investoren / Story       | Seit v2 geparkt. Kommt zurück wenn der Loop trägt.             |
| Programme auf Farmen     | Du warst selbst unsicher was sie tun sollen — Konzept unklar.  |
| Ruf-Events (Shitstorm)   | Reizvoll, aber Balance-intensiv. Nach dem Feel-Test.           |

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
