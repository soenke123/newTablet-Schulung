# Tiny LM – Arbeitsblätter (erster Entwurf, 14.11.2026)

Vier Arbeitsblätter (eins je Phase) nach Use – Modify – Create und ein Begleitzettel für Lehrkräfte, als Word-Dateien.
Nicht auf Vercel (`.vercelignore`).

| Datei | Inhalt |
|---|---|
| `TinyLM_AB1_Frei_schreiben.docx` | Kennenlernen · N-Gramm/Temperatur/Quellen verändern · **Erschaffen: Tiny über die Quellen manipulieren** |
| `TinyLM_AB2_Frage_und_Antwort.docx` | Suche verfolgen · Fragen umformulieren, Eiffelturm (Halluzinieren), Falschnachrichten · Reflexion Retrieval |
| `TinyLM_AB3_Woerter_als_Punkte.docx` | Wortwolke · Wolken-Sprung, Textwelt ausschalten · Reflexion Bedeutung/Embedding |
| `TinyLM_AB4_Echtes_Netz.docx` | Training · Kontext 3/4/5, Frage-Stärke · Vergleich aller Phasen, Kontextfenster, was fehlt zum Chatbot, Gefahren |
| `TinyLM_Begleitzettel_Lehrkraft.docx` | je Phase Ziele, Grenzen des Modells, Stolpersteine, Grenzfragen an Tiny, Diskussionsimpulse, Erwartungshorizont |

## Neu bauen

```bash
node screenshots.cjs        # App-Screenshots nach bilder/ (file://, ?demo=1; Phase 4 trainiert ~2,5 Min.) – einzeln: node screenshots.cjs 1,3
node schaubilder.cjs        # Schaubilder aus diagramme.html → bilder/d-*.png
python3 nummern.py          # nummerierte Kreise auf bilder/p*-gesamt.png → *-gesamt-nr.png (Koordinaten von Hand)
node build.cjs              # Word-Dateien (Texte stehen hier)
```

Aufgabennummern (A1, A2 …) werden gezählt; der Erwartungshorizont im Begleitzettel nennt sie fest – nach dem Einfügen oder Streichen einer Aufgabe dort anpassen.
Die Zahlen im Schaubild „Langes Fenster = weniger Auswahl“ (frisst 22×, Hund frisst 2×, der Hund frisst 1×) und Pluto 3 : 2 sind aus `js/corpus.js` gezählt – nach Textänderungen prüfen.
Ändert sich die Oberfläche (Spalten, Reglernamen, `data-spot`), Screenshots und Aufgabentexte nachziehen.
