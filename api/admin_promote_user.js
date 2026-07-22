// ══════════════════════════════════════════════════════════════
// POST /api/admin_promote_user
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <admin-JWT>
// Body:    { user_id, role: 'student' | 'schuladmin' | 'volladmin' }
//
// Flow:
//   1) JWT verifizieren
//   2) Caller-Rolle laden (is_admin, is_superadmin, school_id)
//   3) Rechteprüfung:
//        • Schuladmin darf nur User seiner Schule ändern und
//          nicht auf Volladmin heben, kein Volladmin anfassen.
//        • Volladmin darf alles.
//        • Kein Self-Demote (verhindert Lockout).
//   4) profiles.is_admin/is_superadmin setzen. Mapping:
//        student     → is_admin=false, is_superadmin=false
//        schuladmin  → is_admin=true,  is_superadmin=false
//        volladmin   → is_admin=true,  is_superadmin=true
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_utils.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_MAP = {
  student:    { is_admin: false, is_superadmin: false },
  schuladmin: { is_admin: true,  is_superadmin: false },
  volladmin:  { is_admin: true,  is_superadmin: true  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[admin_promote_user] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
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
  const targetUserId = String(body.user_id ?? '').trim();
  const role         = String(body.role    ?? '').trim();
  if (!UUID_RE.test(targetUserId)) {
    return res.status(400).json({ ok: false, error: 'invalid_user_id' });
  }
  if (!ROLE_MAP[role]) {
    return res.status(400).json({ ok: false, error: 'invalid_role',
      message: 'role muss student | schuladmin | volladmin sein.' });
  }
  const newFlags = ROLE_MAP[role];

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 1) JWT
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;

  // 2) Caller-Rolle
  const { data: caller, error: callerErr } = await admin
    .from('profiles').select('is_admin, is_superadmin, school_id').eq('id', callerId).maybeSingle();
  if (callerErr) {
    console.error('[admin_promote_user] caller lookup failed:', callerErr);
    return res.status(500).json({ ok: false, error: 'profile_lookup_failed', message: callerErr.message });
  }
  if (!caller || (!caller.is_admin && !caller.is_superadmin)) {
    return res.status(403).json({ ok: false, error: 'not_admin' });
  }

  // 3) Target-User laden
  const { data: target, error: targetErr } = await admin
    .from('profiles').select('id, school_id, is_admin, is_superadmin').eq('id', targetUserId).maybeSingle();
  if (targetErr) {
    console.error('[admin_promote_user] target lookup failed:', targetErr);
    return res.status(500).json({ ok: false, error: 'target_lookup_failed', message: targetErr.message });
  }
  if (!target) {
    return res.status(404).json({ ok: false, error: 'target_not_found' });
  }

  // Self-Demote-Schutz: eigenen Admin-Status nie wegnehmen (Lockout).
  if (targetUserId === callerId && !newFlags.is_admin) {
    return res.status(400).json({ ok: false, error: 'self_demote_forbidden',
      message: 'Der eigene Admin-Zugang kann nicht entzogen werden.' });
  }

  // Rechteprüfung
  const isVolladmin = !!caller.is_superadmin;
  if (!isVolladmin) {
    // Schuladmin
    if (target.school_id !== caller.school_id) {
      return res.status(403).json({ ok: false, error: 'cross_school_forbidden',
        message: 'Ein Schuladmin kann nur User seiner eigenen Schule ändern.' });
    }
    if (target.is_superadmin) {
      return res.status(403).json({ ok: false, error: 'cannot_touch_volladmin',
        message: 'Ein Schuladmin kann keinen Volladmin ändern.' });
    }
    if (newFlags.is_superadmin) {
      return res.status(403).json({ ok: false, error: 'cannot_promote_to_volladmin',
        message: 'Nur ein Volladmin kann Volladmins ernennen.' });
    }
  }

  // 4) Update
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      is_admin:      newFlags.is_admin,
      is_superadmin: newFlags.is_superadmin,
    })
    .eq('id', targetUserId);
  if (updErr) {
    console.error('[admin_promote_user] update failed:', updErr);
    return res.status(500).json({ ok: false, error: 'update_failed', message: updErr.message });
  }

  console.log(`[admin_promote_user] caller=${callerId} target=${targetUserId} → ${role}`);
  return res.status(200).json({ ok: true, role, flags: newFlags });
}
