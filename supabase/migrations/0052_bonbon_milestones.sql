-- ══════════════════════════════════════════════════════════════
-- Migration 0052 — Bonbon-Meilensteine (Freischaltungen + Grants)
-- ══════════════════════════════════════════════════════════════
-- Aufgesetzt auf Migration 0032 (Bonbon-Kern) und 0044 (Verdienst-
-- Mechanik). Führt sechs Meilensteine (10/20/30/50/75/100 %) ein.
--
--   • Shop-Freischaltungen (10/30/75/100): rein clientseitig aus
--     der Grant-Tabelle abgeleitet — kein zusätzliches Server-Flag.
--     Client filtert SHOP_ITEMS_P3 nach `bonbonMilestone in claimed`.
--   • Direkt-Grants (20/50): serverseitige Ausschüttung in
--     user_collectibles.shop_state (Item-Counts, bankedCoins,
--     kristalle) + wallets.coins (redundanter Gesamtstand).
--
--   • Späteinsteiger: alle bereits erreichten Meilensteine sind
--     ab Beitritt claimbar. Der User klickt sich durch die Modal-
--     Chain, jeder Claim ist eine eigene RPC-Runde.
--
--   • Idempotenz: user_bonbon_milestone_grants PK(user, cluster,
--     milestone). INSERT ON CONFLICT DO NOTHING verhindert Doppel-
--     Ausschüttung bei paralleler Chain (zwei Tabs).
--
--   • get_cluster_bonbon_status wird erweitert um
--       - milestones_claimed: int[]      (welche User bereits geclaimed)
--       - pct: numeric                    (collected/target*100, clamped)
--     Das alte `milestones`-Array (25/50/75/100 mit reached-Flag)
--     bleibt zur Rückwärtskompat drin, wird vom neuen Regenbogen
--     aber nicht mehr genutzt.
--
-- Alle Statements idempotent (DO-Blöcke mit pg_catalog-Checks —
-- Regel aus feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) user_bonbon_milestone_grants — Idempotenz-Marker
-- ─────────────────────────────────────────────────────────────
create table if not exists user_bonbon_milestone_grants (
  user_id     uuid not null references auth.users(id) on delete cascade,
  cluster_id  uuid not null references clusters(id)   on delete cascade,
  milestone   int  not null check (milestone in (10, 20, 30, 50, 75, 100)),
  granted_at  timestamptz not null default now(),
  primary key (user_id, cluster_id, milestone)
);

create index if not exists user_bonbon_milestone_grants_user_idx
  on user_bonbon_milestone_grants(user_id);

alter table user_bonbon_milestone_grants enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_bonbon_milestone_grants'
       and policyname = 'ubmg_select_own'
  ) then
    create policy ubmg_select_own on user_bonbon_milestone_grants
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_bonbon_milestone_grants'
       and policyname = 'ubmg_admin_select_all'
  ) then
    create policy ubmg_admin_select_all on user_bonbon_milestone_grants
      for select using (is_admin());
  end if;
end $$;

grant select on user_bonbon_milestone_grants to authenticated;

comment on table user_bonbon_milestone_grants is
  'Pro (User, Cluster, Meilenstein) genau ein Grant. INSERT ON CONFLICT '
  'DO NOTHING garantiert atomare Einmal-Ausschüttung. Cluster-Wechsel = '
  'neuer Grant-Kanal (der neue Cluster hat seinen eigenen Prozent-Stand).';


-- ─────────────────────────────────────────────────────────────
-- 2) claim_bonbon_milestone(p_milestone int) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Aufgerufen vom Client, wenn User im Chain-Modal auf „Weiter"
-- klickt. Serverseitige Guards:
--   • Milestone-Value muss 10/20/30/50/75/100 sein.
--   • Cluster-Prozent (collected/target) muss >= milestone sein.
--   • Bereits geclaimt → return already_claimed (kein Fehler).
--
-- Für 20 %/50 % werden Items/Coins direkt in shop_state + wallets
-- eingebucht. Für 10 %/30 %/75 %/100 % nur der Grant-Marker —
-- Shop-Freischaltung leitet der Client aus milestones_claimed ab.
create or replace function claim_bonbon_milestone(p_milestone int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session    record;
  v_cluster    record;
  v_collected  int;
  v_pct        numeric;
  v_inserted   int := 0;
  v_granted    jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_milestone is null or p_milestone not in (10, 20, 30, 50, 75, 100) then
    return jsonb_build_object('ok', false, 'error', 'bad_milestone');
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
    return jsonb_build_object('ok', false, 'error', 'not_s3_cluster');
  end if;

  select id, bonbon_target
    into v_cluster
  from clusters where id = v_session.cluster_id;
  if not found or v_cluster.bonbon_target is null or v_cluster.bonbon_target <= 0 then
    return jsonb_build_object('ok', false, 'error', 'cluster_target_missing');
  end if;

  select coalesce(sum(w.bonbons), 0)::int into v_collected
    from profiles p
    left join wallets w on w.user_id = p.id
   where p.cluster_id = v_session.cluster_id and p.status = 'active';

  v_pct := (v_collected::numeric / v_cluster.bonbon_target::numeric) * 100;

  if v_pct < p_milestone then
    return jsonb_build_object(
      'ok', false, 'error', 'not_reached',
      'pct', round(v_pct, 2), 'required', p_milestone
    );
  end if;

  -- Idempotenter Insert des Grant-Markers.
  insert into user_bonbon_milestone_grants (user_id, cluster_id, milestone)
  values (v_user_id, v_session.cluster_id, p_milestone)
  on conflict (user_id, cluster_id, milestone) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'milestone', p_milestone, 'already_claimed', true);
  end if;

  -- 20 % — Item-Grant in shop_state.
  if p_milestone = 20 then
    -- Sicherstellen, dass shop_state-Zeile existiert (leerer Blob).
    insert into user_collectibles (user_id, key, value, updated_at)
    values (v_user_id, 'shop_state', '{}'::jsonb, now())
    on conflict (user_id, key) do nothing;

    update user_collectibles
       set value = jsonb_set(
                     jsonb_set(
                       jsonb_set(coalesce(value, '{}'::jsonb),
                         '{lockmittelCount}',
                         to_jsonb(coalesce((value->>'lockmittelCount')::int, 0) + 1)),
                       '{wachstumstrankCount}',
                       to_jsonb(coalesce((value->>'wachstumstrankCount')::int, 0) + 5)),
                     '{coinsx3Count}',
                     to_jsonb(coalesce((value->>'coinsx3Count')::int, 0) + 5)),
           updated_at = now()
     where user_id = v_user_id and key = 'shop_state';

    v_granted := jsonb_build_object(
      'lockmittelCount',      1,
      'wachstumstrankCount',  5,
      'coinsx3Count',         5
    );

  -- 50 % — Coins + Kristalle in shop_state (bankedCoins ist die einzige
  -- Wahrheitsquelle für den Client-summierten Coin-Bestand + zählt im
  -- Leaderboard schon mit; wallets.coins hier NICHT bumpen, sonst
  -- Doppelzählung in get_hub_leaderboard metric='coins').
  elsif p_milestone = 50 then
    insert into user_collectibles (user_id, key, value, updated_at)
    values (v_user_id, 'shop_state', '{}'::jsonb, now())
    on conflict (user_id, key) do nothing;

    update user_collectibles
       set value = jsonb_set(
                     jsonb_set(coalesce(value, '{}'::jsonb),
                       '{bankedCoins}',
                       to_jsonb(coalesce((value->>'bankedCoins')::int, 0) + 30)),
                     '{kristalle}',
                     to_jsonb(coalesce((value->>'kristalle')::int, 0) + 20)),
           updated_at = now()
     where user_id = v_user_id and key = 'shop_state';

    v_granted := jsonb_build_object(
      'bankedCoins', 30,
      'kristalle',   20
    );
  end if;

  return jsonb_build_object(
    'ok',        true,
    'milestone', p_milestone,
    'granted',   v_granted
  );
end;
$$;

revoke all on function claim_bonbon_milestone(int) from public;
grant execute on function claim_bonbon_milestone(int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) get_cluster_bonbon_status() — erweitert um milestones_claimed
-- ─────────────────────────────────────────────────────────────
-- Basis: Deklaration aus Migration 0032. Ergänzt:
--   • milestones_claimed: [10, 20, ...]  (User-scoped)
--   • pct: numeric                        (collected/target*100, gedeckelt)
-- Das bestehende `milestones`-Array (25/50/75/100) bleibt drin —
-- neue UI nutzt es nicht mehr, aber alte Aufrufer laufen weiter.
create or replace function get_cluster_bonbon_status()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id   uuid := auth.uid();
  v_session   record;
  v_cluster   record;
  v_collected int;
  v_own       int;
  v_target    int;
  v_pct       numeric;
  v_claimed   int[];
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if v_session.season < 3 or v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  select id, bonbon_target, bonbons_unlocked_at
    into v_cluster
  from clusters where id = v_session.cluster_id;
  if not found or v_cluster.bonbon_target is null then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  v_target := v_cluster.bonbon_target;

  select coalesce(sum(w.bonbons), 0)::int into v_collected
  from profiles p
  left join wallets w on w.user_id = p.id
  where p.cluster_id = v_session.cluster_id and p.status = 'active';

  select coalesce(bonbons, 0) into v_own
  from wallets where user_id = v_user_id;
  v_own := coalesce(v_own, 0);

  v_pct := (v_collected::numeric / v_target::numeric) * 100;

  select coalesce(array_agg(milestone order by milestone), array[]::int[])
    into v_claimed
  from user_bonbon_milestone_grants
   where user_id = v_user_id and cluster_id = v_session.cluster_id;

  return jsonb_build_object(
    'ok',                 true,
    'enabled',            true,
    'target',             v_target,
    'collected',          v_collected,
    'own_amount',         v_own,
    'unlocked',           v_cluster.bonbons_unlocked_at is not null,
    'unlocked_at',        v_cluster.bonbons_unlocked_at,
    'pct',                round(least(v_pct, 100), 2),
    'milestones_claimed', to_jsonb(v_claimed),
    'milestones',         jsonb_build_array(
      jsonb_build_object('percent', 25,  'reached', v_collected >= (v_target * 25  / 100)),
      jsonb_build_object('percent', 50,  'reached', v_collected >= (v_target * 50  / 100)),
      jsonb_build_object('percent', 75,  'reached', v_collected >= (v_target * 75  / 100)),
      jsonb_build_object('percent', 100, 'reached', v_collected >= v_target)
    )
  );
end;
$$;

revoke all on function get_cluster_bonbon_status() from public;
grant execute on function get_cluster_bonbon_status() to authenticated;
