-- ══════════════════════════════════════════════════════════════
-- Migration 0206 — Projektarbeit: Fotos in der Dokumentation
-- ══════════════════════════════════════════════════════════════
-- Ein Eintrag in der Dokumentation (kind 'log') darf bis zu drei Fotos
-- tragen (data.photos = [ 'data:image/jpeg;base64,…', … ]), z. B. von
-- einer Exkursion. Das Gerät verkleinert sie vorher (lange Seite höchstens
-- 1000 px, JPEG). Die Lehrkraft kann Fotos wieder löschen — und soll es,
-- sobald Personen darauf zu sehen sind und das Foto nicht mehr gebraucht
-- wird.
--
--   · pa_apply_ops      Grenze für 'log' 24 000 → 700 000 Byte; photos
--                       nur als Liste mit höchstens 3 Bildern (data-URL).
--   · pa_project_json   Export und Backups enthalten KEINE Fotos — so
--                       bleibt ein gelöschtes Foto nicht in einer Sicherung
--                       liegen. Einspielen eines Backups lässt die Fotos
--                       der betroffenen Einträge deshalb weg.
--
-- Die Fotos wandern wie die Bilder im Projektziel nur einmal je Version
-- über das WLAN (p_have in pa_items_json).
--
-- Kein DROP — create or replace (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Export / Backup ohne Fotos
-- ─────────────────────────────────────────────────────────────
create or replace function pa_project_json(p_group uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
           'group',   g.id,
           'no',      g.no,
           'name',    g.name,
           'members', coalesce((select jsonb_agg(skill_seat_name(p.name, p.seat) order by s.joined_at, p.seat)
                                  from pa_seats s join skill_participants p on p.id = s.participant_id
                                 where s.group_id = g.id and p.removed_at is null), '[]'::jsonb),
           'items',   coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.item_id,
                                                            'data', case when i.kind = 'log' then i.data - 'photos' else i.data end)
                                         order by i.kind, i.item_id)
                                  from pa_items i where i.group_id = g.id), '[]'::jsonb))
    from pa_groups g where g.id = p_group;
$$;

revoke all on function pa_project_json(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 2) Schreiben — Fotos am Eintrag
-- ─────────────────────────────────────────────────────────────
-- Wie 0202, nur: Grenze für 'log' und die Prüfung von photos.
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
  v_names jsonb;
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
      v_lim := case v_kind when 'goal' then 1500000 when 'log' then 700000 else 24000 end;
      if octet_length(v_data::text) > v_lim then
        return jsonb_build_object('ok', false, 'error', 'payload_too_big', 'kind', v_kind, 'id', v_id);
      end if;
      if v_kind = 'request' and coalesce(v_data->>'status', 'open') not in ('open', 'approved', 'rejected') then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
      -- Fotos am Eintrag (0206): höchstens drei, nur Bilder als data-URL.
      if v_kind = 'log' and v_data ? 'photos'
         and (jsonb_typeof(v_data->'photos') <> 'array'
              or jsonb_array_length(v_data->'photos') > 3
              or exists (select 1 from jsonb_array_elements(v_data->'photos') x
                          where jsonb_typeof(x) <> 'string'
                             or (x #>> '{}') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')) then
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
      -- Einen Stundeneintrag ändern oder löschen darf, wer ihn angelegt
      -- hat, und wer darin steht (0202).
      if v_kind = 'log' and v_cur.item_id is not null
         and v_cur.data->>'by' is distinct from p_actor::text
         and not (jsonb_typeof(v_cur.data->'who') = 'array'
                  and v_cur.data->'who' ? p_actor::text) then
        return jsonb_build_object('ok', false, 'error', 'not_yours');
      end if;
      if v_kind = 'log' and v_op->>'op' = 'put' and jsonb_typeof(v_data->'who') = 'array'
         and not exists (
             select 1 from jsonb_array_elements_text(v_data->'who') x
               join pa_seats s on s.participant_id::text = x and s.group_id = p_group) then
        return jsonb_build_object('ok', false, 'error', 'who_missing');
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
        -- Ohne who (Gerät mit altem Stand): wie vor 0202 — nur der Schreiber.
        if jsonb_typeof(v_data->'who') is distinct from 'array' then
          v_data := v_data || jsonb_build_object('who', jsonb_build_array(p_actor));
        end if;
        v_data := v_data || case when v_cur.item_id is null
                                 then jsonb_build_object('by', p_actor, 'byName', v_name)
                                 else jsonb_build_object('by', v_cur.data->'by', 'byName', v_cur.data->'byName') end;
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
    -- Stundeneintrag: nur Mitglieder der Gruppe, jede Person einmal, in
    -- der Reihenfolge der Auswahl — und die Namen dazu (0202).
    if v_kind = 'log' and jsonb_typeof(v_data->'who') = 'array' then
      select coalesce(jsonb_agg(w.x order by w.n), '[]'::jsonb),
             coalesce(jsonb_agg(w.nm order by w.n), '[]'::jsonb)
        into v_who, v_names
        from (select distinct on (e.x) e.x, e.n, skill_seat_name(p.name, p.seat) nm
                from jsonb_array_elements_text(v_data->'who') with ordinality e(x, n)
                join pa_seats s on s.participant_id::text = e.x and s.group_id = p_group
                join skill_participants p on p.id = s.participant_id
               order by e.x, e.n) w;
      v_data := v_data || jsonb_build_object('who', v_who, 'whoNames', v_names);
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
