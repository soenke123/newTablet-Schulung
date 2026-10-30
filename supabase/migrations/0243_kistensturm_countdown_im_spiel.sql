-- 0243 — Definitions Derby, Kistensturm: Countdown nur noch im Spiel.
--
-- Sönke 30.10.2026: Der Countdown soll nicht in der Lobby eingestellt
-- werden, sondern erst im laufenden Spiel — wenn die Lehrkraft das Spiel
-- zu Ende bringen will. Läuft er ab, gewinnt wie bisher der höchste Turm
-- (dd_storm_advance → dd_storm_finish 'time').
--
-- dd_storm_room_clock(p_code, p_minutes): nur in 'running'; 1–30 Minuten
-- ab jetzt, 0 = Countdown abbrechen. Die alte Lobby-Einstellung
-- (minutes) wird nicht mehr genutzt und hier einmal auf 0 gesetzt, damit
-- kein altes Spiel beim nächsten Start doch mit Countdown beginnt.
-- Kein DROP. Mehrfach ausführbar.

update dd_storm_boards set minutes = 0 where minutes <> 0 and phase = 'lobby';

create or replace function dd_storm_room_clock(p_code text, p_minutes int)
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
  if p_minutes is null or p_minutes not between 0 and 30 then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  perform dd_storm_advance(v_room.id);
  select * into v_b from dd_storm_boards where room_id = v_room.id for update;
  if v_b.room_id is null or v_b.phase <> 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update dd_storm_boards
     set minutes = p_minutes,
         ends_at = case when p_minutes > 0 then now() + make_interval(mins => p_minutes) end
   where room_id = v_room.id;
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_storm_room_clock(text, int) from public;
grant execute on function dd_storm_room_clock(text, int) to authenticated;

-- Beim Start nie mehr eine Zeit aus der Lobby übernehmen.
create or replace function dd_storm_boards_no_lobby_clock()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.phase = 'countdown' and (old.phase is distinct from 'countdown') then
    new.minutes := 0;
  end if;
  return new;
end;
$$;
revoke all on function dd_storm_boards_no_lobby_clock() from public, anon, authenticated;

drop trigger if exists dd_storm_boards_no_lobby_clock on dd_storm_boards;
create trigger dd_storm_boards_no_lobby_clock
  before update of phase on dd_storm_boards
  for each row execute function dd_storm_boards_no_lobby_clock();
