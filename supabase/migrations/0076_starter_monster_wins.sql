-- ══════════════════════════════════════════════════════════════
-- Migration 0076 — ein vorhandenes Monster schlüpft nicht noch mal
-- ══════════════════════════════════════════════════════════════
-- Die Cluster-Starthilfe (0020/0073) legt zu jedem Spiel der Season
-- ein Baby-Monster. Seit es kollaborative Kacheln gibt, trifft das
-- auch game19 (Reality Check) und game20 (Warum Tablets?) — und deren
-- Belohnung ist selbst ein Monster, vergeben beim Phasenwechsel der
-- Lehrkraft.
--
-- Beide Schlüpf-Zweige fragten bisher nur ihren eigenen Vergabe-Marker
-- ab (board_rewards.hatched_at / wc_rewards.hatched_at) und schrieben
-- dann `creature = excluded.creature`. Ein Starthilfe-Monster wurde
-- damit wortlos ersetzt: auf der Kachel stand vor dem Schlüpfen schon
-- ein Tier — womöglich ein Epic —, und beim Phasenwechsel wurde daraus
-- eine Schnecke. Für das Kind ein Verlust, und die Reveal-Sequenz
-- erzählte dabei von einem Ei, das gar nicht da war.
--
-- Die Regel ab hier ist dieselbe für beide Kacheln:
--   Ist im Spiel schon ein Monster, passiert beim Schlüpfen nichts.
-- Kein Wurf, kein Ersetzen, keine Sequenz. Der Marker wird trotzdem
-- gesetzt (sonst fragte der 5-Sekunden-Poll das bis in alle Ewigkeit
-- erneut an), und alles Weitere läuft unverändert:
--   • Reality Check wächst in Phase 2→3 genau wie bisher, samt Münzen
--     und Bonbons — der Wachstums-Zweig fragt nicht, welches Tier da
--     steht, sondern nur, was es geleistet hat.
--   • Bei „Warum Tablets?" entfallen die 10 Münzen. Sie hängen am
--     Schlüpfen, und geschlüpft ist nichts.
--
-- Damit das bei game20 auch stimmig aussieht, wirft die Starthilfe
-- dort nicht mehr aus dem vollen Season-1-Pool: die Kachel verspricht
-- Schnecke oder Fisch für alle (wc_creature, 0075), also darf sie auch
-- kein Startmonster zeigen, das dieses Versprechen bricht. Statt einer
-- ID im Funktionsrumpf bekommt `games` dafür ein Merkmal — dieselbe
-- Überlegung wie bei cluster_managed (0072).
--
-- game19 bleibt bewusst OHNE eigenen Pool: dort darf wie in jedem
-- anderen Spiel etwas droppen. Die Deckelung nach Beitrag
-- (board_creature(cap)) greift dann nur noch beim Wachstum und nicht
-- bei der Art — das ist der Preis dafür, dass ein Startmonster ein
-- vollwertiges Monster ist und kein Platzhalter.
--
-- Reihenfolge in dieser Datei:
--   1) Spalte games.starter_pool + Wert für game20
--   2) random_baby_for_game()      — Pool des Spiels vor Pool der Season
--   3) apply_cluster_bonus()       — Neuauflage auf Basis 0073
--   4) wc_creature(p_board)        — liest denselben Pool
--   5) board_claim_reward()        — Neuauflage auf Basis 0069
--   6) wc_claim_reward()           — Neuauflage auf Basis 0075
--   7) Altbestand: game20-Startmonster außerhalb {snail,fish}
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) games.starter_pool
-- ─────────────────────────────────────────────────────────────
-- null = Season-Pool mit Rarity-Roll, also der Normalfall. Nur ein
-- Spiel, das selbst eine Aussage über sein Monster macht, trägt hier
-- etwas ein. Der eingetragene Pool wird gleichverteilt gezogen — ohne
-- Rarity-Roll, der sonst in 15 % der Fälle in leere Rare-/Epic-Pools
-- fiele.
alter table games
  add column if not exists starter_pool text[];

comment on column games.starter_pool is
  'Kreaturen-Pool für das Startmonster der Cluster-Starthilfe (0020) '
  'und für Spiele, die ihr Monster selbst vergeben. null = Pool der '
  'Season inklusive Rarity-Roll (random_baby_from_season). Ist der '
  'Pool gesetzt, wird gleichverteilt daraus gezogen. Für Kacheln, die '
  'allen dasselbe versprechen — z. B. game20: Schnecke oder Fisch.';

-- „Warum Tablets?" ist die erste Kachel einer Schulung und der erste
-- Moment, in dem überhaupt ein Monster auftaucht. Wenn beim Nachbarn
-- etwas Glitzerndes liegt und bei einem selbst nicht, ist der
-- gemeinsame Moment kaputt — dieselbe Begründung wie in wc_creature().
update games set starter_pool = array['snail','fish'] where id = 'game20';


-- ─────────────────────────────────────────────────────────────
-- 2) random_baby_for_game(p_game_id, p_season) → text
-- ─────────────────────────────────────────────────────────────
-- Der Umweg über eine eigene Funktion statt einer Inline-Abfrage in
-- apply_cluster_bonus: wc_creature() zieht aus derselben Quelle, damit
-- „Schnecke oder Fisch" genau einmal im System steht und nicht an zwei
-- Stellen auseinanderlaufen kann.
create or replace function random_baby_for_game(p_game_id text, p_season int)
  returns text
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_pool text[];
begin
  select starter_pool into v_pool from games where id = p_game_id;

  if v_pool is not null and coalesce(array_length(v_pool, 1), 0) > 0 then
    return v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
  end if;

  return random_baby_from_season(p_season);
end;
$$;

revoke all on function random_baby_for_game(text, int) from public;
grant execute on function random_baby_for_game(text, int) to authenticated;
grant execute on function random_baby_for_game(text, int) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) apply_cluster_bonus() — Neuauflage auf Basis 0073
-- ─────────────────────────────────────────────────────────────
-- Einzige Änderung gegenüber 0073: der Wurf läuft über
-- random_baby_for_game statt direkt über random_baby_from_season.
-- Die Spiele-Schleife bleibt, wie sie war — den starter_pool schlägt
-- die Funktion selbst nach, damit sie auch außerhalb dieser Schleife
-- (wc_creature) dieselbe Antwort gibt.
--
-- Alles andere ist unverändert übernommen — der Admin-Guard aus 0053,
-- der game16-Übersprung aus 0048, der cluster_managed-Filter aus 0073,
-- die Startcoins nach bankedCoins und der ensure_legi_grant-Aufruf.
create or replace function apply_cluster_bonus(p_user_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_caller     uuid := auth.uid();
  v_is_admin   boolean;
  v_target     record;
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
    select is_admin or is_superadmin into v_is_admin
      from profiles where id = v_caller;
    if coalesce(v_is_admin, false) is not true then
      return jsonb_build_object('ok', false, 'error', 'not_authorized');
    end if;
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_required');
  end if;

  -- GUARD 0053: Admin/Superadmin bekommt keinen Cluster-Bonus.
  -- Er darf einem Cluster zugewiesen sein, um zu beobachten, aber
  -- kriegt weder Startcoins noch Baby-Monster.
  select cluster_id, is_admin, is_superadmin into v_target
    from profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  if coalesce(v_target.is_admin, false) or coalesce(v_target.is_superadmin, false) then
    return jsonb_build_object('ok', true, 'skipped', 'target_is_admin');
  end if;

  v_cluster_id := v_target.cluster_id;
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
      -- FIX 0073: cluster_managed = false (game1337) bleibt draußen.
      -- Ein Easter-Egg ist kein Kursinhalt und bekommt deshalb weder
      -- eine Freischaltung noch ein Monster.
      select id from games
      where season = v_season and active = true and cluster_managed = true
    loop
      insert into user_unlocked_games (user_id, game_id, unlocked_at)
      values (p_user_id, v_game.id, now())
      on conflict (user_id, game_id) do nothing;
      if found then
        v_games_unlocked := v_games_unlocked + 1;
      end if;

      -- game16 (Einhornkatze/Legi-Trainer) NICHT mit Zufalls-Baby
      -- befüllen (Regel aus Migration 0048).
      if v_game.id = 'game16' then
        continue;
      end if;

      select creature into v_existing_creature
      from game_state where user_id = p_user_id and game_id = v_game.id;

      if v_existing_creature is null then
        -- FIX 0076: Spiele mit eigenem starter_pool (game20) würfeln
        -- daraus statt aus dem Season-Pool.
        v_baby := random_baby_for_game(v_game.id, v_season);
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
-- 4) wc_creature(p_board) — liest denselben Pool
-- ─────────────────────────────────────────────────────────────
-- Bisher stand „Schnecke oder Fisch" fest im Rumpf. Mit starter_pool
-- gäbe es die Aussage zweimal, und zwei Quellen für dieselbe Zahl
-- laufen irgendwann auseinander. Die Funktion bekommt dafür den
-- Board-Schlüssel — der ist ohnehin die Spiel-ID (0075), und eine
-- zweite Wortwolke ohne eigenen Pool fällt damit auf den Pool ihrer
-- Season zurück statt auf einen fremden Fisch.
--
-- Die alte parameterlose Signatur wird gezielt entfernt, statt sie als
-- toten Code neben der neuen stehen zu lassen.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'wc_creature'
       and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'drop function public.wc_creature()';
  end if;
end $$;

create or replace function wc_creature(p_board text)
  returns text
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_season int;
begin
  select season into v_season from games where id = p_board;
  return random_baby_for_game(p_board, coalesce(v_season, 1));
end;
$$;

revoke all on function wc_creature(text) from public;
grant execute on function wc_creature(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) board_claim_reward() — Neuauflage auf Basis 0069
-- ─────────────────────────────────────────────────────────────
-- Geändert ist ausschließlich der Schlüpf-Zweig. Der Wachstums-Zweig
-- ist wortgleich übernommen — er rechnet an Post-Its, Recherchen und
-- Zustimmungen und interessiert sich nicht dafür, welches Tier in der
-- Zeile steht.
--
-- Neu im Schlüpf-Zweig: liegt in game_state['game19'] schon ein
-- Monster, wird nicht gewürfelt und nichts ersetzt. Der Marker wird
-- gesetzt und mit dem vorhandenen Tier belegt, und die Funktion
-- FÄLLT DURCH in den Wachstums-Zweig, statt wie sonst mit dem
-- Schlüpf-Ergebnis zurückzukehren. Das ist wichtig: der Hub bricht
-- seine Nachhol-Schleife beim ersten 'none' ab (syncRealityCheck in
-- creatures.js), und wer erst in Phase 3 dazukommt, verlöre sonst
-- sein Wachstum bis zum nächsten Aufruf.
--
-- Antwort unverändert:
--   { ok, event: 'hatch' | 'grow' | 'none', creature, ideas, cap,
--     growth_before, growth_after, coins_gained, bonbons_gained, phase }
create or replace function board_claim_reward(p_cluster_id uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  GROWTH_MAX  constant int     := 21;    -- creatures.js: GROWTH_MAX
  COINS_MAX   constant int     := 30;    -- Münzen bei voll ausgewachsen
  IDEAS_MAX   constant int     := 10;    -- Post-It-Kontingent, 0066
  FACT_SHARE  constant numeric := 0.20;  -- Teil B je Recherche (5 × 20 % = 100 %)
  LEAD_FACTOR constant numeric := 1.5;   -- „deutlich über dem Schnitt" in Teil A
  v_user      uuid := auth.uid();
  v_cluster   uuid;
  v_pmax      int;
  v_rw        record;
  v_ideas     int;
  v_cap       int;
  v_creature  text;
  v_have      text;
  v_before    int;
  v_after     int;
  v_growth    int;
  v_coins     int;
  v_bonbons   int := 0;
  v_bon       jsonb;
  v_total     int;
  v_given     int;
  v_recv      int;
  v_members   int;
  v_notes     int;
  v_facts     int;
  v_thr_a     numeric;
  v_part_a    numeric := 0;
  v_part_b    numeric := 0;
  v_share     numeric;
  v_coins_sum int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Admins moderieren das Board, sie sammeln nicht darauf. Sie hängen
  -- ohnehin in keinem Kurs, und über den Kurs-Wähler in der Oberfläche
  -- landen sie sonst reihum in fremden Kursen und würfelten dort
  -- Monster für sich selbst.
  if is_any_admin() then
    return jsonb_build_object('ok', true, 'event', 'none');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select coalesce(phase_max, 1) into v_pmax
    from board_state where cluster_id = v_cluster;
  v_pmax := coalesce(v_pmax, 1);

  select * into v_rw
    from board_rewards where cluster_id = v_cluster and user_id = v_user;

  -- ── Schlüpfen ─────────────────────────────────────────────
  -- Die Zahl der eigenen Post-Its deckelt den Normalen-Pool, Epics und
  -- Season-Rare bleiben ungedeckelt (0067).
  if v_pmax >= 2 and (not found or v_rw.hatched_at is null) then
    select count(*) into v_ideas
      from board_notes
     where cluster_id = v_cluster and user_id = v_user and kind = 'idee';

    v_cap := least(IDEAS_MAX, coalesce(v_ideas, 0));

    -- FIX 0076: ein vorhandenes Monster gewinnt. Es kommt aus der
    -- Cluster-Starthilfe (0020/0073) und ist ein vollwertiges Monster,
    -- kein Platzhalter — also wird weder gewürfelt noch ersetzt.
    select creature into v_have
      from game_state where user_id = v_user and game_id = 'game19';

    v_creature := coalesce(v_have, board_creature(v_cap));

    insert into board_rewards (cluster_id, user_id, creature, ideas_at_hatch, hatched_at)
    values (v_cluster, v_user, v_creature, v_ideas, now())
    on conflict (cluster_id, user_id) do update set
      creature       = excluded.creature,
      ideas_at_hatch = excluded.ideas_at_hatch,
      hatched_at     = excluded.hatched_at;

    -- coins steht bewusst NICHT im do-update: nach einem board_reset
    -- ist das hier der zweite Durchlauf, und die Münzen des ersten
    -- sind verdient.
    --
    -- creature und growth seit 0076 bedingt: nur ein wirklich frisch
    -- geschlüpftes Tier fängt bei 0 an. Steht schon eines da, bliebe
    -- ein vorher angewendeter Wachstumstrank sonst auf der Strecke.
    -- Nebenwirkung, gewollt: nach einem board_reset schlüpft für den,
    -- der sein Monster behalten hat, im zweiten Durchlauf nichts Neues.
    insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
    values (v_user, 'game19', 0, 1, v_creature, 0, 0, now())
    on conflict (user_id, game_id) do update set
      creature      = coalesce(game_state.creature, excluded.creature),
      growth        = case when game_state.creature is null then 0 else game_state.growth end,
      rounds_played = 1,
      updated_at    = now();

    if v_have is null then
      return jsonb_build_object(
        'ok', true, 'event', 'hatch',
        'creature',       v_creature,
        'ideas',          coalesce(v_ideas, 0),
        'cap',            v_cap,
        'growth_before',  0,
        'growth_after',   0,
        'coins_gained',   0,
        'bonbons_gained', 0,
        'phase',          v_pmax
      );
    end if;

    -- Kein Reveal — es ist nichts geschlüpft. Den Datensatz neu lesen,
    -- damit der Wachstums-Zweig darunter den frisch gesetzten Marker
    -- sieht und nicht den Stand von vor dem Upsert.
    select * into v_rw
      from board_rewards where cluster_id = v_cluster and user_id = v_user;
  end if;

  -- ── Wachsen ───────────────────────────────────────────────
  if v_pmax >= 3 and v_rw.hatched_at is not null and v_rw.grown_at is null then

    -- Nur Zustimmungen auf Post-Its. Auf Recherchen gibt es seit 0064
    -- keine mehr (fact_not_likable); die Altstimmen von davor werden
    -- nirgends mehr angezeigt und dürfen deshalb auch nicht heimlich
    -- in die Rechnung eingehen.
    --
    -- v_given wird nur noch protokolliert, nicht mehr gerechnet (0069).
    select count(*),
           count(*) filter (where bl.user_id = v_user),
           count(*) filter (where n.user_id  = v_user)
      into v_total, v_given, v_recv
      from board_likes bl
      join board_notes n on n.id = bl.note_id
     where n.cluster_id = v_cluster and n.kind = 'idee';

    -- Der Nenner der Schwelle. Alle Post-Its des Kurses, nicht nur die
    -- eigenen — die Schwelle ist für den ganzen Kurs dieselbe.
    select count(*) into v_notes
      from board_notes where cluster_id = v_cluster and kind = 'idee';

    -- Teil B hängt an nichts als der eigenen Arbeit. Recherchen sind
    -- durch board_upsert_note auf FACTS_MAX = 5 begrenzt; das least()
    -- ist trotzdem da, weil eine spätere Kontingent-Erhöhung sonst
    -- still über 100 % liefe.
    select count(*) into v_facts
      from board_notes
     where cluster_id = v_cluster and user_id = v_user and kind = 'fakt';

    -- Mitglieder gehen nicht mehr in die Rechnung ein, stehen aber
    -- weiter im Beleg — ohne sie ließe sich eine alte Vergabe nicht
    -- mehr gegen eine neue lesen.
    select count(*) into v_members
      from profiles
     where cluster_id = v_cluster
       and not coalesce(is_admin, false)
       and not coalesce(is_superadmin, false);

    -- ── Teil A ──
    -- Ohne Zustimmungen oder ohne Post-Its gibt es keine Schwelle, an
    -- der sich etwas messen ließe. Dann trägt Teil B allein; das ist
    -- der gutmütige Ausgang, weil Teil B in der eigenen Hand liegt.
    if coalesce(v_total, 0) = 0 or coalesce(v_notes, 0) = 0 then
      v_thr_a  := null;
      v_part_a := 0;
    else
      v_thr_a  := LEAD_FACTOR * IDEAS_MAX * v_total::numeric / v_notes;
      v_part_a := least(1.0, coalesce(v_recv, 0)::numeric / v_thr_a);
    end if;

    -- ── Teil B ──
    v_part_b := least(1.0, coalesce(v_facts, 0)::numeric * FACT_SHARE);

    -- ── Zusammen ──
    -- Je zur Hälfte. Wachstum und Münzen beide direkt aus dem Anteil,
    -- nicht Münzen aus dem gerundeten Wachstum — sonst schleppte die
    -- Rundung des einen sich in den anderen.
    v_share  := (v_part_a + v_part_b) / 2.0;
    v_growth := round(GROWTH_MAX * v_share)::int;
    v_coins  := round(COINS_MAX  * v_share)::int;

    select growth into v_before
      from game_state where user_id = v_user and game_id = 'game19';
    v_before := coalesce(v_before, 0);

    -- greatest schützt einen vorher angewendeten Wachstumstrank (+5)
    -- und den Stein der Vollendung (growth 100) davor, von der Kurve
    -- zurückgedreht zu werden — dieselbe Überlegung wie in
    -- syncStartupStory() (creatures.js).
    update game_state
       set growth     = greatest(growth, v_growth),
           coins      = coins + v_coins,
           updated_at = now()
     where user_id = v_user and game_id = 'game19'
    returning growth into v_after;

    -- wallets.coins ist der redundante Gesamtstand und wird sonst nur
    -- in sync_game_state nachgezogen. Ohne diese Zeile liefe die
    -- Rangliste auseinander, bis der User irgendein Spiel spielt.
    select coalesce(sum(coins), 0)::int into v_coins_sum
      from game_state where user_id = v_user;
    insert into wallets (user_id, coins, updated_at)
    values (v_user, v_coins_sum, now())
    on conflict (user_id) do update set
      coins      = v_coins_sum,
      updated_at = now();

    -- Bonbons in Höhe der Münzen. add_bonbons prüft selbst, ob das
    -- Cluster-Legendär überhaupt noch gesammelt wird, und antwortet
    -- sonst mit skipped — dann zeigt die Sequenz keinen Bonbon-Block.
    if v_coins >= 1 then
      v_bon := add_bonbons(v_coins);
      if coalesce((v_bon->>'ok')::boolean, false) and (v_bon->'skipped') is null then
        v_bonbons := v_coins;
      end if;
    end if;

    update board_rewards
       set growth         = v_growth,
           coins          = v_coins,
           bonbons        = v_bonbons,
           likes_given    = v_given,
           likes_received = v_recv,
           likes_total    = v_total,
           members        = v_members,
           notes_total    = v_notes,
           facts          = v_facts,
           part_a         = round(v_part_a * 100)::int,
           part_b         = round(v_part_b * 100)::int,
           grown_at       = now()
     where cluster_id = v_cluster and user_id = v_user;

    return jsonb_build_object(
      'ok', true, 'event', 'grow',
      'creature',       v_rw.creature,
      'ideas',          coalesce(v_rw.ideas_at_hatch, 0),
      'cap',            least(IDEAS_MAX, coalesce(v_rw.ideas_at_hatch, 0)),
      'growth_before',  v_before,
      'growth_after',   coalesce(v_after, v_growth),
      'coins_gained',   v_coins,
      'bonbons_gained', v_bonbons,
      'phase',          v_pmax
    );
  end if;

  return jsonb_build_object('ok', true, 'event', 'none');
end;
$$;

revoke all on function board_claim_reward(uuid) from public;
grant execute on function board_claim_reward(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) wc_claim_reward() — Neuauflage auf Basis 0075
-- ─────────────────────────────────────────────────────────────
-- Dieselbe Regel wie oben, nur ohne zweite Stufe: liegt in
-- game_state[p_board] schon ein Monster, wird nicht gewürfelt, nichts
-- ersetzt — und es gibt auch KEINE Münzen. Die 10 hängen am
-- Schlüpfen, und geschlüpft ist nichts. Der Marker wird trotzdem
-- gesetzt, sonst fragte der Poll das alle fünf Sekunden erneut an.
--
-- Antwort unverändert:
--   { ok, event: 'hatch' | 'none', creature, terms, coins_gained, phase }
create or replace function wc_claim_reward(
  p_cluster_id uuid default null,
  p_board      text default 'game20'
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  COINS      constant int := 10;
  v_user     uuid := auth.uid();
  v_cluster  uuid;
  v_pmax     int;
  v_rw       record;
  v_terms    int;
  v_creature text;
  v_have     text;
  v_award    int;
  v_sum      int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not wc_valid_board(p_board) then
    return jsonb_build_object('ok', false, 'error', 'invalid_board');
  end if;

  -- Admins moderieren die Wolke, sie sammeln nicht darauf. Sie hängen
  -- ohnehin in keinem Kurs, und über den Kurs-Wähler in der Oberfläche
  -- landen sie sonst reihum in fremden Kursen und würfelten dort
  -- Monster für sich selbst.
  if is_any_admin() then
    return jsonb_build_object('ok', true, 'event', 'none');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select coalesce(phase_max, 1) into v_pmax
    from wc_state where cluster_id = v_cluster and board_key = p_board;
  v_pmax := coalesce(v_pmax, 1);

  select * into v_rw
    from wc_rewards
   where cluster_id = v_cluster and board_key = p_board and user_id = v_user;

  if v_pmax < 2 or (found and v_rw.hatched_at is not null) then
    return jsonb_build_object('ok', true, 'event', 'none');
  end if;

  -- Die Zahl der eigenen Zettel wird festgehalten, aber NICHT gerechnet:
  -- jeder im Kurs bekommt dasselbe. Sie steht hier, damit sich später
  -- beantworten lässt, wie viel jemand beigetragen hatte.
  select count(*) into v_terms
    from wc_notes
   where cluster_id = v_cluster and board_key = p_board and user_id = v_user;

  -- FIX 0076: ein vorhandenes Monster gewinnt (Cluster-Starthilfe).
  -- Seit 0076 wirft die Starthilfe für game20 ohnehin nur noch aus
  -- starter_pool = {snail, fish}, das Startmonster hält also dasselbe
  -- Versprechen wie wc_creature(). Ersetzt wird es trotzdem nicht — was
  -- schon da ist, schlüpft nicht noch einmal.
  select creature into v_have
    from game_state where user_id = v_user and game_id = p_board;

  v_creature := coalesce(v_have, wc_creature(p_board));
  v_award    := case when v_have is null then COINS else 0 end;

  insert into wc_rewards (cluster_id, board_key, user_id, creature, coins,
                          terms_at_hatch, hatched_at)
  values (v_cluster, p_board, v_user, v_creature, v_award, v_terms, now())
  on conflict (cluster_id, board_key, user_id) do update set
    creature       = excluded.creature,
    coins          = excluded.coins,
    terms_at_hatch = excluded.terms_at_hatch,
    hatched_at     = excluded.hatched_at;

  -- growth bleibt 0 — diese Kachel wächst nicht. coins steht bewusst
  -- NICHT im do-update-Zweig, sondern wird addiert: nach einem wc_reset
  -- ist das der zweite Durchlauf, und die Münzen des ersten sind
  -- verdient (dieselbe Überlegung wie in 0067).
  --
  -- creature und growth seit 0076 bedingt, siehe board_claim_reward.
  insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
  values (v_user, p_board, 0, 1, v_creature, 0, v_award, now())
  on conflict (user_id, game_id) do update set
    creature      = coalesce(game_state.creature, excluded.creature),
    growth        = case when game_state.creature is null then 0 else game_state.growth end,
    rounds_played = 1,
    coins         = game_state.coins + v_award,
    updated_at    = now();

  if v_award = 0 then
    return jsonb_build_object('ok', true, 'event', 'none');
  end if;

  -- wallets.coins ist der redundante Gesamtstand und wird sonst nur in
  -- sync_game_state nachgezogen. Ohne diese Zeilen liefe die Rangliste
  -- auseinander, bis der User irgendein Spiel spielt.
  select coalesce(sum(coins), 0)::int into v_sum
    from game_state where user_id = v_user;
  insert into wallets (user_id, coins, updated_at)
  values (v_user, v_sum, now())
  on conflict (user_id) do update set
    coins      = v_sum,
    updated_at = now();

  -- Kein add_bonbons: das Bonbon-System gehört der Season 3 (0071).
  -- Eine Season-1-Kachel macht dafür keine neue Quelle auf.
  return jsonb_build_object(
    'ok', true, 'event', 'hatch',
    'creature',     v_creature,
    'terms',        coalesce(v_terms, 0),
    'coins_gained', v_award,
    'phase',        v_pmax
  );
end;
$$;

revoke all on function wc_claim_reward(uuid, text) from public;
grant execute on function wc_claim_reward(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Altbestand — game20-Startmonster außerhalb {snail, fish}
-- ─────────────────────────────────────────────────────────────
-- Punkt 3 verhindert nur neue. Wer sich zwischen 0075 und heute
-- angemeldet hat, trägt auf „Warum Tablets?" womöglich einen Drachen
-- oder ein Epic — und behält es ab jetzt, weil Punkt 6 nichts mehr
-- ersetzt. Das widerspräche dem Versprechen der Kachel, dass dort für
-- alle dasselbe liegt.
--
-- Die vier Nullbedingungen und die fehlende wc_rewards-Zeile grenzen
-- die unangetastete Starthilfe-Zeile ein: wc_claim_reward setzt
-- rounds_played = 1 und schreibt einen Beleg, ein Wachstumstrank hübe
-- growth, ein Spiel gäbe es hier gar nicht. Bleibt nur, was die
-- Starthilfe gelegt und noch niemand angefasst hat.
update game_state
   set creature   = case when random() < 0.5 then 'snail' else 'fish' end,
       updated_at = now()
 where game_id = 'game20'
   and creature is not null
   and creature not in ('snail', 'fish')
   and coalesce(points, 0)        = 0
   and coalesce(rounds_played, 0) = 0
   and coalesce(growth, 0)        = 0
   and coalesce(coins, 0)         = 0
   and not exists (
     select 1 from wc_rewards r
      where r.user_id = game_state.user_id and r.board_key = 'game20'
   );
