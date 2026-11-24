-- ═════════════════════════════════════════════════════════════
-- 0303 — Projektarbeit: Einwilligung als drei einzelne Haken
-- ═════════════════════════════════════════════════════════════
-- 0302 hatte Stufen (0 keine · 1 zu dritt · 2 zu zweit · 3 allein).
-- Die Einwilligungen der Eltern bauen aber nicht aufeinander auf —
-- manche kreuzen „zu dritt“ UND „allein nach Hause“ an. Jetzt ist
-- pa_seats.consent eine Summe aus drei Haken:
--   1  zu zweit unterwegs
--   2  zu dritt unterwegs
--   4  allein nach Hause
-- 0 = nichts abgegeben / nicht erlaubt, 7 = alles.
--
-- Vorhandene Werte (0302 bzw. 0201) werden einmal umgerechnet:
--   1 (zu dritt, früher Stufe 1)  → 2
--   2 (zu zweit, früher Stufe 2)  → 1
--   3 (allein)                    → 4
-- Nur solange die alte Grenze 0–2/0–3 noch steht, damit ein zweiter
-- Lauf nichts doppelt umrechnet.

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'pa_seats_consent_chk';
  if v_def is null or v_def not like '%7%' then
    alter table pa_seats drop constraint if exists pa_seats_consent_chk;
    update pa_seats set consent = case consent when 1 then 2 when 2 then 1 when 3 then 4 else consent end
     where consent in (1, 2, 3);
    alter table pa_seats add constraint pa_seats_consent_chk check (consent between 0 and 7);
  end if;
end
$$;

comment on column pa_seats.consent is
  'Projektarbeit (0303): Einwilligung der Eltern als Summe von Haken: '
  '1 zu zweit unterwegs, 2 zu dritt unterwegs, 4 allein nach Hause; 0 = keine.';

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
  if p_level is null or p_level not between 0 and 7 then
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
