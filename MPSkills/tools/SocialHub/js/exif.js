/* ══════════════════════════════════════════════════════════════
   YourSozialNet — js/exif.js   ·   Metadaten aus einem Foto lesen
   ══════════════════════════════════════════════════════════════
   SHExif.read(file) → { taken_at, camera, lat, lon } (fehlendes fehlt)
   Liest die EXIF-Daten einer JPEG-Datei (APP1 „Exif“) oder eines
   WebP (Chunk „EXIF“), bevor das Bild neu gezeichnet wird – danach
   sind sie weg. Gebraucht für die Einheit „Was Social Media alles
   mitnimmt“ (Migration 0268, Raum-Schalter data.meta).
     taken_at  DateTimeOriginal (sonst DateTime) als „JJJJ-MM-TT HH:MM:SS“
     camera    Make + Model, z. B. „Apple iPhone 13“
     lat/lon   GPS in Grad (Dezimal), Süd/West negativ
   Handys und Browser entfernen den Ort beim Hochladen oft selbst.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Nur die ersten 256 KB lesen: dort stehen die EXIF-Daten
  const HEAD = 262144;

  function tiff(dv, start, len) {
    const end = Math.min(dv.byteLength, start + len);
    if (start + 8 > end) return null;
    const le = dv.getUint16(start) === 0x4949;
    if (!le && dv.getUint16(start) !== 0x4D4D) return null;
    const u16 = o => dv.getUint16(start + o, le);
    const u32 = o => dv.getUint32(start + o, le);
    if (u16(2) !== 42) return null;
    const ok = (o, n) => o >= 0 && start + o + n <= end;
    const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

    // Ein Verzeichnis (IFD) lesen: { tag: Wert }
    function ifd(off) {
      const out = {};
      if (!ok(off, 2)) return out;
      const n = u16(off);
      if (n > 400) return out;
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        if (!ok(e, 12)) break;
        const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        const sz = (SIZE[type] || 0) * cnt;
        if (!sz || cnt > 4096) continue;
        const at = sz <= 4 ? e + 8 : u32(e + 8);
        if (!ok(at, sz)) continue;
        if (type === 2) {
          let s = '';
          for (let k = 0; k < cnt; k++) { const c = dv.getUint8(start + at + k); if (!c) break; s += String.fromCharCode(c); }
          out[tag] = s.trim();
        } else if (type === 3) out[tag] = u16(at);
        else if (type === 4) out[tag] = u32(at);
        else if (type === 5 || type === 10) {
          const v = [];
          for (let k = 0; k < cnt; k++) {
            const a = type === 5 ? u32(at + k * 8) : dv.getInt32(start + at + k * 8, le);
            const b = type === 5 ? u32(at + k * 8 + 4) : dv.getInt32(start + at + k * 8 + 4, le);
            v.push(b ? a / b : 0);
          }
          out[tag] = v;
        } else if (type === 1 || type === 7) out[tag] = dv.getUint8(start + at);
      }
      return out;
    }

    const i0 = ifd(u32(4));
    const ex = i0[0x8769] ? ifd(i0[0x8769]) : {};
    const gps = i0[0x8825] ? ifd(i0[0x8825]) : {};
    const r = {};

    const t = ex[0x9003] || ex[0x9004] || i0[0x0132];
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(t || '');
    if (m && m[1] !== '0000') r.taken_at = m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6];

    const make = (i0[0x010F] || '').replace(/\s+/g, ' ').trim();
    let model = (i0[0x0110] || '').replace(/\s+/g, ' ').trim();
    if (make && model.toLowerCase().indexOf(make.toLowerCase()) === 0) model = model.slice(make.length).trim();
    const cam = (make + ' ' + model).trim();
    if (cam) r.camera = cam.slice(0, 80);

    const deg = v => Array.isArray(v) && v.length >= 1 ? (v[0] || 0) + (v[1] || 0) / 60 + (v[2] || 0) / 3600 : null;
    let la = deg(gps[2]), lo = deg(gps[4]);
    if (la != null && lo != null && isFinite(la) && isFinite(lo) && (la || lo)) {
      if (/S/i.test(gps[1] || '')) la = -la;
      if (/W/i.test(gps[3] || '')) lo = -lo;
      if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) { r.lat = Math.round(la * 1e6) / 1e6; r.lon = Math.round(lo * 1e6) / 1e6; }
    }
    return r;
  }

  function parse(buf) {
    const dv = new DataView(buf);
    if (dv.byteLength < 12) return {};
    // JPEG: Segmente bis APP1 „Exif\0\0“
    if (dv.getUint16(0) === 0xFFD8) {
      let o = 2;
      while (o + 4 <= dv.byteLength) {
        if (dv.getUint8(o) !== 0xFF) break;
        const mk = dv.getUint8(o + 1), len = dv.getUint16(o + 2);
        if (mk === 0xDA || mk === 0xD9) break;
        if (mk === 0xE1 && o + 10 <= dv.byteLength && dv.getUint32(o + 4) === 0x45786966 && dv.getUint16(o + 8) === 0) {
          return tiff(dv, o + 10, len - 8) || {};
        }
        o += 2 + len;
      }
      return {};
    }
    // WebP: RIFF … „EXIF“-Chunk
    if (dv.getUint32(0) === 0x52494646 && dv.getUint32(8) === 0x57454250) {
      let o = 12;
      while (o + 8 <= dv.byteLength) {
        const id = dv.getUint32(o), len = dv.getUint32(o + 4, true);
        if (id === 0x45584946) {
          let s = o + 8;
          if (dv.getUint32(s) === 0x45786966) s += 6;   // manche schreiben „Exif\0\0“ davor
          return tiff(dv, s, len) || {};
        }
        o += 8 + len + (len & 1);
      }
    }
    return {};
  }

  async function read(file) {
    try {
      if (!file || typeof file.slice !== 'function') return {};
      return parse(await file.slice(0, HEAD).arrayBuffer());
    } catch (e) { return {}; }
  }

  window.SHExif = { read, parse };
})();
