-- ══════════════════════════════════════════════════════════════
-- Migration 0216 — MPSkills: Nutzung je Skill im Admin-Panel
-- ══════════════════════════════════════════════════════════════
-- Frage des Volladmins: „Wie wird das System angenommen?“ — welcher
-- Skill wie oft, wann zuletzt, an welcher Schule am meisten; nach
-- Schule und Zeitraum (2 Wochen, 3 Monate, 6 Monate, gesamt) filterbar.
--
-- ── Warum eine eigene Tabelle ─────────────────────────────────
-- skill_rooms allein reicht nicht: skill_cleanup (0081/0208) löscht
-- einen Raum 60 Tage nach der letzten Aktivität. „6 Monate“ und
-- „gesamt“ wären damit immer nur die letzten zwei Monate. Deshalb
-- schreibt ein Trigger je Raum EINE Zeile in skill_usage, die das
-- Löschen des Raums überlebt (kein FK auf skill_rooms).
--
-- ── Datenschutz ───────────────────────────────────────────────
-- Absichtlich NICHT personalisiert: keine Lehrkraft, kein Raumtitel,
-- kein Code, keine Namen — nur Skill, Schule, Testraum ja/nein,
-- angelegt, zuletzt aktiv und die Zahl der Beitritte. room_id zeigt
-- nach dem Löschen des Raums auf nichts mehr. Darum keine Löschfrist;
-- fällt eine Schule weg, gehen ihre Zeilen mit (on delete cascade).
--
-- Zugriff nur über skill_usage_stats() (security definer), keine
-- Grants an anon/authenticated (Regel aus 0215).
-- ══════════════════════════════════════════════════════════════

create table if not exists skill_usage (
  room_id         uuid primary key,
  tool_id         text not null,
  school_id       uuid not null references schools(id) on delete cascade,
  is_test         boolean not null default false,
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  people          int not null default 0
);

create index if not exists skill_usage_school_idx on skill_usage(school_id);
create index if not exists skill_usage_active_idx on skill_usage(last_active_at);

comment on table skill_usage is
  'Anonyme Nutzungsspur je MPSkills-Raum (0216): überlebt das Löschen des Raums. '
  'Kein Titel, keine Lehrkraft, keine Namen. Gelesen nur über skill_usage_stats().';

alter table skill_usage enable row level security;
grant select, insert, update, delete on skill_usage to service_role;


-- ─────────────────────────────────────────────────────────────
-- Trigger: Raum angelegt / aktiv → Spur nachführen
-- ─────────────────────────────────────────────────────────────
-- last_active_at wird höchstens alle 5 Minuten fortgeschrieben
-- (skill_touch, 0079) — der Trigger feuert also selten.
create or replace function skill_usage_track_room()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  insert into skill_usage (room_id, tool_id, school_id, is_test, created_at, last_active_at)
  values (new.id, new.tool_id, new.school_id, new.is_test, new.created_at, new.last_active_at)
  on conflict (room_id) do update
     set is_test        = excluded.is_test,
         school_id      = excluded.school_id,
         last_active_at = greatest(skill_usage.last_active_at, excluded.last_active_at);
  return new;
end;
$$;

revoke all on function skill_usage_track_room() from public;

drop trigger if exists skill_rooms_usage on skill_rooms;
create trigger skill_rooms_usage
  after insert or update of last_active_at, is_test, school_id on skill_rooms
  for each row execute function skill_usage_track_room();


-- Beitritt → Zähler hoch. Zählt Beitritte, nicht Personen: wer mit
-- neuem Gerät wieder hereinkommt, zählt doppelt. Für „wird es
-- angenommen“ ist das genau genug.
create or replace function skill_usage_track_join()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  update skill_usage set people = people + 1 where room_id = new.room_id;
  return new;
end;
$$;

revoke all on function skill_usage_track_join() from public;

drop trigger if exists skill_participants_usage on skill_participants;
create trigger skill_participants_usage
  after insert on skill_participants
  for each row execute function skill_usage_track_join();


-- Bestand übernehmen (was skill_cleanup schon gelöscht hat, ist weg).
insert into skill_usage (room_id, tool_id, school_id, is_test, created_at, last_active_at, people)
select r.id, r.tool_id, r.school_id, r.is_test, r.created_at, r.last_active_at,
       (select count(*) from skill_participants sp where sp.room_id = r.id)
  from skill_rooms r
on conflict (room_id) do nothing;


-- ─────────────────────────────────────────────────────────────
-- skill_usage_stats — eine Zeile je Skill
-- ─────────────────────────────────────────────────────────────
-- p_school  null = alle Schulen (Volladmin); Schuladmin immer die eigene.
-- p_days    null = gesamt, sonst Räume, die in den letzten p_days Tagen
--           aktiv waren („genutzt“); „neu“ = in dem Zeitraum angelegt.
-- p_tests   Testräume der Lehrkräfte mitzählen (Standard: nein).
create or replace function skill_usage_stats(
  p_school uuid    default null,
  p_days   int     default null,
  p_tests  boolean default false
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_school uuid;
  v_since  timestamptz;
  v_tools  jsonb;
  v_schools jsonb;
  v_total  jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  if is_superadmin() then
    v_school := p_school;
  else
    v_school := my_school_id();
    if v_school is null then
      return jsonb_build_object('ok', false, 'error', 'no_school');
    end if;
  end if;

  if p_days is not null and p_days > 0 then
    v_since := now() - make_interval(days => p_days);
  end if;

  with base as (
    select u.*
      from skill_usage u
     where (v_school is null or u.school_id = v_school)
       and (coalesce(p_tests, false) or not u.is_test)
       and (v_since is null or u.last_active_at >= v_since)
  ),
  per_school as (
    select b.tool_id, b.school_id, count(*) as n, max(b.last_active_at) as last_at,
           row_number() over (partition by b.tool_id
                              order by count(*) desc, max(b.last_active_at) desc) as rk
      from base b
     group by b.tool_id, b.school_id
  ),
  per_tool as (
    select b.tool_id,
           count(*)                                             as rooms,
           count(*) filter (where v_since is null or b.created_at >= v_since) as new_rooms,
           coalesce(sum(b.people), 0)                           as people,
           count(distinct b.school_id)                          as schools,
           max(b.last_active_at)                                as last_at
      from base b
     group by b.tool_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tool_id',    t.id,
           'title',      t.title,
           'icon',       t.icon,
           'active',     t.active,
           'rooms',      coalesce(pt.rooms, 0),
           'new_rooms',  coalesce(pt.new_rooms, 0),
           'people',     coalesce(pt.people, 0),
           'schools',    coalesce(pt.schools, 0),
           'last_at',    pt.last_at,
           'top_school', s.name,
           'top_count',  ps.n
         ) order by coalesce(pt.rooms, 0) desc, t.sort_order, t.title), '[]'::jsonb)
    into v_tools
    from skill_tools t
    left join per_tool   pt on pt.tool_id = t.id
    left join per_school ps on ps.tool_id = t.id and ps.rk = 1
    left join schools    s  on s.id = ps.school_id;

  select jsonb_build_object(
           'rooms',   count(*),
           'people',  coalesce(sum(b.people), 0),
           'schools', count(distinct b.school_id),
           'since',   v_since)
    into v_total
    from skill_usage b
   where (v_school is null or b.school_id = v_school)
     and (coalesce(p_tests, false) or not b.is_test)
     and (v_since is null or b.last_active_at >= v_since);

  -- Schulen für den Filter: nur der Volladmin wählt.
  if is_superadmin() then
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
      into v_schools
      from schools s;
  else
    v_schools := '[]'::jsonb;
  end if;

  return jsonb_build_object('ok', true, 'tools', v_tools, 'total', v_total,
                            'schools', v_schools, 'school_id', v_school);
end;
$$;

revoke all on function skill_usage_stats(uuid, int, boolean) from public;
grant execute on function skill_usage_stats(uuid, int, boolean) to authenticated;

comment on function skill_usage_stats(uuid, int, boolean) is
  'Nutzung je MPSkills-Skill für das Admin-Panel (0216): Räume, neu, Beitritte, zuletzt, '
  'Schule mit den meisten Räumen. Anonym. Volladmin alle/gewählte Schule, Schuladmin die eigene.';
