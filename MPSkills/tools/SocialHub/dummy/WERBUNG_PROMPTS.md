# Bild-Prompts für die 9 Beispiel-Kampagnen (YourSozialNet, Migration 0278)

Für einen Bildgenerator. Die Bilder 1–6 sind generiert und liegen in `dummy/img/` (06.11.2026). Alle gleich gebaut, damit die Bilder zusammenpassen:
**Hochformat 4:5**, nur das Produkt bzw. die Szene, **kein Text, keine Logos, keine echten Marken, keine Gesichter** –
Titel, Text und Knopf legt die App darüber. Das Motiv mittig lassen: die Karte im Feed schneidet auf 4:5 zu,
das Foto-Label zeigt das Bild nur als kleines Quadrat (Mitte).

Ablage: als `dummy/eingang/wb_<schlüssel>.png` speichern, dann
`node MPSkills/tools/SocialHub/dummy/bilder.mjs --convert` (→ `dummy/img/wb_<schlüssel>.webp`, ohne Metadaten).

Beworbene Posts (`boost`) zeigen zurzeit **kein** eigenes Bild – dort werden echte Fotos aus dem Netzwerk
beworben. Die Prompts 7–9 sind für den Fall, dass die Werbekunden ein Bild bekommen (z. B. als Profilbild neben „Gesponsert“).

| # | Schlüssel | Kampagne | Art |
|---|---|---|---|
| 1 | `wb_volta` | VOLTA Energy | Feed-Werbung |
| 2 | `wb_speedphone` | SpeedPhone X | Feed-Werbung |
| 3 | `wb_pfoten` | Pfotenglück | Foto-Label |
| 4 | `wb_snacks` | Nachtschicht Snacks | Feed-Werbung |
| 5 | `wb_glow` | Glow Skin | Foto-Label |
| 6 | `wb_plus` | Plus-Abo | Feed-Werbung |
| 7 | `wb_sternwarte` | Sternwarte Pro | Beworbener Post |
| 8 | `wb_fernweh` | Fernweh Reisen | Beworbener Post |
| 9 | `wb_wahrheit` | Wahrheit.tv | Beworbener Post |

## 1 · VOLTA Energy (`wb_volta`)

> Vertical 4:5 product photo of a slim aluminium energy drink can in electric blue with a glowing lightning-bolt shape, cold condensation drops on the can, standing on a dark gaming desk. Background: softly blurred RGB keyboard and monitor glow in blue and purple, neon bokeh. Dramatic rim light, high contrast, commercial advertising style. No text, no logos, no brand names, no people.

## 2 · SpeedPhone X (`wb_speedphone`)

> Vertical 4:5 product photo of a sleek modern smartphone without any brand marks, standing slightly angled, the screen showing a stunning night-sky photo with the Milky Way. Dark background with a teal and cyan rim light, a few floating light streaks suggesting speed. Glossy reflections, premium tech advertising style. No text on the screen or anywhere, no logos, no people.

## 3 · Pfotenglück (`wb_pfoten`)

> Vertical 4:5 product photo of a pet supplies still life: a ceramic food bowl filled with kibble, a bright rubber ball, a rope toy and a few bone-shaped treats, arranged on a warm orange-to-apricot gradient background. Soft daylight, gentle shadows, friendly and cozy, pet shop advertising style. No animals' faces needed, no text, no logos, no packaging labels.

## 4 · Nachtschicht Snacks (`wb_snacks`)

> Vertical 4:5 photo of a late-night food delivery: a paper delivery bag with potato chips, a pizza box with steam rising and a cold cola bottle (no label), placed on a doorstep at night. Only a warm doorway lamp lights the scene, deep blue night around it, a crescent moon visible in the sky. Cozy, cinematic, slightly moody, food advertising style. No text, no logos, no people.

## 5 · Glow Skin (`wb_glow`)

> Vertical 4:5 beauty product photo of an unlabeled skincare set: a frosted glass serum bottle with a dropper and a small cream jar, standing on a smooth pink stone with water droplets. Soft pastel pink and peach background, glowing backlight, a few floating bubbles and petals. Clean, fresh, luxurious cosmetics advertising style. No text, no logos, no faces.

## 6 · Plus-Abo (`wb_plus`)

> Vertical 4:5 abstract 3D render: a large glossy violet plus sign floating in the center, next to it a small megaphone that is fading away into particles, on a deep purple gradient background with soft glow. Minimal, modern app subscription advertising style, smooth lighting, subtle sparkles. No text, no letters, no logos.

## 7 · Sternwarte Pro (`wb_sternwarte`)

> Vertical 4:5 photo of a modern white telescope on a tripod on a quiet hilltop at night, pointing at a sky full of stars and the Milky Way, a bright moon on the side. Cool blue tones with a faint warm glow on the horizon. Awe-inspiring, clear, astronomy shop advertising style. No text, no logos, no people.

## 8 · Fernweh Reisen (`wb_fernweh`)

> Vertical 4:5 travel still life seen from an airplane window seat: an open window shows a turquoise coastline and white clouds below, on the tray table lie a passport (closed, no visible text), sunglasses, a few instant photos of beaches and mountains and a small paper airplane. Bright summer light, warm and inviting travel agency advertising style. No readable text, no logos, no faces.

## 9 · Wahrheit.tv (`wb_wahrheit`)

> Vertical 4:5 photo of an old CRT television glowing in a dark room, the screen showing only static noise, a tangle of cables on the floor and a single red spotlight from above. Slightly ominous, mysterious, dramatic contrast, like a dubious online channel's promo image. No text, no logos, no symbols, no people.
