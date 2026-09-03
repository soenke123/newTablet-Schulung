-- ══════════════════════════════════════════════════════════════
-- Migration 0129 — Wild Clusters in der Registry
-- ══════════════════════════════════════════════════════════════
-- Vierter Skill im Fach „Informatik" (0089). Eine Top-Down-Welt mit
-- Tieren, die niemand benennt: sichtbar ist nur Bewegung, und die
-- Klasse entscheidet, wer zusammengehört. Unüberwachtes Lernen zum
-- Anfassen — Clustering, bevor das Wort fällt.
--
-- ── Wieder nur ein insert, aber diesmal mit Zustand ───────────
-- NeuroLab (0089) und die Cäsar-Scheibe (0092) teilen nichts: der
-- Raum trägt dort allein die Tür. Wild Clusters ist der erste
-- eingerahmte Skill, in dem der Raum wirklich etwas TUT — die
-- Lehrkraft schaltet die Phase, und das erreicht jedes Tablet.
--
-- Trotzdem braucht es keine Tabelle und keine RPC: beides steht seit
-- 0080 bereit (skill_room_state.phase + data, skill_room_entries).
-- Was hier eingetragen wird, sind die Regeln, nach denen die
-- generische Schicht das für diesen Skill auslegt.
--
-- ── limits, Feld für Feld ─────────────────────────────────────
--   phases: 3   skill_phase_count(...) begrenzt damit
--               skill_room_set_state. Die drei sind:
--                 1  Gruppieren   (Tag 1-5, verdeckte Sicht)
--                 2  Nachzügler   (Tag 6-10, fünf Fremde kommen)
--                 3  Auflösung    (die Lehrkraft deckt auf)
--               Was die Phase im Bild bedeutet, weiß nur das
--               Werkzeug; der Server zählt sie und hütet die Grenze.
--
--               In Phase 3 kommen zwei Schalter aus
--               skill_room_state.data dazu: `rw` deckt die Landschaft
--               auf, `ra` die Tiere. Beide fehlen anfangs, und die
--               Auflösung beginnt deshalb mit demselben Bild wie
--               Phase 2 — erst der Griff ans Steuerpult macht daraus
--               ein Ereignis. Zwei getrennte Schalter, weil „erst die
--               Welt, dann die Tiere" die spannendere Reihenfolge ist
--               als beides auf einmal.
--               (Achtung beim Schreiben: skill_room_set_state ersetzt
--               `data` als Ganzes. Das Werkzeug schickt deshalb immer
--               beide Schalter.)
--
--   max_entries: 1
--               Ein Eintrag je Person, und in ihm stehen ALLE Welten,
--               in denen sie gearbeitet hat (payload.w, Schlüssel ist
--               der Seed). Drei Einträge je Person wären dieselbe
--               Auskunft in drei Zeilen — und „was hat diese Person
--               gemacht" wäre eine Suche statt eines Blicks.
--
--   KEIN write_phases
--               Die Gruppierung ist Arbeitsmaterial und kein Beitrag,
--               der zum Schluss eingefroren wird. Wer in Phase 3 beim
--               Auflösen merkt, dass zwei Tiere doch zusammengehören,
--               darf sie zusammenschieben — genau das ist die
--               Erkenntnis, um die es in der Stunde geht.
--
--   KEIN text_field
--               skill_check_payload prüft dann nur die Größe (4 KB),
--               und mehr ist hier auch nicht zu prüfen: der payload
--               ist eine Liste von Kachelnummern. Der Schimpfwort-
--               filter hat an Zahlen nichts zu suchen.
--
--   worksheet_url (noch nicht gesetzt)
--               Kommt später als eigenes `update`, sobald das
--               Arbeitsblatt unter Dokumente/ liegt. Das Steuerpult
--               zeigt den Knopf nur, wenn hier eine Adresse steht —
--               deshalb kostet das Nachreichen keine Auslieferung.
--
-- ── folder = id, zur Abwechslung ──────────────────────────────
-- Der Ordner hieß `wild Clusters` (Leerzeichen, großes C) und wurde
-- mit dieser Stufe auf `wildclusters` umbenannt. Anders als bei
-- `Caesercode` und `NeuroLab` gab es hier nichts zu bewahren: der
-- Ordner stand in keinem Commit und in keiner Raumzeile. Ein
-- Leerzeichen im Pfad müsste in jeder iframe-Adresse und jedem
-- Stylesheet-Link kodiert werden — eine Fehlerquelle, die man genau
-- einmal vermeiden kann, nämlich jetzt.
--
-- sort_order 50 stellt ihn in „Informatik" hinter die Cäsar-Scheibe
-- (40).
--
-- Kein DROP — Idempotenz per `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('wildclusters', 'Wild Clusters',
   'Ein unbekanntes Ökosystem von oben: Tiere ohne Namen, nur ihre Bewegung über fünf Tage. Wer zusammengehört, entscheidet die Klasse — und am fünften Tag tauchen fünf Fremde auf.',
   '🐾', 'wildclusters', 'Informatik', true,
   '{"phases":3,"max_entries":1}'::jsonb, true, 50)
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
-- max_participants/max_rooms wie in 0078/0089/0092 bewusst NICHT im
-- do-update: eine Obergrenze, die jemand von Hand hochgesetzt hat,
-- soll ein erneuter Lauf dieser Migration nicht zurückdrehen.
--
-- ⚠️ `limits` steht dagegen SCHON im do-update — wer worksheet_url
-- später von Hand einträgt und danach diese Migration erneut laufen
-- lässt, verliert ihn. Das Arbeitsblatt gehört deshalb in eine eigene
-- Migration und nicht in einen Handgriff im Dashboard.
