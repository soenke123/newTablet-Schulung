-- ══════════════════════════════════════════════════════════════
-- Migration 0018 — Rate-Limit-Log für /api/signup
-- ══════════════════════════════════════════════════════════════
-- Verhindert Bot-Spam auf den öffentlichen Signup-Endpoint.
-- Die Vercel Function loggt jeden Aufruf mit IP + Timestamp und
-- lehnt ab, sobald pro IP innerhalb einer Stunde ein Limit
-- überschritten wird.
--
-- Limit-Wahl: 300/Stunde/IP. Klassenzimmer-tauglich (30 Schüler
-- hinter einem NAT, Retries eingerechnet), aber ein Bot kratzt
-- die Grenze in Sekunden.
--
-- Nur service_role greift zu (die Vercel Function nutzt
-- SUPABASE_SERVICE_ROLE_KEY, RLS wird eh gebypassed). Trotzdem
-- RLS ohne Policy = deny-by-default für anon/authenticated.
-- ══════════════════════════════════════════════════════════════

create table if not exists signup_attempts (
  id          bigserial primary key,
  ip          text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists signup_attempts_ip_ts_idx
  on signup_attempts(ip, created_at desc);

create index if not exists signup_attempts_ts_idx
  on signup_attempts(created_at desc);

alter table signup_attempts enable row level security;
-- Keine Policy angelegt → anon/authenticated werden geblockt.
-- service_role bypasst RLS automatisch (Supabase-Design).

grant all on signup_attempts to service_role;
grant usage, select on sequence signup_attempts_id_seq to service_role;

comment on table signup_attempts is
  'IP-basiertes Rate-Limit-Log für api/signup. Nur service_role liest/schreibt.';
