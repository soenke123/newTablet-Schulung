// ══════════════════════════════════════════════════════════════
// POST /api/admin_delete_cluster
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <admin-JWT>
// Body:    { cluster_id: uuid, delete_users: boolean }
//
// Flow:
//   1) JWT verifizieren
//   2) Caller-Profil prüfen: is_admin + school_id
//   3) Cluster laden → muss zur Schule des Callers gehören
//   4) Wenn delete_users=true:
//        - alle profiles.id mit cluster_id=X sammeln
//        - Self-Delete-Schutz: caller darf nicht dabei sein
//        - iterate auth.admin.deleteUser (cascade räumt Rest)
//   5) DELETE from clusters where id=X and school_id=callerSchool
//      (bei delete_users=false setzt der on-delete-set-null-FK
//       profiles.cluster_id automatisch auf null)
//
// Response:
//   { ok: true, users_deleted: n, cluster_deleted: true, failed: [{ user_id, error }, ...] }
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
    console.error('[admin_delete_cluster] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
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
  const clusterId   = body.cluster_id;
  const deleteUsers = body.delete_users === true;
  if (typeof clusterId !== 'string' || !UUID_RE.test(clusterId)) {
    return res.status(400).json({ ok: false, error: 'invalid_cluster_id' });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 1) JWT verifizieren
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    console.warn('[admin_delete_cluster] JWT invalid:', userErr?.message);
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;

  // 2) Caller ist Admin? + School holen
  const { data: caller, error: callerErr } = await admin
    .from('profiles').select('is_admin, school_id').eq('id', callerId).maybeSingle();
  if (callerErr) {
    console.error('[admin_delete_cluster] caller lookup failed:', callerErr);
    return res.status(500).json({ ok: false, error: 'profile_lookup_failed', message: callerErr.message });
  }
  if (!caller?.is_admin) {
    return res.status(403).json({ ok: false, error: 'not_admin' });
  }
  const callerSchool = caller.school_id;

  // 3) Cluster laden → Schul-Isolation
  const { data: cluster, error: clusterErr } = await admin
    .from('clusters').select('id, name, school_id').eq('id', clusterId).maybeSingle();
  if (clusterErr) {
    console.error('[admin_delete_cluster] cluster lookup failed:', clusterErr);
    return res.status(500).json({ ok: false, error: 'cluster_lookup_failed', message: clusterErr.message });
  }
  if (!cluster) {
    return res.status(404).json({ ok: false, error: 'cluster_not_found' });
  }
  if (cluster.school_id !== callerSchool) {
    console.warn('[admin_delete_cluster] cross-school delete blocked:', clusterId);
    return res.status(403).json({ ok: false, error: 'cross_school_forbidden' });
  }

  // 4) Optional: alle Cluster-Mitglieder als Auth-User löschen
  const failed = [];
  let usersDeleted = 0;
  if (deleteUsers) {
    const { data: members, error: memErr } = await admin
      .from('profiles').select('id, account_name').eq('cluster_id', clusterId).eq('school_id', callerSchool);
    if (memErr) {
      console.error('[admin_delete_cluster] members lookup failed:', memErr);
      return res.status(500).json({ ok: false, error: 'members_lookup_failed', message: memErr.message });
    }
    const memberIds = (members || []).map(m => m.id);
    if (memberIds.includes(callerId)) {
      return res.status(400).json({ ok: false, error: 'self_delete_forbidden',
        message: 'Du bist selbst in diesem Cluster — Cluster+Userdaten-Löschung würde deinen eigenen Account entfernen. Weise dich vorher einem anderen Cluster zu.' });
    }
    for (const id of memberIds) {
      const { error: delErr } = await admin.auth.admin.deleteUser(id);
      if (delErr) {
        console.error('[admin_delete_cluster] user delete failed for', id, ':', delErr.message);
        failed.push({ user_id: id, error: delErr.message });
      } else {
        usersDeleted++;
      }
    }
  }

  // 5) Cluster löschen (profiles.cluster_id → automatisch NULL bei überlebenden Usern)
  const { error: dropErr } = await admin
    .from('clusters').delete().eq('id', clusterId).eq('school_id', callerSchool);
  if (dropErr) {
    console.error('[admin_delete_cluster] cluster delete failed:', dropErr);
    return res.status(500).json({ ok: false, error: 'cluster_delete_failed', message: dropErr.message,
      users_deleted: usersDeleted, failed });
  }

  console.log(`[admin_delete_cluster] caller=${callerId} cluster=${clusterId} users_deleted=${usersDeleted} failed=${failed.length}`);
  return res.status(200).json({ ok: true, cluster_deleted: true, users_deleted: usersDeleted, failed });
}
