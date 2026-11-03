-- ══════════════════════════════════════════════════════════════
-- Migration 0260 — Diagramm: Teilen in beide Richtungen
-- ══════════════════════════════════════════════════════════════
-- Bis 0258 sah die Lehrkraft jedes Diagramm der Klasse. Ab jetzt
-- entscheidet die Person am Tablet:
--
--   Schüler → Lehrkraft
--     · „Mit Lehrkraft teilen" (dg_mine_share) — erst dann sieht die
--       Lehrkraft das Diagramm (dg_class_get → sonst 'not_shared').
--       Wieder entziehen geht jederzeit.
--     · Die Lehrkraft kann fragen (dg_class_ask): am Tablet erscheint
--       eine Anfrage, die Person sagt Ja (= teilen) oder Nein
--       (dg_mine_answer). Nein merkt sich der Server als 'declined',
--       damit die Lehrkraft es sieht; erneut fragen darf sie, aber
--       höchstens alle 30 s.
--     · In der Liste (dg_class_list) stehen von nicht geteilten
--       Diagrammen nur Name, Art und Stand der Anfrage — kein Titel,
--       keine Zahl der Bausteine.
--
--   Lehrkraft → Klasse
--     · Die Lehrkraft gibt ihr Diagramm an die Klasse (dg_class_share,
--       Tabelle dg_shared, eine Zeile je Raum). Die Tablets fragen
--       alle paar Sekunden dg_mine_poll (klein: geteilt?, Anfrage?,
--       rev des Lehrkraft-Diagramms) und holen das Diagramm nur, wenn
--       die Person es öffnen will (dg_mine_teacher_get). Wer es öffnet,
--       bekommt eine Kopie als eigenes Diagramm (dg_mine_put wie
--       immer). dg_class_unshare nimmt es zurück.
--
-- Nur RPCs (security definer), keine Grants auf die Tabellen.
-- Freigaben in supabase/tests/0225_rechte_freigaben.json.
-- Kein DROP von Daten, idempotent.
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Spalten und Tabelle
-- ─────────────────────────────────────────────────────────────
alter table dg_work add column if not exists shared boolean not null default false;
alter table dg_work add column if not exists ask    text;
alter table dg_work add column if not exists ask_at timestamptz;
do $$ begin
  alter table dg_work add constraint dg_work_ask check (ask is null or ask in ('open', 'declined'));
exception when duplicate_object then null; end $$;

create table if not exists dg_shared (
  room_id    uuid primary key references skill_rooms(id) on delete cascade,
  title      text not null default '',
  kind       text not null default 'mindmap',
  doc        jsonb not null default '{}'::jsonb,
  rev        int  not null default 1,
  shared_by  uuid,
  updated_at timestamptz not null default now(),
  constraint dg_shared_title_len check (char_length(title) <= 80),
  constraint dg_shared_kind      check (kind in ('mindmap', 'wirkung', 'klasse', 'objekt')),
  constraint dg_shared_size      check (octet_length(doc::text) <= 300000)
);

comment on table dg_shared is
  'Diagramm, das die Lehrkraft an die Klasse eines Diagramm-Raums gegeben hat (eine Zeile je Raum). Seit 0260.';

alter table dg_shared enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2) Teilnehmer
-- ─────────────────────────────────────────────────────────────
create or replace function dg_mine_get(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v   record;
  v_w dg_work;
begin
  select * into v from dg_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  select * into v_w from dg_work where participant_id = (v.p).id;
  if v_w.participant_id is null then return jsonb_build_object('ok', true, 'doc', null, 'shared', false); end if;
  return jsonb_build_object('ok', true, 'doc', v_w.doc, 'title', v_w.title, 'kind', v_w.kind,
                            'rev', v_w.rev, 'updated_at', v_w.updated_at,
                            'shared', v_w.shared, 'ask', v_w.ask);
end;
$$;

revoke all on function dg_mine_get(text) from public;
grant execute on function dg_mine_get(text) to anon, authenticated;


-- Klein, läuft alle paar Sekunden: geteilt? Anfrage? Diagramm der Lehrkraft?
create or replace function dg_mine_poll(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v   record;
  v_w dg_work;
  v_s dg_shared;
begin
  select * into v from dg_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  select * into v_w from dg_work where participant_id = (v.p).id;
  select * into v_s from dg_shared where room_id = (v.room).id;
  return jsonb_build_object('ok', true,
    'shared', coalesce(v_w.shared, false),
    'ask',    v_w.ask,
    'teacher', case when v_s.room_id is null then null else
               jsonb_build_object('rev', v_s.rev, 'title', v_s.title, 'kind', v_s.kind,
                                  'nodes', case when jsonb_typeof(v_s.doc->'nodes') = 'array' then jsonb_array_length(v_s.doc->'nodes') else 0 end,
                                  'updated_at', v_s.updated_at) end);
end;
$$;

revoke all on function dg_mine_poll(text) from public;
grant execute on function dg_mine_poll(text) to anon, authenticated;


-- Teilen an/aus. Teilen beantwortet zugleich eine offene Anfrage.
create or replace function dg_mine_share(p_token text, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v record;
  n int;
begin
  select * into v from dg_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  update dg_work
     set shared = coalesce(p_on, false),
         ask    = case when coalesce(p_on, false) then null else ask end
   where participant_id = (v.p).id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'shared', coalesce(p_on, false));
end;
$$;

revoke all on function dg_mine_share(text, boolean) from public;
grant execute on function dg_mine_share(text, boolean) to anon, authenticated;


-- Antwort auf die Anfrage der Lehrkraft: Ja = teilen, Nein = abgelehnt.
create or replace function dg_mine_answer(p_token text, p_yes boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v record;
  n int;
begin
  select * into v from dg_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if coalesce(p_yes, false) then
    update dg_work set shared = true, ask = null where participant_id = (v.p).id;
  else
    update dg_work set ask = 'declined' where participant_id = (v.p).id and ask = 'open';
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'shared', coalesce(p_yes, false) and n > 0);
end;
$$;

revoke all on function dg_mine_answer(text, boolean) from public;
grant execute on function dg_mine_answer(text, boolean) to anon, authenticated;


-- Das Diagramm, das die Lehrkraft geteilt hat (nur auf Wunsch geholt).
create or replace function dg_mine_teacher_get(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v   record;
  v_s dg_shared;
begin
  select * into v from dg_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  select * into v_s from dg_shared where room_id = (v.room).id;
  if v_s.room_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'doc', v_s.doc, 'title', v_s.title, 'kind', v_s.kind, 'rev', v_s.rev);
end;
$$;

revoke all on function dg_mine_teacher_get(text) from public;
grant execute on function dg_mine_teacher_get(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Lehrkraft
-- ─────────────────────────────────────────────────────────────
-- Nicht geteilt: nur Name, Art und Stand der Anfrage.
create or replace function dg_class_list(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms := dg_teacher_room(p_code);
  v_s    dg_shared;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_s from dg_shared where room_id = v_room.id;
  return jsonb_build_object('ok', true,
    'teacher', case when v_s.room_id is null then null else
               jsonb_build_object('rev', v_s.rev, 'title', v_s.title, 'kind', v_s.kind, 'updated_at', v_s.updated_at) end,
    'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'participant', p.id,
             'person',      coalesce(nullif(btrim(p.name), ''), 'Tablet ' || p.seat),
             'seat',        p.seat,
             'shared',      w.shared,
             'ask',         w.ask,
             'kind',        w.kind,
             'title',       case when w.shared then w.title else '' end,
             'nodes',       case when w.shared then w.nodes else null end,
             'rev',         case when w.shared then w.rev else 0 end,
             'updated_at',  w.updated_at)
           order by p.seat)
      from dg_work w join skill_participants p on p.id = w.participant_id
     where w.room_id = v_room.id), '[]'::jsonb));
end;
$$;

revoke all on function dg_class_list(text) from public;
grant execute on function dg_class_list(text) to authenticated;


create or replace function dg_class_get(p_code text, p_participant uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms := dg_teacher_room(p_code);
  v_w    dg_work;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_w from dg_work where participant_id = p_participant and room_id = v_room.id;
  if v_w.participant_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not v_w.shared then return jsonb_build_object('ok', false, 'error', 'not_shared'); end if;
  return jsonb_build_object('ok', true, 'doc', v_w.doc, 'title', v_w.title, 'kind', v_w.kind,
                            'rev', v_w.rev, 'updated_at', v_w.updated_at);
end;
$$;

revoke all on function dg_class_get(text, uuid) from public;
grant execute on function dg_class_get(text, uuid) to authenticated;


-- Fragen, ob man ansehen darf. Höchstens alle 30 s je Person.
create or replace function dg_class_ask(p_code text, p_participant uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dg_teacher_room(p_code);
  v_w    dg_work;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_w from dg_work where participant_id = p_participant and room_id = v_room.id;
  if v_w.participant_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_w.shared then return jsonb_build_object('ok', true, 'shared', true); end if;
  if v_w.ask_at is not null and v_w.ask_at > now() - interval '30 seconds' then
    return jsonb_build_object('ok', false, 'error', 'too_fast');
  end if;
  update dg_work set ask = 'open', ask_at = now() where participant_id = v_w.participant_id;
  return jsonb_build_object('ok', true, 'ask', 'open');
end;
$$;

revoke all on function dg_class_ask(text, uuid) from public;
grant execute on function dg_class_ask(text, uuid) to authenticated;


-- Eigenes Diagramm an die Klasse geben (überschreibt das vorige, rev zählt hoch).
create or replace function dg_class_share(p_code text, p_doc jsonb, p_title text, p_kind text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room  skill_rooms := dg_teacher_room(p_code);
  v_title text := left(btrim(coalesce(p_title, '')), 80);
  v_rev   int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object'
     or coalesce(p_kind, '') not in ('mindmap', 'wirkung', 'klasse', 'objekt') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if octet_length(p_doc::text) > 300000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;
  insert into dg_shared (room_id, title, kind, doc, rev, shared_by, updated_at)
  values (v_room.id, v_title, p_kind, p_doc, 1, auth.uid(), now())
  on conflict (room_id) do update
    set title = excluded.title, kind = excluded.kind, doc = excluded.doc,
        rev = dg_shared.rev + 1, shared_by = excluded.shared_by, updated_at = now()
  returning rev into v_rev;
  return jsonb_build_object('ok', true, 'rev', v_rev);
end;
$$;

revoke all on function dg_class_share(text, jsonb, text, text) from public;
grant execute on function dg_class_share(text, jsonb, text, text) to authenticated;


create or replace function dg_class_unshare(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := dg_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  delete from dg_shared where room_id = v_room.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dg_class_unshare(text) from public;
grant execute on function dg_class_unshare(text) to authenticated;
