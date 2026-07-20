-- ══════════════════════════════════════════════════════════════
-- Migration 0049 — Legi-Task „Der Regenbogen-Pfad" (Task 4)
-- ══════════════════════════════════════════════════════════════
-- Vierte Task-Mechanik der Einhornkatze (game16). Solo-Story-
-- Choice-Adventure mit 9 Fragen und drei unsichtbaren Skalen
-- (☀️ hell / 🌙 dunkel / 🌈 bunt). Am Ende wählt der User eine
-- Katzen-Variante — unumkehrbar. Growth springt auf 21 (Stufe 4,
-- deckt sich mit GROWTH_THRESHOLDS[4] im Frontend).
--
-- Design-Entscheidungen:
--   • Eigene Tabelle statt game_state-Erweiterung, weil game_state
--     eine strikte relationale Tabelle ist (kein jsonb-Blob).
--   • Progress + Variante beide server-authoritativ, damit F5- und
--     cross-device-fest.
--   • variant ist ONE-WAY: einmal gesetzt, nie mehr überschreibbar.
--     Doppelklick auf "Katze wächst weiter" → no-op via Guard.
--   • Kein DROP — Idempotenz per Catalog-Check (siehe
--     feedback_supabase_no_drop_statements.md).
--   • Nicht Teil von user_legi_task_gifts, weil path kein Gift-Task
--     ist (kein Giver). Growth-Berechnung erfolgt hier direkt statt
--     über task_count — greatest()-Guard schützt vor Kollision mit
--     parallelen accept_gift-Aufrufen.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) user_legi_path — Progress + finale Variante pro User × Cluster
-- ─────────────────────────────────────────────────────────────
create table if not exists user_legi_path (
  user_id      uuid not null references auth.users(id) on delete cascade,
  cluster_id   uuid not null references clusters(id)   on delete cascade,
  answers      jsonb not null default '[]'::jsonb,     -- ['sun'|'moon'|'rainbow', …]
  step         int   not null default 0 check (step between 0 and 9),
  variant      text  check (variant in ('rainbow','light','dark')),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, cluster_id)
);

alter table user_legi_path enable row level security;

do $$
begin
  -- User darf seinen eigenen Fortschritt lesen (Boot-Sync).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_legi_path'
       and policyname = 'ulp_select_own'
  ) then
    create policy ulp_select_own on user_legi_path
      for select using (user_id = auth.uid());
  end if;

  -- Admins sehen alles (Debug + zukünftige Rangliste).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_legi_path'
       and policyname = 'ulp_admin_select_all'
  ) then
    create policy ulp_admin_select_all on user_legi_path
      for select using (is_admin());
  end if;
end $$;

-- Kein direktes INSERT/UPDATE für authenticated — nur via RPC.
grant select on user_legi_path to authenticated;

comment on table user_legi_path is
  'Task 4 (Regenbogen-Pfad): pro (user, cluster) 1 Row. answers wächst '
  'inkrementell, variant wird EINMAL gesetzt und bleibt fix.';


-- ─────────────────────────────────────────────────────────────
-- 2) save_katze_path_progress(p_answers jsonb, p_step int) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Wird nach jeder Antwort gerufen. Speichert answers + step.
-- Guards:
--   • Konsistenz: jsonb_array_length(p_answers) muss == p_step sein
--   • Nur gültige Skalen-Werte
--   • Wenn variant schon gesetzt → no-op (Progress ist final)
--   • Grant + Cluster wie bei accept_gift
create or replace function save_katze_path_progress(p_answers jsonb, p_step int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_existing_variant text;
  v_scale      text;
  v_idx        int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_step is null or p_step < 0 or p_step > 9 then
    return jsonb_build_object('ok', false, 'error', 'invalid_step');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_answers');
  end if;
  if jsonb_array_length(p_answers) <> p_step then
    return jsonb_build_object('ok', false, 'error', 'length_step_mismatch');
  end if;

  -- Alle Antwort-Werte müssen gültige Skalen sein.
  for v_idx in 0 .. p_step - 1 loop
    v_scale := p_answers ->> v_idx;
    if v_scale is null or v_scale not in ('sun','moon','rainbow') then
      return jsonb_build_object('ok', false, 'error', 'invalid_scale_value');
    end if;
  end loop;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  -- Grant-Check: User muss selbst einen Legi-Grant im aktuellen Cluster haben.
  if not exists (
    select 1 from user_legi_grants
    where user_id = v_user_id and cluster_id = v_cluster_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_grant');
  end if;

  -- Wenn Variante schon gesetzt: no-op, Progress ist final.
  select variant into v_existing_variant
    from user_legi_path
   where user_id = v_user_id and cluster_id = v_cluster_id;

  if v_existing_variant is not null then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'variant_already_set',
      'variant', v_existing_variant
    );
  end if;

  insert into user_legi_path (user_id, cluster_id, answers, step, updated_at)
  values (v_user_id, v_cluster_id, p_answers, p_step, now())
  on conflict (user_id, cluster_id) do update set
    answers    = excluded.answers,
    step       = excluded.step,
    updated_at = now();

  return jsonb_build_object('ok', true, 'step', p_step);
end;
$$;

revoke all on function save_katze_path_progress(jsonb, int) from public;
grant execute on function save_katze_path_progress(jsonb, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) set_katze_variant(p_variant text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Idempotenter Einmal-Setter. Setzt die finale Variante UND hebt
-- game_state[game16].growth auf mindestens 21 (Stufe 4).
--
-- Guards:
--   • Row muss existieren mit step = 9 (alle 9 Fragen beantwortet)
--   • Wenn variant schon gesetzt → return existing (no-op, keine
--     Growth-Änderung — greatest schützt sowieso)
--   • Doppelklick auf Reveal-Button ist damit safe.
create or replace function set_katze_variant(p_variant text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id     uuid := auth.uid();
  v_cluster_id  uuid;
  v_row         record;
  v_new_growth  int;
  v_target      int := 21;   -- Stufe 4 = GROWTH_THRESHOLDS[4]
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_variant is null or p_variant not in ('rainbow','light','dark') then
    return jsonb_build_object('ok', false, 'error', 'invalid_variant');
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

  select user_id, step, variant, answers, completed_at
    into v_row
  from user_legi_path
  where user_id = v_user_id and cluster_id = v_cluster_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_progress');
  end if;
  if v_row.step <> 9 then
    return jsonb_build_object('ok', false, 'error', 'incomplete');
  end if;

  -- Idempotenz: variant ist unumkehrbar. Wenn schon gesetzt, existing
  -- zurückgeben — auch wenn ein anderer p_variant gewünscht wird.
  if v_row.variant is not null then
    select growth into v_new_growth
      from game_state
     where user_id = v_user_id and game_id = 'game16';
    return jsonb_build_object(
      'ok',      true,
      'skipped', 'variant_already_set',
      'variant', v_row.variant,
      'growth',  coalesce(v_new_growth, 0)
    );
  end if;

  update user_legi_path
     set variant      = p_variant,
         completed_at = now(),
         updated_at   = now()
   where user_id = v_user_id and cluster_id = v_cluster_id;

  -- Growth auf Stufe 4 anheben (nie reduzieren).
  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user_id, 'game16', 0, 0, 'einhornkatze', v_target, 0, now())
  on conflict (user_id, game_id) do update set
    creature   = coalesce(game_state.creature, 'einhornkatze'),
    growth     = greatest(game_state.growth, v_target),
    updated_at = now()
  returning growth into v_new_growth;

  return jsonb_build_object(
    'ok',      true,
    'variant', p_variant,
    'growth',  v_new_growth
  );
end;
$$;

revoke all on function set_katze_variant(text) from public;
grant execute on function set_katze_variant(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) get_my_katze_path() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Boot-Sync: liefert Fortschritt + Variante des aktuellen Users im
-- aktuellen Cluster. Wird von loadServerState() im Frontend nach
-- dem game_state-Fetch aufgerufen.
create or replace function get_my_katze_path()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_row        record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;
  if v_cluster_id is null then
    return jsonb_build_object(
      'ok', true,
      'answers', '[]'::jsonb,
      'step', 0,
      'variant', null,
      'completed_at', null
    );
  end if;

  select answers, step, variant, completed_at
    into v_row
  from user_legi_path
  where user_id = v_user_id and cluster_id = v_cluster_id;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'answers', '[]'::jsonb,
      'step', 0,
      'variant', null,
      'completed_at', null
    );
  end if;

  return jsonb_build_object(
    'ok',           true,
    'answers',      v_row.answers,
    'step',         v_row.step,
    'variant',      v_row.variant,
    'completed_at', v_row.completed_at
  );
end;
$$;

revoke all on function get_my_katze_path() from public;
grant execute on function get_my_katze_path() to authenticated;
