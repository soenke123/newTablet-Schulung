-- ══════════════════════════════════════════════════════════════
-- Migration 0288 — Neue Schule: Isarnwohld-Schule Gettorf
-- ══════════════════════════════════════════════════════════════
-- Sönke 13.11.2026. Slug „isarnwohld“ = Fake-Mail-Domain der Konten
-- (<account>@isarnwohld.tablet-schulung.fake). Gleich wie
-- „Schule anlegen“ im Admin-Panel (api/admin_create_school.js).
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

insert into schools (slug, name, active)
values ('isarnwohld', 'Isarnwohld-Schule Gettorf', true)
on conflict (slug) do nothing;
