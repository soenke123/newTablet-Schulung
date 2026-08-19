-- ══════════════════════════════════════════════════════════════
-- Migration 0089 — Fächer im Sortiment + NeuroLab in der Registry
-- ══════════════════════════════════════════════════════════════
-- Zwei Dinge, die zusammengehören: der zweite Skill kommt dazu, und
-- er ist der erste, der nicht in jedem Fach zu gebrauchen ist. Eine
-- Wortwolke passt in Deutsch, Politik und Biologie gleichermaßen;
-- ein Neuron zum Anfassen gehört in den Informatikunterricht. Solange
-- alles in einem Gitter stand, war das keine Frage — mit dem dritten
-- Skill wird es eine.
--
-- ── Warum eine Spalte und keine Tabelle ───────────────────────
-- Ein Fach ist hier eine ÜBERSCHRIFT und keine Entität: es hat keine
-- Eigenschaften, keine Rechte und nichts, was daran hinge. Eine
-- Tabelle `skill_subjects` mit Fremdschlüssel brächte einen Join in
-- jede Abfrage und eine zweite Stelle, an der etwas einzutragen ist,
-- bevor ein Skill sichtbar wird — für eine Zeichenkette, die auf
-- einer Kachelgruppe steht.
--
-- ── Und warum keine zweite Sortierspalte ──────────────────────
-- In welcher Reihenfolge die Abschnitte stehen, folgt aus dem
-- kleinsten sort_order darin (gerechnet im Frontend). Damit ordnet
-- die Zahl, die es schon gibt, beide Ebenen: die Abschnitte
-- untereinander und die Kacheln darin. Ein neues Fach nach vorn zu
-- holen heißt, seinem ersten Skill eine kleinere Zahl zu geben —
-- eine Angabe statt zweier, die auseinanderlaufen können.
--
-- ── NeuroLab ist ein Raum wie jeder andere ────────────────────
-- Der Skill ist nicht kooperativ: jede Person baut ihr eigenes Netz,
-- es gibt nichts zu teilen, keine Beiträge, keine Zustimmung. Er
-- bekommt trotzdem einen Raum — nicht wegen des Inhalts, sondern
-- wegen der TÜR. Ein Klassensatz Tablets kommt über Code und QR in
-- 30 Sekunden auf dieselbe Seite; ohne Raum bliebe „tippt mal
-- folgende Adresse ab". Der Raum trägt hier also den Weg hinein und
-- die Teilnehmerliste, sonst nichts.
--
-- Folgerichtig bleibt `limits` leer: die generische Inhaltsschicht
-- (0080/0086) wird von diesem Skill nie angesprochen — er schreibt
-- keinen Beitrag, kennt keine Gruppen und keine Phasen. Grenzen für
-- etwas zu setzen, das nicht stattfindet, wäre eine Regel ohne Fall.
--
-- Kein DROP — Idempotenz per `if not exists` und `on conflict`
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1) Das Fach am Skill
-- ─────────────────────────────────────────────────────────────
-- Vorgabe ist „Fächerübergreifend", und das ist die richtige
-- Annahme für alles, was hier bisher steht und künftig dazukommt:
-- ein Werkzeug, das eine Frage stellt und Antworten einsammelt, ist
-- an kein Fach gebunden. Wer eines baut, das es doch ist, trägt es
-- ein. Damit bekommen wordcloud und poll ihren Wert ohne ein
-- eigenes UPDATE — und ohne dass ein erneuter Lauf dieser Migration
-- eine Änderung von Hand wieder einkassiert.
alter table skill_tools
  add column if not exists subject text not null default 'Fächerübergreifend';

comment on column skill_tools.subject is
  'Überschrift der Kachelgruppe im Sortiment, z.B. „Informatik". Freitext und keine '
  'Fremdschlüssel-Beziehung: ein Fach ist hier eine Beschriftung, keine Entität. '
  'Die Reihenfolge der Abschnitte folgt aus dem kleinsten sort_order darin.';


-- ─────────────────────────────────────────────────────────────
-- 2) NeuroLab
-- ─────────────────────────────────────────────────────────────
-- folder <> id, und genau dafür gibt es die Spalte seit 0078: der
-- Ordner heißt NeuroLab (er kam so aus einem eigenen Repository),
-- die id ist ein Slug in Kleinbuchstaben wie überall sonst. Ihn
-- umzubenennen hieße, die Herkunft der Dateien zu verwischen, ohne
-- dass irgendetwas dadurch besser würde.
--
-- sort_order 30 stellt den Abschnitt „Informatik" hinter
-- „Fächerübergreifend" (10 und 20) — siehe Kopf.
insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('neurolab', 'NeuroLab',
   'Ein künstliches Neuron zum Anfassen: Gewichte und Schwelle einstellen, Eingaben durchrechnen, an Beispieldaten lernen lassen. Jede Person baut ihr eigenes Netz.',
   '🧠', 'NeuroLab', 'Informatik', true,
   '{}'::jsonb, true, 30)
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
-- max_participants/max_rooms wie in 0078 bewusst NICHT im do-update:
-- eine Obergrenze, die jemand von Hand hochgesetzt hat, soll ein
-- erneuter Lauf dieser Migration nicht zurückdrehen.
