-- ══════════════════════════════════════════════════════════════
-- Migration 0220 — SQL Studio (neuer MPSkill, Beta, nur für Admins)
-- ══════════════════════════════════════════════════════════════
-- Vierzehnter Skill: ein Datenbank-Werkzeug wie phpMyAdmin, nur
-- entschlackt für die Schule. SQL-Editor, Tabellen ansehen und
-- bearbeiten, Struktur per Formular, Klassendiagramm. Die Datenbanken
-- laufen als SQLite IM BROWSER (sql.js, tools/SQLStudio/lib) — der
-- Server führt kein einziges SQL der Schüler aus.
--
-- Etappe 1 (diese Migration): der Editor mit vier System-Datenbanken
-- (Haustiere, Schule, Bibliothek, Online-Shop) und eigenen
-- Datenbanken, gespeichert im Gerät (IndexedDB). Keine eigenen
-- Tabellen. Etappe 2 bringt eigene Datenbanken der Lehrkraft auf dem
-- Server, Teilen/Entziehen und die Rechte use/modify/create je
-- geteilter Datenbank (eigene Migration).
--
-- ── Nur für Admins ─────────────────────────────────────────────
-- `active = false` reicht dafür NICHT: skill_room_create lehnt
-- abgeschaltete Tools auch für Admins ab (0079/0086), es gäbe also
-- nicht einmal einen Testraum. Deshalb eine eigene Spalte:
--
--   skill_tools.admin_only — die Kachel sehen nur Admins (Policy),
--   und einen Raum dafür legt nur ein Admin an (Trigger auf
--   skill_rooms, damit die beiden großen Raum-Funktionen nicht neu
--   geschrieben werden müssen). Beitreten dürfen alle mit Code —
--   sonst könnte ein Admin das Werkzeug nicht mit einer Klasse
--   ausprobieren.
--
-- Freigeben für alle später:  update skill_tools set admin_only = false where id = 'sqlstudio';
--
-- sort_order 34: im Fach Informatik hinter Tiny LM (32).
-- ══════════════════════════════════════════════════════════════

alter table skill_tools add column if not exists admin_only boolean not null default false;

comment on column skill_tools.admin_only is
  'Nur für Admins sichtbar (Policy skill_tools_select_public) und nur von Admins als Raum '
  'anlegbar (Trigger skill_rooms_admin_only). Beitritt per Code bleibt für alle offen. Seit 0220.';

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'skill_tools'
      and policyname = 'skill_tools_select_public'
  ) then
    execute 'alter policy skill_tools_select_public on skill_tools using ((active = true and admin_only = false) or is_any_admin())';
  else
    execute 'create policy skill_tools_select_public on skill_tools for select using ((active = true and admin_only = false) or is_any_admin())';
  end if;
end $$;

create or replace function skill_rooms_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from skill_tools where id = new.tool_id and admin_only)
     and not is_any_admin() then
    raise exception 'tool_admin_only' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists skill_rooms_admin_only on skill_rooms;
create trigger skill_rooms_admin_only
  before insert on skill_rooms
  for each row execute function skill_rooms_admin_only();

revoke all on function skill_rooms_admin_only() from public, anon, authenticated;

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, admin_only, sort_order) values
  ('sqlstudio', 'SQL Studio',
   'Datenbanken wie mit phpMyAdmin — nur übersichtlicher: SQL schreiben und ausführen, '
   'Tabellen ansehen und bearbeiten, Struktur per Formular ändern und das Klassendiagramm '
   'dazu sehen. Mit fertigen Datenbanken zum Üben.',
   '🗄️', 'SQLStudio', 'Informatik', true,
   '{}'::jsonb, true, true, 34)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  admin_only = excluded.admin_only,
  sort_order = excluded.sort_order;
