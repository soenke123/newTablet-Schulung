-- 0242 — Definitions Derby, Kistensturm: Teams nach Figur wählen, Zeit im Spiel.
--
-- Sönke 30.10.2026:
--  1. Statt „2 bis 6 Teams“ wählt die Lehrkraft in der Lobby genau die
--     Figuren (= Farben), die mitspielen. Neue Spalte figs: Liste der
--     Figurnummern 0…5 in Reihenfolge der Teams. Team t spielt mit Figur
--     figs[t]; team_count bleibt = Länge von figs, damit der Rest der
--     Kette (Verteilen, Türme, Items) unverändert über 0…team_count-1 läuft.
--  2. Kein Countdown mehr in der Lobby: wie bei Kingdoms of Mathoria setzt
--     die Lehrkraft das Rundenende im laufenden Spiel (dd_storm_room_timer,
--     0 = ohne Zeitlimit). minutes bleibt als Spalte, wird aber auf 0 gesetzt.

alter table dd_storm_boards add column if not exists figs jsonb not null default '[0,1,2,3]'::jsonb;

update dd_storm_boards b
   set figs = (select jsonb_agg(g order by g) from generate_series(0, b.team_count - 1) g)
 where jsonb_array_length(b.figs) <> b.team_count;
update dd_storm_boards set minutes = 0 where minutes <> 0;

comment on column dd_storm_boards.figs is
  'Kistensturm: Figurnummern (0–5) der mitspielenden Teams, Team t = Figur figs[t]. Seit 0242.';


-- Figuren wählen (nur Lobby): 2–6 verschiedene Nummern 0–5, aufsteigend gespeichert.
create or replace function dd_storm_room_figs(p_code text, p_figs jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dd_storm_teacher_room(p_code);
  v_b    dd_storm_boards;
  v_f    jsonb;
  v_n    int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_figs is null or jsonb_typeof(p_figs) <> 'array' or jsonb_array_length(p_figs) not between 2 and 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if exists (select 1 from jsonb_array_elements(p_figs) e
              where jsonb_typeof(e) <> 'number' or e::text !~ '^[0-5]$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  select jsonb_agg(distinct (e::text)::int order by (e::text)::int), count(distinct e)
    into v_f, v_n
    from jsonb_array_elements(p_figs) e;
  if v_n <> jsonb_array_length(p_figs) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  perform dd_storm_ensure(v_room.id);
  select * into v_b from dd_storm_boards where room_id = v_room.id for update;
  if v_b.phase <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  update dd_storm_boards set figs = v_f, team_count = v_n where room_id = v_room.id;
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_storm_room_figs(text, jsonb) from public;
grant execute on function dd_storm_room_figs(text, jsonb) to authenticated;


-- Rundenende im laufenden Spiel (wie Mathoria): 0 = ohne Zeitlimit, sonst
-- 5 s … 60 Min. ab jetzt. Bei Zeitende gewinnt der höchste Turm (dd_storm_advance).
create or replace function dd_storm_room_timer(p_code text, p_seconds int)
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
  if p_seconds is null or (p_seconds <> 0 and p_seconds not between 5 and 3600) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  perform dd_storm_advance(v_room.id);
  select * into v_b from dd_storm_boards where room_id = v_room.id for update;
  if v_b.room_id is null or v_b.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update dd_storm_boards
     set ends_at = case when p_seconds > 0 then now() + make_interval(secs => p_seconds) end
   where room_id = v_room.id;
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_storm_room_timer(text, int) from public;
grant execute on function dd_storm_room_timer(text, int) to authenticated;


-- Ansicht wie 0240, zusätzlich figs.
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
    'server_now', now(),
    'teams', v_teams,
    'people', v_people,
    'events', v_events,
    'me', v_me);
end;
$$;
revoke all on function dd_storm_state(uuid, bigint, uuid) from public, anon, authenticated;
