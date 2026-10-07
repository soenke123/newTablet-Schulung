-- ══════════════════════════════════════════════════════════════
-- Migration 0202 — Projektarbeit: Mail an die Lehrkräfte bei neuen Anträgen
-- ══════════════════════════════════════════════════════════════
-- Stellt eine Gruppe einen Antrag („Lernen am anderen Ort", 0201) —
-- oder schickt sie einen abgelehnten überarbeitet neu ab —, bekommen
-- die Lehrkräfte des Raums eine Mail. Verschickt wird über einen
-- eigenen IServ-Account per SMTP (api/mail_dispatch.js), also bleibt
-- alles im Schulsystem.
--
-- ── Empfänger ─────────────────────────────────────────────────
-- Alle Lehrkräfte des Raums (pa_room_teachers), die
--   · eine Adresse eingetragen UND per Link bestätigt haben
--     (notify_email; nur @mps-ki.de — die Mail verlässt IServ nicht),
--   · und für DIESEN Raum den Haken gesetzt haben (pa_room_notify).
-- Die Adresse gilt je Lehrkraft (einmal eintippen), der Haken je Raum.
-- pa_room_teachers liefert heute nur den Besitzer; kommen später
-- mehrere Lehrkräfte in einen Raum, wird nur diese Funktion erweitert.
--
-- ── Ablauf ────────────────────────────────────────────────────
--   Antrag wechselt auf „offen" (neu oder neu abgeschickt)
--     → Trigger auf pa_items → Zeile in pa_mail_outbox
--   pg_cron jede Minute → mail_kick(): ist etwas fällig, ruft pg_net
--     /api/mail_dispatch auf (mit Geheimnis aus mail_settings)
--   /api/mail_dispatch → pa_mail_claim() → SMTP → pa_mail_done()
--
-- Gebündelt wird je Raum: fällig ist ein Raum, wenn sein ältester
-- wartender Eintrag 5 Minuten alt ist; dann gehen ALLE wartenden
-- Anträge des Raums in eine Mail. Ändert die Gruppe ihren offenen
-- Antrag noch, bleibt es bei einer Zeile (eindeutig je Antrag,
-- solange nicht verschickt). Ist der Antrag beim Versand schon
-- entschieden oder gelöscht, fällt er heraus.
--
-- Bremsen: höchstens 10 Mails je Lehrkraft und Stunde; ein Fehlschlag
-- wird beim nächsten Lauf wiederholt, nach 3 Versuchen aufgegeben.
--
-- Inhalt der Mail: Raumtitel, Gruppenname, Datum — keine
-- Schülernamen, kein Ort, keine Tätigkeit. Die stehen im Raum.
--
-- ── Einrichten (einmalig, im SQL-Editor) ──────────────────────
--   1. Erweiterungen pg_cron und pg_net aktivieren (Dashboard →
--      Database → Extensions) und diese Migration erneut ausführen.
--   2. update mail_settings
--         set dispatch_url    = 'https://<domain>/api/mail_dispatch',
--             dispatch_secret = '<langes Zufallsgeheimnis>';
--      Dasselbe Geheimnis als MAIL_DISPATCH_SECRET in Vercel.
-- Ohne pg_cron/pg_net läuft die Migration trotzdem durch; dann werden
-- nur keine Mails angestoßen.
--
-- Kein DROP — create … if not exists / create or replace
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists notify_email (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  email               text not null check (char_length(email) <= 120),
  verify_token        text not null unique,
  stop_token          text not null unique,
  verified_at         timestamptz,
  requested_at        timestamptz not null default now(),
  verify_sent_at      timestamptz,
  verify_tries        int  not null default 0,
  created_at          timestamptz not null default now()
);

comment on table notify_email is
  'Benachrichtigungs-Adresse je Lehrkraft (0202). Nur @mps-ki.de. Erst nach Klick auf den '
  'Bestätigungslink (verified_at) gehen Mails an sie. stop_token: Abmelde-Link in jeder Mail.';
alter table notify_email enable row level security;


create table if not exists pa_room_notify (
  room_id uuid not null references skill_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  primary key (room_id, user_id)
);

comment on table pa_room_notify is
  'Projektarbeit (0202): will diese Lehrkraft für diesen Raum Mails bei neuen Anträgen?';
alter table pa_room_notify enable row level security;


create table if not exists pa_mail_outbox (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  group_id   uuid not null references pa_groups(id) on delete cascade,
  item_id    text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts   int  not null default 0,
  sent_at    timestamptz,
  note       text
);

comment on table pa_mail_outbox is
  'Projektarbeit (0202): Anträge, über die noch eine Mail gehen soll. sent_at gesetzt = erledigt '
  '(note: gesendet / erledigt / kein_empfaenger / fehler: …). Erledigte bleiben 30 Tage stehen.';
-- Je Antrag höchstens eine wartende Zeile: Ändern vor dem Versand
-- erzeugt keine zweite Mail.
create unique index if not exists pa_mail_outbox_wait_uq
  on pa_mail_outbox (group_id, item_id) where sent_at is null;
create index if not exists pa_mail_outbox_room_idx on pa_mail_outbox (room_id) where sent_at is null;
alter table pa_mail_outbox enable row level security;


create table if not exists notify_mail_log (
  user_id uuid not null,
  sent_at timestamptz not null default now()
);

comment on table notify_mail_log is
  'Verschickte Antrags-Mails je Lehrkraft (0202) — nur für die Bremse „10 je Stunde". '
  'Wird nach 2 Tagen gelöscht.';
create index if not exists notify_mail_log_idx on notify_mail_log (user_id, sent_at);
alter table notify_mail_log enable row level security;


create table if not exists mail_settings (
  id              boolean primary key default true check (id),
  dispatch_url    text not null default '',
  dispatch_secret text not null default ''
);

comment on table mail_settings is
  'Eine Zeile (0202): wohin mail_kick() ruft (…/api/mail_dispatch) und mit welchem Geheimnis. '
  'Kein Grant — nur Funktionen und der SQL-Editor lesen sie.';
alter table mail_settings enable row level security;
insert into mail_settings (id) values (true) on conflict (id) do nothing;


-- ─────────────────────────────────────────────────────────────
-- 2) Bausteine
-- ─────────────────────────────────────────────────────────────
-- Die Lehrkräfte eines Raums. Heute: der Besitzer. Hier — und nur
-- hier — kommen später weitere Lehrkräfte dazu.
create or replace function pa_room_teachers(p_room uuid)
  returns setof uuid
  security definer
  set search_path = public
  language sql
  stable
as $$
  select owner_id from skill_rooms where id = p_room and owner_id is not null;
$$;

revoke all on function pa_room_teachers(uuid) from public;


-- Wer in diesem Raum gerade eine Mail bekäme (bestätigt + Haken).
create or replace function pa_room_mail_targets(p_room uuid)
  returns table (user_id uuid, email text, stop_token text)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select e.user_id, e.email, e.stop_token
    from pa_room_teachers(p_room) t(uid)
    join pa_room_notify n on n.room_id = p_room and n.user_id = t.uid and n.enabled
    join notify_email e on e.user_id = t.uid and e.verified_at is not null;
$$;

revoke all on function pa_room_mail_targets(uuid) from public;


-- Gibt es gerade etwas zu verschicken?
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
                 having min(o.created_at) <= now() - interval '5 minutes');
$$;

revoke all on function mail_due() from public;


-- Den Versand anstoßen: nur wenn etwas fällig ist, pg_net da ist und
-- mail_settings ausgefüllt sind. pg_net schickt erst nach dem Commit
-- und wartet nicht auf die Antwort — der Aufrufer bleibt schnell.
create or replace function mail_kick()
  returns boolean
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_s mail_settings;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return false;
  end if;
  select * into v_s from mail_settings where id;
  if coalesce(v_s.dispatch_url, '') = '' or coalesce(v_s.dispatch_secret, '') = '' then
    return false;
  end if;
  if not mail_due() then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 25000)'
    using v_s.dispatch_url, '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json',
                             'Authorization', 'Bearer ' || v_s.dispatch_secret);
  return true;
end;
$$;

revoke all on function mail_kick() from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Trigger: ein Antrag wird offen
-- ─────────────────────────────────────────────────────────────
-- Nur Schüler (updated_by gesetzt) — was die Lehrkraft selbst
-- einträgt, muss ihr niemand mitteilen. Nur der Wechsel auf „offen":
-- neu gestellt, oder abgelehnt → überarbeitet neu abgeschickt.
create or replace function pa_items_mail()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.kind <> 'request' or new.updated_by is null then
    return null;
  end if;
  if coalesce(new.data->>'status', 'open') <> 'open' then
    return null;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.data->>'status', 'open') = 'open' then
    return null;
  end if;
  -- Will niemand Mails, gibt es auch nichts aufzuheben.
  if not exists (select 1 from pa_room_mail_targets(new.room_id)) then
    return null;
  end if;
  insert into pa_mail_outbox (room_id, group_id, item_id)
  values (new.room_id, new.group_id, new.item_id)
  on conflict (group_id, item_id) where sent_at is null do nothing;
  return null;
end;
$$;

revoke all on function pa_items_mail() from public;

create or replace trigger pa_items_mail_trg
  after insert or update on pa_items
  for each row execute function pa_items_mail();


-- ─────────────────────────────────────────────────────────────
-- 4) Lehrkraft: Adresse und Haken (im Raum, Übersicht → 🔔)
-- ─────────────────────────────────────────────────────────────
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
    'domain',   'mps-ki.de',
    'email',    v_e.email,
    'verified', v_e.verified_at is not null,
    'pending',  v_e.user_id is not null and v_e.verified_at is null,
    'enabled',  coalesce((select enabled from pa_room_notify
                           where room_id = v_room.id and user_id = auth.uid()), false));
end;
$$;

revoke all on function pa_room_notify_get(text) from public;
grant execute on function pa_room_notify_get(text) to authenticated;


-- p_email: null = Adresse nicht anfassen, '' = Adresse löschen (keine
-- Mails mehr, in keinem Raum), sonst neue Adresse (muss bestätigt
-- werden). p_on: null = Haken nicht anfassen. p_resend: die
-- Bestätigungsmail noch einmal schicken (frühestens nach 2 Minuten).
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
  v_e    notify_email;
  v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_e from notify_email where user_id = v_uid;

  if p_email is not null and v_mail = '' then
    delete from notify_email where user_id = v_uid;
  elsif p_email is not null and v_mail is distinct from v_e.email then
    if v_mail !~ '@mps-ki\.de$' then
      return jsonb_build_object('ok', false, 'error', 'email_domain');
    end if;
    if char_length(v_mail) > 120 or v_mail !~ '^[a-z0-9][a-z0-9._%+-]*@mps-ki\.de$' then
      return jsonb_build_object('ok', false, 'error', 'email_invalid');
    end if;
    -- Keine Mail-Kanone: höchstens eine neue Adresse je Minute.
    if v_e.user_id is not null and v_e.requested_at > now() - interval '1 minute' then
      return jsonb_build_object('ok', false, 'error', 'too_soon');
    end if;
    insert into notify_email (user_id, email, verify_token, stop_token)
    values (v_uid, v_mail, encode(gen_random_bytes(24), 'hex'), encode(gen_random_bytes(24), 'hex'))
    on conflict (user_id) do update
      set email = excluded.email, verify_token = excluded.verify_token,
          stop_token = excluded.stop_token, verified_at = null, requested_at = now(),
          verify_sent_at = null, verify_tries = 0;
  elsif p_resend and v_e.user_id is not null and v_e.verified_at is null then
    if v_e.requested_at > now() - interval '2 minutes' then
      return jsonb_build_object('ok', false, 'error', 'too_soon');
    end if;
    update notify_email set requested_at = now(), verify_sent_at = null, verify_tries = 0
     where user_id = v_uid;
  end if;

  if p_on is not null then
    insert into pa_room_notify (room_id, user_id, enabled) values (v_room.id, v_uid, p_on)
    on conflict (room_id, user_id) do update set enabled = excluded.enabled;
  end if;

  -- Bestätigungsmail sofort anstoßen statt erst mit dem nächsten
  -- Minutentakt. Geht das schief, holt es der Takt nach.
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
-- 5) Links aus der Mail (api/notify_email.js, service_role)
-- ─────────────────────────────────────────────────────────────
create or replace function notify_email_verify(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_e notify_email;
begin
  select * into v_e from notify_email where verify_token = p_token;
  if v_e.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_e.verified_at is null then
    update notify_email set verified_at = now() where user_id = v_e.user_id;
  end if;
  return jsonb_build_object('ok', true, 'email', v_e.email, 'already', v_e.verified_at is not null);
end;
$$;

revoke all on function notify_email_verify(text) from public;
grant execute on function notify_email_verify(text) to service_role;


-- Abmelden: die Adresse ist weg, in allen Räumen. Wer wieder Mails
-- will, trägt sie im Raum neu ein.
create or replace function notify_email_stop(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_mail text;
begin
  delete from notify_email where stop_token = p_token returning email into v_mail;
  if v_mail is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'email', v_mail);
end;
$$;

revoke all on function notify_email_stop(text) from public;
grant execute on function notify_email_stop(text) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 6) Versand (api/mail_dispatch.js, service_role)
-- ─────────────────────────────────────────────────────────────
-- Holt, was jetzt zu verschicken ist, und markiert es als „in Arbeit"
-- (claimed_at). Bleibt ein Lauf hängen, ist die Markierung nach 10
-- Minuten verfallen und der nächste Lauf nimmt es wieder.
--   { ok, verify: [ {user_id, email, token, stop} ],
--         rooms:  [ {ids, room_code, room_title, items: [{group, date, resent}],
--                    to: [{user_id, email, stop}]} ] }
create or replace function pa_mail_claim()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_verify jsonb;
  v_rooms  jsonb := '[]'::jsonb;
  r        record;
  v_room   skill_rooms;
  v_ids    bigint[];
  v_items  jsonb;
  v_to     jsonb;
begin
  -- Zwei Läufe gleichzeitig (Minutentakt + Anstoß aus dem Raum)
  -- dürfen nicht dieselben Zeilen nehmen.
  if not pg_try_advisory_xact_lock(202202) then
    return jsonb_build_object('ok', true, 'verify', '[]'::jsonb, 'rooms', '[]'::jsonb);
  end if;

  delete from notify_mail_log where sent_at < now() - interval '2 days';
  delete from pa_mail_outbox where sent_at < now() - interval '30 days';

  with c as (
    update notify_email set verify_sent_at = now(), verify_tries = verify_tries + 1
     where verified_at is null and verify_sent_at is null and verify_tries < 3
    returning user_id, email, verify_token, stop_token)
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'email', email,
                                               'token', verify_token, 'stop', stop_token)), '[]'::jsonb)
    into v_verify from c;

  for r in
    select o.room_id from pa_mail_outbox o
     where o.sent_at is null
       and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
     group by o.room_id
    having min(o.created_at) <= now() - interval '5 minutes'
     limit 50
  loop
    select * into v_room from skill_rooms where id = r.room_id;

    -- Inzwischen entschieden, gelöscht oder Raum abgelaufen: keine Mail.
    update pa_mail_outbox o set sent_at = now(), note = 'erledigt'
     where o.room_id = r.room_id and o.sent_at is null
       and (v_room.expires_at <= now()
            or not exists (select 1 from pa_items i
                            where i.group_id = o.group_id and i.kind = 'request' and i.item_id = o.item_id
                              and coalesce(i.data->>'status', 'open') = 'open'));

    select array_agg(o.id order by o.created_at),
           jsonb_agg(jsonb_build_object(
             'group',  case when g.name <> '' then g.name else 'Einzelarbeit' end,
             'date',   i.data->>'date',
             'resent', i.data ? 'prevDecision') order by i.data->>'date', o.created_at)
      into v_ids, v_items
      from pa_mail_outbox o
      join pa_groups g on g.id = o.group_id
      join pa_items i on i.group_id = o.group_id and i.kind = 'request' and i.item_id = o.item_id
     where o.room_id = r.room_id and o.sent_at is null
       and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes');
    if v_ids is null then
      continue;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'email', t.email, 'stop', t.stop_token)), '[]'::jsonb)
      into v_to
      from pa_room_mail_targets(r.room_id) t
     where (select count(*) from notify_mail_log l
             where l.user_id = t.user_id and l.sent_at > now() - interval '1 hour') < 10;

    if jsonb_array_length(v_to) = 0 then
      update pa_mail_outbox set sent_at = now(), note = 'kein_empfaenger' where id = any(v_ids);
      continue;
    end if;

    update pa_mail_outbox set claimed_at = now(), attempts = attempts + 1 where id = any(v_ids);
    v_rooms := v_rooms || jsonb_build_array(jsonb_build_object(
      'ids', to_jsonb(v_ids), 'room_code', v_room.code, 'room_title', v_room.title,
      'items', v_items, 'to', v_to));
  end loop;

  return jsonb_build_object('ok', true, 'verify', v_verify, 'rooms', v_rooms);
end;
$$;

revoke all on function pa_mail_claim() from public;
grant execute on function pa_mail_claim() to service_role;


-- Ergebnis zurückmelden:
--   { verify: [ {user_id, ok} ],
--     rooms:  [ {ids, ok, sent_to: [user_id…], error} ] }
-- ok = an mindestens einen Empfänger raus. Sonst: beim nächsten Lauf
-- noch einmal, nach dem dritten Versuch aufgeben.
create or replace function pa_mail_done(p_res jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v   jsonb;
  ids bigint[];
begin
  for v in select * from jsonb_array_elements(coalesce(p_res->'verify', '[]'::jsonb)) loop
    if not coalesce((v->>'ok')::boolean, false) then
      update notify_email set verify_sent_at = null
       where user_id = (v->>'user_id')::uuid and verified_at is null;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(p_res->'rooms', '[]'::jsonb)) loop
    select coalesce(array_agg(x::bigint), '{}') into ids from jsonb_array_elements_text(v->'ids') x;
    if coalesce((v->>'ok')::boolean, false) then
      update pa_mail_outbox
         set sent_at = now(),
             note = case when coalesce(v->>'error', '') = '' then 'gesendet'
                         else left('gesendet, teils fehler: ' || (v->>'error'), 300) end
       where id = any(ids) and sent_at is null;
      insert into notify_mail_log (user_id)
      select x::uuid from jsonb_array_elements_text(coalesce(v->'sent_to', '[]'::jsonb)) x;
    else
      update pa_mail_outbox
         set note       = left('fehler: ' || coalesce(v->>'error', '?'), 300),
             claimed_at = null,
             sent_at    = case when attempts >= 3 then now() else null end
       where id = any(ids) and sent_at is null;
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_mail_done(jsonb) from public;
grant execute on function pa_mail_done(jsonb) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 7) Minutentakt
-- ─────────────────────────────────────────────────────────────
-- Wie 0081: prüfen statt voraussetzen. Wir versuchen, pg_net und
-- pg_cron einzuschalten; geht das nicht (fehlende Rechte, pglite),
-- läuft die Migration trotzdem durch.
do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'Antrags-Mail: pg_net nicht verfügbar (%). Im Dashboard aktivieren und diese Migration erneut ausführen.', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Antrags-Mail: pg_cron nicht verfügbar (%).', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'pa_mail_dispatch') then
      perform cron.unschedule('pa_mail_dispatch');
    end if;
    perform cron.schedule('pa_mail_dispatch', '* * * * *', $job$select mail_kick();$job$);
    raise notice 'Antrags-Mail: Minutentakt eingerichtet.';
  else
    raise notice 'Antrags-Mail: pg_cron nicht aktiv — es werden keine Mails angestoßen. '
                 'Erweiterung aktivieren und diese Migration erneut ausführen.';
  end if;
end $$;
