// ══════════════════════════════════════════════════════════════
// POST /api/skill_join   — MPSkills Beitritt (Stufe 3)
// ══════════════════════════════════════════════════════════════
// Body: { code, mode: 'peek' | 'join', name?, access_token? }
//
// Zwei Modi, ein Endpunkt:
//   'peek' — Was steht hinter diesem Code? Raumtitel, Werkzeug,
//            ob der Beitritt offen ist. Legt nichts an.
//   'join' — Teilnehmer anlegen und den Token zurückgeben.
//
// ── Warum das ein Endpunkt ist und keine Datenbank-Funktion ───
// Der Raum-Code ist das einzige erratbare Geheimnis im System.
// Wer ihn prüft, muss zählen können, wie oft jemand daneben liegt
// — und die Client-Adresse sieht nur diese Function, nicht die
// Datenbank. Deshalb sind skill_room_peek und skill_room_join in
// Migration 0079 ausschließlich an service_role vergeben.
//
// ── Warum peek durch dieselbe Tür muss ────────────────────────
// Gäbe es ein peek für anon, ließen sich Codes daran vorbei
// durchprobieren und das Rate-Limit hier wäre wirkungslos. Beide
// Modi zählen deshalb gegen dieselbe IP-Grenze.
//
// ── Was hier bleibt und was die Datenbank macht ───────────────
// Hier: Client-IP, Rate-Limit, Schimpfwortprüfung auf den Namen,
// und das Auflösen des Access-Tokens zu einer user_id.
// Dort: alles, was atomar sein muss — Platzprüfung und Sitznummer
// unter einer Zeilensperre. Ein Klassensatz, der auf ein Kommando
// scannt, tritt wirklich gleichzeitig bei.
//
// ⚠ p_user_id wird NIEMALS aus dem Body übernommen. Es kommt aus
//   dem geprüften JWT — sonst könnte sich jedes Gerät als
//   beliebiger Account ausgeben und dessen Platz übernehmen.
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_utils.js';

// Max FEHLGESCHLAGENE Versuche pro IP und Stunde. Erfolgreiche
// Beitritte zählen nicht.
//
// Die Zahl muss zwei Dinge zugleich aushalten: eine ganze Klasse
// hinter EINER Schul-IP, die sich vertippt — und einen Versuch,
// Codes durchzuprobieren. Bei 32^6 Möglichkeiten und ein paar
// hundert lebenden Räumen liegt die Trefferwahrscheinlichkeit pro
// Versuch bei ungefähr 1:5.000.000; 200 Versuche pro Stunde sind
// dagegen nichts, für eine Klasse mit Tippfehlern aber reichlich.
const RATE_LIMIT_PER_HOUR = 200;

// Dasselbe Alphabet wie skill_gen_code() in Migration 0079.
const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

// Wie der Anzeigename beim Signup (api/signup.js), nur kürzer: der
// Name steht an der Wand und in der Wolke, nicht in einem Konto.
const NAME_RE = /^[A-Za-zÄÖÜäöüß0-9 ._-]{1,24}$/;

function extractClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) return realIp.trim();
  return 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error('[skill_join] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // ── Rate-Limit ──
  // Fail-open wie bei signup: eine kaputte Zählung darf keine
  // Klasse aussperren. Der Schutz ist die Codelänge, das
  // Rate-Limit ist die zweite Reihe.
  const clientIp = extractClientIp(req);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const { count, error: rlErr } = await admin
      .from('skill_join_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', clientIp)
      .gte('created_at', oneHourAgo);
    if (rlErr) {
      console.warn('[skill_join] rate-limit check failed (fail-open):', rlErr.message);
    } else if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return res.status(429).json({ ok: false, error: 'rate_limit' });
    }
  } catch (e) {
    console.warn('[skill_join] rate-limit block failed (fail-open):', e.message);
  }

  // Fehlversuch protokollieren und antworten. Fire-and-forget —
  // das Log darf die Antwort nicht verzögern.
  const fail = (status, payload) => {
    admin.from('skill_join_attempts').insert({ ip: clientIp })
      .then(({ error }) => {
        if (error) console.warn('[skill_join] attempt log failed:', error.message);
      });
    return res.status(status).json({ ok: false, ...payload });
  };

  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return fail(400, { error: 'invalid_json' });
  }

  const mode = String(body.mode ?? 'peek').trim().toLowerCase();
  const code = String(body.code ?? '').trim().toUpperCase();
  if (mode !== 'peek' && mode !== 'join') {
    return res.status(400).json({ ok: false, error: 'mode_invalid' });
  }
  // Ein Code, der nicht einmal die Form hat, ist ein Tippfehler
  // oder ein Versuch — beides zählt.
  if (!CODE_RE.test(code)) {
    return fail(400, { error: 'code_invalid' });
  }

  // ── peek ──
  if (mode === 'peek') {
    const { data, error } = await admin.rpc('skill_room_peek', { p_code: code });
    if (error) {
      console.error('[skill_join] skill_room_peek:', error);
      return res.status(500).json({ ok: false, error: 'lookup_failed' });
    }
    // Nicht gefunden oder abgelaufen: aus Sicht des Ratenden
    // dasselbe Ergebnis, und beides zählt gegen die IP.
    if (!data?.ok) return fail(404, { error: data?.error ?? 'not_found' });
    return res.status(200).json(data);
  }

  // ── join ──
  // Angemeldeter Schüler? Dann hängt der Teilnehmer zusätzlich an
  // seiner User-ID und wird auf einem zweiten Gerät wiedergefunden.
  // Die ID kommt aus dem geprüften JWT, nicht aus dem Body.
  let userId = null;
  const jwt = typeof body.access_token === 'string' ? body.access_token : null;
  if (jwt) {
    try {
      const { data: u, error: uErr } = await admin.auth.getUser(jwt);
      if (uErr) {
        // Abgelaufener Token ist kein Grund, den Beitritt zu
        // verweigern — dann tritt eben ein anonymes Gerät bei.
        console.warn('[skill_join] access_token ungültig (ignoriert):', uErr.message);
      } else {
        userId = u?.user?.id ?? null;
      }
    } catch (e) {
      console.warn('[skill_join] getUser fehlgeschlagen (ignoriert):', e.message);
    }
  }

  const rawName = String(body.name ?? '').trim();
  // Der Name wird hier nur geprüft, wenn einer mitkommt. OB einer
  // gebraucht wird, weiß der Raum (ask_names) — und das entscheidet
  // die Datenbank, damit ein anonymer Raum auch dann anonym bleibt,
  // wenn ein Gerät einen Namen mitschickt.
  if (rawName) {
    if (!NAME_RE.test(rawName)) {
      return fail(400, { error: 'name_invalid' });
    }
    const { data: bad, error: blErr } = await admin
      .rpc('contains_blacklisted_word', { input: rawName });
    if (blErr) {
      console.error('[skill_join] blacklist RPC:', blErr);
      return res.status(500).json({ ok: false, error: 'blacklist_check_failed' });
    }
    if (bad === true) {
      return fail(400, { error: 'name_blocked' });
    }
  }

  const { data, error } = await admin.rpc('skill_room_join', {
    p_code:    code,
    p_name:    rawName || null,
    p_user_id: userId
  });
  if (error) {
    console.error('[skill_join] skill_room_join:', error);
    return res.status(500).json({ ok: false, error: 'join_failed' });
  }
  if (!data?.ok) {
    // 'room_full', 'join_closed' und 'name_required' sind keine
    // Rateversuche, sondern Zustände — sie zählen nicht gegen die
    // IP, sonst sperrte ein voller Raum die ganze Schule aus.
    const soft = ['room_full', 'join_closed', 'name_required', 'name_too_long'];
    if (soft.includes(data?.error)) {
      return res.status(409).json({ ok: false, error: data.error, max: data.max });
    }
    return fail(404, { error: data?.error ?? 'not_found' });
  }

  return res.status(200).json(data);
}
