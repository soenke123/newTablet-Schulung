/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/photo.js   ·   Kamera und Zuschneiden
   ══════════════════════════════════════════════════════════════
   SHPhoto.camera()  → Promise<Canvas | null | 'fallback'>
       Kamera im Browser (getUserMedia), Auswahl der Kamera (vorne/
       hinten/Webcam), Auslösen. Das Bild bleibt im Gerät, bis es
       gepostet wird. 'fallback' = Kamera im Browser geht nicht (kein
       Zugriff, keine Kamera) → app.js öffnet die Kamera-App über
       <input capture>.
   SHPhoto.crop(src, { ratio }) → Promise<Canvas | null>
       Zuschneiden mit Rahmen (Ecken ziehen, Rahmen verschieben),
       Seitenverhältnis Frei · 1:1 · 4:5 · 16:9, Drehen um 90°.
       ratio fest (z. B. 1 fürs Profilbild) = keine Auswahl.
   Beides als Vollbild-Fenster über der App, ohne Bibliothek.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MAX = 2400;  // längste Seite beim Bearbeiten (Speicher am Tablet)
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
  };

  function sheet(cls, html) {
    const el = document.createElement('div');
    el.className = 'ph-back';
    el.innerHTML = '<div class="ph ' + cls + '" role="dialog">' + html + '</div>';
    document.body.appendChild(el);
    return el;
  }

  // Bild (Bitmap/Image/Canvas) als Canvas, höchstens MAX, optional gedreht
  function toCanvas(src, turns) {
    const w0 = src.width, h0 = src.height;
    const k = Math.min(1, MAX / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const q = ((turns || 0) % 4 + 4) % 4;
    const cv = document.createElement('canvas');
    cv.width = q % 2 ? h : w;
    cv.height = q % 2 ? w : h;
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.translate(cv.width / 2, cv.height / 2);
    cx.rotate(q * Math.PI / 2);
    cx.drawImage(src, -w / 2, -h / 2, w, h);
    return cv;
  }

  /* ── Kamera ─────────────────────────────────────────────── */
  async function camera() {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return 'fallback';
    let stream = null;
    const want = store.get('sh.cam');
    const open = (id) => md.getUserMedia({
      audio: false,
      video: id ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1920 } }
                : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1920 } }
    });
    try { stream = await open(want); }
    catch (e) {
      if (want) { try { stream = await open(null); } catch (e2) { stream = null; } }
      if (!stream) return 'fallback';
    }

    const el = sheet('ph--cam',
      '<div class="ph-top"><b>Foto aufnehmen</b><select class="ph-sel" id="phCams" title="Kamera wählen"></select></div>' +
      '<div class="ph-video"><video id="phV" playsinline autoplay muted></video></div>' +
      '<div class="ph-bar">' +
        '<button type="button" class="btn btn--ghost" data-ph="no">Abbrechen</button>' +
        '<button type="button" class="ph-shot" data-ph="shot" title="Auslösen" aria-label="Auslösen"><span></span></button>' +
        '<button type="button" class="btn btn--ghost" data-ph="flip" title="Andere Kamera">Wechseln</button>' +
      '</div>');
    const v = el.querySelector('#phV');
    const sel = el.querySelector('#phCams');
    let cams = [];

    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const attach = () => {
      v.srcObject = stream;
      const tr = stream.getVideoTracks()[0];
      const st = tr && tr.getSettings ? tr.getSettings() : {};
      // Frontkamera wie ein Spiegel zeigen; aufgenommen wird ungespiegelt
      v.classList.toggle('mirror', st.facingMode === 'user' || /front|user|facetime|vorder/i.test(tr ? tr.label : ''));
      if (st.deviceId) sel.value = st.deviceId;
    };
    const listCams = async () => {
      try { cams = (await md.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { cams = []; }
      sel.innerHTML = cams.map((c, i) => '<option value="' + esc(c.deviceId) + '">' + esc(c.label || ('Kamera ' + (i + 1))) + '</option>').join('');
      sel.hidden = cams.length < 2;
      el.querySelector('[data-ph="flip"]').hidden = cams.length < 2;
    };
    const use = async (id) => {
      stop();
      try { stream = await open(id); store.set('sh.cam', id); attach(); }
      catch (e) { try { stream = await open(null); attach(); } catch (e2) { /* bleibt schwarz */ } }
    };
    attach();
    await listCams();
    attach();
    sel.onchange = () => use(sel.value);

    return new Promise(res => {
      const done = (r) => { stop(); el.remove(); res(r); };
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ph]');
        if (!b) return;
        if (b.dataset.ph === 'no') done(null);
        else if (b.dataset.ph === 'flip') {
          const i = cams.findIndex(c => c.deviceId === sel.value);
          const next = cams[(i + 1) % cams.length];
          if (next) { sel.value = next.deviceId; use(next.deviceId); }
        } else if (b.dataset.ph === 'shot') {
          if (!v.videoWidth) return;
          const cv = document.createElement('canvas');
          cv.width = v.videoWidth; cv.height = v.videoHeight;
          cv.getContext('2d').drawImage(v, 0, 0);
          // Was das Gerät dazu weiß (Metadaten, 0268): Name der Kamera, Zeitpunkt
          const tr = stream && stream.getVideoTracks()[0];
          cv.shMeta = { camera: ((tr && tr.label) || 'Kamera im Browser').slice(0, 80), at: new Date() };
          done(cv);
        }
      });
    });
  }

  /* ── Zuschneiden ────────────────────────────────────────── */
  const RATIOS = [['free', 'Frei'], ['1', '1:1'], ['0.8', '4:5'], ['1.7778', '16:9']];

  function crop(src, opt) {
    opt = opt || {};
    const fixed = opt.ratio ? Number(opt.ratio) : null;
    let turns = 0;
    let work = toCanvas(src, 0);
    let ratio = fixed || (opt.start ? Number(opt.start) : null);   // null = frei
    let disp = { w: 1, h: 1 };     // Größe der Anzeige in px
    let f = null;                  // Rahmen in Anzeige-px { x, y, w, h }, relativ zum Bild
    let ox = 0, oy = 0;            // Lage des Bildes auf der Bühne

    const el = sheet('ph--crop',
      '<div class="ph-top"><b>' + esc(opt.title || 'Zuschneiden') + '</b></div>' +
      '<div class="ph-stage" id="phStage"><canvas id="phC"></canvas>' +
        '<div class="ph-frame" id="phF"><span class="ph-grid"></span>' +
        ['nw', 'ne', 'sw', 'se'].map(h => '<i data-hd="' + h + '"></i>').join('') + '</div></div>' +
      '<div class="ph-tools">' +
        (fixed ? '' : '<div class="seg seg--s ph-ratios">' + RATIOS.map(r => '<button type="button" data-r="' + r[0] + '">' + r[1] + '</button>').join('') + '</div>') +
        '<button type="button" class="btn btn--ghost btn--s" data-ph="rot" title="Um 90° drehen">↻ Drehen</button>' +
      '</div>' +
      '<div class="ph-bar ph-bar--end">' +
        '<button type="button" class="btn btn--ghost" data-ph="no">Abbrechen</button>' +
        '<button type="button" class="btn btn--accent" data-ph="ok">Fertig</button>' +
      '</div>');
    const stage = el.querySelector('#phStage');
    const cv = el.querySelector('#phC');
    const fr = el.querySelector('#phF');

    const markRatio = () => el.querySelectorAll('[data-r]').forEach(b =>
      b.classList.toggle('on', b.dataset.r === 'free' ? !ratio : !!ratio && Math.abs(Number(b.dataset.r) - ratio) < 1e-3));

    // größter Rahmen mit Seitenverhältnis r, mittig
    const fullFrame = () => {
      if (!ratio) return { x: 0, y: 0, w: disp.w, h: disp.h };
      let w = disp.w, h = w / ratio;
      if (h > disp.h) { h = disp.h; w = h * ratio; }
      return { x: (disp.w - w) / 2, y: (disp.h - h) / 2, w, h };
    };
    const paintFrame = () => {
      fr.style.left = (ox + f.x) + 'px'; fr.style.top = (oy + f.y) + 'px';
      fr.style.width = f.w + 'px'; fr.style.height = f.h + 'px';
    };
    const layout = (keep) => {
      const maxW = Math.max(120, stage.clientWidth), maxH = Math.max(120, stage.clientHeight);
      const k = Math.min(maxW / work.width, maxH / work.height);
      const old = disp;
      disp = { w: Math.round(work.width * k), h: Math.round(work.height * k) };
      cv.width = disp.w * (window.devicePixelRatio || 1);
      cv.height = disp.h * (window.devicePixelRatio || 1);
      cv.style.width = disp.w + 'px'; cv.style.height = disp.h + 'px';
      const cx = cv.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(work, 0, 0, cv.width, cv.height);
      // Bühne: Bild mittig, Rahmen relativ zum Bild
      ox = Math.round((maxW - disp.w) / 2); oy = Math.round((maxH - disp.h) / 2);
      cv.style.left = ox + 'px'; cv.style.top = oy + 'px';
      if (keep && f) { const s = disp.w / old.w; f = { x: f.x * s, y: f.y * s, w: f.w * s, h: f.h * s }; }
      else f = fullFrame();
      paintFrame();
    };

    // Ziehen: im Rahmen = verschieben, an einer Ecke = Größe
    let drag = null;
    const MIN = 40;
    stage.addEventListener('pointerdown', (e) => {
      const hd = e.target.closest('[data-hd]');
      if (!hd && !e.target.closest('#phF')) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, hd: hd ? hd.dataset.hd : null, sx: e.clientX, sy: e.clientY, f0: Object.assign({}, f) };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, a = drag.f0;
      if (!drag.hd) {
        f.x = Math.min(Math.max(0, a.x + dx), disp.w - a.w);
        f.y = Math.min(Math.max(0, a.y + dy), disp.h - a.h);
      } else {
        // fester Punkt = gegenüberliegende Ecke
        const west = drag.hd[1] === 'w', north = drag.hd[0] === 'n';
        const ax = west ? a.x + a.w : a.x, ay = north ? a.y + a.h : a.y;
        let px = Math.min(Math.max(0, (west ? a.x : a.x + a.w) + dx), disp.w);
        let py = Math.min(Math.max(0, (north ? a.y : a.y + a.h) + dy), disp.h);
        let w = Math.max(MIN, Math.abs(px - ax)), h = Math.max(MIN, Math.abs(py - ay));
        if (ratio) {
          // an der längeren Bewegung ausrichten, dann in die Grenzen
          if (w / h > ratio) h = w / ratio; else w = h * ratio;
          const roomW = west ? ax : disp.w - ax, roomH = north ? ay : disp.h - ay;
          if (w > roomW) { w = roomW; h = w / ratio; }
          if (h > roomH) { h = roomH; w = h * ratio; }
        } else {
          w = Math.min(w, west ? ax : disp.w - ax);
          h = Math.min(h, north ? ay : disp.h - ay);
        }
        f = { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
      }
      paintFrame();
    });
    const end = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    const onResize = () => layout(true);
    window.addEventListener('resize', onResize);

    markRatio();
    requestAnimationFrame(() => layout(false));

    return new Promise(res => {
      const done = (r) => { window.removeEventListener('resize', onResize); el.remove(); res(r); };
      el.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]');
        if (r) { ratio = r.dataset.r === 'free' ? null : Number(r.dataset.r); markRatio(); f = fullFrame(); paintFrame(); return; }
        const b = e.target.closest('[data-ph]');
        if (!b) return;
        if (b.dataset.ph === 'no') done(null);
        else if (b.dataset.ph === 'rot') { turns = (turns + 1) % 4; work = toCanvas(src, turns); layout(false); }
        else if (b.dataset.ph === 'ok') {
          const k = work.width / disp.w;
          const sx = Math.round(f.x * k), sy = Math.round(f.y * k);
          const sw = Math.max(1, Math.min(work.width - sx, Math.round(f.w * k)));
          const sh = Math.max(1, Math.min(work.height - sy, Math.round(f.h * k)));
          const out = document.createElement('canvas');
          out.width = sw; out.height = sh;
          out.getContext('2d').drawImage(work, sx, sy, sw, sh, 0, 0, sw, sh);
          done(out);
        }
      });
    });
  }

  window.SHPhoto = { camera, crop };
})();
