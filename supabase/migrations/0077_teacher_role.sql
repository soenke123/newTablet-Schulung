-- ══════════════════════════════════════════════════════════════
-- Migration 0077 — Lehrkraft-Rolle für MPSkills
-- ══════════════════════════════════════════════════════════════
-- Erste Migration des zweiten Anwendungsbereichs (Konzept:
-- Konzept_MPSkills_v1.html im Repo-Root). MPSkills ist eine
-- Sammelseite aus Tools für den normalen Unterricht: Lehrkräfte
-- schalten ein Tool für eine Klasse frei, Schüler kommen per Code
-- oder QR hinein — ohne Account.
--
-- Diese Migration bringt ausschließlich die ROLLE. Keine Räume,
-- keine Tools, keine anonymen Teilnehmer — das kommt in 0078+.
--
-- ── Warum ein eigenes Feld und nicht is_admin ─────────────────
-- Eine Lehrkraft darf in MPSkills Räume aufmachen und muss auf der
-- Schulungsseite trotzdem ein gewöhnlicher User bleiben: pending
-- oder in einem Kurs, ohne Sonderrechte, ohne veränderte Anzeige.
-- Über is_admin ginge das nicht — das Flag schaltet im GameHub das
-- Season-Gate auf, macht Kurs-Sperren sichtbar und öffnet das
-- Admin-Panel. Deshalb ein eigenes Feld, das der GameHub nirgends
-- liest.
--
-- teacher_status ist BEWUSST orthogonal zu status und cluster_id:
--   • status/cluster_id  = „nimmt an einer Schulung teil"
--   • teacher_status     = „darf in MPSkills Räume aufmachen"
-- Beides kann gleichzeitig gelten. Eine Lehrkraft, die später
-- selbst eine Schulung mitmacht, behält ihre Rolle; ein Schüler,
-- der Lehrkraft wird, verliert seinen Kurs nicht.
--
-- ── Warum ein Trigger für die Zeitstempel ─────────────────────
-- Freigeschaltet wird im Admin-Panel per PATCH auf profiles — so
-- wie display_name_locked und die Cluster-Zuweisung auch, die
-- Policy profiles_admin_update (0002/0053) deckt das ab. Damit
-- könnte der Client aber teacher_decided_by frei mitschicken und
-- die Entscheidung einem anderen Admin zuschreiben. Der Trigger
-- setzt die drei Stempel selbst; das Panel schickt nur den Status.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten an profiles
-- ─────────────────────────────────────────────────────────────
-- 'none'     — Normalfall. Jeder Schüler-Account der Schulung.
-- 'pending'  — hat die Rolle beantragt, wartet auf einen Admin.
-- 'approved' — darf Räume aufmachen.
-- 'rejected' — abgelehnt. Eigener Zustand und nicht zurück auf
--              'none', damit im Panel sichtbar bleibt, dass schon
--              jemand entschieden hat — sonst taucht derselbe
--              Antrag als Neuantrag wieder auf.
alter table profiles
  add column if not exists teacher_status text not null default 'none';

alter table profiles
  add column if not exists teacher_requested_at timestamptz;

alter table profiles
  add column if not exists teacher_decided_at timestamptz;

alter table profiles
  add column if not exists teacher_decided_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname  = 'profiles_teacher_status_check'
  ) then
    alter table profiles
      add constraint profiles_teacher_status_check
      check (teacher_status in ('none','pending','approved','rejected'));
  end if;
end $$;

-- Partieller Index: die Abfrage im Admin-Panel lautet immer
-- „alle, die nicht 'none' sind" — und das sind ein paar Dutzend
-- Zeilen unter Tausenden.
create index if not exists profiles_teacher_status_idx
  on profiles(teacher_status) where teacher_status <> 'none';

comment on column profiles.teacher_status is
  'MPSkills-Lehrkraft-Rolle: none|pending|approved|rejected. Orthogonal zu status/cluster_id '
  'und zu is_admin — die Schulungsseite liest dieses Feld nicht.';
comment on column profiles.teacher_decided_by is
  'Admin, der freigeschaltet oder abgelehnt hat. Wird vom Trigger gesetzt, nicht vom Client.';


-- ─────────────────────────────────────────────────────────────
-- 2) Trigger — Zeitstempel serverseitig
-- ─────────────────────────────────────────────────────────────
-- Läuft bei jedem profiles-Schreibzugriff, tut aber nur etwas,
-- wenn sich teacher_status wirklich ändert. profiles ist die
-- heißeste Tabelle im System; der Rumpf muss billig bleiben.
--
-- auth.uid() ist im service_role-Kontext (Signup über die
-- Vercel-Function) null — dann bleibt decided_by leer, was richtig
-- ist: dort hat niemand entschieden, dort wurde beantragt.
create or replace function profiles_teacher_stamp()
  returns trigger
  set search_path = public
  language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.teacher_status = 'pending' and new.teacher_requested_at is null then
      new.teacher_requested_at := now();
    end if;
    return new;
  end if;

  if new.teacher_status is distinct from old.teacher_status then
    if new.teacher_status = 'pending' then
      -- Neuer Antrag: die alte Entscheidung ist damit erledigt.
      new.teacher_requested_at := now();
      new.teacher_decided_at   := null;
      new.teacher_decided_by   := null;
    elsif new.teacher_status in ('approved','rejected') then
      new.teacher_decided_at := now();
      new.teacher_decided_by := auth.uid();
    else
      -- Zurück auf 'none': die Rolle wird vollständig entfernt,
      -- also auch die Spur davon. Ein Antrag von vorher soll nicht
      -- als offener Antrag wiederauftauchen.
      new.teacher_requested_at := null;
      new.teacher_decided_at   := null;
      new.teacher_decided_by   := null;
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname  = 'profiles_teacher_stamp_trg'
  ) then
    create trigger profiles_teacher_stamp_trg
      before insert or update on profiles
      for each row execute function profiles_teacher_stamp();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 3) can_teach() — die Frage, die MPSkills stellt
-- ─────────────────────────────────────────────────────────────
-- Admins sind implizit Lehrkräfte: sie müssen jedes Tool testen
-- können, ohne sich selbst erst freizuschalten. Gleiche Bauweise
-- wie is_any_admin() aus 0053 — security definer, stable, damit
-- die Funktion in Policies und RPCs billig ist.
--
-- Grant auch an anon, konsistent mit den Geschwistern aus 0053:
-- ohne Login liefert sie schlicht false.
create or replace function can_teach() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_admin or p.is_superadmin or p.teacher_status = 'approved'
       from profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function can_teach() from public;
grant execute on function can_teach() to anon, authenticated;

comment on function can_teach() is
  'Darf der Aufrufer in MPSkills Räume aufmachen? approved ODER Admin (Admins müssen testen können).';


-- ─────────────────────────────────────────────────────────────
-- 4) request_teacher_role() — Antrag aus einem bestehenden Konto
-- ─────────────────────────────────────────────────────────────
-- Zwei Wege führen zur Rolle. Wer sich über MPSkills neu anmeldet,
-- bekommt 'pending' direkt bei der Kontoanlage (api/signup.js mit
-- context='mpskills'). Wer schon ein Konto aus der Schulung hat,
-- soll sich kein zweites anlegen müssen — dafür diese RPC.
--
-- Es gibt bewusst KEINE Policy, die einen User sein eigenes Profil
-- ändern lässt (profiles_admin_update ist die einzige UPDATE-Policy,
-- siehe 0002). Deshalb läuft der Antrag als security definer — und
-- kann genau ein Feld auf genau einen Wert setzen.
--
-- Erlaubt aus 'none' und 'rejected'. Ein abgelehnter Antrag darf
-- erneut gestellt werden: eine Ablehnung ist oft nur „wir haben
-- noch nicht miteinander gesprochen". Aus 'approved' oder 'pending'
-- passiert nichts — der Antrag ist dann schon erledigt bzw. offen.
create or replace function request_teacher_role()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_old  text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;

  select teacher_status into v_old from profiles where id = v_user;
  if v_old is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if v_old = 'approved' then
    return jsonb_build_object('ok', true, 'status', v_old, 'changed', false);
  end if;
  if v_old = 'pending' then
    return jsonb_build_object('ok', true, 'status', v_old, 'changed', false);
  end if;

  -- Der Trigger aus Abschnitt 2 setzt teacher_requested_at.
  update profiles set teacher_status = 'pending' where id = v_user;

  return jsonb_build_object('ok', true, 'status', 'pending', 'changed', true);
end;
$$;

revoke all on function request_teacher_role() from public;
grant execute on function request_teacher_role() to authenticated;

comment on function request_teacher_role() is
  'Beantragt die MPSkills-Lehrkraft-Rolle für den eigenen Account. Nur none/rejected → pending.';


-- ─────────────────────────────────────────────────────────────
-- 5) user_session-View um teacher_status ergänzen
-- ─────────────────────────────────────────────────────────────
-- WICHTIG (wie in 0053): create-or-replace-view lässt kein
-- Umordnen und kein Weglassen zu ("cannot drop columns from
-- view"). Alle Spalten aus 0053 in derselben Reihenfolge
-- beibehalten, teacher_status ans Ende anhängen.
--
-- session.js liest user_session mit select=* — das Feld landet
-- damit ohne weitere Änderung in window.__session und ist für
-- MPSkills abfragbar. Der GameHub liest es nicht.
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
  p.teacher_status
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;

alter view user_session set (security_invoker = true);

grant select on user_session to authenticated;
