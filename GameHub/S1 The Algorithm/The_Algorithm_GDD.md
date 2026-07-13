# Projekt-Dokumentation: THE ALGORITHM

## 1. Vision & Core Loop
**Thema:** Du bist ein digitaler Parasit (Smartphone-Algorithmus).
**Ziel:** Halte den "User" so lange wie möglich online, indem du sein Dopamin-System manipulierst und gegen externe Lebensereignisse ankämpfst.
**Der User:** Wird durch einen "Schweinehund" dargestellt, der am Handy sitzt.
**Genre:** Ressourcen-Management / Strategy / Card-Sim.

---

## 2. Technische Anforderungen (Stack) & Grafik
- **Frontend:** HTML5, CSS3 (Modern Flexbox/Grid), JavaScript (ES6+).
- **State Management:** Zentrales Objekt für User-Werte (Dopamin, Sättigung, etc.).
- **Rendering:** DOM-Manipulation oder Canvas.
- **Sprites & Animation (Schweinehund der User):**
    - **Idle/Standard:** 4 wechselnde Sprites, die sich am Handy abwechseln.
    - **Event-Animation:** Sprites, bei denen er nachdenkt (wenn ein Event eintritt).
    - **Lauf-Animation:** 4 Sprites für die Bewegung.
    - **Zustandsspezifisch:** Sprites für Müdigkeit und ein spezieller "Gewonnen"-Sprite.
    - **Movement-Logik:** Bis 22:30 Uhr geht er rechts aus der Tür, ab 22:30 Uhr geht er links ins Bett.

---

## 3. Die 4 Kernwerte (Status-System)
| Name | Funktion |
| :--- | :--- |
| **Dopamin** | Überlebenswert. Sinkt stetig. Bei 0 = Game Over. |
| **Balance** | Skala zw. Trägheit & Rastlosigkeit. Idealbereich: 40-60%. |
| **Reizsättigung** | Permanenter Schwierigkeits-Multiplier. Muss durch Karten minimiert werden. |
| **Sozialerdrang** | Es gibt reale soziale Kontakte. Diese müssen durch Koop-Spiele und Messenger gedrückt werden. |

---

## 4. Interessen-System & Mechanik
Beim Start werden Interessen zufällig generiert (1x Haupt, 2x Hoch, 5x Gering).
- *Themen:* Memes, Gossip, Beauty, Film, Fitness, Sport, Technik, Lernen.

Visualisierung: Die Interessen werden in einem Dreieck und passenden Icons dargestellt.



## 5. Karten-System (Deck-Mechanik)
Der Spieler hat 6 Karten auf der Hand. Alle 10s kann eine Karte in den "Feed" (3 Slots) gespielt werden.

### Kategorien:
1.  **ROT (Video):** Fokus auf Dopamin & Interessen. Bei zu langer Nutzung steigt der Sozialdruck.
2.  **GRÜN (Messenger):** Reduziert Sozialdruck. Bindung durch Gespräche, Freundes-Einladungen, Gruppenchats und Fototeilen.
3.  **BLAU (Game):** Hohe Bindung (stoppt Dopamin-Abfall kurz), erhöht aber Reizsättigung und Balance-Schwierigkeit massiv. Enthält Lootboxen und Bonusrunden.
4.  **WEISS (System):** Modifikatoren (z.B. Push-Nachrichten, Doppeltes Dopamin für 20s).

*Hinweis: Dauernde Wechsel zwischen den Kategorien steigern das Reizbedürfnis.*

---

## 6. Zeit-Skalierung & Events
- **Echtzeit:** 8 Minuten (480s). 10s Echtzeit = 15 Min Ingame.
- **Zeitplan:** 15:00 bis 03:00 Uhr.

| Zeit | Event | Effekt |
| :--- | :--- | :--- |
| Random | WLAN-Fehler | Spieler muss aussetzen. |
| 17:00 | Sport-Termin | Hoher Abzug auf Dopamin. |
| 19:00 | Abendessen | Sozialdruck steigt massiv. |
| 21:00 | Treffen | Extrem schwerer Check gegen Sozialwert. |
| 23:00+ | Schlaf-Impuls | "Das Schwein" wird müde (Widerstand gegen Karten steigt). |

---

## 7. Entwürfe zur Spielmechanik
- Jede Karte setzt ca. 4 Punkte auf unterschiedliche Interessen. (Standard Video-App Karten)
- Game- und Messenger- Karten können auch die Interessen beliefern. Allerdings wirken die anders auf die Werte.
- Liegen zwischen 20-40% Punkte aus guten Interessen in der mitte ist das fürs Dopamin am besten.
- Bei mehr guten Content sinkt Dopamin+Trägheit steigt. Bei weniger guten Content sind Dopamin+ Rastlosigkeit steigt.
- Trägheit ist kein Faktor, der alleine ein "Verloren" produzieren kann.
- Zulange in einer App und zu viele Wechsel sind nicht zielführend. Reizsättigung steigt innerhalb einer App. Durch Wechsel kann der gesunken werden.
- **Soziale Bindung:** Längere Bindung durch Messenger und Spiele notwendig.
---
## 8. Ideen zum Start-Screen.
 - Man Sieht hier den User Sprite
 - Einen Button zum Starten
 - und Kacheln, als Anleitung. Diese erkären auch die realen Punkte dahinter. Randomisiere Konditionierun z.B.

## 9. Aufgaben (Roadmap)
- **Phase 1:** Setup & UI (HTML, CSS-Balken, Interessen-Generator, Karten-Container, User Sichtbar).
- **Phase 2:** Game Logic (Game-Loop, Karten-Logik).
- **Phase 3:** Balancing & Events (Reizsättigungs-Formel, Event-Trigger, Game Over Screen, Detail in Animationen, Info-Kachelm am Start).




