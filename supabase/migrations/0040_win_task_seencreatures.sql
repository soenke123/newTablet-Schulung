-- ══════════════════════════════════════════════════════════════
-- Migration 0040 — Win-Task: shop_state.seenCreatures einbeziehen
-- ══════════════════════════════════════════════════════════════
-- Fix zu 0039: die alten RPCs haben nur `game_state.creature` +
-- growth als Quelle genutzt. Der Codex im Buch der Monster liest
-- aber aus `shop_state.seenCreatures` (persistiert seit 0011,
-- immer max-gemergt). Kreaturen, die z.B. in Nestern gelebt haben
-- oder deren game_state-Slot inzwischen mit einer anderen Kreatur
-- besetzt ist, erscheinen im Codex — aber nicht in unserer Cluster-
-- Aggregation. Symptom: „nur ein Bruchteil der vollendeten Monster
-- wird angezeigt".
--
-- Fix: beide Quellen vereinen (UNION ALL) und pro (user, creature)
-- die höchste Stufe nehmen. Server-Wahrheit = max(game_state-Stage,
-- seenCreatures-Stage). „Vollendet" = Stage ≥ 5.
--
-- Keine neuen Tabellen, keine DROPs — CREATE OR REPLACE überschreibt
-- die alten Function-Bodies aus 0039.
-- ══════════════════════════════════════════════════════════════


-- Helper-Function: growth (int) → stage (0..5) — dieselbe Formel wie
-- getGrowthStage() im Frontend. Wird von beiden RPCs gebraucht.
create or replace function _growth_to_stage(p_growth int)
  returns int
  language sql
  immutable
as $$
  select case
    when p_growth >= 100 then 5
    when p_growth >=  21 then 4
    when p_growth >=  12 then 3
    when p_growth >=   7 then 2
    when p_growth >=   3 then 1
    else 0
  end;
$$;
revoke all on function _growth_to_stage(int) from public;
grant execute on function _growth_to_stage(int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- get_cluster_creature_collection() — Neuauflage
-- ─────────────────────────────────────────────────────────────
-- Quellen pro (user, creature):
--   • game_state.growth (aktueller Wert für die Kreatur im Slot)
--   • user_collectibles(key='shop_state').value->'seenCreatures'
--     (Codex-Cache, max-gemergt via 0011/0013/…-Merge-Funktionen)
-- Effektive User-Stufe = max(beider Werte). Kreatur zählt als
-- „vollendet", wenn effektive Stufe ≥ 5.
--
-- Namen werden nur an ≤3 Vollender ausgeliefert (Datenschutz-Regel
-- des Features).
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
  -- Quelle 1: game_state — aktuelle Kreatur pro Slot mit growth.
  game_stages as (
    select gs.user_id,
           gs.creature,
           _growth_to_stage(gs.growth) as stage
      from game_state gs
      join peers on peers.id = gs.user_id
     where gs.creature = any(v_list)
       and coalesce(gs.growth, 0) > 0
  ),
  -- Quelle 2: shop_state.seenCreatures — Codex-Cache aus 0011/0013.
  -- Werte sind Text-Ints (jsonb_each_text). NULL/Nicht-Zahl → 0.
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


-- ─────────────────────────────────────────────────────────────
-- claim_win_reward() — Neuauflage
-- ─────────────────────────────────────────────────────────────
-- Der Cluster-Vollständigkeits-Check muss dieselben zwei Quellen
-- (game_state + shop_state.seenCreatures) berücksichtigen wie
-- get_cluster_creature_collection — sonst kann ein User den Button
-- sehen, aber der Server verweigert mit „collection_incomplete".
create or replace function claim_win_reward()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_all_max    boolean;
  v_completed  int;
  v_thresholds int[] := array[3, 7, 12, 21, 100];
  v_target     int;
  v_new_growth int;
  v_already    boolean;
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

  -- Cluster-Vollständigkeit: für JEDE der 25 Kreaturen muss mind. 1
  -- aktiver Cluster-User die Stufe 5 haben. Quellen wie oben:
  -- game_state.growth ≥ 100 ODER seenCreatures[c] ≥ 5.
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
  select bool_and(has_max) into v_all_max from per_creature;

  if not coalesce(v_all_max, false) then
    return jsonb_build_object('ok', false, 'error', 'collection_incomplete');
  end if;

  insert into user_legi_task_gifts
        (user_id, cluster_id, task_key, giver_id, sent_at, accepted_at)
  values (v_user_id, v_cluster_id, 'win', v_user_id, now(), now())
  on conflict (user_id, cluster_id, task_key) do update set
    accepted_at = coalesce(user_legi_task_gifts.accepted_at, now());

  select count(*) into v_completed
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
