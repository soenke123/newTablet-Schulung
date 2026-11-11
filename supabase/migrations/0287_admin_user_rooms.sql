-- ══════════════════════════════════════════════════════════════
-- Migration 0287 — In welchen Räumen ist ein Konto? (Admin-Panel)
-- ══════════════════════════════════════════════════════════════
-- Sönke 11.11.2026: Auf der Webseite melden sich Leute an, bei denen
-- unklar ist: Schüler oder Troll? Wer in keinem Raum einer Lehrkraft
-- sitzt, ist verdächtig. Das Admin-Panel zeigt deshalb in der
-- Nutzerliste eine Spalte „Räume“ (Zahl, antippen = Liste).
--
-- admin_user_rooms(p_school) liefert je Konto der Schule die Räume,
-- in denen es
--   member  = als Teilnehmer sitzt (skill_participants.user_id),
--   owner   = den Raum angelegt hat,
--   teacher = als weitere Lehrkraft eingeladen ist (skill_room_teachers).
-- Abgelaufene Räume stehen mit drin (expired), solange skill_cleanup
-- sie noch nicht gelöscht hat. Räume legen nur Lehrkräfte an
-- (can_teach) — „in einem Raum“ heißt also „bei einer Lehrkraft“.
--
-- Rechte wie skill_rooms_overview (0082): nur Admins (mit 2FA über
-- is_any_admin), Schuladmin nur die eigene Schule, Volladmin wählt
-- (null = alle). Kein Token. Der Name, den das Konto im Raum
-- eingetippt hat, steht dabei — er hilft genau bei der Frage
-- „wer ist das?“ und geht nur an Admins.
--
-- Prüfstand: supabase/tests/0287_admin_user_rooms.mjs
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

create or replace function admin_user_rooms(p_school uuid default null)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_user   uuid := auth.uid();
  v_school uuid;
  v_out    jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not is_any_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  if is_superadmin() then
    v_school := p_school;
  else
    v_school := my_school_id();
    if v_school is null then
      return jsonb_build_object('ok', false, 'error', 'no_school');
    end if;
  end if;

  with links as (
    -- Teilnehmer
    select sp.user_id as uid, r.id as room_id, 'member'::text as role,
           sp.name, sp.joined_at as since, sp.last_seen_at as seen,
           (sp.left_at is not null) as left_room,
           (sp.removed_at is not null) as removed,
           sp.blocked
      from skill_participants sp
      join skill_rooms r on r.id = sp.room_id
     where sp.user_id is not null
    union all
    -- Besitzer
    select r.owner_id, r.id, 'owner', null, r.created_at, r.last_active_at,
           false, false, false
      from skill_rooms r
     where r.owner_id is not null
    union all
    -- eingeladene Lehrkraft
    select t.user_id, t.room_id, 'teacher', null, t.added_at, null,
           false, false, false
      from skill_room_teachers t
  ),
  per_user as (
    select l.uid,
           jsonb_agg(jsonb_build_object(
             'code',        r.code,
             'title',       r.title,
             'tool_id',     r.tool_id,
             'tool_title',  tl.title,
             'role',        l.role,
             'name',        l.name,
             'owner',       coalesce(o.display_name, o.account_name, '—'),
             'is_test',     r.is_test,
             'since',       l.since,
             'last_seen_at', l.seen,
             'room_active_at', r.last_active_at,
             'expired',     (r.expires_at <= now()),
             'left',        l.left_room,
             'removed',     l.removed,
             'blocked',     l.blocked
           ) order by (r.expires_at <= now()), coalesce(l.seen, l.since) desc nulls last) as rooms
      from links l
      join profiles p     on p.id  = l.uid
      join skill_rooms r  on r.id  = l.room_id
      join skill_tools tl on tl.id = r.tool_id
      left join profiles o on o.id = r.owner_id
     where v_school is null or p.school_id = v_school
     group by l.uid
  )
  select coalesce(jsonb_object_agg(uid, rooms), '{}'::jsonb)
    into v_out
    from per_user;

  return jsonb_build_object('ok', true, 'users', v_out, 'school_id', v_school);
end;
$$;

revoke all on function admin_user_rooms(uuid) from public;
grant execute on function admin_user_rooms(uuid) to authenticated;

comment on function admin_user_rooms(uuid) is
  'Admin-Panel (0287): je Konto die MPSkills-Räume (Teilnehmer/Besitzer/eingeladene Lehrkraft). '
  'Hilft bei „Schüler oder Troll?“. Nur Admins, Schuladmin nur die eigene Schule, ohne Token.';
