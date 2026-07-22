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
//
// Env-Vars (in Vercel setzen):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← nur server-side
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_utils.js';

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
  if (newPassword.length < 8) {
    return res.status(400).json({ ok: false, error: 'password_too_short',
      message: 'Passwort muss mindestens 8 Zeichen haben.' });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 1) JWT verifizieren
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    console.warn('[admin_reset_password] JWT invalid:', userErr?.message);
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;

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

  // 3) Schul-Isolation + Volladmin-Schutz für Schuladmins
  if (!profile.is_superadmin) {
    const { data: target, error: tErr } = await admin
      .from('profiles').select('school_id, is_superadmin').eq('id', targetUserId).maybeSingle();
    if (tErr) {
      console.error('[admin_reset_password] target lookup failed:', tErr);
      return res.status(500).json({ ok: false, error: 'target_lookup_failed', message: tErr.message });
    }
    if (!target) {
      return res.status(404).json({ ok: false, error: 'target_not_found' });
    }
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
  const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
    password: newPassword
  });
  if (updErr) {
    console.error('[admin_reset_password] updateUserById failed:', updErr);
    return res.status(500).json({ ok: false, error: 'update_failed', message: updErr.message });
  }

  console.log('[admin_reset_password] password set by', callerId, 'for', targetUserId);
  return res.status(200).json({ ok: true });
}
