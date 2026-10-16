# Mitgelieferte Bibliotheken

Fest eingebundene Kopien statt npm/CDN, damit die App ohne Build-Schritt und ohne Internet läuft.

| Ordner | Bibliothek | Version | Lizenz | Quelle (npm) |
|---|---|---|---|---|
| `pdfjs/` | PDF.js (`pdfjs-dist`) | 5.7.284 | Apache 2.0 (`pdfjs/LICENSE`, Lizenzen der WASM-Decoder in `pdfjs/wasm/`) | `build/pdf.min.mjs`, `build/pdf.worker.min.mjs`, `cmaps/`, `standard_fonts/`, `wasm/`, `iccs/` |
| `pdf-lib/` | pdf-lib | 1.17.1 | MIT (`pdf-lib/LICENSE.md`) | `dist/pdf-lib.esm.min.js` |

Aktualisieren: `npm pack pdfjs-dist@<version>` bzw. `npm pack pdf-lib@<version>` in einem leeren Ordner, Archiv entpacken, die oben genannten Dateien ersetzen, Version hier eintragen, `npm test` und die App mit einer echten PDF prüfen.
