-- ══════════════════════════════════════════════════════════════
-- Migration 0234 — Definitions Derby: Lernstand im Konto
-- ══════════════════════════════════════════════════════════════
-- Etappe 1 (0233) hielt den Lernstand (unsicher/teilweise/sicher je
-- Karte) nur im Gerät. Wer ein Konto hat, bekommt ihn jetzt auf jedem
-- Gerät wieder; Gäste ohne Konto bleiben beim Gerät.
--
--   dd_progress (user_id, stack_id) → data   { "<kartenId>": {"l":0-3,"s":n,"t":ms} }
--                                    sum    { "n": Karten, "c": [neu, unsicher, teilweise, sicher] }
--
--   · l 0 heißt „zurück auf neu“ (Grabstein, damit ein älterer Stand auf
--     einem anderen Gerät es nicht wieder aufweckt); das Zusammenführen
--     je Karte macht der Client (die neuere Zeit t gewinnt).
--   · Die Zeile hängt am Konto UND am Stapel (beides on delete cascade).
--     Wer das Konto ein Jahr nicht benutzt, verliert sie mit den übrigen
--     Inhalten (account_reset_content, 0209 — dd_progress wird dort über
--     den Fremdschlüssel automatisch erfasst).
--
-- Wer darf schreiben/lesen? Nur das eigene Konto, und nur für Stapel, an
-- die man herankommt: die eigenen (Lehrkraft) oder einen, der im Raum des
-- Teilnehmers geteilt ist.
--   Lehrkraft    dd_prog_get/put/list(p_code, …)    → auth.uid()
--   Teilnehmer   dd_mprog_get/put/list(p_token, …)  → der Token führt zum
--                Teilnehmer; ohne Konto (user_id null) → 'no_account', und
--                das Tablet bleibt beim lokalen Speicher.
--
-- Außerdem: dd_stacks gehören zum Unterrichtsmaterial der Lehrkraft und
-- werden beim 1-Jahres-Reset NICHT geleert (wie vocab_sets) — account_
-- reset_content bekommt die Ausnahme (sonst verlöre eine Lehrkraft nach
-- einem Jahr ohne Anmeldung alle Stapel).
--
-- Nur RPCs, keine Grants auf die Tabelle. Kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════


create table if not exists dd_progress (
  user_id    uuid not null references profiles(id) on delete cascade,
  stack_id   uuid not null references dd_stacks(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  sum        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, stack_id),
  constraint dd_progress_data_obj  check (jsonb_typeof(data) = 'object'),
  constraint dd_progress_data_size check (octet_length(data::text) <= 60000),
  constraint dd_progress_sum_size  check (octet_length(sum::text) <= 400)
);

comment on table dd_progress is
  'Definitions Derby: Lernstand einer Person je Stapel (Karten-id → Stufe), nur mit Konto. Seit 0234.';

alter table dd_progress enable row level security;


-- ─────────────────────────────────────────────────────────────
-- Kern: Zugriff prüfen, holen, schreiben, listen
-- ─────────────────────────────────────────────────────────────
-- Darf diese Person Lernstand zu diesem Stapel führen? Eigener Stapel, oder
-- p_room (aus dem Token) hat ihn geteilt. Ohne p_room nur der eigene.
create or replace function dd_prog_can(p_uid uuid, p_stack uuid, p_room uuid)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select exists (select 1 from dd_stacks s where s.id = p_stack and s.owner_id = p_uid)
      or (p_room is not null
          and dd_shared_entry(p_room, p_stack::text) is not null
          and exists (select 1 from dd_stacks s
                       where s.id = p_stack and skill_room_is_teacher(p_room, s.owner_id)));
$$;

revoke all on function dd_prog_can(uuid, uuid, uuid) from public, anon, authenticated;


create or replace function dd_prog_get_core(p_uid uuid, p_stack uuid, p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v dd_progress;
begin
  if not dd_prog_can(p_uid, p_stack, p_room) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v from dd_progress where user_id = p_uid and stack_id = p_stack;
  return jsonb_build_object('ok', true, 'data', coalesce(v.data, '{}'::jsonb),
                            'updated_at', v.updated_at);
end;
$$;

revoke all on function dd_prog_get_core(uuid, uuid, uuid) from public, anon, authenticated;


create or replace function dd_prog_put_core(p_uid uuid, p_stack uuid, p_room uuid, p_data jsonb, p_sum jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if p_sum is null or jsonb_typeof(p_sum) <> 'object' then p_sum := '{}'::jsonb; end if;
  if octet_length(p_data::text) > 60000 or octet_length(p_sum::text) > 400 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;
  if not dd_prog_can(p_uid, p_stack, p_room) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from dd_progress where user_id = p_uid and stack_id = p_stack)
     and (select count(*) from dd_progress where user_id = p_uid) >= 300 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', 300);
  end if;
  insert into dd_progress (user_id, stack_id, data, sum, updated_at)
  values (p_uid, p_stack, p_data, p_sum, now())
  on conflict (user_id, stack_id) do update
    set data = excluded.data, sum = excluded.sum, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dd_prog_put_core(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;


-- Zusammenfassungen (für die Balken auf den Stapelkacheln) aller Stapel, an
-- die die Person noch herankommt.
create or replace function dd_prog_list_core(p_uid uuid, p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.stack_id, 'sum', g.sum,
                                        't', (extract(epoch from g.updated_at) * 1000)::bigint))
      from dd_progress g
     where g.user_id = p_uid and dd_prog_can(p_uid, g.stack_id, p_room)), '[]'::jsonb));
$$;

revoke all on function dd_prog_list_core(uuid, uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Lehrkraft (angemeldet): p_code kommt von presenterActions mit, ist hier
-- ohne Bedeutung — der Lernstand gehört der Person, nicht dem Raum.
-- ─────────────────────────────────────────────────────────────
create or replace function dd_prog_get(p_code text, p_stack uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  return dd_prog_get_core(auth.uid(), p_stack, null);
end;
$$;

create or replace function dd_prog_put(p_code text, p_stack uuid, p_data jsonb, p_sum jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  return dd_prog_put_core(auth.uid(), p_stack, null, p_data, p_sum);
end;
$$;

create or replace function dd_prog_list(p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  return dd_prog_list_core(auth.uid(), null);
end;
$$;

revoke all on function dd_prog_get(text, uuid) from public;
revoke all on function dd_prog_put(text, uuid, jsonb, jsonb) from public;
revoke all on function dd_prog_list(text) from public;
grant execute on function dd_prog_get(text, uuid) to authenticated;
grant execute on function dd_prog_put(text, uuid, jsonb, jsonb) to authenticated;
grant execute on function dd_prog_list(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Teilnehmer (Token): nur mit Konto
-- ─────────────────────────────────────────────────────────────
create or replace function dd_mprog_get(p_token text, p_stack uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v record;
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).user_id is null then return jsonb_build_object('ok', false, 'error', 'no_account'); end if;
  return dd_prog_get_core((v.p).user_id, p_stack, (v.room).id);
end;
$$;

create or replace function dd_mprog_put(p_token text, p_stack uuid, p_data jsonb, p_sum jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v record;
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).user_id is null then return jsonb_build_object('ok', false, 'error', 'no_account'); end if;
  return dd_prog_put_core((v.p).user_id, p_stack, (v.room).id, p_data, p_sum);
end;
$$;

create or replace function dd_mprog_list(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v record;
begin
  select * into v from dd_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if (v.p).user_id is null then return jsonb_build_object('ok', false, 'error', 'no_account'); end if;
  return dd_prog_list_core((v.p).user_id, (v.room).id);
end;
$$;

revoke all on function dd_mprog_get(text, uuid) from public;
revoke all on function dd_mprog_put(text, uuid, jsonb, jsonb) from public;
revoke all on function dd_mprog_list(text) from public;
grant execute on function dd_mprog_get(text, uuid) to anon, authenticated;
grant execute on function dd_mprog_put(text, uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function dd_mprog_list(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 1-Jahres-Reset: dd_stacks bleiben (Unterrichtsmaterial), dd_progress geht
-- ─────────────────────────────────────────────────────────────
-- Unverändert gegenüber 0209 bis auf EINEN Eintrag in der Ausnahmeliste.
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
            'vocab_sets', 'vocab_units', 'synir_scenarios',
            'dd_stacks')
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
  'Löscht alle Inhalte eines Kontos außer Profil, Highscores und Unterrichtsmaterial (0209, 0234: dd_stacks bleiben).';
