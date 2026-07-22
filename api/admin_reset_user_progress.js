// ══════════════════════════════════════════════════════════════
// POST /api/admin_reset_user_progress
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <admin-JWT>
// Body:    { user_id }
//
// Setzt einen Schüler-Account auf Signup-Zustand zurück: löscht
// alle Coins, Kreaturen, Nester, Shop-State, Highscores,
// Meilenstein-Grants und Bonbon-Claims. Profil bleibt (Account-Name,
// Passwort, Cluster, Schule, Avatar, display_name_locked). Wenn der
// User in einem Cluster mit aktiver Starthilfe hängt, wird die
// Starthilfe frisch ausgeschüttet — analog zu einem echten Signup.
//
// Flow:
//   1) JWT verifizieren
//   2) Caller ist Admin?
//   3) Target lookup + Rollen-Guards:
//        - Self-Reset: erlaubt (praktisch zum Testen)
//        - Ziel = Volladmin und nicht self: verboten
//          (auch für Volladmin-Caller — Volladmins resetten nur sich selbst)
//        - Ziel = Schuladmin und nicht self: nur Volladmin-Caller
//        - Ziel = Schüler und nicht self: Schul-Isolation für Schuladmin-Caller
//   4) wipeUserProgress (dieselbe Utility wie beim Promote)
//   5) apply_cluster_bonus (best-effort) falls Cluster gesetzt.
//      RPC blockt Admin-Targets intern → Admin-Self-Reset triggert keine Ausschüttung.
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readJsonBody, wipeUserProgress } from './_utils.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[admin_reset_user_progress] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
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
  if (!UUID_RE.test(targetUserId)) {
    return res.status(400).json({ ok: false, error: 'invalid_user_id' });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;

  const { data: caller, error: callerErr } = await admin
    .from('profiles').select('is_admin, is_superadmin, school_id').eq('id', callerId).maybeSingle();
  if (callerErr) {
    console.error('[admin_reset_user_progress] caller lookup failed:', callerErr);
    return res.status(500).json({ ok: false, error: 'profile_lookup_failed', message: callerErr.message });
  }
  if (!caller || (!caller.is_admin && !caller.is_superadmin)) {
    return res.status(403).json({ ok: false, error: 'not_admin' });
  }

  const { data: target, error: targetErr } = await admin
    .from('profiles')
    .select('id, account_name, school_id, cluster_id, is_admin, is_superadmin')
    .eq('id', targetUserId).maybeSingle();
  if (targetErr) {
    console.error('[admin_reset_user_progress] target lookup failed:', targetErr);
    return res.status(500).json({ ok: false, error: 'target_lookup_failed', message: targetErr.message });
  }
  if (!target) {
    return res.status(404).json({ ok: false, error: 'target_not_found' });
  }

  const isSelf = targetUserId === callerId;
  if (!isSelf) {
    if (target.is_superadmin) {
      return res.status(403).json({ ok: false, error: 'cannot_reset_volladmin',
        message: 'Ein Volladmin kann nur sich selbst zurücksetzen.' });
    }
    if (target.is_admin && !caller.is_superadmin) {
      return res.status(403).json({ ok: false, error: 'cannot_reset_schuladmin',
        message: 'Ein Schuladmin kann nur sich selbst zurücksetzen — andere Schuladmins darf nur ein Volladmin.' });
    }
    if (!caller.is_superadmin && target.school_id !== caller.school_id) {
      return res.status(403).json({ ok: false, error: 'cross_school_forbidden',
        message: 'Ziel-User gehört nicht zu deiner Schule.' });
    }
  }

  try {
    await wipeUserProgress(admin, targetUserId);
  } catch (wipeErr) {
    console.error('[admin_reset_user_progress] wipe failed:', wipeErr);
    return res.status(500).json({ ok: false, error: 'wipe_failed', message: wipeErr.message });
  }

  // Cluster-Starthilfe frisch ausschütten, damit der User wirklich
  // "wie neu" dasteht. Der RPC ist idempotent per Grant-Row — die
  // eben in wipeUserProgress mitgelöscht wurde, also greift der Bonus
  // sofort wieder. Fehler nicht fatal (Reset war der harte Teil).
  let bonusApplied = null;
  if (target.cluster_id) {
    try {
      const { data: bonusResult, error: bonusErr } = await admin.rpc(
        'apply_cluster_bonus', { p_user_id: targetUserId }
      );
      if (bonusErr) {
        console.warn('[admin_reset_user_progress] apply_cluster_bonus failed:', bonusErr.message);
        bonusApplied = { ok: false, error: bonusErr.message };
      } else {
        bonusApplied = bonusResult;
      }
    } catch (e) {
      console.warn('[admin_reset_user_progress] apply_cluster_bonus threw:', e.message);
      bonusApplied = { ok: false, error: e.message };
    }
  }

  console.log(`[admin_reset_user_progress] caller=${callerId} reset ${target.account_name} (${targetUserId}) bonus=${!!bonusApplied?.granted}`);
  return res.status(200).json({
    ok: true,
    account_name: target.account_name,
    bonus_applied: bonusApplied,
  });
}
