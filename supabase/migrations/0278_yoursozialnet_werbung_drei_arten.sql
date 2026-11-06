-- ══════════════════════════════════════════════════════════════
-- Migration 0278 — YourSozialNet: drei Arten von Werbung + Häufigkeit
-- ══════════════════════════════════════════════════════════════
-- Sönke 06.11.2026: drei trennscharfe Arten statt „Anzeige mit/ohne Wo?“
--
--   ads.kind ENUM('feed','label','boost')
--     feed  = Feed-Werbung: eigene Karte im Feed (Bild/Titel/Text/Knopf).
--             Nur „Wem?“ (target_sql); content_sql bleibt leer.
--     label = Foto-Label: Werbung direkt am Foto (Leiste unten auf der
--             Foto-Karte und über den Kommentaren). „Wem?“ + „An welchen
--             Fotos?“ (content_sql = Foto-ids).
--     boost = Beworbener Post (wie bisher): „Wem?“ + „Was?“ (Foto-ids).
--
--   Bestand: 'ad' ohne „Wo?“ → 'feed', 'ad' mit „Wo?“ → 'label'.
--   Ein Trigger macht das auch künftig (alte Geräte, gespeicherte
--   Dummy-Zeilen in sh_dummy, INSERT … kind 'ad' per SQL): 'ad' wird
--   still zu feed/label, feed verliert content_sql.
--
-- Häufigkeit (sh_hubs.ad_every, 3 | 5 | 10, Standard 5): nach jedem
--   n-ten Foto im Feed eine Feed-Werbung. Gilt für die Feed-Werbung
--   (Karten); Foto-Labels hängen weiter an ihren Fotos, beworbene Posts
--   an „Für dich“. Hat das Netzwerk weniger Fotos als n, kommt eine Karte
--   am Ende jeder Runde. Setzen nur Admins des Netzwerks (sh_ad_every).
--
-- sh_feed: 'ads' = [{ after, ad }] (after = Index des Fotos in der Seite,
--   nach dem die Karte kommt); 'ad' = die erste davon (alte Geräte).
--
-- Prüfstand: supabase/tests/0278_yoursozialnet_werbung_drei_arten.mjs
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) kind: feed | label | boost
-- ─────────────────────────────────────────────────────────────
alter table sh_ads drop constraint if exists sh_ads_kind;

create or replace function sh_ads_kind_norm()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.kind = 'ad' then
    new.kind := case when coalesce(btrim(new.content_sql), '') = '' then 'feed' else 'label' end;
  end if;
  if new.kind = 'feed' then new.content_sql := null; new.content := null; end if;
  return new;
end;
$$;
revoke all on function sh_ads_kind_norm() from public, anon, authenticated;

drop trigger if exists sh_ads_kind_norm on sh_ads;
create trigger sh_ads_kind_norm before insert or update on sh_ads
  for each row execute function sh_ads_kind_norm();

update sh_ads set kind = 'ad' where kind = 'ad';   -- Trigger ordnet zu
alter table sh_ads alter column kind set default 'feed';
alter table sh_ads add constraint sh_ads_kind check (kind in ('feed','label','boost'));

-- Häufigkeit je Netzwerk
alter table sh_hubs add column if not exists ad_every smallint not null default 5;
alter table sh_hubs drop constraint if exists sh_hubs_ad_every;
alter table sh_hubs add constraint sh_hubs_ad_every check (ad_every in (3, 5, 10));
comment on column sh_hubs.ad_every is 'YourSozialNet: nach jedem n-ten Foto eine Feed-Werbung (3/5/10, 0278).';


-- ─────────────────────────────────────────────────────────────
-- 2) Auswahl
-- ─────────────────────────────────────────────────────────────
-- Feed-Werbung für diesen User – reihum nach p_salt
create or replace function sh_ad_choose(p_hub uuid, p_user int, p_salt text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select sh_ad_json(p_hub, x.id) from sh_ads_for(p_hub, p_user, 'feed') x
   order by abs(hashtext(x.id::text || ':' || coalesce(p_salt, ''))), x.id
   limit 1;
$$;
revoke all on function sh_ad_choose(uuid, int, text) from public, anon, authenticated;

-- Foto-Label: „An welchen Fotos?“ enthält das Foto und „Wem?“ passt
create or replace function sh_ad_for_photo(p_hub uuid, p_user int, p_photo int, p_salt text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select sh_ad_json(p_hub, x.id) from sh_ads_for(p_hub, p_user, 'label') x
   where p_photo = any(coalesce(x.content, '{}'::int[]))
   order by abs(hashtext(x.id::text || ':' || p_photo::text || ':' || coalesce(p_salt, ''))), x.id
   limit 1;
$$;
revoke all on function sh_ad_for_photo(uuid, int, int, text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Feed: Feed-Werbung nach jedem n-ten Foto
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
  v_every  int;
  v_slots  jsonb := '[]'::jsonb;
  v_ad     jsonb;
  j        int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not sh_on(a.r_room, 'photos') then return jsonb_build_object('ok', true, 'off', true, 'total', 0, 'items', '[]'::jsonb); end if;
  v_likes := sh_on(a.r_room, 'likes'); v_tags := sh_on(a.r_room, 'tags'); v_follow := sh_on(a.r_room, 'follows');
  v_ads := sh_on(a.r_room, 'ads');
  -- Beworbene Posts: nur „Für dich“
  if v_ads and coalesce(p_mode, 'foryou') = 'foryou' then
    select coalesce(array_agg(distinct c), '{}'::int[]) into v_boost
      from sh_ads_for(p_hub, a.r_user, 'boost') x, unnest(coalesce(x.content, '{}'::int[])) c;
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

  -- Feed-Werbung nach jedem n-ten Foto (nur in den beiden Feeds, nicht bei Tag/Profil)
  if v_ads and coalesce(p_mode, 'foryou') in ('foryou', 'following') and coalesce(array_length(v_ids, 1), 0) > 0 then
    select coalesce(h.ad_every, 5) into v_every from sh_hubs h where h.id = p_hub;
    for j in 1 .. array_length(v_ids, 1) loop
      -- kleines Netzwerk (weniger Fotos als n): eine Karte am Ende jeder Runde
      if (v_off + j) % v_every = 0 or (v_total < v_every and v_off + j = v_total) then
        v_ad := sh_ad_choose(p_hub, a.r_user, coalesce(p_seed, 0)::text || ':' || (v_off + j)::text);
        exit when v_ad is null;
        v_slots := v_slots || jsonb_build_array(jsonb_build_object('after', j - 1, 'ad', v_ad));
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true,
    'total', v_total,
    'every', v_every,
    'ads', v_slots,
    'ad', v_slots->0->'ad',
    'items', coalesce((select jsonb_agg(sh_photo_json(a.r_room, p_hub, i, a.r_user)
                                        || case when i = any(v_boost) then jsonb_build_object('sponsored', (
                                             select sh_ad_json(p_hub, x.id) from sh_ads_for(p_hub, a.r_user, 'boost') x
                                              where i = any(coalesce(x.content, '{}'::int[])) order by x.id limit 1)) else '{}'::jsonb end
                                        -- Foto-Label
                                        || case when v_ads then coalesce((select jsonb_build_object('ad', z.j)
                                             from (select sh_ad_for_photo(p_hub, a.r_user, i, coalesce(p_seed, 0)::text) j) z where z.j is not null), '{}'::jsonb)
                                           else '{}'::jsonb end
                                        order by o)
                         from unnest(v_ids) with ordinality as u(i, o)), '[]'::jsonb));
end;
$$;
revoke all on function sh_feed(text, text, uuid, text, text, text, int, int, int) from public;
grant execute on function sh_feed(text, text, uuid, text, text, text, int, int, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Speichern mit den drei Arten
-- ─────────────────────────────────────────────────────────────
create or replace function sh_ad_save(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_id int default null,
  p_name text default null, p_kind text default 'feed',
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
  v_kind text := coalesce(p_kind, 'feed');
  v_img  text := nullif(btrim(coalesce(p_image, '')), '');
  v_tgt  text := nullif(btrim(coalesce(p_target, '')), '');
  v_cnt  text := nullif(btrim(coalesce(p_content, '')), '');
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if not sh_on(a.r_room, 'ads') then return sh_err('table_off'); end if;
  if char_length(v_name) not between 1 and 60 then return sh_err('invalid_name'); end if;
  -- 'ad' von älteren Geräten: wie bisher nach „Wo?“
  if v_kind = 'ad' then v_kind := case when v_cnt is null then 'feed' else 'label' end; end if;
  if v_kind not in ('feed', 'label', 'boost') then return sh_err('invalid_input'); end if;
  if v_kind = 'feed' then v_cnt := null; end if;
  if v_kind = 'boost' then p_title := null; p_body := null; v_img := null; p_button := null; end if;
  if char_length(coalesce(p_title, '')) > 80 or char_length(coalesce(p_body, '')) > 300 or char_length(coalesce(p_button, '')) > 30
     or char_length(coalesce(v_tgt, '')) > 4000 or char_length(coalesce(v_cnt, '')) > 4000 then
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
            v_img, nullif(btrim(coalesce(p_button, '')), ''), v_tgt, v_cnt, coalesce(p_active, true));
  else
    update sh_ads set name = v_name, kind = v_kind,
           title = nullif(btrim(coalesce(p_title, '')), ''), body = nullif(btrim(coalesce(p_body, '')), ''),
           image = v_img, button = nullif(btrim(coalesce(p_button, '')), ''),
           -- neue Abfrage → alte Liste gilt nicht mehr, bis das Gerät neu gerechnet hat
           audience = case when target_sql is not distinct from v_tgt then audience end,
           content  = case when content_sql is not distinct from v_cnt then content end,
           target_sql = v_tgt, content_sql = v_cnt,
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


-- ─────────────────────────────────────────────────────────────
-- 5) Häufigkeit lesen/setzen (nur Admins des Netzwerks)
--    p_every NULL = nur lesen
-- ─────────────────────────────────────────────────────────────
create or replace function sh_ad_every(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_every int default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  a record;
  v int;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  if p_every is not null then
    if p_every not in (3, 5, 10) then return sh_err('invalid_input'); end if;
    update sh_hubs set ad_every = p_every where id = p_hub;
  end if;
  select ad_every into v from sh_hubs where id = p_hub;
  return jsonb_build_object('ok', true, 'every', v);
end;
$$;
revoke all on function sh_ad_every(text, text, uuid, text, int) from public;
grant execute on function sh_ad_every(text, text, uuid, text, int) to anon, authenticated;
