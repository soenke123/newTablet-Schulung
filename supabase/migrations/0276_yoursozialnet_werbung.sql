-- ══════════════════════════════════════════════════════════════
-- Migration 0276 — YourSozialNet: Werbung (Tabelle ads)
-- ══════════════════════════════════════════════════════════════
-- Sönke 05.11.2026 (Plan: MPSkills/PLAN_FEED_SKILL.md Abschnitt 13):
-- Die Plattform spielt Werbung aus. Admins eines Netzwerks legen
-- Kampagnen an; WEM eine Kampagne gezeigt wird, entscheidet eine
-- SQL-Abfrage auf den gesammelten Daten (target_sql).
--
--   ads  (die EINZIGE neue Tabelle, die die Klasse sieht)
--        kind 'ad'    = Anzeige: eigenes Bild + Titel + Text + Knopf,
--                       im Feed als eigene Karte „Anzeige“ und als
--                       Leiste unter den Kommentaren.
--        kind 'boost' = beworbene Posts: content_sql liefert Foto-ids,
--                       die der Zielgruppe im „Für dich“-Feed
--                       vorgeschlagen und dort „Gesponsert“ markiert
--                       werden.
--        active       = an/aus (Reiter „Werbung“ oder per SQL).
--
--   target_sql – zwei Formen ($user = id des aktuellen Users):
--        mit $user  → ein Wert, wahr = passt
--        ohne $user → Liste von ids, aktueller User dabei = passt
--        leer       → alle
--
-- ── Kein Schüler-SQL auf dem Server ───────────────────────────
-- Der Server führt target_sql/content_sql NIE aus – für ihn ist es nur
-- Text. Das Gerät eines Admins rechnet die Abfragen in seiner SQLite-
-- Kopie (js/ads.js, Worker) und schickt nur ganze Zahlen:
--   sh_ads_compute → speichert sie INTERN an der Kampagne (audience,
--   content, computed_at – nicht im Schnappschuss, im SQL-Editor
--   unsichtbar). sh_feed / sh_ad_pick spielen danach nur aus diesen
--   Listen aus.
--
-- Eingeschaltet wie jede Tabelle über das Diagramm der Lehrkraft
-- (data.tables 'ads', braucht nur users); im Klassen-Netz immer an.
-- Dummy-Kampagnen (sh_dummy 'ads', user_id NULL = „von der Plattform“)
-- kommen – als Ausnahme – auch ins Klassen-Netz.
--
-- Prüfstand: supabase/tests/0276_yoursozialnet_werbung.mjs
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Tabelle
-- ─────────────────────────────────────────────────────────────
create table if not exists sh_ads (
  hub_id      uuid not null references sh_hubs(id) on delete cascade,
  id          int  not null,
  user_id     int,
  name        text not null,
  kind        text not null default 'ad',
  title       text,
  body        text,
  image       text,
  button      text,
  target_sql  text,
  content_sql text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  -- intern (nicht im Schnappschuss): berechnet vom Admin-Gerät
  audience    int[],
  content     int[],
  computed_at timestamptz,
  primary key (hub_id, id),
  foreign key (hub_id, user_id) references sh_users(hub_id, id) on delete set null (user_id),
  constraint sh_ads_id_pos   check (id > 0),
  constraint sh_ads_name     check (char_length(btrim(name)) between 1 and 60),
  constraint sh_ads_kind     check (kind in ('ad','boost')),
  constraint sh_ads_title    check (title is null or char_length(title) <= 80),
  constraint sh_ads_body     check (body is null or char_length(body) <= 300),
  constraint sh_ads_image    check (image is null or image ~ '^(img_[0-9]{1,6}|dummy/[a-z0-9_]{1,40})\.webp$'),
  constraint sh_ads_button   check (button is null or char_length(button) <= 30),
  constraint sh_ads_target   check (target_sql is null or char_length(target_sql) <= 4000),
  constraint sh_ads_content  check (content_sql is null or char_length(content_sql) <= 4000)
);
alter table sh_ads enable row level security;
comment on table sh_ads is 'YourSozialNet: Werbe-Kampagnen (ads). audience/content berechnet das Admin-Gerät (kein Schüler-SQL auf dem Server). Seit 0276.';


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer: sh_next, sh_on
-- ─────────────────────────────────────────────────────────────
create or replace function sh_next(p_hub uuid, p_tbl text)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare v int;
begin
  if p_tbl not in ('sh_users','sh_photos','sh_comments','sh_tags','sh_media','sh_vsessions','sh_views','sh_ads') then raise exception 'bad table'; end if;
  perform pg_advisory_xact_lock(hashtext('sh:' || p_hub::text));
  execute format('select coalesce(max(id), 0) + 1 from %I where hub_id = $1', p_tbl) into v using p_hub;
  return v;
end;
$$;
revoke all on function sh_next(uuid, text) from public, anon, authenticated;

-- sh_on: ads braucht nur users; im Klassen-Netz immer an
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
    return p_t in ('photos','follows','likes','comments','tags','photo_tag','sessions','views','ads');
  end if;
  select data->'tables' into t from skill_room_state where room_id = p_room;
  if t is null or jsonb_typeof(t) <> 'array' then return false; end if;
  if p_t = 'sessions' then return t ? 'sessions'; end if;
  if p_t = 'views' then return t ? 'views' and t ? 'sessions' and t ? 'photos'; end if;
  if p_t = 'follows' then return t ? 'follows'; end if;
  if p_t = 'ads' then return t ? 'ads'; end if;
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


-- Kampagnen, die zum User passen (intern). Leere Zielgruppe = alle;
-- sonst nur, wer in der berechneten Liste steht.
create or replace function sh_ads_for(p_hub uuid, p_user int, p_kind text)
  returns setof sh_ads
  security definer
  set search_path = public
  language sql
  stable
as $$
  select d.* from sh_ads d
   where d.hub_id = p_hub and d.active and d.kind = p_kind
     and (coalesce(btrim(d.target_sql), '') = ''
          or (p_user is not null and p_user = any(coalesce(d.audience, '{}'::int[]))));
$$;
revoke all on function sh_ads_for(uuid, int, text) from public, anon, authenticated;

-- Eine Kampagne als JSON für die App (mit den Abfragen für „Warum sehe ich das?“)
create or replace function sh_ad_json(p_hub uuid, p_id int)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'title', d.title, 'body', d.body,
    'image', d.image, 'button', d.button, 'target_sql', d.target_sql, 'content_sql', d.content_sql,
    'by', (select u.username from sh_users u where u.hub_id = d.hub_id and u.id = d.user_id))
  from sh_ads d where d.hub_id = p_hub and d.id = p_id;
$$;
revoke all on function sh_ad_json(uuid, int) from public, anon, authenticated;

-- Eine Anzeige (kind 'ad') für diesen User auswählen – reihum nach p_salt
create or replace function sh_ad_choose(p_hub uuid, p_user int, p_salt text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select sh_ad_json(p_hub, x.id) from sh_ads_for(p_hub, p_user, 'ad') x
   order by abs(hashtext(x.id::text || ':' || coalesce(p_salt, ''))), x.id
   limit 1;
$$;
revoke all on function sh_ad_choose(uuid, int, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) Schnappschuss + sh_db_apply mit ads
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
  -- Werbung (0276): nur die sichtbaren Spalten, audience/content bleiben intern
  if sh_on(a.r_room, 'ads') then
    v := v || jsonb_build_object('ads', jsonb_build_object(
      'cols', jsonb_build_array('id','user_id','name','kind','title','body','image','button','target_sql','content_sql','active','created_at'),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(id, user_id, name, kind, title, body, image, button, target_sql, content_sql, active, to_char(created_at, f)) order by id)
                          from sh_ads where hub_id = p_hub), '[]'::jsonb)));
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
        when 'views'         then array['id','user_id','photo_id','session_id','viewed_at','duration_ms','feed','position','ended_by']
        when 'ads'           then array['id','user_id','name','kind','title','body','image','button','target_sql','content_sql','active','created_at'] end;
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
        if v_t = 'ads' and coalesce(v_row->>'kind', '') = '' then v_row := v_row || '{"kind":"ad"}'; end if;
        if v_t = 'ads' and v_row ? 'active' and v_row->'active' = 'null'::jsonb then v_row := v_row || '{"active":true}'; end if;
        if v_t = 'ads' and v_op = 'insert' and not v_row ? 'active' then v_row := v_row || '{"active":true}'; end if;
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
          -- Passwort wird so gespeichert, wie es kommt (0271): Klartext bleibt
          -- Klartext und lesbar – Anmelden geht dann nicht (sh_pw_ok kennt nur
          -- bcrypt). Gehasht wird nur beim Registrieren oder mit PASSWORD_HASH().
          if char_length(coalesce(v_row->>'password', '')) > 100 then
            raise exception using errcode = 'P0001', message = 'Das Passwort ist zu lang (höchstens 100 Zeichen).';
          end if;
        end if;
        -- Blacklist über alle Texte außer dem Passwort (und den Abfragen der Werbung – SQL ist kein Text für Menschen)
        if sh_bad((select string_agg(e.value, ' ') from jsonb_each_text(v_row - 'password' - 'target_sql' - 'content_sql') e)) then
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
       or (select count(*) from sh_views where hub_id = p_hub) > 100000
       or (select count(*) from sh_ads where hub_id = p_hub) > 60 then
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
-- 4) sh_home / sh_enter: ads in der Tabellenliste; sh_enter sagt
--    Admins, ob es Kampagnen mit Abfragen gibt (dann rechnet das Gerät)
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
                 unnest(array['users','photos','follows','likes','comments','comment_likes','tags','photo_tag','sessions','views','ads']) with ordinality as x(t, o)
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
                 unnest(array['users','photos','follows','likes','comments','comment_likes','tags','photo_tag','sessions','views','ads']) with ordinality as x(t, o)
                where sh_on(a.r_room, t)),
    'upload', sh_upload_on(a.r_room),
    -- Werbung (0276): wie viele aktive Kampagnen mit Abfrage – nur für Admins (dann rechnet ihr Gerät)
    'ads_sql', case when sh_on(a.r_room, 'ads') and (a.r_teacher or coalesce(v_me->>'role' = 'admin', false) or (a.r_founder and not v_own))
                    then (select count(*) from sh_ads d where d.hub_id = h.id and d.active
                            and (coalesce(btrim(d.target_sql), '') <> '' or coalesce(btrim(d.content_sql), '') <> '')) end);
end;
$$;
revoke all on function sh_enter(text, text, uuid, text) from public;
grant execute on function sh_enter(text, text, uuid, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Feed: eine Anzeige je Seite, beworbene Fotos weit vorn + „Gesponsert“
-- ─────────────────────────────────────────────────────────────
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
  v_ads    boolean;
  v_boost  int[] := '{}'::int[];
  v_top    int[] := '{}'::int[];
  v_ad     jsonb;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not sh_on(a.r_room, 'photos') then return jsonb_build_object('ok', true, 'off', true, 'total', 0, 'items', '[]'::jsonb); end if;
  v_likes := sh_on(a.r_room, 'likes'); v_tags := sh_on(a.r_room, 'tags'); v_follow := sh_on(a.r_room, 'follows');
  v_ads := sh_on(a.r_room, 'ads');
  -- Werbung (0276): beworbene Fotos der Kampagnen, deren Zielgruppe passt – nur „Für dich“
  if v_ads and coalesce(p_mode, 'foryou') = 'foryou' then
    select coalesce(array_agg(distinct c), '{}'::int[]) into v_boost
      from sh_ads_for(p_hub, a.r_user, 'boost') x, unnest(coalesce(x.content, '{}'::int[])) c;
    -- je Runde (p_seed) bis zu 3 davon sicher ganz nach vorn, reihum; die übrigen nur etwas weiter oben
    select coalesce(array_agg(c), '{}'::int[]) into v_top
      from (select c from unnest(v_boost) c order by abs(hashtext(c::text || ':' || coalesce(p_seed, 0)::text)), c limit 3) y;
  end if;

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
        + case when b.id = any(v_top) then 100000.0 when b.id = any(v_boost) then 3.0 else 0 end
      else 0 end as score
    from base b
  )
  select array_agg(id order by ord), max(n) into v_ids, v_total from (
    select s.id, row_number() over (order by s.score desc, s.created_at desc, s.id desc) as ord,
           count(*) over () as n
      from scored s
  ) x where ord > v_off and ord <= v_off + v_lim;

  -- eine Anzeige je Seite (nur in den beiden Feeds, nicht bei Tag/Profil)
  if v_ads and coalesce(p_mode, 'foryou') in ('foryou', 'following') and coalesce(array_length(v_ids, 1), 0) >= 2 then
    v_ad := sh_ad_choose(p_hub, a.r_user, coalesce(p_seed, 0)::text || ':' || v_off::text);
  end if;
  return jsonb_build_object('ok', true,
    'total', v_total,
    'ad', v_ad,
    'items', coalesce((select jsonb_agg(sh_photo_json(a.r_room, p_hub, i, a.r_user)
                                        || case when i = any(v_boost) then jsonb_build_object('sponsored', (
                                             select sh_ad_json(p_hub, x.id) from sh_ads_for(p_hub, a.r_user, 'boost') x
                                              where i = any(coalesce(x.content, '{}'::int[])) order by x.id limit 1)) else '{}'::jsonb end
                                        order by o)
                         from unnest(v_ids) with ordinality as u(i, o)), '[]'::jsonb));
end;
$$;
revoke all on function sh_feed(text, text, uuid, text, text, text, int, int, int) from public;
grant execute on function sh_feed(text, text, uuid, text, text, text, int, int, int) to anon, authenticated;



-- ─────────────────────────────────────────────────────────────
-- 6) Werbung in der App und im Reiter „Werbung“
-- ─────────────────────────────────────────────────────────────
-- Eine Anzeige für die Leiste unter den Kommentaren (oder sonstwo)
create or replace function sh_ad_pick(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_salt text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not sh_on(a.r_room, 'ads') then return jsonb_build_object('ok', true, 'ad', null); end if;
  return jsonb_build_object('ok', true, 'ad', sh_ad_choose(p_hub, a.r_user, p_salt));
end;
$$;
revoke all on function sh_ad_pick(text, text, uuid, text, text) from public;
grant execute on function sh_ad_pick(text, text, uuid, text, text) to anon, authenticated;


-- Kampagne anlegen (p_id NULL) oder ändern (nur Admins)
create or replace function sh_ad_save(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id int default null,
  p_name text default null, p_kind text default 'ad',
  p_title text default null, p_body text default null, p_image text default null, p_button text default null,
  p_target text default null, p_content text default null, p_active boolean default true)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a      record;
  v_id   int;
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text := coalesce(p_kind, 'ad');
  v_img  text := nullif(btrim(coalesce(p_image, '')), '');
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if not sh_on(a.r_room, 'ads') then return sh_err('table_off'); end if;
  if char_length(v_name) not between 1 and 60 then return sh_err('invalid_name'); end if;
  if v_kind not in ('ad', 'boost') then return sh_err('invalid_input'); end if;
  if char_length(coalesce(p_title, '')) > 80 or char_length(coalesce(p_body, '')) > 300 or char_length(coalesce(p_button, '')) > 30
     or char_length(coalesce(p_target, '')) > 4000 or char_length(coalesce(p_content, '')) > 4000 then
    return sh_err('invalid_input');
  end if;
  if v_img is not null and v_img !~ '^(img_[0-9]{1,6}|dummy/[a-z0-9_]{1,40})\.webp$' then return sh_err('invalid_image'); end if;
  if sh_bad(v_name) or sh_bad(p_title) or sh_bad(p_body) or sh_bad(p_button) then return sh_err('blacklisted'); end if;
  perform pg_advisory_xact_lock(hashtext('sh:' || p_hub::text));
  if p_id is null then
    if (select count(*) from sh_ads where hub_id = p_hub) >= 60 then return sh_err('quota_exceeded'); end if;
    v_id := sh_next(p_hub, 'sh_ads');
    insert into sh_ads (hub_id, id, user_id, name, kind, title, body, image, button, target_sql, content_sql, active)
    values (p_hub, v_id, a.r_user, v_name, v_kind, nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_body, '')), ''),
            v_img, nullif(btrim(coalesce(p_button, '')), ''), nullif(btrim(coalesce(p_target, '')), ''), nullif(btrim(coalesce(p_content, '')), ''),
            coalesce(p_active, true));
  else
    update sh_ads set name = v_name, kind = v_kind,
           title = nullif(btrim(coalesce(p_title, '')), ''), body = nullif(btrim(coalesce(p_body, '')), ''),
           image = v_img, button = nullif(btrim(coalesce(p_button, '')), ''),
           -- neue Abfrage → alte Liste gilt nicht mehr, bis das Gerät neu gerechnet hat
           audience = case when target_sql is not distinct from nullif(btrim(coalesce(p_target, '')), '') then audience end,
           content  = case when content_sql is not distinct from nullif(btrim(coalesce(p_content, '')), '') then content end,
           target_sql = nullif(btrim(coalesce(p_target, '')), ''), content_sql = nullif(btrim(coalesce(p_content, '')), ''),
           active = coalesce(p_active, active)
     where hub_id = p_hub and id = p_id
    returning id into v_id;
    if v_id is null then return sh_err('not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function sh_ad_save(text, text, uuid, text, int, text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function sh_ad_save(text, text, uuid, text, int, text, text, text, text, text, text, text, text, boolean) to anon, authenticated;


-- An/aus (nur Admins)
create or replace function sh_ad_active(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id int default null, p_on boolean default true)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  update sh_ads set active = coalesce(p_on, true) where hub_id = p_hub and id = p_id;
  if not found then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_ad_active(text, text, uuid, text, int, boolean) from public;
grant execute on function sh_ad_active(text, text, uuid, text, int, boolean) to anon, authenticated;


-- Löschen (nur Admins)
create or replace function sh_ad_delete(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id int default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare a record;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  delete from sh_ads where hub_id = p_hub and id = p_id;
  if not found then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function sh_ad_delete(text, text, uuid, text, int) from public;
grant execute on function sh_ad_delete(text, text, uuid, text, int) to anon, authenticated;


-- Ergebnis der Berechnung vom Admin-Gerät übernehmen. Nur ganze Zahlen;
-- was es im Netzwerk nicht gibt, fällt still weg. Der Server führt dabei
-- kein SQL der Klasse aus.
--   p_results = [{ "id": 3, "a": [1,4,7] | null, "c": [12,15] | null }, …]
--   a null = Zielgruppe leer (alle) bzw. nicht berechnet; c null = keine Fotos
create or replace function sh_ads_compute(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_results jsonb default '[]'::jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a   record;
  o   jsonb;
  v_id int;
  v_a int[];
  v_c int[];
  n   int := 0;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if not sh_on(a.r_room, 'ads') then return sh_err('table_off'); end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 60 then return sh_err('invalid_input'); end if;
  for o in select value from jsonb_array_elements(p_results) loop
    v_id := case when (o->>'id') ~ '^[0-9]{1,9}$' then (o->>'id')::int end;
    continue when v_id is null;
    v_a := case when jsonb_typeof(o->'a') = 'array' then
             (select coalesce(array_agg(u.id order by u.id), '{}'::int[]) from sh_users u
               where u.hub_id = p_hub and u.id in (select (x #>> '{}')::int from jsonb_array_elements(o->'a') x
                                                    where jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^[0-9]{1,9}$'))
           end;
    v_c := case when jsonb_typeof(o->'c') = 'array' then
             (select coalesce(array_agg(p.id order by p.id), '{}'::int[]) from sh_photos p
               where p.hub_id = p_hub and p.id in (select (x #>> '{}')::int from jsonb_array_elements(o->'c') x
                                                    where jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^[0-9]{1,9}$'))
           end;
    update sh_ads set audience = v_a, content = v_c, computed_at = now() where hub_id = p_hub and id = v_id;
    if found then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'done', n);
end;
$$;
revoke all on function sh_ads_compute(text, text, uuid, text, jsonb) from public;
grant execute on function sh_ads_compute(text, text, uuid, text, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Dummy-Kampagnen (auch im Klassen-Netz)
-- ─────────────────────────────────────────────────────────────
alter table sh_dummy drop constraint if exists sh_dummy_tbl;
alter table sh_dummy add constraint sh_dummy_tbl check (tbl in ('users','photos','tags','photo_tag','follows','likes','comments','sessions','views','ads'));

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
    when 'ads'       then '["id","user_id","name","kind","title","body","image","button","target_sql","content_sql","active","created_at"]'
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
    when 'ads' then '{}'::text[]
  end;
$$;
revoke all on function sh_dummy_needs(text) from public, anon, authenticated;

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

  elsif p_tbl = 'ads' then
    -- Kampagnen der Plattform (user_id NULL); Abfragen sind nur Text
    o := coalesce((select max(id) from sh_ads where hub_id = p_hub), 0);
    insert into sh_ads (hub_id, id, user_id, name, kind, title, body, image, button, target_sql, content_sql, active, created_at)
    select p_hub, (r->>0)::int + o, null, r->>2, r->>3, r->>4, r->>5, r->>6, r->>7, r->>8, r->>9,
           coalesce((r->>10)::boolean, true), coalesce(sh_dummy_ts(r->>11), now())
      from jsonb_array_elements(v_rows) e(r);
    get diagnostics n = row_count;
  else
    return 0;
  end if;

  update sh_hubs set dummy = d || jsonb_build_object(p_tbl, o) where id = p_hub;
  return greatest(n, 1);
end;
$$;
revoke all on function sh_dummy_fill(uuid, text) from public, anon, authenticated;

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
                      when 'follows' then 5000 when 'likes' then 8000 when 'comments' then 2000 when 'sessions' then 3000 when 'ads' then 40 else 20000 end;
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
  if p_tbl in ('users', 'photos', 'comments', 'tags', 'ads') then
    select string_agg(r->>i, ' ') into v_txt
      from jsonb_array_elements(p_rows) e(r),
           unnest(case p_tbl when 'users' then array[1,2,3,5,6,7,9,10] when 'photos' then array[2,3,5]
                             when 'comments' then array[3] when 'ads' then array[2,4,5,7] else array[1] end) i;
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
  -- Klassen-Netz: bleibt leer, die Klasse füllt es selbst (0274) – nur die Werbung kommt hinein (0276)
  if p_tbl <> 'ads' and exists (select 1 from sh_hubs where id = p_hub and class) then return jsonb_build_object('ok', true, 'rows', 0); end if;
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
    'hubs',     coalesce((select jsonb_object_agg(id::text, dummy) from sh_hubs where room_id = c.r_room and not class), '{}'::jsonb),
    -- Klassen-Netz getrennt: dort gibt es nur die Werbung (0276)
    'class',    (select jsonb_build_object('id', id, 'dummy', dummy) from sh_hubs where room_id = c.r_room and class));
end;
$$;
revoke all on function sh_dummy_status(text) from public;
grant execute on function sh_dummy_status(text) to authenticated;

create or replace function sh_hubs_dummy_fill()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare t text;
begin
  -- Klassen-Netz: nur die Dummy-Kampagnen (0276)
  if new.class then
    perform sh_dummy_fill(new.id, 'ads');
    return null;
  end if;
  if exists (select 1 from sh_dummy where room_id = new.room_id) then
    foreach t in array array['users','photos','tags','follows','likes','comments','sessions','views','ads'] loop
      perform sh_dummy_fill(new.id, t);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function sh_hubs_dummy_fill() from public, anon, authenticated;

create or replace function sh_dummy_deps(p_tbl text)
  returns text[]
  language sql
  immutable
as $$
  select case p_tbl
    when 'users'    then '{users,photos,tags,follows,likes,comments,sessions,views}'::text[]
    when 'photos'   then '{photos,tags,likes,comments,views}'::text[]
    when 'sessions' then '{sessions,views}'::text[]
    when 'tags' then '{tags}'::text[] when 'follows' then '{follows}'::text[] when 'likes' then '{likes}'::text[]
    when 'comments' then '{comments}'::text[] when 'views' then '{views}'::text[]
    when 'ads' then '{ads}'::text[]
  end;
$$;
revoke all on function sh_dummy_deps(text) from public, anon, authenticated;

create or replace function sh_dummy_clear_hub(p_hub uuid, p_tbl text)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  h   sh_hubs;
  d   jsonb;
  t   text;
  o   int;
  ou  int; mu int;
  op  int; mp int;
  n   int := 0;
  k   int;
begin
  select * into h from sh_hubs where id = p_hub for update;
  if h.id is null then return 0; end if;
  d := coalesce(h.dummy, '{}'::jsonb);
  perform pg_advisory_xact_lock(hashtext('sh:' || p_hub::text));
  ou := (d->>'users')::int; mu := sh_dummy_maxid(h.room_id, 'users');
  op := (d->>'photos')::int; mp := sh_dummy_maxid(h.room_id, 'photos');
  -- Kinder zuerst, dann die Tabelle selbst (Reihenfolge rückwärts)
  foreach t in array (select array_agg(x order by i desc) from unnest(sh_dummy_deps(p_tbl)) with ordinality u(x, i)) loop
    if not d ? t then continue; end if;
    o := (d->>t)::int;
    if t = 'users' then
      delete from sh_users where hub_id = p_hub and id > o and id <= o + mu
        and id is distinct from h.owner_user and participant_id is null and teacher_id is null;
    elsif t = 'photos' then
      delete from sh_photos where hub_id = p_hub and id > o and id <= o + mp;
    elsif t = 'comments' then
      delete from sh_comments where hub_id = p_hub and id > o and id <= o + sh_dummy_maxid(h.room_id, 'comments');
    elsif t = 'sessions' then
      delete from sh_vsessions where hub_id = p_hub and id > o and id <= o + sh_dummy_maxid(h.room_id, 'sessions');
    elsif t = 'views' then
      delete from sh_views where hub_id = p_hub and id > o and id <= o + sh_dummy_maxid(h.room_id, 'views');
    elsif t = 'ads' then
      delete from sh_ads where hub_id = p_hub and id > o and id <= o + sh_dummy_maxid(h.room_id, 'ads') and user_id is null;
    elsif t = 'follows' and ou is not null then
      delete from sh_follows where hub_id = p_hub and follower_id > ou and follower_id <= ou + mu and following_id > ou and following_id <= ou + mu;
    elsif t = 'likes' and ou is not null and op is not null then
      delete from sh_likes where hub_id = p_hub and user_id > ou and user_id <= ou + mu and photo_id > op and photo_id <= op + mp;
    elsif t = 'tags' then
      if op is not null then
        delete from sh_photo_tag where hub_id = p_hub and photo_id > op and photo_id <= op + mp;
      end if;
      delete from sh_tags tg where tg.hub_id = p_hub and tg.id > o and tg.id <= o + sh_dummy_maxid(h.room_id, 'tags')
        and not exists (select 1 from sh_photo_tag pt where pt.hub_id = p_hub and pt.tag_id = tg.id);
    end if;
    get diagnostics k = row_count;
    n := n + k;
    d := d - t;
  end loop;
  update sh_hubs set dummy = d where id = p_hub;
  return n;
end;
$$;
revoke all on function sh_dummy_clear_hub(uuid, text) from public, anon, authenticated;

