-- ══════════════════════════════════════════════════════════════
-- Migration 0291 — Lehrkraft-Antrag mit Nachricht + E-Mail,
--                  Mail an den Volladmin, Passwort per E-Mail
-- ══════════════════════════════════════════════════════════════
-- Anlass (15.11.2026): Schüler legten sich über MPSkills versehentlich
-- „Lehrer-Konten" an — jede Registrierung dort war ein Antrag, und
-- niemand wusste, wer dahintersteckt. Ab jetzt:
--
--   · Schülerkonto = kein Antrag (api/signup.js, teacher_request fehlt).
--   · Lehrkraft-Antrag NUR mit Nachricht („wer bin ich, welche Schule,
--     woher kenne ich MPSkills") und E-Mail-Adresse:
--       – neues Konto: api/signup.js → teacher_request_store (service_role)
--       – Schülerkonto hochstufen: request_teacher_access (authenticated)
--     Die Nachricht steht in teacher_requests (eigene Tabelle, NICHT in
--     profiles: profiles ist per RLS für mehr Leute lesbar als nur den
--     Admin). Lesen nur über admin_teacher_requests().
--   · Die E-Mail ist dieselbe wie für die Antrags-Mails der Projektarbeit
--     (notify_email, 0203). Ab jetzt ist JEDE Adresse erlaubt, nicht mehr
--     nur @mps-ki.de. Bestätigt wird weiter per Link.
--   · Bei jedem neuen Antrag eine Mail an den Volladmin
--     (mail_settings.admin_email, von Hand eingetragen). In der Mail
--     steht NICHTS über die Person — nur „eine Lehrkraft möchte einen
--     Account" und der Link ins Admin-Panel.
--   · Passwort vergessen: Lehrkräfte (approved/pending, keine Admins)
--     mit BESTÄTIGTER Adresse bekommen einen Link (30 Min., einmal).
--     Token nur als sha256 in pw_resets. Ablauf über
--     api/notify_email.js?f=reset / ?f=reset_set (keine 13. API-Datei).
--   · Alte Lehrkräfte ohne Adresse tragen sie freiwillig nach:
--     my_email_get / my_email_set (Hinweis auf der Startseite + Profil).
--   · request_teacher_role() (0077, ohne Nachricht) stellt keinen Antrag
--     mehr, sondern antwortet note_required.
--
-- Einrichten: update mail_settings set admin_email = 'du@beispiel.de';
-- Kein DROP (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) E-Mail-Adressen: jede gültige Adresse
-- ─────────────────────────────────────────────────────────────
comment on table notify_email is
  'E-Mail-Adresse je Lehrkraft (0203, seit 0291 jede Domain). Erst nach Klick auf den '
  'Bestätigungslink (verified_at) gehen Mails an sie: Antrags-Mails der Projektarbeit und '
  'Passwort zurücksetzen (0291). stop_token: Abmelde-Link in jeder Mail.';

create or replace function notify_email_valid(p_mail text)
  returns boolean
  language sql
  immutable
as $$
  select p_mail is not null
     and char_length(p_mail) between 6 and 120
     and p_mail ~ '^[a-z0-9][a-z0-9._%+-]*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$';
$$;

revoke all on function notify_email_valid(text) from public;


-- Adresse eintragen, ändern oder löschen — der eine Ort für die Regeln.
-- p_mail '' = löschen. Gleiche Adresse = nichts tun. Rückgabe: null
-- oder Fehlercode (email_invalid, too_soon).
create or replace function notify_email_store(p_uid uuid, p_mail text, p_resend boolean default false)
  returns text
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_e    notify_email;
  v_mail text := lower(btrim(coalesce(p_mail, '')));
begin
  select * into v_e from notify_email where user_id = p_uid;

  if p_mail is not null and v_mail = '' then
    delete from notify_email where user_id = p_uid;
  elsif p_mail is not null and v_mail is distinct from v_e.email then
    if not notify_email_valid(v_mail) then
      return 'email_invalid';
    end if;
    -- Keine Mail-Kanone: höchstens eine neue Adresse je Minute.
    if v_e.user_id is not null and v_e.requested_at > now() - interval '1 minute' then
      return 'too_soon';
    end if;
    insert into notify_email (user_id, email, verify_token, stop_token)
    values (p_uid, v_mail, encode(gen_random_bytes(24), 'hex'), encode(gen_random_bytes(24), 'hex'))
    on conflict (user_id) do update
      set email = excluded.email, verify_token = excluded.verify_token,
          stop_token = excluded.stop_token, verified_at = null, requested_at = now(),
          verify_sent_at = null, verify_tries = 0;
  elsif p_resend and v_e.user_id is not null and v_e.verified_at is null then
    if v_e.requested_at > now() - interval '2 minutes' then
      return 'too_soon';
    end if;
    update notify_email set requested_at = now(), verify_sent_at = null, verify_tries = 0
     where user_id = p_uid;
  end if;
  return null;
end;
$$;

revoke all on function notify_email_store(uuid, text, boolean) from public;


-- Projektarbeit (0203) auf die neue Regel umstellen. Inhalt sonst
-- unverändert; 'domain' ist jetzt null (= jede Adresse).
create or replace function pa_room_notify_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_e    notify_email;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_e from notify_email where user_id = auth.uid();
  return jsonb_build_object(
    'ok',       true,
    'domain',   null,
    'email',    v_e.email,
    'verified', v_e.verified_at is not null,
    'pending',  v_e.user_id is not null and v_e.verified_at is null,
    'enabled',  coalesce((select enabled from pa_room_notify
                           where room_id = v_room.id and user_id = auth.uid()), false));
end;
$$;

revoke all on function pa_room_notify_get(text) from public;
grant execute on function pa_room_notify_get(text) to authenticated;


create or replace function pa_room_notify_set(p_code text, p_email text default null,
                                              p_on boolean default null, p_resend boolean default false)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_uid  uuid := auth.uid();
  v_room skill_rooms;
  v_err  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_err := notify_email_store(v_uid, p_email, p_resend);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  if p_on is not null then
    insert into pa_room_notify (room_id, user_id, enabled) values (v_room.id, v_uid, p_on)
    on conflict (room_id, user_id) do update set enabled = excluded.enabled;
  end if;

  begin
    perform mail_kick();
  exception when others then
    null;
  end;
  return pa_room_notify_get(p_code);
end;
$$;

revoke all on function pa_room_notify_set(text, text, boolean, boolean) from public;
grant execute on function pa_room_notify_set(text, text, boolean, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) Die Nachricht zum Antrag
-- ─────────────────────────────────────────────────────────────
create table if not exists teacher_requests (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text not null check (char_length(note) between 1 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table teacher_requests is
  'Nachricht zum Lehrkraft-Antrag (0291): wer bin ich, welche Schule, woher kenne ich MPSkills. '
  'Lesen nur Admins über admin_teacher_requests(). Kein Grant.';
alter table teacher_requests enable row level security;


-- Gemeinsamer Kern für beide Wege (neues Konto / hochstufen).
--   { ok, status } | { ok:false, error: note_short|note_long|email_required|email_invalid|too_soon|already_admin }
create or replace function teacher_request_store(p_uid uuid, p_note text, p_email text)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_p    profiles;
  v_err  text;
begin
  select * into v_p from profiles where id = p_uid;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_p.is_admin or v_p.is_superadmin then
    return jsonb_build_object('ok', false, 'error', 'already_admin');
  end if;
  if char_length(v_note) < 10 then
    return jsonb_build_object('ok', false, 'error', 'note_short');
  end if;
  if char_length(v_note) > 600 then
    return jsonb_build_object('ok', false, 'error', 'note_long');
  end if;
  if v_mail = '' then
    return jsonb_build_object('ok', false, 'error', 'email_required');
  end if;

  v_err := notify_email_store(p_uid, v_mail, false);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  insert into teacher_requests (user_id, note) values (p_uid, v_note)
  on conflict (user_id) do update set note = excluded.note, updated_at = now();

  -- Freigeschaltet bleibt freigeschaltet; offen bleibt offen (keine
  -- zweite Mail an den Admin). Nur aus none/rejected wird ein Antrag.
  if v_p.teacher_status in ('none', 'rejected') then
    update profiles set teacher_status = 'pending' where id = p_uid;
  end if;

  begin
    perform mail_kick();
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true,
    'status', (select teacher_status from profiles where id = p_uid));
end;
$$;

revoke all on function teacher_request_store(uuid, text, text) from public;
grant execute on function teacher_request_store(uuid, text, text) to service_role;


-- Schülerkonto hochstufen / abgelehnten Antrag neu stellen.
create or replace function request_teacher_access(p_note text, p_email text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  return teacher_request_store(auth.uid(), p_note, p_email);
end;
$$;

revoke all on function request_teacher_access(text, text) from public;
grant execute on function request_teacher_access(text, text) to authenticated;


-- Der alte Weg ohne Nachricht stellt keinen Antrag mehr. Ein alter
-- Browser-Stand bekommt eine Fehlermeldung statt eines stummen Antrags.
create or replace function request_teacher_role()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  return jsonb_build_object('ok', false, 'error', 'note_required');
end;
$$;

revoke all on function request_teacher_role() from public;
grant execute on function request_teacher_role() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Eigene Adresse ansehen / nachtragen (Lehrkräfte, Antragsteller)
-- ─────────────────────────────────────────────────────────────
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
    'allowed',  coalesce(v_p.teacher_status in ('approved', 'pending'), false),
    'email',    v_e.email,
    'verified', v_e.verified_at is not null);
end;
$$;

revoke all on function my_email_get() from public;
grant execute on function my_email_get() to authenticated;


-- p_email: '' = löschen, sonst neue Adresse (muss bestätigt werden);
-- p_resend = Bestätigungsmail noch einmal.
create or replace function my_email_set(p_email text default null, p_resend boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_st  text;
  v_err text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select teacher_status into v_st from profiles where id = auth.uid();
  if coalesce(v_st, 'none') not in ('approved', 'pending') then
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


-- ─────────────────────────────────────────────────────────────
-- 4) Admin-Panel: Nachricht + Adresse zu den Anträgen
-- ─────────────────────────────────────────────────────────────
-- Volladmin alle (oder p_school), Schuladmin nur die eigene Schule.
--   { ok, rows: [ {user_id, note, email, verified} ] }
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
     where p.teacher_status <> 'none'
       and (v_school is null or p.school_id = v_school)
       and (r.user_id is not null or e.user_id is not null)), '[]'::jsonb));
end;
$$;

revoke all on function admin_teacher_requests(uuid) from public;
grant execute on function admin_teacher_requests(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Mail an den Volladmin bei neuem Antrag
-- ─────────────────────────────────────────────────────────────
alter table mail_settings add column if not exists admin_email text not null default '';
comment on column mail_settings.admin_email is
  'An diese Adresse(n) geht bei jedem neuen Lehrkraft-Antrag eine Mail ohne Personendaten (0291). '
  'Mehrere mit Komma trennen. Leer = keine Mail.';

create table if not exists teacher_request_mail (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts   int  not null default 0,
  sent_at    timestamptz,
  note       text
);

comment on table teacher_request_mail is
  'Neue Lehrkraft-Anträge, über die der Volladmin eine Mail bekommt (0291). sent_at gesetzt = erledigt. '
  'Erledigte bleiben 30 Tage stehen.';
create index if not exists teacher_request_mail_wait_idx on teacher_request_mail (created_at) where sent_at is null;
alter table teacher_request_mail enable row level security;


create or replace function profiles_teacher_request_mail()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.teacher_status <> 'pending' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.teacher_status = 'pending' then
    return null;
  end if;
  insert into teacher_request_mail (user_id) values (new.id);
  begin
    perform mail_kick();
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function profiles_teacher_request_mail() from public;

create or replace trigger profiles_teacher_request_mail_trg
  after insert or update of teacher_status on profiles
  for each row execute function profiles_teacher_request_mail();


-- mail_due (0203) + wartende Admin-Mails. Admin-Mails sind sofort
-- fällig (Anträge sind selten, gebündelt wird nur, was gleichzeitig wartet).
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
      or (exists (select 1 from mail_settings where id and admin_email <> '')
          and exists (select 1 from teacher_request_mail m
                       where m.sent_at is null
                         and (m.claimed_at is null or m.claimed_at < now() - interval '10 minutes')));
$$;

revoke all on function mail_due() from public;


-- api/mail_dispatch.js: was an den Admin geht.
--   { ok, admin: null | { ids, to, count } }
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

  select btrim(admin_email) into v_to from mail_settings where id;
  if coalesce(v_to, '') = '' then
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


--   { admin: { ids, ok, error } }
create or replace function mps_mail_done(p_res jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v   jsonb := p_res->'admin';
  ids bigint[];
begin
  if v is null or jsonb_typeof(v) <> 'object' then
    return jsonb_build_object('ok', true);
  end if;
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
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function mps_mail_done(jsonb) from public;
grant execute on function mps_mail_done(jsonb) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 6) Passwort vergessen (api/notify_email.js, service_role)
-- ─────────────────────────────────────────────────────────────
create table if not exists pw_resets (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

comment on table pw_resets is
  'Links „Passwort zurücksetzen" (0291). Nur der sha256 des Tokens, gültig 30 Minuten, einmal. '
  'Nach 2 Tagen gelöscht.';
create index if not exists pw_resets_user_idx on pw_resets (user_id, created_at);
alter table pw_resets enable row level security;

create table if not exists pw_reset_attempts (
  ip         text not null,
  created_at timestamptz not null default now()
);

comment on table pw_reset_attempts is
  'Anfragen „Passwort vergessen" je IP (0291), nur für die Bremse 20 je Stunde. Nach 1 Tag gelöscht.';
create index if not exists pw_reset_attempts_idx on pw_reset_attempts (ip, created_at);
alter table pw_reset_attempts enable row level security;


-- Wer bekommt einen Link? Lehrkräfte (approved/pending), keine Admins
-- (die haben 2FA und gehen über den Volladmin), mit BESTÄTIGTER
-- Adresse. p_login = Accountname ODER E-Mail. Je Konto höchstens 3
-- Links je Stunde. Die Antwort an den Browser sagt nie, ob es passte —
-- das entscheidet api/notify_email.js; hier gehen die Links samt
-- Klartext-Token nur an service_role.
--   { ok, targets: [ {email, token, account_name, display_name} ] } | { ok:false, error:'rate_limit' }
create or replace function pw_reset_request(p_school text, p_login text, p_ip text)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_login text := lower(btrim(coalesce(p_login, '')));
  v_ip    text := left(coalesce(nullif(btrim(p_ip), ''), 'unknown'), 64);
  v_out   jsonb := '[]'::jsonb;
  r       record;
  v_tok   text;
begin
  delete from pw_reset_attempts where created_at < now() - interval '1 day';
  delete from pw_resets where created_at < now() - interval '2 days';

  if (select count(*) from pw_reset_attempts
       where ip = v_ip and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'rate_limit');
  end if;
  insert into pw_reset_attempts (ip) values (v_ip);

  if v_login = '' or char_length(v_login) > 120 then
    return jsonb_build_object('ok', true, 'targets', v_out);
  end if;

  for r in
    select p.id, p.account_name, p.display_name, e.email
      from profiles p
      join schools s on s.id = p.school_id and s.slug = lower(btrim(coalesce(p_school, '')))
      join notify_email e on e.user_id = p.id and e.verified_at is not null
     where (p.account_name = v_login or e.email = v_login)
       and p.teacher_status in ('approved', 'pending')
       and not coalesce(p.is_admin, false) and not coalesce(p.is_superadmin, false)
     limit 5
  loop
    if (select count(*) from pw_resets
         where user_id = r.id and created_at > now() - interval '1 hour') >= 3 then
      continue;
    end if;
    v_tok := encode(gen_random_bytes(24), 'hex');
    insert into pw_resets (user_id, token_hash, expires_at)
    values (r.id, encode(digest(v_tok, 'sha256'), 'hex'), now() + interval '30 minutes');
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'email', r.email, 'token', v_tok,
      'account_name', r.account_name, 'display_name', r.display_name));
  end loop;

  return jsonb_build_object('ok', true, 'targets', v_out);
end;
$$;

revoke all on function pw_reset_request(text, text, text) from public;
grant execute on function pw_reset_request(text, text, text) to service_role;


-- Link einlösen: gültig + unbenutzt → als benutzt markieren (auch alle
-- anderen offenen Links dieses Kontos) und user_id zurück. Das neue
-- Passwort setzt api/notify_email.js mit auth.admin.updateUserById.
--   { ok, user_id, account_name } | { ok:false, error:'invalid' }
create or replace function pw_reset_take(p_token text)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_r pw_resets;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_r from pw_resets
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and used_at is null and expires_at > now()
   for update;
  if v_r.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update pw_resets set used_at = now() where user_id = v_r.user_id and used_at is null;
  return jsonb_build_object('ok', true, 'user_id', v_r.user_id,
    'account_name', (select account_name from profiles where id = v_r.user_id));
end;
$$;

revoke all on function pw_reset_take(text) from public;
grant execute on function pw_reset_take(text) to service_role;


-- Nur prüfen (Seite zeigt sonst das Formular umsonst).
create or replace function pw_reset_check(p_token text)
  returns jsonb
  security definer
  set search_path = public, extensions
  language sql
  stable
as $$
  select jsonb_build_object('ok', exists (
    select 1 from pw_resets
     where p_token ~ '^[0-9a-f]{48}$'
       and token_hash = encode(digest(p_token, 'sha256'), 'hex')
       and used_at is null and expires_at > now()));
$$;

revoke all on function pw_reset_check(text) from public;
grant execute on function pw_reset_check(text) to service_role;
