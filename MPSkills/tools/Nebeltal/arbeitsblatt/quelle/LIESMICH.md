# Arbeitsblatt Nebeltal „Wie ein neuronales Netz lernt“

Nach der Erarbeitung, Level 4–7 allein (2 Seiten A4). Verlinkt im Lernpfad (Halt „Übung“) und in der Freien Nutzung.

**Seit 21.11.2026 ist Sönkes von Hand überarbeitete Fassung maßgeblich** (`../Nebeltal_Arbeitsblatt.docx` + `.pdf`, englische
Fachbegriffe in der Tabelle, keine Wortliste mehr in A 1). `blatt.cjs` baut noch die Fassung davor – NICHT mehr laufen lassen,
sonst sind seine Änderungen weg; Änderungen direkt in der Word-Datei machen und das PDF neu exportieren.

Musterlösung (alle Aufgaben A–D, Word + PDF, nur Lehrkraft/allein verlinkt als „Lösung“):

    NODE_PATH=$(npm root -g) node MPSkills/tools/Nebeltal/arbeitsblatt/quelle/loesung.cjs   # ../Nebeltal_Arbeitsblatt_Loesung.docx
    soffice --headless --convert-to pdf --outdir MPSkills/tools/Nebeltal/arbeitsblatt MPSkills/tools/Nebeltal/arbeitsblatt/Nebeltal_Arbeitsblatt_Loesung.docx

Bilder/alte Fassung neu bauen (vom Repo-Wurzelordner):

    NODE_PATH=$(npm root -g) node MPSkills/tools/Nebeltal/arbeitsblatt/quelle/bilder.mjs   # Bilder (*.png) aus img/frei
    node MPSkills/tools/Nebeltal/arbeitsblatt/quelle/blatt.cjs                              # ../Nebeltal_Arbeitsblatt.docx

Stand 20.11.2026 (aus Sönkes reduzierter Fassung „meine version“): ohne Loss, Anteile und griechische Buchstaben;
A = Tabelle mit fertiger Kurz-Erklärung je Begriff + Spalte „In Nebeltal sieht man …“ (Begriffe deutsch);
B = Lernregel der Erarbeitung (neu = alt + Lernrate · Fehler · Eingang); C = Karte über w₁/w₂ (b = 3,0 fest)
als Mulde aus fünf Pinguinen (2,1) (0,2) (3,0) (1,3) (4,2), echt = 0,9·x₁ + 0,3·x₂ + 3,0 → tiefste Stelle (0,9 | 0,3).

Lösungen A 1: ① Vorwärtspropagierung · ② Fehlerberechnung · ③ Rückwärtspropagierung · ④ Gradientenabstieg · ⑤ Lernrate.
Lösungen B: a) Schätzung = 2·0,5 + 1·0,3 + 3,0 = 4,3 · b) Fehler = 5,1 − 4,3 = 0,8 ·
c) Fehler · Eingang: w₁ 1,6, w₂ 0,8, b 0,8 · d) w₁ 0,66, w₂ 0,38, b 3,08 ·
e) Schätzung 4,78, Fehler 0,32 (kleiner, von 0,8 auf 0,32).
C 1: (0,66 | 0,38) liegt tiefer als der Start. C 2 (Lernrate 1): w₁ 2,1, w₂ 1,1 → weit über die Mulde
hinaus, viel höher als vorher (übersprungen). C 4: Für einen Pinguin ist jeder Ort mit 2·w₁ + w₂ = 2,1 genau
richtig – das ist eine ganze Linie (Rinne); erst mehrere Pinguine legen einen einzigen Punkt fest.

Ausführlich (mit A 2, Begriffen in B, C 3 und allen Fragen aus D): loesung.cjs.
