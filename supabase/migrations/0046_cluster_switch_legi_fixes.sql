-- ══════════════════════════════════════════════════════════════
-- Migration 0046 — Cluster-Wechsel-Fixes für Team-Legi (Einhornkatze)
-- ══════════════════════════════════════════════════════════════
-- Behebt zwei zusammenhängende Bugs beim Cluster-Wechsel und macht
-- gleichzeitig Späteinsteigern die volle Feature-Teilnahme möglich.
--
-- ─── Bug A: Cross-Cluster-Count-Inflation ─────────────────────
-- accept_gift / friends_room_complete / claim_win_reward zählten
-- `count(*)` über user_legi_task_gifts ohne cluster-Filter. Bei
-- User, die dieselbe Task in mehreren Clustern erledigt haben (per
-- (user, cluster, task_key)-PK legit möglich), ergab das
-- count > 3 → v_thresholds[4|5] = 21|100 → growth-Stufe 4|5
-- obwohl im aktuellen Cluster nur 1 Task fertig ist.
--
-- Fix: count(distinct task_key). Damit ist der Zähler auf die
-- Zahl der aktuell aktiven Task-Keys (3: gift/friends/win)
-- gedeckelt und stabil über Cluster-Wechsel hinweg — was der
-- Intention der Original-Kommentare entspricht („wenn User in
-- Cluster A alle 3 Aufgaben schafft und dann in Cluster B
-- wechselt, bleibt die Stufe bestehen").
--
-- ─── Bug B: Bonbon-Späteinsteiger-Blockade ────────────────────
-- add_bonbons (0034) und award_game_bonbons (0044) prüften den
-- Post-Unlock-Guard `exists (select 1 from user_legi_grants
-- where user_id = v_user_id)` GLOBAL. Sobald ein User in
-- IRGENDEINEM Cluster einen Grant hat (z.B. weil er dort die
-- Katze schon bekommen hat), skippten beide RPCs jede weitere
-- Bonbon-Buchung — auch im neuen Cluster, wo er noch mit-
-- sammeln müsste, damit dieser Cluster überhaupt unlockt.
--
-- Fix: Guard cluster-scopen (`and cluster_id = v_session.
-- cluster_id`). Späteinsteiger können im neuen Cluster wieder
-- Bonbons erfarmen. Sobald der neue Cluster unlockt, vergibt
-- ensure_legi_grant (0035) einen zusätzlichen Grant-Row für
-- den neuen Cluster; claim_cluster_legi sieht creature bereits
-- gesetzt → skip 'already_claimed', alte Katze inkl. Growth
-- bleibt via game_state (das ist nicht cluster-scoped).
--
-- ─── Zusatz: Cross-Cluster-Task-Übersicht ─────────────────────
-- get_my_gift_tasks (0036) filterte nur Rows aus dem aktuellen
-- Cluster. Späteinsteiger sahen ihre im alten Cluster
-- abgeschlossenen Tasks nicht mehr → Task-Modal zeigte alles
-- als offen, obwohl die Kreatur (aus dem alten Cluster) längst
-- ausgewachsen war.
--
-- Fix: cross-cluster Aggregation per DISTINCT ON (task_key).
-- Priorisierung: (1) accepted-Row bevorzugt, (2) aktueller
-- Cluster bevorzugt, (3) älteste. Damit gilt eine Task auch
-- im neuen Cluster als erledigt, wenn sie irgendwo erledigt
-- wurde.
--
-- ─── Backfill ─────────────────────────────────────────────────
-- Bereits inflationär gepushte game_state.game16.growth-Werte
-- werden auf den korrekten Wert (basierend auf
-- count(distinct task_key)) zurückgesetzt. Nur runter — nie hoch —
-- via WHERE growth > new_growth. User ohne inflationären Wert
-- bleiben unangetastet.
--
-- Basis: 0034 (add_bonbons), 0036 (accept_gift, get_my_gift_tasks),
-- 0037 (friends_room_complete), 0040 (claim_win_reward — die
-- neueste Version mit seenCreatures-Fallback), 0044
-- (award_game_bonbons). Alle Änderungen minimal — nur die
-- 2-3 Zeilen mit dem Bug getauscht.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) accept_gift — count(distinct task_key)
-- ─────────────────────────────────────────────────────────────
create or replace function accept_gift(p_task_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id     uuid := auth.uid();
  v_cluster_id  uuid;
  v_row         record;
  v_giver_name  text;
  v_new_growth  int;
  v_completed   int;
  v_thresholds  int[] := array[3, 7, 12, 21, 100];
  v_target      int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_task_key is null or p_task_key not in ('gift','friends','win') then
    return jsonb_build_object('ok', false, 'error', 'invalid_task_key');
  end if;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select user_id, cluster_id, task_key, giver_id, sent_at, accepted_at
    into v_row
  from user_legi_task_gifts
  where user_id = v_user_id and cluster_id = v_cluster_id and task_key = p_task_key;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_pending_gift');
  end if;

  select display_name into v_giver_name
    from profiles where id = v_row.giver_id;

  if v_row.accepted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_accepted',
      'giver_display_name', v_giver_name
    );
  end if;

  update user_legi_task_gifts
     set accepted_at = now()
   where user_id = v_user_id and cluster_id = v_cluster_id and task_key = p_task_key;

  -- FIX 0046: count(distinct task_key) statt count(*).
  -- Damit ist der Zähler stabil auf 1–3 (aktuell 3 aktive Task-Keys),
  -- egal wie viele Cluster-Instanzen derselben Task existieren.
  select count(distinct task_key) into v_completed
    from user_legi_task_gifts
    where user_id = v_user_id
      and accepted_at is not null;

  v_target := v_thresholds[least(v_completed, array_length(v_thresholds, 1))];

  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user_id, 'game16', 0, 0, 'einhornkatze', v_target, 0, now())
  on conflict (user_id, game_id) do update set
    creature   = coalesce(game_state.creature, 'einhornkatze'),
    growth     = greatest(game_state.growth, v_target),
    updated_at = now()
  returning growth into v_new_growth;

  return jsonb_build_object(
    'ok',                 true,
    'accepted',           true,
    'new_growth',         v_new_growth,
    'completed_tasks',    v_completed,
    'giver_display_name', v_giver_name
  );
end;
$$;

revoke all on function accept_gift(text) from public;
grant execute on function accept_gift(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) friends_room_complete — count(distinct task_key)
-- ─────────────────────────────────────────────────────────────
create or replace function friends_room_complete(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_active     int;
  v_completed  int;
  v_thresholds int[] := array[3, 7, 12, 21, 100];
  v_target     int;
  v_new_growth int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
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

  if not exists (
    select 1 from friends_room_presence
    where user_id = v_user_id
      and cluster_id = v_cluster_id
      and code = p_code
      and last_seen_at > now() - interval '30 seconds'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_in_room');
  end if;

  select count(*) into v_active
    from friends_room_presence
   where cluster_id = v_cluster_id
     and code = p_code
     and last_seen_at > now() - interval '30 seconds';

  if v_active < 3 then
    return jsonb_build_object('ok', false, 'error', 'not_enough_users',
                              'active', v_active);
  end if;

  insert into user_legi_task_gifts
        (user_id, cluster_id, task_key, giver_id, sent_at, accepted_at)
  values (v_user_id, v_cluster_id, 'friends', v_user_id, now(), now())
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
    'completed',       true,
    'new_growth',      v_new_growth,
    'completed_tasks', v_completed,
    'active',          v_active
  );
end;
$$;

revoke all on function friends_room_complete(text) from public;
grant execute on function friends_room_complete(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) claim_win_reward — count(distinct task_key)
-- ─────────────────────────────────────────────────────────────
-- Basis: 0040 (seenCreatures-Fallback). Nur der count-Aufruf ändert
-- sich; alle anderen Zweige (Cluster-Vollständigkeits-Check via
-- game_state + shop_state.seenCreatures) bleiben identisch.
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


-- ─────────────────────────────────────────────────────────────
-- 4) add_bonbons — Guard cluster-scoped
-- ─────────────────────────────────────────────────────────────
-- Basis: 0034. Nur der Post-Unlock-Guard-Check ändert sich.
-- Der Fall „User ohne cluster_id" fällt aus der Guard-Bedingung
-- raus (null vergleicht nicht mit =); solche User adden Bonbons
-- in ihre wallet ohne cluster-legi-Trigger, was passt.
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

  select id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;
  if v_session.season < 3 then
    return jsonb_build_object('ok', true, 'skipped', 'season_below_3');
  end if;

  -- FIX 0046: Guard cluster-scoped. Späteinsteiger mit Grant im
  -- ALTEN Cluster können jetzt im NEUEN Cluster wieder Bonbons
  -- sammeln. Sobald der neue Cluster unlockt, kommt via
  -- ensure_legi_grant (0035) ein weiterer Grant-Row dazu und die
  -- alte Katze aus game_state bleibt bestehen (claim_cluster_legi
  -- skippt bei creature is not null).
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


-- ─────────────────────────────────────────────────────────────
-- 5) award_game_bonbons — Guard cluster-scoped
-- ─────────────────────────────────────────────────────────────
-- Basis: 0044. Nur der Guard-Check ändert sich. Da diese RPC bereits
-- vor dem Guard-Check auf `cluster_id is null` prüft und skippt,
-- ist v_session.cluster_id hier garantiert nicht null.
create or replace function award_game_bonbons(
  p_game_id     text,
  p_correct     int,
  p_max_rounds  int
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session     record;
  v_today       date := (now() at time zone 'Europe/Berlin')::date;
  v_prev_claim  date;
  v_base        int;
  v_bonus       int := 0;
  v_total       int;
  v_add_result  jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_game_id is null or length(p_game_id) = 0 or length(p_game_id) > 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid_game_id');
  end if;
  if p_max_rounds is null or p_max_rounds < 1 or p_max_rounds > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_max_rounds');
  end if;
  if p_correct is null or p_correct < 0 or p_correct > p_max_rounds then
    return jsonb_build_object('ok', false, 'error', 'invalid_correct');
  end if;

  select id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;
  if v_session.season < 3 or v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'not_s3_cluster');
  end if;

  -- FIX 0046: Guard cluster-scoped. Späteinsteiger sammeln im neuen
  -- Cluster wieder mit, auch wenn sie im alten schon Grant + Katze
  -- haben.
  if exists (
    select 1 from user_legi_grants
    where user_id = v_user_id and cluster_id = v_session.cluster_id
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'legi_already_unlocked');
  end if;

  select last_claim into v_prev_claim
    from bonbon_daily_claims
   where user_id = v_user_id and kachel_key = p_game_id;

  if v_prev_claim is null or v_prev_claim < v_today then
    v_bonus := 20;
    insert into bonbon_daily_claims (user_id, kachel_key, last_claim)
    values (v_user_id, p_game_id, v_today)
    on conflict (user_id, kachel_key) do update
      set last_claim = excluded.last_claim;
  end if;

  v_base  := least(p_correct, 10);
  v_total := v_base + v_bonus;

  if v_total <= 0 then
    return jsonb_build_object(
      'ok', true, 'base', v_base, 'bonus', v_bonus, 'awarded', 0
    );
  end if;

  select add_bonbons(v_total) into v_add_result;

  return jsonb_build_object(
    'ok',            true,
    'base',          v_base,
    'bonus',         v_bonus,
    'awarded',       v_total,
    'bonbons_total', v_add_result->'bonbons',
    'cluster',       v_add_result->'cluster'
  );
end;
$$;

revoke all on function award_game_bonbons(text, int, int) from public;
grant execute on function award_game_bonbons(text, int, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) get_my_gift_tasks — cross-cluster Aggregation
-- ─────────────────────────────────────────────────────────────
-- Basis: 0036. Statt strikt nach aktuellem Cluster zu filtern,
-- werden pro task_key alle Rows des Users betrachtet und die
-- „beste" gewählt:
--   1) accepted-Rows haben Vorrang vor pending-Rows
--   2) Rows aus dem aktuellen Cluster haben Vorrang vor anderen
--   3) Deterministisches Tiebreak: ältestes accepted_at, dann
--      ältestes sent_at
--
-- Damit sieht ein Späteinsteiger seine im alten Cluster
-- erledigten Tasks weiterhin als „erledigt" im Task-Modal.
-- Ein frisches pending-Gift im neuen Cluster (Row ohne
-- accepted_at) wird korrekt als pending angezeigt, wenn die
-- Task noch nirgends accepted ist.
create or replace function get_my_gift_tasks()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_tasks      jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_tasks
  from (
    select distinct on (t.task_key)
           t.task_key,
           t.giver_id,
           p.display_name as giver_display_name,
           t.sent_at,
           t.accepted_at
    from user_legi_task_gifts t
    left join profiles p on p.id = t.giver_id
    where t.user_id = v_user_id
    order by
      t.task_key,
      (t.accepted_at is not null) desc,
      (t.cluster_id = v_cluster_id) desc,
      t.accepted_at asc nulls last,
      t.sent_at asc
  ) x;

  return jsonb_build_object('ok', true, 'tasks', v_tasks);
end;
$$;

revoke all on function get_my_gift_tasks() from public;
grant execute on function get_my_gift_tasks() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Backfill: inflationäre game16.growth-Werte korrigieren
-- ─────────────────────────────────────────────────────────────
-- Für jeden User mit >0 accepted Task-Rows: der korrekte Growth-
-- Wert ist v_thresholds[count(distinct task_key)]. Falls
-- game_state.game16.growth höher liegt (durch die alte count(*)-
-- Logik hochgezogen), auf den korrekten Wert runter-korrigieren.
-- Nie hoch — WHERE growth > new_growth garantiert.
--
-- User ohne Rows bleiben unangetastet (kein Match).
-- User mit legitimem Growth = new_growth bleiben unangetastet
-- (WHERE-Filter greift nicht).
update game_state gs
   set growth     = ts.new_growth,
       updated_at = now()
  from (
    select
      ulg.user_id,
      (array[3, 7, 12, 21, 100])[least(count(distinct ulg.task_key)::int, 5)]
        as new_growth
    from user_legi_task_gifts ulg
    where ulg.accepted_at is not null
    group by ulg.user_id
  ) ts
 where gs.user_id = ts.user_id
   and gs.game_id = 'game16'
   and gs.growth  > ts.new_growth;
