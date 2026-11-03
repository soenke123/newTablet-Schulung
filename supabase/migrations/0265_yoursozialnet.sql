-- ══════════════════════════════════════════════════════════════
-- Migration 0265 — YourSozialNet (bisher „Social Hub“): Umbau nach
-- Sönkes Rückmeldung vom 03.11.2026
-- ══════════════════════════════════════════════════════════════
-- Begriffe (nur für diesen Skill):
--   Lehrkraft  = wer den Raum eröffnet hat
--   Schüler    = wer dem Raum beitritt
--   Netzwerk   = ein soziales Netzwerk, das ein Schüler oder die
--                Lehrkraft erstellt und gestaltet (intern weiter sh_hubs)
--   User       = ein Konto in einem Netzwerk (sh_users)
--   Admin      = der Admin des Netzwerks (wer es erstellt hat)
--
-- Was sich ändert:
--   · Titel „YourSozialNet“ (id socialhub, Ordner SocialHub, sh_* bleiben).
--   · Schüler kommen nur in IHR Netzwerk (sh_access → hub_private),
--     sh_home zeigt ihnen nur das eigene. Auf einem anderen Tablet
--     melden sie sich mit Netzwerk-Name + Benutzername + Passwort an
--     (sh_login_net); mit dieser Sitzung kommt das Gerät hinein. Ein
--     klassenweites Netz der Lehrkraft kommt später.
--   · Gründen in zwei Schritten: sh_found legt nur das Netzwerk an
--     (Name, Logo, Farbe, Schema); das erste Konto, das der Gründer
--     danach registriert, wird Admin (owner_user). sh_enter meldet
--     dafür needs_admin.
--   · Schüler sind nicht mehr ohne Passwort drin (nur noch die
--     Lehrkraft in ihrem eigenen Netzwerk bleibt immer angemeldet).
--   · Admin-Rechte hängen am Konto (role admin), nicht mehr am Gerät
--     des Gründers – außer solange es noch kein Admin-Konto gibt.
--   · users.gender (enum male/female/diverse), auch in Schnappschuss
--     und sh_db_apply.
--   · sh_admin_reset (nur Lehrkraft): neues Passwort für den Admin
--     eines Netzwerks, gibt Anmeldename + Passwort zurück.
--   · Gründer darf in seinem Netzwerk bis zu 50 Konten anlegen.
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (deckt 0263–0265 mit ab).
-- ══════════════════════════════════════════════════════════════

update skill_tools set
  title = 'YourSozialNet',
  blurb = 'Erstelle dein eigenes soziales Netzwerk, poste Fotos, like und folge – und schau dann '
          'in die Datenbank dahinter: Was weiß das Netzwerk über dich?'
 where id = 'socialhub';

alter table sh_users add column if not exists gender text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sh_users_gender') then
    alter table sh_users add constraint sh_users_gender check (gender is null or gender in ('male', 'female', 'diverse'));
  end if;
end $$;

drop function if exists sh_found(text, text, text, text, text, text, text);
drop function if exists sh_register(text, uuid, text, text, text, text, text, text, text);
drop function if exists sh_me_update(text, uuid, text, text, text, text, text, text);


-- Wer bin ich in DIESEM Netzwerk? Schüler nur im eigenen (0265).
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
  r_founder := coalesce((r_part is not null and h.participant_id = r_part) or (r_tuid is not null and h.teacher_id = r_tuid), false);
  -- fremdes Netzwerk: nur mit einer Sitzung dieses Geräts (Anmelden auf
  -- einem anderen Tablet über sh_login_net)
  if not r_teacher and not r_founder and not exists (
       select 1 from sh_sessions s where s.token = p_session and s.hub_id = h.id and s.participant_id = r_part) then
    err := 'hub_private'; return;
  end if;
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
  -- Admin = Lehrkraft oder ein Konto mit role admin. Der Gründer selbst
  -- nur, solange es noch kein Admin-Konto gibt (Schritt 2, eigenes Logo).
  r_admin := r_teacher or coalesce(r_role = 'admin', false)
             or (r_founder and not exists (select 1 from sh_users u where u.hub_id = h.id and u.id = h.owner_user));
end;
$$;
revoke all on function sh_access(text, text, uuid, text) from public, anon, authenticated;


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
                    'mine', h.teacher_id = c.r_tuid,
                    'likes', (select count(*) from sh_likes l where l.hub_id = h.id),
                    'comments', (select count(*) from sh_comments m where m.hub_id = h.id),
                    'active', greatest(h.created_at,
                                (select max(created_at) from sh_photos x where x.hub_id = h.id),
                                (select max(created_at) from sh_likes x where x.hub_id = h.id),
                                (select max(created_at) from sh_comments x where x.hub_id = h.id),
                                (select max(created_at) from sh_users x where x.hub_id = h.id)))
                  else '{}'::jsonb end
               order by (h.teacher_id is distinct from c.r_tuid), (h.teacher_id is null), h.created_at)
        from sh_hubs h
        left join skill_participants p on p.id = h.participant_id
        left join profiles pr on pr.id = h.teacher_id
       where h.room_id = c.r_room
         and (c.r_teacher or h.participant_id = c.r_part
              or exists (select 1 from sh_sessions s where s.hub_id = h.id and s.participant_id = c.r_part))), '[]'::jsonb));
end;
$$;
revoke all on function sh_home(text, text) from public;
grant execute on function sh_home(text, text) to anon, authenticated;


-- Betreten. Nur die Lehrkraft bleibt in ihrem eigenen Netzwerk immer
-- angemeldet; needs_admin = der Gründer hat noch kein Admin-Konto.
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
  v_own  boolean;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  select * into h from sh_hubs where id = p_hub;
  v_own := h.owner_user is not null and exists (select 1 from sh_users where hub_id = h.id and id = h.owner_user);
  v_user := a.r_user;
  if v_user is null then v_sess := null; end if;
  if v_user is null and a.r_founder and a.r_teacher and v_own then
    v_user := h.owner_user;
    v_sess := sh_session_new(h.id, v_user, a.r_part, a.r_tuid);
  end if;
  if v_user is not null then
    select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar', u.avatar,
                              'bio', u.bio, 'city', u.city, 'gender', u.gender, 'role', u.role)
      into v_me from sh_users u where u.hub_id = h.id and u.id = v_user;
  end if;
  return jsonb_build_object('ok', true,
    'hub', sh_hub_json(h.id),
    'session', v_sess,
    'me', v_me,
    'admin', a.r_teacher or coalesce(v_me->>'role' = 'admin', false) or (a.r_founder and not v_own),
    'founder', a.r_founder,
    'teacher', a.r_teacher,
    'needs_admin', a.r_founder and not v_own,
    'tables', (select coalesce(jsonb_agg(t order by o), '[]'::jsonb) from
                 unnest(array['users','photos','follows','likes','comments','comment_likes','tags','photo_tag']) with ordinality as x(t, o)
                where sh_on(a.r_room, t)),
    'upload', sh_upload_on(a.r_room));
end;
$$;
revoke all on function sh_enter(text, text, uuid, text) from public;
grant execute on function sh_enter(text, text, uuid, text) to anon, authenticated;


-- Schritt 1: Netzwerk anlegen (ohne Konto). Ein eigenes Logo kommt
-- danach über sh_brand (der Gründer ist Admin).
create or replace function sh_found(
  p_token text default null,
  p_name text default null,
  p_logo text default null,
  p_color text default null,
  p_scheme text default 'dark',
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c      record;
  v_name text := btrim(coalesce(p_name, ''));
  v_col  text := lower(nullif(btrim(coalesce(p_color, '')), ''));
  v_hub  uuid;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if exists (select 1 from sh_hubs where (c.r_part is not null and participant_id = c.r_part)
                                   or (c.r_tuid is not null and room_id = c.r_room and teacher_id = c.r_tuid)) then return sh_err('already_founded'); end if;
  if char_length(v_name) not between 2 and 30 then return sh_err('invalid_name'); end if;
  if coalesce(p_logo, '') not in ('bell','connect','rocket','graph','trend','chat','like','mesh') then return sh_err('invalid_logo'); end if;
  if v_col is not null and v_col !~ '^#[0-9a-f]{6}$' then return sh_err('invalid_color'); end if;
  if coalesce(p_scheme, 'dark') not in ('dark', 'light') then return sh_err('invalid_input'); end if;
  if sh_bad(v_name) then return sh_err('blacklisted'); end if;
  if (select count(*) from sh_hubs where room_id = c.r_room) >= 60 then return sh_err('quota_exceeded'); end if;

  insert into sh_hubs (room_id, participant_id, teacher_id, name, logo, color, scheme)
  values (c.r_room, c.r_part, c.r_tuid, v_name, p_logo, v_col, coalesce(p_scheme, 'dark'))
  returning id into v_hub;
  return jsonb_build_object('ok', true, 'hub', v_hub);
end;
$$;
revoke all on function sh_found(text, text, text, text, text, text) from public;
grant execute on function sh_found(text, text, text, text, text, text) to anon, authenticated;


-- Registrieren. Das erste Konto des Gründers wird Admin (owner_user).
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
     or char_length(coalesce(p_city, '')) > 60 or char_length(coalesce(p_bio, '')) > 160 then return sh_err('invalid_input'); end if;
  if v_gen is not null and v_gen not in ('male', 'female', 'diverse') then return sh_err('invalid_gender'); end if;
  if p_birthday is not null and btrim(p_birthday) <> '' then
    begin v_bd := p_birthday::date; exception when others then return sh_err('invalid_birthday'); end;
    if v_bd < date '1900-01-01' or v_bd > current_date then return sh_err('invalid_birthday'); end if;
  end if;
  if sh_bad(v_user) or sh_bad(p_name) or sh_bad(p_city) or sh_bad(p_bio) then return sh_err('blacklisted'); end if;
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
  insert into sh_users (hub_id, id, username, name, email, password, birthday, city, gender, bio, role, participant_id, teacher_id)
  values (p_hub, v_id, v_user, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_email, '')), ''),
          sh_hash(p_password), v_bd, nullif(btrim(coalesce(p_city, '')), ''), v_gen, nullif(btrim(coalesce(p_bio, '')), ''),
          case when v_adm then 'admin' else 'user' end, a.r_part, a.r_tuid);
  if v_adm then update sh_hubs set owner_user = v_id where id = p_hub; end if;
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, v_id, a.r_part, a.r_tuid), 'user', v_id, 'admin', v_adm);
end;
$$;
revoke all on function sh_register(text, uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function sh_register(text, uuid, text, text, text, text, text, text, text, text, text) to anon, authenticated;


create or replace function sh_me_update(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_name text default null,
  p_bio text default null,
  p_avatar text default null,
  p_city text default null,
  p_gender text default null,
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
     or char_length(coalesce(p_city, '')) > 60 then return sh_err('invalid_input'); end if;
  if v_gen is not null and v_gen not in ('male', 'female', 'diverse') then return sh_err('invalid_gender'); end if;
  if p_avatar is not null and p_avatar <> '' and p_avatar !~ '^img_[0-9]{1,6}\.webp$' then return sh_err('invalid_input'); end if;
  if sh_bad(p_name) or sh_bad(p_bio) or sh_bad(p_city) then return sh_err('blacklisted'); end if;
  update sh_users set name = nullif(btrim(coalesce(p_name, '')), ''), bio = nullif(btrim(coalesce(p_bio, '')), ''),
         avatar = nullif(coalesce(p_avatar, ''), ''), city = nullif(btrim(coalesce(p_city, '')), ''), gender = v_gen
   where hub_id = p_hub and id = a.r_user;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_me_update(text, uuid, text, text, text, text, text, text, text) from public;
grant execute on function sh_me_update(text, uuid, text, text, text, text, text, text, text) to anon, authenticated;


-- Anmelden auf einem anderen Gerät: Netzwerk-Name + Benutzername +
-- Passwort. Danach kommt dieses Gerät mit der Sitzung hinein.
create or replace function sh_login_net(
  p_token text default null,
  p_net text default null,
  p_username text default null,
  p_password text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c record;
  u record;
begin
  select * into c from sh_ctx(p_token, null);
  if c.err is not null then return sh_err(c.err); end if;
  for u in
    select x.hub_id, x.id, x.password from sh_users x join sh_hubs h on h.id = x.hub_id
     where h.room_id = c.r_room and not h.locked and h.teacher_id is null
       and lower(h.name) = lower(btrim(coalesce(p_net, '')))
       and lower(x.username) = lower(btrim(coalesce(p_username, '')))
  loop
    if sh_pw_ok(p_password, u.password) then
      return jsonb_build_object('ok', true, 'hub', u.hub_id, 'session', sh_session_new(u.hub_id, u.id, c.r_part, null), 'user', u.id);
    end if;
  end loop;
  perform pg_sleep(0.3);
  return sh_err('wrong_login');
end;
$$;
revoke all on function sh_login_net(text, text, text, text) from public;
grant execute on function sh_login_net(text, text, text, text) to anon, authenticated;


-- Nur Lehrkraft: Admin-Passwort eines Netzwerks neu setzen und zeigen.
create or replace function sh_admin_reset(p_code text default null, p_hub uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a    record;
  u    sh_users;
  v_pw text := '';
  i    int;
begin
  select * into a from sh_access(null, p_code, p_hub, null);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_teacher then return sh_err('not_admin'); end if;
  select u2.* into u from sh_users u2 join sh_hubs h on h.id = u2.hub_id and h.owner_user = u2.id where h.id = p_hub;
  if u.id is null then
    -- kein Gründer-Konto mehr: das älteste Admin-Konto
    select * into u from sh_users where hub_id = p_hub and role = 'admin' order by id limit 1;
  end if;
  if u.id is null then return sh_err('no_admin'); end if;
  -- gut lesbar: Silben + zwei Ziffern, z. B. „bamoki42“
  for i in 1 .. 3 loop
    v_pw := v_pw || substr('bdfgklmnprstvz', 1 + floor(random() * 14)::int, 1) || substr('aeiou', 1 + floor(random() * 5)::int, 1);
  end loop;
  v_pw := v_pw || lpad(floor(random() * 100)::int::text, 2, '0');
  update sh_users set password = sh_hash(v_pw) where hub_id = p_hub and id = u.id;
  delete from sh_sessions where hub_id = p_hub and user_id = u.id;
  return jsonb_build_object('ok', true, 'username', u.username, 'password', v_pw);
end;
$$;
revoke all on function sh_admin_reset(text, uuid) from public;
grant execute on function sh_admin_reset(text, uuid) to authenticated;


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
                               'avatar', u.avatar, 'city', u.city, 'gender', u.gender, 'role', u.role, 'created_at', u.created_at),
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


-- Schnappschuss und Übernahme kennen jetzt users.gender.
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
    'cols', jsonb_build_array('id','username','name','email','password','gender','bio','avatar','birthday','city','role','created_at'),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(id, username, name, email, password, gender, bio, avatar,
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
        when 'users'         then array['id','username','name','email','password','gender','bio','avatar','birthday','city','role','created_at']
        when 'photos'        then array['id','user_id','image','description','created_at']
        when 'follows'       then array['follower_id','following_id','created_at']
        when 'likes'         then array['user_id','photo_id','created_at']
        when 'comments'      then array['id','user_id','photo_id','body','created_at']
        when 'comment_likes' then array['user_id','comment_id','created_at']
        when 'tags'          then array['id','name']
        when 'photo_tag'     then array['photo_id','tag_id'] end;
      v_pk := case v_t
        when 'follows'       then array['follower_id','following_id']
        when 'likes'         then array['user_id','photo_id']
        when 'comment_likes' then array['user_id','comment_id']
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
        if v_t = 'users' and v_row->'password' = 'null'::jsonb then v_row := v_row || '{"password":""}'; end if;
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
       or (select count(*) from sh_comment_likes where hub_id = p_hub) > 20000
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
