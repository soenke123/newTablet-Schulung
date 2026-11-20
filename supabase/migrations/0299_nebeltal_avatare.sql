-- ══════════════════════════════════════════════════════════════
-- 0299 — Nebeltal: Profilbilder (Sönke 20.11.2026)
-- ══════════════════════════════════════════════════════════════
-- „Wenn man Nebeltal gespielt hat, sollen die SuS auch Avatare
-- freigeschaltet bekommen. 5 Stück: alle 3 Pinguin-Arten, Pinguin
-- Main mit Schal und der 3D-Charakter.“
--
-- Ids wie in avatars.js (Gruppe mps_nebeltal, Ordner „avatare
-- MPSkills/Nebeltal/“). Entlang des Lernpfads:
--
--   was   wofür                                         Profilbild(er)
--   l13   Level 1, 2 oder 3 geschafft (Einstieg)        main (Pinguin Main mit Schal)
--   l5    Level 5 geschafft (Adelie/Zügel sortieren)    adelie, zuegel
--   l8    Level 8 (alle drei Arten, Esel kommt dazu)    esel
--   mp    eine Runde „Gemeinsam spielen“ mitgespielt    pinguin3d (die Figur aus dem Spiel)
--
-- Wege:
--   · Allein am Tablet: js/spiel.js / js/labor.js melden ein geschafftes
--     Level über die Brücke (tool.js) → nt_earn(p_token, p_level). Zählt
--     nur, wenn die Lehrkraft das Level freigegeben hat (data.levels) –
--     sonst könnte man sich die Bilder holen, ohne zu spielen.
--   · Gemeinsam: Trigger auf nt_rounds, sobald eine Runde endet – alle,
--     die in dieser Runde waren (nt_players.run), bekommen mp + das Level.
--   · Lehrkraft (Besitzerin/eingeladen) allein: nt_room_earn(p_code, p_level)
--     schreibt direkt auf ihr Konto.
--
-- Ohne Konto wird gemerkt, was geschafft ist (nt_earned je Teilnehmer,
-- geht mit dem Raum); meldet man sich später im Raum an (user_id wird
-- gesetzt), kommen die Bilder nach.
-- ══════════════════════════════════════════════════════════════

create table if not exists nt_earned (
  participant_id uuid not null references skill_participants(id) on delete cascade,
  room_id        uuid not null references skill_rooms(id) on delete cascade,
  what           text not null check (what in ('l13', 'l5', 'l8', 'mp')),
  at             timestamptz not null default now(),
  primary key (participant_id, what)
);

comment on table nt_earned is
  'Nebeltal: was ein Teilnehmer geschafft hat (für die Profilbilder, 0299). '
  'Nur gemerkt, damit eine spätere Anmeldung im Raum die Bilder nachholt.';

alter table nt_earned enable row level security;


-- was → Profilbild-Ids
create or replace function nt_avatar_ids(p_what text)
  returns text[]
  language sql
  immutable
as $$
  select case p_what
    when 'l13' then array['mps_nebeltal_main']
    when 'l5'  then array['mps_nebeltal_adelie', 'mps_nebeltal_zuegel']
    when 'l8'  then array['mps_nebeltal_esel']
    when 'mp'  then array['mps_nebeltal_pinguin3d']
    else '{}'::text[] end;
$$;

revoke all on function nt_avatar_ids(text) from public, anon, authenticated;

-- Level → was (andere Level bringen kein Bild)
create or replace function nt_level_what(p_level int)
  returns text
  language sql
  immutable
as $$
  select case when p_level between 1 and 3 then 'l13' when p_level = 5 then 'l5' when p_level = 8 then 'l8' end;
$$;

revoke all on function nt_level_what(int) from public, anon, authenticated;


-- Ein Teilnehmer hat etwas geschafft: merken + (mit Konto) freischalten. Liefert die NEUEN Bild-Ids.
create or replace function nt_grant(p_participant uuid, p_what text)
  returns text[]
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_p   skill_participants;
  v_new text[];
begin
  if p_what is null then return '{}'; end if;
  select * into v_p from skill_participants where id = p_participant;
  if v_p.id is null then return '{}'; end if;
  insert into nt_earned (participant_id, room_id, what) values (v_p.id, v_p.room_id, p_what)
  on conflict (participant_id, what) do nothing;
  if v_p.user_id is null or not exists (select 1 from profiles where id = v_p.user_id) then return '{}'; end if;
  with ins as (
    insert into mps_avatar_unlocks (user_id, avatar_id)
    select v_p.user_id, a from unnest(nt_avatar_ids(p_what)) a
    on conflict (user_id, avatar_id) do nothing
    returning avatar_id)
  select coalesce(array_agg(avatar_id), '{}') into v_new from ins;
  return v_new;
end;
$$;

revoke all on function nt_grant(uuid, text) from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Tablet allein: Level geschafft
-- ─────────────────────────────────────────────────────────────
create or replace function nt_earn(p_token text, p_level int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v      record;
  v_what text := nt_level_what(p_level);
  v_lv   jsonb;
begin
  select * into v from nt_part(p_token);
  if v.err is not null then return jsonb_build_object('ok', false, 'error', v.err); end if;
  if v_what is null then return jsonb_build_object('ok', true, 'new', '[]'::jsonb); end if;
  select data -> 'levels' into v_lv from skill_room_state where room_id = (v.room).id;
  if v_lv is null or jsonb_typeof(v_lv) <> 'array' or not (v_lv @> to_jsonb(p_level)) then
    return jsonb_build_object('ok', false, 'error', 'not_shared');
  end if;
  return jsonb_build_object('ok', true, 'new', to_jsonb(nt_grant((v.p).id, v_what)));
end;
$$;

revoke all on function nt_earn(text, int) from public;
grant execute on function nt_earn(text, int) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Lehrkraft allein: Level geschafft → aufs eigene Konto
-- ─────────────────────────────────────────────────────────────
create or replace function nt_room_earn(p_code text, p_level int)
  returns jsonb
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_room skill_rooms := nt_teacher_room(p_code);
  v_what text := nt_level_what(p_level);
  v_new  text[];
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if v_room.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_what is null or not exists (select 1 from profiles where id = auth.uid()) then
    return jsonb_build_object('ok', true, 'new', '[]'::jsonb);
  end if;
  with ins as (
    insert into mps_avatar_unlocks (user_id, avatar_id)
    select auth.uid(), a from unnest(nt_avatar_ids(v_what)) a
    on conflict (user_id, avatar_id) do nothing
    returning avatar_id)
  select coalesce(array_agg(avatar_id), '{}') into v_new from ins;
  return jsonb_build_object('ok', true, 'new', to_jsonb(v_new));
end;
$$;

revoke all on function nt_room_earn(text, int) from public;
grant execute on function nt_room_earn(text, int) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Gemeinsam: Runde zu Ende → alle, die mitgespielt haben
-- ─────────────────────────────────────────────────────────────
create or replace function nt_round_end_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  rec record;
begin
  if new.phase <> 'ended' or old.phase = 'ended' or new.run < 1 then return new; end if;
  for rec in select participant_id from nt_players where room_id = new.room_id and run = new.run loop
    perform nt_grant(rec.participant_id, 'mp');
    perform nt_grant(rec.participant_id, nt_level_what(new.level));
  end loop;
  return new;
end;
$$;

revoke all on function nt_round_end_avatars() from public, anon, authenticated;

drop trigger if exists nt_rounds_end_avatars on nt_rounds;
create trigger nt_rounds_end_avatars
  after update of phase on nt_rounds
  for each row execute function nt_round_end_avatars();


-- ─────────────────────────────────────────────────────────────
-- Später im Raum angemeldet: Geschafftes zählt nach
-- ─────────────────────────────────────────────────────────────
create or replace function nt_participant_login_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  if new.user_id is null or new.user_id is not distinct from old.user_id then return new; end if;
  if not exists (select 1 from profiles where id = new.user_id) then return new; end if;
  insert into mps_avatar_unlocks (user_id, avatar_id)
  select new.user_id, a
    from nt_earned e, unnest(nt_avatar_ids(e.what)) a
   where e.participant_id = new.id
  on conflict (user_id, avatar_id) do nothing;
  return new;
end;
$$;

revoke all on function nt_participant_login_avatars() from public, anon, authenticated;

drop trigger if exists nt_participant_login_avatars on skill_participants;
create trigger nt_participant_login_avatars
  after update of user_id on skill_participants
  for each row execute function nt_participant_login_avatars();
