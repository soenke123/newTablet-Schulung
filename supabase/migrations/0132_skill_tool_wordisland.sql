-- ══════════════════════════════════════════════════════════════
-- Migration 0132 — Myth of Wordisland in der Registry
-- ══════════════════════════════════════════════════════════════
-- Sechster Skill und der erste im Fach „Englisch" (die Spalte gibt
-- es seit 0089; ein Fach ist dort eine Beschriftung und keine
-- Entität, also kostet ein neues nichts).
--
-- sort_order 60 stellt den neuen Abschnitt hinter „Informatik" und
-- „Mathematik" (beide 50) — die Reihenfolge der Abschnitte folgt
-- dem kleinsten sort_order darin.
--
-- ── limits bleibt leer ────────────────────────────────────────
-- Wordisland spricht die generische Inhaltsschicht (0080/0086) nie
-- an: keine Beiträge, keine Zustimmung, keine Gruppen. Was es
-- braucht, steht in wi_* und vocab_* (0130/0131). Grenzen für
-- etwas zu setzen, das nicht stattfindet, wäre eine Regel ohne
-- Fall — dieselbe Überlegung wie bei NeuroLab (0089).
--
-- Auch kein `phases`: die Phasen dieses Spiels stehen in
-- wi_boards.phase und werden von wi_room_start/_end geschaltet,
-- nicht von skill_room_set_state. Ein zweiter Phasenbegriff im
-- selben Raum wäre eine zweite Wahrheit.
--
-- Kein DROP — Idempotenz per `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('wordisland', 'Myth of Wordisland',
   'Zwei bis sechs Völker landen an einer vernebelten Insel: Jede gekonnte Vokabel lüftet ein Feld, eine Serie lässt euch selbst zeigen wohin — und in den Ruinen der Inselmitte liegt, wofür sich der Streit lohnt.',
   '🏝️', 'wordisland', 'Englisch', true,
   '{}'::jsonb, true, 60)
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
-- max_participants/max_rooms wie in 0078/0089/0092/0129 bewusst NICHT
-- im do-update: eine Obergrenze, die jemand von Hand hochgesetzt hat,
-- soll ein erneuter Lauf dieser Migration nicht zurückdrehen.
