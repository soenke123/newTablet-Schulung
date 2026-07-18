-- ══════════════════════════════════════════════════════════════
-- Migration 0036 — Legi-Task „Andere beschenken"
-- ══════════════════════════════════════════════════════════════
-- Erste tatsächliche Task-Mechanik der Einhornkatze (game16).
-- Für 50 Coins verschenkt ein User A eine Wachstumsstufe an einen
-- User B im selben Cluster. B akzeptiert das Geschenk explizit
-- (Annehmen-Klick) — erst dann wird game_state[game16].growth auf
-- den Threshold der N-ten abgeschlossenen Aufgabe gesetzt (Stufe 1
-- = growth 3, Stufe 2 = 7, Stufe 3 = 12 … deckt sich mit
-- GROWTH_THRESHOLDS im Frontend). Pro (Empfänger, Cluster, task_key)
-- kann nur EIN Gift existieren; das macht den Insert atomar via
-- Primary Key und schützt vor Race-Conditions.
--
-- Design-Entscheidungen:
--   • Coin-Deduktion passiert clientseitig NACH erfolgreichem
--     send_gift (dieselbe spentCoins-Semantik wie im Shop). Der
--     Server prüft nur Cluster-Zugehörigkeit + Legi-Grant + PK.
--   • Kein DROP — alle Änderungen idempotent per Catalog-Check
--     (Memory feedback_supabase_no_drop_statements.md).
--   • task_key ist offen für 'friends' und 'win' in späteren
--     Iterationen. accept_gift/send_gift arbeiten task-generisch.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) user_legi_task_gifts — Empfänger-Register pro Task
-- ─────────────────────────────────────────────────────────────
create table if not exists user_legi_task_gifts (
  user_id      uuid not null references auth.users(id) on delete cascade,   -- Empfänger
  cluster_id   uuid not null references clusters(id)   on delete cascade,
  task_key     text not null check (task_key in ('gift','friends','win')),
  giver_id     uuid not null references auth.users(id) on delete cascade,   -- Sender
  sent_at      timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_id, cluster_id, task_key)
);

create index if not exists user_legi_task_gifts_giver_idx
  on user_legi_task_gifts(giver_id);
create index if not exists user_legi_task_gifts_cluster_idx
  on user_legi_task_gifts(cluster_id, task_key);

alter table user_legi_task_gifts enable row level security;

-- Policies idempotent per Catalog-Check anlegen — kein DROP nötig.
do $$
begin
  -- Empfänger dürfen ihre eigene Zeile lesen (für Boot-Sync + Modal).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_legi_task_gifts'
       and policyname = 'ultg_select_own_receipt'
  ) then
    create policy ultg_select_own_receipt on user_legi_task_gifts
      for select using (user_id = auth.uid());
  end if;

  -- Sender dürfen ihre versendeten Gifts sehen (späterer History-Reiter).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_legi_task_gifts'
       and policyname = 'ultg_select_own_send'
  ) then
    create policy ultg_select_own_send on user_legi_task_gifts
      for select using (giver_id = auth.uid());
  end if;

  -- Admins sehen alles (Debug + Ranglisten).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'user_legi_task_gifts'
       and policyname = 'ultg_admin_select_all'
  ) then
    create policy ultg_admin_select_all on user_legi_task_gifts
      for select using (is_admin());
  end if;
end $$;

-- Kein direktes INSERT/UPDATE für authenticated — nur via RPC.
grant select on user_legi_task_gifts to authenticated;

comment on table user_legi_task_gifts is
  'Ein Gift pro (Empfänger, Cluster, task_key). Insert via send_gift, '
  'Update accepted_at via accept_gift. Nie direkt beschreibbar.';


-- ─────────────────────────────────────────────────────────────
-- 2) list_gift_candidates(p_task_key text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Liefert bis zu 3 zufällige Cluster-Peers, die für diesen Task
-- noch KEIN Gift empfangen haben (weder pending noch accepted).
-- Cluster-Mitgliedschaft + aktive Legi-Grant sind Pflicht — Vor-
-- Reveal-Empfänger sind ausdrücklich zugelassen (kein creature-Filter).
--
-- Return: { ok, candidates:[{user_id, display_name, avatar_id}],
--          total_remaining }
-- total_remaining = Anzahl aller noch nicht beschenkten Peers im
-- Cluster (für „Alle haben es erhalten"-Zustand + kleine Cluster).
create or replace function list_gift_candidates(p_task_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id   uuid := auth.uid();
  v_cluster_id uuid;
  v_total     int;
  v_candidates jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_task_key is null or p_task_key not in ('gift','friends','win') then
    return jsonb_build_object('ok', false, 'error', 'invalid_task_key');
  end if;

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

  -- Zählen wie viele Peers insgesamt noch eligible sind
  with eligible as (
    select p.id
    from profiles p
    join user_legi_grants g
      on g.user_id = p.id and g.cluster_id = v_cluster_id
    where p.cluster_id = v_cluster_id
      and p.status     = 'active'
      and p.id       <> v_user_id
      and not exists (
        select 1 from user_legi_task_gifts t
         where t.user_id  = p.id
           and t.cluster_id = v_cluster_id
           and t.task_key = p_task_key
      )
  )
  select count(*) into v_total from eligible;

  -- Bis zu 3 zufällige eligible Kandidaten
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_candidates
  from (
    select p.id           as user_id,
           p.display_name as display_name,
           p.avatar_id    as avatar_id
    from profiles p
    join user_legi_grants g
      on g.user_id = p.id and g.cluster_id = v_cluster_id
    where p.cluster_id = v_cluster_id
      and p.status     = 'active'
      and p.id       <> v_user_id
      and not exists (
        select 1 from user_legi_task_gifts t
         where t.user_id  = p.id
           and t.cluster_id = v_cluster_id
           and t.task_key = p_task_key
      )
    order by random()
    limit 3
  ) x;

  return jsonb_build_object(
    'ok',              true,
    'candidates',      v_candidates,
    'total_remaining', v_total
  );
end;
$$;

revoke all on function list_gift_candidates(text) from public;
grant execute on function list_gift_candidates(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) send_gift(p_recipient_id uuid, p_task_key text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Atomar. Prüft Cluster + Grant beim Sender UND Empfänger. Insert
-- ist via PK race-safe: bei Konflikt → 'already_gifted', Client
-- entfernt den Kandidaten aus seiner lokalen Liste, ohne Coins zu
-- verlieren.
create or replace function send_gift(p_recipient_id uuid, p_task_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_recipient_cluster uuid;
  v_inserted   int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_task_key is null or p_task_key not in ('gift','friends','win') then
    return jsonb_build_object('ok', false, 'error', 'invalid_task_key');
  end if;
  if p_recipient_id is null then
    return jsonb_build_object('ok', false, 'error', 'recipient_required');
  end if;
  if p_recipient_id = v_user_id then
    return jsonb_build_object('ok', false, 'error', 'self_gift');
  end if;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  -- Grant beim Sender
  if not exists (
    select 1 from user_legi_grants
    where user_id = v_user_id and cluster_id = v_cluster_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_grant');
  end if;

  -- Empfänger muss im selben Cluster sein + aktiv + Grant haben
  select cluster_id into v_recipient_cluster
    from profiles where id = p_recipient_id and status = 'active';
  if v_recipient_cluster is null or v_recipient_cluster <> v_cluster_id then
    return jsonb_build_object('ok', false, 'error', 'recipient_not_in_cluster');
  end if;
  if not exists (
    select 1 from user_legi_grants
    where user_id = p_recipient_id and cluster_id = v_cluster_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'recipient_no_grant');
  end if;

  insert into user_legi_task_gifts (user_id, cluster_id, task_key, giver_id, sent_at)
  values (p_recipient_id, v_cluster_id, p_task_key, v_user_id, now())
  on conflict (user_id, cluster_id, task_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_gifted');
  end if;

  return jsonb_build_object('ok', true, 'sent', true);
end;
$$;

revoke all on function send_gift(uuid, text) from public;
grant execute on function send_gift(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) accept_gift(p_task_key text) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Der Empfänger nimmt das Geschenk an. Setzt accepted_at (falls noch
-- null) und setzt game_state[game16].growth auf den Threshold der
-- N-ten abgeschlossenen Aufgabe (1 Aufgabe = growth 3 = Stufe 1,
-- 2 Aufgaben = growth 7 = Stufe 2, 3 Aufgaben = growth 12 = Stufe 3).
-- Deckt sich mit GROWTH_THRESHOLDS im Frontend (creatures.js).
--
-- Wachstum wird auf max = threshold[completed_count] gesetzt, aber
-- NIE reduziert (falls User bereits höheren growth-Wert hat, z.B.
-- durch spätere Iterationen mit anderen Wachstumsquellen).
--
-- Wenn accepted_at bereits gesetzt ist: kein Doppel-Growth (silent
-- skip mit 'already_accepted'). Verhindert Cheat via mehrfachem RPC-
-- Aufruf.
create or replace function accept_gift(p_task_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id     uuid := auth.uid();
  v_cluster_id  uuid;
  v_row         record;
  v_giver_name  text;
  v_new_growth  int;
  v_completed   int;
  -- Stufe-N-Threshold ohne den Stage-0-Wert (der 0 wäre und keinen
  -- Wachstumssprung bringt). Index 1 = Stufe 1 = growth 3, usw.
  v_thresholds  int[] := array[3, 7, 12, 21, 100];
  v_target      int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_task_key is null or p_task_key not in ('gift','friends','win') then
    return jsonb_build_object('ok', false, 'error', 'invalid_task_key');
  end if;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select user_id, cluster_id, task_key, giver_id, sent_at, accepted_at
    into v_row
  from user_legi_task_gifts
  where user_id = v_user_id and cluster_id = v_cluster_id and task_key = p_task_key;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_pending_gift');
  end if;

  select display_name into v_giver_name
    from profiles where id = v_row.giver_id;

  if v_row.accepted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'skipped', 'already_accepted',
      'giver_display_name', v_giver_name
    );
  end if;

  update user_legi_task_gifts
     set accepted_at = now()
   where user_id = v_user_id and cluster_id = v_cluster_id and task_key = p_task_key;

  -- Wie viele Aufgaben hat der User jetzt (inkl. dieser gerade gesetzten)
  -- abgeschlossen? Zählt über alle Cluster hinweg — wenn ein User in
  -- Cluster A alle 3 Aufgaben schafft und dann in Cluster B wechselt,
  -- bleibt die Stufe bestehen.
  select count(*) into v_completed
    from user_legi_task_gifts
    where user_id = v_user_id
      and accepted_at is not null;

  -- Array ist 1-indexed. 1 Aufgabe = 3 (Stufe 1), 2 = 7 (Stufe 2),
  -- 3 = 12 (Stufe 3), 4 = 21 (Stufe 4), 5 = 100 (Stufe 5). Cap bei 5.
  v_target := v_thresholds[least(v_completed, array_length(v_thresholds, 1))];

  -- Growth-Anwendung mit First-Play-Guard (creature-Upsert). Nie
  -- reduzieren — greatest schützt vor Downgrade, falls andere Quellen
  -- den Wert höher gesetzt haben.
  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user_id, 'game16', 0, 0, 'einhornkatze', v_target, 0, now())
  on conflict (user_id, game_id) do update set
    creature   = coalesce(game_state.creature, 'einhornkatze'),
    growth     = greatest(game_state.growth, v_target),
    updated_at = now()
  returning growth into v_new_growth;

  return jsonb_build_object(
    'ok',                 true,
    'accepted',           true,
    'new_growth',         v_new_growth,
    'completed_tasks',    v_completed,
    'giver_display_name', v_giver_name
  );
end;
$$;

revoke all on function accept_gift(text) from public;
grant execute on function accept_gift(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) get_my_gift_tasks() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Boot-Sync: liefert dem Empfänger alle für ihn im aktuellen Cluster
-- existierenden Gifts (pro task_key max. eines) inkl. Sender-
-- display_name. Client cached das als window.__giftTasks.
create or replace function get_my_gift_tasks()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id    uuid := auth.uid();
  v_cluster_id uuid;
  v_tasks      jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select cluster_id into v_cluster_id from profiles where id = v_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'tasks', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_tasks
  from (
    select t.task_key,
           t.giver_id,
           p.display_name as giver_display_name,
           t.sent_at,
           t.accepted_at
    from user_legi_task_gifts t
    left join profiles p on p.id = t.giver_id
    where t.user_id = v_user_id and t.cluster_id = v_cluster_id
  ) x;

  return jsonb_build_object('ok', true, 'tasks', v_tasks);
end;
$$;

revoke all on function get_my_gift_tasks() from public;
grant execute on function get_my_gift_tasks() to authenticated;
