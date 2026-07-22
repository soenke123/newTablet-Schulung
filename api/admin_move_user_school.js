// ══════════════════════════════════════════════════════════════
// POST /api/admin_move_user_school
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <admin-JWT>
// Body:    { user_id, target_school_id }
//
// Nur Volladmin. Verschiebt beliebigen User in eine andere Schule.
// cluster_id wird auf NULL gesetzt, weil Cluster schul-gebunden sind.
// Alle Coins/Kreaturen/Highscores bleiben erhalten.
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_utils.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[admin_move_user_school] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
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
  const targetUserId    = String(body.user_id          ?? '').trim();
  const targetSchoolId  = String(body.target_school_id ?? '').trim();
  if (!UUID_RE.test(targetUserId)) {
    return res.status(400).json({ ok: false, error: 'invalid_user_id' });
  }
  if (!UUID_RE.test(targetSchoolId)) {
    return res.status(400).json({ ok: false, error: 'invalid_school_id' });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;

  // Caller muss Volladmin sein
  const { data: caller, error: callerErr } = await admin
    .from('profiles').select('is_superadmin').eq('id', callerId).maybeSingle();
  if (callerErr) {
    console.error('[admin_move_user_school] caller lookup failed:', callerErr);
    return res.status(500).json({ ok: false, error: 'profile_lookup_failed', message: callerErr.message });
  }
  if (!caller?.is_superadmin) {
    return res.status(403).json({ ok: false, error: 'not_volladmin' });
  }

  // Ziel-Schule existiert?
  const { data: school, error: schoolErr } = await admin
    .from('schools').select('id, name').eq('id', targetSchoolId).maybeSingle();
  if (schoolErr) {
    console.error('[admin_move_user_school] school lookup failed:', schoolErr);
    return res.status(500).json({ ok: false, error: 'school_lookup_failed', message: schoolErr.message });
  }
  if (!school) {
    return res.status(404).json({ ok: false, error: 'school_not_found' });
  }

  // Target-User existiert?
  const { data: target, error: targetErr } = await admin
    .from('profiles').select('id, school_id, account_name').eq('id', targetUserId).maybeSingle();
  if (targetErr) {
    console.error('[admin_move_user_school] target lookup failed:', targetErr);
    return res.status(500).json({ ok: false, error: 'target_lookup_failed', message: targetErr.message });
  }
  if (!target) {
    return res.status(404).json({ ok: false, error: 'target_not_found' });
  }
  if (target.school_id === targetSchoolId) {
    return res.status(200).json({ ok: true, skipped: 'already_in_target_school' });
  }

  // Update: school + cluster (cluster ist schul-gebunden)
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      school_id:  targetSchoolId,
      cluster_id: null,
    })
    .eq('id', targetUserId);
  if (updErr) {
    // Häufigster Fall: unique (school_id, account_name)-Konflikt in Ziel-Schule.
    if (updErr.code === '23505') {
      return res.status(409).json({ ok: false, error: 'account_name_conflict',
        message: `Ein User mit dem Account-Namen "${target.account_name}" existiert bereits in der Ziel-Schule.` });
    }
    console.error('[admin_move_user_school] update failed:', updErr);
    return res.status(500).json({ ok: false, error: 'update_failed', message: updErr.message });
  }

  console.log(`[admin_move_user_school] caller=${callerId} moved ${targetUserId} → school=${school.name}`);
  return res.status(200).json({ ok: true, moved_to: { school_id: targetSchoolId, school_name: school.name } });
}
