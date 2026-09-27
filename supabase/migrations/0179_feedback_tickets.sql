-- ══════════════════════════════════════════════════════════════
-- Migration 0179 — Feedback & Fragen (Ticket-System)
-- ══════════════════════════════════════════════════════════════
-- Lehrkräfte — und Kurse, denen der Volladmin es erlaubt — sollen
-- jederzeit eine Frage, einen Fehler oder eine Idee an das Team
-- schicken können. Im Profil-Menü steht dafür „Feedback & Fragen";
-- die Nachrichten landen im Admin-Panel im Reiter „Tickets", den
-- nur der Volladmin sieht.
--
-- ── Wer darf senden ───────────────────────────────────────────
--   • Admins (Schul- und Volladmin) — sie müssen es testen können
--   • freigeschaltete Lehrkräfte (teacher_status = 'approved')
--   • Mitglieder eines Clusters mit clusters.feedback_enabled
-- Das Cluster-Flag setzt NUR der Volladmin. clusters_admin_write
-- (0053) lässt Schuladmins ihre Cluster sonst frei bearbeiten —
-- deshalb schützt ein Trigger genau diese eine Spalte.
--
-- ── Warum Insert nur per RPC ──────────────────────────────────
-- Ohne Insert-Policy kann niemand per REST direkt schreiben. Die
-- RPC prüft die Berechtigung, setzt Autor/Schule/Kurs selbst
-- (Snapshots — ein gelöschter User hinterlässt ein lesbares
-- Ticket) und bremst mit einem Rate-Limit.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Cluster-Schalter
-- ─────────────────────────────────────────────────────────────
alter table clusters
  add column if not exists feedback_enabled boolean not null default false;

comment on column clusters.feedback_enabled is
  'Dürfen Kursteilnehmer „Feedback & Fragen" senden? Nur der Volladmin darf das ändern (Trigger clusters_feedback_guard_trg).';

-- auth.uid() ist im service_role-Kontext null — Skripte und
-- Vercel-Functions dürfen das Flag setzen, eingeloggte Nicht-
-- Volladmins nicht. Bei INSERT gilt dasselbe: ein Schuladmin legt
-- Cluster immer ohne Feedback an.
create or replace function clusters_feedback_guard()
  returns trigger
  set search_path = public
  language plpgsql
as $$
begin
  if auth.uid() is null or is_superadmin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.feedback_enabled then
      raise exception 'feedback_flag_superadmin_only';
    end if;
  elsif new.feedback_enabled is distinct from old.feedback_enabled then
    raise exception 'feedback_flag_superadmin_only';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.clusters'::regclass
      and tgname  = 'clusters_feedback_guard_trg'
  ) then
    create trigger clusters_feedback_guard_trg
      before insert or update on clusters
      for each row execute function clusters_feedback_guard();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) Tabelle feedback_tickets
-- ─────────────────────────────────────────────────────────────
-- priority null = „neu, noch nicht markiert". Das ist die Liste,
-- die der Admin abarbeitet, deshalb kein Default.
create table if not exists feedback_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete set null,
  author_name  text not null,
  school_id    uuid references schools(id)  on delete set null,
  cluster_id   uuid references clusters(id) on delete set null,
  is_teacher   boolean not null default false,
  category     text not null,
  body         text not null,
  priority     text,
  page         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.feedback_tickets'::regclass
                   and conname  = 'feedback_tickets_category_check') then
    alter table feedback_tickets add constraint feedback_tickets_category_check
      check (category in ('question','bug','idea','other'));
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.feedback_tickets'::regclass
                   and conname  = 'feedback_tickets_priority_check') then
    alter table feedback_tickets add constraint feedback_tickets_priority_check
      check (priority is null or priority in ('high','medium','low'));
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.feedback_tickets'::regclass
                   and conname  = 'feedback_tickets_body_check') then
    alter table feedback_tickets add constraint feedback_tickets_body_check
      check (char_length(btrim(body)) between 1 and 4000);
  end if;
end $$;

create index if not exists feedback_tickets_created_idx on feedback_tickets(created_at desc);
create index if not exists feedback_tickets_user_idx    on feedback_tickets(user_id, created_at desc);

comment on table feedback_tickets is
  'Nachrichten aus „Feedback & Fragen". Lesen/Bearbeiten/Löschen nur Volladmin, Schreiben nur per submit_feedback().';

create or replace function feedback_tickets_touch()
  returns trigger
  set search_path = public
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.feedback_tickets'::regclass
      and tgname  = 'feedback_tickets_touch_trg'
  ) then
    create trigger feedback_tickets_touch_trg
      before update on feedback_tickets
      for each row execute function feedback_tickets_touch();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 3) RLS — nur der Volladmin sieht und ändert Tickets
-- ─────────────────────────────────────────────────────────────
alter table feedback_tickets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'feedback_tickets'
                   and policyname = 'feedback_tickets_superadmin_select') then
    create policy feedback_tickets_superadmin_select on feedback_tickets
      for select using (is_superadmin());
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'feedback_tickets'
                   and policyname = 'feedback_tickets_superadmin_update') then
    create policy feedback_tickets_superadmin_update on feedback_tickets
      for update using (is_superadmin()) with check (is_superadmin());
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'feedback_tickets'
                   and policyname = 'feedback_tickets_superadmin_delete') then
    create policy feedback_tickets_superadmin_delete on feedback_tickets
      for delete using (is_superadmin());
  end if;
end $$;

revoke all on feedback_tickets from anon;
grant select, update, delete on feedback_tickets to authenticated;
grant all on feedback_tickets to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) can_send_feedback() — dieselbe Frage, die das Menü stellt
-- ─────────────────────────────────────────────────────────────
create or replace function can_send_feedback() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_admin
         or p.is_superadmin
         or p.teacher_status = 'approved'
         or coalesce(c.feedback_enabled, false)
       from profiles p
       left join clusters c on c.id = p.cluster_id
      where p.id = auth.uid()),
    false
  );
$$;

revoke all on function can_send_feedback() from public;
grant execute on function can_send_feedback() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) submit_feedback() — der einzige Weg hinein
-- ─────────────────────────────────────────────────────────────
-- Rate-Limit: 10 Nachrichten pro Stunde. Genug für jemanden, der
-- nachträglich noch etwas einfällt; zu wenig, um die Liste zu
-- fluten.
create or replace function submit_feedback(
  p_category text,
  p_body     text,
  p_page     text default null
) returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_prof   profiles%rowtype;
  v_body   text := btrim(coalesce(p_body, ''));
  v_recent int;
  v_id     uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;
  if not can_send_feedback() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_category is null or p_category not in ('question','bug','idea','other') then
    return jsonb_build_object('ok', false, 'error', 'bad_category');
  end if;
  if char_length(v_body) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  if char_length(v_body) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;

  select count(*) into v_recent
    from feedback_tickets
   where user_id = v_user
     and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_prof from profiles where id = v_user;

  insert into feedback_tickets (user_id, author_name, school_id, cluster_id, is_teacher,
                                category, body, page)
  values (
    v_user,
    coalesce(nullif(v_prof.display_name, ''), v_prof.account_name, '—'),
    v_prof.school_id,
    v_prof.cluster_id,
    coalesce(v_prof.teacher_status = 'approved', false),
    p_category,
    v_body,
    left(nullif(btrim(coalesce(p_page, '')), ''), 200)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function submit_feedback(text, text, text) from public;
grant execute on function submit_feedback(text, text, text) to authenticated;

comment on function submit_feedback(text, text, text) is
  'Legt ein Ticket aus „Feedback & Fragen" an. Prüft can_send_feedback(), Kategorie, Länge und 10/Stunde.';


-- ─────────────────────────────────────────────────────────────
-- 6) user_session-View — Cluster-Schalter fürs Menü
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Wie in 0053/0077/0083: alle bisherigen Spalten in
-- unveränderter Reihenfolge, das Neue ans Ende. session.js liest
-- mit select=* — das Menü fragt window.__session.
create or replace view user_session as
select
  p.id,
  p.school_id,
  p.cluster_id,
  p.account_name,
  p.display_name,
  p.status,
  p.is_admin,
  p.avatar_id,
  p.avatars_seen_at,
  s.name  as school_name,
  c.name  as cluster_name,
  coalesce(c.season, 0) as season,
  p.last_login_at,
  p.is_superadmin,
  p.teacher_status,
  p.teacher_requested_at,
  p.teacher_decided_at,
  coalesce(c.feedback_enabled, false) as cluster_feedback_enabled
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;

alter view user_session set (security_invoker = true);

grant select on user_session to authenticated;
