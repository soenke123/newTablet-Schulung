// ══════════════════════════════════════════════════════════════
// SMTP über den IServ-Account (api/MAIL_SETUP.md) — geteilt von
// mail_dispatch.js (Anträge, Bestätigungen, Admin-Mail) und
// notify_email.js (Passwort zurücksetzen, Migration 0291).
// Underscore-Datei: zählt nicht zu den 12 Vercel-Functions.
// ══════════════════════════════════════════════════════════════
import nodemailer from 'nodemailer';

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
