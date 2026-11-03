-- ══════════════════════════════════════════════════════════════
-- Migration 0266 — YourSozialNet: Feinschliff nach Sönkes Rückmeldung
-- ══════════════════════════════════════════════════════════════
--   · Farbschema 'auto' (übernimmt Hell/Dunkel von MPSkills), neuer
--     Standard für neue Netzwerke; sh_found/sh_brand nehmen es an.
--   · sh_db_apply (SQL im Adminbereich) zusätzlich abgesichert:
--       – Klartext-Passwörter werden auf dem Server gehasht (bcrypt),
--         ein Passwort steht nie lesbar in der Datenbank;
--       – Benutzernamen nur [A-Za-z0-9._], höchstens 30 Zeichen;
--       – Werte müssen einzelne Werte sein (kein JSON-Objekt/-Array);
--       – Testkonten der Lehrkraft ändert/löscht nur die Lehrkraft.
--     Bleibt wie gehabt: Tabellen- und Spaltennamen nur aus festen
--     Listen (format %I), Werte nur als Parameter (jsonb_populate_record,
--     $1), Schlüssel nur ganze Zahlen, alles auf hub_id beschränkt,
--     Fremdschlüssel mit hub_id (kein Zugriff auf fremde Netzwerke).
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (deckt 0263–0266 mit ab).
-- ══════════════════════════════════════════════════════════════

alter table sh_hubs drop constraint if exists sh_hubs_scheme;
alter table sh_hubs add constraint sh_hubs_scheme check (scheme in ('dark', 'light', 'auto'));
alter table sh_hubs alter column scheme set default 'auto';

create or replace function sh_found(
  p_token text default null,
  p_name text default null,
  p_logo text default null,
  p_color text default null,
  p_scheme text default 'auto',
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
  if coalesce(p_scheme, 'auto') not in ('dark', 'light', 'auto') then return sh_err('invalid_input'); end if;
  if sh_bad(v_name) then return sh_err('blacklisted'); end if;
  if (select count(*) from sh_hubs where room_id = c.r_room) >= 60 then return sh_err('quota_exceeded'); end if;

  insert into sh_hubs (room_id, participant_id, teacher_id, name, logo, color, scheme)
  values (c.r_room, c.r_part, c.r_tuid, v_name, p_logo, v_col, coalesce(p_scheme, 'auto'))
  returning id into v_hub;
  return jsonb_build_object('ok', true, 'hub', v_hub);
end;
$$;
revoke all on function sh_found(text, text, text, text, text, text) from public;
grant execute on function sh_found(text, text, text, text, text, text) to anon, authenticated;


create or replace function sh_brand(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_name text default null, p_logo text default null, p_logo_img text default null,
  p_color text default null, p_scheme text default 'auto')
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
  if coalesce(p_scheme, 'auto') not in ('dark', 'light', 'auto') then return sh_err('invalid_input'); end if;
  if p_logo = 'custom' and p_logo_img is not null then
    begin v_img := decode(p_logo_img, 'base64'); exception when others then return sh_err('invalid_input'); end;
    if octet_length(v_img) > 120000 then return sh_err('payload_too_big'); end if;
  end if;
  if p_logo = 'custom' and v_img is null and (select logo_img from sh_hubs where id = p_hub) is null then
    return sh_err('invalid_logo');
  end if;
  update sh_hubs set name = v_name, logo = p_logo, color = v_col, scheme = coalesce(p_scheme, 'auto'),
         logo_img = case when p_logo = 'custom' then coalesce(v_img, logo_img) else null end
   where id = p_hub;
  return jsonb_build_object('ok', true, 'hub', sh_hub_json(p_hub));
end;
$$;
revoke all on function sh_brand(text, text, uuid, text, text, text, text, text, text) from public;
grant execute on function sh_brand(text, text, uuid, text, text, text, text, text, text) to anon, authenticated;


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
