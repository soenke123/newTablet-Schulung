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
