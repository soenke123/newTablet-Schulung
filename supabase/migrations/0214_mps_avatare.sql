-- ══════════════════════════════════════════════════════════════
-- Migration 0214 — Profilbilder aus MPSkills
-- ══════════════════════════════════════════════════════════════
-- Bisher kamen Profilbilder nur aus dem GameHub (Spielstand im
-- shopData). MPSkills-Skills schalten jetzt eigene Bilder frei,
-- Katalog in avatars.js (MPS_GROUPS / MPS_CATALOG). Jeder Skill hat
-- seine eigene Regel; die, die der Server entscheiden muss, landen
-- hier in mps_avatar_unlocks.
--
-- Erste Regel — Kingdoms of Mathoria: Wer im Sieger-Team spielt,
-- bekommt das Bild seines Volkes (mps_clash-of-math_<farbe>).
--   - nur angemeldete Teilnehmer (skill_participants.user_id)
--   - PvE: nur wenn die Klasse gewinnt, nicht der Computer (ai_slot)
--   - kein Sieger / neutral (-1) → nichts
-- Ein Trigger auf clash_boards.winner_team statt Code in jeder der
-- vielen Stellen, die winner_team setzen (0093 … 0127).
--
-- Löschen: FK auf profiles mit on delete cascade — account_reset_content
-- (0209) räumt die Zeilen damit automatisch mit ab.
-- ══════════════════════════════════════════════════════════════

create table if not exists mps_avatar_unlocks (
  user_id     uuid not null references profiles(id) on delete cascade,
  avatar_id   text not null check (char_length(avatar_id) between 1 and 64),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, avatar_id)
);

comment on table mps_avatar_unlocks is
  'Freigeschaltete MPSkills-Profilbilder je Konto (0214). Ids wie in avatars.js. '
  'Geschrieben nur vom Server (Trigger je Skill), gelesen über mps_my_avatars().';

alter table mps_avatar_unlocks enable row level security;
grant select, insert, update, delete on mps_avatar_unlocks to service_role;


-- ─────────────────────────────────────────────────────────────
-- mps_my_avatars — eigene Freischaltungen für den Picker
-- ─────────────────────────────────────────────────────────────
create or replace function mps_my_avatars()
  returns jsonb
  security definer
  set search_path = public
  language sql
  stable
as $$
  select jsonb_build_object('ok', auth.uid() is not null, 'avatars',
    coalesce((select jsonb_agg(jsonb_build_object('id', avatar_id, 'at', unlocked_at)
                               order by unlocked_at)
                from mps_avatar_unlocks where user_id = auth.uid()), '[]'::jsonb));
$$;

revoke all on function mps_my_avatars() from public;
grant execute on function mps_my_avatars() to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Kingdoms of Mathoria: Sieger-Team bekommt sein Volk
-- ─────────────────────────────────────────────────────────────
-- Volk-Index 0..7 wie FACTION_UNIT in tools/clash-of-math/tool.js:
-- rot, blau, grün, gelb, lila, türkis, magenta, rosa.
create or replace function clash_grant_winner_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_faction int;
  v_key     text;
begin
  if new.winner_team is null or new.winner_team < 0 then return new; end if;
  if new.winner_team is not distinct from old.winner_team then return new; end if;
  if new.ai_slot is not null and new.winner_team = new.ai_slot then return new; end if;

  v_faction := (new.factions ->> new.winner_team)::int;
  v_key := (array['red','blue','green','yellow','lila','tuerkis','magenta','rosa'])[v_faction + 1];
  if v_key is null then return new; end if;

  insert into mps_avatar_unlocks (user_id, avatar_id)
  select distinct sp.user_id, 'mps_clash-of-math_' || v_key
    from clash_players cp
    join skill_participants sp on sp.id = cp.participant_id
    join profiles p on p.id = sp.user_id
   where sp.room_id = new.room_id
     and cp.team_index = new.winner_team
  on conflict (user_id, avatar_id) do nothing;

  return new;
end;
$$;

revoke all on function clash_grant_winner_avatars() from public;

drop trigger if exists clash_boards_winner_avatars on clash_boards;
create trigger clash_boards_winner_avatars
  after update of winner_team on clash_boards
  for each row execute function clash_grant_winner_avatars();
