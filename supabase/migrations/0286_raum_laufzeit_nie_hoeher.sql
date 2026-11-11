-- ══════════════════════════════════════════════════════════════
-- Migration 0286 — Frist eines Raums steigt nur noch über „Verlängern“
-- ══════════════════════════════════════════════════════════════
-- Sönke 11.11.2026: Alter Raum, noch 50 von 60 Tagen. Raum betreten →
-- wieder 60 Tage. 0285 war eingespielt.
--
-- Ursache: 0285 hat nur GENAU den Wert „now() + 30 days“ abgefangen,
-- den die Aktivitäts-Funktionen im Repository schreiben. In der
-- Datenbank lief aber offenbar noch eine ältere Fassung (0079/0084:
-- „now() + 60 days“) — die rutschte durch.
--
-- Jetzt ohne Raten am Wert: Ohne den Merker mps.room_extend (setzt nur
-- skill_room_extend) bleibt die Frist stehen, sobald das UPDATE
-- Aktivität ist (last_active_at ändert sich) oder sie erhöhen würde.
-- Senken ohne Aktivität (Ablauf von Hand, Tests) bleibt erlaubt.
-- Testräume (is_test) wachsen weiter mit, sie werden beim Öffnen
-- wiederverwendet.
--
-- Von Hand verlängern (SQL-Editor): vorher
--   select set_config('mps.room_extend', '1', false);
--
-- Zur Diagnose, welche Fassung skill_touch in der Datenbank hat:
--   select pg_get_functiondef('skill_touch(uuid)'::regprocedure);
--
-- Prüfstand: supabase/tests/0284_raum_laufzeit.mjs (Teil 4b)
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

create or replace function skill_room_lifetime()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  -- Aktivität erkennt man daran, dass last_active_at mitgeschrieben wird
  -- (skill_touch, Tür öffnen, Einstellungen, Gruppe umbenennen — in
  -- jeder Fassung). Dann bleibt die Frist, ob der geschriebene Wert
  -- höher (alt: +60 Tage) oder niedriger (+30 bei einem 90-Tage-Raum)
  -- wäre. Ohne Aktivität darf sie nur sinken.
  if coalesce(current_setting('mps.room_extend', true), '') <> '1'
     and (new.last_active_at is distinct from old.last_active_at
          or new.expires_at > old.expires_at) then
    if new.is_test then
      new.expires_at := greatest(old.expires_at, now() + make_interval(days => new.lifetime_days));
    else
      new.expires_at := old.expires_at;   -- ab Erstellung: nur „Verlängern“ schiebt die Frist
    end if;
  end if;
  return new;
end;
$$;

revoke all on function skill_room_lifetime() from public;
