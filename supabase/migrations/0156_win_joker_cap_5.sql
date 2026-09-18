-- ══════════════════════════════════════════════════════════════
-- Migration 0156 — Joker „gemeinsam gewinnen": Cap 2 → 5
-- ══════════════════════════════════════════════════════════════
-- Erhöht das Cluster-weite Kauflimit für den Win-Joker von 2 auf 5.
-- Beide Server-Funktionen werden neu erstellt — nur v_cap ändert sich,
-- der Rest bleibt identisch zu Migration 0047.
-- ══════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- 1) buy_cluster_joker — Cap 2 → 5
-- ══════════════════════════════════════════════════════════════
create or replace function buy_cluster_joker(
  p_joker_type text default 'win_gemeinsam'
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id      uuid := auth.uid();
  v_cluster_id   uuid;
  v_used         int;
  v_cap          int := 5;
  v_count_max    int;
  v_display_name text;
  v_s2 text[] := array['ente','chamaeleon','chinDrache','schnabeltier','frosch','pinguin','raptor'];
  v_s3 text[] := array['krabbe','hai','libelle','hippogreif'];
  v_list text[] := array[
    'snail','fish','chicken','salamander','falkeneule','triceratops','dragon',
    'butterfly','snaildragon','turtle','chamaeleon','robot','pfau','biene','oktopus',
    'ente','frosch','pinguin','raptor','chinDrache','schnabeltier',
    'krabbe','hai','libelle','hippogreif'
  ];
  v_total int := 25;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id, display_name
    into v_cluster_id, v_display_name
    from profiles
   where id = v_user_id and status = 'active';
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  -- Serialisierung pro Cluster (nur diese Transaktion sperrt)
  perform pg_advisory_xact_lock(
    hashtext('joker:' || v_cluster_id::text || ':' || p_joker_type)
  );

  select count(*)::int into v_used
    from cluster_joker_purchases
   where cluster_id = v_cluster_id
     and joker_type = p_joker_type;

  if v_used >= v_cap then
    return jsonb_build_object(
      'ok', false, 'error', 'cap_reached',
      'used', v_used, 'cap', v_cap
    );
  end if;

  -- Task-Not-Completed-Guard: gleiche Kollektions-Berechnung wie
  -- get_cluster_creature_collection, aber nur count(has_max).
  with peers as (
    select id from profiles
     where cluster_id = v_cluster_id and status = 'active'
  ),
  game_stages as (
    select gs.user_id, gs.creature,
           _growth_to_stage(coalesce(gs.growth, 0)) as stage
      from game_state gs
      join peers on peers.id = gs.user_id
     where gs.creature = any(v_list)
  ),
  shop_stages as (
    select uc.user_id, sc.key as creature,
           least(greatest(coalesce(nullif(sc.value, '')::int, 0), 0), 5) as stage
      from user_collectibles uc
      join peers on peers.id = uc.user_id
      cross join lateral jsonb_each_text(
        coalesce(uc.value->'seenCreatures', '{}'::jsonb)
      ) as sc(key, value)
     where uc.key = 'shop_state'
       and sc.key = any(v_list)
  ),
  per_user as (
    select user_id, creature, max(stage) as user_stage
      from (
        select user_id, creature, stage from game_stages
        union all
        select user_id, creature, stage from shop_stages
      ) u
     group by user_id, creature
  ),
  per_creature as (
    select c.creature,
           coalesce(bool_or(u.user_stage >= 5), false) as has_max
      from (select unnest(v_list) as creature) c
      left join per_user u on u.creature = c.creature
     group by c.creature
  )
  select count(*) filter (where has_max) into v_count_max
    from per_creature;

  if v_count_max >= greatest(v_total - v_used, 0) then
    return jsonb_build_object(
      'ok', false, 'error', 'task_already_solved',
      'used', v_used, 'cap', v_cap,
      'count_max', v_count_max, 'total', v_total
    );
  end if;

  insert into cluster_joker_purchases (cluster_id, user_id, joker_type)
  values (v_cluster_id, v_user_id, p_joker_type);

  return jsonb_build_object(
    'ok', true,
    'used', v_used + 1,
    'cap', v_cap,
    'buyer_display_name', v_display_name
  );
end;
$$;

revoke all on function buy_cluster_joker(text) from public;
grant execute on function buy_cluster_joker(text) to authenticated;


-- ══════════════════════════════════════════════════════════════
-- 2) get_cluster_joker_status — Cap 2 → 5
-- ══════════════════════════════════════════════════════════════
create or replace function get_cluster_joker_status()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_used       int;
  v_own        int;
  v_buyers     jsonb;
  v_cap        int := 5;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id into v_cluster_id
    from profiles where id = v_user_id and status = 'active';
  if v_cluster_id is null then
    return jsonb_build_object(
      'ok', true, 'used', 0, 'cap', v_cap,
      'own_purchases', 0, 'buyers', '[]'::jsonb
    );
  end if;

  select count(*)::int,
         count(*) filter (where user_id = v_user_id)::int
    into v_used, v_own
    from cluster_joker_purchases
   where cluster_id = v_cluster_id
     and joker_type = 'win_gemeinsam';

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id',      cjp.user_id,
           'display_name', coalesce(p.display_name, '?'),
           'purchased_at', cjp.purchased_at
         ) order by cjp.purchased_at), '[]'::jsonb)
    into v_buyers
    from cluster_joker_purchases cjp
    left join profiles p on p.id = cjp.user_id
   where cjp.cluster_id = v_cluster_id
     and cjp.joker_type = 'win_gemeinsam';

  return jsonb_build_object(
    'ok', true,
    'used', v_used,
    'cap', v_cap,
    'own_purchases', v_own,
    'buyers', v_buyers
  );
end;
$$;

revoke all on function get_cluster_joker_status() from public;
grant execute on function get_cluster_joker_status() to authenticated;
