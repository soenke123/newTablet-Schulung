-- ══════════════════════════════════════════════════════════════
-- Migration 0240 — Definitions Derby: Kistensturm mit Items
-- ══════════════════════════════════════════════════════════════
-- Sönke 30.10.2026: „wie Mario Kart“ — wer eine Item-Linie überquert,
-- bekommt ein Item für sein Team, jedes Teammitglied kann es einsetzen.
-- Je weiter hinten, desto stärker die Items.
--
-- ── Türme sind jetzt Listen von Kisten ─────────────────────────
-- dd_storm_teams.boxes = [ {k, t, n?}, … ] von unten nach oben.
--   k  n normal · g Bonus (gold) · s Stein · i Eis · x Maxi (2 hoch)
--      · m Mini (½ hoch)
--   t  Team, dessen Farbe die Kiste trägt (eine geklaute Kiste behält sie)
--   n  nur Eis: wie viele richtige Antworten in Folge noch fehlen
-- height = Summe der Größen (Maxi 2, Mini ½, sonst 1) → numeric.
-- Gewonnen und gereiht wird nach Höhe. Neue Kisten aus Antworten (und
-- Bonus/Stein) kommen UNTEN hinein — die Figur hebt den Turm an;
-- Geklautes und Eis landen OBEN.
--
-- ── Item-Linien ────────────────────────────────────────────────
-- Zwischen den Aufgabenstufen, also bei 20/40/60/80 % der Zielhöhe;
-- „häufig“ (Lehrkraft) zusätzlich in der Mitte jeder Stufe (alle 10 %).
-- Jede Linie zählt je Team nur einmal (line_max). Höchstens 2 Items
-- je Team auf Vorrat. Welches Item: Zufall nach Gewicht je Platz
-- (dd_storm_draw; Plätze: Erster · vordere Hälfte · hintere Hälfte ·
-- Letzter), nur eingeschaltete Items.
--
-- ── Die Items (Sönke 30.10.2026) ──────────────────────────────
--   bonus   2 Bonus-Kisten (gold) unten hinein
--   stein   Steinkiste unten hinein; Möwe, Sturm und Boom nehmen sie
--           nicht weg (Boom zerstört sie, schützt damit aber darunter;
--           der Bus nimmt sie mit)
--   moewe   klaut beim Team direkt davor die oberste Kiste und legt sie
--           oben auf den eigenen Turm (Farbe bleibt)
--   moewe3  dasselbe bei bis zu drei Teams davor
--   maxi    20 s lang: jede richtige Antwort eine doppelt hohe Kiste
--   mini    bis zu 2 Teams direkt davor: 20 s lang halb so hohe Kisten
--   sturm   30 s: jede falsche Antwort kostet die oberste Kiste —
--           aber nur, wer schon über Stufe 1 ist (Höhe ≥ Ziel/5)
--   tea     die ersten beiden Teams (nie das eigene): 10 s Teatime,
--           keine Antworten, keine Items
--   bus     fährt unten durch und nimmt jedem Team unten Kisten bis
--           zur Höhe von 5 normalen Kisten
--   boom    blaue Plasmabombe auf den Ersten: 5 Kisten von oben
--           kaputt; ein Stein wird zerstört und hält den Rest
--   eis     ein zufälliges anderes Team bekommt oben eine Eiskiste:
--           die nächsten 5 Antworten des Teams müssen sitzen, sonst
--           rutscht alles darunter weg; danach taut sie zur Kiste
--   kuddel  Kuddelmuddel: alle Kisten aller Teams gemischt, jedes
--           Team behält seine Anzahl (die Höhen ändern sich)
--
-- Einstellungen (nur in der Lobby): items_on, items_often, items_off.
-- Neue RPCs: dd_storm_use (Tablet), dd_storm_room_items (Lehrkraft).
-- Nur RPCs, kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten
-- ─────────────────────────────────────────────────────────────
alter table dd_storm_boards add column if not exists items_on    boolean not null default true;
alter table dd_storm_boards add column if not exists items_often boolean not null default false;
alter table dd_storm_boards add column if not exists items_off   jsonb   not null default '[]'::jsonb;
alter table dd_storm_boards add column if not exists storm_until timestamptz;

alter table dd_storm_teams add column if not exists boxes      jsonb not null default '[]'::jsonb;
alter table dd_storm_teams add column if not exists items      jsonb not null default '[]'::jsonb;
alter table dd_storm_teams add column if not exists line_max   int   not null default 0;
alter table dd_storm_teams add column if not exists maxi_until timestamptz;
alter table dd_storm_teams add column if not exists mini_until timestamptz;
alter table dd_storm_teams add column if not exists tea_until  timestamptz;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'dd_storm_teams' and column_name = 'height' and data_type = 'integer') then
    alter table dd_storm_teams alter column height type numeric;
  end if;
  if exists (select 1 from information_schema.columns
              where table_name = 'dd_storm_events' and column_name = 'height' and data_type = 'integer') then
    alter table dd_storm_events alter column height type numeric;
  end if;
end $$;

alter table dd_storm_events add column if not exists data jsonb;

comment on column dd_storm_teams.boxes is
  'Kistensturm: Kisten von unten nach oben, je {k, t, n?} (k n/g/s/i/x/m). Seit 0240.';


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer (ohne Grant)
-- ─────────────────────────────────────────────────────────────
create or replace function dd_storm_bsize(p_k text)
  returns numeric language sql immutable as $$
  select case p_k when 'x' then 2::numeric when 'm' then 0.5 else 1::numeric end;
$$;
revoke all on function dd_storm_bsize(text) from public, anon, authenticated;

create or replace function dd_storm_bsum(p_boxes jsonb)
  returns numeric language sql immutable as $$
  select coalesce(sum(dd_storm_bsize(e->>'k')), 0) from jsonb_array_elements(coalesce(p_boxes, '[]'::jsonb)) e;
$$;
revoke all on function dd_storm_bsum(jsonb) from public, anon, authenticated;

-- Ereignis mit Daten (dd_storm_event aus 0239 bleibt für Altes stehen).
create or replace function dd_storm_ev(p_room uuid, p_kind text, p_team int, p_who text, p_height numeric, p_data jsonb)
  returns bigint
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_seq bigint;
begin
  update dd_storm_boards set seq = seq + 1 where room_id = p_room returning seq into v_seq;
  insert into dd_storm_events (room_id, seq, kind, team, who, height, data)
  values (p_room, v_seq, p_kind, p_team, left(p_who, 40), p_height, p_data);
  if v_seq % 50 = 0 then
    delete from dd_storm_events where room_id = p_room and seq <= v_seq - 200;
  end if;
  return v_seq;
end;
$$;
revoke all on function dd_storm_ev(uuid, text, int, text, numeric, jsonb) from public, anon, authenticated;

-- Turm neu setzen; Höhe = Summe, reached_at nur beim Wachsen.
create or replace function dd_storm_put(p_room uuid, p_team int, p_boxes jsonb)
  returns numeric
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_old numeric;
  v_new numeric := dd_storm_bsum(p_boxes);
begin
  select height into v_old from dd_storm_teams where room_id = p_room and team = p_team;
  update dd_storm_teams
     set boxes = p_boxes, height = v_new,
         reached_at = case when v_new > coalesce(v_old, 0) then now() else reached_at end
   where room_id = p_room and team = p_team;
  return v_new - coalesce(v_old, 0);
end;
$$;
revoke all on function dd_storm_put(uuid, int, jsonb) from public, anon, authenticated;

-- Platz je Team: 1 = vorn (höchster Turm, bei Gleichstand wer zuerst).
create or replace function dd_storm_ranks(p_room uuid)
  returns table(team int, rk int, n int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select t.team, (row_number() over (order by t.height desc, t.reached_at asc nulls last, t.team))::int,
         (count(*) over ())::int
    from dd_storm_teams t where t.room_id = p_room;
$$;
revoke all on function dd_storm_ranks(uuid) from public, anon, authenticated;

-- Item ziehen. Gewicht je Platzgruppe (Erster · vordere Hälfte · hintere Hälfte · Letzter).
create or replace function dd_storm_draw(p_room uuid, p_team int)
  returns text
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b  dd_storm_boards;
  v_rk int;
  v_n  int;
  v_g  int;
  v_r  numeric := random();
  v_it text;
begin
  select * into v_b from dd_storm_boards where room_id = p_room;
  select r.rk, r.n into v_rk, v_n from dd_storm_ranks(p_room) r where r.team = p_team;
  if v_rk is null then return null; end if;
  v_g := case when v_rk = 1 then 1 when v_rk = v_n then 4
              when (v_rk - 1)::numeric / greatest(v_n - 1, 1) < 0.5 then 2 else 3 end;
  with w as (
    select x.it, (array[x.w1, x.w2, x.w3, x.w4])[v_g]::numeric as w
      from (values
        ('bonus',  3, 3, 2, 1), ('stein', 3, 2, 1, 0), ('moewe', 0, 3, 2, 1), ('maxi', 1, 2, 3, 2),
        ('eis',    1, 2, 2, 1), ('mini',  0, 1, 2, 2), ('sturm', 0, 1, 2, 2), ('tea',  0, 0, 2, 2),
        ('moewe3', 0, 0, 2, 3), ('boom',  0, 0, 1, 2), ('bus',   0, 0, 1, 2), ('kuddel', 1, 1, 1, 1)
      ) x(it, w1, w2, w3, w4)
     where not (v_b.items_off ? x.it)
       -- Teatime trifft die ersten beiden Teams — nie das eigene.
       and not (x.it = 'tea' and v_rk <= 2 and v_n > 2)
       and not (v_n < 2 and x.it in ('moewe', 'moewe3', 'mini', 'tea', 'eis'))
  ), c as (
    select it, sum(w) over (order by it) as cum, sum(w) over () as tot from w where w > 0
  )
  select it into v_it from c where cum > v_r * tot order by cum limit 1;
  return v_it;
end;
$$;
revoke all on function dd_storm_draw(uuid, int) from public, anon, authenticated;

-- Linien, die das Team mit seiner neuen Höhe überquert hat → Items.
create or replace function dd_storm_award(p_room uuid, p_team int)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b    dd_storm_boards;
  v_t    dd_storm_teams;
  v_div  int;
  v_hit  int;
  v_k    int;
  v_it   text;
begin
  select * into v_b from dd_storm_boards where room_id = p_room;
  if not v_b.items_on then return; end if;
  select * into v_t from dd_storm_teams where room_id = p_room and team = p_team;
  v_div := case when v_b.items_often then 10 else 5 end;
  v_hit := least(v_div - 1, floor(v_t.height * v_div / v_b.goal)::int);
  if v_hit <= v_t.line_max then return; end if;
  for v_k in (v_t.line_max + 1) .. v_hit loop
    v_it := dd_storm_draw(p_room, p_team);
    if v_it is not null then
      select * into v_t from dd_storm_teams where room_id = p_room and team = p_team;
      if jsonb_array_length(v_t.items) < 2 then
        update dd_storm_teams set items = items || jsonb_build_array(v_it) where room_id = p_room and team = p_team;
        perform dd_storm_ev(p_room, 'get', p_team, null, v_t.height, jsonb_build_object('it', v_it));
      end if;
    end if;
  end loop;
  update dd_storm_teams set line_max = v_hit where room_id = p_room and team = p_team;
end;
$$;
revoke all on function dd_storm_award(uuid, int) from public, anon, authenticated;

-- Hat jemand das Ziel erreicht? Dann gewinnt der höchste Turm.
create or replace function dd_storm_check_win(p_room uuid)
  returns boolean
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b  dd_storm_boards;
  v_t  dd_storm_teams;
begin
  select * into v_b from dd_storm_boards where room_id = p_room;
  if v_b.phase <> 'running' then return false; end if;
  select t.* into v_t from dd_storm_teams t join dd_storm_ranks(p_room) r on r.team = t.team
   where t.room_id = p_room and r.rk = 1;
  if v_t.team is null or v_t.height < v_b.goal then return false; end if;
  update dd_storm_boards set phase = 'ended', ended_at = now(), winner_team = v_t.team where room_id = p_room;
  perform dd_storm_ev(p_room, 'win', v_t.team, null, v_t.height, null);
  return true;
end;
$$;
revoke all on function dd_storm_check_win(uuid) from public, anon, authenticated;

-- Oberste Kiste, die man wegnehmen darf (kein Stein, kein Eis), herausnehmen.
create or replace function dd_storm_take_top(p_room uuid, p_team int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b jsonb;
  v_i int;
  v_x jsonb;
begin
  select boxes into v_b from dd_storm_teams where room_id = p_room and team = p_team;
  for v_i in reverse (jsonb_array_length(v_b) - 1) .. 0 loop
    if (v_b->v_i->>'k') not in ('s', 'i') then
      v_x := v_b->v_i;
      perform dd_storm_put(p_room, p_team, v_b - v_i);
      return v_x;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function dd_storm_take_top(uuid, int) from public, anon, authenticated;

-- Eis nach einer Antwort: richtig = eine weniger offen (bei 0 taut es),
-- falsch = alles unter der untersten offenen Eiskiste rutscht weg.
create or replace function dd_storm_ice(p_room uuid, p_team int, p_ok boolean)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b   jsonb;
  v_i   int;
  v_n   int;
  v_low int := null;
  v_out jsonb := '[]'::jsonb;
begin
  select boxes into v_b from dd_storm_teams where room_id = p_room and team = p_team;
  for v_i in 0 .. jsonb_array_length(v_b) - 1 loop
    if v_b->v_i->>'k' = 'i' and coalesce((v_b->v_i->>'n')::int, 0) > 0 then
      if v_low is null then v_low := v_i; end if;
    end if;
  end loop;
  if v_low is null then return; end if;
  if p_ok then
    for v_i in 0 .. jsonb_array_length(v_b) - 1 loop
      if v_b->v_i->>'k' = 'i' and coalesce((v_b->v_i->>'n')::int, 0) > 0 then
        v_n := (v_b->v_i->>'n')::int - 1;
        if v_n <= 0 then
          v_out := v_out || jsonb_build_array(jsonb_build_object('k', 'n', 't', p_team));
          perform dd_storm_ev(p_room, 'melt', p_team, null, null, null);
        else
          v_out := v_out || jsonb_build_array(jsonb_set(v_b->v_i, '{n}', to_jsonb(v_n)));
        end if;
      else
        v_out := v_out || jsonb_build_array(v_b->v_i);
      end if;
    end loop;
    perform dd_storm_put(p_room, p_team, v_out);
  else
    -- alles unterhalb weg, die Eiskiste selbst taut (wird normale Kiste)
    for v_i in v_low .. jsonb_array_length(v_b) - 1 loop
      if v_i = v_low then
        v_out := v_out || jsonb_build_array(jsonb_build_object('k', 'n', 't', p_team));
      else
        v_out := v_out || jsonb_build_array(v_b->v_i);
      end if;
    end loop;
    perform dd_storm_ev(p_room, 'icebreak', p_team, null, null, jsonb_build_object('lost', v_low));
    perform dd_storm_put(p_room, p_team, v_out);
  end if;
end;
$$;
revoke all on function dd_storm_ice(uuid, int, boolean) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Spielende/-ansicht und Start auf Höhe + Kisten umgestellt
-- ─────────────────────────────────────────────────────────────
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
  update dd_storm_boards set phase = 'ended', ended_at = now(), winner_team = v_win where room_id = p_room;
  perform dd_storm_ev(p_room, p_kind, v_win, null,
    (select height from dd_storm_teams where room_id = p_room and team = v_win), null);
end;
$$;
revoke all on function dd_storm_finish(uuid, text) from public, anon, authenticated;


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

  -- Kisten kurz: Art + Team (+ ".n" bei Eis), z. B. "n2", "x0", "s1", "i3.4"
  select coalesce(jsonb_agg(jsonb_build_object(
           't', t.team, 'h', t.height,
           'b', (select coalesce(jsonb_agg((e->>'k') || coalesce(e->>'t', '')
                                           || case when e->>'k' = 'i' then '.' || coalesce(e->>'n', '0') else '' end
                                           order by o), '[]'::jsonb)
                   from jsonb_array_elements(t.boxes) with ordinality x(e, o)),
           'it', t.items, 'mx', t.maxi_until, 'mn', t.mini_until, 'tea', t.tea_until, 'lm', t.line_max)
           order by t.team), '[]'::jsonb)
    into v_teams
    from dd_storm_teams t where t.room_id = p_room;

  v_since := greatest(coalesce(p_since, 0), v_b.seq - 40);
  select coalesce(jsonb_agg(jsonb_build_object('s', e.seq, 'k', e.kind, 't', e.team, 'w', e.who,
                                               'h', e.height, 'd', e.data) order by e.seq), '[]'::jsonb)
    into v_events
    from dd_storm_events e where e.room_id = p_room and e.seq > v_since;

  if p_me is not null then
    select jsonb_build_object('id', pl.participant_id, 't', pl.team, 'c', pl.correct, 'x', pl.wrong)
      into v_me from dd_storm_players pl where pl.participant_id = p_me;
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
    'items_on', v_b.items_on,
    'items_often', v_b.items_often,
    'items_off', v_b.items_off,
    'storm_until', v_b.storm_until,
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
         started_at = null, ends_at = null, ended_at = null, winner_team = null, storm_until = null
   where room_id = v_room.id;
  perform dd_storm_ev(v_room.id, 'start', null, null, null, null);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function dd_storm_room_start(text) from public;
grant execute on function dd_storm_room_start(text) to authenticated;


-- Item-Einstellungen in der Lobby. null = unverändert.
create or replace function dd_storm_room_items(p_code text, p_on boolean, p_often boolean, p_off jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dd_storm_teacher_room(p_code);
  v_b    dd_storm_boards;
  v_off  jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform dd_storm_ensure(v_room.id);
  select * into v_b from dd_storm_boards where room_id = v_room.id for update;
  if v_b.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if p_off is not null then
    if jsonb_typeof(p_off) <> 'array' then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
    select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_off
      from jsonb_array_elements_text(p_off) e
     where e in ('bonus', 'stein', 'moewe', 'moewe3', 'maxi', 'mini', 'sturm', 'tea', 'bus', 'boom', 'eis', 'kuddel');
  end if;
  update dd_storm_boards
     set items_on = coalesce(p_on, items_on), items_often = coalesce(p_often, items_often),
         items_off = coalesce(v_off, items_off)
   where room_id = v_room.id;
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function dd_storm_room_items(text, boolean, boolean, jsonb) from public;
grant execute on function dd_storm_room_items(text, boolean, boolean, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Antworten (ersetzt 0239): Kisten unten hinein, Maxi/Mini,
--    Sturm, Eis, Teatime, Item-Linien
-- ─────────────────────────────────────────────────────────────
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
  v_cnt    int;
  v_k      text;
  v_add    jsonb := '[]'::jsonb;
  v_new    numeric;
  v_x      jsonb;
  v_status text := 'ok';
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).removed_at is not null then return jsonb_build_object('ok', false, 'error', 'removed'); end if;
  perform dd_storm_ensure((v.room).id);
  perform dd_storm_advance((v.room).id);

  select * into v_b from dd_storm_boards where room_id = (v.room).id for update;
  if v_b.phase <> 'running' then
    v_status := 'not_running';
  else
    v_pl := dd_storm_join(v.p, v_b);
    select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_pl.team;
    if v_pl.participant_id is null or v_t.team is null then
      v_status := 'not_running';
    elsif v_t.tea_until is not null and v_t.tea_until > now() then
      v_status := 'tea';
    elsif not coalesce(p_ok, false) then
      update dd_storm_players set wrong = wrong + 1 where participant_id = v_pl.participant_id;
      v_status := 'wrong';
      -- Sturm: nur wer schon über Stufe 1 ist, verliert die oberste Kiste.
      if v_b.storm_until is not null and v_b.storm_until > now() and v_t.height >= v_b.goal / 5.0 then
        v_x := dd_storm_take_top(v_b.room_id, v_pl.team);
        if v_x is not null then
          perform dd_storm_ev(v_b.room_id, 'blow', v_pl.team, dd_storm_name(v.p),
            (select height from dd_storm_teams where room_id = v_b.room_id and team = v_pl.team), jsonb_build_object('box', v_x));
        end if;
      end if;
      perform dd_storm_ice(v_b.room_id, v_pl.team, false);
    elsif v_pl.last_ok_at is not null and v_pl.last_ok_at > now() - interval '1.2 seconds' then
      v_status := 'too_fast';
    else
      update dd_storm_players set correct = correct + 1, last_ok_at = now()
       where participant_id = v_pl.participant_id;
      select count(*) into v_mine from dd_storm_players where room_id = v_b.room_id and team = v_pl.team;
      select max(n) into v_max from (select count(*) n from dd_storm_players where room_id = v_b.room_id group by team) x;
      v_cnt := floor(v_t.progress + greatest(v_max, 1)::numeric / greatest(v_mine, 1))::int - floor(v_t.progress)::int;
      v_k := case when v_t.maxi_until is not null and v_t.maxi_until > now() then 'x'
                  when v_t.mini_until is not null and v_t.mini_until > now() then 'm' else 'n' end;
      for i in 1 .. v_cnt loop
        v_add := v_add || jsonb_build_array(jsonb_build_object('k', v_k, 't', v_pl.team));
      end loop;
      -- Neue Kisten unten hinein; die Höhe wächst um ihre Größe.
      v_new := v_t.height + v_cnt * dd_storm_bsize(v_k);
      update dd_storm_teams
         set progress = progress + greatest(v_max, 1)::numeric / greatest(v_mine, 1),
             boxes = v_add || boxes,
             height = v_new,
             reached_at = case when v_cnt > 0 then now() else reached_at end
       where room_id = v_b.room_id and team = v_pl.team;
      if v_cnt > 0 then
        perform dd_storm_ev(v_b.room_id, 'box', v_pl.team, dd_storm_name(v.p), v_new,
                            jsonb_build_object('n', v_cnt, 'k', v_k));
      end if;
      perform dd_storm_ice(v_b.room_id, v_pl.team, true);
      perform dd_storm_award(v_b.room_id, v_pl.team);
      perform dd_storm_check_win(v_b.room_id);
    end if;
  end if;
  return dd_storm_state((v.room).id, p_since, (v.p).id) || jsonb_build_object('result', v_status);
end;
$$;
revoke all on function dd_storm_answer(text, boolean, bigint) from public;
grant execute on function dd_storm_answer(text, boolean, bigint) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Item einsetzen — jedes Teammitglied, wer zuerst tippt
-- ─────────────────────────────────────────────────────────────
create or replace function dd_storm_use(p_token text, p_slot int, p_since bigint default 0)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v       record;
  v_b     dd_storm_boards;
  v_pl    dd_storm_players;
  v_t     dd_storm_teams;
  v_o     dd_storm_teams;
  v_it    text;
  v_me    int;
  v_rk    int;
  v_tg    int[] := '{}';
  v_tt    int;
  v_x     jsonb;
  v_bx    jsonb;
  v_i     int;
  v_cut   numeric;
  v_out   jsonb;
  v_all   jsonb;
  v_cnt   int;
  v_pos   int;
  v_data  jsonb := '{}'::jsonb;
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).removed_at is not null then return jsonb_build_object('ok', false, 'error', 'removed'); end if;
  perform dd_storm_ensure((v.room).id);
  perform dd_storm_advance((v.room).id);
  select * into v_b from dd_storm_boards where room_id = (v.room).id for update;
  if v_b.phase <> 'running' then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'not_running');
  end if;
  v_pl := dd_storm_join(v.p, v_b);
  select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_pl.team;
  if v_t.team is null or p_slot is null or p_slot < 0 or p_slot >= jsonb_array_length(v_t.items) then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'no_item');
  end if;
  if v_t.tea_until is not null and v_t.tea_until > now() then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'tea');
  end if;
  v_me := v_t.team;
  v_it := v_t.items->>p_slot;
  update dd_storm_teams set items = items - p_slot where room_id = v_b.room_id and team = v_me;
  select r.rk into v_rk from dd_storm_ranks(v_b.room_id) r where r.team = v_me;

  if v_it = 'bonus' then
    select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
    perform dd_storm_put(v_b.room_id, v_me,
      jsonb_build_array(jsonb_build_object('k', 'g', 't', v_me), jsonb_build_object('k', 'g', 't', v_me)) || v_t.boxes);
  elsif v_it = 'stein' then
    select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
    perform dd_storm_put(v_b.room_id, v_me, jsonb_build_array(jsonb_build_object('k', 's', 't', v_me)) || v_t.boxes);
  elsif v_it in ('moewe', 'moewe3') then
    -- Teams direkt davor, das nächste zuerst
    for v_tt in select r.team from dd_storm_ranks(v_b.room_id) r where r.rk < v_rk order by r.rk desc
                 limit case when v_it = 'moewe' then 1 else 3 end loop
      v_x := dd_storm_take_top(v_b.room_id, v_tt);
      if v_x is not null then
        select * into v_t from dd_storm_teams where room_id = v_b.room_id and team = v_me;
        perform dd_storm_put(v_b.room_id, v_me, v_t.boxes || jsonb_build_array(v_x));
        v_tg := v_tg || v_tt;
        v_data := v_data || jsonb_build_object('b' || v_tt, v_x);
      end if;
    end loop;
  elsif v_it = 'maxi' then
    update dd_storm_teams set maxi_until = now() + interval '20 seconds', mini_until = null
     where room_id = v_b.room_id and team = v_me;
  elsif v_it = 'mini' then
    for v_tt in select r.team from dd_storm_ranks(v_b.room_id) r where r.rk < v_rk order by r.rk desc limit 2 loop
      update dd_storm_teams set mini_until = now() + interval '20 seconds', maxi_until = null
       where room_id = v_b.room_id and team = v_tt;
      v_tg := v_tg || v_tt;
    end loop;
  elsif v_it = 'sturm' then
    update dd_storm_boards set storm_until = now() + interval '30 seconds' where room_id = v_b.room_id;
  elsif v_it = 'tea' then
    for v_tt in select r.team from dd_storm_ranks(v_b.room_id) r where r.team <> v_me order by r.rk limit 2 loop
      update dd_storm_teams set tea_until = now() + interval '10 seconds' where room_id = v_b.room_id and team = v_tt;
      v_tg := v_tg || v_tt;
    end loop;
  elsif v_it = 'bus' then
    for v_o in select * from dd_storm_teams where room_id = v_b.room_id order by team loop
      v_cut := 0; v_i := 0;
      while v_i < jsonb_array_length(v_o.boxes) and v_cut < 5 loop
        v_cut := v_cut + dd_storm_bsize(v_o.boxes->v_i->>'k');
        v_i := v_i + 1;
      end loop;
      select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_out
        from jsonb_array_elements(v_o.boxes) with ordinality x(e, o) where o > v_i;
      perform dd_storm_put(v_b.room_id, v_o.team, v_out);
      v_data := v_data || jsonb_build_object('n' || v_o.team, v_i);
      v_tg := v_tg || v_o.team;
    end loop;
  elsif v_it = 'boom' then
    select r.team into v_tt from dd_storm_ranks(v_b.room_id) r where r.rk = 1;
    select * into v_o from dd_storm_teams where room_id = v_b.room_id and team = v_tt;
    v_cnt := 0; v_i := jsonb_array_length(v_o.boxes) - 1; v_out := v_o.boxes;
    while v_i >= 0 and v_cnt < 5 loop
      v_cnt := v_cnt + 1;
      if v_out->v_i->>'k' = 's' then
        v_out := v_out - v_i;
        exit;
      end if;
      v_out := v_out - v_i;
      v_i := v_i - 1;
    end loop;
    perform dd_storm_put(v_b.room_id, v_tt, v_out);
    v_tg := array[v_tt];
    v_data := jsonb_build_object('n', v_cnt);
  elsif v_it = 'eis' then
    select t.team into v_tt from dd_storm_teams t where t.room_id = v_b.room_id and t.team <> v_me order by random() limit 1;
    if v_tt is not null then
      select * into v_o from dd_storm_teams where room_id = v_b.room_id and team = v_tt;
      perform dd_storm_put(v_b.room_id, v_tt, v_o.boxes || jsonb_build_array(jsonb_build_object('k', 'i', 't', v_tt, 'n', 5)));
      v_tg := array[v_tt];
    end if;
  elsif v_it = 'kuddel' then
    select coalesce(jsonb_agg(e order by random()), '[]'::jsonb) into v_all
      from dd_storm_teams t, jsonb_array_elements(t.boxes) e where t.room_id = v_b.room_id;
    v_pos := 0;
    for v_o in select * from dd_storm_teams where room_id = v_b.room_id order by team loop
      v_cnt := jsonb_array_length(v_o.boxes);
      select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_out
        from jsonb_array_elements(v_all) with ordinality x(e, o) where o > v_pos and o <= v_pos + v_cnt;
      perform dd_storm_put(v_b.room_id, v_o.team, v_out);
      v_pos := v_pos + v_cnt;
      v_tg := v_tg || v_o.team;
    end loop;
  end if;

  perform dd_storm_ev(v_b.room_id, 'use', v_me, dd_storm_name(v.p),
    (select height from dd_storm_teams where room_id = v_b.room_id and team = v_me),
    v_data || jsonb_build_object('it', v_it, 'tg', to_jsonb(v_tg)));
  -- Wer durch das Item gewachsen ist, kann Linien überqueren; dann Sieg prüfen.
  perform dd_storm_award(v_b.room_id, v_me);
  perform dd_storm_check_win(v_b.room_id);
  perform skill_touch(v_b.room_id);
  return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'ok', 'used', v_it);
end;
$$;
revoke all on function dd_storm_use(text, int, bigint) from public;
grant execute on function dd_storm_use(text, int, bigint) to anon, authenticated;
