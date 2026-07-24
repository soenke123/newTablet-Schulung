# Monster-Sprites

Lege hier Monster-Bilder ab. `render.js` lädt sie automatisch und nutzt sie
anstelle der Vektor-Grafik. Fehlt eine Datei, greift der Vektor-Fallback —
kein Fehler, kein Blocker.

Erwartete Dateinamen (alle optional):

- `idle.png`  — Monster im Ruhezustand (Standard-Sprite)
- `jump.png`  — beim Bounce nach oben (optional)
- `dash.png`  — während Dash aktiv (optional, gelb-orange)

Empfohlene Auflösung: quadratisch, ~256×256 px, transparenter Hintergrund
(PNG). Wird auf ~10 % der Bildschirmbreite skaliert.
