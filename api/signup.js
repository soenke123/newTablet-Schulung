// ══════════════════════════════════════════════════════════════
// POST /api/signup
// ══════════════════════════════════════════════════════════════
// Body: { school_slug, account_name, display_name, password }
//
// Ablauf:
//   1) Input-Validierung (Länge, Zeichensatz, Passwort-Policy)
//   2) Schimpfwort-Blacklist auf account_name UND display_name
//   3) Prüfen ob Account-Name in dieser Schule schon existiert
//   4) Aktives Cluster (jetzt im Zeitfenster) für die Schule suchen
//        → gefunden: status='active', cluster_id gesetzt
//        → sonst:    status='pending', cluster_id=null
//   5) auth.users mit Fake-Mail anlegen (email_confirm=true, damit sofort loginbar)
//   6) profiles-Row mit passenden Werten anlegen
//   7) Bei Fehler in Schritt 6: auth.users wieder löschen (Rollback)
//   8) Antwort mit ok:true + email zurück
//
// Env-Vars (in Vercel setzen):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← nur server-side, NIE im Frontend
//   FAKE_EMAIL_DOMAIN            (default: 'tablet-schulung.fake')
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const FAKE_EMAIL_DOMAIN = process.env.FAKE_EMAIL_DOMAIN ?? 'tablet-schulung.fake';

// Accountname: klein a-z, 0-9, . _ - · 2–20 Zeichen
const ACCOUNT_NAME_RE = /^[a-z0-9._-]{2,20}$/;

// Anzeigename: Buchstaben (inkl. Umlaute/ß), Ziffern, Leerzeichen, . _ - · 2–24 Zeichen
// Bewusst Groß-/Kleinschreibung erlaubt (Lehrer-Kürzel wie "BK", "Sn").
const DISPLAY_NAME_RE = /^[A-Za-zÄÖÜäöüß0-9 ._-]{2,24}$/;

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Passwort muss mindestens 8 Zeichen haben.';
  if (!/[a-zA-Z]/.test(pw))                    return 'Passwort muss mindestens einen Buchstaben enthalten.';
  if (!/[0-9]/.test(pw))                       return 'Passwort muss mindestens eine Zahl enthalten.';
  return null;
}

async function readJsonBody(req) {
  // Vercel Node.js: req.body ist meist bereits geparst.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  // Fallback: rohen Stream lesen
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[signup] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }

  const school_slug  = String(body.school_slug  ?? '').trim().toLowerCase();
  const account_name = String(body.account_name ?? '').trim().toLowerCase();
  const display_name = String(body.display_name ?? '').trim();
  const password     = String(body.password     ?? '');

  // 1) Input-Validierung
  if (!school_slug) {
    return res.status(400).json({ ok: false, error: 'school_required' });
  }
  if (!ACCOUNT_NAME_RE.test(account_name)) {
    return res.status(400).json({ ok: false, error: 'account_name_invalid',
      message: 'Accountname: 2–20 Zeichen, nur a-z, 0-9, . _ -' });
  }
  if (!DISPLAY_NAME_RE.test(display_name)) {
    return res.status(400).json({ ok: false, error: 'display_name_invalid',
      message: 'Anzeigename: 2–24 Zeichen, Buchstaben, Ziffern, Leerzeichen, . _ -' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) {
    return res.status(400).json({ ok: false, error: 'password_policy', message: pwErr });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 2) Schimpfwort-Prüfung (beide Namen)
  for (const [field, val] of [['account_name', account_name], ['display_name', display_name]]) {
    const { data, error } = await admin.rpc('contains_blacklisted_word', { input: val });
    if (error) {
      console.error('[signup] blacklist RPC error on', field, '=', val, ':', error);
      return res.status(500).json({
        ok: false,
        error: 'blacklist_check_failed',
        message: `RPC-Fehler: ${error.message || error.code || 'unbekannt'}`,
        _debug: { field, code: error.code, hint: error.hint, details: error.details }
      });
    }
    if (data === true) {
      return res.status(400).json({ ok: false, error: `${field}_blocked`,
        message: 'Dieser Name ist nicht erlaubt.' });
    }
  }

  // 3) Schule + Duplikat
  const { data: school, error: schoolErr } = await admin
    .from('schools')
    .select('id, slug, name, active')
    .eq('slug', school_slug)
    .maybeSingle();
  if (schoolErr) {
    console.error('[signup] school lookup:', schoolErr);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  if (!school || !school.active) {
    return res.status(400).json({ ok: false, error: 'school_unknown' });
  }

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('school_id', school.id)
    .eq('account_name', account_name)
    .maybeSingle();
  if (existingProfile) {
    return res.status(409).json({ ok: false, error: 'account_name_taken' });
  }

  // 4) Aktives Cluster JETZT?
  const nowIso = new Date().toISOString();
  const { data: cluster } = await admin
    .from('clusters')
    .select('id, season, opens_at, closes_at')
    .eq('school_id', school.id)
    .lte('opens_at', nowIso)
    .gte('closes_at', nowIso)
    .order('opens_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const status     = cluster ? 'active'    : 'pending';
  const cluster_id = cluster ? cluster.id  : null;

  // 5) Fake-Mail
  const email = `${account_name}@${school.slug}.${FAKE_EMAIL_DOMAIN}`;

  // 6) auth.users
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_name, display_name, school_slug }
  });
  if (createErr || !created?.user) {
    console.error('[signup] createUser:', createErr);
    const msg = /already registered|duplicate/i.test(createErr?.message || '')
      ? 'account_name_taken'
      : 'auth_create_failed';
    return res.status(400).json({ ok: false, error: msg, message: createErr?.message });
  }
  const user_id = created.user.id;

  // 7) profiles
  const { error: profileErr } = await admin.from('profiles').insert({
    id:            user_id,
    school_id:     school.id,
    cluster_id,
    account_name,
    display_name,
    status
  });

  if (profileErr) {
    console.error('[signup] profile insert:', profileErr);
    await admin.auth.admin.deleteUser(user_id).catch(() => {});
    return res.status(500).json({
      ok: false,
      error: 'profile_create_failed',
      message: profileErr.message
    });
  }

  return res.status(200).json({
    ok: true,
    email,
    status,
    cluster_id,
    season: cluster?.season ?? 0
  });
}
