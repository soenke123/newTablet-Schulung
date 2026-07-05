-- ══════════════════════════════════════════════════════════════
-- Migration 0002 — Row-Level-Security-Policies + GRANTs
-- ══════════════════════════════════════════════════════════════
-- Da "Automatically expose new tables" AUS ist, müssen wir für
-- jede Tabelle explizit GRANTs für anon/authenticated setzen.
-- RLS ist durch den Event-Trigger bereits auf allen Tabellen an.
--
-- Prinzip: schreiben immer nur der Besitzer / Admin. Cheat-sensible
-- Writes laufen ausschließlich über SECURITY-DEFINER-RPCs
-- (siehe 0003_rpcs.sql).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- Helper: is_admin() — vermeidet Rekursion in profiles-Policies
-- ─────────────────────────────────────────────────────────────
create or replace function is_admin() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_admin from profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- View user_session — security_invoker aktivieren
-- ─────────────────────────────────────────────────────────────
-- Ohne security_invoker läuft der View mit Owner-Rechten und
-- umgeht die RLS von profiles/clusters. Wir wollen aber, dass
-- der View die RLS des aufrufenden Users respektiert.
alter view user_session set (security_invoker = true);


-- ─────────────────────────────────────────────────────────────
-- schools
-- ─────────────────────────────────────────────────────────────
alter table schools enable row level security;

-- Alle dürfen die Schulliste lesen (für Signup-Dropdown)
create policy schools_select_public on schools
  for select using (true);

-- Schreiben nur Admins
create policy schools_admin_write on schools
  for all using (is_admin()) with check (is_admin());

grant select on schools to anon, authenticated;
grant select on schools to service_role;


-- ─────────────────────────────────────────────────────────────
-- clusters
-- ─────────────────────────────────────────────────────────────
alter table clusters enable row level security;

-- Eingeloggte sehen alle Cluster ihrer Schule
create policy clusters_select_own_school on clusters
  for select
  using (
    school_id in (select school_id from profiles where id = auth.uid())
    or is_admin()
  );

-- Schreiben nur Admins
create policy clusters_admin_write on clusters
  for all using (is_admin()) with check (is_admin());

grant select on clusters to authenticated;
grant select on clusters to service_role;


-- ─────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────
alter table profiles enable row level security;

-- Eigenes Profil lesen, Admins alle
create policy profiles_select_own on profiles
  for select using (id = auth.uid() or is_admin());

-- INSERT: nur der User selbst kann sein eigenes Profil anlegen
-- (wird typischerweise über Vercel-Function mit service_role gemacht,
-- diese Policy erlaubt aber auch direktes Anlegen falls nötig)
create policy profiles_insert_self on profiles
  for insert with check (id = auth.uid());

-- UPDATE: nur Admins. Display-Name-Änderung läuft über RPC.
create policy profiles_admin_update on profiles
  for update using (is_admin()) with check (is_admin());

grant select, insert on profiles to authenticated;
grant select, insert on profiles to service_role;


-- ─────────────────────────────────────────────────────────────
-- games
-- ─────────────────────────────────────────────────────────────
alter table games enable row level security;

-- Öffentlich lesbar (Hub-Anzeige, auch für nicht eingeloggte)
-- ABER: password_hash nicht — dafür separater View unten
create policy games_select_public on games
  for select using (active = true);

-- Schreiben nur Admins
create policy games_admin_write on games
  for all using (is_admin()) with check (is_admin());

grant select on games to anon, authenticated;

-- Öffentlicher View OHNE password_hash — den bekommt der Browser
create or replace view games_public
  with (security_invoker = true)
  as
  select id, season, folder, title, icon, requires_login, active
  from games
  where active = true;

grant select on games_public to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- user_unlocked_games
-- ─────────────────────────────────────────────────────────────
alter table user_unlocked_games enable row level security;

create policy uug_select_own on user_unlocked_games
  for select using (user_id = auth.uid());

-- INSERT nur über RPC unlock_game (SECURITY DEFINER umgeht RLS),
-- kein direkter Insert vom Browser möglich.

grant select on user_unlocked_games to authenticated;


-- ─────────────────────────────────────────────────────────────
-- game_state
-- ─────────────────────────────────────────────────────────────
alter table game_state enable row level security;

create policy gs_select_own on game_state
  for select using (user_id = auth.uid());

-- INSERT/UPDATE ausschließlich über RPC submit_game_result.
-- Kein direktes Schreiben vom Browser — genau das ist die
-- Cheat-Prävention.

grant select on game_state to authenticated;


-- ─────────────────────────────────────────────────────────────
-- wallets
-- ─────────────────────────────────────────────────────────────
alter table wallets enable row level security;

create policy wallet_select_own on wallets
  for select using (user_id = auth.uid());

-- Kein direktes Schreiben. Coins werden von submit_game_result gesetzt.

grant select on wallets to authenticated;


-- ─────────────────────────────────────────────────────────────
-- user_collectibles
-- ─────────────────────────────────────────────────────────────
alter table user_collectibles enable row level security;

create policy uc_select_own on user_collectibles
  for select using (user_id = auth.uid());

-- INSERT/UPDATE nur eigene Rows — für einfache Client-Käufe
-- (z. B. codex_bought). Coins-relevante Käufe kommen später
-- über RPC purchase_item mit Preis-Verifikation.
create policy uc_write_own on user_collectibles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on user_collectibles to authenticated;


-- ─────────────────────────────────────────────────────────────
-- migration_pending
-- ─────────────────────────────────────────────────────────────
alter table migration_pending enable row level security;

-- KEINE Policies, KEINE GRANTs für anon/authenticated.
-- Nur service_role (Vercel Function) darf lesen/schreiben.


-- ─────────────────────────────────────────────────────────────
-- user_session (View) — Grants
-- ─────────────────────────────────────────────────────────────
grant select on user_session to authenticated;
