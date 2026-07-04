# THE ALGORITHM – Mechaniken & Visuelles Feedback

> Ziel dieses Dokuments: Alle Mechaniken strukturiert beschreiben, die auf die drei Basiswerte wirken.  
> Basis für: **1) Visuelles Feedback** · **2) Infotafeln & Startscreen**

---

## 1. Die drei Basiswerte

### 💊 Dopamin
- **Startwert:** 80
- **Game Over:** bei 0
- **Wie es funktioniert:** Dopamin bewegt sich jede Sekunde auf einen *Zielwert* (Target) zu. Der Zielwert wird durch die **Feed-Interesse-Ratio** bestimmt.
- **Kritische Zone:** unter 30 → bewegt sich doppelt so schnell auf den Target zu (step 2 statt 1)
- **Bereits implementiert:** Status-Bar mit Marker, rote Pulsanimation unter 30

### 👥 Sozialdrang
- **Startwert:** 0
- **Game Over:** bei 100
- **Passiv:** steigt +1 pro Sekunde (ohne Triple-Grün-Synergie)
- **Bereits implementiert:** Status-Bar mit Marker

### 🔥 Reizschwelle
- **Startwert:** 0, Optimalwert startet bei 0
- **Game Over:** wenn `|Reizschwelle - Optimalwert| > 30`
- **Passiv:** sinkt -0.5 pro Sekunde (natürliche Regeneration)
- **Optimalwert steigt:** +5 alle 20 Sekunden (max. 95) → Spiel wird schwerer
- **Bereits implementiert:** Farbverlauf (grün = Optimalzone, orange = Randzone, rot = Danger)

---

## 2. Das Interesse-System

### Interessenebenen (zufällig generiert bei Spielstart)

| Ebene  | Anzahl | Gewicht | Wirkung auf Dopamin-Formel |
|--------|--------|---------|---------------------------|
| Haupt  | 1      | 3       | Zählt als „relevant"       |
| Hoch   | 2      | 2       | Zählt als „relevant"       |
| Gering | 5      | 1       | Zählt NICHT als relevant   |

**8 mögliche Themen:** Memes 😂 · Gossip 🗣️ · Beauty 💄 · Film 🎬 · Fitness 💪 · Sport ⚽ · Technik 💻 · Lernen 📚

### Feed-Interesse-Ratio
Die Ratio beschreibt den Anteil **relevanter Interessen-Punkte** (Haupt + Hoch) an allen Punkten im Feed.

```
Ratio = relevante Punkte / Gesamtpunkte (Punkte aller 3 Feed-Slots)
```

**Ausnahmen:**
- Karten mit `uninteresting`-Effekt (AI-Slop, Süße Katzen): Punkte zählen zum Total aber nie als relevant → senken die Ratio aktiv
- Karte `Perfekter Flow` im Feed: Ratio ist fix 35% (optimal)

### Dopamin-Zielwert nach Ratio

```
Ratio  0–20%:  Target = 0        (Feed zu irrelevant → Dopamin kollabiert)
Ratio 20–35%:  Target = 80–100   (Anstieg, Sweetspot bei 35%)
Ratio 35–50%:  Target = 100–80   (leicht zu viel Relevanz → leicht abfallend)
Ratio 50–60%:  Target = 50       (zu viel Fokus → monoton)
Ratio  >60%:   Target = 0        (zu einseitig → Dopamin kollabiert)
```

**Bonuswirkung:**
- **Hauptinteresse im Feed:** +5 auf den Target-Wert
- **Triple-ROT-Synergie:** Target ist mindestens 70

### Bereits implementiert
- Interesse-Pyramide (Widget mit Tooltip) zeigt Haupt/Hoch/Gering
- Feed-Ratio-Anzeige (relevant/total in %) mit Farb-Feedback (gut = grün, schlecht = rot)

### Ideen für Visuelles Feedback
- Wenn Hauptinteresse in keiner Feed-Karte vorkommt: Hinweis am Interest-Widget ("Hauptinteresse nicht bedient!")
- Ratio-Bar als Pfeil auf einer Skala statt Zahlen
- Karten, die relevant sind, leuchten beim Einspielen kurz auf

---

## 3. Karten-Effekte – vollständige Liste

### 3.1 Direkte Wirkung (`direkteWirkung`)
Wird sofort beim Spielen der Karte angewendet. Werte werden auf 0–100 begrenzt.

**Sonderfall `reizToOptimal`:** Bewegt die Reizschwelle um N Punkte in Richtung Optimalwert (nicht über/unter diesen hinaus).

**FOMO-Sonderregel:** Bei aktivem FOMO-Event wirken negative `sozialdrang`-Werte von GRÜN-Karten doppelt.

#### ROT – Video
| Karte | direkteWirkung |
|-------|---------------|
| Meme-Video | — |
| Drama-Clip | Sozialdrang +2 |
| Sport-Highlights | Sozialdrang +3 |
| Tech-Review | — |
| Beauty-Tutorial | — |
| Trailer | — |
| AI-Slop | — |
| Süße Katzen | Sozialdrang -10 |
| Mr. Mathe | — |
| Liegestütz-Tutorial | — |
| Sport kommentieren | Sozialdrang -10, Reizschwelle -10 |
| Trailer kommentieren | Sozialdrang -10, Reizschwelle -10 |
| Viraler Hit | — |
| Schock-Content | — |
| Rabbithole | Reizschwelle +30 |

#### GRÜN – Messenger
| Karte | direkteWirkung |
|-------|---------------|
| Gruppenchat | Sozialdrang -12 |
| Foto teilen | Sozialdrang -8 |
| Einladung | Sozialdrang -10 |
| Crush-Anfrage | Sozialdrang +15, Dopamin +30 |
| Push-Nachricht | Sozialdrang -15, Dopamin +10 |
| Neue Gruppe: Geburtstag | Sozialdrang -25 |
| Status checken | Sozialdrang -15 |
| Videocall mit Freunden | — |
| Selfie mit Filter | Sozialdrang -10 |
| Challenge angenommen | Sozialdrang -12 |
| Tech-Support im Chat | Sozialdrang -8 |
| Story-Reaktion | Sozialdrang -10, Dopamin +5 |
| Sprachnachricht | Sozialdrang -20 |
| Like-Regen | Sozialdrang -8 |
| Unbekannte Nummer | Sozialdrang -7 |

#### BLAU – Game
| Karte | direkteWirkung |
|-------|---------------|
| Lootbox | Reizschwelle +6, Dopamin +15 |
| Bonusrunde | Reizschwelle +5, Dopamin +10 |
| Koop-Spiel | Reizschwelle +4, Sozialdrang -5 |
| Neue Features im Spiel | Reizschwelle +15, Sozialdrang -5 |
| Neue Season | Reizschwelle +15 |
| Sport Quiz | Reizschwelle +10 |
| Promi Quiz | Reizschwelle +10 |
| Lootboxen Wahnsinn | Dopamin +25 |
| Tilten | — |
| Makeup-Game | Reizschwelle +10 |
| Fitness-Trainer | Reizschwelle +8 |
| Technik-Puzzle | Reizschwelle +10 |
| Achievement freigeschaltet | Reizschwelle +12, Dopamin +10 |
| Easy Mode | reizToOptimal +10 |
| Ranked Match | Reizschwelle +10 |

#### WEISS – System
| Karte | direkteWirkung |
|-------|---------------|
| Perfekter Flow | — |
| Tausche Handkarten | — |
| Neuer Feed | — |
| Ablenkung | — |
| Kopieren | — |
| Dopamin-Boost | — |
| Soziale Flut | — |
| Overload-Modus | — |

---

### 3.2 Dauer-Effekte im Feed (`effekt`)
Wirken solange die Karte in einem Feed-Slot liegt. Karte verlässt den Feed nach spätestens ~30s (oder wenn neue Karten sie herausschieben).

| Karte | Effekt |
|-------|--------|
| AI-Slop | `uninteresting`: Interessen-Punkte zählen nie als relevant |
| Süße Katzen | `uninteresting`: wie AI-Slop |
| Perfekter Flow | `perfectFlow`: Ratio wird fest auf 35% gesetzt |
| Videocall mit Freunden | `socialFreeze`: Sozialdrang wird auf 0 gehalten |
| Tilten | `reizReset`: Reizschwelle wird jeden Tick auf Optimalwert gesetzt |
| Rabbithole | `rabbithole`: Dopamin ≥ 50 beim Einlegen; Dopamin-Tick-Delta gesperrt |
| Dopamin-Boost | `tickDelta` Dopamin +2/s |
| Soziale Flut | `tickDelta` Sozialdrang -2/s |
| Overload-Modus | `tickDelta` Reizschwelle +2/s |

---

### 3.3 Einmalige Spielmechanik-Effekte (`effekt`)
Karten, die beim Spielen sofort eine Aktion ausführen und **nicht in den Feed** gehen.

| Karte | Effekt |
|-------|--------|
| Tausche Handkarten | Alle 5 Handkarten werden sofort durch neue ersetzt |
| Neuer Feed | Feed wird geleert, 3 Freizüge werden gewährt |
| Ablenkung | Aktives Event sofort beenden (auch bei gesperrten Events spielbar) |
| Kopieren | Wähle eine Feed-Karte → Kopie kommt auf die Hand |

---

### 3.4 Fähigkeiten / Notification-System (`fähigkeit`)
Karten mit `fähigkeit.typ === 'notification'`: Die Fähigkeit wird **nur aktiviert**, wenn beim Spielen **keine Karte desselben Typs im Feed** liegt.

| Karte | Bedingung | Notification-Effekt |
|-------|-----------|---------------------|
| Viraler Hit (ROT) | Kein ROT im Feed | Dopamin +20 |
| Schock-Content (ROT) | Kein ROT im Feed | Reizschwelle +15 |
| Push-Nachricht (GRÜN) | Kein GRÜN im Feed | Dopamin +20 |
| Like-Regen (GRÜN) | Kein GRÜN im Feed | Dopamin +10, Sozialdrang -5 |
| Unbekannte Nummer (GRÜN) | Kein GRÜN im Feed | Dopamin +8, Sozialdrang -6 |
| Easy Mode (BLAU) | Kein BLAU im Feed | reizToOptimal +10 |
| Ranked Match (BLAU) | Kein BLAU im Feed | Sozialdrang -10 |

**Bereits implementiert:** Karten-Detail zeigt "Fähigkeit: Wird aktiviert, wenn keine Karte dieser Farbe im Feed liegt" + Effekt-Anzeige.

---

## 4. Synergie-Effekte (Feed-Kombinationen)

Synergie-Effekte feuern einmalig beim ersten Tick, in dem die Bedingung neu erfüllt wird (Transition von falsch → wahr).

| Synergie | Bedingung | Einmalig-Effekt |
|----------|-----------|-----------------|
| 🌈 Rainbow | ROT + GRÜN + BLAU im Feed | Dopamin +10, Sozialdrang -10, Reizschwelle 10 Schritte Richtung Optimal |
| 🔴 Triple-ROT | 3× ROT im Feed | Dopamin-Target mindestens 70 (passiv, jede Sekunde) |
| 🟢 Triple-GRÜN | 3× GRÜN im Feed | Sozialdrang -1/s statt +1/s |
| 🔵 Triple-BLAU | 3× BLAU im Feed | Optimalwert -5 (erleichtert Reizschwellen-Balance) |

### Bereits implementiert
- Synergie-Berechnung läuft jede Sekunde
- Rainbow und Triple-Blau sind nur "beim ersten Aktivieren" aktiv (Tracking via `_prevRainbowActive`, `_prevTripleBlauActive`)
- Triple-Grün und Triple-Rot wirken passiv jede Sekunde

### Ideen für Visuelles Feedback
- Rainbow: kurze Partikel-Animation / Farbflash im Feed
- Triple-ROT: Feed-Bereich leuchtet rot auf
- Triple-GRÜN: Sozialdrang-Bar zeigt Pfeil nach unten
- Triple-BLAU: Optimalwert-Änderung auf Reizschwellen-Skala animieren

---

## 5. Events

Events werden zu zufälligen Zeiten eingeplant (5 Events insgesamt: 2 erste Hälfte, 3 zweite Hälfte). Jedes Event hat eine Dauer und kann verschiedene Mechaniken beeinflussen.

### Event-Übersicht

| Event | Typ | Dauer | Karten spielbar | Effekte |
|-------|-----|-------|-----------------|---------|
| Kein WLAN | PFLICHT | 15s | ❌ | Keine |
| Sport-Training | OPTIONAL | 10s | ✅ | +4 Sozialdrang/Tick |
| Komische Nachricht | OPTIONAL | 10s | ✅ | -2 Sozialdrang/Tick, -5 Dopamin/Tick |
| Müde | PFLICHT | 10s | ✅ | -2 Dopamin/Tick, -4 Reizschwelle/Tick |
| Staffelfinale | OPTIONAL | 20s | ❌ | Dopamin +2/Tick (min. 30), Sozialdrang eingefroren, Feed-Dopamin bypassed, Reiz-Unterkante bei Optimal-28 |
| Bildschirmzeit | OPTIONAL | 8s | ✅ | -2 Dopamin/Tick, +3 Reizschwelle/Tick |
| FOMO | OPTIONAL | 12s | ✅ | Start: Sozialdrang +20; dann +2/Tick, -2 Dopamin/Tick; GRÜN-Karten wirken doppelt |
| Kurz eingeschlafen | OPTIONAL | 8s | ❌ | Feed + Hand werden sofort geleert |
| Augen brennen | OPTIONAL | 12s | ✅ | +5 Reizschwelle/Tick, -1 Dopamin/Tick, Blur-Effekt auf UI |

### Event-Sonderregeln
- **Ablenkung-Karte** kann bei allen Events gespielt werden, auch wenn Karten gesperrt sind
- **Sozialdrang beim FOMO:** `direkteWirkung.sozialdrang < 0` von GRÜN-Karten wirkt **doppelt**

### Bereits implementiert
- Event-Overlay mit Meldungstext
- Sprite-Wechsel beim Event-Start
- Hand wird gesperrt (keine Karten spielbar) wenn `allowCards = false`
- Augen-Brennen: CSS-`blur`-Klasse auf `body`

### Ideen für Visuelles Feedback
- Event-Overlay: Icon / Sprite des Events größer/zentrierter zeigen
- Laufende Timer-Anzeige für Event-Dauer
- Farbige Umrandung des Spiel-Bereichs je nach Event-Typ
- Bei FOMO: GRÜN-Karten visuell hervorheben (z.B. Glow)

---

## 6. Passive Zeiteffekte (unabhängig von Karten/Events)

### Tick (jede Sekunde)
| Mechanik | Wirkung |
|----------|---------|
| Sozialdrang | +1/s (außer Triple-GRÜN: -1/s) |
| Reizschwelle | -0.5/s (natürlicher Abbau) |
| Optimalwert | +5 alle 20s (max. 95) |

### Feed-Ausblenden (ohne Karte spielen)
Nach 30s, 35s, 40s ohne gespielte Karte: jeweils 1 Feed-Slot wird geleert (älteste zuerst).

---

## 7. Recovery-System

Wenn Dopamin auf 0 geht: Spieler bekommt **max. 2 Chancen**, zurückzukommen.

1. Sprite läuft zur Hälfte des Raums
2. Spieler hat 10 Sekunden Zeit, eine Karte zu spielen
3. Wenn danach alle Werte in der Survival-Zone → Sprite kehrt zurück, Spiel geht weiter
4. Andernfalls oder nach 2 Versuchen: Game Over

**Survival-Zone:** Dopamin > 0, Sozialdrang < 100, `|Reizschwelle - Optimalwert| ≤ 30`

---

## 8. Gesamtübersicht: Was beeinflusst was?

| Wert | Erhöht durch | Gesenkt durch |
|------|-------------|---------------|
| **Dopamin** | Karten mit dopamin+ (Crush, Lootbox, etc.), gute Ratio, Hauptinteresse im Feed, Synergien | Schlechte Ratio (0 oder >60%), Events, Rabbithole blockiert |
| **Sozialdrang** | Passiv +1/s, Events, Drama-Clip, Sport-Highlights, Crush-Anfrage | GRÜN-Karten, Synergien, socialFreeze-Effekt |
| **Reizschwelle** | BLAU-Karten (alle), Rabbithole +30, Events, tickDelta | Passiv -0.5/s, reizReset (Tilten), Sport/Trailer kommentieren |
| **Optimalwert** | Passiv +5 alle 20s | Triple-BLAU -5 |

---

## 9. Bereits implementiertes Visuelles Feedback

| Element | Beschreibung |
|---------|-------------|
| Statusbar-Marker | Dopamin, Sozialdrang, Reizschwelle als Positionsmarker auf Skalen |
| Reizschwellen-Gradient | Grün/Orange/Rot je nach Distanz zum Optimalwert |
| Dopamin-kritisch | Bar/Marker pulsiert rot bei Dopamin < 30 |
| Feed-Ratio-Anzeige | Prozent relevant/gesamt, grün bei gut (20–50%), rot sonst |
| Karten: Interesse-Highlighting | Relevante Interesse-Punkte auf Karten farbig hervorgehoben |
| Karten: Kompakt- & Detail-Ansicht | Wirkungen, Effekte, Fähigkeiten lesbar |
| Feed-Drop-Zone | Feed-Bereich leuchtet beim Karte-Ziehen auf |
| Spielfenster-Bar | Zeigt Cooldown und Status (offen/geschlossen/Freizug) |
| Event-Overlay | Text-Meldung mit Event-Beschreibung |
| Blur-Effekt | Bei "Augen brennen"-Event verschwimmt die UI |
| Interesse-Pyramide | Widget zeigt Haupt/Hoch/Gering mit Tooltip |
| Hintergrund-Wechsel | Tag/Abend/Nacht je nach Ingame-Zeit |
| Sprite-Animation | Idle/Müde je nach Tageszeit; Lauf/Bett-Animation bei Game Over |

---

## 10. Ideen für neues Visuelles Feedback

### Karten spielen
- **Dopamin-Flash:** Wenn eine Karte Dopamin erhöht → kurzer grüner Aufblitz auf der Dopamin-Bar
- **Sozialdrang-Arrow:** Bei großer Sozialdrang-Änderung → kurzer Pfeil nach oben/unten auf Bar
- **Reizschwelle-Warnton/-Shake:** Bei Reizschwelle weit vom Optimum → leichte Vibration des Reiz-Bereichs
- **Karte-Effekt-Label:** Beim Einlegen einer Karte kurz sichtbares "+30 Dopamin"-Label über dem Feed-Slot

### Feed-Zustand
- **Notification-Badge:** Wenn Fähigkeit (Notification) aktiviert wurde → kleines Icon kurz aufpoppen
- **Uninteresting-Overlay:** AI-Slop/Katzen-Karten im Feed mit einem Grauskalierung oder "😴"-Badge
- **Rabbithole-Indikator:** Wenn Rabbithole aktiv → Dopamin-Bar eingefroren (z.B. Schloss-Icon)
- **PerfectFlow-Glow:** Wenn Perfekter Flow aktiv → Feed-Panel grüner Rand

### Synergie-Feedback
- **Rainbow-Flash:** Kurzer Regenbogen-Effekt über dem Feed bei Aktivierung
- **Triple-ROT:** Feed-Hintergrund leuchtet rot, solange Triple-ROT aktiv
- **Triple-GRÜN:** Sozialdrang-Bar zeigt kleinen Pfeil nach unten (passiv-Richtung)
- **Triple-BLAU:** Optimalwert-Marker auf Reiz-Skala kurz animieren wenn er sinkt

### Events
- **Event-Timer:** Countdown-Anzeige wie viele Sekunden das Event noch dauert
- **FOMO-Highlight:** GRÜN-Karten bekommen Glow-Effekt bei aktivem FOMO
- **Müde-Effekt:** Leichte Abdunkelung / gesättigtere Farben bei "Müde"-Event
- **Kein-WLAN-Effekt:** Hand ausgegraut/gesperrt visuell stärker sichtbar

### Globale Feedback-Systeme
- **Wert-Verlauf-Mini-Graph:** Kleiner Kurven-Graph der letzten 30s für jeden Basiswert
- **Score-Display:** Laufende Punkte-Anzeige (Dopamin × Zeit o.ä.)
- **Optimalwert-Drift-Anzeige:** Kleiner Pfeil der zeigt: "Wird schwerer" wenn Optimalwert steigt
