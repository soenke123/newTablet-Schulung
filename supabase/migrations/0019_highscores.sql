-- ══════════════════════════════════════════════════════════════
-- Migration 0019 — Highscores + Leaderboards
-- ══════════════════════════════════════════════════════════════
-- Tabelle game_highscores speichert pro (User, Spiel) den bisher
-- besten Score. Wird von den Games nach jeder Runde via
-- upsert_highscore aktualisiert. Update-Semantik: nur wenn neuer
-- Score > alter (GREATEST).
--
-- Leaderboards laufen über zwei RPCs:
--   - get_game_leaderboard(game_id, scope) für die Spiele
--   - get_hub_leaderboard(metric, scope)   für Coins / Monster / Legies
-- scope ∈ ('cluster', 'school'). Season-Gate: bei Spielen wird
-- geblockt, wenn eigene Season < game.season. Bei Hub-Boards greift
-- kein Season-Gate (Aggregate über alles).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- game_highscores — Best-Score pro (User, Spiel)
-- ─────────────────────────────────────────────────────────────
create table game_highscores (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_id     text not null references games(id)      on delete cascade,
  best_score  int  not null default 0 check (best_score >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index game_highscores_game_score_idx
  on game_highscores(game_id, best_score desc);

alter table game_highscores enable row level security;

-- Nur eigenen Highscore direkt lesbar; Leaderboards laufen über RPC
create policy game_highscores_select_own on game_highscores
  for select using (user_id = auth.uid());

grant select on game_highscores to authenticated;


-- ─────────────────────────────────────────────────────────────
-- upsert_highscore(p_game_id text, p_score int) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Setzt den Best-Score auf max(alt, neu). Client kann den Score
-- ohne Vorwissen schicken, Server macht den GREATEST-Vergleich.
create or replace function upsert_highscore(p_game_id text, p_score int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_status  text;
  v_season  int;
  v_game    record;
  v_new_best int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_score is null or p_score < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_score');
  end if;

  -- Sabotage-Cap: absurde Werte kappen (1 Mrd ist selbst für Endless zuviel)
  if p_score > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'score_out_of_range');
  end if;

  select status, season into v_status, v_season
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  select id, season, active into v_game from games where id = p_game_id;
  if not found or not v_game.active then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  if v_game.season > v_season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  insert into game_highscores (user_id, game_id, best_score, updated_at)
  values (v_user_id, p_game_id, p_score, now())
  on conflict (user_id, game_id) do update
    set best_score = greatest(game_highscores.best_score, excluded.best_score),
        updated_at = case
                       when excluded.best_score > game_highscores.best_score then now()
                       else game_highscores.updated_at
                     end
  returning best_score into v_new_best;

  return jsonb_build_object('ok', true, 'best_score', v_new_best);
end;
$$;

revoke all on function upsert_highscore(text, int) from public;
grant execute on function upsert_highscore(text, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- get_game_leaderboard(p_game_id text, p_scope text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Liefert { top: [Top 10], self: {rank, best_score} | null }.
-- Season-Gate: wenn eigene Season < game.season, wird geblockt.
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


-- ─────────────────────────────────────────────────────────────
-- get_hub_leaderboard(p_metric text, p_scope text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Liefert Aggregat-Boards.
--   metric = 'coins'        → primary: wallets.coins
--   metric = 'creatures'    → primary: seen_count,   secondary: fully_count
--   metric = 'legendaries'  → primary: seen_legi,    secondary: fully_legi
--
-- "Voll ausgebildet"-Threshold ist Season-abhängig pro User:
--   Season 1 → Stage 4 (code = "Stufe 5" im User-Sprech)
--   Season ≥ 2 → Stage 5 (code = "Stufe 6"/vollendet)
--
-- Legendaries-Set: robot, pfau, chinDrache, schnabeltier
-- (aus GameHub/creatures.js:436 — hier hart geführt, weil klein & stabil).
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

  -- Basis-Query: alle Profile im Scope
  with scoped as (
    select
      p.id           as user_id,
      p.display_name,
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


-- ─────────────────────────────────────────────────────────────
-- get_my_highscore(p_game_id text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Convenience-Getter für Games, damit sie beim Start ihren
-- persönlichen Best-Score aus der DB laden können.
create or replace function get_my_highscore(p_game_id text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_score   int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select best_score into v_score
  from game_highscores
  where user_id = v_user_id and game_id = p_game_id;

  return jsonb_build_object('ok', true, 'best_score', coalesce(v_score, 0));
end;
$$;

revoke all on function get_my_highscore(text) from public;
grant execute on function get_my_highscore(text) to authenticated;
