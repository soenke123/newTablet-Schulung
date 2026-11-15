-- ══════════════════════════════════════════════════════════════
-- 0292 · E-Mail-Adresse auch für Admin-Konten (15.11.2026)
-- ══════════════════════════════════════════════════════════════
-- Nach 0291 stand die E-Mail nur bei Lehrkräften (approved/pending)
-- im Profil; Admins sahen sie weder dort noch im Admin-Reiter
-- „Lehrkräfte“, wenn ihr teacher_status 'none' war.
--   · my_email_get / my_email_set: erlaubt auch für Admins
--     (profiles.is_admin / is_superadmin, OHNE 2FA – es geht nur um
--     die eigene Adresse).
--   · Passwort per Mail zurücksetzen bleibt für Admins gesperrt
--     (pw_reset_request unverändert): ein Admin-Konto soll nicht über
--     ein Postfach übernommen werden können.
--   · admin_teacher_requests liefert auch Admin-Konten mit Adresse.
-- Kein DROP.
-- ══════════════════════════════════════════════════════════════

create or replace function my_email_get()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_p profiles;
  v_e notify_email;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_p from profiles where id = auth.uid();
  select * into v_e from notify_email where user_id = auth.uid();
  return jsonb_build_object(
    'ok',       true,
    'allowed',  coalesce(v_p.teacher_status in ('approved', 'pending')
                         or v_p.is_admin or v_p.is_superadmin, false),
    'admin',    coalesce(v_p.is_admin or v_p.is_superadmin, false),
    'email',    v_e.email,
    'verified', v_e.verified_at is not null);
end;
$$;

revoke all on function my_email_get() from public;
grant execute on function my_email_get() to authenticated;


create or replace function my_email_set(p_email text default null, p_resend boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p   profiles;
  v_err text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_p from profiles where id = auth.uid();
  if not coalesce(v_p.teacher_status in ('approved', 'pending')
                  or v_p.is_admin or v_p.is_superadmin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_teacher');
  end if;
  v_err := notify_email_store(auth.uid(), p_email, p_resend);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  begin
    perform mail_kick();
  exception when others then
    null;
  end;
  return my_email_get();
end;
$$;

revoke all on function my_email_set(text, boolean) from public;
grant execute on function my_email_set(text, boolean) to authenticated;


create or replace function admin_teacher_requests(p_school uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_school uuid;
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

  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id',  p.id,
             'note',     r.note,
             'email',    e.email,
             'verified', e.verified_at is not null))
      from profiles p
      left join teacher_requests r on r.user_id = p.id
      left join notify_email e on e.user_id = p.id
     where (p.teacher_status <> 'none' or p.is_admin or p.is_superadmin)
       and (v_school is null or p.school_id = v_school)
       and (r.user_id is not null or e.user_id is not null)), '[]'::jsonb));
end;
$$;

revoke all on function admin_teacher_requests(uuid) from public;
grant execute on function admin_teacher_requests(uuid) to authenticated;
