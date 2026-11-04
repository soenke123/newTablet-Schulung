-- ══════════════════════════════════════════════════════════════
-- Migration 0273 — YourSozialNet: Beispieldaten wieder leeren
-- ══════════════════════════════════════════════════════════════
--   Gegenstück zu 0272. Im Tabellen-Diagramm der Lehrkraft steht an jeder
--   Tabelle „Daten: leer · Füllen“ bzw. „Daten: gefüllt · Leeren“.
--
--     sh_dummy_clear(p_code, p_tbl, p_hub)
--         p_hub gesetzt: leert EIN Netzwerk (der Browser geht sie einzeln
--         durch); p_hub = NULL: vergisst die gespeicherten Zeilen des Raums,
--         damit neue Netzwerke sie nicht mehr bekommen.
--
--   Was gelöscht wird: genau der id-Bereich, den das Laden belegt hat
--   (Versatz aus sh_hubs.dummy + größtes Dummy-id aus sh_dummy). Eigene
--   Zeilen der Schüler davor oder danach bleiben. Wie beim Entziehen
--   gehen die Abhängigen mit: users → alles; photos → tags, likes,
--   comments, views; sessions → views. tags: photo_tag der Dummy-Fotos
--   und Dummy-Tags, an denen kein Foto mehr hängt.
--
-- Prüfstand: supabase/tests/0262_socialhub.mjs (Abschnitt 10).
-- ══════════════════════════════════════════════════════════════

-- Wer mitgeht, wenn eine Tabelle geleert wird (sie selbst zuerst)
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
  end;
$$;
revoke all on function sh_dummy_deps(text) from public, anon, authenticated;

-- größtes Dummy-id einer Tabelle (Spalte 0 der gespeicherten Zeilen)
create or replace function sh_dummy_maxid(p_room uuid, p_tbl text)
  returns int
  language sql
  stable
as $$
  select coalesce(max((r->>0)::int), 0) from sh_dummy d, jsonb_array_elements(d.rows) e(r) where d.room_id = p_room and d.tbl = p_tbl;
$$;
revoke all on function sh_dummy_maxid(uuid, text) from public, anon, authenticated;

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

create or replace function sh_dummy_clear(p_code text default null, p_tbl text default null, p_hub uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c record;
  v_deps text[];
begin
  select * into c from sh_ctx(null, p_code);
  if c.err is not null then return sh_err(c.err); end if;
  if not c.r_teacher then return sh_err('not_allowed'); end if;
  v_deps := sh_dummy_deps(p_tbl);
  if v_deps is null then return sh_err('bad_table'); end if;
  if p_hub is null then
    -- gespeicherte Zeilen vergessen (tags nimmt photo_tag mit)
    delete from sh_dummy where room_id = c.r_room
      and (tbl = any(v_deps) or (tbl = 'photo_tag' and 'tags' = any(v_deps)));
    return jsonb_build_object('ok', true);
  end if;
  if not exists (select 1 from sh_hubs where id = p_hub and room_id = c.r_room) then return sh_err('not_found'); end if;
  return jsonb_build_object('ok', true, 'rows', sh_dummy_clear_hub(p_hub, p_tbl));
end;
$$;
revoke all on function sh_dummy_clear(text, text, uuid) from public;
grant execute on function sh_dummy_clear(text, text, uuid) to authenticated;
