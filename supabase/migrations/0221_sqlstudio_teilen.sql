-- ══════════════════════════════════════════════════════════════
-- Migration 0221 — SQL Studio, Etappe 2: Teilen, Rechte, Kopien
-- ══════════════════════════════════════════════════════════════
-- Etappe 1 (0220) hielt alles im Gerät. Jetzt:
--
--   1) Eigene Datenbanken der Lehrkraft auf dem Server
--      (sql_databases). Sie hängen an der Person, nicht am Raum — wie
--      synir_scenarios (0180) — und stehen in jedem ihrer Räume.
--
--   2) Teilen und Entziehen über den Raumzustand (keine eigene
--      Tabelle, skill_room_set_state aus 0080):
--
--        skill_room_state.data = {
--          "shared": [ { "id": "builtin:schule", "t": "Schule",  "r": "use" },
--                      { "id": "<uuid>",         "t": "Kino",    "r": "modify" } ],
--          "create": false }
--
--      id     builtin:<vorlage> (die Vorlage baut das Tablet selbst
--             aus tools/SQLStudio/data/<vorlage>.sql) oder die uuid
--             einer Datenbank aus sql_databases
--      t      Name in der Liste der Klasse
--      r      Recht: use (nur SELECT/INSERT/UPDATE/DELETE) oder modify
--             (zusätzlich Struktur ändern)
--      create Schüler dürfen eigene Datenbanken anlegen
--
--   3) Die Kopie jeder Person (sql_work): eine Zeile je Teilnehmer und
--      Datenbank, angelegt bei der ersten Änderung, überschrieben bei
--      jeder weiteren. Eigene Datenbanken der Schüler stehen dort mit
--      dem Schlüssel own:<zufall>. Die Zeilen gehen mit dem Raum (bzw.
--      dem Teilnehmer) — ON DELETE CASCADE, also auch in skill_cleanup.
--
-- ── Was der Server prüft und was nicht ────────────────────────
-- Er prüft, WER was speichern und holen darf: speichern nur, solange
-- die Datenbank in diesem Raum geteilt ist (bzw. „create" an ist für
-- own:…); eine Datenbank der Lehrkraft holen nur, wenn sie geteilt ist
-- UND einer Lehrkraft dieses Raums gehört.
-- Er prüft NICHT, was in einer Kopie steht: das SQL läuft im Browser,
-- der Server sieht nur die fertige SQLite-Datei. Das Recht use/modify
-- setzt die App durch (js/core.js). Wer das umgeht, verändert nur
-- seine eigene Kopie — die Vorlage und die anderen bleiben unberührt.
--
-- Inhalte gehen als Base64 über die Leitung (p_content) und liegen als
-- bytea. Deckel 1,5 MB je Datenbank — die größte Vorlage hat ~150 KB.
--
-- Nur RPCs (security definer), keine Grants auf die Tabellen (siehe
-- CLAUDE.md, NEUE TABELLE). Kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists sql_databases (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  content     bytea not null,
  layout      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sql_databases_name_fmt check (name ~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$'),
  constraint sql_databases_size     check (octet_length(content) <= 1572864),
  constraint sql_databases_layout   check (layout is null or octet_length(layout::text) <= 20000)
);

comment on table sql_databases is
  'Eigene SQL-Studio-Datenbanken einer Lehrkraft (SQLite-Datei als bytea). Überleben den Raum. '
  'Die Vorlagen stehen im Code (tools/SQLStudio/data), nicht hier. Seit 0221.';

create unique index if not exists sql_databases_owner_name_uq on sql_databases(owner_id, lower(name));

alter table sql_databases enable row level security;


create table if not exists sql_work (
  participant_id uuid not null references skill_participants(id) on delete cascade,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  key            text not null,
  name           text not null,
  content        bytea not null,
  updated_at     timestamptz not null default now(),
  primary key (participant_id, key),
  constraint sql_work_key_fmt check (key ~ '^(builtin:[a-z0-9_]{1,30}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|own:[a-z0-9]{6,24})$'),
  constraint sql_work_name_len check (char_length(name) between 1 and 80),
  constraint sql_work_size     check (octet_length(content) <= 1572864)
);

comment on table sql_work is
  'Kopie einer Person in einem SQL-Studio-Raum: eine geteilte Datenbank (key = builtin:… bzw. uuid) '
  'oder eine eigene (own:…). Geht mit Raum und Teilnehmer. Seit 0221.';

create index if not exists sql_work_room_idx on sql_work(room_id);

alter table sql_work enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer
-- ─────────────────────────────────────────────────────────────
-- Teilnehmer aus dem Token, mit allen Sperren. err ist null, wenn
-- alles passt.
create or replace function sql_part(
  p_token text,
  out p    skill_participants,
  out room skill_rooms,
  out err  text)
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
begin
  select * into p from skill_participants where token = p_token;
  if p.id is null then err := 'unknown_token'; return; end if;
  select * into room from skill_rooms where id = p.room_id;
  if room.id is null or room.expires_at <= now() then err := 'room_gone'; return; end if;
  if room.tool_id <> 'sqlstudio' then err := 'not_found'; return; end if;
  if p.blocked then err := 'blocked'; return; end if;
end;
$$;

revoke all on function sql_part(text) from public, anon, authenticated;


-- Raum der Lehrkraft aus dem Code: Besitzer oder eingeladen (0205).
create or replace function sql_teacher_room(p_code text)
  returns skill_rooms
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms;
  v_none skill_rooms;
begin
  if auth.uid() is null then return v_none; end if;
  select * into v_room from skill_rooms
   where code = upper(btrim(coalesce(p_code, ''))) and tool_id = 'sqlstudio';
  if v_room.id is null or not skill_room_is_teacher(v_room.id, auth.uid()) then return v_none; end if;
  return v_room;
end;
$$;

revoke all on function sql_teacher_room(text) from public, anon, authenticated;


-- Der Eintrag in shared für einen Schlüssel, oder null.
create or replace function sql_shared_entry(p_room uuid, p_key text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select e
    from skill_room_state s,
         jsonb_array_elements(case when jsonb_typeof(s.data->'shared') = 'array'
                                   then s.data->'shared' else '[]'::jsonb end) e
   where s.room_id = p_room and e->>'id' = p_key
   limit 1;
$$;

revoke all on function sql_shared_entry(uuid, text) from public, anon, authenticated;


create or replace function sql_create_on(p_room uuid)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce((select (data->'create') = 'true'::jsonb from skill_room_state where room_id = p_room), false);
$$;

revoke all on function sql_create_on(uuid) from public, anon, authenticated;


-- Base64 → bytea, null bei kaputtem Text statt Abbruch.
create or replace function sql_b64(p text)
  returns bytea
  language plpgsql
  immutable
as $$
begin
  if p is null then return null; end if;
  return decode(p, 'base64');
exception when others then
  return null;
end;
$$;

revoke all on function sql_b64(text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Lehrkraft: eigene Datenbanken
-- ─────────────────────────────────────────────────────────────
-- p_code wie bei SYNIR nur, weil presenterActions.call ihn anhängt:
-- eine Datenbank gehört der Person, nicht dem Raum.

create or replace function sql_dbs_list(p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if not can_teach() then return jsonb_build_object('ok', false, 'error', 'not_a_teacher'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'size', octet_length(d.content),
                                        'updated_at', d.updated_at) order by lower(d.name))
      from sql_databases d where d.owner_id = v_user), '[]'::jsonb));
end;
$$;

revoke all on function sql_dbs_list(text) from public;
grant execute on function sql_dbs_list(text) to authenticated;


create or replace function sql_db_get(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_d    sql_databases;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_d from sql_databases where id = p_id and owner_id = v_user;
  if v_d.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'id', v_d.id, 'name', v_d.name,
                            'content', encode(v_d.content, 'base64'), 'layout', v_d.layout);
end;
$$;

revoke all on function sql_db_get(text, uuid) from public;
grant execute on function sql_db_get(text, uuid) to authenticated;


-- Anlegen (p_id null) oder ein eigenes ändern. p_content null = Inhalt
-- bleibt (nur umbenennen / Lage im Diagramm speichern). 50 je Person.
create or replace function sql_db_save(
  p_code    text,
  p_id      uuid,
  p_name    text,
  p_content text,
  p_layout  jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_bytes bytea := sql_b64(p_content);
  v_id    uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if not can_teach() then return jsonb_build_object('ok', false, 'error', 'not_a_teacher'); end if;
  if v_name !~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if p_content is not null and v_bytes is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if v_bytes is not null and octet_length(v_bytes) > 1572864 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;
  if p_layout is not null and octet_length(p_layout::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;
  if exists (select 1 from sql_databases
              where owner_id = v_user and lower(name) = lower(v_name)
                and id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;

  if p_id is not null then
    update sql_databases
       set name = v_name,
           content = coalesce(v_bytes, content),
           layout = coalesce(p_layout, layout),
           updated_at = now()
     where id = p_id and owner_id = v_user
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'created', false);
  end if;

  if v_bytes is null then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
  if (select count(*) from sql_databases where owner_id = v_user) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', 50);
  end if;
  insert into sql_databases (owner_id, name, content, layout)
  values (v_user, v_name, v_bytes, p_layout)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'created', true);
end;
$$;

revoke all on function sql_db_save(text, uuid, text, text, jsonb) from public;
grant execute on function sql_db_save(text, uuid, text, text, jsonb) to authenticated;


create or replace function sql_db_delete(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_n    int;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  delete from sql_databases where id = p_id and owner_id = v_user;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function sql_db_delete(text, uuid) from public;
grant execute on function sql_db_delete(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Teilnehmer: eine geteilte Datenbank der Lehrkraft holen
-- ─────────────────────────────────────────────────────────────
-- Zwei Bedingungen: die id steht in shared DIESES Raums, und die
-- Datenbank gehört einer Lehrkraft DIESES Raums (Besitzer oder
-- eingeladen). Ohne die zweite könnte jemand eine fremde id in die
-- Liste schreiben und sie sich ausliefern lassen.
create or replace function sql_shared_get(p_token text, p_id text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v   record;
  v_d sql_databases;
begin
  select * into v from sql_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if sql_shared_entry((v.room).id, p_id) is null then
    return jsonb_build_object('ok', false, 'error', 'not_shared');
  end if;
  if p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_d from sql_databases where id = p_id::uuid;
  if v_d.id is null or not skill_room_is_teacher((v.room).id, v_d.owner_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_d.id, 'name', v_d.name,
                            'content', encode(v_d.content, 'base64'), 'layout', v_d.layout);
end;
$$;

revoke all on function sql_shared_get(text, text) from public;
grant execute on function sql_shared_get(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Teilnehmer: die eigenen Kopien
-- ─────────────────────────────────────────────────────────────
create or replace function sql_mine_list(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v record;
begin
  select * into v from sql_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('key', w.key, 'name', w.name, 'size', octet_length(w.content),
                                        'updated_at', w.updated_at) order by w.key)
      from sql_work w where w.participant_id = (v.p).id), '[]'::jsonb));
end;
$$;

revoke all on function sql_mine_list(text) from public;
grant execute on function sql_mine_list(text) to anon, authenticated;


-- Holen geht auch nach dem Entziehen nicht mehr (die App blendet die
-- Datenbank dann aus; kommt sie wieder, ist die Arbeit noch da).
create or replace function sql_mine_get(p_token text, p_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v   record;
  v_w sql_work;
begin
  select * into v from sql_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if p_key not like 'own:%' and sql_shared_entry((v.room).id, p_key) is null then
    return jsonb_build_object('ok', false, 'error', 'not_shared');
  end if;
  select * into v_w from sql_work where participant_id = (v.p).id and key = p_key;
  if v_w.key is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'key', v_w.key, 'name', v_w.name,
                            'content', encode(v_w.content, 'base64'), 'updated_at', v_w.updated_at);
end;
$$;

revoke all on function sql_mine_get(text, text) from public;
grant execute on function sql_mine_get(text, text) to anon, authenticated;


-- Speichern: geteilte nur, solange sie geteilt sind; eigene nur, wenn
-- „create" an ist. 30 Kopien je Person.
create or replace function sql_mine_put(p_token text, p_key text, p_name text, p_content text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v       record;
  v_bytes bytea := sql_b64(p_content);
  v_name  text := btrim(coalesce(p_name, ''));
begin
  select * into v from sql_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if p_key is null or p_key !~ '^(builtin:[a-z0-9_]{1,30}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|own:[a-z0-9]{6,24})$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_key like 'own:%' then
    if not sql_create_on((v.room).id) then return jsonb_build_object('ok', false, 'error', 'create_off'); end if;
    if v_name !~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$' then return jsonb_build_object('ok', false, 'error', 'invalid_name'); end if;
  else
    if sql_shared_entry((v.room).id, p_key) is null then
      return jsonb_build_object('ok', false, 'error', 'not_shared');
    end if;
    if char_length(v_name) not between 1 and 80 then v_name := left(p_key, 80); end if;
  end if;
  if v_bytes is null then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
  if octet_length(v_bytes) > 1572864 then return jsonb_build_object('ok', false, 'error', 'payload_too_big'); end if;
  if not exists (select 1 from sql_work where participant_id = (v.p).id and key = p_key)
     and (select count(*) from sql_work where participant_id = (v.p).id) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', 30);
  end if;

  insert into sql_work (participant_id, room_id, key, name, content, updated_at)
  values ((v.p).id, (v.room).id, p_key, v_name, v_bytes, now())
  on conflict (participant_id, key) do update
    set name = excluded.name, content = excluded.content, updated_at = now();
  return jsonb_build_object('ok', true, 'updated_at', now());
end;
$$;

revoke all on function sql_mine_put(text, text, text, text) from public;
grant execute on function sql_mine_put(text, text, text, text) to anon, authenticated;


-- Kopie verwerfen („Auf Original zurücksetzen") oder eigene löschen.
create or replace function sql_mine_delete(p_token text, p_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v record;
begin
  select * into v from sql_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  delete from sql_work where participant_id = (v.p).id and key = p_key;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function sql_mine_delete(text, text) from public;
grant execute on function sql_mine_delete(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) Lehrkraft: die Kopien der Klasse
-- ─────────────────────────────────────────────────────────────
create or replace function sql_class_list(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms := sql_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'participant', p.id,
             'person',      coalesce(p.name, 'Tablet ' || p.seat),
             'seat',        p.seat,
             'key',         w.key,
             'name',        w.name,
             'size',        octet_length(w.content),
             'updated_at',  w.updated_at)
           order by p.seat, w.key)
      from sql_work w join skill_participants p on p.id = w.participant_id
     where w.room_id = v_room.id), '[]'::jsonb));
end;
$$;

revoke all on function sql_class_list(text) from public;
grant execute on function sql_class_list(text) to authenticated;


create or replace function sql_class_get(p_code text, p_participant uuid, p_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms := sql_teacher_room(p_code);
  v_w    sql_work;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_w from sql_work
   where participant_id = p_participant and key = p_key and room_id = v_room.id;
  if v_w.key is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'key', v_w.key, 'name', v_w.name,
                            'content', encode(v_w.content, 'base64'), 'updated_at', v_w.updated_at);
end;
$$;

revoke all on function sql_class_get(text, uuid, text) from public;
grant execute on function sql_class_get(text, uuid, text) to authenticated;
