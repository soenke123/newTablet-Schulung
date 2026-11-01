-- ══════════════════════════════════════════════════════════════
-- Migration 0256 — Myth of Wordisland: Profilbilder freischalten
-- ══════════════════════════════════════════════════════════════
-- Sönke, 01.11.2026: Die Bilder lagen schon in „avatare MPSkills/
-- Wordisland/“ und standen (die Völker) im Katalog von avatars.js,
-- aber nichts hat sie je freigeschaltet. Die Regeln:
--
--   Völker (Teamspiel, Teams gegeneinander):
--     · erster Sieg mit einem Volk  → <farbe>_1  (kleine Figur)
--     · zweiter Sieg mit dem Volk   → <farbe>_4  (große Figur)
--     · zwei Siege mit dem Volk UND auf der eigenen Insel einmal
--       Level 5 erreicht (level_max = 5, die Krone)
--                                   → <farbe>_4_gold
--   Echsen (eigene Insel):
--     wie bei How to Fachbegriffe (0236): erreicht eine Echse eine
--     Form, gehört diese Form als Profilbild der Person — und alle
--     Formen davor auf ihrem Weg. Bilder gibt es nur für einige
--     Formen: Echse1 (Stufe 1), Echse2b (+ schlafend, Stufe 2 mit
--     Variante b), Echse4b/c/d, Echse4eswim (Stufe 4 mit Variante
--     b/c/d/e). Die Variante würfelt tool.js aus der id des Wortes
--     (neuesTier: hashKey = FNV-1a, v2 = VAR2[(h>>>8) % 3],
--     v3 = VAR3[(h>>>14) % 8]) — wi_echse_avatars rechnet genau das
--     nach. ⚠️ Ändert sich der Würfel in tool.js, passt diese
--     Funktion nicht mehr.
--
-- Nur mit Konto: Teilnehmer ohne user_id und Geräte-Inseln (token)
-- bekommen nichts. Meldet sich ein Kind nach dem Sieg im selben Raum
-- an (skill_participants.user_id), zählt der Sieg der laufenden
-- Runde nach.
--
-- Siege stehen in wi_team_wins (je Konto und Runde eine Zeile), weil
-- wi_boards nur die LETZTE Runde eines Raums kennt und der Raum mit
-- skill_cleanup geht — der Zähler muss beides überleben. Es steht
-- darin nur ein Rundenschlüssel (Raum-id + Start), kein Fremdschlüssel
-- auf den Raum. Gelöscht wird mit dem Konto (profiles … cascade) und
-- beim Zurücksetzen (account_reset_content, 0209, räumt jede Tabelle
-- mit Fremdschlüssel auf profiles).
--
-- Nachgetragen werden: Siege der Räume, die gerade auf „ended“ mit
-- Sieger stehen (ältere Runden kennt die Datenbank nicht mehr), und
-- alle Echsen der Konto-Inseln.
--
-- Prüfstand: supabase/tests/0256_wordisland_avatare.mjs
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Siege je Konto
-- ─────────────────────────────────────────────────────────────
create table if not exists wi_team_wins (
  user_id   uuid not null references profiles(id) on delete cascade,
  round_key text not null check (char_length(round_key) between 1 and 120),
  faction   int  not null check (faction between 0 and 7),
  won_at    timestamptz not null default now(),
  primary key (user_id, round_key)
);

comment on table wi_team_wins is
  'Siege im Wordisland-Teamspiel je Konto (0256), eine Zeile je Runde. round_key = Raum-id/Start '
  'der Runde, ohne Fremdschlüssel: der Zähler überlebt den Raum. Nur für die Profilbilder.';

alter table wi_team_wins enable row level security;


-- ─────────────────────────────────────────────────────────────
-- 2) Volk-Bilder eines Kontos nachziehen
-- ─────────────────────────────────────────────────────────────
-- Reihenfolge der Völker wie TEAMS in tools/wordisland/tool.js
-- (⚠️ nicht wie clash: 6 = rosa, 7 = magenta).
create or replace function wi_grant_crew_avatars(p_user uuid)
  returns void
  security definer
  set search_path = public
  language sql
as $$
  insert into mps_avatar_unlocks (user_id, avatar_id)
  select p_user, 'mps_wordisland_'
         || (array['red','blue','green','yellow','lila','tuerkis','rosa','magenta'])[w.faction + 1]
         || v.suf
    from (select faction, count(*) as n from wi_team_wins
           where user_id = p_user group by faction) w
   cross join (values ('_1', 1, false), ('_4', 2, false), ('_4_gold', 2, true)) v(suf, need, gold)
   where w.n >= v.need
     and (not v.gold or exists (select 1 from wi_solo_learners l
                                 where l.user_id = p_user and l.level_max >= 5))
     and exists (select 1 from profiles where id = p_user)
  on conflict (user_id, avatar_id) do nothing;
$$;

revoke all on function wi_grant_crew_avatars(uuid) from public;


-- ─────────────────────────────────────────────────────────────
-- 3) Sieg einer Runde
-- ─────────────────────────────────────────────────────────────
create or replace function wi_boards_winner_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_faction int;
  v_key     text;
  v_user    uuid;
begin
  if new.winner_team is null or new.winner_team < 0 then return new; end if;
  if new.winner_team is not distinct from old.winner_team then return new; end if;

  v_faction := (new.factions ->> new.winner_team)::int;
  if v_faction is null or v_faction not between 0 and 7 then return new; end if;
  v_key := new.room_id::text || '/' || coalesce(new.started_at, new.ended_at, now())::text;

  for v_user in
    insert into wi_team_wins (user_id, round_key, faction)
    select distinct sp.user_id, v_key, v_faction
      from wi_players wp
      join skill_participants sp on sp.id = wp.participant_id
      join profiles p on p.id = sp.user_id
     where wp.room_id = new.room_id
       and wp.team_index = new.winner_team
    on conflict (user_id, round_key) do nothing
    returning user_id
  loop
    perform wi_grant_crew_avatars(v_user);
  end loop;

  return new;
end;
$$;

revoke all on function wi_boards_winner_avatars() from public;

drop trigger if exists wi_boards_winner_avatars on wi_boards;
create trigger wi_boards_winner_avatars
  after update of winner_team on wi_boards
  for each row execute function wi_boards_winner_avatars();


-- Nach dem Sieg angemeldet: die laufende (beendete) Runde zählt nach.
create or replace function wi_participant_login_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.user_id is null or new.user_id is not distinct from old.user_id then return new; end if;

  insert into wi_team_wins (user_id, round_key, faction)
  select new.user_id,
         b.room_id::text || '/' || coalesce(b.started_at, b.ended_at)::text,
         (b.factions ->> b.winner_team)::int
    from wi_players wp
    join wi_boards b on b.room_id = wp.room_id
   where wp.participant_id = new.id
     and b.phase = 'ended'
     and b.winner_team = wp.team_index
     and coalesce(b.started_at, b.ended_at) is not null
     and (b.factions ->> b.winner_team)::int between 0 and 7
     and exists (select 1 from profiles where id = new.user_id)
  on conflict (user_id, round_key) do nothing;

  perform wi_grant_crew_avatars(new.user_id);
  return new;
end;
$$;

revoke all on function wi_participant_login_avatars() from public;

drop trigger if exists wi_participant_login_avatars on skill_participants;
create trigger wi_participant_login_avatars
  after update of user_id on skill_participants
  for each row execute function wi_participant_login_avatars();


-- Level 5 auf der eigenen Insel: Gold für Völker mit zwei Siegen.
create or replace function wi_learner_level_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.user_id is null or new.level_max < 5 then return new; end if;
  if tg_op = 'UPDATE' and old.level_max >= 5 and old.user_id is not distinct from new.user_id then
    return new;
  end if;
  perform wi_grant_crew_avatars(new.user_id);
  return new;
end;
$$;

revoke all on function wi_learner_level_avatars() from public;

drop trigger if exists wi_learner_level_avatars on wi_solo_learners;
create trigger wi_learner_level_avatars
  after insert or update of level_max, user_id on wi_solo_learners
  for each row execute function wi_learner_level_avatars();


-- ─────────────────────────────────────────────────────────────
-- 4) Echsen der eigenen Insel
-- ─────────────────────────────────────────────────────────────
-- Welche Profilbilder eine Echse bis Stufe p_stage hatte. p_item wie
-- String(id) in tool.js (die uuid des Wortes). dd_imul aus 0236.
create or replace function wi_echse_avatars(p_item text, p_stage int)
  returns text[]
  language plpgsql
  immutable
  parallel safe
  set search_path = public
as $$
declare
  h  bigint := 2166136261;
  i  int;
  v2 text;
  v3 text;
  r  text[] := '{}';
begin
  if p_stage is null or p_stage < 1 then return r; end if;
  for i in 1 .. length(p_item) loop
    h := h # ascii(substr(p_item, i, 1));
    h := dd_imul(h, 16777619);
  end loop;
  if h = 0 then h := 1; end if;
  v2 := (array['', 'a', 'b'])[((h >> 8) % 3)::int + 1];
  v3 := (array['a', 'a', 'b', 'b', 'c', 'c', 'd', 'e'])[((h >> 14) % 8)::int + 1];

  r := r || 'echse1'::text;
  if p_stage >= 2 and v2 = 'b' then r := r || array['echse2b', 'echse2b_snooze']; end if;
  if p_stage >= 4 and v3 in ('b', 'c', 'd') then r := r || ('echse4' || v3); end if;
  if p_stage >= 4 and v3 = 'e' then r := r || 'echse4e_swim'::text; end if;
  return r;
end;
$$;

revoke all on function wi_echse_avatars(text, int) from public;


create or replace function wi_progress_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from wi_solo_learners where id = new.learner_id;
  if v_user is null or not exists (select 1 from profiles where id = v_user) then return new; end if;

  insert into mps_avatar_unlocks (user_id, avatar_id)
  select distinct v_user, 'mps_wordisland_' || a
    from wi_solo_stages(new.learner_id, new.item_id) s
   cross join lateral unnest(wi_echse_avatars(s.item_id::text, s.stage)) a
  on conflict (user_id, avatar_id) do nothing;
  return new;
end;
$$;

revoke all on function wi_progress_avatars() from public;

drop trigger if exists wi_progress_avatars on wi_solo_progress;
create trigger wi_progress_avatars
  after insert or update of points on wi_solo_progress
  for each row execute function wi_progress_avatars();


-- ─────────────────────────────────────────────────────────────
-- 5) Nachtragen
-- ─────────────────────────────────────────────────────────────
insert into wi_team_wins (user_id, round_key, faction)
select distinct sp.user_id,
       b.room_id::text || '/' || coalesce(b.started_at, b.ended_at)::text,
       (b.factions ->> b.winner_team)::int
  from wi_boards b
  join wi_players wp on wp.room_id = b.room_id and wp.team_index = b.winner_team
  join skill_participants sp on sp.id = wp.participant_id
  join profiles p on p.id = sp.user_id
 where b.phase = 'ended'
   and b.winner_team is not null
   and coalesce(b.started_at, b.ended_at) is not null
   and (b.factions ->> b.winner_team)::int between 0 and 7
on conflict (user_id, round_key) do nothing;

select wi_grant_crew_avatars(u.user_id)
  from (select distinct user_id from wi_team_wins) u;

insert into mps_avatar_unlocks (user_id, avatar_id)
select distinct l.user_id, 'mps_wordisland_' || a
  from wi_solo_learners l
  join profiles p on p.id = l.user_id
 cross join lateral wi_solo_stages(l.id) s
 cross join lateral unnest(wi_echse_avatars(s.item_id::text, s.stage)) a
on conflict (user_id, avatar_id) do nothing;
