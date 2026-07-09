-- ══════════════════════════════════════════════════════════════
-- Migration 0020 — Cluster-Starthilfe (Bonus pro Kurs)
-- ══════════════════════════════════════════════════════════════
-- Admin kann pro Cluster eine "Starthilfe" konfigurieren:
--   - Startcoins (landen in shop_state.bankedCoins)
--   - Freischaltung aller Spiele bestimmter Seasons (ohne Passwort)
--   - Ein zufälliges Baby-Monster (Rarity: 85 N / 10 R / 5 E / 0 L)
--     pro freigeschaltetem Spiel, ohne bestehende Kreaturen zu
--     überschreiben.
--
-- Bonus wird ausgeschüttet:
--   - beim Signup, wenn User einem Cluster mit aktivem Bonus zugeordnet wird
--   - beim manuellen Zuordnen eines bestehenden Users durch Admin
--
-- Grants sind pro (user, cluster) idempotent — mehrfach aufrufen
-- schadet nicht, ein Cluster-Wechsel A→B gibt beide Boni additiv.
-- Deaktivieren des Bonus wirkt nur für künftige Ausschüttungen;
-- bereits Ausgeschüttetes bleibt beim User.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- cluster_bonus
-- ─────────────────────────────────────────────────────────────
create table cluster_bonus (
  cluster_id     uuid primary key references clusters(id) on delete cascade,
  active         boolean not null default true,
  startup_coins  int     not null default 0 check (startup_coins between 0 and 10000),
  seasons        int[]   not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table  cluster_bonus              is 'Starthilfe-Konfiguration pro Cluster. Row existiert nur wenn konfiguriert.';
comment on column cluster_bonus.active       is 'Ausgeschaltet = keine neuen Grants. Bestehende Grants bleiben unberührt.';
comment on column cluster_bonus.seasons      is 'Für welche Seasons Spiele freigeschaltet + Baby-Monster vergeben werden (z. B. {1,2}).';


-- ─────────────────────────────────────────────────────────────
-- cluster_bonus_grants
-- ─────────────────────────────────────────────────────────────
-- Trackt, welcher User in welchem Cluster den Bonus erhalten hat.
-- Verhindert doppelte Ausschüttung, erlaubt aber additive Boni
-- bei Cluster-Wechsel (jeder (user,cluster)-Paar ist eigener Grant).
create table cluster_bonus_grants (
  user_id     uuid not null references auth.users(id) on delete cascade,
  cluster_id  uuid not null references clusters(id)   on delete cascade,
  granted_at  timestamptz not null default now(),
  primary key (user_id, cluster_id)
);

create index cluster_bonus_grants_user_idx on cluster_bonus_grants(user_id);


-- ─────────────────────────────────────────────────────────────
-- RLS für cluster_bonus
-- ─────────────────────────────────────────────────────────────
alter table cluster_bonus enable row level security;

-- Admins: volle Sicht + Write auf Bonus-Konfig.
create policy cluster_bonus_admin_all on cluster_bonus
  for all
  using ( exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin) )
  with check ( exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin) );

grant select, insert, update, delete on cluster_bonus to authenticated;


-- ─────────────────────────────────────────────────────────────
-- RLS für cluster_bonus_grants
-- ─────────────────────────────────────────────────────────────
alter table cluster_bonus_grants enable row level security;

-- User darf eigene Grants lesen (informativ, z.B. für "hast du Bonus X?"-Check).
create policy cbg_select_own on cluster_bonus_grants
  for select using (user_id = auth.uid());

-- Admins dürfen alle sehen.
create policy cbg_admin_select_all on cluster_bonus_grants
  for select using ( exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin) );

-- KEIN direktes Insert — nur über apply_cluster_bonus() (SECURITY DEFINER).

grant select on cluster_bonus_grants to authenticated;


-- ─────────────────────────────────────────────────────────────
-- random_baby_from_season(p_season int) → text
-- ─────────────────────────────────────────────────────────────
-- Würfelt ein Baby-Monster für die gegebene Season:
--   85% Normal, 10% Rare, 5% Epic, 0% Legendary.
-- Legendäre bleiben Egg-/Easter-Egg-exklusiv.
-- Pools spiegeln creatures.js:419-437.
create or replace function random_baby_from_season(p_season int)
  returns text
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_roll   float := random();
  v_normals text[];
  v_rares   text[];
  v_epics   text[];
  v_pool    text[];
begin
  if p_season = 1 then
    v_normals := array['snail','fish','chicken','salamander','falkeneule','triceratops','dragon'];
    v_rares   := array['biene','oktopus'];
    v_epics   := array['snaildragon','butterfly','turtle'];
  elsif p_season = 2 then
    v_normals := array['frosch','pinguin','raptor'];
    v_rares   := array['ente'];
    v_epics   := array['chamaeleon'];
  else
    -- Season 3+ nicht implementiert → fällt auf Season-1-Normals zurück.
    v_normals := array['snail','fish','chicken','salamander','falkeneule','triceratops','dragon'];
    v_rares   := array['biene','oktopus'];
    v_epics   := array['snaildragon','butterfly','turtle'];
  end if;

  if v_roll < 0.85 then
    v_pool := v_normals;
  elsif v_roll < 0.95 then
    v_pool := v_rares;
  else
    v_pool := v_epics;
  end if;

  return v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
end;
$$;

revoke all on function random_baby_from_season(int) from public;
grant execute on function random_baby_from_season(int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- apply_cluster_bonus(p_user_id uuid) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Wird aufgerufen bei Signup (via service_role) und bei manueller
-- Cluster-Zuweisung im Admin-Panel (via Admin-JWT).
--
-- Ablauf:
--   1) Aufrufer prüfen: service_role (auth.uid null) oder Admin.
--   2) Cluster-ID des Users laden. Kein Cluster → return.
--   3) Aktive Bonus-Row laden. Keine → return.
--   4) Bereits-Grant-Check. Ja → return skipped.
--   5) Grant eintragen (ON CONFLICT DO NOTHING, race-safe).
--   6) Für jede Season im Bonus:
--        - Alle aktiven Games der Season freischalten
--          (INSERT INTO user_unlocked_games, ON CONFLICT DO NOTHING).
--        - Baby-Monster in game_state pro Spiel setzen,
--          NUR wenn dort noch keine Kreatur existiert.
--   7) Startcoins auf shop_state.bankedCoins addieren.
--
-- Return: { ok, granted, coins_added, games_unlocked, babies_placed }
create or replace function apply_cluster_bonus(p_user_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_caller     uuid := auth.uid();
  v_is_admin   boolean;
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
begin
  -- 1) Autorisierung
  if v_caller is null then
    -- service_role-Kontext (signup.js) — erlaubt.
    null;
  else
    select is_admin into v_is_admin from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  -- 2) Cluster des Users
  select cluster_id into v_cluster_id from profiles where id = p_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_cluster');
  end if;

  -- 3) Aktiver Bonus für diesen Cluster
  select * into v_bonus
  from cluster_bonus
  where cluster_id = v_cluster_id and active = true;
  if not found then
    return jsonb_build_object('ok', true, 'skipped', 'no_active_bonus');
  end if;

  -- 4) Schon gewährt?
  if exists (select 1 from cluster_bonus_grants
             where user_id = p_user_id and cluster_id = v_cluster_id) then
    return jsonb_build_object('ok', true, 'skipped', 'already_granted');
  end if;

  -- 5) Grant eintragen. ON CONFLICT DO NOTHING schützt gegen Race,
  --    RETURNING liefert nichts wenn Konflikt → dann ebenfalls skip.
  begin
    insert into cluster_bonus_grants (user_id, cluster_id, granted_at)
    values (p_user_id, v_cluster_id, now());
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'skipped', 'race_already_granted');
  end;

  -- 6) Pro Season: Spiele freischalten + Baby-Monster verteilen
  foreach v_season in array v_bonus.seasons loop
    for v_game in
      select id from games
      where season = v_season and active = true
    loop
      -- 6a) Freischaltung (idempotent)
      insert into user_unlocked_games (user_id, game_id, unlocked_at)
      values (p_user_id, v_game.id, now())
      on conflict (user_id, game_id) do nothing;
      if found then
        v_games_unlocked := v_games_unlocked + 1;
      end if;

      -- 6b) Baby-Monster nur setzen wenn Slot leer.
      --     Bestehende Kreaturen bleiben unangetastet — nur creature IS NULL wird belegt.
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

  -- 7) Startcoins auf shop_state.bankedCoins addieren.
  --    Direktes Schreiben in user_collectibles (SECURITY DEFINER),
  --    da wir für einen anderen User arbeiten als auth.uid().
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'cluster_id', v_cluster_id,
    'coins_added', v_bonus.startup_coins,
    'games_unlocked', v_games_unlocked,
    'babies_placed', v_babies_placed,
    'seasons', v_bonus.seasons
  );
end;
$$;

revoke all on function apply_cluster_bonus(uuid) from public;
grant execute on function apply_cluster_bonus(uuid) to authenticated;
-- service_role hat implizit Ausführungsrecht auf alle Functions.


-- ─────────────────────────────────────────────────────────────
-- Updated-At-Trigger für cluster_bonus
-- ─────────────────────────────────────────────────────────────
create or replace function cluster_bonus_touch_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger cluster_bonus_updated_at
  before update on cluster_bonus
  for each row execute function cluster_bonus_touch_updated_at();
