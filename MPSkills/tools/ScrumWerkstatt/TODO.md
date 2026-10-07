# Scrum Werkstatt — offene Punkte

Stand: 2026-10-07. Bezug: `index.html` (früher `scrum-werkstatt.html`). Seit Migration 0196
läuft die Werkstatt im MPSkills-Raum (ein Raum = ein Team); allein geöffnet speichert sie
weiter im localStorage. Zeilennummern wurden entfernt (stammten vom Prototyp).

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

## ✅ Erledigt 06.10.2026 (Runde 3: Rollen und Backup, Migration 0198)

- [x] Kopf rechts: Name + Status in zwei Zeilen (Entwickler-Team / Scrum Master / Product Owner,
      Raum-Besitzer, „beobachtet"); Beobachter haben kein Menü und können nicht mehr ins Team wechseln
- [x] Mitglieder: Code zeigen · Export · Druck. Raum-Besitzer zusätzlich: alle Codes, Import,
      Backups, Zurücksetzen — und er schreibt am Board wie ein Mitglied
- [x] Wöchentliches Backup, nur wenn jemand im Raum ist und das letzte älter als 7 Tage ist
      (letzte 8 bleiben); vor Zurücksetzen/Einspielen ein Backup „vor Änderung". Download und
      Einspielen (auch in einem neuen Raum) über das Menü „Backups" bzw. „Import"

## ✅ Erledigt 06.10.2026 (Runde 4)

- [x] Persönlicher Code steht nicht mehr im Team (nur noch Menü oben rechts)
- [x] Product Owner / Scrum Master mit Icon statt Initialen
- [x] Ganze Story-Karte (Board und Backlog-Zeile) öffnet die Story; Ziehen bleibt
- [x] Prio: Nummern + Griff zum Ziehen (Zeiger, auch Touch); Fertige ohne Prio, bei „Prio“ ganz unten
- [x] Backlog: alle Mitglieder filtern, Sortieren per Klick auf die Spaltenköpfe
- [x] Sprint-Filter mit Mehrfachauswahl; Standard = aktueller Sprint + „noch nicht zugewiesen“
- [x] Tasks im Story-Dialog (zweite Spalte, PO); Devs bei Stories im Sprint
- [x] Keine Standard-Tasks mehr im Demo-Bestand
- [x] Kategorien-Dialog im Backlog (`S.product.categories`, Standard: Entwickeln, Planen, Design)

## ✅ Bereits umgesetzt (stand hier noch als offen)

- [x] Product Backlog bearbeitet im Raum nur der Product Owner (und der Raum-Besitzer);
      alle anderen lesen nur (`canEditPO()`, `body.nopo`)
- [x] Definition of Done entfällt, stattdessen Tasks je Story (siehe Runde 2); damit auch
      kein „Tor vor Fertig" mehr
- [x] Post-it zeigt die Tasks samt Häkchen (`.pi-tasks`)

## ✅ Erledigt 07.10.2026 (Runde 5)

- [x] Product Backlog für Nicht-PO ausgegraut statt versteckt (Neue Story, Kategorien, Stift, Griff);
      Story aus dem Backlog geöffnet ist für sie nur lesbar; Hinweis oben im Backlog
- [x] Product Goal: das ganze Team arbeitet daran; die Lehrkraft (Raum-Besitzer) kann es mit
      „Product Goal fixieren" sperren (`S.product.goalLocked`) und mit „Product Goal öffnen" freigeben

- [x] Product Goal ist im Raum ein eigenes Objekt (`product/goal`: Text, Bilder, Fixierung), der Rest
      bleibt in `product/main` (Migration 0199, Trennung in `bridge.js`). Wer am Goal schreibt,
      kollidiert nicht mehr mit Paarungen am Board; alte Räume wandern beim nächsten Speichern
- [ ] Beim Goal: Konflikt-Rückfrage statt stillem Verwerfen („Dein Text liegt im Zwischenspeicher")
      — erst angehen, wenn es im Unterricht auffällt

## ❓ Offen zur Entscheidung: Rechte und Rollen

Bisher darf jedes Teammitglied Board, Blockaden und Sprint-Abschluss bedienen; Beobachter
und Lehrkraft lesen nur (Raum-Besitzer schreibt am Board mit).
- Soll nur der Scrum Master Blockaden lösen / den Sprint abschließen?
- Soll die Lehrkraft kommentieren können (pro Karte, pro Sprint)?

---

## 1 · Tasks mit eigener Zuständigkeit

Tasks gibt es (`s.tasks: [{text, done}]`), aber ohne Zuständigkeit.
- [ ] Task bekommt `assignee` (`tasks: [{id, text, assignee, done}]`), pro Task ziehbar —
      Selbstorganisation wird erst dadurch sichtbar (heute: genau eine Person pro Story)
- [ ] Post-it zeigt Task-Fortschritt als Zähler (z. B. `2/4`), nicht nur die Liste
- [ ] Task-Ids vergeben, damit der Mehrgeräte-Sync einzelne Tasks sauber zusammenführt

## 2 · Burndown / Sprint-Verlauf

- [x] Tägliches Mini-Log: Datum → offene SP — im Raum über `scrum_burndown` (0196),
      in der Ansicht unter `SW.burndown`
- [ ] Burndown-Chart in der Sprint-Ansicht: Ideallinie vs. Ist
- [ ] Heutiger Fortschrittsbalken ist rein kalendarisch — daneben stellen
- [ ] Im Archiv den Verlauf des abgeschlossenen Sprints mitspeichern

## 3 · Retro-Kreis schließen

- [ ] „🎯 Nehmen wir uns vor" (`#rvNext`) in der **nächsten** Sprint-Planung wieder einblenden
- [ ] Abfrage: hat's geklappt? (ja / teilweise / nein) — Antwort ans Archiv hängen
- [ ] Offene Retro-Maßnahme ggf. in den neuen Sprint übernehmen

---

## Zweite Reihe

- [ ] **Impediment-Liste für den Scrum Master** — Übersicht aller Blockaden:
      was, seit wann, wer kümmert sich. Heute nur Flag + Notiz pro Karte,
      keine Sammelansicht; die SM-Rolle ist bisher nur ein Etikett.
- [ ] **Schätzen als Ritual (Planning Poker)** — heute setzt eine Person die SP im
      Dropdown. Der Witz relativer Schätzung ist gleichzeitiges Aufdecken
      und die Diskussion danach.
- [ ] **Akzeptanzkriterien pro Story** — „wann ist *diese* Karte richtig?" fehlt;
      die Story-Formel sagt nur *warum*; Tasks sind Arbeitsschritte, keine Kriterien.
- [ ] **Definition of Ready / Refinement** — nichts verhindert, dass eine unklare
      8-SP-Story in den Sprint wandert.
- [ ] **Termine der Scrum-Events** — Sprint hat Start/Ende, aber Planung, Daily und
      Review haben keine Uhrzeit („dienstags 5. Stunde").
- [ ] **WIP-Limit pro Spalte** — „nicht alles gleichzeitig anfangen" ist bisher nur
      ein guter Vorsatz.

## Praktisch (kein Scrum-Inhalt)

- [x] **Mehrere Gruppen auf einem Gerät** — im Raum: ein Raum je Gruppe (0196)
- [ ] **Undo** für versehentliche Statuswechsel und Löschungen
- [ ] **Druckansicht prüfen** — taugt das Archiv als Anhang einer Facharbeit?
- [x] **Mehrgeräte-Sync** — Überführung nach MPSkills (0196)
