-- ══════════════════════════════════════════════════════════════
-- Migration 0275 — YourSozialNet: das Klassen-Netz als App
-- ══════════════════════════════════════════════════════════════
-- Das Klassen-Netz (0274) bekommt eine eigene Adresse /n/<app_key>/
-- (vercel.json schreibt sie auf die App um). Dort lässt es sich als
-- App auf den Home-Bildschirm/Desktop legen – mit Name und Logo des
-- Netzes (Manifest über /api/sh_app). Die Adresse funktioniert ohne
-- Raum: auch wenn das Gerät den Raum vergessen hat oder die Tür zu ist.
--
--   - app_key: 32 Hex-Zeichen (128 Bit), nur Klassen-Netze, beim
--     Anlegen vergeben (Trigger). Bekommt nur, wer im Raum ist
--     (sh_hub_json → 'app_key').
--   - Zugang über die Adresse = p_token 'app:<app_key>'. sh_ctx kennt
--     dann weder Teilnehmer noch Lehrkraft, nur Raum und Netzwerk
--     (merkt es sich für die Anfrage in sh.app_hub); sh_access lässt
--     nur dieses eine Netzwerk zu und nimmt jede gültige Sitzung des
--     Netzwerks an (auch eine aus dem Raum, wenn sie mitkommt).
--   - Externe haben keinen Zugriff: REGISTRIEREN geht über die Adresse
--     nicht (register_in_room) – nur Konten, die im Raum angelegt
--     wurden, können sich dort anmelden. Gesperrt/Raum abgelaufen
--     gilt wie im Raum.
--   - Bremse gegen Passwort-Durchprobieren über die Adresse: mehr als
--     30 Fehlversuche in 10 Minuten je Netzwerk → 'busy' (sh_login).
--   - sh_app_info(p_key): Name, Logo, Farbe für Manifest/Kopf und die
--     Schalter des Raums (meta, reveal, revealed, upload), die die App
--     sonst vom Raum bekommt. Auch an service_role (api/sh_app.js).
--   - Sitzungen über die Adresse hängen an keinem Gerät
--     (participant_id und teacher_id leer).
--
-- Prüfstand: supabase/tests/0275_yoursozialnet_app.mjs
-- ══════════════════════════════════════════════════════════════

alter table sh_hubs add column if not exists app_key text;
alter table sh_hubs add column if not exists app_fails int not null default 0;
alter table sh_hubs add column if not exists app_fail_since timestamptz;
comment on column sh_hubs.app_key is 'YourSozialNet: geheimer Schlüssel der App-Adresse /n/<app_key>/ (nur Klassen-Netz). Seit 0275.';
create unique index if not exists sh_hubs_app_key_uq on sh_hubs(app_key) where app_key is not null;

alter table sh_sessions drop constraint if exists sh_sessions_owner;
alter table sh_sessions add constraint sh_sessions_owner check (num_nonnulls(participant_id, teacher_id) <= 1);

create or replace function sh_hubs_app_key()
  returns trigger
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
begin
  if new.class and new.app_key is null then new.app_key := encode(gen_random_bytes(16), 'hex'); end if;
  if not new.class then new.app_key := null; end if;
  return new;
end;
$$;
revoke all on function sh_hubs_app_key() from public, anon, authenticated;
drop trigger if exists sh_hubs_app_key on sh_hubs;
create trigger sh_hubs_app_key before insert or update of class on sh_hubs
  for each row execute function sh_hubs_app_key();
-- Klassen-Netze von vor 0275: Schlüssel über den Trigger nachtragen
update sh_hubs set class = class where class and app_key is null;


-- ─────────────────────────────────────────────────────────────
-- sh_ctx: 'app:<schlüssel>' = über die App-Adresse
create or replace function sh_ctx(
  p_token text, p_code text,
  out r_room uuid, out r_part uuid, out r_teacher boolean, out r_tuid uuid, out err text)
  security definer
  set search_path = public
  language plpgsql
  volatile
as $$
declare
  v_p skill_participants;
  v_r skill_rooms;
  v_h uuid;
begin
  r_teacher := false;
  perform set_config('sh.app_hub', '', true);
  if p_code is not null and btrim(p_code) <> '' then
    if auth.uid() is null then err := 'not_authenticated'; return; end if;
    select * into v_r from skill_rooms where code = upper(btrim(p_code)) and tool_id = 'socialhub';
    if v_r.id is null or not skill_room_is_teacher(v_r.id, auth.uid()) then err := 'not_found'; return; end if;
    r_room := v_r.id; r_teacher := true; r_tuid := auth.uid();
    return;
  end if;
  if p_token like 'app:%' then
    select h.id, h.room_id into v_h, r_room from sh_hubs h
     where h.class and h.app_key = substr(p_token, 5) and substr(p_token, 5) ~ '^[0-9a-f]{32}$';
    if v_h is null then r_room := null; err := 'app_not_found'; return; end if;
    select * into v_r from skill_rooms where id = r_room;
    if v_r.id is null or v_r.expires_at <= now() then err := 'room_gone'; return; end if;
    perform set_config('sh.app_hub', v_h::text, true);
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


-- ─────────────────────────────────────────────────────────────
-- sh_access: über die App-Adresse nur dieses eine Netzwerk
create or replace function sh_access(
  p_token text, p_code text, p_hub uuid, p_session text,
  out r_room uuid, out r_part uuid, out r_teacher boolean, out r_tuid uuid, out r_founder boolean,
  out r_user int, out r_role text, out r_admin boolean, out err text)
  security definer
  set search_path = public
  language plpgsql
  volatile
as $$
declare
  c     record;
  h     sh_hubs;
  v_u   int;
  v_app uuid;
begin
  perform set_config('sh.class_room', '', true);
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then err := c.err; return; end if;
  v_app := nullif(current_setting('sh.app_hub', true), '')::uuid;
  r_room := c.r_room; r_part := c.r_part; r_teacher := c.r_teacher; r_tuid := c.r_tuid;
  select * into h from sh_hubs where id = p_hub and room_id = c.r_room;
  if h.id is null or (v_app is not null and h.id <> v_app) then err := 'hub_not_found'; return; end if;
  r_founder := coalesce((r_part is not null and h.participant_id = r_part) or (r_tuid is not null and h.teacher_id = r_tuid), false);
  -- fremdes Netzwerk: nur mit einer Sitzung dieses Geräts (Anmelden auf
  -- einem anderen Tablet über sh_login_net) – das Klassen-Netz ist für alle im Raum
  if not h.class and not r_teacher and not r_founder and not exists (
       select 1 from sh_sessions s where s.token = p_session and s.hub_id = h.id and s.participant_id = r_part) then
    err := 'hub_private'; return;
  end if;
  if h.locked and not r_teacher then err := 'hub_locked'; return; end if;
  if h.class then perform set_config('sh.class_room', c.r_room::text, true); end if;
  if p_session is not null then
    select s.user_id into v_u from sh_sessions s
     where s.token = p_session and s.hub_id = h.id
       and (v_app is not null
            or (r_part is not null and s.participant_id = r_part) or (r_tuid is not null and s.teacher_id = r_tuid));
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


-- ─────────────────────────────────────────────────────────────
-- sh_hub_json: app_key für das Klassen-Netz (nur wer im Raum ist, bekommt es zu sehen)
create or replace function sh_hub_json(p_hub uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('id', h.id, 'name', h.name, 'logo', h.logo, 'locked', h.locked,
    'color', h.color, 'scheme', h.scheme, 'teacher_hub', h.teacher_id is not null, 'class', h.class,
    'app_key', h.app_key,
    'owner', (select u.username from sh_users u where u.hub_id = h.id and u.id = h.owner_user),
    'users',  (select count(*) from sh_users u where u.hub_id = h.id),
    'photos', (select count(*) from sh_photos p where p.hub_id = h.id))
  from sh_hubs h where h.id = p_hub;
$$;
revoke all on function sh_hub_json(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_login: über die App-Adresse mit Bremse
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
  a     record;
  u     sh_users;
  h     sh_hubs;
  v_app boolean;
begin
  select * into a from sh_access(p_token, p_code, p_hub, null);
  if a.err is not null then return sh_err(a.err); end if;
  v_app := a.r_part is null and a.r_tuid is null;
  if v_app then
    select * into h from sh_hubs where id = p_hub for update;
    if h.app_fail_since is null or h.app_fail_since < now() - interval '10 minutes' then
      update sh_hubs set app_fails = 0, app_fail_since = now() where id = p_hub;
    elsif h.app_fails >= 30 then
      return sh_err('busy');
    end if;
  end if;
  select * into u from sh_users where hub_id = p_hub and lower(username) = lower(btrim(coalesce(p_username, '')));
  if u.id is null or not sh_pw_ok(p_password, u.password) then
    if v_app then update sh_hubs set app_fails = app_fails + 1 where id = p_hub; end if;
    perform pg_sleep(0.3);
    return sh_err('wrong_login');
  end if;
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, u.id, a.r_part, a.r_tuid), 'user', u.id);
end;
$$;
revoke all on function sh_login(text, uuid, text, text, text) from public;
grant execute on function sh_login(text, uuid, text, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_register: über die App-Adresse nicht
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
  -- über die App-Adresse (0275) nur anmelden – registrieren geht nur im Raum
  if a.r_part is null and a.r_tuid is null then return sh_err('register_in_room'); end if;
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


-- ─────────────────────────────────────────────────────────────
-- sh_app_info: was die App-Adresse vor dem Anmelden braucht
create or replace function sh_app_info(p_key text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  h  sh_hubs;
  r  skill_rooms;
  d  jsonb;
begin
  if coalesce(p_key, '') !~ '^[0-9a-f]{32}$' then return sh_err('app_not_found'); end if;
  select * into h from sh_hubs where class and app_key = p_key;
  if h.id is null then return sh_err('app_not_found'); end if;
  select * into r from skill_rooms where id = h.room_id;
  if r.id is null or r.expires_at <= now() then return sh_err('room_gone'); end if;
  select coalesce(data, '{}'::jsonb) into d from skill_room_state where room_id = h.room_id;
  d := coalesce(d, '{}'::jsonb);
  return jsonb_build_object('ok', true,
    'hub', jsonb_build_object('id', h.id, 'name', h.name, 'logo', h.logo, 'color', h.color, 'scheme', h.scheme,
                              'locked', h.locked, 'class', true, 'app_key', h.app_key),
    'logo_img', case when h.logo = 'custom' and h.logo_img is not null then encode(h.logo_img, 'base64') end,
    'state', jsonb_build_object('meta', coalesce(d->'meta' = 'true'::jsonb, false), 'reveal', coalesce(d->'reveal' = 'true'::jsonb, false),
                                'revealed', coalesce(d->'revealed' = 'true'::jsonb, false), 'upload', sh_upload_on(h.room_id)));
end;
$$;
revoke all on function sh_app_info(text) from public;
grant execute on function sh_app_info(text) to anon, authenticated, service_role;
