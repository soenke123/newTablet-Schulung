-- ══════════════════════════════════════════════════════════════
-- Migration 0194 — Knowledge Stack: der Fragenkatalog
-- ══════════════════════════════════════════════════════════════
--
-- Aus der Liste „Vorlagen + Eigenes" wird ein Katalog, in dem alle
-- Quizze stehen, nach Themenfeld sortiert, mit Suche und Filtern.
--
--  1) ks_categories — feste Themenfelder (Fächer + übergreifende).
--     Lehrkräfte können KEINE neuen anlegen (sonst Mathe, Mathematik,
--     Math …). Neue Felder trägt ein Admin hier ein. ks_catalogs.subject
--     bleibt der Text des Themenfelds; ks_catalog_save fängt Unbekanntes
--     als „Andere" ab. Alte Freitext-Fächer werden unten umgesetzt.
--  2) ks_catalogs.visibility — 'private' (nur ich) · 'school' (meine
--     Schule) · 'hub' (alle Lehrkräfte). Mehr Stufen gibt es nicht.
--     Dazu thumbnail/thumb_custom/updated_at.
--  3) Wer was sieht, setzt DER SERVER durch (ks_catalog_can_see) — nicht
--     der Browser. Eigene bearbeitet/löscht nur der Besitzer, auch wenn
--     sie schon veröffentlicht sind.
--  4) Admins (is_admin: Schule + Hub, is_superadmin: alles Veröffentlichte)
--     dürfen Veröffentlichtes löschen oder auf privat zurückstellen.
--     Private Quizze anderer sehen sie nicht und fassen sie nicht an.
--  5) ks_catalogs_list liefert Autor, Status, Themenfeld, Suchtext —
--     die Thumbnails holt ks_catalog_thumbs nach, damit die Liste klein
--     bleibt. ks_catalog_peek zeigt die Fragen (nur Texte).
--  6) ks_room_get (Lobby) bekommt dieselbe Liste; ks_room_setup lässt
--     nur Kataloge zu, die man sehen darf.
--
-- Idempotent: if not exists, create or replace, on conflict.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Themenfelder
-- ─────────────────────────────────────────────────────────────
create table if not exists ks_categories (
  name       text primary key,
  kind       text not null default 'fach' check (kind in ('fach', 'uebergreifend')),
  sort_order int  not null default 100
);

alter table ks_categories enable row level security;
grant select on ks_categories to authenticated;

insert into ks_categories (name, kind, sort_order) values
  ('Mathematik',            'fach',          10),
  ('Deutsch',               'fach',          20),
  ('Englisch',              'fach',          30),
  ('Biologie',              'fach',          40),
  ('Physik',                'fach',          50),
  ('Chemie',                'fach',          60),
  ('Informatik',            'fach',          70),
  ('Geschichte',            'fach',          80),
  ('Geografie',             'fach',          90),
  ('Politik & Gesellschaft','fach',         100),
  ('Religion & Ethik',      'fach',         110),
  ('Musik',                 'fach',         120),
  ('Kunst',                 'fach',         130),
  ('Sport',                 'fach',         140),
  ('Allgemeinwissen',       'uebergreifend', 200),
  ('Spaß & Rätsel',         'uebergreifend', 210),
  ('Kennenlernen & Klasse', 'uebergreifend', 220),
  ('Tablet & Medien',       'uebergreifend', 230),
  ('Natur & Umwelt',        'uebergreifend', 240),
  ('Alltag & Beruf',        'uebergreifend', 250),
  ('Andere',                'uebergreifend', 900)
on conflict (name) do update
  set kind = excluded.kind, sort_order = excluded.sort_order;


-- ─────────────────────────────────────────────────────────────
-- 2) Spalten an ks_catalogs
-- ─────────────────────────────────────────────────────────────
alter table ks_catalogs add column if not exists visibility   text    not null default 'private';
alter table ks_catalogs add column if not exists thumbnail    text;
alter table ks_catalogs add column if not exists thumb_custom boolean not null default false;
alter table ks_catalogs add column if not exists updated_at   timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ks_catalogs_visibility_chk') then
    alter table ks_catalogs add constraint ks_catalogs_visibility_chk
      check (visibility in ('private', 'school', 'hub'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ks_catalogs_thumbnail_chk') then
    alter table ks_catalogs add constraint ks_catalogs_thumbnail_chk
      check (thumbnail is null or (thumbnail like 'data:image/%' and length(thumbnail) <= 300000));
  end if;
end $$;

-- Altbestand: Vorlagen sind für alle da, die Schule des Besitzers
-- wird nachgetragen, alte Freitext-Fächer werden Themenfeldern zugeordnet.
update ks_catalogs set visibility = 'hub' where is_template and visibility = 'private';

update ks_catalogs c
   set school_id = p.school_id
  from profiles p
 where c.school_id is null and c.owner_id = p.id;

update ks_catalogs
   set subject = case subject
         when 'Tablet-Schulung' then 'Tablet & Medien'
         when 'Politik'         then 'Politik & Gesellschaft'
         when 'Religion'        then 'Religion & Ethik'
         when 'Alles Mögliche'  then 'Andere'
         else subject end
 where subject in ('Tablet-Schulung', 'Politik', 'Religion', 'Alles Mögliche');

update ks_catalogs
   set subject = 'Andere'
 where subject not in (select name from ks_categories);

alter table ks_catalogs alter column subject set default 'Andere';

create index if not exists ks_catalogs_visibility_idx on ks_catalogs (visibility, school_id);


-- ─────────────────────────────────────────────────────────────
-- 3) Wer darf was — an einer Stelle
-- ─────────────────────────────────────────────────────────────
create or replace function ks_my_school()
  returns uuid
  stable
  security definer
  set search_path = public
  language sql
as $$ select school_id from profiles where id = auth.uid() $$;

revoke all on function ks_my_school() from public;
grant execute on function ks_my_school() to authenticated;

-- Sehen: eigene · Hub (alle Lehrkräfte) · Schule (meine Schule).
-- Superadmins sehen alles Veröffentlichte.
create or replace function ks_catalog_can_see(c ks_catalogs)
  returns boolean
  stable
  security definer
  set search_path = public
  language sql
as $$
  select auth.uid() is not null and (
    c.owner_id = auth.uid()
    or (can_teach() and (
         c.is_template
         or c.visibility = 'hub'
         or (c.visibility = 'school' and c.school_id is not null and c.school_id = ks_my_school())
         or (c.visibility <> 'private' and is_superadmin())
       ))
  )
$$;

revoke all on function ks_catalog_can_see(ks_catalogs) from public;
grant execute on function ks_catalog_can_see(ks_catalogs) to authenticated;

-- Moderieren (löschen / auf privat stellen): Admins, aber nur
-- Veröffentlichtes und nur in ihrem Bereich (Hub + eigene Schule,
-- Superadmin überall).
create or replace function ks_catalog_can_admin(c ks_catalogs)
  returns boolean
  stable
  security definer
  set search_path = public
  language sql
as $$
  select auth.uid() is not null and (
    c.is_template or c.visibility <> 'private'
  ) and (
    is_superadmin()
    or (is_admin() and (c.is_template or c.visibility = 'hub'
                        or (c.school_id is not null and c.school_id = ks_my_school())))
  )
$$;

revoke all on function ks_catalog_can_admin(ks_catalogs) from public;
grant execute on function ks_catalog_can_admin(ks_catalogs) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) ks_catalogs_list — der Katalog
-- ─────────────────────────────────────────────────────────────
-- Neu: visibility, author_name, has_thumb, updated_at, can_admin,
-- search (Fragentexte, auf 800 Zeichen gekürzt) und categories.
-- Kein Thumbnail in der Liste — das holt ks_catalog_thumbs.
create or replace function ks_catalogs_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', true, 'catalogs', '[]'::jsonb, 'categories', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('name', k.name, 'kind', k.kind) order by k.sort_order, k.name)
        from ks_categories k), '[]'::jsonb),
    'catalogs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          c.id,
        'title',       c.title,
        'subject',     c.subject,
        'is_template', c.is_template,
        'visibility',  c.visibility,
        'mine',        (c.owner_id = v_user),
        'author_name', coalesce(p.display_name, case when c.is_template then 'MPSkills' else 'Unbekannt' end),
        'has_thumb',   (c.thumbnail is not null),
        'count',       (select count(*) from ks_questions q where q.catalog_id = c.id),
        'can_admin',   ks_catalog_can_admin(c),
        'created_at',  c.created_at,
        'updated_at',  c.updated_at,
        'search',      (select left(coalesce(string_agg(q.question_text, ' · ' order by q.sort_order), ''), 800)
                          from ks_questions q where q.catalog_id = c.id)
      ) order by c.created_at desc)
      from ks_catalogs c
      left join profiles p on p.id = c.owner_id
      where ks_catalog_can_see(c)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function ks_catalogs_list() from public;
grant execute on function ks_catalogs_list() to authenticated, anon;


-- ─────────────────────────────────────────────────────────────
-- 5) ks_catalog_get — mit Status, Autor, Thumbnail
-- ─────────────────────────────────────────────────────────────
create or replace function ks_catalog_get(p_catalog_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_cat  ks_catalogs;
  v_qs   jsonb;
begin
  select * into v_cat from ks_catalogs where id = p_catalog_id;

  if v_cat.id is null or not ks_catalog_can_see(v_cat) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              q.id,
    'question_text',   q.question_text,
    'options',         q.options,
    'correct_idx',     q.correct_idx,
    'correct_indices', q.correct_indices,
    'time_limit_sec',  q.time_limit_sec,
    'explanation',     q.explanation,
    'image',           q.image,
    'image_name',      q.image_name,
    'sort_order',      q.sort_order
  ) order by q.sort_order, q.id), '[]'::jsonb)
    into v_qs
    from ks_questions q
   where q.catalog_id = p_catalog_id;

  return jsonb_build_object(
    'ok',           true,
    'catalog_id',   v_cat.id,
    'title',        v_cat.title,
    'subject',      v_cat.subject,
    'is_template',  v_cat.is_template,
    'visibility',   v_cat.visibility,
    'mine',         (v_cat.owner_id = v_user),
    'thumbnail',    v_cat.thumbnail,
    'thumb_custom', v_cat.thumb_custom,
    'questions',    v_qs
  );
end;
$$;

revoke all on function ks_catalog_get(uuid) from public;
grant execute on function ks_catalog_get(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) ks_catalog_save — Themenfeld, Status, Thumbnail
-- ─────────────────────────────────────────────────────────────
-- Alte Fassungen (4 und 5 Argumente) fallen weg, sonst findet
-- PostgREST bei Namensaufrufen zwei passende Funktionen.
drop function if exists ks_catalog_save(uuid, text, text, jsonb);
drop function if exists ks_catalog_save(text, uuid, text, text, jsonb);

create or replace function ks_catalog_save(
  p_catalog_id  uuid,
  p_title       text,
  p_subject     text,
  p_questions   jsonb,
  p_visibility  text    default null,   -- null = unverändert (neu: private)
  p_thumbnail   text    default null,
  p_thumb_custom boolean default false
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_school uuid;
  v_cat    uuid;
  v_q      jsonb;
  v_i      int := 0;
  v_ci     smallint[];
  v_opts   jsonb;
  v_img    text;
  v_subj   text;
  v_vis    text := nullif(btrim(coalesce(p_visibility, '')), '');
  v_thumb  text := nullif(p_thumbnail, '');
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_title is null or trim(p_title) = '' then
    return jsonb_build_object('ok', false, 'error', 'title_required');
  end if;

  if v_vis is not null and v_vis not in ('private', 'school', 'hub') then
    return jsonb_build_object('ok', false, 'error', 'bad_visibility');
  end if;
  if v_vis is not null and v_vis <> 'private' and not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  v_school := ks_my_school();
  if v_vis = 'school' and v_school is null then
    return jsonb_build_object('ok', false, 'error', 'no_school');
  end if;

  if v_thumb is not null and (v_thumb not like 'data:image/%' or length(v_thumb) > 300000) then
    return jsonb_build_object('ok', false, 'error', 'thumb_too_big');
  end if;

  select name into v_subj from ks_categories where name = btrim(coalesce(p_subject, ''));
  v_subj := coalesce(v_subj, 'Andere');

  if p_questions is not null and jsonb_typeof(p_questions) = 'array' then
    if exists (select 1 from jsonb_array_elements(p_questions) e
                where nullif(e->>'image', '') is not null
                  and (e->>'image' not like 'data:image/%'
                       or length(e->>'image') > 1500000)) then
      return jsonb_build_object('ok', false, 'error', 'image_too_big');
    end if;
  end if;

  if p_catalog_id is null then
    insert into ks_catalogs (owner_id, school_id, title, subject, visibility,
                             thumbnail, thumb_custom)
    values (v_user, v_school, trim(p_title), v_subj, coalesce(v_vis, 'private'),
            v_thumb, coalesce(p_thumb_custom, false) and v_thumb is not null)
    returning id into v_cat;
  else
    update ks_catalogs
       set title        = trim(p_title),
           subject      = v_subj,
           visibility   = coalesce(v_vis, visibility),
           school_id    = coalesce(school_id, v_school),
           thumbnail    = v_thumb,
           thumb_custom = coalesce(p_thumb_custom, false) and v_thumb is not null,
           updated_at   = now()
     where id = p_catalog_id
       and owner_id = v_user
       and is_template = false
    returning id into v_cat;

    if v_cat is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    delete from ks_questions where catalog_id = v_cat;
  end if;

  if p_questions is not null and jsonb_typeof(p_questions) = 'array' then
    for v_q in select * from jsonb_array_elements(p_questions) loop
      v_opts := v_q->'options';

      v_ci := null;
      if v_q ? 'correct_indices' and jsonb_typeof(v_q->'correct_indices') = 'array' then
        select array_agg(el::smallint)
          into v_ci
          from jsonb_array_elements_text(v_q->'correct_indices') el;
      end if;

      v_img := nullif(v_q->>'image', '');

      insert into ks_questions (
        catalog_id, question_text, options, correct_idx,
        correct_indices, time_limit_sec, explanation, sort_order,
        image, image_name
      ) values (
        v_cat,
        coalesce(v_q->>'question_text', ''),
        coalesce(v_opts, '["","","",""]'::jsonb),
        coalesce((v_q->>'correct_idx')::smallint, 0),
        v_ci,
        coalesce((v_q->>'time_limit_sec')::int, 20),
        v_q->>'explanation',
        v_i,
        v_img,
        case when v_img is null then null
             else left(coalesce(nullif(trim(v_q->>'image_name'), ''), 'Foto'), 200) end
      );

      v_i := v_i + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'catalog_id', v_cat, 'count', v_i);
end;
$$;

revoke all on function ks_catalog_save(uuid, text, text, jsonb, text, text, boolean) from public;
grant execute on function ks_catalog_save(uuid, text, text, jsonb, text, text, boolean) to authenticated;

-- Fassung mit p_code (der Raum hängt p_code an jeden Aufruf, lib/tool.js)
create or replace function ks_catalog_save(
  p_code        text,
  p_catalog_id  uuid,
  p_title       text,
  p_subject     text,
  p_questions   jsonb,
  p_visibility  text    default null,
  p_thumbnail   text    default null,
  p_thumb_custom boolean default false
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language sql
as $$ select ks_catalog_save(p_catalog_id, p_title, p_subject, p_questions,
                             p_visibility, p_thumbnail, p_thumb_custom) $$;

revoke all on function ks_catalog_save(text, uuid, text, text, jsonb, text, text, boolean) from public;
grant execute on function ks_catalog_save(text, uuid, text, text, jsonb, text, text, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Status ändern, löschen
-- ─────────────────────────────────────────────────────────────
-- Besitzer: jede der drei Stufen, jederzeit (auch zurück auf privat).
-- Admin: nur zurück auf privat.
create or replace function ks_catalog_set_visibility(p_catalog_id uuid, p_visibility text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_cat  ks_catalogs;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_visibility is null or p_visibility not in ('private', 'school', 'hub') then
    return jsonb_build_object('ok', false, 'error', 'bad_visibility');
  end if;

  select * into v_cat from ks_catalogs where id = p_catalog_id;
  if v_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_cat.owner_id = v_user and not v_cat.is_template then
    if p_visibility <> 'private' and not can_teach() then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
    if p_visibility = 'school' and coalesce(v_cat.school_id, ks_my_school()) is null then
      return jsonb_build_object('ok', false, 'error', 'no_school');
    end if;
    update ks_catalogs
       set visibility = p_visibility,
           school_id  = coalesce(school_id, ks_my_school()),
           updated_at = now()
     where id = v_cat.id;
    return jsonb_build_object('ok', true, 'visibility', p_visibility);
  end if;

  if p_visibility = 'private' and ks_catalog_can_admin(v_cat) then
    update ks_catalogs
       set visibility  = 'private',
           is_template = false,
           updated_at  = now()
     where id = v_cat.id;
    return jsonb_build_object('ok', true, 'visibility', 'private');
  end if;

  return jsonb_build_object('ok', false, 'error', 'not_found');
end;
$$;

revoke all on function ks_catalog_set_visibility(uuid, text) from public;
grant execute on function ks_catalog_set_visibility(uuid, text) to authenticated;

create or replace function ks_catalog_set_visibility(p_code text, p_catalog_id uuid, p_visibility text)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language sql
as $$ select ks_catalog_set_visibility(p_catalog_id, p_visibility) $$;

revoke all on function ks_catalog_set_visibility(text, uuid, text) from public;
grant execute on function ks_catalog_set_visibility(text, uuid, text) to authenticated;

-- Löschen: der Besitzer (eigenes, auch veröffentlicht) oder ein Admin
-- (Veröffentlichtes in seinem Bereich). Die Fragen gehen per CASCADE mit.
create or replace function ks_catalog_delete(p_catalog_id uuid)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_cat  ks_catalogs;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_cat from ks_catalogs where id = p_catalog_id;
  if v_cat.id is null
     or not ((v_cat.owner_id = v_user and not v_cat.is_template)
             or ks_catalog_can_admin(v_cat)) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  delete from ks_catalogs where id = v_cat.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_catalog_delete(uuid) from public;
grant execute on function ks_catalog_delete(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) Fragen kurz ansehen, Thumbnails nachladen
-- ─────────────────────────────────────────────────────────────
-- Nur die Fragetexte — keine Antworten, keine Lösung.
create or replace function ks_catalog_peek(p_catalog_id uuid)
  returns jsonb
  stable
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_cat ks_catalogs;
begin
  select * into v_cat from ks_catalogs where id = p_catalog_id;
  if v_cat.id is null or not ks_catalog_can_see(v_cat) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'questions', coalesce((
    select jsonb_agg(q.question_text order by q.sort_order, q.id)
      from ks_questions q where q.catalog_id = v_cat.id), '[]'::jsonb));
end;
$$;

revoke all on function ks_catalog_peek(uuid) from public;
grant execute on function ks_catalog_peek(uuid) to authenticated;

create or replace function ks_catalog_peek(p_code text, p_catalog_id uuid)
  returns jsonb
  stable
  security definer
  set search_path = public
  language sql
as $$ select ks_catalog_peek(p_catalog_id) $$;

revoke all on function ks_catalog_peek(text, uuid) from public;
grant execute on function ks_catalog_peek(text, uuid) to authenticated;

-- Höchstens 24 Ids je Aufruf; liefert { id: "data:image/…" } nur für
-- sichtbare Kataloge, die ein Thumbnail haben.
create or replace function ks_catalog_thumbs(p_ids uuid[])
  returns jsonb
  stable
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  return jsonb_build_object('ok', true, 'thumbs', coalesce((
    select jsonb_object_agg(c.id::text, c.thumbnail)
      from ks_catalogs c
     where c.id = any(coalesce(p_ids[1:24], '{}'::uuid[]))
       and c.thumbnail is not null
       and ks_catalog_can_see(c)
  ), '{}'::jsonb));
end;
$$;

revoke all on function ks_catalog_thumbs(uuid[]) from public;
grant execute on function ks_catalog_thumbs(uuid[]) to authenticated;

create or replace function ks_catalog_thumbs(p_code text, p_ids uuid[])
  returns jsonb
  stable
  security definer
  set search_path = public
  language sql
as $$ select ks_catalog_thumbs(p_ids) $$;

revoke all on function ks_catalog_thumbs(text, uuid[]) from public;
grant execute on function ks_catalog_thumbs(text, uuid[]) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9) Raum: Auswahl nur aus sichtbaren Katalogen, Liste wie oben
-- ─────────────────────────────────────────────────────────────
create or replace function ks_room_setup(
  p_code     text,
  p_catalog  uuid default null,
  p_settings jsonb default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room  uuid := ks_owned_room(p_code);
  v_b     ks_boards;
  v_count int;
  v_cat   ks_catalogs;
begin
  if v_room is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_b := ks_ensure_board(v_room);

  if v_b.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  if p_catalog is not null then
    select * into v_cat from ks_catalogs where id = p_catalog;
    if v_cat.id is null or not ks_catalog_can_see(v_cat) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    select count(*) into v_count from ks_questions where catalog_id = p_catalog;
    update ks_boards
       set catalog_id     = p_catalog,
           question_count = v_count,
           settings       = coalesce(p_settings, settings)
     where room_id = v_room;
  elsif p_settings is not null then
    update ks_boards
       set settings = coalesce(p_settings, settings)
     where room_id = v_room;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_room_setup(text, uuid, jsonb) from public;
grant execute on function ks_room_setup(text, uuid, jsonb) to authenticated;

-- ks_room_get: die Lobby bekommt die Liste und die Themenfelder von
-- ks_catalogs_list. Vorbau wie 0187: die bisherige Fassung (0188) heißt
-- danach _ks_room_get_v188.
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_room_get_v188') then
    alter function ks_room_get(text) rename to _ks_room_get_v188;
  end if;
end $$;

revoke all on function _ks_room_get_v188(text) from public, anon, authenticated;

create or replace function ks_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v jsonb := _ks_room_get_v188(p_code);
  l jsonb;
begin
  if coalesce((v->>'ok')::boolean, false) is not true then
    return v;
  end if;
  if v ? 'catalogs' and jsonb_typeof(v->'catalogs') = 'array' then
    l := ks_catalogs_list();
    v := v || jsonb_build_object('catalogs', l->'catalogs', 'categories', l->'categories');
  end if;
  return v;
end;
$$;

revoke all on function ks_room_get(text) from public;
grant execute on function ks_room_get(text) to authenticated;

comment on function ks_room_get(text) is
  'Beamer-Ansicht von Knowledge Stack (Fassung 0188 als _ks_room_get_v188). Seit 0194 kommt die '
  'Katalogliste der Lobby aus ks_catalogs_list (Autor, Status, Themenfeld) samt categories.';
