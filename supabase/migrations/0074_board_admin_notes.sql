-- ══════════════════════════════════════════════════════════════
-- Migration 0074 — Reality Check: Karten der Lehrkraft
-- ══════════════════════════════════════════════════════════════
-- Anlass: Admins bekommen im Erfassungs-Formular vorgefertigte
-- Recherchen (js/presets.js), die sie in Phase 3 in die Besprechung
-- werfen können — der Kurs findet nicht alles selbst, und ein Beleg,
-- der zur richtigen Zeit auf dem Board liegt, trägt das Gespräch.
--
-- Damit werden Admin-Karten vom Sonderfall zum Regelfall. Zwei Dinge
-- müssen deshalb nachziehen:
--
--   1. Der Client muss sie ERKENNEN können — sie bekommen einen Rahmen,
--      damit auf einen Blick klar ist, dass die Karte nicht aus dem
--      Kurs kommt. board_get liefert dafür `by_admin` je Karte.
--
--   2. Sie dürfen die BELOHNUNG nicht verschieben. board_claim_reward
--      misst Teil A an
--          schwelle_A = 1,5 × 10 × (alle Zustimmungen / alle Post-Its)
--      und beides lief bisher über sämtliche Karten des Kurses. Eine
--      Lehrkraft-Karte mit viel Zustimmung hebt die Schwelle für die
--      ganze Klasse, ohne dass sie irgendjemandem gutgeschrieben wird
--      (Admins holen keine Belohnung ab, 0069 §Admin-Riegel). Ein
--      Post-It der Lehrkraft ohne Zustimmung senkt sie umgekehrt.
--      Beides ist eine stille Balance-Änderung durch eine Handlung, die
--      mit der Leistung des Kurses nichts zu tun hat.
--
--      Also: Karten von Admins zählen weder im Zähler noch im Nenner.
--      Dieselbe Bedingung, mit der 0069 schon die Mitgliederzahl
--      bereinigt (`not is_admin and not is_superadmin`) — bewusst
--      wortgleich, damit die drei Stellen zusammenbleiben.
--
--      Was NICHT geändert wird: Zustimmung auf Lehrkraft-Karten bleibt
--      erlaubt. Sie ist Teil des Gesprächs ("da stimme ich zu"), sie
--      zählt nur nirgends mit — genau wie gegebene Zustimmung seit
--      0069 überhaupt nicht mehr zählt.
--
-- Kein DROP: beide Signaturen bleiben unverändert, reines
-- create or replace. Basis ist jeweils der HÖCHSTE bestehende Stand:
--   • board_get           ← 0066 (Kontingent 10/5)
--   • board_claim_reward  ← 0069 (Wachstum zweiteilig)
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) board_get — `by_admin` je Karte
-- ─────────────────────────────────────────────────────────────
-- Einzige Änderung gegenüber 0066: das neue Feld im jsonb_build_object.
-- Es beschreibt die VERFASSERIN der Karte, nicht die betrachtende
-- Person — `is_admin` auf oberster Ebene (wer schaut gerade?) bleibt
-- davon unberührt.
create or replace function board_get(p_cluster_id uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_phase   int;
  v_name    text;
  v_notes   jsonb;
  v_ideas   int;
  v_facts   int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  select name into v_name from clusters where id = v_cluster;

  -- Fehlende Zeile = Phase 1.
  select phase into v_phase from board_state where cluster_id = v_cluster;
  v_phase := coalesce(v_phase, 1);

  select coalesce(jsonb_agg(t.x order by t.created_at), '[]'::jsonb)
    into v_notes
    from (
      select n.created_at, jsonb_build_object(
               'id',            n.id,
               'kind',          n.kind,
               'category',      n.category,
               'stance',        n.stance,
               'topics',        to_jsonb(n.topics),
               'text',          n.body,
               'author',        pr.display_name,
               'user_id',       n.user_id,
               'is_mine',       (n.user_id = v_user),
               -- Neu (0074): kommt die Karte von der Lehrkraft? Der
               -- Client rahmt sie damit ein. left join oben heißt:
               -- fehlt das Profil, ist die Antwort false — eine Karte
               -- ohne Profil ist keine Lehrkraft-Karte.
               'by_admin',      (coalesce(pr.is_admin, false) or coalesce(pr.is_superadmin, false)),
               'likes',         (select count(*) from board_likes bl where bl.note_id = n.id),
               'liked_by_me',   exists (select 1 from board_likes bl
                                         where bl.note_id = n.id and bl.user_id = v_user),
               'source_url',    n.source_url,
               'source_author', n.source_author,
               'source_date',   n.source_date,
               'created_at',    n.created_at,
               'updated_at',    n.updated_at
             ) as x
        from board_notes n
        left join profiles pr on pr.id = n.user_id
       where n.cluster_id = v_cluster
    ) t;

  select count(*) filter (where kind = 'idee'),
         count(*) filter (where kind = 'fakt')
    into v_ideas, v_facts
    from board_notes
   where cluster_id = v_cluster and user_id = v_user;

  return jsonb_build_object(
    'ok',           true,
    'cluster_id',   v_cluster,
    'cluster_name', v_name,
    'phase',        v_phase,
    'is_admin',     is_any_admin(),
    'notes',        v_notes,
    'me', jsonb_build_object(
            'user_id',     v_user,
            'ideas_used',  coalesce(v_ideas, 0),
            'ideas_max',   10,
            'facts_used',  coalesce(v_facts, 0),
            'facts_max',   5
          )
  );
end;
$$;

revoke all on function board_get(uuid) from public;
grant execute on function board_get(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) board_claim_reward — Lehrkraft-Karten zählen nicht mit
-- ─────────────────────────────────────────────────────────────
-- Basis 0069, wortgleich übernommen. Geändert sind ausschließlich die
-- beiden Abfragen, die Teil A speisen (v_total/v_given/v_recv und
-- v_notes): beide filtern jetzt Karten von Admins heraus.
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
  -- Hier ist kein Admin-Filter nötig — gezählt werden nur die eigenen
  -- Karten, und wer hier ankommt, ist kein Admin.
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
    -- Und seit 0074: nur Zustimmungen auf Karten des KURSES. Was auf
    -- einer Lehrkraft-Karte liegt, ist Gesprächsstoff, keine Leistung
    -- des Kurses — es gehört weder in den Zähler noch (über v_notes)
    -- in den Nenner der Schwelle.
    --
    -- v_given wird nur noch protokolliert, nicht mehr gerechnet — siehe
    -- Kopfkommentar von 0069, Punkt 2.
    select count(*),
           count(*) filter (where bl.user_id = v_user),
           count(*) filter (where n.user_id  = v_user)
      into v_total, v_given, v_recv
      from board_likes bl
      join board_notes n  on n.id  = bl.note_id
      left join profiles pr on pr.id = n.user_id
     where n.cluster_id = v_cluster and n.kind = 'idee'
       and not coalesce(pr.is_admin, false)
       and not coalesce(pr.is_superadmin, false);

    -- Der Nenner der Schwelle. Alle Post-Its des Kurses, nicht nur die
    -- eigenen — die Schwelle ist für den ganzen Kurs dieselbe. Karten
    -- der Lehrkraft gehören nicht dazu (0074).
    select count(*) into v_notes
      from board_notes n
      left join profiles pr on pr.id = n.user_id
     where n.cluster_id = v_cluster and n.kind = 'idee'
       and not coalesce(pr.is_admin, false)
       and not coalesce(pr.is_superadmin, false);

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
