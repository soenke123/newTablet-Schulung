-- ══════════════════════════════════════════════════════════════
-- Migration 0269 — YourSozialNet: Ort der Fotos wieder raus
-- (Sönkes Entscheidung 03.11.2026)
-- ══════════════════════════════════════════════════════════════
--   · photos behält taken_at (Aufnahmezeit) und camera (0268), die
--     Spalten latitude/longitude fallen weg – samt schon gespeicherter
--     Orte. Das Gerät liest und schickt keinen Ort mehr; schickt ein
--     altes Gerät noch lat/lon, ignoriert sh_photo_post sie.
--   · Schnappschuss, sh_db_apply, sh_photo_json und sh_photo_post neu
--     ohne die beiden Spalten (Signatur von sh_photo_post bleibt).
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (deckt 0263–0269 mit ab).
-- ══════════════════════════════════════════════════════════════

alter table sh_photos drop column if exists latitude;
alter table sh_photos drop column if exists longitude;


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
    -- Metadaten aus dem Foto (0268/0269), nur wenn gespeichert
    'taken_at', p.taken_at, 'camera', p.camera,
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


create or replace function sh_photo_post(
  p_token text default null,
  p_hub uuid default null,
  p_session text default null,
  p_image text default null,
  p_description text default null,
  p_tags jsonb default '[]'::jsonb,
  p_meta jsonb default null,
  p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
as $$
declare
  a     record;
  v_id  int;
  v_t   text;
  v_tid int;
  v_n   int := 0;
  v_at  timestamptz;
  v_cam text;
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

  -- Metadaten nur, wenn die Lehrkraft sie eingeschaltet hat; Falsches fällt still weg
  if sh_meta_on(a.r_room) and jsonb_typeof(p_meta) = 'object' then
    if jsonb_typeof(p_meta->'taken_at') = 'string'
       and (p_meta->>'taken_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then
      begin
        v_at := (p_meta->>'taken_at')::timestamp at time zone 'Europe/Berlin';
        if v_at < timestamptz '1990-01-01' or v_at > now() + interval '1 day' then v_at := null; end if;
      exception when others then v_at := null;
      end;
    end if;
    if jsonb_typeof(p_meta->'camera') = 'string' then
      v_cam := nullif(btrim(regexp_replace(p_meta->>'camera', '[[:cntrl:]<>]', '', 'g')), '');
      if char_length(v_cam) > 80 or sh_bad(v_cam) then v_cam := null; end if;
    end if;
  end if;

  v_id := sh_next(p_hub, 'sh_photos');
  insert into sh_photos (hub_id, id, user_id, image, description, taken_at, camera)
  values (p_hub, v_id, a.r_user, p_image, nullif(btrim(coalesce(p_description, '')), ''), v_at, v_cam);
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
  return jsonb_build_object('ok', true, 'id', v_id,
    'meta', jsonb_strip_nulls(jsonb_build_object('taken_at', v_at, 'camera', v_cam)));
end;
$$;
revoke all on function sh_photo_post(text, uuid, text, text, text, jsonb, jsonb, text) from public;
grant execute on function sh_photo_post(text, uuid, text, text, text, jsonb, jsonb, text) to anon, authenticated;
