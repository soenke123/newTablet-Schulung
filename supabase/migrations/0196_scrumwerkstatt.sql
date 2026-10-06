-- ══════════════════════════════════════════════════════════════
-- Migration 0196 — Scrum Werkstatt im Raum
-- ══════════════════════════════════════════════════════════════
-- Neunter Skill. Ein Raum ist EIN Scrum-Team: die Lehrkraft öffnet
-- ihn, das Team tritt mit dem Code bei, und danach organisiert es
-- sich darin über Wochen selbst — Product Goal, Product Backlog,
-- Sprints, Board, Review/Retro, Archiv.
--
-- Der Prototyp (tools/ScrumWerkstatt/index.html) lief auf einem
-- Gerät und hielt den ganzen Stand als EIN JSON-Objekt im
-- localStorage. Hier bekommt er einen Server — und zwar nicht als
-- ein Block, sondern als eine Zeile je Objekt:
--
--   scrum_items   (room, kind, item_id) → data, version
--                 kind = 'product' | 'story' | 'sprint'
--
-- ── Warum Zeilen statt eines Blocks ───────────────────────────
-- Vier Tablets arbeiten gleichzeitig am selben Board. Als ein Block
-- gespeichert gewinnt, wer zuletzt speichert, und die Änderung der
-- anderen drei ist weg — ohne dass es jemand merkt. Je Zeile treffen
-- sich zwei Schreiber nur noch, wenn sie DIESELBE Karte im selben
-- Moment ändern. Dann entscheidet die Versionsnummer: der zweite
-- bekommt 'conflict' und den aktuellen Stand zurück, statt still zu
-- überschreiben.
--
-- scrum_save nimmt eine LISTE von Änderungen und schreibt sie ganz
-- oder gar nicht. „Sprint abschließen" fasst den Sprint und jede
-- offene Story an; halb abgeschlossen wäre schlimmer als gar nicht.
--
-- ── Mitglied oder Beobachter ──────────────────────────────────
-- Wer den Raum betritt, trägt (wie überall) seinen Namen ein und
-- wählt dann im Skill: Teammitglied oder Beobachter.
--   · Teammitglied: bekommt eine Kachel im Team (scrum_members) und
--     einen persönlichen Wiedereinstiegscode (recover_key, s. u.).
--     Rolle und Label werden im Reiter Team nachgetragen.
--   · Beobachter: liest nur. Kein Code — wer nur zuschaut, braucht
--     auf einem zweiten Gerät nur den Raum-Code und die offene Tür.
-- Ein Beobachter darf später noch Mitglied werden, umgekehrt nicht:
-- an einem Mitglied hängen Karten.
--
-- ── Der persönliche Wiedereinstiegscode ───────────────────────
-- Ohne Konto hängt ein Teilnehmer an seinem Token, und der liegt im
-- Gerät. Ein Wochenprojekt auf Klassensatz-Tablets braucht aber den
-- Weg zurück auf einem ANDEREN Gerät, auch bei geschlossener Tür.
-- Dafür: skill_participants.recover_key, 8 Zeichen aus dem Alphabet
-- der Raum-Codes (32^8 ≈ 10^12). Wer ihn eintippt, bekommt denselben
-- Platz (skill_room_return) — er ist ein zweiter Schlüssel zum
-- selben Token und deshalb genauso geheim:
--   · er steht nur in der eigenen Ansicht und bei der Lehrkraft,
--   · geprüft wird er ausschließlich über /api/skill_join (Rate-Limit
--     je IP) — skill_room_recover ist nur an service_role vergeben,
--     aus demselben Grund wie skill_room_peek (0079).
-- Die Spalte steht in der generischen Tabelle, weil sie nichts
-- Scrum-Eigenes ist: jeder spätere Skill mit Langzeitarbeit kann
-- denselben Rückweg nutzen.
--
-- ── Burndown ──────────────────────────────────────────────────
-- Der tägliche Stand (offene Story Points des laufenden Sprints)
-- lässt sich nachträglich nicht rekonstruieren. scrum_burndown
-- schreibt ihn deshalb bei JEDEM Lesen und Schreiben mit — eine
-- Zeile je Sprint und Tag (Europe/Berlin), die im Lauf des Tages
-- nachgeführt wird. Ein Tag, an dem niemand das Board öffnet, hat
-- keine Zeile; die Anzeige trägt dann den Vortag weiter.
--
-- ── Rechte ─────────────────────────────────────────────────────
-- In dieser Stufe bewusst schlicht: jedes Teammitglied darf alles
-- (Selbstorganisation), Beobachter und Lehrkraft lesen. Was Rollen
-- erzwingen sollen, ist eine eigene Entscheidung (TODO.md).
--
-- Kein DROP — Idempotenz per if not exists / create or replace
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Registry
-- ─────────────────────────────────────────────────────────────
-- max_rooms 30 statt 10 (0177): ein Raum ist hier EIN Team, und
-- zwei Kurse mit je sechs Teams sind schon zwölf. Im Insert und
-- NICHT im do-update — dieselbe Regel wie 0078: wer die Grenzen
-- später von Hand anpasst, soll sie beim nächsten Lauf behalten.
insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room,
                         max_participants, max_rooms, limits, active, sort_order) values
  ('scrum', 'Scrum Werkstatt',
   'Projektarbeit im Team nach Scrum: Product Goal, Backlog, Sprints und Board — '
   'jedes Team in seinem eigenen Raum, über Wochen.',
   '🗂️', 'ScrumWerkstatt', 'Fächerübergreifend', true,
   40, 30, '{}'::jsonb, true, 80)
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
-- 2) Persönlicher Wiedereinstiegscode (generisch)
-- ─────────────────────────────────────────────────────────────
alter table skill_participants
  add column if not exists recover_key text;

create unique index if not exists skill_participants_recover_key_idx
  on skill_participants(recover_key) where recover_key is not null;

comment on column skill_participants.recover_key is
  'Persönlicher Wiedereinstiegscode (0196), 8 Zeichen aus dem Alphabet der Raum-Codes. '
  'Ein zweiter Schlüssel zum selben Token: wer ihn kennt, kommt auf jedem Gerät auf denselben '
  'Platz zurück, auch bei geschlossener Tür. Vergeben vom Skill (bisher nur Scrum Werkstatt), '
  'geprüft nur über /api/skill_join (skill_room_recover).';

create or replace function skill_gen_recover_key()
  returns text
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  ALPHABET constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes  bytea;
  v_out    text;
  i        int;
begin
  -- Kollisionen sind bei 10^12 praktisch ausgeschlossen; die Schleife
  -- ist trotzdem da, weil der eindeutige Index sonst mit einer
  -- Fehlermeldung statt mit einem neuen Code antwortete.
  loop
    v_bytes := gen_random_bytes(8);
    v_out := '';
    for i in 0..7 loop
      v_out := v_out || substr(ALPHABET, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from skill_participants where recover_key = v_out);
  end loop;
  return v_out;
end;
$$;

revoke all on function skill_gen_recover_key() from public;

-- Rückweg über den Code. Nur service_role: der Aufruf läuft über
-- /api/skill_join, das Fehlversuche je IP zählt (siehe Kopf).
create or replace function skill_room_recover(p_key text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_key text := upper(regexp_replace(coalesce(p_key, ''), '[^0-9A-Za-z]', '', 'g'));
  v_p   skill_participants;
  v_res jsonb;
begin
  if v_key !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    return jsonb_build_object('ok', false, 'error', 'key_invalid');
  end if;
  select * into v_p from skill_participants where recover_key = v_key;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- Derselbe Rückweg wie nach dem Entfernen (0187): derselbe Platz,
  -- derselbe Token, auch bei geschlossenem Beitritt.
  v_res := skill_room_return(v_p.token);
  if (v_res->>'ok')::boolean is not true and v_res->>'error' = 'room_gone' then
    return jsonb_build_object('ok', false, 'error', 'room_expired');
  end if;
  return v_res;
end;
$$;

revoke all on function skill_room_recover(text) from public;
grant execute on function skill_room_recover(text) to service_role;

comment on function skill_room_recover(text) is
  'Wiedereinstieg mit dem persönlichen Code (0196). Antwortet wie skill_room_return '
  '(token, seat, name, room). Nur service_role — Aufruf über /api/skill_join (mode recover).';


-- ─────────────────────────────────────────────────────────────
-- 3) Tabellen
-- ─────────────────────────────────────────────────────────────
create table if not exists scrum_members (
  participant_id uuid primary key references skill_participants(id) on delete cascade,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  kind           text not null check (kind in ('member', 'observer')),
  role           text not null default 'dev' check (role in ('dev', 'po', 'sm')),
  label          text not null default '' check (char_length(label) <= 40),
  avatar         text check (avatar is null or octet_length(avatar) <= 60000),
  joined_at      timestamptz not null default now()
);

comment on table scrum_members is
  'Wer in einem Scrum-Raum wie dabei ist (0196): Teammitglied mit Rolle/Label/Avatar oder '
  'Beobachter. Fehlt die Zeile, hat der Teilnehmer noch nicht gewählt.';

create index if not exists scrum_members_room_idx on scrum_members(room_id);
alter table scrum_members enable row level security;


create table if not exists scrum_items (
  room_id    uuid not null references skill_rooms(id) on delete cascade,
  kind       text not null check (kind in ('product', 'story', 'sprint')),
  item_id    text not null check (item_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  data       jsonb not null,
  version    int  not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references skill_participants(id) on delete set null,
  primary key (room_id, kind, item_id)
);

comment on table scrum_items is
  'Der Stand eines Scrum-Teams, eine Zeile je Objekt (0196). data ist das Objekt aus dem '
  'Prototyp (Story, Sprint, Product), version die Grundlage der Konfliktprüfung in scrum_save.';

alter table scrum_items enable row level security;


-- Je Raum: fortlaufende Nummern (US-01, Sprint 1) und ein Zähler,
-- der bei jeder Änderung steigt — er IST die Signatur.
create table if not exists scrum_rooms (
  room_id    uuid primary key references skill_rooms(id) on delete cascade,
  seq_story  int    not null default 0,
  seq_sprint int    not null default 0,
  rev        bigint not null default 0
);

alter table scrum_rooms enable row level security;


create table if not exists scrum_burndown (
  room_id      uuid not null references skill_rooms(id) on delete cascade,
  sprint_id    text not null,
  day          date not null,
  open_points  int  not null,
  total_points int  not null,
  primary key (room_id, sprint_id, day)
);

comment on table scrum_burndown is
  'Täglicher Stand des laufenden Sprints (0196): offene und geplante Story Points. Wird bei '
  'jedem Lesen und Schreiben für den heutigen Tag (Europe/Berlin) nachgeführt.';

alter table scrum_burndown enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 4) Bausteine
-- ─────────────────────────────────────────────────────────────
create or replace function scrum_bump(p_room uuid)
  returns void
  security definer
  set search_path = public
  language sql
as $$
  insert into scrum_rooms (room_id, rev) values (p_room, 1)
  on conflict (room_id) do update set rev = scrum_rooms.rev + 1;
$$;

revoke all on function scrum_bump(uuid) from public;


-- Heutigen Stand jedes laufenden Sprints mitschreiben. Ein Sprint
-- „läuft", solange data.status = 'active' ist.
create or replace function scrum_log_burndown(p_room uuid)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_day date := (now() at time zone 'Europe/Berlin')::date;
begin
  insert into scrum_burndown (room_id, sprint_id, day, open_points, total_points)
  select p_room, sp.item_id, v_day,
         coalesce(sum(case when st.data->>'status' <> 'done'
                           then coalesce((st.data->>'points')::int, 0) end), 0),
         coalesce(sum(coalesce((st.data->>'points')::int, 0)), 0)
    from scrum_items sp
    left join scrum_items st
           on st.room_id = sp.room_id and st.kind = 'story'
          and st.data->>'sprint' = sp.item_id
   where sp.room_id = p_room and sp.kind = 'sprint'
     and sp.data->>'status' = 'active'
   group by sp.item_id
  on conflict (room_id, sprint_id, day) do update
    set open_points  = excluded.open_points,
        total_points = excluded.total_points;
end;
$$;

revoke all on function scrum_log_burndown(uuid) from public;


-- Der gemeinsame Teil von scrum_view und scrum_room_get. p_me ist der
-- fragende Teilnehmer (null für die Lehrkraft), p_keys sagt, ob die
-- Wiedereinstiegscodes aller Mitglieder mitkommen (nur Lehrkraft).
--
-- p_have: { "story:u3": 4, … } — was das Gerät schon hat. Für diese
-- Objekte kommt nur {kind,id,v} ohne data: die Bilder im Product Goal
-- sind schnell ein paar hundert Kilobyte, und die sollen nicht bei
-- jeder verschobenen Karte noch einmal über das WLAN.
create or replace function scrum_state_json(
  p_room uuid,
  p_me   uuid,
  p_keys boolean,
  p_have jsonb
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_have jsonb := case when jsonb_typeof(p_have) = 'object' then p_have else '{}'::jsonb end;
  v_cnt  scrum_rooms;
begin
  perform scrum_log_burndown(p_room);
  select * into v_cnt from scrum_rooms where room_id = p_room;

  return jsonb_build_object(
    'rev',     coalesce(v_cnt.rev, 0),
    'seq',     jsonb_build_object('story',  coalesce(v_cnt.seq_story, 0),
                                  'sprint', coalesce(v_cnt.seq_sprint, 0)),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',     p.id,
               'name',   skill_seat_name(p.name, p.seat),
               'role',   m.role,
               'label',  m.label,
               'avatar', m.avatar,
               'online', p.last_seen_at > now() - interval '90 seconds',
               'me',     p.id = p_me)
             || case when p_keys then jsonb_build_object('key', p.recover_key) else '{}'::jsonb end
             order by m.joined_at, p.seat)
        from scrum_members m join skill_participants p on p.id = m.participant_id
       where m.room_id = p_room and m.kind = 'member' and p.removed_at is null), '[]'::jsonb),
    'observers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',     p.id,
               'name',   skill_seat_name(p.name, p.seat),
               'online', p.last_seen_at > now() - interval '90 seconds',
               'me',     p.id = p_me)
             order by m.joined_at, p.seat)
        from scrum_members m join skill_participants p on p.id = m.participant_id
       where m.room_id = p_room and m.kind = 'observer' and p.removed_at is null), '[]'::jsonb),
    -- Wer drin ist, aber noch nicht gewählt hat — damit das Team sieht,
    -- dass da noch jemand an der Tür steht.
    'undecided', coalesce((
      select jsonb_agg(skill_seat_name(p.name, p.seat) order by p.seat)
        from skill_participants p
       where p.room_id = p_room and p.removed_at is null
         and not exists (select 1 from scrum_members m where m.participant_id = p.id)), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(
               case when (v_have->>(i.kind || ':' || i.item_id)) = i.version::text
                    then jsonb_build_object('kind', i.kind, 'id', i.item_id, 'v', i.version)
                    else jsonb_build_object('kind', i.kind, 'id', i.item_id, 'v', i.version,
                                            'data', i.data)
               end order by i.kind, i.item_id)
        from scrum_items i where i.room_id = p_room), '[]'::jsonb),
    'burndown', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sprint', b.sprint_id, 'day', b.day,
               'open', b.open_points, 'total', b.total_points)
             order by b.sprint_id, b.day)
        from scrum_burndown b where b.room_id = p_room), '[]'::jsonb)
  );
end;
$$;

revoke all on function scrum_state_json(uuid, uuid, boolean, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 5) Teilnehmer: Signatur und Ansicht
-- ─────────────────────────────────────────────────────────────
-- Die Signatur ändert sich bei jeder Schreibaktion (rev) und wenn
-- jemand den Raum betritt oder verlässt (Zahl der Plätze). Anwesenheit
-- (online) steht absichtlich NICHT darin — sie wechselt zu oft, und
-- der Punkt an einer Kachel ist keinen vollen Abruf wert.
create or replace function scrum_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  return jsonb_build_object('ok', true, 'sig',
    coalesce((select rev from scrum_rooms where room_id = v_room.id), 0)::text || ':' ||
    (select count(*) from skill_participants where room_id = v_room.id and removed_at is null)::text || ':' ||
    (select count(*) from scrum_members where room_id = v_room.id)::text || ':' ||
    v_room.join_open::text || ':' ||
    (now() at time zone 'Europe/Berlin')::date::text);
end;
$$;

revoke all on function scrum_sig(text) from public;
grant execute on function scrum_sig(text) to anon, authenticated;


create or replace function scrum_view(p_token text, p_have jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_m    scrum_members;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  select * into v_m from scrum_members where participant_id = v_p.id;

  return jsonb_build_object(
    'ok',   true,
    'role', 'participant',
    'room', jsonb_build_object('title', v_room.title, 'join_open', v_room.join_open),
    'me',   jsonb_build_object(
              'id',      v_p.id,
              'name',    skill_seat_name(v_p.name, v_p.seat),
              'kind',    v_m.kind,
              'blocked', v_p.blocked,
              -- Der eigene Code, und nur der eigene. Ein Beobachter
              -- hat keinen (siehe Kopf).
              'key',     case when v_m.kind = 'member' then v_p.recover_key end)
  ) || scrum_state_json(v_room.id, v_p.id, false, p_have);
end;
$$;

revoke all on function scrum_view(text, jsonb) from public;
grant execute on function scrum_view(text, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) Teilnehmer: Mitglied oder Beobachter
-- ─────────────────────────────────────────────────────────────
create or replace function scrum_enter(p_token text, p_kind text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_m    scrum_members;
  v_key  text;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id for update;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  if p_kind not in ('member', 'observer') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select * into v_m from scrum_members where participant_id = v_p.id;
  if v_m.participant_id is not null then
    if v_m.kind = p_kind then
      return jsonb_build_object('ok', true, 'kind', v_m.kind,
        'key', case when v_m.kind = 'member' then v_p.recover_key end);
    end if;
    -- Vom Mitglied zurück zum Beobachter geht nicht: an ihm hängen Karten.
    if v_m.kind = 'member' then
      return jsonb_build_object('ok', false, 'error', 'already_member');
    end if;
  end if;

  -- Die Lehrkraft-Zeile im Seitenkopf sagt „höchstens 10" — der Scrum
  -- Guide auch. Der Raum sperrt den Rest, damit ein Team nicht
  -- unbemerkt zur halben Klasse wird.
  if p_kind = 'member' and (select count(*) from scrum_members m
                              join skill_participants p on p.id = m.participant_id
                             where m.room_id = v_room.id and m.kind = 'member'
                               and p.removed_at is null) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'team_full');
  end if;

  insert into scrum_members (participant_id, room_id, kind)
  values (v_p.id, v_room.id, p_kind)
  on conflict (participant_id) do update set kind = excluded.kind, joined_at = now();

  if p_kind = 'member' then
    v_key := coalesce(v_p.recover_key, skill_gen_recover_key());
    update skill_participants set recover_key = v_key where id = v_p.id;
  end if;

  perform scrum_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'kind', p_kind, 'key', v_key);
end;
$$;

revoke all on function scrum_enter(text, text) from public;
grant execute on function scrum_enter(text, text) to anon, authenticated;


-- Rolle, Label und Avatar einer Teamkarte. Jedes Mitglied darf jede
-- Karte ändern — das Team organisiert sich selbst (so auch im
-- Prototyp). Product Owner und Scrum Master gibt es je einmal: wer
-- die Rolle bekommt, nimmt sie dem bisherigen Träger ab.
create or replace function scrum_member_update(
  p_token       text,
  p_participant uuid,
  p_patch       jsonb
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p    skill_participants;
  v_room skill_rooms;
  v_me   scrum_members;
  v_t    scrum_members;
  v_role text;
  v_lbl  text;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  select * into v_me from scrum_members where participant_id = v_p.id;
  if v_me.kind is distinct from 'member' then
    return jsonb_build_object('ok', false, 'error', 'read_only');
  end if;
  select * into v_t from scrum_members
   where participant_id = p_participant and room_id = v_room.id and kind = 'member';
  if v_t.participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if p_patch ? 'role' then
    v_role := p_patch->>'role';
    if v_role not in ('dev', 'po', 'sm') then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    if v_role <> 'dev' then
      update scrum_members set role = 'dev'
       where room_id = v_room.id and role = v_role and participant_id <> v_t.participant_id;
    end if;
    update scrum_members set role = v_role where participant_id = v_t.participant_id;
  end if;

  if p_patch ? 'label' then
    v_lbl := btrim(coalesce(p_patch->>'label', ''));
    if char_length(v_lbl) > 40 then
      return jsonb_build_object('ok', false, 'error', 'too_long');
    end if;
    if v_lbl <> '' and contains_blacklisted_word(v_lbl) then
      return jsonb_build_object('ok', false, 'error', 'text_blocked');
    end if;
    update scrum_members set label = v_lbl where participant_id = v_t.participant_id;
  end if;

  if p_patch ? 'avatar' then
    if p_patch->'avatar' = 'null'::jsonb then
      update scrum_members set avatar = null where participant_id = v_t.participant_id;
    elsif (p_patch->>'avatar') !~ '^data:image/(jpeg|png|webp);base64,'
       or octet_length(p_patch->>'avatar') > 60000 then
      return jsonb_build_object('ok', false, 'error', 'payload_too_big');
    else
      update scrum_members set avatar = p_patch->>'avatar' where participant_id = v_t.participant_id;
    end if;
  end if;

  perform scrum_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function scrum_member_update(text, uuid, jsonb) from public;
grant execute on function scrum_member_update(text, uuid, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) Teilnehmer: schreiben
-- ─────────────────────────────────────────────────────────────
-- p_ops: [ { "op": "put" | "del", "kind": "story", "id": "u3",
--            "v": 4, "data": { … } }, … ]
--
-- v ist die Version, die das Gerät zuletzt gesehen hat; 0 heißt
-- „neu". Passt auch nur eine nicht, wird NICHTS geschrieben und die
-- Antwort nennt das Objekt — das Gerät holt den Stand und sagt der
-- Person, dass jemand anderes schneller war.
--
-- Neue Stories und Sprints bekommen ihre Nummer HIER und nicht auf dem
-- Gerät: zwei Tablets, die gleichzeitig eine Story anlegen, hätten
-- sonst beide US-15.
create or replace function scrum_save(p_token text, p_ops jsonb)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_me    scrum_members;
  v_op    jsonb;
  v_kind  text;
  v_id    text;
  v_v     int;
  v_data  jsonb;
  v_cur   scrum_items;
  v_cnt   scrum_rooms;
  v_no    int;
  v_out   jsonb := '[]'::jsonb;
  v_stories int;
  v_sprints int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  -- Zeilensperre auf dem Raum: zwei Speichervorgänge desselben Teams
  -- laufen nacheinander, nicht ineinander. Das macht die
  -- Versionsprüfung unten erst wasserdicht.
  select * into v_room from skill_rooms where id = v_p.room_id for update;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;
  select * into v_me from scrum_members where participant_id = v_p.id;
  if v_me.kind is distinct from 'member' then
    return jsonb_build_object('ok', false, 'error', 'read_only');
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array'
     or jsonb_array_length(p_ops) = 0 or jsonb_array_length(p_ops) > 400 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Durchgang 1: alles prüfen, nichts schreiben.
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'kind';
    v_id   := v_op->>'id';
    v_v    := coalesce((v_op->>'v')::int, -1);
    if v_op->>'op' not in ('put', 'del')
       or v_kind not in ('product', 'story', 'sprint')
       or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or v_v < 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    if v_op->>'op' = 'put' then
      v_data := v_op->'data';
      if v_data is null or jsonb_typeof(v_data) <> 'object' then
        return jsonb_build_object('ok', false, 'error', 'invalid_input');
      end if;
      -- Grenze vorher ausrechnen: ein CASE in der IF-Bedingung liest
      -- plpgsql bis zum ersten THEN — und das steht im CASE.
      v_no := case v_kind when 'product' then 1500000
                          when 'sprint'  then 80000
                          else 24000 end;
      if octet_length(v_data::text) > v_no then
        return jsonb_build_object('ok', false, 'error', 'payload_too_big',
                                  'kind', v_kind, 'id', v_id);
      end if;
    end if;
    select * into v_cur from scrum_items
     where room_id = v_room.id and kind = v_kind and item_id = v_id;
    if coalesce(v_cur.version, 0) <> v_v then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'kind', v_kind, 'id', v_id);
    end if;
    -- Es läuft immer höchstens EIN Sprint. Starten zwei Tablets
    -- gleichzeitig einen, kommt der zweite hier nicht durch.
    if v_op->>'op' = 'put' and v_kind = 'sprint' and v_data->>'status' = 'active'
       and exists (select 1 from scrum_items
                    where room_id = v_room.id and kind = 'sprint' and item_id <> v_id
                      and data->>'status' = 'active'
                      and not exists (select 1 from jsonb_array_elements(p_ops) o
                                       where o->>'kind' = 'sprint' and o->>'id' = scrum_items.item_id
                                         and (o->>'op' = 'del' or o->'data'->>'status' <> 'active'))) then
      return jsonb_build_object('ok', false, 'error', 'sprint_active');
    end if;
  end loop;

  -- Stand VOR der Änderung mitschreiben: „Sprint abschließen" nimmt dem
  -- Sprint gleich den Status, und der letzte Tag wäre sonst nicht drin.
  perform scrum_log_burndown(v_room.id);

  insert into scrum_rooms (room_id) values (v_room.id) on conflict do nothing;
  select * into v_cnt from scrum_rooms where room_id = v_room.id for update;

  -- Durchgang 2: schreiben.
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'kind';
    v_id   := v_op->>'id';
    v_v    := (v_op->>'v')::int;

    if v_op->>'op' = 'del' then
      delete from scrum_items where room_id = v_room.id and kind = v_kind and item_id = v_id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'deleted', true));
      continue;
    end if;

    v_data := v_op->'data';
    if v_v = 0 and v_kind = 'story' then
      v_cnt.seq_story := v_cnt.seq_story + 1;
      v_no := v_cnt.seq_story;
      v_data := v_data || jsonb_build_object('no', v_no, 'key', 'US-' || lpad(v_no::text, 2, '0'));
    elsif v_v = 0 and v_kind = 'sprint' then
      v_cnt.seq_sprint := v_cnt.seq_sprint + 1;
      v_no := v_cnt.seq_sprint;
      v_data := v_data || jsonb_build_object('no', v_no)
             || case when coalesce(btrim(v_data->>'name'), '') = ''
                     then jsonb_build_object('name', 'Sprint ' || v_no) else '{}'::jsonb end;
    end if;

    insert into scrum_items (room_id, kind, item_id, data, version, updated_at, updated_by)
    values (v_room.id, v_kind, v_id, v_data, 1, now(), v_p.id)
    on conflict (room_id, kind, item_id) do update
      set data = excluded.data, version = scrum_items.version + 1,
          updated_at = now(), updated_by = v_p.id
    returning * into v_cur;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
               'kind', v_kind, 'id', v_id, 'v', v_cur.version, 'data', v_cur.data));
  end loop;

  select count(*) filter (where kind = 'story'), count(*) filter (where kind = 'sprint')
    into v_stories, v_sprints
    from scrum_items where room_id = v_room.id;
  if v_stories > 400 or v_sprints > 80 then
    raise exception 'scrum_limit' using errcode = 'P0001';
  end if;

  update scrum_rooms
     set seq_story = v_cnt.seq_story, seq_sprint = v_cnt.seq_sprint, rev = rev + 1
   where room_id = v_room.id;

  perform scrum_log_burndown(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'items', v_out);
exception
  when raise_exception then
    if sqlerrm = 'scrum_limit' then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
    end if;
    raise;
end;
$$;

revoke all on function scrum_save(text, jsonb) from public;
grant execute on function scrum_save(text, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8) Lehrkraft
-- ─────────────────────────────────────────────────────────────
-- Liest alles, schreibt (noch) nichts am Board. Dazu die Codes aller
-- Mitglieder: wer seinen vergessen hat, fragt die Lehrkraft.
create or replace function scrum_room_sig(p_code text)
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
  return jsonb_build_object('ok', true, 'sig',
    coalesce((select rev from scrum_rooms where room_id = v_room.id), 0)::text || ':' ||
    (select count(*) from skill_participants where room_id = v_room.id and removed_at is null)::text || ':' ||
    (select count(*) from scrum_members where room_id = v_room.id)::text || ':' ||
    v_room.join_open::text || ':' ||
    (now() at time zone 'Europe/Berlin')::date::text);
end;
$$;

revoke all on function scrum_room_sig(text) from public;
grant execute on function scrum_room_sig(text) to authenticated;


create or replace function scrum_room_get(p_code text, p_have jsonb default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
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
  return jsonb_build_object(
    'ok',   true,
    'role', 'presenter',
    'room', jsonb_build_object('title', v_room.title, 'join_open', v_room.join_open),
    'me',   jsonb_build_object('id', null, 'name', 'Lehrkraft', 'kind', 'teacher')
  ) || scrum_state_json(v_room.id, null, true, p_have);
end;
$$;

revoke all on function scrum_room_get(text, jsonb) from public;
grant execute on function scrum_room_get(text, jsonb) to authenticated;


-- Neuer Code für ein Mitglied: der alte gilt ab sofort nicht mehr.
-- Für den Fall, dass ein Code an jemand Falsches geraten ist.
create or replace function scrum_room_rekey(p_code text, p_participant uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_key  text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from scrum_members
                  where participant_id = p_participant and room_id = v_room.id
                    and kind = 'member') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_key := skill_gen_recover_key();
  update skill_participants set recover_key = v_key where id = p_participant;
  perform scrum_bump(v_room.id);
  return jsonb_build_object('ok', true, 'key', v_key);
end;
$$;

revoke all on function scrum_room_rekey(text, uuid) from public;
grant execute on function scrum_room_rekey(text, uuid) to authenticated;
