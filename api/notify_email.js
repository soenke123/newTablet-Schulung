// ══════════════════════════════════════════════════════════════
// GET/POST /api/notify_email   — Links aus den Antrags-Mails (0202)
// ══════════════════════════════════════════════════════════════
//   ?verify=<token>   Adresse bestätigen
//   ?stop=<token>     Adresse löschen (keine Mails mehr, alle Räume)
//
// GET zeigt nur eine Seite mit einem Knopf; erst der Knopf (POST)
// tut etwas. Mail-Programme und Virenscanner öffnen Links in Mails
// gern schon vorab — ein GET, der abmeldet, würde Lehrkräfte
// abmelden, die nie geklickt haben.
//
// Der Token ist das einzige Geheimnis (48 Hex-Zeichen, 0202:
// gen_random_bytes(24)). Kein Login nötig — die Mail kann auf einem
// Gerät geöffnet werden, auf dem niemand angemeldet ist.
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const TOKEN_RE = /^[0-9a-f]{48}$/;

const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function page(res, status, title, body) {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(`<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f1ea;color:#1f2a2a}
  main{max-width:460px;margin:12vh auto 0;padding:28px 24px;background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 10px;color:#1d5955}
  p{margin:0 0 14px}
  button{font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:9px;background:#1d5955;color:#fff;cursor:pointer}
  button.warn{background:#a0442f}
  a{color:#1d5955}
</style></head>
<body><main><h1>${esc(title)}</h1>${body}</main></body></html>`);
}

// Formular-POST: Vercel parst x-www-form-urlencoded meist schon selbst.
async function readForm(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      raw = Buffer.concat(chunks).toString('utf8');
    } catch { raw = ''; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return page(res, 405, 'Nicht erlaubt', '<p>Diese Adresse nimmt nur Links aus Mails an.</p>');
  }

  const q = req.query || {};
  const src = req.method === 'POST' ? await readForm(req) : q;
  const verify = typeof src.verify === 'string' ? src.verify : (typeof q.verify === 'string' ? q.verify : '');
  const stop   = typeof src.stop === 'string' ? src.stop : (typeof q.stop === 'string' ? q.stop : '');
  const token  = verify || stop;
  const action = verify ? 'verify' : 'stop';

  if (!TOKEN_RE.test(token)) {
    return page(res, 400, 'Link unvollständig',
      '<p>Dieser Link ist unvollständig. Bitte den ganzen Link aus der Mail öffnen.</p>');
  }

  if (req.method === 'GET') {
    return action === 'verify'
      ? page(res, 200, 'Adresse bestätigen',
          `<p>Sollen Mails über neue Anträge in der Projektarbeit an diese Adresse gehen?</p>
           <form method="post"><input type="hidden" name="verify" value="${esc(token)}">
           <button type="submit">Ja, bestätigen</button></form>`)
      : page(res, 200, 'Keine Mails mehr?',
          `<p>Die Adresse wird gelöscht. Danach kommen <b>in keinem Raum</b> mehr Mails über Anträge.
           Wieder einschalten geht jederzeit im Raum unter 🔔.</p>
           <form method="post"><input type="hidden" name="stop" value="${esc(token)}">
           <button class="warn" type="submit">Abmelden</button></form>`);
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[notify_email] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
    return page(res, 500, 'Fehler', '<p>Der Server ist nicht vollständig eingerichtet.</p>');
  }
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  const fn = action === 'verify' ? 'notify_email_verify' : 'notify_email_stop';
  const { data, error } = await admin.rpc(fn, { p_token: token });
  if (error) {
    console.error(`[notify_email] ${fn}:`, error.message);
    return page(res, 500, 'Fehler', '<p>Das hat nicht geklappt. Bitte später noch einmal.</p>');
  }
  if (!data || !data.ok) {
    return page(res, 404, 'Link nicht mehr gültig',
      action === 'verify'
        ? '<p>Dieser Link gilt nicht mehr — vermutlich wurde inzwischen eine andere Adresse eingetragen. Im Raum unter 🔔 lässt sich die Bestätigung neu anfordern.</p>'
        : '<p>Diese Adresse ist schon abgemeldet.</p>');
  }
  return action === 'verify'
    ? page(res, 200, 'Bestätigt',
        `<p><b>${esc(data.email)}</b> ist bestätigt. Ab jetzt kommt eine Mail, wenn in einem Raum mit eingeschalteter 🔔 ein neuer Antrag gestellt wird.</p>`)
    : page(res, 200, 'Abgemeldet',
        `<p><b>${esc(data.email)}</b> ist gelöscht. Es kommen keine Mails über Anträge mehr.</p>`);
}
