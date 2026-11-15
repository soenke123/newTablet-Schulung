# Tiny LM – Arbeitsblätter (14.11.2026)

**Alle Versionen auf einen Blick:** `kurz/` = aktuelle Fassung (je Phase eine Doppelseite) · `lang/` = erster Entwurf (4–7 Seiten je Blatt). Der ganze Ordner steht in `.vercelignore`, ist also nur im Repository, nicht auf der Webseite.

Vier Arbeitsblätter (eins je Phase, **höchstens eine Doppelseite**: Seite 1 Kennenlernen, Seite 2 Verändern + Erschaffen/Reflektieren) nach Use – Modify – Create und ein Begleitzettel für Lehrkräfte (≈ 2½ Seiten), als Word-Dateien. Nicht auf Vercel (`.vercelignore`).

**Lange Fassung** (erster Entwurf, als Ideensammlung aufgehoben): `lang/`, gebaut von `build-lang.cjs`. Sönke: „viel zu viel … maximal eine Doppelseite pro Phase“.

| Datei (in `kurz/`, gleiche Namen in `lang/`) | Inhalt |
|---|---|
| `TinyLM_AB1_Frei_schreiben.docx` | Spalten kennenlernen, Wort zerlegen · N-Gramm 1/3/7, Temperatur · **Erschaffen: Tiny über die Quellen manipulieren** |
| `TinyLM_AB2_Frage_und_Antwort.docx` | Frage zerlegen, Quellenfarben · umformulieren, Eiffelturm, Pluto · Reflexion Retrieval |
| `TinyLM_AB3_Woerter_als_Punkte.docx` | Wortwolke, Welpe in Phase 2 vs. 3 · Wolken-Sprung · nah ≠ nächstes Wort, Sprung = Halluzinieren? |
| `TinyLM_AB4_Echtes_Netz.docx` | vor/nach Training, Fehlerlinie · Frage-Stärke · Vergleichstabelle, Kontextfenster, was fehlt / Gefahren |
| `TinyLM_Begleitzettel_Lehrkraft.docx` | Übersicht + je Phase Ziele, Grenzen, Stolpersteine/Grenzfragen, Impulse, Erwartungshorizont |

## Neu bauen

```bash
node screenshots.cjs        # App-Screenshots nach bilder/ (file://, ?demo=1; Phase 4 trainiert ~2,5 Min.) – einzeln: node screenshots.cjs 1,3
node schaubilder.cjs        # Schaubilder aus diagramme.html → bilder/d-*.png
python3 nummern.py          # nummerierte Kreise auf bilder/p*-gesamt.png → *-gesamt-nr.png (Koordinaten von Hand)
python3 kombi.py            # zwei Handys nebeneinander → bilder/k-*.png
node build.cjs              # kurze Word-Dateien nach kurz/ (Texte stehen hier)
node build-lang.cjs         # lange Fassung nach lang/
```

Aufgabennummern (A1, A2 …) werden gezählt; der Erwartungshorizont im Begleitzettel nennt sie fest – nach dem Einfügen oder Streichen einer Aufgabe dort anpassen.
Die Zahlen im Schaubild „Langes Fenster = weniger Auswahl“ (frisst 22×, Hund frisst 2×, der Hund frisst 1×) und Pluto 3 : 2 sind aus `js/corpus.js` gezählt – nach Textänderungen prüfen.
Ändert sich die Oberfläche (Spalten, Reglernamen, `data-spot`), Screenshots und Aufgabentexte nachziehen.
