-- ══════════════════════════════════════════════════════════════
-- Migration 0088 — MPSkills: einen Raum verlassen
-- ══════════════════════════════════════════════════════════════
-- Auf der Landing bekommen die besuchten Räume einen eigenen
-- Abschnitt aus kleinen Kacheln, und an jeder Kachel steht hinter
-- drei Punkten „Raum verlassen". Für ein Gerät ohne Konto ist das
-- eine reine Sache des localStorage — dort steht die ganze Liste.
-- Für jemanden mit Konto nicht: seine Liste kommt seit diesem
-- Umbau vom Server (skill_my_rooms), damit sie auf dem zweiten
-- Gerät auch dasteht und beim Abmelden von selbst verschwindet.
-- Ohne einen Merker in der Datenbank käme ein verlassener Raum
-- beim nächsten Laden also einfach zurück.
--
-- ── ⚠️ Gelöscht wird nichts ───────────────────────────────────
-- Der naheliegende Weg wäre `delete from skill_participants`. Er
-- ist falsch: skill_room_entries.participant_id und
-- skill_room_votes.participant_id hängen mit `on delete cascade`
-- an dieser Zeile (0080). Ein Verlassen risse damit die Beiträge
-- und Stimmen mit weg — aus der Wolke der ganzen Klasse, nicht nur
-- aus der eigenen Ansicht. Dazu käme, dass die Platznummer wieder
-- frei würde und beim nächsten Beitritt ein zweites Mal vergeben.
--
-- Also ein Merker, wie `blocked` (0081) und wie `hidden` an den
-- Beiträgen (0080): AUSBLENDEN STATT LÖSCHEN. Zeile, Token,
-- Platznummer, Beiträge, Stimmen und eine etwaige Sperre bleiben
-- unangetastet — nur skill_my_rooms verschweigt den Raum danach.
--
-- ── Der Rückweg ist der Code ──────────────────────────────────
-- Wer denselben Code erneut eingibt, landet im Wiedereintritts-
-- Zweig von skill_room_join und ist wieder drin: derselbe Platz,
-- derselbe Token, dieselben Zettel. Dort wird left_at wieder
-- geleert. Das ist der ganze Rückweg, und er braucht deshalb keine
-- eigene Erklärung in der Oberfläche.
--
-- ── Sicherheitsmodell unverändert (0079/0080) ─────────────────
-- skill_room_leave nimmt als erste und einzige Zeile den TOKEN und
-- löst daraus alles Weitere auf — keine Raum- oder Teilnehmer-ID
-- von außen (Regel 2). Vergeben an anon UND authenticated wie
-- skill_view/skill_sig: der Token ist die Berechtigung.
--
-- Keine drop-Anweisungen — beide neu deklarierten Funktionen
-- behalten ihre Signatur.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Der Merker
-- ─────────────────────────────────────────────────────────────
alter table skill_participants
  add column if not exists left_at timestamptz;

comment on column skill_participants.left_at is
  'Gesetzt, wenn jemand den Raum aus seiner eigenen Liste genommen hat. Die Zeile bleibt '
  'stehen: an ihr hängen Beiträge und Stimmen (on delete cascade) und die Platznummer. '
  'Wirkt nur auf skill_my_rooms; ein Wiedereintritt über den Code leert das Feld.';

-- Die Abfrage in skill_my_rooms lautet „meine Räume, die ich nicht
-- verlassen habe" — der vorhandene Index auf (room_id, seat) hilft
-- ihr nicht, gesucht wird über user_id.
create index if not exists skill_participants_user_idx
  on skill_participants(user_id) where user_id is not null and left_at is null;


-- ─────────────────────────────────────────────────────────────
-- 2) Verlassen
-- ─────────────────────────────────────────────────────────────
-- Bewusst OHNE blocked-Prüfung, anders als die vier lesenden und
-- schreibenden Token-Funktionen aus 0081: wer gesperrt ist, darf
-- den Raum erst recht aus seiner Liste nehmen. Und ohne Prüfung
-- auf den Ablauf des Raums — einen abgelaufenen Raum wegzuräumen
-- ist genau das, wozu der Knopf da ist.
create or replace function skill_room_leave(p_token text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p skill_participants;
begin
  select * into v_p from skill_participants where token = p_token;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;

  update skill_participants
     set left_at = now()
   where id = v_p.id and left_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function skill_room_leave(text) is
  'Nimmt einen Raum aus der eigenen Liste (skill_my_rooms). Löscht nichts — siehe '
  'Kopf von Migration 0088. Der Wiedereintritt über den Code macht es rückgängig.';

revoke all on function skill_room_leave(text) from public;
grant execute on function skill_room_leave(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) skill_my_rooms — verlassene Räume raus, zwei Daten dazu
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Basis ist die Fassung aus 0084 (skill_seat_name), NICHT die
-- aus 0079.
--
-- joined_at und last_seen_at gehen mit hinaus, weil auf der Kachel
-- „zuletzt besucht" steht. last_seen_at ist dafür die ehrlichere
-- Zahl als joined_at: der Poller führt es ohnehin nach (höchstens
-- einmal pro Minute, 0079), es beantwortet also „wann war ich das
-- letzte Mal drin" und nicht „wann bin ich beigetreten".
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

  select coalesce(jsonb_agg(x order by x_seen desc), '[]'::jsonb)
    into v_out
    from (
      select p.last_seen_at as x_seen,
             jsonb_build_object(
               'token',        p.token,
               'seat',         p.seat,
               'name',         skill_seat_name(p.name, p.seat),
               'joined_at',    p.joined_at,
               'last_seen_at', p.last_seen_at,
               'room',         skill_room_json(r.id)
             ) as x
        from skill_participants p
        join skill_rooms r on r.id = p.room_id
       where p.user_id = v_user
         and p.left_at is null
         and r.expires_at > now()
    ) t;

  return jsonb_build_object('ok', true, 'rooms', v_out);
end;
$$;

revoke all on function skill_my_rooms() from public;
grant execute on function skill_my_rooms() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) skill_room_join — der Wiedereintritt holt den Raum zurück
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Basis ist die Fassung aus 0084. Die aus 0079 hätte die Sperre
-- (blocked, 0081) und skill_seat_name (0084) wieder verloren —
-- siehe die Warnung im Kopf von 0084.
--
-- Einzige Änderung: der Wiedereintritts-Zweig setzt left_at zurück.
-- Er läuft weiterhin VOR der Prüfung auf join_open und „voll".
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
  if p_user_id is not null then
    select * into v_p from skill_participants
     where room_id = v_room.id and user_id = p_user_id;
    if v_p.id is not null then
      update skill_participants
         set last_seen_at = now(),
             left_at      = null
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
