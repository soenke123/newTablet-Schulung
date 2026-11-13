-- ══════════════════════════════════════════════════════════════
-- Migration 0289 — YourSozialNet: Konto mit MPSkills verknüpfen
-- ══════════════════════════════════════════════════════════════
-- Schüler brauchten bisher drei Konten: MPSkills, das eigene Netzwerk
-- (Adminbereich) und das Klassen-Netz. Wer in MPSkills angemeldet ist,
-- kann ein Netzwerk-Konto jetzt mit dem MPSkills-Konto verknüpfen und
-- sich danach mit einem Knopf anmelden – ohne zweites Passwort.
--
--   - sh_users.mps_user = auth.users.id (on delete set null), je
--     Netzwerk höchstens ein Konto je MPSkills-Konto. Steht NICHT im
--     Schnappschuss (sh_db_snapshot nennt seine Spalten einzeln) und ist
--     per SQL (sh_db_apply) nicht änderbar.
--   - Das MPSkills-Passwort wird NICHT kopiert (auch nicht sein Hash):
--     Admins lesen die Spalte password per SQL, im Klassen-Netz die der
--     ganzen Klasse. Verknüpfte Konten bekommen dort den Platzhalter
--     '(MPSkills-Konto)' – kein bcrypt, sh_pw_ok nimmt ihn nie an.
--   - sh_register(…, p_mps := true): Konto anlegen und verknüpfen,
--     ohne Passwort. Braucht auth.uid(); 'mps_linked', wenn es im
--     Netzwerk schon ein verknüpftes Konto gibt.
--   - sh_mps_me(p_token, p_code): angemeldet? Accountname, Anzeigename
--     und die verknüpften Netzwerke im Raum (fürs Vorausfüllen und das
--     Anmelden auf einem anderen Tablet ohne Netzwerk-Namen).
--   - sh_login_mps(p_token, p_code, p_hub): Sitzung für das verknüpfte
--     Konto. Wie sh_login_net auch in fremden Netzwerken des Raums –
--     die MPSkills-Anmeldung ersetzt das Passwort.
--   - sh_mps_link(…, p_session): ein bestehendes Konto nachträglich
--     verknüpfen (beim Anmelden mit Passwort).
--   - Benutzernamen dürfen jetzt auch '-' enthalten (wie MPSkills) und
--     schon ab 2 Zeichen: sh_register '^[a-z0-9._-]{2,24}$', per SQL
--     '^[A-Za-z0-9._-]{1,30}$'.
--
-- Prüfstand: supabase/tests/0289_yoursozialnet_mpskills_konto.mjs
-- ══════════════════════════════════════════════════════════════

alter table sh_users add column if not exists mps_user uuid references auth.users(id) on delete set null;
comment on column sh_users.mps_user is 'YourSozialNet: verknüpftes MPSkills-Konto (Anmelden ohne Passwort). Seit 0289, nicht im Schnappschuss.';
create unique index if not exists sh_users_mps_uq on sh_users(hub_id, mps_user) where mps_user is not null;
create index if not exists sh_users_mps_idx on sh_users(mps_user) where mps_user is not null;


-- ─────────────────────────────────────────────────────────────
-- sh_register: Bindestrich, ab 2 Zeichen, p_mps
drop function if exists sh_register(text, uuid, text, text, text, text, text, text, text, text, text, int, text);
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
  p_code text default null,
  p_mps boolean default false)
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
  v_mps  uuid := case when coalesce(p_mps, false) then auth.uid() end;
  v_bd   date;
  v_id   int;
  v_adm  boolean;
begin
  select * into a from sh_access(p_token, p_code, p_hub, null);
  if a.err is not null then return sh_err(a.err); end if;
  -- über die App-Adresse (0275) nur anmelden – registrieren geht nur im Raum
  if a.r_part is null and a.r_tuid is null then return sh_err('register_in_room'); end if;
  if coalesce(p_mps, false) and v_mps is null then return sh_err('not_signed_in'); end if;
  if v_mps is not null and exists (select 1 from sh_users where hub_id = p_hub and mps_user = v_mps) then
    return sh_err('mps_linked');
  end if;
  select * into h from sh_hubs where id = p_hub;
  if v_user !~ '^[a-z0-9._-]{2,24}$' then return sh_err('invalid_username'); end if;
  if v_mps is null and char_length(coalesce(p_password, '')) not between 4 and 60 then return sh_err('invalid_password'); end if;
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
  insert into sh_users (hub_id, id, username, name, email, password, birthday, city, country, centimeter, gender, bio, role, participant_id, teacher_id, mps_user)
  values (p_hub, v_id, v_user, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_email, '')), ''),
          case when v_mps is not null then '(MPSkills-Konto)' else sh_hash(p_password) end,
          v_bd, nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_country, '')), ''), p_centimeter, v_gen, nullif(btrim(coalesce(p_bio, '')), ''),
          case when v_adm then 'admin' else 'user' end, a.r_part, a.r_tuid, v_mps);
  if v_adm then update sh_hubs set owner_user = v_id where id = p_hub; end if;
  return jsonb_build_object('ok', true, 'session', sh_session_new(p_hub, v_id, a.r_part, a.r_tuid), 'user', v_id, 'admin', v_adm);
end;
$$;
revoke all on function sh_register(text, uuid, text, text, text, text, text, text, text, text, text, int, text, boolean) from public;
grant execute on function sh_register(text, uuid, text, text, text, text, text, text, text, text, text, int, text, boolean) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_mps_me: wer ist in MPSkills angemeldet, welche Netzwerke sind verknüpft
create or replace function sh_mps_me(p_token text default null, p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c     record;
  v_uid uuid := auth.uid();
  v_app uuid;
  pr    profiles;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if v_uid is null then return jsonb_build_object('ok', true, 'signed_in', false); end if;
  v_app := nullif(current_setting('sh.app_hub', true), '')::uuid;
  select * into pr from profiles where id = v_uid;
  if pr.id is null then return jsonb_build_object('ok', true, 'signed_in', false); end if;
  return jsonb_build_object('ok', true, 'signed_in', true,
    'account', pr.account_name, 'display', pr.display_name,
    'nets', coalesce((
      select jsonb_agg(jsonb_build_object('hub', h.id, 'name', h.name, 'logo', h.logo, 'color', h.color,
                                          'class', h.class, 'username', u.username) order by h.class desc, h.created_at)
        from sh_users u join sh_hubs h on h.id = u.hub_id
       where u.mps_user = v_uid and h.room_id = c.r_room
         and (v_app is null or h.id = v_app)
         and (not h.locked or c.r_teacher)), '[]'::jsonb));
end;
$$;
revoke all on function sh_mps_me(text, text) from public;
grant execute on function sh_mps_me(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_login_mps: mit dem verknüpften MPSkills-Konto anmelden
create or replace function sh_login_mps(p_token text default null, p_code text default null, p_hub uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c     record;
  h     sh_hubs;
  u     sh_users;
  v_uid uuid := auth.uid();
  v_app uuid;
begin
  select * into c from sh_ctx(p_token, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if v_uid is null then return sh_err('not_signed_in'); end if;
  v_app := nullif(current_setting('sh.app_hub', true), '')::uuid;
  select * into h from sh_hubs where id = p_hub and room_id = c.r_room;
  if h.id is null or (v_app is not null and h.id <> v_app) then return sh_err('hub_not_found'); end if;
  if h.locked and not c.r_teacher then return sh_err('hub_locked'); end if;
  select * into u from sh_users where hub_id = h.id and mps_user = v_uid;
  if u.id is null then return sh_err('mps_not_linked'); end if;
  return jsonb_build_object('ok', true, 'hub', h.id, 'user', u.id, 'username', u.username,
                            'session', sh_session_new(h.id, u.id, c.r_part, c.r_tuid));
end;
$$;
revoke all on function sh_login_mps(text, text, uuid) from public;
grant execute on function sh_login_mps(text, text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_mps_link: das gerade angemeldete Konto nachträglich verknüpfen
create or replace function sh_mps_link(p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a     record;
  u     sh_users;
  v_uid uuid := auth.uid();
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if v_uid is null then return sh_err('not_signed_in'); end if;
  if a.r_user is null then return sh_err('not_logged_in'); end if;
  select * into u from sh_users where hub_id = p_hub and id = a.r_user for update;
  if u.mps_user = v_uid then return jsonb_build_object('ok', true, 'username', u.username); end if;
  if u.mps_user is not null then return sh_err('mps_other'); end if;
  -- Testkonten der Lehrkraft verknüpft nur sie selbst
  if u.teacher_id is not null and u.teacher_id <> v_uid then return sh_err('forbidden'); end if;
  if exists (select 1 from sh_users where hub_id = p_hub and mps_user = v_uid) then return sh_err('mps_linked'); end if;
  update sh_users set mps_user = v_uid where hub_id = p_hub and id = u.id;
  return jsonb_build_object('ok', true, 'username', u.username);
end;
$$;
revoke all on function sh_mps_link(text, text, uuid, text) from public;
grant execute on function sh_mps_link(text, text, uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- sh_db_apply: Benutzernamen per SQL auch mit Bindestrich (sonst wie 0276)
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
          -- Benutzername: nur Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich
          if v_row ? 'username' and coalesce(v_row->>'username', '') !~ '^[A-Za-z0-9._-]{1,30}$' then
            raise exception using errcode = 'P0001', message = 'Ein Benutzername darf nur Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich enthalten (höchstens 30 Zeichen).';
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
