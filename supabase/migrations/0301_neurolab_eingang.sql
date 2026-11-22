-- ══════════════════════════════════════════════════════════════
-- Migration 0301 — NeuroLab: Netze an die Lehrkraft senden (Eingang)
-- ══════════════════════════════════════════════════════════════
-- In den Szenarien und in „Frei“ schicken Schüler ihr Netz an die
-- Lehrkraft. Die bekommt einen EINGANG (wie der Posteingang der Befehle
-- bei YourSozialNet): wer es gesendet hat, welches Szenario, wann – mit
-- „Zeigen“ (am Beamer ansehen) und „Löschen“ (nur aus ihrer Liste).
--
--   - Je Teilnehmer und Szenario eine Zeile: erneut senden überschreibt.
--   - Das Netz ist reiner Text (JSON: Schichten, Gewichte, Bias, Typen,
--     Eingaben, ggf. Eingabe-CSV). Der Server rechnet nichts damit.
--   - Grenzen: 300 KB je Netz, 400 Einträge je Raum.
--   - Alles hängt am Raum und geht mit ihm (CASCADE).
--   - Nur RPCs (security definer), keine Grants auf die Tabelle.
--
-- Prüfstand: supabase/tests/0301_neurolab_eingang.mjs
-- ══════════════════════════════════════════════════════════════

create table if not exists nl_inbox (
  id             bigint generated always as identity primary key,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  participant_id uuid not null references skill_participants(id) on delete cascade,
  from_name      text not null default '',
  scenario       text not null,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (participant_id, scenario),
  constraint nl_inbox_scenario check (scenario in ('gates', 'seg7', 'zielscheibe', 'voegel', 'custom')),
  constraint nl_inbox_size     check (octet_length(payload::text) <= 300000)
);
create index if not exists nl_inbox_room on nl_inbox (room_id, updated_at desc);
alter table nl_inbox enable row level security;

comment on table nl_inbox is
  'NeuroLab: von Schülern gesendete Netze = Eingang der Lehrkräfte des Raums. Nur über nl_send / nl_inbox_*. Seit 0301.';


-- Teilnehmer aus Token (nur NeuroLab-Räume)
create or replace function nl_part(
  p_token text,
  out p    skill_participants,
  out room skill_rooms,
  out err  text)
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
begin
  select * into p from skill_participants where token = p_token;
  if p.id is null then err := 'unknown_token'; return; end if;
  select * into room from skill_rooms where id = p.room_id;
  if room.id is null or room.expires_at <= now() then err := 'room_gone'; return; end if;
  if room.tool_id <> 'neurolab' then err := 'not_found'; return; end if;
  if p.blocked then err := 'blocked'; return; end if;
end;
$$;
revoke all on function nl_part(text) from public, anon, authenticated;


create or replace function nl_teacher_room(p_code text)
  returns skill_rooms
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms;
  v_none skill_rooms;
begin
  if auth.uid() is null then return v_none; end if;
  select * into v_room from skill_rooms
   where code = upper(btrim(coalesce(p_code, ''))) and tool_id = 'neurolab';
  if v_room.id is null or not skill_room_is_teacher(v_room.id, auth.uid()) then return v_none; end if;
  return v_room;
end;
$$;
revoke all on function nl_teacher_room(text) from public, anon, authenticated;


-- Schüler: Netz senden (überschreibt das letzte desselben Szenarios)
create or replace function nl_send(p_token text, p_scenario text, p_payload jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v record;
  v_n int;
begin
  select * into v from nl_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if coalesce(p_scenario, '') not in ('gates', 'seg7', 'zielscheibe', 'voegel', 'custom')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if octet_length(p_payload::text) > 300000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;
  if not exists (select 1 from nl_inbox where participant_id = (v.p).id and scenario = p_scenario) then
    select count(*) into v_n from nl_inbox where room_id = (v.room).id;
    if v_n >= 400 then return jsonb_build_object('ok', false, 'error', 'quota_exceeded'); end if;
  end if;
  insert into nl_inbox (room_id, participant_id, from_name, scenario, payload)
  values ((v.room).id, (v.p).id, coalesce((v.p).name, ''), p_scenario, p_payload)
  on conflict (participant_id, scenario) do update
    set payload = excluded.payload, from_name = excluded.from_name, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function nl_send(text, text, jsonb) from public;
grant execute on function nl_send(text, text, jsonb) to anon, authenticated;


-- Lehrkraft: Eingang (ohne Netze, nur Kopfdaten)
create or replace function nl_inbox_list(p_code text)
  returns jsonb
  security definer
  set search_path = public
  set timezone = 'Europe/Berlin'
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms := nl_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'from', i.from_name, 'scenario', i.scenario,
                                        'at', to_char(i.updated_at, 'DD.MM. HH24:MI'))
                     order by i.updated_at desc, i.id desc)
      from nl_inbox i where i.room_id = v_room.id), '[]'::jsonb));
end;
$$;
revoke all on function nl_inbox_list(text) from public;
grant execute on function nl_inbox_list(text) to authenticated;


-- Lehrkraft: ein Netz zum Zeigen holen
create or replace function nl_inbox_get(p_code text, p_id bigint)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_room skill_rooms := nl_teacher_room(p_code);
  i nl_inbox;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into i from nl_inbox where id = p_id and room_id = v_room.id;
  if i.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'from', i.from_name, 'scenario', i.scenario, 'payload', i.payload);
end;
$$;
revoke all on function nl_inbox_get(text, bigint) from public;
grant execute on function nl_inbox_get(text, bigint) to authenticated;


-- Lehrkraft: aus dem Eingang löschen (nur dort; der Schüler behält sein Netz)
create or replace function nl_inbox_delete(p_code text, p_id bigint)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := nl_teacher_room(p_code);
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  delete from nl_inbox where id = p_id and room_id = v_room.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function nl_inbox_delete(text, bigint) from public;
grant execute on function nl_inbox_delete(text, bigint) to authenticated;
