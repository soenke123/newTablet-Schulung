-- ══════════════════════════════════════════════════════════════
-- Migration 0080 — MPSkills: Inhaltsschicht (Stufe 4)
-- ══════════════════════════════════════════════════════════════
-- 0079 brachte den Raum: Code, Beitritt, Token, „wer ist da".
-- Hier bekommt der Raum einen INHALT — und zwar genau einmal für
-- alle Werkzeuge (Konzept_MPSkills_v1.html, Abschnitt 07):
--
--   skill_room_state    was die Lehrkraft steuert (Phase + jsonb)
--   skill_room_entries  Beiträge: payload jsonb + hidden
--   skill_room_votes    Zustimmung, PK = genau eine Stimme
--
-- ── Warum generisch und nicht je Werkzeug ─────────────────────
-- Die Schulung hat für ihre kollaborativen Kacheln eigene
-- Schemata (board_*, wc_*), weil dort jede Achse etwas bedeutet:
-- eine Kategorie IST eine Kategorie, eine Haltung IST eine
-- Haltung. MPSkills ist das Gegenteil — eine Sammlung, die
-- wachsen soll. Ein neues Werkzeug ist hier ein Ordner und eine
-- Zeile in der Registry, KEINE Migration.
--
-- Der Preis steht im Konzept und wird hier bezahlt: die
-- Gültigkeitsprüfung (Länge, Anzahl, Phase) steht als jsonb in
-- skill_tools.limits und nicht als Constraint an der Spalte.
-- Diese Datei liest sie und setzt sie durch — das Werkzeug
-- erklärt seine Regeln, die Datenbank vollstreckt sie.
--
-- Verstanden werden (alle optional, mit Rückfall):
--   max_entries   int    Beiträge je Teilnehmer
--   text_field    text   welcher payload-Schlüssel Text trägt
--   min_len/max_len int  Grenzen für genau dieses Feld
--   phases        int    wie viele Phasen es gibt (Vorgabe 1)
--   write_phases  int[]  in welchen geschrieben werden darf
--   votes         bool   gibt es Zustimmung? (Vorgabe true)
--   self_vote     bool   eigenem Beitrag zustimmen? (Vorgabe false)
--
-- Was NICHT in der Registry steht, ist die Obergrenze für die
-- Größe eines payloads: 4 KB, hier fest. Das ist eine
-- Ressourcengrenze und keine Regel des Werkzeugs — sie darf
-- nicht per UPDATE verhandelbar sein.
--
-- ── Die drei Regeln aus 0079 gelten unverändert ───────────────
--   1) Anon fasst KEINE Tabelle an, auch nicht lesend.
--   2) Keine Funktion für Anon nimmt eine Raum- oder Teilnehmer-
--      ID von außen. Die erste Zeile löst den Token auf.
--   3) Der Token verlässt die Datenbank nicht.
--
-- Zu Regel 2 die eine Feinheit, die diese Datei hinzufügt: die
-- Funktionen nehmen sehr wohl eine BEITRAGS-ID entgegen (etwas
-- ändern, löschen, zustimmen geht nicht ohne). Sie ist aber nie
-- der Einstieg, sondern immer die zweite Bedingung — jede Abfrage
-- lautet „dieser Beitrag UND room_id = der aus dem Token
-- aufgelöste Raum". Ein fremder Beitrag ist damit nicht
-- verboten, sondern nicht auffindbar.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) skill_room_state
-- ─────────────────────────────────────────────────────────────
-- Ein Zeile je Raum, angelegt beim ersten Zugriff (kein Trigger
-- an skill_rooms: ein Raum ohne Zustand ist ein gültiger Raum,
-- und Phase 1 ist derselbe Zustand wie „keine Zeile").
--
-- phase ist eine eigene Spalte und steckt NICHT in data: sie ist
-- das einzige Feld, das die generische Schicht selbst versteht —
-- Schreibrechte hängen daran (write_phases). Alles Übrige gehört
-- dem Werkzeug und wird hier nur durchgereicht.
create table if not exists skill_room_state (
  room_id     uuid primary key references skill_rooms(id) on delete cascade,
  phase       int   not null default 1,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint skill_room_state_phase_pos check (phase >= 1)
);

comment on table skill_room_state is
  'Was die Lehrkraft steuert. phase versteht die generische Schicht selbst (Schreibrechte), '
  'data ist ein undurchsichtiger Blob, den nur das Werkzeug deutet.';


-- ─────────────────────────────────────────────────────────────
-- 2) skill_room_entries
-- ─────────────────────────────────────────────────────────────
-- Ein Beitrag. Zwei Verfasser-Arten, und genau eine davon ist je
-- Zeile gesetzt:
--
--   participant_id  ein Gerät im Raum (Schülerseite, Token)
--   author_id       die Lehrkraft (angemeldet, über den Code)
--
-- Beides NULL wäre ein herrenloser Beitrag, beides gesetzt ein
-- widersprüchlicher — der Constraint verhindert die Frage, welche
-- der beiden Angaben dann gilt.
create table if not exists skill_room_entries (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references skill_rooms(id) on delete cascade,
  participant_id  uuid references skill_participants(id) on delete cascade,
  author_id       uuid references profiles(id) on delete set null,
  kind            text not null default 'entry',
  payload         jsonb not null default '{}'::jsonb,
  hidden          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint skill_room_entries_kind_len check (char_length(kind) between 1 and 24),
  constraint skill_room_entries_one_author check (
    (participant_id is not null and author_id is null) or
    (participant_id is null     and author_id is not null)
  )
);

comment on table skill_room_entries is
  'Beiträge aller Werkzeuge. payload wird von der generischen Schicht nur gegen '
  'skill_tools.limits geprüft, nie gedeutet — die Bedeutung bringt das Werkzeug mit.';
comment on column skill_room_entries.hidden is
  'Moderation: ausgeblendet statt gelöscht. Für die Klasse unsichtbar, für die Lehrkraft '
  'sichtbar und umkehrbar — das ist der Unterschied zum Löschen und der Grund, warum '
  'Ausblenden das Mittel der Wahl ist.';
comment on column skill_room_entries.kind is
  'Für Werkzeuge mit mehr als einer Beitragsart. Steht hier ab Stufe 4, damit später keine '
  'Signaturänderung nötig ist — eine geänderte Signatur zwingt zum DROP der alten Funktion, '
  'sonst kann PostgREST zwischen zwei Überladungen nicht wählen (Lehre aus 0063).';

create index if not exists skill_room_entries_room_idx
  on skill_room_entries(room_id, created_at);
create index if not exists skill_room_entries_participant_idx
  on skill_room_entries(participant_id);


-- ─────────────────────────────────────────────────────────────
-- 3) skill_room_votes
-- ─────────────────────────────────────────────────────────────
-- Der Primärschlüssel erledigt „genau eine Stimme je Gerät und
-- Beitrag". Kein Zähler an der Beitragszeile: ein Zähler kann
-- doppelt laufen, ein Primärschlüssel nicht.
--
-- Es stimmen nur TEILNEHMER zu, nicht die Lehrkraft. Sie
-- moderiert das Gespräch und wiegt es nicht auf — und eine Stimme
-- vom Beamer wäre in jeder Auswertung eine Stimme zu viel.
create table if not exists skill_room_votes (
  entry_id        uuid not null references skill_room_entries(id) on delete cascade,
  participant_id  uuid not null references skill_participants(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (entry_id, participant_id)
);

comment on table skill_room_votes is
  'Zustimmung eines Geräts zu einem Beitrag. Nur Teilnehmer stimmen ab; die Lehrkraft '
  'moderiert.';

create index if not exists skill_room_votes_participant_idx
  on skill_room_votes(participant_id);


-- ─────────────────────────────────────────────────────────────
-- 4) RLS — deny by default, wie in 0079
-- ─────────────────────────────────────────────────────────────
alter table skill_room_state   enable row level security;
alter table skill_room_entries enable row level security;
alter table skill_room_votes   enable row level security;

grant select, insert, update, delete on skill_room_state   to service_role;
grant select, insert, update, delete on skill_room_entries to service_role;
grant select, insert, update, delete on skill_room_votes   to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4b) skill_rooms.settings bekommt eine Obergrenze
-- ─────────────────────────────────────────────────────────────
-- Ab Stufe 4 schreibt die Lehrkraft dort etwas hinein (bei der
-- Wortwolke die Frage), und skill_room_create nimmt den Wert
-- ungeprüft entgegen — es kennt die Bedeutung ja nicht.
--
-- Als Constraint an der Spalte und nicht als Prüfung in der
-- Funktion: skill_room_create ist der EINE Weg heute, aber die
-- Grenze soll auch für jeden zweiten gelten, den es später gibt.
-- Dieselbe Zahl wie für skill_room_state.data.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'skill_rooms_settings_size'
       and conrelid = 'skill_rooms'::regclass
  ) then
    alter table skill_rooms
      add constraint skill_rooms_settings_size
      check (octet_length(settings::text) <= 8192);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 5) Die Grenzen des Werkzeugs lesen
-- ─────────────────────────────────────────────────────────────
-- Ein Ort, an dem skill_tools.limits gelesen wird. Stünde das in
-- jeder schreibenden Funktion einzeln, liefen die Regeln beim
-- ersten zweiten Werkzeug auseinander.
create or replace function skill_limits(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(t.limits, '{}'::jsonb)
    from skill_rooms r
    join skill_tools t on t.id = r.tool_id
   where r.id = p_room;
$$;

revoke all on function skill_limits(uuid) from public;


-- Wie viele Phasen hat dieses Werkzeug? Vorgabe 1 — ein Werkzeug
-- ohne Phasenangabe hat keine Phasen, und dann gibt es auch
-- nichts weiterzuschalten.
create or replace function skill_phase_count(p_lim jsonb)
  returns int
  immutable
  set search_path = public
  language sql
as $$
  select greatest(1, coalesce(nullif(p_lim->>'phases', '')::int, 1));
$$;

revoke all on function skill_phase_count(jsonb) from public;


-- Darf in dieser Phase geschrieben werden?
-- Fehlt write_phases, darf in JEDER Phase geschrieben werden. Das
-- ist der richtige Rückfall: „eingefroren" ist die Ausnahme, die
-- ein Werkzeug ausdrücklich bestellt.
create or replace function skill_may_write(p_lim jsonb, p_phase int)
  returns boolean
  immutable
  set search_path = public
  language sql
as $$
  select case
    when p_lim->'write_phases' is null
      or jsonb_typeof(p_lim->'write_phases') <> 'array' then true
    else p_lim->'write_phases' @> to_jsonb(p_phase)
  end;
$$;

revoke all on function skill_may_write(jsonb, int) from public;


-- ─────────────────────────────────────────────────────────────
-- 6) payload prüfen
-- ─────────────────────────────────────────────────────────────
-- Gibt NULL zurück, wenn alles stimmt, sonst den Fehlerschlüssel.
-- Der geprüfte (und am Textfeld beschnittene) payload kommt über
-- den INOUT-Parameter zurück — sonst müsste jede aufrufende
-- Funktion das Trimmen wiederholen, und eine davon vergäße es.
create or replace function skill_check_payload(
  inout  p_payload jsonb,
  in     p_lim     jsonb,
  out    err       text
)
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_field text := nullif(p_lim->>'text_field', '');
  v_text  text;
  v_min   int  := coalesce(nullif(p_lim->>'min_len', '')::int, 1);
  v_max   int  := coalesce(nullif(p_lim->>'max_len', '')::int, 500);
begin
  err := null;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    err := 'invalid_input';
    return;
  end if;

  -- Harte Grenze, nicht aus der Registry: eine Ressourcengrenze
  -- darf nicht per UPDATE an skill_tools verhandelbar sein.
  if octet_length(p_payload::text) > 4096 then
    err := 'payload_too_big';
    return;
  end if;

  -- Kein Textfeld angemeldet? Dann hat dieses Werkzeug keinen Text,
  -- den die generische Schicht prüfen könnte — nur die Größe gilt.
  if v_field is null then
    return;
  end if;

  v_text := btrim(coalesce(p_payload->>v_field, ''));
  if char_length(v_text) < v_min or char_length(v_text) > v_max then
    err := 'invalid_input';
    return;
  end if;

  -- Beschnitten zurückschreiben: was in der Wolke steht, soll nicht
  -- mit unsichtbaren Leerzeichen anfangen.
  p_payload := jsonb_set(p_payload, array[v_field], to_jsonb(v_text));
end;
$$;

revoke all on function skill_check_payload(jsonb, jsonb) from public;


-- ─────────────────────────────────────────────────────────────
-- 7) Bausteine für die Ansicht
-- ─────────────────────────────────────────────────────────────
-- Zustand eines Raums, mit Rückfall auf Phase 1. Damit muss keine
-- lesende Funktion wissen, dass die Zeile erst beim ersten
-- Schreiben entsteht.
create or replace function skill_state_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
    'phase',      coalesce(s.phase, 1),
    'data',       coalesce(s.data, '{}'::jsonb),
    'updated_at', s.updated_at
  )
  from skill_rooms r
  left join skill_room_state s on s.room_id = r.id
  where r.id = p_room;
$$;

revoke all on function skill_state_json(uuid) from public;


-- Die Beiträge eines Raums.
--
--   p_me       Teilnehmer, der zusieht (für is_mine / voted) — NULL
--              auf der Beamer-Seite, dort gibt es kein „mein".
--   p_all      true = ausgeblendete mitliefern (nur Lehrkraft).
--
-- Der Anzeigename wird HIER gebildet und nicht im Client — dieselbe
-- Überlegung wie bei skill_people_json in 0079: Beamer und Tablet
-- müssen garantiert dasselbe zeigen.
create or replace function skill_entries_json(
  p_room uuid,
  p_me   uuid    default null,
  p_all  boolean default false
)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(x order by x_created), '[]'::jsonb)
    from (
      select e.created_at as x_created,
             jsonb_build_object(
               'id',        e.id,
               'kind',      e.kind,
               'payload',   e.payload,
               'hidden',    e.hidden,
               'by_teacher',(e.author_id is not null),
               'author',    case
                              when e.author_id is not null
                                then coalesce(pr.display_name, pr.account_name, 'Lehrkraft')
                              else coalesce(pa.name, 'Tablet ' || pa.seat)
                            end,
               'is_mine',   (p_me is not null and e.participant_id = p_me),
               'votes',     (select count(*) from skill_room_votes v where v.entry_id = e.id),
               'voted',     (p_me is not null and exists (
                               select 1 from skill_room_votes v
                                where v.entry_id = e.id and v.participant_id = p_me)),
               'created_at', e.created_at,
               'updated_at', e.updated_at
             ) as x
        from skill_room_entries e
        left join skill_participants pa on pa.id = e.participant_id
        left join profiles          pr on pr.id = e.author_id
       where e.room_id = p_room
         and (p_all or not e.hidden)
    ) t;
$$;

revoke all on function skill_entries_json(uuid, uuid, boolean) from public;

comment on function skill_entries_json(uuid, uuid, boolean) is
  'Beiträge eines Raums, ohne Teilnehmer-IDs. Ausgeblendete kommen nur mit p_all mit — '
  'das ist die einzige Stelle, an der sich die Sicht der Lehrkraft von der der Klasse '
  'unterscheidet.';


-- ─────────────────────────────────────────────────────────────
-- 8) Signatur — jetzt mit Inhalt
-- ─────────────────────────────────────────────────────────────
-- Genau der Fall, für den die Signatur in 0079 abgetrennt wurde:
-- sie bekommt Beiträge, Stimmen und Phase dazu, und KEIN Client
-- muss dafür angefasst werden — er vergleicht die Zeichenkette,
-- er liest sie nicht.
--
-- max(updated_at) statt nur count: sonst bliebe eine Textänderung
-- oder ein Ausblenden unsichtbar, weil die Anzahl gleich bleibt.
create or replace function skill_sig_of(p_room uuid)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select concat_ws('.',
    (select count(*) from skill_participants p where p.room_id = p_room),
    (select count(*) from skill_participants p
      where p.room_id = p_room and p.last_seen_at > now() - interval '90 seconds'),
    (select case when r.join_open then '1' else '0' end from skill_rooms r where r.id = p_room),
    (select extract(epoch from r.last_active_at)::bigint from skill_rooms r where r.id = p_room),
    (select count(*) from skill_room_entries e where e.room_id = p_room),
    (select coalesce(extract(epoch from max(e.updated_at))::bigint, 0)
       from skill_room_entries e where e.room_id = p_room),
    (select count(*) from skill_room_votes v
       join skill_room_entries e on e.id = v.entry_id where e.room_id = p_room),
    (select coalesce(s.phase, 1) from skill_rooms r
       left join skill_room_state s on s.room_id = r.id where r.id = p_room),
    (select coalesce(extract(epoch from s.updated_at)::bigint, 0)
       from skill_room_state s where s.room_id = p_room)
  );
$$;

revoke all on function skill_sig_of(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 9) skill_view — die Ansicht der Teilnehmer, erweitert
-- ─────────────────────────────────────────────────────────────
-- Gleiche Signatur wie in 0079, gleicher Aufbau, gleiche Regeln.
-- Neu sind state, entries, limits und me.entries_used.
--
-- limits kommt mit, damit das Werkzeug im Gerät dieselben Grenzen
-- ANZEIGEN kann, die der Server DURCHSETZT — „Neuer Zettel 4 von
-- 10" darf keine zweite Wahrheit sein.
create or replace function skill_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_phase int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  v_lim   := skill_limits(v_room.id);
  select coalesce(s.phase, 1) into v_phase
    from skill_rooms r left join skill_room_state s on s.room_id = r.id
   where r.id = v_room.id;

  return jsonb_build_object(
    'ok',      true,
    'room',    skill_room_json(v_room.id),
    'people',  skill_people_json(v_room.id, v_p.id),
    'state',   skill_state_json(v_room.id),
    'entries', skill_entries_json(v_room.id, v_p.id, false),
    'limits',  v_lim,
    'role',    'participant',
    'me', jsonb_build_object(
            'seat',  v_p.seat,
            'name',  coalesce(v_p.name, 'Tablet ' || v_p.seat),
            'named', (v_p.name is not null),
            'entries_used', (select count(*) from skill_room_entries e
                              where e.room_id = v_room.id and e.participant_id = v_p.id),
            -- Vorgerechnet statt vom Client abgeleitet: ob geschrieben
            -- werden darf, entscheidet dieselbe Funktion, die es beim
            -- Speichern durchsetzt.
            'may_write', skill_may_write(v_lim, v_phase)
          )
  );
end;
$$;

revoke all on function skill_view(text) from public;
grant execute on function skill_view(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 10) skill_room_get — die Ansicht der Lehrkraft, erweitert
-- ─────────────────────────────────────────────────────────────
-- Derselbe Raum, dieselben Bausteine — mit zwei Unterschieden, und
-- beide sind Absicht: die Lehrkraft sieht ausgeblendete Beiträge
-- (sonst könnte sie nichts wieder einblenden), und sie hat kein
-- „mein" (is_mine bleibt false, sie stimmt nicht ab).
create or replace function skill_room_get(p_code text)
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
  -- Fremder Raum und nicht existierender Raum bekommen dieselbe
  -- Antwort: sonst wäre diese Funktion ein Code-Orakel für jeden
  -- angemeldeten Account.
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);

  return jsonb_build_object(
    'ok',      true,
    'room',    skill_room_json(v_room.id) || jsonb_build_object(
                 'last_active_at', v_room.last_active_at,
                 'expired',        (v_room.expires_at <= now())
               ),
    'people',  skill_people_json(v_room.id, null),
    'state',   skill_state_json(v_room.id),
    'entries', skill_entries_json(v_room.id, null, true),
    'limits',  skill_limits(v_room.id),
    'role',    'presenter',
    'is_owner', true
  );
end;
$$;

revoke all on function skill_room_get(text) from public;
grant execute on function skill_room_get(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 11) Teilnehmer: Beitrag anlegen und ändern
-- ─────────────────────────────────────────────────────────────
-- Regel 2 in Reinform: Zeile eins löst den Token auf. p_id ist
-- eine ID von außen, aber sie ist nie der Einstieg — sie wird
-- IMMER gegen den aufgelösten Raum UND den aufgelösten Teilnehmer
-- geprüft. Ein fremder Beitrag ist damit nicht verboten, sondern
-- nicht auffindbar.
create or replace function skill_entry_upsert(
  p_token   text,
  p_payload jsonb,
  p_id      uuid default null,
  p_kind    text default 'entry'
)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_phase int;
  v_max   int;
  v_used  int;
  v_err   text;
  v_pl    jsonb := p_payload;
  v_entry skill_room_entries;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim := skill_limits(v_room.id);
  select coalesce(s.phase, 1) into v_phase
    from skill_rooms r left join skill_room_state s on s.room_id = r.id
   where r.id = v_room.id;

  if not skill_may_write(v_lim, v_phase) then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  -- `select *` und nicht `q.p_payload, q.err`: die Funktion hat einen
  -- OUT-Parameter, der genauso heißt wie ein Parameter DIESER Funktion,
  -- und PL/pgSQL setzt Bezeichner in SQL durch Variablen. Die
  -- Positionsform lässt gar keine Verwechslung zu.
  select * into v_pl, v_err from skill_check_payload(v_pl, v_lim);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  if char_length(coalesce(p_kind, '')) not between 1 and 24 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- Ändern: die Beitrags-ID gilt nur zusammen mit Raum UND
  -- Teilnehmer. Beides aus der Token-Auflösung, keines von außen.
  if p_id is not null then
    select * into v_entry from skill_room_entries
     where id = p_id and room_id = v_room.id and participant_id = v_p.id;
    if v_entry.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    update skill_room_entries
       set payload = v_pl, updated_at = now()
     where id = v_entry.id;

    perform skill_touch(v_room.id);
    return jsonb_build_object('ok', true, 'updated', true, 'id', v_entry.id);
  end if;

  -- Anlegen: Kontingent. Gezählt werden auch ausgeblendete — sonst
  -- schafft Moderation neuen Platz, und wer ausgeblendet wird,
  -- bekäme einen Zettel geschenkt.
  v_max := coalesce(nullif(v_lim->>'max_entries', '')::int, 0);
  if v_max > 0 then
    select count(*) into v_used from skill_room_entries
     where room_id = v_room.id and participant_id = v_p.id;
    if v_used >= v_max then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded', 'max', v_max);
    end if;
  end if;

  insert into skill_room_entries (room_id, participant_id, kind, payload)
  values (v_room.id, v_p.id, coalesce(p_kind, 'entry'), v_pl)
  returning * into v_entry;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'updated', false, 'id', v_entry.id);
end;
$$;

revoke all on function skill_entry_upsert(text, jsonb, uuid, text) from public;
grant execute on function skill_entry_upsert(text, jsonb, uuid, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 12) Teilnehmer: eigenen Beitrag löschen
-- ─────────────────────────────────────────────────────────────
-- Auch das Löschen hängt an der Phase: ist der Inhalt eingefroren,
-- ist er es in beide Richtungen. Sonst ließe sich in Phase 2 noch
-- alles wegräumen, was gerade besprochen wird.
create or replace function skill_entry_delete(p_token text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_phase int;
  v_n     int;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim := skill_limits(v_room.id);
  select coalesce(s.phase, 1) into v_phase
    from skill_rooms r left join skill_room_state s on s.room_id = r.id
   where r.id = v_room.id;

  if not skill_may_write(v_lim, v_phase) then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  delete from skill_room_entries
   where id = p_id and room_id = v_room.id and participant_id = v_p.id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function skill_entry_delete(text, uuid) from public;
grant execute on function skill_entry_delete(text, uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 13) Teilnehmer: zustimmen (Umschalter)
-- ─────────────────────────────────────────────────────────────
-- Zustimmen geht in JEDER Phase — das Einfrieren gilt dem Inhalt,
-- nicht dem Gespräch (dieselbe Überlegung wie in 0063 und 0075).
--
-- Ausgeblendete Beiträge sind hier nicht erreichbar: sie stehen in
-- keiner Teilnehmer-Ansicht, also gibt es keinen ehrlichen Weg, an
-- ihre ID zu kommen.
create or replace function skill_vote_toggle(p_token text, p_entry uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p     skill_participants;
  v_room  skill_rooms;
  v_lim   jsonb;
  v_entry skill_room_entries;
  v_n     int;
  v_on    boolean;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  select * into v_room from skill_rooms where id = v_p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;

  v_lim := skill_limits(v_room.id);
  if coalesce((v_lim->>'votes')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'error', 'votes_disabled');
  end if;

  select * into v_entry from skill_room_entries
   where id = p_entry and room_id = v_room.id and not hidden;
  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_entry.participant_id = v_p.id
     and coalesce((v_lim->>'self_vote')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'own_entry');
  end if;

  delete from skill_room_votes
   where entry_id = v_entry.id and participant_id = v_p.id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    insert into skill_room_votes (entry_id, participant_id)
    values (v_entry.id, v_p.id);
    v_on := true;
  else
    v_on := false;
  end if;

  return jsonb_build_object(
    'ok', true, 'voted', v_on,
    'votes', (select count(*) from skill_room_votes where entry_id = v_entry.id)
  );
end;
$$;

revoke all on function skill_vote_toggle(text, uuid) from public;
grant execute on function skill_vote_toggle(text, uuid) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 14) Lehrkraft: Phase und Werkzeug-Zustand setzen
-- ─────────────────────────────────────────────────────────────
-- Ein Aufruf für beides. Beide Parameter sind optional: wer nur
-- die Phase weiterschaltet, soll nicht den ganzen Zustand
-- mitschicken müssen (und ihn dabei versehentlich überschreiben).
--
-- Zurückschalten ist ausdrücklich erlaubt — eine Lehrkraft, die
-- merkt, dass die Klasse noch nicht so weit ist, muss zurück
-- können. Anders als beim Reality Check hängt hier keine Belohnung
-- daran, es braucht also auch kein phase_max.
create or replace function skill_room_set_state(
  p_code  text,
  p_phase int   default null,
  p_data  jsonb default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_lim   jsonb;
  v_max   int;
  v_phase int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_lim := skill_limits(v_room.id);
  v_max := skill_phase_count(v_lim);

  if p_phase is not null and (p_phase < 1 or p_phase > v_max) then
    return jsonb_build_object('ok', false, 'error', 'phase_invalid', 'max', v_max);
  end if;

  if p_data is not null and octet_length(p_data::text) > 8192 then
    return jsonb_build_object('ok', false, 'error', 'payload_too_big');
  end if;

  insert into skill_room_state (room_id, phase, data, updated_at)
  values (v_room.id, coalesce(p_phase, 1), coalesce(p_data, '{}'::jsonb), now())
  on conflict (room_id) do update
    set phase      = coalesce(p_phase, skill_room_state.phase),
        data       = coalesce(p_data,  skill_room_state.data),
        updated_at = now();

  perform skill_touch(v_room.id);

  select phase into v_phase from skill_room_state where room_id = v_room.id;
  return jsonb_build_object('ok', true, 'phase', v_phase, 'max_phase', v_max);
end;
$$;

revoke all on function skill_room_set_state(text, int, jsonb) from public;
grant execute on function skill_room_set_state(text, int, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 15) Lehrkraft: eigenen Beitrag schreiben
-- ─────────────────────────────────────────────────────────────
-- Die Lehrkraft schreibt auf demselben Board wie die Klasse — sie
-- macht das erste Beispiel, oder sie wirft in einer festgefahrenen
-- Runde etwas dazu. Kein Kontingent (sie sammelt nicht mit) und
-- keine Phasensperre (sie hat sie gesetzt).
--
-- Erkennbar bleibt es trotzdem: author_id ist gesetzt, und
-- skill_entries_json liefert daraus by_teacher — dieselbe
-- Überlegung wie bei den Karten der Lehrkraft im Reality Check
-- (0074). Wer das nicht sieht, hält den Beitrag für den einer
-- Mitschülerin.
create or replace function skill_room_entry_add(
  p_code    text,
  p_payload jsonb,
  p_kind    text default 'entry'
)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_room  skill_rooms;
  v_lim   jsonb;
  v_err   text;
  v_pl    jsonb := p_payload;
  v_entry skill_room_entries;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_lim := skill_limits(v_room.id);
  -- `select *` und nicht `q.p_payload, q.err`: die Funktion hat einen
  -- OUT-Parameter, der genauso heißt wie ein Parameter DIESER Funktion,
  -- und PL/pgSQL setzt Bezeichner in SQL durch Variablen. Die
  -- Positionsform lässt gar keine Verwechslung zu.
  select * into v_pl, v_err from skill_check_payload(v_pl, v_lim);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  insert into skill_room_entries (room_id, author_id, kind, payload)
  values (v_room.id, v_user, coalesce(p_kind, 'entry'), v_pl)
  returning * into v_entry;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'id', v_entry.id);
end;
$$;

revoke all on function skill_room_entry_add(text, jsonb, text) from public;
grant execute on function skill_room_entry_add(text, jsonb, text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 16) Lehrkraft: Beitrag ausblenden / wieder einblenden
-- ─────────────────────────────────────────────────────────────
-- Das Moderationswerkzeug — und bewusst KEIN Löschen fremder
-- Beiträge. Ausblenden ist umkehrbar: was daneben lag, ist weg vom
-- Beamer, aber nicht aus der Welt, und ein Fehlgriff kostet einen
-- zweiten Klick statt der Arbeit einer Schülerin.
--
-- Eigene Beiträge darf die Lehrkraft löschen (siehe unten) — die
-- gehören ihr.
create or replace function skill_room_entry_hide(
  p_code   text,
  p_id     uuid,
  p_hidden boolean default true
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update skill_room_entries
     set hidden = coalesce(p_hidden, true), updated_at = now()
   where id = p_id and room_id = v_room.id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'hidden', coalesce(p_hidden, true));
end;
$$;

revoke all on function skill_room_entry_hide(text, uuid, boolean) from public;
grant execute on function skill_room_entry_hide(text, uuid, boolean) to authenticated;


-- Löschen: nur die EIGENEN Beiträge der Lehrkraft. Für alles
-- andere gibt es das Ausblenden — siehe oben.
create or replace function skill_room_entry_delete(p_code text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  delete from skill_room_entries
   where id = p_id and room_id = v_room.id and author_id = v_user;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_deletable');
  end if;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function skill_room_entry_delete(text, uuid) from public;
grant execute on function skill_room_entry_delete(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 17) Lehrkraft: Raum leeren
-- ─────────────────────────────────────────────────────────────
-- Derselbe Raum, dieselbe Klasse, neue Runde — oder derselbe Code
-- für die nächste Stunde. Beiträge und Stimmen weg, Phase zurück
-- auf 1; die TEILNEHMER bleiben drin. Wer schon im Raum ist, soll
-- nicht noch einmal scannen müssen, nur weil die Aufgabe neu
-- beginnt.
create or replace function skill_room_reset(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Stimmen verschwinden über on delete cascade mit den Beiträgen.
  delete from skill_room_entries where room_id = v_room.id;
  get diagnostics v_n = row_count;

  insert into skill_room_state (room_id, phase, data, updated_at)
  values (v_room.id, 1, '{}'::jsonb, now())
  on conflict (room_id) do update
    set phase = 1, data = '{}'::jsonb, updated_at = now();

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'deleted', v_n);
end;
$$;

revoke all on function skill_room_reset(text) from public;
grant execute on function skill_room_reset(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 18) skill_rooms_list — mit Ordner
-- ─────────────────────────────────────────────────────────────
-- Unverändert bis auf zwei Felder in der Werkzeug-Übersicht:
-- `folder` und `limits`. Beides braucht der Dialog „Neuer Raum" ab
-- Stufe 4 — er lädt das Werkzeug-Modul, um dessen eigene Felder zu
-- erfragen (bei der Wortwolke: die Frage), und dafür muss er
-- wissen, wo es liegt.
--
-- Der Ordner steht neben der ID und nicht statt ihrer: so lässt
-- sich ein Werkzeug umbenennen, ohne dass bestehende Räume ihre
-- tool_id verlieren (0078).
create or replace function skill_rooms_list()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user  uuid := auth.uid();
  v_rooms jsonb;
  v_tools jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  select coalesce(jsonb_agg(x order by x_test, x_active desc), '[]'::jsonb)
    into v_rooms
    from (
      select r.is_test as x_test, r.last_active_at as x_active,
             skill_room_json(r.id)
               || jsonb_build_object(
                    'last_active_at', r.last_active_at,
                    'expired',        (r.expires_at <= now()),
                    'people',  (select count(*) from skill_participants p where p.room_id = r.id),
                    'online',  (select count(*) from skill_participants p
                                 where p.room_id = r.id
                                   and p.last_seen_at > now() - interval '90 seconds'),
                    'entries', (select count(*) from skill_room_entries e where e.room_id = r.id)
                  ) as x
        from skill_rooms r
       where r.owner_id = v_user
    ) t;

  -- Verbrauch je Werkzeug: dieselbe Zählweise wie in skill_room_create,
  -- damit die Liste nicht „4 von 5" sagt und das Anlegen trotzdem
  -- scheitert.
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
           'title', t.title, 'icon', t.icon, 'active', t.active,
           'folder', t.folder,
           'limits', t.limits,
           'multi_room', t.multi_room,
           'max_rooms', t.max_rooms,
           'live', (select count(*) from skill_rooms r
                     where r.owner_id = v_user and r.tool_id = t.id
                       and r.is_test = false and r.expires_at > now())
         )), '{}'::jsonb)
    into v_tools
    from skill_tools t;

  return jsonb_build_object('ok', true, 'rooms', v_rooms, 'tools', v_tools);
end;
$$;

revoke all on function skill_rooms_list() from public;
grant execute on function skill_rooms_list() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 19) Die Grenzen der beiden Werkzeuge
-- ─────────────────────────────────────────────────────────────
-- Erst jetzt gibt es eine Schicht, die diese Angaben versteht —
-- in 0078 standen sie als Platzhalter da.
--
-- Wortwolke: 10 Zettel je Kopf, 3–60 Zeichen, zwei Phasen, und
-- geschrieben wird nur in Phase 1. Phase 2 ist reines Besprechen:
-- kein Anlegen, kein Ändern, kein Löschen — Zustimmen bleibt.
--
-- Abstimmung (Stufe 6): ein Beitrag je Kopf, keine Zustimmung
-- (die Stimme IST der Beitrag), kein Textfeld — der payload trägt
-- die gewählte Option und wird nur auf seine Größe geprüft. Genau
-- der Fall, für den die generische Prüfung ohne text_field
-- durchwinkt.
update skill_tools set limits = jsonb_build_object(
    'max_entries',  10,
    'text_field',   'text',
    'min_len',      3,
    'max_len',      60,
    'phases',       2,
    'write_phases', jsonb_build_array(1),
    'votes',        true,
    'self_vote',    false
  )
 where id = 'wordcloud';

update skill_tools set limits = jsonb_build_object(
    'max_entries',  1,
    'phases',       2,
    'write_phases', jsonb_build_array(1),
    'votes',        false,
    'max_options',  6,
    'max_len',      60
  )
 where id = 'poll';
