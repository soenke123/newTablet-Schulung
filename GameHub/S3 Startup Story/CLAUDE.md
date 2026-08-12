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
   │  Ziege…)     │                   └──────┬───────┘
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
   > 0  → alle 12 s stapelt sich ein Schub (max 5), Klick = User einsammeln
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

**Kapazität:** 8 Slots pro Farm (`FARM_CAPACITY_ANIMALS`, einheitlich für alle Stufen im MVP). **Die Tierart bestimmt damit direkt die Farm-Kapazität** — eine Kükenfarm fasst 4.000 User, eine Elefantenfarm 400 Mio.

**Tier-Stufen** (Stand `TIERS` / `TIER_UPGRADE_COST` in `js/state.js`; ×4–×10 Wachstum je Stufe):

Die drei rechten Spalten gehören zusammen: **Kosten = Δ × Kurs**. Δ ist der Kapazitätsgewinn des Upgrades aus dieser Zeile, nicht der Abstand zur Vorstufe.

| Icon | Tier    | User/Stück  | Farm-Kapazität (8×) | Δ beim Upgrade | Kurs | Upgrade auf nächste Stufe |
|------|---------|-------------|---------------------|----------------|------|---------------------------|
| 🐣   | Küken   | 500         | 4.000               | +12.000        | —    | **0 € — Investor**        |
| 🐔   | Huhn    | 2.000       | 16.000              | +64.000        | 0,50 | 32.000 €                  |
| 🦆   | Gans    | 10.000      | 80.000              | +320.000       | 0,50 | 160.000 €                 |
| 🐐   | Ziege   | 50.000      | 400.000             | +3.600.000     | 0,45 | 1.620.000 €               |
| 🐑   | Schaf   | 500.000     | 4.000.000           | +36.000.000    | 0,30 | 10.800.000 €              |
| 🐄   | Kuh     | 5.000.000   | 40.000.000          | +360.000.000   | 0,25 | 90.000.000 €              |
| 🐘   | Elefant | 50.000.000  | 400.000.000         | —              | —    | —                         |

Die Farm-Kapazität ist gleichzeitig die **Serverkapazität** (`serverCapacityTotal()`), aus der die Techtree-Nodes ihren `server`-Bedarf ziehen.

MVP: Icons/Emojis reichen. Sprites erstellst du parallel.

### Das Farm-Modal — zwei Karten

Gebaut aus denselben Ledger-Karten wie Werbeagentur, Marketing-Center und Techtree (`RT.ledger.card()`), damit „was kostet es, was bringt es" überall gleich aussieht.

1. **Belegung** — ein dreigeteilter Balken (User · Code · frei) mit den Zahlen darunter, rechts die Spalte *Produziert* (Watchtime/s, dazu der Multiplikator-Chip, sobald Watchtime-Nodes stehen). Darunter der Stapel-Fortschritt in Watchtime-Gelb und der Ernte-Knopf.
2. **Ausbau** — Kosten (€) über Ertrag (+Kapazität, +Watchtime/s bei voller Belegung), dazu die Zeile `16.000 → 80.000 Kapazität`. Höchststufe und der Investor-Sprung sind gesperrte Karten, keine grauen Textzeilen.

⚠️ **Die Tier-Metapher kommt im Modal nicht vor** — dort steht nur „Stufe N". Die acht Slots sind ebenfalls draußen: sie sind gerundete Grid-Deko (ein Tier steht je nach Stufe für 500 oder 50 Mio User), und das Modal ist genau der Ort, an dem die genaue Verteilung sichtbar sein soll.

**In Phase 0/1 bleibt nur der Balken.** Dort gibt es keine Sanduhr-Ökonomie (der Tick produziert erst ab Phase 2) und keinen Ausbau — die Farm ist reine Kapazität für User und Features. Produktions-Spalte, Stapel, Ernte-Knopf und die ganze Ausbau-Sektion fallen deshalb weg, statt eine stillstehende Maschine zu zeigen. Der einzige Ausbau, den es dort gäbe, ist Küken→Huhn, und der **ist** der Investor-Deal: ihn vorab als gesperrte Karte anzukündigen würde die Überraschung wegnehmen (dieselbe Regel wie bei der Go-Live-Karte in Sektion 10).

### Zwei Wachstumspfade (Spielerwahl):

**A) Farm hochstufen** — bestehende Farm inkl. aller Tiere eine Stufe höher.
- Beispiel: Kükenfarm mit 10 Küken (1.000 User) → Hühnerfarm mit 10 Hühnern (5.000 User)
- Kosten = **Kapazitätsgewinn × Kurs** (Tabelle oben), nicht Preis der Zielstufe
- Küken→Huhn ist der Investor-Deal und kostet nichts. Vor Phase 2 ist der Sprung gesperrt (`actions.upgradeFarm`), damit sich niemand sein Geschenk selbst nimmt.
- Voraussetzung: Farm ist voll besetzt (sonst upgraded man leere Slots mit)

**B) Neue Farm direkt kaufen** — Serverfarm auf einen freien Grid-Slot setzen.
- Ab Phase 2 für **5.000 €** (`FARM_COST_PHASE2`), startet immer als Huhn = 16.000 Kapazität.
- Höhere Stufen direkt zu kaufen ist **noch nicht drin** und bleibt vorerst so.
- Neue Slots im Grid freischalten (siehe Grid-Sektion) kostet extra: 12.931 € für die vier Felder des ersten gekauften Farmplatzes, danach steigend. Die ersten vier Farmen stehen in der Freizone und kosten kein Land.

### Warum Breite und Höhe nicht denselben Kurs haben

Ein Upgrade liefert die **Differenz** zur nächsten Stufe (Huhn→Gans = +64.000), eine neue Hühnerfarm dagegen ihre **vollen** 16.000. Bei gleichem €/Kapazität-Kurs wäre Upgraden also automatisch viermal so effizient — genau das war der Zustand vor dem Balance-Pass (Upgrade 47 €/1.000 Kapazität gegen 625 € für die neue Farm, mit Land sogar 3.313 €).

Deshalb liegt der Landpreis dazwischen, statt gleichzuziehen:

| | Kosten am Stück | Kapazität | €/Kapazität | vs. Upgrade |
|---|---|---|---|---|
| Freizone-Farm (1.–4.) | 5.000 € | +16.000 | **0,31 €** | 1,6× **besser** (gegen Huhn→Gans) |
| Neue Farm, Farmplatz 1 | 5.000 € + 12.931 € Land | +16.000 | 1,12 € | 2,2× schlechter |
| Neue Farm, Farmplatz 3 | 5.000 € + 40.589 € Land | +16.000 | 2,85 € | 5,7× schlechter |
| Neue Farm, Farmplatz 5 | 5.000 € + 314.376 € Land | +16.000 | 19,96 € | 39,9× schlechter |
| Upgrade Huhn→Gans | 32.000 € | +64.000 | 0,50 € | — |

**Die vielen Farmen kommen aus der Freizone, nicht aus billigem Land.** Solange dort Platz ist, ist Breite der mit Abstand beste Kurs im Spiel (0,31 €/Kapazität) — und die kleine Portion passt zu einem Konto, das noch nichts hergibt. Danach kippt es: schon der erste gekaufte Farmplatz liegt über dem Upgrade-Kurs, ab Farmplatz 3 (= 7. Farm) ist Höhe eindeutig die bessere Wahl, und ab Farmplatz 5 ist Breite keine Option mehr.

Das Upgrade kostet am Stück trotzdem das **1,8-fache** des ersten gekauften Farmplatzes und setzt eine **volle** Farm voraus. Breite bleibt deshalb der Notnagel, wenn Geld knapp ist oder keine Farm voll ist — sie wird nur nie mehr die effiziente Option.

**Der Kurs flacht nach oben ab** (0,50 → 0,16), damit Konsolidierung im Spätspiel lohnt — bei 20 Farmen wird das Ernten sonst zur Arbeit. Beim Elefanten ist Höhe dadurch **1,95× effizienter** als eine Freizone-Farm.

⚠️ **Schaf und Kuh sind am 2026-08-07 gesenkt worden** (0,40 → 0,30 und 0,35 → 0,16; 14,4 Mio → 10,8 Mio € und 126 Mio → 57,6 Mio €), weil die beiden obersten Sprünge sich zu teuer gespielt haben. Vorher lag der **ganze** Kurs über der Freizone-Zeile — Breite war auf jeder Stufe der bessere Kurs, und die Abflachung nach oben war folgenlos: „Konsolidierung lohnt im Spätspiel" stand im Text, aber nicht in den Zahlen. Jetzt kippt es beim Schaf (Gleichstand, 1,04×) und ist beim Elefanten eindeutig.

⚠️ **Nachkorrektur am selben Tag: Kuh 0,16 → 0,25** (57,6 → 90 Mio €). Die Senkung war zu weit gegangen, die Elefantenfarm spielte sich geschenkt. 1,95× hieß, dass Breite auf der obersten Stufe schlicht keine Option mehr war; bei **1,25×** lohnt Konsolidierung weiter deutlich, ohne alternativlos zu sein. Dazu kommt seit den Serverkosten (unten) eine zweite, laufende Bremse: ein Elefanten-Upgrade verzehnfacht die Kapazität sofort — die Betriebskosten damit auch, während die Farm erst einmal fast leer steht.

⚠️ **Nach unten ist bei ~0,16 Schluss.** Darunter wäre Höhe mehr als doppelt so gut wie Breite, und die Freizone-Farm — der Einstieg in Phase 2 — würde zur Fehlinvestition.

⚠️ **Die alte Regel „nie mehr als Faktor 2 zwischen Breite und Höhe" gilt jetzt nur noch für die Freizone und den ersten gekauften Farmplatz.** Ab dort ist der Abstand bewusst offen, weil er über den Landpreis läuft und nicht über den Tier-Kurs. Wer `TIER_UPGRADE_COST` anfasst, muss deshalb gegen die **Freizone**-Zeile prüfen (0,31 €/Kap) — gegen die gekauften Plätze zu prüfen erlaubt beliebig teure Upgrades.

⚠️ **Sobald Weg B höhere Stufen anbietet, braucht `TIER_UPGRADE_COST` wieder einen Aufschlag.** Eine neue Gans-Farm gäbe volle 80.000 Kapazität; gegen 160.000 € fürs Upgrade auf dieselbe Stufe wäre das Upgrade dann tot.

### Grid — worauf die Farmen stehen

Alle Gebäude (Serverfarmen, Werbeagentur, Marketing-Center, Bürogebäude) stehen auf einem **Grid**, das mitwächst.

- **Start-Freizone**: 3×3 in Phase 0/1, ab Phase 2 **5×4** (`gridSizeEffective()` liefert `freeCols`/`freeRows` getrennt). Diese Felder gehören von Anfang an und werden nicht bezahlt.
- **Ausbaufläche**: ab Phase 2 liegt ein Kranz von 8 Reihen in jede Richtung drumherum (Render-Range Spalten −8…12, Zeilen −8…11).
- **Layout wächst in alle Richtungen**, die Kamera pannt/zoomt frei.

**Warum die Freizone rechteckig ist.** Werbeagentur, Marketing-Center und Bürogebäude sind 1×1 und werden mehrfach gebaut — bei 4×4 fraß schon ein zweites Marketing-Center einen halben Farmplatz. Die 20 Felder tragen genau: HQ (fest auf 0,0) + zwei Service-Gebäude + **vier Serverfarmen** + ein Reservefeld. Erst die **5. Farm** kostet Land. Das ist die Frühspiel-Luft, die den steileren Landpreis trägt.

⚠️ **Das Reservefeld ist seit dem Bürogebäude verplant.** Das erste Büro passt noch hinein, jedes weitere geht auf Kosten eines Farmplatzes oder kostet Land. Damit steht neben dem Preis (Sektion 9) eine zweite, weichere Bremse auf breiter Parallelisierung — die aber auch bedeutet, dass ein büro-lastiger Spielstil den Farm-Ausbau früher ins gekaufte Land drängt.

Das Grid ist selbst ein sichtbares Fortschritts-Signal ("mein Konzern wächst").

#### Felder einzeln kaufen

Erweitert wird **Feld für Feld**, nicht in Ringen oder Reihen:

- Kaufbar ist jedes Feld, das **rechtwinklig** (nicht diagonal) an eigenes Gelände grenzt — `isTilePurchasable()`. Es trägt eine goldene Kontur und eine „+"-Plakette.
- Klick öffnet eine Kauf-Nachfrage mit dem Preis; Abbrechen ist immer möglich.
- Jeder Kauf legt neue Nachbarn frei, das Gelände wächst also in beliebiger Form. Der Kranz ist die harte Obergrenze.
- Eine 2×2-Serverfarm braucht **alle vier** Felder — `canPlace()` prüft jedes einzeln.

**Preiskurve** (`tileCost(n)` in `js/state.js`, n = wievieltes gekauftes Feld):

| Feld | Steigerung je Feld | Preis | Kumuliert |
|------|--------------------|-------|-----------|
| 1 | — | 3.000 € | 3.000 € |
| 2–5 | +5 % | bis 3.647 € | 16.578 € |
| 6–15 | **+20 %** | bis 22.578 € | 130.167 € |
| ab 16 | **+40 %** | 20. Feld: 121.431 € · 24. Feld: 466.491 € | 476.153 € / 1.683.862 € |

Daraus die Kosten je Farmplatz (4 Felder), inklusive der 5.000 € für die Farm selbst:

| Farmplatz | = Farm Nr. | Land | gesamt | €/Kapazität | vs. Upgrade |
|---|---|---|---|---|---|
| 1. | 5. | 12.931 € | 17.931 € | 1,12 € | 2,2× |
| 2. | 6. | 19.575 € | 24.575 € | 1,54 € | 3,1× |
| 3. | 7. | 40.589 € | 45.589 € | 2,85 € | 5,7× |
| 4. | 8. | 88.682 € | 93.682 € | 5,86 € | 11,7× |
| 5. | 9. | 314.376 € | 319.376 € | 19,96 € | 39,9× |
| 6. | 10. | 1.207.709 € | 1.212.709 € | 75,79 € | 151,6× |

⚠️ **Die Kurve ist am 2026-08-11 deutlich steiler geworden** (vorher +5/+10/+25/+35 % mit Zonengrenzen bei 10/20/30). Als Bremse war sie folgenlos: zwanzig Felder kosteten zusammen 119.322 €, und obwohl ab Farm 8 Höhe die klar bessere Wahl sein *sollte*, war Breite bei 2,11 €/Kapazität weiter bequem bezahlbar. Der Umschlagpunkt liegt jetzt da, wo er hingehört — ab Farmplatz 3 (5,7×) ist Breite eine bewusste Notlösung, ab Farmplatz 5 (39,9×) eine Fehlinvestition.

**Die Basis muss deutlich unter dem Farmpreis liegen**, weil eine 2×2-Farm vier Felder braucht — das Land ist also der vierfache Posten. Bei den früheren 10.000 € kostete der Boden unter einer 5.000-€-Farm 43.100 €, damit war Breite nie eine echte Option. Bei 3.000 € sind es 12.931 €, gut zweieinhalb Farmpreise.

**Die ersten fünf Felder sind bewusst flach und tragen nur wegen der Basis.** Vier Felder zu +5 % heben den Preis über die ganze Zone nur um Faktor 1,22 — als Kurvenform ist das nichts. Es funktioniert hier trotzdem, weil 3.000–3.647 € je Feld absolut spürbar sind und der Spieler in dieser Zone gerade erst aus der Freizone kommt. **Die Zone deckt genau den ersten gekauften Farmplatz plus ein Feld ab** — also den Preis, den Phase 2 wirklich zahlt. ⚠️ Wer die Basis senkt, muss die Stufe mitziehen: bei den alten 1.500 € war genau diese Zone der Grund, warum Land sich wie geschenkt anfühlte.

**Ab Feld 16 wird Fläche zum eigenen Kostenfaktor.** Die Zonen +20 % / +40 % verdoppeln den Preis alle 3,8 bzw. 2,1 Felder. Das ist der Maßstab, an dem sie hängen: jeder Einkommenssprung im Spiel — Banner→Feed, Feed→Video, jede Tier-Stufe — ist ×4 bis ×4,4 und kostet **einen** Techtree-Node bzw. **ein** Upgrade. Ab Feld 16 kostet derselbe Faktor rund einen Farmplatz, Land und Einkommen laufen also im gleichen Takt. In der +5 %-Zone bräuchte er 30 Felder — die es dort gar nicht gibt.

Gekaufte Felder liegen als `"col,row"`-Schlüssel in `state.current.ownedTiles`; die **Länge des Arrays ist gleichzeitig der Preis-Zähler**. Alte Spielstände bekommen ein leeres Array (`storage.migrate()`).

⚠️ Weil die Länge der Preis-Zähler ist, räumt `storage.migrate()` Felder aus dem Array, die durch das Wachsen der Freizone (4×4 → 5×4) geschenkt wurden. Sonst zahlte ein alter Spielstand dauerhaft Aufschlag für Land, das er inzwischen umsonst bekommt — und sichtbar wäre der Fehler nicht, weil `isTileOwned()` die Freizone zuerst prüft. **Dieselbe Bereinigung braucht jede weitere Vergrößerung der Freizone.**

### Serverkosten — Strom, Wasser und Wartung

Der einzige **laufende** Kostenposten im Spiel, ab Phase 2. Er hängt an der **gesamten Serverkapazität** — egal ob dort User, Code, Modelle oder gar nichts liegen. Alles, was als Serverfarm dasteht, will gekühlt, gesichert und gewartet werden. Damit kostet Vorbauen zum ersten Mal etwas.

**Die Tarifstufe kommt aus der Summe aller Farmen, bezahlt wird je Farm nach ihrer eigenen Kapazität.** Eine kleine Farm in einem großen Konzern zahlt also den großen Satz — genau die Aussage, um die es geht: bei großen Anlagen skalieren Backups und Kühlung anders.

| Stufe | bis | Tarif je 1.000 Kapazität | €/Watchtime | Anteil am Feed @25 % | am Banner @25 % |
|---|---|---|---|---|---|
| **Tiny** | 100 k | 15 | 0,0006 | 0,3 % | 0,8 % |
| **Low** | 500 k | 75 | 0,0030 | 1,5 % | 4 % |
| **Mid** | 50 Mio | 200 | 0,0080 | 4 % | 11 % |
| **High** | 500 Mio | 500 | 0,0200 | 10 % | 27 % |
| **Massiv** | darüber | 1.000 | 0,0400 | **20 %** | **53 %** |

Umrechnung: eine Zahlung deckt `SERVER_UPKEEP_CYCLES` = 25 Produktionszyklen, 1.000 Kapazität produzieren je Zyklus 1.000 Watchtime — also `€/wt = Tarif / (Einheit × Zyklen)`.

**Bezahlt und verbraucht wird je produziertem Zyklus, nicht je Sekunde.** Eine Farm mit vollem Stapel produziert nicht und kostet auch nichts. Das macht die Serverkosten zum *Preis für Watchtime* statt zu einer Uhr, die auch über Nacht tickt — und es ist der Grund, warum der Offline-Aufholpass höchstens die Zyklen abrechnet, die er selbst produziert hat — also die des `OFFLINE_CATCHUP_SEC`-Fensters, gedeckelt auf `serverUpkeepCrawlAt()` (§8). Eine rückwirkende Rechnung über acht Stunden wäre die Strafe fürs Wiederkommen.

⚠️ **Gezählt werden Stapel UND Überschuss**, nicht nur der Stapel. Sonst wäre die offline automatisch geerntete Watchtime gratis erzeugt — und damit ausgerechnet die Menge, die den Rückkomm-Effekt trägt, der einzige Posten im Spiel ohne Betriebskosten.

**Ablauf:** Nach 25 Zyklen erscheint das 🔌-Symbol an der Farm und sie läuft **halb so schnell**. Nach weiteren 5 Zyklen geht sie auf **Sparflamme** (20 %). Ein Klick auf das Symbol setzt sie auf 0 zurück; bezahlt wird **anteilig** nach verbrauchten Zyklen.

⚠️ **20 % und nicht 0 (Stillstand).** Drei Gründe: eine pleite gegangene Plattform hätte sonst keinen Weg zurück; nach einer Nacht stünde alles still statt auf Sparflamme; und es bleibt bei jedem Tarif richtig zu zahlen — sparen bringt höchstens 20 % und kostet 80 % der Produktion. **Es gibt keinen Betriebspunkt, an dem Nichtzahlen sich lohnt**, und das soll so sein: die Entscheidung liegt vorgelagert bei „wie viel Kapazität baue ich".

⚠️ **Die Spreizung ×67 ist der Balance-Wert, nicht die Einzelzahl.** Sie leistet zwei Dinge:

- Der **Phase-2-Start** (1 Huhn-Farm, 16.000 Kap.) zahlt 240 € je Zahlung, also ~1 % des Banner-Einkommens. Das muss so bleiben: Phase 2 beginnt **ohne** Werbeagentur (§6), ein spürbarer Tarif wäre dort ein Soft-Lock.
- **Banner** wird nach oben unwirtschaftlich, statt weggenerft zu werden — bei Massiv frisst der Betrieb die Hälfte seines eigenen Ertrags.

⚠️ **Die Watchtime-Nodes bekommen dadurch ein zweites Standbein**: der Betriebspreis hängt an der Kapazität, der Ertrag an der Watchtime — ×2 Watchtime heißt **halber Betriebspreis je Watchtime**. Die Achse, die ihre Existenzberechtigung dreimal neu begründen musste (§9), hat jetzt eine, die nicht wegbalanciert werden kann.

⚠️ **Die Tarife sind flach, nicht gestaffelt.** Bei 500.001 Kapazität zahlt *alles* den Mid-Satz. Das ist eine Kante, aber sie liegt in jeder Stufe bei ~1–3 % des Einkommens, und Kapazität kommt in großen Brocken (eine Elefanten-Farm sind 400 Mio auf einmal) — man trifft die Grenze nie als Grenzentscheidung. Die UI muss den nächsten Sprung trotzdem ankündigen.

**Sichtbar** ist die Stufe als Knopf im Serverkapazitäts-Panel („🔌 Mid"); ein Klick öffnet die Aufschlüsselung aller fünf Stufen samt der nächsten Grenze. Unversorgte Farmen sind am Gebäude zu erkennen: gedrosselt fahl, auf Sparflamme grau und ohne Bewegung.

**Der Trend-Malus** dazu steht in §8 („Serverprobleme").

### Das Strom- & Wasserwerk (Phase 3)

Ab `en_zentral` im Shop, 40.000 €, einmal pro Plattform. Es produziert nichts — es bündelt den Versorgungs-Klick **aller Farmen ab Stufe 5** (Schaf, Kuh, Elefant) auf einen Knopf. Farmen unter Stufe 5 bleiben Handarbeit.

Das ist kein Versehen, sondern der **Konsolidierungs-Anreiz**: wer zwölf Huhn-Farmen behält, klickt sie bis zum Schluss einzeln. Höhe kauft Klickruhe, Breite bezahlt sie — die Achse aus „Zwei Wachstumspfade" bekommt damit ein Spätspiel-Argument, das nicht am Preis hängt.

⚠️ **Es ist ein Service-Gebäude, kein Entscheidungs-Gebäude.** Kein eigenes Modal, keine eigene Ökonomie; die Wahl steckt in den drei Nodes (§9). Ein zweites Phase-3-Gebäude mit voller Modal-Ökonomie neben dem KI-Labor wäre Umfang, den das Zeitbudget der Phase nicht hergibt.

⚠️ **Der Sammelklick rechnet anteilig ab** — ohne das wäre jedes frühe Drücken eine Strafe, und man würde warten, bis alle Farmen leer sind, also genau die Klick-Last erzeugen, die das Gebäude abschaffen soll.

⚠️ **Der Sammel-Button erscheint erst, wenn es sich lohnt** (geändert 2026-08-09). Vorher wurde er sichtbar, sobald irgendeine abgedeckte Farm auch nur einen Zyklus gelaufen war — praktisch alle 8 Sekunden ein neuer Klick-Wunsch für ein paar Cent. Jetzt zeigt er sich erst, wenn mindestens eine abgedeckte Farm wirklich fällig ist **oder** seit `ENERGY_PLANT_ALERT_CYCLES` = 20 Zyklen wartet (`farmsNeedingUpkeepAlert()`). Abgerechnet wird beim Klick weiterhin **alles**, was angefallen ist — die Schwelle ändert nur, wann der Knopf auftaucht, nicht was er kostet.

⚠️ **Der einzelne 🔌-Knopf an der Farm bleibt als Notausgang** (geändert 2026-08-09, ersetzt die frühere Regel „Farmen, die das Werk übernimmt, verlieren ihren eigenen Knopf"). Der Sammelklick ist **alles oder nichts**: reicht das Geld nicht für sämtliche abgedeckten Farmen zusammen, bleibt jede von ihnen unversorgt — auch die, die man sich einzeln locker leisten könnte. Bei knapper Kasse rettet der Knopf an der einzelnen Farm genau diese eine vor der Drosselung, ohne dass man auf den vollen Betrag aller Farmen sparen muss. Der Sammelklick bleibt trotzdem der bequeme Normalweg, sobald genug Geld da ist — beide Knöpfe rechnen dieselbe Rechnung, nur der eine für eine Farm und der andere für alle.

---

## 5. Watchtime-Produktion & Ernte

**Produktion:**
- Jedes Tier produziert **1 Watchtime pro User pro 8 Sekunden** (`WATCHTIME_CYCLE_SEC`), also 0,125 Watchtime je User und Sekunde.
- Beispiel: Kükenfarm mit 3 Küken (1.500 User) = 1.500 Watchtime alle 8 s = 187,5 Watchtime/s. Voll besetzt (8 Küken = 4.000 User) = 500 Watchtime/s. Eine volle Huhn-Farm (16.000 User) macht 2.000 Watchtime/s.
- **Der Zyklus ist der zentrale Balance-Knopf der Angebotsseite.** Er stand anfangs bei 5 s; das war zusammen mit den damaligen Deal-Preisen so ergiebig, dass Watchtime nie knapp wurde. Die Nachfrageseite dazu steht in Sektion 6 — beide Werte gehören zusammen und dürfen nicht einzeln verstellt werden.

**Stack-Limit:**
- Pro Tier stacken bis zu **5 Zyklen** (= 40 Sekunden Produktion). Danach steht die Produktion still, bis geerntet wird.
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

**Was sie tut:** Der Spieler bucht einen **Werbedeal** — eine Werbeart plus eine Intensität. Der Deal läuft `AD_CYCLES_MAX` = 5 Zyklen. Jeder Zyklus wird **vorab** mit Watchtime bezahlt und wirft nach Ablauf seiner Dauer Geld ab, das sich auf der Agentur stapelt und eingesammelt werden will.

Der frühere Dauer-Slider ist damit weg: eine idle Agentur kostet keinen Trend, und der Loop pulsiert — buchen → Trend sackt → Deal endet → Trend erholt sich.

### Dauerbetrieb — der Puls ist abschaltbar

Ein dritter Schalter im Buchungs-Modal (`deal.autoRenew`, **Vorgabe an**) lässt den Deal nach dem letzten Zyklus wieder bei 1 beginnen, statt zu enden. Er läuft dann, bis die Watchtime nicht mehr reicht oder der Spieler abbricht; der Trend-Malus liegt durchgehend an.

Er ist am 2026-08-06 dazugekommen, weil zwei gemessene Probleme dieselbe Ursache hatten:

1. **Die Anteils-Stufe kam nie ins Gleichgewicht.** Ein anteiliger Deal pendelt sich erst bei `Produktion × Zyklusdauer / Anteil` ein. Einschwingzeit gegen Deal-Länge: Feed 2.000 s vs. 100 s (**5 %**), Search 1.200 s vs. 300 s (25 %), Video 313 s vs. 125 s (40 %). Der Deal war jedes Mal vorbei, bevor der Anteil die Produktion überhaupt abnehmen konnte — die Watchtime stapelte sich, obwohl `wb_adserver` längst stand. Gemessen bei 1 Mio Usern über 30 min, eine Agentur mit Video auf „Anteil": **ohne** Dauerbetrieb 82 Mio Lager und 503.000 € Ertrag, **mit** Dauerbetrieb 10,7 Mio € — Faktor 21.
2. **Klick-Last.** Bei ~1 Mio Usern (3 Farmen, 6 Agenturen, 3 Kampagnenplätze) lag sie bei 14,9 Klicks/min, davon 2,9 allein fürs Nachbuchen der Deals.

⚠️ **Der Dauerbetrieb macht wenige Agenturen strikt besser als viele** — und das ist keine Nebenwirkung, sondern die Eigenschaft aus „Die Stufe ist kein Machtregler" (unten), die vorher nicht zum Tragen kam. Gemessen, 30 min ab 1 Mio Usern, Video @25 % auf „Anteil", drei Kampagnenplätze:

| Agenturen | Netto-Trend | User nach 30 min | Geld |
|---|---|---|---|
| **1** | **+4,3** | **15,9×** (Kapazitätsdeckel) | 526 Mio € |
| 2 | +3,7 | 15,9× (Kapazitätsdeckel) | 546 Mio € |
| 4 | +2,5 | 15,9× (langsamer) | 355 Mio € |
| 6 | +1,3 | 4,1× | 138 Mio € |
| 10 | −1,1 | **0,13×** — Plattform stirbt | 27 Mio € |

Eine zweite Agentur bringt auf der Anteils-Stufe kaum mehr Geld (das Einkommen hängt an der Produktion, nicht an der Zahl der Deals), kostet aber vollen zusätzlichen Trend. **Ab ~6 Agenturen kippt die Plattform ins Minus.** Das ist die wichtigste Botschaft an den Spieler, und sie steht heute nirgends im UI.

⚠️ **Der Offline-Aufholpass braucht seitdem eine ausdrückliche Obergrenze** (`offlineCatchUp`). Vorher ergab sie sich von selbst — ein Deal war nach fünf Zyklen zu Ende. Ein `autoRenew`-Deal hat dieses natürliche Ende nicht; über acht Stunden wären das ~2.900 Video-Zyklen. Die Grenze ist heute das Offline-Fenster, mindestens aber `AD_CYCLES_MAX` Zyklen: `max(AD_CYCLES_MAX, ceil(OFFLINE_CATCHUP_SEC / duration))`. Banner (10 s) kommt damit auf 12 Zyklen, Video (25 s) auf 5 — ohne das Minimum stünde ausgerechnet die Werbeart mit den längsten Zyklen schlechter da als vor der Umstellung. Zusätzlich wird die Rest-Zeit auf einen angefangenen Zyklus gekappt, sonst setzt der erste Live-Tick den übrigen Zeit-Puffer sofort in weitere Zyklen um.

**Die erste Werbeagentur kauft der Spieler selbst** — 15.000 € im Shop, ab Phase 2. Sie gehört bewusst **nicht** zum Investor-Deal: Phase 2 beginnt damit, dass Watchtime da ist und noch nichts sie in Geld verwandelt. Der Debug-Seed (Phase-2-Sprung) stellt genau diese Belegung her — HQ + eine Huhn-Farm, keine Agentur.

⚠️ **Marketing-Center und Bürogebäude sind gesperrt, bis sie steht** (`RT.state.buildingLocked()`, 2026-08-12). Das ist die einzige harte Kaufsperre im Spiel, und sie schließt die einzige **Sackgasse**: die 50.000 € vom Investor reichen für drei der vier Gebäude, aber Marketing und Büro produzieren nichts. Wer sie zuerst kauft, hat kein Einkommen mehr, kann sich die 15.000 € für die Agentur nie wieder erarbeiten — und im Gegensatz zu jedem anderen Fehlkauf hilft auch Warten nicht.

Drei Signale, aus derselben Bedingung (`RT.state.hasAgency()`), alle **selbsträumend** — kein `seenBadges`-Feld, keine Migration:

| Wo | Was |
|---|---|
| Shop-Knopf | der gelbe „!" kommt in Phase 2 zurück, bis eine Agentur steht |
| Shop-Liste | Werbeagentur rückt auf Platz 1, trägt denselben „!" und den Hinweis „Dein nächster Schritt"; die anderen beiden sind blass mit „Erst 📢 Werbeagentur" auf dem Knopf |
| Phase-2-Tour | Karte 4 markiert die Agentur mit „zuerst" und sagt, dass sie die beiden anderen freischaltet |

⚠️ **Die Serverfarm bleibt frei kaufbar, und die Grid-Felder auch.** Beides ist die kleine Portion (5.000 € / 3.000 €) und nie die Ursache der Sackgasse; eine Sperre dort wäre Bevormundung statt Rettung.

⚠️ **Die Sperre steht in `actions.placeBuilding()`, nicht nur am Shop-Knopf** — der Placement-Modus ist ein zweiter Weg zu derselben Aktion, und der Knopf ist bereits die Anzeige, nicht die Regel.

### Die vier Werbearten

Definiert in `AD_TYPES` (`js/state.js`). **Nur Banner ist von Anfang an buchbar** — die anderen drei schaltet der Werbung-Reiter im Techtree frei (`unlockedBy`, siehe Sektion 9).

| Art | Icon | Freischaltung | Watchtime / Zyklus | Dauer / Zyklus | € @ 50 % | Trend @ 50 % |
|-----|------|---------------|--------------------|----------------|----------|--------------|
| **Banner** | 🪧 | von Anfang an | 15.000 | 10 s | 2.250 € | −5,0 |
| **Feed-Werbung** | 📰 | `wb_display` | 50.000 | 20 s | 20.000 € | −1,5 |
| **Search-Ad** | 🔍 | `wb_search` | 250.000 | 60 s | 75.000 € | −1,0 |
| **Werbevideo** | 🎬 | `wb_video` | 400.000 | 25 s | 100.000 € | −2,5 |

Daraus abgeleitet:

| Art | €/Watchtime | €/s | Watchtime-Bedarf | User für Dauerbetrieb | Ganzer Deal (5 Zyklen) |
|-----|-------------|-----|------------------|-----------------------|------------------------|
| Banner | 0,150 | 225 €/s | 1.500 wt/s | 12.000 | 75.000 wt · 50 s · 11.250 € |
| Feed | **0,400** | 1.000 €/s | 2.500 wt/s | 20.000 | 250.000 wt · 100 s · 100.000 € |
| Search | 0,300 | 1.250 €/s | 4.167 wt/s | 33.333 | 1.250.000 wt · 300 s · 375.000 € |
| Video | 0,250 | **4.000 €/s** | 16.000 wt/s | 128.000 | 2.000.000 wt · 125 s · 500.000 € |

⚠️ **Die €-Werte sind abgeleitet, nicht frei gewählt: `eur50 = watchtime × Kurs`** (0,15 / 0,40 / 0,30 / 0,25 €/wt). Wer eine Watchtime-Zahl anfasst, muss `eur50` mitziehen — sonst kippt die Rangfolge, ohne dass es jemand merkt.

Die Spalte **User für Dauerbetrieb** ist die eigentliche Freischaltschranke: so viele User braucht die Plattform, damit die Farmen den Deal ohne Vorrat durchhalten (bei 0,125 wt/s je User). Wer weniger hat, kann trotzdem buchen — muss dann aber vorher Watchtime bunkern und riskiert den Abbruch. Gemessen an der Huhn-Farm (16.000 User) ergibt das eine saubere Ausbau-Leiter: Banner läuft auf einer Farm, Feed ab gut einer, Search ab zwei, Video ab acht — spätestens dort lohnt der Aufstieg auf Gans statt Breite.

**Die Leitachse ist €/Watchtime gegen €/Sekunde: wer sein Geld schnell will, bezahlt das in Watchtime.** Genau darum ist Video nicht einfach „Feed, nur größer".

- **Banner** — **auf beiden Achsen der schlechteste** und trotzdem der Einstieg, weil es zu Beginn nichts anderes gibt. Feed holt aus derselben Watchtime das 2,7-fache heraus, und je Euro kostet Banner rund **30× so viel Trend**. Der Starter, den man wegwirft, sobald `wb_display` steht.
- **Feed** — bestes €/Watchtime **und** mit 2.500 wt/s der günstigste Einstieg der drei großen Arten. Das Arbeitspferd, solange die Farmen der Engpass sind.
- **Search** — **dreimal so lange Zyklen**, geringster Trend-Malus, und sogar etwas mehr Geld je Sekunde als Feed. Bezahlt wird das mit 1,7× Watchtime je Sekunde. Ein Deal läuft 5 Minuten durch, also ein Fünftel der Klicks — die Wahl, wenn der Trend drückt und man nicht am Bildschirm kleben will.
- **Video** — **vierfaches Tempo beim Geld** (4.000 €/s), bezahlt mit 6,4-fachem Watchtime-Hunger und mehr Trend-Malus als Feed. Je Euro ist es trotzdem deutlich trend-schonender — der Malus wächst um Faktor 1,7, der Ertrag um 4. Der Deal fürs Spätspiel, und die einzige Werbeart, die große Farmen wirklich leerzieht.

**Trend-Effizienz (€ je Trend-Sekunde, bei 25 % Intensität):** Video 2.344 ≈ Search 2.230 ≫ Feed 957 ≫ Banner 40. Auf ein **laufendes Trend-Budget** gerechnet dreht sich das um — dort zieht Video vorbei (3.200 gegen 2.500 €/s je Trend-Punkt), weil diese Rechnung den Abkling-Schwanz nicht enthält. Zwischen den beiden entscheidet also nicht „besser/schlechter", sondern ob Watchtime oder Zeit knapper ist. Das ist der eigentliche Reiz der beiden späten Arten.

⚠️ Der Abstand Search/Video war vor der Decay-Halbierung (0,01 → 0,005) praktisch null (2.190 ≈ 2.148). Video hat den 2,5-fachen Malus-Wert und damit den quadratisch längeren Schwanz, verliert beim langsameren Abklingen also mehr. Wer das wieder gleichziehen will, dreht an `trend50` von Video — nicht am Decay, der hängt am Spieltempo (Sektion 8).

### Warum das Ertrags-Niveau so hoch ist — und wo es trotzdem endet

Der Trend-Malus ist **prozentual** (kostet bei 1 Mio Usern 1000× so viele User wie bei 1.000), der Ertrag eine **feste Zahl**. Jede Werbeart hat dadurch eine User-Obergrenze, ab der ein Deal mehr User kostet, als der Ertrag über Marketing-Kampagnen zurückkaufen kann (Rechnung mit dem besten Kampagnen-Kurs — Stadtaktion, 0,30 €/User):

Der Verlust ergibt sich aus den Trend-Sekunden `S` eines Deals als `1 − e^(−S / (100 · TREND_CYCLE_SEC))`. Stand: Zyklus 12 s, `AD_TREND_EXPONENT` 3, Malus-Decay 0,02 (viermal schneller als positive, siehe §8).

| Art | Verlust @25 % | Breakeven @25 % | Verlust @50 % | Breakeven @50 % |
|-----|---------------|-----------------|---------------|-----------------|
| Banner | 10,9 % | ~172.000 User | 93,6 % | ~40.000 User |
| Feed | 4,3 % | ~3,9 Mio | 40,1 % | ~831.000 User |
| Search | 6,8 % | ~9,2 Mio | 46,9 % | ~2,7 Mio |
| Video | 8,5 % | ~9,8 Mio | 68,9 % | ~2,4 Mio |

Die Schwellen hängen direkt am Kampagnen-Kurs: wird Reichweite billiger, werden Werbedeals länger tragfähig. Der Sprung von 0,50 auf 0,30 €/User hat sie um Faktor 1,7 nach oben geschoben.

⚠️ Die Zahlen sind ein **Worst-Case-Bezugspunkt**, keine Vorhersage: sie rechnen den Deal so, als liefe er gegen einen Trend von 0. Im Spiel steht meist ein Node-Bonus dagegen, und nur der **Netto**-Trend entscheidet über Abwanderung.

Drei Dinge liest man daraus ab:

1. **25 % ist der Arbeitspunkt, 50 % die Ausnahme** — und seit `AD_TREND_EXPONENT` = 3 ist das keine Empfehlung mehr, sondern eine Wand. Der Malus am Maximum hat sich verdoppelt, während 25 % unverändert blieb; die Breakevens bei 50 % sind dadurch um Faktor 4–6,5 eingebrochen. Dauerbetrieb auf Anschlag ist damit nur noch tragbar, wenn andere Quellen den Trend zweistellig halten.

   ⚠️ **Banner bleibt der Ausreißer und muss beobachtet werden.** Mit `trend50` = 5 liegt es weit über allen anderen; bei 50 % sind das **−10,0**. Der schnellere Malus-Abbau (§8) hat den Schwanz von 2.000 s auf 500 s gekürzt und die Gesamtkosten von 10.800 auf 3.300 Trend-Sekunden — aus „unumkehrbar" ist damit „sehr teuer" geworden, was für die einzige Werbeart, die dem Anfänger von Beginn an offensteht, die richtige Härte sein dürfte. Bestätigt ist das noch nicht. Falls es sich weiterhin wie eine Falle spielt: `trend50` von Banner senken, **nicht** den Exponenten — der ist für alle vier Arten gemeinsam geeicht.
2. **Die Grenze bleibt bestehen**, sie ist nur weit genug weg, um Phase 2 zu tragen. Der strukturelle Fix gehört zu den KI-Labor-Werbearten: die brauchen **beides**, besseren Kurs *und* deutlich größeren Watchtime-Appetit pro Deal. Sonst stapelt sich irgendwann Watchtime, die nirgends hinkann — und mit ihr werden die Watchtime-Nodes wertlos (siehe Sektion 9).

### Intensität (1–50 %)

```
moneyPerCycle = eur50 × (i / 0.5)                          ← linear
trendMalus    = (trend50 / 4) × (i / 0.25)^AD_TREND_EXPONENT
```

Watchtime-Kosten und Zyklusdauer sind von der Intensität **unabhängig** — ein Deal kostet immer dasselbe. Daraus entsteht der beidseitige Trade-off: hohe Intensität holt mehr Geld aus derselben Watchtime, kostet aber überproportional Trend. Also **Watchtime knapp → hochdrehen, Trend knapp → runterdrehen**.

**Die Kurve ist am Arbeitspunkt 25 % verankert, nicht am Maximum.** Dort liegt der Malus fest auf `trend50/4` — unabhängig vom Exponenten. Der Exponent dreht deshalb ausschließlich daran, wie teuer das **Übersteuern** darüber wird, und lässt den Alltagsbereich in Ruhe. Das ist kein Schönheitsdetail: an 25 % hängen sämtliche abgeleiteten Preis-Anker (€ je Trend-Sekunde, Anziehungskraft-Marge, „Banner kann seine eigene Reparatur nie bezahlen"). Ohne diesen Anker müsste bei jeder Kurvenänderung die halbe Werbe- und Anziehungskraft-Ökonomie neu gerechnet werden.

`AD_TREND_EXPONENT = 2` reproduziert exakt die frühere Formel `trend50 × (i/0,5)²`. **Aktuell steht er auf 3**, weil Dauerbetrieb auf 50 % im Test nicht wehtat. Malus am Maximum als Vielfaches von `trend50`: n=2 → 1,0× · **n=3 → 2,0×** · n=4 → 4,0×.

Beispiel Banner bei n=3: 10 % → 450 € / −0,08 · 25 % → 1.125 € / −1,25 · 50 % → 2.250 € / **−10,0**.

⚠️ **Ein steilerer Exponent verschiebt das Optimum nach unten — er baut keinen Korridor.** Bei n=3 ist 10 % gegenüber 50 % **25×** trend-effizienter (bei n=2 nur 5×). Was niedrige Intensität überhaupt bestraft, ist allein die Watchtime: sie kostet je Zyklus dasselbe, egal wie wenig Geld dabei herauskommt. Solange Watchtime knapp ist, trägt das. Wird sie im Spätspiel zum Überschuss (bekanntes Problem, Sektion 9), fällt der Gegenspieler weg und der Regler rutscht ans untere Ende. **Der Hebel dagegen ist dann die Watchtime-Seite, nicht dieser Exponent.**

Die Formeln stehen **einmal** in `js/state.js` (`adMoneyPerCycle` / `adTrendMalus`); Loop und UI rechnen beide darüber. Die Getter `adRevenueMult()` / `adTrendMult()` liefern aktuell 1 und sind die Schnittstelle für spätere Techtree-Nodes.

### Trend-Malus

Jede Agentur registriert **ihren eigenen** Modifikator `werbe:<instanceId>`, solange ihr Deal produziert — das Trend-Info-Modal listet sie dadurch einzeln auf. Kein Deal = kein Modifikator.

### Watchtime-Abbruch

Reicht das Lager beim Start eines Zyklus nicht, **bricht der Deal ab**. Bereits erwirtschaftetes Geld bleibt zum Einsammeln liegen, der Rest verfällt. Ein Toast sagt Bescheid.

Die Gegenrichtung — Trend mit Geld **zurückkaufen** — sitzt nicht hier, sondern im Marketing-Center: siehe **Sektion 7.2 (Anziehungskraft-Kampagnen)**. Werbung verkauft Trend, Anziehungskraft kauft ihn; erst zusammen ergibt das eine handelbare Ressource statt einer Einbahnstraße.

### Visualisierung

- Ring auf dem Gebäude (`.wb-ui`, gleiche Optik wie Marketing) zeigt den laufenden Zyklus, der Ring-Text den Zähler `3/5` — im Dauerbetrieb `3/5↻`. Das ↻ ist die **einzige** Stelle, an der der Dauerbetrieb auf dem Feld sichtbar ist; ohne es sähe eine Agentur, die von selbst weiterläuft, aus wie eine, die gleich stehenbleibt.
- Gold-Button darunter ist **nur** zum Einsammeln da (`💰 +900 €`) und sonst versteckt. Gebucht wird ausschließlich im Modal — ein Button, der an derselben Stelle die Bedeutung wechselt, irritiert.
- Neu gebucht wird per **Klick aufs Gebäude**: das Modal merkt sich die letzte Wahl (Slider vorbelegt, Werbeart als „zuletzt" markiert, Button „Erneut buchen"), man kann sie aber genauso gut neu justieren. Ein Hinweis unten verweist fürs Gegenfinanzieren aufs Marketing-Center.
- Einsammeln lässt das Geld sichtbar zur Geld-Kachel fliegen, Deal-Abschluss feuert ein Feuerwerk.

### Volumen (ab Phase 2) und Targeting (ab Phase 3)

Zwei weitere Schichten im selben Modal, freigeschaltet über den Werbung-Reiter. Details in `phase3.md` §7 — hier nur, was für die Formeln in `js/state.js` gilt.

**Beide erscheinen erst, wenn sie entwickelt sind** — nicht schon mit der Phase. Die Volumen-Spalte hängt an `adVolumeOpenCount() > 1` (also an `wb_adopt`), der Targeting-Schalter an `adTargetingUnlocked()`. Vorher hätte jedes der beiden genau eine erreichbare Stellung, und ein Regler, den man nicht bewegen kann, ist kein Regler, sondern ein Schild, das dem Modal Platz wegnimmt.

⚠️ **Innerhalb** der Volumen-Spalte gilt die Gegenregel: dort bleiben die noch fehlenden Stufen als gesperrte Knöpfe stehen und tragen den Namen ihrer Node. Der Unterschied ist, ob der Spieler die Sache schon besitzt — bei einer Mechanik, die einem gehört, ist die gesperrte Stufe ein Wegweiser; bei einer, die man noch gar nicht kennt, ein Versprechen ins Blaue.

**Volumen** hat vier Stufen. Die ersten beiden sind **absolut** (`type.watchtime`), die zwei anderen sind **Anteile des Watchtime-Lagers**. Dasselbe Paar wie überall sonst im Spiel — Clustering gegen Fine Tuning im KI-Labor, feste gegen anteilige Metadaten-Preise bei den Anziehungskraft-Kampagnen: die flache Stufe ist der Einstieg, die prozentuale trägt dauerhaft.

| Knopf | Phase | Bedeutung | Freigeschaltet durch | Banner | Feed | Search | Video |
|---|---|---|---|---|---|---|---|
| `fest` | — | `type.watchtime` | — | 15.000 | 50.000 | 250.000 | 400.000 |
| `fest ×4` | 2 | 4× `type.watchtime`, **gleicher Trend** | `wb_adopt` | 60.000 | 200.000 | 1.000.000 | 1.600.000 |
| `Anteil` | 3 | 1× Anteil | `wb_adserver` | 0,3 % | 1 % | 5 % | 8 % |
| `Anteil ×3` | 3 | 3× Anteil | `wb_programmatic` | 0,9 % | 3 % | 15 % | 24 % |

⚠️ **Der Anteil je Art wird aus `type.watchtime / AD_PCT_ANCHOR` abgeleitet** und steht bewusst nicht als eigenes Feld an den Werbearten. Dadurch behalten die vier ihre Verhältnisse zueinander exakt, und wer an `type.watchtime` dreht, zieht den Anteil automatisch mit. **Ein einheitlicher Prozentsatz für alle würde die Arten einebnen**: der Ertrag hinge dann nur noch an Kurs und Dauer, und Feed gewänne auf *beiden* Achsen — Search, Video und Banner hätten keine Rolle mehr.

⚠️ **Stufe 1 muss absolut bleiben.** Sie ist die Voreinstellung des *ganzen* Spiels — bis `wb_adopt` steht, ist sie die einzige Stufe, und die Spalte wird gar nicht angezeigt. Prozentual bekäme ein Banner bei 100.000 Lager statt 15.000 nur noch 300 Watchtime. Der Gleichstand liegt bei `AD_PCT_ANCHOR` = 5 Mio Lager — darunter ist die feste Stufe die stärkere Wahl, darüber schafft sie sich selbst ab.

### `fest ×4` — die Brücke über die Phase-2-Durststrecke

Zwischen `fest` und `Anteil` lag die längste Durststrecke des Spiels, und sie war der meistgemeldete Punkt aus dem Playtest: „ich habe sehr lange sehr viel Watchtime rumliegen und bekomme sie nicht umgewandelt".

Die Ursache ist Arithmetik. Ein Deal frisst eine **feste** Zahl, die Produktion wächst mit den **Usern**:

| | Verbrauch | deckt Dauerbetrieb bei |
|---|---|---|
| Video `fest` | 16.000 wt/s | 128.000 User |
| Video `fest ×4` | 64.000 wt/s | **512.000 User** |
| Feed `fest` | 2.500 wt/s | 20.000 User |
| Feed `fest ×4` | 10.000 wt/s | 80.000 User |

Mehr Agenturen kosten linear Trend; bei einem realistischen Budget von 3–5 Video-Agenturen ist **bei ~600.000 Usern Schluss**, und ab da wächst der Berg. Aufgelöst wurde das bisher erst von `wb_adserver` tief in Phase 3 — und dann als Sprung um Faktor 160 auf einmal.

`fest ×4` schiebt die Wand auf ~2 Mio User (vier Agenturen) und glättet den Sprung.

⚠️ **Das ist bewusst eine Verschiebung, keine Aufhebung.** Absolut skaliert nie mit (die Begründung steht direkt darunter); bei 10 Mio Usern ist die Wand zurück. Der strukturelle Fix bleibt der Anteil. Wer die Brücke weiter tragen lassen will, erhöht **nicht** den Faktor, sondern zieht `wb_adserver` vor.

⚠️ **Sie ist trotzdem keine strikt bessere Stufe, und das trägt sie.** Ein Zyklus braucht die vierfache Menge im Lager, sonst bricht der Deal ab — auf einer kleinen Plattform ist `fest` weiter die richtige Wahl. Die Stufe gattet sich damit selbst und braucht keine zusätzliche Schranke; **es ist die einzige Volumen-Stufe, deren Nutzen davon abhängt, wie voll das Lager gerade ist.**

**Warum anteilig.** Absolut skalierte der Verbrauch nicht mit der Plattform: bei 3 Mio Usern produzieren die Farmen 1,1 Mio wt/s, ein Video-Deal auf der alten Stufe ×10 fraß 160.000. Man hätte 69 gleichzeitige Deals gebraucht = −43 Trend bei einem Budget von 20. **Höchstens ~30 % der Watchtime waren überhaupt verwertbar, der Rest musste liegenbleiben** — das war die Ursache des Watchtime-Bergs, nicht ein Fehler des Spielers. Anteilig verschwindet das, ohne dass am Trend etwas geändert wird: bei *gleichem* Malus stehen 20.000 €/s gegen 3,2 Mio €/s.

**Die Stufe ist kein Machtregler** — und das ist die tragende Eigenschaft des Entwurfs. Läuft dauerhaft ein Deal, pendelt sich das Lager ein bei

```
S* = Produktion × Zyklusdauer / (Anteil × adWatchtimeMult)
```

und das Einkommen dort ist `Produktion × Kurs / adWatchtimeMult` — **unabhängig von der Stufe**. Eine höhere Anteils-Stufe bringt dasselbe Geld bei linear mehr Trend, nur mit kleinerem Puffer. Im Dauerbetrieb ist die *niedrigste* Anteils-Stufe strikt die beste; die hohe ist das Werkzeug, um einen Rückstau abzubauen (nach einer Nacht, einer Pause, oder einer Phase ohne brauchbare Nachfrage).

Damit erledigt sich die alte Sorge, das Volumen könnte den Intensitäts-Regler ersetzen: ein „immer auf Maximum" gibt es nicht mehr.

⚠️ **Das gilt nur für die Anteils-Stufen.** Auf `fest ×4` skaliert das Einkommen sehr wohl mit dem Faktor — dort ist es ja die ganze Absicht. Beides nebeneinander geht nur, weil `mult` (Volumen) und `trendMult` (Malus) seit der Brücke **zwei getrennte Felder** in `AD_VOLUME_STEPS` sind:

| | `mult` | `trendMult` | Warum |
|---|---|---|---|
| Anteils-Stufen | 1 / 3 | **1 / 3 — gleich** | Einkommen ist stufenunabhängig; ein Trend-Rabatt machte „Maximum" sofort strikt richtig und zerstörte die Eigenschaft oben |
| `fest ×4` | 4 | **1** | Einkommen skaliert mit; ein proportionaler Malus wäre exakt „vier parallele Deals" und damit keine Stufe, sondern nur Klick-Ersparnis |

⚠️ **Wer eine weitere Anteils-Stufe hinzufügt, muss `trendMult` gleich `mult` setzen.** Ein Rabatt ist dort auch nicht nötig — der Wechsel auf Anteile ist bei gleichem Trend schon Faktor 160.

Die übrigen zwei Schichten:

- **Targeting** (Schalter) kostet `TARGETING_META_PER_WT` Metadaten je Watchtime und gibt `TARGETING_REVENUE_MULT` aufs Geld, **ohne** zusätzlichen Trend. Es hebt € je Trend-Punkt — dieselbe Achse, auf der auch `fest ×4` arbeitet, nur multiplikativ statt über die Menge.
- **`adWatchtimeMult()`** ist der dritte Getter neben `adRevenueMult()` / `adTrendMult()` und senkt den **Verbrauch** statt den Ertrag zu heben. Er ist seit dem Umbau der Anzeigen-Optimierung **unbelegt** und liefert konstant 1 — wie `adTrendMult()` ein reservierter Haken. Ein Feld `adWatchtimeMult: 0.75` an irgendeiner Node reicht, um ihn wiederzubeleben; gedacht ist er für die Konkurrenz Werbeagentur ↔ KI-Labor, die aus demselben Lager saufen.

⚠️ **`type.watchtime` ist nicht das, was ein Zyklus kostet** — und seit den Anteils-Stufen auch nicht mehr das, was er einbringt. Drei getrennte Zahlen:

| Funktion | Bedeutung |
|---|---|
| `adWatchtimeGross(typeId, volume)` | was der Zyklus **ausliefert** → Basis für Geld |
| `adWatchtimePerCycle(typeId, volume)` | was **abgebucht** wird = brutto × `adWatchtimeMult()` |
| `adMetadataPerCycle(typeId, volume, targeting)` | Metadaten, am **Netto**-Verbrauch |

⚠️ **Brutto und Netto sind getrennt, weil ein Verbrauchs-Rabatt sonst ein Downgrade wäre.** Er senkt, was der Zyklus *kostet*, nicht was er *ausliefert*; hinge das Geld am Netto, hieße −25 % Verbrauch auch −25 % Ertrag. Der Haken ist derzeit unbelegt (siehe oben), die Trennung muss trotzdem stehen bleiben — sonst ist sie beim nächsten Versuch wieder wegoptimiert.

⚠️ **`adMoneyPerCycle()` nimmt optional ein `grossWt`.** Der Loop bucht die Watchtime am Zyklus-**Anfang** ab und zahlt am **Ende** aus — auf einer Anteils-Stufe ist das Lager dann ein anderes. Deshalb merkt sich der Deal seinen Wert in `deal.grossWt`; ohne ihn bekäme man Geld für eine Menge, die man nie bezahlt hat. Tick, Offline-Aufholpass und die Karte des laufenden Deals reichen ihn durch.

⚠️ **`volume` ist eine stabile Stufen-ID, kein Multiplikator und auch kein Rang.** Wie stark eine Stufe ist, sagt allein ihre Position in `AD_VOLUME_STEPS` (`adStepIndex`); jede Rangfrage läuft darüber, nie über einen Zahlenvergleich (`adIsBaseVolume`, `clampAdVolume`, `adVolumeOpenCount`). Dadurch kostet eine neue Stufe in der Mitte keine Umnummerierung — `fest ×4` trägt deshalb die freie ID 5 und steht trotzdem an zweiter Stelle.

⚠️ **Genau daran ist die Vorgänger-Lösung gescheitert, und zwar unbemerkt.** `storage.migrate()` schlüsselte alte Stände über eine feste Tabelle `{1:1, 3:2, 5:3, 10:4}` um — unbedingt, bei **jedem** Laden. Damit schrieb sie auch die aktuelle Nummerierung mit um: „Anteil" (2) fiel über `|| 1` auf **„fest"** zurück, „Anteil ×3" (3) auf „Anteil". Die gemerkte Volumen-Wahl war nach jedem Neuladen weg, und ein laufender Anteils-Deal wurde mitten im Deal zur festen Stufe. Behoben am 2026-08-10; geblieben ist nur `{4: 3}` für das weggefallene „Anteil ×5" — eindeutig und idempotent, weil die 4 als ID nicht mehr vergeben ist. **Eine Migration, die IDs durchschlüsselt, braucht immer einen Marker oder eine Zielmenge, die sich von der Quellmenge unterscheidet.**

**Später:** Trend als Multiplikator auf die Werbeerträge, Nodes auf `adRevenueMult` / `adTrendMult`, weitere Werbearten.

---

## 7. Wachstumsmechanik — wie kommen neue User

Zwei parallele Systeme, statt einem "Freunden erzählen"-Knopf:

### 7.1 Marketing-Center — Reichweiten-Kampagnen

**Was:** Ein Gebäude neben der Werbeagentur. Klick → Modal mit Kampagnen-Auswahl. Es läuft immer nur **eine** Kampagne pro Center; wer mehr parallel will, baut ein zweites.

Definiert in `CAMPAIGNS` (`js/state.js`) mit `kind: 'users'`. Namen und Icons stammen aus v1 (`v1_original/js/core/marketing.js`).

| Kampagne | Icon | Kosten | Dauer | User | User/s | €/User | Klicks/Min | Freischaltung |
|----------|------|--------|-------|------|--------|--------|------------|---------------|
| **Stadtaktion** | 🏙️ | 300 € | 10 s | +1.000 | 100 | **0,30** | 6 | von Anfang an |
| **Empfehlungs-Welle** | 📣 | 1.500 € | 40 s | +4.000 | 100 | 0,375 | 1,5 | `mk_langzeit` |
| **Hype-Burst** | 🚀 | 10.000 € | 150 s | +20.000 | **133** | 0,50 | 0,4 | `mk_sprint` |

Läuft in der Slot-Sidebar sichtbar (Progress-Bar). Nach Ablauf warten die User zum Einsammeln.

**Der Klick-Aufwand ist der Preis für den Kurs.** Stadtaktion hat mit 0,30 €/User den besten Kurs im Spiel, kostet dafür sechs Klicks pro Minute. Empfehlungs-Welle nimmt 25 % Aufpreis für die Ruhe. Hype-Burst ist mit 67 % Aufpreis der teuerste Kurs, liefert dafür das höchste Tempo **und** 20.000 User am Stück — der Knopf für „jetzt sofort, Geld egal". Gegenprobe über 150 s: 15× Stadtaktion bringt 15.000 User für 4.500 €, Hype-Burst 20.000 für 10.000 €.

⚠️ **Die freischaltbaren Kampagnen haben den *schlechteren* Kurs.** Man bezahlt eine Node dafür, teurer einzukaufen — gekauft wird also nicht Effizienz, sondern **Klickruhe**. Das ist als Idle-Mechanik völlig in Ordnung, aber die Node-Texte müssen es offen sagen („nicht billiger — ruhiger"), sonst fühlt sich die Freischaltung wie eine Falle an.

### ⚠️ Beim Balancen beachten

Zwischen den Spalten besteht ein Zwangsverhältnis:

```
€/User  ×  User/s  =  Kosten ÷ Dauer
```

Kosten und Dauer legen das Produkt fest; die User-Zahl schiebt nur auf dieser Kurve hin und her. **Beide Achsen lassen sich nicht frei wählen.** Wer eine Kampagne teuer *und* kurz macht, hat damit schon entschieden, dass sie viel pro Sekunde liefern muss — sie kann dann nicht gleichzeitig die gemächliche Option sein. Genau daran sind zwei Anläufe gescheitert, bevor Hype-Burst seine Rolle als explosive Premium-Option bekommen hat (was ohnehin besser zum Namen passt).

**Absolute Zahlen — und das ist Absicht.** Diese Kampagnen werden mit wachsender Plattform zwangsläufig bedeutungslos: bei 1 Mio Usern ist ein Hype-Burst ein Rundungsfehler. Sie sind die Frühspiel-Stufe, die sich selbst abschafft. Was danach trägt, steht in 7.2.

### 7.2 Anziehungskraft — Trend kaufen

Dieselbe Gebäudeklasse, derselbe Slot, `kind: 'trend'`. Sie bringen **keine User direkt**, sondern heben den Trend — und weil der prozentual wirkt, skalieren sie mit der Plattform mit. Das ist das wiederholbare Gegenstück zu den Werbedeals, die den Trend laufend drücken (Sektion 6).

| Kampagne | Icon | Kosten | Trend | Laufzeit | €/Trend-s | Charakter | Freischaltung |
|----------|------|--------|-------|----------|-----------|-----------|---------------|
| **Verifizierte Marken-Profile** | 🤝 | 40.000 € | +1,5 | 300 s | **81** | Grundlast, bester Kurs | `mk_presse` |
| **Creator-Beteiligung** | 🤳 | **28.000–70.000 €** (5 Stufen) | **+1,0 … +3,0** | 60 s | **311 → 259** | Spitzenlast, einzige Kampagne mit Regler | `mk_partner` |
| **Zielgruppen-Offensive** (Phase 3) | 🎯 | 100.000 € + **1,0 Metadaten je User** | **+4,0** | 240 s | 93 | Stärkste je Platz, in Metadaten bezahlt | `mk_analyse` |

⚠️ **Die Namen sind keine Kosmetik** (umbenannt 2026-08-06). Vorher hießen sie „Influencer buchen" und „Firma auf die Plattform holen" — beides Beschaffungs-Verben, und beide erzählten das Gegenteil der Mechanik. **Man kauft hier keine Person ein; man baut ein laufendes Angebot, das dafür sorgt, dass Leute von selbst herkommen.** Genau das ist auch, was der Trend abbildet: den gesellschaftlichen Sog, nicht eine gebuchte Anzeige.

⚠️ **„Nischen erschließen" → „Zielgruppen-Offensive" (umbenannt 2026-08-09).** „Nische" klang nach klein und speziell — das Gegenteil der Rolle „stärkste Kampagne je Platz" (siehe unten). Der neue Name ist außerdem konsistent mit den Nachbarn: eine Substantiv-Phrase wie „Marken-Profile" und „Creator-Beteiligung", nicht die einzige Verb-Phrase der Reihe. Die interne ID (`zielgruppe`) und die Node-Kurzform „Zielgruppe" (§9) blieben davon unberührt — der neue Anzeigename passt jetzt sogar besser dazu als der alte.

### Die Creator-Beteiligung — die einzige Kampagne mit Regler

Umbau des früheren **Creator-Fonds** (2026-08-09, feste Buchung 40.000 € → +3,0). Der Regler stammt aus dem gestrichenen **Community Center**: dort war die Umsatzbeteiligung ein eigenes Phase-3-Gebäude mit eigenem Modal und eigener Ökonomie — und das einzige seiner entworfenen Werkzeuge, das je gebaut wurde. Sie steht jetzt da, wo sie mechanisch hingehört: Geld rein, Trend raus, ein Kampagnenplatz. Die Herleitung des verworfenen Gebäudes steht in `phase3.md` §5.

```
trend  = campaignTrendAtStep()            5 Stufen von +1,0 bis +3,0
brutto = costBase + costPerTrend × trend   (7.000 € + 21.000 € je Trend-Punkt)
netto  = brutto × (1 − creatorCut())       Marktplatz-Provision, §9
```

| Stufe | Trend | Kosten | €/Trend-Sekunde |
|---|---|---|---|
| sehr niedrig | +1,0 | 28.000 € | 311 |
| niedrig | +1,5 | 38.500 € | 285 |
| mittel | +2,0 | 49.000 € | 272 |
| hoch | +2,5 | 59.500 € | 264 |
| **sehr hoch** | **+3,0** | **70.000 €** | **259 — der geeichte Anker** |

⚠️ **Auf der Karte steht der NETTO-Preis, brutto nur als Kleinzeile darunter** („56.000 € · statt 70.000 €", geändert 2026-08-12). Vorher war die Marktplatz-Provision eine zweite 💰-Kachel mit „−14.000 €" unter dem Preis — und wurde gelesen, wie zwei Zahlen untereinander nun einmal gelesen werden: als Posten, den man noch abziehen muss. Der Wert darüber **war** aber schon netto. **Regel: in der Kostenspalte steht ausschließlich, was abgebucht wird.** Ein Rabatt gehört als Beschriftung an die Zahl, nicht als eigene Zeile daneben. Erklärt wird er im Kartentext links (`.rt-led-card__note`) — die frühere Info-Zeile unter der ganzen Spalte war eine Fußnote, die niemand mit den Zahlen darüber zusammengebracht hat.

⚠️ **Am Regler stehen die Stufennamen, nicht die Trend-Zahl.** Die Beteiligung ist eine Entscheidung über die eigene Haltung, keine Rechenaufgabe — „sehr niedrig … sehr hoch" ist die Frage, die der Spieler beantworten soll. Der Trend-Wert steht trotzdem auf der Karte, nämlich auf der **Ertrags-Kachel**, wo ihn auch jede andere Kampagne zeigt. Fünf Stufen, weil der Regler einrasten soll: ein stufenloser Schieber lädt zum Feilschen um Zehntel ein, und genau das ist hier nicht die Entscheidung.

⚠️ **Der feste Sockel im Preis ist die Aussage, kein Rundungsposten.** Er wächst nicht mit der Stufe mit — wer nur symbolisch beteiligt, bezahlt ihn trotzdem in voller Höhe. Dadurch wird der Kurs nach oben **besser**, und die Mechanik sagt selbst, was das Spiel erzählen will: *eine Plattform gewinnt, wenn sie ihre Creator wirklich beteiligt.* Ein streng linearer Preis wäre nur eine Frage des Kontostands und träfe gar keine Aussage.

⚠️ **Das Maximum (70.000 € / +3,0) ist der Eichpunkt.** Sämtliche Preis-Anker weiter unten hängen an ihm; der schlechteste Kurs auf der untersten Stufe (311) liegt ebenfalls weit über Banner (40). Wer die Kampagne schwächen will, dreht an `costBase`/`costPerTrend`, **nicht** am Trend-Bereich — daran hängt die Decke je Kampagnenplatz. Die **Stufenzahl** (`trendSteps`) ist reine Bedienung und keine Balance-Größe: sie ändert nur, wie fein man zwischen den beiden Enden wählen kann.

⚠️ **Bewusst ohne Watchtime-Wirkung.** Das Community-Center-Werkzeug hatte zusätzlich einen Watchtime-Faktor; er ist nicht mitgewandert. Der Watchtime-Multiplikator ist seitdem wieder durchgehend **dauerhaft** (nur Techtree-Nodes) — im Aufschlüsselungs-Modal steht keine befristete Sonderzeile mehr, die man beim Lesen mitdenken müsste.

⚠️ **Die interne ID bleibt `influencer`** — dieselbe Regel wie bei `ki_netz` / „Fine Tuning": eine ID-Umbenennung bräuchte eine Migration für laufende Buchungen, und das ist für einen Anzeigenamen der falsche Preis. Die frühere Namenskollision („Creator" doppelt vergeben, einmal hier und einmal im Community Center) hat sich mit dem Gebäude von selbst erledigt.

**Eine Kampagne ist ein Vertrag, kein Strohfeuer.** Der Wert liegt über die ganze Laufzeit voll an und ist `PR_DECAY_SEC` = **60 s** nach dem Ende wieder weg — nicht über die globale Abkling-Rate, die für Techtree-Boni gilt (Sektion 8). Daraus folgt die einfachste Formel des Spiels:

```
Trend-Sekunden = Wert × (Laufzeit + 30 s)
```

Creator-Beteiligung 270 (am Reglerende) · Marken-Profile 495 · Zielgruppen-Offensive 1.080.

**Warum es eine eigene Abkling-Regel gibt.** Bei der globalen Rate trug der Schwanz **87 %** der Wirkung (135 Trend-Sekunden Laufzeit gegen 900 im Ausklang). Weil eine Neubuchung den Platz *ersetzt*, war sofortiges Nachbuchen dadurch **7,7× teurer je Trend-Sekunde** als Abwarten — eine Strafe, die auf keiner Karte stand.

⚠️ **20 → 60 s am 2026-08-06, aus reinem Spielgefühl.** Bei 20 s war der Wert sieben Sekunden nach Laufzeitende schon auf zwei Dritteln und nach zwanzig auf null: man *musste* sofort nachklicken. Bei 60 s steht eine Creator-Beteiligung (+3,0) nach 20 s noch auf +2,0 und nach 40 s auf +1,0 — ein Fenster statt einer Kante.

Damit verletzt Anziehungskraft die Faustregel „Abklingzeit ≤ ¼ der Laufzeit" (Creator-Beteiligung: 60 s gegen 60 s). Das ist geprüft und gewollt — die Regel war gegen die *alte* Falle geeicht:

| Ausklang | Nachteil fürs Sofort-Nachbuchen |
|---|---|
| globale Rate (600 s) | **−87 %** — die Falle |
| 20 s | −13 % |
| **60 s** | **−25 %** — ein Schubser, keine Falle |

⚠️ **Der Platz wird vom längeren Ausklang nicht blockiert.** `prSlotsUsed()` zählt nur Kampagnen mit `state.active`, und das räumt der Tick am Laufzeitende ab. Ein längerer Schwanz kostet also keine Parallelität — sonst wäre die Änderung ein Nerf gewesen.

⚠️ **Nicht stattdessen `TREND_DECAY_PER_SEC` senken.** Daran hängen die Techtree-Boni, und deren Wirkung **ist** der lange Schwanz (Videos +12,0 = 15.120 Trend-Sekunden, davon 14.400 im Ausklang). Der Unterschied ist auch erzählerisch richtig: ein Feature hallt nach — „die Leute reden kurz darüber, dann ist es normal" (Sektion 8) —, ein bezahlter Vertrag endet.

**Die Marken-Profile setzen den Kurs, die Creator-Beteiligung zahlt Aufschlag** (3,2× am Reglerende). Das ist die ganze Rollenverteilung: Sofortwirkung kostet. Sie hält trotzdem, weil die **Plätze** hart begrenzt sind — mit zwei Marken-Profilen kommt man nur auf +3,0, wer höher will, *muss* die teure nehmen. Ohne die Platzgrenze wäre die Creator-Beteiligung schlicht dominiert.

⚠️ **Die 60-s-Abklingzeit hat ihren Kurs um 22 % verbessert** — sie profitiert anteilig am meisten vom längeren Schwanz, weil ihre Laufzeit die kürzeste ist. Ihre Marge gegen Feed war dadurch auf 6,5× gestiegen und die Rolle „knappste Marge, Spitzenlast statt Arbeitspferd" weicher geworden; die Preiserhöhung vom 2026-08-09 hat sie auf **3,7×** zurückgeholt. Der Knopf dafür ist ihr **Preis** (`costBase` / `costPerTrend`), nicht die Abklingzeit.

Die Klick-Last läuft dadurch mit dem Ertrag mit, statt eine versteckte Strafe zu sein:

| Aufbau (Phase 2, 2 Plätze) | Trend | Kosten | Klicks/min |
|---|---|---|---|
| 2× Marken-Profile | +3,0 | 267 €/s | 0,4 |
| 1× + 1× | +4,5 | 1.300 €/s | 1,2 |
| 2× Beteiligung @+3,0 | **+6,0** | 2.333 €/s | 2,0 |

### Die Zielgruppen-Offensive — Anziehungskraft, in Metadaten bezahlt

Ab Phase 3 (`mk_analyse`). Sie war ursprünglich eine Reichweiten-Kampagne mit `usersPct` und ist zur Anziehungskraft-Kampagne geworden: der Trend wächst prozentual, eine feste User-Zahl nicht — als Trend-Quelle ist derselbe Aufwand ungleich mehr wert.

**Ihr Verkaufsargument ist nicht der Kurs, sondern der Durchsatz je Platz.** Mit +4,0 ist sie die stärkste Kampagne je Kampagnenplatz (Creator-Beteiligung +3,0) — dieselbe Bauart wie das Werbevideo unter den Werbearten: kein besserer Kurs, mehr Durchsatz je knapper Einheit. `mk_analyse` bringt zusätzlich **Kampagnenplatz 3** mit, nach derselben Regel wie die beiden Nodes davor: eine Kampagne, ein Platz.

⚠️ **Der Metadaten-Preis ist ein Betrag je User (`metadataPerUser`), keine feste Menge.** Das ist keine Feinheit, sondern die tragende Eigenschaft: der Metadaten-**Strom** wächst linear mit den Usern, ein fester Preis wäre ab ~1 Mio Usern faktisch gratis gewesen — und dann hätte nur noch der Geldpreis gezählt. Weil beide Seiten mitwachsen, kürzt sich die Plattformgröße heraus:

```
Laufanteil = Abdeckung × 0,0625 × Laufzeit ÷ Metadaten-je-User
```

Bei 500.000 wie bei 3 Mio Usern ist es dieselbe Ansparzeit je Buchung — bei 10 % Abdeckung **160 s**. Die Bremse ist damit das **KI-Labor**, nicht der Kontostand:

| Abdeckung | Laufanteil | Ø Trend | Ø Geld | |
|---|---|---|---|---|
| 2 % | 30 % | +1,20 | 125 €/s | Marken-Profile besser |
| **2,5 %** | 37,5 % | **+1,5** | 156 €/s | **Gleichstand** |
| 4 % | 60 % | +2,40 | 250 €/s | Zielgruppe besser |
| **6,7 %** | 100 % | **+4,00** | 417 €/s | volle Kraft |

⚠️ **`metadataPerUser` von 6 auf 1 gesenkt (2026-08-11).** Sechs Metadaten je User hießen bei 10 % Abdeckung **960 s Ansparen für eine Buchung, die 240 s läuft** — die Kampagne stand drei Viertel der Zeit still, und beim Phase-3-Einstieg mit einstelliger Abdeckung war sie faktisch unbuchbar. Die Rechnung darüber ging von 10–40 % Abdeckung aus; so weit ist das KI-Labor in der Praxis erst sehr viel später.

⚠️ **Damit ist der Metadaten-Preis keine Bremse mehr, sondern nur noch eine Ansparzeit.** Ab ~6,7 % Abdeckung läuft sie durchgehend; der Satz „sie kommt nicht fertig aus dem Techtree" gilt entsprechend nur noch unterhalb von ~2,5 %. Das ist die bewusst gewählte Seite des Tauschs: lieber eine Kampagne, die man ab dem mittleren Phase-3-Ausbau wirklich fahren kann, als eine, die formal existiert. **Wer die Bremse zurückwill, hebt diesen Wert wieder an** — er bleibt der richtige Knopf dafür.

**Sie kommt bewusst nicht fertig aus dem Techtree.** Bei der Abdeckung, die man beim Phase-3-Einstieg hat, ist eine dauerhafte Firma noch die bessere Grundlast. Erst wer ins KI-Labor investiert, dreht das um — und weil Abdeckung auch das Targeting speist, ziehen beide aus demselben Strom. Das ist die Entscheidung: **Trend oder mehr Geld je Werbedeal.**

Der Metadaten-Block bleibt grobkörnig (500.000 am Stück bei 500.000 Usern): entweder man spart darauf, oder man fährt Targeting durchgehend. Kein weiches Aufteilen.

⚠️ **Knopf beim Balancen ist `metadataPerUser`** — nicht `cost` (die Bremse soll das KI-Labor sein, nicht der Kontostand) und nicht `trend` (daran hängt die Rolle „stärkste je Platz"). Seit der Preiserhöhung vom 2026-08-09 liegt ihr Geldkurs mit **93 €/Trend-Sekunde leicht über dem der Marken-Profile** (81) statt darunter; ihre Rolle trägt sie trotzdem, weil die nie am Kurs hing, sondern am Durchsatz je Platz. Der dritte Knopf ist der **Platz** selbst: `mk_analyse` aus `PR_SLOT_NODES` zu nehmen setzt die Geld-Decke von +9,0 zurück auf +6,0, ohne eine einzige Kampagnen-Zahl anzufassen.

⚠️ **Die Reichweite-Spalte hat damit kein Spätspiel mehr.** Alle drei verbliebenen Kampagnen sind absolute Zahlen und ab ~1 Mio Usern Deko. Nach der Logik von §7.1 ist das sauber — Reichweite = Frühspiel, Anziehungskraft = Spätspiel —, aber die Spalte ist in Phase 3 tot. `usersPct` und `campaignUsers()` bleiben als Bauart erhalten, werden aktuell aber von keiner Kampagne benutzt.

⚠️ **Die Reihenfolge ist am 2026-08-07 getauscht worden.** Vorher gab `mk_presse` die **Creator-Beteiligung** (damals „Creator-Fonds") und `mk_partner` die Marken-Profile. Das war falsch herum: die erste Anziehungskraft-Kampagne, die der Spieler je sieht, war damit die **teuerste je Wirkung und die kurzlebigste** — bei einem Kontostand, der eine Kampagne dieser Preisklasse je Minute nicht hergibt. Der Trend blieb faktisch trotzdem eine Einbahnstraße, nur mit einem freigeschalteten Knopf daneben, den man sich nicht leisten konnte.

**Die erste Anziehungskraft-Kampagne muss die Grundlast sein, nicht die Spitzenlast.** Die Creator-Beteiligung wird gebraucht, wenn der Trend *sofort* hoch muss — und das ist kein Problem des Phase-2-Einstiegs.

⚠️ **Die Infrastruktur-Bremse ist im selben Zug einen Node nach hinten gerückt.** Vorher hing schon die Verifizierungsstelle an **Unternehmensprofile** und damit die gesamte Anziehungskraft-Achse an einem Umweg über Ebene 4 des Hauptbaums:

```
alt:  backend2 → gruppen + suche → unternehmen → mk_presse → erste Anziehungskraft-Kampagne
        5.000     8.000 + 6.000      12.000        10.000
neu:  mk_freunde → mk_langzeit → mk_presse → erste Anziehungskraft-Kampagne (Marken-Profile)
                      2.000        10.000
      unternehmen hängt jetzt an mk_partner (zweite Anziehungskraft-Kampagne + Platz 2)
```

Das kostete **24.000 € und 3.600 Server extra**, bevor die einzige wiederholbare positive Trend-Quelle (Sektion 8) überhaupt sichtbar war — während die Werbeseite, die den Trend *drückt*, von Anfang an offensteht (Banner) bzw. nach einem 3.000-€-Node (Feed). Im Test war genau dieses Fenster zu lang.

**Die Aussage „Anziehungskraft ohne Plattform-Infrastruktur wäre unehrlich" bleibt erhalten**, sie greift nur eine Stufe später: `mk_partner` trägt jetzt die `unternehmen`-Voraussetzung und bringt die Creator-Beteiligung **plus** Kampagnenplatz 2. Wer Partner bezahlen will, braucht sie erst einmal als offizielle Gegenstelle.

**Der Knopf, falls das Fenster immer noch zu lang ist, sind die Kosten von `mk_presse`** — nicht die Struktur der Kette und nicht die Trend-Werte der Kampagnen.

**Warum sie hierher gehören und nicht in die Werbeagentur:** Sektion 7 ist die Wachstumsmechanik, und Anziehungskraft ist Marketing-Ausgabe, die über den Trend wächst — die Brücke zwischen 7.1 und 7.3. Die Werbeagentur bleibt dadurch das Gebäude, das Watchtime zu Geld macht, das Marketing-Center das Gebäude, das Geld zu Usern macht. Ein Nebeneffekt: Reichweite und Anziehungskraft teilen sich den Slot, das ist also eine echte Entscheidung.

**Mechanik.** Es gibt nichts einzusammeln: `startCampaign()` setzt bei `kind: 'trend'` sofort den Modifikator `prslot:<n>` mit `holdSec = duration`; danach klingt er wie jeder andere ab (Sektion 8). Dadurch braucht Anziehungskraft **keine eigene Tick-Logik** — `setTrendMod()` macht bereits alles, und der Tick zahlt beim Ablauf nur keine User aus.

### Kampagnenplätze — warum Anziehungskraft nicht am Gebäude hängt

**Es laufen höchstens so viele Anziehungskraft-Kampagnen gleichzeitig, wie es Plätze gibt — plattformweit, nicht je Gebäude.** Alle Plätze kommen aus dem Marketing-Reiter (`PR_SLOT_NODES` in `js/state.js`). Reichweiten-Kampagnen sind davon **nicht** betroffen; dort bleibt es bei einem Slot je Marketing-Center.

| Node | Phase | Kosten | Dauer | Server | gibt |
|---|---|---|---|---|---|
| Verifizierungsstelle | 2 | 10.000 € | 60 s | 800 | Marken-Profile + Platz |
| Partner-Programm | 2 | 20.000 € | 100 s | 1.200 | Creator-Beteiligung + Platz |
| **Kampagnen-Team aufstocken** | 2 | **6.000 €** | 30 s | 600 | **nur Platz** |
| Marktanalyse | 3 | 45.000 € + 200.000 🗃️ | 100 s | 3.000 | Zielgruppe + Platz |
| **Trend-Monitoring** | 3 | **25.000 € + 250.000 🗃️** | 30 s | 2.000 | **nur Platz** |

Damit: **3 Plätze am Ende von Phase 2, 5 in Phase 3.**

Zwei Bauarten stehen nebeneinander. Die drei Kampagnen-Nodes bringen ihren Platz **mit** — dadurch verdrängt eine neue Anziehungskraft-Art die vorhandenen nie, sie kommt dazu. Die zwei neuen sind **reine Platz-Nodes**: sie bauen kein Feature und schalten nichts frei, sie erhöhen nur die Parallelität. Das Gegenstück zum Bürogebäude, nur für Anziehungskraft statt für Entwicklung.

⚠️ **Die reinen Platz-Nodes sind bewusst billig** (6.000 € / 25.000 €). Ein Platz ohne laufende Kampagne ist wertlos — bezahlt wird er im **Betrieb**, und zwar dauerhaft: eine Dauer-Beteiligung auf +3,0 sind 1.167 €/s, für immer. Genau darin unterscheiden sie sich vom Bürogebäude, wo der Platz nach dem Kauf gratis arbeitet und der Preis deshalb die einzige Bremse sein muss (§9). Wer hier an den Kosten dreht, verschiebt nur den Zeitpunkt — die Balance-Frage ist die **Anzahl**.

Ohne eine Schranke wäre der Trend schlicht käuflich. Jedes Center registrierte seinen eigenen Modifikator, und Modifikatoren addieren sich: **acht rotierende Marketing-Center halten +20 dauerhaft für rund 1.250 €/s** — weniger, als eine einzige Werbeagentur mit Video einbringt. Damit fällt der gesamte Trade-off aus Sektion 6 weg, und die Abwanderung ist ein gelöstes Problem statt einer Entscheidung.

⚠️ **Ein Preis kann das prinzipiell nicht reparieren.** Das Einkommen wächst mit der Plattform unbegrenzt, der Trend ist bei `TREND_MAX` = +40 gedeckelt. Jede geldbepreiste Trend-Quelle wird also irgendwann trivial bezahlbar, egal wie teuer sie startet. Das ist die **einzige** Stelle im Spiel, an der die Regel „der Preis ist der Balance-Knopf, nicht die Slot-Regel" (Sektion 9, Bürogebäude) bewusst nicht gilt — dort wächst der Nutzen linear mit, hier gegen einen festen Deckel.

⚠️ **Der Platz ist der Modifikator, nicht die laufende Kampagne** — eine neue Buchung **ersetzt** den Platz. Würde nur die Gleichzeitigkeit begrenzt, blieben die abklingenden Schwänze je Gebäude weiter nebeneinander stehen: eine Creator-Beteiligung wirkt lange nach, läuft aber nur 60 s. Bei zwei Plätzen und freier Rotation über viele Center käme man so auf **+46 statt +6** — die Schranke hätte gar nichts gebremst.

**Die Zahl der Plätze *ist* die Trend-Obergrenze der Anziehungskraft** — Plätze × bester Trend-Wert, und die einzige Größe, die kein Geld verschieben kann:

| Phase | Plätze | max. mit Geld (Beteiligung @+3,0) | max. mit Metadaten (Zielgruppen-Offensive) |
|---|---|---|---|
| 2, nach `mk_presse` | 1 | +3,0 | — |
| 2, nach `mk_partner` | 2 | +6,0 | — |
| **2, voll ausgebaut** | **3** | **+9,0** (3.500 €/s) | — |
| 3, nach `mk_analyse` | 4 | +12,0 | +16,0 |
| **3, voll ausgebaut** | **5** | **+15,0** (5.833 €/s) | **+20,0** |

⚠️ **+20,0 war exakt der alte `TREND_MAX`** — fünf Zielgruppen-Offensiven parallel fuhren den Trend allein an den Cap, und jeder Techtree-Bonus verfiel lautlos. Seit der Cap bei **+40** liegt (§8), ist das entschärft; die Zahl bleibt aber die Erinnerung daran, dass `TREND_MAX` eine Balance-Größe ist und kein Sicherheitsnetz.

Die Bremse davor sind die Metadaten: fünf Zielgruppen-Offensiven im Dauerbetrieb brauchen **33 % Abdeckung**. Bezahlt wird die in **Farm-Kapazität** — jede Farm trägt dann 1,33× so viel je User, weil Kapazität, die Modelle trägt, keine User trägt. Der volle Anziehungskraft-Ausbau kostet also Plattformgröße. Eine Sperre ist es nicht — und seit der Senkung von `metadataPerUser` (2026-08-11, s. o.) ist sie auch keine nennenswerte Bremse mehr: **die Decke von +20,0 hält jetzt allein die Zahl der Kampagnenplätze**, nicht mehr der Metadaten-Strom. `modelCoverage()` darf weiterhin über 1 liegen (mehr Modelle als User heißt feinere Modelle, keine Dubletten), gebraucht wird das hier aber nicht mehr.

### ⚠️ Warum +12,0 keine Wachstums-Maschine ist, sondern ein Reparatur-Set

Die Decke muss gegen den **Ruhewert** gelesen werden, nicht gegen 0. Der besteht seit dem 2026-08-06 aus zwei Teilen: dem **Netzwerkeffekt** (§8, positiv, wächst mit der Plattform) und der **Dark-Pattern-Schuld** (−7,0, §9). Netto-Trend eines Spätspiel-Aufbaus bei 10 Mio Usern, alle Dark Patterns:

| Werbebetrieb | Malus | Netz +6,0 (k=2) | Netz +9,0 (alle 3 WP) |
|---|---|---|---|
| 1× Video @25 %, Anziehungskraft +9,0 | −0,6 | **+7,4** | **+10,4** |
| 4× Video @25 %, Anziehungskraft +9,0 | −2,5 | +5,5 | +8,5 |
| 8× Video @25 %, Anziehungskraft +9,0 | −5,0 | +3,0 | +6,0 |
| 1× Video @25 %, Anziehungskraft +15,0 | −0,6 | +13,4 | +16,4 |
| 16× Video @25 %, Anziehungskraft +15,0 | −10,0 | +4,0 | +7,0 |

⚠️ **Die erste Zeile ist die wichtigste.** Seit dem Dauerbetrieb (§6) ist **eine** Agentur auf der Anteils-Stufe der beste Aufbau — mehr Deals bringen kaum mehr Geld, kosten aber vollen Trend. Die Zeilen mit 8–16 Deals beschreiben keinen sinnvollen Spielstil, sondern den Fehler, den man machen kann.

⚠️ **Die Schuld stand zwischenzeitlich auf −4,1** (halbiert), weil sie ohne Gegengewicht nicht bezahlbar, sondern tödlich war: Ruhewert −8,0 gegen drei Kampagnenplätze ergab netto **+1,0**, und ein einziger Video-Deal drückte das auf +0,375 — bei 1 Mio Usern rund 50 Minuten je Verdopplung. Der Netzwerkeffekt bezahlt das jetzt (bei 1 Mio: +4,0 bei k=2), deshalb steht sie wieder bei −7,0. **Wer `NETWORK_K_BASE` senkt, muss die Dark Patterns mitsenken.**

Wer **keine** Dark Patterns nimmt, bekommt dieselben Zahlen um +7,0 besser. Genau so herum soll es sein: die Decke ist für den sauberen Spieler großzügig und für den Dark-Pattern-Spieler knapp. Sie belohnt den Schaden nicht, sie macht ihn überlebbar.

**Gemessen** (30 min ab 1 Mio Usern, Video @25 % auf „Anteil", Dauerbetrieb, drei Kampagnenplätze, alle Dark Patterns **und** alle Vertrauens-Features):

| Agenturen | Ø Trend | User nach 30 min | Geld |
|---|---|---|---|
| **1** | **+9,9** | 15,6× — Kapazitätsdeckel nach 10 min | 739 Mio € |
| 2 | +9,2 | 15,6× | 825 Mio € |
| 6 | +6,7 | 15,6× — deutlich später | 794 Mio € |

Der Trend startet dort bei **−1,0** und steht am Ende bei **+11,0** — nicht weil der Spieler etwas tut, sondern weil die Plattform gewachsen ist. Das ist der Netzwerkeffekt bei der Arbeit, und es ist der Zustand, den §1 mit „durch die Decke" meint: der Engpass ist am Ende die **Serverkapazität**, nicht mehr der Trend.

⚠️ **Zwei Stellen fürs Playtesting, in dieser Reihenfolge:**

1. **Der saubere Spieler in Phase 3.** +15,0 rein für Geld (5.833 €/s, keine Metadaten) bei einem Ruhewert von 0. Das ist die Zahl, an der „Trend ist nicht käuflich" hängt, und in Phase 3 sind 5.833 €/s wenig. Knopf: `mk_monitoring` aus `PR_SLOT_NODES` nehmen (zurück auf vier), **nicht** die Trend-Werte der Kampagnen.
2. **Phase 2 mit drei Plätzen.** +9,0 für 3.500 €/s gegen einen Dark-Pattern-Ruhewert von nur −1,8 (die zwei Phase-2-Muster). Netto also bis +7,2 dauerhaft, zusätzlich zu den Node-Boni. Knopf ist hier die **Voraussetzung** von `mk_team` — es hängt an `mk_partner` und ist damit früh erreichbar; ein Hängen an einer teureren Hauptbaum-Node würde es nach hinten schieben, ohne eine Zahl zu ändern.

⚠️ **Wer weitere Plätze will, hängt sie an eine Node**, nicht an die Phase — `PR_SLOT_NODES` ist genau dafür eine Liste. Ein sechster Platz ist derzeit an keine Node vergeben.

⚠️ **Alte Spielstände verlieren gestapelte Anziehungskraft.** `storage.migrate()` räumt alle `mk:`-Modifikatoren weg und gibt nur den Kampagnen einen Platz zurück, die gerade wirklich laufen. Das ist der Punkt der Umstellung: genau diese Stände sind die, die am Cap kleben.

**Preis-Anker.** Realistischer Betriebspunkt der Werbung ist 25 % Intensität. Dort verkauft Feed Trend für ~957 € je Trend-Sekunde, Search ~2.230, Video ~2.344 — **Banner dagegen nur ~40**. Die Anziehungskraft kauft bei 81 (Marken-Profile) bis 259 (Creator-Beteiligung am Reglerende) €/Trend-Sekunde ein. Daraus folgt beabsichtigt:

| Werbeart verkauft bei | gegen Marken-Profile (81) | gegen Beteiligung (259) |
|---|---|---|
| Feed 957 | 11,8× | **3,7×** |
| Search 2.230 | 27,5× | 8,6× |
| Video 2.344 | 28,9× | 9,0× |
| **Banner 40** | **kann nicht** | **kann nicht** |

- Feed/Search/Video finanzieren ihre eigene Trend-Reparatur. Die Marge auf die Creator-Beteiligung ist mit 3,7× bewusst die knappste — sie ist die Spitzenlast, nicht das Arbeitspferd.
- **Banner kann das nie** — 40 gegen 81. Der Starter wird ökonomisch überflüssig, statt weggenerft werden zu müssen.

  Diese Aussage hat nach der Preiserhöhung vom 2026-08-09 **102 % Luft**. Sie bleibt die eigentliche Obergrenze für `TREND_DECAY_NEG_PER_SEC` — jede Änderung am Malus-Abbau muss sie erneut bestehen.

⚠️ **Die ganze Tabelle steht auf der Stufe `fest`. Auf `fest ×4` vervierfachen sich alle vier Zeilen** (§6): Feed 3.828, Search 8.920, Video 9.376 — und **Banner 160, also über den Marken-Profilen (81)**. Die Zeile „Banner kann nicht" gilt dort wörtlich nicht mehr.

Die Aussage dahinter trägt trotzdem, und zwar aus der Baumstruktur statt aus der Zahl: **`wb_adopt` hängt an `wb_display`.** Wer die Stufe besitzt, hat zwingend Feed-Werbung, und die liefert auf derselben Stufe 3.828 — Banner bleibt um Faktor 24 die schlechtere Wahl und ist nie rational. Es gibt keinen Spielstand, in dem `fest ×4` erreichbar ist und Banner die beste verfügbare Art wäre.

⚠️ **Wer die Zeile wörtlich retten will, ist der Knopf `mult: 2` statt `4`** in `AD_VOLUME_STEPS` (Banner 80 gegen 81) — **nicht** `TREND_DECAY_NEG_PER_SEC` und nicht `trend50` von Banner. Bei `mult: 2` fällt die Brücke allerdings auf 256.000 gedeckte User je Video-Agentur zurück und trägt Phase 2 nur noch halb.

**Die frühere offene Frage „Creator-Beteiligung billiger als Marken-Profile" ist damit erledigt.** Sie kam allein aus dem quadratischen Abkling-Schwanz: der teurere Posten hat den doppelten Wert und profitierte davon überproportional (48 gegen 61 zu ihren Gunsten, in den damaligen Preisen — sie war sofort wirksam *und* insgesamt billiger). Mit dem **festen** Ausklang trägt der Schwanz nur noch einen kleinen Anteil, und die Rangfolge steht wieder richtig: Marken-Profile 81, Creator-Beteiligung 259.

Die Formel dahinter steht als `campaignTrendSeconds()` in `js/state.js`.

### 7.3 Trend-getriebenes Wachstum

Ohne aktives Zutun sammelt der Trend Schübe an, die der Spieler abholt — siehe Sektion 8.

---

## 8. Trend — die Wachstumsrate (ersetzt den früheren "Ruf")

Der Trend ist **wörtlich die User-Wachstumsrate in Prozentpunkten**: Trend +3 heißt, dass pro Zyklus 3 % der aktuellen User dazukommen. Er ersetzt den alten Ruf-Wert vollständig.

**Er wird nie direkt hoch- oder runtergezählt**, sondern ist immer **Grundinteresse + Summe der aktiven Modifikatoren** aus `state.current.trendMods` (`id → { label, value, holdUntil }`). Alle Posten liegen auf einem 0,1-Raster (`trendModValue()` rundet), damit die Aufschlüsselung im Info-Modal per Konstruktion exakt den Gesamtwert ergibt. Neue Effekte registrieren einfach einen weiteren Modifikator.

### Der Netzwerkeffekt — „da sind ja alle"

Der einzige Trend-Posten, der aus der **Plattform selbst** kommt statt aus einem Kauf oder einem Feature — und der einzige, der von allein steigt.

```
Netzwerkeffekt = k × log10(User / 10.000) × Sättigung,   Boden 0

Sättigung = 1                            bis 1 Mrd   (Gipfel)
          = 1 − ((User − 1 Mrd) / 2 Mrd)²  bis 3 Mrd   (die Welt füllt sich)
          = 0                            ab  3 Mrd
```

| User | k = 2,0 (Grundwert) | k = 3,0 (alle Vertrauens-Features) |
|---|---|---|
| 100k | +2,0 | +3,0 |
| 500k | +3,4 | +5,1 |
| 1 Mio | +4,0 | +6,0 |
| 10 Mio | +6,0 | +9,0 |
| 100 Mio | +8,0 | +12,0 |
| **1 Mrd** | **+10,0 MAX** | **+15,0 MAX** |
| 1,5 Mrd | +9,4 | +14,1 |
| 2 Mrd | +7,5 | +11,3 |
| 2,5 Mrd | +4,4 | +6,6 |
| **3 Mrd** | **0** | **0** |

Bis er dazukam (2026-08-06) war Größe im Trend-System schlicht nicht vertreten: Features gaben Strohfeuer, Anziehungskraft war gekauft, Dark Patterns zogen runter. **Dass eine große Plattform allein deshalb attraktiv ist, weil sie groß ist, stand nirgends** — dabei ist das die zentrale Aussage über soziale Netzwerke überhaupt.

⚠️ **Logarithmisch, nicht linear.** Jede Verzehnfachung gibt dieselbe Portion. Linear wäre bei 8 Mrd Usern jede andere Trend-Quelle Staub, und die Kurve liefe dem Spieler weg, statt ihn zu belohnen.

⚠️ **`NETWORK_U0` = 10.000 ist mit Bedacht gewählt:** dort steht der Posten auf 0. Phase 0/1 (bis 1.000 User) bleibt vollständig unberührt, und der Effekt setzt genau dann ein, wenn Phase 2 anfängt zu tragen.

#### Die Sättigung (2026-08-07)

**1 Mrd ist seitdem der Gipfel, nicht mehr der Deckel.** Danach fällt der Posten wieder und ist bei 3 Mrd auf 0. Der Grund liegt in dem, was der Trend *ist* — eine **Wachstumsrate**: „da sind ja alle" hört auf zu ziehen, wenn wirklich alle da sind. Bei 3 Mrd ist die Plattform nicht unattraktiv geworden, es ist nur niemand mehr übrig, den sie anziehen könnte.

Vorher hörte die Kurve bei 1 Mrd einfach auf. Das war als Aussage schon fast richtig („die Weltbevölkerung ist die natürliche Obergrenze"), hat sie aber als **flache Decke** umgesetzt statt als Sättigung — und eine flache Decke heißt: das letzte Drittel des Spiels passiert an einem Wert, der sich nicht mehr bewegt.

⚠️ **Die Kurve ist quadratisch und nicht linear, damit sie am Gipfel waagerecht ist** (Ableitung 0 bei 1 Mrd). Linear gäbe es dort einen Knick: eben noch +2,0 je Verzehnfachung, im nächsten Moment fallend. So flacht sie ab, kippt und wird erst zum Ende hin richtig steil — von 1,0 auf 1,5 Mrd kostet es 0,6, von 2,5 auf 3,0 Mrd volle 4,4.

⚠️ **Über 3 Mrd bleibt er bei 0 und wird NICHT negativ.** Sonst wäre die Weltbevölkerung eine Wand, gegen die kein Kampagnenplatz und kein Feature mehr ankommt. So ist sie Gegenwind: der Spieler kann darüber hinauswachsen, es kostet ihn nur den größten Trend-Posten, den er hatte.

⚠️ **Damit hat das Spätspiel ein Gleichgewicht statt einer Decke.** Wächst die Plattform in die Sättigung, sinkt ihre Wachstumsrate, bis der Netto-Trend 0 erreicht; schrumpft sie, steigt er wieder. Das ist eine stabile Rückkopplung (der Posten fällt monoton mit den Usern), also kein Schwingen, sondern eine Ruhelage — und die Stelle, an der aus „mehr User" endlich wieder eine Entscheidung wird. **Wer diese Ruhelage verschieben will, dreht an `NETWORK_FULL`, nicht an `k`** — `k` hebt die ganze Kurve und damit auch alles darunter.

⚠️ **Die Sättigung hängt bewusst nicht an `k`.** Ein Vertrauens-Feature macht die Plattform attraktiver, es schafft keine zusätzlichen Menschen. Beide Spalten der Tabelle laufen deshalb bei 3 Mrd auf dieselbe 0 zu.

⚠️ **Unterhalb von 1 Mrd ändert sich kein einziger Wert.** Sämtliche Rechnungen in §7.2 und §9 (Ruhewert, Anziehungskraft-Decke, `k_max` = 3,0) sind gegen 10 Mio bis 1 Mrd geeicht und bleiben gültig. Betroffen ist ausschließlich die Zone dahinter — und dort wird die Kopffreiheit unter `TREND_MAX` größer, nicht kleiner.

⚠️ **Boden bei 0.** Ohne ihn zöge eine schrumpfende Plattform sich selbst ins Minus — der Posten würde aus einer Belohnung eine zweite Strafe. Die Rückkopplung nach unten (weniger User → kleinerer Effekt → noch weniger User) bleibt auch so bestehen; sie *soll* es, Plattformen kippen wirklich so. Sie soll nur nicht unter null weiterlaufen.

**`TREND_MAX` musste dafür von 20 auf 40.** Der Grund ist nicht „mehr Wachstum", sondern eine Inversion: bei 20 lag ein sauber gespielter Spätspiel-Aufbau bei ~30 und damit am Anschlag — und **am Anschlag kosten Dark Patterns gar nichts.** Der Datenkraken-Spieler und der saubere Spieler hätten denselben Trend, ausgerechnet im Spätspiel. Bei 40 bleiben ~10 Kopffreiheit.

### Gute Features nutzen sich ab, Schaden bleibt

Das ist die zentrale Asymmetrie des Systems — und der pädagogische Kern:

| | Wirkung | Dauer |
|---|---|---|
| Features, die User mögen | `trendBonus` | **befristet** — 60 s voll, dann abklingend |
| Werbedeals | Modifikator | **befristet** — Deal + 30 s, dann abklingend |
| Anziehungskraft | Modifikator | **befristet** — Laufzeit, dann 60 s bis auf null |
| **Dark Patterns** 🔴 | `trendBase` | **dauerhaft** — verschiebt den Ruhewert, für immer |
| **Vertrauens-Features** 🌱 | `networkK` | **dauerhaft** — hebt die *Steigung* des Netzwerkeffekts |

Die letzten beiden sind bewusst **kein Spiegel**, sondern zwei verschiedene Formen:

- **Dark Pattern** — sofort spürbar, konstant, wird mit der Plattform relativ kleiner (−7,0 sind bei einem Trend von 30 nicht mehr viel)
- **Vertrauens-Feature** — heute fast nichts, wächst mit jeder Verzehnfachung mit

Daraus entsteht der Bogen, den das Spiel erzählen soll, ganz ohne Warntext: **Dark Patterns sind die Abkürzung, die sich großartig anfühlt und die man überwächst.** Wer sie nimmt, gewinnt die erste halbe Stunde; wer die Vertrauens-Features baut, gewinnt das Endspiel. Der Schüler liest das an seinen eigenen Zahlen ab, statt es gesagt zu bekommen.

Ein neues Feature ist ein Strohfeuer: die Leute reden kurz darüber, dann ist es normal. Ein Dark Pattern dagegen beschädigt den Ruf bleibend. `trendBase` ist die **einzige** Stelle im Spiel mit unumkehrbarer Trend-Wirkung.

Anziehungskraft steht bewusst dazwischen und klingt als einzige Quelle **nicht** über die globale Rate ab: sie hallt nicht nach, sie endet. Ein Feature ist ein Gespräch, das verebbt — ein gebuchter Vertrag läuft aus (§7.2).

### Befristete Modifikatoren

Jeder Modifikator in `trendMods` durchläuft zwei Phasen:

1. **Halten** — voller Wert bis `holdUntil`
2. **Abklingen** — der Betrag läuft gegen 0, dann räumt `pruneTrendMods()` ihn weg. Das Tempo hängt am Vorzeichen (`trendDecayFor()`): positive Posten mit `TREND_DECAY_PER_SEC` (0,1 je 20 s), **negative viermal schneller** mit `TREND_DECAY_NEG_PER_SEC` (0,1 je 5 s)

Ein Modifikator darf eine **eigene Rate** mitbringen (`m.decay`), die beides schlägt. Bisher nutzt das nur Anziehungskraft: dort wird sie beim Buchen als `wert / PR_DECAY_SEC` festgehalten, damit der Ausklang immer 20 s dauert — unabhängig vom Wert (§7.2). Derselbe Weg steht einer negativen Quelle offen, die einen langen Schwanz braucht (Shitstorm-Event).

⚠️ **Die Rate muss aus dem Buchungswert gerechnet und gespeichert werden**, nicht laufend aus dem Restwert. Sonst wäre das Abklingen exponentiell statt linear und der Modifikator erreichte nie 0.

⚠️ **Die Asymmetrie beim Abklingen ist neu und widerspricht der früheren Festlegung „pos/neg nicht trennen".** Sie kam mit der kubischen Malus-Kurve (§6): weil der Abkling-Schwanz quadratisch im Wert ist, wuchs er beim doppelten Malus am Reglerende auf das Vierfache. Ein Banner @50 % hätte 2.000 s zum Ausklingen gebraucht und allein 10.800 Trend-Sekunden gekostet — mehr, als der gesamte Hauptbaum an positivem Trend liefert. Das war keine teure Entscheidung mehr, sondern eine unumkehrbare.

Die Asymmetrie „Gutes nutzt sich ab, Schaden bleibt" trägt weiterhin — sie sitzt jetzt aber **ausschließlich** bei `trendBase` (Dark Patterns), wo sie hingehört. Werbung ist ein laufender Betriebsposten und soll verzeihen; ein Dark Pattern nicht.

⚠️ **Obergrenze für den Faktor.** Dort, wo ein Banner-Deal genug einbrächte, um seine eigene Anziehungskraft-Reparatur zu bezahlen, fiele die Design-Aussage „Banner macht sich selbst überflüssig" (§6/§7.2). Bei ×4 liegt Banner mit 40 gegen 81 €/Trend-Sekunde darunter — mit **102 % Luft** (Vertrags-Umbau und Preiserhöhung zusammen; vor beidem waren es 16 %). Der frühere harte Deckel bei ×9 ist damit weiter weg, aber die Zeile bleibt die Prüfung, die jede Änderung am Malus-Abbau bestehen muss.

| Quelle | Wann gesetzt | Haltezeit |
|--------|--------------|-----------|
| **Werbedeal** | sofort beim Buchen | solange der Deal produziert, **+30 s** danach |
| **Techtree-Node** | beim **Einsammeln** der fertigen Node (nicht schon beim Fertigwerden) | **60 s** |

Ein Banner @50 % (seit der kubischen Kurve **−10,0**) liegt also über den ganzen Deal (50 s) plus 30 s voll an und braucht danach 500 s zum Ausklingen. Deal-Abbruch beendet den Malus **nicht** — Abbrechen ist kein Notausgang aus dem Rufschaden. Eine Neubuchung ersetzt den Modifikator derselben Agentur, statt zu stapeln.

Weil alles über absolute Zeitstempel läuft, stimmt der Zustand nach einer Pause automatisch — es muss nichts nachgerechnet werden.

### Grundinteresse verebbt

Der Startbonus (`TREND_BASE_START` = +3) ist **kein Modifikator**, sondern wird aus `phase2Sec` berechnet: linear auf 0 über `TREND_BASE_FADE_SEC` = 300 s **Phase-2-Spielzeit**. Offline-Zeit zählt bewusst nicht mit — sonst wäre der Bonus nach der ersten Nacht weg, ohne dass man ihn erlebt hat.

Nach fünf Minuten ist das Grundinteresse aufgebraucht. Der Ruhewert ist dann **Netzwerkeffekt minus Dark-Pattern-Schuld**: `trendBaseValue()` = Grundinteresse + Netzwerkeffekt + Summe aller `trendBase`-Verschiebungen. Wer beide Phase-2-Dark-Patterns nimmt, trägt −2,5, über alle fünf sind es **−7,0** — dagegen steht der Netzwerkeffekt, der bei 100k Usern schon +2,0 bringt und mit jeder Verzehnfachung um k wächst.

Beide Anteile werden aus dem Techtree **abgeleitet**, nicht gespeichert (`trendBaseMods()`) — eine geänderte Balance wirkt dadurch sofort auch auf alte Spielstände. Im Info-Modal steht jedes Dark Pattern als eigene Zeile mit dem Vermerk „dauerhaft"; ein unerklärter negativer Ruhewert wäre sonst nicht nachvollziehbar.

| Größe                | Wert |
|----------------------|------|
| Zyklus               | 12 s |
| Stapel               | max 5 (= 60 s gebunkert) |
| Spanne               | −20 … **+40**, Alltagsbereich +5 … +15 |
| Einlösen             | linear: `User += User × Trend% × Stapel` |
| Negativ-Abrechnung   | im selben 12-s-Takt, `User × \|Trend\|%` pro Zyklus |
| Schadensbegrenzung   | Klick → 45 s halbe Abrechnung, Cooldown 60 s |

**Positiver Trend** stapelt bis 5 Zyklen und wartet dann auf den Klick. Der Ernte-Button sitzt **unter** der Trend-Kachel in der Ressourcen-Bar (nicht auf einem Gebäude) und zeigt die absolute User-Zahl. Beim Klick fliegen die User sichtbar zur User-Kachel.

**Negativer Trend** stapelt nicht, läuft aber auf **demselben 12-s-Takt**: bei jedem Zyklus fällt genau ein Brocken User weg — sichtbar als fallende Zahl aus der Kachel. Der Wert ist der, den die Kachel ohnehin anzeigt (`−500 / 12 s`), und jeder Zyklus rechnet auf dem neuen Stand (Zinseszins nach unten). Der Klick wechselt dort die Bedeutung: statt Ernte gibt es **Schadensbegrenzung**, die die Abrechnung halbiert. Gebunkerte Stapel bleiben erhalten, lassen sich aber erst wieder einlösen, wenn der Trend positiv ist.

Beide Richtungen teilen sich `trendCycleTime` — es gibt nur eine Uhr, und die Trend-Richtung entscheidet, was beim Schlag passiert.

**Offline** (`actions.offlineCatchUp`, aufgerufen aus `main.js`): die Abwesenheit wird auf `OFFLINE_CATCHUP_SEC` = **120 s** gedeckelt und in diesem Fenster nachgerechnet. Eine Nacht bringt damit dasselbe wie zwei Minuten.

**Die Stapelgrenzen bleiben unangetastet, der Überschuss wird geerntet.** Watchtime- und Trend-Stapel füllen sich wie bisher bis 5; alles darüber landet direkt im Watchtime-Lager bzw. als User auf dem Konto. Der Grund ist eine Rollenverteilung: „max 5 Stapel, dann steht die Produktion" ist eine **Live**-Regel, sie erzwingt das Ernten. Offline kann niemand ernten — dort wäre sie keine Entscheidung mehr, sondern nur eine Deckelung, und genau die hat den Rückkomm-Moment gekostet, von dem ein Idle-Spiel lebt.

⚠️ **Der Trend-Überschuss läuft durch `freeUserCapacity()`.** Was nicht mehr in die Serverkapazität passt, verfällt. Der Aufholpass darf die Aussage „Serverkapazität ist der Engpass" nicht umgehen.

⚠️ **Nach unten gilt das Fenster NICHT: negativer Trend kostet weiterhin höchstens `TREND_STACK_MAX` = 5 Zyklen.** Die Asymmetrie ist gewollt — das Fenster ist eine Belohnung fürs Wiederkommen und darf nicht ausgerechnet den härter treffen, der ohnehin schon im Minus steht.

⚠️ **Die Reihenfolge im Aufholpass ist seitdem eine Balance-Größe.** Erst die Farmen, dann die Werbedeals: die offline produzierte Watchtime liegt dadurch wirklich im Lager und speist die Agenturen. Ein Dauerbetrieb-Deal wird über eine Abwesenheit spürbar ergiebiger als vorher, und das ist die Stelle, an der ein deutlich größeres Fenster zuerst kippen würde — **wer `OFFLINE_CATCHUP_SEC` anhebt, prüft hier**, nicht bei der Watchtime.

**Der Ereigniskarten-Takt bleibt außen vor** (§9.5): auch im Fenster wird höchstens eine Runde gezogen.

⚠️ **Die gemeldete Abwesenheit im Rückkehr-Fenster ist die ECHTE, nicht das Fenster.** „8 Stunden weg, das kam dabei heraus" ist die ehrliche Aussage; dass nur die ersten zwei Minuten zählen, ist eine Spielregel und gehört nicht in eine geschönte Zahl.

**Wodurch steigt der Trend?** Der **Netzwerkeffekt** (dauerhaft, wächst mit der Plattform, s. o.), Grundinteresse (verebbt), eingesammelte Techtree-Nodes (60 s Rückenwind), **Vertrauens-Features** (dauerhaft, über die Steigung) und die **Anziehungskraft im Marketing-Center** (Creator-Beteiligung / Marken-Profile, beliebig oft, Sektion 7.2).
**Wodurch sinkt er?** Laufende Werbedeals (`trend50 × (i/0.5)²` je Agentur, siehe Sektion 6) und **Serverprobleme** (siehe unten); später Metadaten-Verkauf, aggressive Kampagnen, Shitstorm-Events.

### Serverprobleme — ein Modifikator für zwei Ursachen

`server:trouble`, **−2,0**, ausgelöst durch:

1. eine **belegte** Serverfarm ohne Versorgung (Sektion 4), oder
2. **volle Serverkapazität** — der seit Langem geparkte „keiner hat Bock mehr"-Malus.

**Bewusst nicht additiv.** Beides gleichzeitig bleibt −2,0. Für den User sind es dasselbe Erlebnis („da geht nichts mehr"), und zweimal −2,0 wäre für denselben Eindruck doppelt bestraft.

⚠️ **Leere Farmen zählen nicht.** Eine Farm, in der niemand wohnt, darf dunkel dastehen — sonst wäre Vorbauen nicht nur teuer, sondern auch rufschädigend, und der Kapazitätspuffer, den Phase 3 braucht, wäre unbezahlbar.

Der Modifikator wird gehalten, solange das Problem besteht, und klingt danach mit der normalen Negativ-Rate ab (100 s für die vollen −2,0). Abstellen ist also keine Sofort-Amnestie — aber auch keine Strafe, die nachhallt.

⚠️ **Das ist der Baustein, der „keine Werbung schalten und einfach warten" bremst** (das gemessene Spätspiel-Problem). Ohne ihn kosten unversorgte Farmen nur Watchtime — die User wachsen über den Netzwerkeffekt weiter, und Nichtzahlen wäre bloß langsam statt falsch.

**Zwei wiederholbare positive Quellen.** Die Techtree-Boni sind endlich (jeder Node einmal), Dark Patterns drücken den Ruhewert dauerhaft, und Werbung erzeugt beliebig oft nachschiebbaren Gegenwind. Dagegen stehen: der **Netzwerkeffekt** (wächst von allein mit der Plattform, kostet nichts, braucht keinen Klick) und die **Anziehungskraft** — Creator-Beteiligung (bis +3,0 / 60 s) und Marken-Profile (+1,5 / 300 s), nachbuchbar und mit Geld bezahlt, aber nur so oft, wie Plätze frei sind (Sektion 7.2).

Damit ist der Trend eine **handelbare Ressource**: Werbedeals verkaufen ihn, Anziehungskraft-Kampagnen kaufen ihn zurück. Die Intensität ist der Wechselkurs, die Werbeart bestimmt, wie gut er ist.

**Was das nicht löst:** Wer beide Phase-2-Dark-Patterns nimmt, hat einen Ruhewert von −1,8 und muss ihn dauerhaft mit Anziehungskraft-Kampagnen gegenfinanzieren. Das ist Absicht — der Schaden bleibt, er wird nur bezahlbar statt tödlich.

**Bewusst noch nicht drin** (kommt später):
- Trend als Multiplikator auf die Werbeerträge — gehört in den Werbeagentur-Umbau, damit er dort auch angezeigt wird
- Trend-Events (Shitstorm/Viral)

---

## 9. Techtree

Alle Nodes stehen in `NODES` (`js/techtree.js`). Jede Node hat ein **`phase`**-Feld: sie taucht erst auf, wenn die Phase erreicht ist — nicht als graue gesperrte Karte, sondern gar nicht. Phase 0/1 sieht dadurch exakt aus wie vorher.

### Entwicklungs-Plätze — HQ und Bürogebäude

Wie viele Entwicklungen **gleichzeitig** laufen, hängt an der Zahl der Gebäude, in denen entwickelt werden kann:

```
Plätze = 1 (HQ)  +  Anzahl Bürogebäude
```

Ein Platz ist belegt, solange seine Node läuft **oder** fertig auf das Abholen wartet. Das ist Absicht: sonst ließen sich Nodes stapeln, ohne sie je einzusammeln, und der Trend-Bonus (der erst beim Abholen greift, Sektion 8) wäre beliebig aufschiebbar.

**Nur `tab: 'entwicklung'` belegt einen Platz.** Marketing- und Werbung-Nodes laufen weiter unbegrenzt parallel — sie bauen keine Features, sondern schalten frei.

Ein Gebäude bekommen sie trotzdem: **jede** Node merkt sich, wo sie entwickelt wird, sonst hätten Fortschritts-Ring und Abhol-Button keinen Ort. Weil Ring und Button zwei getrennte Elemente sind, dürfen sie unterschiedliche Nodes zeigen — läuft eine Entwicklung, während eine Marketing-Node abholbereit ist, dreht sich der Ring weiter **und** der Button steht bereit. Bei mehreren Kandidaten gewinnt die Entwicklung, weil sie diejenige ist, die den Platz blockiert; die übrigen rücken nach, sobald sie abgeholt ist.

**Das Bürogebäude** (`BUILDING_TYPES.buero`, Sprite aus v1) ist 1×1, kostet **15.000 € flach und unbegrenzt oft** und ist ab Phase 2 im Shop. Ein Klick darauf öffnet denselben Techtree wie das HQ — es ist ein weiterer Platz, kein eigener Baum.

⚠️ **Der Preis ist der Balance-Knopf, nicht die Slot-Regel.** Bis dahin war der eine HQ-Platz die Haupt-Bremse von Phase 2. 15.000 € liegen bewusst auf der Höhe von Werbeagentur und Marketing-Center und damit **über den meisten Nodes, die das Büro beschleunigt** — Parallelität ist eine Investition, die sich erst über mehrere Nodes rechnet. Bei 5.000 € wäre „erst mal vier Büros kaufen" der immer richtige Eröffnungszug gewesen, und die Pacing-Bremse wäre ersatzlos weg.

**Technisch** merkt sich der Techtree-Eintrag, auf welchem Gebäude seine Node läuft: `techtree[nodeId].slot = instanceId`. Daran hängen Ring, Abhol-Button und Feuerwerk — jedes Gebäude zeigt nur seine eigenen Nodes (`RT.techtree.nodesAtBuilding()` liefert `{ active, ready }`). Startet man aus einem Gebäude heraus, bekommt es die Node, sofern der Platz frei ist; sonst der nächste freie in Kauf-Reihenfolge (HQ zuerst). Marketing/Werbung prüfen nichts und landen einfach im geöffneten Gebäude. Alte Spielstände ohne `slot` fallen aufs HQ zurück, `storage.migrate()` schreibt es fest.

⚠️ `RT.techtree.activeNode()` / `readyNode()` liefern seitdem **irgendeine** laufende bzw. fertige Node — für alles Gebäudebezogene ist `nodesAtBuilding()` die richtige Abfrage.

### Phase 0/1 (8 Nodes)

Kern-Baum bis zum Go-Live (`frontend1`, `backend1`, `account`, `feed`, `bilder`) plus die drei Nodes, die man auf dem Weg zu 1.000 Usern mitnimmt (`mk_freunde`, `mk_flyer`, `wb_coop`).

### Phase 2 — Hauptbaum (13 Nodes)

Alle geben einen **befristeten Trend-Modifikator** (`trendBonus` → `trendMods['node:<id>']`) und kosten **Server-Kapazität**, die aus den Farmen kommt. Das koppelt den Techtree an den Farm-Loop: wer forschen will, muss ausbauen.

| Node | Hängt an | € | Dauer | Server | Trend |
|------|----------|---|-------|--------|-------|
| Frontend v2 (Mobile) | frontend1 | 2.000 | 80 s | 600 | +2,0 |
| Backend v2 | backend1 | 5.000 | 120 s | 900 | +1,0 |
| Like-Funktion | feed | 1.000 | 40 s | 300 | +3,0 |
| Kommentare | feed | 1.500 | 40 s | 300 | +4,0 |
| Teilen-Funktion | feed | 2.000 | 40 s | 300 | +5,0 |
| Logo Redesign¹ | frontend2 | 3.000 | 40 s | 400 | +2,0 |
| Direktnachrichten | backend2 | 12.000 | 160 s | 8.000 | +6,0 |
| Gruppen | backend2 | 8.000 | 120 s | 4.000 | +4,0 |
| Suchfunktion | backend2 | 6.000 | 80 s | 600 | +1,0 |
| Videos hochladen | backend2 | 30.000 | 240 s | 20.000 | **+12,0** |
| Umfragen | kommentar | 4.000 | 40 s | 300 | +2,0 |
| Events-Feature | gruppen | 10.000 | 80 s | 6.000 | +4,0 |
| Unternehmensprofile² | gruppen + suche | 12.000 | 160 s | 12.000 | +3,0 |

### ⚠️ Die Verdopplung vom 2026-08-04 — Dauer und Trend gehören zusammen

Gemessen: 13 von 13 Nodes in 20 Minuten war zu viel, angepeilt sind **~8**. Deshalb haben alle 13 Nodes `durationSec` **und** `trendBonus` verdoppelt bekommen (620 s → 1.240 s, +24,5 → +49,0).

Dass das Wachstum dabei ungefähr stehen bleibt, ist Rechnung und nicht Zufall. `trendBonus` ×2 heißt **Wirkung ×3,66**, weil der Abkling-Schwanz quadratisch im Wert ist:

| | Trend-Sekunden |
|---|---|
| 13 Nodes, alte Werte | 8.595 |
| 8 Nodes, neue Werte | 8.920 |

**Wer die Dauer wieder senkt, ohne den Trend mitzusenken, kippt genau diese Balance.** Die beiden Faktoren sind ein Paar, kein unabhängiges Stellschrauben-Duo.

Zwei Folgen, die im Test zu beobachten sind:

1. **Der Cap von +20 fängt an zu beißen.** Videos allein ist +12,0. Zwei größere Nodes kurz nacheinander abgeholt, und der Überhang verfällt lautlos. Knopf dafür ist `TREND_MAX`, nicht die Einzelwerte.
2. **Die Trend-Kurve wird spitzer** — gleiche Fläche, weniger und größere Ausschläge. Dadurch entsteht Timing-Spiel, das es vorher nicht gab: ein Werbedeal im Peak kostet fast nichts (gegen den Cap gerechnet sogar gar nichts), derselbe Deal im Tal drückt in die Abwanderung. Bewusst nicht wegbalanciert.

**Die Werbe-Maluswerte (`trend50`) wurden absichtlich NICHT mitgezogen.** Die positive Seite liefert unterm Strich dasselbe wie vorher (Tabelle oben), also ist das Verhältnis Werbung : Wachstum unverändert — eine Verdopplung wäre ein reiner Nerf gewesen und hätte die gerade erst neu geeichten Preis-Anker aus Sektion 7.2 nochmal verschoben.

¹ **Logo Redesign** tauscht zusätzlich das Firmenlogo aus: jedes der 8 Motive hat eine aufgeräumte Profi-Variante (`Logo3.png` → `Logo3nice.png` in `sprites/Firmen logos/`). Die Umschaltung passiert zentral in `RT.assets.logoSrc()`, gesteuert über `RT.state.logoUpgraded()` — keine Aufrufstelle muss den Techtree kennen. Beim Abschluss zeigt ein Modal vorher/nachher nebeneinander; der Trend-Wert darin kommt aus der Node-Definition, nicht aus dem Text.

² **Unternehmensprofile** ist die technische Voraussetzung der gesamten Anziehungskraft-Achse im Marketing-Reiter (siehe unten) — `mk_presse` und alles dahinter. Firmen bekommen eigene, verifizierte Profile — beide Vorbedingungen sind inhaltlich zwingend und nicht dekorativ: ein Firmenprofil **ist** technisch eine Gruppe, und ohne Suche findet es niemand. Weil der Node dadurch auf Ebene 4 des Hauptbaums liegt, wird die Anziehungskraft-Kette tief, ohne dass der Marketing-Reiter künstlich verlängert werden muss.

**Die Trend-Boni sind Einmal-Effekte**, keine Dauerwirkung: beim Einsammeln 60 s voll, danach abklingend (Sektion 8). Die Spalte oben ist also der Ausschlag im Moment des Einsammelns, nicht ein Guthaben.

**Woher die Werte kommen.** Es sind die `rufBonus`-Werte aus v1. Sie lagen zwischenzeitlich bei einem Drittel bis der Hälfte davon — die beiden Dark Patterns waren aber **1:1 aus v1 übernommen**. Dadurch war der Schaden auf v1-Maßstab kalibriert und der Nutzen auf einen halb so großen; die Dark Patterns wirkten dominant, ohne dass ihre eigenen Zahlen schuld waren. Beide Seiten stehen jetzt wieder auf demselben Maßstab.

Zwei Dinge dazu:

- **Beim Vergleich mit v1 aufpassen:** dort war der Ruf auf **+6** gedeckelt und wurde **pro Monat** (Button-Klick) abgerechnet. Hier ist der Cap **+20** und die Uhr läuft alle 12 s automatisch. Videos (+6,0) heißt ×1,34 User pro Minute, solange der Bonus voll anliegt. Falls das zu wild wird: an `TREND_HOLD_NODE_SEC` drehen, nicht an den Einzelwerten — das erhält die Rangfolge der Nodes.
- **Größere Werte wirken überproportional.** Weil der Decay linear im Betrag läuft, hat ein größerer Bonus einen proportional längeren Schwanz: Videos mit +1,5 ergibt 315 Trend-Sekunden, mit +6,0 sind es 3.960 — Wert ×4, Wirkung ×12,6.

  ⚠️ **Daraus folgt: ein flacher Aufschlag und ein Faktor sind zwei verschiedene Werkzeuge.** „Jede Node +0,5" verdreifacht die Wirkung der kleinsten Nodes (+0,5 → +1,0) und hebt Videos um 17 % — es **ebnet die Rangfolge ein** und macht die Summe ×1,40. „Alle ×1,5" lässt die Rangfolge exakt stehen und macht die Summe ×2,11. Wer mehr Gesamt-Trend will, nimmt den Faktor; wer findet, dass sich die kleinen Nodes wertlos anfühlen, nimmt den flachen Aufschlag.

Die Summe (+54,0 über alle 17 trend-positiven Nodes) liegt weit über dem Cap — siehe den Warnkasten oben, seit der Verdopplung ist das nicht mehr nur ein theoretischer Extremfall.

**Server-Budget: 53.700 im Hauptbaum, 80.400 über alle vier Zweige** (Hauptbaum 53.700 · Watchtime 17.300 · Werbung 6.300 · Marketing 3.100). Eine Huhn-Farm fasst 16.000 — nicht mal der Hauptbaum allein ist ohne Farm-Ausbau durchforschbar, und das ist Absicht.

⚠️ **Der Server-Anteil ist bewusst klein gehalten, obwohl er als Bremse taugen würde.** Die fünf tiefen Nodes haben am 2026-08-04 den Faktor 3–4 bekommen (Videos 5.000 → 20.000, Unternehmensprofile 2.500 → 12.000, Direktnachrichten 2.000 → 8.000, Events 500 → 6.000, Gruppen 1.200 → 4.000) — mehr nicht, und zwar aus einem **didaktischen** Grund: Schüler sollen auf den Farmen sehen, dass dort **User** wohnen. Features sind Beiwerk. Bei 780.000 Usern belegt der komplette Hauptbaum ~7 % der Kapazität: spürbar beim Bauen, aber das Bild bleibt richtig.

Wer den Baum bremsen will, dreht deshalb an `durationSec` (im Paar mit `trendBonus`, siehe oben) — **nicht** an `server`. Ein Entwurf mit ~400.000 Server im Hauptbaum hätte den Baum sauber limitiert, aber die Farmen in Feature-Lager verwandelt und damit die Kernaussage des Spiels beschädigt.

### Phase 2 — Watchtime-Achse (6 Nodes)

Die Gegenachse zum Hauptbaum. Alle geben einen **dauerhaften** Watchtime-Multiplikator (`watchtimeMult`, multiplikativ, greift beim Ernten). Der Unterschied liegt beim Trend — siehe die Asymmetrie in Sektion 8.

| Node | Hängt an | € | Dauer | Server | Watchtime | Trend |
|------|----------|---|-------|--------|-----------|-------|
| Push-Benachrichtigungen | like + dm | 15.000 | 80 s | 1.500 | +5 % | +0,5 befristet |
| Streaks & Abzeichen | gruppen | 12.000 | 60 s | 800 | +10 % | +1,5 befristet |
| Stories | videos | 20.000 | 120 s | 4.000 | +10 % | +1,0 befristet |
| Live-Streaming | videos | 40.000 | 140 s | 8.000 | +20 % | +2,0 befristet |
| **Infiniter Scroll** 🔴 | feed | 5.000 | 60 s | 1.500 | +15 % | **−1,0 dauerhaft** |
| **Autoplay** 🔴 | stories | 8.000 | 60 s | 1.500 | +15 % | **−1,5 dauerhaft** |

Alle sechs zusammen: **×2,02 Watchtime**. Die beiden Dark Patterns (`darkPattern: true`) bekommen im Baum eine eigene Optik und im Detail einen Warn-Chip — die Entscheidung ist unumkehrbar und soll sich auch so anfühlen.

Der Multiplikator ist in der Ressourcen-Bar als Chip an der Watchtime-Kachel sichtbar; ein Klick öffnet die Aufschlüsselung.

### Vertrauens-Features (White Patterns) — 3 Nodes

Das Gegenstück zu den Dark Patterns, aber in anderer **Form**: sie geben keinen Sockel, sondern heben `networkK` — die Steigung des Netzwerkeffekts (§8). Alle drei sind inhaltlich Dinge, die die Plattform **praktisch** machen; keins davon hat einen Haken. Das ist der Punkt.

| Node | Tab | Phase | Hängt an | € | Dauer | Server | Δk | jetzt bei 1 Mio | bei 100 Mio |
|---|---|---|---|---|---|---|---|---|---|
| **Barrierefreiheit** 🌱 | entwicklung | 2 | frontend2 | 25.000 | 200 s | **30.000** | +0,25 | +0,5 | +1,0 |
| **Moderations-Team** 🌱 | entwicklung | 3 | kommentar + gruppen | 45.000 + 200k 🗃️ | 250 s | **80.000** | +0,35 | +0,7 | +1,4 |
| **Offene Schnittstelle** 🌱 | entwicklung | 3 | backend2 + suche | 60.000 | 300 s | **120.000** | +0,40 | +0,8 | +1,6 |

Zusammen **+1,00**, also `k` von 2,0 auf **3,0** — der Netzwerkeffekt wird um die Hälfte steiler.

⚠️ **`k_max` = 3,0 ist gerechnet, nicht geraten.** Der Abstand zwischen sauberem und Dark-Pattern-Spieler ist immer 7,0 (die Schuld ist ein flacher Abzug); was `k` ändert, ist nur die **Kopffreiheit unter `TREND_MAX`**. Bei 1 Mrd Usern mit 5 Plätzen: k=3,0 → 29,4 (10,6 Luft), k=4,0 → 34,4 (5,6, bricht beim ersten Techtree-Bonus), **k=5,0 → 39,4 (0,6 — und damit ist die Inversion zurück, wegen der `TREND_MAX` überhaupt angehoben wurde).**

⚠️ Die Rechnung steht **auf** dem Gipfel (1 Mrd) und ist damit der engste Punkt der ganzen Kurve — die Sättigung dahinter (§8) macht die Luft nur größer, nie kleiner. `k_max` bleibt also gültig, ohne dass es nachgerechnet werden muss.

⚠️ **Sie kosten viel Server, und zwar absichtlich — das ist ihr einziger Balance-Knopf.** Zum Maßstab: der komplette Hauptbaum belegt 53.700, die Offene Schnittstelle allein mehr als das Doppelte. Im Belegungs-Balken der Farm ist das ein Block, den man nicht übersieht, und er ist dauerhaft (`programmCapacity()` zählt fertige Nodes für immer). „Das ist Code, der liegt auf deinen Farmen" ist damit wörtlich wahr.

⚠️ **Bewusste Abweichung von der Regel weiter unten** („wer den Baum bremsen will, dreht an `durationSec`, **nicht** an `server`"). Die steht dort, damit die Farmen nicht zum Feature-Lager werden — bei drei Nodes trägt das Bild noch, bei dreißig nicht mehr.

⚠️ **Kosten können den Bonus ohnehin nicht ausbalancieren.** `networkK` wirkt auf die Wachstums**rate**, Kapazität ist linear: 30 % Kapazität weg sind bei +10 %/min nach drei Minuten wieder drin. Die Kosten entscheiden nicht *ob*, sondern **wann und in welcher Reihenfolge** — sie sind Taktung, nicht Balance.

⚠️ **Verworfen: das Gegenspieler-Paar.** „Chronologischer Feed" sollte sich mit „Infiniter Scroll" gegenseitig ausschließen — die einzige Variante mit einer echten Entscheidung. Sie scheitert daran, dass `infiniteScroll` ein Dark Pattern **und** Pflichtstation zu `wb_adserver` ist; flächendeckend geht es also nicht, und ein einzelnes Paar wäre eine Sonderregel für einen Fall. Falls es doch kommt, ist der Feed die einzige saubere Stelle.

  ⚠️ Der Satz nannte bis zum 2026-08-10 `ki_profile` als die Pflichtstation. Das stimmte, als der Ad-Server hinter dem Retargeting hing; seit sie Geschwister sind, ist es `infiniteScroll` — inhaltlich derselbe Konflikt, nur an einem anderen Dark Pattern.

**Strukturelle Schwäche dieser Achse — gelöst durch Anteils-Stufen *und* Dauerbetrieb.** Watchtime-Angebot wuchs mit den Usern, Watchtime-**Nachfrage** nicht: ein Deal kostete fix, und wie viele Deals parallel laufen können, begrenzt das Trend-Budget — nicht die Watchtime. Ab einer bestimmten Plattformgröße war Watchtime also Überschuss, und ab da waren alle sechs Nodes wertlos, inklusive beider Dark Patterns — also genau die zentrale Entscheidung des Baums.

Gemessen wurde das dann auch so: bei ~3 Mio Usern lagen **800 Mio Watchtime** ungenutzt herum, weil höchstens ~30 % der Produktion überhaupt verwertbar waren.

**Die Anteils-Stufen des Volumen-Knopfes (Sektion 6) heben das auf.** Ein Deal frisst dort einen Anteil des Lagers statt einer festen Menge, skaliert also automatisch mit der Plattform mit. Damit gilt wieder, was gelten soll: **mehr Watchtime = mehr Geld**, und der Multiplikator dieser sechs Nodes wirkt in voller Höhe auf den Ertrag durch.

⚠️ **In Phase 2 gilt das aber nicht, und das war die zweite Hälfte des Problems.** Dort gibt es nur absolute Stufen, die Achse hängt also weiter in der Luft — beide Dark Patterns dieser Achse stehen aber in Phase 2. Genau diese Lücke schließt `fest ×4` (§6): sie macht die Watchtime-Nodes schon vor dem Ad-Server spürbar, weil ein Deal wieder genug frisst, dass die Produktion überhaupt der Engpass ist.

⚠️ **Die Anteils-Stufen allein haben es aber NICHT getan** — das war bis zum 2026-08-06 eine Fehldiagnose. Ohne Dauerbetrieb (§6) endete ein Deal, bevor das Lager sein Gleichgewicht auch nur zu einem Viertel erreicht hatte; die Stufe konnte ihre eigene Eigenschaft nie ausspielen. Gemessen bei 1 Mio Usern über 30 Minuten, mit halbierter Trend-Schuld, aber ohne Dauerbetrieb: **1,35 Mrd Watchtime** lagen ungenutzt herum — der Watchtime-Berg war vollständig da, nur größer als vorher. Es braucht **beide** Mechaniken; wer eine davon zurückbaut, holt ihn zurück.

⚠️ **Der frühere Verweis auf „KI-Labor-Werbearten als eigentlicher Fix" ist damit erledigt** — es braucht keine fünfte Werbeart mit größerem Appetit mehr. Wer eine hinzufügt, tut das aus inhaltlichen Gründen, nicht um diese Achse zu retten.

⚠️ **Was bleibt: die Nachfrage nach Watchtime ist jetzt unbegrenzt, das Trend-Budget aber nicht.** Der Engpass ist damit sauber auf den Trend verlagert — genau dorthin, wo Phase 3 ihn haben will (siehe `adTrendMult()`, §9 „Noch offen"). Wer die Anteile erhöht, verschiebt nicht den Ertrag, sondern nur die Puffergröße; der Hebel für mehr Einkommen ist die Watchtime-**Produktion**.

### Phase 2 — Werbung (4 Nodes)

Bauen keine Features, sondern schalten frei — drei davon Werbearten (`AD_TYPES.unlockedBy`, Sektion 6), eine eine Volumen-Stufe. Laufen **parallel** zum Hauptbaum, blockieren den HQ-Slot also nicht.

| Node | Hängt an | € | Dauer | Server | Schaltet frei |
|------|----------|---|-------|--------|---------------|
| Feed-Werbefläche | wb_coop | 3.000 | 40 s | 300 | Feed-Werbung |
| Search-Ad-System | wb_display + **suche** | 8.000 | 80 s | 1.000 | Search-Ad |
| Video-Ad-Integration | wb_display + **videos** | 20.000 | 60 s | 3.000 | Werbevideo |
| **Anzeigen-Optimierung** | wb_display | **12.000** | 80 s | 2.000 | **Volumen-Stufe `fest ×4`** |

Die Cross-Abhängigkeiten in den Hauptbaum sind der Kern des Reiters: bessere Werbung gibt es nur, wenn die Plattform das Feature dazu hat.

**Die Anzeigen-Optimierung ist die einzige Node im Reiter ohne Cross-Abhängigkeit** — sie hängt nur an der Feed-Werbefläche und ist damit ab dem Phase-2-Einstieg erreichbar. Das ist Absicht: sie ist die Brücke über die Watchtime-Durststrecke (§6), und eine Brücke, die man sich erst freikämpfen muss, kommt zu spät. Ihr Preis von 12.000 € liegt trotzdem über allen Phase-2-Werbung-Nodes außer der Video-Integration — sie ist eine echte Investitionsentscheidung gegen die dritte Werbeart.

⚠️ **Sie war bis zum 2026-08-10 eine Phase-3-Node mit ganz anderem Effekt** (45.000 € + 250.000 🗃️, `adWatchtimeMult: 0.75` = −25 % Verbrauch je Zyklus, hinter dem Retargeting). Der alte Effekt zeigte in die **falsche** Richtung: weniger Verbrauch je Deal heißt mehr liegengebliebene Watchtime, also genau das gemeldete Problem, nur stärker. Der Getter `adWatchtimeMult()` bleibt als reservierter Haken erhalten (§6).

### Phase 2 — Marketing (5 Nodes)

Gleiche Bauart wie der Werbung-Reiter: keine Features, sondern Freischaltungen (`CAMPAIGNS.unlockedBy`, Sektion 7). Vor Phase 2 stand hier nur die Stadtaktion zur Verfügung — der Reiter war nach dem Go-Live tot.

**Sie geben bewusst keinen Trend.** Trend gibt es für gebaute Features, und die stehen im Entwicklung-Reiter. Server kosten sie trotzdem: auch eine Kampagnen-Infrastruktur läuft auf den Farmen, und das hält den Reiter am Farm-Loop hängen.

| Node | Hängt an | € | Dauer | Server | Schaltet frei |
|------|----------|---|-------|--------|---------------|
| Langzeit-Kampagnen | mk_freunde | 2.000 | 40 s | 300 | Empfehlungs-Welle |
| Sprint-Kampagnen | mk_flyer + **teilen** | 8.000 | 60 s | 800 | Hype-Burst |
| Verifizierungsstelle | mk_langzeit | 10.000 | 60 s | 800 | Verifizierte Marken-Profile · **+1 Kampagnenplatz** |
| Partner-Programm | mk_presse + mk_sprint + **unternehmen** | 20.000 | 100 s | 1.200 | Creator-Beteiligung · **+1 Kampagnenplatz** |
| Kampagnen-Team aufstocken | mk_partner | 6.000 | 30 s | 600 | **+1 Kampagnenplatz** (schaltet sonst nichts frei) |
| **Marktplatz** (Phase 3) | mk_partner + **liveStreaming** | 40.000 | 120 s | 6.000 | Provision auf die Creator-Beteiligung (bis 20 %, trendabhängig) |

Hinter dem Partner-Programm hängt in Phase 2 noch **Kampagnen-Team aufstocken** — der einzige Node im Reiter, der weder Feature noch Freischaltung ist, sondern nur einen weiteren Kampagnenplatz gibt (Sektion 7.2). In Phase 3 folgt **Trend-Monitoring** nach derselben Bauart, zusätzlich mit Metadaten-Preis.

**Der Marktplatz** ist die einzige Node im Reiter, die eine Kampagne nicht freischaltet, sondern verbessert — und zwar auf der **Kosten**seite: bis zu 20 % der Creator-Beteiligung kommen als Provision zurück, linear mit dem Trend bis +10. Die Creator bekommen weiter den vollen Betrag, die Trend-Wirkung bleibt gleich; billiger wird es nur für die Plattform (259 → 207 €/Trend-Sekunde am Reglerende).

⚠️ **Sie ist damit die einzige Stelle im Spiel, an der Trend unmittelbar Geld wert ist** — und die Antwort auf die lange geparkte Idee „Trend als Multiplikator auf die Erträge": nicht bei der Werbung, die den Trend drückt, sondern beim Gegenentwurf. Die Rückkopplung (mehr Trend → billigere Beteiligung → mehr Trend) ist bei 20 % gedeckelt.

⚠️ **Sie stand bis zum 2026-08-09 im Entwicklung-Reiter und hing am Community Center.** Mit dem Gebäude ist sie hierher gewandert; `liveStreaming` bleibt als Voraussetzung (Creator entstehen dort, wo man senden kann) und steht im Reiter als Geist-Karte. **Kein Metadaten-Preis** — der anständige Weg kommt ohne den Datenweg aus.

Vier Ebenen, zwei Zweige, die sich im Partner-Programm wieder zusammenfinden:

```
mk_freunde ──► Langzeit-Kampagnen ──► Verifizierungsstelle ──► Partner-Programm
                 (Empfehlungs-Welle)  (Marken-Profile) ┌─► (Creator-Beteiligung)
                                                       │
mk_flyer   ──► Sprint-Kampagnen ───────────────────────┤
                 (Hype-Burst)                          │
                      ▲                Unternehmensprofile
                Teilen-Funktion            (Hauptbaum)
                  (Hauptbaum)
```

Die beiden Cross-Abhängigkeiten sind thematisch, nicht dekorativ: ein Hype verbreitet sich übers **Teilen**, und das Partner-Programm braucht **Unternehmensprofile** — wer Partner bezahlen will, braucht sie erst einmal als offizielle Gegenstelle.

**Damit hängt die gesamte Anziehungskraft-Achse an echter Infrastruktur, nicht nur ihr letzter Node.** Das ist eine bewusste Entscheidung mit einem Preis: siehe den Hinweis in Sektion 7.2.

**Im Marketing-Center bleiben gesperrte Kampagnen stehen** — grau, mit dem Namen der fehlenden Node auf dem Button. Die Werbeagentur blendet gesperrte Werbearten dagegen aus; hier wäre die Anziehungskraft-Spalte zu Beginn von Phase 2 sonst komplett leer, und die gesperrte Karte ist gleichzeitig der Wegweiser ins HQ.

⚠️ **Alte Spielstände verlieren Kampagnen, die sie schon hatten.** Bewusst kein Freischenken in `storage.migrate()` — sonst überspringt der Spielstand den neuen Inhalt komplett.

### Die Baum-Ansicht — wie der Techtree gezeichnet wird

Der Baum ist **kein Scroll-Modal, sondern eine Karte, die man zieht**. Reiterleiste und Hinweiszeile stehen fest, darunter liegt ein Ausschnitt (`.rt-tt-viewport`, `overflow: hidden`) mit einer per `translate()` verschobenen Ebene (`.rt-tt-pan`). Damit gibt es genau eine Scroll-Instanz statt zweier ineinander — vorher scrollten `#modal` und der Baum-Container beide vertikal, was eine zweite, nutzlose Scrollleiste erzeugte.

Der Pan-Offset liegt im **Modul**, nicht im DOM: `renderModal()` baut bei jedem `state:changed` alles neu, ein DOM-Scroll-Offset wäre im Sekundentakt weg. Zurückgesetzt wird er beim Öffnen und beim Reiterwechsel — nicht beim Neu-Rendern. Die Drag-Schwelle und die Klick-Unterdrückung in der Capture-Phase sind aus `js/camera.js` übernommen; ohne sie öffnet jedes Verschieben die Detail-Ansicht der Karte unter dem Finger.

**Gezoomt wird mit zwei Fingern** (Strg+Rad am Desktop, dazu drei Knöpfe unten rechts im Ausschnitt: −, „alles zeigen", +). Der Faktor liegt zwischen 0,3 und 1,6 und lebt wie der Pan-Offset im Modul; der Reiterwechsel setzt nur den Ausschnitt zurück, **nicht** den Zoom — wer herausgezoomt hat, um Überblick zu haben, will ihn auch im nächsten Reiter. Auf 1 zurück geht es erst beim Öffnen des Modals.

⚠️ **Der Zoom ist kein reiner Anzeige-Effekt, er greift in zwei Rechnungen ein.** `drawConnections()` misst über `getBoundingClientRect()`, bekommt also Bildschirm-Pixel, während das SVG selbst in der skalierten Ebene liegt — ohne Division durch den Zoom würde jede Linie ein zweites Mal skaliert. Und `transform-origin: 0 0` auf `.rt-tt-pan` ist Pflicht: die Begrenzung des Ausschnitts rechnet um die linke obere Ecke.

⚠️ **Während einer Geste rendert `state:changed` nicht** (`gestureActive`). Der Neuaufbau ersetzt den Ausschnitt, und ab da kommt kein `pointermove` mehr an — beim Ziehen war das ein Ruckler pro Sekunde, ein Pinch dauert länger als der Loop-Takt und wäre schlicht abgebrochen. Aufgeräumt wird das Flag beim letzten Finger, **ohne** dort selbst zu rendern: der unmittelbar folgende `click` liefe sonst ins Leere statt in die Unterdrückung, und Ziehen würde die Karte darunter öffnen.

**Verbindungslinien laufen orthogonal**, nicht als freie Beziers: senkrechte Schenkel in den Spaltenlücken, waagerechte in den Lücken **zwischen den Karten**. Über eine Karte läuft dadurch nie eine Linie, und keine muss außen um eine Spalte herum.

Zwei Regeln tragen die Lesbarkeit:

1. **Ein Strang je Quelle, nicht je Kante.** Der Kanal in einer Spaltenlücke gehört der ausgehenden Node, nicht der einzelnen Verbindung — alle vier Kanten aus `backend2` teilen sich einen senkrechten Strang mit Abzweigen, statt als vier enge Parallelen zu laufen. Das war der Hauptgrund, warum der Baum vorher nicht zu entwirren war.
2. **Lange Kanten suchen sich einen Korridor** (`freeBands()`): ein waagerechtes Band, das über die übersprungenen Spalten hinweg frei von Karten ist. Gesucht wird in drei Stufen: **Zielhöhe** (Linie läuft schnurgerade durch), sonst die **eigene Höhe** (Linie verlässt die Karte waagerecht und steigt erst unmittelbar vor dem Ziel), sonst das nächstgelegene freie Band. Lange Kanten sind gestrichelt, damit man sieht, dass sie eine Ebene überspringen.

   ⚠️ **Die mittlere Stufe fehlte anfangs, und ohne sie sucht die dritte das falsche Band.** Sie misst den Abstand zur **Zielhöhe** — bei `mk_sprint → mk_partner` gewann dadurch das schmale Band *über* `mk_presse`, obwohl auf Höhe von `mk_sprint` alles frei ist. Die Linie ging erst hoch und gleich wieder runter. Betroffen ist nur diese eine Kante; die drei langen Kanten im Hauptbaum haben beide Höhen blockiert und laufen unverändert.

⚠️ **Der Kartenabstand `.rt-tt-col { gap }` ist damit ein Routing-Parameter, keine reine Optik.** Bei den früheren 14 px blieb nach `CARD_MARGIN` kein brauchbarer Korridor übrig, und alle langen Kanten mussten über Notfall-Lanes unter dem Grid — genau der Bogen unter einer ganzen Spalte, der sich nicht lesen ließ. Die Lanes gibt es als Rückfallebene weiterhin; im aktuellen Baum wird keine mehr gebraucht.

⚠️ **Die Deckkraft sitzt auf einer `<g>`-Gruppe je Status, nicht auf dem einzelnen Pfad.** Gemeinsame Stränge zeichnet jede Kante erneut; mit Alpha pro Pfad würden sie sich zu einem dunkleren Strich aufaddieren und wie eine eigene, kräftigere Verbindung aussehen.

⚠️ **Eine Node gehört immer in eine Spalte rechts von allen ihren `requires`.** Steht sie daneben statt dahinter, verschwindet ihre Linie hinter den Karten dazwischen und sieht aus, als liefe sie ins Leere — genau das war bei `polls` der Fall. Das SVG wird außerdem auf die **Inhaltsgröße** gesetzt, nicht auf den sichtbaren Ausschnitt; mit der Ausschnittsbreite wurde die halbe rechte Baumhälfte schlicht abgeschnitten.

**Voraussetzungen aus einem anderen Reiter** (`teilen → mk_sprint`, `unternehmen → mk_presse`, `suche → wb_search`, `videos → wb_video`) stehen als **Geist-Karte** im Ziel-Reiter: Pseudo-ID `@<nodeId>` im Spalten-Array, flache gestrichelte Karte, die den Status des Originals spiegelt und per Klick dorthin springt. Für `drawConnections()` ist das eine ganz normale Karte mit `data-id` — es braucht keine Sonderbehandlung, und keine Kante endet mehr im Nichts.

**Die Karte zeigt den Ertrag, nicht die Dauer.** `yieldChipsHtml()` baut aus `trendBonus` / `trendBase` / `watchtimeMult` / `usersBonus` / `moneyBonus` / `unlocks` eine Chip-Reihe neben dem Status-Badge — in **jedem** Status, auch im gesperrten, weil man genau dort wissen will, ob der Weg sich lohnt. Formatiert wird ausschließlich über `RT.ledger.fmt`. Nur die Phase-0-Nodes haben gar keinen Ertrag; dort steht ersatzweise die Dauer.

**Freischalter-Nodes tragen einen violetten Akzent** — datengetrieben über `def.unlocks`, es gibt also keine zweite Liste, die auseinanderlaufen kann. Der Akzent legt sich über den Status-Hintergrund, statt ihn zu ersetzen: welchen Zustand eine Karte hat, bleibt das primäre Signal. Die Dark-Pattern-Optik hat Vorrang, falls eine Node je beides wäre.

⚠️ **Wer einer Node ein `unlocks`-Feld gibt, färbt sie damit ein.** Das Feld ist nicht mehr nur Anzeigetext. `teilen` hat aus genau diesem Grund eines bekommen — es ist die Voraussetzung von `mk_sprint`, hatte aber als einziger Torwächter keines.

### Phase 3 — vier Reiter, 16 neue Nodes

Ausgeschrieben in `phase3.md` §6. Hier nur das, was den Rest des Spiels betrifft:

- **Nodes können Metadaten kosten** (Feld `metadata`). `startTechNode()` prüft und bucht ab, mit eigener Absage — „zu teuer" zeigt aufs Geld, wo nichts fehlt.
- **Die Phase-2-Reiter wachsen weiter**: Entwicklung bekommt 2 Features, Marketing 3 (Marktanalyse · Trend-Monitoring · Marktplatz), Werbung 3 Phase-3-Nodes (Retargeting · Ad-Server · Programmatic Advertising). Sie docken über Geist-Karten an den KI-Reiter bzw. den Hauptbaum an.
- ⚠️ **Die Trend-Boni der neuen Hauptbaum-Nodes sind klein** (+1,0 / +2,0 gegen bis zu +12,0 in Phase 2). Der positive Trend der Phase 3 kommt aus dem Netzwerkeffekt und den Kampagnenplätzen, nicht aus dem Feature-Baum.
- ⚠️ **Die dauerhafte Trend-Schuld aller fünf Dark Patterns summiert sich auf −7,0** (§9). Dagegen steht der Netzwerkeffekt, der sie ab ~10 Mio Usern allein trägt — die Kampagnenplätze müssen sie also nicht allein stemmen.

### Phase 3 — Energie & Wartung (3 Nodes)

Ein eigener, vom Rest **losgelöster** Strang im Hauptbaum: er hängt an nichts und nichts hängt an ihm. Die Serverkosten (§4) laufen ab Phase 2 ohnehin — diese drei Nodes machen sie nur billiger und bequemer. Wer sie ignoriert, spielt weiter; er zahlt mehr und klickt öfter.

| Node | Hängt an | € | Dauer | Server | Wirkung |
|------|----------|---|-------|--------|---------|
| Zentrale Energieverwaltung | — | 30.000 | 120 s | 4.000 | schaltet das **Strom- & Wasserwerk** frei |
| Effizientere Farmen | en_zentral | 40.000 | 150 s | 6.000 | 30 statt 25 Zyklen je Zahlung → **−17 %** |
| Erneuerbare Energien | en_zentral | 60.000 | 200 s | 10.000 | Tarif je 1.500 statt 1.000 Kapazität → **−33 %**, Trend +2,0 |

Beide zusammen: **−44 % Betriebskosten.** Massiv fällt damit von 20 % auf 11 % des Feed-Ertrags.

⚠️ **Beide sind Auto-Picks** — bei Massiv-Tarif sind −44 % mehrere Millionen pro Sekunde, jeder Preis ist in Minuten wieder drin. Das ist nach der Regel für teure Nodes in Ordnung („Kosten entscheiden nicht *ob*, sondern **wann und in welcher Reihenfolge**"), heißt aber: **preise sie für den Phase-3-Einsteiger.** Für den Endspieler sind sie ohnehin gratis.

⚠️ **Erneuerbare Energien sind hier ein reines Upgrade, keine Entscheidung** (billiger *und* Trend). Die interessantere Variante wäre gewesen: dreckig billig im Bau und teuer im Betrieb, sauber umgekehrt — also dieselbe Form wie Breite/Höhe. Sie ist verworfen worden, weil sie einen dauerhaften, *abbezahlbaren* Trend-Abzug gebraucht hätte, und `trendBase` ist ausdrücklich die einzige Stelle mit **unumkehrbarer** Trend-Wirkung (§8). Eine zweite, umkehrbare Sorte danebenzustellen hätte die Dark-Pattern-Aussage verwässert. Falls sie doch kommt, muss die UI die beiden Sorten klar trennen.

### Noch offen

- **Metadaten verdoppeln den Serverbedarf pro User** — kommt seit Phase 3 als Folge der Mechanik heraus (ein Modell = 1 Kapazität), aber die Regel, was mit Usern über der Kapazität passiert, fehlt weiter. (Der *Trend*-Malus dafür steht seit den Serverkosten, siehe §8 „Serverprobleme".)
- **`adTrendMult()` hat weiter keine Node** — der Getter liefert 1 und wird in `adTrendMalus()` bereits angewandt. Er war für das Community Center vorgesehen; mit dem gestrichenen Gebäude ist der Einhängepunkt frei, der Bedarf aber unverändert:

  Der Grund ist strukturell: Geld und Wachstum bezahlen aus derselben Kasse. Jeder laufende Deal registriert einen negativen Trend-Modifikator — um bei 350.000 Usern die gesamte produzierte Watchtime zu verwerten, bräuchte es ~17 parallele Feed-Deals und damit **−6,6 Trend**, bei einem realistischen Durchschnitt von ~6. Der Spieler kann also verdienen *oder* wachsen, nie beides, und mit der Plattformgröße wird es schlimmer: die Watchtime wächst linear mit, das Trend-Budget ist bei +20 gedeckelt.

  Eine Node auf `adTrendMult()` („−30 % Trend-Schaden") ist deshalb kategorisch etwas anderes als noch ein Trend-Bonus: sie macht die Ökonomie **verlustärmer**, statt eine weitere Quelle danebenzustellen. Die Balance-Prüfung läuft entsprechend über „wie viele Deals sind bei welchem Trend-Budget parallel möglich", nicht über den €-Ertrag eines einzelnen Deals.

---

## 9.5 Phase 4 — Ereigniskarten

Ab **40 Mio Usern** (`RT.actions.PHASE4_USER_THRESHOLD`) beginnt Phase 4. Sie bringt **keine neue Ressource und kein neues Gebäude** — sie bringt Entscheidungen von außen. Der Code steht in `js/events.js`, die Optik in `css/events.css`.

Der Zeitpunkt ist die Aussage: so groß zu sein heißt, dass Presse, Gerichte, Politik, Lobbyisten und Konkurrenten die Plattform als **Gegenüber** behandeln. Das Gratulations-Modal sagt beides in zwei Seiten — erst „du hast es geschafft", dann „aber jetzt schaut die Welt zurück".

### Der Loop

Alle `EVENT_ROUND_SEC` = **180 s** liegen **drei verdeckte Karten** auf dem Tisch. Die **allererste** Runde kommt schon nach `FIRST_ROUND_SEC` = **60 s**. Der Spieler deckt **eine** auf und entscheidet. Das Modal **schließt vorher nicht** — weder über den Hintergrund noch über Escape; der Schließen-Knopf ist ausgeblendet, solange eine Runde offen ist.

Drei Regeln tragen das Ganze:

1. **Was nicht gewählt wird, geht ungesehen zurück ins Deck.** Es gibt keine Vorschau. Eine schlechte Karte zu ziehen ist Pech, kein Fehler.
2. **Jede Entscheidung seedet Folgekarten.** Sie wandern ins Deck und werden danach ganz normal zufällig gezogen. Wer oft schlecht entscheidet, hat ein volleres Krisen-Deck — die Strafe ist eine **Wahrscheinlichkeit**, kein Skript.
3. **Eine ausgesessene Krise bleibt liegen** und belegt einen der drei Plätze. Solange sie liegt, läuft ihr Malus, und man zieht eine Karte weniger.

⚠️ **Genau eine Karte je Runde.** `reveal()` verweigert, sobald eine gewählt ist. Ohne die Sperre könnte man alle drei aufdecken und sich dann die beste nehmen — Regel 1 wäre wertlos.

⚠️ **`EVENT_ROUND_SEC` ist der Taktgeber für zwei Größen, die in Runden statt in Sekunden gemessen werden.** Die Fristen der liegenden Krisen (`runden`) und die Sperrfristen der wiederkehrenden Karten (`wiederkehrend`) hängen daran: 300 → 180 s heißt, dass eine Dreirunden-Frist nicht mehr 15, sondern 9 Minuten läuft. Die **befristeten Buffs** (`BUFF_SEC` = 600 s, Preiskampf und der geliehene Kampagnenplatz) hängen ausdrücklich **nicht** daran — sie stehen dem Spieler gegenüber in Minuten auf der Karte und bleiben deshalb in Minuten. Sie spannen jetzt gut drei Runden statt zwei; wer das zurückdrehen will, senkt `BUFF_SEC` und muss die beiden Optionstexte mitziehen.

### Beträge: Prozent vom Firmenwert, eingefroren

```
Firmenwert = Geld auf der Bank + User × USER_WERT   (USER_WERT = 2 €)
```

In den Kartendaten steht **nur der Prozentsatz**; beim Auflegen rechnet `betraegeFuer()` ihn in eine feste Zahl um. Sie darf sich nicht ändern, während der Spieler die Karte liest.

⚠️ **`USER_WERT` = 2 ist gemessen, nicht geschätzt.** Bei 50 € wurden die Beträge so groß, dass die Hälfte der Optionen schlicht unbezahlbar war — und eine Option, die man nie drücken kann, ist keine Entscheidung. Wer daran dreht, verschiebt **alle** Kartenpreise gleichzeitig; das ist der einzige globale Knopf der Ökonomie hier.

### Lebenslauf einer Krise

| `ende` | was nach der Frist passiert |
|---|---|
| `'weg'` | klingt ab, erledigt |
| `'zurueck'` | vom Tisch, aber zurück ins Deck — die Ursache besteht weiter |
| `'zwang'` | `zwangOpt` wird **vollstreckt**, bei `zwangFaktor: 2` doppelt |

⚠️ **Die Frist läuft ab dem ERSTEN Aussitzen.** Ein zweites Aussitzen dreht die Uhr nicht zurück — sonst läge die Karte ewig, und das war im Prototyp der meistgemeldete Fehler („die Krisen gehen nicht weg").

⚠️ **Gelöst heißt sofort weg.** Auf den Optionen steht wörtlich „sofort weg"; `decide()` entfernt den Trend-Modifikator, statt ihn ausklingen zu lassen. Das weicht bewusst von „Serverprobleme" (§8) ab: dort ist der lange Ausklang die Aussage, hier hat man mit dem Preis der Option bereits bezahlt.

### Wiederkehr — die Ausnahme von „gespielte Karten kommen nicht wieder"

Die Grundregel ist einmalig. Ohne Ausnahme läuft das Deck aber nach **gut 25 Runden** leer (gemessen über 500 simulierte Runden) — und Phase 4 ist das Endspiel, dort darf es nicht still werden. `wiederkehrend: <Runden>` legt eine Karte nach einer Sperrfrist zurück ins Deck.

Sie steht genau auf den Karten, bei denen ein zweites Mal auch **inhaltlich** stimmt: es kommt eine *andere* Journalistin, eine *andere* Katastrophe, ein *anderer* Käufer — Spendenaufruf (6), Serverausfall (6), Daten verkaufen (8), Hilfsorganisation (8), Presse (8), Datenleck (8), Konkurrent (10), Jugendschutz (10), Zensur (10).

⚠️ **Karten mit eigener Fortsetzung bleiben einmalig**: Lobbyist (→ Das bessere Angebot), Marcus, Team, Kanal, DSGVO-Ankündigung — und **alle geseedeten Folgekarten**. Sonst verlöre die Kette ihre Bedeutung.

Mit der Regel: **0–3 Leer-Runden auf 500**, statt 315–371.

⚠️ **Eine Leer-Runde verlangt nichts.** Läuft das Deck doch einmal trocken, wird `pending` gar nicht erst gesetzt und der Tisch geht nicht auf — ein offenes `pending` ohne wählbare Karte wäre ein Deadlock, weil das Modal dann nicht mehr schließt.

### Wo die Wirkungen ankommen

Nichts davon ist ein eigenes System. Alles hängt in vorhandene Getter ein, damit es **ohne Zusatzarbeit** in den Aufschlüsselungs-Modalen auftaucht, die es schon gibt:

| Karten-Feld | landet in | sichtbar im |
|---|---|---|
| `trendBase` | `trendBaseMods()` als „🃏 Entscheidungen" | Trend-Modal, als **dauerhaft** |
| `trend` / `dynTrend` | `setTrendMod('event:bonus:<id>')` | Trend-Modal, befristet wie ein Node-Bonus |
| `liegt` (laufende Krise) | `setTrendMod('event:<id>')`, je Karte einzeln | Trend-Modal |
| `wtMult` | `watchtimeMultMods()` | ×-Chip an der Watchtime-Kachel |
| `networkK` | `networkKMods()` | Netzwerkeffekt-Leiter |
| `adMalus` (Preiskampf) | `adRevenueMult()` × 0,6 für 10 min | Werbeagentur-Karte |
| `prSlot` | `prSlotsTotal()` + 1 für 10 min | Marketing-Center |
| Serverausfall | `farmSpeedFactor()` × 0,5 | Farm-Produktion |
| Streik | `startTechNode()` verweigert, `startAt` wandert mit | Fortschrittsring friert ein |
| `investorOut` | `adRevenueMult()` ohne Marcus' 15 % | Werbeagentur-Karte |

⚠️ **`investorOut` ist die einzige Karte, die eine dauerhafte Belastung wirklich abschafft** („Marcus will Zahlen sehen → Anteile zurückkaufen", 10 % vom Firmenwert für 15 % aller künftigen Werbeerträge). Sie soll teuer sein und sich trotzdem lohnen — das ist der Unterschied zwischen einer Strafe und einer Investition.

⚠️ **Der Streik friert die Uhr über `entry.startAt` ein**, statt eine zweite Zeitrechnung einzuführen. Dadurch steht der Fortschrittsring sichtbar still, und es gibt keinen zweiten Ort, an dem die Node-Dauer stimmen müsste.

### Sichtbarkeit — drei Entfernungen

Ein Malus, den man nicht sieht, ist keine Rückmeldung. Deshalb dreimal dieselbe Information, unterschiedlich nah:

1. **Der Knopf neben dem Shop** (`🃏`, im Shop-Stil): Countdown zur nächsten Runde auf dem Knopf selbst, rote Zahl für die liegenden Krisen, Puls wenn eine Runde fällig ist. Er ist **jederzeit** anklickbar.
2. **Die Krisen-Leiste** unter der Ressourcen-Bar (`#rt-event-strip`): je liegender Krise ein Chip mit Icon, Name, Malus und Restrunden; dazu die befristeten Buffs. Leer blendet sie sich per `:empty` selbst aus.
3. **„Läuft gerade"** im Karten-Modal: die vollständige Liste inklusive der dauerhaften Posten (Trend-Schuld, Watchtime, Netzwerk-Steigung, Marcus).

Dazu das **Protokoll** im Modal — was jede Entscheidung konkret bewirkt hat, in Zeilen statt in Prosa.

⚠️ **Die Seed-Wahrscheinlichkeiten stehen im Spiel NICHT auf den Optionen.** Im Prototyp taten sie das, dort waren sie das Prüfwerkzeug. Im Spiel wären sie ein Blick in den Deckstapel — und die Regel „du siehst nicht, was du nicht wählst" gilt auch für das, was du dir gerade einbrockst.

### Zeit und Spielstand

`nextAt` ist ein **absoluter Zeitstempel**; die Uhr stimmt nach einer Pause von allein, ohne Nachrechnen. `nextAt = 0` heißt „sofort fällig" — das nutzt nur noch der Debug-Knopf „Runde jetzt".

⚠️ **Der Vorlauf wird an zwei Stellen gesetzt, und beide werden gebraucht.** `maybeTriggerPhase4()` (loop.js) setzt ihn im Moment des Auslösens, weil der Ereignis-Tick **im selben Durchlauf** ein paar Zeilen weiter läuft — mit dem frischen `nextAt = 0` lag der Kartentisch sonst über dem Gratulations-Modal, also vor jeder Erklärung. Das Modal setzt ihn beim Schließen erneut, damit die zwei Minuten vollständig **nach** der Tour liegen.

⚠️ **Verpasste Runden werden NICHT nachgeholt.** Der Tick zieht aus einem überfälligen `nextAt` genau **eine** Runde. Alles andere hieße, nach einer Nacht acht Karten hintereinander spielen zu müssen — und die Krisen darin hätten nie eine Frist gehabt, in der man sie hätte abwenden können.

⚠️ **Ein mitten in der Runde geschlossenes Spiel steht beim Laden wieder vor demselben Tisch.** `pending` bleibt gesetzt, der erste Tick öffnet den Tisch erneut. Ohne diese Zeile hinge der Spielstand fest und es käme nie wieder eine Karte.

⚠️ **Der Tisch wartet, solange eine Erklär-Tour oder das Gratulations-Modal läuft** (`erklaerungOffen()`). Sonst ginge das Karten-Modal genau über die Erklärung auf, die es gerade gibt.

⚠️ **Dabei wird die Uhr mitgeschoben, nicht nur ignoriert.** Eine Tour, die länger dauert als der Vorlauf, fräße ihn sonst vollständig auf — die erste Karte läge dann in der Sekunde auf dem Tisch, in der die Erklärung zugeht, und genau das soll `FIRST_ROUND_SEC` verhindern. Der Sprung je Tick ist auf 2 s gedeckelt, damit ein Tab im Hintergrund die Runde nicht endlos nach hinten schiebt.

### Die Phase-4-Tour

Sechs Karten, davon **eine mit Spotlight** (der Ereignis-Knopf) — der Kartentisch liegt beim Erklären noch nicht, alles andere sind Vollbild-Illustrationen aus reinem CSS: Welt schaut zurück · der Knopf · drei Kartenrücken · Entscheidung ➜ Deck · liegende Krise mit Frist · die 5-%-Säulen.

⚠️ **Die Beispiel-Beträge der letzten Karte kommen aus dem echten Firmenwert.** „5 % von deinem Konzern" mit einer erfundenen Zahl zu illustrieren wäre genau an der Stelle falsch, an der es um die Größenabhängigkeit geht.

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
- **Farm-Klick** = Modal mit Belegung und Ausbau (Sektion 4). Geerntet wird über den Ernte-Knopf auf dem Feld — oder über denselben Knopf in der Belegungs-Karte
- **Werbeagentur-Klick** = Modal mit laufendem Deal + Buchung. Gold-Button auf dem Feld = Geld ernten bzw. letzten Deal erneut buchen
- **Marketing-Klick** = Kampagnen-Modal
- **HQ- und Bürogebäude-Klick** = Techtree. Ring auf dem Feld zeigt die Entwicklung, die auf **diesem** Gebäude läuft; der grüne Button darunter holt sie ab (Sektion 9)
- **Sidebar rechts**: laufende Kampagnen mit Progress-Bar
- **Grid-Expansion**: angrenzende Felder tragen eine `+`-Plakette — Klick öffnet die Kauf-Nachfrage, Preis steigt pro gekauftem Feld

Sieht bewusst anders aus als v2's HQ-zentriertes Layout — es gibt einen wachsenden Konzern mit vielen Gebäuden.

### Tablet-Viewport — zwei getrennte Riegel

Auf iPads lag die Browserleiste über dem Game-Head, am PC nie. Zwei unabhängige Ursachen, beide behoben (2026-08-11):

1. **`100vh` ist auf iOS der Viewport OHNE Browserleisten**, also größer als das, was man sieht. `#app` stand deshalb höher als der sichtbare Bereich. Überall `100vh; 100dvh` als Paar — `vh` zuerst als Rückfall für Safari < 15.4. Betroffen waren `#app`, die drei Modal-Größen, die Tour-Karte, das Ereignis-Overlay und `body.rt-onboarding-active #app`.
2. **Seiten-Zoom.** `user-scalable=no` wird von iOS seit iOS 10 ignoriert. Ein zweiter Finger **neben** der Welt zoomt die ganze Seite, und der verschobene visuelle Viewport schiebt die obere Leiste unter die Browserleiste — in einem Spiel, das Pinch-Zoom beibringt, passiert das ständig. Gesperrt über `touch-action: pan-x pan-y` auf `html, body` (Doppeltipp) **plus** `lockPageZoom()` in `js/main.js`, das die nicht-standardisierten `gesture*`-Events abfängt (Pinch).

⚠️ **Beide Riegel werden gebraucht.** `touch-action` allein stoppt in Safari den Pinch auf Seitenebene nicht, die `gesture*`-Events allein nicht den Doppeltipp.

⚠️ **Die Kamera ist davon nicht betroffen.** `js/camera.js` arbeitet mit `touch*`-Events, die parallel weiterlaufen, und `#world-camera` trägt mit `touch-action: none` ohnehin die strengere Regel. Pinch-Zoom in der Welt bleibt.

⚠️ **Kein `viewport-fit=cover`.** Ohne es hält iOS den Inhalt von allein im sicheren Bereich; mit ihm liefe er unter die Statusleiste und bräuchte überall `env(safe-area-inset-*)`-Polster — also genau der Fehler, der hier repariert wurde, nur selbstgebaut.

### Flackernde Bilder auf dem iPad — ein <img> wird nie neu gebaut

Zwei Meldungen mit derselben Ursache (behoben 2026-08-12): das Serverkosten-Icon in der Ressourcen-Bar zuckte dauernd, und die Farm-Sprites verschwanden nach jedem Klick für einen Moment. Beides passierte nur auf dem iPad — Safari dekodiert ein frisch eingehängtes `<img>` neu, auch wenn die Datei längst im Cache liegt. Am PC ist derselbe Vorgang unsichtbar.

Dahinter standen zwei Muster, die beide „jedes Mal alles neu" machten:

1. **`btn.innerHTML = iconHtml(...) + text`** — die drei Knöpfe mit dem Strom-/Wasser-Icon (Tarifstufe in der Ressourcen-Bar, Versorgungs-Knopf an der Farm, Sammelknopf am Werk) bauten ihr Bild bei jeder Aktualisierung mit. Jetzt steht das Icon fest im Markup und nur das Label daneben wird geschrieben (`setIconLabel()` in `js/ui.js`, für die Ressourcen-Bar direkt im Markup + `refs.srvTierLabel`).
2. **`buildIsoGrid()` warf das ganze Grid weg** (`innerHTML = ''`) und baute ~420 Kacheln, alle Gebäude und die komplette UI-Ebene neu — bei **jedem** `state:changed`, also im Sekundentakt und zusätzlich nach jedem Klick. Jetzt hält jeder Knoten seinen Platz in einer Map (`gridNodes`, Schlüssel = `"col,row"` bzw. `instanceId`), `gridNode()` legt ihn einmalig an und `pruneGridNodes()` räumt am Ende weg, was in diesem Durchlauf nicht mehr vorkam.

⚠️ **Die `create`-Rückrufe von `gridNode()` sind einmalig — dort gehören Struktur und Klick-Listener hin, alles Wechselnde in den Aufrufer danach.** Wer eine Positions- oder Zustandszeile in den Rückruf schiebt, baut einen Fehler, der erst beim zweiten Render auffällt.

⚠️ **Das Gebäude bekommt seine Klassen per `classList`, nicht per `className`.** `is-throttled` / `is-dark` (unversorgte Farmen) hängen an demselben Element und kämen sonst bei jedem Durchlauf kurz abhanden.

⚠️ **Die Maps hängen an konkreten Container-Elementen.** `gameScreen.enter()` baut den Screen bei einem Re-Entry neu — deshalb vergleicht `buildIsoGrid()` `#iso-grid` und `#building-ui-layer` mit dem letzten Stand und verwirft die Maps, wenn sie nicht mehr passen.

⚠️ **Nebeneffekt, der eigentlich der Hauptgewinn ist:** die Tiere auf der Weide werden jetzt wirklich nur noch bei geänderter Signatur neu gezeichnet. Die Diff-Prüfung in `updateFarmAnimals()` gab es schon lange, sie lief nur ins Leere, weil der `[data-animals]`-Container selbst jede Sekunde neu war.

⚠️ **Dieselbe Regel gilt für jede neue Anzeige mit Bild, die im Takt aktualisiert wird.** Sobald ein `<img>` in einem `innerHTML` steht, das öfter als einmal geschrieben wird, flackert es auf iOS. Einmalige Stellen — Modal-Titel, Erklär-Karten, Effekt-Partikel — sind unbedenklich.

### Handy im Hochformat — der Kopf halbiert sich

Auf einem Telefon fraßen Profile-Bar und Ressourcen-Bar zusammen rund die **Hälfte des Bildschirms**: sieben Kacheln zu je 45 % Breite ergaben vier Zeilen, Trend und Server stapelten je drei Elemente übereinander. Für die Iso-Welt — den eigentlichen Bildschirm des Spiels — blieb zu wenig.

Behoben rein über CSS (`@media (max-width: 600px) and (orientation: portrait)`, je ein Block am Ende von `css/resource-bar.css` und `css/events.css`). Gemessen bei 390 px Breite:

| | vorher | nachher |
|---|---|---|
| Phase 0/1 (Geld · User · Server) | 175 px | **101 px** |
| Phase 2 (+ Watchtime · Trend) | 244 px | **119 px** |
| Phase 3 (+ Modelle · Metadaten) | 443 px | **227 px** |

Drei Eingriffe tragen das:

1. **Die Beschriftungen fallen weg, nicht die Werte.** Das Icon ist im ganzen Spiel dieselbe Kennung (💰 · 👥 · ⏳ · 🧠 · 🗃️ · ⭐ · 🖥️) — in dieser Breite kostet „Watchtime" mehr Platz als die Zahl dahinter.
2. **Trend und Server werden je eine Zeile statt drei.** Beim Trend gibt der Balken nach, nicht der Ernte-Knopf: der trägt die einzige Handlung der Kachel. Beim Server rückt die Tarifstufe hinter den Balken statt darunter — die Zuordnung „gehört zur Kapazität" bleibt dieselbe.
3. **Die Kachelbreiten sind so gewählt, dass Geld · User · Watchtime eine Zeile ergeben** (31,5 + 31,5 + 37 %). Phase 3 schiebt Modelle + Metadaten in eine zweite Zeile, Phase 0/1 lässt Geld + User auf die halbe Breite wachsen. Ausgezählt wird nichts — der Flex verteilt, was gerade sichtbar ist.

⚠️ **Die schmale Spalte ist hier die breiteste.** `--slim` heißt auf dem Desktop „das ist ein Zwischenstand, darauf schaut man nicht dauernd"; im Hochformat trägt dieselbe Kachel als einzige zwei Dinge nebeneinander (Zahl + ×-Chip) und braucht deshalb am meisten Platz. Der Klassenname bleibt trotzdem, weil er dort die richtige Aussage macht.

⚠️ **Der ×-Chip darf umbrechen, die Zahl nicht.** Unterhalb von ~360 px passen beide nicht nebeneinander; dann fällt der Chip unter den Wert, statt ihn abzuschneiden. Ein „82,…" wäre der schlechtere Tausch — die Zahl ist die Information, der Chip ist ein Knopf. Deshalb steht dort ein `flex-wrap` und keine zweite Breiten-Schranke: der Umbruch findet den Punkt selbst.

⚠️ **Der Ereignis-Countdown rückt in die untere linke Ecke seines Knopfes.** Die Profile-Bar ist nur noch 4 px gepolstert, `bottom: -13px` läge auf der Ressourcen-Bar darunter. Oben rechts sitzt die Krisen-Zahl desselben Knopfes, oben links stieße er mit dem „!" des Shop-Knopfes zusammen — unten links ist die einzige freie Ecke.

⚠️ **Nur Hochformat, nur bis 600 px.** Im Querformat ist die Breite da, und das Tablet (768 px aufwärts) hatte das Problem nie. Die Blöcke stehen jeweils am **Ende** ihrer Datei, weil sie den `max-width: 600px`-Block darüber überschreiben — gleiche Spezifität, es gewinnt die spätere Regel.

⚠️ **Die Spotlight-Ziele der Erklär-Touren bleiben unberührt** (`.rt-resources`, `.rt-resource--watchtime/--server/--models/--meta/--trend`). Der Spotlight misst das echte Element zur Laufzeit (§10, „Erklär-Touren"), er trägt die flache Zeile also von selbst mit.

### Zahlen: vollständig bis 1 Mio, danach gekürzt

Eine Regel für das ganze UI, an zwei Stellen umgesetzt — `RT.ledger.fmt.num()` (alle Gebäude-Modale) und `fmtShort()` in `js/ui.js` (Buttons auf dem Feld, Ressourcen-Bar).

| Bereich | Darstellung |
|---|---|
| bis 999.999 | vollständig mit Tausenderpunkt: `16.000` (auf Buttons zusätzlich `16k`) |
| ab 1 Mio | `2,3 Mio` — eine Nachkommastelle, kein leeres „,0" |
| ab 1 Mrd | `1,5 Mrd` |

⚠️ **Der Ledger hat bis zum 2026-08-11 grundsätzlich vollständig ausgeschrieben** („da vergleicht der Spieler Angebote, die Zahl soll ganz dastehen"). Das trug bis Phase 3: dort stehen in denselben Zellen Kapazitäten und Metadaten mit acht und neun Stellen, und `2.304.512` ist zwar exakt, aber weder auf einen Blick lesbar noch in einer schmalen Spalte unterzubringen. Ab 1 Mio ist die Größenordnung die Information, nicht die letzte Stelle.

⚠️ **Gerundete Posten summieren sich dadurch sichtbar nicht mehr exakt** (Belegungs-Balken: 2,3 Mio + 1,2 Mio gegen 3,4 Mio Kapazität). Bewusst in Kauf genommen; wer das nicht will, braucht eine eigene Formatierung für den Balken, nicht eine andere Regel für alle.

⚠️ **Die Schwellen liegen knapp unter der runden Zahl** (999.950 statt 1.000.000). Sonst rundet 999.999 auf eine Nachkommastelle zu „1000k" statt zu „1 Mio".

### Fehlende Ressourcen — blasse Kachel und benannter Knopf

Kaufen kann man an sieben Stellen (Shop, Feldkauf, Farm-Ausbau, Techtree-Node, Werbedeal, Kampagne, KI-Labor-Umwandlung), und bis zum 2026-08-12 hat jede für sich beantwortet, warum es gerade nicht geht. Der Shop sagte „Zu teuer" auch dann, wenn in Wahrheit die Metadaten fehlten; die Werbeagentur kannte den richtigen Grund und versteckte ihn in einem `title`, den auf dem Tablet niemand sieht; der Techtree-Detail prüfte die **Serverkapazität gar nicht** und ließ einen grünen „▶ Entwickeln" stehen, den erst `startTechNode()` beim Klick ablehnte.

Seitdem gibt es **zwei Signale aus einer Rechnung**:

1. **Der Knopf nennt die Ressource** — `Zu wenig 💰` · `Zu wenig 🗃️` · `Zu wenig ⏳` · `Zu wenig 🖥️`, bei mehreren Lücken `Zu wenig 💰 🗃️`.
2. **Die unterdeckte Kostenkachel wird blass** — sie bleibt an ihrem Platz und behält ihre Zahl, verliert aber ihre Ressourcenfarbe. In einer sonst normal eingefärbten Spalte ist das eindeutig, ohne dass irgendwo Text dazukommt.

`RT.ledger.cover(cost)` (`js/ledger.js`) ist die eine Rechnung dahinter: ein Kostenposten bringt neben `value` (Anzeigetext) ein `need` (Zahl) mit, `cover()` markiert die unterdeckten und liefert die Knopfbeschriftung zurück. **Knopf und Kachel können dadurch nicht auseinanderlaufen** — genau das war der Fehler, den die sieben Einzellösungen produziert haben.

Vier Regeln:

1. **Blass heißt: eine Zahl ist zu klein.** Alles andere gehört auf den Knopf und färbt nichts ein — „Kein freier Platz", „Alle Plätze belegt", „Passt hier nicht", „Schon gebaut", „Es läuft schon ein Deal".
2. **Gesperrte und laufende Karten markieren nichts.** Bei einer Node hinter einer fehlenden Voraussetzung wäre eine blasse Geldkachel Rauschen; bei einem laufenden Deal ist der Zyklus längst bezahlt. Deshalb rufen die Aufrufstellen `cover()` **bedingt** auf.
3. **Ohne `need` wird nie markiert.** Zeit und Trend haben kein Konto, gegen das man sie prüfen könnte — sie bleiben immer farbig.
4. **🖥️ prüft gegen `freeUserCapacity()`**, nicht gegen ein Guthaben. Gegen die Gesamtkapazität zu prüfen würde eine Node durchwinken, für die längst kein Platz mehr ist.

⚠️ **Bewusst kein Rot.** Das gehört `.rt-led__item--warn` (Dark Patterns) und bedeutet dort „unumkehrbarer Schaden". Zwei rote Kacheln mit verschiedener Aussage in derselben Spalte wären die perfekte Verwechslung.

⚠️ **Die blasse Kachel ist zum Papierton hin ausgewaschen, nicht abgedunkelt.** Ein mittleres Grau lag zu nah an `--res-time-bg` — die Zeit-Kachel ist ohnehin fast farblos und wird nie markiert, beide waren in derselben Spalte kaum auseinanderzuhalten. So ist die unterdeckte Kachel die **hellste** der Spalte.

⚠️ **In der Werbeagentur und im KI-Labor ist die Deckung eine laufende Zahl** — auf einer Anteils-Stufe sogar ein Prozentsatz des Lagers. Beschriftung und Kachel laufen dort im Sekundentakt mit (`markShortTiles()` in `js/ui.js`), statt die Karte neu zu bauen: ein Neuaufbau würde den Intensitäts-Regler den Finger kosten. Wenn das im Spiel zappelt, ist der Knopf dafür eine kleine Hysterese (blass erst ab ~5 % Unterdeckung), **nicht** das Weglassen der Markierung.

⚠️ **`markShortTiles()` sucht nur in der KOSTEN-Spalte.** In der Ertrags-Spalte stehen dieselben Ressourcen-Klassen — ein Werbedeal bringt 💰 und kostet ⏳ —, und eine blasse Ertrags-Kachel wäre schlicht gelogen.

⚠️ **Der Feldkauf hat keine Ledger-Karte** und damit keine blasse Kachel; dort steht der Preis als große Zahl allein. Die Beschriftung folgt trotzdem der gemeinsamen Form, damit „Zu wenig 💰" im ganzen Spiel dasselbe heißt. Dieselbe Regel gilt für die Toasts der Versorgungs-Knöpfe (`js/loop.js`).

### Erklär-Touren — Neues wird gezeigt, nicht beschrieben

An drei Stellen kommt Neues auf einmal: am **Spielanfang**, beim **Go-Live** und beim **Sprung in Phase 2**. Dazu eine vierte, die an keiner Phase hängt: das **erste Watchtime-Feature**. Alle laufen über dieselbe Mechanik (`js/tour.js` + `css/tour.css`) — der Bildschirm dunkelt ab, das erklärte **echte** UI-Element bleibt hell, ein Pfeil zeigt darauf, darunter eine kompakte Karte mit Bild und wenig Text.

**Intro-Tour** (Phase 0, sobald das Grid zum ersten Mal steht):

| Schritt | Spotlight auf | Karte zeigt |
|---------|---------------|-------------|
| 1 | alle Grid-Felder + Gebäude | „Hier wächst dein Unternehmen", 9 Felder → später Land dazu |
| 2 | HQ | HQ → 🧩 Features; Klick öffnet den Baum, eine Entwicklung gleichzeitig |
| 3 | Ressourcen-Bar | Geld · User · Server, je ein Satz |
| 4 | 🛒-Button | 💻 Rechner + Serverfarm — beides fürs erste Feature |
| 5 | — (Vollbild-Dimm) | Spielfigur + Logo, Kette entwickeln → online gehen → User, CTA „Los geht's!" |

**Go-Live-Karte** (Phase 0 → 1, direkt nach der Launch-Sequenz): **ein** Schritt, **ohne** Spotlight — das ist ein Moment, kein Zeigefinger. Logo mit Live-Punkt, die Kette `✅ entwickelt → 🌐 online → 👥 User`, die zwei neuen HQ-Reiter (Marketing/Werbung) als Kacheln und darunter abgesetzt das nächste Ziel: `🎯 Nächstes Ziel · 👥 1 000 User`. Die Schwelle kommt aus `RT.actions.INVESTOR_USER_THRESHOLD`, nicht aus dem Text — sonst laufen zwei Zahlen auseinander.

⚠️ **Dass bei 1 000 Usern ein Investor kommt, steht dort bewusst nicht.** Das Ziel ist die Zahl; die Belohnung soll der Investor-Moment selbst erzählen. Wer den Text erweitert, nimmt dem Auftritt die Überraschung.

**Phase-2-Tour** (nach dem Investor-Deal), ersetzt das frühere Text-Modal zum Trend:

| Schritt | Spotlight auf | Karte zeigt |
|---------|---------------|-------------|
| 1 | Trend-Kachel | animierter Ernte-Balken, ⭐ → 👥, vier Zeilen (inkl. „Features aus dem HQ heben ihn") |
| 2 | Watchtime-Kachel | Farm mit aufsteigenden ⏳ → Watchtime, dann ⏳ → Werbeagentur → 💰 |
| 3 | 🛒-Button | die drei neuen Gebäude-Sprites nebeneinander, je ein Satz, CTA „Starte dein Wachstum" |

**Phase-3-Tour** (nach Marcus' Rückkehr, `showPhase3Modal`), dieselbe Bauart wie die Phase-2-Tour, nur eine Karte länger — Modelle und Metadaten haben in der Ressourcen-Bar zwei getrennte Kacheln und brauchen deshalb zwei getrennte Spotlights statt einem gemeinsamen:

| Schritt | Spotlight auf | Karte zeigt |
|---------|---------------|-------------|
| 1 | Modelle-Kachel | ⏳ → 🧪 KI-Labor → 🧠, dieselbe Konverter-Logik wie die Werbeagentur, nur Modelle statt Geld |
| 2 | Metadaten-Kachel | 🧠 → 🗃️ (Sanduhr-Sprudel-Optik wiederverwendet), dazu die drei Abflüsse als Chips: Targeting · Zielgruppen-Offensive · KI-Features |
| 3 | Server-Kachel | die Kapazitäts-Entscheidung: ein Modell belegt 1 Kapazität wie ein User, kein Deckel außer dem Ausbau |
| 4 | 🛒-Button | KI-Labor-Sprite, CTA „Ab ins Labor 🧠" |

⚠️ **Ausgelöst wird sie NICHT von `investor:trigger`, sondern vom Schließen der zweiten Marcus-Seite** (`#rt-phase3-ok`) — dieselbe Stelle, an der die Investor-Tour aus dem `Deal!`-Klick startet. Marcus' Modal bleibt die Story (Ausschüttung, Prosa), die Tour danach ist die Mechanik (Spotlight auf echte UI). Beides zu einem Modal zu verschmelzen hätte entweder die Story mit UI-Chips verwässert oder die Tour ihres Spotlights beraubt.

⚠️ **Der Debug-Sprung nach Phase 3 setzt `phase3TourSeen` explizit auf `false`.** Der Seed setzt `phase3Triggered` direkt und überspringt damit Marcus' Modal (siehe `debug.js`) — ohne das Zurücksetzen wäre der Sprung der einzige Weg im Spiel, die Tour nie zu sehen. Sie läuft in diesem Fall über denselben Nachhol-Pfad wie golive/phase2 bei alten Spielständen (`gameScreen.js`, `RT.tour.startIfNew()` ohne ID).

**Watchtime-Multiplikator-Karte** (`wtmult`), **ein** Schritt mit Spotlight auf die Watchtime-Kachel: ausgelöst beim **Einsammeln** der ersten Node mit `watchtimeMult`. Genau dort erscheint der ×-Chip an der Kachel zum ersten Mal (`ui.js`, `refs.wtMult` bei `wm > 1`), und eine Zahl, die niemand erklärt hat, ist keine Belohnung. Die Karte zeigt den Faktor an einem Rechenbeispiel (`1 000 ⏳ × 1,10 → 1 100 ⏳`) und die drei Eigenschaften, die ihn vom Trend-Bonus unterscheiden: gilt für **alle** Farmen, greift beim **Ernten**, bleibt **dauerhaft**.

⚠️ **Die Bedingung liest `def.watchtimeMult`, nicht eine Node-Liste.** Welche der sechs Phase-2-Nodes (oder der Phase-3-Nodes) zuerst kommt, entscheidet der Spieler — die Karte kann also in **Phase 2 oder 3** fallen. Sie steht deshalb auch nicht in `forPhase()` und ist über das „?" nicht wiederholbar; die dauerhafte Aufschlüsselung sitzt hinter dem Chip selbst. Die auslösende Node-ID geht als Kontext-Argument durch `start(id, ctx)`, damit die Karte das Feature beim Namen nennt.

**Netzwerkeffekt-Karte** (`network`), **ein** Schritt mit Spotlight auf die Trend-Kachel: ausgelöst, sobald der Netzwerkeffekt zum ersten Mal **+2,0** überschreitet. Er ist die einzige Trend-Quelle ganz ohne Klick — und damit die einzige, die man komplett übersehen kann. Die Karte zeigt die **Leiter** (nur bis zum Gipfel) und drei Zeilen: steigt ohne dein Zutun · jede Verzehnfachung bringt +k · bei 1 Mrd ist der Gipfel, **danach sinkt der Wert wieder** (⚠️ Text-Ergänzung 2026-08-09 — die Leiter selbst zeigt weiterhin nur bis zum Gipfel, das Sinken stand vorher nirgends auf der Karte, nur im Trend-Modal).

⚠️ **Die Schwelle ist bewusst höher als der Einstieg bei 10.000 Usern.** Dort steht der Wert bei 0,0 und es gäbe nichts zu zeigen. Bei +2,0 hat die Leiter zwei erreichte Sprossen und vier offene — das ist der Moment, in dem sie als Fortschritt lesbar ist.

**Vertrauens-Feature-Karte** (`whitepattern`), ausgelöst beim **Einsammeln** der ersten Node mit `networkK`. Dieselbe Begründung wie bei `wtmult`, nur umgekehrt: hier passiert im Moment des Abholens sichtbar **fast nichts** — der Trend rührt sich kaum. Ohne Karte sähe die teuerste Node im Baum wie ein Fehlkauf aus. Sie zeigt deshalb **zwei Leitern untereinander**: oben die alte Steigung, darunter die neue, gleiche Plattform. Das sagt ohne einen einzigen Zahlenvergleich im Text, was die Node getan hat.

⚠️ **Sie standen bis zum 2026-08-07 nebeneinander**, mit dem Argument, man vergleiche die Zahlen dann paarweise. In der Kartenbreite blieben je Leiter aber nur ~46 px pro Sprosse — sechs Sprossen mit 8-px-Beschriftung, zweimal. Genau die Zahlen, um die es geht, waren dadurch die am schlechtesten lesbaren. Untereinander bekommt jede Leiter die volle Breite, und weil die Sprossen senkrecht exakt übereinanderstehen, bleibt der paarweise Vergleich erhalten — er läuft nur von oben nach unten.

### Die Netzwerkeffekt-Leiter

Der wichtigste Baustein der ganzen Mechanik, weil ein Bonus auf eine **Steigung** unsichtbar ist, wenn man ihn nicht zeigt. Sie steht im Trend-Aufschlüsselungs-Modal unter den Modifikator-Zeilen:

```
🌐 Netzwerkeffekt                                          +4,0
   Je mehr User, desto attraktiver wird die Plattform von allein.

   100k ─ ▐1 Mio▌ ─ 100 Mio ─ 1 Mrd ─── 2 Mrd ─ 3 Mrd
   +2,0     +4,0      +8,0     +10,0     +7,5     0
              ▲ du bist hier      MAX          Welt voll
                              └── Gipfel ──┴─ Sättigung ─┘
```

⚠️ **500.000 und 10 Mio sind am 2026-08-09 aus der Leiter genommen worden** — acht Sprossen waren zu viele Kacheln. `NETWORK_LADDER` (`js/state.js`) ist die einzige Quelle; beide Stellen, die sie zeichnen (Trend-Modal und die Erklär-Karte, s. u.), ziehen automatisch mit.

Vier Dinge auf einmal: aktueller Wert · dass er **steigt** · die **nächste Sprosse** als Ziel · die Decke. Und der eigentliche Zweck: **baut man ein Vertrauens-Feature, gehen alle Zahlen auf der Leiter hoch** — sichtbarer Beweis, dass die Node etwas getan hat, obwohl sich der Trend gerade kaum bewegt.

Waagerecht, weil links→rechts hier „wächst" heißt; auf schmalen Geräten scrollt sie in sich selbst statt umzubrechen (umgebrochen wäre die Reihenfolge nicht mehr eindeutig).

⚠️ **Die zwei Sprossen hinter dem Gipfel gehören dazu, obwohl sie fallende Zahlen zeigen.** Eine Leiter, die bei 1 Mrd aufhört, verschweigt genau die eine Sache, die der Spieler vorher wissen muss — dass Wachstum irgendwann gegen sich selbst arbeitet. Sie sind weit weg und deshalb keine Drohung, sondern ein Horizont. Optisch sind sie sandfarben statt türkis (**nicht rot**: es ist kein Schaden und keine Strafe, sondern das Ende der Fahnenstange), und das `MAX` sitzt seitdem auf dem **Gipfel** und nicht mehr auf der letzten Sprosse — „MAX" über einer Null wäre die Aussage auf den Kopf gestellt.

⚠️ **Die Leitern in den Erklär-Karten hören dagegen am Gipfel auf** (`networkLadder(k, peakOnly)`). Dort geht es um die **Steigung**, und eine Sprosse, die in beiden Leitern 0 zeigt, sagt darüber nichts. Dazu ein harter Grund: acht Sprossen nebeneinander sind in der Kartenbreite ~36 px breit und damit unlesbar — dieselbe Rechnung, die die zwei Leitern schon untereinander statt nebeneinander gebracht hat.

**Im Techtree** tragen Vertrauens-Features den Chip `🌐 +0,5 jetzt · +1,0 bei 100 Mio` — zwei echte, aus dem aktuellen Stand gerechnete Zahlen. „+12,5 % Netzwerk-Steigung" wäre korrekt und trotzdem unlesbar; so erklärt der Chip die Mechanik in vier Wörtern und macht ehrlich sichtbar, dass es *heute* wenig ist. Dazu ein türkiser Akzent als Spiegel zur roten Dark-Pattern-Optik (nicht grün — grün ist im Baum schon der Status „fertig/bezahlbar" und würde als Zustand gelesen).

**Der Sprossen-Toast.** Alle 0,5 Punkte meldet sich der Effekt kurz: „🌐 Netzwerkeffekt +5,0 — deine Plattform zieht von allein." Ohne das ist es eine Zahl, die im Hintergrund hochkriecht und die niemand bemerkt; damit ist es wiederkehrendes Lob fürs Wachsen. Der Merker (`networkSeen`) liegt im **Spielstand**, nicht im Modul — sonst käme nach jedem Neuladen die ganze Leiter als Toast-Salve.

**Der Sättigungs-Toast.** Genau **einmal**, in dem Moment, in dem der Effekt zum ersten Mal fällt statt zu steigen: „🌍 Die Welt füllt sich — ab hier bringt jeder weitere User weniger Netzwerkeffekt." Ein Posten, der jahrelang nur hochging und sich ohne Vorwarnung umdreht, sieht sonst aus wie ein Fehler im Spiel. Merker `networkSatSeen`, gleiche Regel wie oben; `storage.migrate()` setzt ihn bei Ständen über 1 Mrd auf `true` — wer den Übergang nie erlebt hat, dem meldet die Ansage nur einen Zustand, der für ihn längst normal ist. Die Aufschlüsselung dahinter steht im Trend-Modal, das dafür einen **dritten** Textzustand hat (steigend · Gipfel · Sättigung).

⚠️ **Auf die Trend-Kachel selbst kommt nichts dazu.** Die zeigt weiter die eine Netto-Zahl. Das Prinzip „eine wörtlich lesbare Zahl statt Dashboard" gilt gerade hier, wo jetzt fünf Posten zusammenlaufen.

**Der Spotlight zeigt das echte UI, keinen Nachbau.** Abgedunkelt wird über einen Riesen-Schatten um ein „Loch" (`.rt-tour__hole`) — dadurch liegt nichts über dem Ziel, es bleibt live (der Trend-Balken läuft während der Erklärung weiter), und es muss nicht am `z-index` der Ressourcen-Bar gedreht werden. Ein Schritt zielt entweder per Selektor oder über eine `rect()`-Funktion (das Grid rechnet den Umriss aller Felder selbst aus — `#iso-grid` ist viel größer als die bespielte Fläche). Fehlt ein Ziel, dunkelt der Klick-Fänger den ganzen Bildschirm ab und die Karte rutscht in die Mitte; die Tour bleibt daran nie hängen.

Farben kommen aus dem Logo-Theme (`--rt-primary` / `-soft` / `-wash`, `js/theme.js`); Rahmen und Text bleiben im Braun der übrigen Modale, damit alle acht Themes tragen.

⚠️ **Das „gesehen"-Flag wird erst beim Beenden gesetzt** (`introTourSeen` · `goLiveModalSeen` · `trendModalSeen` · `phase3TourSeen` · `watchtimeMultSeen` · `networkTourSeen` · `whitePatternSeen`), nicht beim Öffnen — wer mitten in der Tour neu lädt, bekommt sie nochmal. Gegen doppelte Overlays (Investor-Pfad **und** Nachhol-Pfad in `gameScreen.js`) schützt der `_open`-Guard im Modul, nicht das Flag.

⚠️ **`storage.migrate()` setzt `introTourSeen` bei alten Spielständen auf `true`.** Wer schon spielt, hat den Anfang hinter sich; ohne das bekäme er die Intro-Tour beim nächsten Laden vorgesetzt. `watchtimeMultSeen` folgt derselben Regel, aber **bedingt**: `true` nur, wenn `watchtimeMult() > 1` — wer den Chip schon sieht, braucht die Erklärung nicht mehr, wer die Achse noch nicht angefangen hat, bekommt sie ganz normal beim ersten Mal. `networkTourSeen` (bei Netzwerkeffekt > 2) und `whitePatternSeen` (bei mindestens einer `networkK`-Node) laufen genauso.

⚠️ **`networkSeen` muss auf den Istwert und nicht auf 0.** Eine große bestehende Plattform steht sofort bei +8,0 — bei 0 würde der Tick beim ersten Laden sechzehn Toasts hintereinander feuern.

Ein **„?"-Button neben dem Shop** startet die zur Phase passende Tour jederzeit erneut (`RT.tour.forPhase()`: Phase 0 die Intro-Tour, Phase 1 die Go-Live-Karte, Phase 2 die Trend/Watchtime-Tour, Phase 3 die KI-Labor-Tour, ab Phase 4 die Ereigniskarten-Tour). Gezeigt wird also immer das, was am **Anfang der laufenden Phase** erklärt wurde — in Phase 1 die Intro-Tour zu wiederholen wäre ein Rückschritt, ihr Inhalt ist dort längst abgehakt. Die Detail-Ansichten bleiben davon unberührt: das „?" auf der Trend-Kachel öffnet weiter die Modifikator-Aufschlüsselung, der ⏳-Chip die des Watchtime-Multiplikators.

---

## 10.5 Persistenz — wo der Spielstand liegt

Der Spielstand hängt am **Account**, nicht am Gerät (Migration 0061, Tabelle `user_game_saves`). Gespeichert wird `RT.state.current` als **kompletter, ungefilterter Blob** — Geld, User, Watchtime, Metadaten, Modelle, `placedBuildings` samt aller Gebäude-States (laufende Deals inkl. `volume`/`autoRenew`/`grossWt`, Kampagnen mit PR-Platz, Farm-Stapel, `upkeepCycles`), `techtree`, `trendMods`, `events`, `ownedTiles`, `purchases`, `seenBadges`, sämtliche Tour-Flags und `player`.

⚠️ **Es gibt bewusst keine Feldauswahl.** Ein vergessenes Feld wäre stiller Fortschrittsverlust, und die Liste oben wächst mit jeder Phase weiter.

| Datei | Rolle |
|---|---|
| `js/storage.js` | localStorage: Gast-Speicher, Offline-Puffer, Cache. Rein lokal und synchron. |
| `js/cloud.js` | `RT.cloud` — die Server-Seite. Ohne Login tut das Modul nichts. |

**Server gewinnt beim Laden.** Der Boot in `main.js` ist deshalb asynchron (Splash statt Intro-Flackern) und läuft in dieser Reihenfolge: Session abwarten → lokal laden → **falls dirty: lokal hochschieben** → Serverstand laden → Aufholpass. Der Dirty-Push muss vor dem Laden stehen, sonst überschreibt der Serverstand eine Offline-Runde, bevor sie oben ankommt.

**Der Server gewinnt auch, wenn er leer ist.** Hat das Konto keinen Spielstand, fängt das Spiel neu an — egal was im localStorage liegt (`storage.dropLocal()` + `state.resetCurrent()`, dann Intro). Was dort läge, wäre ein Gast-Spielstand von vor dem Login oder der Rest eines anderen Kontos; beides darf sich nicht in ein leeres Konto einschleichen. Die vollständige Matrix:

| Server | localStorage | Ergebnis |
|---|---|---|
| hat Stand | egal | Serverstand gilt, lokal wird überschrieben |
| **leer** | hat Stand | **Neuanfang**, lokaler Stand wird verworfen |
| leer | hat **dirty** Stand | der lokale Stand wurde einen Schritt vorher hochgeschoben — der Server ist dann nicht mehr leer, es geht weiter |
| Stand mit fremder `save_version` | egal | wie „leer": Neuanfang |
| **nicht erreichbar** | hat Stand (eigener) | lokal weiterspielen, **aber nichts pushen** |
| — (Gast) | Stand **aus einem Konto** | **Neuanfang** — ohne Konto nicht spielbar, der Stand bleibt aber liegen |
| — (Gast) | Gast-Stand | rein lokal wie bisher |
| eingeloggt als B | Stand von **A** | ignoriert, es zählt B's Konto |

**Der lokale Blob trägt seinen Besitzer.** Im localStorage-**Umschlag** (`{ v, owner, data }`, nicht in `data` — der Blob für den Server bleibt sauber) steht die User-Id. `storage.ownsLocal()` lädt einen Stand nur, wenn `owner` zum aktuellen Konto passt; ein Konto-Stand ist ohne dieses Konto **nicht spielbar**, ein Gast-Stand wandert beim Login **nicht** mit.

⚠️ **`owner` kommt aus dem JWT (`sub`), nicht aus `getSessionUser()`.** `session.js` setzt `__session` auf `null`, sobald der Profil-Fetch scheitert — offline also immer. Über `getSessionUser()` wäre man beim Offline-Start plötzlich „niemand" und verlöre den eigenen Stand. `window.__accessToken` bzw. der persistierte `lernwelt-auth`-Eintrag trägt die Id auch ohne Netz.

⚠️ **Das ist der zweite Riegel neben `clearLocalGameState()`** und deckt genau das ab, was jenes nicht kann: dort wird nur bei explizitem Logout, fehlendem Profil oder erkanntem User-Wechsel geräumt. Läuft ein Token einfach ab, passiert nichts — und ohne `owner` stünde der Konzern des Vorgängers ohne jeden Login offen da.

⚠️ **Ein fremder Stand wird nicht gelöscht, nur ignoriert.** War er dirty, ist der nächste Login die einzige Chance, ihn noch hochzuschieben. Preis dafür: fängt im Gast-Modus jemand ein neues Spiel an, überschreibt der erste Save diesen Rest. Deshalb sagt das Konto-Abzeichen im Gast-Zustand ausdrücklich, dass hier ein Kontostand liegt und er im Konto auf einen wartet (`hasForeignSave()` in `ui.js`).

⚠️ **„Leer" und „nicht erreichbar" müssen zwei verschiedene Antworten sein.** `cloud.load()` liefert deshalb `{ empty:true }` gegen `null` — würden beide `null` liefern, hieße jeder Netzwerk-Wackler beim Boot „dein Konto ist leer", und der Spielstand wäre weg.

⚠️ **Nach einem gescheiterten `load()` wird NICHT gepusht** (`synced`-Flag in `cloud.js`). Der Client weiß dann nicht, ob drüben ein Stand liegt, und `rev` steht auf `null` — der Server nimmt einen Push mit `p_base_rev = null` bereitwillig an. Ein Tablet mit wackligem WLAN hätte so einen alten Gerätestand über den neueren Kontostand gelegt. Einzige Ausnahme ist `push({ force:true })` beim Boot: der Dirty-Marker belegt, dass dieser Stand nie oben war.

**Der Dirty-Marker** (`startupStoryV3_dirty`, eigener localStorage-Key) heißt „der lokale Stand ist nie beim Server angekommen". Gesetzt bei jedem lokalen Save, gelöscht nach jedem erfolgreichen Push — bewusst **ohne** Snapshot-Vergleich: das Spiel tickt jede Sekunde weiter, ein Vergleich würde den Marker praktisch nie löschen.

**Takt:** höchstens alle 20 s ein Push, dazu sofort bei `pagehide` / `visibilitychange` (mit `keepalive`) und an den Meilensteinen `goLiveUnlocked`, `investorTriggered`, `phase3Triggered`, `phase4Triggered`. `storage.js` speichert weiterhin jede Sekunde lokal — ein RPC in diesem Takt wäre absurd.

⚠️ **`savedAt` gehört `storage.writeLocal()`, der Push fasst es nicht an.** Sonst verlöre der Boot-Push einer Offline-Runde genau die Information, aus der der Aufholpass die Abwesenheit rechnet. Für einen **fremden** Serverstand zählt ohnehin nicht `savedAt`, sondern `age_sec` aus `load_game_save` — die Serveruhr, weil `savedAt` sonst von der womöglich falsch gestellten Uhr des anderen Geräts käme.

⚠️ **`rev` (Optimistic Concurrency).** Der Client schickt die Revision, die er beim Laden gesehen hat. Passt sie nicht, hat ein zweites Gerät inzwischen geschrieben: dieser Tab **stellt das Schreiben ein**, löscht seinen Dirty-Marker und sagt es per Toast. Wer zuletzt geladen hat, spielt gerade wirklich. Das Löschen des Markers ist dabei die Pointe — ohne es schöbe der nächste Boot genau diesen überholten Stand als „ungepushte Offline-Runde" nach oben.

⚠️ **`RT.storage.wipe()` ist async**, weil es den Serverstand per RPC mitlöscht. Der Debug-Neustart muss darauf warten, sonst stirbt der RPC mit der Seite und der nächste Boot lädt den gerade gelöschten Stand wieder herunter.

⚠️ **`clearLocalGameState()` in `session.js` muss `startupStoryV3` kennen.** Sonst erbt auf einem geteilten Tablet der nächste Schüler den Konzern des vorigen — und der Dirty-Marker schöbe ihn beim nächsten Boot in dessen Account.

### Das Konto-Abzeichen — sichtbar machen, wo der Stand liegt

Ein kleines Abzeichen unten rechts am **Avatar-Kopf** in der Profile-Bar, aus `RT.cloud.status()`. Vier Zustände:

| Zustand | Abzeichen | Bedeutung |
|---|---|---|
| `account` | ☁ blau | Stand liegt im Konto, auf jedem Gerät da |
| `offline` | ⇅ bernstein | Letzter Push ging nicht durch — wird nachgeholt |
| `conflict` | ! rot, pulsiert | Anderes Gerät hat weitergespielt, Seite neu laden |
| `guest` | ☁ grau, durchgestrichen | Stand nur auf diesem Gerät |

⚠️ **Es sitzt links beim Spieler und ist bewusst nicht grün und nicht rund.** Rechts in derselben Leiste steht schon `rt-profile-bar__online-dot` — ein grüner, pulsierender Punkt, der „**deine Plattform** ist live" bedeutet (`goLiveUnlocked`). Zwei gleich aussehende Signale mit verschiedener Aussage in einer Leiste wären die perfekte Verwechslung.

⚠️ **Nur `conflict` pulsiert.** Es ist der einzige Zustand, der etwas vom Spieler will. `guest` ist zwar der folgenreichste, aber ein dauerpulsierendes Abzeichen für einen Zustand, den man im Spiel nicht ändern kann, wäre reine Nörgelei.

⚠️ **`rate_limit` setzt NICHT auf `offline`.** Ein Sofort-Push kurz nach dem Takt-Push läuft regelmäßig in die 3-Sekunden-Wand; als Fehlerzustand gelesen würde das Abzeichen dabei flackern.

Ein Klick öffnet eine kurze Erklärung — im Gast-Fall mit „Zur Lernwelt", im Konflikt-Fall mit „Neu laden". Das Modal läuft mit `context = null`, damit `refreshModal()` bei `state:changed` nicht versucht, einen Typ neu zu bauen, den es nicht kennt.

⚠️ **Der Klick-Handler ist delegiert und das Abzeichen wird nicht in `el` gecacht.** `gameScreen.enter()` baut die Profile-Bar bei jedem Betreten neu, `RT.ui.init()` läuft aber nur einmal — eine direkt gebundene Referenz zeigte danach auf einen Knopf außerhalb des Dokuments.

### Neustart — der Notausgang im Konto-Modal

Unter der Zustands-Erklärung sitzt, hinter einer Trennlinie abgesetzt, ein roter **„🗑 Spiel neu starten"**. Er ist der einzige Weg für den Spieler, von vorn anzufangen; bis dahin gab es das nur im Debug-Overlay.

**Er sitzt hier, weil das Konto-Abzeichen der einzige Ort im Spiel ist, an dem es um den Spielstand als Ganzes geht.** Im Shop stünde er neben Gebäuden, in der Ressourcen-Bar neben Zahlen — beides Orte, an denen man ihn versehentlich trifft.

**Zwei Schritte, und der zweite zeigt Zahlen.** Der Klick öffnet einen eigenen Modal-Schritt (`openRestartModal()`) mit User, Geld, Gebäuden und fertigen Features aus dem laufenden Stand, dazu die Ansage, dass auch der **Kontostand auf allen Geräten** gelöscht wird (im Gast-Fall entsprechend nur das Gerät). Abbrechen führt zurück ins Konto-Modal, nicht ins Spiel.

⚠️ **Bewusst kein `confirm()`.** Der Browser-Dialog kann nicht sagen, was verloren geht, und sieht auf Tablets aus wie eine Systemmeldung, die man wegtippt. Der Debug-Neustart darf `confirm()` behalten — dort ist der Adressat ein Entwickler.

⚠️ **Beide Knöpfe werden beim Bestätigen sofort deaktiviert.** `RT.storage.wipe()` ist async (Server-RPC); ein zweiter Klick in dieser Zeit setzte einen zweiten Reset ab. Neu geladen wird erst nach dem RPC — sonst stirbt er mit der Seite und der nächste Boot zieht den gerade gelöschten Stand wieder herunter.

Die Admin-Seite des Spielstands steht in §10.7.

---

## 10.6 Lernwelt-Anbindung — der Hub leitet ab, das Spiel meldet nicht

Jedes andere Spiel ruft am Rundenende `saveGameData()` auf. Startup Story hat keine Runden, keinen Score und keinen Abschluss-Screen — es gäbe schlicht keinen Moment, in dem es etwas zu melden hätte. Deshalb **meldet es gar nichts**: der Hub liest beim Boot den Blob aus 10.5 und rechnet Kreatur, Wachstum und Münzen selbst aus (`GameHub/creatures.js`, `syncStartupStory()`).

Das ist gleichzeitig die Spielregel: **im Spiel sieht man nie, wo man steht.** Weder Ei noch Monster noch Münzen tauchen hier auf. Erst der Weg zurück in die Lernwelt zeigt es, als Sequenz im Reveal-Modal (`GameHub/script.js`, `showStartupRevealModal`). Die Frage „wie weit ist mein Tier?" ist damit der Grund, ins Hub zurückzugehen — und der 🏠-Knopf in der Profile-Bar ist der Weg dorthin.

⚠️ **Das weicht bewusst von der Warnung in Migration 0061 ab.** Dort steht: „Sobald game18 Coins oder eine Kreatur ausschüttet, MUSS das über `sync_game_state` laufen und **nicht aus diesem Blob gelesen** werden." Der erste Teil gilt — geschrieben wird über `sync_game_state`, mitsamt Delta-Deckeln und Schreibtakt. Der zweite Teil ist nicht einlösbar: die Userzahl **existiert nur** in der Client-Simulation, es gibt keine zweite Quelle, aus der sie stattdessen käme.

Damit ist die Ausschüttung so vertrauenswürdig wie der Blob, also gar nicht: wer `startupStoryV3` im localStorage bearbeitet, kann sich 100 Münzen und den ersten Platz der Bestenliste schreiben. Je Durchlauf sind es höchstens 100 Münzen, aber Durchläufe sind wiederholbar — die Obergrenze ist also die Geduld beim Neustarten, nicht der Deckel. Wer das härten will, muss die **Userzahl serverseitig plausibilisieren** (Zuwachs gegen verstrichene Zeit), nicht den Speicherweg wechseln — der Weg über `sync_game_state` ist schon der, den 0061 verlangt.

### Was woraus abgeleitet wird

| Größe | Formel | Bezugswert |
|---|---|---|
| **Kreatur** | 5 % Epic · 20 % Libelle (S3-Rare) · 75 % gleichverteilt über 12 Normale. Keine Legendaries. | Roll beim Eintritt in Phase 3 |
| **Wachstum** | `21 · log(u / 1 Mio) / log(100)`, gedeckelt auf `GROWTH_MAX` | `usersPeak` **dieses** Spielstands |
| **Münzen** | `100 · log(u / 1 Mio) / log(10.000)`, gedeckelt auf 100 | `usersPeak` **dieses** Spielstands |

Die Brutphase ist Phase 0–2, geschlüpft wird bei `PHASE3_USER_THRESHOLD` (1 Mio). Ausgewachsen ist das Monster bei 100 Mio Usern, die 100. Münze fällt bei 10 Mrd.

⚠️ **Beide Kurven hängen am laufenden Durchlauf, nicht an einem All-Time-Wert.** `storage.wipe()` löscht `usersPeak` mit, ein neu gestarteter Konzern brütet also wirklich wieder ein Ei aus **und** verdient wieder Münzen. Der Weg von 1 Mio auf 10 Mrd User ist kein Betrag, den man einmal im Leben abholt — 100 Münzen dafür sind eher wenig.

⚠️ **`gd.coins` ist deshalb der Auszahlungszähler des Durchlaufs, nicht ein Sparkonto.** Beim Freilassen schiebt `releaseCreature()` den Stand nach `shop_state.bankedCoins` und setzt den Slot auf 0 — sonst verdiente der nächste Konzern nichts, bis er den vorigen überholt hat. Der Gesamtbestand bleibt gleich: `wallets.coins` wird serverseitig als `sum(game_state.coins)` neu gerechnet (Migration 0031), und die Münz-Rangliste zählt `bankedCoins` ohnehin mit. Für Nester macht `releaseNest()` seit jeher genau dasselbe.

Der **All-Time-Peak** existiert weiterhin, aber nur noch für die Bestenliste (unten).

⚠️ **`usersPeak` wird im Tick gepflegt** (`js/loop.js`, `trackUsersPeak()`), nicht an den sechs Stellen, die `s.users` schreiben — und zusätzlich am Ende von `offlineCatchUp()`, weil der Aufholpass User gutschreibt, ohne durch den Tick zu laufen.

### Neustart und Freilassen — zwei Richtungen, eine Regel

- **Neustart im Spiel** löscht den Blob. Der Hub sieht beim nächsten Besuch einen leeren Spielstand neben einer vorhandenen Kreatur und lässt sie frei. Kein Marker, kein Flag — der leere Blob **ist** das Signal, und damit räumt auch ein zweites Tablet korrekt auf.
- **Freilassen im Hub** löscht umgekehrt den Blob (`reset_game_save`) — das Monster ist nichts anderes als die Userzahl des Konzerns.

⚠️ **`reset_game_save` steht nur im Hub-Knopf, nicht in der Neustart-Erkennung.** Dort ist der leere Blob bloß eine Beobachtung; auf einem zweiten Gerät könnte längst ein neuer Konzern stehen, den eine beobachtende Löschung mitnähme.

⚠️ **Der Blob-Read kennt drei Ausgänge, nicht zwei:** Blob da → ableiten · leer → Kreatur freilassen · **nicht erreichbar → nichts anfassen**. Ein Serverfehler darf kein Monster kosten.

### Was im Hub nicht gilt

`standalone: true` in `GAMES_CONFIG` (`GameHub/script.js`) ist der eine Schalter für alle Ausnahmen: **keine Nester** (ein Nest liefe unter fremder Id durch ein Spiel, das weder Runden hat noch die Id aus der URL liest), **kein Backup-Tausch** und **keine Runden-Items** (Booster, Coins ×3, Glücksklee, Lockmittel greifen alle am Rundenergebnis an). Kein Begleiter-Widget im Spiel.

**Wachstumstrank und Stein der Vollendung wirken weiter** — beide greifen im Hub am Monster an, nicht im Spiel. Die Kurve schreibt deshalb per `Math.max`, sonst drehte sie den Trank beim nächsten Hub-Besuch zurück.

### Bestenliste

Höchste je erreichte Userzahl, in `highscores.html` als eigenes Board. Gespeichert wird sie in **Hundertern** (`SS_SCORE_UNIT`): `game_highscores.best_score` ist ein `int`, und 10 Mrd liefen über. Wer den Faktor ändert, muss `startupUsersFromScore()` in `creatures.js` und `fmtStartupUsers()` in `highscores.html` gemeinsam anfassen.

⚠️ **Die Userzahl darf nicht in `game_state.points`.** `sync_game_state` deckelt den Zuwachs dort auf 300 je Aufruf (`MAX_POINTS_DELTA`, Migration 0031) — ein Sprung auf Millionen gälte als Cheat und der ganze Sync würde abgelehnt, samt Kreatur und Münzen.

### Bonbons

Basis = gewonnene Wachstumspunkte (0–10) plus der übliche +20-Tagesbonus, ausgeschüttet im letzten Schritt der Reveal-Sequenz. Die Sequenz läuft nur bei echtem Fortschritt — wiederholtes Hub-Auf-und-Ab druckt also keine Bonbons.

---

## 10.7 Admin-Ansicht — das Panel rechnet mit den Spiel-Modulen

Im Admin-Panel unter **User → Fortschritt** steht ein zweiter Umschalter: **Hub** (Coins, Kristalle, Kreaturen — der Sammelstand aus allen Spielen) oder **🚀 Startup Story** (der Spielstand aus `user_game_saves`). Die Startup-Ansicht ist eine Tabelle über **alle** User: Phase · User · Peak · Geld · Watchtime (mit ×-Faktor) · Trend (mit Ruhewert) · Serverkapazität (mit Farmzahl, Tarifstufe und Drossel-Warnung) · Modelle/Metadaten · Techtree-Anteil · Dark Patterns gegen Vertrauens-Features · zuletzt gespeichert. „Details" öffnet dazu Farmen einzeln, laufende Deals und Kampagnen und die vollständige Trend-Aufschlüsselung.

**Das Panel baut keine Formel nach, es lädt das Spiel.** `admin/app.js` zieht beim ersten Öffnen der Ansicht `namespace.js`, `bus.js`, `ledger.js`, `state.js`, `techtree.js` und `events.js` nach und legt den Blob per `ssApply()` als `RT3.state.current` ab; jede Zahl kommt danach aus demselben Getter, aus dem sie auch im Spiel kommt (`currentPhase()`, `serverCapacityTotal()`, `trendValue()`, `watchtimeMult()`, `farmFills()` …).

Der Grund ist die Halbwertszeit der Alternative: Phase-Schwellen, Tarifstufen, der Netzwerkeffekt und die Zahl der Nodes ändern sich mit **jedem** Balance-Pass. Eine zweite Implementierung im Admin-Panel wäre nach dem ersten davon still falsch — und im Panel fällt das niemandem auf, weil dort keiner spielt.

⚠️ **Nur lesende Getter aufrufen.** `setTrendMod`, `pushSparkSample`, `markSeen` & Co. schreiben in `current` — und weil `ssApply()` die verschachtelten Objekte per Referenz übernimmt, landete das im geladenen Blob.

⚠️ **`RT3.state.current` ist EIN Objekt.** Jede Auswertung überschreibt es; die Tabelle wertet alle User nacheinander aus. Deshalb hält der Cache je User den **rohen Blob** und nicht `current` — sonst zeigten am Ende alle Zeilen den Stand des zuletzt ausgewerteten Users. Wer nach der Tabelle noch rechnen will (Detail-Modal), ruft `ssApply()` erneut auf.

⚠️ **Die sechs geladenen Module sind reine Definitions-Module** — kein DOM-Zugriff beim Laden, keine Timer. Nur `techtree.js` hängt sich an `state:changed`, ein Ereignis, das im Panel nie feuert. Wer das ändert, macht den Nachlade-Weg kaputt.

⚠️ **Der Trend ist eine Momentaufnahme von jetzt, nicht vom Spielende.** Die befristeten Modifikatoren klingen über absolute Zeitstempel ab (§8), rechnen also gegen die aktuelle Uhr weiter. Der **Ruhewert** daneben ist der stabile Teil und für den Admin die aussagekräftigere Zahl; das Detail-Modal sagt das ausdrücklich dazu.

⚠️ **Die RLS-Policy `ugs_admin_select_all` ist nicht schul-gebunden** (Migration 0061: `using (is_admin())`). Das Panel filtert deshalb selbst auf die User der aktuellen Schule, in Häppchen zu 50 IDs — ohne den Filter zöge ein Schuladmin die Spielstände aller Schulen.

⚠️ **„Fortschritt zurücksetzen" räumt `user_game_saves` NICHT mit ab.** `PROGRESS_TABLES` in `api/_utils.js` kennt die Tabelle nicht; ein zurückgesetzter Account startet in der Lernwelt bei null, sein Konzern steht aber unverändert da — und der nächste Hub-Besuch leitet Kreatur und Münzen sofort wieder daraus ab.

---

## 11. MVP-Scope für v3

Was wir zuerst bauen (in `v3/`-Ordner, parallel zu `v2/`):

- [x] Grid-Layout 2×2, Start-Belegung: 1 Kükenfarm + 1 Werbeagentur + 1 Marketing-Center + 1 leerer Slot
- [x] Kükenfarm mit 5 Slots, initial 3 Küken (= 300 User, Kapazität 500)
- [x] Tiere kaufen (klick auf freien Slot in Farm)
- [x] Watchtime-Produktion (1 W/User/8s, Stack max 5×), Ernte durch Klick auf Farm, mit Konfetti — landet in globalem Lager
- [x] Werbeagentur mit buchbaren Werbedeals: 3 Werbearten, Intensität 1–50%, 5 Zyklen pro Deal (oder Dauerbetrieb), Trend-Malus je Agentur, Ring + Gold-Button auf dem Feld, Klick-Ernte
- [x] Marketing-Center mit 5 Kampagnen: 3 Reichweite (Stadtaktion / Empfehlungs-Welle / Hype-Burst, geben User) + 2 Anziehungskraft (Creator-Beteiligung mit Regler / Marken-Profile, geben Trend), ein Slot für beide
- [x] Trend-Feedback: Ernte-Schübe bei positivem Trend, Abwanderung bei negativem
- [x] Farm-Upgrade (ganze Farm eine Stufe hoch, wenn voll besetzt)
- [x] Neue Grid-Felder einzeln kaufbar (rechtwinklig angrenzend, 3.000 € + vierstufige Staffelung)
- [x] Neue Farm auf leerem Slot kaufbar (5.000 €, startet als Huhn — Stufenwahl kommt später)
- [x] Ressourcen-Bar mit allen 4 Ressourcen (User, Geld, Watchtime, Trend)

- [x] Techtree Phase 2: 29 Nodes (13 Hauptbaum, 6 Watchtime inkl. 2 Dark Patterns, 1 Vertrauens-Feature, 4 Werbung, 5 Marketing), sichtbar erst ab Phase 2
- [x] Netzwerkeffekt: dauerhafter Trend-Posten aus der Plattformgröße (`k × log10(User/10.000)`, Gipfel bei 1 Mrd, danach Sättigung auf 0 bei 3 Mrd), mit Leiter im Trend-Modal, Sprossen- und Sättigungs-Toast und eigener Erklär-Karte
- [x] Vertrauens-Features (White Patterns): 3 Nodes, die die Steigung des Netzwerkeffekts heben statt einen Sockel zu geben — das dauerhafte Gegenstück zu den Dark Patterns
- [x] Bürogebäude (15.000 €, ab Phase 2): je eines ein zusätzlicher paralleler Entwicklungs-Platz neben dem HQ
- [x] Erklär-Touren mit Spotlight: Intro (Grid · HQ · drei Zahlen · Shop · los geht's), Go-Live-Karte, Phase 2 (Trend · Watchtime · **Serverkosten** · neue Gebäude) und Phase 3 (Modelle · Metadaten · Kapazitäts-Tradeoff · KI-Labor); jede Phasen-Tour jederzeit über „?" neben dem Shop wiederholbar
- [x] Serverkosten ab Phase 2: fünf Tarifstufen auf die Gesamtkapazität, Zahlung je 25 Produktionszyklen per Klick auf die Farm, Drosselung auf 50 % / 20 %, Trend-Malus „Serverprobleme" (−2,0, nicht additiv mit vollem Server), Stufen-Knopf im Serverkapazitäts-Panel
- [x] Strom- & Wasserwerk ab Phase 3 (3 Nodes): bündelt den Versorgungs-Klick aller Farmen ab Stufe 5, −44 % Betriebskosten über beide Ausbau-Nodes
- [x] **Phase 4 ab 40 Mio Usern: Ereigniskarten** (§9.5) — alle 3 Minuten drei verdeckte Karten, eine davon wird gespielt; 29 Karten (11 Chancen, 18 Krisen), geseedete Folgekarten, liegende Krisen mit Frist und Zwangsvollstreckung, eigener Knopf neben dem Shop, Krisen-Leiste unter der Ressourcen-Bar

**Nicht im MVP:**
- Metadaten-Ressource
- KI-Labor
- Trend-Events (Shitstorm/Viral)
- Story/Investoren
- Programme auf Farmen
- ~~Save/Load~~ — **umgesetzt** (Migration 0061), siehe §10.5
- ~~Admin-Ansicht~~ — **umgesetzt**, siehe §10.7
- Kreatur/Coins/Highscore für game18 im Hub

---

## 12. Später-Liste (bewusst geparkt)

| Idee                     | Warum nicht jetzt                                              |
|--------------------------|----------------------------------------------------------------|
| ~~Strom/Wasser-Upkeep~~  | **Umgesetzt** (2026-08-07) — siehe §4 „Serverkosten"            |
| Metadaten als Ressource  | Deine eigene Formulierung "später". Ist ein ganzes Sub-System. |
| KI-Labor                 | Hängt an Metadaten. Braucht seinen eigenen Design-Pass.        |
| ~~Community-Center~~     | **Verworfen** (2026-08-09) — von seinen Werkzeugen kam nur die Umsatzbeteiligung ins Spiel; sie lebt als Creator-Beteiligung in §7.2 weiter. Herleitung in `phase3.md` §5. |
| Techtree-Nodes           | Zuerst muss der Kern-Loop Spaß machen. Techtree macht guten Loop besser, kann keinen retten. |
| Investoren / Story       | Seit v2 geparkt. Kommt zurück wenn der Loop trägt.             |
| Programme auf Farmen     | Du warst selbst unsicher was sie tun sollen — Konzept unklar.  |
| Trend-Events (Shitstorm) | Reizvoll, aber Balance-intensiv. Nach dem Feel-Test.           |
| **Pro-Abos** | Fertig ausgeplant, aber die Platzierung ist offen — siehe unten. |

### Pro-Abos — ausgeplant, geparkt

Ein Anteil der User wechselt auf ein werbefreies Bezahlmodell: sie **liefern keine Watchtime** und zahlen stattdessen direkt.

```
Regler q: 0–30 % der User          (mit „Exklusive Inhalte": bis 45 %)
Einnahme je Zyklus   = User × q × ABO_PAY × Zyklusdauer
Watchtime-Produktion × (1 − q)
```

`ABO_PAY` ≈ 0,060 €/User/s · 5 Zyklen à 60 s · **kein Geldpreis** — bezahlt wird ausschließlich in Watchtime.

⚠️ **`ABO_PAY` darf NICHT mit `watchtimeMult()` mitwachsen.** Das ist der ganze Punkt: der Werbeertrag je User steigt über Werbearten, Targeting und die Watchtime-Achse um rund das 25-fache, ein Abopreis nicht.

| | Werbeertrag je User | Pro-Abo | |
|---|---|---|---|
| Phase-3-Einstieg (Feed @50 %, `wtMult` 1,5) | 0,075 €/s | 0,060 €/s | 0,8× |
| nach Retargeting | 0,188 €/s | 0,060 €/s | 0,32× |
| Spätphase 3 (`wtMult` 3,0 + Targeting) | 0,375 €/s | 0,060 €/s | **0,16×** |

**Du hast ein solides Abo-Geschäft, und die Werbung wächst einfach daran vorbei.** Dieselbe Bauart wie Banner, Stadtaktion und Clustering — die flache Stufe ist der Einstieg, der sich selbst abschafft. Hier hängt aber eine *Aussage* daran: Werbung plus Profile plus Metadaten sind lukrativer als ein Bezahlmodell, und der Spieler liest das an seinen eigenen Zahlen ab, statt es gesagt zu bekommen.

**Kalibrierregel:** `ABO_PAY` liegt bei ~0,8× dessen, was ein User bei gut gespielter Werbung im Moment der Freischaltung bringt. Der Vorsprung am Anfang kommt nicht aus dem Kurs, sondern aus **null Klicks und null Trend-Kosten**. Wer `ABO_PAY` über den Werbeertrag hebt, macht das Abo zur Dauerlösung.

⚠️ **Ein verworfener Entwurf gab Abo-Usern Bindung** (keine Abwanderung bei negativem Trend, dafür kein Wachstum). Mechanisch reizvoll — eine Wette auf die eigene Trend-Lage —, aber es hätte das Werkzeug genau dann wertvoll gehalten, wenn es längst irrelevant sein soll, und die Aussage oben aufgehoben. Außerdem greift es in den Trend-Loop, das einzige geeichte System.

**Offen ist nur, wo es hingehört.** Es war als Werkzeug des Community Centers fertig entworfen — mit dem Gebäude hat es seinen Platz verloren. Bleibende Alternative: Phase 2, als frühe Einnahmequelle, die Phase 3 überholt. Das hat den längeren und stärkeren Bogen, braucht dort aber ein Gebäude, das es nicht gibt, und verschiebt die geeichte Phase-2-Ökonomie. Ein Regler in einem vorhandenen Gebäude wäre der dritte Weg — die Creator-Beteiligung zeigt, dass das trägt.

Zwei Nodes gehören dazu, beide erweitern den **Regler** statt seine Wirkung zu multiplizieren: **Verifizierte Accounts** (schaltet frei — ohne Identität kein Bezahlmodell) und **Exklusive Inhalte** (Höchstquote 30 % → 45 %; mehr exklusives Material heißt, dass *mehr Leute* abonnieren, nicht dass dieselben mehr zahlen).

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
