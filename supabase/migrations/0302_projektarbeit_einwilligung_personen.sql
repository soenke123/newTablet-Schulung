-- ═════════════════════════════════════════════════════════════
-- 0302 — Projektarbeit: Einwilligung in vier Stufen
-- ═════════════════════════════════════════════════════════════
-- Bis 0301 drei Stufen (0 keine · 1 Kleingruppen · 2 auch fremde Orte).
-- Jetzt zählt, mit wie vielen Personen ein Kind unterwegs sein darf:
--   0  nichts abgegeben / nicht erlaubt
--   1  nur mit 3 Personen
--   2  mit 2 Personen
--   3  mit 1 Person (auch allein)
-- Die Zahlen steigen weiter mit der Erlaubnis; vorhandene Einträge
-- behalten ihre Zahl (1 → „3 Personen“, 2 → „2 Personen“), niemand
-- bekommt dadurch mehr Erlaubnis als vorher.

alter table pa_seats drop constraint if exists pa_seats_consent_chk;
alter table pa_seats add constraint pa_seats_consent_chk check (consent between 0 and 3);

comment on column pa_seats.consent is
  'Projektarbeit (0302): Einwilligung, das Schulgelände zu verlassen. 0 keine, '
  '1 mit 3 Personen, 2 mit 2 Personen, 3 mit 1 Person (allein).';

create or replace function pa_room_consent(p_code text, p_participant uuid, p_level int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_level is null or p_level not between 0 and 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if not exists (select 1 from skill_participants
                  where id = p_participant and room_id = v_room.id and removed_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform pa_seat_ensure(p_participant, v_room.id);
  update pa_seats set consent = p_level where participant_id = p_participant;
  perform pa_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'consent', p_level);
end;
$$;

revoke all on function pa_room_consent(text, uuid, int) from public;
grant execute on function pa_room_consent(text, uuid, int) to authenticated;
