# Scrum Werkstatt — offene Punkte

Stand: 2026-10-04. Bezug: `scrum-werkstatt.html` (Einzelgerät-Prototyp, localStorage).
Zeilennummern beziehen sich auf den Stand von heute und können verrutschen.

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

- [ ] Tägliches Mini-Log im State: Datum → offene SP (**früh einbauen,
      nachträglich nicht rekonstruierbar**)
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

- [ ] **Mehrere Gruppen auf einem Gerät** — ein `localStorage`-Key = ein Projekt
      (`:1249`); auf einem Lehrer-Tablet lässt sich nur eine Gruppe führen.
- [ ] **Undo** für versehentliche Statuswechsel und Löschungen
- [ ] **Druckansicht prüfen** (`:647`) — taugt das Archiv als Anhang einer Facharbeit?
- [ ] **Mehrgeräte-Sync** — bewusst Schritt 2: Überführung nach MPSkills
      (`lib/room.js`, `lib/qr.js`, `lehrer.js`)
