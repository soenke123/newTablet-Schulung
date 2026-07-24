// Rendering: Sunset-Sky (via CSS-Gradient) + zwei Feed-Ebenen.
//
//   ┌ HINTERGRUND ────────────────────────────────────────────────┐
//   │  Verschwommene, halbtransparente "atmosphärische" Post-     │
//   │  karten scrollen mit Parallax (langsamer als die Kamera).   │
//   │  Doomscroll-Gefühl. Nicht spielrelevant.                    │
//   ├ VORDERGRUND ─────────────────────────────────────────────────┤
//   │  Schmale, scharfe Post-Karten (die eigentlichen Plattformen)│
//   │  mit Kategorie-Icon, Handle, Punkte-Bubble.                 │
//   └────────────────────────────────────────────────────────────────┘
//
// Sprite-Slots (assets/monster/*.png, assets/posts/<id>.png) fallen
// stumm auf Vektor/Emoji zurück, wenn sie fehlen.
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};
  const { view } = FE.util;

  const sprites = {
    monster: { idle: null, jump: null, dash: null },
    categories: {},
    orb: null      // 2b: Blitz-Icon für Akku-Kugeln
  };

  function tryLoad(path){
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }
  async function preloadSprites(){
    const [idle, jump, dash] = await Promise.all([
      tryLoad('assets/monster/idle.png'),
      tryLoad('assets/monster/jump.png'),
      tryLoad('assets/monster/dash.png')
    ]);
    sprites.monster.idle = idle;
    sprites.monster.jump = jump;
    sprites.monster.dash = dash;
    // Kategorie-Icons: entweder lokales PNG (falls Custom-Art existiert)
    // oder MDI-Icon aus Iconify-CDN. Farbe dunkel-neutral (#2A2439),
    // damit der Blau/Petrol-Streifen oben die Kategorie signalisiert
    // und das Icon nur beschreibt, WAS die Kategorie ist.
    const ICON_COLOR = '%232A2439'; // URL-encoded #2A2439
    await Promise.all(FE.categories.ALL.map(async c => {
      const local = await tryLoad('assets/posts/' + c.id + '.png');
      if (local){ sprites.categories[c.id] = local; return; }
      const url = 'https://api.iconify.design/' + c.icon + '.svg?color=' + ICON_COLOR;
      sprites.categories[c.id] = await tryLoad(url);
    }));

    // 2b: Blitz-Icon in Akku-Kugeln (dunkles Gelb, kontrastiert auf hellem Kern)
    sprites.orb = await tryLoad('https://api.iconify.design/mdi:flash.svg?color=%23713F12');
  }

  // ── Primitives ──────────────────────────────────────────────────────
  function rr(ctx, x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // ── Atmospheric backdrop feed ───────────────────────────────────────
  // Statische Auswahl "generischer" Post-Merkmale, zyklisch pro Zeile.
  // KEIN Emoji im Bild-Zentrum — die Kombination aus Emoji + canvas-Blur
  // erzeugt Subpixel-Shimmer, der wie Flackern aussieht. Stattdessen
  // ein weicher radialer Farb-Blob.
  const ATMOS = [
    { avatar:['#FF9AC7','#FFD46B'], strip:'#E8F0FF', blob:'#8CB6FF' },
    { avatar:['#7BE0C4','#4EA8FF'], strip:'#FFE9F0', blob:'#FF9EB8' },
    { avatar:['#B8A5FF','#FF9AC7'], strip:'#FFF5DD', blob:'#FFCF6B' },
    { avatar:['#FFB68A','#FF7B7B'], strip:'#E8FDE9', blob:'#7DDE96' },
    { avatar:['#7ADCEF','#8CA1FF'], strip:'#F5E8FF', blob:'#BE9AFF' },
    { avatar:['#FFD46B','#FFA07A'], strip:'#FFEDE1', blob:'#FF9E7A' }
  ];

  // Backdrop-Cache: Jede Kategorie-Karte wird EINMAL offscreen gerendert.
  // Pro Frame nur noch drawImage — keine Gradients, keine Filter, kein
  // Shadow. Das ist der zuverlässige Weg, Flackern zu vermeiden:
  //  a) Slot-Index als reine Integer-Arithmetik (keine Floating-Point-
  //     Instabilität bei Grenz-Positionen).
  //  b) Karten-Content bereits gerastert → keine Subpixel-Interpolation
  //     unterschiedlich pro Frame.
  //  c) Kein `ctx.filter = 'blur(...)'` pro Frame (Safari/iOS-Ursache
  //     Nr. 1 für Backdrop-Flackern).
  let backdropCache = null;

  function ensureBackdropCache(){
    const cardW = Math.round(view.W * 0.82);
    const cardH = Math.round(view.U * 0.42);
    const key = cardW + 'x' + cardH;
    if (backdropCache && backdropCache.key === key) return;
    backdropCache = { key, cardW, cardH, cards: ATMOS.map(a => renderAtmos(cardW, cardH, a)) };
  }

  // Rendert EINE atmosphärische Karte in ein eigenes Canvas.
  // Fertig geblurrt — im Haupt-Loop wird nur noch drawImage aufgerufen.
  function renderAtmos(cardW, cardH, atmos){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const off = document.createElement('canvas');
    off.width  = Math.max(1, Math.round(cardW * dpr));
    off.height = Math.max(1, Math.round(cardH * dpr));
    const octx = off.getContext('2d');
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Karten-Grundfläche
    octx.fillStyle = '#ffffff';
    rr(octx, 0, 0, cardW, cardH, 18); octx.fill();

    // Top-Bar (Avatar-Gradient + graue Text-Balken)
    const topH = cardH * 0.18;
    const av   = topH * 0.55;
    const ax   = 14 + av / 2;
    const ay   = topH / 2;
    const grad = octx.createLinearGradient(ax - av/2, ay - av/2, ax + av/2, ay + av/2);
    grad.addColorStop(0, atmos.avatar[0]); grad.addColorStop(1, atmos.avatar[1]);
    octx.fillStyle = grad;
    octx.beginPath(); octx.arc(ax, ay, av / 2, 0, 7); octx.fill();

    octx.fillStyle = '#DBD3E0';
    rr(octx, ax + av * 0.85, ay - av * 0.32, cardW * 0.30, av * 0.28, 4); octx.fill();
    rr(octx, ax + av * 0.85, ay + av * 0.06, cardW * 0.16, av * 0.22, 4); octx.fill();

    // Bild-Zone: Basisfarbe + radialer Farb-Blob als "Motiv"
    const imgY = topH;
    const imgH = cardH - topH - cardH * 0.14;
    octx.fillStyle = atmos.strip;
    octx.fillRect(0, imgY, cardW, imgH);
    const cx = cardW / 2, cy = imgY + imgH / 2;
    const radius = Math.min(cardW, imgH) * 0.55;
    const blob = octx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    blob.addColorStop(0, atmos.blob);
    blob.addColorStop(1, atmos.strip);
    octx.fillStyle = blob;
    octx.fillRect(0, imgY, cardW, imgH);

    // Action-Row unten (drei kleine Rechtecke)
    const actY = imgY + imgH + cardH * 0.045;
    octx.fillStyle = '#DBD3E0';
    const dot = cardH * 0.07;
    rr(octx, 14,                actY, dot, dot, 3); octx.fill();
    rr(octx, 14 + dot * 1.6,    actY, dot, dot, 3); octx.fill();
    rr(octx, 14 + dot * 3.2,    actY, dot, dot, 3); octx.fill();

    // Blur einmalig auf einer zweiten Fläche anwenden → Ergebnis
    // ist eine stabile Rasterung. Kein per-Frame-Filter mehr nötig.
    const finalOff = document.createElement('canvas');
    finalOff.width  = off.width;
    finalOff.height = off.height;
    const fctx = finalOff.getContext('2d');
    fctx.filter = 'blur(2.5px)';
    fctx.drawImage(off, 0, 0);
    return finalOff;
  }

  function drawBackdrop(camY){
    ensureBackdropCache();
    const ctx = view.ctx, W = view.W, U = view.U;
    const cardW = backdropCache.cardW;
    const cardH = backdropCache.cardH;
    const cardX = (W - cardW) / 2;
    const period = cardH + U * 0.09;

    // Reine Integer-Arithmetik gegen Floating-Point-Slot-Flackern:
    // baseIndex ist eine echte Ganzzahl; die Kartenpositionen ergeben
    // sich aus (i - 1) * period - dr.
    const parallax = camY * 0.35 + performance.now() * 0.018;
    const baseIndex = Math.floor(parallax / period);
    const dr = parallax - baseIndex * period;

    ctx.save();
    ctx.globalAlpha = 0.55;
    // KEIN ctx.filter mehr — der Blur ist bereits offscreen gebacken.
    for (let i = 0; i < 5; i++){
      const yy = (i - 1) * period - dr;
      const slotIndex = baseIndex + i - 1;
      const atmosI = ((slotIndex % ATMOS.length) + ATMOS.length) % ATMOS.length;
      ctx.drawImage(backdropCache.cards[atmosI], cardX, yy, cardW, cardH);
    }
    ctx.restore();
  }

  // ── Vordergrund-Plattform (Post-Karte im 2-Zeilen-Layout) ──────────
  // Zeile 1 (oben):  Handle-Name — groß, ohne @-Prefix, ohne Verify-Tick.
  //                  Ist das visuelle Aushängeschild und muss lesbar sein.
  // Zeile 2 (unten): Kategorie-Icon links + Sample-Text daneben.
  function drawPlat(p, camY){
    const ctx = view.ctx, U = view.U;
    const sy = p.y - camY;
    if (sy < -80 || sy > view.H + 80) return;
    const w = p.w, x = p.x - w / 2;
    const h = U * 0.125;
    const y = sy - h + 4;   // Landing-Kante auf Höhe p.y

    // Hit-Flash: kurzer heller Puls beim Landen
    const flash = Math.max(0, p.hitFlash);

    // Karten-Schatten
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.28)';
    ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x, y, w, h, 10); ctx.fill();
    ctx.restore();

    // Top-Tint (Blau/Petrol) — der eigentliche Signal-Streifen.
    // Bewusst nah beieinander: der Streifen ist die einzige Farbcodierung,
    // muss aber auch für Menschen mit Rot/Grün-Schwäche funktionieren.
    const tint = p.cat.type === 'good' ? '#2563EB' : '#0E7490';
    ctx.fillStyle = tint;
    rr(ctx, x, y, w, 4, 4); ctx.fill();

    const padX = 7;
    // ── Zeile 1: Handle ───────────────────────────────────────────────
    // '@' beim Rendern strippen (Daten bleiben unangetastet)
    const nameNoAt = p.handle.charAt(0) === '@' ? p.handle.slice(1) : p.handle;
    ctx.fillStyle = '#2A2439';
    ctx.font = '700 ' + (U * 0.028) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const nameY = y + h * 0.35;
    const nameMax = w - padX * 2;
    ctx.fillText(clip(ctx, nameNoAt, nameMax), x + padX, nameY);

    // ── Zeile 2: Icon + Sample-Text ───────────────────────────────────
    const iconSize = U * 0.03;
    const rowY = y + h * 0.72;
    const iconX = x + padX;
    const iconY = rowY - iconSize / 2;

    const iconImg = sprites.categories[p.cat.id];
    if (iconImg){
      ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
    } else {
      // Ladefallback: dezenter grauer Kreis, damit das Layout nicht springt
      ctx.fillStyle = '#DBD3E0';
      ctx.beginPath(); ctx.arc(iconX + iconSize/2, rowY, iconSize * 0.35, 0, 7); ctx.fill();
    }

    ctx.fillStyle = '#6b6472';
    ctx.font = '500 ' + (U * 0.021) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const sampX = iconX + iconSize + 5;
    const sampMax = w - (sampX - x) - padX;
    ctx.fillText(clip(ctx, p.sample, sampMax), sampX, rowY);

    // Hit-Flash-Overlay
    if (flash > 0){
      ctx.save();
      ctx.globalAlpha = flash * 0.5;
      ctx.fillStyle = tint;
      rr(ctx, x, y, w, h, 10); ctx.fill();
      ctx.restore();
    }
  }

  function clip(ctx, text, maxW){
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  // ── Monster (Vektor-Fallback) ───────────────────────────────────────
  function drawMon(camY){
    const { mon, dashGlow } = FE.player.state;
    const ctx = view.ctx;
    const sy = mon.y - camY;
    const r  = mon.r;
    const sq = mon.squash > 0 ? mon.squash : 0;
    const sxs = 1 + sq * 0.25, sys = 1 - sq * 0.25;
    const streakBoost = FE.platforms.state.combo >= 20;

    // Goldener Puls-Halo hinter dem Monster bei aktivem Sprung-Boost.
    // Vor Sprite/Vektor gezeichnet, damit das Monster oben aufliegt.
    if (streakBoost){
      const t = performance.now() * 0.001;
      const pulse = 0.6 + 0.4 * Math.sin(t * 2.5);
      ctx.save();
      const halo = ctx.createRadialGradient(mon.x, sy, r * 0.5, mon.x, sy, r * 1.8);
      halo.addColorStop(0, 'rgba(251, 191, 36, ' + (0.42 * pulse) + ')');
      halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(mon.x, sy, r * 1.8, 0, 7); ctx.fill();
      ctx.restore();
    }

    let spr = null;
    if (dashGlow > 0 && sprites.monster.dash) spr = sprites.monster.dash;
    else if (mon.vy < -50 && sprites.monster.jump) spr = sprites.monster.jump;
    else if (sprites.monster.idle) spr = sprites.monster.idle;

    if (spr){
      const size = r * 2.4;
      ctx.save();
      ctx.translate(mon.x, sy); ctx.scale(sxs * mon.face, sys);
      if (dashGlow > 0){ ctx.shadowColor = 'rgba(255,180,60,.7)'; ctx.shadowBlur = 26; }
      else if (streakBoost){ ctx.shadowColor = 'rgba(251,191,36,.75)'; ctx.shadowBlur = 24; }
      else             { ctx.shadowColor = 'rgba(139,92,246,.5)'; ctx.shadowBlur = 18; }
      ctx.drawImage(spr, -size/2, -size/2, size, size);
      ctx.restore();
      if (streakBoost) drawMonsterSparkles(mon.x, sy, r);
      return;
    }

    ctx.save();
    ctx.translate(mon.x, sy); ctx.scale(sxs * mon.face, sys);
    if (dashGlow > 0){ ctx.shadowColor = 'rgba(255,180,60,.7)'; ctx.shadowBlur = 26; }
    else if (streakBoost){ ctx.shadowColor = 'rgba(251,191,36,.7)'; ctx.shadowBlur = 22; }
    else             { ctx.shadowColor = 'rgba(139,92,246,.4)'; ctx.shadowBlur = 16; }
    // Grundkörper — pastellig genug für hellen Hintergrund
    const grad = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.1, 0, 0, r);
    if (dashGlow > 0){ grad.addColorStop(0, '#FFE8B0'); grad.addColorStop(1, '#F1A93B'); }
    else             { grad.addColorStop(0, '#D4C6FF'); grad.addColorStop(1, '#8B5CF6'); }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;

    // Bauch
    ctx.fillStyle = dashGlow > 0 ? '#FFF3CE' : '#EDE5FF';
    ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.6, 0, 7); ctx.fill();

    // Augen (weiß + Pupille)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.16, r * 0.24, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.28, -r * 0.16, r * 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = '#2A2439';
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.12, r * 0.11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.34, -r * 0.12, r * 0.11, 0, 7); ctx.fill();
    // Glanzpunkte
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-r * 0.19, -r * 0.16, r * 0.045, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.37, -r * 0.16, r * 0.045, 0, 7); ctx.fill();

    // Lächeln
    ctx.strokeStyle = '#2A2439'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, r * 0.12, r * 0.26, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

    // Ohren
    ctx.fillStyle = dashGlow > 0 ? '#E5A93B' : '#7C4EF5';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.62); ctx.lineTo(-r * 0.28, -r * 0.94); ctx.lineTo(-r * 0.10, -r * 0.60);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo( r * 0.5, -r * 0.62); ctx.lineTo( r * 0.28, -r * 0.94); ctx.lineTo( r * 0.10, -r * 0.60);
    ctx.fill();
    ctx.restore();
    if (streakBoost) drawMonsterSparkles(mon.x, sy, r);
  }

  // Sechs Funken kreisen ums Monster, jeder mit eigenem Twinkel-Phasen-
  // versatz — vermeidet Gleichtakt-Blinken, sieht nach "Sternenstaub" aus.
  function drawMonsterSparkles(cx, cy, r){
    const ctx = view.ctx;
    const t = performance.now() * 0.001;
    const orbR = r * 1.55;
    for (let i = 0; i < 6; i++){
      const ang = t * 1.1 + i * (Math.PI / 3);
      const sx = cx + Math.cos(ang) * orbR;
      const sy = cy + Math.sin(ang) * orbR;
      const twinkle = 0.35 + 0.65 * Math.sin(t * 5 + i * 1.4);
      ctx.fillStyle = 'rgba(253, 224, 71, ' + (0.35 + 0.6 * twinkle) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.09 + twinkle * r * 0.06, 0, 7); ctx.fill();
    }
  }

  // ── FX: Partikel + Score-Floats ─────────────────────────────────────
  function drawFX(camY){
    const ctx = view.ctx, U = view.U;
    const partsPool = FE.platforms.state.parts.concat(FE.player.state.parts);
    for (const p of partsPool){
      ctx.globalAlpha = Math.max(0, p.life * 1.4);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y - camY, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of FE.platforms.state.floats){
      ctx.globalAlpha = Math.max(0, f.life / 0.9);
      ctx.fillStyle = f.col;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + (U * 0.05) + 'px Fredoka, sans-serif';
      ctx.fillText(f.t, f.x, f.y - camY);
    }
    ctx.globalAlpha = 1;
  }

  // ── HUD ─────────────────────────────────────────────────────────────
  function drawHUD(score, best, combo){
    const ctx = view.ctx, U = view.U, W = view.W;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    // Score-Pill mit weißem Hintergrund für Kontrast auf pastelligem Sky
    const pillH = U * 0.12;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    rr(ctx, 12, 12, U * 0.32, pillH, 14); ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#2A2439';
    ctx.font = '700 ' + (U * 0.075) + 'px Fredoka, sans-serif';
    ctx.fillText(String(score), 24, 18);
    ctx.fillStyle = '#8a3d20';
    ctx.font = '600 ' + (U * 0.025) + 'px Fredoka, sans-serif';
    ctx.fillText('BEST ' + best, 26, 18 + U * 0.08);

    if (combo >= 3){
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8B5CF6';
      ctx.font = '700 ' + (U * 0.045) + 'px Fredoka, sans-serif';
      ctx.fillText('SERIE x' + combo, W / 2, 22);

      // Buff-Meldungen unter der Serie: Dash-Rabatt ab 10, Sprung-Boost ab 20.
      // Bleiben sichtbar, solange die Streak hält — sind die Erklärung für
      // den goldenen Glanz am Dash-Button bzw. am Monster.
      let by = 22 + U * 0.05;
      ctx.font = '700 ' + (U * 0.028) + 'px Fredoka, sans-serif';
      if (combo >= 10){
        ctx.fillStyle = '#B45309';
        ctx.fillText('⚡ DASH −50%', W / 2, by);
        by += U * 0.034;
      }
      if (combo >= 20){
        ctx.fillStyle = '#B45309';
        ctx.fillText('⤒ SPRUNG +8%', W / 2, by);
      }
    }
  }

  // Runder Button (weiß mit lila Rand, Icon in der Mitte)
  function drawRoundBtn(b, glyph, iconColor){
    const ctx = view.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.20)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = iconColor;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke();
    ctx.fillStyle = iconColor;
    ctx.font = '700 ' + (b.r * 1.0) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, b.x, b.y + 1);
  }

  // Stats/Chart-Button (Pause) + Mute — Top-Right, immer sichtbar in PLAY
  function drawTopButtons(paused){
    const stats = FE.player.statsBtnRect();
    const mute  = FE.player.muteBtnRect();
    // Stats: 📊 im PLAY, ✕ im PAUSED (Close)
    drawRoundBtn(stats, paused ? '✕' : '📊', '#8B5CF6');
    drawRoundBtn(mute, FE.util.audio.muted ? '🔇' : '🔊', '#8B5CF6');
  }

  // ── Dash-Button ─────────────────────────────────────────────────────
  function drawDashBtn(){
    const ctx = view.ctx;
    const b = FE.player.dashBtnRect();
    const ready = FE.player.state.dashCd <= 0;
    const boosted = FE.platforms.state.combo >= 10;

    // Goldener Glanz-Ring bei aktivem Dash-Rabatt (Combo ≥ 10).
    // Puls-Alpha macht den Effekt lebendig, ohne zu blenden.
    if (boosted){
      const t = performance.now() * 0.001;
      const pulse = 0.6 + 0.4 * Math.sin(t * 3);
      ctx.save();
      ctx.shadowColor = 'rgba(251, 191, 36, ' + (0.85 * pulse) + ')';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = 'rgba(251, 191, 36, ' + (0.7 + 0.3 * pulse) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, 7); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.25)';
    ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.restore();

    ctx.lineWidth = 3;
    ctx.strokeStyle = boosted ? '#F59E0B' : (ready ? '#8B5CF6' : '#B5A8C4');
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke();

    if (!ready){
      const cdN = FE.player.state.dashCd / FE.player.DASH_CD;
      ctx.strokeStyle = boosted ? '#F59E0B' : '#8B5CF6'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, -Math.PI/2, -Math.PI/2 + (1 - cdN) * 2 * Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = boosted ? '#D97706' : (ready ? '#8B5CF6' : '#B5A8C4');
    ctx.font = '700 ' + (b.r * 0.9) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⤒', b.x, b.y + 1);

    // Orbierende Funken zusätzlich zum Ring — verstärken den Glitzer-Eindruck.
    if (boosted){
      const t = performance.now() * 0.001;
      const orbR = b.r + 10;
      for (let i = 0; i < 4; i++){
        const ang = t * 1.4 + i * (Math.PI / 2);
        const sx = b.x + Math.cos(ang) * orbR;
        const sy = b.y + Math.sin(ang) * orbR;
        const twinkle = 0.4 + 0.6 * Math.sin(t * 6 + i * 1.7);
        ctx.fillStyle = 'rgba(253, 224, 71, ' + (0.35 + 0.6 * twinkle) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, 1.6 + twinkle * 1.8, 0, 7); ctx.fill();
      }
    }
  }

  // ── 2b: Akku-Kugeln ─────────────────────────────────────────────────
  function drawOrbs(camY){
    const ctx = view.ctx;
    for (const o of FE.platforms.state.orbs){
      if (o.collected) continue;
      const sy = o.y - camY;
      if (sy < -60 || sy > view.H + 60) continue;
      // Puls-Glow — signalisiert "sammeln!"
      const pulse = 0.5 + 0.5 * Math.sin(o.pulse * 4);
      ctx.save();
      ctx.shadowColor = 'rgba(234,179,8,' + (0.5 + 0.3 * pulse) + ')';
      ctx.shadowBlur  = 22 + pulse * 6;
      // Radialer Gradient von hellgelb nach amber
      const grad = ctx.createRadialGradient(o.x, sy, o.r * 0.1, o.x, sy, o.r);
      grad.addColorStop(0, '#FEF3C7');
      grad.addColorStop(1, '#F59E0B');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(o.x, sy, o.r, 0, 7); ctx.fill();
      ctx.restore();
      // Blitz-Icon in der Mitte
      if (sprites.orb){
        const iconSize = o.r * 1.1;
        ctx.drawImage(sprites.orb, o.x - iconSize/2, sy - iconSize/2, iconSize, iconSize);
      }
    }
  }

  // ── 2c: Realitätscheck-Balken ───────────────────────────────────────
  function drawBars(camY){
    const ctx = view.ctx, W = view.W, U = view.U;
    const th = FE.platforms.BAR_THICKNESS;
    for (const b of FE.platforms.state.bars){
      const sy = b.y - camY;
      if (sy < -th || sy > view.H + th) continue;
      const top = sy - th / 2;
      // Bereits durchbrochen → verblasst
      if (b.passed){
        ctx.save();
        ctx.globalAlpha = Math.max(0, 0.6 - b.life * 0.4);
        ctx.fillStyle = '#93C5FD';
        ctx.fillRect(0, top, W, th);
        ctx.restore();
        continue;
      }
      // Roter Balken mit vertikalem Gradient und Puls
      const pulse = 0.7 + 0.3 * Math.sin(b.life * 6);
      const grad = ctx.createLinearGradient(0, top, 0, top + th);
      grad.addColorStop(0,   'rgba(220, 38, 38, ' + (0.85 * pulse) + ')');
      grad.addColorStop(0.5, 'rgba(239, 68, 68, ' + (0.95 * pulse) + ')');
      grad.addColorStop(1,   'rgba(220, 38, 38, ' + (0.85 * pulse) + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, top, W, th);

      // Warn-Streifen oben/unten (heller Rand)
      ctx.fillStyle = 'rgba(254, 202, 202, 0.9)';
      ctx.fillRect(0, top, W, 3);
      ctx.fillRect(0, top + th - 3, W, 3);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 ' + (U * 0.048) + 'px Fredoka, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(120, 0, 0, .6)';
      ctx.shadowBlur = 8;
      ctx.fillText('REALITÄTSCHECK', W / 2, top + th / 2);
      ctx.shadowBlur = 0;
    }
  }

  // ── 2b: Akku-HUD ────────────────────────────────────────────────────
  function drawBattery(pct){
    const ctx = view.ctx, U = view.U;
    // Pill unterhalb der Score-Pill (die ist bei x=12, y=12, h=U*0.12)
    const x = 12;
    const y = 12 + U * 0.12 + 6;
    const w = U * 0.32;
    const h = U * 0.032;

    // Container mit Batterie-Look — kleiner Nippel rechts
    const nubW = 4, nubH = h * 0.55;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.15)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    rr(ctx, x, y, w, h, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    rr(ctx, x + w, y + (h - nubH) / 2, nubW, nubH, 2); ctx.fill();
    ctx.restore();

    // Füllfarbe: grün → gelb → rot je nach Stand, mit Blinken unter LOW
    const low = pct < FE.main.BATTERY_LOW;
    let color;
    if (low){
      const blink = 0.5 + 0.5 * Math.sin(performance.now() * 0.018);
      const alpha = 0.55 + 0.45 * blink;
      color = 'rgba(239, 68, 68, ' + alpha + ')';
    } else if (pct < 50){
      color = '#EAB308';
    } else {
      color = '#22C55E';
    }
    const pad = 2;
    const fillW = Math.max(0, (w - 2 * pad) * (pct / 100));
    ctx.fillStyle = color;
    rr(ctx, x + pad, y + pad, fillW, h - 2 * pad, 4); ctx.fill();

    // Prozent-Text rechts neben der Pill
    ctx.fillStyle = '#2A2439';
    ctx.font = '600 ' + (U * 0.024) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pct) + ' %', x + w + nubW + 8, y + h / 2);
  }

  preloadSprites();

  FE.render = {
    drawBackdrop, drawPlat, drawMon, drawFX, drawHUD, drawDashBtn, drawTopButtons,
    drawOrbs, drawBars, drawBattery,
    sprites, rr
  };
})();
