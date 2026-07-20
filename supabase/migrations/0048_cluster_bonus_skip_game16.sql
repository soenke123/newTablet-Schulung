-- ══════════════════════════════════════════════════════════════
-- Migration 0048 — Cluster-Starthilfe: game16 (Legi-Trainer) ausnehmen
-- ══════════════════════════════════════════════════════════════
-- Bug: apply_cluster_bonus iteriert über alle Spiele einer Season,
-- inklusive game16 (Einhornkatze/Legi-Trainer). Für Season 3 landet
-- dadurch ein zufälliges Baby-Monster (z. B. Huhn) in
-- game_state[game16].creature. claim_cluster_legi (0034) prüft danach
-- `coalesce(game_state.creature, 'einhornkatze')` und lässt die
-- Fremd-Kreatur stehen — die Einhornkatze wird nie vergeben und die
-- Kachel zeigt beim Reveal ein Huhn im Katzen-Slot.
--
-- Fix:
--   1) apply_cluster_bonus überspringt für game16 die Baby-Platzierung.
--      Die Freischaltung (user_unlocked_games) bleibt bestehen — sie ist
--      harmlos, da game16-Zugriff ohnehin über cluster.bonbons_unlocked_at
--      + user_legi_grants gesteuert wird.
--   2) Backfill: game_state.game16.creature auf 'einhornkatze' korrigieren,
--      wo aktuell eine Fremd-Kreatur steckt. growth bleibt unberührt
--      (Task-Fortschritt via friends/gift/win-RPCs zählt schon korrekt,
--      nur der Sprite war falsch).
--
-- Basis: Migration 0035 (aktuellster apply_cluster_bonus). NICHT aus
-- 0020/0021/0029 kopieren — sonst gehen legi_granted-Hook und
-- bonus_coins_granted-Buchung verloren.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) apply_cluster_bonus — game16 in der Baby-Schleife auslassen
-- ─────────────────────────────────────────────────────────────
create or replace function apply_cluster_bonus(p_user_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_caller     uuid := auth.uid();
  v_is_admin   boolean;
  v_cluster_id uuid;
  v_bonus      record;
  v_season     int;
  v_game       record;
  v_baby       text;
  v_games_unlocked int := 0;
  v_babies_placed  int := 0;
  v_existing_creature text;
  v_current_shop  jsonb;
  v_current_coins int;
  v_legi_granted  boolean := false;
begin
  if v_caller is not null then
    select is_admin into v_is_admin from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  select cluster_id into v_cluster_id from profiles where id = p_user_id;
  if v_cluster_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_cluster');
  end if;

  v_legi_granted := ensure_legi_grant(p_user_id, v_cluster_id);

  select * into v_bonus
  from cluster_bonus
  where cluster_id = v_cluster_id and active = true;
  if not found then
    return jsonb_build_object(
      'ok', true, 'skipped', 'no_active_bonus',
      'legi_granted', v_legi_granted
    );
  end if;

  if exists (select 1 from cluster_bonus_grants
             where user_id = p_user_id and cluster_id = v_cluster_id) then
    return jsonb_build_object(
      'ok', true, 'skipped', 'already_granted',
      'legi_granted', v_legi_granted
    );
  end if;

  begin
    insert into cluster_bonus_grants (user_id, cluster_id, granted_at)
    values (p_user_id, v_cluster_id, now());
  exception when unique_violation then
    return jsonb_build_object(
      'ok', true, 'skipped', 'race_already_granted',
      'legi_granted', v_legi_granted
    );
  end;

  foreach v_season in array v_bonus.seasons loop
    for v_game in
      select id from games
      where season = v_season and active = true
    loop
      insert into user_unlocked_games (user_id, game_id, unlocked_at)
      values (p_user_id, v_game.id, now())
      on conflict (user_id, game_id) do nothing;
      if found then
        v_games_unlocked := v_games_unlocked + 1;
      end if;

      -- FIX 0048: game16 (Einhornkatze/Legi-Trainer) NICHT mit einem
      -- Zufalls-Baby befüllen. Die Kreatur wird ausschließlich von
      -- claim_cluster_legi vergeben und muss 'einhornkatze' sein.
      if v_game.id = 'game16' then
        continue;
      end if;

      select creature into v_existing_creature
      from game_state where user_id = p_user_id and game_id = v_game.id;

      if v_existing_creature is null then
        v_baby := random_baby_from_season(v_season);
        insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
        values (p_user_id, v_game.id, 0, 0, v_baby, 0, 0, now())
        on conflict (user_id, game_id) do update set
          creature   = coalesce(game_state.creature, excluded.creature),
          updated_at = now();
        v_babies_placed := v_babies_placed + 1;
      end if;
    end loop;
  end loop;

  if v_bonus.startup_coins > 0 then
    select value into v_current_shop
    from user_collectibles
    where user_id = p_user_id and key = 'shop_state';

    v_current_coins := coalesce((v_current_shop->>'bankedCoins')::int, 0);

    insert into user_collectibles (user_id, key, value, updated_at)
    values (
      p_user_id,
      'shop_state',
      jsonb_set(
        coalesce(v_current_shop, '{}'::jsonb),
        '{bankedCoins}',
        to_jsonb(v_current_coins + v_bonus.startup_coins)
      ),
      now()
    )
    on conflict (user_id, key) do update set
      value      = jsonb_set(
                     coalesce(user_collectibles.value, '{}'::jsonb),
                     '{bankedCoins}',
                     to_jsonb(coalesce((user_collectibles.value->>'bankedCoins')::int, 0) + v_bonus.startup_coins)
                   ),
      updated_at = now();

    insert into wallets (user_id, coins, bonus_coins_granted, updated_at)
    values (p_user_id, 0, v_bonus.startup_coins, now())
    on conflict (user_id) do update set
      bonus_coins_granted = wallets.bonus_coins_granted + v_bonus.startup_coins,
      updated_at          = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'cluster_id', v_cluster_id,
    'coins_added', v_bonus.startup_coins,
    'games_unlocked', v_games_unlocked,
    'babies_placed', v_babies_placed,
    'seasons', v_bonus.seasons,
    'legi_granted', v_legi_granted
  );
end;
$$;

revoke all on function apply_cluster_bonus(uuid) from public;
grant execute on function apply_cluster_bonus(uuid) to authenticated;
grant execute on function apply_cluster_bonus(uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) Backfill — Fremd-Kreaturen aus game16 auf 'einhornkatze' setzen
-- ─────────────────────────────────────────────────────────────
-- Betrifft alle User, denen der Starthilfe-Fix vor Migration 0048 ein
-- Zufalls-Baby in game16 gedrückt hat. growth bleibt bewusst stehen —
-- die Task-RPCs (0036/0037/0039/0046/0047) haben growth korrekt hoch-
-- gezählt, nur die creature war falsch. So sehen betroffene User beim
-- nächsten Load sofort ihre Katze auf dem aktuellen Wachstumsstand.
--
-- Sicherheitsnetz: NUR game16, NUR wo creature nicht null und ungleich
-- 'einhornkatze'. Nicht-betroffene User (creature is null oder bereits
-- 'einhornkatze') werden nicht angefasst.
update game_state
   set creature   = 'einhornkatze',
       updated_at = now()
 where game_id  = 'game16'
   and creature is not null
   and creature <> 'einhornkatze';
