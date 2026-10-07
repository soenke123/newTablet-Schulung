-- ══════════════════════════════════════════════════════════════
-- Migration 0204 — Projektarbeit: Den Teamnamen geben sich die Schüler
-- ══════════════════════════════════════════════════════════════
-- „Team" ist jetzt der erste Reiter im Planungsraum. Dort gibt sich die
-- Gruppe selbst ihren Namen; so heißt sie dann überall, auch in der
-- Gruppen-Übersicht der Lehrkraft. Die Lehrkraft kann ihn nicht ändern.
--
--   · pa_group_rename(token, name)  neu: jedes Mitglied der Gruppe.
--     Leer → zurück auf „Gruppe <Nr.>" (Einzelarbeit: ohne Namen).
--   · pa_room_group_rename          antwortet nur noch 'forbidden'.
--   · pa_room_assign                eine Einzelarbeit, die zur Gruppe
--     wird, behält ihren selbst gegebenen Namen (bisher: „Gruppe <Nr.>").
--
-- Kein DROP — create or replace (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


create or replace function pa_group_rename(p_token text, p_name text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_err text := pa_token_err(p_token, true);
  v_p   skill_participants;
  v_g   pa_groups;
  v_nm  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  select * into v_p from skill_participants where token = p_token;
  select g.* into v_g from pa_groups g join pa_seats s on s.group_id = g.id
   where s.participant_id = v_p.id
   for update of g;
  if v_g.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if char_length(v_nm) > 40 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if v_nm <> '' and contains_blacklisted_word(v_nm) then
    return jsonb_build_object('ok', false, 'error', 'text_blocked');
  end if;
  if v_nm = '' and v_g.no > 0 then
    v_nm := 'Gruppe ' || v_g.no;
  end if;
  if v_nm = v_g.name then
    return jsonb_build_object('ok', true, 'name', v_nm);
  end if;
  update pa_groups set name = v_nm where id = v_g.id;
  perform pa_bump(v_p.room_id);
  perform skill_touch(v_p.room_id);
  return jsonb_build_object('ok', true, 'name', v_nm);
end;
$$;

revoke all on function pa_group_rename(text, text) from public;
grant execute on function pa_group_rename(text, text) to anon, authenticated;


-- Die Lehrkraft benennt nicht mehr um (Signatur bleibt, damit ältere
-- Seiten eine klare Antwort bekommen).
create or replace function pa_room_group_rename(p_code text, p_group uuid, p_name text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  return jsonb_build_object('ok', false, 'error', 'forbidden');
end;
$$;

revoke all on function pa_room_group_rename(text, uuid, text) from public;
grant execute on function pa_room_group_rename(text, uuid, text) to authenticated;


-- Wie 0200, nur: eine Einzelarbeit (no = 0), zu der jemand dazukommt,
-- bekommt eine Nummer — und „Gruppe <Nr.>" nur, wenn sie noch keinen
-- eigenen Namen hat.
create or replace function pa_room_assign(p_code text, p_participant uuid,
                                          p_group uuid default null, p_with uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   skill_rooms;
  v_old    uuid;
  v_target uuid := p_group;
  v_wg     uuid;
  v_no     int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from skill_participants
                  where id = p_participant and room_id = v_room.id and removed_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform pa_seat_ensure(p_participant, v_room.id);
  select group_id into v_old from pa_seats where participant_id = p_participant;

  if p_with is not null then
    if p_with = p_participant or not exists (select 1 from skill_participants
                    where id = p_with and room_id = v_room.id and removed_at is null) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform pa_seat_ensure(p_with, v_room.id);
    select group_id into v_wg from pa_seats where participant_id = p_with;
    if v_wg is null then
      insert into pa_rooms (room_id) values (v_room.id) on conflict do nothing;
      update pa_rooms set seq_group = seq_group + 1 where room_id = v_room.id returning seq_group into v_no;
      insert into pa_groups (room_id, no, name) values (v_room.id, v_no, 'Gruppe ' || v_no)
      returning id into v_wg;
      update pa_seats set group_id = v_wg where participant_id = p_with;
    end if;
    v_target := v_wg;
  elsif v_target is not null then
    if not exists (select 1 from pa_groups where id = v_target and room_id = v_room.id) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if exists (select 1 from pa_groups where id = v_target and no = 0) then
      insert into pa_rooms (room_id) values (v_room.id) on conflict do nothing;
      update pa_rooms set seq_group = seq_group + 1 where room_id = v_room.id returning seq_group into v_no;
      update pa_groups set no = v_no,
                           name = case when name = '' then 'Gruppe ' || v_no else name end
       where id = v_target;
    end if;
  end if;

  if v_target is not distinct from v_old then
    return jsonb_build_object('ok', true, 'group', v_target);
  end if;
  update pa_seats set group_id = v_target where participant_id = p_participant;
  perform pa_group_tidy(v_old);

  perform pa_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'group', v_target);
end;
$$;

revoke all on function pa_room_assign(text, uuid, uuid, uuid) from public;
grant execute on function pa_room_assign(text, uuid, uuid, uuid) to authenticated;
