-- ══════════════════════════════════════════════════════════════
-- Migration 0071 — Das Bonbon-Prinzip hängt an der Einhornkatze
-- ══════════════════════════════════════════════════════════════
-- Bisher lief das Regenbogen-Bonbon-Sammeln automatisch mit, sobald
-- ein Kurs auf Season 3 stand und ein bonbon_target hatte. Der Kurs
-- sammelte also auf ein Ziel hin, das ihm noch niemand erklärt hatte.
--
-- Mit der Kurs-Freischaltung aus 0070 bekommt die Einhornkatze
-- (game16) einen Schalter wie jede andere Kachel — und dieser Schalter
-- eröffnet das ganze Spielprinzip:
--
--   game16 gesperrt  →  im ganzen Kurs entstehen KEINE Bonbons.
--   game16 offen     →  ab jetzt zählt jede Runde, der Regenbogen
--                       füllt sich, der Legi ist erreichbar.
--
-- Drei bestehende Funktionen werden dafür neu deklariert, jeweils auf
-- Basis ihrer HÖCHSTEN vorhandenen Fassung (nicht der Erstfassung —
-- sonst gehen die Zwischen-Fixes verloren):
--
--   add_bonbons(int)                  Basis 0034 (Post-Unlock-Guard)
--   award_game_bonbons(text,int,int)  Basis 0044
--   get_cluster_bonbon_status()       Basis 0052 (milestones_claimed)
--
-- Nicht betroffen: die Münzen aus board_claim_reward (0069) landen
-- direkt in game_state.coins, nur die Bonbons laufen über
-- add_bonbons. Bei gesperrter Einhornkatze gibt Reality Check also
-- weiter Wachstum und Münzen — nur eben keine Bonbons.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) add_bonbons(p_amount) — Basis 0034, plus game16-Tor
-- ─────────────────────────────────────────────────────────────
-- Zentraler Eingang für alles, was Bonbons gutschreibt. Das Tor steht
-- hier, damit es auch für board_claim_reward gilt, ohne dass die
-- Funktion es selbst kennen müsste.
create or replace function add_bonbons(p_amount int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session    record;
  v_new_total  int;
  v_unlock_res jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 500 then
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
  if v_session.season < 3 then
    return jsonb_build_object('ok', true, 'skipped', 'season_below_3');
  end if;

  -- NEU (0071): Die Einhornkatze eröffnet das Bonbon-Spiel. Ist sie
  -- für den Kurs gesperrt, hat das Sammeln noch nicht begonnen.
  if not is_game_open_for_cluster(v_session.cluster_id, 'game16') then
    return jsonb_build_object('ok', true, 'skipped', 'legi_locked');
  end if;

  -- Post-Unlock-Guard: User hat schon einen Legi-Grant (aus dem
  -- aktuellen Cluster) → keine weiteren Bonbons mehr zählen.
  -- Cluster-Wechsel-Fall: Grant im ALTEN Cluster blockt auch neue
  -- Beiträge im NEUEN Cluster, was bewusst so ist (der User hat
  -- seinen Legi schon bekommen).
  if exists (
    select 1 from user_legi_grants where user_id = v_user_id
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'legi_already_unlocked');
  end if;

  insert into wallets (user_id, coins, bonbons, updated_at)
  values (v_user_id, 0, p_amount, now())
  on conflict (user_id) do update set
    bonbons    = wallets.bonbons + p_amount,
    updated_at = now()
  returning bonbons into v_new_total;

  if v_session.cluster_id is not null then
    v_unlock_res := check_and_grant_cluster_legi(v_session.cluster_id);
  else
    v_unlock_res := jsonb_build_object('skipped', 'no_cluster');
  end if;

  return jsonb_build_object(
    'ok', true,
    'bonbons', v_new_total,
    'cluster', v_unlock_res
  );
end;
$$;

revoke all on function add_bonbons(int) from public;
grant execute on function add_bonbons(int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) award_game_bonbons(game_id, correct, max_rounds) — Basis 0044
-- ─────────────────────────────────────────────────────────────
-- Zwei neue Tore, und die REIHENFOLGE ist hier der Knackpunkt:
--
-- Die Funktion setzt den bonbon_daily_claims-Marker, BEVOR sie an
-- add_bonbons delegiert. Stünde das game16-Tor nur dort, wäre der
-- +20-Tagesbonus für diese Kachel verbrannt, ohne dass ein einziges
-- Bonbon geflossen ist — und am nächsten Tag hätte der Schüler ihn
-- stillschweigend verloren. Beide Prüfungen stehen deshalb VOR dem
-- Marker.
--
-- Das zweite Tor betrifft das gespielte Spiel selbst: eine Runde in
-- einer gesperrten Kachel (per URL aufgerufen — die Spielordner sind
-- weiterhin direkt erreichbar) wirft keine Bonbons ab. Punkte und
-- Münzen aus submit_game_result bleiben bewusst unangetastet, damit
-- eine Runde, die beim Zusperren gerade lief, nicht verlorengeht.
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

  -- NEU (0071), beide vor dem Daily-Marker (siehe Kopfkommentar):
  if not is_game_open_for_cluster(v_session.cluster_id, 'game16') then
    return jsonb_build_object('ok', true, 'skipped', 'legi_locked');
  end if;
  -- Nest-Kacheln laufen unter einer eigenen Id (nest_…) durch ein
  -- Spiel und stehen nicht in games. Für sie gilt das Tor des Spiels
  -- nicht — sie sind nur erreichbar, wenn ihre Kachel offen ist, und
  -- der Hub prüft das schon beim Start.
  if exists (select 1 from games where id = p_game_id)
     and not is_game_open_for_cluster(v_session.cluster_id, p_game_id) then
    return jsonb_build_object('ok', true, 'skipped', 'game_locked');
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
-- 3) get_cluster_bonbon_status() — Basis 0052, plus game16-Tor
-- ─────────────────────────────────────────────────────────────
-- `enabled` ist das Signal, an dem im Hub die +20-Tageshinweise auf
-- allen Kacheln und der Regenbogen-Fortschritt hängen. Solange die
-- Einhornkatze zu ist, darf davon nichts zu sehen sein — sonst
-- verspricht die Oberfläche etwas, das der Server nicht einlöst.
create or replace function get_cluster_bonbon_status()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user_id   uuid := auth.uid();
  v_session   record;
  v_cluster   record;
  v_collected int;
  v_own       int;
  v_target    int;
  v_pct       numeric;
  v_claimed   int[];
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, cluster_id, season, status
    into v_session
  from user_session where id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if v_session.season < 3 or v_session.cluster_id is null then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  -- NEU (0071): ohne freigeschaltete Einhornkatze hat das Sammeln
  -- noch nicht begonnen.
  if not is_game_open_for_cluster(v_session.cluster_id, 'game16') then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  select id, bonbon_target, bonbons_unlocked_at
    into v_cluster
  from clusters where id = v_session.cluster_id;
  if not found or v_cluster.bonbon_target is null then
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;

  v_target := v_cluster.bonbon_target;

  select coalesce(sum(w.bonbons), 0)::int into v_collected
  from profiles p
  left join wallets w on w.user_id = p.id
  where p.cluster_id = v_session.cluster_id and p.status = 'active';

  select coalesce(bonbons, 0) into v_own
  from wallets where user_id = v_user_id;
  v_own := coalesce(v_own, 0);

  v_pct := (v_collected::numeric / v_target::numeric) * 100;

  select coalesce(array_agg(milestone order by milestone), array[]::int[])
    into v_claimed
  from user_bonbon_milestone_grants
   where user_id = v_user_id and cluster_id = v_session.cluster_id;

  return jsonb_build_object(
    'ok',                 true,
    'enabled',            true,
    'target',             v_target,
    'collected',          v_collected,
    'own_amount',         v_own,
    'unlocked',           v_cluster.bonbons_unlocked_at is not null,
    'unlocked_at',        v_cluster.bonbons_unlocked_at,
    'pct',                round(least(v_pct, 100), 2),
    'milestones_claimed', to_jsonb(v_claimed),
    'milestones',         jsonb_build_array(
      jsonb_build_object('percent', 25,  'reached', v_collected >= (v_target * 25  / 100)),
      jsonb_build_object('percent', 50,  'reached', v_collected >= (v_target * 50  / 100)),
      jsonb_build_object('percent', 75,  'reached', v_collected >= (v_target * 75  / 100)),
      jsonb_build_object('percent', 100, 'reached', v_collected >= v_target)
    )
  );
end;
$$;

revoke all on function get_cluster_bonbon_status() from public;
grant execute on function get_cluster_bonbon_status() to authenticated;
