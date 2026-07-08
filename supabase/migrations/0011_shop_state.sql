-- ══════════════════════════════════════════════════════════════
-- Migration 0011 — Shop-State-Sync (lernwelt_shop_v1 → user_collectibles)
-- ══════════════════════════════════════════════════════════════
-- Persistiert den kompletten Shop-Zustand pro User als jsonb-Blob
-- unter user_collectibles.key = 'shop_state'. Damit werden bisher
-- rein gerätelokale Daten multi-device-fähig:
--   Nester, Item-Zähler, Kristalle, bankedCoins, seenCreatures,
--   Codex-Kauf, Atari-/Pfau-/Hack-Flags, Season-2-Siegel/-Progress,
--   lootboxDailyClaimed.
--
-- Nest-Kreaturen (bisher in localStorage['lernwelt_v3']['nest_...'])
-- landen in nests[i].hatched — der Nest-Blob trägt seine geschlüpfte
-- Kreatur mit. Damit sind alle Shop- und Nest-Daten in einem Sync.
--
-- Cheat-Härtung: Bereichs-Checks + Merge-Logik server-seitig
-- (max für Reserven, union für Kollektionen, OR für Flags). Damit
-- kann ein alter Tab-State keine neuen Werte plätten.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- load_shop_state() → jsonb
-- ─────────────────────────────────────────────────────────────
-- Liefert den aktuellen shop_state-Blob des eingeloggten Users
-- oder ein leeres Objekt, wenn noch nichts gespeichert wurde.
create or replace function load_shop_state()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_state   jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select value into v_state
  from user_collectibles
  where user_id = v_user_id and key = 'shop_state';

  return jsonb_build_object('ok', true, 'state', coalesce(v_state, '{}'::jsonb));
end;
$$;

revoke all on function load_shop_state() from public;
grant execute on function load_shop_state() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Helper: shop_state_merge(server, client) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Kombiniert Server- und Client-Blob nach den vereinbarten Regeln.
-- Wird von sync_shop_state aufgerufen. Standalone-Funktion, damit
-- sich die Regeln lokal testen lassen (SELECT shop_state_merge(...)).
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

  -- ── Aktive Boost-Flags (client-autoritativ, kurzer Lifecycle) ──
  v_out := v_out
    || jsonb_build_object(
      'wachstumsBooster', coalesce((c->>'wachstumsBooster')::boolean, false),
      'coinsx3',          coalesce((c->>'coinsx3')::boolean,          false),
      'glucksklee',       coalesce((c->>'glucksklee')::boolean,       false)
    );

  -- ── Progress-Flags (Server OR Client, einmal true → bleibt true) ──
  v_out := v_out
    || jsonb_build_object(
      'hackUnlocked',    coalesce((s->>'hackUnlocked')::boolean, false)    or coalesce((c->>'hackUnlocked')::boolean, false),
      'atariSolved',     coalesce((s->>'atariSolved')::boolean, false)     or coalesce((c->>'atariSolved')::boolean, false),
      'atariThemeShown', coalesce((s->>'atariThemeShown')::boolean, false) or coalesce((c->>'atariThemeShown')::boolean, false),
      'pfauEggGranted',  coalesce((s->>'pfauEggGranted')::boolean, false)  or coalesce((c->>'pfauEggGranted')::boolean, false)
    );
  -- atariNumber: nicht-null gewinnt, sonst client
  v_out := v_out
    || jsonb_build_object(
      'atariNumber', coalesce(s->'atariNumber', c->'atariNumber')
    );

  -- ── Pending-Marker (client-autoritativ, UI-State) ─────────
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

  -- ── sealedEggs[] (Union) ──────────────────────────────────
  select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_seals
  from (
    select jsonb_array_elements(coalesce(s->'sealedEggs', '[]'::jsonb)) as e
    union
    select jsonb_array_elements(coalesce(c->'sealedEggs', '[]'::jsonb)) as e
  ) u;
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

  -- ── lootboxDailyClaimed (Union der Zeitslots, Wert = true) ──
  with kv as (
    select key from (
      select k as key from jsonb_each_text(coalesce(s->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
      union
      select k from jsonb_each_text(coalesce(c->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
    ) all_kv
  )
  select coalesce(jsonb_object_agg(key, true), '{}'::jsonb) into v_lootbox from kv;
  v_out := v_out || jsonb_build_object('lootboxDailyClaimed', v_lootbox);

  -- ── nests[] (nach nestId gemergt, inkl. hatched-Sub-Objekt) ──
  -- Für jede nestId aus (server ∪ client):
  --   Meta-Felder (eggType, gameId, gameUrl): server hat Vorrang wenn vorhanden
  --   hatched: max growth/points/roundsPlayed/coins, creature = coalesce(server, client)
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
-- sync_shop_state(p_state jsonb) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Nimmt den Client-Blob, merged ihn mit dem Server-Zustand und
-- persistiert das Ergebnis. Liefert den gemergten State zurück,
-- damit der Client ihn direkt anwenden kann.
--
-- Cheat-Härtung:
--   - eingeloggt + status='active'
--   - Payload-Größe ≤ 50 KB (Sabotage-Schutz)
--   - Bereichs-Checks auf Reserven und Zähler
--   - Anzahl Nester ≤ 50
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

  -- Sabotage-Schutz: kein 5-MB-Blob durch die RPC
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

  -- ── Bereichs-Checks Client-Werte ─────────────────────────
  if coalesce((p_state->>'spentCoins')::int, 0)  not between 0 and 1000000
  or coalesce((p_state->>'bankedCoins')::int, 0) not between 0 and 100000
  or coalesce((p_state->>'kristalle')::int, 0)   not between 0 and 10000 then
    return jsonb_build_object('ok', false, 'error', 'reserve_out_of_range');
  end if;

  if coalesce((p_state->>'wachstumstrankCount')::int, 0)   not between 0 and 999
  or coalesce((p_state->>'wachstumsBoosterCount')::int, 0) not between 0 and 999
  or coalesce((p_state->>'coinsx3Count')::int, 0)          not between 0 and 999
  or coalesce((p_state->>'gluckskleeCount')::int, 0)       not between 0 and 999 then
    return jsonb_build_object('ok', false, 'error', 'count_out_of_range');
  end if;

  v_nests_ct := coalesce(jsonb_array_length(p_state->'nests'), 0);
  if v_nests_ct > 50 then
    return jsonb_build_object('ok', false, 'error', 'too_many_nests');
  end if;

  -- ── Server-Zustand holen und mergen ──────────────────────
  select value into v_server
  from user_collectibles
  where user_id = v_user_id and key = 'shop_state';

  v_merged := shop_state_merge(v_server, p_state);

  -- ── Upsert ───────────────────────────────────────────────
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
