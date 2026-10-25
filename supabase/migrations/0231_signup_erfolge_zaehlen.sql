-- ══════════════════════════════════════════════════════════════
-- Migration 0231 — api/signup zählt auch erfolgreiche Registrierungen
-- ══════════════════════════════════════════════════════════════
-- Fund (Sicherheitsprüfung 25.10.2026): Das Limit in api/signup.js
-- (0018) zählte nur Fehlversuche. Mit gültigen Eingaben ließen sich
-- von einer Adresse beliebig viele Konten anlegen — über MPSkills
-- jedes mit einem offenen Lehrkraft-Antrag im Admin-Panel.
--
-- Ab hier schreibt api/signup.js auch jede erfolgreiche Registrierung
-- in signup_attempts (ok = true). Grenzen je IP und Stunde:
--   • Fehlversuche (ok = false): 500 wie bisher
--   • erfolgreiche Konten (ok = true): 140 — reicht für einen ganzen
--     Jahrgang hinter einer Schul-IP
--
-- Löschfrist unverändert: skill_cleanup löscht signup_attempts nach
-- 1 Tag (0208/0227). datenschutz.html nennt die IP jetzt auch bei
-- erfolgreicher Registrierung.
--
-- Reihenfolge zu Vercel egal: Ohne die Spalte schlägt die Zählung in
-- api/signup.js fehl und läuft „fail-open“ weiter (wie bisher bei
-- Fehlern der Zählung), das Protokoll eines Erfolgs wird übersprungen.
-- ══════════════════════════════════════════════════════════════

alter table signup_attempts
  add column if not exists ok boolean not null default false;

create index if not exists signup_attempts_ip_ok_ts_idx
  on signup_attempts(ip, ok, created_at desc);

comment on column signup_attempts.ok is
  'true = erfolgreiche Registrierung (Limit 140/h je IP), false = Fehlversuch (Limit 500/h je IP). Gelöscht nach 1 Tag.';
