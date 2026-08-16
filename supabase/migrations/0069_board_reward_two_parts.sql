-- ══════════════════════════════════════════════════════════════
-- Migration 0069 — Reality Check: Wachstum zweiteilig
-- ══════════════════════════════════════════════════════════════
-- Ersetzt die Wachstums-Regel aus 0067. Das Schlüpfen (welches Monster)
-- bleibt unverändert — nur die Frage „wie groß" wird neu beantwortet.
--
-- ── Was an der alten Regel falsch war ─────────────────────────
-- 0067 rechnete:
--     schwelle = 2 × alle Zustimmungen / alle Kursmitglieder
--     growth   = 21 × min(1, (gegeben + bekommen) / schwelle)
--
-- Weil jede Zustimmung einmal beim Gebenden und einmal beim
-- Empfangenden zählt, gilt Σ(gegeben+bekommen) = 2 × alle. Die
-- „schwelle" WAR damit exakt der Kursmittelwert des gemessenen Werts —
-- die Regel war also rein relativ, obwohl sie sich absolut las. Zwei
-- Folgen, beide unerwünscht:
--
--   1. Like-Verteilungen sind rechtsschief (ein paar Vielklicker), der
--      Median liegt unter dem Mittelwert. Mehr als die Hälfte des
--      Kurses fiel deshalb unter die Schwelle — gedacht war „wer normal
--      mitmacht, wächst voll aus".
--   2. Gegebene Zustimmungen gingen ungedeckelt in den eigenen Wert UND
--      in die Schwelle aller anderen ein. Wer sich durch alle Karten
--      doppeltippte, maxte sich in 30 Sekunden selbst aus und drückte
--      dabei den ganzen Kurs. Genau die falsche Anreizrichtung für eine
--      Kachel, deren Zweck Lesen und Abwägen ist.
--
-- ── Die neue Regel ────────────────────────────────────────────
-- Zwei Teile zu je 50 %:
--
--   Teil A — Zustimmung, die man BEKOMMEN hat
--     schwelle_A = 1,5 × 10 × (alle Zustimmungen / alle Post-Its)
--     teil_A     = min(1, bekommen / schwelle_A)
--
--     Der Bruch (alle Zustimmungen / alle Post-Its) ist die
--     durchschnittliche Zustimmung je Karte; mal 10 (das volle
--     Post-It-Kontingent aus 0066) ergibt das, was jemand mit
--     ausgeschöpftem Kontingent im Schnitt bekäme. Der Faktor 1,5
--     verlangt, deutlich darüber zu liegen.
--
--     GEGEBENE Zustimmungen zählen nicht mehr mit. Damit dreht sich der
--     Exploit von oben um: Vielklicken hebt die Schwelle für alle, dem
--     Vielklicker selbst bringt es nichts — man kann die eigene Karte
--     nicht liken. Für alle anderen kürzt es sich fast heraus, weil die
--     zusätzlichen Likes im Zähler UND im Nenner landen.
--
--     Bewusst steht dort 10 und nicht „eigene Post-Its": das volle
--     Kontingent ist der Maßstab. Wer wenig schreibt, kann Teil A nicht
--     voll erreichen — die Menge der Post-Its zählt in Teil A mit.
--     Nebenwirkung, die dazugehört: der Durchschnitt eines Kurses
--     landet bei (Post-Its pro Kopf)/15, ein Kurs mit wenig Sammelzeit
--     also tiefer. Das ist gewollt, nicht übersehen.
--
--   Teil B — eigene Recherchen
--     teil_B = min(1, 0,20 × eigene Recherchen)
--     Fünf Recherchen sind das Kontingent (0066), fünf × 20 % = 100 %.
--     Anders als Teil A hängt dieser Teil an niemandem sonst.
--
--   anteil  = (teil_A + teil_B) / 2
--   growth  = 21 × anteil
--   coins   = 30 × anteil        (Bonbons = Münzen, wie bisher)
--
-- Beide Teile auf 100 % ⇒ volles Wachstum, 30 Münzen, 30 Bonbons. Ein
-- starker Teil gleicht einen schwachen zur Hälfte aus.
--
-- ── Was NICHT angefasst wird ──────────────────────────────────
-- board_creature(), das Schlüpfen, phase_max, board_reset, die
-- Antwortform des RPC. Der Client bleibt vollständig unverändert —
-- board.js und creatures.js lesen weiterhin nur growth_after,
-- coins_gained und bonbons_gained.
--
-- Kein DROP — Signatur unverändert, reines create or replace.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) board_rewards — Belege für die neue Rechnung
-- ─────────────────────────────────────────────────────────────
-- Die Tabelle beantwortet die Frage „warum ist mein Monster so groß",
-- wenn sie jemand stellt; angezeigt wird davon nichts. Mit der neuen
-- Regel gehören zwei Zahlen mehr dazu (die Post-Its des Kurses und die
-- eigenen Recherchen) sowie die beiden Teilergebnisse, damit man nicht
-- nachrechnen muss.
--
-- likes_given bleibt stehen, obwohl es nicht mehr in die Rechnung
-- eingeht: es ist die Zahl, an der man die alte Vergabe erkennt.
alter table board_rewards
  add column if not exists notes_total int,
  add column if not exists facts       int,
  add column if not exists part_a      int,
  add column if not exists part_b      int;

comment on column board_rewards.notes_total is
  'Alle Post-Its des Kurses zum Zeitpunkt der Vergabe — Nenner der Schwelle in Teil A.';
comment on column board_rewards.facts is
  'Eigene Recherchen zum Zeitpunkt der Vergabe — Teil B, 20 % je Stück.';
comment on column board_rewards.part_a is
  'Teil A in Prozent (bekommene Zustimmung gegen die Kursschwelle).';
comment on column board_rewards.part_b is
  'Teil B in Prozent (eigene Recherchen, 20 % je Stück).';


-- ─────────────────────────────────────────────────────────────
-- 2) board_claim_reward — neue Wachstums-Regel
-- ─────────────────────────────────────────────────────────────
-- Basis: 0067 §6. Der Schlüpf-Zweig ist wortgleich übernommen, geändert
-- ist ausschließlich der Wachstums-Zweig.
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
  -- Unverändert gegenüber 0067: die Zahl der eigenen Post-Its deckelt
  -- den Normalen-Pool, Epics und Season-Rare bleiben ungedeckelt.
  if v_pmax >= 2 and (not found or v_rw.hatched_at is null) then
    select count(*) into v_ideas
      from board_notes
     where cluster_id = v_cluster and user_id = v_user and kind = 'idee';

    v_cap      := least(IDEAS_MAX, coalesce(v_ideas, 0));
    v_creature := board_creature(v_cap);

    insert into board_rewards (cluster_id, user_id, creature, ideas_at_hatch, hatched_at)
    values (v_cluster, v_user, v_creature, v_ideas, now())
    on conflict (cluster_id, user_id) do update set
      creature       = excluded.creature,
      ideas_at_hatch = excluded.ideas_at_hatch,
      hatched_at     = excluded.hatched_at;

    -- coins steht bewusst NICHT im do-update: nach einem board_reset
    -- ist das hier der zweite Durchlauf, und die Münzen des ersten
    -- sind verdient. growth dagegen fängt wieder bei 0 an — das neue
    -- Monster hat noch nichts geleistet.
    insert into game_state (user_id, game_id, points, rounds_played, creature, growth, coins, updated_at)
    values (v_user, 'game19', 0, 1, v_creature, 0, 0, now())
    on conflict (user_id, game_id) do update set
      creature      = excluded.creature,
      growth        = 0,
      rounds_played = 1,
      updated_at    = now();

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

  -- ── Wachsen ───────────────────────────────────────────────
  if v_pmax >= 3 and v_rw.hatched_at is not null and v_rw.grown_at is null then

    -- Nur Zustimmungen auf Post-Its. Auf Recherchen gibt es seit 0064
    -- keine mehr (fact_not_likable); die Altstimmen von davor werden
    -- nirgends mehr angezeigt und dürfen deshalb auch nicht heimlich
    -- in die Rechnung eingehen.
    --
    -- v_given wird nur noch protokolliert, nicht mehr gerechnet — siehe
    -- Kopfkommentar, Punkt 2.
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
