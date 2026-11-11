-- ══════════════════════════════════════════════════════════════
-- Migration 0285 — Laufzeit eines Raums gilt ab Erstellung
-- ══════════════════════════════════════════════════════════════
-- Sönke 11.11.2026: „Die Laufzeit soll ab Erstellung gelten, nicht ab
-- der letzten Nutzung.“
--
-- 0284 hat die Aktivitäts-Stellen (skill_touch, skill_room_set_open,
-- skill_room_update — alle schreiben expires_at = now() + 30 days) im
-- Trigger skill_room_lifetime auf now() + lifetime_days umgebogen.
-- Jetzt fängt derselbe Trigger diesen Wert ab und lässt die Frist
-- stehen: Nutzung verlängert nichts mehr. Die Frist setzt nur noch
--   · skill_room_create   now() + lifetime_days   (0284)
--   · skill_room_extend   + p_days, höchstens 1 Jahr ab heute (0284)
--
-- Ausnahme Testräume (is_test): sie werden beim Öffnen wiederverwendet
-- (skill_room_create → skill_touch) und sollen dabei nicht abgelaufen
-- sein — für sie bleibt „ab letzter Nutzung“.
--
-- Bestehende Räume behalten ihre jetzige Frist und laufen ab da ohne
-- Verlängerung durch Nutzung ab.
--
-- Prüfstand: supabase/tests/0284_raum_laufzeit.mjs (Teil 4)
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

create or replace function skill_room_lifetime()
  returns trigger
  security definer
  set search_path = public
  language plpgsql
as $$
begin
  -- Genau der Wert, den die Aktivitäts-Stellen schreiben. Verlängern
  -- (skill_room_extend) setzt den Merker mps.room_extend.
  if new.expires_at = now() + interval '30 days'
     and coalesce(current_setting('mps.room_extend', true), '') <> '1' then
    if new.is_test then
      new.expires_at := greatest(old.expires_at, now() + make_interval(days => new.lifetime_days));
    else
      new.expires_at := old.expires_at;   -- ab Erstellung: Nutzung verlängert nicht
    end if;
  end if;
  return new;
end;
$$;

revoke all on function skill_room_lifetime() from public;

comment on column skill_rooms.lifetime_days is
  'Laufzeit in Tagen (0284/0285): so lange nach dem ANLEGEN bleibt der Raum (Nutzung verlängert '
  'nicht, nur skill_room_extend). Beim Anlegen gewählt (2/10/30/90/180), Vorgabe aus '
  'skill_tools.lifetime_days. Testräume: ab letzter Nutzung.';
