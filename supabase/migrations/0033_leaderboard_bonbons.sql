-- ══════════════════════════════════════════════════════════════
-- Migration 0033 — Highscore-Metric 'bonbons'
-- ══════════════════════════════════════════════════════════════
-- Erweitert get_hub_leaderboard um metric='bonbons'. Primary-Score
-- = wallets.bonbons (Kumulativer Bonbon-Beitrag des Users). Damit
-- kann /highscores.html einen neuen Chip „🍬 Regenbogen-Bonbons"
-- führen, ohne eine separate RPC.
--
-- Base ist Migration 0029 (Coin-Rangliste vollständig, avatar_id).
-- Nur der metric-Whitelist und die scored-CTE ist erweitert;
-- coins/creatures/legendaries-Zweige sind unverändert.
--
-- Regel aus Memory: Neu-Deklaration von shop-/leaderboard-RPCs
-- IMMER auf Basis der höchsten bestehenden Migration.
-- ══════════════════════════════════════════════════════════════

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

  if p_metric not in ('coins', 'creatures', 'legendaries', 'bonbons') then
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
      coalesce(w.bonbons, 0)             as wallet_bonbons,
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
        when 'bonbons' then wallet_bonbons
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
        when 'bonbons'     then 0
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
