-- ══════════════════════════════════════════════════════════════
-- Migration 0205 — Projektarbeit: weitere Lehrkräfte, Lehrkraft-Kommentare
-- ══════════════════════════════════════════════════════════════
-- Sönke (08.10.2026), zwei Wünsche an den Skill aus 0200–0204:
--
-- ── 1) Weitere Lehrkräfte in einen Raum einladen ─────────────────
-- Über das Menü (drei Punkte oben rechts) lädt eine Lehrkraft gezielt
-- eine andere Lehrkraft derselben Schule in den Raum ein. Die Einladung
-- gilt sofort — die Eingeladene findet den Raum unter „Meine Räume"
-- und hat dieselben Rechte wie der Raum-Besitzer: Gruppen bilden,
-- Planungsräume öffnen, Anträge entscheiden, Einwilligungen, Codes,
-- Export/Import/Backups, Beitritt auf/zu, Kinder stilllegen/entfernen,
-- Einstellungen, verlängern, und selbst weitere Lehrkräfte einladen
-- oder wieder austragen. Mails bei neuen Anträgen (0203) bekommt sie
-- auch (pa_room_teachers), wenn sie Adresse und Haken gesetzt hat.
-- Bleibt beim Besitzer: den Raum LÖSCHEN (skill_room_delete bleibt
-- unverändert) — und der Besitzer selbst lässt sich nicht austragen.
-- Wer eingeladen wurde, kann sich selbst austragen („Raum verlassen").
--
--   skill_room_teachers   wer außer dem Besitzer Lehrkraft im Raum ist
--   skill_room_is_teacher Besitzer ODER eingeladen — ersetzt die
--                         Besitzer-Prüfung in pa_owned_room (damit in
--                         ALLEN pa_room_*-Funktionen) und in den
--                         allgemeinen Raum-Funktionen, die die Raumseite
--                         braucht (get, sig, set_open, extend,
--                         set_blocked, remove, update, rooms_list).
-- Die Tabelle ist allgemein benannt, gefüllt wird sie heute nur über
-- pa_room_teacher_add — also nur für Projektarbeit-Räume. Für alle
-- anderen Räume ändert sich nichts.
--
-- ── 2) Reiter „Lehrkraft-Kommentare" ─────────────────────────────
-- Im Planungsraum hinterlassen Lehrkräfte Kommentare und Hinweise als
-- Zettel nebeneinander (wie die Post-its der To-dos), mit Namen der
-- Lehrkraft. Schüler der Gruppe können einen Zettel abhaken und
-- Nachfragen darunter schreiben; Lehrkräfte antworten dort und löschen
-- Zettel. Eine Nachfrage löscht, wer sie geschrieben hat, oder eine
-- Lehrkraft.
--
--   pa_notes   ein Zettel je Zeile; replies = die Nachfragen/Antworten
--              als Liste { id, by, teacher, name, text, at }
-- Die Zettel stehen in der Gruppe (pa_group_json → notes), also in
-- pa_view und pa_room_get, ohne dass sich deren Signatur ändert. Nicht
-- in Export/Backup — das bleibt das Projekt der Schüler.
--
-- Kein DROP — create … if not exists / create or replace
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Weitere Lehrkräfte
-- ─────────────────────────────────────────────────────────────
create table if not exists skill_room_teachers (
  room_id  uuid not null references skill_rooms(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

comment on table skill_room_teachers is
  'Weitere Lehrkräfte eines Raums neben dem Besitzer (0205). Gleiche Rechte wie der Besitzer, '
  'nur löschen darf den Raum allein der Besitzer. Heute nur für Projektarbeit (pa_room_teacher_add).';
create index if not exists skill_room_teachers_user_idx on skill_room_teachers(user_id);
alter table skill_room_teachers enable row level security;


-- Besitzer oder eingeladene Lehrkraft?
create or replace function skill_room_is_teacher(p_room uuid, p_user uuid)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select p_user is not null and (
         exists (select 1 from skill_rooms where id = p_room and owner_id = p_user)
      or exists (select 1 from skill_room_teachers where room_id = p_room and user_id = p_user));
$$;

revoke all on function skill_room_is_teacher(uuid, uuid) from public;


-- Wie 0200, nur: Besitzer ODER eingeladene Lehrkraft.
create or replace function pa_owned_room(p_code text, p_lock boolean default false)
  returns skill_rooms
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_none skill_rooms;
begin
  if auth.uid() is null then
    return v_none;
  end if;
  if p_lock then
    select * into v_room from skill_rooms
     where code = upper(btrim(p_code)) and tool_id = 'projekt' for update;
  else
    select * into v_room from skill_rooms
     where code = upper(btrim(p_code)) and tool_id = 'projekt';
  end if;
  if v_room.id is null or not skill_room_is_teacher(v_room.id, auth.uid()) then
    return v_none;
  end if;
  return v_room;
end;
$$;

revoke all on function pa_owned_room(text, boolean) from public;


-- Die Lehrkräfte eines Raums (0203: „hier — und nur hier — kommen
-- später weitere Lehrkräfte dazu").
create or replace function pa_room_teachers(p_room uuid)
  returns setof uuid
  security definer
  set search_path = public
  language sql
  stable
as $$
  select owner_id from skill_rooms where id = p_room and owner_id is not null
  union
  select user_id from skill_room_teachers where room_id = p_room;
$$;

revoke all on function pa_room_teachers(uuid) from public;


-- Wer darf eingeladen werden? Freigeschaltete Lehrkräfte (wie
-- can_teach) derselben Schule.
create or replace function pa_is_teacher_profile(p_user uuid, p_school uuid)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select exists (select 1 from profiles p
                  where p.id = p_user and p.school_id = p_school
                    and (p.is_admin or p.is_superadmin or p.teacher_status = 'approved'));
$$;

revoke all on function pa_is_teacher_profile(uuid, uuid) from public;


-- Die Lehrkräfte des Raums für das Menü.
create or replace function pa_room_teachers_get(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object(
    'ok',       true,
    'is_owner', v_room.owner_id = auth.uid(),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',    t.uid,
               'name',  coalesce(p.display_name, p.account_name, 'Lehrkraft'),
               'owner', t.uid = v_room.owner_id,
               'me',    t.uid = auth.uid())
             order by (t.uid = v_room.owner_id) desc, t.at, p.display_name)
        from (select v_room.owner_id as uid, v_room.created_at as at
              union all
              select user_id, added_at from skill_room_teachers where room_id = v_room.id) t
        join profiles p on p.id = t.uid), '[]'::jsonb)
  );
end;
$$;

revoke all on function pa_room_teachers_get(text) from public;
grant execute on function pa_room_teachers_get(text) to authenticated;


-- Suche nach einer Lehrkraft zum Einladen (Name oder Kontoname, ab 2
-- Zeichen). Wer schon im Raum ist, steht nicht in der Liste.
create or replace function pa_room_teacher_search(p_code text, p_q text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_q    text := lower(btrim(coalesce(p_q, '')));
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if char_length(v_q) < 2 then
    return jsonb_build_object('ok', true, 'teachers', '[]'::jsonb);
  end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object('ok', true, 'teachers', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'account', x.account_name)
                     order by x.name)
      from (select p.id, coalesce(p.display_name, p.account_name) as name, p.account_name
              from profiles p
             where p.school_id = v_room.school_id
               and (p.is_admin or p.is_superadmin or p.teacher_status = 'approved')
               and (lower(p.display_name) like v_q or lower(p.account_name) like v_q)
               and not skill_room_is_teacher(v_room.id, p.id)
             order by coalesce(p.display_name, p.account_name)
             limit 12) x), '[]'::jsonb));
end;
$$;

revoke all on function pa_room_teacher_search(text, text) from public;
grant execute on function pa_room_teacher_search(text, text) to authenticated;


create or replace function pa_room_teacher_add(p_code text, p_user uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_user is null or not pa_is_teacher_profile(p_user, v_room.school_id) then
    return jsonb_build_object('ok', false, 'error', 'not_a_teacher');
  end if;
  if skill_room_is_teacher(v_room.id, p_user) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if (select count(*) from skill_room_teachers where room_id = v_room.id) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'teacher_limit');
  end if;
  insert into skill_room_teachers (room_id, user_id, added_by)
  values (v_room.id, p_user, auth.uid())
  on conflict do nothing;
  perform pa_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_room_teacher_add(text, uuid) from public;
grant execute on function pa_room_teacher_add(text, uuid) to authenticated;


-- Austragen. p_user null = sich selbst („Raum verlassen"). Den
-- Besitzer trägt niemand aus.
create or replace function pa_room_teacher_remove(p_code text, p_user uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_uid  uuid := coalesce(p_user, auth.uid());
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid = v_room.owner_id then
    return jsonb_build_object('ok', false, 'error', 'is_owner');
  end if;
  delete from skill_room_teachers where room_id = v_room.id and user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform pa_bump(v_room.id);
  return jsonb_build_object('ok', true, 'self', v_uid = auth.uid());
end;
$$;

revoke all on function pa_room_teacher_remove(text, uuid) from public;
grant execute on function pa_room_teacher_remove(text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2) Die allgemeinen Raum-Funktionen der Raumseite
-- ─────────────────────────────────────────────────────────────
-- skill_room_get: wie 0087, Prüfung skill_room_is_teacher; is_owner
-- sagt jetzt die Wahrheit (bisher immer true).
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
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
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
    'entries', skill_entries_json(v_room.id, v_user, true),
    'limits',  skill_limits(v_room.id),
    'role',    'presenter',
    'is_owner', v_room.owner_id = v_user
  );
end;
$$;
revoke all on function skill_room_get(text) from public;
grant execute on function skill_room_get(text) to authenticated;


-- skill_rooms_list: wie 0081, dazu die Räume, in die man eingeladen
-- ist (co_teacher: true, owner_name). Die Obergrenze („live") zählt
-- weiter nur die eigenen.
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


-- Die übrigen allgemeinen Funktionen der Raumseite: jeweils die letzte
-- Fassung, wortgleich übernommen — nur die Besitzer-Prüfung
--   v_room.owner_id <> v_user  →  not skill_room_is_teacher(v_room.id, v_user)
-- skill_room_delete bleibt, wie es ist: löschen darf nur der Besitzer.

-- skill_room_sig: wortgleich aus 0079, nur die Besitzer-Prüfung ist jetzt skill_room_is_teacher.
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
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'sig', skill_sig_of(v_room.id));
end;
$$;
revoke all on function skill_room_sig(text) from public;
grant execute on function skill_room_sig(text) to authenticated;


-- skill_room_set_open: wortgleich aus 0085, nur die Besitzer-Prüfung ist jetzt skill_room_is_teacher.
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
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update skill_rooms
     set join_open      = coalesce(p_open, true),
         last_active_at = now(),
         expires_at     = now() + interval '30 days'
   where id = v_room.id;

  return jsonb_build_object('ok', true, 'join_open', coalesce(p_open, true));
end;
$$;
revoke all on function skill_room_set_open(text, boolean) from public;
grant execute on function skill_room_set_open(text, boolean) to authenticated;


-- skill_room_extend: wortgleich aus 0085, nur die Besitzer-Prüfung ist jetzt skill_room_is_teacher.
create or replace function skill_room_extend(p_code text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_new  timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Auch ein abgelaufener Raum lässt sich zurückholen, solange er noch
  -- da ist: zwischen Ablauf und Aufräum-Lauf liegt bis zu ein Tag, und
  -- in dem Fenster ist „ich hätte den doch noch gebraucht" der
  -- wahrscheinlichste Grund, hier zu klicken.
  v_new := greatest(now(), v_room.expires_at) + interval '30 days';

  update skill_rooms set expires_at = v_new where id = v_room.id;

  return jsonb_build_object('ok', true, 'expires_at', v_new,
                            'revived', (v_room.expires_at <= now()));
end;
$$;
revoke all on function skill_room_extend(text) from public;
grant execute on function skill_room_extend(text) to authenticated;


-- skill_room_set_blocked: wortgleich aus 0081, nur die Besitzer-Prüfung ist jetzt skill_room_is_teacher.
create or replace function skill_room_set_blocked(
  p_code        text,
  p_participant uuid,
  p_blocked     boolean default true
)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_room skill_rooms;
  v_on   boolean := coalesce(p_blocked, true);
  v_n    int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update skill_participants
     set blocked    = v_on,
         blocked_at = case when v_on then now() else null end
   where id = p_participant and room_id = v_room.id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'blocked', v_on);
end;
$$;
revoke all on function skill_room_set_blocked(text, uuid, boolean) from public;
grant execute on function skill_room_set_blocked(text, uuid, boolean) to authenticated;


-- skill_room_remove: wortgleich aus 0187, nur die Besitzer-Prüfung ist jetzt skill_room_is_teacher.
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
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
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


-- skill_room_update: wortgleich aus 0193, nur die Besitzer-Prüfung ist jetzt skill_room_is_teacher.
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
  v_lim    jsonb;
  v_gset   text;
  v_gfld   text;
  v_err    text;
  v_rest_o jsonb;
  v_rest_n jsonb;
  v_key    text;
  v_rec    record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_room from skill_rooms where code = upper(btrim(p_code));
  if v_room.id is null or not skill_room_is_teacher(v_room.id, v_user) then
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

  -- Namensabfrage — unverändert aus 0084.
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

    v_lim  := skill_limits(v_room.id);
    v_gset := nullif(v_lim->>'group_setting', '');
    v_gfld := nullif(v_lim->>'group_field', '');

    v_err := skill_check_settings(p_settings, v_lim);
    if v_err is not null then
      return jsonb_build_object('ok', false, 'error', v_err);
    end if;

    if p_settings <> v_room.settings then
      /* Alles, was WEDER Gruppenliste NOCH freigegebene Grenze ist,
         fällt unter die Regel aus 0084. Verglichen wird der Rest
         gegen den Rest — sonst löste schon das Ergänzen einer Frage
         die alte, harte Sperre aus. */
      v_rest_o := v_room.settings;
      v_rest_n := p_settings;
      if v_gset is not null then
        v_rest_o := v_rest_o - v_gset;
        v_rest_n := v_rest_n - v_gset;
      end if;
      if jsonb_typeof(v_lim->'room_limits') = 'array' then
        for v_key in select jsonb_array_elements_text(v_lim->'room_limits') loop
          v_rest_o := v_rest_o - v_key;
          v_rest_n := v_rest_n - v_key;
        end loop;
      end if;

      if v_rest_n <> v_rest_o then
        select count(*) into v_ent
          from skill_room_entries where room_id = v_room.id;
        if v_ent > 0 then
          return jsonb_build_object('ok', false, 'error', 'has_entries', 'entries', v_ent);
        end if;
      end if;

      /* Und nun je Gruppe: geprüft wird gegen den ALTEN Bestand.
         Was dort steht und im neuen fehlt, ist gelöscht; was dort
         steht und sich unterscheidet, ist geändert. Beides ist für
         eine Gruppe mit Beiträgen zu spät. */
      if v_gset is not null and v_gfld is not null then
        /* jsonb_typeof statt coalesce: ein JSON-`null` ist nicht SQL-NULL
           und käme durch coalesce durch — jsonb_array_elements bräche
           dann mit einem SQL-Fehler ab statt mit einer Antwort. */
        for v_rec in
          select o.v->>'id' as gid, o.v as oldv,
                 (select n.v from jsonb_array_elements(
                            case when jsonb_typeof(p_settings->v_gset) = 'array'
                                 then p_settings->v_gset else '[]'::jsonb end) as n(v)
                   where n.v->>'id' = o.v->>'id' limit 1) as newv
            from jsonb_array_elements(
                   case when jsonb_typeof(v_room.settings->v_gset) = 'array'
                        then v_room.settings->v_gset else '[]'::jsonb end) as o(v)
           where nullif(o.v->>'id', '') is not null
        loop
          if v_rec.newv is null then
            select count(*) into v_ent from skill_room_entries e
             where e.room_id = v_room.id and e.payload->>v_gfld = v_rec.gid;
            if v_ent > 0 then
              return jsonb_build_object('ok', false, 'error', 'group_has_entries',
                                        'group', v_rec.gid, 'entries', v_ent);
            end if;
          end if;
        end loop;
      end if;
    end if;
  end if;

  update skill_rooms
     set title          = coalesce(v_title, title),
         ask_names      = coalesce(p_ask_names, ask_names),
         settings       = coalesce(p_settings, settings),
         last_active_at = now(),
         expires_at     = now() + interval '30 days'
   where id = v_room.id;

  return jsonb_build_object('ok', true, 'room', skill_room_json(v_room.id));
end;
$$;
revoke all on function skill_room_update(text, text, boolean, jsonb) from public;
grant execute on function skill_room_update(text, text, boolean, jsonb) to authenticated;



-- ─────────────────────────────────────────────────────────────
-- 3) Lehrkraft-Kommentare
-- ─────────────────────────────────────────────────────────────
create table if not exists pa_notes (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references skill_rooms(id) on delete cascade,
  group_id     uuid not null references pa_groups(id) on delete cascade,
  text         text not null check (char_length(text) between 1 and 1500),
  color        text not null default 'yellow'
               check (color in ('yellow', 'blue', 'green', 'pink', 'lilac')),
  author_id    uuid references profiles(id) on delete set null,
  author_name  text not null default 'Lehrkraft',
  created_at   timestamptz not null default now(),
  done         boolean not null default false,
  done_by_name text,
  done_at      timestamptz,
  replies      jsonb not null default '[]'::jsonb
);

comment on table pa_notes is
  'Projektarbeit (0205): Kommentare und Hinweise der Lehrkräfte im Planungsraum einer Gruppe. '
  'Schüler haken ab (done) und schreiben Nachfragen (replies: [{id, by, teacher, name, text, at}]).';
create index if not exists pa_notes_group_idx on pa_notes(group_id, created_at);
alter table pa_notes enable row level security;


create or replace function pa_notes_json(p_group uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         n.id,
           'text',       n.text,
           'color',      n.color,
           'author',     n.author_id,
           'authorName', n.author_name,
           'at',         n.created_at,
           'done',       n.done,
           'doneBy',     n.done_by_name,
           'doneAt',     n.done_at,
           'replies',    n.replies)
         order by n.created_at desc), '[]'::jsonb)
    from pa_notes n where n.group_id = p_group;
$$;

revoke all on function pa_notes_json(uuid) from public;


-- Kopf einer Gruppe — wie 0200, dazu die Zettel (nur mit Planungsraum).
create or replace function pa_group_json(p_group uuid, p_me uuid, p_keys boolean)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object(
           'id',        g.id,
           'no',        g.no,
           'name',      g.name,
           'plan_open', g.plan_open,
           'members',   pa_members_json(g.id, p_me, p_keys),
           'notes',     case when g.plan_open then pa_notes_json(g.id) else '[]'::jsonb end)
    from pa_groups g where g.id = p_group;
$$;

revoke all on function pa_group_json(uuid, uuid, boolean) from public;


-- Der Zettel, wenn er im Planungsraum des Schülers hängt (und der
-- offen ist) — sonst eine leere Zeile.
create or replace function pa_note_of_token(p_token text, p_note uuid)
  returns pa_notes
  security definer
  set search_path = public
  language sql
  stable
as $$
  select n.* from pa_notes n
    join pa_groups g on g.id = n.group_id and g.plan_open
    join pa_seats s on s.group_id = g.id
    join skill_participants p on p.id = s.participant_id
   where p.token = p_token and n.id = p_note;
$$;

revoke all on function pa_note_of_token(text, uuid) from public;


-- Gemeinsamer Kern: abhaken / Nachfrage / Nachfrage löschen.
--   p_by    Teilnehmer (Schüler) oder null (Lehrkraft)
--   p_name  Anzeigename
create or replace function pa_note_apply(p_note uuid, p_act text, p_by uuid, p_name text,
                                         p_done boolean, p_text text, p_reply text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_n   pa_notes;
  v_txt text := btrim(coalesce(p_text, ''));
  v_r   jsonb;
begin
  select * into v_n from pa_notes where id = p_note for update;
  if v_n.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_act = 'done' then
    update pa_notes
       set done = coalesce(p_done, true),
           done_by_name = case when coalesce(p_done, true) then p_name end,
           done_at      = case when coalesce(p_done, true) then now() end
     where id = v_n.id;

  elsif p_act = 'reply' then
    if v_txt = '' then
      return jsonb_build_object('ok', false, 'error', 'invalid_input');
    end if;
    if char_length(v_txt) > 600 then
      return jsonb_build_object('ok', false, 'error', 'too_long');
    end if;
    if p_by is not null and contains_blacklisted_word(v_txt) then
      return jsonb_build_object('ok', false, 'error', 'text_blocked');
    end if;
    if jsonb_array_length(v_n.replies) >= 40 then
      return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
    end if;
    update pa_notes
       set replies = replies || jsonb_build_array(jsonb_build_object(
                       'id',      replace(gen_random_uuid()::text, '-', ''),
                       'by',      p_by,
                       'teacher', p_by is null,
                       'name',    p_name,
                       'text',    v_txt,
                       'at',      now()))
     where id = v_n.id;

  elsif p_act = 'unreply' then
    select r into v_r from jsonb_array_elements(v_n.replies) r where r->>'id' = p_reply;
    if v_r is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    -- Schüler: nur die eigene Nachfrage.
    if p_by is not null and v_r->>'by' is distinct from p_by::text then
      return jsonb_build_object('ok', false, 'error', 'not_yours');
    end if;
    update pa_notes
       set replies = coalesce((select jsonb_agg(r order by i)
                                 from jsonb_array_elements(v_n.replies) with ordinality x(r, i)
                                where r->>'id' is distinct from p_reply), '[]'::jsonb)
     where id = v_n.id;

  else
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  perform pa_bump(v_n.room_id);
  perform skill_touch(v_n.room_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_note_apply(uuid, text, uuid, text, boolean, text, text) from public;


-- ── Schüler ───────────────────────────────────────────────────
create or replace function pa_note_done(p_token text, p_note uuid, p_done boolean default true)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_err text := pa_token_err(p_token, true);
  v_p   skill_participants;
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  if (pa_note_of_token(p_token, p_note)).id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_p from skill_participants where token = p_token;
  return pa_note_apply(p_note, 'done', v_p.id, skill_seat_name(v_p.name, v_p.seat), p_done, null, null);
end;
$$;

revoke all on function pa_note_done(text, uuid, boolean) from public;
grant execute on function pa_note_done(text, uuid, boolean) to anon, authenticated;


create or replace function pa_note_reply(p_token text, p_note uuid, p_text text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_err text := pa_token_err(p_token, true);
  v_p   skill_participants;
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  if (pa_note_of_token(p_token, p_note)).id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_p from skill_participants where token = p_token;
  return pa_note_apply(p_note, 'reply', v_p.id, skill_seat_name(v_p.name, v_p.seat), null, p_text, null);
end;
$$;

revoke all on function pa_note_reply(text, uuid, text) from public;
grant execute on function pa_note_reply(text, uuid, text) to anon, authenticated;


create or replace function pa_note_reply_delete(p_token text, p_note uuid, p_reply text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_err text := pa_token_err(p_token, true);
  v_p   skill_participants;
begin
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;
  if (pa_note_of_token(p_token, p_note)).id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_p from skill_participants where token = p_token;
  return pa_note_apply(p_note, 'unreply', v_p.id, null, null, null, p_reply);
end;
$$;

revoke all on function pa_note_reply_delete(text, uuid, text) from public;
grant execute on function pa_note_reply_delete(text, uuid, text) to anon, authenticated;


-- ── Lehrkraft ─────────────────────────────────────────────────
create or replace function pa_teacher_name()
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce((select coalesce(nullif(btrim(display_name), ''), account_name)
                     from profiles where id = auth.uid()), 'Lehrkraft');
$$;

revoke all on function pa_teacher_name() from public;


-- Der Zettel, wenn er in einem Raum hängt, in dem der Aufrufer
-- Lehrkraft ist — sonst eine leere Zeile.
create or replace function pa_room_note_of(p_code text, p_note uuid)
  returns pa_notes
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := pa_owned_room(p_code);
  v_n    pa_notes;
begin
  if v_room.id is not null then
    select * into v_n from pa_notes where id = p_note and room_id = v_room.id;
  end if;
  return v_n;
end;
$$;

revoke all on function pa_room_note_of(text, uuid) from public;


create or replace function pa_room_note_add(p_code text, p_group uuid, p_text text, p_color text default 'yellow')
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_txt  text := btrim(coalesce(p_text, ''));
  v_id   uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := pa_owned_room(p_code, true);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'room_gone');
  end if;
  if not exists (select 1 from pa_groups where id = p_group and room_id = v_room.id and plan_open) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_txt = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;
  if char_length(v_txt) > 1500 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if (select count(*) from pa_notes where group_id = p_group) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded');
  end if;
  insert into pa_notes (room_id, group_id, text, color, author_id, author_name)
  values (v_room.id, p_group, v_txt,
          case when p_color in ('yellow', 'blue', 'green', 'pink', 'lilac') then p_color else 'yellow' end,
          auth.uid(), pa_teacher_name())
  returning id into v_id;
  perform pa_bump(v_room.id);
  perform skill_touch(v_room.id);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function pa_room_note_add(text, uuid, text, text) from public;
grant execute on function pa_room_note_add(text, uuid, text, text) to authenticated;


create or replace function pa_room_note_delete(p_code text, p_note uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_n pa_notes;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_n := pa_room_note_of(p_code, p_note);
  if v_n.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  delete from pa_notes where id = v_n.id;
  perform pa_bump(v_n.room_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function pa_room_note_delete(text, uuid) from public;
grant execute on function pa_room_note_delete(text, uuid) to authenticated;


create or replace function pa_room_note_done(p_code text, p_note uuid, p_done boolean default true)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if (pa_room_note_of(p_code, p_note)).id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return pa_note_apply(p_note, 'done', null, pa_teacher_name(), p_done, null, null);
end;
$$;

revoke all on function pa_room_note_done(text, uuid, boolean) from public;
grant execute on function pa_room_note_done(text, uuid, boolean) to authenticated;


create or replace function pa_room_note_reply(p_code text, p_note uuid, p_text text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if (pa_room_note_of(p_code, p_note)).id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return pa_note_apply(p_note, 'reply', null, pa_teacher_name(), null, p_text, null);
end;
$$;

revoke all on function pa_room_note_reply(text, uuid, text) from public;
grant execute on function pa_room_note_reply(text, uuid, text) to authenticated;


create or replace function pa_room_note_reply_delete(p_code text, p_note uuid, p_reply text)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if (pa_room_note_of(p_code, p_note)).id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return pa_note_apply(p_note, 'unreply', null, null, null, null, p_reply);
end;
$$;

revoke all on function pa_room_note_reply_delete(text, uuid, text) from public;
grant execute on function pa_room_note_reply_delete(text, uuid, text) to authenticated;
