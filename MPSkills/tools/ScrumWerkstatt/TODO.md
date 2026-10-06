# Scrum Werkstatt — offene Punkte

Stand: 2026-10-06. Bezug: `index.html` (früher `scrum-werkstatt.html`). Seit Migration 0196
läuft die Werkstatt im MPSkills-Raum (ein Raum = ein Team); allein geöffnet speichert sie
weiter im localStorage. Zeilennummern unten stammen vom Prototyp und stimmen nicht mehr.

## ✅ Erledigt mit 0196 (Überführung nach MPSkills)

- [x] **Mehrgeräte-Sync** — Stand auf dem Server, eine Zeile je Objekt mit Versionsnummer
      (`scrum_items`), Konflikte werden erkannt statt still überschrieben (`bridge.js`, `tool.js`)
- [x] **Mehrere Gruppen** — jede Gruppe ist ein eigener Raum (bis zu 30 je Lehrkraft)
- [x] Beitritt: Name → „Ich bin im Team" (Kachel + persönlicher Code) oder „Ich schaue nur zu"
- [x] Persönlicher Wiedereinstiegscode (8 Zeichen) — jedes Gerät, ohne Konto, auch bei geschlossener Tür;
      Lehrkraft sieht alle Codes und kann einen neu vergeben
- [x] Burndown-**Log** (`scrum_burndown`, täglich, Europe/Berlin) — die Daten sammeln sich ab jetzt;
      das Chart selbst steht noch aus (Punkt 3)
- [x] Handy-Ansicht (Spaltenwahl auf dem Board, schlankes Backlog, Dialoge im Vollbild)

## ✅ Erledigt 06.10.2026 (Wünsche Sönke)

- [x] Kachel unter „Informatik" (Migration 0197)
- [x] Neue Story: ohne Zuständig/Sprint; Freitext statt drei Formel-Feldern (`s.text`,
      vorbelegt mit „Als … möchte ich …, damit …."; alte Karten zeigen ihre Formel weiter)
- [x] Zettelfarbe als vier Farbkacheln (Gelb voreingestellt)
- [x] Board: „Blockiert" steht vor „In Arbeit"
- [x] Zusammenarbeit: Person auf Person ziehen (oder antippen) → gemeinsame Bahn
      (`S.product.pairs`, Mitarbeitende einer Story in `s.mates`); wieder lösen über die
      Fläche unter den Bahnen. Eine Bahn macht genau eine Story — überzählige gehen
      beim Zusammenlegen zurück ins Sprint Backlog

## ✅ Erledigt 06.10.2026 (Runde 2)

- [x] Spalte „Prüfen“ entfällt (alte Karten → „In Arbeit“)
- [x] Definition of Done entfällt; stattdessen **Tasks** je Story (`s.tasks`, alte `s.dod` wird migriert) —
      jede Person kann anlegen, abhaken (ausgegraut) und löschen
- [x] Kopfzeile mit mehr Seitenabstand; Loop-Logo statt „S“

## ❓ Offen zur Entscheidung: Rechte und Rollen

Bisher darf jedes Teammitglied alles; Beobachter und Lehrkraft lesen nur.
- Soll der Product Owner allein das Backlog sortieren?
- Soll nur der Scrum Master Blockaden lösen / den Sprint abschließen?
- Soll die Lehrkraft kommentieren können (pro Karte, pro Sprint)?

**Vereinbarte Reihenfolge:** erst (1) Definition of Done, dann (2) Story-Tasks —
die Tasks hängen am Datenmodell und werden später teurer.

---

## 1 · Team-weite Definition of Done + Tor vor „Fertig"

- [ ] Ort schaffen, wo das Team **eine** DoD für alle Karten formuliert
      (Vorschlag: eigener Block in der Team- oder Product-Goal-Ansicht; im State
      z. B. `S.product.dod: [{text}]`)
- [ ] Neue Stories erben die Team-DoD statt der zwei hartcodierten Defaults
      (`scrum-werkstatt.html:1950`)
- [ ] Story-eigene Zusatzkriterien weiter möglich (Team-DoD + Story-Kriterien getrennt zeigen)
- [ ] **Tor:** Karte darf nur nach „Fertig", wenn alle Häkchen gesetzt sind
      — Drop blockieren (`:1594`), Status-Dropdown im Detail blockieren (`:1893`),
      mit erklärendem Toast statt stiller Ablehnung
- [ ] Spaltenhinweis „Alle DoD-Häkchen gesetzt" (`:1256`) stimmt dann auch wirklich

*Warum zuerst:* wenig Code, verändert das Verhalten am Board sofort und erzwingt
ein Teamgespräch, das sonst nie stattfindet.

## 2 · Tasks innerhalb einer Story

- [ ] Story bekommt Unteraufgaben mit eigener Zuständigkeit
      (`tasks: [{id, text, assignee, done}]`)
- [ ] Post-it zeigt Task-Fortschritt (z. B. `2/4`) neben dem DoD-Zähler (`:1554`)
- [ ] Zuständigkeit pro Task ziehbar — Selbstorganisation wird erst dadurch sichtbar
      (heute: genau eine Person pro Story)
- [ ] Modell so wählen, dass es eine späte Mehrgeräte-Sync in MPSkills nicht verbaut

## 3 · Burndown / Sprint-Verlauf

- [x] Tägliches Mini-Log: Datum → offene SP — im Raum über `scrum_burndown` (0196),
      in der Ansicht unter `SW.burndown`
- [ ] Burndown-Chart in der Sprint-Ansicht: Ideallinie vs. Ist
- [ ] Heutiger Fortschrittsbalken (`:1462`) ist rein kalendarisch — daneben stellen
- [ ] Im Archiv den Verlauf des abgeschlossenen Sprints mitspeichern

## 4 · Retro-Kreis schließen

- [ ] „🎯 Nehmen wir uns vor" (`#rvNext`) in der **nächsten** Sprint-Planung wieder einblenden
- [ ] Abfrage: hat's geklappt? (ja / teilweise / nein) — Antwort ans Archiv hängen
- [ ] Offene Retro-Maßnahme ggf. in den neuen Sprint übernehmen

---

## Zweite Reihe

- [ ] **Impediment-Liste für den Scrum Master** — Übersicht aller Blockaden:
      was, seit wann, wer kümmert sich. Heute nur Flag + Notiz pro Karte (`:1853`),
      keine Sammelansicht; die SM-Rolle ist bisher nur ein Etikett.
- [ ] **Schätzen als Ritual (Planning Poker)** — heute setzt eine Person die SP im
      Dropdown (`:1026`). Der Witz relativer Schätzung ist gleichzeitiges Aufdecken
      und die Diskussion danach.
- [ ] **Akzeptanzkriterien pro Story** — „wann ist *diese* Karte richtig?" fehlt;
      die Story-Formel sagt nur *warum*. Aktuell macht das DoD-Feld beides.
- [ ] **Definition of Ready / Refinement** — nichts verhindert, dass eine unklare
      8-SP-Story in den Sprint wandert.
- [ ] **Termine der Scrum-Events** — Sprint hat Start/Ende, aber Planung, Daily und
      Review haben keine Uhrzeit („dienstags 5. Stunde").
- [ ] **WIP-Limit pro Spalte** — „nicht alles gleichzeitig anfangen" ist bisher nur
      ein guter Vorsatz.

## Praktisch (kein Scrum-Inhalt)

- [x] **Mehrere Gruppen auf einem Gerät** — im Raum: ein Raum je Gruppe (0196)
- [ ] **Undo** für versehentliche Statuswechsel und Löschungen
- [ ] **Druckansicht prüfen** (`:647`) — taugt das Archiv als Anhang einer Facharbeit?
- [x] **Mehrgeräte-Sync** — Überführung nach MPSkills (0196)
