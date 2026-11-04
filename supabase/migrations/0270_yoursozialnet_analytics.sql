-- ══════════════════════════════════════════════════════════════
-- Migration 0270 — YourSozialNet: Analytics / Tracking (Sönkes Wunsch
-- 04.11.2026: „den Schülern die Augen öffnen – wie auf echten Seiten“)
-- Baut auf 0269 (Ort der Fotos raus) auf: photos ohne latitude/longitude.
-- ══════════════════════════════════════════════════════════════
-- Zwei neue Tabellen, die beim Benutzen von selbst volllaufen – wie die
-- Analytics einer echten Plattform:
--
--   sessions (intern sh_vsessions, weil sh_sessions schon die
--            Anmeldungen sind): eine Zeile je Besuch eines Users.
--            Anmeldung/Abmeldung, IP, Browser, Betriebssystem, Gerät,
--            Bildschirm, Sprache, Zeitzone, Hell/Dunkel – und die vier
--            Haken, was der User erlaubt hat (Standort, Kamera,
--            Mikrofon, Benachrichtigungen; true/false/NULL = nicht
--            gefragt).
--   views    (sh_views): eine Zeile je angesehenem Foto – wie lange es
--            im Bild war (duration_ms), in welchem Feed, an welcher
--            Stelle, und was danach kam (weitergewischt, geliked …).
--
-- ── Eingeschaltet über die Tabellen (Sönke 04.11.2026) ────────
-- Kein eigener Schalter, kein Zeitlimit: Die Lehrkraft erstellt sessions
-- (und views) im Tabellen-Diagramm wie jede andere Tabelle
-- (skill_room_state.data.tables). Solange sessions da ist, wird getrackt
-- – ohne Banner, ohne Haken für die Klasse, wie auf echten Seiten.
-- views braucht photos und sessions. Entziehen blendet nur aus, die Daten
-- bleiben (wie bei den anderen Tabellen).
--
-- ── Abfragen nur nachgebaut ───────────────────────────────────
-- Standort/Kamera/Mikrofon/Benachrichtigungen werden mit einem
-- nachgebauten „Zulassen/Blockieren“-Fenster in der App abgefragt
-- (js/track.js). Gespeichert wird, was angeklickt wurde – der Browser
-- wird NICHT wirklich gefragt, es wird nichts gemessen oder aufgenommen
-- (vercel.json braucht dafür keine Rechte). Was ohne Fragen ginge (Akku,
-- Fingerabdruck …) und was nur echte Apps können, löst die Lehrkraft am
-- Ende auf (data.reveal = true), live auf jedem Gerät, nicht gespeichert.
--
-- ── IP ────────────────────────────────────────────────────────
-- Die RPCs gehen direkt an Supabase, nicht über eine Vercel-Function –
-- der x-forwarded-for-Header kommt hier also NICHT an. Der Client holt
-- seine IP über /api/my_ip (bleibt bei uns, fra1) und reicht sie als
-- p_ip durch. In der Schule haben alle dieselbe (ein Anschluss) – genau
-- der Aha-Moment. Server prüft nur die Form, speichert sie roh.
--
-- sh_track  – ein gebündelter Aufruf alle ~10 s (Gerät + Haken + Views)
-- sh_my_data – „Was weiß das Netzwerk über MICH?“ (DSGVO Art. 15) für
--             die Aufdeckung; jeder User sieht nur seine eigenen Daten.
--
-- Nur RPCs (security definer), Rechte ausdrücklich (0225), Freigaben in
-- supabase/tests/0225_rechte_freigaben.json. Prüfstand: 0262_socialhub.mjs.
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Tabellen
-- ─────────────────────────────────────────────────────────────
-- sessions: ein Besuch eines Users. participant_id = wer dahintersteckt
-- (nur die Lehrkraft sieht es, steht nicht in der gezeigten Tabelle).
create table if not exists sh_vsessions (
  hub_id         uuid not null references sh_hubs(id) on delete cascade,
  id             int  not null,
  user_id        int  not null,
  participant_id uuid references skill_participants(id) on delete set null,
  started_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  ended_at       timestamptz,
  ip             text,
  user_agent     text,
  browser        text,
  os             text,
  device_type    text,
  device         text,
  screen_width   int,
  screen_height  int,
  pixel_ratio    numeric(3,1),
  language       text,
  timezone       text,
  dark_mode      boolean,
  connection     text,
  allow_location      boolean,
  allow_camera        boolean,
  allow_microphone    boolean,
  allow_notifications boolean,
  primary key (hub_id, id),
  foreign key (hub_id, user_id) references sh_users(hub_id, id) on delete cascade,
  constraint sh_vsessions_id_pos   check (id > 0),
  constraint sh_vsessions_ip       check (ip is null or char_length(ip) <= 45),
  constraint sh_vsessions_ua       check (user_agent is null or char_length(user_agent) <= 400),
  constraint sh_vsessions_browser  check (browser is null or char_length(browser) <= 60),
  constraint sh_vsessions_os       check (os is null or char_length(os) <= 60),
  constraint sh_vsessions_dtype    check (device_type is null or device_type in ('phone','tablet','desktop')),
  constraint sh_vsessions_device   check (device is null or char_length(device) <= 80),
  constraint sh_vsessions_sw       check (screen_width  is null or screen_width  between 0 and 20000),
  constraint sh_vsessions_sh       check (screen_height is null or screen_height between 0 and 20000),
  constraint sh_vsessions_pr       check (pixel_ratio is null or pixel_ratio between 0 and 10),
  constraint sh_vsessions_lang     check (language is null or char_length(language) <= 20),
  constraint sh_vsessions_tz       check (timezone is null or char_length(timezone) <= 60),
  constraint sh_vsessions_conn     check (connection is null or char_length(connection) <= 20)
);
create index if not exists sh_vsessions_user_idx on sh_vsessions(hub_id, user_id);
create index if not exists sh_vsessions_part_idx on sh_vsessions(participant_id);
alter table sh_vsessions enable row level security;

-- views: ein angesehenes Foto. session_id → sessions (bleibt, wenn die
-- Session gelöscht wird: dann NULL).
create table if not exists sh_views (
  hub_id      uuid not null,
  id          int  not null,
  user_id     int  not null,
  photo_id    int  not null,
  session_id  int,
  viewed_at   timestamptz not null default now(),
  duration_ms int,
  feed        text,
  position    int,
  ended_by    text,
  primary key (hub_id, id),
  foreign key (hub_id, user_id)    references sh_users(hub_id, id)      on delete cascade,
  foreign key (hub_id, photo_id)   references sh_photos(hub_id, id)     on delete cascade,
  foreign key (hub_id, session_id) references sh_vsessions(hub_id, id)  on delete set null,
  constraint sh_views_id_pos   check (id > 0),
  constraint sh_views_ms       check (duration_ms is null or duration_ms between 0 and 86400000),
  constraint sh_views_feed     check (feed is null or feed in ('foryou','following','profile','search','tag')),
  constraint sh_views_pos      check (position is null or position between 0 and 100000),
  constraint sh_views_end      check (ended_by is null or ended_by in ('swipe','like','comment','profile','tag','leave'))
);
create index if not exists sh_views_photo_idx   on sh_views(hub_id, photo_id);
create index if not exists sh_views_user_idx     on sh_views(hub_id, user_id);
create index if not exists sh_views_session_idx  on sh_views(hub_id, session_id);
alter table sh_views enable row level security;

comment on table sh_vsessions is 'YourSozialNet: Analytics – ein Besuch je User (sessions). Seit 0270.';
comment on table sh_views     is 'YourSozialNet: Analytics – ein angesehenes Foto (views). Seit 0270.';


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer
-- ─────────────────────────────────────────────────────────────
-- Gezeigter Name → interne Relation. Nur 'sessions' weicht ab, weil
-- sh_sessions schon die Anmeldungen sind.
create or replace function sh_tbl(p_t text)
  returns text
  language sql
  immutable
as $$ select case p_t when 'sessions' then 'sh_vsessions' else 'sh_' || p_t end; $$;
revoke all on function sh_tbl(text) from public, anon, authenticated;

-- Eine frühere Fassung (lief als 0269 auf einem Seitenzweig) hatte einen Schalter mit Zeitlimit –
-- falls sie schon eingespielt war, die Helfer wieder weg.
drop function if exists sh_analytics_on(uuid);
drop function if exists sh_analytics_seen(uuid);


-- sh_on mit sessions/views: beide erstellt die Lehrkraft wie die anderen
-- (data.tables). views braucht photos und sessions (Fremdschlüssel).
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


-- sh_next auch für die neuen Tabellen
create or replace function sh_next(p_hub uuid, p_tbl text)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare v int;
begin
  if p_tbl not in ('sh_users','sh_photos','sh_comments','sh_tags','sh_media','sh_vsessions','sh_views') then raise exception 'bad table'; end if;
  perform pg_advisory_xact_lock(hashtext('sh:' || p_hub::text));
  execute format('select coalesce(max(id), 0) + 1 from %I where hub_id = $1', p_tbl) into v using p_hub;
  return v;
end;
$$;
revoke all on function sh_next(uuid, text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) sh_track — ein gebündelter Aufruf (Gerät + Haken + Views)
-- ─────────────────────────────────────────────────────────────
-- Der Browser sammelt ~10 s und ruft dann einmal auf. p_vsid = die beim
-- ersten Mal zurückgegebene Session-id (danach mitschicken). Alles still
-- geprüft: Falsches fällt weg, es wird nie ein Fehler geworfen, damit das
-- Benutzen nie hakt.
create or replace function sh_track(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_vsid int default null,
  p_device jsonb default null,
  p_perms jsonb default null,
  p_views jsonb default '[]'::jsonb,
  p_end boolean default false,
  p_ip text default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  v_id   int := p_vsid;
  o      jsonb;
  v_ip   text;
  v_n    int := 0;
  v_pid  int;
  v_ms   int;
  v_feed text;
  v_pos  int;
  v_end  text;
  v_dt   text;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  -- nur angemeldete User, nur solange die Lehrkraft sessions erstellt hat
  if a.r_user is null or not sh_on(a.r_room, 'sessions') then
    return jsonb_build_object('ok', true, 'tracked', false);
  end if;

  -- IP nur der Form nach prüfen (v4/v6 grob), roh speichern
  v_ip := nullif(btrim(coalesce(p_ip, '')), '');
  if v_ip is not null and (char_length(v_ip) > 45 or v_ip !~ '^[0-9a-fA-F:.]+$') then v_ip := null; end if;

  -- Session: anlegen oder auffrischen
  if v_id is not null and exists (select 1 from sh_vsessions where hub_id = p_hub and id = v_id and user_id = a.r_user) then
    update sh_vsessions set
      last_seen_at = now(),
      ended_at = case when p_end then now() else ended_at end,
      allow_location      = coalesce((p_perms->>'location')::boolean,      allow_location),
      allow_camera        = coalesce((p_perms->>'camera')::boolean,        allow_camera),
      allow_microphone    = coalesce((p_perms->>'microphone')::boolean,    allow_microphone),
      allow_notifications = coalesce((p_perms->>'notifications')::boolean,  allow_notifications)
    where hub_id = p_hub and id = v_id;
  else
    if (select count(*) from sh_vsessions where hub_id = p_hub) >= 5000 then
      return jsonb_build_object('ok', true, 'tracked', false);
    end if;
    v_dt := case when (p_device->>'device_type') in ('phone','tablet','desktop') then p_device->>'device_type' end;
    v_id := sh_next(p_hub, 'sh_vsessions');
    insert into sh_vsessions (hub_id, id, user_id, participant_id, ip, user_agent, browser, os, device_type, device,
        screen_width, screen_height, pixel_ratio, language, timezone, dark_mode, connection,
        allow_location, allow_camera, allow_microphone, allow_notifications)
    values (p_hub, v_id, a.r_user, a.r_part, v_ip,
        left(nullif(btrim(coalesce(p_device->>'user_agent','')),''), 400),
        left(nullif(btrim(coalesce(p_device->>'browser','')),''), 60),
        left(nullif(btrim(coalesce(p_device->>'os','')),''), 60),
        v_dt,
        left(nullif(btrim(coalesce(p_device->>'device','')),''), 80),
        case when (p_device->>'screen_width')  ~ '^[0-9]{1,5}$' then (p_device->>'screen_width')::int end,
        case when (p_device->>'screen_height') ~ '^[0-9]{1,5}$' then (p_device->>'screen_height')::int end,
        case when (p_device->>'pixel_ratio') ~ '^[0-9]{1,2}(\.[0-9])?$' then (p_device->>'pixel_ratio')::numeric end,
        left(nullif(btrim(coalesce(p_device->>'language','')),''), 20),
        left(nullif(btrim(coalesce(p_device->>'timezone','')),''), 60),
        (p_device->>'dark_mode')::boolean,
        left(nullif(btrim(coalesce(p_device->>'connection','')),''), 20),
        (p_perms->>'location')::boolean, (p_perms->>'camera')::boolean,
        (p_perms->>'microphone')::boolean, (p_perms->>'notifications')::boolean);
  end if;

  -- Views (nur mit photos), höchstens 200 je Aufruf; Deckel je Netzwerk
  if sh_on(a.r_room, 'views') and jsonb_typeof(p_views) = 'array'
     and (select count(*) from sh_views where hub_id = p_hub) < 100000 then
    for o in select value from jsonb_array_elements(p_views) loop
      exit when v_n >= 200;
      v_pid := case when (o->>'photo') ~ '^[0-9]{1,9}$' then (o->>'photo')::int end;
      continue when v_pid is null or not exists (select 1 from sh_photos where hub_id = p_hub and id = v_pid);
      v_ms   := case when (o->>'ms')  ~ '^[0-9]{1,9}$' then least((o->>'ms')::int, 86400000) end;
      v_feed := case when (o->>'feed') in ('foryou','following','profile','search','tag') then o->>'feed' end;
      v_pos  := case when (o->>'pos') ~ '^[0-9]{1,6}$' then (o->>'pos')::int end;
      v_end  := case when (o->>'end') in ('swipe','like','comment','profile','tag','leave') then o->>'end' end;
      insert into sh_views (hub_id, id, user_id, photo_id, session_id, viewed_at, duration_ms, feed, position, ended_by)
      values (p_hub, sh_next(p_hub, 'sh_views'), a.r_user, v_pid, v_id, now(), v_ms, v_feed, v_pos, v_end);
      v_n := v_n + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'tracked', true, 'vsid', v_id, 'views', v_n);
end;
$$;
revoke all on function sh_track(text, uuid, text, int, jsonb, jsonb, jsonb, boolean, text, text) from public;
grant execute on function sh_track(text, uuid, text, int, jsonb, jsonb, jsonb, boolean, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) sh_my_data — „Was weiß das Netzwerk über MICH?“ (Aufdeckung)
-- ─────────────────────────────────────────────────────────────
-- Jeder User sieht nur seine eigenen Analytics. Gibt die eigenen
-- Sessions (mit Haken) und eine Zusammenfassung der Views zurück.
create or replace function sh_my_data(
  p_token text default null, p_hub uuid default null, p_session text default null, p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
  stable
as $$
declare
  a record;
  f text := 'YYYY-MM-DD HH24:MI:SS';
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  return jsonb_build_object('ok', true,
    'on', sh_on(a.r_room, 'sessions'),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'started_at', to_char(s.started_at, f), 'ended_at', to_char(s.ended_at, f),
        'ip', s.ip, 'browser', s.browser, 'os', s.os, 'device', s.device, 'device_type', s.device_type,
        'screen', case when s.screen_width is not null then s.screen_width || '×' || s.screen_height end,
        'pixel_ratio', s.pixel_ratio, 'language', s.language, 'timezone', s.timezone, 'dark_mode', s.dark_mode,
        'connection', s.connection,
        'allow', jsonb_build_object('location', s.allow_location, 'camera', s.allow_camera,
                                    'microphone', s.allow_microphone, 'notifications', s.allow_notifications))
        order by s.started_at desc)
      from sh_vsessions s where s.hub_id = p_hub and s.user_id = a.r_user), '[]'::jsonb),
    'views', (select jsonb_build_object(
        'count', count(*),
        'photos', count(distinct photo_id),
        'total_ms', coalesce(sum(duration_ms), 0),
        'longest_ms', coalesce(max(duration_ms), 0),
        'first', to_char(min(viewed_at), f),
        'last', to_char(max(viewed_at), f))
      from sh_views where hub_id = p_hub and user_id = a.r_user));
end;
$$;
revoke all on function sh_my_data(text, uuid, text, text) from public;
grant execute on function sh_my_data(text, uuid, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Schnappschuss + sh_db_apply mit sessions/views
-- ─────────────────────────────────────────────────────────────
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
    'cols', jsonb_build_array('id','user_id','image','description','taken_at','camera','created_at'),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, image, description, to_char(taken_at, f), camera, to_char(created_at, f)) order by id)
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
  -- Analytics (0270): sessions ohne participant_id (das sieht nur die Lehrkraft)
  if sh_on(a.r_room, 'sessions') then
    v := v || jsonb_build_object('sessions', jsonb_build_object(
      'cols', jsonb_build_array('id','user_id','started_at','last_seen_at','ended_at','ip','user_agent','browser','os',
                                'device_type','device','screen_width','screen_height','pixel_ratio','language','timezone',
                                'dark_mode','connection','allow_location','allow_camera','allow_microphone','allow_notifications'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, to_char(started_at, f), to_char(last_seen_at, f), to_char(ended_at, f),
                                ip, user_agent, browser, os, device_type, device, screen_width, screen_height, pixel_ratio,
                                language, timezone, dark_mode, connection, allow_location, allow_camera, allow_microphone, allow_notifications) order by id)
                          from sh_vsessions where hub_id = p_hub), '[]'::jsonb)));
  end if;
  if sh_on(a.r_room, 'views') then
    v := v || jsonb_build_object('views', jsonb_build_object(
      'cols', jsonb_build_array('id','user_id','photo_id','session_id','viewed_at','duration_ms','feed','position','ended_by'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, photo_id, session_id, to_char(viewed_at, f), duration_ms, feed, position, ended_by) order by id)
                          from sh_views where hub_id = p_hub), '[]'::jsonb)));
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
        when 'photos'        then array['id','user_id','image','description','taken_at','camera','created_at']
        when 'follows'       then array['follower_id','following_id','created_at']
        when 'likes'         then array['user_id','photo_id','kind','created_at']
        when 'comments'      then array['id','user_id','photo_id','body','created_at']
        when 'tags'          then array['id','name']
        when 'photo_tag'     then array['photo_id','tag_id']
        when 'sessions'      then array['id','user_id','started_at','last_seen_at','ended_at','ip','user_agent','browser','os','device_type','device','screen_width','screen_height','pixel_ratio','language','timezone','dark_mode','connection','allow_location','allow_camera','allow_microphone','allow_notifications']
        when 'views'         then array['id','user_id','photo_id','session_id','viewed_at','duration_ms','feed','position','ended_by'] end;
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
      v_tab := sh_tbl(v_t);

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
       or (select count(*) from sh_photo_tag where hub_id = p_hub) > 10000
       or (select count(*) from sh_vsessions where hub_id = p_hub) > 5000
       or (select count(*) from sh_views where hub_id = p_hub) > 100000 then
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


-- ─────────────────────────────────────────────────────────────
-- 6) sh_home / sh_enter: sessions + views in die Tabellenliste
-- ─────────────────────────────────────────────────────────────
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
                 unnest(array['users','photos','follows','likes','comments','comment_likes','tags','photo_tag','sessions','views']) with ordinality as x(t, o)
                where sh_on(a.r_room, t)),
    'upload', sh_upload_on(a.r_room));
end;
$$;
revoke all on function sh_enter(text, text, uuid, text) from public;
grant execute on function sh_enter(text, text, uuid, text) to anon, authenticated;
