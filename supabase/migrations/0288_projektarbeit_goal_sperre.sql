-- ══════════════════════════════════════════════════════════════
-- Migration 0288 — Projektarbeit: Schreibsperre am Projektziel
-- ══════════════════════════════════════════════════════════════
-- Wie in der Scrum Werkstatt (0281): Am Projektziel einer Gruppe
-- (Titel, Fertig-Datum, Text, Bilder) schreibt immer nur EINE Person.
-- Wer ins Feld tippt, greift die Sperre (30 s, das Gerät verlängert sie
-- alle 10 s). Die anderen sehen „xy bearbeitet das Projektziel gerade“,
-- den Text weiter, können ihn aber nicht ändern. Ein Gerät, das ohne
-- Sperre ein Projektziel speichert, während jemand anderes sie hält,
-- wird mit goal_busy abgewiesen — sonst schriebe ein Gerät mit altem
-- Stand über die Arbeit der anderen.
--
--   Schlüssel   'p:<participant>' für Schüler, 'u:<auth.uid>' für
--               Lehrkräfte (seit 0205 gibt es mehrere je Raum)
--   Ansicht     group.goal_edit = { name, mine } oder null
--   Signatur    pa_sig / pa_room_sig enthalten die laufenden Sperren
--               des Raums (greifen, freigeben, ablaufen = neuer Stand)
--
-- Prüfstand: supabase/tests/0288_projektarbeit_goal_sperre.mjs
-- Kein DROP — Idempotenz per if not exists / create or replace.
-- ══════════════════════════════════════════════════════════════

alter table pa_groups add column if not exists goal_editor       text;
alter table pa_groups add column if not exists goal_editor_name  text;
alter table pa_groups add column if not exists goal_editor_until timestamptz;

comment on column pa_groups.goal_editor is
  'Wer gerade am Projektziel schreibt (0288): ''p:<participant>'' oder ''u:<Lehrkraft>''. Gilt bis goal_editor_until.';


-- ─────────────────────────────────────────────────────────────
-- 1) Bausteine
-- ─────────────────────────────────────────────────────────────
-- Schlüssel des Aufrufers: Teilnehmer, sonst die angemeldete Lehrkraft.
create or replace function pa_goal_key(p_me uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case when p_me is not null then 'p:' || p_me::text
              when auth.uid() is not null then 'u:' || auth.uid()::text end;
$$;

revoke all on function pa_goal_key(uuid) from public;


create or replace function pa_goal_edit_json(p_group uuid, p_key text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case when g.goal_editor is not null and g.goal_editor_until > now()
              then jsonb_build_object('name', g.goal_editor_name,
                                      'mine', g.goal_editor is not distinct from p_key) end
    from pa_groups g where g.id = p_group;
$$;

revoke all on function pa_goal_edit_json(uuid, text) from public;


create or replace function pa_goal_blocked(p_group uuid, p_key text)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select exists (select 1 from pa_groups
                  where id = p_group and goal_editor is not null
                    and goal_editor is distinct from p_key and goal_editor_until > now());
$$;

revoke all on function pa_goal_blocked(uuid, text) from public;


-- Laufende Sperren eines Raums als Text — für die Signatur.
create or replace function pa_goal_sig(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(string_agg(g.id::text || '=' || g.goal_editor, ',' order by g.id), '-')
    from pa_groups g
   where g.room_id = p_room and g.goal_editor is not null and g.goal_editor_until > now();
$$;

revoke all on function pa_goal_sig(uuid) from public;


-- Kopf einer Gruppe (wie 0205) + wer gerade am Projektziel schreibt.
create or replace function pa_group_json(p_group uuid, p_me uuid, p_keys boolean)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
           'id',        g.id,
           'no',        g.no,
           'name',      g.name,
           'plan_open', g.plan_open,
           'members',   pa_members_json(g.id, p_me, p_keys),
           'notes',     case when g.plan_open then pa_notes_json(g.id) else '[]'::jsonb end,
           'goal_edit', pa_goal_edit_json(g.id, pa_goal_key(p_me)))
    from pa_groups g where g.id = p_group;
$$;

revoke all on function pa_group_json(uuid, uuid, boolean) from public;


-- ─────────────────────────────────────────────────────────────
-- 2) Signaturen (wie 0200, dazu die Sperren)
-- ─────────────────────────────────────────────────────────────
create or replace function pa_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_err  text := pa_token_err(p_token, false);
  v_room skill_rooms;
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  select r.* into v_room from skill_rooms r join skill_participants p on p.room_id = r.id
   where p.token = p_token;
  return jsonb_build_object('ok', true, 'sig',
    coalesce((select rev from pa_rooms where room_id = v_room.id), 0)::text || ':' ||
    (select count(*) from skill_participants where room_id = v_room.id and removed_at is null)::text || ':' ||
    v_room.join_open::text || ':' ||
    (now() at time zone 'Europe/Berlin')::date::text || ':' ||
    pa_goal_sig(v_room.id));
end;
$$;

revoke all on function pa_sig(text) from public;
grant execute on function pa_sig(text) to anon, authenticated;


create or replace function pa_room_sig(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'sig',
    coalesce((select rev from pa_rooms where room_id = v_room.id), 0)::text || ':' ||
    (select count(*) from skill_participants where room_id = v_room.id and removed_at is null)::text || ':' ||
    (select count(*) from skill_participants where room_id = v_room.id and blocked)::text || ':' ||
    v_room.join_open::text || ':' ||
    (now() at time zone 'Europe/Berlin')::date::text || ':' ||
    pa_goal_sig(v_room.id));
end;
$$;

revoke all on function pa_room_sig(text) from public;
grant execute on function pa_room_sig(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Sperre greifen / verlängern / freigeben
-- ─────────────────────────────────────────────────────────────
-- p_on true: greifen bzw. verlängern; false: freigeben (nur die eigene).
-- Antwort beim Greifen: der aktuelle Stand des Projektziels.
create or replace function pa_goal_edit_apply(p_group uuid, p_key text, p_name text, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_g  pa_groups;
  v_it pa_items;
begin
  select * into v_g from pa_groups where id = p_group for update;
  if v_g.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not coalesce(p_on, false) then
    if v_g.goal_editor = p_key then
      update pa_groups set goal_editor = null, goal_editor_name = null, goal_editor_until = null
       where id = p_group;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_g.goal_editor is not null and v_g.goal_editor <> p_key and v_g.goal_editor_until > now() then
    return jsonb_build_object('ok', false, 'error', 'goal_busy', 'name', v_g.goal_editor_name);
  end if;

  update pa_groups
     set goal_editor = p_key, goal_editor_name = p_name,
         goal_editor_until = now() + interval '30 seconds'
   where id = p_group;

  select * into v_it from pa_items where group_id = p_group and kind = 'goal' and item_id = 'main';
  return jsonb_build_object('ok', true,
    'goal', case when v_it.item_id is not null
                 then jsonb_build_object('v', v_it.version, 'data', v_it.data) end);
end;
$$;

revoke all on function pa_goal_edit_apply(uuid, text, text, boolean) from public;


-- Schüler: nur im offenen Planungsraum der eigenen Gruppe, nicht
-- stillgelegt, nicht bei fixiertem Projektziel. Freigeben geht immer.
create or replace function pa_goal_edit(p_token text, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p   skill_participants;
  v_g   pa_groups;
  v_err text;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select g.* into v_g from pa_groups g join pa_seats s on s.group_id = g.id
   where s.participant_id = v_p.id;
  if not coalesce(p_on, false) then
    if v_g.id is null then return jsonb_build_object('ok', true); end if;
    return pa_goal_edit_apply(v_g.id, 'p:' || v_p.id::text, null, false);
  end if;

  v_err := pa_token_err(p_token, true);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  if v_g.id is null or not v_g.plan_open then
    return jsonb_build_object('ok', false, 'error', 'no_plan');
  end if;
  if exists (select 1 from pa_items where group_id = v_g.id and kind = 'goal' and item_id = 'main'
                                      and coalesce((data->>'locked')::boolean, false)) then
    return jsonb_build_object('ok', false, 'error', 'goal_locked');
  end if;
  return pa_goal_edit_apply(v_g.id, 'p:' || v_p.id::text,
                            skill_seat_name(v_p.name, v_p.seat), true);
end;
$$;

revoke all on function pa_goal_edit(text, boolean) from public;
grant execute on function pa_goal_edit(text, boolean) to anon, authenticated;


create or replace function pa_room_goal_edit(p_code text, p_group uuid, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from pa_groups where id = p_group and room_id = v_room.id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select coalesce(nullif(btrim(display_name), ''), account_name, 'Lehrkraft') into v_name
    from profiles where id = auth.uid();
  return pa_goal_edit_apply(p_group, 'u:' || auth.uid()::text, coalesce(v_name, 'Lehrkraft'), p_on);
end;
$$;

revoke all on function pa_room_goal_edit(text, uuid, boolean) from public;
grant execute on function pa_room_goal_edit(text, uuid, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Speichern: Projektziel nur mit Sperre, wenn jemand anderes sie hält
-- ─────────────────────────────────────────────────────────────
create or replace function pa_ops_touch_goal(p_ops jsonb)
  returns boolean
  security definer
  set search_path = public
  language sql
  immutable
as $$
  select jsonb_typeof(p_ops) = 'array'
     and exists (select 1 from jsonb_array_elements(p_ops) o where o->>'kind' = 'goal');
$$;

revoke all on function pa_ops_touch_goal(jsonb) from public;


-- Wie 0200, dazu die Prüfung der Sperre.
create or replace function pa_save(p_token text, p_ops jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_err  text := pa_token_err(p_token, true);
  v_p    skill_participants;
  v_room skill_rooms;
  v_g    pa_groups;
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  select * into v_p from skill_participants where token = p_token;
  -- Zeilensperre auf dem Raum: zwei Speichervorgänge laufen
  -- nacheinander, nicht ineinander (siehe 0196).
  select * into v_room from skill_rooms where id = v_p.room_id for update;
  select g.* into v_g from pa_groups g join pa_seats s on s.group_id = g.id
   where s.participant_id = v_p.id;
  if v_g.id is null or not v_g.plan_open then
    return jsonb_build_object('ok', false, 'error', 'no_plan');
  end if;
  if pa_ops_touch_goal(p_ops) and pa_goal_blocked(v_g.id, 'p:' || v_p.id::text) then
    return jsonb_build_object('ok', false, 'error', 'goal_busy',
                              'name', (select goal_editor_name from pa_groups where id = v_g.id));
  end if;
  return pa_apply_ops(v_room.id, v_g.id, v_p.id, p_ops);
end;
$$;

revoke all on function pa_save(text, jsonb) from public;
grant execute on function pa_save(text, jsonb) to anon, authenticated;


create or replace function pa_room_save(p_code text, p_group uuid, p_ops jsonb)
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
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if not exists (select 1 from pa_groups where id = p_group and room_id = v_room.id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if pa_ops_touch_goal(p_ops) and pa_goal_blocked(p_group, 'u:' || auth.uid()::text) then
    return jsonb_build_object('ok', false, 'error', 'goal_busy',
                              'name', (select goal_editor_name from pa_groups where id = p_group));
  end if;
  return pa_apply_ops(v_room.id, p_group, null, p_ops);
end;
$$;

revoke all on function pa_room_save(text, uuid, jsonb) from public;
grant execute on function pa_room_save(text, uuid, jsonb) to authenticated;
