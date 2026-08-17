-- ══════════════════════════════════════════════════════════════
-- Migration 0079 — MPSkills: Räume, Codes, Beitritt (Stufe 3)
-- ══════════════════════════════════════════════════════════════
-- Der Kern des Bereichs (Konzept: Konzept_MPSkills_v1.html,
-- Abschnitte 05–08). 0077 brachte die Rolle, 0078 die Liste der
-- Werkzeuge — hier kommt das, was beide erst nützlich macht: ein
-- Raum, ein Code an der Tafel, und Teilnehmer OHNE Account.
--
-- Inhalt gibt es in dieser Stufe bewusst noch keinen. Was ein Raum
-- kann, ist „wer ist da" — die Teilnehmerliste, die live wächst.
-- Zustand, Beiträge und Zustimmung (skill_room_state /
-- _entries / _votes) kommen in Stufe 4.
--
-- ── Das Sicherheitsmodell ist hier neu ────────────────────────
-- Bisher lag unter jedem Zugriff ein Netz: RLS prüft selbst, wem
-- eine Zeile gehört. Teilnehmer ohne Account sprechen als `anon`
-- mit dem Server — für sie gibt es dieses Netz nicht. Deshalb
-- drei Regeln, die in dieser Datei ausnahmslos gelten:
--
--   1) Anon fasst KEINE Tabelle an, auch nicht lesend. Die
--      Tabellen haben RLS ohne eine einzige Policy; alles läuft
--      über benannte security-definer-Funktionen.
--   2) KEINE Funktion für Anon nimmt eine Raum- oder Teilnehmer-
--      ID von außen. Die erste Zeile löst den Token auf, jede
--      weitere ID stammt aus dieser Auflösung. Sonst schriebe ein
--      Teilnehmer mit gültigem Token in einen fremden Raum.
--   3) Der Token verlässt die Datenbank genau einmal — in der
--      Antwort auf den Beitritt (und beim Wiederfinden der
--      eigenen Räume durch den EINGELOGGTEN Besitzer des Tokens).
--      In keiner Liste, keiner Ansicht steht der Token eines
--      anderen.
--
-- ── Warum der Beitritt NICHT hier stattfindet ─────────────────
-- Der Code ist das einzige erratbare Geheimnis im System. Wer ihn
-- prüft, muss zählen können, wie oft jemand daneben liegt — und
-- die Client-Adresse sieht nur die Vercel-Function, nicht die
-- Datenbank. Deshalb sind skill_room_peek und skill_room_join
-- ausschließlich an service_role vergeben: sie sind die beiden
-- Werkzeuge von /api/skill_join.js und für anon nicht aufrufbar.
--
-- Das ist keine Formalie. Gäbe es ein peek für anon, könnte man
-- Codes an der Vercel-Function vorbei durchprobieren und das
-- Rate-Limit wäre wirkungslos — die teuerste Art, eine Tür zu
-- verriegeln und das Fenster offen zu lassen.
--
-- Kein DROP — Idempotenz per DO-Block + pg_catalog-Check
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Code-Erzeugung
-- ─────────────────────────────────────────────────────────────
-- Alphabet ohne Verwechslungsgefahr: kein O/0, kein I/1. Genau 32
-- Zeichen — und 32 teilt 256 glatt, deshalb ist `byte % 32` ohne
-- Modulo-Verzerrung gleichverteilt. Bei 33 Zeichen wären die
-- ersten paar häufiger als der Rest.
--
-- 32^6 = 1.073.741.824 Möglichkeiten. Bei ein paar hundert
-- lebenden Räumen trifft ein zufälliger Versuch mit einer
-- Wahrscheinlichkeit im Bereich 1:5.000.000 — Durchprobieren ist
-- auch ohne Rate-Limit aussichtslos, mit Rate-Limit erst recht.
create or replace function skill_gen_code()
  returns text
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  ALPHABET constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes  bytea := gen_random_bytes(6);
  v_out    text := '';
  i        int;
begin
  for i in 0..5 loop
    v_out := v_out || substr(ALPHABET, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$$;

revoke all on function skill_gen_code() from public;

comment on function skill_gen_code() is
  'Sechsstelliger Raum-Code aus dem verwechslungsfreien Alphabet. Kein Grant an anon/authenticated '
  '— Codes werden ausschließlich in skill_room_create vergeben.';


-- ─────────────────────────────────────────────────────────────
-- 2) skill_rooms
-- ─────────────────────────────────────────────────────────────
-- expires_at ist eine ECHTE Spalte und nicht „last_active_at + 60
-- Tage" als Ausdruck: sonst gäbe es kein „Verlängern" (Stufe 5),
-- ohne die Aktivität zu fälschen. Beide Spalten stehen
-- nebeneinander, weil sie zwei verschiedene Fragen beantworten —
-- „wann war hier zuletzt jemand" und „wie lange gilt das noch".
--
-- Die Frist läuft ab letzter Aktivität, nicht ab dem Anlegen: ein
-- Raum, der über Wochen weiterbenutzt wird, darf nicht mitten in
-- der Reihe verfallen.
create table if not exists skill_rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  tool_id         text not null references skill_tools(id) on delete restrict,
  owner_id        uuid not null references profiles(id) on delete cascade,
  school_id       uuid not null references schools(id)  on delete cascade,
  title           text not null,
  ask_names       boolean not null default true,
  is_test         boolean not null default false,
  join_open       boolean not null default true,
  settings        jsonb   not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '60 days',
  constraint skill_rooms_code_shape  check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'),
  constraint skill_rooms_title_len   check (char_length(title) between 1 and 60)
);

comment on table skill_rooms is
  'Ein Raum: ein Tool, eine Lehrkraft, eine Gruppe — und ein Ablaufdatum. '
  'Der Code ist der Zugang; er wird nie an anon ausgeliefert, sondern nur geprüft.';
comment on column skill_rooms.is_test is
  'Testraum der Lehrkraft. Ein ganz normaler Raum, nur ausgenommen von der Raum-Obergrenze — '
  'es gibt bewusst keinen Solo-Modus, damit der Test dasselbe zeigt wie der Ernstfall.';
comment on column skill_rooms.ask_names is
  'false = anonymer Raum. Das Namensfeld entfällt beim Beitritt, jeder heißt Tablet 1…n.';
comment on column skill_rooms.join_open is
  'false = Raum bleibt lesbar und benutzbar, aber niemand kommt neu dazu.';
comment on column skill_rooms.settings is
  'Tool-eigene Einstellungen (bei der Wortwolke die Frage). Vom Tool interpretiert, '
  'gegen skill_tools.limits geprüft — ab Stufe 4.';
comment on column skill_rooms.expires_at is
  'Echte Spalte, nicht abgeleitet: sonst ließe sich „Verlängern" (Stufe 5) nur durch '
  'Fälschen der letzten Aktivität bauen.';

create index if not exists skill_rooms_owner_idx
  on skill_rooms(owner_id, tool_id);
create index if not exists skill_rooms_expires_idx
  on skill_rooms(expires_at);
create index if not exists skill_rooms_school_idx
  on skill_rooms(school_id);

-- Ein Testraum je (Lehrkraft, Tool). Ohne das sammelt „Testen" bei
-- jedem Klick einen weiteren Raum an — und weil Testräume nicht
-- mitzählen, würde das nie jemand bemerken.
create unique index if not exists skill_rooms_one_test_idx
  on skill_rooms(owner_id, tool_id) where is_test = true;


-- ─────────────────────────────────────────────────────────────
-- 3) skill_participants
-- ─────────────────────────────────────────────────────────────
-- Ein Gerät bzw. eine Person im Raum. Der Token ist das einzige
-- Geheimnis der Schülerseite: er steht im localStorage des Geräts
-- und ersetzt dort das Konto, das es nicht gibt.
--
-- name ist NULL im anonymen Raum. Der Anzeigename wird daraus
-- überall mit `coalesce(name, 'Tablet ' || seat)` gebildet — in
-- der Datenbank und nicht im Client, damit Beamer und Tablet
-- garantiert dasselbe anzeigen.
create table if not exists skill_participants (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references skill_rooms(id) on delete cascade,
  token         text not null unique,
  seat          int  not null,
  name          text,
  user_id       uuid references profiles(id) on delete set null,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  constraint skill_participants_seat_pos check (seat >= 1),
  constraint skill_participants_name_len check (name is null or char_length(name) between 1 and 24)
);

comment on table skill_participants is
  'Ein Gerät im Raum. Trägt den Token — das einzige Geheimnis der Schülerseite. '
  'Der Token steht in keiner Liste und keiner Ansicht anderer Teilnehmer.';
comment on column skill_participants.seat is
  'Laufende Nummer im Raum, ab 1. Im anonymen Raum ist sie der Name (Tablet 3).';
comment on column skill_participants.user_id is
  'Gesetzt, wenn beim Beitritt jemand eingeloggt war. Dann findet dieselbe Person ihren '
  'Raum auf einem zweiten Gerät wieder (skill_my_rooms) — ohne einen zweiten Platz zu belegen.';
comment on column skill_participants.last_seen_at is
  'Wird beim Poll nachgeführt, aber höchstens einmal pro Minute — sonst schriebe jedes '
  'Tablet alle 3 Sekunden in diese Tabelle.';

create index if not exists skill_participants_room_idx
  on skill_participants(room_id, seat);

-- Ein eingeloggter Teilnehmer belegt je Raum genau einen Platz.
-- Zweites Gerät heißt „Raum wiederfinden", nicht „zweimal drin".
create unique index if not exists skill_participants_room_user_idx
  on skill_participants(room_id, user_id) where user_id is not null;


-- ─────────────────────────────────────────────────────────────
-- 4) skill_join_attempts
-- ─────────────────────────────────────────────────────────────
-- Gleiches Muster wie signup_attempts (0018): nur FEHLGESCHLAGENE
-- Versuche, nur service_role, RLS ohne Policy.
create table if not exists skill_join_attempts (
  id          bigserial primary key,
  ip          text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists skill_join_attempts_ip_ts_idx
  on skill_join_attempts(ip, created_at desc);
create index if not exists skill_join_attempts_ts_idx
  on skill_join_attempts(created_at desc);

comment on table skill_join_attempts is
  'IP-Log fehlgeschlagener Beitritts- und Code-Prüfversuche für api/skill_join. '
  'Erfolgreiche Beitritte zählen nicht — eine Klasse mit Tippfehlern ist kein Angriff.';


-- ─────────────────────────────────────────────────────────────
-- 5) RLS — deny by default, ausnahmslos
-- ─────────────────────────────────────────────────────────────
-- Keine einzige Policy auf keiner der drei Tabellen. Weder anon
-- noch authenticated fassen sie direkt an; alles läuft über die
-- Funktionen weiter unten. service_role bypasst RLS von sich aus
-- (Supabase-Design), braucht aber die Grants.
alter table skill_rooms         enable row level security;
alter table skill_participants  enable row level security;
alter table skill_join_attempts enable row level security;

grant select, insert, update, delete on skill_rooms        to service_role;
grant select, insert, update, delete on skill_participants to service_role;
grant all on skill_join_attempts to service_role;
grant usage, select on sequence skill_join_attempts_id_seq to service_role;


-- ─────────────────────────────────────────────────────────────
-- 6) skill_touch — die Frist zurücksetzen
-- ─────────────────────────────────────────────────────────────
-- Wird bei echter Aktivität gerufen: anlegen, beitreten, Beitritt
-- umschalten, und (gedrosselt) wenn die Lehrkraft den Raum
-- öffnet. NICHT beim Poll — 28 Tablets alle 3 Sekunden wären
-- 9 Schreibzugriffe pro Sekunde für eine Zahl, die sich um
-- Stunden nicht ändert.
--
-- Die Drosselung steht in der WHERE-Klausel und nicht im Aufrufer:
-- so kann kein Aufrufer sie vergessen.
create or replace function skill_touch(p_room uuid)
  returns void
  security definer
  set search_path = public
  language sql
as $$
  update skill_rooms
     set last_active_at = now(),
         expires_at     = now() + interval '60 days'
   where id = p_room
     and last_active_at < now() - interval '5 minutes';
$$;

revoke all on function skill_touch(uuid) from public;

comment on function skill_touch(uuid) is
  'Setzt Aktivität und Ablauffrist eines Raums zurück, höchstens alle 5 Minuten. '
  'Kein Grant — wird nur aus anderen Funktionen dieser Datei gerufen.';


-- ─────────────────────────────────────────────────────────────
-- 7) skill_room_json / skill_people_json — gemeinsame Bausteine
-- ─────────────────────────────────────────────────────────────
-- Beide Seiten (Lehrkraft und Teilnehmer) zeigen denselben Raum
-- und dieselbe Anwesenheitsliste. Stünde das zweimal da, liefen
-- Beamer und Tablet früher oder später auseinander — genau das,
-- was bei einer Kachel für den Unterricht am meisten stört.
--
-- ONLINE_WINDOW: wer sich in den letzten 90 Sekunden gemeldet
-- hat, gilt als da. Der Poll läuft alle 3 s, die last_seen-
-- Drosselung greift jede Minute — 90 s ist die kleinste Zahl, die
-- beides sicher überdauert, ohne dass ein zugeklapptes Tablet
-- minutenlang als anwesend gilt.
create or replace function skill_people_json(p_room uuid, p_me uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(x order by x_seat), '[]'::jsonb)
    from (
      select p.seat as x_seat,
             jsonb_build_object(
               'id',      p.id,
               'seat',    p.seat,
               'name',    coalesce(p.name, 'Tablet ' || p.seat),
               'named',   (p.name is not null),
               'is_me',   (p_me is not null and p.id = p_me),
               'online',  (p.last_seen_at > now() - interval '90 seconds'),
               'joined_at', p.joined_at
             ) as x
        from skill_participants p
       where p.room_id = p_room
    ) t;
$$;

revoke all on function skill_people_json(uuid, uuid) from public;

comment on function skill_people_json(uuid, uuid) is
  'Anwesenheitsliste eines Raums — ohne Token, ohne user_id. Gemeinsamer Baustein von '
  'skill_room_get (Lehrkraft) und skill_view (Teilnehmer), damit Beamer und Tablet dasselbe zeigen.';


-- Nimmt die id und nicht die ganze Zeile: ein Parameter vom
-- Verbundtyp `skill_rooms` würde bei `p_room.code` erst als
-- „Spalte code der Tabelle p_room" gelesen und fiele nur deshalb
-- auf den Parameter zurück, weil zufällig keine so heißende
-- Tabelle im FROM steht. Ein zusätzlicher Indexzugriff je Raum ist
-- der bessere Preis als eine Auflösung, die von der Umgebung
-- abhängt.
create or replace function skill_room_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
    'code',        r.code,
    'title',       r.title,
    'tool_id',     r.tool_id,
    'tool_title',  t.title,
    'tool_icon',   t.icon,
    'tool_folder', t.folder,
    'ask_names',   r.ask_names,
    'is_test',     r.is_test,
    'join_open',   r.join_open,
    'settings',    r.settings,
    'created_at',  r.created_at,
    'expires_at',  r.expires_at,
    'max_participants', t.max_participants
  )
  from skill_rooms r
  join skill_tools t on t.id = r.tool_id
  where r.id = p_room;
$$;

revoke all on function skill_room_json(uuid) from public;

comment on function skill_room_json(uuid) is
  'Die Raum-Angaben, die BEIDE Seiten sehen dürfen. Enthält bewusst weder owner_id noch '
  'school_id noch die interne id — der Client kennt einen Raum an seinem Code.';


-- ─────────────────────────────────────────────────────────────
-- 8) Lehrkraft: Raum anlegen
-- ─────────────────────────────────────────────────────────────
-- Prüft in dieser Reihenfolge: angemeldet · darf unterrichten ·
-- Tool existiert und ist aktiv · Titel brauchbar · Obergrenze.
--
-- Die Obergrenze zählt nur LEBENDE Räume und nie den Testraum
-- (Konzept Abschnitt 06). Sie steht in skill_tools.max_rooms und
-- nicht als Konstante hier: fällt im Betrieb auf, dass 5 zu eng
-- ist, ist das ein UPDATE und keine Migration.
create or replace function skill_room_create(
  p_tool_id   text,
  p_title     text    default null,
  p_ask_names boolean default true,
  p_settings  jsonb   default '{}'::jsonb,
  p_is_test   boolean default false
)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_school uuid;
  v_tool   skill_tools;
  v_title  text;
  v_live   int;
  v_code   text;
  v_room   skill_rooms;
  i        int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not can_teach() then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;

  select school_id into v_school from profiles where id = v_user;
  if v_school is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  select * into v_tool from skill_tools where id = p_tool_id;
  if v_tool.id is null then
    return jsonb_build_object('ok', false, 'error', 'tool_unknown');
  end if;
  -- Abgeschaltetes Tool: bestehende Räume laufen weiter, neue gibt
  -- es nicht (Entscheidung 17.08.2026). Gilt auch für den Testraum
  -- — sonst wäre „abgeschaltet" für Admins nur eine Anzeige.
  if not v_tool.active then
    return jsonb_build_object('ok', false, 'error', 'tool_inactive');
  end if;

  -- Ein bestehender Testraum wird wiederverwendet statt vermehrt.
  if p_is_test then
    select * into v_room
      from skill_rooms
     where owner_id = v_user and tool_id = p_tool_id and is_test = true;
    if v_room.id is not null then
      -- Ein Testraum, den man wieder aufmacht, ist Aktivität: er
      -- soll nicht ablaufen, während er in Gebrauch ist.
      perform skill_touch(v_room.id);
      return jsonb_build_object(
        'ok', true, 'reused', true, 'code', v_room.code,
        'room', skill_room_json(v_room.id)
      );
    end if;
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    v_title := case when p_is_test then v_tool.title || ' (Test)' else v_tool.title end;
  end if;
  if char_length(v_title) > 60 then
    return jsonb_build_object('ok', false, 'error', 'title_too_long');
  end if;

  -- Obergrenze — Testräume und abgelaufene Räume zählen nicht mit.
  if not p_is_test then
    select count(*) into v_live
      from skill_rooms
     where owner_id = v_user and tool_id = p_tool_id
       and is_test = false and expires_at > now();

    -- multi_room = false heißt: genau einer, egal was max_rooms sagt.
    if not v_tool.multi_room and v_live >= 1 then
      return jsonb_build_object('ok', false, 'error', 'single_room_only', 'live', v_live);
    end if;
    if v_live >= v_tool.max_rooms then
      return jsonb_build_object('ok', false, 'error', 'room_limit',
                                'live', v_live, 'max', v_tool.max_rooms);
    end if;
  end if;

  -- Code suchen. Bei gut einer Milliarde Möglichkeiten ist schon
  -- der erste Versuch praktisch immer frei; die Schleife ist für
  -- den Fall, dass er es einmal nicht ist.
  for i in 1..12 loop
    v_code := skill_gen_code();
    begin
      insert into skill_rooms (code, tool_id, owner_id, school_id, title,
                               ask_names, is_test, settings)
      values (v_code, p_tool_id, v_user, v_school, v_title,
              coalesce(p_ask_names, true), coalesce(p_is_test, false),
              coalesce(p_settings, '{}'::jsonb))
      returning * into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
      -- Kollision auf dem Code → nächster Versuch. Kollidiert
      -- stattdessen der Testraum-Index (zwei Klicks gleichzeitig),
      -- hilft ein neuer Code nicht; dann greift die Prüfung unten.
      if p_is_test then
        select * into v_room
          from skill_rooms
         where owner_id = v_user and tool_id = p_tool_id and is_test = true;
        if v_room.id is not null then
          return jsonb_build_object(
            'ok', true, 'reused', true, 'code', v_room.code,
            'room', skill_room_json(v_room.id)
          );
        end if;
      end if;
    end;
  end loop;

  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'code_collision');
  end if;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'code', v_room.code,
    'room', skill_room_json(v_room.id)
  );
end;
$$;

revoke all on function skill_room_create(text, text, boolean, jsonb, boolean) from public;
grant execute on function skill_room_create(text, text, boolean, jsonb, boolean) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9) Lehrkraft: eigene Räume auflisten
-- ─────────────────────────────────────────────────────────────
-- Ein Roundtrip für die ganze Raumverwaltung. Enthält auch die
-- Obergrenze je Tool und wie viel davon verbraucht ist — die
-- Liste ist der Ort, an dem „du hast keinen Platz mehr" erklärt
-- werden muss, und dort steht auch der Raum, den man am ehesten
-- löschen will (der am längsten unbenutzte).
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
                                   and p.last_seen_at > now() - interval '90 seconds')
                  ) as x
        from skill_rooms r
       where r.owner_id = v_user
    ) t;

  -- Verbrauch je Tool: dieselbe Zählweise wie in skill_room_create,
  -- damit die Liste nicht „4 von 5" sagt und das Anlegen trotzdem
  -- scheitert.
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
           'title', t.title, 'icon', t.icon, 'active', t.active,
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
-- 10) Lehrkraft: ein Raum, vollständig
-- ─────────────────────────────────────────────────────────────
-- Die teure Anfrage der Beamer-Ansicht. Gerufen wird sie nur,
-- wenn skill_room_sig eine Änderung gemeldet hat.
--
-- Nimmt den Code und nicht die id: die Lehrkraft kennt ihren Raum
-- an dem, was an der Tafel steht, und die Beamer-Ansicht ist
-- deshalb lehrer.html#CODE. Die Besitzprüfung ist dieselbe.
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
    'is_owner', true
  );
end;
$$;

revoke all on function skill_room_get(text) from public;
grant execute on function skill_room_get(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 11) Signatur — die billige Anfrage
-- ─────────────────────────────────────────────────────────────
-- 28 Tablets × alle 3 Sekunden × mehrere Klassen parallel. Der
-- Unterschied zwischen einer teuren und einer billigen Anfrage
-- pro Tablet ist der Unterschied, ob das trägt. Die Trennung
-- steckt deshalb von Anfang an drin: erst fragen, OB sich etwas
-- geändert hat, und nur dann die vollständige Ansicht holen.
--
-- Die Signatur ist eine Zeichenkette, die der Client nur
-- vergleicht und nie auseinandernimmt. Was hineingehört, kann
-- sich mit jeder Stufe ändern (ab Stufe 4 Beiträge und Phase),
-- ohne dass der Client davon etwas wissen muss.
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
    (select extract(epoch from r.last_active_at)::bigint from skill_rooms r where r.id = p_room)
  );
$$;

revoke all on function skill_sig_of(uuid) from public;


create or replace function skill_room_sig(p_code text)
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

  return jsonb_build_object('ok', true, 'sig', skill_sig_of(v_room.id));
end;
$$;

revoke all on function skill_room_sig(text) from public;
grant execute on function skill_room_sig(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 12) Lehrkraft: Beitritt öffnen/schließen, Raum löschen
-- ─────────────────────────────────────────────────────────────
create or replace function skill_room_set_open(p_code text, p_open boolean)
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

  update skill_rooms
     set join_open      = coalesce(p_open, true),
         last_active_at = now(),
         expires_at     = now() + interval '60 days'
   where id = v_room.id;

  return jsonb_build_object('ok', true, 'join_open', coalesce(p_open, true));
end;
$$;

revoke all on function skill_room_set_open(text, boolean) from public;
grant execute on function skill_room_set_open(text, boolean) to authenticated;


-- Löschen heißt löschen: Raum, Teilnehmer und (ab Stufe 4) alles,
-- was daran hängt. Das erledigt `on delete cascade` — kein
-- Aufräumen von Hand, das man an einer Tabelle vergessen könnte.
-- Die Token der Schüler laufen danach in skill_view und bekommen
-- dort 'room_gone', also eine Meldung statt eines Fehlers.
create or replace function skill_room_delete(p_code text)
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

  delete from skill_rooms where id = v_room.id;
  return jsonb_build_object('ok', true, 'code', v_room.code);
end;
$$;

revoke all on function skill_room_delete(text) from public;
grant execute on function skill_room_delete(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 13) Teilnehmer: Ansicht und Signatur — nur über den Token
-- ─────────────────────────────────────────────────────────────
-- Regel 2 des Sicherheitsmodells in Reinform: die erste Zeile
-- löst den Token auf, jede weitere ID stammt aus dieser
-- Auflösung. Es gibt in diesen beiden Funktionen keinen Parameter,
-- mit dem sich ein anderer Raum ansprechen ließe.
--
-- last_seen wird hier nachgeführt, aber höchstens einmal pro
-- Minute. Die Bedingung steht in der WHERE-Klausel, nicht im
-- Aufrufer — dieselbe Überlegung wie bei skill_touch.
create or replace function skill_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
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

  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  return jsonb_build_object(
    'ok',     true,
    'room',   skill_room_json(v_room.id),
    'people', skill_people_json(v_room.id, v_p.id),
    'me', jsonb_build_object(
            'seat', v_p.seat,
            'name', coalesce(v_p.name, 'Tablet ' || v_p.seat),
            'named', (v_p.name is not null)
          )
  );
end;
$$;

revoke all on function skill_view(text) from public;
grant execute on function skill_view(text) to anon, authenticated;


create or replace function skill_sig(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
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

  update skill_participants
     set last_seen_at = now()
   where id = v_p.id and last_seen_at < now() - interval '1 minute';

  return jsonb_build_object('ok', true, 'sig', skill_sig_of(v_room.id));
end;
$$;

revoke all on function skill_sig(text) from public;
grant execute on function skill_sig(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 14) Eingeloggter Teilnehmer: eigene Räume wiederfinden
-- ─────────────────────────────────────────────────────────────
-- Der einzige Ort außer der Beitritts-Antwort, an dem ein Token
-- die Datenbank verlässt — und er gibt ausschließlich die Token
-- des Aufrufers heraus (Regel 3). Das ist der Sinn: wer beim
-- Beitritt angemeldet war, findet seinen Raum auf einem zweiten
-- Gerät wieder, ohne einen zweiten Platz zu belegen.
create or replace function skill_my_rooms()
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_out  jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(jsonb_agg(x order by x_joined desc), '[]'::jsonb)
    into v_out
    from (
      select p.joined_at as x_joined,
             jsonb_build_object(
               'token', p.token,
               'seat',  p.seat,
               'name',  coalesce(p.name, 'Tablet ' || p.seat),
               'room',  skill_room_json(r.id)
             ) as x
        from skill_participants p
        join skill_rooms r on r.id = p.room_id
       where p.user_id = v_user and r.expires_at > now()
    ) t;

  return jsonb_build_object('ok', true, 'rooms', v_out);
end;
$$;

revoke all on function skill_my_rooms() from public;
grant execute on function skill_my_rooms() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 15) service_role: Code prüfen (peek)
-- ─────────────────────────────────────────────────────────────
-- Was die Beitrittsseite VOR dem Beitritt zeigt: Raumtitel,
-- Werkzeug, und ob überhaupt jemand hereinkommt. Genau das, was
-- im Wireframe (Konzept Abschnitt 05) steht — und keine Zeile
-- mehr.
--
-- NUR an service_role vergeben. Wäre das für anon aufrufbar,
-- ließen sich Codes an der Vercel-Function und damit am
-- Rate-Limit vorbei durchprobieren.
create or replace function skill_room_peek(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room  skill_rooms;
  v_tool  skill_tools;
  v_count int;
begin
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_expired');
  end if;

  select * into v_tool from skill_tools where id = v_room.tool_id;
  select count(*) into v_count from skill_participants where room_id = v_room.id;

  return jsonb_build_object(
    'ok',         true,
    'code',       v_room.code,
    'title',      v_room.title,
    'tool_id',    v_room.tool_id,
    'tool_title', v_tool.title,
    'tool_icon',  v_tool.icon,
    'ask_names',  v_room.ask_names,
    'join_open',  v_room.join_open,
    'is_test',    v_room.is_test,
    'people',     v_count,
    'full',       (v_count >= v_tool.max_participants)
  );
end;
$$;

revoke all on function skill_room_peek(text) from public;
grant execute on function skill_room_peek(text) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 16) service_role: Beitritt
-- ─────────────────────────────────────────────────────────────
-- Alles, was atomar sein muss, steht hier und nicht im Endpunkt:
-- Platzprüfung und Sitznummer müssen unter einer Sperre laufen,
-- sonst bekommen zwei gleichzeitig beitretende Tablets denselben
-- Sitz — bei einem Klassensatz, der auf ein Kommando scannt, ist
-- das kein theoretischer Fall.
--
-- Im Endpunkt bleibt, was nur der Endpunkt sieht oder kann:
-- Client-IP, Rate-Limit, Schimpfwortprüfung und das Auflösen des
-- Access-Tokens zu einer user_id.
--
-- p_user_id kommt vom Endpunkt und NIE aus dem Request-Body — dort
-- wird es aus dem geprüften JWT abgeleitet. Deshalb ist diese
-- Funktion auch nur an service_role vergeben: als anon-Funktion
-- wäre der Parameter genau die „ID von außen", die Regel 2
-- verbietet.
create or replace function skill_room_join(
  p_code    text,
  p_name    text default null,
  p_user_id uuid default null
)
  returns jsonb
  security definer
  set search_path = public, extensions
  language plpgsql
as $$
declare
  v_room  skill_rooms;
  v_tool  skill_tools;
  v_p     skill_participants;
  v_name  text;
  v_count int;
  v_seat  int;
  v_token text;
begin
  -- Sperre auf der Raumzeile: ab hier zählt und sitzt nur einer
  -- gleichzeitig.
  select * into v_room from skill_rooms
   where code = upper(btrim(p_code)) for update;
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_expired');
  end if;

  select * into v_tool from skill_tools where id = v_room.tool_id;

  -- Wiedereintritt eines angemeldeten Teilnehmers: derselbe Platz,
  -- derselbe Token, kein zweiter Sitz. Das läuft VOR der Prüfung
  -- auf join_open und auf „voll" — wer schon drin ist, kommt auch
  -- dann zurück, wenn die Lehrkraft inzwischen zugemacht hat oder
  -- der Raum voll ist.
  if p_user_id is not null then
    select * into v_p from skill_participants
     where room_id = v_room.id and user_id = p_user_id;
    if v_p.id is not null then
      update skill_participants set last_seen_at = now() where id = v_p.id;
      return jsonb_build_object(
        'ok', true, 'rejoined', true,
        'token', v_p.token, 'seat', v_p.seat,
        'name', coalesce(v_p.name, 'Tablet ' || v_p.seat),
        'room', skill_room_json(v_room.id)
      );
    end if;
  end if;

  if not v_room.join_open then
    return jsonb_build_object('ok', false, 'error', 'join_closed');
  end if;

  select count(*), coalesce(max(seat), 0)
    into v_count, v_seat
    from skill_participants where room_id = v_room.id;

  if v_count >= v_tool.max_participants then
    return jsonb_build_object('ok', false, 'error', 'room_full',
                              'max', v_tool.max_participants);
  end if;

  -- Im anonymen Raum wird ein mitgeschickter Name verworfen und
  -- nicht etwa beanstandet: „anonym" ist eine Eigenschaft des
  -- Raums, keine Eingabe des Geräts.
  v_name := case when v_room.ask_names
                 then nullif(btrim(coalesce(p_name, '')), '')
                 else null end;
  if v_room.ask_names and v_name is null then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  if v_name is not null and char_length(v_name) > 24 then
    return jsonb_build_object('ok', false, 'error', 'name_too_long');
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_seat  := v_seat + 1;

  insert into skill_participants (room_id, token, seat, name, user_id)
  values (v_room.id, v_token, v_seat, v_name, p_user_id)
  returning * into v_p;

  perform skill_touch(v_room.id);

  return jsonb_build_object(
    'ok', true, 'rejoined', false,
    'token', v_p.token, 'seat', v_p.seat,
    'name', coalesce(v_p.name, 'Tablet ' || v_p.seat),
    'room', skill_room_json(v_room.id)
  );
end;
$$;

revoke all on function skill_room_join(text, text, uuid) from public;
grant execute on function skill_room_join(text, text, uuid) to service_role;
