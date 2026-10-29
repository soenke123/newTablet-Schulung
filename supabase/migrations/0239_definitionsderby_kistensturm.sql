-- ══════════════════════════════════════════════════════════════
-- Migration 0239 — Definitions Derby: Kistensturm (Grundspiel)
-- ══════════════════════════════════════════════════════════════
-- Erste Lernform „Zusammen im Netz“ (Sönke 29.10.2026): die Klasse
-- spielt in Teams gegeneinander, jedes Tablet für sich. Jede richtige
-- Antwort ist eine Kiste für das eigene Team; die Figur des Teams
-- hebt den Turm an, und darunter rutscht die neue Kiste hinein. Wer
-- zuerst die Zielhöhe erreicht, gewinnt; läuft ein Countdown ab,
-- gewinnt der höchste Turm (bei Gleichstand, wer die Höhe zuerst
-- hatte). Die Aufgaben sind die der Insel und werden mit der Höhe des
-- eigenen Turms schwerer — wer hinten liegt, hat es leichter.
-- Items kommen später (Plan: tools/DefinitionsDerby/CLAUDE.md).
--
-- Ablauf wie Kingdoms of Mathoria:
--   lobby      Lehrkraft stellt ein: Teams (2–6), Zielhöhe (5–200
--              Kisten), Countdown (0 = ohne, sonst 1–30 Min.), Stapel.
--              Die Teams sind eine Vorschau (Sitzplatz-Reihenfolge der
--              Anwesenden, reihum).
--   countdown  4 Sekunden, Teams stehen fest.
--   running    Antworten zählen.
--   ended      Sieger steht fest. „Nochmal“ = zurück in die Lobby.
-- Verteilt wird wie überall seit 0187: wer beim Start online und nicht
-- stillgelegt ist; wer später dazukommt, landet im kleinsten Team.
--
-- Fair bei ungleichen Teams: eine richtige Antwort bringt
-- (größtes Team / eigenes Team) Kisten-Anteile (progress); die Höhe ist
-- der ganze Teil davon. Im größten Team ist eine Antwort genau eine
-- Kiste, im kleineren etwas mehr.
--
-- Ob eine Antwort stimmt, prüft das Tablet (nachsichtige Prüfung aus
-- insel.js — in SQL nachgebaut wäre sie doppelt). Der Server zählt
-- höchstens eine richtige Antwort je 1,2 Sekunden und Gerät.
--
-- Für die Animationen führt jedes Spielfeld eine laufende Nummer (seq)
-- und eine kurze Ereignisliste (dd_storm_events: Kiste, Start, Sieg).
-- Beamer und Tablets holen mit p_since nur, was neu ist, und spielen
-- dieselben Bewegungen ab.
--
-- Nur RPCs (security definer), keine Grants auf die Tabellen. Alles
-- hängt am Raum bzw. Teilnehmer (on delete cascade). Kein DROP,
-- idempotent.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 0) Kachel-Text nennt Kistensturm (Duell bleibt drin, 0237 prüft es)
-- ─────────────────────────────────────────────────────────────
update skill_tools set
  blurb = 'Begriffe und Definitionen als Karten: Lehrkräfte legen Stapel an (mit Bildern, per Text oder '
          'Karte für Karte) und teilen sie mit der Klasse. Gelernt wird mit Übersicht, Karteikarten, '
          'einer Insel voller Wesen, Memory, dem Duell zu zweit – und im Kistensturm stapelt die ganze '
          'Klasse in Teams um die Wette.'
where id = 'derby';


-- ─────────────────────────────────────────────────────────────
-- 1) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists dd_storm_boards (
  room_id            uuid primary key references skill_rooms(id) on delete cascade,
  phase              text not null default 'lobby'
                       check (phase in ('lobby', 'countdown', 'running', 'ended')),
  team_count         int  not null default 4 check (team_count between 2 and 6),
  goal               int  not null default 20 check (goal between 5 and 200),
  minutes            int  not null default 0 check (minutes between 0 and 30),
  stacks             jsonb not null default '[]'::jsonb,
  run                int  not null default 0,
  seq                bigint not null default 0,
  countdown_ends_at  timestamptz,
  started_at         timestamptz,
  ends_at            timestamptz,
  ended_at           timestamptz,
  winner_team        int,
  created_at         timestamptz not null default now()
);

comment on table dd_storm_boards is
  'Definitions Derby, Kistensturm: Spielfeld je Raum (Einstellungen, Phase, Sieger, laufende '
  'Ereignisnummer seq). Lazy angelegt von dd_storm_ensure. Seit 0239.';

alter table dd_storm_boards enable row level security;


create table if not exists dd_storm_teams (
  room_id     uuid not null references skill_rooms(id) on delete cascade,
  team        int  not null,
  progress    numeric not null default 0,
  height      int  not null default 0,
  reached_at  timestamptz,
  primary key (room_id, team)
);

comment on table dd_storm_teams is
  'Kistensturm: Turm je Team. progress zählt Anteile (fair bei ungleichen Teams), height = '
  'floor(progress), reached_at = wann die aktuelle Höhe erreicht wurde (Gleichstand). Seit 0239.';

alter table dd_storm_teams enable row level security;


create table if not exists dd_storm_players (
  participant_id  uuid primary key references skill_participants(id) on delete cascade,
  room_id         uuid not null references skill_rooms(id) on delete cascade,
  team            int  not null,
  correct         int  not null default 0,
  wrong           int  not null default 0,
  last_ok_at      timestamptz
);

comment on table dd_storm_players is
  'Kistensturm: Team und Zähler je Teilnehmer, ab dem Start bzw. dem ersten Kontakt eines '
  'Spätzugangs. Seit 0239.';

create index if not exists dd_storm_players_room_idx on dd_storm_players (room_id, team);

alter table dd_storm_players enable row level security;


create table if not exists dd_storm_events (
  room_id  uuid not null references skill_rooms(id) on delete cascade,
  seq      bigint not null,
  kind     text not null,
  team     int,
  who      text,
  height   int,
  at       timestamptz not null default now(),
  primary key (room_id, seq)
);

comment on table dd_storm_events is
  'Kistensturm: kurze Ereignisliste für die Animationen (box · start · win · end). Nur die '
  'letzten 200 je Raum bleiben. Seit 0239.';

alter table dd_storm_events enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer (ohne Grant)
-- ─────────────────────────────────────────────────────────────

-- Raum der Lehrkraft aus dem Code (Besitzer oder eingeladen), nur Derby.
create or replace function dd_storm_teacher_room(p_code text)
  returns skill_rooms
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms;
  v_none skill_rooms;
begin
  if auth.uid() is null then return v_none; end if;
  select * into v_room from skill_rooms where code = upper(btrim(coalesce(p_code, '')));
  if v_room.id is null or v_room.tool_id <> 'derby' or v_room.expires_at <= now()
     or not skill_room_is_teacher(v_room.id, auth.uid()) then
    return v_none;
  end if;
  return v_room;
end;
$$;

revoke all on function dd_storm_teacher_room(text) from public, anon, authenticated;


create or replace function dd_storm_ensure(p_room uuid)
  returns dd_storm_boards
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b dd_storm_boards;
begin
  select * into v_b from dd_storm_boards where room_id = p_room;
  if v_b.room_id is not null then return v_b; end if;
  insert into dd_storm_boards (room_id) values (p_room) on conflict (room_id) do nothing;
  select * into v_b from dd_storm_boards where room_id = p_room;
  return v_b;
end;
$$;

revoke all on function dd_storm_ensure(uuid) from public, anon, authenticated;


-- Anzeigename eines Teilnehmers (im anonymen Raum „Tablet 3“).
create or replace function dd_storm_name(p skill_participants)
  returns text
  language sql
  immutable
as $$
  select coalesce(nullif(btrim(p.name), ''), 'Tablet ' || p.seat);
$$;

revoke all on function dd_storm_name(skill_participants) from public, anon, authenticated;


-- Wer beim Start verteilt wird: online (90 s), nicht stillgelegt, nicht entfernt.
-- Team = reihum nach Sitzplatz. Vor dem Start nur Vorschau.
create or replace function dd_storm_preview(p_room uuid, p_teams int)
  returns table(participant_id uuid, team int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p.id, ((row_number() over (order by p.seat))::int - 1) % greatest(p_teams, 1)
    from skill_participants p
   where p.room_id = p_room
     and not p.blocked
     and p.removed_at is null
     and p.last_seen_at > now() - interval '90 seconds';
$$;

revoke all on function dd_storm_preview(uuid, int) from public, anon, authenticated;


-- Nächste Ereignisnummer schreiben. Der Aufrufer hält die Spielfeld-Zeile gesperrt.
create or replace function dd_storm_event(p_room uuid, p_kind text, p_team int, p_who text, p_height int)
  returns bigint
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_seq bigint;
begin
  update dd_storm_boards set seq = seq + 1 where room_id = p_room returning seq into v_seq;
  insert into dd_storm_events (room_id, seq, kind, team, who, height)
  values (p_room, v_seq, p_kind, p_team, left(p_who, 40), p_height);
  if v_seq % 50 = 0 then
    delete from dd_storm_events where room_id = p_room and seq <= v_seq - 200;
  end if;
  return v_seq;
end;
$$;

revoke all on function dd_storm_event(uuid, text, int, text, int) from public, anon, authenticated;


-- Spiel beenden: Sieger = höchster Turm, bei Gleichstand wer die Höhe zuerst hatte.
-- Ohne eine einzige Kiste gibt es keinen Sieger.
create or replace function dd_storm_finish(p_room uuid, p_kind text)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_win int;
begin
  select t.team into v_win
    from dd_storm_teams t
   where t.room_id = p_room and t.height > 0
   order by t.height desc, t.reached_at asc nulls last, t.team
   limit 1;
  update dd_storm_boards
     set phase = 'ended', ended_at = now(), winner_team = v_win
   where room_id = p_room;
  perform dd_storm_event(p_room, p_kind, v_win, null,
    (select height from dd_storm_teams where room_id = p_room and team = v_win));
end;
$$;

revoke all on function dd_storm_finish(uuid, text) from public, anon, authenticated;


-- Countdown → running, Zeit abgelaufen → ended. Lazy bei jedem Aufruf, kein Cron.
create or replace function dd_storm_advance(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b dd_storm_boards;
begin
  select * into v_b from dd_storm_boards where room_id = p_room;
  if v_b.room_id is null then return; end if;
  if v_b.phase = 'countdown' and v_b.countdown_ends_at <= now() then
    select * into v_b from dd_storm_boards where room_id = p_room for update;
    if v_b.phase = 'countdown' and v_b.countdown_ends_at <= now() then
      update dd_storm_boards
         set phase = 'running', started_at = v_b.countdown_ends_at,
             ends_at = case when v_b.minutes > 0
                            then v_b.countdown_ends_at + make_interval(mins => v_b.minutes) end
       where room_id = p_room;
      select * into v_b from dd_storm_boards where room_id = p_room;
    end if;
  end if;
  if v_b.phase = 'running' and v_b.ends_at is not null and v_b.ends_at <= now() then
    select * into v_b from dd_storm_boards where room_id = p_room for update;
    if v_b.phase = 'running' then perform dd_storm_finish(p_room, 'time'); end if;
  end if;
end;
$$;

revoke all on function dd_storm_advance(uuid) from public, anon, authenticated;


-- Spätzugang (oder Gerät, das beim Start offline war): ins kleinste Team.
create or replace function dd_storm_join(p skill_participants, p_b dd_storm_boards)
  returns dd_storm_players
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_pl dd_storm_players;
  v_t  int;
begin
  select * into v_pl from dd_storm_players where participant_id = p.id;
  if v_pl.participant_id is not null or p_b.phase not in ('countdown', 'running') or p.blocked then
    return v_pl;
  end if;
  select g.t into v_t
    from generate_series(0, p_b.team_count - 1) g(t)
    left join dd_storm_players x on x.room_id = p.room_id and x.team = g.t
   group by g.t
   order by count(x.participant_id), g.t
   limit 1;
  insert into dd_storm_players (participant_id, room_id, team)
  values (p.id, p.room_id, v_t)
  on conflict (participant_id) do nothing;
  select * into v_pl from dd_storm_players where participant_id = p.id;
  return v_pl;
end;
$$;

revoke all on function dd_storm_join(skill_participants, dd_storm_boards) from public, anon, authenticated;


-- Die Ansicht für Beamer und Tablet. p_me = Teilnehmer (null bei der Lehrkraft).
create or replace function dd_storm_state(p_room uuid, p_since bigint, p_me uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_b      dd_storm_boards;
  v_people jsonb;
  v_teams  jsonb;
  v_events jsonb;
  v_me     jsonb;
  v_since  bigint;
begin
  select * into v_b from dd_storm_boards where room_id = p_room;

  if v_b.phase = 'lobby' then
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'n', dd_storm_name(p), 't', pv.team)
                              order by p.seat), '[]'::jsonb)
      into v_people
      from dd_storm_preview(p_room, v_b.team_count) pv
      join skill_participants p on p.id = pv.participant_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'n', dd_storm_name(p), 't', pl.team,
                                                 'c', pl.correct) order by p.seat), '[]'::jsonb)
      into v_people
      from dd_storm_players pl
      join skill_participants p on p.id = pl.participant_id
     where pl.room_id = p_room and p.removed_at is null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('t', t.team, 'h', t.height) order by t.team), '[]'::jsonb)
    into v_teams
    from dd_storm_teams t where t.room_id = p_room;

  -- Nur Neues; wer weit zurückliegt, bekommt die letzten 40 (der Rest steht in den Höhen).
  v_since := greatest(coalesce(p_since, 0), v_b.seq - 40);
  select coalesce(jsonb_agg(jsonb_build_object('s', e.seq, 'k', e.kind, 't', e.team, 'w', e.who,
                                               'h', e.height) order by e.seq), '[]'::jsonb)
    into v_events
    from dd_storm_events e where e.room_id = p_room and e.seq > v_since;

  if p_me is not null then
    select jsonb_build_object('id', pl.participant_id, 't', pl.team, 'c', pl.correct, 'x', pl.wrong)
      into v_me from dd_storm_players pl where pl.participant_id = p_me;
    -- In der Lobby (noch kein Spieler): nur die eigene id, das Team steht in people.
    if v_me is null then v_me := jsonb_build_object('id', p_me); end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'phase', v_b.phase,
    'run', v_b.run,
    'seq', v_b.seq,
    'team_count', v_b.team_count,
    'goal', v_b.goal,
    'minutes', v_b.minutes,
    'stacks', v_b.stacks,
    'countdown_ends_at', v_b.countdown_ends_at,
    'started_at', v_b.started_at,
    'ends_at', v_b.ends_at,
    'winner_team', v_b.winner_team,
    'server_now', now(),
    'teams', v_teams,
    'people', v_people,
    'events', v_events,
    'me', v_me);
end;
$$;

revoke all on function dd_storm_state(uuid, bigint, uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Lehrkraft (p_code hängt presenterActions.call an)
-- ─────────────────────────────────────────────────────────────
create or replace function dd_storm_room_get(p_code text, p_since bigint default 0)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dd_storm_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform dd_storm_ensure(v_room.id);
  perform dd_storm_advance(v_room.id);
  return dd_storm_state(v_room.id, p_since, null);
end;
$$;

revoke all on function dd_storm_room_get(text, bigint) from public;
grant execute on function dd_storm_room_get(text, bigint) to authenticated;


-- Einstellungen in der Lobby. null = unverändert.
create or replace function dd_storm_room_setup(
  p_code       text,
  p_team_count int,
  p_goal       int,
  p_minutes    int,
  p_stacks     jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dd_storm_teacher_room(p_code);
  v_b    dd_storm_boards;
  v_s    jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform dd_storm_ensure(v_room.id);
  select * into v_b from dd_storm_boards where room_id = v_room.id for update;
  if v_b.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if (p_team_count is not null and p_team_count not between 2 and 6)
     or (p_goal is not null and p_goal not between 5 and 200)
     or (p_minutes is not null and p_minutes not between 0 and 30) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_stacks is not null then
    if jsonb_typeof(p_stacks) <> 'array' or jsonb_array_length(p_stacks) > 20 then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_s
      from jsonb_array_elements_text(p_stacks) e
     where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    if jsonb_array_length(v_s) <> jsonb_array_length(p_stacks) then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
  end if;
  update dd_storm_boards
     set team_count = coalesce(p_team_count, team_count),
         goal       = coalesce(p_goal, goal),
         minutes    = coalesce(p_minutes, minutes),
         stacks     = coalesce(v_s, stacks)
   where room_id = v_room.id;
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_storm_room_setup(text, int, int, int, jsonb) from public;
grant execute on function dd_storm_room_setup(text, int, int, int, jsonb) to authenticated;


-- Teams festschreiben, Türme auf 0, Countdown.
create or replace function dd_storm_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dd_storm_teacher_room(p_code);
  v_b    dd_storm_boards;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform dd_storm_ensure(v_room.id);
  select * into v_b from dd_storm_boards where room_id = v_room.id for update;
  if v_b.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'already_started'); end if;
  if jsonb_array_length(v_b.stacks) = 0 then return jsonb_build_object('ok', false, 'error', 'no_stacks'); end if;

  delete from dd_storm_players where room_id = v_room.id;
  delete from dd_storm_teams where room_id = v_room.id;
  delete from dd_storm_events where room_id = v_room.id;

  insert into dd_storm_teams (room_id, team)
  select v_room.id, g from generate_series(0, v_b.team_count - 1) g;
  insert into dd_storm_players (participant_id, room_id, team)
  select pv.participant_id, v_room.id, pv.team from dd_storm_preview(v_room.id, v_b.team_count) pv;

  update dd_storm_boards
     set phase = 'countdown', run = run + 1,
         countdown_ends_at = now() + interval '4 seconds',
         started_at = null, ends_at = null, ended_at = null, winner_team = null
   where room_id = v_room.id;
  perform dd_storm_event(v_room.id, 'start', null, null, null);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_storm_room_start(text) from public;
grant execute on function dd_storm_room_start(text) to authenticated;


-- Vorzeitig beenden (Sieger wie beim Zeitende).
create or replace function dd_storm_room_stop(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dd_storm_teacher_room(p_code);
  v_b    dd_storm_boards;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_b from dd_storm_boards where room_id = v_room.id for update;
  if v_b.room_id is null or v_b.phase not in ('countdown', 'running') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform dd_storm_finish(v_room.id, 'stop');
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_storm_room_stop(text) from public;
grant execute on function dd_storm_room_stop(text) to authenticated;


-- Zurück in die Lobby (Einstellungen bleiben).
create or replace function dd_storm_room_reset(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dd_storm_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform dd_storm_ensure(v_room.id);
  perform 1 from dd_storm_boards where room_id = v_room.id for update;
  delete from dd_storm_players where room_id = v_room.id;
  delete from dd_storm_teams where room_id = v_room.id;
  update dd_storm_boards
     set phase = 'lobby', countdown_ends_at = null, started_at = null, ends_at = null,
         ended_at = null, winner_team = null
   where room_id = v_room.id;
  perform dd_storm_event(v_room.id, 'reset', null, null, null);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_storm_room_reset(text) from public;
grant execute on function dd_storm_room_reset(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Tablet
-- ─────────────────────────────────────────────────────────────
create or replace function dd_storm_view(p_token text, p_since bigint default 0)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v   record;
  v_b dd_storm_boards;
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).removed_at is not null then return jsonb_build_object('ok', false, 'error', 'removed'); end if;
  perform dd_storm_ensure((v.room).id);
  perform dd_storm_advance((v.room).id);
  select * into v_b from dd_storm_boards where room_id = (v.room).id;
  perform dd_storm_join(v.p, v_b);
  return dd_storm_state((v.room).id, p_since, (v.p).id);
end;
$$;

revoke all on function dd_storm_view(text, bigint) from public;
grant execute on function dd_storm_view(text, bigint) to anon, authenticated;


-- Eine Antwort melden. p_ok = vom Tablet geprüft (siehe Kopf).
create or replace function dd_storm_answer(p_token text, p_ok boolean, p_since bigint default 0)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v        record;
  v_b      dd_storm_boards;
  v_pl     dd_storm_players;
  v_t      dd_storm_teams;
  v_mine   int;
  v_max    int;
  v_old    int;
  v_new    int;
  v_status text := 'ok';
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).removed_at is not null then return jsonb_build_object('ok', false, 'error', 'removed'); end if;
  perform dd_storm_ensure((v.room).id);
  perform dd_storm_advance((v.room).id);

  -- Eine Antwort nach der anderen je Raum: Höhe, Ereignisnummer und Sieg passen so zusammen.
  select * into v_b from dd_storm_boards where room_id = (v.room).id for update;
  if v_b.phase <> 'running' then
    v_status := 'not_running';
  else
    v_pl := dd_storm_join(v.p, v_b);
    if v_pl.participant_id is null then
      v_status := 'not_running';
    elsif not coalesce(p_ok, false) then
      update dd_storm_players set wrong = wrong + 1 where participant_id = v_pl.participant_id;
      v_status := 'wrong';
    elsif v_pl.last_ok_at is not null and v_pl.last_ok_at > now() - interval '1.2 seconds' then
      v_status := 'too_fast';
    else
      update dd_storm_players set correct = correct + 1, last_ok_at = now()
       where participant_id = v_pl.participant_id;
      select count(*) into v_mine from dd_storm_players where room_id = v_b.room_id and team = v_pl.team;
      select max(n) into v_max from (select count(*) n from dd_storm_players where room_id = v_b.room_id group by team) x;
      select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_pl.team;
      v_old := v_t.height;
      v_new := floor(v_t.progress + greatest(v_max, 1)::numeric / greatest(v_mine, 1))::int;
      update dd_storm_teams
         set progress = progress + greatest(v_max, 1)::numeric / greatest(v_mine, 1),
             height = v_new,
             reached_at = case when v_new > v_old then now() else reached_at end
       where room_id = v_b.room_id and team = v_pl.team;
      if v_new > v_old then
        perform dd_storm_event(v_b.room_id, 'box', v_pl.team, dd_storm_name(v.p), v_new);
      end if;
      if v_new >= v_b.goal then
        update dd_storm_boards set phase = 'ended', ended_at = now(), winner_team = v_pl.team
         where room_id = v_b.room_id;
        perform dd_storm_event(v_b.room_id, 'win', v_pl.team, null, v_new);
      end if;
    end if;
  end if;
  return dd_storm_state((v.room).id, p_since, (v.p).id) || jsonb_build_object('result', v_status);
end;
$$;

revoke all on function dd_storm_answer(text, boolean, bigint) from public;
grant execute on function dd_storm_answer(text, boolean, bigint) to anon, authenticated;
