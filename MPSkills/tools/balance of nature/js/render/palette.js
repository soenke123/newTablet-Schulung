/**
 * Farben der Insel. Bewusst nicht mitteleuropaeisch: goldenes Tussock,
 * blaugruener Farnwald, violett schimmernder Moosnebelwald, tuerkise Lagunen,
 * dunkles Vulkangestein, farbige Thermalbecken.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  BT.PALETTE = {
    background: '#1b5a7e',
    deep:    { base: '#1b5a7e', band: '#20698f' },
    shallow: { base: '#36a6ad', band: '#52c2c0', edge: '#8fe0d4' },
    beach:   { base: '#ecdcaa', band: '#f5e8c0', edge: '#d9c58d', shell: '#fffaf0' },
    land:    { base: '#b8a865' },
    tussock: { base: '#cdb35f', band: '#bea350', edge: '#a88f42', tuftDark: '#a78b3b', tuftLight: '#e6d083' },
    scrub:   { base: '#8f9a56', band: '#84904d', edge: '#6f7a3e', bush: '#6e7a3c', bushLight: '#8c9a52', blossom: '#f6eef2', blossomPink: '#eaa6c6' },
    fern:    { base: '#2f7556', band: '#286a4c', edge: '#1f5a40', tree: '#2b6e4f', treeLight: '#3f9068', treeDark: '#1d5139', frond: '#5cb47e' },
    moss:    { base: '#3f6c6b', band: '#38605f', edge: '#2c4e4f', tree: '#3d6866', treeLight: '#5f8a86', treeViolet: '#7b6fa8', mist: '#c9dcdc' },
    swamp:   { base: '#5f8a6e', band: '#557e63', edge: '#456a52', flax: '#3e5f34', flaxLight: '#a3b86a', puddle: '#5aa6a8' },
    rock:    { base: '#6f6863', band: '#625b57', edge: '#4f4844', stone: '#8a837d', stoneDark: '#4b4541' },
    peak:    { base: '#eef2f6', band: '#d6dee6', edge: '#b9c4cf', snow: '#ffffff' },
    thermal: { base: '#dccba0', band: '#e8d9b4', edge: '#c39b5c', pool: '#3fc3c8', poolRim: '#e08a3c', poolRim2: '#f2c94c', steam: '#ffffff' },
    lake:    { base: '#2a86a8', band: '#3c9dbd', shallow: '#68bdd0', edge: '#9ad6e0' },
    river:   { base: '#3a98bd', edge: '#8fd0e0' },
    // Nutzung (render/landuseRenderer.js)
    erde:    { base: '#8b6a45', band: '#7c5d3b', edge: '#5f4529', stump: '#5a3e24', stumpTop: '#a8834f' },
    dorf:    { base: '#c4a979', band: '#b69a6a', edge: '#97794c' },
    wiese:   { base: '#a9bf62', band: '#9db357', edge: '#86993f', tuft: '#c9d985' },
    // Acker je Jahreszeit: Saat gruen, reif golden, Stoppeln, Winterbrache; abgefressen: Erde
    acker:   { base: '#c9b06a', edge: '#7a5f36', furrow: 'rgba(80, 55, 25, 0.28)', soil: '#8f6e45',
               spring: '#86b552', summer: '#e0bf4e', stubble: '#c4ad78', winter: '#9c8560' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
