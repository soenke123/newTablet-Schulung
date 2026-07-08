-- ══════════════════════════════════════════════════════════════
-- Migration 0015 — Login-Timestamps für Admin-Dashboard
-- ══════════════════════════════════════════════════════════════
-- Für die "Aktivität"-Metrik im Dashboard reicht `game_state.updated_at`
-- nicht: ein User, der sich täglich einloggt und die Sammlung
-- anschaut ohne zu spielen, wäre sonst "inaktiv".
--
-- Wir tracken deshalb Logins explizit in profiles.last_login_at.
-- Der Client (session.js) ruft nach erfolgreichem Auth-Event
-- die RPC touch_login() auf, die den Timestamp für den eigenen
-- User setzt. SECURITY DEFINER, damit die Update trotz der
-- profiles-RLS-Policies durchgeht.
-- ══════════════════════════════════════════════════════════════

alter table profiles
  add column if not exists last_login_at timestamptz;

create index if not exists profiles_last_login_idx on profiles(last_login_at desc);

comment on column profiles.last_login_at is
  'Zeitpunkt des letzten erfolgreichen Auth-Events. Wird von session.js via touch_login() gepflegt.';


-- ─────────────────────────────────────────────────────────────
-- RPC: touch_login()
-- ─────────────────────────────────────────────────────────────
-- Setzt last_login_at für den eingeloggten User auf now().
-- Idempotent, ohne Return-Wert relevant für den Client.
create or replace function touch_login()
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;
  update profiles set last_login_at = now() where id = v_user_id;
end;
$$;

revoke all on function touch_login() from public;
grant execute on function touch_login() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- user_session-View um last_login_at ergänzen
-- ─────────────────────────────────────────────────────────────
-- Damit der Frontend-Session-Layer optional das Feld sehen könnte,
-- ohne einen zweiten Query zu brauchen.
--
-- WICHTIG: create-or-replace-view lässt keine Umordnung/Weglassen zu
-- ("cannot drop columns from view"). Wir müssen deshalb ALLE Spalten
-- der bestehenden View (Stand: 0010) beibehalten und last_login_at
-- ans Ende anhängen.
create or replace view user_session as
select
  p.id,
  p.school_id,
  p.cluster_id,
  p.account_name,
  p.display_name,
  p.status,
  p.is_admin,
  p.avatar_id,
  p.avatars_seen_at,
  s.name  as school_name,
  c.name  as cluster_name,
  coalesce(c.season, 0) as season,
  p.last_login_at
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;
