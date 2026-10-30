-- ══════════════════════════════════════════════════════════════
-- Migration 0247 — Definitions Derby: Kistensturm, Item reihum,
--                  Gleichstand = mehrere Sieger
-- ══════════════════════════════════════════════════════════════
-- Sönke 30.10.2026:
--   „Die Items bekommt immer einer aus dem Team, der das auslösen darf.
--    Bei den anderen steht ‚x hat ein Item‘, das Item geht reihum.“
--   „Wenn 2 Teams einen gleich hohen Stapel haben (bei Timeout), dann
--    haben beide gewonnen.“
--
-- ── Item reihum ────────────────────────────────────────────────
-- dd_storm_teams.items_who = Teilnehmer-ids parallel zu items (wer das
-- Item in diesem Fach einsetzen darf), item_turn = Zähler fürs Reihum.
-- Der Trigger dd_storm_teams_items_who vergibt neue Items selbst (also
-- auch für dd_storm_award, ohne es anzufassen): reihum nach Sitzplatz,
-- wer gerade da ist (letzte 90 s) zuerst. Wird es kürzer, wird
-- abgeschnitten (Fallback; dd_storm_use nimmt das Fach gezielt raus).
-- dd_storm_use: nur der Halter — es sei denn, der Halter ist weg
-- (entfernt, gesperrt, 90 s nicht gesehen), dann jeder im Team.
-- Sonst Ergebnis 'not_yours'. Ansicht: teams[].iw = items_who.
--
-- ── Gleichstand ────────────────────────────────────────────────
-- dd_storm_boards.winners int[]: bei Zeitende/Beenden alle Teams mit
-- der größten Höhe (> 0); beim Erreichen des Ziels nur dieses Team.
-- winner_team bleibt (erstes Team der Liste). Ansicht: 'winners'.
--
-- Nur Spalten, Trigger und Funktionen. Idempotent.
-- ══════════════════════════════════════════════════════════════

alter table dd_storm_teams  add column if not exists items_who jsonb not null default '[]'::jsonb;
alter table dd_storm_teams  add column if not exists item_turn int   not null default 0;
alter table dd_storm_boards add column if not exists winners   int[];


-- ─────────────────────────────────────────────────────────────
-- 1) Halter der Items
-- ─────────────────────────────────────────────────────────────
-- Nächste Person im Team, die ein Item bekommt (reihum nach Sitzplatz).
create or replace function dd_storm_next_holder(p_room uuid, p_team int, p_turn int)
  returns uuid
  security definer
  set search_path = public
  language sql
  stable
as $$
  with m as (
    select p.id, p.last_seen_at > now() - interval '90 seconds' as here,
           (row_number() over (order by p.seat))::int - 1 as i,
           count(*) over () as n
      from dd_storm_players pl
      join skill_participants p on p.id = pl.participant_id
     where pl.room_id = p_room and pl.team = p_team
       and p.removed_at is null and not p.blocked
  )
  -- ab der Position p_turn im Kreis die erste anwesende, sonst die an der Position
  select id from m
   order by (not coalesce(here, false)), ((i - p_turn % greatest(n, 1)) + n) % greatest(n, 1)
   limit 1;
$$;
revoke all on function dd_storm_next_holder(uuid, int, int) from public, anon, authenticated;

create or replace function dd_storm_teams_items_who()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_n int := jsonb_array_length(coalesce(new.items, '[]'::jsonb));
  v_w uuid;
begin
  if new.items_who is null then new.items_who := '[]'::jsonb; end if;
  while jsonb_array_length(new.items_who) > v_n loop
    new.items_who := new.items_who - (jsonb_array_length(new.items_who) - 1);
  end loop;
  while jsonb_array_length(new.items_who) < v_n loop
    v_w := dd_storm_next_holder(new.room_id, new.team, new.item_turn);
    new.items_who := new.items_who || jsonb_build_array(v_w);
    new.item_turn := new.item_turn + 1;
  end loop;
  return new;
end;
$$;
revoke all on function dd_storm_teams_items_who() from public, anon, authenticated;
drop trigger if exists dd_storm_teams_items_who on dd_storm_teams;
create trigger dd_storm_teams_items_who before update of items, items_who on dd_storm_teams
  for each row execute function dd_storm_teams_items_who();

-- Bestand: Items, die schon liegen, bekommen einen Halter.
update dd_storm_teams set items_who = items_who where jsonb_array_length(items) <> jsonb_array_length(items_who);


-- ─────────────────────────────────────────────────────────────
-- 2) Sieger: Gleichstand bei Zeitende/Beenden
-- ─────────────────────────────────────────────────────────────
create or replace function dd_storm_finish(p_room uuid, p_kind text)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_max numeric;
  v_ws  int[];
begin
  select max(t.height) into v_max from dd_storm_teams t where t.room_id = p_room;
  if coalesce(v_max, 0) > 0 then
    select array_agg(t.team order by t.team) into v_ws
      from dd_storm_teams t where t.room_id = p_room and t.height = v_max;
  end if;
  update dd_storm_boards set phase = 'ended', ended_at = now(), winner_team = v_ws[1], winners = v_ws
   where room_id = p_room;
  perform dd_storm_ev(p_room, p_kind, v_ws[1], null, v_max,
    case when coalesce(array_length(v_ws, 1), 0) > 1 then jsonb_build_object('tie', to_jsonb(v_ws)) end);
end;
$$;
revoke all on function dd_storm_finish(uuid, text) from public, anon, authenticated;

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
  update dd_storm_boards set phase = 'ended', ended_at = now(), winner_team = v_t.team, winners = array[v_t.team]
   where room_id = p_room;
  perform dd_storm_ev(p_room, 'win', v_t.team, null, v_t.height, null);
  return true;
end;
$$;
revoke all on function dd_storm_check_win(uuid) from public, anon, authenticated;

-- Neues Spiel / Lobby: Siegerliste leeren (ohne die Start-/Reset-Funktionen anzufassen).
create or replace function dd_storm_boards_winners_clear()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.winner_team is null then new.winners := null; end if;
  return new;
end;
$$;
revoke all on function dd_storm_boards_winners_clear() from public, anon, authenticated;
drop trigger if exists dd_storm_boards_winners_clear on dd_storm_boards;
create trigger dd_storm_boards_winners_clear before update on dd_storm_boards
  for each row execute function dd_storm_boards_winners_clear();


-- ─────────────────────────────────────────────────────────────
-- 3) Ansicht: Halter (iw) und Siegerliste (winners); sonst wie 0244
-- ─────────────────────────────────────────────────────────────
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
           'it', t.items, 'iw', t.items_who, 'mx', t.maxi_until, 'mn', t.mini_until, 'tea', t.tea_until, 'lm', t.line_max)
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
    'figs', v_b.figs,
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
    'winners', coalesce(to_jsonb(v_b.winners), case when v_b.winner_team is not null then jsonb_build_array(v_b.winner_team) end),
    'server_now', now(),
    'teams', v_teams,
    'people', v_people,
    'events', v_events,
    'me', v_me);
end;
$$;
revoke all on function dd_storm_state(uuid, bigint, uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Einsetzen nur durch den Halter; sonst wie 0246
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
  -- Nur wer das Item hält — außer der Halter ist nicht mehr da (0247).
  if (v_t.items_who->>p_slot) is not null and (v_t.items_who->>p_slot)::uuid <> (v.p).id and exists (
       select 1 from dd_storm_players pl join skill_participants p on p.id = pl.participant_id
        where p.id = (v_t.items_who->>p_slot)::uuid and pl.room_id = v_b.room_id and pl.team = v_t.team
          and p.removed_at is null and not p.blocked and p.last_seen_at > now() - interval '90 seconds') then
    return dd_storm_state(v_b.room_id, p_since, (v.p).id) || jsonb_build_object('result', 'not_yours');
  end if;
  v_me := v_t.team;
  v_it := v_t.items->>p_slot;
  update dd_storm_teams set items = items - p_slot, items_who = items_who - p_slot where room_id = v_b.room_id and team = v_me;
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
        -- die Kiste bekommt die Farbe des Teams, das sie geklaut hat
        perform dd_storm_put(v_b.room_id, v_me, v_t.boxes || jsonb_build_array(jsonb_set(v_x, '{t}', to_jsonb(v_me))));
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
      -- ganz unten hinein: ein Fehler nimmt nur, was danach darunter wächst
      perform dd_storm_put(v_b.room_id, v_tt, jsonb_build_array(jsonb_build_object('k', 'i', 't', v_tt, 'n', 5)) || v_o.boxes);
      v_tg := array[v_tt];
    end if;
  elsif v_it = 'kuddel' then
    select coalesce(jsonb_agg(e order by random()), '[]'::jsonb) into v_all
      from dd_storm_teams t, jsonb_array_elements(t.boxes) e where t.room_id = v_b.room_id;
    v_pos := 0;
    for v_o in select * from dd_storm_teams where room_id = v_b.room_id order by team loop
      v_cnt := jsonb_array_length(v_o.boxes);
      -- jede Kiste bekommt die Farbe des Teams, bei dem sie landet
      select coalesce(jsonb_agg(jsonb_set(e, '{t}', to_jsonb(v_o.team)) order by o), '[]'::jsonb) into v_out
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
