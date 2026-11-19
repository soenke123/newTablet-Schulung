# Arbeitsblatt Nebeltal „Wie ein neuronales Netz lernt“

Nach der Erarbeitung, Level 4–7 allein (2 Seiten A4). Noch nicht verlinkt.

Neu bauen (vom Repo-Wurzelordner):

    NODE_PATH=$(npm root -g) node MPSkills/tools/Nebeltal/arbeitsblatt/quelle/bilder.mjs   # Bilder (*.png) aus img/frei
    node MPSkills/tools/Nebeltal/arbeitsblatt/quelle/blatt.cjs                              # ../Nebeltal_Arbeitsblatt.docx

Lösungen B: ŷ = 4,3 · e = 0,8, L = 0,32 · Gradienten −1,6 / −0,8 / −0,8 · w₁ 0,66, w₂ 0,38, b 3,08 ·
Kontrolle ŷ = 4,78, L ≈ 0,05. C 2 (η = 1): w₁ 2,1, w₂ 1,1, b 3,8 → ŷ 9,1, e −4, L 8 (übersprungen; schlechter ab η > 1/3).
