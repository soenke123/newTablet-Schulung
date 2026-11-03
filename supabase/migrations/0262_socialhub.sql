-- ══════════════════════════════════════════════════════════════
-- Migration 0262 — Social Hub (neuer MPSkill, Beta, nur für Admins)
-- ══════════════════════════════════════════════════════════════
-- Achtzehnter Skill: eine soziale Plattform im Stil von TikTok (Fotos
-- statt Videos, endloses Scrollen, „Für dich“), an der die Klasse
-- relationale Datenbanken lernt — Vorbild InstaHub. Plan:
-- MPSkills/PLAN_FEED_SKILL.md, Doku: MPSkills/tools/SocialHub/CLAUDE.md.
--
-- ── Hubs ──────────────────────────────────────────────────────
-- Im Raum gründet JEDE Person (Teilnehmer) ihren eigenen Hub: Name +
-- Logo (eins der 8 aus Startup Story oder ein eigenes Bild) und das
-- erste Konto, das Admin ist. Die anderen registrieren sich auf
-- fremden Hubs (Konto je Hub, wie bei echten Plattformen). Die
-- Lehrkraft (Besitzer/eingeladen, über p_code) ist auf jedem Hub
-- Admin und sieht die Übersicht aller Hubs.
--
-- ── Tabellen ──────────────────────────────────────────────────
-- Was die Klasse im Datenbank-Reiter sieht, heißt wie bei InstaHub:
--   users, photos, follows, likes, comments, comment_likes, tags, photo_tag
-- Intern: sh_<name> mit hub_id davor; ids je Hub ab 1 (sh_next).
-- users und photos gibt es immer; die anderen „erstellt“ die Lehrkraft
-- per Knopf für alle Hubs im Raum:
--   skill_room_state.data = { "tables": ["follows","likes","comments",
--                             "comment_likes","tags"], "upload": true }
--   (tags bringt photo_tag mit; upload fehlt = an)
-- Ist eine Tabelle nicht erstellt, gibt es weder die Funktion in der
-- App noch die Tabelle im Schnappschuss.
--
-- ── Anmelden ──────────────────────────────────────────────────
-- Konto = Zeile in sh_users mit bcrypt-Hash (pgcrypto, $2a$) in
-- `password` — sichtbar im Datenbank-Reiter wie bei InstaHub. Anmelden
-- mit Benutzername + Passwort auf jedem Gerät im Raum; die Sitzung
-- (sh_sessions) hängt an Hub, Konto und Gerät (Teilnehmer). Der
-- Gründer ist auf seinem Gerät ohne Passwort drin (sh_enter).
-- Wer per SQL ein Passwort im Klartext einfügt, kommt nicht rein
-- (sh_pw_ok sagt dann false) — gewollt, Hashing wird so zum Thema.
--
-- ── Datenbank-Reiter ──────────────────────────────────────────
-- sh_db_snapshot liefert die erstellten Tabellen des Hubs; der Browser
-- baut daraus SQLite (Kern von SQL Studio) und führt dort SELECT aus.
-- INSERT/UPDATE/DELETE: der Browser rechnet die geänderten Zeilen aus
-- und schickt sie an sh_db_apply — der Server übernimmt sie (eine
-- Transaktion, Spalten-Whitelist, Fremdschlüssel, Blacklist) oder
-- lehnt alles ab. Schreiben darf jeder Admin des Hubs (Sönke: „alle
-- dürfen schreiben“). Der Server führt nie fremdes SQL aus.
--
-- ── Bilder ────────────────────────────────────────────────────
-- Fotos werden im Gerät verkleinert (≤1080 px, WebP/JPEG ≤ ~250 KB +
-- Vorschau 320 px) und liegen in sh_media (bytea), in den Tabellen
-- steht nur der Name img_<n>.webp. Geht mit Hub/Raum.
--
-- Nur RPCs (security definer), keine Grants auf Tabellen (CLAUDE.md,
-- NEUE TABELLE). Rechte je Funktion ausdrücklich (0225), Freigaben in
-- supabase/tests/0225_rechte_freigaben.json. Kein DROP, idempotent.
-- Prüfstand: supabase/tests/0262_socialhub.mjs
--
-- sort_order 35: im Fach Informatik hinter SQL Studio (34).
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, admin_only, sort_order) values
  ('socialhub', 'Social Hub',
   'Gründe deine eigene soziale Plattform, poste Fotos, like und folge – und schau dann '
   'in die Datenbank dahinter: Was weiß die Plattform über dich?',
   '📱', 'SocialHub', 'Informatik', true,
   '{}'::jsonb, true, true, 35)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  admin_only = excluded.admin_only,
  sort_order = excluded.sort_order;


-- ─────────────────────────────────────────────────────────────
-- 1) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists sh_hubs (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  participant_id uuid not null unique references skill_participants(id) on delete cascade,
  name           text not null,
  logo           text not null default 'bell',
  logo_img       bytea,
  owner_user     int,
  locked         boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint sh_hubs_name_len check (char_length(name) between 1 and 30),
  constraint sh_hubs_logo     check (logo in ('bell','connect','rocket','graph','trend','chat','like','mesh','custom')),
  constraint sh_hubs_logo_img check (logo_img is null or octet_length(logo_img) <= 120000)
);
create index if not exists sh_hubs_room_idx on sh_hubs(room_id);
alter table sh_hubs enable row level security;

create table if not exists sh_users (
  hub_id         uuid not null references sh_hubs(id) on delete cascade,
  id             int  not null,
  username       text not null,
  name           text,
  email          text,
  password       text not null default '',
  bio            text,
  avatar         text,
  birthday       date,
  city           text,
  role           text not null default 'user',
  created_at     timestamptz not null default now(),
  participant_id uuid references skill_participants(id) on delete set null,
  primary key (hub_id, id),
  constraint sh_users_id_pos    check (id > 0),
  constraint sh_users_username  check (char_length(username) between 1 and 30),
  constraint sh_users_name      check (name is null or char_length(name) <= 60),
  constraint sh_users_email     check (email is null or char_length(email) <= 100),
  constraint sh_users_password  check (char_length(password) <= 100),
  constraint sh_users_bio       check (bio is null or char_length(bio) <= 300),
  constraint sh_users_avatar    check (avatar is null or char_length(avatar) <= 60),
  constraint sh_users_city      check (city is null or char_length(city) <= 60),
  constraint sh_users_role      check (role in ('user','admin'))
);
create unique index if not exists sh_users_username_uq on sh_users(hub_id, lower(username));
create index if not exists sh_users_part_idx on sh_users(participant_id);
alter table sh_users enable row level security;

create table if not exists sh_photos (
  hub_id      uuid not null,
  id          int  not null,
  user_id     int  not null,
  image       text not null,
  description text,
  created_at  timestamptz not null default now(),
  primary key (hub_id, id),
  foreign key (hub_id, user_id) references sh_users(hub_id, id) on delete cascade,
  constraint sh_photos_id_pos check (id > 0),
  constraint sh_photos_image  check (char_length(image) between 1 and 60),
  constraint sh_photos_desc   check (description is null or char_length(description) <= 500)
);
alter table sh_photos enable row level security;

create table if not exists sh_follows (
  hub_id       uuid not null,
  follower_id  int  not null,
  following_id int  not null,
  created_at   timestamptz not null default now(),
  primary key (hub_id, follower_id, following_id),
  foreign key (hub_id, follower_id)  references sh_users(hub_id, id) on delete cascade,
  foreign key (hub_id, following_id) references sh_users(hub_id, id) on delete cascade
);
alter table sh_follows enable row level security;

create table if not exists sh_likes (
  hub_id     uuid not null,
  user_id    int  not null,
  photo_id   int  not null,
  created_at timestamptz not null default now(),
  primary key (hub_id, user_id, photo_id),
  foreign key (hub_id, user_id)  references sh_users(hub_id, id)  on delete cascade,
  foreign key (hub_id, photo_id) references sh_photos(hub_id, id) on delete cascade
);
create index if not exists sh_likes_photo_idx on sh_likes(hub_id, photo_id);
alter table sh_likes enable row level security;

create table if not exists sh_comments (
  hub_id     uuid not null,
  id         int  not null,
  user_id    int  not null,
  photo_id   int  not null,
  body       text not null,
  created_at timestamptz not null default now(),
  primary key (hub_id, id),
  foreign key (hub_id, user_id)  references sh_users(hub_id, id)  on delete cascade,
  foreign key (hub_id, photo_id) references sh_photos(hub_id, id) on delete cascade,
  constraint sh_comments_id_pos check (id > 0),
  constraint sh_comments_body   check (char_length(body) between 1 and 500)
);
create index if not exists sh_comments_photo_idx on sh_comments(hub_id, photo_id);
alter table sh_comments enable row level security;

create table if not exists sh_comment_likes (
  hub_id     uuid not null,
  user_id    int  not null,
  comment_id int  not null,
  created_at timestamptz not null default now(),
  primary key (hub_id, user_id, comment_id),
  foreign key (hub_id, user_id)    references sh_users(hub_id, id)    on delete cascade,
  foreign key (hub_id, comment_id) references sh_comments(hub_id, id) on delete cascade
);
alter table sh_comment_likes enable row level security;

create table if not exists sh_tags (
  hub_id uuid not null references sh_hubs(id) on delete cascade,
  id     int  not null,
  name   text not null,
  primary key (hub_id, id),
  constraint sh_tags_id_pos check (id > 0),
  constraint sh_tags_name   check (char_length(name) between 1 and 40)
);
create unique index if not exists sh_tags_name_uq on sh_tags(hub_id, lower(name));
alter table sh_tags enable row level security;

create table if not exists sh_photo_tag (
  hub_id   uuid not null,
  photo_id int  not null,
  tag_id   int  not null,
  primary key (hub_id, photo_id, tag_id),
  foreign key (hub_id, photo_id) references sh_photos(hub_id, id) on delete cascade,
  foreign key (hub_id, tag_id)   references sh_tags(hub_id, id)   on delete cascade
);
alter table sh_photo_tag enable row level security;

-- Bilder (intern, nicht im Schnappschuss). participant_id = wer hochlud.
create table if not exists sh_media (
  hub_id         uuid not null references sh_hubs(id) on delete cascade,
  id             int  not null,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  participant_id uuid references skill_participants(id) on delete set null,
  mime           text not null,
  data           bytea not null,
  thumb          bytea not null,
  created_at     timestamptz not null default now(),
  primary key (hub_id, id),
  constraint sh_media_mime  check (mime in ('image/webp','image/jpeg','image/png')),
  constraint sh_media_size  check (octet_length(data) <= 320000 and octet_length(thumb) <= 60000)
);
create index if not exists sh_media_room_idx on sh_media(room_id);
create index if not exists sh_media_part_idx on sh_media(participant_id);
alter table sh_media enable row level security;

create table if not exists sh_sessions (
  token          text primary key,
  hub_id         uuid not null,
  user_id        int  not null,
  participant_id uuid not null references skill_participants(id) on delete cascade,
  created_at     timestamptz not null default now(),
  foreign key (hub_id, user_id) references sh_users(hub_id, id) on delete cascade
);
create index if not exists sh_sessions_user_idx on sh_sessions(hub_id, user_id);
create index if not exists sh_sessions_part_idx on sh_sessions(participant_id);
alter table sh_sessions enable row level security;

comment on table sh_hubs     is 'Social Hub: ein Hub (Plattform) je Teilnehmer im Raum. Seit 0262.';
comment on table sh_users    is 'Social Hub: Konten je Hub (users). password = bcrypt-Hash. Seit 0262.';
comment on table sh_media    is 'Social Hub: hochgeladene Bilder (verkleinert im Gerät). Seit 0262.';
comment on table sh_sessions is 'Social Hub: Anmeldungen je Gerät (Teilnehmer). Seit 0262.';


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer
-- ─────────────────────────────────────────────────────────────
-- Wer ruft? Lehrkraft (p_code + auth) oder Teilnehmer (p_token).
create or replace function sh_ctx(
  p_token text, p_code text,
  out r_room uuid, out r_part uuid, out r_teacher boolean, out err text)
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
    r_room := v_r.id; r_teacher := true;
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


-- Wer bin ich in DIESEM Hub? (Konto aus der Sitzung, Admin ja/nein)
create or replace function sh_access(
  p_token text, p_code text, p_hub uuid, p_session text,
  out r_room uuid, out r_part uuid, out r_teacher boolean, out r_founder boolean,
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
  r_room := c.r_room; r_part := c.r_part; r_teacher := c.r_teacher;
  select * into h from sh_hubs where id = p_hub and room_id = c.r_room;
  if h.id is null then err := 'hub_not_found'; return; end if;
  r_founder := (r_part is not null and h.participant_id = r_part);
  if h.locked and not r_teacher then err := 'hub_locked'; return; end if;
  if p_session is not null and r_part is not null then
    select s.user_id into v_u from sh_sessions s
     where s.token = p_session and s.hub_id = h.id and s.participant_id = r_part;
    if v_u is not null then
      r_user := v_u;
      select u.role into r_role from sh_users u where u.hub_id = h.id and u.id = v_u;
    end if;
  end if;
  r_admin := r_teacher or r_founder or coalesce(r_role = 'admin', false);
end;
$$;
revoke all on function sh_access(text, text, uuid, text) from public, anon, authenticated;


-- Ist die Tabelle im Raum erstellt?
create or replace function sh_on(p_room uuid, p_t text)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case when p_t in ('users', 'photos') then true
              when p_t = 'photo_tag' then coalesce((select (data->'tables') ? 'tags' from skill_room_state where room_id = p_room), false)
              else coalesce((select (data->'tables') ? p_t from skill_room_state where room_id = p_room), false) end;
$$;
revoke all on function sh_on(uuid, text) from public, anon, authenticated;

create or replace function sh_upload_on(p_room uuid)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce((select (data->'upload') is distinct from 'false'::jsonb from skill_room_state where room_id = p_room), true);
$$;
revoke all on function sh_upload_on(uuid) from public, anon, authenticated;


-- Nächste id je Hub (ab 1). Sperrt den Hub für die Transaktion.
create or replace function sh_next(p_hub uuid, p_tbl text)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare v int;
begin
  if p_tbl not in ('sh_users','sh_photos','sh_comments','sh_tags','sh_media') then raise exception 'bad table'; end if;
  perform pg_advisory_xact_lock(hashtext('sh:' || p_hub::text));
  execute format('select coalesce(max(id), 0) + 1 from %I where hub_id = $1', p_tbl) into v using p_hub;
  return v;
end;
$$;
revoke all on function sh_next(uuid, text) from public, anon, authenticated;


create or replace function sh_hash(p_pw text)
  returns text
  security definer
  set search_path = public, extensions
  language sql
  volatile
as $$
  select crypt(p_pw, gen_salt('bf', 8));
$$;
revoke all on function sh_hash(text) from public, anon, authenticated;

-- Passwort prüfen. Kein Hash (Klartext per SQL eingefügt) → false.
create or replace function sh_pw_ok(p_pw text, p_hash text)
  returns boolean
  security definer
  set search_path = public, extensions
  language plpgsql
  stable
as $$
begin
  if p_hash is null or p_hash !~ '^\$2[abxy]?\$[0-9]{2}\$.{53}$' then return false; end if;
  return crypt(coalesce(p_pw, ''), p_hash) = p_hash;
exception when others then
  return false;
end;
$$;
revoke all on function sh_pw_ok(text, text) from public, anon, authenticated;


create or replace function sh_session_new(p_hub uuid, p_user int, p_part uuid)
  returns text
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare v text := encode(gen_random_bytes(24), 'hex');
begin
  insert into sh_sessions (token, hub_id, user_id, participant_id) values (v, p_hub, p_user, p_part);
  -- höchstens 20 Sitzungen je Konto
  delete from sh_sessions where token in (
    select token from sh_sessions where hub_id = p_hub and user_id = p_user
     order by created_at desc offset 20);
  return v;
end;
$$;
revoke all on function sh_session_new(uuid, int, uuid) from public, anon, authenticated;


create or replace function sh_err(p_code text)
  returns jsonb
  language sql
  immutable
as $$ select jsonb_build_object('ok', false, 'error', p_code); $$;
revoke all on function sh_err(text) from public, anon, authenticated;


-- Ein Foto als JSON für Feed und Profil.
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


create or replace function sh_hub_json(p_hub uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('id', h.id, 'name', h.name, 'logo', h.logo, 'locked', h.locked,
    'owner', (select u.username from sh_users u where u.hub_id = h.id and u.id = h.owner_user),
    'users',  (select count(*) from sh_users u where u.hub_id = h.id),
    'photos', (select count(*) from sh_photos p where p.hub_id = h.id))
  from sh_hubs h where h.id = p_hub;
$$;
revoke all on function sh_hub_json(uuid) from public, anon, authenticated;


-- Name eines Kontos/Hubs/Tags in Ordnung? (Blacklist)
create or replace function sh_bad(p text)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$ select p is not null and contains_blacklisted_text(p); $$;
revoke all on function sh_bad(text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Start, Hub gründen, Marke
-- ─────────────────────────────────────────────────────────────
-- Startseite: alle Hubs im Raum, der eigene, was erstellt ist.
-- Die Lehrkraft bekommt zusätzlich Gründer-Name und Zahlen.
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
    'mine', (select h.id from sh_hubs h where c.r_part is not null and h.participant_id = c.r_part),
    'hubs', coalesce((
      select jsonb_agg(sh_hub_json(h.id)
               || case when c.r_teacher then jsonb_build_object(
                    'person', coalesce(p.name, 'Tablet ' || p.seat),
                    'likes', (select count(*) from sh_likes l where l.hub_id = h.id),
                    'comments', (select count(*) from sh_comments m where m.hub_id = h.id),
                    'active', greatest(h.created_at,
                                (select max(created_at) from sh_photos x where x.hub_id = h.id),
                                (select max(created_at) from sh_likes x where x.hub_id = h.id),
                                (select max(created_at) from sh_comments x where x.hub_id = h.id),
                                (select max(created_at) from sh_users x where x.hub_id = h.id)))
                  else '{}'::jsonb end
               order by h.created_at)
        from sh_hubs h join skill_participants p on p.id = h.participant_id
       where h.room_id = c.r_room and (c.r_teacher or not h.locked)), '[]'::jsonb));
end;
$$;
revoke all on function sh_home(text, text) from public;
grant execute on function sh_home(text, text) to anon, authenticated;


-- Hub gründen: Name, Logo, erstes Konto (Admin). Ein Hub je Person.
create or replace function sh_found(
  p_token text, p_name text, p_logo text, p_username text, p_password text, p_display text default null)
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
  select * into c from sh_ctx(p_token, null);
  if c.err is not null then return sh_err(c.err); end if;
  if exists (select 1 from sh_hubs where participant_id = c.r_part) then return sh_err('already_founded'); end if;
  if char_length(v_name) not between 2 and 30 then return sh_err('invalid_name'); end if;
  if coalesce(p_logo, '') not in ('bell','connect','rocket','graph','trend','chat','like','mesh') then return sh_err('invalid_logo'); end if;
  if v_user !~ '^[a-z0-9._]{3,24}$' then return sh_err('invalid_username'); end if;
  if char_length(coalesce(p_password, '')) not between 4 and 60 then return sh_err('invalid_password'); end if;
  if char_length(coalesce(p_display, '')) > 40 then return sh_err('invalid_input'); end if;
  if sh_bad(v_name) or sh_bad(v_user) or sh_bad(p_display) then return sh_err('blacklisted'); end if;
  if (select count(*) from sh_hubs where room_id = c.r_room) >= 60 then return sh_err('quota_exceeded'); end if;

  insert into sh_hubs (room_id, participant_id, name, logo) values (c.r_room, c.r_part, v_name, p_logo)
  returning id into v_hub;
  insert into sh_users (hub_id, id, username, name, password, role, participant_id)
  values (v_hub, 1, v_user, nullif(btrim(coalesce(p_display, '')), ''), sh_hash(p_password), 'admin', c.r_part);
  update sh_hubs set owner_user = 1 where id = v_hub;
  return jsonb_build_object('ok', true, 'hub', v_hub, 'session', sh_session_new(v_hub, 1, c.r_part));
end;
$$;
revoke all on function sh_found(text, text, text, text, text, text) from public;
grant execute on function sh_found(text, text, text, text, text, text) to anon, authenticated;


-- Hub betreten: Marke, wer bin ich, was ist erstellt. Der Gründer ist
-- auf seinem Gerät ohne Passwort drin (neue Sitzung für sein Konto).
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
    v_sess := sh_session_new(h.id, v_user, a.r_part);
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


-- Name und Logo ändern (Admin des Hubs oder Lehrkraft).
-- p_logo 'custom' + p_logo_img (Base64, im Gerät auf 512 px verkleinert).
create or replace function sh_brand(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_name text default null, p_logo text default null, p_logo_img text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  v_name text := btrim(coalesce(p_name, ''));
  v_img  bytea;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if char_length(v_name) not between 2 and 30 then return sh_err('invalid_name'); end if;
  if sh_bad(v_name) then return sh_err('blacklisted'); end if;
  if coalesce(p_logo, '') not in ('bell','connect','rocket','graph','trend','chat','like','mesh','custom') then return sh_err('invalid_logo'); end if;
  if p_logo = 'custom' and p_logo_img is not null then
    begin v_img := decode(p_logo_img, 'base64'); exception when others then return sh_err('invalid_input'); end;
    if octet_length(v_img) > 120000 then return sh_err('payload_too_big'); end if;
  end if;
  if p_logo = 'custom' and v_img is null and (select logo_img from sh_hubs where id = p_hub) is null then
    return sh_err('invalid_logo');
  end if;
  update sh_hubs set name = v_name, logo = p_logo,
         logo_img = case when p_logo = 'custom' then coalesce(v_img, logo_img) else null end
   where id = p_hub;
  return jsonb_build_object('ok', true, 'hub', sh_hub_json(p_hub));
end;
$$;
revoke all on function sh_brand(text, text, uuid, text, text, text, text) from public;
grant execute on function sh_brand(text, text, uuid, text, text, text, text) to anon, authenticated;


-- Eigenes Logo holen (jede Person im Raum).
create or replace function sh_logo_get(p_token text default null, p_code text default null, p_hub uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  c record;
  v bytea;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  select logo_img into v from sh_hubs where id = p_hub and room_id = c.r_room;
  return jsonb_build_object('ok', true, 'img', case when v is null then null else encode(v, 'base64') end);
end;
$$;
revoke all on function sh_logo_get(text, text, uuid) from public;
grant execute on function sh_logo_get(text, text, uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Registrieren, Anmelden, Abmelden
-- ─────────────────────────────────────────────────────────────
create or replace function sh_register(
  p_token text, p_hub uuid, p_username text, p_password text,
  p_name text default null, p_email text default null, p_birthday text default null, p_city text default null)
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
  select * into a from sh_access(p_token, null, p_hub, null);
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
  -- höchstens 3 Konten je Gerät und Hub
  if (select count(*) from sh_users where hub_id = p_hub and participant_id = a.r_part) >= 3 then
    return sh_err('too_many_accounts');
  end if;
  v_id := sh_next(p_hub, 'sh_users');
  insert into sh_users (hub_id, id, username, name, email, password, birthday, city, participant_id)
  values (p_hub, v_id, v_user, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_email, '')), ''),
          sh_hash(p_password), v_bd, nullif(btrim(coalesce(p_city, '')), ''), a.r_part);
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, v_id, a.r_part), 'user', v_id);
end;
$$;
revoke all on function sh_register(text, uuid, text, text, text, text, text, text) from public;
grant execute on function sh_register(text, uuid, text, text, text, text, text, text) to anon, authenticated;


create or replace function sh_login(p_token text, p_hub uuid, p_username text, p_password text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a record;
  u sh_users;
begin
  select * into a from sh_access(p_token, null, p_hub, null);
  if a.err is not null then return sh_err(a.err); end if;
  select * into u from sh_users where hub_id = p_hub and lower(username) = lower(btrim(coalesce(p_username, '')));
  if u.id is null or not sh_pw_ok(p_password, u.password) then
    perform pg_sleep(0.3);
    return sh_err('wrong_login');
  end if;
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, u.id, a.r_part), 'user', u.id);
end;
$$;
revoke all on function sh_login(text, uuid, text, text) from public;
grant execute on function sh_login(text, uuid, text, text) to anon, authenticated;


-- Abmelden: diese Sitzung oder (p_all) alle Sitzungen des Kontos.
create or replace function sh_logout(p_token text, p_hub uuid, p_session text, p_all boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
revoke all on function sh_logout(text, uuid, text, boolean) from public;
grant execute on function sh_logout(text, uuid, text, boolean) to anon, authenticated;


-- Eigenes Profil ändern.
create or replace function sh_me_update(
  p_token text, p_hub uuid, p_session text,
  p_name text default null, p_bio text default null, p_avatar text default null, p_city text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
revoke all on function sh_me_update(text, uuid, text, text, text, text, text) from public;
grant execute on function sh_me_update(text, uuid, text, text, text, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Feed, Profil, Suche, Kommentare (lesen)
-- ─────────────────────────────────────────────────────────────
-- p_mode: foryou (Algorithmus) · following · tag (p_arg = Name) · user (p_arg = id)
-- p_seed: Zufall je Scroll-Durchgang, damit die Seiten zusammenpassen.
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
    'photos_n', (select count(*) from sh_photos where hub_id = p_hub and user_id = u.id),
    'followers', case when fo then (select count(*) from sh_follows where hub_id = p_hub and following_id = u.id) end,
    'following', case when fo then (select count(*) from sh_follows where hub_id = p_hub and follower_id = u.id) end,
    'i_follow',  case when fo and a.r_user is not null then exists (select 1 from sh_follows where hub_id = p_hub and follower_id = a.r_user and following_id = u.id) end,
    'likes',     case when sh_on(a.r_room, 'likes') then (select count(*) from sh_likes l join sh_photos p on p.hub_id = l.hub_id and p.id = l.photo_id
                                                           where l.hub_id = p_hub and p.user_id = u.id) end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'image', p.image) order by p.created_at desc, p.id desc)
                          from sh_photos p where p.hub_id = p_hub and p.user_id = u.id), '[]'::jsonb));
end;
$$;
revoke all on function sh_profile(text, text, uuid, text, int) from public;
grant execute on function sh_profile(text, text, uuid, text, int) to anon, authenticated;


create or replace function sh_search(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_q text default '')
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  a   record;
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_p text;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  v_q := regexp_replace(v_q, '^[#@]', '');
  v_p := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object('ok', true,
    'users', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar', u.avatar)
                                        order by u.username)
                         from (select * from sh_users where hub_id = p_hub
                                 and (lower(username) like v_p or lower(coalesce(name, '')) like v_p)
                                order by username limit 30) u), '[]'::jsonb),
    'tags', case when sh_on(a.r_room, 'tags') then coalesce((
              select jsonb_agg(jsonb_build_object('name', t.name, 'n', t.n) order by t.n desc, t.name)
                from (select t.name, (select count(*) from sh_photo_tag pt where pt.hub_id = t.hub_id and pt.tag_id = t.id) n
                        from sh_tags t where t.hub_id = p_hub and lower(t.name) like v_p
                       order by 2 desc, t.name limit 30) t), '[]'::jsonb) end);
end;
$$;
revoke all on function sh_search(text, text, uuid, text, text) from public;
grant execute on function sh_search(text, text, uuid, text, text) to anon, authenticated;


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
  cl boolean;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not sh_on(a.r_room, 'comments') then return sh_err('table_off'); end if;
  cl := sh_on(a.r_room, 'comment_likes');
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(x.j order by x.n desc nulls last, x.created_at, x.id)
      from (select c.id, c.created_at,
                   case when cl then (select count(*) from sh_comment_likes k where k.hub_id = c.hub_id and k.comment_id = c.id) end n,
                   jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
                     'user', jsonb_build_object('id', u.id, 'username', u.username, 'avatar', u.avatar),
                     'hearts', case when cl then (select count(*) from sh_comment_likes k where k.hub_id = c.hub_id and k.comment_id = c.id) end,
                     'liked',  case when cl and a.r_user is not null then exists (
                                 select 1 from sh_comment_likes k where k.hub_id = c.hub_id and k.comment_id = c.id and k.user_id = a.r_user) end,
                     'mine', a.r_user is not null and a.r_user = c.user_id) j
              from sh_comments c join sh_users u on u.hub_id = c.hub_id and u.id = c.user_id
             where c.hub_id = p_hub and c.photo_id = p_photo) x), '[]'::jsonb));
end;
$$;
revoke all on function sh_comments(text, text, uuid, text, int) from public;
grant execute on function sh_comments(text, text, uuid, text, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) Handeln: posten, liken, folgen, kommentieren
-- ─────────────────────────────────────────────────────────────
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


-- Foto löschen: eigenes, oder als Admin (auch Lehrkraft) jedes.
create or replace function sh_photo_delete(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_photo int default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a record;
  n int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  delete from sh_photos where hub_id = p_hub and id = p_photo
     and (a.r_admin or (a.r_user is not null and user_id = a.r_user));
  get diagnostics n = row_count;
  if n = 0 then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_photo_delete(text, text, uuid, text, int) from public;
grant execute on function sh_photo_delete(text, text, uuid, text, int) to anon, authenticated;


create or replace function sh_like(p_token text, p_hub uuid, p_session text, p_photo int, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
revoke all on function sh_like(text, uuid, text, int, boolean) from public;
grant execute on function sh_like(text, uuid, text, int, boolean) to anon, authenticated;


create or replace function sh_follow(p_token text, p_hub uuid, p_session text, p_user int, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
revoke all on function sh_follow(text, uuid, text, int, boolean) from public;
grant execute on function sh_follow(text, uuid, text, int, boolean) to anon, authenticated;


create or replace function sh_comment_add(p_token text, p_hub uuid, p_session text, p_photo int, p_body text)
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
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
revoke all on function sh_comment_add(text, uuid, text, int, text) from public;
grant execute on function sh_comment_add(text, uuid, text, int, text) to anon, authenticated;


create or replace function sh_comment_like(p_token text, p_hub uuid, p_session text, p_comment int, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
revoke all on function sh_comment_like(text, uuid, text, int, boolean) from public;
grant execute on function sh_comment_like(text, uuid, text, int, boolean) to anon, authenticated;


create or replace function sh_comment_delete(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_comment int default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a record;
  n int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  delete from sh_comments where hub_id = p_hub and id = p_comment
     and (a.r_admin or (a.r_user is not null and user_id = a.r_user));
  get diagnostics n = row_count;
  if n = 0 then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_comment_delete(text, text, uuid, text, int) from public;
grant execute on function sh_comment_delete(text, text, uuid, text, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Bilder
-- ─────────────────────────────────────────────────────────────
-- Hochladen (schon im Gerät verkleinert). Ergebnis: Name img_<n>.webp.
-- Grenzen: 60 Bilder je Gerät im Raum, 80 MB je Raum.
create or replace function sh_media_put(
  p_token text, p_hub uuid, p_session text, p_data text, p_thumb text, p_mime text default 'image/webp')
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
  select * into a from sh_access(p_token, null, p_hub, p_session);
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
  if (select count(*) from sh_media where room_id = a.r_room and participant_id = a.r_part) >= 60 then
    return sh_err('quota_exceeded');
  end if;
  if (select coalesce(sum(octet_length(data) + octet_length(thumb)), 0) from sh_media where room_id = a.r_room) > 80000000 then
    return sh_err('room_full');
  end if;
  v_id := sh_next(p_hub, 'sh_media');
  insert into sh_media (hub_id, id, room_id, participant_id, mime, data, thumb)
  values (p_hub, v_id, a.r_room, a.r_part, p_mime, v_d, v_t);
  return jsonb_build_object('ok', true, 'name', 'img_' || v_id || '.webp');
end;
$$;
revoke all on function sh_media_put(text, uuid, text, text, text, text) from public;
grant execute on function sh_media_put(text, uuid, text, text, text, text) to anon, authenticated;


-- Bilder holen: bis 12 Namen je Aufruf, groß oder Vorschau.
create or replace function sh_media_get(
  p_token text default null, p_code text default null, p_hub uuid default null,
  p_names jsonb default '[]'::jsonb, p_thumb boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  c record;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if not exists (select 1 from sh_hubs where id = p_hub and room_id = c.r_room) then return sh_err('hub_not_found'); end if;
  if jsonb_typeof(p_names) <> 'array' or jsonb_array_length(p_names) > 12 then return sh_err('invalid_input'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_object_agg('img_' || m.id || '.webp',
             jsonb_build_object('mime', m.mime, 'b64', encode(case when coalesce(p_thumb, false) then m.thumb else m.data end, 'base64')))
      from sh_media m
     where m.hub_id = p_hub
       and m.id in (select substring(x from '^img_([0-9]{1,6})\.webp$')::int
                      from jsonb_array_elements_text(p_names) x
                     where x ~ '^img_[0-9]{1,6}\.webp$')), '{}'::jsonb));
end;
$$;
revoke all on function sh_media_get(text, text, uuid, jsonb, boolean) from public;
grant execute on function sh_media_get(text, text, uuid, jsonb, boolean) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) Admin-Bereich
-- ─────────────────────────────────────────────────────────────
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
             'person', case when a.r_teacher then (select coalesce(sp.name, 'Tablet ' || sp.seat) from skill_participants sp where sp.id = u.participant_id) end)
           order by u.id)
      from sh_users u where u.hub_id = p_hub), '[]'::jsonb));
end;
$$;
revoke all on function sh_admin_users(text, text, uuid, text) from public;
grant execute on function sh_admin_users(text, text, uuid, text) to anon, authenticated;


-- p_action: admin | user (Rolle) · password (p_value = neues Passwort) · delete
create or replace function sh_admin_user(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_user int default null, p_action text default null, p_value text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a record;
  n int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if p_action in ('admin', 'user') then
    update sh_users set role = p_action where hub_id = p_hub and id = p_user;
  elsif p_action = 'password' then
    if char_length(coalesce(p_value, '')) not between 4 and 60 then return sh_err('invalid_password'); end if;
    update sh_users set password = sh_hash(p_value) where hub_id = p_hub and id = p_user;
    get diagnostics n = row_count;
    if n > 0 then delete from sh_sessions where hub_id = p_hub and user_id = p_user; end if;
    return case when n = 0 then sh_err('not_found') else jsonb_build_object('ok', true) end;
  elsif p_action = 'delete' then
    delete from sh_users where hub_id = p_hub and id = p_user;
  else
    return sh_err('invalid_input');
  end if;
  get diagnostics n = row_count;
  if n = 0 then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_admin_user(text, text, uuid, text, int, text, text) from public;
grant execute on function sh_admin_user(text, text, uuid, text, int, text, text) to anon, authenticated;


-- Schnappschuss der erstellten Tabellen für den Datenbank-Reiter.
-- { tables: { users: { cols: [...], rows: [[...], ...] }, ... } }
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
  v := v || jsonb_build_object('photos', jsonb_build_object(
    'cols', jsonb_build_array('id','user_id','image','description','created_at'),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, image, description, to_char(created_at, f)) order by id)
                        from sh_photos where hub_id = p_hub), '[]'::jsonb)));
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


-- Änderungen aus dem Datenbank-Reiter übernehmen. p_ops = Liste von
--   { "t": "users", "op": "insert"|"update"|"delete", "key": {...}, "row": {...} }
-- in der Reihenfolge, in der sie laufen sollen (der Browser sortiert:
-- erst Löschungen von Kind zu Eltern, dann Eltern vor Kind). Alles oder
-- nichts. created_at fehlt/leer → jetzt. Zeiten in deutscher Zeit.
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
        when 'users'         then array['id','username','name','email','password','bio','avatar','birthday','city','role','created_at']
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
      raise exception using errcode = 'P0001', message = 'So viele Zeilen passen in diesen Hub nicht.';
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


-- ─────────────────────────────────────────────────────────────
-- 9) Lehrkraft: Hub sperren / löschen
-- ─────────────────────────────────────────────────────────────
create or replace function sh_hub_lock(p_code text, p_hub uuid, p_locked boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare c record; n int;
begin
  select * into c from sh_ctx(null, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  update sh_hubs set locked = coalesce(p_locked, false) where id = p_hub and room_id = c.r_room;
  get diagnostics n = row_count;
  if n = 0 then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_hub_lock(text, uuid, boolean) from public;
grant execute on function sh_hub_lock(text, uuid, boolean) to authenticated;

create or replace function sh_hub_delete(p_code text, p_hub uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare c record; n int;
begin
  select * into c from sh_ctx(null, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  delete from sh_hubs where id = p_hub and room_id = c.r_room;
  get diagnostics n = row_count;
  if n = 0 then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_hub_delete(text, uuid) from public;
grant execute on function sh_hub_delete(text, uuid) to authenticated;


-- api/ liest die Tabellen nicht direkt; Bestand für service_role wie 0215
-- ist hier nicht nötig (nur RPCs).
