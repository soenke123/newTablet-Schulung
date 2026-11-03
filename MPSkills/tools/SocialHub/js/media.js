/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/media.js   ·   Bilder verkleinern und holen
   ══════════════════════════════════════════════════════════════
   compress(file): egal wie groß das Foto ist, beim Server kommen
   höchstens ~250 KB an. Längste Seite 1080 px, WebP (Safari ohne
   WebP-Encoder: JPEG), Qualität sinkt schrittweise. Dazu eine
   Vorschau mit 320 px. Weil das Bild neu gezeichnet wird, fallen
   alle Metadaten weg (GPS-Ort, Kamera, Zeitpunkt) – wer sie
   behalten soll (Raum-Schalter data.meta, 0268), liest sie vorher mit
   js/exif.js aus und schickt sie getrennt an sh_photo_post.

   Media.url(hub, name, thumb): holt Bilder gebündelt (12 je Aufruf)
   über sh_media_get und merkt sie als blob:-Adresse (CSP: img-src
   erlaubt blob:).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  async function decode(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* weiter */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Dieses Bild kann der Browser nicht lesen.')); img.src = url; });
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  function toBlob(cv, type, q) {
    return new Promise(res => cv.toBlob(b => res(b), type, q));
  }

  // Zeichnet src in höchstens maxSide (oder quadratisch zugeschnitten).
  function draw(src, maxSide, square) {
    const w0 = src.width, h0 = src.height;
    let sx = 0, sy = 0, sw = w0, sh = h0;
    if (square) { const s = Math.min(w0, h0); sx = (w0 - s) / 2; sy = (h0 - s) / 2; sw = sh = s; }
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * k));
    cv.height = Math.max(1, Math.round(sh * k));
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  }

  async function shrink(src, maxSide, maxBytes, square) {
    let side = maxSide;
    for (let round = 0; round < 6; round++) {
      const cv = draw(src, side, square);
      for (let q = 0.82; q >= 0.38; q -= 0.11) {
        let b = await toBlob(cv, 'image/webp', q);
        if (!b || b.type !== 'image/webp') b = await toBlob(cv, 'image/jpeg', q);
        if (b && b.size <= maxBytes) return { blob: b, w: cv.width, h: cv.height };
      }
      side = Math.round(side * 0.8);
    }
    throw new Error('Das Bild lässt sich nicht klein genug machen.');
  }

  function b64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  // file = Datei ODER schon fertiges Bild (Canvas aus Kamera/Zuschneiden)
  async function compress(file) {
    const isFile = file && typeof file.size === 'number' && typeof file.type === 'string';
    if (isFile && !/^image\//.test(file.type || 'image/')) throw new Error('Das ist kein Bild.');
    if (!file) throw new Error('Das ist kein Bild.');
    const src = isFile ? await decode(file) : file;
    const full = await shrink(src, 1080, 250000, false);
    const thumb = await shrink(src, 320, 40000, false);
    return {
      before: isFile ? file.size : null, after: full.blob.size, w: full.w, h: full.h,
      mime: full.blob.type, data: await b64(full.blob), thumb: await b64(thumb.blob),
      preview: URL.createObjectURL(full.blob)
    };
  }

  // Logo: quadratisch, 512 px, ≤ 100 KB.
  async function compressLogo(file) {
    const src = file instanceof Blob ? await decode(file) : file;
    const r = await shrink(src, 512, 100000, true);
    return { data: await b64(r.blob), preview: URL.createObjectURL(r.blob) };
  }

  /* Hauptfarbe eines Bildes (für eigene Logos): Mittel der bunten Pixel. */
  function mainColor(url) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = cv.height = 40;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0, 40, 40);
          const d = cx.getImageData(0, 0, 40, 40).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            const w = (mx - mn) / 255 + 0.05;
            if (mx < 40 || mn > 235) continue;
            r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
          }
          if (!n) { res(null); return; }
          res('rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')');
        } catch (e) { res(null); }
      };
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  /* ── Holen, gebündelt ─────────────────────────────────── */
  const cache = new Map();     // hub|t|name → Promise<url|null>
  const queue = [];            // { hub, name, thumb, res }
  let timer = null;

  function url(hub, name, thumb) {
    if (!name || !/^img_\d{1,6}\.webp$/.test(name)) return Promise.resolve(null);
    const key = hub + '|' + (thumb ? 't' : 'f') + '|' + name;
    if (cache.has(key)) return cache.get(key);
    const p = new Promise(res => queue.push({ hub, name, thumb: !!thumb, res }));
    cache.set(key, p);
    if (!timer) timer = setTimeout(flush, 30);
    return p;
  }

  async function flush() {
    timer = null;
    while (queue.length) {
      const first = queue[0];
      const batch = [];
      for (let i = 0; i < queue.length && batch.length < 12;) {
        const q = queue[i];
        if (q.hub === first.hub && q.thumb === first.thumb) { batch.push(q); queue.splice(i, 1); } else i++;
      }
      const r = await window.SHApi.call('sh_media_get', {
        p_hub: first.hub, p_names: batch.map(b => b.name), p_thumb: first.thumb
      });
      for (const b of batch) {
        const it = r && r.ok && r.items ? r.items[b.name] : null;
        if (!it) {
          b.res(null);
          if (!(r && r.ok)) cache.delete(b.hub + '|' + (b.thumb ? 't' : 'f') + '|' + b.name);
          continue;
        }
        const bin = atob(it.b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        b.res(URL.createObjectURL(new Blob([arr], { type: it.mime })));
      }
    }
  }

  // Frisch hochgeladenes Bild gleich aus dem Gerät zeigen.
  function prime(hub, name, previewUrl) {
    cache.set(hub + '|f|' + name, Promise.resolve(previewUrl));
  }

  window.SHMedia = { decode, compress, compressLogo, mainColor, url, prime };
})();
