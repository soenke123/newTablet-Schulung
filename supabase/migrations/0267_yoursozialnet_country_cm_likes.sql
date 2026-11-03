-- ══════════════════════════════════════════════════════════════
-- Migration 0267 — YourSozialNet: users.country + users.centimeter,
-- drei Arten von Likes, comment_likes entfällt (Sönkes Rückmeldung 03.11.2026)
-- ══════════════════════════════════════════════════════════════
--   · sh_users.country (≤ 60 Zeichen) und sh_users.centimeter (Größe in
--     cm, 50–250). In Registrieren, Profil bearbeiten, Profil, Schnappschuss
--     und sh_db_apply. sh_register und sh_me_update bekommen p_country,
--     p_centimeter (alte Fassungen entfallen).
--   · likes.kind: drei Arten – Herz, Daumen hoch, lachender Smiley
--     ('heart' | 'thumb' | 'laugh', Standard heart). Ein Like je Person
--     und Foto, eine andere Art ersetzt die alte. sh_like bekommt p_kind
--     (alte Fassung entfällt), sh_photo_json liefert kinds + my_kind.
--   · Tabelle comment_likes „bietet keinen Mehrwert“: sh_comment_likes,
--     sh_comment_like und die Herzen an Kommentaren entfallen; sh_on kennt
--     sie nicht mehr, data.tables wird bereinigt. sh_comments, Schnappschuss
--     und sh_db_apply neu ohne sie.
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (deckt 0263–0267 mit ab).
-- ══════════════════════════════════════════════════════════════

alter table sh_users add column if not exists country text;
alter table sh_users add column if not exists centimeter int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sh_users_country') then
    alter table sh_users add constraint sh_users_country check (country is null or char_length(country) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sh_users_centimeter') then
    alter table sh_users add constraint sh_users_centimeter check (centimeter is null or centimeter between 50 and 250);
  end if;
end $$;

drop function if exists sh_register(text, uuid, text, text, text, text, text, text, text, text, text);
drop function if exists sh_me_update(text, uuid, text, text, text, text, text, text, text);
drop function if exists sh_comment_like(text, uuid, text, int, boolean, text);
drop function if exists sh_comment_like(text, uuid, text, int, boolean);
drop table if exists sh_comment_likes;

alter table sh_likes add column if not exists kind text not null default 'heart';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sh_likes_kind') then
    alter table sh_likes add constraint sh_likes_kind check (kind in ('heart', 'thumb', 'laugh'));
  end if;
end $$;
drop function if exists sh_like(text, uuid, text, int, boolean, text);

update skill_room_state s set data = jsonb_set(s.data, '{tables}', (s.data->'tables') - 'comment_likes')
  from skill_rooms r
 where r.id = s.room_id and r.tool_id = 'socialhub'
   and jsonb_typeof(s.data->'tables') = 'array' and s.data->'tables' ? 'comment_likes';

create or replace function sh_on(p_room uuid, p_t text)
  returns boolean
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  t jsonb;
begin
  if p_t = 'users' then return true; end if;
  select data->'tables' into t from skill_room_state where room_id = p_room;
  if t is null or jsonb_typeof(t) <> 'array' then return false; end if;
  if p_t = 'follows' then return t ? 'follows'; end if;
  if not (t ? 'photos') then return false; end if;
  return case p_t
    when 'photos'        then true
    when 'likes'         then t ? 'likes'
    when 'comments'      then t ? 'comments'
    when 'tags'          then t ? 'tags'
    when 'photo_tag'     then t ? 'tags'
    else false end;
end;
$$;
revoke all on function sh_on(uuid, text) from public, anon, authenticated;


create or replace function sh_register(
  p_token text default null,
  p_hub uuid default null,
  p_username text default null,
  p_password text default null,
  p_name text default null,
  p_email text default null,
  p_birthday text default null,
  p_city text default null,
  p_gender text default null,
  p_bio text default null,
  p_country text default null,
  p_centimeter int default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  h      sh_hubs;
  v_user text := lower(btrim(coalesce(p_username, '')));
  v_gen  text := nullif(btrim(coalesce(p_gender, '')), '');
  v_bd   date;
  v_id   int;
  v_adm  boolean;
begin
  select * into a from sh_access(p_token, p_code, p_hub, null);
  if a.err is not null then return sh_err(a.err); end if;
  select * into h from sh_hubs where id = p_hub;
  if v_user !~ '^[a-z0-9._]{3,24}$' then return sh_err('invalid_username'); end if;
  if char_length(coalesce(p_password, '')) not between 4 and 60 then return sh_err('invalid_password'); end if;
  if char_length(coalesce(p_name, '')) > 40 or char_length(coalesce(p_email, '')) > 100
     or char_length(coalesce(p_city, '')) > 60 or char_length(coalesce(p_bio, '')) > 160
     or char_length(coalesce(p_country, '')) > 60 then return sh_err('invalid_input'); end if;
  if p_centimeter is not null and p_centimeter not between 50 and 250 then return sh_err('invalid_centimeter'); end if;
  if v_gen is not null and v_gen not in ('male', 'female', 'diverse') then return sh_err('invalid_gender'); end if;
  if p_birthday is not null and btrim(p_birthday) <> '' then
    begin v_bd := p_birthday::date; exception when others then return sh_err('invalid_birthday'); end;
    if v_bd < date '1900-01-01' or v_bd > current_date then return sh_err('invalid_birthday'); end if;
  end if;
  if sh_bad(v_user) or sh_bad(p_name) or sh_bad(p_city) or sh_bad(p_bio) or sh_bad(p_country) then return sh_err('blacklisted'); end if;
  if exists (select 1 from sh_users where hub_id = p_hub and lower(username) = v_user) then return sh_err('username_taken'); end if;
  if (select count(*) from sh_users where hub_id = p_hub) >= 300 then return sh_err('quota_exceeded'); end if;
  -- Gründer bis 50 Konten im eigenen Netzwerk, Lehrkraft 10 Testkonten auf fremden
  if (a.r_founder and a.r_part is not null and (select count(*) from sh_users where hub_id = p_hub and participant_id = a.r_part) >= 50)
     or (a.r_founder and a.r_tuid is not null and (select count(*) from sh_users where hub_id = p_hub and teacher_id = a.r_tuid) >= 50)
     or (not a.r_founder and a.r_tuid is not null and (select count(*) from sh_users where hub_id = p_hub and teacher_id = a.r_tuid) >= 10) then
    return sh_err('too_many_accounts');
  end if;
  v_adm := a.r_founder and (h.owner_user is null or not exists (select 1 from sh_users where hub_id = p_hub and id = h.owner_user));
  v_id := sh_next(p_hub, 'sh_users');
  insert into sh_users (hub_id, id, username, name, email, password, birthday, city, country, centimeter, gender, bio, role, participant_id, teacher_id)
  values (p_hub, v_id, v_user, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_email, '')), ''),
          sh_hash(p_password), v_bd, nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_country, '')), ''), p_centimeter, v_gen, nullif(btrim(coalesce(p_bio, '')), ''),
          case when v_adm then 'admin' else 'user' end, a.r_part, a.r_tuid);
  if v_adm then update sh_hubs set owner_user = v_id where id = p_hub; end if;
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, v_id, a.r_part, a.r_tuid), 'user', v_id, 'admin', v_adm);
end;
$$;
revoke all on function sh_register(text, uuid, text, text, text, text, text, text, text, text, text, int, text) from public;
grant execute on function sh_register(text, uuid, text, text, text, text, text, text, text, text, text, int, text) to anon, authenticated;


create or replace function sh_me_update(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_name text default null,
  p_bio text default null,
  p_avatar text default null,
  p_city text default null,
  p_gender text default null,
  p_country text default null,
  p_centimeter int default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a     record;
  v_gen text := nullif(btrim(coalesce(p_gender, '')), '');
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if char_length(coalesce(p_name, '')) > 40 or char_length(coalesce(p_bio, '')) > 160
     or char_length(coalesce(p_city, '')) > 60 or char_length(coalesce(p_country, '')) > 60 then return sh_err('invalid_input'); end if;
  if p_centimeter is not null and p_centimeter not between 50 and 250 then return sh_err('invalid_centimeter'); end if;
  if v_gen is not null and v_gen not in ('male', 'female', 'diverse') then return sh_err('invalid_gender'); end if;
  if p_avatar is not null and p_avatar <> '' and p_avatar !~ '^img_[0-9]{1,6}\.webp$' then return sh_err('invalid_input'); end if;
  if sh_bad(p_name) or sh_bad(p_bio) or sh_bad(p_city) or sh_bad(p_country) then return sh_err('blacklisted'); end if;
  update sh_users set name = nullif(btrim(coalesce(p_name, '')), ''), bio = nullif(btrim(coalesce(p_bio, '')), ''),
         avatar = nullif(coalesce(p_avatar, ''), ''), city = nullif(btrim(coalesce(p_city, '')), ''), gender = v_gen,
         country = nullif(btrim(coalesce(p_country, '')), ''), centimeter = p_centimeter
   where hub_id = p_hub and id = a.r_user;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_me_update(text, uuid, text, text, text, text, text, text, text, int, text) from public;
grant execute on function sh_me_update(text, uuid, text, text, text, text, text, text, text, int, text) to anon, authenticated;


create or replace function sh_profile(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_user int default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
  stable
as $$
declare
  a  record;
  u  sh_users;
  fo boolean;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  select * into u from sh_users where hub_id = p_hub and id = coalesce(p_user, a.r_user);
  if u.id is null then return sh_err('not_found'); end if;
  fo := sh_on(a.r_room, 'follows');
  return jsonb_build_object('ok', true,
    'user', jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'bio', u.bio,
                               'avatar', u.avatar, 'city', u.city, 'country', u.country, 'centimeter', u.centimeter, 'gender', u.gender, 'role', u.role, 'created_at', u.created_at),
    'me', a.r_user is not null and a.r_user = u.id,
    'photos_n', case when sh_on(a.r_room, 'photos') then (select count(*) from sh_photos where hub_id = p_hub and user_id = u.id) end,
    'followers', case when fo then (select count(*) from sh_follows where hub_id = p_hub and following_id = u.id) end,
    'following', case when fo then (select count(*) from sh_follows where hub_id = p_hub and follower_id = u.id) end,
    'i_follow',  case when fo and a.r_user is not null then exists (select 1 from sh_follows where hub_id = p_hub and follower_id = a.r_user and following_id = u.id) end,
    'likes',     case when sh_on(a.r_room, 'likes') then (select count(*) from sh_likes l join sh_photos p on p.hub_id = l.hub_id and p.id = l.photo_id
                                                           where l.hub_id = p_hub and p.user_id = u.id) end,
    'photos', case when sh_on(a.r_room, 'photos') then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'image', p.image) order by p.created_at desc, p.id desc)
                          from sh_photos p where p.hub_id = p_hub and p.user_id = u.id), '[]'::jsonb) end);
end;
$$;
revoke all on function sh_profile(text, text, uuid, text, int) from public;
grant execute on function sh_profile(text, text, uuid, text, int) to anon, authenticated;


create or replace function sh_comments(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_photo int default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
  stable
as $$
declare
  a  record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not sh_on(a.r_room, 'comments') then return sh_err('table_off'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(x.j order by x.created_at, x.id)
      from (select c.id, c.created_at,
                   jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
                     'user', jsonb_build_object('id', u.id, 'username', u.username, 'avatar', u.avatar),
                     'mine', a.r_user is not null and a.r_user = c.user_id) j
              from sh_comments c join sh_users u on u.hub_id = c.hub_id and u.id = c.user_id
             where c.hub_id = p_hub and c.photo_id = p_photo) x), '[]'::jsonb));
end;
$$;
revoke all on function sh_comments(text, text, uuid, text, int) from public;
grant execute on function sh_comments(text, text, uuid, text, int) to anon, authenticated;


create or replace function sh_db_snapshot(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
  stable
as $$
declare
  a   record;
  v   jsonb := '{}'::jsonb;
  f   text := 'YYYY-MM-DD HH24:MI:SS';
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;

  v := v || jsonb_build_object('users', jsonb_build_object(
    'cols', jsonb_build_array('id','username','name','email','password','gender','bio','avatar','birthday','city','country','centimeter','role','created_at'),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(id, username, name, email, password, gender, bio, avatar,
                                to_char(birthday, 'YYYY-MM-DD'), city, country, centimeter, role, to_char(created_at, f)) order by id)
                        from sh_users where hub_id = p_hub), '[]'::jsonb)));
  if sh_on(a.r_room, 'photos') then
  v := v || jsonb_build_object('photos', jsonb_build_object(
    'cols', jsonb_build_array('id','user_id','image','description','created_at'),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, image, description, to_char(created_at, f)) order by id)
                        from sh_photos where hub_id = p_hub), '[]'::jsonb)));
  end if;
  if sh_on(a.r_room, 'follows') then
    v := v || jsonb_build_object('follows', jsonb_build_object(
      'cols', jsonb_build_array('follower_id','following_id','created_at'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(follower_id, following_id, to_char(created_at, f)) order by created_at, follower_id)
                          from sh_follows where hub_id = p_hub), '[]'::jsonb)));
  end if;
  if sh_on(a.r_room, 'likes') then
    v := v || jsonb_build_object('likes', jsonb_build_object(
      'cols', jsonb_build_array('user_id','photo_id','kind','created_at'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(user_id, photo_id, kind, to_char(created_at, f)) order by created_at, user_id)
                          from sh_likes where hub_id = p_hub), '[]'::jsonb)));
  end if;
  if sh_on(a.r_room, 'comments') then
    v := v || jsonb_build_object('comments', jsonb_build_object(
      'cols', jsonb_build_array('id','user_id','photo_id','body','created_at'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, photo_id, body, to_char(created_at, f)) order by id)
                          from sh_comments where hub_id = p_hub), '[]'::jsonb)));
  end if;
  if sh_on(a.r_room, 'tags') then
    v := v || jsonb_build_object('tags', jsonb_build_object(
      'cols', jsonb_build_array('id','name'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(id, name) order by id) from sh_tags where hub_id = p_hub), '[]'::jsonb)));
    v := v || jsonb_build_object('photo_tag', jsonb_build_object(
      'cols', jsonb_build_array('photo_id','tag_id'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(photo_id, tag_id) order by photo_id, tag_id)
                          from sh_photo_tag where hub_id = p_hub), '[]'::jsonb)));
  end if;
  return jsonb_build_object('ok', true, 'tables', v);
end;
$$;
revoke all on function sh_db_snapshot(text, text, uuid, text) from public;
grant execute on function sh_db_snapshot(text, text, uuid, text) to anon, authenticated;


create or replace function sh_db_apply(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_ops jsonb default '[]'::jsonb)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
as $$
declare
  a      record;
  o      jsonb;
  v_t    text;
  v_op   text;
  v_tab  text;
  v_cols text[];
  v_pk   text[];
  v_row  jsonb;
  v_key  jsonb;
  v_set  text;
  v_wh   text;
  v_n    int;
  v_done int := 0;
  v_msg  text;
  v_st   text;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if jsonb_typeof(p_ops) <> 'array' then return sh_err('invalid_input'); end if;
  if jsonb_array_length(p_ops) > 500 then return sh_err('too_many_changes'); end if;

  begin
    perform pg_advisory_xact_lock(hashtext('sh:' || p_hub::text));
    for o in select value from jsonb_array_elements(p_ops) loop
      v_t := o->>'t'; v_op := o->>'op';
      v_cols := case v_t
        when 'users'         then array['id','username','name','email','password','gender','bio','avatar','birthday','city','country','centimeter','role','created_at']
        when 'photos'        then array['id','user_id','image','description','created_at']
        when 'follows'       then array['follower_id','following_id','created_at']
        when 'likes'         then array['user_id','photo_id','kind','created_at']
        when 'comments'      then array['id','user_id','photo_id','body','created_at']
        when 'tags'          then array['id','name']
        when 'photo_tag'     then array['photo_id','tag_id'] end;
      v_pk := case v_t
        when 'follows'       then array['follower_id','following_id']
        when 'likes'         then array['user_id','photo_id']
        when 'photo_tag'     then array['photo_id','tag_id']
        else array['id'] end;
      if v_cols is null or not sh_on(a.r_room, v_t) then
        raise exception using errcode = 'P0001', message = 'Tabelle ' || coalesce(v_t, '?') || ' gibt es hier nicht.';
      end if;
      if v_op not in ('insert', 'update', 'delete') then
        raise exception using errcode = 'P0001', message = 'Unbekannte Änderung.';
      end if;
      v_tab := 'sh_' || v_t;

      -- Schlüssel: nur ganze Zahlen
      v_key := coalesce(o->'key', o->'row');
      for v_n in 1 .. array_length(v_pk, 1) loop
        if coalesce(v_key->>v_pk[v_n], '') !~ '^[0-9]{1,9}$' then
          raise exception using errcode = 'P0001', message = 'Der Schlüssel ' || v_pk[v_n] || ' braucht eine ganze Zahl.';
        end if;
      end loop;
      v_wh := (select string_agg(format('t.%I = (%L)::int', k, v_key->>k), ' and ') from unnest(v_pk) k);

      -- Konten der Lehrkraft (Testkonten) ändert oder löscht nur sie selbst
      if v_t = 'users' and v_op in ('update', 'delete') and not a.r_teacher and exists (
           select 1 from sh_users x where x.hub_id = p_hub and x.id = (v_key->>'id')::int and x.teacher_id is not null) then
        raise exception using errcode = 'P0001', message = 'Das Testkonto der Lehrkraft kannst du nicht ändern oder löschen.';
      end if;

      if v_op = 'delete' then
        execute format('delete from %I t where t.hub_id = $1 and %s', v_tab, v_wh) using p_hub;
      else
        -- nur bekannte Spalten; created_at leer → jetzt
        select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_row
          from jsonb_each(coalesce(o->'row', '{}'::jsonb)) e where e.key = any(v_cols);
        if 'created_at' = any(v_cols) and coalesce(v_row->>'created_at', '') = '' then
          v_row := v_row || jsonb_build_object('created_at', now());
        end if;
        if v_t = 'users' and coalesce(v_row->>'role', '') = '' then v_row := v_row || '{"role":"user"}'; end if;
        if v_t = 'likes' and coalesce(v_row->>'kind', '') = '' then v_row := v_row || '{"kind":"heart"}'; end if;
        if v_t = 'users' and v_row->'password' = 'null'::jsonb then v_row := v_row || '{"password":""}'; end if;
        -- Jeder Wert ein einzelner Wert (kein JSON-Objekt/-Array)
        if exists (select 1 from jsonb_each(v_row) e where jsonb_typeof(e.value) in ('object', 'array')) then
          raise exception using errcode = 'P0001', message = 'Ein Wert hat eine Form, die die Datenbank nicht kennt.';
        end if;
        if v_t = 'users' then
          -- Benutzername: nur Buchstaben, Ziffern, Punkt, Unterstrich
          if v_row ? 'username' and coalesce(v_row->>'username', '') !~ '^[A-Za-z0-9._]{1,30}$' then
            raise exception using errcode = 'P0001', message = 'Ein Benutzername darf nur Buchstaben, Ziffern, Punkt und Unterstrich enthalten (höchstens 30 Zeichen).';
          end if;
          -- Klartext-Passwort nie speichern: was kein bcrypt-Hash ist, wird hier gehasht
          if coalesce(v_row->>'password', '') <> '' and (v_row->>'password') !~ '^\$2[abxy]?\$[0-9]{2}\$.{53}$' then
            if char_length(v_row->>'password') > 60 then
              raise exception using errcode = 'P0001', message = 'Das Passwort ist zu lang (höchstens 60 Zeichen).';
            end if;
            v_row := v_row || jsonb_build_object('password', sh_hash(v_row->>'password'));
          end if;
        end if;
        -- Blacklist über alle Texte außer dem Passwort
        if sh_bad((select string_agg(e.value, ' ') from jsonb_each_text(v_row - 'password') e)) then
          raise exception using errcode = 'P0001', message = 'Das enthält ein gesperrtes Wort.';
        end if;
        v_row := v_row || jsonb_build_object('hub_id', p_hub);
        if v_op = 'insert' then
          execute format('insert into %I (hub_id, %s) select hub_id, %s from jsonb_populate_record(null::%I, $1)',
                         v_tab,
                         (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
                         (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
                         v_tab) using v_row;
        else
          select string_agg(format('%I = r.%I', c, c), ', ') into v_set
            from unnest(v_cols) c where not (c = any(v_pk)) and v_row ? c;
          if v_set is not null then
            execute format('update %I t set %s from jsonb_populate_record(null::%I, $1) r where t.hub_id = $2 and %s',
                           v_tab, v_set, v_tab, v_wh) using v_row, p_hub;
          end if;
        end if;
      end if;
      v_done := v_done + 1;
    end loop;

    -- Deckel je Tabelle
    if (select count(*) from sh_users where hub_id = p_hub) > 300
       or (select count(*) from sh_photos where hub_id = p_hub) > 1500
       or (select count(*) from sh_comments where hub_id = p_hub) > 5000
       or (select count(*) from sh_likes where hub_id = p_hub) > 20000
       or (select count(*) from sh_follows where hub_id = p_hub) > 20000
       or (select count(*) from sh_tags where hub_id = p_hub) > 2000
       or (select count(*) from sh_photo_tag where hub_id = p_hub) > 10000 then
      raise exception using errcode = 'P0001', message = 'So viele Zeilen passen in dieses Netzwerk nicht.';
    end if;
  exception when others then
    get stacked diagnostics v_msg = message_text, v_st = returned_sqlstate;
    v_msg := replace(replace(v_msg, '"sh_', '"'), ' sh_', ' ');
    return jsonb_build_object('ok', false, 'error', 'db_rejected', 'state', v_st,
      'message', case v_st
        when '23505' then 'Diesen Wert gibt es schon (UNIQUE / PRIMARY KEY). '
        when '23503' then 'Fremdschlüssel passt nicht: der Datensatz, auf den verwiesen wird, fehlt – oder es zeigen noch andere darauf. '
        when '23514' then 'Der Wert ist nicht erlaubt (CHECK). '
        when '23502' then 'Hier fehlt ein Pflichtwert (NOT NULL). '
        when '22P02' then 'Falscher Datentyp. '
        when '22007' then 'Datum/Zeit nicht lesbar (Form: JJJJ-MM-TT). '
        when '22008' then 'Datum/Zeit nicht lesbar (Form: JJJJ-MM-TT). '
        else '' end || v_msg);
  end;
  return jsonb_build_object('ok', true, 'done', v_done);
end;
$$;
revoke all on function sh_db_apply(text, text, uuid, text, jsonb) from public;
grant execute on function sh_db_apply(text, text, uuid, text, jsonb) to anon, authenticated;


create or replace function sh_photo_json(p_room uuid, p_hub uuid, p_id int, p_me int)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language sql
  stable
as $$
  select jsonb_build_object(
    'id', p.id, 'image', p.image, 'description', p.description, 'created_at', p.created_at,
    'user', jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar', u.avatar),
    'likes',     case when sh_on(p_room, 'likes') then (select count(*) from sh_likes l where l.hub_id = p_hub and l.photo_id = p.id) end,
    'liked',     case when sh_on(p_room, 'likes') and p_me is not null
                      then exists (select 1 from sh_likes l where l.hub_id = p_hub and l.photo_id = p.id and l.user_id = p_me) end,
    -- Arten (0267): je Art die Anzahl, dazu die eigene
    'kinds',     case when sh_on(p_room, 'likes') then (select jsonb_build_object(
                        'heart', count(*) filter (where l.kind = 'heart'),
                        'thumb', count(*) filter (where l.kind = 'thumb'),
                        'laugh', count(*) filter (where l.kind = 'laugh'))
                        from sh_likes l where l.hub_id = p_hub and l.photo_id = p.id) end,
    'my_kind',   case when sh_on(p_room, 'likes') and p_me is not null
                      then (select l.kind from sh_likes l where l.hub_id = p_hub and l.photo_id = p.id and l.user_id = p_me) end,
    'comments',  case when sh_on(p_room, 'comments') then (select count(*) from sh_comments c where c.hub_id = p_hub and c.photo_id = p.id) end,
    'tags',      case when sh_on(p_room, 'tags') then coalesce((
                        select jsonb_agg(t.name order by t.name) from sh_photo_tag pt
                          join sh_tags t on t.hub_id = pt.hub_id and t.id = pt.tag_id
                         where pt.hub_id = p_hub and pt.photo_id = p.id), '[]'::jsonb) end,
    'following', case when sh_on(p_room, 'follows') and p_me is not null
                      then exists (select 1 from sh_follows f where f.hub_id = p_hub and f.follower_id = p_me and f.following_id = u.id) end,
    'mine',      (p_me is not null and p_me = u.id))
  from sh_photos p
  join sh_users u on u.hub_id = p.hub_id and u.id = p.user_id
  where p.hub_id = p_hub and p.id = p_id;
$$;
revoke all on function sh_photo_json(uuid, uuid, int, int) from public, anon, authenticated;


create or replace function sh_like(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_photo int default null,
  p_on boolean default null,
  p_kind text default 'heart',
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  v_kind text := coalesce(nullif(btrim(coalesce(p_kind, '')), ''), 'heart');
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  if not sh_on(a.r_room, 'likes') then return sh_err('table_off'); end if;
  if v_kind not in ('heart', 'thumb', 'laugh') then return sh_err('invalid_input'); end if;
  if coalesce(p_on, true) then
    if not exists (select 1 from sh_photos where hub_id = p_hub and id = p_photo) then return sh_err('not_found'); end if;
    -- ein Like je Person und Foto; eine andere Art ersetzt die alte
    insert into sh_likes (hub_id, user_id, photo_id, kind) values (p_hub, a.r_user, p_photo, v_kind)
      on conflict (hub_id, user_id, photo_id) do update set kind = excluded.kind;
  else
    delete from sh_likes where hub_id = p_hub and user_id = a.r_user and photo_id = p_photo;
  end if;
  return jsonb_build_object('ok', true,
    'likes', (select count(*) from sh_likes where hub_id = p_hub and photo_id = p_photo),
    'kinds', (select jsonb_build_object('heart', count(*) filter (where kind = 'heart'), 'thumb', count(*) filter (where kind = 'thumb'),
                                        'laugh', count(*) filter (where kind = 'laugh'))
                from sh_likes where hub_id = p_hub and photo_id = p_photo),
    'my_kind', (select kind from sh_likes where hub_id = p_hub and photo_id = p_photo and user_id = a.r_user));
end;
$$;
revoke all on function sh_like(text, uuid, text, int, boolean, text, text) from public;
grant execute on function sh_like(text, uuid, text, int, boolean, text, text) to anon, authenticated;
