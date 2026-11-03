-- ══════════════════════════════════════════════════════════════
-- Migration 0264 — Social Hub: die Lehrkraft hat einen eigenen Hub
-- ══════════════════════════════════════════════════════════════
-- Die Lehrkraft gründet im Raum ihren eigenen Hub – mit allem, was die
-- Schüler auch haben (Konto, posten, liken, folgen, kommentieren,
-- Admin-Bereich mit Datenbank). So kann sie selbst ausprobieren,
-- vorführen und mit den Hubs der Klasse vergleichen. Die Klasse sieht
-- ihn in der Liste (vorn, mit „Lehrkraft“) und kann sich registrieren.
-- Außerdem darf sich die Lehrkraft auf Schüler-Hubs ein Testkonto
-- anlegen und anmelden (bis 10 je Hub); Admin dort ist sie ohnehin.
--
-- Dafür kennt der Server neben dem Teilnehmer (Gerät) jetzt auch die
-- Lehrkraft als „Person“:
--   sh_hubs.teacher_id      Hub der Lehrkraft (statt participant_id), einer je Raum und Lehrkraft
--   sh_users.teacher_id     wer hinter dem Konto steckt (SET NULL)
--   sh_sessions.teacher_id  Anmeldung der Lehrkraft (statt participant_id)
--   sh_media.teacher_id     wer hochlud (Grenze 120 Bilder)
-- sh_ctx/sh_access liefern r_tuid (auth.uid() der Lehrkraft). Die
-- Funktionen, die bisher nur p_token kannten, bekommen p_code (alte
-- Fassungen entfallen; alle Parameter jetzt mit default null).
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (deckt 0263/0264 mit ab).
-- ══════════════════════════════════════════════════════════════

alter table sh_hubs     add column if not exists teacher_id uuid references profiles(id) on delete cascade;
alter table sh_hubs     alter column participant_id drop not null;
alter table sh_users    add column if not exists teacher_id uuid references profiles(id) on delete set null;
alter table sh_sessions add column if not exists teacher_id uuid references profiles(id) on delete cascade;
alter table sh_sessions alter column participant_id drop not null;
alter table sh_media    add column if not exists teacher_id uuid references profiles(id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sh_hubs_owner') then
    alter table sh_hubs add constraint sh_hubs_owner check (num_nonnulls(participant_id, teacher_id) = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sh_sessions_owner') then
    alter table sh_sessions add constraint sh_sessions_owner check (num_nonnulls(participant_id, teacher_id) = 1);
  end if;
end $$;
create unique index if not exists sh_hubs_teacher_uq on sh_hubs(room_id, teacher_id) where teacher_id is not null;
create index if not exists sh_users_teacher_idx on sh_users(teacher_id);
create index if not exists sh_sessions_teacher_idx on sh_sessions(teacher_id);
create index if not exists sh_media_teacher_idx on sh_media(teacher_id);


-- Rückgabe von sh_ctx/sh_access ändert sich (r_tuid) → neu anlegen.
drop function if exists sh_access(text, text, uuid, text);
drop function if exists sh_ctx(text, text);
drop function if exists sh_session_new(uuid, int, uuid);
drop function if exists sh_found(text, text, text, text, text, text);
drop function if exists sh_register(text, uuid, text, text, text, text, text, text);
drop function if exists sh_login(text, uuid, text, text);
drop function if exists sh_logout(text, uuid, text, boolean);
drop function if exists sh_me_update(text, uuid, text, text, text, text, text);
drop function if exists sh_photo_post(text, uuid, text, text, text, jsonb);
drop function if exists sh_like(text, uuid, text, int, boolean);
drop function if exists sh_follow(text, uuid, text, int, boolean);
drop function if exists sh_comment_add(text, uuid, text, int, text);
drop function if exists sh_comment_like(text, uuid, text, int, boolean);
drop function if exists sh_media_put(text, uuid, text, text, text, text);


-- Wer ruft? Lehrkraft (p_code + auth, r_tuid = ihre Konto-id) oder Teilnehmer (p_token).
create or replace function sh_ctx(
  p_token text, p_code text,
  out r_room uuid, out r_part uuid, out r_teacher boolean, out r_tuid uuid, out err text)
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_p skill_participants;
  v_r skill_rooms;
begin
  r_teacher := false;
  if p_code is not null and btrim(p_code) <> '' then
    if auth.uid() is null then err := 'not_authenticated'; return; end if;
    select * into v_r from skill_rooms where code = upper(btrim(p_code)) and tool_id = 'socialhub';
    if v_r.id is null or not skill_room_is_teacher(v_r.id, auth.uid()) then err := 'not_found'; return; end if;
    r_room := v_r.id; r_teacher := true; r_tuid := auth.uid();
    return;
  end if;
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then err := 'unknown_token'; return; end if;
  select * into v_r from skill_rooms where id = v_p.room_id;
  if v_r.id is null or v_r.expires_at <= now() then err := 'room_gone'; return; end if;
  if v_r.tool_id <> 'socialhub' then err := 'not_found'; return; end if;
  if v_p.blocked then err := 'blocked'; return; end if;
  r_room := v_r.id; r_part := v_p.id;
end;
$$;
revoke all on function sh_ctx(text, text) from public, anon, authenticated;


-- Wer bin ich in DIESEM Hub? Sitzung gilt nur für dasselbe Gerät
-- (Teilnehmer) bzw. dieselbe Lehrkraft. Gründer = Teilnehmer bzw.
-- Lehrkraft, der der Hub gehört.
create or replace function sh_access(
  p_token text, p_code text, p_hub uuid, p_session text,
  out r_room uuid, out r_part uuid, out r_teacher boolean, out r_tuid uuid, out r_founder boolean,
  out r_user int, out r_role text, out r_admin boolean, out err text)
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  c   record;
  h   sh_hubs;
  v_u int;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then err := c.err; return; end if;
  r_room := c.r_room; r_part := c.r_part; r_teacher := c.r_teacher; r_tuid := c.r_tuid;
  select * into h from sh_hubs where id = p_hub and room_id = c.r_room;
  if h.id is null then err := 'hub_not_found'; return; end if;
  r_founder := (r_part is not null and h.participant_id = r_part) or (r_tuid is not null and h.teacher_id = r_tuid);
  if h.locked and not r_teacher then err := 'hub_locked'; return; end if;
  if p_session is not null then
    select s.user_id into v_u from sh_sessions s
     where s.token = p_session and s.hub_id = h.id
       and ((r_part is not null and s.participant_id = r_part) or (r_tuid is not null and s.teacher_id = r_tuid));
    if v_u is not null then
      r_user := v_u;
      select u.role into r_role from sh_users u where u.hub_id = h.id and u.id = v_u;
    end if;
  end if;
  r_admin := r_teacher or r_founder or coalesce(r_role = 'admin', false);
end;
$$;
revoke all on function sh_access(text, text, uuid, text) from public, anon, authenticated;


create or replace function sh_session_new(p_hub uuid, p_user int, p_part uuid, p_tuid uuid)
  returns text
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare v text := encode(gen_random_bytes(24), 'hex');
begin
  insert into sh_sessions (token, hub_id, user_id, participant_id, teacher_id) values (v, p_hub, p_user, p_part, p_tuid);
  delete from sh_sessions where token in (
    select token from sh_sessions where hub_id = p_hub and user_id = p_user
     order by created_at desc offset 20);
  return v;
end;
$$;
revoke all on function sh_session_new(uuid, int, uuid, uuid) from public, anon, authenticated;


create or replace function sh_hub_json(p_hub uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('id', h.id, 'name', h.name, 'logo', h.logo, 'locked', h.locked,
    'color', h.color, 'scheme', h.scheme, 'teacher_hub', h.teacher_id is not null,
    'owner', (select u.username from sh_users u where u.hub_id = h.id and u.id = h.owner_user),
    'users',  (select count(*) from sh_users u where u.hub_id = h.id),
    'photos', (select count(*) from sh_photos p where p.hub_id = h.id))
  from sh_hubs h where h.id = p_hub;
$$;
revoke all on function sh_hub_json(uuid) from public, anon, authenticated;


create or replace function sh_home(p_token text default null, p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
  stable
as $$
declare
  c record;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  return jsonb_build_object('ok', true, 'teacher', c.r_teacher,
    'tables', (select coalesce(jsonb_agg(t order by o), '[]'::jsonb) from
                 unnest(array['users','photos','follows','likes','comments','comment_likes','tags','photo_tag']) with ordinality as x(t, o)
                where sh_on(c.r_room, t)),
    'upload', sh_upload_on(c.r_room),
    'mine', (select h.id from sh_hubs h where (c.r_part is not null and h.participant_id = c.r_part)
                                         or (c.r_tuid is not null and h.room_id = c.r_room and h.teacher_id = c.r_tuid)),
    'hubs', coalesce((
      select jsonb_agg(sh_hub_json(h.id)
               || case when c.r_teacher then jsonb_build_object(
                    'person', case when h.teacher_id is not null then coalesce(pr.display_name, 'Lehrkraft') || ' (Lehrkraft)'
                                   else coalesce(p.name, 'Tablet ' || p.seat) end,
                    'likes', (select count(*) from sh_likes l where l.hub_id = h.id),
                    'comments', (select count(*) from sh_comments m where m.hub_id = h.id),
                    'active', greatest(h.created_at,
                                (select max(created_at) from sh_photos x where x.hub_id = h.id),
                                (select max(created_at) from sh_likes x where x.hub_id = h.id),
                                (select max(created_at) from sh_comments x where x.hub_id = h.id),
                                (select max(created_at) from sh_users x where x.hub_id = h.id)))
                  else '{}'::jsonb end
               order by (h.teacher_id is null), h.created_at)
        from sh_hubs h
        left join skill_participants p on p.id = h.participant_id
        left join profiles pr on pr.id = h.teacher_id
       where h.room_id = c.r_room and (c.r_teacher or not h.locked)), '[]'::jsonb));
end;
$$;
revoke all on function sh_home(text, text) from public;
grant execute on function sh_home(text, text) to anon, authenticated;


create or replace function sh_enter(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  v_sess text := p_session;
  v_user int;
  v_me   jsonb;
  h      sh_hubs;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  select * into h from sh_hubs where id = p_hub;
  v_user := a.r_user;
  if v_user is null then v_sess := null; end if;
  if v_user is null and a.r_founder and h.owner_user is not null
     and exists (select 1 from sh_users where hub_id = h.id and id = h.owner_user) then
    v_user := h.owner_user;
    v_sess := sh_session_new(h.id, v_user, a.r_part, a.r_tuid);
  end if;
  if v_user is not null then
    select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar', u.avatar,
                              'bio', u.bio, 'city', u.city, 'role', u.role)
      into v_me from sh_users u where u.hub_id = h.id and u.id = v_user;
  end if;
  return jsonb_build_object('ok', true,
    'hub', sh_hub_json(h.id),
    'session', v_sess,
    'me', v_me,
    'admin', a.r_teacher or a.r_founder or coalesce(v_me->>'role' = 'admin', false),
    'founder', a.r_founder,
    'teacher', a.r_teacher,
    'tables', (select coalesce(jsonb_agg(t order by o), '[]'::jsonb) from
                 unnest(array['users','photos','follows','likes','comments','comment_likes','tags','photo_tag']) with ordinality as x(t, o)
                where sh_on(a.r_room, t)),
    'upload', sh_upload_on(a.r_room));
end;
$$;
revoke all on function sh_enter(text, text, uuid, text) from public;
grant execute on function sh_enter(text, text, uuid, text) to anon, authenticated;


create or replace function sh_admin_users(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
  stable
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'role', u.role,
             'avatar', u.avatar, 'created_at', u.created_at,
             'photos', (select count(*) from sh_photos p where p.hub_id = u.hub_id and p.user_id = u.id),
             -- wer steckt dahinter? nur die Lehrkraft (Mobbing)
             'person', case when a.r_teacher then coalesce(
               (select coalesce(sp.name, 'Tablet ' || sp.seat) from skill_participants sp where sp.id = u.participant_id),
               (select coalesce(pr.display_name, 'Lehrkraft') || ' (Lehrkraft)' from profiles pr where pr.id = u.teacher_id)) end)
           order by u.id)
      from sh_users u where u.hub_id = p_hub), '[]'::jsonb));
end;
$$;
revoke all on function sh_admin_users(text, text, uuid, text) from public;
grant execute on function sh_admin_users(text, text, uuid, text) to anon, authenticated;


create or replace function sh_found(
  p_token text default null,
  p_name text default null,
  p_logo text default null,
  p_username text default null,
  p_password text default null,
  p_display text default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c      record;
  v_name text := btrim(coalesce(p_name, ''));
  v_user text := lower(btrim(coalesce(p_username, '')));
  v_hub  uuid;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if exists (select 1 from sh_hubs where (c.r_part is not null and participant_id = c.r_part)
                                   or (c.r_tuid is not null and room_id = c.r_room and teacher_id = c.r_tuid)) then return sh_err('already_founded'); end if;
  if char_length(v_name) not between 2 and 30 then return sh_err('invalid_name'); end if;
  if coalesce(p_logo, '') not in ('bell','connect','rocket','graph','trend','chat','like','mesh') then return sh_err('invalid_logo'); end if;
  if v_user !~ '^[a-z0-9._]{3,24}$' then return sh_err('invalid_username'); end if;
  if char_length(coalesce(p_password, '')) not between 4 and 60 then return sh_err('invalid_password'); end if;
  if char_length(coalesce(p_display, '')) > 40 then return sh_err('invalid_input'); end if;
  if sh_bad(v_name) or sh_bad(v_user) or sh_bad(p_display) then return sh_err('blacklisted'); end if;
  if (select count(*) from sh_hubs where room_id = c.r_room) >= 60 then return sh_err('quota_exceeded'); end if;

  insert into sh_hubs (room_id, participant_id, teacher_id, name, logo) values (c.r_room, c.r_part, c.r_tuid, v_name, p_logo)
  returning id into v_hub;
  insert into sh_users (hub_id, id, username, name, password, role, participant_id, teacher_id)
  values (v_hub, 1, v_user, nullif(btrim(coalesce(p_display, '')), ''), sh_hash(p_password), 'admin', c.r_part, c.r_tuid);
  update sh_hubs set owner_user = 1 where id = v_hub;
  return jsonb_build_object('ok', true, 'hub', v_hub, 'session', sh_session_new(v_hub, 1, c.r_part, c.r_tuid));
end;
$$;
revoke all on function sh_found(text, text, text, text, text, text, text) from public;
grant execute on function sh_found(text, text, text, text, text, text, text) to anon, authenticated;


create or replace function sh_register(
  p_token text default null,
  p_hub uuid default null,
  p_username text default null,
  p_password text default null,
  p_name text default null,
  p_email text default null,
  p_birthday text default null,
  p_city text default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  v_user text := lower(btrim(coalesce(p_username, '')));
  v_bd   date;
  v_id   int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, null);
  if a.err is not null then return sh_err(a.err); end if;
  if v_user !~ '^[a-z0-9._]{3,24}$' then return sh_err('invalid_username'); end if;
  if char_length(coalesce(p_password, '')) not between 4 and 60 then return sh_err('invalid_password'); end if;
  if char_length(coalesce(p_name, '')) > 40 or char_length(coalesce(p_email, '')) > 100
     or char_length(coalesce(p_city, '')) > 60 then return sh_err('invalid_input'); end if;
  if p_birthday is not null and btrim(p_birthday) <> '' then
    begin v_bd := p_birthday::date; exception when others then return sh_err('invalid_birthday'); end;
    if v_bd < date '1900-01-01' or v_bd > current_date then return sh_err('invalid_birthday'); end if;
  end if;
  if sh_bad(v_user) or sh_bad(p_name) or sh_bad(p_city) then return sh_err('blacklisted'); end if;
  if exists (select 1 from sh_users where hub_id = p_hub and lower(username) = v_user) then return sh_err('username_taken'); end if;
  if (select count(*) from sh_users where hub_id = p_hub) >= 300 then return sh_err('quota_exceeded'); end if;
  -- höchstens 3 Konten je Gerät und Hub (Lehrkraft: 10 Testkonten)
  if (a.r_part is not null and (select count(*) from sh_users where hub_id = p_hub and participant_id = a.r_part) >= 3)
     or (a.r_tuid is not null and (select count(*) from sh_users where hub_id = p_hub and teacher_id = a.r_tuid) >= 10) then
    return sh_err('too_many_accounts');
  end if;
  v_id := sh_next(p_hub, 'sh_users');
  insert into sh_users (hub_id, id, username, name, email, password, birthday, city, participant_id, teacher_id)
  values (p_hub, v_id, v_user, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_email, '')), ''),
          sh_hash(p_password), v_bd, nullif(btrim(coalesce(p_city, '')), ''), a.r_part, a.r_tuid);
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, v_id, a.r_part, a.r_tuid), 'user', v_id);
end;
$$;
revoke all on function sh_register(text, uuid, text, text, text, text, text, text, text) from public;
grant execute on function sh_register(text, uuid, text, text, text, text, text, text, text) to anon, authenticated;


create or replace function sh_login(
  p_token text default null,
  p_hub uuid default null,
  p_username text default null,
  p_password text default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a record;
  u sh_users;
begin
  select * into a from sh_access(p_token, p_code, p_hub, null);
  if a.err is not null then return sh_err(a.err); end if;
  select * into u from sh_users where hub_id = p_hub and lower(username) = lower(btrim(coalesce(p_username, '')));
  if u.id is null or not sh_pw_ok(p_password, u.password) then
    perform pg_sleep(0.3);
    return sh_err('wrong_login');
  end if;
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, u.id, a.r_part, a.r_tuid), 'user', u.id);
end;
$$;
revoke all on function sh_login(text, uuid, text, text, text) from public;
grant execute on function sh_login(text, uuid, text, text, text) to anon, authenticated;


create or replace function sh_logout(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_all boolean default false,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return jsonb_build_object('ok', true); end if;
  if coalesce(p_all, false) then
    delete from sh_sessions where hub_id = p_hub and user_id = a.r_user;
  else
    delete from sh_sessions where token = p_session;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_logout(text, uuid, text, boolean, text) from public;
grant execute on function sh_logout(text, uuid, text, boolean, text) to anon, authenticated;


create or replace function sh_me_update(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_name text default null,
  p_bio text default null,
  p_avatar text default null,
  p_city text default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if char_length(coalesce(p_name, '')) > 40 or char_length(coalesce(p_bio, '')) > 160
     or char_length(coalesce(p_city, '')) > 60 then return sh_err('invalid_input'); end if;
  if p_avatar is not null and p_avatar <> '' and p_avatar !~ '^img_[0-9]{1,6}\.webp$' then return sh_err('invalid_input'); end if;
  if sh_bad(p_name) or sh_bad(p_bio) or sh_bad(p_city) then return sh_err('blacklisted'); end if;
  update sh_users set name = nullif(btrim(coalesce(p_name, '')), ''), bio = nullif(btrim(coalesce(p_bio, '')), ''),
         avatar = nullif(coalesce(p_avatar, ''), ''), city = nullif(btrim(coalesce(p_city, '')), '')
   where hub_id = p_hub and id = a.r_user;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_me_update(text, uuid, text, text, text, text, text, text) from public;
grant execute on function sh_me_update(text, uuid, text, text, text, text, text, text) to anon, authenticated;


create or replace function sh_photo_post(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_image text default null,
  p_description text default null,
  p_tags jsonb default '[]'::jsonb,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a     record;
  v_id  int;
  v_t   text;
  v_tid int;
  v_n   int := 0;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if not sh_on(a.r_room, 'photos') then return sh_err('table_off'); end if;
  if coalesce(p_image, '') !~ '^img_[0-9]{1,6}\.webp$'
     or not exists (select 1 from sh_media where hub_id = p_hub and id = substring(p_image from '[0-9]+')::int) then
    return sh_err('invalid_image');
  end if;
  if char_length(coalesce(p_description, '')) > 300 then return sh_err('invalid_input'); end if;
  if sh_bad(p_description) then return sh_err('blacklisted'); end if;
  if (select count(*) from sh_photos where hub_id = p_hub) >= 1500 then return sh_err('quota_exceeded'); end if;
  v_id := sh_next(p_hub, 'sh_photos');
  insert into sh_photos (hub_id, id, user_id, image, description)
  values (p_hub, v_id, a.r_user, p_image, nullif(btrim(coalesce(p_description, '')), ''));
  if sh_on(a.r_room, 'tags') and jsonb_typeof(p_tags) = 'array' then
    for v_t in select distinct lower(btrim(value, ' #')) from jsonb_array_elements_text(p_tags) loop
      continue when v_t !~ '^[a-z0-9äöüß_]{1,30}$' or sh_bad(v_t);
      v_n := v_n + 1;
      exit when v_n > 8;
      select id into v_tid from sh_tags where hub_id = p_hub and lower(name) = v_t;
      if v_tid is null then
        v_tid := sh_next(p_hub, 'sh_tags');
        insert into sh_tags (hub_id, id, name) values (p_hub, v_tid, v_t);
      end if;
      insert into sh_photo_tag (hub_id, photo_id, tag_id) values (p_hub, v_id, v_tid) on conflict do nothing;
      v_tid := null;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function sh_photo_post(text, uuid, text, text, text, jsonb, text) from public;
grant execute on function sh_photo_post(text, uuid, text, text, text, jsonb, text) to anon, authenticated;


create or replace function sh_like(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_photo int default null,
  p_on boolean default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if not sh_on(a.r_room, 'likes') then return sh_err('table_off'); end if;
  if coalesce(p_on, true) then
    if not exists (select 1 from sh_photos where hub_id = p_hub and id = p_photo) then return sh_err('not_found'); end if;
    insert into sh_likes (hub_id, user_id, photo_id) values (p_hub, a.r_user, p_photo) on conflict do nothing;
  else
    delete from sh_likes where hub_id = p_hub and user_id = a.r_user and photo_id = p_photo;
  end if;
  return jsonb_build_object('ok', true, 'likes', (select count(*) from sh_likes where hub_id = p_hub and photo_id = p_photo));
end;
$$;
revoke all on function sh_like(text, uuid, text, int, boolean, text) from public;
grant execute on function sh_like(text, uuid, text, int, boolean, text) to anon, authenticated;


create or replace function sh_follow(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_user int default null,
  p_on boolean default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if not sh_on(a.r_room, 'follows') then return sh_err('table_off'); end if;
  if p_user = a.r_user then return sh_err('invalid_input'); end if;
  if coalesce(p_on, true) then
    if not exists (select 1 from sh_users where hub_id = p_hub and id = p_user) then return sh_err('not_found'); end if;
    insert into sh_follows (hub_id, follower_id, following_id) values (p_hub, a.r_user, p_user) on conflict do nothing;
  else
    delete from sh_follows where hub_id = p_hub and follower_id = a.r_user and following_id = p_user;
  end if;
  return jsonb_build_object('ok', true,
    'followers', (select count(*) from sh_follows where hub_id = p_hub and following_id = p_user));
end;
$$;
revoke all on function sh_follow(text, uuid, text, int, boolean, text) from public;
grant execute on function sh_follow(text, uuid, text, int, boolean, text) to anon, authenticated;


create or replace function sh_comment_add(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_photo int default null,
  p_body text default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a    record;
  v_b  text := btrim(coalesce(p_body, ''));
  v_id int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if not sh_on(a.r_room, 'comments') then return sh_err('table_off'); end if;
  if char_length(v_b) not between 1 and 300 then return sh_err('invalid_input'); end if;
  if sh_bad(v_b) then return sh_err('blacklisted'); end if;
  if not exists (select 1 from sh_photos where hub_id = p_hub and id = p_photo) then return sh_err('not_found'); end if;
  if (select count(*) from sh_comments where hub_id = p_hub) >= 5000 then return sh_err('quota_exceeded'); end if;
  v_id := sh_next(p_hub, 'sh_comments');
  insert into sh_comments (hub_id, id, user_id, photo_id, body) values (p_hub, v_id, a.r_user, p_photo, v_b);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function sh_comment_add(text, uuid, text, int, text, text) from public;
grant execute on function sh_comment_add(text, uuid, text, int, text, text) to anon, authenticated;


create or replace function sh_comment_like(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_comment int default null,
  p_on boolean default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if not sh_on(a.r_room, 'comment_likes') then return sh_err('table_off'); end if;
  if coalesce(p_on, true) then
    if not exists (select 1 from sh_comments where hub_id = p_hub and id = p_comment) then return sh_err('not_found'); end if;
    insert into sh_comment_likes (hub_id, user_id, comment_id) values (p_hub, a.r_user, p_comment) on conflict do nothing;
  else
    delete from sh_comment_likes where hub_id = p_hub and user_id = a.r_user and comment_id = p_comment;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_comment_like(text, uuid, text, int, boolean, text) from public;
grant execute on function sh_comment_like(text, uuid, text, int, boolean, text) to anon, authenticated;


create or replace function sh_media_put(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_data text default null,
  p_thumb text default null,
  p_mime text default 'image/webp',
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a    record;
  v_d  bytea;
  v_t  bytea;
  v_id int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if not sh_upload_on(a.r_room) then return sh_err('upload_off'); end if;
  if coalesce(p_mime, '') not in ('image/webp', 'image/jpeg', 'image/png') then return sh_err('invalid_input'); end if;
  begin
    v_d := decode(p_data, 'base64');
    v_t := decode(p_thumb, 'base64');
  exception when others then return sh_err('invalid_input'); end;
  if v_d is null or v_t is null then return sh_err('invalid_input'); end if;
  if octet_length(v_d) > 320000 or octet_length(v_t) > 60000 then return sh_err('payload_too_big'); end if;
  if (a.r_part is not null and (select count(*) from sh_media where room_id = a.r_room and participant_id = a.r_part) >= 60)
     or (a.r_tuid is not null and (select count(*) from sh_media where room_id = a.r_room and teacher_id = a.r_tuid) >= 120) then
    return sh_err('quota_exceeded');
  end if;
  if (select coalesce(sum(octet_length(data) + octet_length(thumb)), 0) from sh_media where room_id = a.r_room) > 80000000 then
    return sh_err('room_full');
  end if;
  v_id := sh_next(p_hub, 'sh_media');
  insert into sh_media (hub_id, id, room_id, participant_id, teacher_id, mime, data, thumb)
  values (p_hub, v_id, a.r_room, a.r_part, a.r_tuid, p_mime, v_d, v_t);
  return jsonb_build_object('ok', true, 'name', 'img_' || v_id || '.webp');
end;
$$;
revoke all on function sh_media_put(text, uuid, text, text, text, text, text) from public;
grant execute on function sh_media_put(text, uuid, text, text, text, text, text) to anon, authenticated;
