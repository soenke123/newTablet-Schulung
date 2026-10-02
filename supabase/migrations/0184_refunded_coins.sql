-- ═════════════════════════════════════════════════════════════
-- 0184 — Erstattungen als eigener Zähler (refundedCoins)
-- ═════════════════════════════════════════════════════════════
-- Fehler: spentCoins wird beim Server-Merge per greatest() übernommen, kann
-- also nie sinken. Der Client rollte bei „Ei abbrechen" und bei einem
-- fehlgeschlagenen Freundschaftskeks spentCoins lokal zurück. Der Server
-- verwarf das, der Client übernahm beim nächsten Sync den höheren Wert
-- wieder. Wer zwischen Abbruch und Sync erneut kaufte (Ei kaufen → abbrechen
-- → Ei kaufen …), sah lokal ein ausreichendes Guthaben, während auf dem
-- Server jeder Kauf zählte. Folge: spentCoins ≫ Einnahmen, negatives
-- Guthaben, und weil keine Münzen mehr „gedeckt" waren, kürzte 0183 Items
-- und Kristalle auf das Gratis-Tagesbudget.
--
-- Lösung nach dem Muster von spentKristalle (0023): auch die Erstattung
-- wächst nur.   verfügbar = Einnahmen − (spentCoins − refundedCoins)
--
--   1) shop_state_merge: refundedCoins per max, sonst unverändert
--      (0059-Funktion bleibt als _shop_state_merge_v59 erhalten).
--   2) sync_shop_state: Erstattung ≤ spentCoins; ihr Zuwachs belastet das
--      Tagesbudget der Münz-Quellen; die Münz-Deckung rechnet netto.
-- ═════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_proc where proname = '_shop_state_merge_v59') then
    alter function shop_state_merge(jsonb, jsonb) rename to _shop_state_merge_v59;
  end if;
end $$;

revoke all on function _shop_state_merge_v59(jsonb, jsonb) from public;

create or replace function shop_state_merge(s jsonb, c jsonb)
  returns jsonb
  immutable
  language sql
as $$
  select _shop_state_merge_v59(s, c)
      || jsonb_build_object(
           'refundedCoins',
           greatest(coalesce((s->>'refundedCoins')::int, 0),
                    coalesce((c->>'refundedCoins')::int, 0)))
$$;

revoke all on function shop_state_merge(jsonb, jsonb) from public;


-- sync_shop_state — Basis 0183, ergänzt um refundedCoins (Netto-Ausgaben)
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

  -- Budget
  v_day          date := (now() at time zone 'Europe/Berlin')::date;
  v_used         record;
  v_lim_k        int;
  v_lim_c        int;
  v_lim_i        int;
  v_tol          int;
  v_game_coins   int;
  v_free         int;
  v_credit       int;   -- durch Münz-Ausgaben gedeckter Zuwachs (in 🪙)
  v_flags        jsonb := '[]'::jsonb;

  -- Münz-Quellen (bankedCoins + Nest-Münzen)
  v_bank_s       int;
  v_bank_m       int;
  v_released     int := 0;
  v_src_gain     int := 0;
  v_src_allowed  int;
  v_src_left     int;
  v_nest         jsonb;
  v_idx          int;
  v_nest_s       int;
  v_nest_m       int;
  v_take         int;
  v_src_booked   int := 0;

  -- Münz-Deckung
  v_spent_s      int;
  v_spent_m      int;
  v_backing      int;

  -- Erstattungen (0184)
  v_ref_s        int;
  v_ref_m        int;
  v_ref_gain     int := 0;

  -- Kristalle
  v_k_s          int;
  v_k_m          int;
  v_k_gain       int;
  v_k_free_used  int;
  v_k_from_coins int;

  -- Items
  v_item_keys    text[] := array[
    'wachstumstrankCount', 'wachstumsBoosterCount', 'coinsx3Count',
    'gluckskleeCount', 'lockmittelCount', 'resetKarteCount',
    'freundschaftskeksCount'];
  v_key          text;
  v_i_gain_total int := 0;
  v_i_left       int;
  v_i_free_used  int;
  v_i_gain       int;
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
  or coalesce((p_state->>'refundedCoins')::int, 0)  not between 0 and 1000000
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

  -- Zeile sperren: zwei Tabs gleichzeitig dürfen das Budget nicht doppelt nutzen
  select value into v_server
  from user_collectibles
  where user_id = v_user_id and key = 'shop_state'
  for update;

  v_merged := shop_state_merge(v_server, p_state);
  v_server := coalesce(v_server, '{}'::jsonb);

  -- Erstattungen: nie mehr als die brutto ausgegebenen Münzen. Der Zuwachs
  -- zählt wie bankedCoins zum Tagesbudget der Münz-Quellen (siehe (a)) —
  -- sonst ließe sich spentCoins per refundedCoins beliebig wegschreiben.
  v_ref_s    := least(_ji(v_server, 'refundedCoins'), _ji(v_server, 'spentCoins'));
  v_ref_m    := least(_ji(v_merged, 'refundedCoins'), _ji(v_merged, 'spentCoins'));
  v_ref_gain := greatest(v_ref_m - v_ref_s, 0);

  -- ── Budget ────────────────────────────────────────────────
  select coalesce(max(value) filter (where key = 'kristalle_per_day'),    300),
         coalesce(max(value) filter (where key = 'coin_sources_per_day'), 3000),
         coalesce(max(value) filter (where key = 'items_per_day'),        40),
         coalesce(max(value) filter (where key = 'overspend_tolerance'),  100)
    into v_lim_k, v_lim_c, v_lim_i, v_tol
    from economy_limits;

  insert into shop_daily_gains (user_id, day) values (v_user_id, v_day)
  on conflict (user_id, day) do nothing;
  select kristalle, coin_sources, items into v_used
    from shop_daily_gains
   where user_id = v_user_id and day = v_day
   for update;

  -- (a) Münz-Quellen: bankedCoins + Münzen in Nestern.
  --     Freigelassene Nester (im Server-Stand, im Merge nicht mehr da)
  --     sind Umbuchung Nest → Bank und zählen nicht als Zuwachs.
  v_bank_s := _ji(v_server, 'bankedCoins');
  v_bank_m := _ji(v_merged, 'bankedCoins');

  select coalesce(sum(_ji(sn->'hatched', 'coins')), 0)::int into v_released
    from jsonb_array_elements(coalesce(v_server->'nests', '[]'::jsonb)) sn
   where not exists (
     select 1 from jsonb_array_elements(coalesce(v_merged->'nests', '[]'::jsonb)) mn
      where mn->>'nestId' = sn->>'nestId');

  v_src_gain := greatest(v_bank_m - v_bank_s, 0) + v_ref_gain;
  for v_idx in 0 .. coalesce(jsonb_array_length(v_merged->'nests'), 0) - 1 loop
    v_nest   := v_merged->'nests'->v_idx;
    v_nest_m := _ji(v_nest->'hatched', 'coins');
    select coalesce(max(_ji(sn->'hatched', 'coins')), 0)::int into v_nest_s
      from jsonb_array_elements(coalesce(v_server->'nests', '[]'::jsonb)) sn
     where sn->>'nestId' = v_nest->>'nestId';
    v_src_gain := v_src_gain + greatest(v_nest_m - v_nest_s, 0);
  end loop;

  v_free        := greatest(v_lim_c - v_used.coin_sources, 0);
  v_src_allowed := v_free + v_released;

  if v_src_gain > v_src_allowed then
    v_flags := v_flags || jsonb_build_object(
      'what', 'coin_sources', 'gain', v_src_gain,
      'allowed', v_src_allowed, 'used_today', v_used.coin_sources);

    -- Erlaubtes zuerst auf die Bank, Rest auf die Nester in Reihenfolge
    v_src_left := v_src_allowed;
    v_take     := least(greatest(v_bank_m - v_bank_s, 0), v_src_left);
    v_bank_m   := v_bank_s + v_take;
    v_src_left := v_src_left - v_take;
    v_merged   := jsonb_set(v_merged, '{bankedCoins}', to_jsonb(v_bank_m));

    for v_idx in 0 .. coalesce(jsonb_array_length(v_merged->'nests'), 0) - 1 loop
      v_nest   := v_merged->'nests'->v_idx;
      if v_nest->'hatched' is null or jsonb_typeof(v_nest->'hatched') <> 'object' then
        continue;
      end if;
      v_nest_m := _ji(v_nest->'hatched', 'coins');
      select coalesce(max(_ji(sn->'hatched', 'coins')), 0)::int into v_nest_s
        from jsonb_array_elements(coalesce(v_server->'nests', '[]'::jsonb)) sn
       where sn->>'nestId' = v_nest->>'nestId';
      if v_nest_m > v_nest_s then
        v_take     := least(v_nest_m - v_nest_s, v_src_left);
        v_src_left := v_src_left - v_take;
        v_merged   := jsonb_set(v_merged,
                        array['nests', v_idx::text, 'hatched', 'coins'],
                        to_jsonb(v_nest_s + v_take));
      end if;
    end loop;
    -- Rest auf die Erstattung (zuletzt: Spielmünzen gehen vor)
    if v_ref_gain > 0 then
      v_take     := least(v_ref_gain, v_src_left);
      v_src_left := v_src_left - v_take;
      v_ref_m    := v_ref_s + v_take;
    end if;
    v_src_booked := v_src_allowed - v_src_left;
  else
    v_src_booked := v_src_gain;
  end if;
  -- Nur der Teil über der Umbuchung belastet das Tagesbudget
  v_src_booked := greatest(v_src_booked - v_released, 0);

  -- (b) Münz-Deckung: spentCoins darf den Münzbestand nicht übersteigen.
  --     Bestand = Spiele (game_state) + Bank + Nester (nach Kappung).
  select coalesce(sum(coins), 0)::int into v_game_coins
    from game_state where user_id = v_user_id;

  v_backing := v_game_coins + _ji(v_merged, 'bankedCoins');
  select v_backing + coalesce(sum(_ji(n->'hatched', 'coins')), 0)::int into v_backing
    from jsonb_array_elements(coalesce(v_merged->'nests', '[]'::jsonb)) n;

  -- Netto-Ausgaben: spentCoins wächst nur, Erstattungen stehen separat
  v_merged  := jsonb_set(v_merged, '{refundedCoins}', to_jsonb(v_ref_m));
  v_spent_s := _ji(v_server, 'spentCoins') - v_ref_s;
  v_spent_m := _ji(v_merged, 'spentCoins') - v_ref_m;

  if v_spent_m > v_backing + v_tol then
    v_flags := v_flags || jsonb_build_object(
      'what', 'coin_overspend', 'spent', v_spent_m, 'backing', v_backing);
  end if;
  -- Nur gedeckte Ausgaben zählen als Kaufkraft für Kristalle/Items
  v_credit := greatest(least(v_spent_m, v_backing + v_tol) - v_spent_s, 0);

  -- (c) Kristalle: Gratis-Budget + Tausch (6 🪙 je 💎, bester Kurs 60 → 10)
  v_k_s    := _ji(v_server, 'kristalle');
  v_k_m    := _ji(v_merged, 'kristalle');
  v_k_gain := greatest(v_k_m - v_k_s, 0);
  v_free   := greatest(v_lim_k - v_used.kristalle, 0);

  v_k_free_used  := least(v_k_gain, v_free);
  v_k_from_coins := least(v_k_gain - v_k_free_used, v_credit / 6);
  v_credit       := v_credit - v_k_from_coins * 6;

  if v_k_free_used + v_k_from_coins < v_k_gain then
    v_flags := v_flags || jsonb_build_object(
      'what', 'kristalle', 'gain', v_k_gain,
      'allowed', v_k_free_used + v_k_from_coins, 'used_today', v_used.kristalle);
    v_merged := jsonb_set(v_merged, '{kristalle}',
                  to_jsonb(v_k_s + v_k_free_used + v_k_from_coins));
  end if;

  -- (d) Item-Zähler: Gratis-Budget + Kauf (billigstes Item 5 🪙)
  foreach v_key in array v_item_keys loop
    v_i_gain_total := v_i_gain_total
                    + greatest(_ji(v_merged, v_key) - _ji(v_server, v_key), 0);
  end loop;
  v_free        := greatest(v_lim_i - v_used.items, 0);
  v_i_free_used := least(v_i_gain_total, v_free);
  v_i_left      := v_i_free_used + least(v_i_gain_total - v_i_free_used, v_credit / 5);

  if v_i_left < v_i_gain_total then
    v_flags := v_flags || jsonb_build_object(
      'what', 'items', 'gain', v_i_gain_total,
      'allowed', v_i_left, 'used_today', v_used.items);
    foreach v_key in array v_item_keys loop
      v_i_gain := greatest(_ji(v_merged, v_key) - _ji(v_server, v_key), 0);
      if v_i_gain > 0 then
        v_take   := least(v_i_gain, v_i_left);
        v_i_left := v_i_left - v_take;
        v_merged := jsonb_set(v_merged, array[v_key],
                      to_jsonb(_ji(v_server, v_key) + v_take));
      end if;
    end loop;
  end if;

  update shop_daily_gains
     set kristalle    = kristalle    + v_k_free_used,
         coin_sources = coin_sources + v_src_booked,
         items        = items        + v_i_free_used
   where user_id = v_user_id and day = v_day;

  if jsonb_array_length(v_flags) > 0 then
    perform log_cheat_flag(v_user_id, null, 'shop_budget',
      jsonb_build_object('day', v_day, 'details', v_flags));
  end if;

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
