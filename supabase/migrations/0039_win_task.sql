-- ══════════════════════════════════════════════════════════════
-- Migration 0039 — Legi-Task „Gemeinsam siegen"
-- ══════════════════════════════════════════════════════════════
-- Dritte Wachstums-Aufgabe der Einhornkatze (game16). Der gesamte
-- Cluster muss jede der 25 non-Legi-Kreaturen (S1+S2+S3, ohne
-- einhornkatze selbst) mindestens einmal auf Stufe 5 „Vollendet"
-- (growth >= 100) haben. Ist die Sammlung komplett, kann jeder
-- aktive Cluster-User seine eigene Einhornkatze via claim_win_reward
-- die nächste Wachstumsstufe abholen.
--
-- Design-Entscheidungen:
--   • KEIN neues Table — für „win" wird user_legi_task_gifts
--     wiederverwendet mit giver_id = user_id (self-attributed),
--     analog zu friends_room_complete (0037). Der bestehende
--     check-Constraint auf task_key erlaubt bereits 'win'. Damit
--     zählt die Growth-Formel `count(*) filter accepted_at not null`
--     alle 3 Tasks konsistent, und das bestehende get_my_gift_tasks
--     liefert automatisch auch den win-Status → renderLegiTaskBadge
--     funktioniert ohne Änderung.
--   • claim_win_reward ist idempotent: PK-Konflikt fängt Doppel-
--     Claims; greatest(growth, target) verhindert Downgrade.
--   • Kreatur-Aggregation läuft SECURITY DEFINER + Cluster-Filter
--     analog zu list_gift_candidates (0036) und friends_room_snapshot
--     (0037). Namen werden nur an ≤3 „Vollender" ausgeliefert.
--   • Kein DROP — Idempotenz per CREATE OR REPLACE bei Functions.
--     (Memory feedback_supabase_no_drop_statements.md).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) get_cluster_creature_collection() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Aggregiert für jede der 25 non-Legi-Kreaturen:
--   • max_stage: höchste im Cluster erreichte Wachstumsstufe (0..5)
--   • has_max:   bool_or(growth >= 100) — mind. 1 User „Vollendet"
--   • holder_count: Anzahl User im Cluster mit growth >= 100
--   • holders: Namen der Vollender, aber NUR wenn holder_count <= 3
--              (Datenschutz-Regel des Features)
--   • season: Season-Zuordnung (1|2|3) — Client-Tab-Filter
-- Zusätzlich:
--   • has_all_creatures: bool_and(has_max) — Freischalt-Bedingung
--   • already_claimed:   Aufrufer hat win-Row mit accepted_at
--
-- Wahrheitsquelle ist game_state.growth (nicht der Client-Cache
-- shop_state.seenCreatures). Ein User „hat" eine Kreatur, wenn
-- irgendein game_state-Eintrag (game_id, creature) mit growth >= 100
-- existiert — Codex-agnostisch, deckt auch Mehrfach-Slots ab.
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
  -- 25 non-Legi-Kreaturen aus CREATURE_ORDER (script.js Z. 84)
  -- ohne 'einhornkatze'. Season-Zuordnung: S2_CREATURES + S3_CREATURES
  -- aus script.js Z. 85-86; alles andere ist S1.
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

  -- Pro Kreatur aus v_list: cluster-weite Aggregation über game_state.
  -- LEFT JOIN, damit auch Kreaturen ohne einen Träger im Cluster als
  -- Row mit max_stage=0/has_max=false erscheinen.
  with peers as (
    select id from profiles
     where cluster_id = v_cluster_id and status = 'active'
  ),
  per_user as (
    select gs.creature, gs.user_id, max(gs.growth) as user_growth
      from game_state gs
      join peers on peers.id = gs.user_id
     where gs.creature = any(v_list)
     group by gs.creature, gs.user_id
  ),
  per_creature as (
    select
      c.creature,
      coalesce(max(u.user_growth), 0)                as max_growth,
      coalesce(bool_or(u.user_growth >= 100), false) as has_max,
      count(*) filter (where u.user_growth >= 100)   as holder_count
    from (select unnest(v_list) as creature) c
    left join per_user u on u.creature = c.creature
    group by c.creature
  ),
  holders_agg as (
    select u.creature, jsonb_agg(p.display_name order by p.display_name) as names
      from per_user u
      join profiles p on p.id = u.user_id
     where u.user_growth >= 100
     group by u.creature
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'creature',     pc.creature,
      'season',       case when pc.creature = any(v_s3) then 3
                           when pc.creature = any(v_s2) then 2
                           else 1 end,
      'max_stage',    case when pc.max_growth >= 100 then 5
                           when pc.max_growth >=  21 then 4
                           when pc.max_growth >=  12 then 3
                           when pc.max_growth >=   7 then 2
                           when pc.max_growth >=   3 then 1
                           else 0 end,
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

  -- Aufrufer schon geclaimt? Analog zu get_my_gift_tasks-Muster.
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
-- 2) claim_win_reward() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Cluster-Vollständigkeits-Check, dann Growth-Bump für den Aufrufer.
-- Muster: friends_room_complete (0037) — self-attributed Row in
-- user_legi_task_gifts, Growth-Berechnung identisch (Threshold-Array).
--
-- Idempotenz: PK (user, cluster, task_key='win') + accepted_at-Coalesce.
-- Wenn Row bereits accepted → 'already_claimed' zurück, kein Doppel-Growth.
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

  -- Idempotenz-Check früh: schon accepted → skip.
  select accepted_at is not null into v_already
    from user_legi_task_gifts
   where user_id = v_user_id
     and cluster_id = v_cluster_id
     and task_key = 'win';
  if coalesce(v_already, false) then
    return jsonb_build_object('ok', true, 'skipped', 'already_claimed');
  end if;

  -- Cluster-Vollständigkeit: für JEDE der 25 Kreaturen muss mind. 1
  -- aktiver Cluster-User growth >= 100 haben. bool_and über die Liste.
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
      ) as has_max
    from (select unnest(v_list) as creature) c
  )
  select bool_and(has_max) into v_all_max from per_creature;

  if not coalesce(v_all_max, false) then
    return jsonb_build_object('ok', false, 'error', 'collection_incomplete');
  end if;

  -- Self-attributed win-Row. coalesce schützt vor Doppel-Growth bei
  -- Race (siehe friends_room_complete 0037 Z. 311-315).
  insert into user_legi_task_gifts
        (user_id, cluster_id, task_key, giver_id, sent_at, accepted_at)
  values (v_user_id, v_cluster_id, 'win', v_user_id, now(), now())
  on conflict (user_id, cluster_id, task_key) do update set
    accepted_at = coalesce(user_legi_task_gifts.accepted_at, now());

  -- Growth-Berechnung: identische Formel wie accept_gift (0036) und
  -- friends_room_complete (0037). Zählt alle accepted Tasks des Users
  -- cluster-übergreifend.
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
