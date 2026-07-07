-- ══════════════════════════════════════════════════════════════
-- Migration 0009 — Profilbild (avatar_id) + Profil-Page-Daten
-- ══════════════════════════════════════════════════════════════
-- Für die neue profil.html:
--   1. Spalte avatar_id auf profiles (Default = 'default' = Ei)
--   2. View user_session erweitert um avatar_id, school_name, cluster_name
--   3. RPC update_avatar_id() — schreibt nur eigenes Profil, Basic-Sanity
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- profiles.avatar_id
-- ─────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists avatar_id text not null default 'default';

comment on column profiles.avatar_id is
  'ID des gewählten Profilbilds (siehe avatars.js im Frontend). Default = Ei-Bild.';


-- ─────────────────────────────────────────────────────────────
-- View user_session — jetzt mit avatar_id + Schule + Kurs
-- ─────────────────────────────────────────────────────────────
-- CREATE OR REPLACE VIEW kann Spalten NUR am Ende anhängen. Wir
-- droppen+recreaten, damit die Reihenfolge sauber bleibt.
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
  s.name  as school_name,
  c.name  as cluster_name,
  coalesce(c.season, 0) as season
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;

comment on view user_session is
  'Effektive Session inkl. Klartext-Namen für Schule/Kurs und avatar_id fürs Profilbild.';

-- security_invoker war auf der alten View gesetzt (0002_rls.sql). Nach dem
-- DROP wurde das entfernt — hier wieder aktivieren, sonst läuft die View
-- mit Owner-Rechten und würde RLS von profiles/clusters umgehen.
alter view user_session set (security_invoker = true);

grant select on user_session to authenticated;
grant select on user_session to service_role;


-- ─────────────────────────────────────────────────────────────
-- update_avatar_id(new_id) -> jsonb
-- ─────────────────────────────────────────────────────────────
-- Setzt profiles.avatar_id des aktuellen Users.
-- Keine Whitelist-Prüfung: bei ~100 IDs wäre die Wartung teuer,
-- Impact eines ungültigen Werts = nur eigenes kaputtes Bild.
-- Sanity: max 64 Zeichen, keine Steuerzeichen.
create or replace function update_avatar_id(p_new_id text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_trimmed text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_trimmed := btrim(p_new_id);

  if length(v_trimmed) < 1 or length(v_trimmed) > 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid_length');
  end if;

  if v_trimmed ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'error', 'invalid_chars');
  end if;

  update profiles set avatar_id = v_trimmed where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  return jsonb_build_object('ok', true, 'avatar_id', v_trimmed);
end;
$$;

revoke all on function update_avatar_id(text) from public;
grant execute on function update_avatar_id(text) to authenticated;
