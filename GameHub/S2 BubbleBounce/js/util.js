// Basis-Infrastruktur: Canvas-Setup, Resize, Layout-Metriken (W/H/U/DPR),
// Persistenz (High-Score), Audio (Lazy AudioContext + Beep-SFX).
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};

  // ── Viewport / Canvas ───────────────────────────────────────────────
  const canvas = document.getElementById('c');
  const ctx    = canvas.getContext('2d');
  const stage  = document.getElementById('stage');

  const view = { W: 0, H: 0, U: 0, DPR: 1, canvas, ctx };

  function resize(){
    view.DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = stage.getBoundingClientRect();
    view.W = r.width; view.H = r.height;
    view.U = Math.min(view.W, view.H);
    canvas.width  = Math.round(view.W * view.DPR);
    canvas.height = Math.round(view.H * view.DPR);
    ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
  }

  // iOS/Safari feuert Layout-Events verzögert nach dem ersten Load.
  // Deshalb prüfen wir bei jedem Frame billig, ob sich die Bounding-Box
  // geändert hat — verhindert "vergessene" Resizes auf iPad.
  function checkResize(){
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 &&
        (Math.abs(r.width - view.W) > 1 || Math.abs(r.height - view.H) > 1)){
      resize();
    }
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 60));
  window.addEventListener('load', resize);
  resize();
  setTimeout(resize, 60);
  setTimeout(resize, 300);

  // ── Persistenz ──────────────────────────────────────────────────────
  const HS_KEY = 'bubbleBounceHigh_v1';
  function loadHigh(){
    try { return parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; }
    catch(e){ return 0; }
  }
  function saveHigh(v){
    try { localStorage.setItem(HS_KEY, String(v)); } catch(e){}
  }

  // ── Audio ──────────────────────────────────────────────────────────
  // Muted-by-default; AudioContext wird erst nach erster User-Geste
  // instanziiert (Autoplay-Compliance).
  const audio = { muted: true, actx: null };
  function ensureAudio(){
    if (!audio.actx){
      try { audio.actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e){}
    }
  }
  function beep(freq, dur, type, vol){
    if (audio.muted || !audio.actx) return;
    const o = audio.actx.createOscillator(), g = audio.actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.value = vol || 0.05;
    o.connect(g); g.connect(audio.actx.destination);
    const n = audio.actx.currentTime;
    g.gain.setValueAtTime(vol || 0.05, n);
    g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    o.start(n); o.stop(n + dur);
  }
  const sfx = {
    bounce(){ beep(540, 0.08, 'sine', 0.045); },
    crack (){ beep(200, 0.14, 'square', 0.06); setTimeout(() => beep(120, 0.18, 'square', 0.05), 50); },
    dash  (){ beep(300, 0.13, 'sawtooth', 0.05); setTimeout(() => beep(760, 0.12, 'sawtooth', 0.05), 45); },
    over  (){ beep(280, 0.22, 'square', 0.06); setTimeout(() => beep(150, 0.35, 'square', 0.06), 160); }
  };

  FE.util = {
    view, resize, checkResize,
    loadHigh, saveHigh,
    audio, ensureAudio, sfx
  };
})();
