-- ══════════════════════════════════════════════════════════════
-- Migration 0041 — Win-Task: expliziter has_seen-Boolean
-- ══════════════════════════════════════════════════════════════
-- Fix zu 0040: der Client rendert einen Slot als `?` (unbekannt),
-- solange `max_stage <= 0`. Das war falsch für Kreaturen, die zwar
-- irgendwo im Cluster in `seenCreatures[c] = 0` markiert wurden
-- (z.B. via Nest-Slot, ohne dass sie je Wachstum >= 3 erreicht
-- haben) — der Detail-View zeigt dann eine Winzig-Sprite, während
-- der Slot ein Fragezeichen bleibt.
--
-- Fix: pro Kreatur liefert die RPC jetzt zusätzlich ein `has_seen`
-- (true, sobald irgendein aktiver Cluster-User die Kreatur entweder
-- in `game_state` hat oder in `shop_state.seenCreatures` als Key
-- führt). Der Client filtert auf `has_seen` statt auf `max_stage`.
--
-- Zusätzlich: der bisher pauschale `growth > 0`-Filter im
-- game_stages-CTE fliegt raus. game_state-Rows mit growth=0 waren
-- zwar wenig aussagekräftig, hätten aber has_seen sauber getriggert.
-- ══════════════════════════════════════════════════════════════


create or replace function get_cluster_creature_collection()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_creatures  jsonb;
  v_all_max    boolean;
  v_claimed    boolean;
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
    bool_and(pc.has_max)
    into v_creatures, v_all_max
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
    'has_all_creatures',  coalesce(v_all_max, false),
    'already_claimed',    v_claimed,
    'total',              array_length(v_list, 1)
  );
end;
$$;

revoke all on function get_cluster_creature_collection() from public;
grant execute on function get_cluster_creature_collection() to authenticated;
