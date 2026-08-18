-- ═══════════════════════════════════════════════════════════════
-- 0084 — Raum-Einstellungen nachträglich ändern · „User" statt
--        „Tablet" im anonymen Raum
-- ═══════════════════════════════════════════════════════════════
-- Die Raumseite bekommt drei Reiter: Einstellungen · Onboarding ·
-- das Werkzeug. Damit fällt der Anlege-Dialog weg — was er gefragt
-- hat, steht jetzt im ersten Reiter, und der bleibt nach dem
-- Anlegen erreichbar. Genau das braucht diese Migration:
--
--   1) skill_room_update — Titel, Namensabfrage und die
--      werkzeugeigenen Einstellungen ändern, nachdem der Raum
--      steht. Bis hierher gab es dafür keinen Weg: skill_rooms
--      hat RLS ohne Policy, geschrieben wird ausschließlich über
--      benannte Funktionen, und die einzige davon war
--      skill_room_create.
--
--   2) Der Anzeigename im anonymen Raum heißt „User 3" statt
--      „Tablet 3". Ein Tablet ist das Gerät; gemeint ist die
--      Person davor, und in einem Raum, in dem zwei Klassen
--      dieselben Geräte teilen, sagt „Tablet 3" das Falsche.
--
-- ── Was sich NICHT ändert ──────────────────────────────────────
-- Der Name wird weiterhin in der DATENBANK gebildet und nicht im
-- Client (0079): Beamer und Tablet müssen garantiert dasselbe
-- zeigen. Neu ist nur, dass die Zeichenkette an EINER Stelle
-- steht — skill_seat_name(). Vorher stand sie in fünf Funktionen,
-- und genau deshalb ist diese Umbenennung eine Migration mit fünf
-- Neudeklarationen statt einer Zeile.
--
-- ⚠️ Jede der fünf ist aus ihrer JEWEILS AKTUELLEN Fassung
-- übernommen (skill_view / skill_people_json / skill_room_join aus
-- 0081, skill_entries_json aus 0080, skill_my_rooms aus 0079) —
-- eine aus 0079 kopierte skill_view hätte die Sperrprüfung aus
-- 0081 wieder verloren.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Der Anzeigename an einer Stelle
-- ─────────────────────────────────────────────────────────────
-- immutable und nicht stable: aus denselben zwei Werten folgt
-- immer dieselbe Zeichenkette, es wird nichts gelesen.
create or replace function skill_seat_name(p_name text, p_seat int)
  returns text
  immutable
  language sql
as $$
  select coalesce(p_name, 'User ' || p_seat);
$$;

revoke all on function skill_seat_name(text, int) from public;

comment on function skill_seat_name(text, int) is
  'Anzeigename eines Teilnehmers: der eingetragene Name, sonst „User <Platznummer>". '
  'Die einzige Stelle im System, an der diese Zeichenkette steht — sie wird in der DB '
  'gebildet und nicht im Client, damit Beamer und Tablet garantiert dasselbe zeigen.';

comment on column skill_participants.seat is
  'Laufende Nummer im Raum, ab 1. Im anonymen Raum ist sie der Name (User 3).';
comment on column skill_rooms.ask_names is
  'false = anonymer Raum. Das Namensfeld entfällt beim Beitritt, jeder heißt User 1…n.';


-- ─────────────────────────────────────────────────────────────
-- 2) Die fünf Leser des Anzeigenamens
-- ─────────────────────────────────────────────────────────────
-- Unverändert bis auf den einen Ausdruck.

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
               'name',    skill_seat_name(p.name, p.seat),
               'named',   (p.name is not null),
               'is_me',   (p_me is not null and p.id = p_me),
               'online',  (p.last_seen_at > now() - interval '90 seconds'),
               'blocked', p.blocked,
               'joined_at', p.joined_at
             ) as x
        from skill_participants p
       where p.room_id = p_room
    ) t;
$$;

revoke all on function skill_people_json(uuid, uuid) from public;


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
                              else skill_seat_name(pa.name, pa.seat)
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
               'name',  skill_seat_name(p.name, p.seat),
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
  if v_p.blocked then
    return jsonb_build_object('ok', false, 'error', 'blocked');
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
            'name',  skill_seat_name(v_p.name, v_p.seat),
            'named', (v_p.name is not null),
            'entries_used', (select count(*) from skill_room_entries e
                              where e.room_id = v_room.id and e.participant_id = v_p.id),
            'may_write', skill_may_write(v_lim, v_phase)
          )
  );
end;
$$;

revoke all on function skill_view(text) from public;
grant execute on function skill_view(text) to anon, authenticated;


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
  -- derselbe Token, kein zweiter Sitz. Das läuft VOR der Prüfung auf
  -- join_open und auf „voll" — wer schon drin ist, kommt auch dann
  -- zurück, wenn die Lehrkraft inzwischen zugemacht hat.
  if p_user_id is not null then
    select * into v_p from skill_participants
     where room_id = v_room.id and user_id = p_user_id;
    if v_p.id is not null then
      update skill_participants set last_seen_at = now() where id = v_p.id;
      return jsonb_build_object(
        'ok', true, 'rejoined', true,
        'token', v_p.token, 'seat', v_p.seat,
        'name', skill_seat_name(v_p.name, v_p.seat),
        'blocked', v_p.blocked,
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

  -- Im anonymen Raum wird ein mitgeschickter Name verworfen und nicht
  -- etwa beanstandet: „anonym" ist eine Eigenschaft des Raums, keine
  -- Eingabe des Geräts.
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
    'name', skill_seat_name(v_p.name, v_p.seat),
    'blocked', false,
    'room', skill_room_json(v_room.id)
  );
end;
$$;

revoke all on function skill_room_join(text, text, uuid) from public;
grant execute on function skill_room_join(text, text, uuid) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 3) Einstellungen ändern, nachdem der Raum steht
-- ─────────────────────────────────────────────────────────────
-- Teilweise Änderung: null heißt „unverändert", nicht „leeren".
-- Sonst müsste der Reiter „Einstellungen" bei jedem Speichern alle
-- Felder mitschicken, auch die, die er gerade gar nicht anzeigt.
--
-- ── Was sich ändern lässt und was nicht ────────────────────────
-- Der Reiter zeigt gesperrte Felder weiterhin an, nur nicht mehr
-- änderbar — verschwundene Felder beantworten die Frage „wo ist
-- die Frage hin?" nicht. Durchgesetzt wird die Sperre hier und
-- nicht im Browser:
--
--   titel      immer. Er steht nur in der Raumliste der Lehrkraft.
--
--   ask_names  nur, solange NIEMAND beigetreten ist. Wer schon drin
--              ist, hat seinen Namen unter der Ansage abgegeben, die
--              beim Beitritt galt — „anonym" nachträglich
--              einzuschalten nähme die Namen nicht weg (sie stehen
--              in skill_participants.name), es verspräche nur etwas,
--              das nicht mehr einzuhalten ist. Und andersherum
--              säßen im Raum plötzlich Leute ohne Namen, die keiner
--              mehr nachtragen kann.
--
--   settings   nur, solange KEIN Beitrag da ist. Die Frage einer
--              Wortwolke ist die Überschrift über allem, was
--              darunter steht; wird sie ausgetauscht, sobald 20
--              Zettel liegen, antworten die Zettel auf etwas
--              anderes als das, was oben steht.
--
-- Beide Grenzen sind bewusst hart und nicht „mit Warnung trotzdem":
-- eine Warnung mitten in der Stunde liest niemand zu Ende.
create or replace function skill_room_update(
  p_code      text,
  p_title     text    default null,
  p_ask_names boolean default null,
  p_settings  jsonb   default null
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user   uuid := auth.uid();
  v_room   skill_rooms;
  v_title  text;
  v_people int;
  v_ent    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or v_room.owner_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Titel
  if p_title is not null then
    v_title := nullif(btrim(p_title), '');
    if v_title is null then
      return jsonb_build_object('ok', false, 'error', 'title_required');
    end if;
    if char_length(v_title) > 60 then
      return jsonb_build_object('ok', false, 'error', 'title_too_long');
    end if;
  end if;

  -- Namensabfrage
  if p_ask_names is not null and p_ask_names <> v_room.ask_names then
    select count(*) into v_people
      from skill_participants where room_id = v_room.id;
    if v_people > 0 then
      return jsonb_build_object('ok', false, 'error', 'has_participants',
                                'people', v_people);
    end if;
  end if;

  -- Werkzeug-Einstellungen
  if p_settings is not null then
    if jsonb_typeof(p_settings) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    -- Die Tabelle hat dafür einen Constraint (0080). Hier abgefangen,
    -- damit der Client eine Antwort bekommt und keinen SQL-Fehler.
    if octet_length(p_settings::text) > 8192 then
      return jsonb_build_object('ok', false, 'error', 'payload_too_big');
    end if;
    if p_settings <> v_room.settings then
      select count(*) into v_ent
        from skill_room_entries where room_id = v_room.id;
      if v_ent > 0 then
        return jsonb_build_object('ok', false, 'error', 'has_entries', 'entries', v_ent);
      end if;
    end if;
  end if;

  update skill_rooms
     set title          = coalesce(v_title, title),
         ask_names      = coalesce(p_ask_names, ask_names),
         settings       = coalesce(p_settings, settings),
         last_active_at = now(),
         expires_at     = now() + interval '60 days'
   where id = v_room.id;

  return jsonb_build_object('ok', true, 'room', skill_room_json(v_room.id));
end;
$$;

revoke all on function skill_room_update(text, text, boolean, jsonb) from public;
grant execute on function skill_room_update(text, text, boolean, jsonb) to authenticated;

comment on function skill_room_update(text, text, boolean, jsonb) is
  'Raum-Einstellungen ändern, nachdem er steht — für den Reiter „Einstellungen" der '
  'Raumseite. null heißt unverändert. Der Titel ist immer änderbar, die Namensabfrage nur '
  'vor dem ersten Beitritt (has_participants), die Werkzeug-Einstellungen nur vor dem '
  'ersten Beitrag (has_entries).';

-- Kein eigener „was ist noch änderbar"-Aufruf: skill_room_get liefert
-- der Lehrkraft ohnehin die vollständige Teilnehmer- UND Beitragsliste
-- (0080, p_all = true). Der Reiter zählt sie ab, statt dieselben zwei
-- Zahlen ein zweites Mal zu holen — eine zweite Quelle für dieselbe
-- Auskunft läuft irgendwann auseinander.
