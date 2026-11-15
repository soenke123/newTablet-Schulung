-- ══════════════════════════════════════════════════════════════
-- 0294 · Willkommens-Mail bei Freischaltung einer Lehrkraft (15.11.2026)
-- ══════════════════════════════════════════════════════════════
-- Wechselt profiles.teacher_status auf 'approved' (Admin-Panel
-- „Freigeben“ oder api/admin_promote_user), kommt eine Zeile in
-- teacher_welcome_mail. mail_dispatch holt sie über mps_mail_claim()
-- ab (Schlüssel 'welcome') und schickt „Herzlich willkommen“ an die
-- Adresse aus dem Antrag (notify_email). Ausnahme zu sonst: auch an
-- eine noch UNBESTÄTIGTE Adresse — wer den Bestätigungslink übersehen
-- hat, soll trotzdem erfahren, dass er freigeschaltet ist. In der Mail
-- steht dann zusätzlich der Bestätigungslink.
-- Ohne Adresse: nichts (note 'kein_empfaenger'). Bei Ablehnung: nichts.
-- Kein DROP.
-- ══════════════════════════════════════════════════════════════

create table if not exists teacher_welcome_mail (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts   int  not null default 0,
  sent_at    timestamptz,
  note       text
);

comment on table teacher_welcome_mail is
  'Willkommens-Mails an frisch freigeschaltete Lehrkräfte (0294). sent_at gesetzt = erledigt. '
  'Erledigte bleiben 30 Tage stehen.';
create index if not exists teacher_welcome_mail_wait_idx on teacher_welcome_mail (created_at) where sent_at is null;
alter table teacher_welcome_mail enable row level security;


create or replace function profiles_teacher_welcome_mail()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.teacher_status <> 'approved' or old.teacher_status = 'approved' then
    return null;
  end if;
  insert into teacher_welcome_mail (user_id) values (new.id);
  begin
    perform mail_kick();
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function profiles_teacher_welcome_mail() from public;

create or replace trigger profiles_teacher_welcome_mail_trg
  after update of teacher_status on profiles
  for each row execute function profiles_teacher_welcome_mail();


-- mail_due (0293) + wartende Willkommens-Mails (sofort fällig).
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
                         and (m.claimed_at is null or m.claimed_at < now() - interval '10 minutes')))
      or exists (select 1 from teacher_welcome_mail w
                  where w.sent_at is null
                    and (w.claimed_at is null or w.claimed_at < now() - interval '10 minutes'));
$$;

revoke all on function mail_due() from public;


-- Was an den Admin geht (wie 0293) und neu: welcome = Liste der
-- Willkommens-Mails [{id, email, verified, verify_token, name, account, school}].
create or replace function mps_mail_claim()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_to      text;
  v_ids     bigint[];
  v_admin   jsonb := null;
  v_welcome jsonb;
  v_wids    bigint[];
begin
  if not pg_try_advisory_xact_lock(202291) then
    return jsonb_build_object('ok', true, 'admin', null, 'welcome', '[]'::jsonb);
  end if;

  delete from teacher_request_mail where sent_at < now() - interval '30 days';
  delete from teacher_welcome_mail where sent_at < now() - interval '30 days';

  -- a) Anträge an die Volladmins
  v_to := mps_admin_mail_to();
  if v_to <> '' then
    update teacher_request_mail m set sent_at = now(), note = 'erledigt'
     where m.sent_at is null
       and (m.created_at < now() - interval '7 days'
            or not exists (select 1 from profiles p where p.id = m.user_id and p.teacher_status = 'pending'));

    select array_agg(id order by id) into v_ids
      from teacher_request_mail
     where sent_at is null
       and (claimed_at is null or claimed_at < now() - interval '10 minutes');
    if v_ids is not null then
      update teacher_request_mail set claimed_at = now(), attempts = attempts + 1 where id = any(v_ids);
      v_admin := jsonb_build_object('ids', to_jsonb(v_ids), 'to', v_to, 'count', array_length(v_ids, 1));
    end if;
  end if;

  -- b) Willkommen: inzwischen wieder entzogen, sehr alt oder ohne Adresse → erledigt
  update teacher_welcome_mail w set sent_at = now(), note = 'erledigt'
   where w.sent_at is null
     and (w.created_at < now() - interval '7 days'
          or not exists (select 1 from profiles p where p.id = w.user_id and p.teacher_status = 'approved'));
  update teacher_welcome_mail w set sent_at = now(), note = 'kein_empfaenger'
   where w.sent_at is null
     and not exists (select 1 from notify_email e where e.user_id = w.user_id);

  select array_agg(w.id order by w.id),
         coalesce(jsonb_agg(jsonb_build_object(
           'id',           w.id,
           'email',        e.email,
           'verified',     e.verified_at is not null,
           'verify_token', case when e.verified_at is null then e.verify_token end,
           'name',         coalesce(nullif(p.display_name, ''), p.account_name),
           'account',      p.account_name,
           'school',       s.name) order by w.id), '[]'::jsonb)
    into v_wids, v_welcome
    from teacher_welcome_mail w
    join profiles p on p.id = w.user_id
    join notify_email e on e.user_id = w.user_id
    left join schools s on s.id = p.school_id
   where w.sent_at is null
     and (w.claimed_at is null or w.claimed_at < now() - interval '10 minutes');
  if v_wids is not null then
    update teacher_welcome_mail set claimed_at = now(), attempts = attempts + 1 where id = any(v_wids);
  end if;

  return jsonb_build_object('ok', true, 'admin', v_admin, 'welcome', v_welcome);
end;
$$;

revoke all on function mps_mail_claim() from public;
grant execute on function mps_mail_claim() to service_role;


--   { admin: { ids, ok, error }, welcome: [ { id, ok, error } ] }
create or replace function mps_mail_done(p_res jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v   jsonb := p_res->'admin';
  w   jsonb;
  ids bigint[];
begin
  if v is not null and jsonb_typeof(v) = 'object' then
    select coalesce(array_agg(x::bigint), '{}') into ids from jsonb_array_elements_text(v->'ids') x;
    if coalesce((v->>'ok')::boolean, false) then
      update teacher_request_mail set sent_at = now(), note = 'gesendet'
       where id = any(ids) and sent_at is null;
    else
      update teacher_request_mail
         set note       = left('fehler: ' || coalesce(v->>'error', '?'), 300),
             claimed_at = null,
             sent_at    = case when attempts >= 3 then now() else null end
       where id = any(ids) and sent_at is null;
    end if;
  end if;

  if jsonb_typeof(p_res->'welcome') = 'array' then
    for w in select * from jsonb_array_elements(p_res->'welcome') loop
      if coalesce((w->>'ok')::boolean, false) then
        update teacher_welcome_mail set sent_at = now(), note = 'gesendet'
         where id = (w->>'id')::bigint and sent_at is null;
      else
        update teacher_welcome_mail
           set note       = left('fehler: ' || coalesce(w->>'error', '?'), 300),
               claimed_at = null,
               sent_at    = case when attempts >= 3 then now() else null end
         where id = (w->>'id')::bigint and sent_at is null;
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function mps_mail_done(jsonb) from public;
grant execute on function mps_mail_done(jsonb) to service_role;
