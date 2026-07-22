-- ══════════════════════════════════════════════════════════════
-- Migration 0053 — Multi-School + Admin-Neuaufteilung
-- ══════════════════════════════════════════════════════════════
-- Zwei Änderungen in einer Migration, weil sie sich gegenseitig
-- bedingen:
--
--   1) Admin-Rollen: `is_admin` (Schuladmin) und neu `is_superadmin`
--      (Volladmin). Volladmin ist ein Superset — für ihn ist auch
--      `is_admin=true`, damit bestehende is_admin-Checks weiter
--      funktionieren. Alle Spiel-/Coin-/Team-Logik schließt beide
--      Admin-Typen aus (unsichtbare Beobachter).
--
--   2) Multi-School wird aktiv genutzt. Neue Schule „Hogwarts" wird
--      angelegt, alle bestehenden Nicht-Admin-User + alle Cluster
--      wandern nach Hogwarts (Testschule). MPS bleibt strukturell
--      erhalten und wird für echte Schüler frisch bespielt.
--
-- Sönke (bisher einziger Admin) wird zum Volladmin.
--
-- Regeln:
--   * `is_admin` bleibt allgemeiner Admin-Check (deckt beide Rollen).
--   * `is_superadmin` prüft explizit auf Volladmin.
--   * `is_any_admin` = is_admin OR is_superadmin. Semantisch identisch
--     zu is_admin (weil Volladmin auch is_admin=true hat), aber
--     explizit lesbar in Filtern.
--   * Schuladmin darf nur User seiner Schule verwalten (RLS).
--   * Volladmin darf alles inkl. Schulen anlegen + Admins zwischen
--     Schulen verschieben.
--   * Admins tauchen nicht in Ranglisten auf, kriegen keinen
--     Cluster-Bonus, ihre Bonbons zählen nicht im Cluster-Pool,
--     sie bekommen keinen Legi-Grant per Cluster-Meilenstein.
--
-- Idempotent, ohne DROP-Statements (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Schema — is_superadmin-Spalte
-- ─────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists is_superadmin boolean not null default false;

comment on column profiles.is_superadmin is
  'Volladmin: darf alle Schulen verwalten, neue Schulen anlegen, Admins zwischen Schulen verschieben. Implizit gilt: wenn is_superadmin, dann auch is_admin.';

create index if not exists profiles_is_superadmin_idx
  on profiles(is_superadmin) where is_superadmin = true;


-- ─────────────────────────────────────────────────────────────
-- 2) Helper-Funktionen — is_superadmin() + is_any_admin() + my_school_id()
-- ─────────────────────────────────────────────────────────────
create or replace function is_superadmin() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_superadmin from profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function is_superadmin() from public;
grant execute on function is_superadmin() to anon, authenticated;

create or replace function is_any_admin() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_admin or p.is_superadmin from profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function is_any_admin() from public;
grant execute on function is_any_admin() to anon, authenticated;

create or replace function my_school_id() returns uuid
  security definer
  stable
  set search_path = public
  language sql
as $$
  select p.school_id from profiles p where p.id = auth.uid();
$$;

revoke all on function my_school_id() from public;
grant execute on function my_school_id() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) user_session-View um is_superadmin ergänzen
-- ─────────────────────────────────────────────────────────────
-- WICHTIG: create-or-replace-view lässt keine Umordnung/Weglassen zu
-- ("cannot drop columns from view"). Alle Spalten aus Migration 0015
-- beibehalten, is_superadmin ans Ende anhängen.
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
  p.last_login_at,
  p.is_superadmin
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;

alter view user_session set (security_invoker = true);

grant select on user_session to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) RLS-Anpassungen — Schul-Scope für Schuladmins, Volladmin-only für Schulen
-- ─────────────────────────────────────────────────────────────
-- schools: Schulen-Schreiben nur für Volladmin
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'schools'
      and policyname = 'schools_admin_write'
  ) then
    execute 'alter policy schools_admin_write on schools using (is_superadmin()) with check (is_superadmin())';
  else
    execute 'create policy schools_admin_write on schools for all using (is_superadmin()) with check (is_superadmin())';
  end if;
end$$;


-- clusters: Schuladmin nur eigene Schule, Volladmin alle
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clusters'
      and policyname = 'clusters_select_own_school'
  ) then
    execute $POL$alter policy clusters_select_own_school on clusters using (
      is_superadmin()
      or (is_admin() and school_id = my_school_id())
      or school_id = my_school_id()
    )$POL$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clusters'
      and policyname = 'clusters_admin_write'
  ) then
    execute $POL$alter policy clusters_admin_write on clusters using (
      is_superadmin()
      or (is_admin() and school_id = my_school_id())
    ) with check (
      is_superadmin()
      or (is_admin() and school_id = my_school_id())
    )$POL$;
  end if;
end$$;


-- profiles: Schuladmin sieht/aktualisiert nur User eigener Schule.
-- Zusätzlich Guard: is_superadmin darf ein Schuladmin nicht setzen,
-- und school_id darf ein Schuladmin nicht ändern.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    execute $POL$alter policy profiles_select_own on profiles using (
      id = auth.uid()
      or is_superadmin()
      or (is_admin() and school_id = my_school_id())
    )$POL$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_admin_update'
  ) then
    execute $POL$alter policy profiles_admin_update on profiles using (
      is_superadmin()
      or (is_admin() and school_id = my_school_id())
    ) with check (
      is_superadmin()
      or (
        is_admin()
        and school_id = my_school_id()
        and is_superadmin = false
      )
    )$POL$;
  end if;
end$$;


-- games: nur Volladmin (Games sind global)
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'games'
      and policyname = 'games_admin_write'
  ) then
    execute 'alter policy games_admin_write on games using (is_superadmin()) with check (is_superadmin())';
  end if;
end$$;


-- ─────────────────────────────────────────────────────────────
-- 5) RPC-Rewrites — Admin-Ausschluss aus Spiellogik
-- ─────────────────────────────────────────────────────────────

-- 5a) get_game_leaderboard — Admins aus Ranking filtern (Basis: 0022)
create or replace function get_game_leaderboard(p_game_id text, p_scope text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_session record;
  v_game    record;
  v_top     jsonb;
  v_self    jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_scope not in ('cluster', 'school') then
    return jsonb_build_object('ok', false, 'error', 'invalid_scope');
  end if;

  select id, school_id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  select id, season, active into v_game from games where id = p_game_id;
  if not found or not v_game.active then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  if v_game.season > v_session.season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  if p_scope = 'cluster' and v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'top', '[]'::jsonb, 'self', null);
  end if;

  with ranked as (
    select
      h.user_id,
      p.display_name,
      p.avatar_id,
      h.best_score,
      h.updated_at,
      row_number() over (order by h.best_score desc, h.updated_at asc) as rnk
    from game_highscores h
    join profiles p on p.id = h.user_id
    where h.game_id = p_game_id
      and p.status = 'active'
      and coalesce(p.is_admin, false) = false
      and coalesce(p.is_superadmin, false) = false
      and (
        (p_scope = 'cluster' and p.cluster_id = v_session.cluster_id)
        or (p_scope = 'school' and p.school_id = v_session.school_id)
      )
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'rank',         rnk,
                 'display_name', display_name,
                 'avatar_id',    avatar_id,
                 'best_score',   best_score,
                 'is_self',      (user_id = v_user_id)
               ) order by rnk
             )
      from ranked
      where rnk <= 10
    ), '[]'::jsonb),
    (
      select jsonb_build_object(
               'rank',         rnk,
               'display_name', display_name,
               'avatar_id',    avatar_id,
               'best_score',   best_score,
               'is_self',      true
             )
      from ranked
      where user_id = v_user_id
    )
  into v_top, v_self;

  return jsonb_build_object('ok', true, 'top', v_top, 'self', v_self);
end;
$$;

revoke all on function get_game_leaderboard(text, text) from public;
grant execute on function get_game_leaderboard(text, text) to authenticated;


-- 5b) get_hub_leaderboard — Admins aus Ranking filtern (Basis: 0043)
create or replace function get_hub_leaderboard(p_metric text, p_scope text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_session record;
  v_top     jsonb;
  v_self    jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_metric not in ('coins', 'creatures', 'legendaries', 'bonbons') then
    return jsonb_build_object('ok', false, 'error', 'invalid_metric');
  end if;
  if p_scope not in ('cluster', 'school') then
    return jsonb_build_object('ok', false, 'error', 'invalid_scope');
  end if;

  select id, school_id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if p_scope = 'cluster' and v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'top', '[]'::jsonb, 'self', null);
  end if;

  with scoped as (
    select
      p.id           as user_id,
      p.display_name,
      p.avatar_id,
      coalesce(c.season, 0) as season,
      coalesce(w.coins, 0)               as wallet_coins,
      coalesce(w.bonus_coins_granted, 0) as bonus_coins,
      coalesce(w.bonbons, 0)             as wallet_bonbons,
      uc.value       as shop
    from profiles p
    left join clusters c            on c.id = p.cluster_id
    left join wallets  w            on w.user_id = p.id
    left join user_collectibles uc  on uc.user_id = p.id and uc.key = 'shop_state'
    where p.status = 'active'
      and coalesce(p.is_admin, false) = false
      and coalesce(p.is_superadmin, false) = false
      and (
        (p_scope = 'cluster' and p.cluster_id = v_session.cluster_id)
        or (p_scope = 'school' and p.school_id = v_session.school_id)
      )
  ),
  scored as (
    select
      user_id,
      display_name,
      avatar_id,
      case p_metric
        when 'coins' then greatest(
          0,
          wallet_coins
          + coalesce((
              select sum(coalesce((n->'hatched'->>'coins')::int, 0))::int
              from jsonb_array_elements(coalesce(shop->'nests', '[]'::jsonb)) n
            ), 0)
          + coalesce((shop->>'bankedCoins')::int, 0)
          - bonus_coins
        )
        when 'bonbons' then wallet_bonbons
        when 'creatures'   then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb))
        )
        when 'legendaries' then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb)) as t(k, v)
          where k in ('robot', 'pfau', 'chinDrache', 'schnabeltier', 'einhornkatze')
        )
      end as primary_score,
      case p_metric
        when 'coins'       then 0
        when 'bonbons'     then 0
        when 'creatures'   then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb)) as t(k, v)
          where (v::int) >= case when season >= 2 then 5 else 4 end
        )
        when 'legendaries' then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb)) as t(k, v)
          where k in ('robot', 'pfau', 'chinDrache', 'schnabeltier', 'einhornkatze')
            and (v::int) >= case when season >= 2 then 5 else 4 end
        )
      end as secondary_score
    from scoped
  ),
  ranked as (
    select
      user_id,
      display_name,
      avatar_id,
      primary_score,
      secondary_score,
      row_number() over (order by primary_score desc, secondary_score desc, display_name asc) as rnk
    from scored
    where primary_score > 0 or user_id = v_user_id
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'rank',            rnk,
                 'display_name',    display_name,
                 'avatar_id',       avatar_id,
                 'primary_score',   primary_score,
                 'secondary_score', secondary_score,
                 'is_self',         (user_id = v_user_id)
               ) order by rnk
             )
      from ranked
      where rnk <= 10
    ), '[]'::jsonb),
    (
      select jsonb_build_object(
               'rank',            rnk,
               'display_name',    display_name,
               'avatar_id',       avatar_id,
               'primary_score',   primary_score,
               'secondary_score', secondary_score,
               'is_self',         true
             )
      from ranked
      where user_id = v_user_id
    )
  into v_top, v_self;

  return jsonb_build_object('ok', true, 'top', v_top, 'self', v_self);
end;
$$;

revoke all on function get_hub_leaderboard(text, text) from public;
grant execute on function get_hub_leaderboard(text, text) to authenticated;


-- 5c) apply_cluster_bonus — Admins bekommen keinen Bonus (Basis: 0048)
create or replace function apply_cluster_bonus(p_user_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_caller     uuid := auth.uid();
  v_is_admin   boolean;
  v_target     record;
  v_cluster_id uuid;
  v_bonus      record;
  v_season     int;
  v_game       record;
  v_baby       text;
  v_games_unlocked int := 0;
  v_babies_placed  int := 0;
  v_existing_creature text;
  v_current_shop  jsonb;
  v_current_coins int;
  v_legi_granted  boolean := false;
begin
  if v_caller is not null then
    select is_admin or is_superadmin into v_is_admin
      from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  -- GUARD 0053: Admin/Superadmin bekommt keinen Cluster-Bonus.
  -- Er darf einem Cluster zugewiesen sein, um zu beobachten, aber
  -- kriegt weder Startcoins noch Baby-Monster.
  select cluster_id, is_admin, is_superadmin into v_target
    from profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  if coalesce(v_target.is_admin, false) or coalesce(v_target.is_superadmin, false) then
    return jsonb_build_object('ok', true, 'skipped', 'target_is_admin');
  end if;

  v_cluster_id := v_target.cluster_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_cluster');
  end if;

  v_legi_granted := ensure_legi_grant(p_user_id, v_cluster_id);

  select * into v_bonus
  from cluster_bonus
  where cluster_id = v_cluster_id and active = true;
  if not found then
    return jsonb_build_object(
      'ok', true, 'skipped', 'no_active_bonus',
      'legi_granted', v_legi_granted
    );
  end if;

  if exists (select 1 from cluster_bonus_grants
             where user_id = p_user_id and cluster_id = v_cluster_id) then
    return jsonb_build_object(
      'ok', true, 'skipped', 'already_granted',
      'legi_granted', v_legi_granted
    );
  end if;

  begin
    insert into cluster_bonus_grants (user_id, cluster_id, granted_at)
    values (p_user_id, v_cluster_id, now());
  exception when unique_violation then
    return jsonb_build_object(
      'ok', true, 'skipped', 'race_already_granted',
      'legi_granted', v_legi_granted
    );
  end;

  foreach v_season in array v_bonus.seasons loop
    for v_game in
      select id from games
      where season = v_season and active = true
    loop
      insert into user_unlocked_games (user_id, game_id, unlocked_at)
      values (p_user_id, v_game.id, now())
      on conflict (user_id, game_id) do nothing;
      if found then
        v_games_unlocked := v_games_unlocked + 1;
      end if;

      -- game16 (Einhornkatze/Legi-Trainer) NICHT mit Zufalls-Baby
      -- befüllen (Regel aus Migration 0048).
      if v_game.id = 'game16' then
        continue;
      end if;

      select creature into v_existing_creature
      from game_state where user_id = p_user_id and game_id = v_game.id;

      if v_existing_creature is null then
        v_baby := random_baby_from_season(v_season);
        insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
        values (p_user_id, v_game.id, 0, 0, v_baby, 0, 0, now())
        on conflict (user_id, game_id) do update set
          creature   = coalesce(game_state.creature, excluded.creature),
          updated_at = now();
        v_babies_placed := v_babies_placed + 1;
      end if;
    end loop;
  end loop;

  if v_bonus.startup_coins > 0 then
    select value into v_current_shop
    from user_collectibles
    where user_id = p_user_id and key = 'shop_state';

    v_current_coins := coalesce((v_current_shop->>'bankedCoins')::int, 0);

    insert into user_collectibles (user_id, key, value, updated_at)
    values (
      p_user_id,
      'shop_state',
      jsonb_set(
        coalesce(v_current_shop, '{}'::jsonb),
        '{bankedCoins}',
        to_jsonb(v_current_coins + v_bonus.startup_coins)
      ),
      now()
    )
    on conflict (user_id, key) do update set
      value      = jsonb_set(
                     coalesce(user_collectibles.value, '{}'::jsonb),
                     '{bankedCoins}',
                     to_jsonb(coalesce((user_collectibles.value->>'bankedCoins')::int, 0) + v_bonus.startup_coins)
                   ),
      updated_at = now();

    insert into wallets (user_id, coins, bonus_coins_granted, updated_at)
    values (p_user_id, 0, v_bonus.startup_coins, now())
    on conflict (user_id) do update set
      bonus_coins_granted = wallets.bonus_coins_granted + v_bonus.startup_coins,
      updated_at          = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'cluster_id', v_cluster_id,
    'coins_added', v_bonus.startup_coins,
    'games_unlocked', v_games_unlocked,
    'babies_placed', v_babies_placed,
    'seasons', v_bonus.seasons,
    'legi_granted', v_legi_granted
  );
end;
$$;

revoke all on function apply_cluster_bonus(uuid) from public;
grant execute on function apply_cluster_bonus(uuid) to authenticated;
grant execute on function apply_cluster_bonus(uuid) to service_role;


-- 5d) add_bonbons — Admins können keine Bonbons einbringen (Basis: 0046)
create or replace function add_bonbons(p_amount int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session    record;
  v_new_total  int;
  v_unlock_res jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 500 then
    return jsonb_build_object('ok', false, 'error', 'amount_out_of_range');
  end if;

  select id, cluster_id, season, status, is_admin, is_superadmin
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  -- GUARD 0053: Admins/Volladmins tragen nicht zum Cluster-Pool bei.
  if coalesce(v_session.is_admin, false) or coalesce(v_session.is_superadmin, false) then
    return jsonb_build_object('ok', true, 'skipped', 'admin_user');
  end if;

  if v_session.season < 3 then
    return jsonb_build_object('ok', true, 'skipped', 'season_below_3');
  end if;

  -- Guard cluster-scoped (aus 0046).
  if v_session.cluster_id is not null and exists (
    select 1 from user_legi_grants
    where user_id = v_user_id and cluster_id = v_session.cluster_id
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'legi_already_unlocked');
  end if;

  insert into wallets (user_id, coins, bonbons, updated_at)
  values (v_user_id, 0, p_amount, now())
  on conflict (user_id) do update set
    bonbons    = wallets.bonbons + p_amount,
    updated_at = now()
  returning bonbons into v_new_total;

  if v_session.cluster_id is not null then
    v_unlock_res := check_and_grant_cluster_legi(v_session.cluster_id);
  else
    v_unlock_res := jsonb_build_object('skipped', 'no_cluster');
  end if;

  return jsonb_build_object(
    'ok', true,
    'bonbons', v_new_total,
    'cluster', v_unlock_res
  );
end;
$$;

revoke all on function add_bonbons(int) from public;
grant execute on function add_bonbons(int) to authenticated;


-- 5e) check_and_grant_cluster_legi — Admins zählen nicht mit + kriegen keinen Grant (Basis: 0032)
create or replace function check_and_grant_cluster_legi(p_cluster_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_cluster   record;
  v_collected int;
  v_grants_added int := 0;
begin
  select id, season, bonbon_target, bonbons_unlocked_at
    into v_cluster
  from clusters where id = p_cluster_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cluster_not_found');
  end if;
  if v_cluster.season < 3 or v_cluster.bonbon_target is null then
    return jsonb_build_object('ok', true, 'skipped', 'not_s3');
  end if;

  -- GUARD 0053: Admin-Wallets fließen NICHT in Cluster-Summe ein.
  select coalesce(sum(w.bonbons), 0)::int into v_collected
  from profiles p
  left join wallets w on w.user_id = p.id
  where p.cluster_id = p_cluster_id
    and p.status = 'active'
    and coalesce(p.is_admin, false) = false
    and coalesce(p.is_superadmin, false) = false;

  if v_collected < v_cluster.bonbon_target then
    return jsonb_build_object(
      'ok', true, 'unlocked', false,
      'collected', v_collected, 'target', v_cluster.bonbon_target
    );
  end if;

  if v_cluster.bonbons_unlocked_at is null then
    update clusters set bonbons_unlocked_at = now() where id = p_cluster_id;
  end if;

  -- GUARD 0053: Admins bekommen keinen Legi-Grant.
  insert into user_legi_grants (user_id, cluster_id, granted_at)
  select p.id, p_cluster_id, now()
  from profiles p
  where p.cluster_id = p_cluster_id
    and p.status = 'active'
    and coalesce(p.is_admin, false) = false
    and coalesce(p.is_superadmin, false) = false
  on conflict (user_id, cluster_id) do nothing;
  get diagnostics v_grants_added = row_count;

  return jsonb_build_object(
    'ok', true, 'unlocked', true,
    'collected', v_collected, 'target', v_cluster.bonbon_target,
    'grants_added', v_grants_added
  );
end;
$$;

revoke all on function check_and_grant_cluster_legi(uuid) from public;
grant execute on function check_and_grant_cluster_legi(uuid) to authenticated;
grant execute on function check_and_grant_cluster_legi(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 6) Bootstrap — Hogwarts anlegen, User + Cluster nach Hogwarts,
--    Sönke zum Volladmin
-- ─────────────────────────────────────────────────────────────
-- Hogwarts als neue Testschule
insert into schools (slug, name, active)
values ('hogwarts', 'Hogwarts', true)
on conflict (slug) do nothing;

-- Alle Nicht-Admin-User nach Hogwarts umziehen.
-- Admin-Accounts bleiben in ihrer Schule (bei MPS), damit Sönke
-- als Volladmin die MPS-Struktur behält, wenn er sie mal betritt.
update profiles
   set school_id = (select id from schools where slug = 'hogwarts')
 where coalesce(is_admin, false) = false
   and coalesce(is_superadmin, false) = false;

-- Alle bestehenden Cluster wandern mit — sonst wären die User in
-- Hogwarts, aber die Cluster in MPS.
update clusters
   set school_id = (select id from schools where slug = 'hogwarts');

-- Sönke: alle aktuellen Admins werden zu Volladmins. Aktuell gibt
-- es genau einen (Sönke). Falls die Migration jemals in einer
-- Umgebung mit mehreren Admins läuft: bewusst — sonst hätte niemand
-- mehr Zugriff aufs Admin-Panel nach der Umstellung.
update profiles
   set is_superadmin = true
 where is_admin = true;
