-- ══════════════════════════════════════════════════════════════
-- Migration 0056 — Legi-Task „Virus Protocol" (Task 5)
-- ══════════════════════════════════════════════════════════════
-- Fünfte und finale Task-Mechanik der Einhornkatze (game16). Ein
-- Baba-Is-You-Klon mit 3 Puzzle-Levels (GameHub/S3 Virus Protocol).
-- Nach allen 3 Levels + „Kreatur vollenden"-Klick springt Growth
-- auf 100 (Stufe 6 = „Vollendet", = GROWTH_THRESHOLDS[5]) und die
-- Einhornkatze erreicht ihre finale Form.
--
-- Design-Entscheidungen:
--   • Progress + Completion sind USER-SCOPED (kein cluster_id),
--     damit gelöste Level einen Cluster-Wechsel überleben. Task 4
--     ist cluster-scoped, weil variant je Cluster neu entdeckt
--     werden kann — bei Task 5 gibt es aber nur eine einzige
--     Vollendung pro User.
--   • task_completed_at ist ONE-WAY: einmal gesetzt, no-op auf
--     Wiederholung (Doppelklick auf „Kreatur vollenden" ist safe).
--   • save_virus_progress ohne Grant-Check — reines Progress-
--     Tracking, harmlos wenn ohne Legi-Grant aufgerufen.
--     complete_virus_task MIT Grant-Check, weil Growth-Update.
--   • Kein DROP — Idempotenz per Catalog-Check (siehe
--     feedback_supabase_no_drop_statements.md).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) user_legi_virus_progress — Level-Progress + Completion-Flag
-- ─────────────────────────────────────────────────────────────
create table if not exists user_legi_virus_progress (
  user_id           uuid not null references auth.users(id) on delete cascade,
  solved_levels     int[] not null default '{}'::int[],  -- z.B. {0,1} = L1+L2 gelöst
  last_level        int  not null default 0,             -- zuletzt geöffnetes Level (Resume)
  task_completed_at timestamptz,                         -- NULL bis „Kreatur vollenden"
  updated_at        timestamptz not null default now(),
  primary key (user_id)
);

alter table user_legi_virus_progress enable row level security;

do $$
begin
  -- User darf seinen eigenen Fortschritt lesen (Boot-Sync).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_legi_virus_progress'
       and policyname = 'ulvp_select_own'
  ) then
    create policy ulvp_select_own on user_legi_virus_progress
      for select using (user_id = auth.uid());
  end if;

  -- Admins sehen alles (Debug + zukünftige Rangliste).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_legi_virus_progress'
       and policyname = 'ulvp_admin_select_all'
  ) then
    create policy ulvp_admin_select_all on user_legi_virus_progress
      for select using (is_admin());
  end if;
end $$;

-- Kein direktes INSERT/UPDATE für authenticated — nur via RPC.
grant select on user_legi_virus_progress to authenticated;
grant select, insert, update, delete on user_legi_virus_progress to service_role;

comment on table user_legi_virus_progress is
  'Task 5 (Virus Protocol): pro User 1 Row. solved_levels wächst '
  'inkrementell, task_completed_at wird EINMAL gesetzt und triggert '
  'game_state[game16].growth = 100 (Stufe 6, Vollendet).';


-- ─────────────────────────────────────────────────────────────
-- 2) save_virus_progress(p_solved_level int, p_last_level int)
-- ─────────────────────────────────────────────────────────────
-- Wird bei jedem gelösten Level UND bei Level-Wechsel gerufen.
-- p_solved_level = null → nur last_level updaten (reines Resume).
-- Guards:
--   • Level-Index muss 0..2 sein (nur 3 Level).
--   • Deduplikation via ANY-Check (idempotent).
create or replace function save_virus_progress(p_solved_level int, p_last_level int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_row     record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_last_level is null or p_last_level < 0 or p_last_level > 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_last_level');
  end if;
  if p_solved_level is not null and (p_solved_level < 0 or p_solved_level > 2) then
    return jsonb_build_object('ok', false, 'error', 'invalid_solved_level');
  end if;

  -- Upsert
  insert into user_legi_virus_progress (user_id, solved_levels, last_level, updated_at)
  values (
    v_user_id,
    case when p_solved_level is null then '{}'::int[] else array[p_solved_level] end,
    p_last_level,
    now()
  )
  on conflict (user_id) do update set
    solved_levels = case
      when p_solved_level is null then user_legi_virus_progress.solved_levels
      when p_solved_level = any(user_legi_virus_progress.solved_levels) then user_legi_virus_progress.solved_levels
      else user_legi_virus_progress.solved_levels || p_solved_level
    end,
    last_level = p_last_level,
    updated_at = now();

  select solved_levels, last_level, task_completed_at
    into v_row
  from user_legi_virus_progress
  where user_id = v_user_id;

  return jsonb_build_object(
    'ok',                true,
    'solved_levels',     v_row.solved_levels,
    'last_level',        v_row.last_level,
    'task_completed_at', v_row.task_completed_at
  );
end;
$$;

revoke all on function save_virus_progress(int, int) from public;
grant execute on function save_virus_progress(int, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) complete_virus_task() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Idempotenter Einmal-Setter. Prüft dass alle 3 Level gelöst sind,
-- setzt task_completed_at und hebt game_state[game16].growth auf
-- mindestens 100 (Stufe 6 = „Vollendet"). Doppelklick = no-op.
--
-- Grant-Check: User muss aktuell in einem Cluster mit Legi-Grant
-- sein (analog set_katze_variant). Ohne Grant könnte er game16
-- gar nicht sehen — dies ist ein Safety-Net gegen manuelle URL-
-- Aufrufe von Nicht-Berechtigten.
create or replace function complete_virus_task()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id     uuid := auth.uid();
  v_cluster_id  uuid;
  v_row         record;
  v_variant     text;
  v_new_growth  int;
  v_target      int := 100;   -- Stufe 6 = GROWTH_THRESHOLDS[5]
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  if not exists (
    select 1 from user_legi_grants
    where user_id = v_user_id and cluster_id = v_cluster_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_grant');
  end if;

  select solved_levels, task_completed_at
    into v_row
  from user_legi_virus_progress
  where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_progress');
  end if;

  -- Alle 3 Level (0, 1, 2) müssen im solved_levels-Array stehen.
  if not (
    0 = any(v_row.solved_levels)
    and 1 = any(v_row.solved_levels)
    and 2 = any(v_row.solved_levels)
  ) then
    return jsonb_build_object('ok', false, 'error', 'incomplete');
  end if;

  -- variant aus user_legi_path holen (aktueller Cluster). Wird für
  -- die Vollenden-Animation im Client benötigt.
  select variant into v_variant
    from user_legi_path
   where user_id = v_user_id and cluster_id = v_cluster_id;

  -- Idempotenz: task_completed_at ist unumkehrbar.
  if v_row.task_completed_at is not null then
    select growth into v_new_growth
      from game_state
     where user_id = v_user_id and game_id = 'game16';
    return jsonb_build_object(
      'ok',                true,
      'skipped',           'already_completed',
      'task_completed_at', v_row.task_completed_at,
      'variant',           v_variant,
      'growth',            coalesce(v_new_growth, 0)
    );
  end if;

  update user_legi_virus_progress
     set task_completed_at = now(),
         updated_at        = now()
   where user_id = v_user_id
   returning task_completed_at into v_row.task_completed_at;

  -- Growth auf Stufe 6 anheben (nie reduzieren).
  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user_id, 'game16', 0, 0, 'einhornkatze', v_target, 0, now())
  on conflict (user_id, game_id) do update set
    creature   = coalesce(game_state.creature, 'einhornkatze'),
    growth     = greatest(game_state.growth, v_target),
    updated_at = now()
  returning growth into v_new_growth;

  return jsonb_build_object(
    'ok',                true,
    'task_completed_at', v_row.task_completed_at,
    'variant',           v_variant,
    'growth',            v_new_growth
  );
end;
$$;

revoke all on function complete_virus_task() from public;
grant execute on function complete_virus_task() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) get_my_virus_progress() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Boot-Sync: liefert Level-Progress + Completion-Zeitstempel des
-- aktuellen Users. Wird von loadVirusProgress() im Frontend
-- aufgerufen, cached window.__virusProgress.
create or replace function get_my_virus_progress()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_row     record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select solved_levels, last_level, task_completed_at
    into v_row
  from user_legi_virus_progress
  where user_id = v_user_id;

  if not found then
    return jsonb_build_object(
      'ok',                true,
      'solved_levels',     '{}'::int[],
      'last_level',        0,
      'task_completed_at', null
    );
  end if;

  return jsonb_build_object(
    'ok',                true,
    'solved_levels',     v_row.solved_levels,
    'last_level',        v_row.last_level,
    'task_completed_at', v_row.task_completed_at
  );
end;
$$;

revoke all on function get_my_virus_progress() from public;
grant execute on function get_my_virus_progress() to authenticated;
