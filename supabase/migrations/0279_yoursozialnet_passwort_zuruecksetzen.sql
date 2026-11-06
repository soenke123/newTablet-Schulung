-- ══════════════════════════════════════════════════════════════
-- Migration 0279 — YourSozialNet: Admins setzen Passwörter zurück
-- ══════════════════════════════════════════════════════════════
-- Auf dem Profil eines Users steht für Admins neben „Folgen“ der Knopf
-- „Passwort zurücksetzen“. Das neue Passwort ist eine 6-stellige Zahl
-- und wird einmal unter dem Knopf angezeigt. Gespeichert wird es als
-- bcrypt-Hash wie beim Registrieren – im Adminbereich (SQL) sehen die
-- Schüler danach in users.password nur noch $2a$08$… (gewollt,
-- didaktisch). Nebenbei die Hilfe, wenn jemand sein Passwort vergessen hat.
--
--   - Wer darf: Admins des Netzwerks (sh_access → r_admin), also auch
--     die Lehrkraft in jedem Netzwerk ihres Raums (ohne eigenes Konto).
--     Admin-Konten anderer dürfen ebenfalls zurückgesetzt werden.
--   - Nicht: das eigene Konto ('self') und Testkonten der Lehrkraft
--     (teacher_id gesetzt), außer die Lehrkraft selbst ('forbidden').
--   - Alle Sitzungen des Kontos enden (wie sh_admin_reset).
--
-- Prüfstand: supabase/tests/0279_yoursozialnet_passwort_zuruecksetzen.mjs
-- ══════════════════════════════════════════════════════════════

create or replace function sh_user_pw_reset(
  p_token text default null, p_code text default null, p_hub uuid default null, p_session text default null,
  p_user int default null)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  a    record;
  u    sh_users;
  v_pw text;
begin
  select * into a from sh_access(p_token, p_code, p_hub, p_session);
  if a.err is not null then return sh_err(a.err); end if;
  if not a.r_admin then return sh_err('not_admin'); end if;
  select * into u from sh_users where hub_id = p_hub and id = p_user;
  if u.id is null then return sh_err('not_found'); end if;
  if a.r_user is not null and a.r_user = u.id then return sh_err('self'); end if;
  if u.teacher_id is not null and not a.r_teacher then return sh_err('forbidden'); end if;
  v_pw := lpad(floor(random() * 1000000)::int::text, 6, '0');
  update sh_users set password = sh_hash(v_pw) where hub_id = p_hub and id = u.id;
  delete from sh_sessions where hub_id = p_hub and user_id = u.id;
  return jsonb_build_object('ok', true, 'username', u.username, 'password', v_pw);
end;
$$;
revoke all on function sh_user_pw_reset(text, text, uuid, text, int) from public;
grant execute on function sh_user_pw_reset(text, text, uuid, text, int) to anon, authenticated;
