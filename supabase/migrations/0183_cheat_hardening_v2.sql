-- ══════════════════════════════════════════════════════════════
-- Migration 0183 — Cheat-Härtung v2 (nach dem „helium"-Pentest)
-- ══════════════════════════════════════════════════════════════
-- Sönke, 30.09.2026: Ein Schüler hat mit Erlaubnis versucht, die
-- Plattform zu manipulieren. Ergebnis der Auswertung:
--
--   • sync_game_state hat gehalten (62× delta_cap / rate_limit, alle
--     abgelehnt, Wallet sauber).
--   • upsert_highscore nahm jeden Wert bis 1 Mrd an — auch für Spiele
--     ohne Bestenliste (game3/7/8 standen danach mit 999999 drin).
--   • sync_shop_state vertraute dem Client: Max-Merge übernimmt jeden
--     höheren Wert für kristalle / bankedCoins / Item-Zähler, solange
--     er unter den absoluten Obergrenzen lag (906 💎, 95 600 🪙 in ~1 h).
--
-- Zusätzlich offen, aber (laut Auswertung) nicht genutzt:
--   • profiles_insert_self: wer sich per supabase.auth.signUp direkt
--     einen Auth-User anlegt, hätte sich ein Profil mit
--     is_superadmin = true einfügen können. Das Profil legt ohnehin
--     nur /api/signup (service_role) an → Policy + Grant weg.
--   • uc_write_own: user_collectibles war direkt per REST schreibbar
--     (inkl. shop_state). Der Client liest dort nur; geschrieben wird
--     ausschließlich über SECURITY-DEFINER-RPCs → Policy + Grants weg.
--
-- Was diese Migration macht:
--   1) Rechte: profiles-INSERT und user_collectibles-Writes für
--      authenticated/anon entziehen.
--   2) log_cheat_flag(): gemeinsamer Logger mit 10-Min-Entprellung.
--   3) highscore_caps: Bestenliste nur für Spiele, die eine haben,
--      mit Obergrenze pro Spiel. Verstoß → abgelehnt + cheat_flags.
--   4) sync_shop_state: Tages-Budgets für alles, was der Client sich
--      selbst gutschreibt (Kristalle, Münz-Quellen, Item-Zähler).
--      Über dem Budget wird der Zuwachs GEKAPPT (nicht abgelehnt, damit
--      der restliche Stand — Nester, Käufe — nicht verloren geht) und
--      in cheat_flags geloggt. Der Client übernimmt den gekappten
--      Server-Stand beim nächsten Merge.
--
-- Bestehende Fake-Werte räumt diese Migration NICHT auf — das läuft
-- gezielt pro betroffenem Account per Hand (siehe Chat 30.09.).
--
-- Grenzen dieser Härtung (bewusst, siehe Chat 30.09.): Lootbox-Zufall,
-- Käufe (purchased, Nester, Siegel) und Nest-Wachstum rechnet weiterhin
-- der Browser. Die Budgets machen Manipulation langsam und sichtbar,
-- aber nicht unmöglich. Voll dicht wird es erst mit server-seitigen
-- Kauf-/Lootbox-RPCs.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Rechte
-- ─────────────────────────────────────────────────────────────
drop policy if exists profiles_insert_self on profiles;
revoke insert on profiles from authenticated, anon;

drop policy if exists uc_write_own on user_collectibles;
revoke insert, update, delete on user_collectibles from authenticated, anon;


-- ─────────────────────────────────────────────────────────────
-- 2) log_cheat_flag — entprellt (gleicher User/Spiel/Grund max.
--    1× pro 10 Minuten), damit ein manipulierter localStorage, der
--    bei jedem Hub-Start neu pusht, das Dashboard nicht flutet.
-- ─────────────────────────────────────────────────────────────
create or replace function log_cheat_flag(
  p_user_id uuid, p_game_id text, p_reason text, p_detail jsonb
) returns void
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if exists (
    select 1 from cheat_flags
     where user_id = p_user_id
       and reason  = p_reason
       and game_id is not distinct from p_game_id
       and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;
  insert into cheat_flags (user_id, game_id, reason, detail)
  values (p_user_id, p_game_id, p_reason, p_detail);
end;
$$;

revoke all on function log_cheat_flag(uuid, text, text, jsonb) from public;
revoke all on function log_cheat_flag(uuid, text, text, jsonb) from anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) highscore_caps + upsert_highscore
-- ─────────────────────────────────────────────────────────────
-- Nur Spiele mit Eintrag hier haben eine Bestenliste. Werte großzügig
-- über dem ehrlich Erreichbaren (Stand 30.09.2026):
--   game9  Fokusflow       8 Checkpoints × 100 + Zielbonus ≤ ~1 600
--   game10 The Algorithm   Ingame-Minuten, bester ehrlicher Wert 720
--   game11 Tip Turbo Kids  Cap aus 0144
--   game17 Bubble Bounce   endlos, bester ehrlicher Wert ~61 000 → 500 000
--   game18 Startup Story   Idle-Spiel, Score = Nutzer/100 → 10 Mrd.
--                          (max_score ist bigint; game_highscores.best_score
--                          ist int und endet bei 2 147 483 647)
-- Anpassen per SQL: update highscore_caps set max_score = … where game_id = …;
create table if not exists highscore_caps (
  game_id    text primary key references games(id) on delete cascade,
  max_score  bigint not null check (max_score > 0),
  updated_at timestamptz not null default now()
);

alter table highscore_caps enable row level security;

drop policy if exists highscore_caps_select on highscore_caps;
create policy highscore_caps_select on highscore_caps
  for select using (true);

drop policy if exists highscore_caps_superadmin_write on highscore_caps;
create policy highscore_caps_superadmin_write on highscore_caps
  for all using (is_superadmin()) with check (is_superadmin());

grant select on highscore_caps to authenticated;
grant all    on highscore_caps to service_role;

insert into highscore_caps (game_id, max_score)
select g.id, c.max_score
  from (values
    ('game9',       2000),
    ('game10',      2880),
    ('game11',      1000),
    ('game17',      500000),
    ('game18', 10000000000)
  ) as c(game_id, max_score)
  join games g on g.id = c.game_id
on conflict (game_id) do nothing;


create or replace function upsert_highscore(p_game_id text, p_score int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id  uuid := auth.uid();
  v_status   text;
  v_season   int;
  v_game     record;
  v_cap      bigint;
  v_new_best int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_score is null or p_score < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_score');
  end if;

  select status, season into v_status, v_season
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_not_active');
  end if;

  select id, season, active into v_game from games where id = p_game_id;
  if not found or not v_game.active then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  if v_game.season > v_season then
    return jsonb_build_object('ok', false, 'error', 'season_locked');
  end if;

  select max_score into v_cap from highscore_caps where game_id = p_game_id;
  if not found then
    perform log_cheat_flag(v_user_id, p_game_id, 'highscore_no_board',
      jsonb_build_object('score', p_score));
    return jsonb_build_object('ok', false, 'error', 'no_leaderboard');
  end if;

  if p_score > v_cap then
    perform log_cheat_flag(v_user_id, p_game_id, 'highscore_cap',
      jsonb_build_object('score', p_score, 'cap', v_cap));
    return jsonb_build_object('ok', false, 'error', 'score_out_of_range');
  end if;

  insert into game_highscores (user_id, game_id, best_score, updated_at)
  values (v_user_id, p_game_id, p_score, now())
  on conflict (user_id, game_id) do update
    set best_score = greatest(game_highscores.best_score, excluded.best_score),
        updated_at = case
                       when excluded.best_score > game_highscores.best_score then now()
                       else game_highscores.updated_at
                     end
  returning best_score into v_new_best;

  return jsonb_build_object('ok', true, 'best_score', v_new_best);
end;
$$;

revoke all on function upsert_highscore(text, int) from public;
grant execute on function upsert_highscore(text, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Shop-Budgets
-- ─────────────────────────────────────────────────────────────
-- economy_limits: Tages-Budgets für „Gratis"-Zuwachs (Lootbox, Nester,
-- Freilassen). Was darüber hinaus geht, muss mit ausgegebenen Münzen
-- gedeckt sein (Kristall-Tausch 60 🪙 → 10 💎, Tränke ab 5 🪙).
--   kristalle_per_day   3 Gratis-Lootboxen à max. 50 💎 + Puffer
--   coin_sources_per_day bankedCoins + Nest-Münzen (Freilassen, Lootbox)
--   items_per_day       Item-Zähler (Tränke, Booster, Klee, …)
--   overspend_tolerance Münzen, die spentCoins kurzfristig über dem
--                       Bestand liegen darf (Sync-Reihenfolge Shop/Spiel)
create table if not exists economy_limits (
  key        text primary key,
  value      int  not null check (value >= 0),
  updated_at timestamptz not null default now()
);

alter table economy_limits enable row level security;

drop policy if exists economy_limits_superadmin_all on economy_limits;
create policy economy_limits_superadmin_all on economy_limits
  for all using (is_superadmin()) with check (is_superadmin());

grant all on economy_limits to service_role;

insert into economy_limits (key, value) values
  ('kristalle_per_day',     300),
  ('coin_sources_per_day', 3000),
  ('items_per_day',          40),
  ('overspend_tolerance',   100)
on conflict (key) do nothing;


-- shop_daily_gains: was pro User und Berliner Kalendertag schon aus
-- dem Gratis-Budget gutgeschrieben wurde.
create table if not exists shop_daily_gains (
  user_id      uuid not null references auth.users(id) on delete cascade,
  day          date not null,
  kristalle    int  not null default 0,
  coin_sources int  not null default 0,
  items        int  not null default 0,
  primary key (user_id, day)
);

alter table shop_daily_gains enable row level security;

drop policy if exists shop_daily_gains_admin_select on shop_daily_gains;
create policy shop_daily_gains_admin_select on shop_daily_gains
  for select using (is_admin() or is_superadmin());

grant select on shop_daily_gains to authenticated;
grant all    on shop_daily_gains to service_role;


-- Hilfsfunktion: int aus jsonb, fehlend/null → 0
create or replace function _ji(j jsonb, k text) returns int
  immutable
  language sql
as $$ select coalesce((j->>k)::int, 0) $$;

revoke all on function _ji(jsonb, text) from public;


-- sync_shop_state — Basis 0044, ergänzt um Schritt „Budget" nach dem Merge
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

  v_src_gain := greatest(v_bank_m - v_bank_s, 0);
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

  v_spent_s := _ji(v_server, 'spentCoins');
  v_spent_m := _ji(v_merged, 'spentCoins');

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

