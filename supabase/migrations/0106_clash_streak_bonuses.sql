-- ══════════════════════════════════════════════════════════════
-- Migration 0106 — Kingdoms of Mathoria: Serien-Boni ("on fire")
-- ══════════════════════════════════════════════════════════════
-- Zwei neue Belohnungen für Antwort-Serien, per Sönke abgestimmt:
--
--   • Einzel-Serie (10 richtige in Folge EINES Spielers, wieder
--     bei 20, 30, …): 2 Felder gezielt selbst wählen. Bleibt
--     manuell (Karte öffnet sich, „Wähle 2 Felder deiner Wahl!"),
--     aber mit kurzer Frist — läuft die ab, ohne dass getippt
--     wurde, wählt der Server selbst zufällig. Muss schnell gehen,
--     darf das Spiel nicht lange aufhalten.
--   • Team-Serie (20 richtige in Folge, GETEILT über alle
--     Mitglieder eines Volkes — nicht die Summe der Einzel-Serien;
--     wieder bei 40, 60, …): automatisch 7 Felder erobern, keine
--     Interaktion nötig.
--
-- Beide Boni feuern bei jedem weiteren Vielfachen der Schwelle
-- (floor-Vergleich: alt/N vs. neu/N), nie beim Zurücksetzen auf 0.
-- Das Team bekommt bei jedem Auslösen eine passive Nachricht
-- („<Name> ist on fire" / „Ihr seid on fire") — nur die eigenen
-- Mitglieder sehen sie, andere Völker nie.
--
-- ── Zustellweg für die Team-Nachricht ───────────────────────────
-- Keine neue Infrastruktur: nudge() (tool.js) löst nach jeder
-- richtigen Antwort bereits einen sofortigen Re-Poll für ALLE
-- Clients im Raum aus. clash_team_events ist nur ein kleines Log
-- (auf 20 Zeilen je Team getrimmt), clash_view liefert daraus die
-- Zeilen des ANFRAGENDEN Teams zurück, der Client merkt sich die
-- höchste bereits gezeigte id. clash_sig_of bekommt zusätzlich ein
-- grobes Signaturglied dafür, falls ein Broadcast mal verloren geht
-- — dann greift spätestens der 8s-Sicherheitsnetz-Poll.
--
-- ── DRY-Fix bei der Gelegenheit ─────────────────────────────────
-- Die bisherige Drei-Versuche-Zufallssuche (inline in
-- clash_submit_answer seit 0093) wird gebraucht als: normale
-- Antwort, Team-Bonus-Schleife (7×), Auto-Ablauf des Einzel-Bonus.
-- Statt sie ein drittes Mal zu kopieren: clash_capture_apply
-- (Burg-Leben-vs-Besitzerwechsel, EIN Ort für diese Entscheidung),
-- clash_capture_random (die bestehende Zufallssuche, unverändertes
-- Verhalten, jetzt extrahiert), clash_capture_specific (dieselbe
-- Legalitäts-Prüfung für ein vom Client genanntes Feld — Client-
-- Highlighting ist nur UX, hier wird alles serverseitig neu
-- geprüft), clash_check_win (bisher inline, jetzt auch von der
-- 7er-Schleife gebraucht).
--
-- ⚠️ Grundlage der neu deklarierten Funktionen ist jeweils die
-- höchste bestehende Fassung (per grep bestätigt, nicht nur
-- angenommen): clash_submit_answer → 0105, clash_view → 0100,
-- clash_sig_of → 0104, clash_room_start → 0097, clash_room_reset →
-- 0094. clash_room_get bleibt in dieser Migration bewusst
-- unangetastet (Beamer-Ansicht zeigt noch keine Fire-Events — Scope-
-- Cut für v1). Regel: feedback_shop_state_merge_regressions.
--
-- Kein DROP — `add column if not exists`, `create table if not
-- exists`, `create or replace function`
-- (Regel: feedback_supabase_no_drop_statements). Jede neue Tabelle
-- bekommt ihre Grants an service_role in derselben Migration
-- (Regel: feedback_service_role_needs_explicit_grants).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) clash_players — offene manuelle Eroberungen aus dem Einzel-Bonus
-- ─────────────────────────────────────────────────────────────
alter table clash_players add column if not exists pending_picks int not null default 0;
alter table clash_players add column if not exists pick_deadline timestamptz;

comment on column clash_players.pending_picks is
  'Offene manuelle Eroberungen aus dem 10er-Serienbonus (0106). +2 bei jedem Vielfachen von 10 '
  'in clash_players.streak. Wird per clash_pick_tile abgebaut oder nach pick_deadline automatisch '
  '(clash_expire_pending_picks, gleiche Zufallslogik wie eine normale Eroberung).';
comment on column clash_players.pick_deadline is
  'Frist für die aktuell offenen pending_picks (0106). NULL, solange pending_picks = 0. Kein '
  'Cron — läuft lazy ab, sobald irgendein RPC dieses Spielers danach fragt (clash_view, '
  'clash_pick_tile, clash_submit_answer), wie clash_maybe_advance_phase für die Board-Phase.';


-- ─────────────────────────────────────────────────────────────
-- 2) clash_team_streaks — geteilte Serie je Team
-- ─────────────────────────────────────────────────────────────
-- Eigene Zeile je Team statt eines jsonb-Feldes an clash_boards,
-- damit nicht jede Antwort JEDES Teams über dieselbe Board-Zeile
-- serialisiert (gleicher Grundgedanke wie clash_tiles selbst,
-- siehe Kommentar in 0093 zur Zeilen- statt Blob-Struktur).
create table if not exists clash_team_streaks (
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  team_index int  not null,
  streak     int  not null default 0,
  primary key (room_id, team_index)
);

comment on table clash_team_streaks is
  'Geteilte Serie je Team (0106) — NICHT die Summe der Einzel-Serien: +1 bei JEDER richtigen '
  'Antwort irgendeines Mitglieds, zurück auf 0 bei JEDEM Fehlversuch irgendeines Mitglieds '
  '(auch dem ersten „nochmal"-Fehlversuch, wie clash_players.streak).';

alter table clash_team_streaks enable row level security;
grant select, insert, update, delete on clash_team_streaks to service_role;

-- Backfill für Räume, die schon liefen, bevor diese Migration griff —
-- sonst fehlt der ersten Antwort in so einem Raum die Zeile zum
-- Sperren. clash_submit_answer legt sie zur Sicherheit ohnehin lazy
-- an, dieser Backfill ist nur der schnellere Weg.
insert into clash_team_streaks (room_id, team_index, streak)
select b.room_id, gs.team_index, 0
  from clash_boards b, lateral generate_series(0, b.team_count - 1) as gs(team_index)
 where b.phase in ('countdown', 'running')
on conflict (room_id, team_index) do nothing;


-- ─────────────────────────────────────────────────────────────
-- 3) clash_team_events — passive Team-Benachrichtigungen
-- ─────────────────────────────────────────────────────────────
create table if not exists clash_team_events (
  id         bigserial primary key,
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  team_index int  not null,
  kind       text not null check (kind in ('individual_fire', 'team_fire')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clash_team_events_room_team_id_idx
  on clash_team_events (room_id, team_index, id desc);

comment on table clash_team_events is
  'Passive Team-Benachrichtigungen (0106): „<Name> ist on fire" / „Ihr seid on fire". clash_view '
  'liefert nur die Zeilen des ANFRAGENDEN Teams zurück — andere Völker sehen sie nie. Wird bei '
  'jedem Insert auf die letzten 20 je Team getrimmt (clash_team_event_insert).';

alter table clash_team_events enable row level security;
grant select, insert, update, delete on clash_team_events to service_role;

create or replace function clash_team_event_insert(p_room uuid, p_team int, p_kind text, p_payload jsonb)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  insert into clash_team_events (room_id, team_index, kind, payload)
  values (p_room, p_team, p_kind, p_payload);

  delete from clash_team_events
   where room_id = p_room and team_index = p_team
     and id not in (
       select id from clash_team_events
        where room_id = p_room and team_index = p_team
        order by id desc limit 20
     );
end;
$$;

revoke all on function clash_team_event_insert(uuid, int, text, jsonb) from public;

comment on function clash_team_event_insert(uuid, int, text, jsonb) is
  'Interner Helfer (0106): trägt ein Team-Ereignis ein und trimmt danach auf die letzten 20 je '
  'Team. Kein Grant an anon/authenticated — wird nur aus anderen security-definer-Funktionen gerufen.';


-- ─────────────────────────────────────────────────────────────
-- 4) Eroberungs-Bausteine — aus clash_submit_answer extrahiert
-- ─────────────────────────────────────────────────────────────
-- clash_capture_apply entscheidet EINMAL, ob eine Burg nur ein Leben
-- verliert oder der Besitzer wechselt (bisher inline in
-- clash_submit_answer seit 0093/0100). Sperrt die Zielzeile selbst;
-- wird nur von Aufrufern gerufen, die die Legalität des Feldes schon
-- geprüft haben.
create or replace function clash_capture_apply(p_room uuid, p_team int, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_tprev  int;
  v_castle boolean;
  v_hp     int;
begin
  select owner_team, is_castle, castle_hp
    into v_tprev, v_castle, v_hp
    from clash_tiles
   where room_id = p_room and r = p_r and c = p_c
     for update;

  if v_tprev is null then
    return jsonb_build_object('captured', null, 'castle_hit', null);
  end if;

  if v_castle and coalesce(v_hp, 3) > 1 then
    update clash_tiles
       set castle_hp = castle_hp - 1, updated_at = now()
     where room_id = p_room and r = p_r and c = p_c;
    return jsonb_build_object('captured', null,
      'castle_hit', jsonb_build_object('r', p_r, 'c', p_c, 'hp', coalesce(v_hp, 3) - 1, 'owner', v_tprev));
  end if;

  update clash_tiles
     set owner_team = p_team, castle_hp = 3, updated_at = now()
   where room_id = p_room and r = p_r and c = p_c;

  return jsonb_build_object(
    'captured', jsonb_build_object('r', p_r, 'c', p_c, 'prev_owner', v_tprev, 'castle', v_castle, 'hp', 3),
    'castle_hit', null);
end;
$$;

revoke all on function clash_capture_apply(uuid, int, int, int) from public;

-- Der bisherige Drei-Versuche-Zufallsblock (0093..0105), jetzt
-- extrahiert statt mehrfach kopiert. Verhalten unverändert.
create or replace function clash_capture_random(p_room uuid, p_team int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_tr int;
  v_tc int;
  i    int;
begin
  for i in 1..3 loop
    v_tr := null; v_tc := null;
    select t.r, t.c
      into v_tr, v_tc
      from clash_tiles t
     where t.room_id = p_room
       and t.owner_team <> p_team
       and exists (
         select 1 from clash_tiles m
          where m.room_id = t.room_id
            and m.owner_team = p_team
            and clash_is_neighbor(m.r, m.c, t.r, t.c)
       )
     order by random()
     limit 1
       for update of t skip locked;
    exit when v_tr is not null;
  end loop;

  if v_tr is null then
    return jsonb_build_object('captured', null, 'castle_hit', null);
  end if;

  return clash_capture_apply(p_room, p_team, v_tr, v_tc);
end;
$$;

revoke all on function clash_capture_random(uuid, int) from public;

-- Für den manuellen Pick: dieselbe Legalitäts-Regel wie oben, aber
-- für ein vom Client genanntes Feld. Client-Highlighting ist nur UX
-- — hier wird Existenz/Eigentum/Nachbarschaft serverseitig neu geprüft.
create or replace function clash_capture_specific(p_room uuid, p_team int, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_owner int;
begin
  select owner_team into v_owner
    from clash_tiles
   where room_id = p_room and r = p_r and c = p_c
     for update skip locked;

  if v_owner is null then
    -- Zeile existiert nicht ODER ist gerade gesperrt (z. B. griff der
    -- Auto-Ablauf im selben Moment zu). Kein Fehlerzustand, nur „gerade
    -- nicht verfügbar" — der Client fragt danach neu ab.
    return jsonb_build_object('ok', false, 'error', 'not_available');
  end if;
  if v_owner = p_team then
    return jsonb_build_object('ok', false, 'error', 'already_owned');
  end if;
  if not exists (
    select 1 from clash_tiles m
     where m.room_id = p_room and m.owner_team = p_team
       and clash_is_neighbor(m.r, m.c, p_r, p_c)
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_adjacent');
  end if;

  return jsonb_build_object('ok', true) || clash_capture_apply(p_room, p_team, p_r, p_c);
end;
$$;

revoke all on function clash_capture_specific(uuid, int, int, int) from public;

-- Sieg-Prüfung, bisher inline in clash_submit_answer, jetzt zusätzlich
-- von der 7-Felder-Team-Bonus-Schleife und clash_expire_pending_picks
-- gebraucht. `and phase = 'running'` verhindert, dass eine Schleife
-- mit mehreren Treffern ended_at wiederholt überschreibt.
create or replace function clash_check_win(p_room uuid)
  returns boolean
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_alive_n int;
begin
  select count(distinct owner_team) into v_alive_n
    from clash_tiles where room_id = p_room and owner_team >= 0;
  if v_alive_n <= 1 then
    update clash_boards
       set phase = 'ended', ended_at = now(),
           winner_team = (select owner_team from clash_tiles
                            where room_id = p_room and owner_team >= 0 limit 1)
     where room_id = p_room and phase = 'running';
    return true;
  end if;
  return false;
end;
$$;

revoke all on function clash_check_win(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 5) clash_expire_pending_picks — Frist lazy ablaufen lassen
-- ─────────────────────────────────────────────────────────────
-- Kein Cron: läuft, sobald irgendein RPC dieses Spielers danach fragt
-- (clash_view, clash_pick_tile, clash_submit_answer). Nach Ablauf
-- wird für jeden noch offenen Pick zufällig erobert — dieselbe Logik
-- wie eine normale Eroberung, damit „schnell gehen" nicht am
-- Nichtstun eines Spielers scheitert.
create or replace function clash_expire_pending_picks(p_participant uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_player clash_players;
  v_room   uuid;
  v_res    jsonb;
  i        int;
begin
  select * into v_player from clash_players where participant_id = p_participant for update;
  if v_player.participant_id is null then return; end if;
  if coalesce(v_player.pending_picks, 0) <= 0 then return; end if;
  if v_player.pick_deadline is null or now() < v_player.pick_deadline then return; end if;

  select room_id into v_room from skill_participants where id = p_participant;

  for i in 1..v_player.pending_picks loop
    exit when v_room is null;
    exit when not exists (
      select 1 from clash_tiles where room_id = v_room and owner_team = v_player.team_index
    );
    v_res := clash_capture_random(v_room, v_player.team_index);
    exit when (v_res->'captured') is null and (v_res->'castle_hit') is null;
    if (v_res->'captured') is not null and clash_check_win(v_room) then
      exit;
    end if;
  end loop;

  update clash_players set pending_picks = 0, pick_deadline = null
   where participant_id = p_participant;
end;
$$;

revoke all on function clash_expire_pending_picks(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 6) clash_submit_answer — Serien-Boni einbauen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0105 (die höchste bestehende Fassung). Die Kandidaten-
-- suche ist jetzt clash_capture_random; neu ist die Schwellen-
-- erkennung (floor-Vergleich: löst nur beim ÜBERSCHREITEN eines
-- Vielfachen aus, nie beim Reset auf 0) für Einzel- (10er) und
-- Team-Serie (20er), plus das Zurücksetzen der Team-Serie in BEIDEN
-- Fehler-Zweigen (auch dem ersten „nochmal"-Fehlversuch — exakt an
-- derselben Stelle wie bei clash_players.streak).
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
  v_tr              int;
  v_tc              int;
  v_tprev           int;
  v_castle          boolean := false;
  v_taken           boolean := false;   -- Besitzer hat gewechselt
  v_hit_hp          int := null;        -- Burg getroffen, aber nicht gefallen
  v_cap_res         jsonb;
  v_fire_res        jsonb;
  v_streak_old      int;
  v_pending_add     int := 0;
  v_team_streak_old int;
  v_team_streak_new int;
  v_team_streak_out int;
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
  -- noch ändert.
  perform clash_expire_pending_picks(v_p.id);
  select * into v_player from clash_players where participant_id = v_p.id;

  if not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  ) then
    return jsonb_build_object('ok', false, 'error', 'team_eliminated');
  end if;

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

    -- Individuelle 10er-Serie (0106).
    v_streak_old := coalesce(v_player.streak, 0);
    if floor((v_streak_old + 1) / 10.0) > floor(v_streak_old / 10.0) then
      v_pending_add := 2;
    end if;

    update clash_players
       set streak = streak + 1, correct_count = correct_count + 1, wrong_attempt = false,
           pending_picks = pending_picks + v_pending_add,
           pick_deadline = case when v_pending_add > 0 then now() + interval '6 seconds'
                                 else pick_deadline end
     where participant_id = v_p.id;

    if v_pending_add > 0 then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'individual_fire',
        jsonb_build_object('name', skill_seat_name(v_p.name, v_p.seat), 'streak', v_streak_old + 1));
    end if;

    -- Geteilte Team-Serie (0106) — unabhängig von den Einzel-Serien.
    -- Die Zeile sollte durch clash_room_start/den Backfill schon
    -- existieren; Insert ist nur ein Sicherheitsnetz.
    select streak into v_team_streak_old
      from clash_team_streaks where room_id = v_room.id and team_index = v_player.team_index
      for update;
    if v_team_streak_old is null then
      insert into clash_team_streaks (room_id, team_index, streak)
      values (v_room.id, v_player.team_index, 0)
      on conflict (room_id, team_index) do nothing;
      v_team_streak_old := 0;
    end if;
    v_team_streak_new := v_team_streak_old + 1;
    update clash_team_streaks set streak = v_team_streak_new
     where room_id = v_room.id and team_index = v_player.team_index;
    v_team_streak_out := v_team_streak_new;

    if floor(v_team_streak_new / 20.0) > floor(v_team_streak_old / 20.0) then
      perform clash_team_event_insert(v_room.id, v_player.team_index, 'team_fire',
        jsonb_build_object('streak', v_team_streak_new));
      for i in 1..7 loop
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
  -- clash_check_win selbst filtert neutrale Kacheln (owner_team >= 0,
  -- seit 0105) und ist idempotent (`and phase = 'running'`), daher
  -- harmlos, auch wenn die 7er-Schleife oben schon gewonnen hat.
  if v_taken then
    perform clash_check_win(v_room.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'retry', v_retry,
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
  'Sieg-Prüfung ausgenommen. Seit 0106 zusätzlich Serien-Boni: jedes Vielfache von 10 in der '
  'eigenen Serie gibt 2 offene Picks (pending_picks/pick_deadline, siehe clash_pick_tile), jedes '
  'Vielfache von 20 in der geteilten Team-Serie (team_streak) erobert automatisch 7 Felder.';


-- ─────────────────────────────────────────────────────────────
-- 7) clash_pick_tile — der manuelle Pick aus dem Einzel-Bonus
-- ─────────────────────────────────────────────────────────────
create or replace function clash_pick_tile(p_token text, p_r int, p_c int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p      skill_participants;
  v_room   skill_rooms;
  v_board  clash_boards;
  v_player clash_players;
  v_res    jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  perform clash_maybe_advance_phase(v_room.id);
  select * into v_board from clash_boards where room_id = v_room.id;
  if v_board.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_running', 'phase', v_board.phase);
  end if;

  select * into v_player from clash_players where participant_id = v_p.id for update;
  if v_player.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform clash_expire_pending_picks(v_p.id);
  select * into v_player from clash_players where participant_id = v_p.id;

  if coalesce(v_player.pending_picks, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_pending_picks');
  end if;
  if not exists (
    select 1 from clash_tiles where room_id = v_room.id and owner_team = v_player.team_index
  ) then
    return jsonb_build_object('ok', false, 'error', 'team_eliminated');
  end if;

  v_res := clash_capture_specific(v_room.id, v_player.team_index, p_r, p_c);
  if not coalesce((v_res->>'ok')::boolean, false) then
    return v_res;   -- {ok:false, error: not_available|already_owned|not_adjacent}
  end if;

  update clash_players
     set pending_picks = pending_picks - 1,
         pick_deadline = case when pending_picks - 1 <= 0 then null
                               else now() + interval '6 seconds' end
   where participant_id = v_p.id;

  if (v_res->'captured') is not null then
    perform clash_check_win(v_room.id);
  end if;

  return jsonb_build_object('ok', true) || v_res ||
    jsonb_build_object(
      'pending_picks', (select pending_picks from clash_players where participant_id = v_p.id),
      'pick_deadline', (select pick_deadline from clash_players where participant_id = v_p.id)
    );
end;
$$;

revoke all on function clash_pick_tile(text, int, int) from public;
grant execute on function clash_pick_tile(text, int, int) to anon, authenticated;

comment on function clash_pick_tile(text, int, int) is
  'Manueller Pick aus dem Einzel-Serienbonus (0106): erobert genau das genannte Feld, wenn es '
  'noch verfügbar, nicht bereits eigen und an das eigene Volk angrenzend ist (serverseitig neu '
  'geprüft — Client-Highlighting ist nur UX) und der Spieler noch offene pending_picks hat.';


-- ─────────────────────────────────────────────────────────────
-- 8) clash_view — Team-Serie, offene Picks, Team-Ereignisse
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0100 (die höchste bestehende Fassung). Neu sind der
-- Aufruf von clash_expire_pending_picks im laufenden Zweig, sowie
-- team_streak/my_team_events/me.pending_picks/me.pick_deadline —
-- alles ausschließlich für das EIGENE Team. clash_room_get (Beamer)
-- bleibt bewusst unangetastet.
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
      if v_alive then
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

      -- Team-Serie + Ereignisse (0106) — nur ab dem Start, nur fürs
      -- eigene Team.
      select streak into v_team_streak
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
  'team_correct_counts, seit 0100 Burg-Leben in der Kachelliste. Seit 0106 zusätzlich team_streak, '
  'my_team_events und me.pending_picks/me.pick_deadline — alles nur fürs eigene Team.';


-- ─────────────────────────────────────────────────────────────
-- 9) clash_sig_of — Serien-Boni ins Sicherheitsnetz aufnehmen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0104 (die höchste bestehende Fassung). Drei zusätzliche
-- Terme, damit der günstige Sig-Poll neue Boni erkennt, auch falls
-- der Realtime-Broadcast (nudge()) mal verloren geht.
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
    (select coalesce(max(id), 0) from clash_team_events where room_id = p_room)
  );
$$;

revoke all on function clash_sig_of(uuid) from public;

comment on function clash_sig_of(uuid) is
  'Billige Änderungs-Signatur für den Poll. Seit 0106 zusätzlich Team-Serien-Vektor, Summe offener '
  'Picks und jüngste Team-Event-id — sonst könnte ein verlorener Broadcast einen Bonus verpassen.';


-- ─────────────────────────────────────────────────────────────
-- 10) clash_room_start / clash_room_reset — Team-Serie mitführen
-- ─────────────────────────────────────────────────────────────
-- Grundlage: clash_room_start 0097, clash_room_reset 0094 (jeweils
-- die höchste bestehende Fassung). Beide bekommen nur eine Zeile
-- mehr; die Grants bleiben unverändert an ihrer OID hängen (0093),
-- `create or replace function` muss sie deshalb nicht wiederholen.
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

  update clash_boards
     set phase = 'lobby', started_at = null, countdown_ends_at = null,
         ended_at = null, winner_team = null, match_ends_at = null
   where room_id = v_room.id;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;
