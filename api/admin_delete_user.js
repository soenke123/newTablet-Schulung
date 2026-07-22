// ══════════════════════════════════════════════════════════════
// POST /api/admin_delete_user
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <admin-JWT>
// Body:    { user_ids: [uuid, ...] }
//
// Flow:
//   1) JWT verifizieren (service_role Client, auth.getUser)
//   2) Caller-Profile prüfen: is_admin + school_id
//   3) Self-Delete-Schutz: caller darf nicht in user_ids sein
//   4) Alle zu löschenden User müssen zur selben school gehören
//   5) Iteriert auth.admin.deleteUser — cascade räumt profiles,
//      game_state, wallets, user_collectibles, user_unlocked_games
//
// Response:
//   { ok: true, deleted: n, failed: [{ user_id, error }, ...] }
//
// Env-Vars (in Vercel setzen):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← nur server-side
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
    console.error('[admin_delete_user] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
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
  const userIds = Array.isArray(body.user_ids) ? body.user_ids : null;
  if (!userIds || userIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'user_ids_required' });
  }
  // Alle IDs müssen valide UUIDs sein, sonst SQL-Injection-Risiko in IN-Klausel
  for (const id of userIds) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return res.status(400).json({ ok: false, error: 'invalid_user_id', message: `Ungültige UUID: ${id}` });
    }
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 1) JWT verifizieren
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    console.warn('[admin_delete_user] JWT invalid:', userErr?.message);
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;

  // 2) Caller ist Admin? + School holen
  const { data: caller, error: callerErr } = await admin
    .from('profiles').select('is_admin, is_superadmin, school_id').eq('id', callerId).maybeSingle();
  if (callerErr) {
    console.error('[admin_delete_user] caller lookup failed:', callerErr);
    return res.status(500).json({ ok: false, error: 'profile_lookup_failed', message: callerErr.message });
  }
  if (!caller?.is_admin && !caller?.is_superadmin) {
    return res.status(403).json({ ok: false, error: 'not_admin' });
  }
  const callerSchool = caller.school_id;
  const isVolladmin  = !!caller.is_superadmin;

  // 3) Self-Delete-Schutz
  if (userIds.includes(callerId)) {
    return res.status(400).json({ ok: false, error: 'self_delete_forbidden',
      message: 'Der eigene Admin-Account kann nicht gelöscht werden.' });
  }

  // 4) Schul-Isolation (Volladmin darf schul-übergreifend) + Admin-Guard
  //    Admins können NICHT über diesen Endpunkt gelöscht werden — vorher via
  //    admin_promote_user auf 'student' zurückstufen. Das schützt vor
  //    versehentlichem Admin-Lockout.
  const { data: targets, error: targetsErr } = await admin
    .from('profiles').select('id, account_name, school_id, is_admin, is_superadmin').in('id', userIds);
  if (targetsErr) {
    console.error('[admin_delete_user] targets lookup failed:', targetsErr);
    return res.status(500).json({ ok: false, error: 'targets_lookup_failed', message: targetsErr.message });
  }
  const foundIds = new Set((targets || []).map(t => t.id));
  const missing = userIds.filter(id => !foundIds.has(id));

  const adminTargets = (targets || []).filter(t => t.is_admin || t.is_superadmin);
  if (adminTargets.length > 0) {
    return res.status(400).json({ ok: false, error: 'admin_delete_forbidden',
      message: `${adminTargets.length === 1 ? 'Ein Admin-Account' : `${adminTargets.length} Admin-Accounts`} in der Auswahl. Zuerst Rolle auf Schüler:in ändern, dann löschen.` });
  }

  if (!isVolladmin) {
    const wrongSchool = (targets || []).filter(t => t.school_id !== callerSchool);
    if (wrongSchool.length > 0) {
      console.warn('[admin_delete_user] cross-school delete blocked:', wrongSchool.map(t => t.id));
      return res.status(403).json({ ok: false, error: 'cross_school_forbidden',
        message: 'Ein oder mehrere Ziele gehören nicht zu deiner Schule.' });
    }
  }

  // 5) Iteriert deleteUser. Cascade räumt alles nachgelagerte.
  //    Missing IDs (schon weg) zählen wir als erfolgreich, damit paralleles Löschen
  //    aus zwei Tabs sich nicht gegenseitig blockiert.
  const failed = [];
  let deleted = 0;
  for (const id of userIds) {
    if (missing.includes(id)) { deleted++; continue; }
    const { error: delErr } = await admin.auth.admin.deleteUser(id);
    if (delErr) {
      console.error('[admin_delete_user] delete failed for', id, ':', delErr.message);
      failed.push({ user_id: id, error: delErr.message });
    } else {
      deleted++;
    }
  }

  console.log(`[admin_delete_user] caller=${callerId} deleted=${deleted}/${userIds.length} failed=${failed.length}`);
  return res.status(200).json({ ok: true, deleted, failed });
}
