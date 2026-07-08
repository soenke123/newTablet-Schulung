-- ══════════════════════════════════════════════════════════════
-- Migration 0013 — Lootbox-Daily-Merge-Bug fixen
-- ══════════════════════════════════════════════════════════════
-- Bug in Migration 0011: shop_state_merge hat lootboxDailyClaimed
-- zu {slot: true} geplättet. Der Client speichert dort aber ein
-- ISO-Datum ('YYYY-MM-DD') und prüft claimed[slot] === today.
-- Nach jedem Sync stand deshalb wieder true drin → Check schlug
-- fehl → User konnte unbegrenzt Gratis-Lootboxen ziehen.
--
-- Fix: pro Slot-Key das lexikografisch größte (= jüngste) Datum
-- behalten. ISO-Datumsstrings sind sortierbar, also reicht
-- string-max. Wenn ein alter true-Wert noch drinsteht, gewinnt
-- ein echtes Datum vom Client, sobald der User claimt.
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

  -- ── lootboxDailyClaimed (max ISO-Datum pro Slot-Key) ───────
  -- Der Client legt hier 'YYYY-MM-DD' ab und prüft claimed[slot] === today.
  -- Wir nehmen den lexikografisch größten Wert pro Key — für ISO-Daten
  -- entspricht das dem jüngsten Anspruch. Legacy-`true`-Einträge sortieren
  -- kleiner als jedes gültige Datum, werden also vom nächsten echten
  -- Claim überschrieben und stören nicht.
  with kv as (
    select key, max(val) as ts from (
      select k as key, v as val from jsonb_each_text(coalesce(s->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
      union all
      select k, v from jsonb_each_text(coalesce(c->'lootboxDailyClaimed', '{}'::jsonb)) as t(k, v)
    ) all_kv
    group by key
  )
  select coalesce(jsonb_object_agg(key, ts), '{}'::jsonb) into v_lootbox from kv;
  v_out := v_out || jsonb_build_object('lootboxDailyClaimed', v_lootbox);

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
  )
  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_nests from merged_nests;
  v_out := v_out || jsonb_build_object('nests', v_nests);

  return v_out;
end;
$$;

revoke all on function shop_state_merge(jsonb, jsonb) from public;


-- ═════════════════════════════════════════════════════════════
-- Bereits kaputte User-Zustände reparieren
-- ═════════════════════════════════════════════════════════════
-- Für alle Shop-States, in denen lootboxDailyClaimed noch `true`-
-- Werte enthält: den heutigen Tag eintragen. Damit sind bereits
-- eingelöste Slots wieder korrekt gesperrt, statt endlos frei zu
-- bleiben. Slots ohne Eintrag bleiben leer (User hat für die noch
-- nichts eingelöst).
update user_collectibles uc
set value = uc.value || jsonb_build_object(
  'lootboxDailyClaimed',
  (
    select coalesce(jsonb_object_agg(kv.key, to_char(current_date, 'YYYY-MM-DD')), '{}'::jsonb)
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
