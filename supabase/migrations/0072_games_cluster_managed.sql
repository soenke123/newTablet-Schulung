-- ══════════════════════════════════════════════════════════════
-- Migration 0072 — nicht jedes Spiel gehört dem Kurs-Schalter
-- ══════════════════════════════════════════════════════════════
-- 0070 hat die Freischaltung an den Kurs gehängt und dafür die
-- Spieleliste aus `games` gelesen. Darin steht aber auch etwas, das
-- keine Kachel des Hubs ist: `game1337` — das Easter-Egg hinter
-- 1337.html. Es taucht in GAMES_CONFIG gar nicht auf, ist über die
-- Atari-Zahlenreihe zu finden und nicht über eine Ansage der
-- Lehrkraft. Im Admin-Panel stand es trotzdem in der Freischalt-
-- Matrix, und "Season 1 komplett auf" hätte es mitgeöffnet — ein
-- Schalter, der ein Rätsel aufschließt, nimmt dem Rätsel den Sinn.
--
-- Statt die ID in drei Lesestellen hart einzutragen, bekommt `games`
-- ein Merkmal: cluster_managed. Damit steht die Antwort auf "gehört
-- dieses Spiel dem Kurs-Schalter?" an dem Ding, um das es geht, und
-- ein zweites Easter-Egg braucht später keine Code-Änderung mehr.
--
-- Reihenfolge in dieser Datei:
--   1) Spalte games.cluster_managed
--   2) game1337 herausnehmen + Altbestand aus cluster_unlocked_games
--   3) is_game_open_for_cluster()   — Nicht-Kursspiele nie gesperrt
--   4) set_cluster_game_access()    — Neuauflage auf Basis 0070
--   5) set_cluster_season_access()  — Neuauflage auf Basis 0070
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) games.cluster_managed
-- ─────────────────────────────────────────────────────────────
-- Default true: alles, was es heute gibt und alles, was künftig
-- dazukommt, ist eine reguläre Kachel. Die Ausnahme muss sich
-- melden, nicht die Regel.
alter table games
  add column if not exists cluster_managed boolean not null default true;

comment on column games.cluster_managed is
  'false = das Spiel wird NICHT vom Kurs-Schalter (cluster_unlocked_games, '
  '0070) verwaltet: weder in der Admin-Matrix gelistet noch von '
  'set_cluster_season_access berührt, und für den Client immer offen. '
  'Für Easter-Eggs wie 1337.html, die sich über das Rätsel erschließen.';


-- ─────────────────────────────────────────────────────────────
-- 2) game1337 herausnehmen
-- ─────────────────────────────────────────────────────────────
update games set cluster_managed = false where id = 'game1337';

-- Der Backfill aus 0070 hat game1337 dort einsortiert, wo die
-- Cluster-Starthilfe (0020/0048) es je in user_unlocked_games gelegt
-- hat. Diese Zeilen sind ab jetzt bedeutungslos — weg damit, sonst
-- zählt die "Offen"-Spalte im Admin-Panel etwas mit, das niemand
-- schalten kann.
delete from cluster_unlocked_games cug
 using games g
 where g.id = cug.game_id
   and not g.cluster_managed;


-- ─────────────────────────────────────────────────────────────
-- 3) is_game_open_for_cluster() — Neuauflage auf Basis 0070
-- ─────────────────────────────────────────────────────────────
-- Ein Spiel ohne Kurs-Verwaltung ist nicht "immer gesperrt", sondern
-- "vom Kurs nicht gesperrt". Die Frage, ob jemand es spielen darf,
-- beantwortet an anderer Stelle das Rätsel.
create or replace function is_game_open_for_cluster(
  p_cluster_id uuid,
  p_game_id    text
)
  returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select
    coalesce(
      (select not g.cluster_managed from games g where g.id = p_game_id),
      false
    )
    or exists (
      select 1 from cluster_unlocked_games
       where cluster_id = p_cluster_id
         and game_id    = p_game_id
    );
$$;

revoke all on function is_game_open_for_cluster(uuid, text) from public;
grant execute on function is_game_open_for_cluster(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) set_cluster_game_access() — Neuauflage auf Basis 0070
-- ─────────────────────────────────────────────────────────────
-- Einzige Änderung gegenüber 0070: der Riegel 'not_manageable'.
-- Er steht neben der Existenzprüfung, weil er dieselbe Art von
-- Antwort gibt — "dieses Spiel ist hier nicht gemeint".
create or replace function set_cluster_game_access(
  p_cluster_id uuid,
  p_game_id    text,
  p_open       boolean
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_managed boolean;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select g.cluster_managed into v_managed
    from games g where g.id = p_game_id and g.active;

  if v_managed is null then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  if not v_managed then
    return jsonb_build_object('ok', false, 'error', 'not_manageable');
  end if;

  if coalesce(p_open, false) then
    insert into cluster_unlocked_games (cluster_id, game_id, unlocked_by)
    values (v_cluster, p_game_id, v_user)
    on conflict (cluster_id, game_id) do update
      set unlocked_at = now(),
          unlocked_by = excluded.unlocked_by;
  else
    delete from cluster_unlocked_games
     where cluster_id = v_cluster and game_id = p_game_id;
  end if;

  return jsonb_build_object(
    'ok',         true,
    'cluster_id', v_cluster,
    'game_id',    p_game_id,
    'open',       coalesce(p_open, false)
  );
end;
$$;

revoke all on function set_cluster_game_access(uuid, text, boolean) from public;
grant execute on function set_cluster_game_access(uuid, text, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) set_cluster_season_access() — Neuauflage auf Basis 0070
-- ─────────────────────────────────────────────────────────────
-- Einzige Änderung gegenüber 0070: `and g.cluster_managed` in beiden
-- Zweigen. "Alles auf" heißt alles, was der Kurs sehen soll — und das
-- Easter-Egg gehört ausdrücklich nicht dazu.
create or replace function set_cluster_season_access(
  p_cluster_id uuid,
  p_season     int,
  p_open       boolean
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_changed int := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_season is null or p_season < 1 or p_season > 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_season');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  if coalesce(p_open, false) then
    with ins as (
      insert into cluster_unlocked_games (cluster_id, game_id, unlocked_by)
      select v_cluster, g.id, v_user
        from games g
       where g.season = p_season and g.active and g.cluster_managed
      on conflict (cluster_id, game_id) do nothing
      returning 1
    )
    select count(*)::int into v_changed from ins;
  else
    with del as (
      delete from cluster_unlocked_games cug
       using games g
       where cug.cluster_id = v_cluster
         and cug.game_id    = g.id
         and g.season       = p_season
         and g.cluster_managed
      returning 1
    )
    select count(*)::int into v_changed from del;
  end if;

  return jsonb_build_object(
    'ok',         true,
    'cluster_id', v_cluster,
    'season',     p_season,
    'open',       coalesce(p_open, false),
    'changed',    v_changed
  );
end;
$$;

revoke all on function set_cluster_season_access(uuid, int, boolean) from public;
grant execute on function set_cluster_season_access(uuid, int, boolean) to authenticated;
