-- ══════════════════════════════════════════════════════════════
-- Migration 0212 — Status „über MPSkills“ + Kursbeitritt per Knopf
-- ══════════════════════════════════════════════════════════════
-- Wer sich über MPSkills registriert (auch Lehrkräfte, die in keinem
-- Kurs sind), stand bisher auf 'pending' — im Admin-Panel nicht von
-- einem Schüler zu unterscheiden, der auf seine Freischaltung wartet.
-- Neu: profiles.status = 'mpskills'.
--
-- Funktional ist 'mpskills' dasselbe wie 'pending': kein Kurs, kein
-- GameHub. Der Wert dient nur der Orientierung im Admin-Panel. Sobald
-- jemand einem Kurs zugeordnet wird, ist er 'active' wie jeder andere.
-- (Alle SQL-Prüfungen im Bestand fragen auf status = 'active' und sind
-- damit für den neuen Wert ohne Änderung richtig.)
--
-- Dazu zwei RPCs für die Tablet-Schulungsseite (Banner „Kurs beitreten“):
--   my_open_cluster()    — welcher Kurs ist an meiner Schule gerade offen?
--   join_open_cluster()  — dem offenen Kurs selbst beitreten
-- Beitreten dürfen nur Konten ohne Kurs und mit Status 'pending' oder
-- 'mpskills', keine Admins. Die Starthilfe wird wie bei der Zuordnung
-- durch einen Admin ausgeschüttet (apply_cluster_bonus, idempotent).
--
-- Kein DROP von Funktionen — create or replace.
-- ══════════════════════════════════════════════════════════════

-- 1) Wertebereich erweitern
do $$
declare v_con text;
begin
  for v_con in
    select conname from pg_constraint
     where conrelid = 'profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%pending%active%'
  loop
    execute format('alter table profiles drop constraint %I', v_con);
  end loop;
end $$;

alter table profiles add constraint profiles_status_check
  check (status in ('pending', 'active', 'mpskills'));

comment on column profiles.status is
  '''active'' = in einem Kurs · ''pending'' = ohne Kurs, über die Schulung registriert · '
  '''mpskills'' = ohne Kurs, über MPSkills registriert (0212). pending und mpskills verhalten sich gleich.';

-- 2) Bestand: ohne Kurs und mit Lehrkraft-Antrag/-Rolle = über MPSkills gekommen
update profiles
   set status = 'mpskills'
 where status = 'pending'
   and cluster_id is null
   and teacher_status <> 'none'
   and coalesce(is_admin, false) = false
   and coalesce(is_superadmin, false) = false;

-- 3) Welcher Kurs ist an meiner Schule gerade offen?
create or replace function my_open_cluster()
  returns jsonb
  security definer
  stable
  set search_path = public
  language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;

  select c.id, c.name, c.season, c.closes_at into v_row
    from profiles p
    join clusters c on c.school_id = p.school_id
    join schools  s on s.id = p.school_id
   where p.id = v_uid
     and s.active = true
     and c.opens_at  <= now()
     and c.closes_at >= now()
   order by c.opens_at desc
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'open', false);
  end if;
  return jsonb_build_object('ok', true, 'open', true,
    'name', v_row.name, 'season', v_row.season, 'closes_at', v_row.closes_at);
end;
$$;

revoke all on function my_open_cluster() from public;
grant execute on function my_open_cluster() to authenticated;

-- 4) Dem offenen Kurs selbst beitreten
create or replace function join_open_cluster()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
  v_p   record;
  v_cid uuid;
  v_name text;
  v_bonus jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;

  select status, cluster_id, school_id, is_admin, is_superadmin into v_p
    from profiles where id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if coalesce(v_p.is_admin, false) or coalesce(v_p.is_superadmin, false) then
    return jsonb_build_object('ok', false, 'error', 'is_admin');
  end if;
  if v_p.cluster_id is not null or v_p.status = 'active' then
    return jsonb_build_object('ok', false, 'error', 'already_in_cluster');
  end if;

  select c.id, c.name into v_cid, v_name
    from clusters c
    join schools s on s.id = c.school_id
   where c.school_id = v_p.school_id
     and s.active = true
     and c.opens_at  <= now()
     and c.closes_at >= now()
   order by c.opens_at desc
   limit 1;
  if v_cid is null then
    return jsonb_build_object('ok', false, 'error', 'no_open_cluster');
  end if;

  update profiles set cluster_id = v_cid, status = 'active' where id = v_uid;

  -- Starthilfe: apply_cluster_bonus prüft sonst auf Admin. Hier gilt
  -- sie ausschließlich für das eigene Konto, deshalb läuft der Aufruf
  -- wie aus signup.js ohne Aufrufer (auth.uid() = null).
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    v_bonus := apply_cluster_bonus(v_uid);
  exception when others then
    v_bonus := null;
  end;

  return jsonb_build_object('ok', true, 'cluster_name', v_name);
end;
$$;

revoke all on function join_open_cluster() from public;
grant execute on function join_open_cluster() to authenticated;

comment on function join_open_cluster() is
  'Konto ohne Kurs (pending/mpskills, kein Admin) tritt dem gerade offenen Kurs seiner Schule bei (0212).';
