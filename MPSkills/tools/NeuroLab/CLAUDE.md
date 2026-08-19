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

**Inline editing** uses a single shared `<input id="inline-input">` that is repositioned via `getBoundingClientRect()` and committed on Enter/blur.

## Neuron types

`activations` object in `app.js` — each entry has `fn`, `formula`, `apply`, `label`, `fullName`. Add new types here.
