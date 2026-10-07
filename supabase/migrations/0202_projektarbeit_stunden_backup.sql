-- ══════════════════════════════════════════════════════════════
-- Migration 0202 — Projektarbeit: Stunden gemeinsam, Backup, ein Jahr
-- ══════════════════════════════════════════════════════════════
-- Sönke (07.10.2026), drei Änderungen am Skill aus 0200/0201:
--
-- ── 1) Stundeneinträge für mehrere Personen ──────────────────────
-- Ein Eintrag im Stundenprotokoll gehört nicht mehr nur einer Person.
-- Er trägt
--   who       wer dabei war (ids aus der eigenen Gruppe, mindestens eine)
--   whoNames  die Namen dazu — setzt der Server, damit der Eintrag auch
--             lesbar bleibt, wenn jemand den Raum verlässt oder das
--             Projekt in einen anderen Raum eingespielt wird
-- Wer einträgt, muss nicht selbst dabei gewesen sein („ich trage für
-- Leon ein"). Wer nicht dabei war (krank, fehlt), steht einfach nicht
-- drin. Der Urheber (by/byName) bleibt der, der den Eintrag angelegt
-- hat. Ändern und löschen darf er — und jede Person, die im Eintrag
-- steht. Einträge von vor 0202 (ohne who) gelten als { who: [by] }.
--
-- ── 2) Export, Import, wöchentliches Backup (wie Scrum Werkstatt, 0198)
-- Format einer Datei / eines Backups:
--   { format: 'projektarbeit', version: 1, title, at,
--     projects: [ { group, no, name, members: [Namen],
--                   items: [ { kind, id, data }, … ] }, … ] }
-- Ein Export eines einzelnen Planungsraums ist dieselbe Datei mit
-- genau einem Projekt. Keine persönlichen Codes darin.
--
-- Nur der Raum-Besitzer (die Lehrkraft) importiert und spielt Backups
-- ein (pa_room_import, pa_room_backup_restore):
--   · mit p_target: der Inhalt DIESES Planungsraums wird durch das
--     (eine) Projekt aus der Datei ersetzt;
--   · ohne: jedes Projekt der Datei ersetzt den Inhalt seiner Gruppe,
--     wenn es die im Raum noch gibt (gleiche id) — sonst entsteht eine
--     neue Gruppe mit offenem Planungsraum, aber ohne Mitglieder. Gruppen,
--     die nicht in der Datei stehen, bleiben unberührt.
-- Vorher legt der Server ein Backup „vorher" an (die letzten 4 bleiben).
--
-- Backup: einmal pro Woche, aber nur bei Aktivität — pa_bump läuft bei
-- jeder Änderung im Raum und ruft pa_maybe_backup. Ist das jüngste
-- Auto-Backup älter als 7 Tage (oder gibt es keins) und hat irgendein
-- Planungsraum Inhalt, wird gesichert. Es bleiben die letzten 8.
--
-- Versionen: Beim Einspielen bekommt jedes Objekt eine Version, die
-- größer ist als jede bisherige in der Gruppe (siehe 0198) — sonst
-- hielte ein Gerät ein zurückgespieltes Objekt für unverändert.
--
-- ── 3) Ein Raum hält ein Jahr ─────────────────────────────────────
-- Projektarbeit läuft über ein Schuljahr. Statt der 30 Tage aller
-- anderen Skills (0085) gilt hier: ein Jahr ab Anlage, und jede
-- Aktivität setzt die Frist wieder auf ein Jahr. Gelöst mit einem
-- Trigger auf skill_rooms, damit skill_touch, skill_room_set_open,
-- skill_room_extend, skill_room_update und die Neuanlage unverändert
-- bleiben: Für tool_id 'projekt' zieht er jede neue Frist auf
-- mindestens „jetzt + 365 Tage" hoch — und verhindert so auch, dass
-- skill_touch (jetzt + 30 Tage) die Jahresfrist wieder verkürzt.
--
-- Kein DROP — create or replace / if not exists
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Ein Jahr Laufzeit
-- ─────────────────────────────────────────────────────────────
create or replace function pa_room_lifetime()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.tool_id = 'projekt'
     and (tg_op = 'INSERT' or new.expires_at is distinct from old.expires_at) then
    new.expires_at := greatest(new.expires_at, now() + interval '365 days');
  end if;
  return new;
end;
$$;

revoke all on function pa_room_lifetime() from public;

create or replace trigger pa_room_lifetime
  before insert or update of expires_at on skill_rooms
  for each row execute function pa_room_lifetime();

-- Räume, die es schon gibt (und die noch laufen), bekommen ihr Jahr.
update skill_rooms set expires_at = now() + interval '365 days'
 where tool_id = 'projekt' and expires_at > now()
   and expires_at < now() + interval '365 days';


-- ─────────────────────────────────────────────────────────────
-- 2) Backups: Tabelle
-- ─────────────────────────────────────────────────────────────
create table if not exists pa_backups (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('auto', 'vorher')),
  projects   int  not null default 0,
  items      int  not null default 0,
  data       jsonb not null
);

comment on table pa_backups is
  'Sicherungen eines Projektarbeit-Raums (0202): wöchentlich automatisch (auto, nur bei '
  'Aktivität) und vor jedem Import/Einspielen (vorher). data = Export-Format (projects[]).';

create index if not exists pa_backups_room_idx on pa_backups(room_id, created_at desc);
alter table pa_backups enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 3) Ein Projekt / der ganze Raum als Datei
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
           'items',   coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', i.item_id, 'data', i.data)
                                         order by i.kind, i.item_id)
                                  from pa_items i where i.group_id = g.id), '[]'::jsonb))
    from pa_groups g where g.id = p_group;
$$;

revoke all on function pa_project_json(uuid) from public;


-- p_group null = alle Gruppen mit Planungsraum (oder mit Inhalt).
create or replace function pa_export_json(p_room uuid, p_group uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
           'format',   'projektarbeit',
           'version',  1,
           'title',    (select title from skill_rooms where id = p_room),
           'at',       now(),
           'projects', coalesce((
              select jsonb_agg(pa_project_json(g.id) order by g.no, g.created_at)
                from pa_groups g
               where g.room_id = p_room
                 and (case when p_group is null
                           then g.plan_open or exists (select 1 from pa_items i where i.group_id = g.id)
                           else g.id = p_group end)), '[]'::jsonb));
$$;

revoke all on function pa_export_json(uuid, uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 4) Sichern
-- ─────────────────────────────────────────────────────────────
-- Leere Räume (kein Planungsraum hat Inhalt) werden nicht gesichert.
create or replace function pa_snapshot(p_room uuid, p_kind text)
  returns boolean
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_items int;
  v_data  jsonb;
begin
  select count(*) into v_items from pa_items where room_id = p_room;
  if v_items = 0 then
    return false;
  end if;
  v_data := pa_export_json(p_room, null);

  insert into pa_backups (room_id, kind, projects, items, data)
  values (p_room, p_kind, jsonb_array_length(v_data->'projects'), v_items, v_data);

  delete from pa_backups
   where room_id = p_room and kind = p_kind
     and id not in (select id from pa_backups
                     where room_id = p_room and kind = p_kind
                     order by created_at desc
                     limit case p_kind when 'auto' then 8 else 4 end);
  return true;
end;
$$;

revoke all on function pa_snapshot(uuid, text) from public;


create or replace function pa_maybe_backup(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if exists (select 1 from pa_backups
              where room_id = p_room and kind = 'auto'
                and created_at > now() - interval '7 days') then
    return;
  end if;
  -- Zwei Speichervorgänge im selben Augenblick sollen nicht beide sichern.
  if not pg_try_advisory_xact_lock(hashtext('pa_backup:' || p_room::text)) then
    return;
  end if;
  if exists (select 1 from pa_backups
              where room_id = p_room and kind = 'auto'
                and created_at > now() - interval '7 days') then
    return;
  end if;
  perform pa_snapshot(p_room, 'auto');
end;
$$;

revoke all on function pa_maybe_backup(uuid) from public;


-- pa_bump (0200) läuft bei jeder Änderung im Raum — genau der Takt,
-- den das Backup braucht („ist jemand da?"). Gegenüber 0200 neu ist
-- nur der Aufruf von pa_maybe_backup.
create or replace function pa_bump(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  insert into pa_rooms (room_id, rev) values (p_room, 1)
  on conflict (room_id) do update set rev = pa_rooms.rev + 1;
  perform pa_maybe_backup(p_room);
end;
$$;

revoke all on function pa_bump(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 5) Schreiben — Stundeneinträge für mehrere Personen
-- ─────────────────────────────────────────────────────────────
-- Gegenüber 0201 neu: alles, was 'log' betrifft (who, whoNames, wer
-- ändern darf).
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


-- ─────────────────────────────────────────────────────────────
-- 6) Einspielen (gemeinsamer Kern für Import und Backup)
-- ─────────────────────────────────────────────────────────────
-- p_projects: [ { group, name, items: [ {kind, id, data}, … ] }, … ]
-- p_target:   Planungsraum, dessen Inhalt ersetzt wird (dann genau ein
--             Projekt) — oder null, siehe Kopf.
-- Wer ruft, hat Besitz und Zeilensperre auf dem Raum schon geprüft.
create or replace function pa_import_core(p_room uuid, p_projects jsonb, p_target uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_pr      jsonb;
  v_it      jsonb;
  v_kind    text;
  v_id      text;
  v_lim     int;
  v_seen    text[];
  v_tasks   int;
  v_logs    int;
  v_reqs    int;
  v_g       uuid;
  v_no      int;
  v_name    text;
  v_base    int;
  v_groups  jsonb := '[]'::jsonb;
  v_new     int := 0;
begin
  if p_projects is null or jsonb_typeof(p_projects) <> 'array'
     or jsonb_array_length(p_projects) = 0 or jsonb_array_length(p_projects) > 60
     or (p_target is not null and jsonb_array_length(p_projects) <> 1) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_target is not null and not exists (select 1 from pa_groups where id = p_target and room_id = p_room) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Erst alles prüfen, dann schreiben.
  for v_pr in select * from jsonb_array_elements(p_projects) loop
    if jsonb_typeof(v_pr) <> 'object' or jsonb_typeof(v_pr->'items') is distinct from 'array'
       or jsonb_array_length(v_pr->'items') > 2700 then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    v_seen := '{}'; v_tasks := 0; v_logs := 0; v_reqs := 0;
    for v_it in select * from jsonb_array_elements(v_pr->'items') loop
      v_kind := v_it->>'kind';
      v_id   := v_it->>'id';
      if coalesce(v_kind, '') not in ('goal', 'task', 'log', 'request')
         or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,40}$'
         or jsonb_typeof(v_it->'data') is distinct from 'object'
         or (v_kind || ':' || v_id) = any (v_seen)
         or (v_kind = 'goal' and v_id <> 'main') then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
      v_seen := v_seen || (v_kind || ':' || v_id);
      v_lim := case v_kind when 'goal' then 1500000 else 24000 end;
      if octet_length((v_it->'data')::text) > v_lim then
        return jsonb_build_object('ok', false, 'error', 'payload_too_big', 'kind', v_kind, 'id', v_id);
      end if;
      if v_kind = 'request' and coalesce(v_it->'data'->>'status', 'open') not in ('open', 'approved', 'rejected') then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
      if v_kind = 'task'    then v_tasks := v_tasks + 1; end if;
      if v_kind = 'log'     then v_logs  := v_logs  + 1; end if;
      if v_kind = 'request' then v_reqs  := v_reqs  + 1; end if;
    end loop;
    if v_tasks > 300 or v_logs > 2000 or v_reqs > 300 then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
    end if;
  end loop;

  perform pa_snapshot(p_room, 'vorher');

  for v_pr in select * from jsonb_array_elements(p_projects) loop
    v_g := p_target;
    if v_g is null and coalesce(v_pr->>'group', '') ~ '^[0-9a-fA-F-]{36}$' then
      select id into v_g from pa_groups where id = (v_pr->>'group')::uuid and room_id = p_room;
    end if;
    if v_g is null then
      -- Die Gruppe gibt es (hier) nicht: neue Gruppe, Planungsraum offen,
      -- noch ohne Mitglieder — die Lehrkraft zieht sie hinein.
      v_name := left(btrim(coalesce(v_pr->>'name', '')), 40);
      if v_name <> '' and contains_blacklisted_word(v_name) then v_name := ''; end if;
      insert into pa_rooms (room_id) values (p_room) on conflict do nothing;
      update pa_rooms set seq_group = seq_group + 1 where room_id = p_room returning seq_group into v_no;
      insert into pa_groups (room_id, no, name, plan_open)
      values (p_room, v_no, coalesce(nullif(v_name, ''), 'Gruppe ' || v_no), true)
      returning id into v_g;
      v_new := v_new + 1;
    else
      update pa_groups set plan_open = true where id = v_g;
    end if;

    select coalesce(max(version), 0) + 1 into v_base from pa_items where group_id = v_g;
    delete from pa_items where group_id = v_g;
    insert into pa_items (room_id, group_id, kind, item_id, data, version, updated_at, updated_by)
    select p_room, v_g, e->>'kind', e->>'id', e->'data', v_base, now(), null
      from jsonb_array_elements(v_pr->'items') e;
    v_groups := v_groups || to_jsonb(v_g);
  end loop;

  perform pa_bump(p_room);
  perform skill_touch(p_room);
  return jsonb_build_object('ok', true, 'groups', v_groups, 'created', v_new);
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
end;
$$;

revoke all on function pa_import_core(uuid, jsonb, uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 7) Lehrkraft: Export, Import, Backups
-- ─────────────────────────────────────────────────────────────
-- p_group null = die ganze Klasse, sonst nur dieser Planungsraum.
create or replace function pa_room_export(p_code text, p_group uuid default null)
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
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_group is not null and not exists (select 1 from pa_groups where id = p_group and room_id = v_room.id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'data', pa_export_json(v_room.id, p_group));
end;
$$;

revoke all on function pa_room_export(text, uuid) from public;
grant execute on function pa_room_export(text, uuid) to authenticated;


create or replace function pa_room_import(p_code text, p_projects jsonb, p_target uuid default null)
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
  return pa_import_core(v_room.id, p_projects, p_target);
end;
$$;

revoke all on function pa_room_import(text, jsonb, uuid) from public;
grant execute on function pa_room_import(text, jsonb, uuid) to authenticated;


-- Die Backups des Raums, neueste zuerst (ohne Inhalt).
create or replace function pa_room_backups(p_code text)
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
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'backups', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'at', b.created_at, 'kind', b.kind,
             'projects', b.projects, 'items', b.items) order by b.created_at desc)
      from pa_backups b where b.room_id = v_room.id), '[]'::jsonb));
end;
$$;

revoke all on function pa_room_backups(text) from public;
grant execute on function pa_room_backups(text) to authenticated;


-- Ein Backup mit Inhalt (zum Herunterladen).
create or replace function pa_room_backup_get(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_b    pa_backups;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from pa_backups where id = p_id and room_id = v_room.id;
  if v_b.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'at', v_b.created_at, 'kind', v_b.kind, 'data', v_b.data);
end;
$$;

revoke all on function pa_room_backup_get(text, uuid) from public;
grant execute on function pa_room_backup_get(text, uuid) to authenticated;


-- Ein Backup einspielen — auf dem Server, damit der (mit Bildern
-- große) Inhalt nicht erst über das WLAN zum Gerät und zurück muss.
-- p_group: nur dieses eine Projekt aus dem Backup zurückholen (in
-- seine Gruppe); null = alle Projekte des Backups.
create or replace function pa_room_backup_restore(p_code text, p_id uuid, p_group uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_b    pa_backups;
  v_pr   jsonb;
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
  select * into v_b from pa_backups where id = p_id and room_id = v_room.id;
  if v_b.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_pr := v_b.data->'projects';
  if p_group is not null then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_pr
      from jsonb_array_elements(v_b.data->'projects') x where x->>'group' = p_group::text;
    if jsonb_array_length(v_pr) = 0 then
      return jsonb_build_object('ok', false, 'error', 'not_in_backup');
    end if;
  end if;
  return pa_import_core(v_room.id, v_pr, null);
end;
$$;

revoke all on function pa_room_backup_restore(text, uuid, uuid) from public;
grant execute on function pa_room_backup_restore(text, uuid, uuid) to authenticated;
