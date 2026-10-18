# Mitgelieferte Bibliotheken

Fest eingebundene Kopien statt npm/CDN, damit die App ohne Build-Schritt und ohne Internet läuft.

| Ordner | Bibliothek | Version | Lizenz | Quelle (npm) |
|---|---|---|---|---|
| `pdfjs/` | PDF.js (`pdfjs-dist`) | 5.7.284 | Apache 2.0 (`pdfjs/LICENSE`, Lizenzen der WASM-Decoder in `pdfjs/wasm/`) | `build/pdf.min.mjs`, `build/pdf.worker.min.mjs`, `cmaps/`, `standard_fonts/`, `wasm/`, `iccs/` |
| `pdfjs-legacy/` | PDF.js (`pdfjs-dist`), Legacy-Fassung für ältere Browser | 5.7.284 (immer dieselbe wie `pdfjs/`) | Apache 2.0 (`pdfjs-legacy/LICENSE`) | `legacy/build/pdf.min.mjs`, `legacy/build/pdf.worker.min.mjs` (cmaps, Schriften, wasm, iccs kommen aus `pdfjs/`) |
| `pdf-lib/` | pdf-lib | 1.17.1 | MIT (`pdf-lib/LICENSE.md`) | `dist/pdf-lib.esm.min.js` |
| `tesseract/` | Tesseract.js (Texterkennung, OCR) | 7.0.0 | Apache 2.0 (`tesseract/LICENSE.md`) | `dist/tesseract.esm.min.js`, `dist/worker.min.js` (Zeile `sourceMappingURL` entfernt) |
| `tesseract/core/` | tesseract.js-core | 7.0.0 | Apache 2.0 (`tesseract/core/LICENSE`) | `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-lstm.wasm.js` (WASM eingebettet; die App wählt selbst, Browser ohne SIMD bekommen die zweite) |
| `tesseract/lang/` | Sprachdaten Deutsch (`@tesseract.js-data/deu`) | 1.0.0 | Paket MIT, Modell aus tessdata_best (Apache 2.0) | `4.0.0_best_int/deu.traineddata.gz` |

Aktualisieren: `npm pack pdfjs-dist@<version>` bzw. `npm pack pdf-lib@<version>` in einem leeren Ordner, Archiv entpacken, die oben genannten Dateien ersetzen, bei PDF.js auch die beiden Dateien aus `legacy/build/` nach `pdfjs-legacy/`, Version hier eintragen (Tesseract: `npm pack tesseract.js@<v> tesseract.js-core@<v> @tesseract.js-data/deu`), `npm test` und die App mit einer echten PDF prüfen.
