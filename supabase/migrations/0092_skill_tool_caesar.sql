-- ══════════════════════════════════════════════════════════════
-- Migration 0092 — Cäsar-Scheibe in der Registry
-- ══════════════════════════════════════════════════════════════
-- Dritter Skill, zweiter im Fach „Informatik" (0089). Eine drehbare
-- Cäsar-Scheibe: äußerer Ring starr, inneres Rad drehen, Schlüssel
-- in der Mitte ablesen.
--
-- ── Die Migration ist EINE Zeile, und das ist die Nachricht ────
-- 0089 hat behauptet, ein neuer Skill sei ein Ordner mit zwei
-- Dateien, eine Zeile in tools.js und eine Zeile hier — an der
-- Inhaltsschicht, an den RPCs und an den beiden Raumseiten sei
-- nichts zu ändern. Das war beim zweiten Skill die Aussage eines
-- Tests; hier ist es die Wiederholung ohne Überraschung. Es gibt in
-- dieser Datei nichts außer dem insert.
--
-- ── Wieder ein Skill, der nichts teilt ────────────────────────
-- Wie NeuroLab: jede Person dreht ihre eigene Scheibe. Keine
-- Beiträge, keine Zustimmung, keine Phase, kein gemeinsamer
-- Zustand. Der Raum trägt allein die TÜR — Code und QR bringen
-- einen Klassensatz Tablets auf dieselbe Seite; ohne Raum bliebe
-- „tippt mal folgende Adresse ab".
--
-- Folgerichtig bleibt `limits` leer: die generische Inhaltsschicht
-- (0080/0086) wird von diesem Skill nie angesprochen. Grenzen für
-- etwas zu setzen, das nicht stattfindet, wäre eine Regel ohne Fall.
--
-- ── folder <> id, zum zweiten Mal ─────────────────────────────
-- Der Ordner heißt `Caesercode` — so hat er die Dateien bekommen,
-- mitsamt dem Dreher im Namen. Die id ist ein Slug in
-- Kleinbuchstaben wie überall sonst (`caesar`). Genau dafür gibt es
-- die folder-Spalte seit 0078: der Ordner darf umbenannt werden,
-- ohne dass ein bestehender Raum seine tool_id verliert — und
-- solange er es nicht ist, stimmt der Pfad trotzdem.
-- ⚠️ Wer ihn umbenennt, fasst DREI Stellen an: diese Spalte, den
-- Ordner selbst und die Konstante in MPSkills/showroom-preview.html
-- (dort steht der Wert von Hand, weil das Schaufenster ohne
-- Anmeldung läuft und die Registry nicht lesen kann).
--
-- sort_order 40 stellt sie in „Informatik" hinter NeuroLab (30).
--
-- Kein DROP — Idempotenz per `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('caesar', 'Cäsar-Scheibe',
   'Die älteste Verschlüsselung zum Anfassen: inneres Rad drehen, Schlüssel ablesen, Wörter Buchstabe für Buchstabe umsetzen. Jede Person dreht ihre eigene Scheibe.',
   '🔐', 'Caesercode', 'Informatik', true,
   '{}'::jsonb, true, 40)
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
-- max_participants/max_rooms wie in 0078/0089 bewusst NICHT im
-- do-update: eine Obergrenze, die jemand von Hand hochgesetzt hat,
-- soll ein erneuter Lauf dieser Migration nicht zurückdrehen.
