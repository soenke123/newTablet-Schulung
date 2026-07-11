-- ══════════════════════════════════════════════════════════════
-- Migration 0029 — Coin-Rangliste vollständig (Nest+Bank) ohne Starthilfe
-- ══════════════════════════════════════════════════════════════
-- get_hub_leaderboard(metric='coins') liest aktuell nur `wallets.coins`,
-- das ist SUM(game_state.coins). Nicht enthalten sind:
--   - unreleased Nest-Coins       (shop_state.nests[].hatched.coins)
--   - released Nest-Coins & Lootbox (shop_state.bankedCoins)
-- Damit erscheint alles, was in Nestern verdient wurde, nirgends in der
-- Rangliste, obwohl es auf der Bank korrekt gezählt wird.
--
-- Umgekehrt darf die Cluster-Starthilfe NICHT ins Score-Fenster
-- fließen — sie ist geschenktes Bonusgeld, kein Verdienst. Sie liegt
-- ebenfalls in `bankedCoins`, muss also wieder abgezogen werden.
--
-- Lösung:
--   1) neue Spalte `wallets.bonus_coins_granted` — kumulierte Starthilfe.
--   2) apply_cluster_bonus bumpt diese Spalte parallel zur bankedCoins-
--      Erhöhung (unter derselben Bedingung, im selben Transaktionsblock).
--   3) Backfill für bestehende User: jeder cluster_bonus_grants-Eintrag
--      wird mit dem aktuellen startup_coins des Clusters verrechnet.
--   4) get_hub_leaderboard(metric='coins') berechnet ab jetzt:
--        wallets.coins
--        + SUM(shop.nests[].hatched.coins)
--        + shop.bankedCoins
--        − wallets.bonus_coins_granted
--
-- spentCoins wird bewusst NICHT abgezogen — die Rangliste zeigt
-- Brutto-Verdienst, nicht aktuelles Barvermögen.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Neue Spalte auf wallets
-- ─────────────────────────────────────────────────────────────
alter table wallets
  add column if not exists bonus_coins_granted int not null default 0
  check (bonus_coins_granted >= 0);

comment on column wallets.bonus_coins_granted is
  'Kumulierte Cluster-Starthilfe (Coins). Wird von get_hub_leaderboard vom '
  'Score abgezogen, damit die Rangliste nur Erspieltes zählt. Monoton wachsend.';


-- ─────────────────────────────────────────────────────────────
-- 2) Backfill für bestehende Grants
-- ─────────────────────────────────────────────────────────────
-- Für jeden User summieren wir startup_coins über alle seine Grants
-- (Cluster-Wechsel = additiver Bonus, gleiche Logik wie apply_cluster_bonus).
-- Grants ohne dazugehörige cluster_bonus-Row (Bonus nach Grant gelöscht)
-- ignorieren wir — dann bekommen wir keinen sauberen Startwert und
-- setzen die betroffenen User auf 0 (worst case: sie profitieren minimal).
with per_user as (
  select cbg.user_id,
         coalesce(sum(cb.startup_coins), 0)::int as bonus_sum
  from cluster_bonus_grants cbg
  left join cluster_bonus cb on cb.cluster_id = cbg.cluster_id
  group by cbg.user_id
)
insert into wallets (user_id, coins, bonus_coins_granted, updated_at)
select user_id, 0, bonus_sum, now()
from per_user
on conflict (user_id) do update set
  bonus_coins_granted = excluded.bonus_coins_granted,
  updated_at          = now();


-- ─────────────────────────────────────────────────────────────
-- 3) apply_cluster_bonus: bonus_coins_granted mitpflegen
-- ─────────────────────────────────────────────────────────────
-- Identisch zu 0021, nur Block 7 erweitert um wallets-Update.
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
  if v_caller is not null then
    select is_admin into v_is_admin from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  select cluster_id into v_cluster_id from profiles where id = p_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_cluster');
  end if;

  select * into v_bonus
  from cluster_bonus
  where cluster_id = v_cluster_id and active = true;
  if not found then
    return jsonb_build_object('ok', true, 'skipped', 'no_active_bonus');
  end if;

  if exists (select 1 from cluster_bonus_grants
             where user_id = p_user_id and cluster_id = v_cluster_id) then
    return jsonb_build_object('ok', true, 'skipped', 'already_granted');
  end if;

  begin
    insert into cluster_bonus_grants (user_id, cluster_id, granted_at)
    values (p_user_id, v_cluster_id, now());
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'skipped', 'race_already_granted');
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

  -- Startcoins auf shop_state.bankedCoins UND wallets.bonus_coins_granted
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

    -- Bonus-Zähler auf wallets pflegen (idempotent per grant durch cluster_bonus_grants-Guard oben).
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
    'seasons', v_bonus.seasons
  );
end;
$$;

revoke all on function apply_cluster_bonus(uuid) from public;
grant execute on function apply_cluster_bonus(uuid) to authenticated;
grant execute on function apply_cluster_bonus(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) get_hub_leaderboard: coins-Metric = wallets + nests + banked − bonus
-- ─────────────────────────────────────────────────────────────
-- Basis: Migration 0022 (avatar_id). Nur die coins-Rechnung ist neu,
-- creatures/legendaries bleiben identisch.
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

  if p_metric not in ('coins', 'creatures', 'legendaries') then
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
      uc.value       as shop
    from profiles p
    left join clusters c            on c.id = p.cluster_id
    left join wallets  w            on w.user_id = p.id
    left join user_collectibles uc  on uc.user_id = p.id and uc.key = 'shop_state'
    where p.status = 'active'
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
        when 'creatures'   then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb))
        )
        when 'legendaries' then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb)) as t(k, v)
          where k in ('robot', 'pfau', 'chinDrache', 'schnabeltier')
        )
      end as primary_score,
      case p_metric
        when 'coins'       then 0
        when 'creatures'   then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb)) as t(k, v)
          where (v::int) >= case when season >= 2 then 5 else 4 end
        )
        when 'legendaries' then (
          select count(*)::int
          from jsonb_each_text(coalesce(shop->'seenCreatures', '{}'::jsonb)) as t(k, v)
          where k in ('robot', 'pfau', 'chinDrache', 'schnabeltier')
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
