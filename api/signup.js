// ══════════════════════════════════════════════════════════════
// POST /api/signup
// ══════════════════════════════════════════════════════════════
// Body: { school_slug, account_name, password }
//
// Ablauf:
//   1) Input-Validierung (Länge, Zeichensatz, Passwort-Policy)
//   2) Schimpfwort-Blacklist auf account_name prüfen
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

const ACCOUNT_NAME_RE = /^[a-z0-9._-]{3,20}$/;

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Passwort muss mindestens 8 Zeichen haben.';
  if (!/[a-zA-Z]/.test(pw)) return 'Passwort muss mindestens einen Buchstaben enthalten.';
  if (!/[0-9]/.test(pw)) return 'Passwort muss mindestens eine Zahl enthalten.';
  return null;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[signup] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
    return jsonResponse(500, { ok: false, error: 'server_misconfigured' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }

  const school_slug  = String(body.school_slug ?? '').trim().toLowerCase();
  const account_name = String(body.account_name ?? '').trim().toLowerCase();
  const password     = String(body.password ?? '');

  // 1) Input-Validierung
  if (!school_slug) return jsonResponse(400, { ok: false, error: 'school_required' });
  if (!ACCOUNT_NAME_RE.test(account_name)) {
    return jsonResponse(400, { ok: false, error: 'account_name_invalid',
      message: 'Accountname: 3–20 Zeichen, nur a-z, 0-9, . _ -' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) return jsonResponse(400, { ok: false, error: 'password_policy', message: pwErr });

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 2) Schimpfwort-Prüfung
  const { data: badRes, error: badErr } = await admin.rpc('contains_blacklisted_word', {
    input: account_name
  });
  if (badErr) {
    console.error('[signup] blacklist RPC error:', badErr);
    return jsonResponse(500, { ok: false, error: 'blacklist_check_failed' });
  }
  if (badRes === true) {
    return jsonResponse(400, { ok: false, error: 'account_name_blocked',
      message: 'Dieser Accountname ist nicht erlaubt.' });
  }

  // 3) Schule holen + Duplikat prüfen
  const { data: school, error: schoolErr } = await admin
    .from('schools')
    .select('id, slug, name, active')
    .eq('slug', school_slug)
    .maybeSingle();
  if (schoolErr) {
    console.error('[signup] school lookup:', schoolErr);
    return jsonResponse(500, { ok: false, error: 'lookup_failed' });
  }
  if (!school || !school.active) {
    return jsonResponse(400, { ok: false, error: 'school_unknown' });
  }

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('school_id', school.id)
    .eq('account_name', account_name)
    .maybeSingle();
  if (existingProfile) {
    return jsonResponse(409, { ok: false, error: 'account_name_taken' });
  }

  // 4) Aktives Cluster für JETZT?
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

  // 5) Fake-Mail generieren
  const email = `${account_name}@${school.slug}.${FAKE_EMAIL_DOMAIN}`;

  // 6) auth.users anlegen (mit email_confirm, damit sofort loginbar)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_name, school_slug }
  });
  if (createErr || !created?.user) {
    console.error('[signup] createUser:', createErr);
    const msg = /already registered|duplicate/i.test(createErr?.message || '')
      ? 'account_name_taken'
      : 'auth_create_failed';
    return jsonResponse(400, { ok: false, error: msg, message: createErr?.message });
  }
  const user_id = created.user.id;

  // 7) profiles-Row anlegen
  const { error: profileErr } = await admin.from('profiles').insert({
    id:            user_id,
    school_id:     school.id,
    cluster_id,
    account_name,
    display_name:  account_name,
    status
  });

  if (profileErr) {
    console.error('[signup] profile insert:', profileErr);
    // Rollback: auth.users wieder löschen, damit User erneut versuchen kann
    await admin.auth.admin.deleteUser(user_id).catch(() => {});
    return jsonResponse(500, {
      ok: false,
      error: 'profile_create_failed',
      message: profileErr.message
    });
  }

  return jsonResponse(200, {
    ok: true,
    email,
    status,
    cluster_id,
    season: cluster?.season ?? 0
  });
}

// Vercel Edge-Runtime würde createUser nicht unterstützen; Node-Runtime explizit.
export const config = {
  runtime: 'nodejs'
};
