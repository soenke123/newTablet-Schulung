# Task 4 — Der Regenbogen-Pfad

Konzept für die vorletzte Aufgabe der Einhornkatzen-Legi-Reihe (Season 3).
Task 4 entscheidet, **welche Katzen-Variante** der Spieler final bekommt: Regenbogen, Hell oder Dunkel. Diese Entscheidung ist **unumkehrbar** und lässt sich nicht zurücksetzen.

---

## 1. Kontext & Einordnung

- **Voraussetzung:** Tasks 1–3 abgeschlossen (Growth 12 → Stage 3), Cluster hat sein Bonbon-Ziel erreicht, Legi wurde per `claim_cluster_legi()` gerevealed.
- **Ergebnis von Task 4:** Growth = 21 (Stage 4). Die Katzen-Variante ist ab jetzt festgelegt.
- **Task 5** wird eine gemeinsame, für alle gleiche Aufgabe (relativ schwer) und führt zu Growth = 100 (Vollendet).

**Sprites & Assets:** Standard-Regenbogen-Einhornkatze, Dark-Variante (Regenseite), Light-Variante (Sonnenseite) plus passende Avatare — werden vom User erstellt.

---

## 2. Konzept-Kern

Ein **Story-Choice-Adventure im Chat-Stil**:

- Die Einhornkatze (in Stage-3-Form) sitzt am Rand des Bildes.
- Über ihr eine **Sprechblase** mit der Frage.
- Im **Hintergrund** ein Szenenbild (illustriert die Situation).
- **Unten drei Antwort-Optionen**, alle gleichwertig — **keine „richtigen" Antworten**.
- Jede Antwort füllt still eine von drei Skalen: ☀️ hell · 🌙 dunkel · 🌈 bunt.
- Die Skalen sind **unsichtbar** — kein Balken, kein Hinweis.
- Am Ende die **Farbfrage**, die die letzte Antwort ist *und* den Übergang zur Wahl markiert.

**Dauer:** 4–5 min (9 Fragen à ~30 Sek).

**Botschaft:** Deine Handlungen wiegen mehr als dein Selbstbild — wenn du 5× dunkel antwortest und dich am Ende bewusst für „Regenbogen" entscheidest, bekommst du trotzdem Dark. Das kommuniziert die Aufgabe still, ohne moralisch zu werden.

---

## 3. Ausgangs-Varianten

| Variante | Skala | Persönlichkeitston |
|---|---|---|
| **Regenbogen-Einhornkatze** | 🌈 bunt | neugierig, ausgleichend, spielerisch, vielseitig |
| **Light-Einhornkatze** (Sonnenseite) | ☀️ hell | warm, offen, vertrauensvoll, hilfsbereit |
| **Dark-Einhornkatze** (Regenseite) | 🌙 dunkel | kritisch, tief, still, geheimnisvoll |

Passende Avatare sollen jeweils mit freigeschaltet werden.

---

## 4. Ablauf & Reihenfolge

**Vorgeschlagene Dramaturgie:** vom Außen (andere Menschen, Feed) ins Innen (Nacht, Selbstwert, Bilanz). Die Katze wird immer nachdenklicher, je näher der Übergang.

1. Datenformate (sanfter Einstieg, jemandem helfen)
2. Statistik-Verzerrung (öffentliches Urteil)
3. Dark Patterns (Manipulation erkennen)
4. Filter Bubble (Feed hinterfragen)
5. Vergleich / Selbstwert (erste innere Frage)
6. Datenschutz (Grenze setzen)
7. Bildschirmzeit-Moment 23:47 Uhr (nachts, allein)
8. Bildschirmzeit-Reflexion (Wochenrückblick)
9. Farbfrage (Übergang zur Katzenwahl)

---

## 5. Die Fragen im Detail

Antwort-Zuordnung in dieser Datei fix: ☀️ / 🌙 / 🌈. **Im Spiel sollten die Positionen pro Frage gemischt werden**, sonst rät man.

| # | Szene (Hintergrundbild) | Katzenfrage (Sprechblase) | Antworten |
|---|---|---|---|
| 1 | **Datenformate** — Oma sitzt vor Laptop, überquellender Speicher-Warnhinweis | „Deine Oma will das Video vom Familienfest sehen. Es ist viel zu groß. Was tust du?" | ☀️ *Ich mach's klein und schreib ihr, wie sie's öffnet.* <br>🌙 *Ich frag mich, ob sie's überhaupt lernen will.* <br>🌈 *Ich schneid ihr die schönsten Momente raus.* |
| 2 | **Statistik-Verzerrung** — Post im Feed: „95% der Jugendlichen süchtig!" mit Balkendiagramm | „Diese Zahl — was macht sie mit dir?" | ☀️ *Ich teile sie, das müssen mehr Leute sehen.* <br>🌙 *Ich such die Studie, bevor ich das glaube.* <br>🌈 *Ich frag Freundinnen, ob sie sich so fühlen.* |
| 3 | **Dark Patterns** — App-Dialog, „Zulassen" bunt-blinkend, „Ablehnen" hellgrau daneben | „Der eine Knopf schreit dich an. Der andere versteckt sich." | ☀️ *Ich lass es zu, vielleicht bringt's was.* <br>🌙 *Ich klick 'Ablehnen', das ist manipulativ.* <br>🌈 *Ich lese erst genau, was da wirklich steht.* |
| 4 | **Filter Bubble** — Feed voll mit derselben Meinung, immer und immer wieder | „Dein Feed zeigt dir nur noch eine Seite. Fühlt sich vertraut an." | ☀️ *Ich vertraue dem — der Algorithmus kennt mich.* <br>🌙 *Ich pausier alles, das rauscht mich zu.* <br>🌈 *Ich such bewusst nach Gegenmeinungen.* |
| 5 | **Vergleich / Selbstwert** — Influencer-Post, „perfekter Morgen", Sonnenlicht, Yoga | „So harmonisch und gut gelaunt. Was fühlst du?" | ☀️ *Ich freu mich für sie / berührt mich nicht.* <br>🌙 *Ich weiß, das wurde 30-mal aufgenommen, und dass nicht jeder Morgen so bei ihr ist.* <br>🌈 *Ich klau mir eine Idee für meinen Morgen.* |
| 6 | **Datenschutz** — Freund hält Handy hoch für Selfie, Story-App offen | „Er will dich in seine Story stellen. Ohne zu fragen." | ☀️ *Klar, mach ruhig.* <br>🌙 *Nein, nicht öffentlich.* <br>🌈 *Zeig mir kurz, was du postest.* |
| 7 | **Algorithm / Bildschirmzeit** — Bett, 23:47 Uhr, Handy leuchtet ins Gesicht | „Noch eins — oder Schluss für heute?" | ☀️ *Handy weg, morgen ist auch ein Tag.* <br>🌙 *Es ist eh schon zu spät. Noch ein Video schadet nicht.* <br>🌈 *Nur noch dieses Thema zu Ende, dann Schluss.* |
| 8 | **Reflexion Bildschirmzeit** — Wochenreport-Screen: 42 h Bildschirmzeit | „Mehr als geplant. Wieder mal." | ☀️ *Nächste Woche schaff ich weniger, versprochen.* <br>🌙 *Ich lösch heute Abend die App, die am meisten frisst.* <br>🌈 *Ich guck, welche Stunden okay waren und welche mich frustriert haben.* |
| 9 | **Farbwahl** — Katze schaut direkt an, Regenbogen bricht am Himmel auf | „Ganz zum Schluss: Welche Farbe passt zu dir?" | ☀️ *Alles was hell ist — warm, klar, offen.* <br>🌙 *Alles was dunkel ist — tief, ruhig, geheimnisvoll.* <br>🌈 *Alle Farben des Regenbogens — bunt und vielseitig.* |

---

## 6. Skalen-Logik & Tiebreaker

- Jede Antwort füllt genau eine der drei Skalen um +1.
- Nach Frage 9 wird die Skala mit dem höchsten Wert gewählt.
- **Bei Gleichstand entscheidet Frage 9 (Farbfrage).** Da sie selbst als vollwertige Antwort mitzählt, kippt sie den Gleichstand automatisch — außer im Extremfall 2-2-2 vor Farbfrage, aus dem wird 3-2-2 danach.
- **Sonderfall:** Wenn alle drei Skalen nach Frage 9 gleich sind (theoretisch nicht möglich bei 9 Antworten, aber falls Fragezahl irgendwann geändert wird): Farbfrage-Wert gewinnt.

---

## 7. UX-Details

- **Kein Zurück-Button.** Jede Antwort ist final — passt zur „unumkehrbar"-Note.
- **Antwort-Optionen neutral gestaltet** (kein Farbcode), damit man nicht rät welche Antwort welche Skala füllt.
- **Nur Frage 9 ist farbig gestaltet** — sie markiert bewusst den Übergangsmoment.
- **Reveal-Animation nach Frage 9:** analog zu `showLegiRevealAnimation()`, aber als zweiter Reveal — die Katze in Stage-3-Form → Blitz/Nebel → Verwandlung zur finalen Variante. Idealerweise gleiche Bühnen-Optik wie erster Reveal (Callback-Gefühl).
- **Bestätigungs-Dialog vor Frage 9?** Optional: „Bist du sicher? Diese Wahl bleibt." — nur bei Frage 9, nicht bei den anderen.
- **Katzen-Position:** sitzt am Rand des Bildes (User-Vorgabe), Szenenbild dahinter.

---

## 8. Persistenz-Notiz (fürs Umsetzen)

Die gewählte Variante muss **hart persistiert** werden, z.B.:

```
game_state[game16].variant = 'rainbow' | 'light' | 'dark'
```

Sonst rendert `getCreatureHTML(creature, stage)` überall die Standard-Katze (Hub-Kachel, Gallery, Task-Modal, Highscore-Reiter). Persistenz muss über Server-RPC laufen (idempotent), damit F5 mitten in der Reveal-Animation nicht die Wahl verliert.

---

## 9. Offene Fragen

1. **Reihenfolge der Fragen** — mein Vorschlag oben ist ein Vorschlag, noch nicht bestätigt.

2. **Frage 3 ☀️-Antwort** („Ich lass es zu, vielleicht bringt's was") und **Frage 4 ☀️-Antwort** („Ich vertraue dem Algorithmus") wirken eher **naiv-vertrauensvoll** als warmherzig-hilfsbereit. Wer die Light-Katze bekommt, ist im Ergebnis „vertrauensvoll bis manchmal unkritisch". Passt das zur Botschaft der hellen Katze — oder soll sie eher „fürsorglich/hilfsbereit" sein? Falls letzteres: Frage 3 und 4 nochmal drehen.

3. **Frage 5 ☀️-Antwort** enthält aktuell zwei Sätze („Ich freu mich für sie / berührt mich nicht"). Das sind emotional zwei verschiedene Haltungen. Auf eine reduzieren? „Berührt mich nicht" ist eher 🌙-Territorium (Distanz).

4. **Ist Frage 9 vor der Anzeige der Auswahl der Katze?** — Vorschlag: ja. Frage 9 wird beantwortet → sofort Reveal-Animation → Katze in gewählter Farbe. Kein Zwischen-Screen „Deine Wahl wird berechnet…".

5. **Was, wenn der User die Seite mitten im Pfad neu lädt?**
   - Antworten zwischen-speichern und Fortschritt wiederherstellen (fair, aber komplex)?
   - Von vorn beginnen (einfach, aber ärgerlich)?
   - Vermutlich: Zwischen-Speichern in `game_state[game16].pathProgress`, jede Antwort persistiert sofort.

6. **Sound / Musik?** — Chat-Feel wäre mit weichem Ambient-Sound stark. Aber kein Sound = kein Setup-Aufwand. Offen.

7. **Bestätigungs-Dialog vor Frage 9** — ja oder nein? Kann sich schwer anfühlen, dagegen: klare Grenzsetzung.

---

## 10. Task 5 — Ausblick

Task 5 ist die **letzte, für alle gleiche** Aufgabe, die zu Stage 5 (Vollendet, Growth 100) führt. Relativ schwer. Konzept steht noch aus.

Randbedingungen aus dem Gespräch:
- Task 5 ist unabhängig von der Katzen-Variante (alle drei Varianten durchlaufen dieselbe Aufgabe).
- Führt zur legendären Endform der jeweils gewählten Variante.

---

*Erarbeitet im Brainstorm mit Sönke, 2026-07-19. Task 1–3 werden parallel von einer anderen Session bearbeitet.*
