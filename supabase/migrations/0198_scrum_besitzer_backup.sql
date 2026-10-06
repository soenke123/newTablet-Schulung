-- ══════════════════════════════════════════════════════════════
-- Migration 0198 — Scrum Werkstatt: Raum-Besitzer, Beobachter, Backup
-- ══════════════════════════════════════════════════════════════
-- Sönke (06.10.2026): Die Rollen im Raum werden klarer getrennt.
--
--   Raum-Besitzer (die Lehrkraft, die den Raum angelegt hat)
--     · kann alles, was ein Teammitglied kann (Board, Backlog, Sprints,
--       Rollen der Kacheln) — bisher las sie nur mit,
--     · ist die EINZIGE Person, die das Projekt zurücksetzen, ein
--       Backup einspielen oder eine Datei importieren darf,
--     · sieht alle persönlichen Codes (wie bisher, 0196).
--   Teammitglied
--     · wie bisher; Code zeigen, Export und Druck, sonst nichts.
--   Beobachter
--     · liest nur und kann dem Team später NICHT mehr beitreten
--       (scrum_enter: 'observer_locked'). Wer wirklich ins Team soll,
--       tritt dem Raum neu bei.
--
-- ── Backup ────────────────────────────────────────────────────
-- Einmal pro Woche, aber nur, wenn jemand im Raum ist: jedes Lesen
-- und Schreiben (scrum_log_burndown, 0196) ruft scrum_maybe_backup.
-- Die schaut nach dem jüngsten Auto-Backup; ist es älter als 7 Tage
-- (oder gibt es keins) und enthält das Projekt etwas, wird ein neues
-- geschrieben. Ein Raum, den niemand öffnet, erzeugt also nichts.
-- Es bleiben die letzten 8 Auto-Backups.
--
-- Vor jedem Zurücksetzen/Einspielen legt der Server außerdem ein
-- Backup „vorher" an (die letzten 4 bleiben) — ein Klick zu viel
-- soll nicht das ganze Projekt kosten.
--
-- Das Backup hat dasselbe Format wie der Export aus der Werkstatt
-- (product, stories, sprints, seq). Der Besitzer lädt es als Datei
-- herunter und kann es in diesem oder (zum Ausprobieren) in einem
-- neuen Raum wieder einspielen.
--
-- Versionen: Beim Einspielen bekommt jedes Objekt eine Version, die
-- größer ist als jede bisherige im Raum. Sonst hielte ein Gerät eine
-- zurückgespielte Karte für unverändert, weil sie dieselbe
-- Versionsnummer wie zuvor trägt, und zeigte den alten Inhalt.
--
-- Kein DROP — Idempotenz per if not exists / create or replace.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Tabelle
-- ─────────────────────────────────────────────────────────────
create table if not exists scrum_backups (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('auto', 'vorher')),
  stories    int  not null default 0,
  sprints    int  not null default 0,
  data       jsonb not null
);

comment on table scrum_backups is
  'Sicherungen eines Scrum-Raums (0198): wöchentlich automatisch (auto, nur bei Aktivität) '
  'und vor jedem Zurücksetzen/Einspielen (vorher). data = Export-Format der Werkstatt.';

create index if not exists scrum_backups_room_idx on scrum_backups(room_id, created_at desc);
alter table scrum_backups enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2) Sichern
-- ─────────────────────────────────────────────────────────────
-- Der Stand des Raums als ein Objekt. Leere Projekte werden nicht
-- gesichert (Rückgabe false).
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
    'product', (select data from scrum_items
                 where room_id = p_room and kind = 'product' and item_id = 'main'),
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

revoke all on function scrum_snapshot(uuid, text) from public;


-- Wöchentliches Auto-Backup, nur bei Aktivität (siehe Kopf).
create or replace function scrum_maybe_backup(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if exists (select 1 from scrum_backups
              where room_id = p_room and kind = 'auto'
                and created_at > now() - interval '7 days') then
    return;
  end if;
  -- Zwei Geräte, die im selben Augenblick lesen, sollen nicht beide
  -- sichern: wer die Sperre nicht bekommt, überlässt es dem anderen.
  if not pg_try_advisory_xact_lock(hashtext('scrum_backup:' || p_room::text)) then
    return;
  end if;
  if exists (select 1 from scrum_backups
              where room_id = p_room and kind = 'auto'
                and created_at > now() - interval '7 days') then
    return;
  end if;
  perform scrum_snapshot(p_room, 'auto');
end;
$$;

revoke all on function scrum_maybe_backup(uuid) from public;


-- scrum_log_burndown (0196) läuft bei JEDEM Lesen und Schreiben im
-- Raum — genau der Takt, den das Backup braucht („ist jemand da?").
-- Deshalb hängt die Prüfung hier und nicht in einer zweiten Funktion,
-- die jede Lese- und Schreibfunktion einzeln aufrufen müsste.
create or replace function scrum_log_burndown(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_day date := (now() at time zone 'Europe/Berlin')::date;
begin
  insert into scrum_burndown (room_id, sprint_id, day, open_points, total_points)
  select p_room, sp.item_id, v_day,
         coalesce(sum(case when st.data->>'status' <> 'done'
                           then coalesce((st.data->>'points')::int, 0) end), 0),
         coalesce(sum(coalesce((st.data->>'points')::int, 0)), 0)
    from scrum_items sp
    left join scrum_items st
           on st.room_id = sp.room_id and st.kind = 'story'
          and st.data->>'sprint' = sp.item_id
   where sp.room_id = p_room and sp.kind = 'sprint'
     and sp.data->>'status' = 'active'
   group by sp.item_id
  on conflict (room_id, sprint_id, day) do update
    set open_points  = excluded.open_points,
        total_points = excluded.total_points;

  perform scrum_maybe_backup(p_room);
end;
$$;

revoke all on function scrum_log_burndown(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Beobachter: kein späterer Beitritt
-- ─────────────────────────────────────────────────────────────
-- Gegenüber 0196 ist nur der Block „Beobachter → Mitglied" neu.
create or replace function scrum_enter(p_token text, p_kind text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_m    scrum_members;
  v_key  text;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id for update;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  if p_kind not in ('member', 'observer') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select * into v_m from scrum_members where participant_id = v_p.id;
  if v_m.participant_id is not null then
    if v_m.kind = p_kind then
      return jsonb_build_object('ok', true, 'kind', v_m.kind,
        'key', case when v_m.kind = 'member' then v_p.recover_key end);
    end if;
    -- Vom Mitglied zurück zum Beobachter geht nicht: an ihm hängen Karten.
    if v_m.kind = 'member' then
      return jsonb_build_object('ok', false, 'error', 'already_member');
    end if;
    -- Und vom Beobachter ins Team auch nicht mehr (0198): die Wahl
    -- beim Betreten gilt.
    return jsonb_build_object('ok', false, 'error', 'observer_locked');
  end if;

  if p_kind = 'member' and (select count(*) from scrum_members m
                              join skill_participants p on p.id = m.participant_id
                             where m.room_id = v_room.id and m.kind = 'member'
                               and p.removed_at is null) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'team_full');
  end if;

  insert into scrum_members (participant_id, room_id, kind)
  values (v_p.id, v_room.id, p_kind);

  if p_kind = 'member' then
    v_key := coalesce(v_p.recover_key, skill_gen_recover_key());
    update skill_participants set recover_key = v_key where id = v_p.id;
  end if;

  perform scrum_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'kind', p_kind, 'key', v_key);
end;
$$;

revoke all on function scrum_enter(text, text) from public;
grant execute on function scrum_enter(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Gemeinsame Bausteine: Änderungen schreiben, Kachel ändern
-- ─────────────────────────────────────────────────────────────
-- Der Teil von scrum_save (0196) ab „Durchgang 1" — jetzt von
-- Teilnehmern UND vom Raum-Besitzer benutzt. Wer ruft, hat Zugriff
-- und die Zeilensperre auf dem Raum schon geprüft. p_actor ist der
-- schreibende Teilnehmer (null beim Besitzer).
create or replace function scrum_apply_ops(p_room uuid, p_actor uuid, p_ops jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_op    jsonb;
  v_kind  text;
  v_id    text;
  v_v     int;
  v_data  jsonb;
  v_cur   scrum_items;
  v_cnt   scrum_rooms;
  v_no    int;
  v_out   jsonb := '[]'::jsonb;
  v_stories int;
  v_sprints int;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array'
     or jsonb_array_length(p_ops) = 0 or jsonb_array_length(p_ops) > 400 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Durchgang 1: alles prüfen, nichts schreiben.
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'kind';
    v_id   := v_op->>'id';
    v_v    := coalesce((v_op->>'v')::int, -1);
    if v_op->>'op' not in ('put', 'del')
       or v_kind not in ('product', 'story', 'sprint')
       or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or v_v < 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    if v_op->>'op' = 'put' then
      v_data := v_op->'data';
      if v_data is null or jsonb_typeof(v_data) <> 'object' then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
      v_no := case v_kind when 'product' then 1500000
                          when 'sprint'  then 80000
                          else 24000 end;
      if octet_length(v_data::text) > v_no then
        return jsonb_build_object('ok', false, 'error', 'payload_too_big',
                                  'kind', v_kind, 'id', v_id);
      end if;
    end if;
    select * into v_cur from scrum_items
     where room_id = p_room and kind = v_kind and item_id = v_id;
    if coalesce(v_cur.version, 0) <> v_v then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'kind', v_kind, 'id', v_id);
    end if;
    if v_op->>'op' = 'put' and v_kind = 'sprint' and v_data->>'status' = 'active'
       and exists (select 1 from scrum_items
                    where room_id = p_room and kind = 'sprint' and item_id <> v_id
                      and data->>'status' = 'active'
                      and not exists (select 1 from jsonb_array_elements(p_ops) o
                                       where o->>'kind' = 'sprint' and o->>'id' = scrum_items.item_id
                                         and (o->>'op' = 'del' or o->'data'->>'status' <> 'active'))) then
      return jsonb_build_object('ok', false, 'error', 'sprint_active');
    end if;
  end loop;

  perform scrum_log_burndown(p_room);

  insert into scrum_rooms (room_id) values (p_room) on conflict do nothing;
  select * into v_cnt from scrum_rooms where room_id = p_room for update;

  -- Durchgang 2: schreiben.
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'kind';
    v_id   := v_op->>'id';
    v_v    := (v_op->>'v')::int;

    if v_op->>'op' = 'del' then
      delete from scrum_items where room_id = p_room and kind = v_kind and item_id = v_id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'deleted', true));
      continue;
    end if;

    v_data := v_op->'data';
    if v_v = 0 and v_kind = 'story' then
      v_cnt.seq_story := v_cnt.seq_story + 1;
      v_no := v_cnt.seq_story;
      v_data := v_data || jsonb_build_object('no', v_no, 'key', 'US-' || lpad(v_no::text, 2, '0'));
    elsif v_v = 0 and v_kind = 'sprint' then
      v_cnt.seq_sprint := v_cnt.seq_sprint + 1;
      v_no := v_cnt.seq_sprint;
      v_data := v_data || jsonb_build_object('no', v_no)
             || case when coalesce(btrim(v_data->>'name'), '') = ''
                     then jsonb_build_object('name', 'Sprint ' || v_no) else '{}'::jsonb end;
    end if;

    insert into scrum_items (room_id, kind, item_id, data, version, updated_at, updated_by)
    values (p_room, v_kind, v_id, v_data, 1, now(), p_actor)
    on conflict (room_id, kind, item_id) do update
      set data = excluded.data, version = scrum_items.version + 1,
          updated_at = now(), updated_by = p_actor
    returning * into v_cur;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
               'kind', v_kind, 'id', v_id, 'v', v_cur.version, 'data', v_cur.data));
  end loop;

  select count(*) filter (where kind = 'story'), count(*) filter (where kind = 'sprint')
    into v_stories, v_sprints
    from scrum_items where room_id = p_room;
  if v_stories > 400 or v_sprints > 80 then
    raise exception 'scrum_limit' using errcode = 'P0001';
  end if;

  update scrum_rooms
     set seq_story = v_cnt.seq_story, seq_sprint = v_cnt.seq_sprint, rev = rev + 1
   where room_id = p_room;

  perform scrum_log_burndown(p_room);
  perform skill_touch(p_room);
  return jsonb_build_object('ok', true, 'items', v_out);
exception
  when raise_exception then
    if sqlerrm = 'scrum_limit' then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
    end if;
    raise;
end;
$$;

revoke all on function scrum_apply_ops(uuid, uuid, jsonb) from public;


-- scrum_save wie 0196, nur dass das Schreiben jetzt in scrum_apply_ops steht.
create or replace function scrum_save(p_token text, p_ops jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_me   scrum_members;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  -- Zeilensperre auf dem Raum: zwei Speichervorgänge desselben Teams
  -- laufen nacheinander, nicht ineinander (siehe 0196).
  select * into v_room from skill_rooms where id = v_p.room_id for update;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  select * into v_me from scrum_members where participant_id = v_p.id;
  if v_me.kind is distinct from 'member' then
    return jsonb_build_object('ok', false, 'error', 'read_only');
  end if;
  return scrum_apply_ops(v_room.id, v_p.id, p_ops);
end;
$$;

revoke all on function scrum_save(text, jsonb) from public;
grant execute on function scrum_save(text, jsonb) to anon, authenticated;


-- Rolle, Label und Avatar einer Teamkarte ändern (Teil von
-- scrum_member_update aus 0196, jetzt auch für den Besitzer).
create or replace function scrum_apply_member_patch(p_room uuid, p_target uuid, p_patch jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_t    scrum_members;
  v_role text;
  v_lbl  text;
begin
  select * into v_t from scrum_members
   where participant_id = p_target and room_id = p_room and kind = 'member';
  if v_t.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if p_patch ? 'role' then
    v_role := p_patch->>'role';
    if v_role not in ('dev', 'po', 'sm') then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    if v_role <> 'dev' then
      update scrum_members set role = 'dev'
       where room_id = p_room and role = v_role and participant_id <> v_t.participant_id;
    end if;
    update scrum_members set role = v_role where participant_id = v_t.participant_id;
  end if;

  if p_patch ? 'label' then
    v_lbl := btrim(coalesce(p_patch->>'label', ''));
    if char_length(v_lbl) > 40 then
      return jsonb_build_object('ok', false, 'error', 'too_long');
    end if;
    if v_lbl <> '' and contains_blacklisted_word(v_lbl) then
      return jsonb_build_object('ok', false, 'error', 'text_blocked');
    end if;
    update scrum_members set label = v_lbl where participant_id = v_t.participant_id;
  end if;

  if p_patch ? 'avatar' then
    if p_patch->'avatar' = 'null'::jsonb then
      update scrum_members set avatar = null where participant_id = v_t.participant_id;
    elsif (p_patch->>'avatar') !~ '^data:image/(jpeg|png|webp);base64,'
       or octet_length(p_patch->>'avatar') > 60000 then
      return jsonb_build_object('ok', false, 'error', 'payload_too_big');
    else
      update scrum_members set avatar = p_patch->>'avatar' where participant_id = v_t.participant_id;
    end if;
  end if;

  perform scrum_bump(p_room);
  perform skill_touch(p_room);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function scrum_apply_member_patch(uuid, uuid, jsonb) from public;


create or replace function scrum_member_update(
  p_token       text,
  p_participant uuid,
  p_patch       jsonb
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_me   scrum_members;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  select * into v_me from scrum_members where participant_id = v_p.id;
  if v_me.kind is distinct from 'member' then
    return jsonb_build_object('ok', false, 'error', 'read_only');
  end if;
  return scrum_apply_member_patch(v_room.id, p_participant, p_patch);
end;
$$;

revoke all on function scrum_member_update(text, uuid, jsonb) from public;
grant execute on function scrum_member_update(text, uuid, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Raum-Besitzer
-- ─────────────────────────────────────────────────────────────
-- Der Raum, wenn der Aufrufer sein Besitzer ist — sonst eine leere
-- Zeile (id null). Für Schreibzugriffe gesperrt (for update).
create or replace function scrum_owned_room(p_code text, p_lock boolean default false)
  returns skill_rooms
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  if auth.uid() is null then
    return v_room;
  end if;
  if p_lock then
    select * into v_room from skill_rooms
     where code = upper(btrim(p_code)) and owner_id = auth.uid() for update;
  else
    select * into v_room from skill_rooms
     where code = upper(btrim(p_code)) and owner_id = auth.uid();
  end if;
  return v_room;
end;
$$;

revoke all on function scrum_owned_room(text, boolean) from public;


-- Board ändern — wie scrum_save, nur für den Besitzer.
create or replace function scrum_room_save(p_code text, p_ops jsonb)
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
  v_room := scrum_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  return scrum_apply_ops(v_room.id, null, p_ops);
end;
$$;

revoke all on function scrum_room_save(text, jsonb) from public;
grant execute on function scrum_room_save(text, jsonb) to authenticated;


-- Rolle/Label/Bild einer Teamkarte — wie scrum_member_update.
create or replace function scrum_room_member_update(p_code text, p_participant uuid, p_patch jsonb)
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
  v_room := scrum_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return scrum_apply_member_patch(v_room.id, p_participant, p_patch);
end;
$$;

revoke all on function scrum_room_member_update(text, uuid, jsonb) from public;
grant execute on function scrum_room_member_update(text, uuid, jsonb) to authenticated;


-- Das ganze Projekt ersetzen: zurücksetzen (p_items = []), Datei
-- importieren oder Backup einspielen. Nur der Besitzer.
--
-- p_items: [ { "kind": "story", "id": "u3", "data": { … } }, … ]
-- Vorher legt der Server ein Backup „vorher" an. Der Burndown-Verlauf
-- beginnt neu — er gehört zum alten Stand.
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
       or (v_kind = 'product' and v_id <> 'main') then
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


-- Die Backups des Raums, neueste zuerst (ohne Inhalt).
create or replace function scrum_room_backups(p_code text)
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
  v_room := scrum_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'backups', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'at', b.created_at, 'kind', b.kind,
             'stories', b.stories, 'sprints', b.sprints) order by b.created_at desc)
      from scrum_backups b where b.room_id = v_room.id), '[]'::jsonb));
end;
$$;

revoke all on function scrum_room_backups(text) from public;
grant execute on function scrum_room_backups(text) to authenticated;


-- Ein Backup mit Inhalt (zum Herunterladen oder Einspielen).
create or replace function scrum_room_backup_get(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_b    scrum_backups;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := scrum_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from scrum_backups where id = p_id and room_id = v_room.id;
  if v_b.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'at', v_b.created_at, 'kind', v_b.kind, 'data', v_b.data);
end;
$$;

revoke all on function scrum_room_backup_get(text, uuid) from public;
grant execute on function scrum_room_backup_get(text, uuid) to authenticated;
