// ══════════════════════════════════════════════════════════════
// POST /api/admin_create_school
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <admin-JWT>
// Body:    { name, slug }
//
// Nur Volladmin. Legt eine neue Schule an. Slug wird für die
// Fake-Mail-Domain (<account>@<slug>.tablet-schulung.fake) benutzt
// und muss lowercase, alphanumerisch mit optionalen Hyphens sein.
//
// Response: { ok: true, school: { id, slug, name } }
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_utils.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LEN = 60;
const MAX_SLUG_LEN = 32;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[admin_create_school] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
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
  const name = String(body.name ?? '').trim();
  const slug = String(body.slug ?? '').trim().toLowerCase();

  if (!name || name.length > MAX_NAME_LEN) {
    return res.status(400).json({ ok: false, error: 'invalid_name',
      message: `Name muss 1–${MAX_NAME_LEN} Zeichen haben.` });
  }
  if (!slug || slug.length > MAX_SLUG_LEN || !SLUG_RE.test(slug)) {
    return res.status(400).json({ ok: false, error: 'invalid_slug',
      message: 'Slug muss lowercase alphanumerisch mit optionalen Bindestrichen sein (z. B. "hogwarts", "st-marien").' });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const callerId = userData.user.id;

  const { data: caller, error: callerErr } = await admin
    .from('profiles').select('is_superadmin').eq('id', callerId).maybeSingle();
  if (callerErr) {
    console.error('[admin_create_school] caller lookup failed:', callerErr);
    return res.status(500).json({ ok: false, error: 'profile_lookup_failed', message: callerErr.message });
  }
  if (!caller?.is_superadmin) {
    return res.status(403).json({ ok: false, error: 'not_volladmin' });
  }

  const { data: created, error: insErr } = await admin
    .from('schools')
    .insert({ slug, name, active: true })
    .select('id, slug, name')
    .maybeSingle();
  if (insErr) {
    if (insErr.code === '23505') {
      return res.status(409).json({ ok: false, error: 'school_exists',
        message: `Eine Schule mit Slug "${slug}" oder Name "${name}" existiert bereits.` });
    }
    console.error('[admin_create_school] insert failed:', insErr);
    return res.status(500).json({ ok: false, error: 'insert_failed', message: insErr.message });
  }

  console.log(`[admin_create_school] caller=${callerId} created school ${created.slug}/${created.name}`);
  return res.status(200).json({ ok: true, school: created });
}
