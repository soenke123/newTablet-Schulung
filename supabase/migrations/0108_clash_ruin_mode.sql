-- ══════════════════════════════════════════════════════════════
-- Migration 0108 — Kingdoms of Mathoria: Ruinen-Modus
-- ══════════════════════════════════════════════════════════════
-- Bisher war ein ausgeschiedenes Volk raus: clash_view lieferte
-- `me.alive = false` und KEINE Aufgabe mehr, clash_submit_answer
-- antwortete mit 'team_eliminated'. In einer Klasse heißt das: ein
-- Viertel der Kinder sitzt zehn Minuten lang da und tut nichts,
-- während der Rest weiterspielt — und die Runde zieht sich, weil das
-- Spielfeld gleich groß bleibt.
--
-- Ab hier spielen ausgeschiedene Völker WEITER:
--
--   • Ihre richtigen Antworten zählen unverändert in correct_count
--     und damit in die Endwertung (clash_team_correct, 0099). Unter
--     den Ausgeschiedenen entscheidet genau diese Zahl den Platz —
--     sie stehen alle bei null Feldern (endRows in tool.js).
--   • Je 10 gesammelte Ruinen-Punkte verschwindet EIN Feld vom
--     Spielfeld (clash_shrink_board). Genommen wird es dem aktuell
--     GRÖSSTEN lebenden Volk, zufällig irgendwo aus dessen Gebiet,
--     nie eine Burg.
--   • Serien-Boni zählen dabei wie richtige Antworten: Team-Serie
--     = 5 Punkte, Einzel-Serie = 2 Punkte, jede richtige Antwort
--     selbst = 1 Punkt. Sie gehen NICHT in correct_count — die
--     Endwertung bleibt die echte Zahl beantworteter Aufgaben
--     (vom User am 2026-08-25 so entschieden).
--   • Höchstens bis zur HALBIERUNG des Startfeldes. Danach zählen
--     die Antworten weiter, aber die Karte bleibt, wie sie ist.
--
-- Nebenher justiert diese Migration die Serien-Schwellen aus 0106
-- neu (ebenfalls Wunsch des Users): Team-Bonus erobert **5** statt 7
-- Felder, die Einzel-Serie feuert bei jedem Vielfachen von **12**
-- statt 10.
--
-- ── Drei Grenzen für den Zufall (alle in clash_shrink_board) ────
-- Die Kachel wird ZUFÄLLIG gezogen — sie darf mitten aus dem Gebiet
-- verschwinden, Löcher im Volksgebiet sind ausdrücklich erwünscht
-- (so vom User entschieden, 2026-08-25). Begrenzt wird der Zufall
-- durch drei Bedingungen:
--
--   1. Burgen nie. Sie sind das Herz des Volkes, sie fallen nur
--      durch Eroberung.
--   2. Kein Volk fällt unter FÜNF Kacheln: als Opfer kommt nur in
--      Frage, wer mindestens sechs hat. Das ersetzt den früheren
--      Ein-Kachel-Riegel und ist zugleich der Grund, warum das
--      Schrumpfen kein clash_check_win braucht — es kann niemanden
--      ausscheiden lassen. (Der Riegel ist nicht doppelt gemoppelt
--      zu Punkt 1: seit 0100 werden Burgen übernommen statt
--      zerstört, ein Volk kann also ganz ohne Burg dastehen.)
--   3. Das Spielfeld bleibt IMMER zusammenhängend. Löcher — von
--      Kacheln umschlossene Lücken — sind in Ordnung, abgetrennte
--      Inseln nicht: clash_capture_random erobert ausschließlich
--      Kacheln, die an eigenes Gebiet grenzen, eine Insel wäre für
--      immer unerreichbar und die Runde nicht mehr zu gewinnen.
--
-- Punkt 3 wird gemessen, nicht geschätzt: für jede Kandidatenkachel
-- läuft eine Breitensuche (rekursives CTE über clash_is_neighbor)
-- über das Feld OHNE sie. Erreicht sie alle übrigen Kacheln, war die
-- Kandidatin kein Gelenkpunkt und darf gehen; sonst kommt die
-- nächste dran. Das ist der langweilige, aber offensichtlich
-- richtige Weg — eine Gelenkpunkt-Formel über den Nachbarring eines
-- Sechsecks wäre kürzer und deutlich schwerer zu glauben.
--
-- ⚠️ Neutrale Kacheln (Slot -1, 0105) werden NIE entfernt. Das sind
-- Innenlöcher; ihr Verschwinden brächte genau das Loch zurück, das
-- 0105 zugemacht hat.
--
-- ⚠️ Grundlage der neu deklarierten Funktionen ist jeweils die
-- höchste bestehende Fassung (per grep bestätigt): clash_submit_answer
-- → 0106, clash_view → 0106, clash_sig_of → 0106, clash_room_start →
-- 0106, clash_room_reset → 0106, clash_room_get → 0107.
-- Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP bis auf die eine unvermeidbare Check-Constraint (siehe
-- Abschnitt 3): zwei Check-Constraints würden UND-verknüpft, die
-- alte muss also weichen. Sie steht in einem DO-Block hinter einer
-- pg_catalog-Prüfung, nicht als blankes `drop … if exists`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_boards.initial_tiles — der Nenner der Halbierungsgrenze
-- ─────────────────────────────────────────────────────────────
alter table clash_boards add column if not exists initial_tiles int;

comment on column clash_boards.initial_tiles is
  'Kachelzahl beim Start dieser Runde (0108). Nenner der Halbierungsgrenze für den '
  'Ruinen-Modus: es dürfen nie mehr als floor(initial_tiles/2) Kacheln verschwinden. '
  'Wird in clash_room_start gesetzt und in clash_room_reset wieder geleert.';

-- Backfill für Räume, die schon laufen: dort ist noch nichts
-- geschrumpft (die Mechanik gibt es ja erst mit dieser Migration),
-- der aktuelle Stand IST also der Startstand.
update clash_boards b
   set initial_tiles = (select count(*) from clash_tiles t where t.room_id = b.room_id)
 where b.initial_tiles is null
   and b.phase in ('countdown', 'running');


-- ─────────────────────────────────────────────────────────────
-- 2) clash_team_streaks.ruin_points — der 10er-Zähler je Volk
-- ─────────────────────────────────────────────────────────────
alter table clash_team_streaks add column if not exists ruin_points int not null default 0;

comment on column clash_team_streaks.ruin_points is
  'Ruinen-Punkte dieses Volkes (0108) — sammelt sich NUR, solange das Volk ausgeschieden ist '
  '(keine eigene Kachel mehr). +1 je richtiger Antwort, +2 je Einzel-Serie, +5 je Team-Serie. '
  'Bei jedem überschrittenen Vielfachen von 10 verschwindet ein Feld (clash_shrink_board). '
  'Monoton steigend — das „schon eingelöst" steckt im floor-Vergleich, nicht in einem Abzug.';

comment on table clash_team_streaks is
  'Zustandszeile je (Raum, Volk). Geteilte Serie (0106) — NICHT die Summe der Einzel-Serien: '
  '+1 bei JEDER richtigen Antwort irgendeines Mitglieds, zurück auf 0 bei JEDEM Fehlversuch '
  'irgendeines Mitglieds. Seit 0108 zusätzlich ruin_points für den Ruinen-Modus.';


-- ─────────────────────────────────────────────────────────────
-- 3) clash_team_events.kind um 'board_shrink' erweitern
-- ─────────────────────────────────────────────────────────────
-- Eine zweite Check-Constraint danebenzusetzen hilft nicht: mehrere
-- Checks auf derselben Spalte gelten UND-verknüpft, die alte würde
-- 'board_shrink' weiterhin ablehnen. Also ersetzen — aber nur, wenn
-- sie da ist und den neuen Wert noch nicht kennt (idempotent, und
-- ohne blanke `drop … if exists`-Zeile).
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid)
    into v_def
    from pg_constraint c
    join pg_class     t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'clash_team_events'
     and c.conname = 'clash_team_events_kind_check';

  if v_def is not null and position('board_shrink' in v_def) = 0 then
    alter table clash_team_events drop constraint clash_team_events_kind_check;
    v_def := null;
  end if;

  if v_def is null then
    alter table clash_team_events
      add constraint clash_team_events_kind_check
      check (kind in ('individual_fire', 'team_fire', 'board_shrink'));
  end if;
end;
$$;

comment on table clash_team_events is
  'Passive Team-Benachrichtigungen (0106): „<Name> ist on fire" / „Ihr seid on fire", seit 0108 '
  'zusätzlich board_shrink („euer Volk hat ein Feld versinken lassen"). clash_view liefert nur '
  'die Zeilen des ANFRAGENDEN Teams zurück, clash_room_get (Beamer, 0107) die aller Völker. '
  'Wird bei jedem Insert auf die letzten 20 je Team getrimmt (clash_team_event_insert).';


-- ─────────────────────────────────────────────────────────────
-- 4) clash_shrink_state — eine Stelle für die Halbierungsgrenze
-- ─────────────────────────────────────────────────────────────
-- Vier Aufrufer brauchen dieselbe Rechnung (clash_shrink_board als
-- Sperre, clash_submit_answer/clash_view/clash_room_get als Anzeige)
-- — deshalb EINE Funktion statt vier Kopien einer Formel, die sich
-- auseinanderentwickeln.
create or replace function clash_shrink_state(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
    'tiles',         c.n,
    'initial_tiles', coalesce(b.initial_tiles, c.n),
    'removed',       greatest(coalesce(b.initial_tiles, c.n) - c.n, 0),
    'max_removals',  floor(coalesce(b.initial_tiles, c.n) / 2.0)::int,
    'floor_reached', (coalesce(b.initial_tiles, c.n) - c.n)
                       >= floor(coalesce(b.initial_tiles, c.n) / 2.0)::int,
    -- Gibt es überhaupt noch ein Volk, dem man etwas wegnehmen DARF?
    -- Die Fünf-Kachel-Untergrenze greift in der Praxis oft vor der
    -- Halbierung (vier Völker auf 37 Kacheln: bei 20 ist Schluss, die
    -- Grenze läge bei 19). Ohne dieses Feld verspräche der Banner den
    -- Ausgeschiedenen weiter ein versinkendes Feld, das nie kommt.
    -- Der Zusammenhangs-Test steckt NICHT hier drin — er kostet je
    -- Kachel eine Breitensuche und blockiert höchstens vorübergehend;
    -- diese Auskunft muss billig genug für jeden clash_view sein.
    'shrinkable',    exists (select 1
                               from clash_tiles t
                              where t.room_id = p_room
                                and t.owner_team >= 0
                              group by t.owner_team
                             having count(*) >= 6
                                and count(*) filter (where not t.is_castle) >= 1)
  )
  from clash_boards b,
       lateral (select count(*)::int as n from clash_tiles where room_id = p_room) c
   where b.room_id = p_room;
$$;

revoke all on function clash_shrink_state(uuid) from public;

comment on function clash_shrink_state(uuid) is
  'Stand des Spielfelds gegenüber seiner Startgröße (0108): wie viele Kacheln noch da sind, wie '
  'viele verschwunden sind, ob die Halbierungsgrenze erreicht ist (floor_reached) und ob es '
  'überhaupt noch ein Volk mit genug Kacheln gibt (shrinkable — die Fünf-Kachel-Untergrenze '
  'greift oft früher als die Halbierung). Interner Helfer — die Werte kommen über '
  'clash_view/clash_room_get als `board` heraus.';


-- ─────────────────────────────────────────────────────────────
-- 5) clash_shrink_board — eine Kachel verschwinden lassen
-- ─────────────────────────────────────────────────────────────
create or replace function clash_shrink_board(p_room uuid, p_by_team int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_board  clash_boards;
  v_cand   record;
  v_victim int;
  v_r      int;
  v_c      int;
  v_total  int;
  v_seed_r int;
  v_seed_c int;
  v_reach  int;
  v_tries  int := 0;
begin
  -- Die Board-Zeile ist hier die Sperre: Schrumpfen ist selten (alle
  -- zehn richtigen Antworten eines ausgeschiedenen Volkes), die
  -- Serialisierung kostet also nichts — verhindert aber, dass zwei
  -- Völker gleichzeitig über die Halbierungsgrenze rutschen.
  select * into v_board from clash_boards where room_id = p_room for update;
  if v_board.room_id is null then
    return jsonb_build_object('shrunk', false, 'reason', 'not_found');
  end if;

  if coalesce((clash_shrink_state(p_room)->>'floor_reached')::boolean, false) then
    return jsonb_build_object('shrunk', false, 'reason', 'floor_reached');
  end if;

  select count(*) into v_total from clash_tiles where room_id = p_room;

  -- Die Kandidatinnen: alle Nicht-Burg-Kacheln lebender Völker, die
  -- danach noch mindestens fünf Kacheln übrig hätten (g.n >= 6).
  -- Sortiert nach Volksgröße absteigend, innerhalb eines Volkes rein
  -- zufällig — mitten aus dem Gebiet ist genauso erlaubt wie vom
  -- Rand. Das größte Volk zuerst gleicht von selbst aus, ohne dass
  -- irgendwo ein Reihum-Zähler gepflegt werden müsste; sind alle
  -- seine Kacheln Gelenkpunkte, rutscht die Schleife zum
  -- nächstgrößeren weiter, statt gar nichts zu tun.
  -- Neutrale Kacheln (Slot -1) sind über owner_team >= 0 draußen.
  for v_cand in
    select t.r, t.c, t.owner_team
      from clash_tiles t
      join (select owner_team, count(*) as n
              from clash_tiles
             where room_id = p_room
               and owner_team >= 0
             group by owner_team) g on g.owner_team = t.owner_team
     where t.room_id = p_room
       and t.owner_team >= 0
       and not t.is_castle
       and g.n >= 6
     order by g.n desc, random()
  loop
    -- Deckel gegen den pathologischen Fall, dass fast jede Kachel
    -- ein Gelenkpunkt ist (lange dünne Ketten). Lieber einmal nicht
    -- schrumpfen als die Antwort des Kindes hängen lassen.
    v_tries := v_tries + 1;
    exit when v_tries > 40;

    -- Startpunkt der Breitensuche: irgendeine Kachel, die bliebe.
    select t.r, t.c
      into v_seed_r, v_seed_c
      from clash_tiles t
     where t.room_id = p_room
       and not (t.r = v_cand.r and t.c = v_cand.c)
     limit 1;
    exit when v_seed_r is null;

    -- Zusammenhang OHNE die Kandidatin: von einer Kachel aus alles
    -- ablaufen, was über Nachbarschaft erreichbar ist. `union`
    -- (nicht `all`) hält die Suche endlich — jede Kachel wird nur
    -- einmal aufgenommen.
    with recursive walk(r, c) as (
      select v_seed_r, v_seed_c
      union
      select t.r, t.c
        from clash_tiles t
        join walk w on clash_is_neighbor(w.r, w.c, t.r, t.c)
       where t.room_id = p_room
         and not (t.r = v_cand.r and t.c = v_cand.c)
    )
    select count(*) into v_reach from walk;

    -- Alle übrigen erreicht ⇒ kein Gelenkpunkt ⇒ diese darf gehen.
    if v_reach = v_total - 1 then
      v_victim := v_cand.owner_team;
      v_r      := v_cand.r;
      v_c      := v_cand.c;
      exit;
    end if;
  end loop;

  if v_r is null then
    return jsonb_build_object('shrunk', false, 'reason', 'no_target');
  end if;

  -- `not is_castle` steht hier ein zweites Mal: zwischen Auswahl und
  -- Löschen liegt keine Sperre auf der Kachelzeile, und eine Burg
  -- darf unter keinen Umständen verschwinden.
  delete from clash_tiles
   where room_id = p_room and r = v_r and c = v_c and not is_castle;

  if not found then
    return jsonb_build_object('shrunk', false, 'reason', 'no_target');
  end if;

  perform clash_team_event_insert(p_room, p_by_team, 'board_shrink',
    jsonb_build_object('r', v_r, 'c', v_c, 'victim', v_victim));

  return jsonb_build_object('shrunk', true, 'r', v_r, 'c', v_c, 'victim', v_victim);
end;
$$;

revoke all on function clash_shrink_board(uuid, int) from public;

comment on function clash_shrink_board(uuid, int) is
  'Lässt genau eine Kachel vom Spielfeld verschwinden (0108, Ruinen-Modus). Opfer ist das lebende '
  'Volk mit den meisten Feldern, die Kachel wird zufällig aus dessen Gebiet gezogen — Löcher sind '
  'erlaubt, aber das Spielfeld bleibt zusammenhängend (Gelenkpunkte werden per Breitensuche '
  'ausgeschlossen). Tabu: Burgen, neutrale Kacheln (Slot -1) und jedes Volk mit weniger als sechs '
  'Kacheln, damit keins unter fünf fällt. Trägt das Ereignis für das auslösende Volk in '
  'clash_team_events ein. Interner Helfer, kein Grant an anon/authenticated.';


-- ─────────────────────────────────────────────────────────────
-- 6) clash_submit_answer — Ruinen-Modus + neue Serien-Schwellen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0106. Drei Änderungen:
--   a) Der frühe `return 'team_eliminated'` wird zu einem ZWEIG
--      (v_ruined) statt zu einem Abbruch.
--   b) Einzel-Serie feuert bei jedem Vielfachen von 12 (war 10),
--      Team-Serie erobert 5 Felder (waren 7).
--   c) Ausgeschiedene bekommen statt Feldern Ruinen-Punkte; bei
--      jedem überschrittenen Vielfachen von 10 schrumpft das Feld.
create or replace function clash_submit_answer(p_token text, p_answer int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p               skill_participants;
  v_room            skill_rooms;
  v_board           clash_boards;
  v_player          clash_players;
  v_correct         boolean;
  v_retry           boolean := false;   -- erster Fehlversuch: Aufgabe bleibt stehen
  v_advance         boolean := false;   -- neue Aufgabe ziehen?
  v_ruined          boolean := false;   -- 0108: Volk hat keine Kachel mehr
  v_tr              int;
  v_tc              int;
  v_tprev           int;
  v_castle          boolean := false;
  v_taken           boolean := false;   -- Besitzer hat gewechselt
  v_hit_hp          int := null;        -- Burg getroffen, aber nicht gefallen
  v_cap_res         jsonb;
  v_fire_res        jsonb;
  v_streak_old      int;
  v_solo_fire       boolean := false;
  v_pending_add     int := 0;
  v_team_streak_old int;
  v_team_streak_new int;
  v_team_streak_out int;
  v_ruin_add        int := 0;           -- 0108
  v_ruin_old        int;
  v_ruin_new        int := null;
  v_shrunk          jsonb := '[]'::jsonb;
  v_shr             jsonb;
  v_steps           int;
  v_reveal_a        int;
  v_reveal_b        int;
  v_qa              int := null;
  v_qb              int := null;
  i                 int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  if v_board.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_running', 'phase', v_board.phase);
  end if;

  perform clash_ensure_player(v_p.id, v_room.id);
  select * into v_player from clash_players where participant_id = v_p.id;
  if v_player.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Fällige Auto-Picks (0106) zuerst auflösen — sonst könnte diese
  -- Antwort auf einem Kartenbild landen, das der Server selbst gleich
  -- noch ändert. Räumt bei einem inzwischen ausgeschiedenen Volk
  -- zugleich die offenen Picks weg (die Schleife dort bricht ab,
  -- wenn keine eigene Kachel mehr da ist).
  perform clash_expire_pending_picks(v_p.id);
  select * into v_player from clash_players where participant_id = v_p.id;

  -- 0108: KEIN Abbruch mehr. Ein Volk ohne Kachel spielt weiter, seine
  -- Antworten zählen für die Endwertung und lassen das Spielfeld
  -- schrumpfen.
  v_ruined := not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  );

  -- Randfall: keine laufende Frage (sollte durch clash_ensure_player/
  -- clash_room_start nicht vorkommen) — dann erst eine ziehen, ohne
  -- die abgegebene Zahl zu werten.
  if v_player.current_a is null then
    select q.a, q.b into v_qa, v_qb from clash_new_question() q;
    update clash_players set current_a = v_qa, current_b = v_qb, wrong_attempt = false
     where participant_id = v_p.id;
    return jsonb_build_object('ok', true, 'correct', null,
      'question', jsonb_build_object('a', v_qa, 'b', v_qb));
  end if;

  v_correct := (p_answer = v_player.current_a + v_player.current_b);

  if v_correct then
    v_advance := true;

    -- Erobern kann nur, wer noch ein Gebiet hat, an das sich etwas
    -- anschließen ließe.
    if not v_ruined then
      v_cap_res := clash_capture_random(v_room.id, v_player.team_index);
      if (v_cap_res->'captured') is not null then
        v_taken  := true;
        v_tr     := (v_cap_res->'captured'->>'r')::int;
        v_tc     := (v_cap_res->'captured'->>'c')::int;
        v_tprev  := (v_cap_res->'captured'->>'prev_owner')::int;
        v_castle := (v_cap_res->'captured'->>'castle')::boolean;
      elsif (v_cap_res->'castle_hit') is not null then
        v_tr     := (v_cap_res->'castle_hit'->>'r')::int;
        v_tc     := (v_cap_res->'castle_hit'->>'c')::int;
        v_tprev  := (v_cap_res->'castle_hit'->>'owner')::int;
        v_hit_hp := (v_cap_res->'castle_hit'->>'hp')::int;
      end if;
    end if;

    -- Individuelle Serie: seit 0108 jedes Vielfache von 12 (war 10).
    -- Ein ausgeschiedenes Volk kann nichts aussuchen — bei ihm werden
    -- aus den zwei Feldern zwei Ruinen-Punkte.
    v_streak_old := coalesce(v_player.streak, 0);
    if floor((v_streak_old + 1) / 12.0) > floor(v_streak_old / 12.0) then
      v_solo_fire := true;
      if v_ruined then
        v_ruin_add := v_ruin_add + 2;
      else
        v_pending_add := 2;
      end if;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1, wrong_attempt = false,
           pending_picks = pending_picks + v_pending_add,
           pick_deadline = case when v_pending_add > 0 then now() + interval '6 seconds'
                                 else pick_deadline end
     where participant_id = v_p.id;

    -- Gefeiert wird die Serie in beiden Fällen: „on fire" ist eine
    -- Nachricht an die Gruppe, keine Quittung über eroberte Felder.
    if v_solo_fire then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'individual_fire',
        jsonb_build_object('name', skill_seat_name(v_p.name, v_p.seat), 'streak', v_streak_old + 1));
    end if;

    -- Geteilte Team-Serie (0106) — unabhängig von den Einzel-Serien.
    -- Die Zeile sollte durch clash_room_start/den Backfill schon
    -- existieren; Insert ist nur ein Sicherheitsnetz.
    select streak, ruin_points into v_team_streak_old, v_ruin_old
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index
      for update;
    if v_team_streak_old is null then
      insert into clash_team_streaks (room_id, team_index, streak)
      values (v_room.id, v_player.team_index, 0)
      on conflict (room_id, team_index) do nothing;
      v_team_streak_old := 0;
      v_ruin_old := 0;
    end if;
    v_team_streak_new := v_team_streak_old + 1;
    update clash_team_streaks set streak = v_team_streak_new
     where room_id = v_room.id and team_index = v_player.team_index;
    v_team_streak_out := v_team_streak_new;

    if floor(v_team_streak_new / 20.0) > floor(v_team_streak_old / 20.0) then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'team_fire',
        jsonb_build_object('streak', v_team_streak_new));
      if v_ruined then
        v_ruin_add := v_ruin_add + 5;
      else
        -- Seit 0108 fünf Felder statt sieben.
        for i in 1..5 loop
          exit when not exists (
            select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
          );
          v_fire_res := clash_capture_random(v_room.id, v_player.team_index);
          exit when (v_fire_res->'captured') is null and (v_fire_res->'castle_hit') is null;
          if (v_fire_res->'captured') is not null and clash_check_win(v_room.id) then
            exit;
          end if;
        end loop;
      end if;
    end if;

    -- 0108: Ruinen-Punkte. Die Schwelle wird EINMAL geprüft, nicht je
    -- Teilbetrag — sonst zählte eine Antwort, die zugleich eine
    -- Einzel- und eine Team-Serie abschließt, dreimal gegen dieselbe
    -- Zehnerstufe. Die Schleife ist Vorsorge: heute liegt v_ruin_add
    -- bei höchstens 8 (1+2+5), überspringt also nie mehr als eine
    -- Stufe.
    if v_ruined then
      v_ruin_add := v_ruin_add + 1;
      v_ruin_old := coalesce(v_ruin_old, 0);
      v_ruin_new := v_ruin_old + v_ruin_add;
      update clash_team_streaks set ruin_points = v_ruin_new
       where room_id = v_room.id and team_index = v_player.team_index;

      v_steps := floor(v_ruin_new / 10.0)::int - floor(v_ruin_old / 10.0)::int;
      for i in 1..greatest(v_steps, 0) loop
        v_shr := clash_shrink_board(v_room.id, v_player.team_index);
        v_shrunk := v_shrunk || jsonb_build_array(v_shr);
        exit when not coalesce((v_shr->>'shrunk')::boolean, false);
      end loop;
    end if;

  elsif not coalesce(v_player.wrong_attempt, false) then
    -- Erster Fehlversuch zu dieser Aufgabe: nur „nochmal versuchen",
    -- die Aufgabe bleibt stehen. Streak bricht trotzdem sofort — das
    -- war schon vor 0101 so, und die Team-Serie folgt seit 0106
    -- exakt derselben Regel.
    v_retry := true;
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = true
     where participant_id = v_p.id;
    update clash_team_streaks set streak = 0
     where room_id = v_room.id and team_index = v_player.team_index;
    select streak into v_team_streak_out
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index;

  else
    -- Zweiter Fehlversuch in Folge: jetzt wird aufgelöst. current_a/
    -- current_b sind noch die der gescheiterten Aufgabe — merken,
    -- BEVOR sie gleich von der neuen überschrieben werden.
    v_advance := true;
    v_reveal_a := v_player.current_a;
    v_reveal_b := v_player.current_b;
    update clash_players
       set streak = 0, wrong_count = wrong_count + 1, wrong_attempt = false
     where participant_id = v_p.id;
    update clash_team_streaks set streak = 0
     where room_id = v_room.id and team_index = v_player.team_index;
    select streak into v_team_streak_out
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index;
  end if;

  if v_advance then
    select q.a, q.b into v_qa, v_qb from clash_new_question() q;
    update clash_players set current_a = v_qa, current_b = v_qb
     where participant_id = v_p.id;
  end if;

  -- Nur ein echter Besitzerwechsel kann ein Volk ausgelöscht haben.
  -- Das Schrumpfen kann es per Konstruktion nicht (Burgen sind tabu,
  -- und unter fünf Kacheln fällt niemand), deshalb steht hier
  -- weiterhin nur v_taken.
  if v_taken then
    perform clash_check_win(v_room.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'retry', v_retry,
    'eliminated', v_ruined,
    'reveal', case when v_reveal_a is not null
                 then jsonb_build_object('a', v_reveal_a, 'b', v_reveal_b,
                                         'sum', v_reveal_a + v_reveal_b)
                 else null end,
    'captured', case when v_taken
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'prev_owner', v_tprev,
                                         'castle', v_castle, 'hp', 3)
                 else null end,
    'castle_hit', case when v_hit_hp is not null
                 then jsonb_build_object('r', v_tr, 'c', v_tc, 'hp', v_hit_hp,
                                         'owner', v_tprev)
                 else null end,
    'streak', (select streak from clash_players where participant_id = v_p.id),
    'team_streak', v_team_streak_out,
    'ruin', case when v_ruin_new is null then null
                 else jsonb_build_object('points', v_ruin_new,
                                         'to_next', 10 - (v_ruin_new % 10)) end,
    'shrunk', v_shrunk,
    'board', clash_shrink_state(v_room.id),
    'pending_picks', (select pending_picks from clash_players where participant_id = v_p.id),
    'pick_deadline', (select pick_deadline from clash_players where participant_id = v_p.id),
    'question', case when v_advance
                 then jsonb_build_object('a', v_qa, 'b', v_qb)
                 else null end
  );
end;
$$;

revoke all on function clash_submit_answer(text, int) from public;
grant execute on function clash_submit_answer(text, int) to anon, authenticated;

comment on function clash_submit_answer(text, int) is
  'Eine Antwort abgeben. Seit 0101 zwei Versuche je Aufgabe, seit 0105 neutrale Kacheln bei der '
  'Sieg-Prüfung ausgenommen, seit 0106 Serien-Boni. Seit 0108 antwortet ein ausgeschiedenes Volk '
  'weiter (Ruinen-Modus): richtige Antworten zählen in correct_count und sammeln ruin_points, je '
  '10 Punkte verschwindet ein Feld. Serien-Schwellen seit 0108: Einzel jedes Vielfache von 12 '
  '(2 Picks bzw. 2 Ruinen-Punkte), Team jedes Vielfache von 20 (5 Felder bzw. 5 Ruinen-Punkte).';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_view — Aufgabe auch ohne Gebiet, Ruinen-Stand
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0106. Zwei Änderungen: die Aufgabe hängt nicht mehr an
-- v_alive, und `ruin`/`board` kommen dazu. me.alive bleibt erhalten —
-- daran unterscheidet der Client die beiden Spielbildschirme.
create or replace function clash_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p            skill_participants;
  v_room         skill_rooms;
  v_board        clash_boards;
  v_player       clash_players;
  v_my_team      int;
  v_alive        boolean := true;
  v_question     jsonb := null;
  v_teams        jsonb;
  v_correct      jsonb;
  v_my_members   jsonb := '[]'::jsonb;
  v_tiles        jsonb;
  v_online_count int;
  v_room_total   int;
  v_team_streak  int := null;
  v_ruin         int := null;
  v_events       jsonb := '[]'::jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;

  -- Muss VOR clash_preview_teams laufen, sonst zählt sich der
  -- aufrufende Teilnehmer bei einem gerade erst abgelaufenen
  -- 1-Minuten-Fenster selbst noch nicht als online.
  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  if v_board.phase = 'lobby' then
    select team_index into v_my_team
      from clash_preview_teams(v_room.id)
     where participant_id = v_p.id;
  else
    perform clash_ensure_player(v_p.id, v_room.id);
    perform clash_expire_pending_picks(v_p.id);   -- 0106
    select * into v_player from clash_players where participant_id = v_p.id;
    v_my_team := v_player.team_index;
    if v_board.phase = 'running' then
      v_alive := exists (
        select 1 from clash_tiles where room_id = v_room.id and owner_team = v_my_team
      );
      -- 0108: die Aufgabe hängt NICHT mehr an v_alive. Ein
      -- ausgeschiedenes Volk spielt weiter — ohne Aufgabe stünde sein
      -- Spielbildschirm leer da. Nur wer gar kein Volk hat (kam nach
      -- dem Start dazu und wurde noch nicht gelost), bekommt keine.
      if v_my_team is not null then
        v_question := jsonb_build_object('a', v_player.current_a, 'b', v_player.current_b);
      end if;
    end if;
  end if;

  -- Die eigene Gruppe, sortiert nach Sitzplatz, damit die Reihenfolge
  -- zwischen zwei Abrufen nicht springt. Ohne eigenes Volk (nicht
  -- online, noch keine Zuordnung) bleibt die Liste leer.
  if v_my_team is not null then
    if v_board.phase = 'lobby' then
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_preview_teams(v_room.id) t
        join skill_participants p on p.id = t.participant_id
       where t.team_index = v_my_team;
    else
      -- clash_players trägt keine room_id — der Join über den
      -- Teilnehmer grenzt auf diesen Raum ein.
      select coalesce(jsonb_agg(
               jsonb_build_object('name', skill_seat_name(p.name, p.seat),
                                  'me',   p.id = v_p.id)
               order by p.seat), '[]'::jsonb)
        into v_my_members
        from clash_players pl
        join skill_participants p on p.id = pl.participant_id
       where p.room_id = v_room.id and pl.team_index = v_my_team;

      -- Team-Serie + Ereignisse (0106), Ruinen-Punkte (0108) — nur ab
      -- dem Start, nur fürs eigene Team.
      select streak, ruin_points into v_team_streak, v_ruin
        from clash_team_streaks where room_id = v_room.id and team_index = v_my_team;

      select coalesce(jsonb_agg(
               jsonb_build_object('id', id, 'kind', kind, 'payload', payload) order by id), '[]'::jsonb)
        into v_events
        from clash_team_events
       where room_id = v_room.id and team_index = v_my_team;
    end if;
  end if;

  v_tiles := clash_tiles_json(v_room.id);

  v_correct := clash_team_correct(v_room.id);

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_correct_counts', v_correct,
    'team_streak', v_team_streak,
    'ruin', jsonb_build_object('points',  coalesce(v_ruin, 0),
                               'to_next', 10 - (coalesce(v_ruin, 0) % 10)),
    'board', clash_shrink_state(v_room.id),
    'my_team_members', v_my_members,
    'my_team_events', v_events,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'me', jsonb_build_object(
      'team',    v_my_team,
      'alive',   v_alive,
      'streak',  coalesce(v_player.streak, 0),
      'question', v_question,
      'seat',    v_p.seat,
      'name',    skill_seat_name(v_p.name, v_p.seat),
      'pending_picks', coalesce(v_player.pending_picks, 0),
      'pick_deadline', v_player.pick_deadline
    )
  );
end;
$$;

revoke all on function clash_view(text) from public;
grant execute on function clash_view(text) to anon, authenticated;

comment on function clash_view(text) is
  'Teilnehmer-Ansicht von Kingdoms of Mathoria. Seit 0098 my_team_members und me.name, seit 0099 '
  'team_correct_counts, seit 0100 Burg-Leben in der Kachelliste, seit 0106 team_streak/'
  'my_team_events/pending_picks. Seit 0108 bekommt auch ein ausgeschiedenes Volk seine Aufgabe '
  '(me.alive bleibt false — daran unterscheidet der Client den Ruinen-Bildschirm), dazu `ruin` '
  '(eigene Ruinen-Punkte) und `board` (Spielfeldgröße gegenüber dem Start).';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_room_get — Ruinen-Stand aller Völker für den Beamer
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0107. Neu sind `ruin` (je Volk) und `board`. Wie bei
-- team_events gilt: das Tablet sieht nur sein eigenes Volk, der
-- Beamer ist der Aushang und zeigt alle.
create or replace function clash_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
  v_teams jsonb;
  v_tiles jsonb;
  v_status jsonb;
  v_correct jsonb;
  v_members jsonb;
  v_offline jsonb;
  v_events jsonb := '[]'::jsonb;
  v_ruin   jsonb := '{}'::jsonb;
  v_online_count int;
  v_room_total   int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_ensure_board(v_room.id);
  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;
  perform skill_touch(v_room.id);

  select coalesce(jsonb_object_agg(team_index, cnt), '{}'::jsonb)
    into v_teams
    from (
      select team_index, count(*) as cnt
        from clash_preview_teams(v_room.id)
       group by team_index
    ) t;

  -- Namen je Team. Sortiert nach Sitzplatz, damit die Reihenfolge
  -- zwischen zwei Abrufen nicht springt.
  if v_board.phase = 'lobby' then
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select t.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_preview_teams(v_room.id) t
          join skill_participants p on p.id = t.participant_id
         group by t.team_index
      ) x;
  else
    -- clash_players trägt keine room_id — der Join über den
    -- Teilnehmer grenzt auf diesen Raum ein.
    select coalesce(jsonb_object_agg(team_index, names), '{}'::jsonb)
      into v_members
      from (
        select pl.team_index,
               jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat) as names
          from clash_players pl
          join skill_participants p on p.id = pl.participant_id
         where p.room_id = v_room.id
         group by pl.team_index
      ) x;
  end if;

  -- Wer im Raum ist, aber in keinem Team steht. Bewusst als Komplement
  -- zu clash_preview_teams statt mit einer eigenen Kopie der
  -- 90-Sekunden-Grenze: „nicht in einem Team ⇒ steht unten" soll auch
  -- dann noch gelten, wenn sich die Grenze einmal ändert.
  select coalesce(jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat), '[]'::jsonb)
    into v_offline
    from skill_participants p
   where p.room_id = v_room.id
     and p.id not in (select participant_id from clash_preview_teams(v_room.id));

  select count(*) into v_online_count from clash_preview_teams(v_room.id);
  select count(*) into v_room_total from skill_participants where room_id = v_room.id;

  v_tiles := clash_tiles_json(v_room.id);

  select coalesce(jsonb_object_agg(owner_team, cnt), '{}'::jsonb)
    into v_status
    from (
      select owner_team, count(*) as cnt
        from clash_tiles where room_id = v_room.id
       group by owner_team
    ) t;

  v_correct := clash_team_correct(v_room.id);

  -- 0107: die jüngsten Serien-Ereignisse aller Völker. Aufsteigend nach
  -- id ausgeliefert (der Client vergleicht gegen die höchste bereits
  -- gezeigte), aber absteigend AUSGEWÄHLT — sonst schnitte das Limit
  -- die neuen weg statt der alten. `team` statt `team_index`, weil der
  -- Beamer-Client sie nirgends nach Slots gruppiert; er schlägt das
  -- Volk am einzelnen Eintrag nach.
  select coalesce(jsonb_agg(
           jsonb_build_object('id', e.id, 'team', e.team_index,
                              'kind', e.kind, 'payload', e.payload)
           order by e.id), '[]'::jsonb)
    into v_events
    from (
      select id, team_index, kind, payload
        from clash_team_events
       where room_id = v_room.id
       order by id desc
       limit 40
    ) e;

  -- 0108: Ruinen-Stand je Volk. Nur Völker, die schon Punkte haben —
  -- ein lebendes Volk sammelt keine, seine Null stünde nur im Weg.
  select coalesce(jsonb_object_agg(team_index,
           jsonb_build_object('points', ruin_points, 'to_next', 10 - (ruin_points % 10))),
         '{}'::jsonb)
    into v_ruin
    from clash_team_streaks
   where room_id = v_room.id and ruin_points > 0;

  return jsonb_build_object(
    'ok', true,
    'phase', v_board.phase,
    'team_count', v_board.team_count,
    'factions', v_board.factions,
    'countdown_ends_at', v_board.countdown_ends_at,
    'match_ends_at', v_board.match_ends_at,
    'winner_team', v_board.winner_team,
    'broadcast_key', v_board.broadcast_key,
    'rows', v_board.grid_rows,
    'cols', v_board.grid_cols,
    'tiles', v_tiles,
    'teams', v_teams,
    'team_members', v_members,
    'offline_members', v_offline,
    'online_count', v_online_count,
    'room_total', v_room_total,
    'team_tile_counts', v_status,
    'team_correct_counts', v_correct,
    'team_events', v_events,
    'ruin', v_ruin,
    'board', clash_shrink_state(v_room.id)
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms of Mathoria. Seit 0096 team_members, seit 0097 factions und '
  'offline_members, seit 0099 team_correct_counts, seit 0100 Burg-Leben, seit 0107 team_events '
  'aller Völker. Seit 0108 zusätzlich `ruin` (Ruinen-Punkte je ausgeschiedenem Volk) und `board` '
  '(Spielfeldgröße gegenüber dem Start) für die Panels am Bildschirmrand.';


-- ─────────────────────────────────────────────────────────────
-- 9) clash_sig_of — Ruinen-Punkte ins Sicherheitsnetz
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0106. Ein Term mehr. Das Schrumpfen selbst fällt zwar
-- schon über `count(*) from clash_tiles` auf — aber der
-- Fortschrittsbalken zwischen zwei Schrumpfungen stünde sonst still,
-- sobald in einer ruhigen Minute niemand ein Feld erobert.
create or replace function clash_sig_of(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select concat_ws('.',
    (select phase from clash_boards where room_id = p_room),
    (select team_count from clash_boards where room_id = p_room),
    (select factions::text from clash_boards where room_id = p_room),
    (select coalesce(winner_team, -1) from clash_boards where room_id = p_room),
    (select count(*) from clash_tiles where room_id = p_room),
    (select coalesce(extract(epoch from max(updated_at))::bigint, 0)
       from clash_tiles where room_id = p_room),
    (select count(*) from skill_participants where room_id = p_room),
    (select count(*) from clash_preview_teams(p_room)),
    (select coalesce(shuffle_seed::text, '') from clash_boards where room_id = p_room),
    (select coalesce(extract(epoch from match_ends_at)::bigint, 0)
       from clash_boards where room_id = p_room),
    (select coalesce(sum(pl.correct_count), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    -- 0106: Team-Serien-Vektor, Summe offener Picks, jüngstes Team-Ereignis.
    (select coalesce(string_agg(team_index::text || ':' || streak::text, ',' order by team_index), '')
       from clash_team_streaks where room_id = p_room),
    (select coalesce(sum(pl.pending_picks), 0)
       from clash_players pl
       join skill_participants p on p.id = pl.participant_id
      where p.room_id = p_room),
    (select coalesce(max(id), 0) from clash_team_events where room_id = p_room),
    -- 0108: Ruinen-Punkte aller Völker.
    (select coalesce(sum(ruin_points), 0) from clash_team_streaks where room_id = p_room)
  );
$$;

revoke all on function clash_sig_of(uuid) from public;

comment on function clash_sig_of(uuid) is
  'Billige Änderungs-Signatur für den Poll. Seit 0106 Team-Serien-Vektor, Summe offener Picks und '
  'jüngste Team-Event-id, seit 0108 die Summe der Ruinen-Punkte — sonst stünde der '
  'Ruinen-Fortschritt zwischen zwei Schrumpfungen still.';


-- ─────────────────────────────────────────────────────────────
-- 10) clash_room_start / clash_room_reset — initial_tiles mitführen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: beide 0106. Je eine Zeile mehr; die Grants bleiben an
-- der bestehenden OID hängen (0093), `create or replace function`
-- muss sie nicht wiederholen. ruin_points verschwindet in beiden
-- Fällen mit dem bestehenden `delete from clash_team_streaks`.
create or replace function clash_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_room   skill_rooms;
  v_board  clash_boards;
  v_layout clash_layouts;
  v_count  int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id for update;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_board.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'already_started');
  end if;

  v_count := jsonb_array_length(v_board.factions);

  select * into v_layout from clash_layouts where team_count = v_count;
  if v_layout.team_count is null then
    return jsonb_build_object('ok', false, 'error', 'layout_missing');
  end if;

  -- Muss VOR clash_preview_teams greifen: die Vorschau rechnet
  -- `% b.team_count` und würde sonst auf einen veralteten Wert verteilen.
  update clash_boards set team_count = v_count where room_id = v_room.id;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );
  delete from clash_team_streaks where room_id = v_room.id;   -- 0106
  delete from clash_team_events  where room_id = v_room.id;   -- 0108

  insert into clash_tiles (room_id, r, c, owner_team, is_castle)
  select v_room.id, (t->>'r')::int, (t->>'c')::int, (t->>'slot')::int, false
    from jsonb_array_elements(v_layout.tiles) t;

  update clash_tiles ct
     set is_castle = true
    from jsonb_array_elements(v_layout.castles) cst
   where ct.room_id = v_room.id
     and ct.r = (cst->>'r')::int
     and ct.c = (cst->>'c')::int;

  -- clash_preview_teams liest hier NUR die online Teilnehmer (0094) —
  -- wer nicht online ist, bekommt keine Zeile und damit kein Team, bis
  -- er/sie online kommt (dann greift clash_ensure_player).
  insert into clash_players (participant_id, team_index, current_a, current_b)
  select pt.participant_id, pt.team_index, q.a, q.b
    from clash_preview_teams(v_room.id) pt, lateral clash_new_question() q;

  -- 0106: geteilte Team-Serie startet bei 0 für jedes Volk, unabhängig
  -- davon, ob im ersten Moment schon ein Spieler zugeordnet ist.
  insert into clash_team_streaks (room_id, team_index, streak)
  select v_room.id, gs.team_index, 0
    from generate_series(0, v_count - 1) as gs(team_index);

  update clash_boards
     set phase             = 'countdown',
         started_at        = now(),
         countdown_ends_at = now() + interval '5 seconds',
         match_ends_at     = null,
         grid_rows         = v_layout.rows,
         grid_cols         = v_layout.cols,
         initial_tiles     = jsonb_array_length(v_layout.tiles),   -- 0108
         winner_team       = null,
         ended_at          = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object('ok', true);
end;
$$;


create or replace function clash_room_reset(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_board clash_boards;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.room_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  delete from clash_tiles where room_id = v_room.id;
  delete from clash_players where participant_id in (
    select id from skill_participants where room_id = v_room.id
  );
  delete from clash_team_streaks where room_id = v_room.id;   -- 0106
  delete from clash_team_events  where room_id = v_room.id;   -- 0108

  update clash_boards
     set phase = 'lobby', started_at = null, countdown_ends_at = null,
         ended_at = null, winner_team = null, match_ends_at = null,
         initial_tiles = null                                  -- 0108
   where room_id = v_room.id;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;
