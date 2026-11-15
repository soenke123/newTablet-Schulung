// ══════════════════════════════════════════════════════════════
// POST /api/mail_dispatch   — Antrags-Mails verschicken (Migration 0203)
// ══════════════════════════════════════════════════════════════
// Headers: Authorization: Bearer <MAIL_DISPATCH_SECRET>
//
// Wird nicht vom Browser gerufen, sondern von der Datenbank: pg_cron
// ruft jede Minute mail_kick(), und das schickt — nur wenn etwas
// fällig ist — per pg_net einen POST hierher. Das Geheimnis steht
// dort in mail_settings.dispatch_secret, hier in MAIL_DISPATCH_SECRET.
//
// Flow:
//   1) Geheimnis prüfen
//   2) pa_mail_claim(): Bestätigungsmails + fällige Räume (5 Min.
//      gebündelt), als „in Arbeit" markiert; mps_mail_claim() (0291):
//      neue Lehrkraft-Anträge → eine Mail ohne Personendaten an
//      mail_settings.admin_email
//   3) Über den IServ-Account per SMTP verschicken — je Empfänger
//      eine eigene Mail (persönlicher Abmelde-Link)
//   4) pa_mail_done(): was rausging, was nicht (→ nächster Lauf)
//
// Inhalt: Raumtitel, Gruppenname, Datum. Keine Schülernamen, kein
// Ort, keine Tätigkeit — die stehen nach dem Login im Raum.
//
// Env-Vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           MAIL_DISPATCH_SECRET,
//           SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS,
//           SMTP_FROM     (Standard: "MPS Projektarbeit" <SMTP_USER>)
//           SITE_URL      (z. B. https://tablet.mps-ki.de; sonst aus dem Host)
//           MAIL_BCC_SELF ('1': jede Mail als BCC an den Account selbst,
//                          dann liegt eine Kopie in seinem Posteingang)
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { makeTransport, siteUrl, smtpReady } from './_mail.js';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// '2026-10-15' → 'Do, 15.10.'
function deDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '(ohne Datum)';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${WD[d.getUTCDay()]}, ${m[3]}.${m[2]}.`;
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

// Seit 0291 gilt die Adresse für mehr als die Projektarbeit: Antrag
// auf ein Lehrkraft-Konto, Passwort zurücksetzen, Antrags-Mails.
function verifyMail(site, v) {
  return {
    subject: 'Bitte bestätige deine E-Mail-Adresse für MPSkills',
    text:
`Hallo,

diese Adresse wurde bei MPSkills für ein Lehrkraft-Konto eingetragen.
Damit kannst du dein Passwort selbst zurücksetzen und auf Wunsch
Mails über neue Anträge in der Projektarbeit bekommen.

Bitte bestätige die Adresse mit diesem Link:
${site}/api/notify_email?verify=${v.token}

Warst du das nicht? Dann diesen Link öffnen — die Adresse wird gelöscht:
${site}/api/notify_email?stop=${v.stop}

--
MPSkills · automatisch verschickt`
  };
}

// Mail an den Volladmin (0291). Bewusst OHNE Name, Schule oder
// Nachricht: die stehen im Admin-Panel hinter Anmeldung + 2FA.
function adminMail(site, a) {
  const n = a.count || 1;
  return {
    subject: n === 1 ? 'MPSkills: Eine Lehrkraft möchte einen Account'
                     : `MPSkills: ${n} Lehrkräfte möchten einen Account`,
    text:
`Hallo,

${n === 1 ? 'eine Lehrkraft möchte' : n + ' Lehrkräfte möchten'} einen Account bei MPSkills.

Freigeben oder ablehnen im Admin-Panel unter „Lehrkräfte“:
${site}/admin/index.html

--
MPSkills · automatisch verschickt`
  };
}

function antragMail(site, room, to) {
  const n = room.items.length;
  const lines = room.items.map(i =>
    `  • ${i.group} – Lernen am anderen Ort am ${deDay(i.date)}${i.resent ? ' (überarbeitet neu abgeschickt)' : ''}`);
  return {
    subject: `${room.room_title || 'Projektarbeit'}: ${n === 1 ? '1 neuer Antrag' : n + ' neue Anträge'}`,
    text:
`Hallo,

in „${room.room_title || 'Projektarbeit'}“ ${n === 1 ? 'wartet ein neuer Antrag' : 'warten ' + n + ' neue Anträge'}:

${lines.join('\n')}

Zum Raum (Anmeldung nötig):
${site}/MPSkills/lehrer.html#${encodeURIComponent(room.room_code)}

--
Du bekommst diese Mail, weil du im Raum „Mail bei neuen Anträgen“ eingeschaltet hast.
Abschalten: im Raum unter 🔔, oder für alle Räume:
${site}/api/notify_email?stop=${to.stop}`
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const secret = process.env.MAIL_DISPATCH_SECRET;
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !sameSecret(auth, secret)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const url         = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smtpUser    = process.env.SMTP_USER;
  if (!url || !serviceRole || !smtpReady()) {
    console.error('[mail_dispatch] Env unvollständig (SUPABASE_*, SMTP_HOST/USER/PASS).');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }
  const site = siteUrl(req);

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data: job, error: claimErr } = await admin.rpc('pa_mail_claim');
  if (claimErr || !job || !job.ok) {
    console.error('[mail_dispatch] pa_mail_claim:', claimErr?.message || job);
    return res.status(500).json({ ok: false, error: 'claim_failed' });
  }
  const verify = job.verify || [];
  const rooms  = job.rooms || [];

  // Lehrkraft-Anträge an den Volladmin (0291). Fehlt die Migration,
  // läuft der Rest wie bisher.
  let adminJob = null;
  {
    const { data: mj, error: mjErr } = await admin.rpc('mps_mail_claim');
    if (mjErr) console.warn('[mail_dispatch] mps_mail_claim:', mjErr.message);
    else adminJob = mj?.admin || null;
  }

  if (!verify.length && !rooms.length && !adminJob) {
    return res.status(200).json({ ok: true, sent: 0 });
  }

  const transport = makeTransport();
  const from = process.env.SMTP_FROM || `"MPS Projektarbeit" <${smtpUser}>`;
  const bcc  = process.env.MAIL_BCC_SELF === '1' ? smtpUser : undefined;

  const send = async (to, mail) => {
    await transport.sendMail({ from, to, bcc, subject: mail.subject, text: mail.text });
  };

  const result = { verify: [], rooms: [] };
  let sent = 0;

  for (const v of verify) {
    try {
      await send(v.email, verifyMail(site, v));
      result.verify.push({ user_id: v.user_id, ok: true });
      sent++;
    } catch (e) {
      console.warn('[mail_dispatch] Bestätigung an', v.email, 'fehlgeschlagen:', e.message);
      result.verify.push({ user_id: v.user_id, ok: false });
    }
  }

  for (const room of rooms) {
    const sentTo = [];
    const errors = [];
    for (const to of room.to || []) {
      try {
        await send(to.email, antragMail(site, room, to));
        sentTo.push(to.user_id);
        sent++;
      } catch (e) {
        console.warn('[mail_dispatch] Antrags-Mail an', to.email, 'fehlgeschlagen:', e.message);
        errors.push(e.message);
      }
    }
    result.rooms.push({ ids: room.ids, ok: sentTo.length > 0, sent_to: sentTo, error: errors.join('; ').slice(0, 250) });
  }

  if (adminJob) {
    const to = String(adminJob.to || '').split(',').map(x => x.trim()).filter(Boolean);
    let res2 = { ids: adminJob.ids, ok: false, error: '' };
    try {
      await transport.sendMail({ from, to, bcc, ...adminMail(site, adminJob) });
      res2.ok = true;
      sent++;
    } catch (e) {
      console.warn('[mail_dispatch] Admin-Mail fehlgeschlagen:', e.message);
      res2.error = String(e.message || '').slice(0, 250);
    }
    const { error: mdErr } = await admin.rpc('mps_mail_done', { p_res: { admin: res2 } });
    if (mdErr) console.error('[mail_dispatch] mps_mail_done:', mdErr.message);
  }

  try { transport.close(); } catch { /* egal */ }

  const { error: doneErr } = await admin.rpc('pa_mail_done', { p_res: result });
  if (doneErr) {
    // Die Mails sind raus, nur die Rückmeldung fehlt: nach 10 Minuten
    // gilt die Markierung als verfallen und es ginge noch einmal raus.
    // Lieber doppelt als gar nicht — aber laut melden.
    console.error('[mail_dispatch] pa_mail_done:', doneErr.message);
    return res.status(500).json({ ok: false, error: 'done_failed', sent });
  }
  return res.status(200).json({ ok: true, sent });
}
