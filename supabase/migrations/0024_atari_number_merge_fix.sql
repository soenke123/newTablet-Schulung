-- ══════════════════════════════════════════════════════════════
-- Migration 0024 — atariNumber-Merge-Bug + Cleanup
-- ══════════════════════════════════════════════════════════════
-- Bug: shop_state_merge nutzte für atariNumber `coalesce(s, c)`.
-- `coalesce` unterscheidet in Postgres SQL NULL nicht von JSON `null`
-- — d.h. sobald der Server einmal `atariNumber: null` persistiert
-- hatte (was beim ersten Shop-Sync vor dem atariHint-Kauf passiert,
-- weil loadShopData den Wert mit ?? null initialisiert), bleibt das
-- Feld für immer null. Auch neu vom Client gesetzte Zahlen werden
-- geplättet, weil `s->'atariNumber'` = jsonb 'null' ≠ SQL NULL →
-- coalesce nimmt den ersten Wert.
--
-- Symptom: 1337.html zeigt bei jedem Reload eine neue Zahl (Client
-- würfelt bei null neu, sync bekommt sie aber nicht persistiert).
--
-- Fix:
--   1. shop_state_merge: nullif(x, 'null'::jsonb) vor coalesce
--   2. Cleanup: bestehende atariNumber-Werte, die kein number sind,
--      aus dem shop_state entfernen — beim nächsten Sync übernimmt
--      der Server dann sauber den Client-Wert.
--
-- WICHTIG: Diese Migration behält alle bisherigen Fixes aus 0013
-- (lootboxDailyClaimed=Datum) und 0023 (spentKristalle, sealedEggs
-- per-type, avatarUnlocks, nests-Filter). Nur die atariNumber-Regel
-- ist neu.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- shop_state_merge — Neuauflage auf Basis 0023, atariNumber gefixt
-- ─────────────────────────────────────────────────────────────
create or replace function shop_state_merge(s jsonb, c jsonb)
  returns jsonb
  immutable
  language plpgsql
as $$
declare
  v_out       jsonb := '{}'::jsonb;
  v_nests     jsonb;
  v_purchased jsonb;
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

  -- ── Item-Zähler (max) ─────────────────────────────────────
  v_out := v_out
    || jsonb_build_object(
      'wachstumstrankCount',   greatest(coalesce((s->>'wachstumstrankCount')::int, 0),   coalesce((c->>'wachstumstrankCount')::int, 0)),
      'wachstumsBoosterCount', greatest(coalesce((s->>'wachstumsBoosterCount')::int, 0), coalesce((c->>'wachstumsBoosterCount')::int, 0)),
      'coinsx3Count',          greatest(coalesce((s->>'coinsx3Count')::int, 0),          coalesce((c->>'coinsx3Count')::int, 0)),
      'gluckskleeCount',       greatest(coalesce((s->>'gluckskleeCount')::int, 0),       coalesce((c->>'gluckskleeCount')::int, 0))
    );

  -- ── Aktive Boost-Flags (client-autoritativ, kurzer Lifecycle) ──
  v_out := v_out
    || jsonb_build_object(
      'wachstumsBooster', coalesce((c->>'wachstumsBooster')::boolean, false),
      'coinsx3',          coalesce((c->>'coinsx3')::boolean,          false),
      'glucksklee',       coalesce((c->>'glucksklee')::boolean,       false)
    );

  -- ── Progress-Flags (OR) ───────────────────────────────────
  v_out := v_out
    || jsonb_build_object(
      'hackUnlocked',    coalesce((s->>'hackUnlocked')::boolean, false)    or coalesce((c->>'hackUnlocked')::boolean, false),
      'atariSolved',     coalesce((s->>'atariSolved')::boolean, false)     or coalesce((c->>'atariSolved')::boolean, false),
      'atariThemeShown', coalesce((s->>'atariThemeShown')::boolean, false) or coalesce((c->>'atariThemeShown')::boolean, false),
      'pfauEggGranted',  coalesce((s->>'pfauEggGranted')::boolean, false)  or coalesce((c->>'pfauEggGranted')::boolean, false)
    );

  -- atariNumber: nicht-null gewinnt (Migration 0024).
  -- nullif zieht JSON null auf SQL NULL runter — sonst friert der
  -- erste null-Sync das Feld ein, weil coalesce jsonb'null' als
  -- "gesetzt" ansieht.
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

  -- ── sealedEggs[] (per type gruppiert, seals elementweise OR) ──
  -- Fix Migration 0023: früher union-distinct auf dem ganzen Objekt,
  -- was Duplikate erzeugte sobald seals[i].hintBought sich änderte.
  with all_pool as (
    select value as egg from jsonb_array_elements(coalesce(s->'sealedEggs', '[]'::jsonb))
    union all
    select value as egg from jsonb_array_elements(coalesce(c->'sealedEggs', '[]'::jsonb))
  ),
  per_type as (
    select
      egg->>'type' as egg_type,
      jsonb_agg(egg) as eggs
    from all_pool
    where egg->>'type' is not null
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
    jsonb_build_object(
      'type',   egg_type,
      'nestId', nest_id,
      'seals',  seals
    )
  ), '[]'::jsonb) into v_seals
  from seals_per_type;
  v_out := v_out || jsonb_build_object('sealedEggs', v_seals);

  -- ── seenCreatures (max pro Key) ───────────────────────────
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

  -- ── sealProgress (max pro Key) ────────────────────────────
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

  -- ── lootboxDailyClaimed (max ISO-Datum pro Slot-Key) ──────
  -- Fix aus Migration 0013 — Client speichert Datumsstring; wir
  -- wollen den zuletzt gesehenen Anspruch pro Slot behalten.
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

  -- ── avatarUnlocks (min pro Key, 0 = unbekannt) ────────────
  with kv as (
    select key,
      case
        when max(is_pos::int) = 0 then 0
        else min(val_bi) filter (where is_pos)
      end as ts
    from (
      select k as key,
             (v)::bigint as val_bi,
             ((v)::bigint > 0) as is_pos
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

  -- ── nests[] (nach nestId gemergt, inkl. hatched-Sub-Objekt) ──
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
    select jsonb_build_object(
      'nestId',   nest_id,
      'eggType',  coalesce(sv->>'eggType',  cv->>'eggType'),
      'gameId',   coalesce(sv->'gameId',    cv->'gameId'),
      'gameUrl',  coalesce(sv->'gameUrl',   cv->'gameUrl'),
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
    ) as n
    from all_nests
    where nest_id is not null
  )
  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_nests from merged_nests;
  v_out := v_out || jsonb_build_object('nests', v_nests);

  return v_out;
end;
$$;

revoke all on function shop_state_merge(jsonb, jsonb) from public;


-- ═════════════════════════════════════════════════════════════
-- Repair 1) atariNumber-Cleanup
-- ═════════════════════════════════════════════════════════════
-- Alte atariNumber-Werte, die kein number sind, aus dem shop_state
-- entfernen. Beim nächsten Sync übernimmt der Server sauber den
-- Client-Wert.
update user_collectibles
set value = value - 'atariNumber'
where key = 'shop_state'
  and value ? 'atariNumber'
  and jsonb_typeof(value->'atariNumber') <> 'number';


-- ═════════════════════════════════════════════════════════════
-- Repair 2) lootboxDailyClaimed-Cleanup (Regression durch fehlerhafte
-- Zwischenversion von 0024)
-- ═════════════════════════════════════════════════════════════
-- Wenn eine frühere, fehlerhafte 0024-Version schon deployt war,
-- hat sie die Lootbox-Slots wieder auf `true` geplättet → User
-- konnten unbegrenzt Gratis-Lootboxen ziehen. Analog Migration
-- 0013: `true`-Werte auf heutigen Tag setzen, damit ausgenutzte
-- Slots sofort wieder gesperrt sind.
update user_collectibles uc
set value = uc.value || jsonb_build_object(
  'lootboxDailyClaimed',
  (
    select coalesce(jsonb_object_agg(
      kv.key,
      case when kv.val = 'true' then to_char(current_date, 'YYYY-MM-DD') else kv.val end
    ), '{}'::jsonb)
    from jsonb_each_text(uc.value->'lootboxDailyClaimed') as kv(key, val)
  )
)
where uc.key = 'shop_state'
  and uc.value ? 'lootboxDailyClaimed'
  and jsonb_typeof(uc.value->'lootboxDailyClaimed') = 'object'
  and exists (
    select 1
    from jsonb_each_text(uc.value->'lootboxDailyClaimed') as kv(key, val)
    where kv.val = 'true'
  );


-- ═════════════════════════════════════════════════════════════
-- Repair 3) sealedEggs-Dedup (Regression durch fehlerhafte
-- Zwischenversion von 0024)
-- ═════════════════════════════════════════════════════════════
-- Analog Backfill aus 0023: gefixte Merge-Funktion idempotent auf
-- den State anwenden, um doppelte sealedEggs pro Typ zu kollabieren.
update user_collectibles uc
set value = shop_state_merge(uc.value, uc.value)
where uc.key = 'shop_state'
  and jsonb_typeof(uc.value->'sealedEggs') = 'array'
  and jsonb_array_length(uc.value->'sealedEggs') > (
    select count(distinct e->>'type')
    from jsonb_array_elements(uc.value->'sealedEggs') as e
    where e->>'type' is not null
  );
