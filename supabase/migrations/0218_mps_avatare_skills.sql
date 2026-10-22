-- ══════════════════════════════════════════════════════════════
-- Migration 0218 — Profilbilder aus Wild Clusters, Balance of
--                  Nature und Knowledge Stack (mit Gold)
-- ══════════════════════════════════════════════════════════════
-- Baut auf 0214 auf (mps_avatar_unlocks, mps_my_avatars). Ids wie in
-- avatars.js (MPS_CATALOG). Drei neue Regeln, alle per Trigger, damit
-- kein Spiel-RPC angefasst werden muss:
--
--   Wild Clusters    Raum erreicht Phase 3 (Auflösung) → alle zehn
--                    Tiere für jeden im Raum.
--   Balance of Nature  Szenario mit der Klasse geteilt
--                    (skill_room_state.data.shared) → die Figuren, die
--                    in diesem Szenario vorkommen.
--   Knowledge Stack  Quiz endet (Phase 'ended', auch über ks_finish) →
--                    wer mitgespielt hat (mind. eine Antwort), bekommt
--                    sein Wesen. Platz 1 bekommt es zusätzlich in Gold
--                    (<id>_gold) — Platz 1 genau wie auf dem Podium
--                    (nur Anwesende, score desc, participant_id), mit
--                    Punkten > 0 und mindestens zwei Anwesenden; ein
--                    Quiz allein gewinnt man nicht.
--
-- „Im Raum" heißt bei den Raum-Regeln: angemeldete Teilnehmer
-- (skill_participants.user_id), der Besitzer und eingeladene
-- Lehrkräfte (skill_room_teachers, 0205). Wer sich erst später im
-- Raum anmeldet (door-login hängt den Raum ans Konto), bekommt es
-- beim Setzen von user_id nach — dafür der zweite Trigger.
--
-- Kein DROP außer `drop trigger if exists` vor dem Anlegen.
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Was ein Raum gerade freischaltet
-- ─────────────────────────────────────────────────────────────
-- Balance of Nature: Szenarien wie SCENARIOS in
-- tools/balance of nature/js/ui/room.js.
--   1 Wolf und Hirsch · 2 Adler und Laufvogel · 3 alle vier
--   4 alle vier + Menschen (Jäger, Sammler, Dorf)
create or replace function mps_room_avatar_ids(p_room uuid)
  returns text[]
  security definer
  set search_path = public
  language plpgsql
  stable
as $$
declare
  v_tool   text;
  v_phase  int;
  v_data   jsonb;
  v_ids    text[] := '{}';
  v_shared int[];
begin
  select r.tool_id, coalesce(s.phase, 1), coalesce(s.data, '{}'::jsonb)
    into v_tool, v_phase, v_data
    from skill_rooms r
    left join skill_room_state s on s.room_id = r.id
   where r.id = p_room;

  if v_tool = 'wildclusters' then
    if v_phase >= 3 then
      v_ids := array['barsch','bussard','dachs','ente','fledermaus',
                     'fuchs','hecht','igel','kaninchen','reh'];
      return array(select 'mps_wildclusters_' || x from unnest(v_ids) x);
    end if;

  elsif v_tool = 'balance' then
    if jsonb_typeof(v_data -> 'shared') <> 'array' then return '{}'; end if;
    select coalesce(array_agg(distinct x::int), '{}') into v_shared
      from jsonb_array_elements_text(v_data -> 'shared') x
     where x ~ '^[1-4]$';
    if 1 = any(v_shared) or 3 = any(v_shared) or 4 = any(v_shared) then
      v_ids := v_ids || array['wolf', 'hirsch'];
    end if;
    if 2 = any(v_shared) or 3 = any(v_shared) or 4 = any(v_shared) then
      v_ids := v_ids || array['adler', 'laufvogel'];
    end if;
    if 4 = any(v_shared) then
      v_ids := v_ids || array['jagdwild_1','jagdwild_4','jagdwild_6',
                              'jagdwolf_1','jagdwolf_3','jagdwolf_4',
                              'sammeln_3','villager'];
    end if;
    return array(select 'mps_balance_' || x from unnest(v_ids) x);
  end if;

  return '{}';
end;
$$;

revoke all on function mps_room_avatar_ids(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 2) Freischalten für alle im Raum (oder nur für einen)
-- ─────────────────────────────────────────────────────────────
create or replace function mps_grant_room_avatars(p_room uuid, p_user uuid default null)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_ids text[] := mps_room_avatar_ids(p_room);
begin
  if coalesce(array_length(v_ids, 1), 0) = 0 then return; end if;

  insert into mps_avatar_unlocks (user_id, avatar_id)
  select u.user_id, a.id
    from (
      select sp.user_id from skill_participants sp
       where sp.room_id = p_room and sp.user_id is not null
      union
      select r.owner_id from skill_rooms r where r.id = p_room
      union
      select t.user_id from skill_room_teachers t where t.room_id = p_room
    ) u
    join profiles p on p.id = u.user_id
    cross join unnest(v_ids) a(id)
   where p_user is null or u.user_id = p_user
  on conflict (user_id, avatar_id) do nothing;
end;
$$;

revoke all on function mps_grant_room_avatars(uuid, uuid) from public;


-- Zustand geändert (Phase oder geteilte Szenarien)
create or replace function mps_room_state_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.phase is not distinct from old.phase
     and new.data  is not distinct from old.data then
    return new;
  end if;
  perform mps_grant_room_avatars(new.room_id);
  return new;
end;
$$;

revoke all on function mps_room_state_avatars() from public;

drop trigger if exists skill_room_state_avatars on skill_room_state;
create trigger skill_room_state_avatars
  after insert or update on skill_room_state
  for each row execute function mps_room_state_avatars();


-- Später angemeldet (Raum ans Konto gehängt)
create or replace function mps_participant_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return new; end if;
  perform mps_grant_room_avatars(new.room_id, new.user_id);
  return new;
end;
$$;

revoke all on function mps_participant_avatars() from public;

drop trigger if exists skill_participants_avatars on skill_participants;
create trigger skill_participants_avatars
  after insert or update of user_id on skill_participants
  for each row execute function mps_participant_avatars();


-- ─────────────────────────────────────────────────────────────
-- 3) Knowledge Stack: Wesen fürs Mitspielen, Gold für Platz 1
-- ─────────────────────────────────────────────────────────────
-- Wesen 0…39 wie CREATURES in tools/KnowledgeStack/creatures.js.
create or replace function ks_grant_end_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  k text[] := array[
    'puddl','spark','plop','bubbles','snooze','beep','chompy','nubi','zorp','lotti',
    'grumbl','mochi','sprout','bzz','crunch','tiki','clawdy','mimi','fuzz','snip',
    'boomer','pebbl','glitch','cacti','nacho','pips','waddl','yoyo','turbo','lumi',
    'umbra','grimjaw','astris','arcana','zephyr','spindle','prisma','plato','kruemel','howl'];
  v_win  ks_players;
  v_n    int;
begin
  if new.phase <> 'ended' or old.phase = 'ended' then return new; end if;

  -- Mitgespielt: mindestens eine Antwort abgegeben
  insert into mps_avatar_unlocks (user_id, avatar_id)
  select distinct sp.user_id, 'mps_knowledgestack_' || k[p.creature_id + 1]
    from ks_players p
    join skill_participants sp on sp.id = p.participant_id
    join profiles pr on pr.id = sp.user_id
   where p.room_id = new.room_id
     and k[p.creature_id + 1] is not null
     and exists (select 1 from ks_answers a
                  where a.room_id = new.room_id and a.participant_id = p.participant_id)
  on conflict (user_id, avatar_id) do nothing;

  -- Platz 1 wie auf dem Podium (0188)
  select count(*) into v_n
    from ks_players p
   where p.room_id = new.room_id and ks_present(p.participant_id);
  if v_n < 2 then return new; end if;

  select p.* into v_win
    from ks_players p
   where p.room_id = new.room_id and ks_present(p.participant_id)
   order by p.score desc, p.participant_id
   limit 1;
  if v_win.participant_id is null or v_win.score <= 0 then return new; end if;
  if k[v_win.creature_id + 1] is null then return new; end if;

  insert into mps_avatar_unlocks (user_id, avatar_id)
  select sp.user_id, 'mps_knowledgestack_' || k[v_win.creature_id + 1] || x
    from skill_participants sp
    join profiles pr on pr.id = sp.user_id
    cross join (values (''), ('_gold')) v(x)
   where sp.id = v_win.participant_id
  on conflict (user_id, avatar_id) do nothing;

  return new;
end;
$$;

revoke all on function ks_grant_end_avatars() from public;

drop trigger if exists ks_boards_end_avatars on ks_boards;
create trigger ks_boards_end_avatars
  after update of phase on ks_boards
  for each row execute function ks_grant_end_avatars();
