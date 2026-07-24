// Menu / Over / Filter-Bubble im Instagram-Sunset-Look.
// Der Filter-Bubble-Screen ist die didaktische Kern-Auszahlung.
// Er vergleicht "Start" (gleichmäßige Verteilung, 1/N pro Kategorie)
// mit dem aktuellen Zustand des Algorithmus.
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};
  const { view } = FE.util;
  const { rr } = FE.render;

  // Farb-Palette. MINT/CORAL sind aus der Historie beibehalten — die WERTE
  // sind jetzt Blau (gut) / Petrol (schlecht), analog zum Signal-Streifen
  // auf den Post-Karten. Bewusst kühl & nah beieinander (barrierefrei für
  // Rot/Grün-Schwäche), aber klar unterscheidbar.
  const INK        = '#2A2439';
  const INK_SOFT   = '#6b6472';
  const CORAL      = '#0E7490';   // Petrol (schlecht) — Chart-Linien, Marker
  const CORAL_DEEP = '#155E75';   // Petrol dunkel — Chip-Text
  const PURPLE     = '#8B5CF6';
  const MINT       = '#2563EB';   // Blau (gut) — Chart-Linien, Marker
  const MINT_DEEP  = '#1E40AF';   // Blau dunkel — Chip-Text
  const CREAM_HL   = '#FFE1BE';
  const GOOD_HL_BG = '#DBEAFE';   // Chip-Hintergrund gut (helles Blau)
  const BAD_HL_BG  = '#CFFAFE';   // Chip-Hintergrund schlecht (helles Petrol)

  function centerLines(lines){
    const ctx = view.ctx, W = view.W;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of lines){
      ctx.fillStyle = l.col || INK;
      ctx.font = l.font;
      ctx.fillText(l.t, W / 2, l.y);
    }
  }

  // ── Menü ────────────────────────────────────────────────────────────
  function drawMenu(highScore){
    const ctx = view.ctx, W = view.W, H = view.H, U = view.U;

    // Leichte weiße Aufhellung, damit Text lesbar ist über dem Sunset
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(0, 0, W, H);

    // Titel
    centerLines([
      { t: 'BUBBLE', y: H * 0.22,             font: '700 ' + (U * 0.14)  + 'px Fredoka, sans-serif', col: CORAL },
      { t: 'BOUNCE', y: H * 0.22 + U * 0.14,  font: '700 ' + (U * 0.14)  + 'px Fredoka, sans-serif', col: PURPLE }
    ]);

    // Lead + Regel-Zeilen
    centerLines([
      { t: 'Spring so hoch du kannst —',                   y: H * 0.44,             font: '500 ' + (U * 0.036) + 'px Fredoka, sans-serif', col: INK },
      { t: 'von Post zu Post.',                            y: H * 0.44 + U * 0.048, font: '500 ' + (U * 0.036) + 'px Fredoka, sans-serif', col: INK }
    ]);

    // Chip-Zeile für gut/schlecht — hebt sich vom Text ab.
    // Bewusst Text-Labels statt Icon-Reihe: das Menü darf nicht davon
    // abhängen, dass externe Icon-SVGs schon geladen sind.
    const chipY = H * 0.55;
    drawChip(ctx, W/2 - U*0.34, chipY,        U*0.68, U*0.05, 'Fakten · Quellen · Wissenschaft', MINT_DEEP,  GOOD_HL_BG);
    drawChip(ctx, W/2 - U*0.34, chipY+U*0.07, U*0.68, U*0.05, 'Klickbait · Fake · Verschwörung',  CORAL_DEEP, BAD_HL_BG);

    centerLines([
      { t: 'Gute Posts geben Punkte, schlechte ziehen ab —', y: H * 0.66,             font: '500 ' + (U * 0.028) + 'px Fredoka, sans-serif', col: INK_SOFT },
      { t: 'und dein Feed lernt mit.',                       y: H * 0.66 + U * 0.04,  font: '500 ' + (U * 0.028) + 'px Fredoka, sans-serif', col: INK_SOFT }
    ]);

    centerLines([
      { t: 'Wischen = steuern  •  ⤒ = Dash',               y: H * 0.74,             font: '500 ' + (U * 0.028) + 'px Fredoka, sans-serif', col: INK_SOFT }
    ]);

    // Best-Score
    centerLines([
      { t: 'BEST  ' + highScore, y: H * 0.80, font: '700 ' + (U * 0.05) + 'px Fredoka, sans-serif', col: '#8a3d20' }
    ]);

    // CTA
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 350);
    const btnW = U * 0.6, btnH = U * 0.11;
    const btnX = W/2 - btnW/2, btnY = H * 0.87;
    ctx.save();
    ctx.shadowColor = 'rgba(139,92,246,.4)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    ctx.fillStyle = PURPLE;
    rr(ctx, btnX, btnY, btnW, btnH, btnH/2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + (U * 0.045) + 'px Fredoka, sans-serif';
    ctx.fillText('▶ TIPPEN ZUM START', W/2, btnY + btnH/2);
    ctx.globalAlpha = 1;
  }

  function drawChip(ctx, x, y, w, h, text, textCol, bgCol){
    const U = view.U;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.15)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = bgCol;
    rr(ctx, x, y, w, h, h/2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = textCol;
    ctx.font = '600 ' + (U * 0.030) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w/2, y + h/2);
  }

  // ── Game Over ───────────────────────────────────────────────────────
  function drawOver(score, highScore, newBest, restartReady){
    const ctx = view.ctx, W = view.W, H = view.H, U = view.U;
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(0, 0, W, H);

    // Card-Container
    const cardW = W * 0.82, cardH = H * 0.42;
    const cardX = (W - cardW) / 2, cardY = H * 0.27;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.25)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#ffffff';
    rr(ctx, cardX, cardY, cardW, cardH, 22); ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = CORAL_DEEP;
    ctx.font = '700 ' + (U * 0.055) + 'px Fredoka, sans-serif';
    ctx.fillText('DURCHGEFALLEN', W/2, cardY + U * 0.08);

    ctx.fillStyle = INK;
    ctx.font = '700 ' + (U * 0.14) + 'px Fredoka, sans-serif';
    ctx.fillText(String(score), W/2, cardY + cardH * 0.44);

    ctx.fillStyle = INK_SOFT;
    ctx.font = '500 ' + (U * 0.03) + 'px Fredoka, sans-serif';
    ctx.fillText('Punkte', W/2, cardY + cardH * 0.44 + U * 0.09);

    ctx.fillStyle = '#8a3d20';
    ctx.font = '700 ' + (U * 0.04) + 'px Fredoka, sans-serif';
    ctx.fillText('BEST  ' + highScore, W/2, cardY + cardH * 0.72);

    if (newBest){
      ctx.fillStyle = CORAL;
      ctx.font = '700 ' + (U * 0.04) + 'px Fredoka, sans-serif';
      ctx.fillText('🏆 NEUER REKORD!', W/2, cardY + cardH * 0.87);
    }

    if (restartReady){
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 350);
      const btnW = U * 0.5, btnH = U * 0.1;
      const btnX = W/2 - btnW/2, btnY = H * 0.86;
      ctx.save();
      ctx.shadowColor = 'rgba(139,92,246,.4)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      ctx.fillStyle = PURPLE;
      rr(ctx, btnX, btnY, btnW, btnH, btnH/2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 ' + (U * 0.042) + 'px Fredoka, sans-serif';
      ctx.fillText('↻ NOCHMAL', W/2, btnY + btnH/2);
      ctx.globalAlpha = 1;
    }
  }

  // ── Filter-Bubble: Verlaufs-Diagramm ────────────────────────────────
  // Zeigt für jede Kategorie, wie sich ihre Wahrscheinlichkeit über
  // den Verlauf der Runde verändert hat. X-Achse: Interaktions-Zeit.
  // Y-Achse: Anteil im Feed. Grüne Linien = seriöse Quellen, rote =
  // Warnsignale. So sieht der Spieler: "Klickbait ist explodiert,
  // Wissenschaft geschrumpft — der Algo hat mich in eine Blase geführt."
  function drawFilterBubble(midGame){
    const ctx = view.ctx, W = view.W, H = view.H, U = view.U;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(0, 0, W, H);

    // Titel
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = PURPLE;
    ctx.font = '700 ' + (U * 0.068) + 'px Fredoka, sans-serif';
    ctx.fillText(midGame ? 'Dein Feed – live' : 'Deine Filterblase', W/2, U * 0.11);
    ctx.fillStyle = INK_SOFT;
    ctx.font = '500 ' + (U * 0.03) + 'px Fredoka, sans-serif';
    ctx.fillText(
      midGame ? 'So verändert sich dein Feed gerade'
              : 'So hat sich dein Feed über die Runde entwickelt',
      W/2, U * 0.11 + U * 0.055
    );

    // Chart-Bereich (breiter, damit rechts Platz für Icon-Cluster ist)
    const chartX = W * 0.06;
    const chartY = H * 0.19;
    const chartW = W * 0.88;
    const chartH = H * 0.42;
    drawHistoryChart(chartX, chartY, chartW, chartH);

    // Top-Bewegungen (max. 3 stärkste Verschiebungen)
    const startP  = FE.algorithm.startProbability();
    const current = FE.algorithm.currentProbabilities();
    const movers  = current
      .map(it => ({ cat: it.cat, end: it.pct, delta: it.pct - startP }))
      .filter(m => Math.abs(m.delta) > 0.01)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);

    const moverY = H * 0.66;
    if (movers.length){
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = INK_SOFT;
      ctx.font = '600 ' + (U * 0.028) + 'px Fredoka, sans-serif';
      ctx.fillText('GRÖSSTE VERSCHIEBUNGEN', W/2, moverY);

      const chipY = moverY + U * 0.045;
      const chipH = U * 0.075;
      const gap   = U * 0.02;
      const iconSz = U * 0.035;
      const iconGap = 6;
      let totalW = 0;
      const chipWidths = movers.map(m => {
        ctx.font = '700 ' + (U * 0.028) + 'px Fredoka, sans-serif';
        const dPct = Math.round(m.delta * 100);
        const label = (dPct > 0 ? '+' : '') + dPct;
        const contentW = iconSz + iconGap + ctx.measureText(label).width;
        const w = contentW + U * 0.05;
        totalW += w; return w;
      });
      totalW += gap * (movers.length - 1);
      let xx = W/2 - totalW/2;
      movers.forEach((m, i) => {
        const w = chipWidths[i];
        const dPct = Math.round(m.delta * 100);
        const isUp = dPct > 0;
        // Hintergrund: helle Version der "Richtung" (nicht der Kategorie).
        // Gut hoch / Schlecht runter = Blau (Feed wird besser).
        // Schlecht hoch / Gut runter = Petrol (Feed driftet).
        const bg   = isUp ? (m.cat.type === 'good' ? GOOD_HL_BG : BAD_HL_BG)
                          : (m.cat.type === 'good' ? BAD_HL_BG  : GOOD_HL_BG);
        const col  = isUp ? (m.cat.type === 'good' ? MINT_DEEP : CORAL_DEEP)
                          : (m.cat.type === 'good' ? CORAL_DEEP : MINT_DEEP);
        ctx.save();
        ctx.shadowColor = 'rgba(60,40,80,.12)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.fillStyle = bg;
        rr(ctx, xx, chipY, w, chipH, chipH/2); ctx.fill();
        ctx.restore();

        // Icon + Delta-Zahl nebeneinander, gemeinsam im Chip zentriert
        ctx.font = '700 ' + (U * 0.028) + 'px Fredoka, sans-serif';
        const label = (dPct > 0 ? '+' : '') + dPct;
        const txtW = ctx.measureText(label).width;
        const contentW = iconSz + iconGap + txtW;
        const innerX = xx + (w - contentW) / 2;
        const midY = chipY + chipH / 2;

        const iconImg = FE.render.sprites.categories[m.cat.id];
        if (iconImg){
          ctx.drawImage(iconImg, innerX, midY - iconSz/2, iconSz, iconSz);
        }
        ctx.fillStyle = col;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, innerX + iconSz + iconGap, midY);
        xx += w + gap;
      });
    }

    // Coaching-Zeile
    const coachY = H * 0.86;
    let coachTxt = 'Der Algorithmus hat gelernt, was dir gefällt.';
    let coachCol = CORAL_DEEP;
    let coachBg  = CREAM_HL;
    const worst = FE.algorithm.worstBadShare();
    const good  = FE.algorithm.goodShare();
    if (worst.pct > 0.30){
      coachTxt = 'Blase steht: ' + Math.round(worst.pct * 100) + ' % ' + worst.cat.label + '.';
      coachCol = CORAL_DEEP;
    } else if (good > 0.65){
      coachTxt = Math.round(good * 100) + ' % geprüfte Quellen — starker Feed.';
      coachCol = MINT_DEEP;
      coachBg  = GOOD_HL_BG;
    }
    const coachW = W * 0.86, coachH = U * 0.08;
    const coachX = W/2 - coachW/2, coachYY = coachY - coachH/2;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = coachBg;
    rr(ctx, coachX, coachYY, coachW, coachH, 14); ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = coachCol;
    ctx.font = '700 ' + (U * 0.032) + 'px Fredoka, sans-serif';
    ctx.fillText(coachTxt, W/2, coachY);

    // Weiter-Hinweis (Text unterschiedlich je nach End vs. Pause)
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 350);
    ctx.globalAlpha = pulse;
    ctx.font = '700 ' + (U * 0.036) + 'px Fredoka, sans-serif';
    ctx.fillStyle = INK;
    ctx.fillText(midGame ? '▶  TIPPEN ZUM WEITERSPIELEN' : '▶  WEITER',
                 W/2, H * 0.955);
    ctx.globalAlpha = 1;
  }

  // Zeichnet den Verlauf aller Kategorien-Wahrscheinlichkeiten über die
  // Zeit. Achsen mit Prozent-Grid, Linien je Kategorie, Icons am Ende.
  function drawHistoryChart(x, y, w, h){
    const ctx = view.ctx, U = view.U;
    const history = FE.algorithm.getHistory();

    // Chart-Card (weißer Hintergrund für Kontrast über dem Sunset)
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,80,.15)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.restore();

    // Padding innen — rechte Seite breiter für Icon-Cluster
    const padL = U * 0.08;
    const padR = U * 0.22;
    const padT = U * 0.03;
    const padB = U * 0.045;
    const cx = x + padL, cy = y + padT;
    const cw = w - padL - padR, ch = h - padT - padB;

    // Genug Daten?
    if (!history || history.length < 2){
      ctx.fillStyle = INK_SOFT;
      ctx.font = '500 ' + (U * 0.028) + 'px Fredoka, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('(zu wenige Interaktionen für den Verlauf)',
                    x + w/2, y + h/2);
      return;
    }

    // Y-Skala: dynamisch, mindestens bis 50 %
    let maxY = 0.5;
    for (const snap of history){
      for (const c of FE.categories.ALL){
        const p = snap.probs[c.id] || 0;
        if (p > maxY) maxY = p;
      }
    }
    maxY = Math.ceil(maxY * 10) / 10;    // aufrunden auf 10 %

    // Y-Grid + Labels
    ctx.strokeStyle = 'rgba(60,40,80,.10)'; ctx.lineWidth = 1;
    ctx.fillStyle = INK_SOFT;
    ctx.font = '500 ' + (U * 0.022) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const gridStep = maxY >= 0.4 ? 0.2 : 0.1;
    for (let p = 0; p <= maxY + 0.001; p += gridStep){
      const yy = cy + ch - (p / maxY) * ch;
      ctx.beginPath(); ctx.moveTo(cx, yy); ctx.lineTo(cx + cw, yy); ctx.stroke();
      ctx.fillText(Math.round(p * 100) + '%', cx - 4, yy);
    }

    // X-Achsen-Label (Start / Ende)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('Start', cx, cy + ch + 4);
    ctx.textAlign = 'right';
    ctx.fillText('Ende', cx + cw, cy + ch + 4);

    // Linien pro Kategorie
    const N = history.length - 1;
    const xForT = t => cx + (N > 0 ? (t / N) * cw : 0);
    const yForP = p => cy + ch - (p / maxY) * ch;

    const cats = FE.categories.ALL.slice();
    // Sortieren: die Linie mit größter End-Y-Position zuerst zeichnen,
    // damit obenauf liegende (interessantere) Linien nicht überdeckt werden.
    cats.sort((a, b) => {
      const pa = history[history.length - 1].probs[a.id] || 0;
      const pb = history[history.length - 1].probs[b.id] || 0;
      return pa - pb;    // klein → groß
    });

    for (const cat of cats){
      const isGood = cat.type === 'good';
      const finalP = history[history.length - 1].probs[cat.id] || 0;
      const isMover = Math.abs(finalP - 1/FE.categories.ALL.length) > 0.03;

      ctx.strokeStyle = isGood ? MINT : CORAL;
      ctx.globalAlpha = isMover ? 0.85 : 0.35;
      ctx.lineWidth   = isMover ? 2.5 : 1.5;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < history.length; i++){
        const xx = xForT(i);
        const yy = yForP(history[i].probs[cat.id] || 0);
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // End-Marker (Punkte auf der Chart-Kante — echte Y-Position jeder Linie)
    for (const cat of cats){
      const finalP = history[history.length - 1].probs[cat.id] || 0;
      ctx.fillStyle = cat.type === 'good' ? MINT : CORAL;
      ctx.beginPath(); ctx.arc(cx + cw, yForP(finalP), 3, 0, 7); ctx.fill();
    }

    // ── Icon-Cluster am rechten Rand ────────────────────────────────
    // Kategorien, deren Linien-Enden nah beieinander liegen, werden
    // zu einer horizontalen Icon-Reihe zusammengefasst — statt sie
    // vertikal endlos zu stapeln.
    const iconSize  = U * 0.036;
    const iconGap   = 4;
    const rowH      = iconSize + 3;
    const gutterX   = cx + cw + 8;
    const gutterW   = padR - 12;
    const perRow    = Math.max(1, Math.floor((gutterW + iconGap) / (iconSize + iconGap)));

    // Items sortiert nach true-Y
    const items = FE.categories.ALL
      .map(cat => ({ cat, y: yForP(history[history.length - 1].probs[cat.id] || 0) }))
      .sort((a, b) => a.y - b.y);

    // Cluster bilden: benachbarte Y-Positionen innerhalb einer rowH gruppieren
    const clusterThreshold = rowH * 0.9;
    const clusters = [];
    for (const it of items){
      const last = clusters[clusters.length - 1];
      if (last && (it.y - last.maxY) < clusterThreshold){
        last.items.push(it);
        last.maxY = it.y;
      } else {
        clusters.push({ items: [it], maxY: it.y });
      }
    }
    for (const c of clusters){
      c.meanY = c.items.reduce((s, it) => s + it.y, 0) / c.items.length;
      c.rows  = Math.ceil(c.items.length / perRow);
      c.h     = c.rows * rowH;
    }

    // Anti-Overlap zwischen Clustern: mittlere Höhen so schieben,
    // dass sich die Boxen nicht überlappen. Zusätzlich in [cy, cy+ch] halten.
    for (let i = 1; i < clusters.length; i++){
      const prev = clusters[i - 1];
      const cur  = clusters[i];
      const minGap = prev.h/2 + cur.h/2 + 2;
      if (cur.meanY - prev.meanY < minGap) cur.meanY = prev.meanY + minGap;
    }
    // Am unteren Rand zurückschieben, falls das letzte Cluster überläuft
    const last = clusters[clusters.length - 1];
    if (last && last.meanY + last.h/2 > cy + ch){
      const shift = (last.meanY + last.h/2) - (cy + ch);
      for (let i = clusters.length - 1; i >= 0; i--){
        clusters[i].meanY -= shift;
        if (i > 0){
          const prev = clusters[i - 1];
          const cur  = clusters[i];
          const minGap = prev.h/2 + cur.h/2 + 2;
          if (cur.meanY - prev.meanY >= minGap) break;
          // sonst weiter nach oben schieben
        }
      }
    }

    // Icons rendern — echte SVG-Icons aus dem Sprite-Cache
    for (const c of clusters){
      const startY = c.meanY - c.h/2 + rowH/2;
      c.items.forEach((it, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const ix = gutterX + col * (iconSize + iconGap);
        const iy = startY + row * rowH;
        const iconImg = FE.render.sprites.categories[it.cat.id];
        if (iconImg){
          ctx.drawImage(iconImg, ix, iy - iconSize/2, iconSize, iconSize);
        } else {
          // Fallback: dezenter Punkt, damit Cluster-Layout nicht springt
          ctx.fillStyle = '#DBD3E0';
          ctx.beginPath(); ctx.arc(ix + iconSize/2, iy, iconSize * 0.3, 0, 7); ctx.fill();
        }
      });
    }
  }

  FE.screens = { drawMenu, drawOver, drawFilterBubble };
})();
