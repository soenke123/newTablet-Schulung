-- ══════════════════════════════════════════════════════════════
-- Migration 0226 — Raum-Tür: Code mit Ablauf, QR mit Geheimnis
-- ══════════════════════════════════════════════════════════════
-- Der 6-stellige Code bleibt (Entscheidung, DATENSCHUTZ.md). Er steht
-- am Beamer und landet auf Fotos — bisher galt er, solange der Raum
-- lebt (bis zu einem Jahr). Jetzt zwei Wege durch die offene Tür:
--
--   Code abtippen   gilt 90 Minuten ab Anlegen bzw. ab „Tür öffnen“
--                   (code_open_until). Danach: 'code_expired'. Die
--                   Lehrkraft öffnet ihn mit einem Klick wieder
--                   (skill_room_set_open(code, true)).
--   QR / Link       j.html#CODE-GEHEIMNIS. Das Geheimnis (join_secret,
--                   122 Bit) ist nicht zu erraten; es gilt, solange
--                   die Tür offen ist (join_open), ohne Zeitgrenze.
--
-- Unverändert: join_open (Lehrkraft macht ganz zu), Wiedereintritt
-- angemeldeter Teilnehmer, persönlicher Code (recover). Wer schon drin
-- ist, ist von nichts hiervon betroffen.
--
-- join_secret geht NUR an die Lehrkräfte des Raums (skill_room_get),
-- nie in skill_room_json — das bekommen auch Schüler.
--
-- api/skill_join.js reicht das Geheimnis durch (p_secret) und zählt
-- zusätzlich Fehlversuche über ALLE IPs: Bei einer Welle ist der Code-
-- Weg für ein paar Minuten zu, der QR-Weg bleibt offen.
--
-- Prüfstand: supabase/tests/0226_raum_tuer_code_qr.mjs
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) Spalten
-- ─────────────────────────────────────────────────────────────
-- Geheimnis aus gen_random_uuid (Kern-Postgres, 122 Zufallsbits) statt
-- pgcrypto: das liegt in Supabase im Schema extensions, in den
-- Prüfständen in public — so läuft die Spalte überall gleich.
-- Volatile Defaults werden beim Hinzufügen je Zeile ausgewertet:
-- jeder bestehende Raum bekommt sein eigenes Geheimnis, und sein Code
-- gilt noch 90 Minuten ab dem Einspielen.
alter table skill_rooms
  add column if not exists join_secret text not null
    default replace(gen_random_uuid()::text, '-', '');
alter table skill_rooms
  add column if not exists code_open_until timestamptz
    default now() + interval '90 minutes';

comment on column skill_rooms.join_secret is
  'Geheimnis im QR-Code/Link (j.html#CODE-GEHEIMNIS, 0226). Mit ihm gilt der Beitritt, '
  'solange join_open; ohne nur bis code_open_until. Nur für Lehrkräfte des Raums sichtbar.';
comment on column skill_rooms.code_open_until is
  'Bis wann der 6-stellige Code allein zum Beitritt reicht (0226). Anlegen und '
  '„Tür öffnen“ setzen ihn auf jetzt + 90 Minuten.';


-- ─────────────────────────────────────────────────────────────
-- 2) Tür-Prüfung (intern)
-- ─────────────────────────────────────────────────────────────
-- null = darf durch, sonst der Fehlercode.
create or replace function skill_room_door(p_room skill_rooms, p_secret text)
  returns text
  stable
  set search_path = public
  language sql
as $$
  select case
    when p_secret is not null and p_secret = p_room.join_secret then null
    when p_room.code_open_until is not null and p_room.code_open_until > now() then null
    else 'code_expired'
  end;
$$;

revoke all on function skill_room_door(skill_rooms, text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) skill_room_peek — mit Geheimnis
-- ─────────────────────────────────────────────────────────────
drop function if exists skill_room_peek(text);

create or replace function skill_room_peek(p_code text, p_secret text default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room  skill_rooms;
  v_tool  skill_tools;
  v_count int;
  v_door  text;
begin
  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_expired');
  end if;

  -- 0226: abgelaufener Code verrät nichts über den Raum.
  v_door := skill_room_door(v_room, nullif(btrim(coalesce(p_secret, '')), ''));
  if v_door is not null then
    return jsonb_build_object('ok', false, 'error', v_door);
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

revoke all on function skill_room_peek(text, text) from public, anon, authenticated;
grant execute on function skill_room_peek(text, text) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 4) skill_room_join — mit Geheimnis (Rumpf aus 0187)
-- ─────────────────────────────────────────────────────────────
drop function if exists skill_room_join(text, text, uuid);

create or replace function skill_room_join(
  p_code    text,
  p_name    text default null,
  p_user_id uuid default null,
  p_secret  text default null
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
  v_door  text;
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
  -- join_open, Code-Ablauf (0226) und „voll" — wer schon drin ist,
  -- kommt auch dann zurück, wenn die Lehrkraft inzwischen zugemacht hat.
  --
  -- Hat er den Raum verlassen, steht er damit auch wieder in seiner
  -- Liste (0088). Dasselbe gilt seit 0187 für ein Kind, das die
  -- Lehrkraft aus dem Raum genommen hat.
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

  -- 0226: Code allein nur bis code_open_until, mit Geheimnis immer.
  v_door := skill_room_door(v_room, nullif(btrim(coalesce(p_secret, '')), ''));
  if v_door is not null then
    return jsonb_build_object('ok', false, 'error', v_door);
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

revoke all on function skill_room_join(text, text, uuid, text) from public, anon, authenticated;
grant execute on function skill_room_join(text, text, uuid, text) to service_role;


-- ─────────────────────────────────────────────────────────────
-- 5) Lehrkraft: Geheimnis + Ablauf sehen, Code wieder öffnen
-- ─────────────────────────────────────────────────────────────
-- Beide Funktionen ändern sich nur an einer Stelle; der heutige Rumpf
-- (0205) wird gelesen und genau dort ergänzt. Fehlt die Stelle, bricht
-- die Migration ab, statt still nichts zu tun.
do $mig$
declare
  v_src text;
  v_new text;
begin
  -- skill_room_get: nur Lehrkräfte des Raums kommen bis hierher.
  v_src := pg_get_functiondef('skill_room_get(text)'::regprocedure);
  v_new := replace(v_src,
    $a$'expired',        (v_room.expires_at <= now())$a$,
    $b$'expired',        (v_room.expires_at <= now()),
                 'join_secret',     v_room.join_secret,
                 'code_open_until', v_room.code_open_until$b$);
  if v_new = v_src then
    raise exception '0226: Stelle in skill_room_get nicht gefunden';
  end if;
  execute v_new;

  -- skill_room_set_open: „Tür öffnen“ gibt dem Code wieder 90 Minuten.
  v_src := pg_get_functiondef('skill_room_set_open(text, boolean)'::regprocedure);
  v_new := replace(v_src,
    $a$set join_open      = coalesce(p_open, true),$a$,
    $b$set join_open      = coalesce(p_open, true),
         code_open_until = case when coalesce(p_open, true)
                                then now() + interval '90 minutes'
                                else code_open_until end,$b$);
  v_new := replace(v_new,
    $a$return jsonb_build_object('ok', true, 'join_open', coalesce(p_open, true));$a$,
    $b$return jsonb_build_object('ok', true, 'join_open', coalesce(p_open, true),
    'code_open_until', (select code_open_until from skill_rooms where id = v_room.id));$b$);
  if v_new = v_src or position('code_open_until' in v_new) = 0
     or position($c$'code_open_until', (select$c$ in v_new) = 0 then
    raise exception '0226: Stelle in skill_room_set_open nicht gefunden';
  end if;
  execute v_new;
end
$mig$;
