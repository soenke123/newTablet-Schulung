-- ══════════════════════════════════════════════════════════════
-- 0293 · Antrags-Mail an die Volladmins selbst (15.11.2026)
-- ══════════════════════════════════════════════════════════════
-- Bis hier ging die Mail „Eine Lehrkraft möchte einen Account“ nur an
-- mail_settings.admin_email (von Hand). Jetzt an die BESTÄTIGTE
-- E-Mail-Adresse jedes Volladmins (profiles.is_superadmin,
-- notify_email.verified_at, eingetragen im Profil unter „Passwort“,
-- seit 0292 auch für Admins). admin_email bleibt als optionale
-- Zusatzadresse (leer lassen reicht). Doppelte Adressen nur einmal.
-- Kein DROP.
-- ══════════════════════════════════════════════════════════════

-- Empfänger als Komma-Liste ('' = niemand).
create or replace function mps_admin_mail_to()
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(string_agg(distinct a, ', '), '')
    from (
      select lower(e.email) a
        from profiles p
        join notify_email e on e.user_id = p.id
       where p.is_superadmin
         and e.verified_at is not null
      union
      select lower(btrim(x))
        from mail_settings s, regexp_split_to_table(s.admin_email, ',') x
       where s.id and btrim(x) <> ''
    ) t;
$$;

revoke all on function mps_admin_mail_to() from public;


create or replace function mail_due()
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select exists (select 1 from notify_email
                  where verified_at is null and verify_sent_at is null and verify_tries < 3)
      or exists (select 1 from pa_mail_outbox o
                  where o.sent_at is null
                    and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
                  group by o.room_id
                 having min(o.created_at) <= now() - interval '5 minutes')
      or (mps_admin_mail_to() <> ''
          and exists (select 1 from teacher_request_mail m
                       where m.sent_at is null
                         and (m.claimed_at is null or m.claimed_at < now() - interval '10 minutes')));
$$;

revoke all on function mail_due() from public;


create or replace function mps_mail_claim()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_to  text;
  v_ids bigint[];
begin
  if not pg_try_advisory_xact_lock(202291) then
    return jsonb_build_object('ok', true, 'admin', null);
  end if;

  delete from teacher_request_mail where sent_at < now() - interval '30 days';

  v_to := mps_admin_mail_to();
  if v_to = '' then
    return jsonb_build_object('ok', true, 'admin', null);
  end if;

  -- Inzwischen entschieden oder sehr alt (Adresse wurde erst später
  -- eingetragen): keine Mail mehr.
  update teacher_request_mail m set sent_at = now(), note = 'erledigt'
   where m.sent_at is null
     and (m.created_at < now() - interval '7 days'
          or not exists (select 1 from profiles p where p.id = m.user_id and p.teacher_status = 'pending'));

  select array_agg(id order by id) into v_ids
    from teacher_request_mail
   where sent_at is null
     and (claimed_at is null or claimed_at < now() - interval '10 minutes');
  if v_ids is null then
    return jsonb_build_object('ok', true, 'admin', null);
  end if;

  update teacher_request_mail set claimed_at = now(), attempts = attempts + 1 where id = any(v_ids);
  return jsonb_build_object('ok', true, 'admin', jsonb_build_object(
    'ids', to_jsonb(v_ids), 'to', v_to, 'count', array_length(v_ids, 1)));
end;
$$;

revoke all on function mps_mail_claim() from public;
grant execute on function mps_mail_claim() to service_role;
