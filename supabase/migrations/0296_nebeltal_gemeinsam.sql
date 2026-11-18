-- ══════════════════════════════════════════════════════════════
-- Migration 0296 — Nebeltal: gemeinsam spielen (Mehrspieler im Raum)
-- ══════════════════════════════════════════════════════════════
-- Sönke 18.11.2026. Bisher spielte jedes Tablet für sich (gleiche
-- Welt-Nummer = gleiche Landschaft). Jetzt:
--
--   · Die Lehrkraft schaltet die Level einzeln frei (Teilen-Symbol an
--     der Kachel). Das braucht keine Tabelle: skill_room_state.data.levels
--     über skill_room_set_state, wie Reinforce Yourself.
--   · Knopf „Gemeinsam spielen“: alle Tablets im Raum landen in der
--     Lobby (auch wer gerade in einem Level steckt oder später kommt).
--     Jede Person ist ein Pinguin mit eigener Schalfarbe (automatisch)
--     und läuft auf dem Bildschirm herum.
--   · Die Lehrkraft wählt ein Level (alle 8, unabhängig von der
--     Freigabe), startet: Erklärkarte → „Los“ → 3-2-1 → alle spielen
--     dieselbe Welt. Level 1–6 jeder gegen jeden; Ende, wenn alle fertig
--     sind (Zeit/Sprünge um oder „Hier bleibe ich“) oder die Lehrkraft
--     beendet. Ein Gerät, das ausfällt, hält die Runde offen, bis es
--     wieder da ist oder die Lehrkraft beendet.
--   · Level 7 (zwei Neuronen) zu zweit: jede Person EINE Welt, bei
--     ungerader Zahl spielt eine Person beide. Level 8 (vier Neuronen,
--     8 Welten) in Teams bis 8 (Vorgabe; erst ab 9 Personen ein zweites
--     Team, möglichst gleich groß); wer im Team fehlt, dessen Welten
--     übernehmen andere (zuerst die mit dem Haken „spielt 2“). In 7 und 8
--     wird nur gelaufen (kein Springen), Ende nach Zeit.
--   · Am Ende die Rangliste der Runde (nur diese Runde, nichts bleibt).
--
-- Wertung rechnen die Geräte (sie haben Welt und Modell): Level 1–6
-- schickt jedes Tablet seinen Endstand (res), Level 7/8 rechnen alle aus
-- den Werten des Teams (vals). Der Server prüft nur Form und Größe.
--
-- Signal an die Tablets: skill_room_state.data.mp = 1 (setzt
-- nt_room_act 'on'/'off'). Das kommt mit dem normalen 3-s-Takt des
-- Raums an; erst dann fragt das Tablet nt_play im eigenen Takt.
--
-- Nur RPCs (security definer), keine Grants auf die Tabellen. Alles
-- hängt am Raum bzw. Teilnehmer (on delete cascade). Kein DROP,
-- mehrfach ausführbar. Prüfstand supabase/tests/0296_nebeltal_gemeinsam.mjs.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists nt_rounds (
  room_id            uuid primary key references skill_rooms(id) on delete cascade,
  phase              text not null default 'off'
                       check (phase in ('off', 'lobby', 'intro', 'countdown', 'running', 'ended')),
  level              int  not null default 0 check (level between 0 and 8),
  seed               int  not null default 1000 check (seed between 1000 and 9999),
  run                int  not null default 0,
  team_size          int  not null default 8 check (team_size between 2 and 8),
  secs               int  not null default 120 check (secs between 30 and 600),
  countdown_ends_at  timestamptz,
  started_at         timestamptz,
  ends_at            timestamptz,
  ended_at           timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table nt_rounds is
  'Nebeltal gemeinsam: Runde je Raum (Phase off/lobby/intro/countdown/running/ended, Level, '
  'Welt-Nummer, Teamgröße Level 8, Zeit Level 7/8). Lazy angelegt von nt_ensure. Seit 0296.';

alter table nt_rounds enable row level security;


create table if not exists nt_players (
  participant_id  uuid primary key references skill_participants(id) on delete cascade,
  room_id         uuid not null references skill_rooms(id) on delete cascade,
  color           int  not null default 0,
  team            int,
  dbl             boolean not null default false,
  slots           int[] not null default '{}',
  run             int  not null default 0,
  ready           boolean not null default false,
  pos             real[] not null default '{0.5,0.5}',
  vals            jsonb not null default '{}'::jsonb,
  info            jsonb not null default '{}'::jsonb,
  done            boolean not null default false,
  res             jsonb,
  seen_at         timestamptz not null default now()
);

comment on table nt_players is
  'Nebeltal gemeinsam: Pinguin je Teilnehmer (Schalfarbe, Team + Welten in Level 7/8, '
  'Lobby-Position, Werte der eigenen Welten, Fortschritt, Endstand). run = in welcher Runde '
  'die Person mitspielt. seen_at = letzter Kontakt (anwesend = 20 s). Seit 0296.';

create index if not exists nt_players_room_idx on nt_players (room_id, team);

alter table nt_players enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer (ohne Grant)
-- ─────────────────────────────────────────────────────────────

-- Raum der Lehrkraft aus dem Code (Besitzer oder eingeladen), nur Nebeltal.
create or replace function nt_teacher_room(p_code text)
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
  if v_room.id is null or v_room.tool_id <> 'nebeltal' or v_room.expires_at <= now()
     or not skill_room_is_teacher(v_room.id, auth.uid()) then
    return v_none;
  end if;
  return v_room;
end;
$$;

revoke all on function nt_teacher_room(text) from public, anon, authenticated;


-- Teilnehmer + Raum aus dem Token.
create or replace function nt_part(
  p_token text,
  out p    skill_participants,
  out room skill_rooms,
  out err  text)
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
begin
  select * into p from skill_participants where token = p_token;
  if p.id is null then err := 'unknown_token'; return; end if;
  if p.removed_at is not null then err := 'removed'; return; end if;
  select * into room from skill_rooms where id = p.room_id;
  if room.id is null or room.expires_at <= now() then err := 'room_gone'; return; end if;
  if room.tool_id <> 'nebeltal' then err := 'not_found'; return; end if;
  if p.blocked then err := 'blocked'; return; end if;
end;
$$;

revoke all on function nt_part(text) from public, anon, authenticated;


create or replace function nt_ensure(p_room uuid)
  returns nt_rounds
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r nt_rounds;
begin
  select * into v_r from nt_rounds where room_id = p_room;
  if v_r.room_id is not null then return v_r; end if;
  insert into nt_rounds (room_id) values (p_room) on conflict (room_id) do nothing;
  select * into v_r from nt_rounds where room_id = p_room;
  return v_r;
end;
$$;

revoke all on function nt_ensure(uuid) from public, anon, authenticated;


-- Anwesend = in den letzten 20 s gemeldet, nicht entfernt, nicht stillgelegt.
create or replace function nt_here(p_seen timestamptz, p skill_participants)
  returns boolean
  language sql
  stable
as $$
  select p_seen > now() - interval '20 seconds' and p.removed_at is null and not p.blocked;
$$;

revoke all on function nt_here(timestamptz, skill_participants) from public, anon, authenticated;


-- Wie viele Personen höchstens in einem Team: Level 7 = 2 Welten, Level 8 = Teamgröße.
create or replace function nt_cap(v_r nt_rounds)
  returns int
  language sql
  immutable
as $$
  select case when v_r.level = 7 then 2 when v_r.level = 8 then v_r.team_size else null end;
$$;

revoke all on function nt_cap(nt_rounds) from public, anon, authenticated;


-- Welten eines Teams auf die anwesenden Mitglieder verteilen. Level 7: 2 Welten,
-- Level 8: 8 Welten. Jede Person bekommt gleich viele hintereinander; die übrigen
-- gehen zuerst an die mit dem Haken „spielt 2“ (dbl), dann nach Sitzplatz.
-- Hintereinander heißt in Level 8: wer zwei Welten hat, hat ein ganzes Neuron.
create or replace function nt_slots(p_room uuid, p_team int)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r   nt_rounds;
  v_nw  int;
  v_n   int;
  v_i   int := 0;
  v_s   int := 0;
  v_k   int;
  rec   record;
begin
  if p_team is null then return; end if;
  select * into v_r from nt_rounds where room_id = p_room;
  v_nw := case when v_r.level = 7 then 2 else 8 end;
  update nt_players pl set slots = '{}'
    from skill_participants p
   where p.id = pl.participant_id and pl.room_id = p_room and pl.team = p_team
     and not nt_here(pl.seen_at, p);
  select count(*) into v_n
    from nt_players pl join skill_participants p on p.id = pl.participant_id
   where pl.room_id = p_room and pl.team = p_team and nt_here(pl.seen_at, p);
  if v_n = 0 then return; end if;
  for rec in
    select pl.participant_id
      from nt_players pl join skill_participants p on p.id = pl.participant_id
     where pl.room_id = p_room and pl.team = p_team and nt_here(pl.seen_at, p)
     order by pl.dbl desc, p.seat
  loop
    v_k := v_nw / v_n + case when v_i < v_nw % v_n then 1 else 0 end;
    update nt_players
       set slots = case when v_k > 0 then array(select generate_series(v_s, v_s + v_k - 1)) else '{}'::int[] end
     where participant_id = rec.participant_id;
    v_s := v_s + v_k;
    v_i := v_i + 1;
  end loop;
end;
$$;

revoke all on function nt_slots(uuid, int) from public, anon, authenticated;


-- Teams neu bilden: so wenige wie möglich (je höchstens cap), so gleich groß wie möglich,
-- reihum nach Sitzplatz. Außerhalb von Level 7/8: keine Teams.
create or replace function nt_balance(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r   nt_rounds;
  v_cap int;
  v_n   int;
  v_t   int;
begin
  select * into v_r from nt_rounds where room_id = p_room;
  update nt_players set team = null, slots = '{}' where room_id = p_room;
  v_cap := nt_cap(v_r);
  if v_cap is null then return; end if;
  select count(*) into v_n
    from nt_players pl join skill_participants p on p.id = pl.participant_id
   where pl.room_id = p_room and nt_here(pl.seen_at, p);
  if v_n = 0 then return; end if;
  v_t := ceil(v_n::numeric / v_cap)::int;
  with o as (
    select pl.participant_id, (row_number() over (order by p.seat))::int - 1 as i
      from nt_players pl join skill_participants p on p.id = pl.participant_id
     where pl.room_id = p_room and nt_here(pl.seen_at, p))
  update nt_players pl set team = o.i % v_t from o where pl.participant_id = o.participant_id;
  for i in 0 .. v_t - 1 loop
    perform nt_slots(p_room, i);
  end loop;
end;
$$;

revoke all on function nt_balance(uuid) from public, anon, authenticated;


-- Wer in Level 7/8 ohne Team in der Lobby steht: ins kleinste Team, das noch Platz hat,
-- sonst ein neues Team.
create or replace function nt_place(p_room uuid, p_pid uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r   nt_rounds;
  v_cap int;
  v_t   int;
  v_old int;
begin
  select * into v_r from nt_rounds where room_id = p_room;
  v_cap := nt_cap(v_r);
  if v_cap is null then return; end if;
  select team into v_old from nt_players where participant_id = p_pid;
  if v_old is not null then return; end if;
  select x.team into v_t
    from (select pl.team, count(*) filter (where nt_here(pl.seen_at, p)) n
            from nt_players pl join skill_participants p on p.id = pl.participant_id
           where pl.room_id = p_room and pl.team is not null
           group by pl.team) x
   where x.n < v_cap
   order by x.n, x.team
   limit 1;
  if v_t is null then
    select coalesce(max(team) + 1, 0) into v_t from nt_players where room_id = p_room;
  end if;
  update nt_players set team = v_t where participant_id = p_pid;
  perform nt_slots(p_room, v_t);
end;
$$;

revoke all on function nt_place(uuid, uuid) from public, anon, authenticated;


-- Das Signal an die Tablets: skill_room_state.data.mp (der Raum-Takt bemerkt die Änderung).
create or replace function nt_flag(p_room uuid, p_on boolean)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  insert into skill_room_state (room_id, data, updated_at)
  values (p_room, jsonb_build_object('mp', case when p_on then 1 else 0 end), now())
  on conflict (room_id) do update
    set data = skill_room_state.data || jsonb_build_object('mp', case when p_on then 1 else 0 end),
        updated_at = now();
  perform skill_touch(p_room);
end;
$$;

revoke all on function nt_flag(uuid, boolean) from public, anon, authenticated;


-- Countdown → läuft, Zeit um / alle fertig → vorbei. Lazy bei jedem Aufruf, kein Cron.
create or replace function nt_advance(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r nt_rounds;
begin
  update nt_rounds
     set phase = 'running', started_at = countdown_ends_at,
         ends_at = case when level in (7, 8) then countdown_ends_at + make_interval(secs => secs)
                        when level in (1, 2) then countdown_ends_at + interval '62 seconds' end,
         updated_at = now()
   where room_id = p_room and phase = 'countdown' and countdown_ends_at <= now();
  select * into v_r from nt_rounds where room_id = p_room;
  if v_r.phase <> 'running' then return; end if;
  if (v_r.ends_at is not null and v_r.ends_at <= now())
     or (v_r.level <= 6 and not exists (
           select 1 from nt_players pl join skill_participants p on p.id = pl.participant_id
            where pl.room_id = p_room and pl.run = v_r.run and not pl.done and p.removed_at is null)) then
    update nt_rounds set phase = 'ended', ended_at = now(), updated_at = now()
     where room_id = p_room and phase = 'running';
  end if;
end;
$$;

revoke all on function nt_advance(uuid) from public, anon, authenticated;


-- Die Ansicht. p_me = Teilnehmer (null = Lehrkraft, sieht alles).
-- Tablets sehen Werte (vals) nur des eigenen Teams und Endstände (res) erst am Ende.
create or replace function nt_state(p_room uuid, p_me uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_r      nt_rounds;
  v_mine   nt_players;
  v_t      boolean := p_me is null;
  v_people jsonb;
  v_me     jsonb;
begin
  select * into v_r from nt_rounds where room_id = p_room;
  if p_me is not null then select * into v_mine from nt_players where participant_id = p_me; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'n',  coalesce(nullif(btrim(p.name), ''), 'Tablet ' || p.seat),
           'c',  pl.color,
           't',  pl.team,
           'd',  pl.dbl,
           's',  to_jsonb(pl.slots),
           'on', nt_here(pl.seen_at, p),
           'in', v_r.run > 0 and pl.run = v_r.run,
           'x',  pl.pos[1], 'y', pl.pos[2],
           'r',  pl.ready,
           'f',  pl.done,
           'i',  case when v_t or pl.participant_id = p_me then pl.info end,
           'v',  case when v_t or v_r.phase = 'ended' or pl.participant_id = p_me
                        or (pl.team is not null and pl.team = v_mine.team) then pl.vals end,
           'res', case when v_t or v_r.phase = 'ended' or pl.participant_id = p_me then pl.res end)
           order by p.seat), '[]'::jsonb)
    into v_people
    from nt_players pl join skill_participants p on p.id = pl.participant_id
   where pl.room_id = p_room and p.removed_at is null
     and (nt_here(pl.seen_at, p) or (v_r.run > 0 and pl.run = v_r.run and v_r.phase <> 'lobby'));

  if p_me is not null then
    v_me := jsonb_build_object('id', p_me, 'c', v_mine.color, 't', v_mine.team, 's', to_jsonb(v_mine.slots),
                               'in', v_r.run > 0 and v_mine.run = v_r.run, 'r', v_mine.ready,
                               'f', v_mine.done, 'i', v_mine.info, 'res', v_mine.res);
  end if;

  return jsonb_build_object(
    'ok', true,
    'phase', v_r.phase,
    'level', v_r.level,
    'seed', v_r.seed,
    'run', v_r.run,
    'team_size', v_r.team_size,
    'secs', v_r.secs,
    'countdown_ends_at', v_r.countdown_ends_at,
    'started_at', v_r.started_at,
    'ends_at', v_r.ends_at,
    'ended_at', v_r.ended_at,
    'server_now', now(),
    'people', v_people,
    'me', v_me);
end;
$$;

revoke all on function nt_state(uuid, uuid) from public, anon, authenticated;


-- Zahl aus jsonb, sonst null (keine Ausnahme bei Unsinn).
create or replace function nt_num(p jsonb)
  returns float8
  language sql
  immutable
as $$
  select case when jsonb_typeof(p) = 'number' and abs((p #>> '{}')::float8) < 1e6
              then (p #>> '{}')::float8 end;
$$;

revoke all on function nt_num(jsonb) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Lehrkraft (p_code hängt presenterActions.call an)
-- ─────────────────────────────────────────────────────────────
create or replace function nt_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := nt_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform nt_ensure(v_room.id);
  perform nt_advance(v_room.id);
  return nt_state(v_room.id, null);
end;
$$;

revoke all on function nt_room_get(text) from public;
grant execute on function nt_room_get(text) to authenticated;


-- Alles, was die Lehrkraft tut, über einen Aufruf:
--   on / off              gemeinsam spielen an/aus (Tablets in die Lobby bzw. zurück)
--   level {n}             Level wählen (1–8), neue Welt; 7/8 bildet Teams
--   seed                  neue Welt
--   size {n}              Teamgröße Level 8 (2–8), bildet Teams neu
--   secs {n}              Zeit Level 7/8 (30–600 s)
--   balance               Teams neu und gleich groß
--   move {pid, team}      Person in ein Team (team −1 = neues Team)
--   dbl {pid, on}         „spielt 2“ (bekommt zuerst übrige Welten)
--   swap {a, b}           zwei Personen tauschen ihre Teams
--   start                 Runde beginnt: Erklärkarte auf den Tablets
--   go                    3-2-1, dann läuft die Runde
--   stop                  Runde beenden (Erklärkarte: zurück in die Lobby)
--   lobby                 zurück in die Lobby
create or replace function nt_room_act(p_code text, p_act text, p_args jsonb default '{}'::jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := nt_teacher_room(p_code);
  v_r    nt_rounds;
  v_a    jsonb := coalesce(p_args, '{}'::jsonb);
  v_n    int;
  v_pid  uuid;
  v_old  int;
  v_cap  int;
  rec    record;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform nt_ensure(v_room.id);
  perform nt_advance(v_room.id);
  select * into v_r from nt_rounds where room_id = v_room.id for update;

  if p_act = 'on' then
    if v_r.phase = 'off' then
      update nt_rounds set phase = 'lobby', updated_at = now() where room_id = v_room.id;
    end if;
    perform nt_flag(v_room.id, true);

  elsif p_act = 'off' then
    update nt_rounds set phase = 'off', updated_at = now() where room_id = v_room.id;
    perform nt_flag(v_room.id, false);

  elsif v_r.phase = 'off' then
    return jsonb_build_object('ok', false, 'error', 'mp_off');

  elsif p_act = 'level' then
    v_n := nt_num(v_a->'n')::int;
    if v_n is null or v_n not between 1 and 8 then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    update nt_rounds
       set level = v_n, phase = 'lobby', seed = 1000 + floor(random() * 9000)::int,
           secs = case when v_n = 7 and v_r.level <> 7 then 120 when v_n = 8 and v_r.level <> 8 then 180 else secs end,
           updated_at = now()
     where room_id = v_room.id;
    perform nt_balance(v_room.id);

  elsif p_act = 'seed' then
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    update nt_rounds set seed = 1000 + floor(random() * 9000)::int, updated_at = now() where room_id = v_room.id;

  elsif p_act = 'size' then
    v_n := nt_num(v_a->'n')::int;
    if v_n is null or v_n not between 2 and 8 then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    update nt_rounds set team_size = v_n, updated_at = now() where room_id = v_room.id;
    if v_r.level = 8 then perform nt_balance(v_room.id); end if;

  elsif p_act = 'secs' then
    v_n := nt_num(v_a->'n')::int;
    if v_n is null or v_n not between 30 and 600 then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    update nt_rounds set secs = v_n, updated_at = now() where room_id = v_room.id;

  elsif p_act = 'balance' then
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    perform nt_balance(v_room.id);

  elsif p_act = 'swap' then
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    declare
      v_b  uuid;
      v_tb int;
    begin
      begin
        v_pid := (v_a->>'a')::uuid; v_b := (v_a->>'b')::uuid;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end;
      select team into v_old from nt_players where participant_id = v_pid and room_id = v_room.id;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
      select team into v_tb from nt_players where participant_id = v_b and room_id = v_room.id;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
      update nt_players set team = v_tb where participant_id = v_pid;
      update nt_players set team = v_old where participant_id = v_b;
      perform nt_slots(v_room.id, v_old);
      perform nt_slots(v_room.id, v_tb);
    end;

  elsif p_act in ('move', 'dbl') then
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    begin
      v_pid := (v_a->>'pid')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end;
    select team into v_old from nt_players where participant_id = v_pid and room_id = v_room.id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if p_act = 'dbl' then
      update nt_players set dbl = (v_a->'on' = 'true'::jsonb) where participant_id = v_pid;
      perform nt_slots(v_room.id, v_old);
    else
      v_cap := nt_cap(v_r);
      v_n := nt_num(v_a->'team')::int;
      if v_cap is null or v_n is null or v_n < -1 or v_n > 60 then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
      if v_n = -1 then
        select coalesce(max(team) + 1, 0) into v_n from nt_players where room_id = v_room.id;
      elsif (select count(*) from nt_players pl join skill_participants p on p.id = pl.participant_id
              where pl.room_id = v_room.id and pl.team = v_n and pl.participant_id <> v_pid
                and nt_here(pl.seen_at, p)) >= v_cap then
        return jsonb_build_object('ok', false, 'error', 'team_full');
      end if;
      update nt_players set team = v_n where participant_id = v_pid;
      perform nt_slots(v_room.id, v_old);
      perform nt_slots(v_room.id, v_n);
    end if;

  elsif p_act = 'start' then
    if v_r.phase not in ('lobby', 'ended') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    if v_r.level = 0 then return jsonb_build_object('ok', false, 'error', 'no_level'); end if;
    if not exists (select 1 from nt_players pl join skill_participants p on p.id = pl.participant_id
                    where pl.room_id = v_room.id and nt_here(pl.seen_at, p)) then
      return jsonb_build_object('ok', false, 'error', 'nobody');
    end if;
    -- Wer nicht da ist, fällt aus seinem Team; wer da ist und kein Team hat, bekommt eins.
    if nt_cap(v_r) is not null then
      update nt_players pl set team = null, slots = '{}'
        from skill_participants p
       where p.id = pl.participant_id and pl.room_id = v_room.id and not nt_here(pl.seen_at, p);
      for rec in select pl.participant_id from nt_players pl join skill_participants p on p.id = pl.participant_id
                  where pl.room_id = v_room.id and pl.team is null and nt_here(pl.seen_at, p) order by p.seat loop
        perform nt_place(v_room.id, rec.participant_id);
      end loop;
      for rec in select distinct team from nt_players where room_id = v_room.id and team is not null loop
        perform nt_slots(v_room.id, rec.team);
      end loop;
    else
      update nt_players set team = null, slots = '{}' where room_id = v_room.id;
    end if;
    update nt_players pl
       set run = v_r.run + 1, ready = false, done = false, res = null, info = '{}'::jsonb, vals = '{}'::jsonb
      from skill_participants p
     where p.id = pl.participant_id and pl.room_id = v_room.id and nt_here(pl.seen_at, p);
    update nt_rounds
       set phase = 'intro', run = run + 1, countdown_ends_at = null, started_at = null,
           ends_at = null, ended_at = null, updated_at = now()
     where room_id = v_room.id;

  elsif p_act = 'go' then
    if v_r.phase <> 'intro' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
    update nt_rounds set phase = 'countdown', countdown_ends_at = now() + interval '3 seconds', updated_at = now()
     where room_id = v_room.id;

  elsif p_act = 'stop' then
    if v_r.phase = 'intro' then
      update nt_rounds set phase = 'lobby', updated_at = now() where room_id = v_room.id;
    elsif v_r.phase in ('countdown', 'running') then
      update nt_rounds set phase = 'ended', ended_at = now(), updated_at = now() where room_id = v_room.id;
    else
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;

  elsif p_act = 'lobby' then
    update nt_rounds set phase = 'lobby', updated_at = now() where room_id = v_room.id;

  else
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  perform skill_touch(v_room.id);
  return nt_state(v_room.id, null);
end;
$$;

revoke all on function nt_room_act(text, text, jsonb) from public;
grant execute on function nt_room_act(text, text, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Tablet: melden und lesen in einem Aufruf
-- ─────────────────────────────────────────────────────────────
-- p (alles optional):
--   pos   [x, y]          Lobby-Position 0…1
--   ready true            Erklärkarte gelesen
--   vals  {"3": [a, b]}   Werte der eigenen Welten (Level 7/8), nur eigene slots
--   info  {…}             Fortschritt (Sprünge übrig, Ort …), höchstens 400 Byte
--   res   {…}             Endstand, höchstens 600 Byte → fertig
create or replace function nt_play(p_token text, p jsonb default '{}'::jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v      record;
  v_r    nt_rounds;
  v_pl   nt_players;
  v_p    jsonb := coalesce(p, '{}'::jsonb);
  v_c    int;
  v_x    float8;
  v_y    float8;
  v_vals jsonb := '{}'::jsonb;
  v_a    float8;
  v_b    float8;
  v_k    text;
  v_in   boolean;
begin
  select * into v from nt_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if jsonb_typeof(v_p) <> 'object' or octet_length(v_p::text) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  perform nt_ensure((v.room).id);
  perform nt_advance((v.room).id);
  select * into v_r from nt_rounds where room_id = (v.room).id;
  if v_r.phase = 'off' then return jsonb_build_object('ok', true, 'phase', 'off'); end if;

  -- Erster Kontakt: Pinguin mit der kleinsten freien Schalfarbe, irgendwo in der Lobby.
  select * into v_pl from nt_players where participant_id = (v.p).id;
  if v_pl.participant_id is null then
    select min(g) into v_c from generate_series(0, 15) g
     where not exists (select 1 from nt_players x where x.room_id = (v.room).id and x.color = g);
    if v_c is null then
      select count(*) % 16 into v_c from nt_players where room_id = (v.room).id;
    end if;
    insert into nt_players (participant_id, room_id, color, pos)
    values ((v.p).id, (v.room).id, v_c, array[0.15 + random() * 0.7, 0.2 + random() * 0.6]::real[])
    on conflict (participant_id) do nothing;
    select * into v_pl from nt_players where participant_id = (v.p).id;
  end if;

  -- Lebenszeichen (ohne Inhalt höchstens alle 5 s schreiben)
  if v_p <> '{}'::jsonb or v_pl.seen_at < now() - interval '5 seconds' then
    update nt_players set seen_at = now() where participant_id = v_pl.participant_id;
  end if;

  if v_r.phase = 'lobby' and v_pl.team is null and v_r.level in (7, 8) then
    perform nt_place((v.room).id, v_pl.participant_id);
  end if;

  v_in := v_r.run > 0 and v_pl.run = v_r.run;

  if jsonb_typeof(v_p->'pos') = 'array' then
    v_x := nt_num(v_p->'pos'->0); v_y := nt_num(v_p->'pos'->1);
    if v_x is not null and v_y is not null then
      update nt_players set pos = array[greatest(0, least(1, v_x)), greatest(0, least(1, v_y))]::real[]
       where participant_id = v_pl.participant_id;
    end if;
  end if;

  if v_p->'ready' = 'true'::jsonb and v_in and v_r.phase in ('intro', 'countdown') then
    update nt_players set ready = true where participant_id = v_pl.participant_id;
  end if;

  if jsonb_typeof(v_p->'vals') = 'object' and v_in and v_r.phase in ('countdown', 'running') then
    select * into v_pl from nt_players where participant_id = v_pl.participant_id;
    for v_k in select jsonb_object_keys(v_p->'vals') loop
      if v_k ~ '^[0-7]$' and v_k::int = any (v_pl.slots) and jsonb_typeof(v_p->'vals'->v_k) = 'array' then
        v_a := nt_num(v_p->'vals'->v_k->0); v_b := nt_num(v_p->'vals'->v_k->1);
        if v_a is not null and v_b is not null then
          v_vals := v_vals || jsonb_build_object(v_k, jsonb_build_array(
                      round(greatest(-60, least(60, v_a))::numeric, 4), round(greatest(-60, least(60, v_b))::numeric, 4)));
        end if;
      end if;
    end loop;
    if v_vals <> '{}'::jsonb then
      update nt_players set vals = vals || v_vals where participant_id = v_pl.participant_id;
    end if;
  end if;

  if jsonb_typeof(v_p->'info') = 'object' and v_in and v_r.phase in ('countdown', 'running')
     and octet_length((v_p->'info')::text) <= 400 then
    update nt_players set info = v_p->'info' where participant_id = v_pl.participant_id;
  end if;

  if jsonb_typeof(v_p->'res') = 'object' and v_in and v_r.phase in ('running', 'ended')
     and octet_length((v_p->'res')::text) <= 600 then
    update nt_players set res = v_p->'res', done = true
     where participant_id = v_pl.participant_id and not done;
    perform nt_advance((v.room).id);
  end if;

  return nt_state((v.room).id, v_pl.participant_id);
end;
$$;

revoke all on function nt_play(text, jsonb) from public;
grant execute on function nt_play(text, jsonb) to anon, authenticated;
