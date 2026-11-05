-- ══════════════════════════════════════════════════════════════
-- Migration 0274 — YourSozialNet: das Klassen-Netz
-- ══════════════════════════════════════════════════════════════
-- Neben den eigenen Netzwerken (jeder Schüler eins, die Lehrkraft eins)
-- kann die Lehrkraft EIN Klassen-Netz je Raum erstellen (Sönke
-- 05.11.2026). Die ganze Klasse füllt es ein, zwei Wochen mit Inhalt:
--
--   - Es gehört der Lehrkraft (teacher_id) und ist mit sh_hubs.class
--     markiert. Ihr erstes Konto dort wird Admin (wie beim eigenen).
--   - Jeder Schüler des Raums sieht es auf seiner Startseite und kann
--     sich dort registrieren/anmelden (kein hub_private). Wer nicht im
--     Raum ist, kommt nicht hinein. Schüler sind normale User; Admins
--     macht die Lehrkraft später per SQL (UPDATE users SET role = 'admin').
--   - Es hat IMMER alle Tabellen (photos, follows, likes, comments,
--     tags/photo_tag, sessions, views), egal was im Tabellen-Diagramm
--     der Lehrkraft erstellt ist. Umgesetzt in sh_on: sh_access merkt
--     sich für die laufende Anfrage (set_config, nur Transaktion), dass
--     ein Klassen-Netz gemeint ist – alle Funktionen, die nach sh_access
--     sh_on(r_room, …) fragen, bekommen dann „an“. Ohne Klassen-Netz
--     bleibt alles wie bisher.
--   - Keine Dummy-Daten: der Trigger beim Anlegen lässt es aus,
--     sh_dummy_load füllt es nicht, sh_dummy_status zählt es nicht mit.
--   - Lebt wie der Raum (30 Tage, verlängerbar), geht mit ihm.
--
-- sh_found bekommt p_class (alte Fassung entfällt), sh_home liefert
-- 'class' (id des Klassen-Netzes) und zeigt es allen Schülern,
-- sh_hub_json liefert 'class'.
--
-- Prüfstand: supabase/tests/0274_yoursozialnet_klassennetz.mjs
-- ══════════════════════════════════════════════════════════════

alter table sh_hubs add column if not exists class boolean not null default false;
comment on column sh_hubs.class is 'YourSozialNet: Klassen-Netz der Lehrkraft (eins je Raum, alle Tabellen, keine Dummy-Daten). Seit 0274.';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sh_hubs_class_teacher') then
    alter table sh_hubs add constraint sh_hubs_class_teacher check (not class or teacher_id is not null);
  end if;
end $$;
create unique index if not exists sh_hubs_class_uq on sh_hubs(room_id) where class;
-- eigenes Netzwerk der Lehrkraft: weiter eins je Raum – das Klassen-Netz zählt nicht mit
drop index if exists sh_hubs_teacher_uq;
create unique index if not exists sh_hubs_teacher_own_uq on sh_hubs(room_id, teacher_id) where teacher_id is not null and not class;


-- ─────────────────────────────────────────────────────────────
-- sh_on: im Klassen-Netz sind alle Tabellen da
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
  -- gesetzt von sh_access, nur für diese Anfrage (Klassen-Netz, 0274)
  if coalesce(current_setting('sh.class_room', true), '') = p_room::text then
    return p_t in ('photos','follows','likes','comments','tags','photo_tag','sessions','views');
  end if;
  select data->'tables' into t from skill_room_state where room_id = p_room;
  if t is null or jsonb_typeof(t) <> 'array' then return false; end if;
  if p_t = 'sessions' then return t ? 'sessions'; end if;
  if p_t = 'views' then return t ? 'views' and t ? 'sessions' and t ? 'photos'; end if;
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


-- ─────────────────────────────────────────────────────────────
-- sh_access: Klassen-Netz für jeden im Raum, merkt „alle Tabellen“
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
  c   record;
  h   sh_hubs;
  v_u int;
begin
  perform set_config('sh.class_room', '', true);
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then err := c.err; return; end if;
  r_room := c.r_room; r_part := c.r_part; r_teacher := c.r_teacher; r_tuid := c.r_tuid;
  select * into h from sh_hubs where id = p_hub and room_id = c.r_room;
  if h.id is null then err := 'hub_not_found'; return; end if;
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


-- ─────────────────────────────────────────────────────────────
create or replace function sh_hub_json(p_hub uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('id', h.id, 'name', h.name, 'logo', h.logo, 'locked', h.locked,
    'color', h.color, 'scheme', h.scheme, 'teacher_hub', h.teacher_id is not null, 'class', h.class,
    'owner', (select u.username from sh_users u where u.hub_id = h.id and u.id = h.owner_user),
    'users',  (select count(*) from sh_users u where u.hub_id = h.id),
    'photos', (select count(*) from sh_photos p where p.hub_id = h.id))
  from sh_hubs h where h.id = p_hub;
$$;
revoke all on function sh_hub_json(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_found: p_class = Klassen-Netz (nur Lehrkraft, eins je Raum)
drop function if exists sh_found(text, text, text, text, text, text);
create or replace function sh_found(
  p_token text default null,
  p_name text default null,
  p_logo text default null,
  p_color text default null,
  p_scheme text default 'auto',
  p_code text default null,
  p_class boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c      record;
  v_name text := btrim(coalesce(p_name, ''));
  v_col  text := lower(nullif(btrim(coalesce(p_color, '')), ''));
  v_cls  boolean := coalesce(p_class, false);
  v_hub  uuid;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if v_cls then
    if not c.r_teacher then return sh_err('not_allowed'); end if;
    if exists (select 1 from sh_hubs where room_id = c.r_room and class) then return sh_err('already_founded'); end if;
  elsif exists (select 1 from sh_hubs where not class and ((c.r_part is not null and participant_id = c.r_part)
                                   or (c.r_tuid is not null and room_id = c.r_room and teacher_id = c.r_tuid))) then
    return sh_err('already_founded');
  end if;
  if char_length(v_name) not between 2 and 30 then return sh_err('invalid_name'); end if;
  if coalesce(p_logo, '') not in ('bell','connect','rocket','graph','trend','chat','like','mesh') then return sh_err('invalid_logo'); end if;
  if v_col is not null and v_col !~ '^#[0-9a-f]{6}$' then return sh_err('invalid_color'); end if;
  if coalesce(p_scheme, 'auto') not in ('dark', 'light', 'auto') then return sh_err('invalid_input'); end if;
  if sh_bad(v_name) then return sh_err('blacklisted'); end if;
  if (select count(*) from sh_hubs where room_id = c.r_room) >= 60 then return sh_err('quota_exceeded'); end if;

  insert into sh_hubs (room_id, participant_id, teacher_id, name, logo, color, scheme, class)
  values (c.r_room, c.r_part, c.r_tuid, v_name, p_logo, v_col, coalesce(p_scheme, 'auto'), v_cls)
  returning id into v_hub;
  return jsonb_build_object('ok', true, 'hub', v_hub);
end;
$$;
revoke all on function sh_found(text, text, text, text, text, text, boolean) from public;
grant execute on function sh_found(text, text, text, text, text, text, boolean) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_home: 'class' + Klassen-Netz für alle Schüler sichtbar
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
                 unnest(array['users','photos','follows','likes','comments','comment_likes','tags','photo_tag','sessions','views']) with ordinality as x(t, o)
                where sh_on(c.r_room, t)),
    'upload', sh_upload_on(c.r_room),
    'mine', (select h.id from sh_hubs h where not h.class
                                         and ((c.r_part is not null and h.participant_id = c.r_part)
                                           or (c.r_tuid is not null and h.room_id = c.r_room and h.teacher_id = c.r_tuid))),
    'class', (select h.id from sh_hubs h where h.room_id = c.r_room and h.class),
    'hubs', coalesce((
      select jsonb_agg(sh_hub_json(h.id)
               || case when c.r_teacher then jsonb_build_object(
                    'person', case when h.class then 'Klassen-Netz'
                                   when h.teacher_id is not null then coalesce(pr.display_name, 'Lehrkraft') || ' (Lehrkraft)'
                                   else coalesce(p.name, 'Tablet ' || p.seat) end,
                    'mine', h.teacher_id = c.r_tuid and not h.class,
                    'likes', (select count(*) from sh_likes l where l.hub_id = h.id),
                    'comments', (select count(*) from sh_comments m where m.hub_id = h.id),
                    'active', greatest(h.created_at,
                                (select max(created_at) from sh_photos x where x.hub_id = h.id),
                                (select max(created_at) from sh_likes x where x.hub_id = h.id),
                                (select max(created_at) from sh_comments x where x.hub_id = h.id),
                                (select max(created_at) from sh_users x where x.hub_id = h.id)))
                  else '{}'::jsonb end
               order by case when h.teacher_id = c.r_tuid and not h.class then 0
                             when h.participant_id = c.r_part then 0
                             when h.class then 1
                             when h.teacher_id is not null then 2 else 3 end, h.created_at)
        from sh_hubs h
        left join skill_participants p on p.id = h.participant_id
        left join profiles pr on pr.id = h.teacher_id
       where h.room_id = c.r_room
         and (c.r_teacher or h.class or h.participant_id = c.r_part
              or exists (select 1 from sh_sessions s where s.hub_id = h.id and s.participant_id = c.r_part))), '[]'::jsonb));
end;
$$;
revoke all on function sh_home(text, text) from public;
grant execute on function sh_home(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Keine Dummy-Daten im Klassen-Netz
create or replace function sh_hubs_dummy_fill()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare t text;
begin
  if new.class then return null; end if;
  if exists (select 1 from sh_dummy where room_id = new.room_id) then
    foreach t in array array['users','photos','tags','follows','likes','comments','sessions','views'] loop
      perform sh_dummy_fill(new.id, t);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function sh_hubs_dummy_fill() from public, anon, authenticated;

create or replace function sh_dummy_load(p_code text default null, p_tbl text default null, p_hub uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c   record;
  v_n int;
begin
  select * into c from sh_ctx(null, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if not c.r_teacher then return sh_err('not_allowed'); end if;
  if p_tbl is null or sh_dummy_needs(p_tbl) is null then return sh_err('bad_table'); end if;
  if not exists (select 1 from sh_hubs where id = p_hub and room_id = c.r_room) then return sh_err('not_found'); end if;
  -- Klassen-Netz: bleibt leer, die Klasse füllt es selbst (0274)
  if exists (select 1 from sh_hubs where id = p_hub and class) then return jsonb_build_object('ok', true, 'rows', 0); end if;
  if not exists (select 1 from sh_dummy where room_id = c.r_room and tbl = p_tbl) then return sh_err('no_dummy'); end if;
  v_n := sh_dummy_fill(p_hub, p_tbl);
  if v_n < 0 then return sh_err('needs'); end if;
  return jsonb_build_object('ok', true, 'rows', v_n);
end;
$$;
revoke all on function sh_dummy_load(text, text, uuid) from public;
grant execute on function sh_dummy_load(text, text, uuid) to authenticated;

create or replace function sh_dummy_status(p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  c record;
begin
  select * into c from sh_ctx(null, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if not c.r_teacher then return sh_err('not_allowed'); end if;
  return jsonb_build_object('ok', true,
    'stichtag', (select to_char(created_at at time zone 'Europe/Berlin', 'YYYY-MM-DD') from skill_rooms where id = c.r_room),
    'stored',   coalesce((select jsonb_agg(tbl order by tbl) from sh_dummy where room_id = c.r_room), '[]'::jsonb),
    'hubs',     coalesce((select jsonb_object_agg(id::text, dummy) from sh_hubs where room_id = c.r_room and not class), '{}'::jsonb));
end;
$$;
revoke all on function sh_dummy_status(text) from public;
grant execute on function sh_dummy_status(text) to authenticated;
