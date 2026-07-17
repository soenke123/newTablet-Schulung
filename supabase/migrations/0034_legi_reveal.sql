-- ══════════════════════════════════════════════════════════════
-- Migration 0034 — Legi-Reveal & Post-Unlock-Guards
-- ══════════════════════════════════════════════════════════════
-- Iteration 3 zum Season-3-Bonbon-Feature.
--
-- Zwei Dinge:
--   1) add_bonbons() bekommt einen Post-Unlock-Guard: sobald ein
--      User einen Legi-Grant hat (Cluster ist unlocked → er kann
--      claimen oder hat schon geclaimt), skippt die RPC künftige
--      Aufrufe stumm. Damit endet die Bonbon-Sammelphase für den
--      User serverseitig.
--   2) Neue RPC claim_cluster_legi() vergibt die Kreatur
--      'einhornkatze' beim Reveal-Klick des Users. Cheat-Sicher
--      via user_legi_grants-Check; idempotent, wenn creature
--      bereits gesetzt ist.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) add_bonbons — Neu mit Post-Unlock-Guard
-- ─────────────────────────────────────────────────────────────
-- Identisch zu Migration 0032 bis auf den neuen Check zwischen
-- „season < 3"-Skip und dem Insert-Block.
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

  -- Post-Unlock-Guard: User hat schon einen Legi-Grant (aus dem
  -- aktuellen Cluster) → keine weiteren Bonbons mehr zählen.
  -- Cluster-Wechsel-Fall: Grant im ALTEN Cluster blockt auch neue
  -- Beiträge im NEUEN Cluster, was bewusst so ist (der User hat
  -- seinen Legi schon bekommen).
  if exists (
    select 1 from user_legi_grants where user_id = v_user_id
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
-- 2) claim_cluster_legi() — vergibt die Kreatur beim Reveal-Klick
-- ─────────────────────────────────────────────────────────────
-- Vom Frontend nach dem „Kreatur befreien"-Klick gerufen. Setzt
-- game_state[game16].creature = 'einhornkatze'. Cheat-Sicher:
--   • Nur wenn user_legi_grants existiert (Cluster hat unlocked
--     und User war zum Zeitpunkt aktives Mitglied).
--   • Idempotent: bereits gesetzte creature bleibt bestehen.
--
-- Die weitere Growth-Progression läuft später über die Aufgaben-
-- Mechanik (eigene Iteration). Diese RPC setzt nur creature+growth=0
-- und rundet_played=0 — First-Play-Zustand.
create or replace function claim_cluster_legi()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id   uuid := auth.uid();
  v_has_grant boolean;
  v_existing  text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select exists (
    select 1 from user_legi_grants where user_id = v_user_id
  ) into v_has_grant;

  if not v_has_grant then
    return jsonb_build_object('ok', false, 'error', 'no_grant');
  end if;

  select creature into v_existing
    from game_state
   where user_id = v_user_id and game_id = 'game16';

  if v_existing is not null then
    return jsonb_build_object(
      'ok', true, 'skipped', 'already_claimed', 'creature', v_existing
    );
  end if;

  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user_id, 'game16', 0, 0, 'einhornkatze', 0, 0, now())
  on conflict (user_id, game_id) do update set
    creature   = coalesce(game_state.creature, 'einhornkatze'),
    updated_at = now();

  return jsonb_build_object(
    'ok', true, 'claimed', true, 'creature', 'einhornkatze'
  );
end;
$$;

revoke all on function claim_cluster_legi() from public;
grant execute on function claim_cluster_legi() to authenticated;
