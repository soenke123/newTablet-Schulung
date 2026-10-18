-- ══════════════════════════════════════════════════════════════
-- Migration 0213 — Balance of Nature (neuer MPSkill, Beta)
-- ══════════════════════════════════════════════════════════════
-- Dreizehnter Skill: eine Ökosystem-Simulation auf einer Insel
-- (Zwerghirsch, Laufvogel, Inselwolf, Inseladler; mit Menschen
-- kommen Schafe, Hunde und Ratten dazu).
--
-- Eingerahmt wie SYNIR (tools/balance of nature/index.html, Ordner
-- mit Leerzeichen, weil er so aus seinem eigenen Repository kam).
-- Im Raum gibt es vier feste Szenarien; die Lehrkraft gibt sie frei
-- über skill_room_state.data.shared (z. B. [1, 3]) — dafür reicht
-- skill_room_set_state aus 0080, es braucht keine eigenen Tabellen
-- und keine eigenen Funktionen. Jedes Gerät rechnet seine Insel
-- selbst; auf dem Server liegt nur, welches Szenario gespielt werden
-- darf. Eigene Szenarien gibt es nicht.
--
-- Fach Biologie (neu), sort_order 70.
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('balance', 'Balance of Nature',
   'Eine Insel mit eigenem Ökosystem: Wölfe jagen Hirsche, Adler jagen Laufvögel, '
   'und irgendwann landen Menschen mit Schafen. Die Lehrkraft gibt Szenarien frei, '
   'jedes Tablet rechnet seine eigene Insel.',
   '🏝️', 'balance of nature', 'Biologie', true,
   '{"phases":1}'::jsonb, true, 70)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;
