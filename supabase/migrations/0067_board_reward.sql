-- ══════════════════════════════════════════════════════════════
-- Migration 0067 — Reality Check: Monster, Wachstum, Belohnung
-- ══════════════════════════════════════════════════════════════
-- game19 war bis hierher die einzige Kachel ohne Belohnung („Belohnung
-- folgt…"). Diese Migration liefert sie nach — und zwar serverseitig,
-- anders als bei Startup Story (game18), wo der Hub aus dem eigenen
-- Spielstands-Blob ableitet.
--
-- Der Grund für den Unterschied: die Bemessungsgrundlage gehört hier
-- dem KURS (board_notes, board_likes) und nicht dem einzelnen User,
-- und der Auslöser ist eine Handlung der LEHRKRAFT (Phasenwechsel).
-- Beides kann ein Client weder allein sehen noch allein entscheiden.
--
-- ── Die zwei Momente ──────────────────────────────────────────
--   Phase 1 zum ersten Mal beendet (→ 2)  ⇒ das Ei schlüpft
--   Phase 2 zum ersten Mal beendet (→ 3)  ⇒ das Monster wächst
--
-- „Zum ersten Mal" braucht eine eigene Marke: board_state.phase reicht
-- nicht, weil die Lehrkraft ausdrücklich zurückschalten darf (0062 §8)
-- — im Unterricht lässt man nochmal eine Runde sammeln. Ein Rückschritt
-- darf die Belohnung weder ein zweites Mal auslösen noch zurücknehmen.
-- Dafür ist phase_max da: monoton, kennt nur eine Richtung.
--
-- ── Was wie berechnet wird ────────────────────────────────────
-- Schlüpfen: die Anzahl der eigenen Post-Its deckelt, wie hoch das
-- Monster in der Hubpunkte-Leiter stehen kann (10 Post-Its = alles ist
-- möglich, 5 = höchstens Stufe 5). Season-Rare und Epics sind von der
-- Deckelung ausdrücklich AUSGENOMMEN — sie fallen bei einem Post-It
-- genauso wie bei zehn. Wer wenig schreibt, bekommt ein kleineres
-- Monster, aber nicht weniger Glück.
--
-- Wachsen: Anteil an den Zustimmungen des Kurses, gemessen am
-- Kursdurchschnitt:
--     schwelle = 2 × alle Zustimmungen / alle Kursmitglieder
--     growth   = 21 × min(1, (gegeben + bekommen) / schwelle)
-- Gegebene Zustimmungen sind bewusst NICHT gedeckelt: wer viel liest
-- und viel zustimmt, wächst besser. Die Regel wird den SuS nicht
-- erklärt — im Spiel steht nirgends, woran das Monster hängt.
--
-- Münzen = 30 × growth/21, Bonbons = Münzen. Die Bonbons laufen über
-- add_bonbons() (0053), das seine Bedingungen selbst prüft: Admins,
-- Season < 3 und ein bereits freigeschaltetes Cluster-Legendär werden
-- dort abgewiesen. Bewusst NICHT über award_game_bonbons() wie bei
-- Startup Story — das deckelt auf 10 und legt den +20-Tagesbonus drauf,
-- der an eine gespielte Runde gebunden ist. Beides passt hier nicht.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) board_state.phase_max — monotone Höchstmarke
-- ─────────────────────────────────────────────────────────────
alter table board_state
  add column if not exists phase_max int not null default 1;

-- Backfill für Kurse, die schon laufen: was erreicht war, bleibt
-- erreicht. greatest gegen den Default, damit ein erneutes Ausführen
-- der Migration nichts zurückdreht.
--
-- Für laufende Kurse heißt das: wer gerade in Phase 3 steht, bekommt
-- beim nächsten Öffnen Schlüpfen UND Wachsen nachgereicht — die Arbeit
-- ist ja getan. Nur wer inzwischen zum Sammeln zurückgeschaltet hat,
-- steht auf 1 und braucht einen Klick nach vorn; die alte Tabelle
-- kennt keine Historie, aus der sich mehr rekonstruieren ließe.
update board_state set phase_max = greatest(phase, phase_max)
 where phase_max < phase;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'board_state_phase_max_range'
       and conrelid = 'board_state'::regclass
  ) then
    alter table board_state
      add constraint board_state_phase_max_range
      check (phase_max between 1 and 3);
  end if;
end $$;

comment on column board_state.phase_max is
  'Höchste je erreichte Phase. Anders als phase monoton — die Lehrkraft '
  'darf zurückschalten, die Belohnung wird davon nicht berührt.';


-- ─────────────────────────────────────────────────────────────
-- 2) board_rewards — der Vergabe-Vermerk
-- ─────────────────────────────────────────────────────────────
-- Eine Zeile je (User, Kurs). Sie ist zugleich der Riegel gegen eine
-- zweite Vergabe: der Poll im Board ruft board_claim_reward alle paar
-- Sekunden auf, und auf einem zweiten Tablet läuft derselbe Aufruf.
--
-- Die Like-Zahlen stehen nicht wegen der Anzeige hier — sie erscheinen
-- nirgends in der Oberfläche. Sie stehen hier, damit sich beantworten
-- lässt, warum ein Monster so groß geworden ist, wenn jemand fragt.
create table if not exists board_rewards (
  cluster_id     uuid not null references clusters(id)   on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,

  creature       text,
  ideas_at_hatch int,
  hatched_at     timestamptz,

  growth         int,
  coins          int,
  bonbons        int,
  likes_given    int,
  likes_received int,
  likes_total    int,
  members        int,
  grown_at       timestamptz,

  primary key (cluster_id, user_id)
);

create index if not exists board_rewards_user_idx on board_rewards(user_id);

alter table board_rewards enable row level security;

do $$
begin
  -- Die eigene Zeile. Geschrieben wird ausschließlich über den RPC,
  -- deshalb gibt es hier nur SELECT — wie bei board_notes/board_state.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_rewards'
       and policyname = 'br_select_own'
  ) then
    create policy br_select_own on board_rewards
      for select using (user_id = auth.uid());
  end if;

  -- Admins sehen die Vergaben der Kurse, die sie moderieren —
  -- Subquery-Policy analog bn_select_admin (0062).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'board_rewards'
       and policyname = 'br_select_admin'
  ) then
    create policy br_select_admin on board_rewards
      for select using (
        is_any_admin() and (
          (select p.is_superadmin from profiles p where p.id = auth.uid())
          or cluster_id in (
            select c.id from clusters c where c.school_id = my_school_id()
          )
        )
      );
  end if;
end $$;

comment on table board_rewards is
  'Belohnungs-Vergabe des Reality Check je (Kurs, User). Existenz von '
  'hatched_at/grown_at ist der Idempotenz-Riegel; board_reset löscht die '
  'Zeile und gibt einen zweiten Durchlauf frei.';


-- ─────────────────────────────────────────────────────────────
-- 3) board_creature(p_cap) → text
-- ─────────────────────────────────────────────────────────────
-- Spiegelt determineStartupCreature() und determineEpicCreature()
-- (S3-Zweig) aus GameHub/creatures.js. Wer dort die Pools ändert, muss
-- hier mitziehen — die Listen stehen an zwei Orten, weil der Roll für
-- game18 im Client und für game19 im Server passiert.
--
-- Verteilung:  5 % Epic · 20 % Libelle (S3-Rare) · 75 % Normal.
-- Nur der Normalen-Pool wird von p_cap gedeckelt; die Leiter ist
-- dieselbe wie in determineCreature(), und alle drei Seasons sind
-- darin vertreten (frosch/pinguin/raptor aus S2, krabbe/hai aus S3).
create or replace function board_creature(p_cap int)
  returns text
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_cap     int   := greatest(0, least(10, coalesce(p_cap, 0)));
  v_roll    float := random();
  v_epics   text[] := array['butterfly','snaildragon','turtle','chamaeleon','hippogreif'];
  v_normals text[] := array[
    'snail', 'frosch', 'krabbe',       -- ab  0 Hubpunkten
    'fish',                            -- ab  3
    'pinguin',                         -- ab  4
    'chicken',                         -- ab  5
    'hai',                             -- ab  6
    'salamander', 'raptor',            -- ab  7
    'falkeneule',                      -- ab  8
    'triceratops',                     -- ab  9
    'dragon'                           -- ab 10
  ];
  v_mins    int[]  := array[0,0,0, 3, 4, 5, 6, 7,7, 8, 9, 10];
  v_pool    text[];
begin
  if v_roll < 0.05 then
    return v_epics[1 + floor(random() * array_length(v_epics, 1))::int];
  end if;
  if v_roll < 0.25 then
    return 'libelle';
  end if;

  select array_agg(t.c order by t.ord)
    into v_pool
    from unnest(v_normals, v_mins) with ordinality as t(c, m, ord)
   where t.m <= v_cap;

  -- Kann nicht leer werden (drei Einträge stehen auf 0), aber ein
  -- NULL-Index wäre ein stiller Totalausfall der Belohnung.
  if v_pool is null or array_length(v_pool, 1) is null then
    return 'snail';
  end if;

  return v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
end;
$$;

revoke all on function board_creature(int) from public;
grant execute on function board_creature(int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) board_set_phase — pflegt zusätzlich phase_max
-- ─────────────────────────────────────────────────────────────
-- Basis: 0062 §8, unverändert bis auf die neue Spalte. Signatur
-- bleibt gleich, deshalb reines create or replace ohne DROP.
create or replace function board_set_phase(p_cluster_id uuid, p_phase int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_phase is null or p_phase < 1 or p_phase > 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  insert into board_state (cluster_id, phase, phase_max, updated_at, updated_by)
  values (v_cluster, p_phase, p_phase, now(), v_user)
  on conflict (cluster_id) do update set
    phase      = excluded.phase,
    phase_max  = greatest(board_state.phase_max, excluded.phase),
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'phase', p_phase);
end;
$$;

revoke all on function board_set_phase(uuid, int) from public;
grant execute on function board_set_phase(uuid, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) board_reset — gibt auch die Belohnung wieder frei
-- ─────────────────────────────────────────────────────────────
-- Basis: 0062 §9. Neu sind phase_max = 1 und das Löschen der
-- Vergabe-Vermerke: derselbe Kurs, der die Einheit noch einmal macht,
-- soll auch wieder ein Monster bekommen können.
--
-- Was NICHT passiert: game_state wird nicht angefasst. Das alte
-- Monster bleibt während der neuen Phase 1 auf der Kachel stehen und
-- wird erst beim erneuten Schlüpfen ersetzt — so gibt es keine Lücke,
-- in der die Kachel leer wäre. Die verdienten Münzen des ersten
-- Durchlaufs bleiben ebenfalls (siehe §6, Schritt „Schlüpfen").
create or replace function board_reset(p_cluster_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user    uuid := auth.uid();
  v_cluster uuid;
  v_deleted int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  v_cluster := board_target_cluster(p_cluster_id);
  if v_cluster is null then
    return jsonb_build_object('ok', false, 'error', 'no_cluster');
  end if;

  delete from board_notes where cluster_id = v_cluster;
  get diagnostics v_deleted = row_count;

  delete from board_rewards where cluster_id = v_cluster;

  insert into board_state (cluster_id, phase, phase_max, updated_at, updated_by)
  values (v_cluster, 1, 1, now(), v_user)
  on conflict (cluster_id) do update set
    phase      = 1,
    phase_max  = 1,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function board_reset(uuid) from public;
grant execute on function board_reset(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) board_claim_reward(p_cluster_id default null) → jsonb
-- ─────────────────────────────────────────────────────────────
-- Ein Aufruf für beide Momente, idempotent. Der Client ruft ihn beim
-- Öffnen des Boards, bei jedem Phasenwechsel und beim Hub-Boot auf —
-- wer zuerst kommt, sieht die Sequenz; alle weiteren Aufrufe bekommen
-- event = 'none'.
--
-- Antwort:
--   { ok, event: 'hatch' | 'grow' | 'none', creature, ideas, cap,
--     growth_before, growth_after, coins_gained, bonbons_gained, phase }
create or replace function board_claim_reward(p_cluster_id uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  GROWTH_MAX  constant int := 21;   -- creatures.js: GROWTH_MAX
  COINS_MAX   constant int := 30;   -- Münzen bei voll ausgewachsen
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
  v_threshold numeric;
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
  if v_pmax >= 2 and (not found or v_rw.hatched_at is null) then
    select count(*) into v_ideas
      from board_notes
     where cluster_id = v_cluster and user_id = v_user and kind = 'idee';

    v_cap      := least(10, coalesce(v_ideas, 0));
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
    select count(*),
           count(*) filter (where bl.user_id = v_user),
           count(*) filter (where n.user_id  = v_user)
      into v_total, v_given, v_recv
      from board_likes bl
      join board_notes n on n.id = bl.note_id
     where n.cluster_id = v_cluster and n.kind = 'idee';

    select count(*) into v_members
      from profiles
     where cluster_id = v_cluster
       and not coalesce(is_admin, false)
       and not coalesce(is_superadmin, false);

    -- Kursdurchschnitt als Maßstab. Jede Zustimmung zählt zweimal —
    -- einmal beim Gebenden, einmal beim Empfangenden — deshalb ist
    -- 2 × alle/Mitglieder genau der Schnitt von (gegeben + bekommen).
    -- Wer normal mitmacht, wächst also voll aus; das ist die gewollte
    -- großzügige Auslegung.
    --
    -- Randfall: ein Kurs, in dem fast niemand zugestimmt hat, hat eine
    -- Schwelle unter 1 — dort reicht eine einzige Zustimmung für ein
    -- ausgewachsenes Monster. Das ist hingenommen: eine Stunde ohne
    -- Zustimmungen ist ein Unterrichts-, kein Balanceproblem.
    if coalesce(v_total, 0) = 0 or coalesce(v_members, 0) = 0 then
      v_growth := 0;
    else
      v_threshold := 2.0 * v_total / v_members;
      v_growth := round(
        GROWTH_MAX * least(1.0, (v_given + v_recv)::numeric / v_threshold)
      )::int;
    end if;

    v_coins := round(COINS_MAX::numeric * v_growth / GROWTH_MAX)::int;

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
           grown_at       = now()
     where cluster_id = v_cluster and user_id = v_user;

    return jsonb_build_object(
      'ok', true, 'event', 'grow',
      'creature',       v_rw.creature,
      'ideas',          coalesce(v_rw.ideas_at_hatch, 0),
      'cap',            least(10, coalesce(v_rw.ideas_at_hatch, 0)),
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
