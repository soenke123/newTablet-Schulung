-- ══════════════════════════════════════════════════════════════
-- Migration 0284 — Laufzeit eines Raums wählbar (2 · 10 · 30 · 90 · 180 Tage)
-- ══════════════════════════════════════════════════════════════
-- Sönke 11.11.2026: Beim Erstellen eines Raums gibt die Lehrkraft an,
-- wie lange er „leben" soll. Jeder Skill bringt eine Vorgabe mit
-- (skill_tools.lifetime_days), die im Formular vorausgewählt ist.
--
-- Bisher: 30 Tage nach der letzten Nutzung, an vier Stellen hart
-- verdrahtet (skill_touch, skill_room_set_open, skill_room_update,
-- skill_room_extend — alle setzen expires_at = now() + 30 Tage),
-- Projektarbeit per Trigger mindestens ein Jahr (0202).
--
-- Jetzt:
--   skill_rooms.lifetime_days   gewählte Laufzeit des Raums. Bedeutung
--                               wie bisher: so lange nach der letzten
--                               Nutzung. Bestand: 30, Projektarbeit 365
--                               (das hatte 0202 versprochen).
--   skill_tools.lifetime_days   Vorgabe je Skill.
--   Trigger skill_room_lifetime Die Aktivitäts-Stellen schreiben weiter
--                               „now() + 30 days". Statt sie alle neu zu
--                               deklarieren, fängt der Trigger genau
--                               diesen Wert ab und macht daraus
--                               greatest(alte Frist, now() + Laufzeit).
--                               Damit verkürzt Aktivität auch keinen
--                               verlängerten Raum mehr. Jeder andere Wert
--                               (Verlängern, Tests, Ablauf von Hand)
--                               bleibt, wie er geschrieben wurde.
--   pa_room_lifetime (0202)     wird zum No-op: Projektarbeit hat jetzt
--                               ihre eigene Vorgabe (180 Tage).
--   skill_room_create           + p_lifetime_days (2/10/30/90/180, leer =
--                               Vorgabe des Skills).
--   skill_room_extend           + p_days: um so viele Tage verlängern
--                               (leer = Laufzeit des Raums), höchstens
--                               bis ein Jahr ab heute (Datenschutz).
--   skill_rooms_list            liefert lifetime_days je Raum und je Skill.
--
-- Prüfstand: supabase/tests/0284_raum_laufzeit.mjs
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Spalten
-- ─────────────────────────────────────────────────────────────
alter table skill_rooms add column if not exists lifetime_days int not null default 30;
alter table skill_tools add column if not exists lifetime_days int not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'skill_rooms_lifetime_days_check') then
    alter table skill_rooms add constraint skill_rooms_lifetime_days_check
      check (lifetime_days between 1 and 365);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'skill_tools_lifetime_days_check') then
    alter table skill_tools add constraint skill_tools_lifetime_days_check
      check (lifetime_days in (2, 10, 30, 90, 180));
  end if;
end $$;

comment on column skill_rooms.lifetime_days is
  'Laufzeit in Tagen (0284): so lange nach der letzten Nutzung bleibt der Raum. Beim Anlegen '
  'gewählt (2/10/30/90/180), Vorgabe aus skill_tools.lifetime_days. Bestand 30, Projektarbeit 365.';
comment on column skill_tools.lifetime_days is
  'Vorgabe für die Laufzeit neuer Räume dieses Skills (0284), im Formular vorausgewählt.';

-- Vorgaben je Skill (Sönke 11.11.2026), Caesar nachgereicht: 2.
update skill_tools set lifetime_days = case id
    when 'knowledgestack' then 2
    when 'clash-of-math'  then 2
    when 'diagramm'       then 30
    when 'wordcloud'      then 30
    when 'neurolab'       then 30
    when 'balance'        then 30
    when 'wildclusters'   then 10
    when 'tinylm'         then 10
    when 'reinforce'      then 10
    when 'wordisland'     then 10
    when 'caesar'         then 2
    when 'sqlstudio'      then 90
    when 'derby'          then 90
    when 'socialhub'      then 90
    when 'synir'          then 90
    when 'scrum'          then 180
    when 'projekt'        then 180
    else lifetime_days end;

-- Bestehende Projektarbeit-Räume behalten ihr Jahr aus 0202. Neue
-- haben 180 und werden davon nicht erfasst (Wiederholung harmlos).
update skill_rooms set lifetime_days = 365
 where tool_id = 'projekt' and lifetime_days = 30;


-- ─────────────────────────────────────────────────────────────
-- 2) Aktivität verlängert um die Laufzeit des Raums
-- ─────────────────────────────────────────────────────────────
create or replace function skill_room_lifetime()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  -- Genau der Wert, den die Aktivitäts-Stellen schreiben. Verlängern
  -- (skill_room_extend) setzt den Merker, damit ein zufällig gleicher
  -- Wert dort nicht umgedeutet wird.
  if new.expires_at = now() + interval '30 days'
     and coalesce(current_setting('mps.room_extend', true), '') <> '1' then
    new.expires_at := greatest(old.expires_at, now() + make_interval(days => new.lifetime_days));
  end if;
  return new;
end;
$$;

revoke all on function skill_room_lifetime() from public;

create or replace trigger skill_room_lifetime
  before update of expires_at on skill_rooms
  for each row execute function skill_room_lifetime();

-- 0202: Projektarbeit mindestens ein Jahr — jetzt über lifetime_days.
create or replace function pa_room_lifetime()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  return new;   -- seit 0284 ohne Wirkung, siehe skill_room_lifetime
end;
$$;

revoke all on function pa_room_lifetime() from public;


-- ─────────────────────────────────────────────────────────────
-- 3) skill_room_create — Stand 0086, dazu p_lifetime_days
-- ─────────────────────────────────────────────────────────────
drop function if exists skill_room_create(text, text, boolean, jsonb, boolean);

create or replace function skill_room_create(
  p_tool_id   text,
  p_title     text    default null,
  p_ask_names boolean default true,
  p_settings  jsonb   default '{}'::jsonb,
  p_is_test   boolean default false,
  p_lifetime_days int default null
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
  v_err    text;
  v_days   int;
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

  -- Die Gruppenliste muss stimmen, bevor der Raum entsteht.
  v_err := skill_check_settings(p_settings, coalesce(v_tool.limits, '{}'::jsonb));
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  -- 0284: Laufzeit. Ohne Angabe die Vorgabe des Skills.
  if p_lifetime_days is not null and p_lifetime_days not in (2, 10, 30, 90, 180) then
    return jsonb_build_object('ok', false, 'error', 'lifetime_invalid');
  end if;
  v_days := coalesce(p_lifetime_days, v_tool.lifetime_days, 30);

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
                               ask_names, is_test, settings,
                               lifetime_days, expires_at)
      values (v_code, p_tool_id, v_user, v_school, v_title,
              coalesce(p_ask_names, true), coalesce(p_is_test, false),
              coalesce(p_settings, '{}'::jsonb),
              v_days, now() + make_interval(days => v_days))
      returning * into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
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

revoke all on function skill_room_create(text, text, boolean, jsonb, boolean, int) from public;
grant execute on function skill_room_create(text, text, boolean, jsonb, boolean, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) skill_room_extend — Stand 0205, dazu p_days
-- ─────────────────────────────────────────────────────────────
drop function if exists skill_room_extend(text);

create or replace function skill_room_extend(p_code text, p_days int default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_days int;
  v_new  timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_days is not null and p_days not in (2, 10, 30, 90, 180) then
    return jsonb_build_object('ok', false, 'error', 'lifetime_invalid');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_days := coalesce(p_days, v_room.lifetime_days, 30);

  -- Auch ein abgelaufener Raum lässt sich zurückholen, solange er noch
  -- da ist (zwischen Ablauf und Aufräum-Lauf liegt bis zu ein Tag).
  -- Höchstens ein Jahr ab heute: mehr verträgt die Löschfrist nicht.
  v_new := least(greatest(now(), v_room.expires_at) + make_interval(days => v_days),
                 now() + interval '365 days');

  perform set_config('mps.room_extend', '1', true);
  update skill_rooms set expires_at = v_new where id = v_room.id;
  perform set_config('mps.room_extend', '', true);

  return jsonb_build_object('ok', true, 'expires_at', v_new, 'days', v_days,
                            'revived', (v_room.expires_at <= now()));
end;
$$;

revoke all on function skill_room_extend(text, int) from public;
grant execute on function skill_room_extend(text, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) skill_rooms_list — Stand 0250, dazu lifetime_days
-- ─────────────────────────────────────────────────────────────
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

  -- Vor dem Lesen, nicht danach: sonst stünden die gerade gelöschten
  -- Räume noch in der Antwort, die die Löschung ausgelöst hat.
  perform skill_cleanup_maybe();

  select coalesce(jsonb_agg(x order by x_test, x_active desc), '[]'::jsonb)
    into v_rooms
    from (
      select r.is_test as x_test, r.last_active_at as x_active,
             skill_room_json(r.id)
               || jsonb_build_object(
                    'last_active_at', r.last_active_at,
                    'expired',        (r.expires_at <= now()),
                    'lifetime_days',  r.lifetime_days,
                    'people',  (select count(*) from skill_participants p where p.room_id = r.id),
                    'online',  (select count(*) from skill_participants p
                                 where p.room_id = r.id
                                   and p.last_seen_at > now() - interval '90 seconds'),
                    'blocked', (select count(*) from skill_participants p
                                 where p.room_id = r.id and p.blocked),
                    'entries', (select count(*) from skill_room_entries e where e.room_id = r.id)
                  )
               || case when r.owner_id = v_user then '{}'::jsonb
                       else jsonb_build_object(
                              'co_teacher', true,
                              'owner_name', (select coalesce(o.display_name, o.account_name)
                                               from profiles o where o.id = r.owner_id)) end as x
        from skill_rooms r
       where r.owner_id = v_user
          or exists (select 1 from skill_room_teachers t where t.room_id = r.id and t.user_id = v_user)
    ) t;

  -- subject, subcategory, sort_order seit 0250: das Dropdown für neue
  -- Räume ordnet danach (ein jsonb-Objekt hat selbst keine Reihenfolge).
  select coalesce(jsonb_object_agg(t.id, jsonb_build_object(
           'title', t.title, 'icon', t.icon, 'active', t.active,
           'folder', t.folder,
           'limits', t.limits,
           'multi_room', t.multi_room,
           'max_rooms', t.max_rooms,
           'subject', t.subject,
           'subcategory', t.subcategory,
           'sort_order', t.sort_order,
           'lifetime_days', t.lifetime_days,
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
