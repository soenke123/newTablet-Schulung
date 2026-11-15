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
//      Volladmins (0293); Willkommens-Mails bei Freischaltung (0294)
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
//           SMTP_FROM     (Standard: "MPSkills" <SMTP_USER>)
//           SITE_URL      (z. B. https://tablet.mps-ki.de; sonst aus dem Host)
//           MAIL_BCC_SELF ('1': jede Mail als BCC an den Account selbst,
//                          dann liegt eine Kopie in seinem Posteingang)
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { makeTransport, mailFrom, siteUrl, smtpReady, sendPretty,
         mailHtml, mailP, mailButton, mailBox, mailChecks, mailLink, mailEsc } from './_mail.js';

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

// Seit 15.11.2026 gestaltet (HTML mit Logo und Knöpfen, _mail.js);
// text bleibt als Fassung für Programme ohne HTML.

// Seit 0291 gilt die Adresse für mehr als die Projektarbeit: Antrag
// auf ein Lehrkraft-Konto, Passwort zurücksetzen, Antrags-Mails.
function verifyMail(site, v) {
  const ok   = `${site}/api/notify_email?verify=${v.token}`;
  const stop = `${site}/api/notify_email?stop=${v.stop}`;
  return {
    subject: 'Bitte bestätige deine E-Mail-Adresse für MPSkills',
    text:
`Hallo,

diese Adresse wurde bei MPSkills für ein Lehrkraft-Konto eingetragen.
Damit kannst du dein Passwort selbst zurücksetzen und auf Wunsch
Mails über neue Anträge in der Projektarbeit bekommen.

Bitte bestätige die Adresse mit diesem Link:
${ok}

Warst du das nicht? Dann diesen Link öffnen — die Adresse wird gelöscht:
${stop}

--
MPSkills · automatisch verschickt`,
    html: mailHtml({
      preheader: 'Ein Klick, dann ist deine Adresse bestätigt.',
      title: 'Bitte bestätige deine E-Mail-Adresse',
      body:
        mailP('Hallo,') +
        mailP('diese Adresse wurde bei MPSkills für ein Lehrkraft-Konto eingetragen. Nach dem Bestätigen kannst du damit:') +
        mailChecks(['dein Passwort selbst zurücksetzen', 'auf Wunsch Mails über neue Anträge in der Projektarbeit bekommen']) +
        mailButton(ok, 'Adresse bestätigen'),
      footer: `Warst du das nicht? Dann ${mailLink(stop, 'diese Adresse löschen')} — es kommen keine weiteren Mails.`
    })
  };
}

// Mail an den Volladmin (0291). Bewusst OHNE Name, Schule oder
// Nachricht: die stehen im Admin-Panel hinter Anmeldung + 2FA.
function adminMail(site, a) {
  const n = a.count || 1;
  const panel = `${site}/admin/index.html`;
  const satz = n === 1 ? 'Eine Lehrkraft möchte' : `${n} Lehrkräfte möchten`;
  return {
    subject: n === 1 ? 'MPSkills: Eine Lehrkraft möchte einen Account'
                     : `MPSkills: ${n} Lehrkräfte möchten einen Account`,
    text:
`Hallo,

${n === 1 ? 'eine Lehrkraft möchte' : n + ' Lehrkräfte möchten'} einen Account bei MPSkills.

Freigeben oder ablehnen im Admin-Panel unter „Lehrkräfte“:
${panel}

--
MPSkills · automatisch verschickt`,
    html: mailHtml({
      preheader: 'Freigeben oder ablehnen im Admin-Panel.',
      title: `${satz} einen Account`,
      body:
        mailP('Hallo,') +
        mailP(`${satz} einen Lehrkraft-Account bei MPSkills. Wer es ist und die Nachricht dazu siehst du im Admin-Panel unter <b>„Lehrkräfte“</b>.`) +
        mailButton(panel, 'Zum Admin-Panel')
    })
  };
}

function antragMail(site, room, to) {
  const n = room.items.length;
  const title = room.room_title || 'Projektarbeit';
  const href = `${site}/MPSkills/lehrer.html#${encodeURIComponent(room.room_code)}`;
  const stop = `${site}/api/notify_email?stop=${to.stop}`;
  const line = i => `${i.group} – Lernen am anderen Ort am ${deDay(i.date)}${i.resent ? ' (überarbeitet neu abgeschickt)' : ''}`;
  const lines = room.items.map(i => `  • ${line(i)}`);
  return {
    subject: `${title}: ${n === 1 ? '1 neuer Antrag' : n + ' neue Anträge'}`,
    text:
`Hallo,

in „${title}“ ${n === 1 ? 'wartet ein neuer Antrag' : 'warten ' + n + ' neue Anträge'}:

${lines.join('\n')}

Zum Raum (Anmeldung nötig):
${href}

--
Du bekommst diese Mail, weil du im Raum „Mail bei neuen Anträgen“ eingeschaltet hast.
Abschalten: im Raum unter 🔔, oder für alle Räume:
${stop}`,
    html: mailHtml({
      preheader: room.items.map(line).join(' · '),
      title: n === 1 ? 'Ein neuer Antrag' : `${n} neue Anträge`,
      body:
        mailP(`In <b>„${mailEsc(title)}“</b> ${n === 1 ? 'wartet ein neuer Antrag' : `warten ${n} neue Anträge`} auf deine Entscheidung:`) +
        mailBox(room.items.map(i =>
          `<div style="margin:2px 0"><b>${mailEsc(i.group)}</b> – Lernen am anderen Ort am ${mailEsc(deDay(i.date))}`
          + (i.resent ? ' <span style="color:#5b6863">(überarbeitet neu abgeschickt)</span>' : '') + '</div>').join('')) +
        mailButton(href, 'Zum Raum') +
        mailP('<span style="color:#5b6863;font-size:13px">Zum Öffnen musst du angemeldet sein.</span>'),
      footer: `Du bekommst diese Mail, weil im Raum „Mail bei neuen Anträgen“ (🔔) an ist. `
        + `Abschalten im Raum unter 🔔 oder ${mailLink(stop, 'für alle Räume abbestellen')}.`
    })
  };
}

// Willkommen nach der Freischaltung (0294). Geht auch an eine noch
// unbestätigte Adresse — dann mit Bestätigungslink.
function welcomeMail(site, w) {
  const start = `${site}/MPSkills/index.html`;
  const ok = w.verify_token ? `${site}/api/notify_email?verify=${w.verify_token}` : '';
  const name = w.name || w.account || '';
  return {
    subject: 'Herzlich willkommen bei MPSkills!',
    text:
`Hallo ${name},

herzlich willkommen bei MPSkills! Dein Lehrkraft-Account ist freigeschaltet.

Entdecke die Skills für deinen Unterricht:
  • Skill aussuchen und einen Raum für deine Klasse eröffnen
  • Die Klasse kommt per Code oder QR-Code dazu — ganz ohne eigenes Konto
  • Räume verwalten und Kolleg:innen einladen

Los geht's: ${start}

Dein Accountname: ${w.account}${w.school ? '\nSchule: ' + w.school : ''}
${ok ? `
Bitte bestätige noch deine E-Mail-Adresse — dann kannst du dein Passwort
selbst zurücksetzen:
${ok}
` : ''}
Viel Freude im Unterricht!

--
MPSkills · automatisch verschickt`,
    html: mailHtml({
      preheader: 'Dein Lehrkraft-Account ist freigeschaltet — entdecke die Räume für deinen Unterricht.',
      title: `Herzlich willkommen${name ? ', ' + name : ''}!`,
      body:
        mailP('Dein Lehrkraft-Account bei MPSkills ist <b>freigeschaltet</b>. Schön, dass du dabei bist!') +
        mailP('Entdecke die Skills für deinen Unterricht:') +
        mailChecks([
          'Skill aussuchen und einen <b>Raum</b> für deine Klasse eröffnen',
          'Die Klasse kommt per <b>Code oder QR-Code</b> dazu — ganz ohne eigenes Konto',
          'Räume verwalten und <b>Kolleg:innen einladen</b>'
        ]) +
        mailButton(start, 'Räume entdecken') +
        mailBox(`Dein Accountname: <b>${mailEsc(w.account)}</b>`
          + (w.school ? `<br>Schule: ${mailEsc(w.school)}` : '')) +
        (ok ? mailBox(`<b>Noch ein Schritt:</b> Bitte bestätige deine E-Mail-Adresse — dann kannst du dein Passwort selbst zurücksetzen. ${mailLink(ok, 'Jetzt bestätigen')}`) : '') +
        '<div style="height:10px"></div>' +
        mailP('Viel Freude im Unterricht!')
    })
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
  let welcome  = [];
  {
    const { data: mj, error: mjErr } = await admin.rpc('mps_mail_claim');
    if (mjErr) console.warn('[mail_dispatch] mps_mail_claim:', mjErr.message);
    else { adminJob = mj?.admin || null; welcome = mj?.welcome || []; }
  }

  if (!verify.length && !rooms.length && !adminJob && !welcome.length) {
    return res.status(200).json({ ok: true, sent: 0 });
  }

  const transport = makeTransport();
  const from = mailFrom();
  const bcc  = process.env.MAIL_BCC_SELF === '1' ? smtpUser : undefined;

  const send = (to, mail) => sendPretty(transport, { from, to, bcc, ...mail });

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

  if (adminJob || welcome.length) {
    let res2 = null;
    if (adminJob) {
      const to = String(adminJob.to || '').split(',').map(x => x.trim()).filter(Boolean);
      res2 = { ids: adminJob.ids, ok: false, error: '' };
      try {
        await send(to, adminMail(site, adminJob));
        res2.ok = true;
        sent++;
      } catch (e) {
        console.warn('[mail_dispatch] Admin-Mail fehlgeschlagen:', e.message);
        res2.error = String(e.message || '').slice(0, 250);
      }
    }
    // Willkommen nach der Freischaltung (0294)
    const wres = [];
    for (const w of welcome) {
      try {
        await send(w.email, welcomeMail(site, w));
        wres.push({ id: w.id, ok: true });
        sent++;
      } catch (e) {
        console.warn('[mail_dispatch] Willkommens-Mail an', w.email, 'fehlgeschlagen:', e.message);
        wres.push({ id: w.id, ok: false, error: String(e.message || '').slice(0, 250) });
      }
    }
    const { error: mdErr } = await admin.rpc('mps_mail_done', { p_res: { admin: res2, welcome: wres } });
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
