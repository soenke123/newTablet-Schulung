-- ══════════════════════════════════════════════════════════════
-- Migration 0010 — Avatar "NEW"-Sticker: gesehen-Zeitpunkt
-- ══════════════════════════════════════════════════════════════
-- Für die Avatar-Freischaltung mit "NEU"-Badge:
--   1. Spalte avatars_seen_at auf profiles
--   2. View user_session um avatars_seen_at ergänzen
--   3. RPC mark_avatars_seen() — setzt Timestamp auf now()
--
-- Ableitungs-Logik läuft komplett client-seitig (Vergleich mit
-- shopData.seenCreatures aus dem Hub-localStorage).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- profiles.avatars_seen_at
-- ─────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists avatars_seen_at timestamptz;

comment on column profiles.avatars_seen_at is
  'Zeitpunkt an dem der User zuletzt den Avatar-Picker geöffnet hat. Für "NEU"-Badge.';

-- Bestehende User als "hat alles gesehen" initialisieren, sonst zeigen
-- alle beim ersten Boot einen NEU-Sturm auf schon lange geöffnete Avatare.
-- (Neue Signups werden mit NULL angelegt → alles ist für sie NEU, wenn sie
-- ihre erste Kreatur haben.)
update profiles
  set avatars_seen_at = now()
  where avatars_seen_at is null;


-- ─────────────────────────────────────────────────────────────
-- View user_session — avatars_seen_at ergänzen
-- ─────────────────────────────────────────────────────────────
drop view if exists user_session;

create view user_session as
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
  coalesce(c.season, 0) as season
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;

comment on view user_session is
  'Effektive Session inkl. Klartext-Namen, avatar_id und avatars_seen_at.';

alter view user_session set (security_invoker = true);

grant select on user_session to authenticated;
grant select on user_session to service_role;


-- ─────────────────────────────────────────────────────────────
-- mark_avatars_seen() -> jsonb
-- ─────────────────────────────────────────────────────────────
-- Setzt avatars_seen_at des eigenen Profils auf now().
-- Wird vom Picker beim Öffnen aufgerufen → NEW-Badges verschwinden.
create or replace function mark_avatars_seen()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_now     timestamptz := now();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update profiles set avatars_seen_at = v_now where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  return jsonb_build_object('ok', true, 'seen_at', v_now);
end;
$$;

revoke all on function mark_avatars_seen() from public;
grant execute on function mark_avatars_seen() to authenticated;
