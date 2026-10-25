-- ══════════════════════════════════════════════════════════════
-- Migration 0223 — Admin-Rechte nur mit 2FA (aal2)
-- ══════════════════════════════════════════════════════════════
-- Ein geklautes Admin-Passwort allein reicht nicht mehr. Admin-
-- Rechte (Schuladmin und Volladmin) gelten nur in einer Sitzung, die
-- mit dem Code aus der Authenticator-App bestätigt ist. Supabase
-- schreibt das ins JWT: aal = 'aal2' (Authenticator Assurance Level).
--
-- Lehrkräfte bekommen KEINE 2FA (Entscheidung, DATENSCHUTZ.md).
-- can_teach, pa_is_teacher_profile und pa_room_teacher_search lesen
-- is_admin weiter ohne aal2: Eine Admin ohne bestätigte Sitzung hat
-- also Lehrkraft-Rechte, aber keine Admin-Rechte.
--
-- Wie es wirkt: Fast alle Policies und RPCs fragen is_admin(),
-- is_superadmin() oder is_any_admin(). Die drei verlangen ab jetzt
-- zusätzlich admin_mfa_ok(). Die Stellen, die das Admin-Flag des
-- AUFRUFERS direkt aus profiles lesen, werden unten mitgezogen
-- (gefunden über alle Funktionsrümpfe und Policies der Kette).
-- Wo profiles.is_admin über ein ZIEL gelesen wird (Admins aus
-- Bestenlisten heraushalten, kein Cluster-Bonus für Admins …), bleibt
-- es wie es ist — das ist keine Rechte-Frage.
--
-- Die api/admin_*.js prüfen dasselbe selbst (requireAal2 in
-- api/_utils.js), weil sie mit service_role an RLS vorbei arbeiten.
--
-- Einrichten: Das Admin-Panel zeigt einer Admin ohne Faktor
-- „2FA einrichten“ (QR-Code für die App). Ein Faktor lässt sich mit
-- einer aal1-Sitzung anlegen; sobald einer bestätigt ist, verlangt
-- Supabase für jeden weiteren aal2. Bis alle Admins eingerichtet
-- haben, ist das ein Fenster — deshalb gleich nach dem Einspielen
-- einrichten.
--
-- Notfall (Handy weg): Im Supabase-Dashboard → Authentication →
-- Users → Konto → MFA-Faktor löschen. Danach richtet die Admin neu ein.
--
-- Prüfstand: supabase/tests/0223_admin_2fa.mjs
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) admin_mfa_ok() — ist die Sitzung per 2FA bestätigt?
-- ─────────────────────────────────────────────────────────────
-- Kein JWT (SQL-Editor, Cron) → false. Cron und Trigger brauchen
-- keine Admin-Rechte über diese Helfer.
create or replace function admin_mfa_ok() returns boolean
  stable
  set search_path = public
  language sql
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke all on function admin_mfa_ok() from public;
grant execute on function admin_mfa_ok() to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) Die drei Helfer verlangen aal2
-- ─────────────────────────────────────────────────────────────
create or replace function is_admin() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_admin from profiles p where p.id = auth.uid()),
    false
  ) and admin_mfa_ok();
$$;

create or replace function is_superadmin() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_superadmin from profiles p where p.id = auth.uid()),
    false
  ) and admin_mfa_ok();
$$;

create or replace function is_any_admin() returns boolean
  security definer
  stable
  set search_path = public
  language sql
as $$
  select coalesce(
    (select p.is_admin or p.is_superadmin from profiles p where p.id = auth.uid()),
    false
  ) and admin_mfa_ok();
$$;


-- ─────────────────────────────────────────────────────────────
-- 3) Funktionen, die das Admin-Flag des Aufrufers direkt lesen
-- ─────────────────────────────────────────────────────────────
-- Nur die eine Zeile ändert sich, deshalb wird der heutige Rumpf
-- gelesen und an genau dieser Stelle ersetzt. Findet sich die Zeile
-- nicht (jemand hat die Funktion inzwischen umgebaut), bricht die
-- Migration ab, statt still nichts zu tun.
do $mig$
declare
  v_src text;
  v_new text;
begin
  -- apply_cluster_bonus (0076): Admin wendet den Cluster-Bonus an.
  v_src := pg_get_functiondef('apply_cluster_bonus(uuid)'::regprocedure);
  -- Schon eingespielt? Dann nichts tun (zweiter Lauf der Migration).
  if position('admin_mfa_ok()' in v_src) > 0 then
    raise notice '0223: apply_cluster_bonus schon umgestellt, übersprungen';
  else
    v_new := replace(v_src,
      'select is_admin or is_superadmin into v_is_admin',
      'select (is_admin or is_superadmin) and admin_mfa_ok() into v_is_admin');
    if v_new = v_src then
      raise exception '0223: Prüfzeile in apply_cluster_bonus nicht gefunden';
    end if;
    execute v_new;
  end if;

  -- board_target_cluster (0062): Admin öffnet die Pinnwand eines
  -- anderen Kurses.
  v_src := pg_get_functiondef('board_target_cluster(uuid)'::regprocedure);
  -- Schon eingespielt? Dann nichts tun (zweiter Lauf der Migration).
  if position('admin_mfa_ok()' in v_src) > 0 then
    raise notice '0223: board_target_cluster schon umgestellt, übersprungen';
  else
    v_new := replace(v_src,
      'select cluster_id, (is_admin or is_superadmin), is_superadmin, school_id',
      'select cluster_id, (is_admin or is_superadmin) and admin_mfa_ok(), is_superadmin and admin_mfa_ok(), school_id');
    if v_new = v_src then
      raise exception '0223: Prüfzeile in board_target_cluster nicht gefunden';
    end if;
    execute v_new;
  end if;
end
$mig$;


-- ─────────────────────────────────────────────────────────────
-- 4) Policies aus 0020, die profiles.is_admin selbst lesen
-- ─────────────────────────────────────────────────────────────
drop policy if exists cluster_bonus_admin_all on cluster_bonus;
create policy cluster_bonus_admin_all on cluster_bonus
  for all
  using (is_admin())
  with check (is_admin());

drop policy if exists cbg_admin_select_all on cluster_bonus_grants;
create policy cbg_admin_select_all on cluster_bonus_grants
  for select using (is_admin());
