-- ═══════════════════════════════════════════════════════════════
-- 0187 — Online, offline, stillgelegt — und „aus dem Raum nehmen"
-- ═══════════════════════════════════════════════════════════════
-- Sönkes Wunsch: im Onboarding hat jedes Kind einen von drei
-- Zuständen, und die Lehrkraft hat zwei Griffe.
--
--   online       fragt in den letzten 90 Sekunden (wie 0079)
--   offline      fragt nicht mehr. Stillgelegt UND offline ist offline.
--   stillgelegt  online, aber von der Lehrkraft stillgelegt (0081)
--
--   Stilllegen   das Kind bleibt im Raum, zählt aber für keine
--                Teamaufteilung und bekommt keine Vokabeln. Umkehrbar.
--   Entfernen    NEU. Das Kind ist wirklich raus aus dem Raum. Alles,
--                was es geschrieben oder gespielt hat, bleibt stehen,
--                und mit dem Code kommt es jederzeit wieder rein —
--                keine Sperre.
--
-- Regel für die Teams, jetzt in allen Skills gleich (Muster Kingdoms
-- 0113): verteilt wird nur, wer beim Start ONLINE und NICHT
-- stillgelegt ist. Wer später online kommt, landet im kleinsten Volk
-- (0121/0152). Wordisland gab bis hier auch Offline-Kindern beim
-- Start ein Volk (0133) — das fällt weg.
--
-- In den Skills mit Lobby (Kingdoms, Wordisland, Knowledge Stack)
-- stehen Offline- und stillgelegte Kinder unten in einer eigenen
-- Zeile. Dafür liefert skill_absent_json beide Listen an einer
-- Stelle, damit die drei Skills nicht dreimal dieselbe Regel
-- nachbauen.
--
-- ── Ein Fehler, der hier mit behoben wird ──────────────────────
-- skill_sig stieg bei einem stillgelegten Gerät VOR dem
-- last_seen_at-Update aus (0081). Das Gerät fragt zwar weiter, galt
-- aber nach 90 Sekunden als offline — „stillgelegt" und „offline"
-- waren damit nach anderthalb Minuten nicht mehr zu unterscheiden.
-- 0081 wollte es ausdrücklich anders („dass ein gesperrtes Gerät
-- weiter fragt, ist die Information, die zählt"). Ab hier zählt die
-- Anwesenheit auch für Stillgelegte weiter. Alle Stellen, die
-- Anwesende verteilen oder zählen, filtern `not blocked` ohnehin
-- selbst (0113, 0121, 0128, 0152).
--
-- ── Wie „Entfernen" gebaut ist ─────────────────────────────────
-- Gelöscht wird nichts (dieselbe Begründung wie 0088: Beiträge und
-- Stimmen hängen mit on delete cascade an der Teilnehmer-Zeile).
-- Stattdessen `removed_at`:
--   · skill_sig und skill_view antworten 'removed'. Das Gerät
--     baut den Raum ab und sagt es dem Kind.
--   · left_at wird gesetzt — der Raum verschwindet aus der Liste
--     des Kindes (skill_my_rooms, 0088).
--   · last_seen_at wird zurückgestellt — das Kind ist in derselben
--     Sekunde in keiner Anwesenheitszählung mehr.
--   · Eine etwaige Stilllegung wird aufgehoben: wer wiederkommt,
--     kommt ohne Sperre.
-- Zurück geht es über den Code:
--   · angemeldet: skill_room_join findet den Platz über die User-ID
--     (0079) und räumt removed_at weg.
--   · ohne Anmeldung: das Gerät hat seinen Token noch und ruft
--     skill_room_return. Derselbe Platz, dieselben Beiträge.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Die Spalte
-- ─────────────────────────────────────────────────────────────
alter table skill_participants
  add column if not exists removed_at timestamptz;

comment on column skill_participants.removed_at is
  'Von der Lehrkraft aus dem Raum genommen (0187). Die Zeile bleibt mit allen Beiträgen stehen; '
  'skill_sig/skill_view antworten ''removed''. Mit dem Code kommt das Kind zurück '
  '(skill_room_join über die User-ID, skill_room_return über den Token) — dann wieder null.';


-- ─────────────────────────────────────────────────────────────
-- 2) skill_absent_json — wer unten in der Lobby steht
-- ─────────────────────────────────────────────────────────────
-- Zwei Listen nach Sitzplatz, ohne Entfernte:
--   offline  nicht in den letzten 90 s gesehen — stillgelegt oder nicht
--   blocked  online, aber stillgelegt
-- Zusammen mit den Verteilten ergibt das genau den Raum: wer online
-- und nicht stillgelegt ist, steht in einem Team.
create or replace function skill_absent_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
    'offline', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', skill_seat_name(p.name, p.seat))
                       order by p.seat)
        from skill_participants p
       where p.room_id = p_room
         and p.removed_at is null
         and p.last_seen_at <= now() - interval '90 seconds'), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', skill_seat_name(p.name, p.seat))
                       order by p.seat)
        from skill_participants p
       where p.room_id = p_room
         and p.removed_at is null
         and p.blocked
         and p.last_seen_at > now() - interval '90 seconds'), '[]'::jsonb)
  );
$$;

revoke all on function skill_absent_json(uuid) from public;

comment on function skill_absent_json(uuid) is
  'Offline (nicht in 90 s gesehen, auch wenn stillgelegt) und stillgelegt (online + blocked) '
  'je Raum, nach Sitzplatz, ohne Entfernte (0187). Für die Zeile unten in der Lobby.';


-- ─────────────────────────────────────────────────────────────
-- 3) skill_room_remove — aus dem Raum nehmen
-- ─────────────────────────────────────────────────────────────
-- Besitzer-Prüfung wie skill_room_set_blocked (0081).
create or replace function skill_room_remove(
  p_code        text,
  p_participant uuid
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

  update skill_participants
     set removed_at   = now(),
         left_at      = coalesce(left_at, now()),
         blocked      = false,
         blocked_at   = null,
         last_seen_at = now() - interval '1 day'
   where id = p_participant and room_id = v_room.id and removed_at is null;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function skill_room_remove(text, uuid) from public;
grant execute on function skill_room_remove(text, uuid) to authenticated;

comment on function skill_room_remove(text, uuid) is
  'Nimmt ein Kind aus dem Raum (0187): removed_at + left_at, Anwesenheit zurückgestellt, '
  'Stilllegung aufgehoben. Nichts wird gelöscht; mit dem Code kommt es zurück. Nur Raum-Besitzer.';


-- ─────────────────────────────────────────────────────────────
-- 4) skill_room_return — mit dem eigenen Token zurück
-- ─────────────────────────────────────────────────────────────
-- Der Weg für Geräte ohne Anmeldung. Der Token ist die Berechtigung
-- (Regel 2 aus 0079/0080), deshalb anon UND authenticated wie
-- skill_view. Wie der Wiedereintritt in skill_room_join gilt er auch
-- bei geschlossenem Beitritt: wer schon drin war, kommt zurück.
-- Die Antwort hat die Form von skill_room_join, damit das Gerät
-- denselben Weg weitergeht.
create or replace function skill_room_return(p_token text)
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
     set removed_at   = null,
         left_at      = null,
         last_seen_at = now()
   where id = v_p.id;

  perform skill_touch(v_room.id);

  return jsonb_build_object(
    'ok', true, 'rejoined', true,
    'token', v_p.token, 'seat', v_p.seat,
    'name', skill_seat_name(v_p.name, v_p.seat),
    'blocked', v_p.blocked,
    'room', skill_room_json(v_room.id)
  );
end;
$$;

revoke all on function skill_room_return(text) from public;
grant execute on function skill_room_return(text) to anon, authenticated;

comment on function skill_room_return(text) is
  'Rückweg eines entfernten Geräts ohne Anmeldung (0187): derselbe Platz, derselbe Token, '
  'dieselben Beiträge. Gilt auch bei geschlossenem Beitritt.';


-- ─────────────────────────────────────────────────────────────
-- 5) skill_sig — 'removed', und Stillgelegte bleiben anwesend
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0081, Wort für Wort. Zwei mit „0187" markierte Stellen.
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
  -- 0187: aus dem Raum genommen. Vor allem anderen, und OHNE das
  -- last_seen_at-Update: das Kind soll sofort aus jeder
  -- Anwesenheitszählung verschwinden.
  if v_p.removed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  if v_p.blocked then
    -- 0187: ein stillgelegtes Gerät fragt weiter und IST damit da.
    -- Ohne diese Zeile stünde es nach 90 s als offline in der Liste.
    update skill_participants
       set last_seen_at = now()
     where id = v_p.id and last_seen_at < now() - interval '1 minute';
    return jsonb_build_object('ok', false, 'error', 'blocked');
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
-- 6) skill_view — 'removed'
-- ─────────────────────────────────────────────────────────────
-- skill_view ist groß (0086) und hat mit „Entfernen" sonst nichts zu
-- tun. Statt sie abzuschreiben, bekommt sie einen Vorbau — Muster
-- 0185 (shop_state_merge). Die 0086-Fassung bleibt als
-- _skill_view_v86 erhalten.
--
-- ⚠️ Wer skill_view künftig neu schreibt, nimmt die Fassung aus 0086
-- als Grundlage UND übernimmt den removed-Riegel von hier.
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_skill_view_v86') then
    alter function skill_view(text) rename to _skill_view_v86;
  end if;
end $$;

revoke all on function _skill_view_v86(text) from public, anon, authenticated;

create or replace function skill_view(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if exists (select 1 from skill_participants
              where token = p_token and removed_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'removed');
  end if;
  return _skill_view_v86(p_token);
end;
$$;

revoke all on function skill_view(text) from public;
grant execute on function skill_view(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) skill_people_json — Entfernte stehen in keiner Liste
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0084, Wort für Wort. Neu ist die eine where-Zeile.
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
         and p.removed_at is null                 -- 0187
    ) t;
$$;

revoke all on function skill_people_json(uuid, uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 8) skill_room_join — der Wiedereintritt räumt removed_at weg
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0088, Wort für Wort. Neu ist eine Zeile im
-- Wiedereintritts-Zweig: wer angemeldet ist und entfernt wurde, ist
-- mit dem Code wieder drin.
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
  --
  -- Hat er den Raum verlassen, steht er damit auch wieder in seiner
  -- Liste (0088): den Code erneut einzugeben ist die Aussage „ich
  -- will wieder mitmachen", und mehr braucht es dafür nicht.
  -- Dasselbe gilt seit 0187 für ein Kind, das die Lehrkraft aus dem
  -- Raum genommen hat.
  if p_user_id is not null then
    select * into v_p from skill_participants
     where room_id = v_room.id and user_id = p_user_id;
    if v_p.id is not null then
      update skill_participants
         set last_seen_at = now(),
             left_at      = null,
             removed_at   = null                 -- 0187
       where id = v_p.id;
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


-- ═════════════════════════════════════════════════════════════
-- Kingdoms of Mathoria
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 9) clash_preview_teams — ohne Entfernte
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0126, Wort für Wort. Neu ist die letzte where-Zeile.
-- Entfernte sind über last_seen_at ohnehin offline; die Zeile hält
-- das auch dann, wenn ein letzter Abruf des Werkzeugs die Anwesenheit
-- noch einmal aufgefrischt hat.
create or replace function clash_preview_teams(p_room uuid)
  returns table(participant_id uuid, team_index int)
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p.id,
         case when b.mode = 'pve' then 0
              else ((dense_rank() over (
                      order by
                        case when b.shuffle_seed is null then p.seat end,
                        case when b.shuffle_seed is not null
                             then md5(p.id::text || b.shuffle_seed::text) end
                    ))::int - 1) % b.team_count
         end
    from skill_participants p
    join clash_boards b on b.room_id = p.room_id
   where p.room_id = p_room
     and p.last_seen_at > now() - interval '90 seconds'
     and not p.blocked
     and p.removed_at is null;                -- 0187
$$;

revoke all on function clash_preview_teams(uuid) from public;

comment on function clash_preview_teams(uuid) is
  'Team-Index je ANWESENDEM Teilnehmer (last_seen_at < 90s wie 0079, nicht blocked, seit 0187 '
  'nicht entfernt) nach Sitzplatz- oder Schuffel-Reihenfolge (0104/0113). Seit 0126: im PvE-Modus '
  'gehören alle zu Slot 0. Vor dem Start eine reine Vorschau, beim Start die Quelle für die '
  'endgültige clash_players-Zuordnung.';


-- ─────────────────────────────────────────────────────────────
-- 10) clash_room_get — offline und stillgelegt getrennt
-- ─────────────────────────────────────────────────────────────
-- offline_members war bis hier „alle, die in keinem Team stehen"
-- (Komplement, 0097). Ein stillgelegtes Kind stand damit am Beamer
-- unter „Gerade nicht online". Jetzt:
--   offline_members  nur Offline (auch stillgelegt + offline)
--   blocked_members  online und stillgelegt
-- Vorbau wie in Abschnitt 6, die 0126-Fassung (rund 200 Zeilen)
-- bleibt als _clash_room_get_v126.
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_clash_room_get_v126') then
    alter function clash_room_get(text) rename to _clash_room_get_v126;
  end if;
end $$;

revoke all on function _clash_room_get_v126(text) from public, anon, authenticated;

create or replace function clash_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v      jsonb := _clash_room_get_v126(p_code);
  v_room uuid;
  v_abs  jsonb;
begin
  -- Besitzer-Prüfung und alles andere macht die alte Fassung.
  if coalesce((v->>'ok')::boolean, false) is not true then
    return v;
  end if;
  select id into v_room from skill_rooms where code = upper(btrim(p_code));
  v_abs := skill_absent_json(v_room);
  return v || jsonb_build_object(
    'offline_members', coalesce((select jsonb_agg(x->'name') from jsonb_array_elements(v_abs->'offline') x), '[]'::jsonb),
    'blocked_members', coalesce((select jsonb_agg(x->'name') from jsonb_array_elements(v_abs->'blocked') x), '[]'::jsonb)
  );
end;
$$;

revoke all on function clash_room_get(text) from public;
grant execute on function clash_room_get(text) to authenticated;

comment on function clash_room_get(text) is
  'Beamer-Ansicht von Kingdoms (Fassung 0126 als _clash_room_get_v126). Seit 0187 ist '
  'offline_members nur noch, wer offline ist, und blocked_members, wer online und stillgelegt ist.';


-- ═════════════════════════════════════════════════════════════
-- Knowledge Stack
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 11) ks_room_get — die Lobby-Wiese zeigt nur, wer da ist
-- ─────────────────────────────────────────────────────────────
-- Knowledge Stack hat keine Teams; die Regel greift hier nur in der
-- Lobby: auf der Wiese steht, wer online und nicht stillgelegt ist,
-- und darunter die beiden Listen. Im Quiz bleiben alle Spieler mit
-- ihren Punkten stehen — wer kurz offline ist, verliert seinen Platz
-- auf der Rangliste nicht. Vorbau wie in Abschnitt 6.
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_ks_room_get_v186') then
    alter function ks_room_get(text) rename to _ks_room_get_v186;
  end if;
end $$;

revoke all on function _ks_room_get_v186(text) from public, anon, authenticated;

create or replace function ks_room_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v      jsonb := _ks_room_get_v186(p_code);
  v_room uuid;
  v_abs  jsonb;
  v_away uuid[];
begin
  if coalesce((v->>'ok')::boolean, false) is not true then
    return v;
  end if;
  select id into v_room from skill_rooms where code = upper(btrim(p_code));
  v_abs := skill_absent_json(v_room);

  if v->>'phase' = 'lobby' then
    select coalesce(array_agg(p.id), '{}')
      into v_away
      from skill_participants p
     where p.room_id = v_room
       and (p.removed_at is not null
            or p.blocked
            or p.last_seen_at <= now() - interval '90 seconds');
    v := v || jsonb_build_object('players', coalesce((
      select jsonb_agg(x order by o)
        from jsonb_array_elements(v->'players') with ordinality e(x, o)
       where not ((x->>'participant_id')::uuid = any(v_away))), '[]'::jsonb));
  end if;

  return v || jsonb_build_object(
    'offline_members', coalesce((select jsonb_agg(x->'name') from jsonb_array_elements(v_abs->'offline') x), '[]'::jsonb),
    'blocked_members', coalesce((select jsonb_agg(x->'name') from jsonb_array_elements(v_abs->'blocked') x), '[]'::jsonb)
  );
end;
$$;

revoke all on function ks_room_get(text) from public;
grant execute on function ks_room_get(text) to authenticated;

comment on function ks_room_get(text) is
  'Beamer-Ansicht von Knowledge Stack (Fassung 0186 als _ks_room_get_v186). Seit 0187 in der '
  'Lobby nur Spieler, die online und nicht stillgelegt sind, dazu offline_members und '
  'blocked_members für die Zeile darunter.';


-- ═════════════════════════════════════════════════════════════
-- Myth of Wordisland — Offline-Kinder bekommen kein Volk
-- ═════════════════════════════════════════════════════════════
-- Bis hier verteilte Wordisland beim Start ALLE nicht stillgelegten
-- Kinder (0133/0152), auch die, die gerade nicht am Tablet sind.
-- Jetzt wie Kingdoms: nur wer online ist. Wer später kommt, landet
-- über wi_ensure_player im kleinsten Volk und bekommt ab dann seine
-- Vokabeln — genau wie ein Nachzügler.

-- ─────────────────────────────────────────────────────────────
-- 12) wi_seat_assign
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0152, Wort für Wort. Neu: online und nicht entfernt.
create or replace function wi_seat_assign(p_room uuid, p_teams int)
  returns void
  volatile
  set search_path = public
  language plpgsql
as $$
begin
  delete from wi_players where room_id = p_room;

  insert into wi_players (participant_id, room_id, team_index)
  select p.id, p_room, (dense_rank() over (order by p.seat) - 1)::int % p_teams
    from skill_participants p
   where p.room_id = p_room
     and not p.blocked                       -- 0152
     and p.removed_at is null                -- 0187
     and p.last_seen_at > now() - interval '90 seconds';   -- 0187
end;
$$;

comment on function wi_seat_assign(uuid, int) is
  'Verteilt die Teilnehmer eines Raums reihum auf die Slots 0..p_teams-1, nach Sitzplatz '
  'sortiert. Setzt Serien, Punkte und laufende Aufgaben zurück — eine neue Aufstellung ist '
  'ein neuer Anfang. Seit 0152 ohne stillgelegte Tablets, seit 0187 nur wer online ist '
  '(90 s wie 0079) und nicht entfernt.';


-- ─────────────────────────────────────────────────────────────
-- 13) wi_room_shuffle
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0152, Wort für Wort. Dieselben zwei Zeilen.
create or replace function wi_room_shuffle(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room uuid := wi_owned_room(p_code);
  v_b    wi_boards;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from wi_boards where room_id = v_room;
  if v_b.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'phase_locked');
  end if;

  delete from wi_players where room_id = v_room;
  insert into wi_players (participant_id, room_id, team_index)
  select p.id, v_room, (row_number() over (order by random()) - 1)::int % v_b.team_count
    from skill_participants p
   where p.room_id = v_room
     and not p.blocked                       -- 0152
     and p.removed_at is null                -- 0187
     and p.last_seen_at > now() - interval '90 seconds';   -- 0187

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function wi_room_shuffle(text) from public;
grant execute on function wi_room_shuffle(text) to authenticated;

comment on function wi_room_shuffle(text) is
  'Würfelt die Aufstellung neu. Nur in der Lobby, nur der Raum-Besitzer. Seit 0152 ohne '
  'stillgelegte Tablets, seit 0187 nur wer online ist.';


-- ─────────────────────────────────────────────────────────────
-- 14) wi_ensure_player — der Nachzügler
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0152, Wort für Wort. Neu:
--   · Entfernte bekommen ebenfalls keine Zeile.
--   · Das kleinste Volk zählt nur Anwesende — dieselbe Regel wie
--     Kingdoms 0121 (active_n). Sonst gälte ein Volk voller
--     Offline-Kinder als voll, und der Nachzügler landete dort, wo
--     real niemand spielt.
create or replace function wi_ensure_player(p_participant uuid, p_room uuid, p_teams int)
  returns wi_players
  volatile
  set search_path = public
  language plpgsql
as $$
declare
  v_p wi_players;
  v_t int;
begin
  select * into v_p from wi_players where participant_id = p_participant;
  if v_p.participant_id is not null then
    return v_p;
  end if;

  -- 0152: Stillgelegte spielen nicht mit, also brauchen sie auch
  -- kein Volk. Die leere Zeile kommt zurück; der Aufrufer prüft.
  -- 0187: Entfernte ebenso.
  if exists (select 1 from skill_participants sp
              where sp.id = p_participant
                and (sp.blocked or sp.removed_at is not null)) then
    return v_p;
  end if;

  select coalesce((
    select t.team_index
      from generate_series(0, p_teams - 1) as t(team_index)
      left join wi_players w on w.room_id = p_room and w.team_index = t.team_index
      left join skill_participants sp on sp.id = w.participant_id
                                     and not sp.blocked      -- 0152
                                     and sp.removed_at is null                              -- 0187
                                     and sp.last_seen_at > now() - interval '90 seconds'    -- 0187
     group by t.team_index
     order by count(sp.id), t.team_index
     limit 1
  ), 0) into v_t;

  insert into wi_players (participant_id, room_id, team_index)
  values (p_participant, p_room, v_t)
  on conflict (participant_id) do nothing;

  select * into v_p from wi_players where participant_id = p_participant;
  return v_p;
end;
$$;

comment on function wi_ensure_player(uuid, uuid, int) is
  'Legt die Spieler-Zeile eines Nachzüglers im KLEINSTEN Volk an (Muster aus Kingdoms '
  '0121/0128). Stillgelegte (0152) und Entfernte (0187) bekommen keine Zeile; „klein" zählt '
  'seit 0187 nur Anwesende (online, nicht stillgelegt, nicht entfernt).';


-- ─────────────────────────────────────────────────────────────
-- 15) wi_teams_json — die Kopfzahl zählt Anwesende
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0158, Wort für Wort. `people` zählt seit 0187 nur, wer
-- online und nicht entfernt ist — dieselben Kinder, die am Pult in
-- der Spalte stehen. `correct` bleibt die Summe aller nicht
-- Stillgelegten: was ein Kind richtig hatte, gehört dem Volk auch
-- dann, wenn es gerade offline ist.
create or replace function wi_teams_json(p_room uuid, p_teams int)
  returns jsonb
  stable
  set search_path = public
  language sql
as $$
  select coalesce(jsonb_agg(x order by (x->>'i')::int), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'i',       t.i,
               'tiles',   coalesce(f.n, 0),
               'ruins',   coalesce(f.rv, 0),
               'score',   coalesce(f.n, 0) + coalesce(f.rv, 0),
               'people',  coalesce(p.n, 0),
               'correct', coalesce(p.c, 0)              -- 0158
             ) as x
        from generate_series(0, p_teams - 1) as t(i)
        left join (
          select owner_team, count(*) n,
                 sum(case when ruin_kind is null then 0 else ruin_value - 1 end) rv
            from wi_tiles where room_id = p_room and owner_team is not null
           group by owner_team
        ) f on f.owner_team = t.i
        left join (
          select w.team_index,
                 count(*) filter (                                     -- 0187
                   where sp.removed_at is null
                     and sp.last_seen_at > now() - interval '90 seconds') n,
                 sum(coalesce(w.correct_count, 0)) c                -- 0158
            from wi_players w
            join skill_participants sp on sp.id = w.participant_id   -- 0152
           where w.room_id = p_room
             and not sp.blocked                                      -- 0152
           group by w.team_index
        ) p on p.team_index = t.i
    ) s;
$$;

comment on function wi_teams_json(uuid, int) is
  'Felder, Ruinenwert, Punktzahl und Kopfzahl je Volk. Die Kopfzahl zählt seit 0152 nur '
  'Tablets, die spielen dürfen, seit 0187 nur Anwesende (online, nicht entfernt). Seit 0158 '
  'zusätzlich `correct`: die richtig beantworteten Wörter des ganzen Volkes.';


-- ─────────────────────────────────────────────────────────────
-- 16) wi_room_start — die Insel für die, die da sind
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0153, Wort für Wort. Neu ist die Bedingung an v_people:
-- dieselben Kinder, die wi_seat_assign gleich verteilt.
create or replace function wi_room_start(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := wi_owned_room(p_code);
  v_b      wi_boards;
  v_people int;
  v_n      int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_b from wi_boards where room_id = v_room;

  if not exists (select 1 from wi_room_sets where room_id = v_room) then
    return jsonb_build_object('ok', false, 'error', 'no_sets');
  end if;

  select count(*) into v_people
    from skill_participants
   where room_id = v_room
     and not blocked                         -- 0152
     and removed_at is null                  -- 0187
     and last_seen_at > now() - interval '90 seconds';     -- 0187

  -- Alte Aufstellung weg: eine neue Runde ist eine neue Insel und
  -- eine neue Verteilung. Die Wiedervorlage (vocab_progress) bleibt
  -- — was ein Kind kann, kann es auch in der zweiten Runde.
  perform wi_seat_assign(v_room, v_b.team_count);

  -- 0153: die Strichliste dagegen gehört der Runde und nur ihr.
  delete from wi_round_words where room_id = v_room;

  v_n := wi_build_island(v_room, v_b.team_count, v_people, v_b.duration_secs);

  update wi_boards
     set phase = 'countdown',
         countdown_ends_at = now() + interval '5 seconds',
         started_at = null, ends_at = null, ended_at = null, winner_team = null,
         seed = (floor(random() * 1000000))::int,
         presenter_seen_at = now()
   where room_id = v_room;

  return jsonb_build_object('ok', true, 'tiles', v_n);
end;
$$;

revoke all on function wi_room_start(text) from public;
grant execute on function wi_room_start(text) to authenticated;

comment on function wi_room_start(text) is
  'Startet eine Runde: Aufstellung neu, Insel neu, Strichliste leer, Countdown. Verteilt und '
  'gezählt wird seit 0187 nur, wer online, nicht stillgelegt (0152) und nicht entfernt ist; '
  'seit 0153 beginnt die Wörter-Auswertung bei null.';


-- ─────────────────────────────────────────────────────────────
-- 17) wi_room_get — ohne Entfernte
-- ─────────────────────────────────────────────────────────────
-- Grundlage: 0152, Wort für Wort. Entfernte fallen aus der
-- Personenliste und aus beiden Zahlen; Offline und Stillgelegt
-- sortiert das Pult selbst aus `online` und `blocked`.
create or replace function wi_room_get(p_code text, p_full boolean default false)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room   uuid := wi_owned_room(p_code);
  v_b      wi_boards;
  v_online int;
  v_total  int;
begin
  if v_room is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_b := wi_maybe_advance(v_room);

  select count(*) filter (where p.last_seen_at > now() - interval '90 seconds'),
         count(*)
    into v_online, v_total
    from skill_participants p where p.room_id = v_room
     and p.removed_at is null;               -- 0187

  return jsonb_build_object(
    'ok',      true,
    'role',    'presenter',
    'phase',   v_b.phase,
    'mode',    v_b.mode,
    'direction', v_b.direction,
    'teams',   wi_teams_json(v_room, v_b.team_count),
    'team_count', v_b.team_count,
    'factions',   v_b.factions,
    'duration',   v_b.duration_secs,
    'radius',     v_b.radius,
    'seed',       v_b.seed,
    'map_key', v_room::text || ':' || coalesce(v_b.started_at, v_b.created_at)::text,
    'map',     case when p_full then wi_map_json(v_room) else null end,
    'own',     wi_own_string(v_room),
    'ruins',   wi_ruin_string(v_room),
    'hearts',  wi_heart_string(v_room),
    'ends_at', v_b.ends_at,
    'countdown_ends_at', v_b.countdown_ends_at,
    'winner_team', v_b.winner_team,
    'online_count', v_online,
    'room_total',   v_total,
    'sets', coalesce((select jsonb_agg(set_id) from wi_room_sets where room_id = v_room), '[]'::jsonb),
    -- Die Aufstellung sieht nur das Pult, und nur mit Namen: sie
    -- ist zum Vorlesen da („Tablet 7, du bist bei den
    -- Socken-Piraten"), nicht zum Bewerten.
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seat', p.seat,
               'name', coalesce(p.name, 'Tablet ' || p.seat),
               'team', w.team_index,
               'online', p.last_seen_at > now() - interval '90 seconds',
               'blocked', p.blocked,                                  -- 0152
               'correct', coalesce(w.correct_count, 0),
               'wrong',   coalesce(w.wrong_count, 0)) order by p.seat)
        from skill_participants p
        left join wi_players w on w.participant_id = p.id
       where p.room_id = v_room
         and p.removed_at is null), '[]'::jsonb)                      -- 0187
  );
end;
$$;

revoke all on function wi_room_get(text, boolean) from public;
grant execute on function wi_room_get(text, boolean) to authenticated;

comment on function wi_room_get(text, boolean) is
  'Beamer-Ansicht von Myth of Wordisland. Seit 0152 trägt jedes Kind zusätzlich `blocked`, '
  'seit 0187 fehlen aus dem Raum genommene Kinder in Liste und Zahlen.';
