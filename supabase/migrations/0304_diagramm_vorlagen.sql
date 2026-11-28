-- ══════════════════════════════════════════════════════════════
-- Migration 0304 — Conceptogram: Vorlagen der Lehrkraft am Konto
-- ══════════════════════════════════════════════════════════════
-- Datei-Menü neu (28.11.2026): Neu · Öffnen · Download (Diagramm/PNG)
-- · Als Vorlage speichern · darunter die eigenen Vorlagen.
--
-- Eine Vorlage hängt an der Person (wie sql_databases aus 0221), nicht
-- am Raum: sie steht in jedem Conceptogram-Raum der Lehrkraft. Ist
-- eine Vorlage geöffnet, speichert die App jede Änderung in sie hinein
-- (dg_tpl_save mit p_id). Geteilt wird weiter über dg_class_share
-- (0260) — ein Schnappschuss des gerade Geöffneten, die Vorlage selbst
-- erreicht die Klasse nie.
--
-- p_code nur, weil presenterActions.call ihn anhängt.
-- Nur RPCs (security definer), keine Grants auf die Tabelle.
-- Kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════

create table if not exists dg_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  title       text not null default '',
  kind        text not null,
  doc         jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dg_templates_kind  check (kind in ('mindmap', 'wirkung', 'klasse', 'objekt')),
  constraint dg_templates_title check (char_length(title) <= 80),
  constraint dg_templates_size  check (octet_length(doc::text) <= 300000)
);

comment on table dg_templates is
  'Conceptogram: Vorlagen einer Lehrkraft (doc wie dg_work.doc). Überleben den Raum. Seit 0304.';

create index if not exists dg_templates_owner_idx on dg_templates(owner_id, updated_at desc);

alter table dg_templates enable row level security;


create or replace function dg_tpl_list(p_code text default null)
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
             'id', t.id, 'title', t.title, 'kind', t.kind,
             'nodes', coalesce(jsonb_array_length(case when jsonb_typeof(t.doc->'nodes') = 'array' then t.doc->'nodes' end), 0),
             'updated_at', t.updated_at) order by t.updated_at desc)
      from dg_templates t where t.owner_id = v_user), '[]'::jsonb));
end;
$$;

revoke all on function dg_tpl_list(text) from public, anon;
grant execute on function dg_tpl_list(text) to authenticated;


create or replace function dg_tpl_get(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_t    dg_templates;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  select * into v_t from dg_templates where id = p_id and owner_id = v_user;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'id', v_t.id, 'title', v_t.title, 'kind', v_t.kind,
                            'doc', v_t.doc, 'updated_at', v_t.updated_at);
end;
$$;

revoke all on function dg_tpl_get(text, uuid) from public, anon;
grant execute on function dg_tpl_get(text, uuid) to authenticated;


-- Anlegen (p_id null) oder eine eigene überschreiben. 100 je Person.
create or replace function dg_tpl_save(
  p_code  text,
  p_id    uuid,
  p_title text,
  p_kind  text,
  p_doc   jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_title text := left(btrim(coalesce(p_title, '')), 80);
  v_id    uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if not can_teach() then return jsonb_build_object('ok', false, 'error', 'not_a_teacher'); end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object'
     or coalesce(p_kind, '') not in ('mindmap', 'wirkung', 'klasse', 'objekt') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if octet_length(p_doc::text) > 300000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;

  if p_id is not null then
    update dg_templates
       set title = v_title, kind = p_kind, doc = p_doc, updated_at = now()
     where id = p_id and owner_id = v_user
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'created', false);
  end if;

  if (select count(*) from dg_templates where owner_id = v_user) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', 100);
  end if;
  insert into dg_templates (owner_id, title, kind, doc)
  values (v_user, v_title, p_kind, p_doc)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'created', true);
end;
$$;

revoke all on function dg_tpl_save(text, uuid, text, text, jsonb) from public, anon;
grant execute on function dg_tpl_save(text, uuid, text, text, jsonb) to authenticated;


create or replace function dg_tpl_delete(p_code text, p_id uuid)
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
  delete from dg_templates where id = p_id and owner_id = v_user;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dg_tpl_delete(text, uuid) from public, anon;
grant execute on function dg_tpl_delete(text, uuid) to authenticated;
