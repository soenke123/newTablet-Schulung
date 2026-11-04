-- ══════════════════════════════════════════════════════════════
-- Migration 0272 — YourSozialNet: Dummy-Daten laden
-- ══════════════════════════════════════════════════════════════
--   Die Lehrkraft lädt je Tabelle Beispieldaten in ALLE Netzwerke des
--   Raums (Knopf „Daten laden“ im Tabellen-Diagramm). Die Zeilen erzeugt
--   der Browser der Lehrkraft (MPSkills/tools/SocialHub/dummy/generator.js,
--   Stichtag = Raum erstellt) und schickt sie einmal je Tabelle:
--
--     sh_dummy_put(p_code, p_tbl, p_cols, p_rows)
--         prüft Form, Länge, Blacklist; hasht die Passwörter der users
--         (bcrypt, wie beim Registrieren); speichert je Raum in sh_dummy.
--     sh_dummy_load(p_code, p_tbl, p_hub)
--         füllt EIN Netzwerk (der Browser geht die Netzwerke einzeln
--         durch, damit kein Aufruf zu lange dauert).
--     sh_dummy_status(p_code)
--         Stichtag, welche Tabellen gespeichert sind, je Netzwerk was
--         geladen ist.
--
--   Netzwerke, die erst später erstellt werden, bekommen alles bereits
--   Gespeicherte beim Anlegen (Trigger auf sh_hubs).
--
--   ids: Die Dummy-ids beginnen bei 1 und werden je Netzwerk um das
--   größte vorhandene id der Tabelle verschoben (sh_hubs.dummy merkt den
--   Versatz je Tabelle); Fremdschlüssel nehmen den Versatz der Eltern-
--   Tabelle. Zeilen, deren Eltern inzwischen gelöscht sind (Schüler haben
--   per SQL gelöscht), fallen still weg. Gleicher Benutzername wie ein
--   vorhandenes Konto → Benutzername bekommt „_<id>“. Tags gleichen
--   Namens werden mitbenutzt. Jede Tabelle wird je Netzwerk nur EINMAL
--   geladen. Dummy-User sind nie Admin (role = 'user', owner_user bleibt).
--   {netz} in users.email wird je Netzwerk durch dessen Namen ersetzt.
--
--   Abhängigkeiten wie im Diagramm: photos → users; follows → users;
--   likes, comments → users + photos; tags (+ photo_tag) → photos;
--   sessions → users; views → photos + sessions.
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (Abschnitt 10).
-- ══════════════════════════════════════════════════════════════

create table if not exists sh_dummy (
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  tbl        text not null,
  rows       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, tbl),
  constraint sh_dummy_tbl check (tbl in ('users','photos','tags','photo_tag','follows','likes','comments','sessions','views'))
);
alter table sh_dummy enable row level security;
comment on table sh_dummy is 'YourSozialNet: Dummy-Daten je Raum und Tabelle (Zeilen als Arrays in festen Spalten). Seit 0272.';

alter table sh_hubs add column if not exists dummy jsonb not null default '{}'::jsonb;
comment on column sh_hubs.dummy is 'YourSozialNet: geladene Dummy-Tabellen → Versatz der ids (0272).';

-- Feste Spalten je Tabelle (so baut generator.js die Zeilen)
create or replace function sh_dummy_cols(p_tbl text)
  returns jsonb
  language sql
  immutable
as $$
  select case p_tbl
    when 'users'     then '["id","username","name","email","password","gender","bio","avatar","birthday","city","country","centimeter","role","created_at"]'
    when 'photos'    then '["id","user_id","image","description","taken_at","camera","created_at"]'
    when 'tags'      then '["id","name"]'
    when 'photo_tag' then '["photo_id","tag_id"]'
    when 'follows'   then '["follower_id","following_id","created_at"]'
    when 'likes'     then '["user_id","photo_id","kind","created_at"]'
    when 'comments'  then '["id","user_id","photo_id","body","created_at"]'
    when 'sessions'  then '["id","user_id","started_at","last_seen_at","ended_at","ip","user_agent","browser","os","device_type","device","screen_width","screen_height","pixel_ratio","language","timezone","dark_mode","connection","allow_location","allow_camera","allow_microphone","allow_notifications"]'
    when 'views'     then '["id","user_id","photo_id","session_id","viewed_at","duration_ms","feed","position","ended_by"]'
  end::jsonb;
$$;
revoke all on function sh_dummy_cols(text) from public, anon, authenticated;

create or replace function sh_dummy_needs(p_tbl text)
  returns text[]
  language sql
  immutable
as $$
  select case p_tbl
    when 'users' then '{}'::text[]
    when 'photos' then '{users}'::text[]
    when 'tags' then '{photos}'::text[]
    when 'follows' then '{users}'::text[]
    when 'likes' then '{users,photos}'::text[]
    when 'comments' then '{users,photos}'::text[]
    when 'sessions' then '{users}'::text[]
    when 'views' then '{photos,sessions}'::text[]
  end;
$$;
revoke all on function sh_dummy_needs(text) from public, anon, authenticated;

-- Text 'YYYY-MM-DD HH:MM:SS' (Ortszeit) → timestamptz
create or replace function sh_dummy_ts(p text)
  returns timestamptz
  language sql
  stable
as $$ select case when p is null then null else (p::timestamp at time zone 'Europe/Berlin') end; $$;
revoke all on function sh_dummy_ts(text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Ein Netzwerk mit einer Tabelle füllen (intern).
-- Rückgabe: Anzahl Zeilen, 0 = schon geladen / nichts gespeichert,
-- -1 = Eltern-Tabelle noch nicht geladen.
create or replace function sh_dummy_fill(p_hub uuid, p_tbl text)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  h      sh_hubs;
  d      jsonb;
  v_rows jsonb;
  v_pt   jsonb;
  v_map  jsonb;
  o      int;
  ou     int;
  op     int;
  v_os     int;
  n      int := 0;
  v_slug text;
begin
  select * into h from sh_hubs where id = p_hub for update;
  if h.id is null then return 0; end if;
  d := coalesce(h.dummy, '{}'::jsonb);
  if d ? p_tbl then return 0; end if;
  select rows into v_rows from sh_dummy where room_id = h.room_id and tbl = p_tbl;
  if v_rows is null then return 0; end if;
  if exists (select 1 from unnest(sh_dummy_needs(p_tbl)) x where not d ? x) then return -1; end if;
  perform pg_advisory_xact_lock(hashtext('sh:' || p_hub::text));
  ou := (d->>'users')::int; op := (d->>'photos')::int; v_os := (d->>'sessions')::int;

  if p_tbl = 'users' then
    o := coalesce((select max(id) from sh_users where hub_id = p_hub), 0);
    -- {netz} in den E-Mails = Name dieses Netzwerks (klein, ohne Sonderzeichen)
    v_slug := regexp_replace(replace(replace(replace(replace(lower(h.name), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), '[^a-z0-9]', '', 'g');
    if v_slug = '' then v_slug := 'netzwerk'; end if;
    insert into sh_users (hub_id, id, username, name, email, password, gender, bio, avatar, birthday, city, country, centimeter, role, created_at)
    select p_hub, (r->>0)::int + o,
           case when exists (select 1 from sh_users x where x.hub_id = p_hub and lower(x.username) = lower(r->>1))
                then left(r->>1, 22) || '_' || ((r->>0)::int + o) else r->>1 end,
           r->>2, replace(r->>3, '{netz}', v_slug), coalesce(r->>4, ''), r->>5, r->>6, r->>7, (r->>8)::date, r->>9, r->>10, (r->>11)::int,
           'user', coalesce(sh_dummy_ts(r->>13), now())
      from jsonb_array_elements(v_rows) e(r);
    get diagnostics n = row_count;

  elsif p_tbl = 'photos' then
    o := coalesce((select max(id) from sh_photos where hub_id = p_hub), 0);
    insert into sh_photos (hub_id, id, user_id, image, description, taken_at, camera, created_at)
    select p_hub, (r->>0)::int + o, (r->>1)::int + ou, r->>2, r->>3, sh_dummy_ts(r->>4), r->>5, coalesce(sh_dummy_ts(r->>6), now())
      from jsonb_array_elements(v_rows) e(r)
     where exists (select 1 from sh_users x where x.hub_id = p_hub and x.id = (r->>1)::int + ou);
    get diagnostics n = row_count;

  elsif p_tbl = 'tags' then
    -- Tags gleichen Namens (ohne Groß/klein) mitbenutzen, neue hinten anhängen
    o := coalesce((select max(id) from sh_tags where hub_id = p_hub), 0);
    with src as (select (r->>0)::int did, r->>1 nm from jsonb_array_elements(v_rows) e(r)),
         ex  as (select s.did, t.id tid from src s join sh_tags t on t.hub_id = p_hub and lower(t.name) = lower(s.nm)),
         nw  as (select s.did, s.nm, (o + row_number() over (order by s.did))::int tid from src s where s.did not in (select did from ex)),
         ins as (insert into sh_tags (hub_id, id, name) select p_hub, tid, nm from nw returning id)
    select coalesce(jsonb_object_agg(did::text, tid), '{}'::jsonb) into v_map
      from (select did, tid from ex union all select did, tid from nw) m;
    select rows into v_pt from sh_dummy where room_id = h.room_id and tbl = 'photo_tag';
    if v_pt is not null then
      insert into sh_photo_tag (hub_id, photo_id, tag_id)
      select p_hub, (r->>0)::int + op, (v_map->>(r->>1))::int
        from jsonb_array_elements(v_pt) e(r)
       where v_map ? (r->>1)
         and exists (select 1 from sh_photos x where x.hub_id = p_hub and x.id = (r->>0)::int + op)
      on conflict do nothing;
    end if;
    get diagnostics n = row_count;

  elsif p_tbl = 'follows' then
    o := 0;
    insert into sh_follows (hub_id, follower_id, following_id, created_at)
    select p_hub, (r->>0)::int + ou, (r->>1)::int + ou, coalesce(sh_dummy_ts(r->>2), now())
      from jsonb_array_elements(v_rows) e(r)
     where exists (select 1 from sh_users x where x.hub_id = p_hub and x.id = (r->>0)::int + ou)
       and exists (select 1 from sh_users x where x.hub_id = p_hub and x.id = (r->>1)::int + ou)
    on conflict do nothing;
    get diagnostics n = row_count;

  elsif p_tbl = 'likes' then
    o := 0;
    insert into sh_likes (hub_id, user_id, photo_id, kind, created_at)
    select p_hub, (r->>0)::int + ou, (r->>1)::int + op, r->>2, coalesce(sh_dummy_ts(r->>3), now())
      from jsonb_array_elements(v_rows) e(r)
     where exists (select 1 from sh_users x where x.hub_id = p_hub and x.id = (r->>0)::int + ou)
       and exists (select 1 from sh_photos x where x.hub_id = p_hub and x.id = (r->>1)::int + op)
    on conflict do nothing;
    get diagnostics n = row_count;

  elsif p_tbl = 'comments' then
    o := coalesce((select max(id) from sh_comments where hub_id = p_hub), 0);
    insert into sh_comments (hub_id, id, user_id, photo_id, body, created_at)
    select p_hub, (r->>0)::int + o, (r->>1)::int + ou, (r->>2)::int + op, r->>3, coalesce(sh_dummy_ts(r->>4), now())
      from jsonb_array_elements(v_rows) e(r)
     where exists (select 1 from sh_users x where x.hub_id = p_hub and x.id = (r->>1)::int + ou)
       and exists (select 1 from sh_photos x where x.hub_id = p_hub and x.id = (r->>2)::int + op);
    get diagnostics n = row_count;

  elsif p_tbl = 'sessions' then
    o := coalesce((select max(id) from sh_vsessions where hub_id = p_hub), 0);
    insert into sh_vsessions (hub_id, id, user_id, started_at, last_seen_at, ended_at, ip, user_agent, browser, os, device_type, device,
                              screen_width, screen_height, pixel_ratio, language, timezone, dark_mode, connection,
                              allow_location, allow_camera, allow_microphone, allow_notifications)
    select p_hub, (r->>0)::int + o, (r->>1)::int + ou, coalesce(sh_dummy_ts(r->>2), now()), coalesce(sh_dummy_ts(r->>3), now()), sh_dummy_ts(r->>4),
           r->>5, r->>6, r->>7, r->>8, r->>9, r->>10, (r->>11)::int, (r->>12)::int, (r->>13)::numeric, r->>14, r->>15,
           (r->>16)::boolean, r->>17, (r->>18)::boolean, (r->>19)::boolean, (r->>20)::boolean, (r->>21)::boolean
      from jsonb_array_elements(v_rows) e(r)
     where exists (select 1 from sh_users x where x.hub_id = p_hub and x.id = (r->>1)::int + ou);
    get diagnostics n = row_count;

  elsif p_tbl = 'views' then
    o := coalesce((select max(id) from sh_views where hub_id = p_hub), 0);
    insert into sh_views (hub_id, id, user_id, photo_id, session_id, viewed_at, duration_ms, feed, position, ended_by)
    select p_hub, (r->>0)::int + o, (r->>1)::int + ou, (r->>2)::int + op,
           case when exists (select 1 from sh_vsessions x where x.hub_id = p_hub and x.id = (r->>3)::int + v_os) then (r->>3)::int + v_os end,
           coalesce(sh_dummy_ts(r->>4), now()), (r->>5)::int, r->>6, (r->>7)::int, r->>8
      from jsonb_array_elements(v_rows) e(r)
     where exists (select 1 from sh_users x where x.hub_id = p_hub and x.id = (r->>1)::int + ou)
       and exists (select 1 from sh_photos x where x.hub_id = p_hub and x.id = (r->>2)::int + op);
    get diagnostics n = row_count;
  else
    return 0;
  end if;

  update sh_hubs set dummy = d || jsonb_build_object(p_tbl, o) where id = p_hub;
  return greatest(n, 1);
end;
$$;
revoke all on function sh_dummy_fill(uuid, text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Zeilen einer Tabelle für den Raum speichern (nur Lehrkraft)
create or replace function sh_dummy_put(
  p_code text default null, p_tbl text default null, p_cols jsonb default null, p_rows jsonb default null)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  c     record;
  v_n   int;
  v_len int;
  v_max int;
  v_txt text;
begin
  select * into c from sh_ctx(null, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if not c.r_teacher then return sh_err('not_allowed'); end if;
  if p_tbl is null or sh_dummy_cols(p_tbl) is null then return sh_err('bad_table'); end if;
  if p_cols is distinct from sh_dummy_cols(p_tbl) then return sh_err('bad_columns'); end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then return sh_err('bad_rows'); end if;
  v_n := jsonb_array_length(p_rows);
  v_max := case p_tbl when 'users' then 200 when 'photos' then 600 when 'tags' then 400 when 'photo_tag' then 2000
                      when 'follows' then 5000 when 'likes' then 8000 when 'comments' then 2000 when 'sessions' then 3000 else 20000 end;
  if v_n > v_max then return sh_err('too_many'); end if;
  v_len := jsonb_array_length(p_cols);
  -- jede Zeile ein Array der richtigen Länge, nur einzelne Werte
  if exists (select 1 from jsonb_array_elements(p_rows) e(r)
              where jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> v_len
                 or exists (select 1 from jsonb_array_elements(r) x where jsonb_typeof(x) in ('object', 'array'))) then
    return sh_err('bad_rows');
  end if;
  -- Blacklist nur über die Textspalten (ohne Passwort). Nicht über Zahlen:
  -- die Prüfung liest 4→a, 5→s, aus der id 455 würde sonst „ass“.
  if p_tbl in ('users', 'photos', 'comments', 'tags') then
    select string_agg(r->>i, ' ') into v_txt
      from jsonb_array_elements(p_rows) e(r),
           unnest(case p_tbl when 'users' then array[1,2,3,5,6,7,9,10] when 'photos' then array[2,3,5]
                             when 'comments' then array[3] else array[1] end) i;
    if sh_bad(v_txt) then return sh_err('blacklisted'); end if;
  end if;
  -- Passwörter wie beim Registrieren hashen (einmal je Raum, nicht je Netzwerk)
  if p_tbl = 'users' then
    select jsonb_agg(case when coalesce(r->>4, '') ~ '^\$2[abxy]?\$[0-9]{2}\$.{53}$' then r
                          else jsonb_set(r, '{4}', to_jsonb(sh_hash(coalesce(r->>4, '')))) end order by o)
      into p_rows
      from jsonb_array_elements(p_rows) with ordinality e(r, o);
    p_rows := coalesce(p_rows, '[]'::jsonb);
  end if;
  insert into sh_dummy (room_id, tbl, rows) values (c.r_room, p_tbl, p_rows)
  on conflict (room_id, tbl) do update set rows = excluded.rows, created_at = now();
  return jsonb_build_object('ok', true, 'rows', v_n);
end;
$$;
revoke all on function sh_dummy_put(text, text, jsonb, jsonb) from public;
grant execute on function sh_dummy_put(text, text, jsonb, jsonb) to authenticated;


-- Ein Netzwerk des Raums mit einer gespeicherten Tabelle füllen (nur Lehrkraft)
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
  if not exists (select 1 from sh_dummy where room_id = c.r_room and tbl = p_tbl) then return sh_err('no_dummy'); end if;
  v_n := sh_dummy_fill(p_hub, p_tbl);
  if v_n < 0 then return sh_err('needs'); end if;
  return jsonb_build_object('ok', true, 'rows', v_n);
end;
$$;
revoke all on function sh_dummy_load(text, text, uuid) from public;
grant execute on function sh_dummy_load(text, text, uuid) to authenticated;


-- Stand für das Diagramm der Lehrkraft
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
    'hubs',     coalesce((select jsonb_object_agg(id::text, dummy) from sh_hubs where room_id = c.r_room), '{}'::jsonb));
end;
$$;
revoke all on function sh_dummy_status(text) from public;
grant execute on function sh_dummy_status(text) to authenticated;


-- Neue Netzwerke bekommen alles, was im Raum schon gespeichert ist
create or replace function sh_hubs_dummy_fill()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare t text;
begin
  if exists (select 1 from sh_dummy where room_id = new.room_id) then
    foreach t in array array['users','photos','tags','follows','likes','comments','sessions','views'] loop
      perform sh_dummy_fill(new.id, t);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function sh_hubs_dummy_fill() from public, anon, authenticated;
drop trigger if exists sh_hubs_dummy_fill on sh_hubs;
create trigger sh_hubs_dummy_fill after insert on sh_hubs
  for each row execute function sh_hubs_dummy_fill();
