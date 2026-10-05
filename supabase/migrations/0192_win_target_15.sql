-- ══════════════════════════════════════════════════════════════
-- Migration 0192 — „Gemeinsam siegen": Ziel 15 statt alle 25 Monster
-- ══════════════════════════════════════════════════════════════
-- Bisher mussten alle 25 Monster im Kurs vollendet sein (Stufe 6).
-- Neu: 15 vollendete Monster genügen. Jeder Joker (max. 5 pro Kurs)
-- senkt das Ziel weiter um 1 → mit allen 5 Jokern reichen 10.
-- Es ist weiterhin egal, WELCHE Monster vollendet sind.
--
-- Das Raster im Client zeigt weiter alle 25 Monster (total = 25);
-- nur die Freischalt-Schwelle (total_required) ändert sich.
-- Neu erstellt werden die drei Funktionen, die die Schwelle prüfen:
--   • buy_cluster_joker              (Basis: 0156)
--   • get_cluster_creature_collection (Basis: 0047)
--   • claim_win_reward                (Basis: 0047)
-- Idempotent per CREATE OR REPLACE.
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
  v_total int := 15;  -- Ziel: 15 vollendete Monster (vorher alle 25)
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


create or replace function get_cluster_creature_collection()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id        uuid := auth.uid();
  v_cluster_id     uuid;
  v_creatures      jsonb;
  v_count_max      int;
  v_claimed        boolean;
  v_cluster_jokers int;
  v_total          int;
  v_total_required int;
  v_s2 text[] := array['ente','chamaeleon','chinDrache','schnabeltier','frosch','pinguin','raptor'];
  v_s3 text[] := array['krabbe','hai','libelle','hippogreif'];
  v_list text[] := array[
    'snail','fish','chicken','salamander','falkeneule','triceratops','dragon',
    'butterfly','snaildragon','turtle','chamaeleon','robot','pfau','biene','oktopus',
    'ente','frosch','pinguin','raptor','chinDrache','schnabeltier',
    'krabbe','hai','libelle','hippogreif'
  ];
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id into v_cluster_id
    from profiles where id = v_user_id and status = 'active';
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  v_total := array_length(v_list, 1);  -- 25 Monster im Raster

  select count(*)::int into v_cluster_jokers
    from cluster_joker_purchases
   where cluster_id = v_cluster_id
     and joker_type = 'win_gemeinsam';

  v_total_required := greatest(15 - v_cluster_jokers, 0);  -- Ziel 15, je Joker −1

  with peers as (
    select id from profiles
     where cluster_id = v_cluster_id and status = 'active'
  ),
  game_stages as (
    select gs.user_id,
           gs.creature,
           _growth_to_stage(coalesce(gs.growth, 0)) as stage
      from game_state gs
      join peers on peers.id = gs.user_id
     where gs.creature = any(v_list)
  ),
  shop_stages as (
    select uc.user_id,
           sc.key as creature,
           least(greatest(
             coalesce(nullif(sc.value, '')::int, 0), 0
           ), 5) as stage
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
    select
      c.creature,
      count(u.user_id) > 0                        as has_seen,
      coalesce(max(u.user_stage), 0)              as max_stage,
      coalesce(bool_or(u.user_stage >= 5), false) as has_max,
      count(*) filter (where u.user_stage >= 5)   as holder_count
    from (select unnest(v_list) as creature) c
    left join per_user u on u.creature = c.creature
    group by c.creature
  ),
  holders_agg as (
    select u.creature, jsonb_agg(p.display_name order by p.display_name) as names
      from per_user u
      join profiles p on p.id = u.user_id
     where u.user_stage >= 5
     group by u.creature
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'creature',     pc.creature,
      'season',       case when pc.creature = any(v_s3) then 3
                           when pc.creature = any(v_s2) then 2
                           else 1 end,
      'has_seen',     pc.has_seen,
      'max_stage',    pc.max_stage,
      'has_max',      pc.has_max,
      'holder_count', pc.holder_count,
      'holders',      case when pc.holder_count > 0 and pc.holder_count <= 3
                             then coalesce(ha.names, '[]'::jsonb)
                           else null end
    ) order by pc.creature), '[]'::jsonb),
    count(*) filter (where pc.has_max)::int
    into v_creatures, v_count_max
  from per_creature pc
  left join holders_agg ha on ha.creature = pc.creature;

  select exists (
    select 1 from user_legi_task_gifts
     where user_id = v_user_id
       and cluster_id = v_cluster_id
       and task_key = 'win'
       and accepted_at is not null
  ) into v_claimed;

  return jsonb_build_object(
    'ok',                 true,
    'creatures',          v_creatures,
    'has_all_creatures',  v_count_max >= v_total_required,
    'already_claimed',    v_claimed,
    'total',              v_total,
    'cluster_jokers',     v_cluster_jokers,
    'total_required',     v_total_required
  );
end;
$$;

revoke all on function get_cluster_creature_collection() from public;
grant execute on function get_cluster_creature_collection() to authenticated;


create or replace function claim_win_reward()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id        uuid := auth.uid();
  v_cluster_id     uuid;
  v_count_max      int;
  v_completed      int;
  v_thresholds     int[] := array[3, 7, 12, 21, 100];
  v_target         int;
  v_new_growth     int;
  v_already        boolean;
  v_cluster_jokers int;
  v_total          int := 15;  -- Ziel: 15 vollendete Monster
  v_total_required int;
  v_list text[] := array[
    'snail','fish','chicken','salamander','falkeneule','triceratops','dragon',
    'butterfly','snaildragon','turtle','chamaeleon','robot','pfau','biene','oktopus',
    'ente','frosch','pinguin','raptor','chinDrache','schnabeltier',
    'krabbe','hai','libelle','hippogreif'
  ];
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id into v_cluster_id
    from profiles where id = v_user_id and status = 'active';
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  if not exists (
    select 1 from user_legi_grants
    where user_id = v_user_id and cluster_id = v_cluster_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_grant');
  end if;

  select accepted_at is not null into v_already
    from user_legi_task_gifts
   where user_id = v_user_id
     and cluster_id = v_cluster_id
     and task_key = 'win';
  if coalesce(v_already, false) then
    return jsonb_build_object('ok', true, 'skipped', 'already_claimed');
  end if;

  select count(*)::int into v_cluster_jokers
    from cluster_joker_purchases
   where cluster_id = v_cluster_id
     and joker_type = 'win_gemeinsam';

  v_total_required := greatest(v_total - v_cluster_jokers, 0);

  with peers as (
    select id from profiles
     where cluster_id = v_cluster_id and status = 'active'
  ),
  per_creature as (
    select
      c.creature,
      exists(
        select 1 from game_state gs
         join peers on peers.id = gs.user_id
         where gs.creature = c.creature and gs.growth >= 100
        union all
        select 1 from user_collectibles uc
         join peers on peers.id = uc.user_id
         cross join lateral jsonb_each_text(
           coalesce(uc.value->'seenCreatures', '{}'::jsonb)
         ) as sc(key, value)
         where uc.key = 'shop_state'
           and sc.key = c.creature
           and coalesce(nullif(sc.value, '')::int, 0) >= 5
      ) as has_max
    from (select unnest(v_list) as creature) c
  )
  select count(*) filter (where has_max)::int
    into v_count_max
    from per_creature;

  if v_count_max < v_total_required then
    return jsonb_build_object(
      'ok', false, 'error', 'collection_incomplete',
      'count_max', v_count_max, 'total_required', v_total_required
    );
  end if;

  insert into user_legi_task_gifts
        (user_id, cluster_id, task_key, giver_id, sent_at, accepted_at)
  values (v_user_id, v_cluster_id, 'win', v_user_id, now(), now())
  on conflict (user_id, cluster_id, task_key) do update set
    accepted_at = coalesce(user_legi_task_gifts.accepted_at, now());

  -- FIX 0046: count(distinct task_key) statt count(*).
  select count(distinct task_key) into v_completed
    from user_legi_task_gifts
   where user_id = v_user_id and accepted_at is not null;

  v_target := v_thresholds[least(v_completed, array_length(v_thresholds, 1))];

  insert into game_state
        (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user_id, 'game16', 0, 0, 'einhornkatze', v_target, 0, now())
  on conflict (user_id, game_id) do update set
    creature   = coalesce(game_state.creature, 'einhornkatze'),
    growth     = greatest(game_state.growth, v_target),
    updated_at = now()
  returning growth into v_new_growth;

  return jsonb_build_object(
    'ok',              true,
    'claimed',         true,
    'new_growth',      v_new_growth,
    'completed_tasks', v_completed
  );
end;
$$;

revoke all on function claim_win_reward() from public;
grant execute on function claim_win_reward() to authenticated;
