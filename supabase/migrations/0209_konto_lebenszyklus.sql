-- ══════════════════════════════════════════════════════════════
-- Migration 0209 — Datenschutz: Lebenszyklus der Konten
-- ══════════════════════════════════════════════════════════════
-- Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO) für Konten, die
-- niemand mehr benutzt. Zwei Stufen:
--
--   1 Jahr nicht online   → INHALTE ZURÜCKGESETZT. Das Konto bleibt
--                           (Name, Passwort, Schule, Kurs, Avatar), die
--                           Highscores bleiben. Alles andere, was am
--                           Konto hängt, wird gelöscht: Spielstände,
--                           Münzen, Kreaturen, Notizen, Feedback,
--                           Mail-Adresse für Benachrichtigungen …
--                           Zugang zu Handouts und Kurs bleibt, weil
--                           Profil und Kurs bleiben.
--   4 Jahre nicht online  → KONTO GELÖSCHT (auth.users, alles hängt
--                           per on delete cascade / set null daran).
--
-- ── Was „nicht online" heißt ──────────────────────────────────
-- Letzte Aktivität = profiles.last_login_at (touch_login), sonst das
-- Anlegedatum. touch_login lief bis hier NUR beim echten Anmelden
-- (SIGNED_IN). Wer auf seinem Tablet angemeldet bleibt, hätte nie einen
-- neuen Zeitstempel bekommen. Deshalb ruft session.js es ab jetzt bei
-- jedem Seitenstart mit Sitzung auf; hier gedrosselt auf einmal je
-- 10 Minuten.
--
-- Weil der alte Zeitstempel also nicht verlässlich ist, zählt die Uhr
-- frühestens ab dem Tag, an dem diese Migration läuft
-- (skill_maintenance.lifecycle_since). Der erste Reset kann damit
-- frühestens ein Jahr nach dem Einspielen passieren.
--
-- ── Was der Reset NICHT löscht ────────────────────────────────
--   profiles, game_highscores         — so gewollt
--   skill_rooms, skill_room_teachers  — Räume haben ihre eigene
--                                       Laufzeit (30 Tage / 1 Jahr) und
--                                       gehören oft mehreren Lehrkräften
--   vocab_sets, vocab_units,          — Unterrichtsmaterial der
--   synir_scenarios                     Lehrkraft, keine Schülerdaten;
--                                       geht erst mit dem Konto
--   *.giver_id                        — Geschenke an ANDERE gehören zu
--                                       deren Stand
--
-- Neue Tabellen mit user_id → auth.users/profiles (on delete cascade)
-- werden automatisch mit zurückgesetzt — die Liste oben ist eine
-- Ausnahmeliste, keine Positivliste.
--
-- Admins (is_superadmin) werden nie automatisch gelöscht, nur
-- zurückgesetzt — sonst sperrt sich die Plattform selbst aus.
--
-- Kein DROP — create or replace (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten
-- ─────────────────────────────────────────────────────────────
alter table profiles add column if not exists content_reset_at timestamptz;

comment on column profiles.content_reset_at is
  'Wann die Inhalte nach 1 Jahr Inaktivität zurückgesetzt wurden (0209). session.js leert '
  'daraufhin einmal den lokalen Spielstand, damit ein altes Tablet nichts zurückschreibt.';

alter table skill_maintenance
  add column if not exists lifecycle_since timestamptz not null default now();

comment on column skill_maintenance.lifecycle_since is
  'Ab hier zählt die Inaktivität für Reset (1 Jahr) und Löschung (4 Jahre) — 0209.';


-- ─────────────────────────────────────────────────────────────
-- 2) touch_login: gedrosselt, weil es jetzt bei jedem Seitenstart kommt
-- ─────────────────────────────────────────────────────────────
create or replace function touch_login()
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;
  update profiles set last_login_at = now()
   where id = v_user_id
     and (last_login_at is null or last_login_at < now() - interval '10 minutes');
end;
$$;

revoke all on function touch_login() from public;
grant execute on function touch_login() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) user_session: content_reset_at hinten anhängen (Stand 0179)
-- ─────────────────────────────────────────────────────────────
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
  coalesce(c.feedback_enabled, false) as cluster_feedback_enabled,
  p.content_reset_at
from profiles p
left join schools  s on s.id = p.school_id
left join clusters c on c.id = p.cluster_id;

alter view user_session set (security_invoker = true);

grant select on user_session to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Inhalte eines Kontos zurücksetzen
-- ─────────────────────────────────────────────────────────────
create or replace function account_reset_content(p_uid uuid)
  returns int
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_fk   record;
  v_n    int;
  v_sum  int := 0;
begin
  for v_fk in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confdeltype = 'c'
       and array_length(c.conkey, 1) = 1
       and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
       and c.conrelid::regclass::text not in
           ('profiles', 'game_highscores',
            'skill_rooms', 'skill_room_teachers',
            'vocab_sets', 'vocab_units', 'synir_scenarios')
       and a.attname <> 'giver_id'
  loop
    execute format('delete from %s where %I = $1', v_fk.tbl, v_fk.col) using p_uid;
    get diagnostics v_n = row_count;
    v_sum := v_sum + v_n;
  end loop;

  -- Ohne cascade, aber mit Personenbezug
  delete from feedback_tickets where user_id = p_uid;
  get diagnostics v_n = row_count;
  v_sum := v_sum + v_n;
  delete from notify_mail_log where user_id = p_uid;

  update profiles set content_reset_at = now() where id = p_uid;
  return v_sum;
end;
$$;

revoke all on function account_reset_content(uuid) from public;
grant execute on function account_reset_content(uuid) to service_role;

comment on function account_reset_content(uuid) is
  'Löscht alle Inhalte eines Kontos außer Profil, Highscores und Unterrichtsmaterial (0209).';


-- ─────────────────────────────────────────────────────────────
-- 5) Der tägliche Lauf
-- ─────────────────────────────────────────────────────────────
create or replace function account_lifecycle(p_limit int default 50)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_since  timestamptz;
  v_lim    int := greatest(1, coalesce(p_limit, 50));
  v_uid    uuid;
  v_reset  int := 0;
  v_gone   int := 0;
  v_fail   int := 0;
begin
  select lifecycle_since into v_since from skill_maintenance limit 1;
  v_since := coalesce(v_since, now());

  -- Stufe 2 zuerst: wer 4 Jahre weg ist, braucht keinen Reset mehr.
  for v_uid in
    select p.id from profiles p
     where greatest(p.last_login_at, p.created_at, v_since) < now() - interval '4 years'
       and not coalesce(p.is_superadmin, false)
     limit v_lim
  loop
    begin
      delete from auth.users where id = v_uid;
      v_gone := v_gone + 1;
    exception when others then
      v_fail := v_fail + 1;
      raise warning 'account_lifecycle: Löschen von % fehlgeschlagen: %', v_uid, sqlerrm;
    end;
  end loop;

  -- Stufe 1: 1 Jahr weg und seit der letzten Aktivität noch nicht zurückgesetzt.
  for v_uid in
    select p.id from profiles p
     where greatest(p.last_login_at, p.created_at, v_since) < now() - interval '1 year'
       and (p.content_reset_at is null
            or p.content_reset_at < greatest(p.last_login_at, p.created_at))
     limit v_lim
  loop
    begin
      perform account_reset_content(v_uid);
      v_reset := v_reset + 1;
    exception when others then
      v_fail := v_fail + 1;
      raise warning 'account_lifecycle: Reset von % fehlgeschlagen: %', v_uid, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('reset', v_reset, 'deleted', v_gone, 'failed', v_fail);
end;
$$;

revoke all on function account_lifecycle(int) from public;
grant execute on function account_lifecycle(int) to service_role;

comment on function account_lifecycle(int) is
  'Konten: nach 1 Jahr ohne Aktivität Inhalte zurücksetzen, nach 4 Jahren löschen (0209). '
  'Läuft in skill_cleanup mit.';


-- ─────────────────────────────────────────────────────────────
-- 6) skill_cleanup (Stand 0208) ruft den Lauf mit auf
-- ─────────────────────────────────────────────────────────────
create or replace function skill_cleanup(p_limit int default 200)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_rooms    int;
  v_logs     int;
  v_signups  int;
  v_cheats   int;
  v_tickets  int;
  v_accounts jsonb;
begin
  with doomed as (
    select id from skill_rooms
     where expires_at <= now()
     order by expires_at
     limit greatest(1, coalesce(p_limit, 200))
  )
  delete from skill_rooms r using doomed d where r.id = d.id;
  get diagnostics v_rooms = row_count;

  delete from skill_join_attempts where created_at < now() - interval '1 day';
  get diagnostics v_logs = row_count;

  delete from signup_attempts where created_at < now() - interval '1 day';
  get diagnostics v_signups = row_count;

  delete from cheat_flags where created_at < now() - interval '180 days';
  get diagnostics v_cheats = row_count;

  delete from feedback_tickets where updated_at < now() - interval '365 days';
  get diagnostics v_tickets = row_count;

  v_accounts := account_lifecycle(50);

  return jsonb_build_object('ok', true, 'rooms', v_rooms, 'attempts', v_logs,
                            'signups', v_signups, 'cheat_flags', v_cheats,
                            'tickets', v_tickets, 'accounts', v_accounts);
end;
$$;

revoke all on function skill_cleanup(int) from public;
grant execute on function skill_cleanup(int) to service_role;

comment on function skill_cleanup(int) is
  'Löscht abgelaufene Räume samt allem, was daran hängt, und alte Protokolle: '
  'IP-Logs nach 1 Tag, cheat_flags nach 180, feedback_tickets nach 365 Tagen (0208); '
  'Konten: Reset nach 1 Jahr, Löschung nach 4 Jahren ohne Aktivität (0209). '
  'Zwei Auslöser: beiläufig beim Zugriff der Lehrkraft (gedrosselt) und täglich per pg_cron.';
