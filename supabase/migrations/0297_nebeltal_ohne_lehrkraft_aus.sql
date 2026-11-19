-- ══════════════════════════════════════════════════════════════
-- Migration 0297 — Nebeltal: gemeinsam spielen endet ohne Lehrkraft
-- ══════════════════════════════════════════════════════════════
-- Sönke 19.11.2026: Ist die Lehrkraft nicht mehr aktiv im Raum
-- (Tab zu, Raum verlassen, iPad im Ruhezustand), steckten die Tablets
-- bisher in der Lobby fest und konnten die Level nicht mehr spielen.
--
-- Lehrkraft = NUR die Person, die den Raum eröffnet hat (skill_rooms.
-- owner_id; in Nebeltal lädt man keine Lehrkräfte ein). Ihr Lebenszeichen:
-- nt_rounds.teacher_seen_at, gesetzt bei „Gemeinsam spielen“ (nt_flag an)
-- und bei jedem nt_room_get – das fragt ihre Seite, solange gemeinsam
-- gespielt wird, alle 0,3–2 s ab (js/mehr.js, js/labor.js beim Zuschauen).
-- Abwesend = seit 10 s kein Lebenszeichen.
--
-- Ohne Lehrkraft:
--   · Lobby / Erklärkarte: höchstens 3 Min. (ab dem letzten Lebenszeichen),
--     dann aus → die Tablets sind wieder in der Level-Übersicht.
--   · Laufende Runde (auch Countdown): läuft immer bis zum Ende (Zeit um
--     bzw. alle fertig). Level 3–6 haben keine Uhr: dort zählen ohne
--     Lehrkraft nur noch die anwesenden Tablets – ein ausgefallenes Gerät
--     hält die Runde nicht mehr offen (mit Lehrkraft unverändert wie 0296).
--   · Auflösung (Rangliste): bleibt 1 Min. ab Rundenende (bzw. ab dem
--     letzten Lebenszeichen, wenn sie erst danach ging), dann aus.
-- „Aus“ = wie der Knopf: nt_rounds.phase = 'off', skill_room_state.data.mp = 0.
-- Die Ansicht liefert dafür off_at (null = Lehrkraft da / Runde läuft);
-- die Tablets zeigen daraus einen kleinen roten Countdown (NTRaum.away).
-- Geprüft lazy in nt_advance (läuft bei jedem nt_play der Tablets), kein Cron.
--
-- Kein DROP, mehrfach ausführbar.
-- Prüfstand supabase/tests/0297_nebeltal_ohne_lehrkraft_aus.mjs.
-- ══════════════════════════════════════════════════════════════

alter table nt_rounds add column if not exists teacher_seen_at timestamptz not null default now();

comment on column nt_rounds.teacher_seen_at is
  'Letztes Lebenszeichen der Raum-Besitzerin (nt_room_get, nt_flag an). Ohne Lehrkraft: Lobby 3 Min., '
  'Rangliste 1 Min., laufende Runde bis zum Ende, dann aus (nt_off_at / nt_advance). Seit 0297.';


-- Wann geht „gemeinsam spielen“ von selbst aus? null = Lehrkraft da oder Runde läuft.
create or replace function nt_off_at(v_r nt_rounds)
  returns timestamptz
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case
    when v_r.teacher_seen_at >= now() - interval '10 seconds' then null
    when v_r.phase in ('lobby', 'intro') then v_r.teacher_seen_at + interval '3 minutes'
    when v_r.phase = 'ended' then greatest(v_r.teacher_seen_at, coalesce(v_r.ended_at, v_r.teacher_seen_at)) + interval '1 minute'
  end;
$$;

revoke all on function nt_off_at(nt_rounds) from public, anon, authenticated;


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
  if p_on then
    update nt_rounds r set teacher_seen_at = now()
      from skill_rooms s
     where r.room_id = p_room and s.id = p_room and s.owner_id = auth.uid();
  end if;
  perform skill_touch(p_room);
end;
$$;

revoke all on function nt_flag(uuid, boolean) from public, anon, authenticated;


-- wie 0296, dazu: ohne Lehrkraft aus (nt_off_at) und Level 3–6 ohne ausgefallene Geräte
create or replace function nt_advance(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r    nt_rounds;
  v_away boolean;
begin
  select * into v_r from nt_rounds where room_id = p_room;
  if v_r.room_id is null or v_r.phase = 'off' then return; end if;
  if nt_off_at(v_r) <= now() then
    update nt_rounds set phase = 'off', updated_at = now() where room_id = p_room and phase <> 'off';
    perform nt_flag(p_room, false);
    return;
  end if;
  v_away := v_r.teacher_seen_at < now() - interval '10 seconds';

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
            where pl.room_id = p_room and pl.run = v_r.run and not pl.done and p.removed_at is null
              and (not v_away or nt_here(pl.seen_at, p)))) then
    update nt_rounds set phase = 'ended', ended_at = now(), updated_at = now()
     where room_id = p_room and phase = 'running';
  end if;
end;
$$;

revoke all on function nt_advance(uuid) from public, anon, authenticated;


-- wie 0296, dazu off_at
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
    'off_at', nt_off_at(v_r),
    'server_now', now(),
    'people', v_people,
    'me', v_me);
end;
$$;

revoke all on function nt_state(uuid, uuid) from public, anon, authenticated;


-- wie 0296, dazu das Lebenszeichen der Raum-Besitzerin (vor nt_advance)
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
  if v_room.owner_id = auth.uid() then
    update nt_rounds set teacher_seen_at = now()
     where room_id = v_room.id and teacher_seen_at < now() - interval '2 seconds';
  end if;
  perform nt_advance(v_room.id);
  return nt_state(v_room.id, null);
end;
$$;

revoke all on function nt_room_get(text) from public;
grant execute on function nt_room_get(text) to authenticated;
