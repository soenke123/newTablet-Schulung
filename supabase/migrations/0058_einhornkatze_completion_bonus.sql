-- ══════════════════════════════════════════════════════════════
-- Migration 0058 — Einhornkatze-Vollendungs-Bonus
-- ══════════════════════════════════════════════════════════════
-- Belohnt User, die die Einhornkatze auf Stufe 6 (Vollendet,
-- game_state.growth = 100) gebracht haben — mit 2000 Coins in
-- shop_state.bankedCoins und 200 Kristallen in shop_state.kristalle.
--
-- Design-Entscheidungen:
--   • USER-SCOPED (kein cluster_id). Ein User bekommt den Bonus
--     genau EINMAL, egal in wie vielen Clustern er die Katze
--     vollendet. Cluster-Wechsel = kein neuer Bonus (analog zur
--     einmaligen finalen Kreatur-Form).
--   • Getrennt von complete_virus_task, damit Späteinsteiger, die
--     bereits vor dieser Migration vollendet haben, den Bonus per
--     Auto-Claim beim nächsten Hub-Boot nachträglich erhalten
--     (siehe loadVirusProgress in GameHub/creatures.js).
--   • Nur bankedCoins bumpen, NICHT wallets.coins — sonst
--     Doppelzählung im Leaderboard metric='coins'
--     (siehe feedback_coin_grant_only_banked).
--   • Idempotenz per Grant-Marker-Tabelle + INSERT ON CONFLICT
--     DO NOTHING (analog user_bonbon_milestone_grants aus 0052).
--   • Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
--     (Regel aus feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) user_einhornkatze_completion_grants — Idempotenz-Marker
-- ─────────────────────────────────────────────────────────────
create table if not exists user_einhornkatze_completion_grants (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table user_einhornkatze_completion_grants enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_einhornkatze_completion_grants'
       and policyname = 'uecg_select_own'
  ) then
    create policy uecg_select_own on user_einhornkatze_completion_grants
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_einhornkatze_completion_grants'
       and policyname = 'uecg_admin_select_all'
  ) then
    create policy uecg_admin_select_all on user_einhornkatze_completion_grants
      for select using (is_admin());
  end if;
end $$;

grant select on user_einhornkatze_completion_grants to authenticated;
grant select, insert, update, delete on user_einhornkatze_completion_grants to service_role;

comment on table user_einhornkatze_completion_grants is
  'Ein-Row-pro-User Marker für den Einhornkatze-Vollendungs-Bonus '
  '(2000 Coins + 200 Kristalle). INSERT ON CONFLICT DO NOTHING '
  'garantiert atomare Einmal-Ausschüttung, auch bei paralleler Chain '
  '(zwei Tabs) oder gleichzeitigem Auto-Claim + Close-Handler.';


-- ─────────────────────────────────────────────────────────────
-- 2) claim_einhornkatze_completion_bonus() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Client-Auto-Claim: wird vom Hub-Boot (via loadVirusProgress)
-- aufgerufen, sobald task_completed_at gesetzt ist. Server prüft
-- growth ≥ 100 im game_state[game16], setzt den Grant-Marker
-- und bumpt shop_state.bankedCoins + shop_state.kristalle.
--
-- Rückgabe-Varianten:
--   { ok:true, granted:true,        coins:2000, kristalle:200 }   -- frisch ausgeschüttet
--   { ok:true, already_granted:true, coins:2000, kristalle:200 }  -- bereits geclaimt (no-op)
--   { ok:false, error:'not_completed' | 'not_authenticated' }
create or replace function claim_einhornkatze_completion_bonus()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_growth     int;
  v_inserted   int := 0;
  v_coin_bonus int := 2000;
  v_kristalle  int := 200;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select growth into v_growth
    from game_state
   where user_id = v_user_id and game_id = 'game16';

  if v_growth is null or v_growth < 100 then
    return jsonb_build_object('ok', false, 'error', 'not_completed');
  end if;

  insert into user_einhornkatze_completion_grants (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object(
      'ok',              true,
      'already_granted', true,
      'coins',           v_coin_bonus,
      'kristalle',       v_kristalle
    );
  end if;

  -- shop_state-Zeile garantieren, dann atomar bankedCoins + kristalle bumpen.
  insert into user_collectibles (user_id, key, value, updated_at)
  values (v_user_id, 'shop_state', '{}'::jsonb, now())
  on conflict (user_id, key) do nothing;

  update user_collectibles
     set value = jsonb_set(
                   jsonb_set(coalesce(value, '{}'::jsonb),
                     '{bankedCoins}',
                     to_jsonb(coalesce((value->>'bankedCoins')::int, 0) + v_coin_bonus)),
                   '{kristalle}',
                   to_jsonb(coalesce((value->>'kristalle')::int, 0) + v_kristalle)),
         updated_at = now()
   where user_id = v_user_id and key = 'shop_state';

  return jsonb_build_object(
    'ok',        true,
    'granted',   true,
    'coins',     v_coin_bonus,
    'kristalle', v_kristalle
  );
end;
$$;

revoke all on function claim_einhornkatze_completion_bonus() from public;
grant execute on function claim_einhornkatze_completion_bonus() to authenticated;
