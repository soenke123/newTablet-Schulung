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
