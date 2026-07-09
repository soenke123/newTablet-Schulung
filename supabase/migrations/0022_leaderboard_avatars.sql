-- ══════════════════════════════════════════════════════════════
-- Migration 0022 — Avatar-ID in Leaderboard-Responses
-- ══════════════════════════════════════════════════════════════
-- Die Bestenlisten in highscores.html sollen vor dem Namen das
-- Profilbild anzeigen (Avatar-Wechsel spiegelt sich sofort im
-- nächsten Board-Load). Dafür bekommen beide Leaderboard-RPCs
-- ein zusätzliches `avatar_id`-Feld pro Eintrag (Top-10 + Self).
--
-- Keine Änderung an Signatur oder Rückgabestruktur — nur ein
-- weiteres Feld in jedem Entry-Objekt. Alt-Frontends ignorieren
-- das Feld einfach.
-- ══════════════════════════════════════════════════════════════


create or replace function get_game_leaderboard(p_game_id text, p_scope text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_session record;
  v_game    record;
  v_top     jsonb;
  v_self    jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
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

  select id, season, active into v_game from games where id = p_game_id;
  if not found or not v_game.active then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  if v_game.season > v_session.season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  if p_scope = 'cluster' and v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'top', '[]'::jsonb, 'self', null);
  end if;

  with ranked as (
    select
      h.user_id,
      p.display_name,
      p.avatar_id,
      h.best_score,
      h.updated_at,
      row_number() over (order by h.best_score desc, h.updated_at asc) as rnk
    from game_highscores h
    join profiles p on p.id = h.user_id
    where h.game_id = p_game_id
      and p.status = 'active'
      and (
        (p_scope = 'cluster' and p.cluster_id = v_session.cluster_id)
        or (p_scope = 'school' and p.school_id = v_session.school_id)
      )
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'rank',         rnk,
                 'display_name', display_name,
                 'avatar_id',    avatar_id,
                 'best_score',   best_score,
                 'is_self',      (user_id = v_user_id)
               ) order by rnk
             )
      from ranked
      where rnk <= 10
    ), '[]'::jsonb),
    (
      select jsonb_build_object(
               'rank',         rnk,
               'display_name', display_name,
               'avatar_id',    avatar_id,
               'best_score',   best_score,
               'is_self',      true
             )
      from ranked
      where user_id = v_user_id
    )
  into v_top, v_self;

  return jsonb_build_object('ok', true, 'top', v_top, 'self', v_self);
end;
$$;

revoke all on function get_game_leaderboard(text, text) from public;
grant execute on function get_game_leaderboard(text, text) to authenticated;


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

  if p_metric not in ('coins', 'creatures', 'legendaries') then
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
      w.coins,
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
        when 'coins'       then coalesce(coins, 0)
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
