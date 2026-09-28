-- ══════════════════════════════════════════════════════════════
-- Migration 0180 — SYNIR im Raum
-- ══════════════════════════════════════════════════════════════
-- Achter Skill, zweiter eingerahmter mit echtem Raumzustand nach
-- Wild Clusters (0129). SYNIR ist ein Netzwerksimulator: jedes Kind
-- baut an seinem eigenen Netz, die Lehrkraft entscheidet, welche
-- Szenarien die Klasse bekommt.
--
-- ── Was die generische Schicht schon kann ─────────────────────
-- skill_room_state.data trägt, was die Lehrkraft an alle schickt:
--
--   { "shared": [ { "id": "builtin:zwei", "t": "1 · Zwei Endgeräte" },
--                 { "id": "<uuid>",       "t": "Mein Routing" } ],
--     "blind":  false }
--
-- `shared` sind die freigegebenen Szenarien (id + Titel, damit das
-- Tablet die Liste ohne zweiten Aufruf zeigen kann), `blind` legt den
-- Schleier über jedes Tablet. Beides schreibt tool.js über
-- skill_room_set_state — die 8 KB dort reichen für jede Liste, die
-- eine Stunde braucht.
--
-- ── Was sie NICHT kann, und deshalb steht es hier ─────────────
-- 1) Eigene Szenarien, die den Raum überleben. Sie hängen an der
--    Lehrkraft (synir_scenarios), nicht am Raum — wie die Kataloge von
--    Knowledge Stack (0174). „Öffentlich" sind nur die mitgelieferten;
--    die stehen in tools/synir/js/szenarien.js und brauchen keine Zeile
--    (id „builtin:<schlüssel>").
--
-- 2) Der Stand eines Kindes für die Spiegelung auf den Beamer. Ein
--    Netz ist schnell größer als die 4 KB, die skill_entry_upsert
--    zulässt — deshalb eine eigene Tabelle mit eigenem Deckel
--    (300 KB). Eine Zeile je Gerät, überschrieben bei jeder Änderung.
--
-- Kein DROP — idempotent per `if not exists` / `create or replace` /
-- `on conflict` (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Registry
-- ─────────────────────────────────────────────────────────────
-- limits: eine Phase (die Stunde wird über `shared` gesteuert, nicht
-- über Phasen), KEIN max_entries — Beiträge benutzt SYNIR nicht.
insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('synir', 'SYNIR',
   'Netzwerke bauen und beobachten: Geräte verkabeln, Adressen vergeben, Pakete fliegen sehen. Die Lehrkraft gibt Szenarien frei und holt einzelne Netze auf den Beamer.',
   '🌐', 'synir', 'Informatik', true,
   '{"phases":1}'::jsonb, true, 60)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;


-- ─────────────────────────────────────────────────────────────
-- 2) Eigene Szenarien der Lehrkraft
-- ─────────────────────────────────────────────────────────────
create table if not exists synir_scenarios (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  title       text not null,
  aufgabe     text not null default '',
  netz        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint synir_scenarios_title_len   check (char_length(title) between 1 and 80),
  constraint synir_scenarios_aufgabe_len check (octet_length(aufgabe) <= 20000)
);

comment on table synir_scenarios is
  'Eigene SYNIR-Szenarien einer Lehrkraft (Netz + Aufgabentext). Überleben den Raum. '
  'Die mitgelieferten stehen im Code (tools/synir/js/szenarien.js), nicht hier.';

create index if not exists synir_scenarios_owner_idx on synir_scenarios(owner_id, updated_at desc);

alter table synir_scenarios enable row level security;
-- Keine Policy: gelesen und geschrieben wird nur über die Funktionen
-- unten. Ein direkter Zugriff über PostgREST sieht nichts.


-- ─────────────────────────────────────────────────────────────
-- 3) Stand je Gerät (für die Spiegelung)
-- ─────────────────────────────────────────────────────────────
create table if not exists synir_work (
  participant_id uuid primary key references skill_participants(id) on delete cascade,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  stand          jsonb not null,
  updated_at     timestamptz not null default now()
);

comment on table synir_work is
  'Der jeweils letzte Stand eines Tablets in einem SYNIR-Raum. Nur für die Spiegelung '
  'auf den Beamer — die Arbeit selbst liegt auf dem Gerät und in der Datei auf dem PC.';

create index if not exists synir_work_room_idx on synir_work(room_id);

alter table synir_work enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 4) Lehrkraft: eigene Szenarien
-- ─────────────────────────────────────────────────────────────
-- Alle vier nehmen p_code mit, weil presenterActions.call ihn an
-- jeden Aufruf hängt (lib/tool.js). Gebraucht wird er nicht: ein
-- Szenario gehört der Person, nicht dem Raum.

create or replace function synir_scenarios_list(p_code text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'updated_at', s.updated_at)
                     order by s.updated_at desc)
      from synir_scenarios s where s.owner_id = v_user), '[]'::jsonb));
end;
$$;

revoke all on function synir_scenarios_list(text) from public;
grant execute on function synir_scenarios_list(text) to authenticated;


create or replace function synir_scenario_get(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_s    synir_scenarios;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_s from synir_scenarios where id = p_id and owner_id = v_user;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_s.id, 'title', v_s.title,
                            'aufgabe', v_s.aufgabe, 'netz', v_s.netz);
end;
$$;

revoke all on function synir_scenario_get(text, uuid) from public;
grant execute on function synir_scenario_get(text, uuid) to authenticated;


-- Anlegen (p_id null) oder ein EIGENES überschreiben. 100 je Person:
-- genug für jedes Schuljahr, und ein Deckel gegen eine Schleife im
-- Browser, die bei jedem Tastendruck speichert.
create or replace function synir_scenario_save(
  p_code    text,
  p_id      uuid,
  p_title   text,
  p_aufgabe text,
  p_netz    jsonb
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_id    uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if char_length(v_title) not between 1 and 80
     or p_netz is null or jsonb_typeof(p_netz) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if octet_length(coalesce(p_aufgabe, '')) > 20000
     or octet_length(p_netz::text) > 300000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;

  if p_id is not null then
    update synir_scenarios
       set title = v_title, aufgabe = coalesce(p_aufgabe, ''), netz = p_netz, updated_at = now()
     where id = p_id and owner_id = v_user
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'created', false);
  end if;

  if (select count(*) from synir_scenarios where owner_id = v_user) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', 100);
  end if;

  insert into synir_scenarios (owner_id, title, aufgabe, netz)
  values (v_user, v_title, coalesce(p_aufgabe, ''), p_netz)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'created', true);
end;
$$;

revoke all on function synir_scenario_save(text, uuid, text, text, jsonb) from public;
grant execute on function synir_scenario_save(text, uuid, text, text, jsonb) to authenticated;


create or replace function synir_scenario_delete(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  delete from synir_scenarios where id = p_id and owner_id = v_user;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function synir_scenario_delete(text, uuid) from public;
grant execute on function synir_scenario_delete(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) Teilnehmer: ein freigegebenes eigenes Szenario holen
-- ─────────────────────────────────────────────────────────────
-- Drei Bedingungen, alle aus der Token-Auflösung und keine von außen:
-- die ID steht in `shared` DIESES Raums, und das Szenario gehört der
-- Lehrkraft DIESES Raums. Die zweite ist nicht doppelt gemoppelt —
-- ohne sie könnte eine Lehrkraft eine fremde ID in ihre Liste
-- schreiben und die Klasse ließe sie sich ausliefern.
create or replace function synir_shared_get(p_token text, p_id text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_data jsonb;
  v_s    synir_scenarios;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  select coalesce(data, '{}'::jsonb) into v_data from skill_room_state where room_id = v_room.id;
  if not exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(v_data->'shared') = 'array' then v_data->'shared' else '[]'::jsonb end) e
     where e->>'id' = p_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Kein gültiger uuid-Text (etwa „builtin:zwei"): das liefert das
  -- Tablet selbst aus, hier gibt es nichts zu holen.
  if p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_s from synir_scenarios
   where id = p_id::uuid and owner_id = v_room.owner_id;
  if v_s.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_s.id, 'title', v_s.title,
                            'aufgabe', v_s.aufgabe, 'netz', v_s.netz);
end;
$$;

revoke all on function synir_shared_get(text, text) from public;
grant execute on function synir_shared_get(text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) Teilnehmer: den eigenen Stand melden
-- ─────────────────────────────────────────────────────────────
-- Abgelehnt, solange der Bildschirm blind ist: der Schleier liegt im
-- Browser, und was im Browser liegt, lässt sich wegklicken. Die
-- Lehrkraft soll sich darauf verlassen können, dass vorne nichts
-- nachrutscht, während sie erklärt.
create or replace function synir_work_put(p_token text, p_stand jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_data jsonb;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  select coalesce(data, '{}'::jsonb) into v_data from skill_room_state where room_id = v_room.id;
  if coalesce((v_data->>'blind')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'blind');
  end if;
  if p_stand is null or jsonb_typeof(p_stand) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if octet_length(p_stand::text) > 300000 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;

  insert into synir_work (participant_id, room_id, stand, updated_at)
  values (v_p.id, v_room.id, p_stand, now())
  on conflict (participant_id) do update
    set stand = excluded.stand, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function synir_work_put(text, jsonb) from public;
grant execute on function synir_work_put(text, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Lehrkraft: wer hat einen Stand, und welchen
-- ─────────────────────────────────────────────────────────────
-- Die Liste ist klein (Name, Zeitpunkt, Größe) und wird am Beamer
-- alle paar Sekunden geholt; das Netz selbst nur für die eine
-- Person, die gerade vorne läuft — und nur, wenn es neuer ist als das,
-- was schon da ist (p_since).
create or replace function synir_work_list(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'participant', p.id,
             'name',        coalesce(p.name, 'Tablet ' || p.seat),
             'seat',        p.seat,
             'updated_at',  w.updated_at,
             'titel',       w.stand->>'titel',
             'geraete',     coalesce(jsonb_array_length(w.stand->'nodes'), 0))
           order by p.seat)
      from synir_work w join skill_participants p on p.id = w.participant_id
     where w.room_id = v_room.id), '[]'::jsonb));
end;
$$;

revoke all on function synir_work_list(text) from public;
grant execute on function synir_work_list(text) to authenticated;


create or replace function synir_work_get(
  p_code        text,
  p_participant uuid,
  p_since       timestamptz default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_w    synir_work;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_w from synir_work
   where participant_id = p_participant and room_id = v_room.id;
  if v_w.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_since is not null and v_w.updated_at <= p_since then
    return jsonb_build_object('ok', true, 'changed', false, 'updated_at', v_w.updated_at);
  end if;
  return jsonb_build_object('ok', true, 'changed', true,
                            'updated_at', v_w.updated_at, 'stand', v_w.stand);
end;
$$;

revoke all on function synir_work_get(text, uuid, timestamptz) from public;
grant execute on function synir_work_get(text, uuid, timestamptz) to authenticated;
