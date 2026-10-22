-- ══════════════════════════════════════════════════════════════
-- Migration 0219 — Knowledge Stack: „gemeinsam erstellen"
-- ══════════════════════════════════════════════════════════════
-- Ein Knowledge-Stack-Raum hat jetzt zwei Modi. Gewählt wird beim
-- Anlegen neben dem Titel (skill_rooms.settings.mode, settingsFields
-- in tools/KnowledgeStack/tool.js):
--
--   play    „gemeinsam quizzen" — das Live-Quiz wie bisher (Vorgabe,
--           auch für alle Räume ohne mode).
--   create  „gemeinsam erstellen" — die Kinder bekommen den Quiz-
--           Editor der Lehrkraft (dieselben Funktionen), können aber
--           nicht selbst speichern oder veröffentlichen.
--
-- ── Entwürfe (ks_drafts) ─────────────────────────────────────
-- Was ein Kind schreibt, sichert das Tablet von selbst als Entwurf —
-- je Teilnehmer (skill_participants), also je Gerät bzw. je Konto:
-- wer angemeldet beitritt, bekommt auf jedem Gerät denselben Platz
-- und damit dieselben Entwürfe. Ein Kind kann mehrere Quizze anlegen
-- und zwischen ihnen wechseln. Die Entwürfe hängen am Raum: geht der
-- Raum (skill_cleanup), gehen sie mit (on delete cascade).
--
-- ── „An Lehrkraft senden" (ks_draft_send) ─────────────────────
-- Legt das Quiz als ks_catalogs-Eintrag der Raum-BESITZERIN an:
-- privat, Titel „<Titel> von <Name>", und mit folder = Raumtitel.
-- Im Katalog der Lehrkraft steht es damit in einer eigenen Gruppe mit
-- dem Namen des Raums (ks_catalogs_list liefert `folder`). Erneut
-- senden ersetzt die Fassung, die schon bei der Lehrkraft liegt
-- (sent_catalog_id), statt eine zweite anzulegen — solange die
-- Lehrkraft sie nicht gelöscht hat.
--
-- ── Rechte ────────────────────────────────────────────────────
-- Alles läuft über security-definer-RPCs mit dem Token des Geräts
-- (ks_draft_*) bzw. dem Raum-Code (ks_room_drafts). Keine Grants an
-- anon/authenticated auf die Tabelle (CLAUDE.md, seit 0215).
--
-- Prüfstand: supabase/tests/0219_knowledgestack_gemeinsam_erstellen.mjs
-- Idempotent: if not exists, create or replace, Vorbau wie 0194/0217.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten am Katalog, Tabelle der Entwürfe
-- ─────────────────────────────────────────────────────────────
alter table ks_catalogs add column if not exists folder    text;
alter table ks_catalogs add column if not exists from_room uuid
  references skill_rooms(id) on delete set null;

comment on column ks_catalogs.folder is
  'Eingesandt aus einem Raum „gemeinsam erstellen" (0219): Titel des Raums beim Senden. '
  'Der Katalog der Lehrkraft gruppiert danach statt nach Themenfeld.';
comment on column ks_catalogs.from_room is
  'Raum, aus dem das Quiz eingesandt wurde (0219). Solange es ihn gibt, gilt sein aktueller Titel als Ordner.';

create table if not exists ks_drafts (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references skill_rooms(id) on delete cascade,
  participant_id  uuid not null references skill_participants(id) on delete cascade,
  title           text not null default '',
  content         jsonb not null default '{}'::jsonb,   -- {subject, questions, thumbnail, thumb_custom}
  question_count  int  not null default 0,
  sent_catalog_id uuid references ks_catalogs(id) on delete set null,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ks_drafts_title_len check (char_length(title) <= 120)
);

comment on table ks_drafts is
  'Knowledge Stack „gemeinsam erstellen" (0219): Quiz-Entwürfe der Kinder, je Teilnehmer und Raum. '
  'Gehen mit dem Raum. Gesendet wird als privater Katalog der Raum-Besitzerin (ks_draft_send).';

create index if not exists ks_drafts_participant_idx on ks_drafts (participant_id, updated_at desc);
create index if not exists ks_drafts_room_idx        on ks_drafts (room_id);
create index if not exists ks_catalogs_from_room_idx on ks_catalogs (from_room);

alter table ks_drafts enable row level security;
grant select, insert, update, delete on ks_drafts to service_role;

-- Raum umbenannt → der Ordner zieht mit. Sonst stünden Quizze aus
-- demselben Raum nach dem Löschen des Raums in zwei Ordnern (alter und
-- neuer Titel, je nachdem, wann gesendet wurde).
create or replace function ks_folder_follow_room()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  update ks_catalogs set folder = new.title where from_room = new.id and folder is distinct from new.title;
  return new;
end;
$$;

revoke all on function ks_folder_follow_room() from public, anon, authenticated;

drop trigger if exists ks_folder_follow_room on skill_rooms;
create trigger ks_folder_follow_room
  after update of title on skill_rooms
  for each row when (old.title is distinct from new.title)
  execute function ks_folder_follow_room();


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer
-- ─────────────────────────────────────────────────────────────
-- Der Modus eines Raums. Alles außer 'create' ist 'play'.
create or replace function ks_room_mode(p_room skill_rooms)
  returns text
  immutable
  language sql
as $$ select case when p_room.settings->>'mode' = 'create' then 'create' else 'play' end $$;

revoke all on function ks_room_mode(skill_rooms) from public, anon, authenticated;

-- Das Gerät hinter einem Token — nur, wenn es im Raum schreiben darf.
-- Fehler als Text, sonst null.
create or replace function ks_draft_device(p_token text, out p skill_participants, out r skill_rooms, out err text)
  stable
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  select * into p from skill_participants where token = p_token;
  if p.id is null then err := 'unknown_token'; return; end if;
  if p.removed_at is not null then err := 'removed'; return; end if;
  if p.blocked then err := 'blocked'; return; end if;
  select * into r from skill_rooms where id = p.room_id;
  if r.id is null or r.expires_at <= now() then err := 'room_gone'; return; end if;
  if r.tool_id <> 'knowledgestack' or ks_room_mode(r) <> 'create' then err := 'not_create_mode'; return; end if;
end;
$$;

revoke all on function ks_draft_device(text) from public, anon, authenticated;

-- Lehrkraft (Besitzer oder eingeladen, 0205) eines Raums per Code.
create or replace function ks_teacher_room(p_code text)
  returns skill_rooms
  stable
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r skill_rooms;
begin
  select * into v_r from skill_rooms where code = upper(btrim(coalesce(p_code, '')));
  if v_r.id is null or not skill_room_is_teacher(v_r.id, auth.uid()) then return null; end if;
  return v_r;
end;
$$;

revoke all on function ks_teacher_room(text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Kinder: Entwürfe auflisten, laden, sichern, löschen
-- ─────────────────────────────────────────────────────────────
create or replace function ks_drafts_list(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  d record;
begin
  select * into d from ks_draft_device(p_token);
  if d.err is not null then return jsonb_build_object('ok', false, 'error', d.err); end if;

  return jsonb_build_object('ok', true, 'mode', 'create', 'drafts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',         k.id,
      'title',      k.title,
      'count',      k.question_count,
      'updated_at', k.updated_at,
      'sent_at',    k.sent_at,
      -- nach dem Senden noch geändert?
      'changed',    (k.sent_at is not null and k.updated_at > k.sent_at)
    ) order by k.updated_at desc)
      from ks_drafts k where k.participant_id = (d.p).id), '[]'::jsonb));
end;
$$;

revoke all on function ks_drafts_list(text) from public;
grant execute on function ks_drafts_list(text) to anon, authenticated;

create or replace function ks_draft_get(p_token text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  d record;
  k ks_drafts;
begin
  select * into d from ks_draft_device(p_token);
  if d.err is not null then return jsonb_build_object('ok', false, 'error', d.err); end if;
  select * into k from ks_drafts where id = p_id and participant_id = (d.p).id;
  if k.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'draft', k.content || jsonb_build_object(
    'id', k.id, 'title', k.title, 'sent_at', k.sent_at));
end;
$$;

revoke all on function ks_draft_get(text, uuid) from public;
grant execute on function ks_draft_get(text, uuid) to anon, authenticated;

-- Sichern: p_id null = neuer Entwurf. Der Inhalt bleibt, wie der
-- Editor ihn hält (auch halbfertig, auch eine noch kaputte Skala) —
-- geprüft wird erst beim Senden. Grenzen: 30 Entwürfe je Kind,
-- 8 Mio. Zeichen je Entwurf (Fotos!).
create or replace function ks_draft_save(p_token text, p_id uuid, p_title text, p_content jsonb)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  d       record;
  v_id    uuid;
  v_title text := left(btrim(coalesce(p_title, '')), 120);
  v_c     jsonb := coalesce(p_content, '{}'::jsonb);
  v_n     int;
begin
  select * into d from ks_draft_device(p_token);
  if d.err is not null then return jsonb_build_object('ok', false, 'error', d.err); end if;

  if jsonb_typeof(v_c) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if length(v_c::text) > 8000000 then
    return jsonb_build_object('ok', false, 'error', 'draft_too_big');
  end if;
  v_c := v_c - 'id' - 'title' - 'sent_at';
  v_n := case when jsonb_typeof(v_c->'questions') = 'array' then jsonb_array_length(v_c->'questions') else 0 end;

  if p_id is null then
    if (select count(*) from ks_drafts where participant_id = (d.p).id) >= 30 then
      return jsonb_build_object('ok', false, 'error', 'too_many_drafts');
    end if;
    insert into ks_drafts (room_id, participant_id, title, content, question_count)
    values ((d.r).id, (d.p).id, v_title, v_c, v_n)
    returning id into v_id;
  else
    update ks_drafts
       set title = v_title, content = v_c, question_count = v_n, updated_at = now()
     where id = p_id and participant_id = (d.p).id
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function ks_draft_save(text, uuid, text, jsonb) from public;
grant execute on function ks_draft_save(text, uuid, text, jsonb) to anon, authenticated;

create or replace function ks_draft_delete(p_token text, p_id uuid)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  d record;
begin
  select * into d from ks_draft_device(p_token);
  if d.err is not null then return jsonb_build_object('ok', false, 'error', d.err); end if;
  delete from ks_drafts where id = p_id and participant_id = (d.p).id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function ks_draft_delete(text, uuid) from public;
grant execute on function ks_draft_delete(text, uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) „An Lehrkraft senden"
-- ─────────────────────────────────────────────────────────────
-- p_questions kommt so, wie der Editor sie auch beim Speichern schickt
-- (kind, scale, options, correct_indices …). Die Regeln sind die von
-- ks_catalog_save (0194 + 0217): Fotos ≤ 1,5 Mio. Zeichen, Skala mit
-- Start < Ende und Ziel dazwischen, Wahr/Falsch genau zwei Antworten.
create or replace function ks_draft_send(
  p_token        text,
  p_id           uuid,
  p_title        text,
  p_subject      text,
  p_questions    jsonb,
  p_thumbnail    text    default null,
  p_thumb_custom boolean default false
)
  returns jsonb
  volatile
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  d       record;
  k       ks_drafts;
  v_name  text;
  v_title text;
  v_subj  text;
  v_thumb text := nullif(p_thumbnail, '');
  v_cat   uuid;
  v_q     jsonb;
  v_kind  text;
  v_s     jsonb;
  v_min   numeric; v_max numeric; v_tgt numeric; v_step numeric;
  v_opts  jsonb;
  v_ci    smallint[];
  v_c0    smallint;
  v_img   text;
  v_i     int := 0;
  v_neu   boolean := false;
begin
  select * into d from ks_draft_device(p_token);
  if d.err is not null then return jsonb_build_object('ok', false, 'error', d.err); end if;

  select * into k from ks_drafts where id = p_id and participant_id = (d.p).id for update;
  if k.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if p_title is null or btrim(p_title) = '' then
    return jsonb_build_object('ok', false, 'error', 'title_required');
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_questions');
  end if;
  if jsonb_array_length(p_questions) > 100 then
    return jsonb_build_object('ok', false, 'error', 'too_many_questions');
  end if;
  if exists (select 1 from jsonb_array_elements(p_questions) e
              where nullif(e->>'image', '') is not null
                and (e->>'image' not like 'data:image/%' or length(e->>'image') > 1500000)) then
    return jsonb_build_object('ok', false, 'error', 'image_too_big');
  end if;
  if v_thumb is not null and (v_thumb not like 'data:image/%' or length(v_thumb) > 300000) then
    return jsonb_build_object('ok', false, 'error', 'thumb_too_big');
  end if;

  -- Skalen vorher prüfen: ein Fehler soll nichts halb anlegen.
  for v_q in select * from jsonb_array_elements(p_questions) loop
    if v_q->>'kind' = 'scale' then
      begin
        v_min := (v_q->'scale'->>'min')::numeric;
        v_max := (v_q->'scale'->>'max')::numeric;
        v_tgt := (v_q->'scale'->>'target')::numeric;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'bad_scale');
      end;
      if v_min is null or v_max is null or v_tgt is null or v_min >= v_max
         or v_tgt < v_min or v_tgt > v_max then
        return jsonb_build_object('ok', false, 'error', 'bad_scale');
      end if;
    end if;
  end loop;

  -- „von <Name>": der Name im Raum, sonst der Anzeigename, sonst die Platznummer.
  v_name := coalesce(nullif(btrim((d.p).name), ''),
                     (select nullif(btrim(display_name), '') from profiles where id = (d.p).user_id),
                     'Tablet ' || (d.p).seat);
  v_title := left(btrim(p_title), 90) || ' von ' || v_name;
  select name into v_subj from ks_categories where name = btrim(coalesce(p_subject, ''));
  v_subj := coalesce(v_subj, 'Andere');

  -- Schon gesendet und noch da? Dann diese Fassung ersetzen.
  if k.sent_catalog_id is not null then
    update ks_catalogs
       set title        = v_title,
           subject      = v_subj,
           thumbnail    = v_thumb,
           thumb_custom = coalesce(p_thumb_custom, false) and v_thumb is not null,
           folder       = (d.r).title,
           updated_at   = now()
     where id = k.sent_catalog_id and owner_id = (d.r).owner_id and from_room = (d.r).id
    returning id into v_cat;
    if v_cat is not null then delete from ks_questions where catalog_id = v_cat; end if;
  end if;

  if v_cat is null then
    insert into ks_catalogs (owner_id, school_id, title, subject, visibility,
                             thumbnail, thumb_custom, folder, from_room)
    values ((d.r).owner_id, (d.r).school_id, v_title, v_subj, 'private',
            v_thumb, coalesce(p_thumb_custom, false) and v_thumb is not null,
            (d.r).title, (d.r).id)
    returning id into v_cat;
    v_neu := true;
  end if;

  for v_q in select * from jsonb_array_elements(p_questions) loop
    v_kind := coalesce(nullif(v_q->>'kind', ''), 'mc');
    if v_kind not in ('mc', 'tf', 'scale', 'bet') then v_kind := 'mc'; end if;
    v_s := null;
    v_opts := case when jsonb_typeof(v_q->'options') = 'array' then v_q->'options' else '["","","",""]'::jsonb end;

    v_ci := null;
    if jsonb_typeof(v_q->'correct_indices') = 'array' then
      select array_agg(el::smallint) into v_ci
        from jsonb_array_elements_text(v_q->'correct_indices') el
       where el ~ '^[0-3]$';
    end if;
    v_c0 := case when (v_q->>'correct_idx') ~ '^[0-3]$' then (v_q->>'correct_idx')::smallint
                 else coalesce(v_ci[1], 0) end;

    if v_kind = 'scale' then
      v_min := (v_q->'scale'->>'min')::numeric;
      v_max := (v_q->'scale'->>'max')::numeric;
      v_tgt := (v_q->'scale'->>'target')::numeric;
      v_step := case when (v_q->'scale'->>'step') ~ '^[0-9.]+$' then (v_q->'scale'->>'step')::numeric end;
      v_s := jsonb_build_object('min', v_min, 'max', v_max, 'target', v_tgt,
               'step', case when v_step > 0 and v_step <= v_max - v_min then v_step end,
               'unit', left(btrim(coalesce(v_q->'scale'->>'unit', '')), 20));
      v_opts := '[]'::jsonb; v_c0 := 0; v_ci := array[0]::smallint[];
    elsif v_kind = 'tf' then
      v_opts := jsonb_build_array(coalesce(nullif(btrim(v_opts->>0), ''), 'Wahr'),
                                  coalesce(nullif(btrim(v_opts->>1), ''), 'Falsch'));
      v_c0 := case when v_c0 = 1 then 1 else 0 end;
      v_ci := array[v_c0];
    end if;

    v_img := nullif(v_q->>'image', '');

    insert into ks_questions (
      catalog_id, question_text, options, correct_idx, correct_indices,
      time_limit_sec, explanation, sort_order, image, image_name, kind, scale
    ) values (
      v_cat,
      left(coalesce(v_q->>'question_text', ''), 1000),
      v_opts,
      v_c0,
      coalesce(v_ci, array[v_c0]),
      least(120, greatest(5, coalesce(case when (v_q->>'time_limit_sec') ~ '^[0-9]+$'
                                           then (v_q->>'time_limit_sec')::int end, 20))),
      nullif(left(coalesce(v_q->>'explanation', ''), 1000), ''),
      v_i,
      v_img,
      case when v_img is null then null
           else left(coalesce(nullif(btrim(v_q->>'image_name'), ''), 'Foto'), 200) end,
      v_kind,
      v_s
    );
    v_i := v_i + 1;
  end loop;

  update ks_drafts
     set sent_catalog_id = v_cat, sent_at = now(),
         -- gleich wie sent_at: „nach dem Senden geändert" ist erst einmal falsch
         updated_at = now()
   where id = k.id;

  return jsonb_build_object('ok', true, 'catalog_id', v_cat, 'count', v_i,
                            'title', v_title, 'replaced', not v_neu);
end;
$$;

revoke all on function ks_draft_send(text, uuid, text, text, jsonb, text, boolean) from public;
grant execute on function ks_draft_send(text, uuid, text, text, jsonb, text, boolean) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Lehrkraft: Überblick im Raum
-- ─────────────────────────────────────────────────────────────
-- Wer schreibt woran, und was ist schon angekommen. Die Fragen selbst
-- sieht die Lehrkraft erst, wenn sie gesendet sind — als eigener
-- Katalog (ks_catalog_get). Nur Anwesende (nicht entfernt).
create or replace function ks_room_drafts(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r skill_rooms := ks_teacher_room(p_code);
begin
  if v_r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  return jsonb_build_object(
    'ok', true,
    'mode', ks_room_mode(v_r),
    'is_owner', (v_r.owner_id = auth.uid()),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seat',    p.seat,
        'name',    coalesce(nullif(btrim(p.name), ''), 'Tablet ' || p.seat),
        'drafts',  (select count(*) from ks_drafts k where k.participant_id = p.id),
        'sent',    (select count(*) from ks_drafts k where k.participant_id = p.id and k.sent_at is not null),
        'last_at', (select max(k.updated_at) from ks_drafts k where k.participant_id = p.id)
      ) order by p.seat)
        from skill_participants p
       where p.room_id = v_r.id and p.removed_at is null), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'catalog_id', c.id,
        'title',      c.title,
        'count',      (select count(*) from ks_questions q where q.catalog_id = c.id),
        'updated_at', c.updated_at,
        'mine',       (c.owner_id = auth.uid())
      ) order by c.updated_at desc)
        from ks_catalogs c
       where c.from_room = v_r.id), '[]'::jsonb),
    'sig', (select coalesce(max(k.updated_at)::text, '') || '|' || count(*)
              from ks_drafts k where k.room_id = v_r.id)
           || '|' || (select count(*) from skill_participants p
                       where p.room_id = v_r.id and p.removed_at is null)
  );
end;
$$;

revoke all on function ks_room_drafts(text) from public;
grant execute on function ks_room_drafts(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) ks_catalogs_list — Vorbau: `folder` für Eingesandtes
-- ─────────────────────────────────────────────────────────────
-- Nur an eigenen Quizzen (die eingesandten gehören der Lehrkraft). Gilt
-- der Raum noch, steht sein aktueller Titel da, sonst der beim Senden.
-- ks_room_get (0194) ruft ks_catalogs_list beim Namen — es bekommt den
-- Ordner damit auch im Raum.
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_catalogs_list_v194') then
    alter function ks_catalogs_list() rename to _ks_catalogs_list_v194;
  end if;
end $$;

revoke all on function _ks_catalogs_list_v194() from public, anon, authenticated;

create or replace function ks_catalogs_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v jsonb := _ks_catalogs_list_v194();
begin
  if jsonb_typeof(v->'catalogs') <> 'array' or auth.uid() is null then return v; end if;
  return jsonb_set(v, '{catalogs}', coalesce((
    select jsonb_agg(case when f.folder is not null
                          then e || jsonb_build_object('folder', f.folder) else e end
                     order by t.ord)
      from jsonb_array_elements(v->'catalogs') with ordinality t(e, ord)
      left join lateral (
        select coalesce(r.title, c.folder) as folder
          from ks_catalogs c
          left join skill_rooms r on r.id = c.from_room
         where c.id = (t.e->>'id')::uuid
           and c.folder is not null
           and c.owner_id = auth.uid()
      ) f on true), '[]'::jsonb));
end;
$$;

revoke all on function ks_catalogs_list() from public;
grant execute on function ks_catalogs_list() to authenticated, anon;

comment on function ks_catalogs_list() is
  'Katalog von Knowledge Stack (Fassung 0194 als _ks_catalogs_list_v194). Seit 0219 mit `folder` '
  'an eigenen Quizzen, die Kinder aus einem Raum „gemeinsam erstellen" gesendet haben.';
