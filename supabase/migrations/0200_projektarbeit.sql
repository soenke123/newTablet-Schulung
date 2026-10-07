-- ══════════════════════════════════════════════════════════════
-- Migration 0200 — Projektarbeit (neuer MPSkill)
-- ══════════════════════════════════════════════════════════════
-- Zehnter Skill, gebaut nach dem Vorbild der Scrum Werkstatt (0196),
-- aber mit einem anderen Zuschnitt:
--
--   Scrum Werkstatt   ein Raum = EIN Team
--   Projektarbeit     ein Raum = die ganze KLASSE
--
-- Die Lehrkraft öffnet einen Raum, alle treten bei und stehen zuerst
-- in der Lobby. Die Lehrkraft zieht die Leute per Drag & Drop zu
-- Gruppen zusammen. Jede Gruppe — und jede Einzelperson — hat ein
-- Symbol, mit dem die Lehrkraft für sie einen PLANUNGSRAUM eröffnet.
-- Im Planungsraum gibt es die Reiter
--   Projektziel · Arbeit (Board) · Stunden · Anträge · Team · Regeln.
--
-- ── Tabellen ──────────────────────────────────────────────────
--   pa_rooms   je Raum: Zähler (rev = Signatur), Gruppennummer, Regeln
--   pa_groups  die Gruppen eines Raums; plan_open = Planungsraum offen.
--              Eine Einzelperson mit Planungsraum ist eine Gruppe mit
--              EINEM Mitglied und leerem Namen.
--   pa_seats   wer in welcher Gruppe ist (group_id null = Lobby) und
--              sein Label im Team
--   pa_items   der Inhalt eines Planungsraums, eine Zeile je Objekt mit
--              Versionsnummer (wie scrum_items):
--                goal     das Projektziel (id 'main')
--                task     eine Karte auf dem Board
--                log      ein Eintrag im Stundenprotokoll
--                request  ein Antrag an die Lehrkraft
--
-- ── Rechte ─────────────────────────────────────────────────────
--   Schüler   lesen und schreiben NUR im Planungsraum ihrer eigenen
--             Gruppe. Stundeneinträge und Anträge gehören dem, der sie
--             angelegt hat (by); ein entschiedener Antrag ist fest.
--             Das Projektziel ist gesperrt, wenn die Lehrkraft es
--             fixiert hat (goal.locked).
--   Lehrkraft (Raum-Besitzer) sieht alles, gruppiert, eröffnet
--             Planungsräume, entscheidet Anträge, schreibt überall mit.
--
-- ── Der persönliche Code ──────────────────────────────────────
-- Derselbe wie in der Scrum Werkstatt (skill_participants.recover_key,
-- 0196): beim ersten Öffnen bekommt jede Person einen Code aus 8
-- Zeichen und kommt damit auf jedem Gerät auf ihren Platz zurück, auch
-- bei geschlossener Tür (/api/skill_join, mode 'recover'). Eine Wahl
-- Mitglied/Beobachter gibt es hier nicht — in der Klasse arbeiten alle.
--
-- Kein DROP — Idempotenz per if not exists / create or replace
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Registry
-- ─────────────────────────────────────────────────────────────
insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room,
                         max_participants, max_rooms, limits, active, sort_order) values
  ('projekt', 'Projektarbeit',
   'Gruppenarbeit über Wochen: Gruppen bilden, Projektziel, Board, Stundenprotokoll '
   'und Anträge an die Lehrkraft — die ganze Klasse in einem Raum.',
   '🧭', 'Projektarbeit', 'Fächerübergreifend', true,
   40, 10, '{}'::jsonb, true, 85)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;


-- ─────────────────────────────────────────────────────────────
-- 2) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists pa_rooms (
  room_id   uuid primary key references skill_rooms(id) on delete cascade,
  rev       bigint not null default 0,
  seq_group int    not null default 0,
  rules     text   not null default '' check (char_length(rules) <= 6000)
);

comment on table pa_rooms is
  'Projektarbeit (0200): je Raum der Änderungszähler (Signatur), die laufende Gruppennummer '
  'und die Ergänzungen der Lehrkraft zu den Regeln.';
alter table pa_rooms enable row level security;


create table if not exists pa_groups (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  no         int  not null default 0,
  name       text not null default '' check (char_length(name) <= 40),
  plan_open  boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table pa_groups is
  'Gruppen eines Projektarbeit-Raums (0200). plan_open: die Lehrkraft hat den Planungsraum '
  'eröffnet. Leerer Name + ein Mitglied = Einzelarbeit.';
create index if not exists pa_groups_room_idx on pa_groups(room_id);
alter table pa_groups enable row level security;


create table if not exists pa_seats (
  participant_id uuid primary key references skill_participants(id) on delete cascade,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  group_id       uuid references pa_groups(id) on delete set null,
  label          text not null default '' check (char_length(label) <= 40),
  joined_at      timestamptz not null default now()
);

comment on table pa_seats is
  'Wer in einem Projektarbeit-Raum in welcher Gruppe ist (0200). group_id null = Lobby.';
create index if not exists pa_seats_room_idx on pa_seats(room_id);
create index if not exists pa_seats_group_idx on pa_seats(group_id);
alter table pa_seats enable row level security;


create table if not exists pa_items (
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  group_id   uuid not null references pa_groups(id) on delete cascade,
  kind       text not null check (kind in ('goal', 'task', 'log', 'request')),
  item_id    text not null check (item_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  data       jsonb not null,
  version    int  not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references skill_participants(id) on delete set null,
  primary key (group_id, kind, item_id)
);

comment on table pa_items is
  'Inhalt eines Planungsraums (0200), eine Zeile je Objekt: goal (main), task, log, request. '
  'version ist die Grundlage der Konfliktprüfung in pa_apply_ops.';
create index if not exists pa_items_room_idx on pa_items(room_id);
alter table pa_items enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 3) Bausteine
-- ─────────────────────────────────────────────────────────────
create or replace function pa_bump(p_room uuid)
  returns void
  security definer
  set search_path = public
  language sql
as $$
  insert into pa_rooms (room_id, rev) values (p_room, 1)
  on conflict (room_id) do update set rev = pa_rooms.rev + 1;
$$;

revoke all on function pa_bump(uuid) from public;


-- Platz anlegen, falls es ihn noch nicht gibt, und den persönlichen
-- Code vergeben. Gibt den Code zurück.
create or replace function pa_seat_ensure(p_participant uuid, p_room uuid)
  returns text
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_key text;
begin
  insert into pa_seats (participant_id, room_id) values (p_participant, p_room)
  on conflict (participant_id) do nothing;
  select recover_key into v_key from skill_participants where id = p_participant;
  if v_key is null then
    v_key := skill_gen_recover_key();
    update skill_participants set recover_key = v_key where id = p_participant;
  end if;
  return v_key;
end;
$$;

revoke all on function pa_seat_ensure(uuid, uuid) from public;


-- Der Raum, wenn der Aufrufer sein Besitzer ist — sonst eine leere
-- Zeile (id null). Für Schreibzugriffe gesperrt (for update).
create or replace function pa_owned_room(p_code text, p_lock boolean default false)
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
     where code = upper(btrim(p_code)) and owner_id = auth.uid() and tool_id = 'projekt' for update;
  else
    select * into v_room from skill_rooms
     where code = upper(btrim(p_code)) and owner_id = auth.uid() and tool_id = 'projekt';
  end if;
  return v_room;
end;
$$;

revoke all on function pa_owned_room(text, boolean) from public;


-- Prüft einen Token: null = in Ordnung, sonst der Fehlercode.
create or replace function pa_token_err(p_token text, p_write boolean)
  returns text
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then return 'unknown_token'; end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then return 'room_gone'; end if;
  if v_p.removed_at is not null then return 'removed'; end if;
  if p_write and v_p.blocked then return 'blocked'; end if;
  return null;
end;
$$;

revoke all on function pa_token_err(text, boolean) from public;


-- Eine Gruppe aufräumen, nachdem jemand sie verlassen hat. Ohne
-- Planungsraum ist eine Gruppe nur ein Zusammenschluss: mit null oder
-- einem Mitglied löst sie sich auf. Mit Planungsraum bleibt sie stehen
-- (daran hängt Arbeit), auch wenn gerade niemand drin ist.
create or replace function pa_group_tidy(p_group uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_g pa_groups;
  v_n int;
begin
  if p_group is null then return; end if;
  select * into v_g from pa_groups where id = p_group;
  if v_g.id is null or v_g.plan_open then return; end if;
  select count(*) into v_n from pa_seats s join skill_participants p on p.id = s.participant_id
   where s.group_id = p_group and p.removed_at is null;
  if v_n <= 1 then
    update pa_seats set group_id = null where group_id = p_group;
    delete from pa_groups where id = p_group;
  end if;
end;
$$;

revoke all on function pa_group_tidy(uuid) from public;


-- Mitglieder einer Gruppe als Liste. p_keys: mit persönlichen Codes
-- (nur Lehrkraft), p_me: der fragende Teilnehmer.
create or replace function pa_members_json(p_group uuid, p_me uuid, p_keys boolean)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',     p.id,
           'name',   skill_seat_name(p.name, p.seat),
           'label',  s.label,
           'online', p.last_seen_at > now() - interval '90 seconds',
           'me',     p.id is not distinct from p_me)
         || case when p_keys then jsonb_build_object('key', p.recover_key) else '{}'::jsonb end
         order by s.joined_at, p.seat), '[]'::jsonb)
    from pa_seats s join skill_participants p on p.id = s.participant_id
   where s.group_id = p_group and p.removed_at is null;
$$;

revoke all on function pa_members_json(uuid, uuid, boolean) from public;


-- Kopf einer Gruppe (ohne Inhalt).
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
           'members',   pa_members_json(g.id, p_me, p_keys))
    from pa_groups g where g.id = p_group;
$$;

revoke all on function pa_group_json(uuid, uuid, boolean) from public;


-- Inhalt eines Planungsraums. p_have: { "task:t3": 4, … } — für alles,
-- was das Gerät in dieser Version schon hat, kommt nur {kind,id,v}.
-- Die Bilder im Projektziel wandern so nur einmal über das WLAN.
create or replace function pa_items_json(p_group uuid, p_have jsonb)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(
           case when (case when jsonb_typeof(p_have) = 'object' then p_have else '{}'::jsonb end
                       ->> (i.kind || ':' || i.item_id)) = i.version::text
                then jsonb_build_object('kind', i.kind, 'id', i.item_id, 'v', i.version)
                else jsonb_build_object('kind', i.kind, 'id', i.item_id, 'v', i.version, 'data', i.data)
           end order by i.kind, i.item_id), '[]'::jsonb)
    from pa_items i where i.group_id = p_group;
$$;

revoke all on function pa_items_json(uuid, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 4) Schreiben (gemeinsamer Kern für Schüler und Lehrkraft)
-- ─────────────────────────────────────────────────────────────
-- p_ops: [ { "op": "put" | "del", "kind": "task", "id": "t3",
--            "v": 4, "data": { … } }, … ]
-- v ist die Version, die das Gerät zuletzt gesehen hat; 0 heißt „neu".
-- Passt auch nur eine nicht, wird NICHTS geschrieben ('conflict').
-- p_actor: der schreibende Teilnehmer, null = Lehrkraft. Wer ruft, hat
-- Zugriff und die Zeilensperre auf dem Raum schon geprüft.
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
      if v_kind in ('log', 'request') and v_cur.item_id is not null
         and v_cur.data->>'by' is distinct from p_actor::text then
        return jsonb_build_object('ok', false, 'error', 'not_yours');
      end if;
      if v_kind = 'request' and v_cur.item_id is not null
         and coalesce(v_cur.data->>'status', 'open') <> 'open' then
        return jsonb_build_object('ok', false, 'error', 'decided');
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
        v_data := (v_data - 'decision' - 'decidedAt')
               || jsonb_build_object('by', p_actor, 'byName', v_name, 'status', 'open');
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
end;
$$;

revoke all on function pa_apply_ops(uuid, uuid, uuid, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 5) Schüler
-- ─────────────────────────────────────────────────────────────
-- Signatur: ändert sich bei jeder Schreibaktion (rev), wenn jemand den
-- Raum betritt oder verlässt, die Tür auf- oder zugeht und um
-- Mitternacht (der Stundenzettel zeigt „heute").
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
    (now() at time zone 'Europe/Berlin')::date::text);
end;
$$;

revoke all on function pa_sig(text) from public;
grant execute on function pa_sig(text) to anon, authenticated;


create or replace function pa_view(p_token text, p_have jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_err  text := pa_token_err(p_token, false);
  v_p    skill_participants;
  v_room skill_rooms;
  v_s    pa_seats;
  v_g    pa_groups;
  v_key  text;
  v_pr   pa_rooms;
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  select * into v_p from skill_participants where token = p_token;
  select * into v_room from skill_rooms where id = v_p.room_id;

  -- Beim ersten Öffnen: Platz in der Lobby und persönlicher Code.
  v_key := pa_seat_ensure(v_p.id, v_room.id);
  select * into v_s from pa_seats where participant_id = v_p.id;
  if v_s.group_id is not null then
    select * into v_g from pa_groups where id = v_s.group_id;
  end if;
  select * into v_pr from pa_rooms where room_id = v_room.id;

  return jsonb_build_object(
    'ok',    true,
    'role',  'participant',
    'rev',   coalesce(v_pr.rev, 0),
    'room',  jsonb_build_object('title', v_room.title, 'join_open', v_room.join_open,
                                'rules', coalesce(v_pr.rules, '')),
    'me',    jsonb_build_object('id', v_p.id, 'name', skill_seat_name(v_p.name, v_p.seat),
                                'key', v_key, 'blocked', v_p.blocked, 'group', v_s.group_id),
    'group', case when v_g.id is not null then pa_group_json(v_g.id, v_p.id, false) end,
    -- Den Inhalt gibt es erst, wenn die Lehrkraft den Planungsraum
    -- eröffnet hat.
    'items', case when v_g.plan_open then pa_items_json(v_g.id, p_have) else '[]'::jsonb end
  );
end;
$$;

revoke all on function pa_view(text, jsonb) from public;
grant execute on function pa_view(text, jsonb) to anon, authenticated;


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
  return pa_apply_ops(v_room.id, v_g.id, v_p.id, p_ops);
end;
$$;

revoke all on function pa_save(text, jsonb) from public;
grant execute on function pa_save(text, jsonb) to anon, authenticated;


-- Label einer Teamkarte. Jedes Mitglied darf jede Karte seiner Gruppe
-- ändern — die Gruppe organisiert sich selbst.
create or replace function pa_apply_label(p_room uuid, p_target uuid, p_label text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_lbl text := btrim(coalesce(p_label, ''));
begin
  if char_length(v_lbl) > 40 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if v_lbl <> '' and contains_blacklisted_word(v_lbl) then
    return jsonb_build_object('ok', false, 'error', 'text_blocked');
  end if;
  update pa_seats set label = v_lbl where participant_id = p_target and room_id = p_room;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform pa_bump(p_room);
  perform skill_touch(p_room);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_apply_label(uuid, uuid, text) from public;


create or replace function pa_member_update(p_token text, p_participant uuid, p_label text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_err text := pa_token_err(p_token, true);
  v_p   skill_participants;
  v_me  pa_seats;
  v_t   pa_seats;
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  select * into v_p from skill_participants where token = p_token;
  select * into v_me from pa_seats where participant_id = v_p.id;
  select * into v_t  from pa_seats where participant_id = p_participant;
  if v_me.group_id is null or v_t.group_id is distinct from v_me.group_id then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return pa_apply_label(v_p.room_id, p_participant, p_label);
end;
$$;

revoke all on function pa_member_update(text, uuid, text) from public;
grant execute on function pa_member_update(text, uuid, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) Lehrkraft
-- ─────────────────────────────────────────────────────────────
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
    (now() at time zone 'Europe/Berlin')::date::text);
end;
$$;

revoke all on function pa_room_sig(text) from public;
grant execute on function pa_room_sig(text) to authenticated;


-- Übersicht: alle Personen (mit Gruppe und Code), alle Gruppen mit
-- Kennzahlen — darunter die offenen Anträge, die als rote Zahl an der
-- Gruppe stehen. Mit p_group zusätzlich Kopf und Inhalt dieses
-- Planungsraums.
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


-- Drag & Drop in der Übersicht. Person p_participant wird gezogen …
--   … auf eine Gruppe (p_group)            → in diese Gruppe
--   … auf eine andere Person (p_with)      → zu deren Gruppe; steht die
--                                            noch allein, entsteht eine neue
--   … in die Lobby (beide null)            → aus der Gruppe heraus
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
    -- Eine Einzelarbeit (no = 0), zu der jemand dazukommt, wird zur
    -- Gruppe mit Nummer und Namen.
    if exists (select 1 from pa_groups where id = v_target and name = '' and no = 0) then
      insert into pa_rooms (room_id) values (v_room.id) on conflict do nothing;
      update pa_rooms set seq_group = seq_group + 1 where room_id = v_room.id returning seq_group into v_no;
      update pa_groups set no = v_no, name = 'Gruppe ' || v_no where id = v_target;
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


-- Planungsraum eröffnen: für eine Gruppe (p_group) oder eine
-- Einzelperson (p_participant). Steht die Person in einer Gruppe, wird
-- deren Planungsraum eröffnet; sonst entsteht eine Einzelarbeit
-- (Gruppe mit einem Mitglied, ohne Namen und ohne Nummer).
create or replace function pa_room_plan(p_code text, p_group uuid default null, p_participant uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_g    uuid := p_group;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_g is null and p_participant is not null then
    if not exists (select 1 from skill_participants
                    where id = p_participant and room_id = v_room.id and removed_at is null) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform pa_seat_ensure(p_participant, v_room.id);
    select group_id into v_g from pa_seats where participant_id = p_participant;
    if v_g is null then
      insert into pa_groups (room_id, no, name, plan_open) values (v_room.id, 0, '', true)
      returning id into v_g;
      update pa_seats set group_id = v_g where participant_id = p_participant;
    end if;
  end if;
  if v_g is null or not exists (select 1 from pa_groups where id = v_g and room_id = v_room.id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update pa_groups set plan_open = true where id = v_g;
  perform pa_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'group', v_g);
end;
$$;

revoke all on function pa_room_plan(text, uuid, uuid) from public;
grant execute on function pa_room_plan(text, uuid, uuid) to authenticated;


-- Gruppe umbenennen.
create or replace function pa_room_group_rename(p_code text, p_group uuid, p_name text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_nm   text := btrim(coalesce(p_name, ''));
begin
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if char_length(v_nm) > 40 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if v_nm <> '' and contains_blacklisted_word(v_nm) then
    return jsonb_build_object('ok', false, 'error', 'text_blocked');
  end if;
  update pa_groups set name = v_nm where id = p_group and room_id = v_room.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform pa_bump(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_room_group_rename(text, uuid, text) from public;
grant execute on function pa_room_group_rename(text, uuid, text) to authenticated;


-- Gruppe auflösen: alle zurück in die Lobby, der Planungsraum mit
-- seinem ganzen Inhalt ist weg (pa_items hängt per cascade daran).
create or replace function pa_room_group_delete(p_code text, p_group uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update pa_seats set group_id = null where group_id = p_group and room_id = v_room.id;
  delete from pa_groups where id = p_group and room_id = v_room.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform pa_bump(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_room_group_delete(text, uuid) from public;
grant execute on function pa_room_group_delete(text, uuid) to authenticated;


-- Im Planungsraum schreiben — wie pa_save, nur für den Besitzer.
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
  return pa_apply_ops(v_room.id, p_group, null, p_ops);
end;
$$;

revoke all on function pa_room_save(text, uuid, jsonb) from public;
grant execute on function pa_room_save(text, uuid, jsonb) to authenticated;


create or replace function pa_room_member_update(p_code text, p_participant uuid, p_label text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return pa_apply_label(v_room.id, p_participant, p_label);
end;
$$;

revoke all on function pa_room_member_update(text, uuid, text) from public;
grant execute on function pa_room_member_update(text, uuid, text) to authenticated;


-- Neuer persönlicher Code für eine Person: der alte gilt ab sofort nicht mehr.
create or replace function pa_room_rekey(p_code text, p_participant uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_key  text;
begin
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from skill_participants where id = p_participant and room_id = v_room.id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_key := skill_gen_recover_key();
  update skill_participants set recover_key = v_key where id = p_participant;
  perform pa_seat_ensure(p_participant, v_room.id);
  perform pa_bump(v_room.id);
  return jsonb_build_object('ok', true, 'key', v_key);
end;
$$;

revoke all on function pa_room_rekey(text, uuid) from public;
grant execute on function pa_room_rekey(text, uuid) to authenticated;


-- Ergänzungen der Lehrkraft zu den Regeln (Reiter „Regeln").
create or replace function pa_room_rules(p_code text, p_rules text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_txt  text := btrim(coalesce(p_rules, ''));
begin
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if char_length(v_txt) > 6000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  insert into pa_rooms (room_id, rules) values (v_room.id, v_txt)
  on conflict (room_id) do update set rules = excluded.rules;
  perform pa_bump(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_room_rules(text, text) from public;
grant execute on function pa_room_rules(text, text) to authenticated;
