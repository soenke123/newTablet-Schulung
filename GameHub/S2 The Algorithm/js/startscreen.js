(function () {
  'use strict';

  const CARD_DATA = [
    {
      icon: '🎯',
      title: 'Dein Ziel',
      text: 'Du bist der <strong>Algorithmus</strong> eines Smartphones. Deine Aufgabe: Halte den <strong>User</strong> von <strong>15:00 bis 03:00 Uhr</strong> am Handy. Dazu spielst du Karten, die steuern, was er zu sehen bekommt. Hält er <strong>12 Stunden</strong> durch, gewinnst du.',
    },
    {
      icon: '🃏',
      title: 'Deine Handkarten',
      text: 'Du bekommst Karten aus drei App-Typen:<br><strong>🔴 Video</strong> — hält Dopamin am Fließen, kann aber sättigen.<br><strong>🟢 Messenger</strong> — hält Freundschaftsdruck in Schach.<br><strong>🔵 Spiel</strong> — pausiert kurz den Dopaminverlust, bringt aber andere Probleme.',
    },
    {
      icon: '📊',
      title: 'Deine 3 Basiswerte',
      text: '<strong>Dopamin</strong> läuft ständig leer — fällt er auf 0, ist das Spiel vorbei.<br><strong>Sozialdrang</strong> steigt, wenn echte Kontakte ignoriert werden — zu hoch und der User legt das Handy weg.<br><strong>Reizschwelle</strong> steigt mit der Zeit — dein Content muss mit dem Reiz mitwachsen.',
    },
    {
      icon: '⭐',
      title: 'Interessen kennen',
      text: 'Dein User hat <strong>8 mögliche Themen</strong> — von Memes bis Sport. Beim Start werden zufällig <strong>1 Hauptinteresse</strong>, 2 hohe und 5 geringe zugewiesen. Ein guter <strong>Mix aus interessantem und weniger interessantem Content</strong> hält den Feed spannend. Nur das <strong>Hauptinteresse</strong> gibt einen echten Extra-Dopaminschub.',
    },
    {
      icon: '⚠️',
      title: 'Störfaktoren',
      text: 'Das Leben macht nicht mit. Zwischendurch tauchen <strong>Ereignisse</strong> auf: kein WLAN, ein Treffen mit Freunden, der Drang einzuschlafen. Diese Events können Basiswerte hart treffen. <strong>Sei vorbereitet</strong> oder reagiere schnell.',
    },
    {
      icon: '🧠',
      title: 'Was ist Dopamin?',
      text: 'Dopamin ist ein <strong>Botenstoff im Gehirn</strong> — aber er wird nicht ausgeschüttet, weil etwas Gutes passiert ist. Er wird ausgeschüttet bei der <strong>Hoffnung, dass etwas Gutes kommen könnte</strong>. Ob es dann wirklich kommt, ist egal. Genau diese Ungewissheit hält dich am Scrollen — dein Gehirn jagt dem nächsten <strong>Vielleicht</strong> hinterher.',
    },
    {
      icon: '🎰',
      title: 'Das Slot-Maschinen-Prinzip',
      text: 'Nicht jede Belohnung kommt garantiert — und genau das macht es fies. Dieses Prinzip heißt <strong>Intermittierende Verstärkung</strong>. Wenn du nie weißt, ob der nächste Scroll das lustige Video bringt, hörst du nicht auf zu scrollen. Genau so sind <strong>TikTok, Instagram & Co.</strong> gebaut.',
    },
    {
      icon: '🔄',
      title: 'Der Kreislauf',
      text: '<strong>Reiz</strong> (Benachrichtigung) → <strong>Drang</strong> (nachschauen müssen) → <strong>Handlung</strong> (Handy hoch) → <strong>Dopamin</strong> (kurze Befriedigung) → von vorne. Je öfter das passiert, desto tiefer gräbt sich das Muster ein. Dein Gehirn baut <strong>automatische Bahnen</strong> — Gewohnheiten, die schwer zu brechen sind.',
    },
    {
      icon: '💻',
      title: 'Woher wissen Apps, was dich interessiert?',
      text: 'Apps sammeln ständig Daten über dein Verhalten:<br><strong>Likes & Klicks</strong> zeigen, was du spannend findest.<br><strong>Watchtime</strong> misst, wie lange du Inhalte anschaust.<br><strong>Algorithmen</strong> vergleichen dein Verhalten mit anderen Nutzern und schlagen dir ähnliche Inhalte vor.',
    },
    {
      icon: '💰',
      title: 'Deine Aufmerksamkeit ist ihr Produkt',
      text: 'TikTok, Instagram, YouTube — kostenlos. Aber du zahlst mit deiner <strong>Zeit und Aufmerksamkeit</strong>. Mehr Zeit in der App = mehr Werbung gesehen = mehr Geld für den Konzern. Es geht nicht darum, dass du <strong>Spaß</strong> hast. Es geht darum, dass du <strong>möglichst lange bleibst</strong>.',
    },
  ];

  const N         = CARD_DATA.length;
  const CARD_STEP = 366; // px between card centers (card 330 + gap 36)

  // Continuous float position — 0.0 = card 0 centered, 1.0 = card 1, etc.
  // Never clamped: circular math handles wrapping.
  let floatIndex     = 0;
  let baseFloatIndex = 0; // snapshot at pointerdown

  let pointerDown = false;
  let startX      = 0;
  let dragX       = 0;
  let prevX       = 0;
  let prevT       = 0;
  let velX        = 0; // px/ms, updated on every pointermove

  let rafId = null;

  const viewport = document.getElementById('carousel-viewport');
  const track    = document.getElementById('carousel-track');
  const dotsEl   = document.getElementById('carousel-dots');
  if (!viewport || !track || !dotsEl) return;

  // ── Build DOM ──────────────────────────────────────────────────────────
  CARD_DATA.forEach((data) => {
    const el = document.createElement('div');
    el.className = 'info-card';
    el.innerHTML =
      `<div class="info-card-icon">${data.icon}</div>` +
      `<div class="info-card-title">${data.title}</div>` +
      `<div class="info-card-text">${data.text}</div>`;
    track.appendChild(el);
  });

  CARD_DATA.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'carousel-dot';
    dot.addEventListener('click', () => dotClick(i));
    dotsEl.appendChild(dot);
  });

  // ── Math ───────────────────────────────────────────────────────────────
  function mod(n, m) { return ((n % m) + m) % m; }

  // Shortest signed circular offset of integer card i from float position fi.
  // Result is in (-N/2 … +N/2].
  function circDist(i, fi) {
    let d = mod(i - fi, N);
    if (d > N / 2) d -= N;
    return d;
  }

  // ── Rendering — no CSS transitions, all driven by rAF ──────────────────
  function styleCard(card, i) {
    const dist    = circDist(i, floatIndex);
    const absDist = Math.abs(dist);

    let scale, sat, bri, opacity, rotY, zIndex;

    if (absDist <= 1) {
      scale   = 1 - absDist * 0.15;
      sat     = 1 - absDist * 0.65;
      bri     = 1 - absDist * 0.45;
      opacity = 1 - absDist * 0.25;
      rotY    = dist * 7;
      zIndex  = 10 - Math.round(absDist * 3);
    } else if (absDist <= 2) {
      const t = absDist - 1;
      scale   = 0.85 - t * 0.13;
      sat     = 0.35 - t * 0.20;
      bri     = 0.55 - t * 0.20;
      opacity = 0.75 - t * 0.35;
      rotY    = Math.sign(dist) * (7 + t * 3);
      zIndex  = 5 - Math.round(t * 4);
    } else {
      scale   = 0.72;
      sat     = 0.12;
      bri     = 0.32;
      opacity = Math.max(0, 0.4 - (absDist - 2) * 0.25);
      rotY    = Math.sign(dist) * 10;
      zIndex  = 0;
    }

    const tx = dist * CARD_STEP;
    card.style.transition = 'none'; // rAF owns all motion
    card.style.transform  = `translateX(calc(-50% + ${tx}px)) translateY(-50%) scale(${scale.toFixed(4)}) rotateY(${rotY.toFixed(2)}deg)`;
    card.style.filter     = `saturate(${sat.toFixed(4)}) brightness(${bri.toFixed(4)})`;
    card.style.opacity    = opacity.toFixed(4);
    card.style.zIndex     = zIndex;

    if (absDist < 0.25) {
      card.style.boxShadow   = '0 20px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(0,255,153,.18)';
      card.style.borderColor = 'rgba(0,255,153,.22)';
      card.style.background  = 'rgba(255,255,255,.07)';
    } else {
      card.style.boxShadow   = '0 8px 28px rgba(0,0,0,.35)';
      card.style.borderColor = 'rgba(255,255,255,.08)';
      card.style.background  = 'rgba(255,255,255,.03)';
    }
  }

  function renderAll() {
    track.querySelectorAll('.info-card').forEach((card, i) => styleCard(card, i));
    const nearest = mod(Math.round(floatIndex), N);
    dotsEl.querySelectorAll('.carousel-dot').forEach((dot, i) =>
      dot.classList.toggle('active', i === nearest)
    );
  }

  // ── Animation ─────────────────────────────────────────────────────────
  // Ease-out: fast at first (spinning), gradually decelerates to a stop.
  // Power 3 feels like a real wheel; higher = more aggressive deceleration.
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function animateTo(targetFi, dur) {
    cancelAnimationFrame(rafId);
    const startFi = floatIndex;
    const t0      = performance.now();

    function tick(now) {
      const t = Math.min((now - t0) / dur, 1);
      floatIndex = startFi + (targetFi - startFi) * easeOut(t);
      renderAll();
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        floatIndex = targetFi; // land exactly
        renderAll();
        rafId = null;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  // Dot click: jump to card i via shortest circular path
  function dotClick(i) {
    cancelAnimationFrame(rafId);
    // Find delta to reach card i from current float position
    const nearest = Math.round(floatIndex);
    let delta = i - mod(nearest, N);
    if (delta >  N / 2) delta -= N; // prefer shorter arc
    if (delta < -N / 2) delta += N;
    animateTo(floatIndex + delta, 320 + Math.abs(delta) * 80);
  }

  // ── Velocity → skip count ─────────────────────────────────────────────
  // velX is in px/ms. Typical iPad swipe: 0.1 – 2.0 px/ms.
  function speedToSkips(speedPx) {
    if (speedPx < 0.12) return 0;
    if (speedPx < 0.35) return 1;
    if (speedPx < 0.75) return 2;
    if (speedPx < 1.40) return 3;
    return 4;
  }

  // ── Pointer events ────────────────────────────────────────────────────
  viewport.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    cancelAnimationFrame(rafId);
    rafId          = null;
    pointerDown    = true;
    baseFloatIndex = floatIndex;
    startX = prevX = e.clientX;
    dragX  = 0;
    prevT  = performance.now();
    velX   = 0;
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  viewport.addEventListener('pointermove', e => {
    if (!pointerDown) return;
    const now = performance.now();
    const dt  = now - prevT;
    // Weighted velocity: recent movement weighted more
    if (dt > 0) velX = velX * 0.6 + (e.clientX - prevX) / dt * 0.4;
    prevX      = e.clientX;
    prevT      = now;
    dragX      = e.clientX - startX;
    // 1:1 finger tracking — no transitions
    floatIndex = baseFloatIndex - dragX / CARD_STEP;
    renderAll();
  });

  function endDrag() {
    if (!pointerDown) return;
    pointerDown = false;

    const speed  = Math.abs(velX);
    const skips  = speedToSkips(speed);
    // Right swipe (velX > 0) = go backward = negative floatIndex direction
    const dir    = velX >= 0 ? -1 : 1;

    let targetFi;
    if (skips > 0) {
      // Snap to nearest card in direction of travel, then add extra skips
      const nearestInDir = dir > 0 ? Math.floor(floatIndex + 0.5) : Math.ceil(floatIndex - 0.5);
      targetFi = nearestInDir + (skips - 1) * dir;
    } else {
      // No flick: snap to nearest card (respects partial drag)
      targetFi = Math.round(floatIndex);
    }

    // Duration scales with distance — fast fling = longer spin = natural feel
    const travel = Math.abs(targetFi - floatIndex);
    const dur    = 280 + travel * 120;

    animateTo(targetFi, dur);
  }

  viewport.addEventListener('pointerup',     endDrag);
  viewport.addEventListener('pointercancel', () => {
    if (!pointerDown) return;
    pointerDown = false;
    animateTo(Math.round(floatIndex), 220);
  });

  // ── Init ──────────────────────────────────────────────────────────────
  renderAll();
})();
