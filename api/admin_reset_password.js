// ══════════════════════════════════════════════════════════════
// POST /api/admin_reset_password
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <admin-JWT>
// Body:    { user_id, new_password }
//
// Flow:
//   1) JWT verifizieren (service_role Client, admin.auth.getUser)
//   2) Caller-Profile prüfen: is_admin muss true sein
//   3) Password via auth.admin.updateUserById setzen
//   4) Login-Adresse prüfen: passt auth.users.email nicht zu
//      <account>@<schule>.<FAKE_EMAIL_DOMAIN>, kann sich der User
//      trotz neuem Passwort nicht anmelden → Warnung zurückgeben.
//
// Fehler kommen immer mit `message` (deutsch) zurück, das Panel zeigt
// sie an. Vorher stand dort nur „update_failed“ — ob das Passwort an
// Supabases Passwortregel scheiterte oder das Konto fehlte, sah man nicht.
//
// Env-Vars (in Vercel setzen):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← nur server-side
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readJsonBody, requireAal2 } from './_utils.js';

const FAKE_EMAIL_DOMAIN = process.env.FAKE_EMAIL_DOMAIN ?? 'tablet-schulung.fake';

// Dieselbe Regel wie bei der Registrierung (signup.js validatePassword).
// Supabase Auth kann zusätzlich strenger eingestellt sein — dann kommt
// dessen Meldung (weak_password) unten übersetzt zurück.
function validatePassword(pw) {
  if (pw.length < 8)        return 'Passwort muss mindestens 8 Zeichen haben.';
  if (!/[a-zA-Z]/.test(pw)) return 'Passwort muss mindestens einen Buchstaben enthalten.';
  if (!/[0-9]/.test(pw))    return 'Passwort muss mindestens eine Zahl enthalten.';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[admin_reset_password] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'missing_token' });
  }
  const jwt = authHeader.slice(7);

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }
  const targetUserId = String(body.user_id     ?? '').trim();
  const newPassword  = String(body.new_password ?? '');
  if (!targetUserId) {
    return res.status(400).json({ ok: false, error: 'user_id_required' });
  }
  const pwErr = validatePassword(newPassword);
  if (pwErr) {
    return res.status(400).json({ ok: false, error: 'password_policy', message: pwErr });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 1) JWT verifizieren
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    console.warn('[admin_reset_password] JWT invalid:', userErr?.message);
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;
  if (!requireAal2(jwt, res)) return;

  // 2) Caller ist Admin?
  const { data: profile, error: profErr } = await admin
    .from('profiles').select('is_admin, is_superadmin, school_id').eq('id', callerId).maybeSingle();
  if (profErr) {
    console.error('[admin_reset_password] profile lookup failed:', profErr);
    return res.status(500).json({ ok: false, error: 'profile_lookup_failed', message: profErr.message });
  }
  if (!profile?.is_admin && !profile?.is_superadmin) {
    return res.status(403).json({ ok: false, error: 'not_admin' });
  }

  // 3) Ziel laden (auch für den Volladmin: für die Login-Prüfung unten)
  const { data: target, error: tErr } = await admin
    .from('profiles').select('school_id, is_superadmin, account_name')
    .eq('id', targetUserId).maybeSingle();
  if (tErr) {
    console.error('[admin_reset_password] target lookup failed:', tErr);
    return res.status(500).json({ ok: false, error: 'target_lookup_failed', message: tErr.message });
  }
  if (!target) {
    return res.status(404).json({ ok: false, error: 'target_not_found',
      message: 'Konto nicht gefunden.' });
  }

  // Schul-Isolation + Volladmin-Schutz für Schuladmins
  if (!profile.is_superadmin) {
    if (target.school_id !== profile.school_id) {
      return res.status(403).json({ ok: false, error: 'cross_school_forbidden',
        message: 'Ziel-User gehört nicht zu deiner Schule.' });
    }
    if (target.is_superadmin) {
      return res.status(403).json({ ok: false, error: 'cannot_touch_volladmin',
        message: 'Ein Schuladmin kann kein Volladmin-Passwort setzen.' });
    }
  }

  // 4) Password setzen
  const { data: upd, error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
    password: newPassword
  });
  if (updErr) {
    console.error('[admin_reset_password] updateUserById failed:', updErr);
    const code = updErr.code || '';
    if (code === 'weak_password' || /weak|password should/i.test(updErr.message || '')) {
      return res.status(400).json({ ok: false, error: 'weak_password',
        message: 'Supabase lehnt das Passwort als zu schwach ab: ' + updErr.message });
    }
    if (code === 'user_not_found' || updErr.status === 404) {
      return res.status(404).json({ ok: false, error: 'auth_user_missing',
        message: 'Zu diesem Profil gibt es kein Login-Konto (auth.users) mehr.' });
    }
    return res.status(500).json({ ok: false, error: 'update_failed',
      message: 'Passwort konnte nicht gesetzt werden: ' + updErr.message });
  }

  // 5) Login-Adresse prüfen. Angemeldet wird mit Accountname + Schule;
  //    daraus baut die Landing die Adresse. Weicht auth.users.email ab
  //    (z. B. Schulwechsel, bei dem die Adresse nicht mitkam), greift
  //    das neue Passwort beim Login nie.
  const { data: school } = target.school_id
    ? await admin.from('schools').select('slug').eq('id', target.school_id).maybeSingle()
    : { data: null };
  const slug     = school?.slug;
  const expected = slug && target.account_name
    ? `${target.account_name}@${slug}.${FAKE_EMAIL_DOMAIN}`.toLowerCase() : null;
  const actual   = String(upd?.user?.email || '').toLowerCase();
  const loginOk  = !expected || actual === expected;
  if (!loginOk) {
    console.warn('[admin_reset_password] login email mismatch for', targetUserId, actual, '≠', expected);
  }

  console.log('[admin_reset_password] password set by', callerId, 'for', targetUserId);
  return res.status(200).json({
    ok: true,
    login_ok: loginOk,
    ...(loginOk ? {} : {
      warning_message: `Passwort gesetzt, aber die Login-Adresse passt nicht zum Konto `
        + `(${actual || 'keine'} statt ${expected}). Anmelden mit „${target.account_name}“ `
        + `und dieser Schule klappt so nicht — Konto einmal über „Schule wechseln“ neu zuordnen `
        + `oder melden.`
    })
  });
}
