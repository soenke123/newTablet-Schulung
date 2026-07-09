-- ══════════════════════════════════════════════════════════════
-- Migration 0024 — atariNumber-Merge-Bug + Cleanup
-- ══════════════════════════════════════════════════════════════
-- Bug: shop_state_merge nutzt für atariNumber `coalesce(s, c)`.
-- coalesce trennt in Postgres SQL NULL von JSON `null` nicht — d.h.
-- sobald der Server einmal `atariNumber: null` (JSON null) persistiert
-- hatte (z.B. durch den ersten Shop-Sync vor dem atariHint-Kauf, wo
-- loadShopData den Wert mit ?? null initialisiert), bleibt der Wert
-- danach für immer null. Auch neu vom Client gesetzte Zahlen werden
-- durch den Merge geplättet, weil `s->'atariNumber'` = jsonb 'null'
-- ≠ SQL NULL → coalesce nimmt den ersten Wert.
--
-- Symptom: 1337.html zeigt bei jedem Reload eine neue Zahl (der
-- Client würfelt bei null neu, aber der Sync bekommt sie nicht
-- persistiert).
--
-- Fix:
--   1. shop_state_merge: nullif(x, 'null'::jsonb) vor coalesce, damit
--      JSON null als "leer" gilt und der Client-Wert übernommen wird.
--   2. Cleanup: bestehende `atariNumber: null`-Einträge aus dem
--      shop_state-Blob entfernen (Key raus) — beim nächsten Sync
--      übernimmt der Server dann sauber den Client-Wert.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) shop_state_merge — Neuauflage mit gefixter atariNumber-Regel
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
begin
  if s is null then s := '{}'::jsonb; end if;
  if c is null then c := '{}'::jsonb; end if;

  -- ── Reserven (max) ────────────────────────────────────────
  v_out := v_out
    || jsonb_build_object(
      'spentCoins',  greatest(coalesce((s->>'spentCoins')::int, 0),  coalesce((c->>'spentCoins')::int, 0)),
      'bankedCoins', greatest(coalesce((s->>'bankedCoins')::int, 0), coalesce((c->>'bankedCoins')::int, 0)),
      'kristalle',   greatest(coalesce((s->>'kristalle')::int, 0),   coalesce((c->>'kristalle')::int, 0))
    );

  -- ── Item-Zähler (max) ─────────────────────────────────────
  v_out := v_out
    || jsonb_build_object(
      'wachstumstrankCount',   greatest(coalesce((s->>'wachstumstrankCount')::int, 0),   coalesce((c->>'wachstumstrankCount')::int, 0)),
      'wachstumsBoosterCount', greatest(coalesce((s->>'wachstumsBoosterCount')::int, 0), coalesce((c->>'wachstumsBoosterCount')::int, 0)),
      'coinsx3Count',          greatest(coalesce((s->>'coinsx3Count')::int, 0),          coalesce((c->>'coinsx3Count')::int, 0)),
      'gluckskleeCount',       greatest(coalesce((s->>'gluckskleeCount')::int, 0),       coalesce((c->>'gluckskleeCount')::int, 0))
    );

  -- ── Aktive Boost-Flags (client-autoritativ) ──────────────
  v_out := v_out
    || jsonb_build_object(
      'wachstumsBooster', coalesce((c->>'wachstumsBooster')::boolean, false),
      'coinsx3',          coalesce((c->>'coinsx3')::boolean,          false),
      'glucksklee',       coalesce((c->>'glucksklee')::boolean,       false)
    );

  -- ── Progress-Flags (Server OR Client) ────────────────────
  v_out := v_out
    || jsonb_build_object(
      'hackUnlocked',    coalesce((s->>'hackUnlocked')::boolean, false)    or coalesce((c->>'hackUnlocked')::boolean, false),
      'atariSolved',     coalesce((s->>'atariSolved')::boolean, false)     or coalesce((c->>'atariSolved')::boolean, false),
      'atariThemeShown', coalesce((s->>'atariThemeShown')::boolean, false) or coalesce((c->>'atariThemeShown')::boolean, false),
      'pfauEggGranted',  coalesce((s->>'pfauEggGranted')::boolean, false)  or coalesce((c->>'pfauEggGranted')::boolean, false)
    );

  -- atariNumber: nicht-null gewinnt (JSON null == leer, sonst Server > Client)
  -- Ohne nullif würde JSON null das Feld für immer festhalten, weil
  -- coalesce SQL NULL ≠ JSON null behandelt.
  v_out := v_out
    || jsonb_build_object(
      'atariNumber', coalesce(
        nullif(s->'atariNumber', 'null'::jsonb),
        nullif(c->'atariNumber', 'null'::jsonb)
      )
    );

  -- ── Pending-Marker (client-autoritativ) ──────────────────
  v_out := v_out
    || jsonb_build_object(
      'pendingEggNestId', c->'pendingEggNestId',
      'pendingBackup',    c->'pendingBackup'
    );

  -- ── purchased[] (Union) ──────────────────────────────────
  select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_purchased
  from (
    select jsonb_array_elements(coalesce(s->'purchased', '[]'::jsonb)) as e
    union
    select jsonb_array_elements(coalesce(c->'purchased', '[]'::jsonb)) as e
  ) u;
  v_out := v_out || jsonb_build_object('purchased', v_purchased);

  -- ── sealedEggs[] (Union) ─────────────────────────────────
  select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_seals
  from (
    select jsonb_array_elements(coalesce(s->'sealedEggs', '[]'::jsonb)) as e
    union
    select jsonb_array_elements(coalesce(c->'sealedEggs', '[]'::jsonb)) as e
  ) u;
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

  -- ── lootboxDailyClaimed (Union der Zeitslots) ────────────
  with kv as (
    select key from (
      select k as key from jsonb_each_text(coalesce(s->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
      union
      select k from jsonb_each_text(coalesce(c->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
    ) all_kv
  )
  select coalesce(jsonb_object_agg(key, true), '{}'::jsonb) into v_lootbox from kv;
  v_out := v_out || jsonb_build_object('lootboxDailyClaimed', v_lootbox);

  -- ── nests[] (nach nestId gemergt, inkl. hatched) ─────────
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
  )
  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_nests from merged_nests;
  v_out := v_out || jsonb_build_object('nests', v_nests);

  return v_out;
end;
$$;

revoke all on function shop_state_merge(jsonb, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 2) Cleanup: alte "atariNumber: null"-Einträge komplett entfernen
-- ─────────────────────────────────────────────────────────────
-- Ohne Cleanup würde der Merge zwar zukünftig funktionieren, aber
-- das gefixte nullif greift nur, wenn der Wert wirklich JSON null
-- ist. Falls der Client versehentlich mal ein Objekt/String
-- reinschreibt, hätten wir Legacy-Zustände. Sicherheitshalber: Key
-- raus, wenn der Wert kein number ist.
update user_collectibles
set value = value - 'atariNumber'
where key = 'shop_state'
  and value ? 'atariNumber'
  and jsonb_typeof(value->'atariNumber') <> 'number';
