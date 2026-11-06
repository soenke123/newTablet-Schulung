-- ══════════════════════════════════════════════════════════════
-- Migration 0277 — YourSozialNet: Werbung am Foto („Wo?“)
-- ══════════════════════════════════════════════════════════════
-- Sönke 06.11.2026: Werbung auch bei den Fotos (wie InstaHub).
-- Eine Anzeige (kind 'ad') bekommt optional „Wo?“ = content_sql (die
-- Spalte war bei Anzeigen bisher leer): eine Liste von Foto-ids.
--
--   ohne „Wo?“ → wie bisher NUR als eigene Karte im Feed
--   mit  „Wo?“ → NUR an diesen Fotos: Leiste unten auf der Foto-Karte
--                und über den Kommentaren (Kontext-Werbung)
--   „Wem?“ gilt in beiden Fällen zusätzlich (leer = alle).
--
-- Unterricht: personalisierte Werbung (nach den Daten über mich) vs.
-- Kontext-Werbung (nach dem Inhalt, den ich gerade ansehe).
--
-- Weiter kein Schüler-SQL auf dem Server: die Foto-ids rechnet das
-- Admin-Gerät (js/adseval.js) und schickt sie wie bei „Was?“ als c an
-- sh_ads_compute → sh_ads.content.
--
-- sh_ad_choose: nur Anzeigen OHNE „Wo?“ (Karte im Feed).
-- sh_ad_for_photo (neu, intern): passende Anzeige MIT „Wo?“ für ein Foto.
-- sh_feed: jedes Foto bekommt ggf. 'ad'.
-- sh_ad_pick(…, p_salt, p_photo): Leiste über den Kommentaren = die
--   Anzeige dieses Fotos (ohne Foto: nichts).
--
-- Prüfstand: supabase/tests/0277_yoursozialnet_werbung_am_foto.mjs
-- ══════════════════════════════════════════════════════════════

-- Karte im Feed: nur Anzeigen ohne „Wo?“
create or replace function sh_ad_choose(p_hub uuid, p_user int, p_salt text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select sh_ad_json(p_hub, x.id) from sh_ads_for(p_hub, p_user, 'ad') x
   where coalesce(btrim(x.content_sql), '') = ''
   order by abs(hashtext(x.id::text || ':' || coalesce(p_salt, ''))), x.id
   limit 1;
$$;
revoke all on function sh_ad_choose(uuid, int, text) from public, anon, authenticated;

-- Anzeige am Foto: „Wo?“ enthält das Foto und „Wem?“ passt; reihum nach p_salt
create or replace function sh_ad_for_photo(p_hub uuid, p_user int, p_photo int, p_salt text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select sh_ad_json(p_hub, x.id) from sh_ads_for(p_hub, p_user, 'ad') x
   where coalesce(btrim(x.content_sql), '') <> '' and p_photo = any(coalesce(x.content, '{}'::int[]))
   order by abs(hashtext(x.id::text || ':' || p_photo::text || ':' || coalesce(p_salt, ''))), x.id
   limit 1;
$$;
revoke all on function sh_ad_for_photo(uuid, int, int, text) from public, anon, authenticated;

-- Feed: jedes Foto bekommt ggf. seine Anzeige ('ad')
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
                                        -- Anzeige am Foto (0277)
                                        || case when v_ads then coalesce((select jsonb_build_object('ad', z.j)
                                             from (select sh_ad_for_photo(p_hub, a.r_user, i, coalesce(p_seed, 0)::text) j) z where z.j is not null), '{}'::jsonb)
                                           else '{}'::jsonb end
                                        order by o)
                         from unnest(v_ids) with ordinality as u(i, o)), '[]'::jsonb));
end;
$$;
revoke all on function sh_feed(text, text, uuid, text, text, text, int, int, int) from public;
grant execute on function sh_feed(text, text, uuid, text, text, text, int, int, int) to anon, authenticated;


-- Leiste über den Kommentaren: die Anzeige dieses Fotos
drop function if exists sh_ad_pick(text, text, uuid, text, text);
create or replace function sh_ad_pick(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_salt text default null, p_photo int default null)
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
  if not sh_on(a.r_room, 'ads') or p_photo is null then return jsonb_build_object('ok', true, 'ad', null); end if;
  return jsonb_build_object('ok', true, 'ad', sh_ad_for_photo(p_hub, a.r_user, p_photo, p_salt));
end;
$$;
revoke all on function sh_ad_pick(text, text, uuid, text, text, int) from public;
grant execute on function sh_ad_pick(text, text, uuid, text, text, int) to anon, authenticated;
