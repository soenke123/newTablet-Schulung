-- ══════════════════════════════════════════════════════════════
-- Migration 0095 — Clash of Math heißt jetzt „Kingdoms of Mathoria"
-- ══════════════════════════════════════════════════════════════
-- Nur der ANZEIGENAME ändert sich. `id`/`folder` bleiben bewusst
-- 'clash-of-math': das ist der technische Schlüssel, an dem Ordner
-- (tools/clash-of-math/), tools.js-Registry, alle clash_*-RPC-Namen
-- und die Tabellen aus 0093/0094 hängen. Ihn mitzuziehen wäre eine
-- eigene, größere Aufräum-Migration (Ordner umbenennen, RPCs neu
-- anlegen, alte Räume nachziehen) — nicht Teil dieser Runde.
--
-- Klassisches Upsert wie in 0093 (on conflict do update auf dieselbe
-- Zeile) statt eines UPDATE-Statements — dieselbe Schreibweise bleibt
-- lesbar, falls id/folder hier irgendwann doch einmal mitziehen.
--
-- Kein DROP — Idempotenz per einfachem Upsert
-- (Regel: feedback_supabase_no_drop_statements).
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('clash-of-math', 'Kingdoms of Mathoria',
   'Teams erobern gemeinsam ein Königreich: richtige Kopfrechenaufgaben nehmen ein Nachbarfeld eines anderen Reichs ein.',
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
