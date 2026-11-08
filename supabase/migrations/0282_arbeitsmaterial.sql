-- ═════════════════════════════════════════════════════════════
-- 0282 — Arbeitsmaterial (MPSkills/material.html)
-- ═════════════════════════════════════════════════════════════
-- Sönke 09.11.2026: Zu einem Skill gibt es Arbeitsmaterial (zuerst das
-- Skript „Datenbanksysteme“ zu YourSozialNet). Die Lehrkraft lädt Skript
-- und Lösungsheft herunter und setzt je Kurs Häkchen, welche Teile die
-- Klasse schon hat; daraus baut die Seite im Browser ein Schüler-PDF.
--
--   skill_material_marks   Häkchen je Raum (= Kurs) und Skill.
--                          Geht mit dem Raum (CASCADE).
--   skill_material_files   Dateien, die NICHT öffentlich sein dürfen
--                          (das Lösungsheft). Skript und Teil-PDFs liegen
--                          offen unter MPSkills/tools/<Skill>/material/.
--
-- Zugriff nur über die RPCs (keine Tabellenrechte, RLS ohne Policy):
--   lesen/setzen der Häkchen   Lehrkraft des Raums (Besitzer oder
--                              eingeladen, skill_room_is_teacher) oder Admin
--   Lösungsheft holen          freigeschaltete Lehrkraft oder Admin
--   Lösungsheft hochladen      nur Admin (mit 2FA, is_any_admin)
-- ═════════════════════════════════════════════════════════════

create table if not exists skill_material_marks (
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  tool       text not null,
  teile      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  primary key (room_id, tool)
);
comment on table skill_material_marks is
  'Arbeitsmaterial (0282): welche Teile des Materials eine Klasse schon hat – je Raum und Skill. Nur über skill_material_marks_get/set.';
alter table skill_material_marks enable row level security;

create table if not exists skill_material_files (
  tool       text not null,
  name       text not null,
  mime       text not null,
  data       bytea not null,
  bytes      int not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  primary key (tool, name)
);
comment on table skill_material_files is
  'Arbeitsmaterial (0282): nicht öffentliche Dateien (Lösungsheft). Holen nur Lehrkräfte/Admins (skill_material_file_get), hochladen nur Admins (skill_material_file_put).';
alter table skill_material_files enable row level security;


-- Freigeschaltete Lehrkraft oder Admin?
create or replace function skill_material_is_teacher()
  returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select auth.uid() is not null and (
         exists (select 1 from profiles where id = auth.uid() and teacher_status = 'approved')
      or is_any_admin());
$$;
revoke all on function skill_material_is_teacher() from public;


-- Raum zum Code, wenn der Aufrufer dort Lehrkraft ist (sonst null)
create or replace function skill_material_room(p_code text)
  returns uuid
  security definer
  stable
  set search_path = public
  language sql
as $$
  select r.id from skill_rooms r
   where r.code = upper(trim(coalesce(p_code, '')))
     and (skill_room_is_teacher(r.id, auth.uid()) or is_any_admin())
   limit 1;
$$;
revoke all on function skill_material_room(text) from public;


-- Häkchen lesen
create or replace function skill_material_marks_get(p_code text, p_tool text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := skill_material_room(p_code);
  m skill_material_marks;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_logged_in'); end if;
  if v_room is null then return jsonb_build_object('error', 'not_teacher'); end if;
  select * into m from skill_material_marks where room_id = v_room and tool = p_tool;
  return jsonb_build_object('ok', true,
    'teile', coalesce(m.teile, '[]'::jsonb),
    'updated_at', m.updated_at,
    'title', (select title from skill_rooms where id = v_room));
end;
$$;


-- Häkchen setzen: Liste kurzer ids, z. B. ["I-2","II-1","II-1b"]
create or replace function skill_material_marks_set(p_code text, p_tool text, p_teile jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := skill_material_room(p_code);
  v_teile jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_logged_in'); end if;
  if v_room is null then return jsonb_build_object('error', 'not_teacher'); end if;
  if p_tool is null or p_tool !~ '^[a-z0-9_-]{1,40}$' then return jsonb_build_object('error', 'bad_tool'); end if;
  if p_teile is null or jsonb_typeof(p_teile) <> 'array' or jsonb_array_length(p_teile) > 60 then
    return jsonb_build_object('error', 'bad_teile');
  end if;
  if exists (select 1 from jsonb_array_elements(p_teile) e
              where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Za-z0-9._-]{1,20}$') then
    return jsonb_build_object('error', 'bad_teile');
  end if;
  select coalesce(jsonb_agg(distinct e), '[]'::jsonb) into v_teile from jsonb_array_elements(p_teile) e;
  insert into skill_material_marks (room_id, tool, teile, updated_at, updated_by)
       values (v_room, p_tool, v_teile, now(), auth.uid())
  on conflict (room_id, tool) do update
       set teile = excluded.teile, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'teile', v_teile);
end;
$$;


-- Welche geschützten Dateien gibt es? (ohne Inhalt)
create or replace function skill_material_files_list(p_tool text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if not skill_material_is_teacher() then return jsonb_build_object('error', 'not_teacher'); end if;
  return jsonb_build_object('ok', true, 'files', coalesce((
    select jsonb_agg(jsonb_build_object('name', name, 'mime', mime, 'bytes', bytes, 'updated_at', updated_at) order by name)
      from skill_material_files where tool = p_tool), '[]'::jsonb));
end;
$$;


-- Datei holen (base64)
create or replace function skill_material_file_get(p_tool text, p_name text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare f skill_material_files;
begin
  if not skill_material_is_teacher() then return jsonb_build_object('error', 'not_teacher'); end if;
  select * into f from skill_material_files where tool = p_tool and name = p_name;
  if f.name is null then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'name', f.name, 'mime', f.mime, 'bytes', f.bytes,
    'updated_at', f.updated_at, 'data', encode(f.data, 'base64'));
end;
$$;


-- Datei hochladen/ersetzen (nur Admin mit 2FA), höchstens 12 MB
create or replace function skill_material_file_put(p_tool text, p_name text, p_mime text, p_data text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare v bytea;
begin
  if not is_any_admin() then return jsonb_build_object('error', 'not_admin'); end if;
  if p_tool is null or p_tool !~ '^[a-z0-9_-]{1,40}$' then return jsonb_build_object('error', 'bad_tool'); end if;
  if p_name is null or p_name !~ '^[A-Za-z0-9._-]{1,80}$' then return jsonb_build_object('error', 'bad_name'); end if;
  if p_mime not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    return jsonb_build_object('error', 'bad_mime');
  end if;
  begin
    v := decode(p_data, 'base64');
  exception when others then
    return jsonb_build_object('error', 'bad_data');
  end;
  if v is null or length(v) = 0 then return jsonb_build_object('error', 'bad_data'); end if;
  if length(v) > 12 * 1024 * 1024 then return jsonb_build_object('error', 'too_big'); end if;
  insert into skill_material_files (tool, name, mime, data, bytes, updated_at, updated_by)
       values (p_tool, p_name, p_mime, v, length(v), now(), auth.uid())
  on conflict (tool, name) do update
       set mime = excluded.mime, data = excluded.data, bytes = excluded.bytes, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('ok', true, 'bytes', length(v));
end;
$$;


-- Rechte (seit 0225 ist neu nichts ausführbar)
grant execute on function skill_material_marks_get(text, text) to authenticated;
grant execute on function skill_material_marks_set(text, text, jsonb) to authenticated;
grant execute on function skill_material_files_list(text) to authenticated;
grant execute on function skill_material_file_get(text, text) to authenticated;
grant execute on function skill_material_file_put(text, text, text, text) to authenticated;
