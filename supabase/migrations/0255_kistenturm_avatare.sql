-- ══════════════════════════════════════════════════════════════
-- Migration 0255 — How to Fachbegriffe, Kistenturm: Teamfigur als Profilbild
-- ══════════════════════════════════════════════════════════════
-- Sönke 01.11.2026: „von den 6 Figuren aus Kistenturm Avatare, die man
-- bekommt, wenn man als Team gewonnen hat … das Gewinnerteam bekommt
-- sein Team als Avatarbild.“
--
-- Wie Kingdoms of Mathoria (0214): Trigger auf dd_storm_boards. Sobald
-- die Siegerliste winners steht (Ziel erreicht, Zeitende oder Beenden;
-- bei Gleichstand mehrere Teams, 0247), bekommt jedes angemeldete
-- Mitglied (skill_participants.user_id) eines Sieger-Teams das Bild
-- seiner Figur. Team t spielt Figur figs[t] (0244). Gäste ohne Konto
-- bekommen nichts.
--
-- Ids wie in avatars.js (MPS_CATALOG.mps_derby): 'mps_derby_kt_' || key,
-- key = Reihenfolge von DDFiguren.LIST in
-- MPSkills/tools/DefinitionsDerby/figuren.js (0 astro · 1 lama · 2 lauch ·
-- 3 gameboy · 4 popcorn · 5 ghost). Bilder (Kopf, aus dem SVG gerendert):
-- „avatare MPSkills/Definitions Derby/kt_<key>_avatar.png“.
--
-- Prüfstand: supabase/tests/0255_kistenturm_avatare.mjs
-- Kein DROP außer `drop trigger if exists`. Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

create or replace function dd_storm_grant_winner_avatars()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_ws int[];
begin
  if new.phase <> 'ended' then return new; end if;
  v_ws := coalesce(new.winners, case when new.winner_team is not null then array[new.winner_team] end);
  if v_ws is null or cardinality(v_ws) = 0 then return new; end if;
  if v_ws is not distinct from coalesce(old.winners, case when old.winner_team is not null then array[old.winner_team] end)
     and old.phase = 'ended' then
    return new;
  end if;

  insert into mps_avatar_unlocks (user_id, avatar_id)
  select distinct sp.user_id,
         'mps_derby_kt_' || (array['astro', 'lama', 'lauch', 'gameboy', 'popcorn', 'ghost'])[(new.figs ->> pl.team)::int + 1]
    from dd_storm_players pl
    join skill_participants sp on sp.id = pl.participant_id
    join profiles p on p.id = sp.user_id
   where pl.room_id = new.room_id
     and pl.team = any (v_ws)
     and (new.figs ->> pl.team) is not null
     and (new.figs ->> pl.team)::int between 0 and 5
  on conflict (user_id, avatar_id) do nothing;

  return new;
end;
$$;

revoke all on function dd_storm_grant_winner_avatars() from public, anon, authenticated;

drop trigger if exists dd_storm_boards_winner_avatars on dd_storm_boards;
create trigger dd_storm_boards_winner_avatars
  after update of winner_team, winners, phase on dd_storm_boards
  for each row execute function dd_storm_grant_winner_avatars();
