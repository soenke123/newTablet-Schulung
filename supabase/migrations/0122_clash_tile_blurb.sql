-- ══════════════════════════════════════════════════════════════
-- Migration 0122 — Der Kacheltext von „Kingdoms of Mathoria"
-- ══════════════════════════════════════════════════════════════
-- Der Satz aus 0095 beschrieb den Stand von damals: „Teams erobern
-- gemeinsam ein Königreich: richtige Kopfrechenaufgaben nehmen ein
-- Nachbarfeld eines anderen Reichs ein." Seither sind die
-- Aufgabenarten von einer (Addition bis 100) auf fünf Oberkategorien
-- gewachsen (0109 Pool, 0114 Zahlensysteme, 0115 Terme, 0118
-- Grundrechenarten, 0119 Analysis) — „Kopfrechenaufgaben" ist damit
-- nicht mehr falsch, aber es sagt einer Lehrkraft der Oberstufe, dass
-- hier nichts für sie liegt. Genau das Gegenteil stimmt.
--
-- Drei Dinge soll die Kachel jetzt sagen, und zwar in dieser
-- Reihenfolge (sie ist die Reihenfolge der Fragen, die jemand hat):
--   (1) Wie wird gespielt — bis zu acht Teams, ein Königreich.
--   (2) Wie gewinnt man — schneller im Kopf sein, nicht mehr wissen.
--   (3) Was steht drin — mehrere Jahrgänge, von Bruchrechnung bis
--       Analysis, dazu die Zahlensysteme der Informatik.
--
-- ⚠️ EIN Satzpaar und nicht mehr. Die Kachel ist die REDUZIERTE
-- Ansicht; die ausführliche Fassung steht im Schaufenster und damit
-- im ausgelieferten Frontend (MPSkills/preview/clash-of-math.js,
-- Feld `blurb` des Drehbuchs) — dort, wo auch das laufende Bild dazu
-- steht. Beides hier zu sammeln hieße, denselben Text an zwei Orten
-- zu pflegen, von denen einer keine Absätze kann.
--
-- `subject` bleibt 'Mathematik', obwohl die Zahlensysteme aus der
-- Informatik kommen: das Fach ordnet den ABSCHNITT auf der Landing
-- (0089), und der Skill gehört in den mathematischen. Eine zweite
-- Zuordnung kennt die Registry nicht und braucht sie auch nicht —
-- der Satz sagt es.
--
-- Klassisches Upsert wie 0095 auf dieselbe Zeile. Kein DROP
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('clash-of-math', 'Kingdoms of Mathoria',
   'Bis zu acht Teams erobern ein Königreich: Wer im Kopf schneller rechnet, nimmt das Nachbarfeld. Der Aufgabenpool reicht über mehrere Jahrgänge — Bruchrechnung, Terme, Analysis und die Zahlensysteme der Informatik.',
   '⚔️', 'clash-of-math', 'Mathematik', true,
   '{}'::jsonb, true, 50)
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
-- max_participants/max_rooms bewusst NICHT im do-update (0078-Regel):
-- eine von Hand hochgesetzte Obergrenze soll ein erneuter Lauf nicht
-- zurückdrehen.
