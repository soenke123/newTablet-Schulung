-- ══════════════════════════════════════════════════════════════
-- Migration 0258 — Diagramm (neuer MPSkill, Beta)
-- ══════════════════════════════════════════════════════════════
-- Siebzehnter Skill: ein schlankes Zeichenwerkzeug für Mindmaps,
-- Wirkungsgefüge, Klassen- und Objektdiagramme (UML). Vorbild draw.io,
-- aber ohne dessen Fülle: je Diagrammart nur die Bausteine, die sie
-- braucht. Direkt im Raum gebaut (tools/Diagramm/tool.js, kein iframe).
--
-- ── Was der Raum tut ──────────────────────────────────────────
-- Jede Person zeichnet EIN Diagramm (dg_work, eine Zeile je
-- Teilnehmer). Das Tablet speichert von selbst (1,5 s nach der letzten
-- Änderung). Die Lehrkraft sieht die Liste der Klasse (dg_class_list,
-- nur Kopfdaten) und holt bis zu zwei Diagramme auf den Beamer
-- (dg_class_get) — nebeneinander zum Vergleichen, live mitlaufend:
-- dg_class_list liefert `rev`, und neu geholt wird nur, was sich
-- geändert hat.
--
-- Die Diagrammart legt die Lehrkraft beim Anlegen fest
-- (skill_rooms.settings.kind: free | mindmap | wirkung | klasse |
-- objekt); free = jede Person wählt selbst. Das prüft der Server nicht
-- — es ist eine Vorgabe für die Oberfläche, keine Rechtefrage.
--
-- Noch NICHT dabei (kommt später): die Lehrkraft teilt ihr eigenes
-- Diagramm mit der Klasse zum Weiterbearbeiten.
--
-- ── Grenzen ───────────────────────────────────────────────────
-- doc ≤ 300 000 Byte (ein Diagramm mit 200 Knoten hat ~40 KB),
-- Titel ≤ 80 Zeichen. Text im Diagramm geht NICHT durch den
-- Schimpfwortfilter: es ist Arbeitsmaterial wie bei SQL Studio, und
-- die Lehrkraft sieht jedes Diagramm, bevor es an den Beamer geht.
--
-- Nur RPCs (security definer), keine Grants auf die Tabelle (siehe
-- CLAUDE.md, NEUE TABELLE). Rechte je Funktion ausdrücklich (0225),
-- Freigaben in supabase/tests/0225_rechte_freigaben.json.
-- Kein DROP, idempotent.
--
-- sort_order 90: eigenes Fach „Fächerübergreifend“ ganz am Ende.
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('diagramm', 'Diagramm',
   'Mindmaps, Wirkungsgefüge, Klassen- und Objektdiagramme zeichnen – '
   'einfach wie auf Papier. Die Lehrkraft holt zwei Ergebnisse nebeneinander an den Beamer.',
   '🗺️', 'Diagramm', 'Fächerübergreifend', true,
   '{}'::jsonb, true, 90)
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


-- ─────────────────────────────────────────────────────────────
-- 1) Tabelle
-- ─────────────────────────────────────────────────────────────
create table if not exists dg_work (
  participant_id uuid primary key references skill_participants(id) on delete cascade,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  title          text not null default '',
  kind           text not null default 'mindmap',
  doc            jsonb not null default '{}'::jsonb,
  nodes          int  not null default 0,
  rev            int  not null default 1,
  updated_at     timestamptz not null default now(),
  constraint dg_work_title_len check (char_length(title) <= 80),
  constraint dg_work_kind      check (kind in ('mindmap', 'wirkung', 'klasse', 'objekt')),
  constraint dg_work_size      check (octet_length(doc::text) <= 300000)
);

comment on table dg_work is
  'Diagramm einer Person in einem Diagramm-Raum (MPSkill „diagramm“). Eine Zeile je Teilnehmer, '
  'geht mit Raum und Teilnehmer. Seit 0258.';

create index if not exists dg_work_room_idx on dg_work(room_id);

alter table dg_work enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2) Helfer
-- ─────────────────────────────────────────────────────────────
create or replace function dg_part(
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
  if room.tool_id <> 'diagramm' then err := 'not_found'; return; end if;
  if p.blocked then err := 'blocked'; return; end if;
end;
$$;

revoke all on function dg_part(text) from public, anon, authenticated;


create or replace function dg_teacher_room(p_code text)
  returns skill_rooms
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms;
  v_none skill_rooms;
begin
  if auth.uid() is null then return v_none; end if;
  select * into v_room from skill_rooms
   where code = upper(btrim(coalesce(p_code, ''))) and tool_id = 'diagramm';
  if v_room.id is null or not skill_room_is_teacher(v_room.id, auth.uid()) then return v_none; end if;
  return v_room;
end;
$$;

revoke all on function dg_teacher_room(text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Teilnehmer: das eigene Diagramm
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
  if v_w.participant_id is null then return jsonb_build_object('ok', true, 'doc', null); end if;
  return jsonb_build_object('ok', true, 'doc', v_w.doc, 'title', v_w.title, 'kind', v_w.kind,
                            'rev', v_w.rev, 'updated_at', v_w.updated_at);
end;
$$;

revoke all on function dg_mine_get(text) from public;
grant execute on function dg_mine_get(text) to anon, authenticated;


create or replace function dg_mine_put(p_token text, p_doc jsonb, p_title text, p_kind text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v       record;
  v_title text := left(btrim(coalesce(p_title, '')), 80);
  v_nodes int;
  v_rev   int;
begin
  select * into v from dg_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if coalesce(p_kind, '') not in ('mindmap', 'wirkung', 'klasse', 'objekt') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if octet_length(p_doc::text) > 300000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;
  v_nodes := case when jsonb_typeof(p_doc->'nodes') = 'array' then jsonb_array_length(p_doc->'nodes') else 0 end;

  insert into dg_work (participant_id, room_id, title, kind, doc, nodes, rev, updated_at)
  values ((v.p).id, (v.room).id, v_title, p_kind, p_doc, v_nodes, 1, now())
  on conflict (participant_id) do update
    set title = excluded.title, kind = excluded.kind, doc = excluded.doc,
        nodes = excluded.nodes, rev = dg_work.rev + 1, updated_at = now()
  returning rev into v_rev;
  return jsonb_build_object('ok', true, 'rev', v_rev);
end;
$$;

revoke all on function dg_mine_put(text, jsonb, text, text) from public;
grant execute on function dg_mine_put(text, jsonb, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Lehrkraft: die Diagramme der Klasse
-- ─────────────────────────────────────────────────────────────
-- Nur Kopfdaten — die Liste läuft alle paar Sekunden, die Diagramme
-- selbst holt dg_class_get einzeln und nur, wenn rev sich bewegt hat.
create or replace function dg_class_list(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms := dg_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'participant', p.id,
             'person',      coalesce(nullif(btrim(p.name), ''), 'Tablet ' || p.seat),
             'seat',        p.seat,
             'title',       w.title,
             'kind',        w.kind,
             'nodes',       w.nodes,
             'rev',         w.rev,
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
  return jsonb_build_object('ok', true, 'doc', v_w.doc, 'title', v_w.title, 'kind', v_w.kind,
                            'rev', v_w.rev, 'updated_at', v_w.updated_at);
end;
$$;

revoke all on function dg_class_get(text, uuid) from public;
grant execute on function dg_class_get(text, uuid) to authenticated;
