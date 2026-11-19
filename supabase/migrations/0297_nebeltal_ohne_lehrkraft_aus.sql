-- ══════════════════════════════════════════════════════════════
-- Migration 0297 — Nebeltal: gemeinsam spielen endet ohne Lehrkraft
-- ══════════════════════════════════════════════════════════════
-- Sönke 19.11.2026: Ist die Lehrkraft nicht mehr aktiv im Raum
-- (Tab zu, Raum verlassen, iPad im Ruhezustand), steckten die Tablets
-- bisher in der Lobby fest und konnten die Level nicht mehr spielen.
-- Jetzt beendet sich „Gemeinsam spielen“ von selbst – wie der Knopf
-- „aus“: nt_rounds.phase = 'off', skill_room_state.data.mp = 0.
--
-- Lebenszeichen der Lehrkraft: nt_rounds.teacher_seen_at. Gesetzt bei
-- „Gemeinsam spielen“ (nt_flag an) und bei jedem nt_room_get – das fragt
-- die Seite der Lehrkraft, solange gemeinsam gespielt wird, alle 0,3–2 s
-- ab (js/mehr.js, js/labor.js beim Zuschauen), auch eingeladene Lehrkräfte.
--
-- Weg gilt die Lehrkraft
--   · nach 60 s ohne Lebenszeichen in Lobby / Erklärkarte / Rangliste,
--   · nach 3 Min. während Countdown oder laufender Runde (die Runde
--     soll nicht abbrechen, nur weil das Lehrer-iPad kurz schläft).
-- Geprüft lazy in nt_advance (läuft bei jedem nt_play der Tablets),
-- kein Cron. Die Tablets sehen phase 'off' sofort in der Antwort von
-- nt_play und gehen zurück zu den Leveln (wie bei „aus“).
--
-- Kein DROP, mehrfach ausführbar.
-- Prüfstand supabase/tests/0297_nebeltal_ohne_lehrkraft_aus.mjs.
-- ══════════════════════════════════════════════════════════════

alter table nt_rounds add column if not exists teacher_seen_at timestamptz not null default now();

comment on column nt_rounds.teacher_seen_at is
  'Letztes Lebenszeichen der Lehrkraft (nt_room_get, nt_flag an). Zu alt → nt_advance schaltet '
  'gemeinsam spielen aus (60 s, in laufender Runde 3 Min.). Seit 0297.';


-- Lehrkraft gilt als weg?
create or replace function nt_teacher_gone(v_r nt_rounds)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select v_r.phase <> 'off'
     and v_r.teacher_seen_at < now() - case when v_r.phase in ('countdown', 'running')
                                            then interval '3 minutes' else interval '60 seconds' end;
$$;

revoke all on function nt_teacher_gone(nt_rounds) from public, anon, authenticated;


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
    update nt_rounds set teacher_seen_at = now() where room_id = p_room;
  end if;
  perform skill_touch(p_room);
end;
$$;

revoke all on function nt_flag(uuid, boolean) from public, anon, authenticated;


-- wie 0296, dazu vorn: Lehrkraft weg → aus
create or replace function nt_advance(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r nt_rounds;
begin
  select * into v_r from nt_rounds where room_id = p_room;
  if v_r.room_id is null or v_r.phase = 'off' then return; end if;
  if nt_teacher_gone(v_r) then
    update nt_rounds set phase = 'off', updated_at = now() where room_id = p_room and phase <> 'off';
    perform nt_flag(p_room, false);
    return;
  end if;

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


-- wie 0296, dazu das Lebenszeichen der Lehrkraft (vor nt_advance)
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
  update nt_rounds set teacher_seen_at = now()
   where room_id = v_room.id and teacher_seen_at < now() - interval '2 seconds';
  perform nt_advance(v_room.id);
  return nt_state(v_room.id, null);
end;
$$;

revoke all on function nt_room_get(text) from public;
grant execute on function nt_room_get(text) to authenticated;
