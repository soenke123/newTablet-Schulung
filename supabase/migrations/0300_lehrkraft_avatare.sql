-- ══════════════════════════════════════════════════════════════
-- 0300 — Profilbilder für Lehrkräfte, alles für den Volladmin
--        (Sönke 20.11.2026)
-- ══════════════════════════════════════════════════════════════
-- „Bei den Skills, wo die Schüler gewinnen müssen, bekommen die Lehrer
-- einfach pro gespielter Runde einen Skin … und wenn die voll sind,
-- dann die goldenen. Der Volladmin hat alle Skins freigeschaltet von
-- allen Welten.“
--
-- Bisher bekamen Lehrkräfte nur da etwas, wo der Raum es freischaltet
-- (Wild Clusters, Balance of Nature: 0218) oder wo sie selbst spielen
-- (How to Fachbegriffe-Insel, Wordisland-Insel, Nebeltal allein). Bei
-- den Wettkampf-Skills gewinnt aber nur die Klasse – die Lehrkraft am
-- Beamer ging leer aus.
--
-- Neu: Endet im Raum eine Runde, in der mindestens ein Kind mitgespielt
-- hat, bekommt JEDE Lehrkraft des Raums (Besitzerin + eingeladene,
-- skill_room_teachers 0205) EIN Bild dieses Skills, das sie noch nicht
-- hat – zufällig aus der ersten Stufe, die noch nicht voll ist:
--
--   Skill / Runde zu Ende            Stufe 1 → Stufe 2 → Stufe 3
--   Knowledge Stack (phase 'ended')  40 Wesen → 40 Wesen in Gold
--   Kingdoms of Mathoria (Sieger)    8 Völker
--   Myth of Wordisland (Sieger)      8 Völker _1 → 8 Völker _4 → 8 _4_gold
--   Kistenturm (phase 'ended')       6 Teamfiguren
--
-- Nebeltal „Gemeinsam spielen“ ist kein Wettkampf um Bilder: Die
-- Lehrkraft bekommt am Rundenende dasselbe wie die Kinder (3D-Pinguin
-- + das Bild des Levels), weil sie den 3D-Pinguin sonst nie bekäme.
--
-- Eigene Trigger neben den bestehenden (0214/0218/0255/0256/0299);
-- deren Funktionen bleiben unverändert.
--
-- Volladmin: mps_my_avatars liefert zusätzlich all = true, avatars.js
-- schaltet dann jedes Bild beider Welten frei. Liest profiles.
-- is_superadmin bewusst OHNE 2FA (is_superadmin() verlangt aal2): Es
-- geht nur um Profilbilder, update_avatar_id prüft ohnehin nichts.
-- Eingetragen in ERLAUBT von supabase/tests/0223_admin_2fa.mjs.
--
-- Prüfstand: supabase/tests/0300_lehrkraft_avatare.mjs
-- Kein DROP außer `drop trigger if exists`. Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- Helfer: je Lehrkraft des Raums ein neues Bild aus p_tiers
-- ─────────────────────────────────────────────────────────────
-- p_tiers = jsonb-Liste von Listen mit Bild-Ids, Stufe für Stufe.
-- Gezogen wird zufällig aus der ersten Stufe mit noch freien Bildern.
create or replace function mps_teacher_round_avatar(p_room uuid, p_tiers jsonb)
  returns void
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_u  uuid;
  v_id text;
begin
  for v_u in
    select x.u
      from (select r.owner_id u from skill_rooms r where r.id = p_room
            union
            select t.user_id from skill_room_teachers t where t.room_id = p_room) x
      join profiles p on p.id = x.u
  loop
    select e.id into v_id
      from jsonb_array_elements(p_tiers) with ordinality s(arr, n)
      cross join lateral jsonb_array_elements_text(s.arr) e(id)
     where not exists (select 1 from mps_avatar_unlocks m
                        where m.user_id = v_u and m.avatar_id = e.id)
     order by s.n, random()
     limit 1;
    if v_id is not null then
      insert into mps_avatar_unlocks (user_id, avatar_id) values (v_u, v_id)
      on conflict (user_id, avatar_id) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function mps_teacher_round_avatar(uuid, jsonb) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Knowledge Stack
-- ─────────────────────────────────────────────────────────────
create or replace function ks_teacher_end_avatar()
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
begin
  if new.phase <> 'ended' or old.phase = 'ended' then return new; end if;
  if not exists (select 1 from ks_answers a where a.room_id = new.room_id) then return new; end if;
  perform mps_teacher_round_avatar(new.room_id, jsonb_build_array(
    (select jsonb_agg('mps_knowledgestack_' || x) from unnest(k) x),
    (select jsonb_agg('mps_knowledgestack_' || x || '_gold') from unnest(k) x)));
  return new;
end;
$$;

revoke all on function ks_teacher_end_avatar() from public, anon, authenticated;

drop trigger if exists ks_boards_teacher_avatar on ks_boards;
create trigger ks_boards_teacher_avatar
  after update of phase on ks_boards
  for each row execute function ks_teacher_end_avatar();


-- ─────────────────────────────────────────────────────────────
-- Kingdoms of Mathoria
-- ─────────────────────────────────────────────────────────────
create or replace function clash_teacher_end_avatar()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.winner_team is null or new.winner_team is not distinct from old.winner_team then return new; end if;
  if not exists (select 1 from clash_players cp
                   join skill_participants sp on sp.id = cp.participant_id
                  where sp.room_id = new.room_id) then return new; end if;
  perform mps_teacher_round_avatar(new.room_id, jsonb_build_array(
    (select jsonb_agg('mps_clash-of-math_' || x)
       from unnest(array['red','blue','green','yellow','lila','tuerkis','magenta','rosa']) x)));
  return new;
end;
$$;

revoke all on function clash_teacher_end_avatar() from public, anon, authenticated;

drop trigger if exists clash_boards_teacher_avatar on clash_boards;
create trigger clash_boards_teacher_avatar
  after update of winner_team on clash_boards
  for each row execute function clash_teacher_end_avatar();


-- ─────────────────────────────────────────────────────────────
-- Myth of Wordisland (Teamspiel)
-- ─────────────────────────────────────────────────────────────
create or replace function wi_teacher_end_avatar()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  c text[] := array['red','blue','green','yellow','lila','tuerkis','rosa','magenta'];
begin
  if new.winner_team is null or new.winner_team is not distinct from old.winner_team then return new; end if;
  if not exists (select 1 from wi_players wp where wp.room_id = new.room_id) then return new; end if;
  perform mps_teacher_round_avatar(new.room_id, jsonb_build_array(
    (select jsonb_agg('mps_wordisland_' || x || '_1') from unnest(c) x),
    (select jsonb_agg('mps_wordisland_' || x || '_4') from unnest(c) x),
    (select jsonb_agg('mps_wordisland_' || x || '_4_gold') from unnest(c) x)));
  return new;
end;
$$;

revoke all on function wi_teacher_end_avatar() from public, anon, authenticated;

drop trigger if exists wi_boards_teacher_avatar on wi_boards;
create trigger wi_boards_teacher_avatar
  after update of winner_team on wi_boards
  for each row execute function wi_teacher_end_avatar();


-- ─────────────────────────────────────────────────────────────
-- How to Fachbegriffe, Kistenturm
-- ─────────────────────────────────────────────────────────────
create or replace function dd_storm_teacher_end_avatar()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.phase <> 'ended' or old.phase = 'ended' then return new; end if;
  if not exists (select 1 from dd_storm_players pl where pl.room_id = new.room_id) then return new; end if;
  perform mps_teacher_round_avatar(new.room_id, jsonb_build_array(
    (select jsonb_agg('mps_derby_kt_' || x)
       from unnest(array['astro','lama','lauch','gameboy','popcorn','ghost']) x)));
  return new;
end;
$$;

revoke all on function dd_storm_teacher_end_avatar() from public, anon, authenticated;

drop trigger if exists dd_storm_boards_teacher_avatar on dd_storm_boards;
create trigger dd_storm_boards_teacher_avatar
  after update of phase on dd_storm_boards
  for each row execute function dd_storm_teacher_end_avatar();


-- ─────────────────────────────────────────────────────────────
-- Nebeltal, „Gemeinsam spielen“: Lehrkraft wie die Kinder
-- ─────────────────────────────────────────────────────────────
create or replace function nt_teacher_round_end_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.phase <> 'ended' or old.phase = 'ended' or new.run < 1 then return new; end if;
  if not exists (select 1 from nt_players pl where pl.room_id = new.room_id and pl.run = new.run) then return new; end if;
  insert into mps_avatar_unlocks (user_id, avatar_id)
  select x.u, a
    from (select r.owner_id u from skill_rooms r where r.id = new.room_id
          union
          select t.user_id from skill_room_teachers t where t.room_id = new.room_id) x
    join profiles p on p.id = x.u
   cross join unnest(nt_avatar_ids('mp') || nt_avatar_ids(nt_level_what(new.level))) a
  on conflict (user_id, avatar_id) do nothing;
  return new;
end;
$$;

revoke all on function nt_teacher_round_end_avatars() from public, anon, authenticated;

drop trigger if exists nt_rounds_teacher_avatars on nt_rounds;
create trigger nt_rounds_teacher_avatars
  after update of phase on nt_rounds
  for each row execute function nt_teacher_round_end_avatars();


-- ─────────────────────────────────────────────────────────────
-- mps_my_avatars: Volladmin bekommt all = true
-- ─────────────────────────────────────────────────────────────
create or replace function mps_my_avatars()
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('ok', auth.uid() is not null,
    'all', coalesce((select p.is_superadmin from profiles p where p.id = auth.uid()), false),
    'avatars',
    coalesce((select jsonb_agg(jsonb_build_object('id', avatar_id, 'at', unlocked_at)
                               order by unlocked_at)
                from mps_avatar_unlocks where user_id = auth.uid()), '[]'::jsonb));
$$;

revoke all on function mps_my_avatars() from public;
grant execute on function mps_my_avatars() to authenticated;
