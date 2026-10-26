-- ══════════════════════════════════════════════════════════════
-- Migration 0233 — Definitions Derby (neuer MPSkill, Beta, Etappe 1)
-- ══════════════════════════════════════════════════════════════
-- Fünfzehnter Skill: Lehrkräfte legen STAPEL an — je Stapel ein Titel,
-- Fach, Thema, Klassenstufe und Karten aus Begriff · Definition ·
-- (Bild). Daraus werden Lernspiele. Etappe 1: Übersicht/Glossar und
-- Karteikarten-Lerner. Später: Memory, Activity, Derby-Rennen,
-- Team einnehmen, Spielfigur (Plan: tools/DefinitionsDerby/CLAUDE.md).
--
--   1) Registry: skill_tools 'derby', zunächst NUR FÜR ADMINS
--      (admin_only, wie SQL Studio 0220). Freigeben für alle:
--        update skill_tools set admin_only = false where id = 'derby';
--
--   2) dd_stacks — Stapel der Lehrkraft, am KONTO (nicht am Raum),
--      damit sie in jedem Raum stehen. Die Karten liegen als jsonb in
--      der Zeile:
--        cards = [ { "id": "k1", "t": "Begriff", "d": "Definition",
--                    "i": "data:image/…" (optional, im Gerät verkleinert) } ]
--      Deckel: 500 Karten, 1,5 MB je Stapel, 100 Stapel je Person.
--      visibility steht schon da ('private' · 'school' · 'hub' — wie bei
--      ks_catalogs), wird in Etappe 1 aber nur 'private' vergeben; das
--      Teilen mit anderen Lehrkräften (Fach/Thema/Klasse als Katalog)
--      kommt später ohne Umbau.
--
--   3) Teilen mit einem Raum über den Raumzustand (kein eigener Speicher):
--        skill_room_state.data = { "shared": [ { "id": "<uuid>", "t": "Titel",
--                                                "n": 24, "s": "Fach", "p": "Thema",
--                                                "g": "7" } ] }
--      Die Schüler holen einen Stapel mit dd_shared_get(token, id), nur
--      wenn die id in shared DIESES Raums steht UND der Stapel einer
--      Lehrkraft DIESES Raums gehört (Besitzer oder eingeladen).
--
--   4) Lernstand (sicher/teilweise/unsicher je Karte) liegt in Etappe 1
--      im Gerät (localStorage) — keine personenbezogenen Daten auf dem
--      Server, nichts neu in der Datenschutzerklärung. Mit Konto-Sync
--      später.
--
-- Nur RPCs (security definer), keine Grants auf die Tabelle (siehe
-- CLAUDE.md, NEUE TABELLE). Kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Registry
-- ─────────────────────────────────────────────────────────────
insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order, admin_only) values
  ('derby', 'Definitions Derby',
   'Begriffe und Definitionen als Karten: Lehrkräfte legen Stapel an (mit Bildern, per Text oder '
   'Karte für Karte), die Klasse lernt sie mit Karteikarten, behält den Überblick im Glossar '
   'und übt später mit Memory, Activity und Rennen.',
   '🏇', 'DefinitionsDerby', 'Fächerübergreifend', true,
   '{}'::jsonb, true, 88, true)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;

-- admin_only steht bewusst NICHT im on-conflict-Teil: wer es später frei-
-- gibt, soll es mit einem erneuten Einspielen nicht wieder zudrehen.


-- ─────────────────────────────────────────────────────────────
-- 2) Tabelle
-- ─────────────────────────────────────────────────────────────
create table if not exists dd_stacks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  title       text not null,
  subject     text not null default '',
  topic       text not null default '',
  grade       text not null default '',
  visibility  text not null default 'private',
  cards       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dd_stacks_title_len   check (char_length(title) between 1 and 80),
  constraint dd_stacks_subject_len check (char_length(subject) <= 60),
  constraint dd_stacks_topic_len   check (char_length(topic) <= 80),
  constraint dd_stacks_grade_len   check (char_length(grade) <= 20),
  constraint dd_stacks_visibility  check (visibility in ('private', 'school', 'hub')),
  constraint dd_stacks_cards_array check (jsonb_typeof(cards) = 'array'),
  constraint dd_stacks_cards_size  check (octet_length(cards::text) <= 1572864)
);

comment on table dd_stacks is
  'Definitions Derby: Stapel einer Lehrkraft (Titel/Fach/Thema/Klassenstufe + Karten als jsonb). '
  'Hängt am Konto, nicht am Raum. Zugriff nur über dd_*-RPCs. Seit 0233.';

create index if not exists dd_stacks_owner_idx on dd_stacks (owner_id, updated_at desc);

alter table dd_stacks enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 3) Helfer
-- ─────────────────────────────────────────────────────────────
-- Karten prüfen und bereinigen: Form, Längen, Bildformat, Anzahl.
-- Gibt die bereinigte Liste zurück oder null bei ungültiger Eingabe.
create or replace function dd_clean_cards(p_cards jsonb)
  returns jsonb
  language plpgsql
  immutable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_c   jsonb;
  v_t   text;
  v_d   text;
  v_i   text;
  v_id  text;
  v_n   int := 0;
begin
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then return null; end if;
  if jsonb_array_length(p_cards) > 500 then return null; end if;
  for v_c in select * from jsonb_array_elements(p_cards) loop
    if jsonb_typeof(v_c) <> 'object' then return null; end if;
    v_n  := v_n + 1;
    v_t  := btrim(coalesce(v_c->>'t', ''));
    v_d  := btrim(coalesce(v_c->>'d', ''));
    v_i  := nullif(btrim(coalesce(v_c->>'i', '')), '');
    v_id := btrim(coalesce(v_c->>'id', ''));
    if v_id !~ '^[A-Za-z0-9_-]{1,24}$' then v_id := 'k' || v_n; end if;
    if char_length(v_t) not between 1 and 120 then return null; end if;
    if char_length(v_d) not between 1 and 1200 then return null; end if;
    if v_i is not null and (v_i !~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$'
                            or char_length(v_i) > 150000) then
      return null;
    end if;
    v_out := v_out || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object('id', v_id, 't', v_t, 'd', v_d, 'i', v_i)));
  end loop;
  return v_out;
end;
$$;

revoke all on function dd_clean_cards(jsonb) from public, anon, authenticated;


-- Teilnehmer aus dem Token, mit allen Sperren. err ist null, wenn alles passt.
create or replace function dd_part(
  p_token text,
  out p    skill_participants,
  out room skill_rooms,
  out err  text)
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
begin
  select * into p from skill_participants where token = p_token;
  if p.id is null then err := 'unknown_token'; return; end if;
  select * into room from skill_rooms where id = p.room_id;
  if room.id is null or room.expires_at <= now() then err := 'room_gone'; return; end if;
  if room.tool_id <> 'derby' then err := 'not_found'; return; end if;
  if p.blocked then err := 'blocked'; return; end if;
end;
$$;

revoke all on function dd_part(text) from public, anon, authenticated;


-- Der Eintrag in shared für eine id, oder null.
create or replace function dd_shared_entry(p_room uuid, p_id text)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select e
    from skill_room_state s,
         jsonb_array_elements(case when jsonb_typeof(s.data->'shared') = 'array'
                                   then s.data->'shared' else '[]'::jsonb end) e
   where s.room_id = p_room and e->>'id' = p_id
   limit 1;
$$;

revoke all on function dd_shared_entry(uuid, text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Lehrkraft: eigene Stapel
-- ─────────────────────────────────────────────────────────────
-- p_code wie bei SQL Studio nur, weil presenterActions.call ihn anhängt:
-- ein Stapel gehört der Person, nicht dem Raum.

create or replace function dd_stacks_list(p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if not can_teach() then return jsonb_build_object('ok', false, 'error', 'not_a_teacher'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'title', s.title, 'subject', s.subject, 'topic', s.topic,
             'grade', s.grade, 'n', jsonb_array_length(s.cards),
             'updated_at', s.updated_at) order by s.updated_at desc)
      from dd_stacks s where s.owner_id = v_user), '[]'::jsonb));
end;
$$;

revoke all on function dd_stacks_list(text) from public;
grant execute on function dd_stacks_list(text) to authenticated;


create or replace function dd_stack_get(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_s    dd_stacks;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_s from dd_stacks where id = p_id and owner_id = v_user;
  if v_s.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'id', v_s.id, 'title', v_s.title, 'subject', v_s.subject,
                            'topic', v_s.topic, 'grade', v_s.grade, 'cards', v_s.cards,
                            'updated_at', v_s.updated_at);
end;
$$;

revoke all on function dd_stack_get(text, uuid) from public;
grant execute on function dd_stack_get(text, uuid) to authenticated;


-- Anlegen (p_id null) oder einen eigenen ändern.
create or replace function dd_stack_save(
  p_code    text,
  p_id      uuid,
  p_title   text,
  p_subject text,
  p_topic   text,
  p_grade   text,
  p_cards   jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_sub   text := btrim(coalesce(p_subject, ''));
  v_top   text := btrim(coalesce(p_topic, ''));
  v_gr    text := btrim(coalesce(p_grade, ''));
  v_cards jsonb := dd_clean_cards(p_cards);
  v_id    uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if not can_teach() then return jsonb_build_object('ok', false, 'error', 'not_a_teacher'); end if;
  if char_length(v_title) not between 1 and 80 or char_length(v_sub) > 60
     or char_length(v_top) > 80 or char_length(v_gr) > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if v_cards is null then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
  if octet_length(v_cards::text) > 1572864 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;
  if p_id is not null then
    update dd_stacks
       set title = v_title, subject = v_sub, topic = v_top, grade = v_gr,
           cards = v_cards, updated_at = now()
     where id = p_id and owner_id = v_user
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'created', false);
  end if;

  if (select count(*) from dd_stacks where owner_id = v_user) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', 100);
  end if;
  insert into dd_stacks (owner_id, title, subject, topic, grade, cards)
  values (v_user, v_title, v_sub, v_top, v_gr, v_cards)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'created', true);
end;
$$;

revoke all on function dd_stack_save(text, uuid, text, text, text, text, jsonb) from public;
grant execute on function dd_stack_save(text, uuid, text, text, text, text, jsonb) to authenticated;


create or replace function dd_stack_delete(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_n    int;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  delete from dd_stacks where id = p_id and owner_id = v_user;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_stack_delete(text, uuid) from public;
grant execute on function dd_stack_delete(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Teilnehmer: einen geteilten Stapel holen
-- ─────────────────────────────────────────────────────────────
-- Zwei Bedingungen: die id steht in shared DIESES Raums, und der Stapel
-- gehört einer Lehrkraft DIESES Raums. Ohne die zweite könnte jemand
-- eine fremde id in die Liste schreiben und sie sich ausliefern lassen.
create or replace function dd_shared_get(p_token text, p_id text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v   record;
  v_s dd_stacks;
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if dd_shared_entry((v.room).id, p_id) is null then
    return jsonb_build_object('ok', false, 'error', 'not_shared');
  end if;
  if p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_s from dd_stacks where id = p_id::uuid;
  if v_s.id is null or not skill_room_is_teacher((v.room).id, v_s.owner_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_s.id, 'title', v_s.title, 'subject', v_s.subject,
                            'topic', v_s.topic, 'grade', v_s.grade, 'cards', v_s.cards,
                            'updated_at', v_s.updated_at);
end;
$$;

revoke all on function dd_shared_get(text, text) from public;
grant execute on function dd_shared_get(text, text) to anon, authenticated;
