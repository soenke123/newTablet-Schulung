// ══════════════════════════════════════════════════════════════
// GET /api/my_ip — die eigene öffentliche IP (für Siegel I im GameHub)
// ══════════════════════════════════════════════════════════════
// Ersetzt api.ipify.org: Das Rätsel „Kennst du deine Adresse?“ hat die
// IP dafür an einen fremden Dienst in den USA geschickt. Hier bleibt
// sie bei uns (Vercel, fra1) und wird nirgends gespeichert oder
// geloggt — die Function gibt nur zurück, was sie ohnehin sieht.
// Die Content-Security-Policy (vercel.json) erlaubt fremde Dienste
// in connect-src ohnehin nicht mehr.
// ══════════════════════════════════════════════════════════════

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const xff = req.headers['x-forwarded-for'];
  const ip = (typeof xff === 'string' && xff ? xff.split(',')[0] : req.headers['x-real-ip'] || '').trim();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ip });
}
