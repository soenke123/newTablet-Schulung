-- ══════════════════════════════════════════════════════════════
-- Migration 0201 — Projektarbeit: Lernen am anderen Ort + Einwilligungen
-- ══════════════════════════════════════════════════════════════
-- Zwei Änderungen am Skill aus 0200:
--
-- ── 1) Ein Antrag heißt jetzt immer: „wir wollen raus" ────────────
-- Ein Antrag ist nicht mehr „Material / Zeit / Sonstiges", sondern
-- immer die Bitte, Unterrichtszeit außerhalb des Schulgeländes zu
-- verbringen. Er trägt
--   date     an welchem Tag (YYYY-MM-DD, nicht in der Vergangenheit)
--   who      wer dabei ist (ids aus der eigenen Gruppe, mindestens eine)
--   place    wohin
--   activity was dort gemacht wird
-- und daneben wie bisher at (wann er zuerst gestellt wurde), dazu
-- sentAt/sentByName (wann und von wem zuletzt abgeschickt).
--
-- Rechte für Schüler (neu):
--   · Jedes Mitglied der Gruppe darf den Antrag der Gruppe ändern —
--     es ist ein Antrag der Gruppe, nicht einer Person. Der Urheber
--     (by/byName) bleibt der, der ihn zuerst gestellt hat.
--   · Offen       → ändern und zurückziehen.
--   · Abgelehnt   → überarbeiten und neu abschicken (wird wieder
--                   offen; die Begründung der Ablehnung bleibt als
--                   prevDecision sichtbar) oder löschen.
--   · Genehmigt   → fest: weder ändern noch löschen ('decided').
-- Stundeneinträge gehören weiter dem, der sie geschrieben hat.
--
-- ── 2) Einwilligungen der Eltern (pa_seats.consent) ───────────────
--   0  keine Einwilligung
--   1  Stufe 1: das Schulgelände in Kleingruppen verlassen (z. B. zu
--      jemandem nach Hause)
--   2  Stufe 2: auch an fremde Orte
-- Nur die Lehrkraft trägt sie ein (pa_room_consent). Die Gruppe sieht
-- die Stufen ihrer Mitglieder (Reiter Team), die Lehrkraft alle
-- (Klassenliste in der Übersicht).
--
-- Für die Klassenliste liefert pa_room_get je Gruppe die Anträge, die
-- für HEUTE (Europe/Berlin) gestellt sind: today_requests.
--
-- Kein DROP — create or replace / add column if not exists
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Einwilligung je Platz
-- ─────────────────────────────────────────────────────────────
alter table pa_seats add column if not exists consent smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pa_seats_consent_chk') then
    alter table pa_seats add constraint pa_seats_consent_chk check (consent between 0 and 2);
  end if;
end
$$;

comment on column pa_seats.consent is
  'Projektarbeit (0201): Einwilligung, das Schulgelände zu verlassen. 0 keine, '
  '1 in Kleingruppen (z. B. zu jemandem nach Hause), 2 auch an fremde Orte.';


-- ─────────────────────────────────────────────────────────────
-- 2) Mitglieder mit Einwilligung
-- ─────────────────────────────────────────────────────────────
create or replace function pa_members_json(p_group uuid, p_me uuid, p_keys boolean)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',      p.id,
           'name',    skill_seat_name(p.name, p.seat),
           'label',   s.label,
           'consent', s.consent,
           'online',  p.last_seen_at > now() - interval '90 seconds',
           'me',      p.id is not distinct from p_me)
         || case when p_keys then jsonb_build_object('key', p.recover_key) else '{}'::jsonb end
         order by s.joined_at, p.seat), '[]'::jsonb)
    from pa_seats s join skill_participants p on p.id = s.participant_id
   where s.group_id = p_group and p.removed_at is null;
$$;

revoke all on function pa_members_json(uuid, uuid, boolean) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Schreiben — neue Regeln für Anträge
-- ─────────────────────────────────────────────────────────────
create or replace function pa_apply_ops(p_room uuid, p_group uuid, p_actor uuid, p_ops jsonb)
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
  v_cur   pa_items;
  v_lim   int;
  v_name  text;
  v_out   jsonb := '[]'::jsonb;
  v_tasks int;
  v_logs  int;
  v_reqs  int;
  v_day   date := (now() at time zone 'Europe/Berlin')::date;
  v_who   jsonb;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array'
     or jsonb_array_length(p_ops) = 0 or jsonb_array_length(p_ops) > 100 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_actor is not null then
    select skill_seat_name(name, seat) into v_name from skill_participants where id = p_actor;
  end if;

  -- Durchgang 1: alles prüfen, nichts schreiben.
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'kind';
    v_id   := v_op->>'id';
    v_v    := coalesce((v_op->>'v')::int, -1);
    if coalesce(v_op->>'op', '') not in ('put', 'del')
       or coalesce(v_kind, '') not in ('goal', 'task', 'log', 'request')
       or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or v_v < 0
       or (v_kind = 'goal' and v_id <> 'main') then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    if v_op->>'op' = 'put' then
      v_data := v_op->'data';
      if v_data is null or jsonb_typeof(v_data) <> 'object' then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
      -- Grenze vorher ausrechnen (ein CASE in der IF-Bedingung liest
      -- plpgsql bis zum ersten THEN, siehe 0196).
      v_lim := case v_kind when 'goal' then 1500000 else 24000 end;
      if octet_length(v_data::text) > v_lim then
        return jsonb_build_object('ok', false, 'error', 'payload_too_big', 'kind', v_kind, 'id', v_id);
      end if;
      if v_kind = 'request' and coalesce(v_data->>'status', 'open') not in ('open', 'approved', 'rejected') then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
    end if;

    select * into v_cur from pa_items
     where group_id = p_group and kind = v_kind and item_id = v_id;
    if coalesce(v_cur.version, 0) <> v_v then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'kind', v_kind, 'id', v_id);
    end if;

    if p_actor is not null then
      if v_kind = 'goal' and v_op->>'op' = 'del' then
        return jsonb_build_object('ok', false, 'error', 'not_allowed');
      end if;
      if v_kind = 'goal' and coalesce((v_cur.data->>'locked')::boolean, false) then
        return jsonb_build_object('ok', false, 'error', 'goal_locked');
      end if;
      if v_kind = 'log' and v_cur.item_id is not null
         and v_cur.data->>'by' is distinct from p_actor::text then
        return jsonb_build_object('ok', false, 'error', 'not_yours');
      end if;
      -- Ein genehmigter Antrag ist fest — weder ändern noch löschen.
      -- Offene und abgelehnte darf jedes Mitglied der Gruppe bearbeiten.
      if v_kind = 'request' and v_cur.item_id is not null
         and coalesce(v_cur.data->>'status', 'open') = 'approved' then
        return jsonb_build_object('ok', false, 'error', 'decided');
      end if;
      if v_kind = 'request' and v_op->>'op' = 'put' then
        if coalesce(v_data->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
          return jsonb_build_object('ok', false, 'error', 'date_missing');
        end if;
        if (v_data->>'date')::date < v_day then
          return jsonb_build_object('ok', false, 'error', 'date_past');
        end if;
        if btrim(coalesce(v_data->>'place', '')) = '' then
          return jsonb_build_object('ok', false, 'error', 'place_missing');
        end if;
        if not exists (
             select 1 from jsonb_array_elements_text(
                      case when jsonb_typeof(v_data->'who') = 'array' then v_data->'who' else '[]'::jsonb end) x
               join pa_seats s on s.participant_id::text = x and s.group_id = p_group) then
          return jsonb_build_object('ok', false, 'error', 'who_missing');
        end if;
      end if;
    end if;
  end loop;

  -- Durchgang 2: schreiben.
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'kind';
    v_id   := v_op->>'id';
    select * into v_cur from pa_items
     where group_id = p_group and kind = v_kind and item_id = v_id;

    if v_op->>'op' = 'del' then
      delete from pa_items where group_id = p_group and kind = v_kind and item_id = v_id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'deleted', true));
      continue;
    end if;

    v_data := v_op->'data';
    if p_actor is not null then
      -- Was Schüler nicht selbst bestimmen: die Fixierung des Ziels,
      -- wem ein Eintrag gehört, und den Stand eines Antrags.
      if v_kind = 'goal' then
        v_data := v_data || jsonb_build_object('locked', coalesce(v_cur.data->'locked', 'false'::jsonb));
      elsif v_kind = 'log' then
        v_data := v_data || jsonb_build_object('by', p_actor, 'byName', v_name);
      elsif v_kind = 'request' then
        -- Nur wer wirklich in der Gruppe ist, steht auf dem Antrag.
        select coalesce(jsonb_agg(x), '[]'::jsonb) into v_who
          from (select distinct x from jsonb_array_elements_text(v_data->'who') x
                  join pa_seats s on s.participant_id::text = x and s.group_id = p_group) w;
        v_data := (v_data - 'decision' - 'decidedAt' - 'prevDecision' - 'by' - 'byName'
                          - 'sentAt' - 'sentBy' - 'sentByName')
               || jsonb_build_object('status', 'open', 'who', v_who,
                                     'sentAt', now(), 'sentBy', p_actor, 'sentByName', v_name)
               || case when v_cur.item_id is null
                       then jsonb_build_object('by', p_actor, 'byName', v_name)
                       else jsonb_build_object('by', v_cur.data->'by', 'byName', v_cur.data->'byName') end
               -- Abgelehnt und überarbeitet: die Begründung der Ablehnung
               -- bleibt stehen, damit die Lehrkraft sieht, worauf die
               -- Gruppe antwortet.
               || case when v_cur.data->>'status' = 'rejected'
                       then jsonb_build_object('prevDecision',
                              coalesce(nullif(btrim(v_cur.data->>'decision'), ''), 'Abgelehnt.'))
                       when v_cur.data ? 'prevDecision'
                       then jsonb_build_object('prevDecision', v_cur.data->'prevDecision')
                       else '{}'::jsonb end;
      end if;
    else
      -- Lehrkraft: Eintrag ohne Urheber bekommt sie selbst.
      if v_kind in ('log', 'request') and v_cur.item_id is null and not (v_data ? 'by') then
        v_data := v_data || jsonb_build_object('by', null, 'byName', 'Lehrkraft');
      end if;
      if v_kind = 'request' and v_data->>'status' in ('approved', 'rejected')
         and (v_cur.data->>'status') is distinct from (v_data->>'status') then
        v_data := v_data || jsonb_build_object('decidedAt', now());
      end if;
    end if;
    if v_kind in ('log', 'request') and v_cur.item_id is null then
      v_data := v_data || jsonb_build_object('at', now());
    elsif v_kind in ('log', 'request') then
      v_data := v_data || jsonb_build_object('at', v_cur.data->'at');
    end if;

    insert into pa_items (room_id, group_id, kind, item_id, data, version, updated_at, updated_by)
    values (p_room, p_group, v_kind, v_id, v_data, 1, now(), p_actor)
    on conflict (group_id, kind, item_id) do update
      set data = excluded.data, version = pa_items.version + 1,
          updated_at = now(), updated_by = p_actor
    returning * into v_cur;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
               'kind', v_kind, 'id', v_id, 'v', v_cur.version, 'data', v_cur.data));
  end loop;

  select count(*) filter (where kind = 'task'), count(*) filter (where kind = 'log'),
         count(*) filter (where kind = 'request')
    into v_tasks, v_logs, v_reqs
    from pa_items where group_id = p_group;
  if v_tasks > 300 or v_logs > 2000 or v_reqs > 300 then
    raise exception 'pa_limit' using errcode = 'P0001';
  end if;

  perform pa_bump(p_room);
  perform skill_touch(p_room);
  return jsonb_build_object('ok', true, 'items', v_out);
exception
  when raise_exception then
    if sqlerrm = 'pa_limit' then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
    end if;
    raise;
  -- Ein Datum wie 2026-02-31 besteht die Form, aber nicht den Kalender.
  when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'date_missing');
end;
$$;

revoke all on function pa_apply_ops(uuid, uuid, uuid, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 4) Übersicht der Lehrkraft — mit Einwilligung und heutigen Anträgen
-- ─────────────────────────────────────────────────────────────
create or replace function pa_room_get(p_code text, p_group uuid default null, p_have jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_pr   pa_rooms;
  v_day  date := (now() at time zone 'Europe/Berlin')::date;
  v_g    pa_groups;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_pr from pa_rooms where room_id = v_room.id;
  if p_group is not null then
    select * into v_g from pa_groups where id = p_group and room_id = v_room.id;
  end if;

  return jsonb_build_object(
    'ok',   true,
    'role', 'presenter',
    'rev',  coalesce(v_pr.rev, 0),
    'today', v_day,
    'room', jsonb_build_object('title', v_room.title, 'join_open', v_room.join_open,
                               'rules', coalesce(v_pr.rules, '')),
    'me',   jsonb_build_object('id', null, 'name', 'Lehrkraft'),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',      p.id,
               'name',    skill_seat_name(p.name, p.seat),
               'online',  p.last_seen_at > now() - interval '90 seconds',
               'blocked', p.blocked,
               'group',   s.group_id,
               'label',   coalesce(s.label, ''),
               'consent', coalesce(s.consent, 0),
               'key',     p.recover_key)
             order by coalesce(s.joined_at, p.joined_at), p.seat)
        from skill_participants p left join pa_seats s on s.participant_id = p.id
       where p.room_id = v_room.id and p.removed_at is null), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        g.id,
               'no',        g.no,
               'name',      g.name,
               'plan_open', g.plan_open,
               'open_requests', (select count(*) from pa_items i
                                  where i.group_id = g.id and i.kind = 'request'
                                    and coalesce(i.data->>'status', 'open') = 'open'),
               -- Anträge für heute: daran hängt die Klassenliste
               -- (grau = heute genehmigt woanders, gelb = offen/abgelehnt).
               'today_requests', (select coalesce(jsonb_agg(jsonb_build_object(
                                           'id',     i.item_id,
                                           'status', coalesce(i.data->>'status', 'open'),
                                           'place',  coalesce(i.data->>'place', ''),
                                           'who',    case when jsonb_typeof(i.data->'who') = 'array'
                                                          then i.data->'who' else '[]'::jsonb end)), '[]'::jsonb)
                                    from pa_items i
                                   where i.group_id = g.id and i.kind = 'request'
                                     and i.data->>'date' = v_day::text),
               'tasks',     (select jsonb_build_object(
                                      'todo',    count(*) filter (where i.data->>'col' = 'todo'),
                                      'blocked', count(*) filter (where i.data->>'col' = 'blocked'),
                                      'doing',   count(*) filter (where i.data->>'col' = 'doing'),
                                      'done',    count(*) filter (where i.data->>'col' = 'done'))
                               from pa_items i where i.group_id = g.id and i.kind = 'task'),
               'logs_today', (select count(*) from pa_items i
                               where i.group_id = g.id and i.kind = 'log' and i.data->>'date' = v_day::text),
               'title',     (select i.data->>'title' from pa_items i
                               where i.group_id = g.id and i.kind = 'goal' and i.item_id = 'main'),
               'last',      (select max(i.updated_at) from pa_items i where i.group_id = g.id))
             order by g.no, g.created_at)
        from pa_groups g where g.room_id = v_room.id), '[]'::jsonb),
    'group', case when v_g.id is not null then pa_group_json(v_g.id, null, true) end,
    'items', case when v_g.id is not null then pa_items_json(v_g.id, p_have) else '[]'::jsonb end
  );
end;
$$;

revoke all on function pa_room_get(text, uuid, jsonb) from public;
grant execute on function pa_room_get(text, uuid, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Einwilligung eintragen (nur Lehrkraft)
-- ─────────────────────────────────────────────────────────────
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
  if p_level is null or p_level not between 0 and 2 then
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
