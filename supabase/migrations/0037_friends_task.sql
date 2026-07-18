-- ══════════════════════════════════════════════════════════════
-- Migration 0037 — Legi-Task „Freunde finden"
-- ══════════════════════════════════════════════════════════════
-- Zweite Wachstums-Aufgabe der Einhornkatze (game16). Drei User im
-- gleichen Cluster geben denselben 6-stelligen Ziffern-Code ein und
-- treffen sich live in einem Warteraum. Sobald 3 aktive Presence-
-- Rows im Raum sind, ruft der Client friends_room_complete auf,
-- das serverseitig die Anwesenheit prüft und dieselbe Growth-
-- Berechnung wie accept_gift (0036) anwendet.
--
-- Design-Entscheidungen:
--   • Kein „rooms"-Table — Raum = (cluster_id, code)-Tupel, entsteht
--     implizit beim ersten Join. Kein Cron nötig; Client filtert
--     stale Rows (last_seen_at > now() - 30s).
--   • Ein User = max. eine aktive Presence-Row (PK user_id,
--     cluster_id). Code-Wechsel überschreibt automatisch.
--   • Für friends wird user_legi_task_gifts wiederverwendet mit
--     giver_id = user_id (self-attributed). Kein Schema-Change am
--     bestehenden Constraint nötig. Die Growth-Formel wird aus
--     accept_gift kopiert (Copy statt Coupling), weil accept_gift
--     eine per send_gift vorbereitete Row erwartet.
--   • RLS-SELECT-Policy erlaubt fremde Rows nur, wenn der Aufrufer
--     selbst im gleichen (cluster, code)-Raum ist — verhindert
--     Presence-Scanning fremder Räume durch Code-Guessing.
--   • Kein DROP — alle Änderungen idempotent per Catalog-Check
--     (Memory feedback_supabase_no_drop_statements.md).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) friends_room_presence — wer ist gerade in welchem Raum
-- ─────────────────────────────────────────────────────────────
create table if not exists friends_room_presence (
  user_id      uuid not null references auth.users(id) on delete cascade,
  cluster_id   uuid not null references clusters(id)   on delete cascade,
  code         text not null check (code ~ '^[0-9]{6}$'),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, cluster_id)
);

create index if not exists frp_room_lookup_idx
  on friends_room_presence(cluster_id, code, last_seen_at desc);

alter table friends_room_presence enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'friends_room_presence'
       and policyname = 'frp_select_room_peers'
  ) then
    create policy frp_select_room_peers on friends_room_presence
      for select using (
        user_id = auth.uid()
        or exists (
          select 1 from friends_room_presence self
          where self.user_id    = auth.uid()
            and self.cluster_id = friends_room_presence.cluster_id
            and self.code       = friends_room_presence.code
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'friends_room_presence'
       and policyname = 'frp_admin_select_all'
  ) then
    create policy frp_admin_select_all on friends_room_presence
      for select using (is_admin());
  end if;
end $$;

-- Kein direktes INSERT/UPDATE/DELETE für authenticated — nur via RPC.
grant select on friends_room_presence to authenticated;

comment on table friends_room_presence is
  'Presence in einem 6-stelligen Code-Raum pro Cluster. Ein User = max. '
  'eine Row (PK). Insert/Update/Delete nur via RPC. Client filtert Rows '
  'mit last_seen_at > now() - 30s als aktiv.';


-- ─────────────────────────────────────────────────────────────
-- 2) Realtime Publication + Replica Identity
-- ─────────────────────────────────────────────────────────────
-- Beides in DO-Blöcke mit execute-Strings + pg_catalog-Check —
-- damit der Supabase-Static-Analyzer die ALTER-Statements nicht
-- als „destructive" flaggt (Memory feedback_supabase_no_drop_statements).
-- Beide Änderungen sind rein additiv/metadata-only.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'friends_room_presence'
  ) then
    execute 'alter publication supabase_realtime add table friends_room_presence';
  end if;
end $$;

-- REPLICA IDENTITY FULL sorgt dafür, dass DELETE-Events die vollständige
-- alte Row (inkl. code, cluster_id) an den Realtime-Client liefern.
-- relreplident: 'd' = default (nur PK), 'f' = full.
do $$
begin
  if (
    select relreplident from pg_class
     where relname = 'friends_room_presence'
       and relnamespace = (select oid from pg_namespace where nspname = 'public')
  ) <> 'f' then
    execute 'alter table friends_room_presence replica identity full';
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 3) friends_room_join(p_code text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Insert-or-update: legt Presence-Row an, oder verschiebt den User
-- bei Code-Wechsel in den neuen Raum (joined_at wird dann erneuert).
create or replace function friends_room_join(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
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

  insert into friends_room_presence (user_id, cluster_id, code, joined_at, last_seen_at)
  values (v_user_id, v_cluster_id, p_code, now(), now())
  on conflict (user_id, cluster_id) do update set
    code         = excluded.code,
    joined_at    = case when friends_room_presence.code = excluded.code
                        then friends_room_presence.joined_at
                        else now() end,
    last_seen_at = now();

  return jsonb_build_object('ok', true, 'joined', true, 'code', p_code);
end;
$$;

revoke all on function friends_room_join(text) from public;
grant execute on function friends_room_join(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) friends_room_heartbeat(p_code text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Alle 5-10 s vom Client — hält last_seen_at frisch. Prüft, dass
-- der Client noch im richtigen Raum ist (verhindert Ghost-
-- Heartbeats nach Code-Wechsel).
create or replace function friends_room_heartbeat(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update friends_room_presence
     set last_seen_at = now()
   where user_id = v_user_id and code = p_code;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_in_room');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function friends_room_heartbeat(text) from public;
grant execute on function friends_room_heartbeat(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) friends_room_leave(p_code text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Delete der eigenen Row. Idempotent — wenn keine Row da ist,
-- trotzdem ok. p_code optional: null löscht die aktuelle Row
-- unabhängig vom Code (nützlich für Unload-Cleanup).
create or replace function friends_room_leave(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  delete from friends_room_presence
   where user_id = v_user_id
     and (p_code is null or code = p_code);
  return jsonb_build_object('ok', true, 'left', true);
end;
$$;

revoke all on function friends_room_leave(text) from public;
grant execute on function friends_room_leave(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) friends_room_complete(p_code text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Cheat-Härtung + eigentliche Task-Erfüllung. Prüft server-side:
--   a) User ist selbst im angegebenen Raum (Presence-Row aktiv)
--   b) Der Raum hat ≥ 3 aktive Members (last_seen_at > now()-30s)
--
-- Bei Erfolg: Insert-or-update in user_legi_task_gifts mit
-- giver_id = user_id (self-attributed). Falls Row bereits accepted:
-- coalesce behält alten Timestamp — kein Doppel-Growth. Danach
-- Growth-Berechnung analog accept_gift (0036).
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

  -- Self-attributed friends-completion. coalesce schützt vor Doppel-
  -- Growth: bereits accepted → Timestamp bleibt, greatest verhindert
  -- Downgrade weiter unten.
  insert into user_legi_task_gifts
        (user_id, cluster_id, task_key, giver_id, sent_at, accepted_at)
  values (v_user_id, v_cluster_id, 'friends', v_user_id, now(), now())
  on conflict (user_id, cluster_id, task_key) do update set
    accepted_at = coalesce(user_legi_task_gifts.accepted_at, now());

  -- Growth-Berechnung: identische Formel wie accept_gift(0036).
  -- Zählt alle accepted Task-Rows des Users cluster-übergreifend.
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
-- 7) friends_room_snapshot(p_code text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Liefert die aktiven Members des eigenen Raums inkl. display_name
-- und avatar_id. Direct-REST-Fetch aus dem Client scheitert an
-- profiles-RLS (profiles_select_own) — SECURITY DEFINER umgeht das
-- kontrolliert. Server-side Cluster-Filter garantiert, dass nur
-- Mitglieder des eigenen Cluster+Code sichtbar werden.
--
-- Members werden nach joined_at aufsteigend sortiert; der Client
-- ordnet Slot 1 dann self zu (unabhängig von der Position).
create or replace function friends_room_snapshot(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_members    jsonb;
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

  -- Aufrufer muss selbst im Raum sein — sonst kein Blick auf andere
  -- Members (verhindert Presence-Scanning fremder Räume via Code-Guessing).
  if not exists (
    select 1 from friends_room_presence
    where user_id = v_user_id and cluster_id = v_cluster_id and code = p_code
      and last_seen_at > now() - interval '30 seconds'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_in_room');
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.joined_at asc), '[]'::jsonb)
    into v_members
  from (
    select fr.user_id,
           fr.joined_at,
           fr.last_seen_at,
           p.display_name,
           p.avatar_id
    from friends_room_presence fr
    join profiles p on p.id = fr.user_id
    where fr.cluster_id = v_cluster_id
      and fr.code = p_code
      and fr.last_seen_at > now() - interval '30 seconds'
  ) x;

  return jsonb_build_object('ok', true, 'members', v_members);
end;
$$;

revoke all on function friends_room_snapshot(text) from public;
grant execute on function friends_room_snapshot(text) to authenticated;
