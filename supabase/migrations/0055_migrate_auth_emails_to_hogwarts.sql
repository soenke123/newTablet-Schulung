-- ══════════════════════════════════════════════════════════════
-- Migration 0055 — auth.users.email nach Hogwarts nachziehen
-- ══════════════════════════════════════════════════════════════
-- Bug aus Migration 0053: Beim Umzug aller Nicht-Admin-User nach
-- Hogwarts wurde nur `profiles.school_id` verschoben. Der Login
-- baut aber die Fake-Mail aus dem Schul-Slug:
--
--   const email = `${account_name}@${school.slug}.${FAKE_EMAIL_DOMAIN}`;
--   (api/signup.js:197 — analog im Login-Fluss auf der Landing-Seite)
--
-- Ergebnis: Frontend zeigt „Schule: Hogwarts", aber Login
-- funktioniert nur, wenn der User „MPS" auswählt, weil die
-- auth.users.email noch @mps.tablet-schulung.fake ist.
--
-- Fix: alle auth.users, deren profile jetzt in Hogwarts liegt und
-- deren email noch auf @mps.tablet-schulung.fake endet, auf
-- @hogwarts.tablet-schulung.fake umsetzen.
--
-- Admin-Accounts (Sönke) bleiben in MPS, ihre Email ändert sich
-- nicht — die where-Klausel prüft explizit auf school_id = hogwarts.
--
-- Idempotent: LIKE-Filter greift nur bei mps-Emails, wiederholtes
-- Ausführen ist ein No-Op.
-- ══════════════════════════════════════════════════════════════

update auth.users u
   set email = replace(u.email, '@mps.tablet-schulung.fake', '@hogwarts.tablet-schulung.fake')
  from profiles p
  join schools  s on s.id = p.school_id
 where p.id      = u.id
   and s.slug    = 'hogwarts'
   and u.email like '%@mps.tablet-schulung.fake';
