-- ══════════════════════════════════════════════════════════════
-- Migration 0042 — Spent-Counter für Consumables
-- ══════════════════════════════════════════════════════════════
-- Fix für Bug: Consumables (Wachstumstrank, Wachstums-Booster,
-- Coins ×3, Glücksklee, Lockmittel) wurden nie tatsächlich
-- reduziert. Alle *Count-Felder laufen server-seitig per
-- max-Merge (greatest). Wenn der Client nach Nutzung 4 → 3
-- sendet, macht der Server greatest(4, 3) = 4 und plättet den
-- Abzug beim nächsten Sync zurück. Ergebnis: „x4" blieb stehen,
-- Item war unendlich nutzbar.
--
-- Lösung analog Migration 0023 (Kristalle):
-- Zu jedem *Count kommt ein *Spent-Counter (monoton wachsend,
-- max-Merge). Client-seitig:
--   - Kauf   → Count++
--   - Nutzen → Spent++
--   - Anzeige = max(0, Count − Spent)
-- Beide Felder monoton → max-Merge tabsicher.
--
-- Migration ist rein additiv: Bestandsuser haben Spent = 0 →
-- effektive Anzeige = Count = heutiger sichtbarer Wert.
--
-- Basis:
--   shop_state_merge → Migration 0030 (lockmittel_count)
--   sync_shop_state  → Migration 0030 (lockmittel_count)
-- ══════════════════════════════════════════════════════════════


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
      'wachstumstrankCount',   greatest(coalesce((s->>'wachstumstrankCount')::int, 0),   coalesce((c->>'wachstumstrankCount')::int, 0)),
      'wachstumsBoosterCount', greatest(coalesce((s->>'wachstumsBoosterCount')::int, 0), coalesce((c->>'wachstumsBoosterCount')::int, 0)),
      'coinsx3Count',          greatest(coalesce((s->>'coinsx3Count')::int, 0),          coalesce((c->>'coinsx3Count')::int, 0)),
      'gluckskleeCount',       greatest(coalesce((s->>'gluckskleeCount')::int, 0),       coalesce((c->>'gluckskleeCount')::int, 0)),
      'lockmittelCount',       greatest(coalesce((s->>'lockmittelCount')::int, 0),       coalesce((c->>'lockmittelCount')::int, 0))
    );

  -- ── Item-Verbrauch (Nutzungen, monoton, max) ──────────────
  -- Analog spentKristalle: Anzeige-balance = Count − Spent.
  v_out := v_out
    || jsonb_build_object(
      'wachstumstrankSpent',   greatest(coalesce((s->>'wachstumstrankSpent')::int, 0),   coalesce((c->>'wachstumstrankSpent')::int, 0)),
      'wachstumsBoosterSpent', greatest(coalesce((s->>'wachstumsBoosterSpent')::int, 0), coalesce((c->>'wachstumsBoosterSpent')::int, 0)),
      'coinsx3Spent',          greatest(coalesce((s->>'coinsx3Spent')::int, 0),          coalesce((c->>'coinsx3Spent')::int, 0)),
      'gluckskleeSpent',       greatest(coalesce((s->>'gluckskleeSpent')::int, 0),       coalesce((c->>'gluckskleeSpent')::int, 0)),
      'lockmittelSpent',       greatest(coalesce((s->>'lockmittelSpent')::int, 0),       coalesce((c->>'lockmittelSpent')::int, 0))
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
-- sync_shop_state: Bereichscheck für Spent-Counter ergänzen
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

  if coalesce((p_state->>'wachstumstrankCount')::int, 0)   not between 0 and 999
  or coalesce((p_state->>'wachstumsBoosterCount')::int, 0) not between 0 and 999
  or coalesce((p_state->>'coinsx3Count')::int, 0)          not between 0 and 999
  or coalesce((p_state->>'gluckskleeCount')::int, 0)       not between 0 and 999
  or coalesce((p_state->>'lockmittelCount')::int, 0)       not between 0 and 999 then
    return jsonb_build_object('ok', false, 'error', 'count_out_of_range');
  end if;

  if coalesce((p_state->>'wachstumstrankSpent')::int, 0)   not between 0 and 999
  or coalesce((p_state->>'wachstumsBoosterSpent')::int, 0) not between 0 and 999
  or coalesce((p_state->>'coinsx3Spent')::int, 0)          not between 0 and 999
  or coalesce((p_state->>'gluckskleeSpent')::int, 0)       not between 0 and 999
  or coalesce((p_state->>'lockmittelSpent')::int, 0)       not between 0 and 999 then
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
