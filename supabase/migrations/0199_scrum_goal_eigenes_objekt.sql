-- ══════════════════════════════════════════════════════════════
-- Migration 0199 — Scrum Werkstatt: Product Goal als eigenes Objekt
-- ══════════════════════════════════════════════════════════════
-- Bisher lag das Product Goal (Text, Bilder) im selben Objekt wie
-- Projektname, Kategorien und Paarungen (scrum_items: product/main).
-- Jede Änderung daran — auch das Zusammenziehen zweier Leute am Board —
-- kollidierte mit jemandem, der gerade am Goal schrieb.
--
-- Jetzt gibt es dafür ein eigenes Objekt: kind 'product', id 'goal'
--   { goal, images, goalLocked }
-- und 'main' behält den Rest. Das Schreiben (scrum_save,
-- scrum_room_save) kennt beliebige ids und braucht keine Änderung;
-- die Brücke (bridge.js) trennt und fügt zusammen. Alte Räume, in denen
-- das Goal noch in 'main' liegt, bleiben lesbar und wandern beim
-- nächsten Speichern von selbst.
--
-- Angepasst werden nur die zwei Stellen, die 'main' fest verdrahtet haben:
--   · scrum_snapshot      — das Backup führt Goal und 'main' wieder in ein
--                           product-Objekt zusammen (Export-Format bleibt gleich)
--   · scrum_room_restore  — erlaubt die id 'goal' beim Einspielen
-- ══════════════════════════════════════════════════════════════

create or replace function scrum_snapshot(p_room uuid, p_kind text)
  returns boolean
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_cnt     scrum_rooms;
  v_stories int;
  v_sprints int;
begin
  select count(*) filter (where kind = 'story'), count(*) filter (where kind = 'sprint')
    into v_stories, v_sprints
    from scrum_items where room_id = p_room;
  if not exists (select 1 from scrum_items where room_id = p_room) then
    return false;
  end if;
  select * into v_cnt from scrum_rooms where room_id = p_room;

  insert into scrum_backups (room_id, kind, stories, sprints, data)
  values (p_room, p_kind, v_stories, v_sprints, jsonb_build_object(
    'format',  'scrum-werkstatt',
    'version', 1,
    'product', (select m.data || coalesce(g.data, '{}'::jsonb)
                  from scrum_items m
                  left join scrum_items g on g.room_id = m.room_id and g.kind = 'product' and g.item_id = 'goal'
                 where m.room_id = p_room and m.kind = 'product' and m.item_id = 'main'),
    'stories', coalesce((select jsonb_agg(data || jsonb_build_object('id', item_id) order by item_id)
                           from scrum_items where room_id = p_room and kind = 'story'), '[]'::jsonb),
    'sprints', coalesce((select jsonb_agg(data || jsonb_build_object('id', item_id) order by item_id)
                           from scrum_items where room_id = p_room and kind = 'sprint'), '[]'::jsonb),
    'seq',     jsonb_build_object('story',  coalesce(v_cnt.seq_story, 0),
                                  'sprint', coalesce(v_cnt.seq_sprint, 0))));

  delete from scrum_backups
   where room_id = p_room and kind = p_kind
     and id not in (select id from scrum_backups
                     where room_id = p_room and kind = p_kind
                     order by created_at desc
                     limit case p_kind when 'auto' then 8 else 4 end);
  return true;
end;
$$;

create or replace function scrum_room_restore(
  p_code       text,
  p_items      jsonb,
  p_seq_story  int default 0,
  p_seq_sprint int default 0
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   skill_rooms;
  v_it     jsonb;
  v_kind   text;
  v_id     text;
  v_lim    int;
  v_base   int;
  v_stories int := 0;
  v_sprints int := 0;
  v_active  int := 0;
  v_seen   text[] := '{}';
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := scrum_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Erst prüfen, dann schreiben.
  for v_it in select * from jsonb_array_elements(p_items) loop
    v_kind := v_it->>'kind';
    v_id   := v_it->>'id';
    if v_kind not in ('product', 'story', 'sprint')
       or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or jsonb_typeof(v_it->'data') is distinct from 'object'
       or (v_kind || ':' || v_id) = any (v_seen)
       or (v_kind = 'product' and v_id not in ('main', 'goal')) then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    v_seen := v_seen || (v_kind || ':' || v_id);
    v_lim := case v_kind when 'product' then 1500000 when 'sprint' then 80000 else 24000 end;
    if octet_length((v_it->'data')::text) > v_lim then
      return jsonb_build_object('ok', false, 'error', 'payload_too_big', 'kind', v_kind, 'id', v_id);
    end if;
    if v_kind = 'story' then v_stories := v_stories + 1; end if;
    if v_kind = 'sprint' then
      v_sprints := v_sprints + 1;
      if v_it->'data'->>'status' = 'active' then v_active := v_active + 1; end if;
    end if;
  end loop;
  if v_stories > 400 or v_sprints > 80 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
  end if;
  if v_active > 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  perform scrum_snapshot(v_room.id, 'vorher');

  select coalesce(max(version), 0) + 1 into v_base from scrum_items where room_id = v_room.id;
  delete from scrum_items    where room_id = v_room.id;
  delete from scrum_burndown where room_id = v_room.id;

  insert into scrum_items (room_id, kind, item_id, data, version, updated_at, updated_by)
  select v_room.id, e->>'kind', e->>'id', e->'data', v_base, now(), null
    from jsonb_array_elements(p_items) e;

  insert into scrum_rooms (room_id, seq_story, seq_sprint, rev)
  values (v_room.id,
          greatest(coalesce(p_seq_story, 0), 0),
          greatest(coalesce(p_seq_sprint, 0), 0), 1)
  on conflict (room_id) do update
    set seq_story  = greatest(coalesce(p_seq_story, 0), 0),
        seq_sprint = greatest(coalesce(p_seq_sprint, 0), 0),
        rev        = scrum_rooms.rev + 1;
  -- Neue Nummern dürfen nie unter den vorhandenen liegen.
  update scrum_rooms set
      seq_story  = greatest(seq_story,  coalesce((select max((data->>'no')::int) from scrum_items
                                                   where room_id = v_room.id and kind = 'story'
                                                     and data->>'no' ~ '^[0-9]{1,9}$'), 0)),
      seq_sprint = greatest(seq_sprint, coalesce((select max((data->>'no')::int) from scrum_items
                                                   where room_id = v_room.id and kind = 'sprint'
                                                     and data->>'no' ~ '^[0-9]{1,9}$'), 0))
   where room_id = v_room.id;

  perform scrum_log_burndown(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function scrum_room_restore(text, jsonb, int, int) from public;
grant execute on function scrum_room_restore(text, jsonb, int, int) to authenticated;
