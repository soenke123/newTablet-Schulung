// ══════════════════════════════════════════════════════════════
// Interne Helper für /api/-Endpoints.
// Files mit Underscore-Präfix werden von Vercel NICHT als Route
// deployed — hier landet nur geteilter Server-Code.
// ══════════════════════════════════════════════════════════════

// Vercel Node.js: req.body ist meist bereits geparst. Fallback:
// rohen Stream lesen und JSON parsen. Bei Parse-Fehler → null.
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return null; }
  }
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

// Löscht alle Fortschritts-Rows eines Users. Wird von admin_promote_user
// (Student → Admin) und admin_reset_user_progress verwendet. Grants dafür
// stehen in Migration 0054.
export const PROGRESS_TABLES = [
  'game_state',
  'wallets',
  'user_collectibles',
  'user_unlocked_games',
  'game_highscores',
  'user_legi_grants',
  'cluster_bonus_grants',
  'user_bonbon_milestone_grants',
  'bonbon_daily_claims',
  'user_legi_task_gifts',
];

export async function wipeUserProgress(admin, userId) {
  for (const t of PROGRESS_TABLES) {
    const { error } = await admin.from(t).delete().eq('user_id', userId);
    if (error) {
      throw new Error(`${t}: ${error.message}`);
    }
  }
}

// ── 2FA für Admins (Migration 0223) ──────────────────────────
// Admin-Aktionen nur mit einer Sitzung, die per Authenticator-App
// bestätigt ist (aal2). Das JWT ist zu diesem Zeitpunkt schon über
// auth.getUser geprüft — hier wird nur noch die Stufe gelesen.
export function jwtAal(jwt) {
  try {
    const part = String(jwt).split('.')[1] || '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).aal ?? null;
  } catch {
    return null;
  }
}

// true = weiter. false = Antwort ist schon geschrieben (403).
export function requireAal2(jwt, res) {
  if (jwtAal(jwt) === 'aal2') return true;
  res.status(403).json({
    ok: false,
    error: 'mfa_required',
    message: 'Für Admin-Aktionen bitte zuerst mit dem Code aus der Authenticator-App bestätigen (Admin-Panel neu laden).',
  });
  return false;
}
