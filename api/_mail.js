// ══════════════════════════════════════════════════════════════
// SMTP über den IServ-Account (api/MAIL_SETUP.md) — geteilt von
// mail_dispatch.js (Anträge, Bestätigungen, Admin-Mail) und
// notify_email.js (Passwort zurücksetzen, Migration 0291).
// Underscore-Datei: zählt nicht zu den 12 Vercel-Functions.
// ══════════════════════════════════════════════════════════════
import nodemailer from 'nodemailer';
import { LOGO_PNG_BASE64 } from './_logo.js';

export function smtpReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function makeTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,          // 587 → STARTTLS
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

export function mailFrom() {
  return process.env.SMTP_FROM || `"MPSkills" <${process.env.SMTP_USER}>`;
}

export function siteUrl(req) {
  const env = (process.env.SITE_URL || '').replace(/\/+$/, '');
  if (env) return env;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `https://${host}` : '';
}

// ══════════════════════════════════════════════════════════════
// Gestaltete Mails (15.11.2026): HTML mit Logo, Überschrift, Knopf
// statt nackter Links — und immer dieselbe Fassung als reiner Text
// daneben (Mail-Programme ohne HTML, Spamfilter).
//
// Regeln für Mail-HTML: Tabellen statt Flex/Grid, alles inline,
// keine Web-Fonts, keine externen Bilder (Logo per CID, siehe
// _logo.js), helle Fläche (Dunkelmodus der Programme färbt selbst um).
// ══════════════════════════════════════════════════════════════
export const mailEsc = s => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const C = {
  bg: '#f2f5f3', card: '#ffffff', ink: '#1d2724', soft: '#5b6863', line: '#e3e9e6',
  accent: '#00b37e', accentInk: '#00714f', tint: '#e8f8f1'
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const LOGO_CID = 'logo@mpskills';

/** Großer grüner Knopf (funktioniert auch in Outlook). */
export function mailButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px">
  <tr><td style="border-radius:10px;background:${C.accent}">
    <a href="${mailEsc(href)}" style="display:inline-block;padding:13px 26px;font:600 16px/1.2 ${FONT};color:#ffffff;text-decoration:none;border-radius:10px">${mailEsc(label)}</a>
  </td></tr></table>`;
}

/** Hellgrün hinterlegter Kasten (Info, Liste, Hinweis). */
export function mailBox(inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 4px">
  <tr><td style="background:${C.tint};border-radius:12px;padding:14px 18px;font:15px/1.55 ${FONT};color:${C.ink}">${inner}</td></tr></table>`;
}

/** Liste mit grünen Häkchen. items = HTML-Strings. */
export function mailChecks(items) {
  return items.map(t => `<tr>
    <td valign="top" style="padding:3px 10px 3px 0;font:700 15px/1.5 ${FONT};color:${C.accent}">✓</td>
    <td style="padding:3px 0;font:15px/1.5 ${FONT};color:${C.ink}">${t}</td></tr>`).join('')
    .replace(/^/, '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 4px">') + '</table>';
}

export function mailLink(href, label) {
  return `<a href="${mailEsc(href)}" style="color:${C.accentInk};text-decoration:underline">${mailEsc(label)}</a>`;
}

/**
 * Ganze Mail. Alle Teile sind HTML (vorher escapen!):
 *   preheader  Vorschauzeile im Posteingang (Text, wird escaped)
 *   title      große Überschrift (Text, wird escaped)
 *   body       Inhalt
 *   footer     kleiner grauer Text unter der Karte
 */
export function mailHtml({ preheader = '', title, body, footer = '' }) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${mailEsc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${mailEsc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
<tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td style="padding:0 6px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:10px"><img src="cid:${LOGO_CID}" width="40" height="40" alt="" style="display:block;border:0"></td>
        <td style="font:700 21px/1 ${FONT};color:${C.ink};letter-spacing:-.01em">MP<span style="color:${C.accent}">Skills</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-top:4px solid ${C.accent};border-radius:16px;padding:28px 28px 24px">
      <h1 style="margin:0 0 14px;font:700 22px/1.3 ${FONT};color:${C.ink};letter-spacing:-.01em">${mailEsc(title)}</h1>
      <div style="font:15px/1.6 ${FONT};color:${C.ink}">${body}</div>
    </td></tr>
    <tr><td style="padding:16px 10px 0;font:12px/1.55 ${FONT};color:${C.soft}">
      ${footer}${footer ? '<br>' : ''}MPSkills · automatisch verschickt
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function mailP(html) {
  return `<p style="margin:0 0 12px;font:15px/1.6 ${FONT};color:${C.ink}">${html}</p>`;
}

/** Logo als eingebetteter Anhang — an jede gestaltete Mail hängen. */
export function logoAttachment() {
  return {
    filename: 'mpskills.png',
    content: Buffer.from(LOGO_PNG_BASE64, 'base64'),
    contentType: 'image/png',
    cid: LOGO_CID,
    contentDisposition: 'inline'
  };
}

/** sendMail mit HTML + Text + Logo. mail = { subject, text, html } */
export async function sendPretty(transport, { from, to, bcc, subject, text, html }) {
  return transport.sendMail({
    from, to, bcc, subject, text, html,
    attachments: html ? [logoAttachment()] : undefined
  });
}
