# Phase 3 — Das KI-Zeitalter

Grobplan. Ergänzt `CLAUDE.md`, ersetzt nichts. Zahlen sind **Anker mit Herleitung, nicht geeichte Werte** — was hier trägt, sind die Verhältnisse zwischen den Zahlen, nicht die Zahlen selbst.

Umgesetzt wird stückweise; die Reihenfolge steht in Sektion 9.

---

## 1. Das Zeitbudget — die härteste Randbedingung

Gemessener Stand: **770k User nach 20 Minuten**, Phase 3 startet bei **500k** (Marcus' Versprechen aus dem Phase-2-Text). Phase 3 beginnt damit um **Minute 17** — und das Spiel soll nicht ewig laufen.

**Budget: ~15 Minuten.** Zum Vergleich: in Phase 2 werden in ~12 Minuten 11 Nodes fertig.

Daraus folgt hart:

| | Phase 2 | Phase 3 |
|---|---|---|
| Neue Gebäude | 3 (Werbe, Marketing, Büro) | **1** (KI-Labor) — das Community Center ist verworfen, §5 |
| Neue Techtree-Nodes | 26 | ~8 angepeilt → **16 gebaut** |
| Neue Ressourcen | 2 (Watchtime, Trend) | **1** (Metadaten) |

⚠️ **Das Node-Budget wurde bewusst überschritten: 16 statt ~8.** Phase 3 dauert dadurch eher 25–30 Minuten. Der Grund, warum das trotzdem trägt: **die Hälfte der neuen Nodes steht in bestehenden Reitern** (Entwicklung 2, Marketing 1, Werbung 5) und braucht dort keinen neuen UI-Bau — sie docken an Phase-2-Nodes an, statt einen eigenen Baum aufzumachen. Der KI-Reiter selbst bleibt bei acht.

Was hier weiterhin gilt: **wer einen vollen neuen Baum baut, produziert Inhalt, den niemand erreicht.** Die Streichliste, falls der Test das bestätigt, steht in Sektion 9.

⚠️ **Das gilt auch fürs Balancing.** Phase 3 hat kein Frühspiel-Fenster, in dem sich etwas einpendelt. Jede Mechanik muss beim ersten Kontakt lesbar sein.

---

## 2. Die These — Phase 3 ist die Phase, in der die Wand fällt

Phase 2 endet an einer strukturellen Wand, die in `CLAUDE.md` §9 schon diagnostiziert ist: **Geld und Wachstum zahlen aus derselben Kasse.** Jeder laufende Werbedeal drückt den Trend; die Watchtime wächst linear mit den Usern, das Trend-Budget ist bei +20 gedeckelt.

Video @25 %, das beste, was Phase 2 anbietet:

| bei … User | Watchtime | volle Verwertung | Trend-Kosten | Agenturen nötig |
|---|---|---|---|---|
| 500k | 62.500 wt/s | 3,9 Deals | −2,4 | 4 |
| 1 Mio | 125.000 wt/s | 7,8 Deals | −4,9 | 8 |
| 2 Mio | 250.000 wt/s | 15,6 Deals | −9,8 | 16 |

Die **Trend**-Wand liegt bei ~2 Mio Usern. Die **Klick**-Wand liegt viel früher: 16 Agenturen à 15.000 € plus Land, jede alle 125 s neu zu buchen — praktisch ist bei 5–6 Agenturen Schluss, also bei **~700k Usern**. Genau dort, wo Phase 3 anfängt.

**Phase 3 gibt dem Spieler drei Werkzeuge gegen dieselbe Wand:**

| Werkzeug | Greift an | Bezahlt in | Gehört zu |
|---|---|---|---|
| **Volumen-Regler** | Klick-Wand | Metadaten | Werbeagentur / KI |
| **Targeting** | Trend-Wand (weniger Deals für dasselbe Geld) | Metadaten | Werbeagentur / KI |
| **`adTrendMult()` senken** | Trend-Wand direkt | Geld (laufend) | **noch ohne Node**, §5 |

⚠️ **Drei Werkzeuge für eine Wand ist die zentrale Balance-Gefahr von Phase 3.** Sie dürfen sich nicht addieren, ohne gegeneinander zu kosten. Der Schutz ist die Währung: die ersten beiden kosten **Metadaten**, das dritte **Geld** — und Metadaten entstehen aus Watchtime, die sonst zu Geld geworden wäre. Jeder Weg frisst also die Ressource des anderen.

**Die Prüffrage beim Balancen ist nie „wie viel € bringt X", sondern immer: bei welchem Trend-Budget sind wie viele Deals parallel möglich?**

---

## 3. User-Modelle & Metadaten

Das Ding, das aus Watchtime entsteht, heißt **User-Modell**. Nicht „KI-Modell": das KI-Labor trägt die KI schon im Namen, die Ressource kann also die neue Information liefern — nämlich *wovon* es ein Modell ist. Sprites liegen für alle sieben Stufen als `sprites/User/Profil*.png`.

**Eine** neue Zahl in der Ressourcen-Bar: 🗃️ **Metadaten**. Modelle bekommen zwar eine eigene Kachel, sind aber eine **Stückzahl**, keine Ressource — sie wohnen in den Serverfarmen wie die Tiere.

**Das KI-Labor ist reiner Konverter.** Es hält nichts; ein trainiertes Modell zieht sofort in eine Farm.

```
   ┌──────────────┐                      ┌──────────────┐
   │   FARMEN     │───── Tiere ─────────►│  WATCHTIME-  │
   │  (8 Slots)   │                      │    LAGER     │
   └──────▲───────┘                      └──────┬───────┘
          │                                     │
          │  Modell zieht ein                   │ KI-LABOR
          │  (belegt 1 Slot)                    │ trainiert
          └─────────────────────────────────────┘
          │
          │ Modelle in der Farm produzieren
          ▼
   ┌──────────────┐
   │  METADATEN   │
   └──────┬───────┘
          │
   ┌──────┼───────────────┬──────────────┐
   ▼      ▼               ▼              ▼
Volumen  Targeting     KI-Nodes    Datenverkauf
(Durch-  (mehr €/wt)   (einmalig)  (€ + dauerhafter
 satz)                              Trend-Schaden)
```

### Ein Modell ist Kapazität, kein Bewohner

**1 Modell = 1 Server-Kapazität, genau wie 1 User.** Modelle haben keine Tierart und keine Stufe; sie sind eine globale Zahl (`state.models`), die wie die User über die Farmen verteilt wird.

⚠️ **Das ist keine Vereinfachung, sondern eine mechanische Notwendigkeit.** Ein Zwischenentwurf ließ ein Modell einen ganzen Tier-Slot belegen und damit die Stufe seiner Farm erben. Beim Farm-Ausbau wäre aus einem Huhn-Modell stillschweigend ein Gans-Modell geworden — eine Kapazitäts- und Ertragsänderung, die niemand ausgelöst hat. Als reine Kapazitätszahl übersteht ein Modell jedes Upgrade unverändert.

**Sichtbar sind sie trotzdem:** eine Farm, in der Modelle liegen, zeigt das Modell-Sprite ihrer Stufe. Die Slot-Rechnung ist dieselbe wie bei den Code-Kisten — aufgerundet, aber mindestens einer, sobald überhaupt etwas da ist.

### Reihenfolge: Code · User · Modelle

**Modelle stehen überall hinten.** In der Kapazitätsverteilung (`farmFills`), auf der Weide (Sprite-Reihenfolge) und im Belegungs-Balken — dreimal dieselbe Ordnung, damit die drei Ansichten nicht auseinanderlaufen.

Praktisch heißt das: die Farmen füllen sich von vorn mit Usern, die Modelle nehmen sich den Rest und sammeln sich in den hinteren Farmen. Wird die Kapazität knapp, verlieren zuerst die Modelle ihren Platz — nicht die User.

⚠️ Beim Aufrunden kann es passieren, dass Kisten und Tiere alle 8 Slots belegen, obwohl Modelle da sind. Dann bekommt ein Modell einen Slot vom Tier-Kontingent, sonst verschwände es aus dem Bild, obwohl es Kapazität belegt.

### Eine flache Art, eine mitwachsende — und der Deckel ist die Kapazität

Jede Umwandlungsart liefert ihre Modelle je Zyklus über **genau eins von beiden**: eine feste Stückzahl (`models`) oder einen Anteil der aktuellen User (`coverage`).

```
Modelle je Zyklus   = (models | User × coverage) × modelYieldMult
Watchtime je Zyklus = Modelle × wtPerModel
```

| Art | Freischaltung | Modelle/Zyklus | wt je Modell | Dauer | @500k: wt/s | Buchung (5 Zyklen) |
|-----|---------------|----------------|--------------|-------|-------------|--------------------|
| 🧩 **Clustering** | von Anfang an | **3.000 fix** | 20 | 20 s | 3.000 (4,8 %) | 15.000 Modelle · 100 s |
| 🎚️ **Fine Tuning** | `ki_netz` | **2 % der User** | 10 | 25 s | 4.000 (**6,4 %**) | 50.000 Modelle · 125 s |

⚠️ **Die ID bleibt `ki_netz` / `netz`, obwohl beides „Fine Tuning" heißt** — siehe Sektion 6. Der Anzeigename steht an zwei Stellen, die ID an keiner sichtbaren.

Das ist dasselbe Paar wie Banner gegen Feed/Search/Video (`CLAUDE.md` §6) und wie die Reichweiten- gegen die PR-Kampagnen (§7.1/§7.2): **die flache Art ist der Einstieg, der sich selbst abschafft, die prozentuale trägt dauerhaft.** Clustering liefert bei 500.000 Usern ein Drittel des Fine Tunings und bei 1 Mio ein Sechstel. Gleichstand läge bei 150.000 Usern — unterhalb des Phase-3-Einstiegs, die zweite Art ist also überall ein Upgrade, ohne ein Fenster, in dem die Reihenfolge kippt.

**Fine Tuning kostet konstant 6,4 % der Plattform-Watchtime** — bei 500.000 wie bei 5 Mio Usern (0,02 × 10 wt ÷ 25 s gegen 0,125 wt/s je User). Es wird dadurch nie zum Rundungsfehler und nie zum Selbstläufer. Der Dauerzustand von Phase 3 ist: **ein knappes Zehntel deiner Watchtime läuft ins Labor statt in die Werbung.**

⚠️ **Die Obergrenze für `models` ist hart: deutlich unter dem, was `coverage` beim Einstieg liefert** (0,02 × 500.000 = 10.000). Darüber wäre Fine Tuning beim ersten Kontakt kein Upgrade, sondern ein Rückschritt. Nach unten begrenzt es die Sichtbarkeit — eine Buchung soll eine Zahl liefern, die man in der Bar wiederfindet.

⚠️ **Ein Zwischenentwurf hatte BEIDE Arten prozentual (10 % / 20 %) und dazu den Deckel „nicht mehr Modelle als User".** Eine einzige Buchung der prozentualen Art deckte damit die ganze Plattform ab: die Mechanik war ein Fortschrittsbalken mit Ende, kein Farm-Loop, und das Gebäude nach ein bis zwei Buchungen arbeitslos. Wer hier wieder zwei Prozentsätze einträgt, baut das nach.

**Der Deckel ist die freie Serverkapazität, nicht die User-Zahl** (`modelRoom()` = freier Platz − was fertig im Labor liegt). Der alte User-Deckel trug weder fachlich — ein zweites Modell desselben Users ist ein feineres, keine Dublette — noch mechanisch: er schlug **vor** dem Kapazitäts-Deckel zu und nahm damit genau die Entscheidung weg, um die es in Phase 3 geht.

**Geprüft wird schon beim Buchen**, nicht erst beim Einsammeln. Sonst zahlt der Spieler Watchtime für Modelle, die hinterher nirgends landen können — der Ausbau-Druck muss vorher ankommen, nicht als Quittung. Ein Zyklus, der nur noch die Restlücke füllen kann, liefert weniger und kostet entsprechend weniger.

⚠️ **`wtPerModel` ist die Leitgröße zwischen den Arten: eine bessere Art muss diesen Wert SENKEN.** Wer nur die Stückzahl erhöht und die Kosten mitzieht, hat nichts verbessert. Im Spiel wird der Kurs **nicht angezeigt** — im Modal stehen Stückzahl und Kosten; die abgeleitete Zahl blähte die Karte auf, ohne eine Entscheidung zu tragen. `RT.state.convWtPerModel()` bleibt als Balance-Prüfung.

**Oben im Labor-Modal steht der Kapazitäts-Balken** — derselbe wie im Farm-Modal (User · Code · Modelle · frei), nur über alle Farmen summiert. Er zeigt die Grenze, die jetzt wirklich gilt, und der freie Rest ist genau das, was eine Buchung noch unterbringen kann. Die Abdeckung steht als Prozentzeile darunter, **ohne Deckel bei 100 %**.

⚠️ Dort stand vorher ein Abdeckungs-Balken. Er hatte seine Berechtigung, solange die User-Zahl der Deckel war; seit der Deckel die Kapazität ist, zeigte er die falsche Grenze — und mit der flachen Clustering-Stufe bewegte er sich je Zyklus um Bruchteile eines Prozents, stand also praktisch still.

| Weitere Größe | Wert |
|---|---|
| Zyklen je Buchung | 5 |
| Metadaten je Modell und Zyklus | **0,5** |
| Metadaten-Zyklus | **8 s — derselbe wie die Watchtime** |

### Kapazität ist der Regler

Weil ein Modell 1 Kapazität belegt, braucht 100 % Abdeckung **doppelt so viel Serverkapazität** wie die User allein. Damit kommt der in `CLAUDE.md` §9 geparkte Gedanke („Metadaten verdoppeln den Serverbedarf pro User") von selbst zurück — nicht als Regel, sondern als Folge der Mechanik.

**Das ist die eigentliche Phase-3-Entscheidung:** Kapazität, die Modelle trägt, trägt keine User. User machen Watchtime, Modelle machen Metadaten. Wie weit man die Plattform in Daten umwandelt, ist der Regler.

**Volle Abdeckung ist im Zeitbudget nicht erreichbar, und das ist Absicht.** Bei 500.000 Usern bräuchte Fine Tuning zehn Buchungen (~21 Minuten) für 1× — und die Kapazität dafür (1 Mio) hat man zu dem Zeitpunkt lange nicht. Es gibt kein Ende, nur Tempo.

Passen fertige Modelle nicht mehr hinein, warten sie im Labor, statt still zu verschwinden.

⚠️ **„Kein Platz" hat zwei Gründe und braucht zwei Texte:** entweder sind die Server wirklich voll, oder es liegen fertige Modelle im Labor, die den freien Platz rechnerisch schon belegen. Im zweiten Fall muss man nur einsammeln — „bau mehr Farmen" wäre dort schlicht falsch.

⚠️ **Modelle und User essen aus demselben Topf.** Wer die Kapazität mit Modellen füllt, stoppt sein User-Wachstum. Genau die gewollte Entscheidung — aber sie muss beim abgelehnten Buchen und bei der gedeckelten Trend-Ernte im Klartext dastehen, sonst wirkt der Stillstand wie ein Fehler.

### Farben

| | Ink | Hintergrund | Warum |
|---|---|---|---|
| User-Modelle | `#f97316` | `#ffe0c2` | muss im Belegungs-Balken neben User-Blau und Code-Violett bestehen — ein weiterer kühler Ton wäre dort nicht zu trennen |
| Metadaten | `#0891b2` | `#c3eef5` | taucht im Balken nie auf, muss nur neben dem Watchtime-Gelb der Bar bestehen |

Bar-Reihenfolge: `💰 Geld · 👥 User · ⏳ Watchtime · 🧠 Modelle · 🗃️ Metadaten · ⭐ Trend · 🖥️ Server`. Die Produktionskette in der Mitte läuft schmal (`.rt-resource--slim`), Geld/User/Trend/Server voll.

**Der Server-Balken in der Kopfzeile zeigt dieselben drei Flächen wie der Belegungs-Balken im Farm-Modal**, in derselben Reihenfolge und denselben Farben: User (blau) · Code (violett) · Modelle (orange).

⚠️ Er lief vorher auf `--rt-sky` und `--rt-yellow` — zwei Tönen, die im Rest des Spiels für nichts stehen. Derselbe Sachverhalt hatte dadurch zwei Farbsprachen: oben gelb/blau, im Modal blau/violett. Wer hier etwas ergänzt, nimmt die `--res-*-ink`-Tokens, nicht die `--rt-*`-Palette.

**Der Produktions-Ring auf der Farm ist doppelt:** außen Watchtime (gelb), innen Metadaten (türkis). **Ein Klick erntet beides.**

⚠️ **Der innere Ring trägt keine eigene Information mehr.** Seit Metadaten auf demselben 8-s-Takt laufen wie die Watchtime, zeigt er zwangsläufig denselben Stand; er ist ein *Vorhandensein*-Signal („hier liegen Modelle"), kein zweiter Fortschritt. Wer ihm wieder Information geben will, muss den Metadaten-Zyklus vom Watchtime-Zyklus lösen — dann braucht die Farm aber auch wieder zwei Stapel-Zähler.

⚠️ **Der Kreis ist geschlossen — und genau deshalb braucht Metadaten mehr als einen Sink.** Watchtime → Profile → Metadaten → KI-Nodes → mehr Watchtime ist eine positive Rückkopplung. Wären Nodes der einzige Abfluss, wäre Metadaten in dem Moment wertlos, in dem der Reiter durch ist — derselbe Konstruktionsfehler, den `CLAUDE.md` §9 der Watchtime-Achse schon attestiert. **Targeting und Volumen sind die wiederholbaren Sinks, die das verhindern.** Sie sind nicht optional.

**Gebaut sind drei Abflüsse** — zwei wiederholbare und einer einmaliger:

| Sink | Art | Wo | Preis |
|---|---|---|---|
| **Targeting** | wiederholbar, je Zyklus | Werbeagentur | 0,5 Metadaten je Watchtime |
| **Zielgruppen-Offensive** | wiederholbar, je Buchung | Marketing-Center | 300.000 |
| **Nodes** | einmalig, 13 Stück | alle vier Reiter | 100.000 … 1.200.000 |

Der Datenverkauf (Sektion 8) fehlt noch. Dass die Nodes **mit** den beiden laufenden Sinks um dasselbe Lager konkurrieren, ist der Punkt: „Node oder drei Feed-Deals personalisiert" ist die Entscheidung, die Metadaten am Leben hält.

---

## 4. KI-Labor — gebaut

Sprite: `sprites/buildings/KILabor.png`. 1×1, **25.000 €**, **ab Phase 3 ohne Freischaltung im Shop.**

⚠️ **Das Gebäude ist der EINSTIEG in Phase 3, nicht ihre Belohnung.** Die Nodes im KI-Reiter setzen das Labor voraus (`requiresBuilding: 'kilabor'`), nicht umgekehrt: erst baut man das Labor, dann forscht man darin. Ein Zwischenentwurf hatte es andersherum — dann sperrt eine Node das Gebäude, in dem sie entwickelt werden müsste.

**Es funktioniert wie die Werbeagentur**, und das ist Absicht: beide sind Konverter und sollen sich gleich anfühlen. Der Unterschied ist nur, was hinten herauskommt.

| | Werbeagentur | KI-Labor |
|---|---|---|
| rein | Watchtime | Watchtime |
| raus | Geld | User-Modelle |
| Buchung | Werbeart + Intensität | Umwandlungsart |
| Zyklen | 5 | 5 |
| einsammeln | Gold-Knopf | 🧠-Knopf |

**Auf dem Feld** trägt das Labor denselben Ring wie die Werbeagentur, nur in Modell-Orange, mit dem Zyklus-Zähler `1/5` in der Mitte; darunter der Einsammel-Knopf `🧠 +5.000`, der nur erscheint, wenn etwas bereitliegt.

Jeder Zyklus wird **vorab** mit Watchtime bezahlt. Reicht sie nicht, bricht die Umwandlung ab und die bereits fertigen Modelle bleiben liegen — dieselbe Regel wie beim Werbedeal.

**Gegen die freie Serverkapazität wird zweimal gedeckelt: beim Buchen und beim Einsammeln.** Beim Buchen, damit niemand Watchtime für Modelle zahlt, die nirgends landen; beim Einsammeln, weil die User in der Zwischenzeit weitergewachsen sind und sich denselben Platz genommen haben können. Passen nicht alle Modelle hinein, warten die übrigen im Labor, statt still zu verschwinden.

Die Entscheidung, die dabei entsteht: *dieselbe* Watchtime wird zu Geld **oder** zu Daten. Beide Gebäude ziehen aus demselben Lager.

**Offen:** ob mehrere Labore sinnvoll sind (jedes hätte eine eigene laufende Umwandlung — parallel wandeln wäre also möglich, ist aber noch nicht balanciert).

---

## 5. Community Center — verworfen (2026-08-09)

**Das Gebäude gibt es nicht mehr.** Es war als dritter Konverter neben Werbeagentur und KI-Labor entworfen (25.000 €, ab Phase 3, **Geld** rein → Watchtime und Trend raus) und mit genau **einem** Werkzeug gebaut: der Umsatzbeteiligung. Alles andere, was hier stand, ist nie ins Spiel gekommen — die Community-Pflege wartet weiter auf die Ereignisse (§8), die Pro-Abos sind geparkt (`CLAUDE.md` §12), und die Moderation, die `ki_agents` freischalten sollte, wurde nie gebaut. Übrig blieb ein eigenes Gebäude mit eigenem Modal, eigener Ökonomie und einem zweiten Watchtime-Pfad, für einen einzigen Regler.

**Die Umsatzbeteiligung lebt weiter — als Creator-Beteiligung in der Anziehungskraft-Spalte des Marketing-Centers** (`CLAUDE.md` §7.2). Dort teilt sie sich einen Kampagnenplatz mit den anderen Trend-Käufen, statt eigene Regeln zu haben. Was mitgewandert ist und was nicht:

| | im CC | jetzt als Kampagne |
|---|---|---|
| Regler | Beteiligung 0–30 % | **Trend +1,0 … +3,0** |
| Preis | € je User × Zyklen | **absolut, 28.000–70.000 €** |
| Watchtime-Wirkung | ×1,00 … ×1,30 | **entfällt** |
| Trend-Wirkung | +0 … ~+2,1 (sättigend) | **+1,0 … +3,0 linear** |
| Laufzeit | 5 × 30 s | 60 s (wie jede Anziehungskraft-Kampagne) |
| Begrenzung | ein Werkzeug plattformweit | Kampagnenplatz |
| Marktplatz-Provision | Node am CC | **Node im Marketing-Reiter**, unverändert in der Wirkung |

Ersatzlos gestrichen sind außerdem `ki_agents` (schaltete ausschließlich die nie gebaute CC-Moderation frei) und der Gebäudetyp `community` samt seiner Konstanten. `storage.migrate()` räumt bestehende Gebäude, den Modifikator `cc:creator` und den Node-Eintrag weg.

---

### Was aus dem Entwurf gültig bleibt

Vier Erkenntnisse sind unabhängig vom Gebäude und werden beim nächsten Anlauf wieder gebraucht:

**1. Die Wirkung muss am Betrag hängen, nicht an der Reglerstellung.** Die naheliegende Variante („Regler auf 30 % → +5,0 Trend") ist kaputt, sobald die Kosten irgendwo prozentual hängen: dann gibt es eine Stellung, in der man die Wirkung bekommt, ohne sie zu bezahlen. Die Creator-Beteiligung erfüllt das trivial — Preis und Trend kommen beide direkt aus dem Reglerwert.

**2. Ein Regler, dessen Kurs nach oben besser wird, trifft eine Aussage; ein linearer nicht.** Im CC lief das über zwei verschieden sättigende Kurven (Watchtime früh, Trend spät), in der Kampagne über eine Grundgebühr. Beide Male ist das Ergebnis dasselbe: das obere Reglerende ist die *richtige* Wahl, wenn man sie sich leisten kann.

**3. Die Marktplatz-Provision am Trend ist der einzige Ort im Spiel, an dem Trend unmittelbar Geld wert ist.** Sie ist mit dem Node in den Marketing-Reiter gewandert und rechnet unverändert: `MARKETPLACE_CUT` = 0,20, linear mit dem Trend bis `MARKETPLACE_TREND_FULL` = 10, Wirkung ausschließlich auf die Kosten. Harte Obergrenze bleibt 25 %.

**4. Eine Trend-Quelle lässt sich nicht über den Preis balancieren.** Das Einkommen wächst mit der Plattform unbegrenzt, der Trend ist bei `TREND_MAX` gedeckelt — die Bremse muss eine **Anzahl** sein. Im CC war das die Zahl der Gebäude, jetzt ist es die Zahl der Kampagnenplätze (`PR_SLOT_NODES`). Das ist derselbe Mechanismus, nur ohne ein zweites System daneben.

---

### Werkzeug 2 — Community-Pflege (entworfen, weiter zurückgestellt)

Ein Support- und Moderationsapparat. **Er dämpft nicht den Trend, sondern die Abwanderung.**

```
Regler s: 0–100 %
Kosten je Zyklus = SUPPORT_PAY × User × watchtimeMult() × s × Zyklusdauer
Abwanderung je Zyklus × (1 − 0,5 × s)
adTrendMult()          = 1 − 0,3 × s        ← der alte Haken, als Nebeneffekt
```

`SUPPORT_PAY` = 0,010 €/User/s bei vollem Regler.

**Warum es die Abwanderung dämpft und nicht den Trend.** Der Trend **bleibt stehen**, sichtbar, mit jedem Dark Pattern als eigener Zeile im Info-Modal. Nur die Folgen werden abgefedert, gegen laufende Zahlung, für immer. An dieser Unterscheidung hängt die Pädagogik: Anziehungskraft *überlagert* den Schaden mit positivem Trend, die Pflege *federt ihn ab* — keine der beiden **löscht** ihn. `CLAUDE.md` §8 („`trendBase` ist die einzige Stelle mit unumkehrbarer Wirkung") bleibt damit wörtlich wahr, was bei einem Werkzeug, das direkt auf `trendBase` rechnet, nicht mehr der Fall wäre. Nebenbei stimmt das Bild: ein Support-Apparat ist ein **permanenter Kostenblock**, den man sich mit schlechten Produktentscheidungen einhandelt.

⚠️ **`adTrendMult()` allein trägt kein Werkzeug.** Der Haken stammt aus der Zeit, als volle Verwertung 17 parallele Feed-Deals brauchte (−6,6 Trend). Seit den Anteils-Stufen verwertet **ein** Dauer-Deal die gesamte Produktion, und höhere Volumen-Stufen bringen im Gleichgewicht kein zusätzliches Geld — der rationale Spieler fährt also *einen* Deal.

| | Malus | davon −30 % |
|---|---|---|
| 1× Feed @25 % | −0,375 | 0,11 |
| 1× Feed @50 % | −1,5 | 0,45 |
| 4× Video @25 % | −2,5 | 0,75 |

Etwas, das 0,45 Trend spart, ist kein eigenes System wert. Der Haken darf bleiben, aber er kann nicht die Aussage tragen — deshalb die Abwanderung.

⚠️ **Kein Verlangsamen des Bonus-Abbaus.** Die zweite naheliegende Bauart („die Pflege hält positive Boni länger") ist verworfen: die Wirkung der Techtree-Boni sitzt fast vollständig im Abkling-Schwanz — bei Videos 14.400 von 15.120 Trend-Sekunden. Eine Halbierung der Rate verdoppelt praktisch den gesamten positiven Trend des Techtrees, rückwirkend auf alle Nodes. Das ist kein Werkzeug, das ist ein Balance-Reset.

⚠️ **Warum es auf die Ereignisse wartet.** Ohne Shitstorms hilft es nur dem Spieler, der sich mit Dark Patterns selbst beschädigt hat — wer sauber gespielt hat, hat keine Abwanderung und damit nichts zu dämpfen. Mit Ereignissen bekommt jeder Spieler einen Grund dafür, und es wird zur Versicherungsfrage: **dauerhaft laufen lassen und auf Wachstum verzichten, oder auf Sicht fahren und gelegentlich einen Sturm voll abbekommen.**

⚠️ **Es braucht dafür kein eigenes Gebäude.** Das war die Lehre aus dem CC. Ein Regler im Marketing-Center, ein Kampagnenplatz oder eine Node auf `adTrendMult()` sind drei Wege, die alle ohne ein neues System auskommen — welcher es wird, entscheidet sich mit den Ereignissen.

---

### Warum das nicht „böse vs. gut" ist

Die Aussage des Entwurfs bleibt, sie hängt nur nicht mehr an zwei Gebäuden: **KI-Labor kauft Watchtime mit Daten. Die Creator-Beteiligung kauft Trend mit Geld.** Die Entscheidung ist nicht moralisch, sondern eine Frage, welche Währung gerade knapp ist — genau das macht sie pädagogisch stärker als ein Moralregler: der Spieler wählt aus Eigeninteresse und stellt hinterher fest, was er gewählt hat.

⚠️ **Falls sich im Test herausstellt, dass einer der beiden Wege dominiert, ist der Knopf der Wechselkurs (`wtPerModel` bzw. `costBase`/`costPerTrend`) — nicht die Wirkung.** Sonst verschiebt sich die Aussage und nicht nur die Stärke.


---

## 6. Techtree — zwei Reiter, ~8 neue Nodes

**Es wird keine bestehende Node verschoben.** Umfragen, Events und Live-Streaming gehören thematisch zu den Community-Themen — aber sie aus Phase 2 herauszunehmen zieht dort Trend-Nachschub ab, den der geeichte Balance-Stand einkalkuliert. Stattdessen: **Geist-Karten** (`@nodeId`, `CLAUDE.md` §9). Sie stehen als gestrichelte Karten am linken Rand des Ziel-Reiters, spiegeln den Status des Originals und speisen die neuen Nodes. Genauso hängt der **Marktplatz** im Marketing-Reiter an `@liveStreaming`; mechanisch wackelt in Phase 2 kein einziger Wert.

### Metadaten kosten — die Kostenregel

**Je tiefer im Baum, desto mehr wird in Metadaten und desto weniger in Euro bezahlt.** Am deutlichsten bei den Dark Patterns: sie sind die billigsten in Euro und die teuersten in Metadaten — man *kauft* sie nicht, man *fördert* sie.

Damit konkurrieren die Nodes direkt mit dem Targeting um dasselbe Lager („Node oder drei Feed-Deals personalisiert"). Genau diese Konkurrenz ist der Grund, warum Nodes überhaupt Metadaten kosten dürfen: als *einziger* Abfluss wären sie einer mit Ende (Sektion 3).

Maßstab für alle Zahlen unten — bei 500 k Usern und 10 % Abdeckung fließen **~3.125 Metadaten/s**:

| Metadaten | ≈ Produktionszeit |
|---|---|
| 150.000 | 48 s |
| 400.000 | 2 min |
| 1.200.000 | 6 min |

Technisch ist das ein Feld `metadata` auf der Node-Definition; `startTechNode()` prüft und bucht es ab, mit **eigener Absage** — „zu teuer" würde auf das Konto zeigen, wo nichts fehlt.

### KI-Reiter — eigener Reiter, ab Phase 3

Vierter Reiter neben Entwicklung / Marketing / Werbung (`minPhase: 3` in `TABS`). Hier steht alles, was mit Metadaten und User-Modellen zu tun hat. **Alle Nodes setzen das KI-Labor voraus.**

```
ki_speicher ─┬─► Trainings-Optimierung ─┬─► Fine Tuning
             │                          └─► Profilbildung 🔴
             └─► Empfehlungs-Algorithmus ─► Collaborative Filtering 🔴 ─► Aufmerksamkeits-Sog 🔴
```

| Node | Hängt an | € | 🗃️ | Dauer | Server | Wirkung |
|------|----------|---|-----|-------|--------|---------|
| **Metadaten-Speicherung** | — | 25.000 | — | 80 s | 4.000 | Metadaten **+50 %** |
| **Trainings-Optimierung** | Speicherung | 40.000 | 100.000 | 100 s | 5.000 | Modelle je Zyklus **+50 %** |
| **Fine Tuning** | Training | 35.000 | 250.000 | 120 s | 7.000 | schaltet die 2. Trainingsart frei |
| **Profilbildung** 🔴 | Training | 30.000 | 350.000 | 140 s | 9.000 | Metadaten +60 %, **Trend dauerhaft −1,5** |
| **Empfehlungs-Algorithmus** | Speicherung | 50.000 | 150.000 | 120 s | 6.000 | Watchtime +10 %, Trend +1,0 |
| **Collaborative Filtering** 🔴 | Empfehlung | 40.000 | 500.000 | 120 s | 8.000 | Watchtime +10 %, **Trend dauerhaft −1,0** |
| **Aufmerksamkeits-Sog** 🔴 | Collab. Filtering | 35.000 | 1.200.000 | 160 s | 10.000 | Watchtime +20 %, **Trend dauerhaft −2,0** |

**Die Aufmerksamkeitsseite ist eine Kette von drei flachen Stufen** (+10 % → +10 % → +20 %, zusammen ×1,452) statt zweier großer. Der Gewinn ist die Position des Dark Patterns: es sitzt jetzt in der **Mitte** statt am Ende. Die Entscheidung steht dadurch früher an, kostet weniger auf einmal, und der harmlose Empfehlungs-Algorithmus bleibt eine Node, die man ohne schlechtes Gewissen nimmt.

⚠️ **„Fine Tuning" heißt intern weiter `ki_netz`** — genau wie die Umwandlungsart `netz` in `state.js`. Eine ID-Umbenennung bräuchte eine Migration für laufende Umwandlungen und fertige Nodes; für einen Anzeigenamen ist das der falsche Preis. Der Name steht an **zwei** Stellen (Node und `CONV_TYPES`), die ID an keiner sichtbaren.

⚠️ **Hier stand `ki_agents`** (60.000 € + 400.000 🗃️, hinter Fine Tuning) — ein reiner Freischalter für die Moderation im Community Center. Mit dem Gebäude ist die Node ersatzlos gestrichen (§5): sie war ein Blatt und schaltete nichts frei, was es gibt. Der Gedanke dahinter bleibt richtig und wartet auf einen neuen Ort — der Dreck, den der Datenweg macht (Bots, Sektion 8), soll mit dem Werkzeug weggeräumt werden, das auf dem Datenweg entsteht.

**Zwei Arten, die Umwandlung zu verbessern, und sie sind nicht dasselbe:** `modelYieldMult` (Trainings-Optimierung) dreht an allen Arten gleichzeitig, `unlockedBy` (Fine Tuning) stellt eine neue daneben. Der Multiplikator wirkt auch auf die neue Art — die beiden stapeln sich.

**Die drei Achsen sind die Hebel der Kette**, und sie greifen an verschiedenen Stellen an:

- `modelYieldMult` — mehr Modelle aus derselben Watchtime *(Watchtime → Modell)*
- `metadataMult` — mehr Metadaten aus denselben Modellen *(Modell → Metadaten)*
- `watchtimeMult` — mehr Nachschub für beides *(die bestehende Achse aus Phase 2)*

Alle sind gebaut wie `watchtimeMult()`: multiplikativ, datengetrieben aus den Node-Feldern, mit eigenem Chip auf der Karte.

**Der linke Zweig ist die Datenseite, der rechte die Aufmerksamkeitsseite** — am Ende steht in beiden dieselbe Frage in einer anderen Währung. Dass alle Dark Patterns auf `trendBase` gehen, ist die Regel aus `CLAUDE.md` §8: unumkehrbarer Trend-Schaden ist Dark Patterns vorbehalten.

### ⚠️ Die Profilbildung ist ein Nadelöhr — mit Absicht

**Retargeting und Marktanalyse hängen beide an ihr.** Ohne Dark Pattern gibt es also weder personalisierte Werbung noch die Zielgruppen-Offensive — und damit keine Phase-3-Ökonomie. Die Profilbildung ist keine Wahl, sondern eine Mautstelle.

Das ist eine bewusste Entscheidung gegen die Alternative (Marktanalyse auf `ki_speicher`, damit ein Weg an der Profilbildung vorbeiführt). Die Aussage lautet: **die Werbeökonomie läuft auf Profilbildung, Punkt.** Inhaltlich ehrlich, und der Spieler muss die Entscheidung treffen statt sie zu umgehen.

**Was daraus folgt:** ihre −1,5 sind eine Steuer, die jeder zahlt, kein optionaler Preis. Wer die Balance prüft, darf sie deshalb **nicht** als Wahlposten rechnen.

⚠️ **Freundschaftsvorschläge hängt ausdrücklich NICHT an der Profilbildung, sondern an `ki_speicher`.** Sie ist die einzige Node im ganzen Phase-3-Entwurf, in der Daten etwas tun, das die User *mögen*. Hinter einem Dark Pattern wäre das Gegenbeispiel keins mehr, und Phase 3 hieße „Daten sind Werbung und Dark Patterns".

### ⚠️ Die dauerhafte Trend-Schuld summiert sich auf −7,0

| Dark Pattern | Phase | dauerhaft | vor 2026-08-06 |
|---|---|---|---|
| Infiniter Scroll | 2 | −1,0 | −1,5 |
| Autoplay | 2 | −1,5 | −2,0 |
| Profilbildung | 3 | −1,5 | −1,5 |
| Collaborative Filtering | 3 | −1,0 | −1,0 |
| Aufmerksamkeits-Sog | 3 | −2,0 | −2,0 |
| | | **−7,0** | **−8,0** |

Wer alles nimmt, verliert **7,0 % seiner User alle 12 Sekunden** — solange nichts dagegensteht. Dagegen steht der **Netzwerkeffekt** (CLAUDE.md §8): bei 1 Mio Usern +4,0, bei 100 Mio +8,0. Ab etwa 10 Mio Usern trägt er die Schuld allein.

⚠️ **Die Schuld stand zwischenzeitlich auf −4,1 und ist wieder oben.** Halbiert wurde sie, weil die alten −8,0 ohne Gegengewicht nicht bezahlbar, sondern tödlich waren: bei 1 Mio Usern mit den drei Phase-2-Plätzen (+9,0) blieb netto **+1,0**, und ein einziger Video-Deal drückte das auf +0,375 — rund 50 Minuten für eine Verdopplung. Seit es den **Netzwerkeffekt** gibt (CLAUDE.md §8), zahlt der genau diesen Betrag: bei 1 Mio Usern +4,0. Deshalb stehen die Werte wieder nahe am Original.

⚠️ **Nur die zwei Phase-2-Muster bleiben auf zwei Dritteln** (−1,0 / −1,5). Sie schlagen bei ~100k–300k Usern zu, wo der Netzwerkeffekt erst bei +2,0 bis +2,5 steht und man oft nur einen Platz hat. Die drei Phase-3-Muster stehen wieder voll auf dem v1-Maßstab.

⚠️ **Reihenfolge beim Ändern: Diese Werte hängen jetzt am Netzwerkeffekt, nicht mehr am PR-Budget allein.** Wer `NETWORK_K_BASE` senkt, muss hier mitsenken. Begründung im Detail: `CLAUDE.md` §7.2/§8 und der Kommentar über `pushNotifications` in `js/techtree.js`.

⚠️ **Die frühere Zielvorgabe „die CC-Regler müssen zusammen +6 bis +8 Trend liefern" ist dreifach überholt.** Sie stammt aus der Zeit mit **zwei** Kampagnenplätzen; inzwischen sind es fünf (+15,0 rein für Geld, `CLAUDE.md` §7.2), die Schuld ist halb so groß — und das Gebäude, das sie stemmen sollte, gibt es nicht mehr (§5). Die Schuld wird heute vom **Netzwerkeffekt** getragen, nicht von einem einzelnen Werkzeug.

### Hauptbaum — zwei Features, die Daten brauchen

Der Unterschied zum KI-Reiter: dort stehen **Algorithmen** (globale Multiplikatoren), hier **Features**, die man auf der Plattform sehen würde.

| Node | Hängt an | € | 🗃️ | Dauer | Server | Wirkung |
|---|---|---|---|---|---|---|
| **Kurzvideos** | `videos` + `@ki_empfehlung` | 45.000 | 250.000 | 140 s | 10.000 | Watchtime ×1,3, Trend +1,0 |
| **Freundschaftsvorschläge** | `dm` + `@ki_speicher` | 35.000 | 150.000 | 120 s | 6.000 | Watchtime ×1,1, Trend +2,0 |

⚠️ **Beide geben deutlich weniger Trend als die Phase-2-Nodes des Hauptbaums** (+1,0 / +2,0 gegen bis zu +12,0). Das ist Absicht: der positive Trend der Phase 3 kommt aus dem **Netzwerkeffekt** und den **Kampagnenplätzen**, nicht mehr aus dem Feature-Baum. Wer hier aufdreht, nimmt beiden ihre Rolle weg.

Kurzvideos hängt an `ki_empfehlung`, weil ein Kurzvideo-Feed ohne Empfehlungs-Algorithmus schlicht nicht funktioniert — bei zehn Sekunden Länge entscheidet nicht mehr, was jemand sucht, sondern was ihm vorgelegt wird.

**Watchtime-Gesamtbilanz Phase 3:** `1,10 × 1,10 × 1,20 × 1,30 × 1,10` = **×2,08**, auf Phase 2's ×2,02 also ×4,2 insgesamt. Verteilt über fünf Nodes in zwei Reitern, mit einem Dark Pattern in der Mitte — statt zweier großer Sprünge im KI-Reiter.

### Marketing-Reiter — Marktanalyse

Der Reiter hatte ab Phase 3 nichts mehr anzubieten: seine drei Reichweiten-Kampagnen liefern **absolute** Zahlen und werden mit wachsender Plattform zwangsläufig zum Rundungsfehler (`CLAUDE.md` §7.1, dort schon so festgehalten).

| Node | Hängt an | € | 🗃️ | Dauer | Server | Wirkung |
|---|---|---|---|---|---|---|
| **Marktanalyse** | `mk_partner` + `@ki_profile` | 45.000 | 200.000 | 100 s | 3.000 | schaltet **Zielgruppen-Offensive** frei |

**Zielgruppen-Offensive** (`kind: 'users'`, `usersPct` statt `users`): **20.000 € + 300.000 Metadaten, 60 s, +3 % der User** — direkt, nicht über den Trend.

Sie ist der **zweite wiederholbare Metadaten-Abfluss** neben dem Targeting. Beide ziehen aus demselben Lager: „+3 % User" steht direkt gegen „mehr Geld je Werbedeal".

⚠️ **Sie ist nicht billiger je User, sie ist schneller und klick-ärmer.** Gegen den Hype-Burst gerechnet:

| bei … User | liefert | € per Hype-Burst | dessen Zeit |
|---|---|---|---|
| 500 k | 15.000 / 60 s | 7.500 € | 113 s |
| 1,3 Mio | 39.000 / 60 s | **20.000 €** | 293 s |
| 5 Mio | 150.000 / 60 s | 75.000 € | 1.125 s |

Der €-Gleichstand liegt bei ~1,3 Mio Usern; der Tempo-Vorteil (1,9× schon beim Einstieg) wächst linear mit. Es ist auf der Wachstumsseite dieselbe Bewegung wie die Anteils-Stufen auf der Geldseite: **weg von festen Zahlen, hin zu etwas, das mit der Plattform mitwächst.**

**Sanity-Check gegen Selbstläufer:** der *gesamte* Metadaten-Strom bei 10 % Abdeckung trägt eine Buchung alle 96 s, also +3 % je 96 s — das entspricht **Trend +0,4**. Sie kann nicht davonlaufen.

⚠️ **Sie ist die einzige Stelle im Entwurf, die eine Rückkopplung baut:** Metadaten → User → Watchtime → Modelle → Metadaten. Gedämpft wird sie durch die Kapazität (Modelle und User essen aus demselben Topf), aber sie ist da. Wenn im Test etwas davonläuft, ist das der erste Verdächtige — und der Knopf sind die **Metadaten-Kosten**, nicht `usersPct`, sonst kippt der Vergleich mit dem Trend-Wachstum.

**Prozentuale Kampagnen rechnen beim Buchen, nicht beim Auszahlen** (`active.users`). Sonst würde eine Abwanderung während der Laufzeit die schon bezahlte Kampagne nachträglich kleiner machen — und die Karte hätte gelogen.

### Werbung-Reiter — die Infrastruktur des Abflusses

**Volumen und Targeting werden hier freigeschaltet, nicht im KI-Reiter.** Das ist die lesbare Fassung des Kreislaufs: der KI-Reiter *macht* Daten, der Werbung-Reiter *gibt sie aus*. Nebeneffekt: der KI-Reiter bleibt bei acht Nodes.

```
                            ┌─► Anzeigen-Optimierung   (Phase 2, Volumen `fest ×4`)
                            │
wb_display ─────────────────┼─► Retargeting            (@ki_profile)
                            │
                            └─► Ad-Server ─► Programmatic Advertising
                                @infiniteScroll
```

| Node | Phase | Hängt an | € | 🗃️ | Dauer | Server | Wirkung |
|---|---|---|---|---|---|---|---|
| **Anzeigen-Optimierung** | **2** | `wb_display` | 12.000 | — | 80 s | 2.000 | Volumen **`fest ×4`** |
| **Retargeting** | 3 | `wb_display` + `@ki_profile` | 40.000 | **500.000** | 100 s | 4.000 | schaltet den **Targeting-Schalter** frei |
| **Ad-Server** | 3 | `wb_display` + `@infiniteScroll` | 40.000 | 200.000 | 100 s | 4.000 | Volumen **`Anteil`** |
| **Programmatic Advertising** | 3 | Ad-Server | 60.000 | 400.000 | 120 s | 6.000 | Volumen **`Anteil ×3`** |

⚠️ **Der Reiter war bis zum 2026-08-10 eine Kette und ist jetzt ein Fächer.** Vorher hing alles hinter dem Retargeting, also hinter `ki_speicher → ki_training → ki_profile`: der Anteils-Kurs — die einzige Mechanik, die den Watchtime-Berg strukturell auflöst — war nur über ein Dark Pattern und den vollen Retargeting-Preis erreichbar. Als Geschwister sind es drei unabhängige Investitionen aus einer Wurzel.

⚠️ **`Real-Time Bidding` (`Anteil ×5`) ist ersatzlos gestrichen.** Zwei Anteils-Stufen reichen: die höhere ist ohnehin nur Abbau-Tempo und bringt im Dauerbetrieb kein zusätzliches Geld (siehe §7), eine dritte war eine Wiederholung derselben Aussage zum dreifachen Preis. `storage.migrate()` schiebt gespeicherte `Anteil ×5`-Deals auf `Anteil ×3`.

⚠️ **Die Anzeigen-Optimierung hatte hier einen anderen Effekt** (45.000 € + 250.000 🗃️, `adWatchtimeMult: 0.75` = −25 % Verbrauch je Zyklus). Er zeigte in die **falsche Richtung**: weniger Verbrauch je Deal heißt mehr liegengebliebene Watchtime — also genau das Problem, gegen das dieser ganze Reiter gebaut ist, nur verstärkt. Der Getter `adWatchtimeMult()` bleibt als reservierter Haken für die Konkurrenz Werbeagentur ↔ KI-Labor bestehen und liefert bis auf Weiteres 1.

⚠️ **Die Abhängigkeit auf `infiniteScroll` ist keine Deko:** vielfaches Werbevolumen setzt vielfachen Werbeplatz voraus, und endlosen Werbeplatz gibt es nur mit endlosem Feed.

⚠️ **Die Anteils-Stufen kosten steil** (200k → 400k). Die *erste* ist dabei kein Komfort, sondern der Moment, in dem Watchtime unbegrenzt verwertbar wird. Der Preis von `wb_adserver` ist damit die eigentliche Schwelle dieser Phase — die dahinter ist Tempo und darf teuer bleiben.

⚠️ **Retargeting kostet seit dem 2026-08-10 500k statt 200k** und ist damit die teuerste Node des Reiters — mehr als beide Anteils-Stufen zusammen. Zwei Gründe: es ist das einzige Werkzeug im Spiel, das € je Trend-Punkt hebt (§2), und es ist die einzige Node, die **nach** dem Kauf weiter Metadaten frisst (`TARGETING_META_PER_WT` je Zyklus). Der Einstiegspreis ist deshalb kein Zoll, sondern die ehrliche Frage, ob die Abdeckung den Dauerabfluss trägt — wer ihn gerade so bezahlen kann, kann das Targeting noch nicht betreiben. Nebeneffekt: die Reihenfolge im Fächer ist jetzt eindeutig lesbar — `wb_adserver` zuerst (Verwertbarkeit), Retargeting danach (Marge).

### Nebenbei repariert: `infiniteScroll`

Hing an `feed` und damit an einer Node aus der zweiten Spalte — der Infinite Scroll war dadurch praktisch sofort verfügbar. Hängt jetzt an **`stories`**, wie Autoplay. Beide Dark Patterns der Phase 2 sitzen damit hinter demselben Feature.

### Community-Reiter — entfällt

War als eigener Reiter für die CC-Regler geplant (Feedback-System → Support-Programm, Creator-Tools → Beteiligung, …). Mit dem Gebäude ist er hinfällig. Was davon gebraucht wurde, steht heute im **Marketing-Reiter**: die Creator-Beteiligung hinter `mk_partner`, der **Marktplatz** als eigene Phase-3-Node dahinter (`CLAUDE.md` §9).

⚠️ **Aufteilung der ~8 neuen Nodes noch offen.** Grob 4/4, aber erst festlegen, wenn die Regler stehen — Nodes, die nichts freischalten, sind Füllmaterial.

---

## 7. Werbeagentur — zwei neue Schichten

Beide sitzen im Buchungs-Modal, unter dem Intensitäts-Slider, und greifen **zwei verschiedene Wände** an (Sektion 2).

### Volumen — vier Knöpfe: `fest` · `fest ×4` · `Anteil` · `Anteil ×3`

Die ersten beiden Stufen sind **absolut** (`type.watchtime`), die zwei anderen sind **Anteile des Watchtime-Lagers**. Der Anteil je Werbeart leitet sich aus `type.watchtime / AD_PCT_ANCHOR` ab: Banner 0,3 % · Feed 1 % · Search 5 % · Video 8 % je Stufe.

**Der Umbau von festen Multiplikatoren (×1/×3/×5/×10) auf Anteile war die Antwort auf einen gemessenen Zustand:** bei ~3 Mio Usern lagen 800 Mio Watchtime ungenutzt herum. Feste Mengen skalieren nicht mit der Plattform — um die Produktion von 1,1 Mio wt/s zu verwerten, hätte man 69 gleichzeitige Video-Deals gebraucht, also −43 Trend bei einem Budget von 20. **Höchstens ~30 % der Watchtime waren überhaupt verwertbar.** Anteilig verschwindet das bei *gleichem* Trend-Preis: 20.000 €/s werden zu 3,2 Mio €/s, Faktor 160.

**`fest ×4` ist trotzdem als zweite absolute Stufe dazugekommen** (2026-08-10), und zwar nicht als Rückschritt, sondern für Phase 2: dort gibt es die Anteils-Stufen noch nicht, und die Strecke von ~600.000 Usern bis zum Ad-Server war die längste Durststrecke des Spiels. Sie liefert vierfach zu vierfachem Geld bei **unverändertem** Trend-Malus und schiebt die Wand auf ~2 Mio User. Herleitung und Zahlen in `CLAUDE.md` §6.

⚠️ **Der Trend-Malus MUSS linear mit der Stufe skalieren — aber nur bei den Anteils-Stufen** (`trendMult` = `mult` = 1 / 3). Bekämen sie einen Rabatt, wäre „immer Maximum" sofort richtig und der Intensitäts-Regler tot, weil ihr Einkommen im Gleichgewicht stufenunabhängig ist. Ein Rabatt ist dort auch nicht nötig — der Wechsel auf Anteile ist für sich schon Faktor 160. Bei `fest ×4` liegt der Fall umgekehrt: dort skaliert das Einkommen mit, ein proportionaler Malus wäre exakt „vier parallele Deals" und damit gar keine Stufe. Deshalb sind `mult` und `trendMult` zwei getrennte Felder.

**Die Anteils-Stufe ist kein Machtregler — das ist die tragende Eigenschaft.** Läuft dauerhaft ein Deal, pendelt sich das Lager ein bei `S* = Produktion × Zyklusdauer / (Anteil × adWatchtimeMult)`, und das Einkommen dort ist `Produktion × Kurs / adWatchtimeMult` — **unabhängig von der Stufe**. `Anteil ×3` bringt dasselbe Geld bei dreifachem Trend, nur mit kleinerem Puffer.

| Steuerung | Kostet Trend | Charakter |
|---|---|---|
| **Volumen, anteilig** | linear | **Tempo**, kein Ertrag — für den Abbau eines Rückstaus |
| **Volumen, `fest ×4`** | **gar nicht** | **Ertrag** — die Ausnahme, siehe unten |
| **Intensität** | kubisch (`AD_TREND_EXPONENT` = 3) | der Ertrags-Regler, teuer nach oben |

Im Dauerbetrieb ist also die **niedrigste** Anteils-Stufe strikt die beste. Die höhere ist das Werkzeug für einen Berg — nach einer Nacht, einer Pause, oder wie hier nach einer Phase ohne brauchbare Nachfrage. Damit gibt es kein „immer auf Maximum" mehr, und die alte Sorge, Volumen könnte die Intensität ersetzen, ist erledigt.

⚠️ **`fest ×4` bricht diese Eigenschaft bewusst — und kommt trotzdem ohne „immer Maximum" aus.** Weil sie absolut ist, gibt es kein Gleichgewicht, in dem sich der Faktor herauskürzt; sie ist auf ihrer Seite der Leiter tatsächlich mehr Geld. Was sie begrenzt, ist nicht der Trend, sondern das **Lager**: ein Zyklus braucht die vierfache Menge vorrätig, sonst bricht der Deal ab. Auf einer kleinen Plattform bleibt `fest` deshalb richtig — **es ist die einzige Stufe, deren Nutzen davon abhängt, wie voll das Lager gerade ist.**

⚠️ **Stufe 1 muss absolut bleiben.** Sie ist die Voreinstellung des *ganzen* Spiels, auch solange die Knopfreihe gar nicht angezeigt wird. Prozentual bekäme ein Banner bei 100.000 Lager statt 15.000 nur noch 300 Watchtime. Gleichstand ist bei `AD_PCT_ANCHOR` = 5 Mio Lager — für alle vier Arten gleichzeitig, das fällt aus der Konstruktion.

⚠️ **Ein einheitlicher Prozentsatz für alle Arten würde sie einebnen.** Der Ertrag hinge dann nur noch an Kurs und Dauer, und Feed gewänne auf *beiden* Achsen (1.000 €/s je Mio Lager gegen 500 bei Video, dabei 3,3× besseres € je Trend-Punkt). Search, Video und Banner hätten keine Rolle mehr. Deshalb wird der Anteil aus `type.watchtime` abgeleitet statt als eigenes Feld gepflegt — so bleiben die Verhältnisse per Konstruktion erhalten.

**Knöpfe statt Regler.** Die Stufen sind durch die Nodes ohnehin diskret; ein Regler würde eine Stufenlosigkeit vortäuschen, die es nicht gibt. Gesperrte Stufen bleiben sichtbar und tragen den Namen der fehlenden Node — dieselbe Regel wie bei gesperrten Kampagnen im Marketing-Center. Solange nur eine Stufe offen ist (`adVolumeOpenCount() <= 1`), fällt die ganze Zeile weg — seit `fest ×4` also bis zur Anzeigen-Optimierung in Phase 2, nicht mehr bis Phase 3.

⚠️ **Die Knöpfe tragen die Stufe, nicht den Prozentwert.** Die Reihe steht über allen vier Werbekarten; ein Prozentwert wäre dort für drei von vier Arten falsch. Was die Stufe für eine bestimmte Art bedeutet, steht in ihrer Karte — die Watchtime-Zeile trägt den Anteil in Klammern dahinter.

⚠️ **Volumen hat KEINEN eigenen Metadaten-Preis** (Abweichung von einem früheren Entwurf). Weil Targeting je Watchtime kostet und die Anteils-Stufen die Watchtime hochziehen, wachsen die Targeting-Kosten von selbst mit. Ein zweiter Preis obendrauf wäre derselbe Sachverhalt zweimal berechnet.

### Targeting — ein Schalter je Deal

Verbraucht **Metadaten je Zyklus** und hebt dafür das Geld. Das ist der Sink, der Metadaten dauerhaft am Leben hält, und der Angriff auf die Trend-Wand: mehr Geld je Deal heißt weniger Deals für dasselbe Geld heißt weniger Trend-Malus.

```
Preis:  TARGETING_META_PER_WT  = 0,5 Metadaten je Watchtime
Ertrag: TARGETING_REVENUE_MULT = ×2,5 auf das Geld
Trend:  unverändert
```

⚠️ **`TARGETING_META_PER_WT` und `METADATA_PER_MODEL` sind ein PAAR** und müssen im selben Faktor bewegt werden. Der Grund ist der gemeinsame 8-s-Takt: ein User macht 1 Watchtime je Zyklus, ein Modell `METADATA_PER_MODEL` Metadaten je Zyklus. Bei Gleichstand gilt dadurch wörtlich

> **Abdeckung = Anteil deiner Watchtime, der personalisiert laufen kann.**

Das ist die Zahl, die im KI-Labor steht und die der Spieler beim Buchen wiederfindet. Wer nur einen der beiden Werte anfasst, macht die Abdeckungs-Prozentzeile zu einer Zahl ohne Bedeutung. `metadataMult` (Speicherung, Profilbildung) kauft sichtbar Luft *über* dieser Linie.

⚠️ **`TARGETING_REVENUE_MULT` muss über 2 liegen.** Kapazität, die Modelle trägt, trägt keine User: bei Abdeckung `c` steht `(1 + c(X−1)) / (1 + c)` gegen 1, und das ist bei X = 2 **exakt break-even**. 2 ist der Nullpunkt, nicht die Belohnung. Großzügig wird der Kurs erst dort, wo der Trend die Bremse ist statt der Kapazität — also genau in der Lage, für die Phase 3 gebaut ist. Die Prüffrage bleibt entsprechend „Deals je Trend-Budget", nie „€ je Kapazität".

**Schalter statt Regler:** drei Regler in einem Modal wären einer zu viel (Werbeart, Intensität, Volumen sind schon drei Entscheidungen). Er hat genau zwei Zustände.

**Abbruch:** reicht bei einem Zyklus die Watchtime **oder** die Metadaten nicht, bricht der Deal ab — dieselbe Regel für beide Posten, mit eigener Meldung je Ursache.

⚠️ **Formel-Disziplin:** `adMoneyPerCycle` / `adTrendMalus` / `adWatchtimePerCycle` / `adMetadataPerCycle` stehen **einmal** in `js/state.js`; Loop, Offline-Aufholpass und UI rechnen alle darüber (`CLAUDE.md` §6). Der rohe `type.watchtime` steht seit den Volumen-Stufen **nirgends** mehr für sich allein.

⚠️ Beide überschneiden sich konzeptionell mit dem alten „Daten-Targeting 1–50 %"-Entwurf. Der ist damit **abgelöst**, nicht zusätzlich zu bauen.

---

## 8. Bewusst später

### Ereignisse — das nächste System

**Mechanik und Ereignis sind zwei verschiedene Dinge, und fast alles, was noch offen ist, ist ein Ereignis.**

| | Preis | Wirkung auf den Schüler |
|---|---|---|
| **Mechanik** (Regler, Ressource, Gebäude) | viel Bau, viel Balance, viel Erklärung | muss verstanden werden, **bevor** sie etwas sagt |
| **Ereignis** (Text + zwei Knöpfe + eine bekannte Zahl) | wenig Bau, kaum Balance | sagt seine Aussage **sofort** |

Shitstorm, viraler Hit, „Firma will deine Daten kaufen", Datenschutz-Beschwerde, Umwelt-Protest, Bot-Verdacht, das Investor-Angebot — inhaltlich sind das alles **Karten in einem System**, keine sieben Systeme. Gebaut wird auf Zahlen, die der Spieler schon kennt (Trend, Geld, User, Metadaten); **keine neue Ressource, kein neuer Regler.**

⚠️ **Die Disziplinregel: jede Karte hat eine Aussage, und keine zwei Karten haben dieselbe.** Ohne sie wird aus dem billigen System ein Zoo, und die Verständlichkeit ist genau das, was das Spiel nicht verlieren darf.

Was das Spiel schon sagt — daran wird jede neue Karte gemessen:

| Aussage | wodurch | Stand |
|---|---|---|
| Aufmerksamkeit ist die Ware | User → Watchtime → Geld | ✅ |
| Reichweite kostet Ruf | Werbedeals drücken den Trend | ✅ |
| Dark Patterns wirken — und der Schaden bleibt | `trendBase`, fünf Muster | ✅ |
| Daten sind wertvoller als alles andere | KI-Labor, Targeting, Metadaten | ✅ |
| Es gibt einen anständigen Weg, und er kostet | Creator-Beteiligung (Marketing-Center) | ✅ |
| **Infrastruktur verbraucht Strom, Wasser, Fläche** | Umwelt | **neu, noch nichts** |
| **Es gibt Regeln, und Verstöße kosten** | Datenschutz | **neu, noch nichts** |

**Startsatz: fünf Karten.** Shitstorm · viraler Hit · Datenkauf-Angebot · Datenschutz-Beschwerde · Umwelt-Protest.

**Kein Würfel — eine Konsequenz.** Dieselbe Regel wie bei den Bots weiter unten: Das Risiko steigt mit dem, was der Spieler tut (`trendBase`, Werbe-Intensität, laufendes Targeting, Farmzahl), die Chance auf einen viralen Hit mit der Creator-Beteiligung. Ein sauber gespielter Konzern bekommt eine kleine Grundrate, ein extraktiver ist im Dauerbeschuss.

⚠️ **Mit Vorwarnung** — 20–30 s „Unruhe in der Community" auf der Trend-Kachel. Ohne sie ist es eine Strafe, mit ihr eine Entscheidung. Und die interessante Entscheidung ist, dass der Kampagnenplatz besetzt sein kann.

**Größenordnung.** Ein Ereignis ist ein Trend-Modifikator mit Wert `V` und Haltezeit `H`; die Trend-Sekunden sind `V×H + 25V²`, der User-Verlust `1 − e^(−S/1200)`:

| Wert | Haltezeit | Trend-Sekunden | User-Verlust |
|---|---|---|---|
| −1,0 | 30 s | 55 | 4,5 % |
| **−2,0** | **30 s** | **160** | **12,5 %** |
| −3,0 | 30 s | 315 | 23,0 % |
| −4,0 | 30 s | 520 | 35,1 % |

⚠️ **Der Ausklang trägt bei −4,0 schon 77 % des Schadens.** Doppelte Stärke ist fast vierfacher Schaden — wer hier Zahlen anfasst, muss quadratisch denken. Vorschlag: Standard −2,0 / 30 s, je nach Risiko zwischen −1,0 und −3,0. Zum Vergleich: ein Banner @50 % ist −10,0, ein Sturm ist also kleiner als der Schaden, den ein Spieler sich selbst zufügen kann.

**Umwelt ist die einzige der neuen Aussagen, die zusätzlich eine Mechanik braucht** — abgeleitet aus Farmzahl und -stufe, keine neue Ressource: ab einer Schwelle ein Trend-Malus und steigende Protest-Wahrscheinlichkeit. Damit bekommt der geparkte „Strom/Wasser-Upkeep" aus `CLAUDE.md` §12 seinen eigentlichen Sinn — nicht als Härtegrad, sondern als Aussage.

⚠️ **Erst das Werkzeug, dann die Bedrohung — aber das Werkzeug erst, wenn es einen Job hat.** Die Community-Pflege (§5) und die Ereignisse hängen aneinander: ohne Stürme ist die Pflege für den sauberen Spieler wertlos, ohne Pflege ist ein Sturm nur Pech. Die Creator-Beteiligung steht dagegen für sich und ist gebaut — sie ist der Messpunkt, an dem sich zeigt, was wirklich fehlt.

### Bots (Phase 3.2)

Sprites liegen bereit: `sprites/User/Bot{Küken,Huhn,…}.png` — für jede Tierstufe.

**Umsetzung:** einzelne Tier-Slots in den Farmen kippen sichtbar auf ihre Bot-Variante. Gleiche Stufe, anderes Bild, kein neues UI. Bots **produzieren Watchtime** (Empörung wird geschaut), zählen aber negativ auf `trendBase`.

**Der Bot-Anteil wächst mit der Metadaten-Extraktion und fällt mit Moderation.** Damit sind Bots das **Konsequenz-Anzeigeinstrument des KI-Wegs**, kein Zufallsereignis. ⚠️ Wo die Gegenmaßnahme sitzt, ist offen: das Gebäude, das sie tragen sollte, ist verworfen (§5).

⚠️ Nicht in 3.0. Vier neue Systeme gleichzeitig zu balancen geht schief, und Bots brauchen die KI-Seite als Ursache, bevor sie eine Wirkung sein können.

⚠️ **Als System vorerst gestrichen, als Ereignis-Karte behalten.** Sprites je Tierstufe, ein eigener Bot-Anteil und die Moderation als CC-Werkzeug sind viel Bau für eine Aussage, die der Datenweg schon trägt. Ein „Bot-Verdacht"-Ereignis kostet fast nichts und sagt dasselbe. Kommt das Vollsystem später zurück, braucht die Moderation einen eigenen Ort — das Gebäude, das sie tragen sollte, ist verworfen (§5).

### Marcus' Rückkehr — umgesetzt, ohne Entscheidung

Der Meilenstein liegt seit dem 2026-08-07 bei **1 Mio Usern** (`PHASE3_USER_THRESHOLD`) und öffnet Marcus' zweiten Auftritt. Er holt sich, was ihm gehört, und zwar zweimal:

| | |
|---|---|
| 💸 **Ausschüttung, jetzt** | −15 % des Kontostands, einmalig |
| 📉 **Werbeerträge, ab jetzt** | −15 %, dauerhaft (`adRevenueMult()`) |

⚠️ **Bewusst OHNE Entscheidung.** Ein „auszahlen oder behalten" war lange geplant; es hätte aus einer Beteiligung eine Verhandlung gemacht. Er ist zu 15 % an der Firma beteiligt — das war der Deal, den der Spieler in Phase 2 **selbst angenommen hat**, und Beteiligungen fragen nicht. Genau das ist die Lehre, und sie funktioniert nur, wenn es keinen Ausweg gibt.

⚠️ **Der Griff sitzt in `maybeTriggerPhase3()` (`js/loop.js`), nicht im Modal.** Er hängt am Setzen von `phase3Triggered` und ist damit deterministisch: wer mitten im Modal neu lädt, hat trotzdem bezahlt. Läge die Abbuchung am „Weiter"-Knopf, wäre das Flag gesetzt und das Geld nie geholt — und der Moment kommt genau einmal, es gäbe also keine Reparatur. Der abgebuchte Betrag steht in `investorCutAmount`, damit das Modal die echte Zahl zeigt statt sie ein zweites Mal zu rechnen.

⚠️ **Der Abzug sitzt in `adRevenueMult()`** und nicht in einem eigenen Multiplikator daneben. Dadurch sehen Loop *und* UI ihn beide — die Werbeagentur-Karte zeigt von allein den Betrag an, der wirklich ankommt.

⚠️ **Alte Spielstände über der Schwelle zahlen den Griff NICHT rückwirkend** (`storage.migrate()`): das Geld ist längst ausgegeben, eine nachträgliche Abbuchung wäre eine unerklärte Strafe. Der laufende Werbe-Abzug greift dagegen sofort, weil er nur die Zukunft betrifft.

⚠️ `PHASE3_USER_THRESHOLD` und der Prosa-Satz im Phase-2-Investorentext hängen jetzt an **derselben Konstanten** (`milestoneText()` in `js/ui.js`). Vorher stand die Zahl dort ausgeschrieben — wer sie in `loop.js` änderte, machte Marcus zum Lügner. Dasselbe gilt für `INVESTOR_USER_THRESHOLD` auf Seite 1 des Modals.

**Offen bleibt**, ob Phase 3 ein Ende braucht oder offen ausläuft. Das ist keine Investor-Frage mehr, sondern eine über die Ereignis-Karten.

### Datenverkauf

Einmalaktion: viel Geld sofort, dafür **dauerhafter `trendBase`-Schaden**. Also ein Dark Pattern im Aktions-Gewand — passt zur Regel in `CLAUDE.md` §8, dass `trendBase` genau dafür reserviert ist. Notbremse, nicht Alltagsmechanik.

### Nicht in Phase 3

Trend-Events (Shitstorm/Viral) · Programme auf Farmen · Metadaten verdoppelt Serverbedarf pro User (braucht erst eine Regel, was mit Usern über der Kapazität passiert)

⚠️ **Strom/Wasser-Upkeep steht hier nicht mehr** — er ist am 2026-08-07 als Serverkosten umgesetzt worden und läuft ab **Phase 2** (`CLAUDE.md` §4). Phase 3 erbt daraus drei Nodes und das Strom- & Wasserwerk, das den Versorgungs-Klick der großen Farmen bündelt.

---

## 9. Umsetzungs-Reihenfolge

| # | Baustein | Ergebnis | Stand |
|---|---|---|---|
| 1 | Phase-3-Flag + Einstiegs-Modal | Phase 3 existiert | ✅ |
| 2 | Metadaten + Modelle in State, Bar, Farben | Ressourcen sichtbar | ✅ |
| 3 | Modelle als Kapazität in den Farmen: Sprites, Ring, Ernte | Metadaten entstehen | ✅ |
| 4 | KI-Labor: Umwandlung buchen, 5 Zyklen, einsammeln | Modelle entstehen | ✅ |
| 5 | KI-Reiter mit 5 Nodes, beide Ausbau-Achsen | Kette ausbaubar | ✅ |
| 6 | **Volumen + Targeting in der Werbeagentur** | **die Wand fällt** | ✅ |
| 7 | **Metadaten-kostende Nodes** (16 Stück, vier Reiter) | **Metadaten-Sink** | ✅ |
| 8 | ~~Community Center~~ → **Creator-Beteiligung als Regler-Kampagne** | Gegenentwurf steht — **Messpunkt** | ✅ |
| 9 | Ereignisse: Shitstorm + viraler Hit | die Öffentlichkeit reagiert | offen |
| 10 | Datenkauf-Angebot + Datenschutz als Karten | zwei Aussagen, kein neues System | offen |
| 11 | Umwelt | „Infrastruktur verbraucht etwas" | offen |
| 12 | Community-Pflege (Ort offen, §5) | die Stürme bekommen eine Abwehr | offen |
| 13 | **Marcus' Rückkehr bei 1 Mio** (ohne Entscheidung) | die Beteiligung wird fällig | ✅ |
| 14 | Strom- & Wasserwerk + 3 Energie-Nodes | Serverkosten werden bezahlbar | ✅ |

**Schritt 8 wird bewusst allein gespielt, bevor 9 kommt.** Ein Gebäude, ein Werkzeug, ein Regler — die Frage ist, ob der Trade-off trägt und was sich beim Spielen als fehlend anfühlt. Alles danach verändert die Messung.

⚠️ **Der Community-Reiter im Techtree entfällt weiterhin** (siehe unten). Schritt 8 bringt **genau eine** Node — den **Marktplatz** — und die steht im Marketing-Reiter, hinter `mk_partner`. Die Creator-Beteiligung selbst kommt mit `mk_partner` und braucht keine eigene Freischaltung.

⚠️ **Bots sind als System gestrichen** und leben als Ereignis-Karte weiter (§8). Damit fällt auch die Moderation vorerst weg — und mit ihr `ki_agents`, das sie als einziges freigeschaltet hätte.

**Schritt 1–7 stehen: Metadaten haben jetzt drei Abflüsse** — Targeting (laufend), Zielgruppen-Offensive (laufend) und 13 Nodes (einmalig). Damit hat Phase 3 zum ersten Mal eine eigene Ökonomie, und **das ist der erste sinnvolle Messpunkt.** Jeder weitere Baustein ändert die Messung.

⚠️ **Das Node-Budget aus Sektion 1 ist gebrochen: 14 statt ~8.** Das ist eine Entscheidung, keine Panne — Phase 3 wird dadurch eher 25–30 Minuten statt 15. Getragen wird sie davon, dass die Hälfte in **bestehende** Reiter geht und dort keinen neuen UI-Bau braucht. Falls im Test doch gekürzt werden muss, sind die billigsten Streichungen die obere Volumen-Stufe (`wb_programmatic` — sie gibt Tempo, keinen Ertrag) und Kurzvideos (Multiplikator ohne neue Aussage). Zuletzt streichen: Freundschaftsvorschläge — die trägt eine Aussage, keine Zahl. (KI-Agents stand hier ebenfalls und ist inzwischen gestrichen, §5; `wb_rtb` und die Phase-3-Fassung der Anzeigen-Optimierung sind am 2026-08-10 tatsächlich gestrichen bzw. nach Phase 2 gewandert, §6.)

⚠️ **`wb_adserver` ist seit dem Umbau auf Anteils-Stufen keine Streichkandidatin mehr.** Sie ist der Schalter, der Watchtime wieder verwertbar macht; ohne sie steht Phase 3 mit demselben Berg da wie vorher.

**Der Community-Reiter aus Sektion 6 entfällt.** Was von ihm gebraucht wurde, steht im Marketing-Reiter; das spart einen Reiter, zwei Nodes und das ganze Geist-Karten-Gerüst.

**Testen ohne 20 Minuten Vorlauf:** der Debug-Seed für Phase 3 (`js/debug.js`) setzt `phase3Triggered` und stellt eine Plattform mit 550.000 Usern her. Das KI-Labor muss dort gekauft werden — der Einstieg ist genau das, was sich testen lässt.

⚠️ **Der Seed startet bewusst mit 0 Metadaten**, das Targeting liegt aber hinter `ki_speicher → ki_training → ki_profile → wb_retarget` plus 500.000 Metadaten für die Node selbst (dazu die Metadaten der drei KI-Nodes davor). Wer nur die neuen Regler sehen will, nimmt die **🗃️-Knöpfe im Debug-Panel** (+100k / +500k / +2M) — sonst kostet der Weg dorthin mehrere Minuten.

---

## 10. Offen — bewusst nicht entschieden

1. **Ob `TARGETING_REVENUE_MULT` = 2,5 stimmt.** Hergeleitet ist nur die **Untergrenze** (>2, sonst zahlt die Kapazität drauf); der Abstand darüber ist gesetzt, nicht gemessen. Zu prüfen ist er über „wie viele Deals bei welchem Trend-Budget", nicht über den €-Ertrag eines einzelnen Deals.
2. **Ob die Metadaten schnell genug abfließen.** Drei Sinks stehen, ihre Preise sind aufeinander abgestimmt, aber gegen die *Produktion* geeicht ist nichts davon. Erster Messpunkt überhaupt.
3. **Ob die Kampagnenplätze die −7,0 tragen können** (Sektion 6). Seit es den Netzwerkeffekt gibt, ist die Vorgabe deutlich milder als beim Entwurf angenommen — er trägt die Schuld ab ~10 Mio Usern allein. Die Frage ist damit von „reicht ein Werkzeug" zu „reicht der Ruhewert im Frühspiel der Phase 3" geworden.
4. **Ob die Rückkopplung der Zielgruppen-Offensive im Zaum bleibt** (Sektion 6). Knopf: ihre Metadaten-Kosten.
5. **Wo Phase 3 endet.** Gibt es einen Abschluss, oder läuft es aus? Marcus' Rückkehr steht inzwischen am **Anfang** von Phase 3 und beantwortet die Frage nicht mehr mit — sie hängt jetzt an den Ereignis-Karten (Schritt 9–12).
6. **Ob der Umrechnungskurs stimmt.** `wtPerModel` (20 / 10) und 0,5 Metadaten je Modell sind gesetzte Anker, keine Messung. **`METADATA_PER_MODEL` nur noch im Paar mit `TARGETING_META_PER_WT` anfassen** — daran hängt die Aussage „Abdeckung = targetbarer Anteil deiner Werbung" (Sektion 7).
7. **Ob der innere Ring bleibt.** Seit gleichem Takt trägt er keine eigene Information mehr (Sektion 3). Entweder Metadaten bekommen wieder einen eigenen Zyklus, oder der Ring fällt weg.
8. **Ob mehrere KI-Labore erlaubt sein sollen.** Technisch läuft je Labor eine Umwandlung parallel — das wäre der Volumen-Hebel der Datenseite, ist aber nicht balanciert.
