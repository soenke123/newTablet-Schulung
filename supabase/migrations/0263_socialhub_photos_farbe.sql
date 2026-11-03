-- ══════════════════════════════════════════════════════════════
-- Migration 0263 — Social Hub: photos wird erstellt, Farbschema je Hub
-- ══════════════════════════════════════════════════════════════
-- 1) `photos` gibt es nicht mehr immer: wie die anderen Tabellen
--    erstellt die Lehrkraft sie (skill_room_state.data.tables). Immer da
--    ist nur `users` (Registrieren, Anmelden, Profil). Was an photos
--    hängt (likes, comments, comment_likes, tags/photo_tag), gilt nur,
--    wenn photos erstellt ist; comment_likes braucht zusätzlich comments
--    (sh_on löst das auf). Ohne photos: kein Feed, kein Posten, im
--    Profil keine Fotos, im Datenbank-Reiter keine Tabelle photos.
--    Bestehende Räume aus 0262 hatten photos immer — dort einmal
--    nachtragen, damit nichts verschwindet.
--
-- 2) Farbschema je Hub im Admin-Bereich (neben Name und Logo):
--    sh_hubs.color  Akzentfarbe '#rrggbb' oder null (= aus dem Logo)
--    sh_hubs.scheme 'dark' | 'light'
--    sh_brand bekommt p_color und p_scheme (alte Fassung entfällt).
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (deckt 0263 mit ab).
-- ══════════════════════════════════════════════════════════════

alter table sh_hubs add column if not exists color  text;
alter table sh_hubs add column if not exists scheme text not null default 'dark';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sh_hubs_color') then
    alter table sh_hubs add constraint sh_hubs_color check (color is null or color ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sh_hubs_scheme') then
    alter table sh_hubs add constraint sh_hubs_scheme check (scheme in ('dark', 'light'));
  end if;
end $$;

-- Räume aus 0262: photos war immer da → in die Liste aufnehmen.
-- Nur Räume von vor dieser Migration und nur einmal (Merker photos_v),
-- damit späteres Entfernen bleibt und neue Räume ohne photos starten.
update skill_room_state s
   set data = jsonb_set(coalesce(s.data, '{}'::jsonb), '{tables}',
                coalesce(s.data->'tables', '[]'::jsonb) || '["photos"]'::jsonb) || '{"photos_v":1}'::jsonb
  from skill_rooms r
 where r.id = s.room_id and r.tool_id = 'socialhub'
   and r.created_at < timestamptz '2026-11-04 00:00:00+01'
   and not coalesce(s.data ? 'photos_v', false)
   and not coalesce((s.data->'tables') ? 'photos', false);


-- Ist die Tabelle im Raum erstellt? users immer; Abhängige nur mit photos.
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
    when 'comment_likes' then t ? 'comment_likes' and t ? 'comments'
    when 'tags'          then t ? 'tags'
    when 'photo_tag'     then t ? 'tags'
    else false end;
end;
$$;
revoke all on function sh_on(uuid, text) from public, anon, authenticated;


create or replace function sh_hub_json(p_hub uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('id', h.id, 'name', h.name, 'logo', h.logo, 'locked', h.locked,
    'color', h.color, 'scheme', h.scheme,
    'owner', (select u.username from sh_users u where u.hub_id = h.id and u.id = h.owner_user),
    'users',  (select count(*) from sh_users u where u.hub_id = h.id),
    'photos', (select count(*) from sh_photos p where p.hub_id = h.id))
  from sh_hubs h where h.id = p_hub;
$$;
revoke all on function sh_hub_json(uuid) from public, anon, authenticated;


-- Name, Logo und Farbschema (Admin des Hubs oder Lehrkraft).
drop function if exists sh_brand(text, text, uuid, text, text, text, text);
create or replace function sh_brand(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_name text default null, p_logo text default null, p_logo_img text default null,
  p_color text default null, p_scheme text default 'dark')
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  v_name text := btrim(coalesce(p_name, ''));
  v_img  bytea;
  v_col  text := lower(nullif(btrim(coalesce(p_color, '')), ''));
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if char_length(v_name) not between 2 and 30 then return sh_err('invalid_name'); end if;
  if sh_bad(v_name) then return sh_err('blacklisted'); end if;
  if coalesce(p_logo, '') not in ('bell','connect','rocket','graph','trend','chat','like','mesh','custom') then return sh_err('invalid_logo'); end if;
  if v_col is not null and v_col !~ '^#[0-9a-f]{6}$' then return sh_err('invalid_color'); end if;
  if coalesce(p_scheme, 'dark') not in ('dark', 'light') then return sh_err('invalid_input'); end if;
  if p_logo = 'custom' and p_logo_img is not null then
    begin v_img := decode(p_logo_img, 'base64'); exception when others then return sh_err('invalid_input'); end;
    if octet_length(v_img) > 120000 then return sh_err('payload_too_big'); end if;
  end if;
  if p_logo = 'custom' and v_img is null and (select logo_img from sh_hubs where id = p_hub) is null then
    return sh_err('invalid_logo');
  end if;
  update sh_hubs set name = v_name, logo = p_logo, color = v_col, scheme = coalesce(p_scheme, 'dark'),
         logo_img = case when p_logo = 'custom' then coalesce(v_img, logo_img) else null end
   where id = p_hub;
  return jsonb_build_object('ok', true, 'hub', sh_hub_json(p_hub));
end;
$$;
revoke all on function sh_brand(text, text, uuid, text, text, text, text, text, text) from public;
grant execute on function sh_brand(text, text, uuid, text, text, text, text, text, text) to anon, authenticated;


create or replace function sh_photo_post(
  p_token text, p_hub uuid, p_session text, p_image text, p_description text default null, p_tags jsonb default '[]'::jsonb)
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
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
revoke all on function sh_photo_post(text, uuid, text, text, text, jsonb) from public;
grant execute on function sh_photo_post(text, uuid, text, text, text, jsonb) to anon, authenticated;


create or replace function sh_feed(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_mode text default 'foryou', p_arg text default null, p_offset int default 0, p_limit int default 8,
  p_seed int default 0)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  a        record;
  v_likes  boolean;
  v_tags   boolean;
  v_follow boolean;
  v_lim    int := least(greatest(coalesce(p_limit, 8), 1), 20);
  v_off    int := greatest(coalesce(p_offset, 0), 0);
  v_uid    int := case when p_arg ~ '^[0-9]{1,9}$' then p_arg::int end;
  v_ids    int[];
  v_total  int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not sh_on(a.r_room, 'photos') then return jsonb_build_object('ok', true, 'off', true, 'total', 0, 'items', '[]'::jsonb); end if;
  v_likes := sh_on(a.r_room, 'likes'); v_tags := sh_on(a.r_room, 'tags'); v_follow := sh_on(a.r_room, 'follows');

  with base as (
    select p.id, p.created_at from sh_photos p
     where p.hub_id = p_hub
       and case coalesce(p_mode, 'foryou')
             when 'following' then a.r_user is not null and (p.user_id = a.r_user or (v_follow and exists (
                                     select 1 from sh_follows f where f.hub_id = p_hub and f.follower_id = a.r_user and f.following_id = p.user_id)))
             when 'tag'  then v_tags and exists (select 1 from sh_photo_tag pt join sh_tags t on t.hub_id = pt.hub_id and t.id = pt.tag_id
                                                  where pt.hub_id = p_hub and pt.photo_id = p.id and lower(t.name) = lower(coalesce(p_arg, '')))
             when 'user' then p.user_id = v_uid
             else true end
  ), mytags as (
    select distinct pt.tag_id from sh_likes l
      join sh_photo_tag pt on pt.hub_id = l.hub_id and pt.photo_id = l.photo_id
     where v_likes and v_tags and a.r_user is not null and l.hub_id = p_hub and l.user_id = a.r_user
  ), scored as (
    select b.id, b.created_at,
      case when coalesce(p_mode, 'foryou') = 'foryou' then
          2.0 * (select count(*) from sh_photo_tag pt where pt.hub_id = p_hub and pt.photo_id = b.id and pt.tag_id in (select tag_id from mytags))
        + case when v_likes then ln(1 + (select count(*) from sh_likes l where l.hub_id = p_hub and l.photo_id = b.id)) else 0 end
        - extract(epoch from (now() - b.created_at)) / 172800.0
        + (abs(hashtext(b.id::text || ':' || coalesce(p_seed, 0)::text)) % 1000) / 350.0
      else 0 end as score
    from base b
  )
  select array_agg(id order by ord), max(n) into v_ids, v_total from (
    select s.id, row_number() over (order by s.score desc, s.created_at desc, s.id desc) as ord,
           count(*) over () as n
      from scored s
  ) x where ord > v_off and ord <= v_off + v_lim;

  return jsonb_build_object('ok', true,
    'total', v_total,
    'items', coalesce((select jsonb_agg(sh_photo_json(a.r_room, p_hub, i, a.r_user) order by o)
                         from unnest(v_ids) with ordinality as u(i, o)), '[]'::jsonb));
end;
$$;
revoke all on function sh_feed(text, text, uuid, text, text, text, int, int, int) from public;
grant execute on function sh_feed(text, text, uuid, text, text, text, int, int, int) to anon, authenticated;


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
                               'avatar', u.avatar, 'city', u.city, 'role', u.role, 'created_at', u.created_at),
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
    'cols', jsonb_build_array('id','username','name','email','password','bio','avatar','birthday','city','role','created_at'),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(id, username, name, email, password, bio, avatar,
                                to_char(birthday, 'YYYY-MM-DD'), city, role, to_char(created_at, f)) order by id)
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
      'cols', jsonb_build_array('user_id','photo_id','created_at'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(user_id, photo_id, to_char(created_at, f)) order by created_at, user_id)
                          from sh_likes where hub_id = p_hub), '[]'::jsonb)));
  end if;
  if sh_on(a.r_room, 'comments') then
    v := v || jsonb_build_object('comments', jsonb_build_object(
      'cols', jsonb_build_array('id','user_id','photo_id','body','created_at'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, photo_id, body, to_char(created_at, f)) order by id)
                          from sh_comments where hub_id = p_hub), '[]'::jsonb)));
  end if;
  if sh_on(a.r_room, 'comment_likes') and sh_on(a.r_room, 'comments') then
    v := v || jsonb_build_object('comment_likes', jsonb_build_object(
      'cols', jsonb_build_array('user_id','comment_id','created_at'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(user_id, comment_id, to_char(created_at, f)) order by created_at, user_id)
                          from sh_comment_likes where hub_id = p_hub), '[]'::jsonb)));
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
