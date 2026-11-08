-- ═════════════════════════════════════════════════════════════
-- 0281 — Scrum Werkstatt: Konto-Profilbild, Label nur selbst,
--        gemeinsame Daily-Uhr, Schreibsperre am Product Goal
-- ═════════════════════════════════════════════════════════════
-- 1) Profilbild: Wer mit Konto im Raum ist (skill_participants.user_id),
--    zeigt an seiner Teamkarte das Profilbild seines Kontos
--    (profiles.avatar_id → avatars.js). Ohne Konto: die Buchstaben.
--    Das hochgeladene Bild (scrum_members.avatar) zeigt die Werkstatt
--    im Raum nicht mehr; die Spalte bleibt für alte Exporte.
-- 2) Label („Tag") an einer Teamkarte ändert nur das Mitglied selbst
--    (scrum_member_update → 'not_yours'). Die Lehrkraft darf weiter
--    (scrum_room_member_update), z. B. um ein unpassendes Label zu löschen.
-- 3) Daily-Uhr für das ganze Team: Zustand in scrum_rooms.daily, Zeit
--    rechnet der Server (now()), damit alle Tablets dieselbe Uhr sehen.
--    Steuern dürfen Mitglieder und die Lehrkraft (scrum_daily /
--    scrum_room_daily), Beobachter sehen zu.
-- 4) Product Goal: wer schreibt, hält eine Sperre (30 s, das Gerät
--    verlängert alle 10 s). Die anderen sehen „xy bearbeitet das Feld"
--    und können solange nicht schreiben. Die Sperre steht in der
--    Signatur — läuft sie ab (Tablet zugeklappt), merken es alle beim
--    nächsten Takt. Beim Greifen kommt der aktuelle Stand des Goals mit,
--    damit niemand auf einer alten Fassung weiterschreibt.
-- Prüfstand: supabase/tests/0281_scrum_daily_goal_avatar.mjs
-- ═════════════════════════════════════════════════════════════

alter table scrum_rooms add column if not exists daily             jsonb;
alter table scrum_rooms add column if not exists goal_editor       text;
alter table scrum_rooms add column if not exists goal_editor_name  text;
alter table scrum_rooms add column if not exists goal_editor_until timestamptz;

comment on column scrum_rooms.daily is
  'Daily-Uhr des Teams (0281): {left: Sekunden Rest zum Zeitpunkt at, run, at: Server-Zeit in ms, turn, spoke:[ids]}.';
comment on column scrum_rooms.goal_editor is
  'Wer gerade am Product Goal schreibt (0281): ''p:<participant>'' oder ''owner''. Gilt bis goal_editor_until.';


-- ─────────────────────────────────────────────────────────────
-- Bausteine
-- ─────────────────────────────────────────────────────────────
-- Der Daily-Zustand, wie die Geräte ihn bekommen: immer vollständig.
create or replace function scrum_daily_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce((select daily from scrum_rooms where room_id = p_room),
                  jsonb_build_object('left', 300, 'run', false, 'at', 0, 'turn', null, 'spoke', '[]'::jsonb));
$$;

revoke all on function scrum_daily_json(uuid) from public;


-- Wer gerade am Goal schreibt — nur, solange die Sperre gilt.
create or replace function scrum_goal_edit_json(p_room uuid)
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select case when r.goal_editor is not null and r.goal_editor_until > now()
              then jsonb_build_object('key', r.goal_editor, 'name', r.goal_editor_name)
         end
    from scrum_rooms r where r.room_id = p_room;
$$;

revoke all on function scrum_goal_edit_json(uuid) from public;


-- Signatur, gemeinsam für Team und Lehrkraft: wie 0196, dazu die
-- Goal-Sperre (läuft sie ab, ändert sich die Signatur von selbst).
create or replace function scrum_sig_of(p_room skill_rooms)
  returns text
  security definer
  set search_path = public
  language sql
  stable
as $$
  select coalesce((select rev from scrum_rooms where room_id = p_room.id), 0)::text || ':' ||
         (select count(*) from skill_participants where room_id = p_room.id and removed_at is null)::text || ':' ||
         (select count(*) from scrum_members where room_id = p_room.id)::text || ':' ||
         p_room.join_open::text || ':' ||
         (now() at time zone 'Europe/Berlin')::date::text || ':' ||
         coalesce(scrum_goal_edit_json(p_room.id)->>'key', '-');
$$;

revoke all on function scrum_sig_of(skill_rooms) from public;


-- ─────────────────────────────────────────────────────────────
-- Ansicht (aus 0196) mit Konto-Profilbild, Daily, Goal-Sperre
-- ─────────────────────────────────────────────────────────────
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
    'now',     floor(extract(epoch from clock_timestamp()) * 1000),
    'daily',   scrum_daily_json(p_room),
    'goal_edit', scrum_goal_edit_json(p_room),
    'seq',     jsonb_build_object('story',  coalesce(v_cnt.seq_story, 0),
                                  'sprint', coalesce(v_cnt.seq_sprint, 0)),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',     p.id,
               'name',   skill_seat_name(p.name, p.seat),
               'role',   m.role,
               'label',  m.label,
               -- Profilbild des Kontos; ohne Konto null → Buchstaben.
               'account_avatar', case when p.user_id is not null
                                      then coalesce(pr.avatar_id, 'default') end,
               'online', p.last_seen_at > now() - interval '90 seconds',
               'me',     p.id = p_me)
             || case when p_keys then jsonb_build_object('key', p.recover_key) else '{}'::jsonb end
             order by m.joined_at, p.seat)
        from scrum_members m join skill_participants p on p.id = m.participant_id
        left join profiles pr on pr.id = p.user_id
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


-- Signaturen (Rümpfe wie 0196, Kette jetzt in scrum_sig_of)
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
  return jsonb_build_object('ok', true, 'sig', scrum_sig_of(v_room));
end;
$$;

revoke all on function scrum_sig(text) from public;
grant execute on function scrum_sig(text) to anon, authenticated;


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
  return jsonb_build_object('ok', true, 'sig', scrum_sig_of(v_room));
end;
$$;

revoke all on function scrum_room_sig(text) from public;
grant execute on function scrum_room_sig(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Wer schreiben darf (Team): Mitglied, nicht stillgelegt
-- ─────────────────────────────────────────────────────────────
-- Gibt den Teilnehmer zurück oder einen Fehler-Code in p_err.
create or replace function scrum_writer(p_token text, out p skill_participants, out err text)
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_kind text;
begin
  select * into p from skill_participants where token = p_token;
  if p.id is null then err := 'unknown_token'; return; end if;
  select * into v_room from skill_rooms where id = p.room_id;
  if v_room.id is null or v_room.expires_at <= now() then err := 'room_gone'; return; end if;
  if p.removed_at is not null then err := 'removed'; return; end if;
  if p.blocked then err := 'blocked'; return; end if;
  select kind into v_kind from scrum_members where participant_id = p.id;
  if v_kind is distinct from 'member' then err := 'read_only'; return; end if;
end;
$$;

revoke all on function scrum_writer(text) from public;


-- ─────────────────────────────────────────────────────────────
-- 2) Label nur selbst (Rumpf wie 0198, dazu die Prüfung)
-- ─────────────────────────────────────────────────────────────
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
  v_w record;
begin
  select * into v_w from scrum_writer(p_token);
  if v_w.err is not null then
    return jsonb_build_object('ok', false, 'error', v_w.err);
  end if;
  -- Label und Bild gehören dem Mitglied selbst; die Rolle verteilt das Team.
  if jsonb_typeof(p_patch) = 'object' and (p_patch ? 'label' or p_patch ? 'avatar')
     and p_participant is distinct from (v_w.p).id then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  return scrum_apply_member_patch((v_w.p).room_id, p_participant, p_patch);
end;
$$;

revoke all on function scrum_member_update(text, uuid, jsonb) from public;
grant execute on function scrum_member_update(text, uuid, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3) Daily-Uhr
-- ─────────────────────────────────────────────────────────────
-- p_action: 'start' | 'pause' | 'reset' | 'turn' (mit p_id = Mitglied).
-- 'turn' wie bisher am Gerät: dieselbe Person noch einmal = fertig
-- (abgehakt), eine andere = die vorige ist fertig, die neue redet.
create or replace function scrum_daily_apply(p_room uuid, p_action text, p_id uuid)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_d     jsonb := scrum_daily_json(p_room);
  v_now   bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_left  numeric := coalesce((v_d->>'left')::numeric, 300);
  v_run   boolean := coalesce((v_d->>'run')::boolean, false);
  v_at    bigint := coalesce((v_d->>'at')::bigint, 0);
  v_turn  text := v_d->>'turn';
  v_spoke jsonb := coalesce(v_d->'spoke', '[]'::jsonb);
begin
  if v_run then
    v_left := greatest(0, v_left - (v_now - v_at) / 1000.0);
  end if;

  if p_action = 'start' then
    if v_left <= 0 then v_left := 300; end if;
    v_run := true;
  elsif p_action = 'pause' then
    v_run := false;
  elsif p_action = 'reset' then
    v_left := 300; v_run := false; v_turn := null; v_spoke := '[]'::jsonb;
  elsif p_action = 'turn' then
    if p_id is null or not exists (select 1 from scrum_members
                                    where participant_id = p_id and room_id = p_room and kind = 'member') then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_turn = p_id::text then
      if not v_spoke ? v_turn then v_spoke := v_spoke || to_jsonb(v_turn); end if;
      v_turn := null;
    else
      if v_turn is not null and not v_spoke ? v_turn then v_spoke := v_spoke || to_jsonb(v_turn); end if;
      v_turn := p_id::text;
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  v_d := jsonb_build_object('left', round(v_left, 1), 'run', v_run, 'at', v_now,
                            'turn', v_turn, 'spoke', v_spoke);
  insert into scrum_rooms (room_id, rev, daily) values (p_room, 1, v_d)
  on conflict (room_id) do update set daily = excluded.daily, rev = scrum_rooms.rev + 1;
  perform skill_touch(p_room);
  return jsonb_build_object('ok', true, 'daily', v_d, 'now', v_now);
end;
$$;

revoke all on function scrum_daily_apply(uuid, text, uuid) from public;


create or replace function scrum_daily(p_token text, p_action text, p_id uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_w record;
begin
  select * into v_w from scrum_writer(p_token);
  if v_w.err is not null then
    return jsonb_build_object('ok', false, 'error', v_w.err);
  end if;
  return scrum_daily_apply((v_w.p).room_id, p_action, p_id);
end;
$$;

revoke all on function scrum_daily(text, text, uuid) from public;
grant execute on function scrum_daily(text, text, uuid) to anon, authenticated;


create or replace function scrum_room_daily(p_code text, p_action text, p_id uuid default null)
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
  v_room := scrum_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return scrum_daily_apply(v_room.id, p_action, p_id);
end;
$$;

revoke all on function scrum_room_daily(text, text, uuid) from public;
grant execute on function scrum_room_daily(text, text, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4) Product Goal: Schreibsperre
-- ─────────────────────────────────────────────────────────────
-- p_on true: greifen bzw. verlängern; false: freigeben (nur die eigene).
-- Antwort beim Greifen: der aktuelle Stand des Goal-Objekts.
create or replace function scrum_goal_edit_apply(p_room uuid, p_key text, p_name text, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_r scrum_rooms;
  v_g scrum_items;
begin
  insert into scrum_rooms (room_id) values (p_room) on conflict (room_id) do nothing;
  select * into v_r from scrum_rooms where room_id = p_room for update;

  if not coalesce(p_on, false) then
    if v_r.goal_editor = p_key then
      update scrum_rooms set goal_editor = null, goal_editor_name = null, goal_editor_until = null
       where room_id = p_room;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_r.goal_editor is not null and v_r.goal_editor <> p_key and v_r.goal_editor_until > now() then
    return jsonb_build_object('ok', false, 'error', 'goal_busy', 'name', v_r.goal_editor_name);
  end if;

  update scrum_rooms
     set goal_editor = p_key, goal_editor_name = p_name,
         goal_editor_until = now() + interval '30 seconds'
   where room_id = p_room;

  select * into v_g from scrum_items where room_id = p_room and kind = 'product' and item_id = 'goal';
  return jsonb_build_object('ok', true,
    'goal', case when v_g.item_id is not null
                 then jsonb_build_object('v', v_g.version, 'data', v_g.data) end);
end;
$$;

revoke all on function scrum_goal_edit_apply(uuid, text, text, boolean) from public;


create or replace function scrum_goal_edit(p_token text, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_w record;
begin
  select * into v_w from scrum_writer(p_token);
  if v_w.err is not null then
    -- Freigeben geht immer (z. B. gerade stillgelegt worden).
    if not coalesce(p_on, false) and (v_w.p).id is not null then
      return scrum_goal_edit_apply((v_w.p).room_id, 'p:' || (v_w.p).id, null, false);
    end if;
    return jsonb_build_object('ok', false, 'error', v_w.err);
  end if;
  return scrum_goal_edit_apply((v_w.p).room_id, 'p:' || (v_w.p).id,
                               skill_seat_name((v_w.p).name, (v_w.p).seat), p_on);
end;
$$;

revoke all on function scrum_goal_edit(text, boolean) from public;
grant execute on function scrum_goal_edit(text, boolean) to anon, authenticated;


create or replace function scrum_room_goal_edit(p_code text, p_on boolean)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms;
  v_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  v_room := scrum_owned_room(p_code);
  if v_room.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select coalesce(nullif(btrim(display_name), ''), account_name, 'Lehrkraft') into v_name
    from profiles where id = auth.uid();
  return scrum_goal_edit_apply(v_room.id, 'owner', coalesce(v_name, 'Lehrkraft'), p_on);
end;
$$;

revoke all on function scrum_room_goal_edit(text, boolean) from public;
grant execute on function scrum_room_goal_edit(text, boolean) to authenticated;


-- Wer das Goal speichert, ohne die Sperre zu halten, während jemand
-- anderes sie hält, wird abgewiesen — sonst schriebe ein Gerät mit
-- altem Stand (z. B. beim Verlassen des Feldes) über die Arbeit der
-- anderen. In scrum_apply_ops vor die Versionsprüfung eingehängt.
create or replace function scrum_goal_blocked(p_room uuid, p_key text)
  returns boolean
  security definer
  set search_path = public
  language sql
  stable
as $$
  select exists (select 1 from scrum_rooms
                  where room_id = p_room and goal_editor is not null
                    and goal_editor is distinct from p_key and goal_editor_until > now());
$$;

revoke all on function scrum_goal_blocked(uuid, text) from public;

do $mig$
declare
  v_src text;
  v_new text;
begin
  v_src := pg_get_functiondef('scrum_apply_ops(uuid, uuid, jsonb)'::regprocedure);
  if position('scrum_goal_blocked(' in v_src) > 0 then
    raise notice '0281: scrum_apply_ops schon umgestellt, übersprungen';
  else
    v_new := replace(v_src,
      $a$      if v_kind = 'product' and not scrum_product_ok(v_data) then$a$,
      $b$      if v_kind = 'product' and v_id = 'goal'
           and scrum_goal_blocked(p_room, case when p_actor is null then 'owner' else 'p:' || p_actor end) then
          return jsonb_build_object('ok', false, 'error', 'goal_busy', 'kind', v_kind, 'id', v_id);
        end if;
        if v_kind = 'product' and not scrum_product_ok(v_data) then$b$);
    if v_new = v_src then raise exception '0281: Stelle in scrum_apply_ops nicht gefunden'; end if;
    execute v_new;
  end if;
end
$mig$;
