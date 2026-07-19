-- ══════════════════════════════════════════════════════════════
-- Migration 0044 — Bonbon-Verdienst-Mechanik + 2 neue Shop-Items
-- ══════════════════════════════════════════════════════════════
-- Bisher: wallets.bonbons existiert seit Migration 0032, aber
-- add_bonbons() wird NIRGENDS aufgerufen — der Cluster-Legi ist
-- damit unerreichbar. Diese Migration liefert:
--
--   1) award_game_bonbons(game_id, correct, max_rounds)
--      • Basis-Bonbons = LEAST(correct, 10)  (hubPoints 1:1)
--      • +20 Tages-Bonus bei erster Runde pro Kachel/Tag
--      • Server-authoritatives Tracking via bonbon_daily_claims
--        (Client-Reset unmöglich, Datum in Europe/Berlin)
--      • Ruft add_bonbons(v_total) intern auf → Cluster-Legi-Trigger
--
--   2) reset_daily_bonbon_claims() für Reset-Karte (300 Coins)
--      • Löscht alle Daily-Claim-Marker des Users
--      • Client bucht Verbrauch (resetKarteSpent) selbst — Reset
--        ist harmlos (User verzichtet freiwillig auf eigenen Bonus).
--
--   3) gift_bonbons_to_peer(amount) für Freundschaftskeks (50 Coins)
--      • Wählt zufälligen aktiven anderen Cluster-User
--      • Cap: max 5× pro (giver, cluster) via bonbon_gifts-Audit
--      • Peer-Bonbons zählen zur Cluster-Summe (Cluster-Legi-Trigger)
--
--   4) get_daily_bonbon_status() → Client-Cache für Hub-Kachel-Hint
--
--   5) shop_state_merge + sync_shop_state: 4 neue Keys für
--      resetKarte/freundschaftskeks Count+Spent (Muster aus 0042).
--
-- Basis: Migration 0042 (shop_state_merge + sync_shop_state).
-- Alle Statements idempotent (keine DROPs, DO-Blöcke mit
-- pg_catalog-Checks — Regel aus feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) bonbon_daily_claims — Server-Tracking „erste Runde heute"
-- ─────────────────────────────────────────────────────────────
create table if not exists bonbon_daily_claims (
  user_id     uuid not null references auth.users(id) on delete cascade,
  kachel_key  text not null,
  last_claim  date not null,
  primary key (user_id, kachel_key)
);

create index if not exists bonbon_daily_claims_user_idx
  on bonbon_daily_claims(user_id);

alter table bonbon_daily_claims enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'bonbon_daily_claims'
       and policyname = 'bdc_select_own'
  ) then
    create policy bdc_select_own on bonbon_daily_claims
      for select using (user_id = auth.uid());
  end if;
end $$;

grant select on bonbon_daily_claims to authenticated;

comment on table bonbon_daily_claims is
  'Tracking: welche Kachel hat User heute (Europe/Berlin) schon '
  'für den +20-Bonbon-Bonus geclaimt. Kachel-Key = game_id ODER nest_id.';


-- ─────────────────────────────────────────────────────────────
-- 2) bonbon_gifts — Audit-Log für Freundschaftskeks-Cap
-- ─────────────────────────────────────────────────────────────
create table if not exists bonbon_gifts (
  id           uuid primary key default gen_random_uuid(),
  giver_id     uuid not null references auth.users(id) on delete cascade,
  receiver_id  uuid not null references auth.users(id) on delete cascade,
  cluster_id   uuid not null references clusters(id)   on delete cascade,
  amount       int  not null check (amount > 0),
  created_at   timestamptz not null default now()
);

create index if not exists bonbon_gifts_giver_cluster_idx
  on bonbon_gifts(giver_id, cluster_id);

alter table bonbon_gifts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'bonbon_gifts'
       and policyname = 'bg_select_own'
  ) then
    create policy bg_select_own on bonbon_gifts
      for select using (giver_id = auth.uid());
  end if;
end $$;

grant select on bonbon_gifts to authenticated;

comment on table bonbon_gifts is
  'Audit-Log für Freundschaftskeks-Käufe. Cap = max 5 pro (giver, cluster). '
  'Cluster-Wechsel setzt Budget zurück, weil Zeile pro cluster_id gezählt wird.';


-- ─────────────────────────────────────────────────────────────
-- 3) award_game_bonbons(game_id, correct, max_rounds) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Wird vom Client NACH submit_game_result aufgerufen. Sauber
-- getrennt (Season3_Plan.md:174-Vorgabe).
--
-- Berechnung:
--   base  = LEAST(correct, 10)     — max 10 hubPoints
--   bonus = 20 falls erste Runde heute für diese Kachel, sonst 0
--   total = base + bonus
--
-- Ruft add_bonbons(total) intern auf → dieser bumpt wallets.bonbons
-- und triggert check_and_grant_cluster_legi(). Falls Legi bereits
-- granted ist, macht add_bonbons einen skip.
create or replace function award_game_bonbons(
  p_game_id     text,
  p_correct     int,
  p_max_rounds  int
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session     record;
  v_today       date := (now() at time zone 'Europe/Berlin')::date;
  v_prev_claim  date;
  v_base        int;
  v_bonus       int := 0;
  v_total       int;
  v_add_result  jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_game_id is null or length(p_game_id) = 0 or length(p_game_id) > 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid_game_id');
  end if;
  if p_max_rounds is null or p_max_rounds < 1 or p_max_rounds > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_max_rounds');
  end if;
  if p_correct is null or p_correct < 0 or p_correct > p_max_rounds then
    return jsonb_build_object('ok', false, 'error', 'invalid_correct');
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
  if v_session.season < 3 or v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'not_s3_cluster');
  end if;

  -- Post-Unlock-Guard: sobald User Legi hat, keine weiteren Bonbons
  -- (spiegelt Verhalten aus Migration 0034 für add_bonbons).
  if exists (select 1 from user_legi_grants where user_id = v_user_id) then
    return jsonb_build_object('ok', true, 'skipped', 'legi_already_unlocked');
  end if;

  -- Daily-Check: Datum des letzten Claims lesen, dann setzen/aktualisieren.
  select last_claim into v_prev_claim
    from bonbon_daily_claims
   where user_id = v_user_id and kachel_key = p_game_id;

  if v_prev_claim is null or v_prev_claim < v_today then
    v_bonus := 20;
    insert into bonbon_daily_claims (user_id, kachel_key, last_claim)
    values (v_user_id, p_game_id, v_today)
    on conflict (user_id, kachel_key) do update
      set last_claim = excluded.last_claim;
  end if;

  v_base  := least(p_correct, 10);
  v_total := v_base + v_bonus;

  if v_total <= 0 then
    return jsonb_build_object(
      'ok', true, 'base', v_base, 'bonus', v_bonus, 'awarded', 0
    );
  end if;

  -- Delegation an add_bonbons: dieser bumpt wallets.bonbons und
  -- ruft check_and_grant_cluster_legi() für den Freischalt-Trigger.
  select add_bonbons(v_total) into v_add_result;

  return jsonb_build_object(
    'ok',            true,
    'base',          v_base,
    'bonus',         v_bonus,
    'awarded',       v_total,
    'bonbons_total', v_add_result->'bonbons',
    'cluster',       v_add_result->'cluster'
  );
end;
$$;

revoke all on function award_game_bonbons(text, int, int) from public;
grant execute on function award_game_bonbons(text, int, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) reset_daily_bonbon_claims() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Für Reset-Karte (Shop-Item, 300 Coins). Löscht alle Daily-Bonus-
-- Marker des Users → nächstes Spiel jeder Kachel gibt wieder +20.
-- Server vertraut Client-Kauf-Buchung (Reset ist harmlos — User
-- verzichtet freiwillig auf eigene noch nicht ausgeschöpfte Bonusse).
create or replace function reset_daily_bonbon_claims()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_cleared int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  delete from bonbon_daily_claims where user_id = v_user_id;
  get diagnostics v_cleared = row_count;

  return jsonb_build_object('ok', true, 'cleared', v_cleared);
end;
$$;

revoke all on function reset_daily_bonbon_claims() from public;
grant execute on function reset_daily_bonbon_claims() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) gift_bonbons_to_peer(amount) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Für Freundschaftskeks (Shop-Item, 50 Coins, max 5× pro Cluster).
-- Wählt zufälligen aktiven anderen User im eigenen Cluster und
-- gutschreibt ihm p_amount Bonbons. Käufer sieht Peer-Name im Toast,
-- Peer merkt nichts. Bonbons zählen zur Cluster-Summe (Legi-Trigger).
create or replace function gift_bonbons_to_peer(p_amount int default 20)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id     uuid := auth.uid();
  v_session     record;
  v_gifts_count int;
  v_peer_id     uuid;
  v_peer_name   text;
  v_peer_total  int;
  v_unlock_res  jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 50 then
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
  if v_session.season < 3 or v_session.cluster_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_s3_cluster');
  end if;

  -- Cap: max 5 Geschenke pro (giver, cluster).
  select count(*)::int into v_gifts_count
    from bonbon_gifts
   where giver_id = v_user_id and cluster_id = v_session.cluster_id;

  if v_gifts_count >= 5 then
    return jsonb_build_object(
      'ok', false, 'error', 'cap_exceeded',
      'gifts_count', v_gifts_count, 'cap', 5
    );
  end if;

  -- Zufälliger anderer aktiver Cluster-Kollege.
  select p.id, p.display_name
    into v_peer_id, v_peer_name
    from profiles p
   where p.cluster_id = v_session.cluster_id
     and p.id <> v_user_id
     and p.status = 'active'
   order by random()
   limit 1;

  if v_peer_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_eligible_peer');
  end if;

  -- Bonbons dem Peer gutschreiben (analog add_bonbons-Muster).
  insert into wallets (user_id, coins, bonbons, updated_at)
  values (v_peer_id, 0, p_amount, now())
  on conflict (user_id) do update set
    bonbons    = wallets.bonbons + p_amount,
    updated_at = now()
  returning bonbons into v_peer_total;

  -- Audit-Eintrag.
  insert into bonbon_gifts (giver_id, receiver_id, cluster_id, amount)
  values (v_user_id, v_peer_id, v_session.cluster_id, p_amount);

  -- Cluster-Legi-Trigger (Peer könnte Cluster über Ziel bringen).
  v_unlock_res := check_and_grant_cluster_legi(v_session.cluster_id);

  return jsonb_build_object(
    'ok',                true,
    'peer_display_name', v_peer_name,
    'amount',            p_amount,
    'gifts_count',       v_gifts_count + 1,
    'cap',               5,
    'cluster',           v_unlock_res
  );
end;
$$;

revoke all on function gift_bonbons_to_peer(int) from public;
grant execute on function gift_bonbons_to_peer(int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) get_daily_bonbon_status() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Client-Cache für Hub-Kachel-Hint: welche Kacheln haben den
-- Daily-Bonus heute schon verbraucht?
-- Return: { ok, today: 'YYYY-MM-DD', claims: { kachel_key: date } }
create or replace function get_daily_bonbon_status()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_today   date := (now() at time zone 'Europe/Berlin')::date;
  v_claims  jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(
    jsonb_object_agg(kachel_key, to_char(last_claim, 'YYYY-MM-DD')),
    '{}'::jsonb
  ) into v_claims
  from bonbon_daily_claims
  where user_id = v_user_id
    and last_claim >= (v_today - interval '2 days')::date;

  return jsonb_build_object(
    'ok',     true,
    'today',  to_char(v_today, 'YYYY-MM-DD'),
    'claims', v_claims
  );
end;
$$;

revoke all on function get_daily_bonbon_status() from public;
grant execute on function get_daily_bonbon_status() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) shop_state_merge — KOPIE aus 0042 + 4 neue Keys
-- ─────────────────────────────────────────────────────────────
-- KRITISCH (feedback_shop_state_merge_regressions): NICHT aus
-- alter Migration kopieren. Basis ist 0042 komplett übernommen,
-- neue Zeilen für resetKarte + freundschaftskeks ergänzt.
create or replace function shop_state_merge(s jsonb, c jsonb)
  returns jsonb
  immutable
  language plpgsql
as $$
declare
  v_out       jsonb := '{}'::jsonb;
  v_nests     jsonb;
  v_purchased jsonb;
  v_opened    jsonb;
  v_seen      jsonb;
  v_seals     jsonb;
  v_seal_prog jsonb;
  v_lootbox   jsonb;
  v_avatars   jsonb;
begin
  if s is null then s := '{}'::jsonb; end if;
  if c is null then c := '{}'::jsonb; end if;

  -- ── Reserven (max) ────────────────────────────────────────
  v_out := v_out
    || jsonb_build_object(
      'spentCoins',     greatest(coalesce((s->>'spentCoins')::int, 0),     coalesce((c->>'spentCoins')::int, 0)),
      'bankedCoins',    greatest(coalesce((s->>'bankedCoins')::int, 0),    coalesce((c->>'bankedCoins')::int, 0)),
      'kristalle',      greatest(coalesce((s->>'kristalle')::int, 0),      coalesce((c->>'kristalle')::int, 0)),
      'spentKristalle', greatest(coalesce((s->>'spentKristalle')::int, 0), coalesce((c->>'spentKristalle')::int, 0))
    );

  -- ── Item-Zähler (Käufe, monoton, max) ─────────────────────
  v_out := v_out
    || jsonb_build_object(
      'wachstumstrankCount',    greatest(coalesce((s->>'wachstumstrankCount')::int, 0),    coalesce((c->>'wachstumstrankCount')::int, 0)),
      'wachstumsBoosterCount',  greatest(coalesce((s->>'wachstumsBoosterCount')::int, 0),  coalesce((c->>'wachstumsBoosterCount')::int, 0)),
      'coinsx3Count',           greatest(coalesce((s->>'coinsx3Count')::int, 0),           coalesce((c->>'coinsx3Count')::int, 0)),
      'gluckskleeCount',        greatest(coalesce((s->>'gluckskleeCount')::int, 0),        coalesce((c->>'gluckskleeCount')::int, 0)),
      'lockmittelCount',        greatest(coalesce((s->>'lockmittelCount')::int, 0),        coalesce((c->>'lockmittelCount')::int, 0)),
      'resetKarteCount',        greatest(coalesce((s->>'resetKarteCount')::int, 0),        coalesce((c->>'resetKarteCount')::int, 0)),
      'freundschaftskeksCount', greatest(coalesce((s->>'freundschaftskeksCount')::int, 0), coalesce((c->>'freundschaftskeksCount')::int, 0))
    );

  -- ── Item-Verbrauch (Nutzungen, monoton, max) ──────────────
  v_out := v_out
    || jsonb_build_object(
      'wachstumstrankSpent',    greatest(coalesce((s->>'wachstumstrankSpent')::int, 0),    coalesce((c->>'wachstumstrankSpent')::int, 0)),
      'wachstumsBoosterSpent',  greatest(coalesce((s->>'wachstumsBoosterSpent')::int, 0),  coalesce((c->>'wachstumsBoosterSpent')::int, 0)),
      'coinsx3Spent',           greatest(coalesce((s->>'coinsx3Spent')::int, 0),           coalesce((c->>'coinsx3Spent')::int, 0)),
      'gluckskleeSpent',        greatest(coalesce((s->>'gluckskleeSpent')::int, 0),        coalesce((c->>'gluckskleeSpent')::int, 0)),
      'lockmittelSpent',        greatest(coalesce((s->>'lockmittelSpent')::int, 0),        coalesce((c->>'lockmittelSpent')::int, 0)),
      'resetKarteSpent',        greatest(coalesce((s->>'resetKarteSpent')::int, 0),        coalesce((c->>'resetKarteSpent')::int, 0)),
      'freundschaftskeksSpent', greatest(coalesce((s->>'freundschaftskeksSpent')::int, 0), coalesce((c->>'freundschaftskeksSpent')::int, 0))
    );

  -- ── Aktive Boost-Flags (client-autoritativ) ──────────────
  v_out := v_out
    || jsonb_build_object(
      'wachstumsBooster', coalesce((c->>'wachstumsBooster')::boolean, false),
      'coinsx3',          coalesce((c->>'coinsx3')::boolean,          false),
      'glucksklee',       coalesce((c->>'glucksklee')::boolean,       false),
      'lockmittel',       coalesce((c->>'lockmittel')::boolean,       false)
    );

  -- ── Progress-Flags (OR) ───────────────────────────────────
  v_out := v_out
    || jsonb_build_object(
      'hackUnlocked',    coalesce((s->>'hackUnlocked')::boolean, false)    or coalesce((c->>'hackUnlocked')::boolean, false),
      'atariSolved',     coalesce((s->>'atariSolved')::boolean, false)     or coalesce((c->>'atariSolved')::boolean, false),
      'atariThemeShown', coalesce((s->>'atariThemeShown')::boolean, false) or coalesce((c->>'atariThemeShown')::boolean, false),
      'pfauEggGranted',  coalesce((s->>'pfauEggGranted')::boolean, false)  or coalesce((c->>'pfauEggGranted')::boolean, false)
    );

  v_out := v_out
    || jsonb_build_object(
      'atariNumber', coalesce(
        nullif(s->'atariNumber', 'null'::jsonb),
        nullif(c->'atariNumber', 'null'::jsonb)
      )
    );

  -- ── Pending-Marker (client-autoritativ) ───────────────────
  v_out := v_out
    || jsonb_build_object(
      'pendingEggNestId', c->'pendingEggNestId',
      'pendingBackup',    c->'pendingBackup'
    );

  -- ── purchased[] (Union) ───────────────────────────────────
  select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_purchased
  from (
    select jsonb_array_elements(coalesce(s->'purchased', '[]'::jsonb)) as e
    union
    select jsonb_array_elements(coalesce(c->'purchased', '[]'::jsonb)) as e
  ) u;
  v_out := v_out || jsonb_build_object('purchased', v_purchased);

  -- ── openedSealTypes[] (Union, monoton) ────────────────────
  select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_opened
  from (
    select jsonb_array_elements(coalesce(s->'openedSealTypes', '[]'::jsonb)) as e
    union
    select jsonb_array_elements(coalesce(c->'openedSealTypes', '[]'::jsonb)) as e
  ) u;
  v_out := v_out || jsonb_build_object('openedSealTypes', v_opened);

  -- ── sealedEggs[] ─────────────────────────────────────────
  with all_pool as (
    select value as egg from jsonb_array_elements(coalesce(s->'sealedEggs', '[]'::jsonb))
    union all
    select value as egg from jsonb_array_elements(coalesce(c->'sealedEggs', '[]'::jsonb))
  ),
  opened_set as (
    select jsonb_array_elements_text(v_opened) as t
  ),
  per_type as (
    select egg->>'type' as egg_type, jsonb_agg(egg) as eggs
    from all_pool
    where egg->>'type' is not null
      and (egg->>'type') not in (select t from opened_set)
    group by egg->>'type'
  ),
  seals_per_type as (
    select
      pt.egg_type,
      (select e->'nestId'
         from jsonb_array_elements(pt.eggs) as e
         where e ? 'nestId' and jsonb_typeof(e->'nestId') <> 'null'
         limit 1) as nest_id,
      (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'hintBought', coalesce((select bool_or(coalesce((e->'seals'->i->>'hintBought')::boolean, false))
                                      from jsonb_array_elements(pt.eggs) as e), false),
            'solved',     coalesce((select bool_or(coalesce((e->'seals'->i->>'solved')::boolean, false))
                                      from jsonb_array_elements(pt.eggs) as e), false)
          )
          order by i
        ), '[]'::jsonb)
        from generate_series(0, 3) as g(i)
      ) as seals
    from per_type pt
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('type', egg_type, 'nestId', nest_id, 'seals', seals)
  ), '[]'::jsonb) into v_seals
  from seals_per_type;
  v_out := v_out || jsonb_build_object('sealedEggs', v_seals);

  -- ── seenCreatures (max pro Key) ──────────────────────────
  with kv as (
    select key, max((val)::int) as stage from (
      select k as key, v as val from jsonb_each_text(coalesce(s->'seenCreatures', '{}'::jsonb)) as t(k, v)
      union all
      select k, v from jsonb_each_text(coalesce(c->'seenCreatures', '{}'::jsonb)) as t(k, v)
    ) all_kv
    group by key
  )
  select coalesce(jsonb_object_agg(key, stage), '{}'::jsonb) into v_seen from kv;
  v_out := v_out || jsonb_build_object('seenCreatures', v_seen);

  -- ── sealProgress (max pro Key) ───────────────────────────
  with kv as (
    select key, max((val)::int) as prog from (
      select k as key, v as val from jsonb_each_text(coalesce(s->'sealProgress', '{}'::jsonb)) as t(k, v)
      union all
      select k, v from jsonb_each_text(coalesce(c->'sealProgress', '{}'::jsonb)) as t(k, v)
    ) all_kv
    group by key
  )
  select coalesce(jsonb_object_agg(key, prog), '{}'::jsonb) into v_seal_prog from kv;
  v_out := v_out || jsonb_build_object('sealProgress', v_seal_prog);

  -- ── lootboxDailyClaimed (max ISO-Datum pro Slot-Key) ─────
  with kv as (
    select key, max(val) as claimed_at from (
      select k as key, v as val from jsonb_each_text(coalesce(s->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
      union all
      select k, v from jsonb_each_text(coalesce(c->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
    ) all_kv
    where val is not null and val <> ''
    group by key
  )
  select coalesce(jsonb_object_agg(key, claimed_at), '{}'::jsonb) into v_lootbox from kv;
  v_out := v_out || jsonb_build_object('lootboxDailyClaimed', v_lootbox);

  -- ── avatarUnlocks ────────────────────────────────────────
  with kv as (
    select key,
      case
        when max(is_pos::int) = 0 then 0
        else min(val_bi) filter (where is_pos)
      end as ts
    from (
      select k as key, (v)::bigint as val_bi, ((v)::bigint > 0) as is_pos
        from jsonb_each_text(coalesce(s->'avatarUnlocks', '{}'::jsonb)) as t(k, v)
       where v ~ '^-?[0-9]+$'
      union all
      select k, (v)::bigint, ((v)::bigint > 0)
        from jsonb_each_text(coalesce(c->'avatarUnlocks', '{}'::jsonb)) as t(k, v)
       where v ~ '^-?[0-9]+$'
    ) all_kv
    group by key
  )
  select coalesce(jsonb_object_agg(key, ts), '{}'::jsonb) into v_avatars from kv;
  v_out := v_out || jsonb_build_object('avatarUnlocks', v_avatars);

  -- ── nests[] ──────────────────────────────────────────────
  with all_nests as (
    select
      coalesce(sv->>'nestId', cv->>'nestId') as nest_id,
      sv,
      cv
    from (
      select value as sv from jsonb_array_elements(coalesce(s->'nests', '[]'::jsonb))
    ) srv
    full outer join (
      select value as cv from jsonb_array_elements(coalesce(c->'nests', '[]'::jsonb))
    ) cli on (srv.sv->>'nestId') = (cli.cv->>'nestId')
  ),
  merged_nests as (
    select
      case
        when cv is not null and nullif(cv->'gameId', 'null'::jsonb) is null then
          jsonb_build_object(
            'nestId',   nest_id,
            'eggType',  coalesce(cv->>'eggType', sv->>'eggType'),
            'gameId',   null,
            'gameUrl',  null,
            'hatched',  nullif(cv->'hatched', 'null'::jsonb)
          )
        else
          jsonb_build_object(
            'nestId',   nest_id,
            'eggType',  coalesce(sv->>'eggType',  cv->>'eggType'),
            'gameId',   coalesce(
                          nullif(sv->'gameId',  'null'::jsonb),
                          nullif(cv->'gameId',  'null'::jsonb)
                        ),
            'gameUrl',  coalesce(
                          nullif(sv->'gameUrl', 'null'::jsonb),
                          nullif(cv->'gameUrl', 'null'::jsonb)
                        ),
            'hatched',
              case
                when (sv->'hatched') is null and (cv->'hatched') is null then null
                else jsonb_build_object(
                  'creature',     coalesce(sv->'hatched'->>'creature', cv->'hatched'->>'creature'),
                  'growth',       greatest(coalesce((sv->'hatched'->>'growth')::int, 0),       coalesce((cv->'hatched'->>'growth')::int, 0)),
                  'points',       greatest(coalesce((sv->'hatched'->>'points')::int, 0),       coalesce((cv->'hatched'->>'points')::int, 0)),
                  'roundsPlayed', greatest(coalesce((sv->'hatched'->>'roundsPlayed')::int, 0), coalesce((cv->'hatched'->>'roundsPlayed')::int, 0)),
                  'coins',        greatest(coalesce((sv->'hatched'->>'coins')::int, 0),        coalesce((cv->'hatched'->>'coins')::int, 0))
                )
              end
          )
      end as n
    from all_nests
    where nest_id is not null
  )
  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_nests from merged_nests;
  v_out := v_out || jsonb_build_object('nests', v_nests);

  return v_out;
end;
$$;

revoke all on function shop_state_merge(jsonb, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 8) sync_shop_state — Bounds-Check für neue Count/Spent-Keys
-- ─────────────────────────────────────────────────────────────
create or replace function sync_shop_state(p_state jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id  uuid := auth.uid();
  v_session  record;
  v_server   jsonb;
  v_merged   jsonb;
  v_nests_ct int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if octet_length(p_state::text) > 50000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_large');
  end if;

  select id, status into v_session from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  if coalesce((p_state->>'spentCoins')::int, 0)     not between 0 and 1000000
  or coalesce((p_state->>'bankedCoins')::int, 0)    not between 0 and 100000
  or coalesce((p_state->>'kristalle')::int, 0)      not between 0 and 10000
  or coalesce((p_state->>'spentKristalle')::int, 0) not between 0 and 10000 then
    return jsonb_build_object('ok', false, 'error', 'reserve_out_of_range');
  end if;

  if coalesce((p_state->>'wachstumstrankCount')::int, 0)    not between 0 and 999
  or coalesce((p_state->>'wachstumsBoosterCount')::int, 0)  not between 0 and 999
  or coalesce((p_state->>'coinsx3Count')::int, 0)           not between 0 and 999
  or coalesce((p_state->>'gluckskleeCount')::int, 0)        not between 0 and 999
  or coalesce((p_state->>'lockmittelCount')::int, 0)        not between 0 and 999
  or coalesce((p_state->>'resetKarteCount')::int, 0)        not between 0 and 999
  or coalesce((p_state->>'freundschaftskeksCount')::int, 0) not between 0 and 999 then
    return jsonb_build_object('ok', false, 'error', 'count_out_of_range');
  end if;

  if coalesce((p_state->>'wachstumstrankSpent')::int, 0)    not between 0 and 999
  or coalesce((p_state->>'wachstumsBoosterSpent')::int, 0)  not between 0 and 999
  or coalesce((p_state->>'coinsx3Spent')::int, 0)           not between 0 and 999
  or coalesce((p_state->>'gluckskleeSpent')::int, 0)        not between 0 and 999
  or coalesce((p_state->>'lockmittelSpent')::int, 0)        not between 0 and 999
  or coalesce((p_state->>'resetKarteSpent')::int, 0)        not between 0 and 999
  or coalesce((p_state->>'freundschaftskeksSpent')::int, 0) not between 0 and 999 then
    return jsonb_build_object('ok', false, 'error', 'spent_out_of_range');
  end if;

  v_nests_ct := coalesce(jsonb_array_length(p_state->'nests'), 0);
  if v_nests_ct > 50 then
    return jsonb_build_object('ok', false, 'error', 'too_many_nests');
  end if;

  select value into v_server
  from user_collectibles
  where user_id = v_user_id and key = 'shop_state';

  v_merged := shop_state_merge(v_server, p_state);

  insert into user_collectibles (user_id, key, value, updated_at)
  values (v_user_id, 'shop_state', v_merged, now())
  on conflict (user_id, key) do update set
    value      = excluded.value,
    updated_at = now();

  return jsonb_build_object('ok', true, 'state', v_merged);
end;
$$;

revoke all on function sync_shop_state(jsonb) from public;
grant execute on function sync_shop_state(jsonb) to authenticated;
