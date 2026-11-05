// ══════════════════════════════════════════════════════════════
// GET /api/sh_app?f=manifest|icon&k=<app_key>
//   — YourSozialNet: das Klassen-Netz als App (Migration 0275)
// ══════════════════════════════════════════════════════════════
// Die App-Adresse /n/<app_key>/ (vercel.json schreibt sie auf
// MPSkills/tools/SocialHub/index.html um) verlinkt dieses Manifest.
// Damit wird jedes Klassen-Netz eine eigene App mit eigenem Namen und
// Logo: id, scope und start_url sind die eigene Adresse.
//
//   f=manifest  Web-App-Manifest (Name, Farbe, Symbol)
//   f=icon      eigenes Logo des Netzes (sonst zeigt das Manifest
//               direkt auf eins der 8 Logos in img/logos/)
//
// Gelesen wird nur über die RPC sh_app_info (128-Bit-Schlüssel, nichts
// Persönliches: Name, Logo, Farbe). Nichts wird gespeichert.
//
// f=ip ist /api/my_ip (Rewrite in vercel.json, Code in _my_ip.js) –
// eigene Function geht nicht, der Hobby-Plan erlaubt höchstens 12.
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════

import myIp from './_my_ip.js';

const LOGO_COLOR = {
  bell: '#e91d77', connect: '#d97706', rocket: '#ea580c', graph: '#2563eb',
  trend: '#0d9488', chat: '#dc2626', like: '#7c3aed', mesh: '#16a34a'
};

// Breite/Höhe aus PNG, JPEG oder WebP (eigene Logos sind ≤ 512 px WebP)
function imageInfo(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { type: 'image/png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length > 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { type: 'image/webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') {
      const v = b.readUInt32LE(21);
      return { type: 'image/webp', w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) };
    }
    if (kind === 'VP8 ') return { type: 'image/webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) break;
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc3) return { type: 'image/jpeg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return { type: 'image/jpeg', w: 0, h: 0 };
  }
  return null;
}

async function appInfo(key) {
  const url = process.env.SUPABASE_URL, sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) return null;
  const res = await fetch(`${url}/rest/v1/rpc/sh_app_info`, {
    method: 'POST',
    headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_key: key })
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function handler(req, res) {
  if (req.query.f === 'ip') return myIp(req, res);
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const key = String(req.query.k || '');
  const f = String(req.query.f || 'manifest');
  if (!/^[0-9a-f]{32}$/.test(key)) return res.status(404).json({ ok: false, error: 'app_not_found' });

  let info;
  try { info = await appInfo(key); } catch { info = null; }
  if (!info || !info.ok) return res.status(404).json({ ok: false, error: (info && info.error) || 'app_not_found' });
  const h = info.hub;
  const img = h.logo === 'custom' && info.logo_img ? Buffer.from(info.logo_img, 'base64') : null;
  const meta = img ? imageInfo(img) : null;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (f === 'icon') {
    if (!img || !meta) return res.status(404).json({ ok: false, error: 'no_icon' });
    res.setHeader('Content-Type', meta.type);
    return res.status(200).send(img);
  }

  const base = `/n/${key}/`;
  const icon = img && meta
    ? { src: `/api/sh_app?f=icon&k=${key}`, sizes: meta.w && meta.h ? `${meta.w}x${meta.h}` : 'any', type: meta.type, purpose: 'any' }
    : { src: `/MPSkills/tools/SocialHub/img/logos/${LOGO_COLOR[h.logo] ? h.logo : 'bell'}.png`, sizes: '250x250', type: 'image/png', purpose: 'any' };
  const color = h.color || LOGO_COLOR[h.logo] || '#fe2c55';
  const name = String(h.name || 'YourSozialNet').slice(0, 30);
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  return res.status(200).send(JSON.stringify({
    id: base,
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description: `${name} – Klassen-Netz in YourSozialNet`,
    lang: 'de',
    start_url: base,
    scope: base,
    display: 'standalone',
    background_color: h.scheme === 'dark' ? '#0b0b10' : '#ffffff',
    theme_color: color,
    icons: [icon]
  }));
}
