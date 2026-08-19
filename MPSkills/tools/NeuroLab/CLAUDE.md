# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An interactive neural network simulator for classroom use ("neuronales Netz Simulator"). Currently implements a single configurable neuron. Future goal: connect multiple neurons.

## Running

Open `index.html` directly in a browser — no build step, no server required.

## Files

- `index.html` — page shell, 3-column layout (inputs | SVG canvas | output)
- `style.css` — all styling; CSS variables in `:root` control the color palette
- `app.js` — all logic: state model, SVG rendering, inline editing, popups

## Architecture

**Single source of truth:** the `state` object in `app.js`. Every interaction mutates state and calls `render()`, which fully rebuilds the SVG and DOM from scratch (no partial updates).

**Two phases** (toggled via header buttons):
- `build` — edit weights, bias, connection topology, neuron type
- `run` — edit input values; neuron computes output automatically

**SVG neuron** is built entirely in JS (`renderSVG()`). Layout uses fixed logical coordinates (viewBox `0 0 500 380`). The ellipse has two clickable hit-areas (Σ left half, activation function right half) that open calculation popups.

**Feld = Fenster + Tafel (2026-08-19).** `#network` ist das Fenster (feste Höhe, `overflow:hidden`, fängt die Gesten), `#net-stage` die Tafel darin (`transform: translate()+scale()`, `transform-origin: 0 0`). Bewegt wird immer nur die Tafel als Ganzes.

*Warum keine Spalte mehr scrollt:* die Kanten liegen als **ein** SVG (`drawEdgeOverlay`) über der ganzen Tafel. Scrollte eine Spalte für sich, wanderten ihre Neuronen und die Kanten blieben liegen — die Linien zeigten ins Leere. Und weil `.col-body` seinen Inhalt zentriert, war der Überschuss oben durch Scrollen **grundsätzlich** nicht erreichbar: die ersten Neuronen einer vollen Schicht flogen aus dem Bild. Beides löst dieselbe Änderung — die Spalten wachsen mit ihrem Inhalt (kein `overflow`), die Tafel mit den Spalten, und die Ansicht zoomt darauf. Einzige Ausnahme: `.data-table-col .col-body` behält seine Leiste (an einer Tabelle hängt keine Kante, und 1500 CSV-Zeilen zögen die Tafel sonst meterhoch).

*Maßstab:* Anfang ist immer der volle Überblick, und solange `view.touched === false` zieht jedes `render()` nach — wer eine Schicht auf zehn Neuronen stellt, sieht danach das ganze Netz. Ab dem ersten eigenen Zoom gilt die eigene Wahl. Herauszoomen endet beim Überblick, `fitScale()` ist nach oben auf 1 gedeckelt (ein einzelnes Neuron wird nicht aufgeblasen). `syncStageHeight()` gibt der Tafel die Höhe, die nach dem Verkleinern gerade das Fenster ergibt — sonst schwebten die Spaltenkarten mit grauen Bändern darüber und darunter.

*Gesten:* zwei Finger schieben und zoomen zugleich (der Punkt zwischen den Fingern bleibt zwischen den Fingern), ein Finger schiebt nur auf freier Fläche (`isFieldBackground` — Neuronen und Spaltenköpfe behalten ihre eigene Geste), Strg/⌘ + Rad zoomt, das Rad allein schiebt und nur dann, wenn es etwas zu schieben gibt. Knöpfe − ⤢ + unten rechts.

⚠️ **Alle Zeiger-Listener der Gesten hängen in der CAPTURE-Phase.** Im Neuron sitzen Schaltflächen, die ihr `pointerdown` mit `stopPropagation()` abfangen (OUT-Umschalter, Eingabefelder) — beim Hochlaufen käme die Geste dort nie an, und das Feld ließe sich überall aufziehen außer dort, wo ein Neuron steht. Das war beim Bauen zweimal die Ursache.

⚠️ **`drawEdgeOverlay(net)` bekommt die TAFEL, nicht das Fenster.** Die Kanten liegen mit auf ihr und werden vom `transform` mitgezoomt — deshalb müssen sie beim Verschieben und Zoomen nicht neu gezeichnet werden. Gemessen wird in Bildschirmkoordinaten (`getBoundingClientRect`), umgerechnet über die Tafelecke und `view.scale`; Breite/Höhe des Overlays kommen aus `offsetWidth/offsetHeight` (ungezoomt). Wer dort etwas ändert, teilt Zeiger-Deltas ebenfalls durch `view.scale` — siehe `addPointerDrag` und `addColumnDrag`.

**`#learn-group` hängt am FENSTER, nicht an der Tafel** (`renderNetwork` hängt es an `#network` an). Es ist ein Bedienfeld wie die Kopfzeile; beim Herauszoomen wären seine Knöpfe nicht mehr zu treffen. Ein `position: fixed` innerhalb eines `transform()`-Elements wäre außerdem nicht mehr am Bildschirm, sondern an der Tafel festgemacht.

**Inline editing** uses a single shared `<input id="inline-input">` that is repositioned via `getBoundingClientRect()` and committed on Enter/blur.

## Neuron types

`activations` object in `app.js` — each entry has `fn`, `formula`, `apply`, `label`, `fullName`. Add new types here.
