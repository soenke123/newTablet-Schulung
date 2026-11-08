-- ══════════════════════════════════════════════════════════════
-- Migration 0280 — YourSozialNet: SQL-Befehle speichern und teilen
-- ══════════════════════════════════════════════════════════════
-- Im Adminbereich (Reiter SQL) steht neben „Ausführen“ der Knopf
-- „Befehl speichern“: Aufgabe (z. B. „Aufgabe 1b“) + der SQL-Befehl.
-- Daneben öffnet ein Symbol die gespeicherten Befehle (bearbeiten,
-- löschen, per Drag & Drop sortieren). Ergebnissicherung für die Klasse.
--
--   - Wem gehört ein Befehl? Der Lehrkraft (teacher_id, je Raum) bzw.
--     dem angemeldeten Konto im Netzwerk (hub_id + user_id). Am Konto,
--     nicht am Gerät: Schulgeräte vergessen den Teilnehmer nach 3 h,
--     das Konto bleibt (anderes Tablet = anmelden, Befehle sind da).
--   - Teilen: Schüler schicken einen Befehl an die Lehrkraft. Die
--     bekommt eine KOPIE in den Posteingang des Raums (sh_cmd_inbox,
--     „Aufgabe 1b von Mia“), nichts bleibt verknüpft. Alle Lehrkräfte
--     des Raums sehen ihn und dürfen ihn löschen.
--   - Das SQL läuft nie auf dem Server – es ist nur Text.
--   - Grenzen: 200 Befehle je Besitzer, 300 im Posteingang je Raum,
--     Aufgabe ≤ 60 Zeichen (Blacklist), Befehl ≤ 4000 Zeichen.
--
-- Prüfstand: supabase/tests/0280_yoursozialnet_befehle.mjs
-- ══════════════════════════════════════════════════════════════

create table if not exists sh_cmds (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references skill_rooms(id) on delete cascade,
  teacher_id  uuid,
  hub_id      uuid references sh_hubs(id) on delete cascade,
  user_id     int,
  pos         int  not null default 0,
  task        text not null default '',
  sql         text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (hub_id, user_id) references sh_users(hub_id, id) on delete cascade,
  constraint sh_cmds_owner check ((teacher_id is not null) <> (hub_id is not null and user_id is not null)),
  constraint sh_cmds_task  check (char_length(task) <= 60),
  constraint sh_cmds_sql   check (char_length(sql) between 1 and 4000)
);
create index if not exists sh_cmds_teacher on sh_cmds (room_id, teacher_id, pos);
create index if not exists sh_cmds_user    on sh_cmds (hub_id, user_id, pos);
alter table sh_cmds enable row level security;

create table if not exists sh_cmd_inbox (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references skill_rooms(id) on delete cascade,
  from_name   text not null default '',
  username    text not null default '',
  hub_name    text not null default '',
  task        text not null default '',
  sql         text not null,
  created_at  timestamptz not null default now(),
  constraint sh_cmd_inbox_task check (char_length(task) <= 60),
  constraint sh_cmd_inbox_sql  check (char_length(sql) between 1 and 4000)
);
create index if not exists sh_cmd_inbox_room on sh_cmd_inbox (room_id, created_at);
alter table sh_cmd_inbox enable row level security;

comment on table sh_cmds is 'YourSozialNet: gespeicherte SQL-Befehle (Lehrkraft je Raum oder Konto im Netzwerk). Nur über sh_cmd_*.';
comment on table sh_cmd_inbox is 'YourSozialNet: von Schülern geteilte Befehle = Kopien für die Lehrkräfte des Raums. Nur über sh_cmd_*.';


-- Wer bin ich hier? Besitzer-Schlüssel aus sh_access.
create or replace function sh_cmd_who(
  p_token text, p_code text, p_hub uuid, p_session text,
  out r_room uuid, out r_teacher uuid, out r_hub uuid, out r_user int, out r_part uuid, out err text)
  security definer
  set search_path = public
  language plpgsql
  volatile
as $$
declare
  a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then err := a.err; return; end if;
  r_room := a.r_room; r_part := a.r_part;
  if a.r_teacher then r_teacher := a.r_tuid; return; end if;
  if a.r_user is null then err := 'not_logged_in'; return; end if;
  r_hub := p_hub; r_user := a.r_user;
end;
$$;
revoke all on function sh_cmd_who(text, text, uuid, text) from public, anon, authenticated;


create or replace function sh_cmd_json(c sh_cmds)
  returns jsonb
  language sql
  immutable
as $$ select jsonb_build_object('id', c.id, 'task', c.task, 'sql', c.sql); $$;
revoke all on function sh_cmd_json(sh_cmds) from public, anon, authenticated;


-- Liste: eigene Befehle; die Lehrkraft dazu den Posteingang
create or replace function sh_cmd_list(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
as $$
declare
  w record;
  v_own jsonb;
  v_in  jsonb;
begin
  select * into w from sh_cmd_who(p_token, p_code, p_hub, p_session);
  if w.err is not null then return sh_err(w.err); end if;
  select coalesce(jsonb_agg(sh_cmd_json(c) order by c.pos, c.id), '[]') into v_own
    from sh_cmds c
   where c.room_id = w.r_room
     and (case when w.r_teacher is not null then c.teacher_id = w.r_teacher
               else c.hub_id = w.r_hub and c.user_id = w.r_user end);
  if w.r_teacher is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'task', i.task, 'sql', i.sql, 'from', i.from_name,
                                                  'username', i.username, 'hub', i.hub_name,
                                                  'at', to_char(i.created_at, 'DD.MM. HH24:MI'))
                              order by i.created_at desc, i.id desc), '[]') into v_in
      from sh_cmd_inbox i where i.room_id = w.r_room;
  end if;
  return jsonb_build_object('ok', true, 'teacher', w.r_teacher is not null, 'own', v_own, 'inbox', v_in);
end;
$$;
revoke all on function sh_cmd_list(text, text, uuid, text) from public;
grant execute on function sh_cmd_list(text, text, uuid, text) to anon, authenticated;


-- Speichern: p_id null = neu (ans Ende), sonst ändern
create or replace function sh_cmd_save(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id bigint default null, p_task text default null, p_sql text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  w     record;
  c     sh_cmds;
  v_t   text := btrim(coalesce(p_task, ''));
  v_s   text := btrim(coalesce(p_sql, ''), E' \t\r\n');
  v_n   int;
  v_pos int;
begin
  select * into w from sh_cmd_who(p_token, p_code, p_hub, p_session);
  if w.err is not null then return sh_err(w.err); end if;
  if char_length(v_t) > 60 or v_s = '' or char_length(v_s) > 4000 or v_t ~ '[\x00-\x1f]' then return sh_err('invalid_input'); end if;
  if v_t <> '' and contains_blacklisted_text(v_t) then return sh_err('blacklisted'); end if;
  if p_id is null then
    select count(*), coalesce(max(pos), 0) into v_n, v_pos from sh_cmds x
     where x.room_id = w.r_room
       and (case when w.r_teacher is not null then x.teacher_id = w.r_teacher
                 else x.hub_id = w.r_hub and x.user_id = w.r_user end);
    if v_n >= 200 then return sh_err('quota_exceeded'); end if;
    insert into sh_cmds (room_id, teacher_id, hub_id, user_id, pos, task, sql)
    values (w.r_room, w.r_teacher, w.r_hub, w.r_user, v_pos + 1, v_t, v_s)
    returning * into c;
  else
    update sh_cmds x set task = v_t, sql = v_s, updated_at = now()
     where x.id = p_id and x.room_id = w.r_room
       and (case when w.r_teacher is not null then x.teacher_id = w.r_teacher
                 else x.hub_id = w.r_hub and x.user_id = w.r_user end)
    returning * into c;
    if c.id is null then return sh_err('not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'item', sh_cmd_json(c));
end;
$$;
revoke all on function sh_cmd_save(text, text, uuid, text, bigint, text, text) from public;
grant execute on function sh_cmd_save(text, text, uuid, text, bigint, text, text) to anon, authenticated;


create or replace function sh_cmd_delete(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id bigint default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  w record;
begin
  select * into w from sh_cmd_who(p_token, p_code, p_hub, p_session);
  if w.err is not null then return sh_err(w.err); end if;
  delete from sh_cmds x
   where x.id = p_id and x.room_id = w.r_room
     and (case when w.r_teacher is not null then x.teacher_id = w.r_teacher
               else x.hub_id = w.r_hub and x.user_id = w.r_user end);
  if not found then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_cmd_delete(text, text, uuid, text, bigint) from public;
grant execute on function sh_cmd_delete(text, text, uuid, text, bigint) to anon, authenticated;


-- Reihenfolge (Drag & Drop): p_ids = alle eigenen ids in neuer Reihenfolge;
-- fremde ids werden still übergangen
create or replace function sh_cmd_order(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_ids jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  w record;
begin
  select * into w from sh_cmd_who(p_token, p_code, p_hub, p_session);
  if w.err is not null then return sh_err(w.err); end if;
  if jsonb_typeof(p_ids) is distinct from 'array' or jsonb_array_length(p_ids) > 200 then return sh_err('invalid_input'); end if;
  if exists (select 1 from jsonb_array_elements(p_ids) e where jsonb_typeof(e) <> 'number') then return sh_err('invalid_input'); end if;
  update sh_cmds x set pos = o.n
    from (select (e.v)::text::bigint as id, e.n::int as n from jsonb_array_elements(p_ids) with ordinality e(v, n)) o
   where x.id = o.id and x.room_id = w.r_room
     and (case when w.r_teacher is not null then x.teacher_id = w.r_teacher
               else x.hub_id = w.r_hub and x.user_id = w.r_user end);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_cmd_order(text, text, uuid, text, jsonb) from public;
grant execute on function sh_cmd_order(text, text, uuid, text, jsonb) to anon, authenticated;


-- Teilen: Kopie eines eigenen Befehls in den Posteingang der Lehrkräfte
create or replace function sh_cmd_share(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id bigint default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  w      record;
  c      sh_cmds;
  u      sh_users;
  v_name text;
  v_hub  text;
begin
  select * into w from sh_cmd_who(p_token, p_code, p_hub, p_session);
  if w.err is not null then return sh_err(w.err); end if;
  if w.r_teacher is not null then return sh_err('forbidden'); end if;
  select * into c from sh_cmds x where x.id = p_id and x.room_id = w.r_room and x.hub_id = w.r_hub and x.user_id = w.r_user;
  if c.id is null then return sh_err('not_found'); end if;
  if (select count(*) from sh_cmd_inbox i where i.room_id = w.r_room) >= 300 then return sh_err('inbox_full'); end if;
  select * into u from sh_users where hub_id = w.r_hub and id = w.r_user;
  select h.name into v_hub from sh_hubs h where h.id = w.r_hub;
  -- Name wie beim Beitreten („Mia“), sonst der Name im Netzwerk
  select coalesce(nullif(btrim(p.name), ''), nullif(btrim(u.name), ''), u.username) into v_name
    from (select 1) z left join skill_participants p on p.id = coalesce(w.r_part, u.participant_id);
  insert into sh_cmd_inbox (room_id, from_name, username, hub_name, task, sql)
  values (w.r_room, left(coalesce(v_name, ''), 60), coalesce(u.username, ''), left(coalesce(v_hub, ''), 60), c.task, c.sql);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_cmd_share(text, text, uuid, text, bigint) from public;
grant execute on function sh_cmd_share(text, text, uuid, text, bigint) to anon, authenticated;


-- Posteingang aufräumen (nur Lehrkräfte des Raums); p_id null = alle
create or replace function sh_cmd_inbox_delete(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id bigint default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  w   record;
  v_n int;
begin
  select * into w from sh_cmd_who(p_token, p_code, p_hub, p_session);
  if w.err is not null then return sh_err(w.err); end if;
  if w.r_teacher is null then return sh_err('forbidden'); end if;
  delete from sh_cmd_inbox i where i.room_id = w.r_room and (p_id is null or i.id = p_id);
  get diagnostics v_n = row_count;
  if p_id is not null and v_n = 0 then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true, 'deleted', v_n);
end;
$$;
revoke all on function sh_cmd_inbox_delete(text, text, uuid, text, bigint) from public;
grant execute on function sh_cmd_inbox_delete(text, text, uuid, text, bigint) to anon, authenticated;
