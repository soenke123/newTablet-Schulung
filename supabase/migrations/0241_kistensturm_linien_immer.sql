-- 0241 — Definitions Derby, Kistensturm: Item-Linien gelten immer.
--
-- Bisher zählte jede Linie je Team nur einmal (line_max = höchste je
-- erreichte Linie). Sönke 30.10.2026: „Die Linie gilt immer!“ — wer Kisten
-- verliert (Möwe, Sturm, Bus, Boom, Eis, Kuddelmuddel) und die Linie
-- danach wieder überquert, bekommt wieder ein Item.
--
-- Umsetzung: line_max ist jetzt „Linie, über der der Turm gerade steht“.
-- Sinkt die Höhe, sinkt line_max per Trigger mit (egal, welche Funktion
-- die Höhe ändert). dd_storm_award bleibt unverändert: es vergibt für
-- jede Linie zwischen line_max und der neuen Höhe ein Item (höchstens 2
-- auf Vorrat). Wer genau auf einer Linie landet, steht noch „über“ ihr.

create or replace function dd_storm_teams_relevel()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
declare
  v_b   dd_storm_boards;
  v_div int;
begin
  if new.height < old.height then
    select * into v_b from dd_storm_boards where room_id = new.room_id;
    if found and v_b.goal > 0 then
      v_div := case when v_b.items_often then 10 else 5 end;
      new.line_max := least(new.line_max, greatest(0, floor(new.height * v_div / v_b.goal)::int));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function dd_storm_teams_relevel() from public, anon, authenticated;

drop trigger if exists dd_storm_teams_relevel on dd_storm_teams;
create trigger dd_storm_teams_relevel
  before update of height on dd_storm_teams
  for each row execute function dd_storm_teams_relevel();
